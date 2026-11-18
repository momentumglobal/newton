// tests/lint-load-lists.js - R3-1 (N-470) load-list parity guard.
//
// Every file split touches up to six lists: each shell's <script> tags, tests/run.js
// SOURCE_FILES, tests/index.html, the Readme File Structure / Script Load Order
// (lint-readme-files.js) and CONFIG.MCP.scripts. Only the Readme list was linted, so a split
// file forgotten in a shell, a test list or the MCP list failed silently. Four checks:
//
//   1 sync          the js/ files in run.js SOURCE_FILES and the ../js/ tags in tests/index.html
//                   are the same set (LOAD_LISTS_INDEX_ONLY names the one exemption).
//   2 listed-loaded every file in either test list is loaded by at least one shell.
//   3 exists        every first-party script a shell loads, and every CONFIG.MCP.scripts entry,
//                   exists on disk.
//   4 shell-only    the shell-loaded first-party scripts that are in NEITHER test list (page and
//                   DOM code that is not unit-loaded) must EQUAL LOAD_LISTS_SHELL_ONLY. A new
//                   file therefore forces a decision: add it to run.js + tests/index.html, or add
//                   it to the baseline (say why in the spec). Same ratchet shape as
//                   lint-inline-styles.js: a baseline entry that is now tested, no longer loaded
//                   by a shell, or gone from disk fails too.
//
// "Shell" = every root *.html (pages, Readme, guides, redirect). js/vendor/ is ignored.
//
//   lintLoadLists(data, config)
//     data    { html: ALL_HTML, runFiles: TEST_RUN_FILES, indexHtml: TEST_INDEX_HTML,
//               mcpScripts: CONFIG.MCP.scripts, files: ROOT_FILE_SET }
//     config  optional { shellOnly: [...], indexOnly: { 'js/x.js': 'reason' } }
//
// Pure function over data. tests/run.js supplies it; the assertions skip when undefined
// (the browser harness has no filesystem). Reuses _vendorStripHtmlComments from lint-vendor.js
// (loads earlier).

// In tests/index.html but not in run.js SOURCE_FILES, with the reason.
var LOAD_LISTS_INDEX_ONLY = {
  'js/theme-init.js': 'the browser harness applies the theme before it renders; the Node runner has no DOM',
};

// Shell-loaded first-party scripts that neither test list loads (R3-1 baseline, 18 Nov 2026).
var LOAD_LISTS_SHELL_ONLY = [
  'js/admin-page.js',
  'js/admin.js',
  'js/api-briefing.js',
  'js/api-checklists.js',
  'js/api-coe.js',
  'js/api-engagement.js',
  'js/api-home.js',
  'js/api-lci.js',
  'js/api-market-report.js',
  'js/api-misc.js',
  'js/api-orgchart.js',
  'js/api-people-forms.js',
  'js/api-starter-folders.js',
  'js/app.js',
  'js/auth.js',
  'js/briefing-pack.js',
  'js/bulk-activity.js',
  'js/cc-app.js',
  'js/cc-claude.js',
  'js/cc-nav.js',
  'js/cc-pages.js',
  'js/cc-router.js',
  'js/checklist-admin.js',
  'js/checklists.js',
  'js/command-bar.js',
  'js/dashboard-company.js',
  'js/dashboard-project-panels.js',
  'js/dashboard-project.js',
  'js/diag-buffer.js',
  'js/diagnostics.js',
  'js/engagement-forms.js',
  'js/engagement-pages.js',
  'js/forms-placement.js',
  'js/forms-role.js',
  'js/forms-weekly.js',
  'js/forms.js',
  'js/frame-guard.js',
  'js/guide-search.js',
  'js/home-banner.js',
  'js/home.js',
  'js/lci-editor.js',
  'js/lci-excel.js',
  'js/lci-import.js',
  'js/lci-leadmagnet.js',
  'js/lci-link.js',
  'js/lci-pages.js',
  'js/lci-pptx.js',
  'js/lci-report.js',
  'js/lci-sections.js',
  'js/lci-summary.js',
  'js/mobile-analytics.js',
  'js/mobile-app.js',
  'js/mobile-flag.js',
  'js/mobile-home.js',
  'js/mobile-pages.js',
  'js/mobile-people.js',
  'js/mobile-reporting-ext.js',
  'js/mobile-roleform.js',
  'js/mobile-sales.js',
  'js/mobile-scorecards.js',
  'js/mr-app.js',
  'js/mr-nav.js',
  'js/mr-router.js',
  'js/my-momentum-app.js',
  'js/my-momentum-nav.js',
  'js/my-momentum-scorecard.js',
  'js/nav-core.js',
  'js/nav.js',
  'js/notifications.js',
  'js/org-chart.js',
  'js/os-admin.js',
  'js/pages.js',
  'js/pdp-admin.js',
  'js/pdp-cycle-admin.js',
  'js/pdp-setup.js',
  'js/pdp-template-editor.js',
  'js/people-app.js',
  'js/people-dashboard.js',
  'js/people-forms.js',
  'js/people-gantt.js',
  'js/people-invoices.js',
  'js/people-nav.js',
  'js/people-payroll.js',
  'js/people-router.js',
  'js/people-tracker.js',
  'js/placement-analytics.js',
  'js/project-page.js',
  'js/readme-page.js',
  'js/redirect-bridge.js',
  'js/rejection-engine.js',
  'js/report-builder.js',
  'js/revenue-chart.js',
  'js/role-page.js',
  'js/router.js',
  'js/sales-app.js',
  'js/sales-nav.js',
  'js/sales-pages.js',
  'js/sales-router.js',
  'js/seasonal-fx.js',
  'js/sla-admin.js',
  'js/sla-engine.js',
  'js/sla-targets.js',
  'js/starter-folders.js',
  'js/survey-app.js',
  'js/survey-router.js',
  'js/survey-widget.js',
  'js/sw-register.js',
];

