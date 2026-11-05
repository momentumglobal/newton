// tests/assert-pdp-identity.js — PDP identity: config, scope, resolver, backfill planners, writer guard,
// integrity checks (N-433 / PDP-1). Loads AFTER tests/assertions.js and pushes into ASSERTIONS.

function _pdpFx() {
  const P = (id, name, level, extra) => Object.assign({
    id: String(id), EmployeeName: name, Level: level, IsActive: true, StartDate: '2024-01-01',
    WorkEmail: name.toLowerCase().replace(/\s+/g, '.') + '@mg.test', ReportsTo: '',
  }, extra);
  const csd = P(1, 'Cara Csd', 'CSD', { ReportsTo: 'leader@mg.test' });
  const sdm = P(2, 'Sam Sdm', 'SDM', { ReportsTo: csd.WorkEmail });
  const stp = P(3, 'Stu Stp', 'STP', { ReportsTo: sdm.WorkEmail });
  const tp1 = P(4, 'Tia Tp', 'TP', { ReportsTo: sdm.WorkEmail });
  const tp2 = P(5, 'Tom Tp', 'TP', { ReportsTo: csd.WorkEmail });
  const ptp = P(6, 'Pat Ptp', 'PTP', { ReportsTo: csd.WorkEmail });
  const tp3 = P(7, 'Deep Tp', 'TP', { ReportsTo: stp.WorkEmail });
  return { csd, sdm, stp, tp1, tp2, ptp, tp3, P, all: [csd, sdm, stp, tp1, tp2, ptp, tp3] };
}

