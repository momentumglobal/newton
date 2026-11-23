// js/my-momentum-app.js — My Momentum module initialisation (N-451 / MM-1)

// Hash format: #<tabKey> or #<alias> (CONFIG.MY_MOMENTUM.DEEP_LINKS, e.g. #teamScorecards). A key that is not shown to this
// person falls back (DEEP_LINK_FALLBACKS) or is ignored, and the landing tab opens instead (mmResolveDeepLink).
// Mirrors people-app.js's handlePeopleDeepLink().
function handleMyMomentumDeepLink() {
  const raw = window.location.hash.slice(1);
  if (!raw) return false;
  const page = raw.split('?')[0].trim();
  history.replaceState(null, '', window.location.pathname);
  const hit = page ? mmResolveDeepLink(page, mmNavTabs(), mmTeamSubTabs(_mmTabCtx()), CONFIG.MY_MOMENTUM, onbSubTabs(_mmSignals)) : null;   // N-500: onboarding sub-tabs
  if (!hit) return false;
  if (hit.tab === 'myDetails') mdSetPreselect(mmDeepLinkPerson(raw));   // N-457
  navigateToMyMomentum(hit.tab, hit.sub);
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

    // Who is this person to Newton, and which PDP / scorecard tabs apply? Three cached reads, together, Ghost-aware, never stored.
    // Each fails on its own: no identity -> the 'error' panel; no PDP signals -> the PDP tabs simply do not show; no scorecard
    // signal -> My Scorecard does not show (N-453; resolveScorecardNav reads the rows the scorecard page reads, so opening it is a cache hit).
    let identityFailed = false;
    const [identity, pdpNav, scNav, onbNav, onbTeamNav] = await Promise.all([
      getPdpIdentity().catch(e => { console.warn('My Momentum identity unavailable', e); identityFailed = true; return null; }),
      resolvePdpNav().catch(e => { console.warn('PDP tabs unavailable', e); return { my: false, team: false }; }),
      resolveScorecardNav().catch(e => { console.warn('My Scorecard availability unavailable', e); return { hasActivity: false }; }),
      resolveOnboardingNav().catch(e => { console.warn('My Onboarding availability unavailable', e); return { plans: 0, buddy: 0, actions: 0 }; }),   // N-499 / N-509: nothing to see -> neither tab shows
      resolveOnboardingTeamNav().catch(e => { console.warn('My Team onboarding availability unavailable', e); return { team: 0 }; }),   // N-502: no joiners to look after -> no sub-tab
    ]);
    _mmIdentity = identity;
    _mmState = identityFailed ? 'error' : mmTabState(identity);
    // hasReports comes from the identity just loaded (no extra read): a manager with direct reports or a CSD tree gets Team Scorecards.
    _mmSignals = { pdpMy: !!pdpNav.my, pdpTeam: !!pdpNav.team, hasReports: !!(identity && identity.me && ((identity.directReports || []).length || (identity.csdTree || []).length)), hasActivity: !!scNav.hasActivity, onbPlans: onbNav.plans > 0, onbBuddy: onbNav.buddy > 0, onbActions: onbNav.actions, onbRituals: !!onbNav.rituals, onbTeam: onbTeamNav.team > 0 };   // N-500: the Processes & Rituals tab

    renderMyMomentumNav(_mmResolvedRole);
    initCommandBar({ currentModule: 'myMomentum', role: _mmResolvedRole, navigateFn: 'navigateToMyMomentum' });
    // N-441 / N-452: PDP reminders (On mode only). Once per page load, after the PDP signals, never throws.
    runPdpReminders().catch(e => console.warn('PDP reminders unavailable', e));
    // N-503 (ONB-8): onboarding owner reminders (Pilot and On). Once per page load, after the signals, never throws.
    runOnboardingReminders().catch(e => console.warn('Onboarding reminders unavailable', e));
    if (!handleMyMomentumDeepLink()) {
      const landing = mmLandingTab(mmNavTabs());
      if (landing) {
        navigateToMyMomentum(landing);
      } else {
        renderBreadcrumb(null);
        renderMmNoRecord();
      }
    }
    bindDeepLinkListener(handleMyMomentumDeepLink);   // N-465
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