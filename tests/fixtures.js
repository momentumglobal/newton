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

  // lciCumulativeHeadcount — 6-month horizon, 2-month notice offset.
  lciHeadcount: {
    row: { MonthValues: JSON.stringify([2, 0, 3, 0, 1, 0]) },
    horizon: 6,
    noticeMonths: 2,
  },

  // N-261 — lciCostCompositionSeries takes an lciComputeModel() result;
  // only the three fields it reads are needed.
  lciComposition: {
    withLegacy: { coeOperating: [100, 200, 300], legacyCost: [50, 40, 0], oneoffs: [5, 0, 0] },
    noLegacy:   { coeOperating: [100, 200, 300], legacyCost: [0, 0, 0],   oneoffs: [0, 0, 0] },
  },

  // N-263 — lciComputeKPIs end to end. 4-month model, no burden/office/EoR so
  // every figure is hand-checkable:
  //   CoE: Engineer 1000/mo hired M1 (default notice 1 → paid M2);
  //        Lead 2000/mo hired M2, notice override 2 → paid M4.
  //   Legacy: exiting 4000/mo to M2; exiting 500/mo with no exit month (runs
  //   to the horizon — still on the books in the final month, and must NOT
  //   count as steady state); retained 1000/mo throughout.
  //   One-offs 300 in M1 and 500 in M2 (so they sit in both the baseline month
  //   and the peak month, and a baseline/peak that wrongly included or dropped
  //   them would fail); fees 100 in M1–M2.
  //   totalMonthly [5900, 7100, 2500, 4500]; cumulative [5900, 13000, 15500, 20000].
  lciKpis: {
    model: {
      HorizonMonths: 4, StartMonth: '2026-11', NoticeMonths: 1,
      EmployerBurdenPct: 0, SalaryMonths: 12, OfficeCostPerHead: 0, EoRFeePerHead: 0,
      LocalCurrency: 'EUR', DisplayCurrency: 'EUR',
    },
    rows: [
      { RowType: 'coe',    Title: 'Engineer', AnnualSalary: 12000, MonthValues: '[1,0,0,0]', NoticeMonthsOverride: '' },
      { RowType: 'coe',    Title: 'Lead',     AnnualSalary: 24000, MonthValues: '[0,1,0,0]', NoticeMonthsOverride: 2 },
      { RowType: 'legacy', Title: 'Old A',    AnnualSalary: 48000, Quantity: 1, ExitMonth: 2, LegacyCategory: 'exiting' },
      { RowType: 'legacy', Title: 'Old B',    AnnualSalary: 12000, Quantity: 1, LegacyCategory: 'retained' },
      { RowType: 'legacy', Title: 'Old C',    AnnualSalary: 6000,  Quantity: 1, ExitMonth: '', LegacyCategory: 'exiting' },
      { RowType: 'oneoff', Title: 'Retention', MonthValues: '[300,500,0,0]' },
      { RowType: 'fee',    Title: 'Fee',       MonthValues: '[100,100,0,0]' },
    ],
    // Same model, no hires and no legacy — the null / 'na' branches.
    rowsNoHires: [
      { RowType: 'fee', Title: 'Fee', MonthValues: '[100,100,0,0]' },
    ],
  },

  // N-263 — lciPaybackMonth. `sympa` reproduces the reference deck:
  // baseline 327,619, steady 219,219, 18-month horizon, final cumulative
  // 6,965,856 → excess 1,068,714 / saving 108,400 = 9.86 → 18 + 10 = M28.
  lciPayback: {
    sympa:    { cumulativeSpend: new Array(18).fill(6965856), baseline: 327619, steadyMonthly: 219219 },
    inside:   { cumulativeSpend: [10, 12, 30], baseline: 7, steadyMonthly: 1 },   // M2 <= 14; the post-horizon formula alone would say M5
    never:    { cumulativeSpend: [100, 200], baseline: 10, steadyMonthly: 12 },
    noLegacy: { cumulativeSpend: [100, 200], baseline: 0,  steadyMonthly: 5 },
  },

  // N-263 — lciNoticeGroups. 'QA' overrides to the default value (merges into
  // the default group); 'Lead SE' appears twice (de-duplicated); the legacy
  // row is ignored.
  lciNotice: {
    model: { NoticeMonths: 1 },
    rows: [
      { RowType: 'coe',    Title: 'Eng',     NoticeMonthsOverride: '' },
      { RowType: 'coe',    Title: 'Head',    NoticeMonthsOverride: 3 },
      { RowType: 'coe',    Title: 'Lead SE', NoticeMonthsOverride: 2 },
      { RowType: 'coe',    Title: 'Lead SE', NoticeMonthsOverride: 2 },
      { RowType: 'coe',    Title: 'QA',      NoticeMonthsOverride: 1 },
      { RowType: 'legacy', Title: 'Old',     NoticeMonthsOverride: 6 },
    ],
    // Every role overrides — the default group is still listed, empty.
    rowsAllOverride: [
      { RowType: 'coe', Title: 'Lead', NoticeMonthsOverride: 2 },
    ],
  },

  // N-278 — compare cells. `zagreb38` is the 38-head column of Chris's amended
  // Key Figures — Comparison slide (StartMonth 2027-01, so M10 = Oct 27 and
  // M31 = Jul 29). `costlier` has a steady state ABOVE the legacy baseline and
  // no payback; `noLegacy` has no baseline at all.
  lciCompare: {
    startMonth: '2027-01',
    pctDp: { saving: 1, costPerHead: 0 },
    zagreb38: {
      totalSpend: 6497201, peakSpend: 487238, peakMonth: 10, avgFeePerHire: 7816,
      steadyMonthly: 201152, steadyAnnual: 2413820,
      legacyBaseline: 302739, legacyAnnual: 3632869,
      annualSaving: 1219049, annualSavingPct: 1219049 / 3632869,
      costPerHead: 5293, legacyCostPerHead: 8143, costPerHeadDeltaPct: 0.35,
      totalHires: 38, finalHeadcount: 38, lastHireMonth: 11, payrollMonth: 12,
      payback: { month: 31, status: 'ok' }, steadyReached: true,
    },
    costlier: {
      totalSpend: 900000, peakSpend: 90000, peakMonth: 3, avgFeePerHire: 1000,
      steadyMonthly: 55000, steadyAnnual: 660000,
      legacyBaseline: 50000, legacyAnnual: 600000,
      annualSaving: -60000, annualSavingPct: -0.1,
      costPerHead: 5500, legacyCostPerHead: 5000, costPerHeadDeltaPct: -0.1,
      totalHires: 10, finalHeadcount: 10, lastHireMonth: 4, payrollMonth: 5,
      payback: { month: null, status: 'none' }, steadyReached: true,
    },
    noLegacy: {
      totalSpend: 500000, peakSpend: 50000, peakMonth: 2, avgFeePerHire: null,
      steadyMonthly: 40000, steadyAnnual: 480000,
      legacyBaseline: 0, legacyAnnual: 0,
      annualSaving: null, annualSavingPct: null,
      costPerHead: 4000, legacyCostPerHead: null, costPerHeadDeltaPct: null,
      totalHires: 0, finalHeadcount: 0, lastHireMonth: 0, payrollMonth: null,
      payback: { month: null, status: 'na' }, steadyReached: false,
    },
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
    // Midday-UTC headroom boundary (N-136). A canonical CoE date, plus the
    // zones that bracket the limit. Etc/GMT-11 is UTC+11 and Etc/GMT-12 is
    // UTC+12 — the POSIX sign convention is INVERTED, so these read backwards
    // from what the names suggest. Getting that wrong makes the boundary
    // assertion pass for the wrong reason.
    middayHeadroom: {
      stored:   '2026-07-01T12:00:00Z',
      intended: '01 Jul',
      okZone:   'Etc/GMT-11',        // UTC+11 — inside the ±11h headroom
      breakZone:'Etc/GMT-12',        // UTC+12 — the exact breaking point
      realZone: 'Pacific/Auckland',  // +12 winter / +13 summer
      extreme:  'Pacific/Kiritimati',// +14
    },
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

  // Analytics layer, round 2 (N-098) — computeVelocityScore,
  // computeRoleFunnel, and computeMonthlyRows' split-fee revenue path
  // (N-116 — untested since it shipped). Its isRoleFlagged days-open
  // fixtures were removed by N-274 (rule retired).
  analytics2: {
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
    // N-327: unbilled SDM on a split-fee customer -- no fees, Billed 'No'.
    splitFeeUnbilled: {
      assignments: [
        {
          AssignmentID: 'SF-2',
          EmployeeName: 'Unbilled Sdm',
          Level: 'SDM',
          Customer: 'Acme',
          ProjectType: 'Exec Search',
          Country: 'UK',
          Billed: 'No',
          StartDate: '2024-03-10',
          EndDate: '2024-05-20',
          RetainerFee: null,
          PlacementFee: null,
        },
      ],
    },
  },
  // N-383 (DA-3): SLA calc engine. One Embedded project (900) with default
  // targets 7 / 2 / 30 / 45; openDay D = 2026-10-19 (a Monday), so scenarios
  // span the 25 Oct 2026 BST→GMT change. tests/assert-sla-engine.js builds each
  // scenario from these by day offset from D.
  slaEngine: {
    openDay: '2026-10-19',
    project: { id: 900, ProjectType: 'Embedded' },
    slaRows: [
      { id: 1, Title: 'Default · Embedded', ProjectType: 'Embedded',
        FirstSubmissionDays: 7, SubmissionsPerWeek: 2, TimeToOfferDays: 30, TimeToHireDays: 45 },
      { id: 2, Title: 'Default · CoE', ProjectType: 'CoE', TimeToHireDays: 45 },
    ],
    role: { id: 50, Stage: 'Sourcing', ProjectIDLookupId: 900 },
    hc:   { id: 500, RoleID: 50, ProjectID: 900, Sequence: 1, OpenDate: '2026-10-19T12:00:00Z', Status: 'Open' },
  },

  // N-384: SLA panel and Company tile. today is a Wednesday (local noon is built in the test).
  // The projects feed slaPortfolioModel; roles / headcount label the breach rows.
  slaPanel: {
    today: '2026-10-21',
    projects: [
      { id: 1, CustomerName: 'Alpha' }, { id: 2, CustomerName: 'Beta' }, { id: 3, CustomerName: 'Gamma' },
      { id: 4, CustomerName: 'Delta' }, { id: 5, CustomerName: 'Zeta' },
    ],
    roles: [
      { id: 50, RoleTitle: 'Engineer', Location: 'Lisbon' },
      { id: 51, RoleTitle: 'Designer' },
    ],
    headcount: [
      { id: 501, RoleID: 50, Sequence: 1, Title: 'Headcount 1' },
      { id: 502, RoleID: 50, Sequence: 2 },
      { id: 503, RoleID: 51, Sequence: 3, Title: 'Headcount 3' },
    ],
  },

  // N-387 (DA-7): Rejection Intelligence engine. Project 10 (four roles) has
  // 10 linked rejections (claims); project 20 (two roles) has 3 (no claim).
  // Role 102's title differs from the LCI title only in case / whitespace;
  // role 104 has no Location (no currency). Expected values are in
  // tests/assert-rejection-intel.js.
  rejectionIntel: {
    roles: [
      { id: 101, RoleTitle: 'Senior Java Developer',         Location: 'Romania',  Department: 'Engineering', ProjectIDLookupId: 10 },
      { id: 102, RoleTitle: '  senior   JAVA developer ',    Location: 'Romania',  Department: 'Engineering', ProjectIDLookupId: 10 },
      { id: 103, RoleTitle: 'Data Engineer',                 Location: 'Portugal', Department: 'Data',        ProjectIDLookupId: 10 },
      { id: 104, RoleTitle: 'QA Engineer',                   Location: '',         Department: 'Engineering', ProjectIDLookupId: 10 },
      { id: 201, RoleTitle: 'Product Manager',               Location: 'UK',       Department: 'Product',     ProjectIDLookupId: 20 },
      { id: 202, RoleTitle: 'Data Analyst',                  Location: 'UK',       Department: 'Data',        ProjectIDLookupId: 20 },
    ],
    models: [
      { id: 1, Location: 'Bucharest, Romania',     LocalCurrency: 'RON', Status: 'Won' },
      { id: 2, Location: 'Lisbon, Portugal',       LocalCurrency: 'EUR', Status: 'Draft' },
      { id: 3, Location: 'London, United Kingdom', LocalCurrency: 'GBP', Status: 'Lost' },
      { id: 4, Location: 'Bucharest',              LocalCurrency: 'RON', Status: 'Won' },
    ],
    lciRows: [
      { id: 1001, ModelIDLookupId: 1, RowType: 'coe',    Title: 'Senior Java Developer', AnnualSalary: 60000 },
      { id: 1002, ModelIDLookupId: 1, RowType: 'coe',    Title: 'senior java developer', AnnualSalary: 70000 },
      { id: 1003, ModelIDLookupId: 1, RowType: 'coe',    Title: 'Senior Java Developer', AnnualSalary: 80000 },
      { id: 1004, ModelIDLookupId: 1, RowType: 'legacy', Title: 'Senior Java Developer', AnnualSalary: 999999 },
      { id: 1005, ModelIDLookupId: 1, RowType: 'coe',    Title: '',                      AnnualSalary: 50000 },
      { id: 1006, ModelIDLookupId: 1, RowType: 'coe',    Title: 'Senior Java Developer', AnnualSalary: '' },
      { id: 2001, ModelIDLookupId: 2, RowType: 'coe',    Title: 'Data Engineer',         AnnualSalary: 40000 },
      { id: 2002, ModelIDLookupId: 2, RowType: 'coe',    Title: 'Data Engineer',         AnnualSalary: 44000 },
      { id: 3001, ModelIDLookupId: 3, RowType: 'coe',    Title: 'Product Manager',       AnnualSalary: 70000 },
      { id: 3002, ModelIDLookupId: 3, RowType: 'coe',    Title: 'Product Manager',       AnnualSalary: 75000 },
      { id: 3003, ModelIDLookupId: 3, RowType: 'coe',    Title: 'Product Manager',       AnnualSalary: 80000 },
      { id: 4001, ModelIDLookupId: 4, RowType: 'coe',    Title: 'Senior Java Developer', AnnualSalary: 10000 },
      { id: 9001, ModelIDLookupId: 99, RowType: 'coe',   Title: 'Senior Java Developer', AnnualSalary: 5000 },
    ],
    rejections: [
      { id: 1,  RoleIDLookupId: '101', Title: 'Candidate One',      RejectionReason: 'Salary',                   SalaryOffered: '63,000', RejectionDate: '2026-09-01T12:00:00Z', Notes: 'private note' },
      { id: 2,  RoleIDLookupId: '101', Title: 'Candidate Two',      RejectionReason: 'Salary',                   SalaryOffered: '56000',  RejectionDate: '2026-09-02T12:00:00Z', Notes: 'private note' },
      { id: 3,  RoleIDLookupId: '102', Title: 'Candidate Three',    RejectionReason: 'Counter-offer',            SalaryOffered: '77000',  RejectionDate: '2026-09-03T12:00:00Z' },
      { id: 4,  RoleIDLookupId: '101', Title: 'Candidate Four',     RejectionReason: 'Salary',                   SalaryOffered: '45k',    RejectionDate: '2026-09-04T12:00:00Z' },
      { id: 5,  RoleIDLookupId: '101', Title: 'Candidate Five',     RejectionReason: 'Motivations',              SalaryOffered: 14000,    RejectionDate: '2026-09-05T12:00:00Z' },
      { id: 6,  RoleIDLookupId: '103', Title: 'Candidate Six',      RejectionReason: 'Salary',                   SalaryOffered: 42000,    RejectionDate: '2026-09-06T12:00:00Z' },
      { id: 7,  RoleIDLookupId: '104', Title: 'Candidate Seven',    RejectionReason: 'Other',                    SalaryOffered: 50000,    RejectionDate: '2026-09-07T12:00:00Z' },
      { id: 8,  RoleIDLookupId: '101', Title: 'Candidate Eight',    RejectionReason: 'Visa issues',              SalaryOffered: '',       RejectionDate: null },
      { id: 9,  RoleIDLookupId: '102', Title: 'Candidate Nine',     RejectionReason: 'Salary',                   SalaryOffered: '66500',  RejectionDate: '2026-09-09T12:00:00Z' },
      { id: 10, RoleIDLookupId: '201', Title: 'Candidate Ten',      RejectionReason: 'Took another opportunity', SalaryOffered: '75,000', RejectionDate: '2026-09-10T12:00:00Z' },
      { id: 11, RoleIDLookupId: '202', Title: 'Candidate Eleven',   RejectionReason: 'Salary',                   SalaryOffered: 30000,    RejectionDate: '2026-09-11T12:00:00Z' },
      { id: 12, RoleIDLookupId: '201', Title: 'Candidate Twelve',   RejectionReason: 'Counter-offer',            SalaryOffered: '81000',  RejectionDate: '2026-09-12T12:00:00Z' },
      { id: 13, RoleIDLookupId: '999', Title: 'Candidate Thirteen', RejectionReason: 'Salary',                   SalaryOffered: 60000,    RejectionDate: '2026-09-13T12:00:00Z' },
      { id: 14, RoleIDLookupId: '103', Title: 'Candidate Fourteen', RejectionReason: 'Salary',                   SalaryOffered: 41000,    RejectionDate: '2026-09-14T12:00:00Z' },
    ],
    // Role 103 / TP c logs an interview with no submission: the clamp case.
    activity: [
      { RoleIDLookupId: '101', TalentPartner: 'a@x', WeekEndingDate: '2026-09-06T12:00:00Z', Submitted: 6, Interview1: 3, Offers: 1 },
      { RoleIDLookupId: '101', TalentPartner: 'a@x', WeekEndingDate: '2026-09-13T12:00:00Z', Submitted: 4, Interview1: 2, Offers: 0 },
      { RoleIDLookupId: '101', TalentPartner: 'b@x', WeekEndingDate: '2026-09-06T12:00:00Z', Submitted: 6, Interview1: 4, Offers: 1 },
      { RoleIDLookupId: '102', TalentPartner: 'a@x', WeekEndingDate: '2026-09-20T12:00:00Z', Submitted: 8, Interview1: 3, Offers: 0 },
      { RoleIDLookupId: '103', TalentPartner: 'c@x', WeekEndingDate: '2026-09-20T12:00:00Z', Submitted: 0, Interview1: 2, Offers: 0 },
      { RoleIDLookupId: '201', TalentPartner: 'd@x', WeekEndingDate: '2026-09-20T12:00:00Z', Submitted: 8, Interview1: 4, Offers: 1 },
      { RoleIDLookupId: '999', TalentPartner: 'e@x', WeekEndingDate: '2026-09-20T12:00:00Z', Submitted: 50, Interview1: 50, Offers: 50 },
    ],
  },
  // ── N-393: Newton for Claude reporting tools (tests/mcp-tools-check.js) ──
  // Served by a fixture Graph through the real MCP loader, so rows use the INTERNAL column
  // names (Title, Currency, InterviewTwoPlus) and normaliseFields runs for real.
  // Dates are offsets materialised against the run's today: { d: -30 } = 30 days ago,
  // { w: 2 } = the week-ending Sunday two weeks before the current week (WeekEndingDate).
  // Every restricted field the tools read carries a SENTINEL (ZZQ-..., or a 6-digit number
  // listed in `sentinels`) that must never appear in any tool output (N-393 AC 9).
  //
  // Hand-derived expectations (CONFIG.ROLE_FLAG budgets: Sourcing 15 d, Submitted 7 d,
  // Interview 1 7 d; pace cumulative Sourcing 15, Submitted 22, Interview 1 29, Offered 45):
  //   Projects 101 Acme Bank, 102 Bluefin Labs (clients), 103 Momentum Internal (internal),
  //   104 Corvid LCI (no dashboard), 105 Delta Old (Closed).
  //   Open pipelines: 201 (stuck 30 d in Sourcing, behind), 202 (low conversion: 6 submitted,
  //   1 interview in 6 weeks), 203, 206, 208 (internal; stuck 40 d, behind), 209 (Offered:
  //   never stuck; behind - oldest open headcount 60 d). Flagged: 201, 202, 208.
  //   Acme Bank: 6 pipelines - Backlog 1, Sourcing 1, Submitted 1, Interview 1 1, Closed 1,
  //   On-hold 1; open 3, flagged 2, behind 1 -> RAG red (2/3 > 0.50); open dated headcount 3
  //   (301, 303, 304; 302 has no Open Date); hires in the last 13 weeks: 1 (placement 401,
  //   60 days, on its target day -> 100 % on time).
  //   Offers accepted in the last 30 days: 401 (Acme, 60 d, on time), 402 (Bluefin, 35 d,
  //   5 days late), 403 (internal - excluded company-wide) -> 2, avg 48 d, 50 % on time.
  //   Engineering + Spain hires in the last year: 402 (35), 404 (60), 406 (50) -> 3 events.
  //   Impossible funnels: 209 (Offers 2 > Interview1 1 - acknowledged), 206 (Responses 18 >
  //   Outreach 12 - open). Company activity, last 4 weeks, client only: 3 weeks, Outreach 92.
  //   Scorecard customers: Acme Bank, Bluefin Labs (internal / LCI / expired excluded).
  mcp: {
    sentinels: ['ZZQ-', '918273', '827364', '736455', '645546', '554433', '774411', '885522', 'zzq.member@mg.co', '4.4417'],   // N-394 adds RetainerFee, PlacementFee, a staff email, a SalesForecast headcount
    lists: {
      Projects: [
        { id: '101', Title: 'Acme Bank',         ProjectType: 'Embedded', Status: 'Active', DeliveryManager: 'dm.one@mg.co', CSDName: 'Casey Director', StartDate: { d: -300 }, EndDate: { d: 300 }, Notes: 'ZZQ-NOTE-P101' },
        { id: '102', Title: 'Bluefin Labs',      ProjectType: 'CoE',      Status: 'Active', DeliveryManager: 'dm.one@mg.co', CSDName: 'Casey Director', StartDate: { d: -300 }, EndDate: { d: 300 }, Notes: 'ZZQ-NOTE-P102' },
        { id: '103', Title: 'Momentum Internal', ProjectType: 'Internal', Status: 'Active', DeliveryManager: 'dm.one@mg.co', CSDName: '', StartDate: { d: -300 }, Notes: 'ZZQ-NOTE-P103' },
        { id: '104', Title: 'Corvid LCI',        ProjectType: 'LCI',      Status: 'Active', DeliveryManager: '', CSDName: '', StartDate: { d: -100 }, Notes: 'ZZQ-NOTE-P104' },
        { id: '105', Title: 'Delta Old',         ProjectType: 'Embedded', Status: 'Closed', DeliveryManager: '', CSDName: '', StartDate: { d: -900 }, EndDate: { d: -400 }, Notes: 'ZZQ-NOTE-P105' },
      ],
      Roles: [
        { id: '201', ProjectIDLookupId: 101, Title: 'Backend Engineer', Stage: 'Sourcing',        TalentPartner: 'tp.one@mg.co', OpenDate: { d: -30 },  Currency: 'Portugal', Department: 'Engineering', Priority: 'High',   Backfill: false, Budget: 827364, HiringManager: 'ZZQ-HM-201', Notes: 'ZZQ-NOTE-201' },
        { id: '202', ProjectIDLookupId: 101, Title: 'Data Analyst',     Stage: 'Submitted',       TalentPartner: 'tp.two@mg.co', OpenDate: { d: -12 },  Currency: 'Portugal', Department: 'Data',        Priority: 'Medium', Backfill: false, Budget: 827364, HiringManager: 'ZZQ-HM-202', Notes: 'ZZQ-NOTE-202' },
        { id: '203', ProjectIDLookupId: 101, Title: 'QA Engineer',      Stage: 'Interview 1',     TalentPartner: 'tp.one@mg.co', OpenDate: { d: -10 },  Currency: 'Spain',    Department: 'Engineering', Priority: 'Low',    Backfill: true,  Budget: 827364, HiringManager: 'ZZQ-HM-203', Notes: 'ZZQ-NOTE-203' },
        { id: '204', ProjectIDLookupId: 101, Title: 'Product Owner',    Stage: 'Closed',          TalentPartner: 'tp.two@mg.co', OpenDate: { d: -80 },  Currency: 'Portugal', Department: 'Product',     Budget: 827364, HiringManager: 'ZZQ-HM-204', Notes: 'ZZQ-NOTE-204' },
        { id: '205', ProjectIDLookupId: 101, Title: 'Designer',         Stage: 'On-hold',         TalentPartner: 'tp.one@mg.co', OpenDate: { d: -70 },  Currency: 'Portugal', Department: 'Design',      Budget: 827364, HiringManager: 'ZZQ-HM-205', Notes: 'ZZQ-NOTE-205' },
        { id: '206', ProjectIDLookupId: 102, Title: 'ML Engineer',      Stage: 'Sourcing',        TalentPartner: 'tp.one@mg.co;tp.two@mg.co', OpenDate: { d: -5 }, Currency: 'Spain', Department: 'Engineering', Budget: 827364, HiringManager: 'ZZQ-HM-206', Notes: 'ZZQ-NOTE-206' },
        { id: '207', ProjectIDLookupId: 102, Title: 'Platform Lead',    Stage: 'Cancelled',       TalentPartner: 'tp.one@mg.co', OpenDate: { d: -260 }, Currency: 'Spain',    Department: 'Engineering', Budget: 827364, HiringManager: 'ZZQ-HM-207', Notes: 'ZZQ-NOTE-207' },
        { id: '208', ProjectIDLookupId: 103, Title: 'Recruiter',        Stage: 'Sourcing',        TalentPartner: 'tp.two@mg.co', OpenDate: { d: -40 },  Currency: 'UK',       Department: 'Talent',      Budget: 827364, HiringManager: 'ZZQ-HM-208', Notes: 'ZZQ-NOTE-208' },
        { id: '209', ProjectIDLookupId: 102, Title: 'SRE',              Stage: 'Offered',         TalentPartner: 'tp.one@mg.co', OpenDate: { d: -60 },  Currency: 'Spain',    Department: 'Engineering', Budget: 827364, HiringManager: 'ZZQ-HM-209', Notes: 'ZZQ-NOTE-209' },
        { id: '210', ProjectIDLookupId: 101, Title: 'Future Role',      Stage: 'Backlog',         TalentPartner: '',             Currency: 'Portugal', Department: 'Engineering', Budget: 827364, HiringManager: 'ZZQ-HM-210', Notes: 'ZZQ-NOTE-210' },
        { id: '211', ProjectIDLookupId: 102, Title: 'DevOps Engineer',  Stage: 'Closed',          TalentPartner: 'tp.one@mg.co', OpenDate: { d: -150 }, Currency: 'Spain',    Department: 'Engineering', Budget: 827364, HiringManager: 'ZZQ-HM-211', Notes: 'ZZQ-NOTE-211' },
      ],
      RoleHeadcount: [
        { id: '301', Title: 'Headcount 1', RoleID: 201, ProjectID: 101, Sequence: 1, Status: 'Open',      OpenDate: { d: -30 }, TargetHireDate: { d: 20 }, Notes: 'ZZQ-NOTE-HC' },
        { id: '302', Title: 'Headcount 2', RoleID: 201, ProjectID: 101, Sequence: 2, Status: 'Open',      Notes: 'ZZQ-NOTE-HC' },
        { id: '303', Title: 'Headcount 1', RoleID: 202, ProjectID: 101, Sequence: 1, Status: 'Open',      OpenDate: { d: -12 }, TargetHireDate: { d: 30 }, Notes: 'ZZQ-NOTE-HC' },
        { id: '304', Title: 'Headcount 1', RoleID: 203, ProjectID: 101, Sequence: 1, Status: 'Open',      OpenDate: { d: -10 }, Notes: 'ZZQ-NOTE-HC' },
        { id: '305', Title: 'Headcount 1', RoleID: 204, ProjectID: 101, Sequence: 1, Status: 'Open',      OpenDate: { d: -80 }, TargetHireDate: { d: -20 }, Notes: 'ZZQ-NOTE-HC' },
        { id: '306', Title: 'Headcount 2', RoleID: 204, ProjectID: 101, Sequence: 2, Status: 'Cancelled', OpenDate: { d: -80 }, CancelledDate: { d: -50 }, Notes: 'ZZQ-NOTE-HC' },
        { id: '307', Title: 'Headcount 1', RoleID: 206, ProjectID: 102, Sequence: 1, Status: 'Open',      OpenDate: { d: -5 }, Notes: 'ZZQ-NOTE-HC' },
        { id: '308', Title: 'Headcount 1', RoleID: 208, ProjectID: 103, Sequence: 1, Status: 'Open',      OpenDate: { d: -40 }, Notes: 'ZZQ-NOTE-HC' },
        { id: '309', Title: 'Headcount 1', RoleID: 209, ProjectID: 102, Sequence: 1, Status: 'Open',      OpenDate: { d: -60 }, Notes: 'ZZQ-NOTE-HC' },
        { id: '310', Title: 'Headcount 2', RoleID: 209, ProjectID: 102, Sequence: 2, Status: 'Open',      OpenDate: { d: -60 }, TargetHireDate: { d: -30 }, Notes: 'ZZQ-NOTE-HC' },
      ],
      Placements: [
        { id: '401', Title: 'ZZQ-CANDIDATE-401', RoleIDLookupId: 204, TalentPartner: 'tp.two@mg.co', SalaryAgreed: 918273, Currency: 'EUR', OfferAcceptedDate: { d: -20 },  ProvisionalStartDate: { d: 10 }, HeadcountID: 305, Notes: 'ZZQ-NOTE-PL' },
        { id: '402', Title: 'ZZQ-CANDIDATE-402', RoleIDLookupId: 209, TalentPartner: 'tp.one@mg.co', SalaryAgreed: 918273, Currency: 'EUR', OfferAcceptedDate: { d: -25 },  ProvisionalStartDate: { d: 5 },  HeadcountID: 310, Notes: 'ZZQ-NOTE-PL' },
        { id: '403', Title: 'ZZQ-CANDIDATE-403', RoleIDLookupId: 208, TalentPartner: 'tp.two@mg.co', SalaryAgreed: 918273, Currency: 'GBP', OfferAcceptedDate: { d: -15 },  HeadcountID: null, Notes: 'ZZQ-NOTE-PL' },
        { id: '404', Title: 'ZZQ-CANDIDATE-404', RoleIDLookupId: 207, TalentPartner: 'tp.one@mg.co', SalaryAgreed: 918273, Currency: 'EUR', OfferAcceptedDate: { d: -200 }, HeadcountID: null, Notes: 'ZZQ-NOTE-PL' },
        { id: '405', Title: 'ZZQ-CANDIDATE-405', RoleIDLookupId: 204, TalentPartner: 'tp.two@mg.co', SalaryAgreed: 918273, Currency: 'EUR', OfferAcceptedDate: { d: -400 }, HeadcountID: null, Notes: 'ZZQ-NOTE-PL' },
        { id: '406', Title: 'ZZQ-CANDIDATE-406', RoleIDLookupId: 211, TalentPartner: 'tp.one@mg.co', SalaryAgreed: 918273, Currency: 'EUR', OfferAcceptedDate: { d: -100 }, HeadcountID: null, Notes: 'ZZQ-NOTE-PL' },
      ],
      RoleHistory: [
        { id: '501', RoleIDLookupId: 201, Field: 'Stage', OldValue: null, NewValue: 'Sourcing', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -30 } },
        { id: '502', RoleIDLookupId: 201, Field: 'Budget', OldValue: '736455', NewValue: '645546', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -29 } },
        { id: '503', RoleIDLookupId: 201, Field: 'HiringManager', OldValue: '', NewValue: 'ZZQ-HM-HIST', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -28 } },
        { id: '504', RoleIDLookupId: 201, Field: 'Notes', OldValue: '', NewValue: 'ZZQ-NOTE-HIST', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -27 } },
        { id: '505', RoleIDLookupId: 202, Field: 'Stage', OldValue: null, NewValue: 'Sourcing', ChangedBy: 'tp.two@mg.co', ChangedAt: { d: -12 } },
        { id: '506', RoleIDLookupId: 202, Field: 'Stage', OldValue: 'Sourcing', NewValue: 'Submitted', ChangedBy: 'tp.two@mg.co', ChangedAt: { d: -3 } },
        { id: '507', RoleIDLookupId: 203, Field: 'Stage', OldValue: null, NewValue: 'Sourcing', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -10 } },
        { id: '508', RoleIDLookupId: 203, Field: 'Stage', OldValue: 'Sourcing', NewValue: 'Interview 1', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -2 } },
        { id: '509', RoleIDLookupId: 204, Field: 'Stage', OldValue: null, NewValue: 'Sourcing', ChangedBy: 'tp.two@mg.co', ChangedAt: { d: -80 } },
        { id: '510', RoleIDLookupId: 204, Field: 'Stage', OldValue: 'Offered', NewValue: 'Closed', ChangedBy: 'tp.two@mg.co', ChangedAt: { d: -20 } },
        { id: '511', RoleIDLookupId: 206, Field: 'Stage', OldValue: null, NewValue: 'Sourcing', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -5 } },
        { id: '512', RoleIDLookupId: 207, Field: 'Stage', OldValue: null, NewValue: 'Sourcing', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -260 } },
        { id: '513', RoleIDLookupId: 207, Field: 'Stage', OldValue: 'Sourcing', NewValue: 'Cancelled', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -190 } },
        { id: '514', RoleIDLookupId: 208, Field: 'Stage', OldValue: null, NewValue: 'Sourcing', ChangedBy: 'tp.two@mg.co', ChangedAt: { d: -40 } },
        { id: '515', RoleIDLookupId: 209, Field: 'Stage', OldValue: null, NewValue: 'Sourcing', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -60 } },
        { id: '516', RoleIDLookupId: 209, Field: 'Stage', OldValue: 'Interview 2+', NewValue: 'Final Interview', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -20 } },
        { id: '517', RoleIDLookupId: 209, Field: 'Stage', OldValue: 'Final Interview', NewValue: 'Offered', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -15 } },
        { id: '518', RoleIDLookupId: 211, Field: 'Stage', OldValue: null, NewValue: 'Sourcing', ChangedBy: 'tp.one@mg.co', ChangedAt: { d: -150 } },
        { id: '519', RoleIDLookupId: 211, Field: 'Stage', OldValue: 'Offered', NewValue: 'Closed', ChangedBy: 'ext.editor@mg.co', ChangedAt: { d: -100 } },
      ],
      WeeklyActivity: [
        { id: '601', RoleIDLookupId: 201, ProjectIDLookupId: 101, TalentPartner: 'tp.one@mg.co', WeekEndingDate: { w: 1 }, Outreach: 30, Responses: 2, Screened: 1, Submitted: 0, Interview1: 0, InterviewTwoPlus: 0, FinalInterview: 0, Offers: 0, Hires: 0 },
        { id: '602', RoleIDLookupId: 202, ProjectIDLookupId: 101, TalentPartner: 'tp.two@mg.co', WeekEndingDate: { w: 1 }, Outreach: 20, Responses: 5, Screened: 4, Submitted: 3, Interview1: 0, InterviewTwoPlus: 0, FinalInterview: 0, Offers: 0, Hires: 0 },
        { id: '603', RoleIDLookupId: 202, ProjectIDLookupId: 101, TalentPartner: 'tp.two@mg.co', WeekEndingDate: { w: 2 }, Outreach: 20, Responses: 5, Screened: 4, Submitted: 3, Interview1: 1, InterviewTwoPlus: 0, FinalInterview: 0, Offers: 0, Hires: 0 },
        { id: '604', RoleIDLookupId: 203, ProjectIDLookupId: 101, TalentPartner: 'tp.one@mg.co', WeekEndingDate: { w: 1 }, Outreach: 10, Responses: 4, Screened: 4, Submitted: 4, Interview1: 3, InterviewTwoPlus: 1, FinalInterview: 0, Offers: 0, Hires: 0 },
        { id: '605', RoleIDLookupId: 206, ProjectIDLookupId: 102, TalentPartner: 'tp.one@mg.co', WeekEndingDate: { w: 1 }, Outreach: 12, Responses: 3, Screened: 0, Submitted: 0, Interview1: 0, InterviewTwoPlus: 0, FinalInterview: 0, Offers: 0, Hires: 0 },
        { id: '606', RoleIDLookupId: 206, ProjectIDLookupId: 102, TalentPartner: 'tp.one@mg.co', WeekEndingDate: { w: 2 }, Outreach: 0,  Responses: 15, Screened: 0, Submitted: 0, Interview1: 0, InterviewTwoPlus: 0, FinalInterview: 0, Offers: 0, Hires: 0 },
        { id: '607', RoleIDLookupId: 209, ProjectIDLookupId: 102, TalentPartner: 'tp.one@mg.co', WeekEndingDate: { w: 3 }, Outreach: 0,  Responses: 0, Screened: 0, Submitted: 1, Interview1: 1, InterviewTwoPlus: 1, FinalInterview: 1, Offers: 2, Hires: 0 },
        { id: '608', RoleIDLookupId: 208, ProjectIDLookupId: 103, TalentPartner: 'tp.two@mg.co', WeekEndingDate: { w: 1 }, Outreach: 50, Responses: 10, Screened: 5, Submitted: 2, Interview1: 1, InterviewTwoPlus: 0, FinalInterview: 0, Offers: 0, Hires: 0 },
        { id: '609', RoleIDLookupId: 204, ProjectIDLookupId: 101, TalentPartner: 'tp.two@mg.co', WeekEndingDate: { w: 12 }, Outreach: 40, Responses: 10, Screened: 6, Submitted: 5, Interview1: 3, InterviewTwoPlus: 2, FinalInterview: 1, Offers: 1, Hires: 1 },
      ],
      UserAssignments: [
        { id: '701', Title: 'tp.one@mg.co', UserName: 'Tess One',     AssignedRole: 'talent_partner',   ProjectID: 101 },
        { id: '702', Title: 'tp.two@mg.co', UserName: 'Tom Two',      AssignedRole: 'talent_partner',   ProjectID: 101 },
        { id: '703', Title: 'dm.one@mg.co', UserName: 'Dana Manager', AssignedRole: 'delivery_manager', ProjectID: 101 },
      ],
      Assignments: [
        { id: '801', Title: 'A-801', EmployeeName: 'Tess One',     Customer: 'Acme Bank',         StartDate: { d: -100 }, EndDate: { d: 100 }, Billed: 'Yes', MonthlyBillRate: 554433 },
        { id: '802', Title: 'A-802', EmployeeName: 'Tom Two',      Customer: 'Bluefin Labs',      StartDate: { d: -100 }, EndDate: { d: 100 }, Billed: 'Yes', MonthlyBillRate: 554433 },
        { id: '803', Title: 'A-803', EmployeeName: 'Dana Manager', Customer: 'Momentum Internal', StartDate: { d: -100 }, EndDate: { d: 100 }, Billed: 'No',  MonthlyBillRate: 554433 },
        { id: '804', Title: 'A-804', EmployeeName: 'Tess One',     Customer: 'Corvid LCI',        StartDate: { d: -100 }, EndDate: { d: 100 }, Billed: 'Yes', MonthlyBillRate: 554433 },
        { id: '805', Title: 'A-805', EmployeeName: 'Tom Two',      Customer: 'Delta Old',         StartDate: { d: -500 }, EndDate: { d: -400 }, Billed: 'Yes', MonthlyBillRate: 554433 },
        // N-394 People tools. Project Team of Acme Bank (ProjectID 101): 809 current lead DM, 808 upcoming,
        // 807 ended, 810 forecast (never a member); 811 is Bluefin's. 806 is a Sync Bench row (blank
        // Customer, so no scorecard customer is added); Bea Bench / Eve Ended have no current row.
        { id: '806', Title: 'B-806', EmployeeName: 'Ben Blank',    Customer: '',                  StartDate: { d: -20 },  EndDate: { d: 200 }, Billed: 'No',  Level: 'PTP', AutoGenerated: true },
        { id: '807', Title: 'A-807', EmployeeName: 'Eve Ended',    Customer: 'Acme Bank',         StartDate: { d: -60 },  EndDate: { d: -30 }, Billed: 'Yes', Level: 'TP',  ProjectID: 101, UserEmail: 'zzq.member@mg.co', MonthlyBillRate: 554433, RetainerFee: 774411, PlacementFee: 885522 },
        { id: '808', Title: 'A-808', EmployeeName: 'Una Upcoming', Customer: 'Acme Bank',         StartDate: { d: 10 },   EndDate: { d: 100 }, Billed: 'Yes', Level: 'STP', ProjectID: 101, UserEmail: 'zzq.member@mg.co', MonthlyBillRate: 554433 },
        { id: '809', Title: 'A-809', EmployeeName: 'Dana Manager', Customer: 'Acme Bank',         StartDate: { d: -100 }, EndDate: { d: 100 }, Billed: 'No',  Level: 'SDM', ProjectID: 101, UserEmail: 'dm.one@mg.co', IsLeadDM: true, MonthlyBillRate: 554433 },
        { id: '810', Title: 'F-810', EmployeeName: 'Tom Two',      Customer: 'Acme Bank',         StartDate: { d: -10 },  EndDate: { d: 90 },  Billed: 'Yes', Level: 'STP', ProjectID: 101, IsForecast: true, MonthlyBillRate: 554433 },
        { id: '811', Title: 'A-811', EmployeeName: 'Tom Two',      Customer: 'Bluefin Labs',      StartDate: { d: -50 },  EndDate: { d: 50 },  Billed: 'Yes', Level: 'STP', ProjectID: 102, MonthlyBillRate: 554433 },
      ],
      // N-394: People (Title -> EmployeeName). Bench = Bea (no rows), Ben (Sync Bench row), Eve (only an ended row).
      People: [
        { id: '1001', Title: 'Tess One',     Level: 'TP',  Location: 'Lisbon', StartDate: { d: -700 }, IsActive: true },
        { id: '1002', Title: 'Tom Two',      Level: 'STP', Location: 'Porto',  StartDate: { d: -700 }, IsActive: true },
        { id: '1003', Title: 'Dana Manager', Level: 'SDM', Location: 'London', StartDate: { d: -700 }, IsActive: true },
        { id: '1004', Title: 'Bea Bench',    Level: 'TP',  Location: 'Porto',  StartDate: { d: -300 }, IsActive: true },
        { id: '1005', Title: 'Ben Blank',    Level: 'PTP', Location: 'London', StartDate: { d: -300 }, IsActive: true },
        { id: '1006', Title: 'Eve Ended',    Level: 'TP',  Location: 'Madrid', StartDate: { d: -300 }, IsActive: true },
        { id: '1007', Title: 'Cara Director', Level: 'CSD', Location: 'London', StartDate: { d: -900 }, IsActive: true },
        { id: '1008', Title: 'Ivy Internal', Level: '',    Location: 'London', StartDate: { d: -300 }, IsActive: true, StaffType: 'Internal', StaffFunction: 'Finance' },
        { id: '1009', Title: 'Pat Placeholder', Level: 'TP', Location: '',      IsActive: true, IsPlaceholder: true },
        { id: '1010', Title: 'Old Leaver',   Level: 'TP',  Location: 'Lisbon', StartDate: { d: -900 }, EndDate: { d: -100 }, IsActive: false },
      ],
      // N-394: SalesForecasts. ForecastedHeadcount is read locally for the forecast %, never returned.
      SalesForecasts: [
        { id: '951', Title: 'Forecast A', ForecastStartDate: { d: 30 },  ForecastEndDate: { d: 120 }, ForecastedHeadcount: 4.4417 },
        { id: '952', Title: 'Forecast B', ForecastStartDate: { d: -400 }, ForecastEndDate: { d: -300 }, ForecastedHeadcount: 4.4417 },
      ],
      AnomalyAcks: [
        { id: '901', Title: 'funnel · 209', CheckType: 'funnel', SubjectKey: '209', Signature: 'Offers:2>Interview1:1', Note: 'ZZQ-ACKNOTE', AcknowledgedBy: 'dm.one@mg.co', AcknowledgedAt: '2026-10-01T09:00:00Z', Status: 'active' },
      ],
    },
  },
};
