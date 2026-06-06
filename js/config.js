// js/config.js — App configuration and role helpers

const CONFIG = {
  TENANT_ID:    "b73023b1-298a-42a2-bed9-985e0a762054",
  CLIENT_ID:    "bf71f2b2-de80-4728-9189-af8659fbd2b6",
  AUTHORITY:    "https://login.microsoftonline.com/b73023b1-298a-42a2-bed9-985e0a762054",
  REDIRECT_URI: "https://momentumglobal.github.io/newton/",
  SP_SITE_URL:  "https://talentpoint.sharepoint.com/sites/SolutionsHubReporting",
  SP_SITE_ID:   "talentpoint.sharepoint.com,330e562f-0ba1-4fd8-ae06-ffe3a9287271,b864c9c9-6fe0-4837-9713-5aaa4530de0d",
  // Hardcoded admin users — full access, never overridden by SharePoint data
  ADMIN_USERS:  ["admin@momentumglobal.co", "chris.friend@momentumglobal.co", "aliyah@momentumglobal.co"],

  // Maps hire location (country) to ISO currency code.
  // Used to auto-derive currency when a role is created/edited,
  // and when a placement is recorded against a role.
  COUNTRY_CURRENCY: {
    "UK":              "GBP",
    "Ireland":         "EUR",
    "Croatia":         "EUR",
    "Germany":         "EUR",
    "France":          "EUR",
    "Netherlands":     "EUR",
    "Spain":           "EUR",
    "Portugal":        "EUR",
    "USA":             "USD",
    "Canada":          "CAD",
    "Australia":       "AUD",
    "Singapore":       "SGD",
    "UAE":             "AED",
    "South Africa":    "ZAR",
    "Sri Lanka":       "LKR",
    "Tunisia":         "TND",
    "Romania":         "RON",
  },

  ANALYTICS_BENCHMARKS: {
  outreachConversion:   0.25,  // 25% — Outreach → Response
  submissionConversion: 0.80,  // 80% — Submitted → Interview 1
  interviewToOffer:     0.20,  // 20% (5:1) — Interview 1 → Offer
  offerSuccess:         0.80,  // 80% — Offer → Hire
  timeToHireDays:       45,    // 45 days
  flagThreshold:        0.80,  // flag at 80% of benchmark
},

  UTILISATION_THRESHOLDS: {
  green: 0.85,  // >= 85% billed = healthy
  amber: 0.75,  // >= 75% billed = watch
  // < 75% = red — colour values in style.css as .cc-tile--red etc.
},
  
  // Single source of truth for the module switcher dropdown.
  // To add a new module, add it here only — all nav files reference this.
  OS_MODULES: [
    { key: 'reporting', name: 'Reporting',        icon: 'bar-chart-2',  href: 'reporting.html',        live: true, roles: ['admin','delivery_manager','talent_partner','leadership'] },
    { key: 'marketing', name: 'Market Reporting', icon: 'megaphone',    href: 'market-reporting.html', live: true, roles: ['admin','delivery_manager','talent_partner'] },
    { key: 'people',    name: 'People',           icon: 'users',        href: 'people.html',           live: true, roles: ['admin','leadership'] },
    { key: 'sales',     name: 'Sales',            icon: 'trending-up',  href: 'sales.html',            live: true, roles: ['admin','leadership'] },
    { key: 'command',   name: 'Command Centre',   icon: 'monitor',      href: 'command-centre.html',   live: true, roles: ['admin','leadership'] },
  ],
};

// Synchronous role check — only resolves admin (from config) or viewer
// Used for immediate UI gating (show/hide buttons)
function getUserRole(email) {
  if (CONFIG.ADMIN_USERS?.includes(email.toLowerCase())) return 'admin';
  return 'viewer';
}

// Async role check — resolves full role from SharePoint lists at runtime
// Use where accuracy matters (dashboard filtering, page access control)
async function getUserRoleAsync(email) {
  return getEffectiveRole(email);
}
