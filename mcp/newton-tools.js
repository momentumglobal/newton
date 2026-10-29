// mcp/newton-tools.js - Newton for Claude: live tool registry (N-392 registry; N-393 reporting tools;
// N-394 People tools).
//
// Served from GitHub Pages and loaded LAST into the MCP server's vm context, after
// js/config.js and every file in CONFIG.MCP.scripts (mcp/bootstrap/loader.js). No Newton
// page loads it. Because it is fetched live, tools deploy (and are CI-tested) together
// with the calc layer they call; the installed bundle never needs to change for a new tool.
// tests/run.js also loads it (declarations only) so tests/assert-mcp.js can reach the helpers.
//
// Each entry:
//   {
//     name:        'list_projects',            // lower_snake_case, unique, not 'newton_status'
//     description: 'What it answers, in one or two sentences.',
//     inputSchema: { type: 'object', properties: { ... }, required: [ ... ], additionalProperties: false },
//     handler:     mcpListProjects,            // a named top-level async function (tests/lint-mcp.js)
//   }
//
// Rules (N-378, specs/N-393.md):
//   - Reads only through the api*.js getters registered in tests/lint-mcp.js (MCP_GETTER_LISTS);
//     every figure comes from a live analytics.js / utils.js / headcount.js function. This file
//     counts, groups, filters, sorts and picks - it never computes a rate, mean, median, RAG or
//     day count itself.
//   - Output is built from explicit field picks, never a spread of a live row, and every result
//     passes mcpOutputGuard (CONFIG.MCP.outputDenyFields): no candidate names, money, Notes,
//     HiringManager or rejection reasons (MCP-D6).
//   - Company-wide aggregates exclude the internal and no-dashboard projects through
//     excludeInternalProjectData, as the Command Centre / Placement Analytics do; answers for one
//     named project don't, as the Project Dashboard doesn't (N-393 B5).
//   - The server adds asOf + newtonBuild to every result and gates every call to
//     CONFIG.MCP.allowedRoles; handlers do neither.
//   - newton_status is answered by the bootstrap (server-core.js), not here.

// The nine WeeklyActivity funnel counts, in funnel order (computeSnapshotMetrics' activityTotals keys).
var MCP_FUNNEL_FIELDS = ['Outreach', 'Responses', 'Screened', 'Submitted', 'Interview1',
  'Interview2Plus', 'FinalInterview', 'Offers', 'Hires'];

// ── Input helpers ─────────────────────────────────────────────────────
function mcpNorm(v) {
  return String(v === undefined || v === null ? '' : v).trim().toLowerCase();
}

// Whole number in [min, max]; undefined/null -> dflt. Throws a user-facing message.
function mcpInt(v, label, min, max, dflt) {
  if (v === undefined || v === null) {
    if (dflt === undefined) throw new Error(`${label} is required.`);
    return dflt;
  }
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return v;
}

// A real calendar day as 'YYYY-MM-DD' (addDaysISO round trip rejects 2026-02-30).
function mcpDay(v, label) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || addDaysISO(s, 0) !== s) {
    throw new Error(`${label} must be a date as YYYY-MM-DD (got "${s}").`);
  }
  return s;
}

// { from, to } local days for a trailing window of `weeks` weeks ending today.
function mcpWindowDays(weeks) {
  return { from: weeksAgoDay(weeks), to: localDayISO(new Date()) };
}

function _mcpNameList(projects, max) {
  const names = projects.map(p => `${p.CustomerName || '(unnamed)'} (id ${p.id})`).sort();
  return names.slice(0, max).join(', ') + (names.length > max ? `, and ${names.length - max} more` : '');
}

// Project by id, exact name (case-insensitive), or a unique partial name. Throws with
// the candidates otherwise. `projects` = getProjects(false).
function mcpResolveProject(arg, projects) {
  const list = (projects || []).filter(Boolean);
  const q = String(arg === undefined || arg === null ? '' : arg).trim();
  if (!q) throw new Error('Give a project name or id.');
  if (/^\d+$/.test(q)) {
    const byId = list.find(p => String(p.id) === q);
    if (byId) return byId;
  }
  const n = mcpNorm(q);
  const exact = list.filter(p => mcpNorm(p.CustomerName) === n);
  if (exact.length === 1) return exact[0];
  const cands = exact.length > 1 ? exact : list.filter(p => mcpNorm(p.CustomerName).includes(n));
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) {
    throw new Error(`Project "${q}" matched ${cands.length} projects: ${_mcpNameList(cands, 8)}. Say which one (name or id).`);
  }
  throw new Error(`No project matched "${q}". Projects: ${_mcpNameList(list, 20)}.`);
}

// One of `values` by exact (case-insensitive) or unique partial match; null when arg is
// blank. Throws listing the options otherwise.
function mcpResolveValue(arg, values, label) {
  if (arg === undefined || arg === null || String(arg).trim() === '') return null;
  const opts = Array.from(new Set((values || []).filter(v => v !== null && v !== undefined && String(v).trim() !== '').map(String))).sort();
  const n = mcpNorm(arg);
  const exact = opts.filter(v => mcpNorm(v) === n);
  if (exact.length === 1) return exact[0];
  const cands = exact.length > 1 ? exact : opts.filter(v => mcpNorm(v).includes(n));
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) throw new Error(`${label} "${arg}" matched ${cands.length} values: ${cands.slice(0, 12).join(', ')}. Say which one.`);
  throw new Error(`No ${label} matched "${arg}". Options: ${opts.slice(0, 30).join(', ') || '(none)'}.`);
}

// ── Output helpers (pick only) ────────────────────────────────────────
function mcpOutDay(v) {
  return v ? spDateIn(v) : null;
}

function mcpId(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (v === undefined ? null : v);
}

function mcpProjectRef(p) {
  if (!p) return null;
  return { id: mcpId(p.id), name: p.CustomerName || null, kpiExcluded: isKpiExcludedProject(p) };
}

