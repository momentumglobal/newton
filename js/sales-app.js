// js/sales-app.js — Sales module initialisation

window.SALES_APP = {
  async init() {
    if (!isSignedIn()) {
      this.showLogin();
      return;
    }

    const user = getCurrentUser();

    // Resolve full role (checks LeadershipAccess + UserAssignments)
    _salesResolvedRole = await getEffectiveRole(user.email);

    // Sales module is Admin and Leadership only.
    if (!['admin', 'leadership'].includes(_salesResolvedRole)) {
      window.location.href = 'index.html';
      return;
    }

    await ensureUserRegistered(user.email, user.name);

    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';

    renderSalesNav(_salesResolvedRole);
    navigateToSales('salesForecast');
  },

  showLogin() {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  },
};

window.addEventListener('DOMContentLoaded', () => {
  msalInstance.handleRedirectPromise().then(() => {
    window.SALES_APP.init();
  }).catch(e => {
    console.error('MSAL redirect error:', e);
    window.SALES_APP.showLogin();
  });
});
