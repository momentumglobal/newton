// js/cc-nav.js
function renderCCNav(role, currentPage) {
  renderModuleNav({
    moduleKey:   'command',
    pages:       ccGetAccessiblePages(role),
    currentPage: currentPage,
    homeHref:    'index.html',
  });
}
