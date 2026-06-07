// js/pages.js — Page content renderers
function formatSalary(val) {
  if (!val) return "—";
  const num = parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return val;
  return num.toLocaleString("en-GB");
}
function daysOpen(openDate, hireDate) {
  if (!openDate) return null;
  const start = new Date(openDate);
  const end = hireDate ? new Date(hireDate) : new Date();
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}
// ── Project filter helper ─────────────────────────────────────────────
async function getProjectFilterOptions() {
  const role = _resolvedRole;
  if (role === 'talent_partner') return { projects: [], canFilter: false };
  const user = getCurrentUser();
  let projects;
  if (role === 'admin') {
    projects = await getProjects(false);
  } else {
    const ids = await getUserProjectIds(user.email);
    const all = await getProjects(false);
    const idSet = new Set(ids.map(String));
    projects = all.filter(p => idSet.has(String(p.id)));
  }
  return { projects, canFilter: true };
}
function projectFilterDropdown(projects, selectedId, callbackFn) {
  const options = [
    `<option value="" ${!selectedId ? 'selected' : ''}>All Projects</option>`,
    ...projects.map(p =>
      `<option value="${p.id}" ${String(selectedId) === String(p.id) ? 'selected' : ''}>${p.CustomerName}</option>`
    )
  ].join('');
  return `<div class="project-filter-bar">
    <div class="form-group project-filter-select">
      <label>Project</label>
      <select onchange="${callbackFn}(this.value)">${options}</select>
    </div>
  </div>`;
}
// ── Projects ─────────────────────────────────────────────────────────
async function renderProjectsPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading projects...</p>";
  const role = _resolvedRole;
  const user = getCurrentUser();
  const projects = await getScopedProjects(user.email, false);
  const canEdit = ["admin","delivery_manager"].includes(role);
  projects.sort((a, b) => {
    const dm = (a.DeliveryManager || '').localeCompare(b.DeliveryManager || '');
    if (dm !== 0) return dm;
    return (a.CustomerName || '').localeCompare(b.CustomerName || '');
  });
  main.innerHTML = `
    <div class="page-header">
      <h2>Projects</h2>
      ${canEdit ? '<button class="btn-primary" onclick="showAddProjectForm()">+ Add Project</button>' : ""}
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Customer</th><th>Delivery Manager</th><th>Status</th>
        <th>Start</th><th>End</th>${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${projects.map(p => `
          <tr>
            <td>${p.CustomerName}</td>
            <td>${p.DeliveryManager || "—"}</td>
            <td><span class="badge badge-${p.Status?.toLowerCase()}">${p.Status}</span></td>
            <td>${p.StartDate ? p.StartDate.split("T")[0] : "—"}</td>
            <td>${p.EndDate ? p.EndDate.split("T")[0] : "—"}</td>
            ${canEdit ? `<td><div class="row-actions"><a href="#" onclick="showEditProjectForm(${p.id})">Edit</a></div></td>` : ""}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
