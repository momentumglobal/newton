// js/onboarding-plan-ui.js — the Onboarding card on the employee record (N-497 / ONB-2, epic N-482)
//
// Drawn into #emp-onboarding-slot (employee-page.js) after the page has painted. Admin only (CONFIG.ROLE_CAPABILITIES.onbPlan:
// the CSD holds Admin). Leadership, People Ops and Ghost-as-non-admin get no card and the page makes no OnboardingPlans read
// (ONB-D9). The card starts a plan (optional buddy, ONB-D21), changes the buddy, cancels and restarts a plan, and shows the
// plan's progress counts. The joiner's own plan screen is N-499; the line manager / CSD progress view is N-502.
//
// The rules are pure in onboarding-logic.js (onbCardState, onbStartCheck, onbBuddyCandidates, onbPlanSummary); the writes are
// in api-onboarding.js (each re-checks and refuses non-admins); every message and number is CONFIG.ONBOARDING.TEXT /
// START_REASONS. This file holds markup and the five actions only (N-541 adds Close plan record): declarations at load, DOM only inside the functions.
// people.html only; never mobile.html, Newton for Claude or the Command Bar.

let _onbCardCtx = null;   // { person, people, token } of the open record, so an action can redraw the card

// ── Markup (pure) ───────────────────────────────────────────────────────

function _onbFill(text, vars) {
  return Object.keys(vars || {}).reduce((s, k) => s.split('{' + k + '}').join(String(vars[k])), String(text));
}

function _onbBuddySelectHtml(buddies, current) {
  const T = CONFIG.ONBOARDING.TEXT;
  const cur = String(current || '').trim().toLowerCase();
  const opts = [`<option value="">${escHtml(T.buddyNone)}</option>`].concat(buddies.map(b =>
    `<option value="${escAttr(b.email)}"${b.email === cur ? ' selected' : ''}>${escHtml(b.name)}</option>`));
  return `<select id="onb-buddy" aria-label="${escAttr(T.buddyLabel)}">${opts.join('')}</select>`;
}

function _onbRowHtml(label, valueHtml) {
  return `<div class="emp-row"><dt>${escHtml(label)}</dt><dd>${valueHtml}</dd></div>`;
}

// m = { state: onbCardState(), person, buddies, summary, startedBy, startedOn, buddyEmail }
function onbCardHtml(m) {
  const O = CONFIG.ONBOARDING;
  const T = O.TEXT;
  const st = m.state || { kind: 'blocked', reason: 'out-of-scope', plan: null };
  const pid = Number(m.person && m.person.id);
  let body = '';
  if (st.kind === 'ready') {
    body = `<dl class="emp-list">${_onbRowHtml(T.buddyLabel, _onbBuddySelectHtml(m.buddies || [], ''))}</dl>
      <div class="emp-actions"><button type="button" class="btn-primary"${act('onbStartPlan', pid)}>${escHtml(T.start)}</button></div>`;
  } else if (st.kind === 'active') {
    const s = m.summary || { total: 0, done: 0, overdue: 0 };
    const progress = s.total
      ? escHtml(_onbFill(T.stepsDone, { done: s.done, total: s.total })) + (s.overdue ? ' · ' + escHtml(_onbFill(T.overdue, { n: s.overdue })) : '')
      : escHtml(T.noSteps);
    body = `<dl class="emp-list">
        ${_onbRowHtml(T.status, escHtml(O.PLAN_ACTIVE))}
        ${_onbRowHtml(T.track, escHtml(onbTrackLabel(st.plan.Track)))}
        ${_onbRowHtml(T.started, escHtml(m.startedBy || '') + (m.startedOn ? ' · ' + escHtml(m.startedOn) : ''))}
        ${_onbRowHtml(T.buddyLabel, `${_onbBuddySelectHtml(m.buddies || [], m.buddyEmail)} <button type="button" class="btn-secondary"${act('onbChangeBuddy', String(st.plan.id))}>${escHtml(T.changeBuddy)}</button>`)}
        ${_onbRowHtml(T.progress, progress)}
      </dl>
      <div class="emp-actions"><button type="button" class="btn-secondary"${act('onbCancelPlan', String(st.plan.id))}>${escHtml(T.cancel)}</button></div>`;
  } else if (st.kind === 'cancelled') {
    body = `<p class="ppl-muted-note">${escHtml(T.cancelledNote)}</p>
      <div class="emp-actions"><button type="button" class="btn-primary"${act('onbRestartPlan', String(st.plan.id))}>${escHtml(T.restart)}</button></div>`;
  } else if (st.kind === 'complete') {
    body = `<p class="ppl-muted-note">${escHtml(T.completeNote)}</p>`;
  } else if (st.kind === 'derived') {   // N-541 (ONB-D129): closed by the LM's Day-30 sign-off, stored Status still Active
    body = `<p class="ppl-muted-note">${escHtml(T.derivedNote)}</p>
      <div class="emp-actions"><button type="button" class="btn-secondary"${act('onbCloseRecord', String(st.plan.id))}>${escHtml(T.closeRecord)}</button></div>`;
  } else {
    body = `<p class="ppl-muted-note">${escHtml(onbReasonText(st.reason, onbTrackFor(m.person), m.person && m.person.StaffFunction))}</p>`;
  }
  return `<section class="ppl-card emp-card emp-onboarding" id="emp-onboarding">
      <div class="emp-section-head"><h2 class="emp-section-title">${escHtml(T.cardTitle)}</h2></div>
      <p class="ppl-card-hint">${escHtml(T.cardHint)}</p>
      ${body}
    </section>`;
}

