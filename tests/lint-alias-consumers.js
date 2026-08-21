// tests/lint-alias-consumers.js — N-175 alias-hygiene guard (F-11b).
//
// FIELD_ALIASES (api.js) maps each list's internal SharePoint column name to
// the display name Newton's code actually reads/writes. An alias entry with
// zero consumers is dead weight at best (the class N-076 first found by
// hand) and an active trap at worst — nothing stops the display name from
// silently drifting out of sync with the code that's supposed to use it.
// This is the automated form of the search N-175 did by hand: for every
// non-empty FIELD_ALIASES entry, confirm the display name is referenced
// somewhere in js/ as either a dot-property (.Name) or bracket
// ('Name'/"Name") access.
//
// IMPORTANT — this must scan every file in js/, never a hand-picked subset.
// N-175's own first draft got this wrong: it grepped 4 staged files instead
// of the full set and reported two live fields (WeeklyActivity.Yeare and
// .InterviewTwoPlus) as dead. Always pass tests/run.js's ALL_SOURCES, which
// is built from fs.readdirSync(JS_DIR) — never a manually assembled map.
//
// This is text matching, not semantic analysis — same precision ceiling as
// lint-role-copy-fields.js. A display name that collides with an unrelated
// property on some other object shape reads as "has consumers" even when
// the aliased field itself is dead (a false negative on "zero consumers" —
// see utils.js's computeMonthlyRows()-derived Year/Month rows, which collide
// textually with the Yeare→Year alias but are unrelated to it). The checker
// narrows where to look; a human still has to read the matched lines before
// trusting a "has consumers" pass on a generic, common-word display name.

// Returns true if `display` is referenced as a dot-property (.Name) or
// bracket access ('Name'/"Name") anywhere in `codeLines` (comment-stripped
// source lines, one string per source line — see _stripComments in
// lint-dates.js, loaded earlier in SOURCE_FILES so it's already in scope).
function _displayNameReferenced(codeLines, display) {
  var dotRe = new RegExp('\\.' + display + '\\b');
  var bracketRe = new RegExp('\\[\\s*[\'"]' + display + '[\'"]\\s*\\]');
  for (var i = 0; i < codeLines.length; i++) {
    if (dotRe.test(codeLines[i]) || bracketRe.test(codeLines[i])) return true;
  }
  return false;
}

// sources: { 'utils.js': '<source text>', ... } — tests/run.js's ALL_SOURCES,
//          built from every file in js/. Never pass a partial file set.
// fieldAliases: FIELD_ALIASES (api.js)
// Returns: [ { list, internal, display }, ... ] — empty when every non-empty
// alias entry has at least one consumer.
function checkAliasConsumers(sources, fieldAliases) {
  if (!sources) throw new Error('sources not provided');
  if (!fieldAliases) throw new Error('fieldAliases not provided');

  // Comment-strip every file once, up front.
  var strippedByFile = {};
  var files = Object.keys(sources);
  for (var f = 0; f < files.length; f++) {
    strippedByFile[files[f]] = _stripComments(sources[files[f]]);
  }

  var flagged = [];
  var lists = Object.keys(fieldAliases).sort();
  for (var l = 0; l < lists.length; l++) {
    var list = lists[l];
    var aliases = fieldAliases[list];
    if (!aliases) continue;
    var internals = Object.keys(aliases).sort();
    for (var a = 0; a < internals.length; a++) {
      var internal = internals[a];
      var display = aliases[internal];
      var found = false;
      for (var ff = 0; ff < files.length && !found; ff++) {
        if (_displayNameReferenced(strippedByFile[files[ff]], display)) found = true;
      }
      if (!found) {
        flagged.push({ list: list, internal: internal, display: display });
      }
    }
  }
  return flagged;
}
