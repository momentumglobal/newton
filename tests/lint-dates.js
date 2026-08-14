// tests/lint-dates.js — F-12 regression guard (N-091).
//
// Fails the build if day-truncating date handling reappears in js/. This is
// the automated form of the discipline N-087 through N-090 established: a
// SharePoint date must go through a named helper, never through a raw string
// truncation, because that is what silently shifted dates across the BST
// boundary (N-077, N-081, N-129, and the bench-sync bug fixed in N-090).
//
// WHAT IS BANNED — the day-truncating suffixes only:
//     .split('T')[0]     .slice(0, 10)     .substring(0, 10)     .substr(0, 10)
// substring/substr are included deliberately: every F-12 survey grepped only
// for split/slice/toISOString, and three live sites survived in mobile-sales.js
// and sales-pages.js precisely because substring matched none of those. That
// blind spot is the reason this file exists rather than a grep in a checklist.
//
// WHAT IS NOT BANNED — bare toISOString(). A full UTC timestamp is the correct
// representation of a genuine INSTANT, and six such calls are legitimate:
// SubmittedAt (api.js, forms.js, mobile-pages.js), CreatedAt (admin.js,
// notifications.js) and benchSyncLast (people-tracker.js). Banning the call
// itself would need an allowlist; banning the suffix needs none.
//
// .slice(0, N) IN GENERAL IS NOT BANNED either — js/ has eight legitimate
// non-date slices (0,30 / 0,12 / 0,40 / 0,80 / 0,20 / 0,7 / 0,4). Only the
// (0, 10) day shape is flagged.
//
// SCOPE IS js/ ONLY. tests/ is deliberately excluded: the N-088 and N-090
// "guard the guard" assertions CALL toISOString().split('T')[0] and
// .slice(0, 10) on purpose, to prove the old patterns still skew under BST.
// Linting tests/ would fail on the very assertions that prove the fixes work.
// Do not "fix" this by widening the scope.
//
// Canonical helpers to use instead (all in utils.js):
//     spDateIn(str)      SharePoint string  -> 'YYYY-MM-DD'
//     spDateOut(date)    UTC Date           -> 'YYYY-MM-DDT12:00:00Z'
//     localDayISO(date)  today/cutoff       -> local 'YYYY-MM-DD'
//     utcDateOnly(str)   SharePoint string  -> UTC-midnight Date for arithmetic
//
// coe-plan.js is a documented local-model exception (N-089): it contains no
// banned patterns, but its coeMonday/coeWeekIndex must NOT be "migrated" to
// the UTC helpers — doing so reintroduces N-081.

var DATE_LINT_PATTERNS = [
  { name: ".split('T')[0]",    re: /\.split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/ },
  { name: '.slice(0, 10)',     re: /\.slice\(\s*0\s*,\s*10\s*\)/ },
  { name: '.substring(0, 10)', re: /\.substring\(\s*0\s*,\s*10\s*\)/ },
  { name: '.substr(0, 10)',    re: /\.substr\(\s*0\s*,\s*10\s*\)/ },
];

// A line may opt out with a trailing `// date-lint-ok: <reason>`. The reason is
// MANDATORY — a bare `// date-lint-ok` does not suppress. That is deliberate:
// an exemption should cost the person adding it a sentence explaining why the
// value being truncated is not a date, so the guard can't be switched off
// casually the first time it is inconvenient.
var DATE_LINT_OPTOUT = /\/\/\s*date-lint-ok\s*:\s*\S+/;

// Strip comments so the guard matches CODE only.
//
// This is load-bearing, not cosmetic: utils.js contains the banned text
// verbatim inside N-088's own explanatory comment, so without stripping, the
// guard would fail a clean tree on its first run — which is how a check like
// this gets disabled permanently on day one.
//
// Line-level strip with block-comment tracking and quote awareness. Full
// string-literal removal is deliberately NOT attempted: it buys little and
// risks mis-parsing a regex literal such as /^(\d{4})-(\d{2})/. The trade-off
// is that a `//` sequence inside a regex literal could truncate a line early
// (a false negative, never a false positive) — acceptable, and no such line
// exists in js/ today.
function _stripComments(source) {
  var lines = String(source).split('\n');
  var out = [];
  var inBlock = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var code = '';
    var quote = null;      // "'", '"' or '`' when inside a string
    var j = 0;

    while (j < line.length) {
      var c = line[j];
      var next = line[j + 1];

      if (inBlock) {
        if (c === '*' && next === '/') { inBlock = false; j += 2; }
        else { j++; }
        continue;
      }

      if (quote) {
        if (c === '\\') { code += c + (next || ''); j += 2; continue; }
        if (c === quote) { quote = null; }
        code += c; j++;
        continue;
      }

      if (c === "'" || c === '"' || c === '`') { quote = c; code += c; j++; continue; }
      if (c === '/' && next === '/') { break; }                  // rest of line is a comment
      if (c === '/' && next === '*') { inBlock = true; j += 2; continue; }

      code += c; j++;
    }

    out.push(code);
  }

  return out;
}

// sources: { 'utils.js': '<source text>', ... }
// returns: [ { file, line, pattern, text }, ... ] — empty array when clean.
function lintDateUsage(sources) {
  var violations = [];
  var files = Object.keys(sources).sort();

  for (var f = 0; f < files.length; f++) {
    var file = files[f];
    var rawLines  = String(sources[file]).split('\n');
    var codeLines = _stripComments(sources[file]);

    for (var i = 0; i < codeLines.length; i++) {
      if (DATE_LINT_OPTOUT.test(rawLines[i])) continue;

      for (var p = 0; p < DATE_LINT_PATTERNS.length; p++) {
        if (DATE_LINT_PATTERNS[p].re.test(codeLines[i])) {
          violations.push({
            file: file,
            line: i + 1,
            pattern: DATE_LINT_PATTERNS[p].name,
            text: rawLines[i],
          });
        }
      }
    }
  }

  return violations;
}
