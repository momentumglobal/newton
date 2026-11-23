// js/onboarding-config.js — My Onboarding configuration (N-496 / ONB-1, epic N-482).
// Extends CONFIG; declarations only (pattern: pdp-config.js, N-475). Read by onboarding-logic.js,
// api-onboarding.js and onboarding-admin.js (reporting.html, N-496); N-497 adds people.html and
// N-499 my-momentum.html. Not in CONFIG.MCP.scripts: onboarding data never reaches Newton for Claude.
//
// The onboarding track is the checklist engine's third record type (CONFIG.CHECKLISTS.RECORD_TYPES
// 'person', ONB-D6): ChecklistTemplates rows with RecordType 'person' are the steps, their Variant is a
// TRACKS key and their Section is the phase (Pre-start / Week 1 / …, ordered by SectionOrder).
// ChecklistProgress rows with Title 'person' and RecordId = the People item id are the ticks (ONB-D15).
// OnboardingPlans holds one row per person's plan (ONB-D18).
//
// Keys in OWNERS and TRACKS are what SharePoint stores — never rename one once rows use it (same rule as
// CONFIG.CHECKLISTS.VARIANTS). Labels are display only.
CONFIG.ONBOARDING = {
  RECORD_TYPE:   'person',
  // Feature switch (ONB-D11). MODES[0] (Off) is the fail-closed default. SETTINGS names the two
  // AppSettings columns on the single 'config' row: OnboardingMode = single line of text,
  // OnboardingPilot = multiple lines of plain text holding the pilot joiners' work emails joined by EMAIL_SEP.
  MODES:         ['Off', 'Pilot', 'On'],
  SETTINGS:      { MODE: 'OnboardingMode', PILOT: 'OnboardingPilot' },
  EMAIL_SEP:     ';',
  // Who can be a pilot joiner / have a Talent Partner track plan (v1). Future starters included.
  SCOPE_LEVELS:  ['TP', 'STP', 'PTP'],
  // ChecklistTemplates.Variant for 'person' rows. The SDM track is v2.
  TRACKS:        [{ key: 'TP', label: 'Talent Partner' }],
  DEFAULT_TRACK: 'TP',
  // Step owners (ONB-D2). PeopleOps resolves to the joiner's CSD while no active people_ops user exists (ONB-D17).
  OWNERS: [
    { key: 'Employee',  label: 'Employee' },
    { key: 'LM',        label: 'Line Manager' },
    { key: 'CSD',       label: 'CSD' },
    { key: 'PeopleOps', label: 'People Ops' },
    { key: 'Ops',       label: 'Operations / IT' },
    { key: 'Buddy',     label: 'Buddy' },
  ],
  DEFAULT_OWNER: 'Employee',
  PEOPLE_OPS_FALLBACK_LABEL: 'People Ops — CSD for now',
  STEP_MODES:    ['Guided', 'Self-guided'],
  LEVEL_TAGS:    ['Foundation', 'Experienced'],   // blank = every level
  // Whole days from People.StartDate: 0 = the start day, negative = pre-start.
  DUE_OFFSET:    { MIN: -30, MAX: 60 },
  PLAN_LIST:     'OnboardingPlans',
  PLAN_STATUSES: ['Active', 'Complete', 'Cancelled'],
  PLAN_ACTIVE:   'Active',
  // N-499 (ONB-D34): the statuses the joiner and buddy can see in My Momentum. A Cancelled plan is hidden from everyone there.
  PLAN_VISIBLE:  ['Active', 'Complete'],
  // The OnboardingPlans columns a write may carry (onbCleanPlanFields). N-502 adds the CSD countersign columns (ONB-D67).
  PLAN_FIELDS:   ['Title', 'PersonID', 'Track', 'Status', 'StartedByEmail', 'StartedAt', 'BuddyEmail', 'CSDSignedByEmail', 'CSDSignedAt'],
  // N-497 (ONB-2). A plan can only start for a new joiner: StartDate today, in the future, or at most this many days
  // ago (ONB-D22). Restart of a Cancelled plan is exempt (same plan). DISPLAY_ROWS = Data Health rows before "+ n more".
  START_WINDOW_DAYS: 14,
  DISPLAY_ROWS: 10,
  // N-500 (ONB-5, ONB-D49). The My Onboarding sub-tabs: single registry, order = display order = landing order. A person sees the
  // ones they have (onbSubTabs, onboarding-logic.js). N-501 adds Expectations & SLAs, shown with Processes & Rituals (ONB-D56).
  SUB_TABS: [
    { key: 'plan',         label: 'Onboarding Plan' },
    { key: 'rituals',      label: 'Processes & Rituals' },
    { key: 'expectations', label: 'Expectations & SLAs' },
  ],
  // N-499 (ONB-4, ONB-D29). A step whose Section is LIBRARY_SECTION (compared case-insensitively) is a Library step: self-guided,
  // optional, no due date, never counted in the plan's progress (ONB-D32). LEVEL_FILTERS keys must equal LEVEL_TAGS (a test keeps
  // them in step); '' = every level. LIBRARY_URL (the "Browse the Library" link) is set below the literal from CONTENT_BASE_URL.
  LIBRARY_SECTION: 'Library',
  LEVEL_FILTERS: [
    { key: '',            label: 'All levels' },
    { key: 'Foundation',  label: 'Foundation' },
    { key: 'Experienced', label: 'Experienced' },
  ],
  // Why "Start onboarding" is not offered (onbStartCheck reasons). {days} = START_WINDOW_DAYS.
  START_REASONS: {
    'off':             'Onboarding is switched Off (Config Panel → Onboarding).',
    'not-pilot':       'Onboarding is in Pilot and this person is not on the pilot list.',
    'out-of-scope':    'Only active Talent Partners (TP, STP and PTP) get an onboarding plan.',
    'no-email':        'Add a unique work email to this person first.',
    'no-start-date':   'Set a start date first.',
    'too-late':        'Started more than {days} days ago. Onboarding plans are for new joiners only.',
    'no-line-manager': 'Set “Reports to” first. The plan needs a line manager.',
    'no-steps':        'The Talent Partner track has no steps yet (Checklist Admin).',
    'has-plan':        'This person already has a plan.',
  },
  // The Onboarding card on the employee record (onboarding-plan-ui.js).
  TEXT: {
    cardTitle:     'Onboarding',
    cardHint:      'Only Admin sees this card. The joiner, their line manager and buddy see the plan itself in My Momentum.',
    start:         'Start onboarding',
    restart:       'Restart plan',
    cancel:        'Cancel plan',
    changeBuddy:   'Save buddy',
    buddyLabel:    'Buddy',
    buddyNone:     'No buddy yet',
    status:        'Status',
    started:       'Started',
    progress:      'Progress',
    noSteps:       'No steps yet',
    stepsDone:     '{done} of {total} steps done',
    overdue:       '{n} overdue',
    cancelledNote: 'This plan is cancelled. Restarting keeps the steps already ticked.',
    completeNote:  'This plan is complete.',
    cancelConfirm: 'Cancel this onboarding plan? The joiner, their line manager and buddy stop seeing it. Ticks are kept and the plan can be restarted.',
    cancelLabel:   'Cancel plan',
    startOk:       'Onboarding started.',
    buddyOk:       'Buddy saved.',
    cancelOk:      'Onboarding plan cancelled.',
    restartOk:     'Onboarding plan restarted.',
    loadFailed:    'The onboarding plan could not be loaded. Refresh the page to try again.',
    actionFailed:  'Couldn’t update the onboarding plan:',
  },
  // N-498 (ONB-3). Where the revamped decks live (ONB-D26): the OnboardingContent document library on the
  // SolutionsHubReporting site. Step links point into it. Rename the library
  // and this is the one line to change (then edit the links in Checklists > Onboarding).
  CONTENT_BASE_URL: 'https://talentpoint.sharepoint.com/sites/SolutionsHubReporting/OnboardingContent',
  // Config Panel > Checklists > Onboarding (checklist-admin.js). Every word the onboarding editor shows.
  EDITOR_TEXT: {
    recordLabel:  'Onboarding',
    intro:        'Onboarding steps go live for a person when the CSD starts their plan (People > the employee record). Due days are counted from the person\u2019s start date, so changing one moves every live plan. The Off / Pilot / On switch is in the Onboarding tab.',
    ownerLabel:   'Owner *',
    ownerChoose:  '-- Choose an owner --',
    dueLabel:     'Due (days after the start day)',
    dueHint:      'Required, except for a Library item. Whole days after the start day: enter 0 for Day 1 (the start day), 4 for Day 5, and so on. A negative number is before the start (-3 = three days before). Leave it blank for a step in the Library section: those have no due date.',
    modeLabel:    'Mode *',
    levelLabel:   'Level',
    levelNone:    'Every level',
    linkLabel:    'Content link',
    linkHint:     'Optional https:// link to the deck in the OnboardingContent library.',
    dueStart:     'Day 1 (start day)',
    dueAfter:     'Day {n}',
    dueBefore:    '{n} days before start',
    dueBefore1:   '1 day before start',
    tableHeads:   ['Step', 'Owner', 'Due', 'Mode', 'Level', 'Required', 'Status', 'Actions'],
    emptyTitle:   'No onboarding steps in {track} yet.',
    actionLabel:  'Newton action',   // N-516 (ONB-D94): optional STEP_ACTIONS key on the step
    actionNone:   'None',
    actionHint:   'Optional. Adds a button to this step in My Team \u2192 Onboarding.',
    actionNote:   'Action: {label}',
    actionUnknown: 'Unknown action: {key}',
  },
  // N-499 (ONB-4). Every word on the My Onboarding page (onboarding-my-ui.js). {name} {date} {done} {total} {n} {label} {due} are filled by onbFillText.
  PLAN_TEXT: {
    pageTitle:      'My Onboarding',
    myPlan:         'My plan',
    buddyPlan:      '{name} (you are their buddy)',
    selectorLabel:  'Plan',
    startsOn:       'Starts {date}',
    notStartedNote: 'Your plan starts on {date}. Steps that come before your start day appear then.',
    lineManager:    'Line manager',
    buddy:          'Buddy',
    buddyNone:      'Not named yet',
    progress:       '{done} of {total} steps done',
    overdue:        '{n} overdue',
    next:           'Next: {label}, {due}',
    allDone:        'Every step is done.',
    phaseCount:     '{done} of {total}',
    dueOn:          'Due {date}',
    overdueChip:    'Overdue',
    doneBy:         'Ticked by {name}, {date}',
    open:           'Open',
    guided:         'Guided',
    selfGuided:     'Self-guided',
    library:        'Library',
    libraryHint:    'Optional self-guided material. Pick what fits your level and tick it once you have used it.',
    browseLibrary:  'Browse the Library',
    levelLabel:     'Level',
    libraryEmpty:   'Nothing in the Library for this level.',
    libraryFiltered: '{n} hidden by the level filter.',
    ownerBuddyNone: 'Buddy (not named yet)',
    completeNote:   'This plan is complete. It is read-only.',
    previewNote:    'Preview: onboarding is switched Off, so only you can see this. It is read-only.',
    noSteps:        'There are no steps to show yet.',
    noPlans:        'You have no onboarding plan to show.',
    tickFailed:     'Couldn’t save that tick:',
    tickNoRights:   'Only the step’s owner, the line manager or the CSD can tick this step.',
    loadFailed:     'The onboarding plan could not be loaded.',
    retry:          'Try again',
    expand:         'Show steps',
    collapse:       'Hide steps',
    signoffHint:    'Signed off in My Team \u2192 Onboarding.',   // N-502 (ONB-D71): the two sign-off steps are not ticked by hand
  },
};
// N-499: the Library folder inside the OnboardingContent library (N-498 ONB-D26).
CONFIG.ONBOARDING.LIBRARY_URL = CONFIG.ONBOARDING.CONTENT_BASE_URL + '/Library';

