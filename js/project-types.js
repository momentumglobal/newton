// js/project-types.js — project status, project-type and KPI-exclusion rules (N-112, N-333, N-356, N-362).
// Pure: no Graph, no DOM. Split out of utils.js (N-474).
// Every project-type check goes through a helper here (lint-project-types.js exempts this file, because it is
// where the comparisons live). Loads straight after templates-logic.js on every shell and is listed in
// CONFIG.MCP.scripts. Nothing here runs at load.

// ── Project Active/Archive (N-112) ─────────────────────────────
// Active bucket = Status Active or Transition. Archive bucket = Status
// Completed. This is the single source of truth for that line — every
// caller filters through this predicate rather than checking p.Status inline.
function isProjectActive(project) {
  return project?.Status !== 'Completed';
}

// N-364: the Project page header, as ordered { label, value } plain strings
// (project-page.js escapes them). Lead DM is Projects.DeliveryManager (D-5);
// dmMap is email -> display name. Blank values read '—'.
function projectPageFields(project, dmMap) {
  const p  = project || {};
  const dm = p.DeliveryManager ? String(p.DeliveryManager) : '';
  return [
    { label: 'Type',    value: p.ProjectType || '—' },
    { label: 'Status',  value: p.Status || '—' },
    { label: 'Start',   value: spDateIn(p.StartDate) || '—' },
    { label: 'End',     value: spDateIn(p.EndDate) || '—' },
    { label: 'Lead DM', value: dm ? ((dmMap && dmMap[dm.toLowerCase()]) || dm) : '—' },
  ];
}

// N-356: 'current' for pickers that must exclude Transition as well as
// Completed (User Assignments → Customer). Narrower than isProjectActive()
// above — do not merge the two. 'Active' is the same literal getProjects(true)
// filters on.
function isProjectCurrent(project) {
  return project?.Status === 'Active';
}

