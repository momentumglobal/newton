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
- **Data** — the `OnboardingPlans` and `OnboardingSignoffs` SharePoint lists, the `OnboardingContent` document library, `person` rows in `ChecklistTemplates` / `ChecklistProgress`, and two `AppSettings` columns for the switch. Nothing here is returned by Newton for Claude. Owner reminders use the existing in-app notifications (Pilot and On).
- **Welcome email (N-516)** — the pre-start step "Welcome email and Week 1 agenda sent; buddy named" can carry the **Draft welcome email** action (Config Panel > Checklists > Onboarding > Newton action). In My Team > Onboarding it previews a welcome email built from the plan (Week 1 agenda by day, buddy, line manager) to copy into Outlook or open as a new mail. Nothing is sent or ticked by Newton.
- **v1 scope** — Talent Partner track only (the SDM track is v2), no pause (a late start is fixed by editing the start date), desktop only.
- **More** — `Readme.html` (file map, lists and columns, access, gate rules, changelog) and `my-momentum-user-guide.html` (end-user guide for the My Momentum pages, including onboarding).

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

Leadership and Admin users can install **Newton for Claude** in Claude Desktop (Windows) and ask plain questions about Newton's reporting and people data. Answers are computed by Newton's own code, read-only, and never include candidate names, money or notes.

- **Install and sign-in guide:** [`mcp/README.md`](mcp/README.md)
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
