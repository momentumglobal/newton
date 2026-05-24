// js/forms.js — Data entry forms

// ── Utilities ───────────────────────────────────────────────────────

function showFormError(formId, message) {
  const el = document.getElementById(`${formId}-error`);
  if (el) { el.textContent = message; el.style.display = 'block'; }
}

function clearFormError(formId) {
  const el = document.getElementById(`${formId}-error`);
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function isoDate(dateStr) {
  return dateStr ? new Date(dateStr).toISOString().split('T')[0] : null;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ── Project Form ────────────────────────────────────────────────────

function renderProjectForm(existingData = null) {
  const isEdit = !!existingData;
  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Project' : 'Add Project'}</h2>
      <div id="project-form-error" class="form-error"></div>
      <form id="project-form" onsubmit="submitProjectForm(event, ${existingData?.id || 'null'})">
        <div class="form-group">
          <label>Customer Name *</label>
          <input type="text" name="CustomerName" required
            value="${existingData?.CustomerName || ''}">
        </div>
        <div class="form-group">
          <label>Delivery Manager *</label>
          <input type="text" name="DeliveryManager" required
            value="${existingData?.DeliveryManager || ''}">
        </div>
        <div class="form-group">
          <label>Status *</label>
          <select name="Status" required>
            <option value="Active" ${existingData?.Status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="Transition" ${existingData?.Status === 'Transition' ? 'selected' : ''}>Transition</option>
            <option value="Completed" ${existingData?.Status === 'Completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Start Date</label>
            <input type="date" name="StartDate"
              value="${existingData?.StartDate ? existingData.StartDate.split('T')[0] : ''}">
          </div>
          <div class="form-group">
            <label>End Date</label>
            <input type="date" name="EndDate"
              value="${existingData?.EndDate ? existingData.EndDate.split('T')[0] : ''}">
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="Notes" rows="3">${existingData?.Notes || ''}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Add Project'}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('projects')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

async function submitProjectForm(event, editId = null) {
  event.preventDefault();
  clearFormError('project-form');
  const form = document.getElementById('project-form');
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
      await updateItem('Projects', editId, fields);
    } else {
      await createItem('Projects', fields);
    }
    navigateTo('projects');
  } catch (e) {
    showFormError('project-form', `Error saving project: ${e.message}`);
  }
}

// ── Role Form ────────────────────────────────────────────────────────

async function renderRoleForm(existingData = null, preselectedProjectId = null) {
  const isEdit = !!existingData;
  const projects = await getProjects(false);
  const projectOptions = projects.map(p =>
    `<option value="${p.id}" ${
      (existingData?.ProjectID == p.id || preselectedProjectId == p.id) ? 'selected' : ''
    }>${p.CustomerName}</option>`
  ).join('');

  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Role' : 'Add Role'}</h2>
      <div id="role-form-error" class="form-error"></div>
      <form id="role-form" onsubmit="submitRoleForm(event, ${existingData?.id || 'null'})">
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
            value="${existingData?.RoleTitle || ''}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Hiring Manager</label>
            <input type="text" name="HiringManager"
              value="${existingData?.HiringManager || ''}">
          </div>
          <div class="form-group">
            <label>Talent Partner</label>
            <input type="text" name="TalentPartner"
              value="${existingData?.TalentPartner || ''}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Budget</label>
            <input type="text" name="Budget"
              value="${existingData?.Budget || ''}">
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select name="Priority">
              <option value="">--</option>
              <option value="1" ${existingData?.Priority == 1 ? 'selected' : ''}>1 — High</option>
              <option value="2" ${existingData?.Priority == 2 ? 'selected' : ''}>2 — Medium</option>
              <option value="3" ${existingData?.Priority == 3 ? 'selected' : ''}>3 — Low</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Stage *</label>
            <select name="Stage" required>
              ${['Backlog','Planning','Sourcing','Submitted','Interview 1',
                 'Interview 2+','Final Interview','Offered','Hired','On-hold','Cancelled']
                .map(s => `<option value="${s}" ${existingData?.Stage === s ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Backfill?</label>
            <select name="Backfill">
              <option value="">--</option>
              <option value="Yes" ${existingData?.Backfill === 'Yes' ? 'selected' : ''}>Yes</option>
              <option value="No" ${existingData?.Backfill === 'No' ? 'selected' : ''}>No</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Open Date</label>
            <input type="date" name="OpenDate" id="role-open-date"
              onchange="autoFillTargetDate()"
              value="${existingData?.OpenDate ? existingData.OpenDate.split('T')[0] : ''}">
          </div>
          <div class="form-group">
            <label>Target Hire Date (auto: Open + 45d)</label>
            <input type="date" name="TargetHireDate" id="role-target-date"
              value="${existingData?.TargetHireDate ? existingData.TargetHireDate.split('T')[0] : ''}">
          </div>
        </div>
        <div class="form-group">
          <label>Department</label>
          <input type="text" name="Department"
            value="${existingData?.Department || ''}">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="Notes" rows="3">${existingData?.Notes || ''}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Add Role'}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('roles')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

function autoFillTargetDate() {
  const open = document.getElementById('role-open-date').value;
  const target = document.getElementById('role-target-date');
  if (open && !target.value) {
    target.value = addDays(open, 45);
  }
}

async function submitRoleForm(event, editId = null) {
  event.preventDefault();
  clearFormError('role-form');
  const form = document.getElementById('role-form');
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
      await updateItem('Roles', editId, fields);
    } else {
      await createItem('Roles', fields);
    }
    navigateTo('roles');
  } catch (e) {
    showFormError('role-form', `Error saving role: ${e.message}`);
  }
}

// ── Weekly Activity Form ────────────────────────────────────────────

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getWeekEnding(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

async function renderWeeklyActivityForm(existingData = null) {
  const isEdit = !!existingData;
  const projects = await getProjects(false);
  const projectOptions = projects.map(p =>
    `<option value="${p.id}" ${existingData?.ProjectID == p.id ? 'selected' : ''}>${p.CustomerName}</option>`
  ).join('');

  const today = new Date().toISOString().split('T')[0];
  const defaultWeek = existingData?.WeekNumber || getISOWeek(today);
  const defaultYear = existingData?.Year || new Date().getFullYear();

  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Weekly Activity' : 'Log Weekly Activity'}</h2>
      <div id="weekly-form-error" class="form-error"></div>
      <form id="weekly-form" onsubmit="submitWeeklyForm(event, ${existingData?.id || 'null'})">
        <div class="form-row">
          <div class="form-group">
            <label>Project *</label>
            <select name="ProjectID" required onchange="loadRolesForWeekly(this.value)">
              <option value="">-- Select project --</option>
              ${projectOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Role *</label>
            <select name="RoleID" id="weekly-role-select" required>
              <option value="">-- Select project first --</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Talent Partner</label>
            <input type="text" name="TalentPartner"
              value="${existingData?.TalentPartner || getCurrentUser().name || ''}">
          </div>
          <div class="form-group">
            <label>Week Ending Date *</label>
            <input type="date" name="WeekEndingDate" required
              onchange="autoFillWeekYear(this.value)"
              value="${existingData?.WeekEndingDate ? existingData.WeekEndingDate.split('T')[0] : getWeekEnding(today)}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Year</label>
            <input type="number" name="Year" id="weekly-year" min="2020" max="2099"
              value="${defaultYear}">
          </div>
          <div class="form-group">
            <label>Week Number</label>
            <input type="number" name="WeekNumber" id="weekly-weeknum" min="1" max="53"
              value="${defaultWeek}">
          </div>
        </div>
        <div class="form-section-title">Activity Counts</div>
        <div class="form-row">
          <div class="form-group"><label>Outreach</label>
            <input type="number" name="Outreach" min="0" value="${existingData?.Outreach || 0}"></div>
          <div class="form-group"><label>Responses</label>
            <input type="number" name="Responses" min="0" value="${existingData?.Responses || 0}"></div>
          <div class="form-group"><label>Screened</label>
            <input type="number" name="Screened" min="0" value="${existingData?.Screened || 0}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Submitted</label>
            <input type="number" name="Submitted" min="0" value="${existingData?.Submitted || 0}"></div>
          <div class="form-group"><label>Interview 1</label>
            <input type="number" name="Interview1" min="0" value="${existingData?.Interview1 || 0}"></div>
          <div class="form-group"><label>Interview 2+</label>
            <input type="number" name="Interview2Plus" min="0" value="${existingData?.Interview2Plus || 0}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Final Interview</label>
            <input type="number" name="FinalInterview" min="0" value="${existingData?.FinalInterview || 0}"></div>
          <div class="form-group"><label>Offers</label>
            <input type="number" name="Offers" min="0" value="${existingData?.Offers || 0}"></div>
          <div class="form-group"><label>Hires</label>
            <input type="number" name="Hires" min="0" value="${existingData?.Hires || 0}"></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Log Activity'}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('activity')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

async function loadRolesForWeekly(projectId) {
  const select = document.getElementById('weekly-role-select');
  select.innerHTML = '<option value="">Loading...</option>';
  const roles = await getRolesForProject(projectId);
  select.innerHTML = roles.map(r =>
    `<option value="${r.id}">${r.RoleTitle}</option>`
  ).join('');
}

function autoFillWeekYear(dateStr) {
  if (!dateStr) return;
  document.getElementById('weekly-year').value = new Date(dateStr).getFullYear();
  document.getElementById('weekly-weeknum').value = getISOWeek(dateStr);
}

async function submitWeeklyForm(event, editId = null) {
  event.preventDefault();
  clearFormError('weekly-form');
  const form = document.getElementById('weekly-form');
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    ProjectID:      parseInt(data.ProjectID),
    RoleID:         parseInt(data.RoleID),
    TalentPartner:  data.TalentPartner || undefined,
    Year:           parseInt(data.Year),
    WeekNumber:     parseInt(data.WeekNumber),
    WeekEndingDate: isoDate(data.WeekEndingDate),
    Outreach:       parseInt(data.Outreach) || 0,
    Responses:      parseInt(data.Responses) || 0,
    Screened:       parseInt(data.Screened) || 0,
    Submitted:      parseInt(data.Submitted) || 0,
    Interview1:     parseInt(data.Interview1) || 0,
    Interview2Plus: parseInt(data.Interview2Plus) || 0,
    FinalInterview: parseInt(data.FinalInterview) || 0,
    Offers:         parseInt(data.Offers) || 0,
    Hires:          parseInt(data.Hires) || 0,
    SubmittedAt:    new Date().toISOString(),
  };
  try {
    if (editId) {
      await updateItem('WeeklyActivity', editId, fields);
    } else {
      await createItem('WeeklyActivity', fields);
    }
    navigateTo('activity');
  } catch (e) {
    showFormError('weekly-form', `Error saving activity: ${e.message}`);
  }
}

// ── Placement Form ───────────────────────────────────────────────────

async function renderPlacementForm(existingData = null, preselectedRoleId = null) {
  const isEdit = !!existingData;
  const roles = await getAllRoles();
  const roleOptions = roles.map(r =>
    `<option value="${r.id}" ${
      (existingData?.RoleID == r.id || preselectedRoleId == r.id) ? 'selected' : ''
    }>${r.RoleTitle}</option>`
  ).join('');

  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Placement' : 'Record Placement'}</h2>
      <div id="placement-form-error" class="form-error"></div>
      <form id="placement-form" onsubmit="submitPlacementForm(event, ${existingData?.id || 'null'})">
        <div class="form-group">
          <label>Role *</label>
          <select name="RoleID" required>
            <option value="">-- Select role --</option>
            ${roleOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Candidate Name *</label>
          <input type="text" name="CandidateName" required
            value="${existingData?.CandidateName || ''}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Salary Agreed</label>
            <input type="text" name="SalaryAgreed"
              value="${existingData?.SalaryAgreed || ''}">
          </div>
          <div class="form-group">
            <label>Offer Accepted Date</label>
            <input type="date" name="OfferAcceptedDate"
              value="${existingData?.OfferAcceptedDate ? existingData.OfferAcceptedDate.split('T')[0] : ''}">
          </div>
        </div>
        <div class="form-group">
          <label>Provisional Start Date</label>
          <input type="date" name="ProvisionalStartDate"
            value="${existingData?.ProvisionalStartDate ? existingData.ProvisionalStartDate.split('T')[0] : ''}">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="Notes" rows="3">${existingData?.Notes || ''}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Record Placement'}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('placements')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

async function submitPlacementForm(event, editId = null) {
  event.preventDefault();
  clearFormError('placement-form');
  const form = document.getElementById('placement-form');
  const data = Object.fromEntries(new FormData(form));
  const offerDate = isoDate(data.OfferAcceptedDate);
  const startDate = isoDate(data.ProvisionalStartDate);

  let timeToHire = undefined;
  if (offerDate && data.RoleID) {
    try {
      const role = await getItem('Roles', data.RoleID);
      if (role.OpenDate) {
        const open = new Date(role.OpenDate);
        const accepted = new Date(offerDate);
        timeToHire = Math.round((accepted - open) / (1000 * 60 * 60 * 24));
      }
    } catch (e) { /* non-critical */ }
  }

  const fields = {
    RoleID:               parseInt(data.RoleID),
    CandidateName:        data.CandidateName,
    SalaryAgreed:         data.SalaryAgreed || undefined,
    OfferAcceptedDate:    offerDate || undefined,
    ProvisionalStartDate: startDate || undefined,
    TimeToHire:           timeToHire,
    Notes:                data.Notes || undefined,
  };

  try {
    if (editId) {
      await updateItem('Placements', editId, fields);
    } else {
      await createItem('Placements', fields);
    }
    if (startDate && data.RoleID) {
      await updateItem('Roles', data.RoleID, { CurrentStartDate: startDate });
    }
    if (offerDate && data.RoleID) {
      await updateItem('Roles', data.RoleID, { ActualHireDate: offerDate });
    }
    navigateTo('placements');
  } catch (e) {
    showFormError('placement-form', `Error saving placement: ${e.message}`);
  }
}

// ── Rejected Offer Form ──────────────────────────────────────────────

async function renderRejectedOfferForm(existingData = null, preselectedRoleId = null) {
  const isEdit = !!existingData;
  const roles = await getAllRoles();
  const roleOptions = roles.map(r =>
    `<option value="${r.id}" ${
      (existingData?.RoleID == r.id || preselectedRoleId == r.id) ? 'selected' : ''
    }>${r.RoleTitle}</option>`
  ).join('');

  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Rejected Offer' : 'Log Rejected Offer'}</h2>
      <div id="rejected-form-error" class="form-error"></div>
      <form id="rejected-form" onsubmit="submitRejectedForm(event, ${existingData?.id || 'null'})">
        <div class="form-group">
          <label>Role *</label>
          <select name="RoleID" required>
            <option value="">-- Select role --</option>
            ${roleOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Candidate Name *</label>
          <input type="text" name="CandidateName" required
            value="${existingData?.CandidateName || ''}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Salary Offered</label>
            <input type="text" name="SalaryOffered"
              value="${existingData?.SalaryOffered || ''}">
          </div>
          <div class="form-group">
            <label>Rejection Reason *</label>
            <select name="RejectionReason" required>
              <option value="">-- Select --</option>
              ${['Salary','Motivations','Counter-offer','Took another opportunity','Other']
                .map(r => `<option value="${r}" ${existingData?.RejectionReason === r ? 'selected' : ''}>${r}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="Notes" rows="3">${existingData?.Notes || ''}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Log Rejection'}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('rejections')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

async function submitRejectedForm(event, editId = null) {
  event.preventDefault();
  clearFormError('rejected-form');
  const form = document.getElementById('rejected-form');
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    RoleID:          parseInt(data.RoleID),
    CandidateName:   data.CandidateName,
    SalaryOffered:   data.SalaryOffered || undefined,
    RejectionReason: data.RejectionReason,
    Notes:           data.Notes || undefined,
  };
  try {
    if (editId) {
      await updateItem('RejectedOffers', editId, fields);
    } else {
      await createItem('RejectedOffers', fields);
    }
    navigateTo('rejections');
  } catch (e) {
    showFormError('rejected-form', `Error saving rejection: ${e.message}`);
  }
}
