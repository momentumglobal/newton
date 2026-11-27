// tests/mcp-stage-check.js - N-549: Node-side checks of update_role_stage (mcp/newton-write-tools.js) and the shared
// Stage sequence it runs (applyRoleStageChange / checkRoleStageMove in js/api-headcount.js, the awaited RoleHistory
// write in js/api.js). Run by tests/run.js after tests/mcp-weekly-check.js, in the same totals and exit code.
//
// Same harness as tests/mcp-weekly-check.js: the REAL loader (localDir mode) loads js/config.js + CONFIG.MCP.scripts into a
// DOM-less context, the REAL write shim sits between the tool and the fixture Graph, and writes only reach it while the
// loader is armed, as server-core arms it for a confirmed commit. The identity is stubbed the same way (getEffectiveRole /
// getUserProjectIds / getUserWritableProjectIds). Fixture roles (project 101: 201 Sourcing, 202 Submitted, 203 Interview 1,
// 204 Closed, 205 On-hold, 210 Backlog with no headcount; project 102: 206 Sourcing, 207 Cancelled, 209 Offered).
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

async function run() {
  const results = [];
  async function check(name, fn) {
    try { await fn(); results.push({ name: 'N-549 ' + name, ok: true }); } catch (e) {
      results.push({ name: 'N-549 ' + name, ok: false, message: e && e.message ? e.message : String(e) });
    }
  }
  const { createLoader } = require(path.join(BOOT, 'loader.js'));
  const { MCP_CONTRACT } = require(path.join(BOOT, 'server-core.js'));

  const IDS = {
    tp: { email: 'tp.one@mg.co', role: 'talent_partner', projects: ['101', '102'] },
    dm: { email: 'dm.one@mg.co', role: 'delivery_manager', projects: ['101'] },
    admin: { email: 'chris@example.com', role: 'admin', projects: null },
  };
  // One loader per scenario: fresh fixture lists, so a write in one check never leaks into the next.
  async function boot(who, gopts = {}) {
    const id = IDS[who];
    const lists = T.materialise(T.loadFixtures().lists).lists;
    const opts = Object.assign({ writes: [] }, gopts);
    const graph = T.makeGraph(lists, opts);
    const L = createLoader({ authShim: T.stubShim(id.email), localDir: ROOT, graphFetch: graph.graphFetch, log: () => {} });
    const st = await L.load({ contract: MCP_CONTRACT });
    ok(st.ok, 'live load failed: ' + st.reason);
    const g = L.evalInContext('globalThis');
    g.getEffectiveRole = async () => id.role;
    g.getUserProjectIds = async () => (id.projects === null ? null : id.projects.slice());
    g.getUserWritableProjectIds = async () => (id.projects === null ? null : id.projects.slice());
    const tool = Array.from(L.evalInContext('MCP_TOOLS')).find(t => t.name === 'update_role_stage');
    ok(tool, 'update_role_stage is not in MCP_TOOLS');
    const ctx = Object.freeze({ email: id.email, role: id.role });
    const clone = v => JSON.parse(JSON.stringify(v));
    // The server's own steps: preview -> plan stored as a JSON string -> (confirm) armed commit on the stored plan.
    const preview = async args => { const r = await tool.preview(args, ctx); r.plan = clone(r.plan); return r; };
    const commit = async plan => {
      L.armWrites();
      try { return clone(await tool.commit(clone(plan), ctx)); } finally { L.disarmWrites(); }
    };
    // Run something against the real context while the write shim is armed (app-function checks).
    const armed = async fn => { L.armWrites(); try { return await fn(g); } finally { L.disarmWrites(); } };
    const wr = (list, method) => opts.writes.filter(w => w.list === list && (!method || w.method === method));
    return { L, g, tool, lists, opts, writes: opts.writes, preview, commit, armed, wr, ctx, config: L.config() };
  }
  const mv = (role, stage, extra) => Object.assign({ role, stage }, extra);
  const nap = ms => new Promise(r => setTimeout(r, ms));

  await check('AC1 registered: write: true, preview + commit and no handler, roles Admin / DM / TP only, closed schema, 10 moves max from CONFIG, linear stages named from the derived list', async () => {
    const h = await boot('tp');
    const t = h.tool;
    ok(t.write === true && typeof t.preview === 'function' && typeof t.commit === 'function' && !('handler' in t), 'shape');
    eq(Array.from(t.roles), ['admin', 'delivery_manager', 'talent_partner'], 'roles (Leadership is read-only)');
    eq(h.config.MCP.maxStageMoves, 10, 'maxStageMoves');
    eq(t.inputSchema.required, ['moves'], 'required');
    ok(t.inputSchema.additionalProperties === false, 'top level closed');
    eq(t.inputSchema.properties.moves.maxItems, 10, 'maxItems from CONFIG');
    ok(t.inputSchema.properties.moves.items.additionalProperties === false, 'move schema closed');
    eq(t.inputSchema.properties.moves.items.required, ['role', 'stage'], 'a move needs a role and a stage');
    eq(Object.keys(t.inputSchema.properties.moves.items.properties), ['role', 'project', 'stage'], 'move keys');
    eq(Array.from(h.g.linearRoleStages()), ['Backlog', 'Planning', 'Sourcing', 'Submitted', 'Interview 1', 'Interview 2+', 'Final Interview', 'Offered'], 'linear stages (AMCP-C3)');
    ok(/Backlog, Planning, Sourcing, Submitted, Interview 1, Interview 2\+, Final Interview, Offered/.test(t.description), 'description names the derived stages');
    ok(!/Closed|Cancelled|On-hold/.test(t.description.replace(/Closing, cancelling and putting a role on hold/, '')), 'no terminal stage offered as a target');
  });

  await check('AC3 updateRoleWithHistory: with no opts the history write is background and carries no Source key (app path); with { source, awaitHistory } it is awaited, tagged, and the return reports historyOk', async () => {
    const a = await boot('tp');
    const ra = await a.armed(async g => {
      const r = await g.updateRoleWithHistory(201, { Stage: 'Submitted' });
      await nap(60);   // the background history write lands while the shim is still armed
      return r;
    });
    ok(!('historyOk' in Object(ra)), 'no opts: the return is the bare result');
    const ha = a.wr('RoleHistory', 'POST');
    eq(ha.length, 1, 'one background history row');
    ok(!('Source' in ha[0].fields), 'no Source key for the app: ' + JSON.stringify(ha[0].fields));
    eq(a.wr('Roles', 'PATCH')[0].fields, { Stage: 'Submitted' }, 'Roles PATCH body');
    const b = await boot('tp');
    const rb = await b.armed(g => g.updateRoleWithHistory(201, { Stage: 'Submitted' }, { source: 'claude', awaitHistory: true }));
    eq([rb.historyOk, rb.historyRows], [true, 1], 'awaited history reported');
    const hb = b.wr('RoleHistory', 'POST');
    eq(hb.length, 1, 'the history row is already written when the call returns (no wait)');
    eq([hb[0].fields.Source, hb[0].fields.Field, hb[0].fields.OldValue, hb[0].fields.NewValue, hb[0].fields.ChangedBy, hb[0].fields.RoleIDLookupId], ['claude', 'Stage', 'Sourcing', 'Submitted', 'tp.one@mg.co', 201], 'history row');
    const keys = b.config.MCP.writeLists.RoleHistory.create;
    Object.keys(hb[0].fields).forEach(k => ok(keys.includes(k), 'key outside writeLists.RoleHistory.create: ' + k));
  });

  await check('AC4 applyRoleStageChange: a refused gate, a refused rule and a failed headcount read each return { ok: false, reason } and write nothing; success is one Roles PATCH { Stage }; preChecked skips the gate and the headcount read', async () => {
    const g1 = await boot('tp');
    g1.g.getUserWritableProjectIds = async () => ['102'];   // project 101's write window is closed
    const r1 = await g1.armed(g => g.applyRoleStageChange(201, 'Submitted'));
    eq(r1.ok, false, 'gate refused');
    ok(/./.test(r1.reason), 'Newton\'s own reason');
    eq(g1.writes.length, 0, 'gate refusal wrote');
    const g2 = await boot('tp');
    const r2 = await g2.armed(g => g.applyRoleStageChange(210, 'Planning'));
    eq(r2.ok, false, 'rule refused');
    ok(/no open headcount/.test(r2.reason), 'rule reason: ' + r2.reason);
    eq(g2.writes.length, 0, 'rule refusal wrote');
    const g3 = await boot('tp', { fail: ['RoleHeadcount'] });
    const r3 = await g3.armed(g => g.applyRoleStageChange(201, 'Submitted'));
    eq(r3.ok, false, 'failed read fails closed');
    ok(/Couldn't check this role's headcount/.test(r3.reason), 'reason: ' + r3.reason);
    eq(g3.writes.length, 0, 'failed read wrote');
    const g4 = await boot('tp');
    const r4 = await g4.armed(g => g.applyRoleStageChange(201, 'Submitted', { source: 'claude', awaitHistory: true }));
    eq([r4.ok, r4.fromStage, r4.toStage, r4.historyOk], [true, 'Sourcing', 'Submitted', true], 'success');
    eq(g4.wr('Roles', 'PATCH').map(w => w.fields), [{ Stage: 'Submitted' }], 'one Roles PATCH, Stage only');
    const g5 = await boot('tp', { fail: ['RoleHeadcount'] });
    g5.g.getUserWritableProjectIds = async () => [];
    const r5 = await g5.armed(g => g.applyRoleStageChange(201, 'Submitted', { preChecked: true }));
    eq([r5.ok, r5.historyOk], [true, null], 'preChecked: no gate, no headcount read, history not awaited -> null');
    eq(g5.wr('Roles', 'PATCH').length, 1, 'preChecked still writes');
  });

  await check('AC6 scope: a TP and a DM move any role on a writable own project; a role in another project and a missing id answer the same; a closed write window is refused with Newton\'s message; Admin reaches every project', async () => {
    const t = await boot('tp');
    eq((await t.preview({ moves: [mv('202', 'Interview 1')] })).plan.moves[0].roleId, 202, 'a TP moves a role that is another TP\'s (any role on their project, as the Roles page)');
    const a = await refused(t.preview({ moves: [mv('208', 'Submitted')] }), /./, 'role in a project outside scope');
    const b = await refused(t.preview({ moves: [mv('9999', 'Submitted')] }), /./, 'role that does not exist');
    eq(a.message.replace(/^Move 1: /, ''), b.message.replace(/^Move 1: /, ''), 'out of scope and missing answer the same');
    const d = await boot('dm');
    eq((await d.preview({ moves: [mv('Backend Engineer', 'Submitted')] })).plan.moves.length, 1, 'a DM moves a role on their project');
    await refused(d.preview({ moves: [mv('206', 'Submitted')] }), /./, 'a project outside the DM\'s scope');
    const ro = await boot('tp');
    ro.g.getUserWritableProjectIds = async () => ['102'];
    await refused(ro.preview({ moves: [mv('201', 'Submitted')] }), /./, 'read-only project');
    eq(ro.writes.length, 0, 'no refusal wrote');
    const ad = await boot('admin');
    eq((await ad.preview({ moves: [mv('208', 'Submitted')] })).plan.moves[0].projectId, 103, 'Admin reaches an internal project');
  });

  await check('AC7 input rules: names (any case), next / previous, skip-ahead; the ends refused; Closed / Cancelled / On-hold as target or as the role\'s stage refused; unknown stage lists the choices; same stage dropped; two moves for one role, 11 moves, unknown keys refused; ambiguous title lists candidates', async () => {
    const h = await boot('tp');
    const to = async (role, stage) => (await h.preview({ moves: [mv(role, stage)] })).plan.moves[0].to;
    eq(await to('201', 'submitted'), 'Submitted', 'name, any case');
    eq(await to('201', 'INTERVIEW 2+'), 'Interview 2+', 'name with a plus, any case, skipping ahead');
    eq(await to('201', 'next'), 'Submitted', 'next');
    eq(await to('201', 'Previous'), 'Planning', 'previous');
    eq(await to('203', 'Planning'), 'Planning', 'a long step back');
    await refused(h.preview({ moves: [mv('209', 'next')] }), /Offered is the last stage[\s\S]*Do that in Newton on the role page/, 'next from Offered');
    await refused(h.preview({ moves: [mv('210', 'previous')] }), /Backlog is the first stage/, 'previous from Backlog');
    await refused(h.preview({ moves: [mv('201', 'Closed')] }), /cannot move a role to Closed\. Do that in Newton on the role page\./, 'Closed target');
    await refused(h.preview({ moves: [mv('201', 'on-hold')] }), /cannot move a role to On-hold/, 'On-hold target');
    await refused(h.preview({ moves: [mv('201', 'Cancelled')] }), /cannot move a role to Cancelled/, 'Cancelled target');
    await refused(h.preview({ moves: [mv('205', 'Sourcing')] }), /On-hold\. Do that in Newton on the role page\./, 'a role that is on hold');
    await refused(h.preview({ moves: [mv('204', 'Sourcing')] }), /Closed\. Do that in Newton on the role page\./, 'a closed role');
    await refused(h.preview({ moves: [mv('207', 'Sourcing')] }), /Cancelled\. Do that in Newton on the role page\./, 'a cancelled role');
    await refused(h.preview({ moves: [mv('201', 'Warm')] }), /not a stage\. Choose from: Backlog, Planning[\s\S]*Offered/, 'unknown stage');
    const same = await h.preview({ moves: [mv('201', 'Sourcing'), mv('202', 'Interview 1')] });
    ok(same.warnings.some(w => /Backend Engineer \(Portugal\) is already at Sourcing/.test(w)), 'no-op dropped with a warning: ' + same.warnings.join(' | '));
    eq(same.plan.moves.length, 1, 'only the real move is planned');
    await refused(h.preview({ moves: [mv('201', 'Sourcing')] }), /Nothing to change/, 'all moves already there');
    await refused(h.preview({ moves: [mv('201', 'Submitted'), mv('Backend Engineer', 'Interview 1')] }), /already in this call/, 'two moves for one role');
    await refused(h.preview({ moves: [] }), /at least one role/, 'no moves');
    await refused(h.preview({ moves: Array.from({ length: 11 }, () => mv('201', 'Submitted')) }), /at most 10/, 'eleven moves');
    await refused(h.preview({ moves: [{ role: '201', stage: 'Submitted', Notes: 'x' }] }), /unknown field "Notes"/, 'unknown key');
    await refused(h.preview({ moves: [{ role: '201' }] }), /say which stage/, 'no stage');
    await refused(h.preview({ moves: [mv('Engineer', 'Submitted')] }), /Backend Engineer[\s\S]*QA Engineer|QA Engineer[\s\S]*Backend Engineer/, 'ambiguous title lists candidates');
    await refused(h.preview({ moves: [mv('210', 'Planning')] }), /no open headcount/, 'Newton\'s headcount rule, with its own text');
    eq(h.writes.length, 0, 'no refusal wrote');
  });

  await check('AC8 preview writes nothing; one { field, from, to } per move; a backward move is noted; no emails or restricted keys in the preview; the plan is plain JSON', async () => {
    const h = await boot('tp');
    const p = await h.preview({ moves: [mv('201', 'Submitted'), mv('203', 'Planning')] });
    eq(h.writes.length, 0, 'preview wrote');
    ok(/Move 2 roles/.test(p.summary), 'summary: ' + p.summary);
    eq(p.changes.map(c => [c.from, c.to]), [['Sourcing', 'Submitted'], ['Interview 1', 'Planning']], 'from / to');
    ok(/Backend Engineer \(Portugal\) \| Acme Bank \| Stage/.test(p.changes[0].field), 'field line: ' + p.changes[0].field);
    ok(p.warnings.some(w => /moving back from Interview 1 to Planning/.test(w)), 'backward note: ' + p.warnings.join(' | '));
    ok(p.warnings.some(w => /days in stage/.test(w)), 'days-in-stage note');
    const text = JSON.stringify(p);
    ok(!/@/.test(text), 'an email in the preview');
    ['OldValue', 'NewValue', 'Budget', 'HiringManager', 'Notes', 'Body', 'DeepLink', 'RecipientEmail'].forEach(k => ok(text.indexOf('"' + k + '"') === -1, 'restricted key in the preview: ' + k));
  });

  await check('AC9 commit (stored plan only): each move is one Roles PATCH { Stage } and exactly one RoleHistory Stage row with Source claude, the old and new stage and the signed-in user, inside writeLists - for one move and for a three-move batch', async () => {
    const h = await boot('tp');
    const p = await h.preview({ moves: [mv('201', 'Submitted')] });
    const r = await h.commit(p.plan);
    eq(r.saved, [{ role: 'Backend Engineer (Portugal)', project: 'Acme Bank', from: 'Sourcing', to: 'Submitted', historyOk: true }], 'saved');
    eq([r.notSaved, r.historyWarning], [[], null], 'nothing unsaved, no warning');
    eq(h.wr('Roles', 'PATCH').map(w => [w.id, w.fields]), [['201', { Stage: 'Submitted' }]], 'one Roles PATCH');
    const rh = h.wr('RoleHistory', 'POST');
    eq(rh.length, 1, 'exactly one RoleHistory row');
    eq([rh[0].fields.Field, rh[0].fields.OldValue, rh[0].fields.NewValue, rh[0].fields.Source, rh[0].fields.ChangedBy], ['Stage', 'Sourcing', 'Submitted', 'claude', 'tp.one@mg.co'], 'row values');
    Object.keys(rh[0].fields).forEach(k => ok(h.config.MCP.writeLists.RoleHistory.create.includes(k), 'key outside writeLists.RoleHistory.create: ' + k));
    const b = await boot('admin');
    const pb = await b.preview({ moves: [mv('201', 'Interview 1'), mv('202', 'Sourcing'), mv('209', 'Final Interview')] });
    const rb = await b.commit(pb.plan);
    eq(rb.saved.length, 3, 'three saved');
    eq(b.wr('Roles', 'PATCH').length, 3, 'three Roles PATCHes');
    const hist = b.wr('RoleHistory', 'POST');
    eq(hist.length, 3, 'three history rows, one per move');
    eq(hist.map(w => w.fields.Source), ['claude', 'claude', 'claude'], 'every row tagged claude');
    eq(hist.map(w => w.fields.RoleIDLookupId).sort(), [201, 202, 209], 'one row per role');
    eq(hist.every(w => w.fields.Field === 'Stage'), true, 'Stage rows only');
    const keys = [];
    (function walk(v) { if (v && typeof v === 'object') Object.keys(v).forEach(k => { keys.push(k); walk(v[k]); }); })(rb);
    const deny = [];
    Object.keys(b.config.MCP.outputDenyFields).forEach(l => b.config.MCP.outputDenyFields[l].forEach(k => { if (!deny.includes(k)) deny.push(k); }));
    deny.forEach(d => ok(!keys.includes(d), 'denied key in the result: ' + d));
  });

  await check('AC10 history failure: the Roles PATCH has landed, the result says historyOk false with the warning, the batch stops (rest not attempted) and nothing throws; also when the prior role cannot be read', async () => {
    const h = await boot('tp', { failWrite: list => list === 'RoleHistory' });
    const p = await h.preview({ moves: [mv('201', 'Submitted'), mv('202', 'Interview 1'), mv('203', 'Offered')] });
    const r = await h.commit(p.plan);
    eq(r.saved.map(s => [s.role, s.historyOk]), [['Backend Engineer (Portugal)', false]], 'first move saved, history not');
    eq(h.wr('Roles', 'PATCH').length, 1, 'only the first stage moved');
    eq(r.notSaved.map(s => s.role), ['Data Analyst (Portugal)', 'QA Engineer (Spain)'], 'the rest');
    ok(r.notSaved.every(s => /Not attempted: the history entry/.test(s.reason)), 'not attempted, history named: ' + JSON.stringify(r.notSaved));
    ok(/stage moved in Newton, but its history entry did not save/.test(r.historyWarning), 'warning for the user: ' + r.historyWarning);
    const g = await boot('tp');
    g.g.getItem = async () => { throw new Error('read failed'); };
    const rg = await g.armed(x => x.updateRoleWithHistory(201, { Stage: 'Submitted' }, { source: 'claude', awaitHistory: true }));
    eq([rg.historyOk, rg.historyRows], [false, 0], 'prior role unreadable: historyOk false, no history row');
    eq(g.wr('Roles', 'PATCH').length, 1, 'the stage still moved');
    eq(g.wr('RoleHistory').length, 0, 'no history row');
  });

  await check('AC11 stale and failure: a changed stage, a project that went read-only or a role that lost its last open headcount refuses the commit with ZERO writes; a failure on move 3 of 5 leaves 1-2 saved with their history and reports 3 failed and 4-5 not attempted', async () => {
    const s = await boot('tp');
    const ps = await s.preview({ moves: [mv('201', 'Submitted')] });
    s.lists.Roles.find(r => r.id === '201').Stage = 'Planning';   // someone moved it in Newton
    eq((await refused(s.commit(ps.plan), /./, 'stage changed')).code, 'MCP_STALE', 'stale code');
    eq(s.writes.length, 0, 'nothing written');
    const w = await boot('tp');
    const pw = await w.preview({ moves: [mv('201', 'Submitted'), mv('206', 'Submitted')] });
    w.g.getUserWritableProjectIds = async () => ['101'];   // project 102 closed after the preview
    await refused(w.commit(pw.plan), /./, 'second move now read-only');
    eq(w.writes.length, 0, 'the first move was NOT written before the second was checked');
    const o = await boot('tp');
    const po = await o.preview({ moves: [mv('201', 'Submitted')] });
    o.lists.RoleHeadcount.filter(r => r.RoleID === 201).forEach(r => { r.Status = 'Cancelled'; });   // no open headcount left
    await refused(o.commit(po.plan), /no open headcount/, 'headcount gone');
    eq(o.writes.length, 0, 'nothing written');
    const f = await boot('tp', { failWrite: (list, method, fields) => list === 'Roles' && fields.Stage === 'Offered' });
    const pf = await f.preview({ moves: [mv('201', 'Submitted'), mv('202', 'Interview 1'), mv('203', 'Offered'), mv('206', 'Submitted'), mv('209', 'Final Interview')] });
    const rf = await f.commit(pf.plan);
    eq(rf.saved.map(x => x.role), ['Backend Engineer (Portugal)', 'Data Analyst (Portugal)'], 'moves 1-2 saved');
    eq(f.wr('RoleHistory', 'POST').length, 2, 'their history rows are there');
    eq(rf.notSaved.map(x => x.role), ['QA Engineer (Spain)', 'ML Engineer (Spain)', 'SRE (Spain)'], 'the failure, then two not attempted');
    ok(/Not saved/.test(rf.notSaved[0].reason) && /Not attempted/.test(rf.notSaved[1].reason) && /Not attempted/.test(rf.notSaved[2].reason), 'reasons: ' + JSON.stringify(rf.notSaved));
    eq(rf.historyWarning, null, 'no history warning: the history rows saved');
  });

  await check('AC12 shim: a RoleHistory write outside a commit and a Roles PATCH with any field other than Stage are refused (405); only the Stage field is writable on Roles', async () => {
    const h = await boot('tp');
    await refused(h.g.createItem('RoleHistory', { RoleIDLookupId: 201, Field: 'Stage', OldValue: 'a', NewValue: 'b', ChangedBy: 'x', ChangedAt: new Date().toISOString(), Source: 'claude' }), /./, 'unarmed history write');
    eq(h.writes.length, 0, 'unarmed write reached Graph');
    await refused(h.armed(g => g.updateItem('Roles', 201, { Title: 'Renamed' })), /./, 'Roles PATCH with a field other than Stage');
    await refused(h.armed(g => g.updateItem('Roles', 201, { Stage: 'Submitted', Notes: 'x' })), /./, 'Roles PATCH with Stage plus another field');
    eq(h.writes.length, 0, 'nothing reached Graph');
    eq(Array.from(h.config.MCP.writeLists.Roles.update), ['Stage'], 'Roles update list');
  });

  return results;
}

module.exports = { run };
