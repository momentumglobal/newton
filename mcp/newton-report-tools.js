// mcp/newton-report-tools.js - Newton for Claude: report narrative tools (N-550, AMCP-6; specs/N-550.md AMCP-E1 - E7).
//
// report_facts (read) and draft_report_narrative (write, preview + confirm). The pair works on an EXISTING saved report
// in the Report Library, found by project + title (AMCP-E1): report_facts returns the report's layout, its text blocks
// as plain text and counts-and-dates facts for the report's own period and role filter (AMCP-E7: no candidate names, no
// money); draft_report_narrative replaces the text blocks Claude names, after the user has seen old and new text side by
// side. It never creates a report, never touches panels, order, title, period or scope, and never exports or shares
// anything (Newton has no such state: export is a browser print). Served from GitHub Pages and loaded into the MCP
// server's vm context after mcp/newton-write-tools.js (CONFIG.MCP.scripts order); it pushes both entries onto MCP_TOOLS.
//
// Rules (tests/lint-mcp.js lintMcpWriteTools): the lintMcpTools rules (no Graph path, no direct transport, no DOM, no
// spread, getters registered in MCP_GETTER_LISTS), and a write-shaped call only inside the top-level function named by
// `commit:` and only for an MCP_APPROVED_WRITERS function (updateSavedReport). The report rules are NOT written here:
// visibility, block parsing, HTML <-> text, the ModuleOrder replace, the period window and the KPI numbers are the
// shared functions in js/report-logic.js (the same ones Report Builder and the dashboards call); the SavedReports
// reads and the one write are js/api-reports.js. Scope is Newton's own: mcpScope() (newton-tools.js).

var MCP_REPORT_SOURCE = 'claude';   // block.source on every text block Claude writes (AMCP-A7)
var MCP_REPORT_PROJECT_ONLY = 'Only project reports can be updated through Claude.';
var MCP_REPORT_NO_TEXT = 'This report has no text block. Add a text block in Report Builder first.';
var MCP_REPORT_NOT_EXPORTED = 'Claude does not export or share reports.';

function mcpReportProjectOf(report) {
  return String(report.ProjectID === undefined || report.ProjectID === null ? '' : report.ProjectID);
}

// The reports the caller can open in the Report Library: no template, and visible under reportVisibleTo (the Library's
// own rule). Not yet narrowed to what Claude may work on.
function mcpReportVisible(scope, rows) {
  return partitionTemplates(rows || []).items.filter(function (r) {
    return reportVisibleTo(scope.role, scope.email, scope.projectIds, r);
  });
}

// What Claude may work on: project-scope reports whose project is in the caller's Newton scope (A3).
function mcpReportUsable(scope, report) {
  return report.Scope === 'project' && mcpInScope(scope, mcpReportProjectOf(report));
}

function mcpReportLabel(report, projById) {
  var p = projById.get(mcpReportProjectOf(report));
  return '"' + (report.Title || '(untitled)') + '"' + (p ? ' (' + (p.CustomerName || 'unnamed project') + ')' : '') + ' - id ' + report.id;
}

// The report an id means, or a refusal. Missing, hidden, out of scope, company-scope and template answer the same
// MCP_UNAVAILABLE for a scoped caller; an Admin is told why a company report is refused.
function mcpReportById(id, scope, rows) {
  var q = String(id === undefined || id === null ? '' : id).trim();
  var visible = mcpReportVisible(scope, rows);
  var hit = /^\d+$/.test(q) ? visible.find(function (r) { return String(r.id) === q; }) : null;
  if (hit && mcpReportUsable(scope, hit)) return hit;
  if (hit && !scope.scoped) throw mcpRefuse(MCP_REPORT_PROJECT_ONLY);
  if (scope.scoped) throw mcpRefuse(MCP_UNAVAILABLE);
  throw new Error('No report has id ' + q + '. report_facts lists the reports you can update.');
}

