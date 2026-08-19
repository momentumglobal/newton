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
];
