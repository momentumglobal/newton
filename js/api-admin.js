// Schema/admin-console SharePoint API calls.
// Extracted from api.js by N-237b — single-consumer functions used only by
// os-admin.js (admin.html). Depends on getListColumns/getItems, defined in
// api.js (loads first, see script order).
// AppSettings (announcement/seasonal-effect) read+write moved out to
// js/api-home.js by N-238b — index.html calls the getters directly (home
// banner + seasonal-effect autoload) and does not need this file's other
// three, admin-only functions. os-admin.js still needs both files.

// { name, id, indexed }[] for just the requested internal column names.
async function getColumnIndexStatus(listName, columnNames) {
  const columns = await getListColumns(listName);
  return columns
    .filter(c => columnNames.includes(c.name))
    .map(c => ({ name: c.name, id: c.id, indexed: !!c.indexed }));
}

// N-174 (F-11a): per-list schema diff for the Data Health "Schema Check"
// panel. Iterates Object.keys(FIELD_ALIASES) DIRECTLY — not
// getMonitoredLists() — because DATA_HEALTH_EXCLUDED_LISTS is scoped to the
// row-count guard; a list opted out of row-count watching is not a reason
// to skip its schema check. FIELD_ALIASES stays un-exported (same reason as
// getMonitoredLists()); this is the one function besides that one allowed
// to read it directly.
//
// Expected set: CONFIG.LIST_FIELDS[list] where a projection entry exists
// (16 lists, "projected"); otherwise Object.keys(FIELD_ALIASES[list]) (the
// other 15). When that array is empty (9 lists registered as {} with no
// projection), no Graph call is made at all — nothing to check.
//
// "Unexpected" is only computed for projected lists: the 15 non-projected
// lists are read with fields($select=*), so there is no closed expected set
// to diff an extra column against.
//
// Failures are per-list and non-fatal — one broken list returns
// { list, error: true } and must not take out the panel, same discipline
// as getListItemCount()'s callers.
async function getSchemaDiffs() {
  const lists = Object.keys(FIELD_ALIASES).sort();
  return Promise.all(lists.map(async (list) => {
    const projected = Object.prototype.hasOwnProperty.call(CONFIG.LIST_FIELDS, list);
    const expectedRaw = projected ? CONFIG.LIST_FIELDS[list] : Object.keys(FIELD_ALIASES[list]);

    if (expectedRaw.length === 0) {
      return { list, projected, checked: false, expectedCount: 0, missing: [], unexpected: [] };
    }

    const expected = expectedRaw.map(schemaBaseColumnName);
    const ignore = CONFIG.SCHEMA_CHECK_IGNORE_COLUMNS || [];

    try {
      const columns = await getListColumns(list);
      const actual = columns.filter(c => !c.hidden).map(c => c.name);

      const missing = expected.filter(n => !actual.includes(n));
      const unexpected = projected
        ? actual.filter(n => !expected.includes(n) && !ignore.includes(n))
        : [];

      return { list, projected, checked: true, expectedCount: expected.length, missing, unexpected };
    } catch (e) {
      console.warn('Schema Check: column read failed for list "' + list + '"', e);
      return { list, projected, checked: true, error: true, expectedCount: expected.length, missing: [], unexpected: [] };
    }
  }));
}

// ── Admin list helpers ───────────────────────────────────────────────
async function getUserAssignments(projectId) {
  return getItems("UserAssignments",
    projectId ? `fields/ProjectID eq ${projectId}` : "");
}

// ── N-268 (DS-0): RoleHistory backfill ───────────────────────────────
// One role's SharePoint version history, oldest first, normalised to
// { versionId, modifiedAt, modifiedBy, stage }. The Step 0 probe (29 Sep
// 2026, role 12: 16 versions, oldest '1.0', Stage 'Planning') confirmed a
// per-version `?$expand=fields` GET returns Stage; it did not confirm the
// collection GET carries fields. So: use the collection's fields where
// present, and fall back to a per-version GET only for a version without
// Stage. Every call is a GET through graphRequest, so N-188 batches them.
// Stage is read under its internal name — Roles doesn't alias it.
async function getRoleVersions(roleId) {
  const base = `${listPath('Roles')}/${parseInt(roleId)}/versions`;
  const raw = [];
  let url = base;
  while (url) {
    const data = await graphRequest('GET', url);
    raw.push(...(data.value || []));
    url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(GRAPH, '') : null;
  }
  const full = await Promise.all(raw.map(v =>
    (v.fields && v.fields.Stage !== undefined)
      ? v
      : graphRequest('GET', `${base}/${encodeURIComponent(v.id)}?$expand=fields`).catch(e => {
          console.warn('RoleHistory backfill: version read failed', roleId, v.id, e);
          return v;
        })
  ));
  return full
    .map(v => ({
      versionId:  String(v.id),
      modifiedAt: v.lastModifiedDateTime,
      modifiedBy: (v.lastModifiedBy && v.lastModifiedBy.user && v.lastModifiedBy.user.email) || null,
      stage:      (v.fields && v.fields.Stage) || null,
    }))
    .sort((a, b) => new Date(a.modifiedAt) - new Date(b.modifiedAt));
}

// Whole RoleHistory list, every column — the backfill's skip rules need
// ChangedAt, OldValue, NewValue and Source per role.
async function getAllRoleHistory() {
  return getItems('RoleHistory');
}

// One backfilled row. createItem, never graphRequest('POST') — only the
// three write helpers invalidate the cache (Readme hard rule, N-176).
async function createRoleHistoryBackfillRow(roleId, row) {
  const src = CONFIG.ROLE_HISTORY_BACKFILL.source;
  return createItem('RoleHistory', {
    RoleIDLookupId: parseInt(roleId),
    Field:          'Stage',
    OldValue:       row.oldValue || '',
    NewValue:       row.newValue || '',
    ChangedBy:      row.changedBy || src,
    ChangedAt:      row.changedAt,
    Source:         src,
  });
}

// ── N-286 (SEC-6): People.Salary → PeoplePay migration ─────────────────
// People.Salary for every row (active, inactive, placeholders). Raw paged
// GET, deliberately NOT getItems(): a salary-bearing People projection must
// never land in either cache tier (People is tier-2 enrolled). The column
// list is checked first, so a deleted Salary column reports columnGone
// instead of a 400.
async function getPeopleSalariesForMigration() {
  const columns = await getListColumns('People');
  if (!columns.some(c => c.name === 'Salary')) return { columnGone: true, rows: [] };
  const rows = [];
  let url = `${listPath('People')}?$expand=fields($select=Title,Salary)`;
  while (url) {
    const data = await graphRequest('GET', url);
    rows.push(...(data.value || []).map(i => ({
      id: i.id,
      EmployeeName: i.fields && i.fields.Title,
      Salary: i.fields ? i.fields.Salary : undefined,
    })));
    url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(GRAPH, '') : null;
  }
  return { columnGone: false, rows };
}

// Writes plan.toCreate (planPeoplePayMigration, utils.js) in order through
// createItem (cache contract) and stops at the first failure. A re-run plans
// only what is still missing.
async function writePeoplePayMigration(plan, onProgress) {
  let written = 0;
  for (const row of plan.toCreate) {
    try {
      await createItem('PeoplePay', row);
      written++;
      if (typeof onProgress === 'function') onProgress(written, plan.toCreate.length);
    } catch (e) {
      console.warn('PeoplePay migration: write failed for PersonID ' + row.PersonID, e);
      return { written, failed: { row, message: e.message } };
    }
  }
  return { written, failed: null };
}
