// tests/assert-onboarding-reminders.js — owner reminders for due / overdue onboarding steps (N-503 / ONB-8).
// Loads AFTER tests/assert-onboarding-team.js (reuses _onbFx3 and _onbSrc) and pushes into ASSERTIONS. The pure rules
// (onboarding-reminders.js) run in the vm; the api / wiring checks read source text (Node runner only).
// Spec: specs/N-503.md.

const _ONBR_TODAY = '2026-11-26';   // Nina Neu starts 2026-11-25 (Day 2)

// Templates of the 'person' track, one owner per step. off = DueOffsetDays; due = StartDate + off.
function _onbrTpl(key, owner, off, extra) {
  return Object.assign({
    id: key, RecordType: 'person', Variant: 'TP', Active: true, ItemKey: key, ItemLabel: 'Step ' + key, Section: 'Week 1', SectionOrder: 1, ItemOrder: 1,
    Owner: owner, DueOffsetDays: off, StepMode: 'Guided', Required: true, LevelTag: '', ContentUrl: '', HelpText: '',
  }, extra);
}

function _onbrRun(x, o) {
  return onbReminderPlan(Object.assign({
    gate: { state: 'live', mode: 'Pilot', peopleOpsActive: false }, email: x.nina.WorkEmail, today: _ONBR_TODAY,
    plans: [x.buddyPlan], people: x.people, templates: [], progressByPlan: {}, peopleOpsActive: false,
  }, o));
}

const _onbrTypes = r => r.send.map(s => s.type + ':' + s.n);

