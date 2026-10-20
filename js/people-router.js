// js/people-router.js — People module page registry

// All People module pages. Admin, Leadership and People Ops (N-331) see
// every page; DM + TP reach the Org Chart and Scorecards; Sales and Staff
// (N-331) reach the Org Chart only. Mirror any change in
// CONFIG.COMMAND_BAR_PAGES (config.js).
const PEOPLE_PAGES = {
  peopleDashboard: { label: 'People Dashboard',   roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.PEOPLE_OPS] },
  orgChart:        { label: 'Org Chart',          roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.PEOPLE_OPS, CONFIG.ROLE_IDS.SALES, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER, CONFIG.ROLE_IDS.STAFF] },
  peopleGantt:     { label: 'Deployment Timeline',roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.PEOPLE_OPS] },
  peopleTracker:   { label: 'Employee Tracker',   roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.PEOPLE_OPS] },
  gpInvoices:      { label: 'Supplier Invoices',  roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.PEOPLE_OPS] },
  scorecards:      { label: 'People Scorecards',  roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.PEOPLE_OPS, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER] },
  engagement:      { label: 'Engagement',         roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.PEOPLE_OPS] },
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
