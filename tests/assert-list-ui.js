// tests/assert-list-ui.js — list sort, RAG markers, breadcrumb, chart threshold/legend helpers.
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  {
    name: 'N-247a compareSortValues — text case-insensitive + numeric-aware, numbers strip commas, dates by calendar day, enums by order',
    fn: function () {
      const sign = function (n) { return n < 0 ? -1 : n > 0 ? 1 : 0; };
      _assertEqual(sign(compareSortValues('apple', 'Banana', 'text')), -1, 'apple < Banana (case-insensitive)');
      _assertEqual(sign(compareSortValues('APPLE', 'apple', 'text')), 0, 'APPLE == apple');
      _assertEqual(sign(compareSortValues('Role 2', 'Role 10', 'text')), -1, 'Role 2 < Role 10 (numeric-aware)');
      _assertEqual(sign(compareSortValues('9,000', '65,000', 'number')), -1, '9,000 < 65,000 (not string order)');
      _assertEqual(sign(compareSortValues(120, '65,000', 'number')), -1, 'number vs comma string');
      _assertEqual(sign(compareSortValues('2026-07-01T12:00:00Z', '2026-06-30T23:00:00Z', 'date')), 1, 'later calendar day sorts after (spDateIn string compare)');
      _assertEqual(sign(compareSortValues('2026-07-01T00:00:00Z', '2026-07-01T23:59:00Z', 'date')), 0, 'same calendar day, different time = equal');
      _assertEqual(sign(compareSortValues('Sourcing', 'Offered', 'enum', CONFIG.ROLE_STAGES)), -1, 'Sourcing before Offered (pipeline order, not alphabetical)');
      _assertEqual(sign(compareSortValues('Closed', 'Backlog', 'enum', CONFIG.ROLE_STAGES)), 1, 'Closed after Backlog');
      _assertEqual(sign(compareSortValues('Mystery', 'Cancelled', 'enum', CONFIG.ROLE_STAGES)), 1, 'unknown enum value sorts after every known value');
      _assertEqual(sign(compareSortValues('Alpha', 'Zeta', 'enum', CONFIG.ROLE_STAGES)), -1, 'two unknowns fall back to text compare');
    },
  },
  {
    name: 'N-247a sortRows — empties last both ways, null/unknown state is a no-op, input not mutated, ties keep input order',
    fn: function () {
      const rows = [
        { id: 'a', n: '65,000', t: 'beta',  g: 'x', d: '2026-03-01T12:00:00Z' },
        { id: 'b', n: null,     t: '',      g: 'y', d: null },
        { id: 'c', n: '9,000',  t: 'Alpha', g: 'x', d: '2026-01-15T00:00:00Z' },
        { id: 'd', n: 'n/a',    t: '   ',   g: 'y', d: 'not a date' },
        { id: 'e', n: 120,      t: 'gamma', g: 'x', d: '2025-12-31T23:00:00Z' },
      ];
      const cols = {
        n: { type: 'number', get: function (r) { return r.n; } },
        t: { type: 'text',   get: function (r) { return r.t; } },
        g: { type: 'text',   get: function (r) { return r.g; } },
        d: { type: 'date',   get: function (r) { return r.d; } },
      };
      const ids = function (rs) { return rs.map(function (r) { return r.id; }).join(''); };
      const before = ids(rows);
      _assertEqual(ids(sortRows(rows, { key: 'n', dir: 'asc' },  cols)), 'ecabd', 'number asc, empties (null, unparseable) last');
      _assertEqual(ids(sortRows(rows, { key: 'n', dir: 'desc' }, cols)), 'acebd', 'number desc, empties STILL last');
      _assertEqual(ids(sortRows(rows, { key: 't', dir: 'asc' },  cols)), 'caebd', 'text asc, blank/whitespace last');
      _assertEqual(ids(sortRows(rows, { key: 't', dir: 'desc' }, cols)), 'eacbd', 'text desc, blank/whitespace still last');
      _assertEqual(ids(sortRows(rows, { key: 'd', dir: 'asc' },  cols)), 'ecabd', 'date asc, null/unparseable last');
      _assertEqual(ids(sortRows(rows, { key: 'd', dir: 'desc' }, cols)), 'acebd', 'date desc, null/unparseable still last');
      _assertEqual(ids(sortRows(rows, { key: 'g', dir: 'asc' },  cols)), 'acebd', 'ties keep input order (stable)');
      _assertEqual(ids(sortRows(rows, { key: 'g', dir: 'desc' }, cols)), 'bdace', 'desc ties also keep input order');
      _assertEqual(sortRows(rows, null, cols) === rows, true, 'null state returns the input untouched');
      _assertEqual(sortRows(rows, { key: 'gone', dir: 'asc' }, cols) === rows, true, 'unknown/stale key returns the input untouched');
      _assertEqual(sortRows(rows, { key: 'toString', dir: 'asc' }, cols) === rows, true, 'inherited property name is not a column');
      _assertEqual(ids(rows), before, 'input array not mutated by any sort above');
    },
  },
  {
    name: 'N-247a nextSortState — asc → desc → default, and a different column starts at asc',
    fn: function () {
      const s1 = nextSortState(null, 'budget');
      _assertEqual(s1, { key: 'budget', dir: 'asc' }, '1st click asc');
      const s2 = nextSortState(s1, 'budget');
      _assertEqual(s2, { key: 'budget', dir: 'desc' }, '2nd click desc');
      _assertEqual(nextSortState(s2, 'budget'), null, '3rd click back to default');
      _assertEqual(nextSortState(s2, 'stage'), { key: 'stage', dir: 'asc' }, 'different column (from desc) starts at asc');
      _assertEqual(nextSortState(s1, 'stage'), { key: 'stage', dir: 'asc' }, 'different column (from asc) starts at asc');
    },
  },
  {
    name: 'N-254 ragMarkerHTML — red is an accessible ⚠ glyph with text presentation (VS15)',
    fn: function () {
      _assertEqual(CONFIG.RAG_MARKERS.red.glyph, '\u26A0\uFE0E', 'config glyph is ⚠ + VS15');
      const h = ragMarkerHTML('red');
      _assertEqual(h, '<span class="rag-marker rag-marker--red" role="img" aria-label="At risk" title="At risk">\u26A0\uFE0E</span>', 'red markup');
      _assertEqual(ragMarkerHTML('RED'), h, 'case-insensitive');
    },
  },
  {
    name: 'N-254 ragMarkerHTML — amber with label: glyph aria-hidden, visible "Watch"',
    fn: function () {
      _assertEqual(ragMarkerHTML('amber', { label: true }),
        '<span class="rag-marker rag-marker--amber"><span class="rag-marker__glyph" aria-hidden="true">!</span><span class="rag-marker__label">Watch</span></span>',
        'amber labelled markup');
    },
  },
  {
    name: 'N-254 ragMarkerHTML — no marker for green / grey / neutral / missing / unknown',
    fn: function () {
      ['green', 'grey', 'neutral', undefined, null, '', 'purple', 'constructor', 'toString'].forEach(function (r) {
        _assertEqual(ragMarkerHTML(r), '', 'rag=' + String(r));
        _assertEqual(ragMarkerHTML(r, { label: true }), '', 'rag=' + String(r) + ' (label)');
      });
    },
  },
  {
    name: 'N-257 ragTextHTML — green/grey neutral (no marker), amber/red carry the N-254 marker',
    fn: function () {
      _assertEqual(ragTextHTML('green', '85%'), '<span class="rag-text rag-text--green">85%</span>', 'green plain');
      _assertEqual(ragTextHTML('grey', 'GREY'), '<span class="rag-text rag-text--grey">GREY</span>', 'grey plain');
      _assertEqual(ragTextHTML('RED', '62%'), '<span class="rag-text rag-text--red">' + ragMarkerHTML('red') + '62%</span>', 'red + marker, case-insensitive');
      _assertEqual(ragTextHTML('amber', '<b>'), '<span class="rag-text rag-text--amber">' + ragMarkerHTML('amber') + '&lt;b&gt;</span>', 'amber + marker, text escaped');
      _assertEqual(ragTextHTML('purple', 'x'), '<span class="rag-text">x</span>', 'unknown → plain');
      _assertEqual(ragTextHTML(undefined, 'x'), '<span class="rag-text">x</span>', 'missing → plain');
    },
  },
  {
    name: 'N-255a breadcrumbHTML — ancestors are links, last segment is aria-current text, no separator in DOM',
    fn: function () {
      _assertEqual(
        breadcrumbHTML([{ label: 'Home', href: 'index.html' }, { label: 'People', href: 'people.html' }, { label: 'Org Chart' }]),
        '<nav aria-label="Breadcrumb" class="breadcrumb"><ol class="breadcrumb__list">' +
        '<li class="breadcrumb__item"><a class="breadcrumb__link" href="index.html">Home</a></li>' +
        '<li class="breadcrumb__item"><a class="breadcrumb__link" href="people.html">People</a></li>' +
        '<li class="breadcrumb__item"><span class="breadcrumb__current" aria-current="page">Org Chart</span></li>' +
        '</ol></nav>', 'three-level trail');
      const h = breadcrumbHTML([{ label: 'Home', href: 'index.html' }, { label: 'Roles', href: 'reporting.html#roles' }]);
      _assertEqual(h.indexOf('reporting.html#roles') === -1, true, 'last segment never a link, even with href');
      _assertEqual(h.indexOf('›') === -1, true, 'no separator characters in markup');
    },
  },
  {
    name: 'N-255a breadcrumbHTML — escapes labels/hrefs; empty/invalid input → empty string',
    fn: function () {
      _assertEqual(
        breadcrumbHTML([{ label: 'A&B', href: 'x.html?a="1"' }, { label: '<i>' }]),
        '<nav aria-label="Breadcrumb" class="breadcrumb"><ol class="breadcrumb__list">' +
        '<li class="breadcrumb__item"><a class="breadcrumb__link" href="x.html?a=&quot;1&quot;">A&amp;B</a></li>' +
        '<li class="breadcrumb__item"><span class="breadcrumb__current" aria-current="page">&lt;i&gt;</span></li>' +
        '</ol></nav>', 'escaped');
      [[], null, undefined, 'Home', {}, [{ label: '' }, null]].forEach(v =>
        _assertEqual(breadcrumbHTML(v), '', 'input=' + JSON.stringify(v)));
      _assertEqual(breadcrumbHTML([{ label: 'Only' }]).indexOf('aria-current="page">Only<') > -1, true, 'single segment is current');
    },
  },
  {
    name: 'N-257 _chartThresholdSvg — line in the plot, label rows in the right gutter, stacked outward',
    fn: function () {
      const line = "<line x1='10' y1='50' x2='90' y2='50' class='nt-chart-threshold'/>";
      _assertEqual(_chartThresholdSvg(10, 100, 10, [{ y: 50, label: 'On track ≥', value: '£2' }]),
        line + "<text text-anchor='start' class='nt-chart-threshold-label'><tspan x='96' y='36'>On track ≥</tspan><tspan x='96' y='47'>£2</tspan></text>",
        'above (default): two rows over the line, in the gutter');
      _assertEqual(_chartThresholdSvg(10, 100, 10, [{ y: 50, label: 'At risk <', value: '<£1', place: 'below' }]),
        line + "<text text-anchor='start' class='nt-chart-threshold-label'><tspan x='96' y='61'>At risk &lt;</tspan><tspan x='96' y='72'>&lt;£1</tspan></text>",
        'below: two rows under the line, label + value escaped');
      _assertEqual(_chartThresholdSvg(10, 100, 10, [{ y: 50, label: 'A&B' }]),
        line + "<text text-anchor='start' class='nt-chart-threshold-label'><tspan x='96' y='47'>A&amp;B</tspan></text>",
        'single row above');
      _assertEqual(_chartThresholdSvg(10, 100, 10, [{ y: 50, label: 'A', place: 'below' }]),
        line + "<text text-anchor='start' class='nt-chart-threshold-label'><tspan x='96' y='61'>A</tspan></text>",
        'single row below');
      _assertEqual(_chartThresholdSvg(0, 50, 0, [{ y: 5 }]),
        "<line x1='0' y1='5' x2='50' y2='5' class='nt-chart-threshold'/>", 'no label');
    },
  },
  {
    name: 'N-257 _chartLegendHtml — dot swatch variant',
    fn: function () {
      const h = _chartLegendHtml([{ color: 'var(--status-danger)', dot: true, label: 'Below' }]);
      _assertEqual(h.indexOf('nt-chart-legend-swatch--dot') > -1, true, 'dot class present');
      _assertEqual(h.indexOf('nt-chart-legend-swatch--box') === -1, true, 'not a box');
    },
  },
  // ── N-416: chart colours come from the series tokens ─────────────────────
  {
    name: 'N-416 chart JS carries no colour literal and only series / status / neutral tokens (lint-chart-colours guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintChartColours(ALL_SOURCES).map(v => `${v.file}:${v.line}  ${v.text}`), [],
        'hex / rgb() / hsl() or a non-series var() in chart JS (use var(--chart-N))');
    },
  },
  {
    name: 'N-416 lint-chart-colours control: flags hex, rgb(), hsl() and a non-series var(); ignores comments, entities, selectors, series and status tokens',
    fn: function () {
      const lint = src => lintChartColours(src).map(v => `${v.file}:${v.line}`);
      const only = (file, text) => { const o = {}; CHART_COLOUR_FILES.forEach(f => { o[f] = ''; }); o[file] = text; return o; };
      _assertEqual(lint(only('revenue-chart.js', "const a = '#2E5FA3';\n")), ['revenue-chart.js:1'], '6-digit hex');
      _assertEqual(lint(only('revenue-chart.js', "const a = '#abc';\n")), ['revenue-chart.js:1'], '3-digit hex');
      _assertEqual(lint(only('engagement-pages.js', "x = `hsl(${h},60%,50%)`;\n")), ['engagement-pages.js:1'], 'hsl()');
      _assertEqual(lint(only('lci-report.js', "x = 'rgb(1,2,3)';\n")), ['lci-report.js:1'], 'rgb()');
      _assertEqual(lint(only('people-dashboard.js', "const s = `<g style='--nt-chart-color:var(--surface-accent)'/>`;\n")),
        ['people-dashboard.js:1'], 'brand token as a series colour');
      _assertEqual(lint(only('lci-sections.js', "const series = [{ key: 'coe', label: L.coe, color: 'var(--c-navy-steel)', data: s.coe }];\n")),
        ['lci-sections.js:1'], 'legend / series colour that is not a series token');
      _assertEqual(lint(only('revenue-chart.js', "// '#2E5FA3' hsl(1,2%,3%)\n/* rgb(1,2,3) */\nconst a = 1;\n")), [], 'comments ignored');
      _assertEqual(lint(only('coe-plan.js', "t = '&#128203; <a href=\"#add-row\">';\n")), [], 'entities and anchors are not colours');
      _assertEqual(lint(only('revenue-chart.js',
        "const d = `style='--nt-chart-color:${b ? 'var(--status-danger)' : 'var(--chart-1)'}'`;\n{ color: 'var(--text-muted)', dashed: true },\n{ color: 'var(--coe-opens-planned)' },\n")),
        [], 'series, status, text-muted and coe-opens tokens are allowed');
      _assertEqual(lint({}).length, CHART_COLOUR_FILES.length, 'a missing file is a violation, not a silent pass');
    },
  },
  {
    name: 'N-416 chartSeriesVar — 8 ordered series, wraps after 8, negative index safe',
    fn: function () {
      _assertEqual([0, 1, 7, 8, 9, 15, 16].map(chartSeriesVar),
        ['--chart-1', '--chart-2', '--chart-8', '--chart-1', '--chart-2', '--chart-8', '--chart-1'], 'index → token');
      _assertEqual(chartSeriesVar(-1), '--chart-8', 'negative wraps');
      _assertEqual(chartCssVar('--chart-1'), '', 'no DOM (node) → empty string, not a throw');
    },
  },
  {
    name: 'N-416 LCI series — screen LCI_REPORT_COLOURS is --chart-1…5 and the PPTX series are the light --c-chart-1…5 hex',
    fn: function () {
      _assertEqual(CONFIG.LCI.PPTX.COLOURS.series, ['2E5FA3', 'D9622B', '157F73', '7A5BB0', 'B8387F'], 'PPTX series (no #, 6 digits)');
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const m = /const LCI_REPORT_COLOURS = \[([^\]]*)\]/.exec(ALL_SOURCES['lci-report.js']);
      _assertEqual(m && m[1].split(',').map(s => s.trim().replace(/['"]/g, '')),
        ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'], 'LCI_REPORT_COLOURS');
      const css = ALL_CSS['style.css'];
      ['2E5FA3', 'D9622B', '157F73', '7A5BB0', 'B8387F'].forEach((hex, n) => {
        _assertEqual(new RegExp('--c-chart-' + (n + 1) + ':\\s*#' + hex + ';', 'i').test(css), true, 'PPTX series ' + (n + 1) + ' = --c-chart-' + (n + 1));
      });
    },
  },
  {
    name: 'N-416 engDistTone — low / mid / high thirds of the rating scale',
    fn: function () {
      const tones = n => Array.from({ length: n }, (_, i) => engDistTone(i, n));
      _assertEqual(tones(5), ['low', 'low', 'mid', 'high', 'high'], '5-point');
      _assertEqual(tones(10), ['low', 'low', 'low', 'low', 'mid', 'mid', 'mid', 'high', 'high', 'high'], '10-point');
      _assertEqual(tones(3), ['low', 'mid', 'high'], '3-point');
      _assertEqual(tones(2), ['low', 'high'], '2-point');
      _assertEqual(engDistTone(0, 1), 'high', 'single bucket does not divide by zero');
    },
  },
  // ── N-416 diff-2: Hiring Plan R / N cells readable in dark mode ───────────
  {
    name: 'N-416 diff-2 Hiring Plan R / N cells: dark tints give ≥ 4.5:1 under the dark text; dark block themes them and the print re-pin puts them back',
    fn: function () {
      if (typeof ALL_CSS === 'undefined') {
        _skip('Stylesheet scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const css = ALL_CSS['style.css'];
      const hex = t => new RegExp('--' + t.replace(/^--/, '') + ':\\s*#([0-9a-fA-F]{6});').exec(css)[1];
      const lum = h => { const f = c => (c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        return 0.2126 * f(parseInt(h.slice(0, 2), 16)) + 0.7152 * f(parseInt(h.slice(2, 4), 16)) + 0.0722 * f(parseInt(h.slice(4, 6), 16)); };
      const ratio = t => { const a = lum(hex(t)), b = lum(hex('--c-dark-text-primary'));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      ['--c-dark-coe-r', '--c-dark-coe-n'].forEach(t => _assertEqual(ratio(t) >= 4.5, true, t + ' ≥ 4.5:1 under --c-dark-text-primary'));
      _assertEqual(/\[data-theme="dark"\] \{[\s\S]*?--coe-cell-r: var\(--c-dark-coe-r\); --coe-cell-n: var\(--c-dark-coe-n\);/.test(css), true, 'dark block themes the R / N cells');
      _assertEqual(/@media print \{\s*:root \{[\s\S]*?--coe-cell-r: var\(--c-blue-pale\);\s*--coe-cell-n: var\(--c-pink-pale\);/.test(css), true, 'print re-pin restores the light cells');
    },
  },
  // ── N-417 (VF-6): motion and empty states ────────────────────────────────
  {
    name: 'N-417 no page-level bare "Loading…" text remains outside the mobile files (skeleton helpers instead)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const bare = Object.keys(ALL_SOURCES).filter(f => !/^mobile/.test(f)).filter(f => {
        const src = _vendorStripJsComments(ALL_SOURCES[f]);
        return /<p[^>]*>\s*Loading/.test(src) || /class="(?:page-loading|mr-loading|cc-loading)"/.test(src);
      });
      _assertEqual(bare, [], 'files with a bare page-level Loading');
      const defs = Object.keys(ALL_SOURCES).filter(f => /function skeletonTable\(/.test(ALL_SOURCES[f]));
      _assertEqual(defs, ['ui-kit.js'], 'skeletonTable is defined once, in ui-kit.js');
    },
  },
  {
    name: 'N-417 stylesheet: --stagger-step, .vf-enter-0…7 and the empty-state entrance sit inside one screen + no-preference block; compact variant exists; retired classes are gone',
    fn: function () {
      if (typeof ALL_CSS === 'undefined') {
        _skip('Stylesheet scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const css = ALL_CSS['style.css'];
      _assertEqual(/--stagger-step:\s*20ms;/.test(css), true, '--stagger-step token');
      _assertEqual(/\.empty-state--compact\s*\{/.test(css), true, '.empty-state--compact');
      const start = css.indexOf('@media screen and (prefers-reduced-motion: no-preference) {');
      _assertEqual(start > -1, true, 'entrance media block exists');
      let depth = 0, end = -1;
      for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) { end = i; break; }
      }
      const block = css.slice(start, end);
      _assertEqual(/@keyframes vf-rise/.test(block), true, 'keyframes inside the block');
      _assertEqual(/\.vf-enter\s*\{/.test(block), true, '.vf-enter inside the block');
      for (let n = 0; n < 8; n++) _assertEqual(new RegExp('\\.vf-enter-' + n + '\\s*\\{[^}]*animation-delay').test(block), true, '.vf-enter-' + n);
      _assertEqual(/\.empty-state > \*/.test(block), true, 'empty-state entrance inside the block');
      _assertEqual(/\.vf-enter|vf-rise/.test(css.slice(0, start) + css.slice(end)), false, 'no entrance rule outside the block');
      const all = Object.values(ALL_CSS).join('\n');
      ['page-loading', 'mr-loading', 'role-hc-empty', 'org-empty', 'empty-note', 'ppl-muted-note--flush'].forEach(c =>
        _assertEqual(new RegExp('\\.' + c + '\\b').test(all), false, '.' + c + ' removed'));
    },
  },
  {
    name: 'N-417 emptyStateBlock — compact adds a modifier class; default and error markup unchanged',
    fn: function () {
      const compact = emptyStateBlock({ icon: 'users', message: 'x', variant: 'compact' });
      _assertEqual(compact.includes('class="empty-state empty-state--compact"'), true, 'compact wrapper');
      _assertEqual(compact.includes('empty-state-icon--error'), false, 'compact is not the error icon');
      const plain = emptyStateBlock({ icon: 'users', message: 'x' });
      _assertEqual(plain.includes('class="empty-state"') && !plain.includes('--compact'), true, 'default wrapper');
      const err = emptyStateBlock({ icon: 'alert-circle', message: 'x', variant: 'error' });
      _assertEqual(err.includes('empty-state-icon empty-state-icon--error') && !err.includes('--compact'), true, 'error variant');
    },
  },
  {
    name: 'N-417 enterStagger — first 24 matches get vf-enter + index class capped at 7; a second call in the same navigation is a no-op',
    fn: function () {
      const mk = () => { const s = new Set(); return { s, classList: { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)) },
        addEventListener() {}, removeEventListener() {} }; };
      const hadTimer = typeof setTimeout !== 'undefined';
      if (!hadTimer) globalThis.setTimeout = () => 0;   // the node sandbox has no timers
      try {
      const els = Array.from({ length: 30 }, mk);
      const scope = { querySelectorAll: () => els };
      enterStagger(scope, '.x');
      _assertEqual(els.slice(0, 24).every(e => e.s.has('vf-enter')), true, 'first 24 animated');
      _assertEqual(els.slice(24).every(e => e.s.size === 0), true, 'rest untouched');
      _assertEqual([...els[0].s].sort(), ['vf-enter', 'vf-enter-0'], 'first index class');
      _assertEqual(els[7].s.has('vf-enter-7') && els[23].s.has('vf-enter-7'), true, 'index capped at 7');
      const again = Array.from({ length: 3 }, mk);
      enterStagger({ querySelectorAll: () => again }, '.x');
      _assertEqual(again.every(e => e.s.size === 0), true, 'same navigation: no replay');
      } finally { if (!hadTimer) delete globalThis.setTimeout; }
    },
  },
  // ── N-418 (VF-7): mobile parity ──────────────────────────────────────────
  {
    name: 'N-418 mobile: every CSS variable used by mobile CSS / JS / HTML is defined in mobile.css (control: an undefined name is reported)',
    fn: function () {
      if (typeof ALL_CSS === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      _assertEqual(lintMobileUndefinedVars(mobileSources(ALL_CSS, ALL_HTML, ALL_SOURCES)), [], 'undefined variables');
      const bad = lintMobileUndefinedVars({ css: ':root { --a: 1; } .x { color: var(--a); }', js: { 'mobile-x.js': "el.innerHTML = '<i style=\"color:var(--c-success-alt)\">';" }, html: '' });
      _assertEqual(bad, ['js/mobile-x.js: --c-success-alt'], 'control: the former Palette B name is caught');
    },
  },
  {
    name: 'N-418 mobile: no colour literal outside the two token blocks of mobile.css; none in mobile-*.js; only the theme-color meta in mobile.html (control: literals are caught, entities are not)',
    fn: function () {
      if (typeof ALL_CSS === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      _assertEqual(lintMobileColourLiterals(mobileSources(ALL_CSS, ALL_HTML, ALL_SOURCES)), [], 'colour literals');
      const bad = lintMobileColourLiterals({ css: ':root { --a: #fff; } .x { color: #abc; }', js: { 'mobile-x.js': "const c = '#0A0B44';" }, html: '<meta name="theme-color" content="#090546">\n<b>&#8592;</b>' });
      _assertEqual(bad.length, 2, 'control: one css rule literal + one js literal; the token block, the theme-color meta and an HTML entity are not flagged');
    },
  },
  {
    name: 'N-418 mobile: mobile.css mirrors style.css — identical declaration text for every shared token, light and dark; dark block themes the same roles and never the permanently-dark groups (control: drift is caught)',
    fn: function () {
      if (typeof ALL_CSS === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      const m = ALL_CSS['mobile.css'], s = ALL_CSS['style.css'];
      _assertEqual(lintMobileTokenMirror(m, s), [], 'token mirror');
      const drift = lintMobileTokenMirror(m.replace('--c-n-50: #F3F5F9;', '--c-n-50: #F3F5FA;'), s);
      _assertEqual(drift.length, 1, 'control: a one-digit drift is reported');
      const inv = lintMobileTokenMirror(m.replace('--elev-card: var(--sh-elev-dark-1);', '--elev-card: var(--sh-elev-dark-1); --inverse-text: var(--c-black);'), s);
      _assertEqual(inv.some(p => /--inverse-text/.test(p)), true, 'control: an --inverse-* redefinition in the dark block is reported');
      _assertEqual(/--c-navy-night:\s*#090546/.test(m) && /meta name="theme-color" content="#090546"/.test(ALL_HTML['mobile.html']), true, 'top bar navy equals the PWA theme-color');
    },
  },
  {
    name: 'N-418 mobile: page-level loading is a skeleton and empty pages use mobileEmptyState; only the allow-listed text sites remain (control: the pre-N-418 markup is caught)',
    fn: function () {
      if (typeof ALL_CSS === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      const src = mobileSources(ALL_CSS, ALL_HTML, ALL_SOURCES);
      _assertEqual(lintMobileLoadingEmpty(src.js), [], 'hand-written loading / empty text');
      _assertEqual(lintMobileLoadingEmpty({ 'mobile-x.js': "a.innerHTML = '<div class=\"m-empty\">Loading roles...</div>';\nb.innerHTML = '<div class=\"m-empty\">No roles match your filters.</div>';" }).length, 2, 'control: both pre-N-418 forms are reported');
      const all = Object.keys(src.js).map(f => _vendorStripJsComments(src.js[f]).join('\n')).join('\n');
      const count = re => (all.match(re) || []).length;
      _assertEqual(count(/\bmobileEmptyState\(/g) - 1, 6, 'six empty sites call mobileEmptyState (the -1 is its definition)');
      _assertEqual([count(/\bskeletonPanel\(6\)/g), count(/\bdashboardSkeleton\(4\)/g), count(/\bskeletonList\(/g)], [7, 3, 3], 'twelve page loaders + the existing scorecards list skeleton');
      const fn = /function mobileEmptyState\([\s\S]*?\n\}\n/.exec(src.js['mobile-app.js']);
      _assertEqual(!!fn && /escHtml\(message\)/.test(fn[0]) && !/<button|<a /.test(fn[0]), true, 'mobileEmptyState escapes the message and renders no button or link (message-only)');
    },
  },
  {
    name: 'N-418 mobile: the empty-state entrance runs only under prefers-reduced-motion: no-preference; the sheet guard stays; every :active press state survives; 44px targets keep their size',
    fn: function () {
      if (typeof ALL_CSS === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      const css = ALL_CSS['mobile.css'];
      _assertEqual(lintMobileMotion(css), [], 'motion guards');
      _assertEqual(lintMobileMotion(css.replace('.m-empty-state > * { animation: m-rise', '.m-empty-state > * { animation: m-skel-sweep 1s; } .y { animation: m-rise').replace('@media (prefers-reduced-motion: no-preference) {', '@media (min-width: 1px) {')).length > 0, true, 'control: removing the guard is reported');
      ['.btn-signin', '.m-back-btn', '.m-btn-danger', '.m-btn-primary', '.m-btn-secondary', '.m-module-card', '.m-nav-item', '.m-role-card',
       '.m-sc-arrow', '.m-sc-dot', '.m-sheet-close', '.m-stage-btn', '.m-switcher-btn', '.m-switcher-item'].forEach(sel =>
        _assertEqual(mobileRuleBody(css, sel + ':active') !== null, true, sel + ':active is still defined'));
      [['.m-back-btn', /min-width:\s*44px[\s\S]*min-height:\s*44px|min-height:\s*44px[\s\S]*min-width:\s*44px/], ['.m-stage-btn', /min-height:\s*44px/], ['.m-switcher-btn', /min-height:\s*44px/],
       ['.m-switcher-item', /min-height:\s*44px/], ['.m-desktop-link a', /min-height:\s*44px/], ['.m-sheet-close', /min-width:\s*44px[\s\S]*min-height:\s*44px/],
       ['.m-sc-arrow', /width:\s*44px;\s*height:\s*44px/], ['.m-sc-dot::before', /width:\s*44px;\s*height:\s*44px/]].forEach(p =>
        _assertEqual(p[1].test(mobileRuleBody(css, p[0]) || ''), true, p[0] + ' keeps its 44px target'));
    },
  },
  {
    name: 'N-418 mobile: contrast audit of every text / surface pair — text ≥ 4.5:1, boundaries and glyphs ≥ 3:1, light and dark; the one documented exception is the dark brand-blue edge (control: a failing pair is reported)',
    fn: function () {
      if (typeof ALL_CSS === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      const css = ALL_CSS['mobile.css'];
      _assertEqual(mobileContrastAudit(css, 'light'), [], 'light pairs');
      _assertEqual(mobileContrastAudit(css, 'dark'), [], 'dark pairs');
      _assertEqual(mobileContrastAudit(css, 'light', MOBILE_EDGE_PAIRS), [], 'brand-blue edge on the light surface');
      const dark = mobileContrastAudit(css, 'dark', MOBILE_EDGE_PAIRS);
      _assertEqual(dark.length === 1 && /2\.7\d:1/.test(dark[0]), true, 'brand-blue edge on the dark surface is the documented 2.7:1 exception (VF-D2)');
      _assertEqual(mobileContrastAudit(':root { --a: #888888; --b: #ffffff; }', 'light', [['--a', '--b', 4.5, 'old grey text']]).length, 1, 'control: the old #888 on white (3.5:1) fails text contrast');
      _assertEqual(/--text-secondary/.test(mobileRuleBody(css, '.m-kpi--warn .m-kpi-label') || ''), true, 'tinted-tile labels use --text-secondary (--text-muted is 4.3:1 on the dark warn tint)');
      _assertEqual(/--text-muted/.test(mobileRuleBody(css, '.m-delta--flat') || ''), true, 'the flat delta chip uses --text-muted, not the 3:1 --text-faint');
    },
  },
  {
    name: 'N-418 mobile.html: theme-init.js loads synchronously in <head>, after frame-guard.js and before the stylesheet; style.css is still not linked',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      const h = ALL_HTML['mobile.html'], head = h.slice(0, h.indexOf('</head>'));
      const guard = head.indexOf('js/frame-guard.js'), init = head.indexOf('js/theme-init.js'), sheet = head.indexOf('css/mobile.css');
      _assertEqual(guard > -1 && init > guard && sheet > init, true, 'order: frame-guard.js < theme-init.js < css/mobile.css');
      _assertEqual(/<script src="js\/theme-init\.js"><\/script>/.test(head), true, 'plain script tag: no defer, no async');
      _assertEqual(/style\.css/.test(h), false, 'mobile.html does not link style.css');
    },
  }
);
