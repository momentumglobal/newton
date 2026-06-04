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
  const rows = people.map(p => `
    <tr>
      <td>${p.EmployeeName}</td>
      <td>${p.Level || '—'}</td>
      <td>${p.ContractType || '—'}</td>
      <td>${p.Location || '—'}</td>
      <td>${p.StartDate ? p.StartDate.split('T')[0] : '—'}</td>
      <td>${p.EndDate   ? p.EndDate.split('T')[0]   : '—'}</td>
      <td><span class='badge badge-${p.IsActive ? 'active' : 'inactive'}'>${p.IsActive ? 'Active' : 'Inactive'}</span></td>
      ${canEdit ? `<td><div class='row-actions'><a href='#' onclick='showEditPersonForm(${p.id})'>Edit</a></div></td>` : ''}
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
  if (start) start.setHours(0,0,0,0);
  if (end)   end.setHours(0,0,0,0);
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
      ${canEdit ? `<td><div class='row-actions'><a href='#' onclick='showEditAssignmentForm(${a.id})'>Edit</a></div></td>` : ''}
    </tr>`).join('');

  _updateBenchSyncTimestamp();
  main.innerHTML = `
    <div class='page-header'>
      <h2>Employee Tracker</h2>
      <div style='display:flex;align-items:center;gap:12px'>
        ${canEdit ? "<button class='btn-primary' onclick='showAddAssignmentForm()'>+ Add Assignment</button>" : ''}
        ${canEdit ? `<button id='bench-sync-btn' class='btn-secondary' onclick='_syncBenchAssignments()'>↻ Sync Bench</button>
        <span id='bench-sync-time' style='font-size:12px;color:#888'></span>` : ''}
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

// ── Bench Sync ────────────────────────────────────────────────
async function _syncBenchAssignments() {
  const btn = document.getElementById('bench-sync-btn');
  if (btn) { btn.textContent = 'Syncing…'; btn.disabled = true; }

  try {
    const [people, assignments] = await Promise.all([
      getPeople(false),
      getAssignments({}),
    ]);

    const today    = new Date(); today.setHours(0,0,0,0);
    const thisYear = today.getFullYear();
    const yearEnd  = new Date(thisYear, 11, 31);

    // Only sync active employees at billable levels
    const billable = people.filter(p =>
      p.IsActive !== false && ['SDM','STP','TP'].includes(p.Level)
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
      // Employment end: use person's EndDate if set, else Dec 31
      const _parseDate = (str) => {
        if (!str) return null;
        const d = new Date(str.slice(0, 10));
        d.setHours(0,0,0,0);
        return d;
      };

      const empEndRaw = _parseDate(person.EndDate);
      const empEnd = empEndRaw && empEndRaw < yearEnd ? empEndRaw : new Date(yearEnd);
      empEnd.setHours(0,0,0,0);

      const empStartRaw = _parseDate(person.StartDate);
      const empStart = empStartRaw && empStartRaw > new Date(thisYear, 0, 1)
        ? empStartRaw
        : new Date(thisYear, 0, 1);
      empStart.setHours(0,0,0,0);

      if (empStart > empEnd) continue;

      // Get all non-bench assignments for this person this year, sorted by start
      const customerAssignments = assignments
        .filter(a =>
          a.EmployeeName === person.EmployeeName &&
          a.AutoGenerated !== true &&
          a.StartDate && a.EndDate
        )
        .map(a => ({
          s: new Date(a.StartDate.slice(0, 10)),
          e: new Date(a.EndDate.slice(0, 10)),
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
        after.setDate(after.getDate() + 1);
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
        const bs = new Date(bench.StartDate.slice(0, 10)); bs.setHours(0,0,0,0);
        const be = new Date(bench.EndDate.slice(0, 10));   be.setHours(0,0,0,0);
        const stillNeeded = clampedGaps.some(
          g => g.from.getTime() === bs.getTime() && g.to.getTime() === be.getTime()
        );
        if (!stillNeeded) toDelete.push(bench.id);
      }

      // Determine which gaps don't yet have a bench record
      for (const gap of clampedGaps) {
        const alreadyExists = personBench.some(b => {
          const bs = new Date(b.StartDate.slice(0, 10)); bs.setHours(0,0,0,0);
          const be = new Date(b.EndDate.slice(0, 10));   be.setHours(0,0,0,0);
          return bs.getTime() === gap.from.getTime() && be.getTime() === gap.to.getTime();
        });
        if (!alreadyExists) {
          toCreate.push({
            EmployeeName:  person.EmployeeName,
            Level:         person.Level,
            Customer:      'Unassigned',
            ProjectType:   'Internal',
            StartDate:     gap.from.toISOString().slice(0,10) + 'T12:00:00Z',
            EndDate:       gap.to.toISOString().slice(0,10)   + 'T12:00:00Z',
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
    alert('Sync failed: ' + e.message);
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

// ── Sales Forecast Utilisation helper ────────────
function _salesForecastUtil(monthIdx, salesForecasts, totalActiveHeadcount, assignmentForecastUtil) {
  const now      = new Date();
  const thisYear = now.getFullYear();
  const mStart   = new Date(thisYear, monthIdx, 1);
  const mEnd     = new Date(thisYear, monthIdx + 1, 0);

  // Additional headcount from sales forecasts overlapping this month
  const forecastedBilled = salesForecasts.reduce((sum, f) => {
    const s = new Date(f.ForecastStartDate);
    const e = new Date(f.ForecastEndDate);
    return (s <= mEnd && e >= mStart) ? sum + (f.ForecastedHeadcount || 0) : sum;
  }, 0);

  // Base is the existing assignment forecast util (already a 0-1 ratio)
  // Add sales headcount on top, expressed as a fraction of total headcount
  const base = assignmentForecastUtil || 0;
  const added = totalActiveHeadcount > 0 ? forecastedBilled / totalActiveHeadcount : 0;
  const combined = Math.min(base + added, 1.0);
  return combined > 0 ? combined : null;
}

// ── Team Utilisation Line Graph ───────────────────
function _renderUtilisationLineGraph(allRows, assignments, salesForecasts, totalActiveHeadcount) {
  const now       = new Date();
  const thisYear  = now.getFullYear();
  const curMonth  = now.getMonth(); // 0-based

  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // For forecast months, compute utilisation from assignments overlapping that month
  function _forecastUtil(monthIdx) {
    const mStart = new Date(thisYear, monthIdx, 1);
    const mEnd   = new Date(thisYear, monthIdx + 1, 0);
    // Find assignments active in this month
    const active = assignments.filter(a => {
      if (!a.StartDate || !a.EndDate) return false;
      const s = new Date(a.StartDate);
      const e = new Date(a.EndDate);
      return s <= mEnd && e >= mStart && a.Level !== 'CSD';
    });
    if (!active.length) return null;
    // Use capacity from existing rows if available, else estimate from assignment
    const billedCap = active.filter(a => a.Billed === 'Yes')
      .reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
    const totalCap  = active.reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
    return totalCap > 0 ? billedCap / totalCap : null;
  }

  const points = MONTH_LABELS.map((label, i) => {
    const monthRows = allRows.filter(r => r.Year === thisYear && r.Month === i + 1);
    let util;
    if (i <= curMonth) {
      // Actual: use computed monthly rows
      util = monthRows.length ? _calcUtilisation(monthRows) : null;
    } else {
      // Forecast: derive from assignment overlap
      util = _forecastUtil(i);
    }
    return { label, util, monthIdx: i };
  });

  const actualPoints   = points.filter(p => p.monthIdx <= curMonth);
  const forecastPoints = points.filter(p => p.monthIdx >= curMonth);

  const salesPoints = MONTH_LABELS.map((label, i) => {
    if (i < curMonth) return { label, util: null, monthIdx: i };
    // For current month, anchor to actual utilisation so lines share the same start point
    const baseUtil = i === curMonth
      ? (points.find(p => p.monthIdx === curMonth)?.util ?? _forecastUtil(i))
      : _forecastUtil(i);
    return { label, util: _salesForecastUtil(i, salesForecasts, totalActiveHeadcount, baseUtil), monthIdx: i };
  });
  
  const W = 900, H = 200;
  const PAD = { top: 10, right: 24, bottom: 32, left: 52 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  const xOf = (i) => PAD.left + (i / 11) * chartW;
  const yOf = (v) => PAD.top + chartH - (v * chartH);

  const gridLines = [0, 0.25, 0.5, 0.75, 1.0].map(v => {
    const y = yOf(v);
    return `
      <line x1='${PAD.left}' y1='${y}' x2='${W - PAD.right}' y2='${y}'
            stroke='#e8e8e8' stroke-width='1'/>
      <text x='${PAD.left - 6}' y='${y + 4}' text-anchor='end'
            font-size='10' fill='#999'>${(v * 100).toFixed(0)}%</text>`;
  }).join('');

  const xLabels = MONTH_LABELS.map((lbl, i) =>
    `<text x='${xOf(i)}' y='${PAD.top + chartH + 18}' text-anchor='middle'
           font-size='10' fill='#888'>${lbl}</text>`
  ).join('');

  const toPolyPoints = (pts) =>
    pts.filter(p => p.util !== null)
       .map(p => `${xOf(p.monthIdx).toFixed(1)},${yOf(p.util).toFixed(1)}`)
       .join(' ');

  const actualPts  = toPolyPoints(actualPoints);
  const actualLine = actualPts
    ? `<polyline points='${actualPts}' fill='none' stroke='#2E75B6' stroke-width='2.5' stroke-linejoin='round'/>`
    : '';

  const forecastPts  = toPolyPoints(forecastPoints);
  const forecastLine = forecastPts && forecastPts.includes(' ')
    ? `<polyline points='${forecastPts}' fill='none' stroke='#2E75B6' stroke-width='2'
                stroke-dasharray='5,4' stroke-linejoin='round' opacity='0.65'/>`
    : '';

  const salesForecastPts  = toPolyPoints(salesPoints);
  const salesForecastLine = salesForecastPts && salesForecastPts.includes(' ')
    ? `<polyline points='${salesForecastPts}' fill='none' stroke='#E8703A' stroke-width='2'
                stroke-dasharray='5,4' stroke-linejoin='round' opacity='0.85'/>`
    : '';
  
  const actualDots = actualPoints
    .filter(p => p.util !== null)
    .map(p => `
      <circle cx='${xOf(p.monthIdx).toFixed(1)}' cy='${yOf(p.util).toFixed(1)}'
              r='3.5' fill='#2E75B6' stroke='#fff' stroke-width='1.5'>
        <title>${p.label}: ${(p.util * 100).toFixed(1)}%</title>
      </circle>`).join('');

  const forecastDots = forecastPoints
    .filter(p => p.util !== null && p.monthIdx > curMonth)
    .map(p => `
      <circle cx='${xOf(p.monthIdx).toFixed(1)}' cy='${yOf(p.util).toFixed(1)}'
              r='3' fill='#fff' stroke='#2E75B6' stroke-width='2' opacity='0.7'>
        <title>${p.label}: ${(p.util * 100).toFixed(1)}% (forecast)</title>
      </circle>`).join('');

  const salesForecastDots = salesPoints
    .filter(p => p.util !== null && p.monthIdx >= curMonth)
    .map(p => `
      <circle cx='${xOf(p.monthIdx).toFixed(1)}' cy='${yOf(p.util).toFixed(1)}'
              r='3' fill='#fff' stroke='#E8703A' stroke-width='2' opacity='0.85'>
        <title>${p.label}: ${(p.util * 100).toFixed(1)}% (sales forecast)</title>
      </circle>`).join('');
  
  return `
    <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;
                padding:20px 20px 12px;margin-bottom:24px'>
      <div style='font-size:13px;font-weight:700;color:#1B3A5C;margin-bottom:8px'>
        Team Utilisation ${thisYear}</div>
      <svg viewBox='0 0 ${W} ${H}' style='width:100%;height:auto;display:block'
           xmlns='http://www.w3.org/2000/svg'>
        <rect x='${PAD.left}' y='${yOf(1.0)}' width='${chartW}'
              height='${yOf(0.85) - yOf(1.0)}'
              fill='#e6f4ea' opacity='0.6'/>
        <rect x='${PAD.left}' y='${yOf(0.85)}' width='${chartW}'
              height='${yOf(0.75) - yOf(0.85)}'
              fill='#fff3e0' opacity='0.6'/>
        <rect x='${PAD.left}' y='${yOf(0.75)}' width='${chartW}'
              height='${yOf(0) - yOf(0.75)}'
              fill='#fce8e8' opacity='0.6'/>
        ${gridLines}
        ${xLabels}
        ${actualLine}
        ${forecastLine}
        ${actualDots}
        ${forecastDots}
        ${salesForecastLine}
        ${salesForecastDots}
      </svg>
      <div style='display:flex;justify-content:center;gap:24px;margin-top:8px;font-size:11px;color:#555'>
        <div style='display:flex;align-items:center;gap:6px'>
          <svg width='24' height='2' style='overflow:visible'>
            <line x1='0' y1='1' x2='24' y2='1' stroke='#2E75B6' stroke-width='2.5'/>
          </svg>
          Actual
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <svg width='24' height='2' style='overflow:visible'>
            <line x1='0' y1='1' x2='24' y2='1' stroke='#2E75B6' stroke-width='2'
                  stroke-dasharray='5,4' opacity='0.65'/>
          </svg>
          Forecast
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <svg width='24' height='2' style='overflow:visible'>
            <line x1='0' y1='1' x2='24' y2='1' stroke='#E8703A' stroke-width='2'
                  stroke-dasharray='5,4' opacity='0.85'/>
          </svg>
          Sales Forecast
        </div>
      </div>
    </div>`;
}

// ── People Dashboard KPI Strip ────────────────────
function _kpiCard(label, value, sub, bg) {
  return `<div style='background:${bg || '#fff'};border:1px solid #e0e0e0;border-radius:6px;
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

