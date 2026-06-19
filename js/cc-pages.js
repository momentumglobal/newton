// js/cc-pages.js

// ── Main renderer ──────────────────────────────────────────────────
async function renderCCOverview(container) {
  container.innerHTML = '<div class="cc-loading">Loading...</div>';
  const [roles, acts4, acts13, forecasts, assigns, people, projects] = await Promise.all([
    getAllRoles(),
    getActivityForAnalytics(4),
    getActivityForAnalytics(13),
    getItems('SalesForecasts'),
    getItems('Assignments'),
    getPeople(false),
    getItems('Projects'),
  ]);
  const historical = await getHistoricalPlacements();
  const ragHealth = computeProjectHealthRAG(roles, acts4, historical);
  const ragPeople = computePeopleRAG(roles, acts13, historical);
  const ragUtil    = computeUtilisationRAG(forecasts, assigns, people);
  const ragRevenue = computeRevenueRAG(forecasts, assigns);

  container.innerHTML = `
    <div class="page-header">
      <h2>MG Command Centre</h2>
    </div>
    <div class="cc-grid" id="cc-grid">
      ${ccTileHTML('revenue', 'Revenue', ragRevenue, ccRevenueStats(forecasts, assigns))}
      ${ccTileHTML('health', 'Project Health', ragHealth, ccHealthStats(roles, acts4))}
      ${ccTileHTML('people', 'People', ragPeople, ccPeopleStats(roles, acts13, historical))}
      ${ccTileHTML('util',   'Utilisation',    ragUtil,   ccUtilStats(forecasts, assigns, people))}
    </div>`;

  const grid = document.getElementById('cc-grid');
  grid._data = { roles, acts4, acts13, historical, forecasts, assigns, people, projects };
  attachTileExpand(grid);
}

// ── Tile HTML ──────────────────────────────────────────────────────
function ccTileHTML(id, title, rag, statsHTML) {
  return `
    <div class="cc-tile cc-tile--${rag}" data-tile="${id}">
      <button class="cc-close" onclick="event.stopPropagation(); collapseTile(this.closest('.cc-grid'))">✕</button>
      <div class="cc-tile__title" style="font-size:20px;font-weight:600;margin-bottom:8px;color:#1a1a2e">${title}</div>
      <div class="cc-tile__stats" style="font-size:14px;color:#444">${statsHTML}</div>
      <div class="cc-tile__detail" style="display:none"></div>
    </div>`;
}

// ── Expand / collapse ──────────────────────────────────────────────
function attachTileExpand(grid) {
  grid.querySelectorAll('.cc-tile').forEach(tile => {
    tile.addEventListener('click', e => {
      if (e.target.classList.contains('cc-close')) return;
      if (grid.classList.contains('cc-grid--expanded')) return;
      grid.classList.add('cc-grid--expanded');
      tile.classList.add('cc-tile--active');
      loadTileDetail(tile, grid._data);
    });
  });
}

function collapseTile(grid) {
  grid.classList.remove('cc-grid--expanded');
  grid.querySelectorAll('.cc-tile').forEach(t => {
    t.classList.remove('cc-tile--active');
    t.querySelector('.cc-tile__detail').style.display = 'none';
  });
}

function loadTileDetail(tile, data) {
  const id = tile.dataset.tile;
  const el = tile.querySelector('.cc-tile__detail');
  el.style.display = 'block';
  if (id === 'health') el.innerHTML = renderHealthDetail(data);
  if (id === 'people') el.innerHTML = renderPeopleDetail(data);
  if (id === 'util')    el.innerHTML = renderUtilDetail(data);
  if (id === 'revenue') el.innerHTML = renderRevenueDetail(data);
}

// ── Headline stats (at-a-glance tile summary) ──────────────────────
function ccHealthStats(roles, activity) {
  const open = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage));
  const flagged = open.filter(role => {
    const acts = activity.filter(a => String(a.RoleIDLookupId) === String(role.id));
    return isRoleFlagged(role, acts);
  }).length;
  return `${open.length} open roles · ${flagged} flagged`;
}

