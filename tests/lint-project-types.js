// tests/lint-project-types.js — N-362 guard: no call site compares a project
// type directly.
//
// LCI and Transformation are Projects with no dashboard (CONFIG.NO_DASHBOARD_
// PROJECT_TYPES) and Internal is excluded from company KPIs. Each is read
// through ONE helper (utils.js: isNoDashboardType / isNoDashboardProject /
// isKpiExcludedProject / isInternalProject), never compared at a call site —
// a hand-written `p.ProjectType === 'LCI'` silently misses the next type added
// to the list. This turns that into a build failure. 'CoE' / 'Embedded' checks
// are deliberately NOT covered (N-362 B-2).
//
// Flags, in every js/ file except utils.js and config.js:
//   (a) ProjectType compared (=== !== == !=, either side) to a quoted
//       'LCI' / 'Transformation' / 'Internal', CONFIG.PROJECT_TYPE_INTERNAL or
//       an element of CONFIG.NO_DASHBOARD_PROJECT_TYPES;
//   (b) a literal array holding one of those quoted types .includes()-ing a
//       ProjectType;
//   (c) any mention of NO_DASHBOARD_PROJECT_TYPES.
// StaffType 'Internal' (isInternalStaff) is a different concept and is not
// matched: every pattern is anchored on `ProjectType`.
//
// PROJECT_TYPE_LINT_ALLOW lists known exceptions, each with a reason; an entry
// that no longer matches any violation is itself reported, so the list can't
// go stale. Pure function over data. tests/run.js passes ALL_SOURCES; the
// assertion skips when it is undefined (browser harness, no filesystem).

var PROJECT_TYPE_LINT_EXEMPT = ['utils.js', 'config.js'];

var PROJECT_TYPE_LINT_ALLOW = [
  { file: 'org-chart.js', contains: "a.ProjectType !== 'LCI'",
    reason: 'LCI-only Org Chart grouping; _ocLciOnlyCustomers is deleted by N-363' },
];

// Copy of `code` with comments blanked (newlines kept, so line numbers hold).
// Quoted strings and template literals are copied verbatim.
function _ptlStripComments(code) {
  var out = '';
  var i = 0;
  while (i < code.length) {
    var c = code[i];
    var n = code[i + 1];
    if (c === '/' && n === '/') {
      var e = code.indexOf('\n', i);
      if (e === -1) e = code.length;
      out += ' '.repeat(e - i);
      i = e;
      continue;
    }
    if (c === '/' && n === '*') {
      var end = code.indexOf('*/', i + 2);
      end = end === -1 ? code.length : end + 2;
      out += code.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      var j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === c) { j++; break; }
        if (c !== '`' && code[j] === '\n') break;
        j++;
      }
      out += code.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// sources: { 'file.js': text }; allow: [{ file, contains, reason }].
// Returns [{ file, line, problem }] — empty when clean.
function lintProjectTypeCompares(sources, allow) {
  var out = [];
  var LIT = '(?:\'(?:LCI|Transformation|Internal)\'|"(?:LCI|Transformation|Internal)"|CONFIG\\.PROJECT_TYPE_INTERNAL|CONFIG\\.NO_DASHBOARD_PROJECT_TYPES\\s*\\[[^\\]]*\\])';
  var OP  = '\\s*(?:===|!==|==|!=)\\s*';
  var PT  = '[\\w$.?]*ProjectType\\b';
  var patterns = [
    new RegExp(PT + OP + LIT, 'g'),
    new RegExp(LIT + OP + PT, 'g'),
    new RegExp('\\[[^\\]]*(?:\'(?:LCI|Transformation|Internal)\'|"(?:LCI|Transformation|Internal)")[^\\]]*\\]\\.includes\\(\\s*' + PT, 'g'),
    /NO_DASHBOARD_PROJECT_TYPES/g,
  ];
  var used = (allow || []).map(function () { return 0; });
  Object.keys(sources || {}).sort().forEach(function (file) {
    if (PROJECT_TYPE_LINT_EXEMPT.indexOf(file) !== -1) return;
    var code = _ptlStripComments(sources[file]);
    var lines = code.split('\n');
    var seen = {};
    patterns.forEach(function (re) {
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(code)) !== null) {
        var line = code.slice(0, m.index).split('\n').length;
        if (seen[line]) continue;
        seen[line] = true;
        var text = lines[line - 1].trim();
        var ai = -1;
        (allow || []).forEach(function (a, k) {
          if (ai === -1 && a.file === file && text.indexOf(a.contains) !== -1) ai = k;
        });
        if (ai !== -1) { used[ai]++; continue; }
        out.push({ file: file, line: line, problem: 'compares a project type directly: ' + text.slice(0, 100) });
      }
    });
  });
  (allow || []).forEach(function (a, k) {
    if (!used[k]) out.push({ file: a.file, line: 0, problem: 'stale allowlist entry (no longer matches): ' + a.contains });
  });
  return out;
}