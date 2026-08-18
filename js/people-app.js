// js/people-app.js — People module initialisation

// Hash format: #<pageKey> — set by the Command Bar (N-144) when jumping
// here from another module. Mirrors js/app.js's handleDeepLink(), minus
// the ?action=add extension (reporting-specific, not needed here).
function handlePeopleDeepLink() {
  const page = window.location.hash.slice(1).trim();
  if (!page || !peopleCanAccess(page, _resolvedRole)) return false;
  navigateToPeople(page);
  history.replaceState(null, '', window.location.pathname);
  return true;
}

window.PEOPLE_APP = {
  async init() {
    if (!isSignedIn()) {
      this.showLogin();
      return;
    }

    const user = getCurrentUser();

    // Resolve full role (checks LeadershipAccess + UserAssignments)
    _resolvedRole = await getEffectiveRole(user.email);

    // People module access: Admin, Leadership, Delivery Manager, and Talent
    // Partner (TP sees only their own scorecard — scoped in renderScorecardsPage).
    // Anyone else who lands here gets redirected to the Reporting module.
    if (!['admin', 'leadership', 'delivery_manager', 'talent_partner'].includes(_resolvedRole)) {
      window.location.href = 'index.html';
      return;
    }

    // Update last-login timestamp
    await ensureUserRegistered(user.email, user.name);

    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';

        renderPeopleNav(_resolvedRole);
    initCommandBar({ currentModule: 'people', role: _resolvedRole, navigateFn: 'navigateToPeople' });
    const landing = ['delivery_manager', 'talent_partner'].includes(_resolvedRole) ? 'scorecards' : 'peopleDashboard';
    if (!handlePeopleDeepLink()) navigateToPeople(landing);
  },

  showLogin() {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  },
};

window.addEventListener('DOMContentLoaded', () => {
  msalInstance.handleRedirectPromise().then(() => {
    window.PEOPLE_APP.init();
  }).catch(e => {
    console.error('MSAL redirect error:', e);
    window.PEOPLE_APP.showLogin();
  });
});
