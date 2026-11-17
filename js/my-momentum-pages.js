// js/my-momentum-pages.js — My Momentum page markup and renderers (N-451 / MM-1)
//
// The *Html functions are pure (string in, string out) so the test rig can assert them; the render
// functions need the DOM and the module state declared in my-momentum-nav.js. Every People value is
// escaped. Tab pages from later tasks (N-452 to N-456) are added here or in their own files.

// The panel shown when there is no My Momentum page to open: no People row, an ambiguous row, or a failed read.
function mmNoRecordHtml(state) {
  let title = 'Not linked to an employee record';
  let msg = 'Your account isn’t linked to an employee record yet. Ask People Ops to add your work email to your People record.';
  if (state === 'ambiguous') {
    title = 'More than one employee record matches';
    msg = 'Your work email matches more than one employee record. Ask People Ops to fix it.';
  } else if (state === 'error') {
    title = 'We couldn’t load your employee record';
    msg = 'Refresh the page to try again. If it keeps happening, tell a Newton admin.';
  }
  return `<div class="page-header"><h1 class="page-title">My Momentum</h1></div>
    <div class="empty-state">
      <i data-lucide="info" class="empty-state-icon"></i>
      <h2 class="empty-state-title">${title}</h2>
      <p class="empty-state-message">${msg}</p>
    </div>`;
}

// ── My History (N-455 / MM-5) ───────────────────────────────────────────
// Pure markup; every People / Project value is escaped. The rules (rows, chips, tiles) are my-momentum-logic.js; the read is
// getMyHistoryData (api.js); the renderer is renderMyHistory below. Tiles reuse the KPI card classes, the table the My
// Scorecard table classes (mmsc-*), the chips the shared .badge.

// The page title and the body the loader fills (skeleton until the read returns).
function mmHistoryShellHtml() {
  return `<div class="page-header"><h1 class="page-title">My History</h1></div>
    <div id="mmh-body">${skeletonStrip(3)}${skeletonTable(4, 5)}</div>`;
}

// The KPI tiles. `t` = mmHistoryTiles(). A blank join date leaves its tile out; a failed hires read shows a dash.
function mmHistoryTilesHtml(t) {
  const L = CONFIG.MY_MOMENTUM.HISTORY.TILES;
  const tile = (value, label) => `<div class="kpi-card"><div class="kpi-value">${escHtml(String(value))}</div><div class="kpi-label">${escHtml(label)}</div></div>`;
  const tiles = [];
  if (t && t.since) tiles.push(tile(pdpFmtDay(t.since), L.since));
  tiles.push(tile(t ? t.projectsCompleted : 0, L.projects));
  tiles.push(tile(t && t.hires !== null && t.hires !== undefined ? t.hires : '—', L.hires));
  return `<div class="kpi-strip">${tiles.join('')}</div>`;
}

// A project's name: a link to the Project page when the viewer can open it (mmCanOpenProjectPage) and the project exists,
// plain text otherwise.
function mmProjectNameHtml(r, canLink) {
  const name = escHtml((r && r.project) || '—');
  if (!canLink || !r || !r.known || !r.projectId) return name;
  return `<a class="mmsc-link" href="${escAttr('reporting.html#projects?action=project&id=' + r.projectId)}">${name}</a>`;
}

const _MMH_CHIP_CLASS = { completed: 'badge', current: 'badge badge-active', upcoming: 'badge mmh-chip--upcoming' };

