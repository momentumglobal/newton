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

// ── Projects ─────────────────────────────────────────────────────────

async function renderProjectsPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading projects...</p>";
  const projects = await getProjects(false);
  const role = getUserRole(getCurrentUser().email);
  const canEdit = ["admin","delivery_manager"].includes(role);
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
            ${canEdit ? `<td><a href="#" onclick="showEditProjectForm(${p.id})">Edit</a></td>` : ""}
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

let _rolesFilter = "Active";

async function renderRolesPage(filter) {
  if (filter !== undefined) _rolesFilter = filter;
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading roles...</p>";
  const [allRoles, allProjects] = await Promise.all([getAllRoles(), getProjects(false)]);
  const projectMap = Object.fromEntries(allProjects.map(p => [String(p.id), p.CustomerName]));
  const roles = allRoles.filter(ROLE_FILTERS[_rolesFilter] || (() => true));
  const userRole = getUserRole(getCurrentUser().email);
  const canEdit = ["admin","delivery_manager","talent_partner"].includes(userRole);

  const filterBtns = Object.keys(ROLE_FILTERS).map(f =>
    `<button class="btn-filter${_rolesFilter === f ? " active" : ""}" onclick="renderRolesPage('${f}')">${f}</button>`
  ).join("");

  main.innerHTML = `
    <div class="page-header">
      <h2>Roles</h2>
      <div class="page-header-actions">
        <div class="filter-group">${filterBtns}</div>
        ${canEdit ? '<button class="btn-primary" onclick="showAddRoleForm()">+ Add Role</button>' : ""}
      </div>
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Project</th><th>Role</th><th>Stage</th><th>Talent Partner</th>
        <th>Budget</th><th>Open Date</th><th>Target Hire Date</th><th>Days Open</th>${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${roles.map(r => {
          const days = daysOpen(r.OpenDate, r.ActualHireDate);
          const rowStyle = days !== null && days > 45 ? ' style="background-color:#ffd6d6;color:#000"' : '';
          const projectName = projectMap[String(r.ProjectIDLookupId)] || projectMap[String(r.ProjectID)] || "—";
          return `
          <tr${rowStyle}>
            <td>${projectName}</td>
            <td>${r.RoleTitle}</td>
            <td><span class="badge">${r.Stage || "—"}</span></td>
            <td>${r.TalentPartner || "—"}</td>
            <td>${formatSalary(r.Budget)}</td>
            <td>${r.OpenDate ? r.OpenDate.split("T")[0] : "—"}</td>
            <td>${r.TargetHireDate ? r.TargetHireDate.split("T")[0] : "—"}</td>
            <td>${days !== null ? days + " days" : "—"}</td>
            ${canEdit ? `<td><a href="#" onclick="showEditRoleForm(${r.id})">Edit</a></td>` : ""}
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}
async function showAddRoleForm() {
  document.getElementById("main-content").innerHTML = await renderRoleForm();
}
async function showEditRoleForm(id) {
  const data = await getItem("Roles", id);
  document.getElementById("main-content").innerHTML = await renderRoleForm(data);
}

// ── Weekly Activity ───────────────────────────────────────────────────

async function renderActivityPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading activity...</p>";
  const [activity, allRoles] = await Promise.all([getWeeklyActivity(), getAllRoles()]);
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), r.RoleTitle]));
  const role = getUserRole(getCurrentUser().email);
  const canEdit = ["admin","talent_partner"].includes(role);
  main.innerHTML = `
    <div class="page-header">
      <h2>Weekly Activity</h2>
      ${canEdit ? '<button class="btn-primary" onclick="showAddActivityForm()">+ Log Activity</button>' : ""}
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Year</th><th>Week</th><th>Role</th><th>Talent Partner</th>
        <th>Outreach</th><th>Screened</th><th>Submitted</th>
        <th>Offers</th><th>Hires</th>${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${activity.map(a => `
          <tr>
            <td>${a.Year}</td>
            <td>Wk ${a.WeekNumber}</td>
            <td>${roleMap[String(a.RoleIDLookupId)] || roleMap[String(a.RoleID)] || "—"}</td>
            <td>${a.TalentPartner || "—"}</td>
            <td>${a.Outreach || 0}</td>
            <td>${a.Screened || 0}</td>
            <td>${a.Submitted || 0}</td>
            <td>${a.Offers || 0}</td>
            <td>${a.Hires || 0}</td>
            ${canEdit ? `<td><a href="#" onclick="showEditActivityForm(${a.id})">Edit</a></td>` : ""}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
