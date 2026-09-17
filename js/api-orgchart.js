// Org Chart data SharePoint API calls.
// Extracted from api.js by N-237b — single-consumer functions used only by
// org-chart.js (people.html). Depends on getProjects/getAssignments/
// getItems, all defined in api.js (loads first, see script order).
// getLeadershipAccess stays in api.js — multi-consumer.

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

// N-219 addendum: which CSD a claimed LCI-only customer belongs to (Org
// Chart). One row per claimed customer — an unclaimed one simply has no row.
async function getLCIProjectOwners() {
  return getItems("LCIProjectOwners");
}
