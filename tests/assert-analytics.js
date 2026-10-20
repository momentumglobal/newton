// tests/assert-analytics.js — Kaplan-Meier/TTF, funnel learning, weekly anomalies and acks, stage budgets/flags, velocity/funnel scores.
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  {
    name: 'computeVelocityScore — full metrics array against fixed benchmarks',
    fn: function () {
      const { tpEmail, activity, placements, benchmarks } = FIXTURES.analytics2.velocity;
      const out = computeVelocityScore(tpEmail, activity, placements, benchmarks);
      _assertEqual(out, {
        tpEmail: 'tp@x.com',
        window: '13 weeks',
        metrics: [
          { label: 'Outreach conversion', value: 40, unit: '%', rag: 'green' },
          { label: 'Submission conversion', value: 50, unit: '%', rag: 'green' },
          { label: 'Interview-to-offer', value: 2, unit: ':1', rag: 'green' },
          { label: 'Offer success', value: 40, unit: '%', rag: 'green' },
          { label: 'Hires', value: 1, unit: 'hires', rag: 'grey', informational: true },
          { label: 'Avg time to hire', value: 45, unit: 'days', rag: 'green' },
        ],
      }, 'computeVelocityScore');
    },
  },
  {
    name: 'computeRoleFunnel — full funnel array against fixed benchmarks',
    fn: function () {
      const { totals, benchmarks } = FIXTURES.analytics2.funnel;
      const out = computeRoleFunnel(totals, benchmarks);
      _assertEqual(out, [
        { stage: 'Response', conv: 40, benchmarked: true, rag: 'green' },
        { stage: 'IV1 Conv.', conv: 50, benchmarked: true, rag: 'green' },
        { stage: 'IV→Offer', conv: 50, benchmarked: true, rag: 'green' },
        { stage: 'Offer Success', conv: 40, benchmarked: true, rag: 'green' },
      ], 'computeRoleFunnel');
    },
  },
  {
    name: 'N-269 kaplanMeier / kmQuantile — uncensored, censored (bias fix), ties, empty',
    fn: function () {
      const ev = t => ({ t, event: true }), ce = t => ({ t, event: false });
      const r2 = x => Math.round(x * 10000) / 10000;
      const a = kaplanMeier([ev(10), ev(20), ev(30), ev(40)]);
      _assertEqual(a.map(s => [s.t, s.survival]), [[10, 0.75], [20, 0.5], [30, 0.25], [40, 0]], 'AC1 curve');
      _assertEqual(kmQuantile(a, 0.5), 20, 'AC1 median');
      const b = kaplanMeier([ev(10), ce(15), ev(20), ce(25), ev(30)]);
      _assertEqual(b.map(s => [s.t, s.atRisk, r2(s.survival)]), [[10, 5, 0.8], [20, 3, 0.5333], [30, 1, 0]], 'AC2 curve');
      _assertEqual([kmQuantile(b, 0.25), kmQuantile(b, 0.5), kmQuantile(b, 0.75)], [20, 30, 30], 'AC2 q25/median/q75');
      const c = kaplanMeier([ev(10), ce(10), ev(20)]);
      _assertEqual(c[0].atRisk, 3, 'AC3 censored tie still at risk');
      _assertEqual(kaplanMeier([]), [], 'AC4 empty');
      _assertEqual(kaplanMeier([ce(5), ce(9)]), [], 'AC4 all censored');
      _assertEqual(kmQuantile([], 0.5), null, 'AC4 quantile of empty');
    },
  },
  {
    name: 'N-269 computeTTFPrediction — shape, pool ladder, censored stages, median not reached',
    fn: function () {
      const KEYS = ['label', 'weeks', 'stdDevWeeks', 'sampleSize', 'medianDays', 'bandDays', 'events',
        'censored', 'closed', 'basis', 'pooled', 'medianReached', 'maxObservedDays'].sort();  // N-276 added 'closed'
      const H = (fn, loc, days) => ({ functionArea: fn, country: loc,
        openDate: '2026-01-01T12:00:00Z',
        placementDate: new Date(Date.UTC(2026, 0, 1 + days, 12)).toISOString() });
      // UTC day, matching daysOpen()'s UTC 'today' — a local day would be off by one near midnight in BST.
      const ago = d => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10) + 'T12:00:00Z';
      const O = (fn, loc, stage, d) => ({ Department: fn, Location: loc, Stage: stage, OpenDate: ago(d) });
      const hist = [H('Eng', 'UK', 14), H('Eng', 'UK', 28), H('Eng', 'UK', 42), H('Eng', 'PT', 70)];

      const exact = computeTTFPrediction('Eng', 'UK', hist);
      _assertEqual(Object.keys(exact).sort(), KEYS, 'AC5 keys (estimate)');
      _assertEqual([exact.basis, exact.pooled, exact.sampleSize, exact.medianDays], ['function+location', false, 3, 28], 'AC6/7 exact, 3-arg call');
      _assertEqual([exact.label, exact.weeks, exact.stdDevWeeks, exact.bandDays], ['~4w ±2w', 4, 2, 14], 'AC5 label/weeks/band');

      const fb = computeTTFPrediction('Eng', 'PT', hist);
      _assertEqual([fb.basis, fb.pooled, fb.sampleSize], ['function', true, 4], 'AC8 fallback to function');

      const none = computeTTFPrediction('Sales', 'UK', hist);
      _assertEqual(Object.keys(none).sort(), KEYS, 'AC5 keys (insufficient)');
      _assertEqual([none.label, none.weeks, none.basis, none.sampleSize], ['Insufficient data', null, null, 0], 'AC9 insufficient');

      const stages = ['Backlog', 'Planning', 'On-hold', 'Cancelled', 'Closed',
        'Sourcing', 'Submitted', 'Interview 1', 'Interview 2+', 'Final Interview', 'Offered'];
      const withOpen = computeTTFPrediction('Eng', 'UK', hist, stages.map(s => O('Eng', 'UK', s, 5)));
      _assertEqual(withOpen.censored, 6, 'AC10 only Sourcing..Offered censored');

      const many = [1, 2, 3, 4, 5].map(() => O('Eng', 'UK', 'Sourcing', 200));
      const nr = computeTTFPrediction('Eng', 'UK', hist, many);
      _assertEqual([nr.medianReached, nr.weeks, nr.label.charAt(0), nr.maxObservedDays], [false, null, '>', 200], 'AC11 median not reached');

      const all = computeTTFPrediction('', null, hist, [O('Sales', 'DE', 'Sourcing', 3)]);
      _assertEqual([all.basis, all.events, all.censored], ['all', 4, 1], 'AC12 no filters');
    },
  },
  {
    name: 'N-276 computeTTFPrediction closedCensored + config + getRoleStageHistory read',
    fn: function () {
      const H = (days) => ({ functionArea: 'Eng', country: 'UK', openDate: '2026-01-01T12:00:00Z',
        placementDate: new Date(Date.UTC(2026, 0, 1 + days, 12)).toISOString() });
      const hist = [H(10), H(20), H(30)];
      const C = (fn, loc, t) => ({ roleId: 'x', Department: fn, Location: loc, Stage: 'Cancelled', t });
      const base = computeTTFPrediction('Eng', 'UK', hist, []);
      _assertEqual([base.closed, base.censored, base.medianDays], [0, 0, 20], 'AC10 no 5th arg → closed 0');
      const r = computeTTFPrediction('Eng', 'UK', hist, [], [C('Eng', 'UK', 15), C('Sales', 'UK', 5), C('Eng', 'PT', 5)]);
      _assertEqual([r.events, r.sampleSize, r.censored, r.closed, r.medianDays], [3, 3, 1, 1, 20], 'AC9/AC11 filtered by fn/loc, censored not events');
      const none = computeTTFPrediction('Sales', 'UK', hist, [], [C('Sales', 'UK', 5)]);
      _assertEqual([none.label, none.closed, none.censored], ['Insufficient data', 1, 1], 'AC10 closed on the insufficient path');
      const nr = computeTTFPrediction('Eng', 'UK', hist, [], [1, 2, 3, 4, 5].map(() => C('Eng', 'UK', 300)));
      _assertEqual([nr.medianReached, nr.closed, nr.maxObservedDays], [false, 5, 300], 'AC10 closed on the median-not-reached path');

      _assertEqual(CONFIG.TTF_SURVIVAL.closedStages, ['On-hold', 'Cancelled'], 'AC1 closedStages');
      _assertEqual(CONFIG.TTF_SURVIVAL.closedLookbackDays, 365, 'AC1 lookback');
      _assertEqual(CONFIG.TTF_SURVIVAL.closedStages.every(s => CONFIG.ROLE_STAGES.includes(s)), true, 'AC1 stages exist');

      const saved = getItems; const calls = [];
      getItems = function (list, filter, select) { calls.push([list, filter, select]); return Promise.resolve([]); };
      try {
        getRoleStageHistory();
        _assertEqual(calls, [['RoleHistory', '', 'RoleIDLookupId,Field,OldValue,NewValue,ChangedAt']], 'AC2 one unfiltered, select-limited read');
      } finally { getItems = saved; }
    },
  },
  {
    name: 'N-270 learnFunnelBenchmarks — worked example, floor, no data, clamp, leave-self-out, pass-through',
    fn: function () {
      const ok = (cond, label) => _assertEqual(!!cond, true, label);
      const r6 = x => Math.round(x * 1e6) / 1e6;
      const prior = { outreachConversion: 0.25, submissionConversion: 0.8, interviewToOffer: 0.2, offerSuccess: 0.8, timeToHireDays: 45, flagThreshold: 0.8 };
      const cfg = { priorStrength: { outreachConversion: 200, submissionConversion: 20, interviewToOffer: 20, offerSuccess: 10 }, floorFraction: 0.8 };
      const O = (roleId, fn, loc, c) => ({ roleId, tp: 'tp@x.com', fn, loc,
        c: Object.assign({ Outreach: 0, Responses: 0, Submitted: 0, Interview1: 0, Offers: 0, Hires: 0 }, c) });
      // Spec worked example: G k=300 n=1000, F (Eng) k=100 n=500, C (Eng × PT) k=10 n=100.
      const obs = [
        O('1', 'Eng', 'PT', { Outreach: 100, Responses: 10 }),
        O('2', 'Eng', 'UK', { Outreach: 400, Responses: 90 }),
        O('3', 'Sales', 'UK', { Outreach: 500, Responses: 200 }),
      ];
      const opts = { prior, cfg };
      const c = learnFunnelBenchmarks(obs, 'Eng', 'PT', opts);
      const cm = c.meta.outreachConversion;
      _assertEqual([r6(c.outreachConversion), cm.floored, cm.basis, cm.n], [0.2, true, 'function+location', 100], 'AC1 C floored to 0.20');
      const cLow = learnFunnelBenchmarks(obs, 'Eng', 'PT', { prior, cfg: { ...cfg, floorFraction: 0.5 } });
      _assertEqual(r6(cLow.outreachConversion), 0.184127, 'AC1 C unfloored value');
      const f = learnFunnelBenchmarks(obs, 'Eng', null, opts);
      _assertEqual([r6(f.outreachConversion), f.meta.outreachConversion.floored, f.meta.outreachConversion.basis], [0.22619, false, 'function'], 'AC1 F level');
      const g = learnFunnelBenchmarks(obs, null, null, opts);
      _assertEqual([r6(g.outreachConversion), g.meta.outreachConversion.basis, g.meta.outreachConversion.n], [0.291667, 'all', 1000], 'AC1 G level');
      const loc = learnFunnelBenchmarks(obs, null, 'UK', opts);
      _assertEqual(loc.meta.outreachConversion.basis, 'location', 'location-only basis');

      const none = learnFunnelBenchmarks([], 'Eng', 'PT', opts);
      LEARNED_RATES.forEach(({ key }) => {
        _assertEqual([none[key], none.meta[key].floored, none.meta[key].n], [prior[key], false, 0], 'AC2 no data ' + key);
      });

      const clamp = learnFunnelBenchmarks([O('7', 'Eng', 'UK', { Submitted: 10, Interview1: 12, Offers: 5, Hires: 50 })], null, null, opts);
      _assertEqual([r6(clamp.submissionConversion), clamp.meta.submissionConversion.n], [0.866667, 10], 'AC3 clamp k=min(num,den)');
      LEARNED_RATES.forEach(({ key }) => { ok(clamp[key] <= 1, 'AC3 ' + key + ' <= 1'); });

      // AC4: single group in its cell at 60% vs a 25% target.
      const solo = [O('9', 'Ops', 'DE', { Outreach: 100, Responses: 60 }), O('3', 'Sales', 'UK', { Outreach: 500, Responses: 100 })];
      const lso = learnFunnelBenchmarks(solo, 'Ops', 'DE', { ...opts, exclude: o => o.roleId === '9' });
      ok(Math.abs(lso.outreachConversion - 0.6) > 0.01, 'AC4 not benchmarked against itself');
      const peersOnly = learnFunnelBenchmarks(solo.filter(o => o.roleId !== '9'), 'Ops', null, opts);
      _assertEqual(r6(lso.outreachConversion), r6(peersOnly.outreachConversion), 'AC4 equals peers-only function level');
      const withSelf = learnFunnelBenchmarks(solo, 'Ops', 'DE', opts);
      ok(r6(withSelf.outreachConversion) !== r6(lso.outreachConversion), 'AC4 positive control — exclusion changes the result');

      const whole = learnFunnelBenchmarks(obs, null, null, { ...opts, exclude: () => true });
      LEARNED_RATES.forEach(({ key }) => { _assertEqual(whole[key], prior[key], 'AC5 whole book ' + key); });

      _assertEqual([c.timeToHireDays, c.flagThreshold], [45, 0.8], 'AC6 pass-through');
      const before = JSON.stringify(CONFIG.ANALYTICS_BENCHMARKS);
      const live = learnFunnelBenchmarks(obs, 'Eng', 'PT');
      _assertEqual(JSON.stringify(CONFIG.ANALYTICS_BENCHMARKS), before, 'AC6 CONFIG not mutated');
      _assertEqual([live.timeToHireDays, live.flagThreshold], [CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays, CONFIG.ANALYTICS_BENCHMARKS.flagThreshold], 'AC6 CONFIG pass-through');
    },
  },
  {
    name: 'N-270 buildFunnelObservations / funnelRoleIndex / learnFunnelBenchmarksMix',
    fn: function () {
      const idx = funnelRoleIndex([{ id: 1, Department: 'Eng', Location: 'UK' }, { id: 2, Department: 'Ops', Location: 'DE' }], 'Department', 'Location');
      const acts = [
        { RoleIDLookupId: 1, TalentPartner: 'a@x.com', Outreach: 10, Responses: 2 },
        { RoleIDLookupId: 1, TalentPartner: 'a@x.com', Outreach: 5, Responses: 1 },
        { RoleID: 2, TalentPartner: 'b@x.com', Outreach: 3 },
        { RoleIDLookupId: 99, TalentPartner: 'a@x.com', Outreach: 100 },
      ];
      const obs = buildFunnelObservations(acts, idx);
      _assertEqual(obs.map(o => [o.roleId, o.tp, o.fn, o.loc, o.c.Outreach, o.c.Responses]),
        [['1', 'a@x.com', 'Eng', 'UK', 15, 3], ['2', 'b@x.com', 'Ops', 'DE', 3, 0]], 'AC7 aggregate, RoleID fallback, unknown role dropped');
      const hIdx = funnelRoleIndex([{ id: 5, functionArea: 'X', country: 'Y' }], 'functionArea', 'country');
      _assertEqual(hIdx.get('5'), { fn: 'X', loc: 'Y' }, 'AC7 historical shape');

      const O = (roleId, tp, fn, loc, c) => ({ roleId, tp, fn, loc,
        c: Object.assign({ Outreach: 0, Responses: 0, Submitted: 0, Interview1: 0, Offers: 0, Hires: 0 }, c) });
      const peers = [
        O('1', 'p@x.com', 'Eng', 'UK', { Outreach: 1000, Responses: 300, Offers: 10, Hires: 9 }),
        O('2', 'p@x.com', 'Ops', 'DE', { Outreach: 1000, Responses: 200, Offers: 10, Hires: 7 }),
      ];
      const tpObs = [
        O('3', 't@x.com', 'Eng', 'UK', { Outreach: 100, Responses: 10 }),
        O('4', 't@x.com', 'Ops', 'DE', { Outreach: 300, Responses: 30 }),
      ];
      const all = peers.concat(tpObs);
      const opts = { exclude: o => o.tp === 't@x.com' };
      const mix = learnFunnelBenchmarksMix(all, tpObs, opts);
      const a = learnFunnelBenchmarks(all, 'Eng', 'UK', opts).outreachConversion;
      const b = learnFunnelBenchmarks(all, 'Ops', 'DE', opts).outreachConversion;
      const r6 = x => Math.round(x * 1e6) / 1e6;
      _assertEqual(r6(mix.outreachConversion), r6((100 * a + 300 * b) / 400), 'AC8 weighted by TP denominator');
      _assertEqual([mix.meta.outreachConversion.basis, mix.meta.outreachConversion.cells], ['mix', 2], 'AC8 mix meta');
      const company = learnFunnelBenchmarks(all, null, null, opts);
      _assertEqual([mix.offerSuccess, mix.meta.offerSuccess.basis], [company.offerSuccess, 'all'], 'AC8 no TP offers → company rate');
    },
  },
  {
    name: 'N-270 learnedBenchmarkTip, LEARNED_RATES order, activitySinceWeeks',
    fn: function () {
      const ok = (cond, label) => _assertEqual(!!cond, true, label);
      const prior = { outreachConversion: 0.25, submissionConversion: 0.8, interviewToOffer: 0.2, offerSuccess: 0.8, timeToHireDays: 45, flagThreshold: 0.8 };
      const cfg = { priorStrength: { outreachConversion: 200, submissionConversion: 20, interviewToOffer: 20, offerSuccess: 10 }, floorFraction: 0.8 };
      const O = (roleId, fn, loc, c) => ({ roleId, tp: '', fn, loc,
        c: Object.assign({ Outreach: 0, Responses: 0, Submitted: 0, Interview1: 0, Offers: 0, Hires: 0 }, c) });
      const obs = [
        O('1', 'Eng', 'PT', { Outreach: 100, Responses: 10 }),
        O('2', 'Eng', 'UK', { Outreach: 400, Responses: 90 }),
        O('3', 'Sales', 'UK', { Outreach: 500, Responses: 200 }),
      ];
      const tips = [
        learnedBenchmarkTip(learnFunnelBenchmarks(obs, 'Eng', 'PT', { prior, cfg }), 'outreachConversion'),
        learnedBenchmarkTip(learnFunnelBenchmarks(obs, 'Eng', null, { prior, cfg }), 'outreachConversion'),
        learnedBenchmarkTip(learnFunnelBenchmarks(obs, null, null, { prior, cfg }), 'outreachConversion'),
        learnedBenchmarkTip({ outreachConversion: 0.25 }, 'outreachConversion'),
        learnedBenchmarkTip(learnFunnelBenchmarksMix(obs, obs.slice(0, 2), { prior, cfg }), 'outreachConversion'),
        learnedBenchmarkTip(learnFunnelBenchmarks(obs, 'Ops', 'DE', { prior, cfg }), 'outreachConversion'),
      ];
      _assertEqual(tips[0], 'Benchmark 20% · learned from Eng × PT peers (n=100), shrunk toward 25% target · floored at 20% (80% of 25% target)', 'AC9 floored');
      _assertEqual(tips[1], 'Benchmark 23% · learned from Eng peers (n=500), shrunk toward 25% target', 'AC9 unfloored');
      _assertEqual(tips[2], 'Benchmark 29% · learned from company-wide peers (n=1,000), shrunk toward 25% target', 'AC9 n formatting');
      _assertEqual(tips[3], 'Benchmark 25% · company target', 'AC9 plain CONFIG');
      ok(tips[4].indexOf('weighted across 2 function × location mixes this TP works in') > 0, 'AC9 mix');
      _assertEqual(tips[5], 'Benchmark 29% · no Ops × DE peers yet, so taken from the wider pool, shrunk toward 25% target', 'AC9 empty cell wording');
      tips.forEach((t, i) => ok(!/[<>]/.test(t), 'AC9 no HTML ' + i));

      // AC10: LEARNED_RATES order matches computeRoleFunnel — raising only key i
      // must turn only stage i non-green.
      const totals = { Outreach: 100, Responses: 50, Submitted: 100, Interview1: 50, Offers: 25, Hires: 12 };
      LEARNED_RATES.forEach(({ key }, i) => {
        const bm = { outreachConversion: 0.1, submissionConversion: 0.1, interviewToOffer: 0.1, offerSuccess: 0.1, flagThreshold: 0.8 };
        bm[key] = 0.99;
        const rags = computeRoleFunnel(totals, bm).map(s => s.rag);
        _assertEqual(rags.map((r, j) => j === i ? r !== 'green' : r === 'green'), [true, true, true, true], 'AC10 order ' + key);
      });

      const today = new Date(2026, 8, 29, 12);  // local; weeksAgoDay(13) → 2026-06-30
      const rows = [
        { WeekEndingDate: '2026-06-28T23:00:00Z' },
        { WeekEndingDate: '2026-06-30T12:00:00Z' },
        { WeekEndingDate: '2026-07-05T00:00:00Z' },
        { Outreach: 1 },
      ];
      _assertEqual(activitySinceWeeks(rows, 13, today).map(r => r.WeekEndingDate), ['2026-06-30T12:00:00Z', '2026-07-05T00:00:00Z'], 'activitySinceWeeks 13w');
      _assertEqual(activitySinceWeeks(rows, 0, today).length, 4, 'activitySinceWeeks 0 = all');
    },
  },
  {
    name: 'N-277 funnelLearningIndex — hired + cancelled only, hired wins, null-safe; cancelled activity feeds the benchmarks',
    fn: function () {
      const ok = (cond, label) => _assertEqual(!!cond, true, label);
      const r6 = x => Math.round(x * 1e6) / 1e6;
      const entries = m => Array.from(m.entries());
      _assertEqual(CONFIG.FUNNEL_LEARNING_EXTRA_STAGES, ['Cancelled'], 'AC config list');

      const hist = [{ id: 1, functionArea: 'Eng', country: 'UK' }, { id: 2, functionArea: 'Ops', country: 'DE' }];
      const histBefore = JSON.stringify(hist);
      const roles = [
        { id: 2, Stage: 'Cancelled', Department: 'WRONG', Location: 'WRONG' },   // also hired: hired wins
        { id: 3, Stage: 'Cancelled', Department: 'Eng', Location: 'UK' },
        { id: 4, Stage: 'On-hold',   Department: 'Eng', Location: 'UK' },
        { id: 5, Stage: 'Backlog',   Department: 'Eng', Location: 'UK' },
        { id: 6, Stage: 'Sourcing',  Department: 'Eng', Location: 'UK' },
        { id: 7, Stage: 'Closed',    Department: 'Eng', Location: 'UK' },          // closed but outside `historical`
        { id: 8, Stage: 'Cancelled' },                                             // blank function/location
        null,
        { Stage: 'Cancelled' },                                                    // no id
      ];
      const idx = funnelLearningIndex(hist, roles);
      _assertEqual(Array.from(idx.keys()).sort(), ['1', '2', '3', '8'], 'AC1/AC2 members: hired + cancelled only');
      _assertEqual(idx.get('2'), { fn: 'Ops', loc: 'DE' }, 'AC3 hired entry wins on duplicate id');
      _assertEqual(idx.get('3'), { fn: 'Eng', loc: 'UK' }, 'AC1 cancelled role uses Department/Location');
      _assertEqual(idx.get('8'), { fn: '', loc: '' }, 'AC1 blank function/location tolerated');
      _assertEqual(JSON.stringify(hist), histBefore, 'does not mutate inputs');

      // AC4: null-safe; no extras → exactly funnelRoleIndex
      _assertEqual(funnelLearningIndex(null, null).size, 0, 'AC4 null/null');
      _assertEqual(funnelLearningIndex([], []).size, 0, 'AC4 empty');
      _assertEqual(entries(funnelLearningIndex(hist, undefined)), entries(funnelRoleIndex(hist, 'functionArea', 'country')), 'AC4 no allRoles = hired-only index');

      // AC5 regression: no cancelled roles → identical observations and benchmarks
      const O = (roleId, fn, loc, c) => ({ roleId, tp: '', fn, loc,
        c: Object.assign({ Outreach: 0, Responses: 0, Submitted: 0, Interview1: 0, Offers: 0, Hires: 0 }, c) });
      const acts = [
        { RoleIDLookupId: 1, TalentPartner: 'a@x.com', Outreach: 1000, Responses: 300, Offers: 10, Hires: 9 },
        { RoleIDLookupId: 3, TalentPartner: 'a@x.com', Outreach: 1000, Responses: 100, Offers: 10, Hires: 0 },
      ];
      const hiredOnly = buildFunnelObservations(acts, funnelRoleIndex(hist, 'functionArea', 'country'));
      const noCancelled = buildFunnelObservations(acts, funnelLearningIndex(hist, [{ id: 4, Stage: 'On-hold' }]));
      _assertEqual(noCancelled, hiredOnly, 'AC5 no cancelled roles → identical observations');

      // AC6/AC7: a cancelled role's completed progress feeds the benchmarks
      const prior = { outreachConversion: 0.25, submissionConversion: 0.8, interviewToOffer: 0.2, offerSuccess: 0.8, timeToHireDays: 45, flagThreshold: 0.8 };
      const cfg = { priorStrength: { outreachConversion: 200, submissionConversion: 20, interviewToOffer: 20, offerSuccess: 10 }, floorFraction: 0.8 };
      const withCancelled = buildFunnelObservations(acts, funnelLearningIndex(hist, roles));
      _assertEqual(withCancelled.map(o => o.roleId), ['1', '3'], 'AC6 cancelled role 3 now has an observation');
      const bHired = learnFunnelBenchmarks(hiredOnly, 'Eng', 'UK', { prior, cfg });
      const bAll   = learnFunnelBenchmarks(withCancelled, 'Eng', 'UK', { prior, cfg });
      ok(bAll.outreachConversion < bHired.outreachConversion, 'AC6 cancelled outreach (10%) lowers the outreach benchmark');
      ok(bAll.outreachConversion >= prior.outreachConversion * cfg.floorFraction, 'AC6 floor still respected');
      ok(bAll.offerSuccess < bHired.offerSuccess, 'AC7 cancelled Offers with 0 Hires lower offerSuccess');
      _assertEqual([r6(bAll.offerSuccess), bAll.meta.offerSuccess.floored], [r6(prior.offerSuccess * cfg.floorFraction), true], 'AC7 0.80 × target floor applies');

      // AC10 leave-self-out unchanged: excluding role 1, its own counts cannot move the benchmark
      const acts2 = [Object.assign({}, acts[0], { Outreach: 5, Responses: 5 }), acts[1]];
      const o2 = buildFunnelObservations(acts2, funnelLearningIndex(hist, roles));
      const ex = { prior, cfg, exclude: o => o.roleId === '1' };
      _assertEqual(learnFunnelBenchmarks(withCancelled, 'Eng', 'UK', ex), learnFunnelBenchmarks(o2, 'Eng', 'UK', ex), 'AC10 leave-self-out');
    },
  },
  {
    name: 'N-271 medianOf / addDaysISO / sundayOnOrAfterISO — odd/even/empty, month end, leap day, BST',
    fn: function () {
      _assertEqual(medianOf([3, 1, 2]), 2, 'median odd');
      _assertEqual(medianOf([4, 1, 3, 2]), 2.5, 'median even');
      _assertEqual(medianOf([7]), 7, 'median single');
      _assertEqual(medianOf([]), null, 'median empty');
      _assertEqual(medianOf(null), null, 'median null');
      const src = [3, 1, 2]; medianOf(src);
      _assertEqual(src, [3, 1, 2], 'median does not mutate');
      _assertEqual(addDaysISO('2026-01-31', 1), '2026-02-01', 'month end');
      _assertEqual(addDaysISO('2028-02-28', 1), '2028-02-29', 'leap day');
      _assertEqual(addDaysISO('2026-03-28', 2), '2026-03-30', 'BST start');
      _assertEqual(addDaysISO('2026-10-24', 2), '2026-10-26', 'BST end');
      _assertEqual(addDaysISO('2026-09-27', -49), '2026-08-09', 'negative');
      _assertEqual(addDaysISO('nope', 1), null, 'addDaysISO unparseable');
      _assertEqual(sundayOnOrAfterISO('2026-09-27'), '2026-09-27', 'Sunday is itself');
      _assertEqual(sundayOnOrAfterISO('2026-09-23'), '2026-09-27', 'Wednesday → Sunday');
      _assertEqual(sundayOnOrAfterISO('2026-09-28'), '2026-10-04', 'Monday → next Sunday');
      _assertEqual(sundayOnOrAfterISO(''), null, 'sundayOnOrAfterISO unparseable');
    },
  },
  {
    name: 'N-271 CONFIG.WEEKLY_ANOMALIES — shape',
    fn: function () {
      const c = CONFIG.WEEKLY_ANOMALIES;
      _assertEqual(c.funnelPairs, [
        { later: 'Responses', earlier: 'Outreach' }, { later: 'Interview1', earlier: 'Submitted' },
        { later: 'Offers', earlier: 'Interview1' }, { later: 'Hires', earlier: 'Offers' },
      ], 'AC1 pairs');
      _assertEqual(c.noActivity, { recentWeeks: 2 }, 'AC1 noActivity');
      _assertEqual(c.spikes, { fields: ['Outreach', 'Responses', 'Screened', 'Submitted'], baselineWeeks: 8,
        minBaselineWeeks: 4, multiplier: 3, minValue: 10, reportWeeks: 13 }, 'AC1 spikes');
      _assertEqual(c.displayRows, 50, 'AC1 displayRows');
    },
  },
  {
    name: 'N-271 findImpossibleFunnels — cumulative, strict, pairs, any stage',
    fn: function () {
      const role = (id, stage) => ({ id, RoleTitle: 'Role ' + id, Stage: stage, TalentPartner: 'a@x.com' });
      const row = (id, c) => Object.assign({ RoleIDLookupId: id, WeekEndingDate: '2026-09-20T12:00:00Z', TalentPartner: 'a@x.com',
        Outreach: 0, Responses: 0, Submitted: 0, Interview1: 0, Offers: 0, Hires: 0 }, c);
      const roles = [role('A', 'Sourcing'), role('B', 'Sourcing'), role('C', 'Cancelled'), role('D', 'Sourcing'), role('E', 'Placed')];
      const act = [
        row('A', { Submitted: 6, Interview1: 5 }), row('A', { Submitted: 4, Interview1: 7 }),  // cumulative 10 vs 12
        row('B', { Submitted: 10, Interview1: 10 }),                                            // equal: fine
        row('C', { Responses: 5 }),                                                             // Responses > Outreach 0
        row('D', {}),                                                                           // all zeros
        row('E', { Interview2Plus: 9, Screened: 9, Submitted: 2, Interview1: 2, Offers: 2, Hires: 3 }),                      // Hires > Offers only
        row('ZZ', { Hires: 9 }),                                                                // orphan: skipped
      ];
      const r = findImpossibleFunnels(roles, act);
      _assertEqual(r.length, 3, 'AC3 three roles flagged');
      const byId = Object.fromEntries(r.map(x => [x.roleId, x]));
      _assertEqual(byId.A.breaches, [{ later: 'Interview1', earlier: 'Submitted', laterTotal: 12, earlierTotal: 10 }], 'AC3 worked example');
      _assertEqual(byId.C.breaches, [{ later: 'Responses', earlier: 'Outreach', laterTotal: 5, earlierTotal: 0 }], 'AC3 zero earlier');
      _assertEqual(byId.E.breaches, [{ later: 'Hires', earlier: 'Offers', laterTotal: 3, earlierTotal: 2 }], 'AC3 any stage, skippable stages ignored');
      _assertEqual(byId.A.stage + '|' + byId.A.roleTitle + '|' + byId.A.tp, 'Sourcing|Role A|a@x.com', 'AC3 role fields');
      _assertEqual(r.map(x => x.roleId), ['C', 'A', 'E'], 'sorted by excess desc (5, 2, 1)');
      _assertEqual(findImpossibleFunnels([], []), [], 'empty');
    },
  },
  {
    name: 'N-271 findRolesWithNoActivity — this week + last week, grace, stages, zeros, undated, order, cfg',
    fn: function () {
      const today = new Date(2026, 8, 30, 12);          // Wed → lastComplete 2026-09-27, in-progress week 2026-10-04; window (2 weeks) ≥ 2026-09-27
      const J1 = '2026-06-01T12:00:00Z';
      const role = (id, stage, open) => ({ id, RoleTitle: 'Role ' + id, Stage: stage, OpenDate: open, TalentPartner: 'a@x.com' });
      const row = (id, w, c) => Object.assign({ RoleIDLookupId: id, WeekEndingDate: w ? w + 'T12:00:00Z' : '', TalentPartner: 'a@x.com', Outreach: 1 }, c);
      const roles = [
        role('R1', 'Sourcing', J1), role('R2', 'Sourcing', J1), role('R3a', 'Sourcing', J1), role('R3b', 'Sourcing', J1), role('R3c', 'Sourcing', J1),
        role('R4', 'Sourcing', '2026-09-14T12:00:00Z'), role('R5', 'Sourcing', '2026-09-23T12:00:00Z'), role('R6', 'Sourcing', '2026-09-14T12:00:00Z'),
        role('R7', 'Sourcing', J1), role('R8', 'Sourcing', J1), role('R9', 'Sourcing', J1),
        role('R10', 'Cancelled', J1), role('R11', 'Sourcing', ''), role('R12', 'Planning', J1), role('R13', 'On-hold', J1),
        role('R14', 'Closed', J1), role('R15', 'Backlog', J1), role('R16', 'Offered', J1),
      ];
      const act = [].concat(
        ['2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30', '2026-09-06', '2026-09-13'].map(w => row('R2', w)),   // last entry 13 Sep
        [row('R3a', '2026-09-20'), row('R3b', '2026-09-27'), row('R3c', '2026-10-04'), row('R6', '2026-09-20'),
         row('R7', '2026-09-27', { Outreach: 0 }),                                                                        // an all-zero row is an entry
         row('R8', '2026-08-09'), row('R8', '2026-10-04'),
         row('R9', '')]                                                                                                   // undated: cannot be placed in a week
      );
      const snap = JSON.stringify(roles) + JSON.stringify(act);
      const key = x => [x.roleId, x.lastEntryWeek];
      const r = findRolesWithNoActivity(roles, act, today);
      // nulls first (by title string: R1 < R16 < R4 < R9), then oldest last entry
      _assertEqual(r.map(key), [['R1', null], ['R16', null], ['R4', null], ['R9', null], ['R2', '2026-09-13'], ['R3a', '2026-09-20'], ['R6', '2026-09-20']],
        'AC4/AC12 worked examples and order (R5 in grace; R3b/R3c/R7/R8 fine; R10–R15 not evaluated)');
      _assertEqual(r[0], { roleId: 'R1', roleTitle: 'Role R1', stage: 'Sourcing', tp: 'a@x.com', lastEntryWeek: null }, 'AC12 shape (no kind)');
      _assertEqual(findRolesWithNoActivity(roles, act, new Date(2026, 9, 4, 12)), r, 'Sunday today: same week, same result');
      // Monday 5 Oct: lastComplete 4 Oct, window ≥ 4 Oct. R5 is now old enough; R3b/R7 (27 Sep) drop out of the window.
      _assertEqual(findRolesWithNoActivity(roles, act, new Date(2026, 9, 5, 12)).map(key),
        [['R1', null], ['R16', null], ['R4', null], ['R5', null], ['R9', null], ['R2', '2026-09-13'],
         ['R3a', '2026-09-20'], ['R6', '2026-09-20'], ['R3b', '2026-09-27'], ['R7', '2026-09-27']], 'Monday: window moves on');
      // recentWeeks 3: window ≥ 20 Sep. R4/R5/R6 not yet open long enough; R3a (20 Sep) is inside the window.
      _assertEqual(findRolesWithNoActivity(roles, act, today, { noActivity: { recentWeeks: 3 } }).map(key),
        [['R1', null], ['R16', null], ['R9', null], ['R2', '2026-09-13']], 'recentWeeks 3');
      _assertEqual(findRolesWithNoActivity([], [], today), [], 'empty');
      _assertEqual(JSON.stringify(roles) + JSON.stringify(act), snap, 'inputs not mutated');
    },
  },
  {
    name: 'N-271 findActivitySpikes — 3x median and floor, baseline needs history, TPs isolated, sums across roles',
    fn: function () {
      const today = new Date(2026, 8, 30, 12);          // lastComplete 2026-09-27
      const base = ['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20'];
      const vals = [10, 12, 8, 11, 9, 10, 12, 10];      // median 10
      const R = (tp, w, o, role) => ({ RoleIDLookupId: role || '1', WeekEndingDate: w + 'T12:00:00Z', TalentPartner: tp,
        Outreach: o, Responses: 0, Screened: 0, Submitted: 0 });
      const baseline = tp => base.map((w, i) => R(tp, w, vals[i]));
      const spikes = (target, extra) => findActivitySpikes(baseline('a@x.com').concat(target, extra || []), today);
      const s31 = spikes([R('a@x.com', '2026-09-27', 31)]);
      _assertEqual(s31, [{ tp: 'a@x.com', weekEnding: '2026-09-27', field: 'Outreach', value: 31, median: 10, baselineWeeks: 8 }], 'AC6 31 > 30 flagged');
      _assertEqual(spikes([R('a@x.com', '2026-09-27', 30)]), [], 'AC6 30 is not > 30');
      _assertEqual(spikes([R('a@x.com', '2026-09-27', 9)]), [], 'AC6 9 below');
      // summed across two roles of one TP
      _assertEqual(spikes([R('a@x.com', '2026-09-27', 16, '1'), R('a@x.com', '2026-09-27', 15, '2')]).map(x => x.value), [31], 'AC6 summed across roles');
      // another TP with a huge week and no history is never flagged and never pollutes A's baseline
      _assertEqual(spikes([R('a@x.com', '2026-09-27', 30)], [R('b@x.com', '2026-09-27', 500)]), [], 'AC13 TPs isolated');
      // < minBaselineWeeks of history
      const thin = [R('a@x.com', '2026-09-06', 10), R('a@x.com', '2026-09-13', 10), R('a@x.com', '2026-09-20', 10), R('a@x.com', '2026-09-27', 90)];
      _assertEqual(findActivitySpikes(thin, today), [], 'AC6 3 baseline weeks → nothing');
      // zero median: value must still clear the floor
      const zero = w => [0, 1, 2, 3].map(i => R('a@x.com', addDaysISO(w, -7 * (i + 1)), 0));
      _assertEqual(findActivitySpikes(zero('2026-09-27').concat(R('a@x.com', '2026-09-27', 12)), today).map(x => [x.value, x.median]), [[12, 0]], 'zero median flagged');
      _assertEqual(findActivitySpikes(zero('2026-09-27').concat(R('a@x.com', '2026-09-27', 9)), today), [], 'zero median below floor');
      // outside the 13-week report window
      const oldW = '2026-06-21';                          // before 2026-07-05
      const old = [0, 1, 2, 3].map(i => R('a@x.com', addDaysISO(oldW, -7 * (i + 1)), 10)).concat(R('a@x.com', oldW, 90));
      _assertEqual(findActivitySpikes(old, today), [], 'outside reportWeeks');
      // current (incomplete) week is never a spike week
      _assertEqual(spikes([R('a@x.com', '2026-10-04', 90)]), [], 'AC5 current week not judged');
      // fields are checked independently; a field outside cfg.spikes.fields is ignored
      const iv = baseline('a@x.com').concat([Object.assign(R('a@x.com', '2026-09-27', 10), { Responses: 40, Interview1: 99 })]);
      _assertEqual(findActivitySpikes(iv, today).map(x => x.field), ['Responses'], 'Responses (zero median, 40 ≥ 10) flagged; Outreach 10 and Interview1 not');
    },
  },
  {
    name: 'N-271 detectWeeklyActivityAnomalies — shape, meta, off-Sunday bucketing, no mutation',
    fn: function () {
      const today = new Date(2026, 8, 30, 12);
      const empty = detectWeeklyActivityAnomalies([], [], today);
      _assertEqual([empty.impossibleFunnels, empty.noActivity, empty.spikes], [[], [], []], 'AC15 empty');
      _assertEqual(Object.keys(empty).sort(), ['impossibleFunnels', 'meta', 'noActivity', 'spikes'], 'AC15 keys');
      _assertEqual(empty.meta, { lastComplete: '2026-09-27', rowsScanned: 0, orphanRows: 0, offSundayRows: 0, undatedRows: 0, noTpRows: 0 }, 'AC15 meta shape');
      const role = id => ({ id, RoleTitle: 'R' + id, Stage: 'Sourcing', OpenDate: '2026-06-01T12:00:00Z', TalentPartner: 'a@x.com' });
      const roles = [role('1'), role('2')];
      const mk = (w, extra) => Object.assign({ RoleIDLookupId: '1', WeekEndingDate: w, TalentPartner: 'a@x.com', Submitted: 1, Interview1: 0 }, extra);
      const act = [
        mk('2026-08-09T12:00:00Z'), mk('2026-08-16T12:00:00Z'), mk('2026-08-23T12:00:00Z'),
        mk('2026-09-23T12:00:00Z'),                   // Wednesday → bucketed to 27 Sep, inside the recent window
        mk('2026-09-20T12:00:00Z'),
        mk('', { Submitted: 0, Interview1: 5 }),      // undated: counts as an entry and in funnel totals (Submitted 6 ≥ Interview1 5)
        mk('2026-09-20T12:00:00Z', { TalentPartner: '' }),
        mk('2026-09-12T12:00:00Z', { RoleIDLookupId: '2' }),   // Saturday → bucketed to 13 Sep, outside the recent window
        { RoleIDLookupId: '999', WeekEndingDate: '2026-09-20T12:00:00Z', TalentPartner: 'a@x.com', Hires: 4 },
      ];
      const snapRoles = JSON.stringify(roles), snapAct = JSON.stringify(act);
      const r = detectWeeklyActivityAnomalies(roles, act, today);
      _assertEqual(r.meta, { lastComplete: '2026-09-27', rowsScanned: 9, orphanRows: 1, offSundayRows: 2, undatedRows: 1, noTpRows: 1 }, 'AC14 meta counts');
      _assertEqual(r.noActivity.map(x => [x.roleId, x.lastEntryWeek]), [['2', '2026-09-13']], 'AC14 Saturday row bucketed to 13 Sep (outside this week + last); role 1 fine (Wednesday row landed on 27 Sep)');
      _assertEqual(r.impossibleFunnels.length, 0, 'AC14 undated row counted in funnel totals, orphan Hires ignored');
      _assertEqual(JSON.stringify(roles) + JSON.stringify(act), snapRoles + snapAct, 'AC15 inputs not mutated');
    },
  },
  {
    name: 'N-273 anomalyFunnelSignature — format, pair order, changes with totals',
    fn: function () {
      const f = { roleId: '5', breaches: [
        { later: 'Responses', earlier: 'Outreach',   laterTotal: 12, earlierTotal: 10 },
        { later: 'Offers',    earlier: 'Interview1', laterTotal: 3,  earlierTotal: 2 } ] };
      _assertEqual(anomalyFunnelSignature(f), 'Responses:12>Outreach:10;Offers:3>Interview1:2', 'AC1 format');
      _assertEqual(anomalyFunnelSignature(f), anomalyFunnelSignature(JSON.parse(JSON.stringify(f))), 'AC1 deterministic');
      const g = JSON.parse(JSON.stringify(f)); g.breaches[0].laterTotal = 13;
      _assertEqual(anomalyFunnelSignature(g) !== anomalyFunnelSignature(f), true, 'AC1 different totals, different signature');
      const h = JSON.parse(JSON.stringify(f)); h.breaches.pop();
      _assertEqual(anomalyFunnelSignature(h), 'Responses:12>Outreach:10', 'AC1 a breach fixed changes the signature');
      _assertEqual(anomalyFunnelSignature({ roleId: '5', breaches: [] }), '', 'AC1 no breaches');
      _assertEqual(anomalyFunnelSignature(null), '', 'AC1 null');
      // From the real detector: breaches come out in CONFIG.WEEKLY_ANOMALIES.funnelPairs order
      const roles = [{ id: 'A', RoleTitle: 'A', Stage: 'Sourcing', TalentPartner: 'a@x.com' }];
      const act = [{ RoleIDLookupId: 'A', WeekEndingDate: '2026-09-20T12:00:00Z', TalentPartner: 'a@x.com',
        Outreach: 1, Responses: 2, Submitted: 0, Interview1: 0, Offers: 0, Hires: 1 }];
      _assertEqual(anomalyFunnelSignature(findImpossibleFunnels(roles, act)[0]), 'Responses:2>Outreach:1;Hires:1>Offers:0', 'AC1 detector order');
    },
  },
  {
    name: 'N-273 partitionAcknowledgedFunnels — match on role + signature, re-appear, ignore, duplicates',
    fn: function () {
      const flag = (roleId, later, earlier, lt, et) => ({ roleId, roleTitle: 'R' + roleId, stage: 'Sourcing', tp: '',
        breaches: [{ later, earlier, laterTotal: lt, earlierTotal: et }] });
      const F1 = flag('1', 'Responses', 'Outreach', 12, 10);
      const F2 = flag('2', 'Offers', 'Interview1', 3, 2);
      const F3 = flag('3', 'Hires', 'Offers', 1, 0);
      const ack = (id, role, sig, extra) => Object.assign({ id, CheckType: 'funnel', SubjectKey: role, Signature: sig, Status: 'active' }, extra);
      const flags = [F1, F2, F3];

      let p = partitionAcknowledgedFunnels(flags, null);
      _assertEqual(p.open.map(f => f.roleId), ['1', '2', '3'], 'AC2 null acks: all open');
      _assertEqual([p.acknowledged.length, p.reappeared.length], [0, 0], 'AC2 null acks: nothing acknowledged');
      p = partitionAcknowledgedFunnels(flags, []);
      _assertEqual(p.open.length, 3, 'AC2 empty acks');

      p = partitionAcknowledgedFunnels(flags, [ack('a1', '2', anomalyFunnelSignature(F2))]);
      _assertEqual(p.open.map(f => f.roleId), ['1', '3'], 'AC3 matched flag leaves open, order kept');
      _assertEqual(p.acknowledged.map(e => e.flag.roleId), ['2'], 'AC3 acknowledged');
      _assertEqual(p.acknowledged[0].signature, 'Offers:3>Interview1:2', 'AC3 signature carried');
      _assertEqual(p.acknowledged[0].acks.map(a => a.id), ['a1'], 'AC3 ack rows carried');

      // AC4: same role, different signature -> open again + reappeared
      p = partitionAcknowledgedFunnels(flags, [ack('a1', '1', 'Responses:11>Outreach:10')]);
      _assertEqual(p.open.map(f => f.roleId), ['1', '2', '3'], 'AC4 changed totals: still open');
      _assertEqual(p.reappeared, ['1'], 'AC4 reappeared roleId');
      _assertEqual(p.acknowledged.length, 0, 'AC4 not acknowledged');

      // AC5: restored / other CheckType / role with no flag are ignored
      p = partitionAcknowledgedFunnels(flags, [
        ack('r1', '1', anomalyFunnelSignature(F1), { Status: 'restored' }),
        ack('c1', '2', anomalyFunnelSignature(F2), { CheckType: 'spike' }),
        ack('z1', '99', 'Responses:1>Outreach:0'),
        null,
      ]);
      _assertEqual(p.open.length, 3, 'AC5 nothing hidden by ignored rows');
      _assertEqual(p.reappeared, [], 'AC5 ignored rows do not mark reappeared');
      _assertEqual(p.acknowledged.length, 0, 'AC5 nothing acknowledged');

      // AC6: two active rows for one role + signature = one acknowledgement
      p = partitionAcknowledgedFunnels(flags, [ack('d1', '3', anomalyFunnelSignature(F3)), ack('d2', '3', anomalyFunnelSignature(F3))]);
      _assertEqual(p.acknowledged.length, 1, 'AC6 one entry');
      _assertEqual(p.acknowledged[0].acks.map(a => a.id), ['d1', 'd2'], 'AC6 both rows');
      _assertEqual(p.open.map(f => f.roleId), ['1', '2'], 'AC6 the rest stay open');

      // SubjectKey compares as text (SharePoint returns it as a string, roleId may be a number)
      p = partitionAcknowledgedFunnels([flag(7, 'Hires', 'Offers', 1, 0)], [ack('n1', '7', 'Hires:1>Offers:0')]);
      _assertEqual(p.acknowledged.length, 1, 'numeric roleId vs text SubjectKey');
      _assertEqual(partitionAcknowledgedFunnels(null, null), { open: [], acknowledged: [], reappeared: [] }, 'null flags');
      const snap = JSON.stringify(flags);
      partitionAcknowledgedFunnels(flags, [ack('a1', '2', anomalyFunnelSignature(F2))]);
      _assertEqual(JSON.stringify(flags), snap, 'inputs not mutated');
    },
  },
  {
    name: 'N-273 buildAnomalyAckFields — the eight columns, trimmed and capped note, lower-cased email',
    fn: function () {
      const a = { checkType: 'funnel', subjectKey: 42, signature: 'Responses:12>Outreach:10', note: '  historic data  ' };
      const r = buildAnomalyAckFields(a, 'Chris.Friend@Momentum.com', '2026-09-30T09:15:00.000Z');
      _assertEqual(r, {
        Title: 'funnel · 42', CheckType: 'funnel', SubjectKey: '42', Signature: 'Responses:12>Outreach:10',
        Note: 'historic data', AcknowledgedBy: 'chris.friend@momentum.com', AcknowledgedAt: '2026-09-30T09:15:00.000Z', Status: 'active',
      }, 'AC7 exactly the eight columns');
      _assertEqual(Object.keys(r).sort(), CONFIG.LIST_FIELDS.AnomalyAcks.slice().sort(), 'AC7 columns = LIST_FIELDS.AnomalyAcks');
      _assertEqual(buildAnomalyAckFields(Object.assign({}, a, { note: undefined }), 'x@y.z', 'T').Note, '', 'AC13 no note');
      _assertEqual(buildAnomalyAckFields(Object.assign({}, a, { note: '   ' }), 'x@y.z', 'T').Note, '', 'AC13 blank note');
      const cap = CONFIG.WEEKLY_ANOMALIES.acknowledge.noteMaxChars;
      _assertEqual(buildAnomalyAckFields(Object.assign({}, a, { note: 'x'.repeat(cap + 100) }), 'x@y.z', 'T').Note.length, cap, 'AC13 capped at noteMaxChars');
      _assertEqual(buildAnomalyAckFields(Object.assign({}, a, { note: 'abcdefgh' }), 'x@y.z', 'T', { acknowledge: { noteMaxChars: 5 } }).Note, 'abcde', 'AC13 cap comes from cfg');
    },
  },
  {
    name: 'N-273 AnomalyAcks wrappers — filter, write shape, Status-only restore (no delete, no raw graphRequest)',
    fn: function () {
      // The wrappers reach their helper synchronously (before any await), so the
      // recorded calls can be asserted here without awaiting.
      // getCurrentUser lives in auth.js, which the Node harness does not load.
      const hadUser = typeof getCurrentUser === 'function';
      const saved = { getItems, createItem, updateItem, getCurrentUser: hadUser ? getCurrentUser : undefined };
      const calls = [];
      getItems = function (list, filter) { calls.push(['get', list, filter]); return Promise.resolve([]); };
      createItem = function (list, fields) { calls.push(['create', list, fields]); return Promise.resolve({}); };
      updateItem = function (list, id, fields) { calls.push(['update', list, id, fields]); return Promise.resolve({}); };
      globalThis.getCurrentUser = function () { return { email: 'Chris@Momentum.com' }; };
      try {
        getAnomalyAcks();
        _assertEqual(calls[0], ['get', 'AnomalyAcks', "fields/Status eq 'active'"], 'AC7 read is server-side filtered to active');
        acknowledgeAnomaly({ checkType: 'funnel', subjectKey: '9', signature: 'Hires:1>Offers:0', note: 'ok' });
        const c = calls[1];
        _assertEqual([c[0], c[1]], ['create', 'AnomalyAcks'], 'AC7 write goes through createItem');
        _assertEqual(Object.keys(c[2]).sort(), CONFIG.LIST_FIELDS.AnomalyAcks.slice().sort(), 'AC7 the eight columns');
        _assertEqual([c[2].Title, c[2].Status, c[2].AcknowledgedBy, c[2].Note], ['funnel · 9', 'active', 'chris@momentum.com', 'ok'], 'AC7 values');
        _assertEqual(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(c[2].AcknowledgedAt), true, 'AC7 AcknowledgedAt is an ISO instant');
        restoreAnomalyAcks(['11', '12']);
        _assertEqual(calls.slice(2), [['update', 'AnomalyAcks', '11', { Status: 'restored' }], ['update', 'AnomalyAcks', '12', { Status: 'restored' }]], 'AC7 restore patches Status only');
        _assertEqual(calls.some(x => x[0] === 'delete'), false, 'AC7 nothing deleted');
      } finally {
        getItems = saved.getItems; createItem = saved.createItem; updateItem = saved.updateItem;
        if (hadUser) globalThis.getCurrentUser = saved.getCurrentUser; else delete globalThis.getCurrentUser;
      }
    },
  },
  {
    name: 'N-273 config and registration — AnomalyAcks alias {}, LIST_FIELDS, row-count watch, existing entries unchanged',
    fn: function () {
      _assertEqual(FIELD_ALIASES.AnomalyAcks, {}, 'AC8 alias is {}');
      _assertEqual(CONFIG.LIST_FIELDS.AnomalyAcks,
        ['Title', 'CheckType', 'SubjectKey', 'Signature', 'Note', 'AcknowledgedBy', 'AcknowledgedAt', 'Status'], 'AC8 the eight names');
      _assertEqual(Object.keys(FIELD_ALIASES).includes('AnomalyAcks'), true, 'AC8 registered, so watched by N-154');
      _assertEqual((CONFIG.DATA_HEALTH_EXCLUDED_LISTS || []).includes('AnomalyAcks'), false, 'AC8 not opted out of the row-count watch');
      _assertEqual(FIELD_ALIASES.Diagnostics, {}, 'AC8 Diagnostics unchanged');
      _assertEqual(CONFIG.LIST_FIELDS.Diagnostics.length, 10, 'AC8 Diagnostics projection unchanged');
      const n = CONFIG.WEEKLY_ANOMALIES.acknowledge.noteMaxChars;
      _assertEqual(Number.isInteger(n) && n > 0, true, 'AC13 noteMaxChars is a positive integer');
    },
  },
  // ── N-274: isRoleFlagged on time-in-stage ──────────────────────────────
  // Fixed `today` (Fri 2 Oct 2026, local noon) and fixed dates throughout, so
  // nothing drifts as real time passes. ChangedAt values are morning UTC
  // instants, so their local day is the same in any timezone NEWTON_TZ picks.
  {
    name: 'N-274 roleStageBudgets — weights scaled to timeToHireDays in ROLE_STAGES order; STAGE_ORDER retired',
    fn: function () {
      const b = roleStageBudgets();
      _assertEqual(b.budget, { 'Sourcing': 15, 'Submitted': 7, 'Interview 1': 7, 'Interview 2+': 7, 'Final Interview': 5, 'Offered': 4 }, 'AC1 budgets');
      _assertEqual(Object.keys(b.cumulative), ['Sourcing', 'Submitted', 'Interview 1', 'Interview 2+', 'Final Interview', 'Offered'], 'AC1 ROLE_STAGES order');
      _assertEqual(b.cumulative['Interview 1'], 29, 'AC1 cumulative through Interview 1');
      _assertEqual(b.cumulative.Offered, CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays, 'AC1 cumulative Offered = target');
      _assertEqual(roleStageBudgets(CONFIG.ROLE_FLAG, 90).budget, { 'Sourcing': 30, 'Submitted': 14, 'Interview 1': 14, 'Interview 2+': 14, 'Final Interview': 10, 'Offered': 8 }, 'AC1 target 90 doubles every budget');
      let threw = false;
      try { roleStageBudgets({ stageWeights: { 'Sourcng': 1 } }); } catch (e) { threw = /unknown stage/.test(e.message); }
      _assertEqual(threw, true, 'AC1 unknown weight key throws');
      _assertEqual(typeof STAGE_ORDER, 'undefined', 'AC2 STAGE_ORDER retired');
    },
  },
  {
    name: 'N-274 roleFlagReasons — stuck past the stage budget; Final/Offered/Planning never stuck; unknown entry never stuck',
    fn: function () {
      const TODAY = new Date(2026, 9, 2, 12);
      const hist = (id, rows) => groupStageHistoryByRole(rows.map(([o, n, at]) =>
        ({ RoleIDLookupId: id, Field: 'Stage', OldValue: o, NewValue: n, ChangedAt: at })));
      const why = (role, h) => roleFlagReasons(role, [], h, TODAY);

      const s16 = why({ id: 1, Stage: 'Sourcing' }, hist(1, [[null, 'Planning', '2026-08-01T09:00:00Z'], ['Planning', 'Sourcing', '2026-09-16T09:00:00Z']]));
      _assertEqual([s16.stuck, s16.flagged, s16.daysInStage, s16.stageBudget, s16.entryKnown], [true, true, 16, 15, true], 'AC3 Sourcing 16 days > 15 → stuck');
      const s15 = why({ id: 1, Stage: 'Sourcing' }, hist(1, [[null, 'Planning', '2026-08-01T09:00:00Z'], ['Planning', 'Sourcing', '2026-09-17T09:00:00Z']]));
      _assertEqual([s15.stuck, s15.flagged, s15.daysInStage], [false, false, 15], 'AC3 Sourcing 15 days → not stuck');
      const sub = why({ id: 2, Stage: 'Submitted' }, hist(2, [['Sourcing', 'Submitted', '2026-09-24T09:00:00Z']]));
      _assertEqual([sub.stuck, sub.daysInStage, sub.stageBudget], [true, 8, 7], 'AC3 Submitted 8 days > 7 → stuck');
      const iv2 = why({ id: 3, Stage: 'Interview 2+' }, hist(3, [['Interview 1', 'Interview 2+', '2026-09-25T09:00:00Z']]));
      _assertEqual([iv2.stuck, iv2.daysInStage], [false, 7], 'AC3 Interview 2+ 7 days → not stuck');

      ['Final Interview', 'Offered'].forEach(st => {
        const r = why({ id: 4, Stage: st }, hist(4, [['Interview 2+', st, '2026-08-03T09:00:00Z']]));
        _assertEqual([r.stuck, r.daysInStage, r.entryKnown], [false, 60, true], `AC4 ${st} at 60 days never stuck`);
      });
      ['Planning', 'Backlog'].forEach(st => {
        const r = why({ id: 5, Stage: st, OpenDate: '2026-03-16T12:00:00Z' }, hist(5, [[null, st, '2026-03-16T09:00:00Z']]));
        _assertEqual([r.stuck, r.behindPace, r.stageBudget], [false, false, null], `AC4 ${st} never age-evaluated`);
      });

      const old = { id: 6, Stage: 'Sourcing', OpenDate: '2026-03-16T12:00:00Z' };
      const none = why(old, {});
      _assertEqual([none.entryKnown, none.stuck, none.flagged], [false, false, false], 'AC5 no stage rows → never stuck, even 200 days open');
      const mismatch = why(old, hist(6, [['Sourcing', 'Interview 1', '2026-04-01T09:00:00Z']]));
      _assertEqual([mismatch.entryKnown, mismatch.stuck], [false, false], 'AC5 latest row disagrees with Stage → unknown');
    },
  },
  {
    name: 'N-274 roleStageEntryDay — back-dates a creation row / first Sourcing entry to OpenDate, never a later transition',
    fn: function () {
      const rows = list => list.map(([o, n, at]) => ({ OldValue: o, NewValue: n, ChangedAt: at }));
      _assertEqual(roleStageEntryDay({ Stage: 'Interview 1', OpenDate: '2026-08-01T12:00:00Z' },
        rows([[null, 'Interview 1', '2026-09-20T09:00:00Z']])), '2026-08-01', 'AC6 creation row (null) → OpenDate');
      _assertEqual(roleStageEntryDay({ Stage: 'Interview 1', OpenDate: '2026-08-01T12:00:00Z' },
        rows([['', 'Interview 1', '2026-09-20T09:00:00Z']])), '2026-08-01', 'AC6 creation row (empty string) → OpenDate');
      _assertEqual(roleStageEntryDay({ Stage: 'Sourcing', OpenDate: '2026-09-10T12:00:00Z' },
        rows([[null, 'Planning', '2026-07-01T09:00:00Z'], ['Planning', 'Sourcing', '2026-09-25T09:00:00Z']])), '2026-09-10', 'AC6 first Sourcing entry → OpenDate');
      _assertEqual(roleStageEntryDay({ Stage: 'Interview 1', OpenDate: '2026-08-01T12:00:00Z' },
        rows([['Submitted', 'Interview 1', '2026-09-25T09:00:00Z']])), '2026-09-25', 'AC6 later transition is never back-dated');
      _assertEqual(roleStageEntryDay({ Stage: 'Interview 1', OpenDate: '2026-09-30T12:00:00Z' },
        rows([[null, 'Interview 1', '2026-09-20T09:00:00Z']])), '2026-09-20', 'AC6 OpenDate later than the row → row day kept');
      _assertEqual(roleStageEntryDay({ Stage: 'Sourcing', OpenDate: '2026-09-02T12:00:00Z' },
        rows([[null, 'Sourcing', '2026-09-02T09:00:00Z'], ['Sourcing', 'On-hold', '2026-09-10T09:00:00Z'], ['On-hold', 'Sourcing', '2026-09-29T09:00:00Z']])),
        '2026-09-29', 'Return from On-hold counts from the return, not the first Sourcing entry');
    },
  },
  {
    name: 'N-274 roleFlagReasons — behind pace is information only; conversion is windowed with a minimum volume',
    fn: function () {
      const TODAY = new Date(2026, 9, 2, 12);
      const h = groupStageHistoryByRole([
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: null,       NewValue: 'Sourcing', ChangedAt: '2026-09-02T09:00:00Z' },
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: 'Sourcing', NewValue: 'On-hold',  ChangedAt: '2026-09-10T09:00:00Z' },
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: 'On-hold',  NewValue: 'Sourcing', ChangedAt: '2026-09-29T09:00:00Z' },
      ]);
      const pace = roleFlagReasons({ id: 7, Stage: 'Sourcing', OpenDate: '2026-09-02T12:00:00Z' }, [], h, TODAY);
      _assertEqual([pace.behindPace, pace.daysOpen, pace.paceBudget, pace.daysInStage, pace.stuck, pace.flagged], [true, 30, 15, 3, false, false], 'AC7 behind pace but not flagged');
      _assertEqual(isRoleFlagged({ id: 7, Stage: 'Sourcing', OpenDate: '2026-09-02T12:00:00Z' }, [], h, TODAY), false, 'AC7 isRoleFlagged ignores pace');

      const role = { id: 8, Stage: 'Interview 1' };
      const wk = (day, Submitted, Interview1) => ({ RoleIDLookupId: 8, WeekEndingDate: `${day}T12:00:00Z`, Submitted, Interview1 });
      const conv = acts => roleFlagReasons(role, acts, {}, TODAY).conversion;
      _assertEqual(conv([wk('2026-09-27', 4, 1), wk('2026-09-20', 2, 1)]), true, 'AC8 6 Submitted / 2 IV1 in window → flagged');
      _assertEqual(conv([wk('2026-09-27', 2, 0)]), false, 'AC8 2 Submitted is below the minimum');
      _assertEqual(conv([wk('2026-08-02', 10, 1)]), false, 'AC8 activity 8+ weeks old is outside the window');
      _assertEqual(conv([{ RoleIDLookupId: 8, Submitted: 10, Interview1: 1 }]), false, 'AC8 undated rows are ignored');
      _assertEqual(conv([wk('2026-09-27', 6, 3)]), false, 'AC8 exactly 50% is not below the minimum rate');
      _assertEqual(isRoleFlagged(role, [wk('2026-09-27', 4, 1), wk('2026-09-20', 2, 1)], undefined, TODAY), true, 'AC9 undefined stage history → conversion still evaluated');
      _assertEqual(isRoleFlagged({ id: 1, Stage: 'Sourcing', OpenDate: '2026-03-16T12:00:00Z' }, []), false, 'AC9 2-argument call: no stage history, no stuck flag, no throw');
      _assertEqual(roleFlagReasons({ id: 1, Stage: 'Sourcing' }, undefined).flagged, false, 'AC9 undefined activity is safe');
    },
  },
  {
    name: 'N-274 flaggedShareRAG, tallyRoleFlags and groupStageHistoryByRole',
    fn: function () {
      _assertEqual([[0, 0], [2, 10], [3, 10], [5, 10], [6, 10]].map(([f, o]) => flaggedShareRAG(f, o)),
        ['green', 'green', 'amber', 'amber', 'red'], 'AC10 Health RAG thresholds');
      const TODAY = new Date(2026, 9, 2, 12);
      const rows = [
        { RoleIDLookupId: 2, Field: 'Stage', OldValue: 'Sourcing', NewValue: 'Submitted', ChangedAt: '2026-09-24T09:00:00Z' },
        { RoleIDLookupId: 2, Field: 'Notes', OldValue: 'a',        NewValue: 'b',         ChangedAt: '2026-09-30T09:00:00Z' },
        { RoleIDLookupId: 1, Field: 'Stage', OldValue: 'Planning', NewValue: 'Sourcing',  ChangedAt: '2026-09-29T09:00:00Z' },
        { RoleIDLookupId: 1, Field: 'Stage', OldValue: null,       NewValue: 'Planning',  ChangedAt: '2026-07-01T09:00:00Z' },
      ];
      const h = groupStageHistoryByRole(rows);
      _assertEqual(h['1'].map(r => r.NewValue), ['Planning', 'Sourcing'], 'grouping sorts oldest first');
      _assertEqual(h['2'].length, 1, 'grouping drops non-Stage rows');
      const roles = [
        { id: 1, Stage: 'Sourcing', OpenDate: '2026-09-29T12:00:00Z' },  // fresh: nothing
        { id: 2, Stage: 'Submitted', OpenDate: '2026-08-01T12:00:00Z' }, // stuck 8 > 7, behind pace
        { id: 3, Stage: 'Interview 1' },                                  // conversion only
      ];
      const acts = [{ RoleIDLookupId: 3, WeekEndingDate: '2026-09-27T12:00:00Z', Submitted: 5, Interview1: 1 }];
      _assertEqual(tallyRoleFlags(roles, acts, h, TODAY), { total: 3, flagged: 2, stuck: 1, conversion: 1, behind: 1 }, 'tally counts each reason once per role');
    },
  },
  {
    name: 'N-336: computeFunnelScorecard = computeVelocityScore metrics (parity; positive control: different activity differs)',
    fn: function () {
      const { tpEmail, activity, placements, benchmarks } = FIXTURES.analytics2.velocity;
      _assertEqual(computeFunnelScorecard(activity, placements, benchmarks),
        computeVelocityScore(tpEmail, activity, placements, benchmarks).metrics, 'parity');
      const other = [{ Outreach: 100, Responses: 10, Submitted: 20, Interview1: 2, Offers: 1, Hires: 0 }];
      _assertEqual(JSON.stringify(computeFunnelScorecard(other, placements, benchmarks)) ===
        JSON.stringify(computeFunnelScorecard(activity, placements, benchmarks)), false, 'control: activity changes the rows');
    },
  }
);
