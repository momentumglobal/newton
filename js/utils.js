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

// ── Monthly calculation ───────────────────────────────────────────────
function computeMonthlyRows(assignments) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = [];
  for (const a of assignments) {
    if (!a.StartDate || !a.EndDate) continue;
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
