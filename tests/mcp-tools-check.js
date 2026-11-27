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
const stubShim = (email = 'chris@example.com') => ({
  getToken: async () => 'tok',
  getCurrentUser: () => ({ email, name: 'Test' }),
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
    if ((opts.deny || []).includes(list)) return { status: 403, body: { error: { message: 'fixture graph: forced 403 for ' + list } } };   // N-535
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
      results.push({ name: /^N-(394|466|547|553)/.test(name) ? name : 'N-393 ' + name, ok: true });
    } catch (e) {
      results.push({ name: /^N-(394|466|547|553)/.test(name) ? name : 'N-393 ' + name, ok: false, message: e && e.message ? e.message : String(e) });
    }
  }
  const { createLoader } = require(path.join(BOOT, 'loader.js'));
  const { createServer, MCP_CONTRACT } = require(path.join(BOOT, 'server-core.js'));
  const FIX = loadFixtures();
  const { lists, today } = materialise(FIX.lists);
  // N-535: 'Y' / 'Y-1' in the Goals & Actions fixtures are this / last calendar year.
  const yr = new Date().getFullYear();
  const subY = v => (typeof v === 'string' ? v.replace(/^Y-1/, String(yr - 1)).replace(/^Y/, String(yr)) : v);
  lists.BusinessGoals.forEach(r => { r.GoalYear = Number(subY(r.GoalYear)); r.Period = subY(r.Period); });
  const outputs = [];   // every serialised tool result, for the AC 9 scan

  // N-553: every loader runs as one identity. mcpScope() calls the live getEffectiveRole and
  // getUserProjectIds; both are replaced in the vm context with stubs that return `role` /
  // `projectIds` and record their arguments, so no Graph read is added (the AC4 read sets
  // are unchanged). Default: Leadership, whose [] projectScopeForRole lifts to all projects.
  async function newLoader(opts = {}) {
    const id = Object.assign({ email: 'chris@example.com', role: 'leadership', projectIds: [] }, opts.identity || {});
    const graph = makeGraph(lists, opts);
    const L = createLoader({ authShim: stubShim(id.email), localDir: ROOT, graphFetch: graph.graphFetch, log: () => {} });
    const st = await L.load({ contract: MCP_CONTRACT });
    ok(st.ok, 'live load failed: ' + st.reason);
    const scopeCalls = { role: [], projects: [] };
    const stubScope = () => {
      const g = L.evalInContext('globalThis');
      g.getEffectiveRole = async email => { scopeCalls.role.push(email); return id.role; };
      g.getUserProjectIds = async email => { scopeCalls.projects.push(email); return id.projectIds === null ? null : id.projectIds.map(String); };
    };
    stubScope();
    // For createServer: its own load() builds a fresh context, so the stubs go back in after it,
    // and the gate's getEffectiveRole answers the same identity.
    const serverLoader = () => Object.assign({}, L, {
      load: async o => { const st = await L.load(o); if (st.ok) stubScope(); return st; },
      call: (fn, ...a) => (fn === 'getEffectiveRole' ? Promise.resolve(id.role) : L.call(fn, ...a)),
    });
    const tools = Array.from(L.evalInContext('MCP_TOOLS'));
    const call = async (name, args) => {
      const t = tools.find(x => x.name === name);
      ok(t, 'no tool ' + name);
      const out = await t.handler(args || {});
      const text = JSON.stringify(out);
      outputs.push({ name, args, text });
      return JSON.parse(text);
    };
    return { L, graph, tools, call, scopeCalls, serverLoader };
  }

  let main;
  try {
    main = await newLoader();
  } catch (e) {
    return [{ name: 'N-393 tools check setup (loader + fixture Graph)', ok: false, message: e.message }];
  }
  const { L, call, serverLoader } = main;
  const allowed = Array.from(L.config().MCP.allowedLists);
  const ids = rows => rows.map(r => r.roleId);
  const day = n => addDays(today, n);

  await check('AC1 tools/list through the real server = newton_status + the sixteen tools (fourteen data tools, then the two guide tools of N-547), all readOnlyHint; a call comes back wrapped with asOf + newtonBuild', async () => {
    const lines = [];
    const gated = serverLoader();   // N-553: gate and mcpScope both Leadership
    const auth = { ensureToken: async () => 'tok', status: () => ({ storeMode: 'test', pendingSince: null }), takeLastError: () => null,
      startSignIn: async () => ({}), currentUser: () => ({ email: 'chris@example.com' }), shutdown() {} };
    const srv = createServer({ loader: gated, auth, write: o => lines.push(o), log: () => {} });
    await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const tl = lines.find(l => l.id === 1).result.tools;
    eq(tl.map(t => t.name), ['newton_status', 'list_projects', 'project_summary', 'list_roles', 'role_detail', 'activity_summary', 'list_placements', 'time_to_fill', 'project_scorecards', 'bench', 'utilisation', 'project_team', 'workforce_segmentation', 'joiners', 'business_goals', 'search_guides', 'read_guide_section'], 'tools/list');
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
      bench: [{}, ['Assignments', 'People']],                                             // N-394
      utilisation: [{}, ['Assignments', 'People', 'SalesForecasts']],                      // N-394
      project_team: [{ project: 'Acme' }, ['Assignments', 'Projects', 'UserAssignments']], // N-394
      workforce_segmentation: [{}, ['People']],                                            // N-466
      joiners: [{}, ['People']],                                                           // N-467
      business_goals: [{}, ['BusinessActions', 'BusinessGoalUpdates', 'BusinessGoals', 'LeadershipAccess', 'UserAssignments']],   // N-535
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

  // ── N-394 People tools ───────────────────────────────────────────────
  await check('N-394 AC4 / N-422 bench = buildBenchPool on the Org Chart reads (same order); since = earliest current bench start; working, forecast-only, CSD, internal, placeholder, leaver and not-yet-started staff left out', async () => {
    const r = await call('bench', {});
    eq(r.people.map(p => [p.name, p.level, p.location, p.since]),
      [['Bea Bench', 'TP', 'Porto', null], ['Ben Blank', 'PTP', 'London', day(-20)], ['Eve Ended', 'TP', 'Madrid', null]], 'bench people');
    const oracle = await L.evalInContext(`(async () => {
      const [p, c] = await Promise.all([getPeople(true, true), getCurrentAssignmentsByEmployee()]);
      return JSON.stringify(buildBenchPool(p.filter(x => isStartedPerson(x)), c).map(x => x.EmployeeName));
    })()`);
    eq(r.people.map(p => p.name), JSON.parse(oracle), 'equals buildBenchPool on the Org Chart inputs');
    const unfiltered = await L.evalInContext(`(async () => {
      const [p, c] = await Promise.all([getPeople(true, true), getCurrentAssignmentsByEmployee()]);
      return JSON.stringify(buildBenchPool(p, c).map(x => x.EmployeeName));
    })()`);
    eq(JSON.parse(unfiltered).includes('Fay Future'), true, 'control: without the N-422 filter the future starter would be on the bench');
    eq([r.total, r.truncated, Object.keys(r.people[0])], [3, false, ['name', 'level', 'location', 'since']], 'shape');
  });

  const utilOracle = filterJs => L.evalInContext(`(async () => {
    const [a, ppl, fc] = await Promise.all([getAssignments({}), getPeople(false), getSalesForecasts()]);
    const all = computeMonthlyRows(a);
    const { start, end } = peoplePeriodRange(${filterJs});
    const rows = monthlyRowsInRange(all, start, end);
    const u = personUtilisation(rows), roll = utilisationBandRollup(rows);
    return JSON.stringify({ pct: u.total > 0 ? Math.round(u.ratio * 1000) / 10 : null, billed: u.billed, total: u.total,
      utilised: roll.total.utilised, active: roll.total.active,
      bands: roll.bands.map(b => [b.band, Math.round(b.u * 1000) / 10, b.utilised, b.total]),
      monthly: utilisationByMonth(rows).map(m => [m.month, Math.round(m.u * 1000) / 10]),
      series: utilisationYearSeries(all, a, fc, i => activeDeployableCount(ppl, new Date(new Date().getFullYear(), i + 1, 0)), new Date()) });   // N-424
  })()`);

  await check('N-394 AC5/AC6 utilisation = the People Dashboard calls (period rows, band roll-up, monthly trend, year series) for default, month, quarter and whole-year periods; empty period is null', async () => {
    const now = new Date();
    const y = now.getFullYear();
    const cases = [
      [{}, `{ year: ${y}, month: ${now.getMonth()}, quarter: null }`],
      [{ month: 1 }, `{ year: ${y}, month: 0, quarter: null }`],
      [{ quarter: 2, byLevel: true }, `{ year: ${y}, month: null, quarter: 2 }`],
      [{ year: y }, `{ year: ${y}, month: null, quarter: null }`],
      [{ year: y, month: now.getMonth() + 1, byLevel: true }, `{ year: ${y}, month: ${now.getMonth()}, quarter: null }`],
    ];
    for (const [args, filterJs] of cases) {
      const r = await call('utilisation', args);
      const o = JSON.parse(await utilOracle(filterJs));
      eq([r.utilisationPct, r.billedPersonMonths, r.totalPersonMonths, r.utilisedPeople, r.activePeople], [o.pct, o.billed, o.total, o.utilised, o.active], 'headline ' + JSON.stringify(args));
      eq(r.monthly.map(m => [m.month, m.utilisationPct]), o.monthly, 'monthly ' + JSON.stringify(args));
      if (args.byLevel) eq(r.bands.map(b => [b.band, b.utilisationPct, b.utilised, b.total]), o.bands, 'bands ' + JSON.stringify(args));
      else ok(!('bands' in r), 'no bands unless byLevel');
      const pct = v => (v === null ? null : Math.round(v * 1000) / 10);
      const cur = now.getMonth();
      eq(r.outlook.months.map((m, i) => [m.month, m.actualPct, m.forecastPct, m.salesForecastPct]),
        o.series.points.map((p, i) => [`${y}-${String(i + 1).padStart(2, '0')}`, i <= cur ? pct(p.util) : null, i > cur ? pct(p.util) : null,
          i >= cur ? pct(o.series.salesPoints[i].util) : null]), 'outlook ' + JSON.stringify(args));
    }
    const def = await call('utilisation', {});
    ok(def.utilisationPct > 0 && def.utilisationPct <= 100, 'control: the fixture month has real utilisation, got ' + def.utilisationPct);
    ok(def.bands === undefined && def.period.label === `${y}-${String(now.getMonth() + 1).padStart(2, '0')}`, 'default period is this month');
    eq(def.thresholds, { onTrackPct: Math.round(L.config().UTILISATION_THRESHOLDS.green * 1000) / 10, atRiskPct: Math.round(L.config().UTILISATION_THRESHOLDS.amber * 1000) / 10 }, 'thresholds from CONFIG');
    const empty = await call('utilisation', { year: 2020, month: 1 });
    eq([empty.utilisationPct, empty.totalPersonMonths, empty.monthly], [null, 0, []], 'a period with no assignments is null, not 0 %');
    const lvl = await call('utilisation', { byLevel: true });
    ok(lvl.bands.length > 0 && lvl.bands.every(b => ['SDM', 'PTP', 'STP', 'TP'].includes(b.band)), 'bands are billable levels with rows, CSD never');
  });

  await check('N-394 AC6 utilisation outlook: sales forecast lifts future months; SalesForecasts unreadable -> degraded, sales % falls back to the plain forecast; no forecast headcount in the output', async () => {
    const now = new Date();
    const cur = now.getMonth();
    const r = await call('utilisation', {});
    eq(r.degraded, [], 'nothing degraded');
    ok(r.outlook.months.slice(0, cur).every(m => m.salesForecastPct === null), 'no sales % before the current month');
    ok(r.outlook.months.slice(cur + 1).every(m => m.salesForecastPct === null || m.salesForecastPct >= (m.forecastPct || 0)), 'sales % never below the plain forecast');
    const soon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60);   // inside fixture forecast A (day 30 to 120)
    if (soon.getFullYear() === now.getFullYear() && soon.getMonth() > cur) {
      const m = r.outlook.months[soon.getMonth()];
      ok(m.forecastPct !== null && (m.salesForecastPct > m.forecastPct || m.salesForecastPct === 100), 'control: forecast A lifts ' + m.month);
    }
    const down = await newLoader({ fail: ['SalesForecasts'] });
    const d = await down.call('utilisation', {});
    ok(d.degraded.includes('SalesForecasts'), 'degraded says SalesForecasts');
    ok(d.outlook.months.slice(cur + 1).every(m => m.salesForecastPct === m.forecastPct), 'without forecasts the sales % equals the plain forecast');
  });

  await check('N-394 AC8 project_team = ptSortTeam on the Project Team read: current + upcoming, lead DM by name, bench / forecast / other-project rows never listed, ended on request, no email', async () => {
    const r = await call('project_team', { project: 'acme bank' });
    eq(r.project, { id: 101, name: 'Acme Bank', kpiExcluded: false }, 'project');
    eq(r.members.map(m => [m.name, m.level, m.status, m.leadDm, m.start, m.end]),
      [['Dana Manager', 'SDM', 'current', true, day(-100), day(100)], ['Una Upcoming', 'STP', 'upcoming', false, day(10), day(100)]], 'members');
    eq(r.members.map(m => m.partner), [false, false], 'N-402: Momentum staff are not partners');
    eq([r.leadDm, r.deliveryManager, r.counts], ['Dana Manager', 'Dana Manager', { current: 1, upcoming: 1, ended: 1 }], 'lead, DM, counts (ended counted, not listed)');
    const oracle = await L.evalInContext(`(async () => {
      const rows = await getAssignments({ projectId: 101 });
      const t = localDayISO();
      return JSON.stringify(ptSortTeam(rows, t).filter(r => ['current', 'upcoming'].includes(ptMemberStatus(r, t))).map(r => r.EmployeeName));
    })()`);
    eq(r.members.map(m => m.name), JSON.parse(oracle), 'equals ptSortTeam on the Project Team read');
    const ended = await call('project_team', { project: '101', includeEnded: true });
    eq(ended.members.map(m => [m.name, m.status]), [['Dana Manager', 'current'], ['Una Upcoming', 'upcoming'], ['Eve Ended', 'ended']], 'ended last, on request');
    eq((await call('project_team', { project: 'bluefin' })).members.map(m => [m.name, m.level, m.leadDm]), [['Tom Two', 'STP', false]], 'another project has its own team (no forecast row, no bench row)');
    eq((await call('project_team', { project: 'corvid' })).members.map(m => [m.name, m.level, m.status, m.partner]),
      [['Pia Partner', null, 'upcoming', true]], 'N-402: an External partner is listed with partner: true (804 has no ProjectID, so is not a team row)');
  });

  await check('N-394 AC11 role_detail timeline "by" is a display name; an editor with no UserAssignments name falls back to the email', async () => {
    const r = await call('role_detail', { roleId: 201 });
    eq(r.stageTimeline.map(t => t.by), ['Tess One'], 'mapped editor -> display name, not tp.one@mg.co');
    const c = await call('role_detail', { roleId: 211 });
    eq(c.stageTimeline.map(t => t.by), ['Tess One', 'ext.editor@mg.co'], 'unmapped editor keeps the email');
  });

  await check('N-466 / N-468 workforce_segmentation = workforceSegmentation on the People read: location and contract type include internal staff, level deployable only, internal staff by function, counts and % only, no names', async () => {
    const r = await call('workforce_segmentation', {});
    const y = new Date().getFullYear(), m = new Date().getMonth() + 1;
    eq([r.period.label, r.period.asOf], [`${y}-${String(m).padStart(2, '0')}`, today], 'default = this month, asOf today');
    const o = JSON.parse(await L.evalInContext(`(async () => JSON.stringify(workforceSegmentation(await getPeople(false), new Date())))()`));
    eq([r.total, r.deployableTotal, r.internalStaff.total], [o.total, o.deployableTotal, o.internalTotal], 'totals equal the shared function');
    eq(r.byLocation.map(x => [x.location, x.count]), o.byLocation, 'by location');
    eq(r.byContractType.map(x => [x.contractType, x.count]), o.byContractType, 'by contract type');
    eq(r.byLevel.map(x => [x.level, x.count]), o.byLevel, 'by level');
    eq(r.internalStaff.byFunction.map(x => [x.function, x.count]), o.internalByFunction, 'internal by function');
    // Fixture truth (N-468): deployable Tess, Tom, Dana, Bea, Ben, Eve, Cara (7) + Ivy (internal, London, Core) = 8. Out: Pia (partner), Pat (placeholder), Old Leaver (inactive), Fay (starts in 14 days).
    eq([r.total, r.byLocation.slice(0, 2).map(x => [x.location, x.count]), r.byContractType.map(x => [x.contractType, x.count]), r.internalStaff],
      [8, [['London', 4], ['Porto', 2]], [['Unknown', 5], ['Permanent', 2], ['Core', 1]], { total: 1, byFunction: [{ function: 'Finance', count: 1 }] }], 'fixture counts');
    eq(r.deployableTotal, 7, 'deployableTotal');
    eq([r.byLocation[0].pct, r.byContractType[1].pct], [50, 25], 'location / contract pct over total (8)');
    eq(r.byLevel[0].pct, Math.round(r.byLevel[0].count / 7 * 1000) / 10, 'level pct over deployableTotal (7)');
    eq([r.byLocation.reduce((s, x) => s + x.count, 0), r.byContractType.reduce((s, x) => s + x.count, 0), r.byLevel.reduce((s, x) => s + x.count, 0)], [8, 8, 7], 'location and contract sum to total; level sums to deployableTotal');
    eq(Object.keys(r.byLocation[0]), ['location', 'count', 'pct'], 'shape');
    const text = JSON.stringify(r);
    ['Tess One', 'Tom Two', 'Dana Manager', 'Ivy Internal', 'Fay Future', 'Pia Partner'].forEach(n => ok(!text.includes(n), 'name in output: ' + n));
    // Month end: Fay (start in 14 days) is counted once asOf passes her start. Skipped only when her month is this month (asOf = today) or next year.
    const fy = Number(day(14).slice(0, 4)), fm = Number(day(14).slice(5, 7));
    if (fy === y && fm !== m) {
      const later = await call('workforce_segmentation', { year: y, month: fm });
      eq([later.total, later.byLocation.some(x => x.location === 'Oslo')], [9, true], 'month end includes a joiner who starts that month');
      eq(later.period.asOf, `${y}-${String(fm).padStart(2, '0')}-${String(new Date(y, fm, 0).getDate()).padStart(2, '0')}`, 'asOf is the month end');
    }
    const empty = await call('workforce_segmentation', { year: 2020, month: 1 });
    eq([empty.total, empty.deployableTotal, empty.byLocation, empty.byContractType, empty.byLevel, empty.internalStaff, empty.period.asOf], [0, 0, [], [], [], { total: 0, byFunction: [] }, '2020-01-31'], 'a month before anyone started is empty, not an error');
    const yearOnly = await call('workforce_segmentation', { year: y });
    eq(yearOnly.period.label, r.period.label, 'this year alone = this month');
  });

  await check('N-524 workforce_segmentation staffType: all = no filter + staffType key; deployable = the shared deployable result, no internalStaff, one denominator, no names; internal = no level; bad value rejected', async () => {
    const base = await call('workforce_segmentation', {});
    const all = await call('workforce_segmentation', { staffType: 'all' });
    eq(base.staffType, 'all', 'default staffType is all');
    eq(all, base, "staffType 'all' = no staffType");
    ok(!/Filtered to/.test(base.scope), 'no filter sentence in all mode');
    const od = JSON.parse(await L.evalInContext(`(async () => JSON.stringify(workforceSegmentation(await getPeople(false), new Date(), 'deployable')))()`));
    const d = await call('workforce_segmentation', { staffType: 'deployable' });
    eq(d.staffType, 'deployable', 'echoes staffType');
    eq([d.total, d.deployableTotal], [od.total, od.deployableTotal], 'totals equal the shared deployable result');
    eq(d.total, d.deployableTotal, 'one total in deployable mode');
    eq(d.byLocation.map(x => [x.location, x.count]), od.byLocation, 'deployable by location');
    eq(d.byContractType.map(x => [x.contractType, x.count]), od.byContractType, 'deployable by contract type');
    eq(d.byLevel.map(x => [x.level, x.count]), od.byLevel, 'deployable by level');
    ok(!('internalStaff' in d), 'internalStaff omitted in deployable mode');
    ok(!d.byLevel.some(x => x.level === 'CSD'), 'no CSD in the level table');
    eq([d.byLocation, d.byContractType, d.byLevel].map(t => t.reduce((s, x) => s + x.count, 0)), [d.total, d.total, d.total], 'all three tables sum to total');
    eq([d.byLocation[0].pct, d.byContractType[0].pct, d.byLevel[0].pct].map(p => p), [d.byLocation[0].count, d.byContractType[0].count, d.byLevel[0].count].map(n => Math.round(n / d.total * 1000) / 10), 'every pct is over total');
    ok(/Filtered to deployable staff \(internal staff, CSDs and partners left out\); every table is over that group\./.test(d.scope), 'scope carries the filter sentence');
    eq([base.total, base.deployableTotal], [8, 7], 'all mode unchanged (8 counted, 7 not internal)');
    eq([d.total, d.byLevel.reduce((n, x) => n + x.count, 0)], [6, 6], 'fixture truth: 7 not-internal staff minus Cara (CSD) = 6');
    eq([d.byLocation.map(x => [x.location, x.count]), d.byContractType.map(x => [x.contractType, x.count]), d.byLevel.map(x => [x.level, x.count])],
      [[['London', 2], ['Porto', 2], ['Madrid', 1], ['Lisbon', 1]], [['Unknown', 4], ['Permanent', 2]], [['SDM', 1], ['PTP', 1], ['STP', 1], ['TP', 3]]], 'fixture counts: 6 deployable staff, no CSD, no Ivy');
    const i = await call('workforce_segmentation', { staffType: 'internal' });
    eq([i.staffType, i.byLevel, i.total, i.internalStaff.total, i.deployableTotal], ['internal', [], 1, 1, 0], 'internal: fixture has one internal person (Ivy), no level, total = internalStaff.total');
    eq([i.byLocation.map(x => [x.location, x.count, x.pct]), i.byContractType.map(x => [x.contractType, x.count, x.pct])], [[['London', 1, 100]], [['Core', 1, 100]]], 'internal fixture counts');
    ok(/Filtered to internal-function staff\./.test(i.scope), 'internal scope sentence');
    const text = JSON.stringify([d, i]);
    ['Tess One', 'Tom Two', 'Dana Manager', 'Ivy Internal', 'Fay Future', 'Pia Partner'].forEach(n => ok(!text.includes(n), 'name in output: ' + n));
    await rejects(call('workforce_segmentation', { staffType: 'everyone' }), /staffType must be all, deployable or internal/, 'bad staffType');
    await rejects(call('workforce_segmentation', { staffType: 7 }), /staffType must be all, deployable or internal/, 'non-string staffType');
  });

  await check('N-466 bad input gives a clear message: past year without a month, month 0 / 13, year out of range, non-integers', async () => {
    const y = new Date().getFullYear();
    await rejects(call('workforce_segmentation', { year: 2024 }), /month is required for a past year/, 'past year, no month');
    await rejects(call('workforce_segmentation', { month: 13 }), /month must be a whole number from 1 to 12/, 'month 13');
    await rejects(call('workforce_segmentation', { month: 0 }), /month must be a whole number from 1 to 12/, 'month 0');
    await rejects(call('workforce_segmentation', { year: 2019, month: 1 }), new RegExp('year must be a whole number from 2020 to ' + y), 'year too early');
    await rejects(call('workforce_segmentation', { year: y + 1, month: 1 }), /year must be a whole number/, 'year in the future');
    await rejects(call('workforce_segmentation', { month: 2.5 }), /month must be a whole number/, 'non-integer month');
  });

  await check('N-467 joiners: the month Fay Future starts lists her (staff name, level, location, start, upcoming) and nothing else; partner / other months excluded; no email or reports-to', async () => {
    const y = new Date().getFullYear(), m = new Date().getMonth() + 1;
    const fd = day(14), fy = Number(fd.slice(0, 4)), fm = Number(fd.slice(5, 7));
    const r = await call('joiners', { year: fy, month: fm });
    const lastDay = String(new Date(fy, fm, 0).getDate()).padStart(2, '0');
    eq([r.period.label, r.period.from, r.period.to], [`${fy}-${String(fm).padStart(2, '0')}`, `${fy}-${String(fm).padStart(2, '0')}-01`, `${fy}-${String(fm).padStart(2, '0')}-${lastDay}`], 'period');
    eq([r.count, r.truncated, r.byStaffType], [1, false, { deployable: 1, internal: 0 }], 'one deployable joiner');
    eq(r.joiners, [{ name: 'Fay Future', staffType: 'Deployable', level: 'TP', function: null, location: 'Oslo', start: fd, status: 'upcoming' }], 'Fay');
    eq(Object.keys(r.joiners[0]), ['name', 'staffType', 'level', 'function', 'location', 'start', 'status'], 'shape');
    const o = JSON.parse(await L.evalInContext(`(async () => JSON.stringify(peopleJoiners(await getPeople(false), ${fy}, ${fm}).map(p => p.EmployeeName)))()`));
    eq(r.joiners.map(j => j.name), o, 'equals the shared function');
    const raw = await L.evalInContext(`(async () => JSON.stringify(await getPeople(false)))()`);
    ok(raw.includes('ZZQ-FAY-MAIL') && raw.includes('ZZQ-FAY-LEAD'), 'positive control: the People read carries the work email and reports-to sentinels');
    ok(!JSON.stringify(r).includes('ZZQ-'), 'no email or reports-to in the output');
    const def = await call('joiners', {});
    eq(def.period.label, `${y}-${String(m).padStart(2, '0')}`, 'default = this month');
    eq((await call('joiners', { year: y })).period.label, def.period.label, 'this year alone = this month');
    const pd = day(-30), py = Number(pd.slice(0, 4)), pm = Number(pd.slice(5, 7));
    const pr = await call('joiners', { year: py, month: pm });
    ok(!JSON.stringify(pr).includes('Pia Partner'), 'the external partner who started that month is not a joiner');
    const empty = await call('joiners', { year: 2020, month: 1 });
    eq([empty.count, empty.joiners, empty.byStaffType, empty.period.from, empty.period.to], [0, [], { deployable: 0, internal: 0 }, '2020-01-01', '2020-01-31'], 'a month with no starters is empty, not an error');
    const text = JSON.stringify(r);
    ['Tess One', 'Pia Partner', 'Pat Placeholder', 'Old Leaver', 'Ivy Internal'].forEach(n => ok(!text.includes(n), 'name in output: ' + n));
  });

  await check('N-467 joiners bad input gives a clear message: past or future year without a month, month 0 / 13, year out of range, non-integers', async () => {
    const y = new Date().getFullYear();
    await rejects(call('joiners', { year: 2024 }), /month is required for a past or future year/, 'past year, no month');
    await rejects(call('joiners', { year: y + 1 }), /month is required for a past or future year/, 'future year, no month');
    await rejects(call('joiners', { month: 13 }), /month must be a whole number from 1 to 12/, 'month 13');
    await rejects(call('joiners', { month: 0 }), /month must be a whole number from 1 to 12/, 'month 0');
    await rejects(call('joiners', { year: 2019, month: 1 }), new RegExp('year must be a whole number from 2020 to ' + (y + 1)), 'year too early');
    await rejects(call('joiners', { year: y + 2, month: 1 }), /year must be a whole number/, 'year too far ahead');
    await rejects(call('joiners', { month: 2.5 }), /month must be a whole number/, 'non-integer month');
  });

  await check('N-394 AC7 bad input gives a clear message: month + quarter, month 13, quarter 5, year out of range, byLevel / includeEnded not boolean, unknown project', async () => {
    const y = new Date().getFullYear();
    await rejects(call('utilisation', { month: 3, quarter: 1 }), /Give month or quarter, not both/, 'month + quarter');
    await rejects(call('utilisation', { month: 13 }), /month must be a whole number from 1 to 12/, 'month 13');
    await rejects(call('utilisation', { quarter: 5 }), /quarter must be a whole number from 1 to 4/, 'quarter 5');
    await rejects(call('utilisation', { year: 2019 }), new RegExp('year must be a whole number from 2020 to ' + y), 'year too early');
    await rejects(call('utilisation', { year: y + 1 }), /year must be a whole number/, 'year in the future');
    await rejects(call('utilisation', { byLevel: 'yes' }), /byLevel must be true or false/, 'byLevel');
    await rejects(call('project_team', { project: 'acme', includeEnded: 'yes' }), /includeEnded must be true or false/, 'includeEnded');
    await rejects(call('project_team', { project: 'nowhere' }), /No project matched "nowhere"/, 'unknown project');
    await rejects(call('project_team', {}), /Give a project name or id/, 'project required');
  });

  // ── N-535 business_goals ──────────────────────────────────────────────
  const flatIds = gs => gs.reduce((a, g) => a.concat([g.id], flatIds(g.children || [])), []);

  await check('N-535 business_goals default: this year, Open goals as an Annual > H2 > Quarterly tree; Dropped goal out, last year out, counts still whole-year; no emails', async () => {
    const r = await call('business_goals', {});
    eq([r.year, r.filters, r.total, r.truncated, r.degraded], [new Date().getFullYear(), { level: null, status: 'open' }, 4, false, []], 'header');
    eq(r.goals.map(g => g.id), [1201, 1205], 'two open Annual roots (Dropped 1204 and last year 1206 out)');
    const a = r.goals[0];
    eq([a.title, a.level, a.status, a.owner, a.targetDate !== null, a.whyItMatters, a.successMeasures], ['Win three flagship clients', 'Annual', 'Open', { name: 'Lena Lead', state: 'ok' }, true, 'Growth worth 1.2m; candidate Jo Smith placed', 'Three signed by Q4'], 'free text returned in full, owner by name');
    eq(a.children.map(g => [g.id, g.level]), [[1202, 'H2']], 'H2 nests under Annual');
    eq(a.children[0].children.map(g => [g.id, g.level]), [[1203, 'Quarterly']], 'Quarterly nests under H2');
    eq(r.counts, { open: 4, achieved: 0, dropped: 1, carriedForward: 0, red: 1, amber: 0, green: 0, goalsOverdue: 1, actionsOpen: 2, actionsOverdue: 1, actionsDueSoon: 1, actionsDone: 1 }, 'counts cover the whole year (the Dropped goal is counted)');
    eq(r.goals[1].owner, null, 'no owner -> null');
    eq(r.goals[1].whyItMatters, 'Ask ceo@client.example for intros', 'email-like text inside goal text is returned as written (the guard is key-based)');
    eq(r.goals[1].rag, { own: null, rolled: null }, 'unrated -> null');
  });

  await check('N-535 business_goals rolled-up RAG is the worst of the goal and its open descendants (Green Annual + Red Quarterly = Red); the goal\'s own RAG is kept', async () => {
    const r = await call('business_goals', {});
    const a = r.goals[0], q = a.children[0].children[0];
    eq([a.rag, a.children[0].rag, q.rag], [{ own: 'Green', rolled: 'Red' }, { own: 'Green', rolled: 'Red' }, { own: 'Red', rolled: 'Red' }], 'roll-up');
  });

  await check('N-535 business_goals latest update only (newest entry, YYYY-MM-DD, author name), updateCount = all entries, stale owner shown by stored name with state stale', async () => {
    const q = (await call('business_goals', {})).goals[0].children[0].children[0];
    eq(q.latestUpdate, { date: q.latestUpdate.date, authorName: 'Mo Member', text: 'Now red, contract at risk 90k', ragAtUpdate: 'Red', statusAtUpdate: 'Open' }, 'newest entry');
    ok(/^\d{4}-\d{2}-\d{2}$/.test(q.latestUpdate.date), 'day, not an instant: ' + q.latestUpdate.date);
    eq(q.updateCount, 2, 'both entries counted');
    eq(q.owner, { name: 'Lee Lapsed', state: 'stale' }, 'lapsed owner');
    eq(q.overdue, true, 'target date passed');
    const none = (await call('business_goals', {})).goals[1];
    eq([none.latestUpdate, none.updateCount], [null, 0], 'no entries');
  });

  await check('N-535 business_goals actions: open ones in full (title, owner name, due, overdue, dueSoon), done only as a count', async () => {
    const q = (await call('business_goals', {})).goals[0].children[0].children[0];
    eq(q.actions.open.map(x => [x.title, x.owner, x.overdue, x.dueSoon]), [['Send the proposal', { name: 'Lena Lead', state: 'ok' }, true, false], ['Book the board slot', { name: 'Lena Lead', state: 'ok' }, false, true]], 'open actions, soonest first');
    ok(/^\d{4}-\d{2}-\d{2}$/.test(q.actions.open[0].due), 'due day');
    eq([q.actions.doneCount, q.actions.overdueCount], [1, 1], 'done count, overdue count');
    ok(!JSON.stringify(q.actions).includes('Draft the pitch'), 'a done action is not listed');
  });

  await check('N-535 business_goals status all lists Dropped goals; level gives a flat list without children; last year via year', async () => {
    const all = await call('business_goals', { status: 'all' });
    eq(all.goals.map(g => g.id), [1201, 1204, 1205], 'all statuses, this year, Annual roots');
    eq(all.total, 5, 'five goals this year');
    const q = await call('business_goals', { level: 'Quarterly' });
    eq(q.goals.map(g => g.id), [1203], 'Quarterly only');
    ok(!('children' in q.goals[0]), 'flat: no children');
    eq(q.filters, { level: 'Quarterly', status: 'open' }, 'filters echoed');
    const ly = await call('business_goals', { year: new Date().getFullYear() - 1, status: 'all' });
    eq(ly.goals.map(g => g.id), [1206], 'last year');
    eq(ly.goals[0].actions.open.map(x => x.title), ['Old action'], 'last year action');
  });

  await check('N-535 business_goals bad input gives a clear message: unknown level, unknown status, year out of range, non-integer year', async () => {
    await rejects(call('business_goals', { level: 'Monthly' }), /level must be one of Annual, H2, Quarterly/, 'level');
    await rejects(call('business_goals', { status: 'closed' }), /status must be open or all/, 'status');
    await rejects(call('business_goals', { year: 2019 }), /year must be a whole number from 2020 to 2100/, 'year too early');
    await rejects(call('business_goals', { year: 2026.5 }), /year must be a whole number/, 'non-integer');
  });

  await check('N-535 business_goals reads only its documented lists; no email key or sentinel in any result; a denied SharePoint read says so instead of returning empty', async () => {
    const fresh = await newLoader();
    await fresh.call('business_goals', {});
    eq(Array.from(new Set(fresh.graph.asked)).sort(), ['BusinessActions', 'BusinessGoalUpdates', 'BusinessGoals', 'LeadershipAccess', 'UserAssignments'], 'read set');
    const text = JSON.stringify(await fresh.call('business_goals', { status: 'all' }));
    ['OwnerEmail', 'AddedByEmail', 'ChangedByEmail', 'AuthorEmail', '@mg.co'].forEach(k => ok(!text.includes(k), 'leaked ' + k));
    const denied = await newLoader({ deny: ['BusinessGoals'] });
    const d = await denied.call('business_goals', {});
    eq([d.denied, d.goals, /cannot read/.test(d.message)], [true, [], true], 'denied');
    const soft = await newLoader({ fail: ['LeadershipAccess'] });
    const s = await soft.call('business_goals', {});
    eq(s.degraded, ['owner names'], 'degraded');
    eq(s.goals[0].owner, { name: 'Lena Lead', state: 'stale' }, 'snapshot name when the directory read fails');
  });

  // ── N-553 (AMCP-A2 / A3, A12): TP / DM read scoping, stubbed identities over the same fixtures ──
  const DM = { email: 'dm.one@mg.co', role: 'delivery_manager', projectIds: ['101'] };
  const TP = { email: 'tp.one@mg.co', role: 'talent_partner', projectIds: ['101', '102'] };
  const UNAVAILABLE = "That Newton data isn't available to your account.";
  const SCOPED = /your (projects|pipelines)/i;
  const noAsOf = o => { const c = JSON.parse(JSON.stringify(o)); delete c.asOf; return JSON.stringify(c); };
  const refusal = async (p, name, args) => {
    const t = p.tools.find(x => x.name === name);
    try { await t.handler(args); } catch (e) { return { code: e.code || null, message: e.message }; }
    throw new Error(`${name} ${JSON.stringify(args)} answered; expected a refusal`);
  };
  const parityCalls = [
    ['list_projects', {}], ['list_projects', { active: false }], ['project_summary', { project: 'Acme' }], ['list_roles', {}],
    ['list_roles', { project: 'acme', flaggedOnly: true }], ['role_detail', { roleId: 201 }], ['activity_summary', {}],
    ['activity_summary', { project: 'Acme' }], ['list_placements', { from: day(-365), to: today }],
    ['list_placements', { from: day(-365), to: today, project: 'Bluefin' }], ['time_to_fill', {}], ['project_scorecards', {}],
    ['bench', {}], ['utilisation', {}], ['project_team', { project: 'Acme' }], ['workforce_segmentation', {}], ['joiners', {}], ['business_goals', {}],
  ];

  await check('N-553 AC1 Admin answers equal Leadership answers on every tool (projectScopeForRole lifts Leadership\'s [] to all); a DM differs (positive control)', async () => {
    const lead = await newLoader();
    const admin = await newLoader({ identity: { role: 'admin', projectIds: null } });
    for (const [name, args] of parityCalls) {
      eq(noAsOf(await admin.call(name, args)), noAsOf(await lead.call(name, args)), `${name} ${JSON.stringify(args)} admin vs leadership`);
    }
    const dm = await newLoader({ identity: DM });
    ok(noAsOf(await dm.call('list_projects', {})) !== noAsOf(await lead.call('list_projects', {})), 'positive control: the comparison sees a scoped difference');
  });

  await check('N-553 AC3 mcpScope resolves fresh on every call (getEffectiveRole + getUserProjectIds once per call, with the signed-in email); a role outside allowedRoles is refused', async () => {
    const tp = await newLoader({ identity: TP });
    await tp.call('list_projects', {});
    await tp.call('list_roles', {});
    eq([tp.scopeCalls.role, tp.scopeCalls.projects], [['tp.one@mg.co', 'tp.one@mg.co'], ['tp.one@mg.co', 'tp.one@mg.co']], 'two calls, two fresh resolutions');
    await tp.call('time_to_fill', {});
    eq(tp.scopeCalls.role.length, 2, 'time_to_fill (company benchmark) does not resolve scope');
    const viewer = await newLoader({ identity: { email: 'tp.one@mg.co', role: 'viewer', projectIds: ['101'] } });
    for (const name of ['list_projects', 'project_summary', 'list_roles', 'role_detail', 'activity_summary', 'list_placements']) {
      const args = { project_summary: { project: 'acme' }, role_detail: { roleId: 201 }, list_placements: { from: day(-30), to: today } }[name] || {};
      const r = await refusal(viewer, name, args);
      eq(r, { code: 'MCP_REFUSED', message: "Newton for Claude isn't available to your Newton role (viewer)." }, name + ' as a demoted viewer');
    }
  });

  await check('N-553 AC4 list_projects: a DM sees their project, a TP theirs; scope says so', async () => {
    const dm = await (await newLoader({ identity: DM })).call('list_projects', {});
    eq([dm.count, dm.projects.map(p => p.name)], [1, ['Acme Bank']], 'DM');
    ok(SCOPED.test(dm.scope), 'DM scope text: ' + dm.scope);
    const tp = await (await newLoader({ identity: TP })).call('list_projects', {});
    eq(tp.projects.map(p => p.name), ['Acme Bank', 'Bluefin Labs'], 'TP');
  });

  await check('N-553 AC4/AC5 project_summary: hidden, missing and out-of-scope id answer identically (own projects listed, no prefix); TP = own pipelines only, DM = the whole project', async () => {
    const dm = await newLoader({ identity: DM });
    const hidden = await refusal(dm, 'project_summary', { project: 'Bluefin' });
    eq(hidden, { code: 'MCP_REFUSED', message: UNAVAILABLE + ' Your projects: Acme Bank (id 101).' }, 'hidden project');
    eq(await refusal(dm, 'project_summary', { project: 'zzz-none' }), hidden, 'missing project answers the same');
    eq(await refusal(dm, 'project_summary', { project: '103' }), hidden, 'out-of-scope id answers the same');
    const d = await dm.call('project_summary', { project: 'acme' });
    eq(d.pipelines.total, 6, 'DM: every pipeline on Acme Bank');
    ok(SCOPED.test(d.scope), 'DM scope text: ' + d.scope);
    const tp = await (await newLoader({ identity: TP })).call('project_summary', { project: 'acme' });
    eq(tp.pipelines.total, 3, 'TP: tp.one\'s pipelines 201, 203, 205');
    ok(/your own rows/.test(tp.scope), 'TP scope text: ' + tp.scope);
  });

  await check('N-553 AC4 list_roles: DM = open pipelines on their project; TP = every open pipeline on theirs (no TP narrowing, as the Roles page); hidden project refused; option lists scoped', async () => {
    const dm = await newLoader({ identity: DM });
    eq(ids((await dm.call('list_roles', {})).roles), [201, 202, 203], 'DM');
    const tp = await newLoader({ identity: TP });
    const t = await tp.call('list_roles', {});
    eq(ids(t.roles), [201, 202, 203, 206, 209], 'TP sees tp.two\'s 202 on an own project');
    ok(SCOPED.test(t.scope), 'TP scope text: ' + t.scope);
    eq((await refusal(tp, 'list_roles', { project: 'Momentum' })).message, UNAVAILABLE + ' Your projects: Acme Bank (id 101), Bluefin Labs (id 102).', 'internal project outside scope');
    await rejects(tp.call('list_roles', { country: 'UK' }), /^No country matched "UK"\. Options: Portugal, Spain\.$/, 'UK exists only on an out-of-scope role, so it is not offered');
  });

  await check('N-553 AC5 role_detail: a hidden role and a missing role answer exactly MCP_UNAVAILABLE and read nothing about the role; TP opens another TP\'s role on an own project', async () => {
    const dm = await newLoader({ identity: DM });
    eq(await refusal(dm, 'role_detail', { roleId: 208 }), { code: 'MCP_REFUSED', message: UNAVAILABLE }, 'hidden role (project 103)');
    eq(await refusal(dm, 'role_detail', { roleId: 999999 }), { code: 'MCP_REFUSED', message: UNAVAILABLE }, 'missing role');
    eq(Array.from(new Set(dm.graph.asked)).sort(), ['Projects', 'Roles'], 'no RoleHeadcount / RoleHistory / WeeklyActivity / Placements read before refusing');
    const r = await (await newLoader({ identity: TP })).call('role_detail', { roleId: 202 });
    eq([r.role.roleId, r.role.title], [202, 'Data Analyst'], 'TP, own project, other TP\'s role');
    await rejects((await newLoader()).call('role_detail', { roleId: 999999 }), /^No role with id 999999\. list_roles gives role ids\.$/, 'unscoped missing message unchanged');
  });

  await check('N-553 AC4/AC7 activity_summary: TP = own rows on own projects only; anomalies on scoped inputs (S2), spikes null for one project; DM = their project\'s rows', async () => {
    const tp = await newLoader({ identity: TP });
    const t = await tp.call('activity_summary', { weeks: 4 });
    const own = (await tp.L.evalInContext('getWeeklyActivity(null, null)')).filter(a => ['601', '604', '605', '606', '607'].includes(String(a.id)));
    eq(own.length, 5, 'fixture rows found');
    eq(t.totals, tp.L.call('mcpFunnelTotals', own), 'totals = tp.one\'s rows 601, 604-607 (not 602 / 603 tp.two, not 608 on project 103)');
    ok(/your own rows/.test(t.scope) && SCOPED.test(t.scope), 'TP scope text: ' + t.scope);
    const tpRoles = ['201', '203', '205', '206', '207', '209', '211'];
    const named = t.anomalies.impossibleFunnels.rows.concat(t.anomalies.noActivity.rows).map(r => String(r.roleId));
    ok(named.every(r => tpRoles.includes(r)), 'anomalies name only tp.one\'s roles on own projects: ' + named);
    ok(t.anomalies.impossibleFunnels.rows.some(r => r.roleId === 206), 'positive control: 206 (Responses > Outreach) is flagged from tp.one\'s own rows');
    ok(t.anomalies.spikes && typeof t.anomalies.spikes.total === 'number', 'TP, project omitted: spikes over own rows');
    const dm = await newLoader({ identity: DM });
    const d = await dm.call('activity_summary', {});
    const dmRows = (await dm.L.evalInContext('getWeeklyActivity(null, null, { sinceWeeks: 4 })')).filter(a => ['201', '202', '203', '204', '205', '210'].includes(String(a.RoleIDLookupId)));
    eq(d.totals, dm.L.call('mcpFunnelTotals', dmRows), 'DM totals = every row on Acme Bank');
    ok(d.anomalies.spikes && typeof d.anomalies.spikes.total === 'number', 'DM, project omitted: spikes object');
    eq((await dm.call('activity_summary', { project: 'acme' })).anomalies.spikes, null, 'one project: spikes null');
  });

  await check('N-553 AC4/AC6 list_placements: TP = own placements on own projects; DM = their project; an internal project in scope is kept (S1); counts match rows', async () => {
    const w = { from: day(-365), to: today };
    const t = await (await newLoader({ identity: TP })).call('list_placements', w);
    eq(t.placements.map(r => r.roleId).sort(), [207, 209, 211], 'TP: placements 402, 404, 406');
    ok(/your own rows/.test(t.scope) && SCOPED.test(t.scope), 'TP scope text: ' + t.scope);
    const d = await (await newLoader({ identity: DM })).call('list_placements', w);
    eq(d.placements.map(r => r.roleId), [204], 'DM: 401 only (403 is on project 103; 405 is outside the window)');
    eq([t.summary.count, d.summary.count], [t.placements.length, d.placements.length], 'summary counts the scoped rows');
    const internal = await (await newLoader({ identity: { email: 'dm.one@mg.co', role: 'delivery_manager', projectIds: ['103'] } })).call('list_placements', w);
    eq(internal.placements.map(r => r.roleId), [208], 'S1: Momentum Internal kept (403), not dropped by excludeInternalProjectData');
  });

  await check('N-553 AC8 time_to_fill: a TP gets the Leadership answer', async () => {
    const lead = await (await newLoader()).call('time_to_fill', { function: 'Engineering' });
    const tp = await (await newLoader({ identity: TP })).call('time_to_fill', { function: 'Engineering' });
    eq(noAsOf(tp), noAsOf(lead), 'same benchmark');
  });

  await check('N-553 AC9 empty scope: zero rows on the list tools, "no projects" refusal on a project tool', async () => {
    const none = await newLoader({ identity: { email: 'tp.one@mg.co', role: 'talent_partner', projectIds: [] } });
    eq([(await none.call('list_projects', {})).count, (await none.call('list_roles', {})).total,
      (await none.call('list_placements', { from: day(-365), to: today })).summary.count,
      (await none.call('activity_summary', {})).totals.Outreach], [0, 0, 0, 0], 'zeros');
    eq(await refusal(none, 'project_summary', { project: 'acme' }), { code: 'MCP_REFUSED', message: UNAVAILABLE + ' Newton shows you no projects.' }, 'project tool');
  });

  await check('N-553 AC10 through the real server: DM / TP tools/list = newton_status + the seven reporting reads + the two guide tools (N-547); a People tool is refused; a hidden project answers without the "Newton couldn\'t answer" prefix', async () => {
    for (const who of [DM, TP]) {
      const p = await newLoader({ identity: who });
      const lines = [];
      const gated = p.serverLoader();
      const auth = { ensureToken: async () => 'tok', status: () => ({ storeMode: 'test', pendingSince: null }), takeLastError: () => null,
        startSignIn: async () => ({}), currentUser: () => ({ email: who.email }), shutdown() {} };
      const srv = createServer({ loader: gated, auth, write: o => lines.push(o), log: () => {} });
      await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'newton_status', arguments: {} } }));
      await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
      eq(lines.find(l => l.id === 2).result.tools.map(t => t.name), ['newton_status', 'list_projects', 'project_summary', 'list_roles', 'role_detail', 'activity_summary', 'list_placements', 'time_to_fill', 'search_guides', 'read_guide_section'], who.role + ' tools/list');
      await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'bench', arguments: {} } }));
      const bench = lines.find(l => l.id === 3).result;
      eq([bench.isError, bench.content[0].text], [true, `That isn't available to your Newton role (${who.role}).`], who.role + ' bench');
      await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'project_summary', arguments: { project: 'Momentum' } } }));
      const hid = lines.find(l => l.id === 4).result;
      ok(hid.isError && hid.content[0].text.startsWith(UNAVAILABLE), who.role + ' hidden project: ' + hid.content[0].text);
      await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }));
      const lp = lines.find(l => l.id === 5).result;
      const lpData = JSON.parse(lp.content[0].text);
      eq([lp.isError || false, lpData.count, SCOPED.test(lpData.scope)], [false, who.projectIds.length, true], who.role + ' list_projects through the server (stubbed scope survives the server\'s reload)');
    }
  });

  // ── N-547 (AMCP-3): search_guides + read_guide_section, through the real loader (localDir serves
  // the real guide files to the bundle's fetchGuide) and the real server ──
  const GUIDE_FIXTURE = '<html><head><title>Fixture &mdash; User Guide</title></head><body><div class="guide-content">' +
    '<div class="guide-section" id="alpha"><h2>Alpha thing</h2><p>How to do the alpha thing in Newton.</p></div></div></body></html>';
  const GUIDE_MSG = "Newton's guides couldn't be loaded right now. Try again in a moment.";

  await check('N-547 AC2 / AC11 through the real server: Leadership, DM and TP each see both guide tools last in tools/list; search_guides then read_guide_section answer from the real guides with Pages links; no list read, no sentinel in any result', async () => {
    for (const who of [{ email: 'chris@example.com', role: 'leadership', projectIds: [] }, DM, TP]) {
      const p = await newLoader({ identity: who });
      const lines = [];
      const auth = { ensureToken: async () => 'tok', status: () => ({ storeMode: 'test', pendingSince: null }), takeLastError: () => null,
        startSignIn: async () => ({}), currentUser: () => ({ email: who.email }), shutdown() {} };
      const srv = createServer({ loader: p.serverLoader(), auth, write: o => lines.push(o), log: () => {} });
      const send = async (id, method, params) => { await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id, method, params })); return lines.find(l => l.id === id).result; };
      await send(1, 'tools/call', { name: 'newton_status', arguments: {} });
      const names = (await send(2, 'tools/list')).tools.map(t => t.name);
      eq(names.slice(-2), ['search_guides', 'read_guide_section'], who.role + ' guide tools last');
      const s = await send(3, 'tools/call', { name: 'search_guides', arguments: { query: 'log weekly activity' } });
      ok(!s.isError, who.role + ' search_guides errored: ' + s.content[0].text);
      const sd = JSON.parse(s.content[0].text);
      ok(sd.asOf && sd.hits.length >= 3 && sd.searched === 6, who.role + ' search result shape: ' + s.content[0].text.slice(0, 200));
      ok(sd.hits[0].url.startsWith('https://momentumglobal.github.io/newton/user-guide.html#'), 'hit url: ' + sd.hits[0].url);
      const r = await send(4, 'tools/call', { name: 'read_guide_section', arguments: { guide: sd.hits[0].guide, section: sd.hits[0].section } });
      ok(!r.isError, who.role + ' read_guide_section errored: ' + r.content[0].text);
      const rd = JSON.parse(r.content[0].text);
      ok(rd.section === sd.hits[0].section && rd.text.length > 50 && rd.url === sd.hits[0].url, who.role + ' read result: ' + r.content[0].text.slice(0, 200));
      eq(Array.from(new Set(p.graph.asked)), [], who.role + ': guide tools read no SharePoint list');
      FIX.sentinels.forEach(x => ok(!s.content[0].text.includes(x) && !r.content[0].text.includes(x), who.role + ' sentinel ' + x));
      const bad = await send(5, 'tools/call', { name: 'search_guides', arguments: { query: 'x' } });
      eq([bad.isError, bad.content[0].text], [true, 'query must be 2 to 200 characters.'], who.role + ' refusal has no "couldn\'t answer" prefix');
    }
  });

  await check('N-547 AC8 guide cache: no refetch within the 1-hour TTL; refetch after it; concurrent calls share one fetch; a failed refetch serves the old copy as stale; a failed first fetch stores nothing and says nothing of the URL; partial and total failure; bad arguments', async () => {
    const p = await newLoader();
    const g = p.L.evalInContext('globalThis');
    const search = p.tools.find(t => t.name === 'search_guides').handler;
    const read = p.tools.find(t => t.name === 'read_guide_section').handler;
    let clock = 5000000;
    let fetches = [];
    let failFor = null;
    g.mcpGuideNow = () => clock;
    g.fetchGuide = async name => {
      fetches.push(name);
      await new Promise(r => setTimeout(r, 5));
      if (failFor === true || (Array.isArray(failFor) && failFor.includes(name))) throw new Error('HTTP 503 https://secret.example/' + name);
      return GUIDE_FIXTURE;
    };
    const ttl = p.L.config().MCP.guideCacheTtlMs;
    eq(ttl, 3600000, 'TTL');
    const q = { query: 'alpha thing', guide: 'user-guide.html' };
    let r = await search(q);
    eq([fetches, r.hits.length, r.hits[0].section, r.hits[0].guideTitle], [['user-guide.html'], 1, 'alpha', 'Fixture — User Guide'], 'first call fetches once');
    clock += ttl - 1000;
    await search(q); await read({ guide: 'user-guide.html', section: 'alpha' });
    eq(fetches.length, 1, 'within the TTL: no refetch (search and read share the cache)');
    clock += 2000;
    await search(q);
    eq(fetches.length, 2, 'after the TTL: refetch');
    clock += ttl + 1;
    fetches = [];
    await Promise.all([search(q), search(q), read({ guide: 'user-guide.html', section: 'alpha' })]);
    eq(fetches.length, 1, 'concurrent calls share one fetch');
    clock += ttl + 1;
    failFor = true;
    r = await search(q);
    eq([r.stale, r.hits.length], [true, 1], 'failed refetch serves the previous copy, marked stale');
    eq((await read({ guide: 'user-guide.html', section: 'alpha' })).stale, true, 'read says stale too');
    failFor = null;
    clock += ttl + 1;
    eq((await search(q)).stale, undefined, 'recovers on the next refetch');
    p.L.evalInContext('MCP_GUIDE_CACHE = {}');
    failFor = true;
    try { await search(q); throw new Error('first-fetch failure resolved'); } catch (e) {
      eq([e.message, e.code], [GUIDE_MSG, 'MCP_REFUSED'], 'plain refusal: no URL, no status');
    }
    eq(p.L.evalInContext('MCP_GUIDE_CACHE["user-guide.html"] || null'), null, 'a failed first fetch is not cached');
    failFor = null;
    ok((await search(q)).hits.length === 1, 'works once the fetch works');
    p.L.evalInContext('MCP_GUIDE_CACHE = {}');
    failFor = ['people-user-guide.html'];
    r = await search({ query: 'alpha thing' });
    eq([r.unavailable, r.searched, r.hits.length > 0], [['people-user-guide.html'], 5, true], 'partial failure answers from the rest');
    p.L.evalInContext('MCP_GUIDE_CACHE = {}');
    failFor = true;
    await rejects(search({ query: 'alpha thing' }), /^Newton's guides couldn't be loaded right now/, 'every guide down');
    failFor = null;
    await rejects(search({ query: 'a' }), /^query must be 2 to 200 characters\.$/, 'short query');
    await rejects(search({ query: 'alpha', guide: 'admin.html' }), /^guide must be one of: user-guide\.html/, 'unpinned guide');
    await rejects(search({ query: 'alpha', limit: 99 }), /limit must be a whole number from 1 to 8/, 'limit');
    await rejects(read({ guide: 'nope.html', section: 'alpha' }), /^guide must be one of/, 'read: unpinned guide');
    await rejects(read({ guide: 'user-guide.html' }), /^section is required/, 'read: no section');
    await rejects(read({ guide: 'user-guide.html', section: 'zzz' }), /^No section "zzz" in user-guide\.html\. Sections: alpha \(Alpha thing\)\.$/, 'read: unknown section');
    eq(fetches.every(n => p.L.evalInContext('MCP_GUIDE_FILES').includes(n)), true, 'only pinned names were ever fetched');
  });

  // AC 9 + AC 10, over every result produced above (each handler ran in the DOM-less context).
  await check('AC9 / N-394 AC9 no tool output contains a sentinel (candidate name, salary, budget, hiring manager, notes, role-history value, ack note, bill rate) or a denied key', async () => {
    ok(outputs.length >= 25, 'too few tool calls captured to mean anything: ' + outputs.length);
    eq(Array.from(new Set(outputs.map(o => o.name))).sort(), ['activity_summary', 'bench', 'joiners', 'list_placements', 'list_projects', 'list_roles', 'project_scorecards', 'project_summary', 'project_team', 'role_detail', 'time_to_fill', 'utilisation', 'workforce_segmentation'].concat(['business_goals']).sort(), 'every tool exercised');
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
    const rawAss = JSON.stringify(await L.evalInContext('getAssignments({})'));
    ok(rawAss.includes('554433') && rawAss.includes('774411') && rawAss.includes('885522') && rawAss.includes('zzq.member@mg.co'), 'positive control (N-394): Assignments carry the bill rate / retainer / placement fee / staff email sentinels');
    ok(JSON.stringify(await L.evalInContext('getSalesForecasts()')).includes('4.4417'), 'positive control (N-394): SalesForecasts carry the headcount sentinel');
  });

  return results;
}

module.exports = { run };
