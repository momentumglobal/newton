// tests/mcp-report-check.js - N-550 (AMCP-6): Node-side checks of report_facts and draft_report_narrative
// (mcp/newton-report-tools.js). Run by tests/run.js after tests/mcp-stage-check.js, in the same totals and exit code.
//
// Same harness as tests/mcp-stage-check.js: the REAL loader (localDir mode) loads js/config.js + CONFIG.MCP.scripts into a DOM-less
// context, the REAL write shim sits between the tools and the fixture Graph, and writes only reach it while the loader is armed, as
// server-core arms it for a confirmed commit. The identity is stubbed the same way (getEffectiveRole / getUserProjectIds).
// Fixture reports (tests/fixtures.js SavedReports): 1501 'Weekly Report' on Acme (101; text blocks t1, t2; a Snapshot block holding a
// candidate-like sentinel), 1502 'Monthly Review' (101, owner dm.one), 1503 'Weekly Report' on Bluefin (102, role filter 206, owner
// dm.one), 1504 company scope, 1505 a template, 1506 'Panels Only' (101, no text block).
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
    try { await fn(); results.push({ name: 'N-550 ' + name, ok: true }); } catch (e) {
      results.push({ name: 'N-550 ' + name, ok: false, message: e && e.message ? e.message : String(e) });
    }
  }
  const { createLoader } = require(path.join(BOOT, 'loader.js'));
  const { MCP_CONTRACT } = require(path.join(BOOT, 'server-core.js'));
  const FIX = T.loadFixtures();

  const IDS = {
    tp: { email: 'tp.one@mg.co', role: 'talent_partner', projects: ['101', '102'] },
    tp101: { email: 'tp.one@mg.co', role: 'talent_partner', projects: ['101'] },
    tp2: { email: 'tp.two@mg.co', role: 'talent_partner', projects: ['101'] },
    dm: { email: 'dm.one@mg.co', role: 'delivery_manager', projects: ['101'] },
    admin: { email: 'chris@example.com', role: 'admin', projects: null },
    lead: { email: 'lead@mg.co', role: 'leadership', projects: null },
  };
  async function boot(who, gopts = {}) {
    const id = IDS[who];
    const lists = T.materialise(FIX.lists).lists;
    const opts = Object.assign({ writes: [] }, gopts);
    const graph = T.makeGraph(lists, opts);
    const L = createLoader({ authShim: T.stubShim(id.email), localDir: ROOT, graphFetch: graph.graphFetch, log: () => {} });
    const st = await L.load({ contract: MCP_CONTRACT });
    ok(st.ok, 'live load failed: ' + st.reason);
    const g = L.evalInContext('globalThis');
    g.getEffectiveRole = async () => id.role;
    g.getUserProjectIds = async () => (id.projects === null ? null : id.projects.slice());
    g.getUserWritableProjectIds = async () => (id.projects === null ? null : id.projects.slice());
    const tools = Array.from(L.evalInContext('MCP_TOOLS'));
    const facts = tools.find(t => t.name === 'report_facts');
    const draft = tools.find(t => t.name === 'draft_report_narrative');
    ok(facts && draft, 'report_facts / draft_report_narrative are not in MCP_TOOLS');
    const ctx = Object.freeze({ email: id.email, role: id.role });
    const read = async args => clone(await facts.handler(args || {}, ctx));
    const readTool = async (name, args) => clone(await tools.find(t => t.name === name).handler(args || {}, ctx));
    const preview = async args => { const r = await draft.preview(args, ctx); r.plan = clone(r.plan); return r; };
    const commit = async plan => {
      L.armWrites();
      try { return clone(await draft.commit(clone(plan), ctx)); } finally { L.disarmWrites(); }
    };
    const armed = async fn => { L.armWrites(); try { return await fn(g); } finally { L.disarmWrites(); } };
    const wr = (list, method) => opts.writes.filter(w => w.list === list && (!method || w.method === method));
    return { L, g, tools, facts, draft, lists, opts, graph, writes: opts.writes, read, readTool, preview, commit, armed, wr, ctx, config: L.config() };
  }
  const row = (h, id) => h.lists.SavedReports.find(r => String(r.id) === String(id));
  const blocksOf = (h, id) => JSON.parse(row(h, id).ModuleOrder);

  await check('AC1 registered: report_facts is a read tool (handler, no write), draft_report_narrative a write tool (preview + commit, no handler); roles Admin / DM / TP, never Leadership; closed schemas; edit limits from CONFIG', async () => {
    const h = await boot('tp');
    ok(typeof h.facts.handler === 'function' && !('write' in h.facts), 'report_facts shape');
    ok(h.draft.write === true && typeof h.draft.preview === 'function' && typeof h.draft.commit === 'function' && !('handler' in h.draft), 'draft shape');
    eq(Array.from(h.facts.roles), ['admin', 'delivery_manager', 'talent_partner'], 'report_facts roles');
    eq(Array.from(h.draft.roles), ['admin', 'delivery_manager', 'talent_partner'], 'draft roles');
    eq([h.config.MCP.maxNarrativeEdits, h.config.MCP.maxNarrativeChars], [6, 4000], 'limits');
    ok(h.facts.inputSchema.additionalProperties === false && h.draft.inputSchema.additionalProperties === false, 'closed top level');
    eq(h.draft.inputSchema.required, ['reportId', 'edits'], 'required');
    eq(h.draft.inputSchema.properties.edits.maxItems, 6, 'maxItems from CONFIG');
    ok(h.draft.inputSchema.properties.edits.items.additionalProperties === false, 'edit schema closed');
    eq(h.draft.inputSchema.properties.edits.items.required, ['blockId', 'text'], 'an edit needs a block and text');
    ok(h.facts.description.length <= 300, 'description length');
  });

  await check('AC2 visibility: the Library rule, narrowed to project-scope, non-template reports on a project in the caller\'s Newton scope', async () => {
    const ad = await boot('admin');
    const r = await ad.read({});
    eq(r.reports.map(x => x.reportId).sort(), ['1501', '1502', '1503', '1506'], 'Admin: not the company report, not the template');
    ok(r.reports.every(x => x.title && x.project && x.period), 'each row names title, project and period');
    ok(!JSON.stringify(r).includes('ModuleOrder'), 'no raw layout in the list');
    const dm = await boot('dm');
    eq((await dm.read({})).reports.map(x => x.reportId).sort(), ['1501', '1502', '1506'], 'DM on 101: 1503 is theirs but on a project outside their scope; 1504 is company scope');
    const tp = await boot('tp');
    eq((await tp.read({})).reports.map(x => x.reportId).sort(), ['1501', '1502', '1503', '1506'], 'TP on 101 + 102');
    const t1 = await boot('tp101');
    eq((await t1.read({})).reports.map(x => x.reportId).sort(), ['1501', '1502', '1506'], 'TP on 101 only');
    eq((await ad.read({ project: 'Bluefin' })).reports.map(x => x.reportId), ['1503'], 'narrowed by project');
    await refused(ad.read({ project: 'Nonesuch' }), /./, 'unknown project');
  });

  await check('AC3 finding a report: exact title, unique partial, id; a title on two projects lists the candidates and a project narrows it; company, template, hidden and missing are refused (a scoped caller cannot tell them apart)', async () => {
    const ad = await boot('admin');
    eq((await ad.read({ report: 'Monthly Review' })).report.reportId, '1502', 'exact title');
    eq((await ad.read({ report: 'monthly' })).report.reportId, '1502', 'unique partial');
    eq((await ad.read({ report: '1506' })).report.reportId, '1506', 'by id');
    const amb = await refused(ad.read({ report: 'Weekly Report' }), /matched 2 reports[\s\S]*id 1501[\s\S]*id 1503/, 'ambiguous title');
    ok(/Acme Bank/.test(amb.message) && /Bluefin Labs/.test(amb.message), 'candidates name their project');
    eq((await ad.read({ report: 'Weekly Report', project: 'Bluefin' })).report.reportId, '1503', 'project narrows');
    const co = await refused(ad.read({ report: 'Company Overview' }), /Only project reports can be updated through Claude\./, 'company report, Admin');
    eq(co.code, 'MCP_REFUSED', 'a refusal, not a crash');
    await refused(ad.read({ report: '1504' }), /Only project reports/, 'company report by id');
    await refused(ad.read({ report: 'Weekly template' }), /No report matched/, 'a template is not in the Library list');
    await refused(ad.read({ report: '1505' }), /No report matched "1505"/, 'a template by id');
    const t1 = await boot('tp101');
    const a = await refused(t1.read({ report: '1503' }), /./, 'report on a project outside scope');
    const b = await refused(t1.read({ report: '9999' }), /./, 'report that does not exist');
    const c = await refused(t1.read({ report: '1504' }), /./, 'company report');
    const d = await refused(t1.read({ report: '1505' }), /./, 'template');
    eq([a.message, c.message, d.message], [b.message, b.message, b.message], 'hidden, company, template and missing answer the same');
    eq(b.message, "That Newton data isn't available to your account.", 'the standard refusal');
    const dm = await boot('dm');
    await refused(dm.read({ report: '1503' }), /isn't available/, 'a DM\'s own report on a project outside their scope');
    eq((await t1.read({ report: 'Weekly Report' })).report.reportId, '1501', 'a title that is ambiguous for Admin is unique inside a TP\'s scope');
  });

  await check('AC4 report_facts: layout, text blocks as plain text with the panel above each, the report period, and facts that agree with project_summary on the numbers both return', async () => {
    const ad = await boot('admin');
    const r = await ad.read({ report: '1501' });
    eq([r.report.reportId, r.report.title, r.report.project.name, r.report.roleFilter, r.report.kpiPeriod], ['1501', 'Weekly Report', 'Acme Bank', 'All roles', 'quarter'], 'report header');
    eq(r.report.period.key, 'this_year', 'period key');
    ok(/^\d{4}-\d{2}-\d{2}$/.test(r.report.period.start) && /^\d{4}-\d{2}-\d{2}$/.test(r.report.period.end), 'concrete period days');
    eq(r.report.layout.map(x => [x.position, x.type, x.blockId || x.key]), [[1, 'text', 't1'], [2, 'panel', 'kpiStrip'], [3, 'panel', 'pipelineSummary'], [4, 'text', 't2'], [5, 'panel', 'candidateSnapshot']], 'layout (title page marker left out)');
    eq(r.textBlocks.map(t => [t.blockId, t.position, t.after]), [['t1', 1, 'top of report'], ['t2', 4, 'Pipeline Summary (last 4 weeks)']], 'text blocks and what is above them');
    eq(r.textBlocks[0].text, '## Summary\n\nLast week: 4 submissions & 1 interview.\n\n- Backend Engineer sourcing', 'plain text');
    eq(r.textBlocks[1].text, 'Next steps: chase the shortlist.', 'inline markup dropped');
    ok(r.textBlocks.every(t => t.truncated === false && t.chars === t.text.length), 'not truncated');
    const ps = await ad.readTool('project_summary', { project: 'Acme Bank' });
    eq(r.facts.kpi.activePipelines, ps.pipelines.open, 'active pipelines = project_summary open pipelines');
    eq(r.facts.kpi.openHeadcount, ps.headcount.open, 'open headcount');
    eq(r.facts.kpi.avgDaysOpen, ps.headcount.avgDaysOpen, 'average days open');
    eq(r.facts.roles.byStage, ps.pipelines.byStage, 'roles by stage');
    eq(r.facts.funnel.steps.map(s => s.step), ['Outreach', 'Responses', 'Screened', 'Submitted', 'Interview1', 'Interview2Plus', 'FinalInterview', 'Offers', 'Hires'], 'nine funnel steps');
    ok(r.facts.funnel.steps[0].pctOfPreviousStep === null && r.facts.funnel.steps.slice(1).every(s => s.pctOfPreviousStep === null || Number.isInteger(s.pctOfPreviousStep)), 'conversion percentages');
    ok(r.facts.roles.openThirtyPlusDays.rows.every(x => x.daysOpen >= 30), 'open 30+ days');
    ok(r.facts.roles.flagged.rows.every(x => x.role && x.reasons), 'flagged roles carry their reasons');
    ok(r.facts.upcomingStarters.rows.every(x => Object.keys(x).sort().join() === 'role,startDate'), 'starters: role + date only');
    ok(r.notIncluded.length >= 4 && r.textNote && r.scope, 'says what is left out');
    eq(r.degraded, [], 'nothing degraded');
  });

  await check('AC5 role filter and Talent Partner scope: a report saved for one role reports that role only; a TP sees their own roles and rows, as the report shows a TP', async () => {
    const ad = await boot('admin');
    const b = await ad.read({ report: '1503' });
    ok(b.report.roleFilter.startsWith('ML Engineer'), 'role filter named: ' + b.report.roleFilter);
    const covered = r => r.report.period.start <= T.addDays(T.localDay(new Date()), -21);   // the fixture activity is 1-3 weeks old; a year window that just started misses it
    ok(b.facts.byRole.rows.every(x => x.roleId === 206), 'only the filtered role in the by-role table');
    if (covered(b)) eq(b.facts.byRole.rows.map(x => x.roleId), [206], 'one role in the by-role table');
    eq(b.facts.roles.byStage, { Sourcing: 1 }, 'one role by stage');
    const all = await ad.read({ report: '1501' });
    if (covered(all)) ok(all.facts.byRole.rows.length >= 3, 'all roles when there is no filter: ' + all.facts.byRole.rows.length);
    const t2 = await boot('tp2');
    const own = await t2.read({ report: '1501' });
    ok(own.facts.byRole.rows.every(x => [202, 204].includes(x.roleId)), 'tp.two sees only their own roles: ' + JSON.stringify(own.facts.byRole.rows.map(x => x.roleId)));
    eq(own.facts.activityByTalentPartner.map(x => x.name), ['Tom Two'], 'only their own activity, by display name');
    ok(own.facts.kpi.activePipelines < all.facts.kpi.activePipelines, 'KPIs narrow to their pipelines');
  });

  await check('AC6 nothing sensitive leaves: no candidate name, salary, budget, rejection data, Notes, email or raw ModuleOrder in any result (sentinels, with a positive control that the rows hold them); the output guard refuses a denied key', async () => {
    const ad = await boot('admin');
    const raw = JSON.stringify(ad.lists.SavedReports) + JSON.stringify(ad.lists.Placements) + JSON.stringify(ad.lists.Roles) + JSON.stringify(ad.lists.Projects);
    FIX.sentinels.filter(s => /^(ZZQ-|918273|827364)/.test(s)).forEach(s => ok(raw.includes(s), 'positive control: the fixture rows carry ' + s));
    for (const who of ['admin', 'dm', 'tp']) {
      const h = await boot(who);
      for (const rep of ['1501', '1502', 'Panels Only']) {
        const out = JSON.stringify(await h.read({ report: rep })) + JSON.stringify(await h.read({}));
        FIX.sentinels.forEach(s => ok(!out.includes(s), `${who} ${rep}: sentinel ${s}`));
        ok(!/@/.test(out), `${who} ${rep}: an email address`);
        ok(!out.includes('ModuleOrder') && !/"(Notes|Budget|HiringManager|SalaryAgreed|CandidateName|RejectionReason)":/.test(out), `${who} ${rep}: a denied key`);
      }
    }
    await refused(Promise.resolve().then(() => ad.g.mcpOutputGuard({ a: [{ ModuleOrder: '[]' }] })), /withheld a restricted field \(ModuleOrder\)/, 'the guard');
  });

  await check('AC7 report_facts reads only: no write reaches Graph, every list it asked for is in CONFIG.MCP.allowedLists (RejectedOffers is not read); a failed headcount read degrades as the dashboard does; a failed SavedReports read is an error', async () => {
    const h = await boot('admin');
    await h.read({});
    await h.read({ report: '1501' });
    await h.read({ report: '1503' });
    eq(h.writes.length, 0, 'writes');
    const allowed = Array.from(h.config.MCP.allowedLists);
    const asked = Array.from(new Set(h.graph.asked));
    ok(asked.every(l => allowed.includes(l)), 'asked outside allowedLists: ' + asked.filter(l => !allowed.includes(l)).join(','));
    ok(asked.includes('SavedReports'), 'SavedReports was read');
    ok(!asked.includes('RejectedOffers'), 'RejectedOffers was not read');
    const d = await boot('admin', { fail: ['RoleHeadcount'] });
    const r = await d.read({ report: '1501' });
    ok(r.degraded.includes('headcount'), 'degraded: ' + JSON.stringify(r.degraded));
    eq(r.facts.kpi.openHeadcount, null, 'open headcount unknown');
    const f = await boot('admin', { fail: ['SavedReports'] });
    await refused(f.read({}), /./, 'a failed SavedReports read');
  });

  await check('AC8 draft preview: old -> new per block with its position and the panel above, the three warnings, a plan of the exact HTML to write, and nothing written', async () => {
    const h = await boot('tp');
    const newText = '## Next steps\n\nChase the shortlist & confirm dates.\n\n- Call Acme\n- Book interviews';
    const p = await h.preview({ reportId: '1501', edits: [{ blockId: 't2', text: newText }] });
    ok(/1 text block of "Weekly Report"/.test(p.summary), 'summary: ' + p.summary);
    eq(p.changes, [{ field: 'Text block 4 (after Pipeline Summary (last 4 weeks))', from: 'Next steps: chase the shortlist.', to: newText }], 'changes');
    eq(p.warnings.length, 3, 'warnings');
    ok(/not kept/.test(p.warnings[0]) && /Check names, figures and tone/.test(p.warnings[1]) && /does not export or share/.test(p.warnings[1]) && /Report Builder/.test(p.warnings[2]), 'warning text: ' + p.warnings.join(' | '));
    eq(p.plan.edits, [{ blockId: 't2', position: 4, fromContent: '<p>Next steps: <b>chase</b> the shortlist.</p>', toContent: '<h3>Next steps</h3><p>Chase the shortlist &amp; confirm dates.</p><ul><li>Call Acme</li><li>Book interviews</li></ul>' }], 'plan edits');
    eq([p.plan.reportId, p.plan.title, p.plan.projectId], ['1501', 'Weekly Report', '101'], 'plan header');
    eq(h.writes.length, 0, 'a preview writes nothing');
    const two = await h.preview({ reportId: '1501', edits: [{ blockId: 't1', text: 'One' }, { blockId: 't2', text: 'Two' }] });
    eq(two.plan.edits.map(e => e.blockId), ['t1', 't2'], 'two blocks in one call');
    ok(JSON.stringify(two.plan).length < 4000, 'the plan is the text, not the report');
  });

  await check('AC9 preview refusals: unknown or panel block, duplicate, empty, too long, too many, unchanged, no text block, bad shape; a template, company, hidden or missing report', async () => {
    const h = await boot('admin');
    const P = (edits, id) => h.preview({ reportId: id || '1501', edits });
    await refused(P([{ blockId: 'zz', text: 'x' }]), /Edit 1: block zz is not a text block of this report/, 'unknown block');
    await refused(P([{ blockId: 'p1', text: 'x' }]), /Edit 1: block p1 is not a text block/, 'a panel block');
    await refused(P([{ blockId: 't1', text: 'a' }, { blockId: 't1', text: 'b' }]), /block t1 is in this call twice/, 'duplicate');
    await refused(P([{ blockId: 't1', text: '   ' }]), /text is empty\. To clear a block, do it in Newton/, 'empty');
    await refused(P([{ blockId: 't1', text: 'x'.repeat(4001) }]), /keep each block to 4000 characters/, 'too long');
    await refused(P(Array.from({ length: 7 }, (_, i) => ({ blockId: 't' + i, text: 'x' }))), /at most 6 text blocks/, 'too many');
    await refused(P([]), /at least one text block/, 'none');
    await refused(P([{ blockId: 't1', text: '## Summary\n\nLast week: 4 submissions & 1 interview.\n\n- Backend Engineer sourcing' }]), /already says that/, 'unchanged');
    await refused(P([{ blockId: 't1', text: 'x', extra: 1 }]), /unknown field "extra"/, 'unknown field');
    await refused(P('nope'), /at least one text block/, 'not an array');
    await refused(h.preview({ reportId: '', edits: [{ blockId: 't1', text: 'x' }] }), /Give the reportId/, 'no id');
    await refused(P([{ blockId: 'n1', text: 'x' }], '1506'), /This report has no text block\. Add a text block in Report Builder first\./, 'no text block');
    await refused(P([{ blockId: 'c1', text: 'x' }], '1504'), /Only project reports can be updated through Claude\./, 'company report (Admin)');
    await refused(P([{ blockId: 'x1', text: 'x' }], '1505'), /No report has id 1505/, 'template');
    await refused(P([{ blockId: 't1', text: 'x' }], 'Weekly Report'), /No report has id/, 'a title is not an id here');
    const t1 = await boot('tp101');
    const a = await refused(t1.preview({ reportId: '1503', edits: [{ blockId: 'b1', text: 'x' }] }), /./, 'outside scope');
    const b = await refused(t1.preview({ reportId: '9999', edits: [{ blockId: 'b1', text: 'x' }] }), /./, 'missing');
    const c = await refused(t1.preview({ reportId: '1504', edits: [{ blockId: 'c1', text: 'x' }] }), /./, 'company');
    eq([a.message, c.message], [b.message, b.message], 'scoped refusals look the same');
    const dm = await boot('dm');
    await refused(dm.preview({ reportId: '1503', edits: [{ blockId: 'b1', text: 'x' }] }), /isn't available/, 'a DM\'s own report on a project outside their scope');
    eq([h.writes.length, t1.writes.length, dm.writes.length], [0, 0, 0], 'no refusal wrote');
  });

  await check('AC10 commit: exactly one PATCH to SavedReports with { ModuleOrder } and nothing else; every other block, the marker and the order are byte-identical; edited blocks carry the new HTML and source:claude; the Snapshot data is untouched; the result says verified', async () => {
    const h = await boot('tp');
    const before = row(h, '1501').ModuleOrder;
    const p = await h.preview({ reportId: '1501', edits: [{ blockId: 't1', text: 'Fresh summary.\n\n- one\n- two' }, { blockId: 't2', text: 'Closing line.' }] });
    const r = await h.commit(p.plan);
    eq(h.writes.map(w => [w.list, w.method, w.id, Object.keys(w.fields)]), [['SavedReports', 'PATCH', '1501', ['ModuleOrder']]], 'one write, ModuleOrder only');
    const now = blocksOf(h, '1501');
    const want = JSON.parse(before);
    want[1].content = '<p>Fresh summary.</p><ul><li>one</li><li>two</li></ul>'; want[1].source = 'claude';
    want[4].content = '<p>Closing line.</p>'; want[4].source = 'claude';
    eq(JSON.stringify(now), JSON.stringify(want), 'everything else is byte-identical (key order included)');
    ok(row(h, '1501').ModuleOrder.includes('ZZQ-SNAP-NAME'), 'the Snapshot block data is untouched');
    eq([row(h, '1501').Title, row(h, '1501').Period, row(h, '1501').Scope, row(h, '1501').ProjectID, row(h, '1501').ReportOwner], ['Weekly Report', 'this_year', 'project', '101', 'tp.one@mg.co'], 'no other column moved');
    eq([r.verified, r.warning, r.saved.length, r.report.reportId], [true, null, 2, '1501'], 'result');
    ok(/Report Builder/.test(r.next) && /does not export or share/.test(r.next), 'next step: ' + r.next);
    eq((await h.read({ report: '1501' })).textBlocks.map(t => t.text), ['Fresh summary.\n\n- one\n- two', 'Closing line.'], 'report_facts reads the new text back');
  });

  await check('AC11 escaping: markup in the text is stored inert (&lt; &gt; &amp;), never as a tag, and reads back as the same characters; the stored block holds only p / h3 / ul / li / br', async () => {
    const h = await boot('admin');
    const text = '<script>alert(1)</script> & "quoted" <img src=x onerror=alert(1)>\n\n- <b>bold</b> item';
    const p = await h.preview({ reportId: '1502', edits: [{ blockId: 'm1', text }] });
    await h.commit(p.plan);
    const stored = blocksOf(h, '1502')[0].content;
    ok(!/<(?!\/?(p|h3|ul|li|br)\b)[a-z]/i.test(stored), 'a tag other than p / h3 / ul / li / br was stored: ' + stored);
    ok(stored.includes('&lt;script&gt;') && !stored.includes('<script'), 'script escaped: ' + stored);
    eq((await h.read({ report: '1502' })).textBlocks[0].text, text, 'reads back as typed');
  });

  await check('AC12 stale: a block, the title, the project or the report itself changing between preview and confirm refuses the commit with nothing written (MCP_STALE)', async () => {
    const mk = async () => { const h = await boot('admin'); const p = await h.preview({ reportId: '1501', edits: [{ blockId: 't1', text: 'New one.' }] }); return { h, p }; };
    let { h, p } = await mk();
    const b = blocksOf(h, '1501'); b[1].content = '<p>Someone edited this in Report Builder.</p>'; row(h, '1501').ModuleOrder = JSON.stringify(b);
    eq((await refused(h.commit(p.plan), /./, 'block edited')).code, 'MCP_STALE', 'block edited');
    eq(h.writes.length, 0, 'wrote nothing');
    ({ h, p } = await mk());
    row(h, '1501').Title = 'Renamed';
    eq((await refused(h.commit(p.plan), /./, 'retitled')).code, 'MCP_STALE', 'title changed');
    ({ h, p } = await mk());
    row(h, '1501').ProjectID = '102';
    eq((await refused(h.commit(p.plan), /./, 'moved')).code, 'MCP_STALE', 'project changed');
    ({ h, p } = await mk());
    h.lists.SavedReports.splice(h.lists.SavedReports.findIndex(r => r.id === '1501'), 1);
    eq((await refused(h.commit(p.plan), /./, 'deleted')).code, 'MCP_STALE', 'report deleted');
    ({ h, p } = await mk());
    const c = blocksOf(h, '1501'); c.splice(1, 1); row(h, '1501').ModuleOrder = JSON.stringify(c);
    eq((await refused(h.commit(p.plan), /./, 'block removed')).code, 'MCP_STALE', 'block removed');
    ({ h, p } = await mk());
    row(h, '1501').Scope = 'company';
    await refused(h.commit(p.plan), /Only project reports/, 'turned into a company report');
    eq(h.writes.length, 0, 'wrote nothing');
    ({ h, p } = await mk());
    eq((await h.commit(p.plan)).verified, true, 'positive control: an unchanged report commits');
  });

  await check('AC13 the commit re-scopes: a TP whose project access was removed between preview and confirm is refused, and so is a report that became a template', async () => {
    const h = await boot('tp101');
    const p = await h.preview({ reportId: '1501', edits: [{ blockId: 't1', text: 'x1' }] });
    h.g.getUserProjectIds = async () => ['102'];
    await refused(h.commit(p.plan), /isn't available/, 'access removed');
    eq(h.writes.length, 0, 'wrote nothing');
    const k = await boot('admin');
    const q = await k.preview({ reportId: '1502', edits: [{ blockId: 'm1', text: 'x2' }] });
    row(k, '1502').IsTemplate = true;
    await refused(k.commit(q.plan), /./, 'became a template');
    eq(k.writes.length, 0, 'wrote nothing');
  });

  await check('AC14 the write shim: PATCH SavedReports { ModuleOrder } passes while armed; any other column, a POST, a DELETE and a PATCH while disarmed are refused with 405 and never reach Graph', async () => {
    const h = await boot('admin');
    await h.armed(g => g.updateItem('SavedReports', 1506, { ModuleOrder: JSON.stringify([{ id: 'n1', type: 'panel', key: 'kpiStrip' }]) }));
    eq(h.wr('SavedReports', 'PATCH').length, 1, 'ModuleOrder passes');
    const refusedWrite = async (label, fn, re) => { const e = await refused(h.armed(fn), re, label); eq(e.status, 405, label + ' status'); };
    await refusedWrite('Title', g => g.updateItem('SavedReports', 1506, { Title: 'x' }), /write field Title on SavedReports/);
    await refusedWrite('ReportOwner', g => g.updateItem('SavedReports', 1506, { ReportOwner: 'x@y.co' }), /write field ReportOwner on SavedReports/);
    await refusedWrite('ProjectID', g => g.updateItem('SavedReports', 1506, { ProjectID: '102' }), /write field ProjectID on SavedReports/);
    await refusedWrite('IsTemplate', g => g.updateItem('SavedReports', 1506, { IsTemplate: true }), /write field IsTemplate on SavedReports/);
    await refusedWrite('create', g => g.createItem('SavedReports', { ModuleOrder: '[]' }), /write list SavedReports/);
    await refusedWrite('createSavedReport', g => g.createSavedReport({ Title: 'x', ModuleOrder: '[]' }), /write list SavedReports/);
    await refusedWrite('delete', g => g.deleteItem('SavedReports', 1506), /write method|DELETE/);
    const late = await refused(Promise.resolve().then(() => h.g.updateSavedReport(1506, { ModuleOrder: '[]' })), /./, 'disarmed');
    eq(late.status, 405, 'disarmed status');
    eq(h.wr('SavedReports').length, 1, 'only the one allowed write reached Graph');
    const b = await boot('admin');
    await refused(b.armed(g => g.updateItem('Roles', 201, { Stage: 'Submitted', ModuleOrder: 'x' })), /write field ModuleOrder on Roles/, 'ModuleOrder is allowed on SavedReports only');
  });

  await check('AC15 a failed write is reported, not swallowed; a write that lands but reads back different says so', async () => {
    const h = await boot('admin', { failWrite: (list) => list === 'SavedReports' });
    const p = await h.preview({ reportId: '1502', edits: [{ blockId: 'm1', text: 'x' }] });
    await refused(h.commit(p.plan), /./, 'a refused write');
    const k = await boot('admin');
    const q = await k.preview({ reportId: '1502', edits: [{ blockId: 'm1', text: 'y' }] });
    k.g.updateSavedReport = async () => ({ id: 1502 });   // lands nowhere: the read-back finds the old text
    const r = await k.commit(q.plan);
    eq(r.verified, false, 'unverified');
    ok(/Report Builder/.test(r.warning), 'the warning tells the user to check it: ' + r.warning);
  });

  await check('AC17 Leadership: neither tool lists Leadership among its roles (the four tools Leadership never sees are the write and report tools)', async () => {
    const h = await boot('lead');
    const never = h.tools.filter(t => !Array.from(t.roles).includes('leadership')).map(t => t.name);
    eq(never, ['log_weekly_activity', 'update_role_stage', 'report_facts', 'draft_report_narrative'], 'tools Leadership never sees');
  });

  return results;
}

module.exports = { run };
