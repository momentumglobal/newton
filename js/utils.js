// js/utils.js — pure helpers with no network I/O
// Loaded before api.js in all HTML files.

// ── Button loading state ──────────────────────────────────────────────
function setButtonLoading(btn, loadingText) {
  if (!btn) return;
  btn.dataset.originalText = btn.textContent;
  btn.textContent = loadingText || 'Saving…';
  btn.disabled = true;
  btn.style.opacity = '0.7';
  btn.style.cursor  = 'not-allowed';
}

function clearButtonLoading(btn) {
  if (!btn) return;
  btn.textContent = btn.dataset.originalText || btn.textContent;
  btn.disabled = false;
  btn.style.opacity = '';
  btn.style.cursor  = '';
}

// ── Select pending state (N-149) ──────────────────────────────────────
// Same disabled/opacity/cursor treatment as setButtonLoading above, for a
// <select> instead of a button — a <select> has no text label to swap for
// "Saving…", so this never touches textContent. Shared by the Roles-list
// inline stage dropdown (pages.js:updateRoleStage) and, per its spec, meant
// for N-146 (Command Bar) to reuse for its own inline stage update rather
// than reimplementing this.
function setSelectPending(selectEl, isPending) {
  if (!selectEl) return;
  selectEl.disabled = isPending;
  selectEl.style.opacity = isPending ? '0.7' : '';
  selectEl.style.cursor  = isPending ? 'not-allowed' : '';
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
  return `<select id="stage-select-${roleId}" data-prev-value="${escAttr(currentStage || '')}" onchange="updateRoleStage(${roleId}, this)">${options}</select>`;
}

// ── Re-render without losing scroll position ──────────────────────────
// Replace an element's outerHTML while preserving the scroll offsets of any
// scroll containers inside it. Replacing outerHTML destroys and rebuilds those
// containers, which resets scrollLeft/scrollTop to 0 — the "snaps back to the
// top-left" effect.
//   elementId     — id of the element being replaced. The replacement markup
//                   MUST carry the same id, or the restore is skipped.
//   html          — the new markup.
//   scrollSelector — selector for the scroll containers inside it (required;
//                   this helper stays module-agnostic). Containers are paired
//                   by document order, which re-rendered sections preserve.
// Returns the new element, or null if the id wasn't in the DOM.
// Snapshot / restore the scroll offsets of every container matching `selector`
// inside `root`. Containers are paired by document order, which re-rendered
// markup preserves. Restore is synchronous — a deferred one shows a visible
// jump-then-snap. Over-large offsets are clamped by the browser.
function _scrollOffsets(root, selector) {
  return [...root.querySelectorAll(selector)]
    .map(n => ({ left: n.scrollLeft, top: n.scrollTop }));
}
function _restoreScrollOffsets(root, selector, offsets) {
  [...root.querySelectorAll(selector)].forEach((n, i) => {
    const pos = offsets[i];
    if (!pos) return;
    n.scrollLeft = pos.left;
    n.scrollTop  = pos.top;
  });
}

function replaceHtmlKeepingScroll(elementId, html, scrollSelector) {
  const old = document.getElementById(elementId);
  if (!old) return null;
  const offsets = _scrollOffsets(old, scrollSelector);
  old.outerHTML = html;                          // `old` is detached from here
  const next = document.getElementById(elementId);  // so re-look-up by id
  if (!next) return null;
  _restoreScrollOffsets(next, scrollSelector, offsets);
  return next;
}

// innerHTML variant: the element itself survives the assignment, so there is
// no re-look-up and no same-id requirement on the replacement markup — only
// the scroll containers inside it are destroyed and rebuilt.
function replaceInnerHtmlKeepingScroll(elementId, html, scrollSelector) {
  const el = document.getElementById(elementId);
  if (!el) return null;
  const offsets = _scrollOffsets(el, scrollSelector);
  el.innerHTML = html;
  _restoreScrollOffsets(el, scrollSelector, offsets);
  return el;
}

// ── Monthly calculation ───────────────────────────────────────────────
// True when an assignment is a forecast (SP Yes/No may come back as true/1/'Yes')
function isForecastAssignment(a) {
  return a.IsForecast === true || a.IsForecast === 1 || a.IsForecast === 'Yes';
}

// ── Split-fee revenue (N-116) ─────────────────────────────────────────
// Exec Search and MG AI bill as a retainer up front plus the balance on
// placement, not a monthly rate. Each is recognised as a single lump sum in a
// single month, never pro-rated:
//   retainer  → the month of StartDate
//   placement → the month AFTER the month of EndDate
// The placement month therefore falls OUTSIDE the assignment window, and for a
// December end lands in January of the following year.

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

