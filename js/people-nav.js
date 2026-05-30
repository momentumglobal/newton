// js/people-nav.js — People module navigation

let _peopleCurrentPage = null;
let _resolvedRole      = null;  // set by people-app.js on init

// OS_MODULES mirrors the Reporting module — used to render the
// module switcher dropdown in the sidebar header.
const OS_MODULES = [
  { key: 'reporting', name: 'Reporting', icon: 'bar-chart-2',
    href: 'reporting.html',    live: true,  roles: ['admin','delivery_manager','talent_partner','leadership'] },
  { key: 'people',    name: 'People',    icon: 'users',
    href: 'people.html',   live: true,  roles: ['admin','leadership'] },
  { key: 'finance',   name: 'Finance',   icon: 'pound-sterling',
    href: null,            live: false, roles: ['admin','leadership'] },
  { key: 'operations',name: 'Operations',icon: 'settings-2',
    href: null,            live: false, roles: ['admin','leadership'] },
];

function renderPeopleNav(role) {
  const pages = getPeopleAccessiblePages(role);
  const user  = getCurrentUser();
  const visibleModules = OS_MODULES.filter(m => m.roles.includes(role));

  const moduleItems = visibleModules.map(m => {
    if (!m.live) {
      return `<div class='nav-module-item disabled'>
        <i data-lucide="${m.icon}" class="nav-module-icon"></i>
        ${m.name} <span class='nav-module-soon'>Soon</span></div>`;
    }
    const isCurrent = m.key === 'people';
    return `<a class='nav-module-item${isCurrent ? " current" : ""}' href='${m.href}'>
      <i data-lucide="${m.icon}" class="nav-module-icon"></i>${m.name}</a>`;
  }).join('');

  const nav = document.getElementById('sidebar');
  nav.innerHTML = `
    <div class='nav-header nav-header-dropdown' onclick='togglePeopleModuleDropdown()'>
      <div class='nav-logo'>Newton <span class='nav-header-arrow'>▾</span></div>
      <div class='nav-subtitle'>People</div>
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
        <a class='nav-link ${p.key === _peopleCurrentPage ? 'active' : ''}'
           onclick='navigateToPeople("${p.key}")'>
          ${p.label}
        </a>`).join('')}
    </nav>
    <img src='momentum-symbol-and-name-global-white.png'
         alt='Momentum Global' class='nav-logo-img'>
    <div class='nav-footer'>
      <a class='nav-link signout' href='user-guide.html' target='_blank'>User Guide</a>
      <a class='nav-link signout' onclick='signOut()'>Sign out</a>
    </div>`;

  lucide.createIcons();
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

function navigateToPeople(page) {
  const role = _resolvedRole || 'viewer';
  if (!peopleCanAccess(page, role)) return;
  _peopleCurrentPage = page;
  renderPeopleNav(role);
  renderPeoplePage(page);
}

async function renderPeoplePage(page) {
  const main = document.getElementById('main-content');
  switch (page) {
    case 'peopleTracker':   await renderEmployeeTracker();   break;
    case 'peopleDashboard': await renderPeopleDashboard();   break;
    case 'peopleGantt':     await renderDeploymentTimeline();break;
    case 'gpInvoices':      await renderGPInvoices();        break;
    default:
      main.innerHTML = '<p>Page not found.</p>';
  }
}