// A report by title (exact, then unique partial) or id, optionally narrowed to a project. Several matches are listed.
function mcpReportResolve(arg, projectArg, scope, rows, projects) {
  var visible = mcpReportVisible(scope, rows);
  var usable = visible.filter(function (r) { return mcpReportUsable(scope, r); });
  var projById = mcpProjectIndex(projects);
  if (projectArg !== undefined && projectArg !== null && String(projectArg).trim() !== '') {
    var p = mcpResolveProject(projectArg, projects, scope);
    usable = usable.filter(function (r) { return mcpReportProjectOf(r) === String(p.id); });
    visible = visible.filter(function (r) { return mcpReportProjectOf(r) === String(p.id) || r.Scope === 'company'; });
  }
  var q = String(arg).trim();
  if (/^\d+$/.test(q)) {
    var byId = usable.find(function (r) { return String(r.id) === q; });
    if (byId) return byId;
    if (visible.some(function (r) { return String(r.id) === q; })) {
      if (scope.scoped) throw mcpRefuse(MCP_UNAVAILABLE);
      throw mcpRefuse(MCP_REPORT_PROJECT_ONLY);
    }
  }
  var n = mcpNorm(q);
  var exact = usable.filter(function (r) { return mcpNorm(r.Title) === n; });
  var cands = exact.length ? exact : usable.filter(function (r) { return mcpNorm(r.Title).indexOf(n) !== -1; });
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) {
    var shown = cands.slice(0, 8).map(function (r) { return mcpReportLabel(r, projById); }).join('; ');
    throw new Error('"' + q + '" matched ' + cands.length + ' reports: ' + shown + (cands.length > 8 ? ' and more' : '') + '. Say which one (id).');
  }
  if (scope.scoped) throw mcpRefuse(MCP_UNAVAILABLE);
  var company = visible.some(function (r) { return r.Scope !== 'project' && (mcpNorm(r.Title) === n || mcpNorm(r.Title).indexOf(n) !== -1); });
  if (company) throw mcpRefuse(MCP_REPORT_PROJECT_ONLY);
  var names = usable.slice(0, 20).map(function (r) { return mcpReportLabel(r, projById); }).join('; ') || 'none';
  throw new Error('No report matched "' + q + '". Reports: ' + names + '.');
}

// ── report_facts ──────────────────────────────────────────────────────

function mcpReportTrimText(text) {
  var max = CONFIG.MCP.maxNarrativeChars;
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text: text, truncated: false };
}

// The nine funnel totals with each step as a percentage of the step before (the Pipeline Summary's own conversion row).
function mcpReportFunnel(acts) {
  var totals = mcpFunnelTotals(acts);
  return MCP_FUNNEL_FIELDS.map(function (f, i) {
    var prev = i > 0 ? totals[MCP_FUNNEL_FIELDS[i - 1]] : 0;
    return { step: f, total: totals[f], pctOfPreviousStep: i > 0 && prev > 0 ? Math.round((totals[f] / prev) * 100) : null };
  });
}

