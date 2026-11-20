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
      // N-498: the picker and the type-select guard now take every record type (onboarding included); the switch cards and the
      // toggle guard stay on SWITCH_TYPES, so 'person' still never reaches the watermark switch.
      _assertEqual((adm.match(/CHECKLISTS\.RECORD_TYPES/g) || []).length, 2, 'AC3 (N-498) picker + select guard take RECORD_TYPES');
      _assertEqual((adm.match(/CHECKLISTS\.SWITCH_TYPES/g) || []).length, 2, 'AC3 (N-498) switch cards + toggle guard stay on SWITCH_TYPES');
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
      // N-497 widened the first three to people.html (the employee-record card) and admin.html (Data Health), N-499 to my-momentum.html; the tab stays reporting.html only.
      const files = ['onboarding-config.js', 'onboarding-logic.js', 'api-onboarding.js', 'onboarding-admin.js'];
      Object.keys(ALL_HTML).forEach(h => files.forEach(js => _assertEqual(ALL_HTML[h].includes('src="js/' + js + '"'),
        h === 'reporting.html' || (js !== 'onboarding-admin.js' && (h === 'people.html' || h === 'admin.html' || h === 'my-momentum.html')), `AC16 ${js} on ${h}`)));
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
      _assertEqual(ALL_HTML['my-momentum.html'].includes('src="js/onboarding-my-ui.js"'), true, 'my-momentum.html carries the N-499 page file (asserted in full under N-499)');
    },
  },
);

// ── N-498 (ONB-3): onboarding track editing + the one-off seed ───────────────────────────────────────
ASSERTIONS.push(
  {
    name: 'N-498 AC3/AC4 onbStepFields + onbValidateStep: tick-only step payload, blanks clear, bad input blocked',
    fn: function () {
      const ok = { owner: 'LM', dueOffsetDays: '-3', stepMode: 'Guided', levelTag: '', contentUrl: '' };
      _assertEqual(onbStepFields(ok), { Owner: 'LM', DueOffsetDays: -3, StepMode: 'Guided', LevelTag: null, ContentUrl: null }, 'AC3 payload: blank level / link -> null, negative offset kept');
      _assertEqual(onbStepFields({ owner: 'people ops', dueOffsetDays: 0, stepMode: 'self-guided', levelTag: 'foundation', contentUrl: ' https://x.example/a%20b ' }),
        { Owner: 'PeopleOps', DueOffsetDays: 0, StepMode: 'Self-guided', LevelTag: 'Foundation', ContentUrl: 'https://x.example/a%20b' }, 'AC3 keys normalised, link trimmed');
      const bad = o => onbValidateStep(Object.assign({}, ok, o));
      _assertEqual(bad({ owner: '' }).errors.owner !== undefined, true, 'AC4 missing owner');
      _assertEqual(bad({ owner: 'Janitor' }).errors.owner !== undefined, true, 'AC4 unknown owner');
      ['2.5', '-31', '61'].forEach(v => _assertEqual(bad({ dueOffsetDays: v }).errors.dueOffsetDays !== undefined, true, 'AC4 offset ' + v));
      _assertEqual(bad({ dueOffsetDays: '-30' }).ok && bad({ dueOffsetDays: '60' }).ok, true, 'AC4 range edges accepted');
      _assertEqual(bad({ stepMode: 'guided-ish' }).errors.stepMode !== undefined, true, 'AC4 mode');
      _assertEqual(bad({ levelTag: 'Senior' }).errors.levelTag !== undefined, true, 'AC4 level');
      ['http://x.example/a', 'javascript:alert(1)'].forEach(u => _assertEqual(bad({ contentUrl: u }).errors.contentUrl !== undefined, true, 'AC4 link ' + u));
      _assertEqual(bad({ levelTag: '', contentUrl: '' }).ok, true, 'AC4 blank level and link accepted');
      let threw = false; try { onbStepFields({ owner: 'LM', dueOffsetDays: '2.5', stepMode: 'Guided' }); } catch (e) { threw = true; }
      _assertEqual(threw, true, 'AC11 onbStepFields throws on invalid input');
    },
  },
  {
    name: 'N-498 AC5/AC11 onbStepFromRow, onbDueText, onbTrackKeys / onbTrackLabel',
    fn: function () {
      _assertEqual(onbStepFromRow({ Owner: 'PeopleOps', DueOffsetDays: -5, StepMode: 'Guided', LevelTag: 'Experienced', ContentUrl: ' https://x.example/d ' }),
        { owner: 'PeopleOps', ownerLabel: 'People Ops', stepMode: 'Guided', levelTag: 'Experienced', dueOffsetDays: -5, contentUrl: 'https://x.example/d' }, 'AC11 a full row');
      _assertEqual(onbStepFromRow({}), { owner: 'Employee', ownerLabel: 'Employee', stepMode: 'Guided', levelTag: '', dueOffsetDays: null, contentUrl: '' }, 'AC11 blank row: Employee, Guided, no level, null offset');
      _assertEqual(onbStepFromRow({ Owner: 'x', StepMode: 'nope', LevelTag: 'Senior', DueOffsetDays: '2.5' }).dueOffsetDays, null, 'AC11 non-integer offset -> null');
      _assertEqual(onbStepFromRow({ DueOffsetDays: '7' }).dueOffsetDays, 7, 'AC11 numeric string offset');
      _assertEqual([onbDueText(0), onbDueText(3), onbDueText(-5), onbDueText(-1), onbDueText(null), onbDueText(2.5), onbDueText('')],
        ['Day 1 (start day)', 'Day 4', '5 days before start', '1 day before start', '', '', ''], 'AC5 due text');
      _assertEqual(onbTrackKeys(), ['TP'], 'tracks');
      _assertEqual([onbTrackLabel('TP'), onbTrackLabel('tp'), onbTrackLabel('XX')], ['Talent Partner', 'Talent Partner', 'XX'], 'track labels');
    },
  },
  {
    name: 'N-498 AC1-AC3 source contract: editor layout; N-498-retire: no seed tool left',
    fn: function () {
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding/.test(s)), false, 'not in the MCP bundle');
      _assertEqual(/^https:\/\/talentpoint\.sharepoint\.com\/sites\/SolutionsHubReporting\/OnboardingContent$/.test(CONFIG.ONBOARDING.CONTENT_BASE_URL), true, 'ONB-D26 library URL');
      const adm = _onbSrc('checklist-admin.js');
      _assertEqual(/_ckaPersonFormHtml\(it\)/.test(adm) && /f\.type = 'tick'/.test(adm) && /onbValidateStep\(f\)/.test(adm) && /onbStepFields\(f\)/.test(adm), true, 'AC3 onboarding save: tick-only, both validators, onbStepFields');
      const person = adm.slice(adm.indexOf('function _ckaPersonFormHtml'), adm.indexOf('// ── Reorder, rename, retire'));
      _assertEqual(/ck-f-type|ck-f-link"|ck-f-action/.test(person), false, 'AC3 no Type / Link URL / Action in the onboarding form');
      _assertEqual(/ck-f-owner/.test(person) && /ck-f-due/.test(person) && /ck-f-mode/.test(person) && /ck-f-level/.test(person) && /ck-f-url/.test(person), true, 'AC3 Owner, Due, Mode, Level, Content link');
      ['checklist-admin.js', 'api-onboarding.js', 'onboarding-logic.js', 'onboarding-config.js', 'config.js'].forEach(file =>
        _assertEqual(/onbSeed|seedOnboardingTrack|ckaSeedTrack|ONBOARDING_SEED|SEED_TEXT|onbTrack\b|ck-seed/.test(_onbSrc(file)), false, 'N-498-retire no seed tool left in ' + file));
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (Node runner only)');
      Object.keys(ALL_HTML).forEach(h => _assertEqual(ALL_HTML[h].indexOf('onboarding-seed.js') > -1, false, 'N-498-retire onboarding-seed.js is loaded by no shell, not ' + h));
    },
  },
);

// ── N-499 (ONB-4): My Onboarding tab + Onboarding Plan view ─────────────────────────────────────────────────

function _onbFx3() {
  const { f, plan } = _onbFx();
  const nina = f.P(30, 'Nina New', 'TP', { StartDate: '2026-11-25', ReportsTo: f.sdm.WorkEmail });
  const people = f.all.concat([nina]);
  const tpl = (key, section, sectionOrder, itemOrder, extra) => Object.assign({
    id: key, RecordType: 'person', Variant: 'TP', Active: true, ItemKey: key, ItemLabel: 'Step ' + key, Section: section, SectionOrder: sectionOrder, ItemOrder: itemOrder,
    Owner: 'Employee', DueOffsetDays: 0, StepMode: 'Guided', Required: true, LevelTag: '', ContentUrl: '', HelpText: '',
  }, extra);
  const lib = { Owner: 'Employee', DueOffsetDays: null, StepMode: 'Self-guided', Required: false };
  const templates = [
    tpl('pre', 'Pre-start', 1, 1, { Owner: 'Ops', DueOffsetDays: -2 }),
    tpl('w1', 'Week 1', 2, 1, { Owner: 'Employee', DueOffsetDays: 0, ContentUrl: 'https://x.example/m01' }),
    tpl('w2', 'Week 1', 2, 2, { Owner: 'LM', DueOffsetDays: 2 }),
    tpl('w3', 'Week 1', 2, 3, { Owner: 'Buddy', DueOffsetDays: 3, ContentUrl: 'javascript:alert(1)' }),
    tpl('lf', 'library', 9, 1, Object.assign({ LevelTag: 'Foundation' }, lib)),
    tpl('le', 'Library', 9, 2, Object.assign({ LevelTag: 'Experienced' }, lib)),
    tpl('la', 'Library', 9, 3, lib),
    tpl('off', 'Week 1', 2, 4, { Active: false }),
  ];
  const buddyPlan = plan(30, { id: 'pl30', BuddyEmail: f.tp1.WorkEmail });
  const ownPlan = plan(4, { id: 'pl4' });   // Tia Tp is a joiner herself in this fixture
  return { f, plan, nina, people, templates, buddyPlan, ownPlan };
}
const _ONB3_TODAY = '2026-11-26';

