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

    // Field projection manifest (F-1). Per-list array of INTERNAL SharePoint
  // column names to request via Graph $select — NOT the aliased names
  // normaliseFields()/FIELD_ALIASES produce. 'Id' is implied automatically
  // by getItems() if omitted; no need to list it here.
  // Any list absent from this map falls back to fields($select=*).
  //
  // Rules for adding a list (N-052/N-053):
  //  • Names are INTERNAL. The alias table in api.js is the translation —
  //    e.g. Roles 'Title'→RoleTitle and 'Currency'→Location; 'Yeare'→Year on
  //    Roles/WeeklyActivity/Placements; WeeklyActivity 'InterviewTwoPlus'
  //    →Interview2Plus. Never put an aliased name in here.
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
      'HiringManager', 'Notes', 'Yeare',
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
      'Notes', 'Yeare',
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
      'Status', 'TriggerKey', 'TriggerType',
    ],
    // ── Time-series snapshots (N-085 / L-1a) ───────────────────
    Snapshots: [
      'Title', 'ProjectIDLookupId', 'WeekEndingDate', 'OpenRoles',
      'RolesByStage', 'AvgDaysOpen', 'PlacementsInPeriod', 'ActivityTotals',
      'FlaggedCount', 'Utilisation', 'CreatedAt',
    ],
  },

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
