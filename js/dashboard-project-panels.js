// js/dashboard-project-panels.js — Project Dashboard panel renderers + Report Builder registry
// N-310: `placements` = the dashboard's all-time placements, `hc` =
// dashboardHeadcountContext() (built here with a null headcount when absent).
function renderKPIStrip(roles, activity, period, placements = [], hc = null) {
  hc = hc || dashboardHeadcountContext(roles, placements, null);
  const openPipelines = roles.filter(r => isOpenPipelineStage(r.Stage));
  const activePipelines  = openPipelines.length;
  // S-4: one placement = one filled headcount. Counted against `roles` so a
  // caller passing an unscoped placements list (RB company scope) can't inflate it.
  const roleIdSet    = new Set(roles.map(r => String(r.id)));
  const totalHires   = placements.filter(p => roleIdSet.has(String(p.RoleIDLookupId)) || roleIdSet.has(String(p.RoleID))).length;
  const backlogPipelines = roles.filter(r => r.Stage === 'Backlog').length;
  const avgOpenDays  = avgOpenHeadcountDays(openPipelines, hc.headcount, hc.fillMap);
  // N-311 (S-2): open, dated headcount on the active pipelines; "—" when the
  // headcount read failed.
  const openHeadcount        = openHeadcountCount(openPipelines, hc.headcount, hc.fillMap);
  const openHeadcountDisplay = openHeadcount !== null ? openHeadcount : '—';
  const acts      = activity.filter(a => activityInKpiPeriod(a, period));
  const submitted = sumField(acts, 'Submitted');
  const int1      = sumField(acts, 'Interview1');
  const offers    = sumField(acts, 'Offers');
  const hires     = sumField(acts, 'Hires');
  const convPct  = submitted > 0 ? Math.round((int1 / submitted) * 100) : null;
  const ivOfferR = offers > 0    ? Math.round(int1 / offers)            : null;
  const offerPct = offers > 0    ? Math.round((hires / offers) * 100)   : null;
  const cur         = hireKpisForPeriod(hc.hires, 'this_' + period);
  const avgDays     = cur ? cur.avgDays : null;
  const onTimePct   = cur ? cur.onTimePct : null;
  const prevPeriod = getPreviousPeriod(period);
  const prevRange  = prevPeriod ? getDetailPeriodRange(prevPeriod) : null;
  const prevHireKpis = hireKpisForPeriod(hc.hires, prevPeriod);
  let prevConvPct = null, prevIvOfferR = null, prevOfferPct = null;
  const prevAvgDays   = prevHireKpis ? prevHireKpis.avgDays : null;
  const prevOnTimePct = prevHireKpis ? prevHireKpis.onTimePct : null;
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
      ${kpiCard('Active Pipelines', activePipelines, 'current')}
      ${kpiCard('Open Headcount', openHeadcountDisplay, 'current')}
      ${kpiCard('Pipeline Backlog', backlogPipelines, 'current')}
      ${kpiCard('Avg Days Open', avgOpenDaysDisplay, 'current')}
      ${kpiCard('Hires to Date', totalHires, 'all time')}
    </div>
    <div class='kpi-strip kpi-strip-period'>
      ${kpiCard('Submission Conversion', convDisplay + convDelta,   periodLabel)}
      ${kpiCard('IV to Offer Ratio',     ivDisplay   + ivDelta,     periodLabel)}
      ${kpiCard('Offer Success',         offerDisplay + offerDelta, periodLabel)}
      ${kpiCard('Avg Days to Hire',      daysDisplay  + daysDelta,  `per hire · ${periodLabel}`)}
      ${kpiCard('Hired On Time',         otDisplay    + otDelta,    `by target hire date · ${periodLabel}`)}
    </div>`;
}
// ── Pipeline Activity table ───────────────────────────────────────────
function renderPipelineActivityTable(acts, roles, period) {
  const filtered = acts.filter(a => activityInDetailPeriod(a, period));
  const FIELDS   = ['Outreach','Responses','Screened','Submitted','Interview1','Interview2Plus','FinalInterview','Offers','Hires'];
  const LABELS   = ['Outreach','Responses','Screened','Submitted','IV1','IV2+','Final IV','Offers','Hires'];
  const periodLabel = (DETAIL_PERIOD_OPTIONS.find(([k]) => k === period) || [])[1];
  const panelTitle  = periodLabel ? `Pipeline Activity (${periodLabel})` : 'Pipeline Activity';
  const roleMap  = Object.fromEntries(roles.map(r => [String(r.id), escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)]));
  const byRole = {};
  filtered.forEach(a => {
    const rid = String(a.RoleIDLookupId || a.RoleID || '');
    if (!byRole[rid]) byRole[rid] = FIELDS.map(() => 0);
    FIELDS.forEach((f, i) => { byRole[rid][i] += Number(a[f]) || 0; });
  });
  const rids = Object.keys(byRole).sort((a, b) => (roleMap[a] || '').localeCompare(roleMap[b] || ''));
  if (!rids.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>${panelTitle}</h3>
    ${emptyStateBlock({ icon: 'activity', message: 'No activity recorded for this period.' })}
  </div>`;
  const totals = FIELDS.map((_, i) => rids.reduce((s, r) => s + byRole[r][i], 0));
  const hdr    = `<tr><th>Role</th>${LABELS.map(l => `<th style="text-align:center">${l}</th>`).join('')}</tr>`;
  const rows   = rids.map(rid =>
    `<tr><td>${roleMap[rid] || 'Unknown Role'}</td>${byRole[rid].map(v => `<td style="text-align:center">${v}</td>`).join('')}</tr>`
  ).join('');
  const totRow = `<tr class='totals-row'><td><strong>Total</strong></td>${totals.map(v => `<td style="text-align:center"><strong>${v}</strong></td>`).join('')}</tr>`;
  return `<div class='dash-panel'>
    <h3 class='panel-title'>${panelTitle}</h3>
    <div class="table-scroll"><table class='data-table'><thead>${hdr}</thead><tbody>${rows}${totRow}</tbody></table></div>
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
    ${emptyStateBlock({ icon: 'bar-chart-2', message: 'No pipeline activity recorded in the last 4 weeks.' })}
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
    <div class="table-scroll"><table class='data-table'><thead>${hdr}</thead><tbody>${bodyRows}${totRow}</tbody></table></div>
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
  if (!tps.length) return `<div class='dash-panel'><h3 class='panel-title'>Activity by Talent Partner</h3>${emptyStateBlock({ icon: 'activity', message: 'No activity in this period.' })}</div>`;
  const rows = tps.map(tp =>
    `<tr><td>${escHtml(tpMap[tp.toLowerCase()] || tp)}</td><td style="text-align:center">${map[tp].Outreach}</td><td style="text-align:center">${map[tp].Submitted}</td><td style="text-align:center">${map[tp].Interview1}</td><td style="text-align:center">${map[tp].Offers}</td><td style="text-align:center">${map[tp].Hires}</td></tr>`
  ).join('');
  return `<div class='dash-panel'><h3 class='panel-title'>Activity by Talent Partner</h3>
    <div class="table-scroll">
    <table class='data-table'>
      <thead><tr><th>Talent Partner</th><th style="text-align:center">Outreach</th><th style="text-align:center">Submitted</th><th style="text-align:center">Interview 1</th><th style="text-align:center">Offers</th><th style="text-align:center">Hires</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}