function ccPeopleStats(roles, activity, historical) {
  const tps = [...new Set(
    roles.filter(r => !ACTIVE_STAGES.includes(r.Stage) && r.TalentPartner)
         .map(r => r.TalentPartner)
  )];
  const counts = { green: 0, amber: 0, red: 0 };
  tps.forEach(tp => {
    const tpRoles = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage) && r.TalentPartner && r.TalentPartner.toLowerCase() === tp.toLowerCase());
    const flagged = tpRoles.filter(r => {
      const acts = activity.filter(a => String(a.RoleIDLookupId) === String(r.id));
      return isRoleFlagged(r, acts);
    }).length;
    const pct = tpRoles.length ? flagged / tpRoles.length : null;
    const rag = pct === null ? 'grey' : pct < 0.25 ? 'green' : pct <= 0.50 ? 'amber' : 'red';
    if (rag !== 'grey') counts[rag]++;
  });
  return `${counts.green} green · ${counts.amber} amber · ${counts.red} red`;
}

function ccUtilStats(forecasts, assigns, people) {
  const { known, forecast } = _ccUtilCalc(forecasts, assigns, people);
  return `${(known * 100).toFixed(0)}% now · ${(forecast * 100).toFixed(0)}% forecast (next 3 months)`;
}

// ── Revenue tile ────────────────────────────────────────────────────
// Reuses the Revenue Tracking helpers (utils.js) and chart (revenue-chart.js).
// Current month = estimated only; 3-month forecast = avg of est. + forecast
// over the current month + next 2.
function _ccRevenueCalc(forecasts, assigns) {
  const now   = new Date();
  const year  = now.getFullYear();
  const estByMonth      = computeMonthlyRevenueForYear(assigns, year);          // array[12]
  const forecastByMonth = computeMonthlyForecastRevenueForYear(forecasts, year); // array[12]

  const m = now.getMonth();
  const thisMonth = estByMonth[m];

  // Average combined (est + forecast) across current month + next 2 (clamp to Dec)
  const idxs = [m, m + 1, m + 2].filter(i => i <= 11);
  const combinedAvg = idxs.reduce((s, i) => s + estByMonth[i] + forecastByMonth[i], 0) / idxs.length;

  return { thisMonth, forecast: combinedAvg };
}

function ccRevenueStats(forecasts, assigns) {
  const { thisMonth, forecast } = _ccRevenueCalc(forecasts, assigns);
  return `${_fmtGBPk(thisMonth)} this month · ${_fmtGBPk(forecast)} avg forecast (next 3 months)`;
}

function computeRevenueRAG(forecasts, assigns) {
  const t = CONFIG.REVENUE_THRESHOLDS;
  const { forecast } = _ccRevenueCalc(forecasts, assigns);
  if (forecast >= t.green) return 'green';
  if (forecast >= t.amber) return 'amber';
  return 'red';
}

function renderRevenueDetail(data) {
  const { assigns, forecasts } = data;
  const year = new Date().getFullYear();
  return _renderRevenueLineGraph(assigns, year, forecasts);
}

// ── RAG logic ──────────────────────────────────────────────────────
function computeProjectHealthRAG(roles, activity, historical) {
  const open = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage));
  if (!open.length) return 'green';
  const flagged = open.filter(role => {
    const acts = activity.filter(a => String(a.RoleIDLookupId) === String(role.id));
    return isRoleFlagged(role, acts);
  }).length;
  const pct = flagged / open.length;
  if (pct < 0.25)  return 'green';
  if (pct <= 0.50) return 'amber';
  return 'red';
}

function computePeopleRAG(roles, activity, historical) {
  const b = CONFIG.ANALYTICS_BENCHMARKS;
  const tps = [...new Set(
    roles.filter(r => !ACTIVE_STAGES.includes(r.Stage) && r.TalentPartner)
         .map(r => r.TalentPartner)
  )];
  if (!tps.length) return 'green';
  const weight = { green: 0, amber: 1, red: 2, grey: 0 };
  const total = tps.reduce((sum, tp) => {
    const tpRoles = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage) && r.TalentPartner && r.TalentPartner.toLowerCase() === tp.toLowerCase());
    const flagged = tpRoles.filter(r => {
      const acts = activity.filter(a => String(a.RoleIDLookupId) === String(r.id));
      return isRoleFlagged(r, acts);
    }).length;
    const pct = tpRoles.length ? flagged / tpRoles.length : null;
    const rag = pct === null ? 'grey' : pct < 0.25 ? 'green' : pct <= 0.50 ? 'amber' : 'red';
    return sum + weight[rag];
  }, 0);
  const avg = total / tps.length;
  if (avg < 0.5)  return 'green';
  if (avg <= 1.0) return 'amber';
  return 'red';
}

