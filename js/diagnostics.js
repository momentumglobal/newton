// js/diagnostics.js — client-side error telemetry engine (N-172 / F-7a)
//
// Registers the ONLY global error handlers in Newton. Captures uncaught
// errors and unhandled promise rejections and writes one row per distinct
// error to the Diagnostics SharePoint list. No UI of any kind — the
// admin-facing surface is N-173.
//
// LOAD ORDER: must load immediately after js/api.js in every shell. Depends
// on CONFIG (config.js), getGhostUser (utils.js), getCurrentUser/isSignedIn
// (auth.js) and createDiagnostic (api.js). Deliberately DOM-free so the one
// file works unmodified across all nine shells, including mobile.html (no
// theme-init.js) and admin.html/survey.html (no nav-core.js).
//
// KNOWN LIMITATION, accepted: the handlers register when this file parses,
// so a top-level throw in theme-init.js, config.js, auth.js, utils.js or
// api.js is NOT captured — the handler does not exist yet. Catching those
// would need a second buffering shim in <head> across nine HTML files: nine
// more edits and a second place to forget. Those failures also take the
// whole app down visibly on first load, which is the opposite of the silent
// runtime-failure class this file exists for (N-073, N-074, N-084 and N-137
// were all post-load, and all were reported to Chris by hand).
//
// RECURSION is the whole risk of this file. Three vectors, all closed below:
//   (a) an error thrown INSIDE report      -> the _reporting re-entrancy flag
//   (b) the Diagnostics write rejecting    -> the mandatory .catch() on it.
//       The flag is already false by then because the write is not awaited,
//       so that .catch is the real guard here, not the flag.
//   (c) a bug inside graphRequest itself   -> every ATTEMPT spends a cap slot
//       before the write is fired, so the worst case is
//       CONFIG.DIAGNOSTICS.maxPerSession rows and then silence, never a
//       write loop against SharePoint.

const DIAG_SEEN_KEY  = 'newton_diag_seen';
const DIAG_COUNT_KEY = 'newton_diag_count';

// Shell filename -> module key. The five switcher modules map to their
// CONFIG.OS_MODULES keys so N-173 can group consistently with the rest of
// Newton; index / admin / mobile / survey are literals because they are not
// in OS_MODULES at all. Deliberately NOT a reverse lookup over
// CONFIG.OS_MODULES[].href — that array covers only the five switcher
// modules and would return undefined for the four shells that need this
// most.
const DIAG_MODULES = {
  'reporting.html':        'reporting',
  'market-reporting.html': 'marketing',
  'people.html':           'people',
  'sales.html':            'sales',
  'command-centre.html':   'command',
  'index.html':            'index',
  'admin.html':            'admin',
  'mobile.html':           'mobile',
  'survey.html':           'survey',
};

let _reporting = false;

function diagFileName() {
  return location.pathname.split('/').pop() || 'index.html';
}
function diagModule() {
  const file = diagFileName();
  return DIAG_MODULES[file] || file;
}
// Not the router's page key: no module tracks a "current page" variable
// anywhere in js/, and mobile.html / survey.html have no router at all. The
// hash is what deep links already use and exists on every shell.
function diagPage() {
  return diagFileName() + (location.hash || '');
}

// Dedupe set and session cap live in sessionStorage so both survive
// navigation between the nine shells — Newton is multi-page, so in-memory
// state would re-write the same error on every navigation. Same convention
// ghost mode and role resolution already use, and both keys are wiped for
// free by the existing sessionStorage.clear() in auth.js:signOut().
function diagSeen() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(DIAG_SEEN_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}
function diagCount() {
  return Number(sessionStorage.getItem(DIAG_COUNT_KEY) || 0) || 0;
}