function isSplitFeeAssignment(a) {
  return CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(a?.ProjectType);
}

// Revenue events for a split-fee assignment. [] for anything else.
// A blank or zero fee is omitted entirely — a search with no placement fee
// agreed yet contributes its retainer and nothing more (no zero-amount row).
function splitFeeRevenueEvents(a) {
  if (!isSplitFeeAssignment(a)) return [];
  const events    = [];
  const retainer  = parseFloat(a.RetainerFee)  || 0;
  const placement = parseFloat(a.PlacementFee) || 0;
  const startKey  = monthKeyFromISO(a.StartDate);
  const endKey    = monthKeyFromISO(a.EndDate);
  if (retainer && startKey) {
    events.push({ monthKey: startKey, amount: retainer, kind: 'retainer' });
  }
  if (placement && endKey) {
    events.push({ monthKey: addMonthsToKey(endKey, 1), amount: placement, kind: 'placement' });
  }
  return events;
}

// Same shape for a SalesForecasts row. The fees are FLAT for the whole line —
// deliberately NOT multiplied by ForecastedHeadcount. One TP can run several
// concurrent Exec Search / MG AI engagements, so headcount is not an engagement
// count; it drives utilisation only and never touches revenue. A headcount of 0
// is legal and means a double-up on an already-deployed employee: no incremental
// capacity, but the fees are still recognised — hence no `if (!hc) return []`.
function splitFeeForecastEvents(f) {
  if (!CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(f?.ProjectType)) return [];
  const events    = [];
  const retainer  = parseFloat(f.RetainerFee)  || 0;
  const placement = parseFloat(f.PlacementFee) || 0;
  const startKey  = monthKeyFromISO(f.ForecastStartDate);
  const endKey    = monthKeyFromISO(f.ForecastEndDate);
  if (retainer && startKey) {
    events.push({ monthKey: startKey, amount: retainer, kind: 'retainer' });
  }
  if (placement && endKey) {
    events.push({ monthKey: addMonthsToKey(endKey, 1), amount: placement, kind: 'placement' });
  }
  return events;
}

// N-116: one label for both the tracker Rate column and the Gantt tooltip.
function assignmentRateLabel(a) {
  const gbp = (v) => '£' + Number(v).toLocaleString('en-GB');
  if (isSplitFeeAssignment(a)) {
    const r = parseFloat(a.RetainerFee)  || 0;
    const p = parseFloat(a.PlacementFee) || 0;
    if (!r && !p) return '—';
    return `${r ? gbp(r) : '—'} + ${p ? gbp(p) : '—'} (split)`;
  }
  return a.MonthlyBillRate ? gbp(a.MonthlyBillRate) : '—';
}