function _ccUtilCalc(forecasts, assigns, people) {
  const now     = new Date();
  const horizon = new Date(now.getTime() + 91 * 86400000); // 13 weeks

  // Active headcount (SDM, STP, TP only — consistent with People Dashboard)
  const totalActiveHeadcount = (people || []).filter(p =>
    p.IsActive !== false && ['SDM', 'STP', 'TP'].includes(p.Level)
  ).length;

  // Current: use computeMonthlyRows for current month — consistent with People Dashboard
  const allRows     = computeMonthlyRows(assigns);
  const curMonth    = now.getMonth() + 1;
  const curYear     = now.getFullYear();
  const currentRows = allRows.filter(r => r.Year === curYear && r.Month === curMonth && r.Level !== 'CSD');
  const totalCap    = currentRows.reduce((s, r) => s + r.Capacity, 0);
  const billedCap   = currentRows.reduce((s, r) => s + r.BilledCapacity, 0);
  const known       = totalCap > 0 ? billedCap / totalCap : 0;

  // Known 13 weeks: assignments active at any point in the next 13 weeks (for forecast base)
  const known13 = assigns.filter(a => {
    if (!a.StartDate || !a.EndDate || a.Level === 'CSD') return false;
    const s = new Date(a.StartDate);
    const e = new Date(a.EndDate);
    return s <= horizon && e >= now;
  });
  const totalCap13  = known13.reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
  const billedCap13 = known13.filter(a => a.Billed === 'Yes').reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
  const knownForecastBase = totalCap13 > 0 ? billedCap13 / totalCap13 : 0;

  // Forecast: known + sales forecasts overlapping next 13 weeks
  const forecastedHeadcount = forecasts.reduce((sum, f) => {
    const s = new Date(f.ForecastStartDate);
    const e = new Date(f.ForecastEndDate);
    return (s <= horizon && e >= now) ? sum + (f.ForecastedHeadcount || 0) : sum;
  }, 0);
  const added    = totalActiveHeadcount > 0 ? forecastedHeadcount / totalActiveHeadcount : 0;
  const forecast = Math.min(knownForecastBase + added, 1.0);

  return { known, forecast };
}

function computeUtilisationRAG(forecasts, assigns, people) {
  const t = CONFIG.UTILISATION_THRESHOLDS;
  const { forecast } = _ccUtilCalc(forecasts, assigns, people);
  if (forecast >= t.green) return 'green';
  if (forecast >= t.amber) return 'amber';
  return 'red';
}

