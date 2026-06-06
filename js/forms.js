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
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] + 'T12:00:00Z' : null;
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
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
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    Title:           data.CustomerName,
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
    clearButtonLoading(btn);
    showFormError('project-form', `Error saving project: ${e.message}`);
  }
}
// ── Role Form ────────────────────────────────────────────────────────
async function renderRoleForm(existingData = null, preselectedProjectId = null) {
  const isEdit = !!existingData;
  const currentUser = getCurrentUser();
  const email = currentUser.email;
  const userRole = await getEffectiveRole(email);
  const canAssign = ['admin', 'delivery_manager'].includes(userRole);
  const isTalentPartner = userRole === 'talent_partner';
  const projects = await getScopedProjects(email, false);
  const lockProject = isTalentPartner && projects.length === 1;
  const selectedProjectId = existingData?.ProjectID || preselectedProjectId || '';
  const projectOptions = projects.map(p =>
    `<option value="${p.id}" ${
      (existingData?.ProjectID == p.id || preselectedProjectId == p.id || lockProject) ? 'selected' : ''
    }>${p.CustomerName}</option>`
  ).join('');
  // Pre-load function areas (global — not scoped to project)
  let departmentOptions = '<option value="">-- Select functional area --</option>';
  try {
    const depts = (await getDepartments()).sort((a, b) => a.DepartmentName.localeCompare(b.DepartmentName));
    departmentOptions = '<option value="">-- Select functional area --</option>' +
      depts.map(d =>
        `<option value="${d.DepartmentName}" ${existingData?.Department === d.DepartmentName ? 'selected' : ''}>${d.DepartmentName}</option>`
      ).join('');
  } catch (e) { /* fall back to empty */ }

  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Role' : 'Add Role'}</h2>
      <div id="role-form-error" class="form-error"></div>
      <form id="role-form" onsubmit="submitRoleForm(event, ${existingData?.id || 'null'})">
        <div class="form-group">
          <label>Project *</label>
          ${lockProject ? `
          <input type="text" value="${projects[0].CustomerName}" disabled style="background:#f5f5f5;color:#666;">
          <input type="hidden" name="ProjectID" value="${projects[0].id}">` : `
          <select name="ProjectID" required onchange="${canAssign ? 'loadTalentPartnersForRole(this.value)' : ''}">
            <option value="">-- Select project --</option>
            ${projectOptions}
          </select>`}
        </div>
        ${canAssign ? `
        <div class="form-group">
          <label>Assign to *</label>
          <select name="TalentPartnerName" id="role-tp-select" required>
            <option value="">-- Select project first --</option>
          </select>
        </div>` : `<input type="hidden" name="TalentPartnerName" value="${currentUser.email}">`}
        <div class="form-group">
          <label>Role Title *</label>
          <input type="text" name="RoleTitle" required
            value="${existingData?.RoleTitle || ''}">
        </div>
        <div class="form-group">
          <label>Hiring Manager</label>
          <input type="text" name="HiringManager"
            value="${existingData?.HiringManager || ''}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Budget</label>
            <input type="text" name="Budget"
              value="${existingData?.Budget || ''}">
          </div>
          <div class="form-group">
            <label>Location</label>
            <select name="Location" id="role-location-select" onchange="updateCurrencyFromLocation(this.value)" required>
              <option value="">-- Select location --</option>
              ${Object.keys(CONFIG.COUNTRY_CURRENCY).sort().map(country =>
                `<option value="${country}" ${existingData?.Location === country ? 'selected' : ''}>${country}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Currency</label>
            <input type="text" id="role-currency-display" name="Currency" readonly
              style="background:#f5f5f5;color:#666;"
              value="${existingData?.Location ? (CONFIG.COUNTRY_CURRENCY[existingData.Location] || '') : ''}"
              placeholder="Auto-filled from location">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Priority</label>
            <select name="Priority">
              <option value="">--</option>
              <option value="1" ${existingData?.Priority == 1 ? 'selected' : ''}>1 — High</option>
              <option value="2" ${existingData?.Priority == 2 ? 'selected' : ''}>2 — Medium</option>
              <option value="3" ${existingData?.Priority == 3 ? 'selected' : ''}>3 — Low</option>
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
            <label>Stage *</label>
            <select name="Stage" required>
              ${'Backlog,Planning,Sourcing,Submitted,Interview 1,Interview 2+,Final Interview,Offered,Hired,On-hold,Cancelled'.split(',')
                .map(s => `<option value="${s}" ${existingData?.Stage === s ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Functional Area</label>
            <select name="Department" id="role-department-select">
              ${departmentOptions}
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

function updateCurrencyFromLocation(country) {
  const currencyEl = document.getElementById('role-currency-display');
  if (currencyEl) currencyEl.value = CONFIG.COUNTRY_CURRENCY[country] || '';
}

async function loadTalentPartnersForRole(projectId) {
  const select = document.getElementById('role-tp-select');
  if (!select) return;
  if (!projectId) {
    select.innerHTML = '<option value="">-- Select project first --</option>';
    return;
  }
  select.innerHTML = '<option value="">Loading...</option>';
  try {
    const tps = await getTalentPartnersForProject(projectId);
    select.innerHTML = '<option value="">-- Select team member --</option>' +
      tps.map(u => `<option value="${u.UserEmail}">${u.UserName || u.UserEmail}</option>`).join('');

  } catch(e) {
    select.innerHTML = '<option value="">-- Error loading team --</option>';
  }
}

async function submitRoleForm(event, editId = null) {
  event.preventDefault();
  clearFormError('role-form');
  const form = document.getElementById('role-form');
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    ProjectIDLookupId: parseInt(data.ProjectID),
    Title:          data.RoleTitle,
    HiringManager:  data.HiringManager || undefined,
    TalentPartner:  data.TalentPartnerName || undefined,
    Budget:         data.Budget ? parseFloat(data.Budget) : undefined,
    Currency:       data.Location || undefined,
    Priority:       data.Priority ? parseInt(data.Priority) : undefined,
    Backfill:       data.Backfill === 'Yes' ? true : data.Backfill === 'No' ? false : undefined,
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
    clearButtonLoading(btn);
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
  const currentUser = getCurrentUser();
  const email = currentUser.email;
  const userRole = await getEffectiveRole(email);
  const canLogOnBehalf = ['admin', 'delivery_manager'].includes(userRole);
  const isTalentPartner = userRole === 'talent_partner';
  const projects = await getScopedProjects(email, false);
  const lockProject = isTalentPartner && projects.length === 1;
  const projectOptions = projects.map(p =>
    `<option value="${p.id}" ${(existingData?.ProjectID == p.id || lockProject) ? 'selected' : ''}>${p.CustomerName}</option>`
  ).join('');
  const today = new Date().toISOString().split('T')[0];
  const defaultWeek = existingData?.WeekNumber || getISOWeek(today);
  const defaultYear = existingData?.Year || new Date().getFullYear();
  // If single project, pre-load TP's own roles immediately
  let preloadedRoleOptions = '';
  if (lockProject) {
    try {
      const roles = await getRolesForProject(projects[0].id, email);
      preloadedRoleOptions = roles.map(r =>
        `<option value="${r.id}" ${existingData?.RoleID == r.id ? 'selected' : ''}>${r.RoleTitle}</option>`
      ).join('');
    } catch (e) { /* fall back to empty */ }
  }
  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Weekly Activity' : 'Log Weekly Activity'}</h2>
      <div id="weekly-form-error" class="form-error"></div>
      <form id="weekly-form" onsubmit="submitWeeklyForm(event, ${existingData?.id || 'null'})">
        <div class="form-row">
          <div class="form-group">
            <label>Project *</label>
            ${lockProject ? `
            <input type="text" value="${projects[0].CustomerName}" disabled style="background:#f5f5f5;color:#666;">
            <input type="hidden" name="ProjectID" value="${projects[0].id}">` : `
            <select name="ProjectID" required onchange="loadRolesForWeekly(this.value)${canLogOnBehalf ? ';loadTalentPartnersForWeekly(this.value)' : ''}">
              <option value="">-- Select project --</option>
              ${projectOptions}
            </select>`}
          </div>
          <div class="form-group">
            <label>Role *</label>
            <select name="RoleID" id="weekly-role-select" required
              ${isTalentPartner ? `data-tp-email="${email}"` : ''}>
              ${lockProject && preloadedRoleOptions
                ? preloadedRoleOptions
                : '<option value="">-- Select project first --</option>'}
            </select>
          </div>
        </div>
        ${canLogOnBehalf ? `
        <div class="form-group">
          <label>Log activity as *</label>
          <select name="TalentPartnerName" id="weekly-tp-select" required>
            <option value="">-- Select project first --</option>
          </select>
        </div>` : `<input type="hidden" name="TalentPartnerName" value="${currentUser.email}">`}
        <div class="form-group">
          <label>Week Ending Date *</label>
          <input type="date" name="WeekEndingDate" required
            onchange="autoFillWeekYear(this.value)"
            value="${existingData?.WeekEndingDate ? existingData.WeekEndingDate.split('T')[0] : getWeekEnding(today)}">
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
  const tpEmail = select.dataset.tpEmail || null;
  const roles = await getRolesForProject(projectId, tpEmail);
  select.innerHTML = roles.length
    ? roles.map(r => `<option value="${r.id}">${r.RoleTitle}</option>`).join('')
    : '<option value="">-- No roles assigned --</option>';
}
async function loadTalentPartnersForWeekly(projectId) {
  const select = document.getElementById('weekly-tp-select');
  if (!select) return;
  if (!projectId) {
    select.innerHTML = '<option value="">-- Select project first --</option>';
    return;
  }
  select.innerHTML = '<option value="">Loading...</option>';
  try {
    const tps = await getTalentPartnersForProject(projectId);
    select.innerHTML = '<option value="">-- Select team member --</option>' +
      tps.map(u => `<option value="${u.UserEmail}">${u.UserName || u.UserEmail}</option>`).join('');
  } catch(e) {
    select.innerHTML = '<option value="">-- Error loading team --</option>';
  }
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
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    ProjectIDLookupId: parseInt(data.ProjectID),
    RoleIDLookupId:    parseInt(data.RoleID),
    TalentPartner:     data.TalentPartnerName || undefined,
    Yeare:             parseInt(data.Year),
    WeekNumber:        parseInt(data.WeekNumber),
    WeekEndingDate:    isoDate(data.WeekEndingDate),
    Outreach:          parseInt(data.Outreach) || 0,
    Responses:         parseInt(data.Responses) || 0,
    Screened:          parseInt(data.Screened) || 0,
    Submitted:         parseInt(data.Submitted) || 0,
    Interview1:        parseInt(data.Interview1) || 0,
    InterviewTwoPlus:  parseInt(data.Interview2Plus) || 0,
    FinalInterview:    parseInt(data.FinalInterview) || 0,
    Offers:            parseInt(data.Offers) || 0,
    Hires:             parseInt(data.Hires) || 0,
    SubmittedAt:       new Date().toISOString(),
  };
  try {
    if (editId) {
      await updateItem('WeeklyActivity', editId, fields);
    } else {
      await createItem('WeeklyActivity', fields);
    }
    navigateTo('activity');
  } catch (e) {
    clearButtonLoading(btn);
    showFormError('weekly-form', `Error saving activity: ${e.message}`);
  }
}
// ── Placement Form ───────────────────────────────────────────────────
async function renderPlacementForm(existingData = null, preselectedRoleId = null) {
  const isEdit = !!existingData;
  const currentUser = getCurrentUser();
  const email = currentUser.email;
  const userRole = await getEffectiveRole(email);
  const canLogOnBehalf = ['admin', 'delivery_manager'].includes(userRole);
  const isTalentPartner = userRole === 'talent_partner';
  const projects = await getScopedProjects(email, false);
  const lockProject = isTalentPartner && projects.length === 1;
  const projectOptions = projects.map(p =>
    `<option value="${p.id}" ${(existingData?.ProjectID == p.id || lockProject) ? 'selected' : ''}>${p.CustomerName}</option>`
  ).join('');
  // If single project, pre-load TP's own roles immediately
  let preloadedPlacementRoleOptions = '';
  if (lockProject) {
    try {
      const roles = await getRolesForProject(projects[0].id, email);
      preloadedPlacementRoleOptions = roles.map(r =>
        `<option value="${r.id}" ${(existingData?.RoleID == r.id || preselectedRoleId == r.id) ? 'selected' : ''}>${r.RoleTitle}</option>`
      ).join('');
    } catch (e) { /* fall back to empty */ }
  }
  // Pre-load currency if editing
  let inheritedCurrency = existingData?.Currency || '';
  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Placement' : 'Record Placement'}</h2>
      <div id="placement-form-error" class="form-error"></div>
      <form id="placement-form" onsubmit="submitPlacementForm(event, ${existingData?.id || 'null'})">
        <div class="form-row">
          <div class="form-group">
            <label>Project *</label>
            ${lockProject ? `
            <input type="text" value="${projects[0].CustomerName}" disabled style="background:#f5f5f5;color:#666;">
            <input type="hidden" name="ProjectID" value="${projects[0].id}">` : `
            <select name="ProjectID" required onchange="loadRolesForPlacement(this.value)${canLogOnBehalf ? ';loadTalentPartnersForPlacement(this.value)' : ''}">
              <option value="">-- Select project --</option>
              ${projectOptions}
            </select>`}
          </div>
          <div class="form-group">
            <label>Role *</label>
            <select name="RoleID" id="placement-role-select" required onchange="loadCurrencyForPlacement(this.value)"
              ${isTalentPartner ? `data-tp-email="${email}"` : ''}>
              ${lockProject && preloadedPlacementRoleOptions
                ? preloadedPlacementRoleOptions
                : '<option value="">-- Select project first --</option>'}
            </select>
          </div>
        </div>
        ${canLogOnBehalf ? `
        <div class="form-group">
          <label>Record placement as *</label>
          <select name="TalentPartnerName" id="placement-tp-select" required>
            <option value="">-- Select project first --</option>
          </select>
        </div>` : `<input type="hidden" name="TalentPartnerName" value="${currentUser.email}">`}
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
            <label>Currency</label>
            <input type="text" id="placement-currency" name="Currency" readonly
              style="background:#f5f5f5;color:#666;"
              value="${inheritedCurrency}"
              placeholder="Auto-filled from role">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Offer Accepted Date</label>
            <input type="date" name="OfferAcceptedDate"
              value="${existingData?.OfferAcceptedDate ? existingData.OfferAcceptedDate.split('T')[0] : ''}">
          </div>
          <div class="form-group">
            <label>Provisional Start Date</label>
            <input type="date" name="ProvisionalStartDate"
              value="${existingData?.ProvisionalStartDate ? existingData.ProvisionalStartDate.split('T')[0] : ''}">
          </div>
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
async function loadRolesForPlacement(projectId) {
  const select = document.getElementById('placement-role-select');
  if (!projectId) { select.innerHTML = '<option value="">-- Select project first --</option>'; return; }
  select.innerHTML = '<option value="">Loading...</option>';
  const tpEmail = select.dataset.tpEmail || null;
  const roles = await getRolesForProject(projectId, tpEmail);
  select.innerHTML = roles.length
    ? '<option value="">-- Select role --</option>' + roles.map(r => `<option value="${r.id}">${r.RoleTitle}</option>`).join('')
    : '<option value="">-- No roles assigned --</option>';
  // Clear currency when project changes
  const currencyEl = document.getElementById('placement-currency');
  if (currencyEl) currencyEl.value = '';
}
async function loadCurrencyForPlacement(roleId) {
  const currencyEl = document.getElementById('placement-currency');
  if (!currencyEl || !roleId) return;
  try {
    const role = await getItem('Roles', roleId);
    currencyEl.value = CONFIG.COUNTRY_CURRENCY[role.Currency] || '';
  } catch(e) {
    currencyEl.value = '';
  }
}
async function loadTalentPartnersForPlacement(projectId) {
  const select = document.getElementById('placement-tp-select');
  if (!select) return;
  if (!projectId) { select.innerHTML = '<option value="">-- Select project first --</option>'; return; }
  select.innerHTML = '<option value="">Loading...</option>';
  try {
    const tps = await getTalentPartnersForProject(projectId);
    select.innerHTML = '<option value="">-- Select team member --</option>' +
      tps.map(u => `<option value="${u.UserEmail}">${u.UserName || u.UserEmail}</option>`).join('');
  } catch(e) {
    select.innerHTML = '<option value="">-- Error loading team --</option>';
  }
}
async function submitPlacementForm(event, editId = null) {
  event.preventDefault();
  clearFormError('placement-form');
  const form = document.getElementById('placement-form');
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
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
    RoleIDLookupId:       parseInt(data.RoleID),
    Title:                data.CandidateName,
    TalentPartner:        data.TalentPartnerName || undefined,
    SalaryAgreed:         data.SalaryAgreed || undefined,
    Currency:             data.Currency || undefined,
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
    clearButtonLoading(btn);
    showFormError('placement-form', `Error saving placement: ${e.message}`);
  }
}
// ── Rejected Offer Form ──────────────────────────────────────────────
async function renderRejectedOfferForm(existingData = null, preselectedRoleId = null) {
  const isEdit = !!existingData;
  const email = getCurrentUser().email;
  const userRole = await getEffectiveRole(email);
  const isTalentPartner = userRole === 'talent_partner';
  const projectIds = await getUserProjectIds(email);
  let roles = [];
  if (projectIds === null) {
    roles = await getAllRoles();
  } else {
    const roleArrays = await Promise.all(
      projectIds.map(pid => getRolesForProject(pid, isTalentPartner ? email : null))
    );
    roles = roleArrays.flat();
  }
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
              ${'Salary,Motivations,Counter-offer,Took another opportunity,Other'.split(',')
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
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    RoleIDLookupId:  parseInt(data.RoleID),
    Title:           data.CandidateName,
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
    clearButtonLoading(btn);
    showFormError('rejected-form', `Error saving rejection: ${e.message}`);
  }
}
