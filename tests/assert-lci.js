// tests/assert-lci.js — LCI cost, KPI, notice, compare, legacy and year-slice calculations.
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  {
    name: 'lciCumulativeHeadcount — respects a non-zero noticeMonths offset',
    fn: function () {
      const { row, horizon, noticeMonths } = FIXTURES.lciHeadcount;
      const out = lciCumulativeHeadcount(row, horizon, noticeMonths);
      _assertEqual(out, [0, 0, 2, 2, 5, 5], 'lciCumulativeHeadcount');
    },
  },
  {
    name: 'N-261 lciCostCompositionSeries — legacy = team + one-offs, coe = coeOperating',
    fn: function () {
      const s = lciCostCompositionSeries(FIXTURES.lciComposition.withLegacy);
      _assertEqual(s.coe, [100, 200, 300], 'coe');
      _assertEqual(s.legacy, [55, 40, 0], 'legacy');
      _assertEqual(s.hasLegacy, true, 'hasLegacy');
    },
  },
  {
    name: 'N-261 lciCostCompositionSeries — hasLegacy false when team + one-offs all zero',
    fn: function () {
      const s = lciCostCompositionSeries(FIXTURES.lciComposition.noLegacy);
      _assertEqual(s.legacy, [0, 0, 0], 'legacy');
      _assertEqual(s.hasLegacy, false, 'hasLegacy');
    },
  },
  {
    name: 'N-263 lciMonthLabel — labels past the horizon; lciMonthLabels built on it',
    fn: function () {
      _assertEqual(lciMonthLabel('2026-11', 28), 'M28 (Feb 29)', 'M28');
      _assertEqual(lciMonthLabel('2026-11', 9), 'M9 (Jul 27)', 'M9');
      _assertEqual(lciMonthLabels('2026-11', 3), ['M1 (Nov 26)', 'M2 (Dec 26)', 'M3 (Jan 27)'], 'labels');
    },
  },
  {
    name: 'N-263 fillTemplate — fills known keys, leaves unknown ones visible',
    fn: function () {
      _assertEqual(fillTemplate('Hired: {m} · {x}', { m: 'M12' }), 'Hired: M12 · {x}', 'fill');
      _assertEqual(fillTemplate('{n} months', { n: 0 }), '0 months', 'zero is a value');
    },
  },
  {
    name: 'N-263 lciComputeKPIs — steady state = CoE + retained; payroll month; peak excl. fees',
    fn: function () {
      const { model, rows } = FIXTURES.lciKpis;
      const k = lciComputeKPIs(model, rows);
      _assertEqual(k.totalSpend, 20000, 'totalSpend');
      _assertEqual(k.steadyMonthly, 4000, 'steadyMonthly (3000 CoE + 1000 retained; 500 exiting still paid in M4 excluded)');
      _assertEqual(k.steadyAnnual, 48000, 'steadyAnnual');
      _assertEqual(k.steadyHeadcount, 3, 'steadyHeadcount (2 CoE + 1 retained)');
      _assertEqual(Math.round(k.costPerHead * 100) / 100, 1333.33, 'costPerHead');
      _assertEqual(k.finalHeadcount, 2, 'finalHeadcount (CoE only)');
      _assertEqual(k.totalHires, 2, 'totalHires');
      _assertEqual(k.lastHireMonth, 2, 'lastHireMonth');
      _assertEqual(k.payrollMonth, 4, 'payrollMonth (per-role notice)');
      _assertEqual(k.steadyReached, true, 'steadyReached');
      _assertEqual(k.peakSpend, 7000, 'peakSpend (totalMonthly − fees: includes the 500 one-off)');
      _assertEqual(k.peakMonth, 2, 'peakMonth');
      _assertEqual(k.legacyBaseline, 5500, 'legacyBaseline (M1 team cost — the 300 one-off excluded)');
      _assertEqual(k.legacyBaselineHeadcount, 3, 'legacyBaselineHeadcount');
      _assertEqual(Math.round(k.legacyCostPerHead * 100) / 100, 1833.33, 'legacyCostPerHead');
      _assertEqual(k.legacyAnnual, 66000, 'legacyAnnual');
      _assertEqual(k.annualSaving, 18000, 'annualSaving');
      _assertEqual(Math.round(k.annualSavingPct * 10000) / 10000, 0.2727, 'annualSavingPct');
      _assertEqual(Math.round(k.costPerHeadDeltaPct * 10000) / 10000, 0.2727, 'costPerHeadDeltaPct');
      _assertEqual(k.totalFees, 200, 'totalFees');
      _assertEqual(k.avgFeePerHire, 100, 'avgFeePerHire');
      _assertEqual(k.payback, { month: 3, status: 'ok' }, 'payback inside the horizon');
      _assertEqual('peakCrossoverSpend' in k, false, 'old peakCrossover* keys removed');
    },
  },
  {
    name: 'N-263 lciComputeKPIs — no hires, no legacy: null / n/a branches',
    fn: function () {
      const k = lciComputeKPIs(FIXTURES.lciKpis.model, FIXTURES.lciKpis.rowsNoHires);
      _assertEqual(k.payrollMonth, null, 'payrollMonth');
      _assertEqual(k.steadyReached, false, 'steadyReached');
      _assertEqual(k.avgFeePerHire, null, 'avgFeePerHire');
      _assertEqual(k.legacyCostPerHead, null, 'legacyCostPerHead');
      _assertEqual(k.annualSaving, null, 'annualSaving');
      _assertEqual(k.annualSavingPct, null, 'annualSavingPct');
      _assertEqual(k.costPerHeadDeltaPct, null, 'costPerHeadDeltaPct');
      _assertEqual(k.payback, { month: null, status: 'na' }, 'payback');
    },
  },
  {
    name: 'N-263 lciPaybackMonth — Sympa reference, inside horizon, never, no legacy',
    fn: function () {
      const P = FIXTURES.lciPayback;
      _assertEqual(lciPaybackMonth(P.sympa), { month: 28, status: 'ok' }, 'sympa → M28');
      _assertEqual(lciPaybackMonth(P.inside), { month: 2, status: 'ok' }, 'inside');
      _assertEqual(lciPaybackMonth(P.never), { month: null, status: 'none' }, 'never');
      _assertEqual(lciPaybackMonth(P.noLegacy), { month: null, status: 'na' }, 'noLegacy');
    },
  },
  {
    name: 'N-263 lciNoticeGroups + lciNoticeRowsText — default first, ascending, merged, de-duplicated',
    fn: function () {
      const { model, rows, rowsAllOverride } = FIXTURES.lciNotice;
      const g = lciNoticeGroups(rows, model);
      _assertEqual(g, [
        { months: 1, isDefault: true,  roles: ['Eng', 'QA'] },
        { months: 2, isDefault: false, roles: ['Lead SE'] },
        { months: 3, isDefault: false, roles: ['Head'] },
      ], 'groups');
      _assertEqual(lciNoticeRowsText(g, CONFIG.LCI.KPI_TEXT), [
        ['Notice period — default', '1 month (all other roles)'],
        ['Notice period — 2 months', 'Lead SE'],
        ['Notice period — 3 months', 'Head'],
      ], 'rows');
      _assertEqual(lciNoticeGroups(rowsAllOverride, model), [
        { months: 1, isDefault: true,  roles: [] },
        { months: 2, isDefault: false, roles: ['Lead'] },
      ], 'default listed even when unused');
      _assertEqual(lciNoticeRowsText(lciNoticeGroups([], model), CONFIG.LCI.KPI_TEXT),
        [['Notice period — default', '1 month']], 'no overrides → default only, no note');
    },
  },
  {
    name: 'N-278 lciKeyFigureParts + lciCompareCellText — amended slide 21 (Zagreb 38 heads), cell for cell',
    fn: function () {
      const F = FIXTURES.lciCompare, T = CONFIG.LCI.KPI_TEXT;
      const money = v => (v < 0 ? '-' : '') + '€' + Math.abs(Math.round(v)).toLocaleString('en-GB');
      const parts = lciKeyFigureParts(F.zagreb38, F.startMonth, money, F.pctDp);
      const cell = k => lciCompareCellText(k, parts, T);
      _assertEqual(cell('totalSpend'),     '€6,497,201', 'totalSpend');
      _assertEqual(cell('peakSpend'),      '€487,238', 'peakSpend');
      _assertEqual(cell('peakMonth'),      'M10 (Oct 27)', 'peakMonth');
      _assertEqual(cell('avgFee'),         '€7,816', 'avgFee');
      _assertEqual(cell('runMonthly'),     '€201,152 (vs Legacy €302,739)', 'runMonthly');
      _assertEqual(cell('runAnnual'),      '€2,413,820 (vs Legacy €3,632,869)', 'runAnnual');
      _assertEqual(cell('saving'),         '€1,219,049 (33.6% saving vs Legacy)', 'saving — single closing paren');
      _assertEqual(cell('costPerHead'),    '€5,293 (35% saving vs Legacy)', 'costPerHead');
      _assertEqual(cell('totalHires'),     '38', 'totalHires');
      _assertEqual(cell('finalHeadcount'), '38', 'finalHeadcount');
      _assertEqual(cell('ramp'),           'Hired: M11, On payroll: M12', 'ramp');
      _assertEqual(cell('payback'),        'M31 (Jul 29)', 'payback');
    },
  },
  {
    name: 'N-278 lciCompareCellText — higher than legacy, no payback, no legacy baseline, unreached ramp',
    fn: function () {
      const F = FIXTURES.lciCompare, T = CONFIG.LCI.KPI_TEXT;
      const money = v => (v < 0 ? '-' : '') + '€' + Math.abs(Math.round(v)).toLocaleString('en-GB');
      const hi = lciKeyFigureParts(F.costlier, F.startMonth, money, F.pctDp);
      _assertEqual(lciCompareCellText('saving', hi, T),      '-€60,000 (10.0% higher than Legacy)', 'negative saving flips the suffix');
      _assertEqual(lciCompareCellText('costPerHead', hi, T), '€5,500 (10% higher than Legacy)', 'cost per head above legacy');
      _assertEqual(lciCompareCellText('payback', hi, T),     'No payback', 'status none');
      const nl = lciKeyFigureParts(F.noLegacy, F.startMonth, money, F.pctDp);
      _assertEqual(lciCompareCellText('runMonthly', nl, T),   '€40,000', 'no suffix without a baseline');
      _assertEqual(lciCompareCellText('runAnnual', nl, T),    '€480,000', 'no suffix without a baseline (annual)');
      _assertEqual(lciCompareCellText('saving', nl, T),       '—', 'saving — when no baseline');
      _assertEqual(lciCompareCellText('costPerHead', nl, T),  '€4,000', 'cost per head, no suffix');
      _assertEqual(lciCompareCellText('avgFee', nl, T),       '—', 'avgFee — when no hires');
      _assertEqual(lciCompareCellText('payback', nl, T),      'No legacy baseline', 'status na');
      _assertEqual(lciCompareCellText('ramp', nl, T),         'Hired: —, On payroll: —', 'ramp when nothing hired');
      _assertEqual(lciCompareCellText('peakMonth', nl, T),    'M2 (Feb 27)', 'peakMonth uses the model StartMonth');
    },
  },
  {
    name: 'N-278 lciCompareTable + lciNotReachedNote — layout follows CONFIG.LCI.KEY_FIGURES; unreached model is named',
    fn: function () {
      const F = FIXTURES.lciCompare, T = CONFIG.LCI.KPI_TEXT;
      const money = v => '€' + Math.round(v).toLocaleString('en-GB');
      const mk = (name, k) => ({ name, kpis: k, parts: lciKeyFigureParts(k, F.startMonth, money, F.pctDp) });
      const entries = [mk('A', F.zagreb38), mk('B', F.noLegacy)];
      const t = lciCompareTable(entries, CONFIG.LCI.KEY_FIGURES, T);
      _assertEqual(t.map(g => g.heading), ['Investment', 'Steady state', 'Delivery'], 'group headings');
      _assertEqual(t.map(g => g.rows.length), [4, 4, 4], 'four rows per group');
      _assertEqual(t[0].rows[0], { label: 'Total spend', cells: ['€6,497,201', '€500,000'] }, 'first row: one cell per model');
      _assertEqual(t[2].rows[3].label, 'Projected breakeven (investment recovered)', 'last row label');
      _assertEqual(t.every(g => g.rows.every(r => r.cells.length === 2)), true, 'every row has one cell per model');
      _assertEqual(lciNotReachedNote(entries, T), 'B: ' + T.notReached, 'unreached model named');
      _assertEqual(lciNotReachedNote([entries[0]], T), '', 'all reached → no note');
      _assertEqual('LCI_COMPARE_KPIS' in globalThis, false, 'old flat KPI list is gone');
    },
  },
  {
    name: 'lciYearSlices — splits an 18-month horizon into Year 1 / Year 2',
    fn: function () {
      const slices = lciYearSlices(18, 12);
      _assertEqual(slices.length, 2, 'slice count');
      _assertEqual(slices[0], { start: 0, end: 12, index: 1, label: 'Year 1 (M1–M12)' }, 'slice 1');
      _assertEqual(slices[1], { start: 12, end: 18, index: 2, label: 'Year 2 (M13–M18)' }, 'slice 2');
    },
  },
  {
    name: 'lciRowNotice — a row override wins over a different model default',
    fn: function () {
      const { row, model } = FIXTURES.lci2.noticeOverrideWins;
      _assertEqual(lciRowNotice(row, model), 3, 'lciRowNotice');
    },
  },
  {
    name: 'lciRowNotice — a blank override falls back to the model default',
    fn: function () {
      const { row, model } = FIXTURES.lci2.noticeBlankFallback;
      _assertEqual(lciRowNotice(row, model), 2, 'lciRowNotice');
    },
  },
  {
    name: 'lciRowNotice — zero is a real override value, not "blank"',
    fn: function () {
      const { row, model } = FIXTURES.lci2.noticeZeroIsReal;
      _assertEqual(lciRowNotice(row, model), 0, 'lciRowNotice');
    },
  },
  {
    name: 'lciCumulativeHeadcount — fed a per-role-resolved notice end-to-end',
    fn: function () {
      const { row, horizon } = FIXTURES.lci2.headcountViaResolvedNotice;
      const { model } = FIXTURES.lci2.noticeOverrideWins; // NoticeMonths: 1, row above overrides to 3
      const overrideRow = { ...row, NoticeMonthsOverride: 3 };
      const notice = lciRowNotice(overrideRow, model);
      const out = lciCumulativeHeadcount(row, horizon, notice);
      _assertEqual(out, [0, 0, 0, 1, 2, 3], 'lciCumulativeHeadcount via lciRowNotice');
    },
  },
  {
    name: 'lciYearSlices — horizon at/under the chunk size stays a single slice',
    fn: function () {
      const { horizon, chunk } = FIXTURES.lci2.yearSlicesUnderChunk;
      const slices = lciYearSlices(horizon, chunk);
      _assertEqual(slices, [{ start: 0, end: 6, index: 1, label: null }], 'lciYearSlices');
    },
  },
  {
    name: 'lciYearSlices — a horizon exactly divisible into chunks has no partial year',
    fn: function () {
      const { horizon, chunk } = FIXTURES.lci2.yearSlicesExactMultiple;
      const slices = lciYearSlices(horizon, chunk);
      _assertEqual(slices.length, 2, 'slice count');
      _assertEqual(slices[0], { start: 0, end: 12, index: 1, label: 'Year 1 (M1–M12)' }, 'slice 1');
      _assertEqual(slices[1], { start: 12, end: 24, index: 2, label: 'Year 2 (M13–M24)' }, 'slice 2');
    },
  },
  {
    name: 'lciLegacyMonthlyCost — salary plus bonus, spread over 12 months',
    fn: function () {
      const { row } = FIXTURES.lci2.legacyCost;
      _assertEqual(lciLegacyMonthlyCost(row), 5500, 'lciLegacyMonthlyCost');
    },
  }
);
