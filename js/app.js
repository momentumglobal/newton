window.APP = {
  init() {
    if (!isSignedIn()) {
      this.showLogin();
      return;
    }
    const user = getCurrentUser();
    const role = getUserRole(user.email);
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';
    renderNav(role);
    navigateTo('dashboard');
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