// ── Offer Rejection Reasons ───────────────────────────────────────────
// N-153: was periodising through the LINKED ROLE's ActualHireDate, so any
// rejection whose role had no ActualHireDate returned true and was counted in
// EVERY period. Now uses the rejection's own date. The `roles` parameter goes
// with the roleMap it fed — the single caller is updated to match.
function renderRejectionPanel(rejections, period) {
  const { start, end } = getDetailPeriodRange(period);
  const filtered = rejections.filter(rej => {
    // A blank RejectionDate stays always-included, by decision: the two
    // pre-N-153 rows were not backfilled, and excluding them would silently
    // drop real rejections.
    if (!rej.RejectionDate) return true;
    // isoDate() stores T12:00:00Z — that midday anchor is what makes a plain
    // new Date() safe against these LOCAL period bounds. Do NOT switch to
    // utcDateOnly: UTC midnight against a local 23:59:59 end loses the last
    // day of every period in BST.
    const d = new Date(rej.RejectionDate);
    return d >= start && d <= end;
  });
  const reasons = ['Salary','Motivations','Counter-offer','Took another opportunity','Other'];
  const counts  = reasons.map(r => filtered.filter(x => x.RejectionReason === r).length);
  const total   = counts.reduce((a, b) => a + b, 0);
  if (!total) return `<div class='dash-panel'><h3 class='panel-title'>Offer Rejection Reasons</h3>${emptyStateBlock({ icon: 'user-x', message: 'No rejections recorded for this period.' })}</div>`;
  const rows = reasons.map((r, i) => counts[i] > 0 ?
    `<tr><td>${r}</td><td>${counts[i]}</td><td>${Math.round((counts[i]/total)*100)}%</td></tr>` : ''
  ).join('');
  return `<div class='dash-panel'><h3 class='panel-title'>Offer Rejection Reasons</h3>
    <div class="table-scroll">
    <table class='data-table'>
      <thead><tr><th>Reason</th><th>Count</th><th>%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}
// ── Upcoming Starters ─────────────────────────────────────────────────
function renderUpcomingStartersPanel(placements, roles) {
  const roleMap = Object.fromEntries(roles.map(r => [String(r.id), escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)]));
  const today   = new Date(); today.setHours(0,0,0,0);
  const upcoming = placements
    .filter(p => p.ProvisionalStartDate && new Date(p.ProvisionalStartDate) >= today)
    .sort((a, b) => new Date(a.ProvisionalStartDate) - new Date(b.ProvisionalStartDate));
  if (!upcoming.length) return `<div class='dash-panel'><h3 class='panel-title'>Upcoming Starters</h3>${emptyStateBlock({ icon: 'calendar', message: 'No upcoming starters.' })}</div>`;
  const rows = upcoming.map(p =>
    `<tr><td>${escHtml(p.CandidateName)}</td><td>${roleMap[String(p.RoleIDLookupId)] || roleMap[String(p.RoleID)] || '—'}</td><td>${spDateIn(p.ProvisionalStartDate) || '—'}</td></tr>`
  ).join('');
  return `<div class='dash-panel'><h3 class='panel-title'>Upcoming Starters</h3>
    <div class="table-scroll">
    <table class='data-table'>
      <thead><tr><th>Candidate</th><th>Role</th><th>Start Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}
