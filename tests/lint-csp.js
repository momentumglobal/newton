// tests/lint-csp.js - SEC-12 regression guard (N-292).
//
// GitHub Pages cannot send response headers, so every root *.html carries its
// Content-Security-Policy as a <meta> tag. This file turns "all 15 pages carry
// the same, correct policy" into a build failure instead of a convention:
//
//   lintCspMeta        every root *.html has exactly one CSP meta and one
//                      referrer meta, both ahead of the first resource tag, and
//                      the CSP equals CSP_CANONICAL.
//   lintCspPolicy      the canonical policy itself: required directives, exact
//                      script-src / connect-src, nothing wildcard / eval / plain
//                      http.
//   lintCspOrigins     the origins in the policy match CONFIG.SP_SITE_URL,
//                      GRAPH (api.js) and CONFIG.AUTHORITY - the policy can't
//                      read CONFIG at runtime, so this is its single-source-of-
//                      truth check.
//   lintFrameGuardWiring  js/frame-guard.js is the 2nd script (after
//                      diag-buffer.js) on exactly the app pages.
//   lintCodeExecution  no eval / new Function / string setTimeout in first-party
//                      js/ (the policy has no 'unsafe-eval').
//   lintJsHosts        no https:// host literal in first-party js/ outside the
//                      allow-list, so a new external origin forces a CSP decision.
//
// CSP_CANONICAL is THE source of truth for the policy string. Changing the
// policy means editing this constant, all 15 HTML metas, and the Readme
// "Security headers" section in the same change.
//
// Pure functions over data. tests/run.js reads the filesystem and passes it in
// (ALL_HTML, ALL_SOURCES); the assertions skip when that data is undefined (the
// browser harness has no filesystem). Reuses _vendorStripHtmlComments and
// _vendorStripJsComments from lint-vendor.js, which loads before this file.

var CSP_CANONICAL =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "connect-src 'self' https://graph.microsoft.com https://login.microsoftonline.com; " +
  "img-src 'self' https://talentpoint.sharepoint.com data: blob:; " +
  "font-src 'self' data:; " +
  "frame-src 'self' https://login.microsoftonline.com; " +
  "manifest-src 'self'; " +
  "worker-src 'self'; " +
  "object-src 'none'; " +
  "base-uri 'self'";

var CSP_REFERRER = 'no-referrer';

// Pages that run Newton code and get the frame guard. Every other root *.html
// must be listed in CSP_STATIC_PAGES, so a NEW page forces a decision here.
var CSP_APP_PAGES = [
  'admin.html', 'command-centre.html', 'index.html', 'market-reporting.html',
  'mobile.html', 'people.html', 'reporting.html', 'sales.html', 'survey.html'
];
var CSP_STATIC_PAGES = [
  'Readme.html', 'market-reporting-user-guide.html', 'people-user-guide.html',
  'redirect.html', 'sales-user-guide.html', 'user-guide.html'
];

var CSP_JS_HOST_ALLOW = [
  'graph.microsoft.com', 'login.microsoftonline.com', 'talentpoint.sharepoint.com',
  'momentumglobal.github.io', 'www.w3.org'
];

var _CSP_REQUIRED_DIRECTIVES = [
  'default-src', 'script-src', 'style-src', 'connect-src', 'img-src', 'font-src',
  'frame-src', 'manifest-src', 'worker-src', 'object-src', 'base-uri'
];

function _cspParse(policy) {
  var out = {};
  String(policy).split(';').forEach(function (part) {
    var t = part.trim();
    if (!t) return;
    var bits = t.split(/\s+/);
    out[bits[0]] = bits.slice(1);
  });
  return out;
}

