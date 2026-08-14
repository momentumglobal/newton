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
    // localDayISO (N-088) — 00:30 LOCAL on a BST day. That half-hour after
    // local midnight is the whole failure window: the equivalent UTC
    // instant is still 30 Jun, so the pre-N-088
    // `toISOString().split('T')[0]` returns '2026-06-30'.
    localDayInput: { y: 2026, m: 7, d: 1, h: 0, min: 30 },
    // ForecastMonth stored shapes (N-130). CoEPlanForecast.ForecastMonth is
    // always the 1st of a month, but SharePoint resolved the old bare-date
    // write in the SITE's timezone, so three shapes exist in the list. All
    // three must resolve to the SAME month regardless of browser timezone —
    // the old local-getter read only managed that from UK or further east.
    forecastMonth: {
      legacyBst:  { stored: '2026-06-30T23:00:00Z', month: '2026-07' },
      legacyGmt:  { stored: '2026-01-01T00:00:00Z', month: '2026-01' },
      canonical:  { stored: '2026-07-01T12:00:00Z', month: '2026-07' },
      // Year boundary — where an off-by-one month is most expensive, because
      // it moves the figure into the wrong YEAR's forecast as well.
      yearEnd:    { stored: '2025-12-31T23:00:00Z', month: '2026-01' },
    },
    // Bench sync round-trip (N-090) — a midday-UTC SharePoint date on a BST
    // day. utcDateOnly → spDateOut is the exact pairing the bench sync now
    // uses to read a stored date and write it back; before N-090 the read side
    // produced a LOCAL-midnight Date and the write side re-expressed it in
    // UTC, landing a day early and never matching on re-read.
    benchRoundTrip: '2026-07-01T12:00:00Z',
    // coeMonday (N-089) — one GMT date and one BST date. Both must come back
    // at LOCAL midnight: that is the precondition coeWeekIndex's Math.round
    // relies on, and nothing tested it before.
    coeMondayGmt: { y: 2026, m: 1, d: 15 },
    coeMondayBst: { y: 2026, m: 7, d: 1 },
    // computePlanSpans (N-089) — re-verifies N-077. OpenDate is a midday-UTC
    // SharePoint string (as isoDate writes it) on Thu 19 Feb 2026 = GMT;
    // coeMonday floors it to Mon 16 Feb, and 7 recruitment weeks lands on
    // Mon 6 Apr 2026 — the far side of the 29 Mar BST switch. RecruitmentWeeks
    // is passed explicitly so the expected date doesn't move if
    // CONFIG.COE_PHASE_DEFAULTS ever changes.
    coePlanSpanDst: {
      row:      { OpenDate: '2026-02-19T12:00:00Z', RecruitmentWeeks: 7 },
      expected: { y: 2026, m: 4, d: 6 },
    },
    // coeWeekIndex — the exact dates from the N-081 fix's own code comment
    // ("29 Dec 2025 tStart → 29 Jun 2026 = 26wks − 1h → 25" pre-fix).
    coeGantt: {
      timelineStart: { y: 2025, m: 12, d: 29 },
      target:        { y: 2026, m: 6,  d: 29 },
    },
  },

  // LCI calc layer, round 2 (N-097) — lciRowNotice, lciCumulativeHeadcount
  // via a resolved per-role notice, more lciYearSlices edge cases,
  // lciLegacyMonthlyCost, and the _pickFields copy-whitelist helper.
  lci2: {
    // lciRowNotice — three branches: override wins over a different model
    // default; a blank override falls back to the model default; zero is
    // a REAL override value and must not be treated as blank (the exact
    // case the function's own source comment warns a naive `raw ||
    // fallback` rewrite would silently break).
    noticeOverrideWins:  { row: { NoticeMonthsOverride: 3 },  model: { NoticeMonths: 1 } },
    noticeBlankFallback: { row: { NoticeMonthsOverride: '' }, model: { NoticeMonths: 2 } },
    noticeZeroIsReal:    { row: { NoticeMonthsOverride: 0 },  model: { NoticeMonths: 5 } },
    // lciCumulativeHeadcount fed a per-role-resolved notice end-to-end —
    // same row shape as noticeOverrideWins, 6-month horizon.
    headcountViaResolvedNotice: {
      row: { MonthValues: JSON.stringify([1, 1, 1, 1, 1, 1]) },
      horizon: 6,
    },
    // lciYearSlices — horizon at/under the chunk size (single slice, no
    // label), and a horizon exactly divisible into whole chunks (two full
    // slices, no partial year) — distinct from N-095's 18-month case,
    // which has a partial second year.
    yearSlicesUnderChunk: { horizon: 6, chunk: 12 },
    yearSlicesExactMultiple: { horizon: 24, chunk: 12 },
    // lciLegacyMonthlyCost — (salary + salary*bonusPct) / 12.
    legacyCost: { row: { AnnualSalary: 60000, BonusPct: 0.1 } },
    // _pickFields (api.js) — whitelisted keys only, undefined/null dropped
    // even when whitelisted, non-whitelisted keys always ignored.
    pickFields: {
      obj: { A: 1, B: undefined, C: null, D: 5, E: 'extra' },
      keys: ['A', 'B', 'C', 'D'],
    },
  },

  // Analytics layer, round 2 (N-098) — isRoleFlagged's days-open branches
  // (previously only the ratio branch had coverage), computeVelocityScore,
  // computeRoleFunnel, and computeMonthlyRows' split-fee revenue path
  // (N-116 — untested since it shipped).
  analytics2: {
    // isRoleFlagged — days-open threshold branches. OpenDate is NOT stored
    // here as a fixed date: the function measures against `new Date()` at
    // call time, so a fixed date would silently stop exercising the
    // intended branch as real time passes. Only the offset is fixed; the
    // Date itself is built from it in assertions.js, at assertion run time.
    flaggedNoStageMatch: {
      role: { RoleID: 'R-2', Stage: 'Backlog' },
      daysOpenOffset: 20,
      activity: [],
    },
    flaggedMidStage: {
      role: { RoleID: 'R-3', Stage: 'Interview 2+' },
      daysOpenOffset: 40,
      activity: [],
    },
    notFlagged: {
      role: { RoleID: 'R-4', Stage: 'Sourcing' },
      daysOpenOffset: 10,
      activity: [{ RoleID: 'R-4', Submitted: 10, Interview1: 6 }],
    },
    // computeVelocityScore — one TP, one activity window, one placement.
    velocity: {
      tpEmail: 'tp@x.com',
      activity: [{ Outreach: 100, Responses: 40, Submitted: 20, Interview1: 10, Offers: 5, Hires: 2 }],
      placements: [{ openDate: '2026-01-01', placementDate: '2026-02-15' }],
      benchmarks: { outreachConversion: 0.3, submissionConversion: 0.4, offerSuccess: 0.3, timeToHireDays: 45, flagThreshold: 0.7 },
    },
    // computeRoleFunnel — same shape totals, funnel-specific benchmarks.
    funnel: {
      totals: { Outreach: 100, Responses: 40, Submitted: 20, Interview1: 10, Offers: 5, Hires: 2 },
      benchmarks: { outreachConversion: 0.3, submissionConversion: 0.4, interviewToOffer: 0.4, offerSuccess: 0.3, flagThreshold: 0.7 },
    },
    // computeMonthlyRows — split-fee assignment (N-116). Retainer recognised
    // in the start month; placement fee lands the month AFTER EndDate's
    // month as a zero-capacity revenue row. Dates fixed in the past (2024)
    // for the same "not in the future" reason as FIXTURES.monthlyRows.
    splitFee: {
      assignments: [
        {
          AssignmentID: 'SF-1',
          EmployeeName: 'Split Fee',
          Level: 'Senior',
          Customer: 'Acme',
          ProjectType: 'Exec Search',
          Country: 'UK',
          Billed: 'Yes',
          StartDate: '2024-03-10',
          EndDate: '2024-05-20',
          RetainerFee: '10000',
          PlacementFee: '20000',
        },
      ],
    },
  },
};
