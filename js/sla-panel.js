// js/sla-panel.js — SLA panel (N-384 / DA-4). DOM only.
//
// Three surfaces share one renderer and one period toggle:
//   - the Project dashboard panel (dashboard-project.js, slot 'proj-sla-slot'): Admin / DM;
//   - the Project page panel (project-page.js, slot 'pp-sla-panel'): Admin / Leadership / DM;
//   - the Company Dashboard tile (dashboard-company.js, slot 'co-sla-slot'): Admin / Leadership,
//     one line per project;
//   - the Role page panel (role-page.js, slot 'rp-sla-panel'): anyone who can open the role page,
//     scored for that one role, with its full breach history (amendment 1).
// The project surfaces list ONGOING breaches only (view 'ongoing', each role name links to its
// Role page); the Role page lists the history (view 'history').
// Every rule is pure in analytics.js (slaPanelModel, slaPortfolioModel, slaRag, slaPanelPeriod,
// slaGapNotes) over the N-383 engine (computeProjectSla, slaAttainment). The reads are api.js
// helpers (getProjectSlaInputs, getRoleSlaInputs, getPortfolioSlaInputs). This file formats and mounts.
//
// A slot is filled asynchronously after the page paints, so a slow compute never delays the
// KPIs. Each mount stamps its slot with a token; a result that arrives after the user has moved
// on (the slot is gone or re-mounted) is dropped. A failed load shows one line inside the slot
// and nothing else on the page changes. Desktop only: reporting.html.

let _slaPeriod = CONFIG.SLA.PERIOD_DEFAULT;   // shared by every panel / tile on screen; session only
let _slaSeq = 0;                               // mount token source
const _slaMounts = new Map();                  // slot id -> what that slot needs to re-render from cache

// ── Markup ──────────────────────────────────────────────────────────

