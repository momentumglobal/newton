// Schema/admin-console SharePoint API calls.
// Extracted from api.js by N-237b — single-consumer functions used only by
// os-admin.js (admin.html). Depends on getListColumns (api.js) and getItems
// (graph-client.js), both loading first (see script order).
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

// ── Project Team report (N-361 / PT-1) ───────────────────────────────
// Assignments is read with $select=* (no LIST_FIELDS entry), so a missing new column does not
// show in Schema Check — this preflight is what the Data Health section trusts. A failed read
// is { ok: false }, never "missing".
async function getAssignmentTeamColumnStatus() {
  try {
    const columns = await getListColumns('Assignments');
    const names = columns.filter(c => !c.hidden).map(c => c.name);
    return { ok: true, missing: PT_ASSIGNMENT_COLUMNS.filter(n => !names.includes(n)) };
  } catch (e) {
    console.warn('Project Team report: Assignments column read failed', e);
    return { ok: false, missing: [] };
  }
}

// Everything the reconciliation report needs. Projects includes Completed
// ones (getProjects(false)) — historical assignments still point at them.
async function getBackfillInputs() {
  const [assignments, projects, userAssignments] = await Promise.all([
    getItems('Assignments'), getProjects(false), getUserAssignments(),
  ]);
  return { assignments, projects, userAssignments };
}

// N-433 (PDP-1): everything the Identity (PDP) section needs — the WorkEmail backfill, the line
// manager suggestions and the integrity checks. People includes inactive rows (getPeople(false));
// Projects includes Completed ones. All cached reads.
async function getPdpIdentityInputs() {
  const [people, userAssignments, leadership, assignments, projects] = await Promise.all([
    getPeople(false), getUserAssignments(), getLeadershipAccess(), getItems('Assignments'), getProjects(false),
  ]);
  return { people, userAssignments, leadership, assignments, projects };
}

// The only writer of People.WorkEmail / People.ReportsTo from N-433. One PATCH per row, one at a
// time (updateItem invalidates the list cache); every patch is validated first by
// pdpPlanWrites -> pdpAssertIdentityPatch, and a failed row is recorded while the rest carry on.
async function writePdpIdentityPatches(planRows) {
  const { writes, refused } = pdpPlanWrites(planRows);
  const out = { written: 0, failed: refused.slice() };
  for (const w of writes) {
    try {
      await updateItem('People', w.id, w.patch);
      out.written++;
    } catch (e) {
      out.failed.push({ employee: w.employee, message: e && e.message ? e.message : String(e) });
    }
  }
  return out;
}

// N-373: the inputs for the Data Health Project Team integrity checks (ptCheckTeamIntegrity).
// Projects includes Completed ones; the check itself filters to active projects. Cached reads,
// all three lists are already read by neighbouring Data Health sections.
async function getTeamIntegrityInputs() {
  const [assignments, projects, roles] = await Promise.all([
    getItems('Assignments'), getProjects(false), getAllRoles(),
  ]);
  return { assignments, projects, roles };
}

// ── SLA targets (N-381 / DA-1) ────────────────────────────────────────
// Column preflight for the Data Health SLA targets section. SLATargets is read with a
// LIST_FIELDS projection, so an unknown or missing column makes the row read fail with a 400 -
// check the columns first. A list that cannot be read at all, or a failed read, is
// { ok: false } (shown as Query error), never "missing".
async function getSLATargetsColumnStatus() {
  try {
    const columns = await getListColumns(CONFIG.SLA.LIST);
    const names = columns.filter(c => !c.hidden).map(c => c.name);
    return { ok: true, missing: CONFIG.LIST_FIELDS.SLATargets.filter(n => n !== 'Title' && !names.includes(n)) };
  } catch (e) {
    console.warn('SLA targets: column read failed', e);
    return { ok: false, missing: [] };
  }
}

// The only writer of SLATargets in N-381. Create-only: slaSeedPlan() returns a row only for a
// project type that has no default row yet, so an existing (possibly edited) row is never
// touched and a second run creates nothing. `rows` = the caller's fresh getSLATargets() read.
// One POST at a time (createItem invalidates the list cache); a failed row is recorded and
// the rest carry on.
async function createSlaDefaultRows(rows) {
  const plan = slaSeedPlan(rows);
  const out = { created: 0, skipped: slaProjectTypes().length - plan.length, failed: [] };
  for (const fields of plan) {
    try {
      await createItem(CONFIG.SLA.LIST, fields);
      out.created++;
    } catch (e) {
      out.failed.push({ type: fields.ProjectType, message: e && e.message ? e.message : String(e) });
    }
  }
  return out;
}