// N-509 (ONB-4b, ONB-D39). The Buddying tab label (mmTabLabel): {label} and {n} are filled in; there is no count at 0.
CONFIG.ONBOARDING.TAB_COUNT = '{label} ({n})';
// N-509. Every word on the Buddying page (onboarding-buddy-ui.js); {name} {n} are filled by onbFillText. The step rows are
// drawn with PLAN_TEXT (owner chip, due, overdue, Open link, previewNote, tickFailed).
CONFIG.ONBOARDING.BUDDY_TEXT = {
  pageTitle:      'Buddying',
  banner:         'Buddy view of {name}',
  joinerFallback: 'the joiner',
  actionsTitle:   'Your actions',
  actionsOpen:    '{n} open',
  actionsDone:    'All done',
  noActions:      'There are no steps for you on {name}’s plan.',
  restTitle:      'Rest of {name}’s plan',
  restCount:      'Steps: {n}',
  restHint:       'For context only. You cannot tick these.',
  show:           'Show steps',
  hide:           'Hide steps',
  noPlans:        'You are not the buddy on an active onboarding plan.',
  loadFailed:     'Your buddying actions could not be loaded.',
  retry:          'Try again',
};

// N-502 (ONB-7, ONB-D63..D71). The sign-offs. LIST = the OnboardingSignoffs list (Newton Users Contribute without delete): the line manager's
// role-play and Day-30 sign-offs, append-only, latest row per (plan, kind) wins (ONB-D69). The CSD countersign is on OnboardingPlans
// (PLAN_FIELDS above), which only an Admin writes. STEP_KEYS = the ItemKeys of the two checklist steps the sign-offs tick (ONB-D71);
// a blank or unknown key means no linked step, never a failed sign-off. ACTION_KINDS = the api's kind -> the stored Kind.
CONFIG.ONBOARDING.SIGNOFF = {
  LIST:         'OnboardingSignoffs',
  KINDS:        ['RolePlay', 'Day30LM'],
  OUTCOMES:     ['Signed', 'Withdrawn'],
  SIGNED:       'Signed',
  WITHDRAWN:    'Withdrawn',
  ACTION_KINDS: { roleplay: 'RolePlay', day30: 'Day30LM' },
  ACTIONS:      ['sign', 'withdraw'],
  STEP_KEYS:    { roleplay: 'onb_tp_m05', day30: 'onb_tp_day30-signoff' },
  FIELDS:       ['Title', 'PlanID', 'PersonID', 'Kind', 'Outcome', 'SignedByEmail', 'SignedAt'],
};

