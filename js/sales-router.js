// js/sales-router.js — Sales module page registry

// DMs access ONLY the lciModels page (mirrors People-module DM→Scorecards
// scoping). Revenue pages stay Admin/Leadership/Sales. N-331: the sales role
// gets every page, like Leadership. Mirror any change in
// CONFIG.COMMAND_BAR_PAGES (config.js).
const SALES_PAGES = {
  revenueTracking: { label: 'Revenue Tracking', roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.SALES] },
  salesForecast:   { label: 'Sales Forecast',   roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.SALES] },
  lciModels:       { label: 'LCI Cost Models',  roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.SALES, CONFIG.ROLE_IDS.DELIVERY_MANAGER] },
  lciLeadMagnet:   { label: 'LCI Lead Magnet',  roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.SALES] },
};

function salesCanAccess(page, role) {
  return SALES_PAGES[page] && SALES_PAGES[page].roles.includes(role);
}

function getSalesAccessiblePages(role) {
  return Object.entries(SALES_PAGES)
    .filter(([, cfg]) => cfg.roles.includes(role))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}

// N-331: landing page — the first page in this order the role can open, or
// null when it can open none (sales-app.js then sends the user home).
const SALES_LANDING_ORDER = ['revenueTracking', 'lciModels'];

function getSalesLandingPage(role) {
  return SALES_LANDING_ORDER.find(page => salesCanAccess(page, role)) || null;
}
