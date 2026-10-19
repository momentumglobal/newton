// tests/lint-css-split.js - N-349b guard: css/style.css was split into per-module
// sheets, and a shell must link exactly the sheets it renders.
//
// Why a lint: a module sheet that a shell forgets to link fails SILENTLY (the
// page renders unstyled in that one module, nothing logs), and a rule left in two
// files drifts. Four checks, all pure functions over text:
//
//   lintCssSplit(css, html, sources, config)
//     css      { 'style.css': text, ... }   everything in css/   (ALL_CSS)
//     html     { 'sales.html': text, ... }  root pages            (ALL_HTML)
//     sources  { 'utils.js': text, ... }    everything in js/     (ALL_SOURCES)
//     config   optional; defaults to the CSS_SPLIT_* constants below
//   returns an array of problem strings - empty when clean.
//
//   1 links      each shell's <link rel="stylesheet"> list equals CSS_SPLIT_LINKS, in
//                order, every linked file exists, and no other root page links style.css
//   2 duplicates no rule (selector list + enclosing @media) is defined in two of
//                style.css and the module sheets
//   3 sentinels  each module sheet defines its sentinel classes, style.css defines
//                none of them, and style.css still defines the classes that stay shared
//   4 owned      a shell that does not link a module sheet may not be able to render any of
//                its rules: no selector holding a class owned by that sheet may have all its
//                classes present in the shell's HTML or the JS it loads (comments stripped).
//                Static tokens only: a class built by string concatenation cannot be seen
//                (visual QA is the backstop).
//
// Depends on lint-vendor.js (load it first): _vendorStripJsComments, _vendorStripHtmlComments.
// tests/run.js supplies ALL_CSS, ALL_HTML and ALL_SOURCES; the assertions skip when
// they are undefined (the browser harness has no filesystem).

// The contract: shell -> stylesheets, in order. Add a module sheet here when you add one.
var CSS_SPLIT_LINKS = {
  'admin.html': ['css/style.css', 'css/admin.css'],
  'command-centre.html': ['css/style.css', 'css/command-centre.css'],
  'index.html': ['css/style.css', 'css/homepage.css', 'css/engagement.css'],
  'market-reporting.html': ['css/style.css', 'css/report-builder.css'],
  'people.html': ['css/style.css', 'css/engagement.css', 'css/people.css'],
  'reporting.html': ['css/style.css', 'css/report-builder.css', 'css/coe-plan.css', 'css/roles.css', 'css/reporting.css'],
  'sales.html': ['css/style.css', 'css/lci.css'],
  'survey.html': ['css/style.css', 'css/engagement.css'],
};

// Module sheets (the files that were split out of style.css) and two classes each
// that must live there and nowhere in style.css.
var CSS_SPLIT_SHEETS = {
  'command-centre.css': ['cc-tile', 'cc-grid'],
  'homepage.css': ['home-greeting', 'ql-trigger', 'module-card'],
  'engagement.css': ['eng-card', 'survey-widget'],
  'people.css': ['org-tree', 'org-bench'],
  'lci.css': ['lci-grid', 'lm-report'],
  'coe-plan.css': ['coe-opens-chart', 'coe-legend'],
  'roles.css': ['role-timeline', 'ck-admin'],
  'report-builder.css': ['rb-shell', 'bp-pack', 'rb-cover'],
};

// Classes shared by shells that do not all link one module sheet, so they stay in style.css.
var CSS_SPLIT_STAYS = ['kpi-value', 'rt-table', 'rb-rt-wrapper', 'empty-state', 'pa-rag-glyph', 'rb-print-band', 'page-header-actions'];

// Owned-class mentions a non-linking shell's file is allowed to hold, as { 'js/file.js': ['class'] }
// with the reason beside each entry. Empty today: the only two mentions the scan found
// (config.js and api-headcount.js) are comments, which are stripped before matching.
var CSS_SPLIT_REF_ALLOW = {};

// State classes toggled at runtime; they never decide whether a sheet is needed.
var CSS_SPLIT_STATE = ['open', 'active', 'visible', 'disabled', 'single', 'hidden', 'selected', 'show', 'collapsed', 'expanded', 'dragging', 'done', 'error', 'saving', 'loading', 'pending', 'checked', 'current', 'row-pending'];

