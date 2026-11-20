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
      const files = ['onboarding-config.js', 'onboarding-logic.js', 'api-onboarding.js', 'onboarding-admin.js'];
      Object.keys(ALL_HTML).forEach(h => files.forEach(js => _assertEqual(ALL_HTML[h].includes('src="js/' + js + '"'), h === 'reporting.html', `AC16 ${js} on ${h}`)));
      const rep = ALL_HTML['reporting.html'];
      const at = s => rep.indexOf('src="js/' + s + '"');
      _assertEqual(at('pdp-identity.js') < at('onboarding-config.js') && at('onboarding-config.js') < at('graph-client.js'), true, 'AC16 onboarding-config.js straight after pdp-identity.js');
      _assertEqual(at('api-checklists.js') < at('onboarding-logic.js') && at('onboarding-logic.js') < at('api-onboarding.js') && at('api-onboarding.js') < at('checklists.js'), true, 'AC16 logic + api straight after api-checklists.js');
      _assertEqual(at('pdp-admin.js') < at('onboarding-admin.js') && at('onboarding-admin.js') < at('admin.js'), true, 'AC16 tab before admin.js');
    },
  },
);
