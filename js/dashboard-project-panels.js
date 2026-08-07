// js/dashboard-project-panels.js — Project Dashboard panel renderers + Report Builder registry
function renderKPIStrip(roles, activity, period) {
  const openRoles    = roles.filter(r => !['Backlog','Hired','Cancelled','On-hold'].includes(r.Stage)).length;
  const totalHires   = sumField(activity, 'Hires');
  const backlogRoles = roles.filter(r => r.Stage === 'Backlog').length;
  const avgOpenDays  = avgDaysOpen(roles);
  const acts      = activity.filter(a => activityInKpiPeriod(a, period));
  const submitted = sumField(acts, 'Submitted');
  const int1      = sumField(acts, 'Interview1');
  const offers    = sumField(acts, 'Offers');
  const hires     = sumField(acts, 'Hires');
  const convPct  = submitted > 0 ? Math.round((int1 / submitted) * 100) : null;
  const ivOfferR = offers > 0    ? Math.round(int1 / offers)            : null;
  const offerPct = offers > 0    ? Math.round((hires / offers) * 100)   : null;
  const periodRoles = roles.filter(r => roleHiredInKpiPeriod(r, period));
  const avgDays     = avgDaysToHire(periodRoles);
  const onTimePct   = hiredOnTimePct(periodRoles);
  const prevPeriod = getPreviousPeriod(period);
  const prevRange  = prevPeriod ? getDetailPeriodRange(prevPeriod) : null;
  let prevConvPct = null, prevIvOfferR = null, prevOfferPct = null;
  let prevAvgDays = null, prevOnTimePct = null;
  if (prevRange) {
    const prevActs = activity.filter(a => {
      const date = a.WeekEndingDate
        ? new Date(a.WeekEndingDate)
        : weekEndingDate(Number(a.Year), Number(a.WeekNumber));
      return date >= prevRange.start && date <= prevRange.end;
    });
    const pSubmitted = sumField(prevActs, 'Submitted');
    const pInt1      = sumField(prevActs, 'Interview1');
    const pOffers    = sumField(prevActs, 'Offers');
    const pHires     = sumField(prevActs, 'Hires');
    prevConvPct  = pSubmitted > 0 ? Math.round((pInt1 / pSubmitted) * 100) : null;
    prevIvOfferR = pOffers > 0    ? Math.round(pInt1 / pOffers)            : null;
    prevOfferPct = pOffers > 0    ? Math.round((pHires / pOffers) * 100)   : null;
    const prevPeriodRoles = roles.filter(r => {
      if (!r.ActualHireDate) return false;
      const d = new Date(r.ActualHireDate);
      return d >= prevRange.start && d <= prevRange.end;
    });
    prevAvgDays   = avgDaysToHire(prevPeriodRoles);
    prevOnTimePct = hiredOnTimePct(prevPeriodRoles);
  }
  const periodLabel  = period === 'month' ? 'this month' : period === 'quarter' ? 'this quarter' : 'this year';
  const convDisplay  = convPct  !== null ? convPct + '%'   : '—';
  const ivDisplay    = ivOfferR !== null ? ivOfferR + ':1' : '—';
  const offerDisplay = offerPct !== null ? offerPct + '%'  : '—';
    const daysDisplay  = avgDays  !== null ? avgDays         : '—';
  const otDisplay    = onTimePct !== null ? onTimePct + '%' : '—';
  const avgOpenDaysDisplay = avgOpenDays !== null ? avgOpenDays : '—';
  const convDelta  = kpiDelta(convPct,  prevConvPct,  false, true);
  const ivDelta    = kpiDelta(ivOfferR, prevIvOfferR, true,  false);
  const offerDelta = kpiDelta(offerPct, prevOfferPct, false, true);
  const daysDelta  = kpiDelta(avgDays,  prevAvgDays,  true,  false);
  const otDelta    = kpiDelta(onTimePct,prevOnTimePct,false, true);
  return `
    <div class='kpi-strip'>
      ${kpiCard('Open Roles', openRoles, 'current')}
      ${kpiCard('Role Backlog', backlogRoles, 'current')}
      ${kpiCard('Avg Days Open', avgOpenDaysDisplay, 'current')}
      ${kpiCard('Hires to Date', totalHires, 'all time')}
      ${kpiCard('Avg Days to Hire',      daysDisplay  + daysDelta,  `hired roles · ${periodLabel}`)}
    </div>
    <div class='kpi-strip kpi-strip-period'>
      ${kpiCard('Submission Conversion', convDisplay + convDelta,   periodLabel)}
      ${kpiCard('IV to Offer Ratio',     ivDisplay   + ivDelta,     periodLabel)}
      ${kpiCard('Offer Success',         offerDisplay + offerDelta, periodLabel)}
      ${kpiCard('Hired On Time',         otDisplay    + otDelta,    `within 45-day target · ${periodLabel}`)}
    </div>`;
}
// ── Pipeline Activity table ───────────────────────────────────────────
function renderPipelineActivityTable(acts, roles, period) {
  const filtered = acts.filter(a => activityInDetailPeriod(a, period));
  const FIELDS   = ['Outreach','Responses','Screened','Submitted','Interview1','Interview2Plus','FinalInterview','Offers','Hires'];
  const LABELS   = ['Outreach','Responses','Screened','Submitted','IV1','IV2+','Final IV','Offers','Hires'];
  const periodLabel = (DETAIL_PERIOD_OPTIONS.find(([k]) => k === period) || [])[1];
  const panelTitle  = periodLabel ? `Pipeline Activity (${periodLabel})` : 'Pipeline Activity';
  const roleMap  = Object.fromEntries(roles.map(r => [String(r.id), r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle]));
  const byRole = {};
  filtered.forEach(a => {
    const rid = String(a.RoleIDLookupId || a.RoleID || '');
    if (!byRole[rid]) byRole[rid] = FIELDS.map(() => 0);
    FIELDS.forEach((f, i) => { byRole[rid][i] += Number(a[f]) || 0; });
  });
  const rids = Object.keys(byRole).sort((a, b) => (roleMap[a] || '').localeCompare(roleMap[b] || ''));
  if (!rids.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>${panelTitle}</h3>
    <p class='no-data'>No activity recorded for this period.</p>
  </div>`;
  const totals = FIELDS.map((_, i) => rids.reduce((s, r) => s + byRole[r][i], 0));
  const hdr    = `<tr><th>Role</th>${LABELS.map(l => `<th style="text-align:center">${l}</th>`).join('')}</tr>`;
  const rows   = rids.map(rid =>
    `<tr><td>${roleMap[rid] || 'Unknown Role'}</td>${byRole[rid].map(v => `<td style="text-align:center">${v}</td>`).join('')}</tr>`
  ).join('');
  const totRow = `<tr class='totals-row'><td><strong>Total</strong></td>${totals.map(v => `<td style="text-align:center"><strong>${v}</strong></td>`).join('')}</tr>`;
  return `<div class='dash-panel'>
    <h3 class='panel-title'>${panelTitle}</h3>
    <table class='data-table'><thead>${hdr}</thead><tbody>${rows}${totRow}</tbody></table>
  </div>`;
}

// ── Pipeline Summary (last 4 completed weeks, all roles) ──────────────
// Report Builder module. Hardcoded to the last 4 completed calendar weeks,
// most recent first. Week buckets run Mon–Sun (the activity form stores
// WeekEndingDate as the Sunday) but are LABELLED Mon–Fri. Leading empty
// weeks (project not yet live) are trimmed; interior/trailing empty weeks
// render as a full '–' row.
function renderPipelineSummaryPanel(activity) {
  const FIELDS = ['Outreach','Responses','Screened','Submitted','Interview1','Interview2Plus','FinalInterview','Offers','Hires'];
  const LABELS = ['Outreach','Responses','Screened','Submitted','IV1 Booked','IV2+ Booked','Final IV Booked','Offer Made','Hired'];

  const now = new Date();
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - dow);
  thisMonday.setHours(0, 0, 0, 0);

  const weeks = [];
  for (let i = 1; i <= 4; i++) {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() - (7 * i));
    const friday = new Date(monday);              // for the displayed label (Mon–Fri)
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);
    const weekEnd = new Date(monday);             // ← CHANGED: bucket boundary = Sunday,
    weekEnd.setDate(monday.getDate() + 6);        //   matching how WeekEndingDate is stored
    weekEnd.setHours(23, 59, 59, 999);
    weeks.push({ monday, friday, weekEnd });
  }

  const dateOf = a => a.WeekEndingDate
    ? new Date(a.WeekEndingDate)
    : weekEndingDate(Number(a.Year), Number(a.WeekNumber));

  const rows = weeks.map(w => {
    const inWeek = activity.filter(a => {
      const d = dateOf(a);
      return d >= w.monday && d <= w.weekEnd;     // ← CHANGED: Sunday cutoff, not Friday
    });
    const totals = FIELDS.map(f => sumField(inWeek, f));
    const hasData = inWeek.length > 0 && totals.some(v => v > 0);
    return { ...w, totals, hasData };
  });

  let trimmed = [...rows];
  while (trimmed.length && !trimmed[trimmed.length - 1].hasData) {
    trimmed.pop();
  }

  if (!trimmed.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>Pipeline Summary (last 4 weeks)</h3>
    <p class='no-data'>No pipeline activity recorded in the last 4 weeks.</p>
  </div>`;

  const ord = n => {
    const s = ['th','st','nd','rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const rangeLabel = (mon, fri) => {
    const dM = ord(mon.getDate()), dF = ord(fri.getDate());
    const mM = MONTHS[mon.getMonth()], mF = MONTHS[fri.getMonth()];
    return mon.getMonth() === fri.getMonth()
      ? `${dM} – ${dF} ${mF}`
      : `${dM} ${mM} – ${dF} ${mF}`;
  };

  const colTotals = FIELDS.map((_, i) => trimmed.reduce((s, r) => s + r.totals[i], 0));

  const hdr = `<tr><th>Week</th>${LABELS.map(l => `<th style="text-align:center">${l}</th>`).join('')}</tr>`;

  const bodyRows = trimmed.map(r => {
    const cells = r.totals.map(v => `<td style="text-align:center">${v > 0 ? v : '–'}</td>`).join('');
    return `<tr><td>${rangeLabel(r.monday, r.friday)}</td>${cells}</tr>`;
  }).join('');

  const totalCells = colTotals.map((v, i) => {
    if (i === 0) return `<td style="text-align:center"><strong>${v}</strong></td>`;
    const prev = colTotals[i - 1];
    const pct  = prev > 0 ? `<br>(${Math.round((v / prev) * 100)}%)` : '';
    return `<td style="text-align:center"><strong>${v}</strong>${pct}</td>`;
  }).join('');
  const totRow = `<tr class='totals-row'><td><strong>Total</strong></td>${totalCells}</tr>`;

  return `<div class='dash-panel'>
    <h3 class='panel-title'>Pipeline Summary (last 4 weeks)</h3>
    <table class='data-table'><thead>${hdr}</thead><tbody>${bodyRows}${totRow}</tbody></table>
  </div>`;
}

// ── Activity by Talent Partner ────────────────────────────────────────
function renderActivityByTPPanel(acts, period, tpMap = {}) {
  const f = acts.filter(a => activityInDetailPeriod(a, period));
  const map = {};
  f.forEach(a => {
    const tp = a.TalentPartner || 'Unknown';
    if (!map[tp]) map[tp] = { Outreach:0, Submitted:0, Interview1:0, Offers:0, Hires:0 };
    ['Outreach','Submitted','Interview1','Offers','Hires'].forEach(k => { map[tp][k] += Number(a[k]) || 0; });
  });
  const tps = Object.keys(map);
  if (!tps.length) return `<div class='dash-panel'><h3 class='panel-title'>Activity by Talent Partner</h3><p class='no-data'>No activity in this period.</p></div>`;
  const rows = tps.map(tp =>
    `<tr><td>${tpMap[tp.toLowerCase()] || tp}</td><td style="text-align:center">${map[tp].Outreach}</td><td style="text-align:center">${map[tp].Submitted}</td><td style="text-align:center">${map[tp].Interview1}</td><td style="text-align:center">${map[tp].Offers}</td><td style="text-align:center">${map[tp].Hires}</td></tr>`
  ).join('');
  return `<div class='dash-panel'><h3 class='panel-title'>Activity by Talent Partner</h3>
    <table class='data-table'>
      <thead><tr><th>Talent Partner</th><th style="text-align:center">Outreach</th><th style="text-align:center">Submitted</th><th style="text-align:center">Interview 1</th><th style="text-align:center">Offers</th><th style="text-align:center">Hires</th></tr></thead>
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
  const roleMap = Object.fromEntries(roles.map(r => [String(r.id), r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle]));
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
  // Only consider roles that have at least one placement
  const placedRoleIds = new Set(placements.map(p => String(p.RoleIDLookupId || p.RoleID || '')));
  const placedRoles = roles.filter(r => placedRoleIds.has(String(r.id)));

  const roleCurrencyMap = Object.fromEntries(
    roles.map(r => [String(r.id), CONFIG.COUNTRY_CURRENCY[r.Location] || 'GBP'])
  );
  const currencies = [...new Set(placedRoles.filter(r => r.Budget).map(r => CONFIG.COUNTRY_CURRENCY[r.Location] || 'GBP'))];
  if (!currencies.length) {
    return `<div class='dash-panel'><h3 class='panel-title'>Actual Spend vs Budget</h3><p class='no-data'>No budget data available.</p></div>`;
  }
  const totalBudget = placedRoles.filter(r => r.Budget).reduce((s, r) => s + (parseFloat(r.Budget) || 0), 0);
  const totalSpend  = placements.filter(p => p.SalaryAgreed).reduce((s, p) => s + (parseFloat(p.SalaryAgreed) || 0), 0);
  const overallPct  = totalBudget > 0 ? Math.round(((totalBudget - totalSpend) / totalBudget) * 100) : null;
  const overallLabel = overallPct === null ? '—'
    : overallPct >= 0 ? `${overallPct}% under budget` : `${Math.abs(overallPct)}% over budget`;
  const overallColor = overallPct === null ? '#666' : overallPct >= 0 ? '#107C10' : '#C00000';
  const SYMBOLS = { GBP: '£', EUR: '€', USD: '$', CAD: 'CA$', AUD: 'A$', SGD: 'S$', AED: 'AED', ZAR: 'R', LKR: 'LKR' };
  const fmt = (n, ccy) => {
    const sym = SYMBOLS[ccy] || ccy;
    return Math.round(n).toLocaleString('en-GB') + ' ' + sym;
  };
  const breakdownRows = currencies.map(ccy => {
    const ccyRoles = placedRoles.filter(r => (CONFIG.COUNTRY_CURRENCY[r.Location] || 'GBP') === ccy && r.Budget);
    const ccyPlacements = placements.filter(p => {
      const rid = String(p.RoleIDLookupId || p.RoleID || '');
      return (roleCurrencyMap[rid] || 'GBP') === ccy && p.SalaryAgreed;
    });
    const budget = ccyRoles.reduce((s, r) => s + (parseFloat(r.Budget) || 0), 0);
    const spend  = ccyPlacements.reduce((s, p) => s + (parseFloat(p.SalaryAgreed) || 0), 0);
    const diff   = budget - spend;
    const diffColor = diff >= 0 ? '#107C10' : '#C00000';
    const diffLabel = diff >= 0 ? `${fmt(diff, ccy)} under` : `${fmt(Math.abs(diff), ccy)} over`;
    return `<tr>
      <td><strong>${ccy}</strong></td>
      <td>${fmt(budget, ccy)}</td>
      <td>${fmt(spend, ccy)}</td>
      <td style="color:${diffColor}">${diffLabel}</td>
    </tr>`;
  }).join('');
  return `<div class='dash-panel'>
    <h3 class='panel-title'>Actual Spend vs Budget</h3>
    <div style="margin-bottom:16px">
      <div class='spend-label'>Overall Variance</div>
      <div class='spend-val' style='color:${overallColor}'>${overallLabel}</div>
    </div>
    <table class='data-table'>
      <thead><tr><th>Location</th><th>Budget</th><th>Actual Spend</th><th>Variance</th></tr></thead>
      <tbody>${breakdownRows}</tbody>
    </table>
  </div>`;
}
// ── Detail period dropdown (project) ──────────────────────────────────
function detailPeriodDropdown() {
  const options = DETAIL_PERIOD_OPTIONS.map(([k, l]) =>
    `<option value='${k}' ${_dashDetailPeriod === k ? 'selected' : ''}>${l}</option>`
  ).join('');
  return `<div class='form-group detail-period-selector'>
    <label>Period</label>
    <select onchange='setDetailPeriod(this.value)'>${options}</select>
  </div>`;
}
// ── Roles open 30+ days panel (project-scoped) ────────────────────────
function renderProjectLongOpenRolesPanel(roles, tpMap = {}) {
  const EXCLUDED = ['Backlog','Hired','Cancelled','On-hold'];
  const today    = new Date(); today.setHours(0,0,0,0);
  const longOpen = roles
    .filter(r => {
      if (EXCLUDED.includes(r.Stage)) return false;
      if (!r.OpenDate) return false;
      const days = Math.floor((today - new Date(r.OpenDate)) / 86400000);
      return days >= 30;
    })
    .sort((a, b) => new Date(a.OpenDate) - new Date(b.OpenDate));
  if (!longOpen.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>Roles Open 30+ Days</h3>
    <p class='no-data'>No roles open 30+ days.</p>
  </div>`;
  const rows = longOpen.map(r => {
    const days = Math.floor((today - new Date(r.OpenDate)) / 86400000);
    const rowClass = days >= 45 ? 'row-age-critical' : 'row-age-warning';
    return `<tr class="${rowClass}">
     <td>${r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle}</td>
     <td>${tpDisplay(r.TalentPartner, tpMap)}</td>
     <td><span class='badge'>${r.Stage}</span></td>
     <td>${days} days</td>
    </tr>`;
  }).join('');
  return `<div class='dash-panel'>
    <h3 class='panel-title'>Roles Open 30+ Days</h3>
    <table class='data-table'>
      <thead><tr><th>Role</th><th>Talent Partner</th><th>Stage</th><th>Days Open</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
// ── Role Tracker panel ────────────────────────────────────────────────
function renderRoleTrackerPanel(roles) {
  const EXCLUDED = ['Backlog','Hired','Cancelled','On-hold'];
  const today = new Date(); today.setHours(0,0,0,0);
  const active = roles
    .filter(r => !EXCLUDED.includes(r.Stage))
    .sort((a, b) => new Date(a.OpenDate || 0) - new Date(b.OpenDate || 0));
  if (!active.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>Role Tracker</h3>
    <p class='no-data'>No active roles for this project.</p>
  </div>`;
  const rows = active.map(r => {
    const days = r.OpenDate
      ? Math.floor((today - new Date(r.OpenDate)) / 86400000)
      : null;
    return `<tr>
      <td>${r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle}</td>
      <td>${r.HiringManager || '—'}</td>
      <td><span class='badge'>${r.Stage || '—'}</span></td>
      <td>${r.OpenDate ? r.OpenDate.split('T')[0] : '—'}</td>
      <td>${days !== null ? days + ' days' : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class='dash-panel'>
    <h3 class='panel-title'>Role Tracker</h3>
    <table class='data-table'>
      <thead><tr><th>Role</th><th>Hiring Manager</th><th>Stage</th><th>Open Date</th><th>Days Open</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
// ── Placements panel (project-scoped, period-filtered) ────────────────
function renderPlacementsPanel(placements, roles, period) {
  const roleMap = Object.fromEntries(roles.map(r => [String(r.id), r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle]));
  const { start, end } = getDetailPeriodRange(period);
  const filtered = placements.filter(p => {
    if (!p.OfferAcceptedDate) return false;
    const d = new Date(p.OfferAcceptedDate);
    return d >= start && d <= end;
  }).sort((a, b) => new Date(b.OfferAcceptedDate) - new Date(a.OfferAcceptedDate));
  if (!filtered.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>Placements</h3>
    <p class='no-data'>No placements recorded for this period.</p>
  </div>`;
  const rows = filtered.map(p => `
    <tr>
      <td>${p.CandidateName}</td>
      <td>${roleMap[String(p.RoleIDLookupId)] || roleMap[String(p.RoleID)] || '—'}</td>
      <td>${p.OfferAcceptedDate ? p.OfferAcceptedDate.split('T')[0] : '—'}</td>
      <td>${p.Currency || '—'}</td>
      <td>${p.SalaryAgreed ? Number(p.SalaryAgreed).toLocaleString('en-GB') : '—'}</td>
    </tr>`).join('');
  return `<div class='dash-panel'>
    <h3 class='panel-title'>Placements</h3>
    <table class='data-table'>
      <thead><tr><th>Candidate</th><th>Role</th><th>Offer Accepted</th><th>Currency</th><th>Salary</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Role Analytics panel (Phase A + B) ───────────────────────────────

async function renderRoleAnalyticsPanel(roles, activity, historical, tpMap = {}) {
  const b = CONFIG.ANALYTICS_BENCHMARKS;
  const EXCLUDED = ['Backlog', 'Cancelled', 'On-hold', 'Hired'];
  const activeRoles = roles.filter(r => !EXCLUDED.includes(r.Stage));

  if (!activeRoles.length) {
    return `<div class='dash-panel'>
      <h3 class='panel-title'>Role Analytics</h3>
      <p class='no-data'>No roles to display.</p>
    </div>`;
  }

  // Build a cross-project role lookup for mapping activity records
  const allRoles = await getAllRoles();
  const allRoleMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), r])
  );

    // Derive unique groups from live roles: key = "RoleTitle (Location)" or "RoleTitle"
  // (LinkTitle fallback removed in N-052 — computed system column, excluded by
  // the CONFIG.LIST_FIELDS projection; RoleTitle is the aliased Title.)
  const groupKey = r => r.Location ? `${r.RoleTitle} (${r.Location})` : (r.RoleTitle || '—');
  const groupMeta = {}; // key → { department, location, roleTitle }
  activeRoles.forEach(r => {
    const key = groupKey(r);
    if (!groupMeta[key]) groupMeta[key] = { department: r.Department, location: r.Location, roleTitle: r.RoleTitle };
  });

  const rows = Object.entries(groupMeta).map(([key, meta]) => {
    // Funnel: all historical activity where the role matches this RoleTitle + Location
    const acts = activity.filter(a => {
      const r = allRoleMap[String(a.RoleIDLookupId || a.RoleID || '')];
      if (!r) return false;
      return groupKey(r) === key;
    });
    const totals = {};
    ['Outreach','Responses','Screened','Submitted',
     'Interview1','Interview2Plus','FinalInterview',
     'Offers','Hires'].forEach(f => {
      totals[f] = sumField(acts, f);
    });

    const funnel = computeRoleFunnel(totals, b);
    const ttf    = computeTTFPrediction(meta.department, meta.location, historical);

    const flags = funnel.filter(s => s.benchmarked).map(s => s.rag);
    const worst = flags.includes('red') ? 'red'
      : flags.includes('amber') ? 'amber' : 'green';

    return { key, funnel, ttf, worst };
  });

  rows.sort((a, b) => a.key.localeCompare(b.key));

  const tableRows = rows.map(({ key, funnel, ttf }) => {
    const ttfClass = ttf.sampleSize >= 3 ? 'ttf-badge' : 'ttf-badge ttf-badge--low-data';
    const ttfCell  = `<td class='ra-ttf' style="text-align:center"><span class='${ttfClass}'>${ttf.label}</span></td>`;

    const flagCells = funnel.filter(s => s.benchmarked).map(s => {
      const label = s.conv !== null ? `${s.conv}%` : '—';
      return `<td class='ra-cell'><strong>${label}</strong></td>`;
    }).join('');

    return `<tr>
      <td class='ra-role'>${key}</td>
      ${ttfCell}${flagCells}
    </tr>`;
  }).join('');

  return `<div class='dash-panel'>
    <h3 class='panel-title'>Role Analytics</h3>
    <table class='data-table ra-table'>
      <thead><tr>
        <th>Role</th>
        <th style="text-align:center">Time-to-Hire Prediction</th>
        <th style="text-align:center">Outreach Response</th>
        <th style="text-align:center">Submission Conv.</th>
        <th style="text-align:center">IV → Offer</th>
        <th style="text-align:center">Offer Success</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
}

// ── Report Builder Panel Registry ──────────────────────────────────
const REPORT_PANELS = {
  kpiStrip: (data, period, kpiPeriod) =>
    renderKPIStrip(data.roles, data.activity, kpiPeriod || 'quarter'),

  pipelineActivity: (data, period) =>
    renderPipelineActivityTable(data.activity, data.roles, period),

  pipelineSummary: (data) =>
    renderPipelineSummaryPanel(data.activity),

  activityByTP: (data, period) =>
    renderActivityByTPPanel(data.activity, period, data.tpMap || {}),

  rejections: (data, period) =>
    renderRejectionPanel(data.rejections, data.roles, period),

  upcomingStarters: (data) =>
    renderUpcomingStartersPanel(data.placements, data.roles),

  spendVsBudget: (data) =>
    renderSpendPanel(data.roles, data.placements),

  rolesOpen30: (data) =>
    renderProjectLongOpenRolesPanel(data.roles, data.tpMap || {}),

  roleTracker: (data) =>
    renderRoleTrackerPanel(data.roles),

  placements: (data, period) =>
    renderPlacementsPanel(data.placements, data.roles, period),
};
