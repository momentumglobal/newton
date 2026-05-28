window.APP = {
  async init(freshLogin = false) {
    if (!isSignedIn()) {
      this.showLogin();
      return;
    }
    const user = getCurrentUser();
    // Resolve full role from SharePoint on login — stored in _resolvedRole for the session
   _resolvedRole = await getUserRoleAsync(user.email);
    if (freshLogin) {
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';
    renderNav(_resolvedRole);
    const firstPage = getAccessiblePages(_resolvedRole)[0].key;
    navigateTo(firstPage);
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
// Handle redirect response from Microsoft login, then initialise app
msalInstance.handleRedirectPromise().then(response => {
  if (response) {
    // Coming back from Microsoft redirect — store user details
    const account = response.account || msalInstance.getAllAccounts()[0];
    if (account) {
      localStorage.setItem('userEmail', account.username.toLowerCase());
      localStorage.setItem('userName',  account.name);
    }
  }
  window.APP.init(!!response);
}).catch(e => {
  console.error('MSAL redirect error:', e);
  window.APP.showLogin();
});
