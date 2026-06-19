// js/sales-router.js — Sales module page registry

const SALES_ROLES = {
  ADMIN:      'admin',
  LEADERSHIP: 'leadership',
};

const SALES_PAGES = {
  revenueTracking: { label: 'Revenue Tracking', roles: [SALES_ROLES.ADMIN, SALES_ROLES.LEADERSHIP] },
  salesForecast:   { label: 'Sales Forecast',   roles: [SALES_ROLES.ADMIN, SALES_ROLES.LEADERSHIP] },
};

function salesCanAccess(page, role) {
  return SALES_PAGES[page] && SALES_PAGES[page].roles.includes(role);
}

function getSalesAccessiblePages(role) {
  return Object.entries(SALES_PAGES)
    .filter(([, cfg]) => cfg.roles.includes(role))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}
