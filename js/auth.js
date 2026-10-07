// N-290 (SEC-10): MSAL v5 (js/vendor/msal-browser-5.24.0.min.js).
// - Tokens live in sessionStorage, so they are gone when the tab closes
//   (audit S-6). A new tab or a PWA relaunch signs in again: authReady()
//   starts that automatically, once per tab.
// - v5 throws on any MSAL call made before initialize(), so pages never call
//   msalInstance.handleRedirectPromise() themselves. They await authReady().
//   tests/lint-vendor.js (lintMsalCalls) keeps it that way.
// - storeAuthStateInCookie no longer exists in v5.
const msalConfig = {
  auth: {
    clientId:    CONFIG.CLIENT_ID,
    authority:   CONFIG.AUTHORITY,
    redirectUri: CONFIG.REDIRECT_URI,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};
const msalInstance = new msal.PublicClientApplication(msalConfig);

// N-291 (SEC-11): Sites.Selected, not Sites.ReadWrite.All. Entra grants the
// Newton app 'write' on the SolutionsHubReporting site only, so the token
// reaches no other site; a user's access is the overlap of that grant and
// their own SharePoint permissions. Entra puts every consented Graph scope
// in the token, so the real fix is Sites.ReadWrite.All's consent being
// removed in Entra, not this line. Runbook: specs/N-291-runbook.md.
const loginRequest = {
  scopes: ['User.Read', 'Sites.Selected'],
};

// N-290: per-tab sessionStorage flags for the automatic sign-in.
//   AUTO_SIGNIN_TRIED: set just before the one automatic redirect, so a
//     failed or cancelled sign-in shows the Sign-in button instead of looping.
//   SIGNED_OUT: set by signOut(), so landing back after logout shows the
//     button instead of signing straight back in.
// Both clear once an account exists; signIn() also clears SIGNED_OUT.
const AUTH_FLAG_AUTO_SIGNIN_TRIED = 'newton_autosignin_tried';
const AUTH_FLAG_SIGNED_OUT        = 'newton_signed_out';

function _authFlagGet(key) {
  try { return sessionStorage.getItem(key) === '1'; } catch (e) { return false; }
}
function _authFlagSet(key, on) {
  try {
    if (on) sessionStorage.setItem(key, '1');
    else sessionStorage.removeItem(key);
  } catch (e) { /* storage blocked: the flags are best-effort */ }
}

// N-290: MSAL v2 kept tokens in localStorage and v5 neither migrates nor
// removes them, so delete them before MSAL starts. Runs on every page load
// (cheap) so it also cleans up after an older build, e.g. a stale /v2/.
function _purgeLegacyMsalStorage() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys
      .filter(k => isLegacyMsalStorageKey(k, CONFIG.CLIENT_ID, CONFIG.TENANT_ID))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('Legacy MSAL token purge skipped:', e && e.message);
  }
}

// Silent token requests send Microsoft's hidden-iframe response to
// redirect.html (the v5 redirect bridge), never to a full Newton page. MSAL
// only uses that iframe once the refresh token has expired; without the
// bridge, v5 falls back to a full-page redirect. Interactive sign-in still
// returns to CONFIG.REDIRECT_URI.
function _silentRequest(request, account) {
  return { ...request, account, redirectUri: CONFIG.SILENT_REDIRECT_URI };
}

// A Microsoft response (#code=... or #error=...) in the URL.
const _AUTH_RESPONSE_IN_HASH = /[#&](code|error)=/;
let _authReadyPromise = null;

// N-290: the single page bootstrap. Every page awaits this instead of calling
// msalInstance.handleRedirectPromise(). Resolves with the redirect response,
// or null. Rejects on an MSAL error, so the page's own .catch shows the login
// screen. It never resolves while the page is being left (MSAL navigating
// back to the page that started sign-in, or the automatic sign-in redirect
// under way), so nothing on the page races that navigation.
// Created on first call, not at load: it uses utils.js helpers, and auth.js
// loads before utils.js.
function authReady() {
  if (!_authReadyPromise) _authReadyPromise = _authBootstrap();
  return _authReadyPromise;
}

function _authNeverResolves() {
  return new Promise(() => {});
}

async function _authBootstrap() {
  _purgeLegacyMsalStorage();
  await msalInstance.initialize();
  const hadResponse = _AUTH_RESPONSE_IN_HASH.test(window.location.hash);
  const response = await msalInstance.handleRedirectPromise();

  if (msalInstance.getAllAccounts().length > 0) {
    _authFlagSet(AUTH_FLAG_AUTO_SIGNIN_TRIED, false);
    _authFlagSet(AUTH_FLAG_SIGNED_OUT, false);
    return response;
  }

  // MSAL took the response off this page (it clears the hash) and is
  // navigating back to the page that started sign-in. Hold here so this page
  // (e.g. index.html, which would bounce to reporting.html) doesn't race it.
  if (hadResponse && !_AUTH_RESPONSE_IN_HASH.test(window.location.hash)) {
    return _authNeverResolves();
  }

  if (shouldAutoSignIn({
    hasAccount:        false,
    triedThisTab:      _authFlagGet(AUTH_FLAG_AUTO_SIGNIN_TRIED),
    signedOut:         _authFlagGet(AUTH_FLAG_SIGNED_OUT),
    authResponseInUrl: hadResponse,
  })) {
    _authFlagSet(AUTH_FLAG_AUTO_SIGNIN_TRIED, true);
    try {
      await msalInstance.loginRedirect(loginRequest);
    } catch (e) {
      console.warn('Automatic sign-in did not start:', e && (e.errorCode || e.message));
      return null;
    }
    return _authNeverResolves();
  }
  return null;
}

async function signIn() {
  _authFlagSet(AUTH_FLAG_SIGNED_OUT, false);
  await msalInstance.initialize(); // no-op once authReady() has run
  await msalInstance.loginRedirect(loginRequest);
}

// Called by every sign-out path (this one and mobile-app.js's).
function markSignedOut() {
  _authFlagSet(AUTH_FLAG_SIGNED_OUT, true);
}

function signOut() {
  localStorage.clear();
  sessionStorage.clear();
  markSignedOut();
  msalInstance.logoutRedirect();
}

async function getToken() {
  await authReady();
  const account = msalInstance.getAllAccounts()[0];
  if (!account) return null;
  try {
    const response = await msalInstance.acquireTokenSilent(_silentRequest(loginRequest, account));
    return response.accessToken;
  } catch (e) {
    await msalInstance.acquireTokenRedirect(loginRequest);
    return null;
  }
}

// N-282: identity comes from the MSAL account, never from localStorage
// (user-writable — a forged userEmail used to resolve as that user). Email is
// null when nobody is signed in. Name is display-only, so it may fall back to
// the localStorage value written at login.
function getCurrentUser() {
  const account = msalInstance.getAllAccounts()[0];
  return {
    email: account && account.username ? account.username.toLowerCase() : null,
    name:  (account && account.name) || localStorage.getItem('userName'),
  };
}

function isSignedIn() {
  return msalInstance.getAllAccounts().length > 0;
}
