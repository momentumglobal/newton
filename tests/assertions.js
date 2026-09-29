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
    name: 'isRoleFlagged — flags a role with a low interview conversion rate',
    fn: function () {
      const { role, activity } = FIXTURES.roleFlagged;
      _assertEqual(isRoleFlagged(role, activity), true, 'isRoleFlagged');
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
    name: 'isRoleFlagged — days-open threshold fires when the stage has no STAGE_ORDER entry',
    fn: function () {
      const { role, daysOpenOffset, activity } = FIXTURES.analytics2.flaggedNoStageMatch;
      const openRole = { ...role, OpenDate: new Date(Date.now() - daysOpenOffset * 86400000).toISOString() };
      _assertEqual(isRoleFlagged(openRole, activity), true, 'isRoleFlagged');
    },
  },
  {
    name: 'isRoleFlagged — days-open threshold fires for a mid-STAGE_ORDER stage',
    fn: function () {
      const { role, daysOpenOffset, activity } = FIXTURES.analytics2.flaggedMidStage;
      const openRole = { ...role, OpenDate: new Date(Date.now() - daysOpenOffset * 86400000).toISOString() };
      _assertEqual(isRoleFlagged(openRole, activity), true, 'isRoleFlagged');
    },
  },
  {
    name: 'isRoleFlagged — does not flag a fresh role with a healthy conversion rate',
    fn: function () {
      const { role, daysOpenOffset, activity } = FIXTURES.analytics2.notFlagged;
      const openRole = { ...role, OpenDate: new Date(Date.now() - daysOpenOffset * 86400000).toISOString() };
      _assertEqual(isRoleFlagged(openRole, activity), false, 'isRoleFlagged');
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
    name: 'N-176/N-177 CONFIG.CACHE — fully configured, seven lists enrolled',
    fn: function () {
      _assertEqual(Array.isArray(CONFIG.CACHE.persistentLists), true, 'persistentLists is an array');
      // N-176 asserted this was 0 (engine inert). N-177 enrols the six
      // reference lists, so the guard becomes "the expected six", not "none".
      // N-266a adds a seventh reference list, ChecklistTemplates.
      _assertEqual(CONFIG.CACHE.persistentLists.length, 7, 'N-177 six + N-266a ChecklistTemplates');
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
    name: 'N-177 persistentLists — exactly the seven reference lists',
    fn: function () {
      _assertEqual([...CONFIG.CACHE.persistentLists].sort(),
        ['ChecklistTemplates', 'Departments', 'LCILocations', 'LeadershipAccess', 'People', 'Projects', 'UserAssignments'],
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
    name: 'N-177 _ssEnabled — true for the seven, false for the transactional six',
    fn: function () {
      // _ssEnabled() returns false whenever sessionStorage is absent, which it
      // is under Node (tests/run.js). Skipping is honest; asserting here would
      // report a meaningless PASS on the storage guard rather than on
      // enrolment. Runs for real in tests/index.html.
      if (typeof sessionStorage === 'undefined') _skip('no sessionStorage under Node — run tests/index.html for this one');
      ['Projects', 'People', 'Departments', 'LCILocations', 'UserAssignments', 'LeadershipAccess', 'ChecklistTemplates']
        .forEach(function (l) { _assertEqual(_ssEnabled(l), true, l + ' enrolled'); });
      ['Roles', 'WeeklyActivity', 'Placements', 'Assignments', 'RoleHistory', 'ChecklistProgress']
        .forEach(function (l) { _assertEqual(_ssEnabled(l), false, l + ' not enrolled'); });
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
        'censored', 'basis', 'pooled', 'medianReached', 'maxObservedDays'].sort();
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
];
