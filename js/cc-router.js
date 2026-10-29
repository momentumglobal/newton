// js/cc-router.js
const CC_PAGES = [
  { key: 'overview', label: 'Overview', roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP] },
  // N-401: install guide + download for Newton for Claude (renderCCClaudePage, cc-claude.js).
  { key: 'claudeMcp', label: 'Newton for Claude', roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP] },
];

function ccCanAccess(role) {
  return role === CONFIG.ROLE_IDS.ADMIN || role === CONFIG.ROLE_IDS.LEADERSHIP;
}

function ccGetAccessiblePages(role) {
  return CC_PAGES.filter(p => p.roles.includes(role));
}