// Last day of previous quarter
  const cq       = Math.floor(now.getMonth() / 3);
  const prevQEnd = new Date(cq === 0 ? thisY - 1 : thisY, cq === 0 ? 12 : cq * 3, 0);
  prevQEnd.setHours(0, 0, 0, 0);

  const countCustomers = (asOf) => new Set(
    assignments.filter(a => {
      const s = a.StartDate ? new Date(a.StartDate) : null;
      const e = a.EndDate   ? new Date(a.EndDate)   : null;
      return s && s <= asOf && (!e || e >= asOf)
        && a.Customer && a.Customer !== 'Unassigned';
    }).map(a => a.Customer)
  ).size;

  const countBilledHC = (asOf) => new Set(
    assignments.filter(a => {
      const s = a.StartDate ? new Date(a.StartDate) : null;
      const e = a.EndDate   ? new Date(a.EndDate)   : null;
      return a.Billed === 'Yes' && s && s <= asOf && (!e || e >= asOf);
    }).map(a => a.EmployeeName)
  ).size;

  const activeCustomers  = countCustomers(today);
  const prevQCustomers   = countCustomers(prevQEnd);
  const billedHeadcount  = countBilledHC(today);
  const prevQHeadcount   = countBilledHC(prevQEnd);

  const _delta = (curr, prev) => {
    const d = curr - prev;
    if (d === 0) return `<span style='color:#999;font-size:14px;margin-left:8px'>—</span>`;
    const colour = d > 0 ? '#2e7d32' : '#c62828';
    return `<span style='color:${colour};font-size:14px;margin-left:8px'>${d > 0 ? '+' : ''}${d}</span>`;
  };
  
  return `<div style='display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px'>
    ${_kpiCard('Estimated Revenue ' + thisY,   _fmtGBP(revYTD),   'Current year YTD')}
    ${_kpiCard('Utilisation ' + thisY,      _fmtPct(utilYTD),  'Current year YTD',
        utilYTD >= 0.85 ? '#e6f4ea' : utilYTD >= 0.75 ? '#fff3e0' : '#fce8e8')}
    ${_kpiCard('Active Customers',  activeCustomers  + _delta(activeCustomers, prevQCustomers),  'As of today · vs last quarter')}
    ${_kpiCard('Billed Headcount',  billedHeadcount  + _delta(billedHeadcount, prevQHeadcount),  'As of today · vs last quarter')}
  </div>`;
}

