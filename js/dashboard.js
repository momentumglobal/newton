// js/dashboard.js — Project Dashboard

// ── State ─────────────────────────────────────────────────────────────
let _dashPeriod       = 'quarter'; // KPI ribbon: 'month' | 'quarter' | 'year'
let _dashDetailPeriod = 'this_month'; // Detail panels filter
let _dashProjectId    = null;

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
  const [allRoles, activity, placements, rejections] = await Promise.all([
    getRolesForProject(projectId),
    getWeeklyActivity(projectId, null),
    getPlacements(null),
    getRejectedOffers(null),
  ]);
  let roles = allRoles, acts = activity;
  if (isTP) {
    const userName = (getCurrentUser().name || '').trim();
    roles = allRoles.filter(r => r.TalentPartner && r.TalentPartner.trim() === userName);
    acts  = activity.filter(a => a.TalentPartner && a.TalentPartner.trim() === userName);
  }
  const ids = new Set(roles.map(r => String(r.id)));
  return {
    roles,
    activity: acts,
    placements: placements.filter(p => ids.has(String(p.RoleIDLookupId)) || ids.has(String(p.RoleID))),
    rejections: rejections.filter(r => ids.has(String(r.RoleIDLookupId)) || ids.has(String(r.RoleID))),
  };
}

// ── Calculation helpers ───────────────────────────────────────────────
function sumField(acts, field) {
  return acts.reduce((s, a) => s + (Number(a[field]) || 0), 0);
}
function avgDaysToHire(roles) {
  const hired = roles.filter(r => r.ActualHireDate && r.OpenDate);
  if (!hired.length) return null;
  return Math.round(hired.reduce((s, r) =>
    s + Math.floor((new Date(r.ActualHireDate) - new Date(r.OpenDate)) / 86400000), 0) / hired.length);
}
function hiredOnTimePct(roles) {
  const hired = roles.filter(r => r.ActualHireDate && r.TargetHireDate);
  if (!hired.length) return null;
  return Math.round(hired.filter(r =>
    new Date(r.ActualHireDate) <= new Date(r.TargetHireDate)).length / hired.length * 100);
}

// ── KPI strip ─────────────────────────────────────────────────────────
function kpiCard(label, value, sub = '') {
  return `<div class='kpi-card'>
    <div class='kpi-value'>${value}</div>
    <div class='kpi-label'>${label}</div>
    ${sub ? `<div class='kpi-sub'>${sub}</div>` : ''}
  </div>`;
}

function renderKPIStrip(roles, activity, period) {
  const openRoles  = roles.filter(r => !['Backlog','Hired','Cancelled','On-hold'].includes(r.Stage)).length;
  const totalHires = roles.filter(r => r.Stage === 'Hired').length;

  const acts      = activity.filter(a => activityInKpiPeriod(a, period));
  const submitted = sumField(acts, 'Submitted');
  const int1      = sumField(acts, 'Interview1');
  const offers    = sumField(acts, 'Offers');
  const hires     = sumField(acts, 'Hires');

  const convPct  = submitted > 0 ? Math.round((int1 / submitted) * 100) + '%' : '—';
  const ivOfferR = offers > 0 ? Math.round(int1 / offers) + ':1' : '—';
  const offerPct = offers > 0 ? Math.round((hires / offers) * 100) + '%' : '—';

  const periodRoles = roles.filter(r => roleHiredInKpiPeriod(r, period));
  const avgDays     = avgDaysToHire(periodRoles);
  const onTimePct   = hiredOnTimePct(periodRoles);

  return `
    <div class='kpi-strip'>
      ${kpiCard('Open Roles', openRoles, 'current')}
      ${kpiCard('Hires to Date', totalHires, 'all time')}
    </div>
    <div class='kpi-strip kpi-strip-period'>
      ${kpiCard('Submission Conversion', convPct, 'IV1 / Submitted')}
      ${kpiCard('IV to Offer Ratio', ivOfferR, 'IV1 : Offers')}
      ${kpiCard('Offer Success', offerPct, 'Hires / Offers')}
      ${kpiCard('Avg Days to Hire', avgDays !== null ? avgDays : '—', 'hired roles in period')}
      ${kpiCard('Hired On Time', onTimePct !== null ? onTimePct + '%' : '—', 'within 45-day target')}
    </div>`;
}

