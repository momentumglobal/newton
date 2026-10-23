// js/permissions.js — pure role / permission rules: reads CONFIG only, no network I/O, no DOM (N-346c)
// Moved out of utils.js. Owns role resolution (N-281), capability and org-wide role
// checks (N-331), survey respondent / eligibility rules (N-332) and the restricted-list
// and denial-memo helpers (N-285). Behaviour is unchanged from the utils.js originals.
// N-367 adds the access-scope helpers (Project Team epic) at the end of the file. They call
// isForecastAssignment and spDateIn (utils.js, which loads first) at call time only.
// Loaded on every page, after headcount.js and straight before graph-client.js; graph-client.js
// and api.js call these at runtime (config.js loads first, so the CONFIG defaults resolve).

// ── N-281: role resolution (pure) ────────────────────────────────────
// An admin row = a UserAssignments row with AssignedRole 'admin' that is
// not deactivated. A deactivated admin row grants nothing (Chris, 2 Oct
// 2026). Active undefined counts as active, same as everywhere else.
function isAdminAssignment(row) {
  return !!row && row.AssignedRole === 'admin' && row.Active !== false;
}

// Effective role from a user's UserAssignments rows plus whether they are in
// LeadershipAccess. Order-independent: precedence comes from
// CONFIG.ROLE_PRECEDENCE, never from which row Graph returned first.
//   admin row > leadership > highest other AssignedRole > 'viewer'.
// 'admin' and 'leadership' are never taken from a plain AssignedRole string
// (an inactive admin row, or a typed 'leadership', grants nothing), and any
// value not in CONFIG.ROLE_PRECEDENCE is ignored. DM/TP ignore Active
// (bench TPs/DMs keep their role — see getEligibleRespondentCount, N-233).
// N-331 (A-2): an inactive people_ops / sales / staff row grants nothing,
// same as an inactive admin row — those roles carry Tier 2 access.
function resolveRoleFromAssignments(rows, isLeadership) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.some(isAdminAssignment)) return 'admin';
  if (isLeadership) return 'leadership';
  const order = CONFIG.ROLE_PRECEDENCE;
  let best = order.indexOf('viewer');
  list.forEach(r => {
    const role = r && r.AssignedRole;
    if (role === 'admin' || role === 'leadership') return;
    if (isOrgWideRole(role) && r.Active === false) return;   // N-331 (A-2)
    const i = order.indexOf(role);
    if (i !== -1 && i < best) best = i;
  });
  return order[best];
}

// N-282: pure. True for the roles that must never be served from a
// browser-writable cache (CONFIG.PRIVILEGED_ROLES: admin, leadership).
function isPrivilegedRole(role) {
  return CONFIG.PRIVILEGED_ROLES.includes(role);
}

// N-331: pure. Roles whose UserAssignments row applies company-wide
// (CONFIG.ORG_WIDE_ROLES): always ProjectID 0, never a project scope, and an
// inactive row grants nothing.
function isOrgWideRole(role, cfg = CONFIG) {
  return Array.isArray(cfg.ORG_WIDE_ROLES) && cfg.ORG_WIDE_ROLES.includes(role);
}

// N-331: pure. Can `role` use capability `cap` (CONFIG.ROLE_CAPABILITIES)?
// Every in-page "can this role do X" check goes through here, so a role's
// reach is changed in config.js only. Unknown cap or role → false.
function roleCan(role, cap, cfg = CONFIG) {
  const caps = cfg && cfg.ROLE_CAPABILITIES;
  const roles = caps && Object.prototype.hasOwnProperty.call(caps, cap) ? caps[cap] : null;
  return Array.isArray(roles) && roles.includes(role);
}

// N-365 (PT-5): pure. Admin / Leadership / People Ops (capability projectTeamEdit)
// see every project on the Projects list and the Project page, whatever
// getUserProjectIds returns for them.
function seesAllProjects(role, cfg = CONFIG) {
  return roleCan(role, 'projectTeamEdit', cfg);
}

// N-365 (PT-5, D-1): pure. Can `role` edit project `projectId`'s Project Team
// (add / edit / delete members, rates and fees, Lead DM)? projectTeamEdit roles:
// any project. A Delivery Manager: only a project in their own scope
// (`userProjectIds` from getUserProjectIds — null = all). The D-2 write window
// (assignment end + 14 days) is N-369, not this check.
function canEditProjectTeam(role, projectId, userProjectIds, cfg = CONFIG) {
  if (seesAllProjects(role, cfg)) return true;
  if (role !== cfg.ROLE_IDS.DELIVERY_MANAGER) return false;
  const id = Number(projectId);
  if (!Number.isInteger(id) || id <= 0) return false;
  return userProjectIds === null || (Array.isArray(userProjectIds) && userProjectIds.includes(String(id)));
}

// N-382 (DA-2, DA-D7): pure. Can `role` see the SLA targets block on the Project page?
function canViewSlaTargets(role, cfg = CONFIG) {
  return roleCan(role, 'slaTargetsView', cfg);
}