function _cspOrigin(url) {
  var m = /^(https:\/\/[^\/?#]+)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : '';
}

// returns: [ 'message', ... ] - empty when clean.
function lintCspMeta(htmlSources, canonical, referrer) {
  var problems = [];
  var files = Object.keys(htmlSources).sort();
  if (files.length === 0) problems.push('no root *.html files found');

  files.forEach(function (file) {
    var text = _vendorStripHtmlComments(htmlSources[file]);
    var csp = [], ref = [], charsetAt = -1, m;
    var metaRe = /<meta\b[^>]*>/gi;
    while ((m = metaRe.exec(text)) !== null) {
      var tag = m[0];
      var content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag);
      if (/\bhttp-equiv\s*=\s*["']?content-security-policy["']?/i.test(tag)) {
        csp.push({ at: m.index, content: content ? content[1] : '' });
      } else if (/\bname\s*=\s*["']?referrer["']?/i.test(tag)) {
        ref.push({ at: m.index, content: content ? content[1] : '' });
      } else if (/\bcharset\s*=/i.test(tag) && charsetAt < 0) {
        charsetAt = m.index;
      }
    }
    if (csp.length !== 1) { problems.push(file + ': expected exactly 1 CSP meta, found ' + csp.length); }
    if (ref.length !== 1) { problems.push(file + ': expected exactly 1 referrer meta, found ' + ref.length); }
    if (csp.length === 1 && csp[0].content !== canonical) problems.push(file + ': CSP differs from CSP_CANONICAL');
    if (ref.length === 1 && ref[0].content !== referrer) problems.push(file + ': referrer meta is not "' + referrer + '"');

    // CSP only governs content parsed AFTER it: it must precede every resource tag.
    var firstResource = text.search(/<(script|link|style|img|iframe|object|embed)\b/i);
    if (csp.length === 1 && firstResource >= 0 && csp[0].at > firstResource) problems.push(file + ': CSP meta comes after the first <script>/<link>/<style>/<img>');
    if (ref.length === 1 && firstResource >= 0 && ref[0].at > firstResource) problems.push(file + ': referrer meta comes after the first <script>/<link>/<style>/<img>');
    // charset must stay inside the first 1024 bytes, so it goes ahead of the long CSP meta.
    if (charsetAt < 0) problems.push(file + ': no <meta charset>');
    else if (csp.length === 1 && charsetAt > csp[0].at) problems.push(file + ': <meta charset> must come before the CSP meta');
    else if (charsetAt > 1000) problems.push(file + ': <meta charset> is not within the first 1000 characters');
  });
  return problems;
}

// returns: [ 'message', ... ]
function lintCspPolicy(policy) {
  var problems = [];
  var d = _cspParse(policy);
  _CSP_REQUIRED_DIRECTIVES.forEach(function (name) {
    if (!(name in d)) problems.push('missing directive: ' + name);
  });
  function exact(name, expected) {
    if (!(name in d)) return;
    if (d[name].join(' ') !== expected.join(' ')) problems.push(name + ' must be exactly: ' + expected.join(' ') + ' (got: ' + d[name].join(' ') + ')');
  }
  exact('script-src', ["'self'", "'unsafe-inline'"]);
  exact('connect-src', ["'self'", 'https://graph.microsoft.com', 'https://login.microsoftonline.com']);
  exact('object-src', ["'none'"]);
  exact('base-uri', ["'self'"]);
  var banned = [
    [/'unsafe-eval'/i, "'unsafe-eval'"], [/'unsafe-hashes'/i, "'unsafe-hashes'"],
    [/\*/, 'a wildcard (*)'], [/(^|[\s;])http:/i, 'a plain http: source'],
    [/(^|[\s;])wss?:/i, 'a ws:/wss: source'], [/(^|\s)https:(\s|;|$)/i, 'the bare https: scheme']
  ];
  banned.forEach(function (b) { if (b[0].test(policy)) problems.push('policy contains ' + b[1]); });
  return problems;
}

// cfg: { spSiteUrl, graph, authority }
function lintCspOrigins(policy, cfg) {
  var problems = [];
  var d = _cspParse(policy);
  function need(directive, url, label) {
    var o = _cspOrigin(url);
    if (!o) { problems.push(label + ' is not an https URL: ' + url); return; }
    if ((d[directive] || []).map(function (s) { return s.toLowerCase(); }).indexOf(o) < 0) {
      problems.push(directive + ' is missing ' + o + ' (' + label + ')');
    }
  }
  need('img-src', cfg.spSiteUrl, 'CONFIG.SP_SITE_URL');
  need('connect-src', cfg.graph, 'GRAPH');
  need('connect-src', cfg.authority, 'CONFIG.AUTHORITY');
  need('frame-src', cfg.authority, 'CONFIG.AUTHORITY');
  return problems;
}

// appPages: pages that must load frame-guard.js as the 2nd script.
// staticPages: pages that must not. Any other root *.html fails (classify it).
function lintFrameGuardWiring(htmlSources, appPages, staticPages) {
  var problems = [];
  var files = Object.keys(htmlSources).sort();
  appPages.forEach(function (p) { if (files.indexOf(p) < 0) problems.push(p + ': listed in CSP_APP_PAGES but not found'); });
  files.forEach(function (file) {
    var isApp = appPages.indexOf(file) >= 0;
    if (!isApp && staticPages.indexOf(file) < 0) {
      problems.push(file + ': new HTML page - add it to CSP_APP_PAGES (runs Newton code) or CSP_STATIC_PAGES in tests/lint-csp.js');
      return;
    }
    var text = _vendorStripHtmlComments(htmlSources[file]);
    var srcs = [], m, re = /<script\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;
    while ((m = re.exec(text)) !== null) srcs.push(m[2]);
    var guardAt = srcs.indexOf('js/frame-guard.js');
    if (isApp) {
      if (srcs[0] !== 'js/diag-buffer.js') problems.push(file + ': first script must be js/diag-buffer.js');
      if (srcs[1] !== 'js/frame-guard.js') problems.push(file + ': second script must be js/frame-guard.js');
    } else if (guardAt >= 0) {
      problems.push(file + ': static page must not load js/frame-guard.js');
    }
  });
  return problems;
}

// returns: [ { file, line, text }, ... ]
function lintCodeExecution(jsSources) {
  var violations = [];
  var patterns = [
    /\beval\s*\(/, /\bnew\s+Function\s*\(/, /(^|[^\w.$])Function\s*\(/,
    /\bset(Timeout|Interval)\s*\(\s*(['"`])/
  ];
  Object.keys(jsSources).sort().forEach(function (file) {
    var lines = _vendorStripJsComments(jsSources[file]);
    for (var i = 0; i < lines.length; i++) {
      for (var p = 0; p < patterns.length; p++) {
        if (patterns[p].test(lines[i])) { violations.push({ file: 'js/' + file, line: i + 1, text: lines[i].trim().slice(0, 100) }); break; }
      }
    }
  });
  return violations;
}

// returns: [ { file, line, host }, ... ]
function lintJsHosts(jsSources, allowHosts) {
  var violations = [];
  Object.keys(jsSources).sort().forEach(function (file) {
    var lines = _vendorStripJsComments(jsSources[file]);
    for (var i = 0; i < lines.length; i++) {
      var re = /https?:\/\/([A-Za-z0-9.-]+)/g, m;
      while ((m = re.exec(lines[i])) !== null) {
        if (allowHosts.indexOf(m[1].toLowerCase()) < 0) violations.push({ file: 'js/' + file, line: i + 1, host: m[1] });
      }
    }
  });
  return violations;
}

// Runs the text of js/frame-guard.js against stub window / document objects
// (the guard is an IIFE over the globals `window` and `document`).
function runFrameGuard(source, win, doc) {
  new Function('window', 'document', source)(win, doc);
}