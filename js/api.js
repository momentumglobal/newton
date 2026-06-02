// js/api.js — Graph API data layer
const GRAPH = "https://graph.microsoft.com/v1.0";

// ── Field normalisers ───────────────────────────────────────────────
const FIELD_ALIASES = {
  Projects:        { Title: "CustomerName", Yeare: "Year" },
  Roles:           { Title: "RoleTitle",    Yeare: "Year" },
  WeeklyActivity:  { Title: "ActivityTitle", Yeare: "Year", InterviewTwoPlus: "Interview2Plus" },
  Placements:      { Title: "CandidateName", Yeare: "Year" },
  RejectedOffers:  { Title: "CandidateName", Yeare: "Year" },
  UserAssignments: { Title: "UserEmail" },
  LeadershipAccess:{ Title: "UserEmail" },
  Departments:     { Title: "DepartmentName" },
  Currencies:      { Title: "CurrencyCode" },
  SavedReports:    {},
  // ── People module ──────────────────────────────────────────
  People:          { Title: "EmployeeName" },
  Assignments:     { Title: "AssignmentID" },
  GPInvoices:      { Title: "InvoiceNumber" },
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
  const qs = filter ? `?$expand=fields&$filter=${encodeURIComponent(filter)}` : "?$expand=fields";
  const data = await graphRequest("GET", `${listPath(listName)}${qs}`);
  return data.value.map(i => ({ id: i.id, ...normaliseFields(listName, i.fields) }));
}

async function getItem(listName, itemId) {
  const data = await graphRequest("GET", `${listPath(listName)}/${itemId}?$expand=fields`);
  return { id: data.id, ...normaliseFields(listName, data.fields) };
}

// ── Write ─────────────────────────────────────────────────────────────
async function createItem(listName, fields) {
  return graphRequest("POST", listPath(listName), { fields });
}

async function updateItem(listName, itemId, fields) {
  return graphRequest("PATCH", `${listPath(listName)}/${itemId}`, { fields });
}

// ── List-specific helpers ─────────────────────────────────────────────
async function getProjects(activeOnly = true) {
  return getItems("Projects", activeOnly ? "fields/Status eq 'Active'" : "");
}

async function getRolesForProject(projectId) {
  return getItems("Roles", `fields/ProjectID eq ${projectId}`);
}

