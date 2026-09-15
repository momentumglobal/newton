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

function navigateToPeople(page, pendingItem = null) {
  const role = _resolvedRole || 'viewer';
  if (!peopleCanAccess(page, role)) return;
  _peopleCurrentPage = page;
  updateNavActiveLink(page);
  withViewTransition(() => renderPeoplePage(page, pendingItem));
}

// N-218b: pendingItem threaded through, mirroring the fix N-218a made to
// nav.js's navigateTo()/renderPage() -- so the one navigation path used by
// an optimistic-insert apply() (Add form -> list, before the write
// resolves) still gets the normal sidebar-highlight and view-transition
// treatment every other People-module navigation gets, instead of a bare
// render call bypassing navigateToPeople() entirely.
async function renderPeoplePage(page, pendingItem = null) {
  const main = document.getElementById('main-content');
  switch (page) {
    case 'peopleTracker':   await renderEmployeeTracker(pendingItem); break;
    case 'peopleDashboard': await renderPeopleDashboard();    break;
    case 'orgChart':        await renderOrgChart();           break;
    case 'peopleGantt':     await renderDeploymentTimeline(); break;
    case 'gpInvoices':      await renderGPInvoices(pendingItem); break;
    case 'scorecards':      await renderScorecardsPage();     break;
    case 'engagement':      await renderEngagementPage();     break;
    default:
      main.innerHTML = '<p>Page not found.</p>';
  }
}
