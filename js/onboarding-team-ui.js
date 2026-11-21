// js/onboarding-team-ui.js — My Momentum > My Team > Onboarding (N-502 / ONB-7, epic N-482)
//
// The line manager's and CSD's page (ONB-D72): three tiles, "My actions" (the steps they own and the sign-offs they may take now), then one
// card per joiner — % complete, overdue, next step, buddy, PDP status — that opens to the open steps grouped by owner and the sign-offs
// (intake role-play, Day-30 line manager, CSD countersign). Completed joiners sit in a collapsed read-only section.
//
// The rules and the page model are pure in onboarding-team.js (onbTeamModel); the reads and the writes are getOnboardingTeamView /
// tickOnboardingStep / signOffOnboarding / countersignOnboarding in api-onboarding.js (each re-checks every rule). Every word is
// CONFIG.ONBOARDING.TEAM_TEXT; the step rows reuse onboarding-my-ui.js (_onbmStepHtml, _onbmChip, _onbmDate) and PLAN_TEXT. This file holds
// markup and actions only: declarations at load, DOM only inside the functions. my-momentum.html only, after onboarding-expectations-ui.js;
// never mobile.html, Newton for Claude or the Command Bar (ONB-D43).

let _onbtState = {
  token:         0,           // bumped by every load, so a slow read that finishes after the user moved on draws nothing
  view:          null,        // last getOnboardingTeamView() result
  error:         '',
  open:          new Set(),   // plan ids whose card the viewer has opened (cards start collapsed)
  completedOpen: false,       // the Completed section starts collapsed
  person:        '',          // plan id the page is narrowed to ('' = every joiner)
};

// ── Markup (pure) ───────────────────────────────────────────────────────

function _onbtTickAttr(planId) {
  return it => actOn('change', 'onbtTick', planId, it.itemKey, ACT_CHECKED);
}

function _onbtTilesHtml(totals) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const tile = (n, label) => `<div class="ppl-card onbt-tile"><div class="onbt-tile-num">${escHtml(String(n))}</div><div class="onbt-tile-label">${escHtml(label)}</div></div>`;
  return `<div class="onbt-tiles">${tile(totals.active, T.tileActive)}${tile(totals.overdue, T.tileOverdue)}${tile(totals.awaiting, T.tileSignoff)}</div>`;
}

// One sign-off the viewer may take now, as a row in "My actions". kind: 'roleplay' | 'day30' | 'countersign'.
function _onbtActionRowHtml(planId, so) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const btn = so.kind === 'countersign'
    ? `<button type="button" class="btn-primary"${act('onbtCountersign', planId)}>${escHtml(T.btnCountersign)}</button>`
    : `<button type="button" class="btn-primary"${act('onbtSignoff', planId, so.kind)}>${escHtml(T.btnSign)}</button>`;
  return `<li class="onb-step"><div class="onb-step-body"><div class="onb-step-label">${escHtml(so.label)}</div><div class="onb-step-meta">${btn}</div></div></li>`;
}

function _onbtActionsHtml(actions, counter) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const body = (actions || []).length
    ? actions.map(a => `<div class="onbt-group">
        <h3 class="onbt-sub">${escHtml(a.name)}</h3>
        <ul class="onb-steps">${a.entries.map(e => e.type === 'signoff' ? _onbtActionRowHtml(a.planId, e) : _onbmStepHtml(e.item, counter.n++, _onbtTickAttr(a.planId))).join('')}</ul>
      </div>`).join('')
    : `<p class="ppl-muted-note">${escHtml(T.actionsEmpty)}</p>`;
  return `<section class="ppl-card onbt-section">
      <div class="onb-phase-head"><h2 class="onb-phase-title">${escHtml(T.actionsTitle)}</h2></div>
      ${body}
    </section>`;
}

