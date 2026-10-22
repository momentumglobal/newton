// js/people-tracker.js — Employee Tracker (incl. Assignments tab, payroll trigger)

// ── Row template builders (moved from utils.js, N-237c) ────────────────
// Same contract as pages.js's row builders -- opts.pending renders a
// row-pending class + data-pending-id and drops anything that depends on
// a real id. Uses pendingRowId() from utils.js; not redefined here.
function personRowHtml(p, { canEdit, canPayroll, salariesRevealed, pending = false } = {}) {
  const isUK      = p.Location === 'UK';
  const salaryVal = (isUK && p.Salary) ? `£${Number(p.Salary).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  const salaryCell = canPayroll && isUK ? `
      <td class='salary-cell'>
        <span class='salary-masked' id='sal-masked-${p.id}' style='display:${salariesRevealed ? "none" : "inline"}'>
          ••••••
          <button class='btn-padlock' title='Reveal salary'${act('_revealSalary', String(p.id))}
            style='background:none;border:none;cursor:pointer;padding:0 4px;color:var(--text-muted)'>🔒</button>
        </span>
        <span class='salary-revealed' id='sal-revealed-${p.id}' style='display:${salariesRevealed ? "inline" : "none"}'>
          ${salaryVal}
          <button class='btn-padlock' title='Hide salary'${act('_hideSalary', String(p.id))}
            style='background:none;border:none;cursor:pointer;padding:0 4px;color:var(--text-muted)'>🔓</button>
        </span>
      </td>` : (canPayroll ? `<td>—</td>` : '');
  return `
    <tr class="${pending ? 'row-pending' : ''}"${pending ? ` data-pending-id="${escAttr(p.id)}"` : ''}>
      <td>${p.PhotoUrl
            ? `<img src="${escAttr(p.PhotoUrl)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover">`
            : '<span style="color:var(--text-faint);font-size:12px">—</span>'}</td>
      <td>${escHtml(p.EmployeeName)}</td>
      <td>${escHtml(personRoleLabel(p) || '—')}</td>
      <td>${escHtml(p.ContractType || '—')}</td>
      <td>${escHtml(p.Location || '—')}</td>
      <td>${spDateIn(p.StartDate) || '—'}</td>
      <td>${spDateIn(p.EndDate) || '—'}</td>
      <td><span class='badge badge-${p.IsActive ? 'active' : 'inactive'}'>${p.IsActive ? 'Active' : 'Inactive'}</span></td>
      ${salaryCell}
      ${canEdit ? (pending ? "<td></td>" : `<td><div class='row-actions'><a href='#'${act('showEditPersonForm', Number(p.id))}>Edit</a></div></td>`) : ''}
    </tr>`;
}

function assignmentRowHtml(a) {
  // N-372: the list is read-only. A project row's Customer opens its Project page; bench and
  // historic rows are plain text (assignmentOwner, project-team.js).
  const href = assignmentOwner(a) === 'project' ? ptProjectPageHref(a.ProjectID) : '';
  const customer = escHtml(a.Customer || '—');
  return `
    <tr>
      <td>${escHtml(a.AssignmentID || '—')}</td>
      <td>${escHtml(a.EmployeeName || '—')}</td>
      <td>${escHtml(a.Level || '—')}</td>
      <td>${href ? `<a href='${escAttr(href)}'>${customer}</a>` : customer}</td>
      <td>${escHtml(a.ProjectType || '—')}</td>
      <td>${spDateIn(a.StartDate) || '—'}</td>
      <td>${spDateIn(a.EndDate) || '—'}</td>
      <td>${assignmentRateLabel(a)}</td>
      <td><span class='badge badge-${a.Billed==="Yes"?"active":"inactive"}'>${escHtml(a.Billed)}</span>${
        isForecastAssignment(a) ? ` <span class='badge' style='background:var(--status-warn-bg-soft);color:var(--status-warn-text)'>Forecast</span>` : ''}</td>
    </tr>`;
}

// ── Employee Tracker state ────────────────────────────────────
let _peopleTab        = 'employees';
let _showInactive     = false;
let _salariesRevealed = false;
let _assignmentFilter = {
  status:      'current',
  customer:    '',
  projectType: '',
};
let _employeesSort     = null;  // N-247c: { key, dir } — null = default order
let _employeesSearch   = '';    // N-247c: shared list search box (list-controls.js)
let _assignmentsSort   = null;
let _assignmentsSearch = '';

async function renderEmployeeTracker(pendingItem = null) {
  const main = document.getElementById('main-content');
  const role = _resolvedRole;
  if (!roleCan(role, 'peopleFull')) {
    main.innerHTML = '<p>Access denied.</p>';
    return;
  }
  if (_peopleTab === 'employees') {
    await renderEmployeesTab(pendingItem);
  } else {
    await renderAssignmentsTab();
  }
}

function _peopleTabBar() {
  return `<div class='filter-group' style='margin-bottom:16px'>
    <button class='btn-filter${_peopleTab==="employees"?" active":""}'${act('_switchPeopleTab', 'employees')}>Employees</button>
    <button class='btn-filter${_peopleTab==="assignments"?" active":""}'${act('_switchPeopleTab', 'assignments')}>Assignments</button>
  </div>`;
}

async function _switchPeopleTab(tab) {
  _peopleTab = tab;
  await renderEmployeeTracker();
}

async function renderEmployeesTab(pendingItem = null) {
  const main     = document.getElementById('main-content');
  const canEdit  = roleCan(_resolvedRole, 'peopleEdit');
  const canPayroll = roleCan(_resolvedRole, 'peopleFull');
  // N-286: salary comes from the restricted PeoplePay list, fetched only for
  // payroll roles. Joined before the pending item is appended, so an
  // optimistic row keeps the Salary it was saved with.
  const [peopleRows, payRows] = await Promise.all([
    getPeople(!_showInactive),
    canPayroll ? getPeoplePay() : Promise.resolve([]),
  ]);
  const payDenied = canPayroll && wasListDenied('PeoplePay');
  let people   = canPayroll ? attachSalaries(peopleRows, payRows) : peopleRows;
  // N-218b: an Employee has no filter that could exclude it (a new
  // employee's IsActive is always true), so it's always appended.
  if (pendingItem) people.push(pendingItem);

  // N-247c: shared list search (list-controls.js) + sort, after every
  // existing filter, before render. No pre-existing default sort to
  // preserve here (people renders in getPeople()'s own return order).
  const totalEmployees = people.length;
  people = filterRowsByText(people, _employeesSearch, p => [p.EmployeeName, p.Level, p.StaffFunction, p.ContractType, p.Location]);
  const EMPLOYEE_SORT_COLUMNS = {
    name:     { type: 'text', get: p => p.EmployeeName },
    level:    { type: 'enum', order: CONFIG.PEOPLE_LEVELS, get: p => p.Level },
    contract: { type: 'text', get: p => p.ContractType },
    location: { type: 'text', get: p => p.Location },
    start:    { type: 'date', get: p => p.StartDate },
    end:      { type: 'date', get: p => p.EndDate },
    // Salary is deliberately NOT sortable (see thead below) — payroll-gated
    // and masked by default; a sort control would let sort order leak
    // relative salaries to a non-payroll viewer.
    status:   { type: 'text', get: p => p.IsActive ? 'Active' : 'Inactive' },
  };
  people = sortRows(people, _employeesSort, EMPLOYEE_SORT_COLUMNS);

  const rows = people.map(p => personRowHtml(p, {
    canEdit,
    canPayroll,
    salariesRevealed: _salariesRevealed,
    pending: pendingItem ? p.id === pendingItem.id : false,
  })).join('');

  const salaryToggle = canPayroll ? `
    <button class='btn-secondary' style='font-size:12px;padding:4px 10px'${act('_toggleAllSalaries')}>
      ${_salariesRevealed ? '🔒 Lock All' : '🔓 Unlock All'}
    </button>` : '';

  const bonusMonths = [1, 4, 7, 10];
  const now         = new Date();
  const isBonusMonth = bonusMonths.includes(now.getMonth() + 1);

  main.innerHTML = `
    <div class='page-header'>
      <h2>Employee Tracker</h2>
      <div style='display:flex;align-items:center;gap:10px'>
        ${canPayroll ? `<button class='btn-secondary'${act('_openPayrollModal')}>&#128203; Generate Payroll Summary</button>` : ''}
        ${canEdit ? `<button class='btn-primary'${act('showAddPersonForm')}>+ Add Employee</button>` : ''}
      </div>
    </div>
     ${_peopleTabBar()}
    <div style='margin-bottom:12px;display:flex;align-items:center;gap:16px'>
      <label style='font-size:13px;cursor:pointer'>
        <input type='checkbox' ${_showInactive ? 'checked' : ''}${actOn('change', '_toggleInactive', ACT_CHECKED)}
          style='margin-right:6px'>
        Show inactive employees
      </label>
      ${salaryToggle}
      ${listSearchBox(_employeesSearch, 'setEmployeesSearch')}
    </div>
    ${listResultCount(people.length, people.length, totalEmployees, null, 'employee')}
    ${payDenied ? `<p class='form-hint'>${escHtml(CONFIG.PEOPLE_PAY_DENIED_TEXT)}</p>` : ''}
    <table class='data-table'>
      <thead><tr>
        <th>Photo</th>
        ${sortableHeader('Name', 'name', _employeesSort, 'setEmployeesSort')}
        ${sortableHeader('Level', 'level', _employeesSort, 'setEmployeesSort')}
        ${sortableHeader('Contract', 'contract', _employeesSort, 'setEmployeesSort')}
        ${sortableHeader('Location', 'location', _employeesSort, 'setEmployeesSort')}
        ${sortableHeader('Start', 'start', _employeesSort, 'setEmployeesSort')}
        ${sortableHeader('End', 'end', _employeesSort, 'setEmployeesSort')}
        ${sortableHeader('Status', 'status', _employeesSort, 'setEmployeesSort')}
        ${canPayroll ? '<th>Salary</th>' : ''}
        ${canEdit ? '<th></th>' : ''}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Payroll modal -->
    <div id='payroll-modal-overlay' style='display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:var(--z-modal);overflow-y:auto'>
      <div class='print-avoid-break' style='background:var(--surface);border-radius:8px;max-width:640px;margin:60px auto;padding:32px;position:relative'>
        <button${act('_closePayrollModal')} style='position:absolute;top:16px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)'>&times;</button>
        <div id='payroll-modal-body'></div>
      </div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

async function _toggleInactive(checked) {
  _showInactive = checked;
  await renderEmployeesTab();
}

function _revealSalary(id) {
  document.getElementById(`sal-masked-${id}`).style.display = 'none';
  document.getElementById(`sal-revealed-${id}`).style.display = 'inline';
}
function _hideSalary(id) {
  document.getElementById(`sal-revealed-${id}`).style.display = 'none';
  document.getElementById(`sal-masked-${id}`).style.display = 'inline';
}
function _toggleAllSalaries() {
  _salariesRevealed = !_salariesRevealed;
  renderEmployeesTab();
}

// N-247c: debounced re-render, same shape as Roles' _debouncedRenderRolesPage.
const _debouncedRenderEmployeesTab = debounce(async () => { await renderEmployeesTab(); focusListSearchBox(); }, 250);
function setEmployeesSearch(val) { _employeesSearch = val || ''; _debouncedRenderEmployeesTab(); }
async function setEmployeesSort(key) { _employeesSort = nextSortState(_employeesSort, key); await renderEmployeesTab(); focusSortHeader(key); }

async function renderAssignmentsTab() {
  const main    = document.getElementById('main-content');
  const canEdit = roleCan(_resolvedRole, 'peopleEdit');

  const assignments = await getAssignments({});

  // N-132: UTC by construction, matching syncBenchAssignments below (N-090) —
  // this file no longer carries two date conventions. localDayISO() answers
  // "what day is it where the user is" (the filter follows the USER's calendar,
  // not UTC's), and utcDateOnly() expresses that day as UTC midnight so it
  // compares like-for-like against the assignment dates. Do NOT reintroduce
  // `new Date(str)` + setHours(): mixing the two conventions in one file is
  // exactly what produced N-090's off-by-one bench writes.
  const today = utcDateOnly(localDayISO());
  const statusFilter = _assignmentFilter.status || 'current';

  // Status predicate for the Current / Former / Planned filter.
  const matchesStatus = a => {
    const start = utcDateOnly(a.StartDate);
    const end   = utcDateOnly(a.EndDate);
    const isPlanned = start && start > today;
    const isCurrent = !isPlanned && (!end || end >= today);
    if (statusFilter === 'current') return isCurrent;
    if (statusFilter === 'former')  return !isPlanned && end && end < today;
    if (statusFilter === 'planned') return isPlanned;
    return true;
  };
  const matchesOtherFilters = a => {
    if (_assignmentFilter.customer    && a.Customer    !== _assignmentFilter.customer)    return false;
    if (_assignmentFilter.projectType && a.ProjectType !== _assignmentFilter.projectType) return false;
    return true;
  };

let filtered = assignments.filter(matchesStatus).filter(matchesOtherFilters);

  const customers    = [...new Set(assignments.map(a => a.Customer).filter(Boolean))].sort();
  const projectTypes = [...new Set(assignments.map(a => a.ProjectType).filter(Boolean))].sort();

  const opts = (vals, cur, blank) =>
    `<option value=''>${blank}</option>` +
    vals.map(v => `<option value='${escHtml(v)}' ${cur===v?'selected':''}>${escHtml(v)}</option>`).join('');

  const filterBar = `
    <div class='project-filter-bar' style='display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px'>
      <div class='form-group' style='min-width:140px'>
        <label>Status</label>
        <select${actOn('change', '_setAssignmentFilter', 'status', ACT_VALUE)}>
         <option value='current' ${statusFilter==='current'?'selected':''}>Current</option>
         <option value='former'  ${statusFilter==='former' ?'selected':''}>Former</option>
         <option value='planned' ${statusFilter==='planned'?'selected':''}>Planned</option>
         <option value='all'     ${statusFilter==='all'    ?'selected':''}>All</option>
       </select>
      </div>
      <div class='form-group' style='min-width:140px'>
        <label>Customer</label>
        <select${actOn('change', '_setAssignmentFilter', 'customer', ACT_VALUE)}>
          ${opts(customers, _assignmentFilter.customer, 'All')}
        </select>
      </div>
      <div class='form-group' style='min-width:140px'>
        <label>Project Type</label>
        <select${actOn('change', '_setAssignmentFilter', 'projectType', ACT_VALUE)}>
          ${opts(projectTypes, _assignmentFilter.projectType, 'All')}
        </select>
      </div>
      ${listSearchBox(_assignmentsSearch, 'setAssignmentsSearch')}
    </div>`;

  // N-247c: search after every existing filter, before the pre-existing
  // default order (kept as-is below); sortRows layers on top of it.
  filtered = filterRowsByText(filtered, _assignmentsSearch, a => [a.EmployeeName, a.Customer, a.ProjectType, a.Level]);

  filtered.sort((a, b) => {
  const c = (a.Customer || '').localeCompare(b.Customer || '');
  if (c !== 0) return c;
  const l = levelSortIndex(a.Level) - levelSortIndex(b.Level);
  if (l !== 0) return l;
  return (a.EmployeeName || '').localeCompare(b.EmployeeName || '');
});
  const ASSIGNMENT_SORT_COLUMNS = {
    employee:    { type: 'text', get: a => a.EmployeeName },
    level:       { type: 'enum', order: CONFIG.PEOPLE_LEVELS, get: a => a.Level },
    customer:    { type: 'text', get: a => a.Customer },
    projectType: { type: 'enum', order: CONFIG.PROJECT_TYPES, get: a => a.ProjectType },
    start:       { type: 'date', get: a => a.StartDate },
    end:         { type: 'date', get: a => a.EndDate },
    // N-247c: does NOT mirror the cell 1:1 — assignmentRateLabel() renders a
    // composite split-fee string for some rows, with no single scalar to
    // sort by. Split-fee assignments sort as empty (last); every other row
    // sorts on its raw MonthlyBillRate.
    billRate:    { type: 'number', get: a => isSplitFeeAssignment(a) ? null : (parseFloat(a.MonthlyBillRate) || null) },
    billed:      { type: 'text', get: a => a.Billed },
  };
  filtered = sortRows(filtered, _assignmentsSort, ASSIGNMENT_SORT_COLUMNS);
  const rows = filtered.map(a => assignmentRowHtml(a)).join('');

  _updateBenchSyncTimestamp();
  main.innerHTML = `
    <div class='page-header'>
      <h2>Employee Tracker</h2>
      <div style='display:flex;align-items:center;gap:12px'>
        ${canEdit ? `<button id='bench-sync-btn' class='btn-secondary'${act('_syncBenchAssignments')}>↻ Sync Bench</button>
        <span id='bench-sync-time' style='font-size:12px;color:var(--text-muted)'></span>` : ''}
      </div>
    </div>
    ${_peopleTabBar()}
    ${filterBar}
    <p class='form-hint'>Project assignments are managed on each Project page — click a customer to open it.</p>
    ${listResultCount(filtered.length, filtered.length, assignments.length, null, 'assignment')}
    <table class='data-table'>
      <thead><tr>
        <th>ID</th>
        ${sortableHeader('Employee', 'employee', _assignmentsSort, 'setAssignmentsSort')}
        ${sortableHeader('Level', 'level', _assignmentsSort, 'setAssignmentsSort')}
        ${sortableHeader('Customer', 'customer', _assignmentsSort, 'setAssignmentsSort')}
        ${sortableHeader('Project Type', 'projectType', _assignmentsSort, 'setAssignmentsSort')}
        ${sortableHeader('Start', 'start', _assignmentsSort, 'setAssignmentsSort')}
        ${sortableHeader('End', 'end', _assignmentsSort, 'setAssignmentsSort')}
        ${sortableHeader('Bill Rate', 'billRate', _assignmentsSort, 'setAssignmentsSort')}
        ${sortableHeader('Billed', 'billed', _assignmentsSort, 'setAssignmentsSort')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  if (window.lucide) lucide.createIcons();
}

async function _setAssignmentFilter(key, value) {
  _assignmentFilter[key] = value;
  await renderAssignmentsTab();
}

// N-247c: debounced re-render, same shape as _debouncedRenderEmployeesTab.
const _debouncedRenderAssignmentsTab = debounce(async () => { await renderAssignmentsTab(); focusListSearchBox(); }, 250);
function setAssignmentsSearch(val) { _assignmentsSearch = val || ''; _debouncedRenderAssignmentsTab(); }
async function setAssignmentsSort(key) { _assignmentsSort = nextSortState(_assignmentsSort, key); await renderAssignmentsTab(); focusSortHeader(key); }

// ── Bench Sync ────────────────────────────────────────────────
// The pure gap computation is ptComputeBenchChanges (project-team.js, moved
// there by N-365 so the Project Team save can re-sync one person). This file
// keeps the async wrapper that fetches, executes the changes and refreshes
// the UI.

async function _syncBenchAssignments() {
  const btn = document.getElementById('bench-sync-btn');
  if (btn) { btn.textContent = 'Syncing…'; btn.disabled = true; }

  try {
    const [people, assignments] = await Promise.all([
      getPeople(false),
      getAssignments({}),
    ]);

    const { toCreate, toDelete } = ptComputeBenchChanges(people, assignments);

    // Execute deletes then creates
    await Promise.all(toDelete.map(id => deleteItem('Assignments', id)));

    // Generate IDs for new records
    const allAssignments = await getAssignments({});
    for (let i = 0; i < toCreate.length; i++) {
      const fields = toCreate[i];
      fields.AssignmentID = ptNextAssignmentId(allAssignments, 'B', i);
      await createAssignment(fields);
    }

    const summary = [];
    if (toCreate.length) summary.push(`${toCreate.length} bench record${toCreate.length > 1 ? 's' : ''} added`);
    if (toDelete.length) summary.push(`${toDelete.length} removed`);
    const msg = summary.length ? summary.join(', ') : 'Already up to date';

    if (btn) {
      btn.textContent = `✓ ${msg}`;
      btn.disabled = false;
      localStorage.setItem('benchSyncLast', new Date().toISOString());
      setTimeout(() => {
        btn.textContent = '↻ Sync Bench';
        _updateBenchSyncTimestamp();
      }, 3000);
    }

    // Refresh the tab
    await renderAssignmentsTab();

  } catch (e) {
    if (btn) { btn.textContent = '↻ Sync Bench'; btn.disabled = false; }
    toast('Sync failed: ' + e.message, { type: 'error' });
  }
}

function _updateBenchSyncTimestamp() {
  const el = document.getElementById('bench-sync-time');
  if (!el) return;
  const last = localStorage.getItem('benchSyncLast');
  if (!last) { el.textContent = ''; return; }
  const d = new Date(last);
  el.textContent = `Last synced: ${d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  })}`;
}

// ── People Dashboard state ────────────────────────────────────

// N-302a: delegated actions this file owns that shared markup calls (js/actions.js).
// Later N-302 sub-tasks add their own names to this call; never register a name twice.
registerActions({
  setEmployeesSearch,
  setEmployeesSort,
  setAssignmentsSearch,
  setAssignmentsSort,
  _revealSalary,
  _hideSalary,
  _toggleAllSalaries,
  _toggleInactive,
  _switchPeopleTab,
  _setAssignmentFilter,
  _syncBenchAssignments,
});
