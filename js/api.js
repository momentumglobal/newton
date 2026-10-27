// js/api.js — Newton data layer: list-specific reads and writes, role
// resolution, role history. Graph transport, caching, FIELD_ALIASES and the
// generic CRUD helpers are in graph-client.js (loads straight before this
// file); RoleHeadcount reads/writes are in api-headcount.js (N-347).
 
// Moved from utils.js (N-237d) — single consumer (api-admin.js's schema
// check), this file only.
// CONFIG.LIST_FIELDS lists Graph READ-time property names, and lookup
// columns need both the base name and a 'LookupId' shadow name (see the
// comment on LIST_FIELDS in config.js). The columns endpoint only ever
// returns the base column — 'ProjectID', never 'ProjectIDLookupId' — so a
// literal name diff would report every lookup field as permanently
// missing. Strip the suffix before comparing.
function schemaBaseColumnName(fieldName) {
  return fieldName.endsWith('LookupId') ? fieldName.slice(0, -'LookupId'.length) : fieldName;
}

// ── Multi-TP helpers (TalentPartner column may hold 'a@x.com;b@x.com') ──
function tpList(val) {
  return String(val || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean);
}
function tpMatches(val, email) {
  return tpList(val).includes((email || '').trim().toLowerCase());
}
function tpDisplay(val, nameMap = {}) {
  const names = tpList(val).map(e => nameMap[e] || e);
  return names.length ? names.join(', ') : '—';
}

// N-241: shared by loadCurrencyForPlacement (forms-placement.js) and
// mobileLoadCurrencyForPlacement (mobile-pages.js) — identical fetch/shape
// logic, only the target DOM element differs, which stays with each caller.
async function getCurrencyForRole(roleId) {
  try {
    const role = await getItem('Roles', roleId);
    return currencyForRole(role);
  } catch (e) {
    return '';
  }
}

// ── Data Health (F-10 / N-092) ──────────────────────────────────────
// Row count only — id-only $select, same nextLink pagination as getItems.
// Deliberately NOT $count/ConsistencyLevel:eventual: that combination is
// inconsistently supported on SharePoint-backed list items in Graph v1.0.
// N-154: the caller renders a failure as an em-dash, which at a glance reads
// like a small number rather than "this did not run". With 29 lists watched
// instead of 14, a list name that no longer exists would hide there
// indefinitely — so failures are logged by name here.
async function getListItemCount(listName) {
  const items = await getItems(listName, "", "Id");
  // N-285: a denied restricted list comes back as [] — that is "no access",
  // not "zero rows". null is the caller's existing "count unavailable" value.
  if (wasListDenied(listName)) return null;
  return items.length;
}

// N-093 (F-2a): how many WeeklyActivity rows have no ProjectID. The column is
// written by forms-weekly.js:submitWeeklyForm but read by nothing in js/, so
// a blank on historical rows has never had a way to surface — while the
// Project Dashboard has been filtering on it server-side for some time. A
// non-zero count here means that filter is already silently dropping rows.
// id-only $select, same discipline as getListItemCount.
async function getWeeklyActivityNullProjectCount() {
  try {
    const items = await getItems("WeeklyActivity", "fields/ProjectID eq null", "Id");
    return { ok: true, count: items.length };
  } catch (e) {
    console.error("WeeklyActivity null-ProjectID probe rejected:", e);
    return { ok: false, count: null };
  }
}
// N-158: how many WeeklyActivity rows have no WeekEndingDate. This is the
// row set DATE_WINDOW_DEFAULT_WEEKS: 26 was silently dropping from the
// Activity list page — a server-side `ge` bound cannot match a null date.
// Both date-window defaults now sit at 0 (All time) so this can't happen
// today, but the count stays visible so a future bounded default doesn't
// reintroduce the drop unnoticed. Same id-only $select discipline as
// getWeeklyActivityNullProjectCount().
async function getWeeklyActivityNullWeekEndingCount() {
  try {
    const items = await getItems("WeeklyActivity", "fields/WeekEndingDate eq null", "Id");
    return { ok: true, count: items.length };
  } catch (e) {
    console.error("WeeklyActivity null-WeekEndingDate probe rejected:", e);
    return { ok: false, count: null };
  }
}
// Raw columnDefinition[] for a list — includes system columns; callers filter.
async function getListColumns(listName) {
  const data = await graphRequest("GET", listColumnsPath(listName));
  return data.value || [];
}
 
