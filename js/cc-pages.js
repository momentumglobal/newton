// js/cc-pages.js

// ── Main renderer ──────────────────────────────────────────────────
async function renderCCOverview(container) {
  container.innerHTML = '<div class="cc-loading">Loading...</div>';
  const [roles, acts4, acts13, forecasts, assigns, people] = await Promise.all([
    getAllRoles(),
    getActivityForAnalytics(4),
    getActivityForAnalytics(13),
    getItems('SalesForecasts'),
    getItems('Assignments'),
    getPeople(false)
  ]);
  const historical = await getHistoricalPlacements();
  const ragHealth = computeProjectHealthRAG(roles, acts4, historical);
  const ragPeople = computePeopleRAG(roles, acts13, historical);
  const ragUtil   = computeUtilisationRAG(forecasts, assigns, people);

  container.innerHTML = `
    <div class="cc-grid" id="cc-grid">
      ${ccTileHTML('health', 'Project Health', ragHealth, ccHealthStats(roles, acts4))}
      ${ccTileHTML('people', 'People', ragPeople, ccPeopleStats(roles, acts13, historical))}
      ${ccTileHTML('util', 'Utilisation', ragUtil, ccUtilStats(forecasts, assigns, people))}
    </div>`;

  const grid = document.getElementById('cc-grid');
  grid._data = { roles, acts4, acts13, historical, forecasts, assigns, people };
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
  if (id === 'util')   el.innerHTML = renderUtilDetail(data);
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
  return `<div>${counts.green} green · ${counts.amber} amber · ${counts.red} red</div>`;
}

function ccUtilStats(forecasts, assigns, people) {
  const { known, forecast } = _ccUtilCalc(forecasts, assigns, people);
  return `<div>${(known * 100).toFixed(0)}% now · ${(forecast * 100).toFixed(0)}% forecast</div>`;
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

  // Known: assignments active at any point in the next 13 weeks
  const known13 = assigns.filter(a => {
    if (!a.StartDate || !a.EndDate) return false;
    const s = new Date(a.StartDate);
    const e = new Date(a.EndDate);
    return s <= horizon && e >= now && a.Level !== 'CSD';
  });
  const totalCap  = known13.reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
  const billedCap = known13.filter(a => a.Billed === 'Yes').reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
  const known = totalCap > 0 ? billedCap / totalCap : 0;

  // Forecast: known + sales forecasts overlapping next 13 weeks
  const forecastedHeadcount = forecasts.reduce((sum, f) => {
    const s = new Date(f.ForecastStartDate);
    const e = new Date(f.ForecastEndDate);
    return (s <= horizon && e >= now) ? sum + (f.ForecastedHeadcount || 0) : sum;
  }, 0);
  const added    = totalActiveHeadcount > 0 ? forecastedHeadcount / totalActiveHeadcount : 0;
  const forecast = Math.min(known + added, 1.0);

  return { known, forecast };
}

function computeUtilisationRAG(forecasts, assigns, people) {
  const t = CONFIG.UTILISATION_THRESHOLDS;
  const { forecast } = _ccUtilCalc(forecasts, assigns, people);
  if (forecast >= t.green) return 'green';
  if (forecast >= t.amber) return 'amber';
  return 'red';
}

// ── Expanded detail renderers (stubs — flesh out in next iteration) ─
function renderHealthDetail(data) {
  return '<p>Project Health detail coming soon.</p>';
}
function renderPeopleDetail(data) {
  return '<p>People detail coming soon.</p>';
}
function renderUtilDetail(data) {
  return '<p>Utilisation detail coming soon.</p>';
}
