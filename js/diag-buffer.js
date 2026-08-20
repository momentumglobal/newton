// js/diag-buffer.js — early-load error buffer (N-179, follow-up to N-172)
//
// Loads BEFORE everything else in every shell (first line inside <head>,
// ahead of theme-init.js and config.js) so it can catch a top-level throw or
// rejection during parse of theme-init.js, config.js, auth.js, utils.js or
// api.js — the one gap N-172 documented and deliberately deferred.
//
// Deliberately dumb: no CONFIG (hasn't loaded yet), no dedupe, no ghost
// check, no 'Script error.' filter, no sessionStorage. Its only job is
// "don't lose it before js/diagnostics.js exists" — every real guard
// (dedupe/cap/ghost/recursion) lives in diagnostics.js's reportError() and
// runs once, when this buffer is drained through it. See N-179 spec.
//
// DIAG_BUFFER_CAP is a local literal, not CONFIG.DIAGNOSTICS — CONFIG has
// not parsed yet at this point in the load order, so there is no single
// source of truth to read from. It bounds memory only; the real session cap
// (CONFIG.DIAGNOSTICS.maxPerSession) is still enforced by reportError() when
// each buffered record is drained.
(function () {
  var DIAG_BUFFER_CAP = 50;

  window.__diagBuffer = [];
  window.__diagBufferActive = true;

  function push(rec) {
    if (!window.__diagBufferActive) return;
    if (window.__diagBuffer.length >= DIAG_BUFFER_CAP) return;
    window.__diagBuffer.push(rec);
  }

  // Same normalisation diagnostics.js's own 'error' handler uses.
  window.addEventListener('error', function (e) {
    if (!(e instanceof ErrorEvent)) return;
    var stack = (e.error && e.error.stack) ? e.error.stack : '';
    if (!stack && e.filename) {
      stack = e.filename + ':' + (e.lineno || 0) + ':' + (e.colno || 0);
    }
    push({ errorType: 'error', message: e.message, stack: stack });
  });

  // Same normalisation diagnostics.js's own 'unhandledrejection' handler uses.
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    if (reason instanceof Error) {
      push({ errorType: 'unhandledrejection', message: reason.message, stack: reason.stack });
    } else {
      push({ errorType: 'unhandledrejection', message: String(reason), stack: '' });
    }
  });
})();