// N-384 (DA-4): pure. Can `role` see the SLA panel on the Project page?
function canViewSlaPanel(role, cfg = CONFIG) {
  return roleCan(role, 'slaPanelView', cfg);
}

// N-384 (DA-4): pure. Can `role` see the Company Dashboard SLA summary tile?
function canViewSlaPortfolio(role, cfg = CONFIG) {
  return roleCan(role, 'slaPortfolioView', cfg);
}

// N-385 (DA-5): pure. Can `role` use the Report Builder SLA Roll-up module?
function canViewSlaRollupReport(role, cfg = CONFIG) {
  return roleCan(role, 'slaRollupReport', cfg);
}

// N-382 (DA-2, DA-D7): pure. Can `role` edit SLA targets of `kind`? 'override' (one project's
// targets, Project page): the slaTargetsEdit roles. 'default' (company defaults by project type,
// Config Panel): Admin only - the Config Panel's own gate, not a capability. Unknown kind or
// role -> false.
function canEditSlaTargets(role, kind, cfg = CONFIG) {
  if (kind === 'override') return roleCan(role, 'slaTargetsEdit', cfg);
  if (kind === 'default') return role === cfg.ROLE_IDS.ADMIN;
  return false;
}

// N-332: pure. Is `role` an Engagement survey respondent role
// (CONFIG.SURVEY_RESPONDENT_ROLES)? Used for survey.html access and the home
// survey widget. Missing / unknown role or config → false.
function isSurveyRespondentRole(role, cfg = CONFIG) {
  const roles = cfg && cfg.SURVEY_RESPONDENT_ROLES;
  return Array.isArray(roles) && roles.includes(role);
}

// N-332: pure. Does this People row count towards a survey run's
// EligibleCount? Every active employee on the Employee Tracker except the
// levels in CONFIG.SURVEY.EXCLUDED_LEVELS (CSD) — Chris, 14 Oct 2026. Internal
// (non-deployable) staff have no Level, so they count. Callers pass rows from
// getPeople(true), which already drops inactive and placeholder rows; both are
// re-checked here so the test is safe on any row.
function isSurveyEligibleEmployee(person, cfg = CONFIG) {
  if (!person || person.IsActive === false || person.IsPlaceholder) return false;
  const excluded = cfg && cfg.SURVEY && cfg.SURVEY.EXCLUDED_LEVELS;
  return !(Array.isArray(excluded) && excluded.includes(person.Level));
}

// N-285: pure. Is this list named in CONFIG.RESTRICTED_LISTS?
function isRestrictedList(listName, cfg = CONFIG) {
  return Array.isArray(cfg.RESTRICTED_LISTS) && cfg.RESTRICTED_LISTS.includes(listName);
}

// N-285: pure. True only for a Graph 403 (err.status, set by _graphError in
// graph-client.js) on a restricted list. A 403 on any other list, or any other status
// on a restricted one (401, 429, 500, a network failure with no status),
// is a real error and stays one.
function isListAccessDenied(listName, err, cfg = CONFIG) {
  return isRestrictedList(listName, cfg) && !!err && err.status === 403;
}

// N-285: pure. Is a denial-memo timestamp still inside its window?
function isDenialFresh(ts, now, ttlMs) {
  return typeof ts === 'number' && now - ts <= ttlMs;
}

// ── N-367 (PT-7): access scope — UserAssignments → Assignments (pure) ─
// getUserProjectIds / getDefaultUserProjectId (api.js / api-misc.js) choose
// between the two scopes with accessScopeMode(); in 'shadow' mode
// diagnostics.js logs any difference (reportScopeShadow) and Admin → Data
// Health → Access shadow reads it back (groupScopeShadowRows).
const SCOPE_SHADOW_CHECKS = ['projects', 'default'];

// 'legacy' | 'shadow' | 'assignments'. Missing or unknown → 'legacy' (today's
// behaviour), so a typo in config can never switch anyone's access.
function accessScopeMode(cfg = CONFIG) {
  const mode = cfg && cfg.ACCESS_SCOPE && cfg.ACCESS_SCOPE.mode;
  return mode === 'shadow' || mode === 'assignments' ? mode : 'legacy';
}

// An Assignments row that can carry project access: not a forecast, and a real
// ProjectID (bench rows and un-backfilled rows have none).
function _scopeAssignmentRow(a) {
  if (!a || isForecastAssignment(a)) return false;
  const id = Number(a.ProjectID);
  return Number.isInteger(id) && id > 0;
}

// Project IDs (strings, de-duped, first-seen order) from a user's Assignments
// rows — the new visibility scope: non-forecast rows, any dates (Model §Project
// visibility). Callers pass the rows already filtered by UserEmail.
function projectIdsFromAssignments(rows) {
  const ids = [];
  (Array.isArray(rows) ? rows : []).forEach(a => {
    if (!_scopeAssignmentRow(a)) return;
    const id = String(Number(a.ProjectID));
    if (!ids.includes(id)) ids.push(id);
  });
  return ids;
}

