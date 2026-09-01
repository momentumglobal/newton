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

### September 2026 — Two-tier cache (F-3a/F-3b, N-176/N-177)

**Switching module no longer re-fetches data that hasn't changed.** Reference data (Projects, People, Departments, LCILocations, UserAssignments, LeadershipAccess) is now cached in `sessionStorage` for 10 minutes and survives page navigation, instead of dying with the 30-second in-memory cache on every page load. Transactional lists — Roles, WeeklyActivity, Placements, Assignments, RoleHistory — deliberately stay on the 30-second tier, because those are the ones a user edits and expects to see change immediately. The win is round-trip latency on module switching, not payload size: every list is under 100 rows.

**⚠️ New deploy step: bump `CONFIG.APP_BUILD` on every deploy that changes `js/` or the shape of any list's data.** Every cache key embeds the build stamp and api.js discards entries from any other build on load — that is the only thing that busts the cache on a deploy. Forget it and users keep serving the previous deploy's reference data for the rest of their session. Bump `SW_VERSION` in `sw.js` alongside it; the two are separate on purpose (a service worker cannot read `config.js`) and neither substitutes for the other.

**New:** a **Refresh data** button in the sidebar footer clears both tiers and re-renders. It shipped in N-176, before any list was enrolled in N-177 — the escape hatch had to exist before the staleness window widened.

**The invalidation contract is the actual deliverable.** A longer TTL makes the N-084 class of bug worse, not better, so N-176 was engine-plus-contract only, enrolling nothing: one invalidation path (`_cacheInvalidate`) that clears both tiers, a build stamp that busts the cache on deploy, and the Refresh button. N-177 then enrolled the six lists. In the course of that, three write paths were found calling `graphRequest('DELETE', …)` directly — `admin.js:confirmDelete`, `admin.js:deleteAdminRecord`, `os-admin.js:deleteOsAdminRecord` — bypassing cache invalidation entirely. Harmless while the TTL was 30 seconds and died on navigation; a live bug the moment it became 10 minutes. All three now route through `deleteItem()`. **Never call `graphRequest` with POST/PATCH/DELETE directly** — see Read Flow and Write Flow in the Developer Reference.

**Role cache bounded.** `newton_role_<email>` and `newton_dm_grants_<email>` were bare, unstamped values that lived for the whole browser session, so an admin changing someone's access had no effect on that person until they signed out. Both now carry a timestamp and the build stamp and expire on the same 10-minute TTL, making access data strictly fresher than before. `hasDMGrant()` deliberately honours the build stamp but **not** the TTL: it is synchronous and cannot re-resolve, so treating an aged entry as absent would silently strip a leadership user's DM access mid-page.

**Config:** `CONFIG.APP_BUILD` (new) and `CONFIG.CACHE` (`enabled` as a live kill switch, `prefix`, `ttlMs`, `maxEntryBytes`, `persistentLists`). Enrolment lives only in `persistentLists` — no list name appears in `api.js`. No SharePoint change, no new dependency.

### August 2026 — Client-side error telemetry (F-7a/F-7b, N-172/N-173)

**Newton now catches its own errors instead of dying silently.** An uncaught error or unhandled promise rejection anywhere in the app writes a row to a new `Diagnostics` list — no console nobody is watching. Admin → Data Health gets a new Error Telemetry section: errors grouped by message, with occurrence count, affected users, module and last-seen time, and an Acknowledge action to clear a group once it's understood and fixed. Nothing changes for the ordinary user — this is Admin-only tooling.

**Data model:** new `Diagnostics` SharePoint list (UserEmail, Module, Page, Message, Stack, UserAgent, OccurredAt, ErrorType, Status). Registered as `Diagnostics: {}` in `FIELD_ALIASES`.

### August 2026 — Unified error surface (F-9b, N-171)

**One consistent failure state, not twenty different ones.** A page that fails to load its data now shows the same inline state with a Retry button, replacing around 20 hand-written "Error loading X" messages that had each been invented separately. A failure that happens mid-action — saving, or loading data into a modal that's already open — shows a toast instead of replacing content still visible on screen. Covers the desktop Reporting/Sales/Market Analytics modules and the mobile app.

### August 2026 — Ghost Mode as a real user (N-162)

**See exactly what a real person sees, not a synthetic role.** Ghost Mode now impersonates an actual user picked from Newton's existing records, resolving their real role and their real project scope from their own assignments — instead of a role label paired with one manually chosen project. This also fixes the previous gap where ghosting someone with no assignment on the picked project left dropdowns like "Assign to" empty.

