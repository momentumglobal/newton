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

    // Who is this person to Newton, and which PDP tabs apply? Two cached reads, together, Ghost-aware, never stored.
    // Each fails on its own: no identity -> the 'error' panel; no PDP signals -> the PDP tabs simply do not show.
    let identityFailed = false;
    const [identity, pdpNav] = await Promise.all([
      getPdpIdentity().catch(e => { console.warn('My Momentum identity unavailable', e); identityFailed = true; return null; }),
      resolvePdpNav().catch(e => { console.warn('PDP tabs unavailable', e); return { my: false, team: false }; }),
    ]);
    _mmIdentity = identity;
    _mmState = identityFailed ? 'error' : mmTabState(identity);
    _mmSignals = { pdpMy: !!pdpNav.my, pdpTeam: !!pdpNav.team };

    renderMyMomentumNav(_mmResolvedRole);
    initCommandBar({ currentModule: 'myMomentum', role: _mmResolvedRole, navigateFn: 'navigateToMyMomentum' });
    // N-441 / N-452: PDP reminders (On mode only). Once per page load, after the PDP signals, never throws.
    runPdpReminders().catch(e => console.warn('PDP reminders unavailable', e));
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