// ── Error telemetry write (N-172 / F-7a) ──────────────────────────
// A named wrapper rather than a raw createItem call in diagnostics.js, so
// the telemetry write is greppable and so N-173's Diagnostics reads land
// next to it. Does NOT swallow general failures: the caller owns the swallow,
// which keeps the reporter's failure path in exactly one place.
// N-285: the one exception is a 403. Under the Tier 2 lock (N-288) ordinary
// users can add to Diagnostics but not read it, and Graph's POST reads the new
// item back — so a 403 here is expected, not a fault. It resolves null (the
// write is best-effort) rather than rejecting into diagnostics.js's .catch,
// and the Diagnostics cache is invalidated as createItem would have.
async function createDiagnostic(fields) {
  try {
    return await createItem('Diagnostics', fields);
  } catch (e) {
    if (isListAccessDenied('Diagnostics', e)) {
      _cacheInvalidate('Diagnostics');
      return null;
    }
    throw e;
  }
}
// ── Error telemetry reads/acks (N-173 / F-7b) ──────────────────────
// Server-side filtered to Status = 'new' so acknowledged groups are never
// fetched, not merely hidden client-side. FIELD_ALIASES.Diagnostics is {},
// so 'Status' here is the same name Graph and os-admin.js both use.
async function getDiagnostics() {
  return getItems('Diagnostics', "fields/Status eq 'new'");
}
// One PATCH per row id in a group. updateItem already calls
// _cacheInvalidate('Diagnostics'), so the next getDiagnostics() read is
// fresh with no manual cache handling here.
async function acknowledgeDiagnosticGroup(ids) {
  await Promise.all(ids.map(id => updateItem('Diagnostics', id, { Status: 'acknowledged' })));
}
// ── WeeklyActivity anomaly acknowledgements (N-273) ────────────────
// Server-side filtered to Status = 'active', like getDiagnostics(): restored
// rows are history and are never fetched.
async function getAnomalyAcks() {
  return getItems('AnomalyAcks', "fields/Status eq 'active'");
}
// The row itself is built by the pure buildAnomalyAckFields (analytics.js);
// this only stamps who and when, and writes. createItem already calls
// _cacheInvalidate('AnomalyAcks').
async function acknowledgeAnomaly(ack) {
  const email = ((getCurrentUser() || {}).email || '').toLowerCase();
  return createItem('AnomalyAcks', buildAnomalyAckFields(ack, email, new Date().toISOString()));
}
// Restore = PATCH Status only. No delete: the row stays as history.
async function restoreAnomalyAcks(ids) {
  await Promise.all(ids.map(id => updateItem('AnomalyAcks', id, { Status: 'restored' })));
}
// ── Role creation history (N-100) ─────────────────────────────────
// Companion to N-099's updateRoleWithHistory: createItem('Roles', fields)
// has no "old" state to diff against, so this does not reuse
// _logRoleHistory. It writes one deliberate RoleHistory row so the Role
// History timeline (N-100) has a real first node instead of starting at
// the first edit. OldValue: '' is the signal the timeline UI uses to
// render this row as "Role created" rather than a transition.
// Fire-and-forget, same non-blocking shape as updateRoleWithHistory — a
// history-write failure must never block or fail the role save.
async function createRoleWithHistory(fields) {
  const result = await createItem('Roles', fields);
  if (result && result.id) {
    // N-100 QA fix (round 2): AWAITED — unlike updateRoleWithHistory's six
    // existing fire-and-forget call sites, the Roles-list "Timeline" link's
    // very first appearance depends on this row existing by the time
    // navigateTo('roles') re-renders the list right after this function
    // returns. Without awaiting, that GET raced the RoleHistory POST and
    // won almost every time (found in N-100 QA). A failed write still never
    // blocks or fails the role save — only a console warning, same
    // guarantee the fire-and-forget version gave.
    try {
      await createItem('RoleHistory', {
        RoleIDLookupId: parseInt(result.id),
        Field:          'Stage',
        OldValue:       '',
        NewValue:       fields.Stage || '',
        ChangedBy:      getCurrentUser().email,
        ChangedAt:      new Date().toISOString(),
      });
    } catch (e) {
      console.warn('RoleHistory: creation write failed', e);
    }
  }
  return result;
}
// ── WeeklyActivity verified create (N-315) ────────────────────────────
// The ONLY place a WeeklyActivity row is created (tests/lint-weeklyactivity-
// writes.js enforces it). Every writer — Log Activity, the bulk grid, mobile
// quick-log — goes through here, so:
//   1. a missing ProjectIDLookupId is derived from the role (mobile quick-log
//      never sends one). No resolvable project → throw, never write an orphan.
//   2. after the create, the stored ProjectID is checked; a drop is healed
//      with ONE PATCH and reported to Diagnostics with what was sent, what came
//      back and what is stored — the evidence N-315 did not have.
// A create failure propagates unchanged (optimisticWrite reverts + Retry).
// Verify/heal/report are best-effort and never fail a save that succeeded.
// `fields` is copied, never mutated: forms-weekly.js builds its pending row from it
// and reads fields.ProjectIDLookupId again for the hires prompt.
// Returns exactly what createItem returned (the bulk grid reads created.id).
async function createWeeklyActivity(fields) {
  const toSend = { ...fields };
  let projectId = positiveLookupId(toSend.ProjectIDLookupId);
  if (!projectId) {
    const roleId = positiveLookupId(toSend.RoleIDLookupId);
    const role = roleId ? await getItem('Roles', roleId) : null;
    projectId = projectIdForRole(role);
    if (!projectId) throw new Error('Could not find the project for this role — activity not saved.');
    toSend.ProjectIDLookupId = projectId;
  }
  const created = await createItem('WeeklyActivity', toSend);
  try {
    await _verifyWeeklyActivityProjectId(created, projectId, toSend.RoleIDLookupId);
  } catch (e) {
    console.warn('N-315: WeeklyActivity ProjectID check failed', e);
  }
  return created;
}
// Cheapest path first: the create response. Only if that does not show the
// id sent is the stored row re-read, so a response that simply omits lookup
// ids costs one GET and is NOT reported or "healed". A genuine drop gets one
// PATCH, one re-read, and one Diagnostics row.
async function _verifyWeeklyActivityProjectId(created, sentId, roleId) {
  if (!created || !created.id) return;
  const response = weeklyActivityResponseProjectId(created);
  if (response === sentId) return;
  const stored = positiveLookupId((await getItem('WeeklyActivity', created.id)).ProjectIDLookupId);
  if (stored === sentId) return;
  let heal;
  try {
    await updateItem('WeeklyActivity', created.id, { ProjectIDLookupId: sentId });
    const after = positiveLookupId((await getItem('WeeklyActivity', created.id)).ProjectIDLookupId);
    heal = after === sentId ? 'OK' : 'did not stick (now ' + (after === null ? 'blank' : after) + ')';
  } catch (e) {
    heal = 'PATCH failed: ' + (e && e.message);
  }
  const message = weeklyActivityProjectDropMessage({
    itemId: created.id, roleId: positiveLookupId(roleId), sent: sentId, response, stored, heal,
  });
  console.warn(message);
  // diagnostics.js loads after api.js; absent in the test harness.
  if (typeof reportError === 'function') reportError('integrity', message, '');
}
// ── Role history (N-099 / D-3a) ────────────────────────────────────────
// Drop-in replacement for `updateItem('Roles', roleId, fields)` at the six
// call sites that mutate an existing Role. Reads the pre-update Role,
// performs the real update exactly as updateItem always did, then fires
// the RoleHistory write in the background — never awaited, never allowed
// to block or fail the caller's save (same non-blocking shape as
// a fire-and-forget promise.catch(...) call).
async function updateRoleWithHistory(roleId, fields) {
  let oldRole = null;
  try {
    oldRole = await getItem('Roles', roleId);
  } catch (e) {
    console.warn('RoleHistory: could not read prior Roles state', e);
  }
  const result = await updateItem('Roles', roleId, fields);
  if (oldRole) {
    _logRoleHistory(oldRole, fields).catch(e =>
      console.warn('RoleHistory: write failed', e)
    );
  }
  return result;
}
// `newFields` uses raw SharePoint internal names for aliased Roles columns
// (Title, Currency) because it's the same object handed to updateItem().
// `oldRole` is normalised (RoleTitle, Location) because it came from
// getItem(). Resolving each written field through FIELD_ALIASES.Roles
// before comparing is load-bearing: skip it and every save would log a
// false "Title changed" row, since oldRole.Title is always undefined.
function _resolveRoleDisplayField(internalField) {
  const aliases = FIELD_ALIASES.Roles;
  return (aliases && aliases[internalField]) || internalField;
}
async function _logRoleHistory(oldRole, newFields) {
  const email     = getCurrentUser().email;
  const changedAt = new Date().toISOString(); // genuine instant — N-091 exempt
  const rows = Object.keys(newFields)
    .filter(internalField => newFields[internalField] !== undefined)
    .map(internalField => {
      const field    = _resolveRoleDisplayField(internalField);
      const oldValue = oldRole[field];
      const newValue = newFields[internalField];
      return { field, oldValue, newValue };
    })
    .filter(({ oldValue, newValue }) => String(oldValue ?? '') !== String(newValue ?? ''));
  await Promise.all(rows.map(({ field, oldValue, newValue }) =>
    createItem('RoleHistory', {
      RoleIDLookupId: parseInt(oldRole.id),
      Field:          field,
      OldValue:       oldValue !== undefined && oldValue !== null ? String(oldValue) : '',
      NewValue:       newValue !== undefined && newValue !== null ? String(newValue) : '',
      ChangedBy:      email,
      ChangedAt:      changedAt,
    })
  ));
}
// ── Role History reads (N-100) ────────────────────────────────────
// Full-row read for one role's timeline. RoleIDLookupId is the Graph
// filter name for the RoleID lookup column, same convention as every
// other RoleIDLookupId filter in this file.
// N-306: Stage values are read through normaliseRoleHistoryRows (headcount.js) —
// pre-N-306 rows say 'Hired', which reads back as 'Closed'. RoleHistory
// itself is never rewritten (headcount model rule 5).
async function getRoleHistory(roleId) {
  const rows = await getItems('RoleHistory', `fields/RoleIDLookupId eq ${parseInt(roleId)}`);
  return normaliseRoleHistoryRows(rows);
}
// Existence check across the WHOLE list, used only to decide which
// Roles-list rows get a "Timeline" action. $select-limited to the lookup
// column so this stays cheap regardless of list size — never loop
// getRoleHistory(id) per row to build this; that's the N+1 pattern
// getAllRoles/getRolesForUser already avoid elsewhere in this file.
async function getRoleHistoryRoleIds() {
  const rows = await getItems('RoleHistory', '', 'RoleIDLookupId');
  return new Set(rows.map(r => String(r.RoleIDLookupId)));
}
// N-276: every Stage row across the whole list, for survival TTF's
// Cancelled/On-hold censoring (analytics.js ttfClosedCensorTimes). One
// $select-limited read. Deliberately NO $filter on Field: it isn't indexed
// and getItems sends no HonorNonIndexedQueries header, so a filtered read
// would start failing once the list passes the threshold — filtered here
// instead. The explicit select also keeps this off the delta path (N-271).
async function getRoleStageHistory() {
  const rows = await getItems('RoleHistory', '', 'RoleIDLookupId,Field,OldValue,NewValue,ChangedAt');
  return normaliseRoleHistoryRows(rows.filter(r => r.Field === 'Stage')); // N-306 legacy alias
}

// ── List-specific helpers ─────────────────────────────────────────────
async function getProjects(activeOnly = true) {
  return getItems("Projects", activeOnly ? "fields/Status eq 'Active'" : "");
}

// N-381 (DA-1): every SLATargets row (default and override). Tiny list; resolve
// per project with slaTargetsFor() (utils.js). Not tier-2 cached - the N-382
// editor writes it and must see its own save.
async function getSLATargets() {
  return getItems(CONFIG.SLA.LIST);
}

// N-384 (DA-4): everything computeProjectSla() needs for ONE project, read UNWINDOWED and
// UN-NARROWED on purpose (N-383 consumer contract): all-time placements, all of the project's
// WeeklyActivity, every role. Deliberately not fetchDashboardData(): that narrows a TP (even
// one holding a DM grant) to their own roles. Rejected offers are optional evidence (offer
// implies a submission): a failed read degrades to null; every other read must succeed,
// since a missing one would false-breach hires. computeProjectSla() scopes by role itself,
// so the role-id filter's over-fetch above ROLE_ID_FILTER_MAX needs no client backstop here.
async function getProjectSlaInputs(projectId) {
  const roles = await getRolesForProject(projectId);
  const roleIds = roles.map(r => r.id);
  const [slaRows, headcount, stageRows, activity, placements, rejectedOffers] = await Promise.all([
    getSLATargets(),
    getAllHeadcount(),
    getRoleStageHistory(),
    getWeeklyActivity(null, null, { roleIds }),
    getPlacements(null, { roleIds }),
    getRejectedOffers(null, { roleIds }).catch(e => { console.warn('SLA panel: rejected offers read failed', e); return null; }),
  ]);
  return { slaRows, roles, headcount, placements, stageRows, activity, rejectedOffers };
}

// N-384 (DA-4, amendment 1): the Role page panel's reads. Same contract as getProjectSlaInputs,
// narrowed to ONE role: all-time, un-windowed placements and activity for that role (the engine's
// fill map is built from the placements passed in). The role row is passed in, not re-read, so
// the panel scores the role exactly as the page shows it. Rejected offers degrade to null.
async function getRoleSlaInputs(role) {
  const roleIds = [role.id];
  const [slaRows, headcount, stageRows, activity, placements, rejectedOffers] = await Promise.all([
    getSLATargets(),
    getAllHeadcount(),
    getRoleStageHistory(),
    getWeeklyActivity(null, null, { roleIds }),
    getPlacements(null, { roleIds }),
    getRejectedOffers(null, { roleIds }).catch(e => { console.warn('SLA role panel: rejected offers read failed', e); return null; }),
  ]);
  return { slaRows, roles: [role], headcount, placements, stageRows, activity, rejectedOffers };
}

