// js/onboarding-my-ui.js — My Momentum > My Onboarding > Onboarding Plan (N-499 / ONB-4, epic N-482)
//
// The joiner's own plan, and the plan of each joiner they buddy (ONB-D30): steps grouped by phase with owner chip, due date and
// overdue flag, Guided / Self-guided, a content link and a progress bar, then the Library filtered by level (ONB-D29, D33). The joiner
// ticks the steps they own; a buddy ticks buddy-owned steps. LM / CSD progress and ticking on a joiner's behalf is N-502.
//
// The rules and the page model are pure in onboarding-logic.js (onbPlanModel, onbLibraryFilter); the reads and the one write are
// getOnboardingPlanView / tickOnboardingStep in api-onboarding.js (each re-checks); every word is CONFIG.ONBOARDING.PLAN_TEXT. This
// file holds markup and the actions only: declarations at load, DOM only inside the functions. my-momentum.html only; never
// mobile.html, Newton for Claude or the Command Bar.

let _onbmState = {
  token:     0,           // bumped by every load, so a slow read that finishes after the user moved on draws nothing
  planId:    '',          // the plan on screen ('' = the viewer's first)
  level:     '',          // the Library level filter key, '' = all levels (ONB-D33); kept for the page session only
  view:      null,        // last getOnboardingPlanView() result
  error:     '',
  closed:    new Set(),   // phase section names the viewer has collapsed
  closedFor: '',          // the plan the collapsed set was worked out for
};

// N-500 (ONB-D49): the sub-tab on screen ('plan' | 'rituals'), one of CONFIG.ONBOARDING.SUB_TABS this person has (onbSubTabs).
let _onbmSubTab = '';

// The sub-tab to open: the one asked for when this person has it, else their first. Called by navigateToMyMomentum and by the draw below.
function onbmPickSubTab(want) {
  const subs = onbSubTabs(_mmSignals);
  _onbmSubTab = subs.some(t => t.key === want) ? want : (subs[0] ? subs[0].key : '');
}

// The sub-tab strip (same classes as My Team's); drawn only with two or more sub-tabs. tabs = onbSubTabs().
function onbSubTabsHtml(active, tabs) {
  if (!tabs || tabs.length < 2) return '';
  return `<div class="eng-tab-strip" id="onb-tabs" role="tablist">${tabs.map(t => `<button type="button" class="eng-tab${active === t.key ? ' eng-tab--active' : ''}" role="tab" aria-selected="${active === t.key ? 'true' : 'false'}"${act('onbmSubTab', t.key)}>${escHtml(t.label)}</button>`).join('')}</div>`;
}

// ── Markup (pure) ───────────────────────────────────────────────────────

function _onbmDate(iso) { return formatLongDay(iso) || String(iso || ''); }

function _onbmChip(text, extra) {
  return `<span class="badge onb-chip${extra ? ' ' + extra : ''}">${escHtml(text)}</span>`;
}

