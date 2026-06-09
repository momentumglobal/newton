// js/cc-router.js
const CC_PAGES = [
  { id: 'overview', label: 'Overview', roles: ['admin', 'leadership'] },
];

function ccCanAccess(role) {
  return role === 'admin' || role === 'leadership';
}

function ccGetAccessiblePages(role) {
  return CC_PAGES.filter(p => p.roles.includes(role));
}
