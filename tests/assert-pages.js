// tests/assert-pages.js — mobile Sales form, home.js split, Placements/scorecards, project options, People KPI figures, Market Report metrics.
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  // ---- N-322: mobile Sales forecast form ----------------------------------
  {
    name: 'N-322: mobile Sales form - Edit finds the forecast by string id, and .is-hidden is defined for mobile.html',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined' || typeof ALL_CSS === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const code = _vendorStripJsComments(ALL_SOURCES['mobile-sales.js']).join('\n');
      _assertEqual(/\bx\.id\s*===\s*editId\b/.test(code), false, 'no strict x.id === editId (ids are strings, the card passes a Number)');
      _assertEqual(code.indexOf('String(x.id) === String(editId)') !== -1, true, 'the forecast lookup compares String(x.id) === String(editId)');
      // mobile.html does not load css/style.css, so it needs its own .is-hidden rule
      // (in css/mobile.css since N-324 moved its <style> block to a file).
      const styles = ALL_CSS['mobile.css'] || '';
      const rules = styles.match(/\.is-hidden\s*\{[^}]*\}/g) || [];
      _assertEqual(rules.length, 1, 'css/mobile.css defines .is-hidden exactly once');
      _assertEqual(/display\s*:\s*none\s*!important/.test(rules[0] || ''), true, '.is-hidden is display: none !important');
      _assertEqual(/rel=["']stylesheet["'][^>]*style\.css/.test(ALL_HTML['mobile.html']), false, 'mobile.html still does not load style.css (if it ever does, this rule is redundant)');
    },
  },
  {
    name: 'N-323: home.js is init only - banner, survey widget and revenue maths live in their owning files, and load before home.js',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const code = f => _vendorStripJsComments(ALL_SOURCES[f]).join('\n');
      const defines = (f, n) => new RegExp('(^|\\n)\\s*(async\\s+)?function\\s+' + n + '\\s*\\(').test(code(f));
      const owners = {
        'home-banner.js': ['ccBadgeHTML', 'refreshCCBanner', 'renderCCBadges', 'renderCommandCentreBanner'],
        'survey-widget.js': ['initSurveyWidget', 'notifySurveyClosing'],
        'analytics.js': ['revenueForecastCalc', 'computeRevenueRAG'],
        'home.js': ['initHome', 'handleSignOut', 'openQuickLinks', 'closeQuickLinks', 'initQuickLinks'],
      };
      Object.keys(owners).forEach(f => owners[f].forEach(n => {
        Object.keys(ALL_SOURCES).forEach(g => _assertEqual(defines(g, n), g === f, n + (g === f ? ' is defined in ' : ' is not defined in ') + g));
      }));
      Object.keys(ALL_SOURCES).forEach(g => _assertEqual(defines(g, '_ccRevenueCalc'), false, '_ccRevenueCalc (retired, N-323) is not defined in ' + g));
      _assertEqual(code('cc-pages.js').indexOf('_ccRevenueCalc'), -1, 'cc-pages.js no longer mentions _ccRevenueCalc');
      // home.js still registers exactly the four actions, and the new files register none.
      const reg = /registerActions\(\{([^}]*)\}\)/.exec(code('home.js'));
      _assertEqual(!!reg && reg[1].split(',').map(s => s.trim()).filter(Boolean), ['openQuickLinks', 'closeQuickLinks', 'handleSignOut', 'refreshCCBanner'], 'home.js registerActions names');
      ['home-banner.js', 'survey-widget.js'].forEach(f => _assertEqual(code(f).indexOf('registerActions('), -1, f + ' registers no actions'));
      // Load order on index.html.
      const list = []; ALL_HTML['index.html'].replace(/<script\b([^>]*)>/gi, (m, a) => { const s = /\bsrc\s*=\s*"([^"]*)"/i.exec(a); if (s) list.push({ src: s[1], defer: /\bdefer\b/.test(a) }); return m; });
      const at = n => list.findIndex(s => s.src === 'js/' + n);
      const order = ['actions.js', 'analytics.js', 'notifications.js', 'command-bar.js', 'home-banner.js', 'survey-widget.js', 'home.js'];
      order.forEach((n, i) => {
        _assertEqual(at(n) >= 0 && list[at(n)].defer, true, 'index.html: js/' + n + ' is present and deferred');
        if (i) _assertEqual(at(n) > at(order[i - 1]), true, 'index.html: js/' + n + ' loads after js/' + order[i - 1]);
      });
    },
  },
  {
    name: 'N-330: formatLongDay / placementTimeToHireLabel',
    fn: function () {
      _assertEqual(formatLongDay('2026-10-13'), '13 October 2026', 'long day');
      _assertEqual(formatLongDay('2026-03-29'), '29 March 2026', 'BST changeover day is not shifted');
      _assertEqual(formatLongDay('2026-01-01'), '1 January 2026', 'first of the year');
      _assertEqual([formatLongDay(''), formatLongDay(null), formatLongDay('2026-10-13T00:00:00Z')], [null, null, null], 'unparseable -> null');
      _assertEqual(
        [32, 1, 0, '45', null, undefined, '', 'x'].map(placementTimeToHireLabel),
        ['32 days', '1 day', '0 days', '45 days', '—', '—', '—', '—'],
        'Time to Hire labels');
    },
  },
  {
    // N-330: dashboard-project-panels.js / report-builder.js are DOM-bound and
    // not loaded by run.js — the renderers are lifted out of the source text.
    name: 'N-330: Placements 7 columns + project-to-date tiles (palette order, registry sync, all-time, conversion %)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || !ALL_SOURCES['dashboard-project-panels.js']) {
        _skip('Source extraction needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const dp = ALL_SOURCES['dashboard-project-panels.js'];
      const rb = ALL_SOURCES['report-builder.js'];
      const fnSrc = (src, name) => {
        const s = src.indexOf('function ' + name + '(');
        _assertEqual(s > -1, true, name + ' located');
        return src.slice(s, src.indexOf('\n}\n', s) + 2);
      };

      // Palette: order + registry sync + no filter mark on the PTD tiles.
      const p0 = rb.indexOf('const RB_PALETTE = [');
      const pal = rb.slice(p0, rb.indexOf('];', p0));
      const keys = Array.from(pal.matchAll(/key:\s*'(\w+)'/g)).map(m => m[1]);
      _assertEqual(keys.indexOf('placementsPTD'), keys.indexOf('placements') + 1, 'Placements (PTD) directly below Placements');
      _assertEqual(keys.indexOf('pipelineSummaryPTD'), keys.indexOf('pipelineSummary') + 1, 'Pipeline Summary (PTD) directly below Pipeline Summary');
      ['placementsPTD', 'pipelineSummaryPTD'].forEach(k => {
        const line = pal.split('\n').find(l => l.indexOf("'" + k + "'") > -1);
        _assertEqual(/scope:\s*'project'/.test(line) && !/filtered/.test(line), true, k + ' is project-scope and unfiltered');
      });
      const reg = dp.slice(dp.indexOf('const REPORT_PANELS = {'));
      keys.filter(k => k !== 'candidateSnapshot').forEach(k =>
        _assertEqual(new RegExp('\\n  ' + k + ':').test(reg), true, 'REPORT_PANELS has ' + k));

      // Renderers, with the period helpers stubbed (they live in dashboard-core.js).
      const stubs = 'const getDetailPeriodRange = () => ({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) });\n' +
        "const activityInDetailPeriod = a => a.WeekEndingDate >= '2026-10-01';\n" +
        'const DETAIL_PERIOD_OPTIONS = [];\n' +
        "const emptyStateBlock = o => '<empty>' + o.message + '</empty>';\n";
      const lib = new Function(stubs + fnSrc(dp, 'pipelineTotalsCells') + fnSrc(dp, 'renderPipelineActivityTable') +
        fnSrc(dp, 'renderPlacementsPanel') +
        '\nreturn { pipelineTotalsCells, renderPipelineActivityTable, renderPlacementsPanel };')();
      const roles = [{ id: 1, RoleTitle: 'Engineer', Location: 'Lisbon' }, { id: 2, RoleTitle: 'Analyst' }];
      const pls = [
        { CandidateName: 'Ann', RoleIDLookupId: 1, OfferAcceptedDate: '2026-10-05T12:00:00Z', ProvisionalStartDate: '2026-11-02T12:00:00Z', Currency: 'EUR', SalaryAgreed: 50000, TimeToHire: 32 },
        { CandidateName: 'Bob', RoleIDLookupId: 2, OfferAcceptedDate: '2026-04-05T12:00:00Z', Currency: 'GBP', SalaryAgreed: 40000 },
      ];
      const ths = h => Array.from(h.matchAll(/<th>([^<]*)<\/th>/g)).map(m => m[1]);
      const pPeriod = lib.renderPlacementsPanel(pls, roles, 'x');
      _assertEqual(ths(pPeriod), ['Candidate', 'Role', 'Offer Accepted', 'Start Date', 'Currency', 'Salary', 'Time to Hire'], 'Placements header order');
      _assertEqual((pPeriod.match(/<tr>\s*<td>/g) || []).length, 1, 'period tile: 1 row (Bob is outside the period)');
      _assertEqual((pPeriod.match(/<td>/g) || []).length, 7, 'row has 7 cells');
      _assertEqual(/<td>2026-11-02<\/td>/.test(pPeriod) && /<td>32 days<\/td>/.test(pPeriod), true, 'Start Date + Time to Hire cells');
      const pAll = lib.renderPlacementsPanel(pls, roles, null, { allTime: true });
      _assertEqual((pAll.match(/<tr>\s*<td>/g) || []).length, 2, 'project-to-date: both placements, period ignored');
      _assertEqual(/Placements \(project to date\)/.test(pAll), true, 'PTD title');
      _assertEqual((pAll.match(/<td>—<\/td>/g) || []).length, 2, 'blank Start Date + Time to Hire render as —');
      _assertEqual(/on this project yet/.test(lib.renderPlacementsPanel([], roles, null, { allTime: true })), true, 'PTD empty state');

      const acts = [
        { RoleIDLookupId: 1, WeekEndingDate: '2026-10-11', Outreach: 10, Responses: 5 },
        { RoleIDLookupId: 1, WeekEndingDate: '2026-03-01', Outreach: 30, Responses: 5 },
        { RoleIDLookupId: 2, WeekEndingDate: '2026-02-01', Outreach: 20, Responses: 10 },
      ];
      const ptd = lib.renderPipelineActivityTable(acts, roles, null, { allTime: true, conversionPct: true, title: 'Pipeline Summary (project to date)' });
      _assertEqual((ptd.match(/<tr>/g) || []).length, 3, 'PTD: header + one row per role');
      _assertEqual(/<strong>60<\/strong>/.test(ptd) && /<strong>20<\/strong><br>\(33%\)/.test(ptd), true, 'PTD totals are all-time with conversion %');
      const per = lib.renderPipelineActivityTable(acts, roles, 'x');
      _assertEqual(/<strong>10<\/strong>/.test(per) && !/%\)/.test(per), true, 'control: Pipeline Activity stays period-filtered, no %');
      _assertEqual(lib.pipelineTotalsCells([10, 0, 0], { conversionPct: true }),
        '<td style="text-align:center"><strong>10</strong></td><td style="text-align:center"><strong>0</strong><br>(0%)</td><td style="text-align:center"><strong>0</strong></td>',
        'no % where the previous total is 0');
    },
  },
  {
    name: 'N-342: computeFunnelScorecard — Hires row counts placements, not Weekly Activity hires; Offer success still uses activity',
    fn: function () {
      const { activity, placements, benchmarks } = FIXTURES.analytics2.velocity;   // activity Hires 2, one placement
      const get = (rows, label) => rows.find(m => m.label === label).value;
      const rows = computeFunnelScorecard(activity, placements, benchmarks);
      _assertEqual(get(rows, 'Hires'), 1, 'one placement, not the 2 typed into Weekly Activity');
      _assertEqual(get(rows, 'Offer success'), 40, 'Offer success stays activity Hires / Offers (2 / 5)');
      _assertEqual(get(computeFunnelScorecard(activity, [placements[0], placements[0], placements[0]], benchmarks), 'Hires'), 3, 'control: more placements, more hires');
      _assertEqual(get(computeFunnelScorecard(activity, [], benchmarks), 'Hires'), 0, 'no placements, no hires');
      _assertEqual(get(computeFunnelScorecard(activity, null, benchmarks), 'Hires'), 0, 'null placements, no hires');
    },
  },
  {
    name: 'N-342: placementsSinceWeeks — whole-day window, exact 13-week boundary included, blank date dropped, weeks 0 = all, input not mutated',
    fn: function () {
      const today  = new Date(2026, 9, 16, 17, 30);   // late in the day: the old time-of-day cut dropped the boundary row
      const dayAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return localDayISO(d); };
      const rows = [
        { id: 1, placementDate: dayAgo(91) + 'T00:00:00Z' },   // exactly 13 weeks ago
        { id: 2, placementDate: dayAgo(92) + 'T00:00:00Z' },   // one day too old
        { id: 3, placementDate: dayAgo(10) + 'T00:00:00Z' },
        { id: 4, placementDate: null },
      ];
      const before = JSON.stringify(rows);
      _assertEqual(placementsSinceWeeks(rows, 13, today).map(r => r.id), [1, 3], '13 weeks: boundary day in, 92 days out, blank date out');
      _assertEqual(placementsSinceWeeks(rows, 4, today).map(r => r.id), [3], '4 weeks');
      _assertEqual(placementsSinceWeeks(rows, 0, today).length, 4, 'weeks 0 = no window, every row');
      _assertEqual(placementsSinceWeeks(null, 13, today), [], 'null input');
      _assertEqual(JSON.stringify(rows), before, 'input not mutated');
      const oldCutoff = new Date(today); oldCutoff.setDate(oldCutoff.getDate() - 91);
      _assertEqual(new Date(rows[0].placementDate) >= oldCutoff, false, 'control: the old Date compare dropped the boundary row');
    },
  },
  {
    name: 'N-342: scorecard Hires for a TP = placement rows credited to them in the 13-week window (case-insensitive; other TPs and old rows excluded)',
    fn: function () {
      const today  = new Date(2026, 9, 16, 17, 30);
      const dayAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return localDayISO(d); };
      const hist = [
        { tpEmail: 'a@x.com', openDate: dayAgo(60),  placementDate: dayAgo(5)  + 'T00:00:00Z' },
        { tpEmail: 'A@X.com', openDate: dayAgo(120), placementDate: dayAgo(91) + 'T00:00:00Z' },
        { tpEmail: 'b@x.com', openDate: dayAgo(40),  placementDate: dayAgo(5)  + 'T00:00:00Z' },
        { tpEmail: 'a@x.com', openDate: dayAgo(200), placementDate: dayAgo(100) + 'T00:00:00Z' },
        { tpEmail: '',        openDate: dayAgo(40),  placementDate: dayAgo(5)  + 'T00:00:00Z' },
      ];
      const { benchmarks } = FIXTURES.analytics2.velocity;
      const mine = placementsSinceWeeks(hist, 13, today).filter(r => tpMatches(r.tpEmail, 'a@x.com'));
      const hires = rows => rows.find(m => m.label === 'Hires').value;
      _assertEqual(hires(computeFunnelScorecard([{ Hires: 9 }], mine, benchmarks)), 2, 'a@x.com: two in window (case-insensitive), activity Hires 9 ignored');
      _assertEqual(hires(computeFunnelScorecard([], placementsSinceWeeks(hist, 13, today).filter(r => tpMatches(r.tpEmail, 'b@x.com')), benchmarks)), 1, 'b@x.com: one');
    },
  },
  {
    name: 'N-336: scorecardMetricTips — tips only on the three benchmarked rows; none without bench; inputs not mutated; mixOwner wording',
    fn: function () {
      const { tpEmail, activity, placements, benchmarks } = FIXTURES.analytics2.velocity;
      const metrics = computeVelocityScore(tpEmail, activity, placements, benchmarks).metrics;
      const before  = JSON.stringify(metrics);
      const tipped  = scorecardMetricTips(metrics, benchmarks);
      _assertEqual(tipped.filter(m => m.tip).map(m => m.label),
        ['Outreach conversion', 'Submission conversion', 'Offer success'], 'tipped rows');
      _assertEqual(tipped[1].tip, learnedBenchmarkTip(benchmarks, 'submissionConversion'), 'tip text');
      _assertEqual(scorecardMetricTips(metrics, null).some(m => 'tip' in m), false, 'no bench, no tips');
      _assertEqual(JSON.stringify(metrics), before, 'input not mutated');
      const mix = { ...benchmarks, meta: { offerSuccess: { value: 0.3, prior: 0.3, n: 5, basis: 'mix', cells: 1, floored: false } } };
      _assertEqual(/this project hires in/.test(learnedBenchmarkTip(mix, 'offerSuccess', 'this project hires in')), true, 'project wording');
      _assertEqual(/this TP works in/.test(learnedBenchmarkTip(mix, 'offerSuccess')), true, 'TP default unchanged');
    },
  },
  {
    name: 'N-336: buildProjectScorecards — grouping, window cut, closed pipelines count, leave-project-out, x/y over open only, sort',
    fn: function () {
      const today  = new Date(2026, 9, 14);
      const dayAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return localDayISO(d); };
      const stage  = Object.keys(ROLE_STAGE_BUDGETS.budget)[0];
      const roles = [
        { id: 1, ProjectIDLookupId: 10, Stage: stage,  Department: 'Eng', Location: 'UK' },
        { id: 2, ProjectIDLookupId: 10, Stage: 'Hired', Department: 'Eng', Location: 'UK' },  // closed
        { id: 3, ProjectIDLookupId: 20, Stage: stage,  Department: 'Eng', Location: 'UK' },
        { id: 4, ProjectIDLookupId: 30, Stage: stage,  Department: 'Eng', Location: 'UK' },
      ];
      const projectMap = { 10: 'Acme', 20: 'Beta', 30: 'Cobalt' };
      const row = (rid, daysAgo, c) => Object.assign({ RoleIDLookupId: rid, TalentPartner: 'tp@x.com', WeekEndingDate: dayAgo(daysAgo),
        Outreach: 0, Responses: 0, Submitted: 0, Interview1: 0, Offers: 0, Hires: 0 }, c);
      const activity52 = [
        row(1, 7,  { Submitted: 10, Interview1: 5, Offers: 2, Hires: 1 }),
        row(2, 14, { Submitted: 10, Interview1: 5, Offers: 2, Hires: 1 }),    // closed pipeline, in window
        row(1, 60, { Submitted: 10, Interview1: 1, Offers: 1, Hires: 1 }),    // outside 4w, inside 13w
        row(3, 7,  { Submitted: 20, Interview1: 0 }),                         // Beta: low conversion → flagged
        row(4, 7,  { Submitted: 40, Interview1: 30, Offers: 10, Hires: 5 }),  // Cobalt
      ];
      const placements = [
        { id: 2, openDate: dayAgo(40),  placementDate: dayAgo(10) },  // 30 days, in 4w
        { id: 1, openDate: dayAgo(150), placementDate: dayAgo(60) },  // 90 days, 13w only
        { id: 4, openDate: dayAgo(30),  placementDate: dayAgo(5) },
      ];
      const openSince = new Map([['4', dayAgo(200)]]);   // Cobalt behind pace
      const args = { customers: ['Acme', 'Beta', 'Cobalt'], roles, projectMap, activity52, placements, stageHistory: {}, openSince, today };
      const m4  = buildProjectScorecards({ ...args, weeks: 4 });
      const m13 = buildProjectScorecards({ ...args, weeks: 13 });
      const by  = (cards, c) => cards.find(x => x.customer === c);
      const val = (card, label) => card.metrics.find(m => m.label === label).value;

      _assertEqual(m4.map(c => c.customer), ['Beta', 'Cobalt', 'Acme'], 'sort: flagged, then behind, then name');
      _assertEqual(by(m4, 'Acme').metrics.map(m => m.label),
        ['Submission conversion', 'Interview-to-offer', 'Offer success', 'Hires', 'Avg time to hire'], 'no Outreach row');
      _assertEqual(val(by(m4, 'Acme'), 'Hires'), 1, '4w hires = placements in the window (N-342), not Weekly Activity hires');
      _assertEqual(val(by(m13, 'Acme'), 'Hires'), 2, '13w adds the older placement (activity hires would say 3)');
      _assertEqual(val(by(m4, 'Acme'), 'Avg time to hire'), 30, '4w: only the in-window placement');
      _assertEqual(val(by(m13, 'Acme'), 'Avg time to hire'), 60, '13w: both placements');
      _assertEqual(by(m4, 'Acme').roleHealth.total, 1, 'x/y over open pipelines only');
      _assertEqual(m4.map(c => [c.roleHealth.flagged, c.roleHealth.behind]),
        m13.map(c => [c.roleHealth.flagged, c.roleHealth.behind]), 'flagged/behind do not move with the window');
      _assertEqual(by(m4, 'Beta').roleHealth.flagged, 1, 'Beta flagged on conversion');
      _assertEqual(by(m4, 'Cobalt').roleHealth.behind, 1, 'Cobalt behind pace');

      // leave-project-out: Cobalt's own strong offer success must not be in its benchmark
      const idx  = funnelRoleIndex(roles, 'Department', 'Location');
      const acts = activitySinceWeeks(activity52, 4, today).filter(a => a.RoleIDLookupId === 4);
      const self = learnFunnelBenchmarksMix(buildFunnelObservations(activity52, idx), buildFunnelObservations(acts, idx));
      // (compare learned n, not the rate — both rates can sit on the floor)
      _assertEqual(by(m4, 'Cobalt').bench.meta.submissionConversion.n, 50, 'benchmark excludes the project itself (Acme 30 + Beta 20)');
      _assertEqual(self.meta.submissionConversion.n, 90, 'control: without exclude the project is in the pool');
      _assertEqual(typeof by(m4, 'Cobalt').metrics[0].tip, 'string', 'benchmarked rows carry a tip');
      _assertEqual(buildProjectScorecards({ ...args, customers: [], weeks: 4 }), [], 'no customers, no cards');
    },
  },
  {
    name: 'N-336: scorecardCardHTML / scorecardHealthRows — escaping, no inline styles, x/y and — rows',
    fn: function () {
      const html = scorecardCardHTML({
        title: 'A<b>&co', windowLabel: 'Rolling Monthly View',
        healthRows: scorecardHealthRows({ total: 3, flagged: 1, stuck: 1, conversion: 0, behind: 2 }, 'Flagged pipelines'),
        metrics: [{ label: 'Hires', value: 2, unit: 'hires', rag: 'grey', informational: true },
                  { label: 'Offer success', value: null, unit: '%', rag: 'grey', tip: 'x"y' }],
      });
      _assertEqual(html.includes('A&lt;b&gt;&amp;co') && !html.includes('<b>&co'), true, 'title escaped');
      _assertEqual(/style=/.test(html), false, 'no inline styles');
      _assertEqual(html.includes('>1/3<') && html.includes('>2/3<') && html.includes('>2 hires<') && html.includes('>—<'), true, 'values');
      _assertEqual(html.includes('title="x&quot;y"'), true, 'tip escaped');
      _assertEqual(scorecardHealthRows(null, 'x'), [], 'no roleHealth, no rows');
      _assertEqual(scorecardHealthRows({ total: 0 }, 'x').map(r => r.value), ['—', '—'], 'no open pipelines → —');
    },
  },
  {
    name: 'N-356 isProjectCurrent — Active only; Transition, Completed, blank and null are not current',
    fn: function () {
      _assertEqual(isProjectCurrent({ Status: 'Active' }), true, 'Active');
      _assertEqual(isProjectCurrent({ Status: 'Transition' }), false, 'Transition');
      _assertEqual(isProjectCurrent({ Status: 'Completed' }), false, 'Completed');
      _assertEqual(isProjectCurrent({ Status: '' }), false, 'blank Status');
      _assertEqual(isProjectCurrent({}), false, 'no Status');
      _assertEqual(isProjectCurrent(null), false, 'null project');
      // Guard: isProjectActive (N-112) still counts Transition — the two must stay distinct.
      _assertEqual(isProjectActive({ Status: 'Transition' }), true, 'isProjectActive unchanged for Transition');
    },
  },
  {
    name: 'N-356 projectOptionLabels — plain name when unique, type when shared, start month when type blank or still shared, no mutation',
    fn: function () {
      const projects = [
        { id: 1, CustomerName: 'Acme', ProjectType: 'CoE', StartDate: '2025-01-15T12:00:00Z' },
        { id: 2, CustomerName: 'Pirum', ProjectType: 'CoE', StartDate: '2026-03-02T12:00:00Z' },
        { id: 3, CustomerName: ' pirum ', ProjectType: 'LCI', StartDate: '2026-05-01T12:00:00Z' },
        { id: 4, CustomerName: 'Zeta', ProjectType: 'Embedded', StartDate: '2024-06-10T12:00:00Z' },
        { id: 5, CustomerName: 'Zeta', ProjectType: 'Embedded', StartDate: '2026-09-01T12:00:00Z' },
        { id: 6, CustomerName: 'Blank Co', ProjectType: '', StartDate: '2026-02-01T12:00:00Z' },
        { id: 7, CustomerName: 'BLANK  co', ProjectType: 'MG AI', StartDate: '' },
        { id: 8, CustomerName: 'Nodate', ProjectType: 'CoE', StartDate: '' },
        { id: 9, CustomerName: 'Nodate', ProjectType: 'CoE' },
      ];
      const before = JSON.stringify(projects);
      const labels = projectOptionLabels(projects);
      _assertEqual(labels instanceof Map, true, 'returns a Map');
      _assertEqual(labels.get('1'), 'Acme', 'unique customer → plain name');
      _assertEqual(labels.get('2'), 'Pirum (CoE)', 'shared customer → type');
      _assertEqual(labels.get('3'), ' pirum  (LCI)', 'case/space variant counts as the same customer; raw name kept');
      _assertEqual(labels.get('4'), 'Zeta (Embedded, from 2024-06)', 'same customer + same type → start month');
      _assertEqual(labels.get('5'), 'Zeta (Embedded, from 2026-09)', 'same customer + same type → start month (2)');
      _assertEqual(labels.get('6'), 'Blank Co (from 2026-02)', 'shared customer, blank type → start month');
      _assertEqual(labels.get('7'), 'BLANK  co (MG AI)', 'shared customer, typed, unique label → type only');
      _assertEqual(labels.get('8'), 'Nodate (CoE)', 'still colliding with no StartDate → left as is');
      _assertEqual(labels.get('9'), 'Nodate (CoE)', 'still colliding with no StartDate → left as is (2)');
      _assertEqual(labels.size, 9, 'one label per project');
      _assertEqual(JSON.stringify(projects), before, 'input not mutated');
      _assertEqual(projectOptionLabels([]).size, 0, 'empty list');
      _assertEqual(projectOptionLabels(null).size, 0, 'null list');
    },
  },
  // ---- N-351: shared People KPI figures, Market Report metrics, library rows -
  {
    name: 'N-351: peopleKpiFigures — forecasts leave Active Customers and billed headcount; Unassigned ignored; previous-quarter counts as of its last day',
    fn: function () {
      const A = (id, name, cust, billed, forecast, s, e) => ({ AssignmentID: id, EmployeeName: name, Customer: cust, Level: 'TP', Billed: billed ? 'Yes' : 'No', IsForecast: forecast ? 'Yes' : 'No', StartDate: s, EndDate: e });
      const assigns = [
        A('a1', 'Ann', 'Acme', true, false, '2026-01-05', '2026-12-31'),
        A('a2', 'Bob', 'Beta', true, true, '2026-01-05', '2026-12-31'),        // forecast
        A('a3', 'Cat', 'Unassigned', false, false, '2026-01-05', '2026-12-31'),
        A('a4', 'Dan', 'Acme', true, false, '2026-10-05', '2026-12-31'),        // starts after 30 Sep
      ];
      const f = peopleKpiFigures(computeMonthlyRows(assigns), assigns, new Date(2026, 9, 20));
      _assertEqual(f.year, 2026, 'year from the pinned now');
      _assertEqual(f.activeCustomers, 1, 'Acme only — Beta is a forecast, Unassigned is ignored');
      _assertEqual(f.prevQCustomers, 1, 'as of 30 Sep: Acme');
      _assertEqual(f.billedHeadcount, 2, 'Ann + Dan billed; Bob (forecast) excluded');
      _assertEqual(f.prevQHeadcount, 1, 'as of 30 Sep: Ann only (Dan starts 5 Oct)');
      const q1 = peopleKpiFigures([], assigns, new Date(2026, 1, 10));
      _assertEqual(q1.prevQHeadcount, 0, 'Q1: previous quarter ends 31 Dec 2025, before any of these started');
    },
  },
  {
    name: 'N-351: monthlyRowsInRange is inclusive at both ends by local month start (1 Oct is in a range ending 1 Oct)',
    fn: function () {
      const rows = [1, 9, 10, 11].map(m => ({ Year: 2026, Month: m }));
      _assertEqual(monthlyRowsInRange(rows, new Date(2026, 0, 1), new Date(2026, 9, 1)).map(r => r.Month), [1, 9, 10], 'Jan–1 Oct');
      _assertEqual(monthlyRowsInRange(rows, new Date(2026, 9, 2), new Date(2026, 11, 31)).map(r => r.Month), [11], 'a start after the 1st excludes that month');
    },
  },
  {
    name: 'N-351: marketReportMetrics — rounded TAM percentages, pipeline sums, printed column order',
    fn: function () {
      const rows = [
        { Outreach: 60, Responses: 10, Screened: 5, Submitted: 4, Interview1: 3, Interview2Plus: 2, FinalInterview: 1, Offers: 1, Hires: 0 },
        { Outreach: 41, Responses: 5,  Screened: 5, Submitted: 2, Interview1: 1, Interview2Plus: 1, FinalInterview: 0, Offers: 0, Hires: 1 },
      ];
      const m = marketReportMetrics(rows, 300);
      _assertEqual(m.pctContacted, 34, '101 / 300 = 33.7% → 34');
      _assertEqual(m.pctResponded, 5, '15 / 300 = 5%');
      _assertEqual(Object.keys(m.pipeline), ['Screened', 'Submitted', 'IV1', 'IV2+', 'Final IV', 'Offers', 'Hires'], 'column order');
      _assertEqual(Object.values(m.pipeline), [10, 6, 4, 3, 1, 1, 1], 'sums');
      _assertEqual(marketReportMetrics([], 300).pipeline.Hires, 0, 'no activity → zeros');
    },
  },
  {
    name: 'N-351: reportLibraryRowHtml escapes raw values and only renders Delete when canDelete',
    fn: function () {
      const acts = { open: act('rbLoadReport', 7), copy: act('rbCopyReportAction', 7, ACT_EL), del: act('rbDeleteReport', 7, 't') };
      const row = reportLibraryRowHtml({ title: '<b>A&B</b>', detail: 'x"y', ownerLabel: "O'Neil", canDelete: false, acts });
      _assertEqual(row.includes('<b>'), false, 'title is escaped');
      _assertEqual(row.includes('&lt;b&gt;A&amp;B'), true, 'escaped title present');
      _assertEqual(row.includes('>Open<') && row.includes('>Copy<'), true, 'Open and Copy always render');
      _assertEqual(row.includes('>Delete<'), false, 'no Delete without canDelete');
      _assertEqual(row.includes('rbLoadReport') && row.includes('rbCopyReportAction'), true, 'caller action names land in the row');
      const withDel = reportLibraryRowHtml({ title: 't', detail: 'd', ownerLabel: 'o', canDelete: true, acts });
      _assertEqual(withDel.includes('>Delete<') && withDel.includes('rbDeleteReport'), true, 'Delete renders with canDelete');
    },
  },
  // ---- N-358: Market Report print canvas must not close an extra </div> ----
  {
    name: 'N-358: mrRenderPrintCanvas - balanced <div> open/close with and without offer rejections (and mrRenderCanvas, as a control)',
    fn: function () {
      const divs = function (html) {
        return { open: (html.match(/<div\b/g) || []).length, close: (html.match(/<\/div>/g) || []).length };
      };
      const balanced = function (html) { const d = divs(html); return d.open === d.close; };
      const saved = { data: _mrData, tam: _mrTam, title: _mrTitle, obs: _mrObs };
      try {
        const rejections = [
          { CandidateName: 'A & B <x>', RoleTitle: 'Engineer', Reason: 'Counter-offer', Detail: '"quoted" <b>bold</b>' },
          { CandidateName: 'C', RoleTitle: 'Engineer', Reason: 'Salary', Detail: '' },
        ];
        _mrTam = 1000; _mrTitle = 'Test report'; _mrObs = '<p>Notes</p>';

        _mrData = { activity: [], role: {}, rejections: rejections, openDay: null };
        const withRej = mrRenderPrintCanvas();
        _assertEqual(withRej.indexOf('Offer Rejection Reasons') !== -1, true, 'rejections card is rendered');
        _assertEqual(withRej.indexOf('<b>bold</b>') === -1, true, 'free text in rejections stays escaped');
        _assertEqual(balanced(withRej), true, 'print canvas is balanced with rejections: ' + JSON.stringify(divs(withRej)));

        _mrData = { activity: [], role: {}, rejections: [], openDay: null };
        const noRej = mrRenderPrintCanvas();
        _assertEqual(noRej.indexOf('Offer Rejection Reasons') === -1, true, 'no rejections card when there are none');
        _assertEqual(balanced(noRej), true, 'print canvas is balanced without rejections: ' + JSON.stringify(divs(noRej)));

        // Control 1: the interactive canvas is balanced with the same rejections.
        const interactive = mrRenderCanvas({
          title: 'T', tam: 1000, pctContacted: 0, pctResponded: 0, daysOpen: null,
          pipeline: { Screened: 0, Hires: 0 }, rejections: rejections, obsHtml: '',
        });
        _assertEqual(balanced(interactive), true, 'interactive canvas is balanced with rejections: ' + JSON.stringify(divs(interactive)));
        // Control 2: the counter detects a stray </div> (guards against a check that cannot fail).
        _assertEqual(balanced(withRej + '</div>'), false, 'the balance counter flags one extra </div>');
      } finally {
        _mrData = saved.data; _mrTam = saved.tam; _mrTitle = saved.title; _mrObs = saved.obs;
      }
    },
  },
  // ---- N-364: Project page shell -------------------------------------------
  {
    name: 'N-364: projectPageFields - type, status, dates and Lead DM (Projects.DeliveryManager), blanks read em dash',
    fn: function () {
      const val = (fields, label) => fields.filter(f => f.label === label)[0].value;
      const full = projectPageFields(
        { ProjectType: 'Embedded', Status: 'Active', StartDate: '2026-03-02T00:00:00Z', EndDate: '2026-09-30T00:00:00Z', DeliveryManager: 'Dm@Example.com' },
        { 'dm@example.com': 'Dana Manager' });
      _assertEqual(full.map(f => f.label), ['Type', 'Status', 'Start', 'End', 'Lead DM'], 'labels and order');
      _assertEqual(val(full, 'Type'), 'Embedded', 'type');
      _assertEqual(val(full, 'Status'), 'Active', 'status');
      _assertEqual(val(full, 'Start'), spDateIn('2026-03-02T00:00:00Z'), 'start goes through spDateIn');
      _assertEqual(val(full, 'End'), spDateIn('2026-09-30T00:00:00Z'), 'end goes through spDateIn');
      _assertEqual(val(full, 'Lead DM'), 'Dana Manager', 'Lead DM resolved case-insensitively through the map');
      const bare = projectPageFields({ Status: 'Transition' }, {});
      _assertEqual(val(bare, 'Type'), '\u2014', 'blank type reads em dash');
      _assertEqual(val(bare, 'Start'), '\u2014', 'blank start reads em dash');
      _assertEqual(val(bare, 'End'), '\u2014', 'blank end reads em dash');
      _assertEqual(val(bare, 'Lead DM'), '\u2014', 'blank DM reads em dash');
      _assertEqual(val(projectPageFields({ DeliveryManager: 'x@y.com' }, {}), 'Lead DM'), 'x@y.com', 'unmapped DM falls back to the email');
      _assertEqual(projectPageFields(null, null).length, 5, 'null project does not throw');
    },
  },
  {
    name: 'N-364: every project name opens the Project page - projectNameLinkHtml, checklistNameHtml gone, redirects in place',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const code = f => _vendorStripJsComments(ALL_SOURCES[f]).join('\n');
      const pages = code('pages.js');
      _assertEqual(pages.indexOf('checklistNameHtml') === -1, true, 'checklistNameHtml is deleted and unreferenced in pages.js');
      _assertEqual(/function projectNameLinkHtml\(p, pending\)\s*\{\s*if \(pending\) return escHtml\(p\.CustomerName\);/.test(pages), true, 'a pending row is plain text');
      _assertEqual(pages.indexOf("act('openProjectPage.prevent', Number(p.id))") !== -1, true, 'a real row opens openProjectPage whether or not it has a checklist');
      _assertEqual(pages.indexOf('projectNameLinkHtml(p, pending)') !== -1, true, 'projectRowHtml uses it');
      _assertEqual(code('checklists.js').indexOf("if (recordType === 'project') return openProjectPage(id);") !== -1, true, "openChecklist('project') redirects to the Project page");
      _assertEqual(code('app.js').indexOf("action === 'project' && page === 'projects'") !== -1, true, 'the action=project deep link is handled');
      const pp = code('project-page.js');
      _assertEqual(/_ckView|_ckBusy/.test(pp), false, 'project-page.js never touches checklist state directly');
    },
  },
  {
    // N-379: the Project Dashboard passed `roles` where renderRejectionPanel takes `period`,
    // so getDetailPeriodRange() fell to its default and the panel was always "this month".
    name: 'N-379: Offer Rejection Reasons follows the Detail period picker (callers pass the period; panel filters by it)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || !ALL_SOURCES['dashboard-project.js'] || !ALL_SOURCES['dashboard-project-panels.js']) {
        _skip('Source extraction needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const calls = _vendorStripJsComments(ALL_SOURCES['dashboard-project.js']).join('\n').match(/renderRejectionPanel\([^)]*\)/g) || [];
      _assertEqual(calls.length, 2, 'dashboard-project.js calls renderRejectionPanel twice (initial render + period re-render)');
      calls.forEach(c => _assertEqual(/^renderRejectionPanel\(\s*[\w.]*rejections\s*,\s*_dashDetailPeriod\s*,\s*[\w.]*roles\s*\)$/.test(c), true, 'call passes (rejections, _dashDetailPeriod, roles) with the period SECOND: ' + c));
      _assertEqual(/rejections:\s*\(data, period\)\s*=>\s*renderRejectionPanel\(data\.rejections, period, data\.roles\)/.test(ALL_SOURCES['dashboard-project-panels.js']), true, 'Report Builder REJECTIONS panel passes (data.rejections, period, data.roles)');
      const dp = ALL_SOURCES['dashboard-project-panels.js'];
      const s = dp.indexOf('function renderRejectionPanel(');
      _assertEqual(s > -1, true, 'renderRejectionPanel located');
      const stubs = 'const getDetailPeriodRange = p => p === "last_month" ? { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30, 23, 59, 59) } : { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31, 23, 59, 59) };\n' +
        "const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');\n" +
        "const emptyStateBlock = o => '<empty>' + o.message + '</empty>';\n";
      const render = new Function(stubs + dp.slice(s, dp.indexOf('\n}\n', s) + 2) + '\nreturn renderRejectionPanel;')();
      const roles = [{ id: 1, RoleTitle: 'Engineer', Location: 'Lisbon' }, { id: 2, RoleTitle: 'A<B' }];
      const rejs = [
        { RoleIDLookupId: 1, RejectionDate: '2026-10-10T12:00:00Z', RejectionReason: 'Other' },
        { RoleIDLookupId: 1, RejectionDate: '2026-10-11T12:00:00Z', RejectionReason: 'Other' },
        { RoleIDLookupId: 1, RejectionDate: '2026-10-12T12:00:00Z', RejectionReason: 'Salary' },
        { RoleIDLookupId: 2, RejectionDate: '2026-10-13T12:00:00Z', RejectionReason: 'Salary' },
        { RoleIDLookupId: 99, RejectionDate: '2026-10-14T12:00:00Z', RejectionReason: 'Salary' },
        { RoleIDLookupId: 1, RejectionDate: '2026-09-15T12:00:00Z', RejectionReason: 'Motivations' },
      ];
      const cell = h => Array.from(h.matchAll(/<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><td>(\d+)<\/td><\/tr>/g)).map(m => [m[1], m[2], m[3]]);
      const ths = h => Array.from(h.matchAll(/<th>([^<]*)<\/th>/g)).map(m => m[1]);
      const cur = render(rejs, 'this_month', roles), last = render(rejs, 'last_month', roles);
      _assertEqual(ths(cur), ['Role', 'Reason', 'Count'], 'header is Role | Reason | Count');
      _assertEqual(/%/.test(cur), false, 'no % column');
      _assertEqual(cell(cur), [
        ['A&lt;B', 'Salary', '1'],
        ['Engineer (Lisbon)', 'Other', '2'],
        ['Engineer (Lisbon)', 'Salary', '1'],
        ['Unknown Role', 'Salary', '1'],
      ], 'this_month: one row per role + reason, counts merged, escaped once, unknown role labelled, sorted by role then count');
      _assertEqual(cell(last), [['Engineer (Lisbon)', 'Motivations', '1']], 'last_month shows only the September rejection');
      _assertEqual(/<empty>No rejections/.test(render([], 'this_month', roles)), true, 'empty state kept');
    },
  },
  {
    name: 'N-397 Briefing Pack project list — own project kept once, never mutated; both entry points load it',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('briefing-pack.js source needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const src = ALL_SOURCES['briefing-pack.js'];
      const fnBody = name => { const i = src.indexOf(name); if (i < 0) return ''; const m = /\r?\n\}\r?\n/.exec(src.slice(i)); return m ? src.slice(i, i + m.index + m[0].length) : src.slice(i); };
      const merge = new Function(fnBody('function bpWithOwnProject(') + '\nreturn bpWithOwnProject;')();
      const scoped = [{ id: 1 }, { id: 2 }];
      const all = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
      _assertEqual(merge(scoped, all, '3').map(p => p.id), [1, 2, 3], 'AC5 out-of-scope own project appended');
      _assertEqual(merge(scoped, all, 3).map(p => p.id), [1, 2, 3], 'AC5 numeric id matches too');
      _assertEqual(merge(scoped, all, '2'), scoped, 'AC5 in-scope own project is not duplicated (same list back)');
      _assertEqual(merge(scoped, all, null), scoped, 'AC6 no project: nothing added');
      _assertEqual(merge(scoped, all, '99'), scoped, 'AC6 project row gone: nothing added');
      _assertEqual(merge(scoped, [], '3'), scoped, 'AC5 not in the full list either: nothing added');
      _assertEqual(scoped.map(p => p.id), [1, 2], 'input list never mutated (it may be a shared cache array)');
      _assertEqual(merge(scoped, all, '3').some(p => p.id === 4), false, 'AC5 no other out-of-scope project leaks in');

      const loader = fnBody('async function bpLoadProjects(');
      _assertEqual(/seesAllProjects\(_resolvedRole\)\s*\?\s*await getProjects\(false\)\s*:\s*await getScopedProjects\(getCurrentUser\(\)\.email, false\)/.test(loader), true, 'AC4 all-seeing roles get every project, others their scope');
      _assertEqual(/missing \? await getProjects\(false\) : \[\]/.test(loader), true, 'AC5 the full list is fetched only when the own project is missing');

      const start = fnBody('async function bpStartNewPack(');
      _assertEqual(/await bpLoadProjects\(\);/.test(start) && start.indexOf('getScopedProjects') === -1, true, 'AC8 + Briefing Pack uses the shared loader');
      _assertEqual(/if \(_bpProjects\.length && !_bpProjectId\) _bpProjectId = String\(_bpProjects\[0\]\.id\);/.test(start), true, 'AC8 first project still preselected on a new pack');

      const load = fnBody('async function bpLoadPack(');
      const iProj = load.indexOf('await bpLoadProjects(_bpProjectId);'), iRoles = load.indexOf('await bpLoadRoles();');
      _assertEqual(iProj > 0 && iRoles > iProj, true, 'AC1 bpLoadPack loads projects (with its own project) before roles');
      _assertEqual(load.indexOf('bpApplyRoleAutofill') === -1, true, 'AC7 opening a pack never overwrites its saved fields');

      const side = fnBody('function bpRenderSidebar(');
      _assertEqual(/_bpProjects\.some\(p => String\(p\.id\) === String\(_bpProjectId\)\) \? '' : '<option value="" selected>Select a project\.\.\.<\/option>'/.test(side), true, 'AC6 placeholder whenever no option matches the pack\'s project (none chosen, or its row is gone)');
      _assertEqual(/function bpSetProject\(val\)/.test(src) && /async function bpSetProject\(val\)[\s\S]*?_bpRoleId\s*=\s*'';[\s\S]*?bpLoadRoles\(\)[\s\S]*?bpApplyRoleAutofill\(\)/.test(src), true, 'AC3 changing project resets role, reloads roles and re-fills the header');
      const save = fnBody('async function bpSavePack(');
      _assertEqual(/ProjectID:\s+_bpProjectId \? parseInt\(_bpProjectId\) : null/.test(save) && /RoleID:\s+_bpRoleId\s+\? parseInt\(_bpRoleId\)\s+: null/.test(save), true, 'AC3 save writes the chosen ProjectID / RoleID');
      _assertEqual(/if \(_bpPackId\) \{\s*await updateBriefingPack\(_bpPackId, payload\);/.test(save) && save.split('PackOwner').length === 2, true, 'AC3 update path never touches PackOwner (only the create path sets it)');
    },
  },
  {
    name: 'N-398 canReassignBriefingPack / dmProjectIdsFromAssignments / briefingPackReassignCandidates — who may reassign, who can receive',
    fn: function () {
      const R = CONFIG.ROLE_IDS;
      const pack = { PackOwner: 'Owner@Momentum.com', ProjectID: 12 };
      const can = (role, email, p, dm) => canReassignBriefingPack(role, email, p === undefined ? pack : p, dm === undefined ? [] : dm);
      _assertEqual(can(R.ADMIN, 'x@y.z'), true, 'AC1 admin');
      _assertEqual(can(R.TALENT_PARTNER, 'owner@momentum.com'), true, 'AC1 owner, case-insensitive');
      _assertEqual(can(R.DELIVERY_MANAGER, 'dm@y.z', undefined, ['12']), true, 'AC1 DM on the pack\'s project');
      _assertEqual(can(R.LEADERSHIP, 'lead@y.z', undefined, ['12']), true, 'AC1 Leadership holding a DM row on the project');
      _assertEqual(can(R.TALENT_PARTNER, 'tp@y.z'), false, 'AC1 non-owner TP');
      _assertEqual(can(R.DELIVERY_MANAGER, 'dm@y.z', undefined, ['99']), false, 'AC1 DM on a different project');
      _assertEqual(can(R.DELIVERY_MANAGER, 'dm@y.z'), false, 'AC1 DM with no DM row');
      _assertEqual(can(R.LEADERSHIP, 'lead@y.z'), false, 'AC1 Leadership without a DM row');
      _assertEqual(canReassignBriefingPack(R.TALENT_PARTNER, 'tp@y.z', { PackOwner: 'o@y.z', ProjectID: '12' }, ['12']), true, 'a string ProjectID matches');
      const loose = { PackOwner: 'owner@momentum.com', ProjectID: null };
      _assertEqual(can(R.TALENT_PARTNER, 'owner@momentum.com', loose), true, 'AC2 owner of a project-less pack');
      _assertEqual(can(R.ADMIN, 'x@y.z', loose), true, 'AC2 admin on a project-less pack');
      _assertEqual(can(R.DELIVERY_MANAGER, 'dm@y.z', loose, ['12']), false, 'AC2 no DM route without a project');
      _assertEqual(can(R.DELIVERY_MANAGER, 'dm@y.z', { PackOwner: 'o@y.z', ProjectID: 0 }, ['0']), false, 'AC2 ProjectID 0 is not a project');
      _assertEqual(canReassignBriefingPack(R.ADMIN, 'a@b.c', null, []), false, 'fails closed: no pack');
      _assertEqual(can(R.TALENT_PARTNER, '', { PackOwner: '', ProjectID: null }), false, 'fails closed: a blank email never matches a blank owner');
      _assertEqual(can(R.DELIVERY_MANAGER, 'dm@y.z', undefined, null), false, 'fails closed: malformed DM list');
      _assertEqual(can(R.DELIVERY_MANAGER, 'dm@y.z', undefined, '12'), false, 'fails closed: a string is not a list');

      const ua = [
        { AssignedRole: 'delivery_manager', ProjectID: 5, Active: true },
        { AssignedRole: 'delivery_manager', ProjectID: 5 },
        { AssignedRole: 'delivery_manager', ProjectID: '7' },
        { AssignedRole: 'delivery_manager', ProjectID: 8, Active: false },
        { AssignedRole: 'delivery_manager', ProjectID: 0 },
        { AssignedRole: 'talent_partner', ProjectID: 6 },
        { AssignedRole: 'admin', ProjectID: 0 },
        null,
      ];
      _assertEqual(dmProjectIdsFromAssignments(ua), ['5', '7'], 'AC1 only active delivery_manager rows with a real project, de-duplicated');
      _assertEqual(dmProjectIdsFromAssignments(null), [], 'null rows give no projects');

      const rows = [
        { UserEmail: 'Zed@y.z', UserName: 'Zed', AssignedRole: 'talent_partner', Active: true },
        { UserEmail: 'amy@y.z', UserName: 'Amy', AssignedRole: 'delivery_manager' },
        { UserEmail: 'AMY@y.z', UserName: 'Amy Duplicate', AssignedRole: 'talent_partner' },
        { UserEmail: 'old@y.z', UserName: 'Old', AssignedRole: 'talent_partner', Active: false },
        { UserEmail: 'adm@y.z', UserName: 'Adm', AssignedRole: 'admin' },
        { UserEmail: 'owner@momentum.com', UserName: 'Owner', AssignedRole: 'talent_partner' },
        { UserEmail: '', UserName: 'No Email' },
        { UserEmail: 'noname@y.z', AssignedRole: 'talent_partner' },
        null,
      ];
      const before = JSON.stringify(rows);
      _assertEqual(briefingPackReassignCandidates(rows, 'OWNER@momentum.com'), [
        { email: 'amy@y.z', name: 'Amy' },
        { email: 'noname@y.z', name: 'noname@y.z' },
        { email: 'zed@y.z', name: 'Zed' },
      ], 'AC3 de-duplicated, lower-cased, sorted; inactive, admin, blank-email and current-owner rows dropped; missing name falls back to the email');
      _assertEqual(JSON.stringify(rows), before, 'input rows never mutated');
      _assertEqual(briefingPackReassignCandidates(null, 'x@y.z'), [], 'AC8 null rows give no candidates');
      _assertEqual(briefingPackReassignCandidates([{ UserEmail: 'only@y.z', UserName: 'Only' }], 'only@y.z'), [], 'AC8 the owner alone leaves nobody');
      _assertEqual(briefingPackReassignCandidates(rows).length, 4, 'no current owner: the owner row is kept');
    },
  },
  {
    name: 'N-398 Reassign wiring — library button gated, action registered once, re-check before the write, payload is only PackOwner',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('briefing-pack.js source needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const src = ALL_SOURCES['briefing-pack.js'];
      const fnBody = name => { const i = src.indexOf(name); if (i < 0) return ''; const m = /\r?\n\}\r?\n/.exec(src.slice(i)); return m ? src.slice(i, i + m.index + m[0].length) : src.slice(i); };
      const lib = fnBody('async function showBriefingPackLibrary(');
      _assertEqual(/getDmProjectIds\(user\.email\)/.test(lib) && /_bpDmProjectIds = dmIds;/.test(lib), true, 'AC1 the library loads the user\'s DM projects once');
      const render = fnBody('function _bpRenderLibrary(');
      _assertEqual(/const canReassign = canReassignBriefingPack\(_resolvedRole, me, p, _bpDmProjectIds\);/.test(render), true, 'AC1 button gated by the shared permission function');
      _assertEqual(/\$\{canReassign \? `<button class="btn-secondary"\$\{act\('bpReassignPackAction', Number\(p\.id\), ACT_EL\)\}>Reassign<\/button>` : ''\}/.test(render), true, 'AC1 Reassign button markup');
      _assertEqual((render.match(/<th>/g) || []).length, 5, 'AC9 the table is still five columns');
      _assertEqual(/bpDeletePack/.test(render) && /bpCopyPackAction/.test(render) && /bpLoadPack/.test(render), true, 'AC9 Open / Copy / Delete untouched');
      _assertEqual((src.match(/^\s+bpReassignPackAction,$/gm) || []).length, 1, 'action registered exactly once');
      const action = fnBody('async function bpReassignPackAction(');
      _assertEqual(action !== '', true, 'bpReassignPackAction exists');
      const writes = action.match(/updateBriefingPack\([^;]*\);/g) || [];
      _assertEqual(writes, ['updateBriefingPack(id, { PackOwner: chosen.email });'], 'AC4 exactly one write and its payload is only PackOwner');
      const iFirst = action.indexOf('canReassignBriefingPack('), iModal = action.indexOf('selectModal('),
            iSecond = action.indexOf('canReassignBriefingPack(', iFirst + 1), iWrite = action.indexOf('updateBriefingPack(');
      _assertEqual(iFirst > 0 && iFirst < iModal && iModal < iSecond && iSecond < iWrite, true, 'AC6 permission checked before the dialog AND again on fresh reads after it, before the write');
      _assertEqual((action.match(/getBriefingPackById\(id\)/g) || []).length, 2, 'AC6 the pack is fetched fresh both times');
      _assertEqual(/people\.find\(p => p\.email === String\(picked\)\.toLowerCase\(\)\)/.test(action) && /if \(!chosen\)/.test(action), true, 'AC7 the picked value must be in the candidate list');
      _assertEqual(/if \(picked === null\) return;/.test(action), true, 'AC5 cancel writes nothing');
      _assertEqual(action.indexOf('innerHTML') === -1, true, 'no markup built from names');
      _assertEqual(/pack\.ProjectID\s*\?\s*await getTalentPartnersForProject\(pack\.ProjectID\)\s*:\s*await getAllAssignableUsers\(\)/.test(action), true, 'AC2/3 project people, or all assignable users when the pack has no project');
      const save = fnBody('async function bpSavePack(');
      _assertEqual(save.split('PackOwner').length === 2, true, 'AC9 bpSavePack still sets PackOwner only on create');
      const apiSrc = ALL_SOURCES['api.js'];
      const dm = apiSrc.slice(apiSrc.indexOf('async function getDmProjectIds('));
      _assertEqual(/fields\/Title eq '\$\{odataStr\(lower\)\}'/.test(dm.slice(0, 600)) && /dmProjectIdsFromAssignments\(rows\)/.test(dm.slice(0, 600)) && /getGhostUser\(\) \|\| email/.test(dm.slice(0, 600)), true, 'getDmProjectIds: ghost-aware, same UserAssignments read as getUserProjectIds, filtered by the pure helper');
      _assertEqual(/if \(accessScopeMode\(\) === 'assignments'\) return dmProjectIdsFromScope\(rows, await getUserProjectIds\(lower\)\);/.test(dm.slice(0, 600)), true, 'N-368 getDmProjectIds: assignments mode = DM role + Assignments scope');
    },
  }
);
