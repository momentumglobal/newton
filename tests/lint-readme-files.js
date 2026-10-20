// tests/lint-readme-files.js - N-354 guard: Readme.html names every js/ file.
//
// Why a lint: Readme.html is the developer directory. Between the Sept and Oct 2026
// reviews the first-party JS grew from 78 to 103 files and the File Structure
// section quietly fell behind (a reader looking for a file found nothing, and a
// file that had been renamed or split stayed listed). Two checks, both pure functions:
//
//   lintReadmeFiles(readme, sources, config)
//     readme   the text of Readme.html                    (ALL_HTML['Readme.html'])
//     sources  { 'utils.js': text, ... } everything in js/ (ALL_SOURCES; js/vendor/ is not in it)
//     config   optional { allow: { 'name.js': 'reason' } } - replaces README_FILES_ALLOW (files the Readme may name or omit although they are not in js/)
//   returns an array of problem strings - empty when clean.
//
//   1 unlisted  every js/<name>.js appears as a <span class="file-tag"> in the Mobile App
//               and File Structure sections (name.js or js/name.js)
//   2 stale     every such file-tag that names a .js file in js/ still exists
//
// It reads the file-tag spans only, so prose that mentions a file does not count as listing it.
// The scope runs from id="sec-mobile" to id="sec-loadorder" (the mobile files are documented
// in their own table in the Mobile App section; everything else is in File Structure).
// tests/run.js supplies ALL_HTML and ALL_SOURCES; the assertions skip when they are
// undefined (the browser harness has no filesystem).

var README_FILES_START = 'id="sec-mobile"';
var README_FILES_END = 'id="sec-loadorder"';

// Files the scope may name (or omit) although they are not in js/, with the reason beside each.
var README_FILES_ALLOW = {
  'sw.js': 'the service worker lives at the repo root, not in js/; the Mobile App section documents it',
};

function lintReadmeFiles(readme, sources, config) {
  var allow = (config && config.allow) || README_FILES_ALLOW;
  var a = readme.indexOf(README_FILES_START);
  var b = readme.indexOf(README_FILES_END);
  if (a < 0 || b < 0 || b < a) {
    return ['Readme.html: the Mobile App / File Structure section markers (' + README_FILES_START + ' ... ' + README_FILES_END + ') were not found, so nothing was checked'];
  }
  var scope = readme.slice(a, b);
  var listed = {};
  var re = /<span class="file-tag">([^<]+)<\/span>/g;
  var m;
  while ((m = re.exec(scope))) {
    var f = /^(?:js\/)?([\w.-]+\.js)$/.exec(m[1].trim());
    if (f) listed[f[1]] = true;
  }
  if (Object.keys(listed).length === 0) {
    return ['Readme.html: no .js file-tag found between the Mobile App and Script Load Order sections, so nothing was checked'];
  }
  var problems = [];
  Object.keys(sources).filter(function (n) { return /\.js$/.test(n); }).sort().forEach(function (n) {
    if (!listed[n] && !allow[n]) problems.push('js/' + n + ' is not listed in the Readme (File Structure / Mobile JavaScript)');
  });
  Object.keys(listed).sort().forEach(function (n) {
    if (!Object.prototype.hasOwnProperty.call(sources, n) && !allow[n]) problems.push('Readme lists ' + n + ', which does not exist in js/ (stale row)');
  });
  return problems;
}
