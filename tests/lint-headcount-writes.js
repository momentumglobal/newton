// tests/lint-headcount-writes.js — N-306 (HC-1) guard: RoleHeadcount is
// written only through the api.js headcount helpers.
//
// createHeadcount / updateHeadcount / cancelHeadcount (api.js) each end in
// syncRoleOpenDate(), the one place Roles.OpenDate is maintained (headcount
// model rule 3: Roles.OpenDate = earliest headcount OpenDate). A raw
// createItem / updateItem / deleteItem on 'RoleHeadcount' anywhere else would
// skip that sync and let Roles.OpenDate drift silently — the stuck-in-stage
// flag, the no-activity check and timeline back-dating all read it.
//
// Violation: a createItem( / updateItem( / deleteItem( call whose first
// argument is the string 'RoleHeadcount' (any quote style), in any js/ file
// except api.js. Comments are not stripped — a commented-out raw write is
// still worth a look. Reads (getItems) are not flagged.
//
// Pure function over data. tests/run.js passes ALL_SOURCES; the assertion
// skips when it is undefined (browser harness, no filesystem).

var _HEADCOUNT_WRITE_RE = /\b(createItem|updateItem|deleteItem)\s*\(\s*(['"`])RoleHeadcount\2/;

function lintHeadcountWrites(sources) {
  var out = [];
  Object.keys(sources || {}).sort().forEach(function (file) {
    if (file === 'api.js') return;
    String(sources[file]).split('\n').forEach(function (text, i) {
      if (_HEADCOUNT_WRITE_RE.test(text)) out.push({ file: file, line: i + 1, text: text.trim() });
    });
  });
  return out;
}