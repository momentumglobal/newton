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

async function getDepartmentsForProject(projectId) {
  return getItems("Departments", `fields/ProjectID eq ${projectId}`);
}

// Returns Talent Partners assigned to a specific project (for activity logging on behalf of)
async function getTalentPartnersForProject(projectId) {
  const assignments = await getItems("UserAssignments", `fields/ProjectID eq ${projectId}`);
  return assignments.filter(a =>
    a.AssignedRole === 'talent_partner' || a.AssignedRole === 'delivery_manager'
  );
}

// ── Role resolution ──────────────────────────────────────────────────
// Role precedence: admin > leadership > talent_partner > delivery_manager > viewer
const ROLE_PRECEDENCE = ['admin','leadership','talent_partner','delivery_manager','viewer'];

function higherRole(a, b) {
  const ai = ROLE_PRECEDENCE.indexOf(a);
  const bi = ROLE_PRECEDENCE.indexOf(b);
  return ai <= bi ? a : b;
}

// Resolve the signed-in user's effective role across all assignments:
// 1. Check ADMIN_USERS in config.js
// 2. Check LeadershipAccess list
// 3. Check all UserAssignments rows — return highest-privilege role found
// 4. Fall back to 'viewer'
async function getEffectiveRole(email) {
  const lower = email.toLowerCase();
  if (CONFIG.ADMIN_USERS?.includes(lower)) return 'admin';
  const [leadership, assignments] = await Promise.all([
    getLeadershipAccess(),
    getItems("UserAssignments", `fields/Title eq '${email}'`),
  ]);
  if (leadership.some(l => l.UserEmail?.toLowerCase() === lower)) return 'leadership';
  if (assignments.length === 0) return 'viewer';
  // Return highest-privilege role across all assignments
  return assignments.reduce((best, a) => higherRole(best, a.AssignedRole || 'viewer'), 'viewer');
}

// Return all project IDs this user is assigned to
async function getUserProjectIds(email) {
  const lower = email.toLowerCase();
  if (CONFIG.ADMIN_USERS?.includes(lower)) return null; // null = no scoping, admin sees all
  const assignments = await getItems("UserAssignments", `fields/Title eq '${email}'`);
  return assignments.map(a => String(a.ProjectID));
}

// Return scoped projects list:
// - Admin: all projects (activeOnly controlled by param)
// - TP/DM: only their assigned projects
async function getScopedProjects(email, activeOnly = false) {
  const projectIds = await getUserProjectIds(email);
  const allProjects = await getProjects(activeOnly);
  if (projectIds === null) return allProjects; // admin
  return allProjects.filter(p => projectIds.includes(String(p.id)));
}

// Check if email is in LeadershipAccess list
async function isLeadershipUser(email) {
  const list = await getLeadershipAccess();
  return list.some(l => l.UserEmail?.toLowerCase() === email.toLowerCase());
}

// Auto-register user on first login if not already in UserAssignments
async function ensureUserRegistered(email, displayName) {
  const lower = email.toLowerCase();
  if (CONFIG.ADMIN_USERS?.includes(lower)) return;
  const existing = await getItems("UserAssignments", `fields/Title eq '${email}'`);
  const now = new Date().toISOString();
  if (existing.length === 0) {
    await createItem("UserAssignments", {
      Title: email,
      UserName: displayName || email,
      ProjectID: 0,
      CustomerName: "",
      AssignedRole: "viewer",
      LastLogin: now,
    });
  } else {
    await updateItem("UserAssignments", existing[0].id, { LastLogin: now });
  }
}

// ── People module: People list ─────────────────────────────────

// Returns all employees. Pass activeOnly=true (default) to exclude
// archived employees (IsActive = false).
async function getPeople(activeOnly = true) {
  const filter = activeOnly ? "fields/IsActive eq 1" : "";
  const people = await getItems("People", filter);
  // Sort: Level order (CSD, SDM, STP, TP), then name A-Z
  const levelOrder = { CSD: 0, SDM: 1, STP: 2, TP: 3 };
  return people.sort((a, b) => {
    const lDiff = (levelOrder[a.Level] ?? 99) - (levelOrder[b.Level] ?? 99);
    if (lDiff !== 0) return lDiff;
    return (a.EmployeeName || "").localeCompare(b.EmployeeName || "");
  });
}

// Creates a new employee record.
// fields: { EmployeeName, Level, ContractType, Location, StartDate, EndDate? }
async function createPerson(fields) {
  // Map display names back to SharePoint internal names for write
  return createItem("People", {
    Title:        fields.EmployeeName,
    Level:        fields.Level,
    ContractType: fields.ContractType,
    Location:     fields.Location,
    StartDate:    fields.StartDate || undefined,
    EndDate:      fields.EndDate   || undefined,
    IsActive:     fields.IsActive !== false,  // default true
  });
}

// Updates an existing employee record by SharePoint item ID.
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

// ── People module: Assignments list ───────────────────────────

// Returns assignment records with optional filters.
// filters: { employeeName, customer, year, billed }  — all optional.
async function getAssignments(filters = {}) {
  const parts = [];
  if (filters.employeeName) parts.push(`fields/EmployeeName eq '${filters.employeeName}'`);
  if (filters.customer)     parts.push(`fields/Customer eq '${filters.customer}'`);
  if (filters.billed !== undefined && filters.billed !== '')
    parts.push(`fields/Billed eq '${filters.billed}'`);
  const filterStr = parts.join(" and ");
  const assignments = await getItems("Assignments", filterStr);
  // If year filter supplied, apply in-memory (date range overlap check)
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

// Creates a new assignment record.
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

// Updates an existing assignment record by SharePoint item ID.
async function updateAssignment(id, fields) {
  const payload = {};
  if (fields.AssignmentID   !== undefined) payload.Title           = fields.AssignmentID;
  if (fields.EmployeeName   !== undefined) payload.EmployeeName    = fields.EmployeeName;
  if (fields.Level          !== undefined) payload.Level           = fields.Level;
  if (fields.Customer       !== undefined) payload.Customer        = fields.Customer;
  if (fields.ProjectType    !== undefined) payload.ProjectType     = fields.ProjectType;
  if (fields.StartDate      !== undefined) payload.StartDate       = fields.StartDate;
  if (fields.EndDate        !== undefined) payload.EndDate         = fields.EndDate;
  if (fields.MonthlyBillRate!== undefined) payload.MonthlyBillRate = fields.MonthlyBillRate;
  if (fields.Billed         !== undefined) payload.Billed          = fields.Billed;
  if (fields.Country        !== undefined) payload.Country         = fields.Country;
  return updateItem("Assignments", id, payload);
}
