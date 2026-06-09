// ── Mobile auto-detect redirect ───────────────────────────────────────
// Redirect to mobile view if on a small screen, unless user has opted out
if (window.innerWidth < 768 && !sessionStorage.getItem('newton_force_desktop')) {
  window.location.replace('mobile.html');
}

// ── Quick Links deep-link handler ─────────────────────────────────────
// Hash format: #<pageKey>  or  #<pageKey>?action=add
// Returns true if handled (suppresses default first-page nav).
function handleDeepLink() {
  const raw = window.location.hash.slice(1);
  if (!raw) return false;
  const [pageKey, queryStr] = raw.split('?');
  const page = pageKey.trim();
  if (!page || !canAccess(page, _resolvedRole)) return false;
  navigateTo(page);
  if (new URLSearchParams(queryStr || '').get('action') === 'add') {
    setTimeout(() => {
      if      (page === 'activity')   showAddActivityForm();
      else if (page === 'placements') showAddPlacementForm();
      else if (page === 'rejections') showAddRejectionForm();
    }, 50);
  }
  history.replaceState(null, '', window.location.pathname);
  return true;
}

window.APP = {
  async init(freshLogin = false) {
    if (!isSignedIn()) {
      this.showLogin();
      return;
    }
    const user = getCurrentUser();
    // Resolve full role from SharePoint on login — stored in _resolvedRole for the session
  _resolvedRole = await getEffectiveRole(user.email);
    if (freshLogin) {
      await ensureUserRegistered(user.email, user.name).catch(e =>
        console.warn('Auto-registration failed:', e)
      );
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';
    document.title = 'Newton – Reporting';
    renderNav(_resolvedRole);
    const firstPage = getAccessiblePages(_resolvedRole)[0].key;
    if (!handleDeepLink()) navigateTo(firstPage);
    // Auto-register user in UserAssignments on first login (non-blocking)
    ensureUserRegistered(user.email, user.name).catch(e =>
      console.warn('Auto-registration failed:', e)
    );
  },
  showLogin() {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.title = 'Newton – Sign in';
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
