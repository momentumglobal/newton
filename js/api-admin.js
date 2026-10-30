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

// ── Project Team backfill (N-361 / PT-1) ─────────────────────────────
// Assignments is read with $select=* (no LIST_FIELDS entry), so a missing new column does not
// show in Schema Check — this preflight is what the Data Health section trusts. A failed read
// is { ok: false }, never "missing".
async function getAssignmentTeamColumnStatus() {
  try {
    const columns = await getListColumns('Assignments');
    const names = columns.filter(c => !c.hidden).map(c => c.name);
    return { ok: true, missing: PT_ASSIGNMENT_COLUMNS.filter(n => !names.includes(n)) };
  } catch (e) {
    console.warn('Project Team backfill: Assignments column read failed', e);
    return { ok: false, missing: [] };
  }
}

// Everything the backfill plan and the reconciliation report need. Projects includes Completed
// ones (getProjects(false)) — historical assignments still point at them.
async function getBackfillInputs() {
  const [assignments, projects, userAssignments] = await Promise.all([
    getItems('Assignments'), getProjects(false), getUserAssignments(),
  ]);
  return { assignments, projects, userAssignments };
}

// The only writer of Assignments.ProjectID / UserEmail / IsLeadDM in N-361. One PATCH per row,
// one at a time (updateItem invalidates the list cache); a failed row is recorded and the rest
// carry on. ptPlanWrites refuses any patch carrying a key outside PT_ASSIGNMENT_COLUMNS.
async function applyAssignmentBackfill(planRows) {
  const { writes, refused } = ptPlanWrites(planRows);
  const out = { written: 0, failed: refused.slice() };
  for (const w of writes) {
    try {
      await updateItem('Assignments', w.id, w.patch);
      out.written++;
    } catch (e) {
      out.failed.push({ id: w.id, employee: w.employee, message: e && e.message ? e.message : String(e) });
    }
  }
  return out;
}

// ── UserAssignments: one row per user (N-371 / PT-11) ──────────────────
// Everything the one-row-per-user plan needs: every UserAssignments row (no filter) and the
// LeadershipAccess list.
async function getUserRowPlanInputs() {
  const [userAssignments, leadership] = await Promise.all([getUserAssignments(), getLeadershipAccess()]);
  return { userAssignments, leadership };
}

// The only writer of the N-371 migration. Per user: the survivor update first, then the deletes,
// one request at a time (updateItem / deleteItem invalidate the list cache). Never createItem - the
// auto-welcome flow fires on UserAssignments create. A failed update skips that user's deletes; any
// failure is recorded and the rest carry on. ptCheckUserRowBatch re-validates every batch.
async function writeUserRowCollapse(batches) {
  const out = { updated: 0, deleted: 0, failed: [] };
  for (const batch of (batches || [])) {
    try {
      ptCheckUserRowBatch(batch);
    } catch (e) {
      out.failed.push({ email: batch.email, id: '', message: e.message });
      continue;
    }
    let skipDeletes = false;
    for (const w of batch.writes) {
      if (w.kind === 'delete' && skipDeletes) continue;
      try {
        if (w.kind === 'update') { await updateItem('UserAssignments', w.id, w.patch); out.updated++; }
        else { await deleteItem('UserAssignments', w.id); out.deleted++; }
      } catch (e) {
        if (w.kind === 'update') skipDeletes = true;
        out.failed.push({ email: batch.email, id: w.id, message: e && e.message ? e.message : String(e) });
      }
    }
  }
  return out;
}

// ── LCI / Transformation -> Projects migration (N-363 / PT-3) ─────────
// Projects.ProjectType is a Choice column: a create with a value outside its choices fails per
// row, so Data Health checks the no-dashboard types exist first. No column, or a failed read, is
// { ok: false } (shown as Query error), never "missing".
async function getProjectTypeChoiceStatus() {
  try {
    const columns = await getListColumns('Projects');
    const col = columns.find(c => c.name === 'ProjectType');
    const choices = (col && col.choice && col.choice.choices) || [];
    return { ok: !!col, missing: CONFIG.PROJECT_TYPES.filter(isNoDashboardType).filter(t => !choices.includes(t)) };
  } catch (e) {
    console.warn('LCI migration: Projects.ProjectType read failed', e);
    return { ok: false, missing: [] };
  }
}

// N-219 / N-363: LCIProjectOwners (CustomerName -> CSDName) is a retired backup list, read only
// by the migration to carry each owner onto the new Projects row. If the list is gone, no owners.
async function getLCIProjectOwners() {
  try {
    return await getItems('LCIProjectOwners');
  } catch (e) {
    console.warn('LCIProjectOwners read failed - treating as no owners', e);
    return [];
  }
}

// Projects includes Completed ones (getProjects(false)): a customer with any Projects row is skipped.
async function getLciProjectMigrationInputs() {
  const [assignments, projects, owners] = await Promise.all([
    getItems('Assignments'), getProjects(false), getLCIProjectOwners(),
  ]);
  return { assignments, projects, owners };
}

// The only writer of the N-363 migration. One POST per project, one at a time (createItem
// invalidates the list cache); a failed row is recorded and the rest carry on. Existing Projects
// rows are never touched. ptPlanProjectWrites refuses any key outside PT_PROJECT_COLUMNS.
async function applyLciProjectMigration(planRows) {
  const { writes, refused } = ptPlanProjectWrites(planRows);
  const out = { created: 0, failed: refused.slice() };
  for (const w of writes) {
    try {
      await createItem('Projects', w.patch);
      out.created++;
    } catch (e) {
      out.failed.push({ label: w.label, message: e && e.message ? e.message : String(e) });
    }
  }
  return out;
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
