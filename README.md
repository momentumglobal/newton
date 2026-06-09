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
| Sales | `sales.html` | Admin, Leadership |
| MG Command Centre | `command-centre.html` | Admin, Leadership |
| Newton OS Admin | `admin.html` | Admin only |

## Stack

- **Hosting** — GitHub Pages
- **Auth** — Microsoft Azure AD + MSAL.js v2
- **Data** — SharePoint Online via Microsoft Graph API v1.0
- **UI** — Vanilla HTML, CSS, JavaScript (no framework)
- **Icons** — Lucide
- **Fonts** — Polymath (self-hosted)

## Developer Reference

Full system directory including architecture, data flows, SharePoint data model, role/access matrix, coding conventions, and module build guide:

👉 **[README.html](https://momentumglobal.github.io/newton/Readme.html)**

## Quick links

- [Newton platform](https://momentumglobal.github.io/newton/)
- [SharePoint site](https://talentpoint.sharepoint.com/sites/SolutionsHubReporting)

## Changelog

### June 2026 — Command Centre + bug fixes

**New: MG Command Centre (`command-centre.html`)**
Executive ops dashboard for Admin and Leadership users. Three live RAG tiles — Project Health, People, and Utilisation — each with an expandable detail panel. Accessible from the module switcher on the homepage.

- `js/cc-router.js` — page registry and role access
- `js/cc-nav.js` — nav wrapper using shared `renderModuleNav()`
- `js/cc-app.js` — module init, auth and role check
- `js/cc-pages.js` — all tile renderers, RAG logic, and detail panel renderers

**New: CCStatus SharePoint list**
Stores the three CC RAG values (Project Health / People / Utilisation) between sessions. Written by the Command Centre on load and by the homepage refresh button. Read by `index.html` on load to show badge colours instantly without recomputing.

**New shared functions in `analytics.js`**
- `isRoleFlagged(role, activity)` — central flag logic used by Project Health RAG, People Scorecards, and the homepage banner. Flags a role if days-open vs stage timeline is exceeded, or submission conversion is below 50%.
- `ACTIVE_STAGES` — shared exclusion list: `['Placed', 'Closed', 'Hired', 'Backlog', 'Cancelled']`
- `STAGE_ORDER` — canonical stage sequence: `['Sourcing', 'Interview 1', 'Interview 2+', 'Final Interview']`

**Homepage banner redesign**
CC tile on `index.html` now shows three section badges (Project Health / People / Utilisation) with live RAG colours drawn from the CCStatus list. Includes a refresh button that recomputes all three RAGs live and writes back to SharePoint.

**Bug fixes**
- Ghost mode: fixed role resolution and project scoping for DM and TP ghost sessions
- TP role scoping: fixed cases where Talent Partners could see roles outside their assigned project
- DM role access: Delivery Managers now correctly land on the Scorecards page in the People module
- `forms.js`: fixed select field rendering where `<select>` tags were not closing correctly
- Utilisation thresholds: hardcoded `0.85`/`0.75` values in `people-pages.js` replaced with `CONFIG.UTILISATION_THRESHOLDS` refs
- People Scorecards RAG pill: card RAG is now driven by flagged-roles ratio (not velocity score), fixing a `toUpperCase` error on undefined
- `api.js` `FIELD_ALIASES`: fixed `CCStatus` entry — `{ RAG: 'RAG' }` alias was causing the RAG field to be deleted on normalisation; corrected to `CCStatus: {}`
- Stage names: `isRoleFlagged` and CC RAG logic now use SharePoint's actual stage values (`'Interview 1'`, `'Interview 2+'`) rather than camelCase variants