// N-384 (DA-4): the Company Dashboard tile's extra reads. Placements are read here, not taken
// from the dashboard: its own copy degrades to [] on a failed read, and an empty placement list
// would make every filled hire look open. All-time, no window. Rejected offers degrade to null.
async function getPortfolioSlaInputs() {
  const [slaRows, stageRows, placements, rejectedOffers] = await Promise.all([
    getSLATargets(),
    getRoleStageHistory(),
    getPlacements(null),
    getRejectedOffers(null).catch(e => { console.warn('SLA tile: rejected offers read failed', e); return null; }),
  ]);
  return { slaRows, stageRows, placements, rejectedOffers };
}

// N-385 (DA-5): everything the SLA roll-up needs, for the Command Centre section and the Report
// Builder module. Scope is the PROJECT list (getUserProjectIds: null = all, so Admin / Leadership
// see every eligible project and a DM only theirs); roles, activity and placements stay whole and
// un-windowed so each project's figures are the true ones (the N-383 consumer contract).
// Internal / no-dashboard rows are removed through excludeInternalProjectData (N-333, N-362).
// Required reads throw (the caller shows "unavailable", never a zero-filled list); rejected
// offers degrade to null.
async function getSlaRollupInputs(email, opts = {}) {
  const [projectIds, allProjects, allRoles, allActivity, allPlacements, allHeadcount, slaRows, allStageRows, rejectedOffers] = await Promise.all([
    getUserProjectIds(email),
    getProjects(false),
    getAllRoles(),
    getWeeklyActivity(null, null),
    getPlacements(null),
    getAllHeadcount(),
    getSLATargets(),
    getRoleStageHistory(),
    getRejectedOffers(null).catch(e => { console.warn('SLA roll-up: rejected offers read failed', e); return null; }),
  ]);
  const { roles, activity, placements, headcount, stageRows } = excludeInternalProjectData(
    { roles: allRoles, activity: allActivity, placements: allPlacements, headcount: allHeadcount, stageRows: allStageRows },
    { projects: allProjects, roles: allRoles });
  return {
    projects: slaRollupProjects({ projects: allProjects, projectIds: projectScopeForRole(opts.role, projectIds) }),
    roles, activity, placements, headcount, slaRows, stageRows, rejectedOffers,
  };
}

// N-388 (DA-8): the inputs rejectionIntelSummary() needs, scoped for `email` (DA-D11: Admin /
// Leadership all, a Delivery Manager their own projects via getUserProjectIds; Talent Partners never
// reach this). `weeks` = the Rejected Offers page's window (0 = All time, the default, and it must
// stay unbounded: a `ge` bound cannot match a blank RejectionDate - see getRejectedOffers).
// Rejections are windowed by fromDay, activity by activitySinceWeeks (Sunday weeks). Internal /
// no-dashboard projects are removed. Rejections, roles, activity and projects are required (a
// rejection throws, the caller shows "unavailable", never an empty page); only the two LCI reads
// degrade, to benchmarkUnavailable, so the rest of the page still renders.
async function getRejectionIntelInputs(email, opts = {}) {
  const weeks = Number(opts.weeks) || 0;
  const [projectIds, allProjects, allRoles, allRejections, allActivity, models, lciRows] = await Promise.all([
    getUserProjectIds(email),
    getProjects(false),
    getAllRoles(),
    getRejectedOffers(null, { fromDay: weeksAgoDay(weeks) }),
    getWeeklyActivity(null, null),
    getLCIModels().catch(e => { console.warn('N-388: LCI models read failed', e); return null; }),
    getAllLCIModelRows().catch(e => { console.warn('N-388: LCI rows read failed', e); return null; }),
  ]);
  const scopeIds = projectScopeForRole(opts.role, projectIds);   // N-388 fix: Leadership / People Ops see all
  const scoped = rejectionIntelScopeRows({ projectIds: scopeIds, roles: allRoles, rejections: allRejections, activity: activitySinceWeeks(allActivity, weeks) });
  const { roles, activity, rejections } = excludeInternalProjectData(
    { roles: scoped.roles, activity: scoped.activity, rejections: scoped.rejections },
    { projects: allProjects, roles: allRoles });
  const benchmarkUnavailable = !Array.isArray(models) || !Array.isArray(lciRows);
  const ids = scopeIds === null ? null : new Set(scopeIds.map(String));
  return {
    rejections, roles, activity,
    models: benchmarkUnavailable ? [] : models,
    lciRows: benchmarkUnavailable ? [] : lciRows,
    projects: ids ? allProjects.filter(p => ids.has(String(p.id))) : allProjects,
    benchmarkUnavailable,
  };
}

// N-382 (DA-2): executes ONE slaEditPlan() (utils.js) against SLATargets - the only writer the
// editors use. createItem / updateItem / deleteItem only (each invalidates the list cache).
// 'none' makes no call. A failure is passed through slaTranslateSaveError (a 403 becomes a plain permission message).
async function saveSlaTargets(plan) {
  if (!plan || plan.action === 'none') return { ok: true };
  try {
    if (plan.action === 'create') await createItem(CONFIG.SLA.LIST, plan.fields);
    else if (plan.action === 'update') await updateItem(CONFIG.SLA.LIST, plan.id, plan.fields);
    else if (plan.action === 'delete') await deleteItem(CONFIG.SLA.LIST, plan.id);
    else throw new Error('Unknown SLA save action.');
  } catch (e) {
    throw slaTranslateSaveError(e);
  }
  return { ok: true };
}
 
async function getRolesForProject(projectId, talentPartnerEmail = null) {
  const roles = await getItems("Roles", `fields/ProjectID eq ${projectId}`);
  if (!talentPartnerEmail) return roles;
  return roles.filter(r => tpMatches(r.TalentPartner, talentPartnerEmail));
}
 
async function getAllRoles() {
  return getItems("Roles");
}

// N-093 (F-2a): the roles this user is allowed to see, fetched server-side
// instead of fetching every role and filtering in JS.
//   - getUserProjectIds returns null for admins/leadership → genuinely all
//     roles, unfiltered, exactly as before.
//   - ghost mode returns a single-element array → one filtered request.
//   - otherwise one filtered request per assigned project, in parallel.
// Fan-out rather than an OR chain, reusing the pattern already proven in
// getScopedRolesVisibleTo: each project's response then caches under
// its own listName|filter|select key and is reused across pages, and there
// is no OR-chain length limit to discover the hard way.
async function getRolesForUser(email) {
  const projectIds = await getUserProjectIds(email);
  if (projectIds === null) return getAllRoles();
  if (!projectIds.length) return [];
  if (projectIds.length > CONFIG.SCOPE_FANOUT_MAX) return getAllRoles();
  const arrays = await Promise.all(projectIds.map(pid => getRolesForProject(pid)));
  const byId = new Map();
  arrays.flat().forEach(r => byId.set(String(r.id), r));
  return [...byId.values()];
}

// N-093 (F-2a): OData `ge` clause for a date column, `weeksBack` weeks before
// today, or '' when weeksBack is falsy ("All time" must send NO clause).
// localDayISO, NOT spDateOut — see the getActivityForAnalytics cutoff above,
// which this deliberately matches. The bound is a local wall-clock "N weeks
// ago", which is exactly what localDayISO is documented to answer; spDateOut
// requires a Date whose UTC getters already stand for the intended calendar
// day, which this is not.
function _odataDateFrom(field, weeksBack) {
  if (!weeksBack) return '';
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (weeksBack * 7));
  return `fields/${field} ge '${odataStr(localDayISO(cutoff))}'`;
}

// N-093 (F-2a): joins non-empty OData clauses with `and`.
function _odataAnd(...clauses) {
  return clauses.filter(Boolean).join(' and ');
}

// N-094 (F-2b): builds `(fields/X eq 1 or fields/X eq 2 ...)` for a set of
// lookup ids. Returns '' for an empty set, or for one above
// CONFIG.ROLE_ID_FILTER_MAX, so _odataAnd drops the clause and the caller
// falls back to its client-side filter.
// Deliberately NOT in utils.js: it encodes Graph/SharePoint $filter grammar,
// and utils.js must not gain Graph knowledge. Same call N-093 made for its
// own OData helpers, and it is why the "pure functions -> utils.js" rule
// does not apply here.
// String concatenation, no nested template literals: a backtick inside a
// ${...} of another template literal is what broke pages.js in N-093 fix-1.
function _odataIn(field, ids) {
  if (!Array.isArray(ids) || !ids.length) return '';
  const nums = ids.map(Number);
  // Any unusable id means the set cannot be trusted as complete, so drop the
  // whole clause and over-fetch instead. Number(null) is 0, not NaN — a
  // Number.isFinite() test would have turned a null id into a filter for
  // role 0, which returns nothing and silently empties the page.
  if (nums.some(n => !Number.isInteger(n) || n <= 0)) return '';
  const uniq = [...new Set(nums)];
  if (uniq.length > CONFIG.ROLE_ID_FILTER_MAX) return '';
  const clauses = uniq.map(function (n) { return 'fields/' + field + ' eq ' + n; });
  return '(' + clauses.join(' or ') + ')';
}
 
