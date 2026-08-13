// js/people-dashboard.js — People Dashboard
// ── People Dashboard state ────────────────────────────────────
let _dashFilter = {
  year:    new Date().getFullYear(),
  month:   new Date().getMonth(),   // 0-based; null = no month filter
  quarter: null,                     // 1–4; null = no quarter filter
};

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
      if (isForecastAssignment(a)) return false;
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
            stroke='var(--c-gray-115)' stroke-width='1'/>
      <text x='${PAD.left - 6}' y='${y + 4}' text-anchor='end'
            font-size='10' fill='var(--c-gray-450)'>${(v * 100).toFixed(0)}%</text>`;
  }).join('');

  const xLabels = MONTH_LABELS.map((lbl, i) =>
    `<text x='${xOf(i)}' y='${PAD.top + chartH + 18}' text-anchor='middle'
           font-size='10' fill='var(--c-gray-500)'>${lbl}</text>`
  ).join('');

  const toPolyPoints = (pts) =>
    pts.filter(p => p.util !== null)
       .map(p => `${xOf(p.monthIdx).toFixed(1)},${yOf(p.util).toFixed(1)}`)
       .join(' ');

  const actualPts  = toPolyPoints(actualPoints);
  const actualLine = actualPts
    ? `<polyline points='${actualPts}' fill='none' stroke='var(--c-ptype-embedded)' stroke-width='2.5' stroke-linejoin='round'/>`
    : '';

  const forecastPts  = toPolyPoints(forecastPoints);
  const forecastLine = forecastPts && forecastPts.includes(' ')
    ? `<polyline points='${forecastPts}' fill='none' stroke='var(--c-ptype-embedded)' stroke-width='2'
                stroke-dasharray='5,4' stroke-linejoin='round' opacity='0.65'/>`
    : '';

  const salesForecastPts  = toPolyPoints(salesPoints);
  const salesForecastLine = salesForecastPts && salesForecastPts.includes(' ')
    ? `<polyline points='${salesForecastPts}' fill='none' stroke='var(--c-accent)' stroke-width='2'
                stroke-dasharray='5,4' stroke-linejoin='round' opacity='0.85'/>`
    : '';
  
  const actualDots = actualPoints
    .filter(p => p.util !== null)
    .map(p => `
      <circle cx='${xOf(p.monthIdx).toFixed(1)}' cy='${yOf(p.util).toFixed(1)}'
              r='3.5' fill='var(--c-ptype-embedded)' stroke='var(--c-white)' stroke-width='1.5'>
        <title>${p.label}: ${(p.util * 100).toFixed(1)}%</title>
      </circle>`).join('');

  const forecastDots = forecastPoints
    .filter(p => p.util !== null && p.monthIdx > curMonth)
    .map(p => `
      <circle cx='${xOf(p.monthIdx).toFixed(1)}' cy='${yOf(p.util).toFixed(1)}'
              r='3' fill='var(--c-white)' stroke='var(--c-ptype-embedded)' stroke-width='2' opacity='0.7'>
        <title>${p.label}: ${(p.util * 100).toFixed(1)}% (forecast)</title>
      </circle>`).join('');

  const salesForecastDots = salesPoints
    .filter(p => p.util !== null && p.monthIdx >= curMonth)
    .map(p => `
      <circle cx='${xOf(p.monthIdx).toFixed(1)}' cy='${yOf(p.util).toFixed(1)}'
              r='3' fill='var(--c-white)' stroke='var(--c-accent)' stroke-width='2' opacity='0.85'>
        <title>${p.label}: ${(p.util * 100).toFixed(1)}% (sales forecast)</title>
      </circle>`).join('');
  
  return `
    <div class='print-avoid-break' style='background:var(--c-white);border:1px solid var(--c-gray-150);border-radius:6px;
                padding:20px 20px 12px;margin-bottom:24px'>
      <div style='font-size:13px;font-weight:700;color:var(--c-navy-steel);margin-bottom:8px'>
        Team Utilisation ${thisYear}</div>
      <svg viewBox='0 0 ${W} ${H}' style='width:100%;height:auto;display:block'
           xmlns='http://www.w3.org/2000/svg'>
        <rect x='${PAD.left}' y='${yOf(1.0)}' width='${chartW}'
           height='${yOf(CONFIG.UTILISATION_THRESHOLDS.green) - yOf(1.0)}'
           fill='var(--c-success-bg-alt)' opacity='0.6'/>
      <rect x='${PAD.left}' y='${yOf(CONFIG.UTILISATION_THRESHOLDS.green)}' width='${chartW}'
           height='${yOf(CONFIG.UTILISATION_THRESHOLDS.amber) - yOf(CONFIG.UTILISATION_THRESHOLDS.green)}'
           fill='var(--c-warn-bg-soft)' opacity='0.6'/>
      <rect x='${PAD.left}' y='${yOf(CONFIG.UTILISATION_THRESHOLDS.amber)}' width='${chartW}'
           height='${yOf(0) - yOf(CONFIG.UTILISATION_THRESHOLDS.amber)}'
           fill='var(--c-danger-bg-alt)' opacity='0.6'/>
        ${gridLines}
        ${xLabels}
        ${actualLine}
        ${forecastLine}
        ${actualDots}
        ${forecastDots}
        ${salesForecastLine}
        ${salesForecastDots}
      </svg>
      <div style='display:flex;justify-content:center;gap:24px;margin-top:8px;font-size:11px;color:var(--c-gray-700)'>
        <div style='display:flex;align-items:center;gap:6px'>
          <svg width='24' height='2' style='overflow:visible'>
            <line x1='0' y1='1' x2='24' y2='1' stroke='var(--c-ptype-embedded)' stroke-width='2.5'/>
          </svg>
          Actual
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <svg width='24' height='2' style='overflow:visible'>
            <line x1='0' y1='1' x2='24' y2='1' stroke='var(--c-ptype-embedded)' stroke-width='2'
                  stroke-dasharray='5,4' opacity='0.65'/>
          </svg>
          Forecast
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <svg width='24' height='2' style='overflow:visible'>
            <line x1='0' y1='1' x2='24' y2='1' stroke='var(--c-accent)' stroke-width='2'
                  stroke-dasharray='5,4' opacity='0.85'/>
          </svg>
          Sales Forecast
        </div>
      </div>
    </div>`;
}

// ── People Dashboard KPI Strip ────────────────────
function _kpiCard(label, value, sub, bg) {
  return `<div style='background:${bg || 'var(--c-white)'};border:1px solid var(--c-gray-150);border-radius:6px;
                      padding:16px 20px;min-width:160px;flex:1'>
    <div style='font-size:11px;font-weight:700;text-transform:uppercase;
                color:var(--c-gray-600);letter-spacing:.05em;margin-bottom:6px'>${label}</div>
    <div style='font-size:24px;font-weight:700;color:var(--c-navy-steel)'>${value}</div>
    ${sub ? `<div style='font-size:12px;color:var(--c-gray-500);margin-top:4px'>${sub}</div>` : ''}
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
      return !isForecastAssignment(a)
        && s && s <= asOf && (!e || e >= asOf)
        && a.Customer && a.Customer !== 'Unassigned';
    }).map(a => a.Customer)
  ).size;

  const countBilledHC = (asOf) => new Set(
    assignments.filter(a => {
      const s = a.StartDate ? new Date(a.StartDate) : null;
      const e = a.EndDate   ? new Date(a.EndDate)   : null;
      return !isForecastAssignment(a) && a.Billed === 'Yes' && s && s <= asOf && (!e || e >= asOf);
    }).map(a => a.EmployeeName)
  ).size;

  const activeCustomers  = countCustomers(today);
  const prevQCustomers   = countCustomers(prevQEnd);
  const billedHeadcount  = countBilledHC(today);
  const prevQHeadcount   = countBilledHC(prevQEnd);

  const _delta = (curr, prev) => {
    const d = curr - prev;
    if (d === 0) return `<span style='color:var(--c-gray-450);font-size:14px;margin-left:8px'>—</span>`;
    const colour = d > 0 ? 'var(--c-success)' : 'var(--c-danger)';
    return `<span style='color:${colour};font-size:14px;margin-left:8px'>${d > 0 ? '+' : ''}${d}</span>`;
  };
  
  return `<div style='display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px'>
    ${_kpiCard('Estimated Revenue ' + thisY,   _fmtGBP(revYTD),   'Current year YTD')}
    ${_kpiCard('Utilisation ' + thisY,      _fmtPct(utilYTD),  'Current year YTD',
        utilYTD >= CONFIG.UTILISATION_THRESHOLDS.green ? 'var(--c-success-bg-alt)' : utilYTD >= CONFIG.UTILISATION_THRESHOLDS.amber ? 'var(--c-warn-bg-soft)' : 'var(--c-danger-bg-alt)')}
    ${_kpiCard('Active Customers',  activeCustomers  + _delta(activeCustomers, prevQCustomers),  'As of today · vs last quarter')}
    ${_kpiCard('Billed Headcount',  billedHeadcount  + _delta(billedHeadcount, prevQHeadcount),  'As of today · vs last quarter')}
  </div>`;
}

