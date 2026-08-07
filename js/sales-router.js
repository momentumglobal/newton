// js/sales-router.js — Sales module page registry

const SALES_ROLES = {
  ADMIN:            'admin',
  LEADERSHIP:       'leadership',
  DELIVERY_MANAGER: 'delivery_manager',
};

// DMs access ONLY the lciModels page (mirrors People-module DM→Scorecards
// scoping). Revenue pages stay Admin/Leadership.
const SALES_PAGES = {
  revenueTracking: { label: 'Revenue Tracking', roles: [SALES_ROLES.ADMIN, SALES_ROLES.LEADERSHIP] },
  salesForecast:   { label: 'Sales Forecast',   roles: [SALES_ROLES.ADMIN, SALES_ROLES.LEADERSHIP] },
  lciModels:       { label: 'LCI Cost Models',  roles: [SALES_ROLES.ADMIN, SALES_ROLES.LEADERSHIP, SALES_ROLES.DELIVERY_MANAGER] },
  lciLeadMagnet:   { label: 'LCI Lead Magnet',  roles: [SALES_ROLES.ADMIN, SALES_ROLES.LEADERSHIP] },
};

function salesCanAccess(page, role) {
  return SALES_PAGES[page] && SALES_PAGES[page].roles.includes(role);
}

function getSalesAccessiblePages(role) {
  return Object.entries(SALES_PAGES)
    .filter(([, cfg]) => cfg.roles.includes(role))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}