// ── Expanded detail renderers ─
function renderHealthDetail(data) {
  const { roles, acts4, assigns, projects } = data;
  const now = new Date();
  const projectMap = Object.fromEntries((projects || []).map(p => [String(p.id), p.CustomerName]));

  const liveAssigns = assigns.filter(a => a.StartDate && a.EndDate &&
    new Date(a.StartDate) <= now && new Date(a.EndDate) >= now);
  const customers = [...new Set(liveAssigns.map(a => a.Customer).filter(Boolean))].sort();

  if (!customers.length) return '<p class="no-data">No live projects found.</p>';

  const rows = customers.map(customer => {
    const custAssigns = liveAssigns.filter(a => a.Customer === customer);
    const headcount   = custAssigns.length;
    const custRoles   = roles.filter(r => {
      const pName = projectMap[String(r.ProjectIDLookupId)] || projectMap[String(r.ProjectID)] || '';
      return pName === customer && !ACTIVE_STAGES.includes(r.Stage);
    });
    const liveRoles = custRoles.length;
    const flagged   = custRoles.filter(r => {
      const acts = acts4.filter(a => String(a.RoleIDLookupId) === String(r.id));
      return isRoleFlagged(r, acts);
    }).length;
    return `<tr>
      <td>${customer}</td>
      <td style="text-align:center">${headcount}</td>
      <td style="text-align:center">${liveRoles}</td>
      <td style="text-align:center">${flagged > 0 ? `<span style="color:#c62828;font-weight:600">${flagged}</span>` : '—'}</td>
    </tr>`;
  }).join('');

  return `<table class="cc-detail-table">
    <thead><tr>
      <th>Customer</th><th>Headcount</th><th>Live Roles</th><th>Flagged</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderPeopleDetail(data) {
  const { roles, acts13 } = data;
  const tps = [...new Set(
    roles.filter(r => !ACTIVE_STAGES.includes(r.Stage) && r.TalentPartner).map(r => r.TalentPartner)
  )];

  if (!tps.length) return '<p class="no-data">No active Talent Partners found.</p>';

  const weight = { green: 0, amber: 1, red: 2, grey: 0 };
  const ragColours = { green: '#2e7d32', amber: '#e65100', red: '#c62828', grey: '#888' };

  const rows = tps.map(tp => {
    const tpRoles = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage) && r.TalentPartner &&
      r.TalentPartner.toLowerCase() === tp.toLowerCase());
    const flagged = tpRoles.filter(r => {
      const acts = acts13.filter(a => String(a.RoleIDLookupId) === String(r.id));
      return isRoleFlagged(r, acts);
    }).length;
    const pct = tpRoles.length ? flagged / tpRoles.length : null;
    const rag = pct === null ? 'grey' : pct < 0.25 ? 'green' : pct <= 0.50 ? 'amber' : 'red';
    const name = tp.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase());
    return { rag, html: `<tr>
      <td>${name}</td>
      <td style="text-align:center">${flagged}/${tpRoles.length}</td>
      <td style="text-align:center"><span style="font-weight:600;color:${ragColours[rag]}">${rag.toUpperCase()}</span></td>
    </tr>` };
  }).sort((a, b) => weight[b.rag] - weight[a.rag]).map(r => r.html).join('');

  return `<table class="cc-detail-table">
    <thead><tr>
      <th>Talent Partner</th><th>Flagged / Open</th><th>RAG</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderUtilDetail(data) {
  const { forecasts, assigns, people } = data;
  const now = new Date();
  const { known } = _ccUtilCalc(forecasts, assigns, people);
  const totalActiveHeadcount = (people || []).filter(p =>
    p.IsActive !== false && ['SDM','STP','TP'].includes(p.Level)).length;

  const months = [1, 2, 3].map(offset => {
    const d      = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const mStart = d;
    const mEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const label  = d.toLocaleString('default', { month: 'short', year: '2-digit' });

    const active    = assigns.filter(a => {
      if (!a.StartDate || !a.EndDate || a.Level === 'CSD') return false;
      return new Date(a.StartDate) <= mEnd && new Date(a.EndDate) >= mStart;
    });
    const totalCap  = active.reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
    const billedCap = active.filter(a => a.Billed === 'Yes').reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
    const planned   = totalCap > 0 ? billedCap / totalCap : 0;

    const forecastedHC = forecasts.reduce((sum, f) => {
      const s = new Date(f.ForecastStartDate);
      const e = new Date(f.ForecastEndDate);
      return (s <= mEnd && e >= mStart) ? sum + (f.ForecastedHeadcount || 0) : sum;
    }, 0);
    const forecast = Math.min(planned + (totalActiveHeadcount > 0 ? forecastedHC / totalActiveHeadcount : 0), 1.0);

    return { label, planned, forecast };
  });

  const t = CONFIG.UTILISATION_THRESHOLDS;
  const ragCol = v => v >= t.green ? '#2e7d32' : v >= t.amber ? '#e65100' : '#c62828';
  const fmtPct = v => `${(v * 100).toFixed(0)}%`;

  const headers      = months.map(m => `<th style="text-align:center">${m.label}</th>`).join('');
  const plannedCells = months.map(m => `<td style="text-align:center;color:${ragCol(m.planned)};font-weight:600">${fmtPct(m.planned)}</td>`).join('');
  const forecastCells = months.map(m => `<td style="text-align:center;color:${ragCol(m.forecast)};font-weight:600">${fmtPct(m.forecast)}</td>`).join('');

    return `
    <table class="cc-detail-table" style="margin-top:0">
      <thead><tr><th></th>${headers}</tr></thead>
      <tbody>
        <tr><td>Planned</td>${plannedCells}</tr>
        <tr><td>Forecast</td>${forecastCells}</tr>
      </tbody>
    </table>`;
}
