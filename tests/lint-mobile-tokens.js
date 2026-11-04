// tests/lint-mobile-tokens.js - N-418 (VF-7) guards for the mobile app's stylesheet.
//
// mobile.html does not load css/style.css (tests/assert-pages.js pins that), so css/mobile.css
// carries its own copy of the design tokens it uses. Left alone a copy drifts, and a
// variable that is used but never defined fails SILENTLY (the declaration is dropped; the
// element inherits). Before N-418, eleven such variables sat in mobile-*.js. This file makes
// the copy checkable. All functions are pure over text; the assertions are in
// tests/assert-list-ui.js and skip in the browser harness (no filesystem).
//
//   mobileSplitCss(css)               { root, dark, rules } - the two token blocks and the rest
//   mobileTokenDecls(blockText)       { --name: 'value' } (comments stripped, later wins)
//   lintMobileUndefinedVars(...)      every var(--x) in mobile CSS / JS / HTML is defined in mobile.css
//   lintMobileColourLiterals(...)     no hex / rgb / hsl outside the two token blocks
//   lintMobileTokenMirror(...)        mirrored tokens have the SAME declaration text as style.css
//   lintMobileLoadingEmpty(jsSrc)     page-level Loading / empty text only at the allow-listed sites
//   lintMobileMotion(css)             the empty-state entrance sits inside prefers-reduced-motion: no-preference
//   mobileContrastAudit(css, theme)   WCAG ratios for the text / surface pairs the app uses
// Reuses _vendorStripJsComments from lint-vendor.js (loads earlier).

// Tokens that exist only in mobile.css (no style.css equivalent).
var MOBILE_LOCAL_TOKENS = ['--brand-pressed', '--elev-sheet', '--r-sheet'];
// Never redefined in a dark block: permanently-dark chrome and non-themed fills (as style.css).
var MOBILE_DARK_FORBIDDEN = /^--(inverse-|status-[a-z-]*-solid$|status-neutral-on-pale$|c-navy-night$)/;