async function showAddActivityForm() {
  document.getElementById("main-content").innerHTML = await renderWeeklyActivityForm();
}
async function showEditActivityForm(id) {
  const data = await getItem("WeeklyActivity", id);
  document.getElementById("main-content").innerHTML = await renderWeeklyActivityForm(data);
}

// ── Placements ────────────────────────────────────────────────────────

const PLACEMENT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PLACEMENT_YEARS  = [2026, 2025, 2024, 2023];
let _placementFilter = { type: null, value: null };

function placementInFilter(p, filter) {
  if (!filter.type) return true;
  const dateStr = p.OfferAcceptedDate;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  if (filter.type === "year")    return year === filter.value;
  if (filter.type === "quarter") return year === new Date().getFullYear() && Math.floor(month / 3) + 1 === filter.value;
  if (filter.type === "month")   return year === new Date().getFullYear() && month === filter.value;
  return true;
}

function placementFilterLabel() {
  const f = _placementFilter;
  if (!f.type) return "All";
  if (f.type === "year")    return String(f.value);
  if (f.type === "quarter") return `Q${f.value}`;
  if (f.type === "month")   return PLACEMENT_MONTHS[f.value];
  return "All";
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
  const [allPlacements, allRoles] = await Promise.all([getPlacements(), getAllRoles()]);
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), r.RoleTitle]));
  const placements = allPlacements.filter(p => placementInFilter(p, _placementFilter));
  const role = getUserRole(getCurrentUser().email);
  const canEdit = ["admin","talent_partner"].includes(role);

  const thisYear = new Date().getFullYear();
  const monthBtns = PLACEMENT_MONTHS.map((m, i) =>
    `<button class="btn-filter${_placementFilter.type === "month" && _placementFilter.value === i ? " active" : ""}" onclick="setPlacementFilter('month',${i})">${m}</button>`
  ).join("");
  const quarterBtns = [1,2,3,4].map(q =>
    `<button class="btn-filter${_placementFilter.type === "quarter" && _placementFilter.value === q ? " active" : ""}" onclick="setPlacementFilter('quarter',${q})">Q${q}</button>`
  ).join("");
  const yearBtns = PLACEMENT_YEARS.map(y =>
    `<button class="btn-filter${_placementFilter.type === "year" && _placementFilter.value === y ? " active" : ""}" onclick="setPlacementFilter('year',${y})">${y}</button>`
  ).join("");

  main.innerHTML = `
    <div class="page-header">
      <h2>Placements</h2>
      <div class="page-header-actions">
        <div class="filter-group">${monthBtns}</div>
        <div class="filter-group">${quarterBtns}</div>
        <div class="filter-group">${yearBtns}</div>
        ${canEdit ? '<button class="btn-primary" onclick="showAddPlacementForm()">+ Record Placement</button>' : ""}
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
            ${canEdit ? `<td><a href="#" onclick="showEditPlacementForm(${p.id})">Edit</a></td>` : ""}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
async function showAddPlacementForm() {
  document.getElementById("main-content").innerHTML = await renderPlacementForm();
}
async function showEditPlacementForm(id) {
  const data = await getItem("Placements", id);
  document.getElementById("main-content").innerHTML = await renderPlacementForm(data);
}

// ── Rejected Offers ───────────────────────────────────────────────────

async function renderRejectionsPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading rejections...</p>";
  const [rejections, allRoles] = await Promise.all([getRejectedOffers(), getAllRoles()]);
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), r.RoleTitle]));
  const role = getUserRole(getCurrentUser().email);
  const canEdit = ["admin","talent_partner"].includes(role);
  main.innerHTML = `
    <div class="page-header">
      <h2>Rejected Offers</h2>
      ${canEdit ? '<button class="btn-primary" onclick="showAddRejectionForm()">+ Log Rejection</button>' : ""}
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Candidate</th><th>Role</th><th>Salary Offered</th>
        <th>Reason</th><th>Notes</th>${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${rejections.map(r => `
          <tr>
            <td>${r.CandidateName}</td>
            <td>${roleMap[String(r.RoleIDLookupId)] || roleMap[String(r.RoleID)] || "—"}</td>
            <td>${formatSalary(r.SalaryOffered)}</td>
            <td>${r.RejectionReason || "—"}</td>
            <td>${r.Notes || "—"}</td>
            ${canEdit ? `<td><a href="#" onclick="showEditRejectionForm(${r.id})">Edit</a></td>` : ""}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
async function showAddRejectionForm() {
  document.getElementById("main-content").innerHTML = await renderRejectedOfferForm();
}
async function showEditRejectionForm(id) {
  const data = await getItem("RejectedOffers", id);
  document.getElementById("main-content").innerHTML = await renderRejectedOfferForm(data);
}
