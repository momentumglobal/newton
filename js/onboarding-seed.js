// js/onboarding-seed.js — the standard Talent Partner onboarding track (N-498 / ONB-3, epic N-482). Pure data:
// no code, no network I/O, no DOM. Consumed by onbSeedPlan() (onboarding-logic.js) when an Admin presses
// "Seed Talent Partner track" in Config Panel > Checklists > Onboarding. Create-only: a step whose ItemKey already
// exists (retired or not) is never touched. ONE-OFF TOOL: retired by the parked "[retire, from N-498]" backlog row.
//
// Source: Newton_MyOnboarding_Nov2026.md section 2.3 + ONB-D14 (M12). Steps are split by owner where §2.3 lumped two.
// Sections are the phases (Pre-start / Week 1 / Week 2 / Weeks 3–4 / Day 30); offset = whole days from People.StartDate
// (negative = before). required = every Guided step (ONB-D25). file = path under the OnboardingContent library
// (CONFIG.ONBOARDING.CONTENT_BASE_URL), or null for no link. ItemKeys are fixed, never random: that is what makes
// re-running safe. Never change a key once the seed has run. Edit wording, owners and days in Newton, not here:
// this file only fills gaps. Not part of the MCP bundle.

const ONBOARDING_SEED = {
  track: 'TP',
  steps: [
    { key: 'onb_tp_newton-access', section: 'Pre-start', sectionOrder: 1, itemOrder: 1, label: 'Newton access set up and People row complete (work email, reports to, start date)', owner: 'PeopleOps', offset: -5, mode: 'Guided', required: true, file: null },
    { key: 'onb_tp_laptop-m365', section: 'Pre-start', sectionOrder: 1, itemOrder: 2, label: 'Laptop, M365 account and MFA set up', owner: 'Ops', offset: -3, mode: 'Guided', required: true, file: null },
    { key: 'onb_tp_welcome-email', section: 'Pre-start', sectionOrder: 1, itemOrder: 3, label: 'Welcome email and Week 1 agenda sent; buddy named', owner: 'LM', offset: -2, mode: 'Guided', required: true, file: null },
    { key: 'onb_tp_m01', section: 'Week 1', sectionOrder: 2, itemOrder: 1, label: 'M01 Welcome to Momentum Global', owner: 'CSD', offset: 0, mode: 'Guided', required: true, file: 'M01. Welcome to Momentum Global.pptx' },
    { key: 'onb_tp_buddy-1to1', section: 'Week 1', sectionOrder: 2, itemOrder: 2, label: 'Meet your buddy; first 1:1 with your line manager', owner: 'Employee', offset: 1, mode: 'Guided', required: true, file: null },
    { key: 'onb_tp_m02', section: 'Week 1', sectionOrder: 2, itemOrder: 3, label: 'M02 Working at Momentum', owner: 'PeopleOps', offset: 1, mode: 'Guided', required: true, file: 'M02. Working at Momentum.pptx' },
    { key: 'onb_tp_m03a', section: 'Week 1', sectionOrder: 2, itemOrder: 4, label: 'M03a Your toolkit', owner: 'CSD', offset: 1, mode: 'Guided', required: true, file: 'M03a. Your toolkit.pptx' },
    { key: 'onb_tp_accounts', section: 'Week 1', sectionOrder: 2, itemOrder: 5, label: 'Accounts working: Teams groups, Notion, LinkedIn Recruiter, DEXT, signature, Copilot agents', owner: 'Employee', offset: 2, mode: 'Guided', required: true, file: null },
    { key: 'onb_tp_m03b', section: 'Week 1', sectionOrder: 2, itemOrder: 6, label: 'M03b Newton for Talent Partners', owner: 'LM', offset: 2, mode: 'Guided', required: true, file: 'M03b. Newton for Talent Partners.pptx' },
    { key: 'onb_tp_evp-details', section: 'Week 1', sectionOrder: 2, itemOrder: 7, label: 'Read the EVP and values; complete My Details in My Momentum', owner: 'Employee', offset: 2, mode: 'Guided', required: true, file: null },
    { key: 'onb_tp_m04', section: 'Week 1', sectionOrder: 2, itemOrder: 8, label: 'M04 The Momentum Way', owner: 'CSD', offset: 2, mode: 'Guided', required: true, file: 'M04. The Momentum Way.pptx' },
    { key: 'onb_tp_m05', section: 'Week 1', sectionOrder: 2, itemOrder: 9, label: 'M05 Running a great intake (assessed role-play, signed off by your line manager)', owner: 'LM', offset: 3, mode: 'Guided', required: true, file: 'M05. Running a great intake.pptx' },
    { key: 'onb_tp_m06', section: 'Week 1', sectionOrder: 2, itemOrder: 10, label: 'M06 Working with your agents', owner: 'LM', offset: 4, mode: 'Guided', required: true, file: 'M06. Working with your agents.pptx' },
    { key: 'onb_tp_m07', section: 'Week 1', sectionOrder: 2, itemOrder: 11, label: 'M07 Sourcing & outreach', owner: 'LM', offset: 4, mode: 'Guided', required: true, file: 'M07. Sourcing & outreach.pptx' },
    { key: 'onb_tp_m08', section: 'Week 1', sectionOrder: 2, itemOrder: 12, label: 'M08 Screening candidates', owner: 'LM', offset: 4, mode: 'Guided', required: true, file: 'M08. Screening candidates.pptx' },
    { key: 'onb_tp_project-onboarding', section: 'Week 1', sectionOrder: 2, itemOrder: 13, label: 'Project onboarding: added to the Project Team, client systems, client induction', owner: 'LM', offset: 4, mode: 'Guided', required: true, file: null },
    { key: 'onb_tp_m09', section: 'Week 2', sectionOrder: 3, itemOrder: 1, label: 'M09 Candidate experience & closing', owner: 'LM', offset: 9, mode: 'Guided', required: true, file: 'M09. Candidate experience & closing.pptx' },
    { key: 'onb_tp_m10', section: 'Week 2', sectionOrder: 3, itemOrder: 2, label: 'M10 Stakeholder & job management', owner: 'LM', offset: 11, mode: 'Guided', required: true, file: 'M10. Stakeholder & job management.pptx' },
    { key: 'onb_tp_m11', section: 'Week 2', sectionOrder: 3, itemOrder: 3, label: 'M11 Reviewing a Brunel IPG', owner: 'Employee', offset: 11, mode: 'Self-guided', required: false, file: 'M11. Reviewing a Brunel IPG.pptx' },
    { key: 'onb_tp_first-week-activity', section: 'Weeks 3–4', sectionOrder: 4, itemOrder: 1, label: 'First full week of Newton activity logged', owner: 'Employee', offset: 14, mode: 'Guided', required: true, file: null },
    { key: 'onb_tp_shadowing', section: 'Weeks 3–4', sectionOrder: 4, itemOrder: 2, label: 'Shadow a live intake, a screening and a client update', owner: 'Buddy', offset: 21, mode: 'Guided', required: true, file: null },
    { key: 'onb_tp_m12', section: 'Weeks 3–4', sectionOrder: 4, itemOrder: 3, label: 'M12 Preparing a Market Report (practised on a live role, reviewed with your line manager)', owner: 'LM', offset: 24, mode: 'Guided', required: true, file: 'M12. Preparing a Market Report.pptx' },
    { key: 'onb_tp_library-picks', section: 'Weeks 3–4', sectionOrder: 4, itemOrder: 4, label: 'Pick at least two Library items for your level', owner: 'Employee', offset: 28, mode: 'Self-guided', required: false, file: 'Library' },
    { key: 'onb_tp_day30-signoff', section: 'Day 30', sectionOrder: 5, itemOrder: 1, label: 'Onboarding review and sign-off; PDP joiner goal-setting meeting held', owner: 'LM', offset: 30, mode: 'Guided', required: true, file: null },
  ],
};
