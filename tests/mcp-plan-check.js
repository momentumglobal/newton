// tests/mcp-plan-check.js - N-555 (AMCP-9): Node-side checks of hiring_plan and report_facts' hiringPlan section
// (mcp/newton-plan-tools.js, js/coe-plan-logic.js). Run by tests/run.js after tests/mcp-report-check.js, in the same totals and
// exit code.
//
// Same harness as tests/mcp-report-check.js: the REAL loader (localDir mode) loads js/config.js + CONFIG.MCP.scripts into a DOM-less
// context in front of the fixture Graph; the identity is stubbed through getEffectiveRole / getUserProjectIds. The fixtures already
// hold a CoE project (102 Bluefin Labs: roles 206 / 207 / 209 / 211, headcount 307 / 309 / 310, placement 402 on 310) and a report
// on it (1503). This file adds a CoEPlanRows list in memory, relative to today:
//   1701  'ML Engineer plan'  tp.one          opens today-30  -> headcount 307 (opened today-5: late)        role 206
//   1702  'SRE plan'          tp.one          opens today-60  -> headcount 310 (opened today-60, offer today-25 on placement 402, start today+5)   role 209
//   1703  'Platform plan'     tp.one + tp.two opens today-55  -> headcount 309 (opened today-60, no offer)    role 209
//   1704  'Future plan'       tp.two          opens today+20  -> not linked
//
// run() resolves [{ name, ok, message }].
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const BOOT = path.join(ROOT, 'mcp', 'bootstrap');
const T = require('./mcp-tools-check.js');

