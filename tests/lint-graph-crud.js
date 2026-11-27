// tests/lint-graph-crud.js - R3-1 (N-470, decision R3-D3) Graph CRUD ratchet.
//
// The layering rule is: UI files call a domain getter/writer in api.js / api-*.js, and
// only those files (and graph-client.js) call getItems / getItem / createItem /
// updateItem / deleteItem. About a hundred direct calls pre-date R2 and are accepted
// (R3-D3); this lint makes sure the count can only fall.
//
//   lintGraphCrud(sources, baseline)
//     sources   { 'admin.js': text, ... }   everything in js/   (ALL_SOURCES)
//     baseline  optional; replaces GRAPH_CRUD_BASELINE
//
// Per-file call count must EQUAL the baseline (same shape as lint-inline-styles.js):
//   higher     fails - use the domain api-*.js getter/writer (new files start at 0);
//   lower      fails - lower the baseline in the same change (delete the entry at 0);
//   no entry   fails if the file has any call; a stale entry or a 0 entry fails too.
//
// What counts: a call `getItems(`, `getItem(`, `createItem(`, `updateItem(` or `deleteItem(`
// (bare or as a method) in comment-stripped source (_vendorStripJsComments, lint-vendor.js -
// load that first). Occurrences are counted, not lines. Not counted: files named api.js,
// api-*.js and graph-client.js; a receiver of localStorage / sessionStorage (also
// window.-prefixed); `function getItems(` declarations.
//
// Pure function over text. tests/run.js supplies ALL_SOURCES; the assertion skips in the
// browser harness (no filesystem).

var GRAPH_CRUD_NAMES = ['getItems', 'getItem', 'createItem', 'updateItem', 'deleteItem'];

// Per-file direct Graph CRUD call counts (R3-1 baseline, 18 Nov 2026). Lower an entry
// (or delete it at 0) in the same change that moves calls into an api-*.js file.
var GRAPH_CRUD_BASELINE = {
  'admin.js': 19,
  'briefing-pack.js': 1,
  'cc-pages.js': 4,
  'checklists.js': 1,
  'forms-placement.js': 9,
  'forms-weekly.js': 1,
  'forms.js': 5,
  'home-banner.js': 7,
  'market-report.js': 2,
  'mobile-pages.js': 6,
  'mobile-reporting-ext.js': 2,
  'mobile-roleform.js': 1,
  'notifications.js': 7,
  'org-chart.js': 5,
  'os-admin.js': 7,
  'pages.js': 7,
  'people-forms.js': 2,
  'people-invoices.js': 1,
  'people-tracker.js': 1,
  'project-page.js': 1,
  'report-builder.js': 1,
  'role-page.js': 2,
};

function graphCrudExempt(file) {
  return /^api(-[\w-]+)?\.js$/.test(file) || file === 'graph-client.js';
}

function graphCrudCount(source) {
  var text = _vendorStripJsComments(source).join('\n');
  var re = /(^|[^\w$])(getItems|getItem|createItem|updateItem|deleteItem)\s*\(/g;
  var n = 0;
  var m;
  while ((m = re.exec(text)) !== null) {
    var before = text.slice(Math.max(0, m.index + m[1].length - 30), m.index + m[1].length);
    if (/(?:local|session)Storage\s*\.\s*$/.test(before)) continue;
    if (/function\s+$/.test(before)) continue;
    n++;
    re.lastIndex = m.index + m[0].length - 1;   // keep scanning from just before the "(" so `f(getItems(` still counts
  }
  return n;
}

function lintGraphCrud(sources, baseline) {
  var base = baseline || GRAPH_CRUD_BASELINE;
  var out = [];
  var seen = {};
  Object.keys(sources).sort().forEach(function (file) {
    if (graphCrudExempt(file)) return;
    var n = graphCrudCount(sources[file]);
    seen[file] = true;
    var want = base[file] || 0;
    if (n > want) {
      out.push('js/' + file + ': ' + n + ' direct Graph CRUD call(s)' + (base[file] === undefined ? ' and no GRAPH_CRUD_BASELINE entry (new files start at 0)' : ', baseline ' + want) +
        '. Use a getter/writer in the domain api-*.js file instead.');
    } else if (n < want) {
      out.push('js/' + file + ': ' + n + ' direct Graph CRUD call(s), baseline ' + want + '. ' +
        (n === 0 ? 'Delete the GRAPH_CRUD_BASELINE entry.' : 'Lower GRAPH_CRUD_BASELINE to ' + n + ' in the same change.'));
    }
  });
  Object.keys(base).sort().forEach(function (file) {
    if (!seen[file]) out.push('js/' + file + ': in GRAPH_CRUD_BASELINE but missing from js/ or exempt (api*.js / graph-client.js) - delete the entry');
    else if (base[file] === 0) out.push('js/' + file + ': a 0 entry in GRAPH_CRUD_BASELINE - delete it');
  });
  return out;
}