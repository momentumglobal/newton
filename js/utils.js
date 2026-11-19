// js/utils.js — pure helpers with no network I/O and no DOM
// Loaded before api.js in all HTML files. DOM/UI helpers are in ui-kit.js (loads
// straight after this file); the rich-text table editor is in richtext.js.
// Domain logic shared across modules (headcount, role history, placement picker, CoE link, WeeklyActivity
// ProjectID helpers) is in headcount.js.
// Checklist rules are in checklist-logic.js; role and permission rules (role resolution,
// roleCan, survey eligibility, restricted-list helpers) are in permissions.js.
// N-474: People / workforce rules are in people-logic.js, project-type and KPI-exclusion rules in
// project-types.js, template rules in templates-logic.js and assignment revenue maths in revenue-logic.js
// (all four load straight after this file); theme, density and chart-colour helpers and exitGhostMode()
// are in ui-kit.js.

// ── Platform detection ──────────────────────────────────────────────
// Used for the ⌘K/Ctrl+K sidebar hint (N-256) — never assume a platform,
// derive it. Defaults to false (Windows/Linux label) if navigator access
// throws for any reason; must never block sidebar render.
function isMacPlatform() {
  try {
    const uaPlatform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
    return /Mac/i.test(uaPlatform);
  } catch (e) {
    return false;
  }
}

// N-241 follow-up: the one-line lookup shared by getCurrencyForRole (api.js)
// and mobileRenderPlacementForm's role-preselected prefill (mobile-pages.js).
function currencyForRole(role) {
  return CONFIG.COUNTRY_CURRENCY[role.Location] || '';
}

// ── Sales forecast form logic (N-241) ───────────────────────────────────
// Shared by saveForecast (sales-pages.js) and mobileSaveForecast
// (mobile-sales.js) — desktop and mobile forms read fields with different
// element IDs and show errors differently, so each caller still does its
// own form-reading and error display; only the pure validation/shape logic
// below was identical between them.

// Returns an error message string, or null if the form is valid.
function validateForecastForm({ title, start, end, hc, isSplit }) {
  if (!title) return 'Customer / Project name is required.';
  if (!start) return 'Start date is required.';
  if (!end)   return 'End date is required.';
  if (new Date(end) <= new Date(start)) return 'End date must be after start date.';
  // N-116 QA1: split-fee lines may forecast 0 headcount — a double-up on an
  // already-deployed employee, which adds revenue but no capacity.
  if (Number.isNaN(hc) || hc < 0) {
    return 'Headcount must be 0 or more.';
  }
  if (!isSplit && hc < 1) {
    return 'Headcount must be at least 1.';
  }
  return null;
}

function buildForecastPayload({ title, start, end, hc, fcType, revPerHead, retainer, placement, notes, isSplit }) {
  return {
    Title: title,
    // N-116 QA1: isoDate() pins to T12:00:00Z. Without it SharePoint stores a
    // BST midnight as the previous day in UTC and 1 Sept reloads as 31 Aug —
    // which moves a whole split-fee lump sum into the wrong month. Every other
    // write path in Newton already does this; this form was the only omission.
    ForecastStartDate: isoDate(start),
    ForecastEndDate: isoDate(end),
    ForecastedHeadcount: hc,
    // N-116: a row is either monthly-rate OR split-fee, never both — the
    // unused side is written null so a type change leaves nothing stale
    // behind that would double-count in the revenue chart.
    ProjectType: fcType,
    ForecastMonthlyRevenuePerHead:
      isSplit || revPerHead === '' ? null : parseFloat(revPerHead),
    RetainerFee:  isSplit && retainer  !== '' ? parseFloat(retainer)  : null,
    PlacementFee: isSplit && placement !== '' ? parseFloat(placement) : null,
    Notes: notes,
  };
}

// ── Open pipeline predicate (N-305) ─────────────────────────────────────
// Open, actively-worked pipeline — the reporting / role-picker definition of
// an "open role" (dashboards KPI + panels, Report Builder, placement and
// rejected-offer pickers, Command Bar search, Roles page "Active" filter).
// Derived from CONFIG.ROLE_STAGES_PARKED + CONFIG.ROLE_STAGE_TERMINAL, never
// a third list. Unknown/blank stages return true — preserves the old
// `!EXCLUDED.includes(r.Stage)` behaviour. Set-equivalent to analytics.js's
// ACTIVE_STAGES over real stage values (pinned by assertion), so dashboards
// and Snapshots agree on "open".
function isOpenPipelineStage(stage) {
  return !CONFIG.ROLE_STAGES_PARKED.includes(stage) &&
         !CONFIG.ROLE_STAGE_TERMINAL.includes(stage);
}

// ── Role stage <select> markup (N-149 addendum) ─────────────────────────
// Pure HTML string builder for the Roles-list inline stage dropdown.
// Called once, when a row is unlocked (pages.js:unlockStageEdit) — not at
// initial table render, which now shows a plain badge. Per N-149's spec,
// meant for N-146 (Command Bar) to reuse rather than reimplementing the
// same option list.
function stageSelectHtml(roleId, currentStage) {
  const options = CONFIG.ROLE_STAGES
    .filter(s => !CONFIG.ROLE_STAGE_TERMINAL.includes(s))
    .map(s => `<option value="${s}" ${currentStage === s ? 'selected' : ''}>${s}</option>`)
    .join('');
  return `<select id="stage-select-${roleId}" data-prev-value="${escAttr(currentStage || '')}"${actOn('change', 'updateRoleStage', roleId, ACT_EL)}>${options}</select>`;
}

// Pure HTML string builder for the Roles-list locked stage badge -- the
// counterpart to stageSelectHtml() above. Single source of truth for this
// markup: used both by renderRolesPage()'s initial render and by
// updateRoleStage()'s optimistic apply() (pages.js), so the two never drift.
function stageBadgeHtml(roleId, stage, canEdit) {
  const locked = CONFIG.ROLE_STAGE_TERMINAL.includes(stage);
  const badge = `<span class="badge">${escHtml(stage || "—")}</span>`;
  return (canEdit && !locked)
    ? `${badge}<button type="button" class="stage-unlock-btn" title="Change stage"${act('unlockStageEdit', roleId, stage || '')}><i data-lucide="lock"></i></button>`
    : badge;
}