var CSS_SPLIT_DEFAULTS = { links: CSS_SPLIT_LINKS, sheets: CSS_SPLIT_SHEETS, stays: CSS_SPLIT_STAYS, allow: CSS_SPLIT_REF_ALLOW };

function _cssSplitStrip(text) { return String(text).replace(/\/\*[\s\S]*?\*\//g, ''); }
function _cssSplitNorm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

// Flatten a stylesheet into [{ key, selectors }]. @media / @supports are entered; other
// at-rules (@font-face, @keyframes, @page) are skipped. key = enclosing at-rules + selector list.
function _cssSplitRules(text, ctx) {
  var t = _cssSplitStrip(text), out = [], depth = 0, start = 0, i;
  for (i = 0; i < t.length; i++) {
    var c = t.charAt(i);
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        var block = t.slice(start, i + 1);
        var head = _cssSplitNorm(block.slice(0, block.indexOf('{')));
        if (head.indexOf('@media') === 0 || head.indexOf('@supports') === 0) {
          out = out.concat(_cssSplitRules(block.slice(block.indexOf('{') + 1, -1), (ctx || '') + '>' + head));
        } else if (head.charAt(0) !== '@') {
          out.push({ key: (ctx || '') + '|' + head, selectors: head });
        }
        start = i + 1;
      }
    } else if (c === ';' && depth === 0) start = i + 1;
  }
  return out;
}

function _cssSplitSplitSelectors(list) {
  var out = [], depth = 0, cur = '', i;
  for (i = 0; i < list.length; i++) {
    var c = list.charAt(i);
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

function _cssSplitClassesIn(s) {
  var m = String(s).match(/\.(-?[A-Za-z_][\w-]*)/g) || [];
  return m.map(function (x) { return x.slice(1); });
}

// Every class named anywhere in a rule list, and only the subject (last compound) classes.
function _cssSplitClassSets(rules) {
  var all = {}, subject = {};
  rules.forEach(function (r) {
    _cssSplitSplitSelectors(r.selectors).forEach(function (sel) {
      var clean = sel.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '');
      _cssSplitClassesIn(clean).forEach(function (c) { all[c] = true; });
      var parts = clean.trim().split(/[\s>+~]+/);
      _cssSplitClassesIn(parts[parts.length - 1]).forEach(function (c) { subject[c] = true; });
    });
  });
  return { all: all, subject: subject };
}

function _cssSplitLinksOf(html) {
  var out = [];
  String(html).replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]*)"[^>]*>/gi, function (m, h) { out.push(h); return m; });
  return out;
}

function _cssSplitScriptsOf(html) {
  var out = [];
  String(html).replace(/<script\b[^>]*\bsrc="([^"]*)"[^>]*>/gi, function (m, s) { out.push(s); return m; });
  return out;
}

function _cssSplitHasToken(text, cls) {
  return new RegExp('(^|[^\\w-])' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\w-])').test(text);
}

