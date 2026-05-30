// js/people-router.js — People module page registry

const PEOPLE_ROLES = {
  ADMIN:      'admin',
  LEADERSHIP: 'leadership',
};

// All People module pages — Admin and Leadership only.
// Add new pages here as each phase is built.
const PEOPLE_PAGES = {
  peopleDashboard: { label: 'People Dashboard',   roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP] },
  peopleGantt:     { label: 'Deployment Timeline',roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP] },
  peopleTracker:   { label: 'Employee Tracker',   roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP] },
  gpInvoices:      { label: 'G-P Invoices',       roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP] },
};

function peopleCanAccess(page, role) {
  return PEOPLE_PAGES[page] && PEOPLE_PAGES[page].roles.includes(role);
}

function getPeopleAccessiblePages(role) {
  return Object.entries(PEOPLE_PAGES)
    .filter(([, cfg]) => cfg.roles.includes(role))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}
