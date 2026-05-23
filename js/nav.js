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

function renderPage(page) {
  const main = document.getElementById('main-content');
  const labels = Object.fromEntries(
    Object.entries(PAGES).map(([k,v]) => [k, v.label])
  );
  main.innerHTML = `
    <div class='page-placeholder'>
      <h1>${labels[page] || page}</h1>
      <p>This section is coming in a future phase.</p>
    </div>
  `;
}
