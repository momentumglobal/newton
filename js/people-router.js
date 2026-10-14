// js/people-router.js — People module page registry

const PEOPLE_ROLES = {
  ADMIN:            'admin',
  LEADERSHIP:       'leadership',
  PEOPLE_OPS:       'people_ops',
  SALES:            'sales',
  DELIVERY_MANAGER: 'delivery_manager',
  TALENT_PARTNER:   'talent_partner',
  STAFF:            'staff',
};

// All People module pages. Admin, Leadership and People Ops (N-331) see
// every page; DM + TP reach the Org Chart and Scorecards; Sales and Staff
// (N-331) reach the Org Chart only. Mirror any change in
// CONFIG.COMMAND_BAR_PAGES (config.js).
const PEOPLE_PAGES = {
  peopleDashboard: { label: 'People Dashboard',   roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP, PEOPLE_ROLES.PEOPLE_OPS] },
  orgChart:        { label: 'Org Chart',          roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP, PEOPLE_ROLES.PEOPLE_OPS, PEOPLE_ROLES.SALES, PEOPLE_ROLES.DELIVERY_MANAGER, PEOPLE_ROLES.TALENT_PARTNER, PEOPLE_ROLES.STAFF] },
  peopleGantt:     { label: 'Deployment Timeline',roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP, PEOPLE_ROLES.PEOPLE_OPS] },
  peopleTracker:   { label: 'Employee Tracker',   roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP, PEOPLE_ROLES.PEOPLE_OPS] },
  gpInvoices:      { label: 'Supplier Invoices',  roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP, PEOPLE_ROLES.PEOPLE_OPS] },
  scorecards:      { label: 'People Scorecards',  roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP, PEOPLE_ROLES.PEOPLE_OPS, PEOPLE_ROLES.DELIVERY_MANAGER, PEOPLE_ROLES.TALENT_PARTNER] },
  engagement:      { label: 'Engagement',         roles: [PEOPLE_ROLES.ADMIN, PEOPLE_ROLES.LEADERSHIP, PEOPLE_ROLES.PEOPLE_OPS] },
};

function peopleCanAccess(page, role) {
  return PEOPLE_PAGES[page] && PEOPLE_PAGES[page].roles.includes(role);
}

function getPeopleAccessiblePages(role) {
  return Object.entries(PEOPLE_PAGES)
    .filter(([, cfg]) => cfg.roles.includes(role))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}

// N-331: landing page — the first page in this order the role can open, or
// null when it can open none (people-app.js then sends the user home).
const PEOPLE_LANDING_ORDER = ['peopleDashboard', 'scorecards', 'orgChart'];

function getPeopleLandingPage(role) {
  return PEOPLE_LANDING_ORDER.find(page => peopleCanAccess(page, role)) || null;
}