// Counts and dates for the report's own scope: mirrors rbFetchData (project scope) and fetchDashboardData's isTP branch.
async function mcpReportBuildFacts(report, scope, degraded) {
  var projectId = mcpReportProjectOf(report);
  var projectRoles = await getRolesForProject(projectId);
  var roleIds = projectRoles.map(function (r) { return r.id; });
  var allIds = new Set(roleIds.map(String));
  var reads = await Promise.all([
    getWeeklyActivity(null, null, { roleIds: roleIds }),
    getPlacements(null, { roleIds: roleIds }),
    mcpSoft(getAllHeadcount(), null, 'headcount', degraded),
    mcpSoft(getRoleStageHistory(), [], 'stage history', degraded),
    mcpSoft(getTalentPartnerDisplayMap(), {}, 'staff names', degraded),
  ]);
  var roleFilter = report.RoleID && String(report.RoleID) !== 'all' ? String(report.RoleID) : null;
  var roles = mcpTpOwn(scope, projectRoles, 'TalentPartner');
  if (roleFilter) roles = roles.filter(function (r) { return String(r.id) === roleFilter; });
  var ownIds = new Set(roles.map(function (r) { return String(r.id); }));
  var activity = mcpTpOwn(scope, reads[0].filter(function (a) { return mcpInRoleSet(allIds, a); }), 'TalentPartner')
    .filter(function (a) { return mcpInRoleSet(ownIds, a); });
  var placements = reads[1].filter(function (pl) { return mcpInRoleSet(ownIds, pl); });
  var hc = dashboardHeadcountContext(roles, placements, reads[2]);
  var tpMap = reads[4];
  var win = reportPeriodWindow(report.Period || 'this_quarter');
  var kpiKey = ['month', 'quarter', 'year'].indexOf(report.KpiPeriod) !== -1 ? report.KpiPeriod : 'quarter';
  var inPeriod = activity.filter(function (a) { return activityInDetailPeriod(a, win.key); });

  var byRoleMap = new Map();
  inPeriod.forEach(function (a) {
    var k = String(a.RoleIDLookupId || a.RoleID || '');
    if (!byRoleMap.has(k)) byRoleMap.set(k, []);
    byRoleMap.get(k).push(a);
  });
  var roleById = new Map(roles.map(function (r) { return [String(r.id), r]; }));
  var byRole = Array.from(byRoleMap.keys()).map(function (k) {
    var r = roleById.get(k);
    var totals = mcpFunnelTotals(byRoleMap.get(k));
    var row = { roleId: mcpId(k), role: r ? mcpWeeklyRoleLabel(r) : 'Unknown role', stage: r ? (normaliseRoleStage(r.Stage) || null) : null };
    MCP_FUNNEL_FIELDS.forEach(function (f) { row[f] = totals[f]; });
    return row;
  }).sort(function (a, b) { return String(a.role).localeCompare(String(b.role)); });

  var tpGroups = new Map();
  inPeriod.forEach(function (a) {
    var name = mcpTpNames(a.TalentPartner, tpMap).join(' & ') || 'Unassigned';
    if (!tpGroups.has(name)) tpGroups.set(name, []);
    tpGroups.get(name).push(a);
  });
  var byTp = Array.from(tpGroups.keys()).sort().map(function (name) {
    var totals = mcpFunnelTotals(tpGroups.get(name));
    var row = { name: name };
    MCP_FUNNEL_FIELDS.forEach(function (f) { row[f] = totals[f]; });
    return row;
  });

  var stageHistory = groupStageHistoryByRole(reads[3]);
  var today = new Date();
  var actsByRole = new Map();
  activity.forEach(function (a) {
    var k = String(a.RoleIDLookupId || a.RoleID || '');
    if (!actsByRole.has(k)) actsByRole.set(k, []);
    actsByRole.get(k).push(a);
  });
  var flagged = [];
  roles.filter(function (r) { return isOpenPipelineStage(r.Stage); }).forEach(function (r) {
    var f = mcpFlagPick(roleFlagReasons(r, actsByRole.get(String(r.id)) || [], stageHistory, today, { openSince: hc.openSince }));
    if (f.flagged) flagged.push({ role: mcpWeeklyRoleLabel(r), stage: normaliseRoleStage(r.Stage) || null, reasons: f.reasons, daysInStage: f.daysInStage, stageBudget: f.stageBudget });
  });
  var longOpen = longOpenPipelines(roles, hc.openSince, LONG_OPEN_DAYS).map(function (x) {
    return { role: mcpWeeklyRoleLabel(x.r), stage: normaliseRoleStage(x.r.Stage) || null, daysOpen: x.days };
  });
  var starters = upcomingStarterPlacements(placements).map(function (pl) {
    var r = roleById.get(String(pl.RoleIDLookupId)) || roleById.get(String(pl.RoleID));
    return { role: r ? mcpWeeklyRoleLabel(r) : 'Unknown role', startDate: mcpOutDay(pl.ProvisionalStartDate) };
  });
  var hires = hireKpis(hc.hires, win.start, win.end);
  var kpi = kpiStripModel(roles, activity, kpiKey, placements, hc);
  var cappedRoles = mcpCapRows(byRole);
  var cappedLong = mcpCapRows(longOpen);
  var cappedFlag = mcpCapRows(flagged);
  var cappedStart = mcpCapRows(starters);
  return {
    kpiPeriod: kpiKey,
    period: win,
    roleFilter: roleFilter && roleById.get(roleFilter) ? mcpWeeklyRoleLabel(roleById.get(roleFilter)) : (roleFilter ? 'One role (not one you can see)' : 'All roles'),
    facts: {
      kpi: {
        scope: 'KPI strip for the KPI period (' + kpiKey + ', relative to today); previous = the period before it.',
        activePipelines: kpi.activePipelines, openHeadcount: kpi.openHeadcount, pipelineBacklog: kpi.backlogPipelines,
        avgDaysOpen: kpi.avgOpenDays, hiresToDate: kpi.totalHires,
        submissionConversionPct: kpi.convPct, ivToOfferRatio: kpi.ivOfferR, offerSuccessPct: kpi.offerPct,
        avgDaysToHire: kpi.avgDays, hiredOnTimePct: kpi.onTimePct,
        previous: { submissionConversionPct: kpi.prev.convPct, ivToOfferRatio: kpi.prev.ivOfferR, offerSuccessPct: kpi.prev.offerPct, avgDaysToHire: kpi.prev.avgDays, hiredOnTimePct: kpi.prev.onTimePct },
      },
      funnel: { scope: 'Weekly activity in the report period (' + win.start + ' to ' + win.end + ').', steps: mcpReportFunnel(inPeriod) },
      byRole: { total: cappedRoles.total, truncated: cappedRoles.truncated, rows: cappedRoles.rows },
      roles: {
        byStage: mcpStageCounts(roles),
        openThirtyPlusDays: { total: cappedLong.total, truncated: cappedLong.truncated, rows: cappedLong.rows },
        flagged: { total: cappedFlag.total, truncated: cappedFlag.truncated, rows: cappedFlag.rows },
      },
      hires: { from: win.start, to: win.end, placed: hires.count, avgDaysToHire: hires.avgDays, hiredOnTimePct: hires.onTimePct, offersAcceptedInActivity: mcpFunnelTotals(inPeriod).Hires },
      upcomingStarters: { total: cappedStart.total, truncated: cappedStart.truncated, rows: cappedStart.rows },
      activityByTalentPartner: byTp,
    },
    notIncluded: ['candidate names', 'salary and spend figures', 'rejection reasons and counts (not readable through Claude)', 'Notes'],
    role: scope.tpEmail ? 'Your own roles and rows on this project, as the report itself shows a Talent Partner.' : 'Every role on the project that the report\'s role filter includes.',
  };
}

