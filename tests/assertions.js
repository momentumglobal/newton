// tests/assertions.js — assertions for the Newton test harness.
// Pure: no DOM, no console. Each assertion's fn() throws on failure (or
// calls _skip() when it can't meaningfully run in the current environment
// — see the coeWeekIndex assertion) so the same list runs unmodified in
// both index.html (browser) and run.js (Node).
// N-095 seeded this file (revenue/role/LCI cases); N-096 added real
// date/week-layer coverage; N-097 added the rest of the LCI calc layer;
// N-098 added the analytics layer.

function _deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => _deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => _deepEqual(a[k], b[k]));
  }
  return false;
}

function _assertEqual(actual, expected, label) {
  if (!_deepEqual(actual, expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Throws a marked "skip" — for an assertion that can't meaningfully run in
// the current environment (see coeWeekIndex below). A plain marker
// property, not a custom Error subclass: N-087's QA run hit a cross-realm
// `instanceof` false-negative testing a Date built in one vm context
// against code loaded into another — a subclass check would hit the same
// trap between this file's realm and whichever runner reads the result.
function _skip(message) {
  const e = new Error(message);
  e.__skip = true;
  throw e;
}

var ASSERTIONS = [
  {
    name: 'computeMonthlyRows — prorates a mid-month start correctly',
    fn: function () {
      const rows = computeMonthlyRows(FIXTURES.monthlyRows.assignments);
      _assertEqual(rows.length, 1, 'row count');
      const row = rows[0];
      _assertEqual(row.MonthStart, '2024-03-01', 'MonthStart');
      _assertEqual(row.MonthFraction, 0.5484, 'MonthFraction');
      _assertEqual(row.ProratedRevenue, 1700, 'ProratedRevenue');
      _assertEqual(row.BilledRevenue, 1700, 'BilledRevenue');
    },
  },
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
    name: 'getWeekEnding — BST 1st-of-month (locks N-129 shut)',
    fn: function () {
      const { y, m, d } = FIXTURES.dateWeek.bstFirstOfMonth;
      _assertEqual(getWeekEnding(new Date(y, m - 1, d)), '2026-07-05', 'getWeekEnding');
    },
  },
  {
    name: "getWeekEnding — exact-Sunday input (locks N-129's second fix)",
    fn: function () {
      const { y, m, d } = FIXTURES.dateWeek.exactSunday;
      _assertEqual(getWeekEnding(new Date(y, m - 1, d)), '2026-08-16', 'getWeekEnding');
    },
  },
  {
    name: 'getISOWeek — 1st-of-month case',
    fn: function () {
      const { y, m, d } = FIXTURES.dateWeek.bstFirstOfMonth;
      _assertEqual(getISOWeek(new Date(y, m - 1, d)), 27, 'getISOWeek');
    },
  },
  {
    name: 'isoDate — BST 1st-of-month',
    fn: function () {
      _assertEqual(isoDate(FIXTURES.dateWeek.isoDateInput), '2026-07-01T12:00:00Z', 'isoDate');
    },
  },
  {
    name: 'spDateIn — BST 1st-of-month',
    fn: function () {
      _assertEqual(spDateIn(FIXTURES.dateWeek.spDateInInput), '2026-07-01', 'spDateIn');
    },
  },
  {
    name: 'spDateOut — BST 1st-of-month',
    fn: function () {
      const { y, m, d } = FIXTURES.dateWeek.spDateOutInput;
      _assertEqual(spDateOut(new Date(Date.UTC(y, m - 1, d))), '2026-07-01T12:00:00Z', 'spDateOut');
    },
  },
  {
    name: 'localDayISO — 00:30 BST returns today, not yesterday (N-088)',
    fn: function () {
      const { y, m, d, h, min } = FIXTURES.dateWeek.localDayInput;
      const dt = new Date(y, m - 1, d, h, min);
      _assertEqual(localDayISO(dt), '2026-07-01', 'localDayISO');
      // Guard the guard: if this ever stops differing from the pattern
      // N-088 replaced, the assertion has stopped testing anything. Only
      // meaningful where local is AHEAD of UTC — that is the whole failure
      // window. N-130 added NEWTON_TZ, so this file can now be run from a
      // timezone behind UTC, where the old pattern was never wrong and
      // asserting it unconditionally would report a bug that isn't there.
      if (dt.getTimezoneOffset() < 0) {
        _assertEqual(dt.toISOString().split('T')[0], '2026-06-30', 'pre-N-088 pattern still skews');
      }
    },
  },
  {
    name: 'localDayISO — defaults to now, and rejects a non-Date (N-088)',
    fn: function () {
      _assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(localDayISO()), true, 'no-arg shape');
      _assertEqual(localDayISO('2026-07-01'), null, 'string input');
      _assertEqual(localDayISO(new Date('nonsense')), null, 'invalid Date');
    },
  },
  {
    name: 'coeFmtShort — renders the intended day at every offset, incl. +12 and +14 (N-136)',
    fn: function () {
      const F = FIXTURES.dateWeek.middayHeadroom;
      // Runtime-timezone independent: Intl's timeZone option simulates the zone,
      // so this asserts the same thing under every CI zone (N-134) without
      // needing a Pacific runner.
      [F.okZone, F.breakZone, F.realZone, F.extreme].forEach(function (z) {
        _assertEqual(
          new Date(F.stored).toLocaleDateString('en-GB',
            { day: '2-digit', month: 'short', timeZone: 'UTC' }),
          F.intended, 'UTC-pinned render viewed from ' + z);
      });
      // And the function itself. NOTE: calling coeFmtShort() and checking the
      // output CANNOT catch a missing timeZone option from any CI zone — from
      // London, UTC or New York the answer is '01 Jul' either way, because all
      // three sit inside the ±11h headroom. The behaviour only diverges at
      // >=+12, which N-134 deliberately does not run. So the option is pinned
      // at SOURCE level instead: crude, but it is the only check that fails
      // wherever the suite happens to run. Verified to fail on removal.
      _assertEqual(coeFmtShort(F.stored), F.intended, 'coeFmtShort output');
      _assertEqual(/timeZone:\s*'UTC'/.test(String(coeFmtShort)), true,
        "coeFmtShort must pin its formatter to UTC — see the ±11h limit (N-136)");
    },
  },
  {
    name: 'a LOCAL read of a midday-UTC value really does break in the far east (N-136)',
    fn: function () {
      const F = FIXTURES.dateWeek.middayHeadroom;
      const render = function (z) {
        return new Date(F.stored).toLocaleDateString('en-GB',
          { day: '2-digit', month: 'short', timeZone: z });
      };
      // Characterisation, not a bug report: this documents WHY coeFmtShort pins
      // its formatter to UTC. If it ever stops being true, that function's
      // timeZone option has become unnecessary — and the assertion above has
      // stopped testing anything.
      _assertEqual(render(F.realZone), '02 Jul', 'Pacific/Auckland (+12/+13)');
      _assertEqual(render(F.extreme),  '02 Jul', 'Pacific/Kiritimati (+14)');
    },
  },
  {
    name: 'the headroom boundary is ±11h — +11 holds, +12 breaks (N-136)',
    fn: function () {
      const F = FIXTURES.dateWeek.middayHeadroom;
      const render = function (z) {
        return new Date(F.stored).toLocaleDateString('en-GB',
          { day: '2-digit', month: 'short', timeZone: z });
      };
      // This is what makes the corrected ±11h documentation checkable rather
      // than a claim. NOTE the POSIX sign inversion: Etc/GMT-11 is UTC+11 and
      // Etc/GMT-12 is UTC+12. Reading those backwards would make this pass for
      // entirely the wrong reason.
      _assertEqual(render(F.okZone),    '01 Jul', 'UTC+11 — last offset that holds');
      _assertEqual(render(F.breakZone), '02 Jul', 'UTC+12 — first offset that breaks');
    },
  },
  {
    name: 'spMonthIn — all three ForecastMonth stored shapes map to the intended month (N-130)',
    fn: function () {
      const F = FIXTURES.dateWeek.forecastMonth;
      _assertEqual(spMonthIn(F.legacyBst.stored), F.legacyBst.month, 'legacy BST write');
      _assertEqual(spMonthIn(F.legacyGmt.stored), F.legacyGmt.month, 'legacy GMT write');
      _assertEqual(spMonthIn(F.canonical.stored), F.canonical.month, 'canonical midday-UTC write');
      _assertEqual(spMonthIn(F.yearEnd.stored),   F.yearEnd.month,   'year boundary');
      _assertEqual(spMonthIn('not a date'), null, 'unparseable');
      _assertEqual(spMonthIn(null), null, 'null input');
      // Guard the guard: the read this replaced used local getters, so under a
      // timezone BEHIND the site it returned the PREVIOUS month. Reproduce that
      // only where the runtime can actually show it, so the assertion stays
      // honest under TZ=Europe/London (where the old code was correct too).
      const legacy = new Date(F.legacyBst.stored);
      const legacyKey = `${legacy.getFullYear()}-${String(legacy.getMonth() + 1).padStart(2, '0')}`;
      if (legacy.getTimezoneOffset() > 0) {
        _assertEqual(legacyKey, '2026-06', 'pre-N-130 local read still skews behind UTC');
      }
    },
  },
  {
    name: 'spMonthIn — forecast key matches the render-loop key for the same month (N-130)',
    fn: function () {
      // Both sides of the fByMonth lookup must agree, or every forecast cell
      // renders empty with no error raised. Render loop builds its key from a
      // LOCAL-midnight Date (coe-plan.js is local by design, N-089); the
      // forecast map builds its key from the stored string.
      const F = FIXTURES.dateWeek.forecastMonth;
      const m = new Date(2026, 6, 1); // local 1 Jul 2026
      _assertEqual(monthKeyFromISO(localDayISO(m)), spMonthIn(F.canonical.stored), 'canonical row');
      _assertEqual(monthKeyFromISO(localDayISO(m)), spMonthIn(F.legacyBst.stored), 'legacy BST row');
    },
  },
  {
    name: 'no day-truncating date handling in js/ (N-091 — F-12 guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const found = lintDateUsage(ALL_SOURCES);
      // Report file:line:pattern rather than a count, so a CI failure names the
      // offending line directly instead of just saying "1 !== 0".
      _assertEqual(
        found.map(v => `${v.file}:${v.line}  ${v.pattern}  ${v.text.trim()}`),
        [],
        'banned date patterns in js/'
      );
    },
  },
  {
    name: 'no third-party script loads from a CDN (N-289 — SEC-9 guard)',
    fn: function () {
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const found = lintExternalScripts(ALL_HTML, ALL_SOURCES);
      _assertEqual(
        found.map(v => `${v.file}:${v.line}  ${v.src}`),
        [],
        'external script URLs (vendor the library into js/vendor/ instead)'
      );
    },
  },
  {
    name: 'js/vendor/ files match their VERSIONS.md rows (N-289 — SEC-9 guard)',
    fn: function () {
      if (typeof VENDOR_FILES === 'undefined') {
        _skip('Vendor hashing needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintVendorManifest(VENDOR_FILES, VENDOR_MANIFEST), [], 'js/vendor/ vs VERSIONS.md');
    },
  },
  {
    name: 'package.json pins exactly the versions in VERSIONS.md (N-289 — Dependabot manifest)',
    fn: function () {
      if (typeof VENDOR_PACKAGE_JSON === 'undefined') {
        _skip('Needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintPackagePins(VENDOR_MANIFEST, VENDOR_PACKAGE_JSON), [], 'package.json vs VERSIONS.md');
    },
  },
  {
    name: 'MSAL is only called through auth.js authReady() (N-290 — SEC-10 guard)',
    fn: function () {
      if (typeof lintMsalCalls === 'undefined' || typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      // Positive control: the lint must catch a direct call, or the clean
      // result below proves nothing.
      _assertEqual(
        lintMsalCalls(
          { 'x.html': '<script>\n  msalInstance.handleRedirectPromise().then(go);\n</script>' },
          { 'x-app.js': 'a();\nawait msalInstance.acquireTokenSilent(req);\n// msalInstance.loginRedirect(x) in a comment\nmsalInstance.logoutRedirect();\nmsalInstance.getAllAccounts();' }
        ).map(v => `${v.file}:${v.line} ${v.call}`),
        ['js/x-app.js:2 acquireTokenSilent', 'x.html:2 handleRedirectPromise'],
        'positive control: direct calls flagged; comments, logoutRedirect and getAllAccounts are not'
      );
      _assertEqual(
        lintMsalCalls(ALL_HTML, ALL_SOURCES).map(v => `${v.file}:${v.line}  msalInstance.${v.call}(`),
        [],
        'direct MSAL calls outside js/auth.js (await authReady() instead)'
      );
    },
  },
  {
    name: 'N-290 isLegacyMsalStorageKey — finds MSAL v2 localStorage entries, never a Newton key',
    fn: function () {
      const cid = 'bf71f2b2-de80-4728-9189-af8659fbd2b6';
      const tid = 'b73023b1-298a-42a2-bed9-985e0a762054';
      const home = '0f1e2d3c-0000-4000-8000-000000000001.' + tid;
      const legacy = [
        home + '-login.windows.net-accesstoken-' + cid + '-' + tid + '-user.read sites.readwrite.all',
        home + '-login.windows.net-refreshtoken-' + cid + '--',
        home + '-login.windows.net-idtoken-' + cid + '-' + tid + '-',
        home + '-login.windows.net-' + tid,                       // account entry: no client ID
        'msal.account.keys',
        'msal.token.keys.' + cid,
        'msal.' + cid + '.active-account',
        'server-telemetry-' + cid,
        'MSAL.' + cid.toUpperCase() + '.ACTIVE-ACCOUNT',         // case-insensitive
      ];
      const newton = ['newton_theme', 'newton_density', 'newton_mobile', 'userName', 'benchSyncLast', 'newton_force_desktop', ''];
      _assertEqual(legacy.map(k => isLegacyMsalStorageKey(k, cid, tid)), legacy.map(() => true), 'v2 token, account and index keys');
      _assertEqual(newton.map(k => isLegacyMsalStorageKey(k, cid, tid)), newton.map(() => false), 'Newton keys survive');
      _assertEqual(isLegacyMsalStorageKey(null, cid, tid), false, 'null key');
      _assertEqual(isLegacyMsalStorageKey('anything', '', ''), false, 'blank ids never match everything');
    },
  },
  {
    name: 'N-290 shouldAutoSignIn — true only with no account, not tried, not signed out, no response in URL',
    fn: function () {
      const flags = ['hasAccount', 'triedThisTab', 'signedOut', 'authResponseInUrl'];
      const trues = [];
      for (let n = 0; n < 16; n++) {
        const args = {};
        flags.forEach((f, i) => { args[f] = !!(n & (1 << i)); });
        if (shouldAutoSignIn(args)) trues.push(n);
      }
      _assertEqual(trues, [0], 'all 16 combinations: only the all-false one redirects');
      _assertEqual(shouldAutoSignIn({}), true, 'missing flags read as false');
      _assertEqual(shouldAutoSignIn(), true, 'no argument');
    },
  },
  {
    name: "_ROLE_COPY_FIELDS stays in sync with submitRoleForm's write set (N-150)",
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const { missingFromCopyFields, extraInCopyFields } = checkRoleFormFieldSync(
        ALL_SOURCES, _ROLE_COPY_FIELDS, _ROLE_RESET_FIELDS
      );
      _assertEqual(missingFromCopyFields, [], 'fields submitRoleForm writes that _ROLE_COPY_FIELDS/_ROLE_RESET_FIELDS does not account for');
      _assertEqual(extraInCopyFields, [], 'fields in _ROLE_COPY_FIELDS/_ROLE_RESET_FIELDS that submitRoleForm no longer writes');
    },
  },
  {
    name: 'FIELD_ALIASES entries have at least one consumer (N-175 — F-11b guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const found = checkAliasConsumers(ALL_SOURCES, FIELD_ALIASES);
      _assertEqual(
        found.map(v => `${v.list}.${v.internal} → ${v.display}`),
        [],
        'FIELD_ALIASES entries with no consumers found in js/'
      );
    },
  },
  {
    name: 'utcDateOnly → spDateOut round-trips a BST date unchanged (N-090)',
    fn: function () {
      const src = FIXTURES.dateWeek.benchRoundTrip;
      _assertEqual(spDateOut(utcDateOnly(src)), src, 'bench write round-trip');
      // Guard the guard: the pairing N-090 replaced (local-midnight read, then
      // toISOString on the way out) really does lose a day here. If this stops
      // being true the assertion above has stopped testing anything. Guarded on
      // local being AHEAD of UTC for the same reason as the N-088 assertion —
      // see there.
      const legacy = new Date(src.slice(0, 10));
      legacy.setHours(0, 0, 0, 0);
      if (legacy.getTimezoneOffset() < 0) {
        _assertEqual(legacy.toISOString().slice(0, 10), '2026-06-30', 'pre-N-090 pairing still skews');
      }
    },
  },
  {
    name: 'bench date round-trip is idempotent — no delete/recreate churn (N-090)',
    fn: function () {
      // The property whose failure made every affected bench record get
      // deleted and recreated on every sync: a written record, read back,
      // must compare equal to the Date that produced it.
      const d = utcDateOnly(FIXTURES.dateWeek.benchRoundTrip);
      _assertEqual(utcDateOnly(spDateOut(d)).getTime(), d.getTime(), 'read-back getTime');
    },
  },
  {
    name: 'coeMonday — returns LOCAL midnight in both GMT and BST (N-089)',
    fn: function () {
      const g = FIXTURES.dateWeek.coeMondayGmt, b = FIXTURES.dateWeek.coeMondayBst;
      const mg = coeMonday(new Date(g.y, g.m - 1, g.d));
      const mb = coeMonday(new Date(b.y, b.m - 1, b.d));
      _assertEqual(mg.getHours(), 0, 'GMT Monday local hour');
      _assertEqual(mb.getHours(), 0, 'BST Monday local hour');
      // Both must be a Monday, or the floor-to-Monday logic has drifted.
      _assertEqual(mg.getDay(), 1, 'GMT result is a Monday');
      _assertEqual(mb.getDay(), 1, 'BST result is a Monday');
    },
  },
  {
    name: 'computePlanSpans — target hire date survives GMT→BST (re-verifies N-077)',
    fn: function () {
      const { row, expected } = FIXTURES.dateWeek.coePlanSpanDst;
      const s = computePlanSpans(row);
      const t = s.targetHireDate;
      _assertEqual(
        [t.getFullYear(), t.getMonth() + 1, t.getDate()],
        [expected.y, expected.m, expected.d],
        'targetHireDate'
      );
      // Local midnight, not 23:00 the day before — the shape ms-based week
      // arithmetic would produce across the March transition.
      _assertEqual(t.getHours(), 0, 'targetHireDate local hour');
    },
  },
  {
    name: 'coeWeekIndex — GMT tStart / BST target does not drop a week (N-081)',
    fn: function () {
      const { timelineStart, target } = FIXTURES.dateWeek.coeGantt;
      const tStart = coeMonday(new Date(timelineStart.y, timelineStart.m - 1, timelineStart.d));
      const d      = new Date(target.y, target.m - 1, target.d);
      if (tStart.getTimezoneOffset() === coeMonday(d).getTimezoneOffset()) {
        _skip("No GMT/BST offset difference between fixture dates in this runtime's timezone — only verified under TZ=Europe/London (tests/run.js sets this; a browser uses its OS timezone and may not).");
      }
      _assertEqual(coeWeekIndex(tStart, d), 26, 'coeWeekIndex');
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
  },
  {
    name: '_pickFields — whitelists keys and drops undefined/null even when whitelisted',
    fn: function () {
      const { obj, keys } = FIXTURES.lci2.pickFields;
      _assertEqual(_pickFields(obj, keys), { A: 1, D: 5 }, '_pickFields');
    },
  },
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
          { label: 'Hires', value: 2, unit: 'hires', rag: 'grey', informational: true },
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
    name: 'computeMonthlyRows — split-fee revenue: retainer at start, placement fee the month after end (N-116)',
    fn: function () {
      const rows = computeMonthlyRows(FIXTURES.analytics2.splitFee.assignments);
      _assertEqual(rows.length, 4, 'row count');
      _assertEqual(rows[0].MonthStart, '2024-03-01', 'retainer month MonthStart');
      _assertEqual(rows[0].ProratedRevenue, 10000, 'retainer month ProratedRevenue');
      const feeRow = rows[3];
      _assertEqual(feeRow.MonthStart, '2024-06-01', 'placement fee month MonthStart');
      _assertEqual(feeRow.ProratedRevenue, 20000, 'placement fee month ProratedRevenue');
      _assertEqual(feeRow.Capacity, 0, 'placement fee month Capacity');
    },
  },
  // ── N-176 (F-3a): two-tier cache key/stamp helpers ──────────────────
  // These are the PURE helpers only. _ssGet/_ssSet/_ssPurge touch
  // sessionStorage, which does not exist in the Node harness, so they are
  // covered by the live QA checks in the ticket's QA doc instead.
  {
    name: 'N-176 _ssKey — embeds prefix, current APP_BUILD and the tier-1 cache key',
    fn: function () {
      _assertEqual(
        _ssKey('Projects', '', '*'),
        CONFIG.CACHE.prefix + '|' + CONFIG.APP_BUILD + '|' + _cacheKey('Projects', '', '*'),
        '_ssKey composition'
      );
      _assertEqual(_ssKey('Projects', '', '*').split('|')[1], CONFIG.APP_BUILD, '_ssKey build segment');
      _assertEqual(_ssKey('Projects', '', '*').split('|')[2], 'Projects', '_ssKey list segment');
    },
  },
  {
    name: 'N-176 _ssIsCacheKey — matches only our prefix, never another feature\'s keys',
    fn: function () {
      _assertEqual(_ssIsCacheKey(_ssKey('People', '', '*')), true, 'own key');
      _assertEqual(_ssIsCacheKey('newton_role_a@b.com'), false, 'role cache key');
      _assertEqual(_ssIsCacheKey('newton_dm_grants_a@b.com'), false, 'dm grants key');
      _assertEqual(_ssIsCacheKey('newton_ghost_user'), false, 'ghost key');
      _assertEqual(_ssIsCacheKey('newton_force_desktop'), false, 'force-desktop key');
      _assertEqual(_ssIsCacheKey('newton_survey_uuid'), false, 'survey key');
      _assertEqual(_ssIsCacheKey(null), false, 'null');
    },
  },
  {
    name: 'N-176 _ssKeyBuild — a stamp mismatch is detectable',
    fn: function () {
      const current = _ssKey('Projects', '', '*');
      const stale = CONFIG.CACHE.prefix + '|OLD-BUILD|Projects||*';
      _assertEqual(_ssKeyBuild(current), CONFIG.APP_BUILD, 'current stamp');
      _assertEqual(_ssKeyBuild(stale) !== CONFIG.APP_BUILD, true, 'stale stamp differs');
      _assertEqual(_ssKeyBuild('newton_role_a@b.com'), null, 'foreign key has no stamp');
    },
  },
  {
    name: 'N-176 _ssKeyMatchesList — targets one list, any build; null matches all ours',
    fn: function () {
      const projects = _ssKey('Projects', '', '*');
      const projectsFiltered = _ssKey('Projects', "fields/Status eq 'Active'", 'Id,Title');
      const people = _ssKey('People', '', '*');
      const staleProjects = CONFIG.CACHE.prefix + '|OLD-BUILD|Projects||*';
      _assertEqual(_ssKeyMatchesList(projects, 'Projects'), true, 'exact list');
      _assertEqual(_ssKeyMatchesList(projectsFiltered, 'Projects'), true, 'same list, different filter');
      _assertEqual(_ssKeyMatchesList(staleProjects, 'Projects'), true, 'same list, older build');
      _assertEqual(_ssKeyMatchesList(people, 'Projects'), false, 'different list');
      _assertEqual(_ssKeyMatchesList(projects, null), true, 'null purges all ours');
      _assertEqual(_ssKeyMatchesList('newton_role_a@b.com', null), false, 'null still spares foreign keys');
    },
  },
  {
    name: 'N-176/N-177 CONFIG.CACHE — fully configured, five lists enrolled',
    fn: function () {
      _assertEqual(Array.isArray(CONFIG.CACHE.persistentLists), true, 'persistentLists is an array');
      // N-176 asserted this was 0 (engine inert). N-177 enrolled six reference
      // lists; N-266a added ChecklistTemplates (seven). N-282 took the two
      // identity/access lists (UserAssignments, LeadershipAccess) back off
      // tier 2 — sessionStorage is user-writable — leaving five.
      _assertEqual(CONFIG.CACHE.persistentLists.length, 5, 'N-177 four + N-266a ChecklistTemplates (N-282 removed two)');
      _assertEqual(typeof CONFIG.APP_BUILD === 'string' && CONFIG.APP_BUILD.length > 0, true, 'APP_BUILD set');
      _assertEqual(typeof CONFIG.CACHE.ttlMs, 'number', 'ttlMs');
      _assertEqual(typeof CONFIG.CACHE.maxEntryBytes, 'number', 'maxEntryBytes');
      _assertEqual(typeof CONFIG.CACHE.prefix, 'string', 'prefix');
      _assertEqual(CONFIG.CACHE.prefix.indexOf('|'), -1, 'prefix must not contain the key separator');
      _assertEqual(CONFIG.APP_BUILD.indexOf('|'), -1, 'APP_BUILD must not contain the key separator');
    },
  },
  // ── N-177 (F-3b): enrolment set + role-cache stamping ───────────────
  {
    name: 'N-177 persistentLists — exactly the five reference lists (N-282: no identity/access lists)',
    fn: function () {
      _assertEqual([...CONFIG.CACHE.persistentLists].sort(),
        ['ChecklistTemplates', 'Departments', 'LCILocations', 'People', 'Projects'],
        'enrolment set');
    },
  },
  {
    name: 'N-177 persistentLists — no transactional list is enrolled',
    fn: function () {
      ['Roles', 'WeeklyActivity', 'Placements', 'Assignments', 'RoleHistory', 'ChecklistProgress'].forEach(function (l) {
        _assertEqual(CONFIG.CACHE.persistentLists.includes(l), false, l + ' must never be enrolled');
      });
    },
  },
  {
    name: 'N-177 _ssEnabled — true for the five, false for the transactional six and the identity lists (N-282)',
    fn: function () {
      // _ssEnabled() returns false whenever sessionStorage is absent, which it
      // is under Node (tests/run.js). Skipping is honest; asserting here would
      // report a meaningless PASS on the storage guard rather than on
      // enrolment. Runs for real in tests/index.html.
      if (typeof sessionStorage === 'undefined') _skip('no sessionStorage under Node — run tests/index.html for this one');
      ['Projects', 'People', 'Departments', 'LCILocations', 'ChecklistTemplates']
        .forEach(function (l) { _assertEqual(_ssEnabled(l), true, l + ' enrolled'); });
      ['Roles', 'WeeklyActivity', 'Placements', 'Assignments', 'RoleHistory', 'ChecklistProgress', 'UserAssignments', 'LeadershipAccess']
        .forEach(function (l) { _assertEqual(_ssEnabled(l), false, l + ' not enrolled'); });
    },
  },
  // ── N-282 (SEC-2): no authorisation input is forgeable from storage ──
  {
    name: 'N-282 persistentLists — never contains an identity/access list (works under Node, unlike _ssEnabled)',
    fn: function () {
      ['UserAssignments', 'LeadershipAccess'].forEach(function (l) {
        _assertEqual(CONFIG.CACHE.persistentLists.includes(l), false, l + ' must never be tier-2 cached');
      });
    },
  },
  {
    name: 'N-282 CONFIG.PRIVILEGED_ROLES — exactly admin and leadership, both known roles',
    fn: function () {
      _assertEqual([...CONFIG.PRIVILEGED_ROLES].sort(), ['admin', 'leadership'], 'privileged set');
      CONFIG.PRIVILEGED_ROLES.forEach(function (r) {
        _assertEqual(CONFIG.ROLE_PRECEDENCE.includes(r), true, r + ' is in ROLE_PRECEDENCE');
      });
    },
  },
  {
    name: 'N-282 isPrivilegedRole — true for admin and leadership only',
    fn: function () {
      _assertEqual(isPrivilegedRole('admin'), true, 'admin');
      _assertEqual(isPrivilegedRole('leadership'), true, 'leadership');
      ['delivery_manager', 'talent_partner', 'viewer', '', null, undefined, 'Admin', 'ADMIN', ['admin']].forEach(function (r) {
        _assertEqual(isPrivilegedRole(r), false, String(r));
      });
    },
  },
  {
    name: 'N-282 _roleCacheValueUsable — only known non-privileged role strings are served',
    fn: function () {
      ['delivery_manager', 'talent_partner', 'viewer'].forEach(function (r) {
        _assertEqual(_roleCacheValueUsable(r), true, r + ' may be cached');
      });
      ['admin', 'leadership', 'Admin', 'superuser', '', null, undefined, 42, {}, ['admin'], ['viewer'], true].forEach(function (v) {
        _assertEqual(_roleCacheValueUsable(v), false, JSON.stringify(v) + ' must be re-resolved');
      });
    },
  },
  {
    name: 'N-282 ghost gate fails closed — no ghost and setGhostUser refuses until a real admin is verified',
    fn: function () {
      try {
        _setGhostRealAdmin(false);
        _assertEqual(getGhostUser(), null, 'no ghost while unverified');
        _assertEqual(getGhostLabel(), null, 'no label while unverified');
        _assertEqual(setGhostUser('x@y.com', 'X'), false, 'setGhostUser refuses');
        // Only a strict boolean true opens the gate.
        ['true', 1, {}, [], null, undefined].forEach(function (v) {
          _setGhostRealAdmin(v);
          _assertEqual(setGhostUser('x@y.com', 'X'), false, JSON.stringify(v) + ' must not open the gate');
        });
      } finally {
        _setGhostRealAdmin(false);
      }
    },
  },
  {
    name: 'N-282 hasDMGrant — reads the in-memory grants only, fails closed when absent',
    fn: function () {
      const prev = globalThis.getCurrentUser;
      globalThis.getCurrentUser = function () { return { email: 'Leader@Example.com' }; };
      try {
        _setGhostRealAdmin(false);
        _assertEqual(hasDMGrant(), false, 'no entry = false');
        _dmGrantsMem.set('leader@example.com', ['12', '13']);
        _assertEqual(hasDMGrant(), true, 'any grant');
        _assertEqual(hasDMGrant(12), true, 'numeric id matches a string grant');
        _assertEqual(hasDMGrant('13'), true, 'string id');
        _assertEqual(hasDMGrant(99), false, 'other project');
        _dmGrantsMem.set('leader@example.com', []);
        _assertEqual(hasDMGrant(), false, 'empty grants = false');
      } finally {
        _dmGrantsMem.delete('leader@example.com');
        if (prev === undefined) delete globalThis.getCurrentUser; else globalThis.getCurrentUser = prev;
      }
    },
  },
  {
    name: 'N-282 no source reads identity from localStorage or keeps DM grants in storage',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('no source map in the browser harness — run tests/run.js');
      _assertEqual(/getItem\(\s*['"]userEmail['"]/.test(ALL_SOURCES['auth.js']), false, 'auth.js must not read userEmail');
      Object.keys(ALL_SOURCES).forEach(function (f) {
        _assertEqual(/setItem\(\s*['"]userEmail['"]/.test(ALL_SOURCES[f]), false, f + ' must not write userEmail');
        _assertEqual(/(?:get|set)Item\([^)]*newton_dm_grants_/.test(ALL_SOURCES[f]), false, f + ' must not keep DM grants in storage');
      });
    },
  },
  {
    name: 'N-177 _roleEntryUsable — a well-formed current-build entry is usable',
    fn: function () {
      _assertEqual(_roleEntryUsable({ ts: Date.now(), build: CONFIG.APP_BUILD, value: 'admin' }, true), true, 'fresh');
      _assertEqual(_roleEntryUsable({ ts: Date.now(), build: CONFIG.APP_BUILD, value: [] }, true), true, 'empty array value is a value');
    },
  },
  {
    name: 'N-177 _roleEntryUsable — a foreign build stamp is rejected under both TTL modes',
    fn: function () {
      const e = { ts: Date.now(), build: 'SOME-OTHER-BUILD', value: 'admin' };
      _assertEqual(_roleEntryUsable(e, true), false, 'honourTtl true');
      _assertEqual(_roleEntryUsable(e, false), false, 'honourTtl false — hasDMGrant still rejects a foreign build');
    },
  },
  {
    name: 'N-177 _roleEntryUsable — an aged entry is rejected when honourTtl, ACCEPTED when not',
    fn: function () {
      const aged = { ts: Date.now() - (CONFIG.CACHE.ttlMs + 60000), build: CONFIG.APP_BUILD, value: ['12'] };
      _assertEqual(_roleEntryUsable(aged, true), false, 'getEffectiveRole re-resolves');
      _assertEqual(_roleEntryUsable(aged, false), true, 'hasDMGrant must NOT lose a live grant to age');
    },
  },
  {
    name: 'N-177 _roleEntryUsable — legacy bare values are treated as absent, never thrown on',
    fn: function () {
      _assertEqual(_roleEntryUsable('admin', true), false, 'legacy bare string');
      _assertEqual(_roleEntryUsable(['12', '13'], true), false, 'legacy bare array');
      _assertEqual(_roleEntryUsable(null, true), false, 'null');
      _assertEqual(_roleEntryUsable(undefined, true), false, 'undefined');
      _assertEqual(_roleEntryUsable({ build: CONFIG.APP_BUILD, value: 'admin' }, true), false, 'no ts');
      _assertEqual(_roleEntryUsable({ ts: Date.now(), build: CONFIG.APP_BUILD }, true), false, 'no value');
    },
  },
  // ── N-186 (F-13a): delta sync engine — pure helpers only ────────────
  // _deltaSync/_deltaEntryGet/_deltaEntrySet touch sessionStorage and Graph,
  // which don't exist (or can't be faked cheaply) in the Node harness — same
  // reasoning as the tier-2 _ssGet/_ssSet/_ssPurge exclusion above. Covered
  // by the live QA checks in the ticket's QA doc instead.
  {
    name: 'N-188 CONFIG.BATCH — shape and defaults',
    fn: function () {
      _assertEqual(typeof CONFIG.BATCH.enabled, 'boolean', 'enabled flag present');
      _assertEqual(CONFIG.BATCH.maxSubRequests, 20, "Graph's documented per-$batch sub-request limit");
    },
  },
  {
    name: 'N-188 _batchEnabled — follows CONFIG.BATCH.enabled, false when the block is missing entirely',
    fn: function () {
      _assertEqual(_batchEnabled(), CONFIG.BATCH.enabled, 'tracks the live config value');
      const saved = CONFIG.BATCH;
      CONFIG.BATCH = undefined;
      _assertEqual(_batchEnabled(), false, 'defensive false, not a throw, if BATCH is ever absent');
      CONFIG.BATCH = saved;
    },
  },
  {
    name: 'N-186/N-187 CONFIG.DELTA — configured with exactly two enrolled lists',
    fn: function () {
      _assertEqual(Array.isArray(CONFIG.DELTA.enrolledLists), true, 'enrolledLists is an array');
      _assertEqual([...CONFIG.DELTA.enrolledLists].sort(), ['Placements', 'WeeklyActivity'], 'N-186 + N-187 enrol exactly these two');
      _assertEqual(typeof CONFIG.DELTA.enabled, 'boolean', 'enabled flag present');
    },
  },
  {
    name: 'N-186/N-187 _deltaEnabled — true only for the two enrolled lists, with sessionStorage available',
    fn: function () {
      if (typeof sessionStorage === 'undefined') _skip('no sessionStorage under Node — run tests/index.html for this one');
      _assertEqual(_deltaEnabled('WeeklyActivity'), true, 'enrolled since N-186');
      _assertEqual(_deltaEnabled('Placements'), true, 'enrolled since N-187');
      _assertEqual(_deltaEnabled('RejectedOffers'), false, 'shares getRejectedOffers()\'s identical filter shape but is deliberately NOT enrolled — not named in F-13\'s scope');
      _assertEqual(_deltaEnabled('Projects'), false, 'a tier-2 list is not delta-enrolled');
    },
  },
  {
    name: 'N-186 _deltaKey — stable, list-scoped, no filter/select component',
    fn: function () {
      _assertEqual(_deltaKey('WeeklyActivity'), 'newton_delta_WeeklyActivity', 'key shape');
      _assertEqual(_deltaKey('WeeklyActivity') === _deltaKey('WeeklyActivity'), true, 'deterministic — same list, same key, no filter/select inputs');
    },
  },
  {
    name: 'N-186 _deltaEntryUsable — a well-formed current-build entry is usable',
    fn: function () {
      const entry = { ts: Date.now(), build: CONFIG.APP_BUILD, deltaLink: '/sites/x/lists/y/items/delta?token=abc', items: [] };
      _assertEqual(_deltaEntryUsable(entry), true, 'well-formed');
    },
  },
  {
    name: 'N-186 _deltaEntryUsable — rejects a foreign build, a missing/empty deltaLink, and non-array items',
    fn: function () {
      const base = { ts: Date.now(), build: CONFIG.APP_BUILD, deltaLink: '/x', items: [] };
      _assertEqual(_deltaEntryUsable({ ...base, build: 'SOME-OTHER-BUILD' }), false, 'foreign build');
      _assertEqual(_deltaEntryUsable({ ...base, deltaLink: '' }), false, 'empty deltaLink');
      _assertEqual(_deltaEntryUsable({ ...base, deltaLink: undefined }), false, 'missing deltaLink');
      _assertEqual(_deltaEntryUsable({ ...base, items: 'not-an-array' }), false, 'items not an array');
      _assertEqual(_deltaEntryUsable(null), false, 'null');
      _assertEqual(_deltaEntryUsable(undefined), false, 'undefined');
      _assertEqual(_deltaEntryUsable([]), false, 'array itself is not a valid entry shape');
      _assertEqual(_deltaEntryUsable({ ts: Date.now(), build: CONFIG.APP_BUILD, deltaLink: '/x' }), false, 'missing items entirely');
    },
  },
  {
    name: 'N-186 _deltaMerge — upsert of a new id, replace of an existing id, removal via @removed',
    fn: function () {
      const baseline = [
        { id: '1', ProjectID: 100 },
        { id: '2', ProjectID: 200 },
      ];
      const page = [
        { id: '2', fields: { ProjectID: 201 } },
        { id: '3', fields: { ProjectID: 300 } },
        { id: '1', '@removed': { reason: 'deleted' } },
      ];
      const merged = _deltaMerge(baseline, page, 'WeeklyActivity');
      _assertEqual(merged === baseline, true, '_deltaMerge mutates and returns the same array it was given');
      _assertEqual(merged.length, 2, 'one removed, one replaced, one added = 2 remaining');
      _assertEqual(merged.find(function (i) { return i.id === '1'; }), undefined, 'id 1 removed');
      _assertEqual(merged.find(function (i) { return i.id === '2'; }).ProjectID, 201, 'id 2 replaced in place');
      _assertEqual(merged.find(function (i) { return i.id === '3'; }).ProjectID, 300, 'id 3 upserted');
    },
  },
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
      _assertEqual(sign(compareSortValues('Hired', 'Backlog', 'enum', CONFIG.ROLE_STAGES)), 1, 'Hired after Backlog');
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
  // ── N-266a — Project & Role checklists (utils.js) ───────────────────
  {
    name: 'N-266a spYesNo — every Graph Yes/No shape, and the fallback for a missing value',
    fn: function () {
      [true, 1, 'Yes', 'yes', ' YES ', 'true', '1'].forEach(v => _assertEqual(spYesNo(v, false), true, 'true for ' + JSON.stringify(v)));
      [false, 0, 'No', 'no', 'false', '0'].forEach(v => _assertEqual(spYesNo(v, true), false, 'false for ' + JSON.stringify(v)));
      [undefined, null, '', 'maybe', {}].forEach(v => {
        _assertEqual(spYesNo(v, true), true, 'fallback true for ' + JSON.stringify(v));
        _assertEqual(spYesNo(v, false), false, 'fallback false for ' + JSON.stringify(v));
      });
    },
  },
  {
    name: 'N-266a checklistVariants — keys from CONFIG.CHECKLISTS.VARIANTS, Default first (N-267 grouping)',
    fn: function () {
      // N-267: was Default + one per PROJECT_TYPES value. Now the grouping
      // table: Embedded = Default, CoE, Exec Search & MG AI shared.
      _assertEqual(checklistVariants(), ['Default', 'CoE', 'ExecSearchMGAI'], 'variant keys');
      _assertEqual(checklistVariants()[0], CONFIG.CHECKLISTS.DEFAULT_VARIANT, 'Default first');
    },
  },
  {
    name: 'N-266a activeChecklistItems / resolveChecklistVariant — blank Active is active; retired-only variant falls back to Default',
    fn: function () {
      const T = [
        { id: '1', RecordType: 'project', Variant: 'Default', ItemKey: 'a' },                 // Active never set
        { id: '2', RecordType: 'Project ', Variant: 'default', ItemKey: 'b', Active: 'Yes' }, // hand-entered casing
        { id: '3', RecordType: 'project', Variant: 'CoE', ItemKey: 'c', Active: false },      // retired only
        { id: '4', RecordType: 'project', Variant: 'ExecSearchMGAI', ItemKey: 'd', Active: 1 },  // N-267 grouped key
        { id: '5', RecordType: 'role', Variant: 'CoE', ItemKey: 'e' },
      ];
      _assertEqual(activeChecklistItems(T, 'project', 'Default').map(t => t.id), ['1', '2'], 'default project items incl. blank Active');
      _assertEqual(activeChecklistItems(T, 'project', 'CoE').length, 0, 'retired item excluded');
      _assertEqual(resolveChecklistVariant(T, 'project', 'CoE'), 'Default', 'CoE has only retired items → Default');
      _assertEqual(resolveChecklistVariant(T, 'project', 'Exec Search'), 'ExecSearchMGAI', 'Exec Search → grouped variant with active items');
      _assertEqual(resolveChecklistVariant(T, 'project', 'MG AI'), 'ExecSearchMGAI', 'MG AI → same grouped variant');
      _assertEqual(resolveChecklistVariant(T, 'project', 'Embedded'), 'Default', 'Embedded → Default');
      _assertEqual(resolveChecklistVariant(T, 'project', ''), 'Default', 'no project type → Default');
      _assertEqual(resolveChecklistVariant(T, 'project', undefined), 'Default', 'undefined project type → Default');
      _assertEqual(resolveChecklistVariant(T, 'role', 'CoE'), 'CoE', 'role inherits project type');
      _assertEqual(resolveChecklistVariant(T, 'role', 'MG AI'), 'Default', 'role type with no items → Default');
      _assertEqual(activeChecklistItems(null, 'project', 'Default'), [], 'null templates');
    },
  },
  {
    name: 'N-266a groupChecklistItems — section then item order, blanks last, blank section → General',
    fn: function () {
      const g = groupChecklistItems([
        { id: '9', Section: 'Sourcing', SectionOrder: 2, ItemOrder: 2 },
        { id: '3', Section: 'Kick-off', SectionOrder: 1, ItemOrder: 2 },
        { id: '4', Section: 'Kick-off', SectionOrder: 1, ItemOrder: 1 },
        { id: '8', Section: 'Sourcing', SectionOrder: 2, ItemOrder: 1 },
        { id: '6', Section: 'Sourcing', SectionOrder: 2 },          // no ItemOrder → last
        { id: '5', Section: 'Sourcing', SectionOrder: 2 },          // tie → id order
        { id: '7', Section: '',         SectionOrder: '' },         // → General, no order → last section
      ]);
      _assertEqual(g.map(s => s.section), ['Kick-off', 'Sourcing', 'General'], 'section order');
      _assertEqual(g[0].items.map(i => i.id), ['4', '3'], 'kick-off items');
      _assertEqual(g[1].items.map(i => i.id), ['8', '9', '5', '6'], 'sourcing items, blanks last by id');
      _assertEqual(groupChecklistItems([]), [], 'empty');
    },
  },
  {
    name: 'N-266a checklistMode — full truth table',
    fn: function () {
      const never = { enabled: false, fromId: null };
      const on    = { enabled: true,  fromId: 100 };
      const off   = { enabled: false, fromId: 100 };
      const m = (settings, isAdmin, recordId, hasItems = true) => checklistMode({ settings, isAdmin, recordId, hasItems });
      _assertEqual(m(never, true, '5'), 'preview', 'never switched on: admin previews any record');
      _assertEqual(m(never, false, '5'), 'none', 'never switched on: non-admin sees nothing');
      _assertEqual(m(on, false, '99'), 'none', 'below watermark');
      _assertEqual(m(on, true, '99'), 'none', 'below watermark, admin too');
      _assertEqual(m(on, false, '100'), 'live', 'at watermark');
      _assertEqual(m(on, false, 250), 'live', 'numeric id above watermark');
      _assertEqual(m(off, false, '150'), 'none', 'switched off: non-admin');
      _assertEqual(m(off, true, '150'), 'preview', 'switched off: admin preview, in scope');
      _assertEqual(m(off, true, '50'), 'none', 'switched off: admin, below watermark');
      _assertEqual(m(on, true, 'pend_1727_ab12'), 'none', 'pending optimistic row');
      _assertEqual(m(on, true, null), 'none', 'no id');
      _assertEqual(m(on, true, '150', false), 'none', 'no items');
      _assertEqual(m({ enabled: 'Yes', fromId: 100 }, false, '150'), 'none', 'enabled must already be normalised to a boolean');
      _assertEqual(m({ enabled: true, fromId: '' }, true, '5'), 'preview', 'blank fromId = never switched on');
      _assertEqual(m(null, true, '5'), 'preview', 'missing settings');
    },
  },
  {
    name: 'N-266a checklistColumnVisible',
    fn: function () {
      _assertEqual(checklistColumnVisible({ settings: { enabled: false, fromId: null }, isAdmin: true, hasItems: true }), true, 'admin preview');
      _assertEqual(checklistColumnVisible({ settings: { enabled: false, fromId: null }, isAdmin: false, hasItems: true }), false, 'non-admin, never on');
      _assertEqual(checklistColumnVisible({ settings: { enabled: true, fromId: 10 }, isAdmin: false, hasItems: true }), true, 'non-admin, on');
      _assertEqual(checklistColumnVisible({ settings: { enabled: false, fromId: 10 }, isAdmin: false, hasItems: true }), false, 'non-admin, switched off');
      _assertEqual(checklistColumnVisible({ settings: { enabled: true, fromId: 10 }, isAdmin: true, hasItems: false }), false, 'no items');
    },
  },
  {
    name: 'N-266a resolveChecklistProgress / summariseChecklist — latest row wins; retired and unknown keys ignored',
    fn: function () {
      const p = resolveChecklistProgress([
        { id: '1', ItemKey: 'a', Done: true,  DoneByEmail: 'x@m.co', DoneDate: '2026-10-01T09:00:00Z' },
        { id: '2', ItemKey: 'a', Done: false, DoneByEmail: 'y@m.co', DoneDate: '2026-10-02T09:00:00Z' }, // later untick
        { id: '3', ItemKey: 'b', Done: 1,     DoneDate: '2026-10-01T09:00:00Z' },
        { id: '4', ItemKey: 'b', Done: 0,     DoneDate: '2026-10-01T09:00:00Z' },                        // tie → higher id
        { id: '5', ItemKey: 'c', Done: 'Yes', DoneDate: '2026-10-01T09:00:00Z' },
        { id: '6', ItemKey: 'd' },                                                                        // Done never set
        { id: '7', ItemKey: '', Done: true },
      ]);
      _assertEqual(p.get('a'), { done: false, by: 'y@m.co', at: '2026-10-02T09:00:00Z', rowId: '2' }, 'latest DoneDate wins');
      _assertEqual(p.get('b').done, false, 'equal dates → higher id');
      _assertEqual(p.get('c').done, true, "'Yes' reads as done");
      _assertEqual(p.get('d').done, false, 'blank Done is not done');
      _assertEqual(p.has(''), false, 'blank key ignored');
      const items = [
        { ItemKey: 'a', Required: true }, { ItemKey: 'c', Required: 'Yes' },
        { ItemKey: 'd' }, { ItemKey: 'z' },   // z has no progress row
      ];
      _assertEqual(summariseChecklist(items, p), { done: 1, total: 4, reqDone: 1, reqTotal: 2 }, 'summary');
      _assertEqual(summariseChecklist([], p), { done: 0, total: 0, reqDone: 0, reqTotal: 0 }, 'empty');
      _assertEqual(summariseChecklist(items, null), { done: 0, total: 4, reqDone: 0, reqTotal: 2 }, 'no progress map');
    },
  },
  {
    name: 'N-266a isSafeChecklistUrl — https and Newton pages only',
    fn: function () {
      [
        'https://momentumglobal.sharepoint.com/sites/x/Shared%20Documents/Playbook.docx',
        'HTTPS://example.com', 'https://example.com/a?b=1#c', 'https://example.com',
        'people.html', 'reporting.html#roles', 'reporting.html#roles?action=add', '  user-guide.html  ',
      ].forEach(u => _assertEqual(isSafeChecklistUrl(u), true, 'accept ' + u));
      [
        'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>',
        'http://example.com', '//evil.com', 'https://', 'https:///x', 'https://x.com/a b', 'https://x.com/"onmouseover=',
        'https://x.com/<script>', 'ftp://x.com', 'people.html"><script>', '../people.html', 'People.HTML',
        '', null, undefined,
      ].forEach(u => _assertEqual(isSafeChecklistUrl(u), false, 'reject ' + JSON.stringify(u)));
    },
  },

  // ── N-266b — Config Panel checklist editor (utils.js) ───────────────
  {
    name: 'N-266b validateChecklistItem — valid tick / link / action; every error path; registry keys passed in',
    fn: function () {
      const C    = CONFIG.CHECKLISTS;
      const keys = ['newton.test'];
      const v    = (over, k = keys) => validateChecklistItem(Object.assign({
        label: 'Kick-off call booked', section: 'Setup', type: 'tick', linkUrl: '', actionKey: '', help: '',
      }, over), k);
      const errs = (over, k) => Object.keys(v(over, k).errors).sort();

      _assertEqual(v({}), { ok: true, errors: {} }, 'valid tick');
      _assertEqual(v({ type: 'link', linkUrl: 'https://momentumglobal.sharepoint.com/sites/x/Playbook.docx' }).ok, true, 'valid https link');
      _assertEqual(v({ type: 'link', linkUrl: 'people.html#tracker' }).ok, true, 'valid Newton page link');
      _assertEqual(v({ type: 'action', actionKey: 'newton.test' }).ok, true, 'valid action');
      _assertEqual(v({ type: ' Link ', linkUrl: 'people.html' }).ok, true, 'type is case/space-insensitive');
      _assertEqual(v({ linkUrl: 'javascript:alert(1)', actionKey: 'nope' }).ok, true, 'a tick ignores the unused link/action fields');
      _assertEqual(v({ label: '<script>"x"</script>\'' }).ok, true, 'markup in a label is text, not an error');

      _assertEqual(errs({ label: '' }), ['label'], 'empty label');
      _assertEqual(errs({ label: '   ' }), ['label'], 'whitespace-only label');
      _assertEqual(errs({ label: 'x'.repeat(C.LABEL_MAX + 1) }), ['label'], 'label over LABEL_MAX');
      _assertEqual(v({ label: 'x'.repeat(C.LABEL_MAX) }).ok, true, 'label at LABEL_MAX');
      _assertEqual(v({ label: '  ' + 'x'.repeat(C.LABEL_MAX) + '  ' }).ok, true, 'length counted after trimming');
      _assertEqual(errs({ section: '' }), ['section'], 'empty section');
      _assertEqual(errs({ section: '\t ' }), ['section'], 'whitespace-only section');
      _assertEqual(errs({ section: 's'.repeat(C.LABEL_MAX + 1) }), ['section'], 'section over LABEL_MAX');
      _assertEqual(errs({ type: 'checkbox' }), ['type'], 'unknown type');
      _assertEqual(errs({ type: '' }), ['type'], 'no type');
      _assertEqual(errs({ type: 'link', linkUrl: '' }), ['linkUrl'], 'link with no URL');
      _assertEqual(errs({ type: 'link', linkUrl: 'javascript:alert(1)' }), ['linkUrl'], 'javascript: URL');
      _assertEqual(errs({ type: 'link', linkUrl: 'JaVaScRiPt:alert(1)' }), ['linkUrl'], 'mixed-case javascript: URL');
      _assertEqual(errs({ type: 'link', linkUrl: 'http://example.com' }), ['linkUrl'], 'http: URL');
      _assertEqual(errs({ type: 'link', linkUrl: 'https://example.com/' + 'a'.repeat(C.LABEL_MAX) }), ['linkUrl'], 'URL over the single-line column limit');
      _assertEqual(errs({ type: 'action', actionKey: 'newton.nope' }), ['actionKey'], 'unknown action key');
      _assertEqual(errs({ type: 'action', actionKey: '' }), ['actionKey'], 'no action key');
      _assertEqual(errs({ type: 'action', actionKey: 'newton.test' }, []), ['actionKey'], 'keys come from the argument, not a global');
      _assertEqual(Object.keys(validateChecklistItem({ label: 'a', section: 'b', type: 'action', actionKey: 'newton.test' }).errors),
        ['actionKey'], 'no keys argument → no action is valid');
      _assertEqual(errs({ help: 'h'.repeat(C.HELP_MAX + 1) }), ['help'], 'help over HELP_MAX');
      _assertEqual(v({ help: 'h'.repeat(C.HELP_MAX) }).ok, true, 'help at HELP_MAX');
      _assertEqual(errs({ label: ' ', section: '', type: 'link', linkUrl: 'data:text/html,x', help: 'h'.repeat(C.HELP_MAX + 1) }),
        ['help', 'label', 'linkUrl', 'section'], 'every error reported at once');
      _assertEqual(typeof v({ label: '' }).errors.label, 'string', 'errors carry a message');
      _assertEqual(validateChecklistItem().ok, false, 'no argument → invalid, no throw');
    },
  },

  // ── N-267 — checklist variant grouping (config.js + utils.js) ───────
  {
    name: 'N-267 CONFIG.CHECKLISTS.VARIANTS — well-formed grouping table',
    fn: function () {
      const V = CONFIG.CHECKLISTS.VARIANTS;
      _assertEqual(V[0].key, CONFIG.CHECKLISTS.DEFAULT_VARIANT, 'first entry is DEFAULT_VARIANT');
      _assertEqual(new Set(V.map(v => v.key)).size, V.length, 'keys unique');
      const mapped = [].concat(...V.map(v => v.projectTypes || []));
      _assertEqual(mapped.filter(t => !CONFIG.PROJECT_TYPES.includes(t)), [], 'every mapped type is a real PROJECT_TYPES value');
      _assertEqual(new Set(mapped).size, mapped.length, 'no project type in two variants');
      V.forEach(v => _assertEqual(typeof v.label === 'string' && v.label.length > 0, true, 'label for ' + v.key));
    },
  },
  {
    name: 'N-267 checklistVariantForProjectType / checklistVariantLabel — Embedded = Default, Exec Search + MG AI grouped',
    fn: function () {
      const f = checklistVariantForProjectType;
      _assertEqual(f('Embedded'), 'Default', 'Embedded');
      _assertEqual(f('CoE'), 'CoE', 'CoE');
      _assertEqual(f('Exec Search'), 'ExecSearchMGAI', 'Exec Search');
      _assertEqual(f('MG AI'), 'ExecSearchMGAI', 'MG AI');
      _assertEqual(f(' mg ai '), 'ExecSearchMGAI', 'case/space-insensitive');
      _assertEqual(f(''), 'Default', 'blank');
      _assertEqual(f(undefined), 'Default', 'undefined');
      _assertEqual(f(null), 'Default', 'null');
      _assertEqual(f('Internal'), 'Default', 'unlisted type');
      _assertEqual(f('Something New'), 'Default', 'unknown type');
      _assertEqual(checklistVariantLabel('Default'), 'Embedded (default)', 'Default label');
      _assertEqual(checklistVariantLabel('CoE'), 'CoE', 'CoE label');
      _assertEqual(checklistVariantLabel('ExecSearchMGAI'), 'Exec Search & MG AI', 'grouped label');
      _assertEqual(checklistVariantLabel(' default '), 'Embedded (default)', 'hand-typed key casing');
      _assertEqual(checklistVariantLabel('Legacy'), 'Legacy', 'unknown key shown as-is');
      _assertEqual(checklistVariantLabel(undefined), '', 'undefined key');
    },
  },
  {
    name: 'N-267 resolveChecklistVariant — grouped variant, CoE and Default fallback; legacy per-type rows never used',
    fn: function () {
      const T = [
        { id: '1', RecordType: 'project', Variant: 'Default', ItemKey: 'a' },
        { id: '2', RecordType: 'project', Variant: 'Exec Search', ItemKey: 'legacy1' },  // pre-N-267 key
        { id: '3', RecordType: 'project', Variant: 'MG AI', ItemKey: 'legacy2' },        // pre-N-267 key
        { id: '4', RecordType: 'role', Variant: 'ExecSearchMGAI', ItemKey: 'r' },
        { id: '5', RecordType: 'project', Variant: 'CoE', ItemKey: 'c' },
      ];
      _assertEqual(resolveChecklistVariant(T, 'project', 'Exec Search'), 'Default', 'legacy "Exec Search" rows ignored → Default');
      _assertEqual(resolveChecklistVariant(T, 'project', 'MG AI'), 'Default', 'legacy "MG AI" rows ignored → Default');
      _assertEqual(resolveChecklistVariant(T, 'role', 'MG AI'), 'ExecSearchMGAI', 'MG AI role uses grouped role items');
      _assertEqual(resolveChecklistVariant(T, 'role', 'Exec Search'), 'ExecSearchMGAI', 'Exec Search role uses the same');
      _assertEqual(resolveChecklistVariant(T, 'role', 'CoE'), 'Default', 'CoE role with no role items → Default');
      _assertEqual(resolveChecklistVariant(T, 'project', 'CoE'), 'CoE', 'CoE project');
      _assertEqual(resolveChecklistVariant(T, 'project', 'Embedded'), 'Default', 'Embedded project');
    },
  },
  {
    name: 'N-268 reconstructStageTransitions — creation row, repeat/null skip, truncation, cutoff exclusive',
    fn: function () {
      const V = (id, t, stage) => ({ versionId: id, modifiedAt: t, modifiedBy: 'tp@example.com', stage });
      const full = [
        V('3.0', '2026-06-03T10:00:00Z', 'Sourcing'),   // deliberately out of order
        V('1.0', '2026-06-01T10:00:00Z', 'Backlog'),
        V('2.0', '2026-06-02T10:00:00Z', 'Backlog'),
        V('4.0', '2026-06-04T10:00:00Z', null),
        V('5.0', '2026-06-05T10:00:00Z', 'Cancelled'),
      ];
      const r = reconstructStageTransitions(full, '2026-07-01T00:00:00Z');
      _assertEqual(r.rows.map(x => [x.oldValue, x.newValue]),
        [['', 'Backlog'], ['Backlog', 'Sourcing'], ['Sourcing', 'Cancelled']], 'AC2 rows');
      _assertEqual(r.skippedNullStage, 1, 'AC2 null-stage version skipped');
      _assertEqual(r.truncated, false, 'AC2 not truncated');
      _assertEqual([r.rows[2].changedAt, r.rows[2].changedBy], ['2026-06-05T10:00:00Z', 'tp@example.com'], 'instant + author from version');
      const t = reconstructStageTransitions(full.filter(v => v.versionId !== '1.0' && v.versionId !== '2.0'), '2026-07-01T00:00:00Z');
      _assertEqual(t.truncated, true, 'AC3 truncated');
      _assertEqual(t.rows.map(x => [x.oldValue, x.newValue]), [['Sourcing', 'Cancelled']], 'AC3 no creation row');
      const c = reconstructStageTransitions(full, '2026-06-05T10:00:00Z');
      _assertEqual(c.rows.map(x => x.newValue), ['Backlog', 'Sourcing'], 'AC4 row exactly AT cutoff excluded');
      _assertEqual(reconstructStageTransitions([], '2026-07-01T00:00:00Z'), { rows: [], truncated: false, skippedNullStage: 0 }, 'empty history');
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

      const stages = ['Backlog', 'Planning', 'On-hold', 'Cancelled', 'Hired',
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
    name: 'N-276 ttfClosedCensorTimes — trailing closed run, skips, lookback, BST day',
    fn: function () {
      const today = new Date(2026, 9, 1, 12);  // 1 Oct 2026, local noon
      const R = (id, stage, open) => ({ id, Stage: stage, Department: 'Eng', Location: 'UK', OpenDate: open + 'T12:00:00Z' });
      const S = (id, oldV, newV, at) => ({ RoleIDLookupId: id, Field: 'Stage', OldValue: oldV, NewValue: newV, ChangedAt: at });
      const roles = [
        R(1, 'Cancelled', '2026-06-01'), R(2, 'Cancelled', '2026-06-01'), R(3, 'On-hold', '2026-06-01'),
        R(4, 'Cancelled', '2026-06-01'), R(5, 'Cancelled', '2026-06-01'), R(6, 'On-hold', '2026-06-01'),
        R(7, 'Cancelled', '2026-06-01'), R(8, 'Cancelled', '2026-06-01'), R(9, 'Cancelled', '2026-06-01'),
        R(10, 'Cancelled', '2025-06-01'), R(11, 'Sourcing', '2026-06-01'), R(12, 'Cancelled', '2026-06-10'),
      ];
      const rows = [
        S(1, null, 'Sourcing', '2026-06-01T09:00:00Z'), S(1, 'Sourcing', 'Cancelled', '2026-07-01T10:00:00Z'),
        S(2, 'Interview 1', 'On-hold', '2026-06-21T10:00:00Z'), S(2, 'On-hold', 'Cancelled', '2026-07-31T10:00:00Z'),
        S(3, 'Sourcing', 'On-hold', '2026-06-16T10:00:00Z'),
        S(4, null, 'Cancelled', '2026-06-05T10:00:00Z'),
        S(5, 'Backlog', 'Cancelled', '2026-06-05T10:00:00Z'),
        S(6, 'Planning', 'On-hold', '2026-06-05T10:00:00Z'),
        S(7, 'Sourcing', 'On-hold', '2026-06-05T10:00:00Z'),          // latest row disagrees with Stage
        S(9, 'Sourcing', 'Cancelled', '2026-05-20T10:00:00Z'),        // t < 0
        S(10, 'Sourcing', 'Cancelled', '2025-07-01T10:00:00Z'),       // outside lookback
        S(11, 'Sourcing', 'Sourcing', '2026-06-05T10:00:00Z'),
        S(12, 'Sourcing', 'Cancelled', '2026-07-09T23:30:00Z'),       // 00:30 BST on 10 Jul
        { RoleIDLookupId: 1, Field: 'Priority', OldValue: 'Sourcing', NewValue: 'Cancelled', ChangedAt: '2026-08-01T10:00:00Z' },
      ];
      const out = ttfClosedCensorTimes(roles, rows, today);
      const t = Object.fromEntries(out.map(o => [o.roleId, o.t]));
      _assertEqual(t['1'], 30, 'AC4 Sourcing → Cancelled');
      _assertEqual(t['2'], 20, 'AC5 On-hold → Cancelled censored at the On-hold date');
      _assertEqual(t['3'], 15, 'AC6 currently On-hold');
      _assertEqual(Object.keys(t).filter(k => ['4', '5', '6', '7', '8', '9', '10', '11'].includes(k)), [], 'AC7 skips');
      _assertEqual(Object.keys(out[0]).sort(), ['Department', 'Location', 'Stage', 'roleId', 't'], 'shape');
      if (localDayISO(new Date('2026-07-09T23:30:00Z')) !== '2026-07-10') {
        _skip('AC8 needs a UK timezone (BST) — runs under node tests/run.js.');
      }
      _assertEqual(t['12'], 30, 'AC8 BST instant resolves to the next local day');
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
        { id: 7, Stage: 'Hired',     Department: 'Eng', Location: 'UK' },          // hired but outside `historical`
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
        role('R14', 'Hired', J1), role('R15', 'Backlog', J1), role('R16', 'Offered', J1),
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
    name: 'N-271 _deltaEligibleCall — only the default projection may use the delta store',
    fn: function () {
      _assertEqual(_deltaEligibleCall('', null), true, 'AC22 default read');
      _assertEqual(_deltaEligibleCall('', undefined), true, 'AC22 select omitted');
      _assertEqual(_deltaEligibleCall('', 'Id'), false, 'AC22 id-only row count must not touch the store');
      _assertEqual(_deltaEligibleCall('', 'Id,Title'), false, 'AC22 any explicit select');
      _assertEqual(_deltaEligibleCall('fields/RoleID eq 1', null), false, 'AC22 filtered');
      _assertEqual(_deltaEligibleCall('fields/RoleID eq 1', 'Id'), false, 'AC22 filtered and explicit select');
    },
  },
  {
    name: 'N-271 weeklyActivityRowsUsable — an id-only (projected) result is not usable',
    fn: function () {
      _assertEqual(weeklyActivityRowsUsable([]), true, 'AC23 empty');
      _assertEqual(weeklyActivityRowsUsable(null), true, 'AC23 null');
      _assertEqual(weeklyActivityRowsUsable([{ id: '1' }, { id: '2' }]), false, 'AC23 id-only');
      _assertEqual(weeklyActivityRowsUsable([{ id: '1' }, { id: '2', RoleIDLookupId: '5' }]), true, 'AC23 one row with a role key');
      _assertEqual(weeklyActivityRowsUsable([{ id: '1', RoleID: '7' }]), true, 'AC23 RoleID fallback');
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
    name: 'N-281 resolveRoleFromAssignments — precedence, whitelist, order-independence',
    fn: function () {
      const A = { AssignedRole: 'admin' }, AX = { AssignedRole: 'admin', Active: false };
      const DM = { AssignedRole: 'delivery_manager' }, TP = { AssignedRole: 'talent_partner' };
      _assertEqual(resolveRoleFromAssignments([A], false), 'admin', 'AC3a admin row');
      _assertEqual(resolveRoleFromAssignments([AX, DM], false), 'delivery_manager', 'AC3b inactive admin grants nothing');
      _assertEqual(resolveRoleFromAssignments([AX], true), 'leadership', 'AC3c inactive admin + leadership');
      _assertEqual(resolveRoleFromAssignments([DM, DM, A], false), 'admin', 'AC3d admin last');
      _assertEqual(resolveRoleFromAssignments([A, DM, DM], false), 'admin', 'AC3d admin first');
      _assertEqual(resolveRoleFromAssignments([TP, DM], false), 'delivery_manager', 'AC3d TP then DM');
      _assertEqual(resolveRoleFromAssignments([DM, TP], false), 'delivery_manager', 'AC3d DM then TP');
      _assertEqual(resolveRoleFromAssignments([A], true), 'admin', 'AC3e admin outranks leadership');
      _assertEqual(resolveRoleFromAssignments([{ AssignedRole: 'superuser' }], false), 'viewer', 'AC3f unknown role ignored');
      _assertEqual(resolveRoleFromAssignments([{ AssignedRole: 'leadership' }], false), 'viewer', 'AC3f leadership never from a row');
      _assertEqual(resolveRoleFromAssignments([{ AssignedRole: 'Admin ' }], false), 'viewer', 'AC3f near-miss admin string ignored');
      _assertEqual(resolveRoleFromAssignments([], false), 'viewer', 'AC3g no rows');
      _assertEqual(resolveRoleFromAssignments([], true), 'leadership', 'AC3g leadership only');
      _assertEqual(resolveRoleFromAssignments([{ AssignedRole: 'talent_partner', Active: false }], false), 'talent_partner', 'AC3h lower roles ignore Active');
      _assertEqual(resolveRoleFromAssignments(undefined, false), 'viewer', 'non-array input is safe');
      _assertEqual([A, AX, { AssignedRole: 'admin', Active: true }, TP, null].map(isAdminAssignment),
        [true, false, true, false, false], 'isAdminAssignment');
    },
  },
  {
    name: 'N-281 no hardcoded admin list, auto-registration, LastLogin or sync role helper left in js/',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const banned = [/\bADMIN_USERS\b/, /\bensureUserRegistered\b/, /\bLastLogin\b/, /\bgetUserRole\s*\(/];
      const hits = [];
      Object.keys(ALL_SOURCES).forEach(f => banned.forEach(re => {
        if (re.test(ALL_SOURCES[f])) hits.push(f + ' ' + re);
      }));
      _assertEqual(hits, [], 'banned identifiers in js/');
    },
  },
  {
    name: 'No unescaped SharePoint text in HTML templates in js/ (N-283 — S-8 guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const found = lintEscaping(ALL_SOURCES);
      _assertEqual(
        found.map(v => `${v.file}:${v.line} \${${v.expr}}`),
        [],
        'naked ${x.Field} in an HTML template without an esc* wrapper (wrap it, or see tests/lint-escaping.js for the opt-out)'
      );
    },
  },
  {
    name: 'odataStr doubles apostrophes and nothing else (N-284 — S-14)',
    fn: function () {
      _assertEqual(odataStr("o'brien@x.com"), "o''brien@x.com", 'apostrophe doubled');
      _assertEqual(odataStr("D'Arcy O'Neil"), "D''Arcy O''Neil", 'every apostrophe');
      _assertEqual(odataStr('plain'), 'plain', 'unchanged');
      _assertEqual(odataStr(null), '', 'null');
      _assertEqual(odataStr(undefined), '', 'undefined');
      _assertEqual(odataStr(5), '5', 'number');
      _assertEqual(odataStr('a&b+c%d'), 'a&b+c%d', 'URL characters are left to getItems() encoding');
    },
  },
  {
    name: 'validateUpload — extension, MIME, size (N-284 — S-16)',
    fn: function () {
      const MB = 1024 * 1024;
      const f = (name, size, type) => ({ name, size, type });
      const ok  = (file, kind) => validateUpload(file, kind);
      _assertEqual(ok(f('a.png', 1000, 'image/png'), 'PHOTO').ok, true, 'png photo');
      _assertEqual(ok(f('A.JPG', 1000, 'image/jpeg'), 'PHOTO').ext, 'jpg', 'mixed-case ext, allowlist-derived');
      _assertEqual(ok(f('a.jpeg', 1000, 'image/jpeg'), 'PHOTO').ext, 'jpg', 'jpeg normalised to jpg');
      _assertEqual(ok(f('a.png', 2 * MB + 1, 'image/png'), 'PHOTO').ok, false, 'photo 1 byte over 2 MB');
      _assertEqual(ok(f('a.png', 2 * MB, 'image/png'), 'PHOTO').ok, true, 'photo exactly 2 MB');
      _assertEqual(ok(f('a.svg', 100, 'image/svg+xml'), 'PHOTO').ok, false, 'svg photo');
      _assertEqual(ok(f('a.svg', 100, 'image/svg+xml'), 'LOGO').ok, false, 'svg logo');
      _assertEqual(ok(f('a.png', 100, 'image/svg+xml'), 'LOGO').ok, false, 'svg renamed .png (non-blank wrong MIME)');
      _assertEqual(ok(f('x.pdf', 100, 'application/x-msdownload'), 'INVOICE').ok, false, 'exe renamed .pdf');
      _assertEqual(ok(f('x.pdf', 100, ''), 'INVOICE').ok, true, 'blank MIME accepted when extension passes');
      _assertEqual(ok(f('x.pdf', 100, 'image/png'), 'INVOICE').ok, false, 'pdf with a png MIME');
      _assertEqual(ok(f('x.PDF', 100, 'application/pdf'), 'INVOICE').ok, true, 'upper-case .PDF');
      _assertEqual(ok(f('x.pdf', 10 * MB + 1, 'application/pdf'), 'INVOICE').ok, false, 'invoice over 10 MB');
      _assertEqual(ok(f('x.pdf', 0, 'application/pdf'), 'INVOICE').ok, false, '0-byte file');
      _assertEqual(ok(f('noext', 100, ''), 'INVOICE').ok, false, 'no extension');
      _assertEqual(ok(f('m.xls', 100, 'application/vnd.ms-excel'), 'LCI_IMPORT').ok, false, 'legacy .xls');
      _assertEqual(ok(f('m.xlsx', 100, ''), 'LCI_IMPORT').ok, true, 'xlsx, blank MIME');
      _assertEqual(ok(f('l.png', CONFIG.BRIEFING_PACK.CLIENT_LOGO_MAX_BYTES + 1, 'image/png'), 'LOGO').ok, false, 'logo over the existing 150 KB cap');
      _assertEqual(ok(f('l.png', CONFIG.BRIEFING_PACK.CLIENT_LOGO_MAX_BYTES, 'image/png'), 'LOGO').ok, true, 'logo exactly at the cap');
      _assertEqual(ok(null, 'PHOTO').ok, false, 'no file');
      _assertEqual(uploadAcceptAttr('LOGO').includes('svg'), false, 'accept attr has no svg');
      const safe = safeUploadName("../..\\Invoice #12 (final) \u00e9.pdf", 'pdf');
      _assertEqual(/^[A-Za-z0-9._-]+$/.test(safe), true, 'stored name charset: ' + safe);
      _assertEqual(safe.endsWith('.pdf'), true, 'forced extension');
      _assertEqual(safeUploadName('x'.repeat(300) + '.pdf', 'pdf').length <= 64, true, 'length capped');
    },
  },
  {
    name: 'Every string $filter interpolation in js/ goes through odataStr (N-284 — S-14 guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      // Single-line scan: filters in this codebase are single-line template fragments.
      // Comment text is ignored; a line can opt out with `// odata-lint-ok: <reason>` (reason mandatory).
      const found = lintOdataFilters(ALL_SOURCES);
      _assertEqual(found.map(v => v.file + ':' + v.line), [], "eq/ge/… '${x}' without odataStr()");
    },
  },
  {
    name: 'lintOdataFilters flags what it should (N-284 — guard the guard)',
    fn: function () {
      const run = src => lintOdataFilters({ 'fixture.js': src });
      _assertEqual(run("x = `fields/Title eq '${x}'`;").length, 1, 'unwrapped eq');
      _assertEqual(run("x = `fields/D ge '${a.b}' and fields/T eq '${odataStr(y)}'`;").length, 1, 'one of two wrapped');
      _assertEqual(run("x = `fields/Title eq '${odataStr(x)}'`;").length, 0, 'wrapped');
      _assertEqual(run("x = `fields/Id eq ${n}`;").length, 0, 'numeric clause is out of scope');
      _assertEqual(run("// fields/Title eq '${x}'").length, 0, 'comment ignored');
      _assertEqual(run("x = `fields/Title eq '${x}'`; // odata-lint-ok: generated value").length, 0, 'opt-out with a reason');
      _assertEqual(run("x = `fields/Title eq '${x}'`; // odata-lint-ok").length, 1, 'bare opt-out still flagged');
    },
  },
  {
    name: 'lintEscaping flags what it should and passes what it should (N-283 — guard the guard)',
    fn: function () {
      const BT = String.fromCharCode(96);
      const run = src => lintEscaping({ 'fixture.js': src });
      // (a)–(c) must be flagged
      _assertEqual(run('x = ' + BT + '<td>${r.Notes}</td>' + BT).length, 1, '(a) bare field in a td');
      _assertEqual(run('x = ' + BT + '\n<tr>\n  <td>\n ${r.Notes}\n </td></tr>' + BT).length, 1, '(b) tag and interpolation on different lines');
      _assertEqual(run('x = ' + BT + '<td>${x.Title || \'—\'}</td>' + BT).length, 1, '(c) literal-fallback form');
      // (d)–(g) must pass
      _assertEqual(run('x = ' + BT + '<td>${escHtml(r.Title)}</td>' + BT).length, 0, '(d) escHtml wrapper');
      _assertEqual(
        run('x = ' + BT + '<option>${escHtml(r.Location ? ' + BT + '${r.RoleTitle} (${r.Location})' + BT + ' : r.RoleTitle)}</option>' + BT).length,
        0, '(e) template nested inside an esc call'
      );
      _assertEqual(run('x = ' + BT + '<td>${r.Hires}</td>' + BT).length, 0, '(f) allowlisted numeric field');
      _assertEqual(run('x = ' + BT + '<td>${r.Notes /* esc-lint-ok: fixture */}</td>' + BT).length, 0, '(g) opt-out with a reason');
      // (h) bare opt-out must still be flagged
      _assertEqual(run('x = ' + BT + '<td>${r.Notes /* esc-lint-ok */}</td>' + BT).length, 1, '(h) opt-out without a reason');
      // plain-text template (no tag) is not HTML
      _assertEqual(run('x = ' + BT + 'Remove "${r.Title}"?' + BT).length, 0, 'non-HTML template ignored');
      // an inner template inside an UNescaped interpolation of an HTML template is HTML context
      _assertEqual(
        run('x = ' + BT + '<option>${r.Location ? ' + BT + '${r.RoleTitle} (${r.Location})' + BT + ' : r.RoleTitle}</option>' + BT).length,
        2, 'inner template inherits HTML context (the coe-plan.js:460 shape)'
      );
    },
  },
  {
    name: 'N-285 config — RESTRICTED_LISTS is exactly the seven Tier 2 lists; mobile Sales is admin + leadership only',
    fn: function () {
      _assertEqual(CONFIG.RESTRICTED_LISTS.slice().sort(),
        ['AnomalyAcks', 'Diagnostics', 'GPInvoices', 'LCILocations', 'PeoplePay', 'SalesForecasts', 'SurveyResponses'], 'AC1 the seven names');
      _assertEqual(new Set(CONFIG.RESTRICTED_LISTS).size, CONFIG.RESTRICTED_LISTS.length, 'AC1 no duplicates');
      _assertEqual(CONFIG.MOBILE_MODULE_ROLES.sales, ['admin', 'leadership'], 'AC12 mobile Sales roles');
      _assertEqual(typeof CONFIG.CC_FORECAST_DENIED_TEXT === 'string' && CONFIG.CC_FORECAST_DENIED_TEXT.length > 0, true, 'AC11 denied copy is config');
      // Every restricted list is also a registered list (PeoplePay since N-286).
      CONFIG.RESTRICTED_LISTS.forEach(l =>
        _assertEqual(Object.keys(FIELD_ALIASES).includes(l), true, 'AC1 ' + l + ' is a registered list'));
    },
  },
  {
    name: 'N-285 isRestrictedList / isListAccessDenied — 403 on a restricted list only',
    fn: function () {
      _assertEqual(isListAccessDenied('SalesForecasts', { status: 403 }), true, 'AC2 restricted + 403');
      _assertEqual(isListAccessDenied('SalesForecasts', { status: 500 }), false, 'AC2 restricted + 500 stays an error');
      _assertEqual(isListAccessDenied('SalesForecasts', { status: 401 }), false, 'AC2 restricted + 401 stays an error');
      _assertEqual(isListAccessDenied('Roles', { status: 403 }), false, 'AC2/AC7 unrestricted + 403 stays an error');
      _assertEqual(isListAccessDenied('SalesForecasts', new Error('network down')), false, 'AC2 no status');
      _assertEqual(isListAccessDenied('SalesForecasts', null), false, 'AC2 null error');
      _assertEqual(isListAccessDenied('SalesForecasts', undefined), false, 'AC2 undefined error');
      const cfg = { RESTRICTED_LISTS: ['Roles'] };
      _assertEqual(isRestrictedList('Roles', cfg), true, 'AC2 injected config: in');
      _assertEqual(isRestrictedList('SalesForecasts', cfg), false, 'AC2 injected config: out');
      _assertEqual(isListAccessDenied('Roles', { status: 403 }, cfg), true, 'AC2 injected config drives the verdict');
      _assertEqual(isRestrictedList('Roles', {}), false, 'AC2 missing array is not restricted');
    },
  },
  {
    name: 'N-285 _graphError — status and code survive; message text unchanged from the pre-N-285 builds',
    fn: function () {
      const e = _graphError(403, { error: { code: 'accessDenied', message: 'Access denied' } });
      _assertEqual([e instanceof Error, e.status, e.graphCode, e.message], [true, 403, 'accessDenied', 'Access denied'], 'AC3 full body');
      _assertEqual(_graphError(500, {}).message, 'HTTP 500', 'AC3 empty body falls back to HTTP <status>');
      _assertEqual(_graphError(502, undefined).message, 'HTTP 502', 'AC3 undefined body');
      _assertEqual(_graphError(404, { error: {} }).message, 'HTTP 404', 'AC3 error without a message');
      _assertEqual(_graphError(429, null).status, 429, 'AC3 status kept on a bodiless error');
      _assertEqual(isListAccessDenied('GPInvoices', _graphError(403, {})), true, 'AC3 a built 403 is recognised as a denial');
    },
  },
  {
    name: 'N-285 denial memo — fresh, expiry, cleared by a write (_cacheInvalidate), never a cache entry',
    fn: function () {
      _deniedLists.clear();
      try {
        _assertEqual(wasListDenied('SalesForecasts'), false, 'AC5 nothing recorded');
        _deniedLists.set('SalesForecasts', Date.now());
        _assertEqual(wasListDenied('SalesForecasts'), true, 'AC5 fresh entry');
        _assertEqual(wasListDenied('GPInvoices'), false, 'AC5 per list, not global');
        _deniedLists.set('SalesForecasts', Date.now() - _CACHE_TTL_MS - 1);
        _assertEqual(wasListDenied('SalesForecasts'), false, 'AC5 expired entry is not a denial');
        _assertEqual(_deniedLists.has('SalesForecasts'), false, 'AC5 expired entry is dropped');
        _deniedLists.set('SalesForecasts', Date.now());
        _cacheInvalidate('SalesForecasts');
        _assertEqual(wasListDenied('SalesForecasts'), false, 'AC5 a write to the list clears the memo');
        _assertEqual(isDenialFresh(1000, 1000 + 30000, 30000), true, 'isDenialFresh boundary is inclusive');
        _assertEqual(isDenialFresh(1000, 1000 + 30001, 30000), false, 'isDenialFresh past the window');
        _assertEqual(isDenialFresh(undefined, 5, 30000), false, 'isDenialFresh needs a number');
        // The memo is its own store: it never touches the read cache (AC6).
        _deniedLists.set('SalesForecasts', Date.now());
        _assertEqual([..._apiCache.keys()].some(k => k.indexOf('SalesForecasts|') === 0), false, 'AC6 no _apiCache entry for a denied list');
      } finally {
        _deniedLists.clear();
      }
    },
  },
  {
    name: 'N-286 config — Salary only in PeoplePay; PeoplePay registered, restricted, tier 1 only',
    fn: function () {
      _assertEqual(CONFIG.LIST_FIELDS.People.includes('Salary'), false, 'AC1 People projection has no Salary');
      _assertEqual(CONFIG.LIST_FIELDS.PeoplePay, ['Title', 'PersonID', 'Salary'], 'AC2 PeoplePay projection');
      _assertEqual(Object.keys(FIELD_ALIASES).includes('PeoplePay'), true, 'AC2 PeoplePay registered');
      _assertEqual(Object.keys(FIELD_ALIASES.PeoplePay), [], 'AC2 PeoplePay alias is {}');
      _assertEqual(CONFIG.RESTRICTED_LISTS.includes('PeoplePay'), true, 'AC2 PeoplePay restricted');
      _assertEqual(CONFIG.CACHE.persistentLists.includes('PeoplePay'), false, 'AC2 PeoplePay never tier-2 cached');
      _assertEqual(CONFIG.DELTA.enrolledLists.includes('PeoplePay'), false, 'AC2 PeoplePay not delta-enrolled');
      _assertEqual(typeof CONFIG.PEOPLE_PAY_DENIED_TEXT === 'string' && CONFIG.PEOPLE_PAY_DENIED_TEXT.length > 0, true, 'AC10 denied copy is config');
    },
  },
  {
    name: 'N-286 attachSalaries — joins PeoplePay by PersonID, never mutates, never trusts People.Salary',
    fn: function () {
      const people = [
        { id: '1', EmployeeName: 'A', Location: 'UK', Salary: 99999 },   // stale People.Salary
        { id: '2', EmployeeName: 'B', Location: 'UK' },
        { id: '3', EmployeeName: 'C', Location: 'Spain' },
      ];
      const pay = [
        { id: '20', PersonID: 1, Salary: 50000 },
        { id: '11', PersonID: '2', Salary: 40000 },
        { id: '30', PersonID: 2, Salary: 1 },                            // duplicate, higher id
      ];
      const snapshot = JSON.stringify(people);
      const out = attachSalaries(people, pay);
      _assertEqual(out.map(p => p.Salary), [50000, 40000, undefined], 'AC4 joined by id; lowest PeoplePay id wins; missing → undefined');
      _assertEqual(out[0].EmployeeName, 'A', 'other fields pass through');
      _assertEqual(out[0] === people[0], false, 'new objects');
      _assertEqual(JSON.stringify(people), snapshot, 'inputs not mutated');
      _assertEqual(attachSalaries([], pay), [], 'empty people');
      _assertEqual(attachSalaries(people, []).every(p => p.Salary === undefined), true, 'denied PeoplePay ([]) → no salaries, People.Salary discarded');
      _assertEqual(attachSalaries([{ id: '5' }], [{ id: '1', PersonID: 5, Salary: '' }])[0].Salary, undefined, 'blank PeoplePay value → undefined');
    },
  },
  {
    name: 'N-286 planPeoplePayMigration — creates only missing rows, never overwrites, idempotent',
    fn: function () {
      const people = [
        { id: '1', EmployeeName: 'New',      Salary: 30000 },
        { id: '2', EmployeeName: 'Same',     Salary: 40000 },
        { id: '3', EmployeeName: 'Differs',  Salary: 45000 },
        { id: '4', EmployeeName: 'None',     Salary: null },
        { id: '5', EmployeeName: 'Zero',     Salary: 0 },
        { id: '6', EmployeeName: 'Blank',    Salary: '' },
        { id: '7', EmployeeName: 'Text',     Salary: 'n/a' },
        { id: '8', EmployeeName: 'StrNum',   Salary: '25000.5' },
      ];
      const pay = [
        { id: '10', PersonID: 2, Salary: 40000 },
        { id: '11', PersonID: 3, Salary: 47000 },
        { id: '12', PersonID: 9, Salary: 1 },
        { id: '13', PersonID: 9, Salary: 2 },
      ];
      const p = planPeoplePayMigration(people, pay);
      _assertEqual(p.counts, { source: 8, toCreate: 2, alreadyPresent: 1, conflicts: 1, duplicates: 1, skippedNoSalary: 4 }, 'AC11 counts');
      _assertEqual(p.toCreate, [
        { Title: '1', PersonID: 1, Salary: 30000 },
        { Title: '8', PersonID: 8, Salary: 25000.5 },
      ], 'AC11 only missing rows are created');
      _assertEqual(p.toCreate.some(r => r.PersonID === 3), false, 'AC11 a conflict is never overwritten');
      _assertEqual(p.conflicts[0].name, 'Differs', 'AC11 conflict named');
      _assertEqual(p.duplicates, [{ personId: '9', rows: 2 }], 'duplicates reported');
      const after = pay.concat(p.toCreate.map((r, i) => ({ id: String(100 + i), ...r })));
      _assertEqual(planPeoplePayMigration(people, after).counts.toCreate, 0, 'AC11 idempotent — second plan creates nothing');
      _assertEqual(planPeoplePayMigration([], []).counts.source, 0, 'empty source');
    },
  },
];
