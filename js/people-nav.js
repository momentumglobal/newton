// js/people-nav.js — People module navigation

let _peopleCurrentPage = null;
let _resolvedRole      = null;  // set by people-app.js on init

function renderPeopleNav(role) {
  renderModuleNav({
    subtitle:         'People',
    currentModuleKey: 'people',
    toggleFn:         'togglePeopleModuleDropdown',
    pages:            getPeopleAccessiblePages(role),
    currentPage:      _peopleCurrentPage,
    role:             role,
    navigateFn:       'navigateToPeople',
    userGuideHref:    'people-user-guide.html',
  });
}

function togglePeopleModuleDropdown() {
  const dd = document.getElementById('nav-module-dropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', function(e) {
  const header = document.querySelector('.nav-header-dropdown');
  const dd = document.getElementById('nav-module-dropdown');
  if (dd && header && !header.contains(e.target)) dd.classList.remove('open');
});

function navigateToPeople(page) {
  const role = _resolvedRole || 'viewer';
  if (!peopleCanAccess(page, role)) return;
  _peopleCurrentPage = page;
  updateNavActiveLink(page);
  renderPeoplePage(page);
}

async function renderPeoplePage(page) {
  const main = document.getElementById('main-content');
  switch (page) {
    case 'peopleTracker':   await renderEmployeeTracker();    break;
    case 'peopleDashboard': await renderPeopleDashboard();    break;
    case 'peopleGantt':     await renderDeploymentTimeline(); break;
    case 'gpInvoices':      await renderGPInvoices();         break;
    case 'scorecards':      await renderScorecardsPage();     break;
    case 'engagement':      await renderEngagementPage();     break;
    default:
      main.innerHTML = '<p>Page not found.</p>';
  }
}
