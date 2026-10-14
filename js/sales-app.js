// js/sales-app.js — Sales module initialisation

// Hash format: #<pageKey> — set by the Command Bar (N-144) when jumping
// here from another module. Mirrors js/app.js's handleDeepLink(), minus
// the ?action=add extension (reporting-specific, not needed here).
function handleSalesDeepLink() {
  const page = window.location.hash.slice(1).trim();
  if (!page || !salesCanAccess(page, _salesResolvedRole)) return false;
  navigateToSales(page);
  history.replaceState(null, '', window.location.pathname);
  return true;
}

window.SALES_APP = {
  async init() {
    if (!isSignedIn()) {
      this.showLogin();
      return;
    }

    const user = getCurrentUser();

    // Resolve full role (checks LeadershipAccess + UserAssignments)
    _salesResolvedRole = await getEffectiveRole(user.email);

    // Admin/Leadership/Sales (N-331): full module. DMs: LCI Cost Models page
    // only. Access and landing page both come from sales-router.js.
    const landing = getSalesLandingPage(_salesResolvedRole);
    if (!landing) {
      window.location.href = 'index.html';
      return;
    }

    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';

    renderSalesNav(_salesResolvedRole);
    initCommandBar({ currentModule: 'sales', role: _salesResolvedRole, navigateFn: 'navigateToSales' });
    if (!handleSalesDeepLink()) navigateToSales(landing);
  },

  showLogin() {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  },
};

window.addEventListener('DOMContentLoaded', () => {
  authReady().then(() => {
    window.SALES_APP.init();
  }).catch(e => {
    console.error('MSAL redirect error:', e);
    window.SALES_APP.showLogin();
  });
});
