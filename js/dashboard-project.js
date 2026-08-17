// js/dashboard-project.js — Project Dashboard entry / orchestration
// ── Main renderer ─────────────────────────────────────────────────────
async function renderProjectDashboard() {
  const main = document.getElementById('main-content');
  main.innerHTML = dashboardSkeleton(6);
  const user      = getCurrentUser();
  const role      = _resolvedRole;
  const isTP      = role === 'talent_partner';
  const isDMAdmin = ['delivery_manager', 'admin'].includes(role) || hasDMGrant();
  let   projectId = _dashProjectId;
  if (isTP && !projectId) {
    const ids = await getUserProjectIds(user.email);
    projectId = ids && ids.length ? ids[0] : null;
    _dashProjectId = projectId;
  }
  let selectorHtml = '', projectName = 'Project';
  if (isDMAdmin) {
    const projects = sortProjectsByName(await getScopedProjects(user.email, false));
    if (!projectId && projects.length) { projectId = String(projects[0].id); _dashProjectId = projectId; }
    projectName = (projects.find(p => String(p.id) === String(projectId)) || {}).CustomerName || 'Project';
    // N-112: Active/Archive optgroup split (projects already sorted, so each
    // filtered subgroup stays A-Z).
    const activeProjects  = projects.filter(isProjectActive);
    const archiveProjects = projects.filter(p => !isProjectActive(p));
    const opts = [
      activeProjects.length  ? `<optgroup label="Active">${buildProjectOptionsHtml(activeProjects, projectId)}</optgroup>`   : '',
      archiveProjects.length ? `<optgroup label="Archive">${buildProjectOptionsHtml(archiveProjects, projectId)}</optgroup>` : '',
    ].join('');
    selectorHtml = `<div class='form-group dash-project-selector'><label>Project</label><select onchange='changeDashProject(this.value)'>${opts}</select></div>`;
  }
  if (!projectId) {
    main.innerHTML = `<div class='page-header'><h2>Project Dashboard</h2></div><p>No project assigned. Contact your Admin.</p>`;
    return;
  }
  const { roles, activity, placements, rejections, tpMap } = await fetchDashboardData(projectId, role);
  const historical     = await getHistoricalPlacements();
  const analyticsActs  = await getActivityForAnalytics(52);

  // Cache for period filter updates (avoids full re-fetch on filter change)
  window._dashCache = { roles, activity, placements, rejections, tpMap, analyticsActs, historical };
  const hideEmpty = html => html.includes('empty-state') ? '' : html;
  const roleAnalytics   = hideEmpty(await renderRoleAnalyticsPanel(roles, analyticsActs, historical, tpMap));
  const kpiPeriods      = [['month','Month'],['quarter','Quarter'],['year','Year']];
  const kpiBtns         = periodButtons(kpiPeriods, _dashPeriod, 'setDashPeriod');
  const kpis            = renderKPIStrip(roles, activity, _dashPeriod);
  const longOpenProj    = hideEmpty(renderProjectLongOpenRolesPanel(roles, tpMap));
  const roleTracker     = hideEmpty(renderRoleTrackerPanel(roles));
  const placementsPanel = hideEmpty(renderPlacementsPanel(placements, roles, _dashDetailPeriod));
  const pipelineAct     = hideEmpty(renderPipelineActivityTable(activity, roles, _dashDetailPeriod));
  const tpTable         = isDMAdmin ? hideEmpty(renderActivityByTPPanel(activity, _dashDetailPeriod, tpMap)) : '';
  const rejPanel        = isDMAdmin ? hideEmpty(renderRejectionPanel(rejections, roles, _dashDetailPeriod)) : '';
  const starters        = isDMAdmin ? hideEmpty(renderUpcomingStartersPanel(placements, roles)) : '';
  const spend           = isDMAdmin ? hideEmpty(renderSpendPanel(roles, placements)) : '';
  main.innerHTML = `
    <div class='page-header'>
      <h2>Project Dashboard${isDMAdmin ? ' — ' + escHtml(projectName) : ''}</h2>
    <button class='print-btn' onclick="printPage('Project Dashboard${isDMAdmin ? ' — ' + escJsAttr(projectName) : ''}', false, 'Reporting')">⎙ Export PDF</button>
    </div>
    ${selectorHtml}
    <div class='form-group dash-project-selector'>
      <label>KPI Period</label>
      <div class='filter-group' id='proj-kpi-btns'>${kpiBtns}</div>
    </div>
    <div id='proj-kpi-area'>${kpis}</div>
    <div style="display:flex;flex-direction:column;gap:20px;margin-bottom:20px">
      ${longOpenProj}
      ${roleTracker}
    </div>
    <div class='dash-detail-header'>
      ${detailPeriodDropdown()}
    </div>
    <div id='proj-detail-grid' class='dash-grid'>
      ${placementsPanel}
      ${pipelineAct}
      ${tpTable}
      ${rejPanel}
      ${starters}
      ${spend}
      ${roleAnalytics}
    </div>`;
  lucide.createIcons();
  runKpiCountUps(main);
}
function changeDashProject(id) { _dashProjectId = String(id); renderProjectDashboard(); }
function setDashPeriod(period) {
  _dashPeriod = period;
  const el = document.getElementById('proj-kpi-area');
  if (el && window._dashCache) {
  el.innerHTML = renderKPIStrip(window._dashCache.roles, window._dashCache.activity, _dashPeriod);
  runKpiCountUps(el);
  const btnsEl = document.getElementById('proj-kpi-btns');
  if (btnsEl) btnsEl.innerHTML = periodButtons([['month','Month'],['quarter','Quarter'],['year','Year']], _dashPeriod, 'setDashPeriod');
} else {
    renderProjectDashboard();
  }
}
function setDetailPeriod(period) {
  _dashDetailPeriod = period;
  const el = document.getElementById('proj-detail-grid');
  if (el && window._dashCache) {
  const isDMAdmin = ['delivery_manager','admin'].includes(_resolvedRole) || hasDMGrant();
  const c = window._dashCache;
  const hideEmpty = html => html.includes('empty-state') ? '' : html;
  const roleAnalyticsPlaceholder = `<div id='role-analytics-placeholder'></div>`;
  el.innerHTML =
    hideEmpty(renderPlacementsPanel(c.placements, c.roles, _dashDetailPeriod)) +
    hideEmpty(renderPipelineActivityTable(c.activity, c.roles, _dashDetailPeriod)) +
    (isDMAdmin ? hideEmpty(renderActivityByTPPanel(c.activity, _dashDetailPeriod, c.tpMap)) : '') +
    (isDMAdmin ? hideEmpty(renderRejectionPanel(c.rejections, c.roles, _dashDetailPeriod)) : '') +
    (isDMAdmin ? hideEmpty(renderUpcomingStartersPanel(c.placements, c.roles)) : '') +
    (isDMAdmin ? hideEmpty(renderSpendPanel(c.roles, c.placements)) : '') +
    roleAnalyticsPlaceholder;
  lucide.createIcons();
  renderRoleAnalyticsPanel(c.roles, c.analyticsActs, c.historical, c.tpMap)
    .then(html => {
      const ph = document.getElementById('role-analytics-placeholder');
      const cleaned = html.includes('empty-state') ? '' : html;
      if (ph) ph.outerHTML = cleaned;
      lucide.createIcons();
    });
} else {
    renderProjectDashboard();
  }
}
