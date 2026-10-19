// tests/lint-icons.js — N-349a guard: every Lucide icon a template names must be
// in the vendored subset.
//
// js/vendor/lucide-<ver>.subset.min.js is built from js/vendor/lucide-subset-icons.txt
// (tools/build-lucide-subset.mjs) and contains ONLY those icons. An icon that is
// not in it fails SILENTLY — Lucide leaves an empty <i> and nothing logs — so this
// turns a missing name into a build failure.
//
//   lintIconSubset(htmlSources, jsSources, listText)
//     returns [ { file, line, icon, rule } ] — empty array when clean.
//
// Names are found by four rules (comments stripped first):
//   R1  data-lucide="name"                       (HTML or a JS template)
//   R2  quoted names inside data-lucide="${ ... }" (ternaries, `MAP[k] || 'bell'`);
//       operands of === / !== are comparisons, not icons, and are skipped
//   R3  icon: 'name' / icon = 'name'             (CONFIG, emptyStateBlock defaults, ...)
//   R4  the values of an object literal assigned to a name containing ICON
//       (NOTIF_ICON, TOAST_ICONS)
// A name built at runtime ('chevron-' + dir) cannot be seen: use a literal or an
// ...ICON... map. The full-name cross-check lives in `node tools/build-lucide-subset.mjs --audit`.
//
// Depends on lint-vendor.js (load it first): _vendorStripJsComments,
// _vendorStripHtmlComments, _vendorLineOf. Pure functions; tests/run.js supplies
// ALL_HTML, ALL_SOURCES and ICON_SUBSET_LIST. The assertions skip when that data is
// undefined (the browser harness has no filesystem).

var _ICON_KEBAB = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';

function _iconParseList(listText) {
  return String(listText).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
}

// Quoted kebab-case literals in an expression, minus comparison operands.
function _iconLiteralsIn(expr) {
  var out = [];
  var re = new RegExp('([\'"])(' + _ICON_KEBAB + ')\\1', 'g');
  var m;
  while ((m = re.exec(expr)) !== null) {
    var before = expr.slice(0, m.index);
    var after = expr.slice(m.index + m[0].length);
    if (/[!=]==?\s*$/.test(before) || /^\s*[!=]==?/.test(after)) continue;
    out.push(m[2]);
  }
  return out;
}

function _iconNamesIn(text) {
  var found = [];   // { index, icon, rule }
  var m;
  var r1 = /data-lucide\s*=\s*\\?["']([a-z0-9-]+)\\?["']/g;
  while ((m = r1.exec(text)) !== null) found.push({ index: m.index, icon: m[1], rule: 'R1' });

  var r2 = /data-lucide\s*=\s*\\?["']\$\{([^}]*)\}/g;
  while ((m = r2.exec(text)) !== null) {
    _iconLiteralsIn(m[1]).forEach(function (n) { found.push({ index: m.index, icon: n, rule: 'R2' }); });
  }

  var r3 = new RegExp('(?:\\bicon|[\'"]icon[\'"])\\s*[:=]\\s*([\'"])(' + _ICON_KEBAB + ')\\1', 'g');
  while ((m = r3.exec(text)) !== null) found.push({ index: m.index, icon: m[2], rule: 'R3' });

  var r4 = /\b[A-Za-z_]*ICON[A-Za-z_]*\s*=\s*\{([^}]*)\}/g;
  var val = new RegExp(':\\s*([\'"])(' + _ICON_KEBAB + ')\\1', 'g');
  while ((m = r4.exec(text)) !== null) {
    var v;
    val.lastIndex = 0;
    while ((v = val.exec(m[1])) !== null) found.push({ index: m.index, icon: v[2], rule: 'R4' });
  }
  return found;
}

function lintIconSubset(htmlSources, jsSources, listText) {
  var allowed = {};
  _iconParseList(listText).forEach(function (n) { allowed[n] = true; });
  var violations = [];
  var seen = {};

  function scan(file, text) {
    _iconNamesIn(text).forEach(function (f) {
      if (allowed[f.icon]) return;
      var line = _vendorLineOf(text, f.index);
      var key = file + ':' + line + ':' + f.icon;
      if (seen[key]) return;
      seen[key] = true;
      violations.push({ file: file, line: line, icon: f.icon, rule: f.rule });
    });
  }

  Object.keys(htmlSources).sort().forEach(function (file) {
    scan(file, _vendorStripHtmlComments(htmlSources[file]));
  });
  Object.keys(jsSources).sort().forEach(function (file) {
    scan('js/' + file, _vendorStripJsComments(jsSources[file]).join('\n'));
  });
  return violations;
}