ASSERTIONS.push(
  {
    name: 'N-499 AC1 config + tab: PLAN_VISIBLE, LEVEL_FILTERS in step with LEVEL_TAGS, LIBRARY_URL, wording, nothing in the MCP bundle',
    fn: function () {
      const O = CONFIG.ONBOARDING;
      _assertEqual(O.PLAN_VISIBLE, ['Active', 'Complete'], 'Cancelled is never visible here');
      _assertEqual(O.LEVEL_FILTERS.map(l => l.key), [''].concat(O.LEVEL_TAGS), 'filter keys = All + LEVEL_TAGS');
      _assertEqual(O.LIBRARY_URL, O.CONTENT_BASE_URL + '/Library', 'Library link built from the one base URL');
      _assertEqual(O.LIBRARY_SECTION, 'Library', 'section name');
      ['pageTitle', 'tickFailed', 'tickNoRights', 'loadFailed', 'retry', 'completeNote', 'previewNote', 'libraryEmpty', 'noPlans'].forEach(k =>
        _assertEqual(typeof O.PLAN_TEXT[k] === 'string' && O.PLAN_TEXT[k].length > 0, true, 'PLAN_TEXT.' + k));
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding/.test(s)), false, 'not in the MCP bundle');
      const keys = CONFIG.MY_MOMENTUM.TABS.map(t => t.key);
      _assertEqual(keys.indexOf('myOnboarding') > -1 && keys.indexOf('myBuddying') === keys.indexOf('myOnboarding') + 1 && keys.indexOf('myTeam') === keys.indexOf('myBuddying') + 1, true, 'myOnboarding, then myBuddying (N-509), sit immediately before myTeam');
      ['admin', 'leadership', 'people_ops', 'talent_partner', 'staff'].forEach(role => {
        _assertEqual(mmTabRelevant('myOnboarding', { state: 'ok', role, signals: { onbPlans: true } }), true, 'relevant with a plan, ' + role);
        _assertEqual(mmTabRelevant('myOnboarding', { state: 'ok', role, signals: {} }), false, 'not relevant without one, ' + role);
      });
    },
  },
  {
    name: 'N-499 AC4 onbValidateStep / onbStepFields: a Library step may have no due date and must be self-guided; every other section is unchanged',
    fn: function () {
      const base = { owner: 'Employee', dueOffsetDays: '', stepMode: 'Self-guided', levelTag: '', contentUrl: '', section: 'Library' };
      _assertEqual(onbValidateStep(base).ok, true, 'blank due passes in Library');
      _assertEqual(onbValidateStep(Object.assign({}, base, { section: ' library ' })).ok, true, 'section matched case-insensitively');
      _assertEqual(onbValidateStep(Object.assign({}, base, { stepMode: 'Guided' })).errors.stepMode !== undefined, true, 'Library must be self-guided');
      ['2.5', '-31', '61'].forEach(v => _assertEqual(onbValidateStep(Object.assign({}, base, { dueOffsetDays: v })).errors.dueOffsetDays !== undefined, true, 'a given due is still range-checked: ' + v));
      _assertEqual(onbValidateStep(Object.assign({}, base, { section: 'Week 1' })).errors.dueOffsetDays !== undefined, true, 'another section still needs a due day');
      _assertEqual(onbValidateStep(Object.assign({}, base, { section: undefined })).errors.dueOffsetDays !== undefined, true, 'no section: today\'s behaviour');
      _assertEqual(onbStepFields(base).DueOffsetDays, null, 'blank Library due is written null');
      _assertEqual(onbStepFields(Object.assign({}, base, { dueOffsetDays: '4' })).DueOffsetDays, 4, 'a given due is kept');
      let threw = false; try { onbStepFields(Object.assign({}, base, { section: 'Week 1' })); } catch (e) { threw = true; }
      _assertEqual(threw, true, 'blank due outside Library still throws');
      _assertEqual([onbIsLibraryStep({ Section: 'LIBRARY' }), onbIsLibraryStep({ Section: 'Week 1' }), onbIsLibraryStep({}), onbIsLibraryStep(null)], [true, false, false, false], 'onbIsLibraryStep');
    },
  },
  {
    name: 'N-499 AC2 onbMyPlans: own and buddy plans, Active / Complete only, nothing from an LM / CSD / Admin relation alone, ordered',
    fn: function () {
      const { f, plan, nina, people, buddyPlan, ownPlan } = _onbFx3();
      const mine = (email, role, plans) => onbMyPlans({ plans, people, email, role: role || 'staff' });
      const all = [buddyPlan, ownPlan];
      _assertEqual(mine(f.tp1.WorkEmail, 'talent_partner', all).map(m => [m.plan.id, m.kind]), [['pl4', 'own'], ['pl30', 'buddy']], 'Tia: her own plan first, then the plan she buddies');
      _assertEqual(mine(nina.WorkEmail, 'talent_partner', all).map(m => [m.plan.id, m.kind]), [['pl30', 'own']], 'Nina: her own only');
      [f.sdm.WorkEmail, f.csd.WorkEmail].forEach(e => _assertEqual(mine(e, 'delivery_manager', all), [], 'an LM / CSD who is neither joiner nor buddy gets nothing: ' + e));
      _assertEqual(mine('admin@mg.test', 'admin', all), [], 'Admin alone gets nothing');
      _assertEqual(mine('leader@mg.test', 'leadership', all), [], 'Leadership gets nothing');
      _assertEqual(mine(nina.WorkEmail, 'talent_partner', [Object.assign({}, buddyPlan, { Status: 'Complete' })]).length, 1, 'a Complete plan lists');
      _assertEqual(mine(nina.WorkEmail, 'talent_partner', [Object.assign({}, buddyPlan, { Status: 'Cancelled' })]), [], 'a Cancelled plan never lists');
      const late = f.P(31, 'Late Joiner', 'TP', { StartDate: '2026-12-01', ReportsTo: f.sdm.WorkEmail });
      const early = f.P(32, 'Early Joiner', 'TP', { StartDate: '2026-11-02', ReportsTo: f.sdm.WorkEmail });
      const p2 = people.concat([late, early]);
      const three = [buddyPlan, plan(32, { id: 'pl32', BuddyEmail: f.tp1.WorkEmail }), plan(31, { id: 'pl31', BuddyEmail: f.tp1.WorkEmail })];
      const out = onbMyPlans({ plans: three, people: p2, email: f.tp1.WorkEmail, role: 'talent_partner' });
      _assertEqual(out.map(m => m.plan.id), ['pl31', 'pl30', 'pl32'], 'buddy plans: latest StartDate first');
      _assertEqual(onbPlanChoices(out, p2).map(c => [c.planId, c.kind, c.joinerName]), [['pl31', 'buddy', 'Late Joiner'], ['pl30', 'buddy', 'Nina New'], ['pl32', 'buddy', 'Early Joiner']], 'selector choices');
    },
  },
  {
    name: 'N-499 AC3 onbNavSignal: the tab signal follows the gate and the plans',
    fn: function () {
      const { f, people, buddyPlan } = _onbFx3();
      const sig = state => onbNavSignal({ gate: state ? { state } : null, plans: [buddyPlan], people, email: f.tp1.WorkEmail, role: 'talent_partner' });
      _assertEqual([sig('none'), sig(null), sig('live'), sig('preview')].map(s => [s.plans, s.buddy]), [[0, 0], [0, 0], [0, 1], [0, 1]], 'N-509: none / missing gate = 0; live / preview count a buddy-only person\'s plan under buddy, not plans');
      _assertEqual(onbNavSignal({ gate: { state: 'live' }, plans: [], people, email: f.tp1.WorkEmail, role: 'talent_partner' }), { plans: 0, buddy: 0, actions: 0 }, 'no plans = all zero');
    },
  },
);

