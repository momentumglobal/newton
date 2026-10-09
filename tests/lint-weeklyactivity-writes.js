// tests/lint-weeklyactivity-writes.js — N-315 guard: WeeklyActivity rows are
// created only through api.js createWeeklyActivity().
//
// createWeeklyActivity derives a missing ProjectIDLookupId from the role,
// verifies the stored value after the create, heals a drop once and reports
// it to Diagnostics. A raw createItem('WeeklyActivity', …) anywhere else
// skips all of that — which is how mobile quick-log came to write every row
// with a blank ProjectID.
//
// Violation: a createItem( call whose first argument is the string
// 'WeeklyActivity' (any quote style), in any js/ file except api.js. Inside
// api.js, exactly one such call is allowed — the one in createWeeklyActivity —
// and the assertion counts it separately. Updates and reads are not flagged.
//
// Pure function over data. tests/run.js passes ALL_SOURCES; the assertion
// skips when it is undefined (browser harness, no filesystem).

var _WA_CREATE_RE = /\bcreateItem\s*\(\s*(['"`])WeeklyActivity\1/;

function lintWeeklyActivityCreates(sources) {
  var out = [];
  Object.keys(sources || {}).sort().forEach(function (file) {
    if (file === 'api.js') return;
    String(sources[file]).split('\n').forEach(function (text, i) {
      if (_WA_CREATE_RE.test(text)) out.push({ file: file, line: i + 1, text: text.trim() });
    });
  });
  return out;
}

// How many raw WeeklyActivity creates a source string holds (api.js: must be 1).
function countWeeklyActivityCreates(src) {
  return String(src || '').split('\n').filter(function (t) { return _WA_CREATE_RE.test(t); }).length;
}