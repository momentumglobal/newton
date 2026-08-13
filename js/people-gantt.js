// js/people-gantt.js — Deployment Timeline Gantt
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
  p => p.IsActive !== false && isBillableLevel(p.Level)
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
    const customer = (isForecastAssignment(a) || !a.Customer || a.Customer === 'Unassigned') ? BENCH_KEY : a.Customer;
    if (!customerMap[customer]) customerMap[customer] = {};
    if (!customerMap[customer][a.EmployeeName]) customerMap[customer][a.EmployeeName] = [];
    customerMap[customer][a.EmployeeName].push(a);
  });

  // Sort customers A-Z, bench last
  const customers = Object.keys(customerMap)
    .filter(c => c !== BENCH_KEY)
    .sort();
  if (customerMap[BENCH_KEY]) customers.push(BENCH_KEY);

  // Colour by project type — values are CSS tokens from style.css (N-116)
  const TYPE_COLOURS = CONFIG.PROJECT_TYPE_COLOUR_VARS;
  const typeColour = (t) => TYPE_COLOURS[t] || CONFIG.PROJECT_TYPE_COLOUR_FALLBACK;

  // Month headers
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthHeaders = MONTHS.map(m =>
    `<th class='print-avoid-break' style='text-align:center;font-size:11px;font-weight:600;
                color:var(--text-label);padding:6px 2px;min-width:52px;
                position:sticky;top:0;background:var(--surface)'>${m}</th>`
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
      const isFc     = isForecastAssignment(a);
      const startStr = new Date(a.StartDate).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
      const endStr   = new Date(a.EndDate).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
      const rate     = assignmentRateLabel(a);
      const tooltip  = `${escHtml(a.Customer || 'Unassigned')}${isFc ? ' (Forecast)' : ''} · ${rate} · ${startStr} – ${endStr}`;
      const bg = isFc
        ? 'repeating-linear-gradient(45deg,var(--c-stripe-amber-dark),var(--c-stripe-amber-dark) 5px,var(--c-stripe-amber-light) 5px,var(--c-stripe-amber-light) 10px)'
        : colour;
      return `<div title='${tooltip}' style='position:absolute;top:3px;bottom:3px;
        left:${leftPct}%;width:${widthPct}%;background:${bg};
        ${isFc ? 'border:1px solid var(--accent);' : ''}
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
        <div style='border-top:2px dashed var(--border-strong);margin:8px 0'></div>
      </td></tr>`;
    }

    // Customer header row
    rowsHtml += `<tr>
      <td colspan='14' style='padding:6px 8px 2px;font-size:12px;font-weight:700;
          color:var(--brand-tertiary);background:var(--surface-alt);border-top:1px solid var(--border)'>
        ${isBench ? 'Unassigned' : escHtml(customer)}
      </td>
    </tr>`;

    // Employee rows
    const employees = Object.keys(customerMap[customer]).sort((a, b) => {
      const aLevel = customerMap[customer][a][0]?.Level;
      const bLevel = customerMap[customer][b][0]?.Level;
      const l = levelSortIndex(aLevel) - levelSortIndex(bLevel);
      if (l !== 0) return l;
      return a.localeCompare(b);
    });
      employees.forEach(emp => {
      const empAssignments = customerMap[customer][emp];
      const level = empAssignments[0]?.Level || '—';
      const cells = MONTHS.map((_, i) => monthCell(empAssignments, i)).join('');
      rowsHtml += `<tr>
        <td style='padding:4px 8px;font-size:12px;width:180px;min-width:180px;overflow:hidden;
                   text-overflow:ellipsis;white-space:nowrap'>${escHtml(emp)}</td>
        <td style='padding:4px 8px;font-size:11px;color:var(--text-muted);width:50px;
                   min-width:50px;white-space:nowrap'>${escHtml(level)}</td>
        ${cells}
      </tr>`;
    });
  });

  // Legend
  const legend = Object.entries(TYPE_COLOURS).map(([type, colour]) =>
    `<div style='display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-label)'>
      <div style='width:14px;height:14px;border-radius:3px;background:${colour};flex-shrink:0'></div>
      ${type}
    </div>`
  ).join('') + `
    <div style='display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-label)'>
      <div style='width:14px;height:14px;border-radius:3px;flex-shrink:0;border:1px solid var(--accent);
        background:repeating-linear-gradient(45deg,var(--c-stripe-amber-dark),var(--c-stripe-amber-dark) 5px,var(--c-stripe-amber-light) 5px,var(--c-stripe-amber-light) 10px)'></div>
      Forecast
    </div>`;

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

  // People tied to a forecast are not deployable for the period it covers
  const _dpStart = _ganttDeployableMonth !== null ? new Date(year, _ganttDeployableMonth, 1) : yearStart;
  const _dpEnd   = _ganttDeployableMonth !== null ? new Date(year, _ganttDeployableMonth + 1, 0) : yearEnd;
  const forecastCovered = new Set(
    assignments.filter(a =>
      isForecastAssignment(a) && a.StartDate && a.EndDate &&
      new Date(a.StartDate) <= _dpEnd && new Date(a.EndDate) >= _dpStart
    ).map(a => a.EmployeeName)
  );

  // Find bench/unassigned assignments overlapping the selected month (or whole year)
  const deployable = assignments.filter(a => {
    if (isForecastAssignment(a)) return false;
    if (forecastCovered.has(a.EmployeeName)) return false;
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
  deployable
    .filter(a => { if (seen.has(a.EmployeeName)) return false; seen.add(a.EmployeeName); return true; })
    .sort((a, b) => {
      const l = levelSortIndex(a.Level) - levelSortIndex(b.Level);
      if (l !== 0) return l;
      return (a.EmployeeName || '').localeCompare(b.EmployeeName || '');
    })
    .forEach(a => {
      const person = peopleMap[a.EmployeeName] || {};
      deployableRows.push(`
        <tr>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(a.EmployeeName)}</td>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(a.Level || '—')}</td>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(person.ContractType || '—')}</td>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(person.Location || '—')}</td>
        </tr>`);
    });

    const deployableTile = `
    <div class='print-avoid-break' style='background:var(--surface);border:1px solid var(--border);border-radius:6px;
                padding:20px;margin-bottom:24px'>
      <div style='display:flex;align-items:center;justify-content:space-between;
                  flex-wrap:wrap;gap:12px;margin-bottom:16px'>
        <div>
          <div style='font-size:13px;font-weight:700;color:var(--brand-tertiary)'>
            Deployable Resources
            <span style='font-size:12px;font-weight:400;color:var(--text-muted);margin-left:8px'>
              ${deployableRows.length} available
            </span>
          </div>
          <div style='font-size:11px;color:var(--text-faint);margin-top:2px'>
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
        `<p style='font-size:13px;color:var(--text-muted);margin:0'>
          No unassigned employees during this period.</p>`
      }
    </div>`;

  main.innerHTML = `
<div class='page-header'>
      <h2>Deployment Timeline</h2>
      <div style='display:flex;align-items:center;gap:12px'>
        <label style='font-size:13px;color:var(--text-label)'>Year</label>
        <select onchange='_setGanttYear(+this.value)'>${yearOpts}</select>
        <button class='print-btn' onclick='printPage("Deployment Timeline", true, "People")'>⎙ Export PDF</button>
      </div>
    </div>
    ${deployableTile}
    <div style='display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px'>${legend}</div>
<div style='overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 200px);margin:0 -40px;padding:0 4px'>
    <table class='data-table' style='min-width:800px;table-layout:fixed'>
                <thead class='print-avoid-break' style='position:sticky;top:0;z-index:10;background:var(--surface)'><tr>
<th class='print-avoid-break' style='width:180px;min-width:180px;text-align:left;padding:6px 8px;font-size:11px;
                     font-weight:600;color:var(--text-label);position:sticky;top:0;background:var(--surface)'>Employee</th>
          <th class='print-avoid-break' style='width:50px;min-width:50px;text-align:left;padding:6px 8px;font-size:11px;
                     font-weight:600;color:var(--text-label);position:sticky;top:0;background:var(--surface)'>Level</th>
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
