// js/mr-nav.js — Marketing Report module navigation

let _mrCurrentPage  = null;
let _mrResolvedRole = null;  // set by mr-app.js on init

function renderMrNav(role) {
  renderModuleNav({
    subtitle:         'Market Reporting',
    currentModuleKey: 'marketing',
    toggleFn:         'toggleMrModuleDropdown',
    pages:            getMrAccessiblePages(role),
    currentPage:      _mrCurrentPage,
    role:             role,
    navigateFn:       'navigateToMr',
    userGuideHref:    'market-reporting-user-guide.html',
  });
}

function toggleMrModuleDropdown() {
  const dd = document.getElementById('nav-module-dropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', function(e) {
  const header = document.querySelector('.nav-header-dropdown');
  const dd     = document.getElementById('nav-module-dropdown');
  if (dd && header && !header.contains(e.target)) dd.classList.remove('open');
});

function navigateToMr(page) {
  const role = _mrResolvedRole || 'viewer';
  if (!mrCanAccess(page, role)) return;
  _mrCurrentPage = page;
  renderMrNav(role);
  renderMrPage(page);
}

async function renderMrPage(page) {
  switch (page) {
    case 'marketReport': await renderMarketReport(); break;
    default: document.getElementById('main-content').innerHTML
      = '<p>Page not found.</p>';
  }
}
