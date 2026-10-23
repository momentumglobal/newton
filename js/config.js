// js/config.js — App configuration and role helpers

// N-352: the one place a role id is typed for page access. Declared outside
// CONFIG because CONFIG.COMMAND_BAR_PAGES (inside the literal) needs it while
// the literal is still being built; everywhere else read CONFIG.ROLE_IDS.
// The values are the AssignedRole strings — keep them equal to ROLE_PRECEDENCE
// (an assertion pins it).
const _ROLE_IDS = Object.freeze({
  ADMIN:            'admin',
  LEADERSHIP:       'leadership',
  PEOPLE_OPS:       'people_ops',
  SALES:            'sales',
  DELIVERY_MANAGER: 'delivery_manager',
  TALENT_PARTNER:   'talent_partner',
  STAFF:            'staff',
  VIEWER:           'viewer',
});

const CONFIG = {
  TENANT_ID:    "b73023b1-298a-42a2-bed9-985e0a762054",
  CLIENT_ID:    "bf71f2b2-de80-4728-9189-af8659fbd2b6",
  AUTHORITY:    "https://login.microsoftonline.com/b73023b1-298a-42a2-bed9-985e0a762054",
  REDIRECT_URI: "https://momentumglobal.github.io/newton/",
  // N-290: v5 redirect bridge, used only as the redirectUri of SILENT token
  // requests (hidden-iframe renewal). Must be registered in Entra as a
  // Single-page application redirect URI alongside REDIRECT_URI.
  SILENT_REDIRECT_URI: "https://momentumglobal.github.io/newton/redirect.html",
  SP_SITE_URL:  "https://talentpoint.sharepoint.com/sites/SolutionsHubReporting",
  SP_SITE_ID:   "talentpoint.sharepoint.com,330e562f-0ba1-4fd8-ae06-ffe3a9287271,b864c9c9-6fe0-4837-9713-5aaa4530de0d",
  // N-259 (D19): the tenant's OneDrive host. Graph hands back file-content
  // downloadUrls and copy-monitor URLs here, so it is in CSP connect-src
  // (tests/lint-csp.js checks the two agree). Never sent a bearer token.
  SP_MY_SITE_ORIGIN: "https://talentpoint-my.sharepoint.com",
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
  // N-375: node kinds that collapse/expand their org on click (only when they
  // have reports). Project and internal-function bubbles stay static.
  ORG_COLLAPSIBLE_KINDS: ['leader', 'csd', 'person'],
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
  // N-281: roles, highest first. Single source of truth for role precedence
  // (resolveRoleFromAssignments, permissions.js) and the known-role whitelist — an
  // AssignedRole value not listed here grants nothing. Admin is a
  // UserAssignments row (AssignedRole 'admin', ProjectID 0), never a list in
  // code: this file is public on GitHub Pages.
  // N-331: people_ops (People function), sales (Sales + Marketing) and staff
  // (Operations) are internal-staff roles — one UserAssignments row each,
  // ProjectID 0 (ORG_WIDE_ROLES below). Precedence decided in N-326 (D-7).
  ROLE_PRECEDENCE: ['admin', 'leadership', 'people_ops', 'sales', 'delivery_manager', 'talent_partner', 'staff', 'viewer'],
  // N-352: named role ids for router / Command Bar page access (see _ROLE_IDS above).
  ROLE_IDS: _ROLE_IDS,
  // N-282: roles that are NEVER served from a browser-writable cache
  // (sessionStorage is editable by the user, and the build stamp is public).
  // Always re-resolved from UserAssignments / LeadershipAccess. Must be a
  // subset of ROLE_PRECEDENCE. Read through isPrivilegedRole() (permissions.js).
  PRIVILEGED_ROLES: ['admin', 'leadership'],
  ROLE_LABELS: {
    admin:            'Admin',
    leadership:       'Leadership',
    people_ops:       'People Ops',
    sales:            'Sales & Marketing',
    delivery_manager: 'Delivery Manager',
    talent_partner:   'Talent Partner',
    staff:            'Staff',
    viewer:           'Viewer',
  },
  // N-331: roles whose UserAssignments row applies company-wide — always
  // ProjectID 0, never a project scope, and an inactive row grants nothing.
  // Read through isOrgWideRole() (permissions.js).
  ORG_WIDE_ROLES: ['admin', 'people_ops', 'sales', 'staff'],
  // N-331: Admin → User Assignments role dropdown, in display order. The
  // first entry is the Add form's default. Leadership is never assignable
  // here (it comes from the LeadershipAccess list).
  ASSIGNABLE_ROLES: ['talent_partner', 'delivery_manager', 'people_ops', 'sales', 'staff', 'viewer', 'admin'],
  // N-332: roles that can ANSWER the Engagement survey (survey.html access and
  // the home widget) — every internal-staff role plus TP / DM. Read through
  // isSurveyRespondentRole() (permissions.js); never re-list these at a call site.
  // admin and leadership are deliberately not respondents. Internal TA staff
  // are talent_partner. Each entry must be in ROLE_PRECEDENCE. This is NOT the
  // eligible-respondent COUNT, which comes from the People list (SURVEY.EXCLUDED_LEVELS).
  SURVEY_RESPONDENT_ROLES: ['talent_partner', 'delivery_manager', 'people_ops', 'sales', 'staff'],
  // N-331: capability → roles. Every in-page "can this role do X" check reads
  // this through roleCan() (permissions.js) — never a role literal at the call
  // site. Page access stays in the router files (*-router.js PAGES).
  ROLE_CAPABILITIES: {
    peopleFull:        ['admin', 'leadership', 'people_ops'], // full People pages, payroll view, Org Chart placeholders + reporting lines
    peopleEdit:        ['admin', 'people_ops'],               // Employee Tracker add/edit, Supplier Invoices edit
    engagementResults: ['admin', 'leadership', 'people_ops'], // Export Results, survey-closing notice
    engagementAdmin:   ['admin', 'people_ops'],               // Activate Run, Manage Template, Close Run
    salesManage:       ['admin', 'leadership', 'sales'],      // all LCI models, + New Model, assign DM
    // N-365 (PT-5, D-1): edit ANY project's Project Team (incl. rates / fees) and see
    // every project on Projects + the Project page. A DM edits only projects in their
    // own scope (canEditProjectTeam, permissions.js).
    projectTeamEdit:   ['admin', 'leadership', 'people_ops'],
  },

  // People.Level enum, in display/sort-rank order (N-117). Single source of
  // truth for the Add/Edit Employee dropdown and for level sort order —
  // every levelOrder map in the codebase should read from this via
  // utils.js:levelSortIndex() rather than redeclaring its own copy.
    PEOPLE_LEVELS: ['CSD', 'SDM', 'PTP', 'STP', 'TP'],

  // N-304: People.StaffType / StaffFunction (Single line of text columns —
  // these arrays are the only list of valid values). Blank StaffType =
  // Deployable (every row created before N-304). Internal staff have no Level
  // and never count towards utilisation, bench or deployable headcount
  // (isDeployablePerson, utils.js). STAFF_TYPE_INTERNAL doubles as the
  // PROJECT_TYPE_COLOUR_VARS key for the Org Chart function bubbles — keep
  // the two equal (an assertion pins it).
  STAFF_TYPES:           ['Deployable', 'Internal'],
  STAFF_TYPE_DEPLOYABLE: 'Deployable',
  STAFF_TYPE_INTERNAL:   'Internal',
  INTERNAL_FUNCTIONS:    ['Marketing', 'Sales', 'Internal TA', 'Operations', 'People'],

  // Roles.Stage enum, in pipeline order (N-149). Single source of truth for
  // the full role Stage <select> (forms-role.js) and the Roles-list inline stage
  // dropdown (pages.js) — never redeclare this list in a page file.
  ROLE_STAGES: ['Backlog', 'Planning', 'Sourcing', 'Submitted', 'Interview 1',
                'Interview 2+', 'Final Interview', 'Offered', 'Closed',
                'On-hold', 'Cancelled'],
  // Terminal stages — two intents, same set (N-305):
  //   (a) stages that carry side effects (the D-2 close rule and the D-1
  //       cancel cascade — N-307) and so must only ever be set via the full
  //       role form, never the inline dropdown;
  //   (b) a "finished" pipeline — command bar, mobile role list and pickers,
  //       Snapshot RolesByStage.
  // Deliberately narrower than analytics.js's ACTIVE_STAGES, which mixes
  // KPI/velocity scoping with a legacy 'Placed' and the pre-N-306 'Hired' —
  // still don't reuse it here.
  ROLE_STAGE_TERMINAL: ['Closed', 'Cancelled'],

  // Stages hidden from the weekly-activity role picker (single form and bulk
  // grid both read this — N-164). Deliberately distinct from ACTIVE_STAGES in
  // analytics.js, which carries a legacy 'Placed' and the pre-N-306 'Hired'
  // ('Closed' is live since N-306) — do not reuse it here. Currently equals
  // ROLE_STAGES_PARKED ∪ ROLE_STAGE_TERMINAL (pinned by assertion); kept as
  // its own key because the activity-picker intent may diverge.
  ROLE_STAGES_ACTIVITY_EXCLUDED: ['Backlog', 'Closed', 'On-hold', 'Cancelled'],

  // Parked — not yet started or paused; still a live pipeline (Roles page
  // "Backlog" filter). With ROLE_STAGE_TERMINAL it defines an open pipeline:
  // utils.js:isOpenPipelineStage() (N-305). Never redeclare a stage array in
  // a page file — tests/lint-stage-arrays.js fails the build.
  ROLE_STAGES_PARKED: ['Backlog', 'On-hold'],
  // Stages a role leaves the linear pipeline for (Role History timeline
  // 'branch' node — headcount.js:roleTimelineNodeClass, N-305 / N-313).
  ROLE_STAGES_BRANCH: ['On-hold', 'Cancelled'],
  // N-306: the "pipeline closed" stage (was 'Hired'). Read through this,
  // never a literal.
  ROLE_STAGE_CLOSED: 'Closed',
  // N-306: retired stage values still present in RoleHistory and in the
  // Roles list's SharePoint version history. Mapped on READ by
  // normaliseRoleStage() (headcount.js) — RoleHistory is never rewritten
  // (headcount model rule 5).
  ROLE_STAGE_LEGACY_ALIASES: { Hired: 'Closed' },

  // N-306 (HC-1): per-hire headcount (RoleHeadcount list). Status is stored;
  // "filled" is derived from Placements.HeadcountID and never stored (model
  // rule 4). The +45d target default is ANALYTICS_BENCHMARKS.timeToHireDays.
  HEADCOUNT: {
    STATUS_OPEN:      'Open',
    STATUS_CANCELLED: 'Cancelled',
    labelTemplate:    'Headcount {n}',
    // N-307: upper bound on how many headcount one Add Role / + Add
    // headcount submit creates.
    maxPerAdd:        20,
    // N-307 (D-3): default stage when adding headcount reopens a Closed or
    // Cancelled pipeline. Must be an open-pipeline stage (pinned by assertion).
    reopenStage:      'Sourcing',
  },

  // ── Project types (N-116) ─────────────────────────────────────────
  // ONE enum (N-362) for Projects.ProjectType and Assignments.ProjectType.
  // Surfaces that must not offer every value derive their list through the
  // utils.js helpers (salesForecastTypes(), projectFormTypes()) — never by
  // redeclaring a list in a page file. Array order is the display / sort order.
  PROJECT_TYPES: ['Embedded', 'CoE', 'Transformation', 'LCI',
                  'Exec Search', 'MG AI', 'Internal'],

  // N-362 (D-4): types that are Projects but have no Project Dashboard (they
  // collect no recruitment data). Read ONLY through isNoDashboardType() /
  // isNoDashboardProject() / dashboardProjects() (utils.js) — never compared at
  // a call site (tests/lint-project-types.js). The Projects rows are created by
  // the N-363 migration (Admin > Data Health > LCI / Transformation projects).
  NO_DASHBOARD_PROJECT_TYPES: ['LCI', 'Transformation'],

  // Types that bill on a retainer + placement-fee split rather than a monthly
  // rate. Drives the conditional fee fields on the Assignment and Sales Forecast
  // forms, and the revenue-recognition branch in utils.js.
  SPLIT_FEE_PROJECT_TYPES: ['Exec Search', 'MG AI'],

  // ── Project & Role checklists (N-266a) ────────────────────────────
  // Content lives in the ChecklistTemplates SharePoint list; switch-on state
  // in AppSettings. Variants come from VARIANTS below (N-267), read through
  // checklistVariants() / checklistVariantForProjectType() in checklist-logic.js.
  CHECKLISTS: {
    RECORD_TYPES:    ['project', 'role'],
    ITEM_TYPES:      ['tick', 'link', 'action'],
    DEFAULT_VARIANT: 'Default',
    // Checklist variants (N-267). `key` is what ChecklistTemplates.Variant
    // stores — never rename a key once items use it. `label` is display only.
    // `projectTypes` are the Projects.ProjectType values that use the
    // variant; a type listed nowhere (or blank) uses DEFAULT_VARIANT, and an
    // empty variant falls back to DEFAULT_VARIANT too. The first entry must be
    // DEFAULT_VARIANT. Deliberately NOT derived from SPLIT_FEE_PROJECT_TYPES —
    // that is a revenue rule; this grouping is a separate decision.
    VARIANTS: [
      { key: 'Default',        label: 'Embedded (default)',  projectTypes: ['Embedded'] },
      { key: 'CoE',            label: 'CoE',                 projectTypes: ['CoE'] },
      { key: 'ExecSearchMGAI', label: 'Exec Search & MG AI', projectTypes: ['Exec Search', 'MG AI'] },
    ],
    DEFAULT_SECTION: 'General',   // heading for items with a blank Section
    LABEL_MAX:       255,
    HELP_MAX:        2000,
  },

  // ── Starter folders (N-259 project; N-260 role) ───────────────────
  // A one-time Project or Role checklist action (CHECKLIST_ACTIONS 'newton.starterFolder',
  // starter-folders.js) copies a starter-pack template folder from the
  // 'Newton Templates' library on SolutionsHubReporting into the user's own
  // OneDrive, fills {{Placeholder}} tokens in every .docx and shares it.
  // The feature is OFF until TEMPLATE_DRIVE_ID and TEMPLATES.<type>.Default are
  // both set (starterFoldersEnabled, starter-folder-logic.js). TEMPLATES keys
  // must be CHECKLISTS.VARIANTS keys (D22, asserted); a blank id falls back to
  // Default (D16). Pack content lives in SharePoint, so a content change needs
  // no release.
  STARTER_FOLDERS: {
    TEMPLATE_DRIVE_ID: '',
    TEMPLATES: {
      project: { Default: '', CoE: '', ExecSearchMGAI: '' },
      role:    { Default: '', CoE: '', ExecSearchMGAI: '' },   // N-260
    },
    PARENT_PATH:     { project: 'Newton/Projects', role: 'Newton/Roles' },
    SHARE_ROLE:      'write',
    SEND_INVITATION: false,
    // D11: the shared mailbox is never shared with. N-260 QA: its admin row is on
    // the old domain, and the tenant's own owner account (TP_Admin) is excluded too.
    SHARE_EXCLUDE:   ['admin@momentumglobal.co', 'admin@talentpoint.co', 'TP_Admin@talentpoint.onmicrosoft.com'],
    SHARE_RETRIES:   1,      // a failed invite is retried this many times (N-260 QA)
    SHARE_RETRY_MS:  3000,   // pause before each retry
    COPY_POLL_MS:    1500,
    COPY_TIMEOUT_MS: 120000,
    MAX_DOCX_BYTES:  4 * 1024 * 1024,   // simple-PUT limit; bigger .docx are copied unfilled
    // Lazy-loaded on first use. Vendored in js/vendor/ — never a CDN (N-289).
    JSZIP_SRC:       'js/vendor/jszip-3.10.1.min.js',
    NAME_MAX:        255,               // OneDrive: one path segment
    PATH_MAX:        400,               // OneDrive: whole path
    // Parts of a .docx that can hold tokens (regexes over the zip's paths).
    DOCX_PARTS:      [/^word\/document\.xml$/, /^word\/header\d*\.xml$/, /^word\/footer\d*\.xml$/,
                      /^word\/footnotes\.xml$/, /^word\/endnotes\.xml$/],
    PLACEHOLDERS: {
      project: ['CustomerName', 'ProjectType', 'DeliveryManager', 'StartDate', 'EndDate', 'CreatedBy', 'CreatedDate'],
      role:    ['RoleTitle', 'CustomerName', 'Location', 'Department', 'HiringManager', 'TalentPartners', 'DeliveryManager', 'CreatedBy', 'CreatedDate'],   // N-260
    },
  },

  // Types excluded from revenue reporting (People Dashboard "By project type").
  NON_REVENUE_PROJECT_TYPES: ['Internal'],

  // N-361 (PT-1): Project Team backfill (js/project-team.js, Admin > Data Health).
  //  BENCH_CUSTOMER          Customer value Sync Bench writes on bench rows. Also typed in
  //                          people-tracker.js (write) and utils.js (reads);
  //                          consolidating those is a separate tidy-up.
  //  DISPLAY_ROWS            rows shown in each Data Health list before "+ n more".
  //  (A row typed LCI / Transformation with no Projects row is "deferred to N-363":
  //  isNoDashboardType() in utils.js, N-362.)
  PROJECT_TEAM: {
    BENCH_CUSTOMER:         'Unassigned',
    DISPLAY_ROWS:           50,
    // N-363: Notes text on every Projects row the LCI / Transformation migration creates.
    LCI_MIGRATION_NOTE:     'Created by N-363 migration from LCI/Transformation assignments.',
  },

  // N-333: Projects.ProjectType of the Momentum-internal project (Internal TA
  // log Momentum's own hiring there as talent_partner). Its rows show on its
  // own project-scoped pages but never in a company figure, learned benchmark
  // or RAG. Read only through isInternalProject() / excludeInternalProjectData()
  // (utils.js) — never compared at a call site. It is in PROJECT_TYPES; the
  // Sales Forecast dropdown drops it through salesForecastTypes(). Must stay in
  // PROJECT_TYPES and NON_REVENUE_PROJECT_TYPES (assertion).
  PROJECT_TYPE_INTERNAL: 'Internal',

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

  // RAG markers (N-254) — the non-colour cue for exception states, rendered by
  // ragMarkerHTML() in utils.js. Glyphs inherit currentColor from their host
  // element, so no colour lives here. Green / grey / neutral deliberately have
  // no entry (no marker). \uFE0E (VS15) forces text presentation of the
  // warning sign — without it Windows/iOS draw a colour emoji that ignores
  // currentColor and breaks dark mode and the CC banner's dark chrome.
  RAG_MARKERS: {
    red:   { glyph: '\u26A0\uFE0E', label: 'At risk' },
    amber: { glyph: '!',            label: 'Watch'   },
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
  //  • Names are INTERNAL. The alias table in graph-client.js is the translation —
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
      // N-306: plain Number column (not a Lookup) — read/written as HeadcountID.
      'HeadcountID',
    ],
    // N-306 (HC-1): one row per hire slot. RoleID / ProjectID are plain
    // Number columns (Readme: no Lookups for ids Newton reads or writes).
    RoleHeadcount: [
      'Title', 'RoleID', 'ProjectID', 'Sequence', 'OpenDate',
      'TargetHireDate', 'Backfill', 'Notes', 'Status', 'CancelledDate',
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
    // N-286 (SEC-6): no Salary. People is read on TP/DM paths (Org Chart,
    // Scorecards, Command Bar), so anything projected here reaches every
    // user's browser. Salary lives only in PeoplePay (below) — never add it
    // back here.
    People: [
      'Title', 'Level', 'ContractType', 'Location', 'StartDate', 'EndDate',
      'IsActive', 'PhotoUrl', 'IsPlaceholder', 'PlaceholderProject',
      'PlaceholderCSD', 'ReportsTo',
      'StaffType', 'StaffFunction',   // N-304
    ],
    // N-286: one row per person. Title = People item id as text; PersonID
    // (Number) is the join key. Restricted list (admin + leadership) — read
    // only on payroll paths, via getPeoplePay() in api.js.
    PeoplePay: [
      'Title', 'PersonID', 'Salary',
    ],
    // N-300 (SEC-6b): one row per payroll summary sent. Title = dedupe key
    // 'payrollsummary-<year>-<month>'. Joiners / Leavers / BonusData are JSON
    // text (plain-text multi-line columns). Restricted list (admin +
    // leadership); it is the trigger list for the payroll Power Automate flow.
    PayrollSummaries: [
      'Title', 'Month', 'Year', 'Joiners', 'Leavers', 'BonusData',
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
      'LinkedHeadcountID',   // N-312: plain Number — the RoleHeadcount row the plan row tracks
    ],
    // N-317: no longer read — the Hiring Plan's Planned vs Actual Role Opens
    // view replaced the forecast table. Kept registered: data retained, and
    // Data Health still watches the list.
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
    // ── WeeklyActivity anomaly acknowledgements (N-273) ─────────
    // 'AcknowledgedAt' is a TEXT column holding an ISO 8601 instant, not a
    // SharePoint Date and Time column (same reasoning as Diagnostics.OccurredAt).
    // 'SubjectKey' is the role id as text — deliberately not a Lookup, so an
    // acknowledgement survives the role being deleted.
    AnomalyAcks: [
      'Title', 'CheckType', 'SubjectKey', 'Signature', 'Note',
      'AcknowledgedBy', 'AcknowledgedAt', 'Status',
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

  // N-285 (SEC-5). Lists whose SharePoint read permission is withdrawn from
  // ordinary users by the Tier 2 lock (N-288; matrix C-2). For a name here,
  // getItems() (graph-client.js) treats an HTTP 403 as "no rows": it returns a fresh
  // empty array — no toast, no cache entry in either tier — and records the
  // denial so a caller that must not act on missing data can ask
  // wasListDenied(). A 403 on any list NOT named here, or any other error on
  // one that is, still throws. Keep in step with the N-288 runbook; adding a
  // list here is the whole opt-in. PeoplePay (N-286) and PayrollSummaries
  // (N-300) are locked at creation.
  RESTRICTED_LISTS: [
    'GPInvoices',
    'SalesForecasts',
    'LCILocations',
    'PeoplePay',
    'PayrollSummaries',
    'SurveyResponses',
    'AnomalyAcks',
    'Diagnostics',
  ],

  // N-285. Shown on the Command Centre Utilisation / Revenue tiles when the
  // signed-in account cannot read SalesForecasts (wasListDenied). Without it
  // an empty forecast list would read as a real, red result.
  CC_FORECAST_DENIED_TEXT: 'No access to forecast data',

  // N-336. Command Centre Project Health detail — scorecard window toggle.
  // First entry is the default on every page load.
  CC_HEALTH_WINDOWS: [
    { weeks: 4,  label: 'Rolling Monthly'   },
    { weeks: 13, label: 'Rolling Quarterly' },
  ],

  // N-286. Shown above the Employee Tracker when an admin/leadership account
  // cannot read PeoplePay (wasListDenied) — otherwise blank salaries would
  // read as "no salary on record".
  PEOPLE_PAY_DENIED_TEXT: 'Salary data unavailable — your account cannot read the PeoplePay list.',

  // N-300. Payroll Summary send. PAY_DENIED blocks a send that would email
  // blank salaries; ALREADY_SENT replaces the old silent no-op when a month
  // already has a PayrollSummaries row. {period} → e.g. "October 2026".
  PAYROLL_PAY_DENIED_TEXT: 'Payroll summary not sent — your account cannot read the PeoplePay list, so starters\' salaries would be blank.',
  PAYROLL_ALREADY_SENT_TEXT: 'A payroll summary for {period} was already sent. Nothing new was sent. To resend, ask an admin to delete that month\'s row in the PayrollSummaries list.',

  // N-271 (DS-3): WeeklyActivity anomaly flags — Admin > Data Health.
  // Read-only; every number below is a tunable, none is a SharePoint limit.
  //   funnelPairs   — cumulative per role: flag when the LATER stage's total
  //                   over all the role's rows exceeds the EARLIER stage's
  //                   (strict >). Hard-dependency pairs only; stages a role
  //                   can legitimately skip (Screened, Interview2Plus,
  //                   FinalInterview) are deliberately absent.
  //   noActivity    — open roles (TTF_CENSORED_STAGES) with no dated row in
  //                   the current in-progress week or the previous
  //                   recentWeeks - 1 weeks: recentWeeks COUNTS THE CURRENT
  //                   WEEK, so 2 = this week + last week. A role is judged
  //                   only once it has been open for the whole window.
  //   spikes        — per TP per week, summed across their roles: flag a
  //                   field whose value is > multiplier x the median of the
  //                   TP's previous baselineWeeks weeks that have rows (needs
  //                   minBaselineWeeks of them) AND >= minValue. Only the
  //                   last reportWeeks completed weeks are reported.
  //   displayRows   — rows shown per table; the rest collapse to "+N more".
  //   acknowledge   — (N-273) Impossible-funnel acknowledgements, stored in the
  //                   AnomalyAcks list. noteMaxChars caps the optional reason.
  //                   An acknowledgement hides a flag only while the role AND
  //                   its signature (the breaches, in funnelPairs order) both
  //                   match, so editing funnelPairs makes existing
  //                   acknowledgements stop matching and the flags return.
  WEEKLY_ANOMALIES: {
    funnelPairs: [
      { later: 'Responses',  earlier: 'Outreach'   },
      { later: 'Interview1', earlier: 'Submitted'  },
      { later: 'Offers',     earlier: 'Interview1' },
      { later: 'Hires',      earlier: 'Offers'     },
    ],
    noActivity: { recentWeeks: 2 },
    spikes: {
      fields: ['Outreach', 'Responses', 'Screened', 'Submitted'],
      baselineWeeks: 8, minBaselineWeeks: 4,
      multiplier: 3, minValue: 10,
      reportWeeks: 13,
    },
    displayRows: 50,
    acknowledge: { noteMaxChars: 500 },
  },

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
  // against forms-placement.js:submitPlacementForm, which never persists the form's
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
    // N-306: headcount is scoped by role and by project; placements by
    // headcount (N-309 analytics). All three are plain Number columns.
    { list: 'RoleHeadcount',   column: 'RoleID' },
    { list: 'RoleHeadcount',   column: 'ProjectID' },
    { list: 'Placements',      column: 'HeadcountID' },
    // N-361 (PT-1): the Project Team columns on Assignments. N-367 scopes project
    // visibility by them, server-side. Plain Number / text columns.
    { list: 'Assignments',     column: 'ProjectID' },
    { list: 'Assignments',     column: 'UserEmail' },
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

  // N-269: Kaplan–Meier time-to-hire (analytics.js computeTTFPrediction).
  TTF_SURVIVAL: {
    minEvents:   3,  // min completed hires before a pool is used (else fall back / 'Insufficient data')
    minBandDays: 7,  // floor for the ± band
    // N-276 (N-272 D2): roles in these stages are censored at the day they
    // left active work (RoleHistory), not excluded. Cancellation is always the
    // client's call, so it says nothing about how the role was going.
    closedStages:       ['On-hold', 'Cancelled'],
    closedLookbackDays: 365,  // mirrors getHistoricalPlacements()' 1-year placement window
  },

  // N-274 (N-272 D1): the at-risk flag on time-in-stage (analytics.js
  // roleFlagReasons / isRoleFlagged). The target is
  // ANALYTICS_BENCHMARKS.timeToHireDays — not repeated here.
  ROLE_FLAG: {
    // Relative weight of each pipeline stage's share of the target.
    // Budget (days) = weight / sum × target, so changing the target rescales
    // every budget. Order comes from ROLE_STAGES; stages not listed (Backlog,
    // Planning, Closed, On-hold, Cancelled) have no budget and are never
    // age-evaluated. Every key must be a ROLE_STAGES value (checked at load).
    stageWeights: {
      'Sourcing': 15, 'Submitted': 7, 'Interview 1': 7,
      'Interview 2+': 7, 'Final Interview': 5, 'Offered': 4,
    },
    // Count toward the pace signal, never flagged as stuck.
    noStuckStages: ['Final Interview', 'Offered'],
    // Flag when the last windowWeeks of activity hold >= minSubmitted
    // Submitted and Interview1 ÷ Submitted < minRate.
    conversion: { windowWeeks: 6, minSubmitted: 3, minRate: 0.50 },
    // CC Health tile + homepage Health pill, on flagged ÷ open roles:
    // < green → green; <= amber → amber; else red.
    healthRag: { green: 0.25, amber: 0.50 },
  },

  // N-270: learned funnel benchmarks (analytics.js learnFunnelBenchmarks).
  // Beta-binomial: each level's rate is shrunk toward its parent's with
  // priorStrength pseudo-trials; the top level shrinks toward
  // ANALYTICS_BENCHMARKS. Tunable — larger = trust the target more.
  LEARNED_BENCHMARKS: {
    priorStrength: {             // pseudo-trials, per rate (denominator scales differ ~100x)
      outreachConversion:   200,
      submissionConversion: 20,
      interviewToOffer:     20,
      offerSuccess:         10,
    },
    floorFraction: 0.80,         // learned rate never below 80% of the ANALYTICS_BENCHMARKS target
  },

  // N-277 (N-272 D4): stages whose WeeklyActivity feeds the funnel benchmarks
  // on Placement Analytics (analytics.js funnelLearningIndex), besides
  // pipelines with ≥1 fill in the window (N-309 D-8 — open ones included).
  // Cancellation is always the client's call, so the stage progress a cancelled
  // role completed is valid learning. Open / Backlog / On-hold stay out:
  // their funnels are unfinished, which would bias the benchmarks green.
  FUNNEL_LEARNING_EXTRA_STAGES: ['Cancelled'],

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
    finalNoOpenWeeks: 6,    // N-317 / N-320: run rate expects no openings in the final N weeks before the latest planned hire
  },

  // N-318: most month columns in one strip of the Report Builder's Planned vs
  // Actual Role Opens table (months across). Longer plans wrap into evenly
  // sized strips stacked vertically, each repeating the row labels.
  COE_OPENS_STRIP_MONTHS: 18,

  // Graph 429/503 retry (N-082): total attempts incl. the first; backoff
  // doubles from baseDelayMs unless SharePoint sends a Retry-After header.
  GRAPH_RETRY: { maxAttempts: 4, baseDelayMs: 1000 },

  // People photos (N-337): photos load through Graph download URLs, not a
  // cookie-authenticated <img src>. Those URLs last about an hour, so the
  // in-memory map is re-read after PHOTO_URL_TTL_MS (keep it below an hour).
  // PHOTO_SETTLE_MS caps how long hydratePhotoImgs() — and the Org Chart PDF
  // export waiting on it — will wait for a slow image.
  PHOTO_URL_TTL_MS: 45 * 60 * 1000,
  PHOTO_SETTLE_MS:  8000,

  // Build stamp (N-176 / F-3a). BUMP THIS BY HAND ON EVERY DEPLOY that
  // changes js/ or the shape of any list's data. Every sessionStorage cache
  // key embeds it, and graph-client.js discards on load any entry stamped with a
  // different build — that is the whole deploy-busts-the-cache mechanism.
  // Deliberately separate from sw.js's SW_VERSION: a service worker cannot
  // read config.js and the two have different lifecycles. Bump both.
  APP_BUILD: '2026-09-08a',

  // Two-tier read cache (N-176 / F-3a). Tier 1 is the 30s in-memory Map in
  // graph-client.js and is NOT configured here. This block configures tier 2, the
  // sessionStorage tier that survives navigation.
  // `enabled: false` is a live kill switch — it takes effect on the next
  // read, with no reload.
  // persistentLists (N-177 / F-3b): the REFERENCE lists — data that is read
  // on nearly every page and edited rarely, by an admin, from one place.
  // This array is the single source of truth for enrolment; no list name
  // appears in graph-client.js.
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
      // N-282: NEVER enrol an identity/access list (UserAssignments,
      // LeadershipAccess, and — from N-361 — Assignments: it now carries
      // UserEmail + ProjectID and becomes the project-access list in the
      // Project Team epic, N-360). sessionStorage is writable by the user, so a forged
      // tier-2 entry would be served as the real admin/leadership rows and
      // defeat role resolution. They stay on tier 1 (30s, in memory) only.
      'Projects',
      'People',
      'Departments',
      'LCILocations',
      // N-266a: checklist content — admin-edited from one place (Config
      // Panel, N-266b), every write via createItem/updateItem, read on every
      // Projects/Roles render. ChecklistProgress is transactional and must
      // NOT be added here.
      'ChecklistTemplates',
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
  //   dashboard-core.js and report-builder.js project scope (RoleID-set-
  //   scoped via _odataIn since N-315; unfiltered above ROLE_ID_FILTER_MAX),
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
    enabled:       true,   // N-230 (10 Sep 2026): re-enabled. Live diagnosis found
                            // no reproducible defect in the request shape, $batch
                            // routing, or pagination/deltaLink carry-forward — see
                            // newton-pipeline/specs/N-230.md. _deltaMerge (graph-client.js)
                            // now throws on any fields-less item instead of
                            // silently merging it, so a recurrence degrades to a
                            // full resync rather than blank rows.
    enrolledLists: ['WeeklyActivity', 'Placements'],
  },

  // $batch request coalescing (N-188 / F-14). GET-only —
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

  // N-367 (PT-7): which list scopes project visibility (Project Team epic, N-360).
  //   'legacy'      — UserAssignments rows by user (today's behaviour)
  //   'shadow'      — legacy is returned, the Assignments scope is worked out
  //                   alongside and any difference is logged to Diagnostics
  //                   (Admin → Data Health → Access shadow)
  //   'assignments' — the user's non-forecast Assignments rows (N-368 cutover)
  // Any other value reads as 'legacy' (accessScopeMode, permissions.js), so
  // 'legacy' is the kill switch. Admin is decided from UserAssignments in every mode.
  ACCESS_SCOPE: {
    mode:            'shadow',
    shadowErrorType: 'scope-shadow',        // Diagnostics.ErrorType for shadow rows
    shadowStoreKey:  'newton_scope_shadow', // localStorage day-store: one row per user per check per day
  },
  
  // Single source of truth for the module switcher dropdown.
  // To add a new module, add it here only — all nav files reference this.
  // Home grid (index.html): a module gets a home tile only if it has homeOrder
  // (tile position) — its tile copy is `desc`. Command Centre has neither; the
  // home page shows it as a banner instead of a tile.
  // NOTE: People is visible to DM + TP so they can reach People Scorecards.
  // The People module's own nav (people-router.js) restricts them to the
  // Scorecards page only; data scoping is applied in renderScorecardsPage.
  // N-331: People Ops get the whole People module; Sales and Staff reach
  // the Org Chart only (people-router.js).
  OS_MODULES: [
    { key: 'reporting', name: 'Reporting',        icon: 'bar-chart-2', desc: 'Solutions Hub Reporting & Pipeline Analytics', homeOrder: 1,  href: 'reporting.html',        live: true, roles: ['admin','delivery_manager','talent_partner','leadership','people_ops'] },
    { key: 'marketing', name: 'Market Analytics', icon: 'brain', desc: 'Customer Market Reports & Placement Analytics', homeOrder: 4,        href: 'market-reporting.html', live: true, roles: ['admin','delivery_manager','talent_partner'] },
    { key: 'people',    name: 'People',           icon: 'users', desc: 'Headcount, Utilisation & Workforce Planning', homeOrder: 2,        href: 'people.html',           live: true, roles: ['admin','leadership','people_ops','sales','delivery_manager','talent_partner','staff'] },
    // NOTE: Sales is visible to DMs for the LCI Cost Models page only.
    // sales-router.js restricts DMs to that page; model visibility is
    // scoped to AssignedDMEmail in lci-pages.js. N-331: the sales role gets
    // the whole module, all models.
    { key: 'sales',     name: 'Sales',            icon: 'trending-up', desc: 'LCI Modeling, Sales Pipeline & Revenue Tracking', homeOrder: 3,  href: 'sales.html',            live: true, roles: ['admin','leadership','sales','delivery_manager'] },
    { key: 'command',   name: 'Command Centre',   icon: 'monitor',      href: 'command-centre.html',   live: true, roles: ['admin','leadership'] },
  ],

  // N-285. Mobile-only narrowing of a module's OS_MODULES roles, applied by
  // mobileGetAccessibleModules() (mobile-home.js). Sales lists delivery
  // managers in OS_MODULES for the desktop LCI Cost Models page, but mobile's
  // only Sales view is Sales Forecast, which DMs may not read on desktop
  // (sales-router.js) and cannot read in SharePoint after the Tier 2 lock.
  MOBILE_MODULE_ROLES: {
    sales: ['admin', 'leadership'],
  },

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
    { key: 'companyDashboard', label: 'Company Dashboard', module: 'reporting', href: 'reporting.html#companyDashboard', roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP] },
    { key: 'projectDashboard', label: 'Project Dashboard',  module: 'reporting', href: 'reporting.html#projectDashboard',  roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER] },
    { key: 'reportBuilder',    label: 'Report Library',     module: 'reporting', href: 'reporting.html#reportBuilder',     roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER] },
    { key: 'projects',         label: 'Projects',           module: 'reporting', href: 'reporting.html#projects',          roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.PEOPLE_OPS] },
    { key: 'roles',            label: 'Roles',              module: 'reporting', href: 'reporting.html#roles',             roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER] },
    { key: 'activity',         label: 'Weekly Activity',    module: 'reporting', href: 'reporting.html#activity',          roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER] },
    { key: 'placements',       label: 'Placements',         module: 'reporting', href: 'reporting.html#placements',        roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER] },
    { key: 'rejections',       label: 'Rejected Offers',    module: 'reporting', href: 'reporting.html#rejections',        roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER] },
    { key: 'hiringPlan',       label: 'Hiring Plan',        module: 'reporting', href: 'reporting.html#hiringPlan',        roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER, _ROLE_IDS.LEADERSHIP] },
    { key: 'adminPanel',       label: 'Config Panel',       module: 'reporting', href: 'reporting.html#adminPanel',        roles: [_ROLE_IDS.ADMIN] },
    // people-router.js — People (7)
    { key: 'peopleDashboard', label: 'People Dashboard',    module: 'people', href: 'people.html#peopleDashboard', roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.PEOPLE_OPS] },
    { key: 'orgChart',        label: 'Org Chart',           module: 'people', href: 'people.html#orgChart',        roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.PEOPLE_OPS, _ROLE_IDS.SALES, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER, _ROLE_IDS.STAFF] },
    { key: 'peopleGantt',     label: 'Deployment Timeline', module: 'people', href: 'people.html#peopleGantt',     roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.PEOPLE_OPS] },
    { key: 'peopleTracker',   label: 'Employee Tracker',    module: 'people', href: 'people.html#peopleTracker',   roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.PEOPLE_OPS] },
    { key: 'gpInvoices',      label: 'Supplier Invoices',   module: 'people', href: 'people.html#gpInvoices',      roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.PEOPLE_OPS] },
    { key: 'scorecards',      label: 'People Scorecards',   module: 'people', href: 'people.html#scorecards',      roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.PEOPLE_OPS, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER] },
    { key: 'engagement',      label: 'Engagement',          module: 'people', href: 'people.html#engagement',      roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.PEOPLE_OPS] },
    // sales-router.js — Sales (4)
    { key: 'revenueTracking', label: 'Revenue Tracking', module: 'sales', href: 'sales.html#revenueTracking', roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.SALES] },
    { key: 'salesForecast',   label: 'Sales Forecast',   module: 'sales', href: 'sales.html#salesForecast',   roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.SALES] },
    { key: 'lciModels',       label: 'LCI Cost Models',  module: 'sales', href: 'sales.html#lciModels',       roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.SALES, _ROLE_IDS.DELIVERY_MANAGER] },
    { key: 'lciLeadMagnet',   label: 'LCI Lead Magnet',  module: 'sales', href: 'sales.html#lciLeadMagnet',   roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP, _ROLE_IDS.SALES] },
    // cc-router.js — Command Centre (1)
    { key: 'overview', label: 'Overview', module: 'command', href: 'command-centre.html', roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.LEADERSHIP] },
    // mr-router.js — Market Analytics (2) — added 18 Aug 2026, folded into
    // N-144 after Chris asked to expand scope; fits the same page/role
    // shape as the four router files above (mrCanAccess(page, role)),
    // unlike survey-router.js which stays excluded (role-only, no pages).
    { key: 'placementAnalytics', label: 'Placement Analytics',   module: 'marketing', href: 'market-reporting.html#placementAnalytics', roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER] },
    { key: 'marketReport',       label: 'Market Report Library', module: 'marketing', href: 'market-reporting.html#marketReport',       roles: [_ROLE_IDS.ADMIN, _ROLE_IDS.DELIVERY_MANAGER, _ROLE_IDS.TALENT_PARTNER] },
    // os-admin.js — Admin (4). Ghost Mode is deliberately NOT listed here
    // (N-246, Sep 2026) — Chris scoped it out of the searchable bar because
    // it's a sensitive impersonation action, not something that should be
    // one keystroke away by accident. The tab itself is unaffected and still
    // reachable via the sidebar and via a direct admin.html#ghost hash.
    { key: 'assignments', label: 'User Assignments',  module: 'admin', href: 'admin.html#assignments', roles: [_ROLE_IDS.ADMIN] },
    { key: 'leadership',  label: 'Leadership Access', module: 'admin', href: 'admin.html#leadership',  roles: [_ROLE_IDS.ADMIN] },
    { key: 'homepage',    label: 'Homepage',          module: 'admin', href: 'admin.html#homepage',    roles: [_ROLE_IDS.ADMIN] },
    { key: 'datahealth',  label: 'Data Health',       module: 'admin', href: 'admin.html#datahealth',  roles: [_ROLE_IDS.ADMIN] },
  ],
  // Command Bar cross-module badge labels for a module that has Command Bar
  // entries but is NOT in OS_MODULES (N-246). Admin deliberately stays out
  // of OS_MODULES — that array is the single source of truth for the
  // desktop module switcher AND the mobile launcher/switcher, and
  // admin.html has no mobile view and isn't meant to appear in either
  // switcher. This gives _cmdBarModuleName() a real label ("Admin") instead
  // of falling back to the raw key.
  COMMAND_BAR_EXTRA_MODULES: [
    { key: 'admin', name: 'Admin' },
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
    // N-289 (SEC-9): Chart.js for the engagement trends chart, lazy-loaded by
    // engagement-pages.js. Vendored in js/vendor/ — never a CDN.
    CHARTJS_SRC:          'js/vendor/chart.js-4.4.1.umd.js',
    QUESTION_TYPES:       ['Rating', 'SingleChoice', 'MultiChoice', 'FreeText'],
    STATUSES:             ['Draft', 'Active', 'Closed'],
    AUDIENCES:            ['All', 'TalentPartners', 'DeliveryManagers'],
    // N-332: People.Level values NOT counted as eligible respondents (the
    // run's EligibleCount — see isSurveyEligibleEmployee, permissions.js). Each must
    // be in PEOPLE_LEVELS.
    EXCLUDED_LEVELS:      ['CSD'],
    DEFAULT_DURATION_DAYS: 14,
    REMINDER_DAY:          7,
    RATING_SCALE_MIN:      1,
    RATING_SCALE_MAX:      5,
    // N-284 (S-5): the survey is CONFIDENTIAL, not anonymous — SharePoint
    // stamps Created By on every SurveyResponses item. One source for the
    // wording shown to respondents. N-288 / N-299: any claim about who can
    // read responses must match the list permissions (Users see only their own
    // rows; Leadership, People Ops (N-334), Admins and site Owners read all).
    // Re-check this copy and the people-user-guide.html FAQ if those
    // permissions change.
    CONFIRMATION_NOTE:     'Your response has been submitted. Your answers are confidential: only Leadership, People Ops and Admins can read survey responses, and results are reported in aggregate.',
    WIDGET_DESC:           'Your quarterly pulse survey is open \u2014 your answers are confidential and it takes ~3 minutes to complete.',
    WIDGET_DESC_REMINDER:  'Still time to complete \u2014 your answers are confidential and it takes ~3 minutes.',
  },

  // ── Upload checks (N-284 / audit S-16) ────────────────────────────
  // Checked in JS by validateUpload() (utils.js) BEFORE any bytes leave the
  // browser. This is a guard against mistakes and casual misuse, not a
  // security boundary — SharePoint will still store whatever a hand-built API
  // call sends. LOGO's size cap is CONFIG.BRIEFING_PACK.CLIENT_LOGO_MAX_BYTES
  // (logos are stored as base64 in a list column); do not duplicate it here.
  UPLOADS: {
    PHOTO:      { MAX_BYTES: 2 * 1024 * 1024,  EXTS: ['jpg', 'jpeg', 'png', 'webp'], NAME: 'Photos',       ALLOWED: 'JPG, PNG or WebP' },
    INVOICE:    { MAX_BYTES: 10 * 1024 * 1024, EXTS: ['pdf'],                        NAME: 'Invoices',     ALLOWED: 'PDF' },
    LOGO:       { MAX_BYTES: null,             EXTS: ['png', 'jpg', 'jpeg'],         NAME: 'Logos',        ALLOWED: 'PNG or JPG' },
    LCI_IMPORT: { MAX_BYTES: 10 * 1024 * 1024, EXTS: ['xlsx'],                       NAME: 'Import files', ALLOWED: '.xlsx (save older .xls files as .xlsx first)' },
    // The ONLY place an extension maps to a MIME type. validateUpload returns
    // these, never the browser-supplied file.type.
    MIME_BY_EXT: {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  },

  // ── LCI Cost Model + Lead Magnet: CONFIG.LCI and CONFIG.LCI_DISCIPLINES live in js/lci-config.js (sales.html only) ──
};

// Async role check — resolves full role from SharePoint lists at runtime
// Use where accuracy matters (dashboard filtering, page access control)
async function getUserRoleAsync(email) {
  return getEffectiveRole(email);
}
