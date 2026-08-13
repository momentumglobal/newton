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
        MonthStart:       monthStart.toISOString().slice(0, 10),
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
  const start = new Date(openDate);
  const end = hireDate ? new Date(hireDate) : new Date();
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
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
  return d.toISOString().split('T')[0];
}

// ── Activity field summation ─────────────────────────────────────────
function sumField(acts, field) {
  return acts.reduce((s, a) => s + (Number(a[field]) || 0), 0);
}

// ── Ghost / impersonation mode ────────────────────────────────────────
// Admin-only. Temporarily overrides the resolved role for testing.
// Stored in sessionStorage — cleared on sign-out or by clearGhostRole().

const GHOST_KEY         = 'newton_ghost_role';
const GHOST_PROJECT_KEY = 'newton_ghost_project';

function setGhostRole(role) {
  sessionStorage.setItem(GHOST_KEY, role);
}
function getGhostRole() {
  return sessionStorage.getItem(GHOST_KEY);
}
function clearGhostRole() {
  sessionStorage.removeItem(GHOST_KEY);
  sessionStorage.removeItem(GHOST_PROJECT_KEY);
}
function setGhostProject(projectId) {
  sessionStorage.setItem(GHOST_PROJECT_KEY, String(projectId));
}
function getGhostProject() {
  return sessionStorage.getItem(GHOST_PROJECT_KEY);
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
        <div style='width:80px;font-size:12px;color:var(--c-gray-700);text-align:right;
                    flex-shrink:0'>${d.label}</div>
        <div style='flex:1;background:var(--c-gray-075);border-radius:3px;height:18px'>
          <div style='width:${Math.round((d.value/max)*100)}%;background:var(--c-ptype-embedded);
                      height:18px;border-radius:3px;min-width:2px'></div>
        </div>
        <div style='width:50px;font-size:12px;color:var(--c-gray-800);flex-shrink:0'>
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
