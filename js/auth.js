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

function getCurrentUser() {
  return {
    email: localStorage.getItem('userEmail'),
    name:  localStorage.getItem('userName'),
  };
}

function isSignedIn() {
  return msalInstance.getAllAccounts().length > 0;
}
