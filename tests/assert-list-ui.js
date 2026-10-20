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
  }
);
