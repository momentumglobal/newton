// js/people-pages.js — People module page renderers

// ── Employee Tracker state ────────────────────────────────────
let _peopleTab        = 'employees';
let _showInactive     = false;
let _assignmentFilter = {
  status:      'current',
  customer:    '',
  projectType: '',
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
  const levelOrder = { CSD: 0, SDM: 1, STP: 2, TP: 3 };
people.sort((a, b) => {
  const l = (levelOrder[a.Level] ?? 99) - (levelOrder[b.Level] ?? 99);
  if (l !== 0) return l;
  return (a.EmployeeName || '').localeCompare(b.EmployeeName || '');
});
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

  const assignments = await getAssignments({});

  const today = new Date(); today.setHours(0,0,0,0);
  const statusFilter = _assignmentFilter.status || 'current';

const filtered = assignments.filter(a => {
  const start = a.StartDate ? new Date(a.StartDate) : null;
  const end   = a.EndDate   ? new Date(a.EndDate)   : null;
  const isPlanned = start && start > today;
  const isCurrent = !isPlanned && (!end || end >= today);
  if (statusFilter === 'current') return isCurrent;
  if (statusFilter === 'former')  return !isPlanned && end && end < today;
  if (statusFilter === 'planned') return isPlanned;
  return true;
}).filter(a => {
    if (_assignmentFilter.customer    && a.Customer    !== _assignmentFilter.customer)    return false;
    if (_assignmentFilter.projectType && a.ProjectType !== _assignmentFilter.projectType) return false;
    return true;
  });

  const customers    = [...new Set(assignments.map(a => a.Customer).filter(Boolean))].sort();
  const projectTypes = [...new Set(assignments.map(a => a.ProjectType).filter(Boolean))].sort();

  const opts = (vals, cur, blank) =>
    `<option value=''>${blank}</option>` +
    vals.map(v => `<option value='${v}' ${cur===v?'selected':''}>${v}</option>`).join('');

  const filterBar = `
    <div class='project-filter-bar' style='display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px'>
      <div class='form-group' style='min-width:140px'>
        <label>Status</label>
        <select onchange="_setAssignmentFilter('status',this.value)">
         <option value='current' ${statusFilter==='current'?'selected':''}>Current</option>
         <option value='former'  ${statusFilter==='former' ?'selected':''}>Former</option>
         <option value='planned' ${statusFilter==='planned'?'selected':''}>Planned</option>
         <option value='all'     ${statusFilter==='all'    ?'selected':''}>All</option>
       </select>
      </div>
      <div class='form-group' style='min-width:140px'>
        <label>Customer</label>
        <select onchange="_setAssignmentFilter('customer',this.value)">
          ${opts(customers, _assignmentFilter.customer, 'All')}
        </select>
      </div>
      <div class='form-group' style='min-width:140px'>
        <label>Project Type</label>
        <select onchange="_setAssignmentFilter('projectType',this.value)">
          ${opts(projectTypes, _assignmentFilter.projectType, 'All')}
        </select>
      </div>
    </div>`;

  const levelOrder = { CSD: 0, SDM: 1, STP: 2, TP: 3 };
filtered.sort((a, b) => {
  const c = (a.Customer || '').localeCompare(b.Customer || '');
  if (c !== 0) return c;
  const l = (levelOrder[a.Level] ?? 99) - (levelOrder[b.Level] ?? 99);
  if (l !== 0) return l;
  return (a.EmployeeName || '').localeCompare(b.EmployeeName || '');
});
  const rows = filtered.map(a => `
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
  const main    = document.getElementById('main-content');
  const canEdit = _resolvedRole === 'admin';
  main.innerHTML = '<p>Loading invoices...</p>';

  const invoices = await getGPInvoices();
  const today    = new Date(); today.setHours(0,0,0,0);

  // Derive overdue status in the UI — not stored in SharePoint
  const withStatus = invoices.map(inv => {
    const due      = inv.DueDate ? new Date(inv.DueDate) : null;
    const isOverdue = inv.Status === 'Sent' && due && due < today;
    return { ...inv, isOverdue };
  });

  // Summary bar calculations
  const outstanding = withStatus
    .filter(i => i.Status !== 'Paid')
    .reduce((sum, i) => sum + (parseFloat(i.Amount) || 0), 0);
  const overdueList = withStatus.filter(i => i.isOverdue);
  const oldestOverdue = overdueList.length
    ? overdueList.reduce((oldest, i) =>
        new Date(i.DueDate) < new Date(oldest.DueDate) ? i : oldest
      ).DueDate.split('T')[0]
    : null;

  const summaryBar = `
    <div style='display:flex;gap:24px;flex-wrap:wrap;padding:16px 0;margin-bottom:8px;
                border-bottom:1px solid #e0e0e0'>
      <div>
        <div style='font-size:11px;font-weight:700;text-transform:uppercase;
                    color:#666;letter-spacing:.05em'>Total Outstanding</div>
        <div style='font-size:22px;font-weight:700;color:#1B3A5C'>
          £${outstanding.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}
        </div>
      </div>
      <div>
        <div style='font-size:11px;font-weight:700;text-transform:uppercase;
                    color:#666;letter-spacing:.05em'>Overdue Invoices</div>
        <div style='font-size:22px;font-weight:700;color:${overdueList.length > 0 ? '#c62828' : '#1B3A5C'}'>
          ${overdueList.length}
        </div>
      </div>
      ${oldestOverdue ? `
      <div>
        <div style='font-size:11px;font-weight:700;text-transform:uppercase;
                    color:#666;letter-spacing:.05em'>Oldest Overdue</div>
        <div style='font-size:22px;font-weight:700;color:#c62828'>${oldestOverdue}</div>
      </div>` : ''}
    </div>`;

  const rows = withStatus.map(inv => {
    const statusBadge = inv.isOverdue
      ? `<span class='badge' style='background:#fde8e8;color:#c62828'>Overdue</span>`
      : inv.Status === 'Paid'
        ? `<span class='badge badge-active'>Paid</span>`
        : `<span class='badge' style='background:#fff8e1;color:#b45309'>Sent</span>`;

    const markPaidBtn = canEdit && inv.Status !== 'Paid'
      ? `<a href='#' onclick='markInvoicePaid(${inv.id})' style='white-space:nowrap'>
           Mark Paid</a>`
      : '';

    return `<tr>
      <td>${inv.InvoiceNumber || '—'}</td>
      <td>${inv.InvoiceDate ? inv.InvoiceDate.split('T')[0] : '—'}</td>
      <td>${inv.DueDate     ? inv.DueDate.split('T')[0]     : '—'}</td>
      <td>£${inv.Amount ? Number(inv.Amount).toLocaleString('en-GB',
              {minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
      <td>${inv.Notes || '—'}</td>
      <td>${statusBadge}</td>
      ${canEdit ? `<td style='white-space:nowrap'>
        <a href='#' onclick='showEditInvoiceForm(${inv.id})'>Edit</a>
        ${markPaidBtn ? ' · ' + markPaidBtn : ''}
      </td>` : ''}
    </tr>`;
  }).join('');

  main.innerHTML = `
    <div class='page-header'>
      <h2>G-P Invoices</h2>
      ${canEdit ? "<button class='btn-primary' onclick='showAddInvoiceForm()'>+ Add Invoice</button>" : ''}
    </div>
    ${summaryBar}
    <table class='data-table'>
      <thead><tr>
        <th>Invoice #</th><th>Invoice Date</th><th>Due Date</th>
        <th>Amount</th><th>Notes</th><th>Status</th>
        ${canEdit ? '<th></th>' : ''}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function markInvoicePaid(id) {
  try {
    await updateInvoice(id, { Status: 'Paid' });
    await renderGPInvoices();
  } catch (e) {
    alert('Error updating invoice: ' + e.message);
  }
}

async function deleteInvoice(id) {
  if (!confirm('Delete this invoice? This cannot be undone.')) return;
  try {
    await deleteItem('GPInvoices', id);
    await renderGPInvoices();
  } catch (e) {
    alert('Error deleting invoice: ' + e.message);
  }
}
