// js/pdp-config.js — Development & Performance (PDP) configuration
// Extends CONFIG (config.js); loaded by admin.html, reporting.html, people.html and my-momentum.html only,
// directly before pdp-identity.js. Declarations only — nothing here is read at load time.
// N-475 (R3-6): moved out of config.js; every reader is PDP code on those shells. index.html does not load
// this file (my-momentum-logic.js is on index.html but its one CONFIG.PDP read, in mmScorecardScope, is never
// called there).

// N-433 (PDP-1): Development & Performance identity. Single source of truth for who is in
// scope and who can be a line manager (js/pdp-identity.js).
//   SCOPE_LEVELS    PDP-D9: People.Level values that take part (CSDs are reviewers only).
//   REVIEWER_LEVEL  PDP-D6: the level the "CSD up the chain" walk stops at.
//   MANAGER_LEVELS  who the line-manager pickers offer, in display order. Not absolute:
//                   project-specific variation exists, so any of these may manage anyone.
//   MAX_CHAIN       longest ReportsTo chain the resolver follows before giving up.
//   DISPLAY_ROWS    rows shown per Data Health integrity check before "+ n more".
CONFIG.PDP = {
  SCOPE_LEVELS:   ['TP', 'STP', 'PTP', 'SDM'],
  REVIEWER_LEVEL: 'CSD',
  MANAGER_LEVELS: ['CSD', 'SDM', 'STP'],
  MAX_CHAIN:      8,
  // N-445 (PDP-13, PDP-D13): the feature switch. MODES[0] (Off) is the fail-closed default;
  // pdp-identity.js reads the order. SETTINGS names the two AppSettings columns (the single
  // 'config' row): PDPMode = single line of text, PDPPilot = multiple lines of plain text
  // holding the pilot people's work emails joined by ACCESS.EMAIL_SEP.
  MODES:          ['Off', 'Pilot', 'On'],
  SETTINGS:       { MODE: 'PDPMode', PILOT: 'PDPPilot', REMINDERS_FROM: 'PDPRemindersFrom' },
  // N-441 (PDP-9): reminders through the notifications engine (rules in pdp-reminders.js, orchestration in api-pdp.js).
  // They exist only while the switch is On (the pilot group gets none). REMINDERS_FROM (AppSettings, single line
  // of text, YYYY-MM-DD) is the first due date that can remind; blank / invalid = DEFAULT_FROM, so the 2026
  // meetings stay silent at go-live.
  //   PREP_REMIND_DAYS    a meeting's prep is "due soon" when the meeting is due within this many days.
  //   ACTION_REMIND_DAYS  an open action reminds this many days before it is due (and after).
  //   TYPES / TEXT        notification TriggerType and the fixed body ({n} = count). Never put a name, goal,
  //                       action text, score or note in a body: the Notifications list is readable by everyone.
  //   LINKS               deep links (My Momentum tab keys, N-452).
  REMINDERS: {
    DEFAULT_FROM:       '2027-01-01',
    PREP_REMIND_DAYS:   7,
    ACTION_REMIND_DAYS: 3,
    KEY_PREFIX:         'pdp',
    TYPES: { PREP: 'pdpPrep', OVERDUE: 'pdpOverdue', ACTION: 'pdpAction' },
    TEXT: {
      pdpPrep:    { one: 'Your PDP prep is due soon.',   many: '{n} PDP preps are due soon.' },
      pdpOverdue: { one: '1 PDP meeting is overdue.',     many: '{n} PDP meetings are overdue.' },
      pdpAction:  { one: '1 PDP action is due soon.',     many: '{n} PDP actions are due soon.' },
    },
    LINKS: { MY: 'my-momentum.html#myDevelopment', TEAM: 'my-momentum.html#myTeam' },
  },
  DISPLAY_ROWS:   10,
  // N-434 (PDP-2): the seven PDP lists. Single source of truth: api-pdp.js and pdp-data.js
  // reference lists only through this map. Never add one to CACHE.persistentLists, DELTA,
  // MCP.allowedLists or a Command Bar source (PDP-D12). N-435: the personal ones are restricted.
  LISTS: {
    FRAMEWORK: 'PDPFramework', TEMPLATES: 'PDPTemplates', CYCLES: 'PDPCycles',
    MEETINGS: 'PDPMeetings', GOALS: 'PDPGoals', ACTIONS: 'PDPActions', SCORES: 'PDPScores',
  },
  // N-435 (PDP-3): the LISTS keys holding one person's records. Each item gets its own
  // permissions from the PDP access flow (employee + line manager + CSD). Read the names through
  // pdpPersonalLists() (pdp-data.js); Framework and Templates stay readable by everyone.
  PERSONAL_LIST_KEYS: ['CYCLES', 'MEETINGS', 'GOALS', 'ACTIONS', 'SCORES'],
  // N-435: UNSECURED_GRACE_MIN = minutes a new item may stay unlocked before Data Health flags
  // it (the flow's polling trigger normally locks it within a few). EMAIL_SEP joins
  // ReadOnlyEmails and must match the flow's split().
  ACCESS: { UNSECURED_GRACE_MIN: 15, EMAIL_SEP: ';' },
  // Enum values live here, never in SharePoint Choice columns (a Choice column drifts).
  LEVELS:          ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'],
  TRACKS:          ['IC', 'MG'],
  BANDS:           ['Below', 'Meets', 'Exceeding'],
  MEETING_TYPES:   ['Annual', 'BiAnnual', 'Quarterly', 'Monthly'],
  MEETING_STATUS:  ['Planned', 'PrepOpen', 'Held', 'SignedOff', 'Skipped'],
  TEMPLATE_STATUS: ['Draft', 'Published', 'Retired'],
  CYCLE_STATUS:    ['Open', 'Closed'],
  GOAL_LEVELS:     ['Annual', 'H2', 'Quarterly'],
  GOAL_CATEGORIES: ['Business', 'Development', 'Behaviour', 'Career'],
  GOAL_STATUS:     ['Open', 'Achieved', 'Dropped'],
  RAG:             ['Red', 'Amber', 'Green'],
  SCORE_SOURCES:   ['Self', 'Manager', 'Agreed'],
  OWNER_ROLES:     ['Employee', 'Manager'],
  SCORE_MIN:       1,
  SCORE_MAX:       3,
  JSON_MAX_CHARS:  30000,   // SharePoint plain multi-line text holds ~63k; stay well under
  // N-436 (PDP-4): framework + template editors (People > PDP Setup, pdp-setup.js / pdp-template-editor.js).
  //   PILLAR_KEYS   the six fixed pillars, in SortOrder 1-6. Names are data (framework rows), keys are not;
  //                 scoring (N-442) averages exactly these six, equally weighted (PDP-D3).
  //   BLOCK_TYPES   the six stored template block types (a fixed set; Admin edits wording and order,
  //                 never invents a type). prepQuestion = pre-work question (BLOCK_BY says whose),
  //                 prompt = discussion note, goalSet / goalReview / actions = structured blocks,
  //                 scoring = the pillar scoring block (Bi-Annual only, once).
  //   BLOCK_BY / REVIEW_BY   who answers a prepQuestion / when a goalReview happens.
  //   MEETING_LABELS         display names; also the template Title prefix.
  //   TEMPLATE_LIMITS        publish-gate and editor limits (pdpValidateTemplate).
  PILLAR_KEYS:     ['own-it', 'decide', 'communicate', 'support', 'curious', 'adapt'],
  PILLARS: [   // N-479 (was PDP_SEED.pillars): default names for Seed defaults / a new framework set, same order as PILLAR_KEYS; the live names are the framework rows
    { key: 'own-it',      name: 'We Own It & Lift the Bar' },
    { key: 'decide',      name: 'We Decide with Clarity & Confidence' },
    { key: 'communicate', name: 'We Communicate Openly & Build Trust' },
    { key: 'support',     name: 'We Support People & Grow Potential' },
    { key: 'curious',     name: 'We Stay Curious & Keep Improving' },
    { key: 'adapt',       name: 'We Adapt & Stay Resilient' },
  ],
  BLOCK_TYPES:     ['prepQuestion', 'prompt', 'goalSet', 'goalReview', 'actions', 'scoring'],
  BLOCK_BY:        ['employee', 'manager'],
  REVIEW_BY:       ['employee', 'meeting'],
  MEETING_LABELS:  {
    Annual: 'Annual Development & Goal Setting', BiAnnual: 'Bi-Annual Performance & Progression Review',
    Quarterly: 'Quarterly Review', Monthly: 'Monthly Development Check-In',
  },
  TEMPLATE_LIMITS: {
    MAX_SECTIONS: 20, MAX_BLOCKS: 60, TITLE_MAX: 120, LABEL_MAX: 300, HINT_MAX: 600,
    GOALS_MAX: 10, ACTIONS_MAX: 10, DESCRIPTOR_MAX: 1000,
  },
  // N-437 (PDP-5): the cycle engine (pdp-cycle.js; run from People > PDP Setup > Cycle by Admin / People Ops).
  //   CALENDAR             meeting type per month, index 0 = January. Due date = last day of that month.
  //   JOINER_DUE_DAYS      PDP-D10: a joiner's goal setting is due this many days after they join.
  //   JOINER_SKIP_DAYS     PDP-D10: a calendar meeting due within this many days after it is Skipped.
  //   JOINER_GOALS         PDP-D10: goals a joiner sets (overrides the Annual template's goalSet range; N-438/439).
  //   BIANNUAL_CUTOFF      PDP-D10: 'MM-DD'. Joined on or before it -> the July Bi-Annual is scored.
  //   PROMOTION_MIN_MONTHS PDP-D11: months in a new level (People.LevelSince) before it is scored on.
  //   DUE_SOON_DAYS        pdpMeetingState(): a meeting due within this many days is 'due'.
  //   NEXT_YEAR_FROM_MONTH from this month (1-12) the Cycle tab also offers next year.
  //   LEVEL_MAP            People.Level -> framework level + track (PDP-D5: PTP = L5 IC, SDM = L5 MG).
  //   SKIP_REASONS         SkipReason text the engine writes.
  CYCLE: {
    CALENDAR: ['Annual', 'Monthly', 'Monthly', 'Quarterly', 'Monthly', 'Monthly',
               'BiAnnual', 'Monthly', 'Monthly', 'Quarterly', 'Monthly', 'Monthly'],
    JOINER_DUE_DAYS:      30,
    JOINER_SKIP_DAYS:     21,
    JOINER_GOALS:         { min: 2, max: 3 },
    BIANNUAL_CUTOFF:      '03-31',
    PROMOTION_MIN_MONTHS: 3,
    DUE_SOON_DAYS:        14,
    NEXT_YEAR_FROM_MONTH: 11,
    LEVEL_MAP: {
      TP:  { level: 'L3', track: 'IC' },
      STP: { level: 'L4', track: 'IC' },
      PTP: { level: 'L5', track: 'IC' },
      SDM: { level: 'L5', track: 'MG' },
    },
    SKIP_REASONS: {
      joiner: 'Within 3 weeks of goal setting',
      left:   'Left Momentum',
      scope:  'Left PDP scope',
      preStart: 'Before PDP start',
    },
  },
  // N-438 (PDP-6): My Development (employee page, pdp-my.js / pdp-prep.js).
  //   PREP_LEAD_HOURS  a Quarterly meeting's pre-work opens this long before its MeetingDate (whole days).
  //   KPI_BLOCK_KEY    the Quarterly template block that gets the "Open my Scorecard" link (keys never change).
  //   NAV_REASONS      pdpAccess() reasons that show the nav item: the person is themselves in the programme.
  ME: {
    PREP_LEAD_HOURS: 48,
    KPI_BLOCK_KEY:   'how-have-i-performed-against-kpis',
    NAV_REASONS:     ['pilot', 'in-scope', 'has-records'],
  },
  // N-439 (PDP-7): Team Development (line manager + CSD page, pdp-team.js / pdp-team-page.js).
  //   GOAL_LEVEL_BY_TYPE  GoalLevel written for a goal recorded in a meeting of this type (Monthly has no goal block;
  //                       a joiner goal setting is MeetingType Annual).
  //   ATTENTION_ORDER     team table sort, most urgent first (anything else sorts last).
  //   NOTES_SCHEMA        schema number inside the PrepManager and MeetingNotes JSON.
  TEAM: {
    GOAL_LEVEL_BY_TYPE: { Annual: 'Annual', BiAnnual: 'H2', Quarterly: 'Quarterly' },
    ATTENTION_ORDER:    ['overdue', 'sign', 'prep', 'due', 'upcoming', 'done'],
    NOTES_SCHEMA:       1,
  },
  // N-440 (PDP-8): Goals + actions tracker (pdp-track.js / pdp-track-ui.js / api-pdp.js).
  //   RAG_ORDER            RAG values worst first; the roll-up takes the lowest index among a goal and its open descendants.
  //   GOALS_PER_LEVEL_MAX  open goals one person may hold per goal level per year (tracker-created and meeting-created).
  //   HALF_START_MONTH     first month of the second half; the quarters from it on sit under an H2 goal when one exists.
  //   AGREED_FIELDS        goal / action wording that locks once the meeting it was recorded in is signed.
  //   LIVE_FIELDS          goal columns that never lock: RAG and status (an action's done tick never locks either).
  TRACKER: {
    RAG_ORDER:           ['Red', 'Amber', 'Green'],
    GOALS_PER_LEVEL_MAX: 10,
    HALF_START_MONTH:    7,
    AGREED_FIELDS:       ['Title', 'Category', 'WhyItMatters', 'SuccessMeasures', 'Support', 'TargetDate', 'ParentGoalID'],
    LIVE_FIELDS:         ['Rag', 'Status'],
  },
  // N-442 (PDP-10): Bi-Annual assessment (pdp-assess.js / pdp-assess-ui.js / api-pdp.js). Notion framework:
  // pillar 1-3, total = average to DECIMALS, bands 1.0-1.5 Below, 1.6-2.4 Meets, 2.5-3.0 Exceeding.
  //   BAND_MAX          highest total in each band (CONFIG.PDP.BANDS order; anything above Meets is Exceeding).
  //   BOUNDARIES        a total exactly on a key is agreed into one of the two bands listed, or escalated.
  //   MANAGER_CALL_GAP  self vs manager gap the manager decides (the agreed score is one of the two, with a reason).
  //   ESCALATE_GAP      gap that sends the pillar to the calibration panel (N-443).
  //   READINESS         progression readiness options (key stored in PDPMeetings.Assessment, label shown).
  //   MANAGER_TRACK     L4 manager-track / succession suggestion: agreed SCORE on every one of PILLARS at LEVEL_KEY.
  //   RATIONALE_MAX / NOTE_MAX  characters in a score's evidence / rationale and in a readiness or flag note.
  //   REVEAL_WAIT_MIN   minutes after the later submit before "Unlocking" becomes "Taking longer than usual".
  //   SCHEMA            schema number inside the Assessment JSON.
  ASSESS: {
    BAND_MAX:         { Below: 1.5, Meets: 2.4 },
    BOUNDARIES:       { '1.5': ['Below', 'Meets'], '2.5': ['Meets', 'Exceeding'] },
    DECIMALS:         1,
    MANAGER_CALL_GAP: 1,
    ESCALATE_GAP:     2,
    READINESS: [
      { key: 'now',     label: 'Ready now' },
      { key: '6-12',    label: 'Ready in 6–12 months' },
      { key: 'not-yet', label: 'Not yet ready' },
    ],
    MANAGER_TRACK:    { LEVEL_KEY: 'L4-IC', PILLARS: ['support', 'curious', 'adapt'], SCORE: 3 },
    RATIONALE_MAX:    2000,
    NOTE_MAX:         1000,
    REVEAL_WAIT_MIN:  15,
    SCHEMA:           1,
  },
  // N-443 (PDP-11): calibration panel, distribution check, lock and release (pdp-calibrate.js /
  // pdp-calibrate-ui.js / api-pdp.js). Notion framework steps 4-6. Panel = Admin + People Ops (pdpAdmin).
  //   DISTRIBUTION  target % of banded results per band (CONFIG.PDP.BANDS keys), [min, max]. Warn only (D2).
  //   POINTERS_MAX  lowest pillars shown to the employee as development pointers (next-band descriptor).
  //   LOG_MAX       entries kept in PDPMeetings.Calibration log (oldest dropped first).
  //   CASE_STATES   panel case states, in table sort order.
  //   SCHEMA        schema number inside the Calibration JSON.
  //   RELEASE       the employee's in-app notice when the manager releases the result (only while PDPMode is On,
  //                 like reminders). TYPE is deliberately NOT in REMINDERS.TYPES, so the reminder sweep never
  //                 clears it. Fixed body: never a name or a score (Notifications is readable by everyone).
  CALIBRATION: {
    DISTRIBUTION: { Below: [5, 10], Meets: [65, 75], Exceeding: [15, 25] },
    POINTERS_MAX: 2,
    LOG_MAX:      50,
    CASE_STATES:  ['needsPanel', 'ready', 'locked', 'released'],
    SCHEMA:       1,
    RELEASE:      { TYPE: 'pdpReleased', KEY_PREFIX: 'pdp-released', BODY: 'Your Bi-Annual ratings are ready to view.', TONE: 'milestone' },
  },
};