// The assignment record. `rows` = mmHistoryRows(). End blank = "Ongoing".
function mmHistoryTableHtml(rows, canLink) {
  if (!rows || !rows.length) return '<p class="ppl-muted-note">No project assignments recorded yet.</p>';
  const S = CONFIG.MY_MOMENTUM.HISTORY.STATUS;
  const body = rows.map(r => `<tr>
      <td>${mmProjectNameHtml(r, canLink)}</td><td>${escHtml(r.type || '—')}</td>
      <td>${escHtml(r.start ? pdpFmtDay(r.start) : '—')}</td><td>${escHtml(r.end ? pdpFmtDay(r.end) : 'Ongoing')}</td>
      <td><span class="${_MMH_CHIP_CLASS[r.status] || 'badge'}">${escHtml(S[r.status] || '')}</span></td>
    </tr>`).join('');
  return `<div class="table-scroll"><table class="data-table mmsc-table"><thead><tr><th>Project</th><th>Type</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

// What goes inside #mmh-body once the read returns.
function mmHistoryBodyHtml({ tiles, rows, canLink }) {
  return `${mmHistoryTilesHtml(tiles)}
    <h2 class="mmsc-heading">Project assignments</h2>
    ${mmHistoryTableHtml(rows, canLink)}`;
}

// The Assignments / Projects read failed: one message in place of the body.
function mmHistoryErrorHtml() {
  return `<div class="empty-state">
      <i data-lucide="info" class="empty-state-icon"></i>
      <h2 class="empty-state-title">We couldn’t load your history</h2>
      <p class="empty-state-message">Refresh the page to try again. If it keeps happening, tell a Newton admin.</p>
    </div>`;
}

// N-452 / N-453: the My Team tab strip. `tabs` = mmTeamSubTabs() — only the sub-tabs this person has ([{ key, label }]);
// each button runs the mmTeamTab action (my-momentum-nav.js). Callers draw the strip only when there are two or more.
function mmTeamTabsHtml(active, tabs) {
  return `<div class="eng-tab-strip" role="tablist">${(tabs || []).map(t => `<button type="button" class="eng-tab${active === t.key ? ' eng-tab--active' : ''}" role="tab" aria-selected="${active === t.key ? 'true' : 'false'}"${act('mmTeamTab', t.key)}>${escHtml(t.label)}</button>`).join('')}</div>`;
}

// ── Scorecards (N-453 / MM-3) ───────────────────────────────────────────
// Pure markup for My Scorecard and My Team > Team Scorecards (renderers: my-momentum-scorecard.js). Every text value is
// escaped; classes only (no inline style); the card itself is scorecardCardHTML (utils.js), the same markup People
// Scorecards used. Selects use the same form-group + actOn('change', ..., ACT_VALUE) shape as the PDP team page.

// The view filter's labels — the same wording as the Development tab's (_PDPTP_VIEWS, pdp-team-page.js); a test keeps them equal.
function mmScorecardViewLabels() { return { tree: 'Whole tree', reports: 'Direct reports', all: 'All staff' }; }

// The benchmark basis, said once: every period is judged against the same 52-week pool (CONFIG.MY_MOMENTUM.SCORECARD.BENCHMARK_WEEKS).
function mmScorecardBasisNote() { return CONFIG.MY_MOMENTUM.SCORECARD.BENCHMARK_WEEKS + '-week norm'; }

// Page title, the optional My Team tab strip (`tabsHtml`, already built by the caller) and the controls card:
// the period select always, the view select when the person has more than one view.
function mmScorecardHeadHtml({ title, tabsHtml, periodKey, views, view }) {
  const periods = CONFIG.MY_MOMENTUM.SCORECARD.PERIODS;
  const periodOpts = periods.map(p => `<option value="${escAttr(p.key)}"${p.key === periodKey ? ' selected' : ''}>${escHtml(p.label)}</option>`).join('');
  const labels = mmScorecardViewLabels();
  const viewSelect = (views || []).length > 1
    ? `<div class="form-group"><label for="mmsc-view">View</label><select id="mmsc-view"${actOn('change', 'mmScView', ACT_VALUE)}>${views.map(v => `<option value="${escAttr(v)}"${v === view ? ' selected' : ''}>${escHtml(labels[v] || v)}</option>`).join('')}</select></div>`
    : '';
  return `<div class="page-header"><h1 class="page-title">${escHtml(title)}</h1></div>${tabsHtml || ''}
    <div class="ppl-card pdpt-head">
      <div class="pdpt-controls">
        ${viewSelect}<div class="form-group"><label for="mmsc-period">Period</label><select id="mmsc-period"${actOn('change', 'mmScPeriod', ACT_VALUE)}>${periodOpts}</select></div>
      </div>
    </div>`;
}

// The cards, one scorecardCardHTML each, in the order given. `cards` = buildScorecardCards().cards; `windowLabel` = the period's.
function mmScorecardCardsHtml(cards, windowLabel) {
  const note = mmScorecardBasisNote();
  return `<div class="scorecard-grid">${(cards || []).map(c => scorecardCardHTML({
    title:       c.name,
    windowLabel: windowLabel,
    healthRows:  scorecardHealthRows(c.roleHealth, 'Flagged roles'),
    metrics:     scorecardMetricTips(c.scorecard.metrics, c.bench, undefined, note),
  })).join('')}</div>`;
}

// Nothing to show for the period. `scope` = 'own' (My Scorecard) or 'team' (Team Scorecards). Names the period.
function mmScorecardEmptyHtml(periodKey, scope) {
  const label = scorecardPeriod(periodKey).label;
  const message = scope === 'team'
    ? `Nobody in this view has Weekly Activity for this period (${label}).`
    : `You have no Weekly Activity for this period (${label}).`;
  return emptyStateBlock({ icon: scope === 'team' ? 'users' : 'activity', title: 'No scorecards to show', message });
}

// "N people in this view have no activity in this period." Never lists the names (nobody is singled out); '' when nobody is left out.
function mmScorecardOmittedHtml(omitted) {
  const n = Number(omitted) || 0;
  if (n < 1) return '';
  return `<p class="ppl-muted-note pdpt-note">${n} ${n === 1 ? 'person' : 'people'} in this view ${n === 1 ? 'has' : 'have'} no activity in this period.</p>`;
}

// The standing note under the cards: role health is today's, the benchmark is one 52-week pool for every period.
function mmScorecardNoteHtml() {
  return `<p class="ppl-muted-note pdpt-note">Flagged roles and pace show today’s open roles in every period. Benchmarks are the ${escHtml(mmScorecardBasisNote())}.</p>`;
}

// ── N-454: the detail under the own scorecard — weekly trend, flagged roles, hires ──────────────────────────────────────
// Pure markup over analytics.js buildScorecardTrend / listScorecardRoles / listScorecardHires. Every text value is escaped;
// classes only (no inline style, no hex: series and reference lines take their colour from css/my-momentum.css tokens).

// Chart geometry (viewBox units; the SVG scales to its card).
const _MMSC_CHART = { w: 320, h: 150, l: 38, r: 10, t: 14, b: 28, seriesClasses: 6 };

function mmTrendFmt(v, unit) {
  if (v === null || v === undefined) return '—';
  if (unit === '%') return v + '%';
  if (unit === ':1') return v + ':1';
  if (unit === 'days') return v + ' days';
  return String(v);
}

// One metric's chart: weekly points joined into one line (a week with no value is skipped, not a break), a dashed reference line where the metric
// has one, and a tooltip per point. `s` = one trend series; `weeks` = the shared week-ending days; `idx` picks the series
// colour. Fewer than two points: a plain note instead of an empty chart.
function mmTrendChartSvg(s, weeks, idx) {
  const C = _MMSC_CHART;
  const head = `<h3 class="mmsc-chart-title">${escHtml(s.label)}</h3>${s.lower ? '<span class="ppl-muted-small">Lower is better</span>' : ''}`;
  const pts = (s.values || []).map((v, i) => ({ v, i })).filter(p => p.v !== null && p.v !== undefined);
  if (pts.length < 2) return `<div class="mmsc-chart">${head}<p class="ppl-muted-small">Not enough data in this period.</p></div>`;
  const yMax = Math.max(1, Math.ceil(Math.max(...pts.map(p => p.v), s.bench || 0) * 1.1));
  const plotW = C.w - C.l - C.r, plotH = C.h - C.t - C.b;
  const x = i => weeks.length < 2 ? C.l + plotW / 2 : C.l + (i * plotW) / (weeks.length - 1);
  const y = v => C.t + plotH * (1 - v / yMax);
  let d = '';
  (s.values || []).forEach((v, i) => {
    if (v === null || v === undefined) return;   // a week with no value is skipped: the line joins the weeks that have one
    d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
  });
  const dots = pts.map(p => `<circle class="mmsc-dot" cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.5"><title>${escHtml('Week ending ' + pdpFmtDay(weeks[p.i]) + ': ' + mmTrendFmt(p.v, s.unit))}</title></circle>`).join('');
  const norm = s.bench === null || s.bench === undefined ? '' :
    `<line class="mmsc-norm" x1="${C.l}" y1="${y(s.bench).toFixed(1)}" x2="${C.w - C.r}" y2="${y(s.bench).toFixed(1)}"/>`
    + `<text class="mmsc-axis-text" x="${C.w - C.r}" y="${(y(s.bench) - 3).toFixed(1)}" text-anchor="end">${escHtml('Norm ' + mmTrendFmt(s.bench, s.unit))}</text>`;
  const last = pts[pts.length - 1].v;
  const label = s.label + ': latest ' + mmTrendFmt(last, s.unit) + (s.bench === null || s.bench === undefined ? '' : ', norm ' + mmTrendFmt(s.bench, s.unit)) + ', ' + weeks.length + ' weeks';
  return `<div class="mmsc-chart">${head}
    <svg class="mmsc-svg" viewBox="0 0 ${C.w} ${C.h}" role="img" aria-label="${escAttr(label)}">
      <line class="mmsc-axis" x1="${C.l}" y1="${C.h - C.b}" x2="${C.w - C.r}" y2="${C.h - C.b}"/>
      <text class="mmsc-axis-text" x="${C.l - 4}" y="${C.h - C.b}" text-anchor="end">0</text>
      <text class="mmsc-axis-text" x="${C.l - 4}" y="${C.t + 4}" text-anchor="end">${escHtml(String(yMax))}</text>
      <text class="mmsc-axis-text" x="${C.l}" y="${C.h - 10}" text-anchor="start">${escHtml(pdpFmtDay(weeks[0]))}</text>
      <text class="mmsc-axis-text" x="${C.w - C.r}" y="${C.h - 10}" text-anchor="end">${escHtml(pdpFmtDay(weeks[weeks.length - 1]))}</text>
      ${norm}<path class="mmsc-line mmsc-s${(idx % C.seriesClasses) + 1}" d="${escAttr(d.trim())}"/>${dots}
    </svg></div>`;
}