// One step row. n = a page-unique number for the checkbox id. N-509: tickAttr(it) = the checkbox's change-action attribute; the
// Buddying page (onboarding-buddy-ui.js) passes its own, My Onboarding leaves it out and gets onbmTick. No other behaviour change.
function _onbmStepHtml(it, n, tickAttr) {
  const T = CONFIG.ONBOARDING.PLAN_TEXT;
  const id = 'onb-box-' + n;
  const tick = tickAttr ? tickAttr(it) : actOn('change', 'onbmTick', it.itemKey, ACT_CHECKED);
  const ownerText = it.owner.unnamed ? T.ownerBuddyNone : (it.owner.name ? `${it.owner.label} · ${it.owner.name}` : it.owner.label);
  const chips = [_onbmChip(ownerText, 'onb-chip--owner'), _onbmChip(it.guided ? T.guided : T.selfGuided)];
  if (it.levelTag) chips.push(_onbmChip(it.levelTag));
  const due = it.dueISO
    ? `<span class="onb-due">${escHtml(onbFillText(T.dueOn, { date: _onbmDate(it.dueISO) }))}${it.dueText ? ' · ' + escHtml(it.dueText) : ''}</span>`
    : '';
  const overdue = it.overdue ? `<span class="badge badge--overdue">${escHtml(T.overdueChip)}</span>` : '';
  const link = it.contentUrl
    ? `<a class="onb-link" href="${escAttr(it.contentUrl)}" target="_blank" rel="noopener noreferrer">${escHtml(T.open)} <i data-lucide="external-link" aria-hidden="true"></i></a>`
    : '';
  const done = it.done
    ? `<div class="onb-step-done">${escHtml(onbFillText(T.doneBy, { name: it.doneByName, date: _onbmDate(it.doneAt) }))}</div>`
    : '';
  return `<li class="onb-step${it.done ? ' onb-step--done' : ''}">
        <input type="checkbox" class="onb-step-check" id="${id}"${it.done ? ' checked' : ''}${it.canTick ? '' : ' disabled'}${tick}>
        <div class="onb-step-body">
          <label class="onb-step-label" for="${id}">${escHtml(it.label)}</label>
          ${it.help ? `<div class="onb-step-help">${escHtml(it.help)}</div>` : ''}
          <div class="onb-step-meta">${chips.join('')}${due}${overdue}${link}</div>
          ${done}
        </div>
      </li>`;
}

function _onbmPhaseHtml(ph, closed, counter) {
  const T = CONFIG.ONBOARDING.PLAN_TEXT;
  const isClosed = closed.includes(ph.section);
  return `<section class="onb-phase">
      <div class="onb-phase-head">
        <h2 class="onb-phase-title">${escHtml(ph.section)}</h2>
        <span class="onb-phase-count">${escHtml(onbFillText(T.phaseCount, { done: ph.done, total: ph.total }))}</span>
        <button type="button" class="btn-secondary onb-phase-toggle" aria-expanded="${isClosed ? 'false' : 'true'}"${act('onbmTogglePhase', ph.section)}>${escHtml(isClosed ? T.expand : T.collapse)}</button>
      </div>
      <ul class="onb-steps"${isClosed ? ' hidden' : ''}>${ph.items.map(it => _onbmStepHtml(it, counter.n++)).join('')}</ul>
    </section>`;
}

function _onbmLibraryHtml(view, level, counter) {
  const O = CONFIG.ONBOARDING;
  const T = O.PLAN_TEXT;
  if (!view.library.all.length) return '';
  const f = onbLibraryFilter(view.library.all, level);
  const buttons = O.LEVEL_FILTERS.map(l =>
    `<button type="button" class="btn-secondary onb-level${l.key === level ? ' is-active' : ''}" aria-pressed="${l.key === level ? 'true' : 'false'}"${act('onbmSetLevel', l.key)}>${escHtml(l.label)}</button>`).join('');
  return `<section class="onb-phase onb-library">
      <div class="onb-phase-head"><h2 class="onb-phase-title">${escHtml(T.library)}</h2></div>
      <p class="onb-hint">${escHtml(T.libraryHint)} <a class="onb-link" href="${escAttr(O.LIBRARY_URL)}" target="_blank" rel="noopener noreferrer">${escHtml(T.browseLibrary)} <i data-lucide="external-link" aria-hidden="true"></i></a></p>
      <div class="onb-levels" role="group" aria-label="${escAttr(T.levelLabel)}">${buttons}</div>
      ${f.items.length ? `<ul class="onb-steps">${f.items.map(it => _onbmStepHtml(it, counter.n++)).join('')}</ul>` : `<p class="ppl-muted-note">${escHtml(T.libraryEmpty)}</p>`}
      ${f.hidden ? `<p class="onb-hint">${escHtml(onbFillText(T.libraryFiltered, { n: f.hidden }))}</p>` : ''}
    </section>`;
}

