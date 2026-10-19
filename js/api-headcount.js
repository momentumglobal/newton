// js/api-headcount.js — RoleHeadcount reads/writes and the role-stage /
// placement-target checks (N-306/N-307/N-308; split out of api.js in N-347).
// Declarations only — nothing runs at load. Loads straight after
// diagnostics.js in every shell (diagnostics.js must stay directly after
// api.js). Runtime dependencies: getItems / getItem / createItem / updateItem /
// _cacheInvalidate (graph-client.js), updateRoleWithHistory / getPlacements /
// getRolesForProject (api.js), the pure headcount rules (headcount.js) and
// isoDate / spDateIn / runWithConcurrency (utils.js).

// ── Role headcount (N-306 / HC-1) ────────────────────────────────────
// A Role is the pipeline; each RoleHeadcount row is one hire slot. EVERY
// headcount write goes through createHeadcount / updateHeadcount /
// cancelHeadcount (N-307: + createHeadcountRows / cancelOpenHeadcount /
// restoreHeadcount), and each of them ends in syncRoleOpenDate() — the one
// place Roles.OpenDate is maintained (model rule 3: earliest headcount
// OpenDate). Nothing outside this file may createItem/updateItem/deleteItem
// 'RoleHeadcount' — tests/lint-headcount-writes.js fails the build.
// RoleID / ProjectID are plain Number columns: filter as fields/RoleID.
async function getHeadcountForRole(roleId) {
  return getItems('RoleHeadcount', `fields/RoleID eq ${parseInt(roleId)}`);
}
async function getHeadcountForProject(projectId) {
  return getItems('RoleHeadcount', `fields/ProjectID eq ${parseInt(projectId)}`);
}
async function getAllHeadcount() {
  return getItems('RoleHeadcount');
}

// fields must carry RoleID and ProjectID. Sequence (and the Title label
// derived from it) is assigned when absent; Status defaults to Open.
async function createHeadcount(fields) {
  const roleId = parseInt(fields.RoleID);
  let sequence = fields.Sequence;
  if (sequence === undefined || sequence === null) {
    sequence = nextHeadcountSequence(await getHeadcountForRole(roleId));
  }
  const created = await createItem('RoleHeadcount', {
    Title:  headcountLabel(sequence),
    Status: CONFIG.HEADCOUNT.STATUS_OPEN,
    ...fields,
    RoleID:   roleId,
    Sequence: sequence,
  });
  await syncRoleOpenDate(roleId);
  return created;
}

async function updateHeadcount(id, roleId, fields) {
  const result = await updateItem('RoleHeadcount', id, fields);
  await syncRoleOpenDate(roleId);
  return result;
}

// D-1: a single headcount can be cancelled. dayISO is 'YYYY-MM-DD'.
// Used from N-307; shipped with the rest of the CRUD set.
async function cancelHeadcount(id, roleId, dayISO) {
  return updateHeadcount(id, roleId, {
    Status:        CONFIG.HEADCOUNT.STATUS_CANCELLED,
    CancelledDate: isoDate(dayISO),
  });
}

// Model rule 3. Roles.OpenDate = earliest headcount OpenDate (cancelled
// included), as a day. Written only when it differs, through
// updateRoleWithHistory so a real change is audited. null clears the date.
// Never throws: the headcount write it follows has already succeeded, and
// any drift shows on Admin > Data Health (openDateDrift).
async function syncRoleOpenDate(roleId) {
  try {
    const [role, rows] = await Promise.all([getItem('Roles', roleId), getHeadcountForRole(roleId)]);
    const want = earliestHeadcountOpenDate(rows);
    const have = role.OpenDate ? spDateIn(role.OpenDate) : null;
    if (want === have) return { changed: false, openDate: want };
    await updateRoleWithHistory(roleId, { OpenDate: want ? isoDate(want) : null });
    return { changed: true, openDate: want };
  } catch (e) {
    console.warn('syncRoleOpenDate failed for role ' + roleId, e);
    return { changed: false, error: e };
  }
}

// Keeps every headcount's ProjectID on its role's project (rule 2) — the
// role form can move a role between projects. No OpenDate effect, so no
// sync call.
async function syncHeadcountProject(roleId, projectId) {
  const pid = parseInt(projectId);
  if (!Number.isInteger(pid)) return;
  const rows = await getHeadcountForRole(roleId);
  await Promise.all(rows
    .filter(hc => String(hc.ProjectID) !== String(pid))
    .map(hc => updateItem('RoleHeadcount', hc.id, { ProjectID: pid })));
}

// N-307: a role's headcount, the placements on it, and the D-5 counts.
async function getRoleHeadcountState(roleId) {
  const id = parseInt(roleId);
  const [rows, placements] = await Promise.all([getHeadcountForRole(id), getPlacements(id)]);
  const fillMap = headcountFillMap(placements);
  return { rows, placements, fillMap, counts: headcountCounts(rows, fillMap) };
}

