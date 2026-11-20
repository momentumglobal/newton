// tests/assert-onboarding.js — My Onboarding data model, switch and access rules (N-496 / ONB-1).
// Loads AFTER tests/assert-pdp-identity.js (reuses _pdpFx) and pushes into ASSERTIONS. The api / tab
// files are not loaded in the vm (they need Graph and the DOM); their contract is checked on the source
// text, as assert-pdp-switch.js does, and those checks skip in the browser harness (no ALL_SOURCES).

function _onbFx() {
  const f = _pdpFx();   // Cara Csd (1) <- Sam Sdm (2) <- Stu Stp (3), Tia Tp (4); Tom Tp (5), Pat Ptp (6) -> Cara; Deep Tp (7) -> Stu
  const plan = (personId, extra) => Object.assign({ id: 'p' + personId, PersonID: personId, Track: 'TP', Status: 'Active', BuddyEmail: '' }, extra);
  return { f, plan };
}

function _onbSrc(file) {
  if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (Node runner only)');
  return ALL_SOURCES[file].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
}

ASSERTIONS.push(
  {
    name: 'N-496 AC1 config: CONFIG.ONBOARDING, person record type, SWITCH_TYPES, onbSwitch',
    fn: function () {
      const O = CONFIG.ONBOARDING;
      ['RECORD_TYPE', 'MODES', 'SETTINGS', 'EMAIL_SEP', 'SCOPE_LEVELS', 'TRACKS', 'DEFAULT_TRACK', 'OWNERS', 'DEFAULT_OWNER',
        'PEOPLE_OPS_FALLBACK_LABEL', 'STEP_MODES', 'LEVEL_TAGS', 'DUE_OFFSET', 'PLAN_LIST', 'PLAN_STATUSES', 'PLAN_ACTIVE', 'PLAN_FIELDS']
        .forEach(k => _assertEqual(k in O, true, 'AC1 CONFIG.ONBOARDING.' + k));
      _assertEqual(O.MODES, ['Off', 'Pilot', 'On'], 'AC1 modes, Off first');
      _assertEqual(O.SETTINGS, { MODE: 'OnboardingMode', PILOT: 'OnboardingPilot' }, 'AC1 AppSettings columns');
      _assertEqual(O.OWNERS.map(o => o.key), ['Employee', 'LM', 'CSD', 'PeopleOps', 'Ops', 'Buddy'], 'AC1 owner keys');
      _assertEqual(O.TRACKS.map(t => t.key), [O.DEFAULT_TRACK], 'AC1 one track (TP), SDM is v2');
      _assertEqual(O.RECORD_TYPE, 'person', 'AC1 record type');
      _assertEqual(CONFIG.CHECKLISTS.RECORD_TYPES, ['project', 'role', 'person'], 'AC1 RECORD_TYPES');
      _assertEqual(CONFIG.CHECKLISTS.SWITCH_TYPES, ['project', 'role'], 'AC1 SWITCH_TYPES');
      _assertEqual(CONFIG.ROLE_CAPABILITIES.onbSwitch, ['admin'], 'AC1 onbSwitch Admin only');
      _assertEqual(roleCan('people_ops', 'onbSwitch'), false, 'AC1 People Ops cannot flip it');
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding/.test(s)), false, 'AC16 no onboarding file in the MCP bundle');
    },
  },
  {
    name: 'N-496 AC3-AC5 the watermark switch, starter folders and FIELD_ALIASES never take "person"',
    fn: function () {
      _assertEqual(FIELD_ALIASES.OnboardingPlans, {}, 'AC5 OnboardingPlans registered as {}');
      const adm = _onbSrc('checklist-admin.js');
      _assertEqual(/CHECKLISTS\.RECORD_TYPES/.test(adm), false, 'AC3 checklist-admin.js iterates SWITCH_TYPES only');
      _assertEqual((adm.match(/CHECKLISTS\.SWITCH_TYPES/g) || []).length, 4, 'AC3 switch cards, toggle guard, picker, select guard');
      const api = _onbSrc('api-checklists.js');
      const set = api.slice(api.indexOf('async function setChecklistSettings'));
      _assertEqual(/SWITCH_TYPES\.includes\(_ckRecordType\(recordType\)\)/.test(set) && /throw new Error\('Onboarding uses its own switch/.test(set), true, 'AC4 setChecklistSettings refuses person');
      _assertEqual(/fields\/Title eq '\$\{odataStr\(type\)\}'/.test(api) && /fields\/RecordId eq \$\{_ckInt\(recordId\)\}/.test(api), true, 'AC4 progress filter Title + RecordId (person accepted by _ckRecordType)');
      const sf = _onbSrc('api-starter-folders.js');
      _assertEqual(/hasOwnProperty\.call\(CONFIG\.STARTER_FOLDERS\.PARENT_PATH, recordType\)/.test(sf) && !/CHECKLISTS\.RECORD_TYPES/.test(sf), true, 'AC4 _sfRecordType guards on PARENT_PATH');
      _assertEqual(Object.keys(CONFIG.STARTER_FOLDERS.PARENT_PATH), ['project', 'role'], 'AC4 PARENT_PATH has no person');
    },
  },
  {
    name: 'N-496 AC6 onbNormaliseMode / onbNormaliseOwner',
    fn: function () {
      _assertEqual(onbNormaliseMode('pilot'), 'Pilot', 'AC6 pilot');
      _assertEqual(onbNormaliseMode(' ON '), 'On', 'AC6 on');
      [null, undefined, '', 'x', 'Live'].forEach(v => _assertEqual(onbNormaliseMode(v), 'Off', 'AC6 fail closed for ' + v));
      _assertEqual(onbNormaliseOwner('People Ops'), 'PeopleOps', 'owner with a space');
      _assertEqual(onbNormaliseOwner(' lm '), 'LM', 'owner case-insensitive');
      _assertEqual(onbNormaliseOwner('Manager'), '', 'unknown owner');
    },
  },
  {
    name: 'N-496 AC7 onbPilotCandidates: TP grades, future starters in, unique WorkEmail',
    fn: function () {
      const { f } = _onbFx();
      const extra = [
        f.P(20, 'Ian Internal', 'TP', { StaffType: CONFIG.STAFF_TYPE_INTERNAL }),
        f.P(21, 'Pho Placeholder', 'TP', { IsPlaceholder: true }),
        f.P(22, 'Fay Future', 'TP', { StartDate: '2099-03-01' }),
        f.P(23, 'Ina Inactive', 'TP', { IsActive: false }),
        f.P(24, 'Dup One', 'TP', { WorkEmail: 'dup@mg.test' }),
        f.P(25, 'Dup Two', 'TP', { WorkEmail: 'dup@mg.test' }),
        f.P(26, 'No Mail', 'TP', { WorkEmail: '' }),
      ];
      const c = onbPilotCandidates(f.all.concat(extra));
      _assertEqual(c.map(x => x.name), ['Deep Tp', 'Fay Future', 'Pat Ptp', 'Stu Stp', 'Tia Tp', 'Tom Tp'], 'AC7 no CSD / SDM / internal / placeholder / inactive / duplicate / no email; future starter in');
      const fay = c.find(x => x.name === 'Fay Future');
      _assertEqual([fay.id, fay.level, fay.email, fay.startDate], ['22', 'TP', 'fay.future@mg.test', '2099-03-01'], 'AC7 candidate shape');
      _assertEqual(onbPilotRows(f.all.concat(extra), 'TIA.TP@mg.test; sam.sdm@mg.test;dup@mg.test').map(p => p.EmployeeName), ['Tia Tp'], 'pilot rows: in scope and unique only');
    },
  },
  {
    name: 'N-496 AC11 onbPlanParties: line manager and CSD live from ReportsTo, buddy by email',
    fn: function () {
      const { f, plan } = _onbFx();
      let p = onbPlanParties(plan(4, { BuddyEmail: 'Tom.Tp@mg.test' }), f.all);
      _assertEqual([p.employee.EmployeeName, p.lineManager.EmployeeName, p.csd.EmployeeName, p.buddy.EmployeeName], ['Tia Tp', 'Sam Sdm', 'Cara Csd', 'Tom Tp'], 'AC11 parties');
      const moved = f.all.map(x => (x.id === '4' ? Object.assign({}, x, { ReportsTo: f.stp.WorkEmail }) : x));
      p = onbPlanParties(plan(4), moved);
      _assertEqual([p.lineManager.EmployeeName, p.csd.EmployeeName], ['Stu Stp', 'Cara Csd'], 'AC11 ReportsTo change moves the line manager');
      _assertEqual(p.buddy, null, 'AC11 blank BuddyEmail -> null');
      _assertEqual(onbPlanParties(plan(4, { BuddyEmail: 'nobody@mg.test' }), f.all).buddy, null, 'AC11 unmatched buddy -> null');
      _assertEqual(onbPlanParties(plan(99), f.all).employee, null, 'unknown PersonID -> no employee');
    },
  },
  {
    name: 'N-496 AC8 onbStepOwner: People Ops resolves to the CSD until a people_ops user exists',
    fn: function () {
      const { f, plan } = _onbFx();
      const parties = onbPlanParties(plan(4, { BuddyEmail: f.tp2.WorkEmail }), f.all);
      let o = onbStepOwner({ step: { Owner: 'PeopleOps' }, parties, peopleOpsActive: false });
      _assertEqual([o.key, o.label, o.person && o.person.EmployeeName], ['PeopleOps', 'People Ops — CSD for now', 'Cara Csd'], 'AC8 fallback');
      o = onbStepOwner({ step: { Owner: 'PeopleOps' }, parties, peopleOpsActive: true });
      _assertEqual([o.label, o.person], ['People Ops', null], 'AC8 live People Ops');
      _assertEqual(onbStepOwner({ step: { Owner: 'LM' }, parties }).person.EmployeeName, 'Sam Sdm', 'LM');
      _assertEqual(onbStepOwner({ step: { Owner: 'Buddy' }, parties }).person.EmployeeName, 'Tom Tp', 'Buddy');
      _assertEqual(onbStepOwner({ step: { Owner: 'Ops' }, parties }).person, null, 'Ops has no person');
      _assertEqual(onbStepOwner({ step: { Owner: '' }, parties }).key, 'Employee', 'blank owner -> Employee');
    },
  },
  {
    name: 'N-496 AC9 onbCanTick truth table',
    fn: function () {
      const owners = CONFIG.ONBOARDING.OWNERS.map(o => o.key);
      const tick = (rel, owner, active, status) => onbCanTick({ step: { Owner: owner }, relations: rel, peopleOpsActive: !!active, planStatus: status || 'Active' });
      ['admin', 'lm', 'csd'].forEach(r => owners.forEach(o => _assertEqual(tick([r], o), true, `AC9 ${r} ticks ${o}`)));
      owners.forEach(o => _assertEqual(tick(['employee'], o), o === 'Employee', 'AC9 employee ' + o));
      owners.forEach(o => _assertEqual(tick(['buddy'], o), o === 'Buddy', 'AC9 buddy ' + o));
      owners.forEach(o => _assertEqual(tick(['peopleops'], o, true), o === 'PeopleOps', 'AC9 people_ops (active) ' + o));
      _assertEqual(tick(['peopleops'], 'PeopleOps', false), false, 'AC9 people_ops while none active');
      _assertEqual(tick(['employee', 'buddy'], 'Ops'), false, 'AC9 Ops steps: admin / lm / csd only');
      ['Complete', 'Cancelled', 'blank'].forEach(s => ['admin', 'lm', 'employee'].forEach(r =>
        _assertEqual(onbCanTick({ step: { Owner: r === 'employee' ? 'Employee' : 'LM' }, relations: new Set([r]), planStatus: s === 'blank' ? '' : s }), false, `AC9 ${r} cannot tick on a ${s} plan`)));
    },
  },
  {
    name: 'N-496 AC10 onbRelations and onbAccess (Off / Pilot / On)',
    fn: function () {
      const { f, plan } = _onbFx();
      const plans = [plan(4, { BuddyEmail: f.tp2.WorkEmail })];
      const gate = (mode, email, role, extra) => onbAccess(Object.assign({ mode, pilot: [f.tp1.WorkEmail], people: f.all, plans, email, role: role || 'talent_partner' }, extra)).state;
      const rel = (email, role, poa) => [...onbRelations({ plan: plans[0], people: f.all, email, role: role || 'talent_partner', peopleOpsActive: !!poa })].sort();
      _assertEqual(rel(f.tp1.WorkEmail), ['employee'], 'relation employee');
      _assertEqual(rel(f.sdm.WorkEmail, 'delivery_manager'), ['lm'], 'relation lm');
      _assertEqual(rel(f.csd.WorkEmail, 'admin'), ['admin', 'csd'], 'relation csd (a CSD holds Admin)');
      _assertEqual(rel(f.tp2.WorkEmail), ['buddy'], 'relation buddy');
      _assertEqual(rel('pops@mg.test', 'people_ops', true), ['peopleops'], 'relation people ops');
      _assertEqual(rel('pops@mg.test', 'people_ops', false), [], 'no people ops relation while none active');

      _assertEqual(gate('Off', 'admin@mg.test', 'admin'), 'preview', 'AC10 Off admin preview');
      [f.tp1, f.sdm, f.csd, f.tp2].forEach(p => _assertEqual(gate('Off', p.WorkEmail), 'none', 'AC10 Off none for ' + p.EmployeeName));

      _assertEqual(gate('Pilot', f.tp1.WorkEmail), 'live', 'AC10 Pilot joiner live');
      _assertEqual(gate('Pilot', f.sdm.WorkEmail, 'delivery_manager'), 'live', 'AC10 Pilot LM live');
      _assertEqual(gate('Pilot', f.csd.WorkEmail, 'talent_partner'), 'live', 'AC10 Pilot CSD live (by relation, not role)');
      _assertEqual(gate('Pilot', f.tp2.WorkEmail), 'live', 'AC10 Pilot buddy live');
      _assertEqual(gate('Pilot', f.tp3.WorkEmail), 'none', 'AC10 Pilot unrelated TP none');
      _assertEqual(gate('Pilot', 'lead@mg.test', 'leadership'), 'none', 'AC10 Pilot Leadership with no relation none');
      _assertEqual(gate('Pilot', 'admin@mg.test', 'admin'), 'live', 'AC10 Pilot admin live');
      _assertEqual(gate('Pilot', f.sdm.WorkEmail, 'delivery_manager', { plans: [] }), 'live', 'Pilot LM of a pilot joiner live before the plan exists');

      _assertEqual(gate('On', f.tp3.WorkEmail), 'live', 'AC10 On in-scope TP live');
      _assertEqual(gate('On', 'lead@mg.test', 'leadership'), 'none', 'AC10 On Leadership with no relation none');
      _assertEqual(gate('On', 'admin@mg.test', 'admin'), 'live', 'AC10 On admin live');
      _assertEqual(gate('On', f.sdm.WorkEmail, 'delivery_manager'), 'live', 'On LM live through the plan');
      _assertEqual(gate('On', f.sdm.WorkEmail, 'delivery_manager', { plans: [] }), 'none', 'On SDM with no plan relation none (not in SCOPE_LEVELS)');
      _assertEqual(gate('On', f.sdm.WorkEmail, 'delivery_manager', { plans: [plan(4, { Status: 'Complete' })] }), 'live', 'a Complete plan still grants read access');
      _assertEqual(gate('Maybe', f.tp1.WorkEmail), 'none', 'unknown mode is Off');
    },
  },
  {
    name: 'N-496 AC12 onbValidateStep',
    fn: function () {
      const ok = { owner: 'Employee', dueOffsetDays: 0, stepMode: 'Guided', levelTag: '', contentUrl: '' };
      _assertEqual(onbValidateStep(ok).ok, true, 'AC12 valid step');
      _assertEqual(onbValidateStep(Object.assign({}, ok, { dueOffsetDays: '-30', stepMode: 'self-guided', levelTag: 'Foundation', contentUrl: 'https://momentumglobal.sharepoint.com/x%20y.pptx' })).ok, true, 'AC12 edge values accepted');
      const bad = (patch, field) => _assertEqual(Object.keys(onbValidateStep(Object.assign({}, ok, patch)).errors), [field], 'AC12 rejects ' + JSON.stringify(patch).slice(0, 60));
      bad({ owner: '' }, 'owner');
      bad({ owner: 'Manager' }, 'owner');
      bad({ dueOffsetDays: 2.5 }, 'dueOffsetDays');
      bad({ dueOffsetDays: -31 }, 'dueOffsetDays');
      bad({ dueOffsetDays: 61 }, 'dueOffsetDays');
      bad({ dueOffsetDays: '' }, 'dueOffsetDays');
      bad({ stepMode: 'guided-ish' }, 'stepMode');
      bad({ levelTag: 'Senior' }, 'levelTag');
      bad({ contentUrl: 'javascript:alert(1)' }, 'contentUrl');
      bad({ contentUrl: 'http://example.com/a' }, 'contentUrl');
      bad({ contentUrl: 'https://x.test/' + 'a'.repeat(CONFIG.CHECKLISTS.LABEL_MAX) }, 'contentUrl');
    },
  },
  {
    name: 'N-496 AC13 onbCleanPlanFields',
    fn: function () {
      const out = onbCleanPlanFields({ Title: ' Tia.Tp@MG.test ', PersonID: '4', Track: 'TP', Status: 'Active', StartedByEmail: 'Cara.Csd@mg.test', StartedAt: '2026-11-20', BuddyEmail: 'TOM.TP@mg.test', Extra: 'x', id: 9 });
      _assertEqual(out, { Title: 'tia.tp@mg.test', PersonID: 4, Track: 'TP', Status: 'Active', StartedByEmail: 'cara.csd@mg.test', StartedAt: '2026-11-20T12:00:00Z', BuddyEmail: 'tom.tp@mg.test' }, 'AC13 own columns only, lower-cased, date-only at midday UTC');
      _assertEqual(Object.keys(out), CONFIG.ONBOARDING.PLAN_FIELDS, 'AC13 exactly the seven columns');
      _assertEqual(onbCleanPlanFields({ Status: 'Complete' }), { Status: 'Complete' }, 'partial update sends only what changed');
      _assertEqual(onbCleanPlanFields({ BuddyEmail: '' }), { BuddyEmail: null }, 'blank buddy clears');
      const throws = (fields, label) => { let t = false; try { onbCleanPlanFields(fields); } catch (e) { t = true; } _assertEqual(t, true, 'AC13 rejects ' + label); };
      throws({ Track: 'SDM' }, 'unknown Track');
      throws({ Status: 'Paused' }, 'unknown Status');
      throws({ PersonID: 4.5 }, 'non-integer PersonID');
      throws({ PersonID: 'abc' }, 'text PersonID');
      throws({ Title: 'not-an-email' }, 'bad Title');
      throws({ StartedAt: 'soon' }, 'bad StartedAt');
    },
  },
  {
    name: 'N-496 AC14 api-onboarding.js: fail-closed switch read, Admin-only write, no tier-2 cache',
    fn: function () {
      const src = _onbSrc('api-onboarding.js');
      const r = src.slice(src.indexOf('async function readOnboardingSwitch'), src.indexOf('async function writeOnboardingSwitch'));
      _assertEqual(/onbNormaliseMode\(row \? row\[S\.MODE\] : null\)/.test(r) && /pdpParsePilot\(row \? row\[S\.PILOT\] : ''\)/.test(r), true, 'AC14 missing row / column -> Off, []');
      const w = src.slice(src.indexOf('async function writeOnboardingSwitch'), src.indexOf('async function getOnboardingPlans'));
      const gate = w.indexOf('_ensureGhostGate()'), cap = w.indexOf("roleCan(role, 'onbSwitch')"), write = w.indexOf('updateItem(');
      _assertEqual(gate > -1 && cap > gate && write > cap, true, 'AC14 Ghost gate, then onbSwitch check, then the write');
      _assertEqual(CONFIG.CACHE.persistentLists.includes('OnboardingPlans'), false, 'OnboardingPlans is never tier-2 cached');
      _assertEqual(/fields\/PersonID eq \$\{n\}/.test(src), true, 'plans filter on indexed PersonID');
    },
  },
  {
    name: 'N-496 AC15-AC16 Onboarding tab and load scope',
    fn: function () {
      const adm = _onbSrc('admin.js'), tab = _onbSrc('onboarding-admin.js');
      _assertEqual(/'onboarding'\]/.test(adm) && /buildOnboardingTab\(\)/.test(adm), true, 'AC15 admin.js registers and dispatches the tab');
      _assertEqual(/roleCan\(_resolvedRole, 'onbSwitch'\)\) return '<p>Access denied\.<\/p>'/.test(tab), true, 'AC15 Admin only');
      _assertEqual(/\bon(click|change|input)=|style="/.test(tab), false, 'AC15 no inline handlers or styles');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(tab), false, 'AC15 no hex in JS');
      _assertEqual(/act(On)?\([^)]*\)\.trim\(\)/.test(tab), false, 'AC15 act() keeps its leading space');
      _assertEqual(/escHtml\(/.test(tab) && /escAttr\(/.test(tab), true, 'AC15 output escaped');
      _assertEqual(/registerActions\(\{\s*onbaSave,\s*onbaFilter,\s*onbaCount,?\s*\}\)/.test(tab), true, 'AC15 actions registered once');
      _assertEqual(/writeOnboardingSwitch\(\{ mode, pilot \}\)/.test(tab) && /confirmModal\(/.test(tab) && /renderAdminTab\('onboarding'\)/.test(tab), true, 'AC15 save, confirm on the way to On, re-render');
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (Node runner only)');
      // N-497 widened the first three to people.html (the employee-record card) and admin.html (Data Health); the tab stays reporting.html only.
      const files = ['onboarding-config.js', 'onboarding-logic.js', 'api-onboarding.js', 'onboarding-admin.js'];
      Object.keys(ALL_HTML).forEach(h => files.forEach(js => _assertEqual(ALL_HTML[h].includes('src="js/' + js + '"'),
        h === 'reporting.html' || (js !== 'onboarding-admin.js' && (h === 'people.html' || h === 'admin.html')), `AC16 ${js} on ${h}`)));
      const rep = ALL_HTML['reporting.html'];
      const at = s => rep.indexOf('src="js/' + s + '"');
      _assertEqual(at('pdp-identity.js') < at('onboarding-config.js') && at('onboarding-config.js') < at('graph-client.js'), true, 'AC16 onboarding-config.js straight after pdp-identity.js');
      _assertEqual(at('api-checklists.js') < at('onboarding-logic.js') && at('onboarding-logic.js') < at('api-onboarding.js') && at('api-onboarding.js') < at('checklists.js'), true, 'AC16 logic + api straight after api-checklists.js');
      _assertEqual(at('pdp-admin.js') < at('onboarding-admin.js') && at('onboarding-admin.js') < at('admin.js'), true, 'AC16 tab before admin.js');
    },
  },
);

// ── N-497 (ONB-2): plan engine, "Start onboarding", Data Health checks ────────────────────────────────────────

const _ONB_TODAY = '2026-11-20';

function _onbFx2() {
  const { f, plan } = _onbFx();
  const tpl = (key, offset, extra) => Object.assign({ id: key, RecordType: 'person', Variant: 'TP', Active: true, ItemKey: key, ItemLabel: 'Step ' + key, DueOffsetDays: offset }, extra);
  const templates = [tpl('a', -2), tpl('b', 0), tpl('c', 5), tpl('x', 9, { Active: false })];
  const nina = f.P(30, 'Nina New', 'TP', { StartDate: '2026-11-25', ReportsTo: f.sdm.WorkEmail });
  const people = f.all.concat([nina]);
  const base = { person: nina, people, plans: [], templates, mode: 'On', pilot: [], todayISO: _ONB_TODAY };
  return { f, plan, tpl, templates, nina, people, base };
}

ASSERTIONS.push(
  {
    name: 'N-497 AC1 config: onbPlan Admin only, START_WINDOW_DAYS, reasons and card wording, nothing in the MCP bundle',
    fn: function () {
      const O = CONFIG.ONBOARDING;
      _assertEqual(CONFIG.ROLE_CAPABILITIES.onbPlan, ['admin'], 'onbPlan Admin only');
      ['people_ops', 'leadership', 'delivery_manager', 'talent_partner'].forEach(r => _assertEqual(roleCan(r, 'onbPlan'), false, r + ' cannot start a plan'));
      _assertEqual([O.START_WINDOW_DAYS, O.DISPLAY_ROWS], [14, 10], 'window and display rows');
      _assertEqual(Object.keys(O.START_REASONS).sort(), ['has-plan', 'no-email', 'no-line-manager', 'no-start-date', 'no-steps', 'not-pilot', 'off', 'out-of-scope', 'too-late'], 'every start reason has wording');
      ['cardTitle', 'start', 'restart', 'cancel', 'buddyNone', 'stepsDone', 'overdue', 'cancelConfirm', 'startOk', 'cancelOk', 'restartOk', 'buddyOk', 'loadFailed'].forEach(k => _assertEqual(typeof O.TEXT[k], 'string', 'TEXT.' + k));
      _assertEqual(onbReasonText('too-late').includes('14 days'), true, '{days} filled in');
      _assertEqual(O.PLAN_STATUSES, ['Active', 'Complete', 'Cancelled'], 'no Paused status (ONB-D19)');
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding/.test(s)), false, 'no onboarding file in the MCP bundle');
    },
  },
  {
    name: 'N-497 AC1 onbStepDue: StartDate + offset, never stored',
    fn: function () {
      _assertEqual(onbStepDue('2026-12-01', { DueOffsetDays: -5 }), '2026-11-26', 'pre-start');
      _assertEqual(onbStepDue('2026-12-01', { DueOffsetDays: 0 }), '2026-12-01', 'start day');
      _assertEqual(onbStepDue('2026-12-01', { DueOffsetDays: '30' }), '2026-12-31', 'text offset from SharePoint');
      _assertEqual(onbStepDue('2026-12-01', { DueOffsetDays: 14 }), '2026-12-15', 'across a month end');
      _assertEqual(onbStepDue('', { DueOffsetDays: 1 }), '', 'blank StartDate');
      _assertEqual(onbStepDue('2026-12-01', { DueOffsetDays: 2.5 }), '', 'non-integer offset');
      _assertEqual(onbStepDue('2026-12-01', { DueOffsetDays: '' }), '', 'blank offset');
      _assertEqual(onbStepDue('2026-12-01', null), '', 'no step');
      _assertEqual(/DueDate|dueDate/.test(_onbSrc('onboarding-logic.js')), false, 'no due-date column is read or written');
    },
  },
  {
    name: 'N-497 AC2 onbStepVisible: pre-start steps hidden from the joiner only, until StartDate, by offset',
    fn: function () {
      const pre = { DueOffsetDays: -2, Section: 'Week 1' }, week1 = { DueOffsetDays: 0, Section: 'Pre-start' }, none = { DueOffsetDays: '' };
      const vis = (step, rel, today) => onbStepVisible({ step, relations: rel, startDate: '2026-11-25', todayISO: today });
      _assertEqual(vis(pre, ['employee'], '2026-11-24'), false, 'joiner, day before start: hidden');
      _assertEqual(vis(pre, ['employee'], '2026-11-25'), true, 'joiner, start day: visible');
      ['lm', 'csd', 'buddy', 'peopleops', 'admin'].forEach(r => _assertEqual(vis(pre, [r], '2026-11-01'), true, r + ' sees it from plan start'));
      _assertEqual(vis(pre, ['employee', 'lm'], '2026-11-01'), true, 'a joiner who is also LM / CSD sees all');
      _assertEqual(vis(week1, ['employee'], '2026-11-01'), true, 'non-negative offset never hidden (section name is irrelevant)');
      _assertEqual(vis(none, ['employee'], '2026-11-01'), true, 'blank offset visible');
      _assertEqual(onbStepVisible({ step: pre, relations: new Set(['employee']), startDate: '', todayISO: '2026-11-01' }), true, 'blank StartDate: visible');
    },
  },
  {
    name: 'N-497 AC3 onbPlanSummary: done, total, overdue, next due',
    fn: function () {
      const { templates } = _onbFx2();
      const steps = templates.filter(t => t.Active);
      const progress = resolveChecklistProgress([{ id: 1, ItemKey: 'a', Done: true, DoneDate: '2026-11-20' }]);
      let s = onbPlanSummary({ steps, progress, startDate: '2026-11-25', todayISO: '2026-11-26' });
      _assertEqual([s.total, s.done, s.overdue, s.nextDue && s.nextDue.itemKey, s.nextDue && s.nextDue.due], [3, 1, 1, 'b', '2026-11-25'], 'b (due 25th) overdue on 26th, c not yet; next is b');
      s = onbPlanSummary({ steps, progress, startDate: '2026-11-25', todayISO: '2026-11-25' });
      _assertEqual(s.overdue, 0, 'a step due today is not overdue');
      s = onbPlanSummary({ steps, progress: null, startDate: '', todayISO: '2026-11-25' });
      _assertEqual([s.total, s.done, s.overdue, s.nextDue], [3, 0, 0, null], 'no StartDate: no dates, nothing overdue');
      _assertEqual(onbPlanSummary({}).total, 0, 'empty input');
    },
  },
  {
    name: 'N-497 AC4 onbBuddyCandidates: started TP / STP / PTP peers only, not the joiner',
    fn: function () {
      const { f, people, nina } = _onbFx2();
      const extra = people.concat([
        f.P(31, 'Ian Internal', 'TP', { StaffType: CONFIG.STAFF_TYPE_INTERNAL }),
        f.P(32, 'Pho Placeholder', 'TP', { IsPlaceholder: true }),
        f.P(33, 'Ina Inactive', 'TP', { IsActive: false }),
        f.P(34, 'Dup One', 'TP', { WorkEmail: 'dup@mg.test' }),
        f.P(35, 'Dup Two', 'TP', { WorkEmail: 'dup@mg.test' }),
        f.P(36, 'Fay Future', 'TP', { StartDate: '2026-12-01' }),
      ]);
      const c = onbBuddyCandidates(extra, nina.id, _ONB_TODAY);
      _assertEqual(c.map(x => x.name), ['Deep Tp', 'Pat Ptp', 'Stu Stp', 'Tia Tp', 'Tom Tp'], 'no joiner, CSD, SDM, internal, placeholder, inactive, duplicate or future starter');
      _assertEqual(Object.keys(c[0]).sort(), ['email', 'id', 'level', 'name', 'startDate'], 'candidate shape');
    },
  },
  {
    name: 'N-497 AC5 onbStartCheck: every reason, in order; the 14-day window edge',
    fn: function () {
      const { f, plan, nina, people, base, tpl } = _onbFx2();
      const chk = patch => onbStartCheck(Object.assign({}, base, patch));
      const withNina = patch => chk({ person: Object.assign({}, nina, patch), people: people.map(p => (p.id === nina.id ? Object.assign({}, nina, patch) : p)) });
      _assertEqual(chk({}), { ok: true, reason: '' }, 'all good');
      _assertEqual(chk({ plans: [plan(30, { Status: 'Cancelled' })], mode: 'Off' }).reason, 'has-plan', 'an existing row (any status) comes first');
      _assertEqual(chk({ mode: 'Off' }).reason, 'off', 'Off');
      _assertEqual(chk({ mode: 'bogus' }).reason, 'off', 'unknown mode is Off');
      _assertEqual(chk({ mode: 'Pilot', pilot: [f.tp1.WorkEmail] }).reason, 'not-pilot', 'Pilot, not on the list');
      _assertEqual(chk({ mode: 'Pilot', pilot: [nina.WorkEmail.toUpperCase()] }).ok, true, 'Pilot, on the list (case-insensitive)');
      _assertEqual(chk({ person: f.sdm }).reason, 'out-of-scope', 'an SDM');
      _assertEqual(chk({ person: null }).reason, 'out-of-scope', 'no person');
      _assertEqual(withNina({ WorkEmail: '' }).reason, 'no-email', 'no work email');
      _assertEqual(chk({ people: people.concat([f.P(40, 'Twin', 'TP', { WorkEmail: nina.WorkEmail })]) }).reason, 'no-email', 'duplicate work email');
      _assertEqual(withNina({ StartDate: '' }).reason, 'no-start-date', 'no start date');
      _assertEqual(withNina({ StartDate: '2026-11-05' }).reason, 'too-late', '15 days ago is too late');
      _assertEqual(withNina({ StartDate: '2026-11-06' }).ok, true, '14 days ago is allowed');
      _assertEqual(withNina({ StartDate: '2026-11-20' }).ok, true, 'today is allowed');
      _assertEqual(withNina({ StartDate: '2027-01-04' }).ok, true, 'a future start is allowed');
      _assertEqual(withNina({ ReportsTo: '' }).reason, 'no-line-manager', 'no ReportsTo');
      _assertEqual(withNina({ ReportsTo: 'ghost@mg.test' }).reason, 'no-line-manager', 'ReportsTo not in People');
      _assertEqual(chk({ templates: [tpl('z', 0, { Active: false })] }).reason, 'no-steps', 'only inactive steps');
      _assertEqual(chk({ templates: [tpl('z', 0, { RecordType: 'role' })] }).reason, 'no-steps', 'other record types do not count');
    },
  },
  {
    name: 'N-497 AC6 onbCardState: a plan row wins over the switch',
    fn: function () {
      const { plan, base } = _onbFx2();
      const st = patch => onbCardState(Object.assign({}, base, patch));
      _assertEqual(st({ plans: [plan(30, { Status: 'Cancelled' })], mode: 'Off' }).kind, 'cancelled', 'Cancelled even with Off');
      _assertEqual(st({ plans: [plan(30)] }).kind, 'active', 'Active');
      _assertEqual(st({ plans: [plan(30, { Status: 'Complete' })] }).kind, 'complete', 'Complete');
      _assertEqual(st({ plans: [plan(30, { Status: 'Cancelled' }), plan(30, { id: 'p9' })] }).plan.id, 'p9', 'an Active row beats a Cancelled duplicate');
      _assertEqual(st({ plans: [plan(30, { Status: 'Paused' })] }).kind, 'blocked', 'unknown status is blocked');
      _assertEqual(st({ plans: [plan(4)] }).kind, 'ready', "someone else's plan is not this person's");
      _assertEqual(st({}).kind, 'ready', 'ready');
      _assertEqual(st({ mode: 'Off' }), { kind: 'off', reason: 'off', plan: null }, 'off');
      _assertEqual(st({ templates: [] }), { kind: 'blocked', reason: 'no-steps', plan: null }, 'blocked with its reason');
    },
  },
);

