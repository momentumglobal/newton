// js/nav-core.js — shared sidebar renderer used by all Newton modules

/**
 * Renders the sidebar for any Newton module.
 *
 * @param {string} subtitle         - Module name shown below "Newton"
 * @param {string} currentModuleKey - Which OS_MODULE key is active
 * @param {string} toggleFn         - Name of the dropdown toggle function
 * @param {Array}  pages            - Array of { key, label } from getAccessiblePages()
 * @param {string} currentPage      - The currently active page key
 * @param {string} role             - Resolved role string
 * @param {string} navigateFn       - Name of the navigate function for this module
 * @param {string} userGuideHref    - URL for the User Guide link (empty string to omit)
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
    <a class='nav-link ${p.key === currentPage ? 'active' : ''}'
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
    </div>
    <nav class='nav-links'>
      ${navLinks}
    </nav>
    <img src='momentum-symbol-and-name-global-white.png' alt='Momentum Global' class='nav-logo-img'>
    <div class='nav-footer'>
      ${userGuideLink}
      <a class='nav-link signout' onclick='signOut()'>Sign out</a>
    </div>
  `;
  lucide.createIcons();
}
