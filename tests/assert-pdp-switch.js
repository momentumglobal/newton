// tests/assert-pdp-switch.js — PDP Off / Pilot / On switch and access gate (N-445 / PDP-13).
// Loads AFTER tests/assert-pdp-identity.js (reuses _pdpFx) and pushes into ASSERTIONS.

const _PDPS_TODAY = new Date('2026-11-05T12:00:00Z');

function _pdpsFx() {
  const f = _pdpFx();
  const emails = { cara: f.csd.WorkEmail, sam: f.sdm.WorkEmail, stu: f.stp.WorkEmail, tia: f.tp1.WorkEmail, tom: f.tp2.WorkEmail, pat: f.ptp.WorkEmail, deep: f.tp3.WorkEmail };
  const gate = (mode, pilot, email, role, hasRecords, people) =>
    pdpAccess({ mode, pilot, people: people || f.all, email, role: role || 'talent_partner', hasRecords: !!hasRecords, today: _PDPS_TODAY });
  return { f, e: emails, gate };
}

ASSERTIONS.push(
  {
    name: 'N-445 AC1 config: modes, columns, pdpSwitch is Admin only',
    fn: function () {
      _assertEqual(CONFIG.PDP.MODES, ['Off', 'Pilot', 'On'], 'AC1 modes, Off first (fail-closed default)');
      _assertEqual(CONFIG.PDP.SETTINGS, { MODE: 'PDPMode', PILOT: 'PDPPilot', REMINDERS_FROM: 'PDPRemindersFrom' }, 'AC1 AppSettings column names');   // N-441 added REMINDERS_FROM
      _assertEqual(CONFIG.ROLE_CAPABILITIES.pdpSwitch, ['admin'], 'AC1 pdpSwitch Admin only');
      _assertEqual(roleCan('people_ops', 'pdpSwitch'), false, 'AC1 People Ops cannot flip the switch');
      _assertEqual(CONFIG.ROLE_CAPABILITIES.pdpAdmin, ['admin', 'people_ops'], 'AC1 pdpAdmin unchanged');
    },
  },
  {
    name: 'N-445 AC2-AC3 pdpNormaliseMode / pdpParsePilot / pdpFormatPilot',
    fn: function () {
      ['Off', 'off', ' OFF '].forEach(v => _assertEqual(pdpNormaliseMode(v), 'Off', 'AC2 ' + v));
      _assertEqual(pdpNormaliseMode('pilot'), 'Pilot', 'AC2 pilot');
      _assertEqual(pdpNormaliseMode('ON'), 'On', 'AC2 on');
      [null, undefined, '', 'maybe', 'Live'].forEach(v => _assertEqual(pdpNormaliseMode(v), 'Off', 'AC2 fail closed for ' + v));
      const parsed = pdpParsePilot(' Tia.Tp@mg.test;;tia.tp@mg.test\nnot-an-email; Sam.Sdm@mg.test ');
      _assertEqual(parsed, ['tia.tp@mg.test', 'sam.sdm@mg.test'], 'AC3 trimmed, lower-cased, deduped, invalid dropped');
      _assertEqual(pdpParsePilot(null), [], 'AC3 null');
      const text = pdpFormatPilot(parsed);
      _assertEqual(text, 'tia.tp@mg.test;sam.sdm@mg.test', 'AC3 stored form');
      _assertEqual(pdpFormatPilot(pdpParsePilot(text)), text, 'AC3 format(parse(x)) is stable');
    },
  },
  {
    name: 'N-445 AC4 pdpPilotCandidates: in scope, started, unique WorkEmail',
    fn: function () {
      const { f } = _pdpsFx();
      const extra = [
        f.P(20, 'Ian Internal', 'TP', { StaffType: CONFIG.STAFF_TYPE_INTERNAL }),
        f.P(21, 'Pho Placeholder', 'TP', { IsPlaceholder: true }),
        f.P(22, 'Fay Future', 'TP', { StartDate: '2027-03-01' }),
        f.P(23, 'No Mail', 'TP', { WorkEmail: '' }),
        f.P(24, 'Dup One', 'TP', { WorkEmail: 'dup@mg.test' }),
        f.P(25, 'Dup Two', 'TP', { WorkEmail: 'dup@mg.test' }),
      ];
      const names = pdpPilotCandidates(f.all.concat(extra), _PDPS_TODAY).map(c => c.name);
      _assertEqual(names, ['Deep Tp', 'Pat Ptp', 'Sam Sdm', 'Stu Stp', 'Tia Tp', 'Tom Tp'], 'AC4 candidates, by name; no CSD / internal / placeholder / future / no email / duplicate email');
      const c = pdpPilotCandidates(f.all, _PDPS_TODAY).find(x => x.name === 'Tia Tp');
      _assertEqual([c.id, c.level, c.email], ['4', 'TP', 'tia.tp@mg.test'], 'AC4 candidate shape');
    },
  },
  {
    name: 'N-445 AC5 gate Off: Admin and People Ops preview, everyone else none',
    fn: function () {
      const { e, gate } = _pdpsFx();
      _assertEqual(gate('Off', [], 'boss@mg.test', 'admin').state, 'preview', 'AC5 Admin');
      _assertEqual(gate('Off', [], 'pat@mg.test', 'people_ops').state, 'preview', 'AC5 People Ops');
      [['talent_partner', e.tia], ['delivery_manager', e.sam], ['delivery_manager', e.cara], ['leadership', 'boss@mg.test']].forEach(([role, email]) =>
        _assertEqual(gate('Off', [e.tia], email, role, true).state, 'none', 'AC5 ' + role + ' none even with records and a pilot entry'));
    },
  },
  {
    name: 'N-445 AC6 gate Pilot: pilot person, their reviewers, records holders, Admin preview',
    fn: function () {
      const { e, gate } = _pdpsFx();
      const pilot = [e.tia];
      _assertEqual(gate('Pilot', pilot, e.tia).state, 'live', 'AC6 pilot person');
      _assertEqual(gate('Pilot', pilot, e.sam, 'delivery_manager').state, 'live', 'AC6 their line manager');
      _assertEqual(gate('Pilot', pilot, e.cara, 'delivery_manager').state, 'live', 'AC6 their CSD');
      _assertEqual(gate('Pilot', pilot, e.tom).state, 'none', 'AC6 a TP outside the pilot');
      _assertEqual(gate('Pilot', pilot, e.stu).state, 'none', 'AC6 an STP who does not manage Tia');
      _assertEqual(gate('Pilot', pilot, e.tom, 'talent_partner', true).state, 'live', 'AC6 removed from the pilot but has records');
      _assertEqual(gate('Pilot', pilot, e.tom, 'talent_partner', true).reason, 'has-records', 'AC6 reason');
      _assertEqual(gate('Pilot', [e.deep], e.sam, 'delivery_manager').state, 'none', 'AC6 Stu manages Deep; Sam is not a reviewer');
      _assertEqual(gate('Pilot', [e.deep], e.stu).state, 'live', 'AC6 line manager one level down');
      _assertEqual(gate('Pilot', [e.deep], e.cara, 'delivery_manager').state, 'live', 'AC6 first CSD up the chain');
      _assertEqual(gate('Pilot', pilot, 'boss@mg.test', 'admin').state, 'preview', 'AC6 Admin outside the pilot previews');
      _assertEqual(gate('Pilot', pilot, 'boss@mg.test', 'people_ops').state, 'preview', 'AC6 People Ops outside the pilot previews');
      _assertEqual(gate('Pilot', pilot, e.tia, 'admin').state, 'live', 'AC6 Admin who is a pilot person is live');
      _assertEqual(gate('Pilot', pilot, 'boss@mg.test', 'leadership').state, 'none', 'AC6 Leadership none');
      _assertEqual(gate('Pilot', ['ghost@mg.test'], e.tia).state, 'none', 'AC6 a pilot email that matches nobody gives nobody access');
      _assertEqual(gate('Pilot', e.tia + ';' + e.tom, e.tom).state, 'live', 'AC6 raw column text works');
      _assertEqual(gate('Pilot', [e.cara], e.cara, 'delivery_manager').state, 'none', 'AC6 a CSD in the pilot list is not a pilot person (reviewers only)');
    },
  },
  {
    name: 'N-445 AC7 gate On: everyone in scope and their reviewers; nobody else',
    fn: function () {
      const { f, e, gate } = _pdpsFx();
      [e.tia, e.tom, e.sam, e.pat].forEach(em => _assertEqual(gate('On', [], em).state, 'live', 'AC7 in scope ' + em));
      _assertEqual(gate('On', [], e.cara, 'delivery_manager').state, 'live', 'AC7 CSD is a reviewer of in-scope people');
      _assertEqual(gate('On', [], 'boss@mg.test', 'admin').state, 'live', 'AC7 Admin');
      _assertEqual(gate('On', [], 'boss@mg.test', 'people_ops').state, 'live', 'AC7 People Ops');
      _assertEqual(gate('On', [], 'boss@mg.test', 'leadership').state, 'none', 'AC7 Leadership');
      const internal = f.P(30, 'Ian Internal', 'TP', { StaffType: CONFIG.STAFF_TYPE_INTERNAL });
      _assertEqual(gate('On', [], internal.WorkEmail, 'staff', false, f.all.concat([internal])).state, 'none', 'AC7 internal staff');
      _assertEqual(gate('On', [], '', 'talent_partner').state, 'none', 'AC7 no email');
    },
  },
  {
    name: 'N-445 AC8 gate fails closed',
    fn: function () {
      const { e, gate } = _pdpsFx();
      _assertEqual(gate('bogus', [e.tia], e.tia).state, 'none', 'AC8 unknown mode, non-admin');
      _assertEqual(gate(undefined, [e.tia], e.tia).state, 'none', 'AC8 missing mode');
      _assertEqual(gate('bogus', [], 'boss@mg.test', 'admin').state, 'preview', 'AC8 unknown mode is Off for Admin');
      _assertEqual(pdpAccess().state, 'none', 'AC8 no arguments');
      _assertEqual(pdpAccess({ mode: 'On' }).state, 'none', 'AC8 no people, no role');
    },
  },
  {
    name: 'N-445 AC9 pdpEngineScope',
    fn: function () {
      const { f, e } = _pdpsFx();
      const names = rows => rows.map(p => p.EmployeeName).sort();
      _assertEqual(pdpEngineScope('Off', [e.tia], f.all, _PDPS_TODAY), [], 'AC9 Off generates for nobody');
      _assertEqual(names(pdpEngineScope('Pilot', [e.tia, e.cara, 'ghost@mg.test'], f.all, _PDPS_TODAY)), ['Tia Tp'], 'AC9 Pilot: the in-scope pilot person only; a CSD or unknown email adds nothing');
      _assertEqual(pdpEngineScope('Pilot', [], f.all, _PDPS_TODAY), [], 'AC9 empty pilot');
      _assertEqual(names(pdpEngineScope('On', [], f.all, _PDPS_TODAY)), ['Deep Tp', 'Pat Ptp', 'Sam Sdm', 'Stu Stp', 'Tia Tp', 'Tom Tp'], 'AC9 On: everyone in scope');
      const dup = [f.P(40, 'Dup One', 'TP', { WorkEmail: 'dup@mg.test' }), f.P(41, 'Dup Two', 'TP', { WorkEmail: 'dup@mg.test' })];
      _assertEqual(pdpEngineScope('Pilot', ['dup@mg.test'], dup, _PDPS_TODAY), [], 'AC9 an ambiguous email resolves to nobody');
      _assertEqual(pdpEngineScope('nonsense', [e.tia], f.all, _PDPS_TODAY), [], 'AC9 unknown mode is Off');
    },
  },
  {
    name: 'N-445 AC10-AC11 api-pdp.js: switch read, guarded write, one gate entry point',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      const fn = (name, next) => { const a = src.indexOf('async function ' + name); const b = next ? src.indexOf('async function ' + next) : src.length; return src.slice(a, b); };
      const gateSrc = fn('resolvePdpGate', '_pdpSetupWho');   // N-437: bounded, so later functions in the file are not counted
      _assertEqual((gateSrc.match(/getPdpMeetings\(/g) || []).length, 1, 'AC10 one records read');
      _assertEqual(gateSrc.indexOf('getPdpMeetings(') > gateSrc.indexOf("gate.state === 'none'") && gateSrc.indexOf("gate.state === 'none'") > -1, true, 'AC10 only for a user still at none');
      _assertEqual(/sw\.mode === CONFIG\.PDP\.MODES\[1\]/.test(gateSrc), true, 'AC10 only in Pilot mode');
      _assertEqual(/_ensureGhostGate\(\)/.test(gateSrc) && /pdpEffectiveEmail\(/.test(gateSrc) && /getGhostUser\(\)/.test(gateSrc), true, 'AC10 Ghost-aware identity');
      const w = fn('writePdpSwitch', 'resolvePdpGate');
      _assertEqual(/roleCan\(role, 'pdpSwitch'\)/.test(w), true, 'AC11 write is gated on pdpSwitch');
      _assertEqual(/CONFIG\.PDP\.MODES\.includes\(m\)/.test(w), true, 'AC11 mode validated');
      _assertEqual(/createItem\('AppSettings', \{ Title: 'config'/.test(w) && /updateItem\('AppSettings', row\.id, fields\)/.test(w), true, 'AC11 updates or creates the config row');
      _assertEqual(/graphRequest|deleteItem/.test(_pdpApiNoTeamDelete(src)), false, 'AC11 still no raw Graph / delete');
      const r = fn('readPdpSwitch', 'writePdpSwitch');
      _assertEqual(/pdpNormaliseMode\(/.test(r) && /pdpParsePilot\(/.test(r), true, 'AC11 read normalises (fail closed)');
    },
  },
  {
    name: 'N-445 AC12 Config Panel PDP tab: registered, Admin only, escaped, no inline handlers or hex',
    fn: function () {
      const adm = ALL_SOURCES['admin.js'], tab = ALL_SOURCES['pdp-admin.js'];
      _assertEqual(/'pdp'\]/.test(adm) && /pdp:\s+'PDP'/.test(adm) && /buildPdpTab\(\)/.test(adm), true, 'AC12 admin.js registers and dispatches the tab');
      _assertEqual(/roleCan\(_resolvedRole, 'pdpSwitch'\)/.test(tab), true, 'AC12 tab gated on pdpSwitch');
      _assertEqual(/\bon(click|change|input)=|style="/.test(tab), false, 'AC12 no inline handlers or styles');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(tab.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')), false, 'AC12 no hex in JS');
      _assertEqual(/act(On)?\([^)]*\)\.trim\(\)/.test(tab), false, 'AC12 act() keeps its leading space (a trimmed attribute fuses onto the one before it)');
      _assertEqual(/escHtml\(/.test(tab) && /escAttr\(/.test(tab), true, 'AC12 output escaped');
      _assertEqual(/registerActions\(\{\s*pdpaSave,\s*pdpaFilter,\s*pdpaCount,?\s*\}\)/.test(tab), true, 'AC12 actions registered once');
      _assertEqual(/const payload = \{ mode, pilot \};/.test(tab) && /writePdpSwitch\(payload\)/.test(tab) && /confirmModal\(/.test(tab), true, 'AC12 save goes through writePdpSwitch; switching On confirms');   // N-441: payload may add remindersFrom
      _assertEqual(_PDP_GUARD_RE.test(tab) || _PDP_GUARD_RE.test(adm), false, 'AC12 the tab handles no PDP records (PDP-D12 scan)');
    },
  },
  {
    name: 'N-445 AC13 PDP-D12: switch columns stay out of MCP, Command Bar and every other file',
    fn: function () {
      const allow = ['config.js', 'pdp-identity.js', 'api-pdp.js', 'pdp-admin.js'];
      const offenders = Object.keys(ALL_SOURCES).filter(f => !allow.includes(f) && /PDPMode|PDPPilot|CONFIG\.PDP\.SETTINGS/.test(ALL_SOURCES[f]));
      _assertEqual(offenders, [], 'AC13 only the switch files name the columns');
      _assertEqual(CONFIG.MCP.allowedLists.includes('AppSettings'), false, 'AC13 AppSettings is not an MCP list');
      _assertEqual(CONFIG.MCP.scripts.some(f => /pdp/.test(f)), false, 'AC13 no PDP file in the MCP bundle');
    },
  },
  {
    name: 'N-445 AC14 reporting.html loads the PDP files in order',
    fn: function () {
      const h = ALL_HTML['reporting.html'];
      const at = f => h.indexOf('js/' + f + '"');
      const order = ['project-team.js', 'pdp-identity.js', 'pdp-data.js', 'graph-client.js', 'api.js', 'api-headcount.js', 'api-pdp.js', 'analytics.js', 'sla-admin.js', 'pdp-admin.js', 'admin.js'];
      order.forEach(f => _assertEqual(at(f) > -1, true, 'AC14 ' + f + ' is loaded'));
      for (let i = 1; i < order.length; i++) _assertEqual(at(order[i]) > at(order[i - 1]), true, 'AC14 ' + order[i] + ' after ' + order[i - 1]);
    },
  }
);