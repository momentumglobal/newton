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

// N-533: one renderer per page key; an unknown key falls back to Overview. Leaving Goals & Actions with an unsaved
// form asks first (bgtrConfirmLeave, bizgoals-track-ui.js).
const CC_RENDERERS = {
  overview:  container => renderCCOverview(container),
  goals:     container => renderCCGoalsPage(container),
  claudeMcp: container => renderCCClaudePage(container),
};

async function navigateToCC(page) {
  const container = document.getElementById('page-content');
  const key = CC_PAGES.some(p => p.key === page) && CC_RENDERERS[page] ? page : 'overview';
  if (!(await bgtrConfirmLeave())) return;
  updateNavActiveLink(key);
  withViewTransition(async () => {
    await CC_RENDERERS[key](container);
    enterStagger(container, '.cc-tile');   // N-417: the overview's tiles (no .kpi-card / .dash-panel there)
  });
}
