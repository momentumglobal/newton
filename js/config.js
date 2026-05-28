// js/config.js — App configuration and role helpers

const CONFIG = {
  TENANT_ID:    "b73023b1-298a-42a2-bed9-985e0a762054",
  CLIENT_ID:    "bf71f2b2-de80-4728-9189-af8659fbd2b6",
  AUTHORITY:    "https://login.microsoftonline.com/b73023b1-298a-42a2-bed9-985e0a762054",
  REDIRECT_URI: "https://momentumglobal.github.io/newton",
  SP_SITE_URL:  "https://talentpoint.sharepoint.com/sites/SolutionsHubReporting",
  SP_SITE_ID:   "talentpoint.sharepoint.com,330e562f-0ba1-4fd8-ae06-ffe3a9287271,b864c9c9-6fe0-4837-9713-5aaa4530de0d",
  // Hardcoded admin users — full access, never overridden by SharePoint data
  ADMIN_USERS:  ["admin@momentumglobal.co", "chris.friend@momentumglobal.co", "aliyah@momentumglobal.co"],
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
