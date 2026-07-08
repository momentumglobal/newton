// js/api.js — Graph API data layer
const GRAPH = "https://graph.microsoft.com/v1.0";
 
// ── In-memory read cache ──────────────────────────────────────────────
// Caches GET results for 30 seconds to avoid redundant SharePoint calls
// during page navigation. Writes (POST/PATCH/DELETE) invalidate the
// relevant list automatically.
const _apiCache = new Map();
const _CACHE_TTL_MS = 30000; // 30 seconds
 
function _cacheKey(listName, filter) {
  return listName + '|' + (filter || '');
}
function _cacheGet(listName, filter) {
  const entry = _apiCache.get(_cacheKey(listName, filter));
  if (!entry) return null;
  if (Date.now() - entry.ts > _CACHE_TTL_MS) {
    _apiCache.delete(_cacheKey(listName, filter));
    return null;
  }
  return entry.data;
}
function _cacheSet(listName, filter, data) {
  _apiCache.set(_cacheKey(listName, filter), { ts: Date.now(), data });
}
function _cacheInvalidate(listName) {
  // Remove all cached entries for this list (any filter)
  for (const key of _apiCache.keys()) {
    if (key.startsWith(listName + '|')) _apiCache.delete(key);
  }
}
 
// ── Field normalisers ───────────────────────────────────────────────
const FIELD_ALIASES = {
  Projects:        { Title: "CustomerName", Yeare: "Year" },
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
  // ── CoE Hiring Plan ───────────────────────────────────────
  CoEPlanRows:     {},
  CoEPlanForecast: {},
  // ── LCI Cost Model ────────────────────────────────────────
  LCIModels:       {},
  LCIModelRows:    {},
  LCIMilestones:   {},
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
  const res = await fetch(`${GRAPH}${path}`, opts);
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
 
// ── Read ─────────────────────────────────────────────────────────────
async function getItems(listName, filter = "") {
  const cached = _cacheGet(listName, filter);
  if (cached) return cached;
 
  const qs = filter ? `?$expand=fields($select=*)&$filter=${encodeURIComponent(filter)}` : "?$expand=fields($select=*)";
  let url = `${listPath(listName)}${qs}`;
  const items = [];
  while (url) {
    const data = await graphRequest("GET", url);
    items.push(...data.value.map(i => ({ id: i.id, ...normaliseFields(listName, i.fields) })));
    url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(GRAPH, '') : null;
  }
 
  _cacheSet(listName, filter, items);
  return items;
}
 
async function getItem(listName, itemId) {
  const data = await graphRequest("GET", `${listPath(listName)}/${itemId}?$expand=fields($select=*)`);
  return { id: data.id, ...normaliseFields(listName, data.fields) };
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
  let filter = `fields/ProjectID eq ${projectId}`;
  if (talentPartnerEmail) {
    filter += ` and fields/TalentPartner eq '${talentPartnerEmail.toLowerCase()}'`;
  }
  return getItems("Roles", filter);
}
 
async function getAllRoles() {
  return getItems("Roles");
}
 
async function getHistoricalPlacements() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const roles = await getItems('Roles',
    `fields/Stage eq 'Hired' and fields/ActualHireDate ge '${cutoff.toISOString().split('T')[0]}'`,
    'Id,Title,Department,Currency,OpenDate,ActualHireDate'
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
  const isoDate = cutoff.toISOString().split('T')[0];
  const activity = await getItems('WeeklyActivity',
    `fields/WeekEndingDate ge '${isoDate}'`,
    'Id,RoleID,WeekEndingDate,Outreach,Responses,Screened,Submitted,Interview1,Interview2Plus,FinalInterview,Offers,Hires'
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
  return createItem("CoEPlanForecast", { ProjectID: projectId, ForecastMonth: monthISO, ForecastedHires: hires });
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
  return getItems("LCIModelRows", `fields/ModelID eq ${modelId}`);
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
  return getItems("LCIMilestones", `fields/ModelID eq ${modelId}`);
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
  'TravelPerMonth', 'SectionsEnabled', 'Assumptions',
];
const _LCI_ROW_COPY_FIELDS = [
  'Title', 'RowType', 'Team', 'CareerLevel', 'AnnualSalary', 'BonusPct',
  'Quantity', 'ExitMonth', 'MonthValues', 'SortOrder',
];
const _LCI_MILESTONE_COPY_FIELDS = ['Title', 'StartMonth', 'EndMonth', 'SortOrder'];

function _pickFields(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}

async function copyLCIModel(modelId, newTitle) {
  const [model, rows, milestones] = await Promise.all([
    getLCIModelById(modelId), getLCIRows(modelId), getLCIMilestones(modelId),
  ]);
  const created = await createLCIModel({
    ..._pickFields(model, _LCI_MODEL_COPY_FIELDS),
    Title:  newTitle || `${model.Title} (copy)`,
    Status: 'Draft',
  });
  const newId = created.id;
  for (const r of rows) {
    await createLCIRow({ ..._pickFields(r, _LCI_ROW_COPY_FIELDS), ModelID: newId });
  }
  for (const m of milestones) {
    await createLCIMilestone({ ..._pickFields(m, _LCI_MILESTONE_COPY_FIELDS), ModelID: newId });
  }
  return created;
}

async function getDepartments() {
  return getItems("Departments", "");
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
  const assignments = await getItems("UserAssignments", `fields/Title eq '${email}'`);
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
async function getPeople(activeOnly = true) {
  const filter = activeOnly ? "fields/IsActive eq 1" : "";
  const people = await getItems("People", filter);
  const levelOrder = { CSD: 0, SDM: 1, STP: 2, TP: 3 };
  return people.sort((a, b) => {
    const lDiff = (levelOrder[a.Level] ?? 99) - (levelOrder[b.Level] ?? 99);
    if (lDiff !== 0) return lDiff;
    return (a.EmployeeName || "").localeCompare(b.EmployeeName || "");
  });
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
    Billed:          fields.Billed,
    Country:         fields.Country,
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
  if (fields.Billed          !== undefined) payload.Billed          = fields.Billed;
  if (fields.Country         !== undefined) payload.Country         = fields.Country;
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
  return arrays.flat().filter(r =>
    r.TalentPartner && r.TalentPartner.toLowerCase() === lower
  );
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
    TargetDate:     fields.TargetDate     || undefined,
    CloseDate:      fields.CloseDate      || undefined,
    CreatedByEmail: fields.CreatedByEmail || "",
  });
}

async function updateSurveyTemplate(id, fields) {
  const payload = {};
  if (fields.Title          !== undefined) payload.Title          = fields.Title;
  if (fields.Description    !== undefined) payload.Description    = fields.Description;
  if (fields.TargetAudience !== undefined) payload.TargetAudience = fields.TargetAudience;
  if (fields.Status         !== undefined) payload.Status         = fields.Status;
  if (fields.TargetDate     !== undefined) payload.TargetDate     = fields.TargetDate;
  if (fields.CloseDate      !== undefined) payload.CloseDate      = fields.CloseDate;
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
  const openDate  = fields.OpenDate  || new Date().toISOString().split('T')[0];
  const closeDate = fields.CloseDate || (() => {
    const d = new Date(); d.setDate(d.getDate() + CONFIG.SURVEY.DEFAULT_DURATION_DAYS);
    return d.toISOString().split('T')[0];
  })();
  return createItem("SurveyRuns", {
    Title:              fields.RunLabel,
    TemplateID:         String(fields.TemplateID),
    OpenDate:           openDate,
    CloseDate:          closeDate,
    Status:             "Active",
    EligibleCount:      fields.EligibleCount || 0,
  });
}

async function updateSurveyRun(id, fields) {
  const payload = {};
  if (fields.Status        !== undefined) payload.Status    = fields.Status;
  if (fields.CloseDate     !== undefined) payload.CloseDate = fields.CloseDate;
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