function computeMonthlyRows(assignments) {
  // N-120: anchor "today" to a UTC-midnight instant for the same calendar
  // day, so it composes safely with the UTC day-overlap arithmetic below —
  // mixing a local-midnight cap with UTC month boundaries could shift the
  // current-month cap by up to an hour across a BST/GMT transition.
  const todayLocal = new Date();
  const today = new Date(Date.UTC(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate()));
  const rows = [];
  for (const a of assignments) {
    if (!a.StartDate || !a.EndDate) continue;
    if (isForecastAssignment(a)) continue; // forecasts never feed utilisation/revenue
    const aStart = utcDateOnly(a.StartDate);
    const aEnd   = utcDateOnly(a.EndDate);
    const thisMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    const effectiveEnd = aEnd < thisMonthEnd ? aEnd : thisMonthEnd;
    // N-116: null for every non-split-fee assignment, so the branch below is
    // a no-op and existing revenue figures are byte-identical.
    const _splitEvents = isSplitFeeAssignment(a) ? splitFeeRevenueEvents(a) : null;
    const cur = new Date(Date.UTC(aStart.getUTCFullYear(), aStart.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(effectiveEnd.getUTCFullYear(), effectiveEnd.getUTCMonth(), 1));
    while (cur <= endMonth) {
      const year  = cur.getUTCFullYear();
      const month = cur.getUTCMonth();
      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd   = new Date(Date.UTC(year, month + 1, 0));
      const overlapStart = aStart > monthStart ? aStart : monthStart;
      const overlapEnd   = effectiveEnd < monthEnd ? effectiveEnd : monthEnd;
      const daysOverlap = (overlapEnd - overlapStart) / 86400000 + 1;
      const daysInMonth = monthEnd.getUTCDate();
      const fraction    = daysInMonth > 0 ? daysOverlap / daysInMonth : 0;
      const rate    = parseFloat(a.MonthlyBillRate) || 0;
      const billed  = a.Billed === 'Yes';
      // N-116: split-fee lines carry no monthly rate. Revenue is the lump sum
      // due in THIS month (usually nothing); capacity below is unaffected.
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const prorated = _splitEvents
        ? _splitEvents.filter(ev => ev.monthKey === monthKey)
                      .reduce((sum, ev) => sum + ev.amount, 0)
        : rate * fraction;
      rows.push({
        AssignmentID:     a.AssignmentID,
        EmployeeName:     a.EmployeeName,
        Level:            a.Level,
        Customer:         a.Customer,
        ProjectType:      a.ProjectType,
        Country:          a.Country,
        Billed:           a.Billed,
        Year:             year,
        Month:            month + 1,
        MonthStart:       `${monthKey}-01`,
        MonthFraction:    Math.round(fraction * 10000) / 10000,
        ProratedRevenue:  Math.round(prorated * 100) / 100,
        BilledRevenue:    billed ? Math.round(prorated * 100) / 100 : 0,
        Capacity:         Math.round(fraction * 10000) / 10000,
        BilledCapacity:   billed ? Math.round(fraction * 10000) / 10000 : 0,
      });
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }

    // N-116: the placement fee lands the month AFTER the assignment ends, which
    // the loop above never reaches. Emit it as a ZERO-CAPACITY revenue row — the
    // person is not assigned that month — subject to the same "not in the
    // future" cap that effectiveEnd applies to every other row.
    if (_splitEvents) {
      const lastKey  = `${endMonth.getFullYear()}-${String(endMonth.getMonth() + 1).padStart(2, '0')}`;
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const billedFlag = a.Billed === 'Yes';
      for (const ev of _splitEvents) {
        if (ev.monthKey <= lastKey)  continue; // already emitted inside the loop
        if (ev.monthKey > todayKey)  continue; // future month, same cap as above
        const amount = Math.round(ev.amount * 100) / 100;
        rows.push({
          AssignmentID:     a.AssignmentID,
          EmployeeName:     a.EmployeeName,
          Level:            a.Level,
          Customer:         a.Customer,
          ProjectType:      a.ProjectType,
          Country:          a.Country,
          Billed:           a.Billed,
          Year:             monthKeyYear(ev.monthKey),
          Month:            monthKeyMonth(ev.monthKey),
          MonthStart:       `${ev.monthKey}-01`,
          MonthFraction:    0,
          ProratedRevenue:  amount,
          BilledRevenue:    billedFlag ? amount : 0,
          Capacity:         0,
          BilledCapacity:   0,
        });
      }
    }
  }
  return rows;
}

// ── Revenue per month for a given year (no today cap) ─────────────────
// Pro-rates each assignment's MonthlyBillRate by day-overlap across all 12
// months of `year`. Includes former, current AND planned assignments
// (ignores the Billed flag — this is estimated revenue, not billed).
// Returns an array of 12 numbers, index 0 = Jan.
function computeMonthlyRevenueForYear(assignments, year) {
  const months = new Array(12).fill(0);
  for (const a of assignments) {
    // N-116: split-fee lines recognise two lump sums, not a pro-rated rate.
    // Checked BEFORE the date guards because the placement month sits outside
    // the assignment window and may belong to a different year entirely.
    if (isSplitFeeAssignment(a)) {
      for (const ev of splitFeeRevenueEvents(a)) {
        if (monthKeyYear(ev.monthKey) !== year) continue;
        months[monthKeyMonth(ev.monthKey) - 1] += ev.amount;
      }
      continue;
    }
    if (!a.StartDate || !a.EndDate) continue;
    const aStart = utcDateOnly(a.StartDate);
    const aEnd   = utcDateOnly(a.EndDate);
    const rate   = parseFloat(a.MonthlyBillRate) || 0;
    if (!rate) continue;
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(Date.UTC(year, m, 1));
      const monthEnd   = new Date(Date.UTC(year, m + 1, 0));
      if (aStart > monthEnd || aEnd < monthStart) continue; // no overlap
      const overlapStart = aStart > monthStart ? aStart : monthStart;
      const overlapEnd   = aEnd   < monthEnd   ? aEnd   : monthEnd;
      const daysOverlap  = (overlapEnd - overlapStart) / 86400000 + 1;
      const daysInMonth  = monthEnd.getUTCDate();
      const fraction     = daysInMonth > 0 ? daysOverlap / daysInMonth : 0;
      months[m] += rate * fraction;
    }
  }
  return months.map(v => Math.round(v));
}