// ── Optimistic-insert row helpers (N-218a) ──────────────────────────────
// Temp client-side id for an item that has been submitted but not yet
// confirmed created -- same shape as the existing bpUid()/rbUid() convention
// (briefing-pack.js/report-builder.js), centralised here because it's
// shared across all 5 optimistic-insert submit paths in forms*.js, unlike
// those two single-file ids.
function pendingRowId() {
  return 'pend_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// ── Forecast assignments ──────────────────────────────────────────────
// True when an assignment is a forecast (SP Yes/No may come back as true/1/'Yes')
function isForecastAssignment(a) {
  return a.IsForecast === true || a.IsForecast === 1 || a.IsForecast === 'Yes';
}

// 'YYYY-MM' from an ISO date string, BY STRING SLICE — deliberately never via
// new Date(). SharePoint returns UTC; parsed in BST a month-boundary date can
// shift a day, which for a lump sum moves the whole fee into the wrong month
// and at a year end into the wrong year. Returns null on anything unparseable.
function monthKeyFromISO(iso) {
  if (!iso) return null;
  const key = String(iso).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
}

// Add n months to a 'YYYY-MM' key, rolling the year over. Integer arithmetic
// only — no Date object, for the same reason as above.
function addMonthsToKey(key, n) {
  if (!key) return null;
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1 + n;
  const year  = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function monthKeyYear(key)  { return parseInt(key.slice(0, 4), 10); }
function monthKeyMonth(key) { return parseInt(key.slice(5, 7), 10); } // 1-12

// ── Formatting ────────────────────────────────────────────────────────
function formatSalary(val) {
  if (!val) return '—';
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(num)) return val;
  return num.toLocaleString('en-GB');
}

function daysOpen(openDate, hireDate) {
  if (!openDate) return null;
  const start = utcDateOnly(openDate);
  if (!start) return null;
  const now = new Date();
  const end = hireDate ? utcDateOnly(hireDate)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}

// ── List sorting (N-247a) ─────────────────────────────────────────────
// Pure data side of the click-to-sort column headers. The header renderer
// (sortableHeader) and focus restore (focusSortHeader) live in
// list-controls.js; nothing here touches the DOM, so it is covered by
// tests/run.js.
//
// CONTRACT for every list page:
//   filters → page default sort → sortRows(user sort) → paginate → render
// Sorting BEFORE paginate() is what makes a sort reach every matched row,
// not just the rows currently on screen.

// Comparable key for `v` under `type`, or null when the value counts as
// EMPTY for that type (null/undefined, blank or whitespace-only string,
// unparseable number, unparseable date). Numbers strip thousands commas the
// same way formatSalary() does. Dates become spDateIn() 'YYYY-MM-DD' strings
// — never a Date built from a SharePoint string (Timezone discipline) — which
// also keeps the order identical to the date the cell displays.
function _sortKey(v, type) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  if (type === 'number') {
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  if (type === 'date') return spDateIn(v);
  return v;
}

// ASCENDING comparison of two NON-EMPTY values. Empties are handled by
// sortRows (always last), so call this through sortRows rather than directly.
//   text   — case-insensitive, numeric-aware ('Role 2' < 'Role 10')
//   number — numeric, commas stripped
//   date   — calendar day as displayed (spDateIn string compare)
//   enum   — position in `order` (e.g. CONFIG.ROLE_STAGES); values not in
//            `order` sort after every known value, then by text
function compareSortValues(a, b, type, order) {
  const ka = _sortKey(a, type);
  const kb = _sortKey(b, type);
  if (type === 'number') return ka - kb;
  if (type === 'date') return ka < kb ? -1 : ka > kb ? 1 : 0;
  if (type === 'enum' && Array.isArray(order)) {
    const ia = order.indexOf(ka);
    const ib = order.indexOf(kb);
    const ra = ia === -1 ? order.length : ia;
    const rb = ib === -1 ? order.length : ib;
    if (ra !== rb) return ra - rb;
  }
  return String(ka).localeCompare(String(kb), undefined, { sensitivity: 'base', numeric: true });
}

// Returns rows sorted by sortState = { key, dir: 'asc'|'desc' } using
// columns = { [key]: { type, get: row => rawValue, order? } }.
// A null state, or a key that isn't a column (stale state), returns `rows`
// itself, untouched — the page's default order stands. Otherwise returns a
// NEW array; the input is never mutated. Empties sort last in BOTH
// directions (Excel behaviour). Stable: ties keep their incoming order, so
// the page's default sort acts as the tie-breaker — load-bearing, don't
// swap in an unstable sort.
function sortRows(rows, sortState, columns) {
  if (!sortState || !columns || !Object.prototype.hasOwnProperty.call(columns, sortState.key)) return rows;
  const col  = columns[sortState.key];
  const sign = sortState.dir === 'desc' ? -1 : 1;
  const keyed = rows.map(function (row) {
    const v = col.get(row);
    return { row: row, v: v, empty: _sortKey(v, col.type) === null };
  });
  keyed.sort(function (x, y) {
    if (x.empty || y.empty) return x.empty === y.empty ? 0 : (x.empty ? 1 : -1);
    return sign * compareSortValues(x.v, y.v, col.type, col.order);
  });
  return keyed.map(function (k) { return k.row; });
}

// Header click cycle: a new column starts at asc; asc → desc → null
// (null = back to the page's default order).
function nextSortState(current, key) {
  if (!current || current.key !== key) return { key: key, dir: 'asc' };
  if (current.dir === 'asc') return { key: key, dir: 'desc' };
  return null;
}

// ── Date helpers (N-054: consolidated from forms.js + five duplicate/
// shim copies previously scattered across people-forms.js, mobile-app.js,
// lci-link.js, mobile-pages.js and mobile-roleform.js) ─────────────────

// Extracts 'YYYY-MM-DDT12:00:00Z' from a date-input value (or any string
// starting with YYYY-MM-DD); null if none. Midday UTC avoids the
// SharePoint UTC↔BST date-shift on write.
function isoDate(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] + 'T12:00:00Z' : null;
}

// Returns a UTC-midnight Date for the calendar day encoded in `dateStr`
// (ignores time-of-day/offset in the source string). Use this — never
// `new Date(str); d.setHours(0,0,0,0)` — for any day-overlap/day-count
// arithmetic: local setHours() zeroes wall-clock time, not the UTC
// instant, so months spanning a BST/GMT transition silently gain or lose
// an hour and skew fraction math (N-120 — MonthFraction came out 1.0013
// instead of 1.0 for a full month).
function utcDateOnly(dateStr) {
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
}

