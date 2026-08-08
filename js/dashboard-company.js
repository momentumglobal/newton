// js/dashboard-company.js — Company Dashboard (Admin + Leadership cross-project rollup)
let _companyPeriod       = 'quarter';
let _companyDetailPeriod = 'this_month';
// ── Company KPI strip ─────────────────────────────────────────────────
function renderCompanyKPIStrip(allRoles, allActivity, allProjects, period) {
  const EXCLUDED = ['Backlog','Hired','Cancelled','On-hold'];
  const openRoles      = allRoles.filter(r => !EXCLUDED.includes(r.Stage)).length;
  const activeProjects = allProjects.filter(p => p.Status === 'Active').length;
  const acts      = allActivity.filter(a => activityInKpiPeriod(a, period));
  const submitted = sumField(acts, 'Submitted');
  const int1      = sumField(acts, 'Interview1');
  const offers    = sumField(acts, 'Offers');
  const hires     = sumField(acts, 'Hires');
  const convPct  = submitted > 0 ? Math.round((int1 / submitted) * 100) : null;
  const ivOfferR = offers > 0    ? Math.round(int1 / offers)            : null;
  const offerPct = offers > 0    ? Math.round((hires / offers) * 100)   : null;
  const periodRoles = allRoles.filter(r => roleHiredInKpiPeriod(r, period));
  const avgDays     = avgDaysToHire(periodRoles);
  const onTimePct   = hiredOnTimePct(periodRoles);
  const prevPeriod = getPreviousPeriod(period);
  const prevRange  = prevPeriod ? getDetailPeriodRange(prevPeriod) : null;
  let prevHires = null, prevConvPct = null, prevIvOfferR = null;
  let prevOfferPct = null, prevAvgDays = null, prevOnTimePct = null;
  if (prevRange) {
    const prevActs = allActivity.filter(a => {
      const date = a.WeekEndingDate
        ? new Date(a.WeekEndingDate)
        : weekEndingDate(Number(a.Year), Number(a.WeekNumber));
      return date >= prevRange.start && date <= prevRange.end;
    });
    const pSubmitted = sumField(prevActs, 'Submitted');
    const pInt1      = sumField(prevActs, 'Interview1');
    const pOffers    = sumField(prevActs, 'Offers');
    prevHires    = sumField(prevActs, 'Hires');
    prevConvPct  = pSubmitted > 0 ? Math.round((pInt1 / pSubmitted) * 100) : null;
    prevIvOfferR = pOffers > 0    ? Math.round(pInt1 / pOffers)            : null;
    prevOfferPct = pOffers > 0    ? Math.round((prevHires / pOffers) * 100): null;
    const prevPeriodRoles = allRoles.filter(r => {
      if (!r.ActualHireDate) return false;
      const d = new Date(r.ActualHireDate);
      return d >= prevRange.start && d <= prevRange.end;
    });
    prevAvgDays   = avgDaysToHire(prevPeriodRoles);
    prevOnTimePct = hiredOnTimePct(prevPeriodRoles);
  }
  const hiresDelta  = kpiDelta(hires,    prevHires,    false, false);
  const convDelta   = kpiDelta(convPct,  prevConvPct,  false, true);
  const ivDelta     = kpiDelta(ivOfferR, prevIvOfferR, true,  false);
  const offerDelta  = kpiDelta(offerPct, prevOfferPct, false, true);
  const daysDelta   = kpiDelta(avgDays,  prevAvgDays,  true,  false);
  const otDelta     = kpiDelta(onTimePct,prevOnTimePct,false, true);
  const periodLabel  = period === 'month' ? 'this month' : period === 'quarter' ? 'this quarter' : 'this year';
  const convDisplay  = convPct   !== null ? convPct + '%'   : '—';
  const ivDisplay    = ivOfferR  !== null ? ivOfferR + ':1' : '—';
  const offerDisplay = offerPct  !== null ? offerPct + '%'  : '—';
  const daysDisplay  = avgDays   !== null ? avgDays         : '—';
  const otDisplay    = onTimePct !== null ? onTimePct + '%' : '—';
  return `
    <div class='kpi-strip'>
      ${kpiCard('Active Projects', activeProjects, 'current')}
      ${kpiCard('Open Roles', openRoles, 'current')}
    </div>
    <div class='kpi-strip kpi-strip-period'>
      ${kpiCard('Hires',                 hires + hiresDelta,          periodLabel)}
      ${kpiCard('Submission Conversion', convDisplay  + convDelta,    periodLabel)}
      ${kpiCard('IV to Offer Ratio',     ivDisplay    + ivDelta,      periodLabel)}
      ${kpiCard('Offer Success',         offerDisplay + offerDelta,   periodLabel)}
      ${kpiCard('Avg Days to Hire',      daysDisplay  + daysDelta,    `hired roles · ${periodLabel}`)}
      ${kpiCard('Hired On Time',         otDisplay    + otDelta,      `within 45-day target · ${periodLabel}`)}
    </div>`;
}
// ── Roles open 30+ days panel (company) ──────────────────────────────
function renderLongOpenRolesPanel(allRoles, projectMap, tpMap = {}) {
  const EXCLUDED = ['Backlog','Hired','Cancelled','On-hold'];
  const today    = new Date(); today.setHours(0,0,0,0);
  const longOpen = allRoles
    .filter(r => {
      if (EXCLUDED.includes(r.Stage)) return false;
      if (!r.OpenDate) return false;
      const days = Math.floor((today - new Date(r.OpenDate)) / 86400000);
      return days >= 30;
    })
    .sort((a, b) => {
      const pA = projectMap[String(a.ProjectIDLookupId || a.ProjectID)] || '';
      const pB = projectMap[String(b.ProjectIDLookupId || b.ProjectID)] || '';
      return pA.localeCompare(pB);
    });
  if (!longOpen.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>Roles Open 30+ Days</h3>
    <p class='no-data'>No roles open 30+ days.</p>
  </div>`;
  const rows = longOpen.map(r => {
    const proj = projectMap[String(r.ProjectIDLookupId || r.ProjectID)] || '—';
    const days = Math.floor((today - new Date(r.OpenDate)) / 86400000);
    const rowClass = days >= 45 ? 'row-age-critical'
     : days >= 30 ? 'row-age-warning'
     : '';
    return `<tr class="${rowClass}">
     <td>${proj}</td>
     <td>${escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)}</td>
     <td>${escHtml(tpDisplay(r.TalentPartner, tpMap))}</td>
     <td><span class='badge'>${escHtml(r.Stage)}</span></td>
     <td>${days} days</td>
    </tr>`;
  }).join('');
  return `<div class='dash-panel'>
    <h3 class='panel-title'>Roles Open 30+ Days</h3>
    <table class='data-table'>
      <thead><tr><th>Project</th><th>Role</th><th>Talent Partner</th><th>Stage</th><th>Days Open</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
// ── Activity by Talent Partner (company-wide) ─────────────────────────
function renderCompanyTPPanel(allActivity, projectMap, roleProjectMap, period, tpMap = {}) {
  const filtered = allActivity.filter(a => activityInDetailPeriod(a, period));
  const map = {};
  filtered.forEach(a => {
    const tp  = a.TalentPartner || 'Unknown';
    const rid = String(a.RoleIDLookupId || a.RoleID || '');
    const pid = roleProjectMap[rid] || '';
    const key = `${pid}|${tp}`;
    if (!map[key]) map[key] = { project: projectMap[pid] || '—', tp, Outreach:0, Submitted:0, Interview1:0, Offers:0, Hires:0 };
    ['Outreach','Submitted','Interview1','Offers','Hires'].forEach(k => { map[key][k] += Number(a[k]) || 0; });
  });
  const keys = Object.keys(map).sort((a, b) => {
    const projCmp = map[a].project.localeCompare(map[b].project);
    if (projCmp !== 0) return projCmp;
    return map[a].tp.localeCompare(map[b].tp);
  });
  if (!keys.length) return `<div class='dash-panel'><h3 class='panel-title'>Activity by Talent Partner</h3><p class='no-data'>No activity in this period.</p></div>`;
  const rows = keys.map(k => {
    const d = map[k];
    return `<tr><td>${d.project}</td><td>${escHtml(tpMap[d.tp.toLowerCase()] || d.tp)}</td><td style="text-align:center">${d.Outreach}</td><td style="text-align:center">${d.Submitted}</td><td style="text-align:center">${d.Interview1}</td><td style="text-align:center">${d.Offers}</td><td style="text-align:center">${d.Hires}</td></tr>`;
  }).join('');
  return `<div class='dash-panel'><h3 class='panel-title'>Activity by Talent Partner</h3>
    <table class='data-table'>
      <thead><tr><th>Project</th><th>Talent Partner</th><th style="text-align:center">Outreach</th><th style="text-align:center">Submitted</th><th style="text-align:center">Interview 1</th><th style="text-align:center">Offers</th><th style="text-align:center">Hires</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
// ── Detail period dropdown (company) ─────────────────────────────────
function companyDetailPeriodDropdown() {
  const options = DETAIL_PERIOD_OPTIONS.map(([k, l]) =>
    `<option value='${k}' ${_companyDetailPeriod === k ? 'selected' : ''}>${l}</option>`
  ).join('');
  return `<div class='form-group detail-period-selector'>
    <label>Period</label>
    <select onchange='setCompanyDetailPeriod(this.value)'>${options}</select>
  </div>`;
}
// ── Main renderer ─────────────────────────────────────────────────────
async function renderCompanyDashboard() {
  const main = document.getElementById('main-content');
  main.innerHTML = dashboardSkeleton(8);
  const [allProjects, allRoles, allActivity, tpMap] = await Promise.all([
    getProjects(false),
    getAllRoles(),
    getWeeklyActivity(null, null),
    getTalentPartnerDisplayMap(),
  ]);
  const projectMap     = Object.fromEntries(allProjects.map(p => [String(p.id), escHtml(p.CustomerName)]));
  const roleProjectMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), String(r.ProjectIDLookupId || r.ProjectID || '')])
  );
  // Cache for period filter updates
  window._coCache = { projects: allProjects, roles: allRoles, activity: allActivity, projectMap, roleProjectMap, tpMap };
  const kpiPeriods = [['month','Month'],['quarter','Quarter'],['year','Year']];
  const kpiBtns    = periodButtons(kpiPeriods, _companyPeriod, 'setCompanyPeriod');
  const kpis     = renderCompanyKPIStrip(allRoles, allActivity, allProjects, _companyPeriod);
  const longOpen = renderLongOpenRolesPanel(allRoles, projectMap, tpMap);
  const tpPanel  = renderCompanyTPPanel(allActivity, projectMap, roleProjectMap, _companyDetailPeriod, tpMap);
  main.innerHTML = `
    <div class='page-header'>
      <h2>Company Dashboard</h2>
     <button class='print-btn' onclick='printPage("Company Dashboard", false, "Reporting")'>⎙ Export PDF</button>
</div>
    <div class='form-group dash-project-selector'>
      <label>KPI Period</label>
      <div class='filter-group' id='co-kpi-btns'>${kpiBtns}</div>
    </div>
    <div id='co-kpi-area'>${kpis}</div>
    ${longOpen}
    <div class='dash-detail-header'>
      ${companyDetailPeriodDropdown()}
    </div>
    <div id='co-detail-grid' class='dash-grid'>
      ${tpPanel}
    </div>`;
  runKpiCountUps(main);
}
function setCompanyPeriod(period) {
  _companyPeriod = period;
  const el = document.getElementById('co-kpi-area');
  if (el && window._coCache) {
  const c = window._coCache;
  el.innerHTML = renderCompanyKPIStrip(c.roles, c.activity, c.projects, _companyPeriod);
  runKpiCountUps(el);
  const btnsEl = document.getElementById('co-kpi-btns');
  if (btnsEl) btnsEl.innerHTML = periodButtons([['month','Month'],['quarter','Quarter'],['year','Year']], _companyPeriod, 'setCompanyPeriod');
} else {
    renderCompanyDashboard();
  }
}
function setCompanyDetailPeriod(period) {
  _companyDetailPeriod = period;
  const el = document.getElementById('co-detail-grid');
  if (el && window._coCache) {
  const c = window._coCache;
  const cleaned = renderCompanyTPPanel(
    c.activity, c.projectMap,
    c.roleProjectMap, _companyDetailPeriod, c.tpMap
  );
  el.innerHTML = cleaned.includes('no-data') ? '' : cleaned;
} else {
    renderCompanyDashboard();
  }
}
