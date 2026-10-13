// js/home.js - home page init (index.html). Moved out of index.html by N-303;
// split by N-323: the Command Centre banner is in js/home-banner.js and the
// survey widget in js/survey-widget.js. This file keeps page init, Quick Links,
// sign-out and the registerActions call.
// Load order: home-banner.js and survey-widget.js MUST load before this file,
// because registerActions({ refreshCCBanner }) below runs at load time.

    async function initHome() {
      const response = await authReady();
      if (response) {
        const account = response.account || msalInstance.getAllAccounts()[0];
        if (account) {
          localStorage.setItem('userName', account.name);
        }
      }
      if (!isSignedIn()) { window.location.href = 'reporting.html'; return; }
      const user = getCurrentUser();
      const firstName = (user.name || user.email || '').split(' ')[0];
      document.getElementById('home-greeting').textContent = `Welcome back, ${firstName}`;
      const role = await getUserRoleAsync(user.email);
      initCommandBar({ currentModule: 'home', role, navigateFn: null });
      // N-298: home tiles come from CONFIG.OS_MODULES (config.js) - one role list
      // for the switcher and the home grid.
      const visible = CONFIG.OS_MODULES
        .filter(m => m.homeOrder != null && m.roles.includes(role))
        .sort((a, b) => a.homeOrder - b.homeOrder);
      const grid = document.getElementById('module-grid');
      if (visible.length === 1) grid.classList.add('single');
      grid.innerHTML = visible.map(m => `
        <${m.live ? `a href="${m.href}"` : 'div'} class="module-card${m.live ? '' : ' disabled'}">
          <i data-lucide="${m.icon}" class="module-icon"></i>
          <div class="module-name">${m.name}</div>
          <div class="module-desc">${m.desc}</div>
          <span class="module-badge ${m.live ? 'badge-live' : 'badge-soon'}">${m.live ? 'Live' : 'Coming soon'}</span>
        </${m.live ? 'a' : 'div'}>
      `).join('');
      // N-281: no auto-registration any more — a user with no role sees why
      // instead of an empty grid.
      if (!visible.length) {
        grid.classList.add('single');
        grid.innerHTML = `<div class="module-card module-card--static">
          <i data-lucide="lock" class="module-icon"></i>
          <div class="module-name">No access yet</div>
          <div class="module-desc">Your account isn't set up in Newton yet. Ask a Newton admin to add you.</div>
        </div>`;
      }
      lucide.createIcons();
      if (role === 'admin') {
        const adminLink = document.getElementById('admin-link');
        if (adminLink) adminLink.style.display = 'block';
      }

      // NEW: CC banner for Admin/Leadership
      await renderCommandCentreBanner(role);
      renderGhostBanner();
      setTimeout(() => initQuickLinks(role), 0);
      renderNotificationBell();

      // Survey widget — TP and DM only
      if (['talent_partner', 'delivery_manager'].includes(role)) {
        initSurveyWidget(user.email);
      }

      // Survey closing notification — Admin and Leadership only (js/survey-widget.js)
      if (['admin', 'leadership'].includes(role)) {
        await notifySurveyClosing();
      }

      // Load announcement banner
      getAnnouncementMessage().then(msg => {
        const ticker = document.getElementById('announcement-ticker');
        const inner  = document.getElementById('announcement-ticker-inner');
        const text   = (msg || '').trim();
        if (ticker && inner && text) {
          inner.textContent = text;
          ticker.classList.add('visible');
        }
      });
    }
    function handleSignOut() { signOut(); }
    function openQuickLinks() {
      document.getElementById('ql-drawer').classList.add('open');
      document.getElementById('ql-overlay').classList.add('open');
    }
    function closeQuickLinks() {
      document.getElementById('ql-drawer').classList.remove('open');
      document.getElementById('ql-overlay').classList.remove('open');
    }
    function initQuickLinks(role) {
      const links = (CONFIG.QUICK_LINKS || []).filter(l => l.roles.includes(role));
      if (!links.length) return;
      const trigger = document.getElementById('ql-trigger');
      if (trigger) { trigger.style.display = 'flex'; lucide.createIcons(); }
      const container = document.getElementById('ql-links');
      if (!container) return;
      container.innerHTML = links.map(l => `
        <a class="ql-link" href="${l.href}">
          <i data-lucide="${l.icon}" class="ql-link-icon"></i>
          <span>${l.label}</span>
        </a>
      `).join('');
      lucide.createIcons();
    }
    // N-303: this file loads (deferred) after js/actions.js, so the actions are
    // registered at top level - no DOMContentLoaded wrapper needed.
    registerActions({
      openQuickLinks,
      closeQuickLinks,
      handleSignOut,
      refreshCCBanner,
    });
    document.addEventListener('DOMContentLoaded', initHome);