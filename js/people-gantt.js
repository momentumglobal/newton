// js/people-gantt.js — Deployment Timeline Gantt
// ── Deployment Timeline Gantt ────────────────────
async function renderDeploymentTimeline() {
  const main = document.getElementById('main-content');
  main.innerHTML = skeletonPanel(10);

const [assignments, people, salesForecasts] = await Promise.all([
  getAssignments({}),
  getPeople(false),
  getSalesForecasts(),
]);

const totalActiveHeadcount = activeDeployableCount(people);   // N-304 / N-399

  _ganttYear = _ganttYear || new Date().getFullYear();
  const year = _ganttYear;

  // Filter assignments overlapping the selected year, then group into lanes
  const { relevant } = _ganttComputeWindow(assignments, year);
  const lanes = _ganttBuildLanes(relevant);

  // Colour by project type — values are CSS tokens from style.css (N-116)
  const typeColour = (t) => CONFIG.PROJECT_TYPE_COLOUR_VARS[t] || CONFIG.PROJECT_TYPE_COLOUR_FALLBACK;

  const monthHeaders = _ganttMonthHeadersHtml();
  const rowsHtml = _ganttRowsHtml(lanes, year, typeColour);
  const legend = _ganttLegendHtml();
  const deployableTile = _ganttDeployableTileHtml(ganttDeployableRows(assignments, people, { year, month: _ganttDeployableMonth }), _ganttDeployableMonth);

  // Year selector
  const thisY = new Date().getFullYear();
  const yearOpts = [thisY - 1, thisY, thisY + 1].map(y =>
    `<option value='${y}' ${y === year ? 'selected' : ''}>${y}</option>`
  ).join('');

  main.innerHTML = `
<div class='page-header'>
      <h2>Deployment Timeline</h2>
      <div style='display:flex;align-items:center;gap:12px'>
        <label class='ppl-year-label'>Year</label>
        <select${actOn('change', 'ganttYearChanged', ACT_VALUE)}>${yearOpts}</select>
        <button class='print-btn'${act('printPage', 'Deployment Timeline', true, 'People')}>⎙ Export PDF</button>
      </div>
    </div>
    ${deployableTile}
    <div style='display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px'>${legend}</div>
<div class='table-scroll' style='max-height:calc(100vh - 200px);margin:0 -40px;padding:0 4px'>
    <table class='data-table' style='min-width:800px;table-layout:fixed'>
                <thead class='print-avoid-break'><tr>
<th class='print-avoid-break gt-head-th gt-head-th--emp'>Employee</th>
          <th class='print-avoid-break gt-head-th gt-head-th--lvl'>Level</th>
          ${monthHeaders}
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
  if (window.lucide) lucide.createIcons();   // N-417: the "no unassigned employees" icon
}

const _GANTT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function _ganttMonthHeadersHtml() {
  return _GANTT_MONTHS.map(m =>
    `<th class='print-avoid-break gt-month-th'>${m}</th>`
  ).join('');
}

// A bar cell for one month, given one person's assignments
function _ganttMonthCellHtml(empAssignments, year, monthIdx, typeColour) {
  const overlapping = ganttMonthAssignments(empAssignments, year, monthIdx);
  if (!overlapping.length) return `<td style='padding:2px'></td>`;

  const { mStart, mEnd } = ganttMonthRange(year, monthIdx);
  const bars = overlapping.map(a => _ganttRenderBar(a, mStart, mEnd, typeColour)).join('');

  return `<td style='padding:2px;position:relative'>
      <div style='position:relative;height:22px'>${bars}</div>
    </td>`;
}

// Customer header, employee and bench-divider rows
function _ganttRowsHtml(lanes, year, typeColour) {
  let rowsHtml = '';
  lanes.forEach((lane, ci) => {
    const { customer, isBench, employees } = lane;

    // Bench divider
    if (isBench && ci > 0) {
      rowsHtml += `<tr><td colspan='14' style='padding:0'>
        <div class='gt-bench-divider'></div>
      </td></tr>`;
    }

    // Customer header row
    rowsHtml += `<tr>
      <td colspan='14' class='gt-cust-row'>
        ${isBench ? 'Unassigned' : escHtml(customer)}
      </td>
    </tr>`;

    // Employee rows
    employees.forEach(({ name: emp, level, assignments: empAssignments }) => {
      const cells = _GANTT_MONTHS.map((_, i) => _ganttMonthCellHtml(empAssignments, year, i, typeColour)).join('');
      rowsHtml += `<tr>
        <td style='padding:4px 8px;font-size:12px;width:180px;min-width:180px;overflow:hidden;
                   text-overflow:ellipsis;white-space:nowrap'>${escHtml(emp)}</td>
        <td class='gt-level-cell'>${escHtml(level)}</td>
        ${cells}
      </tr>`;
    });
  });
  return rowsHtml;
}

function _ganttLegendHtml() {
  return Object.entries(CONFIG.PROJECT_TYPE_COLOUR_VARS).map(([type, colour]) =>
    `<div class='gt-legend-item'>
      <div class='gt-swatch' style='background:${colour}'></div>
      ${type}
    </div>`
  ).join('') + `
    <div class='gt-legend-item'>
      <div class='gt-swatch gt-swatch--forecast'></div>
      Forecast
    </div>`;
}

// ── Deployable Resources tile ─────────────────────────────
function _ganttDeployableTileHtml(rows, month) {
  const deployMonthOpts = `<option value=''>All months</option>` +
    _GANTT_MONTHS.map((m, i) =>
      `<option value='${i}' ${month === i ? 'selected' : ''}>${m}</option>`
    ).join('');

  const deployableRows = rows.map(r => `
        <tr>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(r.name)}</td>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(r.level)}</td>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(r.contract)}</td>
          <td style='padding:6px 10px;font-size:12px'>${escHtml(r.location)}</td>
        </tr>`);

    return `
    <div class='print-avoid-break ppl-card ppl-card--mb'>
      <div style='display:flex;align-items:center;justify-content:space-between;
                  flex-wrap:wrap;gap:12px;margin-bottom:16px'>
        <div>
          <div class='ppl-card-title ppl-card-title--flush'>
            Deployable Resources
            <span class='ppl-card-title-sub'>
              ${deployableRows.length} available
            </span>
          </div>
          <div class='ppl-card-hint'>
            Employees on bench / unbilled during the selected period
          </div>
        </div>
        <div class='form-group' style='margin:0;min-width:140px'>
          <select${actOn('change', '_setGanttDeployableMonth', ACT_VALUE)}
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
        emptyStateBlock({ icon: 'users', message: 'No unassigned employees during this period.', variant: 'compact' })
      }
    </div>`;
}

// Pure per-assignment bar geometry/markup for one month cell (N-239a)
function _ganttRenderBar(a, mStart, mEnd, typeColour) {
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

// N-302c: delegated actions for the timeline selectors (js/actions.js). The year
// select passed +this.value, so the wrapper keeps the numeric coercion.
registerActions({
  ganttYearChanged: (value) => _setGanttYear(+value),
  _setGanttDeployableMonth,
});
