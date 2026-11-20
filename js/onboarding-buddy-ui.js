// js/onboarding-buddy-ui.js — My Momentum > Buddying (N-509 / ONB-4b, epic N-482)
//
// A buddy's own tab (ONB-D37), separate from My Onboarding so a buddy's actions are never mistaken for their own plan. Per joiner
// they buddy on an Active plan: a "Buddy view of <name>" banner, "Your actions" first (the Buddy-owned steps, open first, tickable
// per onbCanTick, with due / overdue chips and the content link), then "Rest of <name>'s plan", collapsed and read-only. No Library,
// no progress bar (ONB-D40). A person who is both joiner and buddy has both tabs (My Onboarding then shows their own plan only).
//
// The rules and the card model are pure in onboarding-logic.js (onbBuddyPlans, onbBuddyModel); the reads and the one write are
// getBuddyingView / tickOnboardingStep in api-onboarding.js (each re-checks); every word is CONFIG.ONBOARDING.BUDDY_TEXT (the step
// rows reuse PLAN_TEXT through onboarding-my-ui.js's _onbmStepHtml). This file holds markup and the actions only: declarations at
// load, DOM only inside the functions. my-momentum.html only, straight after onboarding-my-ui.js; never mobile.html, Newton for
// Claude or the Command Bar (ONB-D43).

let _onbbState = {
  token: 0,           // bumped by every load, so a slow read that finishes after the user moved on draws nothing
  view:  null,        // last getBuddyingView() result
  error: '',
  open:  new Set(),   // plan ids whose "Rest of <name>'s plan" the viewer has opened (it starts collapsed)
};

// ── Markup (pure) ───────────────────────────────────────────────────────

function _onbbActionsHtml(p, name, readOnly, counter) {
  const B = CONFIG.ONBOARDING.BUDDY_TEXT;
  const tickAttr = it => actOn('change', 'onbbTick', p.planId, it.itemKey, ACT_CHECKED);
  const rows = p.actions.map(it => _onbmStepHtml(readOnly ? Object.assign({}, it, { canTick: false }) : it, counter.n++, tickAttr)).join('');
  const count = p.openActions ? onbFillText(B.actionsOpen, { n: p.openActions }) : (p.actions.length ? B.actionsDone : '');
  return `<section class="onb-phase onb-buddy-actions">
      <div class="onb-phase-head">
        <h3 class="onb-phase-title">${escHtml(B.actionsTitle)}</h3>
        ${count ? `<span class="onb-phase-count">${escHtml(count)}</span>` : ''}
      </div>
      ${rows ? `<ul class="onb-steps">${rows}</ul>` : `<p class="ppl-muted-note">${escHtml(onbFillText(B.noActions, { name }))}</p>`}
    </section>`;
}

// The joiner's other steps: context only, so no box is ever enabled here whatever onbCanTick says (LM / CSD ticking is N-502).
function _onbbRestHtml(p, name, isOpen, counter) {
  const B = CONFIG.ONBOARDING.BUDDY_TEXT;
  if (!p.rest.length) return '';
  const tickAttr = it => actOn('change', 'onbbTick', p.planId, it.itemKey, ACT_CHECKED);
  const rows = p.rest.map(it => _onbmStepHtml(Object.assign({}, it, { canTick: false }), counter.n++, tickAttr)).join('');
  return `<section class="onb-phase onb-buddy-rest">
      <div class="onb-phase-head">
        <h3 class="onb-phase-title">${escHtml(onbFillText(B.restTitle, { name }))}</h3>
        <span class="onb-phase-count">${escHtml(onbFillText(B.restCount, { n: p.rest.length }))}</span>
        <button type="button" class="btn-secondary onb-phase-toggle" aria-expanded="${isOpen ? 'true' : 'false'}"${act('onbbToggleRest', p.planId)}>${escHtml(isOpen ? B.hide : B.show)}</button>
      </div>
      <p class="onb-hint">${escHtml(B.restHint)}</p>
      <ul class="onb-steps"${isOpen ? '' : ' hidden'}>${rows}</ul>
    </section>`;
}

