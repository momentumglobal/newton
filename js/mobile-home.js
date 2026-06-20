// js/mobile-home.js -- Mobile module launcher (home screen)
//
// Renders a role-aware grid of modules the user can access on mobile.
// Source of truth for WHICH modules exist on desktop + their roles =
// CONFIG.OS_MODULES (config.js). Source of truth for which of those have
// a built mobile experience = MOBILE_MODULES (mobile-app.js).
// A module appears here only if BOTH: the user's role is allowed AND it
// has a mobile view built.

// Lucide-style inline SVGs keyed by the icon name used in CONFIG.OS_MODULES.
// (mobile.html has no Lucide runtime, so we map the few icons we need.)
const M_MODULE_ICONS = {
  'bar-chart-2': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  'brain':       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>',
  'users':       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  'trending-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  'monitor':     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
};

// Returns the modules to show on mobile for the current role.
function mobileGetAccessibleModules() {
  const role = _mobileRole;
  return (CONFIG.OS_MODULES || []).filter(m =>
    MOBILE_MODULES.has(m.key) &&            // has a built mobile view
    Array.isArray(m.roles) &&
    m.roles.includes(role)                  // role is allowed
  );
}

function mobileRenderHome(main) {
  mobileSetTitle('Newton', 'Home');

  const modules = mobileGetAccessibleModules();

  if (!modules.length) {
    main.innerHTML = '<div class="m-empty">No modules are available for your role on mobile yet.</div>';
    return;
  }

  const cards = modules.map(m => {
    const icon = M_MODULE_ICONS[m.icon] || '';
    return `
      <button class="m-module-card" onclick="mobileOpenModule('${m.key}')">
        <div class="m-module-icon">${icon}</div>
        <div class="m-module-name">${m.name}</div>
      </button>`;
  }).join('');

  main.innerHTML = `
    <div class="m-home-greeting">
      <div class="m-home-hello">Welcome back, ${(_mobileUser?.name || '').split(' ')[0] || ''}</div>
      <div class="m-home-sub">Select a module to get started</div>
    </div>
    <div class="m-module-grid">${cards}</div>
  `;
}
