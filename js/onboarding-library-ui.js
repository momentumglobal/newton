// js/onboarding-library-ui.js — My Momentum > My Onboarding > Learning Library (N-518, epic N-482)
//
// The all-staff reference tab for the Library: the Library section of the Talent Partner track in Checklists > Onboarding (ONB-D102),
// read-only for everyone (ONB-D103: a joiner ticks the same items in their Onboarding Plan), with the All levels / Foundation /
// Experienced filter the plan uses (ONB-D104). Copy is CONFIG.ONBOARDING.LIBRARY_TEXT (onboarding-config.js); the page model is
// onbLibraryTabModel (onboarding-logic.js); the one read is getLearningLibraryRows (api-onboarding.js). The page draws at once and the list
// fills in, or says it could not load with a retry. Declarations at load, DOM only inside the functions. my-momentum.html only; never
// mobile.html, Newton for Claude or the Command Bar.

let _onblState = {
  level: '',     // the level filter key, '' = all levels; kept for the page session only
  rows:  null,   // last getLearningLibraryRows() result (null = not read yet or failed)
  state: 'loading',
};

// ── Markup (pure) ───────────────────────────────────────────────────────

function _onblChip(text, extra) {
  return `<span class="badge onb-chip${extra ? ' ' + extra : ''}">${escHtml(text)}</span>`;
}

// One Library item, read-only: label, help, level chip (All levels when untagged), Self-guided chip and an Open link when it has one.
function _onblItemHtml(it, T) {
  const link = it.contentUrl
    ? `<a class="onb-link" href="${escAttr(openInBrowserUrl(it.contentUrl))}" target="_blank" rel="noopener noreferrer">${escHtml(T.open)} <i data-lucide="external-link" aria-hidden="true"></i></a>`
    : '';
  return `<li class="onb-step">
        <div class="onb-step-body">
          <div class="onb-step-label">${escHtml(it.label)}</div>
          ${it.help ? `<div class="onb-step-help">${escHtml(it.help)}</div>` : ''}
          <div class="onb-step-meta">${_onblChip(it.levelTag || T.everyLevel)}${_onblChip(T.selfGuided)}${link}</div>
        </div>
      </li>`;
}

// model = onbLibraryTabModel({ templates, level }); state = 'loading' | 'ready' | 'error'; level = the active filter key.
function onblPageHtml(model, state, level) {
  const O = CONFIG.ONBOARDING;
  const T = model.text;
  const lv = level || '';
  const buttons = O.LEVEL_FILTERS.map(l =>
    `<button type="button" class="btn-secondary onb-level${l.key === lv ? ' is-active' : ''}" aria-pressed="${l.key === lv ? 'true' : 'false'}"${act('onblSetLevel', l.key)}>${escHtml(l.label)}</button>`).join('');
  let body;
  if (state === 'loading') body = `<p class="onb-hint">${escHtml(T.loading)}</p>`;
  else if (state === 'error') body = emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: T.loadFailed, actionLabel: T.retry, actionAct: ['onblRetry'] });
  else if (!model.all.length) body = `<p class="ppl-muted-note">${escHtml(T.empty)}</p>`;
  else {
    body = (model.items.length
      ? `<ul class="onb-steps">${model.items.map(it => _onblItemHtml(it, T)).join('')}</ul>`
      : `<p class="ppl-muted-note">${escHtml(T.emptyLevel)}</p>`)
      + (model.hidden ? `<p class="onb-hint">${escHtml(onbFillText(T.filtered, { n: model.hidden }))}</p>` : '');
  }
  return `<div class="page-header"><h1 class="page-title">${escHtml(T.pageTitle)}</h1></div>
    <p class="onb-hint">${escHtml(T.intro)} <a class="onb-link" href="${escAttr(O.LIBRARY_URL)}" target="_blank" rel="noopener noreferrer">${escHtml(T.browse)} <i data-lucide="external-link" aria-hidden="true"></i></a></p>
    <section class="onb-phase onb-library" data-state="${escAttr(state)}">
      <div class="onb-levels" role="group" aria-label="${escAttr(T.levelLabel)}">${buttons}</div>
      ${body}
    </section>`;
}

// ── Draw ────────────────────────────────────────────────────────────────

function _onblDraw() {
  const page = document.getElementById('onb-page');
  if (!page) return;
  const s = _onblState;
  page.innerHTML = onblPageHtml(onbLibraryTabModel({ templates: s.rows, level: s.level }), s.state, s.level);
  lucide.createIcons();
}

// Called by renderMyOnboardingPage when Learning Library is the active sub-tab; it has just bumped _onbmState.token, so a read that comes
// back after the person has moved to another sub-tab (or redrawn) is dropped. Draws into #onb-page (the strip sits outside it).
async function renderOnboardingLibraryPage() {
  if (!document.getElementById('onb-page')) return;
  const token = _onbmState.token;
  const s = _onblState;
  s.state = 'loading';
  _onblDraw();
  let rows = null, state = 'ready';
  try { rows = await getLearningLibraryRows(); } catch (e) { console.warn('Learning Library: load failed', e); state = 'error'; }
  if (token !== _onbmState.token || _onbmSubTab !== 'library' || !document.getElementById('onb-page')) return;
  s.rows = rows;
  s.state = state;
  _onblDraw();
}

// ── Actions ─────────────────────────────────────────────────────────────

function onblSetLevel(key) {
  _onblState.level = String(key == null ? '' : key);
  _onblDraw();   // redraws from the rows already read; nothing on this tab holds unsaved work
}

async function onblRetry() {
  _onbmState.token++;
  await renderOnboardingLibraryPage();
}

registerActions({ onblSetLevel, onblRetry });