function _llScriptSrcs(html, prefixRe) {
  var text = _vendorStripHtmlComments(html);
  var re = /<script\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;
  var out = [];
  var m;
  while ((m = re.exec(text)) !== null) {
    var src = m[2].replace(prefixRe || /^$/, '');
    if (/^js\//.test(src) && src.indexOf('js/vendor/') !== 0) out.push(src);
  }
  return out;
}

function lintLoadLists(data, config) {
  var cfg = config || {};
  var indexOnly = cfg.indexOnly || LOAD_LISTS_INDEX_ONLY;
  var shellOnlyBase = cfg.shellOnly || LOAD_LISTS_SHELL_ONLY;
  var out = [];
  var files = {};
  (data.files || []).forEach(function (f) { files[f] = true; });

  var loaded = {};   // 'js/x.js' -> [shell names]
  Object.keys(data.html).sort().forEach(function (page) {
    _llScriptSrcs(data.html[page]).forEach(function (src) { (loaded[src] = loaded[src] || []).push(page); });
  });

  var run = {};
  (data.runFiles || []).forEach(function (f) { if (f.indexOf('js/') === 0) run[f] = true; });
  var idx = {};
  _llScriptSrcs(data.indexHtml || '', /^\.\.\//).forEach(function (f) { idx[f] = true; });

  Object.keys(run).sort().forEach(function (f) {
    if (!idx[f]) out.push('tests/run.js SOURCE_FILES lists ' + f + ' but tests/index.html does not load it');
  });
  Object.keys(idx).sort().forEach(function (f) {
    if (!run[f] && !indexOnly[f]) out.push('tests/index.html loads ' + f + ' but tests/run.js SOURCE_FILES does not list it');
  });
  Object.keys(indexOnly).forEach(function (f) {
    if (!idx[f] || run[f]) out.push('LOAD_LISTS_INDEX_ONLY names ' + f + ', which is no longer index.html-only - delete the entry');
  });

  var listed = {};
  Object.keys(run).concat(Object.keys(idx)).forEach(function (f) { listed[f] = true; });
  Object.keys(listed).sort().forEach(function (f) {
    if (!loaded[f]) out.push(f + ' is in a test list but no shell loads it');
  });

  Object.keys(loaded).sort().forEach(function (f) {
    if (!files[f]) out.push(loaded[f][0] + ' loads ' + f + ', which does not exist');
  });
  (data.mcpScripts || []).forEach(function (f) {
    if (!files[f]) out.push('CONFIG.MCP.scripts names ' + f + ', which does not exist');
  });

  var baseSet = {};
  shellOnlyBase.forEach(function (f) { baseSet[f] = true; });
  var current = {};
  Object.keys(loaded).sort().forEach(function (f) {
    if (run[f] || idx[f]) return;
    current[f] = true;
    if (!baseSet[f]) out.push(f + ' is loaded by ' + loaded[f][0] + ' but is in neither test list and not in LOAD_LISTS_SHELL_ONLY - add it to tests/run.js SOURCE_FILES + tests/index.html, or add it to the baseline and say why in the spec');
  });
  shellOnlyBase.forEach(function (f) {
    if (current[f]) return;
    var why = !files[f] ? 'is gone from disk' : (run[f] || idx[f]) ? 'is now in a test list' : 'is no longer loaded by any shell';
    out.push('LOAD_LISTS_SHELL_ONLY names ' + f + ', which ' + why + ' - delete the entry');
  });
  return out;
}