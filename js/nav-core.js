// js/nav-core.js — shared sidebar renderer used by all Newton modules

/**
 * Renders the full sidebar. Call once on module init.
 */
// N-176: the navigate function NAME this sidebar was rendered with, kept so
// "Refresh data" can re-render whichever page is current at click time.
// A page key baked into the button's onclick would go stale — navigation
// calls updateNavActiveLink(), not renderModuleNav().
let _navNavigateFn = null;

function renderModuleNav({
  subtitle, currentModuleKey, toggleFn,
  pages, currentPage, role,
  navigateFn, userGuideHref,
}) {
  _navNavigateFn = navigateFn;
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
      <button class='nav-footer-btn' id='refresh-data-btn' onclick='refreshModuleData()' title='Clear cached data and reload this page'>
        <i data-lucide="refresh-cw" class="nav-footer-btn-icon"></i>
        Refresh data
      </button>
      <button class='nav-theme-toggle' id='theme-toggle-btn' onclick='toggleTheme()' title='Toggle dark mode'>
        <i data-lucide="${getTheme() === 'dark' ? 'sun' : 'moon'}" class="nav-theme-toggle-icon"></i>
        ${getTheme() === 'dark' ? 'Light mode' : 'Dark mode'}
      </button>
      <a class='nav-link signout' onclick='signOut()'>Sign out</a>
    </div>
  `;

  // Ghost mode banner (N-170: shared with index.html via utils.js)
  renderGhostBanner();

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

/**
 * Refreshes the sidebar theme toggle's icon/label to match the current theme.
 * Called after toggleTheme() and after a live prefers-color-scheme change.
 */
function updateThemeToggleIcon() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const dark = getTheme() === 'dark';
  btn.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}" class="nav-theme-toggle-icon"></i>${dark ? 'Light mode' : 'Dark mode'}`;
  lucide.createIcons();
}

/**
 * "Refresh data" (N-176 / F-3a). Busts both cache tiers via api.js, then
 * re-renders the page currently marked active in the sidebar. NO cache
 * logic lives here — this file only knows which page to redraw.
 */
function refreshModuleData() {
  const active = document.querySelector('#nav-links .nav-link.active');
  const page = active ? active.dataset.page : null;
  const fn = _navNavigateFn ? window[_navNavigateFn] : null;
  refreshData(page && typeof fn === 'function' ? () => fn(page) : null);
}