async function showAddProjectForm() {
  document.getElementById("main-content").innerHTML = renderProjectForm();
}
async function showEditProjectForm(id) {
  const data = await getItem("Projects", id);
  document.getElementById("main-content").innerHTML = renderProjectForm(data);
}
// ── Roles ─────────────────────────────────────────────────────────────
const ROLE_FILTERS = {
  Backlog:   r => ["Backlog","On-hold"].includes(r.Stage),
  Active:    r => !["Backlog","Hired","On-hold","Cancelled"].includes(r.Stage),
  Hired:     r => r.Stage === "Hired",
  Cancelled: r => r.Stage === "Cancelled",
};
let _rolesFilter    = "Active";
let _rolesProjectId = null;
async function renderRolesPage(filter) {
  if (filter !== undefined) _rolesFilter = filter;
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading roles...</p>";
  const user = getCurrentUser();
  const userProjectIds = await getUserProjectIds(user.email);
  const [allRoles, allProjects, { projects: scopedProjects, canFilter }, tpMap] = await Promise.all([
  getAllRoles(),
  getProjects(false),
  getProjectFilterOptions(),
  getTalentPartnerDisplayMap(),
]);
  const projectMap = Object.fromEntries(allProjects.map(p => [String(p.id), p.CustomerName]));
  // Scope to user's assigned projects
  let roles = userProjectIds
    ? allRoles.filter(r => userProjectIds.includes(String(r.ProjectIDLookupId || r.ProjectID)))
    : allRoles;
  // Apply project dropdown filter
  if (canFilter && _rolesProjectId) {
    roles = roles.filter(r =>
      String(r.ProjectIDLookupId) === String(_rolesProjectId) ||
      String(r.ProjectID) === String(_rolesProjectId)
    );
  }
  roles = roles.filter(ROLE_FILTERS[_rolesFilter] || (() => true));
  roles.sort((a, b) => {
    const pA = projectMap[String(a.ProjectIDLookupId)] || projectMap[String(a.ProjectID)] || '';
    const pB = projectMap[String(b.ProjectIDLookupId)] || projectMap[String(b.ProjectID)] || '';
    const proj = pA.localeCompare(pB);
    if (proj !== 0) return proj;
    return new Date(a.OpenDate || 0) - new Date(b.OpenDate || 0);
  });
  const userRole = _resolvedRole;
  const canEdit  = ["admin","delivery_manager","talent_partner"].includes(userRole);
  const filterBtns = Object.keys(ROLE_FILTERS).map(f =>
    `<button class="btn-filter${_rolesFilter === f ? " active" : ""}" onclick="renderRolesPage('${f}')">${f}</button>`
  ).join("");
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _rolesProjectId, 'setRolesProject')
    : '';
  main.innerHTML = `
    <div class="page-header">
      <h2>Roles</h2>
      ${canEdit ? '<div class="page-header-actions"><button class="btn-primary" onclick="showAddRoleForm()">+ Add Role</button></div>' : ""}
    </div>
    <div class="table-toolbar">
      ${projDropdown}
      <div class="filter-group">${filterBtns}</div>
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Project</th><th>Role</th><th>Location</th><th>Stage</th><th>Talent Partner</th>
        <th>Budget</th><th>Open Date</th><th>Target Hire Date</th><th>Days Open</th>${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${roles.map(r => {
          const days = daysOpen(r.OpenDate, r.ActualHireDate);
          const rowClass = days !== null && days > 45 ? 'row-age-critical' : '';
          const projectName = projectMap[String(r.ProjectIDLookupId)] || projectMap[String(r.ProjectID)] || "—";
          return `
          <tr class="${rowClass}">
            <td>${projectName}</td>
            <td>${r.RoleTitle}</td>
            <td>${r.Location || '—'}</td>
            <td><span class="badge">${r.Stage || "—"}</span></td>
            <td>${tpMap[(r.TalentPartner || '').toLowerCase()] || r.TalentPartner || "—"}</td>
            <td>${formatSalary(r.Budget)}</td>
            <td>${r.OpenDate ? r.OpenDate.split("T")[0] : "—"}</td>
            <td>${r.TargetHireDate ? r.TargetHireDate.split("T")[0] : "—"}</td>
            <td>${days !== null ? days + " days" : "—"}</td>
            ${canEdit ? `<td><div class="row-actions"><a href="#" onclick="showEditRoleForm(${r.id})">Edit</a></div></td>` : ""}
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}
function setRolesProject(val) { _rolesProjectId = val || null; renderRolesPage(); }
async function showAddRoleForm() {
  document.getElementById("main-content").innerHTML = await renderRoleForm();
}
async function showEditRoleForm(id) {
  const data = await getItem("Roles", id);
  document.getElementById("main-content").innerHTML = await renderRoleForm(data);
}
// ── Weekly Activity ───────────────────────────────────────────────────
let _activityProjectId = null;
async function renderActivityPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading activity...</p>";
  const user = getCurrentUser();
  const userProjectIds = await getUserProjectIds(user.email);
  const [activity, allRoles, { projects: scopedProjects, canFilter }, tpMap] = await Promise.all([
  getWeeklyActivity(),
  getAllRoles(),
  getProjectFilterOptions(),
  getTalentPartnerDisplayMap(),
]);
  const roleProjectMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), String(r.ProjectIDLookupId || r.ProjectID || '')])
  );
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle]));
  activity.sort((a, b) => {
    const yr = Number(b.Year) - Number(a.Year);
    if (yr !== 0) return yr;
    return Number(b.WeekNumber) - Number(a.WeekNumber);
  });
  // Scope to user's assigned projects
  let filteredActivity = userProjectIds
    ? activity.filter(a => {
        const rid = String(a.RoleIDLookupId || a.RoleID || '');
        return userProjectIds.includes(roleProjectMap[rid]);
      })
    : activity;
  // For Talent Partners, also scope to their own entries
  if (_resolvedRole === 'talent_partner') {
    filteredActivity = filteredActivity.filter(a =>
      (a.TalentPartner || '').toLowerCase() === (user.email || '').toLowerCase()
    );
  }
  if (canFilter && _activityProjectId) {
    filteredActivity = filteredActivity.filter(a => {
      const rid = String(a.RoleIDLookupId || a.RoleID || '');
      return roleProjectMap[rid] === String(_activityProjectId);
    });
  }
  const role    = _resolvedRole;
  const canEdit = ["admin","delivery_manager","talent_partner"].includes(role);
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _activityProjectId, 'setActivityProject')
    : '';
  main.innerHTML = `
    <div class="page-header">
      <h2>Weekly Activity</h2>
      ${canEdit ? '<div class="page-header-actions"><button class="btn-primary" onclick="showAddActivityForm()">+ Log Activity</button></div>' : ""}
    </div>
    <div class="table-toolbar">
      ${projDropdown}
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Year</th><th>Week</th><th>Role</th><th>Talent Partner</th>
        <th style="text-align:center">Outreach</th>
        <th style="text-align:center">Responses</th>
        <th style="text-align:center">Screened</th>
        <th style="text-align:center">Submitted</th>
        <th style="text-align:center">IV1</th>
        <th style="text-align:center">IV2+</th>
        <th style="text-align:center">Final IV</th>
        <th style="text-align:center">Offers</th>
        <th style="text-align:center">Hires</th>
        ${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${filteredActivity.map(a => `
          <tr>
            <td>${a.Year}</td>
            <td>Wk ${a.WeekNumber}</td>
            <td>${roleMap[String(a.RoleIDLookupId)] || roleMap[String(a.RoleID)] || "—"}</td>
            <td>${tpMap[(a.TalentPartner || '').toLowerCase()] || a.TalentPartner || "—"}</td>
            <td style="text-align:center">${a.Outreach || 0}</td>
            <td style="text-align:center">${a.Responses || 0}</td>
            <td style="text-align:center">${a.Screened || 0}</td>
            <td style="text-align:center">${a.Submitted || 0}</td>
            <td style="text-align:center">${a.Interview1 || 0}</td>
            <td style="text-align:center">${a.InterviewTwoPlus || 0}</td>
            <td style="text-align:center">${a.FinalInterview || 0}</td>
            <td style="text-align:center">${a.Offers || 0}</td>
            <td style="text-align:center">${a.Hires || 0}</td>
            ${canEdit ? `<td><div class="row-actions"><a href="#" onclick="showEditActivityForm(${a.id})">Edit</a></div></td>` : ""}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
