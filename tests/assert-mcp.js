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

function _mcpThrows(fn, re, label) {
  try { fn(); } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`${label}: threw "${e.message}", expected ${re}`);
    return;
  }
  throw new Error(`${label}: did not throw`);
}

ASSERTIONS.push(
  {
    name: 'N-393 AC1 / N-394 AC1 MCP_TOOLS: the eight reporting tools then bench, utilisation, project_team; named handlers declared once, closed schemas, enums from CONFIG',
    fn: function () {
      _assertEqual(MCP_TOOLS.map(t => t.name), MCP_N393_TOOL_NAMES.concat(MCP_N394_TOOL_NAMES, MCP_N466_TOOL_NAMES, MCP_N467_TOOL_NAMES, MCP_N535_TOOL_NAMES), 'tool names and order');
      MCP_TOOLS.forEach(t => {
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(t.name) || t.name === 'newton_status') throw new Error(`bad tool name ${t.name}`);
        if (typeof t.handler !== 'function' || !/^mcp[A-Z]\w+$/.test(t.handler.name)) throw new Error(`${t.name}: handler must be a named mcp<Name> function`);
        if (typeof MCP_SOURCES !== 'undefined') {
          const decl = (MCP_SOURCES['newton-tools.js'].match(new RegExp('async function ' + t.handler.name + '\\(', 'g')) || []).length;
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
      _assertEqual(sc[sc.length - 1], 'mcp/newton-tools.js', 'tools load last');
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
      _assertEqual(sc[sc.length - 1], 'mcp/newton-tools.js', 'tools load last');
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
    name: 'N-395 mcp/README.md — the ten headings in order, the download URL and update message quoted from server-core.js, both token paths, no secret-looking text',
    fn: function () {
      if (typeof REPO_FILES === 'undefined' || typeof REPO_FILES.mcpReadme !== 'string') return _skip('Install-guide check needs filesystem access — runs under node tests/run.js');
      const g = REPO_FILES.mcpReadme.replace(/\r\n/g, '\n');   // Windows checkouts may use CRLF
      const core = REPO_FILES.mcpServerCore;
      if (!g) throw new Error('mcp/README.md is missing or empty');
      const heads = ['What it is', 'Before you start', 'Install', 'First sign-in', 'Things to ask', 'Signing in again', 'Updating', 'Uninstalling', 'If something goes wrong', 'Privacy and safety'];
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
    name: 'N-401 mcp/README.md renders through mdGuideToHtml: ten h2 in order, download link, every table row, no leftover markers or scripts',
    fn: function () {
      const g = REPO_FILES.mcpReadme;
      if (typeof g === 'undefined') _skip('REPO_FILES is supplied by tests/run.js; the browser runner has no filesystem.');
      const core = REPO_FILES.mcpServerCore || '';
      const url = (core.match(/const DOWNLOAD_URL = '([^']+)'/) || [])[1];
      if (!url) throw new Error('DOWNLOAD_URL not found in mcp/bootstrap/server-core.js');
      const html = mdGuideToHtml(g);
      const h2 = (html.match(/<h2[^>]*>([^<]*)<\/h2>/g) || []).map(h => h.replace(/<[^>]+>/g, ''));
      _assertEqual(h2, ['What it is', 'Before you start', 'Install', 'First sign-in', 'Things to ask', 'Signing in again', 'Updating', 'Uninstalling', 'If something goes wrong', 'Privacy and safety'], 'h2 headings in order');
      if (html.indexOf('<a href="' + url + '"') < 0) throw new Error('rendered guide does not link DOWNLOAD_URL ' + url);
      const rows = g.split(/\r?\n/).filter(l => /^\|/.test(l) && !/^\|[ :|-]*-[ :|-]*\|\s*$/.test(l)).length;
      _assertEqual((html.match(/<tr>/g) || []).length, rows, 'table rows in the guide vs rendered <tr>');
      [/<script/i, /javascript:/i, /\*\*/, /`/, /^## /m, /\|---/].forEach(re => {
        if (re.test(html)) throw new Error('rendered guide contains ' + re + ' - the README uses syntax the renderer does not handle');
      });
      if (html.indexOf('Claude_&lt;id&gt;') < 0) throw new Error('Claude_<id> must render as visible text');
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
  MCP_N553_SCOPED_TOOLS.concat(['time_to_fill']).forEach(n => { out[n] = all; });
  ['project_scorecards', 'bench', 'utilisation', 'project_team', 'workforce_segmentation', 'joiners', 'business_goals'].forEach(n => { out[n] = lead; });
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
      _assertEqual(Object.keys(m.writeLists), ['WeeklyActivity', 'Roles', 'RoleHistory', 'Notifications'], 'writeLists lists (SavedReports joins in N-550)');
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
