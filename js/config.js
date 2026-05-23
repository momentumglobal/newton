const CONFIG = {

  // Azure AD — from your Phase 2 notes
  TENANT_ID:    "b73023b1-298a-42a2-bed9-985e0a762054",
  CLIENT_ID:    "bf71f2b2-de80-4728-9189-af8659fbd2b6",

  // Microsoft login authority
  AUTHORITY:    "https://login.microsoftonline.com/b73023b1-298a-42a2-bed9-985e0a762054",

  // Your GitHub Pages URL — must match Azure AD redirect URI exactly
  REDIRECT_URI: "https://solutionshub-reporting.github.io/solutions-hub-reporting",

  // SharePoint
  SP_SITE_URL:  "https://talentpoint.sharepoint.com/sites/SolutionsHubReporting",
  SP_SITE_ID:   "talentpoint.sharepoint.com,330e562f-0ba1-4fd8-ae06-ffe3a9287271,b864c9c9-6fe0-4837-9713-5aaa4530de0d",

  // Admin users — M365 email addresses (lowercase)
  // These users get full Admin access in the app
  ADMIN_USERS: ["admin@momentumglobal.co", "chris.friend@momentumglobal.co"],

  // Leadership users — read-only Company Dashboard access
  LEADERSHIP_USERS: [],

};
