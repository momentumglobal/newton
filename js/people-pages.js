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

// ── People Dashboard state ────────────────────────────────────
let _dashFilter = {
  year:    new Date().getFullYear(),
  month:   new Date().getMonth(),   // 0-based; null = no month filter
  quarter: null,                     // 1–4; null = no quarter filter
};

function _dashDateRange() {
  const { year, month, quarter } = _dashFilter;
  if (month !== null) {
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
  }
  if (quarter !== null) {
    return { start: new Date(year, (quarter - 1) * 3, 1), end: new Date(year, quarter * 3, 0) };
  }
  return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
}

// Filter monthly rows to a date range
function _rowsInRange(rows, start, end) {
  return rows.filter(r => {
    const ms = new Date(r.Year, r.Month - 1, 1);
    return ms >= start && ms <= end;
  });
}

// Filter monthly rows to a full calendar year
function _rowsInYear(rows, year) {
  return rows.filter(r => r.Year === year);
}

function _fmtGBP(n) {
  return '£' + (n || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _fmtPct(n) {
  return ((n || 0) * 100).toFixed(1) + '%';
}

// Calculates utilisation % from an array of monthly rows.
function _calcUtilisation(rows) {
  const filtered  = rows.filter(r => r.Level !== 'CSD');
  const billedCap = filtered.reduce((s, r) => s + r.BilledCapacity, 0);
  const totalCap  = filtered.reduce((s, r) => s + r.Capacity, 0);
  return totalCap > 0 ? billedCap / totalCap : 0;
}

function _barChart(data, valueFormatter) {
  const max = Math.max(...data.map(d => d.value), 0.001);
  return `<div style='margin-top:12px'>
    ${data.map(d => `
      <div style='display:flex;align-items:center;gap:8px;margin-bottom:6px'>
        <div style='width:80px;font-size:12px;color:#555;text-align:right;
                    flex-shrink:0'>${d.label}</div>
        <div style='flex:1;background:#f0f0f0;border-radius:3px;height:18px'>
          <div style='width:${Math.round((d.value/max)*100)}%;background:#2E75B6;
                      height:18px;border-radius:3px;min-width:2px'></div>
        </div>
        <div style='width:50px;font-size:12px;color:#333;flex-shrink:0'>
          ${valueFormatter ? valueFormatter(d.value) : d.value}</div>
      </div>`).join('')}
  </div>`;
}

// ── People Dashboard KPI Strip ────────────────────
function _kpiCard(label, value, sub) {
  return `<div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;
                      padding:16px 20px;min-width:160px;flex:1'>
    <div style='font-size:11px;font-weight:700;text-transform:uppercase;
                color:#666;letter-spacing:.05em;margin-bottom:6px'>${label}</div>
    <div style='font-size:24px;font-weight:700;color:#1B3A5C'>${value}</div>
    ${sub ? `<div style='font-size:12px;color:#888;margin-top:4px'>${sub}</div>` : ''}
  </div>`;
}

async function _renderKPIStrip(allRows, people, assignments) {
  const now     = new Date();
  const thisY   = now.getFullYear();
  const prevY   = thisY - 1;
  const today   = new Date(); today.setHours(0,0,0,0);

  // Revenue — YTD current year (Jan 1 to today)
  const ytdStart  = new Date(thisY, 0, 1);
  const ytdRows   = _rowsInRange(allRows, ytdStart, today);
  const revYTD    = ytdRows.reduce((s,r) => s + r.BilledRevenue, 0);

  // Revenue — full previous year
  const prevRows  = _rowsInYear(allRows, prevY);
  const revPrev   = prevRows.reduce((s,r) => s + r.BilledRevenue, 0);

  // Utilisation — current year YTD
  const utilYTD   = _calcUtilisation(ytdRows);

  // Utilisation — previous year
  const utilPrev  = _calcUtilisation(prevRows);

  // Active customers today
  const activeCustomers = new Set(
    assignments.filter(a => {
      const s = a.StartDate ? new Date(a.StartDate) : null;
      const e = a.EndDate   ? new Date(a.EndDate)   : null;
      return s && s <= today && (!e || e >= today)
        && a.Customer && a.Customer !== 'Unassigned';
    }).map(a => a.Customer)
  ).size;

  // Billed headcount today
  const billedHeadcount = new Set(
    assignments.filter(a => {
      const s = a.StartDate ? new Date(a.StartDate) : null;
      const e = a.EndDate   ? new Date(a.EndDate)   : null;
      return a.Billed === 'Yes' && s && s <= today && (!e || e >= today);
    }).map(a => a.EmployeeName)
  ).size;

  return `<div style='display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px'>
    ${_kpiCard('Billed Revenue ' + thisY,   _fmtGBP(revYTD),   'Current year YTD')}
    ${_kpiCard('Billed Revenue ' + prevY,   _fmtGBP(revPrev),  'Full year')}
    ${_kpiCard('Utilisation ' + thisY,      _fmtPct(utilYTD),  'Current year YTD')}
    ${_kpiCard('Utilisation ' + prevY,      _fmtPct(utilPrev), 'Full year')}
    ${_kpiCard('Active Customers',           activeCustomers,   'As of today')}
    ${_kpiCard('Billed Headcount',           billedHeadcount,   'As of today')}
  </div>`;
}

// Panel 1 - Team Utilisation
function _renderUtilisationPanel(rows) {
  const levelOrder = { SDM: 1, STP: 2, TP: 3 };
  const bands = ['SDM','STP','TP'];

  // Utilisation by role band
  const bandRows = bands.map(band => {
    const r = rows.filter(r => r.Level === band);
    const u = _calcUtilisation(r);
    const hc = new Set(r.map(r => r.EmployeeName)).size;
    return { band, u, hc };
  }).filter(b => b.hc > 0);

  const totalUtil = _calcUtilisation(rows);
  const totalHC   = new Set(rows.map(r => r.EmployeeName)).size;

  const bandTableRows = bandRows.map(b => `
    <tr>
      <td>${b.band}</td>
      <td>${_fmtPct(b.u)}</td>
      <td>${b.hc}</td>
    </tr>`).join('');

  // Monthly trend — group rows by Year-Month
  const monthMap = {};
  rows.forEach(r => {
    const key = `${r.Year}-${String(r.Month).padStart(2,'0')}`;
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(r);
  });
  const monthKeys = Object.keys(monthMap).sort();
  const chartData = monthKeys.map(k => ({
    label: k,
    value: _calcUtilisation(monthMap[k]),
  }));

  return `
    <div class='page-header' style='margin-bottom:12px'>
      <h3 style='margin:0;color:#1B3A5C'>Team Utilisation</h3>
    </div>
    <table class='data-table' style='margin-bottom:16px'>
      <thead><tr><th>Role Band</th><th>Utilisation</th><th>Headcount</th></tr></thead>
      <tbody>
        ${bandTableRows}
        <tr style='font-weight:700;border-top:2px solid #ccc'>
          <td>Total</td>
          <td>${_fmtPct(totalUtil)}</td>
          <td>${totalHC}</td>
        </tr>
      </tbody>
    </table>
    <div style='font-size:12px;font-weight:600;color:#555;margin-bottom:4px'>
      Monthly Trend</div>
    ${_barChart(chartData, _fmtPct)}`;
}

// Panel 2 - Revenue
function _renderRevenuePanel(rows) {
  // Revenue by customer — exclude Unassigned/Internal
  const byCustomer = {};
  rows.filter(r => r.Customer && r.Customer !== 'Unassigned'
                && r.ProjectType !== 'Internal')
    .forEach(r => {
      byCustomer[r.Customer] = (byCustomer[r.Customer] || 0) + r.BilledRevenue;
    });
  const customerRows = Object.entries(byCustomer)
    .sort((a,b) => b[1] - a[1])
    .map(([c,v]) => `<tr><td>${c}</td><td>${_fmtGBP(v)}</td></tr>`).join('');
  const customerTotal = Object.values(byCustomer).reduce((s,v)=>s+v,0);

  // Revenue by project type
  const byType = {};
  rows.forEach(r => {
    byType[r.ProjectType] = (byType[r.ProjectType] || 0) + r.BilledRevenue;
  });
  const typeOrder = ['Embedded','CoE','Transformation','LCI','Internal'];
  const typeRows = typeOrder
    .filter(t => byType[t] !== undefined)
    .map(t => `<tr><td>${t}</td><td>${_fmtGBP(byType[t])}</td></tr>`).join('');
  const typeTotal = Object.values(byType).reduce((s,v)=>s+v,0);

  return `
    <div style='display:grid;grid-template-columns:1fr 1fr;gap:24px'>
      <div>
        <div style='font-size:13px;font-weight:700;color:#1B3A5C;margin-bottom:8px'>
          By Customer</div>
        <table class='data-table'>
          <thead><tr><th>Customer</th><th>Billed Revenue</th></tr></thead>
          <tbody>
            ${customerRows}
            <tr style='font-weight:700;border-top:2px solid #ccc'>
              <td>Total</td><td>${_fmtGBP(customerTotal)}</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <div style='font-size:13px;font-weight:700;color:#1B3A5C;margin-bottom:8px'>
          By Project Type</div>
        <table class='data-table'>
          <thead><tr><th>Project Type</th><th>Billed Revenue</th></tr></thead>
          <tbody>
            ${typeRows}
            <tr style='font-weight:700;border-top:2px solid #ccc'>
              <td>Total</td><td>${_fmtGBP(typeTotal)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

//Panel 3 - Workforce Segmentation
function _renderSegmentationPanel(people) {
  // Active employees only
  const active = people.filter(p => p.IsActive !== false);
  const total  = active.length;

  const groupBy = (key) => {
    const map = {};
    active.forEach(p => {
      const v = p[key] || 'Unknown';
      map[v] = (map[v] || 0) + 1;
    });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  };

  const tableHTML = (entries) => entries.map(([k,v]) => `
    <tr>
      <td>${k}</td>
      <td>${v}</td>
      <td>${total > 0 ? ((v/total)*100).toFixed(0) + '%' : '—'}</td>
    </tr>`).join('');

  const levelOrder = { CSD:0, SDM:1, STP:2, TP:3 };
  const byLevel = Object.entries(
    active.reduce((m,p) => { m[p.Level||'Unknown']=(m[p.Level||'Unknown']||0)+1; return m; },{}))
    .sort((a,b)=>(levelOrder[a[0]]??99)-(levelOrder[b[0]]??99));

  return `
    <div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:8px'>
      <div>
        <div style='font-size:13px;font-weight:700;color:#1B3A5C;margin-bottom:8px'>
          By Location</div>
        <table class='data-table'>
          <thead><tr><th>Location</th><th>#</th><th>%</th></tr></thead>
          <tbody>${tableHTML(groupBy('Location'))}</tbody>
        </table>
      </div>
      <div>
        <div style='font-size:13px;font-weight:700;color:#1B3A5C;margin-bottom:8px'>
          By Contract Type</div>
        <table class='data-table'>
          <thead><tr><th>Contract</th><th>#</th><th>%</th></tr></thead>
          <tbody>${tableHTML(groupBy('ContractType'))}</tbody>
        </table>
      </div>
      <div>
        <div style='font-size:13px;font-weight:700;color:#1B3A5C;margin-bottom:8px'>
          By Role Band</div>
        <table class='data-table'>
          <thead><tr><th>Level</th><th>#</th><th>%</th></tr></thead>
          <tbody>${tableHTML(byLevel)}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Stubs for pages built in later phases ────────────────────
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
   · <a href='#' onclick='deleteInvoice(${inv.id})' style='color:#c62828'>Delete</a>
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

async function renderPeopleDashboard() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading dashboard...</p>';

  const [assignments, people] = await Promise.all([
    getAssignments({}),
    getPeople(false),
  ]);

  const allRows = computeMonthlyRows(assignments);

const { start, end } = _dashDateRange();
  const periodRows = _rowsInRange(allRows, start, end);
  const kpiStrip     = await _renderKPIStrip(allRows, people, assignments);
  const utilisPanel  = _renderUtilisationPanel(periodRows);
  const revenuePanel = _renderRevenuePanel(periodRows);
  const segmentPanel = _renderSegmentationPanel(people);
  const now      = new Date();
  const thisY    = now.getFullYear();
  const yearOpts = [thisY, thisY - 1].map(y =>
    `<option value='${y}' ${_dashFilter.year===y?'selected':''}>${y}</option>`).join('');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const maxMonth = _dashFilter.year === thisY ? now.getMonth() : 11;
  const monthOpts = `<option value=''>All</option>` +
    monthNames.slice(0, maxMonth + 1).map((name, i) =>
      `<option value='${i}' ${_dashFilter.month===i?'selected':''}>${name}</option>`).join('');
  const quarterOpts = `<option value=''>All</option>` +
    [1,2,3,4].map(q =>
      `<option value='${q}' ${_dashFilter.quarter===q?'selected':''}>Q${q}</option>`).join('');
  const periodBtns = `
    <div style='display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end'>
      <div class='form-group' style='min-width:100px'>
        <label>Year</label>
        <select onchange='_setDashYear(+this.value)'>${yearOpts}</select>
      </div>
      <div class='form-group' style='min-width:100px'>
        <label>Month</label>
        <select onchange='_setDashMonth(this.value)'>${monthOpts}</select>
      </div>
      <div class='form-group' style='min-width:100px'>
        <label>Quarter</label>
        <select onchange='_setDashQuarter(this.value)'>${quarterOpts}</select>
      </div>
    </div>`;

  main.innerHTML = `
    <div class='page-header'><h2>People Dashboard</h2></div>

    ${kpiStrip}

 <div style='margin-bottom:24px'>${periodBtns}</div>

    <div style='display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px'>
      <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px'>
        ${utilisPanel}
      </div>
      <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px'>
        <div class='page-header' style='margin-bottom:12px'>
          <h3 style='margin:0;color:#1B3A5C'>Revenue</h3>
        </div>
        ${revenuePanel}
      </div>
    </div>

    <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px'>
      <div class='page-header' style='margin-bottom:12px'>
        <h3 style='margin:0;color:#1B3A5C'>Workforce Segmentation</h3>
      </div>
      ${segmentPanel}
    </div>`;
}

async function _setDashYear(year) {
  _dashFilter.year = year;
  // Clamp month if switching to current year and selected month is in the future
  const now = new Date();
  if (year === now.getFullYear() && _dashFilter.month !== null && _dashFilter.month > now.getMonth()) {
    _dashFilter.month = now.getMonth();
  }
  await renderPeopleDashboard();
}
async function _setDashMonth(value) {
  _dashFilter.month   = value !== '' ? +value : null;
  _dashFilter.quarter = null;  // clear quarter
  await renderPeopleDashboard();
}
async function _setDashQuarter(value) {
  _dashFilter.quarter = value !== '' ? +value : null;
  _dashFilter.month   = null;  // clear month
  await renderPeopleDashboard();
}
