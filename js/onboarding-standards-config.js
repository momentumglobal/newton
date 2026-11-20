// js/onboarding-standards-config.js — My Onboarding > Expectations & SLAs content (N-501 / ONB-6, epic N-482).
// Extends CONFIG.ONBOARDING (declarations only; pattern: lci-config.js, N-348). Loads straight after onboarding-content-config.js, on
// my-momentum.html only. Not in CONFIG.MCP.scripts: onboarding content never reaches Newton for Claude.
//
// STANDARDS is the Expectations & SLAs tab (ONB-D44 page content, changed through the pipeline). GROUPS are the signed-off N-495 Part B1,
// B2 and B4, word for word: their timings (24 / 48 / 72 hours, 14 days...) are static copy (ONB-D58). They live in this file, not in
// onboarding-content-config.js, so N-500's "no SLA figures" hygiene test stays scoped to the rituals (ONB-D57). KPIS holds the wording
// around the three live parts: the SLA defaults table (SLATargets, ONB-D53), the benchmarks and the company goal
// (CONFIG.ANALYTICS_BENCHMARKS, ONB-D54). No SLA target and no benchmark value is typed here; {days} is the one token.
CONFIG.ONBOARDING.STANDARDS = {
  TEXT: {
    pageTitle:      'Expectations & SLAs',
    intro:          'What we promise candidates and hiring managers, how we hold ourselves to it, and the targets Newton measures.',
    momentHead:     'Moment',
    standardHead:   'Standard',
    takenInLabel:   'Taught in',
    slaUnavailable: 'Targets unavailable right now',
    slaLoading:     'Loading the current targets…',
    retry:          'Try again',
  },
  GROUPS: [
    {
      key: 'candidate', title: 'Candidate standards', takenIn: 'M07, M09',
      rows: [
        { moment: 'Any candidate message', standard: 'Reply within 48 hours; pick up the phone first' },
        { moment: 'After screening (progress)', standard: 'Call to confirm they progress and explain next steps; within 48 hours' },
        { moment: 'Before each interview', standard: 'Prepare them about 24 hours before' },
        { moment: 'After each interview', standard: 'Call within 24 hours to ask how it went' },
        { moment: 'Progress feedback', standard: 'Call within 24 hours with next steps' },
        { moment: 'Reject feedback', standard: 'Call within 48 hours where possible, then email; specific, evidence-based, respectful' },
        { moment: 'Final-stage reject', standard: 'Always by phone, always followed by email, with detailed feedback and the rationale' },
        { moment: 'Client feedback late', standard: 'Call the candidate after 72 hours; repeat every 72 hours until you have it' },
        { moment: 'Offer', standard: 'Verbal by phone first; written offer within 24 hours of the verbal' },
        { moment: 'Notice period', standard: 'Week 1 congratulations and resignation check; every two weeks wellbeing check and onboarding update; final week first-day arrangements' },
        { moment: 'Counter-offer', standard: 'Discuss it early, ideally at pre-close. A candidate is not secure until they have resigned' },
        { moment: 'Silence', standard: 'Never. Nobody is left wondering where they stand' },
        { moment: 'Outreach', standard: 'Short, personal, relevant; no CV or referral ask in the first message; schedule up to three follow-ups' },
      ],
    },
    {
      key: 'stakeholder', title: 'Stakeholder standards', takenIn: 'M04, M05, M10',
      rows: [
        { moment: 'Intake meeting', standard: 'Day 1; 45 minutes; the HM and key decision-makers attend' },
        { moment: 'Campaign Brief first draft', standard: 'Within 24 hours of the intake' },
        { moment: 'Screening Questions', standard: 'Within 24 hours, alongside the Campaign Brief draft' },
        { moment: 'Campaign Brief sign-off', standard: 'HM reviews and signs off within 72 hours' },
        { moment: 'Interview Guide', standard: 'One-hour meeting; draft delivered and signed off within 48 hours' },
        { moment: 'Market Report', standard: 'About two weeks into the campaign; 30-minute presentation' },
        { moment: 'Interviewer scorecard', standard: 'Completed within 24 hours of the interview' },
        { moment: 'Interviews organised', standard: 'Within 24 hours of feedback' },
        { moment: 'Full interview process', standard: 'Under 14 days' },
        { moment: 'Updates', standard: 'Proactive & async via Teams/Slack etc, every 2–3 days; flag problems as soon as they arise' },
        { moment: 'Weekly wrap-up', standard: 'Friday: wins, pipeline and blockers, next week’s goals' },
        { moment: 'After every meeting', standard: 'Actions sent in writing with names and deadlines; your own actions diarised' },
        { moment: 'Deadlines', standard: 'Agreed per role at the intake (feedback times, decision-makers, cadence)' },
        { moment: 'Challenging a request', standard: 'Ask why, show evidence, offer alternatives, write down the agreed change' },
      ],
      note: 'What we need from the HM: attend the intake, give feedback on time, and hold to the review windows above.',
    },
    {
      key: 'quality', title: 'Quality bar', takenIn: 'M04, M06, M08',
      items: [
        'Check everything before it goes out. Agents draft, you own the result. Trace every fact to the transcript, JD or website; if you can’t, take it out or confirm it.',
        'Add the human touch: it should sound like the client and like us.',
        'No spelling or grammar errors. Run the checks before anything is sent.',
        'Transcript on at every intake. No transcript, no Nelson.',
        'GDPR: keep personal data to what the role needs. Remove contact details from a CV before giving it to Theroux, or use a LinkedIn PDF. Removal requests go to GDPR@talentpoint.co.',
        'Relevant people only: every outreach message should lead to a screening call worth having.',
        'Documentation bar unchanged: we still expect fantastic documents, agents or not.',
      ],
    },
  ],
  KPIS: {
    title:            'Delivery KPIs',
    goal:             'Company goal: a hire within {days} days (time to hire). Your project may carry its own targets; the live values below always win.',
    slaTitle:         'SLA targets',
    slaIntro:         'The company default for each project type, read live from Newton.',
    slaOverrideNote:  'A project can carry its own targets, which replace these defaults for that project. “Not set” means no target.',
    typeHead:         'Project type',
    benchmarksTitle:  'Scorecard benchmarks',
    benchmarksIntro:  'The rates Newton scores every role against.',
    benchmarks: [
      { key: 'outreachConversion',   label: 'Outreach → response',        kind: 'pct' },
      { key: 'submissionConversion', label: 'Submission → first interview', kind: 'pct' },
      { key: 'interviewToOffer',     label: 'First interview → offer',    kind: 'pct' },
      { key: 'offerSuccess',         label: 'Offer → hire',               kind: 'pct' },
      { key: 'timeToHireDays',       label: 'Time to hire',               kind: 'days' },
    ],
    howUsed:          'Newton flags a role when it falls behind its benchmark pace, and the SLA panel shows attainment on the four metrics. Both read from the dates you record (see Processes & Rituals).',
  },
};
