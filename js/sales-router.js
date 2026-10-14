// js/sales-router.js — Sales module page registry

const SALES_ROLES = {
  ADMIN:            'admin',
  LEADERSHIP:       'leadership',
  SALES:            'sales',
  DELIVERY_MANAGER: 'delivery_manager',
};

// DMs access ONLY the lciModels page (mirrors People-module DM→Scorecards
// scoping). Revenue pages stay Admin/Leadership/Sales. N-331: the sales role
// gets every page, like Leadership. Mirror any change in
// CONFIG.COMMAND_BAR_PAGES (config.js).
const SALES_PAGES = {
  revenueTracking: { label: 'Revenue Tracking', roles: [SALES_ROLES.ADMIN, SALES_ROLES.LEADERSHIP, SALES_ROLES.SALES] },
  salesForecast:   { label: 'Sales Forecast',   roles: [SALES_ROLES.ADMIN, SALES_ROLES.LEADERSHIP, SALES_ROLES.SALES] },
  lciModels:       { label: 'LCI Cost Models',  roles: [SALES_ROLES.ADMIN, SALES_ROLES.LEADERSHIP, SALES_ROLES.SALES, SALES_ROLES.DELIVERY_MANAGER] },
  lciLeadMagnet:   { label: 'LCI Lead Magnet',  roles: [SALES_ROLES.ADMIN, SALES_ROLES.LEADERSHIP, SALES_ROLES.SALES] },
};

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
