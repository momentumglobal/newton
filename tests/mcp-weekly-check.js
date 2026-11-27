// tests/mcp-weekly-check.js - N-548: Node-side checks of log_weekly_activity (mcp/newton-write-tools.js).
// Run by tests/run.js after tests/mcp-tools-check.js, in the same totals and exit code.
//
// The tool is async and reads through Graph, so it runs here exactly as in production: the REAL loader
// (localDir mode) loads js/config.js + CONFIG.MCP.scripts into a DOM-less context, the REAL write shim sits
// between the tool and the fixture Graph from tests/mcp-tools-check.js (extended in N-548 to apply and record
// POST / PATCH), and commits only reach it while the loader is armed - as server-core arms it for a confirmed
// commit. So a field outside CONFIG.MCP.writeLists, or a write at preview time, fails a check.
// The identity is stubbed the way mcp-tools-check.js does (getEffectiveRole / getUserProjectIds / writable ids).
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
    try { await fn(); results.push({ name: 'N-548 ' + name, ok: true }); } catch (e) {
      results.push({ name: 'N-548 ' + name, ok: false, message: e && e.message ? e.message : String(e) });
    }
  }
  const { createLoader } = require(path.join(BOOT, 'loader.js'));
  const { MCP_CONTRACT } = require(path.join(BOOT, 'server-core.js'));
  const NOW = new Date();
  const today = T.localDay(NOW);
  const thisSunday = T.addDays(today, (7 - NOW.getDay()) % 7);
  const lastSunday = T.addDays(thisSunday, -7);

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
    const tool = Array.from(L.evalInContext('MCP_TOOLS')).find(t => t.name === 'log_weekly_activity');
    ok(tool, 'log_weekly_activity is not in MCP_TOOLS');
    const ctx = Object.freeze({ email: id.email, role: id.role });
    // The server's own steps: preview -> plan stored as a JSON string -> (confirm) armed commit on the stored plan.
    const preview = async args => { const r = await tool.preview(args, ctx); r.plan = JSON.parse(JSON.stringify(r.plan)); return r; };
    const commit = async plan => {
      L.armWrites();
      try { return JSON.parse(JSON.stringify(await tool.commit(JSON.parse(JSON.stringify(plan)), ctx))); } finally { L.disarmWrites(); }
    };
    return { L, tool, lists, opts, writes: opts.writes, preview, commit, config: L.config() };
  }
  const entry = (extra) => Object.assign({ role: 'Backend Engineer' }, extra);

  await check('AC1 registered: write: true, preview + commit and no handler, roles Admin / DM / TP only, closed schema, 10 entries max from CONFIG', async () => {
    const h = await boot('tp');
    const t = h.tool;
    ok(t.write === true && typeof t.preview === 'function' && typeof t.commit === 'function' && !('handler' in t), 'shape');
    eq(Array.from(t.roles), ['admin', 'delivery_manager', 'talent_partner'], 'roles (Leadership is read-only)');
    eq(h.config.MCP.maxWeeklyEntries, 10, 'maxWeeklyEntries');
    eq(t.inputSchema.required, ['entries'], 'required');
    ok(t.inputSchema.additionalProperties === false, 'top level closed');
    eq(t.inputSchema.properties.entries.maxItems, 10, 'maxItems from CONFIG');
    ok(t.inputSchema.properties.entries.items.additionalProperties === false, 'entry schema closed');
    eq(t.inputSchema.properties.entries.items.required, ['role'], 'entry requires a role');
    const keys = Object.keys(t.inputSchema.properties.entries.items.properties);
    ['Outreach', 'Interview2Plus', 'Hires', 'week', 'talentPartner', 'project'].forEach(k => ok(keys.includes(k), 'entry property ' + k));
  });

  await check('AC2 preview creates a week and writes NOTHING (no POST / PATCH, no Notification); the plan is plain JSON', async () => {
    const h = await boot('tp');
    const p = await h.preview({ entries: [entry({ Outreach: 12, Screened: 3, Hires: 1 })] });
    eq(h.writes.length, 0, 'preview wrote');
    ok(/1 role-week/.test(p.summary) && /1 new, 0 edited/.test(p.summary), 'summary: ' + p.summary);
    eq(p.changes.length, 9, 'a create lists all nine counts');
    ok(p.changes.some(c => /Backend Engineer/.test(c.field) && /Outreach/.test(c.field) && c.from === '-' && c.to === 12), 'Outreach line');
    ok(p.warnings.some(w => /reminder to record the placement/.test(w)), 'hires warning');
    eq(p.plan.entries[0].sunday, thisSunday, 'omitted week = this week');
    eq(p.plan.entries[0].tpEmail, 'tp.one@mg.co', 'a TP logs as themselves');
  });

  await check('AC3 commit create: one POST from the stored plan, Source claude, Yeare / Sunday from the day string, every key inside writeLists.WeeklyActivity.create, then the hire reminder to the signed-in user', async () => {
    const h = await boot('tp');
    const p = await h.preview({ entries: [entry({ Outreach: 12, Hires: 1 })] });
    const r = await h.commit(p.plan);
    const wk = h.writes.filter(w => w.list === 'WeeklyActivity');
    eq(wk.length, 1, 'one WeeklyActivity write');
    eq(wk[0].method, 'POST', 'create is a POST');
    const f = wk[0].fields;
    eq(f.Source, 'claude', 'Source');
    eq(f.Yeare, Number(thisSunday.slice(0, 4)), 'Yeare read off the Sunday string');
    ok(String(f.WeekEndingDate).startsWith(thisSunday), 'WeekEndingDate is the Sunday: ' + f.WeekEndingDate);
    eq([f.RoleIDLookupId, f.ProjectIDLookupId, f.Outreach, f.Hires, f.Responses, f.TalentPartner], [201, 101, 12, 1, 0, 'tp.one@mg.co'], 'values (uncounted = 0)');
    const allowedKeys = h.config.MCP.writeLists.WeeklyActivity.create;
    Object.keys(f).forEach(k => ok(allowedKeys.includes(k), 'key outside writeLists.create: ' + k));
    eq(r.saved.length, 1, 'saved');
    eq(r.saved[0].action, 'created', 'action');
    eq(r.notSaved, [], 'notSaved');
    const n = h.writes.filter(w => w.list === 'Notifications');
    eq(n.length, 1, 'one hire reminder');
    eq([n[0].fields.TriggerType, n[0].fields.RecipientEmail, n[0].fields.Tone], ['mcpHire', 'tp.one@mg.co', 'celebrate'], 'reminder fields');
    ok(/^reporting\.html#placements\?action=addPlacement&roleId=201&projectId=101$/.test(n[0].fields.DeepLink), 'deep link: ' + n[0].fields.DeepLink);
    ok(/Backend Engineer/.test(n[0].fields.Body), 'body names the role');
    ok(/reminder to record the placement for Backend Engineer \(Portugal\)/.test(r.placementReminder) && /cannot record placements/.test(r.placementReminder), 'result tells Claude a reminder was added and that it cannot record placements: ' + r.placementReminder);
  });

  await check('AC4 edit changes only the supplied counts: PATCH carries those + SubmittedAt + Source, never role / person / week; an unchanged entry is dropped with a warning; all unchanged is refused; no reminder without Hires', async () => {
    const h = await boot('tp');
    const week = lastSunday;
    const p = await h.preview({ week, entries: [entry({ Outreach: 31, Responses: 2 })] });
    eq(p.changes.map(c => [c.from, c.to]), [[30, 31]], 'only Outreach differs (Responses 2 is unchanged)');
    ok(/0 new, 1 edited/.test(p.summary), 'summary: ' + p.summary);
    eq(h.writes.length, 0, 'preview wrote');
    await h.commit(p.plan);
    const wk = h.writes.filter(w => w.list === 'WeeklyActivity');
    eq(wk.length, 1, 'one write');
    eq(wk[0].method, 'PATCH', 'edit is a PATCH');
    eq(wk[0].id, '601', 'the existing row');
    eq(Object.keys(wk[0].fields).sort(), ['Outreach', 'Source', 'SubmittedAt'], 'edit keys');
    eq(h.writes.filter(w => w.list === 'Notifications').length, 0, 'no Hires, no reminder');
    const h2 = await boot('tp');
    await refused(h2.preview({ week, entries: [entry({ Outreach: 30, Responses: 2 })] }), /Nothing to change/, 'all unchanged');
    const mixed = await h2.preview({ week, entries: [entry({ Outreach: 30 }), { role: 'ML Engineer', project: 'Bluefin', Outreach: 7 }] });
    ok(mixed.warnings.some(w => /Nothing to change for Backend Engineer/.test(w)), 'dropped entry warned: ' + mixed.warnings.join(' | '));
    eq(mixed.plan.entries.length, 1, 'only the changed entry is planned');
  });

  await check('AC5 week rules: date -> its Sunday, "last week", future refused; counts must be whole numbers >= 0; at least one count; unknown keys, 0 or 11 entries, duplicate role-week refused', async () => {
    const h = await boot('tp');
    const day = T.addDays(lastSunday, -2);   // a Friday
    eq((await h.preview({ week: day, entries: [entry({ Outreach: 1 })] })).plan.entries[0].sunday, lastSunday, 'date -> Sunday on or after');
    eq((await h.preview({ week: 'last week', entries: [entry({ Outreach: 1 })] })).plan.entries[0].sunday, lastSunday, 'last week');
    await refused(h.preview({ week: T.addDays(thisSunday, 7), entries: [entry({ Outreach: 1 })] }), /future/, 'future week');
    await refused(h.preview({ week: 'next tuesday', entries: [entry({ Outreach: 1 })] }), /week must be a date/, 'garbage week');
    await refused(h.preview({ entries: [entry({ Outreach: -1 })] }), /whole number/, 'negative');
    await refused(h.preview({ entries: [entry({ Outreach: 1.5 })] }), /whole number/, 'fraction');
    await refused(h.preview({ entries: [entry({})] }), /at least one count/, 'no counts');
    await refused(h.preview({ entries: [entry({ Outreach: 1, Bogus: 2 })] }), /unknown field "Bogus"/, 'unknown key');
    await refused(h.preview({ entries: [] }), /at least one entry/, 'no entries');
    await refused(h.preview({ entries: Array.from({ length: 11 }, () => entry({ Outreach: 1 })) }), /at most 10/, 'eleven entries');
    await refused(h.preview({ entries: [entry({ Outreach: 1 }), entry({ Responses: 1 })] }), /already in this call/, 'duplicate role-week');
  });

  await check('AC6 scope: a TP cannot log for another TP\'s role or as another person; a role out of scope answers exactly like one that does not exist; stages Newton takes no activity for are refused; ambiguous titles list candidates', async () => {
    const h = await boot('tp');
    const a = await refused(h.preview({ entries: [{ role: '202', Outreach: 1 }] }), /./, 'someone else\'s role');
    const b = await refused(h.preview({ entries: [{ role: '9999', Outreach: 1 }] }), /./, 'a role that does not exist');
    eq(a.message, b.message, 'out of scope and missing give the same message');
    await refused(h.preview({ entries: [entry({ Outreach: 1, talentPartner: 'tp.two@mg.co' })] }), /yourself/, 'TP logging as another person');
    await refused(h.preview({ entries: [{ role: 'DevOps Engineer', Outreach: 1 }] }), /Closed/, 'closed role');
    await refused(h.preview({ entries: [{ role: '205', Outreach: 1 }] }), /On-hold/, 'on-hold role');
    await refused(h.preview({ entries: [{ role: 'Engineer', Outreach: 1 }] }), /Backend Engineer[\s\S]*QA Engineer|QA Engineer[\s\S]*Backend Engineer/, 'ambiguous title lists the candidates');
    eq(h.writes.length, 0, 'no refusal wrote');
  });

  await check('AC7 a Delivery Manager logs for a Talent Partner on the project; a person who is not on the project team and a project outside the DM\'s scope are refused', async () => {
    const h = await boot('dm');
    const p = await h.preview({ entries: [entry({ Outreach: 4, talentPartner: 'tp.one@mg.co' })] });
    eq(p.plan.entries[0].tpEmail, 'tp.one@mg.co', 'logged for the TP');
    const d = await h.preview({ entries: [entry({ Outreach: 4 })] });
    eq(d.plan.entries[0].tpEmail, 'tp.one@mg.co', 'default is the role\'s TP');
    await refused(h.preview({ entries: [entry({ Outreach: 4, talentPartner: 'nobody@mg.co' })] }), /./, 'not on the project');
    await refused(h.preview({ entries: [{ role: '206', Outreach: 1 }] }), /./, 'a project outside the DM\'s scope');
  });

  await check('AC8 stale: a stored row that changed between preview and confirm refuses the commit with nothing written; a week that appeared after a create preview does too', async () => {
    const h = await boot('tp');
    const p = await h.preview({ week: lastSunday, entries: [entry({ Outreach: 31 })] });
    h.lists.WeeklyActivity.find(r => r.id === '601').Outreach = 99;   // someone edited it in Newton
    const e = await refused(h.commit(p.plan), /./, 'edit after the row changed');
    eq(e.code, 'MCP_STALE', 'stale code (server-core maps it to "changed since preview")');
    eq(h.writes.length, 0, 'nothing written');
    const h2 = await boot('tp');
    const p2 = await h2.preview({ entries: [entry({ Outreach: 5 })] });
    h2.lists.WeeklyActivity.push({ id: '777', RoleIDLookupId: 201, ProjectIDLookupId: 101, TalentPartner: 'tp.one@mg.co', WeekEndingDate: thisSunday + 'T12:00:00Z', Outreach: 1 });
    eq((await refused(h2.commit(p2.plan), /./, 'create after the week appeared')).code, 'MCP_STALE', 'stale create');
    eq(h2.writes.length, 0, 'nothing written');
  });

  await check('AC9 every entry is preflighted before the first write; a failure part-way stops the rest and reports what was and was not saved (reminders only for saved rows)', async () => {
    const h = await boot('tp');
    const p = await h.preview({ entries: [entry({ Outreach: 1, Hires: 1 }), { role: 'ML Engineer', project: 'Bluefin', Outreach: 2 }] });
    eq(p.plan.entries.length, 2, 'two entries');
    h.lists.WeeklyActivity.push({ id: '778', RoleIDLookupId: 206, ProjectIDLookupId: 102, TalentPartner: 'tp.one@mg.co', WeekEndingDate: thisSunday + 'T12:00:00Z', Outreach: 3 });
    await refused(h.commit(p.plan), /./, 'second entry went stale');
    eq(h.writes.length, 0, 'the first entry was NOT written before the second was checked');
    const f = await boot('tp', { failWrite: (list, method, fields) => list === 'WeeklyActivity' && fields.RoleIDLookupId === 206 });
    const p2 = await f.preview({ entries: [entry({ Outreach: 1, Hires: 1 }), { role: 'ML Engineer', project: 'Bluefin', Outreach: 2 }, { role: '203', Outreach: 3 }] });
    const r = await f.commit(p2.plan);
    eq(r.saved.map(s => s.role), ['Backend Engineer (Portugal)'], 'saved');
    eq(r.notSaved.map(s => s.role), ['ML Engineer (Spain)', 'QA Engineer (Spain)'], 'notSaved: the failure, then the one not attempted');
    ok(/Not attempted/.test(r.notSaved[1].reason), 'the third was not attempted');
    eq(f.writes.filter(w => w.list === 'Notifications').length, 1, 'one reminder, for the saved row only');
  });

  await check('AC10 a failed reminder never fails the saved row; a Hires edit that does not rise sends none; an edit that raises Hires does', async () => {
    const h = await boot('tp', { failWrite: list => list === 'Notifications' });
    const p = await h.preview({ entries: [entry({ Outreach: 1, Hires: 2 })] });
    const r = await h.commit(p.plan);
    eq(r.saved.length, 1, 'row saved although the reminder failed');
    eq(r.notSaved, [], 'nothing reported as unsaved');
    const e = await boot('tp');
    e.lists.WeeklyActivity.find(r => r.id === '601').Hires = 2;
    const same = await e.preview({ week: lastSunday, entries: [entry({ Hires: 2, Outreach: 31 })] });
    ok(!same.warnings.some(w => /placement/.test(w)), 'no reminder when Hires does not rise');
    const up = await e.preview({ week: lastSunday, entries: [entry({ Hires: 3 })] });
    ok(up.warnings.some(w => /placement/.test(w)), 'reminder when Hires rises');
  });

  await check('AC11 the commit result passes the output guard: no Body / DeepLink / RecipientEmail / Notes key anywhere in it', async () => {
    const h = await boot('tp');
    const p = await h.preview({ entries: [entry({ Outreach: 1, Hires: 1 })] });
    const r = await h.commit(p.plan);
    const deny = [];
    Object.keys(h.config.MCP.outputDenyFields).forEach(l => h.config.MCP.outputDenyFields[l].forEach(k => { if (!deny.includes(k)) deny.push(k); }));
    ok(deny.includes('Body') && deny.includes('DeepLink') && deny.includes('RecipientEmail'), 'the notification fields are on the deny list');
    const keys = [];
    (function walk(v) { if (v && typeof v === 'object') Object.keys(v).forEach(k => { keys.push(k); walk(v[k]); }); })(r);
    deny.forEach(d => ok(!keys.includes(d), 'denied key in the result: ' + d));
  });

  return results;
}

module.exports = { run };
