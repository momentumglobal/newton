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

function navigateTo(page) {
  const role = _resolvedRole || getUserRole(getCurrentUser().email);
  if (!canAccess(page, role)) return;
  currentPage = page;
  updateNavActiveLink(page);
  renderPage(page);
}

async function renderPage(page) {
  const main = document.getElementById('main-content');
  switch (page) {
    case 'dashboard':
      main.innerHTML = `<div class="page-header"><h2>Dashboard</h2></div>
        <p>Coming Soon: Solutions Hub Reporting.</p>`;
      break;
    case 'projects':          await renderProjectsPage();     break;
    case 'roles':             await renderRolesPage();        break;
    case 'activity':          await renderActivityPage();     break;
    case 'placements':        await renderPlacementsPage();   break;
    case 'rejections':        await renderRejectionsPage();   break;
    case 'hiringPlan':        await renderHiringPlanPage();   break;
    case 'projectDashboard':  await renderProjectDashboard(); break;
    case 'companyDashboard':  await renderCompanyDashboard(); break;
    case 'reportBuilder':     await renderReportBuilder();    break;
    case 'adminPanel':        renderAdminPage();              break;
    default:
      main.innerHTML = `<p>Page not found.</p>`;
  }
}
