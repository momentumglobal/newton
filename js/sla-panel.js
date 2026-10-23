// js/sla-panel.js — SLA panel (N-384 / DA-4). DOM only.
//
// Three surfaces share one renderer and one period toggle:
//   - the Project dashboard panel (dashboard-project.js, slot 'proj-sla-slot'): Admin / DM;
//   - the Project page panel (project-page.js, slot 'pp-sla-panel'): Admin / Leadership / DM;
//   - the Company Dashboard tile (dashboard-company.js, slot 'co-sla-slot'): Admin / Leadership,
//     one line per project.
// Every rule is pure in analytics.js (slaPanelModel, slaPortfolioModel, slaRag, slaPanelPeriod,
// slaGapNotes) over the N-383 engine (computeProjectSla, slaAttainment). The reads are api.js
// helpers (getProjectSlaInputs, getPortfolioSlaInputs). This file formats and mounts.
//
// A slot is filled asynchronously after the page paints, so a slow compute never delays the
// KPIs. Each mount stamps its slot with a token; a result that arrives after the user has moved
// on (the slot is gone or re-mounted) is dropped. A failed load shows one line inside the slot
// and nothing else on the page changes. Desktop only: reporting.html.

let _slaPeriod = CONFIG.SLA.PERIOD_DEFAULT;   // shared by every panel / tile on screen; session only
let _slaSeq = 0;                               // mount token source
const _slaMounts = new Map();                  // slot id -> what that slot needs to re-render from cache

// ── Markup ──────────────────────────────────────────────────────────

function _slaPillHtml(rag) {
  const key = Object.prototype.hasOwnProperty.call(CONFIG.SLA.RAG.LABELS, rag) ? rag : 'grey';
  return `<span class="sc-rag-pill sc-rag-pill--${escAttr(key)}">${escHtml(CONFIG.SLA.RAG.LABELS[key])}</span>`;
}

function _slaToggleHtml() {
  const btns = periodButtons(CONFIG.SLA.PERIODS.map(p => [p.key, p.label]), _slaPeriod, 'setSlaPeriod');
  return `<div class="filter-group sla-period">${btns}</div>`;
}

function _slaHeadHtml(title, rag) {
  return `<div class="sla-head">
      <div class="sla-head-main"><h3 class="sla-heading">${escHtml(title)}</h3>${rag ? _slaPillHtml(rag) : ''}</div>
      ${_slaToggleHtml()}
    </div>`;
}

