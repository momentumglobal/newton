// js/cc-pages.js

// ── Main renderer ──────────────────────────────────────────────────
async function renderCCOverview(container) {
  container.innerHTML = '<div class="cc-loading">Loading...</div>';
  const [roles, acts13, forecasts, assigns, people, projects, snapshots, stageRows] = await Promise.all([
    getAllRoles(),
    getActivityForAnalytics(13),
    getItems('SalesForecasts'),
    getItems('Assignments'),
    getPeople(false),
    getItems('Projects'),
    getItems('Snapshots'),
    getRoleStageHistory().catch(e => { console.warn('N-274: stage history read failed', e); return []; }),
  ]);
  // N-274: time-in-stage flag. Health reads 13 weeks of activity —
  // isRoleFlagged windows its conversion rule to ROLE_FLAG.conversion itself.
  const stageHistory = groupStageHistoryByRole(stageRows);
  const historical = await getHistoricalPlacements();
  const ragHealth = computeProjectHealthRAG(roles, acts13, stageHistory);
  // N-274 decision (2 Oct 2026): the People tile stays unrated (grey) for a
  // quarter of time-in-stage data; thresholds are then set on observed rates.
  const ragPeople = 'grey';
  const ragUtil    = computeUtilisationRAG(forecasts, assigns, people);
  const ragRevenue = computeRevenueRAG(forecasts, assigns);
  // N-108: company-wide flagged-role trend, Health tile only — see the
  // Scope note in specs/N-108.md for why Revenue/People/Utilisation don't
  // get one.
  const healthTrendHTML = _ccTrendArrowHTML(computeHealthTrend(snapshots)) + _ccHealthTrendTooltipHTML();

  container.innerHTML = `
    <div class="page-header">
      <h2>MG Command Centre</h2>
    </div>
    <div class="cc-grid" id="cc-grid">
      ${ccTileHTML('revenue', 'Revenue', ragRevenue, ccRevenueStats(forecasts, assigns))}
      ${ccTileHTML('health', 'Project Health', ragHealth, ccHealthStats(roles, acts13, stageHistory), healthTrendHTML)}
      ${ccTileHTML('people', 'People', ragPeople, ccPeopleStats(roles, acts13, stageHistory))}
      ${ccTileHTML('util',   'Utilisation',    ragUtil,   ccUtilStats(forecasts, assigns, people))}
    </div>`;

  const grid = document.getElementById('cc-grid');
  grid._data = { roles, acts13, stageHistory, historical, forecasts, assigns, people, projects };
  attachTileExpand(grid);
}

