// js/mr-app.js — Marketing Report module initialisation

// Hash format: #<pageKey> — set by the Command Bar (N-144) when jumping
// here from another module. Mirrors js/app.js's handleDeepLink(), minus
// the ?action=add extension (reporting-specific, not needed here).
function handleMrDeepLink() {
  const page = window.location.hash.slice(1).trim();
  if (!page || !mrCanAccess(page, _mrResolvedRole)) return false;
  navigateToMr(page);
  history.replaceState(null, '', window.location.pathname);
  return true;
}

window.MR_APP = {
  async init() {
    if (!isSignedIn()) { this.showLogin(); return; }

    const user = getCurrentUser();
    _mrResolvedRole = await getEffectiveRole(user.email);

    const allowed = ["admin", "delivery_manager", "talent_partner"];
    if (!allowed.includes(_mrResolvedRole)) {
      window.location.href = "index.html";
      return;
    }

    await ensureUserRegistered(user.email, user.name);

    document.getElementById("app-shell").style.display = "flex";
    document.getElementById("login-screen").style.display = "none";

    renderMrNav(_mrResolvedRole);
    initCommandBar({ currentModule: 'marketing', role: _mrResolvedRole, navigateFn: 'navigateToMr' });
    if (!handleMrDeepLink()) navigateToMr("placementAnalytics");
  },

  showLogin() {
    document.getElementById("app-shell").style.display  = "none";
    document.getElementById("login-screen").style.display = "flex";
  },
};

window.addEventListener("DOMContentLoaded", () => {
  msalInstance.handleRedirectPromise().then(() => {
    window.MR_APP.init();
  }).catch(e => {
    console.error("MSAL redirect error:", e);
    window.MR_APP.showLogin();
  });
});
