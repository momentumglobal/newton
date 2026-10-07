// tests/lint-vendor.js — SEC-9 regression guard (N-289).
//
// Newton serves every third-party script from js/vendor/ — nothing runs code
// from a public CDN, which is what lets N-292 set `script-src 'self'`. This
// file turns that into a build failure instead of a convention:
//
//   lintExternalScripts   an absolute / protocol-relative script URL in any root
//                         *.html <script src>, or a string literal in js/ that
//                         is an http(s) URL ending .js (the shape of
//                         CONFIG.LCI.EXCEL.SRC, CONFIG.SURVEY.CHARTJS_SRC and a
//                         loader's `s.src = '...'`). The allow-list is EMPTY.
//   lintVendorManifest    js/vendor/*.js vs js/vendor/VERSIONS.md: every file
//                         has a row, every row has a file, the sha384 matches,
//                         and the version in the filename matches the row.
//   lintPackagePins       the root package.json (Dependabot manifest only) pins
//                         exactly the versions VERSIONS.md lists.
//
// Pure functions over data. tests/run.js reads the filesystem and passes it in
// (ALL_HTML, ALL_SOURCES, VENDOR_FILES, VENDOR_MANIFEST, VENDOR_PACKAGE_JSON);
// the assertions skip when that data is undefined (the browser harness has no
// filesystem), exactly like the ALL_SOURCES guards.
//
// WHAT IS NOT FLAGGED: navigation links, xmlns URIs, Graph/login endpoints and
// comments — only script sources. js/diagnostics.js still names unpkg/jsdelivr
// in two historical comments; comments are stripped before matching.

function _vendorLineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

// Remove HTML comments but keep their newlines so line numbers stay right.
function _vendorStripHtmlComments(html) {
  return String(html).replace(/<!--[\s\S]*?-->/g, function (m) {
    return m.replace(/[^\n]/g, ' ');
  });
}

// Same line-level, quote-aware comment strip as lint-dates.js (kept local so
// this file has no load-order dependency on it).
function _vendorStripJsComments(source) {
  var lines = String(source).split('\n');
  var out = [];
  var inBlock = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var code = '';
    var quote = null;
    var j = 0;
    while (j < line.length) {
      var c = line[j];
      var next = line[j + 1];
      if (inBlock) {
        if (c === '*' && next === '/') { inBlock = false; j += 2; } else { j++; }
        continue;
      }
      if (quote) {
        if (c === '\\') { code += c + (next || ''); j += 2; continue; }
        if (c === quote) { quote = null; }
        code += c; j++;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { quote = c; code += c; j++; continue; }
      if (c === '/' && next === '/') { break; }
      if (c === '/' && next === '*') { inBlock = true; j += 2; continue; }
      code += c; j++;
    }
    out.push(code);
  }
  return out;
}

// htmlSources: { 'index.html': '<text>', ... }   jsSources: ALL_SOURCES
// returns: [ { file, line, src }, ... ] — empty array when clean.
function lintExternalScripts(htmlSources, jsSources) {
  var violations = [];
  var htmlFiles = Object.keys(htmlSources).sort();
  var scriptTag = /<script\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;
  var external = /^\s*(https?:)?\/\//i;

  htmlFiles.forEach(function (file) {
    var text = _vendorStripHtmlComments(htmlSources[file]);
    var m;
    scriptTag.lastIndex = 0;
    while ((m = scriptTag.exec(text)) !== null) {
      if (external.test(m[2])) {
        violations.push({ file: file, line: _vendorLineOf(text, m.index), src: m[2] });
      }
    }
  });

  var jsUrl = /(['"`])\s*(https?:)?\/\/[^'"`\s]+\.js(\?[^'"`\s]*)?\s*\1/i;
  Object.keys(jsSources).sort().forEach(function (file) {
    var codeLines = _vendorStripJsComments(jsSources[file]);
    for (var i = 0; i < codeLines.length; i++) {
      var hit = jsUrl.exec(codeLines[i]);
      if (hit) violations.push({ file: 'js/' + file, line: i + 1, src: hit[0].replace(/^['"`]|['"`]$/g, '') });
    }
  });

  return violations;
}

