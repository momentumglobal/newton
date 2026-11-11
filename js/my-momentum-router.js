// js/my-momentum-router.js — My Momentum page registry (N-451 / MM-1)
//
// Who may open the module is the role list of its CONFIG.OS_MODULES entry (single source of truth; the
// Command Bar entry in CONFIG.COMMAND_BAR_PAGES mirrors it, as for every module). The pages are the
// tabs in CONFIG.MY_MOMENTUM.TABS; whether a tab is shown to one person is decided in
// my-momentum-logic.js, not here.

const MM_MODULE_ROLES = (CONFIG.OS_MODULES.find(m => m.key === 'myMomentum') || { roles: [] }).roles;

function mmCanAccess(page, role) {
  return MM_MODULE_ROLES.includes(role) && CONFIG.MY_MOMENTUM.TABS.some(t => t.key === page);
}

function getMmAccessiblePages(role) {
  return CONFIG.MY_MOMENTUM.TABS
    .filter(t => mmCanAccess(t.key, role))
    .map(t => ({ key: t.key, label: t.label }));
}