// ── Pipeline Activity table ───────────────────────────────────────────
function renderPipelineActivityTable(acts, roles, period) {
  const filtered = acts.filter(a => activityInDetailPeriod(a, period));
  const FIELDS   = ['Outreach','Responses','Screened','Submitted','Interview1','Interview2Plus','FinalInterview','Offers','Hires'];
  const LABELS   = ['Outreach','Responses','Screened','Submitted','Interview 1','Interview 2+','Final Interview','Offers','Hires'];
  const roleMap  = Object.fromEntries(roles.map(r => [String(r.id), r.RoleTitle]));

  const byRole = {};
  filtered.forEach(a => {
    const rid = String(a.RoleIDLookupId || a.RoleID || '');
    if (!byRole[rid]) byRole[rid] = FIELDS.map(() => 0);
    FIELDS.forEach((f, i) => { byRole[rid][i] += Number(a[f]) || 0; });
  });

  const rids = Object.keys(byRole);
// Sort roles A-Z by role title
  rids.sort((a, b) => (roleMap[a] || '').localeCompare(roleMap[b] || ''));
  if (!rids.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>Pipeline Activity</h3>
    <p class='no-data'>No activity recorded for this period.</p>
  </div>`;

  const totals = FIELDS.map((_, i) => rids.reduce((s, r) => s + byRole[r][i], 0));
  const hdr    = `<tr><th>Role</th>${LABELS.map(l => `<th>${l}</th>`).join('')}</tr>`;
  const rows   = rids.map(rid =>
    `<tr><td>${roleMap[rid] || 'Unknown Role'}</td>${byRole[rid].map(v => `<td>${v}</td>`).join('')}</tr>`
  ).join('');
  const totRow = `<tr class='totals-row'><td><strong>Total</strong></td>${totals.map(v => `<td><strong>${v}</strong></td>`).join('')}</tr>`;

  return `<div class='dash-panel'>
    <h3 class='panel-title'>Pipeline Activity</h3>
    <table class='data-table'><thead>${hdr}</thead><tbody>${rows}${totRow}</tbody></table>
  </div>`;
}

// ── Activity by Talent Partner ────────────────────────────────────────
function renderActivityByTPPanel(acts, period) {
  const f = acts.filter(a => activityInDetailPeriod(a, period));
  const map = {};
  f.forEach(a => {
    const tp = a.TalentPartner || 'Unknown';
    if (!map[tp]) map[tp] = { Outreach:0, Submitted:0, Interview1:0, Offers:0, Hires:0 };
    ['Outreach','Submitted','Interview1','Offers','Hires'].forEach(k => { map[tp][k] += Number(a[k]) || 0; });
  });
  const tps = Object.keys(map);
// Sort Talent Partners A-Z
  tps.sort((a, b) => a.localeCompare(b));
  if (!tps.length) return `<div class='dash-panel'><h3 class='panel-title'>Activity by Talent Partner</h3><p class='no-data'>No activity in this period.</p></div>`;
  const rows = tps.map(tp =>
    `<tr><td>${tp}</td><td>${map[tp].Outreach}</td><td>${map[tp].Submitted}</td><td>${map[tp].Interview1}</td><td>${map[tp].Offers}</td><td>${map[tp].Hires}</td></tr>`
  ).join('');
  return `<div class='dash-panel'><h3 class='panel-title'>Activity by Talent Partner</h3>
    <table class='data-table'>
      <thead><tr><th>Talent Partner</th><th>Outreach</th><th>Submitted</th><th>Interview 1</th><th>Offers</th><th>Hires</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Offer Rejection Reasons ───────────────────────────────────────────
function renderRejectionPanel(rejections, roles, period) {
  const roleMap  = Object.fromEntries(roles.map(r => [String(r.id), r]));
  const { start, end } = getDetailPeriodRange(period);
  const filtered = rejections.filter(rej => {
    const rid  = String(rej.RoleIDLookupId || rej.RoleID || '');
    const role = roleMap[rid];
    if (!role || !role.ActualHireDate) return true;
    const d = new Date(role.ActualHireDate);
    return d >= start && d <= end;
  });
  const reasons = ['Salary','Motivations','Counter-offer','Took another opportunity','Other'];
  const counts  = reasons.map(r => filtered.filter(x => x.RejectionReason === r).length);
  const total   = counts.reduce((a, b) => a + b, 0);
  if (!total) return `<div class='dash-panel'><h3 class='panel-title'>Offer Rejection Reasons</h3><p class='no-data'>No rejections recorded for this period.</p></div>`;
  const rows = reasons.map((r, i) => counts[i] > 0 ?
    `<tr><td>${r}</td><td>${counts[i]}</td><td>${Math.round((counts[i]/total)*100)}%</td></tr>` : ''
  ).join('');
  return `<div class='dash-panel'><h3 class='panel-title'>Offer Rejection Reasons</h3>
    <table class='data-table'>
      <thead><tr><th>Reason</th><th>Count</th><th>%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Upcoming Starters ─────────────────────────────────────────────────
function renderUpcomingStartersPanel(placements, roles) {
  const roleMap = Object.fromEntries(roles.map(r => [String(r.id), r.RoleTitle]));
  const today   = new Date(); today.setHours(0,0,0,0);
  const upcoming = placements
    .filter(p => p.ProvisionalStartDate && new Date(p.ProvisionalStartDate) >= today)
    .sort((a, b) => new Date(a.ProvisionalStartDate) - new Date(b.ProvisionalStartDate));
  if (!upcoming.length) return `<div class='dash-panel'><h3 class='panel-title'>Upcoming Starters</h3><p class='no-data'>No upcoming starters.</p></div>`;
  const rows = upcoming.map(p =>
    `<tr><td>${p.CandidateName}</td><td>${roleMap[String(p.RoleIDLookupId)] || roleMap[String(p.RoleID)] || '—'}</td><td>${p.ProvisionalStartDate.split('T')[0]}</td></tr>`
  ).join('');
  return `<div class='dash-panel'><h3 class='panel-title'>Upcoming Starters</h3>
    <table class='data-table'>
      <thead><tr><th>Candidate</th><th>Role</th><th>Start Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Actual Spend vs Budget ────────────────────────────────────────────
function renderSpendPanel(roles, placements) {
  const budget = roles.filter(r => r.Budget).reduce((s, r) => s + (parseFloat(r.Budget) || 0), 0);
  const spend  = placements.filter(p => p.SalaryAgreed).reduce((s, p) => s + (parseFloat(p.SalaryAgreed) || 0), 0);
  const fmt    = n => n.toLocaleString('en-GB', { style:'currency', currency:'GBP', maximumFractionDigits:0 });
  const diff   = budget - spend;
  const dLabel = diff >= 0 ? `${fmt(diff)} under budget` : `${fmt(Math.abs(diff))} over budget`;
  const dColor = diff >= 0 ? '#107C10' : '#C00000';
  return `<div class='dash-panel'><h3 class='panel-title'>Actual Spend vs Budget</h3>
    <div class='spend-grid'>
      <div><div class='spend-label'>Budget</div><div class='spend-val'>${fmt(budget)}</div></div>
      <div><div class='spend-label'>Actual Spend</div><div class='spend-val'>${fmt(spend)}</div></div>
      <div><div class='spend-label'>Variance</div><div class='spend-val' style='color:${dColor}'>${dLabel}</div></div>
    </div>
  </div>`;
}

// ── Filter helpers ────────────────────────────────────────────────────
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

function detailPeriodDropdown() {
  const options = DETAIL_PERIOD_OPTIONS.map(([k, l]) =>
    `<option value='${k}' ${_dashDetailPeriod === k ? 'selected' : ''}>${l}</option>`
  ).join('');
  return `<div class='form-group detail-period-selector'>
    <label>Period</label>
    <select onchange='setDetailPeriod(this.value)'>${options}</select>
  </div>`;
}

// ── Main renderer ─────────────────────────────────────────────────────
async function renderProjectDashboard() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading dashboard...</p>';

  const user      = getCurrentUser();
  const role      = _resolvedRole;
  const isTP      = role === 'talent_partner';
  const isDMAdmin = ['delivery_manager', 'admin'].includes(role);
  let   projectId = _dashProjectId;

  if (isTP && !projectId) {
    const ids = await getUserProjectIds(user.email);
    projectId = ids && ids.length ? ids[0] : null;
    _dashProjectId = projectId;
  }

  let selectorHtml = '', projectName = 'Project';
  if (isDMAdmin) {
    const projects = await getScopedProjects(user.email, false);
    if (!projectId && projects.length) { projectId = String(projects[0].id); _dashProjectId = projectId; }
    projectName = (projects.find(p => String(p.id) === String(projectId)) || {}).CustomerName || 'Project';
    const opts = projects.map(p =>
      `<option value='${p.id}' ${String(p.id) === String(projectId) ? 'selected' : ''}>${p.CustomerName}</option>`
    ).join('');
    selectorHtml = `<div class='form-group dash-project-selector'><label>Project</label><select onchange='changeDashProject(this.value)'>${opts}</select></div>`;
  }

  if (!projectId) {
    main.innerHTML = `<div class='page-header'><h2>Project Dashboard</h2></div><p>No project assigned. Contact your Admin.</p>`;
    return;
  }

  const { roles, activity, placements, rejections } = await fetchDashboardData(projectId, role);

  const kpiPeriods = [['month','Month'],['quarter','Quarter'],['year','Year']];
  const kpiBtns    = periodButtons(kpiPeriods, _dashPeriod, 'setDashPeriod');

  const kpis        = renderKPIStrip(roles, activity, _dashPeriod);
  const pipelineAct = renderPipelineActivityTable(activity, roles, _dashDetailPeriod);
  const tpTable     = isDMAdmin ? renderActivityByTPPanel(activity, _dashDetailPeriod) : '';
  const rejPanel    = isDMAdmin ? renderRejectionPanel(rejections, roles, _dashDetailPeriod) : '';
  const starters    = isDMAdmin ? renderUpcomingStartersPanel(placements, roles) : '';
  const spend       = isDMAdmin ? renderSpendPanel(roles, placements) : '';

  main.innerHTML = `
    <div class='page-header'>
      <h2>Project Dashboard${isDMAdmin ? ' — ' + projectName : ''}</h2>
      <div class='page-header-actions'>
        <div class='filter-labeled-group'>
          <span class='filter-label'>KPI Period</span>
          <div class='filter-group'>${kpiBtns}</div>
        </div>
      </div>
    </div>
    ${selectorHtml}
    ${kpis}
    <div class='dash-detail-header'>
      ${detailPeriodDropdown()}
    </div>
    <div class='dash-grid'>
      ${pipelineAct}
      ${tpTable}
      ${rejPanel}
      ${starters}
      ${spend}
    </div>`;
}

function changeDashProject(id)   { _dashProjectId = String(id); renderProjectDashboard(); }
function setDashPeriod(period)   { _dashPeriod = period; renderProjectDashboard(); }
function setDetailPeriod(period) { _dashDetailPeriod = period; renderProjectDashboard(); }
