# Newton

Recruitment reporting and workforce management platform built for Momentum Global.

## Overview

Newton is a static web application hosted on GitHub Pages, with Microsoft Azure AD for authentication and SharePoint Online as its data backend. All data access is performed client-side via the Microsoft Graph API.

## Modules

| Module | File | Access |
|---|---|---|
| Reporting | `reporting.html` | Admin, Delivery Manager, Talent Partner, Leadership; People Ops (Projects only, N-365) |
| Market Analytics | `market-reporting.html` | Admin, Delivery Manager, Talent Partner |
| People | `people.html` | Admin, Leadership, People Ops (full); Delivery Manager, Talent Partner, Sales & Marketing and Staff (Org Chart only; PDP Setup is Admin and People Ops) |
| Sales | `sales.html` | Admin, Leadership; Delivery Manager (LCI Cost Models only) |
| My Momentum | `my-momentum.html` | All roles (home greeting card, sidebar name block, Command Bar). Tabs show only when relevant: My History (join date, projects completed, total hires and your project record), My Details (everyone with a People row; Admin / People Ops also pick other people; restricted `PeopleDetails` list, N-456), My Scorecard (you have activity), My Development, and My Team (Development from the PDP gate; Team Scorecards for line managers and Admin / Leadership / People Ops; scorecards moved from People in N-453). User guide: `my-momentum-user-guide.html` |
| MG Command Centre | `command-centre.html` | Admin, Leadership |
| Newton OS Admin | `admin.html` | Admin only |
| Mobile App (PWA) | `mobile.html` | Admin, Delivery Manager, Talent Partner |

## Development & Performance (PDP)

Development & Performance is Momentum's development process, spread over My Momentum (the employee and manager pages) and the People module (setup): four meeting types over a 12-month cycle (Annual Development & Goal Setting, Bi-Annual Performance & Progression Review, Quarterly Review, Monthly Development Check-In), with goals, actions and Bi-Annual pillar scores. It starts with the Delivery team.

- **Pages** — My Momentum > My Development (the employee), My Momentum > My Team > Development (line manager / CSD; Admin and People Ops read-only all-staff view), People > PDP Setup (Admin and People Ops: framework, templates, cycle, calibration).
- **Switch** — Off / Pilot / On, set by an Admin in the Config Panel's PDP tab. Pilot limits PDP to named people plus their line manager and CSD and sends no reminders; Off hides it from everyone but Admin and People Ops. Leadership has no access.
- **Data** — seven `PDP*` SharePoint lists, five of them personal with per-item permissions set by a Power Automate flow; Bi-Annual scores reveal through a second flow. Nothing here is returned by Newton for Claude.
- **v1 scope** — self and blind manager scoring, calibration, progression readiness. No reward or salary recommendation; PTP scoring stays off until the L5 IC descriptors exist.
- **More** — `Readme.html` (file map, lists and columns, access matrix, gate rules), `my-momentum-user-guide.html` (end-user guide for the My Momentum pages, including the PDP pages) and `people-user-guide.html` (People module, including PDP Setup and Calibration).

## My Onboarding

My Onboarding is Momentum's 30-day Talent Partner induction, built into My Momentum: a plan per joiner (owned, dated steps, guided and self-guided), a named buddy, an assessed intake role-play and a Day-30 line manager sign-off that the CSD countersigns. Days 31-90 are covered by the PDP check-ins.

- **Pages** — My Momentum > My Onboarding (Onboarding Plan, Processes & Rituals, Expectations & SLAs), My Momentum > Buddying, My Momentum > My Team > Onboarding (line manager / CSD; Admin sees all), People > employee record > Onboarding card (start, cancel, restart, buddy), Config Panel > Onboarding (switch) and Checklists > Onboarding (steps).
- **Switch** — Off / Pilot / On, set by an Admin in the Config Panel's Onboarding tab. Off is the default and shows nothing except an Admin preview; Pilot limits it to named pilot joiners, their line manager and CSD, and anyone with a role on a plan; On opens it to every Talent Partner (TP, STP, PTP). Leadership has no access to progress.
- **Data** — the `OnboardingPlans`, `OnboardingSignoffs` and `OnboardingStepAssignments` (N-520) SharePoint lists, the `OnboardingContent` document library, `person` rows in `ChecklistTemplates` / `ChecklistProgress`, and two `AppSettings` columns for the switch. Nothing here is returned by Newton for Claude. Owner reminders use the existing in-app notifications (Pilot and On).
- **Welcome email (N-516)** — the pre-start step "Welcome email and Week 1 agenda sent; buddy named" can carry the **Draft welcome email** action (Config Panel > Checklists > Onboarding > Newton action). In My Team > Onboarding it previews a welcome email built from the plan (Week 1 agenda by day, buddy, line manager) to copy into Outlook or open as a new mail. Nothing is sent or ticked by Newton.
- **Branded welcome email (N-517)** — the welcome email carries the Momentum look (logo header, a light card per Week 1 day, footer) and is previewed in Newton. Copy email is the main button; Open in Outlook copies it too and opens a subject-only mail to paste into. Brand values for Newton-built emails live in `js/email-brand.js` (`CONFIG.EMAIL_BRAND`).
- **Learning Library (N-518)** — a fourth My Onboarding sub-tab, **Learning Library**, lists the Library material for everyone (level filter, Open links), read-only. The list is the Library section of the Talent Partner track in Checklists → Onboarding; joiners still tick it in their plan, which now links to the tab.
- **Reassign a step (N-520)** — a step's owner, its current assignee or an Admin can hand one joiner's step to anyone with a Newton work email, or an Admin or Leadership user who has no People row (N-522) (My Team > Onboarding, Buddying), or hand it back. The assignee gets a bell note, the step in My Team > Onboarding > My actions, its reminders and the tick. Never the joiner's own steps, sign-off steps, Library items or done steps.
- **Internal-function tracks (N-541)** — one track per internal function (StaffFunction); **Marketing**, **Sales** and **People** (N-542). Those staff see only their own track's Learning Library, not Processes & Rituals or Expectations & SLAs. A line manager with no People row (an exec) is found from Leadership Access / User Assignments; the line manager's Day-30 sign-off closes such a plan (no CSD countersign or role-play), and an Admin files it with **Close plan record**.
- **v1 scope** — Talent Partner, Marketing, Sales and People tracks (the SDM track is v2), no pause (a late start is fixed by editing the start date), desktop only.
- **More** — `Readme.html` (file map, lists and columns, access, gate rules, changelog) and `my-momentum-user-guide.html` (end-user guide for the My Momentum pages, including onboarding).

