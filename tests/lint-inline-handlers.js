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
//                        registerActions({...}) call in js/ or in a root *.html
//                        page's inline <script> (N-302e), and no name is
//                        registered twice. act()/actOn() calls inside those
//                        inline scripts are checked too. N-321: the first
//                        element of a retryAct / actionAct array (also as a
//                        ternary arm) and of mobilePageError's second argument
//                        is checked the same way (string literal only).
//   lintLegacyActionParams  (N-302a) the code-string parameters actionOnClick /
//                        retryOnClick are gone from js/ (replaced by the
//                        actionAct / retryAct argument arrays).
//   lintListControlCallbacks (N-302a) the callbackFn passed to the five
//                        list-controls helpers is a registered action name.
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
// same change that removes handlers. Empty since N-302f: every file is at 0,
// so any new inline handler fails as "no INLINE_HANDLER_BASELINE entry".
var INLINE_HANDLER_BASELINE = {};

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

// Bodies of the inline <script> blocks of an HTML page (the ones without a src
// attribute), HTML comments blanked. N-302e: index.html, admin.html and
// Readme.html declare their functions in classic inline scripts.
function _ihInlineScripts(html) {
  var out = [], re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi, m;
  var text = _vendorStripHtmlComments(html);
  while ((m = re.exec(text)) !== null) {
    if (!/\bsrc\s*=/i.test(m[1])) out.push(m[2]);
  }
  return out;
}

