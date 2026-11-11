# Newton

Recruitment reporting and workforce management platform built for Momentum Global.

## Overview

Newton is a static web application hosted on GitHub Pages, with Microsoft Azure AD for authentication and SharePoint Online as its data backend. All data access is performed client-side via the Microsoft Graph API.

## Modules

| Module | File | Access |
|---|---|---|
| Reporting | `reporting.html` | Admin, Delivery Manager, Talent Partner, Leadership; People Ops (Projects only, N-365) |
| Market Analytics | `market-reporting.html` | Admin, Delivery Manager, Talent Partner |
| People | `people.html` | Admin, Leadership, People Ops (full); Delivery Manager and Talent Partner (Scorecards, Org Chart, and PDP pages where PDP applies); Sales & Marketing and Staff (Org Chart only) |
| Sales | `sales.html` | Admin, Leadership; Delivery Manager (LCI Cost Models only) |
| My Momentum | `my-momentum.html` | All roles (home greeting card, sidebar name block, Command Bar). Tabs show only when relevant; N-451 ships the shell with My History as a stub |
| MG Command Centre | `command-centre.html` | Admin, Leadership |
| Newton OS Admin | `admin.html` | Admin only |
| Mobile App (PWA) | `mobile.html` | Admin, Delivery Manager, Talent Partner |

## Development & Performance (PDP)

The People module holds Momentum's Development & Performance process: four meeting types over a 12-month cycle (Annual Development & Goal Setting, Bi-Annual Performance & Progression Review, Quarterly Review, Monthly Development Check-In), with goals, actions and Bi-Annual pillar scores. It starts with the Delivery team.

- **Pages** — People > My Development (the employee), People > Team Development (line manager / CSD; Admin and People Ops read-only all-staff view), People > PDP Setup (Admin and People Ops: framework, templates, cycle, calibration).
- **Switch** — Off / Pilot / On, set by an Admin in the Config Panel's PDP tab. Pilot limits PDP to named people plus their line manager and CSD and sends no reminders; Off hides it from everyone but Admin and People Ops. Leadership has no access.
- **Data** — seven `PDP*` SharePoint lists, five of them personal with per-item permissions set by a Power Automate flow; Bi-Annual scores reveal through a second flow. Nothing here is returned by Newton for Claude.
- **v1 scope** — self and blind manager scoring, calibration, progression readiness. No reward or salary recommendation; PTP scoring stays off until the L5 IC descriptors exist.
- **More** — `Readme.html` (file map, lists and columns, access matrix, gate rules) and `people-user-guide.html` (end-user guide).

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
