// tests/lint-inline-styles.js - SEC-12c ratchet (N-324).
//
// N-324 split the CSP style policy: style-src-elem is 'self' (an injected
// <style> is blocked) while style-src-attr keeps 'unsafe-inline', because
// several hundred inline style="" attributes are still in use. Converting them
// all was judged not worth it for now (spec N-324, option C), but the count
// must only go down:
//
//   lintInlineStyles       per-file count must EQUAL INLINE_STYLE_BASELINE.
//                          Higher fails (new inline style - use a class in
//                          style.css; for a data-driven value set a custom
//                          property with el.style.setProperty after render);
//                          lower also fails (lower the baseline in the same
//                          change), so slack left by a cleanup can't be
//                          refilled unnoticed. A file with styles and no entry,
//                          an entry for a missing file, and a 0 entry all fail.
//   lintStyleSetAttribute  no setAttribute('style', ...) in first-party js/
//                          (comments ignored). Flat ban: it is the same
//                          attribute route, just harder to see.
//
// What counts as an inline style (raw text, comments included - same rule as
// lint-inline-handlers.js): "style" not preceded by a word character, ".",
// "$" or "-", then "=", then a quote, a backtick, an escaped quote (attribute
// built inside a JS string) or "${". Not counted: el.style.x = ...,
// el.style = ..., data-style=, font-style:, newStyle = ... . A JS variable
// named style assigned a string literal (const style = `...`) does count; it
// is in the baseline like any other site.
//
// Scope: js/*.js (ALL_SOURCES, vendor excluded) and root *.html (ALL_HTML).
// Pure functions over data; the assertions skip in the browser harness.
// Reuses _vendorStripJsComments from lint-vendor.js (loads earlier).

// Per-file inline style counts (N-324 baseline, 13 Oct 2026). Lower an entry
// (or delete it at 0) in the same change that removes inline styles.
var INLINE_STYLE_BASELINE = {
  'Readme.html': 20,
  'admin.html': 1,
  'index.html': 7,
  'js/admin.js': 7,
  'js/briefing-pack.js': 3,
  'js/cc-pages.js': 8,
  'js/coe-plan.js': 11,
  'js/dashboard-company.js': 10,
  'js/dashboard-core.js': 2,
  'js/dashboard-project-panels.js': 24,
  'js/dashboard-project.js': 1,
  'js/engagement-forms.js': 3,
  'js/engagement-pages.js': 3,
  'js/forms-placement.js': 2,
  'js/forms-role.js': 10,
  'js/forms-weekly.js': 1,
  'js/lci-editor.js': 11,
  'js/lci-import.js': 18,
  'js/lci-leadmagnet.js': 34,
  'js/lci-link.js': 5,
  'js/lci-pages.js': 20,
  'js/lci-report.js': 18,
  'js/lci-sections.js': 24,
  'js/lci-summary.js': 14,
  'js/list-controls.js': 1,
  'js/market-report.js': 32,
  'js/mobile-analytics.js': 4,
  'js/mobile-app.js': 3,
  'js/mobile-pages.js': 1,
  'js/mobile-people.js': 6,
  'js/mobile-reporting-ext.js': 6,
  'js/mobile-roleform.js': 7,
  'js/mobile-sales.js': 1,
  'js/mobile-scorecards.js': 7,
  'js/org-chart.js': 12,
  'js/os-admin.js': 35,
  'js/pages.js': 10,
  'js/people-dashboard.js': 45,
  'js/people-forms.js': 7,
  'js/people-gantt.js': 33,
  'js/people-invoices.js': 12,
  'js/people-payroll.js': 38,
  'js/people-tracker.js': 23,
  'js/placement-analytics.js': 34,
  'js/report-builder.js': 5,
  'js/revenue-chart.js': 7,
  'js/sales-pages.js': 11,
  'js/survey-app.js': 1,
  'js/utils.js': 2,
  'market-reporting-user-guide.html': 1,
  'mobile.html': 7,
  'people-user-guide.html': 6,
  'sales-user-guide.html': 1,
  'user-guide.html': 1
};

var _IS_ATTR_RE = /(^|[^\w.$-])style\s*=\s*(?:["'`\\]|\$\{)/gi;

function countInlineStyles(text) {
  var s = String(text == null ? '' : text);
  _IS_ATTR_RE.lastIndex = 0;
  var n = 0;
  while (_IS_ATTR_RE.exec(s) !== null) n++;
  return n;
}

// { 'js/x.js': n, 'page.html': n } for every scanned file (0s included).
function inlineStyleCounts(jsSources, htmlSources) {
  var out = {};
  Object.keys(jsSources || {}).forEach(function (f) { out['js/' + f] = countInlineStyles(jsSources[f]); });
  Object.keys(htmlSources || {}).forEach(function (f) { out[f] = countInlineStyles(htmlSources[f]); });
  return out;
}

// returns: [ 'message', ... ] - empty when every count equals its baseline.
function lintInlineStyles(jsSources, htmlSources, baseline) {
  var problems = [];
  var counts = inlineStyleCounts(jsSources, htmlSources);
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  Object.keys(counts).sort().forEach(function (f) {
    var n = counts[f];
    var listed = has(baseline, f);
    var b = listed ? baseline[f] : 0;
    if (listed && b === 0) problems.push(f + ': INLINE_STYLE_BASELINE entry is 0 - delete the entry');
    else if (n > b && !listed) problems.push(f + ': ' + n + ' inline style= attribute(s) and no INLINE_STYLE_BASELINE entry - use a CSS class (style.css)');
    else if (n > b) problems.push(f + ': inline styles raised from ' + b + ' to ' + n + ' - use a CSS class (style.css), or a custom property set with el.style.setProperty');
    else if (n < b) problems.push(f + ': ' + n + ' inline styles, baseline ' + b + ' - ' + (n === 0 ? 'delete the INLINE_STYLE_BASELINE entry' : 'lower INLINE_STYLE_BASELINE to ' + n));
  });
  Object.keys(baseline).sort().forEach(function (f) {
    if (!has(counts, f)) problems.push(f + ': INLINE_STYLE_BASELINE entry for a file that no longer exists - delete it');
  });
  return problems;
}

// returns: [ { file, line }, ... ]
function lintStyleSetAttribute(jsSources) {
  var out = [];
  var re = /setAttribute\s*\(\s*(["'`])style\1/i;
  Object.keys(jsSources || {}).sort().forEach(function (f) {
    _vendorStripJsComments(jsSources[f]).forEach(function (line, i) {
      if (re.test(line)) out.push({ file: 'js/' + f, line: i + 1 });
    });
  });
  return out;
}