// N-502. Every word on My Team > Onboarding (onboarding-team-ui.js); {name} {date} {n} {label} {due} {done} {total} {pct} are filled by
// onbFillText. The step rows reuse PLAN_TEXT (owner chip, due, overdue, Open link, tickFailed).
CONFIG.ONBOARDING.TEAM_TEXT = {
  pageTitle:      'My Team',
  loadFailed:     'Onboarding progress could not be loaded.',
  retry:          'Try again',
  noJoiners:      'None of your joiners has an onboarding plan.',
  previewNote:    'Preview: onboarding is switched Off, so only you can see this. It is read-only.',
  tileActive:     'Active joiners',
  tileOverdue:    'Overdue steps',
  tileSignoff:    'Awaiting sign-off',
  actionsTitle:   'My actions',
  actionsEmpty:   'Nothing is waiting for you.',
  filterLabel:    'Joiner',
  filterAll:      'All joiners',
  joinersTitle:   'Joiners',
  completedTitle: 'Completed',
  startsOn:       'Starts {date}',
  dayN:           'Day {n}',
  progress:       '{done} of {total} steps done ({pct}%)',
  overdue:        '{n} overdue',
  next:           'Next: {label}, {due}',
  allDone:        'Every step is done.',
  noSteps:        'There are no steps to show yet.',
  lineManager:    'Line manager',
  buddy:          'Buddy',
  buddyNone:      'Not named yet',
  completeChip:   'Complete',
  show:           'Show details',
  hide:           'Hide details',
  byOwnerTitle:   'Open steps by owner',
  noOpen:         'No open steps.',
  ownerOpen:      '{n} open',
  signoffTitle:   'Sign-offs',
  roleplay:       'Intake role-play (M05)',
  day30lm:        'Day-30 review: line manager',
  csd:            'Day-30 countersign: CSD',
  signedBy:       'Signed by {name}, {date}',
  notSigned:      'Not signed off yet',
  btnSign:        'Sign off',
  btnWithdraw:    'Withdraw',
  btnCountersign: 'Countersign and close plan',
  pdpTitle:       'PDP goal-setting meeting',
  pdp: {
    none:        'No joiner goal-setting meeting yet',
    planned:     'Goal-setting meeting due {date}',
    held:        'Goal-setting meeting held {date}',
    signed:      'Goal-setting meeting signed off {date}',
    unavailable: 'PDP status unavailable',
  },
  reasons: {
    preview:       'Preview is read-only.',
    closed:        'This plan is closed.',
    onlyLm:        'Only the joiner’s line manager can do this.',
    onlyCsd:       'Only the joiner’s CSD can do this.',
    stepsOpen:     '{n} required steps are still open.',
    stepsOpen1:    '1 required step is still open.',
    needRoleplay:  'The role-play is not signed off yet.',
    needLm:        'The line manager has not signed off the Day-30 review yet.',
    keepRoleplay:  'Withdraw the Day-30 sign-off first.',
  },
  confirmCountersign: 'Countersign and close {name}’s onboarding plan? This cannot be undone.',
  confirmLabel:   'Countersign',
  signoffOk:      'Sign-off saved.',
  withdrawOk:     'Sign-off withdrawn.',
  countersignOk:  'Plan closed.',
  stepWarn:       'Saved, but the linked checklist step was not updated.',
  actionFailed:   'Couldn’t save that:',
};