// A role's name: a link to the Role page when the viewer can open it (mmCanOpenRolePage), plain text otherwise.
function mmRoleNameHtml(r, canLink) {
  const id = Number(r && r.id) || 0;
  if (!canLink || !id) return escHtml((r && r.title) || '—');
  return `<a class="mmsc-link" href="${escAttr(roleDeepLink(id))}">${escHtml(r.title || '—')}</a>`;
}

const _MMSC_REASONS = { stuck: 'Stuck in stage', conversion: 'Low conversion', both: 'Stuck and low conversion' };

function mmFlaggedRolesHtml(roles, canLink) {
  const flagged = (roles && roles.flagged) || [], behind = (roles && roles.behind) || [];
  const stageCell = r => (r.daysInStage === null || r.daysInStage === undefined) ? '—'
    : r.daysInStage + ' days' + (r.stageBudget === null || r.stageBudget === undefined ? '' : ' (budget ' + r.stageBudget + ')');
  const flaggedRows = flagged.map(r => `<tr>
      <td>${mmRoleNameHtml(r, canLink)}</td><td>${escHtml(r.project || '—')}</td><td>${escHtml(r.stage || '—')}</td>
      <td>${escHtml(_MMSC_REASONS[r.reason] || '')}</td><td>${escHtml(stageCell(r))}</td>
    </tr>`).join('');
  const behindRows = behind.map(r => `<tr>
      <td>${mmRoleNameHtml(r, canLink)}</td><td>${escHtml(r.project || '—')}</td><td>${escHtml(r.stage || '—')}</td>
      <td>${escHtml(r.daysOpen === null || r.daysOpen === undefined ? '—' : r.daysOpen + ' days')}</td>
    </tr>`).join('');
  const flaggedHtml = flagged.length
    ? `<div class="table-scroll"><table class="data-table mmsc-table"><thead><tr><th>Role</th><th>Project</th><th>Stage</th><th>Why</th><th>Days in stage</th></tr></thead><tbody>${flaggedRows}</tbody></table></div>`
    : '<p class="ppl-muted-note">No flagged roles.</p>';
  const behindHtml = behind.length
    ? `<h3 class="mmsc-sub">Behind pace (information only)</h3>
       <div class="table-scroll"><table class="data-table mmsc-table"><thead><tr><th>Role</th><th>Project</th><th>Stage</th><th>Days open</th></tr></thead><tbody>${behindRows}</tbody></table></div>`
    : '';
  return flaggedHtml + behindHtml;
}