function ok(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg}: expected ${jb}, got ${ja}`);
}
async function refused(promise, re, msg) {
  try { await promise; } catch (e) {
    ok(re.test(e && e.message), `${msg}: refused with "${e && e.message}", expected ${re}`);
    return e;
  }
  throw new Error(msg + ' (it resolved)');
}
const clone = v => JSON.parse(JSON.stringify(v));

async function run() {
  const results = [];
  async function check(name, fn) {
    try { await fn(); results.push({ name: 'N-555 ' + name, ok: true }); } catch (e) {
      results.push({ name: 'N-555 ' + name, ok: false, message: e && e.message ? e.message : String(e) });
    }
  }
  const { createLoader } = require(path.join(BOOT, 'loader.js'));
  const { MCP_CONTRACT } = require(path.join(BOOT, 'server-core.js'));
  const FIX = T.loadFixtures();

  const IDS = {
    admin: { email: 'chris@example.com', role: 'admin', projects: null },
    lead: { email: 'lead@mg.co', role: 'leadership', projects: null },
    dm101: { email: 'dm.one@mg.co', role: 'delivery_manager', projects: ['101'] },
    dm102: { email: 'dm.one@mg.co', role: 'delivery_manager', projects: ['102'] },
    tp: { email: 'tp.one@mg.co', role: 'talent_partner', projects: ['101', '102'] },
    tp2: { email: 'tp.two@mg.co', role: 'talent_partner', projects: ['102'] },
    tp101: { email: 'tp.one@mg.co', role: 'talent_partner', projects: ['101'] },
  };
  async function boot(who, gopts = {}, mutate = null) {
    const id = IDS[who];
    const mat = T.materialise(FIX.lists);
    const lists = mat.lists;
    const today = mat.today;
    const at = (n, extra) => Object.assign({ OpenDate: T.addDays(today, n) + 'T12:00:00Z' }, extra || {});
    lists.CoEPlanRows = [
      Object.assign({ id: '1701', Title: 'ML Engineer plan', ProjectID: 102, TalentPartner: 'tp.one@mg.co', LinkedHeadcountID: 307, LinkedRoleID: 206, SortOrder: 1 }, at(-30)),
      Object.assign({ id: '1702', Title: 'SRE plan', ProjectID: 102, TalentPartner: 'tp.one@mg.co', LinkedHeadcountID: 310, LinkedRoleID: 209, SortOrder: 2 }, at(-60)),
      Object.assign({ id: '1703', Title: 'Platform plan', ProjectID: 102, TalentPartner: 'tp.one@mg.co;tp.two@mg.co', LinkedHeadcountID: 309, LinkedRoleID: 209, SortOrder: 3 }, at(-55)),
      Object.assign({ id: '1704', Title: 'Future plan', ProjectID: 102, TalentPartner: 'tp.two@mg.co', LinkedHeadcountID: null, LinkedRoleID: null, SortOrder: 4 }, at(20)),
    ];
    if (mutate) mutate(lists, today);
    const opts = Object.assign({ writes: [] }, gopts);
    const graph = T.makeGraph(lists, opts);
    const L = createLoader({ authShim: T.stubShim(id.email), localDir: ROOT, graphFetch: graph.graphFetch, log: () => {} });
    const st = await L.load({ contract: MCP_CONTRACT });
    ok(st.ok, 'live load failed: ' + st.reason);
    const g = L.evalInContext('globalThis');
    g.getEffectiveRole = async () => id.role;
    g.getUserProjectIds = async () => (id.projects === null ? null : id.projects.slice());
    const tools = Array.from(L.evalInContext('MCP_TOOLS'));
    const ctx = Object.freeze({ email: id.email, role: id.role });
    const call = async (name, args) => clone(await tools.find(t => t.name === name).handler(args || {}, ctx));
    return { L, g, tools, lists, today, opts, graph, call, plan: args => call('hiring_plan', args), facts: args => call('report_facts', args), config: L.config(), tool: n => tools.find(t => t.name === n) };
  }

  await check('AC13 registered: hiring_plan is a read tool for Admin / Leadership / DM / TP with a closed schema; CoEPlanRows is readable, nothing is writable that was not before; the new file loads last and coe-plan-logic.js follows headcount.js', async () => {
    const h = await boot('admin');
    const t = h.tool('hiring_plan');
    ok(t && typeof t.handler === 'function' && !('write' in t), 'a read tool');
    eq(Array.from(t.roles), ['admin', 'leadership', 'delivery_manager', 'talent_partner'], 'roles');
    eq(Object.keys(t.inputSchema.properties), ['project', 'asOf'], 'arguments');
    ok(t.inputSchema.additionalProperties === false && !t.inputSchema.required, 'closed, nothing required');
    ok(h.config.MCP.allowedLists.includes('CoEPlanRows'), 'CoEPlanRows is in allowedLists');
    eq(Object.keys(h.config.MCP.writeLists).sort(), ['Notifications', 'Roles', 'RoleHistory', 'SavedReports', 'WeeklyActivity'].sort(), 'writeLists unchanged');
    eq(h.config.MCP.contract, 2, 'no contract bump');
    const sc = Array.from(h.config.MCP.scripts);
    eq(sc.slice(-2), ['mcp/newton-report-tools.js', 'mcp/newton-plan-tools.js'], 'plan tools load last');
    ok(sc.indexOf('js/coe-plan-logic.js') > sc.indexOf('js/headcount.js'), 'coe-plan-logic.js after headcount.js');
    ok(h.tools.map(x => x.name).includes('report_facts'), 'report_facts still registered');
  });

  await check('AC9 hiring_plan (Admin): the page\'s own numbers - summary, rows with names, planned vs actual opens and hires; no emails, money, candidate names or Notes', async () => {
    const h = await boot('admin');
    const r = await h.plan({ project: 'Bluefin' });
    eq(r.project.name, 'Bluefin Labs', 'project');
    eq(r.asOf, h.today, 'as of today');
    eq(r.summary, { plannedRows: 4, linkedRows: 3, notLinked: 1, opened: 3, hiresConfirmed: 1, started: 0, lateToOpen: 0, cancelled: 0 }, 'summary');
    eq(r.rows.rows.map(x => x.title), ['ML Engineer plan', 'SRE plan', 'Platform plan', 'Future plan'], 'rows in plan order');
    const by = Object.fromEntries(r.rows.rows.map(x => [x.rowId, x]));
    eq([by[1701].status, by[1702].status, by[1703].status, by[1704].status], ['open', 'hired', 'open', 'planned'], 'statuses');
    ok(by[1701].openVarianceWeeks.final === true && by[1701].openVarianceWeeks.weeks >= 3, 'row 1: opened ~4 weeks late: ' + JSON.stringify(by[1701].openVarianceWeeks));
    eq(by[1702].openVarianceWeeks, { weeks: 0, final: true }, 'row 2: opened in the planned week');
    eq(by[1702].hireConfirmedDay, T.addDays(h.today, -25), 'row 2: offer accepted day (placement 402)');
    eq(by[1702].startedDay, null, 'row 2: the start (today+5) has not happened');
    eq(by[1704].openVarianceWeeks, null, 'row 4: not due');
    eq(by[1701].talentPartner, ['Tess One'], 'names, not emails');
    eq(by[1703].talentPartner, ['Tess One', 'Tom Two'], 'two partners as names');
    eq([by[1701].linkedRole, by[1701].stage, by[1704].linkedRole], ['ML Engineer (Spain)', 'Sourcing', null], 'linked role title and current stage');
    eq([r.opens.target, r.opens.doneToDate, r.opens.remaining], [4, 3, 1], 'opens');
    eq([r.hires.target, r.hires.doneToDate, r.hires.remaining], [4, 1, 3], 'hires: offer accepted');
    ok(r.opens.months.every(m => ['month', 'planned', 'actual', 'variance'].every(k => k in m)) && r.opens.months.length > 0, 'months');
    // the numbers are the page's: the same pure model on the same rows
    const inputs = await h.g.mcpPlanRead('102', []);
    const page = h.g.coeOpensModel(h.g.coeSortRows(inputs.planRows), inputs.headcount, h.L.evalInContext('new Date()'));   // a Date made inside the vm realm, as the page's own
    eq(r.opens.months.map(m => [m.month, m.planned, m.actual]), page.months.map(m => [m.key, m.planned, m.actual]), 'opens months = coeOpensModel');
    eq(r.opens.requiredPerMonth, page.requiredPerMonth === null ? null : Math.round(page.requiredPerMonth * 10) / 10, 'run rate as the page shows it (one decimal)');
    const json = JSON.stringify(r);
    ok(!/@/.test(json), 'no email address anywhere');
    ['ZZQ-', '918273', '"Notes":', 'CandidateName', 'SalaryAgreed'].forEach(s => ok(!json.includes(s), 'withheld: ' + s));
    eq(r.degraded, [], 'nothing degraded');
  });

  await check('AC9 scope: Admin and Leadership see any CoE project; a TP sees the WHOLE plan, not own rows; a DM or TP outside the project, and an unknown project, get the standard refusal; a non-CoE project and a CoE project with no rows answer "no plan"', async () => {
    const lead = await boot('lead');
    eq((await lead.plan({ project: 'Bluefin' })).summary.plannedRows, 4, 'Leadership');
    const tp = await boot('tp');
    const t = await tp.plan({ project: 'Bluefin' });
    eq(t.rows.rows.map(x => x.rowId), [1701, 1702, 1703, 1704], 'a TP sees every row, including one that is only tp.two\'s');
    const t2 = await (await boot('tp2')).plan({ project: '102' });
    eq(t2.summary.plannedRows, 4, 'another TP on the project, by id');
    const dm = await (await boot('dm102')).plan({ project: 'Bluefin' });
    eq(dm.summary.plannedRows, 4, 'a DM on the project');
    for (const who of ['dm101', 'tp101']) {
      const h = await boot(who);
      const a = await refused(h.plan({ project: 'Bluefin' }), /isn't available/, who + ': a project outside their scope');
      const b = await refused(h.plan({ project: 'Nonesuch' }), /isn't available/, who + ': a project that does not exist');
      eq(a.code, 'MCP_REFUSED', 'a refusal, not a crash');
      ok(!/Bluefin/.test(a.message.replace(/Your projects:.*$/, '')), 'does not confirm the project exists');
    }
    const ad = await boot('admin');
    const acme = await ad.plan({ project: 'Acme' });
    eq([acme.plan, /no hiring plan/i.test(acme.message)], [null, true], 'a project that is not CoE');
    const empty = await boot('admin', {}, lists => { lists.CoEPlanRows = []; });
    const none = await empty.plan({ project: 'Bluefin' });
    eq([none.plan, /no hiring plan/i.test(none.message), none.project.name], [null, true, 'Bluefin Labs'], 'a CoE project with no plan rows');
    await refused(ad.plan({ project: 'Nonesuch' }), /No project matched/, 'Admin: unknown project is a plain error');
  });

  await check('AC9 listing: without a project it lists only the CoE projects in the caller\'s scope that have a plan', async () => {
    const ad = await boot('admin');
    eq((await ad.plan({})).projects, [{ id: 102, name: 'Bluefin Labs', planRows: 4 }], 'Admin');
    eq((await (await boot('tp')).plan({})).projects.map(p => p.name), ['Bluefin Labs'], 'a TP on 102');
    const dm = await (await boot('dm101')).plan({});
    eq([dm.projects, dm.message], [[], 'There are no hiring plans on your projects.'], 'a DM with no CoE project in scope');
    const noRows = await (await boot('admin', {}, lists => { lists.CoEPlanRows = []; })).plan({});
    eq(noRows.projects, [], 'a CoE project with no rows is not listed');
  });

  await check('AC10 asOf: default today; today or earlier only (YYYY-MM-DD); a past day moves the position back', async () => {
    const h = await boot('admin');
    eq((await h.plan({ project: 'Bluefin', asOf: h.today })).asOf, h.today, 'today');
    const future = T.addDays(h.today, 1);
    for (const bad of [future, 'tomorrow', '2026-13-40', '2026-02-30', '27/11/2026', '2026-1-5']) {
      const e = await refused(h.plan({ project: 'Bluefin', asOf: bad }), /asOf must be today or an earlier date \(YYYY-MM-DD\)\./, 'asOf ' + bad);
      eq(e.code, 'MCP_REFUSED', 'a refusal');
    }
    const past = await h.plan({ project: 'Bluefin', asOf: T.addDays(h.today, -40) });
    eq(past.asOf, T.addDays(h.today, -40), 'the day asked');
    eq([past.summary.opened, past.summary.hiresConfirmed], [2, 0], 'as of 40 days ago: 307 not yet opened (today-5) and the offer (today-25) not yet accepted');
    const by = Object.fromEntries(past.rows.rows.map(x => [x.rowId, x]));
    eq([by[1701].status, by[1702].status, by[1703].status, by[1704].status], ['planned', 'open', 'open', 'planned'], 'statuses then: row 1 opens on plan today-30, which is after that day');
    eq(past.hires.doneToDate, 0, 'no hires yet');
    const mid = await h.plan({ project: 'Bluefin', asOf: T.addDays(h.today, -20) });
    const m = Object.fromEntries(mid.rows.rows.map(x => [x.rowId, x]));
    eq([m[1701].status, m[1701].openVarianceWeeks.final, mid.summary.lateToOpen], ['late', false, 1], '20 days ago row 1 was overdue and not open: a running variance');
    eq([mid.summary.hiresConfirmed, m[1702].status, mid.hires.doneToDate], [1, 'hired', 1], 'and the offer (today-25) had been accepted');
  });

  await check('AC11 a failed headcount read degrades as the page does: plan dates kept, no actuals, no opens or hires, and it says so', async () => {
    const h = await boot('admin', { fail: ['RoleHeadcount'] });
    const r = await h.plan({ project: 'Bluefin' });
    ok(r.degraded.includes('headcount'), 'degraded names headcount: ' + JSON.stringify(r.degraded));
    eq([r.opens, r.hires], [null, null], 'no models');
    ok(r.rows.rows.every(x => x.status === null && x.actualOpenDay === null && x.hireConfirmedDay === null && x.openVarianceWeeks === null), 'no actuals');
    ok(r.rows.rows.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.plannedHireDay)), 'plan dates still there');
    ok(r.notes.some(n => /headcount could not be read/.test(n)), 'the notes say why');
  });

  await check('AC12 report_facts: a CoE project\'s report carries facts.hiringPlan as of today (period end is later); the whole plan for a TP; absent for a non-CoE project, no plan rows or a failed plan read', async () => {
    const ad = await boot('admin');
    const r = await ad.facts({ report: '1503' });
    const hp = r.facts.hiringPlan;
    ok(hp, 'hiringPlan present');
    eq(hp.asOf, ad.today, 'this_year ends later: capped at today');
    eq(hp.summary.plannedRows, 4, 'the whole plan although the report has a role filter (206)');
    ok(/whole hiring plan/.test(hp.scope) && /not narrowed/.test(hp.scope), 'the scope sentence says so');
    eq([hp.hires.doneToDate, hp.opens.doneToDate], [1, 3], 'numbers as hiring_plan');
    const direct = await ad.plan({ project: 'Bluefin' });
    eq([hp.summary, hp.opens, hp.hires, hp.rows], [direct.summary, direct.opens, direct.hires, direct.rows], 'identical to hiring_plan for the same day');
    ok(!/@/.test(JSON.stringify(hp)), 'no email');
    const tp = await (await boot('tp')).facts({ report: '1503' });
    eq(tp.facts.hiringPlan.rows.rows.map(x => x.rowId), [1701, 1702, 1703, 1704], 'a TP: every row, though facts.byRole is their own');
    const acme = await ad.facts({ report: '1501' });
    ok(!('hiringPlan' in acme.facts), 'a non-CoE project: no key');
    const noRows = await (await boot('admin', {}, lists => { lists.CoEPlanRows = []; })).facts({ report: '1503' });
    ok(!('hiringPlan' in noRows.facts), 'no plan rows: no key');
    const failed = await (await boot('admin', { fail: ['CoEPlanRows'] })).facts({ report: '1503' });
    ok(!('hiringPlan' in failed.facts) && failed.degraded.includes('hiring plan'), 'a failed plan read: no key, listed in degraded');
  });

  await check('AC12 as-of for a past period: the report period\'s end when it is before today', async () => {
    const h = await boot('admin', {}, lists => { lists.SavedReports.find(x => x.id === '1503').Period = 'last_quarter'; });
    const end = h.g.reportPeriodWindow('last_quarter').end;
    ok(end < h.today, 'last quarter ended before today');
    const hp = (await h.facts({ report: '1503' })).facts.hiringPlan;
    eq(hp.asOf, end, 'asOf = the last quarter\'s end');
    const direct = await h.plan({ project: 'Bluefin', asOf: end });
    eq([hp.summary, hp.opens, hp.hires], [direct.summary, direct.opens, direct.hires], 'the position then, as hiring_plan asOf that day');
  });

  return results;
}

module.exports = { run };