// Panel 1 - Team Utilisation
function _renderUtilisationPanel(rows, people) {
  const bands = CONFIG.PEOPLE_LEVELS.filter(l => l !== 'CSD');
  const bandRows = bands.map(band => {
    const r        = rows.filter(r => r.Level === band);
    const u        = _calcUtilisation(r);
    // Headcount from assignment rows for the selected period (not today's people list)
    const total    = new Set(r.map(r => r.EmployeeName)).size;
    const utilised = new Set(r.filter(r => r.Billed === 'Yes').map(r => r.EmployeeName)).size;
    return { band, u, utilised, total };
  }).filter(b => b.total > 0);
  const totalUtil     = _calcUtilisation(rows);
  const totalActive   = new Set(rows.filter(r => isBillableLevel(r.Level)).map(r => r.EmployeeName)).size;
  const totalUtilised = new Set(rows.filter(r => r.Billed === 'Yes' && isBillableLevel(r.Level)).map(r => r.EmployeeName)).size;
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
      <h3 style='margin:0;color:var(--c-navy-steel)'>Team Utilisation</h3>
    </div>
    <table class='data-table' style='margin-bottom:16px'>
      <thead><tr><th>Role Band</th><th>Utilisation</th><th>Headcount</th></tr></thead>
      <tbody>
        ${bandTableRows}
        <tr style='font-weight:700;border-top:2px solid var(--c-gray-300)'>
          <td>Total</td>
          <td>${_fmtPct(totalUtil)}</td>
          <td>${totalUtilised} / ${totalActive}</td>
        </tr>
      </tbody>
    </table>
    <div style='font-size:12px;font-weight:600;color:var(--c-gray-700);margin-bottom:4px'>
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
    .map(([c,v]) => `<tr><td>${escHtml(c)}</td><td>${_fmtGBP(v)}</td></tr>`).join('');
  const customerTotal = Object.values(byCustomer).reduce((s,v)=>s+v,0);

  // Revenue by project type
  const byType = {};
  rows.forEach(r => {
    byType[r.ProjectType] = (byType[r.ProjectType] || 0) + r.BilledRevenue;
  });
  // N-116: derived from config so new project types appear automatically
  const typeOrder = CONFIG.ASSIGNMENT_PROJECT_TYPES
    .filter(t => !CONFIG.NON_REVENUE_PROJECT_TYPES.includes(t));
  const typeRows = typeOrder
    .filter(t => byType[t] !== undefined)
    .map(t => `<tr><td>${t}</td><td>${_fmtGBP(byType[t])}</td></tr>`).join('');
  const typeTotal = Object.values(byType).reduce((s,v)=>s+v,0);

  return `
    <div style='display:grid;grid-template-columns:1fr 1fr;gap:24px'>
      <div>
        <div style='font-size:13px;font-weight:700;color:var(--c-navy-steel);margin-bottom:8px'>
          By Customer</div>
        <table class='data-table'>
          <thead><tr><th>Customer</th><th>Estimated Revenue</th></tr></thead>
          <tbody>
            ${customerRows}
            <tr style='font-weight:700;border-top:2px solid var(--c-gray-300)'>
              <td>Total</td><td>${_fmtGBP(customerTotal)}</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <div style='font-size:13px;font-weight:700;color:var(--c-navy-steel);margin-bottom:8px'>
          By Project Type</div>
        <table class='data-table'>
          <thead><tr><th>Project Type</th><th>Estimated Revenue</th></tr></thead>
          <tbody>
            ${typeRows}
            <tr style='font-weight:700;border-top:2px solid var(--c-gray-300)'>
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
      <td>${escHtml(k)}</td>
      <td>${v}</td>
      <td>${total > 0 ? ((v/total)*100).toFixed(0) + '%' : '—'}</td>
    </tr>`).join('');

  const byLevel = Object.entries(
    active.reduce((m,p) => { m[p.Level||'Unknown']=(m[p.Level||'Unknown']||0)+1; return m; },{}))
    .sort((a,b)=>levelSortIndex(a[0])-levelSortIndex(b[0]));

  return `
    <div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:8px'>
      <div>
        <div style='font-size:13px;font-weight:700;color:var(--c-navy-steel);margin-bottom:8px'>
          By Location</div>
        <table class='data-table'>
          <thead><tr><th>Location</th><th>#</th><th>%</th></tr></thead>
          <tbody>${tableHTML(groupBy('Location'))}</tbody>
        </table>
      </div>
      <div>
        <div style='font-size:13px;font-weight:700;color:var(--c-navy-steel);margin-bottom:8px'>
          By Contract Type</div>
        <table class='data-table'>
          <thead><tr><th>Contract</th><th>#</th><th>%</th></tr></thead>
          <tbody>${tableHTML(groupBy('ContractType'))}</tbody>
        </table>
      </div>
      <div>
        <div style='font-size:13px;font-weight:700;color:var(--c-navy-steel);margin-bottom:8px'>
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
    return `<p style='font-size:13px;color:var(--c-gray-500)'>No employee end dates in the next 60 days.</p>`;
  }

  const rows = upcoming.map(p => {
    const end     = p._end; end.setHours(0, 0, 0, 0);
    const days    = Math.round((end - today) / 86400000);
    const bg      = days <= 30 ? 'var(--c-danger-bg-alt)' : 'var(--c-warn-bg-soft)';
    const dateStr = end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return `<tr>
      <td style='background:${bg}'>${escHtml(p.EmployeeName)}</td>
      <td style='background:${bg}'>${escHtml(p.Level || '—')}</td>
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

