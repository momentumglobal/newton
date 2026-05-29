// js/people-pages.js — People module page renderers

// ── Employee Tracker state ────────────────────────────────────
let _peopleTab        = 'employees';
let _showInactive     = false;
let _assignmentFilter = {
  employee: '',
  customer: '',
  year:     String(new Date().getFullYear()),
  billed:   '',
};

async function renderEmployeeTracker() {
  const main = document.getElementById('main-content');
  const role = _resolvedRole;
  if (!['admin','leadership'].includes(role)) {
    main.innerHTML = '<p>Access denied.</p>';
    return;
  }
  if (_peopleTab === 'employees') {
    await renderEmployeesTab();
  } else {
    await renderAssignmentsTab();
  }
}

function _peopleTabBar() {
  return `<div class='filter-group' style='margin-bottom:16px'>
    <button class='btn-filter${_peopleTab==="employees"?" active":""}' 
      onclick='_switchPeopleTab("employees")'>Employees</button>
    <button class='btn-filter${_peopleTab==="assignments"?" active":""}' 
      onclick='_switchPeopleTab("assignments")'>Assignments</button>
  </div>`;
}

async function _switchPeopleTab(tab) {
  _peopleTab = tab;
  await renderEmployeeTracker();
}

async function renderEmployeesTab() {
  const main    = document.getElementById('main-content');
  const canEdit = _resolvedRole === 'admin';
  const people  = await getPeople(!_showInactive);

  const rows = people.map(p => `
    <tr>
      <td>${p.EmployeeName}</td>
      <td>${p.Level || '—'}</td>
      <td>${p.ContractType || '—'}</td>
      <td>${p.Location || '—'}</td>
      <td>${p.StartDate ? p.StartDate.split('T')[0] : '—'}</td>
      <td>${p.EndDate   ? p.EndDate.split('T')[0]   : '—'}</td>
      <td><span class='badge badge-${p.IsActive ? 'active' : 'inactive'}'>${p.IsActive ? 'Active' : 'Inactive'}</span></td>
      ${canEdit ? `<td><a href='#' onclick='showEditPersonForm(${p.id})'>Edit</a></td>` : ''}
    </tr>`).join('');

  main.innerHTML = `
    <div class='page-header'>
      <h2>Employee Tracker</h2>
      ${canEdit ? "<button class='btn-primary' onclick='showAddPersonForm()'>+ Add Employee</button>" : ''}
    </div>
    ${_peopleTabBar()}
    <div style='margin-bottom:12px'>
      <label style='font-size:13px;cursor:pointer'>
        <input type='checkbox' ${_showInactive ? 'checked' : ''}
          onchange='_toggleInactive(this.checked)'
          style='margin-right:6px'>
        Show inactive employees
      </label>
    </div>
    <table class='data-table'>
      <thead><tr>
        <th>Name</th><th>Level</th><th>Contract</th><th>Location</th>
        <th>Start</th><th>End</th><th>Status</th>
        ${canEdit ? '<th></th>' : ''}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function _toggleInactive(checked) {
  _showInactive = checked;
  await renderEmployeesTab();
}

async function renderAssignmentsTab() {
  const main    = document.getElementById('main-content');
  const canEdit = _resolvedRole === 'admin';

  const [assignments, people] = await Promise.all([
    getAssignments(_assignmentFilter),
    getPeople(false),
  ]);

  const employees = [...new Set(people.map(p => p.EmployeeName))].sort();
  const customers = [...new Set(assignments.map(a => a.Customer).filter(Boolean))].sort();
  const years     = [...new Set(assignments.map(a => {
    return a.StartDate ? new Date(a.StartDate).getFullYear() : null;
  }).filter(Boolean))].sort((a,b) => b-a);

  const opts = (vals, cur, blank) =>
    `<option value=''>${blank}</option>` +
    vals.map(v => `<option value='${v}' ${String(cur)===String(v)?'selected':''}>${v}</option>`).join('');

  const filterBar = `
    <div class='project-filter-bar' style='display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px'>
      <div class='form-group' style='min-width:160px'>
        <label>Employee</label>
        <select onchange="_setAssignmentFilter('employee',this.value)">
          ${opts(employees, _assignmentFilter.employee, 'All employees')}</select></div>
      <div class='form-group' style='min-width:140px'>
        <label>Customer</label>
        <select onchange="_setAssignmentFilter('customer',this.value)">
          ${opts(customers, _assignmentFilter.customer, 'All customers')}</select></div>
      <div class='form-group' style='min-width:100px'>
        <label>Year</label>
        <select onchange="_setAssignmentFilter('year',this.value)">
          ${opts(years, _assignmentFilter.year, 'All years')}</select></div>
      <div class='form-group' style='min-width:100px'>
        <label>Billed</label>
        <select onchange="_setAssignmentFilter('billed',this.value)">
          <option value=''>All</option>
          <option value='Yes' ${_assignmentFilter.billed==='Yes'?'selected':''}>Yes</option>
          <option value='No'  ${_assignmentFilter.billed==='No' ?'selected':''}>No</option>
        </select></div>
    </div>`;

  const rows = assignments.map(a => `
    <tr>
      <td>${a.AssignmentID || '—'}</td>
      <td>${a.EmployeeName || '—'}</td>
      <td>${a.Level || '—'}</td>
      <td>${a.Customer || '—'}</td>
      <td>${a.ProjectType || '—'}</td>
      <td>${a.StartDate ? a.StartDate.split('T')[0] : '—'}</td>
      <td>${a.EndDate   ? a.EndDate.split('T')[0]   : '—'}</td>
      <td>${a.MonthlyBillRate ? '£' + Number(a.MonthlyBillRate).toLocaleString('en-GB') : '—'}</td>
      <td><span class='badge badge-${a.Billed==="Yes"?"active":"inactive"}'>${a.Billed}</span></td>
      ${canEdit ? `<td><a href='#' onclick='showEditAssignmentForm(${a.id})'>Edit</a></td>` : ''}
    </tr>`).join('');

  main.innerHTML = `
    <div class='page-header'>
      <h2>Employee Tracker</h2>
      ${canEdit ? "<button class='btn-primary' onclick='showAddAssignmentForm()'>+ Add Assignment</button>" : ''}
    </div>
    ${_peopleTabBar()}
    ${filterBar}
    <table class='data-table'>
      <thead><tr>
        <th>ID</th><th>Employee</th><th>Level</th><th>Customer</th><th>Project Type</th>
        <th>Start</th><th>End</th><th>Bill Rate</th><th>Billed</th>
        ${canEdit ? '<th></th>' : ''}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function _setAssignmentFilter(key, value) {
  _assignmentFilter[key] = value;
  await renderAssignmentsTab();
}

// ── Stubs for pages built in later phases ────────────────────
async function renderPeopleDashboard() {
  document.getElementById('main-content').innerHTML =
    `<div class='page-header'><h2>People Dashboard</h2></div>
     <p>Coming in Phase 5.</p>`;
}
async function renderDeploymentTimeline() {
  document.getElementById('main-content').innerHTML =
    `<div class='page-header'><h2>Deployment Timeline</h2></div>
     <p>Coming in Phase 6.</p>`;
}
async function renderGPInvoices() {
  document.getElementById('main-content').innerHTML =
    `<div class='page-header'><h2>G-P Invoices</h2></div>
     <p>Coming in Phase 4.</p>`;
}