// Panel 1 - Team Utilisation
function _renderUtilisationPanel(rows, people) {
  const levelOrder = { SDM: 1, STP: 2, TP: 3 };
  const bands = ['SDM','STP','TP'];
  const bandRows = bands.map(band => {
    const r        = rows.filter(r => r.Level === band);
    const u        = _calcUtilisation(r);
    // Headcount from assignment rows for the selected period (not today's people list)
    const total    = new Set(r.map(r => r.EmployeeName)).size;
    const utilised = new Set(r.filter(r => r.Billed === 'Yes').map(r => r.EmployeeName)).size;
    return { band, u, utilised, total };
  }).filter(b => b.total > 0);
  const totalUtil     = _calcUtilisation(rows);
  const totalActive   = new Set(rows.filter(r => ['SDM','STP','TP'].includes(r.Level)).map(r => r.EmployeeName)).size;
  const totalUtilised = new Set(rows.filter(r => r.Billed === 'Yes' && ['SDM','STP','TP'].includes(r.Level)).map(r => r.EmployeeName)).size;
  const bandTableRows = bandRows.map(b => `
    <tr>
      <td>${b.band}</td>
      <td>${_fmtPct(b.u)}</td>
      <td>${b.utilised} / ${b.total}</td>
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
          <td>${totalUtilised} / ${totalActive}</td>
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
  const typeOrder = ['Embedded','CoE','Transformation','LCI'];
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
          <thead><tr><th>Customer</th><th>Estimated Revenue</th></tr></thead>
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
          <thead><tr><th>Project Type</th><th>Estimated Revenue</th></tr></thead>
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

// Panel 4 - Upcoming End Dates
function _renderEndDatesPanel(people) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in60  = new Date(today); in60.setDate(today.getDate() + 60);
  const in30  = new Date(today); in30.setDate(today.getDate() + 30);

  const upcoming = people
    .filter(p => {
      if (!p.EndDate || p.IsActive === false) return false;
      const end = new Date(p.EndDate); end.setHours(0, 0, 0, 0);
      return end >= today && end <= in60;
    })
    .map(p => ({ ...p, _end: new Date(p.EndDate) }))
    .sort((a, b) => a._end - b._end);

  if (!upcoming.length) {
    return `<p style='font-size:13px;color:#888'>No employee end dates in the next 60 days.</p>`;
  }

  const rows = upcoming.map(p => {
    const end     = p._end; end.setHours(0, 0, 0, 0);
    const days    = Math.round((end - today) / 86400000);
    const bg      = days <= 30 ? '#fce8e8' : '#fff3e0';
    const dateStr = end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return `<tr>
      <td style='background:${bg}'>${p.EmployeeName}</td>
      <td style='background:${bg}'>${p.Level || '—'}</td>
      <td style='background:${bg}'>${dateStr}</td>
      <td style='background:${bg}'>${days} days</td>
    </tr>`;
  }).join('');

  return `
    <table class='data-table'>
      <thead><tr>
        <th>Employee</th><th>Level</th><th>End Date</th><th>Days Remaining</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Deployment Timeline Gantt ────────────────────
async function renderDeploymentTimeline() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading deployment timeline...</p>';

const [assignments, people, salesForecasts] = await Promise.all([
  getAssignments({}),
  getPeople(false),
  getSalesForecasts(),
]);

const totalActiveHeadcount = people.filter(
  p => p.IsActive !== false && ['SDM', 'STP', 'TP'].includes(p.Level)
).length;

  _ganttYear = _ganttYear || new Date().getFullYear();
  const year = _ganttYear;

  // Build people lookup for IsActive
  const peopleMap = {};
  people.forEach(p => { peopleMap[p.EmployeeName] = p; });

  // Filter assignments overlapping the selected year
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year, 11, 31);

  const relevant = assignments.filter(a => {
    if (!a.StartDate || !a.EndDate) return false;
    const s = new Date(a.StartDate);
    const e = new Date(a.EndDate);
    return s <= yearEnd && e >= yearStart;
  });

  // Group by customer, then employee
  const BENCH_KEY = '__bench__';
  const customerMap = {};
  relevant.forEach(a => {
    const customer = (!a.Customer || a.Customer === 'Unassigned') ? BENCH_KEY : a.Customer;
    if (!customerMap[customer]) customerMap[customer] = {};
    if (!customerMap[customer][a.EmployeeName]) customerMap[customer][a.EmployeeName] = [];
    customerMap[customer][a.EmployeeName].push(a);
  });

  // Sort customers A-Z, bench last
  const customers = Object.keys(customerMap)
    .filter(c => c !== BENCH_KEY)
    .sort();
  if (customerMap[BENCH_KEY]) customers.push(BENCH_KEY);

  // Colour by project type
  const TYPE_COLOURS = {
    'Embedded':       '#2E75B6',
    'CoE':            '#2e7d32',
    'Transformation': '#e65100',
    'LCI':            '#6a1b9a',
    'Internal':       '#888',
  };
  const typeColour = (t) => TYPE_COLOURS[t] || '#aaa';

  // Month headers
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthHeaders = MONTHS.map(m =>
    `<th style='text-align:center;font-size:11px;font-weight:600;
                color:#555;padding:6px 2px;min-width:52px;
                position:sticky;top:0;background:#fff'>${m}</th>`
  ).join('');

  // Build a bar cell for a month given a list of assignments
  const monthCell = (empAssignments, monthIdx) => {
    const mStart = new Date(year, monthIdx, 1);
    const mEnd   = new Date(year, monthIdx + 1, 0);
    const overlapping = empAssignments.filter(a => {
      const s = new Date(a.StartDate);
      const e = new Date(a.EndDate);
      return s <= mEnd && e >= mStart;
    });
    if (!overlapping.length) return `<td style='padding:2px'></td>`;

    const bars = overlapping.map(a => {
      const s      = new Date(a.StartDate);
      const e      = new Date(a.EndDate);
      const segStart = s > mStart ? s : mStart;
      const segEnd   = e < mEnd   ? e : mEnd;
      const daysInMonth = mEnd.getDate();
      const startDay    = segStart.getDate();
      const endDay      = segEnd.getDate();
      const leftPct  = ((startDay - 1) / daysInMonth * 100).toFixed(1);
      const widthPct = ((endDay - startDay + 1) / daysInMonth * 100).toFixed(1);
      const colour   = typeColour(a.ProjectType);
      const startStr = new Date(a.StartDate).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
      const endStr   = new Date(a.EndDate).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
      const rate     = a.MonthlyBillRate ? '£' + Number(a.MonthlyBillRate).toLocaleString('en-GB') : '—';
      const tooltip  = `${a.Customer || 'Unassigned'} · ${rate} · ${startStr} – ${endStr}`;
      return `<div title='${tooltip}' style='position:absolute;top:3px;bottom:3px;
        left:${leftPct}%;width:${widthPct}%;background:${colour};
        border-radius:3px;cursor:default'></div>`;
    }).join('');

    return `<td style='padding:2px;position:relative'>
      <div style='position:relative;height:22px'>${bars}</div>
    </td>`;
  };

  // Build rows
  let rowsHtml = '';
  customers.forEach((customer, ci) => {
    const isBench = customer === BENCH_KEY;

    // Bench divider
    if (isBench && ci > 0) {
      rowsHtml += `<tr><td colspan='14' style='padding:0'>
        <div style='border-top:2px dashed #ccc;margin:8px 0'></div>
      </td></tr>`;
    }

    // Customer header row
    rowsHtml += `<tr>
      <td colspan='14' style='padding:6px 8px 2px;font-size:12px;font-weight:700;
          color:#1B3A5C;background:#f5f7fa;border-top:1px solid #e0e0e0'>
        ${isBench ? 'Unassigned / Bench' : customer}
      </td>
    </tr>`;

    // Employee rows
const levelOrder = { CSD: 0, SDM: 1, STP: 2, TP: 3 };
    const employees = Object.keys(customerMap[customer]).sort((a, b) => {
      const aLevel = customerMap[customer][a][0]?.Level;
      const bLevel = customerMap[customer][b][0]?.Level;
      const l = (levelOrder[aLevel] ?? 99) - (levelOrder[bLevel] ?? 99);
      if (l !== 0) return l;
      return a.localeCompare(b);
    });
      employees.forEach(emp => {
      const empAssignments = customerMap[customer][emp];
      const level = empAssignments[0]?.Level || '—';
      const cells = MONTHS.map((_, i) => monthCell(empAssignments, i)).join('');
      rowsHtml += `<tr>
        <td style='padding:4px 8px;font-size:12px;width:180px;min-width:180px;overflow:hidden;
                   text-overflow:ellipsis;white-space:nowrap'>${emp}</td>
        <td style='padding:4px 8px;font-size:11px;color:#888;width:50px;
                   min-width:50px;white-space:nowrap'>${level}</td>
        ${cells}
      </tr>`;
    });
  });

  // Legend
  const legend = Object.entries(TYPE_COLOURS).map(([type, colour]) =>
    `<div style='display:flex;align-items:center;gap:6px;font-size:12px;color:#555'>
      <div style='width:14px;height:14px;border-radius:3px;background:${colour};flex-shrink:0'></div>
      ${type}
    </div>`
  ).join('');

  // Year selector
  const thisY = new Date().getFullYear();
  const yearOpts = [thisY - 1, thisY, thisY + 1].map(y =>
    `<option value='${y}' ${y === year ? 'selected' : ''}>${y}</option>`
  ).join('');

  // ── Deployable Resources tile ─────────────────────────────
  const deployMonthOpts = `<option value=''>All months</option>` +
    MONTHS.map((m, i) =>
      `<option value='${i}' ${_ganttDeployableMonth === i ? 'selected' : ''}>${m}</option>`
    ).join('');

  // Find bench/unassigned assignments overlapping the selected month (or whole year)
  const deployable = assignments.filter(a => {
    if (a.Billed === 'Yes') return false;
    if (a.Level === 'CSD') return false;
    if (!a.StartDate || !a.EndDate) return false;
    const s = new Date(a.StartDate);
    const e = new Date(a.EndDate);
    if (_ganttDeployableMonth !== null) {
      const mStart = new Date(year, _ganttDeployableMonth, 1);
      const mEnd   = new Date(year, _ganttDeployableMonth + 1, 0);
      return s <= mEnd && e >= mStart;
    }
    return s <= yearEnd && e >= yearStart;
  });

  // Deduplicate by employee — one row per person
  const seen = new Set();
  const deployableRows = [];
  const levelOrder2 = { SDM: 1, STP: 2, TP: 3, CSD: 0 };
  deployable
    .filter(a => { if (seen.has(a.EmployeeName)) return false; seen.add(a.EmployeeName); return true; })
    .sort((a, b) => {
      const l = (levelOrder2[a.Level] ?? 99) - (levelOrder2[b.Level] ?? 99);
      if (l !== 0) return l;
      return (a.EmployeeName || '').localeCompare(b.EmployeeName || '');
    })
    .forEach(a => {
      const person = peopleMap[a.EmployeeName] || {};
      deployableRows.push(`
        <tr>
          <td style='padding:6px 10px;font-size:12px'>${a.EmployeeName}</td>
          <td style='padding:6px 10px;font-size:12px'>${a.Level || '—'}</td>
          <td style='padding:6px 10px;font-size:12px'>${person.ContractType || '—'}</td>
          <td style='padding:6px 10px;font-size:12px'>${person.Location || '—'}</td>
        </tr>`);
    });

  const deployableTile = `
    <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;
                padding:20px;margin-bottom:24px'>
      <div style='display:flex;align-items:center;justify-content:space-between;
                  flex-wrap:wrap;gap:12px;margin-bottom:16px'>
        <div>
          <div style='font-size:13px;font-weight:700;color:#1B3A5C'>
            Deployable Resources
            <span style='font-size:12px;font-weight:400;color:#888;margin-left:8px'>
              ${deployableRows.length} available
            </span>
          </div>
          <div style='font-size:11px;color:#aaa;margin-top:2px'>
            Employees on bench / unbilled during the selected period
          </div>
        </div>
        <div class='form-group' style='margin:0;min-width:140px'>
          <select onchange='_setGanttDeployableMonth(this.value)'
                  style='font-size:12px'>
            ${deployMonthOpts}
          </select>
        </div>
      </div>
      ${deployableRows.length ? `
        <table class='data-table'>
          <thead><tr>
            <th>Employee</th><th>Level</th><th>Contract</th><th>Location</th>
          </tr></thead>
          <tbody>${deployableRows.join('')}</tbody>
        </table>` :
        `<p style='font-size:13px;color:#888;margin:0'>
          No unassigned employees during this period.</p>`
      }
    </div>`;

  main.innerHTML = `
<div class='page-header'>
      <h2>Deployment Timeline</h2>
      <div style='display:flex;align-items:center;gap:12px'>
        <label style='font-size:13px;color:#555'>Year</label>
        <select onchange='_setGanttYear(+this.value)'>${yearOpts}</select>
        <button class='print-btn' onclick='printPage("Deployment Timeline", true, "People")'>⎙ Export PDF</button>
      </div>
    </div>
    ${deployableTile}
    <div style='display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px'>${legend}</div>
<div style='overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 200px);margin:0 -40px;padding:0 4px'>
    <table class='data-table' style='min-width:800px;table-layout:fixed'>
        <thead style='position:sticky;top:0;z-index:10;background:#fff'><tr>
<th style='width:180px;min-width:180px;text-align:left;padding:6px 8px;font-size:11px;
                     font-weight:600;color:#555;position:sticky;top:0;background:#fff'>Employee</th>
          <th style='width:50px;min-width:50px;text-align:left;padding:6px 8px;font-size:11px;
                     font-weight:600;color:#555;position:sticky;top:0;background:#fff'>Level</th>
          ${monthHeaders}
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

let _ganttYear = new Date().getFullYear();
let _ganttDeployableMonth = new Date().getMonth(); // default to current month

async function _setGanttYear(year) {
  _ganttYear = year;
  await renderDeploymentTimeline();
}

async function _setGanttDeployableMonth(value) {
  _ganttDeployableMonth = value !== '' ? +value : null;
  await renderDeploymentTimeline();
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
  <div class='row-actions' style='gap:12px'>
    <a href='#' onclick='showEditInvoiceForm(${inv.id})'>Edit</a>
    ${markPaidBtn ? ' · ' + markPaidBtn : ''}
    · <button class='btn-danger' onclick='deleteInvoice(${inv.id})'>Delete</button>
  </div>
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

  const [assignments, people, salesForecasts] = await Promise.all([
    getAssignments({}),
    getPeople(false),
    getSalesForecasts(),
  ]);

  const totalActiveHeadcount = people.filter(
    p => p.IsActive !== false && ['SDM', 'STP', 'TP'].includes(p.Level)
  ).length;

  const allRows = computeMonthlyRows(assignments);

const { start, end } = _dashDateRange();
  const periodRows = _rowsInRange(allRows, start, end);
  const kpiStrip     = await _renderKPIStrip(allRows, people, assignments);
  const utilLineGraph = _renderUtilisationLineGraph(allRows, assignments, salesForecasts, totalActiveHeadcount);
  const utilisPanel  = _renderUtilisationPanel(periodRows, people);
  const revenuePanel = _renderRevenuePanel(periodRows);
  const segmentPanel = _renderSegmentationPanel(people);
  const endDatesPanel = _renderEndDatesPanel(people);
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
<div class='page-header'>
      <h2>People Dashboard</h2>
      <button class='print-btn' onclick='printPage("People Dashboard", false, "People")'>⎙ Export PDF</button>
    </div>

    ${kpiStrip}

    ${utilLineGraph}

 <div style='margin-bottom:24px'>${periodBtns}</div>

    <div style='display:grid;grid-template-columns:40fr 60fr;gap:24px;margin-bottom:32px'>
      <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px'>
        ${utilisPanel}
      </div>
      <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px'>
        <div class='page-header' style='margin-bottom:12px'>
          <h3 style='margin:0;color:#1B3A5C'>Estimated Revenue</h3>
        </div>
        ${revenuePanel}
      </div>
    </div>

   <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px'>
      <div class='page-header' style='margin-bottom:12px'>
        <h3 style='margin:0;color:#1B3A5C'>Workforce Segmentation</h3>
      </div>
      ${segmentPanel}
    </div>
    <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px;margin-top:24px'>
      <div class='page-header' style='margin-bottom:12px'>
        <h3 style='margin:0;color:#1B3A5C'>Upcoming Employee End Dates</h3>
      </div>
      ${endDatesPanel}
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