// ── Forecast revenue per month for a given year ───────────────────────
// From the SalesForecasts list. Monthly £ = ForecastedHeadcount ×
// ForecastMonthlyRevenuePerHead, pro-rated by day-overlap per month.
// Rows overlapping a month are summed. Returns array[12], index 0 = Jan.
function computeMonthlyForecastRevenueForYear(salesForecasts, year) {
  const months = new Array(12).fill(0);
  for (const f of salesForecasts) {
    // N-116: split-fee forecast lines recognise two FLAT lump sums — see
    // splitFeeForecastEvents() for why ForecastedHeadcount is deliberately not a
    // multiplier. Checked before the date guards because the placement month
    // sits outside the window and may belong to another year.
    if (CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(f.ProjectType)) {
      for (const ev of splitFeeForecastEvents(f)) {
        if (monthKeyYear(ev.monthKey) !== year) continue;
        months[monthKeyMonth(ev.monthKey) - 1] += ev.amount;
      }
      continue;
    }
    if (!f.ForecastStartDate || !f.ForecastEndDate) continue;
    const fStart = utcDateOnly(f.ForecastStartDate);
    const fEnd   = utcDateOnly(f.ForecastEndDate);
    const hc     = parseFloat(f.ForecastedHeadcount) || 0;
    const rate   = parseFloat(f.ForecastMonthlyRevenuePerHead) || 0;
    const monthly = hc * rate;
    if (!monthly) continue;
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(Date.UTC(year, m, 1));
      const monthEnd   = new Date(Date.UTC(year, m + 1, 0));
      if (fStart > monthEnd || fEnd < monthStart) continue; // no overlap
      const overlapStart = fStart > monthStart ? fStart : monthStart;
      const overlapEnd   = fEnd   < monthEnd   ? fEnd   : monthEnd;
      const daysOverlap  = (overlapEnd - overlapStart) / 86400000 + 1;
      const daysInMonth  = monthEnd.getUTCDate();
      const fraction     = daysInMonth > 0 ? daysOverlap / daysInMonth : 0;
      months[m] += monthly * fraction;
    }
  }
  return months.map(v => Math.round(v));
}

// ── Distinct years spanned by assignment data (ascending) ─────────────
function getAssignmentDataYears(assignments) {
  const years = new Set();
  for (const a of assignments) {
    if (!a.StartDate || !a.EndDate) continue;
    const s = new Date(a.StartDate).getFullYear();
    const e = new Date(a.EndDate).getFullYear();
    for (let y = s; y <= e; y++) years.add(y);
    // N-116: a placement fee on a December-ending split-fee assignment is
    // recognised in January of the following year — that year must be
    // selectable or the revenue is invisible.
    for (const ev of splitFeeRevenueEvents(a)) years.add(monthKeyYear(ev.monthKey));
  }
  if (!years.size) years.add(new Date().getFullYear());
  return [...years].sort((x, y) => x - y);
}

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

