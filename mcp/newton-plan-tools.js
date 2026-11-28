// mcp/newton-plan-tools.js - Newton for Claude: the Hiring Plan tool (N-555, AMCP-9; specs/N-555.md AMCP-F1 - F5).
//
// hiring_plan (read): a CoE project's Hiring Plan against reality - plan rows with their ahead/behind variance, planned vs
// actual role opens by month (the N-317 model: run rate, variance) and planned vs actual hires (an actual hire is the offer
// accepted, AMCP-F3). The maths is js/coe-plan-logic.js (coePlanPosition), the same code the Hiring Plan page and the Report
// Builder export call, so the numbers cannot drift from the page. report_facts (mcp/newton-report-tools.js) adds the same
// numbers as facts.hiringPlan through mcpPlanForReport() below.
//
// Scope is Newton's own (AMCP-F4): mcpScope() decides which projects a caller sees, and a Talent Partner sees the WHOLE plan of
// a project in scope, as the page shows it read-only - mcpTpOwn is deliberately not applied to plan data. Counts, dates, role
// titles and staff names only (MCP-D6, AMCP-E7): talent partners are returned as names, never emails; no candidate names, no
// money, no Notes. Served from GitHub Pages and loaded into the MCP server's vm context LAST (CONFIG.MCP.scripts); it pushes one
// entry onto MCP_TOOLS. newton-report-tools.js calls mcpPlanForReport at run time, so file order is not a load-time dependency.
//
// Rules (tests/lint-mcp.js lintMcpTools): no Graph path, no direct transport, no write-shaped call, no DOM, no spread, and every
// getter registered in MCP_GETTER_LISTS. This file reads three Newton lists (CoEPlanRows, RoleHeadcount, Roles via api getters)
// and writes nothing.

var MCP_PLAN_NONE = 'There is no hiring plan for this project. A plan exists only for a CoE project with planned headcount rows in the Hiring Plan page.';
var MCP_PLAN_NO_PLANS = 'There are no hiring plans on your projects.';
var MCP_PLAN_ASOF_BAD = 'asOf must be today or an earlier date (YYYY-MM-DD).';

// 'YYYY-MM-DD' (a real calendar day, not in the future) -> { day, date } with date at LOCAL noon so localDayISO returns that day.
// Blank -> today. Anything else is refused.
function mcpPlanAsOf(arg) {
  var today = localDayISO(new Date());
  if (arg === undefined || arg === null || String(arg).trim() === '') return mcpPlanAsOfDay(today);
  var q = String(arg).trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q);
  if (!m) throw mcpRefuse(MCP_PLAN_ASOF_BAD);
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  if (isNaN(d) || localDayISO(d) !== q || q > today) throw mcpRefuse(MCP_PLAN_ASOF_BAD);
  return mcpPlanAsOfDay(q);
}

function mcpPlanAsOfDay(day) {
  var p = day.split('-').map(Number);
  return { day: day, date: new Date(p[0], p[1] - 1, p[2], 12, 0, 0) };
}

// The CoE projects the caller can see (live or ended: AMCP-F5b). Scope is mcpScope's.
function mcpPlanCoeProjects(scope, projects) {
  return mcpScopeProjects(scope, projects).filter(function (p) { return p && p.ProjectType === 'CoE'; });
}

function mcpPlanRound1(n) {
  return n === null || n === undefined ? null : Math.round(n * 10) / 10;
}

// A coeOpensByMonth model as the answer: counts and months, no day-string internals. doneToDate = openedToDate (hires to date
// for the hires model).
function mcpPlanModel(m) {
  if (!m) return null;
  return {
    target: m.target,
    doneToDate: m.openedToDate,
    remaining: m.remaining,
    status: m.status,
    cutoffMonth: m.cutoffMonth,
    monthsLeft: m.monthsLeft,
    requiredPerMonth: mcpPlanRound1(m.requiredPerMonth),
    months: m.months.map(function (x) {
      return { month: x.key, planned: x.planned, actual: x.actual, variance: x.variance };
    }),
  };
}