// ── Load ────────────────────────────────────────────────────────────────

function _onbSlot(token) {
  return document.querySelector(`[data-emp-page-token="${token}"] #emp-onboarding-slot`);
}

// Called by openEmployeePage after paint. No read unless the viewer holds onbPlan. fresh drops the caches (after a write).
async function onbLoadPlanCard(person, people, token, { fresh = false } = {}) {
  if (!roleCan(_resolvedRole, 'onbPlan')) return;   // Admin (the effective role, so Ghost-aware); nobody else reads anything
  const O = CONFIG.ONBOARDING;
  _onbCardCtx = { person, people, token };
  const slot = _onbSlot(token);
  if (!slot) return;
  try {
    if (fresh) [O.PLAN_LIST, O.SIGNOFF.LIST, 'ChecklistProgress', 'ChecklistTemplates'].forEach(_cacheInvalidate);
    const [plans, templates, sw, directory] = await Promise.all([
      getOnboardingPlans({ personId: person.id }), getChecklistTemplates(O.RECORD_TYPE), readOnboardingSwitch(),
      _onbDirectoryOrPeople(people),   // N-541 (ONB-D127): a line manager with no People row
    ]);
    const todayISO = localDayISO();
    const state = onbCardState({ person, people, plans, templates, mode: sw.mode, pilot: sw.pilot, todayISO, directory });
    const m = { state, person, buddies: onbBuddyCandidates(people, person.id, todayISO), summary: null, startedBy: '', startedOn: '', buddyEmail: '' };
    if (state.kind === 'active') {
      const plan = state.plan;
      const rows = await getChecklistProgress(O.RECORD_TYPE, { recordId: person.id });
      m.summary = onbPlanSummary({
        steps: activeChecklistItems(templates, O.RECORD_TYPE, plan.Track),
        progress: resolveChecklistProgress(rows), startDate: spDateIn(person.StartDate) || '', todayISO,
      });
      const by = (pdpEmailIndex(people).get(String(plan.StartedByEmail || '').trim().toLowerCase()) || [])[0];
      m.startedBy = (by && by.EmployeeName) || plan.StartedByEmail || '';
      const on = spDateIn(plan.StartedAt);
      m.startedOn = on ? formatLongDay(on) : '';
      m.buddyEmail = plan.BuddyEmail || '';
    }
    const target = _onbSlot(token);
    if (!target) return;   // the user navigated away mid-load
    target.innerHTML = onbCardHtml(m);
  } catch (e) {
    console.warn('N-497: onboarding card load failed', e && e.message);
    const target = _onbSlot(token);
    if (target) target.innerHTML = `<section class="ppl-card emp-card emp-onboarding"><p class="ppl-muted-note">${escHtml(O.TEXT.loadFailed)}</p></section>`;
  }
}

// ── Actions ─────────────────────────────────────────────────────────────

// Runs one write with the card locked, toasts the outcome, redraws from fresh data.
async function _onbRun(write, okMessage) {
  const ctx = _onbCardCtx;
  if (!ctx) return;
  const T = CONFIG.ONBOARDING.TEXT;
  const root = document.getElementById('emp-onboarding');
  if (root) { root.setAttribute('aria-busy', 'true'); root.querySelectorAll('button, select').forEach(el => { el.disabled = true; }); }
  try {
    await write();
    toast(okMessage, { type: 'success' });
  } catch (e) {
    console.error('N-497: onboarding plan write failed', e);
    toast(`${T.actionFailed} ${e.message}`, { type: 'error' });
  }
  await onbLoadPlanCard(ctx.person, ctx.people, ctx.token, { fresh: true });
}

function _onbBuddyValue() {
  const sel = document.getElementById('onb-buddy');
  return sel ? sel.value : '';
}

async function onbStartPlan(personId) {
  await _onbRun(() => startOnboardingPlan({ personId: Number(personId), buddyEmail: _onbBuddyValue() }), CONFIG.ONBOARDING.TEXT.startOk);
}

async function onbChangeBuddy(planId) {
  await _onbRun(() => setOnboardingBuddy(planId, _onbBuddyValue()), CONFIG.ONBOARDING.TEXT.buddyOk);
}

async function onbCancelPlan(planId) {
  const T = CONFIG.ONBOARDING.TEXT;
  if (!(await confirmModal({ message: T.cancelConfirm, confirmLabel: T.cancelLabel, danger: true }))) return;
  await _onbRun(() => cancelOnboardingPlan(planId), T.cancelOk);
}

async function onbRestartPlan(planId) {
  await _onbRun(() => restartOnboardingPlan(planId), CONFIG.ONBOARDING.TEXT.restartOk);
}

// N-541 (ONB-D129): file a plan the line manager's Day-30 sign-off closed.
async function onbCloseRecord(planId) {
  await _onbRun(() => closeOnboardingPlanRecord(planId), CONFIG.ONBOARDING.TEXT.closeOk);
}

registerActions({
  onbStartPlan,
  onbChangeBuddy,
  onbCancelPlan,
  onbRestartPlan,
  onbCloseRecord,
});