// N-100: turns a plain integer day count into a short human label for the
// Role History timeline ("time in stage"). Takes a number only — never a
// date string — so it carries none of the SharePoint UTC/BST date-shift
// risk the date helpers above exist to guard against.
function formatDurationDays(days) {
  if (days == null || isNaN(days)) return '—';
  if (days < 1) return '<1 day';
  if (days === 1) return '1 day';
  if (days < 14) return `${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
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

// N-093 (F-2a): the earliest calendar day the Placements page's existing
// month/quarter/year filter can possibly match, as 'YYYY-MM-DD', or null
// when no filter is set. Used ONLY as a server-side `ge` lower bound — it is
// deliberately loose (a quarter/month filter returns that year's 1 January),
// because placementInFilter() still applies the exact test client-side. A
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

function placementFilterCutoff(filter, today = new Date()) {
  if (!filter || !filter.type) return null;
  const year = filter.type === 'year' ? filter.value : today.getFullYear();
  if (!Number.isFinite(year)) return null;
  return `${year}-01-01`;
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

function setGhostUser(email, displayName) {
  sessionStorage.setItem(GHOST_USER_KEY, email.toLowerCase());
  sessionStorage.setItem(GHOST_LABEL_KEY, displayName || email);
}
function getGhostUser() {
  return sessionStorage.getItem(GHOST_USER_KEY);
}
function getGhostLabel() {
  return sessionStorage.getItem(GHOST_LABEL_KEY);
}
function clearGhostUser() {
  sessionStorage.removeItem(GHOST_USER_KEY);
  sessionStorage.removeItem(GHOST_LABEL_KEY);
}

// Shared ghost-mode banner. Create-or-update: safe to call once from
// index.html's initHome() and repeatedly from nav-core.js's
// renderModuleNav() (re-run on every page navigation) without ever
// creating a second #ghost-banner or re-prepending an existing one.
// (N-170 — was duplicated between nav-core.js and index.html.)
function renderGhostBanner() {
  const ghostEmail = getGhostUser();
  const appShell    = document.getElementById('app-shell');
  let ghostBanner   = document.getElementById('ghost-banner');
  if (ghostEmail) {
    if (!ghostBanner) {
      ghostBanner = document.createElement('div');
      ghostBanner.id = 'ghost-banner';
      document.body.prepend(ghostBanner);
    }
    ghostBanner.innerHTML = `
      👻 Ghost mode — viewing as <strong>${escHtml(getGhostLabel() || ghostEmail)}</strong>
      <button onclick="exitGhostMode()">Exit Ghost Mode</button>
    `;
    if (appShell) appShell.classList.add('ghost-active');
  } else {
    if (ghostBanner) ghostBanner.remove();
    if (appShell) appShell.classList.remove('ghost-active');
  }
}

function exitGhostMode() {
  clearGhostUser();
  // Reload the current page to re-initialise with the real role
  window.location.reload();
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

// ── Theme (light / dark) ────────────────────────────────────────────
// Explicit user choice, once made, overrides prefers-color-scheme permanently.
// theme-init.js sets the initial data-theme attribute before first paint using
// the same localStorage key — keep THEME_KEY's value in sync with the literal
// string in theme-init.js if it ever changes.
const THEME_KEY = 'newton_theme';

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function setTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}
function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  if (typeof updateThemeToggleIcon === 'function') updateThemeToggleIcon();
}

// ── Dashboard skeleton placeholder ───────────────────────────────
function dashboardSkeleton(cardCount = 5) {
  const card = `<div class="skel-card">
    <div class="skel skel-line-value"></div>
    <div class="skel skel-line-label"></div>
  </div>`;
  const panelLines = Array.from({length: 5},
    () => `<div class="skel skel-line"></div>`).join('');
  return `
    <div class="skel-strip">${card.repeat(cardCount)}</div>
    <div class="skel-panel">${panelLines}</div>`;
}

// ── Count-up animation on a .kpi-value element ───────────────────
function animateCountUp(el) {
  const raw = (el.textContent || '').trim();
  // only animate clean integers/decimals — skip "82%", "— ", "5 ▲3" etc.
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return;
  const target = parseFloat(raw);
  if (!isFinite(target)) return;
  const dur = 650, start = performance.now();
  const decimals = (raw.split('.')[1] || '').length;
  el.classList.add('counting');
  function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);          // ease-out cubic
    el.textContent = (target * eased).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = raw;                      // settle on exact original
  }
  requestAnimationFrame(tick);
}

function runKpiCountUps(scope = document) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  scope.querySelectorAll('.kpi-value').forEach(animateCountUp);
}

// ── Project Active/Archive (N-112) ─────────────────────────────
// Active bucket = Status Active or Transition. Archive bucket = Status
// Completed. This is the single source of truth for that line — every
// caller filters through this predicate rather than checking p.Status inline.
function isProjectActive(project) {
  return project?.Status !== 'Completed';
}

// Returns a NEW array sorted by CustomerName A-Z. Does not mutate the input.
function sortProjectsByName(projects) {
  return [...projects].sort((a, b) => (a.CustomerName || '').localeCompare(b.CustomerName || ''));
}

// Flat, escaped <option> list for a project array — no grouping, no "All
// Projects" default. Shared by every project <select> in the app.
function buildProjectOptionsHtml(projects, selectedId) {
  return projects.map(p =>
    `<option value="${p.id}" ${String(selectedId) === String(p.id) ? 'selected' : ''}>${escHtml(p.CustomerName)}</option>`
  ).join('');
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

// Escape for safe interpolation into a double-quoted HTML attribute.
// Example: value="${escAttr(title)}" where title may contain "
function escAttr(str) {
  return String(str ?? '').replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[c]);
}

// Escape for safe interpolation into a JavaScript string inside an HTML attribute.
// Example: onclick="func('${escJsAttr(title)}')" where title may contain ' or \
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

// ── Empty states (N-103 / X-2) ─────────────────────────────────
// Block-level empty state for a panel/page area with no surrounding table
// (the whole panel is this markup — nothing else to preserve). icon is a
// lucide icon name; the caller's page must load lucide and call
// lucide.createIcons() after setting innerHTML, same as every other
// data-lucide site in the app. actionLabel/actionOnClick are optional —
// omit both for a message-only state (read-only panels, no add-flow).
function emptyStateBlock({ icon = 'inbox', title = '', message = '', actionLabel = '', actionOnClick = '' } = {}) {
  const titleHtml  = title ? `<p class="empty-state-title">${escHtml(title)}</p>` : '';
  const actionHtml = (actionLabel && actionOnClick)
    ? `<button class="btn-primary empty-state-action" onclick="${escAttr(actionOnClick)}">${escHtml(actionLabel)}</button>`
    : '';
  return `<div class="empty-state">
    <i data-lucide="${escAttr(icon)}" class="empty-state-icon"></i>
    ${titleHtml}
    <p class="empty-state-message">${escHtml(message)}</p>
    ${actionHtml}
  </div>`;
}

// Compact inline empty state for a single <tr> inside an existing table's
// <tbody> — same intent (icon + message + optional action), sized to sit
// inside the table grid instead of replacing it. colspan MUST match the
// table's real column count, including any conditional trailing action
// column — get this wrong and the row breaks the grid.
function emptyStateRow({ colspan, icon = 'inbox', message = '', actionLabel = '', actionOnClick = '' } = {}) {
  const actionHtml = (actionLabel && actionOnClick)
    ? `<a href="#" onclick="${escAttr(actionOnClick)};return false;">${escHtml(actionLabel)}</a>`
    : '';
    return `<tr><td colspan="${colspan}" class="empty-state-row">
    <i data-lucide="${escAttr(icon)}" class="empty-state-row-icon"></i>
    <span>${escHtml(message)}</span>${actionHtml}
  </td></tr>`;
}

// ── Toast + confirm modal (N-104 / X-3a) ────────────────────────
// Reusable non-blocking toast + promise-returning confirm modal, replacing
// alert()/confirm()/prompt() call sites. Engine only — migrating existing
// call sites is N-105 (alert→toast), N-106 (confirm→modal) and N-107
// (prompt→modal); nothing below is wired to a caller yet. Both lazily
// build their own DOM on first use, so no page/app.js needs an init call.

const TOAST_ICONS = { info: 'info', success: 'check-circle', error: 'alert-circle' };

function _ensureToastContainer() {
  let el = document.getElementById('toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'false');
    document.body.appendChild(el);
  }
  return el;
}

// Removes a toast, clearing any pending auto-dismiss timer first so a
// stale timeout can never fire against an already-detached node.
function _removeToast(el) {
  if (el._toastTimer) { clearTimeout(el._toastTimer); el._toastTimer = null; }
  el.classList.add('toast--leaving');
  setTimeout(() => el.remove(), 200);
}

// Non-blocking toast. type: 'info' | 'success' | 'error'. duration is ms;
// 0 = persistent (manual close only — the close button is always shown
// regardless of duration). action, if given, is { label, onClick } and
// renders as a text button (e.g. "Undo") that fires onClick once and
// dismisses the toast immediately, without waiting for the timer.
function toast(message, { type = 'info', duration = 4000, action = null } = {}) {
  const container = _ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  const icon = TOAST_ICONS[type] || TOAST_ICONS.info;
  const actionHtml = action
    ? `<button type="button" class="toast-action">${escHtml(action.label)}</button>`
    : '';
  el.innerHTML = `
    <i data-lucide="${escAttr(icon)}" class="toast-icon"></i>
    <span class="toast-message">${escHtml(message)}</span>
    ${actionHtml}
    <button type="button" class="toast-close" aria-label="Dismiss">&times;</button>
  `;
  container.appendChild(el);
  if (window.lucide) lucide.createIcons();

  const startTimer = () => {
    if (duration > 0) el._toastTimer = setTimeout(() => _removeToast(el), duration);
  };
  const stopTimer = () => {
    if (el._toastTimer) { clearTimeout(el._toastTimer); el._toastTimer = null; }
  };

  el.addEventListener('mouseenter', stopTimer);
  el.addEventListener('mouseleave', startTimer);
  el.querySelector('.toast-close').addEventListener('click', () => _removeToast(el));
  if (action) {
    el.querySelector('.toast-action').addEventListener('click', () => {
      action.onClick();
      _removeToast(el);
    });
  }
  startTimer();
}

let _confirmModalOpen = false;

// Promise-returning replacement for confirm(). Resolves true on Confirm
// click, false on Cancel click, backdrop click, or Escape. danger:true
// styles the Confirm button for destructive actions. Only one instance may
// be open at a time — a second call while one is open resolves false
// immediately (native confirm() was always single-instance/blocking; no
// caller needs concurrent dialogs).
function confirmModal({ title = '', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  if (_confirmModalOpen) {
    console.warn('confirmModal: a confirm dialog is already open');
    return Promise.resolve(false);
  }
  _confirmModalOpen = true;

  return new Promise(resolve => {
    const previouslyFocused = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';
    const titleHtml = title ? `<h3 class="confirm-modal-title">${escHtml(title)}</h3>` : '';
    overlay.innerHTML = `
      <div class="confirm-modal" role="alertdialog" aria-modal="true">
        ${titleHtml}
        <p class="confirm-modal-message">${escHtml(message)}</p>
        <div class="confirm-modal-actions">
          <button type="button" class="btn-secondary confirm-modal-cancel">${escHtml(cancelLabel)}</button>
          <button type="button" class="btn-primary confirm-modal-confirm${danger ? ' confirm-modal-confirm--danger' : ''}">${escHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cancelBtn  = overlay.querySelector('.confirm-modal-cancel');
    const confirmBtn = overlay.querySelector('.confirm-modal-confirm');

    const close = result => {
      _confirmModalOpen = false;
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(result);
    };

    // Minimal focus trap: exactly two focusable elements, so Tab and
    // Shift+Tab both just swap focus between them.
    const onKeydown = e => {
      if (e.key === 'Escape') { close(false); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === confirmBtn ? cancelBtn : confirmBtn).focus();
      }
    };

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKeydown);

    cancelBtn.focus();
  });
}

