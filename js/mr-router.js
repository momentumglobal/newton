// js/mr-router.js — Market Analytics module page registry

const MR_PAGES = {
  placementAnalytics: {
    label: "Placement Analytics",
    roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER],
  },
  marketReport: {
    label: "Market Report Library",
    roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER],
  },
};

function mrCanAccess(page, role) {
  return MR_PAGES[page] && MR_PAGES[page].roles.includes(role);
}

function getMrAccessiblePages(role) {
  return Object.entries(MR_PAGES)
    .filter(([, cfg]) => cfg.roles.includes(role))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}
