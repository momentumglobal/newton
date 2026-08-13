// tests/assertions.js — seed assertions for the Newton test harness.
// Pure: no DOM, no console. Each assertion's fn() throws on failure so the
// same list runs unmodified in both index.html (browser) and run.js (Node).
// Seeds the rig — N-096 (date/week layer), N-097 (LCI calc layer) and N-098
// (analytics layer) add real coverage on top of this file, not inside it.

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
];
