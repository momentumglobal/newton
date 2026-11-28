// tests/assert-mcp.js — Newton for Claude reporting tools (N-393): the synchronous checks.
// Loads AFTER tests/assertions.js and pushes into ASSERTIONS. mcp/newton-tools.js is loaded
// into the same vm by tests/run.js (declarations only). The handlers themselves are async and
// read through Graph, so they run in tests/mcp-tools-check.js (Node side, fixture Graph).

var MCP_N393_TOOL_NAMES = ['list_projects', 'project_summary', 'list_roles', 'role_detail',
  'activity_summary', 'list_placements', 'time_to_fill', 'project_scorecards'];
var MCP_N394_TOOL_NAMES = ['bench', 'utilisation', 'project_team'];
var MCP_N466_TOOL_NAMES = ['workforce_segmentation'];
var MCP_N467_TOOL_NAMES = ['joiners'];
var MCP_N535_TOOL_NAMES = ['business_goals'];
var MCP_N547_TOOL_NAMES = ['search_guides', 'read_guide_section'];   // mcp/newton-guides.js, loaded after newton-tools.js
var MCP_N555_TOOL_NAMES = ['hiring_plan'];   // mcp/newton-plan-tools.js, loaded last (N-555: one read tool)
var MCP_N550_TOOL_NAMES = ['report_facts', 'draft_report_narrative'];   // mcp/newton-report-tools.js, loaded after newton-write-tools.js (N-550: one read tool, one write tool)
var MCP_N548_TOOL_NAMES = ['log_weekly_activity', 'update_role_stage', 'draft_report_narrative'];   // mcp/newton-write-tools.js, loaded after newton-guides.js (the write tools: N-548, N-549)

function _mcpThrows(fn, re, label) {
  try { fn(); } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`${label}: threw "${e.message}", expected ${re}`);
    return;
  }
  throw new Error(`${label}: did not throw`);
}

// N-551 (AMCP-7): the headings of mcp/README.md, in order. The README is also what search_guides splits by heading.
var MCP_N551_README_HEADS = ['What it is', 'What you can do', 'How changes work', 'What it cannot do', 'What each role sees', 'Before you start', 'Install', 'First sign-in', 'Things to ask', 'Signing in again', 'Updating', 'Uninstalling', 'If something goes wrong', 'Privacy and safety'];