// N-309 (HC-4a): one row per FILLED HEADCOUNT — every placement with an
// Offer Accepted Date in the last year, on any pipeline stage — not one per
// Closed role. Partly-filled pipelines count. Row shape and the join live in
// headcount.js historicalHiresFromPlacements(); `id` is still the pipeline id.
// Reads only (no select: '*' until N-052, as before). The bound is a local
// "1 year ago" day, matching _odataDateFrom / getActivityForAnalytics.
// A failed RoleHeadcount read degrades instead of breaking every analytics
// page (N-309 QA, AC 11): with no headcount, each placement takes the S-2
// fallback — its pipeline's Open Date (= the headcount date for migrated
// 1:1 data).
async function getHistoricalPlacements() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const [placements, roles, headcount] = await Promise.all([
    getPlacements(null, { fromDay: localDayISO(cutoff) }),
    getAllRoles(),
    getAllHeadcount().catch(e => {
      console.warn('N-309: headcount read failed — time to hire falls back to the pipeline Open Date', e);
      return [];
    }),
  ]);
  return historicalHiresFromPlacements(placements, roles, headcount);
}
 
async function getActivityForAnalytics(weeksBack) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (weeksBack * 7));
  // N-088: named cutoffDay, not isoDate — the old name shadowed the global
  // isoDate() helper from utils.js for the rest of this function.
  const cutoffDay = localDayISO(cutoff);
  // No select passed — the field list this used to carry was incomplete
  // (missing TalentPartner, silently breaking People Scorecards once select
  // support went live; see N-050 QA). Stays on '*' until N-052 audits and
  // re-adds a correct list.
  const activity = await getItems('WeeklyActivity',
    `fields/WeekEndingDate ge '${odataStr(cutoffDay)}'`
  );
  return activity;
}
 
// N-093 (F-2a): `opts.sinceWeeks` adds a WeekEndingDate lower bound.
// WeekEndingDate is stored as the SUNDAY, and the bound is a plain
// 'YYYY-MM-DD' matching getActivityForAnalytics.
// N-315: `opts.roleIds` scopes to a set of roles (same _odataIn as
// getPlacements). Project-scoped callers MUST use it, not `projectId`:
// WeeklyActivity.ProjectID is a denormalised copy of Roles → Project that
// nothing validates, and a blank one silently dropped a row from the Project
// Dashboard (N-315). `projectId` is kept only for legacy callers. Above
// CONFIG.ROLE_ID_FILTER_MAX ids the clause is dropped and this over-fetches,
// so every roleIds caller keeps its client-side role-id filter.
// An empty roleIds array means "no roles" → no rows, not an unfiltered fetch.
async function getWeeklyActivity(projectId, roleId, opts = {}) {
  if (Array.isArray(opts.roleIds) && !opts.roleIds.length) return [];
  let scope = "";
  if (projectId) scope = `fields/ProjectID eq ${projectId}`;
  if (roleId)    scope = `fields/RoleID eq ${roleId}`;
  const filter = _odataAnd(
    scope,
    _odataIn('RoleID', opts.roleIds),
    _odataDateFrom('WeekEndingDate', opts.sinceWeeks)
  );
  return getItems("WeeklyActivity", filter);
}

// N-147 (T-2a): every WeeklyActivity row for ONE week, for the bulk-entry
// grid's pre-fill. `weekEndingISO` is a plain 'YYYY-MM-DD' SUNDAY — the same
// bare day-string shape _odataDateFrom and getActivityForAnalytics use as a
// bound, and NOT spDateOut output. WeekEndingDate buckets on the Sunday
// boundary, so an equality filter here is exact, not a range.
// No `select` list, matching getWeeklyActivity above — deliberately on '*'
// until N-052's field audit.
async function getWeeklyActivityForWeek(weekEndingISO) {
  if (!weekEndingISO) return [];
  return getItems("WeeklyActivity", `fields/WeekEndingDate eq '${odataStr(weekEndingISO)}'`);
}
 
// N-093 (F-2a): `opts.fromDay` ('YYYY-MM-DD') adds an OfferAcceptedDate lower
// bound. There is deliberately NO project filter: Placements has no
// ProjectID column, only RoleIDLookupId. Project scoping stays client-side —
// documented here so N-094 does not rediscover it.
async function getPlacements(roleId, opts = {}) {
  const filter = _odataAnd(
    roleId ? `fields/RoleID eq ${roleId}` : '',
    _odataIn('RoleID', opts.roleIds),
    opts.fromDay ? `fields/OfferAcceptedDate ge '${odataStr(opts.fromDay)}'` : ''
  );
  return getItems("Placements", filter);
}
 
// N-094 (F-2b): `opts.roleIds` scopes to a set of roles.
// N-153: `opts.fromDay` ('YYYY-MM-DD') adds a RejectionDate lower bound,
// mirroring getPlacements.
// CAUTION for N-152: a server-side `ge` bound EXCLUDES rows with a null
// RejectionDate — SharePoint cannot match null against `ge`. That is the
// opposite of the client-side rule, where null is always-included. Any
// caller that sets fromDay either adds those rows back or states that it
// drops them; today only the two pre-N-153 rows are affected.
async function getRejectedOffers(roleId, opts = {}) {
  const filter = _odataAnd(
    roleId ? `fields/RoleID eq ${roleId}` : '',
    _odataIn('RoleID', opts.roleIds),
    opts.fromDay ? `fields/RejectionDate ge '${odataStr(opts.fromDay)}'` : ''
  );
  return getItems("RejectedOffers", filter);
}
 
// ── Admin list helpers ───────────────────────────────────────────────
async function getLeadershipAccess() {
  return getItems("LeadershipAccess");
}

// N-281: emails of every active admin row in UserAssignments (lower-cased,
// de-duped). Replaces the old hardcoded admin list as the admin recipient
// source for notifications. Cached list read, no filter.
async function getAdminEmails() {
  const rows = await getItems("UserAssignments");
  return [...new Set(rows
    .filter(isAdminAssignment)
    .map(a => (a.UserEmail || '').toLowerCase())
    .filter(Boolean))];
}
 
// ── Sales Forecasts ────────────────────────────────────────
async function getSalesForecasts() {
  return getItems("SalesForecasts");
}
 
async function createSalesForecast(payload) {
  return createItem("SalesForecasts", payload);
}
 
async function updateSalesForecast(id, payload) {
  return updateItem("SalesForecasts", id, payload);
}
 
// ── CoE Hiring Plan ─────────────────────────────────────────────────
async function getCoEPlanRows(projectId) {
  return getItems("CoEPlanRows", `fields/ProjectID eq ${projectId}`);
}
async function createCoEPlanRow(payload) {
  return createItem("CoEPlanRows", payload);
}

// ── LCI Cost Model ─────────────────────────────────────────
async function getLCIModels() {
  return getItems("LCIModels");
}
async function getLCIModelById(id) {
  return getItem("LCIModels", id);
}
async function createLCIModel(fields) {
  return createItem("LCIModels", fields);
}
async function updateLCIModel(id, fields) {
  return updateItem("LCIModels", id, fields);
}
async function deleteLCIModel(id) {
  // Delete rows + milestones first, then the header.
  const [rows, milestones] = await Promise.all([getLCIRows(id), getLCIMilestones(id)]);
  for (const r of rows)       await deleteItem("LCIModelRows", r.id);
  for (const m of milestones) await deleteItem("LCIMilestones", m.id);
  return deleteItem("LCIModels", id);
}

async function getLCIRows(modelId) {
  return getItems("LCIModelRows", `fields/ModelIDLookupId eq ${modelId}`);
}
// N-388 (DA-8): every LCIModelRows row, for the Rejection Intelligence benchmark index.
async function getAllLCIModelRows() {
  return getItems("LCIModelRows");
}
async function createLCIRow(fields) {
  return createItem("LCIModelRows", fields);
}
async function deleteLCIRow(id) {
  return deleteItem("LCIModelRows", id);
}

async function getLCIMilestones(modelId) {
  return getItems("LCIMilestones", `fields/ModelIDLookupId eq ${modelId}`);
}
async function createLCIMilestone(fields) {
  return createItem("LCIMilestones", fields);
}
async function deleteLCIMilestone(id) {
  return deleteItem("LCIMilestones", id);
}

// Duplicate a model: header (status reset to Draft) + all rows + milestones.
// Fields are whitelisted — Graph returns read-only system fields (LinkTitle,
// Created, Modified, Author...) that must not be sent back on create.
const _LCI_MODEL_COPY_FIELDS = [
  'ClientName', 'ProjectID', 'Location', 'LocalCurrency', 'DisplayCurrency',
  'FXRateLocalToDisplay', 'StartMonth', 'HorizonMonths', 'AssignedDMEmail',
  'EmployerBurdenPct', 'SalaryMonths', 'OfficeCostPerHead', 'EoRFeePerHead',
  'SectionsEnabled', 'Assumptions', 'NoticeMonths',
];
const _LCI_ROW_COPY_FIELDS = [
  'Title', 'RowType', 'Team', 'CareerLevel', 'AnnualSalary', 'BonusPct',
  'Quantity', 'ExitMonth', 'LegacyCategory', 'NoticeMonthsOverride',
  'MonthValues', 'SortOrder',
];
const _LCI_MILESTONE_COPY_FIELDS = ['Title', 'StartMonth', 'EndMonth', 'SortOrder'];

