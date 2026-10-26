// tests/assert-rejection-intel.js — Rejection Intelligence engine (N-387, DA-7): config +
// self-check, the moved period rule, salary parsing, country resolution, the LCI benchmark
// index, per-rejection facts, clusters, funnel pass-through, money gating and purity.
// Loads AFTER tests/assert-sla-rollup.js and pushes into ASSERTIONS. Fixture:
// FIXTURES.rejectionIntel.

(function () {
  const F = FIXTURES.rejectionIntel;
  const throwsOn = (fn, label) => { let t = false; try { fn(); } catch (e) { t = true; } if (!t) throw new Error(label + ': expected a throw'); };
  const liveCfg = () => JSON.parse(JSON.stringify({ reasons: CONFIG.REJECTION_REASONS, intel: CONFIG.REJECTION_INTEL }));
  const mutated = f => { const c = liveCfg(); f(c); return c; };
  const index = () => buildOfferBenchmarkIndex(F.models, F.lciRows);
  const facts = () => buildRejectionFacts(F.rejections, F.roles, index());
  const cluster = (r, key) => r.clusters.find(c => c.key === key);
  // Every key anywhere in a value (objects and arrays, recursively).
  const allKeys = (v, out = []) => {
    if (Array.isArray(v)) v.forEach(x => allKeys(x, out));
    else if (v && typeof v === 'object') Object.keys(v).forEach(k => { out.push(k); allKeys(v[k], out); });
    return out;
  };
  // An amount key: offer / bench / median / min / max, or offer… / bench… camelCase
  // (offerMedian, benchMedian). 'offers' (a funnel COUNT) is not money.
  const MONEY_KEY = /^(offer|bench)[A-Z]|^(offer|bench|median|min|max)$/;
  const summary = inc => rejectionIntelSummary({ rejections: F.rejections, roles: F.roles, activity: F.activity, models: F.models, lciRows: F.lciRows, includeFigures: inc });

  ASSERTIONS.push(
    {
      name: 'N-387 config — REJECTION_REASONS, REJECTION_INTEL, rejectionIntelConfigCheck',
      fn: function () {
        _assertEqual(CONFIG.REJECTION_REASONS, ['Salary', 'Motivations', 'Counter-offer', 'Took another opportunity', 'Other'], 'AC1 reasons, display order');
        const I = CONFIG.REJECTION_INTEL;
        _assertEqual([I.minRejections, I.minMatchedOffers, I.minBenchmarkN, I.minFunnelDen], [5, 3, 3, 20], 'AC1 Standard thresholds (Chris, 26 Oct 2026)');
        _assertEqual(I.plausibleRatio, { min: 0.25, max: 4 }, 'AC1 plausible band');
        _assertEqual(rejectionIntelConfigCheck(), true, 'AC1 live config passes');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { c.reasons.pop(); })), 'AC1 four reasons');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { c.reasons[1] = 'Salary'; })), 'AC1 duplicate reason');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { c.reasons[4] = ' '; })), 'AC1 blank reason');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { c.reasons[4] = 'Unclassified'; })), 'AC1 reserved Unclassified');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { c.intel.minRejections = 0; })), 'AC1 threshold 0');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { c.intel.minFunnelDen = 2.5; })), 'AC1 non-integer threshold');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { delete c.intel.minBenchmarkN; })), 'AC1 missing threshold');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { c.intel.plausibleRatio = { min: 0, max: 4 }; })), 'AC1 ratio min 0');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { c.intel.plausibleRatio = { min: 0.5, max: 0.9 }; })), 'AC1 ratio max < 1');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { c.intel.countryAliases.atlantis = 'Atlantis'; })), 'AC1 alias to an unknown country');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { c.intel.countryAliases['Great Britain'] = 'UK'; })), 'AC1 alias key not lower-case');
        throwsOn(() => rejectionIntelConfigCheck(mutated(c => { delete c.intel; })), 'AC1 missing block');
      },
    },
    {
      name: 'N-387 one reason list — no page redeclares it; panel uses rejectionInPeriod',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('ALL_SOURCES is only provided by tests/run.js');
        const hits = Object.keys(ALL_SOURCES).filter(f => ALL_SOURCES[f].indexOf('Took another opportunity') > -1);
        _assertEqual(hits, ['config.js'], 'AC2 the reason literal lives only in config.js');
        _assertEqual(/CONFIG\.REJECTION_REASONS\s*\n?\s*\.map\(/.test(ALL_SOURCES['forms.js']), true, 'AC2 rejection form options from config');
        _assertEqual(/const M_REJECT_REASONS = CONFIG\.REJECTION_REASONS;/.test(ALL_SOURCES['mobile-reporting-ext.js']), true, 'AC2 mobile alias');
        const dp = ALL_SOURCES['dashboard-project-panels.js'];
        const i = dp.indexOf('function renderRejectionPanel(');
        const fnSrc = dp.slice(i, dp.indexOf('\n}\n', i));
        _assertEqual(fnSrc.indexOf('rejections.filter(rej => rejectionInPeriod(rej, start, end))') > -1, true, 'AC3 panel filters through rejectionInPeriod');
        _assertEqual(fnSrc.indexOf('const reasons = CONFIG.REJECTION_REASONS;') > -1, true, 'AC3 panel reasons from config');
        _assertEqual(fnSrc.indexOf('new Date(rej.RejectionDate)'), -1, 'AC3 no second copy of the period rule');
      },
    },
    {
      name: 'N-387 rejectionInPeriod — blank date always in, both bounds inclusive',
      fn: function () {
        const start = new Date(2026, 8, 1), end = new Date(2026, 8, 30, 23, 59, 59);
        _assertEqual(rejectionInPeriod({ RejectionDate: null }, start, end), true, 'AC3 null date');
        _assertEqual(rejectionInPeriod({ RejectionDate: '' }, start, end), true, 'AC3 blank date');
        _assertEqual(rejectionInPeriod({}, start, end), true, 'AC3 missing date');
        _assertEqual(rejectionInPeriod({ RejectionDate: '2026-09-01T12:00:00Z' }, start, end), true, 'AC3 first day');
        _assertEqual(rejectionInPeriod({ RejectionDate: '2026-09-30T12:00:00Z' }, start, end), true, 'AC3 last day (midday anchor, BST)');
        _assertEqual(rejectionInPeriod({ RejectionDate: '2026-08-31T12:00:00Z' }, start, end), false, 'AC3 day before');
        _assertEqual(rejectionInPeriod({ RejectionDate: '2026-10-01T12:00:00Z' }, start, end), false, 'AC3 day after');
        _assertEqual(rejectionInPeriod(null, start, end), false, 'AC3 no row');
      },
    },
    {
      name: 'N-387 parseSalaryAmount + countryFromLocationText',
      fn: function () {
        _assertEqual(parseSalaryAmount('45,000'), 45000, 'AC4 commas');
        _assertEqual(parseSalaryAmount(' 52000 '), 52000, 'AC4 whitespace');
        _assertEqual(parseSalaryAmount(61000), 61000, 'AC4 a number');
        _assertEqual(parseSalaryAmount('45k'), null, 'AC4 "45k" is not 45');
        ['', null, undefined, 0, '0', '-5', 'n/a', NaN].forEach(v => _assertEqual(parseSalaryAmount(v), null, 'AC4 ' + String(v)));
        _assertEqual(countryFromLocationText('Bucharest, Romania'), 'Romania', 'AC5 city, country');
        _assertEqual(countryFromLocationText('London, United Kingdom'), 'UK', 'AC5 alias');
        _assertEqual(countryFromLocationText('Belfast, Northern Ireland'), 'UK', 'AC5 Northern Ireland is not Ireland');
        _assertEqual(countryFromLocationText('Dublin, Ireland'), 'Ireland', 'AC5 Ireland');
        _assertEqual(countryFromLocationText('romania'), 'Romania', 'AC5 country alone, any case');
        _assertEqual(countryFromLocationText('Lisbon , PORTUGAL '), 'Portugal', 'AC5 spacing and case');
        _assertEqual(countryFromLocationText('Cluj, Romania, EU'), 'Romania', 'AC5 last-to-first: first hit wins');
        _assertEqual(countryFromLocationText('Bucharest'), null, 'AC5 no country');
        _assertEqual(countryFromLocationText('Ukraine'), null, 'AC5 no substring match ("UK")');
        _assertEqual(countryFromLocationText(''), null, 'AC5 blank');
        _assertEqual(countryFromLocationText(null), null, 'AC5 null');
      },
    },
    {
      name: 'N-387 buildOfferBenchmarkIndex + offerBenchmarkFor',
      fn: function () {
        const idx = index();
        _assertEqual(idx.length, 8, 'AC6 eight qualifying CoE rows');
        _assertEqual(idx.some(b => b.salary === 999999), false, 'AC6 legacy row dropped');
        _assertEqual(idx.some(b => b.modelId === '4'), false, 'AC6 a model with no country dropped');
        _assertEqual(idx.some(b => b.salary === 5000 || b.salary === 50000), false, 'AC6 orphan and blank-title rows dropped');
        _assertEqual(idx.filter(b => b.country === 'UK' && b.ccy === 'GBP').length, 3, 'AC6 alias country resolved on the index');
        _assertEqual(offerBenchmarkFor(idx, 'Senior Java Developer', 'Romania', 'RON'), { median: 70000, n: 3, min: 60000, max: 80000 }, 'AC7 median of three');
        _assertEqual(offerBenchmarkFor(idx, '  senior   JAVA developer ', 'Romania', 'RON'), { median: 70000, n: 3, min: 60000, max: 80000 }, 'AC7 case / whitespace-insensitive title');
        _assertEqual(offerBenchmarkFor(idx, 'Data Engineer', 'Portugal', 'EUR'), { median: 42000, n: 2, min: 40000, max: 44000 }, 'AC7 even count');
        _assertEqual(offerBenchmarkFor(idx, 'Senior Java Developer', 'Romania', 'EUR'), null, 'AC7 currency must match');
        _assertEqual(offerBenchmarkFor(idx, 'Senior Java Developer', 'Portugal', 'RON'), null, 'AC7 country must match');
        _assertEqual(offerBenchmarkFor(idx, '', 'Romania', 'RON'), null, 'AC7 no title');
        _assertEqual(offerBenchmarkFor(idx, 'Senior Java Developer', null, 'RON'), null, 'AC7 no country');
        _assertEqual(offerBenchmarkFor(idx, 'Senior Java Developer', 'Romania', ''), null, 'AC7 no currency');
      },
    },
    {
      name: 'N-387 buildRejectionFacts — salary status, reason, gap, unlinked',
      fn: function () {
        const r = facts();
        _assertEqual(r.unlinked, 1, 'AC8 unresolvable role counted');
        _assertEqual(r.facts.length, 13, 'AC8 one fact per linked rejection');
        const by = Object.fromEntries(r.facts.map(f => [f.rejectionId, f]));
        const status = Object.fromEntries(r.facts.map(f => [f.rejectionId, f.salaryStatus]));
        _assertEqual(status, {
          1: 'matched', 2: 'matched', 3: 'matched', 4: 'noOffer', 5: 'implausible', 6: 'thinBenchmark',
          7: 'noCurrency', 8: 'noOffer', 9: 'matched', 10: 'matched', 11: 'noBenchmark', 12: 'matched', 14: 'thinBenchmark',
        }, 'AC8 statuses');
        _assertEqual([1, 2, 3, 9, 10, 12].map(i => by[i].gapPct), [-0.1, -0.2, 0.1, -0.05, 0, 0.08], 'AC8 gaps, 4 dp');
        _assertEqual(by[5].gapPct, null, 'AC8 no gap unless matched');
        _assertEqual(by[8].reason, 'Unclassified', 'AC8 unlisted reason');
        _assertEqual(by[8].day, null, 'AC8 blank date stays null');
        _assertEqual(by[1].day, '2026-09-01', 'AC8 day');
        _assertEqual([by[1].projectId, by[10].projectId, by[7].ccy, by[10].ccy], [10, 20, null, 'GBP'], 'AC8 project and derived currency');
        _assertEqual(by[6].discipline + '|' + by[6].location, 'Data|Portugal', 'AC8 dimensions');
        _assertEqual(allKeys(r).some(k => k === 'Title' || k === 'CandidateName' || k === 'Notes'), false, 'AC11 facts carry no candidate or notes');
      },
    },
    {
      name: 'N-387 clusterRejections — claims, reason maps, tie-break, salary aggregate, dims',
      fn: function () {
        const r = facts();
        const P = clusterRejections(r.facts, 'project', { unlinked: r.unlinked });
        _assertEqual(P.clusters.map(c => [c.key, c.n, c.claim]), [['10', 10, true], ['20', 3, false]], 'AC9 project claim gate (5)');
        _assertEqual(P.totals, { n: 13, unlinked: 1, matched: 6 }, 'AC9 totals');
        const A = cluster(P, '10'), B = cluster(P, '20');
        _assertEqual(A.reasons, { Salary: 6, Motivations: 1, 'Counter-offer': 1, 'Took another opportunity': 0, Other: 1, Unclassified: 1 }, 'AC9 full reason map');
        _assertEqual([A.topReason, A.topShare], ['Salary', 0.6], 'AC9 top reason');
        _assertEqual([B.topReason, B.topShare], ['Salary', 0.3333], 'AC9 three-way tie → REJECTION_REASONS order');
        _assertEqual(A.salary, { matched: 4, gapMedianPct: -0.075, claim: true, statuses: { noOffer: 2, noCurrency: 1, noBenchmark: 0, thinBenchmark: 2, implausible: 1 } }, 'AC9 salary aggregate');
        _assertEqual([B.salary.matched, B.salary.gapMedianPct, B.salary.claim], [2, 0.04, false], 'AC9 salary claim gate (3)');
        const R = clusterRejections(r.facts, 'reason');
        _assertEqual(R.clusters.map(c => c.key + ':' + c.n), ['Salary:7', 'Counter-offer:2', 'Motivations:1', 'Other:1', 'Took another opportunity:1', 'Unclassified:1'], 'AC9 reason dim, n desc then key');
        _assertEqual(Object.keys(cluster(R, 'Salary').reasons).length, 6, 'AC9 reason dim keeps the full map');
        const L = clusterRejections(r.facts, 'location');
        _assertEqual(L.clusters.map(c => c.key + ':' + c.n), ['Romania:7', 'UK:3', 'Portugal:2', ':1'], 'AC9 location dim (blank key last)');
        const D = clusterRejections(r.facts, 'discipline');
        _assertEqual(D.clusters.map(c => c.key + ':' + c.n), ['Engineering:8', 'Data:3', 'Product:2'], 'AC9 discipline dim');
        _assertEqual(clusterRejections([], 'project'), { dim: 'project', clusters: [], totals: { n: 0, unlinked: 0, matched: 0 } }, 'AC9 empty');
        throwsOn(() => clusterRejections(r.facts, 'tp'), 'AC9 unknown dim');
      },
    },
    {
      name: 'N-387 money gating — % gap only unless includeFigures; single-currency figures only',
      fn: function () {
        const dm = summary(false);
        _assertEqual(allKeys(dm).filter(k => MONEY_KEY.test(k)), [], 'AC10 no money key without includeFigures');
        _assertEqual(allKeys(rejectionIntelSummary({ rejections: F.rejections, roles: F.roles, activity: F.activity, models: F.models, lciRows: F.lciRows })).filter(k => MONEY_KEY.test(k)), [], 'AC10 the default is false');
        _assertEqual(allKeys(rejectionIntelSummary({ rejections: F.rejections, roles: F.roles, activity: F.activity, models: F.models, lciRows: F.lciRows, includeFigures: 'yes' })).filter(k => MONEY_KEY.test(k)), [], 'AC10 only true opens it');
        const lead = summary(true);
        const A = cluster(lead.byProject, '10').salary;
        _assertEqual([A.ccy, A.offerMedian, A.benchMedian, A.mixedCurrency], ['RON', 64750, 70000, false], 'AC10 single-currency figures');
        const CO = cluster(lead.byReason, 'Counter-offer').salary;
        _assertEqual([CO.ccy, CO.offerMedian, CO.benchMedian, CO.mixedCurrency], [null, null, null, true], 'AC10 mixed currency → no figures');
        const none = cluster(lead.byReason, 'Other').salary;
        _assertEqual([none.offerMedian, none.mixedCurrency], [null, false], 'AC10 nothing matched → no figures, not mixed');
        _assertEqual(['offerMedian', 'benchMedian', 'offer', 'bench', 'median', 'min', 'max'].every(k => MONEY_KEY.test(k)), true, 'AC10 positive control: the key test detects every money key');
        _assertEqual(['offers', 'gapMedianPct', 'matched', 'priorRate', 'minRejections'].some(k => MONEY_KEY.test(k)), false, 'AC10 negative control: counts and rates are not money');
        _assertEqual(allKeys(lead).filter(k => MONEY_KEY.test(k)).length > 0, true, 'AC10 positive control: the walk finds money keys when present');
      },
    },
    {
      name: 'N-387 rejectionIntelSummary — shape, no candidate data, no facts array',
      fn: function () {
        const s = summary(true);
        _assertEqual(Object.keys(s).sort(), ['byDiscipline', 'byLocation', 'byProject', 'byReason', 'funnelByDiscipline', 'funnelByLocation', 'funnelByProject', 'totals'], 'AC11 entry-point shape');
        _assertEqual(s.totals, { n: 13, unlinked: 1, matched: 6 }, 'AC11 totals');
        _assertEqual(allKeys(s).some(k => k === 'Title' || k === 'CandidateName' || k === 'Notes' || k === 'facts'), false, 'AC11 no candidate, notes or facts key');
        const txt = JSON.stringify(s);
        _assertEqual(txt.indexOf('Candidate') === -1 && txt.indexOf('private note') === -1, true, 'AC11 no candidate or note text');
        _assertEqual(JSON.stringify(summary(false)).indexOf('Candidate'), -1, 'AC11 DM view too');
      },
    },
    {
      name: 'N-387 rejectionFunnel — clamp, rates, priors, claim gate, worst step, dims',
      fn: function () {
        const P = rejectionFunnel(F.activity, F.roles, 'project');
        _assertEqual(P.rows.map(r => [r.key, r.submitted, r.interview, r.offers]), [['10', 24, 14, 2], ['20', 8, 4, 1]], 'AC12 sums by project (unknown role dropped)');
        const A = P.rows[0];
        _assertEqual(A.steps.map(s => [s.from, s.to, s.num, s.den, s.claim]), [
          ['Submitted', 'Interview 1', 12, 24, true],
          ['Interview 1', 'Offer', 2, 14, false],
          ['Submitted', 'Offer', 2, 24, true],
        ], 'AC12 clamped numerators (role 103 interview without submission adds 0) and the claim gate (20)');
        _assertEqual(A.steps.map(s => Math.round(s.rate * 1e4) / 1e4), [0.5, 0.1429, 0.0833], 'AC12 rates');
        _assertEqual(A.steps.map(s => Math.round(s.priorRate * 1e4) / 1e4), [0.8, 0.2, 0.16], 'AC12 company priors (product for the overall step)');
        _assertEqual(A.worstStep, 2, 'AC12 worst claimable step by rate / prior');
        _assertEqual([P.rows[1].steps.some(s => s.claim), P.rows[1].worstStep], [false, null], 'AC12 nothing claimable → null');
        const L = rejectionFunnel(F.activity, F.roles, 'location');
        _assertEqual(L.rows.map(r => r.key + ':' + r.submitted), ['Romania:24', 'UK:8', 'Portugal:0'], 'AC12 location dim');
        const D = rejectionFunnel(F.activity, F.roles, 'discipline');
        _assertEqual(D.rows.map(r => r.key + ':' + r.submitted), ['Engineering:24', 'Product:8', 'Data:0'], 'AC12 discipline dim');
        _assertEqual(D.rows[2].steps[0].rate, null, 'AC12 zero denominator → null rate');
        _assertEqual(rejectionFunnel([], F.roles, 'project'), { dim: 'project', rows: [] }, 'AC12 empty');
        throwsOn(() => rejectionFunnel(F.activity, F.roles, 'reason'), 'AC12 reason dim');
        throwsOn(() => rejectionFunnel(F.activity, F.roles, 'tp'), 'AC12 unknown dim');
        _assertEqual(CONFIG.ANALYTICS_BENCHMARKS.submissionConversion, 0.80, 'AC12 priors read, not written');
      },
    },
    {
      name: 'N-387 purity — no I/O in the engine block, inputs not mutated',
      fn: function () {
        const before = JSON.stringify(F);
        summary(true); summary(false);
        clusterRejections(facts().facts, 'reason', { includeFigures: true });
        _assertEqual(JSON.stringify(F), before, 'AC13 fixture not mutated');
        if (typeof ALL_SOURCES === 'undefined') return;
        const src = ALL_SOURCES['analytics.js'];
        const i = src.indexOf('// ── Rejection Intelligence engine (N-387 / DA-7)');
        _assertEqual(i > -1, true, 'AC13 banner present');
        const block = src.slice(i);
        _assertEqual(/getItems|graphRequest|fetch\(|document\.|window\.|localStorage|sessionStorage/.test(block), false, 'AC13 no Graph / DOM / storage in the block');
        _assertEqual(/lciBenchmark\(/.test(block.replace(/\/\/[^\n]*/g, '')), false, 'AC13 lciBenchmark not called (sales-only file, wrong location rule)');
      },
    }
  );
})();