ASSERTIONS.push(
  {
    name: 'N-503 AC1 config: CONFIG.ONBOARDING.REMINDERS keys, wording, links, tone; not in the MCP bundle',
    fn: function () {
      const R = CONFIG.ONBOARDING.REMINDERS;
      _assertEqual(R.KEY_PREFIX, 'onb', 'key prefix');
      _assertEqual(R.TYPES, { DUE: 'onbDue', OVERDUE: 'onbOverdue' }, 'types');
      Object.values(R.TYPES).forEach(t => {
        _assertEqual(typeof R.TEXT[t].one === 'string' && R.TEXT[t].one.length > 0, true, 'one: ' + t);
        _assertEqual(R.TEXT[t].many.indexOf('{n}') > -1, true, '{n} in many: ' + t);
      });
      _assertEqual(R.LINKS, { MY: 'my-momentum.html#myOnboarding', TEAM: 'my-momentum.html#teamOnboarding', BUDDY: 'my-momentum.html#myBuddying' }, 'links');
      _assertEqual(R.TONE, 'attention', 'tone');
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding/.test(s)), false, 'no onboarding file in the MCP bundle');
    },
  },
  {
    name: 'N-503 AC1/AC2 gate: only a live gate sends; Off, preview, none and a blank email send nothing; Pilot and On both send',
    fn: function () {
      const x = _onbFx3();
      const t = [_onbrTpl('a', 'Employee', 1)];
      ['preview', 'none', undefined].forEach(state => _assertEqual(_onbrRun(x, { templates: t, gate: { state } }), { send: [], keep: [] }, 'gate ' + state));
      _assertEqual(_onbrRun(x, { templates: t, gate: null }), { send: [], keep: [] }, 'no gate');
      _assertEqual(_onbrRun(x, { templates: t, email: '' }), { send: [], keep: [] }, 'blank email');
      ['Pilot', 'On'].forEach(mode => _assertEqual(_onbrTypes(_onbrRun(x, { templates: t, gate: { state: 'live', mode } })), ['onbDue:1'], 'live in ' + mode));
    },
  },
  {
    name: 'N-503 AC3/AC4/AC13 digests: due today vs overdue, tomorrow counts in neither, keys per day, keep = sent keys',
    fn: function () {
      const x = _onbFx3();
      const t = [_onbrTpl('over', 'Employee', 0), _onbrTpl('d1', 'Employee', 1), _onbrTpl('d2', 'Employee', 1), _onbrTpl('later', 'Employee', 2)];
      const r = _onbrRun(x, { templates: t });
      _assertEqual(_onbrTypes(r), ['onbDue:2', 'onbOverdue:1'], 'due 2, overdue 1');
      _assertEqual(r.send[0].key, 'onb:onbDue:nina.new@mg.test:2026-11-26', 'due key');
      _assertEqual(r.send[1].key, 'onb:onbOverdue:nina.new@mg.test:2026-11-26', 'overdue key');
      _assertEqual(r.keep, r.send.map(s => s.key), 'keep lists exactly the sent keys');
      _assertEqual(_onbrRun(x, { templates: [_onbrTpl('later', 'Employee', 2)] }), { send: [], keep: [] }, 'due tomorrow sends nothing, keep empty');
      _assertEqual(_onbrRun(x, { templates: t, today: '2026-11-27' }).send.map(s => s.key.slice(-10)), ['2026-11-27', '2026-11-27'], 'the key moves with the day');
      _assertEqual(onbReminderKey('onbDue', 'A@B.test', _ONBR_TODAY), 'onb:onbDue:a@b.test:2026-11-26', 'key lowercases the email');
    },
  },
  {
    name: 'N-503 AC5 exclusions: ticked, Library, no due date, inactive, Complete / Cancelled plans, blank StartDate',
    fn: function () {
      const x = _onbFx3();
      const base = [_onbrTpl('a', 'Employee', 1)];
      _assertEqual(_onbrTypes(_onbrRun(x, { templates: base })), ['onbDue:1'], 'baseline counts');
      _assertEqual(_onbrRun(x, { templates: base, progressByPlan: { pl30: [{ id: '1', Title: 'person', RecordId: '30', ItemKey: 'a', Done: 'Yes', DoneDate: '2026-11-26' }] } }).send, [], 'ticked');
      _assertEqual(_onbrRun(x, { templates: [_onbrTpl('a', 'Employee', 1, { Section: 'Library' })] }).send, [], 'Library step');
      _assertEqual(_onbrRun(x, { templates: [_onbrTpl('a', 'Employee', null)] }).send, [], 'blank offset');
      _assertEqual(_onbrRun(x, { templates: [_onbrTpl('a', 'Employee', 'x')] }).send, [], 'non-integer offset');
      _assertEqual(_onbrRun(x, { templates: [_onbrTpl('a', 'Employee', 1, { Active: false })] }).send, [], 'inactive step');
      ['Complete', 'Cancelled'].forEach(s =>
        _assertEqual(_onbrRun(x, { templates: base, plans: [Object.assign({}, x.buddyPlan, { Status: s })] }).send, [], s + ' plan'));
      const noStart = x.people.map(p => (String(p.id) === '30' ? Object.assign({}, p, { StartDate: '' }) : p));
      _assertEqual(_onbrRun(x, { templates: base, people: noStart }).send, [], 'blank StartDate');
    },
  },
  {
    name: 'N-503 AC6 pre-start: hidden from a joiner-only viewer before StartDate, still counted for the LM who owns it',
    fn: function () {
      const x = _onbFx3();
      const t = [_onbrTpl('pre-e', 'Employee', -1), _onbrTpl('pre-l', 'LM', -1)];
      const before = '2026-11-24';   // due today, a day before Nina starts
      _assertEqual(_onbrRun(x, { templates: t, today: before }).send, [], 'the joiner sees (and is reminded of) neither pre-start step');
      _assertEqual(_onbrTypes(_onbrRun(x, { templates: t, today: before, email: x.f.sdm.WorkEmail })), ['onbDue:1'], 'the LM is reminded of the LM-owned one');
      _assertEqual(_onbrTypes(_onbrRun(x, { templates: t, today: _ONBR_TODAY })), ['onbOverdue:1'], 'after the start day the joiner is reminded again (overdue Employee step)');
    },
  },
  {
    name: 'N-503 AC7/AC8 owner mapping: each owner key reminds only the person it resolves to; Admin / LM who may tick are not reminded',
    fn: function () {
      const x = _onbFx3();
      const email = p => p.WorkEmail;
      const run = (owner, who, o) => _onbrTypes(_onbrRun(x, Object.assign({ templates: [_onbrTpl('s', owner, 1)], email: email(who) }, o)));
      _assertEqual(run('Employee', x.nina), ['onbDue:1'], 'Employee -> joiner');
      _assertEqual(run('Employee', x.f.sdm), [], 'Employee -> not the LM');
      _assertEqual(run('Buddy', x.f.tp1), ['onbDue:1'], 'Buddy -> the buddy');
      _assertEqual(run('Buddy', x.nina), [], 'Buddy -> not the joiner');
      _assertEqual(run('LM', x.f.sdm), ['onbDue:1'], 'LM -> the line manager');
      _assertEqual(run('LM', x.f.csd), [], 'LM -> not the CSD');
      _assertEqual(run('CSD', x.f.csd), ['onbDue:1'], 'CSD -> the CSD');
      _assertEqual(run('CSD', x.f.sdm), [], 'CSD -> not the LM');
      _assertEqual(run('PeopleOps', x.f.csd), ['onbDue:1'], 'People Ops -> the CSD while nobody holds the role');
      _assertEqual(run('PeopleOps', x.f.sdm), [], 'People Ops -> not the LM');
      _assertEqual(_onbrTypes(_onbrRun(x, { templates: [_onbrTpl('s', 'Employee', 1)], email: 'chris@mg.test' })), [], 'an Admin who is not a party gets nothing');
    },
  },
  {
    name: 'N-503 AC9 no named person: Ops steps, and People Ops steps once a people_ops user exists, send nothing',
    fn: function () {
      const x = _onbFx3();
      [x.nina, x.f.sdm, x.f.csd, x.f.tp1].forEach(p => {
        _assertEqual(_onbrRun(x, { templates: [_onbrTpl('s', 'Ops', 1)], email: p.WorkEmail }).send, [], 'Ops: ' + p.EmployeeName);
        _assertEqual(_onbrRun(x, { templates: [_onbrTpl('s', 'PeopleOps', 1)], email: p.WorkEmail, peopleOpsActive: true }).send, [], 'People Ops active: ' + p.EmployeeName);
      });
    },
  },
  {
    name: 'N-503 AC10 combined roles: LM + CSD counts a step once; joiner on one plan and buddy on another share one digest',
    fn: function () {
      const x = _onbFx3();
      // Tom Tp (5) reports to the CSD directly: Cara is both his line manager and his CSD.
      const tom = x.f.tp2;
      const plan = x.plan(5, { id: 'pl5' });
      const people = x.people.map(p => (String(p.id) === '5' ? Object.assign({}, p, { StartDate: _ONBR_TODAY }) : p));
      const one = onbReminderPlan({ gate: { state: 'live' }, email: x.f.csd.WorkEmail, today: _ONBR_TODAY, plans: [plan], people, templates: [_onbrTpl('c', 'CSD', 0)], progressByPlan: {} });
      _assertEqual(one.send.map(s => s.type + ':' + s.n), ['onbDue:1'], 'one CSD step counts once for the LM-and-CSD');
      _assertEqual(one.send[0].link, 'my-momentum.html#teamOnboarding', 'LM / CSD link');
      // Tia is Nina's buddy and a joiner herself.
      const tiaStart = x.people.map(p => (String(p.id) === '4' ? Object.assign({}, p, { StartDate: _ONBR_TODAY }) : p));
      const both = onbReminderPlan({
        gate: { state: 'live' }, email: x.f.tp1.WorkEmail, today: _ONBR_TODAY, plans: [x.buddyPlan, x.plan(4, { id: 'pl4' })], people: tiaStart,
        templates: [_onbrTpl('e', 'Employee', 0), _onbrTpl('b', 'Buddy', 1)], progressByPlan: {},
      });
      _assertEqual(both.send.map(s => s.type + ':' + s.n), ['onbDue:2'], 'own step + buddy step in one digest');
      _assertEqual(both.send[0].link, 'my-momentum.html#myOnboarding', 'own plan wins the link');
      _assertEqual(tom.EmployeeName, 'Tom Tp', 'fixture sanity');
    },
  },
  {
    name: 'N-503 AC11 link: own plan -> My Onboarding; else LM / CSD -> My Team; else buddy -> Buddying',
    fn: function () {
      const x = _onbFx3();
      const link = (owner, who) => _onbrRun(x, { templates: [_onbrTpl('s', owner, 1)], email: who.WorkEmail }).send[0].link;
      _assertEqual(link('Employee', x.nina), CONFIG.ONBOARDING.REMINDERS.LINKS.MY, 'joiner');
      _assertEqual(link('LM', x.f.sdm), CONFIG.ONBOARDING.REMINDERS.LINKS.TEAM, 'LM');
      _assertEqual(link('CSD', x.f.csd), CONFIG.ONBOARDING.REMINDERS.LINKS.TEAM, 'CSD');
      _assertEqual(link('Buddy', x.f.tp1), CONFIG.ONBOARDING.REMINDERS.LINKS.BUDDY, 'buddy');
    },
  },
  {
    name: 'N-503 AC12 bodies: one / many from CONFIG, and never a name, email or step label',
    fn: function () {
      const R = CONFIG.ONBOARDING.REMINDERS;
      _assertEqual(onbReminderBody('onbDue', 1), R.TEXT.onbDue.one, 'due one');
      _assertEqual(onbReminderBody('onbDue', 3), R.TEXT.onbDue.many.replace('{n}', '3'), 'due many');
      _assertEqual(onbReminderBody('onbOverdue', 1), R.TEXT.onbOverdue.one, 'overdue one');
      _assertEqual(onbReminderBody('onbOverdue', 2), R.TEXT.onbOverdue.many.replace('{n}', '2'), 'overdue many');
      const x = _onbFx3();
      const r = _onbrRun(x, { templates: [_onbrTpl('over', 'Employee', 0), _onbrTpl('d1', 'Employee', 1)] });
      r.send.forEach(s => ['Nina', 'nina', '@', 'Step over', 'Step d1', 'Sam'].forEach(w => _assertEqual(s.body.indexOf(w), -1, 'no "' + w + '" in ' + s.body)));
    },
  },
  {
    name: 'N-503 AC14-AC17 api contract: once per load, Ghost and read-failed safe, own rows only, progress read only for related Active plans',
    fn: function () {
      const api = _onbSrc('api-onboarding.js');
      const a = api.indexOf('async function runOnboardingReminders');
      _assertEqual(a > -1, true, 'runOnboardingReminders exists');
      const run = api.slice(a, api.indexOf('\n// ── ', a));   // up to the next section header
      _assertEqual(/_onbRemindersRan/.test(run) && /if \(_onbRemindersRan\) return/.test(run), true, 'AC14 once per page load');
      _assertEqual(/getGhostUser\(\)\) return/.test(run), true, 'AC14 Ghost Mode sends and clears nothing');
      _assertEqual(/gate\.reason === 'read-failed'\) return/.test(run), true, 'AC14 a failed gate read changes nothing');
      _assertEqual(/catch \(e\)/.test(run), true, 'AC14 never throws');
      _assertEqual(/RecipientEmail eq/.test(api) && /CONFIG\.ONBOARDING\.REMINDERS\.TYPES/.test(api), true, 'AC15 own rows of the two types only');
      _assertEqual(/fireNotification\(\{[^}]*recipients: \[me\]/.test(run), true, 'AC16 fires through fireNotification for the signed-in user only (dedupes active keys)');
      _assertEqual(/_onbClearReminders\(me, keep\)/.test(run), true, 'AC16 anything not kept is cleared');
      const inputs = api.slice(api.indexOf('async function _onbReminderInputs'), a);
      _assertEqual(/onbReminderPlans\(/.test(inputs) && /Promise\.all\(mine\.map/.test(inputs), true, 'AC17 progress in parallel for the related plans only');
      _assertEqual(/getChecklistProgress\(O\.RECORD_TYPE, \{ recordId: m\.plan\.PersonID \}\)/.test(inputs), true, 'AC17 one recordId read per plan, never the whole list');
      _assertEqual(/getPdp|createPdp|updatePdp|repointPdp/.test(api + _onbSrc('onboarding-reminders.js')), false, 'PDP-D12: no PDP list or function');
    },
  },
  {
    name: 'N-503 AC18 wiring: loaded on my-momentum.html only, after onboarding-team.js; called after runPdpReminders; not an MCP / mobile file',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (Node runner only)');
      const mm = ALL_HTML['my-momentum.html'];
      const tag = '<script src="js/onboarding-reminders.js" defer></script>';
      _assertEqual(mm.split(tag).length - 1, 1, 'one tag on my-momentum.html');
      _assertEqual(mm.indexOf('js/onboarding-team.js') < mm.indexOf('js/onboarding-reminders.js'), true, 'after onboarding-team.js');
      _assertEqual(mm.indexOf('js/api-onboarding.js') > -1, true, 'api-onboarding.js is already loaded there');
      Object.keys(ALL_HTML).filter(k => k !== 'my-momentum.html').forEach(k =>
        _assertEqual(/<script src="js\/onboarding-reminders/.test(ALL_HTML[k]), false, 'no other shell loads it: ' + k));
      const app = _onbSrc('my-momentum-app.js');
      _assertEqual(app.indexOf('runPdpReminders()') > -1 && app.indexOf('runPdpReminders()') < app.indexOf('runOnboardingReminders()'), true, 'sweep runs after the PDP one');
      _assertEqual(/runOnboardingReminders\(\)\.catch\(/.test(app), true, 'never awaited, never throws into init');
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding-reminders/.test(s)), false, 'not an MCP script');
    },
  },
);

