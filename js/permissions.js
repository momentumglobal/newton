// js/permissions.js — pure role / permission rules: reads CONFIG only, no network I/O, no DOM (N-346c)
// Moved out of utils.js. Owns role resolution (N-281), capability and org-wide role
// checks (N-331), survey respondent / eligibility rules (N-332) and the restricted-list
// and denial-memo helpers (N-285). Behaviour is unchanged from the utils.js originals.
// N-367 / N-368 add the access-scope helpers (Project Team epic) at the end of the file. They
// call isForecastAssignment, spDateIn and addDaysISO (utils.js, which loads first) at call
// time only. They live here, not in project-team.js, because that file is not loaded on
// index.html or mobile.html.
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

// N-388 fix: pure. The project-id scope a portfolio loader applies. getUserProjectIds returns null
// only for an active admin row; Leadership / People Ops get a list (often empty), so a loader that
// trusts it alone shows them nothing. A role that seesAllProjects gets null (all); anyone else
// keeps their list. A missing role fails closed (the list is used as given).
function projectScopeForRole(role, projectIds, cfg = CONFIG) {
  return seesAllProjects(role, cfg) ? null : projectIds;
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

// N-398 (BP-2): pure. Project ids (strings, de-duped, first-seen order) on which these
// UserAssignments rows make the user an ACTIVE Delivery Manager. Role-independent: a
// Leadership user holding an explicit DM row counts. Active undefined counts as active.
function dmProjectIdsFromAssignments(rows, cfg = CONFIG) {
  const ids = [];
  (Array.isArray(rows) ? rows : []).forEach(a => {
    if (!a || a.AssignedRole !== cfg.ROLE_IDS.DELIVERY_MANAGER || a.Active === false) return;
    const id = Number(a.ProjectID);
    if (!Number.isInteger(id) || id <= 0) return;
    if (!ids.includes(String(id))) ids.push(String(id));
  });
  return ids;
}

// N-398 (BP-2): pure. Can this user reassign briefing pack `pack`'s owner? The owner, an
// Admin, or a Delivery Manager on the pack's project — `dmProjectIds` is
// dmProjectIdsFromAssignments() of the user's rows (getDmProjectIds, api.js). A pack with
// no real ProjectID has no DM route. UI-level only: BriefingPacks is plain Contribute, so
// like Delete this is not enforced by SharePoint. Fails closed on a missing pack, a blank
// email or a malformed list.
function canReassignBriefingPack(role, email, pack, dmProjectIds, cfg = CONFIG) {
  if (!pack) return false;
  if (role === cfg.ROLE_IDS.ADMIN) return true;
  const me = String(email || '').trim().toLowerCase();
  const owner = String(pack.PackOwner || '').trim().toLowerCase();
  if (me && owner && me === owner) return true;
  const id = Number(pack.ProjectID);
  if (!Number.isInteger(id) || id <= 0) return false;
  return Array.isArray(dmProjectIds) && dmProjectIds.includes(String(id));
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

// N-388 (DA-8): pure. Can `role` open the Rejection Intelligence tab (Rejected Offers page)?
function canViewRejectionIntel(role, cfg = CONFIG) {
  return roleCan(role, 'rejectionIntelView', cfg);
}

// N-388 (DA-8): pure. May `role` see benchmark / offer AMOUNTS (not just the % gap)? Admin, Leadership.
function canViewRejectionIntelFigures(role, cfg = CONFIG) {
  return roleCan(role, 'rejectionIntelFigures', cfg);
}

// N-388 (DA-8): pure. May `role` see the candidate-level Rejected Offers list? Leadership may not.
function canViewRejectionsList(role, cfg = CONFIG) {
  return roleCan(role, 'rejectionsList', cfg);
}

// N-388 (DA-8): pure. Can `role` use the Report Builder Rejection Intelligence module?
function canViewRejectionIntelReport(role, cfg = CONFIG) {
  return roleCan(role, 'rejectionIntelReport', cfg);
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

// ── N-367 / N-368 (PT-7, PT-8): access scope — the Project Team (pure) ─
// getUserProjectIds, getTalentPartnersForProject, getDmProjectIds (api.js) and
// getDefaultUserProjectId (api-misc.js) pick their source with accessScopeMode().
// Since the N-368 cutover that is the Project Team (Assignments); 'legacy'
// (UserAssignments project rows) is the kill switch. The N-367 shadow
// comparison is retired; its old Diagnostics rows stay (Error Telemetry skips them).

// 'legacy' | 'assignments'. Missing or unknown — including the retired 'shadow'
// — → 'legacy', so a config typo always lands on the kill-switch state (C-2).
function accessScopeMode(cfg = CONFIG) {
  const mode = cfg && cfg.ACCESS_SCOPE && cfg.ACCESS_SCOPE.mode;
  return mode === 'assignments' ? mode : 'legacy';
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

// N-368 (PT-8, S-3 / S-4): the TP / DM picker for one project. `teamRows` = the
// project's Assignments rows (already filtered by ProjectID); `userAssignmentRows` =
// UserAssignments rows for any users (functional role only). A team row qualifies when
// it can carry access (_scopeAssignmentRow: non-forecast, a real ProjectID — bench rows
// have none), has a UserEmail, and its write window is open on `todayISO`: from row
// creation (upcoming rows count) until EndDate + CONFIG.PROJECT_TEAM.WRITE_GRACE_DAYS;
// no EndDate = open, an unreadable EndDate = closed. The person's role
// (resolveRoleFromAssignments on their UserAssignments rows, leadership not applied) must
// be talent_partner or delivery_manager. `includeEmail` (weekly-form edit) keeps that
// person on any qualifying row whatever its dates or their role. De-duped by email,
// first qualifying row wins. Output keeps the UserAssignments row shape the callers read:
// UserEmail is the person's UserAssignments spelling when there is one (so a stored
// TalentPartner value matches the old picker exactly), else the Assignments value.
// 'YYYY-MM-DD' string compares only (spDateIn / addDaysISO).
function projectTeamPickerRows(teamRows, userAssignmentRows, todayISO, includeEmail = null, cfg = CONFIG) {
  const keep = includeEmail ? String(includeEmail).trim().toLowerCase() : '';
  const grace = Number(cfg.PROJECT_TEAM && cfg.PROJECT_TEAM.WRITE_GRACE_DAYS) || 0;
  const pickRoles = [cfg.ROLE_IDS.TALENT_PARTNER, cfg.ROLE_IDS.DELIVERY_MANAGER];
  const uaByEmail = new Map();
  (Array.isArray(userAssignmentRows) ? userAssignmentRows : []).forEach(u => {
    const e = String((u && (u.UserEmail || u.Title)) || '').trim().toLowerCase();
    if (!e) return;
    if (!uaByEmail.has(e)) uaByEmail.set(e, []);
    uaByEmail.get(e).push(u);
  });
  const windowOpen = a => {
    if (!a.EndDate) return true;
    const end = spDateIn(a.EndDate);
    const last = end ? addDaysISO(end, grace) : null;
    return !!last && todayISO <= last;
  };
  const out = [];
  const seen = new Set();
  (Array.isArray(teamRows) ? teamRows : []).forEach(a => {
    if (!_scopeAssignmentRow(a)) return;
    const email = String(a.UserEmail || '').trim().toLowerCase();
    if (!email || seen.has(email)) return;
    const ua = uaByEmail.get(email) || [];
    const role = resolveRoleFromAssignments(ua, false);
    if (email !== keep && (!pickRoles.includes(role) || !windowOpen(a))) return;
    seen.add(email);
    const named = ua.find(u => u && u.UserEmail);
    out.push({
      UserEmail:    (named && named.UserEmail) || email,
      UserName:     a.EmployeeName || (named && named.UserName) || email,
      AssignedRole: role,
      Active:       true,
      ProjectID:    Number(a.ProjectID),
    });
  });
  return out;
}

// N-368 (PT-8, C-3): the projects on which the user acts as a Delivery Manager in
// 'assignments' mode — their functional role (resolveRoleFromAssignments on their
// UserAssignments rows, leadership not applied) is delivery_manager AND the project is
// in their Assignments scope (`projectIds` from getUserProjectIds). Strings, de-duped,
// scope order. Any other role, or a null (admin) / missing scope → [] (Admin passes
// canReassignBriefingPack on its own).
function dmProjectIdsFromScope(userAssignmentRows, projectIds, cfg = CONFIG) {
  if (!Array.isArray(projectIds)) return [];
  if (resolveRoleFromAssignments(userAssignmentRows, false) !== cfg.ROLE_IDS.DELIVERY_MANAGER) return [];
  return [...new Set(projectIds.map(String))];
}