// First non-empty stack line after the message line. Separates two errors
// that share a message but come from different call sites.
function diagStackHead(stack) {
  const lines = String(stack || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  return lines.length > 1 ? lines[1] : lines[0];
}

function reportError(errorType, message, stack) {
  if (_reporting) return;                      // (a) re-entrancy guard
  _reporting = true;
  try {
    const cfg = (typeof CONFIG !== 'undefined' && CONFIG.DIAGNOSTICS) || null;
    if (!cfg || !cfg.enabled) return;

    // Suppressed in Ghost Mode, exactly as notifications.js suppresses the
    // bell (renderNotificationBell, line 57). An admin ghosting a user must
    // not file diagnostics against that user's identity, and ghost sessions
    // are where deliberate error-hunting happens.
    if (getGhostUser()) return;

    // N-173: strip a leading 'Uncaught ' (Chrome) and then a leading
    // 'Error: ' (Firefox/Safari) so the SAME defect groups under one key
    // regardless of which browser reported it. unhandledrejection messages
    // already read reason.message directly and pass through unchanged.
    // Historical rows written before this fix keep their prefix — N-173's
    // grouping panel will show them as separate, older groups.
    const msg = String(message || '').trim()
      .replace(/^Uncaught\s+/, '')
      .replace(/^Error:\s+/, '');
    if (!msg) return;

    // Errors thrown inside cross-origin scripts (unpkg lucide, jsdelivr
    // MSAL/SortableJS) are sanitised by the browser to this exact string
    // with no stack and no filename. Unactionable, and they all dedupe to
    // one key, so they would occupy a cap slot forever.
    if (msg === 'Script error.' && !stack) return;

    if (diagCount() >= cfg.maxPerSession) return;

    const key  = errorType + '|' + msg + '|' + diagStackHead(stack);
    const seen = diagSeen();
    if (seen.includes(key)) return;

    // Budget is spent BEFORE the write is attempted. A write that fails must
    // still consume its slot, or a failing write path becomes unbounded.
    seen.push(key);
    sessionStorage.setItem(DIAG_SEEN_KEY, JSON.stringify(seen));
    sessionStorage.setItem(DIAG_COUNT_KEY, String(diagCount() + 1));

    // Chris's call (N-172 spec): drop, do not queue. A pre-auth error is a
    // load-order/CDN failure where the app is dead anyway, and a
    // flush-after-auth buffer would be a new failure path inside the
    // reporter. The slot above is spent either way, so a storm of pre-auth
    // errors still terminates.
    if (!isSignedIn()) {
      console.warn('Diagnostics: not signed in, error dropped —', msg);
      return;
    }

    createDiagnostic({
      Title:      msg.slice(0, 80),
      UserEmail:  (getCurrentUser().email || '').toLowerCase(),
      Module:     diagModule(),
      Page:       diagPage(),
      Message:    msg.slice(0, cfg.maxMessageChars),
      Stack:      String(stack || '').slice(0, cfg.maxStackChars),
      UserAgent:  String(navigator.userAgent || '').slice(0, 255),
      OccurredAt: new Date().toISOString(),
      ErrorType:  errorType,
      Status:     'new',
    // NOT awaited, and the .catch is mandatory — (b) above: an uncaught
    // rejection here would fire unhandledrejection, a handler this very
    // file owns.
    }).catch(e => console.warn('Diagnostics: write failed —', e && e.message));
  } catch (e) {
    console.warn('Diagnostics: reporter failed —', e && e.message);
  } finally {
    _reporting = false;
  }
}

// addEventListener, NOT `window.onerror =`. onerror is a single-slot
// property: any later assignment anywhere silently replaces this handler
// with nothing to indicate it stopped working — the same single-source
// reasoning that killed the duplicated ghost banner in N-170. It also lets
// N-173 (or anything later) add its own listener without contention.
window.addEventListener('error', function (e) {
  // Resource-load failures (a 404 on a <script>/<img>/<link>) fire a plain
  // Event on window with no message and no stack. Worth capturing one day,
  // but they arrive in volume from CDN blips (unpkg, jsdelivr, the Momentum
  // .woff2 files) and would burn the session cap on noise. This guard is
  // what excludes them — do not "fix" it without raising the cap.
  if (!(e instanceof ErrorEvent)) return;
  let stack = (e.error && e.error.stack) ? e.error.stack : '';
  // Only synthesise a location when there is one. A cross-origin sanitised
  // error has filename '' and lineno 0, and must be left with an EMPTY
  // stack so the 'Script error.' guard above can see it.
  if (!stack && e.filename) {
    stack = e.filename + ':' + (e.lineno || 0) + ':' + (e.colno || 0);
  }
  reportError('error', e.message, stack);
});

window.addEventListener('unhandledrejection', function (e) {
  // e.reason may be an Error, a string, or any value at all.
  const reason = e.reason;
  if (reason instanceof Error) {
    reportError('unhandledrejection', reason.message, reason.stack);
  } else {
    reportError('unhandledrejection', String(reason), '');
  }
});

// Drain the early-load buffer (N-179 / js/diag-buffer.js), if present. This
// is the ONLY call to reportError() from outside this file's own two
// listeners above — every buffered record goes through the same guard order
// (re-entrancy -> enabled -> ghost -> cap -> dedupe -> ...) as a live error,
// so nothing is duplicated. Guarded on the buffer existing so this file still
// loads cleanly on its own (tests, or any future page that omits the shim).
if (typeof window.__diagBuffer !== 'undefined' && window.__diagBuffer.length) {
  window.__diagBuffer.forEach(function (rec) {
    reportError(rec.errorType, rec.message, rec.stack);
  });
}
window.__diagBuffer = [];
window.__diagBufferActive = false;
