// js/people-router.js — People module page registry

const PEOPLE_ROLES = {
  ADMIN:            'admin',
  LEADERSHIP:       'leadership',
  DELIVERY_MANAGER: 'delivery_manager',
  TALENT_PARTNER:   'talent_partner',
};

// All People module pages — Admin and Leadership only.
// Add new pages here as each phase is built.
const PEOPLE_PAGES = {
  peopleDashboard: { label: 'People Dashboard',   roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP] },
  orgChart:        { label: 'Org Chart',          roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP, PEOPLE_ROLES.DELIVERY_MANAGER, PEOPLE_ROLES.TALENT_PARTNER] },
  peopleGantt:     { label: 'Deployment Timeline',roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP] },
  peopleTracker:   { label: 'Employee Tracker',   roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP] },
  gpInvoices:      { label: 'G-P Invoices',       roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP] },
  scorecards:      { label: 'People Scorecards',  roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP, PEOPLE_ROLES.DELIVERY_MANAGER, PEOPLE_ROLES.TALENT_PARTNER] },
  engagement:      { label: 'Engagement',         roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP] },
};

function peopleCanAccess(page, role) {
  return PEOPLE_PAGES[page] && PEOPLE_PAGES[page].roles.includes(role);
}

function getPeopleAccessiblePages(role) {
  return Object.entries(PEOPLE_PAGES)
    .filter(([, cfg]) => cfg.roles.includes(role))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}
