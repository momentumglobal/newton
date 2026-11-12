// tests/lint-desktop-contrast.js - N-419 (VF-8) standing WCAG audit of css/style.css's design tokens.
//
// N-168 fixed the dark --text-heading by hand and nothing guarded it afterwards; N-418 added a pair
// audit for mobile.css only. This is the desktop equivalent: every text / surface pair the product
// draws, resolved through the token layers (light = everything before the [data-theme="dark"] block,
// dark = that block over it) and checked against WCAG 2.x - text >= 4.5:1, boundaries and glyphs >= 3:1.
// It reuses the mobile resolver and ratio helpers (lint-mobile-tokens.js loads first) rather than copying
// them. All functions are pure over text; the assertion is in tests/assert-list-ui.js and skips in the
// browser harness (no filesystem).
//
//   desktopContrastAudit(styleCss, theme, pairs)   [] when every pair passes, else one message per failure
//
// To cover a new pair, add a row to DESKTOP_CONTRAST_PAIRS: [foreground token, background token, minimum, where it is used].

// [foreground token, background token, minimum ratio, where it is used]
var DESKTOP_CONTRAST_PAIRS = (function () {
  var surfaces = ['--surface', '--surface-app', '--surface-raised', '--surface-alt', '--surface-sunken', '--surface-hover', '--surface-muted', '--surface-tint'];
  var rows = [];
  // Body, label and heading text on every surface a card, panel, table row or form can sit on.
  [['--text-primary', surfaces], ['--text-secondary', surfaces], ['--text-heading', surfaces], ['--text-link', surfaces]].forEach(function (g) {
    g[1].forEach(function (b) { rows.push([g[0], b, 4.5, g[0].slice(2) + ' on ' + b.slice(2)]); });
  });
  ['--surface', '--surface-app', '--surface-raised', '--surface-alt', '--surface-hover', '--surface-sunken', '--surface-muted'].forEach(function (b) {
    rows.push(['--text-muted', b, 4.5, 'meta text, row actions, flat deltas (N-419: --text-faint is the 3:1 icon colour, never text)']);
  });
  ['--surface', '--surface-app'].forEach(function (b) { rows.push(['--text-label', b, 4.5, 'form labels']); });
  ['--surface', '--surface-app', '--surface-alt'].forEach(function (b) {
    rows.push(['--text-brand-secondary', b, 4.5, 'engagement tabs, scores, rate (N-419: was the unthemed --brand-secondary)']);
    rows.push(['--brand-tertiary', b, 4.5, 'LCI / People card titles and KPI values (N-419: dark was 2.5:1)']);
  });
  rows.push(['--text-link-hover', '--surface', 4.5, 'link hover']);
  // Status set: text on the page and on its own tint.
  [['--status-success-text', '--status-success-bg'], ['--status-warn-text', '--status-warn-bg'], ['--status-danger-text', '--status-danger-bg'],
   ['--status-warn-text', '--status-warn-bg-soft'], ['--status-danger-text', '--status-danger-bg-soft']].forEach(function (p) {
    rows.push([p[0], '--surface', 4.5, 'status text on a card']); rows.push([p[0], p[1], 4.5, 'status text on its own tint']);
  });
  ['--status-success-bg', '--status-warn-bg', '--status-danger-bg'].forEach(function (b) { rows.push(['--text-secondary', b, 4.5, 'label on a tinted tile']); });
  // Text on a fill.
  [['--text-on-brand', '--brand', 'primary button, leader node'], ['--text-on-brand', '--brand-hover', 'primary button hover'], ['--text-on-brand', '--brand-secondary', 'CSD node, survey active rating'],
   ['--text-on-brand', '--surface-accent-2', 'SDM node'], ['--text-on-brand', '--status-danger-solid', 'destructive button'], ['--inverse-text', '--notif-badge-bg', 'notification count (N-419: was 4.2:1)'],
   ['--org-sub-default', '--surface', 'org node subtitle'], ['--org-sub-default', '--surface-faint', 'org bench node subtitle'], ['--org-sub-leader', '--brand', 'org leader subtitle (N-419)'], ['--org-sub-csd', '--brand-secondary', 'org CSD subtitle'],
   ['--org-sub-sdm', '--surface-accent-2', 'org SDM subtitle'], ['--org-tp-sub', '--org-tp-bg', 'org TP subtitle'], ['--org-tp-name', '--org-tp-bg', 'org TP name (N-419)']].forEach(function (p) { rows.push([p[0], p[1], 4.5, p[2]]); });
  // Boundaries and glyphs (3:1): control borders, focus ring, status dots / icons, the icon grey.
  ['--surface', '--surface-app', '--surface-raised'].forEach(function (b) {
    rows.push(['--border-control', b, 3, 'input / select / checkbox boundary']); rows.push(['--text-faint', b, 3, 'icon colour, empty-state glyph']);
  });
  ['--surface', '--surface-app', '--surface-raised', '--surface-alt'].forEach(function (b) { rows.push(['--border-focus', b, 3, 'focus ring']); });
  ['--status-success', '--status-warn', '--status-danger'].forEach(function (f) { rows.push([f, '--surface', 3, 'RAG dot / glyph']); });
  // N-419: the homepage's white-alpha ink on its permanently-navy page, and the shared navy drawer / sidebar (unthemed, so one pair each).
  [['--c-wa-50', '--c-navy-night', 'homepage subtitle, Admin link, Sign out'], ['--inverse-text-muted', '--c-navy-night', 'homepage greeting'],
   ['--c-wa-55', '--c-navy-night', 'module description, banner refresh'], ['--inverse-text-muted', '--inverse-surface-2', 'drawer and sidebar muted text'],
   ['--inverse-text-muted', '--inverse-surface', 'sidebar muted text']].forEach(function (p) { rows.push([p[0], p[1], 4.5, p[2]]); });
  // N-459 (MM-D13): My Momentum sub-brand — permanently dark, unthemed, one pair each. The Lapis fill itself (--mm-accent) is a glow / fill only:
  // it is 1.9:1 on the navy, so the Lapis TINT (--mm-accent-soft) carries every word and indicator.
  [['--mm-cta-text', '--mm-cta-bg', 'hero call-to-action label (N-459: white on the sampled brand red was 4.3:1)'], ['--mm-cta-text', '--mm-cta-hover', 'hero call-to-action hover'],
   ['--mm-accent-soft', '--mm-grad-from', '"My" in the wordmark, chevron, active-link bar: gradient start'], ['--mm-accent-soft', '--mm-grad-to', 'wordmark tint on the gradient end'],
   ['--inverse-text', '--mm-grad-from', 'greeting, name, "Momentum" on the gradient start'], ['--inverse-text', '--mm-grad-to', 'greeting on the gradient end'],
   ['--inverse-text-muted', '--mm-grad-from', 'role text on the card / gradient start'], ['--inverse-text-muted', '--mm-grad-to', 'role text on the gradient end']].forEach(function (p) { rows.push([p[0], p[1], 4.5, p[2]]); });
  return rows;
})();