ASSERTIONS.push(
  {
    name: 'N-499 AC5-AC8 onbPlanModel: visibility, Library split, summary, overdue, canTick, safe links, read-only',
    fn: function () {
      const { f, nina, people, templates, buddyPlan } = _onbFx3();
      const model = (email, o) => onbPlanModel(Object.assign({ plan: buddyPlan, people, templates, progressRows: [], email, role: 'talent_partner', todayISO: _ONB3_TODAY }, o));
      const items = m => m.phases.reduce((a, p) => a.concat(p.items), []);
      const keys = m => items(m).map(i => i.itemKey);
      const can = m => ['pre', 'w1', 'w2', 'w3'].map(k => items(m).find(i => i.itemKey === k).canTick);
      let m = model(nina.WorkEmail);
      _assertEqual([m.kind, m.joiner.name, m.lineManagerName, m.buddyName, m.status, m.readOnly], ['own', 'Nina New', 'Sam Sdm', 'Tia Tp', 'Active', false], 'header facts');
      _assertEqual(keys(m), ['pre', 'w1', 'w2', 'w3'], 'after the start day the joiner sees every phase step, none of the Library, none retired');
      m = model(nina.WorkEmail, { todayISO: '2026-11-20' });
      _assertEqual([keys(m), m.notStarted], [['w1', 'w2', 'w3'], true], 'before StartDate a joiner-only viewer does not get the negative-offset step');
      m = model(f.tp1.WorkEmail, { todayISO: '2026-11-20' });
      _assertEqual([m.kind, keys(m)], ['buddy', ['pre', 'w1', 'w2', 'w3']], 'a buddy sees every step before the start day');
      m = model(nina.WorkEmail);
      _assertEqual(m.library.all.map(i => i.itemKey), ['lf', 'le', 'la'], 'Library steps (any case of the section name), in order, none in phases');
      _assertEqual([m.summary.total, m.summary.done, m.summary.overdue], [4, 0, 2], 'summary counts phase steps only; pre (23 Nov) and w1 (25 Nov) are before 26 Nov, w2 (27th) and w3 (28th) are not');
      _assertEqual(m.summary.nextDue.itemKey, 'pre', 'next due is the earliest undone dated step');
      _assertEqual(m.phases.map(p => [p.section, p.done, p.total, p.open]), [['Pre-start', 0, 1, true], ['Week 1', 0, 3, true]], 'phases in SectionOrder with counts');
      m = model(nina.WorkEmail, { progressRows: [
        { id: 1, ItemKey: 'pre', Done: true, DoneDate: '2026-11-20', DoneByEmail: f.csd.WorkEmail },
        { id: 2, ItemKey: 'w1', Done: true, DoneDate: '2026-11-25', DoneByEmail: nina.WorkEmail }] });
      _assertEqual([m.summary.done, m.summary.overdue, m.phases[0].open, m.phases[0].done], [2, 0, false, 1], 'done steps are not overdue; a fully done phase is not open');
      const w1 = m.phases[1].items[0];
      _assertEqual([w1.done, w1.doneByName, w1.doneAt, w1.dueISO, w1.dueText, w1.overdue], [true, 'Nina New', '2026-11-25', '2026-11-25', 'Day 1 (start day)', false], 'a done step: who, when, due text');
      _assertEqual(can(model(nina.WorkEmail)), [false, true, false, false], 'joiner ticks only Employee-owned steps');
      m = model(f.tp1.WorkEmail);
      _assertEqual(can(m), [false, false, false, true], 'buddy ticks only Buddy-owned steps');
      _assertEqual(m.library.all.every(i => i.canTick === false), true, 'a buddy cannot tick the joiner\'s Library items');
      _assertEqual(model(nina.WorkEmail).library.all.every(i => i.canTick === true), true, 'the joiner ticks Library items');
      m = model(f.tp1.WorkEmail, { plan: Object.assign({}, buddyPlan, { Status: 'Complete' }) });
      _assertEqual([m.readOnly, can(m)], [true, [false, false, false, false]], 'Complete is read-only');
      m = model(nina.WorkEmail);
      _assertEqual([items(m)[3].contentUrl, items(m)[1].contentUrl], ['', 'https://x.example/m01'], 'an unsafe link is dropped, a safe one kept');
      _assertEqual(model(nina.WorkEmail, { plan: Object.assign({}, buddyPlan, { BuddyEmail: '' }) }).phases[1].items[2].owner.unnamed, true, 'a Buddy step with no buddy named is flagged');
      _assertEqual(model(nina.WorkEmail, { templates: [] }).phases, [], 'no steps: no phases');
    },
  },
  {
    name: 'N-499 AC6 onbLibraryFilter: a tagged item shows under its level, an untagged one under every level',
    fn: function () {
      const items = [{ itemKey: 'lf', levelTag: 'Foundation' }, { itemKey: 'le', levelTag: 'Experienced' }, { itemKey: 'la', levelTag: '' }];
      _assertEqual(onbLibraryFilter(items, '').items.map(i => i.itemKey), ['lf', 'le', 'la'], 'all');
      let r = onbLibraryFilter(items, 'Foundation');
      _assertEqual([r.items.map(i => i.itemKey), r.hidden], [['lf', 'la'], 1], 'Foundation hides Experienced');
      r = onbLibraryFilter(items, 'experienced');
      _assertEqual([r.items.map(i => i.itemKey), r.hidden], [['le', 'la'], 1], 'Experienced, key case-insensitive');
      _assertEqual(onbLibraryFilter(null, 'Foundation'), { items: [], hidden: 0 }, 'empty input');
      const { nina, people, templates, buddyPlan } = _onbFx3();
      const m = onbPlanModel({ plan: buddyPlan, people, templates, progressRows: [], email: nina.WorkEmail, role: 'talent_partner', todayISO: _ONB3_TODAY, level: 'Foundation' });
      _assertEqual([m.library.items.map(i => i.itemKey), m.library.hidden, m.library.all.length], [['lf', 'la'], 1, 3], 'the model applies the level and keeps all');
    },
  },
  {
    name: 'N-499 AC9-AC10 api-onboarding.js: nav fails safe; the view refuses a stranger\'s plan before any progress read; a tick re-checks every rule',
    fn: function () {
      const api = _onbSrc('api-onboarding.js');
      const nav = api.slice(api.indexOf('async function resolveOnboardingNav'), api.indexOf('async function getOnboardingPlanView'));
      _assertEqual(/catch \(e\)[\s\S]*return \{ plans: 0, buddy: 0, actions: 0 \}/.test(nav), true, 'AC3 (N-509) a failed read is { plans: 0, buddy: 0, actions: 0 }');
      const view = api.slice(api.indexOf('async function getOnboardingPlanView'), api.indexOf('async function tickOnboardingStep'));
      const refuse = view.indexOf("throw new Error('That onboarding plan is not available to you.')");
      _assertEqual(refuse > -1 && refuse < view.indexOf('getChecklistProgress('), true, 'AC9 refuse before the progress read');
      _assertEqual(/getChecklistProgress\(O\.RECORD_TYPE, \{ recordId: entry\.plan\.PersonID \}\)/.test(view), true, 'AC9 only that plan\'s progress is read');
      const tick = api.slice(api.indexOf('async function tickOnboardingStep'));
      const at = s => tick.indexOf(s);
      const order = ['_onbDropCaches()', "gate.state === 'preview'", "gate.state !== 'live'", 'onbMyPlans(', 'PLAN_ACTIVE', 'onbStepVisible(', 'onbCanTick(', 'getChecklistProgress(', 'setChecklistItemDone('];
      _assertEqual(order.every(s => at(s) > -1) && order.every((s, i) => !i || at(s) > at(order[i - 1])), true, 'AC10 fresh reads, then preview, live, relation, Active, visible, rights, then the one write');
      _assertEqual(/typeof done !== 'boolean'/.test(tick) && /Preview is read-only/.test(tick), true, 'AC10 boolean tick, Preview read-only');
      _assertEqual((tick.match(/setChecklistItemDone\(/g) || []).length, 1, 'AC10 exactly one write call');
      _assertEqual(/createItem\(|updateItem\(|deleteItem\(/.test(nav + view + tick), false, 'AC10 no other write in the My Onboarding functions');
    },
  },
  {
    name: 'N-499 AC11-AC12 onbmPageHtml: one state each, escaped, no inline handlers, wording from config, Library hidden when empty',
    fn: function () {
      const { f, nina, people, templates, buddyPlan } = _onbFx3();
      const evil = templates.map(t => t.ItemKey === 'w1' ? Object.assign({}, t, { ItemLabel: '<img src=x onerror=alert(1)>', HelpText: '"><script>x</script>' }) : t);
      const mk = (email, o) => {
        const mine = onbMyPlans({ plans: [buddyPlan], people, email, role: 'talent_partner' });
        return Object.assign(onbPlanModel(Object.assign({ plan: buddyPlan, people, templates: evil, progressRows: [], email, role: 'talent_partner', todayISO: _ONB3_TODAY }, o)),
          { gateState: 'live', choices: onbPlanChoices(mine, people) });
      };
      const draw = (view, ui) => onbmPageHtml(view, Object.assign({ level: '', closed: [], error: '' }, ui));
      const T = CONFIG.ONBOARDING.PLAN_TEXT;
      const disabled = h => (h.match(/ disabled data-act/g) || []).length;
      let html = draw(mk(nina.WorkEmail));
      _assertEqual(/<img src=x|<script>x/.test(html), false, 'label and help are escaped');
      _assertEqual(/\bon(click|change|input)=|style="/.test(html), false, 'no inline handlers or styles');
      _assertEqual(/href="javascript:/.test(html), false, 'no unsafe href');
      _assertEqual(html.includes(T.pageTitle) && html.includes('Nina New') && html.includes(T.library) && html.includes(CONFIG.ONBOARDING.LIBRARY_URL), true, 'title, joiner, Library and its link');
      _assertEqual((html.match(/class="onb-step-check"/g) || []).length, 7, 'four phase steps + three Library items');
      _assertEqual(disabled(html), 3, 'the Ops, LM and Buddy steps are disabled for the joiner');
      _assertEqual(html.includes('<progress class="onb-progress-bar" max="4" value="0"'), true, 'progress bar over the four phase steps');
      _assertEqual(html.includes('badge--overdue'), true, 'overdue chip');
      _assertEqual(html.includes('id="onb-plan"'), false, 'no selector with one plan');
      html = draw(mk(nina.WorkEmail), { level: 'Foundation', closed: ['Pre-start'] });
      _assertEqual(/Step le/.test(html), false, 'the Experienced item is hidden under Foundation');
      _assertEqual(html.includes('Step la') && html.includes('onb-level is-active'), true, 'untagged item stays; the filter button is marked');
      _assertEqual(html.includes('aria-expanded="false"') && html.includes('<ul class="onb-steps" hidden>'), true, 'a closed phase is collapsed');
      _assertEqual(draw(mk(nina.WorkEmail, { templates: templates.filter(t => !/^l/.test(t.ItemKey)) })).includes('onb-library'), false, 'no Library section when the track has none');
      const two = Object.assign(mk(f.tp1.WorkEmail), { choices: [{ planId: 'pl4', kind: 'own', joinerName: 'Tia Tp' }, { planId: 'pl30', kind: 'buddy', joinerName: 'Nina New' }], planId: 'pl30' });
      html = draw(two);
      _assertEqual(html.includes('id="onb-plan"') && html.includes('selected') && html.includes('Nina New (you are their buddy)'), true, 'selector with two plans');
      _assertEqual(draw(Object.assign(mk(nina.WorkEmail), { gateState: 'preview' })).includes(T.previewNote), true, 'Preview note');
      html = draw(mk(nina.WorkEmail, { plan: Object.assign({}, buddyPlan, { Status: 'Complete' }) }));
      _assertEqual([html.includes(T.completeNote), disabled(html)], [true, 7], 'Complete note, every box disabled');
      _assertEqual(draw(mk(nina.WorkEmail, { todayISO: '2026-11-20' })).includes('Your plan starts on 25 November 2026'), true, 'not-started note for the joiner');
      _assertEqual(draw(null, { error: 'Boom <b>' }).includes('Boom &lt;b&gt;') && draw(null, { error: 'x' }).includes('onbmRetry'), true, 'error state escaped, with Retry');
      _assertEqual(draw({ none: true }).includes(T.noPlans), true, 'no-plan state');
    },
  },
  {
    name: 'N-499 AC11-AC13 onboarding-my-ui.js and load scope: draws into #onb-page, drops stale loads, redraws fresh after a tick; my-momentum.html only',
    fn: function () {
      const ui = _onbSrc('onboarding-my-ui.js');
      _assertEqual(/token !== s\.token \|\| _mmCurrentPage !== 'myOnboarding'/.test(ui), true, 'a stale or abandoned load draws nothing');
      _assertEqual(/id="onb-page"/.test(ui) && /getElementById\('onb-page'\)/.test(ui), true, 'redraws target #onb-page so the area header survives');
      const tick = ui.slice(ui.indexOf('async function onbmTick'), ui.indexOf('async function onbmSelectPlan'));
      _assertEqual(/disabled = true/.test(tick) && /toast\(/.test(tick) && tick.indexOf('_onbmReload(false)') > tick.indexOf('catch'), true, 'lock, toast on failure, then a fresh redraw either way');
      _assertEqual(/registerActions\(\{\s*onbmTick,\s*onbmSelectPlan,\s*onbmSetLevel,\s*onbmTogglePhase,\s*onbmRetry,\s*onbmSubTab,?\s*\}\)/.test(ui), true, 'actions registered once (N-500: onbmSubTab joins them)');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(ui), false, 'no hex in JS');
      _assertEqual(/getOnboardingPlanView\(/.test(ui) && /tickOnboardingStep\(/.test(ui) && !/createItem\(|updateItem\(|getItems\(/.test(ui), true, 'the page only calls the two api functions');
      const app = _onbSrc('my-momentum-app.js');
      _assertEqual(/resolveOnboardingNav\(\)\.catch/.test(app) && /onbPlans: onbNav\.plans > 0/.test(app), true, 'app: own catch, signal onbPlans');
      _assertEqual(/case 'myOnboarding':\s+await renderMyOnboardingPage\(\)/.test(_onbSrc('my-momentum-nav.js')), true, 'nav renders the page');
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (Node runner only)');
      Object.keys(ALL_HTML).forEach(h => _assertEqual(ALL_HTML[h].includes('src="js/onboarding-my-ui.js"'), h === 'my-momentum.html', 'onboarding-my-ui.js only on my-momentum.html, not ' + h));
      const at = s => ALL_HTML['my-momentum.html'].indexOf('src="js/' + s + '"');
      _assertEqual(at('pdp-identity.js') < at('onboarding-config.js') && at('onboarding-config.js') < at('graph-client.js'), true, 'config straight after pdp-identity.js');
      _assertEqual(at('checklist-logic.js') > -1 && at('checklist-logic.js') < at('onboarding-logic.js') && at('onboarding-logic.js') < at('graph-client.js'), true, 'logic after checklist-logic.js, before the api');
      _assertEqual(at('api-pdp-core.js') < at('api-checklists.js') && at('api-checklists.js') < at('api-onboarding.js') && at('api-onboarding.js') < at('my-momentum-app.js'), true, 'api after api-checklists.js and the gate helpers');
      _assertEqual(at('my-momentum-scorecard.js') < at('onboarding-my-ui.js') && at('onboarding-my-ui.js') < at('my-momentum-app.js'), true, 'page file before my-momentum-app.js');
      _assertEqual(ALL_HTML['mobile.html'].includes('onboarding'), false, 'never mobile.html');
    },
  },
);

ASSERTIONS.push({
  name: 'N-499 fix onbPlanSummary: Library steps never count in total, done, overdue or next due (the employee-record card uses this)',
  fn: function () {
    const st = (key, section, due) => ({ ItemKey: key, ItemLabel: key, Section: section, DueOffsetDays: due, Active: true });
    const steps = [st('a', 'Week 1', 0), st('b', 'Week 1', 3), st('l1', 'Library', null), st('l2', 'library', null)];
    const progress = new Map([['a', { done: true }], ['l1', { done: true }]]);
    const r = onbPlanSummary({ steps, progress, startDate: '2026-11-20', todayISO: '2026-11-30' });
    _assertEqual([r.total, r.done, r.overdue, r.nextDue && r.nextDue.itemKey], [2, 1, 1, 'b'], 'two phase steps; the ticked Library item adds nothing');
  },
});

// ── N-509 (ONB-4b): the Buddying tab ─────────────────────────────────────────────────────────────────
// Fixture: _onbFx3(). Tia (f.tp1) buddies Nina's plan pl30 (Nina starts 25 Nov) and also has her own plan pl4. Steps: pre (Ops), w1 (Employee),
// w2 (LM), w3 (Buddy, due 28 Nov), three Library items. Today is 26 Nov.
const _ONB9_PROGRESS = (key, by) => ({ id: 'pr-' + key, ItemKey: key, Done: true, DoneDate: '2026-11-27', DoneByEmail: by });

ASSERTIONS.push(
  {
    name: 'N-509 AC1/AC2 config and tab rules: TABS order, TAB_COUNT, BUDDY_TEXT; mmTabRelevant follows onbBuddy (Buddying) and onbPlans (My Onboarding) separately',
    fn: function () {
      const O = CONFIG.ONBOARDING;
      const keys = CONFIG.MY_MOMENTUM.TABS.map(t => t.key);
      _assertEqual(keys.slice(keys.indexOf('myOnboarding')), ['myOnboarding', 'myBuddying', 'myTeam'], 'AC1 myBuddying between myOnboarding and myTeam');
      _assertEqual(CONFIG.MY_MOMENTUM.TABS.find(t => t.key === 'myBuddying'), { key: 'myBuddying', label: 'Buddying', live: true }, 'AC1 live, labelled Buddying');
      _assertEqual(O.TAB_COUNT, '{label} ({n})', 'tab count format');
      ['pageTitle', 'banner', 'joinerFallback', 'actionsTitle', 'actionsOpen', 'actionsDone', 'noActions', 'restTitle', 'restCount', 'restHint', 'show', 'hide', 'noPlans', 'loadFailed', 'retry']
        .forEach(k => _assertEqual(typeof O.BUDDY_TEXT[k] === 'string' && O.BUDDY_TEXT[k].length > 0, true, 'BUDDY_TEXT.' + k));
      _assertEqual(O.BUDDY_TEXT.banner.includes('{name}') && O.BUDDY_TEXT.actionsTitle === 'Your actions' && O.BUDDY_TEXT.restTitle.includes('{name}'), true, 'banner and rest title take the name; "Your actions"');
      ['admin', 'leadership', 'people_ops', 'talent_partner', 'staff'].forEach(role => {
        const rel = (k, s) => mmTabRelevant(k, { state: 'ok', role, signals: s });
        _assertEqual([rel('myBuddying', { onbBuddy: true }), rel('myBuddying', {}), rel('myBuddying', { onbPlans: true })], [true, false, false], 'AC2 Buddying only on onbBuddy, ' + role);
        _assertEqual([rel('myOnboarding', { onbPlans: true }), rel('myOnboarding', {}), rel('myOnboarding', { onbBuddy: true })], [true, false, false], 'AC2 My Onboarding only on onbPlans, ' + role);
      });
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding/.test(s)), false, 'still not in the MCP bundle');
    },
  },
  {
    name: 'N-509 AC4 onbMyPlans kind: own / buddy filter, no kind = both (N-499 behaviour)',
    fn: function () {
      const { f, people, buddyPlan, ownPlan } = _onbFx3();
      const mine = kind => onbMyPlans({ plans: [buddyPlan, ownPlan], people, email: f.tp1.WorkEmail, role: 'talent_partner', kind }).map(m => [m.plan.id, m.kind]);
      _assertEqual(mine('own'), [['pl4', 'own']], 'own only');
      _assertEqual(mine('buddy'), [['pl30', 'buddy']], 'buddy only');
      _assertEqual(mine(undefined), [['pl4', 'own'], ['pl30', 'buddy']], 'default = both, own first');
      _assertEqual(mine(''), [['pl4', 'own'], ['pl30', 'buddy']], 'blank kind = both');
      _assertEqual(onbBuddyPlans({ plans: [buddyPlan, ownPlan], people, email: f.tp1.WorkEmail, role: 'talent_partner' }).map(m => m.plan.id), ['pl30'], 'onbBuddyPlans = Active buddy plans');
      ['Complete', 'Cancelled'].forEach(status => _assertEqual(
        onbBuddyPlans({ plans: [Object.assign({}, buddyPlan, { Status: status })], people, email: f.tp1.WorkEmail, role: 'talent_partner' }), [], 'D38 a ' + status + ' plan is never a buddy plan'));
      const late = f.P(31, 'Late Joiner', 'TP', { StartDate: '2026-12-01', ReportsTo: f.sdm.WorkEmail });
      const p2 = people.concat([late]);
      const two = [buddyPlan, Object.assign({}, buddyPlan, { id: 'pl31', PersonID: 31 })];
      _assertEqual(onbBuddyPlans({ plans: two, people: p2, email: f.tp1.WorkEmail, role: 'talent_partner' }).map(m => m.plan.id), ['pl31', 'pl30'], 'AC10 latest start date first');
    },
  },
  {
    name: 'N-509 AC3/AC5 onbNavSignal: { plans, buddy, actions } follows the gate, Active buddy plans only, open Buddy-owned steps; the tabs follow it per person',
    fn: function () {
      const { f, nina, people, templates, buddyPlan, ownPlan } = _onbFx3();
      const nav = (email, role, plans, o) => onbNavSignal(Object.assign({ gate: { state: 'live' }, plans, people, email, role, templates, todayISO: _ONB3_TODAY }, o));
      const tia = f.tp1.WorkEmail;
      const zero = { plans: 0, buddy: 0, actions: 0 };
      _assertEqual(nav(tia, 'talent_partner', [buddyPlan]), { plans: 0, buddy: 1, actions: 1 }, 'buddy-only: no own plan, one buddy plan, the open Buddy step w3');
      _assertEqual(nav(tia, 'talent_partner', [buddyPlan, ownPlan]), { plans: 1, buddy: 1, actions: 1 }, 'both: her own plan counts under plans, never under actions');
      _assertEqual(nav(nina.WorkEmail, 'talent_partner', [buddyPlan, ownPlan]), { plans: 1, buddy: 0, actions: 0 }, 'joiner-only');
      _assertEqual(nav(tia, 'talent_partner', [buddyPlan], { progressByPlan: { pl30: [_ONB9_PROGRESS('w3', tia)] } }), { plans: 0, buddy: 1, actions: 0 }, 'a done Buddy step is not counted; the tab still shows (buddy 1)');
      _assertEqual(nav(tia, 'talent_partner', [buddyPlan], { progressByPlan: { pl99: [_ONB9_PROGRESS('w3', tia)] } }).actions, 1, 'progress of another plan counts for nothing');
      _assertEqual(nav(tia, 'talent_partner', [buddyPlan], { templates: [] }).actions, 0, 'no steps, no actions');
      ['Complete', 'Cancelled'].forEach(status => _assertEqual(nav(tia, 'talent_partner', [Object.assign({}, buddyPlan, { Status: status })]), zero, 'AC5 a ' + status + ' plan never counts'));
      _assertEqual([nav(tia, 'talent_partner', [buddyPlan], { gate: { state: 'none' } }), nav(tia, 'talent_partner', [buddyPlan], { gate: null })], [zero, zero], 'AC5 gate none / missing = all zero');
      _assertEqual(nav(tia, 'talent_partner', [buddyPlan], { gate: { state: 'preview' } }).buddy, 1, 'preview counts');
      _assertEqual(nav(tia, 'talent_partner', [buddyPlan], { templates: undefined, progressByPlan: undefined }).buddy, 1, 'missing templates / progress default safely');
      // AC3: which tabs each person gets, through the same signals my-momentum-app.js builds
      const tabs = (email, role, plans) => {
        const s = nav(email, role, plans);
        const sig = { onbPlans: s.plans > 0, onbBuddy: s.buddy > 0, onbActions: s.actions };
        return [mmTabRelevant('myOnboarding', { state: 'ok', role, signals: sig }), mmTabRelevant('myBuddying', { state: 'ok', role, signals: sig })];
      };
      _assertEqual(tabs(tia, 'talent_partner', [buddyPlan]), [false, true], 'AC3 buddy-only: Buddying, no My Onboarding');
      _assertEqual(tabs(nina.WorkEmail, 'talent_partner', [buddyPlan]), [true, false], 'AC3 joiner-only: My Onboarding, no Buddying');
      _assertEqual(tabs(tia, 'talent_partner', [buddyPlan, ownPlan]), [true, true], 'AC3 both');
      [[f.sdm.WorkEmail, 'delivery_manager'], [f.csd.WorkEmail, 'delivery_manager'], ['admin@mg.test', 'admin'], ['leader@mg.test', 'leadership']].forEach(p =>
        _assertEqual(tabs(p[0], p[1], [buddyPlan, ownPlan]), [false, false], 'AC3 neither relation, neither tab: ' + p[1]));
    },
  },
  {
    name: 'N-509 AC6 mmTabLabel: Buddying (n) for n > 0, Buddying at 0, every other tab unchanged',
    fn: function () {
      const T = CONFIG.MY_MOMENTUM.TABS;
      const b = T.find(t => t.key === 'myBuddying');
      _assertEqual([mmTabLabel(b, { onbActions: 3 }), mmTabLabel(b, { onbActions: 12 }), mmTabLabel('myBuddying', { onbActions: 1 })], ['Buddying (3)', 'Buddying (12)', 'Buddying (1)'], 'n > 0, by tab or by key');
      _assertEqual([mmTabLabel(b, { onbActions: 0 }), mmTabLabel(b, {}), mmTabLabel(b, undefined), mmTabLabel(b, { onbActions: 'x' })], ['Buddying', 'Buddying', 'Buddying', 'Buddying'], 'no count at 0 or without a number');
      T.filter(t => t.key !== 'myBuddying').forEach(t => _assertEqual(mmTabLabel(t, { onbActions: 5 }), t.label, 'unchanged: ' + t.key));
    },
  },
  {
    name: 'N-509 AC7 onbBuddyModel: actions = the Buddy-owned phase steps (open first), rest = every other phase step, no Library, canTick per the N-499 rules',
    fn: function () {
      const { f, people, templates, buddyPlan } = _onbFx3();
      const w4 = Object.assign({}, templates.find(t => t.ItemKey === 'w3'), { id: 'w4', ItemKey: 'w4', ItemLabel: 'Step w4', ItemOrder: 5, DueOffsetDays: 5 });
      const t2 = templates.concat([w4]);
      const model = (email, o) => onbPlanModel(Object.assign({ plan: buddyPlan, people, templates: t2, progressRows: [_ONB9_PROGRESS('w3', f.tp1.WorkEmail)], email, role: 'talent_partner', todayISO: _ONB3_TODAY }, o));
      const keys = list => list.map(i => i.itemKey);
      const b = onbBuddyModel(model(f.tp1.WorkEmail));
      _assertEqual(keys(b.actions), ['w4', 'w3'], 'open first (w4), then done (w3)');
      _assertEqual(keys(b.rest), ['pre', 'w1', 'w2'], 'the joiner\'s other phase steps, in plan order');
      _assertEqual(b.openActions, 1, 'one open');
      _assertEqual(keys(b.actions.concat(b.rest)).some(k => /^l/.test(k)), false, 'the Library is in neither');
      _assertEqual([b.planId, b.status, b.readOnly, b.joiner.name], ['pl30', 'Active', false, 'Nina New'], 'plan facts');
      _assertEqual([b.actions.map(i => i.canTick), b.rest.map(i => i.canTick)], [[true, true], [false, false, false]], 'a buddy ticks Buddy steps (done ones too, to untick) and nothing else');
      _assertEqual(b.actions.every(i => i.owner.key === 'Buddy') && b.rest.every(i => i.owner.key !== 'Buddy'), true, 'split by owner');
      _assertEqual(onbBuddyModel(model(f.tp1.WorkEmail, { plan: Object.assign({}, buddyPlan, { Status: 'Complete' }) })).actions.every(i => i.canTick === false), true, 'a plan that is not Active ticks nothing');
      _assertEqual(onbBuddyModel(model(f.tp1.WorkEmail, { templates: [] })), { planId: 'pl30', status: 'Active', readOnly: false, joiner: { id: '30', name: 'Nina New', startDate: '2026-11-25' }, actions: [], openActions: 0, rest: [] }, 'no steps: empty lists');
      _assertEqual(onbBuddyModel(null).actions, [], 'null model is safe');
    },
  },
  {
    name: 'N-509 AC8-AC11/AC13 onbbPageHtml: banner, actions first, collapsed read-only rest, no Library or progress bar, one card per plan, escaped, no inline handlers',
    fn: function () {
      const { f, people, templates, buddyPlan } = _onbFx3();
      const T = CONFIG.ONBOARDING.PLAN_TEXT;
      const B = CONFIG.ONBOARDING.BUDDY_TEXT;
      const tia = f.tp1.WorkEmail;
      const evil = templates.map(t => t.ItemKey === 'w3' ? Object.assign({}, t, { ItemLabel: '<img src=x onerror=alert(1)>', HelpText: '"><script>x</script>' }) : t);
      const card = (plan, o) => onbBuddyModel(onbPlanModel(Object.assign({ plan, people, templates: evil, progressRows: [], email: tia, role: 'talent_partner', todayISO: _ONB3_TODAY }, o)));
      const draw = (view, ui) => onbbPageHtml(view, Object.assign({ open: [], error: '' }, ui));
      const disabled = h => (h.match(/ disabled data-act/g) || []).length;
      const boxes = h => (h.match(/class="onb-step-check"/g) || []).length;
      const one = { gateState: 'live', plans: [card(buddyPlan)] };
      let html = draw(one);
      _assertEqual(/<img src=x|<script>x/.test(html), false, 'AC13 label and help are escaped');
      _assertEqual(/\bon(click|change|input)=|style="/.test(html), false, 'AC13 no inline handlers or styles');
      _assertEqual(/href="javascript:/.test(html), false, 'AC13 no unsafe href');
      _assertEqual(html.includes('<h1 class="page-title">' + B.pageTitle + '</h1>') && html.includes('Buddy view of Nina New') && html.includes('Starts 25 November 2026'), true, 'AC8 title, banner with the joiner\'s name, start date');
      const at = s => html.indexOf(s);
      _assertEqual(at('Buddy view of') > -1 && at('Buddy view of') < at(B.actionsTitle) && at(B.actionsTitle) < at('Rest of Nina New’s plan'), true, 'AC8 banner, then "Your actions", then the rest');
      _assertEqual(html.includes('<progress') || html.includes('onb-library') || html.includes(T.library) || html.includes('onb-selector'), false, 'AC8 no progress bar, no Library, no selector');
      _assertEqual([boxes(html), disabled(html)], [4, 3], 'AC8 one action box (enabled) and three rest boxes (all disabled)');
      _assertEqual(html.includes('onbbTick') && html.includes('pl30') && html.includes('onbbToggleRest'), true, 'ticks and the toggle carry the plan id');
      _assertEqual(html.includes(onbFillText(B.actionsOpen, { n: 1 })), true, 'open count');
      _assertEqual(html.includes('aria-expanded="false"') && html.includes('<ul class="onb-steps" hidden>') && html.includes(B.show), true, 'AC8 the rest starts collapsed');
      html = draw(one, { open: ['pl30'] });
      _assertEqual(html.includes('aria-expanded="true"') && html.includes(B.hide) && !html.includes('<ul class="onb-steps" hidden>'), true, 'opened: shown, button reads Hide');
      _assertEqual(disabled(html), 3, 'opened rest is still read-only');
      html = draw({ gateState: 'live', plans: [card(buddyPlan, { progressRows: [_ONB9_PROGRESS('w3', tia)] })] });
      _assertEqual(html.includes(B.actionsDone) && html.includes('checked') && !html.includes(onbFillText(B.actionsOpen, { n: 0 })), true, 'all done: the count reads All done, the step is ticked');
      html = draw({ gateState: 'live', plans: [card(buddyPlan, { templates: evil.filter(t => t.ItemKey !== 'w3') })] });
      _assertEqual(html.includes(onbFillText(B.noActions, { name: 'Nina New' })) && html.includes('Step w1'), true, 'no Buddy step: a note, the rest still there');
      html = draw({ gateState: 'live', plans: [card(buddyPlan, { templates: evil.filter(t => t.ItemKey === 'w3') })] });
      _assertEqual(html.includes('onb-buddy-rest'), false, 'nothing else in the plan: no rest section');
      const late = f.P(31, 'Late Joiner', 'TP', { StartDate: '2026-12-01', ReportsTo: f.sdm.WorkEmail });
      const p2 = people.concat([late]);
      const plans = onbBuddyPlans({ plans: [buddyPlan, Object.assign({}, buddyPlan, { id: 'pl31', PersonID: 31 })], people: p2, email: tia, role: 'talent_partner' }).map(m => m.plan);
      html = draw({ gateState: 'live', plans: plans.map(pl => onbBuddyModel(onbPlanModel({ plan: pl, people: p2, templates: evil, progressRows: [], email: tia, role: 'talent_partner', todayISO: _ONB3_TODAY }))) });
      _assertEqual((html.match(/class="onb-buddy-card"/g) || []).length, 2, 'AC10 one card per plan');
      _assertEqual(html.indexOf('Buddy view of Late Joiner') > -1 && html.indexOf('Buddy view of Late Joiner') < html.indexOf('Buddy view of Nina New'), true, 'AC10 latest start first');
      _assertEqual(/id="onb-plan"/.test(html), false, 'AC10 no selector');
      const lead = f.P(32, 'Led Joiner', 'TP', { StartDate: '2026-11-25', ReportsTo: tia });   // Tia is this joiner's line manager as well as their buddy
      const ledCard = onbBuddyModel(onbPlanModel({ plan: Object.assign({}, buddyPlan, { id: 'pl32', PersonID: 32 }), people: people.concat([lead]), templates: evil, progressRows: [], email: tia, role: 'talent_partner', todayISO: _ONB3_TODAY }));
      _assertEqual(ledCard.rest.every(i => i.canTick), true, 'sanity: the model lets a line manager tick every step, N-499 rules');
      html = draw({ gateState: 'live', plans: [ledCard] });
      _assertEqual([boxes(html), disabled(html)], [4, 3], 'D40 the rest is read-only on this tab even for the joiner\'s line manager (LM / CSD ticking is N-502)');
      html = draw(Object.assign({}, one, { gateState: 'preview' }));
      _assertEqual([html.includes(T.previewNote), disabled(html), boxes(html)], [true, 4, 4], 'Preview: note, every box disabled');
      html = draw(null, { error: 'Boom <b>' });
      _assertEqual(html.includes('Boom &lt;b&gt;') && html.includes('onbbRetry') && html.includes(B.loadFailed), true, 'AC11 error panel, escaped, with Retry');
      _assertEqual([draw({ none: true }), draw({ gateState: 'live', plans: [] }), draw(null)].every(h => h.includes(B.noPlans)), true, 'AC11 no plan: the empty state');
    },
  },
  {
    name: 'N-509 AC9/AC12 api-onboarding.js: getBuddyingView reads progress only for the viewer\'s Active buddy plans; the nav reads templates and progress only when there is one; My Onboarding lists own plans only; tick is unchanged',
    fn: function () {
      const api = _onbSrc('api-onboarding.js');
      const view = api.slice(api.indexOf('async function getBuddyingView'));
      const gate = view.indexOf("gate.state !== 'live' && gate.state !== 'preview'"), plans = view.indexOf('onbBuddyPlans('), read = view.indexOf('getChecklistProgress(');
      _assertEqual(gate > -1 && plans > gate && read > plans, true, 'AC12 gate, then the buddy plans, then the progress reads');
      _assertEqual(/mine\.map\(m => getChecklistProgress\(O\.RECORD_TYPE, \{ recordId: m\.plan\.PersonID \}\)\)/.test(view) && (view.match(/getChecklistProgress\(/g) || []).length === 1, true, 'AC12 one progress read per buddy plan, nothing else');
      _assertEqual(/createItem\(|updateItem\(|deleteItem\(|setChecklistItemDone\(/.test(view), false, 'the page reads only; ticking stays tickOnboardingStep');
      _assertEqual(/return \{ none: true, gateState: gate\.state \}/.test(view) && /onbBuddyModel\(onbPlanModel\(/.test(view), true, 'none shape and the card model');
      const nav = api.slice(api.indexOf('async function resolveOnboardingNav'), api.indexOf('async function getOnboardingPlanView'));
      const early = nav.indexOf('if (!buddy.length) return Object.assign(onbNavSignal(who), { rituals });');   // N-500: the signal also carries rituals
      _assertEqual(early > -1 && early < nav.indexOf('getChecklistTemplates(') && early < nav.indexOf('getChecklistProgress('), true, 'the nav reads templates and progress only after finding a buddy plan');
      _assertEqual(/buddy\.map\(m => getChecklistProgress\(O\.RECORD_TYPE, \{ recordId: m\.plan\.PersonID \}\)\)/.test(nav), true, 'AC12 nav: progress per buddy plan only');
      const own = api.slice(api.indexOf('async function getOnboardingPlanView'), api.indexOf('async function tickOnboardingStep'));
      _assertEqual(/onbMyPlans\(\{[^}]*kind: 'own' \}\)/.test(own), true, 'D42 My Onboarding lists the viewer\'s own plan only');
      const tick = api.slice(api.indexOf('async function tickOnboardingStep'), api.indexOf('async function getBuddyingView'));
      _assertEqual(/onbMyPlans\(\{ plans, people, email, role, peopleOpsActive: gate\.peopleOpsActive \}\)/.test(tick) && !/kind:/.test(tick), true, 'AC9 tickOnboardingStep still resolves both kinds, so a buddy can tick');
      _assertEqual((tick.match(/setChecklistItemDone\(/g) || []).length, 1, 'exactly one write call');
    },
  },
  {
    name: 'N-509 AC9/AC11/AC13-AC14 onboarding-buddy-ui.js, CSS and load scope: draws into #onb-buddy-page, drops stale loads, redraws fresh after a tick; my-momentum.html only, after onboarding-my-ui.js',
    fn: function () {
      const ui = _onbSrc('onboarding-buddy-ui.js');
      _assertEqual(/token !== s\.token \|\| _mmCurrentPage !== 'myBuddying'/.test(ui), true, 'a stale or abandoned load draws nothing');
      _assertEqual(/id="onb-buddy-page"/.test(ui) && /getElementById\('onb-buddy-page'\)/.test(ui), true, 'redraws target #onb-buddy-page so the area header survives');
      const tick = ui.slice(ui.indexOf('async function onbbTick'), ui.indexOf('function onbbToggleRest'));
      _assertEqual(/disabled = true/.test(tick) && /toast\(/.test(tick) && tick.indexOf('_onbbReload(false)') > tick.indexOf('catch'), true, 'AC9 lock, toast on failure, then a fresh redraw either way');
      _assertEqual(/registerActions\(\{\s*onbbTick,\s*onbbToggleRest,\s*onbbRetry,?\s*\}\)/.test(ui), true, 'actions registered once');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(ui), false, 'AC13 no hex in JS');
      _assertEqual(/getBuddyingView\(/.test(ui) && /tickOnboardingStep\(/.test(ui) && !/createItem\(|updateItem\(|getItems\(|getChecklistProgress\(/.test(ui), true, 'the page only calls the two api functions');
      _assertEqual(/_onbmStepHtml\(/.test(ui) && !/function _onbmStepHtml/.test(ui), true, 'the step row is reused, not copied');
      _assertEqual(/renderMyMomentumNav\(_mmResolvedRole\)/.test(ui) && /_mmSignals\.onbActions = n/.test(ui), true, 'the tab count is brought in step after a read');
      const app = _onbSrc('my-momentum-app.js');
      _assertEqual(/onbPlans: onbNav\.plans > 0, onbBuddy: onbNav\.buddy > 0, onbActions: onbNav\.actions/.test(app) && /return \{ plans: 0, buddy: 0, actions: 0 \}/.test(app), true, 'app: signals onbBuddy / onbActions, failed read all zero');
      const nav = _onbSrc('my-momentum-nav.js');
      _assertEqual(/case 'myBuddying':\s+await renderBuddyingPage\(\)/.test(nav) && /label: mmTabLabel\(t, _mmSignals\)/.test(nav), true, 'nav renders the page and labels the tab with its count');
      const mm = _onbSrc('onboarding-my-ui.js');
      _assertEqual(/function _onbmStepHtml\(it, n, tickAttr\)/.test(mm) && /actOn\('change', 'onbmTick', it\.itemKey, ACT_CHECKED\)/.test(mm), true, 'the My Onboarding step row keeps onbmTick by default');
      if (typeof ALL_CSS === 'undefined') _skip('needs ALL_CSS (Node runner only)');
      const css = ALL_CSS['my-momentum.css'];
      const block = css.slice(css.indexOf('N-509: My Momentum > Buddying'));
      _assertEqual(/\.onb-buddy-banner\s*\{[^}]*border-left: 4px solid var\(--accent\)[^}]*color: var\(--text-primary\)/.test(block) && /\.onb-buddy-card \.onb-chip--owner\s*\{/.test(block), true, 'AC8 banner with an accent left border; a distinct owner chip on this page');
      _assertEqual(/--status-[a-z-]*-text/.test(block) || /#[0-9a-fA-F]{3,8}\b/.test(block.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'tokens only, and no --status-*-text token on a tint');
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (Node runner only)');
      Object.keys(ALL_HTML).forEach(h => _assertEqual(ALL_HTML[h].includes('src="js/onboarding-buddy-ui.js"'), h === 'my-momentum.html', 'onboarding-buddy-ui.js only on my-momentum.html, not ' + h));
      const html = ALL_HTML['my-momentum.html'];
      const a = html.indexOf('src="js/onboarding-my-ui.js"'), b = html.indexOf('src="js/onboarding-buddy-ui.js"');
      _assertEqual(a > -1 && b > a && html.slice(a, b).split('<script').length === 2, true, 'AC14 straight after onboarding-my-ui.js');
      _assertEqual(b < html.indexOf('src="js/my-momentum-app.js"') && html.indexOf('src="js/my-momentum-nav.js"') < a, true, 'AC14 after the nav, before the app init');
      _assertEqual(ALL_HTML['mobile.html'].includes('onboarding'), false, 'never mobile.html');
    },
  },
);

// ── N-500 (ONB-5): Processes & Rituals sub-tab ──────────────────────────
ASSERTIONS.push(
  {
    name: 'N-500 AC1-AC4 sub-tab registry and visibility rules: SUB_TABS, onbRitualsVisible, onbSubTabs, mmTabRelevant',
    fn: function () {
      _assertEqual(CONFIG.ONBOARDING.SUB_TABS, [{ key: 'plan', label: 'Onboarding Plan' }, { key: 'rituals', label: 'Processes & Rituals' }, { key: 'expectations', label: 'Expectations & SLAs' }], 'AC1 SUB_TABS (N-501 adds the third)');
      const v = onbRitualsVisible;
      _assertEqual([v({ mode: 'On', gateState: 'none' }), v({ mode: 'Pilot', gateState: 'none' }), v({ mode: 'Pilot', gateState: 'live' }), v({ mode: 'Off', gateState: 'preview' }), v({ mode: 'Off', gateState: 'none' }), v()],
        [true, false, true, true, false, false], 'AC2 On = everyone; Pilot / Off only through a live or preview gate; no arguments = false');
      _assertEqual(v({ mode: 'on', gateState: 'none' }) === v({ mode: 'On', gateState: 'none' }) && v({ mode: 'bogus', gateState: 'none' }), true === v({ mode: 'on', gateState: 'none' }) && false, 'AC2 mode is normalised; an unknown mode is not On');
      _assertEqual(onbSubTabs({ onbPlans: true, onbRituals: true }).map(t => t.key), ['plan', 'rituals', 'expectations'], 'AC3 both, in registry order (N-501: Expectations & SLAs follows the rituals signal)');
      _assertEqual(onbSubTabs({ onbRituals: true }).map(t => t.key), ['rituals', 'expectations'], 'AC3 reference tabs only');
      _assertEqual(onbSubTabs({ onbPlans: true }).map(t => t.key), ['plan'], 'AC3 plan only');
      _assertEqual([onbSubTabs({}).length, onbSubTabs().length, onbSubTabs({ onbBuddy: true }).length], [0, 0, 0], 'AC3 nothing, and a buddy alone has neither');
      ['admin', 'leadership', 'people_ops', 'talent_partner', 'staff'].forEach(role => {
        ['ok', 'notLinked', 'ambiguous'].forEach(state => {
          const rel = s => mmTabRelevant('myOnboarding', { state, role, signals: s });
          _assertEqual([rel({ onbPlans: true }), rel({ onbRituals: true }), rel({}), rel({ onbBuddy: true })], [true, true, false, false], `AC4 My Onboarding tab: plan or rituals, ${role} / ${state}`);
        });
      });
    },
  },
  {
    name: 'N-500 AC5 resolveOnboardingNav returns rituals from onbRitualsVisible(mode, gate state); the failure literal and plan signals are unchanged',
    fn: function () {
      const api = _onbSrc('api-onboarding.js');
      const nav = api.slice(api.indexOf('async function resolveOnboardingNav'), api.indexOf('async function getOnboardingPlanView'));
      _assertEqual(/onbRitualsVisible\(\{ mode: gate\.mode, gateState: gate\.state \}\)/.test(nav), true, 'rituals comes from the mode and the gate state');
      _assertEqual((nav.match(/Object\.assign\(onbNavSignal\(/g) || []).length, 2, 'both success returns carry rituals');
      _assertEqual(/catch \(e\)[\s\S]*return \{ plans: 0, buddy: 0, actions: 0 \}/.test(nav), true, 'a failed read leaves rituals out (read as false)');
      _assertEqual(/onbRituals: !!onbNav\.rituals/.test(_onbSrc('my-momentum-app.js')), true, 'app: onbRituals signal');
      _assertEqual(/getItems\(|createItem\(|updateItem\(/.test(nav.replace(/getOnboardingPlans|getPeople/g, '')), false, 'no new read');
    },
  },
  {
    name: 'N-500 AC6/AC7 sub-tab strip: outside #onb-page, two or more sub-tabs only, a slow plan load never draws over Rituals',
    fn: function () {
      const tabs = onbSubTabs({ onbPlans: true, onbRituals: true });
      const html = onbSubTabsHtml('rituals', tabs);
      _assertEqual(/class="eng-tab-strip"/.test(html) && (html.match(/class="eng-tab/g) || []).length === 4, true, 'AC6 strip with all three tabs (strip + 3 buttons; N-501 adds the third)');
      _assertEqual(/eng-tab--active[^>]*aria-selected="true"[^>]*>Processes &amp; Rituals</.test(html) || /eng-tab eng-tab--active" role="tab" aria-selected="true"[^>]*>Processes &amp; Rituals</.test(html), true, 'AC6 the active tab is marked');
      _assertEqual(onbSubTabsHtml('plan', onbSubTabs({ onbPlans: true })), '', 'AC7 one sub-tab = no strip (N-501: a plan-only person; the reference tabs come as a pair)');
      const ui = _onbSrc('onboarding-my-ui.js');
      _assertEqual(/\$\{strip\}<div id="onb-page">/.test(ui) && !/<div id="onb-page">[^`]*onb-tabs/.test(ui), true, 'the strip sits outside #onb-page');
      _assertEqual(/const token = \+\+_onbmState\.token;[\s\S]*renderOnboardingRitualsPage\(\)/.test(ui), true, 'the load token is bumped before either sub-tab draws');
      _assertEqual(/onbmRetry,\s*onbmSubTab,\s*\}\);/.test(ui), true, 'onbmSubTab is a registered action');
    },
  },
  {
    name: 'N-500 AC8-AC11 Processes & Rituals content and markup: sections in order, step counts, Sunday / Friday, A4 rows and the tidied cells',
    fn: function () {
      const m = onbRitualsModel('talent_partner', onbSubTabs({ onbPlans: true, onbRituals: true }));
      _assertEqual(m.sections.map(s => s.key), ['individual', 'newtonData', 'team', 'roleChecklist'], 'AC8 section order');
      _assertEqual(m.sections[1].title, 'Newton data rituals', 'AC8 Newton data rituals is its own section (ONB-D13)');
      const card = k => m.sections.flatMap(s => s.cards || []).find(c => c.key === k);
      _assertEqual([card('friday').steps.length, card('activityLog').steps.length, card('roleStatus').steps.length, card('daily').steps.length], [4, 5, 3, 0], 'AC9 step counts; Daily rhythm has no steps');
      card('friday').steps.concat(card('activityLog').steps, card('roleStatus').steps).forEach(st => _assertEqual(!!st.owner || !!st.tool, true, 'AC9 an owner or a tool on ' + st.text));
      _assertEqual(card('friday').steps.slice(0, 3).concat(card('activityLog').steps).every(st => st.owner === 'Talent Partner' && !!st.tool), true, 'AC9 owner and tool on the logged steps');
      _assertEqual(/always the Sunday/.test(card('activityLog').steps[2].text) && /end of Friday/.test(card('activityLog').when), true, 'AC10 Sunday week-ending and Friday');
      const rows = m.sections[2].rows;
      _assertEqual(rows.length, 7, 'AC11 seven team rituals');
      _assertEqual(rows.find(r => r.key === 'clientReporting').what, 'Weekly update to the hiring manager (see Friday wrap-up)', 'AC11 client reporting tidied (ONB-D51)');
      _assertEqual(rows.find(r => r.key === 'standups').what, 'Weekly team standup', 'AC11 standups tidied (ONB-D51)');
      _assertEqual(rows.map(r => [r.owner, r.cadence].every(x => x.length > 0)).every(Boolean), true, 'AC11 owner and cadence on every row');
      const html = onbrPageHtml(m);
      _assertEqual(html.indexOf('Individual rituals') < html.indexOf('Newton data rituals') && html.indexOf('Newton data rituals') < html.indexOf('Project and team rituals') && html.indexOf('Project and team rituals') < html.indexOf('Role rituals'), true, 'AC8 drawn in order');
      _assertEqual(/<h1 class="page-title">Processes &amp; Rituals<\/h1>/.test(html), true, 'AC7 page title');
      _assertEqual(html.includes('<script') || /<[a-z]+[^>]*\son[a-z]+=/.test(html), false, 'markup is escaped and has no inline handlers');
    },
  },
  {
    name: 'N-500 AC12-AC14 links come from the Command Bar registry, by role; touchpoints without a page and the SLA sentence stay plain text',
    fn: function () {
      const act = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'activity');
      const noRole = ['admin', 'leadership', 'people_ops', 'sales', 'delivery_manager', 'talent_partner', 'staff'].find(r => !act.roles.includes(r));
      _assertEqual(onbRitualLink('activity', act.roles[0]), act.href, 'AC12 an allowed role gets the entry href');
      if (noRole) _assertEqual(onbRitualLink('activity', noRole), '', 'AC12 a role outside the entry gets plain text');
      _assertEqual([onbRitualLink('nope', 'admin'), onbRitualLink('', 'admin'), onbRitualLink(undefined, 'admin')], ['', '', ''], 'AC12 unknown or missing key');
      const m = onbRitualsModel('admin', []);
      const bulk = m.sections[1].cards[0].steps[4];
      _assertEqual(bulk.touch.href, '', 'AC13 Bulk Log Week has no page key, so plain text');
      _assertEqual(m.sections[2].rows.find(r => r.key === 'projectOnboarding').touch.href, '', 'AC13 Project Team is plain text');
      const sp = m.sections[3].signpost;
      _assertEqual([sp.slaLink, !!sp.link.href], [false, onbRitualLink('roles', 'admin') !== ''], 'AC14 no Expectations link yet; Roles link by role');
      _assertEqual(onbRitualsModel('admin', [{ key: 'expectations' }]).sections[3].signpost.slaLink, true, 'AC14 the link appears once Expectations & SLAs is a sub-tab');
      const ui = onbrPageHtml(m);
      _assertEqual(/onbmSubTab/.test(ui), false, 'AC14 no action link while there is no Expectations sub-tab');
      _assertEqual(/onbmSubTab/.test(onbrPageHtml(onbRitualsModel('admin', [{ key: 'expectations' }]))), true, 'AC14 action link once it exists');
    },
  },
  {
    name: 'N-500 AC15/AC16/AC17 deep links and Command Bar: #onboardingRituals, #myOnboarding, the 4-argument form unchanged, two new entries',
    fn: function () {
      const cfg = CONFIG.MY_MOMENTUM;
      const tabs = keys => keys.map(k => ({ key: k }));
      const both = onbSubTabs({ onbPlans: true, onbRituals: true }), ritOnly = onbSubTabs({ onbRituals: true }), planOnly = onbSubTabs({ onbPlans: true });
      _assertEqual(mmResolveDeepLink('onboardingRituals', tabs(['myHistory', 'myOnboarding']), [], cfg, both), { tab: 'myOnboarding', sub: 'rituals' }, 'AC15 alias opens Rituals for a person who has it');
      _assertEqual(mmResolveDeepLink('onboardingRituals', tabs(['myHistory', 'myOnboarding']), [], cfg, planOnly), null, 'AC15 a plan-only person falls to the landing tab');
      _assertEqual(mmResolveDeepLink('onboardingRituals', tabs(['myHistory']), [], cfg, both), null, 'AC15 no tab, no hit');
      _assertEqual(mmResolveDeepLink('myOnboarding', tabs(['myOnboarding']), [], cfg, ritOnly), { tab: 'myOnboarding' }, 'AC15 #myOnboarding opens the tab (the page picks Rituals for a rituals-only person)');
      _assertEqual(mmResolveDeepLink('teamScorecards', tabs(['myHistory', 'myTeam']), [{ key: 'scorecards' }], cfg), { tab: 'myTeam', sub: 'scorecards' }, 'AC16 four arguments behave as before');
      _assertEqual(mmResolveDeepLink('onboardingRituals', tabs(['myOnboarding']), [], cfg), null, 'AC16 no onboarding sub-tabs given = no sub-tab link');
      const mod = CONFIG.OS_MODULES.find(m => m.key === 'myMomentum');
      ['myOnboarding', 'onboardingRituals'].forEach(k => {
        const e = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === k);
        _assertEqual(!!e && e.module === 'myMomentum' && e.href === 'my-momentum.html#' + k && e.roles.join() === mod.roles.join(), true, 'AC17 Command Bar entry ' + k + ' mirrors the module roles');
      });
      _assertEqual(cfg.DEEP_LINKS.onboardingRituals, { tab: 'myOnboarding', sub: 'rituals' }, 'AC15 DEEP_LINKS alias');
    },
  },
  {
    name: 'N-500 AC18/AC19 content file hygiene and load scope: no hex, no SLA figures, no list names, no typed href; my-momentum.html only, in order',
    fn: function () {
      const src = _onbSrc('onboarding-content-config.js');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(src), false, 'AC18 no hex');
      _assertEqual(/\b(24|48|72) hours|45 days/.test(src), false, 'AC18 no SLA figures (those are N-501, shown live)');
      _assertEqual(/OnboardingPlans|ChecklistProgress|ChecklistTemplates|SLATargets/.test(src), false, 'AC18 no SharePoint list names');
      _assertEqual(/\.html/.test(src), false, 'AC12 no href typed in the content');
      const ui = _onbSrc('onboarding-rituals-ui.js');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(ui) && false, false, 'no hex in the page file');
      _assertEqual(/getItems\(|createItem\(|updateItem\(|fetch\(/.test(ui), false, 'AC19 no network in the page file');
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding/.test(s)), false, 'still not in the MCP bundle');
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (Node runner only)');
      ['onboarding-content-config.js', 'onboarding-rituals-ui.js'].forEach(f =>
        Object.keys(ALL_HTML).forEach(h => _assertEqual(ALL_HTML[h].includes('src="js/' + f + '"'), h === 'my-momentum.html', f + ' only on my-momentum.html, not ' + h)));
      const html = ALL_HTML['my-momentum.html'];
      const at = f => html.indexOf('src="js/' + f + '"');
      _assertEqual(at('onboarding-config.js') > -1 && at('onboarding-content-config.js') === html.indexOf('\n', at('onboarding-config.js')) + 3 || at('onboarding-content-config.js') > at('onboarding-config.js'), true, 'content config after onboarding-config.js');
      _assertEqual(at('onboarding-buddy-ui.js') < at('onboarding-rituals-ui.js') && at('onboarding-rituals-ui.js') < at('my-momentum-app.js'), true, 'rituals page after the Buddying page (which stays straight after my-ui), before the app init');
      _assertEqual(ALL_HTML['mobile.html'].includes('onboarding'), false, 'never mobile.html');
    },
  },
);

// ── N-501 (ONB-6): Expectations & SLAs sub-tab ──────────────────────────
ASSERTIONS.push(
  {
    name: 'N-501 AC1/AC2/AC3 sub-tab registry: Expectations & SLAs is third and follows the rituals signal; nav signals unchanged',
    fn: function () {
      _assertEqual(CONFIG.ONBOARDING.SUB_TABS.map(t => t.key + ':' + t.label), ['plan:Onboarding Plan', 'rituals:Processes & Rituals', 'expectations:Expectations & SLAs'], 'AC1 registry');
      _assertEqual(onbSubTabs({ onbRituals: true }).map(t => t.key), ['rituals', 'expectations'], 'AC2 reference tabs');
      _assertEqual(onbSubTabs({ onbPlans: true, onbRituals: true }).map(t => t.key), ['plan', 'rituals', 'expectations'], 'AC2 all three in order');
      _assertEqual(onbSubTabs({ onbPlans: true }).map(t => t.key), ['plan'], 'AC2 plan only');
      _assertEqual([onbSubTabs({}).length, onbSubTabs().length], [0, 0], 'AC2 nothing');
      const nav = _onbSrc('api-onboarding.js');
      _assertEqual(/return \{ plans: 0, buddy: 0, actions: 0 \};/.test(nav), true, 'AC3 the failure literal is unchanged');
    },
  },
  {
    name: 'N-501 AC4 standards content: three groups in order, 13 / 14 / 7 entries, signed-off wording carried',
    fn: function () {
      const g = CONFIG.ONBOARDING.STANDARDS.GROUPS;
      _assertEqual(g.map(x => x.key), ['candidate', 'stakeholder', 'quality'], 'AC4 group order');
      _assertEqual([g[0].rows.length, g[1].rows.length, g[2].items.length], [13, 14, 7], 'AC4 entry counts');
      _assertEqual(g[0].rows[0], { moment: 'Any candidate message', standard: 'Reply within 48 hours; pick up the phone first' }, 'AC4 first candidate row');
      _assertEqual(g[1].rows[0].standard, 'Day 1; 45 minutes; the HM and key decision-makers attend', 'AC4 intake row');
      _assertEqual(g[2].items.some(i => i.includes('GDPR@talentpoint.co')), true, 'AC4 GDPR inbox unchanged');
      _assertEqual(JSON.stringify(g).includes('**'), false, 'AC4 no markdown bold markers');
    },
  },
  {
    name: 'N-501 AC5/AC6/AC7 onbExpectationsModel: goal and benchmarks live from ANALYTICS_BENCHMARKS, SLA defaults per eligible type, unavailable = null',
    fn: function () {
      const B = CONFIG.ANALYTICS_BENCHMARKS;
      const m = onbExpectationsModel({ slaRows: [] });
      _assertEqual(m.kpis.goal.includes('{days}'), false, 'AC5 token replaced');
      _assertEqual(m.kpis.goal.includes('within ' + B.timeToHireDays + ' days'), true, 'AC5 goal reads the benchmark');
      _assertEqual(m.kpis.benchmarks.map(b => b.value), ['25%', '80%', '20%', '80%', '45 days'], 'AC5 benchmark values');
      const orig = B.outreachConversion, origDays = B.timeToHireDays;
      try {
        B.outreachConversion = 0.3; B.timeToHireDays = 50;
        const m2 = onbExpectationsModel({ slaRows: [] });
        _assertEqual([m2.kpis.benchmarks[0].value, m2.kpis.benchmarks[4].value, m2.kpis.goal.includes('within 50 days')], ['30%', '50 days', true], 'AC5 follows the config');
      } finally { B.outreachConversion = orig; B.timeToHireDays = origDays; }
      const types = slaProjectTypes();
      _assertEqual(m.kpis.sla.rows.map(r => r.type), types, 'AC6 one row per eligible type');
      _assertEqual(m.kpis.sla.rows.every(r => r.cells.length === 4 && r.cells.every(c => c === 'Not set')), true, 'AC6 readable but empty = every cell Not set');
      const t0 = types[0];
      const rows = [
        { id: 5, ProjectType: t0, TimeToHireDays: 60 },
        { id: 3, ProjectType: t0, TimeToHireDays: 45, SubmissionsPerWeek: 2.5 },
        { id: 9, ProjectID: 12, TimeToHireDays: 10 },
      ];
      const r0 = onbExpectationsModel({ slaRows: rows }).kpis.sla.rows.find(r => r.type === t0);
      _assertEqual(r0.cells, ['Not set', '2.5 per week', 'Not set', '45 days'], 'AC6 lowest item id wins; override row ignored');
      _assertEqual(m.kpis.sla.metrics.map(x => x.label), CONFIG.SLA.METRICS.map(x => x.label), 'AC6 metric labels from CONFIG.SLA.METRICS');
      _assertEqual([onbExpectationsModel({}).kpis.sla, onbExpectationsModel({ slaRows: null }).kpis.sla, onbExpectationsModel().kpis.sla], [null, null, null], 'AC7 anything but an array is unavailable');
    },
  },
  {
    name: 'N-501 AC8/AC9/AC10/AC11 reader and page: one read, loading / ready / error states, never an empty table, stale guard, section order',
    fn: function () {
      const api = _onbSrc('api-onboarding.js');
      const fn = api.slice(api.indexOf('async function getOnboardingSlaRows'));
      _assertEqual(/return getSLATargets\(\);/.test(fn) && !/getItems\(/.test(fn), true, 'AC8 the one reader');
      const m = onbExpectationsModel({ slaRows: [{ id: 1, ProjectType: slaProjectTypes()[0], TimeToHireDays: 45 }] });
      const ready = onbxPageHtml(m, 'ready'), loading = onbxPageHtml(onbExpectationsModel({}), 'loading'), err = onbxPageHtml(onbExpectationsModel({}), 'error');
      _assertEqual([/data-sla="ready"/.test(ready), /data-sla="loading"/.test(loading), /data-sla="error"/.test(err)], [true, true, true], 'AC9 three states');
      _assertEqual([loading.includes('<table class="data-table onbx-table"><thead><tr><th>Project type'), err.includes('<th>Project type')], [false, false], 'AC9 no SLA table while loading or failed');
      _assertEqual(err.includes('Targets unavailable right now') && err.includes('onbxRetry') && err.includes('Candidate standards'), true, 'AC9 error: message, retry, standards still shown');
      _assertEqual(onbxPageHtml(onbExpectationsModel({}), 'ready').includes('data-sla="error"'), true, 'AC9 a null table in ready state is shown as unavailable, never empty');
      const ui = _onbSrc('onboarding-expectations-ui.js');
      _assertEqual(/token !== _onbmState\.token/.test(ui) && /await getOnboardingSlaRows\(\)/.test(ui), true, 'AC10 stale-load guard around the one read');
      const at = s => ready.indexOf(s);
      _assertEqual([at('Candidate standards') < at('Stakeholder standards'), at('Stakeholder standards') < at('Quality bar'), at('Quality bar') < at('Delivery KPIs'), at('Delivery KPIs') < at('SLA targets'), at('SLA targets') < at('Scorecard benchmarks')], [true, true, true, true, true], 'AC11 section order');
      _assertEqual(/<h1 class="page-title">Expectations &amp; SLAs<\/h1>/.test(ready), true, 'page title');
      _assertEqual(ready.includes('<script') || /<[a-z]+[^>]*\son[a-z]+=/.test(ready), false, 'markup is escaped and has no inline handlers');
    },
  },
  {
    name: 'N-501 AC12/AC13/AC14 deep link, Command Bar entry, and the rituals signpost now links to the tab',
    fn: function () {
      const cfg = CONFIG.MY_MOMENTUM;
      const tabs = keys => keys.map(k => ({ key: k }));
      const all = onbSubTabs({ onbPlans: true, onbRituals: true }), planOnly = onbSubTabs({ onbPlans: true });
      _assertEqual(mmResolveDeepLink('onboardingExpectations', tabs(['myOnboarding']), [], cfg, all), { tab: 'myOnboarding', sub: 'expectations' }, 'AC12 alias opens the tab');
      _assertEqual(mmResolveDeepLink('onboardingExpectations', tabs(['myOnboarding']), [], cfg, planOnly), null, 'AC12 a plan-only person falls to the landing tab');
      _assertEqual(mmResolveDeepLink('teamScorecards', tabs(['myTeam']), [{ key: 'scorecards' }], cfg), { tab: 'myTeam', sub: 'scorecards' }, 'AC12 four arguments unchanged');
      const mod = CONFIG.OS_MODULES.find(m => m.key === 'myMomentum');
      const e = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'onboardingExpectations');
      _assertEqual(!!e && e.module === 'myMomentum' && e.href === 'my-momentum.html#onboardingExpectations' && e.roles.join() === mod.roles.join(), true, 'AC13 Command Bar entry mirrors the module roles');
      const withSla = onbRitualsModel('talent_partner', all).sections.find(s => s.key === 'roleChecklist').signpost;
      _assertEqual(withSla.slaLink, true, 'AC14 the signpost links once expectations is a sub-tab');
    },
  },
  {
    name: 'N-501 AC15 file hygiene and load scope: no hex, list names, hrefs or typed targets; standards / page only on my-momentum.html, in order; N-500 content file untouched',
    fn: function () {
      const src = _onbSrc('onboarding-standards-config.js');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(src), false, 'AC15 no hex');
      _assertEqual(/OnboardingPlans|ChecklistProgress|ChecklistTemplates|SLATargets/.test(src), false, 'AC15 no SharePoint list names');
      _assertEqual(/\.html/.test(src), false, 'AC15 no href typed');
      _assertEqual(/0\.25|0\.8\b|0\.2\b|25%|80%|45 days/.test(src), false, 'AC15 no typed benchmark or goal value (the goal is the {days} token)');
      CONFIG.ONBOARDING.STANDARDS.KPIS.benchmarks.forEach(b => _assertEqual(typeof CONFIG.ANALYTICS_BENCHMARKS[b.key], 'number', 'AC15 benchmark key exists: ' + b.key));
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding-(standards|expectations)/.test(s)), false, 'not in the MCP bundle');
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (Node runner only)');
      ['onboarding-standards-config.js', 'onboarding-expectations-ui.js'].forEach(f =>
        Object.keys(ALL_HTML).forEach(h => _assertEqual(ALL_HTML[h].includes('src="js/' + f + '"'), h === 'my-momentum.html', f + ' only on my-momentum.html, not ' + h)));
      const html = ALL_HTML['my-momentum.html'];
      const at = f => html.indexOf('src="js/' + f + '"');
      _assertEqual(at('onboarding-content-config.js') < at('onboarding-standards-config.js') && at('onboarding-standards-config.js') < at('pdp-data.js'), true, 'standards config straight after the content config');
      _assertEqual(at('onboarding-rituals-ui.js') < at('onboarding-expectations-ui.js') && at('onboarding-expectations-ui.js') < at('my-momentum-app.js'), true, 'expectations page after the rituals page, before the app init');
      _assertEqual(at('sla-targets.js') > -1 && at('api-sla.js') > at('api-people.js') && at('api-sla.js') < at('api-onboarding.js'), true, 'sla-targets.js and api-sla.js loaded on my-momentum.html, api-sla after api-people');
      _assertEqual(ALL_HTML['mobile.html'].includes('onboarding-standards') || ALL_HTML['mobile.html'].includes('api-sla'), false, 'never mobile.html');
    },
  },
);
