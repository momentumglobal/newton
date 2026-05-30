// js/people-app.js — People module initialisation

window.PEOPLE_APP = {
  async init() {
    if (!isSignedIn()) {
      this.showLogin();
      return;
    }

    const user = getCurrentUser();

    // Resolve full role (checks LeadershipAccess + UserAssignments)
    _resolvedRole = await getEffectiveRole(user.email);

    // People module is Admin and Leadership only.
    // Anyone else who lands here gets redirected to the Reporting module.
    if (!['admin', 'leadership'].includes(_resolvedRole)) {
      window.location.href = 'index.html';
      return;
    }

    // Update last-login timestamp
    await ensureUserRegistered(user.email, user.name);

    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';

    renderPeopleNav(_resolvedRole);
    navigateToPeople('peopleDashboard');
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
