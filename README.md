# Newton

Recruitment reporting and workforce management platform built for Momentum Global.

## Overview

Newton is a static web application hosted on GitHub Pages, with Microsoft Azure AD for authentication and SharePoint Online as its data backend. All data access is performed client-side via the Microsoft Graph API.

## Modules

| Module | File | Access |
|---|---|---|
| Reporting | `reporting.html` | Admin, Delivery Manager, Talent Partner, Leadership |
| Market Analytics | `market-reporting.html` | Admin, Delivery Manager, Talent Partner |
| People | `people.html` | Admin, Leadership, Delivery Manager |
| Sales | `sales.html` | Admin, Leadership; Delivery Manager (LCI Cost Models only) |
| MG Command Centre | `command-centre.html` | Admin, Leadership |
| Newton OS Admin | `admin.html` | Admin only |
| Mobile App (PWA) | `mobile.html` | Admin, Delivery Manager, Talent Partner |

## Stack

- **Hosting** — GitHub Pages
- **Auth** — Microsoft Azure AD + MSAL.js v5
- **Security** — in-page Content-Security-Policy, no-referrer policy and a frame guard on every page (N-292); third-party libraries self-hosted in `js/vendor/` (N-289)
- **Data** — SharePoint Online via Microsoft Graph API v1.0
- **UI** — Vanilla HTML, CSS, JavaScript (no framework)
- **Mobile** — Installable PWA (`manifest.webmanifest` + `sw.js`) over the same codebase
- **Icons** — Lucide
- **Fonts** — Polymath (self-hosted)

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