// { registered: { name: ['js/file.js', 'page.html', ...] }, problems: [ 'message', ... ] }
// htmlSources is optional (N-302e): a registerActions({...}) in a root page's
// inline <script> counts too, labelled with the page name.
function readActionRegistrations(jsSources, htmlSources) {
  var registered = {}, problems = [];
  function scan(label, code) {
    var re = /(^|[^\w.$])registerActions\s*\(/g, m;
    while ((m = re.exec(code)) !== null) {
      var before = code.slice(Math.max(0, m.index - 20), m.index + m[1].length);
      if (/function\s+$/.test(before)) continue;           // the definition itself
      var open = code.indexOf('(', m.index + m[1].length);
      var j = open + 1;
      while (j < code.length && /\s/.test(code[j])) j++;
      if (code[j] !== '{') { problems.push(label + ': registerActions must be passed an object literal'); continue; }
      var body = _ihBalanced(code, j);
      if (body === null) { problems.push(label + ': unbalanced registerActions({...})'); continue; }
      _ihTopLevelEntries(body).forEach(function (entry) {
        var k = /^([A-Za-z_$][\w$]*)\s*(?::|\(|$)/.exec(entry);
        if (!k) { problems.push(label + ': cannot read registerActions key: ' + entry.slice(0, 40)); return; }
        (registered[k[1]] = registered[k[1]] || []).push(label);
      });
    }
  }
  Object.keys(jsSources || {}).sort().forEach(function (f) {
    scan('js/' + f, _vendorStripJsComments(jsSources[f]).join('\n'));
  });
  Object.keys(htmlSources || {}).sort().forEach(function (f) {
    _ihInlineScripts(htmlSources[f]).forEach(function (block) {
      scan(f, _vendorStripJsComments(block).join('\n'));
    });
  });
  return { registered: registered, problems: problems };
}

function _ihDecodeEntities(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// N-321: the value expression that starts at code[start] - up to the first
// top-level "," or the closing bracket of the enclosing group. Strings and
// templates are skipped. Multi-line values and ternaries are returned whole.
function _ihPropValue(code, start) {
  var depth = 0, quote = null;
  for (var i = start; i < code.length; i++) {
    var c = code[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '{' || c === '[') { depth++; continue; }
    if (c === ')' || c === '}' || c === ']') {
      if (depth === 0) return code.slice(start, i);
      depth--;
      continue;
    }
    if (c === ',' && depth === 0) return code.slice(start, i);
  }
  return code.slice(start);
}

// N-321: action names (modifiers stripped) from the act() argument arrays in an
// expression: the whole value, or a ternary arm, when its first element is a
// plain string literal. [fn], null, a template with ${} are skipped.
function _ihArrayActNames(expr) {
  var out = [], re = /(^|[?:]\s*)\[\s*(['"])([^'"`$]+)\2/g, m;
  while ((m = re.exec(expr)) !== null) out.push(m[3].split('.')[0]);
  return out;
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
  function callUses(file, code) {
    var m, actRe = /(^|[^\w.$])act\s*\(\s*(['"`])([^'"`]+)\2/g;
    while ((m = actRe.exec(code)) !== null) uses.push({ file: file, name: m[3].split('.')[0] });
    var onRe = /(^|[^\w.$])actOn\s*\(\s*(['"`])[^'"`]*\2\s*,\s*(['"`])([^'"`]+)\3/g;
    while ((m = onRe.exec(code)) !== null) uses.push({ file: file, name: m[4].split('.')[0] });
    // N-321: retryAct: [...] / actionAct: [...] property values (pageErrorBlock,
    // emptyStateBlock, emptyStateRow) - literal first element, ternary arms too.
    var propRe = /(^|[^\w.$])(?:retryAct|actionAct)\s*:\s*/g;
    while ((m = propRe.exec(code)) !== null) {
      _ihArrayActNames(_ihPropValue(code, propRe.lastIndex)).forEach(function (n) { uses.push({ file: file, name: n }); });
    }
    // N-321: mobilePageError(message, ['name', ...]) - argument index 1.
    var mpeRe = /(^|[^\w.$])mobilePageError\s*\(/g;
    while ((m = mpeRe.exec(code)) !== null) {
      if (/function\s+$/.test(code.slice(Math.max(0, m.index - 20), m.index + m[1].length))) continue;   // the definition
      var body = _ihBalanced(code, code.indexOf('(', m.index + m[1].length));
      var retry = body === null ? null : _ihTopLevelEntries(body)[1];
      if (retry) _ihArrayActNames(retry).forEach(function (n) { uses.push({ file: file, name: n }); });
    }
  }
  Object.keys(jsSources || {}).sort().forEach(function (f) {
    var code = _vendorStripJsComments(jsSources[f]).join('\n');
    callUses('js/' + f, code);
    attrUses('js/' + f, code);
  });
  Object.keys(htmlSources || {}).sort().forEach(function (f) {
    attrUses(f, _vendorStripHtmlComments(htmlSources[f]));
    _ihInlineScripts(htmlSources[f]).forEach(function (block) {
      callUses(f, _vendorStripJsComments(block).join('\n'));
    });
  });
  return uses;
}

// returns: [ 'message', ... ]
function lintActNames(jsSources, htmlSources) {
  var reg = readActionRegistrations(jsSources, htmlSources);
  var problems = reg.problems.slice();
  Object.keys(reg.registered).sort().forEach(function (name) {
    if (reg.registered[name].length > 1) problems.push('action "' + name + '" registered more than once: ' + reg.registered[name].join(', '));
  });
  readActionUses(jsSources, htmlSources).forEach(function (u) {
    if (!Object.prototype.hasOwnProperty.call(reg.registered, u.name)) problems.push(u.file + ': action "' + u.name + '" is not registered (registerActions in the file that owns it)');
  });
  return problems;
}

// N-302b hotfix: a local named act / actOn in a file that calls the builders
// shadows them, so every act(...) in that scope throws "act is not a function"
// at render time (js/coe-plan.js, found live in N-302b QA - no test renders it).
// Flat file-level rule, deliberately conservative: a file that calls act( or
// actOn( may not declare anything of that name (variable, destructuring alias,
// function, parameter, catch binding). js/actions.js defines them and is exempt.
// returns: [ 'message', ... ]
function lintActShadowing(jsSources) {
  var problems = [];
  Object.keys(jsSources || {}).sort().forEach(function (f) {
    if (f === 'actions.js') return;
    var code = _vendorStripJsComments(jsSources[f]).join('\n');
    ['act', 'actOn'].forEach(function (name) {
      if (!new RegExp('(^|[^\\w.$])' + name + '\\s*\\(').test(code)) return;
      var declared = [
        new RegExp('\\b(?:const|let|var)\\s+' + name + '(?![\\w$])'),
        new RegExp('\\b(?:const|let|var)\\s*[{\\[]\\s*(?:[^}\\]]*[\\s:,])?' + name + '\\s*[,}\\]=]'),
        new RegExp('\\bfunction\\s+' + name + '(?![\\w$])'),
        new RegExp('catch\\s*\\(\\s*' + name + '\\s*\\)'),
        new RegExp('(^|[^\\w.$])' + name + '\\s*=>')
      ].some(function (re) { return re.test(code); });
      if (!declared) {
        var paramLists = [], m;
        var fnRe = /\bfunction\b[^(]*\(([^)]*)\)/g, arrowRe = /\(([^()]*)\)\s*=>/g;
        while ((m = fnRe.exec(code)) !== null) paramLists.push(m[1]);
        while ((m = arrowRe.exec(code)) !== null) paramLists.push(m[1]);
        var inParams = new RegExp('(?:^|[\\s,({\\[:])' + name + '\\s*(?:[,)}\\]=]|$)');
        declared = paramLists.some(function (p) { return inParams.test(p); });
      }
      if (declared) problems.push('js/' + f + ': a local "' + name + '" shadows the ' + name + '() action builder in a file that calls it - rename it (e.g. "actual"); every ' + name + '() call in that scope throws "' + name + ' is not a function"');
    });
  });
  return problems;
}

// N-302a: no file may use the old code-string parameters. (js/mobile-app.js
// was exempt for mobilePageError's retryOnClick until N-302f.)
// returns: [ 'message', ... ]
function lintLegacyActionParams(jsSources) {
  var problems = [];
  Object.keys(jsSources || {}).sort().forEach(function (f) {
    var code = _vendorStripJsComments(jsSources[f]).join('\n');
    var m = /\b(actionOnClick|retryOnClick)\b/.exec(code);
    if (m) problems.push('js/' + f + ': "' + m[1] + '" is retired - pass actionAct / retryAct, an act() argument list like [\'name\', arg]');
  });
  return problems;
}

// The five shared list helpers and the 0-based index of their callbackFn argument.
var LIST_CONTROL_HELPERS = {
  projectFilterDropdown: 2,
  periodFilterDropdown: 1,
  pageSizeDropdown: 1,
  listSearchBox: 1,
  sortableHeader: 3
};

// returns: [ 'message', ... ] - a callbackFn written as a string literal must
// be a registered action; a variable / expression is skipped.
function lintListControlCallbacks(jsSources) {
  var problems = [];
  var registered = readActionRegistrations(jsSources).registered;
  Object.keys(jsSources || {}).sort().forEach(function (f) {
    var code = _vendorStripJsComments(jsSources[f]).join('\n');
    Object.keys(LIST_CONTROL_HELPERS).forEach(function (helper) {
      var re = new RegExp('(^|[^\\w.$])' + helper + '\\s*\\(', 'g'), m;
      while ((m = re.exec(code)) !== null) {
        if (/function\s+$/.test(code.slice(Math.max(0, m.index - 20), m.index + m[1].length))) continue;
        var open = code.indexOf('(', m.index + m[1].length);
        var body = _ihBalanced(code, open);
        if (body === null) continue;
        var arg = _ihTopLevelEntries(body)[LIST_CONTROL_HELPERS[helper]];
        var lit = arg ? /^(['"])([A-Za-z_$][\w$]*)\1$/.exec(arg) : null;
        if (lit && !Object.prototype.hasOwnProperty.call(registered, lit[2])) {
          problems.push('js/' + f + ': ' + helper + '() callback "' + lit[2] + '" is not a registered action (registerActions in the file that defines it)');
        }
      }
    });
  });
  return problems;
}