// js/pages.js — Page content renderers

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

async function renderRolesPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading roles...</p>";
  const roles = await getAllRoles();
  const role = getUserRole(getCurrentUser().email);
  const canEdit = ["admin","delivery_manager","talent_partner"].includes(role);
  main.innerHTML = `
    <div class="page-header">
      <h2>Roles</h2>
      ${canEdit ? '<button class="btn-primary" onclick="showAddRoleForm()">+ Add Role</button>' : ""}
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Role</th><th>Project</th><th>Stage</th><th>Talent Partner</th>
        <th>Open Date</th><th>Target Hire</th>${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${roles.map(r => `
          <tr>
            <td>${r.RoleTitle}</td>
            <td>${r.ProjectID || "—"}</td>
            <td><span class="badge">${r.Stage || "—"}</span></td>
            <td>${r.TalentPartner || "—"}</td>
            <td>${r.OpenDate ? r.OpenDate.split("T")[0] : "—"}</td>
            <td>${r.TargetHireDate ? r.TargetHireDate.split("T")[0] : "—"}</td>
            ${canEdit ? `<td><a href="#" onclick="showEditRoleForm(${r.id})">Edit</a></td>` : ""}
          </tr>
        `).join("")}
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

async function renderActivityPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading activity...</p>";
  const activity = await getWeeklyActivity();
  const role = getUserRole(getCurrentUser().email);
  const canEdit = ["admin","talent_partner"].includes(role);
  main.innerHTML = `
    <div class="page-header">
      <h2>Weekly Activity</h2>
      ${canEdit ? '<button class="btn-primary" onclick="showAddActivityForm()">+ Log Activity</button>' : ""}
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Week</th><th>Year</th><th>Talent Partner</th>
        <th>Outreach</th><th>Screened</th><th>Submitted</th>
        <th>Offers</th><th>Hires</th>${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${activity.map(a => `
          <tr>
            <td>Wk ${a.WeekNumber}</td>
            <td>${a.Year}</td>
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

async function renderPlacementsPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading placements...</p>";
  const placements = await getPlacements();
  const role = getUserRole(getCurrentUser().email);
  const canEdit = ["admin","talent_partner"].includes(role);
  main.innerHTML = `
    <div class="page-header">
      <h2>Placements</h2>
      ${canEdit ? '<button class="btn-primary" onclick="showAddPlacementForm()">+ Record Placement</button>' : ""}
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
            <td>${p.RoleID || "—"}</td>
            <td>${p.SalaryAgreed || "—"}</td>
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

async function renderRejectionsPage() {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading rejections...</p>";
  const rejections = await getRejectedOffers();
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
            <td>${r.RoleID || "—"}</td>
            <td>${r.SalaryOffered || "—"}</td>
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
