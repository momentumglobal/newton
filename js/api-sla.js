// js/api-sla.js — Delivery Assurance input readers (N-476, R3-7, moved from api.js):
// SLATargets, the SLA panel / roll-up inputs, the Rejection Intelligence inputs and the
// one SLATargets writer. The engines are sla-targets.js, sla-engine.js and
// rejection-engine.js. Loads after api-people.js on admin, command-centre,
// market-reporting and reporting. getRejectionIntelInputs also needs api-lci.js
// (getLCIModels / getAllLCIModelRows) on the shell that calls it (reporting.html).

// N-381 (DA-1): every SLATargets row (default and override). Tiny list; resolve
// per project with slaTargetsFor() (sla-targets.js). Not tier-2 cached - the N-382
// editor writes it and must see its own save.
async function getSLATargets() {
  return getItems(CONFIG.SLA.LIST);
}

// N-384 (DA-4): everything computeProjectSla() needs for ONE project, read UNWINDOWED and
// UN-NARROWED on purpose (N-383 consumer contract): all-time placements, all of the project's
// WeeklyActivity, every role. Deliberately not fetchDashboardData(): that narrows a TP (even
// one holding a DM grant) to their own roles. Rejected offers are optional evidence (offer
// implies a submission): a failed read degrades to null; every other read must succeed,
// since a missing one would false-breach hires. computeProjectSla() scopes by role itself,
// so the role-id filter's over-fetch above ROLE_ID_FILTER_MAX needs no client backstop here.
async function getProjectSlaInputs(projectId) {
  const roles = await getRolesForProject(projectId);
  const roleIds = roles.map(r => r.id);
  const [slaRows, headcount, stageRows, activity, placements, rejectedOffers] = await Promise.all([
    getSLATargets(),
    getAllHeadcount(),
    getRoleStageHistory(),
    getWeeklyActivity(null, null, { roleIds }),
    getPlacements(null, { roleIds }),
    getRejectedOffers(null, { roleIds }).catch(e => { console.warn('SLA panel: rejected offers read failed', e); return null; }),
  ]);
  return { slaRows, roles, headcount, placements, stageRows, activity, rejectedOffers };
}

// N-384 (DA-4, amendment 1): the Role page panel's reads. Same contract as getProjectSlaInputs,
// narrowed to ONE role: all-time, un-windowed placements and activity for that role (the engine's
// fill map is built from the placements passed in). The role row is passed in, not re-read, so
// the panel scores the role exactly as the page shows it. Rejected offers degrade to null.
async function getRoleSlaInputs(role) {
  const roleIds = [role.id];
  const [slaRows, headcount, stageRows, activity, placements, rejectedOffers] = await Promise.all([
    getSLATargets(),
    getAllHeadcount(),
    getRoleStageHistory(),
    getWeeklyActivity(null, null, { roleIds }),
    getPlacements(null, { roleIds }),
    getRejectedOffers(null, { roleIds }).catch(e => { console.warn('SLA role panel: rejected offers read failed', e); return null; }),
  ]);
  return { slaRows, roles: [role], headcount, placements, stageRows, activity, rejectedOffers };
}

// N-384 (DA-4): the Company Dashboard tile's extra reads. Placements are read here, not taken
// from the dashboard: its own copy degrades to [] on a failed read, and an empty placement list
// would make every filled hire look open. All-time, no window. Rejected offers degrade to null.
async function getPortfolioSlaInputs() {
  const [slaRows, stageRows, placements, rejectedOffers] = await Promise.all([
    getSLATargets(),
    getRoleStageHistory(),
    getPlacements(null),
    getRejectedOffers(null).catch(e => { console.warn('SLA tile: rejected offers read failed', e); return null; }),
  ]);
  return { slaRows, stageRows, placements, rejectedOffers };
}

