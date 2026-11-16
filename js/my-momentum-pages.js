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

// N-451 landing stub: who you are, and a "coming soon" line. N-455 replaces the body with the tiles and the assignment record.
function mmHistoryStubHtml(me, role) {
  const name = escHtml((me && me.EmployeeName) || '');
  const meta = [CONFIG.ROLE_LABELS[role], me && me.Level].filter(Boolean).map(escHtml).join(' · ');
  return `<div class="page-header"><h1 class="page-title">My History</h1></div>
    <div class="dash-panel">
      <h2 class="mm-identity-name">${name}</h2>
      <div class="mm-identity-meta">${meta}</div>
      <p class="mm-soon">Your history at Momentum is coming soon.</p>
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

// N-459 (MM-9): the landing-tab hero and the slim header every other tab gets (renderMyMomentumPage, my-momentum-nav.js). Pure.
// Only the first name is shown, escaped; no stats and no join date on the hero (MM-D2). The header has no title: each page has its own.
function mmHeroHtml(fullName, hour) {
  return `<section class="mm-hero">${mmWordmarkHTML('onDark')}<div class="mm-hero-greeting">${escHtml(mmGreetingText(fullName, hour))}</div></section>`;
}
function mmAreaHeaderHtml() {
  return `<div class="mm-area-header">${mmWordmarkHTML('onDark')}</div>`;
}

function renderMyHistoryStub() {
  const main = document.getElementById('main-content');
  main.innerHTML = mmHistoryStubHtml(_mmIdentity && _mmIdentity.me, _mmResolvedRole);
}

function renderMmNoRecord() {
  const main = document.getElementById('main-content');
  main.innerHTML = mmNoRecordHtml(_mmState);
  lucide.createIcons();
}