// N-503 (ONB-8, ONB-D75–D84). Owner reminders through the notifications engine (rules in onboarding-reminders.js, orchestration in
// api-onboarding.js runOnboardingReminders). They fire only for a live gate (Pilot and On; Off sends nothing, ONB-D75), as at most one
// digest per type per person per day (KEY_PREFIX:type:email:YYYY-MM-DD, ONB-D76). TYPES / TEXT are the Notifications TriggerType and the
// fixed body ({n} = count): never a name, step title or email in a body, the Notifications list is readable by everyone. LINKS are My
// Momentum deep links (own plan -> MY, LM / CSD step -> TEAM, buddy step -> BUDDY, ONB-D83). Declarations only.
CONFIG.ONBOARDING.REMINDERS = {
  KEY_PREFIX: 'onb',
  TYPES: { DUE: 'onbDue', OVERDUE: 'onbOverdue' },
  TEXT: {
    onbDue:     { one: 'You have 1 onboarding step due today.',  many: 'You have {n} onboarding steps due today.' },
    onbOverdue: { one: 'You have 1 overdue onboarding step.',    many: 'You have {n} overdue onboarding steps.' },
  },
  LINKS: { MY: 'my-momentum.html#myOnboarding', TEAM: 'my-momentum.html#teamOnboarding', BUDDY: 'my-momentum.html#myBuddying' },
  TONE:  'attention',
};