async function getAllRoles() {
  return getItems("Roles");
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

async function getDepartments(projectId) {
  return getItems("Departments",
    projectId ? `fields/ProjectID eq ${projectId}` : "");
}

// Resolve the signed-in user's effective role:
// 1. Check ADMIN_USERS in config.js
// 2. Check LeadershipAccess list
// 3. Check UserAssignments list
// 4. Fall back to 'viewer'
async function getEffectiveRole(email) {
  const lower = email.toLowerCase();
  if (CONFIG.ADMIN_USERS?.includes(lower)) return 'admin';
  const leadership = await getLeadershipAccess();
  if (leadership.some(l => l.UserEmail?.toLowerCase() === lower)) return 'leadership';
  const assignments = await getItems("UserAssignments",
    `fields/Title eq '${lower}'`);
  if (assignments.length > 0) return assignments[0].AssignedRole;
  return 'viewer';
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


async function getDepartmentsForProject(projectId) {
  return getItems("Departments", `fields/ProjectID eq ${projectId}`);
}

async function getCurrencies() {
  return getItems("Currencies");
}

async function getTalentPartnersForProject(projectId) {
  const assignments = await getItems("UserAssignments", `fields/ProjectID eq ${projectId}`);
  return assignments.filter(a =>
    a.AssignedRole === 'talent_partner' || a.AssignedRole === 'delivery_manager'
  );
}

async function getTalentPartnerDisplayMap() {
  const assignments = await getItems("UserAssignments");
  const map = {};
  assignments.forEach(u => {
    if (u.UserEmail) map[u.UserEmail.toLowerCase()] = u.UserName || u.UserEmail;
  });
  return map;
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
  const lower = email.toLowerCase();
  if (CONFIG.ADMIN_USERS?.includes(lower)) return null;
  const assignments = await getItems("UserAssignments", `fields/Title eq '${email}'`);
  return assignments.map(a => String(a.ProjectID));
}

// Return scoped projects list
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
  const items = await getItems("AppSettings");
  const row = items.find(i => (i.Title || '').toLowerCase() === 'config');
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
  const items = await getItems("AppSettings");
  const row = items.find(i => (i.Title || '').toLowerCase() === 'config');
  if (row) {
    await updateItem("AppSettings", row.id, { SeasonalEffect: effect });
  } else {
    await createItem("AppSettings", { Title: "config", SeasonalEffect: effect });
  }
}

// ── Button loading state helpers ─────────────────────────────────────
// Defined in api.js so both Reporting (forms.js) and People (people-forms.js)
// can use them — api.js is loaded by every module.
function setButtonLoading(btn, loadingText) {
  if (!btn) return;
  btn.dataset.originalText = btn.textContent;
  btn.textContent = loadingText || 'Saving…';
  btn.disabled = true;
  btn.style.opacity = '0.7';
  btn.style.cursor  = 'not-allowed';
}
function clearButtonLoading(btn) {
  if (!btn) return;
  btn.textContent = btn.dataset.originalText || btn.textContent;
  btn.disabled = false;
  btn.style.opacity = '';
  btn.style.cursor  = '';
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

// ── People module: monthly calculation utility ────────────────────────
function computeMonthlyRows(assignments) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = [];
  for (const a of assignments) {
    if (!a.StartDate || !a.EndDate) continue;
    const aStart = new Date(a.StartDate);
    const aEnd   = new Date(a.EndDate);
    aStart.setHours(0,0,0,0);
    aEnd.setHours(0,0,0,0);
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const effectiveEnd = aEnd < thisMonthEnd ? aEnd : thisMonthEnd;
    const cur = new Date(aStart.getFullYear(), aStart.getMonth(), 1);
    const endMonth = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), 1);
    while (cur <= endMonth) {
      const year  = cur.getFullYear();
      const month = cur.getMonth();
      const monthStart = new Date(year, month, 1);
      const monthEnd   = new Date(year, month + 1, 0);
      const overlapStart = aStart > monthStart ? aStart : monthStart;
      const overlapEnd   = effectiveEnd < monthEnd ? effectiveEnd : monthEnd;
      const daysOverlap = (overlapEnd - overlapStart) / 86400000 + 1;
      const daysInMonth = monthEnd.getDate();
      const fraction    = daysInMonth > 0 ? daysOverlap / daysInMonth : 0;
      const rate    = parseFloat(a.MonthlyBillRate) || 0;
      const billed  = a.Billed === "Yes";
      const prorated = rate * fraction;
      rows.push({
        AssignmentID:     a.AssignmentID,
        EmployeeName:     a.EmployeeName,
        Level:            a.Level,
        Customer:         a.Customer,
        ProjectType:      a.ProjectType,
        Country:          a.Country,
        Billed:           a.Billed,
        Year:             year,
        Month:            month + 1,
        MonthStart:       monthStart.toISOString().slice(0, 10),
        MonthFraction:    Math.round(fraction * 10000) / 10000,
        ProratedRevenue:  Math.round(prorated * 100) / 100,
        BilledRevenue:    billed ? Math.round(prorated * 100) / 100 : 0,
        Capacity:         Math.round(fraction * 10000) / 10000,
        BilledCapacity:   billed ? Math.round(fraction * 10000) / 10000 : 0,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  }
  return rows;
}

// ── Shared utilities ──────────────────────────────────────────────────
async function deleteItem(listName, itemId) {
  return graphRequest("DELETE", `${listPath(listName)}/${itemId}`);
}

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