// N-356: display labels for a project <select> in which one customer can have
// several projects. Returns a Map of String(id) → PLAIN-TEXT label (callers
// escape). A customer listed once keeps its plain CustomerName. A customer
// listed more than once (name compared trimmed, case- and space-insensitive)
// reads 'Name (ProjectType)'; if the type is blank or the label still
// collides, the StartDate month is added: 'Name (CoE, from 2026-03)' /
// 'Name (from 2026-03)'. With no StartDate the label is left as it is. Labels
// only — an option's value must keep the raw CustomerName. Pure; the input is
// not mutated.
function projectOptionLabels(projects) {
  const list = projects || [];
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const tally = keyOf => list.reduce((acc, p) => {
    const k = keyOf(p);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const nameCounts = tally(p => norm(p.CustomerName));
  const isShared = p => nameCounts[norm(p.CustomerName)] > 1;
  const typed = p => (isShared(p) && p.ProjectType
    ? `${p.CustomerName || ''} (${p.ProjectType})`
    : (p.CustomerName || ''));
  const typedCounts = tally(p => norm(typed(p)));
  const labels = new Map();
  list.forEach(p => {
    let label = typed(p);
    if (isShared(p) && (!p.ProjectType || typedCounts[norm(label)] > 1)) {
      const month = monthKeyFromISO(p.StartDate);
      if (month) {
        label = p.ProjectType
          ? `${p.CustomerName || ''} (${p.ProjectType}, from ${month})`
          : `${p.CustomerName || ''} (from ${month})`;
      }
    }
    labels.set(String(p.id), label);
  });
  return labels;
}

// Returns a NEW array sorted by CustomerName A-Z. Does not mutate the input.
function sortProjectsByName(projects) {
  return [...projects].sort((a, b) => (a.CustomerName || '').localeCompare(b.CustomerName || ''));
}

// Flat, escaped <option> list for a project array — no grouping, no "All
// Projects" default. Shared by every project <select> in the app.
function buildProjectOptionsHtml(projects, selectedId) {
  return projects.map(p =>
    `<option value="${p.id}" ${String(selectedId) === String(p.id) ? 'selected' : ''}>${escHtml(p.CustomerName)}</option>`
  ).join('');
}

// N-398 (BP-2): pure. The people a briefing pack can be reassigned to, from
// UserAssignments-shaped rows ({ UserEmail, UserName, AssignedRole, Active }). Drops
// inactive rows, admin rows (not project people, N-281), rows with no email and the
// current owner; de-dupes by lower-cased email; sorted by name. Never throws on
// null / non-array input and never mutates it.
function briefingPackReassignCandidates(rows, currentOwner) {
  const skip = String(currentOwner || '').trim().toLowerCase();
  const seen = new Map();
  (Array.isArray(rows) ? rows : []).forEach(r => {
    if (!r || r.Active === false || r.AssignedRole === CONFIG.ROLE_IDS.ADMIN) return;
    const email = String(r.UserEmail || '').trim().toLowerCase();
    if (!email || email === skip || seen.has(email)) return;
    seen.set(email, { email, name: r.UserName || r.UserEmail });
  });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ── Internal project (N-333) ─────────────────────────────────────
// The Momentum-internal Projects row (Internal TA hiring) has ProjectType
// CONFIG.PROJECT_TYPE_INTERNAL. Its rows show on its own project-scoped pages
// and on one TP's own scorecard, but never in a company aggregate, learned
// benchmark or RAG. Every such consumer filters ONCE, at load, through
// excludeInternalProjectData() — the list is tests/lint-internal-kpi.js.
function isInternalProject(p) {
  return !!p && p.ProjectType === CONFIG.PROJECT_TYPE_INTERNAL;
}

// ── No-dashboard project types (N-362, D-4) ──────────────────────
// LCI and Transformation are Projects with no Project Dashboard.
// CONFIG.NO_DASHBOARD_PROJECT_TYPES is read ONLY here; every other file asks
// one of these helpers (tests/lint-project-types.js fails on a direct compare).
// String-level, so it also works on an Assignments.ProjectType value that has
// no Projects row yet.
function isNoDashboardType(type) {
  return !!type && CONFIG.NO_DASHBOARD_PROJECT_TYPES.includes(type);
}

function isNoDashboardProject(p) {
  return !!p && isNoDashboardType(p.ProjectType);
}

// Excluded from company KPIs, benchmarks, RAG and Snapshots: the internal
// project (own dashboard, never a company figure) or a no-dashboard project.
// Org Chart uses isInternalProject() alone — LCI / Transformation projects
// belong there.
function isKpiExcludedProject(p) {
  return isInternalProject(p) || isNoDashboardProject(p);
}

// Project pickers (role / activity / placement forms, Project Dashboard,
// Report Builder project scope): drops no-dashboard projects. Apply BEFORE
// any "only one project → lock the picker" test.
function dashboardProjects(projects) {
  return (projects || []).filter(p => !isNoDashboardProject(p));
}

// Sales Forecast type dropdown: every type that can be forecast, i.e. every
// type except Internal (N-521: LCI and Transformation included; their forecast
// takes the monthly-rate path and creates nothing recruitment-side). A fresh
// array each call.
function salesForecastTypes() {
  return CONFIG.PROJECT_TYPES.filter(t => t !== CONFIG.PROJECT_TYPE_INTERNAL);
}

// Set of String(project id) for every KPI-excluded project (internal or
// no-dashboard), archived included.
function kpiExcludedProjectIdSet(projects) {
  return new Set((projects || []).filter(isKpiExcludedProject).map(p => String(p.id)));
}

// Set of String(role id) whose project is KPI-excluded. Role → project is
// ProjectIDLookupId || ProjectID, as dashboard-company.js and the Snapshots writer.
function kpiExcludedRoleIdSet(roles, projects) {
  const pids = kpiExcludedProjectIdSet(projects);
  if (!pids.size) return new Set();
  return new Set((roles || [])
    .filter(r => r && pids.has(String(r.ProjectIDLookupId || r.ProjectID)))
    .map(r => String(r.id)));
}

// Role id of a row, per data key. Activity is keyed by ROLE, never by
// WeeklyActivity.ProjectID (an unvalidated copy — N-315); Placements and
// RejectedOffers have no ProjectID at all. `historical` = getHistoricalPlacements()
// rows, whose `id` is the pipeline (role) id.
const _INTERNAL_ROW_ROLE_ID = {
  activity:   r => r.RoleIDLookupId || r.RoleID,
  placements: r => r.RoleIDLookupId || r.RoleID,
  rejections: r => r.RoleIDLookupId || r.RoleID,
  stageRows:  r => r.RoleIDLookupId || r.RoleID,
  headcount:  r => r.RoleID,
  historical: r => r.id,
};

// THE shared filter. `data` holds any subset of: projects, roles, activity,
// placements, rejections, stageRows, headcount, historical. `ctx.projects` =
// every Projects row (getProjects(false)) — required; `ctx.roles` = the FULL
// role list used to map rows to projects (defaults to data.roles).
// Returns a NEW object, same keys, internal- and no-dashboard-project rows removed
// (N-362: the name stays, 15+ call sites and the lint list use it); null /
// undefined values pass through (degraded reads). With no internal project the
// input arrays come back as-is (no copy). Never mutates its inputs. An unknown
// key, a missing ctx.projects, or role-keyed rows with no roles to map them
// THROW: a programming error must fail loudly, never let internal rows through.
function excludeInternalProjectData(data, ctx = {}) {
  const src  = data || {};
  const keys = Object.keys(src);
  keys.forEach(k => {
    if (k !== 'projects' && k !== 'roles' && !_INTERNAL_ROW_ROLE_ID[k]) {
      throw new Error(`excludeInternalProjectData: unknown key '${k}'`);
    }
  });
  if (!Array.isArray(ctx.projects)) {
    throw new Error('excludeInternalProjectData: ctx.projects (every Projects row) is required');
  }
  const roles = ctx.roles || src.roles;
  if (!roles && keys.some(k => _INTERNAL_ROW_ROLE_ID[k] && src[k] != null)) {
    throw new Error('excludeInternalProjectData: role-keyed rows need ctx.roles or data.roles');
  }
  const out  = {};
  const pids = kpiExcludedProjectIdSet(ctx.projects);
  if (!pids.size) { keys.forEach(k => { out[k] = src[k]; }); return out; }
  const rids = kpiExcludedRoleIdSet(roles, ctx.projects);
  keys.forEach(k => {
    const rows = src[k];
    if (rows == null) { out[k] = rows; return; }
    if (k === 'projects')   out[k] = rows.filter(p => !isKpiExcludedProject(p));
    else if (k === 'roles') out[k] = rows.filter(r => !(r && pids.has(String(r.ProjectIDLookupId || r.ProjectID))));
    else                    out[k] = rows.filter(r => !(r && rids.has(String(_INTERNAL_ROW_ROLE_ID[k](r)))));
  });
  return out;
}

// Project form Project Type options (N-333, N-362, N-521): every type, in
// CONFIG.PROJECT_TYPES order. LCI and Transformation can be created here (N-521);
// the rows stay no-dashboard through isNoDashboardProject(). A fresh array each call.
function projectFormTypes() {
  return [...CONFIG.PROJECT_TYPES];
}