// N-307: every placement's HeadcountID, $select-limited (same pattern as
// getRoleHistoryRoleIds) — the Roles page only needs which headcount are
// filled, never the placement detail.
async function getPlacementHeadcountIds() {
  return getItems('Placements', '', 'HeadcountID');
}

// N-307: `count` new headcount on one role (Add Role, + Add headcount).
// Sequential, numbered from nextHeadcountSequence() read once, then ONE
// syncRoleOpenDate(). `values` = { OpenDate, TargetHireDate, Backfill, Notes };
// undefined keys are not written. A failure part-way still syncs, then
// rethrows with err.created = how many rows landed.
async function createHeadcountRows(roleId, projectId, count, values = {}) {
  const id  = parseInt(roleId);
  const pid = parseInt(projectId);
  const fields = {};
  Object.keys(values || {}).forEach(k => { if (values[k] !== undefined) fields[k] = values[k]; });
  const n = clampHeadcountCount(count);
  const first = nextHeadcountSequence(await getHeadcountForRole(id));
  const created = [];
  try {
    for (let i = 0; i < n; i++) {
      const seq = first + i;
      created.push(await createItem('RoleHeadcount', {
        ...fields,
        Title:     headcountLabel(seq),
        Status:    CONFIG.HEADCOUNT.STATUS_OPEN,
        RoleID:    id,
        ProjectID: pid,
        Sequence:  seq,
      }));
    }
  } catch (e) {
    await syncRoleOpenDate(id);
    e.created = created.length;
    throw e;
  }
  await syncRoleOpenDate(id);
  return created;
}

// D-1 cascade: cancelling a pipeline cancels every OPEN headcount on it
// (filled ones are untouched). dayISO is 'YYYY-MM-DD'. One sync at the end,
// also when a write failed (the error is then rethrown).
async function cancelOpenHeadcount(roleId, dayISO) {
  const id = parseInt(roleId);
  const { rows, fillMap } = await getRoleHeadcountState(id);
  const open = rows.filter(hc => classifyHeadcount(hc, fillMap) === 'open');
  let failure = null;
  await runWithConcurrency(open, 4, async hc => {
    try {
      await updateItem('RoleHeadcount', hc.id, {
        Status:        CONFIG.HEADCOUNT.STATUS_CANCELLED,
        CancelledDate: isoDate(dayISO),
      });
    } catch (e) {
      failure = failure || e;
    }
  });
  await syncRoleOpenDate(id);
  if (failure) throw failure;
  return { cancelled: open.length };
}

// N-307 S-4: undo a cancel. Only offered for an unfilled headcount on a
// non-terminal pipeline (role-page.js).
async function restoreHeadcount(id, roleId) {
  return updateHeadcount(id, roleId, {
    Status:        CONFIG.HEADCOUNT.STATUS_OPEN,
    CancelledDate: null,
  });
}

// N-307: run before EVERY Roles.Stage write (inline dropdown, Command Bar,
// role form, mobile stage update). Reads the role and its headcount and
// applies roleStageChangeRule() (headcount.js). Read errors propagate — callers
// fail closed and write nothing.
async function checkRoleStageChange(roleId, toStage) {
  const [role, state] = await Promise.all([getItem('Roles', roleId), getRoleHeadcountState(roleId)]);
  return {
    ...roleStageChangeRule({ fromStage: role.Stage, toStage, counts: state.counts }),
    counts:    state.counts,
    fromStage: role.Stage,
  };
}

// N-308: everything the Headcount picker needs for one project — the
// project's roles (Talent Partner-scoped when tpEmail is given), its headcount
// (indexed ProjectID, rule 2) and every placement's HeadcountID ($select-
// limited, as on the Roles page). Grouped by placementHeadcountGroups().
async function getPlacementPickerData(projectId, tpEmail = null) {
  const pid = parseInt(projectId);
  const [roles, headcount, placements] = await Promise.all([
    getRolesForProject(pid, tpEmail),
    getHeadcountForProject(pid),
    getPlacementHeadcountIds(),
  ]);
  return { roles, headcount, placements };
}

// N-308 S-3: the authoritative read before a placement is saved. The role is
// taken from the headcount row, never from the form. Both lists are
// invalidated first: this check exists to catch a fill or cancel made since
// the form opened, so a cached read would defeat it (the write that follows
// invalidates them anyway). A missing headcount resolves { headcount: null };
// other errors propagate — callers fail closed and write nothing.
async function getPlacementTarget(headcountId) {
  _cacheInvalidate('RoleHeadcount');
  _cacheInvalidate('Placements');
  let headcount;
  try {
    headcount = await getItem('RoleHeadcount', parseInt(headcountId));
  } catch (e) {
    if (/not ?found|404/i.test(String(e && e.message))) return { headcount: null };
    throw e;
  }
  const roleId = Number(headcount.RoleID);
  const [role, state] = await Promise.all([getItem('Roles', roleId), getRoleHeadcountState(roleId)]);
  return { headcount, roleId, role, state };
}
