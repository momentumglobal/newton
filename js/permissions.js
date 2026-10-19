// js/permissions.js — pure role / permission rules: reads CONFIG only, no network I/O, no DOM (N-346c)
// Moved out of utils.js. Owns role resolution (N-281), capability and org-wide role
// checks (N-331), survey respondent / eligibility rules (N-332) and the restricted-list
// and denial-memo helpers (N-285). Behaviour is unchanged from the utils.js originals.
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
