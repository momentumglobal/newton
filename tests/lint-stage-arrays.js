// tests/lint-stage-arrays.js — N-305 (HC-0) guard: no page file redeclares a
// role-stage array.
//
// Every role-stage list lives in js/config.js (CONFIG.ROLE_STAGES,
// ROLE_STAGE_TERMINAL, ROLE_STAGES_PARKED, ROLE_STAGES_BRANCH,
// ROLE_STAGES_ACTIVITY_EXCLUDED) or is derived from them
// (utils.js:isOpenPipelineStage). Before N-305 the same 4-stage set was
// hand-copied ~20 times across 9 files, which would have made N-306's
// Hired → Closed rename a hunt (N-306 was a config edit as a result). This
// turns "use the CONFIG sets" into a build failure instead of a convention.
//
// Violation: an array literal (may span lines; whitespace, commas and
// comments allowed) whose elements are ONLY string literals, at least 2 of
// them, every one a stage name (vocab). Mixed arrays such as
// dashboard-project-panels.js's funnel LABELS ('Outreach' … 'Hired') are not
// stage sets and are not flagged. A single-element ['Hired'] is not flagged.
//
// Scope: every js/ file except config.js, plus inline <script> bodies in root
// *.html. STAGE_ARRAY_ALLOW names the documented exceptions by declaration; an
// allow entry that no longer matches exactly one array is itself reported, so
// the list can't go stale.
//
// Pure function over data. tests/run.js passes ALL_SOURCES / ALL_HTML; the
// assertion skips when they are undefined (browser harness, no filesystem).

var STAGE_ARRAY_ALLOW = [
  // Snapshots contract list (N-086 flow mirrors it) — values deliberately
  // left as-is; pinned set-equal to the complement of isOpenPipelineStage().
  { file: 'analytics.js', name: 'ACTIVE_STAGES' },
];

// Stage names the lint recognises: the live enum, the retired stages still in
// CONFIG.ROLE_STAGE_LEGACY_ALIASES ('Hired', N-306) and the legacy 'Placed'.
// Without the aliases, 'Hired' would drop out of the vocabulary at N-306 and
// a hand-copied pre-N-306 set would no longer be caught.
function stageArrayVocab(cfg) {
  var out = [];
  (cfg.ROLE_STAGES || [])
    .concat(Object.keys(cfg.ROLE_STAGE_LEGACY_ALIASES || {}))
    .concat(['Placed']).forEach(function (s) {
    if (out.indexOf(s) === -1) out.push(s);
  });
  return out;
}

var _STAGE_ARRAY_RE = new RegExp(
  '\\[((?:\\s|,|\\/\\/[^\\n]*\\n|\\/\\*[\\s\\S]*?\\*\\/|\'[^\'\\\\\\n]*\'|"[^"\\\\\\n]*"|`[^`\\\\$]*`)*)\\]',
  'g'
);
var _STAGE_STRING_RE = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)`/g;

// Returns [{ file, line, text, name }] for every stage-only array in `code`.
// `lineOffset` shifts line numbers (inline <script> bodies inside an HTML file).
function _stageArraysIn(code, vocab, lineOffset) {
  var found = [];
  var m;
  _STAGE_ARRAY_RE.lastIndex = 0;
  while ((m = _STAGE_ARRAY_RE.exec(code)) !== null) {
    var body = m[1].replace(/\/\/[^\n]*\n|\/\*[\s\S]*?\*\//g, '');
    var strings = [];
    var s;
    _STAGE_STRING_RE.lastIndex = 0;
    while ((s = _STAGE_STRING_RE.exec(body)) !== null) {
      strings.push(s[1] !== undefined ? s[1] : (s[2] !== undefined ? s[2] : s[3]));
    }
    if (strings.length < 2) continue;
    if (!strings.every(function (v) { return vocab.indexOf(v) !== -1; })) continue;
    var before = code.slice(0, m.index);
    var lineStart = before.lastIndexOf('\n') + 1;
    var lineEnd = code.indexOf('\n', m.index);
    var decl = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(code.slice(lineStart, m.index));
    found.push({
      line: before.split('\n').length + (lineOffset || 0),
      text: code.slice(lineStart, lineEnd === -1 ? code.length : lineEnd).trim(),
      name: decl ? decl[1] : null,
    });
  }
  return found;
}

// sources: { 'file.js': text } (js/ files); html: { 'page.html': text }.
// Returns [{ file, line, text }] — empty when clean.
function lintStageArrays(sources, html, vocab, allow) {
  var hits = [];
  Object.keys(sources || {}).sort().forEach(function (file) {
    if (file === 'config.js') return;
    _stageArraysIn(sources[file], vocab, 0).forEach(function (h) {
      hits.push({ file: file, line: h.line, text: h.text, name: h.name });
    });
  });
  Object.keys(html || {}).sort().forEach(function (file) {
    var text = html[file];
    var re = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
    var m;
    while ((m = re.exec(text)) !== null) {
      var bodyStart = m.index + m[0].indexOf('>') + 1;
      var offset = text.slice(0, bodyStart).split('\n').length - 1;
      _stageArraysIn(m[1], vocab, offset).forEach(function (h) {
        hits.push({ file: file, line: h.line, text: h.text, name: h.name });
      });
    }
  });
  var out = [];
  var allowHits = (allow || []).map(function () { return 0; });
  hits.forEach(function (h) {
    var idx = -1;
    (allow || []).forEach(function (a, i) {
      if (idx === -1 && a.file === h.file && a.name === h.name) idx = i;
    });
    if (idx === -1) out.push({ file: h.file, line: h.line, text: h.text });
    else allowHits[idx]++;
  });
  (allow || []).forEach(function (a, i) {
    if (allowHits[i] !== 1) {
      out.push({ file: a.file, line: 0, text: 'STAGE_ARRAY_ALLOW entry ' + a.name + ' matched ' + allowHits[i] + ' arrays (expected exactly 1)' });
    }
  });
  return out;
}