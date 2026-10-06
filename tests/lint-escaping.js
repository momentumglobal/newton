// tests/lint-escaping.js — S-8 regression guard (N-283).
//
// Fails the build if a SharePoint text value is rendered into an HTML template
// literal without an escaping wrapper. Audit S-8 found ~8 sites; N-283 fixed
// them and this file stops the pattern coming back.
//
// WHAT IS FLAGGED — inside a backtick template literal that contains an HTML
// tag (/<[a-zA-Z]/ in its static text, or that is nested in such a template's
// unescaped interpolation), an interpolation `${expr}` that is a NAKED FIELD
// READ: an identifier/property chain (optionally `?.` or `[...]`), optionally
// followed by a literal fallback (`|| '—'`, `?? ''`, `|| 0`), whose final
// property starts with an uppercase letter (the SharePoint field convention:
// RoleTitle, Notes, CustomerName). Ternaries, comparisons and calls are not
// naked reads and are not flagged — that keeps the false-positive set small.
//
// WHAT COUNTS AS ESCAPED — an interpolation anywhere inside the parentheses of
// an esc*( / _esc*( call, including any template literal nested in that call:
//     escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)
//
// The parser is real (tracks templates across lines, nested `${ `...` }`,
// strings, comments, regex literals) — a line-based regex misses a template
// whose tag and interpolation sit on different lines (engagement-pages.js).
//
// OPT-OUT — a trailing `// ...` comment cannot be used: inside a template it
// would be OUTPUT TEXT. Put a block comment inside the interpolation instead,
// reason mandatory (a bare `/* esc-lint-ok */` does not suppress):
//     ${n.Tone /* esc-lint-ok: set by code, never user input */ || 'attention'}
//
// ALLOWLIST — ESC_LINT_SAFE_FIELDS is for NUMERIC / derived fields only. A
// field on it that is later repurposed to carry text is a silent hole, so every
// new entry needs a reason. Never add Title, Notes, Stage, Status, Reason,
// Detail, CandidateName, CustomerName, RoleTitle, Location, TalentPartner,
// CreatedByEmail, QuestionType or any *Currency field.
//
// KNOWN LIMITS — templates only. NOT seen: string concatenation
// ('<td>' + x.Name + '</td>'), innerHTML += with concatenated strings, a plain
// variable that was read from a field (${name}), escJsAttr omissions in inline
// onclick= handlers, and inline <script> blocks in *.html. Scope is js/ only.
// Text matching, not data-flow analysis.

var ESC_LINT_SAFE_FIELDS = [
  // measure / count fields (numbers)
  'id', 'Outreach', 'Responses', 'Screened', 'Submitted', 'Interview1',
  'Interview2Plus', 'FinalInterview', 'Offers', 'Hires', 'Year', 'WeekNumber',
  'OpenRoles', 'AvgDaysOpen', 'PlacementsInPeriod', 'FlaggedCount',
  // sales / forecast numbers
  'ForecastedHeadcount', 'ForecastMonthlyRevenuePerHead', 'RetainerFee',
  'PlacementFee',
  // CoE plan numbers
  'RecruitmentWeeks', 'NoticeWeeks', 'OnboardingWeeks',
  // LCI model numbers
  'AnnualSalary', 'NoticeMonths', 'NoticeMonthsOverride', 'Quantity',
  'SalaryMonths', 'OfficeCostPerHead', 'EoRFeePerHead', 'FXRateLocalToDisplay',
  'FXRateToGBP', 'HorizonMonths',
  // CONFIG constants (numbers), not SharePoint data
  'MEASURE_CH', 'SWIRL_OPACITY', 'HORIZON_MIN', 'HORIZON_MAX'
];