function mcpProjectIndex(projects) {
  return new Map((projects || []).filter(Boolean).map(p => [String(p.id), p]));
}

function mcpRoleProject(role, projById) {
  return mcpProjectRef(projById.get(String(role.ProjectIDLookupId || role.ProjectID || '')));
}

// Staff display names for a ';'-separated TP field (tpList), via the UserAssignments map.
function mcpTpNames(val, tpMap) {
  return tpList(val).map(e => (tpMap && tpMap[e]) || e);
}

function mcpPersonName(email, tpMap) {
  if (!email) return null;
  const k = String(email).trim().toLowerCase();
  return (tpMap && tpMap[k]) || String(email);
}

// The nine funnel totals for a set of WeeklyActivity rows (sumField).
function mcpFunnelTotals(acts) {
  const out = {};
  MCP_FUNNEL_FIELDS.forEach(f => { out[f] = sumField(acts || [], f); });
  return out;
}

// Pipelines per stage (normaliseRoleStage), keys in CONFIG.ROLE_STAGES order, zero counts omitted.
function mcpStageCounts(roles) {
  const counts = {};
  (roles || []).forEach(r => {
    const s = normaliseRoleStage(r.Stage) || 'Unknown';
    counts[s] = (counts[s] || 0) + 1;
  });
  const out = {};
  CONFIG.ROLE_STAGES.forEach(s => { if (counts[s]) out[s] = counts[s]; });
  Object.keys(counts).sort().forEach(s => { if (!(s in out)) out[s] = counts[s]; });
  return out;
}

function mcpInRoleSet(ids, row) {
  return ids.has(String(row.RoleIDLookupId)) || ids.has(String(row.RoleID));
}

function mcpCapRows(rows) {
  const max = CONFIG.MCP.maxRows;
  return { rows: rows.slice(0, max), total: rows.length, truncated: rows.length > max };
}

// A read that the page it mirrors degrades instead of failing on: same fallback, and the
// result says which read degraded.
function mcpSoft(promise, fallback, label, degraded) {
  return Promise.resolve(promise).catch(e => {
    console.warn(`[newton-mcp] ${label} read failed - degraded:`, e && e.message ? e.message : e);
    degraded.push(label);
    return fallback;
  });
}

// MCP-D6 backstop: no key named in CONFIG.MCP.outputDenyFields may appear anywhere in a result.
function mcpOutputGuard(result) {
  const denied = new Set();
  Object.keys(CONFIG.MCP.outputDenyFields || {}).forEach(list => {
    (CONFIG.MCP.outputDenyFields[list] || []).forEach(k => denied.add(k));
  });
  const walk = v => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    Object.keys(v).forEach(k => {
      if (denied.has(k)) throw new Error(`Newton for Claude withheld a restricted field (${k}).`);
      walk(v[k]);
    });
  };
  walk(result);
  return result;
}

// roleFlagReasons() output, picked.
function mcpFlagPick(r) {
  return {
    flagged: r.flagged,
    reasons: { stuck: r.stuck, conversion: r.conversion, behindPace: r.behindPace },
    daysInStage: r.daysInStage, stageBudget: r.stageBudget,
    daysOpen: r.daysOpen, paceBudget: r.paceBudget,
  };
}

const MCP_COMPANY_SCOPE = 'client projects only (the internal and no-dashboard projects are excluded, as the Command Centre and Placement Analytics do)';

