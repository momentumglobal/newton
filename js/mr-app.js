// js/mr-app.js — Marketing Report module initialisation

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
    navigateToMr("placementAnalytics");
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
