const ROLES = {
  ADMIN:      'admin',
  DM:         'delivery_manager',
  TP:         'talent_partner',
  LEADERSHIP: 'leadership',
};

function getUserRole(email) {
  if (!email) return null;
  if (CONFIG.ADMIN_USERS.includes(email.toLowerCase())) return ROLES.ADMIN;
  if (CONFIG.LEADERSHIP_USERS.includes(email.toLowerCase())) return ROLES.LEADERSHIP;
  // DM and TP roles are assigned via SharePoint project records.
  // In this phase we default to TP — full role resolution added in Phase 5.
  return ROLES.TP;
}

const PAGES = {
  dashboard:        { label: 'Dashboard',         roles: [ROLES.ADMIN, ROLES.DM, ROLES.TP, ROLES.LEADERSHIP] },
  roleTracker:      { label: 'Role Tracker',      roles: [ROLES.ADMIN, ROLES.DM, ROLES.TP] },
  activityInput:    { label: 'Activity Input',    roles: [ROLES.ADMIN, ROLES.TP] },
  projectDashboard: { label: 'Project Dashboard', roles: [ROLES.ADMIN, ROLES.DM] },
  companyDashboard: { label: 'Company Dashboard', roles: [ROLES.ADMIN, ROLES.LEADERSHIP] },
  adminPanel:       { label: 'Admin Panel',       roles: [ROLES.ADMIN] },
};

function canAccess(page, role) {
  return PAGES[page] && PAGES[page].roles.includes(role);
}

function getAccessiblePages(role) {
  return Object.entries(PAGES)
    .filter(([, cfg]) => cfg.roles.includes(role))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}