function lintCssSplit(css, html, sources, config) {
  var cfg = config || CSS_SPLIT_DEFAULTS, problems = [];

  // 1 links
  Object.keys(cfg.links).forEach(function (shell) {
    if (!Object.prototype.hasOwnProperty.call(html, shell)) { problems.push(shell + ': page not found'); return; }
    var got = _cssSplitLinksOf(html[shell]), want = cfg.links[shell];
    if (got.join(' ') !== want.join(' ')) problems.push(shell + ': stylesheet links are [' + got.join(', ') + '], expected [' + want.join(', ') + ']');
    want.forEach(function (h) { if (!Object.prototype.hasOwnProperty.call(css, h.replace(/^css\//, ''))) problems.push(shell + ': links ' + h + ', which does not exist in css/'); });
  });
  Object.keys(html).sort().forEach(function (p) {
    if (!Object.prototype.hasOwnProperty.call(cfg.links, p) && _cssSplitLinksOf(html[p]).indexOf('css/style.css') !== -1) problems.push(p + ': links css/style.css but is not in CSS_SPLIT_LINKS (add it, with the module sheets it renders)');
  });

  // parse once
  var files = ['style.css'].concat(Object.keys(cfg.sheets)), rules = {};
  files.forEach(function (f) {
    if (!Object.prototype.hasOwnProperty.call(css, f)) { problems.push('css/' + f + ': file not found'); rules[f] = []; return; }
    rules[f] = _cssSplitRules(css[f]);
  });

  // 2 duplicates
  var seen = {};
  files.forEach(function (f) {
    var local = {};
    rules[f].forEach(function (r) {
      if (local[r.key]) return;
      local[r.key] = true;
      if (seen[r.key]) problems.push('css/' + f + ' and css/' + seen[r.key] + ' both define ' + r.key.slice(0, 90));
      else seen[r.key] = f;
    });
  });

  // 3 sentinels and the shared list
  var styleClasses = _cssSplitClassSets(rules['style.css']).all;
  Object.keys(cfg.sheets).forEach(function (f) {
    var own = _cssSplitClassSets(rules[f]).all;
    cfg.sheets[f].forEach(function (c) {
      if (!own[c]) problems.push('css/' + f + ': expected to define .' + c);
      if (styleClasses[c]) problems.push('css/style.css still defines .' + c + ', which belongs in css/' + f);
    });
  });
  cfg.stays.forEach(function (c) { if (!styleClasses[c]) problems.push('css/style.css: expected to keep .' + c + ' (shared by shells that do not all link one module sheet)'); });

  // 4 owned classes: a selector is "reachable" in a shell when every class in it (state
  // classes aside) appears in the shell's HTML or the JS it loads; it counts only if it
  // holds at least one owned class (one named in no other css file), so shared context
  // classes (.btn-primary, .page-header) never make a sheet look needed.
  var owned = {}, everyFile = {};
  Object.keys(css).forEach(function (g) { everyFile[g] = rules[g] || _cssSplitRules(css[g]); });
  Object.keys(cfg.sheets).forEach(function (f) {
    var mine = _cssSplitClassSets(rules[f]).all, elsewhere = {};
    Object.keys(everyFile).forEach(function (g) {
      if (g === f) return;
      var s = _cssSplitClassSets(everyFile[g]).all;
      Object.keys(s).forEach(function (c) { elsewhere[c] = true; });
    });
    owned[f] = {};
    Object.keys(mine).forEach(function (c) { if (!elsewhere[c]) owned[f][c] = true; });
  });
  Object.keys(cfg.links).forEach(function (shell) {
    if (!html[shell]) return;
    var linked = cfg.links[shell].map(function (h) { return h.replace(/^css\//, ''); });
    var texts = [{ file: shell, text: _vendorStripHtmlComments(html[shell]) }];
    _cssSplitScriptsOf(html[shell]).forEach(function (s) {
      var name = s.replace(/^js\//, '');
      if (s.indexOf('vendor/') !== -1 || !sources[name]) return;
      texts.push({ file: 'js/' + name, text: _vendorStripJsComments(sources[name]).join('\n') });
    });
    var present = {};
    function has(c) {
      if (CSS_SPLIT_STATE.indexOf(c) !== -1) return true;
      if (!(c in present)) present[c] = texts.some(function (t) { return (cfg.allow[t.file] || []).indexOf(c) === -1 && _cssSplitHasToken(t.text, c); });
      return present[c];
    }
    Object.keys(cfg.sheets).forEach(function (f) {
      if (linked.indexOf(f) !== -1) return;
      var hit = null;
      rules[f].forEach(function (r) {
        if (hit) return;
        _cssSplitSplitSelectors(r.selectors).forEach(function (sel) {
          if (hit) return;
          var cls = _cssSplitClassesIn(sel.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, ''));
          if (!cls.length || !cls.some(function (c) { return owned[f][c]; })) return;
          if (cls.every(has)) hit = sel.trim();
        });
      });
      if (hit) problems.push(shell + ': can render css/' + f + ' (' + hit.slice(0, 70) + ') but does not link it');
    });
  });
  return problems;
}