async function mcpReportFacts(args) {
  var scope = await mcpScope();
  var degraded = [];
  var reads = await Promise.all([getSavedReports(), getProjects(false)]);
  var projects = reads[1];
  var projById = mcpProjectIndex(projects);
  var hasReport = args.report !== undefined && args.report !== null && String(args.report).trim() !== '';
  if (!hasReport) {
    var list = mcpReportVisible(scope, reads[0]).filter(function (r) { return mcpReportUsable(scope, r); });
    if (args.project !== undefined && args.project !== null && String(args.project).trim() !== '') {
      var p = mcpResolveProject(args.project, projects, scope);
      list = list.filter(function (r) { return mcpReportProjectOf(r) === String(p.id); });
    }
    var rows = list.map(function (r) {
      var pr = projById.get(mcpReportProjectOf(r));
      return { reportId: String(r.id), title: r.Title || null, project: pr ? (pr.CustomerName || null) : null, period: reportPeriodWindow(r.Period || 'this_quarter').label };
    }).sort(function (a, b) { return String(a.project).localeCompare(String(b.project)) || String(a.title).localeCompare(String(b.title)); });
    var capped = mcpCapRows(rows);
    return mcpOutputGuard({
      scope: 'Project reports in the Report Library that you can update through Claude. Give report (a title or an id) for one report\'s text and facts.',
      total: capped.total, truncated: capped.truncated, reports: capped.rows, degraded: degraded,
    });
  }
  var report = mcpReportResolve(args.report, args.project, scope, reads[0], projects);
  var blocks = reportBlocks(report.ModuleOrder);
  var layout = reportLayout(blocks);
  var built = await mcpReportBuildFacts(report, scope, degraded);
  var pr = projById.get(mcpReportProjectOf(report));
  var texts = reportTextBlocks(blocks).map(function (t) {
    var tr = mcpReportTrimText(t.text);
    return { blockId: t.blockId, position: t.position, after: t.after, text: tr.text, chars: t.text.length, truncated: tr.truncated };
  });
  return mcpOutputGuard({
    report: {
      reportId: String(report.id), title: report.Title || null,
      project: pr ? { id: mcpId(pr.id), name: pr.CustomerName || null } : null,
      roleFilter: built.roleFilter, period: built.period, kpiPeriod: built.kpiPeriod,
      panels: layout.filter(function (x) { return x.type === 'panel'; }).map(function (x) { return { key: x.key, label: x.label }; }),
      layout: layout.map(function (x) { return x.type === 'panel' ? { position: x.position, type: 'panel', key: x.key, label: x.label } : { position: x.position, type: 'text', blockId: x.id }; }),
    },
    textBlocks: texts,
    textNote: 'Existing text is shown as the report holds it. It was written by a person and may contain names or figures; do not add any that Newton for Claude does not return.',
    facts: built.facts,
    scope: built.role,
    notIncluded: built.notIncluded,
    degraded: degraded,
  });
}