// One joiner's card. p = an onbBuddyModel() result.
function _onbbCardHtml(p, ui, readOnly, counter) {
  const B = CONFIG.ONBOARDING.BUDDY_TEXT;
  const name = p.joiner.name || B.joinerFallback;
  const start = p.joiner.startDate ? onbFillText(CONFIG.ONBOARDING.PLAN_TEXT.startsOn, { date: _onbmDate(p.joiner.startDate) }) : '';
  return `<div class="onb-buddy-card">
    <div class="onb-buddy-banner">
      <h2 class="onb-buddy-banner-title">${escHtml(onbFillText(B.banner, { name }))}</h2>
      ${start ? `<div class="onb-head-start">${escHtml(start)}</div>` : ''}
    </div>
    ${_onbbActionsHtml(p, name, readOnly, counter)}
    ${_onbbRestHtml(p, name, (ui.open || []).includes(p.planId), counter)}
  </div>`;
}

// ui = { open: [plan ids], error }. view = getBuddyingView() result, or null when it failed (ui.error says why).
function onbbPageHtml(view, ui) {
  const B = CONFIG.ONBOARDING.BUDDY_TEXT;
  const u = ui || { open: [], error: '' };
  const head = `<div class="page-header"><h1 class="page-title">${escHtml(B.pageTitle)}</h1></div>`;
  if (u.error) return head + emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: B.loadFailed, message: u.error, actionLabel: B.retry, actionAct: ['onbbRetry'] });
  if (!view || view.none || !view.plans || !view.plans.length) return head + emptyStateBlock({ icon: 'inbox', title: B.pageTitle, message: B.noPlans });
  const preview = view.gateState === 'preview';
  const counter = { n: 0 };
  return head
    + (preview ? `<p class="onb-note">${escHtml(CONFIG.ONBOARDING.PLAN_TEXT.previewNote)}</p>` : '')
    + view.plans.map(p => _onbbCardHtml(p, u, preview, counter)).join('');
}

// ── Load and draw ───────────────────────────────────────────────────────

function _onbbDraw() {
  const page = document.getElementById('onb-buddy-page');
  if (!page) return;
  const s = _onbbState;
  page.innerHTML = onbbPageHtml(s.view, { open: Array.from(s.open), error: s.error });
  lucide.createIcons();
}

// The tab label carries the open-action count (ONB-D39): after a fresh read, bring the nav in step with the page.
function _onbbSyncNav(view) {
  if (!view || view.none || !view.plans) return;
  const n = view.plans.reduce((sum, p) => sum + p.openActions, 0);
  if (_mmSignals.onbActions === n) return;
  _mmSignals.onbActions = n;
  renderMyMomentumNav(_mmResolvedRole);
}

// Reads the page and draws it, unless the user moved on meanwhile (newer load, or another tab).
async function _onbbLoad(token) {
  const s = _onbbState;
  let view = null, error = '';
  try {
    view = await getBuddyingView();
  } catch (e) {
    console.error('Buddying: load failed', e);
    error = (e && e.message) || String(e);
  }
  if (token !== s.token || _mmCurrentPage !== 'myBuddying' || !document.getElementById('onb-buddy-page')) return;
  s.view = view;
  s.error = error;
  _onbbSyncNav(view);
  _onbbDraw();
}

// Called by renderMyMomentumPage. Draws into #onb-buddy-page so the area header that page inserts is never wiped by a redraw.
async function renderBuddyingPage() {
  const main = document.getElementById('main-content');
  const token = ++_onbbState.token;
  main.innerHTML = `<div id="onb-buddy-page">${dashboardSkeleton(2)}</div>`;
  await _onbbLoad(token);
}

async function _onbbReload(withSkeleton) {
  const page = document.getElementById('onb-buddy-page');
  if (!page) return;
  const token = ++_onbbState.token;
  if (withSkeleton) page.innerHTML = dashboardSkeleton(2);
  await _onbbLoad(token);
}

// ── Actions ─────────────────────────────────────────────────────────────

async function onbbTick(planId, itemKey, checked) {
  const T = CONFIG.ONBOARDING.PLAN_TEXT;
  document.querySelectorAll('#onb-buddy-page .onb-step-check').forEach(el => { el.disabled = true; });   // one write at a time
  try {
    await tickOnboardingStep({ planId, itemKey, done: checked === true });
  } catch (e) {
    console.error('Buddying: tick failed', e);
    toast(`${T.tickFailed} ${(e && e.message) || e}`, { type: 'error' });
  }
  await _onbbReload(false);   // always redraw from fresh data, so a box never shows a state the server does not hold
}

function onbbToggleRest(planId) {
  const open = _onbbState.open;
  const id = String(planId == null ? '' : planId);
  if (open.has(id)) open.delete(id); else open.add(id);
  _onbbDraw();
}

async function onbbRetry() {
  await _onbbReload(true);
}

registerActions({
  onbbTick,
  onbbToggleRest,
  onbbRetry,
});