ASSERTIONS.push(
  {
    name: 'N-497 AC7 onbStartFields: the seven plan columns, optional buddy from the candidates only',
    fn: function () {
      const { f, nina, people } = _onbFx2();
      const go = buddyEmail => onbStartFields({ person: nina, people, buddyEmail, byEmail: 'Cara.Csd@MG.test', todayISO: _ONB_TODAY });
      const out = go(f.tp2.WorkEmail.toUpperCase());
      _assertEqual(out, { Title: nina.WorkEmail.toLowerCase(), PersonID: 30, Track: 'TP', Status: 'Active', StartedByEmail: 'cara.csd@mg.test', StartedAt: '2026-11-20T12:00:00Z', BuddyEmail: f.tp2.WorkEmail }, 'payload');
      _assertEqual(Object.keys(out), CONFIG.ONBOARDING.PLAN_FIELDS, 'exactly the seven columns');
      _assertEqual(go('').BuddyEmail, null, 'no buddy yet');
      const throws = (fn, label) => { let t = false; try { fn(); } catch (e) { t = true; } _assertEqual(t, true, 'rejects ' + label); };
      throws(() => go(nina.WorkEmail), 'the joiner as their own buddy');
      throws(() => go(f.csd.WorkEmail), 'a CSD buddy');
      throws(() => go('nobody@mg.test'), 'an unknown buddy');
      throws(() => onbStartFields({ person: null, people }), 'no person');
    },
  },
  {
    name: 'N-497 AC8 onbCheckPlans: eight checks, each fires on its fixture, clean data reads zero',
    fn: function () {
      const { f, plan, templates, nina, people } = _onbFx2();
      const run = (plans, ppl, tpls) => onbCheckPlans({ plans, people: ppl || people, templates: tpls || templates });
      const counts = checks => checks.map(c => c.count);
      const ok = patch => Object.assign(plan(30), { Title: nina.WorkEmail }, patch);
      const clean = run([ok({ BuddyEmail: f.tp2.WorkEmail })]);
      _assertEqual(clean.map(c => c.key), ['person-missing', 'no-start-date', 'email-drift', 'no-line-manager', 'buddy-unresolved', 'duplicate-plans', 'no-steps', 'unknown-values'], 'order');
      _assertEqual(counts(clean), [0, 0, 0, 0, 0, 0, 0, 0], 'clean data');
      const swap = patch => people.map(p => (p.id === nina.id ? Object.assign({}, nina, patch) : p));
      _assertEqual(counts(run([ok({ PersonID: 999 })])), [1, 0, 0, 0, 0, 0, 0, 0], 'person not in People');
      _assertEqual(counts(run([ok()], swap({ IsActive: false }))), [1, 0, 0, 0, 0, 0, 0, 0], 'person inactive');
      _assertEqual(counts(run([ok()], swap({ StartDate: '' }))), [0, 1, 0, 0, 0, 0, 0, 0], 'no start date');
      _assertEqual(counts(run([ok({ Title: 'old.address@mg.test' })])), [0, 0, 1, 0, 0, 0, 0, 0], 'saved email drifted');
      _assertEqual(counts(run([ok()], swap({ ReportsTo: '' }))), [0, 0, 0, 1, 0, 0, 0, 0], 'no line manager');
      _assertEqual(counts(run([ok({ BuddyEmail: 'nobody@mg.test' })])), [0, 0, 0, 0, 1, 0, 0, 0], 'buddy not in People');
      _assertEqual(counts(run([ok(), ok({ id: 'p9', Status: 'Cancelled' })])), [0, 0, 0, 0, 0, 1, 0, 0], 'two rows for one person (any status)');
      _assertEqual(counts(run([ok()], null, [])), [0, 0, 0, 0, 0, 0, 1, 0], 'no active steps');
      _assertEqual(counts(run([ok({ Track: 'SDM' })])), [0, 0, 0, 0, 0, 0, 1, 1], 'unknown track (also has no steps)');
      _assertEqual(counts(run([ok({ Status: 'Paused' })])), [0, 0, 0, 0, 0, 0, 0, 1], 'unknown status');
      _assertEqual(counts(run([ok({ PersonID: 999, Status: 'Cancelled' })])), [0, 0, 0, 0, 0, 0, 0, 0], 'a Cancelled plan is ignored by the Active-only checks');
      _assertEqual(run([ok({ PersonID: 999 })])[0].sample, [nina.WorkEmail.toLowerCase()], 'sample names the plan by its saved email when the person is gone');
    },
  },
  {
    name: 'N-497 AC9 api-onboarding.js writes: Admin gate first, fresh re-check, one row, legal transitions only',
    fn: function () {
      const src = _onbSrc('api-onboarding.js');
      const fn = name => { const i = src.indexOf('async function ' + name); const j = src.indexOf('\nasync function ', i + 10); return src.slice(i, j > -1 ? j : undefined); };
      const gate = fn('_onbPlanWriteGate');
      _assertEqual(/_ensureGhostGate\(\)/.test(gate) && /roleCan\(role, 'onbPlan'\)/.test(gate) && /throw new Error\('Only an Admin/.test(gate), true, 'gate: Ghost gate, effective role, onbPlan');
      const start = fn('startOnboardingPlan');
      const order = ['_onbPlanWriteGate()', '_onbDropCaches()', 'onbStartCheck(', 'onbStartFields(', 'createItem('].map(s => start.indexOf(s));
      _assertEqual(order.every((n, i) => n > -1 && (i === 0 || n > order[i - 1])), true, 'start: gate, fresh reads, re-check, fields, one createItem');
      _assertEqual((start.match(/createItem\(/g) || []).length, 1, 'start creates exactly one row');
      _assertEqual(/getOnboardingPlans\(\{ personId \}\)/.test(start), true, "start re-reads this person's plans");
      _assertEqual(/getCurrentUser\(\)\?\.email/.test(start), true, 'StartedBy is the real signed-in user');
      const buddy = fn('setOnboardingBuddy'), cancel = fn('cancelOnboardingPlan'), restart = fn('restartOnboardingPlan');
      [buddy, cancel, restart].forEach((b, i) => _assertEqual(b.indexOf('_onbPlanWriteGate()') > -1 && b.indexOf('_onbPlanWriteGate()') < b.indexOf('_onbPlanById(') && b.indexOf('_onbPlanById(') < b.indexOf('updateItem('), true, 'write ' + i + ': gate, fresh read, then update'));
      _assertEqual(/!== CONFIG\.ONBOARDING\.PLAN_ACTIVE/.test(buddy) && /onbBuddyCandidates\(/.test(buddy), true, 'buddy: Active plans only, candidates only');
      _assertEqual(/!== CONFIG\.ONBOARDING\.PLAN_ACTIVE/.test(cancel) && /Status: 'Cancelled'/.test(cancel), true, 'cancel: Active -> Cancelled');
      _assertEqual(/!== 'Cancelled'/.test(restart) && /onbInScope\(person\)/.test(restart), true, 'restart: Cancelled -> Active, person still in scope');
      _assertEqual(/Complete/.test(cancel + restart + buddy + start), false, 'N-497 never writes or reopens a Complete plan');
      const inputs = fn('getOnboardingPlanInputs');
      _assertEqual(/getPeople\(false\)/.test(inputs) && /getChecklistTemplates\(/.test(inputs), true, 'Data Health inputs include inactive people and the templates');
    },
  },
  {
    name: 'N-497 AC10 onbCardHtml: one state each, escaped, no inline handlers, no wording in markup',
    fn: function () {
      const { f, plan, nina, people, base } = _onbFx2();
      const buddies = onbBuddyCandidates(people.concat([f.P(50, '<b>Evil</b> Buddy', 'TP')]), nina.id, _ONB_TODAY);
      const html = (patch, state) => onbCardHtml(Object.assign({ state: onbCardState(Object.assign({}, base, state || {})), person: nina, buddies, summary: null, startedBy: '', startedOn: '', buddyEmail: '' }, patch));
      const T = CONFIG.ONBOARDING.TEXT;
      const ready = html({});
      _assertEqual(ready.includes(T.start) && ready.includes('onbStartPlan') && ready.includes('id="onb-buddy"') && ready.includes(T.buddyNone), true, 'ready: buddy select + Start');
      _assertEqual(ready.includes('<b>Evil'), false, 'buddy names are escaped');
      _assertEqual(ready.includes('&lt;b&gt;Evil'), true, 'escaped form present');
      const active = html({ summary: { total: 5, done: 2, overdue: 1 }, startedBy: 'Cara Csd', startedOn: '20 November 2026', buddyEmail: f.tp2.WorkEmail }, { plans: [plan(30, { id: 'p7' })] });
      _assertEqual(active.includes('2 of 5 steps done') && active.includes('1 overdue') && active.includes('Cara Csd') && active.includes('onbCancelPlan') && active.includes('onbChangeBuddy') && !active.includes('onbStartPlan'), true, 'active: counts, who started, Cancel + Change buddy');
      _assertEqual(active.includes('value="' + f.tp2.WorkEmail + '" selected'), true, 'current buddy preselected');
      _assertEqual(html({ summary: { total: 0, done: 0, overdue: 0 } }, { plans: [plan(30)] }).includes(T.noSteps), true, 'active with no steps');
      _assertEqual(html({ summary: { total: 5, done: 5, overdue: 0 } }, { plans: [plan(30)] }).includes('overdue'), false, 'no overdue text at zero');
      const cancelled = html({}, { plans: [plan(30, { Status: 'Cancelled' })] });
      _assertEqual(cancelled.includes('onbRestartPlan') && cancelled.includes(T.cancelledNote) && !cancelled.includes('onbStartPlan'), true, 'cancelled: Restart only');
      _assertEqual(html({}, { plans: [plan(30, { Status: 'Complete' })] }).includes('<button'), false, 'complete: no buttons');
      const off = html({}, { mode: 'Off' });
      _assertEqual(off.includes(CONFIG.ONBOARDING.START_REASONS.off) && !off.includes('<button'), true, 'off: a note, no button');
      const blocked = html({}, { templates: [] });
      _assertEqual(blocked.includes(CONFIG.ONBOARDING.START_REASONS['no-steps']) && !blocked.includes('<button'), true, 'blocked: its reason, no button');
      [ready, active, cancelled, off].forEach(h => _assertEqual(/\bon(click|change|input)=|style="/.test(h), false, 'no inline handlers or styles'));
      const src = _onbSrc('onboarding-plan-ui.js');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(src), false, 'no hex in JS');
      _assertEqual(/act(On)?\([^)]*\)\.trim\(\)/.test(src), false, 'act() keeps its leading space');
      _assertEqual(/registerActions\(\{\s*onbStartPlan,\s*onbChangeBuddy,\s*onbCancelPlan,\s*onbRestartPlan,?\s*\}\)/.test(src), true, 'four actions registered once');
    },
  },
  {
    name: 'N-497 AC10 the card reads nothing for anyone but Admin; Cancel asks first; every write redraws fresh',
    fn: function () {
      const src = _onbSrc('onboarding-plan-ui.js');
      const load = src.slice(src.indexOf('async function onbLoadPlanCard'), src.indexOf('async function _onbRun'));
      const gate = load.indexOf("roleCan(_resolvedRole, 'onbPlan')"), read = load.indexOf('getOnboardingPlans(');
      _assertEqual(gate > -1 && read > gate && /if \(!roleCan\(_resolvedRole, 'onbPlan'\)\) return;/.test(load), true, 'role check returns before any read');
      _assertEqual((load.match(/_onbSlot\(token\)/g) || []).length >= 3, true, 'slot re-found after the await (stale-render guard)');
      _assertEqual(/confirmModal\(/.test(src.slice(src.indexOf('async function onbCancelPlan'))), true, 'Cancel confirms');
      const run = src.slice(src.indexOf('async function _onbRun'), src.indexOf('function _onbBuddyValue'));
      _assertEqual(/disabled = true/.test(run) && /toast\(/.test(run) && /\{ fresh: true \}/.test(run), true, 'lock, toast, redraw from fresh data');
      const ep = _epSrc('employee-page.js');
      _assertEqual(/<div id="emp-onboarding-slot"><\/div>/.test(ep), true, 'record page has the slot');
      _assertEqual(ep.indexOf('_epLoadDetails(data.person') > -1 && ep.indexOf('onbLoadPlanCard(data.person, data.people, token)') > ep.indexOf('_epLoadDetails(data.person'), true, 'card loads after the page paints');
      _assertEqual(/onb[A-Z]\w*\(/.test(ep.replace(/onbLoadPlanCard\(data\.person, data\.people, token\)/, '')), false, 'no other onboarding logic in employee-page.js');
    },
  },
  {
    name: 'N-497 AC12-AC13 Data Health section, load scope and shared-file baselines',
    fn: function () {
      const os = _onbSrc('os-admin.js');
      _assertEqual(/onbCheckPlans\(await getOnboardingPlanInputs\(\)\)/.test(os) && /onboardingPlans = \{ ok: false, checks: \[\] \}/.test(os), true, 'fetch: pure check, failure is { ok: false }');
      _assertEqual(/_dhRenderOnboardingPlansHtml\(data\)/.test(os) && /Query error/.test(os.slice(os.indexOf('function _dhRenderOnboardingPlansHtml'))), true, 'section rendered, Query error badge on failure');
      _assertEqual(/CONFIG\.ONBOARDING\.DISPLAY_ROWS/.test(os), true, 'Show details capped at DISPLAY_ROWS');
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (Node runner only)');
      const at = (h, s) => ALL_HTML[h].indexOf('src="js/' + s + '"');
      Object.keys(ALL_HTML).forEach(h => _assertEqual(at(h, 'onboarding-plan-ui.js') > -1, h === 'people.html', 'onboarding-plan-ui.js only on people.html, not ' + h));
      ['people.html', 'admin.html'].forEach(h => {
        _assertEqual(at(h, 'pdp-identity.js') < at(h, 'onboarding-config.js') && at(h, 'onboarding-config.js') < at(h, 'graph-client.js'), true, h + ' config straight after pdp-identity.js');
        _assertEqual(at(h, 'checklist-logic.js') > -1 && at(h, 'checklist-logic.js') < at(h, 'onboarding-logic.js') && at(h, 'pdp-identity.js') < at(h, 'onboarding-logic.js'), true, h + ' logic after checklist-logic.js and pdp-identity.js');
        _assertEqual(at(h, 'api-checklists.js') > -1 && at(h, 'api-checklists.js') < at(h, 'api-onboarding.js') && at(h, 'api-pdp-core.js') < at(h, 'api-onboarding.js'), true, h + ' api after api-checklists.js and the ghost / settings helpers');
      });
      _assertEqual(at('people.html', 'employee-page.js') < at('people.html', 'onboarding-plan-ui.js'), true, 'card file straight after employee-page.js');
      _assertEqual(at('people.html', 'api-onboarding.js') < at('people.html', 'employee-page.js'), true, 'people.html loads the api before the page');
      _assertEqual(ALL_HTML['mobile.html'].includes('onboarding'), false, 'never mobile.html');
      _assertEqual(ALL_HTML['my-momentum.html'].includes('onboarding'), false, 'my-momentum.html waits for N-499');
    },
  },
);