// One line of the sign-offs block. part = a row.signoff entry; the buttons follow its rights.
function _onbtSignoffRowHtml(row, part, kind) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const state = part.signed
    ? _onbmChip(onbFillText(T.signedBy, { name: part.byName, date: _onbmDate(part.at) }), 'dh-badge-success')
    : _onbmChip(T.notSigned);
  const sign = kind === 'countersign'
    ? `<button type="button" class="btn-primary"${act('onbtCountersign', row.planId)}>${escHtml(T.btnCountersign)}</button>`
    : `<button type="button" class="btn-primary"${act('onbtSignoff', row.planId, kind)}>${escHtml(T.btnSign)}</button>`;
  const withdraw = `<button type="button" class="btn-secondary"${act('onbtWithdraw', row.planId, kind)}>${escHtml(T.btnWithdraw)}</button>`;
  const reason = !part.signed && !part.canSign && part.reason && !row.complete && part.reason !== T.reasons.preview ? part.reason : '';
  return `<li class="onbt-signoff">
      <div class="onbt-signoff-label">${escHtml(part.label)}</div>
      <div class="onbt-signoff-state">${state}</div>
      <div class="onbt-signoff-act">${part.canSign ? sign : ''}${part.canWithdraw ? withdraw : ''}</div>
      ${reason ? `<div class="onbt-signoff-why">${escHtml(reason)}</div>` : ''}
    </li>`;
}

function _onbtSignoffHtml(row) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const s = row.signoff;
  return `<section class="onbt-block onbt-block--signoffs">
      <h4 class="onbt-sub">${escHtml(T.signoffTitle)}</h4>
      <ul class="onbt-signoffs">
        ${_onbtSignoffRowHtml(row, s.roleplay, 'roleplay')}
        ${_onbtSignoffRowHtml(row, s.day30lm, 'day30')}
        ${_onbtSignoffRowHtml(row, s.csd, 'countersign')}
      </ul>
      <p class="onbt-signoff-pdp">${escHtml(T.pdpTitle)}: ${escHtml(row.pdp.text)}</p>
    </section>`;
}

function _onbtByOwnerHtml(row, counter) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const groups = row.byOwner.map(g => `<div class="onbt-owner">
      <div class="onb-phase-head">
        <h5 class="onbt-owner-title">${escHtml(g.name ? `${g.label} · ${g.name}` : g.label)}</h5>
        <span class="onb-phase-count">${escHtml(onbFillText(T.ownerOpen, { n: g.items.length }))}</span>
      </div>
      <ul class="onb-steps">${g.items.map(it => _onbmStepHtml(it, counter.n++, _onbtTickAttr(row.planId))).join('')}</ul>
    </div>`).join('');
  return `<section class="onbt-block">
      <h4 class="onbt-sub">${escHtml(T.byOwnerTitle)}</h4>
      ${groups || `<p class="ppl-muted-note">${escHtml(T.noOpen)}</p>`}
    </section>`;
}

function _onbtChipsHtml(row) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const pdpTone = row.pdp.tone === 'success' ? 'dh-badge-success' : (row.pdp.tone === 'warn' ? 'dh-badge-warn' : '');
  return [
    row.complete ? _onbmChip(T.completeChip, 'dh-badge-success') : '',
    row.overdue ? `<span class="badge badge--overdue">${escHtml(onbFillText(T.overdue, { n: row.overdue }))}</span>` : '',
    _onbmChip(row.pdp.text, pdpTone),
  ].join('');
}

// One joiner's card. row = an onbTeamRow() result.
function _onbtCardHtml(row, isOpen, counter) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const start = [row.startDate ? onbFillText(T.startsOn, { date: _onbmDate(row.startDate) }) : '', row.dayNumber ? onbFillText(T.dayN, { n: row.dayNumber }) : '']
    .filter(Boolean).join(' · ');
  const next = row.next ? onbFillText(T.next, { label: row.next.label, due: _onbmDate(row.next.dueISO) }) : (row.total && row.done === row.total ? T.allDone : '');
  const text = onbFillText(T.progress, { done: row.done, total: row.total, pct: row.pct });
  const progress = row.total
    ? `<progress class="onb-progress-bar" max="${row.total}" value="${row.done}" aria-label="${escAttr(text)}"></progress>
       <div class="onb-progress-text">${escHtml(text)}</div>
       ${next ? `<div class="onb-progress-next">${escHtml(next)}</div>` : ''}`
    : `<div class="onb-progress-text">${escHtml(T.noSteps)}</div>`;
  return `<section class="ppl-card onbt-card">
      <div class="onbt-head">
        <div>
          <h3 class="onb-head-name">${escHtml(row.name)}</h3>
          ${start ? `<div class="onb-head-start">${escHtml(start)}</div>` : ''}
        </div>
        <div class="onbt-chips">${_onbtChipsHtml(row)}</div>
        <button type="button" class="btn-secondary onb-phase-toggle" aria-expanded="${isOpen ? 'true' : 'false'}"${act('onbtToggle', row.planId)}>${escHtml(isOpen ? T.hide : T.show)}</button>
      </div>
      <dl class="onb-meta">
        <div><dt>${escHtml(T.lineManager)}</dt><dd>${escHtml(row.lineManagerName || '—')}</dd></div>
        <div><dt>${escHtml(T.buddy)}</dt><dd>${escHtml(row.buddyName || T.buddyNone)}</dd></div>
      </dl>
      ${progress}
      ${isOpen ? `<div class="onbt-details">${_onbtByOwnerHtml(row, counter)}${_onbtSignoffHtml(row)}</div>` : ''}
    </section>`;
}

