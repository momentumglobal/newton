const PAGES = {
  companyDashboard: { label: 'Company Dashboard',  roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP] },
  projectDashboard: { label: 'Project Dashboard',  roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER] },
  reportBuilder:    { label: 'Report Library',     roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER] },
  projects:         { label: 'Projects',           roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER] },
  roles:            { label: 'Roles',              roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER] },
  activity:         { label: 'Weekly Activity',    roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER] },
  placements:       { label: 'Placements',         roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER] },
  rejections:       { label: 'Rejected Offers',    roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER] },
  hiringPlan:       { label: 'Hiring Plan',        roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER, CONFIG.ROLE_IDS.LEADERSHIP] },
  adminPanel:       { label: 'Config Panel',       roles: [CONFIG.ROLE_IDS.ADMIN] },
};
function canAccess(page, role) {
  return PAGES[page] && PAGES[page].roles.includes(role);
}
function getAccessiblePages(role) {
  return Object.entries(PAGES)
    .filter(([, cfg]) => cfg.roles.includes(role))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}
