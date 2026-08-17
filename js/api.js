// js/api.js — Graph API data layer
const GRAPH = "https://graph.microsoft.com/v1.0";
 
// ── In-memory read cache ──────────────────────────────────────────────
// Caches GET results for 30 seconds to avoid redundant SharePoint calls
// during page navigation. Writes (POST/PATCH/DELETE) invalidate the
// relevant list automatically.
const _apiCache = new Map();
const _CACHE_TTL_MS = 30000; // 30 seconds
 
function _cacheKey(listName, filter, selectStr) {
  return listName + '|' + (filter || '') + '|' + (selectStr || '*');
}
function _cacheGet(listName, filter, selectStr) {
  const entry = _apiCache.get(_cacheKey(listName, filter, selectStr));
  if (!entry) return null;
  if (Date.now() - entry.ts > _CACHE_TTL_MS) {
    _apiCache.delete(_cacheKey(listName, filter, selectStr));
    return null;
  }
  return entry.data;
}
function _cacheSet(listName, filter, selectStr, data) {
  _apiCache.set(_cacheKey(listName, filter, selectStr), { ts: Date.now(), data });
}
function _cacheInvalidate(listName) {
  // Remove all cached entries for this list (any filter)
  for (const key of _apiCache.keys()) {
    if (key.startsWith(listName + '|')) _apiCache.delete(key);
  }
}
 
// ── Field normalisers ───────────────────────────────────────────────
const FIELD_ALIASES = {
  Projects:        { Title: "CustomerName" },
  Roles:           { Title: "RoleTitle", Yeare: "Year", Currency: "Location" },
  WeeklyActivity:  { Title: "ActivityTitle", Yeare: "Year", InterviewTwoPlus: "Interview2Plus" },
  Placements:      { Title: "CandidateName", Yeare: "Year" },
  RejectedOffers:  { Title: "CandidateName", Yeare: "Year" },
  UserAssignments: { Title: "UserEmail" },
  LeadershipAccess:{ Title: "UserEmail" },
  Departments:     { Title: "DepartmentName" },
  SavedReports:    {},
  MarketReports:   { Title: "ReportTitle" },
  // ── People module ─────────────────────────────────────────
  People:          { Title: "EmployeeName" },
  Assignments:     { Title: "AssignmentID" },
  GPInvoices:      { Title: "InvoiceNumber" },
  // ── Sales module ──────────────────────────────────────────
  SalesForecasts:  {},
  // ── Command Centre ────────────────────────────────────────
  CCStatus:        {},
  // ── Engagement ────────────────────────────────────────────
  SurveyTemplates:   {},
  SurveyQuestions:   {},
  SurveyRuns:        {},
  SurveyResponses:   {},
  SurveyCompletions: {},
  // ── Notifications ─────────────────────────────────────────
  Notifications: {},
  // ── Time-series snapshots (N-085 / L-1a) ────────────────────
  Snapshots: {},
  // ── CoE Hiring Plan ───────────────────────────────────────
  CoEPlanRows:     {},
  CoEPlanForecast: {},
  // ── LCI Cost Model ────────────────────────────────────────
  LCIModels:       {},
  LCIModelRows:    {},
  LCIMilestones:   {},
  LCIReports:      {},
  LCILocations:    {},
};
 
