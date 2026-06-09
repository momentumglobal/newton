// js/mr-router.js — Market Analytics module page registry

const MR_ROLES = {
  ADMIN: "admin",
  DM:    "delivery_manager",
  TP:    "talent_partner",
};

const MR_PAGES = {
  placementAnalytics: {
    label: "Placement Analytics",
    roles: [MR_ROLES.ADMIN, MR_ROLES.DM, MR_ROLES.TP],
  },
  marketReport: {
    label: "Market Report Builder",
    roles: [MR_ROLES.ADMIN, MR_ROLES.DM, MR_ROLES.TP],
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
