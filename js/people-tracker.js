// js/people-tracker.js — Employee Tracker (incl. Assignments tab, payroll trigger)
// ── Employee Tracker state ────────────────────────────────────
let _peopleTab        = 'employees';
let _showInactive     = false;
let _salariesRevealed = false;
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
  const main     = document.getElementById('main-content');
  const canEdit  = _resolvedRole === 'admin';
  const canPayroll = ['admin','leadership'].includes(_resolvedRole);
  const people   = await getPeople(!_showInactive);

  const rows = people.map(p => {
    const isUK      = p.Location === 'UK';
    const salaryVal = (isUK && p.Salary) ? `£${Number(p.Salary).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
    const salaryCell = canPayroll && isUK ? `
      <td class='salary-cell'>
        <span class='salary-masked' id='sal-masked-${p.id}' style='display:${_salariesRevealed ? "none" : "inline"}'>
          ••••••
          <button class='btn-padlock' title='Reveal salary' onclick='_revealSalary(${p.id})'
            style='background:none;border:none;cursor:pointer;padding:0 4px;color:var(--text-muted)'>🔒</button>
        </span>
        <span class='salary-revealed' id='sal-revealed-${p.id}' style='display:${_salariesRevealed ? "inline" : "none"}'>
          ${salaryVal}
          <button class='btn-padlock' title='Hide salary' onclick='_hideSalary(${p.id})'
            style='background:none;border:none;cursor:pointer;padding:0 4px;color:var(--text-muted)'>🔓</button>
        </span>
      </td>` : (canPayroll ? `<td>—</td>` : '');
    return `
    <tr>
      <td>${p.PhotoUrl
            ? `<img src="${escAttr(p.PhotoUrl)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover">`
            : '<span style="color:var(--text-faint);font-size:12px">—</span>'}</td>
      <td>${escHtml(p.EmployeeName)}</td>
      <td>${escHtml(p.Level || '—')}</td>
      <td>${escHtml(p.ContractType || '—')}</td>
      <td>${escHtml(p.Location || '—')}</td>
      <td>${spDateIn(p.StartDate) || '—'}</td>
      <td>${spDateIn(p.EndDate) || '—'}</td>
      <td><span class='badge badge-${p.IsActive ? 'active' : 'inactive'}'>${p.IsActive ? 'Active' : 'Inactive'}</span></td>
      ${salaryCell}
      ${canEdit ? `<td><div class='row-actions'><a href='#' onclick='showEditPersonForm(${p.id})'>Edit</a></div></td>` : ''}
    </tr>`;
  }).join('');

  const salaryToggle = canPayroll ? `
    <button class='btn-secondary' style='font-size:12px;padding:4px 10px'
      onclick='_toggleAllSalaries()'>
      ${_salariesRevealed ? '🔒 Lock All' : '🔓 Unlock All'}
    </button>` : '';

  const bonusMonths = [1, 4, 7, 10];
  const now         = new Date();
  const isBonusMonth = bonusMonths.includes(now.getMonth() + 1);

  main.innerHTML = `
    <div class='page-header'>
      <h2>Employee Tracker</h2>
      <div style='display:flex;align-items:center;gap:10px'>
        ${canPayroll ? `<button class='btn-secondary' onclick='_openPayrollModal()'>&#128203; Generate Payroll Summary</button>` : ''}
        ${canEdit ? "<button class='btn-primary' onclick='showAddPersonForm()'>+ Add Employee</button>" : ''}
      </div>
    </div>
    ${_peopleTabBar()}
    <div style='margin-bottom:12px;display:flex;align-items:center;gap:16px'>
      <label style='font-size:13px;cursor:pointer'>
        <input type='checkbox' ${_showInactive ? 'checked' : ''}
          onchange='_toggleInactive(this.checked)'
          style='margin-right:6px'>
        Show inactive employees
      </label>
      ${salaryToggle}
    </div>
    <table class='data-table'>
      <thead><tr>
        <th>Photo</th><th>Name</th><th>Level</th><th>Contract</th><th>Location</th>
        <th>Start</th><th>End</th><th>Status</th>
        ${canPayroll ? '<th>Salary</th>' : ''}
        ${canEdit ? '<th></th>' : ''}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Payroll modal -->
    <div id='payroll-modal-overlay' style='display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;overflow-y:auto'>
      <div class='print-avoid-break' style='background:var(--surface);border-radius:8px;max-width:640px;margin:60px auto;padding:32px;position:relative'>
        <button onclick='_closePayrollModal()' style='position:absolute;top:16px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)'>&times;</button>
        <div id='payroll-modal-body'></div>
      </div>
    </div>`;
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

async function renderAssignmentsTab() {
  const main    = document.getElementById('main-content');
  const canEdit = _resolvedRole === 'admin';

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

const filtered = assignments.filter(a => {
  // utcDateOnly() returns null for a missing/unparseable value, which is what
  // the old `a.StartDate ? ... : null` ternary produced — so the null-guards
  // and comparisons below are unchanged.
  const start = utcDateOnly(a.StartDate);
  const end   = utcDateOnly(a.EndDate);
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
    vals.map(v => `<option value='${escHtml(v)}' ${cur===v?'selected':''}>${escHtml(v)}</option>`).join('');

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

  filtered.sort((a, b) => {
  const c = (a.Customer || '').localeCompare(b.Customer || '');
  if (c !== 0) return c;
  const l = levelSortIndex(a.Level) - levelSortIndex(b.Level);
  if (l !== 0) return l;
  return (a.EmployeeName || '').localeCompare(b.EmployeeName || '');
});
  const rows = filtered.map(a => `
    <tr>
      <td>${escHtml(a.AssignmentID || '—')}</td>
      <td>${escHtml(a.EmployeeName || '—')}</td>
      <td>${escHtml(a.Level || '—')}</td>
      <td>${escHtml(a.Customer || '—')}</td>
      <td>${escHtml(a.ProjectType || '—')}</td>
      <td>${spDateIn(a.StartDate) || '—'}</td>
      <td>${spDateIn(a.EndDate) || '—'}</td>
      <td>${assignmentRateLabel(a)}</td>
      <td><span class='badge badge-${a.Billed==="Yes"?"active":"inactive"}'>${escHtml(a.Billed)}</span>${
        isForecastAssignment(a) ? ` <span class='badge' style='background:var(--status-warn-bg-soft);color:var(--status-warn-text)'>Forecast</span>` : ''}</td>
      ${canEdit ? `<td><div class='row-actions'>
        <a href='#' onclick='showEditAssignmentForm(${a.id})'>Edit</a>${
        (a.AutoGenerated === true || a.AutoGenerated === 1 || a.AutoGenerated === 'Yes') ? '' :
        ` · <a href='#' style='color:var(--status-danger)' onclick='_deleteAssignment(${a.id})'>Delete</a>`}
      </div></td>` : ''}
    </tr>`).join('');

  _updateBenchSyncTimestamp();
  main.innerHTML = `
    <div class='page-header'>
      <h2>Employee Tracker</h2>
      <div style='display:flex;align-items:center;gap:12px'>
        ${canEdit ? "<button class='btn-primary' onclick='showAddAssignmentForm()'>+ Add Assignment</button>" : ''}
        ${canEdit ? `<button id='bench-sync-btn' class='btn-secondary' onclick='_syncBenchAssignments()'>↻ Sync Bench</button>
        <span id='bench-sync-time' style='font-size:12px;color:var(--text-muted)'></span>` : ''}
      </div>
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

async function _deleteAssignment(id) {
  if (!(await confirmModal({
    message: 'Delete this assignment? This cannot be undone.',
    confirmLabel: 'Delete', danger: true,
  }))) return;
  try {
    await deleteItem('Assignments', id);
    await renderAssignmentsTab();
  } catch (e) {
    toast('Error deleting assignment: ' + e.message, { type: 'error' });
  }
}

// ── Bench Sync ────────────────────────────────────────────────
async function _syncBenchAssignments() {
  const btn = document.getElementById('bench-sync-btn');
  if (btn) { btn.textContent = 'Syncing…'; btn.disabled = true; }

  try {
    const [people, assignments] = await Promise.all([
      getPeople(false),
      getAssignments({}),
    ]);

    // N-090: this whole function is UTC by construction. Every Date below is
    // UTC midnight (utcDateOnly / Date.UTC), every mutation uses a UTC setter,
    // and every write goes out through spDateOut(). Do NOT reintroduce
    // setHours() or a local getter: mixing the two conventions is what wrote
    // bench StartDates a day early during BST, and made the stored value never
    // match on re-read — so every affected record was deleted and recreated on
    // every sync run.
    const today    = new Date();
    const thisYear = today.getUTCFullYear();
    const yearEnd  = new Date(Date.UTC(thisYear, 11, 31));

    // Only sync active employees at billable levels
    const billable = people.filter(p =>
      p.IsActive !== false && isBillableLevel(p.Level)
    );

    // Existing auto-generated bench records (so we can diff)
    const existingBench = assignments.filter(a => a.AutoGenerated === true || a.AutoGenerated === 1 || a.AutoGenerated === 'Yes');  
    const toCreate = [];
    const toDelete = [];

    // Clean up bench records for inactive employees — they're excluded from the main loop
    // but their stale bench records still need removing
    const inactiveBench = existingBench.filter(b =>
      people.some(p => p.EmployeeName === b.EmployeeName && p.IsActive === false)
    );
    inactiveBench.forEach(b => { if (!toDelete.includes(b.id)) toDelete.push(b.id); });

    for (const person of billable) {
      // Employment end: use person's EndDate if set, else Dec 31.
      // utcDateOnly() replaces the old local _parseDate helper — it returns a
      // UTC-midnight Date for the encoded calendar day and is documented for
      // exactly this case (never `new Date(str)` + setHours).
      const yearStart = new Date(Date.UTC(thisYear, 0, 1));

      const empEndRaw = utcDateOnly(person.EndDate);
      const empEnd = empEndRaw && empEndRaw < yearEnd ? empEndRaw : new Date(yearEnd);

      const empStartRaw = utcDateOnly(person.StartDate);
      const empStart = empStartRaw && empStartRaw > yearStart
        ? empStartRaw
        : new Date(yearStart);

      if (empStart > empEnd) continue;

      // Get all non-bench assignments for this person this year, sorted by start
      const customerAssignments = assignments
        .filter(a =>
          a.EmployeeName === person.EmployeeName &&
          a.AutoGenerated !== true &&
          a.StartDate && a.EndDate
        )
        .map(a => ({
          s: utcDateOnly(a.StartDate),
          e: utcDateOnly(a.EndDate),
        }))
        .filter(a => a.s <= empEnd && a.e >= empStart)
        .sort((a, b) => a.s - b.s);

      // Calculate gaps
      const gaps = [];
      let cursor = new Date(empStart);

      for (const ca of customerAssignments) {
        const assignStart = new Date(Math.max(ca.s, empStart));
        if (cursor < assignStart) {
          gaps.push({ from: new Date(cursor), to: new Date(assignStart - 86400000) });
        }
        const after = new Date(ca.e);
        after.setUTCDate(after.getUTCDate() + 1);
        if (after > cursor) cursor = after;
      }
      // Gap after last assignment to empEnd
      if (cursor <= empEnd) {
        gaps.push({ from: new Date(cursor), to: new Date(empEnd) });
      }

      // Use all gaps for the full year — past and future
      // This ensures historical bench records are preserved/regenerated correctly
      const clampedGaps = gaps;

      // Existing bench records for this person
      const personBench = existingBench.filter(
        a => a.EmployeeName === person.EmployeeName
      );
      
      // Determine which existing bench records are still valid
      for (const bench of personBench) {
        const bs = utcDateOnly(bench.StartDate);
        const be = utcDateOnly(bench.EndDate);
        const stillNeeded = clampedGaps.some(
          g => g.from.getTime() === bs.getTime() && g.to.getTime() === be.getTime()
        );
        if (!stillNeeded) toDelete.push(bench.id);
      }

      // Determine which gaps don't yet have a bench record
      for (const gap of clampedGaps) {
        const alreadyExists = personBench.some(b => {
          const bs = utcDateOnly(b.StartDate);
          const be = utcDateOnly(b.EndDate);
          return bs.getTime() === gap.from.getTime() && be.getTime() === gap.to.getTime();
        });
        if (!alreadyExists) {
          toCreate.push({
            EmployeeName:  person.EmployeeName,
            Level:         person.Level,
            Customer:      'Unassigned',
            ProjectType:   'Internal',
            StartDate:     spDateOut(gap.from),
            EndDate:       spDateOut(gap.to),
            Billed:        'No',
            Country:       person.Location || '',
            AutoGenerated: true,
          });
        }
      }
    }

    // Execute deletes then creates
    await Promise.all(toDelete.map(id => deleteItem('Assignments', id)));

    // Generate IDs for new records
    const allAssignments = await getAssignments({});
    let counter = allAssignments.length + 1;
    for (const fields of toCreate) {
      fields.AssignmentID = 'B-' + String(counter++).padStart(3, '0');
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
