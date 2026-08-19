// ── Mobile auto-detect redirect ───────────────────────────────────────
// Redirect to mobile view if on a small screen OR if this session is
// running inside the mobile app (flag set by mobile.html), unless the user
// has explicitly opted out via "Switch to desktop view".
(function () {
  var optedOut = sessionStorage.getItem('newton_force_desktop');
  var isApp    = false;
  try { isApp = localStorage.getItem('newton_mobile') === '1'; } catch (e) {}
  if (!optedOut && (window.innerWidth < 768 || isApp)) {
    window.location.replace('mobile.html');
  }
})();

// ── Quick Links deep-link handler ─────────────────────────────────────
// Hash format: #<pageKey>  or  #<pageKey>?action=add
// Returns true if handled (suppresses default first-page nav).
function handleDeepLink() {
  const raw = window.location.hash.slice(1);
  if (!raw) return false;
  const [pageKey, queryStr] = raw.split('?');
  const page = pageKey.trim();
  if (!page || !canAccess(page, _resolvedRole)) return false;
  const params = new URLSearchParams(queryStr || '');
  const action = params.get('action');
  if (action === 'filter' && page === 'projectDashboard') {
    // N-145 addendum (18 Aug 2026) — Command Bar Project entity jump,
    // cross-module case. Must run BEFORE navigateTo(): renderProjectDashboard()
    // reads _dashProjectId synchronously at the top of its own function, so
    // the filter has to be in place before that render fires, not after.
    setDashProjectFilter(params.get('projectId'));
  }
  navigateTo(page);
  if (action === 'add') {
    setTimeout(() => {
      if      (page === 'activity')   showAddActivityForm();
      else if (page === 'placements') showAddPlacementForm();
      else if (page === 'rejections') showAddRejectionForm();
    }, 50);
  } else if (action === 'edit') {
    // N-145 — Command Bar entity-search deep link.
    const id = Number(params.get('id'));
    setTimeout(() => {
      if (page === 'roles') showEditRoleForm(id);
    }, 50);
  } else if (action === 'logActivity') {
    // N-146 — Command Bar Role row "Log activity" action, cross-module case.
    const roleId    = Number(params.get('roleId'));
    const projectId = params.get('projectId') ? Number(params.get('projectId')) : null;
    setTimeout(() => {
      if (page === 'activity') showAddActivityForm(roleId, projectId);
    }, 50);
  } else if (action === 'addPlacement') {
    // N-146 — Command Bar Role row "Add placement" action, cross-module case.
    const roleId    = Number(params.get('roleId'));
    const projectId = params.get('projectId') ? Number(params.get('projectId')) : null;
    setTimeout(() => {
      if (page === 'placements') showAddPlacementForm(roleId, projectId);
    }, 50);
  } else if (action === 'updateStage') {
    // N-146 — Command Bar Role row "Update stage" action, cross-module case.
    const roleId = Number(params.get('roleId'));
    setTimeout(() => {
      if (page === 'roles') scrollToAndUnlockStage(roleId);
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
      // If this session is the mobile app, return to mobile.html after the
      // login round-trip instead of the desktop home.
      var isAppLogin = false;
      try { isAppLogin = localStorage.getItem('newton_mobile') === '1'; } catch (e) {}
      var optedOutLogin = sessionStorage.getItem('newton_force_desktop');
      window.location.href = (isAppLogin && !optedOutLogin) ? 'mobile.html' : 'index.html';
      return;
    }
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';
    document.title = 'Newton – Reporting';
    renderNav(_resolvedRole);
    initCommandBar({ currentModule: 'reporting', role: _resolvedRole, navigateFn: 'navigateTo' });
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
