// js/onboarding-rituals-ui.js — My Momentum > My Onboarding > Processes & Rituals (N-500 / ONB-5, epic N-482)
//
// The reference tab for how the work is done here: step-flow cards for the individual and Newton data rituals, a compact list for the
// project and team rituals, and a signpost to the Role Checklist (ONB-D46). Page content, not data (ONB-D44): the cards are
// CONFIG.ONBOARDING.RITUALS (onboarding-content-config.js), resolved for the viewer by onbRitualsModel (onboarding-logic.js), which also
// decides which Newton touchpoints are links (ONB-D50). This file holds markup only: declarations at load, DOM only inside the
// functions. No network read, so there is no loading state and no stale-load guard. my-momentum.html only; never mobile.html,
// Newton for Claude or the Command Bar.

// ── Markup (pure) ───────────────────────────────────────────────────────

function _onbrChip(text, extra) {
  return `<span class="badge onb-chip${extra ? ' ' + extra : ''}">${escHtml(text)}</span>`;
}

// A Newton touchpoint: a same-page link when the viewer's role may open it (href), else plain text.
function _onbrTouchHtml(touch) {
  if (!touch || !touch.label) return '';
  return touch.href
    ? `<a class="onb-link" href="${escAttr(touch.href)}">${escHtml(touch.label)}</a>`
    : `<span class="onb-due">${escHtml(touch.label)}</span>`;
}

// One step of a flow: number, text, then owner / tool chips and the touchpoint.
function _onbrStepHtml(st, n) {
  const chips = [];
  if (st.owner) chips.push(_onbrChip(st.owner, 'onb-chip--owner'));
  if (st.tool) chips.push(_onbrChip(st.tool));
  return `<li class="onb-step">
        <span class="onb-rit-num" aria-hidden="true">${n}</span>
        <div class="onb-step-body">
          <div class="onb-step-label">${escHtml(st.text)}</div>
          <div class="onb-step-meta">${chips.join('')}${_onbrTouchHtml(st.touch)}</div>
        </div>
      </li>`;
}

// A ritual card: title, then either its text or its numbered steps, then When / Why / Taught in notes.
function _onbrCardHtml(card, T) {
  const notes = [
    card.when ? `<p class="onb-hint"><strong>${escHtml(T.whenLabel)}:</strong> ${escHtml(card.when)}</p>` : '',
    card.why ? `<p class="onb-hint"><strong>${escHtml(T.whyLabel)}:</strong> ${escHtml(card.why)}</p>` : '',
    card.takenIn ? `<p class="onb-hint">${escHtml(T.takenInLabel)}: ${escHtml(card.takenIn)}</p>` : '',
  ].join('');
  const body = card.steps && card.steps.length
    ? `<ol class="onb-steps onb-rit-steps">${card.steps.map((st, i) => _onbrStepHtml(st, i + 1)).join('')}</ol>`
    : (card.text ? `<p class="onb-rit-text">${escHtml(card.text)}</p>` : '');
  return `<section class="ppl-card onb-rit-card" aria-label="${escAttr(card.title)}">
      <h3 class="onb-rit-title">${escHtml(card.title)}</h3>
      ${body}${notes}
    </section>`;
}

// The compact list of project / team rituals: title, what happens, owner and cadence chips, touchpoint.
function _onbrRowHtml(row) {
  return `<li class="onb-step">
        <div class="onb-step-body">
          <div class="onb-step-label">${escHtml(row.title)}</div>
          <div class="onb-step-help">${escHtml(row.what)}</div>
          <div class="onb-step-meta">${_onbrChip(row.owner, 'onb-chip--owner')}${_onbrChip(row.cadence)}${_onbrTouchHtml(row.touch)}</div>
        </div>
      </li>`;
}

// The Role Checklist signpost. The Expectations & SLAs sentence is a link only when that sub-tab is shown (ONB-D52).
function _onbrSignpostHtml(sp, T) {
  const link = sp.link && sp.link.href ? ` <a class="onb-link" href="${escAttr(sp.link.href)}">${escHtml(sp.link.label)}</a>` : '';
  const sla = sp.slaLink
    ? `<a class="onb-link"${act('onbmSubTab', 'expectations')}>${escHtml(sp.slaText)}</a>`
    : escHtml(sp.slaText);
  return `<section class="ppl-card onb-rit-card">
      <p class="onb-rit-text">${escHtml(sp.text)}${link}</p>
      <p class="onb-rit-text">${sla}</p>
      ${sp.takenIn ? `<p class="onb-hint">${escHtml(T.takenInLabel)}: ${escHtml(sp.takenIn)}</p>` : ''}
    </section>`;
}

function _onbrSectionHtml(sec, T) {
  const head = `<div class="onb-phase-head"><h2 class="onb-phase-title">${escHtml(sec.title)}</h2></div>`;
  const intro = sec.intro ? `<p class="onb-hint">${escHtml(sec.intro)}</p>` : '';
  let body = '';
  if (sec.cards) body = sec.cards.map(c => _onbrCardHtml(c, T)).join('');
  else if (sec.rows) body = `<ul class="onb-steps">${sec.rows.map(_onbrRowHtml).join('')}</ul>`;
  else if (sec.signpost) body = _onbrSignpostHtml(sec.signpost, T);
  return `<section class="onb-phase onb-rit-section" data-section="${escAttr(sec.key)}">${head}${intro}${body}</section>`;
}

// model = onbRitualsModel(role, subTabs). The page title and intro, then the sections in order.
function onbrPageHtml(model) {
  const T = model.text;
  return `<div class="page-header"><h1 class="page-title">${escHtml(T.pageTitle)}</h1></div>
    <p class="onb-hint">${escHtml(T.intro)}</p>
    ${model.sections.map(sec => _onbrSectionHtml(sec, T)).join('')}`;
}

// ── Draw ────────────────────────────────────────────────────────────────

// Called by renderMyOnboardingPage when Processes & Rituals is the active sub-tab. Draws into #onb-page (the strip sits outside it).
function renderOnboardingRitualsPage() {
  const page = document.getElementById('onb-page');
  if (!page) return;
  page.innerHTML = onbrPageHtml(onbRitualsModel(_mmResolvedRole, onbSubTabs(_mmSignals)));
  lucide.createIcons();
}
