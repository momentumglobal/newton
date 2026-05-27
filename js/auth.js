const msalConfig = {
  auth: {
    clientId:    CONFIG.CLIENT_ID,
    authority:   CONFIG.AUTHORITY,
    redirectUri: CONFIG.REDIRECT_URI,
  },
  cache: {
    cacheLocation:       'localStorage',   // persists across tabs/windows — fixes popup state loss
    storeAuthStateInCookie: true,          // fallback for browsers that block third-party storage
  },
};
const msalInstance = new msal.PublicClientApplication(msalConfig);
const loginRequest = {
  scopes: ['User.Read', 'Sites.ReadWrite.All'],
};
let signInInProgress = false;
async function signIn() {
  if (signInInProgress) return;
  signInInProgress = true;
  try {
    await msalInstance.loginPopup(loginRequest);
    const account = msalInstance.getAllAccounts()[0];
    if (account) {
      localStorage.setItem('userEmail', account.username.toLowerCase());
      localStorage.setItem('userName',  account.name);
      window.APP.init();
    }
  } catch (e) {
    console.error('Sign-in error:', e);
  } finally {
    signInInProgress = false;
  }
}
function signOut() {
  msalInstance.logoutPopup();
  localStorage.clear();
  window.location.reload();
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
    const response = await msalInstance.acquireTokenPopup(loginRequest);
    return response.accessToken;
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