// Promise-returning replacement for prompt(). Resolves with the input's
// current value on Confirm click or Enter-in-input, null on Cancel click,
// backdrop click, or Escape — matches native prompt()'s cancel return
// value, so every call site's existing `=== null` check keeps working
// unchanged. Shares _confirmModalOpen with confirmModal (see above) rather
// than a separate flag — one "a dialog from this family is already open"
// guard for both.
function promptModal({ title = '', message = '', defaultValue = '', placeholder = '', confirmLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  if (_confirmModalOpen) {
    console.warn('promptModal: a confirm/prompt dialog is already open');
    return Promise.resolve(null);
  }
  _confirmModalOpen = true;

  return new Promise(resolve => {
    const previouslyFocused = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';
    const titleHtml = title ? `<h3 class="confirm-modal-title">${escHtml(title)}</h3>` : '';
    const messageHtml = message ? `<p class="confirm-modal-message">${escHtml(message)}</p>` : '';
    overlay.innerHTML = `
      <div class="confirm-modal" role="alertdialog" aria-modal="true">
        ${titleHtml}
        ${messageHtml}
        <input type="text" class="confirm-modal-input" placeholder="${escAttr(placeholder)}">
        <div class="confirm-modal-actions">
          <button type="button" class="btn-secondary confirm-modal-cancel">${escHtml(cancelLabel)}</button>
          <button type="button" class="btn-primary confirm-modal-confirm">${escHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // defaultValue is set via the .value property, not interpolated into
    // the template string above — avoids a second escaping path for a
    // value that was never going through HTML parsing in the first place.
    const input = overlay.querySelector('.confirm-modal-input');
    input.value = defaultValue;

    const cancelBtn  = overlay.querySelector('.confirm-modal-cancel');
    const confirmBtn = overlay.querySelector('.confirm-modal-confirm');

    const close = result => {
      _confirmModalOpen = false;
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(result);
    };

    // Focus trap over 3 elements: input → Cancel → Confirm → input (and
    // reverse on Shift+Tab) — confirmModal's simpler 2-element swap doesn't
    // generalise to 3, so this walks an explicit order array instead.
    const onKeydown = e => {
      if (e.key === 'Escape') { close(null); return; }
      if (e.key === 'Enter' && document.activeElement === input) { close(input.value); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        const order = [input, cancelBtn, confirmBtn];
        const i = order.indexOf(document.activeElement);
        const next = order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length];
        next.focus();
      }
    };

    cancelBtn.addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => close(input.value));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKeydown);

    input.focus();
    if (defaultValue) input.select();
  });
}

// First non-empty line of a multi-line string. Returns '' for empty input.
function firstLine(str) {
  const lines = String(str ?? '').split(/\r?\n/).map(l => l.trim());
  return lines.find(l => l !== '') || '';
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

// ── People Dashboard calc/format helpers ─────────────────────
function _dashDateRange(filter) {
  const { year, month, quarter } = filter;
  if (month !== null) {
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
  }
  if (quarter !== null) {
    return { start: new Date(year, (quarter - 1) * 3, 1), end: new Date(year, quarter * 3, 0) };
  }
  return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
}

// Filter monthly rows to a date range
function _rowsInRange(rows, start, end) {
  return rows.filter(r => {
    const ms = new Date(r.Year, r.Month - 1, 1);
    return ms >= start && ms <= end;
  });
}

// Filter monthly rows to a full calendar year
function _rowsInYear(rows, year) {
  return rows.filter(r => r.Year === year);
}

function _fmtGBP(n) {
  return '£' + (n || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _fmtPct(n) {
  return ((n || 0) * 100).toFixed(1) + '%';
}

// ── People.Level helpers (N-117) ────────────────────────────────
// Sort rank for a Level value, per CONFIG.PEOPLE_LEVELS order. Unknown/blank
// levels sort last (99), matching every levelOrder map's prior fallback.
function levelSortIndex(level) {
  const i = CONFIG.PEOPLE_LEVELS.indexOf(level);
  return i === -1 ? 99 : i;
}

// True for every "billable team" level (everyone except CSD). Single source
// of truth for the "counts toward TP-tier headcount/utilisation" line — a
// future new Level value only ever needs to be added to CONFIG.PEOPLE_LEVELS
// for this to keep working, no call site needs to change.
function isBillableLevel(level) {
  return level !== 'CSD';
}

// Calculates utilisation % from an array of monthly rows.
function _calcUtilisation(rows) {
  const filtered  = rows.filter(r => isBillableLevel(r.Level));
  const billedCap = filtered.reduce((s, r) => s + r.BilledCapacity, 0);
  const totalCap  = filtered.reduce((s, r) => s + r.Capacity, 0);
  return totalCap > 0 ? billedCap / totalCap : 0;
}
function _barChart(data, valueFormatter) {
  const max = Math.max(...data.map(d => d.value), 0.001);
  return `<div style='margin-top:12px'>
    ${data.map(d => `
      <div style='display:flex;align-items:center;gap:8px;margin-bottom:6px'>
        <div style='width:80px;font-size:12px;color:var(--text-label);text-align:right;
                    flex-shrink:0'>${d.label}</div>
        <div style='flex:1;background:var(--surface-hover);border-radius:3px;height:18px'>
          <div style='width:${Math.round((d.value/max)*100)}%;background:var(--surface-accent);
                      height:18px;border-radius:3px;min-width:2px'></div>
        </div>
        <div style='width:50px;font-size:12px;color:var(--text-secondary);flex-shrink:0'>
          ${valueFormatter ? valueFormatter(d.value) : d.value}</div>
      </div>`).join('')}
  </div>`;
}

// ── Sales Forecast Utilisation helper ────────────
function _salesForecastUtil(monthIdx, salesForecasts, totalActiveHeadcount, assignmentForecastUtil) {
  const now      = new Date();
  const thisYear = now.getFullYear();
  const mStart   = new Date(thisYear, monthIdx, 1);
  const mEnd     = new Date(thisYear, monthIdx + 1, 0);

  // Additional headcount from sales forecasts overlapping this month
  const forecastedBilled = salesForecasts.reduce((sum, f) => {
    const s = new Date(f.ForecastStartDate);
    const e = new Date(f.ForecastEndDate);
    return (s <= mEnd && e >= mStart) ? sum + (f.ForecastedHeadcount || 0) : sum;
  }, 0);

  // Base is the existing assignment forecast util (already a 0-1 ratio)
  // Add sales headcount on top, expressed as a fraction of total headcount
  const base = assignmentForecastUtil || 0;
  const added = totalActiveHeadcount > 0 ? forecastedBilled / totalActiveHeadcount : 0;
  const combined = Math.min(base + added, 1.0);
  return combined > 0 ? combined : null;
}
