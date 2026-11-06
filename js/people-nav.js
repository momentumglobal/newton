// js/people-nav.js — People module navigation

let _peopleCurrentPage = null;
let _resolvedRole      = null;  // set by people-app.js on init
let _peopleMyDevNav    = false; // N-438: show My Development only for someone in the PDP programme (set by people-app.js)

function renderPeopleNav(role) {
  renderModuleNav({
    subtitle:         'People',
    currentModuleKey: 'people',
    toggleFn:         'togglePeopleModuleDropdown',
    pages:            getPeopleAccessiblePages(role).filter(p => p.key !== 'myDevelopment' || _peopleMyDevNav),
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

// N-302c: the target of every Back/Cancel button on the People pages (js/actions.js).
registerActions({
  navigateToPeople,
});

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
    case 'pdpSetup':        await renderPdpSetupPage();       break;   // N-436 (pdp-setup.js)
    case 'myDevelopment':   await renderMyDevelopmentPage();  break;   // N-438 (pdp-my.js)
    default:
      main.innerHTML = '<p>Page not found.</p>';
  }
  // N-417: once per navigation; the People KPI / card classes live in people.css, so they are named here, not in ui-kit.js
  enterStagger(main, VF_ENTER_SELECTOR + ', .ppl-kpi, .ppl-card');
}
