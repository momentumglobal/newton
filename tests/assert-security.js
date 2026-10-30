// tests/assert-security.js — SEC epic guards: CDN/vendor/MSAL, identity from storage, escaping/OData/upload, restricted lists and denial memo, PeoplePay/Payroll, CSP, frame-guard, eval/host guards, secret scan.
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  {
    name: 'no third-party script loads from a CDN (N-289 — SEC-9 guard)',
    fn: function () {
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const found = lintExternalScripts(ALL_HTML, ALL_SOURCES);
      _assertEqual(
        found.map(v => `${v.file}:${v.line}  ${v.src}`),
        [],
        'external script URLs (vendor the library into js/vendor/ instead)'
      );
    },
  },
  {
    name: 'js/vendor/ files match their VERSIONS.md rows (N-289 — SEC-9 guard)',
    fn: function () {
      if (typeof VENDOR_FILES === 'undefined') {
        _skip('Vendor hashing needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintVendorManifest(VENDOR_FILES, VENDOR_MANIFEST), [], 'js/vendor/ vs VERSIONS.md');
    },
  },
  {
    name: 'package.json pins exactly the versions in VERSIONS.md (N-289 — Dependabot manifest)',
    fn: function () {
      if (typeof VENDOR_PACKAGE_JSON === 'undefined') {
        _skip('Needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintPackagePins(VENDOR_MANIFEST, VENDOR_PACKAGE_JSON), [], 'package.json vs VERSIONS.md');
    },
  },
  {
    name: 'MSAL is only called through auth.js authReady() (N-290 — SEC-10 guard)',
    fn: function () {
      if (typeof lintMsalCalls === 'undefined' || typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      // Positive control: the lint must catch a direct call, or the clean
      // result below proves nothing.
      _assertEqual(
        lintMsalCalls(
          { 'x.html': '<script>\n  msalInstance.handleRedirectPromise().then(go);\n</script>' },
          { 'x-app.js': 'a();\nawait msalInstance.acquireTokenSilent(req);\n// msalInstance.loginRedirect(x) in a comment\nmsalInstance.logoutRedirect();\nmsalInstance.getAllAccounts();' }
        ).map(v => `${v.file}:${v.line} ${v.call}`),
        ['js/x-app.js:2 acquireTokenSilent', 'x.html:2 handleRedirectPromise'],
        'positive control: direct calls flagged; comments, logoutRedirect and getAllAccounts are not'
      );
      _assertEqual(
        lintMsalCalls(ALL_HTML, ALL_SOURCES).map(v => `${v.file}:${v.line}  msalInstance.${v.call}(`),
        [],
        'direct MSAL calls outside js/auth.js (await authReady() instead)'
      );
    },
  },
  {
    name: 'N-290 isLegacyMsalStorageKey — finds MSAL v2 localStorage entries, never a Newton key',
    fn: function () {
      const cid = 'bf71f2b2-de80-4728-9189-af8659fbd2b6';
      const tid = 'b73023b1-298a-42a2-bed9-985e0a762054';
      const home = '0f1e2d3c-0000-4000-8000-000000000001.' + tid;
      const legacy = [
        home + '-login.windows.net-accesstoken-' + cid + '-' + tid + '-user.read sites.readwrite.all',
        home + '-login.windows.net-refreshtoken-' + cid + '--',
        home + '-login.windows.net-idtoken-' + cid + '-' + tid + '-',
        home + '-login.windows.net-' + tid,                       // account entry: no client ID
        'msal.account.keys',
        'msal.token.keys.' + cid,
        'msal.' + cid + '.active-account',
        'server-telemetry-' + cid,
        'MSAL.' + cid.toUpperCase() + '.ACTIVE-ACCOUNT',         // case-insensitive
      ];
      const newton = ['newton_theme', 'newton_density', 'newton_mobile', 'userName', 'benchSyncLast', 'newton_force_desktop', ''];
      _assertEqual(legacy.map(k => isLegacyMsalStorageKey(k, cid, tid)), legacy.map(() => true), 'v2 token, account and index keys');
      _assertEqual(newton.map(k => isLegacyMsalStorageKey(k, cid, tid)), newton.map(() => false), 'Newton keys survive');
      _assertEqual(isLegacyMsalStorageKey(null, cid, tid), false, 'null key');
      _assertEqual(isLegacyMsalStorageKey('anything', '', ''), false, 'blank ids never match everything');
    },
  },
  {
    name: 'N-290 shouldAutoSignIn — true only with no account, not tried, not signed out, no response in URL',
    fn: function () {
      const flags = ['hasAccount', 'triedThisTab', 'signedOut', 'authResponseInUrl'];
      const trues = [];
      for (let n = 0; n < 16; n++) {
        const args = {};
        flags.forEach((f, i) => { args[f] = !!(n & (1 << i)); });
        if (shouldAutoSignIn(args)) trues.push(n);
      }
      _assertEqual(trues, [0], 'all 16 combinations: only the all-false one redirects');
      _assertEqual(shouldAutoSignIn({}), true, 'missing flags read as false');
      _assertEqual(shouldAutoSignIn(), true, 'no argument');
    },
  },
  // ── N-374: deep links survive a fresh sign-in ──
  {
    name: 'N-374 safeReturnTarget — keeps a same-site page + query + hash; rejects schemes, //, mobile/redirect pages, Microsoft responses, junk',
    fn: function () {
      const keep = {
        'reporting.html#projects?action=project&id=5': 'reporting.html#projects?action=project&id=5',
        'people.html': 'people.html',
        '/newton/sales.html#forecast': 'sales.html#forecast',
        'reporting.html?x=1#roles': 'reporting.html?x=1#roles',
        'index.html#a': 'index.html#a',
        '  reporting.html#roles  ': 'reporting.html#roles',
      };
      Object.keys(keep).forEach(k => _assertEqual(safeReturnTarget(k), keep[k], 'keeps ' + JSON.stringify(k)));
      const bad = ['', '/', '/newton/', 'index.html', 'mobile.html', 'mobile.html#x', 'redirect.html', 'https://evil.example/x.html',
        '//evil.example/x.html', 'javascript:alert(1)', 'reporting.html#code=abc', 'reporting.html?error=x', 'reporting.html#a&state=1',
        '../x.html', 'reporting.html\\x', 'reporting.html#\u0007', 'notes.txt', 'a b.html', 'reporting.html#' + 'x'.repeat(600)];
      bad.forEach(k => _assertEqual(safeReturnTarget(k), null, 'rejects ' + JSON.stringify(k.slice(0, 40))));
      [null, undefined, 5, {}, ['reporting.html']].forEach(k => _assertEqual(safeReturnTarget(k), null, 'non-string ' + String(k)));
      // Control: a legitimate deep link containing 'id=' / 'action=' is not mistaken for a Microsoft response.
      _assertEqual(safeReturnTarget('reporting.html#roles?action=edit&id=9') !== null, true, 'action= / id= are fine');
    },
  },
  {
    name: 'N-374 sameReturnPage — page name against location.pathname; a trailing slash is index.html',
    fn: function () {
      _assertEqual(sameReturnPage('reporting.html#x', '/newton/reporting.html'), true, 'same page');
      _assertEqual(sameReturnPage('reporting.html#x', '/newton/people.html'), false, 'different page');
      _assertEqual(sameReturnPage('index.html#x', '/newton/'), true, 'site root is index.html');
      _assertEqual(sameReturnPage('reporting.html', '/newton/'), false, 'root vs reporting');
      _assertEqual(sameReturnPage('people.html?a=1#b', '/people.html'), true, 'query and hash ignored');
    },
  },
  {
    name: 'N-374 wiring — auth.js saves the return target before both loginRedirect calls and restores it; app.js guards the Home redirect',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const auth = _vendorStripJsComments(ALL_SOURCES['auth.js']).join('\n');
      const calls = auth.split('msalInstance.loginRedirect(').length - 1;
      const saved = auth.split('_authReturnSave();').length - 1;
      _assertEqual(calls, 2, 'auth.js has exactly the two loginRedirect call sites');
      _assertEqual(saved, 2, 'each is preceded by _authReturnSave()');
      _assertEqual(/_authReturnSave\(\);\s*\n\s*try \{\s*\n\s*await msalInstance\.loginRedirect\(/.test(auth), true, 'automatic redirect saves first');
      _assertEqual(/_authReturnSave\(\);\s*\n\s*await msalInstance\.loginRedirect\(/.test(auth), true, 'Sign-in button saves first');
      _assertEqual(auth.indexOf('_authReturnRestore()') !== -1 && /_AUTH_RESPONSE_IN_HASH\.test\(window\.location\.hash\) && _authReturnRestore\(\)/.test(auth), true, 'restore runs once an account exists and no response is in the URL');
      _assertEqual(_vendorStripJsComments(ALL_SOURCES['app.js']).join('\n').indexOf('if (freshLogin && !window.location.hash)') !== -1, true, 'app.js does not send a restored #link Home');
    },
  },
  // ── N-282 (SEC-2): no authorisation input is forgeable from storage ──
  {
    name: 'N-282 persistentLists — never contains an identity/access list (works under Node, unlike _ssEnabled)',
    fn: function () {
      ['UserAssignments', 'LeadershipAccess'].forEach(function (l) {
        _assertEqual(CONFIG.CACHE.persistentLists.includes(l), false, l + ' must never be tier-2 cached');
      });
    },
  },
  {
    name: 'N-282 CONFIG.PRIVILEGED_ROLES — exactly admin and leadership, both known roles',
    fn: function () {
      _assertEqual([...CONFIG.PRIVILEGED_ROLES].sort(), ['admin', 'leadership'], 'privileged set');
      CONFIG.PRIVILEGED_ROLES.forEach(function (r) {
        _assertEqual(CONFIG.ROLE_PRECEDENCE.includes(r), true, r + ' is in ROLE_PRECEDENCE');
      });
    },
  },
  {
    name: 'N-282 isPrivilegedRole — true for admin and leadership only',
    fn: function () {
      _assertEqual(isPrivilegedRole('admin'), true, 'admin');
      _assertEqual(isPrivilegedRole('leadership'), true, 'leadership');
      ['delivery_manager', 'talent_partner', 'viewer', '', null, undefined, 'Admin', 'ADMIN', ['admin']].forEach(function (r) {
        _assertEqual(isPrivilegedRole(r), false, String(r));
      });
    },
  },
  {
    name: 'N-282 ghost gate fails closed — no ghost and setGhostUser refuses until a real admin is verified',
    fn: function () {
      try {
        _setGhostRealAdmin(false);
        _assertEqual(getGhostUser(), null, 'no ghost while unverified');
        _assertEqual(getGhostLabel(), null, 'no label while unverified');
        _assertEqual(setGhostUser('x@y.com', 'X'), false, 'setGhostUser refuses');
        // Only a strict boolean true opens the gate.
        ['true', 1, {}, [], null, undefined].forEach(function (v) {
          _setGhostRealAdmin(v);
          _assertEqual(setGhostUser('x@y.com', 'X'), false, JSON.stringify(v) + ' must not open the gate');
        });
      } finally {
        _setGhostRealAdmin(false);
      }
    },
  },
  {
    name: 'N-370 no js/ file defines or calls hasDMGrant / _dmGrantsMem (leadership DM grants retired)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('no source map in the browser harness — run tests/run.js');
      const hits = Object.keys(ALL_SOURCES).filter(function (f) {
        return /\bhasDMGrant\b|\b_dmGrantsMem\b/.test(ALL_SOURCES[f]);
      });
      _assertEqual(hits, [], 'files still naming the retired grant symbols');
    },
  },
  {
    name: 'N-370 canEditProjectRows is role-only — admin and delivery_manager, no grant term',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('no source map in the browser harness — run tests/run.js');
      // pages.js is not loaded into the test sandbox (pages-model.js is), so pin the source text.
      _assertEqual(/function canEditProjectRows\(role\) \{\s*return \["admin","delivery_manager"\]\.includes\(role\);\s*\}/.test(ALL_SOURCES['pages.js']), true, 'canEditProjectRows is admin / delivery_manager only');
    },
  },
  {
    name: 'N-282 / N-296 no source reads identity from localStorage or keeps DM grants or a role in storage',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('no source map in the browser harness — run tests/run.js');
      _assertEqual(/getItem\(\s*['"]userEmail['"]/.test(ALL_SOURCES['auth.js']), false, 'auth.js must not read userEmail');
      Object.keys(ALL_SOURCES).forEach(function (f) {
        _assertEqual(/setItem\(\s*['"]userEmail['"]/.test(ALL_SOURCES[f]), false, f + ' must not write userEmail');
        _assertEqual(/(?:get|set)Item\([^)]*newton_dm_grants_/.test(ALL_SOURCES[f]), false, f + ' must not keep DM grants in storage');
        _assertEqual(/(?:get|set)Item\([^)]*newton_role_/.test(ALL_SOURCES[f]), false, f + ' must not read or write a stored role (N-296)');
      });
    },
  },
  {
    name: 'N-281 no hardcoded admin list, auto-registration, LastLogin or sync role helper left in js/',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const banned = [/\bADMIN_USERS\b/, /\bensureUserRegistered\b/, /\bLastLogin\b/, /\bgetUserRole\s*\(/];
      const hits = [];
      Object.keys(ALL_SOURCES).forEach(f => banned.forEach(re => {
        if (re.test(ALL_SOURCES[f])) hits.push(f + ' ' + re);
      }));
      _assertEqual(hits, [], 'banned identifiers in js/');
    },
  },
  {
    name: 'No unescaped SharePoint text in HTML templates in js/ (N-283 — S-8 guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const found = lintEscaping(ALL_SOURCES);
      _assertEqual(
        found.map(v => `${v.file}:${v.line} \${${v.expr}}`),
        [],
        'naked ${x.Field} in an HTML template without an esc* wrapper (wrap it, or see tests/lint-escaping.js for the opt-out)'
      );
    },
  },
  {
    name: 'odataStr doubles apostrophes and nothing else (N-284 — S-14)',
    fn: function () {
      _assertEqual(odataStr("o'brien@x.com"), "o''brien@x.com", 'apostrophe doubled');
      _assertEqual(odataStr("D'Arcy O'Neil"), "D''Arcy O''Neil", 'every apostrophe');
      _assertEqual(odataStr('plain'), 'plain', 'unchanged');
      _assertEqual(odataStr(null), '', 'null');
      _assertEqual(odataStr(undefined), '', 'undefined');
      _assertEqual(odataStr(5), '5', 'number');
      _assertEqual(odataStr('a&b+c%d'), 'a&b+c%d', 'URL characters are left to getItems() encoding');
    },
  },
  {
    name: 'validateUpload — extension, MIME, size (N-284 — S-16)',
    fn: function () {
      const MB = 1024 * 1024;
      const f = (name, size, type) => ({ name, size, type });
      const ok  = (file, kind) => validateUpload(file, kind);
      _assertEqual(ok(f('a.png', 1000, 'image/png'), 'PHOTO').ok, true, 'png photo');
      _assertEqual(ok(f('A.JPG', 1000, 'image/jpeg'), 'PHOTO').ext, 'jpg', 'mixed-case ext, allowlist-derived');
      _assertEqual(ok(f('a.jpeg', 1000, 'image/jpeg'), 'PHOTO').ext, 'jpg', 'jpeg normalised to jpg');
      _assertEqual(ok(f('a.png', 2 * MB + 1, 'image/png'), 'PHOTO').ok, false, 'photo 1 byte over 2 MB');
      _assertEqual(ok(f('a.png', 2 * MB, 'image/png'), 'PHOTO').ok, true, 'photo exactly 2 MB');
      _assertEqual(ok(f('a.svg', 100, 'image/svg+xml'), 'PHOTO').ok, false, 'svg photo');
      _assertEqual(ok(f('a.svg', 100, 'image/svg+xml'), 'LOGO').ok, false, 'svg logo');
      _assertEqual(ok(f('a.png', 100, 'image/svg+xml'), 'LOGO').ok, false, 'svg renamed .png (non-blank wrong MIME)');
      _assertEqual(ok(f('x.pdf', 100, 'application/x-msdownload'), 'INVOICE').ok, false, 'exe renamed .pdf');
      _assertEqual(ok(f('x.pdf', 100, ''), 'INVOICE').ok, true, 'blank MIME accepted when extension passes');
      _assertEqual(ok(f('x.pdf', 100, 'image/png'), 'INVOICE').ok, false, 'pdf with a png MIME');
      _assertEqual(ok(f('x.PDF', 100, 'application/pdf'), 'INVOICE').ok, true, 'upper-case .PDF');
      _assertEqual(ok(f('x.pdf', 10 * MB + 1, 'application/pdf'), 'INVOICE').ok, false, 'invoice over 10 MB');
      _assertEqual(ok(f('x.pdf', 0, 'application/pdf'), 'INVOICE').ok, false, '0-byte file');
      _assertEqual(ok(f('noext', 100, ''), 'INVOICE').ok, false, 'no extension');
      _assertEqual(ok(f('m.xls', 100, 'application/vnd.ms-excel'), 'LCI_IMPORT').ok, false, 'legacy .xls');
      _assertEqual(ok(f('m.xlsx', 100, ''), 'LCI_IMPORT').ok, true, 'xlsx, blank MIME');
      _assertEqual(ok(f('l.png', CONFIG.BRIEFING_PACK.CLIENT_LOGO_MAX_BYTES + 1, 'image/png'), 'LOGO').ok, false, 'logo over the existing 150 KB cap');
      _assertEqual(ok(f('l.png', CONFIG.BRIEFING_PACK.CLIENT_LOGO_MAX_BYTES, 'image/png'), 'LOGO').ok, true, 'logo exactly at the cap');
      _assertEqual(ok(null, 'PHOTO').ok, false, 'no file');
      _assertEqual(uploadAcceptAttr('LOGO').includes('svg'), false, 'accept attr has no svg');
      const safe = safeUploadName("../..\\Invoice #12 (final) \u00e9.pdf", 'pdf');
      _assertEqual(/^[A-Za-z0-9._-]+$/.test(safe), true, 'stored name charset: ' + safe);
      _assertEqual(safe.endsWith('.pdf'), true, 'forced extension');
      _assertEqual(safeUploadName('x'.repeat(300) + '.pdf', 'pdf').length <= 64, true, 'length capped');
    },
  },
  {
    name: 'Every string $filter interpolation in js/ goes through odataStr (N-284 — S-14 guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      // Single-line scan: filters in this codebase are single-line template fragments.
      // Comment text is ignored; a line can opt out with `// odata-lint-ok: <reason>` (reason mandatory).
      const found = lintOdataFilters(ALL_SOURCES);
      _assertEqual(found.map(v => v.file + ':' + v.line), [], "eq/ge/… '${x}' without odataStr()");
    },
  },
  {
    name: 'lintOdataFilters flags what it should (N-284 — guard the guard)',
    fn: function () {
      if (typeof lintOdataFilters === 'undefined') _skip('lint-escaping.js not loaded — runs under node tests/run.js.');
      const run = src => lintOdataFilters({ 'fixture.js': src });
      _assertEqual(run("x = `fields/Title eq '${x}'`;").length, 1, 'unwrapped eq');
      _assertEqual(run("x = `fields/D ge '${a.b}' and fields/T eq '${odataStr(y)}'`;").length, 1, 'one of two wrapped');
      _assertEqual(run("x = `fields/Title eq '${odataStr(x)}'`;").length, 0, 'wrapped');
      _assertEqual(run("x = `fields/Id eq ${n}`;").length, 0, 'numeric clause is out of scope');
      _assertEqual(run("// fields/Title eq '${x}'").length, 0, 'comment ignored');
      _assertEqual(run("x = `fields/Title eq '${x}'`; // odata-lint-ok: generated value").length, 0, 'opt-out with a reason');
      _assertEqual(run("x = `fields/Title eq '${x}'`; // odata-lint-ok").length, 1, 'bare opt-out still flagged');
    },
  },
  {
    name: 'lintEscaping flags what it should and passes what it should (N-283 — guard the guard)',
    fn: function () {
      if (typeof lintEscaping === 'undefined') _skip('lint-escaping.js not loaded — runs under node tests/run.js.');
      const BT = String.fromCharCode(96);
      const run = src => lintEscaping({ 'fixture.js': src });
      // (a)–(c) must be flagged
      _assertEqual(run('x = ' + BT + '<td>${r.Notes}</td>' + BT).length, 1, '(a) bare field in a td');
      _assertEqual(run('x = ' + BT + '\n<tr>\n  <td>\n ${r.Notes}\n </td></tr>' + BT).length, 1, '(b) tag and interpolation on different lines');
      _assertEqual(run('x = ' + BT + '<td>${x.Title || \'—\'}</td>' + BT).length, 1, '(c) literal-fallback form');
      // (d)–(g) must pass
      _assertEqual(run('x = ' + BT + '<td>${escHtml(r.Title)}</td>' + BT).length, 0, '(d) escHtml wrapper');
      _assertEqual(
        run('x = ' + BT + '<option>${escHtml(r.Location ? ' + BT + '${r.RoleTitle} (${r.Location})' + BT + ' : r.RoleTitle)}</option>' + BT).length,
        0, '(e) template nested inside an esc call'
      );
      _assertEqual(run('x = ' + BT + '<td>${r.Hires}</td>' + BT).length, 0, '(f) allowlisted numeric field');
      _assertEqual(run('x = ' + BT + '<td>${r.Notes /* esc-lint-ok: fixture */}</td>' + BT).length, 0, '(g) opt-out with a reason');
      // (h) bare opt-out must still be flagged
      _assertEqual(run('x = ' + BT + '<td>${r.Notes /* esc-lint-ok */}</td>' + BT).length, 1, '(h) opt-out without a reason');
      // plain-text template (no tag) is not HTML
      _assertEqual(run('x = ' + BT + 'Remove "${r.Title}"?' + BT).length, 0, 'non-HTML template ignored');
      // an inner template inside an UNescaped interpolation of an HTML template is HTML context
      _assertEqual(
        run('x = ' + BT + '<option>${r.Location ? ' + BT + '${r.RoleTitle} (${r.Location})' + BT + ' : r.RoleTitle}</option>' + BT).length,
        2, 'inner template inherits HTML context (the coe-plan.js:460 shape)'
      );
    },
  },
  {
    name: 'N-285 config — RESTRICTED_LISTS is exactly the Tier 2 lists (+ PeoplePay N-286, PayrollSummaries N-300); mobile Sales is admin + leadership only',
    fn: function () {
      _assertEqual(CONFIG.RESTRICTED_LISTS.slice().sort(),
        ['AnomalyAcks', 'Diagnostics', 'GPInvoices', 'LCILocations', 'PayrollSummaries', 'PeoplePay', 'SalesForecasts', 'SurveyResponses'], 'AC1 the eight names');
      _assertEqual(new Set(CONFIG.RESTRICTED_LISTS).size, CONFIG.RESTRICTED_LISTS.length, 'AC1 no duplicates');
      _assertEqual(CONFIG.MOBILE_MODULE_ROLES.sales, ['admin', 'leadership'], 'AC12 mobile Sales roles');
      _assertEqual(typeof CONFIG.CC_FORECAST_DENIED_TEXT === 'string' && CONFIG.CC_FORECAST_DENIED_TEXT.length > 0, true, 'AC11 denied copy is config');
      // Every restricted list is also a registered list (PeoplePay since N-286).
      CONFIG.RESTRICTED_LISTS.forEach(l =>
        _assertEqual(Object.keys(FIELD_ALIASES).includes(l), true, 'AC1 ' + l + ' is a registered list'));
    },
  },
  {
    name: 'N-285 isRestrictedList / isListAccessDenied — 403 on a restricted list only',
    fn: function () {
      _assertEqual(isListAccessDenied('SalesForecasts', { status: 403 }), true, 'AC2 restricted + 403');
      _assertEqual(isListAccessDenied('SalesForecasts', { status: 500 }), false, 'AC2 restricted + 500 stays an error');
      _assertEqual(isListAccessDenied('SalesForecasts', { status: 401 }), false, 'AC2 restricted + 401 stays an error');
      _assertEqual(isListAccessDenied('Roles', { status: 403 }), false, 'AC2/AC7 unrestricted + 403 stays an error');
      _assertEqual(isListAccessDenied('SalesForecasts', new Error('network down')), false, 'AC2 no status');
      _assertEqual(isListAccessDenied('SalesForecasts', null), false, 'AC2 null error');
      _assertEqual(isListAccessDenied('SalesForecasts', undefined), false, 'AC2 undefined error');
      const cfg = { RESTRICTED_LISTS: ['Roles'] };
      _assertEqual(isRestrictedList('Roles', cfg), true, 'AC2 injected config: in');
      _assertEqual(isRestrictedList('SalesForecasts', cfg), false, 'AC2 injected config: out');
      _assertEqual(isListAccessDenied('Roles', { status: 403 }, cfg), true, 'AC2 injected config drives the verdict');
      _assertEqual(isRestrictedList('Roles', {}), false, 'AC2 missing array is not restricted');
    },
  },
  {
    name: 'N-285 _graphError — status and code survive; message text unchanged from the pre-N-285 builds',
    fn: function () {
      const e = _graphError(403, { error: { code: 'accessDenied', message: 'Access denied' } });
      _assertEqual([e instanceof Error, e.status, e.graphCode, e.message], [true, 403, 'accessDenied', 'Access denied'], 'AC3 full body');
      _assertEqual(_graphError(500, {}).message, 'HTTP 500', 'AC3 empty body falls back to HTTP <status>');
      _assertEqual(_graphError(502, undefined).message, 'HTTP 502', 'AC3 undefined body');
      _assertEqual(_graphError(404, { error: {} }).message, 'HTTP 404', 'AC3 error without a message');
      _assertEqual(_graphError(429, null).status, 429, 'AC3 status kept on a bodiless error');
      _assertEqual(isListAccessDenied('GPInvoices', _graphError(403, {})), true, 'AC3 a built 403 is recognised as a denial');
    },
  },
  {
    name: 'N-285 denial memo — fresh, expiry, cleared by a write (_cacheInvalidate), never a cache entry',
    fn: function () {
      _deniedLists.clear();
      try {
        _assertEqual(wasListDenied('SalesForecasts'), false, 'AC5 nothing recorded');
        _deniedLists.set('SalesForecasts', Date.now());
        _assertEqual(wasListDenied('SalesForecasts'), true, 'AC5 fresh entry');
        _assertEqual(wasListDenied('GPInvoices'), false, 'AC5 per list, not global');
        _deniedLists.set('SalesForecasts', Date.now() - _CACHE_TTL_MS - 1);
        _assertEqual(wasListDenied('SalesForecasts'), false, 'AC5 expired entry is not a denial');
        _assertEqual(_deniedLists.has('SalesForecasts'), false, 'AC5 expired entry is dropped');
        _deniedLists.set('SalesForecasts', Date.now());
        _cacheInvalidate('SalesForecasts');
        _assertEqual(wasListDenied('SalesForecasts'), false, 'AC5 a write to the list clears the memo');
        _assertEqual(isDenialFresh(1000, 1000 + 30000, 30000), true, 'isDenialFresh boundary is inclusive');
        _assertEqual(isDenialFresh(1000, 1000 + 30001, 30000), false, 'isDenialFresh past the window');
        _assertEqual(isDenialFresh(undefined, 5, 30000), false, 'isDenialFresh needs a number');
        // The memo is its own store: it never touches the read cache (AC6).
        _deniedLists.set('SalesForecasts', Date.now());
        _assertEqual([..._apiCache.keys()].some(k => k.indexOf('SalesForecasts|') === 0), false, 'AC6 no _apiCache entry for a denied list');
      } finally {
        _deniedLists.clear();
      }
    },
  },
  {
    name: 'N-286 config — Salary only in PeoplePay; PeoplePay registered, restricted, tier 1 only',
    fn: function () {
      _assertEqual(CONFIG.LIST_FIELDS.People.includes('Salary'), false, 'AC1 People projection has no Salary');
      _assertEqual(CONFIG.LIST_FIELDS.PeoplePay, ['Title', 'PersonID', 'Salary'], 'AC2 PeoplePay projection');
      _assertEqual(Object.keys(FIELD_ALIASES).includes('PeoplePay'), true, 'AC2 PeoplePay registered');
      _assertEqual(Object.keys(FIELD_ALIASES.PeoplePay), [], 'AC2 PeoplePay alias is {}');
      _assertEqual(CONFIG.RESTRICTED_LISTS.includes('PeoplePay'), true, 'AC2 PeoplePay restricted');
      _assertEqual(CONFIG.CACHE.persistentLists.includes('PeoplePay'), false, 'AC2 PeoplePay never tier-2 cached');
      _assertEqual(CONFIG.DELTA.enrolledLists.includes('PeoplePay'), false, 'AC2 PeoplePay not delta-enrolled');
      _assertEqual(typeof CONFIG.PEOPLE_PAY_DENIED_TEXT === 'string' && CONFIG.PEOPLE_PAY_DENIED_TEXT.length > 0, true, 'AC10 denied copy is config');
    },
  },
  {
    name: 'N-300 config — PayrollSummaries registered, restricted, tier 1 only; payroll copy is config',
    fn: function () {
      _assertEqual(CONFIG.LIST_FIELDS.PayrollSummaries, ['Title', 'Month', 'Year', 'Joiners', 'Leavers', 'BonusData'], 'AC2 PayrollSummaries projection');
      _assertEqual(Object.keys(FIELD_ALIASES).includes('PayrollSummaries'), true, 'AC2 PayrollSummaries registered');
      _assertEqual(Object.keys(FIELD_ALIASES.PayrollSummaries), [], 'AC2 PayrollSummaries alias is {}');
      _assertEqual(CONFIG.RESTRICTED_LISTS.includes('PayrollSummaries'), true, 'AC2 PayrollSummaries restricted');
      _assertEqual(CONFIG.CACHE.persistentLists.includes('PayrollSummaries'), false, 'AC2 never tier-2 cached');
      _assertEqual(CONFIG.DELTA.enrolledLists.includes('PayrollSummaries'), false, 'AC2 not delta-enrolled');
      _assertEqual(typeof CONFIG.PAYROLL_PAY_DENIED_TEXT === 'string' && CONFIG.PAYROLL_PAY_DENIED_TEXT.length > 0, true, 'AC9 denied copy is config');
      _assertEqual(CONFIG.PAYROLL_ALREADY_SENT_TEXT.includes('{period}'), true, 'AC6 already-sent copy has {period}');
    },
  },
  {
    name: 'N-300 buildPayrollSummaryFields — same key, columns and JSON shapes the flow already reads',
    fn: function () {
      const joiners = [{ name: 'A', startDate: '2026-10-01', salary: 42000 }];
      const leavers = [{ name: 'B', endDate: '2026-10-31' }];
      const f = buildPayrollSummaryFields({ month: 10, year: 2026, joiners, leavers, bonus: null });
      _assertEqual(Object.keys(f), ['Title', 'Month', 'Year', 'Joiners', 'Leavers', 'BonusData'], 'columns');
      _assertEqual(f.Title, 'payrollsummary-2026-10', 'dedupe key (same string as the old TriggerKey)');
      _assertEqual(f.Month, 'October', 'month name');
      _assertEqual(f.Year, '2026', 'year is text');
      _assertEqual(JSON.parse(f.Joiners), joiners, 'joiners round-trip, salary intact');
      _assertEqual(JSON.parse(f.Leavers), leavers, 'leavers round-trip');
      _assertEqual(f.BonusData, null, 'no bonus → null');
      const bonus = [{ name: 'A', amount: 500 }];
      _assertEqual(JSON.parse(buildPayrollSummaryFields({ month: 1, year: 2027, joiners: [], leavers: [], bonus }).BonusData), bonus, 'bonus round-trips');
      _assertEqual(buildPayrollSummaryFields({ month: 1, year: 2027, joiners: [], leavers: [], bonus }).Month, 'January', 'January boundary');
    },
  },
  {
    name: 'N-286 attachSalaries — joins PeoplePay by PersonID, never mutates, never trusts People.Salary',
    fn: function () {
      const people = [
        { id: '1', EmployeeName: 'A', Location: 'UK', Salary: 99999 },   // stale People.Salary
        { id: '2', EmployeeName: 'B', Location: 'UK' },
        { id: '3', EmployeeName: 'C', Location: 'Spain' },
      ];
      const pay = [
        { id: '20', PersonID: 1, Salary: 50000 },
        { id: '11', PersonID: '2', Salary: 40000 },
        { id: '30', PersonID: 2, Salary: 1 },                            // duplicate, higher id
      ];
      const snapshot = JSON.stringify(people);
      const out = attachSalaries(people, pay);
      _assertEqual(out.map(p => p.Salary), [50000, 40000, undefined], 'AC4 joined by id; lowest PeoplePay id wins; missing → undefined');
      _assertEqual(out[0].EmployeeName, 'A', 'other fields pass through');
      _assertEqual(out[0] === people[0], false, 'new objects');
      _assertEqual(JSON.stringify(people), snapshot, 'inputs not mutated');
      _assertEqual(attachSalaries([], pay), [], 'empty people');
      _assertEqual(attachSalaries(people, []).every(p => p.Salary === undefined), true, 'denied PeoplePay ([]) → no salaries, People.Salary discarded');
      _assertEqual(attachSalaries([{ id: '5' }], [{ id: '1', PersonID: 5, Salary: '' }])[0].Salary, undefined, 'blank PeoplePay value → undefined');
    },
  },
  // ---- N-292 (SEC-12): in-page security headers --------------------------
  {
    name: 'every page carries the canonical CSP + referrer meta ahead of any resource (N-292 — SEC-12 guard)',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const good = '<head>\n<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy" content="' + CSP_CANONICAL + '">\n<meta name="referrer" content="no-referrer">\n<script src="js/a.js"></script>\n</head>';
      // Positive controls: the lint must catch each failure shape, or the clean result below proves nothing.
      _assertEqual(lintCspMeta({ 'g.html': good }, CSP_CANONICAL, CSP_REFERRER), [], 'control: a correct page is clean');
      _assertEqual(lintCspMeta({ 'x.html': good.replace(CSP_CANONICAL, "default-src *") }, CSP_CANONICAL, CSP_REFERRER).length, 1, 'control: different policy flagged');
      _assertEqual(lintCspMeta({ 'x.html': good.replace(/<meta http-equiv[^>]*>\n/, '') }, CSP_CANONICAL, CSP_REFERRER).length, 1, 'control: missing CSP flagged');
      _assertEqual(lintCspMeta({ 'x.html': good.replace(/<meta name="referrer"[^>]*>\n/, '') }, CSP_CANONICAL, CSP_REFERRER).length, 1, 'control: missing referrer flagged');
      _assertEqual(lintCspMeta({ 'x.html': good.replace('<meta charset="UTF-8">\n', '<script src="js/early.js"></script>\n<meta charset="UTF-8">\n') }, CSP_CANONICAL, CSP_REFERRER).length >= 1, true, 'control: a script before the CSP flagged');
      _assertEqual(lintCspMeta({ 'x.html': good + good }, CSP_CANONICAL, CSP_REFERRER).length >= 2, true, 'control: duplicate metas flagged');
      _assertEqual(lintCspMeta({ 'x.html': good.replace('<meta charset="UTF-8">\n', '').replace('<script', '<meta charset="UTF-8">\n<script') }, CSP_CANONICAL, CSP_REFERRER).length >= 1, true, 'control: charset after the CSP flagged');
      _assertEqual(lintCspMeta(ALL_HTML, CSP_CANONICAL, CSP_REFERRER), [], 'root *.html CSP + referrer metas');
    },
  },
  {
    name: 'canonical CSP: required directives, exact script/connect sources, no eval / wildcard / http (N-292 — SEC-12 guard)',
    fn: function () {
      if (typeof lintCspPolicy === 'undefined') _skip('lint-csp.js not loaded — runs under node tests/run.js.');
      _assertEqual(lintCspPolicy(CSP_CANONICAL), [], 'CSP_CANONICAL shape');
      // Positive controls.
      _assertEqual(lintCspPolicy(CSP_CANONICAL + " 'unsafe-eval'").length >= 1, true, "control: 'unsafe-eval' flagged");
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("script-src 'self'", "script-src 'self' https://cdn.example.com")).length, 1, 'control: extra script host flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")).length, 1, "control (N-303): 'unsafe-inline' in script-src flagged");
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("script-src 'self'", "script-src 'self' 'sha256-AAAA'")).length, 1, 'control (N-303): a script hash flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("script-src 'self'", "script-src 'self' 'nonce-abc'")).length, 1, 'control (N-303): a script nonce flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("script-src 'self'", "script-src 'self' 'strict-dynamic'")).length, 1, "control (N-303): 'strict-dynamic' flagged");
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("img-src 'self'", "img-src *")).length >= 1, true, 'control: wildcard flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("connect-src 'self' https://graph.microsoft.com", "connect-src 'self' http://graph.microsoft.com")).length >= 1, true, 'control: plain http flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("object-src 'none'; ", '')).length, 1, 'control: missing directive flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("frame-src 'self' https://login.microsoftonline.com", "frame-src https:")).length >= 1, true, 'control: bare https: flagged');
    },
  },
  {
    name: 'no root page has an inline <script>; the moved page scripts load after actions.js (N-303 — SEC-12b step 3)',
    fn: function () {
      if (typeof lintNoInlineScripts === 'undefined') _skip('lint-csp.js not loaded — runs under node tests/run.js.');
      // Positive controls: each failure shape is caught, or the clean result below proves nothing.
      _assertEqual(lintNoInlineScripts({ 'a.html': '<script src="js/x.js" defer></script>\n<script src=\'js/y.js\'></script>' }), [], 'control: script tags with src are clean');
      _assertEqual(lintNoInlineScripts({ 'a.html': '<p>\n<script>\nx();\n</script>' }), ["a.html:2: inline <script> - move it to js/ (script-src has no 'unsafe-inline')"], 'control: an inline block is flagged with its line');
      _assertEqual(lintNoInlineScripts({ 'a.html': '<script type="application/json">{}</script>' }).length, 1, 'control: a non-JS inline block is flagged too');
      _assertEqual(lintNoInlineScripts({ 'a.html': '<script></script>' }).length, 1, 'control: an empty inline block is flagged');
      _assertEqual(lintNoInlineScripts({ 'a.html': '<!-- <script>x()</script> -->\n<script src="js/x.js"></script>' }), [], 'control: a commented-out block is ignored');
      _assertEqual(lintNoInlineScripts({ 'a.html': '<script data-src="x">y()</script>' }).length, 1, 'control: data-src is not src');
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintNoInlineScripts(ALL_HTML), [], 'root *.html: no inline <script>');
      // Mutation: put one block back into a real page and the lint must name it.
      const mutated = Object.assign({}, ALL_HTML, { 'sales.html': ALL_HTML['sales.html'].replace('</body>', '<script>\nx();\n</script>\n</body>') });
      const back = lintNoInlineScripts(mutated);
      _assertEqual(back.length === 1 && /^sales\.html:\d+: inline <script>/.test(back[0]), true, 'mutation: an inline block added to sales.html is flagged: ' + back);
      _assertEqual(Object.keys(INLINE_HANDLER_BASELINE), [], 'the inline-handler baseline stays empty');
      // The moved scripts load after actions.js and are deferred, except the mobile flag.
      const srcsOf = html => { const out = []; html.replace(/<script\b([^>]*)>/gi, (m, a) => { const s = /\bsrc\s*=\s*"([^"]*)"/i.exec(a); if (s) out.push({ src: s[1], defer: /\bdefer\b/.test(a) }); return m; }); return out; };
      [['index.html', 'js/home.js'], ['index.html', 'js/seasonal-fx.js'], ['admin.html', 'js/admin-page.js'], ['Readme.html', 'js/readme-page.js'], ['mobile.html', 'js/sw-register.js']].forEach(function (pair) {
        const list = srcsOf(ALL_HTML[pair[0]]);
        const at = list.findIndex(s => s.src === pair[1]);
        const act = list.findIndex(s => s.src === 'js/actions.js');
        _assertEqual(act >= 0 && at > act, true, pair[0] + ': ' + pair[1] + ' loads after js/actions.js');
        _assertEqual(at >= 0 && list[at].defer, true, pair[0] + ': ' + pair[1] + ' is deferred');
      });
      const flag = srcsOf(ALL_HTML['mobile.html']).find(s => s.src === 'js/mobile-flag.js');
      _assertEqual(!!flag && !flag.defer, true, 'mobile.html: js/mobile-flag.js is present and NOT deferred (it must run before the deferred scripts)');
    },
  },
  {
    name: 'CSP origins match CONFIG.SP_SITE_URL, CONFIG.SP_MY_SITE_ORIGIN, GRAPH and CONFIG.AUTHORITY (N-292, N-259 — single source of truth)',
    fn: function () {
      if (typeof lintCspOrigins === 'undefined') _skip('lint-csp.js not loaded — runs under node tests/run.js.');
      const cfg = { spSiteUrl: CONFIG.SP_SITE_URL, spMySiteOrigin: CONFIG.SP_MY_SITE_ORIGIN, graph: GRAPH, authority: CONFIG.AUTHORITY };
      _assertEqual(lintCspOrigins(CSP_CANONICAL, cfg), [], 'CSP origins vs config');
      // Positive control: a changed host in config must be caught.
      // N-259: the SharePoint host is now in img-src AND connect-src, so a change is flagged twice.
      _assertEqual(lintCspOrigins(CSP_CANONICAL, Object.assign({}, cfg, { spSiteUrl: 'https://other.sharepoint.com/sites/x' })).length, 2, 'control: SharePoint host change flagged (img-src + connect-src)');
      _assertEqual(lintCspOrigins(CSP_CANONICAL, Object.assign({}, cfg, { spMySiteOrigin: 'https://other-my.sharepoint.com' })).length, 1, 'control (N-259): OneDrive host change flagged');
      _assertEqual(lintCspOrigins(CSP_CANONICAL, Object.assign({}, cfg, { graph: 'https://graph.microsoft.us/v1.0' })).length, 1, 'control: Graph host change flagged');
    },
  },
  {
    name: 'frame-guard.js is the 2nd script on exactly the app pages (N-292 — SEC-12 guard)',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const app = '<script src="js/diag-buffer.js"></script><script src="js/frame-guard.js"></script>';
      _assertEqual(lintFrameGuardWiring({ 'a.html': app }, ['a.html'], []), [], 'control: correct app page clean');
      _assertEqual(lintFrameGuardWiring({ 'a.html': '<script src="js/diag-buffer.js"></script>' }, ['a.html'], []).length, 1, 'control: missing guard flagged');
      _assertEqual(lintFrameGuardWiring({ 'a.html': '<script src="js/frame-guard.js"></script><script src="js/diag-buffer.js"></script>' }, ['a.html'], []).length, 2, 'control: wrong order flagged');
      _assertEqual(lintFrameGuardWiring({ 's.html': app }, [], ['s.html']).length, 1, 'control: guard on a static page flagged');
      _assertEqual(lintFrameGuardWiring({ 'new.html': '' }, [], []).length, 1, 'control: unclassified new page flagged');
      _assertEqual(lintFrameGuardWiring(ALL_HTML, CSP_APP_PAGES, CSP_STATIC_PAGES), [], 'frame-guard wiring');
    },
  },
  {
    name: 'frame-guard.js behaviour — hides and breaks out only when framed cross-origin (N-292 — SEC-12)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || !ALL_SOURCES['frame-guard.js']) {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const src = ALL_SOURCES['frame-guard.js'];
      function stub(topObj) {
        const win = { location: { origin: 'https://a.example', href: 'https://a.example/newton/reporting.html' } };
        win.self = win;
        win.top = topObj === undefined ? win : topObj;
        const doc = { documentElement: { style: {} } };
        return { win: win, doc: doc };
      }
      function hostile(readable, throwOnAssign) {
        const t = { _nav: null };
        Object.defineProperty(t, 'location', {
          get: function () { if (!readable) throw new Error('SecurityError'); return { origin: readable }; },
          set: function (v) { if (throwOnAssign) throw new Error('SecurityError'); t._nav = v; },
        });
        return t;
      }
      // not framed
      let s = stub(); runFrameGuard(src, s.win, s.doc);
      _assertEqual(s.doc.documentElement.style.display, undefined, 'not framed: page untouched');
      // framed by a same-origin top (MSAL hidden iframe inside a Newton page)
      let top = { location: { origin: 'https://a.example' } };
      s = stub(top); runFrameGuard(src, s.win, s.doc);
      _assertEqual(s.doc.documentElement.style.display, undefined, 'same-origin top: page untouched');
      _assertEqual(top.location.origin, 'https://a.example', 'same-origin top: not navigated');
      // framed by a cross-origin top whose location cannot be read (the normal hostile case)
      top = hostile(null, false);
      s = stub(top); runFrameGuard(src, s.win, s.doc);
      _assertEqual(s.doc.documentElement.style.display, 'none', 'cross-origin top: page hidden');
      _assertEqual(top._nav, 'https://a.example/newton/reporting.html', 'cross-origin top: top navigated to Newton');
      // framed by a readable but different origin (control: detection is by origin, not by throwing)
      top = hostile('https://evil.example', false);
      s = stub(top); runFrameGuard(src, s.win, s.doc);
      _assertEqual(s.doc.documentElement.style.display, 'none', 'different readable origin: page hidden');
      _assertEqual(top._nav, 'https://a.example/newton/reporting.html', 'different readable origin: top navigated');
      // sandboxed frame: break-out throws - the page must STAY hidden and nothing may escape
      top = hostile(null, true);
      s = stub(top); runFrameGuard(src, s.win, s.doc);
      _assertEqual(s.doc.documentElement.style.display, 'none', 'break-out blocked: page stays hidden');
    },
  },
  {
    name: 'no eval / new Function / string timers in first-party js/ (N-292 — the CSP has no unsafe-eval)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(
        lintCodeExecution({ 'x.js': 'a();\neval("1");\n// eval("2")\nb = new Function("return 1");\nsetTimeout("go()", 5);\nsetTimeout(go, 5);\nx.isFunction(y);' }).map(v => v.line),
        [2, 4, 5],
        'control: eval / new Function / string timer flagged; comments, function timers and isFunction( are not'
      );
      _assertEqual(lintCodeExecution(ALL_SOURCES).map(v => `${v.file}:${v.line}  ${v.text}`), [], 'dynamic code execution in js/');
    },
  },
  {
    name: 'no new external https:// host in first-party js/ without a CSP decision (N-292 — SEC-12 guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(
        lintJsHosts({ 'x.js': "a = 'https://cdn.example.com/lib.js';\n// https://commented.example.com\nb = 'https://graph.microsoft.com/v1.0';" }, CSP_JS_HOST_ALLOW).map(v => v.host),
        ['cdn.example.com'],
        'control: unknown host flagged; allow-listed host and comments are not'
      );
      _assertEqual(
        lintJsHosts(ALL_SOURCES, CSP_JS_HOST_ALLOW).map(v => `${v.file}:${v.line}  ${v.host}`),
        [],
        'external hosts in js/ (decide whether the CSP needs the origin, then add it to the policy AND CSP_JS_HOST_ALLOW)'
      );
    },
  },
  {
    name: 'Secret-scan workflow is full-history, redacted, licence-free; /v2/ stays retired (N-293 — SEC-13)',
    fn: function () {
      if (typeof REPO_FILES === 'undefined') {
        _skip('Repo file scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      // Returns the list of problems with a workflow's text. [] = fine.
      const problems = (y) => {
        const p = [];
        ['fetch-depth: 0', '--redact', 'sha256sum -c', 'gitleaks git', '--exit-code 1', 'GITLEAKS_VERSION:']
          .forEach(t => { if (y.indexOf(t) === -1) p.push('missing ' + t); });
        if (!/permissions:\s*\n\s*contents:\s*read/.test(y)) p.push('permissions must be contents: read');
        if (!/^\s*push:/m.test(y) || !/^\s*workflow_dispatch:/m.test(y)) p.push('triggers must be push + workflow_dispatch');
        ['gitleaks-action', 'upload-artifact', 'GITLEAKS_LICENSE'].forEach(t => { if (y.indexOf(t) !== -1) p.push('must not contain ' + t); });
        if (/^\s*schedule\s*:/m.test(y)) p.push('must not have a schedule');
        return p;
      };
      // Control: the check really detects each class of defect.
      _assertEqual(problems('').length > 0, true, 'control: empty workflow is flagged');
      _assertEqual(problems('uses: gitleaks/gitleaks-action@v2\nfetch-depth: 0').some(m => /gitleaks-action/.test(m)), true,
        'control: the licensed action is flagged');
      _assertEqual(problems(REPO_FILES.gitleaksWorkflow), [], '.github/workflows/gitleaks.yml');
      _assertEqual(REPO_FILES.staticV2Exists, false, '.github/workflows/static-v2.yml must stay deleted (/v2/ retired 7 Oct 2026)');
      _assertEqual(/Repository and publishing/.test(REPO_FILES.readme), true, 'README.md has the "Repository and publishing" section');
    },
  }
);

// ── N-367 / N-368 (PT-7, PT-8): access scope helpers + cutover ───────
ASSERTIONS.push(
  {
    name: 'N-368 accessScopeMode — two modes, anything else (incl. retired shadow) is legacy; CONFIG ships legacy or assignments',
    fn: function () {
      const m = mode => accessScopeMode({ ACCESS_SCOPE: { mode } });
      _assertEqual([m('legacy'), m('assignments')], ['legacy', 'assignments'], 'valid modes');
      _assertEqual([m('shadow'), m('Assignments'), m(''), m(undefined), accessScopeMode({}), accessScopeMode(null)],
        ['legacy', 'legacy', 'legacy', 'legacy', 'legacy', 'legacy'], 'retired / unknown / missing → legacy');
      // Not pinned to 'assignments': setting 'legacy' is the live rollback and must still deploy.
      _assertEqual(['legacy', 'assignments'].includes(CONFIG.ACCESS_SCOPE.mode), true, 'CONFIG.ACCESS_SCOPE.mode is legacy or assignments');
      _assertEqual(CONFIG.ACCESS_SCOPE.shadowErrorType, 'scope-shadow', 'retired shadow ErrorType kept for the historic rows (S-6)');
      _assertEqual(Object.prototype.hasOwnProperty.call(CONFIG.ACCESS_SCOPE, 'shadowStoreKey'), false, 'shadowStoreKey retired');
      _assertEqual(CONFIG.PROJECT_TEAM.WRITE_GRACE_DAYS, 14, 'D-2 grace days');
    },
  },
  {
    name: 'N-367 projectIdsFromAssignments — non-forecast rows with a real ProjectID, any dates, de-duped strings',
    fn: function () {
      const rows = [
        { ProjectID: 12, StartDate: '2024-01-01T12:00:00Z', EndDate: '2024-06-30T12:00:00Z' },  // ended long ago: still counts
        { ProjectID: 15 },
        { ProjectID: '12' },                    // duplicate
        { ProjectID: 22, IsForecast: true },    // forecast grants nothing
        { ProjectID: 23, IsForecast: 'Yes' },
        { ProjectID: 24, IsForecast: 1 },
        { ProjectID: null, Customer: 'Unassigned' },  // bench
        { ProjectID: 0 }, { ProjectID: '' }, { ProjectID: 'abc' }, { ProjectID: 3.5 }, { ProjectID: -4 },
        { ProjectID: 30, IsForecast: false },
      ];
      _assertEqual(projectIdsFromAssignments(rows), ['12', '15', '30'], 'scope');
      _assertEqual([projectIdsFromAssignments([]), projectIdsFromAssignments(null)], [[], []], 'empty / null');
    },
  },
  {
    name: 'N-367 defaultProjectIdFromAssignments — current first (latest start), else latest start; forecast ignored',
    fn: function () {
      const T = '2026-10-21';
      const f = rows => defaultProjectIdFromAssignments(rows, T);
      _assertEqual(f([
        { ProjectID: 1, StartDate: '2025-01-01T12:00:00Z', EndDate: '2025-12-31T12:00:00Z' },
        { ProjectID: 2, StartDate: '2026-01-01T12:00:00Z' },                          // current, open end
        { ProjectID: 3, StartDate: '2026-11-01T12:00:00Z', EndDate: '2027-01-01T12:00:00Z' }, // upcoming
      ]), '2', 'open-ended current wins over a later upcoming start');
      _assertEqual(f([
        { ProjectID: 4, StartDate: '2026-02-01T12:00:00Z', EndDate: '2026-12-31T12:00:00Z' },
        { ProjectID: 5, StartDate: '2026-05-01T12:00:00Z', EndDate: '2026-12-31T12:00:00Z' },
      ]), '5', 'latest start among current');
      _assertEqual(f([{ ProjectID: 6, StartDate: T + 'T12:00:00Z', EndDate: '2026-12-01T12:00:00Z' },
        { ProjectID: 9, StartDate: '2027-01-01T12:00:00Z' }]), '6', 'start = today is current');
      _assertEqual(f([{ ProjectID: 7, StartDate: '2026-01-01T12:00:00Z', EndDate: T + 'T12:00:00Z' },
        { ProjectID: 9, StartDate: '2027-01-01T12:00:00Z' }]), '7', 'end = today is current');
      _assertEqual(f([
        { ProjectID: 1, StartDate: '2025-01-01T12:00:00Z', EndDate: '2025-12-31T12:00:00Z' },
        { ProjectID: 3, StartDate: '2026-11-01T12:00:00Z', EndDate: '2027-01-01T12:00:00Z' },
        { ProjectID: 8, StartDate: '2026-03-01T12:00:00Z', EndDate: '2026-09-30T12:00:00Z' },
      ]), '3', 'none current → latest start, upcoming included');
      _assertEqual(f([{ ProjectID: 10 }, { ProjectID: 11, StartDate: '2020-01-01T12:00:00Z', EndDate: '2020-02-01T12:00:00Z' }]),
        '11', 'no StartDate sorts last');
      _assertEqual(f([{ ProjectID: 10 }]), '10', 'only an undated row → that row');
      _assertEqual(f([{ ProjectID: 12, StartDate: '2026-01-01T12:00:00Z', IsForecast: true },
        { ProjectID: 13, StartDate: '2025-01-01T12:00:00Z', EndDate: '2025-02-01T12:00:00Z' }]), '13', 'forecast ignored');
      _assertEqual(f([{ ProjectID: 14, StartDate: '2026-01-01T12:00:00Z' }, { ProjectID: 15, StartDate: '2026-01-01T12:00:00Z' }]),
        '14', 'tie keeps the first seen');
      _assertEqual([f([]), f(null), f([{ ProjectID: null }, { ProjectID: 3, IsForecast: true }])], [null, null, null], 'none → null');
    },
  },
  {
    name: 'N-368 projectTeamPickerRows — open-window TP / DM team members, de-duped, old row shape; includeEmail keeps an out-of-window person',
    fn: function () {
      const T = '2026-10-29';
      const UA = (email, role, extra) => Object.assign({ UserEmail: email, Title: email.toLowerCase(), UserName: email + ' (UA)', AssignedRole: role, ProjectID: 7 }, extra || {});
      const ua = [
        UA('Tp.One@x.com', 'talent_partner'), UA('dm@x.com', 'delivery_manager'), UA('up@x.com', 'talent_partner'),
        UA('ended@x.com', 'talent_partner'), UA('old@x.com', 'talent_partner'), UA('fc@x.com', 'talent_partner'),
        UA('ops@x.com', 'people_ops', { ProjectID: 0 }), UA('adm@x.com', 'admin', { ProjectID: 0 }), UA('late@x.com', 'talent_partner'),
        UA('bad@x.com', 'talent_partner'), UA('quiet@x.com', 'talent_partner', { Active: false }),
      ];
      const R = (email, extra) => Object.assign({ ProjectID: 7, UserEmail: email, EmployeeName: 'Name ' + email }, extra || {});
      const team = [
        R('tp.one@x.com', { EmployeeName: 'TP One', StartDate: '2026-01-01T12:00:00Z' }),          // current, open end
        R('tp.one@x.com', { StartDate: '2025-01-01T12:00:00Z', EndDate: '2025-06-30T12:00:00Z' }), // duplicate person
        R('dm@x.com', { StartDate: '2026-01-01T12:00:00Z', EndDate: '2027-01-01T12:00:00Z' }),
        R('up@x.com', { StartDate: '2026-11-02T12:00:00Z' }),                                       // upcoming: counts from creation
        R('ended@x.com', { StartDate: '2026-01-01T12:00:00Z', EndDate: '2026-10-15T12:00:00Z' }),  // end + 14 = today: in
        R('old@x.com', { StartDate: '2026-01-01T12:00:00Z', EndDate: '2026-10-14T12:00:00Z' }),    // end + 14 = yesterday: out
        R('fc@x.com', { IsForecast: true }),                                                       // forecast
        { ProjectID: null, Customer: 'Unassigned', AutoGenerated: true, EmployeeName: 'Bench Person' }, // bench
        R('', { EmployeeName: 'No Email' }),                                                       // no UserEmail
        R('ops@x.com'), R('adm@x.com'), R('nobody@x.com'),                                         // not TP / DM
        R('late@x.com', { EndDate: '2025-01-31T12:00:00Z' }), R('late@x.com', { EmployeeName: 'Late Two' }), // first row out, second in
        R('bad@x.com', { EndDate: 'not a date' }),                                                 // unreadable end: closed
        R('quiet@x.com', { EmployeeName: '' }),                                                    // inactive UA row keeps the TP role
        R('x@x.com', { ProjectID: 0 }),                                                            // no real ProjectID
      ];
      const got = projectTeamPickerRows(team, ua, T);
      _assertEqual(got.map(r => r.UserEmail), ['Tp.One@x.com', 'dm@x.com', 'up@x.com', 'ended@x.com', 'late@x.com', 'quiet@x.com'], 'members');
      _assertEqual(got[0], { UserEmail: 'Tp.One@x.com', UserName: 'TP One', AssignedRole: 'talent_partner', Active: true, ProjectID: 7 }, 'S-4 row shape, UserAssignments email spelling');
      _assertEqual([got[1].AssignedRole, got[4].UserName, got[5].UserName], ['delivery_manager', 'Late Two', 'quiet@x.com (UA)'], 'DM role; qualifying row names; UA name fallback');
      const noGrace = Object.assign({}, CONFIG, { PROJECT_TEAM: Object.assign({}, CONFIG.PROJECT_TEAM, { WRITE_GRACE_DAYS: 0 }) });
      _assertEqual(projectTeamPickerRows(team, ua, T, null, noGrace).map(r => r.UserEmail).includes('ended@x.com'), false, 'control: grace 0 drops the recently ended row');
      _assertEqual(projectTeamPickerRows(team, ua, T, 'OLD@x.com').map(r => r.UserEmail).includes('old@x.com'), true, 'includeEmail keeps an out-of-window person');
      _assertEqual(projectTeamPickerRows(team, ua, T, 'ops@x.com').map(r => r.UserEmail).includes('ops@x.com'), true, 'includeEmail keeps a non-TP role');
      _assertEqual(projectTeamPickerRows(team, ua, T, 'fc@x.com').map(r => r.UserEmail).includes('fc@x.com'), false, 'includeEmail never keeps a forecast-only row');
      _assertEqual(projectTeamPickerRows(team, [], T), [], 'no UserAssignments rows → no TP / DM → empty (fails closed)');
      _assertEqual([projectTeamPickerRows(null, ua, T), projectTeamPickerRows([], null, T)], [[], []], 'null / empty');
    },
  },
  {
    name: 'N-368 dmProjectIdsFromScope — DM role → the Assignments scope; any other role or a null scope → []',
    fn: function () {
      const dm = [{ AssignedRole: 'delivery_manager', ProjectID: 3 }];
      _assertEqual(dmProjectIdsFromScope(dm, ['7', 9, '7']), ['7', '9'], 'DM: scope ids, strings, de-duped');
      _assertEqual(dmProjectIdsFromScope([{ AssignedRole: 'delivery_manager', ProjectID: 3, Active: false }], ['7']), ['7'], 'DM role ignores Active (as resolveRoleFromAssignments)');
      _assertEqual([
        dmProjectIdsFromScope([{ AssignedRole: 'talent_partner', ProjectID: 7 }], ['7']),
        dmProjectIdsFromScope([], ['7']),
        dmProjectIdsFromScope([{ AssignedRole: 'admin', ProjectID: 0 }], ['7']),
        dmProjectIdsFromScope(dm, null),
        dmProjectIdsFromScope(dm, undefined),
        dmProjectIdsFromScope(null, ['7']),
      ], [[], [], [], [], [], []], 'TP / viewer (leadership without a DM row) / admin / null scope → []');
      _assertEqual(dmProjectIdsFromScope(dm, []), [], 'DM with an empty scope → []');
    },
  },
  {
    name: 'N-368 source guards — the four scope functions branch on accessScopeMode(); shadow code gone; Data Health without Access shadow',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const fnBody = (src, sig) => {
        const at = src.indexOf(sig);
        if (at === -1) return '';
        const next = src.indexOf('\nasync function ', at + sig.length);
        const next2 = src.indexOf('\nfunction ', at + sig.length);
        const ends = [next, next2].filter(i => i > -1);
        return src.slice(at, ends.length ? Math.min(...ends) : undefined);
      };
      const api = ALL_SOURCES['api.js'];
      const upi = fnBody(api, 'async function getUserProjectIds(');
      const dpi = fnBody(ALL_SOURCES['api-misc.js'], 'async function getDefaultUserProjectId(');
      const tpp = fnBody(api, 'async function getTalentPartnersForProject(');
      const dmp = fnBody(api, 'async function getDmProjectIds(');
      const srv = fnBody(api, 'async function getScopedRolesVisibleTo(');
      _assertEqual([upi, dpi, tpp, dmp, srv].map(b => b.length > 0), [true, true, true, true, true], 'control: the five functions were found');
      [['getUserProjectIds', upi], ['getDefaultUserProjectId', dpi], ['getTalentPartnersForProject', tpp], ['getDmProjectIds', dmp]].forEach(([n, body]) => {
        _assertEqual(/accessScopeMode\(\) === 'assignments'/.test(body), true, n + ' branches on accessScopeMode()');
        _assertEqual(/shadow/i.test(body), false, n + ' has no shadow branch');
      });
      _assertEqual(/getItems\("Assignments", `fields\/ProjectID eq \$\{pid\}`\)/.test(tpp) && /projectTeamPickerRows\(team, people, localDayISO\(\), includeEmail\)/.test(tpp),
        true, 'picker: Project Team by ProjectID through projectTeamPickerRows');
      _assertEqual(/getItems\("UserAssignments", `fields\/ProjectID eq \$\{projectId\}`\)/.test(tpp), true, 'picker: legacy UserAssignments body kept');
      _assertEqual(/dmProjectIdsFromScope\(rows, await getUserProjectIds\(lower\)\)/.test(dmp) && /return dmProjectIdsFromAssignments\(rows\);/.test(dmp), true, 'getDmProjectIds: scope route + legacy route');
      const tp = srv.slice(srv.indexOf('// Talent Partner'));
      _assertEqual(tp.length > 20 && /getRolesForUser\(email\)/.test(tp), true, 'TP branch uses getRolesForUser');
      _assertEqual(/"UserAssignments"|'UserAssignments'/.test(tp), false, 'TP branch has no UserAssignments read');
      _assertEqual(/"UserAssignments"/.test(tpp), true, 'control: the UserAssignments pattern matches a real read');
      const gone = ['scopeShadowDue', 'reportScopeShadow', 'groupScopeShadowRows', '_dhRenderAccessShadowHtml', 'shadowStoreKey',
        'diffProjectScopes', 'buildScopeShadowMessage', 'parseScopeShadowMessage', 'scopeShadowLoggedToday', 'scopeShadowMark', 'SCOPE_SHADOW_CHECKS'];
      const hits = [];
      Object.keys(ALL_SOURCES).forEach(f => gone.forEach(id => { if (ALL_SOURCES[f].indexOf(id) > -1) hits.push(f + ': ' + id); }));
      _assertEqual(hits, [], 'no shadow identifier left in js/');
      _assertEqual(Object.keys(ALL_SOURCES).some(f => ALL_SOURCES[f].indexOf('shadowErrorType') > -1), true, 'control: the scan sees a live identifier');
      const osa = ALL_SOURCES['os-admin.js'];
      _assertEqual(/ErrorType === CONFIG\.ACCESS_SCOPE\.shadowErrorType\) return;/.test(osa), true, 'Error Telemetry still skips the historic shadow rows (S-6)');
      _assertEqual(/\+ _dhRenderProjectTeamHtml\(data\)\s*\+ _dhRenderProjectTeamIntegrityHtml\(data\)\s*\+ _dhRenderLciMigrationHtml\(data\)/.test(osa), true, 'Data Health: Access shadow section gone');
    },
  }
);