// N-150: Duplicate role — fields carried from the source role onto the new
// one, in display-normalized names (the shape getItem('Roles', id) returns,
// which is what renderRoleForm's pre-fill already reads). Kept in sync with
// submitRoleForm's actual write set (forms-role.js) by
// tests/lint-role-copy-fields.js — update that test's expectations, don't
// just edit this list, if the write set changes.
// N-307: Backfill, OpenDate and TargetHireDate are headcount fields now
// (RoleHeadcount, D-4) — the role form no longer writes them to Roles.
const _ROLE_COPY_FIELDS = [
  'ProjectIDLookupId', 'RoleTitle', 'HiringManager', 'TalentPartner', 'Budget',
  'Location', 'Priority', 'Department', 'Notes',
];
// Fields submitRoleForm writes that duplication deliberately does NOT carry
// over — Stage always resets to Backlog. (The Headcount fieldset's Open Date
// defaults to today on Duplicate — showDuplicateRoleForm, pages.js.) Used
// only by the sync test above.
const _ROLE_RESET_FIELDS = ['Stage'];

function _pickFields(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}

async function copyLCIModel(modelId, newTitle, onProgress = null) {
  const [model, rows, milestones] = await Promise.all([
    getLCIModelById(modelId), getLCIRows(modelId), getLCIMilestones(modelId),
  ]);
  const total = rows.length + milestones.length;
  let done = 0;
  const created = await createLCIModel({
    ..._pickFields(model, _LCI_MODEL_COPY_FIELDS),
    Title:  newTitle || `${model.Title} (copy)`,
    Status: 'Draft',
  });
  const newId = created.id;
  const createdRowIds = [];
  const createdMilestoneIds = [];
  try {
    for (const r of rows) {
      const cr = await createLCIRow({ ..._pickFields(r, _LCI_ROW_COPY_FIELDS), ModelIDLookupId: Number(newId) });
      createdRowIds.push(cr.id);
      if (onProgress) onProgress(++done, total);
    }
    for (const m of milestones) {
      const cm = await createLCIMilestone({ ..._pickFields(m, _LCI_MILESTONE_COPY_FIELDS), ModelIDLookupId: Number(newId) });
      createdMilestoneIds.push(cm.id);
      if (onProgress) onProgress(++done, total);
    }
  } catch (e) {
    // N-082: roll back the partial copy — best-effort, and a failed
    // cleanup delete must never mask the original error.
    for (const id of createdMilestoneIds) { try { await deleteLCIMilestone(id); } catch (_) { /* best-effort */ } }
    for (const id of createdRowIds)       { try { await deleteLCIRow(id); } catch (_) { /* best-effort */ } }
    try { await deleteLCIModel(newId); } catch (_) { /* best-effort */ }
    throw new Error('Copy failed — nothing was created. ' + e.message);
  }
  return created;
}

async function getDepartments() {
  return getItems("Departments", "");
}

// Resolve the effective role for `email` — or, if Ghost Mode is active, for
// the ghosted user instead (N-162: ghosting simulates a real user's actual
// resolved role, not a synthetic label):
// N-281: resolved by resolveRoleFromAssignments() (permissions.js), order-independent:
// 1. Active admin row in UserAssignments (AssignedRole 'admin')
// 2. LeadershipAccess list
// 3. Highest other role in UserAssignments (N-331: an inactive people_ops /
//    sales / staff row grants nothing)
// 4. Fall back to 'viewer' (no row, or no recognised role)
// ── No role cache (N-296 / SEC-2b) ───────────────────────────────────
// Roles are NOT cached. sessionStorage is writable by the user and the build
// stamp is public (CONFIG.APP_BUILD), so a forged newton_role_<email> entry
// passed every check — N-282 stopped admin/leadership being served from it,
// but a TP could still forge delivery_manager. getEffectiveRole() therefore
// re-resolves from UserAssignments + LeadershipAccess on every call; the only
// caching is the 30 s in-memory tier 1 (neither list is tier-2 enrolled, N-282).
// A legacy newton_role_<email> entry is deleted on sight, never read.
// Cost: up to two small filtered Graph reads per page navigation for every
// role; an access change now takes effect on the next page load (was 10 min).

// N-282: DM grants are held in memory, never in storage. Keyed by
// lower-cased email -> array of project-ID strings. Written by
// getEffectiveRole() on EVERY path, read by hasDMGrant().
const _dmGrantsMem = new Map();

// Role of `lower` plus the UserAssignments rows it came from, resolved from
// the lists. Shared by getEffectiveRole() and
// the ghost gate so the two can never disagree about what "admin" means.
async function _resolveRoleForEmail(lower) {
  // N-281: admin comes from an active UserAssignments row, not from code.
  // Both lists are read up front so precedence is decided in one place and
  // never depends on row order.
  const [leadership, assignments] = await Promise.all([
    getLeadershipAccess(),
    getItems("UserAssignments", `fields/Title eq '${odataStr(lower)}'`),
  ]);
  const isLeadership = leadership.some(l => l.UserEmail?.toLowerCase() === lower);
  return { role: resolveRoleFromAssignments(assignments, isLeadership), assignments };
}

// ── Ghost gate (N-282 / SEC-2) ───────────────────────────────────────
// Ghost Mode is honoured only when the REAL signed-in account — MSAL, via
// getCurrentUser(), never a storage value — resolves as admin. Otherwise the
// stored ghost keys are cleared. Runs at most once per page load, and costs
// nothing when no ghost key is stored. Awaited by getEffectiveRole(),
// getUserProjectIds() and getDefaultUserProjectId() before they read
// getGhostUser(); until it has run, getGhostUser() fails closed (null).
let _ghostGatePromise = null;

// Resolves true when settled, false when it could not verify (e.g. Graph
// failed) — in that case ghost stays ignored for this page but is NOT
// cleared, so a real admin's ghost session survives a network blip.
async function _verifyGhost() {
  if (!_hasStoredGhost()) return true;
  try {
    const realEmail = (getCurrentUser()?.email || '').toLowerCase();
    const isAdmin = !!realEmail && (await _resolveRoleForEmail(realEmail)).role === 'admin';
    _setGhostRealAdmin(isAdmin);
    if (!isAdmin) clearGhostUser();
    return true;
  } catch (e) {
    return false;
  }
}

function _ensureGhostGate() {
  if (!_ghostGatePromise) {
    _ghostGatePromise = _verifyGhost().then(settled => { if (!settled) _ghostGatePromise = null; });
  }
  return _ghostGatePromise;
}

async function getEffectiveRole(email) {
  await _ensureGhostGate();
  const realEmail = (getCurrentUser()?.email || '').toLowerCase();
  const ghost = getGhostUser();              // null unless the real account is admin
  const lower = (ghost || email).toLowerCase();
  // True when we are resolving the signed-in account itself (no ghost in play).
  const subjectIsReal = !ghost && lower === realEmail;
  try { sessionStorage.removeItem('newton_dm_grants_' + lower); } catch (e) { /* legacy key, N-282 */ }
  // N-296: no role cache — a stored role is never read. Purge any legacy entry.
  try { sessionStorage.removeItem('newton_role_' + lower); } catch (e) { /* legacy key, N-296 */ }

  const { role, assignments } = await _resolveRoleForEmail(lower);
  if (subjectIsReal) _setGhostRealAdmin(role === 'admin');

  // A leadership user may ALSO hold explicit DM assignments — their project
  // IDs feed hasDMGrant(). Every other role holds none: N-177 (beyond spec) —
  // a user demoted OUT of leadership must not keep old grants, so the empty
  // set is written on every non-leadership path.
  _dmGrantsMem.set(lower, role === 'leadership'
    ? assignments
        .filter(a => a.AssignedRole === 'delivery_manager' && a.ProjectID && a.ProjectID !== 0)
        .map(a => String(a.ProjectID))
    : []);

  return role;
}
 
// getUserProjectIds — defined above with admin null handling
 
// True if the resolved user (the ghosted user if Ghost Mode is active, else
// the signed-in user) holds an explicit DM grant.
// Pass a projectId to scope the check; omit for "any DM grant?"
// N-282: reads _dmGrantsMem, NOT storage — a forged sessionStorage entry can
// no longer grant DM controls. This function is SYNCHRONOUS — it cannot
// re-resolve on a miss, so it deliberately has NO TTL: an aged entry must not
// silently strip a leadership user's DM access mid-page. The grants live for
// the page and are re-resolved by getEffectiveRole(), which every module
// awaits in its init (app.js, cc-app.js, mr-app.js, people-app.js,
// mobile-app.js, forms*.js) before anything calls this. No entry = false
// (fail closed). Do not "tidy" this asymmetry away.
function hasDMGrant(projectId = null) {
  const email = (getGhostUser() || getCurrentUser()?.email || '').toLowerCase();
  const grants = _dmGrantsMem.get(email) || [];
  return projectId ? grants.includes(String(projectId)) : grants.length > 0;
}