// ── draft_report_narrative ────────────────────────────────────────────

function mcpReportEditsArg(args) {
  var max = CONFIG.MCP.maxNarrativeEdits;
  var list = args.edits;
  if (typeof args.reportId !== 'string' || !args.reportId.trim()) throw mcpRefuse('Give the reportId from report_facts.');
  if (!Array.isArray(list) || !list.length) throw mcpRefuse('Give at least one text block to replace.');
  if (list.length > max) throw mcpRefuse('Replace at most ' + max + ' text blocks in one go.');
  var seen = {};
  list.forEach(function (e, i) {
    var who = 'Edit ' + (i + 1) + ': ';
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw mcpRefuse(who + 'each edit must be an object.');
    Object.keys(e).forEach(function (k) { if (k !== 'blockId' && k !== 'text') throw mcpRefuse(who + 'unknown field "' + k + '".'); });
    if (typeof e.blockId !== 'string' || !e.blockId.trim()) throw mcpRefuse(who + 'give the blockId from report_facts.');
    if (typeof e.text !== 'string' || !e.text.trim()) throw mcpRefuse(who + 'the text is empty. To clear a block, do it in Newton.');
    if (e.text.length > CONFIG.MCP.maxNarrativeChars) throw mcpRefuse(who + 'keep each block to ' + CONFIG.MCP.maxNarrativeChars + ' characters.');
    if (seen[e.blockId.trim()]) throw mcpRefuse(who + 'block ' + e.blockId.trim() + ' is in this call twice.');
    seen[e.blockId.trim()] = true;
  });
  return list;
}

async function mcpReportDraftPreview(args, ctx) {
  var scope = await mcpScope();
  var edits = mcpReportEditsArg(args);
  var report = mcpReportById(args.reportId, scope, await getSavedReports());
  var layout = reportLayout(reportBlocks(report.ModuleOrder));
  var texts = layout.filter(function (x) { return x.type === 'text'; });
  if (!texts.length) throw mcpRefuse(MCP_REPORT_NO_TEXT);
  var after = {};
  reportTextBlocks(reportBlocks(report.ModuleOrder)).forEach(function (t) { after[t.blockId] = t.after; });
  var changes = [];
  var planned = [];
  edits.forEach(function (e, i) {
    var id = e.blockId.trim();
    var item = texts.find(function (x) { return x.id === id; });
    if (!item) throw mcpRefuse('Edit ' + (i + 1) + ': block ' + id + ' is not a text block of this report. report_facts lists them.');
    var toContent = reportTextToHtml(e.text);
    var from = reportHtmlToText(item.html);
    var to = reportHtmlToText(toContent);
    if (!to) throw mcpRefuse('Edit ' + (i + 1) + ': the text is empty. To clear a block, do it in Newton.');
    if (to === from) throw mcpRefuse('Edit ' + (i + 1) + ': block ' + id + ' already says that.');
    changes.push({ field: 'Text block ' + item.position + ' (after ' + after[id] + ')', from: from || '(empty)', to: to });
    planned.push({ blockId: id, position: item.position, fromContent: item.html, toContent: toContent });
  });
  return {
    summary: 'Replace the text in ' + planned.length + ' text block' + (planned.length === 1 ? '' : 's') + ' of "' + (report.Title || 'this report') + '".',
    changes: changes,
    warnings: [
      'This replaces the text now in the report - the previous wording is not kept in Newton.',
      'Check names, figures and tone before the report goes to the client. ' + MCP_REPORT_NOT_EXPORTED,
      'If this report is open in Report Builder, saving there afterwards overwrites this change.',
    ],
    plan: { reportId: String(report.id), title: String(report.Title || ''), projectId: mcpReportProjectOf(report), edits: planned },
  };
}

