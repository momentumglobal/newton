// js/api.js — Newton data layer: the core lists (Projects, Roles, Placements,
// WeeklyActivity, RejectedOffers), role history, diagnostics and the small
// sales / CoE readers. Graph transport, caching, FIELD_ALIASES and the
// generic CRUD helpers are in graph-client.js (loads straight before this
// file); RoleHeadcount reads/writes are in api-headcount.js (N-347).
// Role, scope and write gates + the user directory are in api-access.js, which
// loads straight after this file everywhere (N-476); People / SLA / template /
// LCI / survey Graph code is in api-people.js, api-sla.js, api-templates.js,
// api-lci.js and api-engagement.js.
 
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
// N-549 (AMCP-C5): `opts` is { source, awaitHistory }. No opts = exactly the behaviour above, and the
// six app call sites pass none. `source` tags the RoleHistory rows ('claude' from Newton for Claude);
// `awaitHistory` makes the history write part of the call, because the MCP write shim only allows
// writes until its commit settles. Then the return is { result, historyOk, historyRows } and a
// history failure never throws (the Roles write has already landed): historyOk is false when the
// prior role could not be read or the write failed.
async function updateRoleWithHistory(roleId, fields, opts = {}) {
  let oldRole = null;
  try {
    oldRole = await getItem('Roles', roleId);
  } catch (e) {
    console.warn('RoleHistory: could not read prior Roles state', e);
  }
  const result = await updateItem('Roles', roleId, fields);
  if (opts.awaitHistory) {
    let historyOk = false;
    let historyRows = 0;
    if (oldRole) {
      try {
        historyRows = await _logRoleHistory(oldRole, fields, opts.source);
        historyOk = true;
      } catch (e) {
        console.warn('RoleHistory: write failed', e);
      }
    }
    return { result, historyOk, historyRows };
  }
  if (oldRole) {
    _logRoleHistory(oldRole, fields, opts.source).catch(e =>
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
async function _logRoleHistory(oldRole, newFields, source) {
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
  await Promise.all(rows.map(({ field, oldValue, newValue }) => {
    const row = {
      RoleIDLookupId: parseInt(oldRole.id),
      Field:          field,
      OldValue:       oldValue !== undefined && oldValue !== null ? String(oldValue) : '',
      NewValue:       newValue !== undefined && newValue !== null ? String(newValue) : '',
      ChangedBy:      email,
      ChangedAt:      changedAt,
    };
    if (source) row.Source = source;   // N-549 (AMCP-A7): blank for the app, 'claude' for Newton for Claude
    return createItem('RoleHistory', row);
  }));
  return rows.length;
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
 
// N-454: the raw Placements rows getHistoricalPlacements() turns into hires — same one-year window, or every row with
// `opts.allTime`. One function, so the two reads are the same request (a cache hit) and the window rule lives once.
// My Scorecard reads them to name the candidate on its hires list; the historical rows carry no candidate (N-309).
function getHistoricalPlacementRows(opts = {}) {
  if (opts && opts.allTime) return getPlacements(null);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return getPlacements(null, { fromDay: localDayISO(cutoff) });
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
// N-453: `opts.allTime` drops the one-year bound (every placement ever recorded) — the My Scorecard
// "All time" period only; every other caller passes nothing and is unchanged.
async function getHistoricalPlacements(opts = {}) {
  const [placements, roles, headcount] = await Promise.all([
    getHistoricalPlacementRows(opts),
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

// N-453: EVERY WeeklyActivity row, no date bound — the My Scorecard "All time" period, read once and cached like any
// list read. Not getActivityForAnalytics(0): a 0 window gives a cutoff of today and returns nothing. The TalentPartner
// column is not indexed and can hold several people (N-094), so there is no server-side person filter; the page scopes
// the rows client-side. Same '*' select and the same N-052 comment as above.
async function getActivityAll() {
  return getItems('WeeklyActivity');
}

// N-453: does the signed-in (Ghost-aware) user have any Weekly Activity of their own? Decides whether the My Scorecard
// tab shows. It reads the SAME rows the scorecard page reads (getActivityForAnalytics(scorecardFetchWeeks())), so opening
// the tab afterwards is a cache hit. A failed read hides the tab and warns; it never throws.
async function resolveScorecardNav() {
  try {
    await _ensureGhostGate();
    const rows = await getActivityForAnalytics(scorecardFetchWeeks());
    return { hasActivity: scorecardHasActivity(rows, getScopedUserEmail()) };
  } catch (e) {
    console.warn('My Scorecard availability unknown', e);
    return { hasActivity: false };
  }
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

async function getDepartments() {
  return getItems("Departments", "");
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
