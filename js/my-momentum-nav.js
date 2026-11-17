// js/my-momentum-nav.js — My Momentum navigation (N-451 / MM-1)

let _mmCurrentPage  = null;
let _mmResolvedRole = null;        // set by my-momentum-app.js on init
let _mmIdentity     = null;        // getPdpIdentity() result, or null when it could not be read
let _mmState        = 'notLinked'; // 'ok' | 'notLinked' | 'ambiguous' (mmTabState), or 'error' when the read failed
let _mmSignals      = {};          // pdpMy / pdpTeam (N-452) and hasReports / hasActivity (N-453), set by my-momentum-app.js
let _mmTeamTab     = 'development';   // My Team sub-tab: 'development' | 'scorecards' (N-453)
let _mmTeamView    = '';          // the My Team view filter ('tree' | 'reports' | 'all'), shared by both sub-tabs (MM-D8); '' = each tab's default
let _mmScPeriod    = CONFIG.MY_MOMENTUM.SCORECARD.DEFAULT_PERIOD;   // scorecard period, shared by My Scorecard and Team Scorecards (kept for the page session)

function _mmTabCtx() {
  return { state: _mmState, role: _mmResolvedRole, signals: _mmSignals };
}

function mmNavTabs() {
  return mmVisibleTabs(CONFIG.MY_MOMENTUM.TABS, _mmTabCtx());
}

function renderMyMomentumNav(role) {
  renderModuleNav({
    subtitle:         'My Momentum',
    currentModuleKey: 'myMomentum',
    toggleFn:         'toggleMyMomentumModuleDropdown',
    pages:            mmNavTabs().map(t => ({ key: t.key, label: t.label })),
    currentPage:      _mmCurrentPage,
    role:             role,
    navigateFn:       'navigateToMyMomentum',
    userGuideHref:    'my-momentum-user-guide.html',
  });
}

function toggleMyMomentumModuleDropdown() {
  const dd = document.getElementById('nav-module-dropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', function(e) {
  const header = document.querySelector('.nav-header-dropdown');
  const dd = document.getElementById('nav-module-dropdown');
  if (dd && header && !header.contains(e.target)) dd.classList.remove('open');
});

// N-453: `page` may be a tab key or a sub-tab alias from CONFIG.MY_MOMENTUM.DEEP_LINKS ('teamScorecards', which the
// Command Bar passes); `sub` picks the My Team sub-tab. mmResolveDeepLink() decides what actually opens.
async function navigateToMyMomentum(page, sub) {
  // N-456: leaving My Details with unsaved edits asks first (re-clicking the tab counts as leaving).
  if (_mmCurrentPage === 'myDetails' && typeof mdConfirmLeave === 'function' && !(await mdConfirmLeave())) return;
  const role = _mmResolvedRole || 'viewer';
  const hit = mmResolveDeepLink(page, mmNavTabs(), mmTeamSubTabs(_mmTabCtx()), CONFIG.MY_MOMENTUM);
  if (!hit || !mmCanAccess(hit.tab, role)) return;   // a tab that is not shown cannot be opened by hash either
  if (hit.tab === 'myTeam') _mmTeamTab = _mmPickTeamSub(sub || hit.sub);
  _mmCurrentPage = hit.tab;
  updateNavActiveLink(hit.tab);
  withViewTransition(() => renderMyMomentumPage(hit.tab));
}

// The My Team sub-tab to open: the one asked for when this person has it, else their first (Development, or Team Scorecards alone).
function _mmPickTeamSub(want) {
  const subs = mmTeamSubTabs(_mmTabCtx());
  return subs.some(t => t.key === want) ? want : (subs[0] ? subs[0].key : 'development');
}

// The My Team tab strip (mmTeamTabsHtml). Leaving Development asks before it throws away unsaved prep, scores or notes — the
// same guard the year / view selects use (_pdptpConfirmLeave, pdp-team-page.js).
async function mmTeamTab(key) {
  if (key === _mmTeamTab || !mmTeamSubTabs(_mmTabCtx()).some(t => t.key === key)) return;
  if (_mmTeamTab === 'development' && typeof _pdptpConfirmLeave === 'function') {
    if (!(await _pdptpConfirmLeave('Switching tab'))) return;
    _pdptpState.dirty = false;
    pdpasReset();
    pdptrReset();
  }
  _mmTeamTab = key;
  withViewTransition(() => renderMyMomentumPage('myTeam'));
}

registerActions({
  navigateToMyMomentum,
  mmTeamTab,
});

async function renderMyMomentumPage(page) {
  const main = document.getElementById('main-content');
  switch (page) {
    case 'myHistory':     renderMyHistory(); break;                 // N-455 (my-momentum-pages.js)
    case 'myDetails':     await renderMyDetailsPage(); break;       // N-456 (my-details-ui.js)
    case 'myScorecard':   await renderMyScorecardPage(); break;     // N-453 (my-momentum-scorecard.js)
    case 'myDevelopment': await renderMyDevelopmentPage(); break;   // N-438, moved by N-452 (pdp-my.js)
    case 'myTeam':        await renderMyTeamPage(); break;          // N-452 Development (pdp-team-page.js) + N-453 Team Scorecards
    default:
      main.innerHTML = '<p>Page not found.</p>';
  }
  // N-459: the landing tab carries the hero, every other tab the slim header. Keyed on the tab, so N-455 replacing the History body keeps it.
  main.insertAdjacentHTML('afterbegin', page === 'myHistory' ? mmHeroHtml(getCurrentUser().name, new Date().getHours()) : mmAreaHeaderHtml());
  // N-417: once per navigation; the card class the PDP pages use lives in people.css, so it is named here, not in ui-kit.js
  enterStagger(main, VF_ENTER_SELECTOR + ', .ppl-card');
}

// N-453: My Team opens the sub-tab _mmTeamTab names (Development, or Team Scorecards).
async function renderMyTeamPage() {
  if (_mmTeamTab === 'scorecards') await renderTeamScorecardsPage();
  else await renderTeamDevelopmentPage();
}