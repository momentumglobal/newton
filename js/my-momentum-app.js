// js/my-momentum-app.js — My Momentum module initialisation (N-451 / MM-1)

// Hash format: #<tabKey>. A tab that is not shown to this person is ignored (the landing tab opens instead).
// Mirrors people-app.js's handlePeopleDeepLink().
function handleMyMomentumDeepLink() {
  const raw = window.location.hash.slice(1);
  if (!raw) return false;
  const page = raw.split('?')[0].trim();
  history.replaceState(null, '', window.location.pathname);
  if (!page || !mmNavTabs().some(t => t.key === page)) return false;
  navigateToMyMomentum(page);
  return true;
}

window.MY_MOMENTUM_APP = {
  async init() {
    if (!isSignedIn()) {
      this.showLogin();
      return;
    }

    const user = getCurrentUser();

    // Ghost-aware role (checks LeadershipAccess + UserAssignments). Access = the OS_MODULES role list (my-momentum-router.js).
    _mmResolvedRole = await getEffectiveRole(user.email);
    if (!mmCanAccess('myHistory', _mmResolvedRole)) {
      window.location.href = 'index.html';
      return;
    }

    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';

    // Who is this person to Newton? One People read (cached), Ghost-aware, never stored — api-pdp.js getPdpIdentity().
    try {
      _mmIdentity = await getPdpIdentity();
      _mmState = mmTabState(_mmIdentity);
    } catch (e) {
      console.warn('My Momentum identity unavailable', e);
      _mmIdentity = null;
      _mmState = 'error';
    }

    renderMyMomentumNav(_mmResolvedRole);
    initCommandBar({ currentModule: 'myMomentum', role: _mmResolvedRole, navigateFn: 'navigateToMyMomentum' });
    if (!handleMyMomentumDeepLink()) {
      const landing = mmLandingTab(mmNavTabs());
      if (landing) {
        navigateToMyMomentum(landing);
      } else {
        renderBreadcrumb(null);
        renderMmNoRecord();
      }
    }
  },

  showLogin() {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  },
};

window.addEventListener('DOMContentLoaded', () => {
  authReady().then(() => {
    window.MY_MOMENTUM_APP.init();
  }).catch(e => {
    console.error('MSAL redirect error:', e);
    window.MY_MOMENTUM_APP.showLogin();
  });
});