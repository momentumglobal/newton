// js/onboarding-expectations-ui.js — My Momentum > My Onboarding > Expectations & SLAs (N-501 / ONB-6, epic N-482)
//
// The reference tab for what we promise and how it is measured: one card per standards group (Candidate, Stakeholder, Quality bar),
// then the Delivery KPIs: the company goal, the company default SLA targets by project type, and the scorecard benchmarks (ONB-D53 / D54
// / D55). Copy is CONFIG.ONBOARDING.STANDARDS (onboarding-standards-config.js); the page model, including every live value, is
// onbExpectationsModel (onboarding-logic.js). The only read is the SLATargets list (getOnboardingSlaRows): the page draws at once and the
// SLA card fills in, or says "unavailable" with a retry (ONB-D59). Declarations at load, DOM only inside the functions. my-momentum.html
// only; never mobile.html, Newton for Claude or the Command Bar.

// ── Markup (pure) ───────────────────────────────────────────────────────

function _onbxTakenIn(g, T) {
  return g.takenIn ? `<p class="onb-hint">${escHtml(T.takenInLabel)}: ${escHtml(g.takenIn)}</p>` : '';
}

// One standards group: a Moment / Standard table, or a list of items, then the note and the Taught in line.
function _onbxGroupHtml(g, T) {
  let body = '';
  if (g.rows) {
    body = `<div class="table-scroll"><table class="data-table onbx-table"><thead><tr><th>${escHtml(T.momentHead)}</th><th>${escHtml(T.standardHead)}</th></tr></thead><tbody>${
      g.rows.map(r => `<tr><td>${escHtml(r.moment)}</td><td>${escHtml(r.standard)}</td></tr>`).join('')}</tbody></table></div>`;
  } else if (g.items) {
    body = `<ul class="onbx-list">${g.items.map(i => `<li class="onb-rit-text">${escHtml(i)}</li>`).join('')}</ul>`;
  }
  return `<section class="ppl-card onb-rit-card" aria-label="${escAttr(g.title)}" data-group="${escAttr(g.key)}">
      <h3 class="onb-rit-title">${escHtml(g.title)}</h3>
      ${body}${g.note ? `<p class="onb-rit-text">${escHtml(g.note)}</p>` : ''}${_onbxTakenIn(g, T)}
    </section>`;
}

// The SLA defaults card. state: 'loading' | 'ready' | 'error'. kpis.sla is null when the read failed or has not come back: never an empty table.
function _onbxSlaHtml(k, T, state) {
  const head = `<h3 class="onb-rit-title">${escHtml(k.slaTitle)}</h3><p class="onb-hint">${escHtml(k.slaIntro)}</p>`;
  if (state === 'loading') return `<section class="ppl-card onb-rit-card" data-sla="loading">${head}<p class="onb-hint">${escHtml(T.slaLoading)}</p></section>`;
  if (state === 'error' || !k.sla) {
    return `<section class="ppl-card onb-rit-card" data-sla="error">${head}${
      emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: T.slaUnavailable, actionLabel: T.retry, actionAct: ['onbxRetry'] })}</section>`;
  }
  const heads = [k.typeHead].concat(k.sla.metrics.map(m => m.label));
  return `<section class="ppl-card onb-rit-card" data-sla="ready">${head}
      <div class="table-scroll"><table class="data-table onbx-table"><thead><tr>${heads.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead><tbody>${
        k.sla.rows.map(r => `<tr><td>${escHtml(r.type)}</td>${r.cells.map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="onb-hint">${escHtml(k.slaOverrideNote)}</p>
    </section>`;
}

// The scorecard benchmarks: label and live value per row.
function _onbxBenchmarksHtml(k) {
  return `<section class="ppl-card onb-rit-card">
      <h3 class="onb-rit-title">${escHtml(k.benchmarksTitle)}</h3><p class="onb-hint">${escHtml(k.benchmarksIntro)}</p>
      <ul class="onb-steps">${k.benchmarks.map(b => `<li class="onb-step"><div class="onb-step-body"><div class="onb-step-label">${escHtml(b.label)}</div><div class="onb-step-meta"><span class="badge onb-chip">${escHtml(b.value)}</span></div></div></li>`).join('')}</ul>
      <p class="onb-rit-text">${escHtml(k.howUsed)}</p>
    </section>`;
}

// model = onbExpectationsModel({ slaRows }); state = 'loading' | 'ready' | 'error'. Page title and intro, the standards groups, then the KPIs.
function onbxPageHtml(model, state) {
  const T = model.text, k = model.kpis;
  const head = t => `<div class="onb-phase-head"><h2 class="onb-phase-title">${escHtml(t)}</h2></div>`;
  return `<div class="page-header"><h1 class="page-title">${escHtml(T.pageTitle)}</h1></div>
    <p class="onb-hint">${escHtml(T.intro)}</p>
    <section class="onb-phase onb-rit-section" data-section="standards">${model.groups.map(g => _onbxGroupHtml(g, T)).join('')}</section>
    <section class="onb-phase onb-rit-section" data-section="kpis">${head(k.title)}<p class="onb-rit-text">${escHtml(k.goal)}</p>
      ${_onbxSlaHtml(k, T, state)}${_onbxBenchmarksHtml(k)}</section>`;
}

// ── Draw ────────────────────────────────────────────────────────────────

// Called by renderMyOnboardingPage when Expectations & SLAs is the active sub-tab; it has just bumped _onbmState.token, so a read that
// comes back after the person has moved to another sub-tab (or redrawn) is dropped. Draws into #onb-page (the strip sits outside it).
async function renderOnboardingExpectationsPage() {
  const page = document.getElementById('onb-page');
  if (!page) return;
  const token = _onbmState.token;
  page.innerHTML = onbxPageHtml(onbExpectationsModel({}), 'loading');
  lucide.createIcons();
  let rows = null, state = 'ready';
  try { rows = await getOnboardingSlaRows(); } catch (e) { console.warn('Expectations & SLAs: SLA targets unavailable', e); state = 'error'; }
  const here = document.getElementById('onb-page');
  if (token !== _onbmState.token || !here) return;
  here.innerHTML = onbxPageHtml(onbExpectationsModel({ slaRows: rows }), state);
  lucide.createIcons();
}

async function onbxRetry() {
  _onbmState.token++;
  await renderOnboardingExpectationsPage();
}

registerActions({ onbxRetry });
