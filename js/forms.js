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