// Runs on the stored plan only. Everything is re-checked before the one write: the report is still there, still
// visible and in scope, still the same report, and every block still holds the text that was previewed.
async function mcpReportDraftCommit(plan, ctx) {
  var scope = await mcpScope();
  _cacheInvalidate('SavedReports');
  var rows = await getSavedReports();
  if (!rows.some(function (r) { return String(r.id) === plan.reportId; })) throw mcpWeeklyStale();
  var report = mcpReportById(plan.reportId, scope, rows);
  if (String(report.Title || '') !== plan.title || mcpReportProjectOf(report) !== plan.projectId) throw mcpWeeklyStale();
  var layout = reportLayout(reportBlocks(report.ModuleOrder));
  plan.edits.forEach(function (e) {
    var item = layout.find(function (x) { return x.type === 'text' && x.id === e.blockId; });
    if (!item || item.html !== e.fromContent) throw mcpWeeklyStale();
  });
  var moduleOrder = reportReplaceTextBlocks(report.ModuleOrder, plan.edits.map(function (e) { return { blockId: e.blockId, content: e.toContent }; }), MCP_REPORT_SOURCE);
  await updateSavedReport(plan.reportId, { ModuleOrder: moduleOrder });
  _cacheInvalidate('SavedReports');
  var again = (await getSavedReports()).find(function (r) { return String(r.id) === plan.reportId; });
  var stored = again ? reportLayout(reportBlocks(again.ModuleOrder)) : [];
  var verified = plan.edits.every(function (e) {
    var item = stored.find(function (x) { return x.type === 'text' && x.id === e.blockId; });
    return !!item && item.html === e.toContent;
  });
  return mcpOutputGuard({
    saved: plan.edits.map(function (e) { return { block: e.position }; }),
    report: { reportId: plan.reportId, title: plan.title },
    verified: verified,
    warning: verified ? null : 'Newton saved the change but the report did not read back as expected. Ask the user to open the report in Report Builder and check it.',
    next: 'Open the report in Report Builder to review, edit and export it. ' + MCP_REPORT_NOT_EXPORTED,
  });
}

MCP_TOOLS.push(
  {
    name: 'report_facts',
    description: 'A saved project report from the Report Library (by title and project): its layout, the text in each text block, and counts and dates for its period (KPIs, funnel, roles, flags, hires, starters). No names or money. Without a report it lists the ones you can update. Use before draft_report_narrative.',
    inputSchema: {
      type: 'object',
      properties: {
        report: { type: 'string', description: 'The report\'s title (or part of it) or id. Leave out to list the reports you can update.' },
        project: { type: 'string', description: 'Optional project name or id, to narrow a title.' },
      },
      additionalProperties: false,
    },
    roles: ['admin', 'delivery_manager', 'talent_partner'],   // AMCP-A2: Leadership has no Report Library
    handler: mcpReportFacts,
  },
  {
    name: 'draft_report_narrative',
    description: 'Replace the text in existing text blocks of a saved project report (use report_facts first for the reportId, blockIds and the facts). Write each block as plain text: a blank line between paragraphs, "## " for a heading, "- " for a bullet; HTML is not honoured. It overwrites what the block holds now, does not create reports, change panels, export or share anything, and keeps no copy of the old text. Up to ' + CONFIG.MCP.maxNarrativeEdits + ' blocks per call. Use only the facts report_facts returned: no candidate names or money.',
    inputSchema: {
      type: 'object',
      properties: {
        reportId: { type: 'string', description: 'The reportId from report_facts.' },
        edits: {
          type: 'array',
          minItems: 1,
          maxItems: CONFIG.MCP.maxNarrativeEdits,
          description: 'The text blocks to replace.',
          items: {
            type: 'object',
            properties: {
              blockId: { type: 'string', description: 'The blockId of a text block, from report_facts.' },
              text: { type: 'string', description: 'The new text for the block, in plain text (blank line = new paragraph, "## " heading, "- " bullet).' },
            },
            required: ['blockId', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['reportId', 'edits'],
      additionalProperties: false,
    },
    roles: ['admin', 'delivery_manager', 'talent_partner'],   // AMCP-A2: Leadership is read-only
    write: true,
    preview: mcpReportDraftPreview,
    commit: mcpReportDraftCommit,
  },
);