// ── N-520: reassigning onboarding steps (specs/N-520.md, ONB-D108..D118) ─────────────────────────────────────────────
// Nina New's plan '30' (LM Sam Sdm, CSD Cara Csd, buddy Tia Tp) with one step per owner; Ian Internal is internal staff.
function _onbaFx() {
  const x = _onbtFx();
  const ian = x.f.P(40, 'Ian Internal', 'Ops', { StaffType: CONFIG.STAFF_TYPE_INTERNAL });
  const people = x.people.concat([ian]);
  const templates = [
    _onbrTpl('w2', 'LM', 1), _onbrTpl('w1', 'Employee', 0), _onbrTpl('bd', 'Buddy', 1), _onbrTpl('ops', 'Ops', 1),
    _onbrTpl('onb_tp_m05', 'LM', 2), _onbrTpl('lib', 'LM', null, { Section: 'Library', StepMode: 'Self-guided', Required: false }),
  ];
  const plan = Object.assign({}, x.plan, { BuddyEmail: x.f.tp1.WorkEmail, Title: x.nina.WorkEmail });
  const row = (id, key, to, by) => ({ id: String(id), PlanID: 30, PersonID: 30, ItemKey: key, AssigneeEmail: to || '', AssignedByEmail: by || x.f.sdm.WorkEmail, AssignedAt: '2026-11-26' });
  const step = key => templates.find(t => t.ItemKey === key);
  return Object.assign({}, x, { ian, people, templates, plan, row, step, tom: x.f.tp2 });
}