function _onbtCompletedHtml(rows, open, counter) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  if (!rows.length) return '';
  return `<section class="onbt-section">
      <div class="onb-phase-head">
        <h2 class="onb-phase-title">${escHtml(T.completedTitle)}</h2>
        <span class="onb-phase-count">${escHtml(String(rows.length))}</span>
        <button type="button" class="btn-secondary onb-phase-toggle" aria-expanded="${open ? 'true' : 'false'}"${act('onbtToggleCompleted')}>${escHtml(open ? T.hide : T.show)}</button>
      </div>
      ${open ? rows.map(r => _onbtCardHtml(r, true, counter)).join('') : ''}
    </section>`;
}

// The joiner filter: shown with two or more active joiners. selected = plan id or ''.
function _onbtFilterHtml(rows, selected) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  if ((rows || []).length < 2) return '';
  const opts = [{ id: '', name: T.filterAll }].concat(rows.map(r => ({ id: r.planId, name: r.name })))
    .map(o => `<option value="${escAttr(o.id)}"${o.id === selected ? ' selected' : ''}>${escHtml(o.name)}</option>`).join('');
  return `<div class="form-group onbt-filter"><label for="onbt-person">${escHtml(T.filterLabel)}</label><select id="onbt-person"${actOn('change', 'onbtFilter', ACT_VALUE)}>${opts}</select></div>`;
}

// ui = { open: [plan ids], completedOpen, error, person }. view = getOnboardingTeamView() result, or null when it failed (ui.error says why).
// Returns the page body only (the heading and the My Team tab strip are drawn once by renderTeamOnboardingPage).
function onbtPageHtml(view, ui) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const u = ui || { open: [], completedOpen: false, error: '' };
  if (u.error) return emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: T.loadFailed, message: u.error, actionLabel: T.retry, actionAct: ['onbtRetry'] });
  if (!view || view.none || (!view.rows.length && !view.completed.length)) return emptyStateBlock({ icon: 'inbox', title: T.pageTitle, message: T.noJoiners });
  const counter = { n: 0 };
  const open = u.open || [];
  const everyone = view.rows;
  const pick = u.person && everyone.some(r => r.planId === u.person) ? u.person : '';   // a plan that has left the list clears the filter
  const keep = r => !pick || r.planId === pick;
  view = Object.assign({}, view, { rows: everyone.filter(keep), actions: (view.actions || []).filter(keep), completed: view.completed.filter(keep) });
  return (view.gateState === 'preview' ? `<p class="onb-note">${escHtml(T.previewNote)}</p>` : '')
    + _onbtTilesHtml(view.totals)
    + _onbtFilterHtml(everyone, pick)
    + (view.readOnly || view.gateState === 'preview' ? '' : _onbtActionsHtml(view.actions, counter))
    + (view.rows.length ? `<section class="onbt-section"><div class="onb-phase-head"><h2 class="onb-phase-title">${escHtml(T.joinersTitle)}</h2></div>${view.rows.map(r => _onbtCardHtml(r, open.includes(r.planId), counter)).join('')}</section>` : '')
    + _onbtCompletedHtml(view.completed, !!u.completedOpen, counter);
}

// ── Load and draw ───────────────────────────────────────────────────────

function _onbtShell(inner) {
  const subs = mmTeamSubTabs(_mmTabCtx());
  return `<div class="page-header"><h1 class="page-title">${escHtml(CONFIG.ONBOARDING.TEAM_TEXT.pageTitle)}</h1></div>${subs.length >= 2 ? mmTeamTabsHtml('onboarding', subs) : ''}<div id="onbt-page">${inner}</div>`;
}

