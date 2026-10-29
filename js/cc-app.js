// js/cc-app.js
// Hash format: #<pageKey> - set by the Command Bar (N-144) when jumping here from
// another module. Mirrors handleSalesDeepLink() in sales-app.js.
function handleCCDeepLink(role) {
  const page = window.location.hash.slice(1).trim();
  if (!page || !ccGetAccessiblePages(role).some(p => p.key === page)) return false;
  navigateToCC(page);
  history.replaceState(null, '', window.location.pathname);
  return true;
}

async function initCC() {
  await authReady();
  if (!isSignedIn()) { window.location.href = 'reporting.html'; return; }
  const user = getCurrentUser();
  const role = await getEffectiveRole(user.email);
  if (!ccCanAccess(role)) { window.location.href = 'index.html'; return; }
  document.getElementById('app-shell').style.display = 'flex';
  renderCCNav(role, 'overview');
  initCommandBar({ currentModule: 'command', role, navigateFn: 'navigateToCC' });
  const container = document.getElementById('page-content');
  if (!handleCCDeepLink(role)) await renderCCOverview(container);
}
initCC();