// N-385: the pill markup is shared with the roll-up (sla-rollup.js loads first).
function _slaPillHtml(rag) {
  return slaPillHtml(rag);
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

// view 'ongoing': first cell is "Role · Hire", the role a link to its Role page.
// view 'history' (on the Role page itself): first cell is the hire only, no link.
function _slaBreachRowHtml(r, view) {
  const hire = r.hireLabel ? escHtml(r.hireLabel) : '—';
  const who = view === 'history'
    ? hire
    : `<a href="#" class="cell-link"${act('openRolePage.prevent', Number(r.roleId))}>${escHtml(r.roleLabel)}</a>` + (r.hireLabel ? ` · ${hire}` : '');
  const when = (r.metric === SLA_WEEKLY_METRIC_KEY ? 'Week ending ' : '') + _slaDay(r.breachDay);
  return `
        <tr>
          <td>${who}</td>
          <td>${escHtml(r.metricLabel)}</td>
          <td>${escHtml(when)}</td>
          <td>${escHtml(_slaStatusText(r))}</td>
        </tr>`;
}

// One panel body (heading, metrics, breach list). model = slaPanelModel() output.
// opts: slotId (for Show all), showAll, title, view ('ongoing' default | 'history').
function slaPanelHtml(model, opts = {}) {
  if (!model) return '';
  const history = opts.view === 'history';
  const head = _slaHeadHtml(opts.title || 'SLA performance', model.hasTargets ? model.rag : null);
  if (!model.hasTargets) {
    return `${head}<p class="sla-note">No SLA targets are set for this project type.</p>`;
  }
  const cap = CONFIG.SLA.PANEL_BREACH_ROWS;
  const all = history ? model.breachRows : model.breachRows.filter(r => r.ongoing);
  const shown = opts.showAll ? all : all.slice(0, cap);
  const more = all.length > shown.length
    ? `<button type="button" class="btn-secondary btn-sm"${act('showAllSlaBreaches', String(opts.slotId || ''))}>Show all (${all.length})</button>`
    : '';
  const breaches = all.length
    ? `<div class="table-scroll"><table class="data-table sla-breaches">
        <thead><tr><th>${history ? 'Hire' : 'Role · Hire'}</th><th>Metric</th><th>Breached</th><th>Status</th></tr></thead>
        <tbody>${shown.map(r => _slaBreachRowHtml(r, history ? 'history' : 'ongoing')).join('')}</tbody>
      </table></div>${more}`
    : emptyStateBlock({ icon: 'check-circle', message: history ? 'No SLA breaches recorded.' : 'No ongoing SLA breaches.' });
  const gaps = model.gapNotes.length
    ? `<p class="sla-gaps">${model.gapNotes.map(escHtml).join(' ')}</p>` : '';
  return `${head}
      <div class="table-scroll"><table class="data-table sla-metrics">
        <thead><tr><th>Metric</th><th>Target</th><th>Attainment · ${escHtml(model.period.label)}</th><th>Ongoing breaches</th></tr></thead>
        <tbody>${model.metrics.map(_slaMetricRowHtml).join('')}</tbody>
      </table></div>
      <h4 class="sla-subheading">${history ? 'Breach history' : 'Ongoing breaches'}${history && model.ongoingBreaches ? ` <span class="sla-subnote">${escHtml(String(model.ongoingBreaches))} ongoing</span>` : ''}</h4>
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
    }), { slotId, showAll: m.showAll, view: m.view, title: m.title });
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// One scoped panel (a project, or one role of it). spec = { kind, project, role, title, view, load }.
// Never throws.
async function _slaMountScoped(slotId, spec) {
  const claim = _slaClaim(slotId);
  if (!claim) return;
  try {
    const inputs = await spec.load();
    if (!claim.live()) return;
    const result = computeProjectSla(Object.assign({ project: spec.project, today: new Date() }, inputs));
    _slaMounts.set(slotId, {
      kind: spec.kind, token: claim.token, project: spec.project, role: spec.role || null,
      title: spec.title, view: spec.view, inputs, result, showAll: false,
    });
    _slaRender(slotId);
  } catch (e) {
    console.warn('SLA panel load failed:', e);
    if (claim.live()) claim.slot.innerHTML = _slaUnavailableHtml(spec.title, "SLA data couldn't be loaded.");
  }
}

// Fills `slotId` with one project's SLA panel (ongoing breaches only). Never throws.
function mountProjectSlaPanel(slotId, project) {
  return _slaMountScoped(slotId, {
    kind: 'project', project, title: 'SLA performance', view: 'ongoing',
    load: () => getProjectSlaInputs(project.id),
  });
}

// Fills `slotId` with one role's SLA panel on the Role page: that role's own attainment and its
// full breach history. Never throws.
function mountRoleSlaPanel(slotId, project, role) {
  return _slaMountScoped(slotId, {
    kind: 'role', project, role, title: 'SLA performance · this role', view: 'history',
    load: () => getRoleSlaInputs(role),
  });
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
    const results = slaProjectResults({   // N-385: the loop moved to analytics.js, shared with the roll-up
      projects: ctx.projects, slaRows: extra.slaRows, roles: ctx.roles, headcount: ctx.headcount,
      placements: extra.placements, stageRows: extra.stageRows, activity: ctx.activity,
      rejectedOffers: extra.rejectedOffers, today,
    });
    _slaMounts.set(slotId, { kind: 'portfolio', token: claim.token, projects: ctx.projects, results });
    _slaRender(slotId);
  } catch (e) {
    console.warn('SLA summary load failed:', e);
    if (claim.live()) claim.slot.innerHTML = _slaUnavailableHtml('SLA summary', "SLA summary couldn't be loaded.");
  }
}

// Re-reads and recomputes a project or role panel (a target edit rewrites history). No-op when
// that slot isn't mounted.
function refreshSlaPanel(slotId) {
  const m = _slaMounts.get(slotId);
  if (!m || m.kind === 'portfolio' || !document.getElementById(slotId)) return Promise.resolve();
  return m.kind === 'role' ? mountRoleSlaPanel(slotId, m.project, m.role) : mountProjectSlaPanel(slotId, m.project);
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
  if (!m || m.kind === 'portfolio') return;
  m.showAll = true;
  _slaRender(slotId);
}

registerActions({
  setSlaPeriod,
  showAllSlaBreaches,
});