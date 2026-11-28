// js/claude-app.js
// N-551 (AMCP-7): init for the Newton for Claude install page. Mirrors cc-app.js: signed out goes to Reporting's sign-in,
// a role that cannot use Newton for Claude goes home. No deep-link handler: there is one page.
async function initClaude() {
  await authReady();
  if (!isSignedIn()) { window.location.href = 'reporting.html'; return; }
  const user = getCurrentUser();
  const role = await getEffectiveRole(user.email);
  if (!claudeCanAccess(role)) { window.location.href = 'index.html'; return; }
  document.getElementById('app-shell').style.display = 'flex';
  renderClaudeNav(role, CLAUDE_PAGES[0].key);
  initCommandBar({ currentModule: 'claude', role, navigateFn: 'navigateToClaude' });
  await renderCCClaudePage(document.getElementById('page-content'));
}
initClaude();
