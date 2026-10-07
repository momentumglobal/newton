// js/frame-guard.js - clickjacking guard (N-292, SEC-12).
//
// GitHub Pages cannot send X-Frame-Options or CSP frame-ancestors, and
// frame-ancestors is ignored inside a <meta> CSP, so this is the only
// framing defence Newton has. Loaded synchronously in <head>, straight after
// diag-buffer.js, on every app page (not on redirect.html or the static
// guides - see CSP_APP_PAGES in tests/lint-csp.js).
//
// Deliberately standalone, like diag-buffer.js and theme-init.js: it runs
// before CONFIG exists, so it reads nothing from config.js.
//
// Behaviour:
//   not framed                      -> nothing
//   framed, top is same-origin      -> nothing (MSAL's hidden iframe, a Newton
//                                      page inside a Newton page)
//   framed, top is cross-origin     -> hide the page FIRST, then try to break
//                                      out. Hiding first matters: a sandboxed
//                                      frame without allow-top-navigation makes
//                                      the break-out throw, and the page must
//                                      then stay invisible, not clickable.
// Reading window.top.location.origin throws for a cross-origin (or sandboxed,
// opaque-origin) top, which is how "hostile" is detected.
(function () {
  try {
    if (window.top === window.self) return;
    try {
      if (window.top.location.origin === window.location.origin) return;
    } catch (e) { /* cross-origin top: reading its location throws */ }
    document.documentElement.style.display = 'none';
    window.top.location = window.self.location.href;
  } catch (e) {
    try { document.documentElement.style.display = 'none'; } catch (e2) { /* nothing more we can do */ }
  }
})();