var _ESC_FN_RE = /^_?esc[A-Za-z]*$/;
var _ESC_NAKED_RE = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\]]*\])*\s*(?:(?:\|\||\?\?)\s*(?:'[^']*'|"[^"]*"|\d+))?$/;
var _ESC_LAST_PROP_RE = /\??\.([A-Za-z_$][\w$]*)\s*(?:(?:\|\||\?\?)\s*(?:'[^']*'|"[^"]*"|\d+))?$/;
var _ESC_OPTOUT_RE = /\/\*\s*esc-lint-ok\s*:\s*\S+[\s\S]*?\*\//;

// Returns [ { file, line, expr } ] — empty when every naked field read in an
// HTML template is wrapped, allowlisted or opted out.
// sources: { 'file.js': '<source text>' } — tests/run.js's ALL_SOURCES (all of js/).
function lintEscaping(sources) {
  if (!sources) throw new Error('sources not provided');
  var flagged = [];
  var files = Object.keys(sources).sort();
  for (var f = 0; f < files.length; f++) {
    _escLintFile(files[f], String(sources[files[f]]), flagged);
  }
  return flagged;
}

function _escLintFile(file, s, flagged) {
  var n = s.length;
  var line = 1;
  var roots = [];

  function isIdent(c) { return /[\w$]/.test(c); }

  // Scan code from i until the matching close char for the current context
  // (`}` for an interpolation, end-of-file for the top level). Templates found
  // are pushed onto `sink`. escCount > 0 means we are inside an esc*( call.
  function scanCode(i, inInterp, escCount, sink) {
    var parens = [];          // stack of booleans: was this '(' an esc call?
    var braceDepth = 0;
    var lastSig = '';         // last significant char, for regex-literal detection
    while (i < n) {
      var c = s[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') i++; continue; }
      if (c === '/' && s[i + 1] === '*') {
        var end = s.indexOf('*/', i + 2); end = end < 0 ? n : end + 2;
        for (var k = i; k < end; k++) if (s[k] === '\n') line++;
        i = end; continue;
      }
      if (c === '"' || c === "'") {
        i++;
        while (i < n && s[i] !== c && s[i] !== '\n') { if (s[i] === '\\') i++; i++; }
        i++; lastSig = 'x'; continue;
      }
      if (c === '`') {
        var r = scanTemplate(i + 1, escCount + parens.filter(Boolean).length > 0);
        sink.push(r.node); i = r.end; lastSig = 'x'; continue;
      }
      if (c === '/' && (lastSig === '' || '(,=:[!&|?{};'.indexOf(lastSig) >= 0)) {
        i++; var inClass = false;               // regex literal
        while (i < n && s[i] !== '\n') {
          if (s[i] === '\\') { i += 2; continue; }
          if (s[i] === '[') inClass = true; else if (s[i] === ']') inClass = false;
          else if (s[i] === '/' && !inClass) break;
          i++;
        }
        i++; lastSig = 'x'; continue;
      }
      if (c === '(') {
        var j = i - 1; while (j >= 0 && /\s/.test(s[j])) j--;
        var e = j; while (j >= 0 && isIdent(s[j])) j--;
        parens.push(_ESC_FN_RE.test(s.slice(j + 1, e + 1)));
      } else if (c === ')') { parens.pop(); }
      else if (c === '{') { braceDepth++; }
      else if (c === '}') {
        if (inInterp && braceDepth === 0) return i;      // end of the interpolation
        braceDepth--;
      }
      lastSig = c; i++;
    }
    return i;
  }

  // i is just past the opening backtick.
  function scanTemplate(i, escaped) {
    var node = { statik: '', exprs: [], children: [], escaped: escaped };
    while (i < n) {
      var c = s[i];
      if (c === '\\') { node.statik += s.slice(i, i + 2); i += 2; continue; }
      if (c === '`') return { end: i + 1, node: node };
      if (c === '$' && s[i + 1] === '{') {
        var startLine = line, start = i + 2;
        var kids = [];
        var endIdx = scanCode(start, true, escaped ? 1 : 0, kids);
        node.exprs.push({ text: s.slice(start, endIdx), line: startLine, kids: kids });
        i = endIdx + 1; continue;
      }
      if (c === '\n') line++;
      node.statik += c; i++;
    }
    return { end: i, node: node };
  }

  scanCode(0, false, 0, roots);

  // Escaped-ness: a template reached through an esc*( call is marked escaped
  // at creation (scanCode passes the esc paren depth down), so here we only
  // need html inheritance from the enclosing template.
  function visit(node, parentHtml) {
    var html = parentHtml || /<[a-zA-Z]/.test(node.statik);
    node.exprs.forEach(function (ex) {
      var raw = ex.text;
      var optedOut = _ESC_OPTOUT_RE.test(raw);
      var code = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (html && !node.escaped && !optedOut && _ESC_NAKED_RE.test(code)) {
        var m = _ESC_LAST_PROP_RE.exec(code);
        var prop = m ? m[1] : null;
        var isField = prop && /^[A-Z]/.test(prop) || prop === 'id';
        if (isField && ESC_LINT_SAFE_FIELDS.indexOf(prop) < 0) {
          flagged.push({ file: file, line: ex.line, expr: code });
        }
      }
      ex.kids.forEach(function (k) { visit(k, html); });
    });
  }
  roots.forEach(function (r) { visit(r, false); });
}
// ── N-284 (S-14): OData filter guard ─────────────────────────────────────
// Flags `eq|ne|ge|le|gt|lt '${expr}'` in js/ where expr does not start with
// odataStr( — i.e. a string value interpolated into a $filter unescaped.
// Single-line text scan (filters here are single-line template fragments);
// comments are ignored; a line may opt out with `// odata-lint-ok: <reason>`
// (reason mandatory). Numeric clauses (`eq ${id}`, no quotes) are out of scope.
// Lives in this file because it is the same kind of source-text guard.
function lintOdataFilters(sources) {
  if (!sources) throw new Error('sources not provided');
  var re = /\b(?:eq|ne|ge|le|gt|lt) '\$\{(?!\s*odataStr\()/;
  var optout = /\/\/\s*odata-lint-ok\s*:\s*\S+/;
  var flagged = [];
  Object.keys(sources).sort().forEach(function (file) {
    var raw = String(sources[file]).split('\n');
    var code = _stripComments(sources[file]);          // from lint-dates.js
    for (var i = 0; i < code.length; i++) {
      if (re.test(code[i]) && !optout.test(raw[i] || '')) {
        flagged.push({ file: file, line: i + 1 });
      }
    }
  });
  return flagged;
}