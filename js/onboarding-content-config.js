// js/onboarding-content-config.js — My Onboarding page content (N-500 / ONB-5, epic N-482).
// Extends CONFIG.ONBOARDING (declarations only; pattern: lci-config.js, N-348). Loads straight after onboarding-config.js, on
// my-momentum.html only. Not in CONFIG.MCP.scripts: onboarding content never reaches Newton for Claude.
//
// RITUALS is the Processes & Rituals tab (ONB-D44: page content, changed through the pipeline, not editable data). The cards are
// the signed-off N-495 Part A, word for word except the two cells tidied in ONB-D51. N-501 adds STANDARDS here.
//
// Owners are display text for who does the ritual (Talent Partner, Line Manager, CSD), not CONFIG.ONBOARDING.OWNERS keys (those own plan
// steps). touch.page is a CONFIG.COMMAND_BAR_PAGES key: the link is that entry's href, shown only when the viewer's role may open it
// (onbRitualLink, ONB-D50); a touch with no page is plain text. No href, SLA figure or list name is typed in this file.
CONFIG.ONBOARDING.RITUALS = {
  TEXT: {
    pageTitle:      'Processes & Rituals',
    intro:          'How the work is done here: what to do, who does it, in which tool, and where it lives in Newton.',
    stepsHeads:     ['Step', 'Owner', 'Tool'],
    whenLabel:      'When',
    whyLabel:       'Why',
    takenInLabel:   'Taught in',
    teamHeads:      ['Ritual', 'What happens', 'Owner', 'Cadence', 'Newton'],
    noTool:         '—',
  },
  SECTIONS: [
    {
      key: 'individual', title: 'Individual rituals',
      cards: [
        {
          key: 'daily', title: 'Daily rhythm',
          text: 'Sourcing in your productive block, candidate calls, then admin. Keep candidates and hiring managers (HMs) updated every 2–3 days.',
        },
        {
          key: 'friday', title: 'Friday: Newton, then the HM wrap-up',
          steps: [
            { text: 'Log the week’s activity for every live role (see the weekly activity log below)', owner: 'Talent Partner', tool: 'Newton', touch: { label: 'Reporting › Weekly Activity', page: 'activity' } },
            { text: 'Check role stages are current', owner: 'Talent Partner', tool: 'Newton', touch: { label: 'Reporting › Roles', page: 'roles' } },
            { text: 'Send the HM wrap-up: wins, pipeline and blockers, next week’s goals', owner: 'Talent Partner', tool: 'Email / Teams', touch: { label: 'Project Dashboard (check numbers first)', page: 'projectDashboard' } },
            { text: 'Next week, deliver the goals you set', owner: 'Talent Partner' },
          ],
          why: 'A HM should never have to chase you, and the update, Newton and the reporting should tell the same story.',
          takenIn: 'M10',
        },
      ],
    },
    {
      key: 'newtonData', title: 'Newton data rituals',
      intro: 'Two habits that keep Newton accurate. They build correct role timelines and history.',
      cards: [
        {
          key: 'activityLog', title: 'Weekly activity log',
          steps: [
            { text: 'Open the Weekly Activity page', owner: 'Talent Partner', tool: 'Newton', touch: { label: 'Reporting › Weekly Activity › + Log Activity', page: 'activity' } },
            { text: 'Choose the project and role', owner: 'Talent Partner', tool: 'Newton', touch: { label: 'The role list shows only roles you can log against' } },
            { text: 'Check the week-ending date: always the Sunday', owner: 'Talent Partner', tool: 'Newton', touch: { label: 'Defaults to the current week' } },
            { text: 'Enter counts, outreach through to hires, and save', owner: 'Talent Partner', tool: 'Newton' },
            { text: 'Several roles? Use Bulk Log Week: one grid, one save, pre-fills what is logged, so it also corrects a week', owner: 'Talent Partner', tool: 'Newton', touch: { label: 'Weekly Activity › Bulk Log Week' } },
          ],
          when: 'By the end of Friday, for every live role. Not in a batch at the start of the next week.',
        },
        {
          key: 'roleStatus', title: 'Role status updates as they change',
          steps: [
            { text: 'When a role’s stage changes, change it that day', owner: 'Talent Partner', tool: 'Newton', touch: { label: 'Roles list: the stage dropdown saves straight away', page: 'roles' } },
            { text: 'Closed and Cancelled go through the full Edit form', owner: 'Talent Partner', tool: 'Newton', touch: { label: 'Roles › Edit' } },
            { text: 'Expect the headcount checks: Closed is blocked while headcount is open; an active stage needs at least one open headcount', tool: 'Newton' },
          ],
          why: 'Role History, the timeline, SLA clocks and time to fill all read from what you record. A late update makes the dates, and so the client’s numbers, wrong.',
          takenIn: 'M03b',
        },
      ],
    },
    {
      key: 'team', title: 'Project and team rituals',
      rows: [
        { key: 'projectOnboarding', title: 'Project onboarding (new joiner)', what: 'Added to the Project Team, client systems set up, client induction', owner: 'Line Manager', cadence: 'When a TP joins a project', touch: { label: 'Project Team' } },
        { key: 'roleChecklists', title: 'Role checklists and starter folders', what: 'Use the role checklist and the Role Starter Folder (holds the Candidate Screening Summary template)', owner: 'Talent Partner', cadence: 'Every role', touch: { label: 'Role page checklist, Starter Folder' } },
        { key: 'clientReporting', title: 'Client reporting', what: 'Weekly update to the hiring manager (see Friday wrap-up)', owner: 'Talent Partner', cadence: 'Weekly', touch: { label: 'Project Dashboard', page: 'projectDashboard' } },
        { key: 'standups', title: 'Team standups', what: 'Weekly team standup', owner: 'Line Manager', cadence: 'Weekly' },
        { key: 'oneToOne', title: '1:1 with your Line Manager', what: 'Progress, blockers, development', owner: 'Line Manager', cadence: 'Weekly' },
        { key: 'allHands', title: 'Solutions Hub All Hands', what: 'Company-wide update + collaboration and learning', owner: 'CSD', cadence: 'Monthly' },
        { key: 'pdp', title: 'PDP cycle', what: 'Joiner goal-setting meeting by start + 30 days; check-ins carry Days 31–90 and beyond', owner: 'Line Manager (CSD countersigns at Day 30)', cadence: 'Goal setting once; monthly check-ins', touch: { label: 'My Momentum › My Development', page: 'myDevelopment' } },
      ],
    },
    {
      key: 'roleChecklist', title: 'Role rituals',
      signpost: {
        text: 'The step-by-step for each role (kick-off, Interview Guide, Market Report, interviews, close) lives in the Role Checklist on the role page in Newton. This tab signposts to it rather than repeating it.',
        link: { label: 'Open Roles', page: 'roles' },
        slaText: 'Meeting lengths and turnaround standards are in Expectations & SLAs.',
        slaSubTab: 'expectations',
        takenIn: 'M05–M10',
      },
    },
  ],
};