// ── Actual Spend vs Budget ────────────────────────────────────────────
// N-310 (S-8): paired per placement — per-head budget × hires with a salary
// (budgetVsSpendByCurrency, analytics.js). Unpaired placements are counted
// in a footnote, never in one column only.
function renderSpendPanel(roles, placements) {
  const { rows: ccyRows, excluded } = budgetVsSpendByCurrency(roles, placements);
  if (!ccyRows.length) {
    return `<div class='dash-panel'><h3 class='panel-title'>Actual Spend vs Budget</h3>${emptyStateBlock({ icon: 'wallet', message: 'No budget data available.' })}</div>`;
  }
  const totalBudget = ccyRows.reduce((s, r) => s + r.budget, 0);
  const totalSpend  = ccyRows.reduce((s, r) => s + r.spend, 0);
  const overallPct  = totalBudget > 0 ? Math.round(((totalBudget - totalSpend) / totalBudget) * 100) : null;
  const overallLabel = overallPct === null ? '—'
    : overallPct >= 0 ? `${overallPct}% under budget` : `${Math.abs(overallPct)}% over budget`;
  // N-257b: on/under budget is neutral, not success-tinted.
  const overallColor = overallPct === null ? 'var(--text-label)' : overallPct >= 0 ? 'var(--text-secondary)' : 'var(--status-danger)';
  const SYMBOLS = { GBP: '£', EUR: '€', USD: '$', CAD: 'CA$', AUD: 'A$', SGD: 'S$', AED: 'AED', ZAR: 'R', LKR: 'LKR' };
  const fmt = (n, ccy) => {
    const sym = SYMBOLS[ccy] || ccy;
    return Math.round(n).toLocaleString('en-GB') + ' ' + sym;
  };
  const breakdownRows = ccyRows.map(({ ccy, budget, spend }) => {
    const diff   = budget - spend;
    const diffColor = diff >= 0 ? 'var(--text-secondary)' : 'var(--status-danger)';
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
    <div class="table-scroll">
    <table class='data-table'>
      <thead><tr><th>Location</th><th>Budget</th><th>Actual Spend</th><th>Variance</th></tr></thead>
      <tbody>${breakdownRows}</tbody>
    </table>
    </div>
    ${excluded > 0 ? `<p class='rb-footnote'>${excluded} ${excluded === 1 ? 'hire' : 'hires'} without salary or budget not counted</p>` : ''}
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
// N-310 (S-7): days since each pipeline's OLDEST OPEN headcount opened
// (pipelineOpenDay; openSince null → Roles.OpenDate fallback).
function renderProjectLongOpenRolesPanel(roles, tpMap = {}, openSince = null) {
  const longOpen = roles
    .map(r => ({ r, day: pipelineOpenDay(r, openSince) }))
    .filter(({ r, day }) => isOpenPipelineStage(r.Stage) && day && daysOpen(day) >= 30)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (!longOpen.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>Roles Open 30+ Days</h3>
    ${emptyStateBlock({ icon: 'briefcase', message: 'No roles open 30+ days.' })}
  </div>`;
  const rows = longOpen.map(({ r, day }) => {
    const days = daysOpen(day);
    // N-257b: no whole-row tint — the Days Open cell carries the flag instead.
    return `<tr>
     <td>${escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)}</td>
     <td>${escHtml(tpDisplay(r.TalentPartner, tpMap))}</td>
     <td><span class='badge'>${escHtml(r.Stage)}</span></td>
     <td>${ragTextHTML(days >= 45 ? 'red' : 'amber', days + ' days')}</td>
    </tr>`;
  }).join('');
  return `<div class='dash-panel'>
    <h3 class='panel-title'>Roles Open 30+ Days</h3>
    <div class="table-scroll">
    <table class='data-table'>
      <thead><tr><th>Role</th><th>Talent Partner</th><th>Stage</th><th>Days Open</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}
// ── Pipeline Tracker panel ────────────────────────────────────────────
// N-311: Headcount x/y (D-5) replaces Open Date. Days Open = days since the
// pipeline's oldest OPEN headcount (pipelineOpenDay — the value Roles Open
// 30+ Days shows); no open dated headcount sorts last. `hc` = the dashboard's
// dashboardHeadcountContext(); absent / headcount unavailable → Headcount "—"
// and Days Open falls back to Roles.OpenDate. The function keeps its name:
// the Report Builder key stays `roleTracker` (saved ModuleOrder JSON).
function renderRoleTrackerPanel(roles, hc = null) {
  hc = hc || dashboardHeadcountContext(roles, [], null);
  const byRole = hc.headcount ? groupHeadcountByRole(hc.headcount) : null;
  const active = roles
    .filter(r => isOpenPipelineStage(r.Stage))
    .map(r => ({ r, day: pipelineOpenDay(r, hc.openSince) }))
    .sort((a, b) => (a.day === null) - (b.day === null) || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (!active.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>Pipeline Tracker</h3>
    ${emptyStateBlock({ icon: 'briefcase', message: 'No active pipelines for this project.' })}
  </div>`;
  const rows = active.map(({ r, day }) => {
    const hcRows = byRole ? byRole.get(String(r.id)) : null;
    const counts = hcRows ? headcountCounts(hcRows, hc.fillMap) : null;
    const hcCell = counts
      ? `<td title="${escAttr(headcountXYTitle(counts))}">${headcountXY(counts)}</td>`
      : `<td>—</td>`;
    return `<tr>
      <td>${escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)}</td>
      <td>${escHtml(r.HiringManager || '—')}</td>
      <td><span class='badge'>${escHtml(r.Stage || '—')}</span></td>
      ${hcCell}
      <td>${day ? daysOpen(day) + ' days' : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class='dash-panel'>
    <h3 class='panel-title'>Pipeline Tracker</h3>
    <div class="table-scroll">
    <table class='data-table'>
      <thead><tr><th>Role</th><th>Hiring Manager</th><th>Stage</th><th>Headcount</th><th>Days Open</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}
// ── Placements panel (project-scoped, period-filtered) ────────────────
function renderPlacementsPanel(placements, roles, period) {
  const roleMap = Object.fromEntries(roles.map(r => [String(r.id), escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)]));
  const { start, end } = getDetailPeriodRange(period);
  const filtered = placements.filter(p => {
    if (!p.OfferAcceptedDate) return false;
    const d = new Date(p.OfferAcceptedDate);
    return d >= start && d <= end;
  }).sort((a, b) => new Date(b.OfferAcceptedDate) - new Date(a.OfferAcceptedDate));
  if (!filtered.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>Placements</h3>
    ${emptyStateBlock({ icon: 'user-check', message: 'No placements recorded for this period.' })}
  </div>`;
  const rows = filtered.map(p => `
    <tr>
      <td>${escHtml(p.CandidateName)}</td>
      <td>${roleMap[String(p.RoleIDLookupId)] || roleMap[String(p.RoleID)] || '—'}</td>
      <td>${spDateIn(p.OfferAcceptedDate) || '—'}</td>
      <td>${escHtml(p.Currency || '—')}</td>
      <td>${p.SalaryAgreed ? Number(p.SalaryAgreed).toLocaleString('en-GB') : '—'}</td>
    </tr>`).join('');
  return `<div class='dash-panel'>
    <h3 class='panel-title'>Placements</h3>
    <div class="table-scroll">
    <table class='data-table'>
      <thead><tr><th>Candidate</th><th>Role</th><th>Offer Accepted</th><th>Currency</th><th>Salary</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}

// ── Role Analytics panel (Phase A + B) ───────────────────────────────

async function renderRoleAnalyticsPanel(roles, activity, historical, tpMap = {}) {
  const activeRoles = roles.filter(r => isOpenPipelineStage(r.Stage));

  if (!activeRoles.length) {
    return `<div class='dash-panel'>
      <h3 class='panel-title'>Role Analytics</h3>
      ${emptyStateBlock({ icon: 'bar-chart-2', message: 'No roles to display.' })}
    </div>`;
  }

  // Build a cross-project role lookup for mapping activity records.
  // N-309: survival TTF counts headcount (ttfHeadcountInputs) — stage history,
  // headcount and every placement's HeadcountID fetched alongside allRoles
  // and built once, not per row. A failed read degrades to "no censoring"
  // rather than breaking the panel.
  const [allRoles, stageRows, headcount, placementIds] = await Promise.all([
    getAllRoles(),
    getRoleStageHistory().catch(e => { console.warn('N-276: stage history read failed', e); return []; }),
    getAllHeadcount().catch(e => { console.warn('N-309: headcount read failed', e); return []; }),
    getPlacementHeadcountIds().catch(e => { console.warn('N-309: placement headcount read failed', e); return []; }),
  ]);
  const { openHeadcount, closedCensored } = ttfHeadcountInputs({ roles: allRoles, headcount, placements: placementIds, stageRows });
  const allRoleMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), r])
  );
  // N-270: learned benchmarks — learning population is every role (this
  // panel judges live roles). Built once, not per row.
  const benchObs = buildFunnelObservations(activity, funnelRoleIndex(allRoles, 'Department', 'Location'));

    // Derive unique groups from live roles: key = "RoleTitle (Location)" or "RoleTitle"
  // (LinkTitle fallback removed in N-052 — computed system column, excluded by
  // the CONFIG.LIST_FIELDS projection; RoleTitle is the aliased Title.)
  const groupKey = r => escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : (r.RoleTitle || '—'));
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

    // N-270: leave-group-out — the group's own roles never count toward the
    // benchmark it is judged against.
    const groupIds = new Set(allRoles.filter(r => groupKey(r) === key).map(r => String(r.id)));
    const bench  = learnFunnelBenchmarks(benchObs, meta.department, meta.location, { exclude: o => groupIds.has(o.roleId) });
    const funnel = computeRoleFunnel(totals, bench);
    const ttf    = computeTTFPrediction(meta.department, meta.location, historical, openHeadcount, closedCensored);

    const flags = funnel.filter(s => s.benchmarked).map(s => s.rag);
    const worst = flags.includes('red') ? 'red'
      : flags.includes('amber') ? 'amber' : 'green';

    return { key, meta, funnel, ttf, worst, bench };
  });

  rows.sort((a, b) => a.key.localeCompare(b.key));

  const tableRows = rows.map(({ key, meta, funnel, ttf, bench }) => {
    // N-269: faded when pooled to function level or when there is no median.
    const ttfClass = (ttf.weeks === null || ttf.pooled) ? 'ttf-badge ttf-badge--low-data' : 'ttf-badge';
    const ttfOpen  = ttf.censored - ttf.closed;
    const ttfTip   = ttf.basis
      ? `Median time to hire (Kaplan–Meier): ${ttf.events} hire${ttf.events !== 1 ? 's' : ''}, ${ttfOpen} open headcount`
        + (ttf.closed ? `, ${ttf.closed} on hold/cancelled` : '') + ' counted'
        + (ttf.pooled ? ` — pooled across all locations for ${meta.department || 'this function'}` : '')
      : `Fewer than ${CONFIG.TTF_SURVIVAL.minEvents} hires in the last 12 months for this function`;
    const ttfCell  = `<td class='ra-ttf' style="text-align:center"><span class='${ttfClass}' title="${escHtml(ttfTip)}">${ttf.label}</span></td>`;

    const flagCells = funnel.filter(s => s.benchmarked).map((s, i) => {
      const label = s.conv !== null ? `${s.conv}%` : '—';
      const tip   = escHtml(learnedBenchmarkTip(bench, LEARNED_RATES[i].key));
      return `<td class='ra-cell' title="${tip}"><strong>${label}</strong></td>`;
    }).join('');

    return `<tr>
      <td class='ra-role'>${key}</td>
      ${ttfCell}${flagCells}
    </tr>`;
  }).join('');

  return `<div class='dash-panel'>
    <h3 class='panel-title'>Role Analytics</h3>
    <div class="table-scroll">
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
    </div>
  </div>`;
}

// ── Report Builder Panel Registry ──────────────────────────────────
const REPORT_PANELS = {
  kpiStrip: (data, period, kpiPeriod) =>
    renderKPIStrip(data.roles, data.activity, kpiPeriod || 'quarter', data.placements || [], data.hc || null),

  pipelineActivity: (data, period) =>
    renderPipelineActivityTable(data.activity, data.roles, period),

  pipelineSummary: (data) =>
    renderPipelineSummaryPanel(data.activity),

  activityByTP: (data, period) =>
    renderActivityByTPPanel(data.activity, period, data.tpMap || {}),

  rejections: (data, period) =>
    renderRejectionPanel(data.rejections, period),

  upcomingStarters: (data) =>
    renderUpcomingStartersPanel(data.placements, data.roles),

  spendVsBudget: (data) =>
    renderSpendPanel(data.roles, data.placements),

  rolesOpen30: (data) =>
    renderProjectLongOpenRolesPanel(data.roles, data.tpMap || {}, data.hc ? data.hc.openSince : null),

  roleTracker: (data) =>
    renderRoleTrackerPanel(data.roles, data.hc || null),

  placements: (data, period) =>
    renderPlacementsPanel(data.placements, data.roles, period),
};
