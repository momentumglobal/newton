// js/nav-core.js — shared sidebar renderer used by all Newton modules

/**
 * Renders the full sidebar. Call once on module init.
 */
function renderModuleNav({
  subtitle, currentModuleKey, toggleFn,
  pages, currentPage, role,
  navigateFn, userGuideHref,
}) {
  const user = getCurrentUser();
  const visibleModules = CONFIG.OS_MODULES.filter(m => m.roles.includes(role));

  const moduleItems = visibleModules.map(m => {
    if (!m.live) {
      return `<div class='nav-module-item disabled'>
        <i data-lucide="${m.icon}" class="nav-module-icon"></i>
        ${m.name} <span class='nav-module-soon'>Soon</span></div>`;
    }
    const isCurrent = m.key === currentModuleKey;
    return `<a class='nav-module-item${isCurrent ? ' current' : ''}' href='${m.href}'>
      <i data-lucide="${m.icon}" class="nav-module-icon"></i>${m.name}</a>`;
  }).join('');

  const navLinks = pages.map(p => `
    <a class='nav-link${p.key === currentPage ? ' active' : ''}'
       data-page='${p.key}'
       onclick='${navigateFn}("${p.key}")'>
      ${p.label}
    </a>`).join('');

  const userGuideLink = userGuideHref
    ? `<a class='nav-link signout' href='${userGuideHref}' target='_blank'>User Guide</a>`
    : '';

  document.getElementById('sidebar').innerHTML = `
    <div class='nav-header nav-header-dropdown' onclick='${toggleFn}()'>
      <div class='nav-logo'>Newton <span class='nav-header-arrow'>▾</span></div>
      <div class='nav-subtitle'>${subtitle}</div>
      <div class='nav-module-dropdown' id='nav-module-dropdown'>
        <a class='nav-module-home' href='index.html'>← Home</a>
        <div class='nav-module-divider'></div>
        ${moduleItems}
      </div>
    </div>
    <div class='nav-user'>
      <div class='nav-user-name'>${user.name || user.email}</div>
      <div class='nav-user-role'>${role.replace(/_/g, ' ')}</div>
      <div class='nav-notif-slot' id='notif-slot'></div>
    </div>
    <nav class='nav-links' id='nav-links'>
      ${navLinks}
    </nav>
    <img src='momentum-symbol-and-name-global-white.png' alt='Momentum Global' class='nav-logo-img'>
    <div class='nav-footer'>
      ${userGuideLink}
      <a class='nav-link signout' onclick='signOut()'>Sign out</a>
    </div>
  `;

  // Ghost mode banner
  const ghostRole = getGhostRole();
  const appShell  = document.getElementById('app-shell');
  let ghostBanner = document.getElementById('ghost-banner');
  if (ghostRole) {
    if (!ghostBanner) {
      ghostBanner = document.createElement('div');
      ghostBanner.id = 'ghost-banner';
      document.body.prepend(ghostBanner);
    }
    ghostBanner.innerHTML = `
      👻 Ghost mode — viewing as <strong>${ghostRole.replace(/_/g, ' ')}</strong>
      <button onclick="exitGhostMode()">Exit Ghost Mode</button>
    `;
    if (appShell) appShell.classList.add('ghost-active');
  } else {
    if (ghostBanner) ghostBanner.remove();
    if (appShell) appShell.classList.remove('ghost-active');
  }
  
  lucide.createIcons();
  if (typeof renderNotificationBell === 'function') renderNotificationBell();
}

/**
 * Updates the active nav link without rebuilding the sidebar.
 * Call this on every navigation instead of re-calling renderModuleNav.
 */
function updateNavActiveLink(page) {
  const links = document.querySelectorAll('#nav-links .nav-link');
  links.forEach(a => {
    if (a.dataset.page === page) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });
}

function exitGhostMode() {
  clearGhostRole();
  // Reload the current page to re-initialise with the real role
  window.location.reload();
}