async function getTalentPartnersForProject(projectId, includeEmail = null) {
  const assignments = await getItems("UserAssignments", `fields/ProjectID eq ${projectId}`);
  const keep = includeEmail ? includeEmail.toLowerCase() : null;
  return assignments.filter(a =>
    (a.AssignedRole === 'talent_partner' || a.AssignedRole === 'delivery_manager') &&
    (a.Active !== false || (keep && a.UserEmail?.toLowerCase() === keep))
  );
}

// All assignable users (deduped by email) — used to populate DM dropdown
async function getAllAssignableUsers() {
  const assignments = await getItems("UserAssignments");
  const seen = new Map();
  assignments.forEach(u => {
    if (u.Active === false) return;
    if (u.AssignedRole === 'admin') return; // N-281: admin rows are not DM candidates
    const email = (u.UserEmail || '').toLowerCase();
    if (email && !seen.has(email)) {
      seen.set(email, { UserEmail: u.UserEmail, UserName: u.UserName || u.UserEmail });
    }
  });
  return [...seen.values()].sort((a, b) =>
    (a.UserName || '').localeCompare(b.UserName || ''));
}

// N-398 (BP-2): project ids on which the user holds an ACTIVE delivery_manager row.
// Ghost-aware and the same UserAssignments read as getUserProjectIds (a cache hit when
// that has already run; two concurrent calls each make the request). Role-independent.
// Legacy source: UserAssignments is authoritative while CONFIG.ACCESS_SCOPE.mode is
// 'shadow' — revisit this and the Reassign candidate list when it flips to 'assignments'.
async function getDmProjectIds(email) {
  await _ensureGhostGate();
  const lower = (getGhostUser() || email).toLowerCase();
  const rows = await getItems("UserAssignments", `fields/Title eq '${odataStr(lower)}'`);
  return dmProjectIdsFromAssignments(rows);
}

async function getTalentPartnerDisplayMap() {
  const assignments = await getItems("UserAssignments");
  const map = {};
  assignments.forEach(u => {
    if (u.UserEmail) map[u.UserEmail.toLowerCase()] = u.UserName || u.UserEmail;
  });
  return map;
}

// Filter a list of TP emails down to those matching an ACTIVE People record.
// People has no email column, so we match the UserAssignments display name
// against People.EmployeeName (case/whitespace-insensitive).
// If the People list is empty/unavailable, returns the list unfiltered.
async function filterToActiveTpEmails(tpEmails, tpMap) {
  const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const activePeople = await getPeople(true); // IsActive eq 1
  if (!activePeople.length) return tpEmails;
  const activeNames = new Set(activePeople.map(p => norm(p.EmployeeName)));
  return tpEmails.filter(e => activeNames.has(norm(tpMap[e.toLowerCase()])));
}
 
// N-367 (PT-7): a user's Assignments rows (the Project Team), by the indexed
// UserEmail column (N-361, stored lower-case). Tier-1 cached like every read,
// so the 'projects' and 'default' scope checks share one request.
async function _getAssignmentsForUser(lower) {
  return getItems("Assignments", `fields/UserEmail eq '${odataStr(lower)}'`);
}

// The legacy (UserAssignments) project scope, from a user's rows. Unchanged
// from getUserProjectIds before N-367.
// N-165: de-duped — a user with two UserAssignments rows for the same
// project (e.g. TP + DM-granted) must not get that project ID twice, or
// every downstream per-project role fan-out doubles that project's roles.
// N-281: admin rows (ProjectID 0) are never a project — an inactive one
// must not add "0" to the scope. N-331: nor are people_ops / sales / staff
// rows (isOrgWideRole, permissions.js).
function _legacyProjectIds(assignments) {
  return [...new Set(assignments
    .filter(a => !isOrgWideRole(a.AssignedRole))
    .map(a => String(a.ProjectID)))];
}

// Return all project IDs this user is assigned to (null = admin, sees all).
// N-162: resolves against the ghosted user's real assignments when Ghost
// Mode is active, instead of a single manually-picked ghost project.
// N-367: CONFIG.ACCESS_SCOPE.mode picks the scope (accessScopeMode). In
// 'shadow' the legacy scope is returned at once and the Assignments scope is
// compared in the background (never awaited, never throws into the caller).
async function getUserProjectIds(email) {
  await _ensureGhostGate();   // N-282: getGhostUser() is only valid after the gate
  const lower = (getGhostUser() || email).toLowerCase();
  const assignments = await getItems("UserAssignments", `fields/Title eq '${odataStr(lower)}'`);
  // N-281: an active admin row sees all projects — in every scope mode.
  if (assignments.some(isAdminAssignment)) return null;
  const mode = accessScopeMode();
  if (mode === 'assignments') return projectIdsFromAssignments(await _getAssignmentsForUser(lower));
  const legacy = _legacyProjectIds(assignments);
  if (mode === 'shadow' && typeof scopeShadowDue === 'function' && scopeShadowDue('projects', lower)) {
    _getAssignmentsForUser(lower)
      .then(rows => reportScopeShadow('projects', lower, legacy, projectIdsFromAssignments(rows)))
      .catch(e => console.warn('Access shadow: Assignments read failed —', e && e.message));
  }
  return legacy;
}

async function getScopedProjects(email, activeOnly = false) {
  const projectIds = await getUserProjectIds(email);
  const allProjects = await getProjects(activeOnly);
  if (projectIds === null) return allProjects;
  return allProjects.filter(p => projectIds.includes(String(p.id)));
}
 
// ── App Settings ─────────────────────────────────────────────────────
// AppSettings is a single-row SharePoint list with columns:
//   Title (single line text, value always "config")
//   AnnouncementMessage (multiple lines of text)
//   SeasonalEffect (single line text, e.g. "snow", "spring", or "" for none)
 
async function _getAppSettingsRow() {
  try {
    const items = await getItems("AppSettings");
    return items.find(i => (i.Title || '').toLowerCase() === 'config') || null;
  } catch (e) {
    return null;
  }
}
 
// ── People module: People list ────────────────────────────────────────
// Placeholder rows (vacancies / fictional roles) are EXCLUDED unless the caller
// opts in — only the Org Chart does. Filtered client-side, not in the OData
// $filter: rows created before the IsPlaceholder column existed have no value
// for it, and a server-side "eq 0" would drop every one of them.
async function getPeople(activeOnly = true, includePlaceholders = false) {
  const filter = activeOnly ? "fields/IsActive eq 1" : "";
  const all = await getItems("People", filter);
  const people = includePlaceholders ? all : all.filter(p => !p.IsPlaceholder);
  return people.sort((a, b) => {
    const lDiff = levelSortIndex(a.Level) - levelSortIndex(b.Level);
    if (lDiff !== 0) return lDiff;
    return (a.EmployeeName || "").localeCompare(b.EmployeeName || "");
  });
}

// ── People module: PeoplePay list (N-286 / SEC-6) ────────────────────
// Salary's only home. Restricted to admin + leadership: call these ONLY on
// payroll paths (Employee Tracker salary column, Edit Employee, Payroll
// Summary) — never from a TP/DM page. Unfiltered read: the list is one row
// per employee, and a filter on the non-indexed PersonID would need the
// HonorNonIndexedQueries header. A 403 returns [] (N-285, getItems).
// Deliberately tier 1 only — not in CONFIG.CACHE.persistentLists — so
// salaries never sit in sessionStorage.
async function getPeoplePay() {
  return getItems('PeoplePay');
}

// Upsert one person's salary. Blank (undefined/null/'') = no change, never a
// clear (N-286 decision 2). Writes only through createItem/updateItem, so the
// cache-invalidation contract holds.
async function setPersonSalary(personId, salary) {
  if (salary === undefined || salary === null || salary === '') return null;
  const value = Number(salary);
  const pid   = Number(personId);
  const rows  = (await getPeoplePay())
    .filter(r => Number(r.PersonID) === pid)
    .sort((a, b) => Number(a.id) - Number(b.id));
  if (!rows.length) {
    return createItem('PeoplePay', { Title: String(pid), PersonID: pid, Salary: value });
  }
  if (rows.length > 1) {
    console.warn(`Newton: ${rows.length} PeoplePay rows for PersonID ${pid} — updating the lowest id (N-286).`);
  }
  if (Number(rows[0].Salary) === value) return rows[0];
  return updateItem('PeoplePay', rows[0].id, { Salary: value });
}