function _slaNum(v) {
  return Number(v).toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

// '2026-10-12' → '12 Oct 2026', or an em dash.
function _slaDay(day) {
  return (typeof formatShortDay === 'function' && formatShortDay(day)) || '—';
}

// "3 of 4 hires on target · 2 running". Nothing evaluated yet says so.
function _slaCountsText(m) {
  const evaluated = m.met + m.breached;
  const running = m.pending ? ` · ${m.pending} running` : '';
  if (!evaluated) return `No ${m.noun} evaluated in this period${running}`;
  return `${m.met} of ${evaluated} ${m.noun} on target${running}`;
}

// The Status cell of a breach row. Plain text, escaped by the caller.
function _slaStatusText(row) {
  const target = slaFormatTarget(row.target, { unit: row.metric === SLA_WEEKLY_METRIC_KEY ? 'per week' : 'days' });
  if (row.metric === SLA_WEEKLY_METRIC_KEY) {
    const worst = row.worstAvg === null ? '' : `worst average ${_slaNum(row.worstAvg)}, `;
    return row.ongoing
      ? `Ongoing: ${worst}target ${target}`
      : `Ended ${_slaDay(row.eventDay)}: ${worst}target ${target}`;
  }
  const days = row.value === null ? '' : `${_slaNum(row.value)} days`;
  return row.ongoing
    ? `Ongoing${days ? ': ' + days + ' so far' : ''}, target ${target}`
    : `Late${days ? ': took ' + days : ''}, target ${target}`;
}

function _slaMetricRowHtml(m) {
  const attainment = m.pct === null
    ? (m.target === null ? '—' : `<span class="sla-counts">${escHtml(_slaCountsText(m))}</span>`)
    : `${ragTextHTML(m.rag, m.pct + '%')} <span class="sla-counts">${escHtml(_slaCountsText(m))}</span>`;
  return `
        <tr>
          <td>${escHtml(m.label)}</td>
          <td>${escHtml(slaFormatTarget(m.target, m))}</td>
          <td>${attainment}</td>
          <td>${m.ongoing ? escHtml(`${m.ongoing} ongoing`) : '—'}</td>
        </tr>`;
}

function _slaBreachRowHtml(r) {
  const who = escHtml(r.roleLabel) + (r.hireLabel ? ` · ${escHtml(r.hireLabel)}` : '');
  const when = (r.metric === SLA_WEEKLY_METRIC_KEY ? 'Week ending ' : '') + _slaDay(r.breachDay);
  return `
        <tr>
          <td>${who}</td>
          <td>${escHtml(r.metricLabel)}</td>
          <td>${escHtml(when)}</td>
          <td>${escHtml(_slaStatusText(r))}</td>
        </tr>`;
}

// One project's panel body (heading, metrics, breach list). model = slaPanelModel() output.
// opts: slotId (for Show all), showAll.
function slaPanelHtml(model, opts = {}) {
  if (!model) return '';
  const head = _slaHeadHtml('SLA performance', model.hasTargets ? model.rag : null);
  if (!model.hasTargets) {
    return `${head}<p class="sla-note">No SLA targets are set for this project type.</p>`;
  }
  const cap = CONFIG.SLA.PANEL_BREACH_ROWS;
  const all = model.breachRows;
  const shown = opts.showAll ? all : all.slice(0, cap);
  const more = all.length > shown.length
    ? `<button type="button" class="btn-secondary btn-sm"${act('showAllSlaBreaches', String(opts.slotId || ''))}>Show all (${all.length})</button>`
    : '';
  const breaches = all.length
    ? `<div class="table-scroll"><table class="data-table sla-breaches">
        <thead><tr><th>Role · Hire</th><th>Metric</th><th>Breached</th><th>Status</th></tr></thead>
        <tbody>${shown.map(_slaBreachRowHtml).join('')}</tbody>
      </table></div>${more}`
    : emptyStateBlock({ icon: 'check-circle', message: 'No SLA breaches recorded.' });
  const gaps = model.gapNotes.length
    ? `<p class="sla-gaps">${model.gapNotes.map(escHtml).join(' ')}</p>` : '';
  return `${head}
      <div class="table-scroll"><table class="data-table sla-metrics">
        <thead><tr><th>Metric</th><th>Target</th><th>Attainment · ${escHtml(model.period.label)}</th><th>Ongoing breaches</th></tr></thead>
        <tbody>${model.metrics.map(_slaMetricRowHtml).join('')}</tbody>
      </table></div>
      <h4 class="sla-subheading">Breaches <span class="sla-subnote">full history${model.ongoingBreaches ? ` · ${escHtml(String(model.ongoingBreaches))} ongoing` : ''}</span></h4>
      ${breaches}${gaps}`;
}

// The Company Dashboard tile body. model = slaPortfolioModel() output.
function slaPortfolioTileHtml(model) {
  if (!model) return '';
  const L = CONFIG.SLA.RAG.LABELS;
  const cells = model.metrics.map(m => `
        <div class="sla-pool-cell">
          <div class="sla-pool-label">${escHtml(m.label)}</div>
          <div class="sla-pool-value">${m.pct === null ? '—' : ragTextHTML(m.rag, m.pct + '%')}</div>
          <div class="sla-pool-sub">${escHtml(m.pct === null ? `No ${m.noun} evaluated` : `${m.met} of ${m.met + m.breached} ${m.noun} on target`)}</div>
        </div>`).join('');
  const c = model.counts;
  const countsText = `${c.green} ${L.green.toLowerCase()} · ${c.amber} ${L.amber.toLowerCase()} · ${c.red} ${L.red.toLowerCase()}`
    + (c.grey ? ` · ${c.grey} ${L.grey.toLowerCase()}` : '');
  const rows = model.rows.map(r => `
        <tr>
          <td><a href="#" class="cell-link"${act('openProjectPage.prevent', Number(r.projectId))}>${escHtml(r.name)}</a></td>
          <td>${_slaPillHtml(r.rag)}</td>
          <td>${ragTextHTML(r.rag, r.summary)}</td>
        </tr>`).join('');
  const table = model.rows.length
    ? `<div class="table-scroll"><table class="data-table sla-projects">
        <thead><tr><th>Project</th><th>Status</th><th>Problem areas · ${escHtml(model.period.label)}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`
    : emptyStateBlock({ icon: 'inbox', message: 'No projects have SLA targets yet.' });
  return `${_slaHeadHtml('SLA summary', null)}
      <div class="sla-pool">${cells}</div>
      <p class="sla-counts-line">${escHtml(countsText)} · ${escHtml(String(model.rows.length))} ${model.rows.length === 1 ? 'project' : 'projects'}</p>
      ${table}`;
}

// ── Mounting ────────────────────────────────────────────────────────

function _slaUnavailableHtml(title, message) {
  return `<div class="sla-head"><div class="sla-head-main"><h3 class="sla-heading">${escHtml(title)}</h3></div></div>
      <p class="checklist-unavailable">${escHtml(message)}</p>`;
}

// Stamps the slot and returns a live() check: true while that slot is still on screen and
// still belongs to this mount.
function _slaClaim(slotId) {
  const slot = document.getElementById(slotId);
  if (!slot) return null;
  const token = String(++_slaSeq);
  slot.dataset.slaToken = token;
  slot.innerHTML = skeletonPanel(4);
  return { slot, token, live: () => { const el = document.getElementById(slotId); return !!el && el.dataset.slaToken === token; } };
}

function _slaRender(slotId) {
  const m = _slaMounts.get(slotId);
  const el = document.getElementById(slotId);
  if (!m || !el || el.dataset.slaToken !== m.token) return;
  const today = new Date();
  if (m.kind === 'portfolio') {
    el.innerHTML = slaPortfolioTileHtml(slaPortfolioModel({ projects: m.projects, results: m.results, periodKey: _slaPeriod, today }));
  } else {
    el.innerHTML = slaPanelHtml(slaPanelModel({
      result: m.result, roles: m.inputs.roles, headcount: m.inputs.headcount, periodKey: _slaPeriod, today,
    }), { slotId, showAll: m.showAll });
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Fills `slotId` with one project's SLA panel. Never throws.
async function mountProjectSlaPanel(slotId, project) {
  const claim = _slaClaim(slotId);
  if (!claim) return;
  try {
    const inputs = await getProjectSlaInputs(project.id);
    if (!claim.live()) return;
    const result = computeProjectSla(Object.assign({ project, today: new Date() }, inputs));
    _slaMounts.set(slotId, { kind: 'project', token: claim.token, project, inputs, result, showAll: false });
    _slaRender(slotId);
  } catch (e) {
    console.warn('SLA panel load failed:', e);
    if (claim.live()) claim.slot.innerHTML = _slaUnavailableHtml('SLA performance', "SLA data couldn't be loaded.");
  }
}

// Fills `slotId` with the Company Dashboard tile. ctx = the dashboard's own, already
// internal-filtered { projects, roles, activity, headcount }. headcount null (its read failed)
// is unavailable, never an empty list. Computed after one macrotask so the KPI strip paints first.
async function mountPortfolioSlaTile(slotId, ctx) {
  const claim = _slaClaim(slotId);
  if (!claim) return;
  try {
    if (!ctx || !Array.isArray(ctx.headcount)) throw new Error('SLA tile: headcount unavailable');
    const extra = await getPortfolioSlaInputs();
    await new Promise(resolve => setTimeout(resolve, 0));
    if (!claim.live()) return;
    const today = new Date();
    const results = {};
    ctx.projects.forEach(p => {
      results[String(p.id)] = computeProjectSla({
        project: p, slaRows: extra.slaRows, roles: ctx.roles, headcount: ctx.headcount,
        placements: extra.placements, stageRows: extra.stageRows, activity: ctx.activity,
        rejectedOffers: extra.rejectedOffers, today,
      });
    });
    _slaMounts.set(slotId, { kind: 'portfolio', token: claim.token, projects: ctx.projects, results });
    _slaRender(slotId);
  } catch (e) {
    console.warn('SLA summary load failed:', e);
    if (claim.live()) claim.slot.innerHTML = _slaUnavailableHtml('SLA summary', "SLA summary couldn't be loaded.");
  }
}

// Re-reads and recomputes a project panel (a target edit rewrites history). No-op when that
// slot isn't mounted.
function refreshSlaPanel(slotId) {
  const m = _slaMounts.get(slotId);
  if (!m || m.kind !== 'project' || !document.getElementById(slotId)) return Promise.resolve();
  return mountProjectSlaPanel(slotId, m.project);
}

// ── Actions ─────────────────────────────────────────────────────────

// Period toggle: every panel and tile on screen re-renders from its cache. No Graph call.
function setSlaPeriod(key) {
  if (!CONFIG.SLA.PERIODS.some(p => p.key === key)) return;
  _slaPeriod = key;
  Array.from(_slaMounts.keys()).forEach(id => {
    if (!document.getElementById(id)) { _slaMounts.delete(id); return; }
    _slaRender(id);
  });
}

function showAllSlaBreaches(slotId) {
  const m = _slaMounts.get(slotId);
  if (!m || m.kind !== 'project') return;
  m.showAll = true;
  _slaRender(slotId);
}

registerActions({
  setSlaPeriod,
  showAllSlaBreaches,
});