function normaliseFields(listName, fields) {
  const aliases = FIELD_ALIASES[listName];
  if (!aliases) return fields;
  const result = { ...fields };
  for (const [internal, display] of Object.entries(aliases)) {
    if (internal in result) {
      result[display] = result[internal];
      delete result[internal];
    }
  }
  return result;
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

// ── Generic helpers ─────────────────────────────────────────────────
async function graphRequest(method, path, body = null) {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const opts = {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  // N-082: retry 429/503 only — throttle responses were rejected, not
  // applied, so re-POSTing is safe. Everything else throws immediately.
  const { maxAttempts, baseDelayMs } = CONFIG.GRAPH_RETRY;
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`${GRAPH}${path}`, opts);
    if ((res.status === 429 || res.status === 503) && attempt < maxAttempts) {
      const ra = Number(res.headers.get('Retry-After'));
      const waitMs = ra > 0 ? ra * 1000 : baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }
    break;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
 
function listPath(listName) {
  return `/sites/${CONFIG.SP_SITE_ID}/lists/${listName}/items`;
}
function listColumnsPath(listName) {
  return `/sites/${CONFIG.SP_SITE_ID}/lists/${listName}/columns`;
}
 
// ── Read ─────────────────────────────────────────────────────────────
// `select`, if passed, is a comma-separated string of internal SharePoint
// field names. No caller passes it yet — CONFIG.LIST_FIELDS is empty and
// every existing call site is intentionally left on '*' (see N-050 QA:
// two callers already carried an unaudited third argument here that broke
// People Scorecards when activated; that argument is now dropped at the
// call sites below, pending the full field audit in N-052/N-053).
// If select is omitted, resolves from CONFIG.LIST_FIELDS[listName] when
// present and non-empty; otherwise falls back to '*' (today's behaviour).
async function getItems(listName, filter = "", select = null) {
  let selectStr = select;
  if (!selectStr) {
    const manifestFields = CONFIG.LIST_FIELDS && CONFIG.LIST_FIELDS[listName];
    if (Array.isArray(manifestFields) && manifestFields.length) {
      selectStr = manifestFields.includes('Id') ? manifestFields.join(',') : ['Id', ...manifestFields].join(',');
    } else {
      selectStr = '*';
    }
  }

  const cached = _cacheGet(listName, filter, selectStr);
  if (cached) return cached;
 
  const qs = filter ? `?$expand=fields($select=${selectStr})&$filter=${encodeURIComponent(filter)}` : `?$expand=fields($select=${selectStr})`;
  let url = `${listPath(listName)}${qs}`;
  const items = [];
  while (url) {
    const data = await graphRequest("GET", url);
    items.push(...data.value.map(i => ({ id: i.id, ...normaliseFields(listName, i.fields) })));
    url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(GRAPH, '') : null;
  }
 
  _cacheSet(listName, filter, selectStr, items);
  return items;
}
 
// NOTE: getItem() (single-item read, below) intentionally keeps
// fields($select=*) — it's a low-volume detail fetch, not a list scan, so
// it's out of scope for F-1 projection.
async function getItem(listName, itemId) {
  const data = await graphRequest("GET", `${listPath(listName)}/${itemId}?$expand=fields($select=*)`);
  return { id: data.id, ...normaliseFields(listName, data.fields) };
}

// ── Data Health (F-10 / N-092) ──────────────────────────────────────
// Row count only — id-only $select, same nextLink pagination as getItems.
// Deliberately NOT $count/ConsistencyLevel:eventual: that combination is
// inconsistently supported on SharePoint-backed list items in Graph v1.0.
async function getListItemCount(listName) {
  const items = await getItems(listName, "", "Id");
  return items.length;
}

// Raw columnDefinition[] for a list — includes system columns; callers filter.
async function getListColumns(listName) {
  const data = await graphRequest("GET", listColumnsPath(listName));
  return data.value || [];
}

// { name, id, indexed }[] for just the requested internal column names.
async function getColumnIndexStatus(listName, columnNames) {
  const columns = await getListColumns(listName);
  return columns
    .filter(c => columnNames.includes(c.name))
    .map(c => ({ name: c.name, id: c.id, indexed: !!c.indexed }));
}

// Schema mutation, not a data write — no _cacheInvalidate (doesn't touch
// item cache). Caller must confirm with the user before calling this.
async function setColumnIndexed(listName, columnId) {
  return graphRequest("PATCH", `${listColumnsPath(listName)}/${columnId}`, { indexed: true });
}
 
// ── Write ─────────────────────────────────────────────────────────────
async function createItem(listName, fields) {
  const result = await graphRequest("POST", listPath(listName), { fields });
  _cacheInvalidate(listName);
  return result;
}
async function updateItem(listName, itemId, fields) {
  const result = await graphRequest("PATCH", `${listPath(listName)}/${itemId}`, { fields });
  _cacheInvalidate(listName);
  return result;
}
async function deleteItem(listName, itemId) {
  const result = await graphRequest("DELETE", `${listPath(listName)}/${itemId}`);
  _cacheInvalidate(listName);
  return result;
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
 
async function getHistoricalPlacements() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  // No select passed — the field list this used to carry was incomplete
  // (missing TalentPartner, silently breaking tpEmail below once select
  // support went live; see N-050 QA). Stays on '*' until N-052 audits and
  // re-adds a correct list.
  const roles = await getItems('Roles',
    `fields/Stage eq 'Hired' and fields/ActualHireDate ge '${localDayISO(cutoff)}'`
  );
  return roles.map(r => ({
    id:            r.id,
    title:         r.RoleTitle,
    functionArea:  r.Department,
    country:       r.Location,
    openDate:      r.OpenDate,
    placementDate: r.ActualHireDate,
    tpEmail:       r.TalentPartner || null,
  }));
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
    `fields/WeekEndingDate ge '${cutoffDay}'`
  );
  return activity;
}
 
async function getWeeklyActivity(projectId, roleId) {
  let filter = "";
  if (projectId) filter = `fields/ProjectID eq ${projectId}`;
  if (roleId)    filter = `fields/RoleID eq ${roleId}`;
  return getItems("WeeklyActivity", filter);
}
 
async function getPlacements(roleId) {
  return getItems("Placements", roleId ? `fields/RoleID eq ${roleId}` : "");
}
 
async function getRejectedOffers(roleId) {
  return getItems("RejectedOffers", roleId ? `fields/RoleID eq ${roleId}` : "");
}
 
// ── Admin list helpers ───────────────────────────────────────────────
async function getUserAssignments(projectId) {
  return getItems("UserAssignments",
    projectId ? `fields/ProjectID eq ${projectId}` : "");
}
 
async function getLeadershipAccess() {
  return getItems("LeadershipAccess");
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
 
async function deleteSalesForecast(id) {
  return deleteItem("SalesForecasts", id);
}
 
// ── CoE Hiring Plan ─────────────────────────────────────────────────
async function getCoEPlanRows(projectId) {
  return getItems("CoEPlanRows", `fields/ProjectID eq ${projectId}`);
}
async function createCoEPlanRow(payload) {
  return createItem("CoEPlanRows", payload);
}
async function updateCoEPlanRow(id, payload) {
  return updateItem("CoEPlanRows", id, payload);
}
async function deleteCoEPlanRow(id) {
  return deleteItem("CoEPlanRows", id);
}
async function getCoEPlanForecast(projectId) {
  return getItems("CoEPlanForecast", `fields/ProjectID eq ${projectId}`);
}
async function saveCoEForecastMonth(projectId, monthISO, hires, existingId = null) {
  if (existingId) return updateItem("CoEPlanForecast", existingId, { ForecastedHires: hires });
  // N-130: isoDate() puts ForecastMonth on the same midday-UTC convention as
  // every other CoE date. Existing rows keep their legacy shape — nothing is
  // migrated — and spMonthIn() on the read side handles both.
  return createItem("CoEPlanForecast", { ProjectID: projectId, ForecastMonth: isoDate(monthISO), ForecastedHires: hires });
}

// ── LCI Cost Model ──────────────────────────────────────────────────
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
async function createLCIRow(fields) {
  return createItem("LCIModelRows", fields);
}
async function updateLCIRow(id, fields) {
  return updateItem("LCIModelRows", id, fields);
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
async function updateLCIMilestone(id, fields) {
  return updateItem("LCIMilestones", id, fields);
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

// ── LCI Reports (saved report definitions) ──────────────────────────
async function getLCIReports() {
  return getItems("LCIReports");
}
async function getLCIReportById(id) {
  return getItem("LCIReports", id);
}
async function createLCIReport(fields) {
  return createItem("LCIReports", fields);
}
async function updateLCIReport(id, fields) {
  return updateItem("LCIReports", id, fields);
}
async function deleteLCIReport(id) {
  return deleteItem("LCIReports", id);
}

async function getDepartments() {
  return getItems("Departments", "");
}

// ── LCI Lead Magnet locations ───────────────────────────────────────
async function getLCILocations() {
  return getItems("LCILocations");
}
async function createLCILocation(fields) {
  return createItem("LCILocations", fields);
}
async function updateLCILocation(id, fields) {
  return updateItem("LCILocations", id, fields);
}
async function deleteLCILocation(id) {
  return deleteItem("LCILocations", id);
}

// Resolve the signed-in user's effective role:
// 1. Check ADMIN_USERS in config.js
// 2. Check LeadershipAccess list
// 3. Check UserAssignments list
// 4. Fall back to 'viewer'
async function getEffectiveRole(email) {
  // Ghost mode — admin testing a different role profile
  const ghost = getGhostRole();
  if (ghost) return ghost;
 
  const lower = email.toLowerCase();
  const cacheKey = 'newton_role_' + lower;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return cached;
 
  let role;
  if (CONFIG.ADMIN_USERS?.includes(lower)) {
    role = 'admin';
  } else {
    const leadership = await getLeadershipAccess();
    if (leadership.some(l => l.UserEmail?.toLowerCase() === lower)) {
      role = 'leadership';
      // Leadership user may ALSO hold explicit DM assignments — cache those project IDs
      const assignments = await getItems("UserAssignments",
        `fields/Title eq '${lower}'`);
      const dmProjects = assignments
        .filter(a => a.AssignedRole === 'delivery_manager' && a.ProjectID && a.ProjectID !== 0)
        .map(a => String(a.ProjectID));
      sessionStorage.setItem('newton_dm_grants_' + lower, JSON.stringify(dmProjects));
    } else {
      const assignments = await getItems("UserAssignments",
        `fields/Title eq '${lower}'`);
      role = assignments.length > 0 ? assignments[0].AssignedRole : 'viewer';
    }
  }
 
  sessionStorage.setItem(cacheKey, role);
  return role;
}
 
// getUserProjectIds — defined above with admin null handling
 
// Check if email is in LeadershipAccess list
async function isLeadershipUser(email) {
  const list = await getLeadershipAccess();
  return list.some(l => l.UserEmail?.toLowerCase() === email.toLowerCase());
}

// True if the signed-in user holds an explicit DM grant.
// Pass a projectId to scope the check; omit for "any DM grant?"
function hasDMGrant(projectId = null) {
  const email = (getCurrentUser()?.email || '').toLowerCase();
  const grants = JSON.parse(sessionStorage.getItem('newton_dm_grants_' + email) || '[]');
  return projectId ? grants.includes(String(projectId)) : grants.length > 0;
}

// Auto-register user on first login if not already in UserAssignments
async function ensureUserRegistered(email, displayName) {
  const lower = email.toLowerCase();
  if (CONFIG.ADMIN_USERS?.includes(lower)) return;
  const existing = await getItems("UserAssignments",
    `fields/Title eq '${lower}'`);
  if (existing.length === 0) {
    await createItem("UserAssignments", {
      Title: lower,
      UserName: displayName || lower,
      ProjectID: 0,
      CustomerName: "",
      AssignedRole: "talent_partner",
    });
  }
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
    const email = (u.UserEmail || '').toLowerCase();
    if (email && !seen.has(email)) {
      seen.set(email, { UserEmail: u.UserEmail, UserName: u.UserName || u.UserEmail });
    }
  });
  return [...seen.values()].sort((a, b) =>
    (a.UserName || '').localeCompare(b.UserName || ''));
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
 
// Role precedence: admin > leadership > talent_partner > delivery_manager > viewer
const ROLE_PRECEDENCE = ['admin','leadership','talent_partner','delivery_manager','viewer'];
function higherRole(a, b) {
  const ai = ROLE_PRECEDENCE.indexOf(a);
  const bi = ROLE_PRECEDENCE.indexOf(b);
  return ai <= bi ? a : b;
}
 
// Return all project IDs this user is assigned to (null = admin, sees all)
async function getUserProjectIds(email) {
  // Ghost mode — return the single ghost project if set
  const ghostProject = getGhostProject();
  if (ghostProject) return [ghostProject];
 
  const lower = email.toLowerCase();
  if (CONFIG.ADMIN_USERS?.includes(lower)) return null;
  const assignments = await getItems("UserAssignments", `fields/Title eq '${lower}'`);
  return assignments.map(a => String(a.ProjectID));
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
 
async function getAnnouncementMessage() {
  const row = await _getAppSettingsRow();
  return row ? (row.AnnouncementMessage || '') : '';
}
 
async function setAnnouncementMessage(message) {
  const row = await _getAppSettingsRow();
  if (row) {
    await updateItem("AppSettings", row.id, { AnnouncementMessage: message });
  } else {
    await createItem("AppSettings", { Title: "config", AnnouncementMessage: message });
  }
}
 
async function getSeasonalEffect() {
  const row = await _getAppSettingsRow();
  return row ? (row.SeasonalEffect || 'none') : 'none';
}
 
async function setSeasonalEffect(effect) {
  const row = await _getAppSettingsRow();
  if (row) {
    await updateItem("AppSettings", row.id, { SeasonalEffect: effect });
  } else {
    await createItem("AppSettings", { Title: "config", SeasonalEffect: effect });
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

// ── Org Chart data ────────────────────────────────────────────────────
// Active projects keyed by overseeing CSD display name (normalised).
async function getProjectsByCSD() {
  const projects = await getProjects(true); // active only
  const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const map = {};
  projects.forEach(p => {
    const key = norm(p.CSDName) || '__unassigned__';
    (map[key] = map[key] || []).push(p);
  });
  return map;
}

// Current (non-forecast) assignments per employee → { EmployeeName: [row,…] }.
// Keeps ALL current rows so a split person can be duplicated under each project.
async function getCurrentAssignmentsByEmployee() {
  const all = await getAssignments();       // no year filter = current list
  const today = new Date(); today.setHours(0,0,0,0);
  const map = {};
  all.filter(a => !a.IsForecast).forEach(a => {
    const s = a.StartDate ? new Date(a.StartDate) : null;
    const e = a.EndDate   ? new Date(a.EndDate)   : null;
    if (s) s.setHours(0,0,0,0);
    if (e) e.setHours(0,0,0,0);
    const current = (!s || s <= today) && (!e || e >= today);
    if (current) (map[a.EmployeeName] = map[a.EmployeeName] || []).push(a);
  });
  return map;
}

async function createPerson(fields) {
  return createItem("People", {
    Title:        fields.EmployeeName,
    Level:        fields.Level,
    ContractType: fields.ContractType,
    Location:     fields.Location,
    StartDate:    fields.StartDate || undefined,
    EndDate:      fields.EndDate   || undefined,
    IsActive:     fields.IsActive !== false,
    Salary:       fields.Salary   || undefined,
    PhotoUrl:     fields.PhotoUrl || undefined,
    IsPlaceholder:      fields.IsPlaceholder || undefined,
    PlaceholderProject: fields.PlaceholderProject || undefined,
    PlaceholderCSD:     fields.PlaceholderCSD     || undefined,
  });
}
async function updatePerson(id, fields) {
  const payload = {};
  if (fields.EmployeeName !== undefined) payload.Title        = fields.EmployeeName;
  if (fields.Level        !== undefined) payload.Level        = fields.Level;
  if (fields.ContractType !== undefined) payload.ContractType = fields.ContractType;
  if (fields.Location     !== undefined) payload.Location     = fields.Location;
  if (fields.StartDate    !== undefined) payload.StartDate    = fields.StartDate;
  if (fields.EndDate      !== undefined) payload.EndDate      = fields.EndDate;
  if (fields.IsActive     !== undefined) payload.IsActive     = fields.IsActive;
  if (fields.Salary       !== undefined) payload.Salary       = fields.Salary;
  if (fields.PhotoUrl     !== undefined) payload.PhotoUrl     = fields.PhotoUrl;
  if (fields.IsPlaceholder      !== undefined) payload.IsPlaceholder      = fields.IsPlaceholder;
  if (fields.PlaceholderProject !== undefined) payload.PlaceholderProject = fields.PlaceholderProject;
  if (fields.PlaceholderCSD     !== undefined) payload.PlaceholderCSD     = fields.PlaceholderCSD;
  return updateItem("People", id, payload);
}
 
// ── People module: Assignments list ──────────────────────────────────
async function getAssignments(filters = {}) {
  const parts = [];
  if (filters.employeeName) parts.push(`fields/EmployeeName eq '${filters.employeeName}'`);
  if (filters.customer)     parts.push(`fields/Customer eq '${filters.customer}'`);
  if (filters.billed !== undefined && filters.billed !== '')
    parts.push(`fields/Billed eq '${filters.billed}'`);
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
  });
}
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
  return updateItem("Assignments", id, payload);
}
 
// ── People module: GPInvoices list ────────────────────────────────────
async function getGPInvoices() {
  const invoices = await getItems("GPInvoices");
  return invoices.sort((a, b) => {
    const da = a.InvoiceDate ? new Date(a.InvoiceDate) : new Date(0);
    const db = b.InvoiceDate ? new Date(b.InvoiceDate) : new Date(0);
    return db - da;
  });
}
async function createInvoice(fields) {
  return createItem("GPInvoices", {
    Title:       fields.InvoiceNumber,
    InvoiceDate: fields.InvoiceDate,
    DueDate:     fields.DueDate,
    Amount:      fields.Amount,
    Notes:       fields.Notes  || undefined,
    Status:      fields.Status || "Sent",
  });
}
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

async function uploadInvoiceAttachment(itemId, file) {
 // Upload PDF to GPInvoiceFiles document library via Graph Drive API.
 // filename includes itemId to avoid collisions.
 const filename = `invoice-${itemId}-${file.name}`;
 const token = await getToken();
 if (!token) throw new Error('Not authenticated');
 const url = `${GRAPH}/sites/${CONFIG.SP_SITE_ID}/drives/${CONFIG.GP_INVOICE_DRIVE_ID}/items/root:/${encodeURIComponent(filename)}:/content`;
 const res = await fetch(url, {
 method: 'PUT',
 headers: {
 'Authorization': `Bearer ${token}`,
 'Content-Type': 'application/pdf',
 },
 body: file,
 });
 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 throw new Error(err?.error?.message || `Upload failed: HTTP ${res.status}`);
 }
 const result = await res.json();
 // Return the web URL so it can be stored on the list item
 return result?.webUrl || null;
}
async function addInvoiceFileURL(itemId, fileUrl) {
 // Write the uploaded file's URL back to the GPInvoices list item.
 return updateItem('GPInvoices', itemId, { FileURL: fileUrl });
}

// ── People photos: upload into the PeoplePhotos document library ───────
let _peoplePhotosDriveId = null;
async function getPeoplePhotosDriveId() {
  if (_peoplePhotosDriveId) return _peoplePhotosDriveId;
  const data = await graphRequest('GET', `/sites/${CONFIG.SP_SITE_ID}/drives`);
  const drive = (data.value || []).find(d => d.name === 'PeoplePhotos');
  if (!drive) throw new Error("'PeoplePhotos' document library not found on the site.");
  _peoplePhotosDriveId = drive.id;
  return drive.id;
}

// Upload an image; returns its web URL. prefix = 'person' | 'leader'.
// Stable filename (prefix-id.ext) so re-uploads overwrite the previous photo.
async function uploadPeoplePhoto(prefix, id, file) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const driveId = await getPeoplePhotosDriveId();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const filename = `${prefix}-${id}.${ext}`;
  const url = `${GRAPH}/sites/${CONFIG.SP_SITE_ID}/drives/${driveId}/items/root:/${encodeURIComponent(filename)}:/content`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type || 'image/jpeg' },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Photo upload failed: HTTP ${res.status}`);
  }
  const result = await res.json();
  const web = result?.webUrl;
  return web ? web + (web.includes('?') ? '&' : '?') + 'v=' + Date.now() : null;
}

// ── Payroll summary ───────────────────────────────────────────────────
async function createPayrollNotification({ month, year, joiners, leavers, bonus }) {
  const extraFields = {
    Month:      ['January','February','March','April','May','June','July','August','September','October','November','December'][month - 1],
    Year:       String(year),
    Joiners:    JSON.stringify(joiners),
    Leavers:    JSON.stringify(leavers),
    BonusData:  bonus ? JSON.stringify(bonus) : null,
  };
  return fireNotification({
    triggerType: 'payrollSummary',
    recipients:  ['system@newton'],
    triggerKey:  `payrollsummary-${year}-${month}`,
    tone:        'info',
    deepLink:    '',
    body:        `Payroll summary for ${month}/${year}`,
    extraFields,
  });
}

// ── Shared utilities ──────────────────────────────────────────────────
function printPage(title, landscape = false, module = 'Newton') {
  document.getElementById('print-header-title').textContent = 'Newton';
  document.getElementById('print-header-sub').textContent = module;
  // Set the document title so it becomes the default PDF filename, then restore.
  const prevDocTitle = document.title;
  if (title) document.title = title;
  let styleEl = null;
  if (landscape) {
    styleEl = document.createElement('style');
    styleEl.id = '__print-orientation__';
    styleEl.textContent = '@page { size: A4 landscape; }';
    document.head.appendChild(styleEl);
  }
  window.print();
  if (styleEl) {
    setTimeout(() => styleEl.remove(), 1000);
  }
  setTimeout(() => { document.title = prevDocTitle; }, 1000);
}

// ── Market Report ─────────────────────────────────────────────
async function getMarketReports() {
  return getItems("MarketReports");
}
async function getMarketReportById(id) {
  return getItem("MarketReports", id);
}
async function createMarketReport(fields) {
  return createItem("MarketReports", fields);
}
async function updateMarketReport(id, fields) {
  return updateItem("MarketReports", id, fields);
}

async function getScopedRolesForMarketReport(email, effectiveRole) {
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

  // Talent Partner: only roles where TalentPartner column matches their email
  const assignments = await getItems(
    "UserAssignments",
    `fields/Title eq '${lower}'`
  );
  if (!assignments.length) return [];
  const projectIds = [...new Set(assignments.map(a => String(a.ProjectID)))];
  const arrays = await Promise.all(
    projectIds.map(pid => getRolesForProject(pid))
  );
  return arrays.flat().filter(r => tpMatches(r.TalentPartner, lower));
}

// ── Employee Engagement ───────────────────────────────────────────────

// Field aliases for the 5 new survey lists.
// Extend FIELD_ALIASES at the top of the file with these entries:
//   SurveyTemplates:   {},
//   SurveyQuestions:   {},
//   SurveyRuns:        {},
//   SurveyResponses:   {},
//   SurveyCompletions: {},
// (No aliasing needed — all SP column names match the display names.)

// ── Read ──────────────────────────────────────────────────────────────

async function getSurveyTemplates() {
  return getItems("SurveyTemplates");
}

async function getActiveSurveyRun() {
  const runs = await getItems("SurveyRuns", "fields/Status eq 'Active'");
  return runs.length > 0 ? runs[0] : null;
}

async function getSurveyRunById(runId) {
  return getItem("SurveyRuns", runId);
}

async function getSurveyRuns() {
  return getItems("SurveyRuns");
}

async function getSurveyQuestions(templateId) {
  const questions = await getItems("SurveyQuestions", `fields/TemplateID eq '${templateId}'`);
  return questions.sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
}

async function getSurveyResponses(runId) {
  return getItems("SurveyResponses", `fields/RunID eq '${runId}'`);
}

async function hasCompletedSurvey(runId, email) {
  const completions = await getItems(
    "SurveyCompletions",
    `fields/RunID eq '${runId}' and fields/RespondentEmail eq '${email.toLowerCase()}'`
  );
  return completions.length > 0;
}

async function getSurveyCompletionCount(runId) {
  const completions = await getItems("SurveyCompletions", `fields/RunID eq '${runId}'`);
  return completions.length;
}

// ── Write ─────────────────────────────────────────────────────────────

async function createSurveyTemplate(fields) {
  return createItem("SurveyTemplates", {
    Title:          fields.Title,
    Description:    fields.Description   || "",
    TargetAudience: fields.TargetAudience || "All",
    Status:         fields.Status         || "Draft",
    // N-133: isoDate() pins these to T12:00:00Z. Written bare, SharePoint
    // resolved them in the SITE's timezone, so a BST-season date stored 23:00Z
    // on the PREVIOUS day — and because the edit form redisplays the stored day
    // and re-saves it, the value walked back one day on every edit. CloseDate
    // is currently supplied by no caller, but it is the same shape one line
    // over and would ratchet identically the moment one does.
    TargetDate:     isoDate(fields.TargetDate) || undefined,
    CloseDate:      isoDate(fields.CloseDate)  || undefined,
    CreatedByEmail: fields.CreatedByEmail || "",
  });
}

async function updateSurveyTemplate(id, fields) {
  const payload = {};
  if (fields.Title          !== undefined) payload.Title          = fields.Title;
  if (fields.Description    !== undefined) payload.Description    = fields.Description;
  if (fields.TargetAudience !== undefined) payload.TargetAudience = fields.TargetAudience;
  if (fields.Status         !== undefined) payload.Status         = fields.Status;
  // N-133: the UPDATE path is what actually drove the ratchet — each edit
  // re-stored the (already shifted) day the form was showing. isoDate() returns
  // null for an empty value, which is the correct way to clear a SharePoint
  // date field, so deliberately emptying the field still clears it.
  if (fields.TargetDate     !== undefined) payload.TargetDate     = isoDate(fields.TargetDate);
  if (fields.CloseDate      !== undefined) payload.CloseDate      = isoDate(fields.CloseDate);
  return updateItem("SurveyTemplates", id, payload);
}

async function createSurveyQuestion(fields) {
  return createItem("SurveyQuestions", {
    TemplateID:         String(fields.TemplateID),
    QuestionText:       fields.QuestionText,
    QuestionType:       fields.QuestionType,
    ScaleMin:           fields.ScaleMin       ?? 1,
    ScaleMax:           fields.ScaleMax       ?? 5,
    ScaleMinLabel:      fields.ScaleMinLabel  || "",
    ScaleMaxLabel:      fields.ScaleMaxLabel  || "",
    Options:            fields.Options        || "",
    IsRequired:         fields.IsRequired  ?? false,
    SortOrder:          fields.SortOrder   ?? 0,
  });
}

async function updateSurveyQuestion(id, fields) {
  const payload = {};
  if (fields.QuestionText !== undefined) payload.QuestionText = fields.QuestionText;
  if (fields.QuestionType !== undefined) payload.QuestionType = fields.QuestionType;
  if (fields.ScaleMin      !== undefined) payload.ScaleMin      = fields.ScaleMin;
  if (fields.ScaleMax      !== undefined) payload.ScaleMax      = fields.ScaleMax;
  if (fields.ScaleMinLabel !== undefined) payload.ScaleMinLabel = fields.ScaleMinLabel;
  if (fields.ScaleMaxLabel !== undefined) payload.ScaleMaxLabel = fields.ScaleMaxLabel;
  if (fields.Options       !== undefined) payload.Options       = fields.Options;
  if (fields.IsRequired   !== undefined) payload.IsRequired   = fields.IsRequired;
  if (fields.SortOrder    !== undefined) payload.SortOrder    = fields.SortOrder;
  return updateItem("SurveyQuestions", id, payload);
}

async function deleteSurveyQuestion(id) {
  return deleteItem("SurveyQuestions", id);
}

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

async function updateSurveyRun(id, fields) {
  const payload = {};
  if (fields.Status        !== undefined) payload.Status    = fields.Status;
  // N-131: the edit path needs it too — fixing only createSurveyRun would
  // leave a close date changed after activation writing the bare shape.
  if (fields.CloseDate     !== undefined) payload.CloseDate = isoDate(fields.CloseDate);
  if (fields.EligibleCount !== undefined) payload.EligibleCount = fields.EligibleCount;
  return updateItem("SurveyRuns", id, payload);
}

// Called once per question answer on survey submission.
// UUID only — no email, no user identifier.
async function createSurveyResponse(fields) {
  return createItem("SurveyResponses", {
    RunID:              String(fields.RunID),
    QuestionID:         String(fields.QuestionID),
    RespondentUUID:     fields.RespondentUUID,
    AnswerValue:        String(fields.AnswerValue),
    SubmittedAt:        new Date().toISOString(),
  });
}

// Called once on submit — email only, no answers.
async function createSurveyCompletion(runId, email) {
  return createItem("SurveyCompletions", {
    RunID:           String(runId),
    RespondentEmail: email.toLowerCase(),
  });
}