function _onbmHeadHtml(view) {
  const T = CONFIG.ONBOARDING.PLAN_TEXT;
  const s = view.summary;
  const next = s.nextDue ? onbFillText(T.next, { label: s.nextDue.label, due: _onbmDate(s.nextDue.due) }) : (s.total && s.done === s.total ? T.allDone : '');
  const progress = s.total
    ? `<progress class="onb-progress-bar" max="${s.total}" value="${s.done}" aria-label="${escAttr(onbFillText(T.progress, { done: s.done, total: s.total }))}"></progress>
       <div class="onb-progress-text">${escHtml(onbFillText(T.progress, { done: s.done, total: s.total }))}${s.overdue ? ' · ' + escHtml(onbFillText(T.overdue, { n: s.overdue })) : ''}</div>
       ${next ? `<div class="onb-progress-next">${escHtml(next)}</div>` : ''}`
    : `<div class="onb-progress-text">${escHtml(T.noSteps)}</div>`;
  return `<section class="ppl-card onb-head">
      <h2 class="onb-head-name">${escHtml(view.joiner.name)}</h2>
      ${view.joiner.startDate ? `<div class="onb-head-start">${escHtml(onbFillText(T.startsOn, { date: _onbmDate(view.joiner.startDate) }))}</div>` : ''}
      <dl class="onb-meta">
        <div><dt>${escHtml(T.lineManager)}</dt><dd>${escHtml(view.lineManagerName || '—')}</dd></div>
        <div><dt>${escHtml(T.buddy)}</dt><dd>${escHtml(view.buddyName || T.buddyNone)}</dd></div>
      </dl>
      ${progress}
    </section>`;
}

function _onbmSelectorHtml(view) {
  const T = CONFIG.ONBOARDING.PLAN_TEXT;
  if (!view.choices || view.choices.length < 2) return '';
  const opts = view.choices.map(c =>
    `<option value="${escAttr(c.planId)}"${c.planId === view.planId ? ' selected' : ''}>${escHtml(c.kind === 'own' ? T.myPlan : onbFillText(T.buddyPlan, { name: c.joinerName }))}</option>`).join('');
  return `<div class="onb-selector"><label for="onb-plan">${escHtml(T.selectorLabel)}</label><select id="onb-plan"${actOn('change', 'onbmSelectPlan', ACT_VALUE)}>${opts}</select></div>`;
}

// ui = { level, closed: [section names], error }. view = getOnboardingPlanView() result, or null when it failed (ui.error says why).
function onbmPageHtml(view, ui) {
  const T = CONFIG.ONBOARDING.PLAN_TEXT;
  const u = ui || { level: '', closed: [], error: '' };
  const head = `<div class="page-header"><h1 class="page-title">${escHtml(T.pageTitle)}</h1></div>`;
  if (u.error) return head + emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: T.loadFailed, message: u.error, actionLabel: T.retry, actionAct: ['onbmRetry'] });
  if (!view || view.none) return head + emptyStateBlock({ icon: 'inbox', title: T.pageTitle, message: T.noPlans });
  const notes = [];
  if (view.gateState === 'preview') notes.push(T.previewNote);
  if (view.readOnly && view.gateState !== 'preview') notes.push(T.completeNote);
  if (view.notStarted && view.kind === 'own') notes.push(onbFillText(T.notStartedNote, { date: _onbmDate(view.joiner.startDate) }));
  const counter = { n: 0 };
  const phases = view.phases.map(ph => _onbmPhaseHtml(ph, u.closed || [], counter)).join('');
  return head
    + _onbmSelectorHtml(view)
    + notes.map(n => `<p class="onb-note">${escHtml(n)}</p>`).join('')
    + _onbmHeadHtml(view)
    + (view.phases.length ? phases : `<p class="ppl-muted-note">${escHtml(T.noSteps)}</p>`)
    + _onbmLibraryHtml(view, u.level || '', counter);
}

// ── Load and draw ───────────────────────────────────────────────────────

