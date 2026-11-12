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

// N-452: the My Team tab strip. One tab today (Development); N-453 adds Team Scorecards and gives the buttons their action.
function mmTeamTabsHtml(active) {
  const tabs = [{ key: 'development', label: 'Development' }];
  return `<div class="eng-tab-strip" role="tablist">${tabs.map(t => `<button type="button" class="eng-tab${active === t.key ? ' eng-tab--active' : ''}" role="tab" aria-selected="${active === t.key ? 'true' : 'false'}">${escHtml(t.label)}</button>`).join('')}</div>`;
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