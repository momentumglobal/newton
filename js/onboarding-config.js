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
  // The OnboardingPlans columns a write may carry (onbCleanPlanFields). N-502 adds the sign-off columns.
  PLAN_FIELDS:   ['Title', 'PersonID', 'Track', 'Status', 'StartedByEmail', 'StartedAt', 'BuddyEmail'],
};
