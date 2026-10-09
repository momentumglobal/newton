// tests/lint-inline-handlers.js - SEC-12b ratchet (N-301).
//
// Inline on*= handler attributes force 'unsafe-inline' in the CSP script-src
// (N-292). N-301 added js/actions.js (act()/actOn() + a delegated dispatcher);
// N-302 converts every module; N-303 drops 'unsafe-inline'. This file makes the
// count a build failure instead of a convention:
//
//   lintInlineHandlers   per-file count must EQUAL INLINE_HANDLER_BASELINE.
//                        Higher fails (new handler - use act()/actOn()); lower
//                        also fails (lower the baseline in the same change), so
//                        slack left by a conversion can't be refilled unnoticed.
//                        A file with handlers and no entry, an entry for a
//                        missing file, and a 0 entry all fail too.
//   lintJavascriptUrls   no javascript: URL in an href/src/action/formaction
//                        attribute (CSP blocks them as well). Flat ban.
//   lintActNames         every literal action name used in act()/actOn() or a
//                        data-act attribute is registered by some
//                        registerActions({...}) call in js/, and no name is
//                        registered twice.
//
// What counts as an inline handler (raw text, comments included - a commented
// example counts until it is rewritten): on<event> for an event in
// INLINE_HANDLER_EVENTS, not preceded by a word character, ".", "$" or "-",
// then "=", then a quote, a backtick, an escaped quote (handler built inside a
// JS string) or "${". Plus setAttribute('on<event>'. Not counted: el.onclick =
// fn (a DOM property, CSP-safe), data-act-click=, onDone = cb, const only = 'x'.
//
// Scope: js/*.js (ALL_SOURCES, vendor excluded) and root *.html (ALL_HTML).
// Pure functions over data; the assertions skip in the browser harness.
// Reuses _vendorStripJsComments / _vendorStripHtmlComments from lint-vendor.js
// (loads earlier) for the action-name scan only.

var INLINE_HANDLER_EVENTS = [
  'abort', 'animationend', 'auxclick', 'beforeinput', 'beforeunload', 'blur',
  'change', 'click', 'contextmenu', 'copy', 'cut', 'dblclick', 'drag',
  'dragend', 'dragenter', 'dragleave', 'dragover', 'dragstart', 'drop',
  'error', 'focus', 'focusin', 'focusout', 'input', 'invalid', 'keydown',
  'keypress', 'keyup', 'load', 'mousedown', 'mouseenter', 'mouseleave',
  'mousemove', 'mouseout', 'mouseover', 'mouseup', 'paste', 'pointerdown',
  'pointerenter', 'pointerleave', 'pointermove', 'pointerup', 'reset',
  'resize', 'scroll', 'select', 'submit', 'toggle', 'touchend', 'touchmove',
  'touchstart', 'transitionend', 'unload', 'wheel'
];

// Per-file inline handler counts. Lower an entry (or delete it at 0) in the
// same change that removes handlers. N-303 empties this object.
var INLINE_HANDLER_BASELINE = {
  'Readme.html':                     18,
  'admin.html':                      5,
  'index.html':                      5,
  'js/admin.js':                     9,
  'js/briefing-pack.js':             43,
  'js/bulk-activity.js':             5,
  'js/cc-pages.js':                  1,
  'js/checklist-admin.js':           20,
  'js/checklists.js':                4,
  'js/coe-plan.js':                  18,
  'js/dashboard-company.js':         2,
  'js/dashboard-core.js':            1,
  'js/dashboard-project-panels.js':  1,
  'js/dashboard-project.js':         2,
  'js/engagement-forms.js':          15,
  'js/engagement-pages.js':          9,
  'js/forms.js':                     19,
  'js/lci-editor.js':                24,
  'js/lci-import.js':                15,
  'js/lci-leadmagnet.js':            13,
  'js/lci-link.js':                  7,
  'js/lci-pages.js':                 17,
  'js/lci-report.js':                15,
  'js/lci-sections.js':              14,
  'js/lci-summary.js':               8,
  'js/list-controls.js':             5,
  'js/market-report.js':             26,
  'js/mobile-analytics.js':          2,
  'js/mobile-app.js':                5,
  'js/mobile-home.js':               1,
  'js/mobile-pages.js':              11,
  'js/mobile-reporting-ext.js':      5,
  'js/mobile-roleform.js':           4,
  'js/mobile-sales.js':              5,
  'js/mobile-scorecards.js':         3,
  'js/notifications.js':             6,
  'js/org-chart.js':                 14,
  'js/os-admin.js':                  30,
  'js/pages.js':                     23,
  'js/people-dashboard.js':          4,
  'js/people-forms.js':              8,
  'js/people-gantt.js':              3,
  'js/people-invoices.js':           6,
  'js/people-payroll.js':            7,
  'js/people-tracker.js':            17,
  'js/placement-analytics.js':       2,
  'js/report-builder.js':            36,
  'js/role-page.js':                 13,
  'js/sales-pages.js':               7,
  'js/survey-app.js':                4,
  'js/utils.js':                     23,
  'market-reporting.html':           1,
  'mobile.html':                     5,
  'people.html':                     1,
  'reporting.html':                  1,
  'sales.html':                      1,
  'survey.html':                     1
};

