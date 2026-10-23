// tests/assert-sla-panel.js — SLA panel + Company tile (N-384, DA-4): RAG bands, period,
// panel model, breach rows, portfolio model, markup, render-from-cache, wiring.
// Loads AFTER tests/assert-sla-engine.js (reuses its _slaRun / _slaD / _slaToday helpers) and
// pushes this domain's entries into ASSERTIONS. The runner is synchronous, so the async mounts
// are covered by source scans plus the synchronous reach of getProjectSlaInputs.

(function () {
  const SPF = () => FIXTURES.slaPanel;
  const spT = n => addDaysISO(SPF().today, n);
  const spToday = () => { const p = SPF().today.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12, 0, 0); };
  const throwsOn = (fn, label) => { let t = false; try { fn(); } catch (e) { t = true; } if (!t) throw new Error(label + ': expected a throw'); };

  // A computeProjectSla()-shaped result, built by hand so every number is exact.
  function spTargets(t) {
    const out = {};
    CONFIG.SLA.METRICS.forEach(m => { out[m.key] = t && t[m.key] != null ? { value: t[m.key], source: 'default' } : null; });
    return out;
  }
  function spMetric(status, eventN, breachN, value, target) {
    return { target: target == null ? 7 : target, value: value == null ? 3 : value,
      eventDay: eventN === null ? null : spT(eventN), status: status, breachDay: breachN === null ? null : spT(breachN) };
  }
  function spHire(hcId, roleId, m) {
    const fine = spMetric('met', -50, null, 3);
    return { roleId: String(roleId), headcountId: String(hcId), openDay: spT(-60), state: 'open',
      metrics: { firstSubmissionDays: m.f || fine, timeToOfferDays: m.o || fine, timeToHireDays: m.h || fine } };
  }
  function spWeek(n, avg, breached) { return { weekEnding: spT(n), active: true, submissions: avg, rollingAvg: avg, breached: breached }; }
  function spBreach(key, metric, roleId, hcId, breachN, eventN, ongoing) {
    return { key: key, metric: metric, roleId: String(roleId), headcountId: hcId === null ? null : String(hcId),
      breachDay: spT(breachN), eventDay: eventN === null ? null : spT(eventN), ongoing: ongoing };
  }
  const GAPS0 = { undatedHires: 0, cancelledHires: 0, filledNoOfferDate: 0, historyMismatch: 0, noStageHistory: 0 };

  // Alpha: targets 7 / 2 / 30 / 45. Expected numbers are spelled out in each test.
  function alphaResult() {
    return {
      targets: spTargets({ firstSubmissionDays: 7, submissionsPerWeek: 2, timeToOfferDays: 30, timeToHireDays: 45 }),
      hires: [
        spHire(501, 50, { f: spMetric('met', -10, null, 4), o: spMetric('met', -5, null, 20, 30), h: spMetric('met', -1, null, 40, 45) }),
        spHire(502, 50, { f: spMetric('breached', -95, -100, 12), o: spMetric('pending', null, null, 10, 30), h: spMetric('pending', null, null, 10, 45) }),
        spHire(503, 51, { f: spMetric('breached', null, -3, 10), o: spMetric('pending', null, null, 10, 30), h: spMetric('pending', null, null, 10, 45) }),
      ],
      roles: [
        { roleId: '50', weeks: [spWeek(-14, 2.5, false), spWeek(-7, 1.25, true)],
          episodes: [{ startWeek: spT(-7), endWeek: spT(-7), ongoing: true, worstAvg: 1.25 }] },
        { roleId: '51', weeks: [spWeek(-7, 3, false)], episodes: [] },
      ],
      breaches: [
        spBreach('firstSubmissionDays:502', 'firstSubmissionDays', 50, 502, -100, -95, false),
        spBreach('firstSubmissionDays:503', 'firstSubmissionDays', 51, 503, -3, null, true),
        spBreach('submissionsPerWeek:50:' + spT(-7), 'submissionsPerWeek', 50, null, -7, -7, true),
      ],
      gaps: GAPS0,
    };
  }
  function alphaModel(periodKey) {
    return slaPanelModel({ result: alphaResult(), roles: SPF().roles, headcount: SPF().headcount, periodKey: periodKey, today: spToday() });
  }
  function metricOf(model, key) { return model.metrics.find(m => m.key === key); }

  // The portfolio: Alpha (red, 2 ongoing), Beta (green), Gamma (red, 1 ongoing), Delta (null result), Zeta (grey).
  function portfolioInputs() {
    const beta = { targets: spTargets({ timeToHireDays: 45 }),
      hires: [spHire(601, 60, { h: spMetric('met', -2, null, 30, 45) })], roles: [], breaches: [], gaps: GAPS0 };
    const gamma = { targets: spTargets({ firstSubmissionDays: 7 }),
      hires: [spHire(701, 70, { f: spMetric('breached', null, -2, 9) })], roles: [],
      breaches: [spBreach('firstSubmissionDays:701', 'firstSubmissionDays', 70, 701, -2, null, true)], gaps: GAPS0 };
    const zeta = { targets: spTargets({ firstSubmissionDays: 7 }), hires: [], roles: [], breaches: [], gaps: GAPS0 };
    return { projects: SPF().projects,
      results: { '1': alphaResult(), '2': beta, '3': gamma, '4': null, '5': zeta } };
  }
  function portfolioModel(periodKey) {
    const i = portfolioInputs();
    return slaPortfolioModel({ projects: i.projects, results: i.results, periodKey: periodKey, today: spToday() });
  }

  // document stub that is safe in node (no document) and in the browser harness (real document).
  function withDom(els, fn) {
    const get = id => els[id] || null;
    if (typeof document === 'undefined') {
      globalThis.document = { getElementById: get };
      try { fn(); } finally { delete globalThis.document; }
    } else {
      document.getElementById = get;
      try { fn(); } finally { delete document.getElementById; }
    }
  }
  function slot(id, token) { return { id: id, innerHTML: '', dataset: { slaToken: token || '1' } }; }
  function countRows(html, re) { return (html.match(re) || []).length; }

  ASSERTIONS.push(
    {
      name: 'N-384 config — RAG bands, periods, breach cap, capabilities; slaPanelConfigCheck',
      fn: function () {
        _assertEqual([CONFIG.SLA.RAG.green, CONFIG.SLA.RAG.amber], [80, 60], 'AC1 bands');
        _assertEqual(CONFIG.SLA.RAG.LABELS, { green: 'On track', amber: 'Watch', red: 'At risk', grey: 'Not rated' }, 'AC1 labels');
        _assertEqual(CONFIG.SLA.PERIODS.map(p => [p.key, p.days]), [['90d', 90], ['all', null]], 'AC1 periods');
        _assertEqual([CONFIG.SLA.PERIOD_DEFAULT, CONFIG.SLA.PANEL_BREACH_ROWS], ['90d', 25], 'AC1 default period and cap');
        _assertEqual(CONFIG.ROLE_CAPABILITIES.slaPanelView, ['admin', 'leadership', 'delivery_manager'], 'AC1 panel view');
        _assertEqual(CONFIG.ROLE_CAPABILITIES.slaPortfolioView, ['admin', 'leadership'], 'AC1 portfolio view');
        const roleIds = Object.keys(CONFIG.ROLE_IDS).map(k => CONFIG.ROLE_IDS[k]);
        ['slaPanelView', 'slaPortfolioView'].forEach(k =>
          CONFIG.ROLE_CAPABILITIES[k].forEach(r => _assertEqual(roleIds.includes(r), true, 'AC1 ' + k + ' names a real role: ' + r)));
        _assertEqual(slaPanelConfigCheck(), true, 'AC1 live config passes');
        const clone = f => { const c = JSON.parse(JSON.stringify(CONFIG.SLA)); f(c); return c; };
        throwsOn(() => slaPanelConfigCheck(clone(c => { c.RAG.amber = 80; })), 'AC1 amber >= green');
        throwsOn(() => slaPanelConfigCheck(clone(c => { c.RAG.green = 101; })), 'AC1 green > 100');
        throwsOn(() => slaPanelConfigCheck(clone(c => { c.RAG.amber = 59.5; })), 'AC1 non-integer');
        throwsOn(() => slaPanelConfigCheck(clone(c => { delete c.RAG.LABELS.grey; })), 'AC1 missing label');
        throwsOn(() => slaPanelConfigCheck(clone(c => { c.PERIODS[1].key = '90d'; })), 'AC1 duplicate period key');
        throwsOn(() => slaPanelConfigCheck(clone(c => { c.PERIODS[0].days = 0; })), 'AC1 zero days');
        throwsOn(() => slaPanelConfigCheck(clone(c => { c.PERIOD_DEFAULT = 'nope'; })), 'AC1 bad default');
        throwsOn(() => slaPanelConfigCheck(clone(c => { c.PANEL_BREACH_ROWS = 0; })), 'AC1 zero rows');
      },
    },
    {
      name: 'N-384 permissions — canViewSlaPanel / canViewSlaPortfolio',
      fn: function () {
        const all = Object.keys(CONFIG.ROLE_IDS).map(k => CONFIG.ROLE_IDS[k]);
        _assertEqual(all.filter(r => canViewSlaPanel(r)).sort(), ['admin', 'delivery_manager', 'leadership'], 'AC2 panel viewers');
        _assertEqual(all.filter(r => canViewSlaPortfolio(r)).sort(), ['admin', 'leadership'], 'AC2 portfolio viewers');
        ['talent_partner', 'people_ops', 'sales', 'staff', 'viewer'].forEach(r =>
          _assertEqual([canViewSlaPanel(r), canViewSlaPortfolio(r)], [false, false], 'AC2 ' + r));
        _assertEqual([canViewSlaPanel('nope'), canViewSlaPortfolio(undefined)], [false, false], 'AC2 unknown role');
      },
    },
    {
      name: 'N-384 slaRag — bands, boundaries, nothing evaluated',
      fn: function () {
        _assertEqual([100, 80, 79, 60, 59, 0].map(v => slaRag(v)), ['green', 'green', 'amber', 'amber', 'red', 'red'], 'AC3 bands');
        _assertEqual([null, undefined, NaN, 'x', Infinity].map(v => slaRag(v)), ['grey', 'grey', 'grey', 'grey', 'grey'], 'AC3 grey');
        _assertEqual([slaRag(50, { green: 50, amber: 10 }), slaRag(49, { green: 50, amber: 10 }), slaRag(9, { green: 50, amber: 10 })],
          ['green', 'amber', 'red'], 'AC3 custom config honoured');
      },
    },
    {
      name: 'N-384 slaPanelPeriod — last N days including today, all time, fallback, across BST to GMT',
      fn: function () {
        const today = new Date(2026, 9, 28, 12, 0, 0);          // after the 25 Oct clock change
        const p = slaPanelPeriod('90d', today);
        _assertEqual([p.key, p.label, p.toDay], ['90d', 'Last 90 days', '2026-10-28'], 'AC4 90d meta');
        _assertEqual(p.fromDay, addDaysISO('2026-10-28', -89), 'AC4 from = today - 89');
        let n = 1, d = p.fromDay;
        while (d < p.toDay) { d = addDaysISO(d, 1); n++; }
        _assertEqual([d, n], [p.toDay, 90], 'AC4 exactly 90 distinct days, inclusive');
        _assertEqual(slaPanelPeriod('all', today), { key: 'all', label: 'All time', fromDay: null, toDay: null }, 'AC4 all time');
        _assertEqual(slaPanelPeriod('nope', today), p, 'AC4 unknown key falls back to the default');
        const bst = slaPanelPeriod('90d', new Date(2026, 9, 10, 12, 0, 0));
        _assertEqual([bst.toDay, bst.fromDay], ['2026-10-10', addDaysISO('2026-10-10', -89)], 'AC4 window ending before the change');
      },
    },
    {
      name: 'N-384 slaPanelModel — metrics, RAG, ongoing, overall, no targets, null',
      fn: function () {
        _assertEqual(slaPanelModel({ result: null }), null, 'AC5 null result');
        const m = alphaModel('90d');
        _assertEqual(m.metrics.map(x => x.key), CONFIG.SLA.METRICS.map(x => x.key), 'AC5 registry order');
        const f = metricOf(m, 'firstSubmissionDays'), o = metricOf(m, 'timeToOfferDays'), h = metricOf(m, 'timeToHireDays'), w = metricOf(m, 'submissionsPerWeek');
        _assertEqual([f.target, f.met, f.breached, f.pending, f.pct, f.rag, f.ongoing], [7, 1, 1, 0, 50, 'red', 1], 'AC5 first submission');
        _assertEqual([o.met, o.breached, o.pending, o.pct, o.rag, o.ongoing], [1, 0, 2, 100, 'green', 0], 'AC5 offer');
        _assertEqual([h.met, h.breached, h.pending, h.pct, h.rag], [1, 0, 2, 100, 'green'], 'AC5 hire');
        _assertEqual([w.target, w.met, w.breached, w.pct, w.rag, w.ongoing, w.noun], [2, 2, 1, 67, 'amber', 1, 'weeks'], 'AC5 weekly');
        _assertEqual(m.metrics.filter(x => x.key !== 'submissionsPerWeek').map(x => x.noun), ['hires', 'hires', 'hires'], 'AC5 noun');
        _assertEqual([m.hasTargets, m.rag, m.ongoingBreaches, m.period.key], [true, 'red', 2, '90d'], 'AC5 overall = worst rated');
        const none = slaPanelModel({ result: { targets: spTargets({}), hires: [], roles: [], breaches: [], gaps: GAPS0 }, roles: [], headcount: [], periodKey: 'all', today: spToday() });
        _assertEqual([none.hasTargets, none.rag, none.metrics.every(x => x.rag === 'grey' && x.pct === null && x.target === null)], [false, 'grey', true], 'AC5 no targets');
        const onlyWeekly = alphaResult(); onlyWeekly.hires = []; onlyWeekly.breaches = [];
        _assertEqual(slaPanelModel({ result: onlyWeekly, roles: [], headcount: [], periodKey: 'all', today: spToday() }).rag, 'amber', 'AC5 overall ignores unrated metrics');
      },
    },
    {
      name: 'N-384 period moves attainment only — the breach list is full history either way',
      fn: function () {
        const d90 = alphaModel('90d'), all = alphaModel('all');
        _assertEqual([metricOf(d90, 'firstSubmissionDays').breached, metricOf(all, 'firstSubmissionDays').breached], [1, 2], 'AC6 old breach leaves the 90-day window');
        _assertEqual([metricOf(d90, 'firstSubmissionDays').pct, metricOf(all, 'firstSubmissionDays').pct], [50, 33], 'AC6 pct moves');
        _assertEqual(d90.breachRows.map(r => r.key), all.breachRows.map(r => r.key), 'AC6 same breach rows under both periods');
        _assertEqual(d90.breachRows.length, 3, 'AC6 the pre-window breach is still listed');
        _assertEqual(d90.breachRows.filter(r => r.ongoing).length, all.breachRows.filter(r => r.ongoing).length, 'AC6 ongoing unaffected');
        _assertEqual(metricOf(d90, 'firstSubmissionDays').ongoing, metricOf(all, 'firstSubmissionDays').ongoing, 'AC6 ongoing count not period-bound');
      },
    },
    {
      name: 'N-384 breachRows — order, status, labels, values; unknown role; no mutation',
      fn: function () {
        const input = alphaResult();
        const before = JSON.stringify(input);
        const model = slaPanelModel({ result: input, roles: SPF().roles, headcount: SPF().headcount, periodKey: 'all', today: spToday() });
        _assertEqual(JSON.stringify(input), before, 'AC7 input not mutated');
        const rows = model.breachRows;
        _assertEqual(rows.map(r => r.key), ['firstSubmissionDays:503', 'submissionsPerWeek:50:' + spT(-7), 'firstSubmissionDays:502'],
          'AC7 ongoing first, then breachDay descending');
        _assertEqual(rows.map(r => r.status), ['ongoing', 'ongoing', 'resolved'], 'AC7 status');
        const r503 = rows[0], wk = rows[1], r502 = rows[2];
        _assertEqual([r503.roleLabel, r503.hireLabel, r503.value, r503.metricLabel, r503.target], ['Designer', 'Headcount 3', 10, 'Time to first submission', 7], 'AC7 ongoing hire row');
        _assertEqual([r502.roleLabel, r502.hireLabel, r502.value, r502.eventDay], ['Engineer (Lisbon)', 'Headcount 2', 12, spT(-95)], 'AC7 resolved hire row; Title missing -> headcountLabel(Sequence)');
        _assertEqual([wk.hireLabel, wk.worstAvg, wk.value, wk.target, wk.breachDay], [null, 1.25, null, 2, spT(-7)], 'AC7 weekly row');
        const odd = alphaResult();
        odd.breaches.push(spBreach('firstSubmissionDays:999', 'firstSubmissionDays', 99, 999, -1, null, true));
        const oddRows = slaPanelModel({ result: odd, roles: SPF().roles, headcount: SPF().headcount, periodKey: 'all', today: spToday() }).breachRows;
        const x = oddRows.find(r => r.key === 'firstSubmissionDays:999');
        _assertEqual([x.roleLabel, x.hireLabel, x.value], ['Role 99', 'Hire 999', null], 'AC7 unknown role / headcount fall back');
        _assertEqual(headcountRoleLabel({ id: 7, RoleTitle: 'Dev', Location: 'Porto' }) + '|' + headcountRoleLabel({ id: 7, RoleTitle: 'Dev' }) + '|' + headcountRoleLabel({ id: 7 }),
          'Dev (Porto)|Dev|Role 7', 'AC7 headcountRoleLabel is the one role label');
      },
    },
    {
      name: 'N-384 slaGapNotes — only non-zero gaps speak',
      fn: function () {
        _assertEqual(slaGapNotes(GAPS0), [], 'AC8 clean');
        _assertEqual(slaGapNotes(null), [], 'AC8 null');
        _assertEqual(slaGapNotes({ cancelledHires: 5 }), [], 'AC8 cancelled is never listed');
        const n = slaGapNotes({ undatedHires: 1, filledNoOfferDate: 2, noStageHistory: 3, historyMismatch: 1, cancelledHires: 9 });
        _assertEqual(n.length, 4, 'AC8 one note each');
        _assertEqual(n[0].indexOf('1 hire has no open date') === 0 && n[1].indexOf('2 filled hires have') === 0 && n[2].indexOf('3 roles have no stage history') === 0 && n[3].indexOf('1 role has') === 0, true, 'AC8 wording and plurals');
        _assertEqual(slaGapNotes({ undatedHires: 3 })[0].indexOf('3 hires have no open date') === 0, true, 'AC8 plural');
      },
    },
    {
      name: 'N-384 slaPortfolioModel — pooled by counts, worst-of RAG, one row per project, summaries',
      fn: function () {
        const i = portfolioInputs();
        const before = JSON.stringify(i);
        const p = portfolioModel('90d');
        _assertEqual(JSON.stringify(i), before, 'AC9 inputs not mutated');
        const pm = key => p.metrics.find(m => m.key === key);
        _assertEqual([pm('firstSubmissionDays').met, pm('firstSubmissionDays').breached, pm('firstSubmissionDays').pct, pm('firstSubmissionDays').rag, pm('firstSubmissionDays').rated],
          [1, 2, 33, 'red', 2], 'AC9 pooled by counts (the mean of project % would be 25)');
        _assertEqual([pm('timeToHireDays').met, pm('timeToHireDays').pct, pm('timeToHireDays').rated], [2, 100, 2], 'AC9 projects without a target for a metric do not enter its pool');
        _assertEqual([pm('timeToOfferDays').met, pm('timeToOfferDays').rated, pm('submissionsPerWeek').pct, pm('submissionsPerWeek').rag], [1, 1, 67, 'amber'], 'AC9 other metrics');
        _assertEqual(p.rows.map(r => r.name), ['Alpha', 'Gamma', 'Beta', 'Zeta'], 'AC9 one row per non-null project, red (more ongoing first), green, grey; Delta skipped');
        _assertEqual(p.rows.map(r => r.rag), ['red', 'red', 'green', 'grey'], 'AC9 project RAG = worst rated metric');
        _assertEqual(p.counts, { green: 1, amber: 0, red: 2, grey: 1 }, 'AC9 counts');
        const alpha = p.rows[0], gamma = p.rows[1], beta = p.rows[2], zeta = p.rows[3];
        _assertEqual(alpha.problems.map(x => [x.key, x.pct, x.rag]), [['firstSubmissionDays', 50, 'red'], ['submissionsPerWeek', 67, 'amber']], 'AC9 problems: amber/red only, worst first');
        _assertEqual(alpha.summary, 'Time to first submission 50% · Submissions per role per week 67% · 2 ongoing breaches', 'AC9 problem summary');
        _assertEqual(gamma.summary, 'Time to first submission 0% · 1 ongoing breach', 'AC9 singular');
        _assertEqual([beta.summary, beta.problems.length, zeta.summary], ['No problem areas', 0, 'Not rated'], 'AC9 green / grey summaries');
        const g = portfolioInputs(); g.results['2'].breaches = [spBreach('timeToHireDays:601', 'timeToHireDays', 60, 601, -1, null, true)];
        const gm = slaPortfolioModel({ projects: g.projects, results: g.results, periodKey: '90d', today: spToday() });
        _assertEqual(gm.rows.find(r => r.name === 'Beta').summary, 'Ongoing breaches: 1', 'AC9 green with an ongoing breach');
        _assertEqual(slaPortfolioModel({ projects: [], results: {}, periodKey: 'all', today: spToday() }).rows, [], 'AC9 empty');
      },
    },
    {
      name: 'N-384 slaPanelHtml — metrics table, RAG cues, breaches, no-targets, empty, escaping, no inline code',
      fn: function () {
        const html = slaPanelHtml(alphaModel('90d'), { slotId: 'proj-sla-slot' });
        _assertEqual(html.indexOf('SLA performance') > -1 && html.indexOf('At risk') > -1, true, 'AC10 heading and project pill from LABELS');
        CONFIG.SLA.METRICS.forEach(m => _assertEqual(html.indexOf(m.label) > -1, true, 'AC10 metric label ' + m.label));
        _assertEqual(html.indexOf('7 days') > -1 && html.indexOf('2 per week') > -1 && html.indexOf('45 days') > -1, true, 'AC10 targets through slaFormatTarget');
        _assertEqual(/rag-text--green">100%/.test(html), true, 'AC10 green is neutral: no marker inside it');
        _assertEqual(/rag-text--red"><span class="rag-marker rag-marker--red"/.test(html) && /rag-text--amber"><span class="rag-marker rag-marker--amber"/.test(html), true, 'AC10 red and amber carry the glyph marker');
        _assertEqual(html.indexOf('1 of 2 hires on target') > -1 && html.indexOf('2 of 3 weeks on target') > -1 && html.indexOf('2 running') > -1, true, 'AC10 counts, nouns and running');
        _assertEqual(html.indexOf('Attainment · Last 90 days') > -1, true, 'AC10 period in the header');
        _assertEqual(/btn-filter active[^>]*>Last 90 days/.test(html), true, 'AC10 toggle shows the active period');
        const hist = slaPanelHtml(alphaModel('90d'), { slotId: 'proj-sla-slot', view: 'history' });
        _assertEqual(html.indexOf('Week ending') > -1 && html.indexOf('Ongoing: 10 days so far, target 7 days') > -1 && html.indexOf('Late: took 12 days') === -1, true, 'AC10 default view lists ongoing breach statuses only');
        _assertEqual(hist.indexOf('Late: took 12 days, target 7 days') > -1, true, 'AC10 the history view carries the resolved status');
        _assertEqual(html.indexOf('Show all') === -1, true, 'AC10 no Show all under the cap');
        const quiet = slaPanelHtml(slaPanelModel({ result: { targets: alphaResult().targets, hires: [], roles: [], breaches: [], gaps: GAPS0 }, roles: [], headcount: [], periodKey: 'all', today: spToday() }), {});
        _assertEqual(quiet.indexOf('No ongoing SLA breaches.') > -1, true, 'AC10 empty ongoing list');
        const noT = slaPanelHtml(slaPanelModel({ result: { targets: spTargets({}), hires: [], roles: [], breaches: [], gaps: GAPS0 }, roles: [], headcount: [], periodKey: 'all', today: spToday() }), {});
        _assertEqual(noT.indexOf('No SLA targets are set for this project type.') > -1 && noT.indexOf('<table') === -1, true, 'AC10 no-targets message instead of tables');
        const gapped = alphaResult(); gapped.gaps = Object.assign({}, GAPS0, { undatedHires: 2 });
        _assertEqual(slaPanelHtml(slaPanelModel({ result: gapped, roles: [], headcount: [], periodKey: 'all', today: spToday() }), {}).indexOf('2 hires have no open date') > -1, true, 'AC10 data-gap line');
        _assertEqual(html.indexOf('sla-gaps') === -1, true, 'AC10 no gap line when clean');
        const evilRoles = [{ id: 50, RoleTitle: '<img src=x onerror=alert(1)>', Location: '"><b>' }, { id: 51, RoleTitle: 'Designer' }];
        const bad = slaPanelHtml(slaPanelModel({ result: alphaResult(), roles: evilRoles, headcount: [{ id: 502, RoleID: 50, Sequence: 2, Title: '<script>x</script>' }], periodKey: 'all', today: spToday() }), {});
        const badHist = slaPanelHtml(slaPanelModel({ result: alphaResult(), roles: evilRoles, headcount: [{ id: 502, RoleID: 50, Sequence: 2, Title: '<script>x</script>' }], periodKey: 'all', today: spToday() }), { view: 'history' });
        _assertEqual(bad.indexOf('<img') === -1 && bad.indexOf('&lt;img') > -1 && badHist.indexOf('<script') === -1 && badHist.indexOf('&lt;script&gt;') > -1, true, 'AC10 role and hire labels are escaped'); 
        _assertEqual(/\son[a-z]+\s*=/i.test(html) || /\sstyle\s*=/i.test(html), false, 'AC10 no inline handlers or styles');
      },
    },
    {
      name: 'N-384 breach cap — 25 then Show all (N); survives a period change',
      fn: function () {
        const r = alphaResult(); r.breaches = [];
        for (let i = 0; i < 30; i++) r.breaches.push(spBreach('firstSubmissionDays:9' + String(i).padStart(2, '0'), 'firstSubmissionDays', 50, 900 + i, -(i + 1), null, true));
        const model = slaPanelModel({ result: r, roles: [], headcount: [], periodKey: 'all', today: spToday() });
        const capped = slaPanelHtml(model, { slotId: 's1' });
        const roleRow = /cell-link"[^>]*>Role 50</g;
        _assertEqual([countRows(capped, roleRow), capped.indexOf('Show all (30)') > -1], [25, true], 'AC11 25 rows and Show all (30)');
        _assertEqual(countRows(slaPanelHtml(model, { slotId: 's1', showAll: true }), roleRow), 30, 'AC11 all 30 once revealed');
        const el = slot('s1', 't1');
        const prev = _slaPeriod;
        withDom({ s1: el }, function () {
          try {
            _slaMounts.set('s1', { kind: 'project', token: 't1', project: { id: 1 }, inputs: { roles: [], headcount: [] }, result: r, showAll: false });
            _slaRender('s1');
            _assertEqual(countRows(el.innerHTML, roleRow), 25, 'AC11 rendered capped');
            showAllSlaBreaches('s1');
            _assertEqual(countRows(el.innerHTML, roleRow), 30, 'AC11 Show all reveals every row');
            setSlaPeriod('all');
            _assertEqual(countRows(el.innerHTML, roleRow), 30, 'AC11 still revealed after a period toggle');
          } finally { _slaPeriod = prev; _slaMounts.delete('s1'); }
        });
      },
    },
    {
      name: 'N-384 period toggle — re-renders every slot on screen from the cache, no reads; stale slots dropped',
      fn: function () {
        const prev = _slaPeriod;
        const reads = [];
        const keep = { gi: getProjectSlaInputs, gp: getPortfolioSlaInputs, git: getItems, gs: getSLATargets };
        const a = slot('a', 'ta'), b = slot('b', 'tb');
        try {
          getProjectSlaInputs = function () { reads.push('inputs'); return new Promise(function () {}); };
          getPortfolioSlaInputs = function () { reads.push('portfolio'); return new Promise(function () {}); };
          getItems = function () { reads.push('items'); return new Promise(function () {}); };
          getSLATargets = function () { reads.push('sla'); return new Promise(function () {}); };
          _slaPeriod = '90d';
          const pi = portfolioInputs();
          _slaMounts.set('a', { kind: 'project', token: 'ta', project: { id: 1 }, inputs: { roles: SPF().roles, headcount: SPF().headcount }, result: alphaResult(), showAll: false });
          _slaMounts.set('b', { kind: 'portfolio', token: 'tb', projects: pi.projects, results: pi.results });
          _slaMounts.set('gone', { kind: 'project', token: 'tg', project: { id: 2 }, inputs: { roles: [], headcount: [] }, result: alphaResult(), showAll: false });
          withDom({ a: a, b: b }, function () {
            _slaRender('a'); _slaRender('b');
            _assertEqual([/btn-filter active[^>]*>Last 90 days/.test(a.innerHTML), /btn-filter active[^>]*>Last 90 days/.test(b.innerHTML)], [true, true], 'AC12 default 90 days on both');
            setSlaPeriod('all');
            _assertEqual([/btn-filter active[^>]*>All time/.test(a.innerHTML), /btn-filter active[^>]*>All time/.test(b.innerHTML)], [true, true], 'AC12 both re-render');
            _assertEqual(a.innerHTML.indexOf('Attainment · All time') > -1 && b.innerHTML.indexOf('Problem areas · All time') > -1, true, 'AC12 period in both headers');
            _assertEqual(reads, [], 'AC12 zero reads');
            _assertEqual(_slaMounts.has('gone'), false, 'AC12 a slot no longer on screen is forgotten');
            setSlaPeriod('bogus');
            _assertEqual(_slaPeriod, 'all', 'AC12 an unknown key is ignored');
            b.dataset.slaToken = 'other';
            b.innerHTML = 'stale';
            setSlaPeriod('90d');
            _assertEqual(b.innerHTML, 'stale', 'AC12 a slot re-claimed by a newer mount is not overwritten');
          });
        } finally {
          getProjectSlaInputs = keep.gi; getPortfolioSlaInputs = keep.gp; getItems = keep.git; getSLATargets = keep.gs;
          _slaPeriod = prev; _slaMounts.delete('a'); _slaMounts.delete('b'); _slaMounts.delete('gone');
        }
      },
    },
    {
      name: 'N-384 slaPortfolioTileHtml — one row per project, links, summaries, counts, escaping',
      fn: function () {
        const html = slaPortfolioTileHtml(portfolioModel('90d'));
        _assertEqual(countRows(html, /class="cell-link"/g), 4, 'AC15 one row per project');
        _assertEqual(['Alpha', 'Gamma', 'Beta', 'Zeta'].every(n => html.indexOf('>' + n + '</a>') > -1), true, 'AC15 names');
        _assertEqual(html.indexOf('No problem areas') > -1 && html.indexOf('Not rated') > -1, true, 'AC15 green and grey rows speak too');
        _assertEqual(html.indexOf('Time to first submission 50% · Submissions per role per week 67% · 2 ongoing breaches') > -1, true, 'AC15 problem summary');
        _assertEqual(html.indexOf('1 on track · 0 watch · 2 at risk · 1 not rated · 4 projects') > -1, true, 'AC15 counts line');
        _assertEqual(html.indexOf('Problem areas · Last 90 days') > -1 && html.indexOf('SLA summary') > -1, true, 'AC15 header');
        _assertEqual(/openProjectPage\.prevent/.test(html), true, 'AC15 rows open the Project page');
        const i = portfolioInputs();
        const bad = slaPortfolioTileHtml(slaPortfolioModel({ projects: [{ id: 1, CustomerName: '<img src=x onerror=alert(1)>' }], results: i.results, periodKey: 'all', today: spToday() }));
        _assertEqual(bad.indexOf('<img') === -1 && bad.indexOf('&lt;img') > -1, true, 'AC15 project names escaped');
        _assertEqual(slaPortfolioTileHtml(slaPortfolioModel({ projects: [], results: {}, periodKey: 'all', today: spToday() })).indexOf('No projects have SLA targets yet.') > -1, true, 'AC15 empty tile');
        _assertEqual(/\son[a-z]+\s*=/i.test(html) || /\sstyle\s*=/i.test(html), false, 'AC15 no inline handlers or styles');
      },
    },
    {
      name: 'N-384 integration — real engine result through the panel model',
      fn: function () {
        const F = FIXTURES.slaEngine;
        const today = _slaToday(10);                                  // hire open since D, nothing submitted
        const r = _slaRun({ today: today });
        const model = slaPanelModel({ result: r, roles: [F.role], headcount: [F.hc], periodKey: 'all', today: today });
        const f = metricOf(model, 'firstSubmissionDays');
        _assertEqual([f.target, f.breached, f.met, f.pct, f.rag, f.ongoing], [7, 1, 0, 0, 'red', 1], 'integration first submission breached');
        _assertEqual(metricOf(model, 'timeToOfferDays').pending, 1, 'integration offer still running');
        _assertEqual(model.breachRows.length, 1, 'integration one breach');
        const row = model.breachRows[0];
        _assertEqual([row.status, row.value, row.breachDay, row.hireLabel, row.roleLabel], ['ongoing', 10, _slaD(8), 'Headcount 1', 'Role 50'], 'integration row');
        _assertEqual(model.rag, 'red', 'integration overall');
      },
    },
    {
      name: 'N-384 getProjectSlaInputs / sources — own un-narrowed reads, wiring on all three surfaces, independence',
      fn: function () {
        const keep = getRolesForProject, seen = [];
        try {
          getRolesForProject = function (id) { seen.push(id); return new Promise(function () {}); };
          getProjectSlaInputs(42);
        } finally { getRolesForProject = keep; }
        _assertEqual(seen, [42], 'AC17 roles read first, for the whole project');
        if (typeof ALL_SOURCES === 'undefined') _skip('source scan needs the filesystem (node tests/run.js)');
        const S = ALL_SOURCES;
        const body = (src, start) => { const i = src.indexOf(start); if (i < 0) return ''; const m = /\r?\n\}\r?\n/.exec(src.slice(i)); return m ? src.slice(i, i + m.index + m[0].length) : src.slice(i); };
        const inputs = body(S['api.js'], 'async function getProjectSlaInputs(');
        _assertEqual(/getWeeklyActivity\(null, null, \{ roleIds \}\)/.test(inputs) && inputs.indexOf('sinceWeeks') === -1, true, 'AC17 activity unwindowed, scoped by role ids');
        _assertEqual(/getPlacements\(null, \{ roleIds \}\)/.test(inputs) && inputs.indexOf('fromDay') === -1, true, 'AC17 placements all-time');
        _assertEqual((inputs.match(/\.catch\(/g) || []).length === 1 && /getRejectedOffers\([^\n]*\.catch\(/.test(inputs), true, 'AC17 only the rejected-offers read degrades');
        _assertEqual(/getRolesForProject\(projectId\)/.test(inputs) && inputs.indexOf('getScopedUserEmail') === -1, true, 'AC17 never TP-narrowed');
        const tile = body(S['api.js'], 'async function getPortfolioSlaInputs(');
        _assertEqual(/getPlacements\(null\)/.test(tile) && tile.indexOf('fromDay') === -1 && (tile.match(/\.catch\(/g) || []).length === 1, true, 'AC17 tile reads placements itself, all-time; only rejected offers degrade');
        const panel = S['sla-panel.js'];
        _assertEqual(panel.indexOf('_dashCache') === -1 && panel.indexOf('fetchDashboardData') === -1 && panel.indexOf('_coCache') === -1, true, 'AC13 panel never reuses the dashboard caches');
        const dp = S['dashboard-project.js'];
        const slotAt = dp.indexOf('${slaSlot}'), gridAt = dp.indexOf("id='proj-detail-grid'");
        _assertEqual(slotAt > -1 && gridAt > slotAt, true, 'AC13 slot is before, so outside, #proj-detail-grid');
        _assertEqual(/const slaSlot\s*=\s*isDMAdmin && slaEditorModel\(dashProject, \[\]\)/.test(dp), true, 'AC13 slot for the DM/Admin flag and SLA-eligible projects only');
        _assertEqual(dp.indexOf("mountProjectSlaPanel('proj-sla-slot', dashProject)") > -1, true, 'AC13 mounted after render');
        _assertEqual(body(dp, 'function setDetailPeriod(').indexOf('proj-sla-slot') === -1, true, 'AC13 the detail period never touches the slot');
        const dc = S['dashboard-company.js'];
        _assertEqual(/canViewSlaPortfolio\(_resolvedRole\)/.test(dc), true, 'AC15 tile gated by canViewSlaPortfolio');
        _assertEqual(dc.indexOf('excludeInternalProjectData(') > -1 && dc.indexOf("mountPortfolioSlaTile('co-sla-slot'") > dc.indexOf('excludeInternalProjectData('), true, 'AC15 tile is fed the internal-filtered data');
        _assertEqual(dc.indexOf("projects: allProjects.filter(isProjectActive), roles: allRoles, activity: allActivity, headcount: allHeadcount }") > -1, true, 'AC15 active, filtered projects only');
        const pp = S['project-page.js'];
        const secAt = pp.indexOf('${_ppSlaSectionHtml(v)}'), panAt = pp.indexOf('${_ppSlaPanelSectionHtml(v)}'), teamAt = pp.indexOf('<section class="role-page-section pp-team"');
        _assertEqual(secAt > -1 && panAt > secAt && teamAt > panAt, true, 'AC14 panel sits after SLA targets and before Project Team');
        _assertEqual(/function _ppSlaPanelSectionHtml\(v\) \{\s*if \(!canViewSlaPanel\(_resolvedRole\) \|\| !slaEditorModel\(v\.project, \[\]\)\) return '';/.test(pp), true, 'AC14 capability and eligibility gate');
        _assertEqual(body(pp, 'async function _ppSlaWrite(').indexOf("refreshSlaPanel('pp-sla-panel')") > -1, true, 'AC14 save and reset both refresh the panel');
        _assertEqual(pp.indexOf("mountProjectSlaPanel('pp-sla-panel', data.project)") > -1, true, 'AC14 mounted after the page renders');
        const rh = ALL_HTML['reporting.html'];
        _assertEqual(rh.indexOf('js/sla-panel.js') > rh.indexOf('js/sla-admin.js') && rh.indexOf('js/sla-admin.js') > -1, true, 'wired on reporting.html after sla-admin.js');
        _assertEqual(CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays, 45, 'AC18 SLA bands never moved the pace benchmark');
        [slaRag, slaPanelPeriod, slaPanelModel, slaGapNotes, slaPortfolioModel, _slaProjectSummary].forEach(fn => {
          const src = fn.toString();
          ['ANALYTICS_BENCHMARKS', 'ROLE_STAGE_BUDGETS', 'ACTIVE_STAGES', 'TTF_CENSORED_STAGES'].forEach(w =>
            _assertEqual(src.indexOf(w), -1, 'AC18 ' + fn.name + ' does not read ' + w));
          _assertEqual(/\b(80|60|90|25)\b/.test(src), false, 'AC18 ' + fn.name + ' holds no band / period / cap literal');
        });
      },
    },
    {
      name: 'N-384 ongoing view — only ongoing breaches, role links, empty state, cap on ongoing rows',
      fn: function () {
        const tbl = h => (h.match(/sla-breaches[\s\S]*?<\/table>/) || [''])[0];
        const bodyRows = h => Math.max(0, tbl(h).split('<tr>').length - 2);
        const html = slaPanelHtml(alphaModel('all'), { slotId: 'proj-sla-slot' });
        _assertEqual(bodyRows(html), 2, 'AC10a two ongoing rows, the resolved one is not listed');
        _assertEqual(html.indexOf('Ongoing breaches</h4>') > -1 && html.indexOf('Breach history') === -1, true, 'AC10a heading');
        _assertEqual(html.indexOf('Late: took 12 days') === -1 && html.indexOf('Ongoing: 10 days so far, target 7 days') > -1 && html.indexOf('Week ending') > -1, true, 'AC10a only ongoing statuses');
        _assertEqual(countRows(html, /cell-link"[^>]*openRolePage\.prevent|openRolePage\.prevent[^>]*cell-link/g), 2, 'AC10a each role name links to its Role page');
        _assertEqual(html.indexOf('>Engineer (Lisbon)</a>') > -1 && html.indexOf('>Designer</a>') > -1, true, 'AC10a link text is the role label');
        const resolvedOnly = alphaResult(); resolvedOnly.breaches = [resolvedOnly.breaches[0]];
        const none = slaPanelHtml(slaPanelModel({ result: resolvedOnly, roles: SPF().roles, headcount: SPF().headcount, periodKey: 'all', today: spToday() }), {});
        _assertEqual([none.indexOf('No ongoing SLA breaches.') > -1, none.indexOf('Late:') === -1, none.indexOf('Show all') === -1, none.indexOf('sla-breaches') === -1], [true, true, true, true], 'AC10a only resolved breaches: empty state, nothing listed');
        const evilRoles = [{ id: 50, RoleTitle: '<img src=x onerror=alert(1)>', Location: '"><b>' }, { id: 51, RoleTitle: 'Designer' }];
        const bad = slaPanelHtml(slaPanelModel({ result: alphaResult(), roles: evilRoles, headcount: SPF().headcount, periodKey: 'all', today: spToday() }), {});
        _assertEqual([bad.indexOf('<img') === -1, bad.indexOf('&lt;img') > -1, /<[^>]*\sonerror\s*=/i.test(bad)], [true, true, false], 'AC10a role label inert inside the link');
        _assertEqual(tbl(slaPanelHtml(alphaModel('90d'), {})), tbl(slaPanelHtml(alphaModel('all'), {})), 'AC22 the period moves attainment, never the ongoing list');
        const many = alphaResult(); many.breaches = [];
        for (let i = 0; i < 30; i++) many.breaches.push(spBreach('firstSubmissionDays:8' + String(i).padStart(2, '0'), 'firstSubmissionDays', 50, 800 + i, -(i + 1), -(i + 1) + 1, false));
        many.breaches.push(spBreach('firstSubmissionDays:850', 'firstSubmissionDays', 51, 850, -2, null, true));
        many.breaches.push(spBreach('firstSubmissionDays:851', 'firstSubmissionDays', 51, 851, -3, null, true));
        const mm = slaPanelHtml(slaPanelModel({ result: many, roles: SPF().roles, headcount: [], periodKey: 'all', today: spToday() }), { slotId: 's1' });
        _assertEqual([bodyRows(mm), mm.indexOf('Show all') === -1], [2, true], 'AC11a 30 resolved + 2 ongoing lists just 2, no Show all');
      },
    },
    {
      name: 'N-384 history view — Role page: every breach, no role column or link, cap, role mounts render and refresh',
      fn: function () {
        const tbl = h => (h.match(/sla-breaches[\s\S]*?<\/table>/) || [''])[0];
        const bodyRows = h => Math.max(0, tbl(h).split('<tr>').length - 2);
        const m = alphaModel('all');
        const html = slaPanelHtml(m, { slotId: 'rp-sla-panel', view: 'history', title: 'SLA performance · this role' });
        _assertEqual(bodyRows(html), 3, 'AC21 every breach, ongoing and resolved');
        _assertEqual(html.indexOf('Breach history') > -1 && html.indexOf('2 ongoing') > -1 && html.indexOf('SLA performance · this role') > -1, true, 'AC21 headings');
        _assertEqual(/<th>Hire<\/th>/.test(html) && html.indexOf('Role · Hire') === -1 && html.indexOf('openRolePage') === -1 && html.indexOf('cell-link') === -1, true, 'AC21 no role column, no role link');
        _assertEqual(html.indexOf('Late: took 12 days') > html.indexOf('Ongoing: 10 days so far'), true, 'AC21 ongoing first, resolved shown with its status');
        const many = alphaResult(); many.breaches = [];
        for (let i = 0; i < 30; i++) many.breaches.push(spBreach('firstSubmissionDays:7' + String(i).padStart(2, '0'), 'firstSubmissionDays', 50, 700 + i, -(i + 1), -(i + 1) + 1, false));
        const mm = slaPanelModel({ result: many, roles: SPF().roles, headcount: [], periodKey: 'all', today: spToday() });
        const capped = slaPanelHtml(mm, { slotId: 'rp-sla-panel', view: 'history' });
        _assertEqual([bodyRows(capped), capped.indexOf('Show all (30)') > -1, bodyRows(slaPanelHtml(mm, { slotId: 'rp-sla-panel', view: 'history', showAll: true }))], [25, true, 30], 'AC21 cap 25 then Show all (30)');
        const el = slot('rp-sla-panel', 'tr'), prev = _slaPeriod;
        const keep = { gr: typeof getRoleSlaInputs === 'function' ? getRoleSlaInputs : null }, reads = [];
        withDom({ 'rp-sla-panel': el }, function () {
          try {
            _slaMounts.set('rp-sla-panel', { kind: 'role', token: 'tr', project: { id: 1 }, role: SPF().roles[0], title: 'SLA performance · this role', view: 'history',
              inputs: { roles: SPF().roles, headcount: SPF().headcount }, result: many, showAll: false });
            _slaRender('rp-sla-panel');
            _assertEqual([el.innerHTML.indexOf('Breach history') > -1, bodyRows(el.innerHTML)], [true, 25], 'AC21 a role mount renders the history view, capped');
            showAllSlaBreaches('rp-sla-panel');
            _assertEqual(bodyRows(el.innerHTML), 30, 'AC21 Show all works on a role mount');
            getRoleSlaInputs = function (role) { reads.push(role.id); return new Promise(function () {}); };
            refreshSlaPanel('rp-sla-panel');
            _assertEqual(reads, [SPF().roles[0].id], 'AC25 refresh re-reads the role, once, for the same role');
          } finally { if (keep.gr) getRoleSlaInputs = keep.gr; _slaPeriod = prev; _slaMounts.delete('rp-sla-panel'); }
        });
      },
    },
    {
      name: 'N-384 getRoleSlaInputs — one role, own un-narrowed reads; role scope; Role page wiring',
      fn: function () {
        const keep = { t: getSLATargets, h: getAllHeadcount, s: getRoleStageHistory, w: getWeeklyActivity, p: getPlacements, r: getRejectedOffers };
        const seen = {}, never = () => new Promise(function () {});
        try {
          getSLATargets = function () { seen.t = true; return never(); };
          getAllHeadcount = function () { seen.h = true; return never(); };
          getRoleStageHistory = function () { seen.s = true; return never(); };
          getWeeklyActivity = function (a, b, o) { seen.w = [a, b, o]; return never(); };
          getPlacements = function (a, o) { seen.p = [a, o]; return never(); };
          getRejectedOffers = function (a, o) { seen.r = [a, o]; return never(); };
          getRoleSlaInputs({ id: 77 });
        } finally { getSLATargets = keep.t; getAllHeadcount = keep.h; getRoleStageHistory = keep.s; getWeeklyActivity = keep.w; getPlacements = keep.p; getRejectedOffers = keep.r; }
        _assertEqual([seen.t, seen.h, seen.s], [true, true, true], 'AC23 targets, headcount and stage history read');
        _assertEqual([seen.w, seen.p, seen.r], [[null, null, { roleIds: [77] }], [null, { roleIds: [77] }], [null, { roleIds: [77] }]], 'AC23 activity, placements, rejected offers: that role only, no window');
        const F = FIXTURES.slaEngine, today = _slaToday(10);
        const other = { id: 51, Stage: 'Sourcing', ProjectIDLookupId: 900 };
        const mine = slaPanelModel({ result: _slaRun({ today: today }), roles: [F.role], headcount: [F.hc], periodKey: 'all', today: today });
        const clean = slaPanelModel({ result: _slaRun({ today: today, roles: [other] }), roles: [other], headcount: [F.hc], periodKey: 'all', today: today });
        const whole = slaPanelModel({ result: _slaRun({ today: today, roles: [F.role, other] }), roles: [F.role, other], headcount: [F.hc], periodKey: 'all', today: today });
        _assertEqual([mine.breachRows.length, clean.breachRows.length, whole.breachRows.length], [1, 0, 1], 'AC24 the clean role shows no breaches while the project still does');
        _assertEqual([metricOf(mine, 'firstSubmissionDays').breached, metricOf(clean, 'firstSubmissionDays').breached, clean.ongoingBreaches], [1, 0, 0], 'AC24 attainment is the role\'s own');
        _assertEqual(slaPanelHtml(clean, { view: 'history' }).indexOf('No SLA breaches recorded.') > -1, true, 'AC24 role with no breaches: history empty state');
        if (typeof ALL_SOURCES === 'undefined') _skip('source scan needs the filesystem (node tests/run.js)');
        const S = ALL_SOURCES;
        const body = (src, start) => { const i = src.indexOf(start); if (i < 0) return ''; const mm = /\r?\n\}\r?\n/.exec(src.slice(i)); return mm ? src.slice(i, i + mm.index + mm[0].length) : src.slice(i); };
        const loader = body(S['api.js'], 'async function getRoleSlaInputs(');
        _assertEqual(loader.indexOf('sinceWeeks') === -1 && loader.indexOf('fromDay') === -1 && (loader.match(/\.catch\(/g) || []).length === 1 && /getRejectedOffers\([^\n]*\.catch\(/.test(loader) && /roles: \[role\]/.test(loader), true, 'AC23 all-time, only rejected offers degrade, roles [role]');
        const panel = S['sla-panel.js'];
        _assertEqual(/kind: 'role'[^}]*view: 'history'/.test(panel) && /kind: 'project'[^}]*view: 'ongoing'/.test(panel), true, 'AC26 project surfaces list ongoing, the Role page lists history');
        const rp = S['role-page.js'];
        _assertEqual(/function _rpHasSlaPanel\(v\) \{\s*return !!\(v && v\.project && slaEditorModel\(v\.project, \[\]\)\);/.test(rp), true, 'AC25 eligibility gate, no role gate of its own');
        const hcAt = rp.indexOf('id="rp-headcount"'), slaAt = rp.indexOf('id="rp-sla-panel"'), ckAt = rp.indexOf('${checklistHtml}\r\n    </div>') > -1 ? rp.indexOf('${checklistHtml}\r\n    </div>') : rp.indexOf('${checklistHtml}\n    </div>');
        _assertEqual(hcAt > -1 && slaAt > hcAt && ckAt > slaAt, true, 'AC25 section sits after Headcount and before the Checklist');
        _assertEqual(rp.indexOf("mountRoleSlaPanel('rp-sla-panel', data.project, data.role)") > -1, true, 'AC25 mounted after the page renders');
        const refresh = body(rp, 'async function _rpRefresh(');
        _assertEqual(refresh.indexOf('mountRoleSlaPanel(') > refresh.indexOf('_rpRenderHeadcount(v)') && refresh.indexOf('v.role') > -1, true, 'AC25 re-read after a successful write, from the fresh role row');
        ['function rpStartAddHeadcount(', 'function rpCancelAdd(', 'function rpEditHeadcount(', 'function rpCancelEdit('].forEach(fn =>
          _assertEqual(body(rp, fn).indexOf('SlaPanel') === -1, true, 'AC25 ' + fn + ' does not re-read'));
        const pp = S['project-page.js'], dp = S['dashboard-project.js'];
        _assertEqual(pp.indexOf("mountProjectSlaPanel('pp-sla-panel', data.project)") > -1 && dp.indexOf("mountProjectSlaPanel('proj-sla-slot', dashProject)") > -1, true, 'AC26 Project page and dashboard keep the project mount');
      },
    }
  );
})();