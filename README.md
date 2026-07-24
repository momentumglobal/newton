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
- **Auth** — Microsoft Azure AD + MSAL.js v2
- **Data** — SharePoint Online via Microsoft Graph API v1.0
- **UI** — Vanilla HTML, CSS, JavaScript (no framework)
- **Mobile** — Installable PWA (`manifest.webmanifest` + `sw.js`) over the same codebase
- **Icons** — Lucide
- **Fonts** — Polymath (self-hosted)

## Developer Reference

Full system directory including architecture, data flows, SharePoint data model, role/access matrix, coding conventions, mobile app, and module build guide:

👉 **[README.html](https://momentumglobal.github.io/newton/Readme.html)**

## Quick links

- [Newton platform](https://momentumglobal.github.io/newton/)
- [Newton mobile](https://momentumglobal.github.io/newton/mobile.html)
- [SharePoint site](https://talentpoint.sharepoint.com/sites/SolutionsHubReporting)

## Changelog

### July 2026 — LCI Lead Magnet (Sales module)

**New: LCI Lead Magnet page** — a lightweight business-development tool that produces a one-page "Country Comparison" PDF showing the cost-of-employment delta between a prospect's current location and one or more scoped locations. Distinct from the full LCI Cost Models (which model a live engagement month by month). New file `js/lci-leadmagnet.js`; Admin/Leadership only.

- **Location Library** — a shared master table (`LCILocations`): Location ("City, Country"), Employer Burden %, FX rate (entered as 1 GBP = X local), Currency (ISO code), and one average-annual-salary column per discipline. Add/edit/delete inline.
- **Insights Report Builder** — select current location, scoped locations, disciplines, and a display currency (defaults to the current location's currency, overridable). Figures are computed in GBP then converted for display. Live preview; optional "Prepared for" and "Watchouts" free text.
- **Cost delta** — overall (delta of average cost across selected disciplines) plus a per-discipline breakdown; lower-than-current in green. All costs are `salary × (1 + burden) ÷ fx`, normalised to GBP.
- **Output** — single-page portrait branded PDF with a fixed methodology/disclaimer note. Generate-and-download only (no saved reports).
- **Config:** disciplines live in `CONFIG.LCI_DISCIPLINES` (single source of truth, mapped to the `Sal_*` columns); `CONFIG.COUNTRY_CURRENCY` extended with common nearshore/offshore markets so their currencies are selectable.

### July 2026 — LCI Cost Models (Sales module)

**New: Location & Cost Intelligence (LCI) Cost Models** — a native replacement for the Excel recruitment ramp & cost model used on LCI location-research engagements. Built as a new page in the Sales module (`js/lci-*.js`); Admin/Leadership full access, Delivery Managers scoped to models assigned to them.

- **Model editor** — settings bar (two currencies: local CoE currency + customer display currency, with a manual FX rate; employer burden, salary-months for 13th/14th-month markets, notice period, office/EoR/travel per head), a hiring roadmap grid with project milestones, and CoE / legacy / one-off / project-fee sections. A live cost-model table + cumulative-spend chart recompute on every edit.
- **Compare** — N models side by side (same display currency): KPI table + multi-line cumulative-spend chart.
- **Report export** — assemble one or more models into a branded multi-page PDF: navy cover, per-model sections, a Location Comparison section, and a rich-text Observations & Recommendations page. Reports can be **saved** (definition only — numbers live-recompute on re-open) via the new `LCIReports` list.
- **Hiring Plan linkage** — a Won model links to a CoE project and generates one CoE Hiring Plan row per hire (Open Dates derived from the ramp), bridging sales to delivery.
- **Salary benchmarks** — as a role title is typed, an inline hint suggests the median salary for that exact title in the same location + currency, drawn equally from all prior models.
- **Data model:** new SharePoint lists `LCIModels`, `LCIModelRows` (RowType = coe/legacy/oneoff/fee; per-month values stored as JSON), `LCIMilestones`, `LCIReports`. All added to `FIELD_ALIASES` as empty objects. StartMonth is stored as a `YYYY-MM` **text** column (never a date — avoids the BST month-shift gotcha).
- **Access:** Sales module opened to Delivery Managers, scoped to the LCI Cost Models page only (Revenue Tracking / Sales Forecast remain Admin/Leadership).

### July 2026 — Hiring Plan (CoE projects)

**New: Hiring Plan page (Reporting module, `js/coe-plan.js`)**
Gantt-style week-by-week hiring roadmap for Centre of Excellence projects — replaces the Excel plan used for TP capacity planning and customer expectation-setting. Visible to all Reporting roles; Admin/DM edit, TP/Leadership read-only. The page lists only projects marked as CoE.

- **Plan builder** — rows need only a role title and open date; Recruitment/Notice/Onboarding phases auto-complete from `CONFIG.COE_PHASE_DEFAULTS`, with optional per-row week overrides. Target Hire Date is derived (open date + recruitment weeks), never stored. Handover excluded from v1.
- **Capacity strip** — weekly # in Recruitment/Notice/Onboarding above the timeline, with a Talent Partner filter for per-TP workload.
- **Forecast vs Planned hires** — monthly table; forecast derived from target hire dates, planned entered inline by the DM (stored in `CoEPlanForecast`), variance highlighted.
- **Roles linkage** — Link picker + "Create Role" (pre-filled Add Role form). Linked rows overlay actual progress as a thin bar: R from `Roles.OpenDate`, N from `Roles.ActualHireDate`, O from `Placements.ProvisionalStartDate`.

**Data model**
- `Projects` gains a `ProjectType` choice column (Embedded/CoE, default Embedded) — added to the project form; gates the Hiring Plan page.
- New lists: `CoEPlanRows` (planned roles + phase overrides + `LinkedRoleID`) and `CoEPlanForecast` (monthly forecast hires). Both registered as `{}` in `FIELD_ALIASES`.

**Gotcha (timezone)** — forecast month dates must be written as manually built ISO strings and read back via `new Date()` local parsing. `toISOString()` or string-slicing shifts the 1st of a month into the prior month under BST (SharePoint returns the value as a UTC datetime, e.g. `2026-06-30T23:00:00Z` for 1 July).

### June 2026 — Mobile App (installable PWA)

**New: Newton mobile as a Progressive Web App (`mobile.html`)**
Installable to a phone home screen ("Add to Home screen" / "Install app") with a standalone launch, over the same codebase as the desktop site — no separate native build. An earlier Flutter WebView prototype was retired because embedded WebViews block Microsoft login; the PWA runs in the device browser engine where login works.

- `manifest.webmanifest` — installability (name, navy Momentum icons 192/512, standalone display, `#090546` theme).
- `sw.js` — service worker, network-first, caches **no** app code (so there is never stale JS after a commit); ignores cross-origin and non-GET requests, so Microsoft login and SharePoint writes are never intercepted.
- Mobile shell: Home launcher + top-bar module switcher driven by `CONFIG.OS_MODULES` filtered through a new `MOBILE_MODULES` registry; per-module bottom nav via `MOBILE_NAV` (`mobile-app.js`, `mobile-home.js`).

**Module coverage on mobile**
- **Reporting** (write) — Summary, roles list with search/stage filter, role detail, stage update, weekly activity, placement, Add Role, Log Rejection (`mobile-pages.js`, `mobile-roleform.js`, `mobile-reporting-ext.js`).
- **People** (read-only) — dashboard KPI tiles (`mobile-people.js`) + Scorecards with a swipe carousel for DM/Admin (`mobile-scorecards.js`).
- **Sales** (write) — Sales Forecast list + add/edit (`mobile-sales.js`).
- **Market Analytics** (read-only) — condensed Placement Analytics: Summary + Funnel Drop-off tiles, filter by location / functional area (`mobile-analytics.js`).
- Command Centre is excluded from mobile.

**Single source of truth preserved** — every mobile view reuses the existing data-layer and calculation functions (`computeMonthlyRows`, `computeVelocityScore`, `computeRoleFunnel`, etc.); no business logic is duplicated. Mobile access is limited to Talent Partners, Delivery Managers and Admins, with per-module visibility inherited from `CONFIG.OS_MODULES`.

**Login robustness** — `mobileInit()` processes `handleRedirectPromise()` first and reads user email/name straight from the MSAL account, so `mobile.html` is self-sufficient after the login round-trip. `app.js` returns app sessions to `mobile.html` via a `newton_mobile` localStorage flag.

### June 2026 — Notifications, premium UI + fixes

**New: In-app notifications (`notifications.js`)**
A bell with unread badge and a slide-out drawer, rendered across every module (in the sidebar `.nav-user` block) and on the homepage (bottom bar, left of Quick Links). Self-suppresses in Ghost Mode. Notifications are computed and persisted client-side on page load — there is no server process.

- Bell + drawer engine isolated in `js/notifications.js` (not `nav-core.js`).
- Five notification types from four triggers: **role flagged** (TP + DM), **CC tile → Red** (Admin + Leadership), **survey closing within 48h** (Admin + Leadership), **placement landed** (TP + DM), **project first placement** (Leadership milestone).
- Dedupe via a `TriggerKey` per row; transition triggers (role flag, CC red) re-arm when the condition reverses, one-shot triggers fire once.
- Drawer: read-only items, per-item "mark read" tick + "Mark all read", read items stay dimmed, active-only newest 20.

**New: `Notifications` SharePoint list**
One row per recipient. Fields: `RecipientEmail`, `TriggerType`, `TriggerKey`, `Status` (active/cleared), `IsRead` (Yes/No), `Tone`, `DeepLink`, `Body`, `CreatedAt`. Registered as `Notifications: {}` in `FIELD_ALIASES` (empty object — a self-alias would strip fields, per the CCStatus precedent).

**Premium UI**
- **Skeleton shimmer** — both dashboards now show shaped skeleton placeholders (KPI card outlines + panel lines, sweeping shimmer) while data loads, replacing the plain "Loading…" text. Helper `dashboardSkeleton()` in `utils.js`.
- **KPI count-up** — dashboard KPI values animate from zero on load and on period switch. Helper `runKpiCountUps()` in `utils.js`; only clean numeric values animate (values with `%`, `:1`, deltas, or `—` stay static).
- **Reduced-motion** — a `prefers-reduced-motion` guard disables shimmer, count-up, and transitions for users who request reduced motion.

**Data model: `DeliveryManager` is now email-based**
`Projects.DeliveryManager` previously stored a free-text name, which broke notification recipient resolution (rows were written with names that never matched the email-keyed bell query). The project form's DM field is now a dropdown bound to `getAllAssignableUsers()` (new helper in `api.js`), storing the user's email — consistent with `TalentPartner`. DM is now optional. The notification write loop also skips any recipient that isn't an email (`includes('@')` guard) as a permanent safety net. Existing projects need their DM re-selected once to convert legacy names.

**Bug fixes**
- `dashboard.js` `setDetailPeriod()`: a stray `;` (instead of `+`) after `renderSpendPanel(...)` orphaned the Role Analytics placeholder, causing the Role Analytics panel to silently drop when changing the detail period. Corrected.
- `notifications.js`: the drawer uses its own `notifEsc()` escape helper instead of `index.html`'s `_escHtml`, which is undefined on module pages (previously caused the bell to fail rendering in modules).
- Notification drawer positioning: `.nav-notif-slot` must not carry a CSS `transform` — a transformed ancestor re-anchors the `position: fixed` drawer to the sidebar instead of the viewport. Centring uses `top`/`bottom` + flex.

### June 2026 — Command Centre + bug fixes

**New: MG Command Centre (`command-centre.html`)**
Executive ops dashboard for Admin and Leadership users. Three live RAG tiles — Project Health, People, and Utilisation — each with an expandable detail panel. Accessible from the module switcher on the homepage. _(A fourth tile, Revenue, was added later — see the Sales changelog entry; the live grid now shows four tiles, Revenue first.)_

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