// The one project to default a user's Project Dashboard to (S-4): a current
// assignment (start <= today, no end or end >= today), latest start if several;
// with none current, the latest start overall (ended or upcoming). A row with
// no StartDate is never current and sorts last. Ties keep the first seen.
// 'YYYY-MM-DD' string compares only (spDateIn / todayISO from localDayISO).
// No usable row → null.
function defaultProjectIdFromAssignments(rows, todayISO) {
  const list = (Array.isArray(rows) ? rows : []).filter(_scopeAssignmentRow).map(a => ({
    id: String(Number(a.ProjectID)),
    start: a.StartDate ? (spDateIn(a.StartDate) || '') : '',
    end: a.EndDate ? (spDateIn(a.EndDate) || '') : '',
  }));
  if (!list.length) return null;
  const latest = arr => arr.reduce((best, r) => (r.start > best.start ? r : best), arr[0]);
  const current = list.filter(r => r.start && r.start <= todayISO && (!r.end || r.end >= todayISO));
  return (current.length ? latest(current) : latest(list)).id;
}

// Order-insensitive compare of two scopes. Duplicates ignored, IDs compared as
// strings. null (admin: all projects) equals only null.
function diffProjectScopes(legacy, next) {
  if (legacy === null || next === null) {
    const same = legacy === next;
    return { onlyLegacy: [], onlyNext: [], same };
  }
  const a = [...new Set((legacy || []).map(String))];
  const b = [...new Set((next || []).map(String))];
  const onlyLegacy = a.filter(id => !b.includes(id));
  const onlyNext = b.filter(id => !a.includes(id));
  return { onlyLegacy, onlyNext, same: !onlyLegacy.length && !onlyNext.length };
}

// Diagnostics.Message for a shadow row, and its reader. 'default' uses 0- or
// 1-element arrays. parse → null on anything it did not write.
function buildScopeShadowMessage(check, legacy, next) {
  return JSON.stringify({ v: 1, check, legacy: (legacy || []).map(String), next: (next || []).map(String) });
}
function parseScopeShadowMessage(msg) {
  try {
    const m = JSON.parse(String(msg));
    if (!m || m.v !== 1 || !SCOPE_SHADOW_CHECKS.includes(m.check)) return null;
    if (!Array.isArray(m.legacy) || !Array.isArray(m.next)) return null;
    return { check: m.check, legacy: m.legacy.map(String), next: m.next.map(String) };
  } catch (e) {
    return null;
  }
}

// The localStorage day-store ({ day, keys }) behind "one row per user per
// check per day". A store from another day, or any bad shape, counts as empty.
function _scopeShadowKeysFor(store, todayISO) {
  return store && store.day === todayISO && Array.isArray(store.keys) ? store.keys : [];
}
function scopeShadowLoggedToday(store, key, todayISO) {
  return _scopeShadowKeysFor(store, todayISO).includes(key);
}
function scopeShadowMark(store, key, todayISO) {
  const keys = _scopeShadowKeysFor(store, todayISO).filter(k => k !== key);
  return { day: todayISO, keys: [...keys, key] };
}

// Data Health → Access shadow: shadow rows (ErrorType = shadowErrorType) from
// getDiagnostics(), grouped by user + check + the two scopes. Unreadable rows
// group by user with check null, so they can still be acknowledged.
// days = distinct UTC dates the group was logged on. Newest first.
function groupScopeShadowRows(rows, cfg = CONFIG) {
  const type = cfg && cfg.ACCESS_SCOPE && cfg.ACCESS_SCOPE.shadowErrorType;
  const groups = new Map();
  (Array.isArray(rows) ? rows : []).forEach(r => {
    if (!r || !type || r.ErrorType !== type) return;
    const user = String(r.UserEmail || '').toLowerCase();
    const msg = parseScopeShadowMessage(r.Message);
    const key = msg
      ? [user, msg.check, msg.legacy.slice().sort().join(','), msg.next.slice().sort().join(',')].join('|')
      : user + '|?';
    if (!groups.has(key)) {
      const d = msg ? diffProjectScopes(msg.legacy, msg.next) : { onlyLegacy: [], onlyNext: [] };
      groups.set(key, {
        userEmail: user, check: msg ? msg.check : null,
        legacy: msg ? msg.legacy : [], next: msg ? msg.next : [],
        onlyLegacy: d.onlyLegacy, onlyNext: d.onlyNext,
        ids: [], dayset: new Set(), lastSeen: '',
      });
    }
    const g = groups.get(key);
    g.ids.push(r.id);
    const at = String(r.OccurredAt || '');
    const day = spDateIn(at);
    if (day) g.dayset.add(day);
    if (at > g.lastSeen) g.lastSeen = at;
  });
  return [...groups.values()]
    .map(({ dayset, ...g }) => ({ ...g, days: dayset.size }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
