const msalConfig = {
  auth: {
    clientId:    CONFIG.CLIENT_ID,
    authority:   CONFIG.AUTHORITY,
    redirectUri: CONFIG.REDIRECT_URI,
  },
  cache: {
    cacheLocation:          'localStorage',
    storeAuthStateInCookie: true,
  },
};
const msalInstance = new msal.PublicClientApplication(msalConfig);
const loginRequest = {
  scopes: ['User.Read', 'Sites.ReadWrite.All'],
};

async function signIn() {
  await msalInstance.loginRedirect(loginRequest);
}

function signOut() {
  localStorage.clear();
  sessionStorage.clear();
  msalInstance.logoutRedirect();
}

async function getToken() {
  const account = msalInstance.getAllAccounts()[0];
  if (!account) return null;
  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
    });
    return response.accessToken;
  } catch (e) {
    await msalInstance.acquireTokenRedirect(loginRequest);
    return null;
  }
}

// Elevated, requested only for the Admin > Data Health "Index now" action
// (N-092). Sites.Manage.All is required to PATCH columnDefinition.indexed;
// Sites.ReadWrite.All (loginRequest, above) returns "Access denied". Kept
// as a separate incremental-consent request rather than folded into
// loginRequest so ordinary sign-in for every Newton user never asks for
// or receives this elevated scope — only an admin clicking "Index now"
// triggers it (the Data Health tab is already admin-gated in admin.html).
// Requires Sites.Manage.All added + admin-consented on the app
// registration in Entra first — see N-092-diff-2 Step 1.
const elevatedRequest = { scopes: ['Sites.Manage.All'] };
async function getElevatedToken() {
  const account = msalInstance.getAllAccounts()[0];
  if (!account) return null;
  try {
    const response = await msalInstance.acquireTokenSilent({
      ...elevatedRequest,
      account,
    });
    return response.accessToken;
  } catch (e) {
    await msalInstance.acquireTokenRedirect(elevatedRequest);
    return null;
  }
}

function getCurrentUser() {
  return {
    email: localStorage.getItem('userEmail'),
    name:  localStorage.getItem('userName'),
  };
}

function isSignedIn() {
  return msalInstance.getAllAccounts().length > 0;
}