## Goals & Actions

Goals & Actions is where Leadership and the Board set and track Momentum's business goals and the actions behind them, nested Annual > H2 > Quarterly with a worst-first RAG roll-up, owners, a permanent update history and a yearly rollover.

- **Page** — Command Centre > Goals & Actions (between Overview and Newton for Claude), plus a Goals & Actions tile on the Command Centre Overview that links to it.
- **Access** — Admin and Leadership only. Both can add, edit, roll over and post updates; only Admin can delete.
- **Data** — the `BusinessGoals`, `BusinessActions` and `BusinessGoalUpdates` SharePoint lists, locked to the Newton Admins and Newton Leadership groups. Leadership and Admin users can also ask Claude through the Newton for Claude `business_goals` tool (latest update per goal, names not emails).
- **More** — `Readme.html` (file map, lists and columns, access, changelog) and `user-guide.html` (end-user guide).

## Stack

- **Hosting** — GitHub Pages
- **Auth** — Microsoft Azure AD + MSAL.js v5
- **Security** — in-page Content-Security-Policy, no-referrer policy and a frame guard on every page (N-292); third-party libraries self-hosted in `js/vendor/` (N-289)
- **Data** — SharePoint Online via Microsoft Graph API v1.0
- **UI** — Vanilla HTML, CSS, JavaScript (no framework)
- **Mobile** — Installable PWA (`manifest.webmanifest` + `sw.js`) over the same codebase
- **Icons** — Lucide
- **Fonts** — Polymath (self-hosted)

## Newton for Claude (MCP)

Admin, Leadership, Delivery Manager and Talent Partner users can install **Newton for Claude** in Claude Desktop (Windows) and ask plain questions about Newton's reporting and people data. Answers are computed by Newton's own code and never include candidate names, money or notes. Admin, Delivery Managers and Talent Partners can also log weekly activity, move role stages and draft report text; every change is previewed and confirmed first.

- **Install and sign-in guide:** [`mcp/README.md`](mcp/README.md), also on the Newton for Claude page (`newton-for-claude.html`, N-551, Nov 2026) for all four roles.
- **Bundle v2 (N-546, Nov 2026):** contract 2, so every install updates once. It adds per-tool roles and the preview + confirm write path for the Advanced Newton MCP tools (N-547 onwards).
- **DMs and TPs (N-553, Nov 2026):** the seven reporting tools, scoped to their own projects (TPs: their own rows). People tools, scorecards and goals stay Leadership and Admin.
- **Hiring Plan (N-555, Nov 2026):** the `hiring_plan` tool and a `hiringPlan` section in `report_facts` for CoE projects, from the same code as the Hiring Plan page. DMs and TPs see the whole plan of a project in their scope.
- **Developer notes:** the **Newton for Claude** section of [README.html](https://momentumglobal.github.io/newton/Readme.html)

## Repository and publishing

- **Everything published is public.** The repo is public and GitHub Pages serves every file in it, including `js/config.js` and `Readme.html`, to anyone on the internet. Making the repo private would not change that (Pages stays public below GitHub Enterprise), so it is not the control.
- **Never commit anything secret or access-granting** to this repo: no passwords, API keys, client secrets, signed Power Automate URLs, tokens or user lists. Tenant and client IDs are not secrets and are public by design. Access is enforced by Entra and SharePoint, not by hiding code.
- **Guards:** GitHub secret scanning and push protection are on; `.github/workflows/gitleaks.yml` scans the full history on every push and on demand. If it fails, treat the finding as exposed: rotate the credential first, then clean up.
- **`/v2/` staging was retired on 7 October 2026** (branch `v2` deleted, `static-v2.yml` removed). Changes go straight to `main`. The live site is the only deployment.

## Developer Reference

Full system directory including architecture, data flows, SharePoint data model, role/access matrix, coding conventions, mobile app, and module build guide:

👉 **[README.html](https://momentumglobal.github.io/newton/Readme.html)**

## Quick links

- [Newton platform](https://momentumglobal.github.io/newton/)
- [Newton mobile](https://momentumglobal.github.io/newton/mobile.html)
- [SharePoint site](https://talentpoint.sharepoint.com/sites/SolutionsHubReporting)

## Changelog

The changelog lives in the Developer Reference, so there is one copy to keep current rather
than two that drift apart:

👉 **[Changelog — README.html](https://momentumglobal.github.io/newton/Readme.html)** — open the
**Changelog** section in the sidebar.

Everything that was recorded here has been migrated there; nothing was lost in the move.
