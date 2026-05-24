let currentPage = 'dashboard';

function renderNav(role) {
  const pages = getAccessiblePages(role);
  const user  = getCurrentUser();
  const nav   = document.getElementById('sidebar');
  nav.innerHTML = `
    <div class='nav-header'>
      <div class='nav-logo'>Solutions Hub</div>
      <div class='nav-subtitle'>Reporting</div>
    </div>
    <div class='nav-user'>
      <div class='nav-user-name'>${user.name || user.email}</div>
      <div class='nav-user-role'>${role.replace('_', ' ')}</div>
    </div>
    <nav class='nav-links'>
      ${pages.map(p => `
        <a class='nav-link ${p.key === currentPage ? 'active' : ''}'
           onclick='navigateTo("${p.key}")'>
          ${p.label}
        </a>
      `).join('')}
    </nav>
    <div class='nav-footer'>
      <a class='nav-link signout' onclick='signOut()'>Sign out</a>
    </div>
  `;
}

function navigateTo(page) {
  const role = getUserRole(getCurrentUser().email);
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
        <p>Welcome to Solutions Hub Reporting.</p>`;
      break;
    case "projects":    await renderProjectsPage();  break;
    case "roles":       await renderRolesPage();     break;
    case "activity":    await renderActivityPage();  break;
    case "placements":  await renderPlacementsPage(); break;
    case "rejections":  await renderRejectionsPage(); break;
    default:
      main.innerHTML = `<p>Page not found.</p>`;
  }
}
