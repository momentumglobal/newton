// js/claude-nav.js
// N-551 (AMCP-7): sidebar and navigation for the Newton for Claude install page (claude-router.js).
function renderClaudeNav(role, currentPage) {
  renderModuleNav({
    subtitle:         'Newton for Claude',
    currentModuleKey: 'claude',
    pages:            claudeGetAccessiblePages(role),
    currentPage:      currentPage,
    role:             role,
    toggleFn:         'toggleClaudeModuleDropdown',
    navigateFn:       'navigateToClaude',
  });
}

function toggleClaudeModuleDropdown() {
  const dd = document.getElementById('nav-module-dropdown');
  if (dd) dd.classList.toggle('open');
}

// One page, so every key renders it (an unknown key falls back to it). The renderer is shared with the Command Centre.
async function navigateToClaude(page) {
  const container = document.getElementById('page-content');
  const key = CLAUDE_PAGES.some(p => p.key === page) ? page : CLAUDE_PAGES[0].key;
  updateNavActiveLink(key);
  withViewTransition(async () => {
    await renderCCClaudePage(container);
  });
}