// Known, documented exception (VF-D2: the brand blue is fixed): in dark, --brand is #2E5FA3, which is 2.7:1 on the
// surface. It is only ever a BORDER or FILL there (.print-btn edge, active pill, toggles) - the label beside it is
// --text-heading, which passes. Audited separately and expected to fail by exactly this amount, so changing it is a decision.
var DESKTOP_EDGE_PAIRS = [['--brand', '--surface', 3, 'brand-blue edge: secondary button border, active pill fill']];

// N-419: a form control that draws its own border but sets no background takes the browser default fill, which is a grey that
// matches no token in dark (.survey-textarea was one). Per rule: a selector whose last compound ends -input / -textarea / -select
// (or is a bare input / select / textarea) and that sets the `border:` shorthand must also set a background. Returns one message per miss.
function lintFormControlBackground(css) {
  var s = css.replace(/\/\*[\s\S]*?\*\//g, ''), out = [], re = /([^{}]+)\{([^{}]*)\}/g, m;
  while ((m = re.exec(s))) {
    var sels = m[1].split(','), body = m[2];
    if (!/(^|[;\s])border\s*:/.test(body) || /(^|[;\s])background(-color)?\s*:/.test(body)) continue;
    for (var i = 0; i < sels.length; i++) {
      var sel = sels[i].trim();
      if (/:(hover|focus|active|disabled|checked|placeholder|where|not)/.test(sel)) continue;
      var tail = sel.split(/[\s>+~]+/).pop();
      if (/(textarea|-input|-select)$/.test(tail) || /^(input|select|textarea)(\[|$)/.test(tail)) out.push(sel);
    }
  }
  return out;
}

function desktopContrastAudit(styleCss, theme, pairs) {
  var layers = _mobileStyleCssLayers(styleCss);
  var t = {}, k;
  for (k in layers.light) t[k] = layers.light[k];
  if (theme === 'dark') for (k in layers.dark) t[k] = layers.dark[k];
  return contrastAuditLayers(t, theme, pairs || DESKTOP_CONTRAST_PAIRS);
}

// Token-name sets (N-419). The print re-pin ( @media print { :root { ... } } ) must name exactly the tokens the dark block
// redefines, so a dark-mode PDF comes out light: a token added to one and not the other is a dark PDF or a dead re-pin.
// color-scheme is not a token and is checked separately (N-420).
function desktopDarkTokenNames(styleCss) {
  return Object.keys(_mobileStyleCssLayers(styleCss).dark).sort();
}
function desktopPrintRepinNames(styleCss) {
  var i = styleCss.indexOf('@media print {'), names = [], m, re = /(--[a-z0-9-]+)\s*:/g;
  while (i > -1) {
    var open = styleCss.indexOf(':root {', i);
    if (open === -1) break;
    var between = styleCss.slice(i + '@media print {'.length, open);
    if (/\S/.test(between)) { i = styleCss.indexOf('@media print {', i + 1); continue; }
    var body = styleCss.slice(open, styleCss.indexOf('}', open));
    while ((m = re.exec(body))) names.push(m[1]);
    break;
  }
  return names.sort();
}
