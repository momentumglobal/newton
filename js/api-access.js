// js/api-access.js — who the signed-in user is and what they may touch (N-476, R3-7,
// moved from api.js): effective role (getEffectiveRole + the Ghost Mode gate), project
// scope (getUserProjectIds and the ACCESS_SCOPE fail-closed check), the project / role /
// template write gates, and the UserAssignments / Assignments directory readers.
// SECURITY-CRITICAL. Loads straight after api.js on every shell that loads api.js and in
// CONFIG.MCP.scripts (the MCP gate calls getEffectiveRole). Every function here is
// called at run time only, so api.js may call into it (getUserProjectIds, _ensureGhostGate).

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

// Role of `lower`, resolved from the lists. Shared by getEffectiveRole() and
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
  return { role: resolveRoleFromAssignments(assignments, isLeadership) };
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
  try { sessionStorage.removeItem('newton_dm_grants_' + lower); } catch (e) { /* legacy key, N-282; grants retired N-370 */ }
  // N-296: no role cache — a stored role is never read. Purge any legacy entry.
  try { sessionStorage.removeItem('newton_role_' + lower); } catch (e) { /* legacy key, N-296 */ }

  const { role } = await _resolveRoleForEmail(lower);
  if (subjectIsReal) _setGhostRealAdmin(role === 'admin');

  return role;
}
 
// getUserProjectIds — defined above with admin null handling
 
