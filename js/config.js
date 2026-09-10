// js/config.js — App configuration and role helpers

const CONFIG = {
  TENANT_ID:    "b73023b1-298a-42a2-bed9-985e0a762054",
  CLIENT_ID:    "bf71f2b2-de80-4728-9189-af8659fbd2b6",
  AUTHORITY:    "https://login.microsoftonline.com/b73023b1-298a-42a2-bed9-985e0a762054",
  REDIRECT_URI: "https://momentumglobal.github.io/newton/",
  SP_SITE_URL:  "https://talentpoint.sharepoint.com/sites/SolutionsHubReporting",
  SP_SITE_ID:   "talentpoint.sharepoint.com,330e562f-0ba1-4fd8-ae06-ffe3a9287271,b864c9c9-6fe0-4837-9713-5aaa4530de0d",
  GP_INVOICE_DRIVE_ID: 'b!L1YOM6EL2E-uBv_jqShyccnJZLjgbzdIlxNaqkUw3g1MjqGliBUrRY2BqPmtPnw5',
  // Notes preview: chars of the first line shown before a "See more" toggle appears.
  NOTES_PREVIEW_CHARS: 60,
  // Org Chart: a manager with this many direct reports (or more) renders them
  // stacked vertically off a single spine instead of side-by-side, to keep the
  // chart narrow enough for the one-page landscape PDF.
  // Stack at 2+ so every multi-report manager reads the same way down the chart.
  ORG_STACK_THRESHOLD: 2,
  // Node kinds that never stack their children, however many they have. The
  // leadership/CSD rows are few, wide and structural — stacking them buries the
  // top of the hierarchy. Width accumulates further down, so stack there instead.
  ORG_STACK_EXEMPT_KINDS: ['leader', 'csd'],
  // Bubble type used for a synthetic (placeholder-only) team that has no Projects row.
  ORG_PLACEHOLDER_PROJECT_TYPE: 'Internal',
  // Written on every placeholder created in-app. SharePoint marks these People
  // columns required, but nothing ever reads them for a placeholder — getPeople()
  // filters placeholders out for every other consumer. Location must NOT be 'UK':
  // that is the value gating the salary and payroll paths. StartDate is historic
  // so it falls outside every joiner/payroll window; T12:00:00Z avoids the BST shift.
  ORG_PLACEHOLDER_DEFAULTS: {
    ContractType: 'Core',
    Location:     'Global',
    StartDate:    '2000-01-01T12:00:00Z',
  },
  // Hardcoded admin users — full access, never overridden by SharePoint data
  ADMIN_USERS:  ["admin@momentumglobal.co", "chris.friend@momentumglobal.co", "aliyah@momentumglobal.co", "jon.stanners@momentumglobal.co"],

  // People.Level enum, in display/sort-rank order (N-117). Single source of
  // truth for the Add/Edit Employee dropdown and for level sort order —
  // every levelOrder map in the codebase should read from this via
  // utils.js:levelSortIndex() rather than redeclaring its own copy.
    PEOPLE_LEVELS: ['CSD', 'SDM', 'PTP', 'STP', 'TP'],

  // Roles.Stage enum, in pipeline order (N-149). Single source of truth for
  // the full role Stage <select> (forms.js) and the Roles-list inline stage
  // dropdown (pages.js) — never redeclare this list in a page file.
  ROLE_STAGES: ['Backlog', 'Planning', 'Sourcing', 'Submitted', 'Interview 1',
                'Interview 2+', 'Final Interview', 'Offered', 'Hired',
                'On-hold', 'Cancelled'],
  // Stages that carry side effects (ActualHireDate, placement records) and so
  // must only ever be set via the full role form, never the inline dropdown.
  // Deliberately narrower than analytics.js's ACTIVE_STAGES, which mixes
  // KPI/velocity scoping with two stage values ('Placed', 'Closed') that
  // don't exist in this build — do not reuse it here.
  ROLE_STAGE_TERMINAL: ['Hired', 'Cancelled'],

  // Stages hidden from the weekly-activity role picker (single form and bulk
  // grid both read this — N-164). Deliberately distinct from ACTIVE_STAGES in
  // analytics.js, which references 'Placed'/'Closed', stage values that don't
  // exist in this build — do not reuse it here.
  ROLE_STAGES_ACTIVITY_EXCLUDED: ['Backlog', 'Hired', 'On-hold', 'Cancelled'],

  // ── Project types (N-116) ─────────────────────────────────────────
  // TWO enums, deliberately. Projects.ProjectType gates the Hiring Plan page,
  // the LCI link picker and the Report Builder CoE panel, so its dropdown stays
  // narrow. Assignments.ProjectType is the wider delivery-shape enum.
  // Never redeclare either list in a page file.
  PROJECT_TYPES:            ['Embedded', 'CoE', 'Exec Search', 'MG AI'],
  ASSIGNMENT_PROJECT_TYPES: ['Embedded', 'CoE', 'Transformation', 'LCI',
                             'Exec Search', 'MG AI', 'Internal'],

  // Types that bill on a retainer + placement-fee split rather than a monthly
  // rate. Drives the conditional fee fields on the Assignment and Sales Forecast
  // forms, and the revenue-recognition branch in utils.js.
  SPLIT_FEE_PROJECT_TYPES: ['Exec Search', 'MG AI'],

  // Types excluded from revenue reporting (People Dashboard "By project type").
  NON_REVENUE_PROJECT_TYPES: ['Internal'],

  // Token NAMES, not hex — the values live in the :root block in style.css.
  // Consumed by the Deployment Timeline bars/legend and the Org Chart bubbles.
  PROJECT_TYPE_COLOUR_VARS: {
    'Embedded':       'var(--c-ptype-embedded)',
    'CoE':            'var(--c-ptype-coe)',
    'Transformation': 'var(--c-ptype-transformation)',
    'LCI':            'var(--c-ptype-lci)',
    'Exec Search':    'var(--c-ptype-exec-search)',
    'MG AI':          'var(--c-ptype-mg-ai)',
    'Internal':       'var(--c-ptype-internal)',
  },
  PROJECT_TYPE_COLOUR_FALLBACK: 'var(--c-ptype-fallback)',

  // RAG status colour map (N-123). Token NAMES, not hex — consolidates the
  // duplicated {green,amber,red,grey} object literal previously hardcoded in
  // cc-pages.js. mobile-scorecards.js keeps its own distinct amber
  // (var(--c-warn-text)) — do not repoint it at this map, its amber is a
  // different shade. mobile-analytics.js / placement-analytics.js use a
  // different palette entirely (Palette B) and are NOT consolidated here.
  RAG_COLOUR_VARS: {
    green: 'var(--status-success)',
    amber: 'var(--status-warn-strong)',
    red:   'var(--status-danger)',
    grey:  'var(--text-muted)',
  },

  // Candidate briefing packs (N-211). CONFIDENTIAL_TEXT is fixed and prints on
  // every page of every pack — it is deliberately not editable per pack.
  BRIEFING_PACK: {
    // Fixed wording — only the client name varies. {client} is substituted at
    // render time by bpConfidentialText(); the NO_CLIENT variant is used
    // verbatim when a pack has no client name, so it never prints a stray "for".
        CONFIDENTIAL_TEXT: 'Confidential — prepared by Momentum Global for {client}. Not for onward distribution.',
    CONFIDENTIAL_TEXT_NO_CLIENT: 'Confidential — prepared by Momentum Global. Not for onward distribution.',
    CONTENTS_HEADING: 'Contents',
    // N-213 QA F3: `ch` is the width of "0"; at 75 Polymath rendered ~100
    // characters per line. 58 lands near the intended 65-75.
    MEASURE_CH: 48,
    // Cover and closing swirl. Tunable without a code change.
    SWIRL_OPACITY: 0.38,
    // Client logo upload cap. Base64 inflates by ~33%, and the row lives in
    // ClientLogos, never on the cached Projects payload.
    CLIENT_LOGO_MAX_BYTES: 150000,
    DEFAULT_CONTACT_TITLE: 'Talent Partner',
    TABLE_DEFAULT_ROWS: 3,
    TABLE_DEFAULT_COLS: 3,
  },

    // Field projection manifest (F-1). Per-list array of INTERNAL SharePoint
  // column names to request via Graph $select — NOT the aliased names
  // normaliseFields()/FIELD_ALIASES produce. 'Id' is implied automatically
  // by getItems() if omitted; no need to list it here.
  // Any list absent from this map falls back to fields($select=*).
  //
  // Rules for adding a list (N-052/N-053):
  //  • Names are INTERNAL. The alias table in api.js is the translation —
  //    e.g. Roles 'Title'→RoleTitle and 'Currency'→Location; WeeklyActivity
  //    'Yeare'→Year and 'InterviewTwoPlus'→Interview2Plus — the only list
  //    that still carries either alias (N-175 removed both from Roles and
  //    Placements, both confirmed dead there). Never put an aliased name
  //    in here.
  //  • Lookup columns need BOTH entries — Graph exposes 'ProjectID' and
  //    'ProjectIDLookupId' separately and Newton reads both.
  //  • List the FULL business-column set, not a minimal read set. The saving
  //    comes from excluding SharePoint's system columns (Created, Modified,
  //    Author, Editor, Attachments, ContentType, _UIVersion*, Compliance*,
  //    App*, OData__*), none of which Newton reads. Trimming business columns
  //    buys little and reintroduces silent-undefined risk.
  //  • An OMITTED field returns undefined silently; an UNKNOWN field makes
  //    Graph return 400. Verify every name against the live list before
  //    shipping, and do a key-set diff against $select=* after.
  LIST_FIELDS: {
    Roles: [
      // N-053: 'ProjectID' dropped — only 'ProjectIDLookupId' is ever read
      // (dashboard.js:103, pages.js:116-128, admin.js:220-250 all check
      // LookupId first; the display-name fallback is dead).
      'Title', 'ProjectIDLookupId', 'Stage', 'TalentPartner',
      'OpenDate', 'TargetHireDate', 'ActualHireDate', 'CurrentStartDate',
      'Budget', 'Currency', 'Priority', 'Backfill', 'Department',
      'HiringManager', 'Notes',
    ],
    WeeklyActivity: [
      // N-053: 'RoleID' and 'ProjectID' dropped — same dead-fallback reason.
      'Title', 'RoleIDLookupId', 'ProjectIDLookupId',
      'Yeare', 'WeekNumber', 'WeekEndingDate', 'TalentPartner',
      'Outreach', 'Responses', 'Screened', 'Submitted', 'Interview1',
      'InterviewTwoPlus', 'FinalInterview', 'Offers', 'Hires', 'SubmittedAt',
    ],
    Placements: [
      // N-053: 'RoleID' dropped — same dead-fallback reason.
      'Title', 'RoleIDLookupId', 'TalentPartner', 'SalaryAgreed',
      'Currency', 'OfferAcceptedDate', 'ProvisionalStartDate', 'TimeToHire',
      'Notes',
    ],
    // N-094 (F-2b): this list had no entry at all, so it stayed on
    // fields($select=*). These are the complete read set across js/ —
    // 'Yeare' is deliberately absent: FIELD_ALIASES registers it, but no
    // writer sets it and no reader uses it. An UNKNOWN field returns 400 for
    // every fetch, so it stays out until the live list is checked.
    // N-153: 'RejectionDate' added — the list's first temporal column.
    RejectedOffers: [
      'Title', 'RoleIDLookupId', 'SalaryOffered', 'RejectionReason', 'Notes',
      'RejectionDate',
    ],
    // ── N-053 (F-1c) ──────────────────────────────────────────────────
    Projects: [
      'Title', 'DeliveryManager', 'Status', 'ProjectType', 'StartDate',
      'EndDate', 'Notes', 'CSDName',
    ],
    People: [
      'Title', 'Level', 'ContractType', 'Location', 'StartDate', 'EndDate',
      'IsActive', 'Salary', 'PhotoUrl', 'IsPlaceholder', 'PlaceholderProject',
      'PlaceholderCSD', 'ReportsTo',
    ],
    LCIModels: [
      'Title', 'Status', 'ClientName', 'ProjectID', 'Location',
      'LocalCurrency', 'DisplayCurrency', 'FXRateLocalToDisplay', 'StartMonth',
      'HorizonMonths', 'AssignedDMEmail', 'EmployerBurdenPct', 'SalaryMonths',
      'OfficeCostPerHead', 'EoRFeePerHead', 'SectionsEnabled', 'Assumptions',
      'NoticeMonths',
    ],
    LCIModelRows: [
      'Title', 'RowType', 'Team', 'CareerLevel', 'AnnualSalary', 'BonusPct',
      'Quantity', 'ExitMonth', 'LegacyCategory', 'NoticeMonthsOverride',
      'MonthValues', 'SortOrder', 'ModelIDLookupId',
    ],
    LCIMilestones: [
      'Title', 'StartMonth', 'EndMonth', 'SortOrder', 'ModelIDLookupId',
    ],
    LCIReports: [
      'Title', 'ModelIDs', 'Observations', 'CreatedByEmail',
    ],
    LCILocations: [
      'Title', 'EmployerBurdenPct', 'FXRateToGBP', 'Currency',
      'Sal_SoftwareEngineering', 'Sal_Technology', 'Sal_Product',
      'Sal_SalesGTM', 'Sal_CustomerSuccess', 'Sal_Finance', 'Sal_Marketing',
      'Sal_Operations', 'Sal_HR', 'Sal_Legal',
    ],
    CoEPlanRows: [
      'Title', 'ProjectID', 'TalentPartner', 'OpenDate', 'RecruitmentWeeks',
      'NoticeWeeks', 'OnboardingWeeks', 'LinkedRoleID', 'SortOrder',
    ],
    CoEPlanForecast: [
      'ProjectID', 'ForecastMonth', 'ForecastedHires',
    ],
    Notifications: [
      'Title', 'RecipientEmail', 'CreatedAt', 'IsRead', 'Tone', 'Body',
      'Status', 'TriggerKey', 'TriggerType', 'DeepLink',
    ],
    // ── Time-series snapshots (N-085 / L-1a) ───────────────────
    Snapshots: [
      'Title', 'ProjectIDLookupId', 'WeekEndingDate', 'OpenRoles',
      'RolesByStage', 'AvgDaysOpen', 'PlacementsInPeriod', 'ActivityTotals',
      'FlaggedCount', 'Utilisation', 'CreatedAt',
    ],
    // ── Client-side error telemetry (N-172 / F-7a) ──────────────
    // Full business-column set, per the rules above. 'OccurredAt' is a TEXT
    // column holding an ISO 8601 string, deliberately not a SharePoint Date
    // and Time column — see the note in the N-172 spec. 'ErrorType' and
    // 'Status' are written by the engine and read by N-173.
    Diagnostics: [
      'Title', 'UserEmail', 'Module', 'Page', 'Message', 'Stack',
      'UserAgent', 'OccurredAt', 'ErrorType', 'Status',
    ],
  },

  // ── SharePoint list-view threshold guard (F-10 / N-092) ────────────
  // Row-count warning threshold shown on Admin > Data Health. This is the
  // amber warning line, not the SharePoint hard limit — the hard limit
  // (5,000 rows scanned by a filtered/sorted query on an unindexed column)
  // is fixed by SharePoint itself and is not configurable.
  LIST_ROW_COUNT_WARNING_THRESHOLD: 4000,

  // N-154 (F-10b). Data Health watches EVERY list registered in
  // FIELD_ALIASES. This is the opt-OUT, and it ships empty on purpose.
  //
  // Before N-154 the watched set was Object.keys(CONFIG.LIST_FIELDS) — a map
  // that exists for field projection, not monitoring — so a list was watched
  // only as a side effect of someone having optimised its payload, and 15 of
  // 29 lists were invisible to the threshold guard. Any opt-IN registry
  // recreates that: the next list gets added to FIELD_ALIASES and forgotten
  // here. Add a name below only with a comment saying why it does not need
  // watching, and expect it to be named on the Data Health tab.
  DATA_HEALTH_EXCLUDED_LISTS: [],

  // N-174 (F-11a). Columns the Schema Check panel never reports as
  // "Unexpected", regardless of whether a list's FIELD_ALIASES/LIST_FIELDS
  // entry mentions them. 'Title' physically exists on every SharePoint
  // list, but 9 lists register FIELD_ALIASES as {} (no alias) and
  // CoEPlanForecast's LIST_FIELDS entry omits it on purpose (never read) —
  // without this exclusion those rows would show a permanent false
  // "Unexpected: Title" that isn't a real schema problem.
  //
  // The rest of this array is SharePoint's own built-in list-item columns.
  // Originally this filter relied on getListColumns()'s `hidden` flag
  // instead (see api.js history) — that was proven wrong in QA (20 Aug
  // 2026): a live console check against Newton's own tenant showed
  // `_ColorTag` and `Author` — both genuine SharePoint system columns —
  // coming back `hidden: false`. `readOnly` doesn't substitute either
  // (`Attachments` is a real built-in field but `readOnly: false`). Name is
  // the only signal that actually works here. This list is small and
  // stable — Microsoft hasn't changed these internal names in years — so
  // the maintenance cost is low.
  SCHEMA_CHECK_IGNORE_COLUMNS: [
    'Title',
    'ID', 'ContentType', 'Created', 'Modified', 'Author', 'Editor',
    'Attachments', 'Edit', 'LinkTitle', 'LinkTitleNoMenu', 'DocIcon',
    'ItemChildCount', 'FolderChildCount', '_UIVersionString', '_ColorTag',
    'ComplianceAssetId', '_ComplianceFlags', '_ComplianceTag',
    '_ComplianceTagWrittenTime', '_ComplianceTagUserId', '_IsRecord',
    'AppAuthor', 'AppEditor',
  ],

  // Columns indexed so N-093 (F-2) can push filtering server-side.
  // These are the base SharePoint columns (the ones SharePoint indexes),
  // NOT the Graph shadow properties Newton reads data through — e.g.
  // 'ProjectID' here is the lookup column itself, distinct from
  // 'ProjectIDLookupId' in CONFIG.LIST_FIELDS.
  // Placements has no ProjectID column of its own (only RoleIDLookupId), so
  // it cannot be project-scoped server-side at all — N-093 confirmed this
  // against forms.js:submitPlacementForm, which never persists the form's
  // project dropdown. Placements is date-scoped instead, on
  // OfferAcceptedDate, which is why that column joins this list.
  INDEX_TARGETS: [
    { list: 'Roles',           column: 'ProjectID' },
    { list: 'Roles',           column: 'Stage' },
    { list: 'WeeklyActivity',  column: 'WeekEndingDate' },
    { list: 'Placements',      column: 'OfferAcceptedDate' },
    // N-094 (F-2b): the Project Dashboard scopes Placements and
    // RejectedOffers by the project's role-id set, because neither list has
    // a ProjectID column. That is an OR chain on a lookup column — index it
    // or it becomes the exact shape SharePoint degrades on.
    { list: 'Placements',      column: 'RoleID' },
    { list: 'RejectedOffers',  column: 'RoleID' },
    // N-153: the list's first date column, so N-152 can window on it.
    { list: 'RejectedOffers',  column: 'RejectionDate' },
  ],

  // N-093 (F-2a). Above this many assigned projects, getRolesForUser stops
  // fanning out one filtered request per project and falls back to a single
  // unfiltered fetch — past this point the request storm costs more than the
  // payload it saves.
  SCOPE_FANOUT_MAX: 25,

  // N-094 (F-2b). Ceiling on the role-id OR chain built by _odataIn(). Above
  // this many roles on one project, the query drops the clause and the
  // caller falls back to an unfiltered fetch plus its existing client-side
  // filter — past this point the URL length and the OR-chain scan cost more
  // than the payload they save.
  ROLE_ID_FILTER_MAX: 40,

  // N-093 (F-2a). Options for the Weekly Activity period selector, in weeks.
  // 0 means "All time" and must produce NO date clause at all.
  DATE_WINDOW_WEEKS: [13, 26, 52, 0],
  // N-158: a server-side `ge` bound cannot match a null WeekEndingDate, so
  // any non-zero default here SILENTLY DROPS every WeeklyActivity row with
  // no WeekEndingDate from the Activity list page — the four
  // weekEndingDate(Year, WeekNumber) fallback call sites (dashboard-core.js,
  // dashboard-company.js, dashboard-project-panels.js x2) exist because such
  // rows are expected. Measured 18 Aug 2026: WeeklyActivity 184 rows total —
  // nowhere near the volume a bound exists to protect against. Revisit once
  // WeeklyActivity passes ~1,500 rows, and only after the null case is
  // handled (see the Data Health "missing WeekEndingDate" probe in api.js).
  DATE_WINDOW_DEFAULT_WEEKS: 0,

  // N-151 (T-8a). Placements gets its OWN default, not Activity's: it is a
  // far lower-volume list. Must be one of DATE_WINDOW_WEEKS.
  // N-158: same null-drop rule as DATE_WINDOW_DEFAULT_WEEKS above — a bound
  // here cannot match a null OfferAcceptedDate. Measured 18 Aug 2026:
  // Placements 18 rows total, so a year-long default was hiding rows for no
  // payload gain. Set to All time; revisit alongside DATE_WINDOW_DEFAULT_WEEKS.
  PLACEMENTS_DEFAULT_WEEKS: 0,

  // N-152 (T-8b). Rejected Offers defaults to 0 = All time, and this must NOT
  // be changed to a bounded value without first solving the null problem:
  // getRejectedOffers({fromDay}) sends `RejectionDate ge ...`, and SharePoint
  // cannot match a null against `ge`, so any bounded default SILENTLY DROPS
  // every row with no RejectionDate — including the pre-N-153 rows that were
  // deliberately never backfilled. Client-side the rule is the opposite: null
  // is always-included. The list is small enough that there is no payload win
  // to trade for that risk. See the caution comment on getRejectedOffers().
  REJECTIONS_DEFAULT_WEEKS: 0,

  // N-152 (T-8b). Render-only page sizes for long tables — these NEVER reach
  // a $filter. 0 means "All", and must render every matching row.
  PAGE_SIZES: [25, 50, 100, 0],
  PAGE_SIZE_DEFAULT: 50,

  // Maps hire location (country) to ISO currency code.
  // Used to auto-derive currency when a role is created/edited,
  // and when a placement is recorded against a role.
  COUNTRY_CURRENCY: {
    "UK":              "GBP",
    "Ireland":         "EUR",
    "Croatia":         "EUR",
    "Germany":         "EUR",
    "France":          "EUR",
    "Netherlands":     "EUR",
    "Spain":           "EUR",
    "Portugal":        "EUR",
    "USA":             "USD",
    "Canada":          "CAD",
    "Australia":       "AUD",
    "Singapore":       "SGD",
    "UAE":             "AED",
    "South Africa":    "ZAR",
    "Sri Lanka":       "LKR",
    "Tunisia":         "TND",
    "Romania":         "RON",
    "Poland":          "PLN",
    "India":           "INR",
    "Philippines":     "PHP",
    "Mexico":          "MXN",
    "Brazil":          "BRL",
    "Vietnam":         "VND",
    "Egypt":           "EGP",
    "Turkey":          "TRY",
    "Bulgaria":        "BGN",
    "Hungary":         "HUF",
    "Czech Republic":  "CZK",
    "Colombia":        "COP",
    "Argentina":       "ARS",
    "Peru":            "PEN",
    "Costa Rica":      "CRC",
    "Denmark":         "DKK",
    "Serbia":          "RSD",
    "Estonia":         "EUR",
    "Sweden":          "SEK",
    "Belgium":         "EUR",
    "Slovakia":        "EUR",
    "Finland":         "EUR", 
  },

  ANALYTICS_BENCHMARKS: {
  outreachConversion:   0.25,  // 25% — Outreach → Response
  submissionConversion: 0.80,  // 80% — Submitted → Interview 1
  interviewToOffer:     0.20,  // 20% (5:1) — Interview 1 → Offer
  offerSuccess:         0.80,  // 80% — Offer → Hire
  timeToHireDays:       45,    // 45 days
  flagThreshold:        0.80,  // flag at 80% of benchmark
},

  UTILISATION_THRESHOLDS: {
  green: 0.85,  // >= 85% billed = healthy
  amber: 0.75,  // >= 75% billed = watch
  // < 75% = red — colour values in style.css as .cc-tile--red etc.
},

  // Monthly estimated revenue bands — Sales > Revenue Tracking chart
  REVENUE_THRESHOLDS: {
  green: 225000,  // >= £225k / month = healthy
  amber: 200000,  // >= £200k / month = watch
  // < £200k = red
},

  // CoE Hiring Plan — default phase lengths in weeks.
  // Per-row overrides live on the CoEPlanRows list.
  // Handover excluded from v1 (planned for later).
  COE_PHASE_DEFAULTS: {
    recruitmentWeeks: 7,   // R — Open Date → offer accepted
    noticeWeeks:      4,   // N — offer accepted → start
    onboardingWeeks:  6,   // O — start → fully onboarded
    weeksPerNoticeMonth: 4, // months→weeks for LCI notice carried into the plan (N-077)
  },

  // Graph 429/503 retry (N-082): total attempts incl. the first; backoff
  // doubles from baseDelayMs unless SharePoint sends a Retry-After header.
  GRAPH_RETRY: { maxAttempts: 4, baseDelayMs: 1000 },

  // Build stamp (N-176 / F-3a). BUMP THIS BY HAND ON EVERY DEPLOY that
  // changes js/ or the shape of any list's data. Every sessionStorage cache
  // key embeds it, and api.js discards on load any entry stamped with a
  // different build — that is the whole deploy-busts-the-cache mechanism.
  // Deliberately separate from sw.js's SW_VERSION: a service worker cannot
  // read config.js and the two have different lifecycles. Bump both.
  APP_BUILD: '2026-09-08a',

  // Two-tier read cache (N-176 / F-3a). Tier 1 is the 30s in-memory Map in
  // api.js and is NOT configured here. This block configures tier 2, the
  // sessionStorage tier that survives navigation.
  // `enabled: false` is a live kill switch — it takes effect on the next
  // read, with no reload.
  // persistentLists (N-177 / F-3b): the REFERENCE lists — data that is read
  // on nearly every page and edited rarely, by an admin, from one place.
  // This array is the single source of truth for enrolment; no list name
  // appears in api.js.
  //
  // NEVER ADD A TRANSACTIONAL LIST HERE. Roles, WeeklyActivity, Placements,
  // Assignments and RoleHistory are the lists a user edits and immediately
  // expects to see change; they stay on tier 1's 30s TTL. N-084 (assignments
  // edited, org chart still showing five people as Unassigned) is what this
  // rule exists to prevent, and a 10-minute TTL would make that class worse.
  //
  // Before enrolling anything new, confirm every write to it goes through
  // createItem/updateItem/deleteItem — those are the only paths that call
  // _cacheInvalidate(). A raw graphRequest('POST'|'PATCH'|'DELETE', ...)
  // against an enrolled list leaves stale data for the full TTL.
  CACHE: {
    enabled:         true,
    prefix:          'newton_cache',
    ttlMs:           600000,   // 10 minutes
    maxEntryBytes:   262144,   // skip persisting anything larger
    persistentLists: [
      'Projects',
      'People',
      'Departments',
      'LCILocations',
      'UserAssignments',
      'LeadershipAccess',
    ],
  },

  // Delta queries (N-186 / F-13a, N-187 / F-13b). Replaces a full
  // re-fetch-and-recache on a tier-1/tier-2 miss with an incremental sync:
  // only rows Graph says changed since the stored deltaLink come back over
  // the wire.
  //
  // A delta-enrolled list's unfiltered read (filter === "") is the only case
  // this engine touches — SharePoint list-item delta queries do not support
  // $filter. Any filtered read against an enrolled list is unaffected: it
  // falls through to the existing tier-1/tier-2/paginated-fetch path exactly
  // as it does today. This is a CLOSED design question, not a gap to revisit
  // — there is no partial $delta + $filter composition to build. A filtered
  // read either gets restructured to read unfiltered and filter client-side
  // (a page-level redesign, not this engine's job) or stays on the paged
  // path permanently.
  //
  // N-187 call-site catalogue — config.js is the single source of truth for
  // which lists are enrolled, so this is where a future reader should look
  // rather than re-deriving it from pages.js/api.js. Full reasoning +
  // measured row counts: newton-pipeline/specs/N-187.md.
  //
  // WeeklyActivity — delta-eligible (unfiltered): admin.js:170 (Config Panel
  //   delete-records list), admin.js:326 (Data Health/Snapshots sweep),
  //   dashboard-company.js:160 (Company Dashboard), pages.js:390 (Activity
  //   page — eligible only while DATE_WINDOW_DEFAULT_WEEKS stays 0; a user
  //   narrowing the window re-introduces a filter for that one read),
  //   report-builder.js:411 (unscoped comparison pull).
  // WeeklyActivity — permanent paged fallback (always filtered):
  //   dashboard-core.js:93 and report-builder.js:388 (ProjectID-scoped),
  //   market-report.js:128 (RoleID-scoped), getWeeklyActivityNullProjectCount
  //   / getWeeklyActivityNullWeekEndingCount (integrity probes — need the
  //   null filter), getWeeklyActivityForWeek (exact-week lookup), every
  //   getActivityForAnalytics() caller (analytics-pages.js, cc-pages.js x2,
  //   dashboard-project.js, mobile-analytics.js, mobile-scorecards.js,
  //   placement-analytics.js — all pass a real weeksBack, never 0).
  //
  // Placements — delta-eligible (unfiltered): admin.js:196 (Config Panel
  //   delete-records list), admin.js:326 (Data Health/Snapshots sweep),
  //   pages.js:565 (Placements page — eligible only while
  //   PLACEMENTS_DEFAULT_WEEKS stays 0 AND no month/quarter/year chip is
  //   picked), placement-analytics.js:22, report-builder.js:389 and :412.
  // Placements — permanent paged fallback (always filtered): coe-plan.js:139
  //   (RoleID-scoped), dashboard-core.js:98 (RoleID-set-scoped via
  //   _odataIn — Project Dashboard).
  //
  // NEVER add RejectedOffers (or any other list) here without a ticket that
  // names it — it shares getRejectedOffers()'s identical filter shape and is
  // tempting to add "while we're here," but it isn't in F-13's scope.
  DELTA: {
    enabled:       false,  // HOTFIX (temporary): delta responses for these
                            // two lists are coming back with no `fields`
                            // object, so every column but id was rendering
                            // as undefined. Flipped off to force the full
                            // paginated fetch until the delta engine's
                            // Graph $expand shape is fixed properly.
    enrolledLists: ['WeeklyActivity', 'Placements'],
  },

  // $batch request coalescing (N-188 / F-14). GET-only, never elevated —
  // concurrent reads that land in the same macrotask window (e.g. Company
  // Dashboard's and Report Builder's Promise.all cohorts) are bundled into
  // one POST /$batch call instead of N separate round trips, each with its
  // own token acquisition. maxSubRequests is Graph's own documented
  // per-$batch limit, not a tuning knob — don't raise it chasing "more
  // savings". Full design: newton-pipeline/specs/N-188.md.
  BATCH: {
    enabled:        true,   // live kill switch — false makes every call go
                             // straight through _graphRequestSolo, exactly
                             // as before N-188, no $batch call ever made
    maxSubRequests: 20,
  },

  // Client-side error telemetry (N-172 / F-7a). js/diagnostics.js reads
  // these on EVERY captured error, so `enabled: false` is a live kill
  // switch — it takes effect with no reload.
  // maxPerSession is a HARD cap per browser-tab session, counted in
  // sessionStorage and spent even when the write itself fails: that is what
  // stops a broken write path becoming an unbounded loop against SharePoint.
  DIAGNOSTICS: {
    enabled:         true,
    maxPerSession:   20,
    maxMessageChars: 1000,
    maxStackChars:   2000,
  },
  
  // Single source of truth for the module switcher dropdown.
  // To add a new module, add it here only — all nav files reference this.
  // NOTE: People is visible to DM + TP so they can reach People Scorecards.
  // The People module's own nav (people-router.js) restricts them to the
  // Scorecards page only; data scoping is applied in renderScorecardsPage.
  OS_MODULES: [
    { key: 'reporting', name: 'Reporting',        icon: 'bar-chart-2',  href: 'reporting.html',        live: true, roles: ['admin','delivery_manager','talent_partner','leadership'] },
    { key: 'marketing', name: 'Market Analytics', icon: 'brain',        href: 'market-reporting.html', live: true, roles: ['admin','delivery_manager','talent_partner'] },
    { key: 'people',    name: 'People',           icon: 'users',        href: 'people.html',           live: true, roles: ['admin','leadership','delivery_manager','talent_partner'] },
    // NOTE: Sales is visible to DMs for the LCI Cost Models page only.
    // sales-router.js restricts DMs to that page; model visibility is
    // scoped to AssignedDMEmail in lci-pages.js.
    { key: 'sales',     name: 'Sales',            icon: 'trending-up',  href: 'sales.html',            live: true, roles: ['admin','leadership','delivery_manager'] },
    { key: 'command',   name: 'Command Centre',   icon: 'monitor',      href: 'command-centre.html',   live: true, roles: ['admin','leadership'] },
  ],

  // Quick Links — declarative config for the homepage drawer.
  // To add a new link: add one entry here only. No other files need changing.
    QUICK_LINKS: [
    { label: 'Roles',              icon: 'briefcase',  href: 'reporting.html#roles',                roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { label: '+ Log Activity',     icon: 'activity',   href: 'reporting.html#activity?action=add',  roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { label: '+ Record Placement', icon: 'user-check', href: 'reporting.html#placements?action=add',roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { label: 'Log Rejection',      icon: 'user-x',     href: 'reporting.html#rejections?action=add',roles: ['admin', 'delivery_manager', 'talent_partner'] },
  ],
  // Command Bar directory (N-144) — single source of truth for the ⌘K /
  // Ctrl+K overlay's cross-module page list (js/command-bar.js).
  // Deliberately duplicates label/roles already declared per-module in
  // router.js / people-router.js / sales-router.js / cc-router.js — same
  // shape of duplication QUICK_LINKS above already carries, for the same
  // reason (a different consumer needs the same data without loading
  // every module's own script). If a page is added/removed/renamed in
  // one of those four files, mirror the change here too.
  COMMAND_BAR_PAGES: [
    // router.js — Reporting (10)
    { key: 'companyDashboard', label: 'Company Dashboard', module: 'reporting', href: 'reporting.html#companyDashboard', roles: ['admin', 'leadership'] },
    { key: 'projectDashboard', label: 'Project Dashboard',  module: 'reporting', href: 'reporting.html#projectDashboard',  roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { key: 'reportBuilder',    label: 'Report Builder',     module: 'reporting', href: 'reporting.html#reportBuilder',     roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { key: 'projects',         label: 'Projects',           module: 'reporting', href: 'reporting.html#projects',          roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { key: 'roles',            label: 'Roles',              module: 'reporting', href: 'reporting.html#roles',             roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { key: 'activity',         label: 'Weekly Activity',    module: 'reporting', href: 'reporting.html#activity',          roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { key: 'placements',       label: 'Placements',         module: 'reporting', href: 'reporting.html#placements',        roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { key: 'rejections',       label: 'Rejected Offers',    module: 'reporting', href: 'reporting.html#rejections',        roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { key: 'hiringPlan',       label: 'Hiring Plan',        module: 'reporting', href: 'reporting.html#hiringPlan',        roles: ['admin', 'delivery_manager', 'talent_partner', 'leadership'] },
    { key: 'adminPanel',       label: 'Config Panel',       module: 'reporting', href: 'reporting.html#adminPanel',        roles: ['admin'] },
    // people-router.js — People (7)
    { key: 'peopleDashboard', label: 'People Dashboard',    module: 'people', href: 'people.html#peopleDashboard', roles: ['admin', 'leadership'] },
    { key: 'orgChart',        label: 'Org Chart',           module: 'people', href: 'people.html#orgChart',        roles: ['admin', 'leadership', 'delivery_manager', 'talent_partner'] },
    { key: 'peopleGantt',     label: 'Deployment Timeline', module: 'people', href: 'people.html#peopleGantt',     roles: ['admin', 'leadership'] },
    { key: 'peopleTracker',   label: 'Employee Tracker',    module: 'people', href: 'people.html#peopleTracker',   roles: ['admin', 'leadership'] },
    { key: 'gpInvoices',      label: 'Supplier Invoices',   module: 'people', href: 'people.html#gpInvoices',      roles: ['admin', 'leadership'] },
    { key: 'scorecards',      label: 'People Scorecards',   module: 'people', href: 'people.html#scorecards',      roles: ['admin', 'leadership', 'delivery_manager', 'talent_partner'] },
    { key: 'engagement',      label: 'Engagement',          module: 'people', href: 'people.html#engagement',      roles: ['admin', 'leadership'] },
    // sales-router.js — Sales (4)
    { key: 'revenueTracking', label: 'Revenue Tracking', module: 'sales', href: 'sales.html#revenueTracking', roles: ['admin', 'leadership'] },
    { key: 'salesForecast',   label: 'Sales Forecast',   module: 'sales', href: 'sales.html#salesForecast',   roles: ['admin', 'leadership'] },
    { key: 'lciModels',       label: 'LCI Cost Models',  module: 'sales', href: 'sales.html#lciModels',       roles: ['admin', 'leadership', 'delivery_manager'] },
    { key: 'lciLeadMagnet',   label: 'LCI Lead Magnet',  module: 'sales', href: 'sales.html#lciLeadMagnet',   roles: ['admin', 'leadership'] },
    // cc-router.js — Command Centre (1)
    { key: 'overview', label: 'Overview', module: 'command', href: 'command-centre.html', roles: ['admin', 'leadership'] },
    // mr-router.js — Market Analytics (2) — added 18 Aug 2026, folded into
    // N-144 after Chris asked to expand scope; fits the same page/role
    // shape as the four router files above (mrCanAccess(page, role)),
    // unlike survey-router.js which stays excluded (role-only, no pages).
        { key: 'placementAnalytics', label: 'Placement Analytics',   module: 'marketing', href: 'market-reporting.html#placementAnalytics', roles: ['admin', 'delivery_manager', 'talent_partner'] },
    { key: 'marketReport',       label: 'Market Report Builder', module: 'marketing', href: 'market-reporting.html#marketReport',       roles: ['admin', 'delivery_manager', 'talent_partner'] },
  ],
  // Command Bar entity search (N-145) — maps an entity type to the
  // COMMAND_BAR_PAGES entry that owns it. Deliberately does NOT restate
  // module/roles here — command-bar.js looks those up from the matching
  // COMMAND_BAR_PAGES entry via pageKey at runtime, so there is exactly
  // one place role/module data lives per page (see command-bar.js for
  // why it can't call canAccess()/peopleCanAccess() directly instead).
    COMMAND_BAR_ENTITY_TYPES: [
    // N-146 — `actions` renders inline buttons (Log activity / Update stage /
    // Add placement) on this entity type's Command Bar rows, pre-scoped to
    // the row's record. Only Role declares any; Project/Person stay as-is.
    { type: 'role',    label: 'Role',    pageKey: 'roles',           activationKind: 'edit',   openerFn: 'showEditRoleForm',     titleField: 'RoleTitle',
      actions: [
        { key: 'logActivity',  label: 'Log activity',  icon: 'clock' },
        { key: 'updateStage',  label: 'Update stage',  icon: 'refresh-cw' },
        { key: 'addPlacement', label: 'Add placement', icon: 'user-check' },
      ] },
    // N-145 addendum (18 Aug 2026) — Project no longer opens an edit form.
    // It navigates to Project Dashboard with the filter pre-set via
    // setterFn (see js/dashboard-project.js) BEFORE navigating, not an
    // opener called after — see command-bar.js's activate() for why.
    { type: 'project', label: 'Project', pageKey: 'projectDashboard', activationKind: 'filter', setterFn: 'setDashProjectFilter', titleField: 'CustomerName' },
    { type: 'person',  label: 'Person',  pageKey: 'peopleTracker',   activationKind: 'edit',   openerFn: 'showEditPersonForm',   titleField: 'EmployeeName' },
  ],
  // Max entity results shown per type, and the minimum characters typed
  // before entity results appear at all (an empty/1-char query would
  // otherwise dump every role/person in the company into the list).
  COMMAND_BAR_ENTITY_RESULT_CAP:    8,
  COMMAND_BAR_ENTITY_MIN_QUERY_LEN: 2,
  // ── Employee Engagement ───────────────────────────────────────────────
  // Single source of truth for all survey constants.
  // No hardcoded values in engagement-pages.js, engagement-forms.js, or survey-app.js.
  SURVEY: {
    QUESTION_TYPES:       ['Rating', 'SingleChoice', 'MultiChoice', 'FreeText'],
    STATUSES:             ['Draft', 'Active', 'Closed'],
    AUDIENCES:            ['All', 'TalentPartners', 'DeliveryManagers'],
    DEFAULT_DURATION_DAYS: 14,
    REMINDER_DAY:          7,
    RATING_SCALE_MIN:      1,
    RATING_SCALE_MAX:      5,
  },

  // ── LCI Cost Model ────────────────────────────────────────────────
  // Defaults for new models; all editable per model in the Settings bar.
  // NOTE: no CURRENCIES list here — LCI currency dropdowns (LocalCurrency
  // and DisplayCurrency) are DERIVED from CONFIG.COUNTRY_CURRENCY via
  // lciCurrencyOptions(CONFIG.COUNTRY_CURRENCY) in lci-model.js.
  // Single source of truth: adding a new location/currency to
  // COUNTRY_CURRENCY automatically flows into LCI (and the Add Role modal).
  // LocalCurrency = CoE location (salaries, office, EoR, travel entered in
  // it); DisplayCurrency = customer's modelling currency (legacy/one-offs/
  // fees entered in it; all outputs render in it). FXRateLocalToDisplay
  // converts the CoE side; ignored when the two currencies match.
  LCI: {
    STATUSES:            ['Draft', 'Presented', 'Won', 'Lost'],
    SALARY_MONTHS:       [12, 13, 14],
    HORIZON_MIN:         3,
    HORIZON_MAX:         24,
    DEFAULTS: {
      HorizonMonths:     9,
      EmployerBurdenPct: 0.30,
      SalaryMonths:      12,
      OfficeCostPerHead: 300,
      EoRFeePerHead:     0,
      NoticeMonths:      1,
    },
    // CoE has no entry: it is always on (N-008 — the toggle was removed to stop
    // the roadmap being hidden mid-build by mistake). lciSections() forces it.
    // Order here drives the toggle row, which mirrors the section order down
    // the editor page.
    SECTION_LABELS: {
      travel:  'Travel',
      legacy:  'Legacy Team',
      oneoffs: 'Retention & Relocation',
      fees:    'Project Fees',
    },
    // Legacy row categories (N-010). Keys are stored in
    // LCIModelRows.LegacyCategory; blank means 'exiting', so rows created
    // before N-010 keep exactly the behaviour they had.
    //   label    — editor dropdown
    //   costLine — client-facing Cost Model row
    LEGACY_CATEGORIES: {
      exiting:  { label: 'Exiting',  costLine: 'Exiting Team Costs'  },
      retained: { label: 'Retained', costLine: 'Retained Team Costs' },
    },

    // ── Excel export (N-030) ──────────────────────────────────────
    // ExcelJS, lazy-loaded on first click only (~950KB — never on page
    // render). PIN THE VERSION: an unpinned CDN has bitten this codebase
    // before (see the Dependencies table in Readme.html).
    EXCEL: {
      CDN: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
      // Tab order is the order the builders run in — see lci-excel.js.
      SHEETS: {
        assumptions: 'Assumptions',
        roadmap:     'CoE Roadmap',
        legacy:      'Legacy Team',
        oneoffs:     'One-offs & Fees',
        calc:        'Monthly Calc',
        output:      'Output Summary',
        milestones:  'Milestones',
      },
      // ARGB, not CSS hex. Deliberate, documented exception to "no hex in
      // JS": a workbook cannot read style.css custom properties, so the
      // palette has to live somewhere in config — here, once, rather than
      // scattered through the sheet builders. `navy` must stay in step with
      // .data-table th (#0A0B44) in style.css.
      COLOURS: {
        navy:         'FF0A0B44',
        navyText:     'FFFFFFFF',
        headerFill:   'FFEDEFF5',
        subtotalFill: 'FFE4E8F2',
        totalFill:    'FFD6DCEC',
        inputFill:    'FFDCE9F7',
        derivedFill:  'FFF5F5F5',
        bandFill:     'FFEFEFEF',
      },
      // {ccy} is replaced with the model's currency code at build time —
      // a code, never a locale symbol, so EUR/RON/GBP all read unambiguously.
      FORMATS: {
        money:   '"{ccy}" #,##0',
        money2:  '"{ccy}" #,##0.00',
        integer: '#,##0',
        percent: '0.0%',
        rate:    '#,##0.0000',
      },
    },

    // ── PowerPoint export (N-224) ─────────────────────────────────
    // pptxgenjs, lazy-loaded on first click only (~450KB — never on page
    // render). PIN THE VERSION: an unpinned CDN has bitten this codebase
    // before (see the Dependencies table in Readme.html). Use the *bundle*
    // build — it carries JSZip inside it, where pptxgen.min.js expects a
    // separate JSZip global that this app does not load.
    PPTX: {
      CDN: 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js',
      // Inches. 13.333 x 7.5 is 16:9 widescreen — PowerPoint's own default.
      LAYOUT:  { name: 'LCI16x9', width: 13.333, height: 7.5 },
      MASTERS: { navy: 'LCI_NAVY', content: 'LCI_CONTENT' },
      ASSETS: {
        logoWhite: 'momentum-symbol-and-name-global-white.png',
        swirl:     'mg-visual-swirl-report.png',
      },
      // Plain 6-digit hex, NO alpha prefix. Deliberately NOT the ARGB form
      // CONFIG.LCI.EXCEL.COLOURS uses — pptxgenjs rejects 8-character values.
      // Same documented exception to "no hex in JS" the Excel export carries:
      // a deck cannot read style.css. `navy` must stay in step with
      // .data-table th (#0A0B44); `series` mirrors LCI_REPORT_COLOURS.
      COLOURS: {
        navy:         '0A0B44',
        navySteel:    '1B3A5C',
        navyText:     'FFFFFF',
        navyMuted:    'C7CBDE',
        paper:        'FFFFFF',
        accent:       'E8703A',
        subtotalFill: 'E4E8F2',
        totalFill:    'D6DCEC',
        bandFill:     'EFEFEF',
        tableBorder:  'E0E0E0',
        textBody:     '1A1A2E',
        textMuted:    '888888',
        series: ['1B3A5C', 'E8703A', '2E8B8B', '7B5EA7', 'B0578D'],
      },
      // Polymath, matching the app. It ships as three SEPARATE families —
      // 'Polymath' (regular), 'Polymath Medium', 'Polymath Semibold', each
      // with subfamily 'Regular'. The browser stitches them into one weighted
      // family via @font-face; PowerPoint cannot, so `bold: true` on
      // 'Polymath' would give synthetic faux-bold. Bold text switches FACE to
      // faceBold instead — see _lciPptxFace() in lci-pptx.js.
      //
      // gridHeader / gridCell are the month-grid sizes and mirror the print
      // stylesheet's `.lci-grid { font-size: var(--fs-10) }` step; the wider
      // tableHeader / tableCell serve the narrow tables (Assumptions, Key
      // Metrics), which @media print leaves at their normal size. 9pt is the
      // largest size at which the widest realistic figure still fits a column
      // of the densest table — measured, not guessed.
      FONT: {
        face:     'Polymath',
        faceBold: 'Polymath Semibold',
        coverTitle: 36, coverSub: 15,
        dividerTitle: 28, dividerSub: 14,
        slideTitle: 20, note: 11,
        gridHeader: 9,  gridCell: 9,
        tableHeader: 11, tableCell: 11,
        kpiValue: 20, kpiLabel: 10,
        body: 13, obsHeading: 16,
        chartLabel: 10, footer: 9,
      },
      // Slide geometry, inches. `margin` is the content slides' side margin —
      // halved from 0.6 so the month grids get the full width they need (see
      // the note on TABLE below). `navyMargin` is deliberately NOT halved: the
      // cover and divider pages have no table to widen, and their logo/title
      // composition mirrors the Momentum brand slide.
      GEO: {
        margin: 0.3, navyMargin: 0.6, gap: 0.12, rule: 0.03,
        logoW: 2.2, logoH: 0.5,
        swirlW: 4.6, swirlH: 4.6,
        titleBlockH: 1.9, titleH: 1.2, subH: 0.5,
        headingH: 0.5, noteH: 0.3,
        footerH: 0.45, footerPad: 0.06, footerTextH: 0.3, slideNumW: 0.6,
      },
      // labelColW is the month grids' fixed first column (the print rule caps
      // .lci-grid--roadmap td:first-child at 180px ≈ 1.9in). The two Frac
      // values are the narrow tables' proportional first column, as
      // .lci-assump (45%) and .lci-compare (26%) already use.
      // rowH is the height of EVERY row — header, body, subtotal and total
      // alike; the hierarchy is shading and weight, never height. 0.21in is a
      // 9pt line (0.15in) plus cellMargin's 2pt top and bottom. PowerPoint
      // treats rowH as a minimum and grows any row that needs more, so the
      // insets have to come down with it or the rows drift apart again —
      // cellMargin is [top, right, bottom, left] in POINTS and replaces
      // pptxgenjs's default 0.05in/0.1in, which is also what was eating the
      // width the widest figures needed. rowsPerSlide follows from the height:
      // (6.93 - 1.22) / 0.21 = 27 rows, minus the header.
      TABLE: {
        labelColW: 1.9, rowH: 0.21, rowsPerSlide: 26, borderPt: 0.5,
        cellMargin: [2, 3, 2, 3],
        assumpLabelFrac: 0.45, compareLabelFrac: 0.26,
      },
      KPI:   { perRow: 4, gap: 0.2, tileH: 1.35, radius: 0.06, valuePad: 0.2, valueH: 0.55, labelH: 0.35 },
      OBS:   { blocksPerSlide: 12, bulletIndent: 18 },
      CHART: { lineSize: 2, gridSize: 1 },
    },
  },

// ── LCI Lead Magnet ───────────────────────────────────────────────
  // Disciplines for the Lead Magnet location comparator. key = internal id,
  // label = UI text, col = LCILocations salary column name. Add a discipline
  // here + a matching Sal_* column on the list to extend.
  LCI_DISCIPLINES: [
    { key: 'softwareEngineering', label: 'Software Engineering', col: 'Sal_SoftwareEngineering' },
    { key: 'technology',          label: 'Technology',           col: 'Sal_Technology' },
    { key: 'product',             label: 'Product',              col: 'Sal_Product' },
    { key: 'salesGtm',            label: 'Sales/GTM',            col: 'Sal_SalesGTM' },
    { key: 'customerSuccess',     label: 'Customer Success',     col: 'Sal_CustomerSuccess' },
    { key: 'finance',             label: 'Finance',              col: 'Sal_Finance' },
    { key: 'marketing',           label: 'Marketing',            col: 'Sal_Marketing' },
    { key: 'operations',          label: 'Operations',           col: 'Sal_Operations' },
    { key: 'hr',                  label: 'HR',                   col: 'Sal_HR' },
    { key: 'legal',               label: 'Legal',                col: 'Sal_Legal' },
  ],
};

// Synchronous role check — only resolves admin (from config) or viewer
// Used for immediate UI gating (show/hide buttons)
function getUserRole(email) {
  if (CONFIG.ADMIN_USERS?.includes(email.toLowerCase())) return 'admin';
  return 'viewer';
}

// Async role check — resolves full role from SharePoint lists at runtime
// Use where accuracy matters (dashboard filtering, page access control)
async function getUserRoleAsync(email) {
  return getEffectiveRole(email);
}