function _onbmDraw() {
  const page = document.getElementById('onb-page');
  if (!page) return;
  const s = _onbmState;
  page.innerHTML = onbmPageHtml(s.view, { level: s.level, closed: Array.from(s.closed), error: s.error });
  lucide.createIcons();
}

// Reads the plan and draws it, unless the user moved on meanwhile (newer load, or another tab).
async function _onbmLoad(token) {
  const s = _onbmState;
  let view = null, error = '';
  try {
    view = await getOnboardingPlanView(s.planId);
  } catch (e) {
    console.error('My Onboarding: load failed', e);
    error = (e && e.message) || String(e);
  }
  if (token !== s.token || _mmCurrentPage !== 'myOnboarding' || !document.getElementById('onb-page')) return;
  s.view = view;
  s.error = error;
  if (view && !view.none) {
    s.planId = view.planId;
    if (s.closedFor !== view.planId) {   // first sight of this plan: fully done phases start collapsed (a phase with a step to do stays open)
      s.closed = new Set(view.phases.filter(p => !p.open).map(p => p.section));
      s.closedFor = view.planId;
    }
  }
  _onbmDraw();
}

// Called by renderMyMomentumPage. Draws into #onb-page so the area header that page inserts is never wiped by a redraw.
async function renderMyOnboardingPage() {
  const main = document.getElementById('main-content');
  const token = ++_onbmState.token;   // also bumped when the sub-tab changes, so a slow plan read never draws over Processes & Rituals
  const subs = onbSubTabs(_mmSignals);
  if (!subs.some(t => t.key === _onbmSubTab)) onbmPickSubTab('');
  const strip = onbSubTabsHtml(_onbmSubTab, subs);
  if (_onbmSubTab === 'rituals') {
    main.innerHTML = `${strip}<div id="onb-page"></div>`;
    renderOnboardingRitualsPage();
    return;
  }
  main.innerHTML = `${strip}<div id="onb-page">${dashboardSkeleton(2)}</div>`;
  await _onbmLoad(token);
}

async function _onbmReload(withSkeleton) {
  const page = document.getElementById('onb-page');
  if (!page) return;
  const token = ++_onbmState.token;
  if (withSkeleton) page.innerHTML = dashboardSkeleton(2);
  await _onbmLoad(token);
}

// ── Actions ─────────────────────────────────────────────────────────────

async function onbmTick(itemKey, checked) {
  const s = _onbmState;
  const v = s.view;
  if (!v || v.none) return;
  const T = CONFIG.ONBOARDING.PLAN_TEXT;
  document.querySelectorAll('#onb-page .onb-step-check').forEach(el => { el.disabled = true; });   // one write at a time
  try {
    await tickOnboardingStep({ planId: v.planId, itemKey, done: checked === true });
  } catch (e) {
    console.error('My Onboarding: tick failed', e);
    toast(`${T.tickFailed} ${(e && e.message) || e}`, { type: 'error' });
  }
  await _onbmReload(false);   // always redraw from fresh data, so a box never shows a state the server does not hold
}

async function onbmSelectPlan(planId) {
  _onbmState.planId = String(planId == null ? '' : planId);
  await _onbmReload(true);
}

function onbmSetLevel(key) {
  _onbmState.level = String(key == null ? '' : key);
  _onbmDraw();
}

function onbmTogglePhase(section) {
  const c = _onbmState.closed;
  if (c.has(section)) c.delete(section); else c.add(section);
  _onbmDraw();
}

// The sub-tab strip: switch and redraw the page (nothing on either sub-tab holds unsaved work).
async function onbmSubTab(key) {
  if (key === _onbmSubTab || !onbSubTabs(_mmSignals).some(t => t.key === key)) return;
  _onbmSubTab = key;
  await withViewTransition(() => renderMyMomentumPage('myOnboarding'));
}

async function onbmRetry() {
  _onbmState.planId = '';
  await _onbmReload(true);
}

registerActions({
  onbmTick,
  onbmSelectPlan,
  onbmSetLevel,
  onbmTogglePhase,
  onbmRetry,
  onbmSubTab,
});