function _onbtDraw() {
  const page = document.getElementById('onbt-page');
  if (!page) return;
  const s = _onbtState;
  page.innerHTML = onbtPageHtml(s.view, { open: Array.from(s.open), completedOpen: s.completedOpen, error: s.error, person: s.person });
  lucide.createIcons();
}

// Reads the page and draws it, unless the user moved on meanwhile (newer load, or another tab).
async function _onbtLoad(token) {
  const s = _onbtState;
  let view = null, error = '';
  try {
    view = await getOnboardingTeamView();
  } catch (e) {
    console.error('My Team onboarding: load failed', e);
    error = (e && e.message) || String(e);
  }
  if (token !== s.token || _mmCurrentPage !== 'myTeam' || !document.getElementById('onbt-page')) return;
  s.view = view;
  s.error = error;
  _onbtDraw();
}

// Called by renderMyTeamPage. Draws into #onbt-page so the heading and tab strip are never wiped by a redraw.
async function renderTeamOnboardingPage() {
  const main = document.getElementById('main-content');
  const token = ++_onbtState.token;
  main.innerHTML = _onbtShell(dashboardSkeleton(2));
  await _onbtLoad(token);
}

async function _onbtReload() {
  if (!document.getElementById('onbt-page')) return;
  await _onbtLoad(++_onbtState.token);
}

// ── Actions ─────────────────────────────────────────────────────────────

function _onbtLock() {
  document.querySelectorAll('#onbt-page .onb-step-check, #onbt-page button').forEach(el => { el.disabled = true; });   // one write at a time
}

async function onbtTick(planId, itemKey, checked) {
  const T = CONFIG.ONBOARDING.PLAN_TEXT;
  _onbtLock();
  try {
    await tickOnboardingTeamStep({ planId, itemKey, done: checked === true });
  } catch (e) {
    console.error('My Team onboarding: tick failed', e);
    toast(`${T.tickFailed} ${(e && e.message) || e}`, { type: 'error' });
  }
  await _onbtReload();   // always redraw from fresh data, so a box never shows a state the server does not hold
}

async function _onbtSignoff(planId, kind, action) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  _onbtLock();
  try {
    const res = await signOffOnboarding({ planId, kind, action });
    toast(res && res.warning ? T.stepWarn : (action === 'withdraw' ? T.withdrawOk : T.signoffOk), { type: res && res.warning ? 'info' : 'success' });
  } catch (e) {
    console.error('My Team onboarding: sign-off failed', e);
    toast(`${T.actionFailed} ${(e && e.message) || e}`, { type: 'error' });
  }
  await _onbtReload();
}

async function onbtSignoff(planId, kind) { await _onbtSignoff(planId, kind, 'sign'); }
async function onbtWithdraw(planId, kind) { await _onbtSignoff(planId, kind, 'withdraw'); }

async function onbtCountersign(planId) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const all = _onbtState.view ? _onbtState.view.rows.concat(_onbtState.view.completed) : [];
  const row = all.find(r => r.planId === String(planId));
  if (!(await confirmModal({ message: onbFillText(T.confirmCountersign, { name: row ? row.name : '' }), confirmLabel: T.confirmLabel }))) return;
  _onbtLock();
  try {
    await countersignOnboarding({ planId });
    toast(T.countersignOk, { type: 'success' });
  } catch (e) {
    console.error('My Team onboarding: countersign failed', e);
    toast(`${T.actionFailed} ${(e && e.message) || e}`, { type: 'error' });
  }
  await _onbtReload();
}

function onbtToggle(planId) {
  const open = _onbtState.open;
  const id = String(planId == null ? '' : planId);
  if (open.has(id)) open.delete(id); else open.add(id);
  _onbtDraw();
}

function onbtFilter(planId) {
  _onbtState.person = String(planId == null ? '' : planId);
  _onbtDraw();
}

function onbtToggleCompleted() {
  _onbtState.completedOpen = !_onbtState.completedOpen;
  _onbtDraw();
}

async function onbtRetry() {
  _onbtState.error = '';
  await _onbtReload();
}

registerActions({
  onbtTick,
  onbtSignoff,
  onbtWithdraw,
  onbtCountersign,
  onbtToggle,
  onbtToggleCompleted,
  onbtFilter,
  onbtRetry,
});
