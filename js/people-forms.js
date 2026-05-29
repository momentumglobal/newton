// js/people-forms.js — People module data entry forms

// ── Employee (People list) forms ─────────────────────────────

function renderPersonForm(existingData = null) {
  const isEdit = !!existingData;
  return `
    <div class='form-container'>
      <h2>${isEdit ? 'Edit Employee' : 'Add Employee'}</h2>
      <div id='person-form-error' class='form-error'></div>
      <form id='person-form'
        onsubmit='submitPersonForm(event, ${existingData?.id || 'null'})'>
        <div class='form-group'>
          <label>Full Name *</label>
          <input type='text' name='EmployeeName' required
            value='${existingData?.EmployeeName || ''}'>
        </div>
        <div class='form-row'>
          <div class='form-group'>
            <label>Level *</label>
            <select name='Level' required>
              ${['CSD','SDM','STP','TP'].map(l =>
                `<option value='${l}' ${existingData?.Level===l?'selected':''}>${l}</option>`
              ).join('')}
            </select>
          </div>
          <div class='form-group'>
            <label>Contract Type *</label>
            <select name='ContractType' required>
              ${['Core','FTC','G-P'].map(c =>
                `<option value='${c}' ${existingData?.ContractType===c?'selected':''}>${c}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class='form-group'>
          <label>Location *</label>
          <input type='text' name='Location' required
            value='${existingData?.Location || ''}'>
        </div>
        <div class='form-row'>
          <div class='form-group'>
            <label>Start Date *</label>
            <input type='date' name='StartDate' required
              value='${existingData?.StartDate ? existingData.StartDate.split('T')[0] : ''}'>
          </div>
          <div class='form-group'>
            <label>End Date</label>
            <input type='date' name='EndDate'
              value='${existingData?.EndDate ? existingData.EndDate.split('T')[0] : ''}'>
          </div>
        </div>
        ${isEdit ? `
        <div class='form-group'>
          <label style='display:flex;align-items:center;gap:8px;cursor:pointer'>
            <input type='checkbox' name='IsActive'
              ${existingData?.IsActive !== false ? 'checked' : ''}>
            Active employee
          </label>
        </div>` : ''}
        <div class='form-actions'>
          <button type='submit' class='btn-primary'>
            ${isEdit ? 'Save Changes' : 'Add Employee'}</button>
          <button type='button' class='btn-secondary'
            onclick='navigateToPeople("peopleTracker")'>Cancel</button>
        </div>
      </form>
    </div>`;
}

async function submitPersonForm(event, editId = null) {
  event.preventDefault();
  clearPersonFormError();
  const form = document.getElementById('person-form');
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    EmployeeName: data.EmployeeName,
    Level:        data.Level,
    ContractType: data.ContractType,
    Location:     data.Location,
    StartDate:    isoDate(data.StartDate) || undefined,
    EndDate:      isoDate(data.EndDate)   || undefined,
    IsActive:     editId ? (form.querySelector('[name=IsActive]')?.checked !== false) : true,
  };
  try {
    if (editId) { await updatePerson(editId, fields); }
    else        { await createPerson(fields); }
    navigateToPeople('peopleTracker');
  } catch (e) {
    showPersonFormError(`Error saving employee: ${e.message}`);
  }
}

function showPersonFormError(msg) {
  const el = document.getElementById('person-form-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function clearPersonFormError() {
  const el = document.getElementById('person-form-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function showAddPersonForm() {
  document.getElementById('main-content').innerHTML = renderPersonForm();
}
async function showEditPersonForm(id) {
  const data = await getItem('People', id);
  document.getElementById('main-content').innerHTML = renderPersonForm(data);
}

// ── Assignment forms ──────────────────────────────────────────

async function renderAssignmentForm(existingData = null) {
  const isEdit = !!existingData;
  const people = await getPeople(false);

  const employeeOptions = people.map(p =>
    `<option value='${p.EmployeeName}' data-level='${p.Level}'
      ${existingData?.EmployeeName === p.EmployeeName ? 'selected' : ''}>
      ${p.EmployeeName} (${p.Level})</option>`
  ).join('');

  return `
    <div class='form-container'>
      <h2>${isEdit ? 'Edit Assignment' : 'Add Assignment'}</h2>
      <div id='assignment-form-error' class='form-error'></div>
      <form id='assignment-form'
        onsubmit='submitAssignmentForm(event, ${existingData?.id || 'null'})'>
        <div class='form-row'>
          <div class='form-group'>
            <label>Employee *</label>
            <select name='EmployeeName' required
              onchange='_onAssignmentEmployeeChange(this)'>
              <option value=''>— Select employee —</option>
              ${employeeOptions}
            </select>
          </div>
          <div class='form-group'>
            <label>Level (auto-filled)</label>
            <input type='text' name='Level' id='assignment-level' readonly
              value='${existingData?.Level || ''}'
              style='background:#f5f5f5;cursor:default'>
          </div>
        </div>
        <div class='form-row'>
          <div class='form-group'>
            <label>Customer *</label>
            <input type='text' name='Customer' required
              value='${existingData?.Customer || ''}'>
          </div>
          <div class='form-group'>
            <label>Project Type *</label>
            <select name='ProjectType' required>
              ${['Embedded','CoE','Transformation','LCI','Internal'].map(t =>
                `<option value='${t}' ${existingData?.ProjectType===t?'selected':''}>${t}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class='form-row'>
          <div class='form-group'>
            <label>Start Date *</label>
            <input type='date' name='StartDate' required
              value='${existingData?.StartDate ? existingData.StartDate.split('T')[0] : ''}'>
          </div>
          <div class='form-group'>
            <label>End Date *</label>
            <input type='date' name='EndDate' required
              value='${existingData?.EndDate ? existingData.EndDate.split('T')[0] : ''}'>
          </div>
        </div>
        <div class='form-row'>
          <div class='form-group'>
            <label>Monthly Bill Rate (£)</label>
            <input type='number' name='MonthlyBillRate' min='0' step='0.01'
              value='${existingData?.MonthlyBillRate || ''}'>
          </div>
          <div class='form-group'>
            <label>Billed? *</label>
            <select name='Billed' required>
              <option value='Yes' ${!existingData||existingData?.Billed==='Yes'?'selected':''}>Yes</option>
              <option value='No'  ${existingData?.Billed==='No'?'selected':''}>No</option>
            </select>
          </div>
        </div>
        <div class='form-group'>
          <label>Country *</label>
          <input type='text' name='Country' required
            value='${existingData?.Country || ''}'>
        </div>
        <div class='form-actions'>
          <button type='submit' class='btn-primary'>
            ${isEdit ? 'Save Changes' : 'Add Assignment'}</button>
          <button type='button' class='btn-secondary'
            onclick='navigateToPeople("peopleTracker")'>Cancel</button>
        </div>
      </form>
    </div>`;
}

function _onAssignmentEmployeeChange(select) {
  const opt = select.options[select.selectedIndex];
  document.getElementById('assignment-level').value = opt.dataset.level || '';
}

async function submitAssignmentForm(event, editId = null) {
  event.preventDefault();
  clearAssignmentFormError();
  const form = document.getElementById('assignment-form');
  const data = Object.fromEntries(new FormData(form));
  if (!data.Level) {
    showAssignmentFormError('Please select an employee — Level must be populated.');
    return;
  }
  const fields = {
    EmployeeName:    data.EmployeeName,
    Level:           data.Level,
    Customer:        data.Customer,
    ProjectType:     data.ProjectType,
    StartDate:       isoDate(data.StartDate),
    EndDate:         isoDate(data.EndDate),
    MonthlyBillRate: data.MonthlyBillRate ? parseFloat(data.MonthlyBillRate) : null,
    Billed:          data.Billed,
    Country:         data.Country,
  };
  if (!editId) {
    const existing = await getAssignments({});
    fields.AssignmentID = 'A-' + String(existing.length + 1).padStart(3, '0');
  }
  try {
    if (editId) { await updateAssignment(editId, fields); }
    else        { await createAssignment(fields); }
    navigateToPeople('peopleTracker');
  } catch (e) {
    showAssignmentFormError(`Error saving assignment: ${e.message}`);
  }
}

function showAssignmentFormError(msg) {
  const el = document.getElementById('assignment-form-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function clearAssignmentFormError() {
  const el = document.getElementById('assignment-form-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function showAddAssignmentForm() {
  document.getElementById('main-content').innerHTML = '<p>Loading...</p>';
  renderAssignmentForm().then(html => {
    document.getElementById('main-content').innerHTML = html;
  });
}
async function showEditAssignmentForm(id) {
  const data = await getItem('Assignments', id);
  document.getElementById('main-content').innerHTML = await renderAssignmentForm(data);
}

// ── Date utility (not shared from forms.js in this module) ────
function isoDate(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] + 'T12:00:00Z' : null;
}
