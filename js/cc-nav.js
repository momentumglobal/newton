// js/cc-nav.js
function renderCCNav(role, currentPage) {
  renderModuleNav({
    subtitle:         'Command Centre',
    currentModuleKey: 'command',
    pages:            ccGetAccessiblePages(role),
    currentPage:      currentPage,
    role:             role,
    toggleFn:         'toggleCCModuleDropdown',
    navigateFn:       'navigateToCC',
  });
}

function toggleCCModuleDropdown() {
  const dd = document.getElementById('nav-module-dropdown');
  if (dd) dd.classList.toggle('open');
}

function navigateToCC(page) {
  const container = document.getElementById('page-content');
  renderCCOverview(container);
}
