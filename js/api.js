// js/api.js — Graph API data layer
const GRAPH = "https://graph.microsoft.com/v1.0";

// ── Field normalisers ───────────────────────────────────────────────
// SharePoint stores the first column of every list as "Title" internally.
// These maps alias Title (and any other internal-name quirks) back to the
// display names the rest of the app expects.
const FIELD_ALIASES = {
  Projects:       { Title: "CustomerName", Yeare: "Year" },
  Roles:          { Title: "RoleTitle",    Yeare: "Year" },
  WeeklyActivity: { Title: "ActivityTitle", Yeare: "Year", InterviewTwoPlus: "Interview2Plus" },
  Placements:     { Title: "CandidateName", Yeare: "Year" },
  RejectedOffers: { Title: "CandidateName", Yeare: "Year" },
  UserAssignments: { Title: 'UserEmail' },
  LeadershipAccess:{ Title: 'UserEmail' },
  Departments:     { Title: 'DepartmentName' },
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

// ── Admin list helpers ───────────────────────────────────────────

async function getUserAssignments(projectId) {
  return getItems('UserAssignments',
    projectId ? `fields/ProjectID eq ${projectId}` : '');
}

async function getLeadershipAccess() {
  return getItems('LeadershipAccess');
}

async function getDepartments(projectId) {
  return getItems('Departments',
    projectId ? `fields/ProjectID eq ${projectId}` : '');
}

// Resolve the signed-in user's effective role:
// 1. Check config.js ROLES (catches the hardcoded admin)
// 2. Fall back to UserAssignments list
async function getEffectiveRole(email) {
  const configRole = CONFIG.ROLES?.[email];
  if (configRole) return configRole;
  const assignments = await getItems('UserAssignments',
    `fields/UserEmail eq '${email}'`);
  if (assignments.length > 0) return assignments[0].AssignedRole;
  return 'viewer';
}

// Return all project IDs this user is assigned to
async function getUserProjectIds(email) {
  const assignments = await getItems('UserAssignments',
    `fields/UserEmail eq '${email}'`);
  return assignments.map(a => String(a.ProjectID));
}

// Check if email is in LeadershipAccess list
async function isLeadershipUser(email) {
  const list = await getLeadershipAccess();
  return list.some(l => l.UserEmail?.toLowerCase() === email.toLowerCase());
}