// N-087: canonical write-path helper for a Date object (isoDate() above
// covers the date-input-STRING case; this covers the case where the
// caller already has a Date). Reads the input via UTC getters only —
// never local getters — so the caller must hand it a Date whose UTC
// getters already reflect the intended calendar day (e.g. built via
// Date.UTC(...), same "UTC getters once inside date-safe code" discipline
// computeMonthlyRows follows per its N-120 comment). Returns null for
// anything that isn't a valid Date — a wrong type here should surface,
// not get silently coerced.
function spDateOut(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}T12:00:00Z`;
}

// N-087: canonical read-path helper for a SharePoint-returned datetime
// string (utcDateOnly() above covers the case where the caller needs a
// Date for arithmetic; this covers the case where a safe display/compare
// STRING is enough). Regex/string-slice only, same pattern as
// monthKeyFromISO() and for the same reason — never construct a Date from
// a SharePoint string and never call a local getter on it. That is
// precisely the operation that shifts the 1st of a month into the prior
// month under BST. Returns null on anything unparseable.
function spDateIn(str) {
  const match = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

// N-130: the MONTH a SharePoint month-marker date refers to, as 'YYYY-MM'.
// CoEPlanForecast.ForecastMonth is by contract always the 1st of a month, but
// three stored shapes exist: 'T00:00:00Z' (written while the site was on GMT),
// '(prev-day)T23:00:00Z' (written on BST — SharePoint resolves a bare date in
// the SITE's timezone, so 1 Jul 00:00 BST is stored as 30 Jun 23:00Z), and
// 'T12:00:00Z' (written via isoDate() from N-130 on). The BST shape is CONFIRMED
// against live data (14 Aug 2026): four real CoEPlanForecast rows read back as
// 2026-06-30T23:00:00Z, 2026-07-31T23:00:00Z, 2026-08-31T23:00:00Z and
// 2026-09-30T23:00:00Z — i.e. Jul/Aug/Sep/Oct markers, each stored on the last
// day of the preceding month. The GMT shape is inferred, not observed (no
// winter forecast month existed to check), but it is the benign one: no shift. Adding 12h before
// reading the UTC month collapses all three onto the intended month, and reads
// no local getter — so unlike the `new Date()` + local-getter code this
// replaced, it returns the same month in every browser timezone. That old read
// keyed the row to the PREVIOUS month on any browser behind the site's offset,
// silently dropping the figure out of the forecast table.
//
// This is the one place where `new Date(<SharePoint string>)` is correct: the
// value being recovered is an INSTANT, not a calendar day, and only UTC getters
// are read from it. Do NOT "fix" this to utcDateOnly() — that discards the time
// component the ±12h rounding depends on.
//
// Precondition: the stored instant is within ±12h of the intended month's 1st
// at UTC midnight, which holds for any SITE offset in ±12h (verified: correct
// through exactly +12, breaking only at +13). N-136: this ±12h is a DIFFERENT
// quantity from the ±11h browser-offset limit documented in coe-plan.js — that
// one governs reading a stored midday value with a local getter, this one
// governs how far the SharePoint site's own offset can move a bare write. Both
// figures are correct; do not reconcile them. Returns null on anything
// unparseable.
function spMonthIn(str) {
  const t = Date.parse(str);
  if (isNaN(t)) return null;
  const d = new Date(t + 12 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// N-088: the LOCAL calendar day as 'YYYY-MM-DD'. Use this — never
// `new Date().toISOString().split('T')[0]` — whenever "today", or a
// relative cutoff derived from it, is needed as a day string.
// toISOString() re-expresses a local instant in UTC, and under BST (local
// ahead of UTC) that returns YESTERDAY for any moment between 00:00 and
// 01:00 local. Local getters here are deliberate and are NOT a breach of
// spDateOut's "UTC getters only" rule: that rule governs a Date standing
// for a SharePoint calendar day, whereas this answers the local
// wall-clock question "what day is it where the user is". Same root cause
// as N-129, which fixed the identical pattern inside getWeekEnding();
// that function keeps its own inlined copy deliberately (see its comment)
// rather than being rewired through here.
function localDayISO(date = new Date()) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// N-330: 'YYYY-MM-DD' -> '13 October 2026' (en-GB long form). Builds a LOCAL
// date from the string's own parts, so no UTC shift either side of BST; null
// on anything unparseable. Report Builder title page date.
function formatLongDay(dayISO) {
  const m = String(dayISO || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// N-093 (F-2a): the earliest calendar day the Placements page's existing
// month/quarter/year filter can possibly match, as 'YYYY-MM-DD', or null
// when no filter is set. Used ONLY as a server-side `ge` lower bound — it is
// deliberately loose (a quarter/month filter returns that year's 1 January),
// because placementInFilter() (pages-model.js) still applies the exact test client-side. A
// loose lower bound over-fetches and stays correct; a tight one that got the
// boundary wrong would silently drop placements.
// Local getters, matching localDayISO's reasoning: this answers "what does
// the user's wall-clock year look like", not "what calendar day does a
// SharePoint value stand for".
// N-151: the calendar day `weeks` weeks before today, as 'YYYY-MM-DD', or
// null for 0 — which must produce NO date clause at all, per
// CONFIG.DATE_WINDOW_WEEKS. localDayISO, not spDateOut: this is a local
// wall-clock "N weeks ago", which is exactly what localDayISO answers.
function weeksAgoDay(weeks, today = new Date()) {
  const w = Number(weeks);
  if (!w) return null;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - (w * 7));
  return localDayISO(cutoff);
}

// N-270: the WeeklyActivity rows whose WeekEndingDate falls on/after the day
// `weeks` weeks ago — the client-side equivalent of
// getActivityForAnalytics(weeks), for a page that fetches a longer window
// once and needs a shorter slice of it too. spDateIn, never a raw
// truncation (F-12). 0/falsy `weeks` = no window, every row returned.
function activitySinceWeeks(acts, weeks, today = new Date()) {
  const from = weeksAgoDay(weeks, today);
  if (!from) return acts || [];
  return (acts || []).filter(a => {
    const day = a && a.WeekEndingDate ? spDateIn(a.WeekEndingDate) : null;
    return !!day && day >= from;
  });
}

// N-342: the getHistoricalPlacements() rows whose placementDate (Offer
// Accepted) falls on/after the day `weeks` weeks ago — the placements twin of
// activitySinceWeeks, so People Scorecards (desktop + mobile) and the Command
// Centre project cards cut placements by ONE rule. Whole days via spDateIn,
// never a Date compare: a `new Date(placementDate) >= now - 91d` cut is
// time-of-day sensitive and dropped a placement exactly 13 weeks old.
// 0/falsy `weeks` = no window, every row returned. A row with no usable
// placementDate is dropped when a window applies.
function placementsSinceWeeks(placements, weeks, today = new Date()) {
  const from = weeksAgoDay(weeks, today);
  if (!from) return placements || [];
  return (placements || []).filter(p => {
    const day = p && p.placementDate ? spDateIn(p.placementDate) : null;
    return !!day && day >= from;
  });
}

// N-453: day-based twins of the two week-based cuts above, for a window that is not a whole number of weeks
// (calendar year to date). `fromDay` is a plain local 'YYYY-MM-DD' (analytics.js scorecardPeriod); null = no window,
// every row returned — including a row with no usable date, exactly as `weeks` 0 does. Same spDateIn rule, same
// "drop a null-date row when a window applies" rule. The week-based functions are untouched.
function activitySinceDay(acts, fromDay) {
  if (!fromDay) return acts || [];
  return (acts || []).filter(a => {
    const day = a && a.WeekEndingDate ? spDateIn(a.WeekEndingDate) : null;
    return !!day && day >= fromDay;
  });
}
function placementsSinceDay(placements, fromDay) {
  if (!fromDay) return placements || [];
  return (placements || []).filter(p => {
    const day = p && p.placementDate ? spDateIn(p.placementDate) : null;
    return !!day && day >= fromDay;
  });
}

// N-453: does any WeeklyActivity row belong to `email`? The same match buildScorecardCards uses to decide who has a
// card: the row's TalentPartner, trimmed and lower-cased, equals the (trimmed, lower-cased) email.
function scorecardEmailKey(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
function scorecardHasActivity(acts, email) {
  const key = scorecardEmailKey(email);
  return !!key && (acts || []).some(a => !!a && scorecardEmailKey(a.TalentPartner) === key);
}

// N-151: the lower bound for a list query that has BOTH a background date
// window and an optional explicit period selection. The query must be a
// superset of whatever either control needs, so an explicit selection WIDENS
// the window rather than intersecting with it — otherwise picking "Jan" under
// a 13-week window returns nothing, from two controls that each look correct.
// A null window means "All time" and always wins; a null selection means the
// selection imposes no requirement and the window stands.
function listQueryFromDay(windowDay, selectionDay) {
  if (!windowDay) return null;
  if (!selectionDay) return windowDay;
  return selectionDay < windowDay ? selectionDay : windowDay;
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Returns the Sunday on/after `date` (or today, if omitted) as 'YYYY-MM-DD'.
// WeeklyActivity.WeekEndingDate buckets on this Sunday boundary, not
// Friday — verify against that convention before changing this.
function getWeekEnding(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  // N-129: local getters, not toISOString(). getDay()/setDate() above
  // already computed the right Sunday in LOCAL calendar terms — routing
  // the result back through toISOString() re-expresses it in UTC, and in
  // BST (local ahead of UTC) that rolls it back to the previous day. This
  // also silently fixed a same-Sunday-input case that was off by a day
  // for the identical reason.
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ── Day-string arithmetic (N-271) ────────────────────────────────────
// Pure 'YYYY-MM-DD' maths for the WeeklyActivity anomaly checks. UTC getters
// only, via utcDateOnly() — no local getter ever sees these dates, so BST/GMT
// cannot shift a day (F-12). Null for anything unparseable.
function addDaysISO(dayISO, n) {
  const d = utcDateOnly(dayISO);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// The Sunday on/after a day — the same bucket getWeekEnding() gives a Date,
// for a day string.
function sundayOnOrAfterISO(dayISO) {
  const d = utcDateOnly(dayISO);
  return d ? addDaysISO(dayISO, (7 - d.getUTCDay()) % 7) : null;
}

// Median of the finite numbers in `nums`; null when there are none. The input
// is not mutated.
function medianOf(nums) {
  const a = (nums || []).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ── Activity field summation ─────────────────────────────────────────
function sumField(acts, field) {
  return acts.reduce((s, a) => s + (Number(a[field]) || 0), 0);
}

// ── Ghost / impersonation mode ────────────────────────────────────────
// Admin-only. Temporarily resolves role/project scope as a real chosen user
// instead of the signed-in admin. Stored in sessionStorage — cleared on
// sign-out or by clearGhostUser().

const GHOST_USER_KEY  = 'newton_ghost_user';
const GHOST_LABEL_KEY = 'newton_ghost_label';

// N-282 / SEC-2: Ghost Mode is honoured ONLY while this flag is true. It is
// set by api.js (_verifyGhost / getEffectiveRole) after the REAL signed-in
// account — MSAL, via getCurrentUser() — has resolved as admin, and is never
// read from storage. Default false = fail closed: until that check has run on
// a page, getGhostUser() reports "no ghost" and every caller sees the real
// identity. Strictly boolean true only.
let _ghostRealAdmin = false;
function _setGhostRealAdmin(isAdmin) { _ghostRealAdmin = isAdmin === true; }

// True when a ghost key is stored. Raw — says nothing about whether ghost is
// honoured (see getGhostUser()). Used only by api.js's ghost gate.
function _hasStoredGhost() {
  try { return !!sessionStorage.getItem(GHOST_USER_KEY); } catch (e) { return false; }
}

// Returns true when ghost mode was set, false when refused (not a real admin).
function setGhostUser(email, displayName) {
  if (!_ghostRealAdmin) return false;
  sessionStorage.setItem(GHOST_USER_KEY, email.toLowerCase());
  sessionStorage.setItem(GHOST_LABEL_KEY, displayName || email);
  // N-176/N-205: entering ghost mode changes which rows the UI derives from a
  // cached list. Purging tier 1 (_apiCache) and tier 2 (sessionStorage) on
  // both transitions is cheaper and safer than reasoning about which lists
  // happen to be identity-independent. Guarded because utils.js parses
  // before graph-client.js.
  if (typeof _apiCache !== 'undefined') _apiCache.clear();
  if (typeof _ssPurge === 'function') _ssPurge();
  return true;
}
function getGhostUser() {
  if (!_ghostRealAdmin) return null;
  return sessionStorage.getItem(GHOST_USER_KEY);
}
function getGhostLabel() {
  if (!_ghostRealAdmin) return null;
  return sessionStorage.getItem(GHOST_LABEL_KEY);
}
function clearGhostUser() {
  sessionStorage.removeItem(GHOST_USER_KEY);
  sessionStorage.removeItem(GHOST_LABEL_KEY);
  // N-176/N-205: see setGhostUser() — purge tier 1 and tier 2 on the way out too.
  if (typeof _apiCache !== 'undefined') _apiCache.clear();
  if (typeof _ssPurge === 'function') _ssPurge();
}

// Effective identity for READ-scoping "my own records" views (e.g. a
// Talent Partner's own Weekly Activity, their own Scorecard) — the ghosted
// user's email when Ghost Mode is active, else the real signed-in user's.
// Distinct from getCurrentUser().email, which must stay untouched wherever
// an action is being ATTRIBUTED (ChangedBy, CreatedByEmail, ReportOwner,
// etc.) — ghosting never changes who is really making a change, only what
// they can see.
function getScopedUserEmail() {
  return (getGhostUser() || getCurrentUser()?.email || '').toLowerCase();
}

// ── Notification bell label (N-425) ───────────────────────────
// Accessible name for the bell. The badge is aria-hidden, so the count rides on the label.
function notifBellLabel(unread) {
  const n = Number(unread) || 0;
  return n > 0 ? `Notifications, ${n} unread` : 'Notifications';
}

// ── Role deep links (N-461) ───────────────────────────────────
// The Reporting hash that opens one role's page (app.js handleDeepLink -> openChecklist('role') -> Role page).
// Numeric id only; anything non-numeric gives id=0 (the router ignores it).
function roleDeepLink(id) {
  return 'reporting.html#roles?action=checklist&id=' + (Number(id) || 0);
}

// Notifications stored before N-461 carry the dead 'reporting.html#role-<id>'. Rewrite exactly that shape on click;
// every other link (and empty/null) comes back unchanged.
function notifDeepLinkFix(link) {
  const m = /^reporting\.html#role-(\d+)$/.exec(String(link ?? ''));
  return m ? roleDeepLink(m[1]) : link;
}

// ── Text escaping ─────────────────────────────────────────────
// Escape a value for safe interpolation into an HTML template string.
function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// As escHtml, but preserves user line breaks as <br>.
function escHtmlLines(str) {
  return escHtml(str).replace(/\r?\n/g, '<br>');
}

// ── Guide Markdown renderer (N-401) ───────────────────────────
// Renders mcp/README.md for the Command Centre "Newton for Claude" page. Handles
// exactly the subset that guide uses: # ## ### headings, paragraphs, - and 1. lists
// (nested by indent), pipe tables, **bold**, `code` and bare https:// links.
// Everything is escaped FIRST (escHtml); markup is only ever added around escaped
// text, so nothing in the input can become a tag. Anything else is shown as text.
function _mdGuideInline(raw) {
  const esc = escHtml(raw);
  return esc.split(/(`[^`]+`)/).map(seg => {
    if (/^`[^`]+`$/.test(seg)) return '<code>' + seg.slice(1, -1) + '</code>';
    return seg
      .replace(/https:\/\/[A-Za-z0-9\-._~:\/?#@!$()+,;=%]+/g, m => {
        const url = m.replace(/[.,:;!?)]+$/, '');
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>' + m.slice(url.length);
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }).join('');
}

function _mdGuideList(items, pos, indent) {
  const tag = items[pos].ordered ? 'ol' : 'ul';
  let html = '<' + tag + '>';
  while (pos < items.length && items[pos].indent >= indent) {
    html += '<li>' + _mdGuideInline(items[pos].text);
    pos++;
    if (pos < items.length && items[pos].indent > indent) {
      const nested = _mdGuideList(items, pos, items[pos].indent);
      html += nested.html;
      pos = nested.pos;
    }
    html += '</li>';
  }
  return { html: html + '</' + tag + '>', pos };
}

function mdGuideToHtml(md) {
  if (md === null || md === undefined || md === '') return '';
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const LIST_RE = /^( *)(-|\d+\.) +(.*\S)\s*$/;
  const TABLE_SEP_RE = /^\|[ :|-]*-[ :|-]*\|\s*$/;
  const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const startsBlock = (line, next) => /^#{1,3} +\S/.test(line) || LIST_RE.test(line)
    || (/^\|/.test(line) && next !== undefined && TABLE_SEP_RE.test(next));
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,3}) +(.*\S)\s*$/.exec(line);
    if (h) {
      const n = h[1].length;
      const id = n === 2 ? ' id="' + escHtml(h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) + '"' : '';
      out.push('<h' + n + id + '>' + _mdGuideInline(h[2]) + '</h' + n + '>');
      i++; continue;
    }
    if (/^\|/.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      let t = '<table class="data-table"><thead><tr>' + cells(line).map(c => '<th>' + _mdGuideInline(c) + '</th>').join('') + '</tr></thead><tbody>';
      i += 2;
      while (i < lines.length && /^\|/.test(lines[i])) {
        t += '<tr>' + cells(lines[i]).map(c => '<td>' + _mdGuideInline(c) + '</td>').join('') + '</tr>';
        i++;
      }
      out.push(t + '</tbody></table>');
      continue;
    }
    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const m = LIST_RE.exec(lines[i]);
        items.push({ indent: m[1].length, ordered: m[2] !== '-', text: m[3] });
        i++;
      }
      out.push(_mdGuideList(items, 0, items[0].indent).html);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines[i], lines[i + 1]))) {
      para.push(lines[i].trim());
      i++;
    }
    out.push('<p>' + _mdGuideInline(para.join(' ')) + '</p>');
  }
  return out.join('\n');
}

// Fill "{key}" placeholders from an object — fillTemplate('M{n}', { n: 9 })
// → 'M9'. An unknown key is left as-is so a typo shows up on screen rather
// than silently vanishing. Plain text out: escape at the HTML call site.
function fillTemplate(tpl, vals) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) =>
    (vals && vals[k] !== undefined && vals[k] !== null ? String(vals[k]) : m));
}

// ── Breadcrumb (N-255a) ───────────────────────────────────────
// Pure markup builder for the "Home › Module › Page" trail. No DOM, no
// CONFIG — nav-core.js's renderBreadcrumb() supplies the segments from
// router state; N-255b (record-level segments, mobile) reuses this.
// segments: [{ label, href? }, …] — the LAST segment is the current page and
// always renders as aria-current text, never a link. Ancestors without an
// href render as plain text. Separators are CSS ::before (not in the DOM).
//   breadcrumbHTML([{label:'Home',href:'index.html'},{label:'Org Chart'}])
function breadcrumbHTML(segments) {
  if (!Array.isArray(segments)) return '';
  const segs = segments.filter(s => s && s.label);
  if (!segs.length) return '';
  const items = segs.map((s, i) => {
    const label = escHtml(s.label);
    let inner;
    if (i === segs.length - 1) {
      inner = `<span class="breadcrumb__current" aria-current="page">${label}</span>`;
    } else if (s.href) {
      inner = `<a class="breadcrumb__link" href="${escAttr(s.href)}">${label}</a>`;
    } else {
      inner = `<span class="breadcrumb__text">${label}</span>`;
    }
    return `<li class="breadcrumb__item">${inner}</li>`;
  }).join('');
  return `<nav aria-label="Breadcrumb" class="breadcrumb"><ol class="breadcrumb__list">${items}</ol></nav>`;
}

// ── RAG markers (N-254) ───────────────────────────────────────
// Non-colour differentiator for red / amber states: a glyph from
// CONFIG.RAG_MARKERS, optionally with its visible label. Colour is inherited
// (currentColor) from the host element. Green / grey / neutral / unknown
// return '' — only exceptions get a marker.
//   ragMarkerHTML('red')                  → ⚠ glyph, accessible name "At risk"
//   ragMarkerHTML('amber', { label: true }) → ! glyph (aria-hidden) + "Watch"
function ragMarkerHTML(rag, { label = false } = {}) {
  const key = String(rag ?? '').toLowerCase();
  const markers = CONFIG.RAG_MARKERS;
  if (!Object.prototype.hasOwnProperty.call(markers, key)) return '';
  const m = markers[key];
  const text = escHtml(m.label);
  if (label) {
    return `<span class="rag-marker rag-marker--${key}"><span class="rag-marker__glyph" aria-hidden="true">${m.glyph}</span><span class="rag-marker__label">${text}</span></span>`;
  }
  return `<span class="rag-marker rag-marker--${key}" role="img" aria-label="${text}" title="${text}">${m.glyph}</span>`;
}

// ── Scorecard card (N-336) ────────────────────────────────────
// One card's markup, shared by My Momentum scorecards (my-momentum-pages.js) and the
// Command Centre Project Health detail (cc-pages.js). `healthRows` =
// scorecardHealthRows(); `metrics` = computeFunnelScorecard() rows, with
// `tip` from scorecardMetricTips() where wanted. Plain strings in — every
// text value is escaped here. No inline styles (N-324): classes only.
function scorecardCardHTML({ title, windowLabel, healthRows = [], metrics = [] }) {
  const tipAttr = tip => tip ? ` title="${escHtml(tip)}"` : '';
  const health = healthRows.map(h => `<tr>
      <td class='sc-label'>${escHtml(h.label)}</td>
      <td class='sc-value sc-value--center sc-grey'${tipAttr(h.tip)}>${escHtml(h.value)}</td>
    </tr>`).join('');
  const rows = metrics.map(m => {
    const display  = m.value !== null ? `${m.value}${m.unit === '%' ? '%' : ' ' + m.unit}` : '—';
    const ragClass = m.informational ? 'sc-grey' : `sc-${m.rag}`;
    return `<tr>
      <td class='sc-label'>${escHtml(m.label)}</td>
      <td class='sc-value sc-value--center ${ragClass}'${tipAttr(m.tip)}>${m.informational ? '' : ragMarkerHTML(m.rag)}${escHtml(display)}</td>
    </tr>`;
  }).join('');
  return `<div class='dash-panel sc-card'>
    <div class='sc-card__head'>
      <h3 class='panel-title sc-tp-name'>${escHtml(title)}</h3>
      <span class="sc-rag-pill sc-rag-pill--grey">NOT RATED</span>
    </div>
    <p class='sc-window'>${escHtml(windowLabel)}</p>
    <table class='sc-table'><tbody>${health}${rows}</tbody></table>
  </div>`;
}

// The two pipeline-health rows on a scorecard card. `roleHealth` =
// tallyRoleFlags() output; null → no rows. A pipeline can be both stuck and
// low-conversion, so the tooltip's two numbers can sum past the flagged count.
function scorecardHealthRows(roleHealth, flaggedLabel) {
  if (!roleHealth) return [];
  const of = n => roleHealth.total > 0 ? `${n || 0}/${roleHealth.total}` : '—';
  return [
    { label: flaggedLabel, value: of(roleHealth.flagged),
      tip: `Stuck in stage: ${roleHealth.stuck || 0} · Low conversion: ${roleHealth.conversion || 0}` },
    { label: `Behind ${CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays}-day pace`, value: of(roleHealth.behind) },
  ];
}

// ── Status text, neutral by default (N-257) ───────────────────
// The single place that decides green renders neutral: green / grey text
// gets no marker and no status colour (grey is muted via CSS); amber / red
// get their N-254 marker and style.css colours them (amber: glyph only, text
// stays --text-primary for contrast; red: --status-danger + bold).
//   ragTextHTML('green', '85%') → <span class="rag-text rag-text--green">85%</span>
//   ragTextHTML('red', '62%')   → <span class="rag-text rag-text--red">⚠62%</span>
// `text` is escaped here — pass plain strings.
function ragTextHTML(rag, text) {
  const key = String(rag ?? '').toLowerCase();
  const body = escHtml(text);
  const marker = ragMarkerHTML(key);
  if (marker) return `<span class="rag-text rag-text--${key}">${marker}${body}</span>`;
  if (key === 'green' || key === 'grey') return `<span class="rag-text rag-text--${key}">${body}</span>`;
  return `<span class="rag-text">${body}</span>`;
}

// Escape for safe interpolation into a double-quoted HTML attribute.
// Example: value="${escAttr(title)}" where title may contain "
function escAttr(str) {
  return String(str ?? '').replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[c]);
}

// Escape for safe interpolation into a JavaScript string inside an HTML attribute.
// Legacy: only needed for the inline handler attributes N-302 is retiring; new
// markup passes data through act()/actOn() (actions.js), which needs no escaping.
// Handles a title containing ' or \
// Escape backslash first, then apostrophe in JS-safe way, then HTML entities.
function escJsAttr(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')      // backslash to \\
    .replace(/'/g, "\\'")        // apostrophe to \'
    .replace(/&/g, '&amp;')      // ampersand (HTML)
    .replace(/"/g, '&quot;')     // quote (HTML attribute)
    .replace(/</g, '&lt;')       // less-than (defensive)
    .replace(/>/g, '&gt;');      // greater-than (defensive)
}

// ── OData + upload guards (N-284) ───────────────────────────────
// Escape a string value for use INSIDE the single quotes of an OData $filter:
//   `fields/Title eq '${odataStr(email)}'`
// Doubles every apostrophe (o'brien → o''brien). Returns the inner text only —
// the caller keeps the quotes. Do NOT also encodeURIComponent it: getItems()
// already encodes the whole filter once (graph-client.js).
function odataStr(v) {
  return String(v ?? '').replace(/'/g, "''");
}

// Check a File against CONFIG.UPLOADS[kind] before uploading/reading it.
// Reads only .name, .size and .type, so tests can pass plain objects.
// Returns { ok: true, ext, mime } — both taken from the allowlist, never echoed
// from the file — or { ok: false, reason } with a user-facing reason.
// An EMPTY file.type is accepted (some browsers leave it blank for Office/PDF
// files) provided the extension passes; a non-blank type that does not match
// the extension's allowlisted MIME is rejected.
function validateUpload(file, kind) {
  const cfg = CONFIG.UPLOADS[kind];
  if (!cfg) throw new Error('Unknown upload kind: ' + kind);
  if (!file) return { ok: false, reason: 'No file selected.' };
  const max = kind === 'LOGO' ? CONFIG.BRIEFING_PACK.CLIENT_LOGO_MAX_BYTES : cfg.MAX_BYTES;
  const fmt = n => n >= 1024 * 1024 ? (n / (1024 * 1024)).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
  const name = String(file.name || '');
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (!cfg.EXTS.includes(ext)) {
    return { ok: false, reason: cfg.NAME + ' must be ' + cfg.ALLOWED + '.' };
  }
  const mime = CONFIG.UPLOADS.MIME_BY_EXT[ext];
  const type = String(file.type || '').toLowerCase();
  if (type && type !== mime) {
    // jpg/jpeg may arrive as either spelling of the same type; everything else must match exactly.
    return { ok: false, reason: cfg.NAME + ' must be ' + cfg.ALLOWED + '.' };
  }
  const size = Number(file.size);
  if (!(size > 0)) return { ok: false, reason: 'That file is empty.' };
  if (size > max) {
    return { ok: false, reason: 'That file is ' + fmt(size) + ' \u2014 the limit for ' + cfg.NAME.toLowerCase() + ' is ' + fmt(max) + '.' };
  }
  return { ok: true, ext: ext === 'jpeg' ? 'jpg' : ext, mime: mime };
}

// accept="" value for <input type=file>, generated from the same allowlist.
function uploadAcceptAttr(kind) {
  return CONFIG.UPLOADS[kind].EXTS.map(e => '.' + e).join(',');
}

// Safe stored filename: basename only, [A-Za-z0-9._-], capped, forced extension.
function safeUploadName(name, ext, maxLen = 60) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|[._]+$/g, '').slice(0, maxLen);
  return (base || 'file') + '.' + ext;
}

// ── Sign-in helpers (N-290 / SEC-10) ─────────────────────────────
// Pure. auth.js calls both from authReady(). No MSAL, no storage access.

// True for a localStorage key MSAL v2 wrote: the msal.* index and
// active-account keys, token entries (they contain the app's client ID) and
// account entries (they contain the tenant ID). v5 keeps tokens in
// sessionStorage and leaves these behind, so authReady() deletes them.
// Never matches a Newton key (newton_*, userName, benchSyncLast).
function isLegacyMsalStorageKey(key, clientId, tenantId) {
  const k = String(key || '').toLowerCase();
  if (!k) return false;
  if (k.startsWith('msal.')) return true;
  const c = String(clientId || '').toLowerCase();
  const t = String(tenantId || '').toLowerCase();
  return (c !== '' && k.includes(c)) || (t !== '' && k.includes(t));
}

// The one automatic sign-in redirect per tab: only when nobody is signed in,
// it hasn't already been tried in this tab, the user didn't just sign out,
// and the URL isn't carrying a Microsoft response.
function shouldAutoSignIn({ hasAccount, triedThisTab, signedOut, authResponseInUrl } = {}) {
  return !hasAccount && !triedThisTab && !signedOut && !authResponseInUrl;
}

// N-374: the page + ?query + #hash a sign-in should return to. auth.js saves it
// in sessionStorage before the Microsoft redirect and restores it afterwards.
// Pure. Returns a same-site relative target ('reporting.html#projects?...') or
// null when there is nothing worth keeping or it is unsafe: not a string, over
// 500 chars, control characters, backslash, '..', a scheme or '//', a page that
// isn't name.html, mobile.html (its own app-login routing), redirect.html (the
// silent-token bridge), a Microsoft response (code= / error= / state= ...) in
// the query or hash, or the bare site root / index.html with no hash.
function safeReturnTarget(href) {
  if (typeof href !== 'string') return null;
  const s = href.trim();
  if (!s || s.length > 500) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(s) || s.indexOf('..') !== -1) return null;
  const m = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(s);
  if (!m) return null;
  const path = m[1], query = m[2] || '', hash = m[3] || '';
  if (path.indexOf('//') === 0 || !/^[A-Za-z0-9_\-\/.]*$/.test(path)) return null;
  if (/[?#&](code|error|error_description|state|id_token|client_info)=/.test(query + hash)) return null;
  const seg  = path.split('/').pop();
  const page = seg === '' ? 'index.html' : seg;
  if (!/^[A-Za-z0-9_-]+\.html$/.test(page)) return null;
  if (page === 'mobile.html' || page === 'redirect.html') return null;
  if (page === 'index.html' && !query && !hash) return null;
  return page + query + hash;
}

// N-374: is a safeReturnTarget() result on the page the browser is already on?
// pathname is location.pathname; a trailing slash means index.html.
function sameReturnPage(target, pathname) {
  const targetPage = String(target || '').split(/[?#]/)[0];
  const current    = String(pathname || '').split('/').pop() || 'index.html';
  return targetPage === current;
}

// ── Fuzzy search (N-144) ─────────────────────────────────────────
// Case-insensitive subsequence match: every character of `query` must
// appear in `text`, in order (not necessarily contiguous). Returns a
// numeric score (higher = better) or null when query isn't a subsequence
// of text at all. Rewards a match starting at position 0 and rewards
// runs of consecutive matched characters, so short queries rank a
// prefix/contiguous hit above a scattered one. Pure function — no
// network I/O, no DOM — used by js/command-bar.js to filter
// CONFIG.COMMAND_BAR_PAGES against what the user types.
function fuzzyMatch(query, text) {
  const q = String(query ?? '').toLowerCase().trim();
  const t = String(text ?? '').toLowerCase();
  if (!q) return 0;
  let score = 0;
  let searchFrom = 0;
  let runLength = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], searchFrom);
    if (idx === -1) return null;
    if (idx === searchFrom) {
      runLength++;
      score += runLength * 2; // consecutive-match bonus, compounding
    } else {
      runLength = 1;
      score += 1;
    }
    if (idx === 0) score += 3; // starts-with bonus
    searchFrom = idx + 1;
  }
  return score;
}

// Wraps a write with instant, reversible UI feedback: apply() mutates the
// view synchronously, commit() performs the real write in the background,
// and either resolves silently (view and server now agree) or the change
// is rolled back and an error toast with a Retry action is shown. No
// network calls of its own -- commit() supplies the write.
async function optimisticWrite({ apply, revert, commit, errorMessage = "That didn't save — change reverted.", toastFn = toast } = {}) {
  apply();
  try {
    return await commit();
  } catch (err) {
    await revert();
    toastFn(errorMessage, {
      type: 'error',
      action: { label: 'Retry', onClick: () => optimisticWrite({ apply, revert, commit, errorMessage, toastFn }) }
    });
    throw err;
  }
}

// Strip characters Windows/macOS reject in filenames, collapse whitespace.
// Apostrophes and ampersands SURVIVE — they are legal in a filename and
// mangling them is exactly the N-012d regression. Never HTML-escape a
// filename: &amp; in a download name is a bug, not a safety measure.
function safeFilename(str, fallback = 'export') {
  const out = String(str ?? '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out || fallback;
}
// ── LCI horizon slicing (N-022) ───────────────────────────────
// Split a model horizon into printable chunks of `chunk` months.
// Returns [{ start, end, index, label }] — start inclusive / end exclusive,
// both 0-based month indices; index is the 1-based year number.
// A horizon of `chunk` or less returns one slice with label null, which every
// renderer treats as "no slicing" — a 12-month model is unchanged.
// A trailing partial year is its own slice, labelled with its true range
// (18 months → "Year 2 (M13–M18)", not M13–M24).
function lciYearSlices(horizon, chunk = 12) {
  const h = Math.max(1, Number(horizon) || 0);
  if (h <= chunk) return [{ start: 0, end: h, index: 1, label: null }];
  const out = [];
  for (let start = 0; start < h; start += chunk) {
    const end = Math.min(start + chunk, h);
    out.push({
      start, end,
      index: out.length + 1,
      label: `Year ${out.length + 1} (M${start + 1}\u2013M${end})`,
    });
  }
  return out;
}

// `lines`: [{ y, label, minor }] — caller has already resolved the axis
// value to chart-space y and formatted the label text; this only emits the
// <line>/<text> pair with the shared classes.
function _chartGridSvg(padL, W, padR, lines) {
  return lines.map(l => {
    const cls = 'nt-chart-grid' + (l.minor ? ' nt-chart-grid--minor' : '');
    const label = l.label != null
      ? `<text x='${padL - 6}' y='${l.y + 4}' text-anchor='end' class='nt-chart-tick'>${l.label}</text>`
      : '';
    return `<line x1='${padL}' y1='${l.y}' x2='${W - padR}' y2='${l.y}' class='${cls}'/>${label}`;
  }).join('');
}

// N-257: neutral dashed threshold lines — replace coloured RAG bands behind
// charts. `lines`: [{ y, label, value?, place? }] — y already in chart space.
// The line stays inside the plot; its label sits in a right-hand gutter
// OUTSIDE it (x = W - padR + 6) so it never collides with late-year data —
// callers must reserve ~70 units in padR. label + value stack as two rows;
// place 'above' (default) stacks them over the line, 'below' under it. Give
// the upper threshold 'above' and the lower 'below' so a close pair can never
// overlap (N-257a Addendum A). label / value are plain text, escaped here.
function _chartThresholdSvg(padL, W, padR, lines) {
  const x = W - padR + 6;
  return lines.map(l => {
    const rows = [l.label, l.value].filter(t => t != null);
    // Baselines 11 apart: above → last row 3 over the line; below → first row 11 under it.
    const ys = l.place === 'below'
      ? rows.map((_, i) => l.y + 11 + i * 11)
      : rows.map((_, i) => l.y - 3 - (rows.length - 1 - i) * 11);
    const label = rows.length
      ? `<text text-anchor='start' class='nt-chart-threshold-label'>${rows.map((t, i) =>
          `<tspan x='${x}' y='${ys[i]}'>${escHtml(t)}</tspan>`).join('')}</text>`
      : '';
    return `<line x1='${padL}' y1='${l.y}' x2='${W - padR}' y2='${l.y}' class='nt-chart-threshold'/>${label}`;
  }).join('');
}

// `items`: [{ color, label, dashed?, box?, dot?, border? }]. `box` renders a
// small square swatch, `dot` a small circle (a flagged chart point, N-257),
// otherwise a line swatch.
function _chartLegendHtml(items) {
  return `<div class='nt-chart-legend'>${items.map(it => {
    const style = `--nt-chart-color:${it.color}` + (it.border ? `;--nt-chart-border:${it.border}` : '');
    const cls = it.box ? 'nt-chart-legend-swatch--box' : it.dot ? 'nt-chart-legend-swatch--dot' : (it.dashed ? 'nt-chart-legend-swatch--dashed' : '');
    return `<div class='nt-chart-legend-item'>
      <span class='nt-chart-legend-swatch ${cls}' style='${style}'></span>${it.label}</div>`;
  }).join('')}</div>`;
}

// Runs worker(item, index) over items with at most `limit` in flight and
// resolves to the results in input order. No network I/O of its own. A
// rejected worker rejects the whole call — callers that need per-item
// failure isolation catch inside the worker.
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  };
  const lanes = Math.max(1, Math.min(limit || 1, items.length));
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}