function mcpPlanSummary(rows) {
  var count = function (pred) { return rows.filter(pred).length; };
  return {
    plannedRows: rows.length,
    linkedRows: count(function (r) { return r.linkedHeadcountId !== null; }),
    notLinked: count(function (r) { return r.linkedHeadcountId === null; }),
    opened: count(function (r) { return r.actualOpenDay !== null; }),
    hiresConfirmed: count(function (r) { return r.hireConfirmedDay !== null; }),
    started: count(function (r) { return r.startedDay !== null; }),
    lateToOpen: count(function (r) { return r.status === 'late'; }),
    cancelled: count(function (r) { return r.status === 'cancelled'; }),
  };
}

// One plan row as the answer: talent partners as names, the linked role as its title and current stage.
function mcpPlanRow(r, roleById, tpMap) {
  var role = r.linkedRoleId === null ? null : roleById.get(String(r.linkedRoleId));
  return {
    rowId: mcpId(r.rowId),
    title: r.title,
    talentPartner: mcpTpNames(r.talentPartner, tpMap),
    linkedRole: role ? mcpWeeklyRoleLabel(role) : null,
    stage: role ? (normaliseRoleStage(role.Stage) || null) : null,
    plannedOpenDay: r.plannedOpenDay,
    plannedHireDay: r.plannedHireDay,
    plannedStartDay: r.plannedStartDay,
    plannedOnboardedDay: r.plannedOnboardedDay,
    actualOpenDay: r.actualOpenDay,
    hireConfirmedDay: r.hireConfirmedDay,
    startedDay: r.startedDay,
    openVarianceWeeks: r.openVariance ? { weeks: r.openVariance.weeks, final: r.openVariance.final } : null,
    status: r.status,
  };
}

// The plan answer for one project: everything but the project envelope. `inputs` = { planRows, roles, placements, headcount,
// tpMap } already read; headcount null = the read failed (the caller has put 'headcount' in degraded). Never narrows by Talent Partner.
function mcpPlanShape(inputs, asOf, degraded) {
  var pos = coePlanPosition({ planRows: inputs.planRows, headcount: inputs.headcount, placements: inputs.placements, asOf: asOf.date });
  var roleById = new Map((inputs.roles || []).map(function (r) { return [String(r.id), r]; }));
  var rows = pos.rows.map(function (r) { return mcpPlanRow(r, roleById, inputs.tpMap || {}); });
  var capped = mcpCapRows(rows);
  var notes = ['Variance is actual minus planned, in weeks for a row and in roles for a month: negative = opened early, positive = late. An actual hire is the offer accepted.'];
  if (!pos.hasActuals) notes.push('The headcount could not be read, so the plan dates are shown without actuals, opens or hires.');
  return {
    asOf: pos.asOfDay,
    summary: mcpPlanSummary(pos.rows),
    rows: { total: capped.total, truncated: capped.truncated, rows: capped.rows },
    opens: mcpPlanModel(pos.opens),
    hires: mcpPlanModel(pos.hires),
    notes: notes,
    degraded: degraded,
    notIncluded: ['candidate names', 'salary and spend figures', 'Notes'],
  };
}

// Reads one project's plan inputs, in parallel as the Hiring Plan page does. Soft reads degrade as the page does.
async function mcpPlanRead(projectId, degraded) {
  var planRows = await getCoEPlanRows(projectId);
  var reads = await Promise.all([
    getRolesForProject(projectId),
    mcpSoft(getHeadcountForProject(projectId), null, 'headcount', degraded),
    mcpSoft(getTalentPartnerDisplayMap(), {}, 'staff names', degraded),
  ]);
  var roleIds = reads[0].map(function (r) { return r.id; });
  var ids = new Set(roleIds.map(String));
  // Always filtered by role: an unfiltered placements read returns every placement.
  var placements = roleIds.length
    ? (await getPlacements(null, { roleIds: roleIds })).filter(function (p) { return mcpInRoleSet(ids, p); })
    : [];
  return { planRows: planRows, roles: reads[0], headcount: reads[1], tpMap: reads[2], placements: placements };
}

