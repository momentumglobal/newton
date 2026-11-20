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
  // The OnboardingPlans columns a write may carry (onbCleanPlanFields). N-502 adds the sign-off columns.
  PLAN_FIELDS:   ['Title', 'PersonID', 'Track', 'Status', 'StartedByEmail', 'StartedAt', 'BuddyEmail'],
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
