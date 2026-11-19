// tests/lint-shared-files.js - R3-1 (N-470) ratchet on the shared four and CONFIG.
//
// R2 split utils.js / analytics.js / api.js / config.js, then new epics landed in them
// again (R3 audit, Nov 2026). The Placement rule (roles/architect.md) now says domain
// file first; this lint makes the shared files only move on purpose:
//
//   lintSharedFunctions(sources, baseline)   top-level function count per file must EQUAL
//                                            SHARED_FILE_FUNCTION_BASELINE.
//   lintConfigKeys(configText, baseline)     top-level keys of `const CONFIG = { ... }`
//                                            must EQUAL CONFIG_KEY_BASELINE.
//
// Same ratchet shape as lint-inline-styles.js: higher fails (put the code in a domain
// file, or raise the baseline in the same change and justify it in the spec); lower
// also fails (lower the baseline in the same change, so freed slack cannot be refilled
// unnoticed). Each R3 split lowers its file's number.
//
// What counts as a top-level function: a line at column 0 that starts `function` /
// `async function`, or `const|let|var NAME = [async] function | (...) => | x =>`,
// after comments are stripped (_vendorStripJsComments, lint-vendor.js - load that first).
//
// What counts as a CONFIG key: an entry at brace depth 1 of the CONFIG literal, found by
// a depth scanner that skips strings and template literals. Indentation is NOT used -
// several depth-1 keys are indented four spaces. The scanner does not understand regex
// literals or nested template literals inside ${}; config.js has neither, and the scanner
// returns null (a problem) rather than a wrong count if the braces stop balancing.
// tests/run.js also evaluates config.js alone and exposes CONFIG_KEYS_ISOLATED, which an
// assertion compares with the scanner's list.
//
// Pure functions over text. tests/run.js supplies ALL_SOURCES; the assertions skip in the
// browser harness (no filesystem).

var SHARED_FILE_FUNCTION_BASELINE = {
  'analytics.js': 64,
  'api.js': 50,
  'config.js': 1,
  'utils.js': 79,
};

var CONFIG_KEY_BASELINE = 107;

function sharedTopLevelFunctions(source) {
  var names = [];
  _vendorStripJsComments(source).forEach(function (line) {
    var m = /^(?:async\s+)?function\s*\*?\s*([\w$]+)\s*\(/.exec(line) ||
      /^(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?(?:function\b|(?:\([^)]*\)|[\w$]+)\s*=>)/.exec(line);
    if (m) names.push(m[1]);
  });
  return names;
}

function lintSharedFunctions(sources, baseline) {
  var base = baseline || SHARED_FILE_FUNCTION_BASELINE;
  var out = [];
  Object.keys(base).sort().forEach(function (file) {
    if (typeof sources[file] !== 'string') {
      out.push('js/' + file + ': named in SHARED_FILE_FUNCTION_BASELINE but not found in js/');
      return;
    }
    var n = sharedTopLevelFunctions(sources[file]).length;
    if (n > base[file]) {
      out.push('js/' + file + ': ' + n + ' top-level functions, baseline ' + base[file] +
        '. Put new code in its domain file (Placement rule, roles/architect.md); only cross-domain basics belong here. ' +
        'If this one really does, raise SHARED_FILE_FUNCTION_BASELINE to ' + n + ' in the same change and justify it in the spec.');
    } else if (n < base[file]) {
      out.push('js/' + file + ': ' + n + ' top-level functions, baseline ' + base[file] +
        '. Lower SHARED_FILE_FUNCTION_BASELINE to ' + n + ' in the same change.');
    }
  });
  return out;
}

// Top-level keys of the `const CONFIG = { ... }` literal, in order; null when it cannot be read.
function sharedConfigKeys(configText) {
  var text = _vendorStripJsComments(configText).join('\n');
  var at = text.search(/(^|\n)const CONFIG = \{/);
  if (at < 0) return null;
  var i = text.indexOf('{', at);
  var n = text.length;
  var depth = 0;
  var atEntry = false;
  var keys = [];
  while (i < n) {
    var c = text[i];
    if (c === "'" || c === '"') {
      var q = c, s = '';
      i++;
      while (i < n && text[i] !== q) {
        if (text[i] === '\\') { s += text[i] + (text[i + 1] || ''); i += 2; continue; }
        s += text[i]; i++;
      }
      i++;
      if (depth === 1 && atEntry) {
        var k = i;
        while (k < n && /\s/.test(text[k])) k++;
        if (text[k] === ':') keys.push(s);
        atEntry = false;
      }
      continue;
    }
    if (c === '`') {
      var tdepth = 0;
      i++;
      while (i < n) {
        if (text[i] === '\\') { i += 2; continue; }
        if (tdepth === 0 && text[i] === '`') { i++; break; }
        if (text[i] === '$' && text[i + 1] === '{') { tdepth++; i += 2; continue; }
        if (tdepth > 0 && text[i] === '}') { tdepth--; i++; continue; }
        i++;
      }
      atEntry = false;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') {
      depth++;
      if (depth === 1) atEntry = true;
      i++;
      continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      depth--;
      i++;
      if (depth === 0) return keys;
      continue;
    }
    if (c === ',' && depth === 1) { atEntry = true; i++; continue; }
    if (depth === 1 && atEntry && !/\s/.test(c)) {
      if (text.substr(i, 3) === '...') { keys.push('...spread'); atEntry = false; i += 3; continue; }
      var m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i, i + 80));
      if (m) {
        var after = i + m[0].length;
        var j = after;
        while (j < n && /\s/.test(text[j])) j++;
        if (text[j] === ':' || text[j] === '(' || text[j] === ',' || text[j] === '}') keys.push(m[0]);
        atEntry = false;
        i = after;
        continue;
      }
      atEntry = false;
    }
    i++;
  }
  return null;
}

function lintConfigKeys(configText, baseline) {
  var want = typeof baseline === 'number' ? baseline : CONFIG_KEY_BASELINE;
  var keys = sharedConfigKeys(configText);
  if (keys === null) return ['js/config.js: could not read the top-level keys of `const CONFIG = { ... }` (braces did not balance, or the literal was not found), so nothing was checked'];
  if (keys.length > want) {
    return ['js/config.js: ' + keys.length + ' top-level CONFIG keys, baseline ' + want +
      '. A block read by one module goes in its own <domain>-config.js (Placement rule, roles/architect.md); ' +
      'if it is read by several modules, raise CONFIG_KEY_BASELINE to ' + keys.length + ' in the same change and justify it in the spec.'];
  }
  if (keys.length < want) {
    return ['js/config.js: ' + keys.length + ' top-level CONFIG keys, baseline ' + want + '. Lower CONFIG_KEY_BASELINE to ' + keys.length + ' in the same change.'];
  }
  return [];
}