function mmHiresHtml(hires, periodLabel) {
  const rows = hires || [];
  if (!rows.length) return `<p class="ppl-muted-note">No hires in this period (${escHtml(periodLabel)}).</p>`;
  const body = rows.map(h => `<tr>
      <td>${escHtml(h.candidate || '—')}</td><td>${escHtml(h.title || '—')}</td><td>${escHtml(h.project || '—')}</td><td>${escHtml(h.date ? pdpFmtDay(h.date) : '—')}</td>
    </tr>`).join('');
  return `<div class="table-scroll"><table class="data-table mmsc-table"><thead><tr><th>Candidate</th><th>Role</th><th>Project</th><th>Date</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="ppl-muted-note">${rows.length} ${rows.length === 1 ? 'hire' : 'hires'} in ${escHtml(periodLabel)}.</p>`;
}

// The three sections, in order. Flagged and behind-pace roles are today's open roles in every period (the card's note says so too).
function mmScorecardDetailHtml({ trend, roles, hires, periodLabel, canLinkRoles }) {
  const charts = trend && trend.weeks && trend.weeks.length
    ? `<div class="mmsc-trend-grid">${trend.series.map((s, i) => mmTrendChartSvg(s, trend.weeks, i)).join('')}</div>`
    : '<p class="ppl-muted-note">No weekly activity in this period.</p>';
  return `<section class="mmsc-detail">
    <h2 class="mmsc-heading">Weekly trend</h2>
    <p class="ppl-muted-note">One point per week against your ${escHtml(mmScorecardBasisNote())}. Weeks with no data are skipped and the line joins the weeks that have it.</p>
    ${charts}
    <h2 class="mmsc-heading">Flagged roles</h2>
    <p class="ppl-muted-note">Your open roles as they are today, whatever the period.</p>
    ${mmFlaggedRolesHtml(roles, canLinkRoles)}
    <h2 class="mmsc-heading">Hires</h2>
    ${mmHiresHtml(hires, periodLabel)}
  </section>`;
}

