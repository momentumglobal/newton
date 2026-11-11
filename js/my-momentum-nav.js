// js/my-momentum-nav.js — My Momentum navigation (N-451 / MM-1)

let _mmCurrentPage  = null;
let _mmResolvedRole = null;        // set by my-momentum-app.js on init
let _mmIdentity     = null;        // getPdpIdentity() result, or null when it could not be read
let _mmState        = 'notLinked'; // 'ok' | 'notLinked' | 'ambiguous' (mmTabState), or 'error' when the read failed
let _mmSignals      = {};          // hasActivity / pdpMy / hasReports — filled by the tasks that own those tabs

function mmNavTabs() {
  return mmVisibleTabs(CONFIG.MY_MOMENTUM.TABS, { state: _mmState, role: _mmResolvedRole, signals: _mmSignals });
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
    userGuideHref:    'people-user-guide.html',
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

function navigateToMyMomentum(page) {
  const role = _mmResolvedRole || 'viewer';
  if (!mmCanAccess(page, role)) return;
  if (!mmNavTabs().some(t => t.key === page)) return;   // a tab that is not shown cannot be opened by hash either
  _mmCurrentPage = page;
  updateNavActiveLink(page);
  withViewTransition(() => renderMyMomentumPage(page));
}

registerActions({
  navigateToMyMomentum,
});

async function renderMyMomentumPage(page) {
  const main = document.getElementById('main-content');
  switch (page) {
    case 'myHistory': renderMyHistoryStub(); break;   // N-451 stub (my-momentum-pages.js); N-455 replaces it
    default:
      main.innerHTML = '<p>Page not found.</p>';
  }
  enterStagger(main);
}