// N-286: Salary goes to PeoplePay, never People. A failed salary write must
// not throw: the People row already exists, and rethrowing would make
// optimisticWrite() revert and offer a Retry that creates a duplicate person.
// Instead the result carries _salaryError (the message) and the caller —
// people-forms.js — tells the user. api.js stays free of UI calls.
async function createPerson(fields) {
  const saved = await createItem("People", {
    Title:        fields.EmployeeName,
    Level:        fields.Level || undefined,   // N-304: blank for internal staff
    StaffType:    fields.StaffType || CONFIG.STAFF_TYPE_DEPLOYABLE,
    StaffFunction: fields.StaffFunction || undefined,
    ContractType: fields.ContractType,
    Location:     fields.Location,
    StartDate:    fields.StartDate || undefined,
    EndDate:      fields.EndDate   || undefined,
    IsActive:     fields.IsActive !== false,
    PhotoUrl:     fields.PhotoUrl || undefined,
    IsPlaceholder:      fields.IsPlaceholder || undefined,
    PlaceholderProject: fields.PlaceholderProject || undefined,
    PlaceholderCSD:     fields.PlaceholderCSD     || undefined,
  });
  if (fields.Salary !== undefined && saved && saved.id) {
    try {
      await setPersonSalary(saved.id, fields.Salary);
    } catch (e) {
      console.warn('Newton: PeoplePay write failed for new person ' + saved.id, e);
      return { ...saved, _salaryError: e.message };
    }
  }
  return saved;
}
// N-286: errors from the salary write propagate — the edit form shows them.
async function updatePerson(id, fields) {
  const payload = {};
  if (fields.EmployeeName !== undefined) payload.Title        = fields.EmployeeName;
  if (fields.Level        !== undefined) payload.Level        = fields.Level;
  if (fields.StaffType    !== undefined) payload.StaffType    = fields.StaffType;     // N-304
  if (fields.StaffFunction !== undefined) payload.StaffFunction = fields.StaffFunction;
  if (fields.ContractType !== undefined) payload.ContractType = fields.ContractType;
  if (fields.Location     !== undefined) payload.Location     = fields.Location;
  if (fields.StartDate    !== undefined) payload.StartDate    = fields.StartDate;
  if (fields.EndDate      !== undefined) payload.EndDate      = fields.EndDate;
  if (fields.IsActive     !== undefined) payload.IsActive     = fields.IsActive;
  if (fields.PhotoUrl     !== undefined) payload.PhotoUrl     = fields.PhotoUrl;
  if (fields.IsPlaceholder      !== undefined) payload.IsPlaceholder      = fields.IsPlaceholder;
  if (fields.PlaceholderProject !== undefined) payload.PlaceholderProject = fields.PlaceholderProject;
  if (fields.PlaceholderCSD     !== undefined) payload.PlaceholderCSD     = fields.PlaceholderCSD;
  const result = Object.keys(payload).length ? await updateItem("People", id, payload) : null;
  if (fields.Salary !== undefined) await setPersonSalary(id, fields.Salary);
  return result;
}
 
// ── People module: Assignments list ──────────────────────────────────
async function getAssignments(filters = {}) {
  const parts = [];
  // N-365: one project's team (ProjectID is indexed, N-361). A bad id returns
  // nothing rather than dropping the filter and returning every row.
  if (filters.projectId !== undefined) {
    const pid = Number(filters.projectId);
    if (!Number.isInteger(pid) || pid <= 0) return [];
    parts.push(`fields/ProjectID eq ${pid}`);
  }
  if (filters.employeeName) parts.push(`fields/EmployeeName eq '${odataStr(filters.employeeName)}'`);
  if (filters.customer)     parts.push(`fields/Customer eq '${odataStr(filters.customer)}'`);
  if (filters.billed !== undefined && filters.billed !== '')
    parts.push(`fields/Billed eq '${odataStr(filters.billed)}'`);
  const filterStr = parts.join(" and ");
  const assignments = await getItems("Assignments", filterStr);
  if (filters.year) {
    const y = parseInt(filters.year);
    const yearStart = new Date(y, 0, 1);
    const yearEnd   = new Date(y, 11, 31, 23, 59, 59);
    return assignments.filter(a => {
      const s = a.StartDate ? new Date(a.StartDate) : null;
      const e = a.EndDate   ? new Date(a.EndDate)   : null;
      if (!s) return false;
      return s <= yearEnd && (!e || e >= yearStart);
    });
  }
  return assignments;
}
async function createAssignment(fields) {
  return createItem("Assignments", {
    Title:           fields.AssignmentID,
    EmployeeName:    fields.EmployeeName,
    Level:           fields.Level,
    Customer:        fields.Customer,
    ProjectType:     fields.ProjectType,
    StartDate:       fields.StartDate,
    EndDate:         fields.EndDate,
    MonthlyBillRate: fields.MonthlyBillRate || undefined,
    RetainerFee:     fields.RetainerFee  || undefined,   // N-116 split-fee
    PlacementFee:    fields.PlacementFee || undefined,   // N-116 split-fee
    Billed:          fields.Billed,
    Country:         fields.Country,
    IsForecast:      fields.IsForecast || false,
    AutoGenerated:   fields.AutoGenerated || false,
    // N-365: Project Team keys (N-361 columns). Bench rows and People-form rows
    // leave them unset.
    ProjectID:       fields.ProjectID || undefined,
    UserEmail:       fields.UserEmail || undefined,
    IsLeadDM:        fields.IsLeadDM === true ? true : undefined,
  });
}
// Moved from api-people-forms.js by N-365. Its only caller is the Project Team on
// reporting.html (the People Assignment form was deleted in N-372). Only keys present are sent.
async function updateAssignment(id, fields) {
  const payload = {};
  if (fields.AssignmentID    !== undefined) payload.Title           = fields.AssignmentID;
  if (fields.EmployeeName    !== undefined) payload.EmployeeName    = fields.EmployeeName;
  if (fields.Level           !== undefined) payload.Level           = fields.Level;
  if (fields.Customer        !== undefined) payload.Customer        = fields.Customer;
  if (fields.ProjectType     !== undefined) payload.ProjectType     = fields.ProjectType;
  if (fields.StartDate       !== undefined) payload.StartDate       = fields.StartDate;
  if (fields.EndDate         !== undefined) payload.EndDate         = fields.EndDate;
  if (fields.MonthlyBillRate !== undefined) payload.MonthlyBillRate = fields.MonthlyBillRate;
  if (fields.RetainerFee     !== undefined) payload.RetainerFee     = fields.RetainerFee;
  if (fields.PlacementFee    !== undefined) payload.PlacementFee    = fields.PlacementFee;
  if (fields.Billed          !== undefined) payload.Billed          = fields.Billed;
  if (fields.Country         !== undefined) payload.Country         = fields.Country;
  if (fields.IsForecast      !== undefined) payload.IsForecast      = fields.IsForecast;
  if (fields.ProjectID       !== undefined) payload.ProjectID       = fields.ProjectID;   // N-365
  if (fields.UserEmail       !== undefined) payload.UserEmail       = fields.UserEmail;
  if (fields.IsLeadDM        !== undefined) payload.IsLeadDM        = fields.IsLeadDM;
  return updateItem("Assignments", id, payload);
}
// N-365: remove one Assignments row (Project Team delete).
async function deleteAssignment(id) {
  return deleteItem("Assignments", id);
}

// N-365 (design rule 4): re-run Sync Bench for ONE person after a Project Team
// save, so their bench rows never overlap the new / changed assignment. Same
// gap rule as the Sync Bench button (ptComputeBenchChanges, project-team.js),
// limited to this person. Never throws — the save it follows has already
// landed: resolves { ok, created, deleted }; ok false = run Sync Bench in People.
async function resyncBenchFor(employeeName) {
  try {
    const person = (await getPeople(false)).find(p => p.EmployeeName === employeeName);
    if (!person) return { ok: true, created: 0, deleted: 0 };
    const rows = await getAssignments({ employeeName });
    const { toCreate, toDelete } = ptComputeBenchChanges([person], rows);
    for (const id of toDelete) await deleteItem("Assignments", id);
    if (toCreate.length) {
      const all = await getAssignments({});
      for (let i = 0; i < toCreate.length; i++) {
        toCreate[i].AssignmentID = ptNextAssignmentId(all, 'B', i);
        await createAssignment(toCreate[i]);
      }
    }
    return { ok: true, created: toCreate.length, deleted: toDelete.length };
  } catch (e) {
    console.warn('Newton: bench re-sync failed for ' + employeeName, e);
    return { ok: false, created: 0, deleted: 0 };
  }
}

// N-365 (D-5): make one Project Team row the project's Lead DM, or clear it
// (assignmentId null). Three writes, in this order: (1) IsLeadDM true on the
// new row, (2) IsLeadDM false on every other team row that has it, (3)
// Projects.DeliveryManager = the new row's UserEmail ('' to clear). Not atomic:
// a failure throws with err.step = 1 | 2 | 3 so the caller can say what
// landed (N-373's Data Health probe catches a half-write).
async function setProjectLeadDm(projectId, assignmentId, teamRows) {
  const rows = teamRows || [];
  const target = assignmentId == null ? null : rows.find(r => String(r.id) === String(assignmentId));
  const email = target ? String(target.UserEmail || '').trim().toLowerCase() : '';
  if (assignmentId != null && !email) throw Object.assign(new Error('That team member has no Newton login.'), { step: 1 });
  const run = async (step, fn) => {
    try { return await fn(); } catch (e) { e.step = step; throw e; }
  };
  if (target) await run(1, () => updateItem("Assignments", target.id, { IsLeadDM: true }));
  const others = rows.filter(r => (!target || String(r.id) !== String(target.id)) &&
    (r.IsLeadDM === true || r.IsLeadDM === 1 || r.IsLeadDM === 'Yes'));
  await run(2, async () => { for (const r of others) await updateItem("Assignments", r.id, { IsLeadDM: false }); });
  await run(3, () => updateItem("Projects", projectId, { DeliveryManager: email }));
}
 