function _mobileStripCssComments(t) { return String(t).replace(/\/\*[\s\S]*?\*\//g, ''); }

function _mobileBlock(css, openRe) {
  var m = openRe.exec(css);
  if (!m) return null;
  var start = m.index, i = css.indexOf('{', start), depth = 0;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return { start: start, end: i + 1, text: css.slice(css.indexOf('{', start) + 1, i) };
  }
  return null;
}

function mobileSplitCss(css) {
  var root = _mobileBlock(css, /(^|\n)\s*:root\s*\{/);
  var dark = _mobileBlock(css, /(^|\n)\s*\[data-theme="dark"\]\s*\{/);
  var cut = [root, dark].filter(Boolean).sort(function (a, b) { return a.start - b.start; });
  var rules = '', pos = 0;
  cut.forEach(function (b) { rules += css.slice(pos, b.start); pos = b.end; });
  rules += css.slice(pos);
  return { root: root ? root.text : '', dark: dark ? dark.text : '', rules: rules };
}

function mobileTokenDecls(blockText) {
  var out = {}, re = /(--[\w-]+)\s*:\s*([^;{}]+);/g, m, t = _mobileStripCssComments(blockText);
  while ((m = re.exec(t)) !== null) out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  return out;
}

// style.css: everything before the [data-theme="dark"] block is the light layer; the dark block is the override.
function _mobileStyleCssLayers(styleCss) {
  var di = styleCss.indexOf('[data-theme="dark"] {');
  var dark = _mobileBlock(styleCss, /\[data-theme="dark"\]\s*\{/);
  return { light: mobileTokenDecls(styleCss.slice(0, di)), dark: dark ? mobileTokenDecls(dark.text) : {} };
}

// sources: { css, js: { 'mobile-app.js': text }, html }
function lintMobileUndefinedVars(sources) {
  var split = mobileSplitCss(sources.css);
  var defined = {};
  Object.keys(mobileTokenDecls(split.root)).forEach(function (k) { defined[k] = true; });
  var problems = [];
  function scan(file, text) {
    var re = /var\(\s*(--[\w-]+)/g, m;
    while ((m = re.exec(text)) !== null) if (!defined[m[1]]) problems.push(file + ': ' + m[1]);
  }
  scan('css/mobile.css', _mobileStripCssComments(sources.css));
  Object.keys(sources.js).forEach(function (f) { scan('js/' + f, _vendorStripJsComments(sources.js[f]).join('\n')); });
  scan('mobile.html', sources.html);
  return problems.filter(function (p, i, a) { return a.indexOf(p) === i; });
}

var _MOBILE_LITERAL_RE = /(^|[^&\w])#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/;
function lintMobileColourLiterals(sources) {
  var problems = [];
  _mobileStripCssComments(mobileSplitCss(sources.css).rules).split('\n').forEach(function (l, i) {
    if (_MOBILE_LITERAL_RE.test(l)) problems.push('css/mobile.css rules: ' + l.trim().slice(0, 80));
  });
  Object.keys(sources.js).forEach(function (f) {
    _vendorStripJsComments(sources.js[f]).forEach(function (l, i) {
      if (_MOBILE_LITERAL_RE.test(l)) problems.push('js/' + f + ':' + (i + 1) + ': ' + l.trim().slice(0, 80));
    });
  });
  sources.html.split('\n').forEach(function (l, i) {
    if (/name="theme-color"/.test(l)) return;   // the PWA chrome colour: a meta tag cannot read a token
    if (_MOBILE_LITERAL_RE.test(l)) problems.push('mobile.html:' + (i + 1) + ': ' + l.trim().slice(0, 80));
  });
  return problems;
}

function lintMobileTokenMirror(mobileCss, styleCss) {
  var problems = [], mob = mobileSplitCss(mobileCss), sty = _mobileStyleCssLayers(styleCss);
  var mLight = mobileTokenDecls(mob.root), mDark = mobileTokenDecls(mob.dark);
  Object.keys(mLight).forEach(function (k) {
    if (MOBILE_LOCAL_TOKENS.indexOf(k) >= 0) return;
    if (!(k in sty.light)) problems.push(k + ' is in mobile.css but not in style.css (add it to MOBILE_LOCAL_TOKENS if it is mobile-only)');
    else if (mLight[k] !== sty.light[k]) problems.push(k + ' light: mobile "' + mLight[k] + '" != style.css "' + sty.light[k] + '"');
  });
  Object.keys(mDark).forEach(function (k) {
    if (MOBILE_DARK_FORBIDDEN.test(k)) problems.push(k + ' must not be redefined in the dark block');
    if (MOBILE_LOCAL_TOKENS.indexOf(k) >= 0) return;
    if (!(k in sty.dark)) problems.push(k + ' dark: style.css does not theme it');
    else if (mDark[k] !== sty.dark[k]) problems.push(k + ' dark: mobile "' + mDark[k] + '" != style.css "' + sty.dark[k] + '"');
  });
  // Everything style.css themes, and mobile uses, must be themed here too.
  Object.keys(mLight).forEach(function (k) {
    if (k in sty.dark && !(k in mDark) && /^--(surface|text|border|status|elev|brand|chart)/.test(k) && !MOBILE_DARK_FORBIDDEN.test(k))
      problems.push(k + ' is themed in style.css dark but not in mobile.css dark');
  });
  if (!/color-scheme:\s*dark/.test(mob.dark)) problems.push('dark block lacks color-scheme: dark');
  return problems;
}

// Allow-list: the only places mobile still writes loading / "m-empty" text by hand.
var MOBILE_TEXT_ALLOW = [
  /<option value="">Loading…<\/option>/,           // select loaders (mobile-pages.js x2)
  /class="m-tp-note">Loading\.\.\.<\/span>/,             // inline team-box loader (mobile-roleform.js)
  /class="m-empty">Error: \$\{e\.message\}/,             // unescaped error site, left as is (N-418 decision 8)
  /m-empty m-empty--error/,                              // mobilePageError()
];
function lintMobileLoadingEmpty(jsSources) {
  var problems = [];
  Object.keys(jsSources).forEach(function (f) {
    _vendorStripJsComments(jsSources[f]).forEach(function (l, i) {
      if (!/class="m-empty"|class="m-empty |Loading/.test(l)) return;
      if (MOBILE_TEXT_ALLOW.some(function (re) { return re.test(l); })) return;
      problems.push('js/' + f + ':' + (i + 1) + ': ' + l.trim().slice(0, 90));
    });
  });
  return problems;
}

function lintMobileMotion(css) {
  var problems = [];
  var noPref = _mobileBlock(css, /@media \(prefers-reduced-motion: no-preference\)\s*\{/);
  if (!noPref) return ['no @media (prefers-reduced-motion: no-preference) block'];
  var outside = css.slice(0, noPref.start) + css.slice(noPref.end);
  if (!/animation:\s*m-rise/.test(noPref.text)) problems.push('m-rise is not applied inside the no-preference block');
  if (/animation[^;{}]*m-rise/.test(outside)) problems.push('m-rise is applied outside the no-preference block');
  if (!/@keyframes m-rise/.test(css)) problems.push('@keyframes m-rise missing');
  var reduce = _mobileBlock(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.m-sheet-scrim/);
  if (!reduce) problems.push('the sheet reduced-motion guard is gone');
  return problems;
}

// ---- WCAG contrast -------------------------------------------------------
function _mobileResolve(name, layers, seen) {
  seen = seen || {};
  if (seen[name]) return null; seen[name] = true;
  var v = layers[name];
  if (v == null) return null;
  var m = /^var\((--[\w-]+)\)$/.exec(v);
  return m ? _mobileResolve(m[1], layers, seen) : v;
}
function _mobileLum(hex) {
  var h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
  var f = function (n) { var c = n / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(parseInt(h.slice(0, 2), 16)) + 0.7152 * f(parseInt(h.slice(2, 4), 16)) + 0.0722 * f(parseInt(h.slice(4, 6), 16));
}
function mobileRatio(a, b) { var x = _mobileLum(a), y = _mobileLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

// [foreground token, background token, minimum ratio, where it is used]
var MOBILE_CONTRAST_PAIRS = [
  ['--text-primary', '--surface', 4.5, 'body text on cards'], ['--text-primary', '--surface-app', 4.5, 'body text on the page'],
  ['--text-primary', '--surface-raised', 4.5, 'toast, menu'], ['--text-secondary', '--surface', 4.5, 'stage button'],
  ['--text-label', '--surface', 4.5, 'labels'], ['--text-label', '--surface-app', 4.5, 'labels on the page'],
  ['--text-muted', '--surface', 4.5, 'meta text'], ['--text-muted', '--surface-app', 4.5, 'section headers, notes'],
  ['--text-muted', '--border-subtle', 4.5, 'desktop-view link bar'], ['--text-muted', '--surface-muted', 4.5, 'read-only input'],
  ['--text-heading', '--surface', 4.5, 'titles, values'], ['--text-heading', '--surface-app', 4.5, 'greeting'],
  ['--text-heading', '--surface-alt', 4.5, 'stage badge, active item'], ['--text-heading', '--surface-alt-border', 4.5, 'pressed item'],
  ['--status-success-text', '--surface', 4.5, 'RAG green'], ['--status-success-text', '--status-success-bg', 4.5, 'KPI tone'],
  ['--status-warn-text', '--surface', 4.5, 'RAG amber, days open'], ['--status-warn-text', '--status-warn-bg', 4.5, 'KPI tone'],
  ['--status-danger-text', '--surface', 4.5, 'RAG red, danger button'], ['--status-danger-text', '--status-danger-bg', 4.5, 'KPI tone'],
  ['--status-danger-text', '--status-danger-bg-soft', 4.5, 'danger button pressed'], ['--status-danger-text', '--surface-app', 4.5, 'error notes'],
  ['--text-on-brand', '--brand', 4.5, 'primary button'], ['--text-on-brand', '--status-danger-solid', 4.5, 'error toast'],
  ['--text-on-brand', '--status-neutral-on-pale', 4.5, 'NOT RATED pill'],
  ['--text-secondary', '--status-success-bg', 4.5, 'KPI label on a tinted tile'], ['--text-secondary', '--status-warn-bg', 4.5, 'KPI label on a tinted tile'],
  ['--text-secondary', '--status-danger-bg', 4.5, 'KPI label on a tinted tile'],
  ['--border-control', '--surface', 3, 'input, stage button, team box boundary'], ['--border-control', '--surface-app', 3, 'carousel dot'],
  ['--border-focus', '--surface', 3, 'focus ring'], ['--border-focus', '--surface-app', 3, 'focus ring on the page'],
  ['--status-success', '--surface', 3, 'RAG dot'], ['--status-warn', '--surface', 3, 'RAG dot'], ['--status-danger', '--surface', 3, 'RAG dot'],
  ['--text-faint', '--surface', 3, 'empty-state icon'], ['--text-faint', '--surface-app', 3, 'empty-state icon on the page']
];
// Known, documented exceptions (VF-D2: the brand blue is fixed): the dark theme's brand-blue EDGE
// (secondary button, active stage border, active dot) against the dark surface. The labels beside
// them pass; the white label on the blue primary button passes (it is in the list above).
var MOBILE_CONTRAST_EXCEPTIONS = [];
var MOBILE_EDGE_PAIRS = [['--brand', '--surface', 3, 'brand-blue edge: secondary button, arrows, active stage border']];

function mobileContrastAudit(css, theme, pairs) {
  var split = mobileSplitCss(css);
  var layers = mobileTokenDecls(split.root);
  if (theme === 'dark') { var d = mobileTokenDecls(split.dark); Object.keys(d).forEach(function (k) { layers[k] = d[k]; }); }
  var fails = [];
  (pairs || MOBILE_CONTRAST_PAIRS).forEach(function (p) {
    var fg = _mobileResolve(p[0], layers), bg = _mobileResolve(p[1], layers);
    if (!/^#/.test(fg || '') || !/^#/.test(bg || '')) { fails.push(p[0] + ' / ' + p[1] + ': not a hex colour (' + fg + ', ' + bg + ')'); return; }
    var r = mobileRatio(fg, bg);
    if (r < p[2]) fails.push(theme + ' ' + p[0] + ' on ' + p[1] + ' = ' + r.toFixed(2) + ':1 (< ' + p[2] + ') - ' + p[3]);
  });
  return fails;
}

// The declaration block of the first rule whose selector list contains `selector` (exact, trimmed).
function mobileRuleBody(css, selector) {
  var re = /([^{}]+)\{([^{}]*)\}/g, m, c = _mobileStripCssComments(css);
  while ((m = re.exec(c)) !== null) {
    if (m[1].split(',').map(function (s) { return s.trim(); }).indexOf(selector) >= 0) return m[2];
  }
  return null;
}

// { css, html, js } for the assertions: ALL_CSS / ALL_HTML / ALL_SOURCES are supplied by tests/run.js.
function mobileSources(allCss, allHtml, allSources) {
  var js = {};
  Object.keys(allSources).filter(function (f) { return /^mobile-/.test(f); }).forEach(function (f) { js[f] = allSources[f]; });
  return { css: allCss['mobile.css'], html: allHtml['mobile.html'], js: js };
}
