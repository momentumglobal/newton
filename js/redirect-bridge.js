// js/redirect-bridge.js — N-290 (SEC-10). Runs only on redirect.html.
// Passes Microsoft's response back to the Newton page that asked for it
// (MSAL v5 redirect bridge). Kept out of redirect.html so the page has no
// inline script (N-292 CSP).
msalRedirectBridge.broadcastResponseToMainFrame().catch(function (e) {
  console.error('Newton sign-in bridge:', e && (e.errorCode || e.message));
});