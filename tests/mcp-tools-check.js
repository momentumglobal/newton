// tests/mcp-tools-check.js - N-393: Node-side checks of the Newton for Claude reporting tools
// (mcp/newton-tools.js). Run by tests/run.js after tests/mcp-bootstrap-check.js, in the same
// totals and exit code.
//
// The handlers are async and read through Graph, so they can't run in run.js's synchronous
// vm loop. Here they run exactly as in production: the REAL loader (mcp/bootstrap/loader.js,
// localDir mode) loads js/config.js + CONFIG.MCP.scripts from this checkout into a DOM-less
// context, and the REAL read-only fetch shim sits between the handlers and a fixture Graph
// serving FIXTURES.mcp (tests/fixtures.js). The fixture Graph honours every $filter clause
// the getters send, honours $select, serves /items/delta and $batch, records each list it is
// asked for, and THROWS on a $filter clause it does not understand - so a filter it can't
// evaluate fails a check instead of silently over-fetching. No network, no Windows.
//
// run() resolves [{ name, ok, message }].
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const BOOT = path.join(ROOT, 'mcp', 'bootstrap');
const GRAPH = 'https://graph.microsoft.com/v1.0';

function ok(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg}: expected ${jb}, got ${ja}`);
}
async function rejects(promise, re, msg) {
  try { await promise; } catch (e) {
    ok(re.test(e && e.message), `${msg}: rejected with "${e && e.message}", expected ${re}`);
    return;
  }
  throw new Error(msg + ' (it resolved)');
}
const stubShim = () => ({
  getToken: async () => 'tok',
  getCurrentUser: () => ({ email: 'chris@example.com', name: 'Test' }),
  isSignedIn: () => true,
  authReady: () => Promise.resolve(null),
});

// ── Fixtures: tests/fixtures.js (vm, data only) with offsets materialised ──
function loadFixtures() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8') + '\nthis.FIXTURES = FIXTURES;', ctx);
  return JSON.parse(JSON.stringify(ctx.FIXTURES.mcp));
}
function pad(n) { return String(n).padStart(2, '0'); }
function localDay(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
// { d: n } -> n days from today; { w: k } -> the week-ending Sunday k weeks before this week's.
function materialise(lists) {
  const now = new Date();
  const today = localDay(now);
  const thisSunday = addDays(today, (7 - now.getDay()) % 7);
  const conv = v => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (typeof v.d === 'number') return addDays(today, v.d) + 'T12:00:00Z';
      if (typeof v.w === 'number') return addDays(thisSunday, -7 * v.w) + 'T12:00:00Z';
    }
    return v;
  };
  const out = {};
  Object.keys(lists).forEach(l => {
    out[l] = lists[l].map(row => {
      const r = {};
      Object.keys(row).forEach(k => { r[k] = conv(row[k]); });
      return r;
    });
  });
  return { lists: out, today };
}

// ── Fixture Graph ──────────────────────────────────────────────────
function splitTop(s, sep) {
  const out = [];
  let depth = 0, inStr = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\'') inStr = !inStr;
    else if (!inStr && c === '(') depth++;
    else if (!inStr && c === ')') depth--;
    else if (!inStr && depth === 0 && s.startsWith(sep, i)) { out.push(s.slice(start, i)); start = i + sep.length; i += sep.length - 1; }
  }
  out.push(s.slice(start));
  return out;
}
function atom(a) {
  const m = /^fields\/(\w+) (eq|ge) (?:'((?:[^']|'')*)'|(-?\d+))$/.exec(a.trim());
  if (!m) throw new Error('fixture graph: unsupported $filter clause: ' + a);
  const field = m[1], op = m[2];
  const want = m[3] !== undefined ? m[3].replace(/''/g, '\'') : Number(m[4]);
  return row => {
    let v = row[field];
    if (v === undefined) v = row[field + 'LookupId'];
    if (v === undefined || v === null || v === '') return false;
    if (op === 'eq') return typeof want === 'number' ? Number(v) === want : String(v) === want;
    return String(v).slice(0, 10) >= String(want);   // ge on a day: SharePoint compares dates
  };
}
function parseFilter(f) {
  const preds = splitTop(f.trim(), ' and ').map(part => {
    const p = part.trim();
    if (p.startsWith('(') && p.endsWith(')')) {
      const ors = splitTop(p.slice(1, -1), ' or ').map(atom);
      return row => ors.some(fn => fn(row));
    }
    return atom(p);
  });
  return row => preds.every(fn => fn(row));
}
function makeGraph(lists, opts = {}) {
  const asked = [];
  function respond(rel) {
    const qi = rel.indexOf('?');
    const p = decodeURIComponent(qi === -1 ? rel : rel.slice(0, qi));
    const q = qi === -1 ? '' : rel.slice(qi + 1);
    const m = /^\/sites\/[^/]+\/lists\/([^/]+)\/items(\/delta)?$/.exec(p);
    if (!m) return { status: 404, body: { error: { message: 'fixture graph: unknown path ' + p } } };
    const list = m[1];
    asked.push(list);
    if ((opts.fail || []).includes(list)) return { status: 500, body: { error: { message: 'fixture graph: forced failure for ' + list } } };
    const params = new URLSearchParams(q);
    if (m[2] && params.get('token')) return { status: 200, body: { value: [], '@odata.deltaLink': GRAPH + p + '?token=1' } };
    const sel = /fields\(\$select=([^)]*)\)/.exec(params.get('$expand') || '');
    const pick = sel && sel[1] !== '*' ? sel[1].split(',') : null;
    const filter = params.get('$filter');
    let rows = lists[list] || [];
    if (filter) rows = rows.filter(parseFilter(filter));
    const value = rows.map(r => {
      const fields = {};
      Object.keys(r).forEach(k => { if (k !== 'id' && (!pick || pick.includes(k))) fields[k] = r[k]; });
      return { id: r.id, fields };
    });
    const body = { value };
    if (m[2]) body['@odata.deltaLink'] = GRAPH + p + '?token=1';
    return { status: 200, body };
  }
  const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  async function graphFetch(url, o) {
    const u = String(url);
    const rel = u.slice(GRAPH.length);
    if ((o && o.method) === 'POST' && rel === '/$batch') {
      const reqs = JSON.parse(o.body).requests;
      return json({ responses: reqs.map(r => Object.assign({ id: r.id }, respond(r.url))) }, 200);
    }
    const r = respond(rel);
    return json(r.body, r.status);
  }
  return { graphFetch, asked };
}

// ── Run ────────────────────────────────────────────────────────────
async function run() {
  const results = [];
  async function check(name, fn) {
    try {
      await fn();
      results.push({ name: 'N-393 ' + name, ok: true });
    } catch (e) {
      results.push({ name: 'N-393 ' + name, ok: false, message: e && e.message ? e.message : String(e) });
    }
  }
  const { createLoader } = require(path.join(BOOT, 'loader.js'));
  const { createServer, MCP_CONTRACT } = require(path.join(BOOT, 'server-core.js'));
  const FIX = loadFixtures();
  const { lists, today } = materialise(FIX.lists);
  const outputs = [];   // every serialised tool result, for the AC 9 scan

  async function newLoader(opts) {
    const graph = makeGraph(lists, opts);
    const L = createLoader({ authShim: stubShim(), localDir: ROOT, graphFetch: graph.graphFetch, log: () => {} });
    const st = await L.load({ contract: MCP_CONTRACT });
    ok(st.ok, 'live load failed: ' + st.reason);
    const tools = Array.from(L.evalInContext('MCP_TOOLS'));
    const call = async (name, args) => {
      const t = tools.find(x => x.name === name);
      ok(t, 'no tool ' + name);
      const out = await t.handler(args || {});
      const text = JSON.stringify(out);
      outputs.push({ name, args, text });
      return JSON.parse(text);
    };
    return { L, graph, tools, call };
  }

  let main;
  try {
    main = await newLoader();
  } catch (e) {
    return [{ name: 'N-393 tools check setup (loader + fixture Graph)', ok: false, message: e.message }];
  }
  const { L, call } = main;
  const allowed = Array.from(L.config().MCP.allowedLists);
  const ids = rows => rows.map(r => r.roleId);
  const day = n => addDays(today, n);

  await check('AC1 tools/list through the real server = newton_status + the eight reporting tools, all readOnlyHint; a call comes back wrapped with asOf + newtonBuild', async () => {
    const lines = [];
    const gated = Object.assign({}, L, { call: (fn, ...a) => (fn === 'getEffectiveRole' ? Promise.resolve('leadership') : L.call(fn, ...a)) });
    const auth = { ensureToken: async () => 'tok', status: () => ({ storeMode: 'test', pendingSince: null }), takeLastError: () => null,
      startSignIn: async () => ({}), currentUser: () => ({ email: 'chris@example.com' }), shutdown() {} };
    const srv = createServer({ loader: gated, auth, write: o => lines.push(o), log: () => {} });
    await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const tl = lines.find(l => l.id === 1).result.tools;
    eq(tl.map(t => t.name), ['newton_status', 'list_projects', 'project_summary', 'list_roles', 'role_detail', 'activity_summary', 'list_placements', 'time_to_fill', 'project_scorecards'], 'tools/list');
    ok(tl.every(t => t.annotations && t.annotations.readOnlyHint === true), 'a tool without readOnlyHint');
    await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }));
    const res = lines.find(l => l.id === 2).result;
    ok(!res.isError, 'list_projects through the server errored: ' + res.content[0].text);
    const data = JSON.parse(res.content[0].text);
    ok(data.asOf && 'newtonBuild' in data && data.count === 4, 'wrapped result: ' + res.content[0].text.slice(0, 160));
    await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'project_summary', arguments: { project: 'acme', extra: 1 } } }));
    ok(lines.find(l => l.id === 3).result.isError, 'an unknown argument is refused (closed schema)');
  });

  await check('AC4 each tool asks the fixture Graph only for allowlisted lists, and exactly its documented read set', async () => {
    const expected = {
      list_projects: [{}, ['Projects', 'UserAssignments']],
      project_summary: [{ project: 'Acme' }, ['Placements', 'Projects', 'RoleHeadcount', 'RoleHistory', 'Roles', 'WeeklyActivity']],
      list_roles: [{}, ['Placements', 'Projects', 'RoleHeadcount', 'RoleHistory', 'Roles', 'UserAssignments', 'WeeklyActivity']],
      role_detail: [{ roleId: 201 }, ['Placements', 'Projects', 'RoleHeadcount', 'RoleHistory', 'Roles', 'UserAssignments', 'WeeklyActivity']],
      activity_summary: [{}, ['AnomalyAcks', 'Projects', 'Roles', 'UserAssignments', 'WeeklyActivity']],
      list_placements: [{ from: day(-30), to: today }, ['Placements', 'Projects', 'RoleHeadcount', 'Roles', 'UserAssignments']],
      time_to_fill: [{}, ['Placements', 'Projects', 'RoleHeadcount', 'RoleHistory', 'Roles']],
      project_scorecards: [{}, ['Assignments', 'Placements', 'Projects', 'RoleHeadcount', 'RoleHistory', 'Roles', 'WeeklyActivity']],
    };
    for (const name of Object.keys(expected)) {
      const fresh = await newLoader();
      await fresh.call(name, expected[name][0]);
      const asked = Array.from(new Set(fresh.graph.asked)).sort();
      const outside = asked.filter(l => !allowed.includes(l));
      eq(outside, [], `${name} read lists outside CONFIG.MCP.allowedLists`);
      eq(asked, expected[name][1], `${name} read set`);
    }
  });

  await check('list_projects: active only by default (Closed project left out), type filter, DM shown by name, kpiExcluded marks internal + LCI', async () => {
    const r = await call('list_projects', {});
    eq(r.projects.map(p => p.name), ['Acme Bank', 'Bluefin Labs', 'Corvid LCI', 'Momentum Internal'], 'active projects');
    eq(r.projects.map(p => p.kpiExcluded), [false, false, true, true], 'kpiExcluded');
    eq(r.projects[0].deliveryManager, 'Dana Manager', 'DM display name');
    eq((await call('list_projects', { active: false })).count, 5, 'all projects');
    eq((await call('list_projects', { type: 'CoE' })).projects.map(p => p.id), [102], 'type filter');
  });

  await check('AC5 project_summary (Acme Bank) = the hand-derived figures and the Project Dashboard / CC call shapes', async () => {
    const r = await call('project_summary', { project: 'acme bank' });
    eq(r.project.id, 101, 'project');
    eq(r.pipelines, { total: 6, open: 3, byStage: { Backlog: 1, Sourcing: 1, Submitted: 1, 'Interview 1': 1, Closed: 1, 'On-hold': 1 } }, 'pipelines');
    eq(Object.keys(r.pipelines.byStage), ['Backlog', 'Sourcing', 'Submitted', 'Interview 1', 'Closed', 'On-hold'], 'stage order');
    eq([r.health.open, r.health.flagged, r.health.behindPace, r.health.rag], [3, 2, 1, 'red'], 'health');
    eq(r.headcount.open, 3, 'open dated headcount');
    eq([r.hires.count, r.hires.avgDaysToHire, r.hires.onTimePct, r.hires.to], [1, 60, 100, today], 'hire KPIs');
    const oracle = await L.evalInContext(`(async () => {
      const roles = await getRolesForProject(101);
      const roleIds = roles.map(r => r.id);
      const [acts, pls, hcRows, stageRows] = await Promise.all([getWeeklyActivity(null, null, { roleIds }), getPlacements(null, { roleIds }), getAllHeadcount(), getRoleStageHistory()]);
      const hc = dashboardHeadcountContext(roles, pls, hcRows);
      const open = roles.filter(r => isOpenPipelineStage(r.Stage));
      const sh = groupStageHistoryByRole(stageRows);
      const h = projectHealthCounts(roles, acts, sh, hc.openSince);
      return JSON.stringify([h.open, h.flagged, h.behind, computeProjectHealthRAG(roles, acts, sh),
        openHeadcountCount(open, hc.headcount, hc.fillMap), avgOpenHeadcountDays(open, hc.headcount, hc.fillMap)]);
    })()`);
    eq([r.health.open, r.health.flagged, r.health.behindPace, r.health.rag, r.headcount.open, r.headcount.avgDaysOpen], JSON.parse(oracle), 'equals the live functions on the dashboard call shape');
    ok([17, 18].includes(r.headcount.avgDaysOpen), 'avg days open (30+12+10)/3, ±1 for the UTC day in daysOpen: got ' + r.headcount.avgDaysOpen);
    eq((await call('project_summary', { project: '101', weeks: 2 })).hires.count, 0, 'a 2-week window has no hire');
  });

  await check('AC6 list_roles: open pipelines company-wide, flagged first with reasons; project / flaggedOnly / stage / country / function filters; row cap', async () => {
    const all = await call('list_roles', {});
    eq(ids(all.roles), [201, 202, 208, 203, 206, 209], 'open pipelines, flagged first then project then title');
    eq([all.total, all.flaggedCount, all.truncated], [6, 3, false], 'counts');
    const by = Object.fromEntries(all.roles.map(r => [r.roleId, r]));
    eq(by[201].reasons, { stuck: true, conversion: false, behindPace: true }, '201 stuck + behind');
    eq([by[201].daysInStage, by[201].stageBudget], [30, 15], '201 days in stage vs budget');
    eq(by[202].reasons, { stuck: false, conversion: true, behindPace: false }, '202 low conversion');
    eq(by[209].reasons, { stuck: false, conversion: false, behindPace: true }, '209 behind only (Offered never stuck)');
    eq(by[209].flagged, false, '209 not flagged');
    eq(by[208].project, { id: 103, name: 'Momentum Internal', kpiExcluded: true }, 'internal role listed, marked');
    eq(by[206].talentPartners, ['Tess One', 'Tom Two'], 'TP display names');
    eq(by[201].headcount, { open: 2, filled: 0, cancelled: 0, total: 2 }, '201 headcount counts');
    eq(by[201].openSince, day(-30), '201 open since its oldest open headcount');
    eq(ids((await call('list_roles', { project: 'acme', flaggedOnly: true })).roles), [201, 202], 'project + flaggedOnly');
    eq(ids((await call('list_roles', { stage: 'Closed' })).roles).sort(), [204, 211], 'stage filter replaces the open filter');
    const es = await call('list_roles', { country: 'spain', function: 'engin' });
    eq([ids(es.roles), es.filters.country, es.filters.function], [[203, 206, 209], 'Spain', 'Engineering'], 'country + function resolved');
  });

  await check('role_detail: allowlisted role fields, headcount slots, Stage-only timeline (Budget / HM / Notes history never read out), funnel, flag, placement dates', async () => {
    const r = await call('role_detail', { roleId: 201 });
    eq([r.role.roleId, r.role.title, r.role.country, r.role.function, r.role.project.name], [201, 'Backend Engineer', 'Portugal', 'Engineering', 'Acme Bank'], 'role');
    eq(Object.keys(r.role).sort(), ['actualHireDate', 'backfill', 'country', 'function', 'openDate', 'priority', 'project', 'roleId', 'stage', 'talentPartners', 'targetHireDate', 'title'], 'role keys (allowlist)');
    eq(r.headcount.slots.map(s => [s.label, s.status, s.openDate]), [['Headcount 1', 'open', day(-30)], ['Headcount 2', 'open', null]], 'slots');
    eq(r.stageTimeline.map(t => [t.from, t.to]), [[null, 'Sourcing']], 'Stage rows only');
    eq([r.flag.flagged, r.flag.reasons.stuck], [true, true], 'flag');
    eq([r.funnel.weeks, r.funnel.totals.Outreach], [12, 30], 'funnel');
    const closed = await call('role_detail', { roleId: 204 });
    eq(closed.placements.rows.map(p => [p.offerAcceptedDate, p.headcount]), [[day(-400), null], [day(-20), 'Headcount 1']], 'placement dates + headcount label');
    eq(closed.headcount.counts, { open: 0, filled: 1, cancelled: 1, total: 1 }, 'filled + cancelled');
  });

  await check('AC7 activity_summary: client-only weekly totals; Data Health anomalies with the acknowledged funnel held back; project scope', async () => {
    const r = await call('activity_summary', {});
    eq([r.byWeek.length, r.totals.Outreach, r.totals.Responses, r.totals.Submitted, r.totals.Interview1, r.totals.Offers], [3, 92, 34, 11, 5, 2], 'company totals (internal role 208 excluded)');
    eq(r.byWeek.map(w => w.weekEnding), [3, 2, 1].map(k => addDays(addDays(today, (7 - new Date().getDay()) % 7), -7 * k)), 'week-ending Sundays');
    eq(r.conversion.map(c => c.stage), ['Response', 'IV1 Conv.', 'IV→Offer', 'Offer Success'], 'conversion stages');
    ok(r.conversion.every(c => !('rag' in c)), 'conversion carries no RAG (B4)');
    eq(r.anomalies.impossibleFunnels.rows.map(f => [f.roleId, f.breaches.map(b => `${b.later}:${b.laterTotal}>${b.earlier}:${b.earlierTotal}`).join(';')]), [[206, 'Responses:18>Outreach:12']], 'open impossible funnels');
    eq([r.anomalies.acknowledgedCount, r.anomalies.acknowledgementsChecked], [1, true], 'acknowledged 209');
    const p = await call('activity_summary', { project: 'Acme Bank', weeks: 2 });
    eq([p.totals.Outreach, p.anomalies.impossibleFunnels.total, p.anomalies.spikes], [80, 0, null], 'Acme, 2 weeks: 30+20+20+10');
    const noAcks = await newLoader({ fail: ['AnomalyAcks'] });
    const u = await noAcks.call('activity_summary', {});
    eq([u.anomalies.acknowledgementsChecked, u.anomalies.impossibleFunnels.rows.map(f => f.roleId).sort()], [false, [206, 209]], 'AnomalyAcks unreadable → flags shown, says so');
  });

  await check('AC8 list_placements: window, client-only company view, summary via hireKpis, byProject, newest first; internal project on request', async () => {
    const r = await call('list_placements', { from: day(-30), to: today });
    eq([r.total, r.summary], [2, { count: 2, avgDaysToHire: 48, onTimePct: 50 }], 'company, last 30 days (403 internal excluded)');
    eq(r.byProject, [{ project: 'Acme Bank', count: 1 }, { project: 'Bluefin Labs', count: 1 }], 'byProject');
    eq(r.placements.map(p => [p.roleId, p.offerAcceptedDate, p.timeToHireDays, p.talentPartner, p.provisionalStartDate]),
      [[204, day(-20), 60, 'Tom Two', day(10)], [209, day(-25), 35, 'Tess One', day(5)]], 'rows');
    const internal = await call('list_placements', { from: day(-30), to: today, project: 'momentum' });
    eq(internal.placements.map(p => [p.roleId, p.timeToHireDays]), [[208, 25]], 'internal project by name (role Open Date fallback)');
    eq((await call('list_placements', { from: day(-500), to: today })).total, 6 - 1, 'all-time window, internal excluded');
  });

  await check('AC8 time_to_fill = computeTTFPrediction on the Placement Analytics inputs; project_scorecards = buildProjectScorecards on the CC inputs', async () => {
    const t = await call('time_to_fill', { function: 'engineering', country: 'spain' });
    eq([t.function, t.country, t.timeToFill.events, t.sampleHires, t.avgTimeToHireDays], ['Engineering', 'Spain', 3, 3, 48], 'Engineering / Spain');
    const ttfOracle = await L.evalInContext(`(async () => {
      const [h, pl, ro, st, hc, pr] = await Promise.all([getHistoricalPlacements(), getPlacements(null), getAllRoles(), getRoleStageHistory(), getAllHeadcount(), getProjects(false)]);
      const x = excludeInternalProjectData({ historical: h, placements: pl, roles: ro, stageRows: st, headcount: hc }, { projects: pr, roles: ro });
      const i = ttfHeadcountInputs({ roles: x.roles, headcount: x.headcount, placements: x.placements, stageRows: x.stageRows });
      const r = computeTTFPrediction('Engineering', 'Spain', x.historical, i.openHeadcount, i.closedCensored);
      return JSON.stringify([r.label, r.medianDays, r.bandDays, r.events, r.censored, r.basis]);
    })()`);
    eq([t.timeToFill.label, t.timeToFill.medianDays, t.timeToFill.bandDays, t.timeToFill.events, t.timeToFill.censored, t.timeToFill.basis], JSON.parse(ttfOracle), 'TTF equals the live function');
    await rejects(call('time_to_fill', { function: 'Talent' }), /No function matched "Talent"/, 'internal-only function is not offered');
    const s = await call('project_scorecards', {});
    eq(s.cards.map(c => c.customer), ['Acme Bank', 'Bluefin Labs'], 'customers, worst first');
    eq([s.cards[0].pipelineHealth.total, s.cards[0].pipelineHealth.flagged, s.cards[0].pipelineHealth.behindPace, s.cards[0].healthRag], [3, 2, 1, 'red'], 'Acme health');
    eq(s.period, { label: 'Rolling Monthly', weeks: 4 }, 'default period');
    const scOracle = await L.evalInContext(`(async () => {
      const [roles0, projects0, assigns, st0, hc0, pids, a52, hist] = await Promise.all([getAllRoles(), getProjects(false), getAssignments({}), getRoleStageHistory(), getAllHeadcount(), getPlacementHeadcountIds(), getActivityForAnalytics(52), getHistoricalPlacements()]);
      const b = excludeInternalProjectData({ roles: roles0, projects: projects0, stageRows: st0, headcount: hc0 }, { projects: projects0 });
      const e = excludeInternalProjectData({ activity: a52, historical: hist }, { projects: projects0, roles: roles0 });
      const now = new Date();
      const projectMap = Object.fromEntries(b.projects.map(p => [String(p.id), p.CustomerName]));
      const cards = buildProjectScorecards({ customers: scorecardCustomers(assigns, projects0, now), roles: b.roles, projectMap,
        stageHistory: groupStageHistoryByRole(b.stageRows), openSince: oldestOpenHeadcountIndex(b.headcount, pids),
        activity52: e.activity, placements: e.historical, weeks: 13, today: now });
      return JSON.stringify(cards.map(c => [c.customer, c.roleHealth, c.metrics.map(m => [m.label, m.value, m.rag])]));
    })()`);
    const q = await call('project_scorecards', { period: 'Rolling Quarterly' });
    eq(q.cards.map(c => [c.customer, { total: c.pipelineHealth.total, flagged: c.pipelineHealth.flagged, stuck: c.pipelineHealth.stuck, conversion: c.pipelineHealth.conversion, behind: c.pipelineHealth.behindPace }, c.metrics.map(m => [m.label, m.value, m.rag])]),
      JSON.parse(scOracle), 'quarterly cards equal the CC call shape');
  });

  await check('AC11 bad input gives a clear message: ambiguous / unknown project, unknown country, bad dates, out-of-range weeks, unknown role', async () => {
    await rejects(call('project_summary', { project: 'a' }), /matched \d+ projects: .*Say which one/, 'ambiguous project');
    await rejects(call('project_summary', { project: 'nowhere' }), /No project matched "nowhere"\. Projects: Acme Bank \(id 101\)/, 'unknown project');
    await rejects(call('list_roles', { country: 'mars' }), /No country matched "mars"\. Options: Portugal, Spain, UK/, 'unknown country');
    await rejects(call('list_placements', { from: today, to: day(-1) }), /is after to/, 'from after to');
    await rejects(call('list_placements', { from: '2026-02-30', to: today }), /from must be a date as YYYY-MM-DD/, 'bad date');
    await rejects(call('activity_summary', { weeks: 53 }), /weeks must be a whole number from 1 to 52/, 'weeks out of range');
    await rejects(call('role_detail', { roleId: 999 }), /No role with id 999/, 'unknown role');
  });

  // AC 9 + AC 10, over every result produced above (each handler ran in the DOM-less context).
  await check('AC9 no tool output contains a sentinel (candidate name, salary, budget, hiring manager, notes, role-history value, ack note, bill rate) or a denied key', async () => {
    ok(outputs.length >= 25, 'too few tool calls captured to mean anything: ' + outputs.length);
    eq(Array.from(new Set(outputs.map(o => o.name))).sort(), ['activity_summary', 'list_placements', 'list_projects', 'list_roles', 'project_scorecards', 'project_summary', 'role_detail', 'time_to_fill'], 'every tool exercised');
    const denied = new Set();
    const cfg = L.config().MCP.outputDenyFields;
    Object.keys(cfg).forEach(k => cfg[k].forEach(f => denied.add(f)));
    const hits = [];
    outputs.forEach(o => {
      FIX.sentinels.forEach(s => { if (o.text.includes(s)) hits.push(`${o.name} ${JSON.stringify(o.args)}: "${s}"`); });
      denied.forEach(k => { if (o.text.includes(`"${k}":`)) hits.push(`${o.name}: key ${k}`); });
    });
    eq(hits, [], 'leaks');
    // Positive control: the sentinels are really in what the tools read.
    const rawRoles = JSON.stringify(await L.evalInContext('getAllRoles()'));
    ok(rawRoles.includes('827364') && rawRoles.includes('ZZQ-HM-201'), 'positive control: the live Roles rows carry the Budget / HiringManager sentinels');
    const rawHist = JSON.stringify(await L.evalInContext('getRoleHistory(201)'));
    ok(rawHist.includes('736455') && rawHist.includes('ZZQ-HM-HIST'), 'positive control: RoleHistory carries the Budget / HM history sentinels');
  });

  return results;
}

module.exports = { run };
