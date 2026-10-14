// js/people-app.js — People module initialisation

// Hash format: #<pageKey> or #<pageKey>?action=edit&id=<n> — set by the
// Command Bar (N-144 page jumps; N-145 entity-search jumps into
// peopleTracker). Mirrors js/app.js's handleDeepLink().
function handlePeopleDeepLink() {
  const raw = window.location.hash.slice(1);
  if (!raw) return false;
  const [pageKey, queryStr] = raw.split('?');
  const page = pageKey.trim();
  if (!page || !peopleCanAccess(page, _resolvedRole)) return false;
  navigateToPeople(page);
  const params = new URLSearchParams(queryStr || '');
  if (page === 'peopleTracker' && params.get('action') === 'edit') {
    // N-145 — Command Bar entity-search deep link.
    const id = Number(params.get('id'));
    setTimeout(() => showEditPersonForm(id), 50);
  }
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

    // People module access comes from the page registry (people-router.js):
    // a role that can open no People page is sent home. TP sees only their
    // own scorecard — scoped in renderScorecardsPage. N-331: no role list here.
    const landing = getPeopleLandingPage(_resolvedRole);
    if (!landing) {
      window.location.href = 'index.html';
      return;
    }

    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';

        renderPeopleNav(_resolvedRole);
    initCommandBar({ currentModule: 'people', role: _resolvedRole, navigateFn: 'navigateToPeople' });
    if (!handlePeopleDeepLink()) navigateToPeople(landing);
  },

  showLogin() {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  },
};

window.addEventListener('DOMContentLoaded', () => {
  authReady().then(() => {
    window.PEOPLE_APP.init();
  }).catch(e => {
    console.error('MSAL redirect error:', e);
    window.PEOPLE_APP.showLogin();
  });
});
