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

function computeMonthlyRows(assignments) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = [];
  for (const a of assignments) {
    if (!a.StartDate || !a.EndDate) continue;
    if (isForecastAssignment(a)) continue; // forecasts never feed utilisation/revenue
    const aStart = new Date(a.StartDate);
    const aEnd   = new Date(a.EndDate);
    aStart.setHours(0,0,0,0);
    aEnd.setHours(0,0,0,0);
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const effectiveEnd = aEnd < thisMonthEnd ? aEnd : thisMonthEnd;
    const cur = new Date(aStart.getFullYear(), aStart.getMonth(), 1);
    const endMonth = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), 1);
    while (cur <= endMonth) {
      const year  = cur.getFullYear();
      const month = cur.getMonth();
      const monthStart = new Date(year, month, 1);
      const monthEnd   = new Date(year, month + 1, 0);
      const overlapStart = aStart > monthStart ? aStart : monthStart;
      const overlapEnd   = effectiveEnd < monthEnd ? effectiveEnd : monthEnd;
      const daysOverlap = (overlapEnd - overlapStart) / 86400000 + 1;
      const daysInMonth = monthEnd.getDate();
      const fraction    = daysInMonth > 0 ? daysOverlap / daysInMonth : 0;
      const rate    = parseFloat(a.MonthlyBillRate) || 0;
      const billed  = a.Billed === 'Yes';
      const prorated = rate * fraction;
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
      cur.setMonth(cur.getMonth() + 1);
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
    if (!a.StartDate || !a.EndDate) continue;
    const aStart = new Date(a.StartDate); aStart.setHours(0,0,0,0);
    const aEnd   = new Date(a.EndDate);   aEnd.setHours(0,0,0,0);
    const rate   = parseFloat(a.MonthlyBillRate) || 0;
    if (!rate) continue;
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(year, m, 1);
      const monthEnd   = new Date(year, m + 1, 0);
      if (aStart > monthEnd || aEnd < monthStart) continue; // no overlap
      const overlapStart = aStart > monthStart ? aStart : monthStart;
      const overlapEnd   = aEnd   < monthEnd   ? aEnd   : monthEnd;
      const daysOverlap  = (overlapEnd - overlapStart) / 86400000 + 1;
      const daysInMonth  = monthEnd.getDate();
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
    if (!f.ForecastStartDate || !f.ForecastEndDate) continue;
    const fStart = new Date(f.ForecastStartDate); fStart.setHours(0,0,0,0);
    const fEnd   = new Date(f.ForecastEndDate);   fEnd.setHours(0,0,0,0);
    const hc     = parseFloat(f.ForecastedHeadcount) || 0;
    const rate   = parseFloat(f.ForecastMonthlyRevenuePerHead) || 0;
    const monthly = hc * rate;
    if (!monthly) continue;
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(year, m, 1);
      const monthEnd   = new Date(year, m + 1, 0);
      if (fStart > monthEnd || fEnd < monthStart) continue; // no overlap
      const overlapStart = fStart > monthStart ? fStart : monthStart;
      const overlapEnd   = fEnd   < monthEnd   ? fEnd   : monthEnd;
      const daysOverlap  = (overlapEnd - overlapStart) / 86400000 + 1;
      const daysInMonth  = monthEnd.getDate();
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
