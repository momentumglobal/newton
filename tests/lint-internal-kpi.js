// tests/lint-internal-kpi.js — N-333 guard: every client-KPI consumer filters
// the internal project.
//
// The Momentum-internal project (CONFIG.PROJECT_TYPE_INTERNAL) is excluded
// from every company aggregate, learned benchmark and RAG through ONE shared
// filter, excludeInternalProjectData() (utils.js) — or, where only the
// Projects list is involved, isInternalProject(). A new KPI page that forgets
// the call silently counts Momentum's own hiring as client work, and nothing
// else would notice. This turns that into a build failure.
//
// Each INTERNAL_KPI_CONSUMERS entry names a function declaration in a js/
// file; its body must contain `<call>(`. An entry that no longer matches
// exactly one declaration (renamed, moved, deleted, duplicated) is itself
// reported, so the list can't go stale. A NEW client-KPI consumer must be
// added here (Readme → Coding Conventions → Internal project).
//
// Pure function over data. tests/run.js passes ALL_SOURCES; the assertion
// skips when it is undefined (browser harness, no filesystem).

var INTERNAL_KPI_CONSUMERS = [
  { file: 'dashboard-company.js',        fn: 'renderCompanyDashboard',         call: 'excludeInternalProjectData' },
  { file: 'report-builder.js',           fn: 'rbFetchData',                    call: 'excludeInternalProjectData' },
  { file: 'dashboard-project.js',        fn: 'renderProjectDashboard',         call: 'excludeInternalProjectData' },
  { file: 'dashboard-project-panels.js', fn: 'renderRoleAnalyticsPanel',       call: 'excludeInternalProjectData' },
  { file: 'analytics-pages.js',          fn: 'renderScorecardsPage',           call: 'excludeInternalProjectData' },
  { file: 'mobile-scorecards.js',        fn: 'mobileRenderScorecards',         call: 'excludeInternalProjectData' },
  { file: 'placement-analytics.js',      fn: 'renderPlacementAnalytics',       call: 'excludeInternalProjectData' },
  { file: 'mobile-analytics.js',         fn: 'mobileRenderPlacementAnalytics', call: 'excludeInternalProjectData' },
  { file: 'cc-pages.js',                 fn: 'renderCCOverview',               call: 'excludeInternalProjectData' },
  { file: 'cc-pages.js',                 fn: 'renderHealthDetail',             call: 'excludeInternalProjectData' },
  { file: 'cc-pages.js',                 fn: '_ccHealthCardsHTML',             call: 'scorecardCustomers' },   // N-391
  { file: 'analytics.js',                fn: 'scorecardCustomers',             call: 'isKpiExcludedProject' }, // N-391
  { file: 'home-banner.js',              fn: 'refreshCCBanner',                call: 'excludeInternalProjectData' },
  { file: 'admin.js',                    fn: 'writeSnapshotsNow',              call: 'isKpiExcludedProject' },
  { file: 'api-orgchart.js',             fn: 'getProjectsByCSD',               call: 'isInternalProject' },
  { file: 'org-chart.js',                fn: 'showPlaceholderForm',            call: 'isInternalProject' },
];

// Index just past a quoted string starting at i (quote char q).
function _kpiSkipQuoted(code, i, q) {
  var j = i + 1;
  while (j < code.length) {
    if (code[j] === '\\') { j += 2; continue; }
    if (code[j] === q || code[j] === '\n') return j + 1;
    j++;
  }
  return j;
}

// Index just past a template literal starting at i, honouring ${ … } nesting.
function _kpiSkipTemplate(code, i) {
  var j = i + 1;
  while (j < code.length) {
    if (code[j] === '\\') { j += 2; continue; }
    if (code[j] === '`') return j + 1;
    if (code[j] === '$' && code[j + 1] === '{') {
      var end = _kpiMatchClose(code, j + 1, '{', '}');
      if (end === -1) return code.length;
      j = end + 1;
      continue;
    }
    j++;
  }
  return j;
}

// Index of the bracket closing the one at `start` (code[start] === open), or
// -1. Skips comments, quoted strings and template literals.
function _kpiMatchClose(code, start, open, close) {
  var depth = 0;
  var i = start;
  while (i < code.length) {
    var c = code[i];
    var n = code[i + 1];
    if (c === '/' && n === '/') { i = code.indexOf('\n', i); if (i === -1) return -1; continue; }
    if (c === '/' && n === '*') { i = code.indexOf('*/', i + 2); if (i === -1) return -1; i += 2; continue; }
    if (c === '\'' || c === '"') { i = _kpiSkipQuoted(code, i, c); continue; }
    if (c === '`') { i = _kpiSkipTemplate(code, i); continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

// Bodies of every `[async] function <name>(…) { … }` declaration in `code`.
// A body that can't be delimited comes back as null.
function _kpiFunctionBodies(code, name) {
  var re = new RegExp('(^|[^\\w$.])(?:async\\s+)?function\\s+' + name.replace(/\$/g, '\\$') + '\\s*\\(', 'g');
  var out = [];
  var m;
  while ((m = re.exec(code)) !== null) {
    var paren = m.index + m[0].length - 1;
    var paramsEnd = _kpiMatchClose(code, paren, '(', ')');
    var brace = paramsEnd === -1 ? -1 : code.indexOf('{', paramsEnd);
    var end = brace === -1 ? -1 : _kpiMatchClose(code, brace, '{', '}');
    out.push(end === -1 ? null : code.slice(brace, end + 1));
  }
  return out;
}

// sources: { 'file.js': text }. Returns [{ file, fn, problem }] — empty when clean.
function lintInternalKpiConsumers(sources, consumers) {
  var out = [];
  (consumers || []).forEach(function (c) {
    var code = (sources || {})[c.file];
    if (typeof code !== 'string') {
      out.push({ file: c.file, fn: c.fn, problem: 'file not found' });
      return;
    }
    var bodies = _kpiFunctionBodies(code, c.fn);
    if (bodies.length !== 1) {
      out.push({ file: c.file, fn: c.fn, problem: 'matched ' + bodies.length + ' function declarations (expected exactly 1)' });
      return;
    }
    if (bodies[0] === null) {
      out.push({ file: c.file, fn: c.fn, problem: 'function body could not be delimited' });
      return;
    }
    if (bodies[0].indexOf(c.call + '(') === -1) {
      out.push({ file: c.file, fn: c.fn, problem: 'does not call ' + c.call + '()' });
    }
  });
  return out;
}