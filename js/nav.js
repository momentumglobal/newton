// js/nav.js

let currentPage = null;
let _resolvedRole = null;

function renderNav(role) {
  const pages = getAccessiblePages(role);
  const user  = getCurrentUser();
  const visibleModules = CONFIG.OS_MODULES.filter(m => m.roles.includes(role));

  const moduleItems = visibleModules.map(m => {
    if (!m.live) {
      return `<div class='nav-module-item disabled'><i data-lucide="${m.icon}" class="nav-module-icon"></i>${m.name} <span class='nav-module-soon'>Soon</span></div>`;
    }
    const isCurrent = m.key === 'reporting';
    return `<a class='nav-module-item${isCurrent ? ' current' : ''}' href='${m.href}'><i data-lucide="${m.icon}" class="nav-module-icon"></i>${m.name}</a>`;
  }).join('');

  const nav = document.getElementById('sidebar');
  nav.innerHTML = `
    <div class='nav-header nav-header-dropdown' onclick='toggleModuleDropdown()'>
      <div class='nav-logo'>Newton <span class='nav-header-arrow'>▾</span></div>
      <div class='nav-subtitle'>Reporting</div>
      <div class='nav-module-dropdown' id='nav-module-dropdown'>
        <a class='nav-module-home' href='index.html'>← Home</a>
        <div class='nav-module-divider'></div>
        ${moduleItems}
      </div>
    </div>
    <div class='nav-user'>
      <div class='nav-user-name'>${user.name || user.email}</div>
      <div class='nav-user-role'>${role.replace(/_/g, ' ')}</div>
    </div>
    <nav class='nav-links'>
${pages.map(p => `
  <a class='nav-link ${p.key === currentPage ? 'active' : ''}'
     onclick='navigateTo("${p.key}")'>
    ${p.label}
  </a>
`).join('')}
    </nav>
    <img src='momentum-symbol-and-name-global-white.png' alt='Momentum Global' class='nav-logo-img'>
    <div class='nav-footer'>
      <a class='nav-link signout' href='user-guide.html' target='_blank'>User Guide</a>
      <a class='nav-link signout' onclick='signOut()'>Sign out</a>
    </div>
  `;
  lucide.createIcons();
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
  renderNav(role);
  renderPage(page);
}

async function renderPage(page) {
  const main = document.getElementById("main-content");
  switch (page) {
    case "dashboard":
      main.innerHTML = `<div class="page-header"><h2>Dashboard</h2></div>
        <p>Coming Soon: Solutions Hub Reporting.</p>`;
      break;
    case "projects":          await renderProjectsPage();     break;
    case "roles":             await renderRolesPage();        break;
    case "activity":          await renderActivityPage();     break;
    case 'placements':        await renderPlacementsPage();   break;
    case 'rejections':        await renderRejectionsPage();   break;
    case 'projectDashboard':  await renderProjectDashboard(); break;
    case 'companyDashboard':  await renderCompanyDashboard(); break;
    case 'reportBuilder':     await renderReportBuilder();    break;
    case 'adminPanel':        renderAdminPage();              break;
    default:
      main.innerHTML = `<p>Page not found.</p>`;
  }
}