// report_facts' hiringPlan: null unless the project is CoE with at least one plan row. as-of = the earlier of today and the report
// period's end (periodEnd is a 'YYYY-MM-DD'). `pre` = what report_facts already read for the project: { roles, placements (every
// placement on the project's roles - not the Talent Partner's own), headcount (null if its read failed), tpMap }. The plan rows
// are the only extra read. A failed plan read leaves the key out and says so in degraded.
async function mcpPlanForReport(project, periodEnd, pre, degraded) {
  if (!project || project.ProjectType !== 'CoE') return null;
  var planRows = await mcpSoft(getCoEPlanRows(project.id), null, 'hiring plan', degraded);
  if (!planRows || !planRows.length) return null;
  var today = localDayISO(new Date());
  var end = periodEnd && String(periodEnd) < today ? String(periodEnd) : today;
  var asOf = mcpPlanAsOfDay(end);
  var shaped = mcpPlanShape({ planRows: planRows, roles: pre.roles, placements: pre.placements, headcount: pre.headcount, tpMap: pre.tpMap }, asOf, []);
  return {
    scope: 'The whole hiring plan for this project (every plan row, not narrowed by the report\'s role filter or by a Talent Partner\'s own roles), as it stood on ' + shaped.asOf + ': the report period ends ' + (periodEnd || 'today') + ', capped at today.',
    asOf: shaped.asOf,
    summary: shaped.summary,
    rows: shaped.rows,
    opens: shaped.opens,
    hires: shaped.hires,
    notes: shaped.notes,
  };
}

async function mcpHiringPlan(args) {
  var scope = await mcpScope();
  var asOf = mcpPlanAsOf(args.asOf);
  var degraded = [];
  var projects = await getProjects(false);
  var coe = mcpPlanCoeProjects(scope, projects);
  var hasProject = args.project !== undefined && args.project !== null && String(args.project).trim() !== '';
  if (!hasProject) {
    var counts = await Promise.all(coe.map(function (p) {
      return mcpSoft(getCoEPlanRows(p.id), [], 'hiring plan', degraded);
    }));
    var list = coe.map(function (p, i) { return { id: mcpId(p.id), name: p.CustomerName || null, planRows: counts[i].length }; })
      .filter(function (x) { return x.planRows > 0; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var capped = mcpCapRows(list);
    return mcpOutputGuard({
      scope: 'CoE projects on your Newton access that have a hiring plan. Give project (a name or id) for one plan.',
      total: capped.total, truncated: capped.truncated, projects: capped.rows,
      message: list.length ? null : MCP_PLAN_NO_PLANS,
      degraded: degraded,
    });
  }
  // A project in scope that is not CoE is "no plan", not "not found": resolve against everything the caller sees.
  var project = mcpResolveProject(args.project, projects, scope);
  var ref = { id: mcpId(project.id), name: project.CustomerName || null };
  if (project.ProjectType !== 'CoE') return mcpOutputGuard({ project: ref, plan: null, message: MCP_PLAN_NONE });
  var inputs = await mcpPlanRead(project.id, degraded);
  if (!inputs.planRows.length) return mcpOutputGuard({ project: ref, plan: null, message: MCP_PLAN_NONE });
  var shaped = mcpPlanShape(inputs, asOf, degraded);
  return mcpOutputGuard({
    project: ref,
    asOf: shaped.asOf,
    summary: shaped.summary,
    rows: shaped.rows,
    opens: shaped.opens,
    hires: shaped.hires,
    notes: shaped.notes,
    notIncluded: shaped.notIncluded,
    degraded: shaped.degraded,
    role: scope.tpEmail ? 'The whole plan for a project you work on, as the Hiring Plan page shows it to you (read-only).' : 'The whole plan for the project.',
  });
}

MCP_TOOLS.push(
  {
    name: 'hiring_plan',
    description: 'A CoE project\'s Hiring Plan vs reality, as the page shows it: planned roles with dates and weeks ahead/behind, planned vs actual opens by month with run rate, planned vs actual hires (offer accepted). Names, counts, dates. No project: lists CoE projects with a plan.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name (or part of it) or id. Leave out to list the CoE projects that have a hiring plan.' },
        asOf: { type: 'string', description: 'The day to read the position on, YYYY-MM-DD, today or earlier (default today).' },
      },
      additionalProperties: false,
    },
    roles: ['admin', 'leadership', 'delivery_manager', 'talent_partner'],   // AMCP-A1 / F4: all four; DM and TP are scoped by mcpScope()
    handler: mcpHiringPlan,
  },
);
