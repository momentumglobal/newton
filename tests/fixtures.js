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
};