// N-368 (PT-8, C-4): the TP / DM picker for one project — role, placement, weekly and
// mobile role forms, briefing-pack Reassign and getScopedTpEmails (analytics.js).
// The project's Project Team (Assignments by the indexed ProjectID) whose write window
// is open, kept to people whose functional role (UserAssignments) is TP or
// DM — projectTeamPickerRows (permissions.js). A bad project id gives [] (S-5); so does
// a bad CONFIG.ACCESS_SCOPE.mode (N-472, fails closed).
async function getTalentPartnersForProject(projectId, includeEmail = null) {
  if (!_accessScopeOk()) return [];
  const pid = Number(projectId);
  if (!Number.isInteger(pid) || pid <= 0) return [];
  const [team, people] = await Promise.all([
    getItems("Assignments", `fields/ProjectID eq ${pid}`),
    getItems("UserAssignments"),
  ]);
  return projectTeamPickerRows(team, people, localDayISO(), includeEmail);
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

// N-398 (BP-2) / N-368 (PT-8, C-3): project ids on which the user acts as a Delivery
// Manager (briefing-pack Reassign). Ghost-aware and the same UserAssignments read as
// getUserProjectIds (a cache hit when that has already run; two concurrent calls each
// make the request). The user's functional role is delivery_manager AND the project is
// in their Project Team scope — dmProjectIdsFromScope (permissions.js). A bad
// CONFIG.ACCESS_SCOPE.mode arrives here as an empty scope (N-472). The Reassign
// candidate list is getTalentPartnersForProject.
async function getDmProjectIds(email) {
  await _ensureGhostGate();
  const lower = (getGhostUser() || email).toLowerCase();
  const rows = await getItems("UserAssignments", `fields/Title eq '${odataStr(lower)}'`);
  return dmProjectIdsFromScope(rows, await getUserProjectIds(lower));
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
// so getUserProjectIds and getDefaultUserProjectId share one request.
async function _getAssignmentsForUser(lower) {
  return getItems("Assignments", `fields/UserEmail eq '${odataStr(lower)}'`);
}

// N-455 (MM-5): everything My History shows, in one parallel read. `lower` = the person's People.WorkEmail, lower-cased
// (Ghost-aware: the caller passes the ghosted person's). Assignments by the indexed UserEmail column, every Project, and
// all-time placements (the scorecard's hires rule runs over them). A failed hires read resolves `placements` to null so the
// tiles that do not need it still render; the other two reads must succeed, or this rejects.
async function getMyHistoryData(lower) {
  const [assignments, projects, placements] = await Promise.all([
    _getAssignmentsForUser(lower),
    getProjects(false),
    getHistoricalPlacements({ allTime: true }).catch(e => { console.warn('N-455: hires read failed', e); return null; }),
  ]);
  return { assignments, projects, placements };
}

// N-472 (R3-D2): the Project Team is the only scope source. Any CONFIG.ACCESS_SCOPE.mode
// other than 'assignments' (accessScopeValid, permissions.js) fails closed — the callers
// return an empty scope — and is reported once per page load: a console warning and a
// Diagnostics row (ErrorType 'config', shown in Error Telemetry). diagnostics.js loads
// after api.js and is absent under MCP and in the Node runner, hence the typeof guard.
let _accessScopeWarned = false;
function _accessScopeOk() {
  if (accessScopeValid()) return true;
  if (!_accessScopeWarned) {
    _accessScopeWarned = true;
    const msg = accessScopeMisconfigMessage(CONFIG.ACCESS_SCOPE && CONFIG.ACCESS_SCOPE.mode);
    console.warn(msg);
    if (typeof reportError === 'function') reportError('config', msg, '');
  }
  return false;
}

// Return all project IDs this user is assigned to (null = admin, sees all).
// N-162: resolves against the ghosted user's real assignments when Ghost
// Mode is active, instead of a single manually-picked ghost project.
// N-367 / N-368: the user's non-forecast Project Team (Assignments) rows, any
// dates. N-472: a bad CONFIG.ACCESS_SCOPE.mode gives [] (_accessScopeOk).
async function getUserProjectIds(email) {
  await _ensureGhostGate();   // N-282: getGhostUser() is only valid after the gate
  const lower = (getGhostUser() || email).toLowerCase();
  const assignments = await getItems("UserAssignments", `fields/Title eq '${odataStr(lower)}'`);
  // N-281: an active admin row sees all projects. Checked before the mode, so a bad
  // mode never locks Admin out.
  if (assignments.some(isAdminAssignment)) return null;
  if (!_accessScopeOk()) return [];
  return projectIdsFromAssignments(await _getAssignmentsForUser(lower));
}

async function getScopedProjects(email, activeOnly = false) {
  const projectIds = await getUserProjectIds(email);
  const allProjects = await getProjects(activeOnly);
  if (projectIds === null) return allProjects;
  return allProjects.filter(p => projectIds.includes(String(p.id)));
}

// N-369 (PT-9, D-2): the projects this user can WRITE (null = all, an active admin row).
// Ghost-aware and the same cached reads as getUserProjectIds: the user's Assignments
// rows whose write window is open today (writableProjectIdsFromAssignments,
// permissions.js). A bad CONFIG.ACCESS_SCOPE.mode gives [] (N-472, fails closed).
// Admin / Leadership / People Ops pass canWriteProject whatever this returns.
async function getUserWritableProjectIds(email) {
  await _ensureGhostGate();   // N-282: getGhostUser() is only valid after the gate
  const lower = (getGhostUser() || email).toLowerCase();
  const assignments = await getItems("UserAssignments", `fields/Title eq '${odataStr(lower)}'`);
  if (assignments.some(isAdminAssignment)) return null;
  if (!_accessScopeOk()) return [];
  return writableProjectIdsFromAssignments(await _getAssignmentsForUser(lower), localDayISO());
}

// N-369: the user's scoped projects they can write — form project pickers.
async function getWritableScopedProjects(email, activeOnly = false) {
  const [projects, ids] = await Promise.all([getScopedProjects(email, activeOnly), getUserWritableProjectIds(email)]);
  if (ids === null) return projects;
  return projects.filter(p => ids.includes(String(p.id)));
}

// N-369 (S-5b): run immediately before a write. { ok, reason } for the signed-in user (the
// ghosted user in Ghost Mode). Fails closed: a read error means nothing is saved.
const PROJECT_WRITE_CHECK_FAILED = "Couldn't check your access to this project — nothing saved.";
async function checkProjectWrite(projectId) {
  try {
    const email = getCurrentUser().email;
    const [role, ids] = await Promise.all([getEffectiveRole(email), getUserWritableProjectIds(email)]);
    return canWriteProject(role, projectId, ids) ? { ok: true, reason: '' } : { ok: false, reason: projectReadOnlyMessage() };
  } catch (e) {
    console.warn('N-369: project write check failed', e);
    return { ok: false, reason: PROJECT_WRITE_CHECK_FAILED };
  }
}

// N-369: the same check through a role's project (placements, rejections, stage changes).
async function checkRoleWrite(roleId) {
  let role;
  try {
    role = await getItem('Roles', roleId);
  } catch (e) {
    console.warn('N-369: role read for the write check failed', e);
    return { ok: false, reason: PROJECT_WRITE_CHECK_FAILED };
  }
  return checkProjectWrite(role ? (role.ProjectIDLookupId ?? role.ProjectID) : null);
}

// N-369: every distinct role's project must be writable — an edit that can move a record
// checks its stored role and its new one. First refusal wins; blank ids are skipped; no
// id at all fails closed.
async function checkRoleWrites(...roleIds) {
  const ids = [...new Set(roleIds.filter(id => id !== null && id !== undefined && id !== '').map(String))];
  if (!ids.length) return { ok: false, reason: PROJECT_WRITE_CHECK_FAILED };
  for (const id of ids) {
    const w = await checkRoleWrite(id);
    if (!w.ok) return w;
  }
  return { ok: true, reason: '' };
}

// ── N-427 (TPL-1): Briefing Pack & Report templates ──────────────────
// Fresh, fail-closed Admin check for any template write. getEffectiveRole (no role cache,
// ghost-aware) — never the page-load _resolvedRole — so a revoked admin, or an admin in
// Ghost Mode as a non-admin, is refused. Same { ok, reason } shape as checkProjectWrite.
async function checkTemplateManage() {
  try {
    const role = await getEffectiveRole(getCurrentUser().email);
    return canManageTemplates(role)
      ? { ok: true, reason: '' }
      : { ok: false, reason: CONFIG.TEMPLATES.MESSAGES.adminOnly };
  } catch (e) {
    console.warn('N-427: template permission check failed', e);
    return { ok: false, reason: CONFIG.TEMPLATES.MESSAGES.checkFailed };
  }
}

// Before updating or deleting item `id` of `listName`: a template needs
// checkTemplateManage, an ordinary item passes. getItem is uncached. A read failure
// refuses (fail closed).
async function checkTemplateWrite(listName, id) {
  let item;
  try {
    item = await getItem(listName, id);
  } catch (e) {
    console.warn('N-427: template read for the write check failed', e);
    return { ok: false, reason: CONFIG.TEMPLATES.MESSAGES.checkFailed };
  }
  return isTemplateRow(item) ? checkTemplateManage() : { ok: true, reason: '' };
}

// ── N-530: Config Panel for Delivery Managers ────────────────────────
// Fresh, fail-closed checks before a Config Panel write. Same { ok, reason } shape as
// checkProjectWrite. getEffectiveRole is uncached and ghost-aware, so a revoked DM, or an
// Admin ghosting a non-DM, is refused.
const CONFIG_PANEL_CHECK_FAILED   = "Couldn't check your access — nothing changed.";
const CONFIG_PANEL_NOT_ALLOWED    = "You can't do that in the Config Panel — nothing changed.";
const ADMIN_DELETE_OUT_OF_SCOPE   = "You can only delete records on projects you can currently edit — nothing deleted.";

// `cap` is a CONFIG.ROLE_CAPABILITIES key (configFunctionalAreas, configChecklistItems).
async function checkConfigPanelCapability(cap) {
  try {
    const role = await getEffectiveRole(getCurrentUser().email);
    return roleCan(role, cap) ? { ok: true, reason: '' } : { ok: false, reason: CONFIG_PANEL_NOT_ALLOWED };
  } catch (e) {
    console.warn('N-530: Config Panel permission check failed', e);
    return { ok: false, reason: CONFIG_PANEL_CHECK_FAILED };
  }
}

// Before a Delete Records delete. Admin passes untouched. A DM: the list must be one of theirs,
// the record's project (read fresh, through its role for Activity / Placements / Rejections)
// must be one they can write, and an unresolvable project refuses.
async function checkAdminDelete(listName, id) {
  try {
    const email = getCurrentUser().email;
    const role = await getEffectiveRole(email);
    if (hasFullConfigPanel(role)) return { ok: true, reason: '' };
    if (!adminDeleteLists(role, [listName]).length) return { ok: false, reason: CONFIG_PANEL_NOT_ALLOWED };
    const record = await getItem(listName, id);
    const rolesById = {};
    const rid = record && (record.RoleIDLookupId || record.RoleID);
    if (listName !== 'Roles' && rid) {
      const r = await getItem('Roles', rid);
      if (r) rolesById[String(rid)] = r;
    }
    const projectId = adminDeleteRecordProjectId(listName, record, rolesById);
    const writable = await getUserWritableProjectIds(email);
    return canDeleteAdminRecord(role, listName, projectId, writable)
      ? { ok: true, reason: '' }
      : { ok: false, reason: ADMIN_DELETE_OUT_OF_SCOPE };
  } catch (e) {
    console.warn('N-530: Config Panel delete check failed', e);
    return { ok: false, reason: CONFIG_PANEL_CHECK_FAILED };
  }
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
