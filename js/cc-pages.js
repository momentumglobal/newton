// js/cc-pages.js

// ── Main renderer ──────────────────────────────────────────────────
async function renderCCOverview(container) {
  container.innerHTML = '<div class="cc-loading">Loading...</div>';
  const [roles, acts4, acts13, forecasts, assigns] = await Promise.all([
    getAllRoles(),
    getActivityForAnalytics(4),
    getActivityForAnalytics(13),
    getItems('SalesForecasts'),
    getItems('Assignments')
  ]);
  const historical = await getHistoricalPlacements();

  const ragHealth = computeProjectHealthRAG(roles, acts4, historical);
  const ragPeople = computePeopleRAG(roles, acts13, historical);
  const ragUtil   = computeUtilisationRAG(forecasts, assigns);

  container.innerHTML = `
    <div class="cc-grid" id="cc-grid">
      ${ccTileHTML('health', 'Project Health', ragHealth, ccHealthStats(roles, acts4))}
      ${ccTileHTML('people', 'People', ragPeople, ccPeopleStats(roles, acts13, historical))}
      ${ccTileHTML('util',   'Utilisation',    ragUtil,   ccUtilStats(forecasts, assigns))}
    </div>`;

  const grid = document.getElementById('cc-grid');
  grid._data = { roles, acts4, acts13, historical, forecasts, assigns };
  attachTileExpand(grid);
}

// ── Tile HTML ──────────────────────────────────────────────────────
function ccTileHTML(id, title, rag, statsHTML) {
  return `
    <div class="cc-tile cc-tile--${rag}" data-tile="${id}">
      <button class="cc-close" onclick="event.stopPropagation(); collapseTile(this.closest('.cc-grid'))">✕</button>
      <div class="cc-rag-pill cc-rag-pill--${rag}">${rag.toUpperCase()}</div>
      <div class="cc-tile__title">${title}</div>
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
  if (id === 'util')   el.innerHTML = renderUtilDetail(data);
}

// ── Headline stats (at-a-glance tile summary) ──────────────────────
function ccHealthStats(roles, activity) {
  const open = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage));
  const flagged = open.filter(role => {
    const acts = activity.filter(a => String(a.RoleIDLookupId) === String(role.id));
    return isRoleFlagged(role, acts);
  }).length;
  return `<div>${open.length} open roles</div><div>${flagged} flagged</div>`;
}

function ccPeopleStats(roles, activity, historical) {
  const b = CONFIG.ANALYTICS_BENCHMARKS;
  const tps = [...new Set(
    roles.filter(r => r.Stage !== 'Placed' && r.Stage !== 'Closed' && r.Stage !== 'Hired' && r.Stage !== 'Backlog' && r.Stage !== 'Cancelled' && r.TalentPartner)
         .map(r => r.TalentPartner)
  )];
  const atRisk = tps.filter(tp => {
    const tpActs  = activity.filter(a => a.TalentPartner === tp);
    const tpPlacs = (historical || []).filter(r => r.talentPartner === tp);
    return computeVelocityScore(tp, tpActs, tpPlacs, b).rag !== 'green';
  }).length;
  return `<div>${tps.length} active TPs</div><div>${atRisk} below benchmark</div>`;
}

function ccUtilStats(forecasts, assigns) {
  const now = new Date();
  const active = assigns.filter(a => new Date(a.StartDate) <= now && new Date(a.EndDate) >= now);
  const totalCap  = active.reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
  const billedCap = active.filter(a => a.Billed === 'Yes').reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
  const util = totalCap > 0 ? billedCap / totalCap : 0;
  return `<div>${(util * 100).toFixed(0)}% utilised</div>`;
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
    roles.filter(r => r.Stage !== 'Placed' && r.Stage !== 'Closed' && r.TalentPartner)
         .map(r => r.TalentPartner)
  )];
  let atRisk = 0;
  tps.forEach(tp => {
    const tpActs  = activity.filter(a => a.TalentPartner === tp);
    const tpPlacs = historical.filter(r => r.talentPartner === tp);
    const score   = computeVelocityScore(tp, tpActs, tpPlacs, b);
    if (score.rag !== 'green') atRisk++;
  });
  if (atRisk === 0) return 'green';
  if (atRisk <= 2)  return 'amber';
  return 'red';
}

function computeUtilisationRAG(forecasts, assigns) {
  const t   = CONFIG.UTILISATION_THRESHOLDS;
  const now = new Date();
  const active    = assigns.filter(a => new Date(a.StartDate) <= now && new Date(a.EndDate) >= now);
  const totalCap  = active.reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
  const billedCap = active.filter(a => a.Billed === 'Yes').reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
  const util = totalCap > 0 ? billedCap / totalCap : 0;
  if (util >= t.green) return 'green';
  if (util >= t.amber) return 'amber';
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