### August 2026 — Search bar on the User Guides (N-163)

**Find a topic without scrolling.** All four user guides — Reporting, People, Sales, Market Analytics — now have a search box at the top that filters the page to matching topics as you type.

### August 2026 — Fix: unreadable headings in dark mode (N-168)

Section and modal headings were near-invisible in dark mode (2.34–2.89:1 contrast against the 4.5:1 accessibility requirement). Fixed at the token layer — headings across every screen now render in a lighter blue that passes contrast in dark mode, with no change to light mode.

### August 2026 — Role History timeline (D-3a/D-3b)

**See exactly how a role got to where it is.** A "Timeline" action next to Edit on the Roles page opens a vertical, stage-by-stage history for that role — every stage change with the date it happened and how long the role spent in the stage before it, forward progress in green, a move backward in red, and a move onto or off On-hold/Cancelled in amber, since neither is a step forward or back. The first entry marks when the role was created. If its Open Date predates that — or predates the date it was actually moved into Sourcing — the timeline uses the Open Date instead and labels it "Role opened," so a role logged into Newton after the fact (or moved into Sourcing with a backfilled Open Date) still shows an honest start point and accurate stage duration. `ChangedBy` shows the person's name, not a raw email, matching the rest of the platform. Timeline only appears on roles that have recorded history — a role created before this shipped has nothing to show, so the action doesn't appear on it. Desktop only for now; mobile has no Roles list to hang the action off.

**Data model:** new `RoleHistory` SharePoint list (RoleID lookup, Field, OldValue, NewValue, ChangedBy, ChangedAt) — one row per field that actually changed, written on every role edit and, as of this feature, on role creation too. Registered as `RoleHistory: {}` in `FIELD_ALIASES`.

### August 2026 — Duplicate role (T-6)

**Stop retyping roles that repeat.** A "Duplicate" action next to Edit on the Roles page opens the Add Role form pre-filled from the source role — Project, Title, Hiring Manager, Talent Partner(s), Budget, Location, Priority, Backfill, Department and Notes all carried over. Stage resets to Backlog, Open Date resets to today, and Target Hire Date is cleared, so the copy starts its own pipeline clean. Saving creates a new role; the source role is untouched.

### August 2026 — Bulk weekly activity entry (T-2)

**Log a whole week in one save.** A "Bulk log week" button on the Weekly Activity page opens a grid with one row per role the signed-in user can see, grouped by project, for a chosen week-ending Sunday. Rows already logged for that week are pre-filled from the existing records and update in place rather than creating duplicates; rows the user does not touch are never written at all. Each row saves against the Talent Partner assigned to that role — a role with no assigned TP is shown disabled rather than being attributed to whoever opened the grid. Saves run sequentially with every control locked for the duration, and a failure on one row leaves the others saved and the failed row editable and marked. The single-role "Log Activity" form is unchanged.

### August 2026 — Command Bar (T-1)

**⌘K / Ctrl+K, anywhere.** A fuzzy-searchable overlay opens over any of the four command-bar-enabled modules (Reporting, People, Sales, Command Centre) and lists every page you can reach across all of them — arrow keys, Enter and Escape drive it like any command palette, and picking a result outside your current module navigates you straight there. Typing also searches already-loaded Roles, Projects and People and deep-links to the matching record's edit form — nothing is fetched on keypress. Role results carry three inline actions — Log activity, Update stage, Add placement — so a Talent Partner can jump straight into the action they came for without opening the role first.

### August 2026 — Inline stage update from the roles list (T-4)

**Move a role forward without opening the form.** A stage dropdown on each row of the Roles table lets you change a role's stage directly from the list, for every stage except Hired and Cancelled — those two carry side effects and still require the full Edit form. Works in either direction, matching the existing full-form Stage field.

### August 2026 — Tests for the analytics layer (F-6d)