// ── People module: GPInvoices list ────────────────────────────────────
async function updateInvoice(id, fields) {
  const payload = {};
  if (fields.InvoiceNumber !== undefined) payload.Title       = fields.InvoiceNumber;
  if (fields.InvoiceDate   !== undefined) payload.InvoiceDate = fields.InvoiceDate;
  if (fields.DueDate       !== undefined) payload.DueDate     = fields.DueDate;
  if (fields.Amount        !== undefined) payload.Amount      = fields.Amount;
  if (fields.Notes         !== undefined) payload.Notes       = fields.Notes;
  if (fields.Status        !== undefined) payload.Status      = fields.Status;
  return updateItem("GPInvoices", id, payload);
}

// ── People photos: upload into the PeoplePhotos document library ──────
let _peoplePhotosDriveId = null;
async function getPeoplePhotosDriveId() {
  if (_peoplePhotosDriveId) return _peoplePhotosDriveId;
  const data = await graphRequest('GET', `/sites/${CONFIG.SP_SITE_ID}/drives`);
  const drive = (data.value || []).find(d => d.name === 'PeoplePhotos');
  if (!drive) throw new Error("'PeoplePhotos' document library not found on the site.");
  _peoplePhotosDriveId = drive.id;
  return drive.id;
}

// ── People photos: Graph download URLs (N-337) ───────────────────────
// A plain <img src="https://….sharepoint.com/…/PeoplePhotos/x.png"> is
// authenticated by a SharePoint session cookie, which browsers often don't
// send cross-site (401). Graph's /content would work, but it 302s to a
// sharepoint.com host that connect-src does not allow. So the library is listed
// once and each file's pre-authenticated @microsoft.graph.downloadUrl becomes
// the <img> src (img-src already allows sharepoint.com). Memory only — never
// _apiCache or browser storage: the URLs are time-limited bearer links (N-282).
let _photoMap = null;        // Map: lower-cased filename -> download URL
let _photoMapAt = null;      // Date.now() when _photoMap was built
let _photoMapPromise = null; // in-flight read, shared by concurrent callers
let _photoMapGen = 0;        // bumped by _photoMapInvalidate(); a read that started before it is not stored

// Never throws. A failed read returns an empty Map and is not remembered, so
// the next call retries. force = re-read even inside the TTL.
async function getPhotoUrlMap(force = false) {
  if (!force && _photoMap && photoMapFresh(_photoMapAt, Date.now(), CONFIG.PHOTO_URL_TTL_MS)) return _photoMap;
  if (_photoMapPromise) return _photoMapPromise;
  const gen = _photoMapGen;
  const read = (async () => {
    try {
      const driveId = await getPeoplePhotosDriveId();
      const items = [];
      let url = `/sites/${CONFIG.SP_SITE_ID}/drives/${driveId}/root/children?$top=200`;
      while (url) {
        const data = await graphRequest('GET', url);
        items.push(...(data.value || []));
        url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(GRAPH, '') : null;
      }
      const map = buildPhotoUrlMap(items);
      if (gen === _photoMapGen) { _photoMap = map; _photoMapAt = Date.now(); }
      return map;
    } catch (e) {
      console.warn('N-337: could not read the PeoplePhotos library — avatars fall back to initials', e);
      return new Map();
    } finally {
      if (_photoMapPromise === read) _photoMapPromise = null;
    }
  })();
  _photoMapPromise = read;
  return read;
}

// Forget the map (a photo was just uploaded or replaced).
function _photoMapInvalidate() {
  _photoMapGen++;
  _photoMap = null;
  _photoMapAt = null;
  _photoMapPromise = null;
}

// Upload an image; returns its web URL. prefix = 'person' | 'leader'.
// Stable filename (prefix-id.ext) so re-uploads overwrite the previous photo.
async function uploadPeoplePhoto(prefix, id, file) {
  // N-284: validate first, at the API boundary, so no caller can skip it.
  const check = validateUpload(file, 'PHOTO');
  if (!check.ok) throw new Error(check.reason);
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const driveId = await getPeoplePhotosDriveId();
  const filename = `${prefix}-${id}.${check.ext}`;
  const url = `${GRAPH}/sites/${CONFIG.SP_SITE_ID}/drives/${driveId}/items/root:/${encodeURIComponent(filename)}:/content`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': check.mime },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Photo upload failed: HTTP ${res.status}`);
  }
  const result = await res.json();
  _photoMapInvalidate();   // N-337: the library changed — next hydrate re-lists it
  const web = result?.webUrl;
  return web ? web + (web.includes('?') ? '&' : '?') + 'v=' + Date.now() : null;
}

// N-235: Title and PackOwner are set by the caller, never copied. Everything
// else is whitelisted — never round-trip a fetched Graph item into a create
// (LinkTitle and friends are read-only → 403). A pack has no child rows, so
// this is a single create with no rollback sequence, unlike copyLCIModel.
const _BRIEFING_PACK_COPY_FIELDS = [
  "ProjectID", "RoleID", "ClientName", "RoleTitle", "RoleLocation",
  "ContactName", "ContactTitle", "ContactEmail", "CoverDate", "Pages",
];
async function copyBriefingPack(id, owner) {
  const src = await getItem("BriefingPacks", id);
  return createItem("BriefingPacks", {
    ..._pickFields(src, _BRIEFING_PACK_COPY_FIELDS),
    Title:     `${src.Title} (copy)`,
    PackOwner: (owner || "").toLowerCase(),
  });
}

// Generic role-visibility resolver, despite the old name — used by both the
// Market Report builder and the bulk weekly-activity grid (N-147, N-165).
async function getScopedRolesVisibleTo(email, effectiveRole) {
  const lower = email.toLowerCase();

  if (effectiveRole === "admin") {
    return getAllRoles();
  }

  if (effectiveRole === "delivery_manager") {
    const projectIds = await getUserProjectIds(email);
    if (!projectIds) return getAllRoles();
    const arrays = await Promise.all(
      projectIds.map(pid => getRolesForProject(pid))
    );
    return arrays.flat();
  }

  // Talent Partner: only roles where TalentPartner column matches them.
  // N-367: scoped through getRolesForUser (getUserProjectIds — de-duped, scope
  // mode aware, ghost-aware) rather than its own UserAssignments read. The TP
  // match uses the same subject, so a ghosted TP sees the ghost's roles.
  const roles = await getRolesForUser(email);
  const subject = (getGhostUser() || lower).toLowerCase();
  return roles.filter(r => tpMatches(r.TalentPartner, subject));
}

// ── Employee Engagement ───────────────────────────────────────────────

// ── Read ──────────────────────────────────────────────────────────────

async function getSurveyTemplates() {
  return getItems("SurveyTemplates");
}

async function getActiveSurveyRun() {
  const runs = await getItems("SurveyRuns", "fields/Status eq 'Active'");
  return runs.length > 0 ? runs[0] : null;
}

async function getSurveyQuestions(templateId) {
  const questions = await getItems("SurveyQuestions", `fields/TemplateID eq '${odataStr(templateId)}'`);
  return questions.sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
}

async function hasCompletedSurvey(runId, email) {
  const completions = await getItems(
    "SurveyCompletions",
    `fields/RunID eq '${odataStr(runId)}' and fields/RespondentEmail eq '${odataStr(email.toLowerCase())}'`
  );
  return completions.length > 0;
}

// ── Write ─────────────────────────────────────────────────────────────
async function createSurveyRun(fields) {
  // N-131: canonical midday-UTC, like every other SharePoint date write. The
  // bare shape was kept until now (see N-088) because index.html does
  // ARITHMETIC on these two values, so changing the shape moves behaviour:
  //   index.html ~233  daysSince -> the reminder gate (CONFIG.SURVEY.REMINDER_DAY)
  //   index.html ~299  hrsLeft   -> the "closes in Xh" notification
  // Both were reworked in the same change to be time-of-day insensitive —
  // daysSince now counts calendar days, and hrsLeft counts to the END of the
  // close date (a run closing on the 20th is open THROUGH the 20th). If either
  // consumer is touched again, keep them insensitive to the stored time.
  // localDayISO() below still produces the correct local DAY; isoDate() only
  // pins it to midday so no browser offset can shift it.
  const openDate  = fields.OpenDate  || localDayISO();
  const closeDate = fields.CloseDate || (() => {
    const d = new Date(); d.setDate(d.getDate() + CONFIG.SURVEY.DEFAULT_DURATION_DAYS);
    return localDayISO(d);
  })();
  return createItem("SurveyRuns", {
    Title:              fields.RunLabel,
    TemplateID:         String(fields.TemplateID),
    OpenDate:           isoDate(openDate),
    CloseDate:          isoDate(closeDate),
    Status:             "Active",
    EligibleCount:      fields.EligibleCount || 0,
  });
}
