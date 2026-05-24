// js/api.js — Graph API data layer

const GRAPH = "https://graph.microsoft.com/v1.0";

// ── Generic helpers ────────────────────────────────────────────────

async function graphRequest(method, path, body = null) {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const opts = {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
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

// ── Read ────────────────────────────────────────────────────────────

async function getItems(listName, filter = "") {
  const qs = filter ? `?$expand=fields&$filter=${encodeURIComponent(filter)}` : "?$expand=fields";
  const data = await graphRequest("GET", `${listPath(listName)}${qs}`);
  return data.value.map(i => ({ id: i.id, ...i.fields }));
}

async function getItem(listName, itemId) {
  const data = await graphRequest("GET", `${listPath(listName)}/${itemId}?$expand=fields`);
  return { id: data.id, ...data.fields };
}

// ── Write ───────────────────────────────────────────────────────────

async function createItem(listName, fields) {
  return graphRequest("POST", listPath(listName), { fields });
}

async function updateItem(listName, itemId, fields) {
  return graphRequest("PATCH", `${listPath(listName)}/${itemId}`, { fields });
}

// ── List-specific helpers ────────────────────────────────────────────

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
