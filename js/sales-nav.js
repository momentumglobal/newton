// js/sales-nav.js — Sales module navigation

let _salesCurrentPage = null;
let _salesResolvedRole = null;  // set by sales-app.js on init

const SALES_OS_MODULES = [
  { key: 'reporting', name: 'Reporting', icon: 'bar-chart-2', href: 'reporting.html', live: true,  roles: ['admin','delivery_manager','talent_partner','leadership'] },
  { key: 'marketing', name: 'Market Reporting', icon: 'megaphone', href: 'market-reporting.html', live: true, roles: ['admin','delivery_manager','talent_partner'] },
  { key: 'people',    name: 'People',    icon: 'users', href: 'people.html', live: true,  roles: ['admin','leadership'] },
  { key: 'sales',     name: 'Sales',     icon: 'trending-up', href: 'sales.html', live: true,  roles: ['admin','leadership'] },
];

function renderSalesNav(role) {
  const pages = getSalesAccessiblePages(role);
  const user  = getCurrentUser();
  const visibleModules = SALES_OS_MODULES.filter(m => m.roles.includes(role));

  const moduleItems = visibleModules.map(m => {
    if (!m.live) {
      return `<div class='nav-module-item disabled'>
        <i data-lucide="${m.icon}" class="nav-module-icon"></i>
        ${m.name} <span class='nav-module-soon'>Soon</span></div>`;
    }
    const isCurrent = m.key === 'sales';
    return `<a class='nav-module-item${isCurrent ? " current" : ""}' href='${m.href}'>
      <i data-lucide="${m.icon}" class="nav-module-icon"></i>${m.name}</a>`;
  }).join('');

  const nav = document.getElementById('sidebar');
  nav.innerHTML = `
    <div class='nav-header nav-header-dropdown' onclick='toggleSalesModuleDropdown()'>
      <div class='nav-logo'>Newton <span class='nav-header-arrow'>▾</span></div>
      <div class='nav-subtitle'>Sales</div>
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
        <a class='nav-link ${p.key === _salesCurrentPage ? 'active' : ''}'
           onclick='navigateToSales("${p.key}")'>
          ${p.label}
        </a>`).join('')}
    </nav>
    <img src='momentum-symbol-and-name-global-white.png'
         alt='Momentum Global' class='nav-logo-img'>
    <div class='nav-footer'>
      <a class='nav-link signout' onclick='signOut()'>Sign out</a>
    </div>`;

  lucide.createIcons();
}

function toggleSalesModuleDropdown() {
  const dd = document.getElementById('nav-module-dropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', function(e) {
  const header = document.querySelector('.nav-header-dropdown');
  const dd = document.getElementById('nav-module-dropdown');
  if (dd && header && !header.contains(e.target)) dd.classList.remove('open');
});

function navigateToSales(page) {
  const role = _salesResolvedRole || 'viewer';
  if (!salesCanAccess(page, role)) return;
  _salesCurrentPage = page;
  renderSalesNav(role);
  renderSalesPage(page);
}

async function renderSalesPage(page) {
  const main = document.getElementById('main-content');
  switch (page) {
    case 'salesForecast': await renderSalesForecastPage(); break;
    default:
      main.innerHTML = '<p>Page not found.</p>';
  }
}
