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
    name: 'N-282 / N-296 no source reads identity from localStorage or keeps DM grants or a role in storage',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('no source map in the browser harness — run tests/run.js');
      _assertEqual(/getItem\(\s*['"]userEmail['"]/.test(ALL_SOURCES['auth.js']), false, 'auth.js must not read userEmail');
      Object.keys(ALL_SOURCES).forEach(function (f) {
        _assertEqual(/setItem\(\s*['"]userEmail['"]/.test(ALL_SOURCES[f]), false, f + ' must not write userEmail');
        _assertEqual(/(?:get|set)Item\([^)]*newton_dm_grants_/.test(ALL_SOURCES[f]), false, f + ' must not keep DM grants in storage');
        _assertEqual(/(?:get|set)Item\([^)]*newton_role_/.test(ALL_SOURCES[f]), false, f + ' must not read or write a stored role (N-296)');
      });
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
    name: 'N-276 ttfClosedCensorTimes — trailing closed run, skips, lookback, BST day (N-309: one open headcount per pipeline)',
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
      // N-309: the unit is the headcount — each pipeline gets one open headcount
      // opened on the role's OpenDate, so every N-276 t value carries over.
      const hc = roles.map(r => ({ id: 100 + r.id, RoleID: r.id, OpenDate: r.OpenDate, Status: 'Open' }));
      const out = ttfClosedCensorTimes(roles, rows, hc, new Map(), today);
      const t = Object.fromEntries(out.map(o => [o.roleId, o.t]));
      _assertEqual(t['1'], 30, 'AC4 Sourcing → Cancelled');
      _assertEqual(t['2'], 20, 'AC5 On-hold → Cancelled censored at the On-hold date');
      _assertEqual(t['3'], 15, 'AC6 currently On-hold');
      _assertEqual(Object.keys(t).filter(k => ['4', '5', '6', '7', '8', '9', '10', '11'].includes(k)), [], 'AC7 skips');
      _assertEqual(Object.keys(out[0]).sort(), ['Department', 'Location', 'Stage', 'headcountId', 'roleId', 't'], 'shape (N-309 adds headcountId)');
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
      if (typeof lintOdataFilters === 'undefined') _skip('lint-escaping.js not loaded — runs under node tests/run.js.');
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
      if (typeof lintEscaping === 'undefined') _skip('lint-escaping.js not loaded — runs under node tests/run.js.');
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
    name: 'N-285 config — RESTRICTED_LISTS is exactly the Tier 2 lists (+ PeoplePay N-286, PayrollSummaries N-300); mobile Sales is admin + leadership only',
    fn: function () {
      _assertEqual(CONFIG.RESTRICTED_LISTS.slice().sort(),
        ['AnomalyAcks', 'Diagnostics', 'GPInvoices', 'LCILocations', 'PayrollSummaries', 'PeoplePay', 'SalesForecasts', 'SurveyResponses'], 'AC1 the eight names');
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
    name: 'N-300 config — PayrollSummaries registered, restricted, tier 1 only; payroll copy is config',
    fn: function () {
      _assertEqual(CONFIG.LIST_FIELDS.PayrollSummaries, ['Title', 'Month', 'Year', 'Joiners', 'Leavers', 'BonusData'], 'AC2 PayrollSummaries projection');
      _assertEqual(Object.keys(FIELD_ALIASES).includes('PayrollSummaries'), true, 'AC2 PayrollSummaries registered');
      _assertEqual(Object.keys(FIELD_ALIASES.PayrollSummaries), [], 'AC2 PayrollSummaries alias is {}');
      _assertEqual(CONFIG.RESTRICTED_LISTS.includes('PayrollSummaries'), true, 'AC2 PayrollSummaries restricted');
      _assertEqual(CONFIG.CACHE.persistentLists.includes('PayrollSummaries'), false, 'AC2 never tier-2 cached');
      _assertEqual(CONFIG.DELTA.enrolledLists.includes('PayrollSummaries'), false, 'AC2 not delta-enrolled');
      _assertEqual(typeof CONFIG.PAYROLL_PAY_DENIED_TEXT === 'string' && CONFIG.PAYROLL_PAY_DENIED_TEXT.length > 0, true, 'AC9 denied copy is config');
      _assertEqual(CONFIG.PAYROLL_ALREADY_SENT_TEXT.includes('{period}'), true, 'AC6 already-sent copy has {period}');
    },
  },
  {
    name: 'N-300 buildPayrollSummaryFields — same key, columns and JSON shapes the flow already reads',
    fn: function () {
      const joiners = [{ name: 'A', startDate: '2026-10-01', salary: 42000 }];
      const leavers = [{ name: 'B', endDate: '2026-10-31' }];
      const f = buildPayrollSummaryFields({ month: 10, year: 2026, joiners, leavers, bonus: null });
      _assertEqual(Object.keys(f), ['Title', 'Month', 'Year', 'Joiners', 'Leavers', 'BonusData'], 'columns');
      _assertEqual(f.Title, 'payrollsummary-2026-10', 'dedupe key (same string as the old TriggerKey)');
      _assertEqual(f.Month, 'October', 'month name');
      _assertEqual(f.Year, '2026', 'year is text');
      _assertEqual(JSON.parse(f.Joiners), joiners, 'joiners round-trip, salary intact');
      _assertEqual(JSON.parse(f.Leavers), leavers, 'leavers round-trip');
      _assertEqual(f.BonusData, null, 'no bonus → null');
      const bonus = [{ name: 'A', amount: 500 }];
      _assertEqual(JSON.parse(buildPayrollSummaryFields({ month: 1, year: 2027, joiners: [], leavers: [], bonus }).BonusData), bonus, 'bonus round-trips');
      _assertEqual(buildPayrollSummaryFields({ month: 1, year: 2027, joiners: [], leavers: [], bonus }).Month, 'January', 'January boundary');
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
  // ---- N-292 (SEC-12): in-page security headers --------------------------
  {
    name: 'every page carries the canonical CSP + referrer meta ahead of any resource (N-292 — SEC-12 guard)',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const good = '<head>\n<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy" content="' + CSP_CANONICAL + '">\n<meta name="referrer" content="no-referrer">\n<script src="js/a.js"></script>\n</head>';
      // Positive controls: the lint must catch each failure shape, or the clean result below proves nothing.
      _assertEqual(lintCspMeta({ 'g.html': good }, CSP_CANONICAL, CSP_REFERRER), [], 'control: a correct page is clean');
      _assertEqual(lintCspMeta({ 'x.html': good.replace(CSP_CANONICAL, "default-src *") }, CSP_CANONICAL, CSP_REFERRER).length, 1, 'control: different policy flagged');
      _assertEqual(lintCspMeta({ 'x.html': good.replace(/<meta http-equiv[^>]*>\n/, '') }, CSP_CANONICAL, CSP_REFERRER).length, 1, 'control: missing CSP flagged');
      _assertEqual(lintCspMeta({ 'x.html': good.replace(/<meta name="referrer"[^>]*>\n/, '') }, CSP_CANONICAL, CSP_REFERRER).length, 1, 'control: missing referrer flagged');
      _assertEqual(lintCspMeta({ 'x.html': good.replace('<meta charset="UTF-8">\n', '<script src="js/early.js"></script>\n<meta charset="UTF-8">\n') }, CSP_CANONICAL, CSP_REFERRER).length >= 1, true, 'control: a script before the CSP flagged');
      _assertEqual(lintCspMeta({ 'x.html': good + good }, CSP_CANONICAL, CSP_REFERRER).length >= 2, true, 'control: duplicate metas flagged');
      _assertEqual(lintCspMeta({ 'x.html': good.replace('<meta charset="UTF-8">\n', '').replace('<script', '<meta charset="UTF-8">\n<script') }, CSP_CANONICAL, CSP_REFERRER).length >= 1, true, 'control: charset after the CSP flagged');
      _assertEqual(lintCspMeta(ALL_HTML, CSP_CANONICAL, CSP_REFERRER), [], 'root *.html CSP + referrer metas');
    },
  },
  {
    name: 'canonical CSP: required directives, exact script/connect sources, no eval / wildcard / http (N-292 — SEC-12 guard)',
    fn: function () {
      if (typeof lintCspPolicy === 'undefined') _skip('lint-csp.js not loaded — runs under node tests/run.js.');
      _assertEqual(lintCspPolicy(CSP_CANONICAL), [], 'CSP_CANONICAL shape');
      // Positive controls.
      _assertEqual(lintCspPolicy(CSP_CANONICAL + " 'unsafe-eval'").length >= 1, true, "control: 'unsafe-eval' flagged");
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("script-src 'self'", "script-src 'self' https://cdn.example.com")).length, 1, 'control: extra script host flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("img-src 'self'", "img-src *")).length >= 1, true, 'control: wildcard flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("connect-src 'self' https://graph.microsoft.com", "connect-src 'self' http://graph.microsoft.com")).length >= 1, true, 'control: plain http flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("object-src 'none'; ", '')).length, 1, 'control: missing directive flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("frame-src 'self' https://login.microsoftonline.com", "frame-src https:")).length >= 1, true, 'control: bare https: flagged');
    },
  },
  {
    name: 'CSP origins match CONFIG.SP_SITE_URL, GRAPH and CONFIG.AUTHORITY (N-292 — single source of truth)',
    fn: function () {
      if (typeof lintCspOrigins === 'undefined') _skip('lint-csp.js not loaded — runs under node tests/run.js.');
      const cfg = { spSiteUrl: CONFIG.SP_SITE_URL, graph: GRAPH, authority: CONFIG.AUTHORITY };
      _assertEqual(lintCspOrigins(CSP_CANONICAL, cfg), [], 'CSP origins vs config');
      // Positive control: a changed host in config must be caught.
      _assertEqual(lintCspOrigins(CSP_CANONICAL, { spSiteUrl: 'https://other.sharepoint.com/sites/x', graph: GRAPH, authority: CONFIG.AUTHORITY }).length, 1, 'control: SharePoint host change flagged');
      _assertEqual(lintCspOrigins(CSP_CANONICAL, { spSiteUrl: CONFIG.SP_SITE_URL, graph: 'https://graph.microsoft.us/v1.0', authority: CONFIG.AUTHORITY }).length, 1, 'control: Graph host change flagged');
    },
  },
  {
    name: 'frame-guard.js is the 2nd script on exactly the app pages (N-292 — SEC-12 guard)',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const app = '<script src="js/diag-buffer.js"></script><script src="js/frame-guard.js"></script>';
      _assertEqual(lintFrameGuardWiring({ 'a.html': app }, ['a.html'], []), [], 'control: correct app page clean');
      _assertEqual(lintFrameGuardWiring({ 'a.html': '<script src="js/diag-buffer.js"></script>' }, ['a.html'], []).length, 1, 'control: missing guard flagged');
      _assertEqual(lintFrameGuardWiring({ 'a.html': '<script src="js/frame-guard.js"></script><script src="js/diag-buffer.js"></script>' }, ['a.html'], []).length, 2, 'control: wrong order flagged');
      _assertEqual(lintFrameGuardWiring({ 's.html': app }, [], ['s.html']).length, 1, 'control: guard on a static page flagged');
      _assertEqual(lintFrameGuardWiring({ 'new.html': '' }, [], []).length, 1, 'control: unclassified new page flagged');
      _assertEqual(lintFrameGuardWiring(ALL_HTML, CSP_APP_PAGES, CSP_STATIC_PAGES), [], 'frame-guard wiring');
    },
  },
  {
    name: 'frame-guard.js behaviour — hides and breaks out only when framed cross-origin (N-292 — SEC-12)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || !ALL_SOURCES['frame-guard.js']) {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const src = ALL_SOURCES['frame-guard.js'];
      function stub(topObj) {
        const win = { location: { origin: 'https://a.example', href: 'https://a.example/newton/reporting.html' } };
        win.self = win;
        win.top = topObj === undefined ? win : topObj;
        const doc = { documentElement: { style: {} } };
        return { win: win, doc: doc };
      }
      function hostile(readable, throwOnAssign) {
        const t = { _nav: null };
        Object.defineProperty(t, 'location', {
          get: function () { if (!readable) throw new Error('SecurityError'); return { origin: readable }; },
          set: function (v) { if (throwOnAssign) throw new Error('SecurityError'); t._nav = v; },
        });
        return t;
      }
      // not framed
      let s = stub(); runFrameGuard(src, s.win, s.doc);
      _assertEqual(s.doc.documentElement.style.display, undefined, 'not framed: page untouched');
      // framed by a same-origin top (MSAL hidden iframe inside a Newton page)
      let top = { location: { origin: 'https://a.example' } };
      s = stub(top); runFrameGuard(src, s.win, s.doc);
      _assertEqual(s.doc.documentElement.style.display, undefined, 'same-origin top: page untouched');
      _assertEqual(top.location.origin, 'https://a.example', 'same-origin top: not navigated');
      // framed by a cross-origin top whose location cannot be read (the normal hostile case)
      top = hostile(null, false);
      s = stub(top); runFrameGuard(src, s.win, s.doc);
      _assertEqual(s.doc.documentElement.style.display, 'none', 'cross-origin top: page hidden');
      _assertEqual(top._nav, 'https://a.example/newton/reporting.html', 'cross-origin top: top navigated to Newton');
      // framed by a readable but different origin (control: detection is by origin, not by throwing)
      top = hostile('https://evil.example', false);
      s = stub(top); runFrameGuard(src, s.win, s.doc);
      _assertEqual(s.doc.documentElement.style.display, 'none', 'different readable origin: page hidden');
      _assertEqual(top._nav, 'https://a.example/newton/reporting.html', 'different readable origin: top navigated');
      // sandboxed frame: break-out throws - the page must STAY hidden and nothing may escape
      top = hostile(null, true);
      s = stub(top); runFrameGuard(src, s.win, s.doc);
      _assertEqual(s.doc.documentElement.style.display, 'none', 'break-out blocked: page stays hidden');
    },
  },
  {
    name: 'no eval / new Function / string timers in first-party js/ (N-292 — the CSP has no unsafe-eval)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(
        lintCodeExecution({ 'x.js': 'a();\neval("1");\n// eval("2")\nb = new Function("return 1");\nsetTimeout("go()", 5);\nsetTimeout(go, 5);\nx.isFunction(y);' }).map(v => v.line),
        [2, 4, 5],
        'control: eval / new Function / string timer flagged; comments, function timers and isFunction( are not'
      );
      _assertEqual(lintCodeExecution(ALL_SOURCES).map(v => `${v.file}:${v.line}  ${v.text}`), [], 'dynamic code execution in js/');
    },
  },
  {
    name: 'no new external https:// host in first-party js/ without a CSP decision (N-292 — SEC-12 guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(
        lintJsHosts({ 'x.js': "a = 'https://cdn.example.com/lib.js';\n// https://commented.example.com\nb = 'https://graph.microsoft.com/v1.0';" }, CSP_JS_HOST_ALLOW).map(v => v.host),
        ['cdn.example.com'],
        'control: unknown host flagged; allow-listed host and comments are not'
      );
      _assertEqual(
        lintJsHosts(ALL_SOURCES, CSP_JS_HOST_ALLOW).map(v => `${v.file}:${v.line}  ${v.host}`),
        [],
        'external hosts in js/ (decide whether the CSP needs the origin, then add it to the policy AND CSP_JS_HOST_ALLOW)'
      );
    },
  },
  {
    name: 'Secret-scan workflow is full-history, redacted, licence-free; /v2/ stays retired (N-293 — SEC-13)',
    fn: function () {
      if (typeof REPO_FILES === 'undefined') {
        _skip('Repo file scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      // Returns the list of problems with a workflow's text. [] = fine.
      const problems = (y) => {
        const p = [];
        ['fetch-depth: 0', '--redact', 'sha256sum -c', 'gitleaks git', '--exit-code 1', 'GITLEAKS_VERSION:']
          .forEach(t => { if (y.indexOf(t) === -1) p.push('missing ' + t); });
        if (!/permissions:\s*\n\s*contents:\s*read/.test(y)) p.push('permissions must be contents: read');
        if (!/^\s*push:/m.test(y) || !/^\s*workflow_dispatch:/m.test(y)) p.push('triggers must be push + workflow_dispatch');
        ['gitleaks-action', 'upload-artifact', 'GITLEAKS_LICENSE'].forEach(t => { if (y.indexOf(t) !== -1) p.push('must not contain ' + t); });
        if (/^\s*schedule\s*:/m.test(y)) p.push('must not have a schedule');
        return p;
      };
      // Control: the check really detects each class of defect.
      _assertEqual(problems('').length > 0, true, 'control: empty workflow is flagged');
      _assertEqual(problems('uses: gitleaks/gitleaks-action@v2\nfetch-depth: 0').some(m => /gitleaks-action/.test(m)), true,
        'control: the licensed action is flagged');
      _assertEqual(problems(REPO_FILES.gitleaksWorkflow), [], '.github/workflows/gitleaks.yml');
      _assertEqual(REPO_FILES.staticV2Exists, false, '.github/workflows/static-v2.yml must stay deleted (/v2/ retired 7 Oct 2026)');
      _assertEqual(/Repository and publishing/.test(REPO_FILES.readme), true, 'README.md has the "Repository and publishing" section');
    },
  },
  // ── N-305 (HC-0): centralised role-stage sets ──────────────────────────
  {
    name: 'isOpenPipelineStage: open stages true; parked, terminal false; blank true (N-305)',
    fn: function () {
      ['Planning', 'Sourcing', 'Submitted', 'Interview 1', 'Interview 2+', 'Final Interview', 'Offered']
        .forEach(s => _assertEqual(isOpenPipelineStage(s), true, s + ' is open'));
      ['Backlog', 'Closed', 'On-hold', 'Cancelled']
        .forEach(s => _assertEqual(isOpenPipelineStage(s), false, s + ' is not open'));
      // Old `!EXCLUDED.includes(r.Stage)` was true for a missing stage — preserved.
      [undefined, null, ''].forEach(s => _assertEqual(isOpenPipelineStage(s), true, JSON.stringify(s) + ' (blank) counts as open'));
    },
  },
  {
    name: 'Dashboards and Snapshots agree on "open": ACTIVE_STAGES ≡ not isOpenPipelineStage over ROLE_STAGES (N-305)',
    fn: function () {
      const notOpen = CONFIG.ROLE_STAGES.filter(s => !isOpenPipelineStage(s)).slice().sort();
      const snapshotClosed = ACTIVE_STAGES.filter(s => CONFIG.ROLE_STAGES.includes(s)).slice().sort();
      _assertEqual(notOpen, snapshotClosed, 'not-open stages vs ACTIVE_STAGES ∩ ROLE_STAGES');
    },
  },
  {
    name: 'Role-stage CONFIG sets: activity-excluded = parked ∪ terminal; every set ⊂ ROLE_STAGES (N-305)',
    fn: function () {
      const sorted = a => a.slice().sort();
      _assertEqual(sorted(CONFIG.ROLE_STAGES_ACTIVITY_EXCLUDED),
        sorted(CONFIG.ROLE_STAGES_PARKED.concat(CONFIG.ROLE_STAGE_TERMINAL)),
        'ROLE_STAGES_ACTIVITY_EXCLUDED vs PARKED ∪ TERMINAL');
      ['ROLE_STAGE_TERMINAL', 'ROLE_STAGES_PARKED', 'ROLE_STAGES_BRANCH', 'ROLE_STAGES_ACTIVITY_EXCLUDED'].forEach(k => {
        _assertEqual(CONFIG[k].filter(s => !CONFIG.ROLE_STAGES.includes(s)), [], k + ' values not in ROLE_STAGES');
      });
    },
  },
  {
    name: 'no page file redeclares a role-stage array (N-305 — lint-stage-arrays guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const found = lintStageArrays(ALL_SOURCES, ALL_HTML, stageArrayVocab(CONFIG), STAGE_ARRAY_ALLOW);
      _assertEqual(
        found.map(v => `${v.file}:${v.line}  ${v.text}`),
        [],
        'role-stage arrays outside config.js (use CONFIG.ROLE_STAGE* sets or isOpenPipelineStage())'
      );
    },
  },
  {
    name: 'lint-stage-arrays control: flags stage arrays, ignores mixed/single, catches a stale allow entry (N-305)',
    fn: function () {
      const vocab = stageArrayVocab(CONFIG);
      const lint = (src, html, allow) => lintStageArrays(src, html || {}, vocab, allow || [])
        .map(v => `${v.file}:${v.line}`);
      _assertEqual(lint({ 'a.js': "x();\nconst X = ['Backlog','Hired'];\n" }), ['a.js:2'], 'single-line, single-quoted');
      _assertEqual(lint({ 'b.js': 'const Y = [\n  "Backlog", "Planning",\n  // note\n  "Hired"\n];\n' }), ['b.js:1'], 'multi-line, double-quoted, with comment');
      _assertEqual(lint({ 'c.js': "f(['Closed', 'Cancelled']);\n" }), ['c.js:1'], "'Closed' is a live stage (N-306)");
      _assertEqual(lint({ 'd.js': "const L = ['Outreach','Submitted','Hired'];\nconst s = ['Hired'];\n" }), [], 'mixed array and single stage are not stage sets');
      _assertEqual(lint({ 'config.js': "const CONFIG = { S: ['Backlog','Hired'] };\n" }), [], 'config.js is the home of stage sets');
      _assertEqual(lint({}, { 'p.html': '<script src="x.js"></script>\n<script>\nconst Z = ["Hired","Cancelled"];\n</script>\n' }), ['p.html:3'], 'inline <script> in HTML');
      _assertEqual(lint({ 'analytics.js': "const ACTIVE_STAGES = ['Hired','Backlog'];\n" }, {}, [{ file: 'analytics.js', name: 'ACTIVE_STAGES' }]), [], 'allow-listed declaration');
      _assertEqual(lint({ 'e.js': 'x();\n' }, {}, [{ file: 'e.js', name: 'GONE' }]), ['e.js:0'], 'stale allow entry is reported');
    },
  },
  // ── N-306 (HC-1): headcount model + Hired → Closed ────────────────────
  {
    name: 'N-306 CONFIG: Closed replaces Hired; legacy alias, headcount + migration config; projections and index targets',
    fn: function () {
      _assertEqual(CONFIG.ROLE_STAGES.includes('Hired'), false, 'Hired is no longer a live stage');
      _assertEqual(CONFIG.ROLE_STAGES.indexOf('Closed'), CONFIG.ROLE_STAGES.indexOf('Offered') + 1, 'Closed sits right after Offered');
      _assertEqual(CONFIG.ROLE_STAGE_CLOSED, 'Closed', 'ROLE_STAGE_CLOSED');
      _assertEqual(CONFIG.ROLE_STAGE_TERMINAL, ['Closed', 'Cancelled'], 'ROLE_STAGE_TERMINAL');
      _assertEqual(CONFIG.ROLE_STAGE_LEGACY_ALIASES, { Hired: 'Closed' }, 'ROLE_STAGE_LEGACY_ALIASES');
      Object.keys(CONFIG.ROLE_STAGE_LEGACY_ALIASES).forEach(k => {
        _assertEqual(CONFIG.ROLE_STAGES.includes(k), false, k + ' (legacy) is not a live stage');
        _assertEqual(CONFIG.ROLE_STAGES.includes(CONFIG.ROLE_STAGE_LEGACY_ALIASES[k]), true, k + ' maps to a live stage');
      });
      _assertEqual([CONFIG.HEADCOUNT.STATUS_OPEN, CONFIG.HEADCOUNT.STATUS_CANCELLED], ['Open', 'Cancelled'], 'headcount statuses');
      _assertEqual(Number.isInteger(CONFIG.HEADCOUNT_MIGRATION.writeConcurrency) && CONFIG.HEADCOUNT_MIGRATION.writeConcurrency > 0, true, 'migration writeConcurrency');
      _assertEqual(CONFIG.LIST_FIELDS.Placements.includes('HeadcountID'), true, 'Placements projects HeadcountID');
      _assertEqual(CONFIG.LIST_FIELDS.RoleHeadcount,
        ['Title', 'RoleID', 'ProjectID', 'Sequence', 'OpenDate', 'TargetHireDate', 'Backfill', 'Notes', 'Status', 'CancelledDate'],
        'RoleHeadcount projection');
      _assertEqual(FIELD_ALIASES.RoleHeadcount, {}, 'RoleHeadcount registers as {} (no alias)');
      const idx = CONFIG.INDEX_TARGETS.map(t => t.list + '.' + t.column);
      ['RoleHeadcount.RoleID', 'RoleHeadcount.ProjectID', 'Placements.HeadcountID']
        .forEach(k => _assertEqual(idx.includes(k), true, k + ' in INDEX_TARGETS'));
      _assertEqual(CONFIG.CACHE.persistentLists.includes('RoleHeadcount'), false, 'RoleHeadcount is transactional — never tier 2');
      _assertEqual(CONFIG.DELTA.enrolledLists.includes('RoleHeadcount'), false, 'RoleHeadcount not delta-enrolled');
      _assertEqual(CONFIG.RESTRICTED_LISTS.includes('RoleHeadcount'), false, 'RoleHeadcount is not restricted (Tier 4)');
    },
  },
  {
    name: 'N-306 normaliseRoleStage / normaliseRoleHistoryRows — Hired reads as Closed; Stage rows only; input never mutated',
    fn: function () {
      _assertEqual(normaliseRoleStage('Hired'), 'Closed', 'Hired → Closed');
      _assertEqual(normaliseRoleStage('Closed'), 'Closed', 'Closed unchanged');
      _assertEqual(normaliseRoleStage('Sourcing'), 'Sourcing', 'Sourcing unchanged');
      _assertEqual(normaliseRoleStage(undefined), undefined, 'undefined unchanged');
      _assertEqual(normaliseRoleStage(null), null, 'null unchanged');
      _assertEqual(normaliseRoleStage('toString'), 'toString', 'prototype keys are not aliases');
      const rows = [
        { id: 1, Field: 'Stage', OldValue: 'Offered', NewValue: 'Hired' },
        { id: 2, Field: 'Stage', OldValue: 'Hired', NewValue: 'Sourcing' },
        { id: 3, Field: 'Stage', OldValue: null, NewValue: 'Planning' },
        { id: 4, Field: 'Notes', OldValue: 'Hired', NewValue: 'Hired' },
      ];
      const before = JSON.stringify(rows);
      const out = normaliseRoleHistoryRows(rows);
      _assertEqual(JSON.stringify(rows), before, 'input not mutated');
      _assertEqual(out.map(r => [r.OldValue, r.NewValue]),
        [['Offered', 'Closed'], ['Closed', 'Sourcing'], [null, 'Planning'], ['Hired', 'Hired']], 'mapped values');
      _assertEqual(out[2] === rows[2] && out[3] === rows[3], true, 'unchanged rows are passed through as-is');
      _assertEqual(normaliseRoleHistoryRows(null), [], 'null → []');
    },
  },
  {
    name: 'N-306 headcount classification: filled is derived from placements; counts are D-5 x/y',
    fn: function () {
      const hc = [
        { id: '1', Status: 'Open' },                                     // open (no placement)
        { id: '2', Status: 'Open', OpenDate: '2026-01-05T12:00:00Z' },   // filled
        { id: '3', Status: 'Cancelled' },                                // cancelled
        { id: '4', Status: 'Cancelled' },                                // cancelled, but a placement links it → filled
      ];
      const fill = headcountFillMap([
        { id: 'p1', HeadcountID: 2 }, { id: 'p2', HeadcountID: '4' }, { id: 'p3', HeadcountID: '' }, { id: 'p4' }, null,
      ]);
      _assertEqual([...fill.keys()].sort(), ['2', '4'], 'fill map skips blank ids; number and string ids both key as strings');
      _assertEqual(hc.map(h => classifyHeadcount(h, fill)), ['open', 'filled', 'cancelled', 'filled'], 'classification');
      _assertEqual(headcountCounts(hc, fill), { open: 1, filled: 2, cancelled: 1, total: 3 }, 'counts (total = open + filled)');
      _assertEqual(headcountCounts([], fill), { open: 0, filled: 0, cancelled: 0, total: 0 }, 'empty');
    },
  },
  {
    name: 'N-306 orderOpenHeadcount (D-5)',
    fn: function () {
      const hc = [
        { id: '10', Sequence: 1, Status: 'Open', OpenDate: '2026-03-01T12:00:00Z' },
        { id: '11', Sequence: 2, Status: 'Open' },                                     // not opened → last
        { id: '12', Sequence: 3, Status: 'Open', OpenDate: '2026-02-01T12:00:00Z' },
        { id: '13', Sequence: 4, Status: 'Open', OpenDate: '2026-02-01T12:00:00Z' },   // tie → Sequence
        { id: '14', Sequence: 5, Status: 'Cancelled', OpenDate: '2026-01-01T12:00:00Z' },
        { id: '15', Sequence: 6, Status: 'Open', OpenDate: '2026-01-01T12:00:00Z' },   // filled → excluded
      ];
      const fill = headcountFillMap([{ id: 'p', HeadcountID: 15 }]);
      _assertEqual(orderOpenHeadcount(hc, fill).map(h => h.id), ['12', '13', '10', '11'], 'OpenDate asc, tie by Sequence, no OpenDate last');
      // N-308: defaultHeadcountForPlacement (transitional) removed — the
      // placement picker (placementHeadcountGroups) replaces it.
    },
  },
  {
    name: 'N-306 earliestHeadcountOpenDate / nextHeadcountSequence / headcountLabel',
    fn: function () {
      _assertEqual(earliestHeadcountOpenDate([
        { OpenDate: '2026-05-01T12:00:00Z' }, { OpenDate: '2026-04-02T12:00:00Z', Status: 'Cancelled' }, { OpenDate: '' }, {},
      ]), '2026-04-02', 'min day, cancelled included, blanks ignored');
      _assertEqual(earliestHeadcountOpenDate([{}, { OpenDate: null }]), null, 'all blank → null');
      _assertEqual(earliestHeadcountOpenDate([]), null, 'none → null');
      // Day = spDateIn() string slice — the same day rule every Roles.OpenDate
      // reader uses (roleStageEntryDay, the timeline); no Date, no local getter.
      _assertEqual(earliestHeadcountOpenDate([{ OpenDate: '2026-06-30T23:00:00Z' }]), '2026-06-30', 'spDateIn day');
      _assertEqual(nextHeadcountSequence([]), 1, 'first');
      _assertEqual(nextHeadcountSequence([{ Sequence: 1 }, { Sequence: '3' }, { Sequence: null }]), 4, 'max + 1, never reused');
      _assertEqual(headcountLabel(2), 'Headcount 2', 'label');
    },
  },
  {
    name: 'N-306 planHeadcountMigration — 1:1 create, cancelled, links, rename, reports; idempotent',
    fn: function () {
      const roles = [
        { id: '1', RoleTitle: 'A', Stage: 'Sourcing', ProjectIDLookupId: 5, OpenDate: '2026-02-01T12:00:00Z', TargetHireDate: '2026-03-18T12:00:00Z', Backfill: true },
        { id: '2', RoleTitle: 'B', Stage: 'Cancelled', ProjectIDLookupId: 5 },   // cancelled, no placement, known day
        { id: '3', RoleTitle: 'C', Stage: 'Cancelled', ProjectIDLookupId: 5 },   // cancelled, no placement, unknown day
        { id: '4', RoleTitle: 'D', Stage: 'Cancelled', ProjectIDLookupId: 5 },   // cancelled WITH a placement → Open
        { id: '5', RoleTitle: 'E', Stage: 'Hired', ProjectIDLookupId: 6, OpenDate: '2026-01-10T12:00:00Z' },  // create + link + rename
        { id: '6', RoleTitle: 'F', Stage: 'Offered', ProjectIDLookupId: 6 },     // 1 existing headcount, 2 unlinked
        { id: '7', RoleTitle: 'G', Stage: 'Offered', ProjectIDLookupId: 6 },     // 2 headcount → ambiguous
        { id: '8', RoleTitle: 'H', Stage: 'Hired', ProjectIDLookupId: 6 },       // closed, no placement
      ];
      const headcount = [
        { id: '60', RoleID: 6, ProjectID: 6, Sequence: 1, Status: 'Open' },
        { id: '70', RoleID: '7', ProjectID: 6, Sequence: 1, Status: 'Open' },
        { id: '71', RoleID: 7, ProjectID: 6, Sequence: 2, Status: 'Open' },
      ];
      const placements = [
        { id: '400', RoleIDLookupId: 4 },
        { id: '500', RoleIDLookupId: '5' },
        { id: '600', RoleIDLookupId: 6 }, { id: '601', RoleIDLookupId: 6 },
        { id: '700', RoleIDLookupId: 7 },
        { id: '900', RoleIDLookupId: 99, CandidateName: 'Orphan' },
      ];
      const coeRows = [{ id: 'c1', Title: 'Plan row', LinkedRoleID: 5 }, { id: 'c2', LinkedRoleID: null }];
      const days = { '2': '2026-04-03' };
      const p = planHeadcountMigration({ roles, headcount, placements, cancelledDayByRole: days, coeRows });
      const item = id => p.items.find(i => String(i.role.id) === id);
      const c1 = item('1').create;
      _assertEqual([c1.Title, c1.RoleID, c1.ProjectID, c1.Sequence, c1.OpenDate, c1.TargetHireDate, c1.Backfill, c1.Status, c1.CancelledDate],
        ['Headcount 1', 1, 5, 1, '2026-02-01T12:00:00Z', '2026-03-18T12:00:00Z', true, 'Open', undefined], "role 1: create with the role's own dates");
      _assertEqual([item('2').create.Status, item('2').create.CancelledDate], ['Cancelled', '2026-04-03T12:00:00Z'], 'role 2: cancelled with known day');
      _assertEqual([item('3').create.Status, item('3').create.CancelledDate], ['Cancelled', undefined], 'role 3: cancelled, day unknown');
      _assertEqual([item('4').create.Status, item('4').linkPlacementIds], ['Open', [400]], 'role 4: has a placement → Open, linked');
      _assertEqual([!!item('5').create, item('5').linkPlacementIds, item('5').renameStage], [true, [500], true], 'role 5: create + link + rename');
      _assertEqual([item('6').create, item('6').headcountId, item('6').linkPlacementIds], [null, 60, [600, 601]], 'role 6: link to its single existing headcount');
      _assertEqual(item('7'), undefined, 'role 7: nothing written (ambiguous)');
      _assertEqual(p.ambiguous.map(a => [String(a.role.id), a.placementIds]), [['7', [700]]], 'ambiguous reported');
      _assertEqual(p.orphanPlacements.map(o => o.id), ['900'], 'orphan reported');
      _assertEqual(p.closedNoPlacement.map(r => r.id), ['8'], 'closed with no placement reported');
      _assertEqual(p.coeLinkedRows, [{ id: 'c1', title: 'Plan row', roleId: '5' }], 'CoE linked rows reported');
      _assertEqual(p.counts, {
        roles: 8, alreadyHaveHeadcount: 2, toCreate: 6, toCreateCancelled: 2, toLink: 4, toRename: 2,
        ambiguous: 1, orphanPlacements: 1, closedNoPlacement: 1, coeLinkedRows: 1,
      }, 'counts');

      // Simulate the write, then re-plan: nothing left to do.
      let next = 1000;
      const hc2 = headcount.slice(), pl2 = placements.map(x => ({ ...x })), roles2 = roles.map(r => ({ ...r }));
      p.items.forEach(it => {
        let id = it.headcountId;
        if (it.create) { id = next++; hc2.push({ ...it.create, id: String(id) }); }
        it.linkPlacementIds.forEach(pid => { pl2.find(x => Number(x.id) === pid).HeadcountID = id; });
        if (it.renameStage) roles2.find(r => r.id === it.role.id).Stage = normaliseRoleStage(it.role.Stage);
      });
      const again = planHeadcountMigration({ roles: roles2, headcount: hc2, placements: pl2, cancelledDayByRole: days, coeRows });
      _assertEqual(again.items, [], 'second run: items = []');
      _assertEqual([again.counts.toCreate, again.counts.toLink, again.counts.toRename], [0, 0, 0], 'second run: nothing to write');
    },
  },
  {
    name: 'N-306 checkHeadcountIntegrity — each probe fires on its own fixture; a clean set reads all zero',
    fn: function () {
      const KEYS = ['placementNoHeadcount', 'placementHeadcountMismatch', 'roleNoHeadcount', 'closedWithOpen',
        'openPipelineNoOpen', 'openDateDrift', 'headcountProjectMismatch', 'legacyStage'];
      const counts = d => checkHeadcountIntegrity(d).map(c => c.count);
      const only = key => KEYS.map(k => (k === key ? 1 : 0));
      // Clean: an open pipeline with one open headcount; a closed pipeline whose one headcount is filled.
      const clean = () => ({
        roles: [
          { id: '1', Stage: 'Sourcing', ProjectIDLookupId: 5, OpenDate: '2026-02-01T12:00:00Z' },
          { id: '2', Stage: 'Closed', ProjectIDLookupId: 5 },
        ],
        headcount: [
          { id: '10', RoleID: 1, ProjectID: 5, Sequence: 1, Status: 'Open', OpenDate: '2026-02-01T12:00:00Z' },
          { id: '20', RoleID: 2, ProjectID: '5', Sequence: 1, Status: 'Open' },
        ],
        placements: [{ id: 'p', RoleIDLookupId: 2, HeadcountID: 20 }],
      });
      _assertEqual(checkHeadcountIntegrity(clean()).map(c => c.key), KEYS, 'check order');
      _assertEqual(counts(clean()), KEYS.map(() => 0), 'clean → all zero');
      let d;
      d = clean(); d.placements.push({ id: 'q', RoleIDLookupId: 2, HeadcountID: '' });
      _assertEqual(counts(d), only('placementNoHeadcount'), 'placement with no HeadcountID');
      d = clean(); d.placements.push({ id: 'r', RoleIDLookupId: 2, HeadcountID: 999 });
      _assertEqual(counts(d), only('placementHeadcountMismatch'), 'placement linked to a headcount that does not exist');
      d = clean(); d.roles.push({ id: '3', Stage: 'Backlog', ProjectIDLookupId: 5 });
      _assertEqual(counts(d), only('roleNoHeadcount'), 'role with no headcount');
      d = clean(); d.headcount.push({ id: '22', RoleID: 2, ProjectID: 5, Sequence: 2, Status: 'Open' });
      _assertEqual(counts(d), only('closedWithOpen'), 'closed pipeline with an open headcount');
      d = clean(); d.headcount[0].Status = 'Cancelled';
      _assertEqual(counts(d), only('openPipelineNoOpen'), 'open pipeline with no open headcount');
      d = clean(); d.roles[0].OpenDate = '2026-01-15T12:00:00Z';
      _assertEqual(counts(d), only('openDateDrift'), 'Roles.OpenDate ≠ earliest headcount OpenDate');
      d = clean(); d.headcount[0].ProjectID = 9;
      _assertEqual(counts(d), only('headcountProjectMismatch'), 'headcount on another project');
      d = clean(); d.roles[0].Stage = 'Hired';
      _assertEqual(counts(d), only('legacyStage'), 'role still at Hired');
      // Another role's headcount also counts as a mismatch.
      d = clean(); d.headcount.push({ id: '11', RoleID: 1, ProjectID: 5, Sequence: 2, Status: 'Open', OpenDate: '2026-03-01T12:00:00Z' });
      d.placements.push({ id: 's', RoleIDLookupId: 2, HeadcountID: 11 });
      _assertEqual(counts(d), only('placementHeadcountMismatch'), "placement linked to another role's headcount");
      _assertEqual(checkHeadcountIntegrity({}).map(c => c.count), KEYS.map(() => 0), 'no data → all zero');
    },
  },
  {
    name: 'N-306 headcount writes only via api.js helpers (lint-headcount-writes guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintHeadcountWrites(ALL_SOURCES).map(v => `${v.file}:${v.line}  ${v.text}`), [],
        'raw RoleHeadcount writes outside api.js (use createHeadcount / updateHeadcount / cancelHeadcount)');
    },
  },
  {
    name: 'lint-headcount-writes control: flags raw writes outside api.js, ignores reads and api.js (N-306)',
    fn: function () {
      const lint = src => lintHeadcountWrites(src).map(v => `${v.file}:${v.line}`);
      _assertEqual(lint({ 'pages.js': "x();\nawait createItem('RoleHeadcount', f);\nupdateItem( \"RoleHeadcount\", 1, f);\n" }),
        ['pages.js:2', 'pages.js:3'], 'create + update flagged');
      _assertEqual(lint({ 'forms.js': 'deleteItem(`RoleHeadcount`, 3);\n' }), ['forms.js:1'], 'delete, backtick');
      _assertEqual(lint({ 'api.js': "createItem('RoleHeadcount', f);\n" }), [], 'api.js is the home of headcount writes');
      _assertEqual(lint({ 'pages.js': "getItems('RoleHeadcount');\ncreateItem('RoleHistory', f);\n" }), [], 'reads and other lists not flagged');
    },
  },
  {
    name: 'N-306 stageArrayVocab keeps the retired Hired, plus Closed and Placed',
    fn: function () {
      const v = stageArrayVocab(CONFIG);
      ['Hired', 'Closed', 'Placed'].forEach(s => _assertEqual(v.includes(s), true, s + ' in the vocabulary'));
    },
  },
  {
    name: 'N-307 headcountSummary / headcountXY / headcountXYTitle',
    fn: function () {
      const hc = [
        { id: '1', RoleID: 7, Sequence: 1, Status: 'Open', OpenDate: '2026-05-10T12:00:00Z' },
        { id: '2', RoleID: 7, Sequence: 2, Status: 'Open' },                                   // open, undated
        { id: '3', RoleID: 7, Sequence: 3, Status: 'Open', OpenDate: '2026-01-01T12:00:00Z' }, // filled
        { id: '4', RoleID: 7, Sequence: 4, Status: 'Cancelled', OpenDate: '2025-12-01T12:00:00Z' },
        { id: '5', RoleID: 7, Sequence: 5, Status: 'Open', OpenDate: '2026-04-02T12:00:00Z' },
      ];
      const fill = headcountFillMap([{ id: 'p1', HeadcountID: '3' }]);
      const sm = headcountSummary(hc, fill);
      _assertEqual(sm.counts, { open: 3, filled: 1, cancelled: 1, total: 4 }, 'counts');
      _assertEqual(sm.oldestOpenDay, '2026-04-02', 'oldest OPEN dated headcount — filled / cancelled / undated ignored');
      _assertEqual(headcountSummary([{ id: '9', Status: 'Open' }], new Map()).oldestOpenDay, null, 'all undated → null');
      _assertEqual(headcountXY(sm.counts), '3/4', 'x/y = open / (open + filled)');
      _assertEqual(headcountXY(headcountCounts([], new Map())), '—', 'nothing to count → dash');
      _assertEqual(headcountXYTitle(sm.counts), '3 open of 4 · 1 filled · 1 cancelled', 'title breakdown');
      _assertEqual([...groupHeadcountByRole(hc).keys()], ['7'], 'grouped by String(RoleID)');
    },
  },
  {
    name: 'N-307 roleStageChangeRule (D-1, D-2, S-2)',
    fn: function () {
      const c = open => ({ open, filled: 0, cancelled: 0, total: open });
      const r = (from, to, open) => roleStageChangeRule({ fromStage: from, toStage: to, counts: c(open) });
      _assertEqual(r('Offered', 'Closed', 1).ok, false, 'Closed blocked while headcount open');
      _assertEqual(/1 headcount still open/.test(r('Offered', 'Closed', 1).reason), true, 'reason names the count');
      _assertEqual(r('Offered', 'Closed', 0).ok, true, 'Closed allowed with none open');
      _assertEqual(r('Sourcing', 'Cancelled', 2), { ok: true, reason: '', cascadeCancel: true }, 'Cancelled cascades open headcount');
      _assertEqual(r('Sourcing', 'Cancelled', 0).cascadeCancel, false, 'nothing to cascade');
      _assertEqual(r('Closed', 'Sourcing', 0).ok, false, 'open stage refused with 0 open');
      _assertEqual(r('Closed', 'Sourcing', 1).ok, true, 'open stage allowed with 1 open');
      _assertEqual(r('Sourcing', 'Backlog', 0).ok, true, 'parked stage allowed with 0 open');
      _assertEqual(r('Interview 1', 'Interview 1', 0).ok, true, 'same stage always ok');
      _assertEqual(r('Hired', 'Closed', 3).ok, true, "legacy 'Hired' normalises to Closed → same stage");
    },
  },
  {
    name: 'N-307 pipelineAfterLastOpen (S-5)',
    fn: function () {
      _assertEqual(pipelineAfterLastOpen({ open: 0, filled: 1, cancelled: 0, total: 1 }), 'close', 'a fill → offer Close');
      _assertEqual(pipelineAfterLastOpen({ open: 0, filled: 0, cancelled: 2, total: 0 }), 'cancel', 'no fill → offer Cancel');
      _assertEqual(pipelineAfterLastOpen({ open: 1, filled: 1, cancelled: 0, total: 2 }), null, 'still open → nothing');
      _assertEqual(pipelineAfterLastOpen({ open: 0, filled: 0, cancelled: 0, total: 0 }), null, 'no headcount at all → nothing');
    },
  },
  {
    name: 'N-307 defaultTargetHireDate follows ANALYTICS_BENCHMARKS.timeToHireDays',
    fn: function () {
      const n = CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays;
      _assertEqual(defaultTargetHireDate('2026-10-08'), addDaysISO('2026-10-08', n), 'Open + configured days');
      _assertEqual(addDaysISO('2026-10-08', 45), '2026-11-22', 'arithmetic control: 8 Oct + 45d = 22 Nov');
      _assertEqual(defaultTargetHireDate('2026-12-20'), addDaysISO('2026-12-20', n), 'year rollover');
      _assertEqual(addDaysISO('2026-12-20', 45), '2027-02-03', 'rollover arithmetic control');
      _assertEqual(defaultTargetHireDate(''), null, 'blank → null');
      _assertEqual(defaultTargetHireDate(null), null, 'null → null');
    },
  },
  {
    name: 'N-307 reopenStageOptions / HEADCOUNT.reopenStage / clampHeadcountCount',
    fn: function () {
      const opts = reopenStageOptions();
      CONFIG.ROLE_STAGE_TERMINAL.forEach(s => _assertEqual(opts.includes(s), false, s + ' excluded'));
      _assertEqual(opts, CONFIG.ROLE_STAGES.filter(s => opts.includes(s)), 'ROLE_STAGES order kept');
      _assertEqual(opts.length, CONFIG.ROLE_STAGES.length - CONFIG.ROLE_STAGE_TERMINAL.length, 'only terminal stages dropped');
      _assertEqual(CONFIG.ROLE_STAGES.includes(CONFIG.HEADCOUNT.reopenStage), true, 'reopenStage is a stage');
      _assertEqual(isOpenPipelineStage(CONFIG.HEADCOUNT.reopenStage), true, 'reopenStage is an open-pipeline stage');
      const max = CONFIG.HEADCOUNT.maxPerAdd;
      _assertEqual([clampHeadcountCount(''), clampHeadcountCount('0'), clampHeadcountCount('3'),
        clampHeadcountCount('999'), clampHeadcountCount('2.7'), clampHeadcountCount(undefined)],
        [1, 1, 3, max, 2, 1], 'clamped to 1..maxPerAdd');
    },
  },
  {
    name: 'N-308 placementHeadcountGroups (S-1, S-2, S-4)',
    fn: function () {
      const roles = [
        { id: 1, RoleTitle: 'Zeta Engineer', Location: 'Lisbon', Stage: 'Sourcing' },
        { id: 2, RoleTitle: 'Alpha Analyst', Stage: 'On-hold' },
        { id: 3, RoleTitle: 'Mid Designer', Stage: 'Closed' },
        { id: 4, RoleTitle: 'Beta PM', Stage: 'Interview 1' },
      ];
      const headcount = [
        { id: 10, RoleID: 1, Sequence: 1, Status: 'Open' },                                  // undated → last
        { id: 11, RoleID: 1, Sequence: 2, Status: 'Open', OpenDate: '2026-09-03T12:00:00Z' },
        { id: 12, RoleID: 1, Sequence: 3, Status: 'Open', OpenDate: '2026-08-01T12:00:00Z' }, // filled
        { id: 13, RoleID: 1, Sequence: 4, Status: 'Cancelled' },
        { id: 20, RoleID: 2, Sequence: 1, Status: 'Open' },                                  // On-hold pipeline
        { id: 30, RoleID: 3, Sequence: 1, Status: 'Open', OpenDate: '2026-07-01T12:00:00Z' }, // filled by the edited placement
        { id: 40, RoleID: 4, Sequence: 1, Status: 'Open', OpenDate: '2026-06-01T12:00:00Z', Backfill: true },
        { id: 99, RoleID: 77, Sequence: 1, Status: 'Open' },                                 // role not in scope
      ];
      const placements = [{ id: 'p1', HeadcountID: 12 }, { id: 'p2', HeadcountID: 30 }];
      const g = placementHeadcountGroups({ roles, headcount, placements });
      _assertEqual(g.map(x => x.roleLabel), ['Beta PM', 'Zeta Engineer (Lisbon)'], 'open-stage pipelines only, alphabetical; On-hold/Closed/out-of-scope absent');
      _assertEqual(g[1].options.map(o => o.id), [11, 10], 'Zeta: dated open first, undated last; filled and cancelled excluded');
      _assertEqual(g[1].options.every(o => o.roleId === 1 && o.current === false), true, 'option carries roleId, not current');
      const e = placementHeadcountGroups({ roles, headcount, placements, currentHeadcountId: 30, excludePlacementId: 'p2' });
      const mid = e.find(x => x.roleId === 3);
      _assertEqual(mid && mid.options.map(o => [o.id, o.current]), [[30, true]], 'Closed pipeline listed only for the current headcount, marked current');
      _assertEqual(e.map(x => x.roleLabel), ['Beta PM', 'Mid Designer', 'Zeta Engineer (Lisbon)'], 'still alphabetical');
      const ex = placementHeadcountGroups({ roles, headcount, placements, excludePlacementId: 'p1' });
      _assertEqual(ex.find(x => x.roleId === 1).options.map(o => o.id), [12, 11, 10], 'excluding the filling placement re-opens its headcount');
      const cur = placementHeadcountGroups({ roles, headcount, placements, currentHeadcountId: 12 });
      _assertEqual(cur.find(x => x.roleId === 1).options.map(o => [o.id, o.current]), [[12, true], [11, false], [10, false]], 'a filled current headcount is prepended');
      _assertEqual(placementHeadcountGroups({ roles: [], headcount, placements }), [], 'no roles → no groups');
      _assertEqual(placementPreselectHeadcountId(g, 1), 11, 'preselect = first option of the role');
      _assertEqual(placementPreselectHeadcountId(g, 2), null, 'role with no group → null');
      _assertEqual(placementPreselectHeadcountId(g, null), null, 'no role → null');
    },
  },
  {
    name: 'N-308 placementHeadcountOptionLabel / placementHeadcountOptionsHtml',
    fn: function () {
      _assertEqual(placementHeadcountOptionLabel({ Title: 'Headcount 2', OpenDate: '2026-09-03T12:00:00Z' }), 'Headcount 2 · opened 2026-09-03', 'dated');
      _assertEqual(placementHeadcountOptionLabel({ Sequence: 3 }), 'Headcount 3 · not opened', 'undated; title falls back to the label template');
      _assertEqual(placementHeadcountOptionLabel({ Title: 'Headcount 1', Backfill: true }, { current: true }), 'Headcount 1 · not opened · Backfill · current', 'suffixes');
      _assertEqual(placementHeadcountOptionLabel({ Title: 'Headcount 1', OpenDate: '2026-08-31T23:00:00Z' }), 'Headcount 1 · opened 2026-08-31', 'spDateIn day rule (string slice)');
      const groups = [
        { roleId: 1, roleLabel: 'A <b>"&\'', options: [{ id: 5, roleId: 1, label: 'Headcount 1 · <x>', current: false }, { id: 6, roleId: 1, label: 'Headcount 2', current: false }] },
        { roleId: 2, roleLabel: 'B', options: [{ id: 7, roleId: 2, label: 'Headcount 1', current: false }] },
      ];
      const html = placementHeadcountOptionsHtml(groups, 6);
      _assertEqual((html.match(/ selected/g) || []).length, 1, 'exactly one selected');
      _assertEqual(/<option value="6" data-role-id="1" selected>/.test(html), true, 'selected id marked, with its role id');
      _assertEqual(html.indexOf('<b>'), -1, 'optgroup label escaped');
      _assertEqual(html.indexOf('<x>'), -1, 'option text escaped');
      _assertEqual((html.match(/<optgroup /g) || []).length, 2, 'one optgroup per pipeline');
      _assertEqual(html.indexOf('<option value="">-- Select headcount --</option>'), 0, 'placeholder first');
      _assertEqual((placementHeadcountOptionsHtml(groups, null).match(/ selected/g) || []).length, 0, 'no selection');
      _assertEqual(placementHeadcountOptionsHtml([], null), '<option value="">-- No open headcount — add headcount on the role page --</option>', 'empty state');
    },
  },
  {
    name: 'N-308 validatePlacementHeadcount (S-3)',
    fn: function () {
      const open = { id: 1, Status: 'Open' }, cancelled = { id: 2, Status: 'Cancelled' }, filled = { id: 3, Status: 'Open' };
      const state = { placements: [{ id: 'p9', HeadcountID: 3 }] };
      _assertEqual(validatePlacementHeadcount({ headcount: null, state }).ok, false, 'missing → refused');
      _assertEqual(validatePlacementHeadcount({ headcount: open, state }), { ok: true, reason: '' }, 'open → ok');
      const f = validatePlacementHeadcount({ headcount: filled, state });
      _assertEqual([f.ok, /filled/.test(f.reason)], [false, true], 'filled → refused with reason');
      const c = validatePlacementHeadcount({ headcount: cancelled, state });
      _assertEqual([c.ok, /cancelled/.test(c.reason)], [false, true], 'cancelled → refused with reason');
      _assertEqual(validatePlacementHeadcount({ headcount: filled, state, excludePlacementId: 'p9' }).ok, true, 'filled only by the edited placement → ok');
      _assertEqual(validatePlacementHeadcount({ headcount: filled, state, currentHeadcountId: '3' }).ok, true, 'edit keeping its own headcount → ok');
      _assertEqual(validatePlacementHeadcount({ headcount: cancelled, state, currentHeadcountId: 2 }).ok, true, 'current headcount ok even if cancelled since');
    },
  },
  {
    name: 'N-308 placementTimeToHire (day maths, BST-safe)',
    fn: function () {
      _assertEqual(placementTimeToHire('2026-09-01T12:00:00Z', '2026-09-15T12:00:00Z'), 14, 'two weeks');
      _assertEqual(placementTimeToHire('2026-08-31T23:00:00Z', '2026-09-15T12:00:00Z'), 15, 'BST-stored open reads as 31 Aug');
      _assertEqual(placementTimeToHire('2026-12-20T12:00:00Z', '2027-01-03T12:00:00Z'), 14, 'year rollover');
      _assertEqual(placementTimeToHire('2026-02-27T12:00:00Z', '2026-03-02T12:00:00Z'), 3, 'month rollover (non-leap Feb)');
      _assertEqual(placementTimeToHire(null, '2026-09-15T12:00:00Z'), null, 'not opened → null');
      _assertEqual(placementTimeToHire('2026-09-01T12:00:00Z', undefined), null, 'no offer date → null');
    },
  },
  {
    name: 'N-308 placementFollowUp (D-2 close / stage prompt)',
    fn: function () {
      _assertEqual(placementFollowUp({ stage: 'Offered', counts: { open: 0, filled: 2, cancelled: 0, total: 2 } }), 'close', 'last open filled → close');
      _assertEqual(placementFollowUp({ stage: 'Offered', counts: { open: 1, filled: 1, cancelled: 0, total: 2 } }), 'stage', 'open remain → stage');
      _assertEqual(placementFollowUp({ stage: CONFIG.ROLE_STAGE_CLOSED, counts: { open: 0, filled: 1, cancelled: 0, total: 1 } }), null, 'Closed → nothing');
      _assertEqual(placementFollowUp({ stage: 'Hired', counts: { open: 0, filled: 1, cancelled: 0, total: 1 } }), null, "legacy 'Hired' normalises to Closed → nothing");
      _assertEqual(placementFollowUp({ stage: 'Cancelled', counts: { open: 1, filled: 0, cancelled: 0, total: 1 } }), null, 'Cancelled → nothing');
      _assertEqual(placementFollowUp({ stage: 'Sourcing', counts: { open: 0, filled: 0, cancelled: 1, total: 0 } }), null, 'nothing filled, nothing open → nothing');
    },
  },
  {
    name: 'N-309 historicalHiresFromPlacements — one row per fill, id = pipeline, D-5 / D-7, fallbacks',
    fn: function () {
      const roles = [{ id: 1, RoleTitle: 'Eng', Department: 'Eng', Location: 'UK', OpenDate: '2026-01-01T12:00:00Z', TalentPartner: 'a@x.com;b@x.com' }];
      const headcount = [
        { id: 11, RoleID: 1, OpenDate: '2026-02-01T12:00:00Z' },
        { id: 12, RoleID: 1, OpenDate: null },
      ];
      const P = (id, roleId, hcId, offer, tp) => ({ id, RoleIDLookupId: roleId, HeadcountID: hcId, OfferAcceptedDate: offer, TalentPartner: tp });
      const placements = [
        P(101, 1, 11, '2026-03-01T12:00:00Z', 'a@x.com'),
        P(102, 1, 12, '2026-04-01T12:00:00Z', 'b@x.com'),
        P(103, 1, null, '2026-05-01T12:00:00Z', ''),
        P(104, 99, 11, '2026-05-01T12:00:00Z', 'a@x.com'),     // role gone → dropped
        P(105, 1, 11, null, 'a@x.com'),                        // no offer date → dropped
        P(106, 1, 999, '2026-06-01T12:00:00Z', 'a@x.com'),     // unknown headcount → role OpenDate
      ];
      const before = JSON.stringify([roles, headcount, placements]);
      const out = historicalHiresFromPlacements(placements, roles, headcount);
      _assertEqual(out.map(r => r.placementId), [101, 102, 103, 106], 'one row per placement with an offer date on a known role');
      _assertEqual(out.map(r => r.id), [1, 1, 1, 1], 'id is the pipeline id on every row');
      _assertEqual(out.map(r => r.headcountId), [11, 12, null, null], 'headcountId');
      _assertEqual(out.map(r => r.openDate), ['2026-02-01T12:00:00Z', null, '2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z'],
        'headcount OpenDate; not opened → null; blank/unknown HeadcountID → role OpenDate');
      _assertEqual(out.map(r => r.tpEmail), ['a@x.com', 'b@x.com', null, 'a@x.com'], 'tpEmail = placer (D-7), never the role TP list');
      _assertEqual(out[0], { id: 1, headcountId: 11, placementId: 101, title: 'Eng', functionArea: 'Eng', country: 'UK',
        openDate: '2026-02-01T12:00:00Z', placementDate: '2026-03-01T12:00:00Z', tpEmail: 'a@x.com' }, 'row shape');
      _assertEqual(JSON.stringify([roles, headcount, placements]), before, 'inputs not mutated');
      _assertEqual(historicalHiresFromPlacements(null, null, null), [], 'null-safe');

      // D-8: an OPEN pipeline with a fill joins the funnel learning population.
      const idx = funnelLearningIndex(out, [{ id: 1, Stage: 'Sourcing', Department: 'Eng', Location: 'UK' }, { id: 2, Stage: 'Sourcing' }]);
      _assertEqual(Array.from(idx.keys()), ['1'], 'D-8 open pipeline with ≥1 fill is learning; one with none is not');
    },
  },
  {
    name: 'N-309 getHistoricalPlacements reads placements, roles and headcount — no Stage / ActualHireDate filter',
    fn: function () {
      const saved = getItems; const calls = [];
      getItems = function (list, filter, select) { calls.push([list, filter || '', select]); return Promise.resolve([]); };
      try {
        getHistoricalPlacements();
        _assertEqual(calls.map(c => c[0]).sort(), ['Placements', 'RoleHeadcount', 'Roles'], 'three reads');
        const pl = calls.find(c => c[0] === 'Placements');
        _assertEqual(/^fields\/OfferAcceptedDate ge '\d{4}-\d{2}-\d{2}'$/.test(pl[1]), true, 'Placements bounded on OfferAcceptedDate only');
        _assertEqual(calls.some(c => /Stage|ActualHireDate/.test(c[1])), false, 'no Stage / ActualHireDate filter anywhere');
      } finally { getItems = saved; }

      // AC 11 (QA fix): a failed RoleHeadcount read degrades to [] instead of
      // rejecting the whole call. Tests run synchronously, so capture the
      // .catch handler getHistoricalPlacements attaches and invoke it directly.
      const savedItems = getItems, savedHc = getAllHeadcount, savedWarn = console.warn;
      let handler = null;
      getItems = function () { return Promise.resolve([]); };
      getAllHeadcount = function () { return { catch: function (fn) { handler = fn; return Promise.resolve([]); } }; };
      console.warn = function () {};
      try {
        getHistoricalPlacements();
        _assertEqual(typeof handler, 'function', 'AC11 headcount read has a .catch fallback');
        _assertEqual(handler(new Error('403 RoleHeadcount')), [], 'AC11 fallback resolves to no headcount');
      } finally { getItems = savedItems; getAllHeadcount = savedHc; console.warn = savedWarn; }
      const fb = historicalHiresFromPlacements(
        [{ id: 1, RoleIDLookupId: 5, HeadcountID: 50, OfferAcceptedDate: '2026-03-01T12:00:00Z', TalentPartner: 'a@x.com' }],
        [{ id: 5, OpenDate: '2026-02-01T12:00:00Z' }], []);
      _assertEqual(fb.map(r => r.openDate), ['2026-02-01T12:00:00Z'], 'AC11 with no headcount the hire keeps the pipeline Open Date');
    },
  },
  {
    name: 'N-309 ttfClosedCensorTimes / ttfHeadcountInputs — per headcount, rules A/B/C, no double count',
    fn: function () {
      const today = new Date(2026, 9, 1, 12);  // 1 Oct 2026, local noon
      const R = (id, stage) => ({ id, Stage: stage, Department: 'Eng', Location: 'UK' });
      const S = (id, oldV, newV, at) => ({ RoleIDLookupId: id, Field: 'Stage', OldValue: oldV, NewValue: newV, ChangedAt: at });
      const H = (id, roleId, open, extra) => Object.assign({ id, RoleID: roleId, OpenDate: open ? open + 'T12:00:00Z' : null, Status: 'Open' }, extra || {});
      const X = (day) => ({ Status: 'Cancelled', CancelledDate: day + 'T12:00:00Z' });
      const roles = [R(1, 'On-hold'), R(2, 'Cancelled'), R(3, 'Sourcing'), R(4, 'Hired')];
      const rows = [
        S(1, 'Sourcing', 'On-hold', '2026-08-01T10:00:00Z'),
        S(2, 'Interview 1', 'On-hold', '2026-08-01T10:00:00Z'), S(2, 'On-hold', 'Cancelled', '2026-09-01T10:00:00Z'),
      ];
      const headcount = [
        H(11, 1, '2026-07-01'), H(12, 1, '2026-07-11'), H(13, 1, '2026-07-01'), H(14, 1, null),
        H(21, 2, '2026-07-01', X('2026-09-01')),        // cascade-cancelled after the On-hold run → On-hold day
        H(22, 2, '2026-07-01', X('2026-07-22')),        // cancelled before the run → its own cancel day
        H(31, 3, '2026-09-01', X('2026-09-11')),        // rule B
        H(32, 3, '2025-05-01', X('2025-06-01')),        // outside lookback
        H(33, 3, '2026-09-01'),                         // open on a censored stage → rule C only
        H(34, 3, null, X('2026-09-11')),                // undated
        H(35, 3, '2026-09-01', X('2026-09-11')),        // filled wins over Cancelled
        H(41, 4, '2026-09-01'),                         // open on a legacy-Hired (Closed) pipeline
        H(91, 99, '2026-09-01'),                        // role not in `roles`
      ];
      const placements = [{ HeadcountID: 13 }, { HeadcountID: 35 }];
      const before = JSON.stringify([roles, rows, headcount]);
      const { openHeadcount, closedCensored } = ttfHeadcountInputs({ roles, headcount, placements, stageRows: rows, today });
      const t = Object.fromEntries(closedCensored.map(o => [o.headcountId, o.t]));
      _assertEqual(t, { 11: 31, 12: 21, 21: 31, 22: 21, 31: 10 }, 'A: paused pipeline → close day (min with cancel day); B: cancelled → CancelledDate; filled / undated / out-of-window / open-on-active excluded');
      _assertEqual(closedCensored.find(o => o.headcountId === '11').Stage, 'On-hold', 'Stage = pipeline stage');
      _assertEqual(openHeadcount.map(o => o.id), [11, 12, 14, 33, 41], 'openHeadcount = open headcount on known roles');
      _assertEqual(openHeadcount.find(o => o.id === 41).Stage, 'Closed', "legacy 'Hired' normalised");
      _assertEqual(openHeadcount.find(o => o.id === 33), { id: 33, roleId: 3, Stage: 'Sourcing', Department: 'Eng', Location: 'UK', OpenDate: '2026-09-01T12:00:00Z' }, 'role-shaped row, OpenDate from the headcount');
      _assertEqual(JSON.stringify([roles, rows, headcount]), before, 'inputs not mutated');

      // No headcount is both censored-at-age (rule C) and closed-censored (A/B).
      const ageIds = openHeadcount.filter(o => TTF_CENSORED_STAGES.includes(o.Stage) && o.OpenDate).map(o => String(o.id));
      _assertEqual(ageIds.filter(id => id in t), [], 'no double count');
      _assertEqual(CONFIG.TTF_SURVIVAL.closedStages.filter(s => TTF_CENSORED_STAGES.includes(s)), [], 'closedStages ∩ TTF_CENSORED_STAGES = ∅');

      const hist = [10, 20, 30].map(d => ({ functionArea: 'Eng', country: 'UK', openDate: '2026-01-01T12:00:00Z',
        placementDate: new Date(Date.UTC(2026, 0, 1 + d, 12)).toISOString() }));
      const r = computeTTFPrediction('Eng', 'UK', hist, openHeadcount, closedCensored);
      _assertEqual([r.events, r.censored - r.closed, r.closed], [3, 1, 5], 'KM pool: 3 fills, 1 open dated headcount on a censored stage, 5 stopped');

      _assertEqual(ttfClosedCensorTimes(roles, rows, [H(23, 2, '2026-07-01', { Status: 'Cancelled', CancelledDate: '2026-07-21T23:00:00Z' })], new Map(), today)[0].t, 20,
        'CancelledDate read as its stored day via spDateIn (23:00Z → that date)');
      _assertEqual(ttfHeadcountInputs({}), { openHeadcount: [], closedCensored: [] }, 'null-safe');
    },
  },
  {
    name: 'N-309 avgTimeToHireDays — day maths, skips undated / negative',
    fn: function () {
      const r = (o, p) => ({ openDate: o, placementDate: p });
      _assertEqual(avgTimeToHireDays([r('2026-09-01T12:00:00Z', '2026-09-15T12:00:00Z'), r('2026-09-01T12:00:00Z', '2026-09-02T12:00:00Z')]), 7.5, 'mean, unrounded');
      _assertEqual(avgTimeToHireDays([r('2026-08-31T23:00:00Z', '2026-09-15T12:00:00Z')]), 15, 'BST-stored open reads as 31 Aug');
      _assertEqual(avgTimeToHireDays([r(null, '2026-09-15T12:00:00Z'), r('2026-09-20T12:00:00Z', '2026-09-15T12:00:00Z'), r('2025-12-25T12:00:00Z', '2026-01-05T12:00:00Z')]), 11,
        'undated and negative skipped; year rollover');
      _assertEqual([avgTimeToHireDays([]), avgTimeToHireDays(null)], [null, null], 'empty → null');
    },
  },
  {
    name: 'N-309 oldestOpenHeadcountIndex + roleFlagReasons / tallyRoleFlags opts.openSince',
    fn: function () {
      const H = (id, roleId, open, status) => ({ id, RoleID: roleId, OpenDate: open ? open + 'T12:00:00Z' : null, Status: status || 'Open' });
      const headcount = [
        H(71, 7, '2026-09-02'), H(72, 7, '2026-09-25'), H(73, 7, null), H(74, 7, '2026-09-01', 'Cancelled'),
        H(81, 8, '2026-08-01'),
      ];
      const idx = oldestOpenHeadcountIndex(headcount, [{ HeadcountID: 71 }, { HeadcountID: 81 }]);
      _assertEqual(Array.from(idx.entries()), [['7', '2026-09-25'], ['8', null]], 'oldest OPEN dated headcount; filled / cancelled / undated ignored');

      const TODAY = new Date(2026, 9, 2, 12);
      const h = groupStageHistoryByRole([
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: null,       NewValue: 'Sourcing', ChangedAt: '2026-09-02T09:00:00Z' },
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: 'Sourcing', NewValue: 'On-hold',  ChangedAt: '2026-09-10T09:00:00Z' },
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: 'On-hold',  NewValue: 'Sourcing', ChangedAt: '2026-09-29T09:00:00Z' },
      ]);
      const role = { id: 7, Stage: 'Sourcing', OpenDate: '2026-09-02T12:00:00Z' };
      const legacy = roleFlagReasons(role, [], h, TODAY);
      const hc     = roleFlagReasons(role, [], h, TODAY, { openSince: idx });
      _assertEqual([legacy.behindPace, legacy.daysOpen], [true, 30], 'no opts → legacy role.OpenDate (N-274 AC7 unchanged)');
      _assertEqual([hc.behindPace, hc.daysOpen, hc.flagged, hc.daysInStage], [false, 7, false, 3], 'openSince → days since the oldest open headcount');
      const none = roleFlagReasons(role, [], h, TODAY, { openSince: new Map() });
      _assertEqual([none.behindPace, none.daysOpen], [false, null], 'no open dated headcount → null / not behind');
      _assertEqual(isRoleFlagged(role, [], h, TODAY, { openSince: idx }), false, 'isRoleFlagged passes opts through');

      const roles = [
        { id: 2, Stage: 'Submitted', OpenDate: '2026-08-01T12:00:00Z' },
        { id: 3, Stage: 'Interview 1' },
      ];
      const sh = groupStageHistoryByRole([{ RoleIDLookupId: 2, Field: 'Stage', OldValue: 'Sourcing', NewValue: 'Submitted', ChangedAt: '2026-09-24T09:00:00Z' }]);
      const acts = [{ RoleIDLookupId: 3, WeekEndingDate: '2026-09-27T12:00:00Z', Submitted: 5, Interview1: 1 }];
      _assertEqual(tallyRoleFlags(roles, acts, sh, TODAY), { total: 2, flagged: 2, stuck: 1, conversion: 1, behind: 1 }, 'tally without opts');
      _assertEqual(tallyRoleFlags(roles, acts, sh, TODAY, { openSince: new Map([['2', '2026-09-29']]) }), { total: 2, flagged: 2, stuck: 1, conversion: 1, behind: 0 },
        'tally passes opts: behind changes, flagged does not');
    },
  },
  {
    name: 'N-309 computeSnapshotMetrics — avgDaysOpen from open dated headcount on open pipelines (S-8)',
    fn: function () {
      const now = new Date();
      const ago = n => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n, 12)).toISOString();
      const roles = [
        { id: 1, Stage: 'Sourcing', OpenDate: ago(100) },
        { id: 2, Stage: CONFIG.ROLE_STAGE_CLOSED, OpenDate: ago(300) },
        { id: 3, Stage: 'Cancelled', OpenDate: ago(50) },
        { id: 4, Stage: 'Interview 1', OpenDate: ago(30) },
      ];
      const H = (id, roleId, open, status) => ({ id, RoleID: roleId, OpenDate: open, Status: status || 'Open' });
      const headcount = [
        H(11, 1, ago(10)), H(12, 1, ago(20)), H(13, 1, ago(100)), H(14, 1, ago(200), 'Cancelled'), H(15, 1, null),
        H(21, 2, ago(300)),                 // stray open headcount on a Closed pipeline
        H(31, 3, ago(50)),
        H(41, 4, ago(30)),
      ];
      const fillMap = headcountFillMap([{ HeadcountID: 13 }]);
      const withHc = computeSnapshotMetrics(roles, [], [], [], {}, { headcount, fillMap });
      _assertEqual(withHc.avgDaysOpen, 20, 'mean of 10, 20, 30 — filled, cancelled, undated and Closed-pipeline rows excluded');
      _assertEqual(computeSnapshotMetrics(roles, [], [], [], {}).avgDaysOpen, 65, 'no headcountState → legacy role average');
      _assertEqual(Object.keys(withHc.rolesByStage).sort(), ['Interview 1', 'Sourcing'], 'RolesByStage has no Closed / Cancelled key');
      _assertEqual(withHc.openRoles, 2, 'openRoles unchanged (pipelines)');
      _assertEqual(computeSnapshotMetrics(roles, [], [], [], {}, { headcount: [], fillMap: new Map() }).avgDaysOpen, null, 'no open headcount → null');
    },
  },
  {
    name: 'N-310 hireRowsWithTargets — N-309 rows + targetDate (headcount, role fallback)',
    fn: function () {
      const roles = [{ id: 1, RoleTitle: 'Eng', Department: 'Eng', Location: 'UK', OpenDate: '2026-01-01T12:00:00Z', TargetHireDate: '2026-02-15T12:00:00Z' },
                     { id: 2, RoleTitle: 'PM', OpenDate: '2026-01-01T12:00:00Z' }];
      const headcount = [{ id: 11, RoleID: 1, OpenDate: '2026-02-01T12:00:00Z', TargetHireDate: '2026-03-18T12:00:00Z' },
                         { id: 12, RoleID: 1, OpenDate: null }];
      const P = (id, roleId, hcId) => ({ id, RoleIDLookupId: roleId, HeadcountID: hcId, OfferAcceptedDate: '2026-03-01T12:00:00Z', TalentPartner: 'a@x.com' });
      const placements = [P(101, 1, 11), P(102, 1, 12), P(103, 1, null), P(104, 1, 999), P(105, 2, null)];
      const before = JSON.stringify([roles, headcount, placements]);
      const out  = hireRowsWithTargets(placements, roles, headcount);
      const base = historicalHiresFromPlacements(placements, roles, headcount);
      _assertEqual(out.map(r => r.targetDate), ['2026-03-18T12:00:00Z', null, '2026-02-15T12:00:00Z', '2026-02-15T12:00:00Z', null],
        'headcount target; headcount without target → null; blank/unknown HeadcountID → role target; neither → null');
      _assertEqual(out.map(r => { const { targetDate, ...rest } = r; return rest; }), base, 'every other key identical to historicalHiresFromPlacements');
      _assertEqual(JSON.stringify([roles, headcount, placements]), before, 'inputs not mutated');
    },
  },
  {
    name: 'N-310 dashboardHeadcountContext + pipelineOpenDay + nextOpenTargetDay',
    fn: function () {
      const roles = [{ id: 1, OpenDate: '2026-09-01T12:00:00Z' }, { id: 2, OpenDate: '2026-01-01T12:00:00Z' }];
      const headcount = [
        { id: 11, RoleID: 1, OpenDate: '2026-09-01T12:00:00Z', TargetHireDate: '2026-10-16T12:00:00Z' },
        { id: 12, RoleID: 1, OpenDate: '2026-09-15T12:00:00Z', TargetHireDate: '2026-10-30T12:00:00Z' },
        { id: 13, RoleID: 1, OpenDate: '2026-09-20T12:00:00Z', TargetHireDate: '2026-11-04T12:00:00Z' },
        { id: 14, RoleID: 1, OpenDate: '2026-08-01T12:00:00Z', TargetHireDate: '2026-09-01T12:00:00Z', Status: CONFIG.HEADCOUNT.STATUS_CANCELLED },
        { id: 91, RoleID: 9, OpenDate: '2026-01-01T12:00:00Z' },   // another project's role
      ];
      const placements = [{ id: 1, RoleIDLookupId: 1, HeadcountID: 11, OfferAcceptedDate: '2026-10-01T12:00:00Z' }];
      const ctx = dashboardHeadcountContext(roles, placements, headcount);
      _assertEqual(ctx.headcount.map(h => h.id), [11, 12, 13, 14], 'headcount limited to the given roles');
      _assertEqual(Array.from(ctx.openSince.entries()), Array.from(oldestOpenHeadcountIndex(ctx.headcount, placements).entries()), 'openSince = oldestOpenHeadcountIndex');
      _assertEqual(ctx.openSince.get('1'), '2026-09-15', 'filled + cancelled headcount ignored');
      _assertEqual(ctx.hires.length, 1, 'hires built');
      const nul = dashboardHeadcountContext(roles, placements, null);
      _assertEqual([nul.headcount, nul.openSince], [null, null], 'null headcount → null headcount / openSince');
      _assertEqual(nul.hires.map(r => r.openDate), ['2026-09-01T12:00:00Z'], 'null headcount → hires still built from the role-date fallback');
      _assertEqual(pipelineOpenDay(roles[0], ctx.openSince), '2026-09-15', 'Map hit');
      _assertEqual(pipelineOpenDay(roles[1], ctx.openSince), null, 'Map miss → null (no Roles.OpenDate fallback)');
      _assertEqual(pipelineOpenDay(roles[0], null), '2026-09-01', 'null Map → spDateIn(Roles.OpenDate)');
      _assertEqual(nextOpenTargetDay(ctx.headcount, ctx.fillMap), '2026-10-30', 'earliest target among OPEN headcount (filled 16 Oct, cancelled 1 Sep ignored)');
      _assertEqual(nextOpenTargetDay([headcount[0]], ctx.fillMap), null, 'none open → null');
    },
  },
  {
    name: 'N-310 hiredOnTimePct + hireKpis — local-day ranges, D-5 exclusions',
    fn: function () {
      const R = (open, offer, target) => ({ openDate: open, placementDate: offer, targetDate: target });
      const rows = [
        R('2026-09-01T12:00:00Z', '2026-10-01T12:00:00Z', '2026-10-01T12:00:00Z'),   // 30 days, on target day → on time
        R('2026-09-15T12:00:00Z', '2026-10-07T12:00:00Z', '2026-10-06T12:00:00Z'),   // 22 days, one day late
        R(null,                   '2026-10-05T12:00:00Z', null),                     // not opened, no target
        R('2026-08-01T12:00:00Z', '2026-10-01T00:00:00Z', '2026-12-01T12:00:00Z'),   // midnight-UTC shape: still 1 Oct (spDateIn, no local getter)
        R('2026-06-01T12:00:00Z', '2026-09-29T12:00:00Z', '2026-12-01T12:00:00Z'),   // previous quarter
      ];
      _assertEqual(hiredOnTimePct(rows.slice(0, 3)), 50, 'inclusive day compare; no-target row excluded');
      _assertEqual(hiredOnTimePct([R(null, '2026-10-01', null)]), null, 'nothing with a target → null');
      _assertEqual(hiredOnTimePct([]), null, 'empty → null');
      const q4 = hireKpis(rows, '2026-10-01', '2026-12-31');
      _assertEqual(q4.count, 4, 'count includes the not-opened hire and the T00:00Z 1 Oct offer; excludes 29 Sep');
      _assertEqual(q4.avgDays, Math.round((30 + 22 + 61) / 3), 'avgDays rounded, not-opened excluded');
      _assertEqual(q4.onTimePct, 67, '2 of 3 targeted hires on time');
      _assertEqual(hireKpis(rows, '2026-10-07', '2026-10-07').count, 1, 'range inclusive at both ends');
      _assertEqual(hireKpis([R(null, '2026-10-05T12:00:00Z', null)], '2026-10-01', '2026-12-31'), { count: 1, avgDays: null, onTimePct: null }, 'no dated rows → avgDays null');
    },
  },
  {
    name: 'N-310 avgOpenHeadcountDays — the Snapshots S-8 rule, shared with the KPI tile',
    fn: function () {
      const now = new Date();
      const ago = n => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n, 12)).toISOString();
      const open = [{ id: 1, OpenDate: ago(100) }, { id: 4, OpenDate: ago(30) }];
      const H = (id, roleId, o, status) => ({ id, RoleID: roleId, OpenDate: o, Status: status || 'Open' });
      const headcount = [H(11, 1, ago(10)), H(12, 1, ago(20)), H(13, 1, ago(100)), H(14, 1, ago(200), 'Cancelled'), H(15, 1, null), H(21, 2, ago(300)), H(41, 4, ago(30))];
      const fillMap = headcountFillMap([{ HeadcountID: 13 }]);
      _assertEqual(avgOpenHeadcountDays(open, headcount, fillMap), 20, '10, 20, 30 — filled / cancelled / undated / other-pipeline excluded');
      _assertEqual(avgOpenHeadcountDays(open, null, null), 65, 'null headcount → legacy Roles.OpenDate mean');
      _assertEqual(avgOpenHeadcountDays(open, [], new Map()), null, '[] → null (not the legacy path)');
    },
  },
  {
    name: 'N-311 openHeadcountCount — open DATED headcount on open pipelines (S-2); same rows as avgOpenHeadcountDays',
    fn: function () {
      const now = new Date();
      const ago = n => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n, 12)).toISOString();
      const roles = [
        { id: 1, Stage: 'Interview' }, { id: 2, Stage: 'On-hold' }, { id: 3, Stage: 'Backlog' },
        { id: 4, Stage: 'Closed' }, { id: 5, Stage: 'Offered' },
      ];
      const openRoles = roles.filter(r => isOpenPipelineStage(r.Stage));
      const H = (id, roleId, o, status) => ({ id, RoleID: roleId, OpenDate: o, Status: status || 'Open' });
      const headcount = [
        H(11, 1, ago(10)),                 // open, dated → counts
        H(12, 1, ago(50)),                 // filled
        H(13, 1, ago(5), 'Cancelled'),     // cancelled
        H(14, 1, null),                    // open but undated → planned, not active
        H(21, 2, ago(5)),                  // On-hold pipeline
        H(31, 3, ago(5)),                  // Backlog pipeline
        H(41, 4, ago(90)),                 // Closed pipeline, filled
        H(51, 5, ago(3)), H(52, 5, ago(8)),// Offered pipeline, two open dated
      ];
      const fillMap = headcountFillMap([{ HeadcountID: 12 }, { HeadcountID: 41 }]);
      _assertEqual(openHeadcountCount(openRoles, headcount, fillMap), 3, 'ids 11, 51, 52 only — undated / filled / cancelled / parked / closed excluded');
      _assertEqual(openDatedHeadcount(openRoles, headcount, fillMap).map(h => h.id).sort(), [11, 51, 52], 'selector rows');
      _assertEqual(headcountCounts(headcount.filter(h => h.RoleID === 1), fillMap).open, 2, 'x of x/y still counts the undated head (D-5)');
      _assertEqual(openHeadcountCount(openRoles, [], new Map()), 0, '[] → 0');
      _assertEqual(openHeadcountCount(openRoles, null, null), null, 'null (read failed) → null');
      _assertEqual(openHeadcountCount([], headcount, fillMap), 0, 'no open pipelines → 0');
      _assertEqual(avgOpenHeadcountDays(openRoles, headcount, fillMap), 7, 'same three rows: (10 + 3 + 8) / 3');
    },
  },
  {
    name: 'N-310 budgetVsSpendByCurrency — paired per placement (S-8)',
    fn: function () {
      const roles = [
        { id: 1, Location: 'UK', Budget: 50000 },
        { id: 2, Location: 'Ireland', Budget: '40000' },
        { id: 3, Location: 'UK' },                 // unbudgeted
      ];
      const P = (roleId, salary) => ({ RoleIDLookupId: roleId, SalaryAgreed: salary });
      const placements = [P(1, 50000), P(1, '52000'), P(1, 48000), P(1, null), P(2, 41000), P(3, 60000), P(99, 10000)];
      const out = budgetVsSpendByCurrency(roles, placements);
      const ukCcy = CONFIG.COUNTRY_CURRENCY['UK'] || 'GBP';
      const ptCcy = CONFIG.COUNTRY_CURRENCY['Ireland'] || 'GBP';
      const uk = out.rows.find(r => r.ccy === ukCcy);
      _assertEqual([uk.budget, uk.spend, uk.hires], ukCcy === ptCcy ? [190000, 191000, 4] : [150000, 150000, 3], 'per-head budget × hires with a salary');
      if (ukCcy !== ptCcy) _assertEqual(out.rows.map(r => r.ccy), [ukCcy, ptCcy], 'split by role Location currency, first-appearance order');
      _assertEqual(out.excluded, 3, 'no salary, unbudgeted role and unknown role are excluded from both sides');
      _assertEqual(budgetVsSpendByCurrency([], []), { rows: [], excluded: 0 }, 'empty');
    },
  },
  {
    name: 'N-312 coeLinkableHeadcount — S-1 population, D-5 order, filled + current labels',
    fn: function () {
      const roles = [
        { id: '1', RoleTitle: 'Eng', Location: 'Lisbon', Stage: 'Sourcing' },
        { id: '2', RoleTitle: 'PM', Stage: 'Backlog' },
        { id: '3', RoleTitle: 'QA', Stage: 'Closed' },
        { id: '4', RoleTitle: 'Ops', Stage: 'Hired' },        // legacy → Closed
        { id: '5', RoleTitle: 'Fin', Stage: 'On-hold' },
        { id: '6', RoleTitle: 'HR', Stage: 'Cancelled' },
      ];
      const H = (id, roleId, seq, open, status) =>
        ({ id: String(id), RoleID: roleId, Sequence: seq, OpenDate: open, Status: status || 'Open', Title: 'Headcount ' + seq });
      const headcount = [
        H(11, 1, 1, '2026-05-01T12:00:00Z'),               // filled
        H(12, 1, 2, null),                                 // open, undated
        H(13, 1, 3, '2026-06-01T12:00:00Z'),               // open, dated
        H(14, 1, 4, '2026-04-01T12:00:00Z', 'Cancelled'),  // cancelled
        H(15, 1, 5, '2026-03-01T12:00:00Z'),               // open, linked to row r1
        H(21, 2, 1, null),                                 // Backlog pipeline → linkable
        H(31, 3, 1, '2026-01-01T12:00:00Z'),               // Closed pipeline, filled, row r2
        H(41, 4, 1, '2026-01-01T12:00:00Z'),               // legacy Hired
        H(51, 5, 1, '2026-01-01T12:00:00Z'),               // On-hold
        H(61, 6, 1, '2026-01-01T12:00:00Z'),               // Cancelled pipeline
      ];
      const placements = [{ id: 'p1', HeadcountID: 11 }, { id: 'p3', HeadcountID: 31 }];
      const planRows = [{ id: 'r1', LinkedHeadcountID: 15 }, { id: 'r2', LinkedHeadcountID: 31 }, { id: 'r3' }];
      const ex = PLAN_LINKABLE_EXCLUDED_STAGES;
      const g = coeLinkableHeadcount({ roles, headcount, placements, planRows, excludedStages: ex });
      _assertEqual(g.map(x => x.roleLabel), ['Eng (Lisbon)', 'PM'], 'open headcount on Closed / legacy Hired / On-hold / Cancelled pipelines out (their only filled one is linked to r2); Backlog in; alphabetical');
      _assertEqual(g[0].options.map(o => o.id), [13, 12, 11], 'open dated, open undated, then filled; cancelled + linked elsewhere excluded');
      _assertEqual(g[0].options.map(o => o.label),
        ['Headcount 3 · opened 2026-06-01', 'Headcount 2 · not opened', 'Headcount 1 · opened 2026-05-01 · filled'], 'labels');
      _assertEqual(g[0].options.map(o => o.roleId), [1, 1, 1], 'roleId carried');
      const g2 = coeLinkableHeadcount({ roles, headcount, placements, planRows, currentHeadcountId: 31, excludedStages: ex });
      const qa = g2.find(x => x.roleId === 3);
      _assertEqual(qa && qa.options.map(o => [o.id, o.current, o.label]),
        [[31, true, 'Headcount 1 · opened 2026-01-01 · filled · current']], "the row's own link is kept on a Closed pipeline");
      const g3 = coeLinkableHeadcount({ roles, headcount, placements, planRows, currentHeadcountId: '15', excludedStages: ex });
      _assertEqual(g3[0].options.map(o => o.id), [15, 13, 12, 11], 'current first, then the usual order');
      _assertEqual(coeLinkableHeadcount({}), [], 'empty input');
    },
  },
  {
    name: 'N-312 diff-2 coeLinkableHeadcount — filled headcount linkable on any pipeline stage',
    fn: function () {
      // Live case (8 Oct 2026): a plan row for a hire on a Closed pipeline could
      // not be linked, and freeing a filled headcount meant re-linking another
      // row onto a Closed pipeline first.
      const roles = [
        { id: '37', RoleTitle: 'COM', Location: 'NL', Stage: 'Closed' },
        { id: '56', RoleTitle: 'CSM', Location: 'NL', Stage: 'Hired' },     // legacy → Closed
        { id: '46', RoleTitle: 'TL', Stage: 'Cancelled' },
        { id: '38', RoleTitle: 'BDR', Stage: 'On-hold' },
      ];
      const headcount = [
        { id: '26', RoleID: 37, Sequence: 1, Status: 'Open', OpenDate: '2026-06-18T12:00:00Z', Title: 'Headcount 1' },  // filled
        { id: '27', RoleID: 37, Sequence: 2, Status: 'Open', OpenDate: null, Title: 'Headcount 2' },                  // open on Closed
        { id: '41', RoleID: 56, Sequence: 1, Status: 'Open', OpenDate: '2026-08-12T12:00:00Z', Title: 'Headcount 1' },  // filled
        { id: '34', RoleID: 46, Sequence: 1, Status: 'Cancelled', OpenDate: '2026-07-13T12:00:00Z', Title: 'Headcount 1' },
        { id: '35', RoleID: 46, Sequence: 2, Status: 'Open', OpenDate: '2026-07-13T12:00:00Z', Title: 'Headcount 2' },  // filled on Cancelled
        { id: '39', RoleID: 38, Sequence: 1, Status: 'Open', OpenDate: '2026-06-18T12:00:00Z', Title: 'Headcount 1' },  // open on On-hold
      ];
      const placements = [{ HeadcountID: 26 }, { HeadcountID: '41' }, { HeadcountID: 35 }];
      const g = coeLinkableHeadcount({ roles, headcount, placements, planRows: [], excludedStages: PLAN_LINKABLE_EXCLUDED_STAGES });
      _assertEqual(g.map(x => [x.roleId, x.options.map(o => [o.id, o.filled])]),
        [[37, [[26, true]]], [56, [[41, true]]], [46, [[35, true]]]],
        'filled offered on Closed / legacy Hired / Cancelled; open on Closed + On-hold and cancelled headcount still out');
      const g2 = coeLinkableHeadcount({ roles, headcount, placements, planRows: [{ id: 'x', LinkedHeadcountID: 41 }], excludedStages: PLAN_LINKABLE_EXCLUDED_STAGES });
      _assertEqual(g2.map(x => x.roleId), [37, 46], 'a filled headcount linked to another row stays hidden');
    },
  },
  {
    name: 'N-312 coeHeadcountActualSpans — R / N / O per headcount',
    fn: function () {
      const T = 'TODAY';
      const hc = extra => Object.assign({ id: '1', OpenDate: '2026-02-02T12:00:00Z', Status: 'Open' }, extra || {});
      const none = { rStart: null, rEnd: null, nStart: null, nEnd: null, oStart: null };
      _assertEqual(coeHeadcountActualSpans(hc({ OpenDate: null }), [], T), none, 'no OpenDate → no bar');
      _assertEqual(coeHeadcountActualSpans(null, [], T), none, 'no headcount → no bar');
      _assertEqual(coeHeadcountActualSpans(hc(), undefined, T),
        { rStart: '2026-02-02T12:00:00Z', rEnd: T, nStart: null, nEnd: null, oStart: null }, 'open → R to today');
      _assertEqual(coeHeadcountActualSpans(hc(), [{ OfferAcceptedDate: '2026-03-16T12:00:00Z', ProvisionalStartDate: '2026-04-13T12:00:00Z' }], T),
        { rStart: '2026-02-02T12:00:00Z', rEnd: '2026-03-16T12:00:00Z', nStart: '2026-03-16T12:00:00Z', nEnd: '2026-04-13T12:00:00Z', oStart: '2026-04-13T12:00:00Z' },
        'filled → R, N, O');
      _assertEqual(coeHeadcountActualSpans(hc(), [{ OfferAcceptedDate: '2026-03-16T12:00:00Z' }], T),
        { rStart: '2026-02-02T12:00:00Z', rEnd: '2026-03-16T12:00:00Z', nStart: '2026-03-16T12:00:00Z', nEnd: T, oStart: null },
        'filled, no start date → N to today, no O');
      _assertEqual(coeHeadcountActualSpans(hc({ Status: 'Cancelled', CancelledDate: '2026-03-02T12:00:00Z' }), [], T),
        { rStart: '2026-02-02T12:00:00Z', rEnd: '2026-03-02T12:00:00Z', nStart: null, nEnd: null, oStart: null },
        'cancelled → R ends at CancelledDate, no N / O');
      const two = coeHeadcountActualSpans(hc(), [
        { OfferAcceptedDate: '2026-04-01T12:00:00Z', ProvisionalStartDate: '2026-05-01T12:00:00Z' },
        { OfferAcceptedDate: '2026-03-01T12:00:00Z', ProvisionalStartDate: '2026-03-30T12:00:00Z' },
      ], T);
      _assertEqual([two.rEnd, two.oStart], ['2026-03-01T12:00:00Z', '2026-03-30T12:00:00Z'], 'two placements → the earliest offer and its start');
    },
  },
  // ── N-317 (HP-1): Hiring Plan v2 — track against plan ──
  {
    name: 'N-317 coeActualMarkerWeeks — ✓ hire-confirmed / ▶ start week on the plan timeline (replaces coeActualPhaseAt)',
    fn: function () {
      const t0 = coeMonday('2026-01-05T12:00:00Z');
      const none = { hire: null, start: null };
      _assertEqual(coeActualMarkerWeeks({ rStart: '2026-01-05T12:00:00Z', rEnd: '2026-01-28T12:00:00Z', nStart: '2026-01-28T12:00:00Z', nEnd: '2026-02-09T12:00:00Z', oStart: '2026-02-09T12:00:00Z' }, t0),
        { hire: 3, start: 5 }, 'offer Wed of week 3, start Mon of week 5');
      _assertEqual(coeActualMarkerWeeks({ rStart: '2026-01-05T12:00:00Z', rEnd: 'TODAY', nStart: '2026-01-28T12:00:00Z', nEnd: 'TODAY', oStart: null }, t0),
        { hire: 3, start: null }, 'offer, no start date → ✓ only (never a marker at "today")');
      _assertEqual(coeActualMarkerWeeks({ rStart: '2026-01-05T12:00:00Z', rEnd: 'TODAY', nStart: null, nEnd: null, oStart: null }, t0), none, 'still recruiting → no markers');
      _assertEqual(coeActualMarkerWeeks(null, t0), none, 'unlinked → no markers');
      _assertEqual(coeActualMarkerWeeks({ nStart: '2026-04-15T12:00:00Z', oStart: null }, t0).hire, 14,
        'GMT timeline start, BST offer → Monday 13 Apr is week 14 (Math.round, N-081)');
    },
  },
  {
    name: 'N-317 coeWeekVariance — Monday-week gap, actual − planned; running only once overdue',
    fn: function () {
      const row = { OpenDate: '2026-03-16T12:00:00Z' };          // Monday of ISO week 12
      const hc = d => ({ OpenDate: d });
      const later = new Date(2026, 5, 1);
      _assertEqual(coeWeekVariance(row, hc('2026-03-12T12:00:00Z'), later), { weeks: -1, final: true }, 'opened Thu of week 11 → -1 (early)');
      _assertEqual(coeWeekVariance(row, hc('2026-03-20T12:00:00Z'), later), { weeks: 0, final: true }, 'opened Fri of the planned week → 0');
      _assertEqual(coeWeekVariance(row, hc('2026-03-31T12:00:00Z'), later), { weeks: 2, final: true }, 'opened Tue of week 14 → +2 (late)');
      _assertEqual(coeWeekVariance(row, null, new Date(2026, 3, 8)), { weeks: 3, final: false }, 'not open, today Wed of week 15 → running +3');
      _assertEqual(coeWeekVariance(row, { OpenDate: null }, new Date(2026, 2, 18)), null, 'not open, still the planned week → null');
      _assertEqual(coeWeekVariance(row, null, new Date(2026, 2, 10)), null, 'not open, before the planned week → null');
      _assertEqual(coeWeekVariance({ OpenDate: '2026-03-23T12:00:00Z' }, hc('2026-04-06T12:00:00Z'), later).weeks, 2, 'GMT planned → BST actual: +2, no dropped week');
      _assertEqual(coeWeekVariance({ OpenDate: '2026-10-19T12:00:00Z' }, hc('2026-11-02T12:00:00Z'), later).weeks, 2, 'BST planned → GMT actual: +2, no extra week');
      _assertEqual(coeWeekVarianceHtml({ weeks: -1, final: true }), '<span class="coe-var--early">-1</span>', 'early renders green');
      _assertEqual(/\+3 \(not open\)/.test(coeWeekVarianceHtml({ weeks: 3, final: false })), true, 'running renders "+3 (not open)"');
      _assertEqual(coeWeekVarianceHtml(null), '—', 'null renders a dash');
    },
  },
  {
    name: 'N-317 coeOpensByMonth — planned / actual / variance per month and the required run rate',
    fn: function () {
      const r = coeOpensByMonth({
        plannedDays: ['2026-08-03', '2026-08-24', '2026-09-07', '2026-11-02', '2026-12-01', '2027-01-04'],
        actualDays:  ['2026-07-30', '2026-09-10', '2026-10-05', '2026-10-20'],   // 20 Oct is after today → not yet opened
        target: 6, latestHireDay: '2027-03-03', todayDay: '2026-10-08', finalNoOpenWeeks: 4,
      });
      _assertEqual(r.months.map(m => m.key), ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'], 'contiguous range, through the cutoff month');
      _assertEqual(r.months.map(m => m.planned), [0, 2, 1, 0, 1, 1, 1, 0], 'planned per month');
      _assertEqual(r.months.map(m => m.actual), [1, 0, 1, 1, null, null, null, null], 'actual per month; future null; future-dated open excluded');
      _assertEqual(r.months.map(m => m.variance), [1, -2, 0, 1, null, null, null, null], 'variance = actual − planned');
      _assertEqual(r.months.map(m => m.isCurrent), [false, false, false, true, false, false, false, false], 'current month flagged');
      _assertEqual(r.months.map(m => m.inWindow), [false, false, false, true, true, true, true, true], 'window = current → cutoff month');
      _assertEqual([r.cutoffDay, r.cutoffMonth, r.openedToDate, r.remaining, r.monthsLeft, r.status],
        ['2027-02-03', '2027-02', 3, 3, 5, 'in-window'], 'cutoff = latest hire − 4 weeks; 3 of 6 to open over Oct–Feb');
      _assertEqual(r.requiredPerMonth, 0.6, 'required run rate 3 / 5');

      const edge = (today, weeks) => coeOpensByMonth({ plannedDays: ['2026-01-05', '2026-02-02'], actualDays: [],
        target: 2, latestHireDay: '2026-03-03', todayDay: today, finalNoOpenWeeks: weeks });
      _assertEqual([edge('2026-01-15', 4).cutoffMonth, edge('2026-01-15', 4).monthsLeft], ['2026-02', 2], '3 Mar − 4 wks = 3 Feb: window Jan–Feb');
      _assertEqual([edge('2026-01-15', 0).cutoffMonth, edge('2026-01-15', 0).monthsLeft], ['2026-03', 3], 'finalNoOpenWeeks read from the argument');
      const past = edge('2026-04-01', 4);
      _assertEqual([past.status, past.requiredPerMonth, past.monthsLeft, past.months[past.months.length - 1].key], ['past-cutoff', null, 0, '2026-04'],
        'after the cutoff with roles left: past-cutoff, no rate, range runs to the current month');
      _assertEqual(past.months.some(m => m.inWindow), false, 'past-cutoff: no in-window months');
      const done = coeOpensByMonth({ plannedDays: ['2026-01-05'], actualDays: ['2026-01-09'], target: 1,
        latestHireDay: '2026-03-03', todayDay: '2026-02-10', finalNoOpenWeeks: 4 });
      _assertEqual([done.status, done.remaining, done.requiredPerMonth], ['complete', 0, null], 'all opened → complete');
    },
  },
  {
    name: 'N-317 coeGanttHtml — four frozen columns; no running variance without a headcount read (hasActuals)',
    fn: function () {
      const rows = [{ id: '1', Title: 'Past row', OpenDate: '2025-01-06T12:00:00Z' }];
      const planOnly = coeGanttHtml(rows, { canEdit: false, showActuals: false });
      const heads = [...planOnly.matchAll(/coe-th-split-top"[^>]*>([^<]*)</g)].map(m => m[1]);
      _assertEqual(heads, ['Role', 'Planned Open', 'Actual Open', 'Week Variance'], 'frozen header labels');
      _assertEqual(/Talent Partner|Target Hire|>TP</.test(planOnly), false, 'no TP / Target Hire column');
      _assertEqual(/\(not open\)/.test(planOnly), false, 'Report Builder (plan only) never shows "(not open)"');
      _assertEqual(/\(not open\)/.test(coeGanttHtml(rows, { headcount: null, showActuals: true })), false, 'failed headcount read never shows "(not open)"');
      _assertEqual(/\(not open\)/.test(coeGanttHtml(rows, { headcount: [], placements: [], showActuals: true })), true, 'headcount read, overdue unlinked row → running variance');
    },
  },
  {
    name: 'N-318 coeOpensBlockHtml — chart + table for the Report Builder final page; summary optional; unread headcount is not zero',
    fn: function () {
      const rows = [
        { id: '1', Title: 'A', OpenDate: '2026-08-03T12:00:00Z', LinkedHeadcountID: '10' },
        { id: '2', Title: 'B', OpenDate: '2026-11-02T12:00:00Z' },
      ];
      const hc = [{ id: '10', OpenDate: '2026-07-30T12:00:00Z' }];
      const bare = coeOpensBlockHtml(rows, hc, { summary: false });
      _assertEqual(/coe-opens-svg/.test(bare) && /coe-opens-table/.test(bare), true, 'chart + table present');
      _assertEqual(/coe-opens-summary/.test(bare), false, 'summary:false leaves the summary line off');
      const full = coeOpensBlockHtml(rows, hc);
      _assertEqual(/coe-opens-summary/.test(full), true, 'default keeps the summary line (Hiring Plan page)');
      _assertEqual(full.endsWith(bare), true, 'page output = summary + the same chart + table');
      _assertEqual(coeOpensBlockHtml(rows, null), null, 'unread headcount (null) → null, not an empty chart');
      _assertEqual(coeOpensBlockHtml(rows, undefined), null, 'undefined headcount → null');
      _assertEqual(coeOpensBlockHtml([], hc), '', 'no plan rows → empty string');
      _assertEqual(/coe-opens-table/.test(coeOpensBlockHtml(rows, [], { summary: false })), true, 'a successful read with no headcount ([]) still renders');
      _assertEqual(coeOpensModel(rows, [], new Date(2026, 9, 8)).openedToDate, 0, '[] headcount → 0 opened (a real read, not the failure path)');
      _assertEqual(coeOpensModel(rows, hc, new Date(2026, 9, 8)).openedToDate, 1, 'linked headcount with an OpenDate counts as opened');
    },
  },
  {
    name: 'N-318 coeOpensHorizontalTableHtml — months across, strips for long plans, Total on the last strip, same figures as the vertical table',
    fn: function () {
      // n consecutive months from Jan 2026: planned 1 each; actual 1,0,1 for the first three (current = 3rd); the rest are future.
      const mk = n => {
        const months = [];
        for (let i = 0; i < n; i++) {
          const future = i > 2;
          months.push({ key: `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, planned: 1,
            actual: future ? null : (i === 1 ? 0 : 1), variance: future ? null : (i === 1 ? -1 : 0),
            isCurrent: i === 2, isFuture: future, inWindow: i >= 2 });
        }
        return { months, requiredPerMonth: 0.5 };
      };
      const tablesOf = html => html.split('</table>').filter(x => x.includes('<table'));
      const rowsOf = tbl => [...tbl.matchAll(/<tr>(.*?)<\/tr>/gs)].map(r => [...r[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map(c => c[1].replace(/<[^>]+>/g, '')));
      const m6 = mk(6);
      const first = rowsOf(tablesOf(coeOpensHorizontalTableHtml(m6))[0]);
      _assertEqual(first.map(r => r[0]), ['Month', 'Planned Opens', 'Actual Opens', 'Variance', 'Required'], 'row labels, in order');
      _assertEqual(first.map(r => r.length), [8, 8, 8, 8, 8], 'every row: label + 6 months + Total');
      _assertEqual(first[1].slice(-1)[0] === '6' && first[2].slice(-1)[0] === '2' && first[3].slice(-1)[0] === '-1' && first[4].slice(-1)[0] === '', true, 'Total column: planned 6, actual to date 2, variance −1, Required blank');
      _assertEqual(first[2].slice(1, 7), ['1', '0', '1', '—', '—', '—'], 'future months show — for actual');
      _assertEqual(first[3].slice(4, 7), ['—', '—', '—'], 'future months show — for variance');
      _assertEqual(first[4].slice(1, 7), ['—', '—', '0.5', '0.5', '0.5', '0.5'], 'Required only in the window');
      _assertEqual(/to date/.test(first[0][3]) && !/to date/.test(first[0][2]), true, 'current month (3rd) marked "to date"');
      const t = coeOpensTotals(m6);
      _assertEqual([t.planned, t.actual, t.variance], [6, 2, -1], 'coeOpensTotals');
      _assertEqual(coeOpensTableHtml(m6).includes(`<th>Total</th><th>${t.planned}</th><th>${t.actual}</th>`), true, 'vertical Total row uses the same totals');
      const strips = n => tablesOf(coeOpensHorizontalTableHtml(mk(n)));
      _assertEqual([18, 19, 36, 37].map(n => strips(n).length), [1, 2, 2, 3], 'strip count: ceil(months / 18)');
      const s19 = strips(19).map(rowsOf);
      _assertEqual(s19.map(t => t[0].length), [11, 11], '19 months → 10 + 9 (+ Total on the last): equal width, label + 10');
      _assertEqual(s19[0][0].includes('Total'), false, 'Total only on the last strip');
      _assertEqual(s19[1][0].includes('Total'), true, 'Total on the last strip');
      _assertEqual(s19.every(tb => tb.map(r => r.length).every(len => len === tb[0].length)), true, 'all rows in a strip have equal cell counts');
      const keep = CONFIG.COE_OPENS_STRIP_MONTHS;
      try {
        CONFIG.COE_OPENS_STRIP_MONTHS = 6;
        _assertEqual(strips(13).length, 3, 'strip size is read from CONFIG.COE_OPENS_STRIP_MONTHS');
      } finally { CONFIG.COE_OPENS_STRIP_MONTHS = keep; }
      _assertEqual(coeOpensHorizontalTableHtml({ months: [] }), '', 'no months → empty');
      const rows = [{ id: '1', Title: 'A', OpenDate: '2026-08-03T12:00:00Z', LinkedHeadcountID: '10' }, { id: '2', Title: 'B', OpenDate: '2026-11-02T12:00:00Z' }];
      const hc = [{ id: '10', OpenDate: '2026-07-30T12:00:00Z' }];
      const hz = coeOpensBlockHtml(rows, hc, { summary: true, horizontal: true });
      _assertEqual(/coe-opens-table--h/.test(hz) && /coe-opens-summary/.test(hz) && !/<th>Planned Opens<\/th>/.test(hz), true, 'horizontal block: summary + chart + months-across table');
      const vt = coeOpensBlockHtml(rows, hc);
      _assertEqual(/coe-opens-table--h/.test(vt), false, 'default block keeps the vertical table');
    },
  },
  {
    name: 'N-312 planCoELinkMigration — lowest Sequence, reports, idempotent',
    fn: function () {
      const roles = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const headcount = [
        { id: '12', RoleID: 1, Sequence: 2 }, { id: '11', RoleID: '1', Sequence: 1 },
        { id: '21', RoleID: 2, Sequence: 1 },
      ];
      const coeRows = [
        { id: 'a', Title: 'A', LinkedRoleID: 1 },                          // → 11 (lowest Sequence)
        { id: 'b', Title: 'B', LinkedRoleID: '1' },                        // same headcount → conflict
        { id: 'c', Title: 'C', LinkedRoleID: 3 },                          // role with no headcount
        { id: 'd', Title: 'D', LinkedRoleID: 99 },                         // role gone
        { id: 'e', Title: 'E', LinkedRoleID: 2, LinkedHeadcountID: 21 },   // already linked
        { id: 'f', Title: 'F', LinkedRoleID: null },                       // never linked
      ];
      const p = planCoELinkMigration({ coeRows, headcount, roles });
      _assertEqual(p.items.map(i => [i.row.id, i.headcountId, i.roleId]), [['a', 11, 1]], 'a → Headcount 1 of role 1');
      _assertEqual(p.conflict.map(x => [x.row.id, x.headcountId]), [['b', 11]], 'second row on the same headcount → conflict');
      _assertEqual(p.noHeadcount.map(r => r.id), ['c'], 'no headcount reported');
      _assertEqual(p.missingRole.map(r => r.id), ['d'], 'missing role reported');
      _assertEqual(p.counts, { rows: 6, alreadyLinked: 1, toLink: 1, noHeadcount: 1, missingRole: 1, conflict: 1 }, 'counts');
      const p2 = planCoELinkMigration({ coeRows: [{ id: 'g', LinkedRoleID: 2 }, coeRows[4]], headcount, roles });
      _assertEqual(p2.conflict.map(x => x.row.id), ['g'], 'headcount already held by an existing row → conflict');
      const written = coeRows.map(r => {
        const it = p.items.find(i => i.row.id === r.id);
        return it ? { ...r, LinkedHeadcountID: it.headcountId, LinkedRoleID: it.roleId } : r;
      });
      _assertEqual(planCoELinkMigration({ coeRows: written, headcount, roles }).items, [], 'second run: items = []');
    },
  },
  // ── N-313 (HC-7): Role History timeline for multi-headcount pipelines ──
  {
    name: 'N-313 roleTimelineNodeClass — N-100 classes unchanged; backward after a placement and Closed reopen → reset',
    fn: function () {
      _assertEqual(roleTimelineNodeClass(null, 'Sourcing'), 'start', 'creation row (null)');
      _assertEqual(roleTimelineNodeClass('', 'Planning'), 'start', 'creation row (empty string)');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'On-hold'), 'branch', 'into On-hold');
      _assertEqual(roleTimelineNodeClass('Cancelled', 'Sourcing'), 'branch', 'out of Cancelled');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'Sourcing'), 'branch', 'equal');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'Bogus'), 'branch', 'unresolvable');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'Submitted'), 'forward', 'forward');
      _assertEqual(roleTimelineNodeClass('Offered', 'Closed'), 'forward', 'Offered → Closed');
      _assertEqual(roleTimelineNodeClass('Offered', 'Sourcing'), 'backward', 'backward, no placement');
      _assertEqual(roleTimelineNodeClass('Offered', 'Sourcing', { placementSincePrev: true }), 'reset', 'backward after a placement');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'Submitted', { placementSincePrev: true }), 'forward', 'forward stays forward');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'On-hold', { placementSincePrev: true }), 'branch', 'branch stays branch');
      _assertEqual(roleTimelineNodeClass('Closed', CONFIG.HEADCOUNT.reopenStage), 'reset', 'D-3 reopen, no placement in window');
      _assertEqual(roleTimelineNodeClass('Closed', 'Interview 1'), 'reset', 'reopen into any open stage');
    },
  },
  {
    name: 'N-313 roleTimelineSequence — marker slots, same-day tie, inclusive placementSincePrev, undated count, no mutation',
    fn: function () {
      const tag = o => o.map(e => (e.kind === 'stage' ? 'S' + e.index : 'P' + e.placement.id));
      const P = (id, d) => ({ id, OfferAcceptedDate: d });
      const days = ['2026-05-01', '2026-06-01', '2026-07-10', '2026-08-01'];
      const placements = [
        P(5, '2026-09-01T12:00:00Z'),  // after every node → last
        P(2, '2026-07-10T12:00:00Z'),  // same day as node 2 → above node 2
        P(1, '2026-04-20T12:00:00Z'),  // before node 0 → first
        P(3, null),                    // undated
        P(4, '2026-07-10T23:00:00Z'),  // same slot as 2, higher id
      ];
      const snapshot = JSON.stringify([days, placements]);
      const s = roleTimelineSequence(days, placements);
      _assertEqual(tag(s.order), ['P1', 'S0', 'S1', 'P2', 'P4', 'S2', 'S3', 'P5'], 'display order');
      _assertEqual(s.placementSincePrev, [false, false, true, true], 'inclusive window (07-10 counts for nodes 2 and 3)');
      _assertEqual(s.undated, 1, 'undated counted, not ordered');
      _assertEqual(JSON.stringify([days, placements]), snapshot, 'inputs not mutated');
      const edge = roleTimelineSequence(['2026-05-01', '2026-06-01'], [P(9, '2026-05-01T12:00:00Z')]);
      _assertEqual(tag(edge.order), ['S0', 'P9', 'S1'], 'on node 0 day → after node 0');
      _assertEqual(edge.placementSincePrev, [false, true], 'lower bound inclusive');
      _assertEqual(roleTimelineSequence(['2026-05-01'], []).order, [{ kind: 'stage', index: 0 }], 'no placements → stage nodes only');
      _assertEqual(roleTimelineSequence([], []).order, [], 'empty');
      _assertEqual(roleTimelinePlacementDay({ OfferAcceptedDate: '2026-06-30T23:00:00Z' }), '2026-06-30', 'stored date portion (spDateIn)');
      _assertEqual(roleTimelinePlacementDay({}), null, 'no date');
    },
  },
  {
    name: 'N-313 legacy Hired reaches the timeline and roleStageEntryDay as Closed (N-306 read alias, no second alias)',
    fn: function () {
      const rows = normaliseRoleHistoryRows([
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: null,      NewValue: 'Offered',  ChangedAt: '2026-03-02T10:00:00Z' },
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: 'Offered', NewValue: 'Hired',    ChangedAt: '2026-04-01T10:00:00Z' },
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: 'Hired',   NewValue: 'Sourcing', ChangedAt: '2026-05-01T10:00:00Z' },
      ]);
      _assertEqual(roleTimelineNodeClass(rows[1].OldValue, rows[1].NewValue), 'forward', 'Offered → Hired reads Offered → Closed');
      _assertEqual(roleTimelineNodeClass(rows[2].OldValue, rows[2].NewValue), 'reset', 'Hired → Sourcing reads as a Closed reopen');
      _assertEqual(roleStageEntryDay({ Stage: 'Closed', OpenDate: '2026-03-01T12:00:00Z' }, rows.slice(0, 2)), '2026-04-01', 'entered Closed on the Hired row day');
    },
  },
  {
    name: 'N-313 earliestHeadcountOpenDate — filled / cancelled headcount keep anchoring Roles.OpenDate (back-dating stable)',
    fn: function () {
      _assertEqual(earliestHeadcountOpenDate([
        { id: 1, OpenDate: '2026-02-01T12:00:00Z', Status: 'Open' },   // filled (a placement carries HeadcountID 1)
        { id: 2, OpenDate: '2026-06-01T12:00:00Z', Status: 'Open' },
      ]), '2026-02-01', 'filled earlier headcount still anchors');
      _assertEqual(earliestHeadcountOpenDate([
        { id: 3, OpenDate: '2026-01-15T12:00:00Z', Status: 'Cancelled', CancelledDate: '2026-03-01T12:00:00Z' },
        { id: 4, OpenDate: '2026-05-01T12:00:00Z', Status: 'Open' },
      ]), '2026-01-15', 'cancelled earlier headcount still anchors');
    },
  },
];
