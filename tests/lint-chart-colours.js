// tests/lint-chart-colours.js — N-416 guard: chart colours come from the series tokens.
//
// Charts read --chart-1…8 (style.css; light, dark and print sets). SVG charts put
// var(--chart-N) in their markup; Chart.js (canvas) resolves it at draw time with
// chartCssVar() (utils.js). So chart JS never carries a colour literal.
//
// Violations, per file in CHART_COLOUR_FILES (comments ignored):
//   1. a hex colour, rgb()/rgba() or hsl()/hsla() literal;
//   2. a var(--x) that is not a series, status or neutral token (CHART_COLOUR_ALLOWED_VARS)
//      where a series colour is set: any var() on a --nt-chart-color / LCI_REPORT_COLOURS
//      line, or a `color: 'var(--x)'` legend / series entry;
//   3. a listed file missing from the sources (it must never pass vacuously).
// Not scanned, on purpose: lci-config.js (the Excel / PowerPoint colour blocks are
// documented hex exceptions — a workbook / deck cannot read CSS; the PowerPoint series
// are pinned against style.css in assert-list-ui.js instead), seasonal-fx.js
// (decorative), mobile-*.js (guarded by tests/lint-mobile-tokens.js since N-418: classes on
// the status set, no colour literals), --c-ptype-* consumers (VF-D8).
// Pure function over data; the assertion skips when ALL_SOURCES is undefined.
// Needs _vendorStripJsComments from lint-vendor.js (loads earlier).

var CHART_COLOUR_FILES = ['revenue-chart.js', 'people-dashboard.js', 'lci-report.js', 'lci-sections.js', 'coe-plan.js', 'engagement-pages.js'];
var CHART_COLOUR_ALLOWED_VARS = /^(chart-[1-8]|status-[a-z-]+|text-muted|coe-opens-(planned|actual))$/;

function lintChartColours(sources) {
  var out = [];
  CHART_COLOUR_FILES.forEach(function (file) {
    if (sources[file] === undefined) { out.push({ file: file, line: 0, text: 'file missing from sources' }); return; }
    _vendorStripJsComments(sources[file]).forEach(function (ln, i) {
      var lit = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/.exec(ln);
      if (lit) out.push({ file: file, line: i + 1, text: lit[0] });
      var re = /var\(--([a-z0-9-]+)/g, m;
      if (/nt-chart-color|LCI_REPORT_COLOURS/.test(ln)) {
        while ((m = re.exec(ln))) {
          if (!CHART_COLOUR_ALLOWED_VARS.test(m[1])) out.push({ file: file, line: i + 1, text: 'var(--' + m[1] + ')' });
        }
      }
      var ent = /\bcolor:\s*['"`]var\(--([a-z0-9-]+)/g;
      while ((m = ent.exec(ln))) {
        if (!CHART_COLOUR_ALLOWED_VARS.test(m[1])) out.push({ file: file, line: i + 1, text: 'var(--' + m[1] + ')' });
      }
    });
  });
  return out;
}