// N-516 (ONB-D94). Newton actions an onboarding step can carry (ChecklistTemplates.ActionKey on a 'person' row; ItemType stays 'tick').
// Metadata only: the handlers are ONB_STEP_ACTION_RUN in onboarding-welcome-ui.js (my-momentum.html). Not CHECKLIST_ACTIONS, which is the
// Project / Role registry. Keys are stored in SharePoint — never rename one once a step uses it.
CONFIG.ONBOARDING.STEP_ACTIONS = [
  { key: 'onb.welcomeEmail', label: 'Draft welcome email', description: 'Shows a welcome email with the Week 1 agenda and buddy details, to copy into Outlook.' },
];

// N-516 (ONB-D91–D93). The welcome email drafted from the pre-start step. Week 1 = due offsets AGENDA_FROM..AGENDA_TO (Day 1–5, the N-508
// wording). N-517 (ONB-D95): the branded body goes out through the clipboard only; "Open in Outlook" opens a subject-only mail, so there is
// no mailto length limit. WELCOME_TEXT holds every word of the email and its modal ({first} {date} {name} {email} are filled by onbFillText).
CONFIG.ONBOARDING.WELCOME = { AGENDA_FROM: 0, AGENDA_TO: 4 };
CONFIG.ONBOARDING.WELCOME_TEXT = {
  subject:      'Welcome to Momentum Global, {first} \u2014 your first week',
  eyebrow:      'Welcome to Momentum Global',   // N-517 (ONB-D101): above the headline, uppercase by style
  headline:     'Your first week, {first}',
  footer:       'Momentum Global',              // N-517 (ONB-D100): the navy footer line
  greeting:     'Hi {first},',
  intro:        'We\u2019re delighted you\u2019re joining Momentum Global. Your first day is {date}, and here is what your first week looks like.',
  introNoDate:  'We\u2019re delighted you\u2019re joining Momentum Global. Here is what your first week looks like.',
  agendaTitle:  'Your first week',
  agendaWith:   'with {name}',
  agendaEmpty:  'We\u2019ll share your first-week agenda before you start.',
  buddyTitle:   'Your buddy',
  buddy:        '{name} ({email}) is your buddy: your go-to person for everyday questions while you settle in.',
  buddyNoEmail: '{name} is your buddy: your go-to person for everyday questions while you settle in.',
  buddyNone:    'We\u2019ll introduce your buddy before your first day.',
  lmTitle:      'Your line manager',
  lm:           '{name} is your line manager. You\u2019ll have your first 1:1 in your first week.',
  close:        'If you have any questions before you start, just reply to this email.',
  signoff:      'Best wishes,',
  subjectLabel: 'Subject:',
  modalTitle:   'Welcome email for {name}',
  modalHint:    'Open in Outlook fills in the subject and copies the email: paste it into the body. Copy email copies it on its own. Add {name}\u2019s email address, check it reads right, then send. Tick the step once it\u2019s sent.',
  previewTitle: 'Email preview',
  warnNoBuddy:  'No buddy is set on this plan yet. Set one on the employee record (People) and reopen this, or the email says a buddy will be introduced.',
  warnNoStart:  'This person has no start date, so the agenda has no dates.',
  btnCopy:      'Copy email',
  btnOpen:      'Open in Outlook',
  btnClose:     'Close',
  copied:       'Email copied \u2014 paste it into a new Outlook mail.',
  copyFailed:   'Couldn\u2019t copy. Click into the preview, press Ctrl+A then Ctrl+C, and paste it in.',
  openedCopied: 'Subject filled in and the email copied \u2014 paste it into the body.',
};