// N-459 (MM-9): the landing-tab hero and the slim header every other tab gets (renderMyMomentumPage, my-momentum-nav.js). Pure.
// Only the first name is shown, escaped; no stats and no join date on the hero (MM-D2). The header has no title: each page has its own.
function mmHeroHtml(fullName, hour) {
  return `<section class="mm-hero">${mmWordmarkHTML('onDark')}<div class="mm-hero-greeting">${escHtml(mmGreetingText(fullName, hour))}</div></section>`;
}
function mmAreaHeaderHtml() {
  return `<div class="mm-area-header">${mmWordmarkHTML('onDark')}</div>`;
}

let _mmHistSeq = 0;   // a slower, older My History fill must not overwrite a newer one

// N-455: draws the page at once (title + skeleton), then fills #mmh-body. Not awaited by the caller: the hero / header
// the dispatcher adds goes on straight away, and if the person leaves the tab before the read returns #mmh-body is gone
// and the fill stops. Ghost Mode: `me` and its WorkEmail are already the ghosted person's.
function renderMyHistory() {
  const main = document.getElementById('main-content');
  main.innerHTML = mmHistoryShellHtml();
  _mmHistFill(_mmIdentity && _mmIdentity.me, _mmResolvedRole);
}

async function _mmHistFill(me, role) {
  const seq = ++_mmHistSeq;
  const email = String((me && me.WorkEmail) || '').trim().toLowerCase();
  let html;
  try {
    const d = await getMyHistoryData(email);
    const rows = mmHistoryRows(d.assignments, d.projects, localDayISO());
    const hires = d.placements === null ? null : mmHistoryHireCount(d.placements, email);
    html = mmHistoryBodyHtml({ tiles: mmHistoryTiles(me, rows, hires), rows, canLink: mmCanOpenProjectPage(role) });
  } catch (e) {
    console.warn('N-455: My History load failed', e);
    html = mmHistoryErrorHtml();
  }
  const body = document.getElementById('mmh-body');
  if (!body || seq !== _mmHistSeq) return;
  body.innerHTML = html;
  lucide.createIcons();
  enterStagger(body, VF_ENTER_SELECTOR);
}

function renderMmNoRecord() {
  const main = document.getElementById('main-content');
  main.innerHTML = mmNoRecordHtml(_mmState);
  lucide.createIcons();
}