// js/forms.js — Data entry forms

// ── Utilities ───────────────────────────────────────────────────────

function showFormError(formId, message) {
  const el = document.getElementById(`${formId}-error`);
  if (el) { el.textContent = message; el.style.display = "block"; }
}

function clearFormError(formId) {
  const el = document.getElementById(`${formId}-error`);
  if (el) { el.textContent = ""; el.style.display = "none"; }
}

function isoDate(dateStr) {
  // Ensure dates are stored as ISO strings (YYYY-MM-DD)
  return dateStr ? new Date(dateStr).toISOString().split("T")[0] : null;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ── Project Form ────────────────────────────────────────────────────

function renderProjectForm(existingData = null) {
  const isEdit = !!existingData;
  return `
    <div class="form-container">
      <h2>${isEdit ? "Edit Project" : "Add Project"}</h2>
      <div id="project-form-error" class="form-error"></div>
      <form id="project-form" onsubmit="submitProjectForm(event, ${existingData?.id || "null"})">
        <div class="form-group">
          <label>Customer Name *</label>
          <input type="text" name="CustomerName" required
            value="${existingData?.CustomerName || ""}">
        </div>
        <div class="form-group">
          <label>Delivery Manager *</label>
          <input type="text" name="DeliveryManager" required
            value="${existingData?.DeliveryManager || ""}">
        </div>
        <div class="form-group">
          <label>Status *</label>
          <select name="Status" required>
            <option value="Active" ${existingData?.Status === "Active" ? "selected" : ""}>Active</option>
            <option value="Transition" ${existingData?.Status === "Transition" ? "selected" : ""}>Transition</option>
            <option value="Completed" ${existingData?.Status === "Completed" ? "selected" : ""}>Completed</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Start Date</label>
            <input type="date" name="StartDate"
              value="${existingData?.StartDate ? existingData.StartDate.split("T")[0] : ""}">
          </div>
          <div class="form-group">
            <label>End Date</label>
            <input type="date" name="EndDate"
              value="${existingData?.EndDate ? existingData.EndDate.split("T")[0] : ""}">
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="Notes" rows="3">${existingData?.Notes || ""}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? "Save Changes" : "Add Project"}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('projects')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

async function submitProjectForm(event, editId = null) {
  event.preventDefault();
  clearFormError("project-form");
  const form = document.getElementById("project-form");
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    CustomerName:    data.CustomerName,
    DeliveryManager: data.DeliveryManager,
    Status:          data.Status,
    StartDate:       isoDate(data.StartDate) || undefined,
    EndDate:         isoDate(data.EndDate) || undefined,
    Notes:           data.Notes || undefined,
  };
  try {
    if (editId) {
      await updateItem("Projects", editId, fields);
    } else {
      await createItem("Projects", fields);
    }
    navigateTo("projects");
  } catch (e) {
    showFormError("project-form", `Error saving project: ${e.message}`);
  }
}

// ── Role Form ────────────────────────────────────────────────────────

async function renderRoleForm(existingData = null, preselectedProjectId = null) {
  const isEdit = !!existingData;
  const projects = await getProjects(false); // all projects for dropdown
  const projectOptions = projects.map(p =>
    `<option value="${p.id}" ${
      (existingData?.ProjectID == p.id || preselectedProjectId == p.id) ? "selected" : ""
    }>${p.CustomerName}</option>`
  ).join("");

  return `
    <div class="form-container">
      <h2>${isEdit ? "Edit Role" : "Add Role"}</h2>
      <div id="role-form-error" class="form-error"></div>
      <form id="role-form" onsubmit="submitRoleForm(event, ${existingData?.id || "null"})">
        <div class="form-group">
          <label>Project *</label>
          <select name="ProjectID" required>
            <option value="">-- Select project --</option>
            ${projectOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Role Title *</label>
          <input type="text" name="RoleTitle" required
            value="${existingData?.RoleTitle || ""}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Hiring Manager</label>
            <input type="text" name="HiringManager"
              value="${existingData?.HiringManager || ""}">
          </div>
          <div class="form-group">
            <label>Talent Partner</label>
            <input type="text" name="TalentPartner"
              value="${existingData?.TalentPartner || ""}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Budget</label>
            <input type="text" name="Budget"
              value="${existingData?.Budget || ""}">
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select name="Priority">
              <option value="">--</option>
              <option value="1" ${existingData?.Priority == 1 ? "selected" : ""}>1 — High</option>
              <option value="2" ${existingData?.Priority == 2 ? "selected" : ""}>2 — Medium</option>
              <option value="3" ${existingData?.Priority == 3 ? "selected" : ""}>3 — Low</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Stage *</label>
            <select name="Stage" required>
              ${["Backlog","Planning","Sourcing","Submitted","Interview 1",
                 "Interview 2+","Final Interview","Offered","Hired","On-hold","Cancelled"]
                .map(s => `<option value="${s}" ${existingData?.Stage === s ? "selected" : ""}>${s}</option>`))
                .join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Backfill?</label>
            <select name="Backfill">
              <option value="">--</option>
              <option value="Yes" ${existingData?.Backfill === "Yes" ? "selected" : ""}>Yes</option>
              <option value="No" ${existingData?.Backfill === "No" ? "selected" : ""}>No</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Open Date</label>
            <input type="date" name="OpenDate" id="role-open-date"
              onchange="autoFillTargetDate()"
              value="${existingData?.OpenDate ? existingData.OpenDate.split("T")[0] : ""}">
          </div>
          <div class="form-group">
            <label>Target Hire Date (auto: Open + 45d)</label>
            <input type="date" name="TargetHireDate" id="role-target-date"
              value="${existingData?.TargetHireDate ? existingData.TargetHireDate.split("T")[0] : ""}">
          </div>
        </div>
        <div class="form-group">
          <label>Department</label>
          <input type="text" name="Department"
            value="${existingData?.Department || ""}">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="Notes" rows="3">${existingData?.Notes || ""}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? "Save Changes" : "Add Role"}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('roles')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

function autoFillTargetDate() {
  const open = document.getElementById("role-open-date").value;
  const target = document.getElementById("role-target-date");
  if (open && !target.value) {
    target.value = addDays(open, 45);
  }
}

async function submitRoleForm(event, editId = null) {
  event.preventDefault();
  clearFormError("role-form");
  const form = document.getElementById("role-form");
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    ProjectID:      parseInt(data.ProjectID),
    RoleTitle:      data.RoleTitle,
    HiringManager:  data.HiringManager || undefined,
    TalentPartner:  data.TalentPartner || undefined,
    Budget:         data.Budget || undefined,
    Priority:       data.Priority ? parseInt(data.Priority) : undefined,
    Backfill:       data.Backfill || undefined,
    Stage:          data.Stage,
    OpenDate:       isoDate(data.OpenDate) || undefined,
    TargetHireDate: isoDate(data.TargetHireDate) || undefined,
    Department:     data.Department || undefined,
    Notes:          data.Notes || undefined,
  };
  try {
    if (editId) {
      await updateItem("Roles", editId, fields);
    } else {
      await createItem("Roles", fields);
    }
    navigateTo("roles");
  } catch (e) {
    showFormError("role-form", `Error saving role: ${e.message}`);
  }
}
