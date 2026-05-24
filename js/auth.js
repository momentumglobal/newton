const msalConfig = {
  auth: {
    clientId:    CONFIG.CLIENT_ID,
    authority:   CONFIG.AUTHORITY,
    redirectUri: CONFIG.REDIRECT_URI,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
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
      sessionStorage.setItem('userEmail', account.username.toLowerCase());
      sessionStorage.setItem('userName',  account.name);
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
  sessionStorage.clear();
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
    email: sessionStorage.getItem('userEmail'),
    name:  sessionStorage.getItem('userName'),
  };
}

function isSignedIn() {
  return msalInstance.getAllAccounts().length > 0;
}