function setActivityProject(val) { _activityProjectId = val || null; renderActivityPage(); }
async function showAddActivityForm() {
  document.getElementById("main-content").innerHTML = await renderWeeklyActivityForm();
}
async function showEditActivityForm(id) {
  const data = await getItem("WeeklyActivity", id);
  document.getElementById("main-content").innerHTML = await renderWeeklyActivityForm(data);
}
// ── Placements ────────────────────────────────────────────────────────
const PLACEMENT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PLACEMENT_YEARS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);
let _placementFilter    = { type: null, value: null };
let _placementProjectId = null;
function placementInFilter(p, filter) {
  if (!filter.type) return true;
  const dateStr = p.OfferAcceptedDate;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  if (filter.type === "year")    return year === filter.value;
  if (filter.type === "quarter") return year === new Date().getFullYear() && Math.floor(month / 3) + 1 === filter.value;
  if (filter.type === "month")   return year === new Date().getFullYear() && month === filter.value;
  return true;
}
function setPlacementFilter(type, value) {
  if (_placementFilter.type === type && _placementFilter.value === value) {
    _placementFilter = { type: null, value: null };
  } else {
    _placementFilter = { type, value };
  }
  renderPlacementsPage();
}
async function renderPlacementsPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading placements...</p>";
  const user = getCurrentUser();
  const userProjectIds = await getUserProjectIds(user.email);
  const [allPlacements, allRoles, { projects: scopedProjects, canFilter }] = await Promise.all([
    getPlacements(),
    getAllRoles(),
    getProjectFilterOptions(),
  ]);
  const roleProjectMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), String(r.ProjectIDLookupId || r.ProjectID || '')])
  );
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle]));
  allPlacements.sort((a, b) =>
    new Date(b.OfferAcceptedDate || 0) - new Date(a.OfferAcceptedDate || 0)
  );
  // Scope to user's assigned projects
  const scopedPlacements = userProjectIds
    ? allPlacements.filter(p => {
        const rid = String(p.RoleIDLookupId || p.RoleID || '');
        return userProjectIds.includes(roleProjectMap[rid]);
      })
    : allPlacements;
  let placements = scopedPlacements.filter(p => placementInFilter(p, _placementFilter));
  if (canFilter && _placementProjectId) {
    placements = placements.filter(p => {
      const rid = String(p.RoleIDLookupId || p.RoleID || '');
      return roleProjectMap[rid] === String(_placementProjectId);
    });
  }
  const role    = _resolvedRole;
  const canEdit = ["admin","delivery_manager","talent_partner"].includes(role);
  const monthBtns = PLACEMENT_MONTHS.map((m, i) =>
    `<button class="btn-filter${_placementFilter.type === "month" && _placementFilter.value === i ? " active" : ""}" onclick="setPlacementFilter('month',${i})">${m}</button>`
  ).join("");
  const quarterBtns = [1,2,3,4].map(q =>
    `<button class="btn-filter${_placementFilter.type === "quarter" && _placementFilter.value === q ? " active" : ""}" onclick="setPlacementFilter('quarter',${q})">Q${q}</button>`
  ).join("");
  const yearBtns = PLACEMENT_YEARS.map(y =>
    `<button class="btn-filter${_placementFilter.type === "year" && _placementFilter.value === y ? " active" : ""}" onclick="setPlacementFilter('year',${y})">${y}</button>`
  ).join("");
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _placementProjectId, 'setPlacementProject')
    : '';
  main.innerHTML = `
    <div class="page-header">
      <h2>Placements</h2>
      <div class="page-header-actions">
        ${canEdit ? '<button class="btn-primary" onclick="showAddPlacementForm()">+ Record Placement</button>' : ""}
      </div>
    </div>
    <div class="table-toolbar">
      ${projDropdown}
      <div class="placement-filter-rows">
        <div class="placement-filter-row">
          <div class="filter-labeled-group"><span class="filter-label">Month</span><div class="filter-group">${monthBtns}</div></div>
        </div>
        <div class="placement-filter-row">
          <div class="filter-labeled-group"><span class="filter-label">Quarter</span><div class="filter-group">${quarterBtns}</div></div>
          <div class="filter-labeled-group"><span class="filter-label">Year</span><div class="filter-group">${yearBtns}</div></div>
        </div>
      </div>
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Candidate</th><th>Role</th><th>Salary</th>
        <th>Offer Accepted</th><th>Start Date</th><th>Time to Hire</th>
        ${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${placements.map(p => `
          <tr>
            <td>${p.CandidateName}</td>
            <td>${roleMap[String(p.RoleIDLookupId)] || roleMap[String(p.RoleID)] || "—"}</td>
            <td>${formatSalary(p.SalaryAgreed)}</td>
            <td>${p.OfferAcceptedDate ? p.OfferAcceptedDate.split("T")[0] : "—"}</td>
            <td>${p.ProvisionalStartDate ? p.ProvisionalStartDate.split("T")[0] : "—"}</td>
            <td>${p.TimeToHire != null ? p.TimeToHire + " days" : "—"}</td>
            ${canEdit ? `<td><div class="row-actions"><a href="#" onclick="showEditPlacementForm(${p.id})">Edit</a></div></td>` : ""}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
