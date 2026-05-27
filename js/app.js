window.APP = {
  async init() {
    if (!isSignedIn()) {
      this.showLogin();
      return;
    }
    const user = getCurrentUser();
    // Resolve full role from SharePoint on login — stored in _resolvedRole for the session
    _resolvedRole = await getUserRoleAsync(user.email);
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';
    renderNav(_resolvedRole);
    navigateTo('dashboard');
    // Auto-register user in UserAssignments on first login (non-blocking)
    ensureUserRegistered(user.email, user.name).catch(e =>
      console.warn('Auto-registration failed:', e)
    );
  },
  showLogin() {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  },
};
// Run on page load — scripts are deferred to end of body so DOM is already ready
msalInstance.handleRedirectPromise().then(() => {
  window.APP.init();
}).catch(e => {
  console.error('MSAL redirect error:', e);
  window.APP.showLogin();
});
