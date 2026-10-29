// tests/assert-mcp.js — Newton for Claude reporting tools (N-393): the synchronous checks.
// Loads AFTER tests/assertions.js and pushes into ASSERTIONS. mcp/newton-tools.js is loaded
// into the same vm by tests/run.js (declarations only). The handlers themselves are async and
// read through Graph, so they run in tests/mcp-tools-check.js (Node side, fixture Graph).

var MCP_N393_TOOL_NAMES = ['list_projects', 'project_summary', 'list_roles', 'role_detail',
  'activity_summary', 'list_placements', 'time_to_fill', 'project_scorecards'];
var MCP_N394_TOOL_NAMES = ['bench', 'utilisation', 'project_team'];

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
      _assertEqual(MCP_TOOLS.map(t => t.name), MCP_N393_TOOL_NAMES.concat(MCP_N394_TOOL_NAMES), 'tool names and order');
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
    name: 'N-393 AC2 CONFIG.MCP: AnomalyAcks allowed, outputDenyFields covers every MCP-D6 field, windows + maxRows set, contract still 1',
    fn: function () {
      const m = CONFIG.MCP;
      _assertEqual(m.contract, 1, 'contract unchanged (B8)');
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
    name: 'N-394 AC2 CONFIG.MCP: api-orgchart.js loads before analytics.js with newton-tools.js still last; Assignments / SalesForecasts money + email fields denied; contract still 1',
    fn: function () {
      const m = CONFIG.MCP;
      _assertEqual(m.contract, 1, 'contract unchanged');
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