// ── Tile HTML ──────────────────────────────────────────────────────
function ccTileHTML(id, title, rag, statsHTML, trendHTML = '') {
  // N-254: red/amber tiles get a glyph + label chip (non-colour cue).
  const marker = ragMarkerHTML(rag, { label: true });
  const statusHTML = marker ? `<div class="cc-tile__status">${marker}</div>` : '';
  return `
    <div class="cc-tile cc-tile--${rag}" data-tile="${id}">
      <button class="cc-close" onclick="event.stopPropagation(); collapseTile(this.closest('.cc-grid'))">✕</button>
      ${statusHTML}
      <div class="cc-tile__title">${title}${trendHTML}</div>
      <div class="cc-tile__stats">${statsHTML}</div>
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
function ccHealthStats(roles, activity, stageHistory) {
  const open = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage));
  // N-274: behind-pace is information only — never part of "flagged".
  const t = tallyRoleFlags(open, activity, stageHistory);
  return `${open.length} open roles · ${t.flagged} flagged · ${t.behind} behind ${CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays}-day pace`;
}

function ccPeopleStats(roles, activity, stageHistory) {
  const open = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage));
  const tps = [...new Set(open.flatMap(r => tpList(r.TalentPartner)))];
  const flagged = tallyRoleFlags(open, activity, stageHistory).flagged;
  return `${tps.length} Talent Partners · ${flagged} flagged roles`;
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
function computeProjectHealthRAG(roles, activity, stageHistory) {
  const open = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage));
  // N-274: thresholds in CONFIG.ROLE_FLAG.healthRag, shared with index.html.
  return flaggedShareRAG(tallyRoleFlags(open, activity, stageHistory).flagged, open.length);
}

// ── Health tile trend (N-108) ─────────────────────────────────────
// Company-wide flagged-role rate, week over week, from Snapshots.
// NOTE: Snapshots only ever contains active-project rows (N-085's writer
// calls getProjects(true)), while the live tile above reads getAllRoles()
// -- every role, including archived-project ones. The trend is therefore
// scoped slightly narrower than "now". Pre-existing gap, not introduced here.
function computeHealthTrend(snapshots) {
  const byWeek = {};
  snapshots.forEach(s => {
    if (!s.WeekEndingDate || s.OpenRoles == null || s.FlaggedCount == null) return;
    const wk = spDateIn(s.WeekEndingDate);
    if (!byWeek[wk]) byWeek[wk] = { openRoles: 0, flagged: 0 };
    byWeek[wk].openRoles += s.OpenRoles;
    byWeek[wk].flagged   += s.FlaggedCount;
  });
  const weeks = Object.keys(byWeek)
    .sort()
    .map(wk => ({ week: wk, pct: byWeek[wk].openRoles > 0 ? byWeek[wk].flagged / byWeek[wk].openRoles : null }))
    .filter(w => w.pct !== null);

  if (weeks.length < 3) return null; // not enough history -- degrade gracefully

  const latest   = weeks[weeks.length - 1].pct;
  const previous = weeks[weeks.length - 2].pct;
  if (latest === previous) return { direction: 'flat' };
  return latest < previous
    ? { direction: 'down', improving: true }   // fewer flagged this week -- good
    : { direction: 'up',   improving: false }; // more flagged this week -- bad
}

// Arrow/dash glyph next to the Health tile title. `trend` is
// computeHealthTrend()'s return value -- null means "no arrow" (insufficient
// history), never rendered as if it were a zero-change "flat" result.
function _ccTrendArrowHTML(trend) {
  if (!trend) return '';
  if (trend.direction === 'flat') {
    return ` <span class="cc-trend-arrow cc-trend-arrow--flat" title="Unchanged vs last week">▬</span>`;
  }
  return trend.improving
    ? ` <span class="cc-trend-arrow cc-trend-arrow--down" title="Improving vs last week">▼</span>`
    : ` <span class="cc-trend-arrow cc-trend-arrow--up" title="Worsening vs last week">▲</span>`;
}

// Explainer tooltip for the Health tile trend, shown whether or not an arrow
// is currently rendered -- a TP looking at a tile with no arrow still needs
// to know the feature exists and why it isn't showing yet. Reuses the
// existing .help-tip/.help-tip-text pattern (admin.js/os-admin.js tab
// tooltips) rather than inventing a new tooltip mechanism.
function _ccHealthTrendTooltipHTML() {
  return ` <span class="help-tip">?<span class="help-tip-text">Compares this week's flagged-role rate (across all active projects) to last week's, from the Snapshots list. Needs 3+ weeks of history -- someone must run Admin > Snapshots > Write Snapshot Now weekly for it to build up.</span></span>`;
}

function _ccUtilCalc(forecasts, assigns, people) {
  const now     = new Date();
  const horizon = new Date(now.getTime() + 91 * 86400000); // 13 weeks

  // Active headcount (billable levels only — consistent with People Dashboard)
  const totalActiveHeadcount = (people || []).filter(p =>
    p.IsActive !== false && isBillableLevel(p.Level)
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
    if (isForecastAssignment(a)) return false;
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
  const { roles, acts13, stageHistory, assigns, projects } = data;
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
    const { flagged, behind } = tallyRoleFlags(custRoles, acts13, stageHistory);
    return `<tr>
      <td>${customer}</td>
      <td style="text-align:center">${headcount}</td>
      <td style="text-align:center">${liveRoles}</td>
      <td style="text-align:center">${flagged > 0 ? `<span style="color:var(--status-danger);font-weight:600">${flagged}</span>` : '—'}</td>
      <td style="text-align:center">${behind > 0 ? behind : '—'}</td>
    </tr>`;
  }).join('');

  return `<table class="cc-detail-table">
    <thead><tr>
      <th>Customer</th><th>Headcount</th><th>Live Roles</th><th>Flagged</th><th>Behind pace</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderPeopleDetail(data) {
  const { roles, acts13, stageHistory } = data;
  const tps = [...new Set(
    roles.filter(r => !ACTIVE_STAGES.includes(r.Stage))
         .flatMap(r => tpList(r.TalentPartner))
  )];
    if (!tps.length) return '<p class="no-data">No active Talent Partners found.</p>';
  const rows = tps.map(tp => {
    const tpRoles = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage) && tpMatches(r.TalentPartner, tp));
    const { flagged, behind } = tallyRoleFlags(tpRoles, acts13, stageHistory);
    const name = tp.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase());
    // N-274 decision (2 Oct 2026): no RAG for a quarter of data. Order by
    // flagged count, then name.
    return { flagged, name, html: `<tr>
      <td>${name}</td>
      <td style="text-align:center">${flagged}/${tpRoles.length}</td>
      <td style="text-align:center">${behind}</td>
      <td style="text-align:center">${ragTextHTML('grey', '—')}</td>
    </tr>` };
  }).sort((a, b) => b.flagged - a.flagged || a.name.localeCompare(b.name)).map(r => r.html).join('');

  return `<table class="cc-detail-table">
    <thead><tr>
      <th>Talent Partner</th><th>Flagged / Open</th><th>Behind pace</th><th>RAG</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderUtilDetail(data) {
  const { forecasts, assigns, people } = data;
  const now = new Date();
  const { known } = _ccUtilCalc(forecasts, assigns, people);
  const totalActiveHeadcount = (people || []).filter(p =>
    p.IsActive !== false && isBillableLevel(p.Level)).length;

  const months = [1, 2, 3].map(offset => {
    const d      = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const mStart = d;
    const mEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const label  = d.toLocaleString('default', { month: 'short', year: '2-digit' });

    const active    = assigns.filter(a => {
      if (isForecastAssignment(a)) return false;
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
  // N-257: neutral by default — only amber/red cells carry status styling.
  const ragOf  = v => v >= t.green ? 'green' : v >= t.amber ? 'amber' : 'red';
  const fmtPct = v => `${(v * 100).toFixed(0)}%`;

  const headers      = months.map(m => `<th style="text-align:center">${m.label}</th>`).join('');
  const plannedCells = months.map(m => `<td style="text-align:center">${ragTextHTML(ragOf(m.planned), fmtPct(m.planned))}</td>`).join('');
  const forecastCells = months.map(m => `<td style="text-align:center">${ragTextHTML(ragOf(m.forecast), fmtPct(m.forecast))}</td>`).join('');

    return `
    <table class="cc-detail-table" style="margin-top:0">
      <thead><tr><th></th>${headers}</tr></thead>
      <tbody>
        <tr><td>Planned</td>${plannedCells}</tr>
        <tr><td>Forecast</td>${forecastCells}</tr>
      </tbody>
    </table>`;
}
