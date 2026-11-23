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
