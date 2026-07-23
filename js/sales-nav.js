// js/sales-nav.js — Sales module navigation

let _salesCurrentPage  = null;
let _salesResolvedRole = null;  // set by sales-app.js on init

function renderSalesNav(role) {
  renderModuleNav({
    subtitle:         'Sales',
    currentModuleKey: 'sales',
    toggleFn:         'toggleSalesModuleDropdown',
    pages:            getSalesAccessiblePages(role),
    currentPage:      _salesCurrentPage,
    role:             role,
    navigateFn:       'navigateToSales',
    userGuideHref:    'sales-user-guide.html',
  });
}

function toggleSalesModuleDropdown() {
  const dd = document.getElementById('nav-module-dropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', function(e) {
  const header = document.querySelector('.nav-header-dropdown');
  const dd = document.getElementById('nav-module-dropdown');
  if (dd && header && !header.contains(e.target)) dd.classList.remove('open');
});

function navigateToSales(page) {
  const role = _salesResolvedRole || 'viewer';
  if (!salesCanAccess(page, role)) return;
  _salesCurrentPage = page;
  updateNavActiveLink(page);
  renderSalesPage(page);
}

async function renderSalesPage(page) {
  const main = document.getElementById('main-content');
  switch (page) {
    case 'revenueTracking': await renderRevenueTrackingPage(); break;
    case 'salesForecast':   await renderSalesForecastPage();   break;
    case 'lciModels':       await renderLCIModelsPage();       break;
    default:
      main.innerHTML = '<p>Page not found.</p>';
  }
}