function setPlacementProject(val) { _placementProjectId = val || null; renderPlacementsPage(); }
async function showAddPlacementForm() {
  document.getElementById("main-content").innerHTML = await renderPlacementForm();
}
async function showEditPlacementForm(id) {
  const data = await getItem("Placements", id);
  document.getElementById("main-content").innerHTML = await renderPlacementForm(data);
}
// ── Rejected Offers ───────────────────────────────────────────────────
let _rejectionsProjectId = null;
async function renderRejectionsPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading rejections...</p>";
  const user = getCurrentUser();
  const userProjectIds = await getUserProjectIds(user.email);
  const [rejections, allRoles, { projects: scopedProjects, canFilter }] = await Promise.all([
    getRejectedOffers(),
    getAllRoles(),
    getProjectFilterOptions(),
  ]);
  const roleProjectMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), String(r.ProjectIDLookupId || r.ProjectID || '')])
  );
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle]));
  rejections.sort((a, b) => {
    const rA = roleMap[String(a.RoleIDLookupId)] || roleMap[String(a.RoleID)] || '';
    const rB = roleMap[String(b.RoleIDLookupId)] || roleMap[String(b.RoleID)] || '';
    return rA.localeCompare(rB);
  });
  // Scope to user's assigned projects
  let filteredRejections = userProjectIds
    ? rejections.filter(r => {
        const rid = String(r.RoleIDLookupId || r.RoleID || '');
        return userProjectIds.includes(roleProjectMap[rid]);
      })
    : rejections;
  if (canFilter && _rejectionsProjectId) {
    filteredRejections = filteredRejections.filter(r => {
      const rid = String(r.RoleIDLookupId || r.RoleID || '');
      return roleProjectMap[rid] === String(_rejectionsProjectId);
    });
  }
  const role    = _resolvedRole;
  const canEdit = ["admin","delivery_manager","talent_partner"].includes(role);
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _rejectionsProjectId, 'setRejectionsProject')
    : '';
  main.innerHTML = `
    <div class="page-header">
      <h2>Rejected Offers</h2>
      ${canEdit ? '<div class="page-header-actions"><button class="btn-primary" onclick="showAddRejectionForm()">+ Log Rejection</button></div>' : ""}
    </div>
    <div class="table-toolbar">
      ${projDropdown}
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Candidate</th><th>Role</th><th>Salary Offered</th>
        <th>Reason</th><th>Notes</th>${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${filteredRejections.map(r => `
          <tr>
            <td>${r.CandidateName}</td>
            <td>${roleMap[String(r.RoleIDLookupId)] || roleMap[String(r.RoleID)] || "—"}</td>
            <td>${formatSalary(r.SalaryOffered)}</td>
            <td>${r.RejectionReason || "—"}</td>
            <td>${r.Notes || "—"}</td>
            ${canEdit ? `<td><div class="row-actions"><a href="#" onclick="showEditRejectionForm(${r.id})">Edit</a></div></td>` : ""}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
function setRejectionsProject(val) { _rejectionsProjectId = val || null; renderRejectionsPage(); }
async function showAddRejectionForm() {
  document.getElementById("main-content").innerHTML = await renderRejectedOfferForm();
}
async function showEditRejectionForm(id) {
  const data = await getItem("RejectedOffers", id);
  document.getElementById("main-content").innerHTML = await renderRejectedOfferForm(data);
}