var _IH_ATTR_RE = new RegExp(
  '(^|[^\\w.$-])on(?:' + INLINE_HANDLER_EVENTS.join('|') + ')\\s*=\\s*(?:["\'`\\\\]|\\$\\{)', 'gi');
var _IH_SETATTR_RE = /setAttribute\s*\(\s*(["'`])on[a-z]+\1/gi;

function _ihMatches(re, text) {
  re.lastIndex = 0;
  var n = 0;
  while (re.exec(text) !== null) n++;
  return n;
}

function countInlineHandlers(text) {
  var s = String(text == null ? '' : text);
  return _ihMatches(_IH_ATTR_RE, s) + _ihMatches(_IH_SETATTR_RE, s);
}

// { 'js/x.js': n, 'page.html': n } for every scanned file (0s included).
function inlineHandlerCounts(jsSources, htmlSources) {
  var out = {};
  Object.keys(jsSources || {}).forEach(function (f) { out['js/' + f] = countInlineHandlers(jsSources[f]); });
  Object.keys(htmlSources || {}).forEach(function (f) { out[f] = countInlineHandlers(htmlSources[f]); });
  return out;
}

// returns: [ 'message', ... ] - empty when every count equals its baseline.
function lintInlineHandlers(jsSources, htmlSources, baseline) {
  var problems = [];
  var counts = inlineHandlerCounts(jsSources, htmlSources);
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  Object.keys(counts).sort().forEach(function (f) {
    var n = counts[f];
    var listed = has(baseline, f);
    var b = listed ? baseline[f] : 0;
    if (listed && b === 0) problems.push(f + ': INLINE_HANDLER_BASELINE entry is 0 - delete the entry');
    else if (n > b && !listed) problems.push(f + ': ' + n + ' inline on*= handler(s) and no INLINE_HANDLER_BASELINE entry - use act()/actOn() from js/actions.js');
    else if (n > b) problems.push(f + ': inline handlers raised from ' + b + ' to ' + n + ' - use act()/actOn() from js/actions.js');
    else if (n < b) problems.push(f + ': ' + n + ' inline handlers, baseline ' + b + ' - ' + (n === 0 ? 'delete the INLINE_HANDLER_BASELINE entry' : 'lower INLINE_HANDLER_BASELINE to ' + n));
  });
  Object.keys(baseline).sort().forEach(function (f) {
    if (!has(counts, f)) problems.push(f + ': INLINE_HANDLER_BASELINE entry for a file that no longer exists - delete it');
  });
  return problems;
}

// returns: [ { file, line }, ... ]
function lintJavascriptUrls(jsSources, htmlSources) {
  var out = [];
  var re = /\b(?:href|src|action|formaction)\s*=\s*(?:\\?["'`]|\$\{)?\s*javascript:/i;
  function scan(file, text) {
    String(text).split('\n').forEach(function (line, i) {
      if (re.test(line)) out.push({ file: file, line: i + 1 });
    });
  }
  Object.keys(jsSources || {}).sort().forEach(function (f) { scan('js/' + f, jsSources[f]); });
  Object.keys(htmlSources || {}).sort().forEach(function (f) { scan(f, htmlSources[f]); });
  return out;
}

// Text of the balanced (...) / {...} group opening at text[start], skipping
// string and template contents. Returns null when unbalanced.
function _ihBalanced(text, start) {
  var open = text[start], close = open === '{' ? '}' : ')';
  var depth = 0, quote = null;
  for (var i = start; i < text.length; i++) {
    var c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return c === close ? text.slice(start + 1, i) : null;
    }
  }
  return null;
}

// Top-level comma-separated entries of an object-literal body.
function _ihTopLevelEntries(body) {
  var entries = [], depth = 0, quote = null, cur = '';
  for (var i = 0; i < body.length; i++) {
    var c = body[i];
    if (quote) {
      cur += c;
      if (c === '\\') { cur += body[++i] || ''; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; cur += c; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    if (c === ')' || c === '}' || c === ']') depth--;
    if (c === ',' && depth === 0) { entries.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) entries.push(cur);
  return entries.map(function (e) { return e.trim(); }).filter(Boolean);
}

// { registered: { name: ['js/file.js', ...] }, problems: [ 'message', ... ] }
function readActionRegistrations(jsSources) {
  var registered = {}, problems = [];
  Object.keys(jsSources || {}).sort().forEach(function (f) {
    var code = _vendorStripJsComments(jsSources[f]).join('\n');
    var re = /(^|[^\w.$])registerActions\s*\(/g, m;
    while ((m = re.exec(code)) !== null) {
      var before = code.slice(Math.max(0, m.index - 20), m.index + m[1].length);
      if (/function\s+$/.test(before)) continue;           // the definition itself
      var open = code.indexOf('(', m.index + m[1].length);
      var j = open + 1;
      while (j < code.length && /\s/.test(code[j])) j++;
      if (code[j] !== '{') { problems.push('js/' + f + ': registerActions must be passed an object literal'); continue; }
      var body = _ihBalanced(code, j);
      if (body === null) { problems.push('js/' + f + ': unbalanced registerActions({...})'); continue; }
      _ihTopLevelEntries(body).forEach(function (entry) {
        var k = /^([A-Za-z_$][\w$]*)\s*(?::|\(|$)/.exec(entry);
        if (!k) { problems.push('js/' + f + ': cannot read registerActions key: ' + entry.slice(0, 40)); return; }
        (registered[k[1]] = registered[k[1]] || []).push('js/' + f);
      });
    }
  });
  return { registered: registered, problems: problems };
}

function _ihDecodeEntities(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Literal action names used in js/ and root html: [ { file, name }, ... ]
function readActionUses(jsSources, htmlSources) {
  var uses = [];
  var idRe = /^[A-Za-z_$][\w$]*(\.[a-z]+)*$/;
  function attrUses(file, text) {
    var re = /\bdata-act(?:-[a-z]+)?\s*=\s*(["'])([\s\S]*?)\1/g, m;
    while ((m = re.exec(text)) !== null) {
      var v = _ihDecodeEntities(m[2]).trim();
      if (v.charAt(0) === '[') {
        try { v = JSON.parse(v)[0]; } catch (e) { uses.push({ file: file, name: '(unparseable: ' + v.slice(0, 30) + ')' }); continue; }
      }
      if (typeof v === 'string' && idRe.test(v)) uses.push({ file: file, name: v.split('.')[0] });
    }
  }
  Object.keys(jsSources || {}).sort().forEach(function (f) {
    var code = _vendorStripJsComments(jsSources[f]).join('\n');
    var m, actRe = /(^|[^\w.$])act\s*\(\s*(['"`])([^'"`]+)\2/g;
    while ((m = actRe.exec(code)) !== null) uses.push({ file: 'js/' + f, name: m[3].split('.')[0] });
    var onRe = /(^|[^\w.$])actOn\s*\(\s*(['"`])[^'"`]*\2\s*,\s*(['"`])([^'"`]+)\3/g;
    while ((m = onRe.exec(code)) !== null) uses.push({ file: 'js/' + f, name: m[4].split('.')[0] });
    attrUses('js/' + f, code);
  });
  Object.keys(htmlSources || {}).sort().forEach(function (f) {
    attrUses(f, _vendorStripHtmlComments(htmlSources[f]));
  });
  return uses;
}

// returns: [ 'message', ... ]
function lintActNames(jsSources, htmlSources) {
  var reg = readActionRegistrations(jsSources);
  var problems = reg.problems.slice();
  Object.keys(reg.registered).sort().forEach(function (name) {
    if (reg.registered[name].length > 1) problems.push('action "' + name + '" registered more than once: ' + reg.registered[name].join(', '));
  });
  readActionUses(jsSources, htmlSources).forEach(function (u) {
    if (!Object.prototype.hasOwnProperty.call(reg.registered, u.name)) problems.push(u.file + ': action "' + u.name + '" is not registered (registerActions in the file that owns it)');
  });
  return problems;
}