ASSERTIONS.push(
  {
    name: 'N-433 AC1 config: People projection, CONFIG.PDP, MCP deny',
    fn: function () {
      _assertEqual(CONFIG.LIST_FIELDS.People.includes('WorkEmail'), true, 'AC1 People projection has WorkEmail');
      _assertEqual(['DISPLAY_ROWS', 'MANAGER_LEVELS', 'MAX_CHAIN', 'REVIEWER_LEVEL', 'SCOPE_LEVELS'].every(k => k in CONFIG.PDP), true, 'AC1 CONFIG.PDP keys (N-434 adds more)');
      _assertEqual(CONFIG.PDP.SCOPE_LEVELS, ['TP', 'STP', 'PTP', 'SDM'], 'AC1 scope levels');
      _assertEqual(CONFIG.MCP.outputDenyFields.People.includes('WorkEmail'), true, 'AC1 MCP denies WorkEmail');
      _assertEqual(CONFIG.MCP.scripts.some(f => /pdp/.test(f)), false, 'AC1 PDP files are not in the MCP bundle');
    },
  },
  {
    name: 'N-433 AC2 pdpInScope',
    fn: function () {
      const f = _pdpFx();
      const today = new Date('2026-11-05T12:00:00Z');
      ['tp1', 'stp', 'ptp', 'sdm'].forEach(k => _assertEqual(pdpInScope(f[k], today), true, 'AC2 in scope ' + k));
      _assertEqual(pdpInScope(f.csd, today), false, 'AC2 CSD is a reviewer, not in scope');
      _assertEqual(pdpInScope(f.P(10, 'Ian Internal', 'TP', { StaffType: CONFIG.STAFF_TYPE_INTERNAL }), today), false, 'AC2 internal');
      _assertEqual(pdpInScope(f.P(11, 'Eve External', 'TP', { StaffType: CONFIG.STAFF_TYPE_EXTERNAL }), today), false, 'AC2 external');
      _assertEqual(pdpInScope(f.P(12, 'Pho Placeholder', 'TP', { IsPlaceholder: true }), today), false, 'AC2 placeholder');
      _assertEqual(pdpInScope(f.P(13, 'Ina Inactive', 'TP', { IsActive: false }), today), false, 'AC2 inactive');
      _assertEqual(pdpInScope(f.P(14, 'Fay Future', 'TP', { StartDate: '2026-11-06' }), today), false, 'AC2 future starter');
      _assertEqual(pdpInScope(f.P(15, 'Tod Today', 'TP', { StartDate: '2026-11-05' }), today), true, 'AC2 starts today');
    },
  },
  {
    name: 'N-433 AC3 pdpResolveIdentity: chains, reports, tree',
    fn: function () {
      const f = _pdpFx();
      const r = pdpResolveIdentity(f.all, f.tp1.WorkEmail);
      _assertEqual([r.me.id, r.lineManager.id, r.csd.id], ['4', '2', '1'], 'AC3 TP -> SDM -> CSD');
      const p = pdpResolveIdentity(f.all, f.ptp.WorkEmail);
      _assertEqual([p.lineManager.id, p.csd.id], ['1', '1'], 'AC3 PTP -> CSD');
      const t2 = pdpResolveIdentity(f.all, f.tp2.WorkEmail);
      _assertEqual([t2.lineManager.id, t2.csd.id], ['1', '1'], 'AC3 TP -> CSD directly');
      const deep = pdpResolveIdentity(f.all, f.tp3.WorkEmail);
      _assertEqual([deep.lineManager.id, deep.csd.id], ['3', '1'], 'AC3 3-deep chain');
      const s = pdpResolveIdentity(f.all, f.sdm.WorkEmail);
      _assertEqual(s.directReports.map(x => x.id), ['3', '4'], 'AC3 SDM direct reports (name order)');
      const c = pdpResolveIdentity(f.all, f.csd.WorkEmail);
      _assertEqual(c.csdTree.map(x => x.person.id + ':' + x.depth), ['6:1', '2:1', '5:1', '3:2', '4:2', '7:3'], 'AC3 CSD tree, depth then name');
      _assertEqual([c.csd, c.lineManager, c.flags.isCsd, c.flags.lineManagerNotInPeople], [null, null, true, true], 'AC3 CSD: no csd, leader manager not in People');
    },
  },
  {
    name: 'N-433 AC4/AC5 flags, loops, chain length, email matching',
    fn: function () {
      const f = _pdpFx();
      _assertEqual(pdpResolveIdentity(f.all, 'nobody@mg.test').flags.noRow, true, 'AC4 unknown email -> noRow');
      _assertEqual(pdpResolveIdentity(f.all, '').flags.noRow, true, 'AC4 blank email -> noRow');
      const dup = f.all.concat([f.P(20, 'Dup Two', 'TP', { WorkEmail: f.tp1.WorkEmail })]);
      const d = pdpResolveIdentity(dup, f.tp1.WorkEmail);
      _assertEqual([d.me, d.flags.ambiguous], [null, true], 'AC4 duplicate WorkEmail -> ambiguous, me null');
      const noLm = f.all.concat([f.P(21, 'Lone Tp', 'TP')]);
      _assertEqual(pdpResolveIdentity(noLm, 'lone.tp@mg.test').flags.noLineManager, true, 'AC4 blank ReportsTo');
      const noCsd = [f.P(30, 'A Tp', 'TP', { ReportsTo: 'b.sdm@mg.test' }), f.P(31, 'B Sdm', 'SDM', { ReportsTo: 'leader@mg.test' })];
      const nc = pdpResolveIdentity(noCsd, 'a.tp@mg.test');
      _assertEqual([nc.csd, nc.flags.noCsd], [null, true], 'AC4 chain with no CSD');
      const loop = [f.P(40, 'L One', 'TP', { ReportsTo: 'l.two@mg.test' }), f.P(41, 'L Two', 'SDM', { ReportsTo: 'l.one@mg.test' })];
      const lp = pdpResolveIdentity(loop, 'l.one@mg.test');
      _assertEqual([lp.csd, lp.flags.chainCycle], [null, true], 'AC4 loop terminates with chainCycle');
      const long = [];
      for (let i = 0; i <= CONFIG.PDP.MAX_CHAIN + 2; i++) {
        long.push(f.P(100 + i, 'N' + i, 'SDM', { WorkEmail: 'n' + i + '@mg.test', ReportsTo: 'n' + (i + 1) + '@mg.test' }));
      }
      long.push(f.P(200, 'Top Csd', 'CSD', { WorkEmail: 'n' + (CONFIG.PDP.MAX_CHAIN + 3) + '@mg.test' }));
      const lg = pdpResolveIdentity(long, 'n0@mg.test');
      _assertEqual([lg.csd, lg.flags.noCsd], [null, true], 'AC4 chain longer than MAX_CHAIN stops safely');
      const mixed = f.all.map(p => Object.assign({}, p, { WorkEmail: p === f.tp1 ? '  TIA.TP@MG.TEST ' : p.WorkEmail, ReportsTo: p === f.tp1 ? ' SAM.SDM@mg.test' : p.ReportsTo }));
      _assertEqual(pdpResolveIdentity(mixed, 'Tia.Tp@mg.test').lineManager.id, '2', 'AC5 case / whitespace insensitive');
    },
  },
  {
    name: 'N-433 AC6 pdpEffectiveEmail: ghost wins, otherwise the signed-in user',
    fn: function () {
      _assertEqual(pdpEffectiveEmail('Real@mg.test', 'Ghost@mg.test'), 'ghost@mg.test', 'AC6 ghost');
      _assertEqual(pdpEffectiveEmail('Real@mg.test', null), 'real@mg.test', 'AC6 no ghost (getGhostUser fails closed to null for a non-admin)');
      _assertEqual(pdpEffectiveEmail(undefined, undefined), '', 'AC6 nothing');
    },
  },
  {
    name: 'N-433 AC7 pdpBuildWorkEmailPlan',
    fn: function () {
      const f = _pdpFx();
      const blank = (id, name, extra) => f.P(id, name, 'TP', Object.assign({ WorkEmail: '' }, extra));
      const people = [
        blank(1, 'Ann Matched'), blank(2, 'Bob Ambiguous'), blank(3, 'Cat Unmatched'),
        blank(4, 'Dee Twin'), blank(5, 'Dee Twin'),
        blank(6, 'Pho Placeholder', { IsPlaceholder: true }), blank(7, 'Ina Inactive', { IsActive: false }),
        f.P(8, 'Has Email', 'TP', { WorkEmail: 'has.email@mg.test' }),
      ];
      const UA = [
        { UserName: 'Ann Matched', UserEmail: 'Ann@mg.test' },
        { UserName: 'Bob Ambiguous', UserEmail: 'bob1@mg.test' }, { UserName: 'Bob Ambiguous', UserEmail: 'bob2@mg.test' },
        { UserName: 'Dee Twin', UserEmail: 'dee@mg.test' },
        { UserName: 'Has Email', UserEmail: 'has.email@mg.test' },
        { UserName: 'Spare One', UserEmail: 'spare@mg.test' },
      ];
      const inputs = { people, userAssignments: UA, leadership: [{ UserName: 'Lea Der', UserEmail: 'lea@mg.test' }] };
      const plan = picks => pdpBuildWorkEmailPlan(inputs, picks);
      const st = p => Object.fromEntries(p.rows.map(r => [r.id, r.state]));
      const p0 = plan({});
      _assertEqual(p0.rows.map(r => r.id), ['1', '2', '3', '4', '5'], 'AC7 targets: active, non-placeholder, blank only');
      _assertEqual(st(p0), { 1: 'matched', 2: 'ambiguous', 3: 'unmatched', 4: 'matched', 5: 'conflict' }, 'AC7 states');
      _assertEqual(p0.rows[0].patch, { WorkEmail: 'ann@mg.test' }, 'AC7 lower-cased patch');
      _assertEqual([...p0.pool.keys()].sort(), ['ann@mg.test', 'bob1@mg.test', 'bob2@mg.test', 'dee@mg.test', 'lea@mg.test', 'spare@mg.test'], 'AC7 pool excludes held emails, includes leadership');
      _assertEqual([p0.summary.toWrite, p0.summary.needsPick], [2, 3], 'AC7 summary');
      const p1 = plan({ 2: 'bob2@mg.test', 3: 'spare@mg.test', 5: 'lea@mg.test' });
      _assertEqual(st(p1), { 1: 'matched', 2: 'picked', 3: 'picked', 4: 'matched', 5: 'picked' }, 'AC7 picks');
      const used = p1.rows.filter(r => r.value).map(r => r.value);
      _assertEqual(new Set(used).size, used.length, 'AC7 no email used twice');
      _assertEqual(plan({ 3: 'ann@mg.test' }).rows.find(r => r.id === '3').state, 'unmatched', 'AC7 a pick duplicating a planned email is rejected');
      _assertEqual(plan({ 3: 'has.email@mg.test' }).rows.find(r => r.id === '3').state, 'unmatched', 'AC7 a pick duplicating a held WorkEmail is rejected');
      _assertEqual(plan({ 1: 'spare@mg.test' }).rows[0].value, 'ann@mg.test', 'AC7 auto-match is not overridden by a pick');
      _assertEqual([plan({ 1: '-' }).rows[0].state, plan({ 1: '-' }).rows[0].patch], ['skipped', null], 'AC7 skip sentinel writes nothing');
      const applied = people.map(p => { const r = p0.rows.find(x => x.id === String(p.id)); return r && r.value ? Object.assign({}, p, { WorkEmail: r.value }) : p; });
      const again = pdpBuildWorkEmailPlan({ people: applied, userAssignments: UA, leadership: [] }, {});
      _assertEqual(again.rows.filter(r => r.state === 'matched').length, 0, 'AC7 second run auto-writes nothing (idempotent)');
    },
  },
  {
    name: 'N-433 AC8 pdpBuildLineManagerPlan',
    fn: function () {
      const f = _pdpFx();
      const today = new Date('2026-11-05T12:00:00Z');
      const blank = p => Object.assign({}, p, { ReportsTo: '' });
      const csd2 = f.P(8, 'Dora Csd', 'CSD');
      const people = [f.csd, csd2, blank(f.sdm), blank(f.stp), blank(f.tp1), blank(f.tp2), blank(f.ptp), blank(f.tp3)];
      const projects = [
        { id: '10', CustomerName: 'Acme', CSDName: 'Cara Csd' },
        { id: '11', CustomerName: 'Beta', CSDName: 'Dora Csd' },
        { id: '12', CustomerName: 'Nodm', CSDName: 'Cara Csd' },
      ];
      const A = (name, pid, extra) => Object.assign({ EmployeeName: name, ProjectID: pid, Customer: 'x', StartDate: '2026-01-01', EndDate: '', IsForecast: false }, extra);
      const assignments = [
        A('Sam Sdm', 10, { IsLeadDM: true }),
        A('Tia Tp', 10),
        A('Stu Stp', 12),
        A('Pat Ptp', 10),
        A('Tom Tp', 10), A('Tom Tp', 11),
        A('Deep Tp', 10, { IsForecast: true }),
      ];
      const plan = (picks, ppl, asg) => pdpBuildLineManagerPlan({ people: ppl || people, assignments: asg || assignments, projects, today }, picks);
      const by = p => Object.fromEntries(p.rows.map(r => [r.employee, r]));
      const r = by(plan({}));
      _assertEqual([r['Tia Tp'].state, r['Tia Tp'].value], ['suggested', 'sam.sdm@mg.test'], 'AC8 TP -> Lead DM');
      _assertEqual([r['Stu Stp'].state, r['Stu Stp'].value], ['suggested', 'cara.csd@mg.test'], 'AC8 STP, no Lead DM -> project CSD');
      _assertEqual([r['Pat Ptp'].state, r['Pat Ptp'].value], ['suggested', 'cara.csd@mg.test'], 'AC8 PTP -> CSD');
      _assertEqual([r['Sam Sdm'].state, r['Sam Sdm'].value], ['suggested', 'cara.csd@mg.test'], 'AC8 SDM -> CSD, never self');
      _assertEqual([r['Tom Tp'].state, r['Tom Tp'].candidates.length, r['Tom Tp'].patch], ['choose', 2, null], 'AC8 two projects -> must pick');
      _assertEqual([r['Deep Tp'].state, r['Deep Tp'].patch], ['none', null], 'AC8 forecast ignored -> no suggestion');
      _assertEqual(by(plan({ 5: '1' }))['Tom Tp'].value, 'cara.csd@mg.test', 'AC8 a pick resolves a choose row');
      _assertEqual(by(plan({}, null, [A('Tia Tp', 10, { AutoGenerated: true })]))['Tia Tp'].state, 'none', 'AC8 bench ignored');
      const noMail = people.map(p => p.id === '2' ? Object.assign({}, p, { WorkEmail: '' }) : p);
      const bl = by(plan({}, noMail));
      _assertEqual([bl['Tia Tp'].state, bl['Tia Tp'].patch], ['blocked', null], 'AC8 candidate without WorkEmail is blocked');
      const hasLm = people.map(p => p.id === '4' ? Object.assign({}, p, { ReportsTo: 'sam.sdm@mg.test' }) : p);
      _assertEqual(plan({}, hasLm).rows.some(x => x.employee === 'Tia Tp'), false, 'AC8 filled ReportsTo left alone');
      const loop = by(plan({ 2: '3', 3: '2' }));   // Sam -> Stu is planned first, so Stu -> Sam would close a loop
      _assertEqual([loop['Sam Sdm'].value, loop['Stu Stp'].patch, loop['Stu Stp'].state], ['stu.stp@mg.test', null, 'rejected'], 'AC8 loop-forming pick rejected');
      _assertEqual(by(plan({ 2: '4' }))['Sam Sdm'].value, 'cara.csd@mg.test', 'AC8 a TP is not an eligible manager: pick ignored');
      _assertEqual(plan({ 4: '-' }).rows.find(x => x.id === '4').patch, null, 'AC8 skip');
    },
  },
  {
    name: 'N-433 AC9 pdpAssertIdentityPatch / pdpPlanWrites',
    fn: function () {
      _assertEqual(pdpAssertIdentityPatch({ WorkEmail: 'a@b.co' }), { WorkEmail: 'a@b.co' }, 'AC9 WorkEmail ok');
      _assertEqual(pdpAssertIdentityPatch({ ReportsTo: 'a@b.co' }), { ReportsTo: 'a@b.co' }, 'AC9 ReportsTo ok');
      const bad = [{ Title: 'x' }, { WorkEmail: 'A@b.co' }, { WorkEmail: 'not-an-email' }, { WorkEmail: 'a@b.co', ReportsTo: 'a@b.co' }, {}, { WorkEmail: 5 }];
      bad.forEach((p, i) => {
        let threw = false; try { pdpAssertIdentityPatch(p); } catch (e) { threw = true; }
        _assertEqual(threw, true, 'AC9 refuses bad patch #' + i);
      });
      const out = pdpPlanWrites([{ id: '1', employee: 'A', patch: { WorkEmail: 'a@b.co' } }, { id: '2', employee: 'B', patch: { WorkEmail: 'BAD' } }, { id: '3', employee: 'C', patch: null }]);
      _assertEqual([out.writes.length, out.refused.length], [1, 1], 'AC9 writes + refused, null patch skipped');
    },
  },
  {
    name: 'N-433 AC10 pdpCheckIdentity: each condition on a dirty fixture, none on a clean one',
    fn: function () {
      const f = _pdpFx();
      const today = new Date('2026-11-05T12:00:00Z');
      const UA = f.all.map(p => ({ UserEmail: p.WorkEmail, UserName: p.EmployeeName }));
      const leadership = [{ UserEmail: 'leader@mg.test' }];
      const clean = pdpCheckIdentity({ people: f.all, userAssignments: UA, leadership, today });
      _assertEqual(clean.map(c => c.count), [0, 0, 0, 0, 0, 0, 0, 0, 0], 'AC10 clean fixture reads zero on all nine');
      const dirty = f.all.concat([
        f.P(50, 'Nomail Tp', 'TP', { WorkEmail: '', ReportsTo: f.sdm.WorkEmail }),
        f.P(51, 'Dupe One', 'TP', { WorkEmail: f.tp1.WorkEmail, ReportsTo: f.sdm.WorkEmail }),
        f.P(52, 'Stranger Tp', 'TP', { WorkEmail: 'stranger@mg.test', ReportsTo: f.sdm.WorkEmail }),
        f.P(53, 'Orphan Tp', 'TP', { ReportsTo: '' }),
        f.P(54, 'Dangle Tp', 'TP', { ReportsTo: 'ghost@mg.test' }),
        f.P(55, 'Under Left', 'TP', { ReportsTo: 'gone.sdm@mg.test' }),
        f.P(56, 'Gone Sdm', 'SDM', { IsActive: false, WorkEmail: 'gone.sdm@mg.test', ReportsTo: f.csd.WorkEmail }),
        f.P(57, 'Loop A', 'TP', { ReportsTo: 'loop.b@mg.test' }), f.P(58, 'Loop B', 'SDM', { ReportsTo: 'loop.a@mg.test' }),
        f.P(59, 'Self Tp', 'TP', { ReportsTo: 'self.tp@mg.test' }),
      ]);
      const UA2 = UA.concat(['gone.sdm@mg.test', 'loop.a@mg.test', 'loop.b@mg.test', 'self.tp@mg.test', 'orphan.tp@mg.test', 'dangle.tp@mg.test', 'under.left@mg.test', 'dupe.one@mg.test']
        .map(e => ({ UserEmail: e })));
      const d = Object.fromEntries(pdpCheckIdentity({ people: dirty, userAssignments: UA2, leadership, today }).map(c => [c.key, c]));
      _assertEqual(d.noWorkEmail.sample.includes('Nomail Tp'), true, 'AC10 noWorkEmail');
      _assertEqual(d.duplicateWorkEmail.count, 1, 'AC10 duplicateWorkEmail');
      _assertEqual(d.unknownWorkEmail.sample.some(s => s.startsWith('Stranger Tp')), true, 'AC10 unknownWorkEmail');
      _assertEqual(d.noReportsTo.sample.includes('Orphan Tp'), true, 'AC10 noReportsTo');
      _assertEqual(d.danglingReportsTo.sample.some(s => s.startsWith('Dangle Tp')), true, 'AC10 danglingReportsTo');
      _assertEqual(d.inactiveManager.sample.some(s => s.startsWith('Under Left')), true, 'AC10 inactiveManager');
      _assertEqual(d.chainCycle.sample.includes('Loop A'), true, 'AC10 chainCycle');
      _assertEqual(d.noCsd.sample.includes('Orphan Tp'), true, 'AC10 noCsd');
      _assertEqual(d.selfReport.sample.includes('Self Tp'), true, 'AC10 selfReport');
    },
  },
  {
    name: 'N-433 AC12 pdpEligibleManagers / pdpWouldCycle (Org Chart editor rules)',
    fn: function () {
      const f = _pdpFx();
      const m = pdpEligibleManagers(f.all, f.stp.id);
      _assertEqual(m.map(x => x.level + ':' + x.name), ['CSD:Cara Csd', 'SDM:Sam Sdm'], 'AC12 CSD / SDM / STP only, level order, self excluded');
      _assertEqual(pdpEligibleManagers(f.all.concat([f.P(60, 'No Mail', 'SDM', { WorkEmail: '' })]), '').length, 3, 'AC12 a manager needs a WorkEmail');
      _assertEqual(pdpWouldCycle(f.all, f.sdm.id, f.sdm.WorkEmail), true, 'AC12 self-report is a loop');
      _assertEqual(pdpWouldCycle(f.all, f.csd.id, f.tp3.WorkEmail), true, 'AC12 CSD under their own descendant is a loop');
      _assertEqual(pdpWouldCycle(f.all, f.tp1.id, f.csd.WorkEmail), false, 'AC12 a normal move');
      _assertEqual(pdpWouldCycle(f.all, f.tp1.id, 'leader@mg.test'), false, 'AC12 an email outside People is not a loop');
      _assertEqual(pdpWouldCycle(f.all, f.tp1.id, ''), false, 'AC12 blank');
    },
  },
  {
    name: 'N-433 AC13 delivery-staff ReportsTo does not change the Org Chart grouping input',
    fn: function () {
      const f = _pdpFx();
      const internal = [{ id: '90', EmployeeName: 'Mia Marketing', StaffType: CONFIG.STAFF_TYPE_INTERNAL, StaffFunction: CONFIG.INTERNAL_FUNCTIONS[0], IsActive: true, ReportsTo: 'leader@mg.test' }];
      const before = groupInternalByFunction(internal.concat(f.all.map(p => Object.assign({}, p, { ReportsTo: '' }))));
      const after = groupInternalByFunction(internal.concat(f.all));
      _assertEqual(after.map(g => [g[0], g[1].map(p => p.EmployeeName)]), before.map(g => [g[0], g[1].map(p => p.EmployeeName)]), 'AC13 deployable rows never enter function bubbles');
    },
  }
);