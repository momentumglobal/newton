// js/nav.js

let currentPage   = null;
let _resolvedRole = null;

function renderNav(role) {
  renderModuleNav({
    subtitle:         'Reporting',
    currentModuleKey: 'reporting',
    toggleFn:         'toggleModuleDropdown',
    pages:            getAccessiblePages(role),
    currentPage:      currentPage,
    role:             role,
    navigateFn:       'navigateTo',
    userGuideHref:    'user-guide.html',
  });
}

function toggleModuleDropdown() {
  const dd = document.getElementById('nav-module-dropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', function(e) {
  const header = document.querySelector('.nav-header-dropdown');
  const dd = document.getElementById('nav-module-dropdown');
  if (dd && header && !header.contains(e.target)) {
    dd.classList.remove('open');
  }
});

function navigateTo(page, pendingItem = null) {
  const role = _resolvedRole || getUserRole(getCurrentUser().email);
  if (!canAccess(page, role)) return;
  currentPage = page;
  updateNavActiveLink(page);
  withViewTransition(() => renderPage(page, pendingItem));
}

// N-218a: pendingItem is only ever passed for the 5 optimistic-insert list
// pages, from forms.js right after Save and before the create write
// resolves -- every other caller/case is unaffected and keeps calling with
// no second argument.
async function renderPage(page, pendingItem = null) {
  const main = document.getElementById('main-content');
  switch (page) {
    case 'dashboard':
      main.innerHTML = `<div class="page-header"><h2>Dashboard</h2></div>
        <p>Coming Soon: Solutions Hub Reporting.</p>`;
      break;
    case 'projects':          await renderProjectsPage(undefined, pendingItem); break;
    case 'roles':             await renderRolesPage(undefined, pendingItem);    break;
    case 'activity':          await renderActivityPage(pendingItem);            break;
    case 'placements':        await renderPlacementsPage(pendingItem);          break;
    case 'rejections':        await renderRejectionsPage(pendingItem);          break;
    case 'hiringPlan':        await renderHiringPlanPage();   break;
    case 'projectDashboard':  await renderProjectDashboard(); break;
    case 'companyDashboard':  await renderCompanyDashboard(); break;
    case 'reportLibrary':     await showReportBuilderLibrary(); break;
    case 'adminPanel':        renderAdminPage();              break;
    default:
      main.innerHTML = `<p>Page not found.</p>`;
  }
}
