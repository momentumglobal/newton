// tests/fixtures.js — fixture data for the Newton test harness.
// Data only — no functions. Extended by N-096/097/098; keep this file to
// literals so future fixtures don't tangle with assertion logic.

var FIXTURES = {
  // computeMonthlyRows — one assignment, mid-month start, single month.
  // Dates fixed in the past (2024) so the "not in the future" cap inside
  // computeMonthlyRows never clips this fixture, however long this file
  // runs unmodified.
  monthlyRows: {
    assignments: [
      {
        AssignmentID: 'A-1',
        EmployeeName: 'Test Employee',
        Level: 'Mid',
        Customer: 'Acme',
        ProjectType: 'Delivery',
        Country: 'UK',
        Billed: 'Yes',
        StartDate: '2024-03-15',
        EndDate: '2024-03-31',
        MonthlyBillRate: '3100',
      },
    ],
  },

  // isRoleFlagged — no OpenDate, so the days-open branches are inert and
  // only the submitted/interview1 ratio branch is exercised. Keeps the
  // assertion stable regardless of when the suite runs.
  roleFlagged: {
    role: { RoleID: 'R-1', Stage: 'Sourcing' },
    activity: [
      { RoleID: 'R-1', Submitted: 6, Interview1: 1 },
      { RoleID: 'R-1', Submitted: 4, Interview1: 1 },
    ],
  },

  // lciCumulativeHeadcount — 6-month horizon, 2-month notice offset.
  lciHeadcount: {
    row: { MonthValues: JSON.stringify([2, 0, 3, 0, 1, 0]) },
    horizon: 6,
    noticeMonths: 2,
  },

  // Date/week layer (N-096) — getWeekEnding, getISOWeek, isoDate,
  // spDateIn/spDateOut, and the coeWeekIndex GMT/BST Gantt regression
  // (N-077/N-081 class). Plain {y,m,d} objects, not Date instances — Date
  // construction (where the timezone-sensitivity actually lives) happens
  // in assertions.js, next to the logic that needs to reason about it.
  dateWeek: {
    // getWeekEnding / getISOWeek — 1 Jul 2026 is a Wednesday, BST.
    bstFirstOfMonth: { y: 2026, m: 7, d: 1 },
    // getWeekEnding — the date itself is a Sunday (locks N-129's second,
    // smaller fix: a same-Sunday input used to come back as the day before).
    exactSunday: { y: 2026, m: 8, d: 16 },
    // isoDate — pure string parsing, no Date object involved.
    isoDateInput: '2026-07-01',
    // spDateIn — a SharePoint-style UTC datetime string on the BST boundary.
    spDateInInput: '2026-07-01T00:00:00Z',
    // spDateOut — Date.UTC-constructed, same calendar day as isoDateInput.
    spDateOutInput: { y: 2026, m: 7, d: 1 },
    // coeWeekIndex — the exact dates from the N-081 fix's own code comment
    // ("29 Dec 2025 tStart → 29 Jun 2026 = 26wks − 1h → 25" pre-fix).
    coeGantt: {
      timelineStart: { y: 2025, m: 12, d: 29 },
      target:        { y: 2026, m: 6,  d: 29 },
    },
  },
};