async function renderPeopleDashboard() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading dashboard...</p>';

  const [assignments, people, salesForecasts] = await Promise.all([
    getAssignments({}),
    getPeople(false),
    getSalesForecasts(),
  ]);

  const totalActiveHeadcount = people.filter(
    p => p.IsActive !== false && isBillableLevel(p.Level)
  ).length;

  const allRows = computeMonthlyRows(assignments);

const { start, end } = _dashDateRange(_dashFilter);
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
      <div class='print-avoid-break' style='background:var(--c-white);border:1px solid var(--c-gray-150);border-radius:6px;padding:20px'>
        ${utilisPanel}
      </div>
      <div class='print-avoid-break' style='background:var(--c-white);border:1px solid var(--c-gray-150);border-radius:6px;padding:20px'>
        <div class='page-header' style='margin-bottom:12px'>
          <h3 style='margin:0;color:var(--c-navy-steel)'>Estimated Revenue</h3>
        </div>
        ${revenuePanel}
      </div>
    </div>

   <div class='print-avoid-break' style='background:var(--c-white);border:1px solid var(--c-gray-150);border-radius:6px;padding:20px'>
      <div class='page-header' style='margin-bottom:12px'>
        <h3 style='margin:0;color:var(--c-navy-steel)'>Workforce Segmentation</h3>
      </div>
      ${segmentPanel}
    </div>
    <div class='print-avoid-break' style='background:var(--c-white);border:1px solid var(--c-gray-150);border-radius:6px;padding:20px;margin-top:24px'>
      <div class='page-header' style='margin-bottom:12px'>
        <h3 style='margin:0;color:var(--c-navy-steel)'>Upcoming Employee End Dates</h3>
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
