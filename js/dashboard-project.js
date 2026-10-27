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
    // N-206: was `(await getUserProjectIds(user.email))[0]`, which picks
    // among ALL of a TP's UserAssignments rows (old + new) in undefined
    // order — a recently-reassigned TP could default to an old, inactive
    // project with no way to switch. getDefaultUserProjectId() prefers an
    // Active row.
    projectId = await getDefaultUserProjectId(user.email);
    _dashProjectId = projectId;
  }
  let selectorHtml = '', projectName = 'Project';
  if (isDMAdmin) {
    const projects = sortProjectsByName(dashboardProjects(await getScopedProjects(user.email, false)));   // N-362
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
    selectorHtml = `<div class='form-group dash-project-selector'><label>Project</label><select ${actOn('change', 'changeDashProject', ACT_VALUE).trim()}>${opts}</select></div>`;
  }
  if (!projectId) {
    main.innerHTML = `<div class='page-header'><h2>Project Dashboard</h2></div><p>No project assigned. Contact your Admin.</p>`;
    return;
  }
  // N-362 (D-4): LCI / Transformation are Projects with no dashboard.
  const dashProject = (await getProjects(false)).find(p => String(p.id) === String(projectId));
  if (isNoDashboardProject(dashProject)) {
    main.innerHTML = `<div class='page-header'><h2>Project Dashboard</h2></div><p>${escHtml(dashProject.CustomerName || 'This project')} has no dashboard.</p>`;
    return;
  }
  const { roles, activity, placements, rejections, tpMap, hc } = await fetchDashboardData(projectId, role);
  // N-333: benchmark inputs are client-only. This project's own data
  // (fetchDashboardData, above) is never filtered — the internal project's
  // dashboard still shows its own roles, activity and placements.
  const [allHistorical, allAnalyticsActs, benchProjects, benchRoles] = await Promise.all([
    getHistoricalPlacements(),
    getActivityForAnalytics(52),
    getProjects(false),
    getAllRoles(),
  ]);
  const { historical, activity: analyticsActs } = excludeInternalProjectData(
    { historical: allHistorical, activity: allAnalyticsActs },
    { projects: benchProjects, roles: benchRoles });

  // Cache for period filter updates (avoids full re-fetch on filter change)
  window._dashCache = { roles, activity, placements, rejections, tpMap, analyticsActs, historical, hc };
  const hideEmpty = html => html.includes('empty-state') ? '' : html;
  const roleAnalytics   = hideEmpty(await renderRoleAnalyticsPanel(roles, analyticsActs, historical, tpMap));
  const kpiPeriods      = [['month','Month'],['quarter','Quarter'],['year','Year']];
  const kpiBtns         = periodButtons(kpiPeriods, _dashPeriod, 'setDashPeriod');
  const kpis            = renderKPIStrip(roles, activity, _dashPeriod, placements, hc);
  const longOpenProj    = hideEmpty(renderProjectLongOpenRolesPanel(roles, tpMap, hc.openSince));
  const roleTracker     = hideEmpty(renderRoleTrackerPanel(roles, hc));
  const placementsPanel = hideEmpty(renderPlacementsPanel(placements, roles, _dashDetailPeriod));
  const pipelineAct     = hideEmpty(renderPipelineActivityTable(activity, roles, _dashDetailPeriod));
  const tpTable         = isDMAdmin ? hideEmpty(renderActivityByTPPanel(activity, _dashDetailPeriod, tpMap)) : '';
  const rejPanel        = isDMAdmin ? hideEmpty(renderRejectionPanel(rejections, _dashDetailPeriod, roles)) : '';
  const starters        = isDMAdmin ? hideEmpty(renderUpcomingStartersPanel(placements, roles)) : '';
  const spend           = isDMAdmin ? hideEmpty(renderSpendPanel(roles, placements)) : '';
  // N-384 (DA-4): SLA panel. Its own slot, OUTSIDE #proj-detail-grid (setDetailPeriod rewrites
  // that grid), filled by sla-panel.js after paint from its own un-narrowed reads. isDMAdmin is
  // the same flag the other DM panels use; Leadership has no Project dashboard.
  const slaSlot         = isDMAdmin && slaEditorModel(dashProject, []) ? `<div class='dash-panel sla-panel' id='proj-sla-slot'></div>` : '';
  // N-388 (DA-8): the rejection insight strip. Its own slot, OUTSIDE #proj-detail-grid (setDetailPeriod
  // rewrites that grid) and above the detail period picker, because it is All time by design.
  const rejIntelSlot    = isDMAdmin ? `<div id='proj-rejintel-slot'></div>` : '';
  main.innerHTML = `
    <div class='page-header'>
      <h2>Project Dashboard${isDMAdmin ? ' — ' + escHtml(projectName) : ''}</h2>
    <button class='print-btn' ${act('printPage', `Project Dashboard${isDMAdmin ? ' — ' + projectName : ''}`, true, 'Reporting').trim()}>⎙ Export PDF</button>
    </div>
    ${selectorHtml}
    <div class='form-group dash-project-selector'>
      <label>KPI Period</label>
      <div class='filter-group' id='proj-kpi-btns'>${kpiBtns}</div>
    </div>
    <div id='proj-kpi-area'>${kpis}</div>
    ${slaSlot}
    <div style="display:flex;flex-direction:column;gap:20px;margin-bottom:20px">
      ${longOpenProj}
      ${roleTracker}
    </div>
    ${rejIntelSlot}
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
  if (slaSlot) mountProjectSlaPanel('proj-sla-slot', dashProject);   // N-384
  if (rejIntelSlot) mountRejectionIntelStrip('proj-rejintel-slot', projectId);   // N-388
  // N-255b: TP branch never resolves projectName (matches the <h2>, which
  // also only shows it for isDMAdmin) — no new fetch added for this.
  renderBreadcrumb('projectDashboard', isDMAdmin ? projectName : undefined);
}
// N-388 (DA-8): fills the insight strip for one project. All time (the strip describes the project,
// not the dashboard's period), amounts only for the figures capability. Never throws and never shows
// an error: a failed read leaves the slot empty (the table below is the dashboard's own data).
let _rejIntelStripSeq = 0;
async function mountRejectionIntelStrip(slotId, projectId) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const token = String(++_rejIntelStripSeq);
  slot.dataset.token = token;
  try {
    const inputs = await getRejectionIntelInputs(getCurrentUser().email, { weeks: 0 });
    await new Promise(resolve => setTimeout(resolve, 0));
    const live = document.getElementById(slotId);
    if (!live || live !== slot || live.dataset.token !== token) return;
    const includeFigures = canViewRejectionIntelFigures(_resolvedRole);
    const summary = rejectionIntelSummary({
      rejections: inputs.rejections, roles: inputs.roles, activity: inputs.activity,
      models: inputs.models, lciRows: inputs.lciRows, includeFigures,
    });
    slot.innerHTML = rejectionIntelStripHtml(rejectionIntelProjectStrip({
      summary, projectId, includeFigures, benchmarkUnavailable: inputs.benchmarkUnavailable,
    }));
  } catch (e) {
    console.warn('N-388: rejection insight strip failed', e);
  }
}
function changeDashProject(id) { _dashProjectId = String(id); renderProjectDashboard(); }
// N-145 addendum (18 Aug 2026) — Command Bar Project entity jump. Sets the
// filter WITHOUT re-rendering: the caller (command-bar.js's activate(), or
// handleDeepLink() for a cross-module jump) calls navigateTo('projectDashboard')
// immediately after this, which triggers the one render this needs — a
// second render here would just flash.
function setDashProjectFilter(id) { _dashProjectId = String(id); }
function setDashPeriod(period) {
  _dashPeriod = period;
  const el = document.getElementById('proj-kpi-area');
  if (el && window._dashCache) {
  el.innerHTML = renderKPIStrip(window._dashCache.roles, window._dashCache.activity, _dashPeriod, window._dashCache.placements, window._dashCache.hc);
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
    (isDMAdmin ? hideEmpty(renderRejectionPanel(c.rejections, _dashDetailPeriod, c.roles)) : '') +
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

// N-302b: delegated actions for the project dashboard and its detail panels (js/actions.js).
registerActions({
  changeDashProject,
  setDashPeriod,
  setDetailPeriod,
});
