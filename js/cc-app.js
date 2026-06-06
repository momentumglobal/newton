// js/cc-app.js
async function initCC() {
  await msalInstance.handleRedirectPromise();
  if (!isSignedIn()) { window.location.href = 'reporting.html'; return; }
  const user = getCurrentUser();
  const role = await getEffectiveRole(user.email);
  if (!ccCanAccess(role)) { window.location.href = 'index.html'; return; }
  renderCCNav(role, 'overview');
  const container = document.getElementById('page-content');
  await renderCCOverview(container);
}
initCC();