// Parse the VERSIONS.md table. A data row looks like:
// | name | version | `file` | `upstream` | url | licence | bytes | `sha384-...` |
function _vendorParseManifest(manifestText) {
  var rows = [];
  String(manifestText).split('\n').forEach(function (line) {
    var m = /^\|\s*([^|]+?)\s*\|\s*(\d[^|]*?)\s*\|\s*`([^`]+)`\s*\|.*`(sha384-[A-Za-z0-9+\/=]+)`\s*\|\s*$/.exec(line);
    if (m) rows.push({ name: m[1], version: m[2], file: m[3], sha384: m[4] });
  });
  return rows;
}

// files: { 'lucide-1.47.0.min.js': 'sha384-<base64>', ... }
// returns: [ 'message', ... ] — empty array when clean.
function lintVendorManifest(files, manifestText) {
  var problems = [];
  var rows = _vendorParseManifest(manifestText);
  var names = Object.keys(files).sort();

  if (names.length === 0) problems.push('js/vendor/ contains no .js files');
  if (rows.length === 0) problems.push('js/vendor/VERSIONS.md has no table rows');

  var byFile = {};
  rows.forEach(function (r) { byFile[r.file] = r; });

  names.forEach(function (f) {
    var r = byFile[f];
    if (!r) { problems.push(f + ': no row in VERSIONS.md'); return; }
    if (r.sha384 !== files[f]) problems.push(f + ': sha384 differs from VERSIONS.md (file was modified or the row is stale)');
    if (f.indexOf('-' + r.version + '.') === -1) problems.push(f + ': filename does not contain version ' + r.version);
  });
  rows.forEach(function (r) {
    if (!(r.file in files)) problems.push(r.file + ': listed in VERSIONS.md but missing from js/vendor/');
  });

  return problems;
}

// N-290 (SEC-10): MSAL v5 throws on any call made before initialize(), and
// auth.js's authReady() is the one place that initialises it. A page or
// module calling these methods directly would skip that, so it is flagged.
// logoutRedirect is allowed (mobile-app.js keeps its own signOut()), as are
// getAllAccounts and the other synchronous account reads. Root HTML is
// scanned too, because index.html and admin.html bootstrap inline.
// returns: [ { file, line, call }, ... ] — empty array when clean.
var _MSAL_DIRECT_CALL = /\bmsalInstance\s*\.\s*(handleRedirectPromise|initialize|acquireToken\w*|loginRedirect|loginPopup|ssoSilent)\s*\(/;
function lintMsalCalls(htmlSources, jsSources) {
  var violations = [];
  function scan(file, codeLines) {
    for (var i = 0; i < codeLines.length; i++) {
      var m = _MSAL_DIRECT_CALL.exec(codeLines[i]);
      if (m) violations.push({ file: file, line: i + 1, call: m[1] });
    }
  }
  Object.keys(jsSources).sort().forEach(function (file) {
    if (file === 'auth.js') return;
    scan('js/' + file, _vendorStripJsComments(jsSources[file]));
  });
  Object.keys(htmlSources).sort().forEach(function (file) {
    scan(file, _vendorStripJsComments(_vendorStripHtmlComments(htmlSources[file])));
  });
  return violations;
}

// returns: [ 'message', ... ] — package.json must pin exactly the manifest's versions.
function lintPackagePins(manifestText, packageJsonText) {
  var problems = [];
  var pkg;
  try { pkg = JSON.parse(packageJsonText); } catch (e) { return ['package.json is missing or not valid JSON']; }
  var deps = (pkg && pkg.dependencies) || {};
  var rows = _vendorParseManifest(manifestText);

  rows.forEach(function (r) {
    if (!(r.name in deps)) problems.push(r.name + ': in VERSIONS.md but not in package.json dependencies');
    else if (deps[r.name] !== r.version) problems.push(r.name + ': package.json pins ' + deps[r.name] + ', VERSIONS.md says ' + r.version);
  });
  Object.keys(deps).forEach(function (d) {
    if (!rows.some(function (r) { return r.name === d; })) problems.push(d + ': in package.json but not in VERSIONS.md');
    if (!/^\d+\.\d+\.\d+$/.test(deps[d])) problems.push(d + ': package.json version "' + deps[d] + '" is not an exact pin');
  });

  return problems;
}