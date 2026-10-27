// tests/assert-sla.js — SLATargets list, SLA target resolver and seed plan (N-381, DA-1).
// Loads AFTER tests/assertions.js and pushes this domain's entries into ASSERTIONS.

ASSERTIONS.push(
  {
    name: 'N-381 CONFIG.SLA — four metrics in order, columns projected, seed is its own literal; list registered, not cached',
    fn: function () {
      _assertEqual(CONFIG.SLA.LIST, 'SLATargets', 'AC1 list name');
      _assertEqual(CONFIG.SLA.METRICS.map(m => m.key),
        ['firstSubmissionDays', 'submissionsPerWeek', 'timeToOfferDays', 'timeToHireDays'], 'AC1 keys + order');
      _assertEqual(CONFIG.SLA.METRICS.map(m => m.column),
        ['FirstSubmissionDays', 'SubmissionsPerWeek', 'TimeToOfferDays', 'TimeToHireDays'], 'AC1 columns');
      CONFIG.SLA.METRICS.forEach(m => _assertEqual(CONFIG.LIST_FIELDS.SLATargets.includes(m.column), true, 'AC1 projected ' + m.column));
      _assertEqual(CONFIG.LIST_FIELDS.SLATargets.includes('ProjectType') && CONFIG.LIST_FIELDS.SLATargets.includes('ProjectID'), true, 'AC1 key columns projected');
      _assertEqual(CONFIG.SLA.SEED_DEFAULTS, { timeToHireDays: 45 }, 'AC1 seed');
      Object.keys(CONFIG.SLA.SEED_DEFAULTS).forEach(k => _assertEqual(CONFIG.SLA.METRICS.some(m => m.key === k), true, 'AC1 seed key is a metric: ' + k));
      _assertEqual(FIELD_ALIASES.SLATargets, {}, 'AC2 alias map is {}');
      _assertEqual(getMonitoredLists().includes('SLATargets'), true, 'AC2 watched by Data Health');
      _assertEqual(CONFIG.CACHE.persistentLists.includes('SLATargets'), false, 'AC2 not tier-2 cached');
      _assertEqual(CONFIG.DATA_HEALTH_EXCLUDED_LISTS.includes('SLATargets'), false, 'AC2 not excluded from Data Health');
      _assertEqual(CONFIG.INDEX_TARGETS.some(t => t.list === 'SLATargets'), false, 'AC2 no index target');
    },
  },
  {
    name: 'N-381 slaProjectTypes — dashboard types except Internal, derived, fresh array',
    fn: function () {
      _assertEqual(slaProjectTypes(), ['Embedded', 'CoE', 'Exec Search', 'MG AI'], 'AC3 today');
      ['LCI', 'Transformation', CONFIG.PROJECT_TYPE_INTERNAL].forEach(t => _assertEqual(slaProjectTypes().includes(t), false, 'AC3 excludes ' + t));
      _assertEqual(slaProjectTypes() === slaProjectTypes(), false, 'AC3 fresh array');
      const saved = CONFIG.PROJECT_TYPES;
      try {
        CONFIG.PROJECT_TYPES = saved.concat(['Newtype']);
        _assertEqual(slaProjectTypes(), ['Embedded', 'CoE', 'Exec Search', 'MG AI', 'Newtype'], 'AC3 a new type is picked up by derivation');
      } finally { CONFIG.PROJECT_TYPES = saved; }
    },
  },
  {
    name: 'N-381 slaCleanValue / slaRowKind',
    fn: function () {
      _assertEqual([5, '5', 2.5, '2.5'].map(slaCleanValue), [5, 5, 2.5, 2.5], 'AC4 valid');
      _assertEqual([0, -1, '', '  ', null, undefined, NaN, 'abc', true, {}, Infinity].map(slaCleanValue),
        [null, null, null, null, null, null, null, null, null, null, null], 'AC4 invalid -> null');
      _assertEqual(slaRowKind({ ProjectID: 12 }), 'override', 'row kind override');
      _assertEqual(slaRowKind({ ProjectID: '12', ProjectType: 'CoE' }), 'override', 'ProjectID wins over ProjectType');
      _assertEqual(slaRowKind({ ProjectType: 'CoE' }), 'default', 'row kind default');
      _assertEqual(slaRowKind({ ProjectType: 'CoE', ProjectID: 0 }), 'default', 'ProjectID 0 is not an override');
      _assertEqual(slaRowKind({ ProjectType: '  ' }), null, 'blank type ignored');
      _assertEqual([slaRowKind({}), slaRowKind(null), slaRowKind(undefined)], [null, null, null], 'null-safe');
    },
  },
  {
    name: 'N-381 slaTargetsFor — ineligible projects resolve to null even when rows exist',
    fn: function () {
      const rows = [
        { id: '1', ProjectType: 'LCI', TimeToHireDays: 45 },
        { id: '2', ProjectType: 'Transformation', TimeToHireDays: 45 },
        { id: '3', ProjectType: 'Internal', TimeToHireDays: 45 },
        { id: '4', ProjectID: 7, TimeToHireDays: 30 },
      ];
      _assertEqual(slaTargetsFor(null, rows), null, 'AC5 null project');
      _assertEqual(slaTargetsFor(undefined, rows), null, 'AC5 undefined project');
      ['LCI', 'Transformation', 'Internal', 'Bogus', undefined].forEach(t =>
        _assertEqual(slaTargetsFor({ id: '7', ProjectType: t }, rows), null, 'AC5 ' + t));
    },
  },
  {
    name: 'N-381 slaTargetsFor — default, per-metric override, blank fall-through, ignored rows',
    fn: function () {
      const none = { value: null, source: null };
      const rows = [
        { id: '1', ProjectType: 'Embedded', TimeToHireDays: 45, TimeToOfferDays: 40 },
        { id: '2', ProjectType: 'CoE', TimeToHireDays: 60 },
        { id: '3', ProjectID: 7, TimeToHireDays: 30 },
        { id: '4', ProjectID: 8, TimeToHireDays: 10, SubmissionsPerWeek: 5 },
      ];
      const p = { id: '7', ProjectType: 'Embedded' };
      const r = slaTargetsFor(p, rows);
      _assertEqual(Object.keys(r), ['firstSubmissionDays', 'submissionsPerWeek', 'timeToOfferDays', 'timeToHireDays'], 'AC10 exactly the four metric keys');
      _assertEqual(r.timeToHireDays, { value: 30, source: 'override' }, 'AC7 override wins');
      _assertEqual(r.timeToOfferDays, { value: 40, source: 'default' }, 'AC7 partial override inherits the rest');
      _assertEqual(r.firstSubmissionDays, none, 'AC6 unset metric');
      _assertEqual(r.submissionsPerWeek, none, 'AC8 another project\'s override is ignored');
      // default only
      const d = slaTargetsFor({ id: '9', ProjectType: 'Embedded' }, rows);
      _assertEqual(d.timeToHireDays, { value: 45, source: 'default' }, 'AC6 default');
      _assertEqual([d.firstSubmissionDays, d.submissionsPerWeek], [none, none], 'AC6 other metrics unset');
      // another type's default is ignored
      _assertEqual(slaTargetsFor({ id: '9', ProjectType: 'MG AI' }, rows).timeToHireDays, none, 'AC8 other type default ignored');
      // blank / 0 override value falls through to the default
      const blank = [{ id: '1', ProjectType: 'Embedded', TimeToHireDays: 45 }, { id: '2', ProjectID: 7, TimeToHireDays: 0 }, { id: '3', ProjectID: 7, TimeToOfferDays: '' }];
      _assertEqual(slaTargetsFor(p, blank).timeToHireDays, { value: 45, source: 'default' }, 'AC8 0 override falls through');
      // rows null / undefined behave as []
      _assertEqual(slaTargetsFor(p, null).timeToHireDays, none, 'AC10 null rows');
      _assertEqual(slaTargetsFor(p, undefined).timeToHireDays, none, 'AC10 undefined rows');
    },
  },
  {
    name: 'N-381 slaTargetsFor — duplicates resolve to the lowest item id; inputs are not mutated',
    fn: function () {
      const p = { id: '7', ProjectType: 'CoE' };
      const a = [{ id: '20', ProjectType: 'CoE', TimeToHireDays: 99 }, { id: '3', ProjectType: 'CoE', TimeToHireDays: 50 }, { id: '11', ProjectType: 'CoE', TimeToHireDays: 70 }];
      const b = a.slice().reverse();
      _assertEqual(slaTargetsFor(p, a).timeToHireDays.value, 50, 'AC9 duplicate defaults, order 1');
      _assertEqual(slaTargetsFor(p, b).timeToHireDays.value, 50, 'AC9 duplicate defaults, order 2');
      const o = [{ id: '9', ProjectID: 7, TimeToHireDays: 31 }, { id: '4', ProjectID: 7, TimeToHireDays: 32 }];
      _assertEqual(slaTargetsFor(p, o).timeToHireDays, { value: 32, source: 'override' }, 'AC9 duplicate overrides');
      const rows = a.concat(o);
      const before = JSON.stringify(rows), pBefore = JSON.stringify(p);
      slaTargetsFor(p, rows);
      _assertEqual(JSON.stringify(rows), before, 'AC10 rows not mutated');
      _assertEqual(JSON.stringify(p), pBefore, 'AC10 project not mutated');
    },
  },
  {
    name: 'N-381 slaSeedPlan — one default row per missing eligible type; existing and override rows respected',
    fn: function () {
      const plan = slaSeedPlan([]);
      _assertEqual(plan.map(r => r.ProjectType), ['Embedded', 'CoE', 'Exec Search', 'MG AI'], 'AC11 one per eligible type');
      _assertEqual(plan[0], { Title: 'Default · Embedded', ProjectType: 'Embedded', TimeToHireDays: 45 }, 'AC11 row shape');
      plan.forEach(r => _assertEqual(['FirstSubmissionDays', 'SubmissionsPerWeek', 'TimeToOfferDays'].some(c => c in r), false, 'AC11 other metrics omitted: ' + r.ProjectType));
      _assertEqual(slaSeedPlan(null).length, 4, 'AC11 null rows');
      const all = slaProjectTypes().map((t, i) => ({ id: String(i + 1), ProjectType: t, TimeToHireDays: 99 }));
      _assertEqual(slaSeedPlan(all), [], 'AC11 all present -> empty');
      _assertEqual(slaSeedPlan(all.slice(1)).map(r => r.ProjectType), ['Embedded'], 'AC11 one missing');
      _assertEqual(slaSeedPlan(all.slice(0, 1)).map(r => r.ProjectType), ['CoE', 'Exec Search', 'MG AI'], 'AC11 three missing');
      // an override row is not a default row, even when ProjectType is also set
      const ov = [{ id: '1', ProjectType: 'Embedded', ProjectID: 5, TimeToHireDays: 20 }];
      _assertEqual(slaSeedPlan(ov).map(r => r.ProjectType), ['Embedded', 'CoE', 'Exec Search', 'MG AI'], 'AC12 override is not a default');
      // rows for ineligible types are ignored
      _assertEqual(slaSeedPlan([{ id: '1', ProjectType: 'LCI', TimeToHireDays: 45 }]).length, 4, 'AC12 LCI row ignored');
    },
  },
  {
    name: 'N-381 createSlaDefaultRows — create-only, SLATargets only, nothing when complete (first call reached synchronously)',
    fn: function () {
      const calls = [];
      const orig = createItem;
      try {
        createItem = function (list, fields) { calls.push([list, fields]); return new Promise(function () {}); };
        createSlaDefaultRows([]);   // reaches the first createItem before any await
        _assertEqual(calls.length, 1, 'AC13 first row requested synchronously');
        _assertEqual(calls[0][0], 'SLATargets', 'AC13 list');
        _assertEqual(calls[0][1], { Title: 'Default · Embedded', ProjectType: 'Embedded', TimeToHireDays: 45 }, 'AC13 payload');
        calls.length = 0;
        createSlaDefaultRows(slaProjectTypes().map((t, i) => ({ id: String(i + 1), ProjectType: t })));
        _assertEqual(calls.length, 0, 'AC13 complete list -> no create');
      } finally { createItem = orig; }
    },
  },
  {
    name: 'N-389 checkSlaIntegrity — active projects with no resolvable targets',
    fn: function () {
      const P = (id, type, status) => ({ id: String(id), Title: 'P' + id, ProjectType: type, Status: status || 'Active' });
      const seeded = slaSeedPlan([]).map((r, i) => Object.assign({ id: String(i + 1) }, r));
      const run = (projects, rows) => checkSlaIntegrity({ projects, rows }).noTargets;
      _assertEqual(run([P(10, 'Embedded')], seeded), [], 'AC2 seeded default resolves, not flagged');
      _assertEqual(run([P(10, 'Embedded')], []), [{ id: '10', label: 'P10', type: 'Embedded', reason: 'noRow' }], 'AC2 no rows -> noRow');
      const blankDefault = [{ id: '1', ProjectType: 'Embedded', FirstSubmissionDays: '', TimeToHireDays: 0 }];
      _assertEqual(run([P(10, 'Embedded')], blankDefault).map(e => e.reason), ['blank'], 'AC2 blank default -> blank');
      _assertEqual(run([P(10, 'Embedded')], blankDefault.concat([{ id: '2', ProjectID: 10, TimeToOfferDays: 30 }])), [], 'AC2 one resolvable override metric is enough');
      _assertEqual(run([P(10, 'Embedded')], [{ id: '2', ProjectID: 10 }]).map(e => e.reason), ['blank'], 'AC2 an all-blank override row counts as a row');
      // AC3: never flagged
      const never = [P(1, 'Embedded', 'Completed'), P(2, 'LCI'), P(3, 'Transformation'), P(4, CONFIG.PROJECT_TYPE_INTERNAL), P(5, 'Bogus')];
      _assertEqual(run(never, []), [], 'AC3 completed and ineligible types, no rows');
      _assertEqual(run(never, [{ id: '1', ProjectType: 'LCI', TimeToHireDays: 45 }, { id: '2', ProjectID: 2 }]), [], 'AC3 ... with rows present');
      // AC4: Transition is active
      _assertEqual(run([P(11, 'CoE', 'Transition')], []).map(e => e.id), ['11'], 'AC4 Transition is evaluated');
      // AC6: order, null-safety, no mutation
      _assertEqual(run([P(12, 'CoE'), P(3, 'Embedded'), P(7, 'MG AI')], []).map(e => e.id), ['3', '7', '12'], 'AC6 ordered by id');
      _assertEqual(checkSlaIntegrity(), { noTargets: [], orphanOverrides: [] }, 'AC6 no arguments');
      _assertEqual(checkSlaIntegrity({ projects: null, rows: undefined }), { noTargets: [], orphanOverrides: [] }, 'AC6 null inputs');
      const ps = [P(12, 'CoE'), P(3, 'Embedded')], rs = [{ id: '9', ProjectID: 77 }, { id: '2', ProjectType: 'CoE' }];
      const before = JSON.stringify([ps, rs]);
      checkSlaIntegrity({ projects: ps, rows: rs });
      _assertEqual(JSON.stringify([ps, rs]), before, 'AC6 inputs not mutated');
    },
  },
  {
    name: 'N-389 checkSlaIntegrity — override rows pointing at missing projects',
    fn: function () {
      const projects = [
        { id: '10', Title: 'A', ProjectType: 'Embedded', Status: 'Active' },
        { id: '20', Title: 'B', ProjectType: 'CoE', Status: 'Completed' },
        { id: '30', Title: 'C', ProjectType: 'LCI', Status: 'Active' },
      ];
      const rows = [
        { id: '5', Title: 'Override · gone', ProjectID: 999, TimeToHireDays: 20 },
        { id: '4', ProjectID: 20, TimeToHireDays: 20 },
        { id: '6', ProjectID: 30, TimeToHireDays: 20 },
        { id: '7', ProjectType: 'Embedded', TimeToHireDays: 45 },
        { id: '8' },
        { id: '3', ProjectID: '998' },
        { id: '9', ProjectType: 'Embedded', ProjectID: 997 },
      ];
      const r = checkSlaIntegrity({ projects, rows });
      _assertEqual(r.orphanOverrides, [
        { rowId: '3', projectId: 998, label: '' },
        { rowId: '5', projectId: 999, label: 'Override · gone' },
        { rowId: '9', projectId: 997, label: '' },
      ].sort((a, b) => Number(a.rowId) - Number(b.rowId)), 'AC5 only the missing-project overrides, ordered by row id');
      _assertEqual(r.orphanOverrides.some(o => ['4', '6', '7', '8'].includes(o.rowId)), false,
        'AC5 override on a Completed or LCI project that exists, a default row and a keyless row are not orphans');
      _assertEqual(r.noTargets, [], 'AC5 the Embedded project resolves through its default row');
    },
  },
  {
    name: 'N-389 checkSlaIntegrity — pure, no literals; Data Health fetch / render wiring',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('AC1/7/8/9 source checks need the filesystem (node tests/run.js)');
      const body = (src, start) => { const i = src.indexOf(start); if (i < 0) return ''; const m = /\r?\n\}\r?\n/.exec(src.slice(i)); return m ? src.slice(i, i + m.index + m[0].length) : src.slice(i); };
      const fn = body(ALL_SOURCES['utils.js'], 'function checkSlaIntegrity(');
      _assertEqual(fn.length > 400, true, 'AC1 found checkSlaIntegrity');
      ['getItems', 'fetch(', 'document.', 'ANALYTICS_BENCHMARKS'].forEach(t => _assertEqual(fn.includes(t), false, 'AC1 pure, no ' + t));
      ["'Embedded'", "'CoE'", "'Exec Search'", "'MG AI'", "'LCI'", "'Transformation'", "'Internal'"].forEach(t => _assertEqual(fn.includes(t), false, 'AC1 no type literal ' + t));
      const os = ALL_SOURCES['os-admin.js'];
      const fetchSrc = body(os, 'async function _dhFetchSlaTargets(');
      const iMissing = fetchSrc.indexOf('columns.missing.length'), iRows = fetchSrc.indexOf('await getSLATargets()'), iProj = fetchSrc.indexOf('getProjects(false)');
      _assertEqual(iMissing > -1 && iRows > iMissing && iProj > iRows, true, 'AC7 Projects are read only after the list and columns are OK');
      _assertEqual(fetchSrc.includes('integrity = { ok: false }') && fetchSrc.includes('ok: true, missing: [], rows, integrity'), true, 'AC7 failed Projects read -> integrity { ok: false }, rows still returned');
      _assertEqual(/return \{ ok: true, missing: columns\.missing, rows: \[\] \}/.test(fetchSrc), true, 'AC7 missing columns -> no integrity');
      const seedFn = body(os, 'async function seedSlaDefaults(');
      _assertEqual(seedFn.includes("renderOsAdminPage('datahealth')"), true, 'AC9 seeding re-renders the tab, which re-fetches rows and recomputes the checks');
      // AC8: checks markup
      const checksSrc = body(os, 'function _dhSlaChecksHtml(');
      _assertEqual(checksSrc.length > 400, true, 'AC8 found _dhSlaChecksHtml');
      const render = new Function('escHtml', 'CONFIG', checksSrc + '\nreturn _dhSlaChecksHtml;')(escHtml, CONFIG);
      const zero = render({ ok: true, noTargets: [], orphanOverrides: [] });
      _assertEqual(zero.includes('dh-badge-warn') || zero.includes('Show') || zero.includes('Query error'), false, 'AC8 zero: no badge, no list');
      _assertEqual(zero.split('<td>0</td>').length - 1, 2, 'AC8 zero: both counts read 0');
      const cap = CONFIG.WEEKLY_ANOMALIES.displayRows;
      const many = Array.from({ length: cap + 5 }, (_, i) => ({ id: String(i), label: 'Proj' + i, type: 'Embedded', reason: 'noRow' }));
      const some = render({ ok: true, noTargets: many, orphanOverrides: [{ rowId: '4', projectId: 99, label: '<img src=x onerror=1>' }] });
      _assertEqual(some.includes('dh-badge-warn') && some.includes('+5 more') && some.includes('>' + (cap + 5) + '<'), true, 'AC8 non-zero: amber badge, count, capped list with +n more');
      _assertEqual(some.includes('<img') || /<[^>]*\son[a-z]+=/.test(some), false, 'AC8 hostile label is inert, no inline handlers');
      _assertEqual(some.includes('&lt;img'), true, 'AC8 hostile label is escaped');
      const bad = render({ ok: false });
      _assertEqual(bad.includes('Query error') && !bad.includes('<td>0</td>'), true, 'AC8 failed read -> Query error, not zeros');
      _assertEqual(render(undefined).includes('Query error'), true, 'AC8 missing integrity -> Query error');
      // AC8: section wiring and wording
      const sectionSrc = body(os, 'function _dhRenderSlaTargetsHtml(');
      _assertEqual(sectionSrc.includes('once the editor ships'), false, 'AC8 stale wording gone');
      _assertEqual(sectionSrc.includes('Two checks follow'), true, 'AC8 note names the checks');
      const mk = new Function('escHtml', 'act', 'slaSeedPlan', 'slaProjectTypes', 'slaRowKind', '_dhSlaSeedResultHtml', '_dhSlaChecksHtml',
        sectionSrc + '\nreturn _dhRenderSlaTargetsHtml;')(escHtml, () => '', slaSeedPlan, slaProjectTypes, slaRowKind, () => '', () => '[CHECKS]');
      _assertEqual(mk({ slaTargets: { ok: true, missing: [], rows: [], integrity: { ok: true, noTargets: [], orphanOverrides: [] } } }).includes('[CHECKS]'), true, 'AC8 checks render when columns are present');
      _assertEqual(mk({ slaTargets: { ok: true, missing: ['TimeToHireDays'], rows: [] } }).includes('[CHECKS]'), false, 'AC8 no checks when columns are missing');
      _assertEqual(mk({ slaTargets: { ok: false, missing: [], rows: [] } }).includes('[CHECKS]'), false, 'AC8 no checks when the list is unreadable');
    },
  },
  {
    name: 'N-389 docs — Readme.html changelog, user-guide SLA section and Rejection Intelligence subsection',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') _skip('AC10/11 doc checks need the filesystem (node tests/run.js)');
      const readme = ALL_HTML['Readme.html'], guide = ALL_HTML['user-guide.html'];
      _assertEqual(/N-381[^<]*N-389/.test(readme), true, 'AC10 changelog entry names the epic range');
      _assertEqual(/N-386[^<]*parked until Jan 2027/.test(readme), true, 'AC10 changelog says N-386 is parked until Jan 2027');
      _assertEqual(readme.includes('checkSlaIntegrity'), true, 'AC10 Readme names the checks');
      _assertEqual(guide.includes('<a href="#sla">Service levels (SLAs)</a>') && guide.includes('id="sla"'), true, 'AC11 nav link and section id');
      const ids = new Set((guide.match(/\sid="([^"]+)"/g) || []).map(s => s.slice(5, -1)));
      const dead = (guide.match(/href="#([^"]+)"/g) || []).map(s => s.slice(7, -1)).filter(h => !ids.has(h));
      _assertEqual(dead, [], 'AC11 every in-page anchor resolves');
      const rs = guide.indexOf('id="rejections"');
      const next = guide.indexOf('class="guide-section"', rs + 10);
      const sub = guide.indexOf('<h3>Rejection Intelligence</h3>', rs);
      _assertEqual(rs > -1 && sub > rs && (next < 0 || sub < next), true, 'AC11 Rejection Intelligence h3 sits inside the rejections section');
      _assertEqual(guide.includes('guide-search.js'), true, 'AC11 guide search still loaded');
      _assertEqual(/not live yet/i.test(guide) && !/you will be notified|you.ll be notified/i.test(guide), true, 'AC11 says breach notifications are not live yet');
    },
  },
  {
    name: 'N-381 independence — SLA seed does not read ANALYTICS_BENCHMARKS; the benchmark is unchanged',
    fn: function () {
      _assertEqual(CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays, 45, 'AC15 benchmark unchanged');
      _assertEqual(CONFIG.SLA.SEED_DEFAULTS.timeToHireDays, 45, 'AC15 seed literal');
      const orig = CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays;
      try {
        CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays = 60;
        _assertEqual(slaSeedPlan([])[0].TimeToHireDays, 45, 'AC15 moving the benchmark does not move the seed');
      } finally { CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays = orig; }
      if (typeof ALL_SOURCES === 'undefined') _skip('AC15 source scan needs the filesystem (node tests/run.js)');
      const utils = ALL_SOURCES['utils.js'];
      const slaBlock = utils.slice(utils.indexOf('// ── SLA targets (N-381'), utils.indexOf('// ── Text escaping'));
      _assertEqual(slaBlock.length > 500, true, 'AC15 found the utils.js SLA block');
      _assertEqual(slaBlock.includes('ANALYTICS_BENCHMARKS'), false, 'AC15 utils SLA helpers never reference the benchmark');
      const admin = ALL_SOURCES['api-admin.js'];
      const adminBlock = admin.slice(admin.indexOf('// ── SLA targets (N-381'));
      _assertEqual(adminBlock.length > 300, true, 'AC15 found the api-admin.js SLA block');
      _assertEqual(adminBlock.includes('ANALYTICS_BENCHMARKS'), false, 'AC15 api-admin SLA code never references the benchmark');
    },
  }
);