// N-385 (DA-5): everything the SLA roll-up needs, for the Command Centre section and the Report
// Builder module. Scope is the PROJECT list (getUserProjectIds: null = all, so Admin / Leadership
// see every eligible project and a DM only theirs); roles, activity and placements stay whole and
// un-windowed so each project's figures are the true ones (the N-383 consumer contract).
// Internal / no-dashboard rows are removed through excludeInternalProjectData (N-333, N-362).
// Required reads throw (the caller shows "unavailable", never a zero-filled list); rejected
// offers degrade to null.
async function getSlaRollupInputs(email, opts = {}) {
  const [projectIds, allProjects, allRoles, allActivity, allPlacements, allHeadcount, slaRows, allStageRows, rejectedOffers] = await Promise.all([
    getUserProjectIds(email),
    getProjects(false),
    getAllRoles(),
    getWeeklyActivity(null, null),
    getPlacements(null),
    getAllHeadcount(),
    getSLATargets(),
    getRoleStageHistory(),
    getRejectedOffers(null).catch(e => { console.warn('SLA roll-up: rejected offers read failed', e); return null; }),
  ]);
  const { roles, activity, placements, headcount, stageRows } = excludeInternalProjectData(
    { roles: allRoles, activity: allActivity, placements: allPlacements, headcount: allHeadcount, stageRows: allStageRows },
    { projects: allProjects, roles: allRoles });
  return {
    projects: slaRollupProjects({ projects: allProjects, projectIds: projectScopeForRole(opts.role, projectIds) }),
    roles, activity, placements, headcount, slaRows, stageRows, rejectedOffers,
  };
}

// N-388 (DA-8): the inputs rejectionIntelSummary() needs, scoped for `email` (DA-D11: Admin /
// Leadership all, a Delivery Manager their own projects via getUserProjectIds; Talent Partners never
// reach this). `weeks` = the Rejected Offers page's window (0 = All time, the default, and it must
// stay unbounded: a `ge` bound cannot match a blank RejectionDate - see getRejectedOffers).
// Rejections are windowed by fromDay, activity by activitySinceWeeks (Sunday weeks). Internal /
// no-dashboard projects are removed. Rejections, roles, activity and projects are required (a
// rejection throws, the caller shows "unavailable", never an empty page); only the two LCI reads
// degrade, to benchmarkUnavailable, so the rest of the page still renders.
async function getRejectionIntelInputs(email, opts = {}) {
  const weeks = Number(opts.weeks) || 0;
  const [projectIds, allProjects, allRoles, allRejections, allActivity, models, lciRows] = await Promise.all([
    getUserProjectIds(email),
    getProjects(false),
    getAllRoles(),
    getRejectedOffers(null, { fromDay: weeksAgoDay(weeks) }),
    getWeeklyActivity(null, null),
    getLCIModels().catch(e => { console.warn('N-388: LCI models read failed', e); return null; }),
    getAllLCIModelRows().catch(e => { console.warn('N-388: LCI rows read failed', e); return null; }),
  ]);
  const scopeIds = projectScopeForRole(opts.role, projectIds);   // N-388 fix: Leadership / People Ops see all
  const scoped = rejectionIntelScopeRows({ projectIds: scopeIds, roles: allRoles, rejections: allRejections, activity: activitySinceWeeks(allActivity, weeks) });
  const { roles, activity, rejections } = excludeInternalProjectData(
    { roles: scoped.roles, activity: scoped.activity, rejections: scoped.rejections },
    { projects: allProjects, roles: allRoles });
  const benchmarkUnavailable = !Array.isArray(models) || !Array.isArray(lciRows);
  const ids = scopeIds === null ? null : new Set(scopeIds.map(String));
  return {
    rejections, roles, activity,
    models: benchmarkUnavailable ? [] : models,
    lciRows: benchmarkUnavailable ? [] : lciRows,
    projects: ids ? allProjects.filter(p => ids.has(String(p.id))) : allProjects,
    benchmarkUnavailable,
  };
}

// N-382 (DA-2): executes ONE slaEditPlan() (sla-targets.js) against SLATargets - the only writer the
// editors use. createItem / updateItem / deleteItem only (each invalidates the list cache).
// 'none' makes no call. A failure is passed through slaTranslateSaveError (a 403 becomes a plain permission message).
async function saveSlaTargets(plan) {
  if (!plan || plan.action === 'none') return { ok: true };
  try {
    if (plan.action === 'create') await createItem(CONFIG.SLA.LIST, plan.fields);
    else if (plan.action === 'update') await updateItem(CONFIG.SLA.LIST, plan.id, plan.fields);
    else if (plan.action === 'delete') await deleteItem(CONFIG.SLA.LIST, plan.id);
    else throw new Error('Unknown SLA save action.');
  } catch (e) {
    throw slaTranslateSaveError(e);
  }
  return { ok: true };
}