// ── list_projects ─────────────────────────────────────────────────────
async function mcpListProjects(args) {
  const active = args.active !== false;
  const type = args.type || null;
  const degraded = [];
  const [rows, tpMap] = await Promise.all([
    getProjects(active),
    mcpSoft(getTalentPartnerDisplayMap(), {}, 'staff names', degraded),
  ]);
  const projects = rows
    .filter(p => !type || p.ProjectType === type)
    .map(p => ({
      id: mcpId(p.id),
      name: p.CustomerName || null,
      type: p.ProjectType || null,
      status: p.Status || null,
      startDate: mcpOutDay(p.StartDate),
      endDate: mcpOutDay(p.EndDate),
      deliveryManager: mcpPersonName(p.DeliveryManager, tpMap),
      csd: p.CSDName || null,
      kpiExcluded: isKpiExcludedProject(p),
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return mcpOutputGuard({
    scope: `${active ? 'Active' : 'All'} projects${type ? ` of type ${type}` : ''}. kpiExcluded marks the internal and no-dashboard projects, which company figures leave out.`,
    count: projects.length,
    projects,
    degraded,
  });
}

// ── project_summary ───────────────────────────────────────────────────
// Wiring mirrors fetchDashboardData (dashboard-core.js) for a non-TP viewer, plus the CC's
// stage-history read for the flags.
async function mcpProjectSummary(args) {
  const W = CONFIG.MCP.windows;
  const weeks = mcpInt(args.weeks, 'weeks', 1, W.maxWeeks, W.summaryWeeks);
  const projects = await getProjects(false);
  const p = mcpResolveProject(args.project, projects);
  const degraded = [];
  const roles = await getRolesForProject(p.id);
  const roleIds = roles.map(r => r.id);
  const ids = new Set(roleIds.map(String));
  const [actRaw, plRaw, headcount, stageRows] = await Promise.all([
    getWeeklyActivity(null, null, { roleIds }),
    getPlacements(null, { roleIds }),
    mcpSoft(getAllHeadcount(), null, 'headcount', degraded),
    mcpSoft(getRoleStageHistory(), [], 'stage history', degraded),
  ]);
  // N-315 backstop: above ROLE_ID_FILTER_MAX ids the server clause is dropped.
  const activity = actRaw.filter(a => mcpInRoleSet(ids, a));
  const placements = plRaw.filter(pl => mcpInRoleSet(ids, pl));
  const hc = dashboardHeadcountContext(roles, placements, headcount);
  const stageHistory = groupStageHistoryByRole(stageRows);
  const openPipelines = roles.filter(r => isOpenPipelineStage(r.Stage));
  const health = projectHealthCounts(roles, activity, stageHistory, hc.openSince);
  const { from, to } = mcpWindowDays(weeks);
  const hires = hireKpis(hc.hires, from, to);
  return mcpOutputGuard({
    scope: `Project ${p.CustomerName}: every pipeline on it, as the Project Dashboard shows it to Leadership. Hires = offers accepted ${from} to ${to}.`,
    project: { id: mcpId(p.id), name: p.CustomerName || null, type: p.ProjectType || null, status: p.Status || null, kpiExcluded: isKpiExcludedProject(p) },
    pipelines: { total: roles.length, open: openPipelines.length, byStage: mcpStageCounts(roles) },
    headcount: {
      open: openHeadcountCount(openPipelines, hc.headcount, hc.fillMap),
      avgDaysOpen: avgOpenHeadcountDays(openPipelines, hc.headcount, hc.fillMap),
    },
    health: {
      open: health.open, flagged: health.flagged, behindPace: health.behind,
      rag: computeProjectHealthRAG(roles, activity, stageHistory),
    },
    hires: { from, to, weeks, count: hires.count, avgDaysToHire: hires.avgDays, onTimePct: hires.onTimePct },
    degraded,
  });
}

// ── list_roles ────────────────────────────────────────────────────────
// Flags as the CC Health tile reads them: flagActivityWeeks of activity, all stage history,
// behind-pace from each pipeline's oldest open headcount (oldestOpenHeadcountIndex).
async function mcpListRoles(args) {
  const W = CONFIG.MCP.windows;
  const degraded = [];
  const projects = await getProjects(false);
  const p = args.project !== undefined && args.project !== null ? mcpResolveProject(args.project, projects) : null;
  const [roles, acts, stageRows, headcount, placementIds, tpMap] = await Promise.all([
    p ? getRolesForProject(p.id) : getAllRoles(),
    getActivityForAnalytics(W.flagActivityWeeks),
    mcpSoft(getRoleStageHistory(), [], 'stage history', degraded),
    mcpSoft(getAllHeadcount(), null, 'headcount', degraded),
    mcpSoft(getPlacementHeadcountIds(), [], 'placement headcount', degraded),
    mcpSoft(getTalentPartnerDisplayMap(), {}, 'staff names', degraded),
  ]);
  const country = mcpResolveValue(args.country, roles.map(r => r.Location), 'country');
  const fn = mcpResolveValue(args.function, roles.map(r => r.Department), 'function');
  const stage = args.stage || null;
  const projById = mcpProjectIndex(projects);
  const stageHistory = groupStageHistoryByRole(stageRows);
  const openSince = headcount ? oldestOpenHeadcountIndex(headcount, placementIds) : null;
  const fill = headcountFillMap(placementIds);
  const hcByRole = groupHeadcountByRole(headcount || []);
  const actsByRole = new Map();
  acts.forEach(a => {
    const k = String(a.RoleIDLookupId);
    if (!actsByRole.has(k)) actsByRole.set(k, []);
    actsByRole.get(k).push(a);
  });
  const today = new Date();
  const picked = roles
    .filter(r => (stage ? normaliseRoleStage(r.Stage) === stage : isOpenPipelineStage(r.Stage)))
    .filter(r => (!country || r.Location === country) && (!fn || r.Department === fn))
    .map(role => {
      const flag = mcpFlagPick(roleFlagReasons(role, actsByRole.get(String(role.id)) || [], stageHistory, today, { openSince }));
      const hcRows = hcByRole.get(String(role.id)) || [];
      return {
        roleId: mcpId(role.id),
        title: role.RoleTitle || null,
        project: mcpRoleProject(role, projById),
        stage: normaliseRoleStage(role.Stage) || null,
        priority: role.Priority || null,
        function: role.Department || null,
        country: role.Location || null,
        backfill: role.Backfill === undefined ? null : role.Backfill,
        talentPartners: mcpTpNames(role.TalentPartner, tpMap),
        openSince: pipelineOpenDay(role, openSince),
        nextTargetDay: headcount ? nextOpenTargetDay(hcRows, fill) : null,
        headcount: headcount ? headcountSummary(hcRows, fill).counts : null,
        flagged: flag.flagged, reasons: flag.reasons,
        daysInStage: flag.daysInStage, stageBudget: flag.stageBudget,
        daysOpen: flag.daysOpen, paceBudget: flag.paceBudget,
      };
    })
    .filter(r => !args.flaggedOnly || r.flagged)
    .sort((a, b) => (Number(b.flagged) - Number(a.flagged))
      || String(a.project && a.project.name).localeCompare(String(b.project && b.project.name))
      || String(a.title).localeCompare(String(b.title)));
  const capped = mcpCapRows(picked);
  return mcpOutputGuard({
    scope: `${p ? `Project ${p.CustomerName}` : 'All projects'}; ${stage ? `stage ${stage}` : 'open pipelines'}. Flagged = stuck in stage past its budget or low recent conversion (Newton's role flag); behind pace is information only.`,
    filters: { project: p ? p.CustomerName : null, stage, flaggedOnly: !!args.flaggedOnly, country, function: fn },
    total: capped.total,
    flaggedCount: picked.filter(r => r.flagged).length,
    truncated: capped.truncated,
    roles: capped.rows,
    degraded,
  });
}

// ── role_detail ───────────────────────────────────────────────────────
async function mcpRoleDetail(args) {
  const id = mcpInt(args.roleId, 'roleId', 1, Number.MAX_SAFE_INTEGER);
  const W = CONFIG.MCP.windows;
  const degraded = [];
  const [roles, projects, state, history, activity, tpMap] = await Promise.all([
    getAllRoles(),
    getProjects(false),
    getRoleHeadcountState(id),
    getRoleHistory(id),
    getWeeklyActivity(null, id),
    mcpSoft(getTalentPartnerDisplayMap(), {}, 'staff names', degraded),
  ]);
  const role = roles.find(r => String(r.id) === String(id));
  if (!role) throw new Error(`No role with id ${id}. list_roles gives role ids.`);
  // Stage rows only (groupStageHistoryByRole keeps Field 'Stage', oldest first). Other
  // RoleHistory rows log Budget / HiringManager / Notes edits with their values.
  const stageHistory = groupStageHistoryByRole(history);
  const stageRows = stageHistory[String(id)] || [];
  const openSince = oldestOpenHeadcountIndex(state.rows, state.placements);
  const flag = mcpFlagPick(roleFlagReasons(role, activity, stageHistory, new Date(), { openSince }));
  const hcById = new Map(state.rows.map(hc => [String(hc.id), hc]));
  const slots = state.rows.slice()
    .sort((a, b) => (Number(a.Sequence) || 0) - (Number(b.Sequence) || 0))
    .map(hc => ({
      label: hc.Title || null,
      status: classifyHeadcount(hc, state.fillMap),
      openDate: mcpOutDay(hc.OpenDate),
      targetHireDate: mcpOutDay(hc.TargetHireDate),
      cancelledDate: mcpOutDay(hc.CancelledDate),
      backfill: hc.Backfill === undefined ? null : hc.Backfill,
    }));
  const placements = state.placements
    .map(pl => {
      const hc = hcById.get(String(pl.HeadcountID));
      return {
        offerAcceptedDate: mcpOutDay(pl.OfferAcceptedDate),
        provisionalStartDate: mcpOutDay(pl.ProvisionalStartDate),
        headcount: hc ? (hc.Title || null) : null,
      };
    })
    .sort((a, b) => String(a.offerAcceptedDate).localeCompare(String(b.offerAcceptedDate)));
  return mcpOutputGuard({
    scope: `One pipeline (role id ${id}). Funnel totals cover the last ${W.roleWeeks} weeks; the flag uses its full activity and stage history.`,
    role: {
      roleId: mcpId(role.id),
      title: role.RoleTitle || null,
      project: mcpRoleProject(role, mcpProjectIndex(projects)),
      stage: normaliseRoleStage(role.Stage) || null,
      priority: role.Priority || null,
      function: role.Department || null,
      country: role.Location || null,
      backfill: role.Backfill === undefined ? null : role.Backfill,
      openDate: mcpOutDay(role.OpenDate),
      targetHireDate: mcpOutDay(role.TargetHireDate),
      actualHireDate: mcpOutDay(role.ActualHireDate),
      talentPartners: mcpTpNames(role.TalentPartner, tpMap),
    },
    headcount: { counts: state.counts, slots },
    stageTimeline: stageRows.map(h => ({ at: h.ChangedAt || null, from: h.OldValue || null, to: h.NewValue || null, by: h.ChangedBy ? mcpPersonName(h.ChangedBy, tpMap) : null })),
    funnel: { weeks: W.roleWeeks, totals: mcpFunnelTotals(activitySinceWeeks(activity, W.roleWeeks)) },
    flag,
    placements: { count: placements.length, rows: placements },
    degraded,
  });
}

// ── activity_summary ──────────────────────────────────────────────────
// Totals: project-scoped as the Project Dashboard reads them; company-wide client-only.
// Anomalies: exactly the Data Health inputs (_dhFetchAnomalies, os-admin.js) - all roles,
// full WeeklyActivity, active acknowledgements.
async function mcpActivitySummary(args) {
  const W = CONFIG.MCP.windows;
  const weeks = mcpInt(args.weeks, 'weeks', 1, W.maxWeeks, W.activityWeeks);
  const degraded = [];
  const projects = await getProjects(false);
  const p = args.project !== undefined && args.project !== null ? mcpResolveProject(args.project, projects) : null;
  let roles, activity;
  if (p) {
    roles = await getRolesForProject(p.id);
    const ids = new Set(roles.map(r => String(r.id)));
    activity = (await getWeeklyActivity(null, null, { roleIds: roles.map(r => r.id), sinceWeeks: weeks }))
      .filter(a => mcpInRoleSet(ids, a));
  } else {
    const [allRoles, rawActs] = await Promise.all([getAllRoles(), getActivityForAnalytics(weeks)]);
    const clientOnly = excludeInternalProjectData({ roles: allRoles, activity: rawActs }, { projects });
    roles = clientOnly.roles;
    activity = clientOnly.activity;
  }
  const byDay = new Map();
  let undatedRows = 0;
  activity.forEach(a => {
    const day = mcpOutDay(a.WeekEndingDate);
    if (!day) { undatedRows++; return; }
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(a);
  });
  const byWeek = Array.from(byDay.keys()).sort().map(day => {
    const row = { weekEnding: day };
    const t = mcpFunnelTotals(byDay.get(day));
    MCP_FUNNEL_FIELDS.forEach(f => { row[f] = t[f]; });
    return row;
  });
  const totals = mcpFunnelTotals(activity);
  const conversion = computeRoleFunnel(totals, CONFIG.ANALYTICS_BENCHMARKS)
    .map(s => ({ stage: s.stage, conversionPct: s.conv }));

  // Anomalies (Data Health parity).
  const [allRoles, fullActs, acksRes, tpMap] = await Promise.all([
    getAllRoles(),
    getWeeklyActivity(null, null),
    getAnomalyAcks().then(rows => ({ ok: true, rows }), e => {
      console.warn('[newton-mcp] AnomalyAcks read failed - acknowledgements not applied:', e && e.message ? e.message : e);
      return { ok: false, rows: [] };
    }),
    mcpSoft(getTalentPartnerDisplayMap(), {}, 'staff names', degraded),
  ]);
  if (!weeklyActivityRowsUsable(fullActs)) {
    throw new Error('WeeklyActivity rows came back without role keys, so the anomaly check could not run.');
  }
  const found = detectWeeklyActivityAnomalies(allRoles, fullActs);
  const part = partitionAcknowledgedFunnels(found.impossibleFunnels, acksRes.rows);
  const projIds = p ? new Set(roles.map(r => String(r.id))) : null;
  const mine = f => !projIds || projIds.has(String(f.roleId));
  const cap = CONFIG.WEEKLY_ANOMALIES.displayRows;
  const capList = list => ({ total: list.length, truncated: list.length > cap, rows: list.slice(0, cap) });
  const impossible = part.open.filter(mine).map(f => ({
    roleId: mcpId(f.roleId), roleTitle: f.roleTitle || null, stage: f.stage || null,
    talentPartners: mcpTpNames(f.tp, tpMap),
    breaches: (f.breaches || []).map(b => ({ later: b.later, laterTotal: b.laterTotal, earlier: b.earlier, earlierTotal: b.earlierTotal })),
  }));
  const noActivity = found.noActivity.filter(mine).map(f => ({
    roleId: mcpId(f.roleId), roleTitle: f.roleTitle || null, stage: f.stage || null,
    talentPartners: mcpTpNames(f.tp, tpMap), lastEntryWeek: f.lastEntryWeek || null,
  }));
  const spikes = p ? null : found.spikes.map(s => ({
    talentPartner: mcpPersonName(s.tp, tpMap), weekEnding: s.weekEnding, field: s.field, value: s.value, median: s.median,
  }));
  const { from, to } = mcpWindowDays(weeks);
  return mcpOutputGuard({
    scope: `${p ? `Project ${p.CustomerName}` : `Company-wide, ${MCP_COMPANY_SCOPE}`}; weeks ending ${from} to ${to}. Conversion % has no RAG here (Newton's RAGs use learned benchmarks per population - see project_scorecards). Anomalies are the Data Health checks${p ? ' for this project\'s pipelines' : ' over every project'}.`,
    weeks,
    byWeek,
    undatedRows,
    totals,
    conversion,
    anomalies: {
      acknowledgementsChecked: acksRes.ok,
      impossibleFunnels: capList(impossible),
      acknowledgedCount: part.acknowledged.filter(e => mine(e.flag)).length,
      noActivity: capList(noActivity),
      spikes: spikes === null ? null : capList(spikes),
    },
    degraded,
  });
}

// ── list_placements ───────────────────────────────────────────────────
// Rows are hireRowsWithTargets() (one per filled headcount) - the rows Placement Analytics and
// the dashboard hire KPIs count. Company-wide is client-only, as Placement Analytics.
async function mcpListPlacements(args) {
  const from = mcpDay(args.from, 'from');
  const to = mcpDay(args.to, 'to');
  if (from > to) throw new Error(`from (${from}) is after to (${to}).`);
  const degraded = [];
  const [projects, allRoles] = await Promise.all([getProjects(false), getAllRoles()]);
  const p = args.project !== undefined && args.project !== null ? mcpResolveProject(args.project, projects) : null;
  const scopedRoles = p ? await getRolesForProject(p.id) : null;
  const roleIds = scopedRoles ? scopedRoles.map(r => r.id) : null;
  const [plRaw, headcount, tpMap] = await Promise.all([
    getPlacements(null, roleIds ? { fromDay: from, roleIds } : { fromDay: from }),
    mcpSoft(getAllHeadcount(), [], 'headcount', degraded),
    mcpSoft(getTalentPartnerDisplayMap(), {}, 'staff names', degraded),
  ]);
  const ids = roleIds ? new Set(roleIds.map(String)) : null;
  const placements = ids ? plRaw.filter(pl => mcpInRoleSet(ids, pl)) : plRaw;
  let rows = hireRowsWithTargets(placements, allRoles, headcount).filter(r => {
    const day = mcpOutDay(r.placementDate);
    return !!day && day >= from && day <= to;
  });
  if (!p) rows = excludeInternalProjectData({ historical: rows }, { projects, roles: allRoles }).historical;
  const summary = hireKpis(rows, from, to);
  const roleById = new Map(allRoles.map(r => [String(r.id), r]));
  const plById = new Map(placements.map(pl => [String(pl.id), pl]));
  const projById = mcpProjectIndex(projects);
  const detail = rows.map(r => {
    const role = roleById.get(String(r.id));
    const pl = plById.get(String(r.placementId));
    const tth = r.openDate ? daysOpen(r.openDate, r.placementDate) : null;
    return {
      roleId: mcpId(r.id),
      roleTitle: r.title || null,
      project: role ? mcpRoleProject(role, projById) : null,
      function: r.functionArea || null,
      country: r.country || null,
      talentPartner: mcpPersonName(r.tpEmail, tpMap),
      offerAcceptedDate: mcpOutDay(r.placementDate),
      provisionalStartDate: pl ? mcpOutDay(pl.ProvisionalStartDate) : null,
      timeToHireDays: tth !== null && tth >= 0 ? tth : null,
    };
  }).sort((a, b) => String(b.offerAcceptedDate).localeCompare(String(a.offerAcceptedDate)));
  const counts = new Map();
  detail.forEach(d => {
    const name = d.project ? d.project.name : '(no project)';
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  const byProject = Array.from(counts.keys())
    .map(name => ({ project: name, count: counts.get(name) }))
    .sort((a, b) => b.count - a.count || a.project.localeCompare(b.project));
  const capped = mcpCapRows(detail);
  return mcpOutputGuard({
    scope: `${p ? `Project ${p.CustomerName}` : `Company-wide, ${MCP_COMPANY_SCOPE}`}; offers accepted ${from} to ${to}. One row per filled headcount. No candidate names or salaries are ever returned.`,
    from, to,
    summary: { count: summary.count, avgDaysToHire: summary.avgDays, onTimePct: summary.onTimePct },
    byProject,
    total: capped.total,
    truncated: capped.truncated,
    placements: capped.rows,
    degraded,
  });
}

// ── time_to_fill ──────────────────────────────────────────────────────
// Wiring mirrors renderPlacementAnalytics (placement-analytics.js).
async function mcpTimeToFill(args) {
  const degraded = [];
  const [rawHistorical, rawPlacements, rawRoles, rawStageRows, rawHeadcount, projects] = await Promise.all([
    getHistoricalPlacements(),
    getPlacements(null),
    getAllRoles(),
    mcpSoft(getRoleStageHistory(), [], 'stage history', degraded),
    mcpSoft(getAllHeadcount(), [], 'headcount', degraded),
    getProjects(false),
  ]);
  const clientOnly = excludeInternalProjectData(
    { historical: rawHistorical, placements: rawPlacements, roles: rawRoles, stageRows: rawStageRows, headcount: rawHeadcount },
    { projects, roles: rawRoles });
  const historical = clientOnly.historical;
  const fn = mcpResolveValue(args.function, historical.map(r => r.functionArea), 'function');
  const country = mcpResolveValue(args.country, historical.map(r => r.country), 'country');
  const inputs = ttfHeadcountInputs({
    roles: clientOnly.roles, headcount: clientOnly.headcount,
    placements: clientOnly.placements, stageRows: clientOnly.stageRows,
  });
  const ttf = computeTTFPrediction(fn, country, historical, inputs.openHeadcount, inputs.closedCensored);
  const matching = historical.filter(r => (!fn || r.functionArea === fn) && (!country || r.country === country));
  const avg = avgTimeToHireDays(matching);
  return mcpOutputGuard({
    scope: `Time to fill, ${MCP_COMPANY_SCOPE}: hires in the last 12 months plus open and paused headcount (Kaplan-Meier, as the Placement Analytics TTF panel).`,
    function: fn,
    country,
    timeToFill: {
      label: ttf.label, medianDays: ttf.medianDays, weeks: ttf.weeks, bandDays: ttf.bandDays,
      medianReached: ttf.medianReached, maxObservedDays: ttf.maxObservedDays,
      events: ttf.events, censored: ttf.censored, closed: ttf.closed, basis: ttf.basis, pooled: ttf.pooled,
    },
    avgTimeToHireDays: avg === null ? null : Math.round(avg),
    sampleHires: matching.length,
    degraded,
  });
}

// ── project_scorecards ────────────────────────────────────────────────
// Wiring mirrors renderCCOverview + renderHealthDetail + _ccHealthCardsHTML (cc-pages.js).
async function mcpProjectScorecards(args) {
  const periods = CONFIG.CC_HEALTH_WINDOWS;
  const period = args.period ? periods.find(w => w.label === args.period) : periods[0];
  const degraded = [];
  const [allRoles, allProjects, assigns, allStageRows, allHeadcount, placementIds, rawActivity52, rawPlacements] = await Promise.all([
    getAllRoles(),
    getProjects(false),
    getAssignments({}),
    mcpSoft(getRoleStageHistory(), [], 'stage history', degraded),
    mcpSoft(getAllHeadcount(), [], 'headcount', degraded),
    mcpSoft(getPlacementHeadcountIds(), [], 'placement headcount', degraded),
    getActivityForAnalytics(CONFIG.MCP.windows.benchmarkWeeks),
    getHistoricalPlacements(),
  ]);
  const base = excludeInternalProjectData(
    { roles: allRoles, projects: allProjects, stageRows: allStageRows, headcount: allHeadcount },
    { projects: allProjects });
  const extra = excludeInternalProjectData(
    { activity: rawActivity52, historical: rawPlacements },
    { projects: allProjects, roles: allRoles });
  const now = new Date();
  const customers = scorecardCustomers(assigns, allProjects, now);
  const projectMap = {};
  base.projects.forEach(pr => { projectMap[String(pr.id)] = pr.CustomerName; });
  const cards = buildProjectScorecards({
    customers,
    roles: base.roles,
    projectMap,
    stageHistory: groupStageHistoryByRole(base.stageRows),
    openSince: oldestOpenHeadcountIndex(base.headcount, placementIds),
    activity52: extra.activity,
    placements: extra.historical,
    weeks: period.weeks,
    today: now,
  }).map(c => ({
    customer: c.customer,
    pipelineHealth: {
      total: c.roleHealth.total, flagged: c.roleHealth.flagged, stuck: c.roleHealth.stuck,
      conversion: c.roleHealth.conversion, behindPace: c.roleHealth.behind,
    },
    healthRag: flaggedShareRAG(c.roleHealth.flagged, c.roleHealth.total),
    metrics: c.metrics.map(m => ({
      label: m.label, value: m.value, unit: m.unit || null, rag: m.rag || null, benchmark: m.tip || null,
    })),
  }));
  return mcpOutputGuard({
    scope: `Command Centre > Project Health scorecards: one card per customer with a live assignment, ${MCP_COMPANY_SCOPE}. Metrics cover the ${period.label} view (${period.weeks} weeks), benchmarked against the same functions and locations on other projects; pipeline health is each pipeline's current state. Worst first.`,
    period: { label: period.label, weeks: period.weeks },
    cards,
    degraded,
  });
}

// ── People tools (N-394) ──────────────────────────────────────────────
// Percent for display: the live ratio x 100 to one decimal, as the People Dashboard's _fmtPct
// shows it. Presentation only; the ratio itself always comes from personUtilisation().
function mcpPct(ratio) {
  return ratio === null || ratio === undefined ? null : Math.round(ratio * 1000) / 10;
}

// ── bench ─────────────────────────────────────────────────────────────
// The Org Chart's Unassigned pool: the same two reads, the same buildBenchPool (N-391).
// since = the earliest start of the person's current rows (all bench rows, or none).
async function mcpBench() {
  const [people, current] = await Promise.all([getPeople(true, true), getCurrentAssignmentsByEmployee()]);
  const rows = buildBenchPool(people, current).map(p => {
    const starts = (current[p.EmployeeName] || []).map(a => mcpOutDay(a.StartDate)).filter(Boolean).sort();
    return { name: p.EmployeeName || null, level: p.Level || null, location: p.Location || null, since: starts[0] || null };
  });
  const capped = mcpCapRows(rows);
  return mcpOutputGuard({
    scope: 'People Org Chart > Unassigned: active deployable staff with no current assignment, or only bench assignments. Placeholders, internal staff, external partners and CSDs are never bench. since = start of their current bench assignment.',
    total: capped.total,
    truncated: capped.truncated,
    people: capped.rows,
  });
}

// ── utilisation ───────────────────────────────────────────────────────
// The People Dashboard, as it reads with the same period filter: figures for the period, the
// Team Utilisation panel's bands, the monthly trend and the Team Utilisation {year} graph.
async function mcpUtilisation(args) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const given = v => v !== undefined && v !== null;
  const year = mcpInt(args.year, 'year', 2020, thisYear, thisYear);
  const month = given(args.month) ? mcpInt(args.month, 'month', 1, 12) : null;
  const quarter = given(args.quarter) ? mcpInt(args.quarter, 'quarter', 1, 4) : null;
  if (month !== null && quarter !== null) throw new Error('Give month or quarter, not both.');
  if (given(args.byLevel) && typeof args.byLevel !== 'boolean') throw new Error('byLevel must be true or false.');
  const filter = month !== null ? { year, month: month - 1, quarter: null }
    : quarter !== null ? { year, month: null, quarter }
    : given(args.year) ? { year, month: null, quarter: null }
    : { year, month: now.getMonth(), quarter: null };
  const { start, end } = peoplePeriodRange(filter);
  const label = month !== null ? `${year}-${String(month).padStart(2, '0')}`
    : quarter !== null ? `Q${quarter} ${year}`
    : given(args.year) ? String(year)
    : `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const degraded = [];
  const [assignments, people, forecastRows] = await Promise.all([
    getAssignments({}),
    getPeople(false),
    mcpSoft(getSalesForecasts(), [], 'SalesForecasts', degraded),
  ]);
  if (wasListDenied('SalesForecasts') && !degraded.includes('SalesForecasts')) degraded.push('SalesForecasts');
  const forecasts = Array.isArray(forecastRows) ? forecastRows : [];
  const allRows = computeMonthlyRows(assignments);
  const periodRows = monthlyRowsInRange(allRows, start, end);
  const u = personUtilisation(periodRows);
  const roll = utilisationBandRollup(periodRows);
  const series = utilisationYearSeries(allRows, assignments, forecasts, activeDeployableCount(people), now);
  const monthKey = idx => `${thisYear}-${String(idx + 1).padStart(2, '0')}`;
  const curMonth = now.getMonth();
  const t = CONFIG.UTILISATION_THRESHOLDS;
  const out = {
    scope: 'People Dashboard utilisation (person-based: each person counts once per day), forecast as the Team Utilisation graph draws it. Percentages only.',
    period: { label, from: localDayISO(start), to: localDayISO(end) },
    utilisationPct: u.total > 0 ? mcpPct(u.ratio) : null,
    billedPersonMonths: u.billed,
    totalPersonMonths: u.total,
    utilisedPeople: roll.total.utilised,
    activePeople: roll.total.active,
    thresholds: { onTrackPct: mcpPct(t.green), atRiskPct: mcpPct(t.amber) },
  };
  if (args.byLevel === true) {
    out.bands = roll.bands.map(b => ({ band: b.band, utilisationPct: mcpPct(b.u), utilised: b.utilised, total: b.total }));
  }
  out.monthly = utilisationByMonth(periodRows).map(m => ({ month: m.month, utilisationPct: mcpPct(m.u) }));
  out.outlook = {
    year: thisYear,
    months: series.points.map((p, i) => ({
      month: monthKey(i),
      actualPct: i <= curMonth ? mcpPct(p.util) : null,
      forecastPct: i > curMonth ? mcpPct(p.util) : null,
      salesForecastPct: i >= curMonth ? mcpPct(series.salesPoints[i].util) : null,
    })),
  };
  out.degraded = degraded;
  return mcpOutputGuard(out);
}

// ── project_team ──────────────────────────────────────────────────────
// The Project page's Project Team, current + upcoming (ended on request). No emails, rates
// or fees; bench and forecast rows are never members.
async function mcpProjectTeam(args) {
  if (args.includeEnded !== undefined && args.includeEnded !== null && typeof args.includeEnded !== 'boolean') {
    throw new Error('includeEnded must be true or false.');
  }
  const degraded = [];
  const projects = await getProjects(false);
  const p = mcpResolveProject(args.project, projects);
  const [rows, tpMap] = await Promise.all([
    getAssignments({ projectId: p.id }),
    mcpSoft(getTalentPartnerDisplayMap(), {}, 'staff names', degraded),
  ]);
  const todayISO = localDayISO();
  const team = ptSortTeam(rows, todayISO)
    .map(r => ({ r, status: ptMemberStatus(r, todayISO) }))
    .filter(x => x.status !== 'forecast');
  const counts = { current: 0, upcoming: 0, ended: 0 };
  team.forEach(x => { counts[x.status] += 1; });
  const shown = team.filter(x => x.status !== 'ended' || args.includeEnded === true);
  const lead = shown.find(x => x.status !== 'ended' && isLeadDmAssignment(x.r));
  return mcpOutputGuard({
    scope: `Project Team of ${p.CustomerName}: current and upcoming members${args.includeEnded === true ? ', plus ended members' : ''}. Level is their grade; leadDm marks the project's lead delivery manager; partner marks an external partner (not Momentum staff, not counted in utilisation).`,
    project: mcpProjectRef(p),
    deliveryManager: mcpPersonName(p.DeliveryManager, tpMap),
    leadDm: lead ? (lead.r.EmployeeName || null) : null,
    counts,
    members: shown.map(x => ({
      name: x.r.EmployeeName || null,
      level: x.r.Level || null,
      partner: isExternalStaff(x.r),   // N-402
      start: mcpOutDay(x.r.StartDate),
      end: mcpOutDay(x.r.EndDate),
      status: x.status,
      leadDm: isLeadDmAssignment(x.r),
    })),
    degraded,
  });
}

// ── Registry ──────────────────────────────────────────────────────────
var MCP_TOOLS = [
  {
    name: 'list_projects',
    description: 'Newton projects (clients) with type, status, dates, delivery manager and CSD. Active only unless active=false. Use it to find a project\'s exact name or id.',
    inputSchema: {
      type: 'object',
      properties: {
        active: { type: 'boolean', description: 'Only Active projects (default true).' },
        type: { type: 'string', enum: CONFIG.PROJECT_TYPES.slice(), description: 'Project type filter.' },
      },
      additionalProperties: false,
    },
    handler: mcpListProjects,
  },
  {
    name: 'project_summary',
    description: 'One project\'s pipeline: pipelines by stage, open headcount, average days open, flagged / behind-pace counts with health RAG, and hire KPIs over the last N weeks (default 13). No names or money.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name (or part of it) or id.' },
        weeks: { type: 'integer', description: 'Hire KPI window in weeks, 1-52 (default 13).' },
      },
      required: ['project'],
      additionalProperties: false,
    },
    handler: mcpProjectSummary,
  },
  {
    name: 'list_roles',
    description: 'Open pipelines (roles), company-wide or for one project, with stage, TPs, headcount, days open and why each is flagged (stuck in stage / low conversion; behind pace is info only). Filters: stage, flaggedOnly, country, function.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or id (omit for all projects).' },
        stage: { type: 'string', enum: CONFIG.ROLE_STAGES.slice(), description: 'Exact stage instead of all open pipelines.' },
        flaggedOnly: { type: 'boolean', description: 'Only flagged pipelines.' },
        country: { type: 'string', description: 'Location, e.g. Portugal.' },
        function: { type: 'string', description: 'Functional area (department), e.g. Engineering.' },
      },
      additionalProperties: false,
    },
    handler: mcpListRoles,
  },
  {
    name: 'role_detail',
    description: 'One pipeline by role id: details, headcount slots, stage timeline, last 12 weeks funnel totals, flag reasons and placement dates. Never candidate names, salaries, budget, hiring manager or notes.',
    inputSchema: {
      type: 'object',
      properties: {
        roleId: { type: 'integer', description: 'Role (pipeline) id from list_roles.' },
      },
      required: ['roleId'],
      additionalProperties: false,
    },
    handler: mcpRoleDetail,
  },
  {
    name: 'activity_summary',
    description: 'Weekly recruiting activity (outreach to hires) by week, totals and conversion %, company-wide or one project, over the last N weeks (default 4), plus the Data Health anomaly checks.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or id (omit for company-wide).' },
        weeks: { type: 'integer', description: 'Weeks back, 1-52 (default 4).' },
      },
      additionalProperties: false,
    },
    handler: mcpActivitySummary,
  },
  {
    name: 'list_placements',
    description: 'Hires (offers accepted) between two dates, company-wide or one project: count, average time to hire, % on time, count by project, and one row per hire with role, project, TP and dates. No candidate names or salaries.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'First day, YYYY-MM-DD.' },
        to: { type: 'string', description: 'Last day, YYYY-MM-DD.' },
        project: { type: 'string', description: 'Project name or id (omit for company-wide).' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    handler: mcpListPlacements,
  },
  {
    name: 'time_to_fill',
    description: 'Predicted time to fill (median days and ± band, Kaplan-Meier over the last 12 months) for a functional area and/or country, as the Placement Analytics panel shows it, plus average time to hire.',
    inputSchema: {
      type: 'object',
      properties: {
        function: { type: 'string', description: 'Functional area, e.g. Engineering.' },
        country: { type: 'string', description: 'Location, e.g. Portugal.' },
      },
      additionalProperties: false,
    },
    handler: mcpTimeToFill,
  },
  {
    name: 'project_scorecards',
    description: 'Command Centre Project Health scorecards: per live client project, flagged / behind-pace pipelines and benchmarked conversion, hires and time to hire for a rolling month or quarter. Worst first.',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: CONFIG.CC_HEALTH_WINDOWS.map(w => w.label), description: 'Scorecard view (default the first).' },
      },
      additionalProperties: false,
    },
    handler: mcpProjectScorecards,
  },
  {
    name: 'bench',
    description: 'Staff on the bench now (the Org Chart Unassigned pool): name, level, location and since when. Names only; no money. Placeholders, internal staff, external partners and CSDs are never bench.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: mcpBench,
  },
  {
    name: 'utilisation',
    description: 'Team utilisation as the People Dashboard shows it, percentages only (no money). Period: year, or month / quarter within it; default this month. Includes monthly trend and the year outlook (actual, forecast, sales forecast).',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer', minimum: 2020, description: 'Year (default this year). With no month or quarter, a year given means the whole year.' },
        month: { type: 'integer', minimum: 1, maximum: 12, description: 'Month 1-12 of the year. Not with quarter.' },
        quarter: { type: 'integer', minimum: 1, maximum: 4, description: 'Quarter 1-4 of the year. Not with month.' },
        byLevel: { type: 'boolean', description: 'Also break utilisation down by level (SDM, PTP, STP, TP).' },
      },
      additionalProperties: false,
    },
    handler: mcpUtilisation,
  },
  {
    name: 'project_team',
    description: 'Who is on a project: current and upcoming team members with level, dates, the lead delivery manager and a partner flag for external partners. Names only; no emails, rates or fees. includeEnded adds past members.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name (or part of it) or id.' },
        includeEnded: { type: 'boolean', description: 'Also list members whose assignment has ended (default false).' },
      },
      required: ['project'],
      additionalProperties: false,
    },
    handler: mcpProjectTeam,
  },
];