ASSERTIONS.push(
  {
    name: 'N-520 AC0 config: CONFIG.ONBOARDING.ASSIGN, FIELD_ALIASES, fixed notification text, deep link to My Team',
    fn: function () {
      const A = CONFIG.ONBOARDING.ASSIGN;
      _assertEqual(A.LIST, 'OnboardingStepAssignments', 'list name');
      _assertEqual(A.FIELDS, ['Title', 'PlanID', 'PersonID', 'ItemKey', 'AssigneeEmail', 'AssignedByEmail', 'AssignedAt'], 'fields');
      _assertEqual(FIELD_ALIASES.OnboardingStepAssignments, {}, 'registered as {}');
      _assertEqual(A.NOTIFY.LINK, CONFIG.ONBOARDING.REMINDERS.LINKS.TEAM, 'notification opens My Team > Onboarding');
      _assertEqual(/[{}@]/.test(A.TEXT.notifyBody), false, 'notification body is fixed text (no placeholder, no email)');
      Object.keys(A.TEXT.reasons).forEach(k => _assertEqual(typeof A.TEXT.reasons[k] === 'string' && A.TEXT.reasons[k].length > 0, true, 'reason ' + k));
      _assertEqual(onbAssignNotifyKey('30', 'w2', 'Tom.Tp@MG.test'), 'onb:assigned:30:w2:tom.tp@mg.test', 'notification key');
    },
  },
  {
    name: 'N-520 AC1-AC2 onbAssignmentIndex (latest numeric id wins, blank = none, plan filter) and onbStepAssignee (one active row only)',
    fn: function () {
      const x = _onbaFx(), T = x.tom.WorkEmail;
      const idx = onbAssignmentIndex([x.row(1, 'w2', T), x.row(3, 'w2', ''), x.row(2, 'w2', x.ian.WorkEmail), x.row(4, 'bd', T.toUpperCase()), Object.assign(x.row(5, 'ops', T), { PlanID: 31 })], '30');
      _assertEqual(idx.has('30|w2'), false, 'AC1 the latest row (id 3) is blank: back with the template owner');
      _assertEqual(idx.get('30|bd').email, T, 'AC1 email lower-cased');
      _assertEqual([idx.has('31|ops'), onbAssignmentIndex([Object.assign(x.row(5, 'ops', T), { PlanID: 31 })]).has('31|ops')], [false, true], 'AC1 another plan is filtered out only when planId is given');
      _assertEqual(onbAssignmentIndex([x.row(10, 'w2', x.ian.WorkEmail), x.row(9, 'w2', T)]).get('30|w2').email, x.ian.WorkEmail, 'AC1 ids compare as numbers (10 > 9)');
      const at = (people, email) => onbStepAssignee({ step: x.step('w2'), plan: x.plan, assignments: [x.row(1, 'w2', email)], people });
      _assertEqual(at(x.people, T).EmployeeName, 'Tom Tp', 'AC2 resolves');
      _assertEqual(at(x.people.concat([x.f.P(41, 'Tom Twin', 'TP', { WorkEmail: T })]), T), null, 'AC2 two rows share the email');
      _assertEqual(at(x.people.map(p => (p.id === x.tom.id ? Object.assign({}, p, { IsActive: false }) : p)), T), null, 'AC2 inactive');
      _assertEqual(at(x.people.map(p => (p.id === x.tom.id ? Object.assign({}, p, { IsPlaceholder: true }) : p)), T), null, 'AC2 placeholder');
      _assertEqual(at(x.people, 'gone@mg.test'), null, 'AC2 not in People');
    },
  },
  {
    name: 'N-520 AC3-AC4 onbStepOwner with an assignee; onbCanTick moves the owner right to the assignee, LM / CSD / Admin keep theirs',
    fn: function () {
      const x = _onbaFx();
      const parties = onbPlanParties(x.plan, x.people);
      const o = onbStepOwner({ step: x.step('w2'), parties, assignee: x.tom });
      _assertEqual([o.key, o.person.EmployeeName, o.reassigned, o.originalPerson.EmployeeName, o.originalLabel], ['LM', 'Tom Tp', true, 'Sam Sdm', 'Line Manager'], 'AC3 assignee is the person');
      _assertEqual(Object.keys(onbStepOwner({ step: x.step('w2'), parties })), ['key', 'label', 'person'], 'AC3 shape unchanged without one');
      const t = (key, rel, o2) => onbCanTick(Object.assign({ step: x.step(key), relations: rel, planStatus: 'Active' }, o2));
      _assertEqual([t('w2', ['assignee'], { reassigned: true, isAssignee: true }), t('w2', ['buddy'], { reassigned: true }), t('w2', ['assignee'], { reassigned: true, isAssignee: false })], [true, false, false], 'AC4 a reassigned LM step: the assignee only');
      _assertEqual(['lm', 'csd', 'admin'].map(r => t('w2', [r], { reassigned: true })), [true, true, true], 'AC4 LM / CSD / Admin tick any step');
      _assertEqual([t('bd', ['buddy']), t('bd', ['buddy'], { reassigned: true }), t('bd', ['assignee'], { reassigned: true, isAssignee: true })], [true, false, true], 'AC4 a reassigned Buddy step leaves the buddy');
      _assertEqual(t('w2', ['admin'], { reassigned: true, planStatus: 'Complete' }), false, 'AC4 nobody on a closed plan');
    },
  },
  {
    name: 'N-520 AC5 onbCanReassign: never the joiner\'s, sign-off, Library or done steps; owner, assignee and Admin only',
    fn: function () {
      const x = _onbaFx(), sam = x.f.sdm, tom = x.tom;
      const c = (key, o) => onbCanReassign(Object.assign({ step: x.step(key), relations: [], viewerEmail: sam.WorkEmail, originalPerson: sam, assignee: null, done: false, planStatus: 'Active' }, o)).reason;
      _assertEqual(c('w2', { relations: ['lm'] }), '', 'the original owner (LM) can');
      _assertEqual([c('w1', { relations: ['admin'] }), c('onb_tp_m05', { relations: ['admin'] }), c('lib', { relations: ['admin'] }), c('w2', { done: true })], ['employee', 'signoff', 'library', 'done'], 'never these, not even an Admin');
      _assertEqual([c('w2', { planStatus: 'Complete' }), c('w2', { readOnly: true })], ['closed', 'preview'], 'closed plan, preview');
      _assertEqual([c('ops', { originalPerson: null }), c('ops', { originalPerson: null, relations: ['admin'] }), c('ops', { originalPerson: null, assignee: tom, viewerEmail: tom.WorkEmail })], ['noRights', '', ''], 'Ops: Admin until it has an assignee, who can pass it on');
      _assertEqual(c('w2', { assignee: tom, viewerEmail: sam.WorkEmail.toUpperCase() }), '', 'the original owner can take it back');
      _assertEqual([c('w2', { relations: ['buddy'], viewerEmail: x.f.tp1.WorkEmail }), c('w2', { relations: ['csd'], viewerEmail: x.f.csd.WorkEmail })], ['noRights', 'noRights'], 'a buddy or a CSD who owns neither cannot');
    },
  },
  {
    name: 'N-520 AC6-AC7 onbAssignCandidates (anyone with a Newton email who has started, minus the joiner) and onbCleanAssignFields',
    fn: function () {
      const x = _onbaFx(), P = x.f.P;
      const extra = [P(41, 'Pho Placeholder', 'TP', { IsPlaceholder: true }), P(42, 'Fay Future', 'TP', { StartDate: '2099-01-01' }), P(43, 'Ina Inactive', 'TP', { IsActive: false }),
        P(44, 'Dup One', 'TP', { WorkEmail: 'dup@mg.test' }), P(45, 'Dup Two', 'TP', { WorkEmail: 'dup@mg.test' }), P(46, 'No Mail', 'TP', { WorkEmail: '' }), P(47, 'Bea Blank', 'TP', { StartDate: '' })];
      const names = onbAssignCandidates(x.people.concat(extra), 30, _ONBR_TODAY).map(c => c.name);
      _assertEqual(['Ian Internal', 'Tom Tp', 'Cara Csd', 'Sam Sdm', 'Bea Blank'].every(n => names.includes(n)), true, 'AC6 internal staff, deployable TPs, the LM / CSD, a blank start date');
      _assertEqual(['Nina New', 'Pho Placeholder', 'Fay Future', 'Ina Inactive', 'Dup One', 'Dup Two', 'No Mail'].some(n => names.includes(n)), false, 'AC6 not the joiner, placeholders, future starters, inactive, duplicate or missing emails');
      _assertEqual(names.slice().sort((a, b) => a.localeCompare(b)), names, 'AC6 by name');
      const plan = { id: '30', PersonID: 30 };
      const out = onbCleanAssignFields({ plan, itemKey: ' w2 ', assigneeEmail: 'Tom.Tp@MG.test', byEmail: 'Sam.Sdm@mg.test', todayISO: '2026-11-26' });
      _assertEqual(out, { Title: '30-w2', PlanID: 30, PersonID: 30, ItemKey: 'w2', AssigneeEmail: 'tom.tp@mg.test', AssignedByEmail: 'sam.sdm@mg.test', AssignedAt: '2026-11-26' }, 'AC7 payload');
      _assertEqual(Object.keys(out), CONFIG.ONBOARDING.ASSIGN.FIELDS, 'AC7 exactly FIELDS');
      _assertEqual(onbCleanAssignFields({ plan, itemKey: 'w2', assigneeEmail: '', byEmail: 'sam.sdm@mg.test', todayISO: '2026-11-26' }).AssigneeEmail, '', 'AC7 blank = hand back');
      const throws = o => { try { onbCleanAssignFields(Object.assign({ plan, itemKey: 'w2', byEmail: 'sam.sdm@mg.test', todayISO: '2026-11-26' }, o)); return false; } catch (e) { return true; } };
      _assertEqual([throws({}), throws({ plan: { id: 'p30', PersonID: 30 } }), throws({ itemKey: ' ' }), throws({ assigneeEmail: 'not-an-email' }), throws({ byEmail: '' }), throws({ todayISO: 'soon' })],
        [false, true, true, true, true, true], 'AC7 throws on bad input (control: good input does not)');
    },
  },
  {
    name: 'N-520 AC10-AC13 the page models: LM loses the step, the assignee gets My actions alone, buddy steps move, chip and button markup, modal options',
    fn: function () {
      const x = _onbaFx(), tom = x.tom.WorkEmail, A = CONFIG.ONBOARDING.ASSIGN.TEXT;
      const asg = [x.row(1, 'w2', tom)];
      const m = (email, role, o) => onbTeamModel(Object.assign({ plans: [x.plan], people: x.people, templates: x.templates, progressByPlan: {}, signoffs: [], pdpByPerson: {}, email, role, todayISO: _ONBR_TODAY, assignments: asg }, o));
      const keys = v => v.actions.reduce((a, g) => a.concat(g.steps.map(s => s.itemKey)), []);
      _assertEqual(keys(m(x.f.sdm.WorkEmail, 'delivery_manager', { assignments: [] })).includes('w2'), true, 'AC11 control: without the assignment the LM has w2');
      const lm = m(x.f.sdm.WorkEmail, 'delivery_manager');
      _assertEqual(keys(lm).includes('w2'), false, 'AC11 the LM\'s My actions loses a step reassigned away');
      const last = lm.rows[0].byOwner[lm.rows[0].byOwner.length - 1];
      _assertEqual([last.key, last.label, last.items.map(i => i.itemKey)], ['Reassigned', A.group, ['w2']], 'AC11 by owner: one Reassigned group');
      const t = m(tom, 'talent_partner');
      _assertEqual([t.assignOnly, t.rows.length, t.completed.length, t.totals.active, keys(t)], [true, 0, 0, 0, ['w2']], 'AC10 the assignee: My actions only, no card, tile or count');
      _assertEqual(onbTeamPlans({ plans: [x.plan], people: x.people, email: tom, role: 'talent_partner' }).length, 0, 'AC10 control: no assignment, no plan');
      const it = t.actions[0].steps[0];
      _assertEqual([it.canTick, it.canReassign, it.owner.name, it.assign.originalName, it.assign.originalLabel, it.assign.assigneeEmail], [true, true, 'Tom Tp', 'Sam Sdm', 'Line Manager', tom], 'AC10 the assignee ticks and can pass it on');
      _assertEqual(m(tom, 'talent_partner', { readOnly: true }).actions, [], 'preview: no actions');
      const chip = onbFillText(A.chip, { name: 'Tom Tp', from: 'Line Manager' });
      const withBtn = _onbmStepHtml(it, 0, () => '', null, () => ' data-x="1"'), plain = _onbmStepHtml(it, 0);
      _assertEqual([withBtn.includes(escHtml(chip)), withBtn.includes('>' + A.btn + '<'), plain.includes(escHtml(chip)), plain.includes('>' + A.btn + '<')], [true, true, true, false], 'AC12 chip everywhere; the button only where a page passes reassignAttr');
      const page = onbtPageHtml(Object.assign({ gateState: 'live', readOnly: false }, t), { open: [], person: '' });
      _assertEqual([page.includes(CONFIG.ONBOARDING.TEAM_TEXT.actionsTitle), page.includes(CONFIG.ONBOARDING.TEAM_TEXT.tileActive), page.includes('onbtReassign')], [true, false, true], 'AC10 the assignee\'s page: My actions with Reassign, no tiles');
      const bm = a => onbBuddyModel(onbPlanModel({ plan: x.plan, people: x.people, templates: x.templates, progressRows: [], email: x.f.tp1.WorkEmail, role: 'talent_partner', todayISO: _ONBR_TODAY, assignments: a }));
      _assertEqual([bm([]).actions.map(i => i.itemKey), bm([x.row(1, 'bd', tom)]).actions.length], [['bd'], 0], 'AC11 a Buddy step reassigned away leaves the buddy\'s Your actions (control first)');
      const opts = onbReassignOptions({ item: it, candidates: [{ email: x.f.sdm.WorkEmail, name: 'Sam Sdm' }, { email: tom, name: 'Tom Tp' }, { email: x.ian.WorkEmail, name: 'Ian Internal' }] });
      _assertEqual([opts.options.map(o => o.value), opts.options[0].label, opts.defaultValue], [['', tom, x.ian.WorkEmail], onbFillText(A.originalOwner, { name: 'Sam Sdm' }), tom], 'AC13 original owner first (hand back), not listed twice, current assignee preselected');
      const ops = onbReassignOptions({ item: { assign: { originalEmail: '', originalName: '', originalLabel: 'Operations / IT', assigneeEmail: '' } }, candidates: [] });
      _assertEqual([ops.options[0].label, ops.defaultValue], [onbFillText(A.backTo, { role: 'Operations / IT' }), ''], 'AC13 no named owner: "Back to <role>"');
    },
  },
  {
    name: 'N-520 AC14-AC16 reminders follow the assignee, an assignment opens the gate, Data Health flags an unresolved assignee',
    fn: function () {
      const x = _onbaFx(), tom = x.tom.WorkEmail, R = CONFIG.ONBOARDING.REMINDERS;
      const asg = [x.row(1, 'w2', tom)];
      const run = (email, a) => onbReminderPlan({ gate: { state: 'live' }, email, today: _ONBR_TODAY, plans: [x.plan], people: x.people, templates: [_onbrTpl('w2', 'LM', 1)], progressByPlan: {}, assignments: a });
      _assertEqual(_onbrTypes(run(x.f.sdm.WorkEmail, [])), ['onbDue:1'], 'AC14 control: the LM is reminded');
      _assertEqual(_onbrTypes(run(x.f.sdm.WorkEmail, asg)), [], 'AC14 not once it is reassigned');
      const r = run(tom, asg);
      _assertEqual([_onbrTypes(r), r.send[0].link], [['onbDue:1'], R.LINKS.TEAM], 'AC14 the assignee is, with a link to My Team');
      const ian = x.ian.WorkEmail;
      const acc = (a, mode) => onbAccess({ mode: mode || 'On', pilot: [], people: x.people, plans: [x.plan], email: ian, role: 'staff', assignments: a });
      _assertEqual([acc([]).state, acc([x.row(1, 'w2', ian)]).state, acc([x.row(1, 'w2', ian)]).reason, acc([x.row(1, 'w2', ian)], 'Pilot').state], ['none', 'live', 'plan', 'live'], 'AC15 internal staff assignee is live in On and Pilot');
      _assertEqual(acc([x.row(1, 'w2', ian), x.row(2, 'w2', '')]).state, 'none', 'AC15 handed back: none again');
      const chk = a => onbCheckPlans({ plans: [x.plan], people: x.people, templates: x.templates, assignments: a });
      _assertEqual(onbCheckPlans({ plans: [x.plan], people: x.people, templates: x.templates }).length, 8, 'AC16 no assignments passed: the eight N-497 checks');
      const c9 = a => chk(a).find(c => c.key === 'assignee-unresolved');
      _assertEqual([chk([]).length, c9([x.row(1, 'w2', tom)]).count, c9([x.row(1, 'w2', 'gone@mg.test')]).count, c9([x.row(1, 'w2', 'gone@mg.test'), x.row(2, 'w2', '')]).count], [9, 0, 1, 0], 'AC16 the ninth check fires on an unresolved assignee only');
      _assertEqual(c9([x.row(1, 'w2', 'gone@mg.test')]).sample[0].includes('gone@mg.test'), true, 'AC16 sample names the email');
    },
  },
  {
    name: 'N-520 AC8-AC9 api + ui contract: reassignOnboardingStep re-checks then writes once; strict reads on writes; notification never undoes the write',
    fn: function () {
      const api = _onbSrc('api-onboarding.js');
      const fn = api.slice(api.indexOf('async function reassignOnboardingStep'), api.indexOf('async function _onbViewerCtx'));
      const at = s => fn.indexOf(s);
      const order = ['_onbDropCaches()', 'getOnboardingAssignments()', "gate.state === 'preview'", "gate.state !== 'live'", 'PLAN_ACTIVE', 'onbStepVisible(', 'onbCanReassign(', 'onbAssignCandidates(', 'if (target === stored)', 'createItem(A.LIST', 'clearNotification(', 'fireNotification('];
      _assertEqual(order.every(s => at(s) > -1) && order.every((s, i) => !i || at(s) > at(order[i - 1])), true, 'AC8 fresh reads, preview, live, Active, visible, rights, candidate, no-op, write, then notify');
      _assertEqual([(fn.match(/createItem\(/g) || []).length, /updateItem\(|deleteItem\(/.test(fn)], [1, false], 'AC8 exactly one write');
      _assertEqual(at('try {') < at('clearNotification(') && at('catch (e)') > at('fireNotification(') && /warning = 'notify'/.test(fn), true, 'AC9 a notification failure is a warning, after the write');
      _assertEqual(/target !== _onbEmail\(email\)/.test(fn), true, 'AC9 no notification to yourself');
      const tick = api.slice(api.indexOf('async function tickOnboardingStep'), api.indexOf('async function getBuddyingView'));
      _assertEqual(/getOnboardingAssignments\(\)/.test(tick) && !/_onbAssignmentsOrNone/.test(tick), true, 'strict assignments read on the tick');
      const team = _onbSrc('api-onboarding-team.js');
      const ctx = team.slice(team.indexOf('async function _onbTeamWriteCtx'), team.indexOf('async function tickOnboardingTeamStep'));
      _assertEqual(/getOnboardingAssignments\(\)/.test(ctx) && !/_onbAssignmentsOrNone/.test(ctx), true, 'strict assignments read on the team writes');
      const ui = _onbSrc('onboarding-team-ui.js');
      const r = ui.slice(ui.indexOf('async function onbtReassign'), ui.indexOf('function onbtToggle'));
      _assertEqual(/selectModal\(/.test(r) && /reassignOnboardingStep\(/.test(r) && r.indexOf('_onbtReload()') > r.indexOf('catch'), true, 'team: modal, write, fresh redraw either way');
      _assertEqual(/registerActions\(\{[\s\S]*onbtReassign,[\s\S]*\}\)/.test(ui) && /registerActions\(\{[\s\S]*onbbReassign,[\s\S]*\}\)/.test(_onbSrc('onboarding-buddy-ui.js')), true, 'both actions registered');
      const my = _onbSrc('onboarding-my-ui.js');
      _assertEqual(/reassignAttr\(it\)/.test(my) && !/_onbmStepHtml\([^)]*[Rr]eassign/.test(my.replace(/function _onbmStepHtml\([^)]*\)/, '')), true, 'the joiner\'s page never passes a reassign attribute');
    },
  },
);