ASSERTIONS.push(
  {
    name: 'N-393 AC1 / N-394 AC1 MCP_TOOLS: the eight reporting tools then bench, utilisation, project_team; named handlers declared once, closed schemas, enums from CONFIG',
    fn: function () {
      _assertEqual(MCP_TOOLS.map(t => t.name), MCP_N393_TOOL_NAMES.concat(MCP_N394_TOOL_NAMES, MCP_N466_TOOL_NAMES, MCP_N467_TOOL_NAMES, MCP_N535_TOOL_NAMES, MCP_N547_TOOL_NAMES, ['log_weekly_activity', 'update_role_stage'], MCP_N550_TOOL_NAMES, MCP_N555_TOOL_NAMES), 'tool names and order');
      MCP_TOOLS.filter(t => MCP_N548_TOOL_NAMES.indexOf(t.name) === -1).forEach(t => {   // the write tool has its own shape checks (N-548)
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(t.name) || t.name === 'newton_status') throw new Error(`bad tool name ${t.name}`);
        if (typeof t.handler !== 'function' || !/^mcp[A-Z]\w+$/.test(t.handler.name)) throw new Error(`${t.name}: handler must be a named mcp<Name> function`);
        if (typeof MCP_SOURCES !== 'undefined') {
          const decl = (MCP_SOURCES[MCP_N547_TOOL_NAMES.indexOf(t.name) >= 0 ? 'newton-guides.js' : MCP_N550_TOOL_NAMES.indexOf(t.name) >= 0 ? 'newton-report-tools.js' : MCP_N555_TOOL_NAMES.indexOf(t.name) >= 0 ? 'newton-plan-tools.js' : 'newton-tools.js'].match(new RegExp('async function ' + t.handler.name + '\\(', 'g')) || []).length;
          _assertEqual(decl, 1, `${t.name}: ${t.handler.name} declared once as a top-level async function`);
        }
        if (!t.inputSchema || t.inputSchema.type !== 'object' || t.inputSchema.additionalProperties !== false) throw new Error(`${t.name}: schema must be a closed object`);
        if (!t.description || t.description.length > 300) throw new Error(`${t.name}: description missing or over 300 chars`);
        (t.inputSchema.required || []).forEach(r => { if (!t.inputSchema.properties[r]) throw new Error(`${t.name}: required ${r} has no property`); });
      });
      const prop = (tool, p) => MCP_TOOLS.find(t => t.name === tool).inputSchema.properties[p];
      _assertEqual(prop('list_projects', 'type').enum, CONFIG.PROJECT_TYPES.slice(), 'project types from CONFIG');
      _assertEqual(prop('list_roles', 'stage').enum, CONFIG.ROLE_STAGES.slice(), 'stages from CONFIG');
      _assertEqual(prop('project_scorecards', 'period').enum, CONFIG.CC_HEALTH_WINDOWS.map(w => w.label), 'scorecard periods from CONFIG');
    },
  },
  {
    name: 'N-393 AC2 CONFIG.MCP: AnomalyAcks allowed, outputDenyFields covers every MCP-D6 field, windows + maxRows set, contract 2 (N-546)',
    fn: function () {
      const m = CONFIG.MCP;
      _assertEqual(m.contract, 2, 'contract 2 since N-546 (N-393 B8 kept it at 1)');
      if (!m.allowedLists.includes('AnomalyAcks')) throw new Error('AnomalyAcks not in allowedLists');
      const d = m.outputDenyFields;
      const need = { Placements: ['CandidateName', 'SalaryAgreed', 'Notes'], RejectedOffers: ['CandidateName', 'SalaryOffered', 'RejectionReason'],
        Roles: ['Budget', 'HiringManager', 'Notes'], Projects: ['Notes'], RoleHeadcount: ['Notes'], RoleHistory: ['OldValue', 'NewValue'], AnomalyAcks: ['Note'] };
      Object.keys(need).forEach(list => need[list].forEach(f => {
        if (!(d[list] || []).includes(f)) throw new Error(`outputDenyFields.${list} lacks ${f}`);
      }));
      ['summaryWeeks', 'flagActivityWeeks', 'roleWeeks', 'activityWeeks', 'benchmarkWeeks', 'maxWeeks'].forEach(k => {
        if (!Number.isInteger(m.windows[k]) || m.windows[k] < 1 || m.windows[k] > m.windows.maxWeeks) throw new Error(`windows.${k} not a week count within maxWeeks`);
      });
      if (!Number.isInteger(m.maxRows) || m.maxRows < 1) throw new Error('maxRows');
    },
  },
  {
    name: 'N-393 mcpResolveProject — id, exact name any case, unique partial; ambiguous and unknown list candidates',
    fn: function () {
      const P = [{ id: '1', CustomerName: 'Acme Bank' }, { id: '2', CustomerName: 'Acme Insurance' }, { id: '3', CustomerName: 'Bluefin' }, { id: '4', CustomerName: 'acme' }];
      _assertEqual(mcpResolveProject('3', P).id, '3', 'by id');
      _assertEqual(mcpResolveProject(3, P).id, '3', 'by numeric id');
      _assertEqual(mcpResolveProject('  BLUEFIN ', P).id, '3', 'exact, any case');
      _assertEqual(mcpResolveProject('ACME', P).id, '4', 'exact beats partial');
      _assertEqual(mcpResolveProject('insur', P).id, '2', 'unique partial');
      _mcpThrows(() => mcpResolveProject('acme b', [P[0], P[1]].concat([{ id: '9', CustomerName: 'Acme Bank' }])), /matched 2 projects: Acme Bank \(id 1\), Acme Bank \(id 9\)/, 'duplicate names are ambiguous, ids shown');
      _mcpThrows(() => mcpResolveProject('cme', P.slice(0, 2)), /matched 2 projects/, 'ambiguous partial');
      _mcpThrows(() => mcpResolveProject('zzz', P), /No project matched "zzz"\. Projects: /, 'unknown');
      _mcpThrows(() => mcpResolveProject('  ', P), /Give a project/, 'blank');
    },
  },
  {
    name: 'N-393 mcpResolveValue / mcpDay / mcpInt — user-facing validation',
    fn: function () {
      const V = ['Engineering', 'Data', 'Data Science', null, ''];
      _assertEqual(mcpResolveValue('engineering', V, 'function'), 'Engineering', 'case-insensitive exact');
      _assertEqual(mcpResolveValue('data', V, 'function'), 'Data', 'exact beats partial');
      _assertEqual(mcpResolveValue('scien', V, 'function'), 'Data Science', 'unique partial');
      _assertEqual([mcpResolveValue(undefined, V, 'x'), mcpResolveValue(' ', V, 'x')], [null, null], 'blank → no filter');
      _mcpThrows(() => mcpResolveValue('a', V, 'function'), /function "a" matched 2 values/, 'ambiguous');
      _mcpThrows(() => mcpResolveValue('qq', V, 'country'), /No country matched "qq"\. Options: Data, Data Science, Engineering/, 'unknown lists options');
      _assertEqual(mcpDay('2026-02-28', 'from'), '2026-02-28', 'valid day');
      ['2026-02-30', '2026-2-3', '28/02/2026', '', null].forEach(v => _mcpThrows(() => mcpDay(v, 'from'), /from must be a date as YYYY-MM-DD/, `bad day ${v}`));
      _assertEqual([mcpInt(undefined, 'weeks', 1, 52, 4), mcpInt(52, 'weeks', 1, 52, 4)], [4, 52], 'default + max');
      [0, 53, 2.5, '4'].forEach(v => _mcpThrows(() => mcpInt(v, 'weeks', 1, 52, 4), /weeks must be a whole number from 1 to 52/, `bad int ${v}`));
      _mcpThrows(() => mcpInt(undefined, 'roleId', 1, 9), /roleId is required/, 'required int');
    },
  },
  {
    name: 'N-393 AC9 mcpOutputGuard — throws on any denied key at any depth, passes a clean result unchanged',
    fn: function () {
      const clean = { a: 1, rows: [{ title: 'x', project: { id: 1, name: 'y' } }], n: null };
      _assertEqual(mcpOutputGuard(clean), clean, 'clean passes');
      ['CandidateName', 'SalaryAgreed', 'Budget', 'HiringManager', 'Notes', 'OldValue', 'Note', 'MonthlyBillRate', 'RejectionReason'].forEach(k => {
        const bad = { rows: [{ deep: [{}] }] };
        bad.rows[0].deep[0][k] = 'v';
        _mcpThrows(() => mcpOutputGuard(bad), new RegExp('withheld a restricted field \\(' + k + '\\)'), `nested ${k}`);
      });
    },
  },
  {
    name: 'N-393 helpers — stage counts in CONFIG.ROLE_STAGES order (legacy Hired → Closed), TP display names, row cap',
    fn: function () {
      _assertEqual(mcpStageCounts([{ Stage: 'Sourcing' }, { Stage: 'Backlog' }, { Stage: 'Hired' }, { Stage: 'Sourcing' }, { Stage: 'Weird' }]),
        { Backlog: 1, Sourcing: 2, Closed: 1, Weird: 1 }, 'stage counts');
      _assertEqual(Object.keys(mcpStageCounts([{ Stage: 'Closed' }, { Stage: 'Backlog' }])), ['Backlog', 'Closed'], 'ROLE_STAGES order');
      _assertEqual(mcpTpNames('A@x.co; b@x.co', { 'a@x.co': 'Ann' }), ['Ann', 'b@x.co'], 'tp names, email fallback');
      const rows = Array.from({ length: CONFIG.MCP.maxRows + 5 }, (_, i) => i);
      const c = mcpCapRows(rows);
      _assertEqual([c.rows.length, c.total, c.truncated], [CONFIG.MCP.maxRows, CONFIG.MCP.maxRows + 5, true], 'cap');
      _assertEqual(mcpCapRows([1]).truncated, false, 'under cap');
    },
  },
  {
    name: 'N-393 AC3 lint-mcp: mcp/newton-tools.js is clean (graph / transport / write / dom / getter / spread), dates (F-12) and internal-project filter (N-333)',
    fn: function () {
      if (typeof MCP_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      const src = MCP_SOURCES['newton-tools.js'];
      _assertEqual(lintMcpTools(src, CONFIG).map(v => `${v.line} ${v.rule}: ${v.problem}`), [], 'lintMcpTools');
      _assertEqual(lintDateUsage(MCP_SOURCES).map(v => `${v.file}:${v.line} ${v.pattern}`), [], 'lintDateUsage');
      _assertEqual(lintInternalKpiConsumers(MCP_SOURCES, MCP_INTERNAL_KPI_CONSUMERS).map(v => `${v.fn}: ${v.problem}`), [], 'internal-project filter');
    },
  },
  {
    name: 'N-393 AC3 lint-mcp positive controls — each rule catches its seeded violation; prose and messages do not trip it',
    fn: function () {
      const rules = s => lintMcpTools(s, CONFIG).map(v => v.rule);
      _assertEqual(rules('async function f() {\n  // getItems("Roles") and document in a comment\n  const m = `window ${1 + 1} fetch(x) ...`;\n  return "graph";\n}\n'), [], 'comments, strings and template text ignored');
      _assertEqual(rules('const u = "https://graph.microsoft.com/v1.0";'), ['graph'], 'Graph host');
      _assertEqual(rules('const u = `/sites/${id}/lists/Roles/items`;'), ['graph', 'graph'], 'site + list path in a template');
      _assertEqual(rules('const u = "/$batch";'), ['graph'], '$batch');
      _assertEqual(rules('async function f() { return getItems("Roles"); }'), ['transport'], 'direct getItems');
      _assertEqual(rules('async function f() { return fetch(u); }'), ['transport'], 'fetch');
      _assertEqual(rules('async function f() { return updateItem("Roles", 1, {}); }'), ['write'], 'write call');
      _assertEqual(rules('async function f() { return acknowledgeAnomaly(a); }'), ['write'], 'acknowledge call');
      _assertEqual(rules('function f() { return document.title; }'), ['dom'], 'document');
      _assertEqual(rules('function f() { return `${window.x}`; }'), ['dom'], 'window inside a template expression');
      _assertEqual(rules('async function f() { return getPeoplePay(); }'), ['getter'], 'unregistered getter');
      _assertEqual(rules('function f(r) { return { ...r }; }'), ['spread'], 'object spread');
      _assertEqual(rules('function f(r) { return Object.assign({}, r); }'), ['spread'], 'Object.assign');
      _assertEqual(rules('function f(r) { return [...r]; } // mcp-spread-ok: test'), [], 'opt-out comment');
      _assertEqual(rules('function f(d) { return d.getTime() + m.set(1) + x.fetch(); }'), [], 'member calls ignored');
      _assertEqual(lintDateUsage({ 'x.js': 'const d = s.slice(0, 10);' }).length, 1, 'lintDateUsage catches a day slice in a tools file');
      const saved = MCP_GETTER_LISTS.getAnomalyAcks;
      MCP_GETTER_LISTS.getAnomalyAcks = ['PeoplePay'];
      try {
        _assertEqual(rules(''), ['getter'], 'registry naming a non-allowlisted list');
      } finally { MCP_GETTER_LISTS.getAnomalyAcks = saved; }
    },
  },
  {
    name: 'N-535 schema: business_goals takes year (integer, min 2020), level (Annual / H2 / Quarterly) and status (open / all), nothing required; description says names only, no emails',
    fn: function () {
      const t = MCP_TOOLS.find(x => x.name === 'business_goals');
      if (!t) throw new Error('business_goals is not registered');
      if (MCP_N535_TOOL_NAMES.indexOf(t.name) === -1) throw new Error('name list out of step');
      const p = t.inputSchema.properties;
      _assertEqual(Object.keys(p), ['year', 'level', 'status'], 'inputs');
      _assertEqual([p.year.type, p.year.minimum], ['integer', 2020], 'year');
      _assertEqual(p.level.enum, CONFIG.BIZGOALS.GOAL_LEVELS, 'level enum from CONFIG.BIZGOALS');
      _assertEqual(p.status.enum, ['open', 'all'], 'status enum');
      _assertEqual(t.inputSchema.required || [], [], 'nothing required');
      _assertEqual(t.inputSchema.additionalProperties, false, 'closed schema');
      if (!/names only/i.test(t.description) || !/no emails/i.test(t.description)) throw new Error('description must say names only, no emails');
      if (t.description.length > 300) throw new Error('description over 300 chars: ' + t.description.length);
    },
  },
  {
    name: 'N-535 CONFIG.MCP: the four bizgoals scripts load in dependency order after api-orgchart.js and before analytics.js; the three lists are allowed; the five email keys are denied; PeoplePay still never allowed; contract 2 (N-546)',
    fn: function () {
      const m = CONFIG.MCP, sc = m.scripts;
      const order = ['js/api-orgchart.js', 'js/bizgoals-config.js', 'js/bizgoals-data.js', 'js/bizgoals-track.js', 'js/api-bizgoals.js', 'js/analytics.js'].map(f => sc.indexOf(f));
      if (order.indexOf(-1) !== -1) throw new Error('a bizgoals script is missing from CONFIG.MCP.scripts');
      for (let i = 1; i < order.length; i++) if (order[i] < order[i - 1]) throw new Error('bizgoals scripts out of dependency order');
      _assertEqual(sc.slice(-4), ['mcp/newton-guides.js', 'mcp/newton-write-tools.js', 'mcp/newton-report-tools.js', 'mcp/newton-plan-tools.js'], 'tools load last (newton-guides.js, newton-write-tools.js, newton-report-tools.js then newton-plan-tools.js push onto MCP_TOOLS, so they follow newton-tools.js, N-547 / N-548 / N-550 / N-555)');
      ['BusinessGoals', 'BusinessActions', 'BusinessGoalUpdates'].forEach(l => { if (!m.allowedLists.includes(l)) throw new Error(l + ' not in allowedLists'); });
      if (m.allowedLists.includes('PeoplePay')) throw new Error('PeoplePay must never be allowed');
      _assertEqual([m.outputDenyFields.BusinessGoals, m.outputDenyFields.BusinessActions, m.outputDenyFields.BusinessGoalUpdates],
        [['OwnerEmail', 'AddedByEmail', 'ChangedByEmail'], ['OwnerEmail', 'AddedByEmail', 'ChangedByEmail'], ['AuthorEmail']], 'email keys denied');
      _assertEqual(m.contract, 2, 'contract 2 (N-546)');
      ['OwnerEmail', 'AddedByEmail', 'ChangedByEmail', 'AuthorEmail'].forEach(k => {
        const bad = { goals: [{ x: {} }] };
        bad.goals[0].x[k] = 'a@b.co';
        let threw = false;
        try { mcpOutputGuard(bad); } catch (e) { threw = new RegExp('withheld a restricted field \\(' + k + '\\)').test(e.message); }
        if (!threw) throw new Error('mcpOutputGuard must reject a nested ' + k);
      });
    },
  },
  {
    name: 'N-394 AC2 CONFIG.MCP: api-orgchart.js loads before analytics.js with newton-tools.js still last; Assignments / SalesForecasts money + email fields denied; contract 2 (N-546)',
    fn: function () {
      const m = CONFIG.MCP;
      _assertEqual(m.contract, 2, 'contract 2 (N-546)');
      const sc = m.scripts;
      if (sc.indexOf('js/api-orgchart.js') === -1) throw new Error('js/api-orgchart.js missing from CONFIG.MCP.scripts');
      if (!(sc.indexOf('js/api.js') < sc.indexOf('js/api-orgchart.js') && sc.indexOf('js/api-orgchart.js') < sc.indexOf('js/analytics.js'))) throw new Error('api-orgchart.js must load after api.js and before analytics.js');
      _assertEqual(sc.slice(-4), ['mcp/newton-guides.js', 'mcp/newton-write-tools.js', 'mcp/newton-report-tools.js', 'mcp/newton-plan-tools.js'], 'tools load last (newton-guides.js, newton-write-tools.js, newton-report-tools.js then newton-plan-tools.js push onto MCP_TOOLS, so they follow newton-tools.js, N-547 / N-548 / N-550 / N-555)');
      ['MonthlyBillRate', 'RetainerFee', 'PlacementFee', 'ProratedRevenue', 'BilledRevenue', 'UserEmail'].forEach(f => {
        if (!(m.outputDenyFields.Assignments || []).includes(f)) throw new Error('outputDenyFields.Assignments lacks ' + f);
      });
      if (!(m.outputDenyFields.SalesForecasts || []).includes('ForecastedHeadcount')) throw new Error('outputDenyFields.SalesForecasts lacks ForecastedHeadcount');
      ['People', 'Assignments', 'SalesForecasts'].forEach(l => { if (!m.allowedLists.includes(l)) throw new Error(l + ' not in allowedLists'); });
      if (m.allowedLists.includes('PeoplePay')) throw new Error('PeoplePay must never be allowed');
    },
  },
  {
    name: 'N-394 schemas: bench takes nothing; utilisation year / month / quarter bounded integers + byLevel boolean; project_team requires project; descriptions say no money',
    fn: function () {
      const t = n => MCP_TOOLS.find(x => x.name === n);
      _assertEqual(Object.keys(t('bench').inputSchema.properties), [], 'bench has no inputs');
      const u = t('utilisation').inputSchema.properties;
      _assertEqual(Object.keys(u), ['year', 'month', 'quarter', 'byLevel'], 'utilisation inputs');
      _assertEqual([u.month.minimum, u.month.maximum, u.quarter.minimum, u.quarter.maximum, u.byLevel.type], [1, 12, 1, 4, 'boolean'], 'bounds');
      _assertEqual(t('project_team').inputSchema.required, ['project'], 'project required');
      _assertEqual(Object.keys(t('project_team').inputSchema.properties), ['project', 'includeEnded'], 'project_team inputs');
      if (!/percentages only/i.test(t('utilisation').description)) throw new Error('utilisation description must say percentages only');
      if (!/no (emails, rates|money)/i.test(t('project_team').description + t('bench').description)) throw new Error('descriptions must say no money / rates');
    },
  },
  {
    name: 'N-466 schema: workforce_segmentation takes year (integer, min 2020) and month (1-12), nothing required; description says counts and percentages only, no names or money',
    fn: function () {
      const t = MCP_TOOLS.find(x => x.name === 'workforce_segmentation');
      const p = t.inputSchema.properties;
      _assertEqual(Object.keys(p), ['year', 'month', 'staffType'], 'inputs (N-524 adds staffType)');
      _assertEqual([p.year.type, p.year.minimum, p.month.type, p.month.minimum, p.month.maximum], ['integer', 2020, 'integer', 1, 12], 'bounds');
      _assertEqual([p.staffType.type, p.staffType.enum], ['string', ['all', 'deployable', 'internal']], 'N-524: staffType is a string enum');
      _assertEqual(t.inputSchema.required || [], [], 'nothing required');
      if (!/counts and percentages only/i.test(t.description) || !/no names or money/i.test(t.description)) throw new Error('description must say counts and percentages only, no names or money');
      if (t.description.length > 300) throw new Error('description over 300 chars: ' + t.description.length);
      if (!/location and contract type \(deployable and internal staff\)/i.test(t.description) || !/level \(deployable only\)/i.test(t.description)) throw new Error('N-468: description must say location/contract include internal staff and level is deployable only');
    },
  },
  {
    name: 'N-467 schema: joiners takes year (integer, min 2020) and month (1-12), nothing required; description says start date only, no pay or contract detail',
    fn: function () {
      const t = MCP_TOOLS.find(x => x.name === 'joiners');
      const p = t.inputSchema.properties;
      _assertEqual(Object.keys(p), ['year', 'month'], 'inputs');
      _assertEqual([p.year.type, p.year.minimum, p.month.type, p.month.minimum, p.month.maximum], ['integer', 2020, 'integer', 1, 12], 'bounds');
      _assertEqual(t.inputSchema.required || [], [], 'nothing required');
      if (!/no pay or contract detail/i.test(t.description) || !/start date only/i.test(t.description)) throw new Error('description must say start date only, no pay or contract detail');
      if (t.description.length > 300) throw new Error('description over 300 chars: ' + t.description.length);
    },
  },
  {
    name: 'N-394 mcpPct — one decimal as the People Dashboard shows it; null stays null; guard rejects the new denied keys at any depth',
    fn: function () {
      _assertEqual([mcpPct(0.8123), mcpPct(0), mcpPct(1), mcpPct(0.05), mcpPct(null), mcpPct(undefined)], [81.2, 0, 100, 5, null, null], 'mcpPct');
      ['RetainerFee', 'PlacementFee', 'ProratedRevenue', 'BilledRevenue', 'UserEmail', 'ForecastedHeadcount'].forEach(k => {
        const bad = { a: [{ b: {} }] };
        bad.a[0].b[k] = 1;
        _mcpThrows(() => mcpOutputGuard(bad), new RegExp('withheld a restricted field \\(' + k + '\\)'), 'nested ' + k);
      });
    },
  },
  {
    name: 'N-395 mcp/README.md — the fourteen headings in order (N-551), the download URL and update message quoted from server-core.js, both token paths, no secret-looking text',
    fn: function () {
      if (typeof REPO_FILES === 'undefined' || typeof REPO_FILES.mcpReadme !== 'string') return _skip('Install-guide check needs filesystem access — runs under node tests/run.js');
      const g = REPO_FILES.mcpReadme.replace(/\r\n/g, '\n');   // Windows checkouts may use CRLF
      const core = REPO_FILES.mcpServerCore;
      if (!g) throw new Error('mcp/README.md is missing or empty');
      const heads = MCP_N551_README_HEADS;
      let at = -1;
      heads.forEach(h => {
        const i = g.indexOf('\n## ' + h + '\n');
        if (i < 0) throw new Error('mcp/README.md lacks the heading "## ' + h + '"');
        if (i < at) throw new Error('mcp/README.md heading "' + h + '" is out of order');
        at = i;
      });
      const url = (core.match(/const DOWNLOAD_URL = '([^']+)'/) || [])[1];
      if (!url) throw new Error('DOWNLOAD_URL not found in mcp/bootstrap/server-core.js');
      if (g.indexOf(url) < 0) throw new Error('guide does not contain DOWNLOAD_URL ' + url);
      if (g.indexOf('Newton for Claude needs updating. Download the latest version from ' + url + ' and double-click it to reinstall, then restart Claude.') < 0) throw new Error('guide does not quote the update message exactly');
      if (g.indexOf('%LOCALAPPDATA%\\Newton\\mcp-token.bin') < 0) throw new Error('guide lacks the plain token path');
      if (g.indexOf('%LOCALAPPDATA%\\Packages\\Claude_<id>\\LocalCache\\Local\\Newton\\mcp-token.bin') < 0) throw new Error('guide lacks the Microsoft Store token path');
      [[/Bearer/, 'Bearer'], [/eyJ/, 'eyJ token text'], [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i, 'a GUID'], [/sharepoint\.com/i, 'a sharepoint.com URL']].forEach(p => {
        if (p[0].test(g)) throw new Error('mcp/README.md must not contain ' + p[1]);
      });
    },
  },
  {
    name: 'N-401 mcp/README.md renders through mdGuideToHtml: fourteen h2 in order (N-551), download link, every table row, no leftover markers or scripts',
    fn: function () {
      const g = REPO_FILES.mcpReadme;
      if (typeof g === 'undefined') _skip('REPO_FILES is supplied by tests/run.js; the browser runner has no filesystem.');
      const core = REPO_FILES.mcpServerCore || '';
      const url = (core.match(/const DOWNLOAD_URL = '([^']+)'/) || [])[1];
      if (!url) throw new Error('DOWNLOAD_URL not found in mcp/bootstrap/server-core.js');
      const html = mdGuideToHtml(g);
      const h2 = (html.match(/<h2[^>]*>([^<]*)<\/h2>/g) || []).map(h => h.replace(/<[^>]+>/g, ''));
      _assertEqual(h2, MCP_N551_README_HEADS, 'h2 headings in order');
      if (html.indexOf('<a href="' + url + '"') < 0) throw new Error('rendered guide does not link DOWNLOAD_URL ' + url);
      const rows = g.split(/\r?\n/).filter(l => /^\|/.test(l) && !/^\|[ :|-]*-[ :|-]*\|\s*$/.test(l)).length;
      _assertEqual((html.match(/<tr>/g) || []).length, rows, 'table rows in the guide vs rendered <tr>');
      [/<script/i, /javascript:/i, /\*\*/, /`/, /^## /m, /\|---/].forEach(re => {
        if (re.test(html)) throw new Error('rendered guide contains ' + re + ' - the README uses syntax the renderer does not handle');
      });
      if (html.indexOf('Claude_&lt;id&gt;') < 0) throw new Error('Claude_<id> must render as visible text');
    },
  },
  // ── N-551 (AMCP-7): docs match the tools ─────────────────────────────────
  {
    name: 'N-551 doc drift: every registered tool is named in mcp/README.md, and every tool but newton_status in the user guide section',
    fn: function () {
      if (typeof REPO_FILES === 'undefined' || typeof MCP_GUIDE_TEXTS === 'undefined') return _skip('Doc check needs filesystem access - runs under node tests/run.js');
      const readme = REPO_FILES.mcpReadme;
      const guide = MCP_GUIDE_TEXTS['user-guide.html'];
      const a = guide.indexOf('<div class="guide-section" id="newton-for-claude">');
      if (a < 0) throw new Error('user-guide.html lacks the #newton-for-claude section');
      const b = guide.indexOf('<div class="guide-section"', a + 10);
      const section = guide.slice(a, b < 0 ? guide.length : b);
      const names = MCP_TOOLS.map(t => t.name).concat(['newton_status']);
      const missingReadme = names.filter(n => readme.indexOf(n) < 0);
      _assertEqual(missingReadme, [], 'tools not named in mcp/README.md');
      // The user guide explains in prose; it need not quote tool ids, but must cover each capability.
      ['hiring plan', 'weekly activity', 'stages', 'report', 'preview', 'Windows'].forEach(w => {
        if (section.toLowerCase().indexOf(w.toLowerCase()) < 0) throw new Error('user guide section does not mention "' + w + '"');
      });
      // Positive control: a tool name that is not documented is reported.
      _assertEqual(['not_a_tool'].filter(n => readme.indexOf(n) < 0), ['not_a_tool'], 'control: an undocumented name is detected');
    },
  },
  {
    name: 'N-551 README claims match the code: limits, confirm expiry, role gate and error messages',
    fn: function () {
      if (typeof REPO_FILES === 'undefined' || typeof REPO_FILES.mcpReadme !== 'string') return _skip('Doc check needs filesystem access - runs under node tests/run.js');
      const g = REPO_FILES.mcpReadme.replace(/\r\n/g, '\n');
      const core = REPO_FILES.mcpServerCore;
      const lim = CONFIG.MCP;
      if (g.indexOf('Up to ' + lim.maxWeeklyEntries + ' role-weeks') < 0) throw new Error('README must state the ' + lim.maxWeeklyEntries + ' role-week limit');
      if (g.indexOf('Up to ' + lim.maxStageMoves + ' roles') < 0) throw new Error('README must state the ' + lim.maxStageMoves + ' role move limit');
      if (g.indexOf('Up to ' + lim.maxNarrativeEdits + ' text blocks') < 0) throw new Error('README must state the ' + lim.maxNarrativeEdits + ' text block limit');
      _assertEqual(lim.confirmTtlMs, 300000, 'confirm expiry the README calls 5 minutes');
      if (g.indexOf('A preview lasts 5 minutes') < 0) throw new Error('README must state the 5 minute preview expiry');
      // Messages quoted in the troubleshooting table come from server-core.js / newton-write-tools.js.
      const quoted = [
        "That confirmation has expired or was already used. Ask for a new preview.",
        "This changed in Newton since the preview. Ask again for a new preview.",
        "Newton is still saving that change. Check Newton before trying again.",
        "That Newton data isn't available to your account.",
        "Newton for Claude isn't available to your Newton role",
        "That isn't available to your Newton role",
      ];
      quoted.forEach(m => {
        if (g.indexOf(m) < 0) throw new Error('README lacks the message: ' + m);
        if (core.indexOf(m.replace(/'/g, "\\'")) < 0 && core.indexOf(m) < 0) throw new Error('server-core.js lacks the message the README quotes: ' + m);
      });
      ['Log at most ' + lim.maxWeeklyEntries + ' role-weeks in one go.', 'Move at most ' + lim.maxStageMoves + ' roles in one go.'].forEach(m => {
        if (g.indexOf(m) < 0) throw new Error('README lacks the message: ' + m);
      });
      ["mcpRefuse('Log at most ' + max + ' role-weeks in one go.')", "mcpRefuse('Move at most ' + max + ' roles in one go.')"].forEach(m => {
        if (MCP_SOURCES['newton-write-tools.js'].indexOf(m) < 0) throw new Error('write tools lack the message the README quotes: ' + m);
      });
      ['Read-only.', 'Leadership and Admin only.'].forEach(w => {
        if (g.indexOf('**' + w.replace('.', '') + '**') >= 0 || g.indexOf(w) >= 0) throw new Error('README still says "' + w + '" about the product as a whole');
      });
    },
  },
);

// ── N-546 (AMCP-2): contract 2 — per-tool roles, writeLists, the write-tools lint ──
// N-553 (AMCP-A2): who may call each read tool. DM / TP get the seven reporting reads, scoped
// to their own projects by mcpScope(); People, scorecards and goals stay Admin + Leadership.
var MCP_N553_SCOPED_TOOLS = ['list_projects', 'project_summary', 'list_roles', 'role_detail', 'activity_summary', 'list_placements'];
var MCP_N553_ROLES = (function () {
  const all = ['admin', 'leadership', 'delivery_manager', 'talent_partner'];
  const lead = ['admin', 'leadership'];
  const out = {};
  MCP_N553_SCOPED_TOOLS.concat(['time_to_fill'], MCP_N547_TOOL_NAMES).forEach(n => { out[n] = all; });   // N-547: guides hold no sensitive data
  ['project_scorecards', 'bench', 'utilisation', 'project_team', 'workforce_segmentation', 'joiners', 'business_goals'].forEach(n => { out[n] = lead; });
  out.log_weekly_activity = ['admin', 'delivery_manager', 'talent_partner'];   // N-548 (AMCP-A2): Leadership is read-only
  out.update_role_stage = ['admin', 'delivery_manager', 'talent_partner'];     // N-549 (AMCP-A2): the same
  out.report_facts = ['admin', 'delivery_manager', 'talent_partner'];          // N-550 (AMCP-A2): the Report Library has no Leadership role
  out.draft_report_narrative = ['admin', 'delivery_manager', 'talent_partner'];   // N-550 (AMCP-A2): Leadership is read-only
  out.hiring_plan = all;                                                        // N-555 (AMCP-F4): all four; DM / TP see the whole plan of a project in scope (mcpScope)
  return out;
})();

// The text of top-level function `name` in `src`, comments blanked (lint-mcp.js _mcpLintStrip).
function _mcpFnText(src, name) {
  const nc = _mcpLintStrip(src).noComments;
  const m = new RegExp('(?:async )?function ' + name + '\\(').exec(nc);
  if (!m) throw new Error(name + ' not found');
  const end = nc.indexOf('\n}\n', m.index);
  return nc.slice(m.index, end === -1 ? nc.length : end + 2);
}

ASSERTIONS.push(
  {
    name: 'N-546 AC1-AC3 / N-553 AC2 CONFIG.MCP contract 2: allowedRoles Admin, Leadership, DM, TP; Notifications readable (dedupe only, denied keys), confirmTtlMs 5 min, writeLists shape; every MCP_TOOLS entry is a read tool with the AMCP-A2 roles',
    fn: function () {
      const m = CONFIG.MCP;
      _assertEqual(m.contract, 2, 'contract');
      _assertEqual(Array.from(m.allowedRoles), ['admin', 'leadership', 'delivery_manager', 'talent_partner'], 'allowedRoles (AMCP-A1, opened to DM / TP by N-553)');
      _assertEqual(m.allowedLists.includes('Notifications'), true, 'Notifications readable for fireNotification dedupe');
      ['RecipientEmail', 'Body', 'DeepLink'].forEach(f => { if (!(m.outputDenyFields.Notifications || []).includes(f)) throw new Error('outputDenyFields.Notifications lacks ' + f); });
      _assertEqual(m.confirmTtlMs, 300000, 'confirmTtlMs');
      _assertEqual(Object.keys(m.writeLists), ['WeeklyActivity', 'Roles', 'RoleHistory', 'Notifications', 'SavedReports'], 'writeLists lists (SavedReports joined in N-550)');
      Object.keys(m.writeLists).forEach(list => {
        const spec = m.writeLists[list];
        Object.keys(spec).forEach(k => {
          if (k !== 'create' && k !== 'update') throw new Error(`writeLists.${list}.${k}: only create / update`);
          if (!Array.isArray(spec[k]) || !spec[k].length || spec[k].some(f => typeof f !== 'string' || !f)) throw new Error(`writeLists.${list}.${k} must be non-empty field names`);
          if (new Set(spec[k]).size !== spec[k].length) throw new Error(`writeLists.${list}.${k} has a duplicate`);
        });
      });
      _assertEqual(m.writeLists.Roles, { update: ['Stage'] }, 'Roles: Stage updates only');
      _assertEqual(m.writeLists.RoleHistory.update, undefined, 'RoleHistory: never updated');
      const counts = ['Outreach', 'Responses', 'Screened', 'Submitted', 'Interview1', 'InterviewTwoPlus', 'FinalInterview', 'Offers', 'Hires'];
      counts.forEach(f => {
        if (!m.writeLists.WeeklyActivity.create.includes(f) || !m.writeLists.WeeklyActivity.update.includes(f)) throw new Error('WeeklyActivity create + update need ' + f);
      });
      ['RoleIDLookupId', 'TalentPartner', 'Yeare', 'WeekNumber', 'WeekEndingDate'].forEach(f => {
        if (m.writeLists.WeeklyActivity.update.includes(f)) throw new Error('an edit must never move a row: ' + f + ' is not updatable');
      });
      _assertEqual(MCP_FUNNEL_FIELDS.map(f => f === 'Interview2Plus' ? 'InterviewTwoPlus' : f), counts, 'the nine write names match the read funnel (Interview2Plus reads, InterviewTwoPlus writes)');
      MCP_TOOLS.forEach(t => {
        _assertEqual(Array.from(t.roles || []), MCP_N553_ROLES[t.name] || ['(no AMCP-A2 row)'], t.name + ' roles (AMCP-A2)');
        if (MCP_N548_TOOL_NAMES.indexOf(t.name) !== -1) {   // N-548: write tools live in newton-write-tools.js
          if (t.write !== true || typeof t.preview !== 'function' || typeof t.commit !== 'function' || 'handler' in t) throw new Error(t.name + ': a write tool is write: true with preview + commit and no handler');
          return;
        }
        if ('write' in t) throw new Error(t.name + ': newton-tools.js holds read tools only');
        if (typeof t.handler !== 'function') throw new Error(t.name + ': no handler');
      });
    },
  },
  {
    name: 'N-546 AC20 lintMcpWriteTools: writers only in a named commit function and only approved ones; previews, helpers, top level and inline commits fail; the read rules still apply; mcp/newton-write-tools.js clean when present',
    fn: function () {
      const rules = s => lintMcpWriteTools(s, CONFIG).map(v => v.rule);
      const good = 'async function wtCommit(plan, ctx) {\n  const row = await createWeeklyActivity(plan.fields);\n  await fireNotification(plan.note);\n  return { id: row.id };\n}\n' +
        'async function wtPreview(args, ctx) {\n  return { summary: "x", changes: [], plan: {} };\n}\n' +
        'MCP_TOOLS.push({ name: "t", roles: ["admin"], write: true, preview: wtPreview, commit: wtCommit });\n';
      _assertEqual(rules(good), [], 'approved writers in a commit function');
      _assertEqual(rules('async function p(a) { return updateItem("Roles", 1, {}); }\nasync function c(p) { return 1; }\nMCP_TOOLS.push({ preview: p, commit: c });\n'), ['write'], 'writer in a preview');
      _assertEqual(rules('function h() { return createWeeklyActivity({}); }\nasync function c(p) { return h(); }\nMCP_TOOLS.push({ commit: c });\n'), ['write'], 'writer in a helper the commit calls');
      _assertEqual(rules('createItem("WeeklyActivity", {});\n'), ['write'], 'writer at top level');
      _assertEqual(rules('async function c(p) { return deleteItem("Roles", 1); }\nMCP_TOOLS.push({ commit: c });\n'), ['write'], 'unapproved writer in a commit');
      _assertEqual(rules('MCP_TOOLS.push({ commit: async (p) => 1 });\n'), ['write'], 'inline commit');
      _assertEqual(rules('MCP_TOOLS.push({ commit(p) { return 1; } });\n'), ['write'], 'shorthand commit method');
      _assertEqual(rules('MCP_TOOLS.push({ commit: missing });\n'), ['write'], 'commit names no function in the file');
      _assertEqual(rules('async function c(p) { return fetch("/sites/x"); }\nMCP_TOOLS.push({ commit: c });\n'), ['graph', 'transport'], 'Graph path + direct transport still caught');
      _assertEqual(rules('async function c(p) { return { ...p }; }\nMCP_TOOLS.push({ commit: c });\n'), ['spread'], 'spread still caught');
      if (typeof MCP_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      const src = MCP_SOURCES['newton-write-tools.js'];
      if (src !== undefined) _assertEqual(lintMcpWriteTools(src, CONFIG).map(v => `${v.line} ${v.rule}: ${v.problem}`), [], 'lintMcpWriteTools on mcp/newton-write-tools.js');
    },
  },
);

// ── N-553 (AMCP-2b): TP / DM read scoping — wiring (the behaviour runs in mcp-tools-check.js) ──
ASSERTIONS.push(
  {
    name: 'N-553 AC3 mcpScope() is built only from live Newton functions (getCurrentUser, getEffectiveRole, getUserProjectIds, projectScopeForRole), resolved fresh, refuses a role outside allowedRoles; the six project-scoped handlers call it, time_to_fill deliberately does not',
    fn: function () {
      if (typeof MCP_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      const src = MCP_SOURCES['newton-tools.js'];
      const body = _mcpFnText(src, 'mcpScope');
      ['getCurrentUser(', 'getEffectiveRole(', 'getUserProjectIds(', 'projectScopeForRole(', 'CONFIG.MCP.allowedRoles', 'CONFIG.ROLE_IDS.TALENT_PARTNER'].forEach(t => {
        if (body.indexOf(t) < 0) throw new Error('mcpScope does not use ' + t);
      });
      ['sessionStorage', 'localStorage', 'getScopedUserEmail', 'getGhostUser', 'ctx'].forEach(t => {
        if (body.indexOf(t) >= 0) throw new Error('mcpScope must not use ' + t);
      });
      // No cache for it (N-296 / AMCP-A3): no top-level var / let / const named like a cache or memo.
      const nc = _mcpLintStrip(src).noComments;
      const tops = (nc.match(/^(?:var|let|const) (\w+)/gm) || []).map(l => l.split(' ')[1]);
      tops.filter(n => /cache|memo/i.test(n)).forEach(n => { throw new Error('module-level cache: ' + n); });
      MCP_N553_SCOPED_TOOLS.forEach(name => {
        const t = MCP_TOOLS.find(x => x.name === name);
        const fnBody = _mcpFnText(src, t.handler.name);
        if (fnBody.indexOf('await mcpScope()') < 0) throw new Error(name + ': ' + t.handler.name + ' does not call mcpScope()');
      });
      if (_mcpFnText(src, 'mcpTimeToFill').indexOf('mcpScope(') >= 0) throw new Error('time_to_fill is a company benchmark: no mcpScope() (N-553 spec)');
      _assertEqual(typeof MCP_UNAVAILABLE, 'string', 'MCP_UNAVAILABLE');
      _assertEqual(MCP_UNAVAILABLE, "That Newton data isn't available to your account.", 'the AMCP-A2 out-of-scope answer');
      const e = mcpRefuse('x');
      _assertEqual([e.message, e.code], ['x', 'MCP_REFUSED'], 'mcpRefuse');
    },
  },
  {
    name: 'N-553 scope helpers (pure): unscoped returns its input unchanged; scoped keeps own projects / roles; TP rows by tpMatches on the given key; mcpResolveProject refuses missing and hidden alike',
    fn: function () {
      const all = Object.freeze({ scoped: false, projectIds: null, tpEmail: null });
      const dm = Object.freeze({ scoped: true, projectIds: ['1'], tpEmail: null });
      const tp = Object.freeze({ scoped: true, projectIds: ['1', '2'], tpEmail: 'tp@x.co' });
      const none = Object.freeze({ scoped: true, projectIds: [], tpEmail: null });
      const projects = [{ id: 1, CustomerName: 'Alpha' }, { id: 2, CustomerName: 'Beta' }, { id: 3, CustomerName: 'Gamma' }];
      if (mcpScopeProjects(all, projects) !== projects) throw new Error('unscoped projects must be the same array');
      _assertEqual(mcpScopeProjects(dm, projects).map(p => p.id), [1], 'DM projects');
      const roles = [{ id: 10, ProjectIDLookupId: 1, TalentPartner: 'tp@x.co' }, { id: 11, ProjectIDLookupId: 2, TalentPartner: 'a@x.co;TP@x.co' }, { id: 12, ProjectID: 3, TalentPartner: 'tp@x.co' }, { id: 13, TalentPartner: '' }];
      if (mcpScopeRoles(all, roles) !== roles) throw new Error('unscoped roles must be the same array');
      _assertEqual(mcpScopeRoles(tp, roles).map(r => r.id), [10, 11], 'TP roles on own projects (no project = out)');
      _assertEqual(mcpTpOwn(tp, roles, 'TalentPartner').map(r => r.id), [10, 11, 12], 'TP own rows (multi-TP, case-insensitive)');
      if (mcpTpOwn(dm, roles, 'TalentPartner') !== roles) throw new Error('non-TP rows must be the same array');
      _assertEqual(mcpTpOwn(tp, [{ tpEmail: 'tp@x.co' }, { tpEmail: null }], 'tpEmail').length, 1, 'tpEmail key');
      _assertEqual(mcpResolveProject('beta', projects, tp).id, 2, 'in scope resolves');
      const msg = arg => { try { mcpResolveProject(arg, projects, dm); } catch (e) { return [e.code, e.message]; } return null; };
      _assertEqual(msg('gamma'), msg('nothing-like-it'), 'hidden and missing answer the same');
      _assertEqual(msg('3'), msg('99'), 'hidden and missing ids answer the same');
      _assertEqual(msg('gamma'), ['MCP_REFUSED', MCP_UNAVAILABLE + ' Your projects: Alpha (id 1).'], 'only own projects listed');
      _mcpThrows(() => mcpResolveProject('alpha', projects, none), /Newton shows you no projects\.$/, 'empty scope');
      _mcpThrows(() => mcpResolveProject('zzz', projects, all), /^No project matched "zzz"\. Projects: Alpha \(id 1\), Beta \(id 2\), Gamma \(id 3\)\.$/, 'unscoped message unchanged');
      _mcpThrows(() => mcpResolveProject('zzz', projects), /^No project matched "zzz"/, 'no scope argument = unchanged');
      _assertEqual(mcpInScope(all, 999), true, 'unscoped is in scope');
      _assertEqual([mcpInScope(dm, 1), mcpInScope(dm, '1'), mcpInScope(dm, 2), mcpInScope(dm, '')], [true, true, false, false], 'DM in scope');
    },
  },
);

// ── N-547 (AMCP-3): guide tools - wiring, parsers, ranking, reading, lint ──
// The cache and the server path (async, through the real loader) run in mcp-tools-check.js.
var MCP_N547_HTML_GUIDES = ['user-guide.html', 'people-user-guide.html', 'sales-user-guide.html', 'market-reporting-user-guide.html', 'my-momentum-user-guide.html'];

var MCP_N547_FIXTURE_HTML =
  '<html><head><title>Test &mdash; User Guide</title><script>var x = "<div class=\\"guide-section\\" id=\\"bad\\">";</script></head><body>\n' +
  '<div class="guide-content">\n' +
  '<div class="guide-section" id="faq"><h2>Frequently &amp; Asked</h2>\n<p>Intro line.</p>\n' +
  '<div class="faq-item"><div class="faq-q">Why &lt;this&gt;?</div><div class="faq-a">Because <strong>reasons</strong>.<ul><li>one</li><li>two</li></ul></div></div>\n' +
  '<div class="faq-item"><div class="faq-q">Second?</div><div class="faq-a">Answer&nbsp;two &mdash; done.</div></div>\n</div>\n' +
  '<div class="guide-section agent-section" id="steps"><h2>Steps</h2><p>Lead.</p><h3>First</h3><p>A.</p><h3><span class="b">Second</span></h3><p>B.</p></div>\n' +
  '<div class="guide-section" id="plain"><h2>Plain</h2><p>Only text.</p></div>\n' +
  '<div class="guide-section"><h2>No id</h2></div>\n' +
  '</div></div>\n<div class="guide-footer">Footer text</div>\n<script src="x.js"></script></body></html>';

var MCP_N547_FIXTURE_MD = (function () {
  const F = '`'.repeat(3);
  return ['# Title One', '', 'intro ignored', '', '## Alpha Section', '', 'Some **bold** [link](http://x) text.', '', '### Sub A', '', 'a body', '',
    '### Sub B', '', 'b body', '', '## Alpha Section', '', 'dup', '', '## Changelog', '', '- v1', '', F + 'js', '## not a heading', F, '',
    '## Last & Done (X)', '', 'end', ''].join('\n');
})();

function _mcpGuideReal() {
  if (typeof MCP_GUIDE_TEXTS === 'undefined') _skip('Needs the real guide files - runs under node tests/run.js, not in the browser runner.');
  if (!_mcpGuideReal.parsed) {
    _mcpGuideReal.parsed = {};
    MCP_GUIDE_FILES.forEach(f => { _mcpGuideReal.parsed[f] = mcpGuideParse(f, MCP_GUIDE_TEXTS[f]); });
  }
  return MCP_GUIDE_FILES.map(f => ({ file: f, parsed: _mcpGuideReal.parsed[f] }));
}

ASSERTIONS.push(
  {
    name: 'N-547 AC1 / AC2 / AC10 wiring: newton-guides.js loads after newton-tools.js, contract still 2, guideCacheTtlMs 1 hour; two read tools with the four roles and closed schemas; MCP_GUIDE_FILES equals the bundle\'s GUIDE_FILES',
    fn: function () {
      const m = CONFIG.MCP;
      _assertEqual(m.scripts.slice(-4), ['mcp/newton-guides.js', 'mcp/newton-write-tools.js', 'mcp/newton-report-tools.js', 'mcp/newton-plan-tools.js'], 'script order');
      _assertEqual([m.contract, m.guideCacheTtlMs], [2, 3600000], 'contract + TTL');
      _assertEqual(MCP_TOOLS.length, 21, 'eighteen read tools (hiring_plan, N-555) + log_weekly_activity (N-548) + update_role_stage (N-549) + draft_report_narrative (N-550)');
      const four = ['admin', 'leadership', 'delivery_manager', 'talent_partner'];
      const s = MCP_TOOLS.find(t => t.name === 'search_guides');
      const r = MCP_TOOLS.find(t => t.name === 'read_guide_section');
      _assertEqual([Array.from(s.roles), Array.from(r.roles)], [four, four], 'roles (AMCP-A2)');
      _assertEqual([s.inputSchema.required, r.inputSchema.required], [['query'], ['guide', 'section']], 'required');
      _assertEqual([s.inputSchema.properties.guide.enum, r.inputSchema.properties.guide.enum], [MCP_GUIDE_FILES, MCP_GUIDE_FILES], 'guide enums');
      _assertEqual([s.inputSchema.additionalProperties, r.inputSchema.additionalProperties], [false, false], 'closed schemas');
      if ('write' in s || 'write' in r) throw new Error('guide tools are read only');
      if (typeof REPO_FILES === 'undefined' || !REPO_FILES.mcpLoader) _skip('Needs the bundle source - runs under node tests/run.js.');
      const block = /const GUIDE_FILES = \[([^\]]*)\]/.exec(REPO_FILES.mcpLoader);
      if (!block) throw new Error('GUIDE_FILES not found in loader.js');
      _assertEqual(block[1].match(/'([^']+)'/g).map(x => x.slice(1, -1)), MCP_GUIDE_FILES, 'MCP_GUIDE_FILES = loader GUIDE_FILES');
    },
  },
  {
    name: 'N-547 AC3 / AC4 parser fixture: sections by guide-section marker (script text ignored, no-id section counted as skipped, footer cut); FAQ items, h3 blocks, plain section; entities, bullets, tags',
    fn: function () {
      const p = mcpGuideParseHtml(MCP_N547_FIXTURE_HTML);
      _assertEqual([p.title, p.skipped, p.sections.map(s => s.id)], ['Test — User Guide', 1, ['faq', 'steps', 'plain']], 'title, skipped, ids');
      _assertEqual(p.sections[0].title, 'Frequently & Asked', 'h2 entity decoded');
      _assertEqual(p.sections[0].chunks, [
        { heading: null, text: 'Intro line.' },
        { heading: 'Why <this>?', text: 'Because reasons.\n- one\n- two' },
        { heading: 'Second?', text: 'Answer two — done.' },
      ], 'FAQ chunks');
      _assertEqual(p.sections[1].chunks, [{ heading: null, text: 'Lead.' }, { heading: 'First', text: 'A.' }, { heading: 'Second', text: 'B.' }], 'h3 chunks (class agent-section still a section)');
      _assertEqual(p.sections[2].chunks, [{ heading: null, text: 'Only text.' }], 'plain section');
      if (/Footer text|x\.js|bad/.test(JSON.stringify(p))) throw new Error('footer or script text leaked into a section');
      _assertEqual(mcpGuideParseHtml('').sections, [], 'empty input');
    },
  },
  {
    name: 'N-547 AC3 / AC4 drift canary - the five real guides: one section per guide-section marker, every id / title / text present and unique, no tags or entities left, last section free of footer and script text, the long user-guide sections split into chunks',
    fn: function () {
      _mcpGuideReal();
      MCP_N547_HTML_GUIDES.forEach(f => {
        const html = MCP_GUIDE_TEXTS[f];
        const p = _mcpGuideReal.parsed[f];
        const markers = (html.match(/<div\b[^>]*class="(?:[^"]* )?guide-section(?: [^"]*)?"[^>]*>/g) || []).length;
        _assertEqual([p.sections.length, p.skipped], [markers, 0], f + ': a section per marker, none without an id');
        if (!/ — User Guide$/.test(p.title)) throw new Error(f + ': page title "' + p.title + '"');
        const ids = p.sections.map(s => s.id);
        _assertEqual(new Set(ids).size, ids.length, f + ': ids unique');
        p.sections.forEach(s => {
          if (!s.title || !s.text || !s.chunks.length) throw new Error(f + '#' + s.id + ': empty title, text or chunks');
          if (/<\/?(?:div|span|p|ul|ol|li|h[1-6]|strong|em|b|i|a|code|br|table|tr|td|th)\b[^>]*>/i.test(s.text) || /&(?:amp|lt|gt|nbsp|mdash|middot|quot|#\d+);/.test(s.text)) throw new Error(f + '#' + s.id + ': tags or entities left in the text');
        });
        const foot = /<div\b[^>]*class="guide-footer"[^>]*>([\s\S]*?)<\/div>/.exec(html);
        const last = p.sections[p.sections.length - 1].text;
        if ((foot && last.indexOf(mcpGuideHtmlToText(foot[1])) >= 0) || /guide-search\.js/.test(last)) throw new Error(f + ': the last section carries the page footer or script');
      });
      const ug = _mcpGuideReal.parsed['user-guide.html'];
      const faq = ug.sections.find(s => s.id === 'faq');
      if (!faq || faq.chunks.filter(c => c.heading).length < 5) throw new Error('user-guide FAQ should split into one chunk per question');
      const biggest = ug.sections.slice().sort((a, b) => b.text.length - a.text.length)[0];
      if (biggest.text.length > MCP_GUIDE_READ_CAP && biggest.chunks.filter(c => c.heading).length < 2) throw new Error(biggest.id + ' is long but has no subsections to read it by');
    },
  },
  {
    name: 'N-547 AC5 markdown parser: ## sections with GitHub-style ids (duplicates numbered), ### chunks, Changelog left out, fenced ## lines are not headings, links and bold flattened; the real README parses the same way',
    fn: function () {
      const p = mcpGuideParseMarkdown(MCP_N547_FIXTURE_MD);
      _assertEqual([p.title, p.sections.map(s => s.id)], ['Title One', ['alpha-section', 'alpha-section-1', 'last--done-x']], 'ids');
      _assertEqual(p.sections[0].chunks, [{ heading: null, text: 'Some bold link text.' }, { heading: 'Sub A', text: 'a body' }, { heading: 'Sub B', text: 'b body' }], 'chunks');
      _assertEqual(mcpGuideSlug('Development & Performance (PDP)'), 'development--performance-pdp', 'GitHub slug');
      _assertEqual(mcpGuideUrl('README.md', 'x'), null, 'README has no anchor url');
      const real = _mcpGuideReal.parsed ? _mcpGuideReal.parsed : (_mcpGuideReal(), _mcpGuideReal.parsed);
      const readme = real['README.md'];
      if (readme.sections.some(s => /changelog/i.test(s.title))) throw new Error('README Changelog must be left out');
      if (!readme.sections.some(s => s.id === 'newton-for-claude-mcp')) throw new Error('README section "Newton for Claude (MCP)" missing');
    },
  },
  {
    name: 'N-547 AC6 search ranking over the real guides: the expected section is in the top 3 for fixed how-do-I questions; guide filter, limit, two hits per section, snippet length and urls hold; nonsense finds nothing',
    fn: function () {
      const all = _mcpGuideReal();
      const top = (q, n) => mcpGuideRank(all, q, n || 5).slice(0, 3).map(h => h.guide + '#' + h.section + (h.subsection ? '/' + h.subsection : ''));
      const has = (q, want) => { const t = top(q); if (!t.some(x => x.indexOf(want) === 0)) throw new Error('"' + q + '": expected ' + want + ' in the top 3, got ' + JSON.stringify(t)); };
      has('log weekly activity', 'user-guide.html#activity');
      has('change role stage', 'user-guide.html#roles-page/Updating a stage without opening the form');
      has('export report to PDF', 'user-guide.html#report-library');
      has('PDP goals', 'my-momentum-user-guide.html#pdp-goals-actions');
      _assertEqual(top('how do I sign in')[0], 'user-guide.html#faq/How do I sign in?', 'sign in = the FAQ question');
      _assertEqual(mcpGuideRank(all, 'zzzzqqqq', 5), [], 'nonsense');
      const hits = mcpGuideRank(all, 'roles', 8);
      _assertEqual(hits.length, 8, 'limit honoured');
      const per = {};
      hits.forEach(h => { const k = h.guide + '#' + h.section; per[k] = (per[k] || 0) + 1; if (per[k] > MCP_GUIDE_PER_SECTION) throw new Error('more than two hits from ' + k); });
      const one = mcpGuideRank(all.filter(g => g.file === 'sales-user-guide.html'), 'export report', 5);
      if (!one.length || one.some(h => h.guide !== 'sales-user-guide.html')) throw new Error('guide filter');
      mcpGuideRank(all, 'weekly activity', 8).forEach(h => {
        if (h.snippet.length > MCP_GUIDE_SNIPPET + 20 || !h.snippet) throw new Error('snippet length ' + h.snippet.length);
        _assertEqual(h.url, h.guide === 'README.md' ? null : CONFIG.REDIRECT_URI + h.guide + '#' + h.section, 'url');
        _assertEqual(Object.keys(h), ['guide', 'guideTitle', 'section', 'sectionTitle', 'subsection', 'snippet', 'url'], 'hit fields');
      });
      _assertEqual(mcpGuideTerms('the and'), ['the', 'and'], 'a query of only stopwords falls back to its own words');
      _assertEqual(mcpGuideTerms('How do I sign in? Roles'), ['sign', 'role'], 'stopwords dropped, trailing s trimmed');
    },
  },
  {
    name: 'N-547 AC7 read_guide_section (pure part): a short section whole; a long one is cut with its subsection list and a note; subsection by heading or unique fragment; unknown / ambiguous sections and subsections list the valid options',
    fn: function () {
      const all = _mcpGuideReal();
      const ug = all.find(g => g.file === 'user-guide.html').parsed;
      const short = ug.sections.find(s => s.text.length < MCP_GUIDE_READ_CAP && s.chunks.length > 1);
      const r1 = mcpGuideReadFrom('user-guide.html', ug, { section: short.id.toUpperCase() });
      _assertEqual([r1.section, r1.text, r1.truncated], [short.id, short.text, undefined], 'short section whole (id case-insensitive)');
      _assertEqual(r1.url, CONFIG.REDIRECT_URI + 'user-guide.html#' + short.id, 'url');
      const long = ug.sections.find(s => s.text.length > MCP_GUIDE_READ_CAP);
      if (!long) throw new Error('fixture: expected a user-guide section longer than the read cap');
      const r2 = mcpGuideReadFrom('user-guide.html', ug, { section: long.id });
      _assertEqual([r2.truncated, r2.text.length <= MCP_GUIDE_READ_CAP, r2.subsections.length > 1, /subsection/.test(r2.note)], [true, true, true, true], 'long section cut with subsections');
      const head = long.chunks.filter(c => c.heading)[0].heading;
      const r3 = mcpGuideReadFrom('user-guide.html', ug, { section: long.id, subsection: head.toUpperCase() });
      _assertEqual([r3.subsection, r3.truncated], [head, undefined], 'subsection by heading');
      const r4 = mcpGuideReadFrom('user-guide.html', ug, { section: 'faq', subsection: 'sign in' });
      _assertEqual(r4.subsection, 'How do I sign in?', 'unique fragment');
      _mcpThrows(() => mcpGuideReadFrom('user-guide.html', ug, { section: 'nope' }), /^No section "nope" in user-guide\.html\. Sections: .*activity \(/, 'unknown section lists the ids');
      _mcpThrows(() => mcpGuideReadFrom('user-guide.html', ug, { section: 'faq', subsection: 'zzzz' }), /^No subsection matches "zzzz"\. Subsections: .*How do I sign in\?/, 'unknown subsection');
      _mcpThrows(() => mcpGuideReadFrom('user-guide.html', ug, { section: 'faq', subsection: 'how' }), /^More than one subsection matches "how"\./, 'ambiguous subsection is reported, not guessed');
    },
  },
  {
    name: 'N-547 AC9 lintMcpGuideTools: mcp/newton-guides.js is clean (and F-12 dates); fetchGuide only as fetchGuide(file) after the MCP_GUIDE_FILES check; a Graph path, write call, DOM name, spread or unchecked fetchGuide is caught',
    fn: function () {
      if (typeof MCP_SOURCES === 'undefined') _skip('Source scan needs filesystem access - runs under node tests/run.js, not in the browser runner.');
      const src = MCP_SOURCES['newton-guides.js'];
      _assertEqual(lintMcpGuideTools(src, CONFIG).map(v => `${v.line} ${v.rule}: ${v.problem}`), [], 'lintMcpGuideTools on mcp/newton-guides.js');
      const rules = s => lintMcpGuideTools(s, CONFIG).map(v => v.rule);
      const ok = 'async function load(file) {\n  if (MCP_GUIDE_FILES.indexOf(file) < 0) throw new Error("x");\n  return fetchGuide(file);\n}\n';
      _assertEqual(rules(ok), [], 'checked fetchGuide(file) passes');
      _assertEqual(rules('async function h(args) {\n  return fetchGuide(args.guide);\n}\n'), ['guide'], 'a tool argument straight into fetchGuide');
      _assertEqual(rules('async function load(file) {\n  return fetchGuide(file);\n}\n'), ['guide'], 'no MCP_GUIDE_FILES check');
      _assertEqual(rules('async function load(file) {\n  const t = await fetchGuide(file);\n  if (MCP_GUIDE_FILES.indexOf(file) < 0) throw new Error("x");\n  return t;\n}\n'), ['guide'], 'check after the call');
      _assertEqual(rules(ok + 'function g() { return fetch("https://x"); }\n'), ['transport'], 'direct fetch');
      _assertEqual(rules(ok + 'function g() { return "/sites/x"; }\n'), ['graph'], 'Graph path text');
      _assertEqual(rules(ok + 'function g() { return updateItem("Roles", 1, {}); }\n'), ['write'], 'write call');
      _assertEqual(rules(ok + 'function g() { return document.title; }\n'), ['dom'], 'DOM name');
      _assertEqual(rules(ok + 'function g(a) { return { ...a }; }\n'), ['spread'], 'spread');
    },
  },
);
