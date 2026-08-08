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
      const isFc     = isForecastAssignment(a);
      const startStr = new Date(a.StartDate).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
      const endStr   = new Date(a.EndDate).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
      const rate     = a.MonthlyBillRate ? '£' + Number(a.MonthlyBillRate).toLocaleString('en-GB') : '—';
      const tooltip  = `${escHtml(a.Customer || 'Unassigned')}${isFc ? ' (Forecast)' : ''} · ${rate} · ${startStr} – ${endStr}`;
      const bg = isFc
        ? 'repeating-linear-gradient(45deg,#FAD9BC,#FAD9BC 5px,#FDF0E3 5px,#FDF0E3 10px)'
        : colour;
      return `<div title='${tooltip}' style='position:absolute;top:3px;bottom:3px;
        left:${leftPct}%;width:${widthPct}%;background:${bg};
        ${isFc ? 'border:1px solid #E8703A;' : ''}
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
        ${isBench ? 'Unassigned' : escHtml(customer)}
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
                   text-overflow:ellipsis;white-space:nowrap'>${escHtml(emp)}</td>
        <td style='padding:4px 8px;font-size:11px;color:#888;width:50px;
                   min-width:50px;white-space:nowrap'>${escHtml(level)}</td>
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
  ).join('') + `
    <div style='display:flex;align-items:center;gap:6px;font-size:12px;color:#555'>
      <div style='width:14px;height:14px;border-radius:3px;flex-shrink:0;border:1px solid #E8703A;
        background:repeating-linear-gradient(45deg,#FAD9BC,#FAD9BC 5px,#FDF0E3 5px,#FDF0E3 10px)'></div>
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
          <td style='padding:6px 10px;font-size:12px'>${escHtml(a.EmployeeName)}</td>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(a.Level || '—')}</td>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(person.ContractType || '—')}</td>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(person.Location || '—')}</td>
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
