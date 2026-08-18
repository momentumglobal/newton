// js/dashboard-core.js — shared state & helpers (Project + Company Dashboards)
// ── State ─────────────────────────────────────────────────────────────
let _dashPeriod       = 'quarter'; // KPI ribbon: 'month' | 'quarter' | 'year'
let _dashDetailPeriod = 'this_month'; // Detail panels filter
let _dashProjectId    = null;
// ── Fade refresh helper ───────────────────────────────────────────────
function fadeRefresh(selector, updateFn) {
  const el = document.querySelector(selector);
  if (!el) { updateFn(null); return; }
  el.style.transition = 'opacity 120ms ease';
  el.style.opacity    = '0';
  setTimeout(() => {
    updateFn(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
    });
  }, 120);
}
// ── KPI period helpers ────────────────────────────────────────────────
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - y) / 86400000) + 1) / 7);
}
function activityInKpiPeriod(a, period) {
  const now = new Date();
  const year = Number(a.Year), week = Number(a.WeekNumber);
  const cy = now.getFullYear(), cm = now.getMonth();
  if (period === 'month')   return year === cy && Math.floor((week - 1) / 4.33) === cm;
  if (period === 'quarter') return year === cy && Math.floor((week - 1) / 13) === Math.floor(cm / 3);
  if (period === 'year')    return year === cy;
  return true;
}
function roleHiredInKpiPeriod(r, period) {
  if (!r.ActualHireDate) return false;
  const d = new Date(r.ActualHireDate), now = new Date();
  if (period === 'month')   return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === 'quarter') return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth()/3) === Math.floor(now.getMonth()/3);
  if (period === 'year')    return d.getFullYear() === now.getFullYear();
  return true;
}
// ── Detail period helpers ─────────────────────────────────────────────
function getDetailPeriodRange(period) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const q = Math.floor(m / 3);
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - dayOfWeek); thisMonday.setHours(0,0,0,0);
  const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
  const thisSunday = new Date(thisMonday); thisSunday.setDate(thisMonday.getDate() + 6); thisSunday.setHours(23,59,59,999);
  const lastSunday = new Date(lastMonday); lastSunday.setDate(lastMonday.getDate() + 6); lastSunday.setHours(23,59,59,999);
  switch (period) {
    case 'this_week':    return { start: thisMonday, end: thisSunday };
    case 'last_week':    return { start: lastMonday, end: lastSunday };
    case 'this_month':   return { start: new Date(y, m, 1), end: new Date(y, m+1, 0, 23, 59, 59) };
    case 'last_month':   return { start: new Date(y, m-1, 1), end: new Date(y, m, 0, 23, 59, 59) };
    case 'this_quarter': return { start: new Date(y, q*3, 1), end: new Date(y, q*3+3, 0, 23, 59, 59) };
    case 'last_quarter': return { start: new Date(y, (q-1)*3, 1), end: new Date(y, q*3, 0, 23, 59, 59) };
    case 'this_year':    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59) };
    case 'last_year':    return { start: new Date(y-1, 0, 1), end: new Date(y-1, 11, 31, 23, 59, 59) };
    default:             return { start: new Date(y, m, 1), end: new Date(y, m+1, 0, 23, 59, 59) };
  }
}
function weekEndingDate(year, weekNum) {
  const jan4 = new Date(year, 0, 4);
  const startOfW1 = new Date(jan4);
  startOfW1.setDate(jan4.getDate() - (jan4.getDay() === 0 ? 6 : jan4.getDay() - 1));
  const monday = new Date(startOfW1);
  monday.setDate(startOfW1.getDate() + (weekNum - 1) * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);
  return friday;
}
function activityInDetailPeriod(a, period) {
  const { start, end } = getDetailPeriodRange(period);
  const date = a.WeekEndingDate
    ? new Date(a.WeekEndingDate)
    : weekEndingDate(Number(a.Year), Number(a.WeekNumber));
  return date >= start && date <= end;
}
// ── Data fetch ────────────────────────────────────────────────────────
async function fetchDashboardData(projectId, role) {
  const isTP = role === 'talent_partner';
  // N-094 (F-2b): roles resolve first so their ids can scope the Placements
  // and RejectedOffers queries server-side — neither list has a ProjectID
  // column, so the role-id set is the only lever there is. The ids come from
  // allRoles, BEFORE the isTP narrowing below, on purpose: the server filter
  // must stay a superset of what the client filter keeps, never narrower.
  const [allRoles, activity, tpMap] = await Promise.all([
    getRolesForProject(projectId),
    getWeeklyActivity(projectId, null),
    getTalentPartnerDisplayMap(),
  ]);
  const roleIds = allRoles.map(r => r.id);
  const [placements, rejections] = await Promise.all([
    getPlacements(null, { roleIds }),
    getRejectedOffers(null, { roleIds }),
  ]);
  let roles = allRoles, acts = activity;
  if (isTP) {
    const userEmail = (getCurrentUser().email || '').toLowerCase();
    roles = allRoles.filter(r => tpMatches(r.TalentPartner, userEmail));
    acts  = activity.filter(a => tpMatches(a.TalentPartner, userEmail));
  }
  const ids = new Set(roles.map(r => String(r.id)));
  return {
    roles,
    activity: acts,
    placements: placements.filter(p => ids.has(String(p.RoleIDLookupId)) || ids.has(String(p.RoleID))),
    rejections: rejections.filter(r => ids.has(String(r.RoleIDLookupId)) || ids.has(String(r.RoleID))),
    tpMap,
  };
}
// ── Calculation helpers ───────────────────────────────────────────────
function avgDaysToHire(roles) {
  const hired = roles.filter(r => r.ActualHireDate && r.OpenDate);
  if (!hired.length) return null;
  return Math.round(hired.reduce((s, r) =>
    s + Math.floor((new Date(r.ActualHireDate) - new Date(r.OpenDate)) / 86400000), 0) / hired.length);
}
function avgDaysOpen(roles) {
  const active = roles.filter(r =>
    !['Backlog','Hired','Cancelled','On-hold'].includes(r.Stage) && r.OpenDate);
  if (!active.length) return null;
  return Math.round(active.reduce((s, r) => s + daysOpen(r.OpenDate), 0) / active.length);
}
function hiredOnTimePct(roles) {
  const hired = roles.filter(r => r.ActualHireDate && r.TargetHireDate);
  if (!hired.length) return null;
  return Math.round(hired.filter(r =>
    new Date(r.ActualHireDate) <= new Date(r.TargetHireDate)).length / hired.length * 100);
}
// ── Delta helper ──────────────────────────────────────────────────────
function kpiDelta(curr, prev, lowerIsBetter = false, isPercent = false) {
  if (curr === null || prev === null || prev === 0) return '';
  const diff = curr - prev;
  if (diff === 0) return `<span style='color:var(--text-faint);font-size:13px;margin-left:6px'>—</span>`;
  const positive = lowerIsBetter ? diff < 0 : diff > 0;
  const colour   = positive ? 'var(--status-success)' : 'var(--status-danger)';
  const sign     = diff > 0 ? '+' : '';
  const label    = isPercent ? `${sign}${diff}%` : `${sign}${diff}`;
  return `<span style='color:${colour};font-size:13px;font-weight:500;margin-left:6px'>${label}</span>`;
}
function getPreviousPeriod(period) {
  if (period === 'month')   return 'last_month';
  if (period === 'quarter') return 'last_quarter';
  if (period === 'year')    return 'last_year';
  return null;
}
// ── KPI strip ─────────────────────────────────────────────────────────
function kpiCard(label, value, sub = '') {
  return `<div class='kpi-card'>
    <div class='kpi-value'>${value}</div>
    <div class='kpi-label'>${label}</div>
    ${sub ? `<div class='kpi-sub'>${sub}</div>` : ''}
  </div>`;
}
// ── Filter helpers (shared by Project + Company dashboards) ────────────
function periodButtons(periods, active, fn) {
  return periods.map(([k, l]) =>
    `<button class='btn-filter${active === k ? ' active' : ''}' onclick='${fn}("${k}")'>${l}</button>`
  ).join('');
}
const DETAIL_PERIOD_OPTIONS = [
  ['this_week',    'This Week'],
  ['last_week',    'Last Week'],
  ['this_month',   'This Month'],
  ['last_month',   'Last Month'],
  ['this_quarter', 'This Quarter'],
  ['last_quarter', 'Last Quarter'],
  ['this_year',    'This Year'],
  ['last_year',    'Last Year'],
];
