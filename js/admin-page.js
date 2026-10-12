// js/admin-page.js - moved out of admin.html (N-303, SEC-12b step 3). Code unchanged except
// the registerActions call (now top level, no DOMContentLoaded wrapper).
    let _currentTab = 'assignments';

    async function init() {
      const response = await authReady();
      if (response) {
        const account = response.account || msalInstance.getAllAccounts()[0];
        if (account) {
          localStorage.setItem('userName', account.name);
        }
      }
      if (!isSignedIn()) { window.location.href = 'index.html'; return; }
      const user = getCurrentUser();
      const role = await getUserRoleAsync(user.email);
      if (role !== 'admin') { window.location.href = 'index.html'; return; }
      // N-246 — role is always the literal 'admin' here; anyone else will have
      // already redirected away two lines up, so there's no
      // getEffectiveRole() call to make like the other *-app.js files do.
      initCommandBar({ currentModule: 'admin', role: 'admin', navigateFn: 'switchTab' });
      if (!handleAdminDeepLink()) switchTab('assignments');
    }

    // N-246 — Command Bar deep-link handler. Hash format: #<tab>, e.g.
    // admin.html#datahealth. Mirrors handleSalesDeepLink() in sales-app.js.
    // ADMIN_TABS (js/os-admin.js) still includes 'ghost' even though Ghost
    // Mode has no Command Bar entry — that exclusion is scoped to the
    // searchable directory only, not to hash routing.
    function handleAdminDeepLink() {
      const tab = window.location.hash.slice(1).trim();
      if (!tab || !ADMIN_TABS.includes(tab)) return false;
      switchTab(tab);
      history.replaceState(null, '', window.location.pathname);
      return true;
    }

    function switchTab(tab) {
      _currentTab = tab;
      document.querySelectorAll('.admin-nav-link[id^="tab-"]').forEach(el => el.classList.remove('active'));
      const el = document.getElementById(`tab-${tab}`);
      if (el) el.classList.add('active');
      renderOsAdminPage(tab);
    }

    // N-303: loads (deferred) after js/actions.js, so register at top level.
    registerActions({ switchTab });
    document.addEventListener('DOMContentLoaded', init);