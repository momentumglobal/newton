const ROLES = {
  ADMIN:      'admin',
  DM:         'delivery_manager',
  TP:         'talent_partner',
  LEADERSHIP: 'leadership',
};
const PAGES = {
  companyDashboard: { label: 'Company Dashboard',  roles: [ROLES.ADMIN, ROLES.LEADERSHIP] },
  projectDashboard: { label: 'Project Dashboard',  roles: [ROLES.ADMIN, ROLES.DM, ROLES.TP] },
  reportBuilder:    { label: 'Report Builder',     roles: [ROLES.ADMIN, ROLES.DM, ROLES.TP] },
  projects:         { label: 'Projects',           roles: [ROLES.ADMIN, ROLES.DM, ROLES.TP] },
  roles:            { label: 'Roles',              roles: [ROLES.ADMIN, ROLES.DM, ROLES.TP] },
  activity:         { label: 'Weekly Activity',    roles: [ROLES.ADMIN, ROLES.DM, ROLES.TP] },
  placements:       { label: 'Placements',         roles: [ROLES.ADMIN, ROLES.DM, ROLES.TP] },
  rejections:       { label: 'Rejected Offers',    roles: [ROLES.ADMIN, ROLES.DM, ROLES.TP] },
  hiringPlan:       { label: 'Hiring Plan',        roles: [ROLES.ADMIN, ROLES.DM, ROLES.TP, ROLES.LEADERSHIP] },
  adminPanel:       { label: 'Config Panel',       roles: [ROLES.ADMIN] },
};
function canAccess(page, role) {
  return PAGES[page] && PAGES[page].roles.includes(role);
}
function getAccessiblePages(role) {
  return Object.entries(PAGES)
    .filter(([, cfg]) => cfg.roles.includes(role))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}