**Real test coverage for the numbers clients see.** `tests/` now asserts three previously-untested `isRoleFlagged` branches (the days-open thresholds — only the submitted/interview1 ratio branch had coverage before — plus a negative case confirming the function doesn't over-flag), `computeVelocityScore`, `computeRoleFunnel` (neither had any prior coverage), and the split-fee revenue path in `computeMonthlyRows` (N-116 — shipped with zero test coverage until now), including the rule that the placement fee lands the month *after* the assignment ends as a zero-capacity revenue row. This closes out F-6's four-part test harness build (F-6a scaffold, F-6b date/week layer, F-6c LCI calc layer, F-6d analytics layer).

### August 2026 — Tests for the LCI calc layer (F-6c)

**More real test coverage.** `tests/` now asserts `lciRowNotice` (including the exact "zero is a real override value" case its own source comment warns a naive rewrite would break), `lciCumulativeHeadcount` fed a per-role-resolved notice end-to-end, two more `lciYearSlices` edge cases, `lciLegacyMonthlyCost`, and `_pickFields` — the one pure, non-network export in `api.js`, which the test rig now also loads (verified zero top-level execution first, same check already applied to `coe-plan.js`; nothing else in `api.js` is called). This does **not** fully close the N-082 gap (LCI model copy losing rows) — the copy field-whitelists have no static schema to verify completeness against without a live Graph read, which is what F-11 (Schema contract check, scoped, not yet built) is for. This task locks in that `_pickFields` itself filters correctly, nothing more.

### August 2026 — Tests for the date/week layer (F-6b)

**Real test coverage, not just seed assertions.** `tests/` now asserts `getWeekEnding`, `getISOWeek`, `isoDate`, `spDateIn`/`spDateOut`, and — the one that mattered most — a dedicated regression test for `coeWeekIndex`, locking the N-077/N-081 GMT/BST Gantt class shut for good (also confirms N-129's `getWeekEnding` fix, shipped just before this task, stays fixed). That Gantt assertion only reproduces under a DST-observing timezone, so `tests/run.js` now forces `TZ=Europe/London` before anything else runs — verified this override wins even when the shell sets a conflicting `TZ` first. `tests/index.html` detects when a browser's own timezone can't show the same GMT/BST skew and renders a clearly-labelled SKIP rather than a meaningless PASS or FAIL.

### August 2026 — Fix: getWeekEnding() BST rollback bug

**Bug fix.** `getWeekEnding()` returned the Saturday before the correct Sunday whenever it was called with a `Date` object during British Summer Time — it computed the right day locally but round-tripped the result through `toISOString()`, which re-expresses a local-midnight instant in UTC and rolled it back a day. In GMT months the bug was invisible, which is why it shipped unnoticed. The only live call site affected is `admin.js`'s `writeSnapshotsNow()` ("Write Snapshot Now" in the Config Panel), which writes `Snapshots.WeekEndingDate` — every click during BST (late March–late October) since Snapshots shipped wrote the wrong Sunday. `forms.js` and `mobile-pages.js` call `getWeekEnding()` with a date-only string, which parses as UTC and was never affected. No backfill of previously-written Snapshots rows is included in this fix.

### August 2026 — Test harness (F-6a)

**New: `tests/` — Newton's first automated test infra.** A pass/fail page (`tests/index.html`) and a dependency-free Node runner (`tests/run.js`) share one assertion list (`tests/assertions.js`) against fixture data (`tests/fixtures.js`), run against the real `utils.js`/`analytics.js`/`lci-model.js` in production script order. Ships with 4 seed assertions covering revenue proration, role flagging, LCI headcount and LCI horizon slicing — enough to prove the rig, not full coverage. `.github/workflows/static.yml` now runs `node tests/run.js` in a `test` job before `deploy`, so a broken calc can't reach `main`. Real coverage of the date/week layer, the LCI calc layer, and the analytics layer follows in three further tasks that extend `tests/fixtures.js`/`tests/assertions.js` rather than replace them.

### August 2026 — Split-fee revenue: Exec Search & MG AI

**New: split-fee product lines** — two new project types, Exec Search and MG AI, bill as a retainer plus a placement fee rather than a monthly rate. Selecting either on an assignment swaps the Monthly Bill Rate field for **Retainer (£)** and **Placement Fee (£)**; every other project type is unchanged. The retainer is recognised in the assignment's start month and the placement fee in the **month after** its end month — so an Aug–Oct assignment books its placement fee in November, and a December-ending one books it in January of the following year. Neither is pro-rated. Utilisation is unaffected: a split-fee assignment occupies its person exactly as any other, because billed capacity comes from date overlap and the `Billed` flag, not from the rate.

The same treatment is applied to the Sales Forecast (desktop and mobile), which gains a Project Type selector; on a split-fee line, Forecasted Headcount means **number of searches** and multiplies each fee. Forecast rows saved before this change have no project type and keep their existing monthly-rate behaviour with no backfill needed.

Consolidated the project-type enums and colours, previously duplicated across five files, into `config.js` (`PROJECT_TYPES`, `ASSIGNMENT_PROJECT_TYPES`, `SPLIT_FEE_PROJECT_TYPES`, `PROJECT_TYPE_COLOUR_VARS`) and `--c-ptype-*` tokens in `style.css`. New `Assignments` columns `RetainerFee`/`PlacementFee`; new `SalesForecasts` columns `ProjectType`/`RetainerFee`/`PlacementFee`.

### August 2026 — Project filters, PTP level, Command Centre trend arrow, and fixes

**New: Active/Archive project filters (Reporting module)** — every project dropdown across Roles, Weekly Activity, Placements, Rejected Offers, the Project Dashboard selector, and the Report Builder's project selector now groups projects into two sorted sections, Active (Status = Active/Transition) and Archive (Status = Completed). The Add Role, Add Weekly Activity, and Record Placement forms show Active projects only when creating a new record — editing an existing record still shows its project even if that project has since moved to Archive. New shared helpers in `js/utils.js`: `isProjectActive()`, `sortProjectsByName()`, `buildProjectOptionsHtml()`.

**New: PTP employee level (People module)** — `People.Level` gains a fifth value, PTP, ranked immediately below TP. PTP employees are treated identically to TP in every "billable team" calculation — headcount, utilisation, roster/Gantt sort order, Org Chart banding (renders in the same colour as TP) and placeholder ("vacancy") creation. This is a job-grade change only: PTP employees still authenticate via the existing `talent_partner` permission role, so login access is unchanged. Consolidated the level-order and billable-filter logic — previously duplicated across 9 files — into two shared helpers, `levelSortIndex()` and `isBillableLevel()`, in `js/utils.js`.

**New: Time-series snapshots + Command Centre Health trend arrow** — a new `Snapshots` SharePoint list (one row per project per week: open roles, roles by stage, avg days open, placements, activity totals, flagged count) is populated by a "Write Snapshot Now" action on a new Snapshots tab in the Config Panel. Once 3+ weeks of history exist, the Command Centre's Health tile shows a small trend arrow (hover for an explainer tooltip) indicating whether the company-wide flagged-role rate is improving or worsening week over week; it shows nothing below that threshold. An earlier plan to automate the weekly write via Power Automate was dropped 11 Aug 2026 in favour of a future GitHub Actions-based writer (not yet built) — for now, someone needs to click "Write Snapshot Now" weekly. A parallel plan to track per-project Utilisation in Snapshots was descoped after testing showed the metric is structurally always near-100% at the per-project level, which would make it meaningless.

**Bug fixes**
- Notification bell items are now clickable — the deep-link wiring existed but was never connected to the click handler.
- Editing a role in the Reporting module no longer loses the selected project on load.
- A new customer assignment starting today no longer shows the affected team members as Unassigned in the Org Chart (date-comparison fix).
- The weekly pipeline-stage breakdown behind Snapshots no longer counts terminal `Hired`/`Cancelled` roles, which was drowning out genuinely in-flight stages.
- Removed the unused `Projects.Yeare` field alias.

### August 2026 — LCI Cost Model: Export to Excel (Sales module)

**New: Export to Excel** on the LCI model Summary page, beside Print / PDF. Produces a branded seven-sheet workbook containing every input, assumption and derived figure behind the client PDF — built as an **internal working file**, not a client deliverable. New file `js/lci-excel.js`; no SharePoint change.

- **Live formulas, not a value dump.** Every figure is a real Excel formula driven by named cells on the Assumptions sheet (`Burden`, `SalaryMonths`, `NoticeDefault`, `OfficePerHead`, `EoRPerHead`, `FXRate`, `Horizon`). Change an assumption and the whole model re-totals — including notice-period offsets, auto run-rate, and the cumulative spend line.
- **Section switches** — `TravelOn`, `LegacyOn`, `OneoffsOn`, `FeesOn` as 1/0 cells, mirroring the section toggles in Newton. Set one to 0 to strip that section out of the totals without deleting a row.
- **Sheets:** Assumptions · CoE Roadmap · Legacy Team · One-offs & Fees · Monthly Calc (the audit sheet — every line, every month, including sections switched off) · Output Summary (mirrors the client PDF line for line) · Milestones.
- **Every formula also carries its computed value**, so the file is correct the moment it opens rather than after a recalculation — and any disagreement between the two is visible instead of silent.
- **Library:** ExcelJS 4.4.0, lazy-loaded from CDN on first click only (~950KB, never on page render). Pinned. Chosen over SheetJS, whose free build cannot style cells.
- The **LCI Lead Magnet is unaffected** — it remains PDF-only.

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
