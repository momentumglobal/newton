// tests/assert-pdp-team.js — Team Development (N-439 / PDP-7). Loads AFTER tests/assert-pdp-prep.js.
// The pure rules (pdp-team.js) are exercised directly; the API functions, the page and the nav wiring are
// checked from source because the runner is synchronous. Spec: specs/N-439.md.

// removeTeamItem is the one PDP delete writer (N-439 flag 3). The older "no delete" source scans of api-pdp.js
// (N-434 / N-435 / N-436 / N-437 / N-445) look at the file WITHOUT that function; assert-pdp-team.js AC11 pins it.
function _pdpApiNoTeamDelete(src) { return String(src).replace(/async function removeTeamItem[\s\S]*?\r?\n\}\r?\n/, ''); }

const _PDPT_DEF = { schema: 1, sections: [
  { key: 'a', title: 'Prep', blocks: [
    { key: 'proud', type: 'prepQuestion', by: 'employee', label: 'Proud of?', required: true },
    { key: 'mgr', type: 'prepQuestion', by: 'manager', label: 'Manager view', required: true },
  ] },
  { key: 'b', title: 'Meeting', blocks: [
    { key: 'notes', type: 'prompt', label: 'Notes', required: true },
    { key: 'g', type: 'goalSet', level: 'Annual', min: 3, max: 5, label: 'Goals' },
    { key: 'act', type: 'actions', max: 6, label: 'Actions' },
  ] },
] };
const _PDPT_MONTHLY = { schema: 1, sections: [{ key: 'm', title: 'Monthly', blocks: [{ key: 'n', type: 'prompt', label: 'Notes' }] }] };
const _pdptM = (o) => Object.assign({
  id: 1, PersonID: 10, PersonName: 'Pat', PersonEmail: 'pat@x.com', LineManagerEmail: 'lm@x.com', CSDEmail: 'csd@x.com',
  Status: 'PrepOpen', MeetingType: 'Annual', Period: '2027-01', CycleYear: 2027, DueDate: '2027-01-31T00:00:00Z',
}, o || {});

ASSERTIONS.push(
  {
    name: 'N-439 AC1 config: CONFIG.PDP.TEAM, page registry, Command Bar mirror, nav wiring',
    fn: function () {
      const t = CONFIG.PDP.TEAM;
      _assertEqual(t.GOAL_LEVEL_BY_TYPE, { Annual: 'Annual', BiAnnual: 'H2', Quarterly: 'Quarterly' }, 'AC1 goal levels');
      _assertEqual([t.ATTENTION_ORDER, t.NOTES_SCHEMA], [['overdue', 'sign', 'prep', 'due', 'upcoming', 'done'], 1], 'AC1 order and schema');
      _assertEqual(/teamDevelopment:\s*\{[^}]*label: 'Team Development'[^}]*ADMIN, CONFIG\.ROLE_IDS\.PEOPLE_OPS, CONFIG\.ROLE_IDS\.DELIVERY_MANAGER, CONFIG\.ROLE_IDS\.TALENT_PARTNER\]/.test(ALL_SOURCES['people-router.js']), true, 'AC1 registry roles');
      const cb = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'teamDevelopment');
      _assertEqual(!!cb && cb.module === 'people' && cb.href === 'people.html#teamDevelopment', true, 'AC1 Command Bar entry');
      _assertEqual(cb.roles.slice().sort(), ['admin', 'delivery_manager', 'people_ops', 'talent_partner'], 'AC1 Command Bar roles mirror the registry');
      const nav = ALL_SOURCES['people-nav.js'], app = ALL_SOURCES['people-app.js'];
      _assertEqual(/filter\(p => p\.key !== 'teamDevelopment' \|\| _peopleTeamDevNav\)/.test(nav) && /let _peopleTeamDevNav\s*= false/.test(nav), true, 'AC1 nav item filtered, default hidden');
      _assertEqual(/case 'teamDevelopment':\s*await renderTeamDevelopmentPage\(\)/.test(nav), true, 'AC1 people-nav dispatches the page');
      _assertEqual(/resolvePdpNav\(\)\.then/.test(app) && /nav\.team/.test(app) && /\.catch\(/.test(app), true, 'AC1 both nav items resolved in one read');
    },
  },
  {
    name: 'N-439 AC2 pdpTeamAccess: run follows the record, never the role (a CSD has the Admin role)',
    fn: function () {
      const m = _pdptM();
      _assertEqual(pdpTeamAccess('admin', 'lm@x.com', m), { view: true, run: true, as: 'lm' }, 'AC2 line manager');
      _assertEqual(pdpTeamAccess('admin', 'CSD@x.com', m), { view: true, run: true, as: 'csd' }, 'AC2 CSD with the Admin role, any case');
      _assertEqual(pdpTeamAccess('admin', 'other@x.com', m).run, false, 'AC2 an admin who is neither cannot run');
      _assertEqual(pdpTeamAccess('people_ops', 'other@x.com', m).view, true, 'AC2 People Ops can view');
      _assertEqual(pdpTeamAccess('people_ops', 'other@x.com', m).run, false, 'AC2 People Ops read-only');
      _assertEqual(pdpTeamAccess('delivery_manager', 'other@x.com', m), { view: false, run: false, as: null }, 'AC2 an unrelated manager sees nothing');
      _assertEqual(pdpTeamAccess('admin', 'pat@x.com', m).run, false, 'AC2 the person cannot run their own meeting');
      _assertEqual(pdpTeamAccess('admin', 'pat@x.com', _pdptM({ LineManagerEmail: 'pat@x.com' })).run, false, 'AC2 self-managed record still not runnable');
    },
  },
  {
    name: 'N-439 AC3 pdpTeamScope',
    fn: function () {
      const csd = { me: { Level: 'CSD' }, directReports: [{ id: 1 }] };
      _assertEqual(pdpTeamScope(csd, 'admin'), { views: ['tree', 'reports', 'all'], default: 'tree' }, 'AC3 CSD with reports, Admin role');
      _assertEqual(pdpTeamScope({ me: { Level: 'Manager' }, directReports: [{ id: 1 }] }, 'delivery_manager'), { views: ['reports'], default: 'reports' }, 'AC3 line manager');
      _assertEqual(pdpTeamScope({ me: null, directReports: [] }, 'people_ops'), { views: ['all'], default: 'all' }, 'AC3 People Ops without a People row');
      _assertEqual(pdpTeamScope({ me: { Level: 'Manager' }, directReports: [] }, 'delivery_manager'), { views: [], default: '' }, 'AC3 nothing to show');
    },
  },
  {
    name: 'N-439 AC4 pdpTeamRows: records drive membership, attention order, no-meetings rows',
    fn: function () {
      const people = [
        { id: 10, EmployeeName: 'Pat', IsActive: true, Level: 'TP', ReportsTo: 'lm@x.com' },
        { id: 11, EmployeeName: 'Quinn', IsActive: true, Level: 'TP', ReportsTo: 'lm@x.com' },
        { id: 12, EmployeeName: 'Robin', IsActive: true, Level: 'TP', ReportsTo: 'new@x.com' },
      ];
      const meetings = [
        _pdptM({ id: 1, PersonID: 10, DueDate: '2027-01-31T00:00:00Z' }),
        _pdptM({ id: 2, PersonID: 12, PersonName: 'Robin', PersonEmail: 'r@x.com', LineManagerEmail: 'lm@x.com', DueDate: '2026-12-31T00:00:00Z' }),
      ];
      const rows = pdpTeamRows({ view: 'reports', myEmail: 'lm@x.com', role: 'delivery_manager', meetings, people, identity: { directReports: people.slice(0, 2) }, today: '2027-01-10' });
      _assertEqual(rows.map(r => r.personId), ['12', '10', '11'], 'AC4 overdue first, then upcoming, then no meetings; a re-pointed person follows the record');
      _assertEqual(rows.map(r => r.attention), ['overdue', 'upcoming', 'none'], 'AC4 attention flags');
      _assertEqual(rows[2].noMeetings, true, 'AC4 a report without meetings still has a row');
      _assertEqual(pdpAttention({ noMeetings: true }), 'none', 'AC4 none');
      _assertEqual(pdpTeamTotals(rows).people, 3, 'AC4 totals');
      const all = pdpTeamRows({ view: 'all', myEmail: 'ops@x.com', role: 'people_ops', meetings, people, identity: {}, today: '2027-01-10' });
      _assertEqual(all.every(r => r.canRun === false), true, 'AC4 the all-staff view is read-only for records that are not theirs');
    },
  },
  {
    name: 'N-439 AC5 pdpPreviousCommitments: nearest earlier Held / SignedOff, across the year, skipped ignored',
    fn: function () {
      const ms = [
        _pdptM({ id: 1, Status: 'SignedOff', DueDate: '2026-11-30T00:00:00Z', MeetingType: 'Monthly' }),
        _pdptM({ id: 2, Status: 'Skipped', DueDate: '2026-12-31T00:00:00Z', MeetingType: 'Monthly' }),
        _pdptM({ id: 3, Status: 'PrepOpen', DueDate: '2027-01-31T00:00:00Z' }),
      ];
      const acts = [
        { id: 1, MeetingID: 1, IsDone: true, Title: 'a' }, { id: 2, MeetingID: 1, IsDone: false, Title: 'b' },
        { id: 3, MeetingID: 3, IsDone: false, Title: 'c' },
      ];
      const goals = [{ id: 1, MeetingID: 1, Status: 'Open' }, { id: 2, MeetingID: 1, Status: 'Done' }, { id: 3, MeetingID: 3, Status: 'Open' }];
      const r = pdpPreviousCommitments(ms[2], ms, goals, acts);
      _assertEqual(r.meeting.id, 1, 'AC5 skips the skipped meeting and crosses the year');
      _assertEqual(r.actions.map(a => a.id), [1, 2], 'AC5 previous actions only');
      _assertEqual(r.goals.map(g => g.id), [1], 'AC5 open goals not from this meeting');
      _assertEqual(pdpPreviousCommitments(ms[0], ms, goals, acts).meeting, null, 'AC5 a first meeting has none');
    },
  },
  {
    name: 'N-439 AC6 pdpManagerLock: first signature (either side) locks',
    fn: function () {
      _assertEqual(pdpManagerLock(_pdptM({ Status: 'Held' })), 'open', 'AC6 held and unsigned is open');
      _assertEqual(pdpManagerLock(_pdptM({ Status: 'Held', EmployeeSignedAt: '2027-02-01T10:00:00Z' })), 'signed', 'AC6 employee signed');
      _assertEqual(pdpManagerLock(_pdptM({ Status: 'Held', ManagerSignedAt: '2027-02-01T10:00:00Z' })), 'signed', 'AC6 manager signed');
      _assertEqual(pdpManagerLock(_pdptM({ Status: 'SignedOff' })), 'signed', 'AC6 signed off');
      _assertEqual(pdpManagerLock(_pdptM({ Status: 'Skipped' })), 'skipped', 'AC6 skipped');
    },
  },
  {
    name: 'N-439 AC7 limits and payloads: manager keys only, trimmed, previous answers kept',
    fn: function () {
      const b = pdpPrepBlocks(_PDPT_DEF);
      _assertEqual(pdpGoalLimit(_pdptM(), _PDPT_DEF), { min: 3, max: 5, key: 'g' }, 'AC7 goal limit');
      _assertEqual(pdpGoalLimit(_pdptM({ IsJoiner: true }), _PDPT_DEF).min, CONFIG.PDP.CYCLE.JOINER_GOALS.min, 'AC7 joiner limit');
      _assertEqual(pdpGoalLimit(_pdptM(), _PDPT_MONTHLY), null, 'AC7 monthly has no goal block');
      _assertEqual(pdpActionLimit(_PDPT_DEF), { max: 6, key: 'act' }, 'AC7 action limit');
      _assertEqual(CONFIG.PDP.JSON_MAX_CHARS < 12 * (CONFIG.PDP.TEMPLATE_LIMITS.LABEL_MAX * 10), true, 'AC7 fixture is large enough to exceed the limit');
      const prevNotes = JSON.stringify({ schema: 1, answers: { notes: 'old' }, heldBy: 'lm@x.com' });
      const p = pdpManagerPayload('', prevNotes, { prepManager: { mgr: '  view  ', proud: 'x' }, notes: {} }, b, '2027-01-02T00:00:00Z');
      _assertEqual(p.prepManager.answers, { mgr: 'view' }, 'AC7 only manager prep keys, trimmed');
      _assertEqual(p.notes.answers, { notes: 'old' }, 'AC7 a missing key keeps the stored answer');
      _assertEqual(p.notes.heldBy, 'lm@x.com', 'AC7 heldBy carried');
      let threw = false;
      const many = { manager: [], meeting: Array.from({ length: 12 }, (_, i) => ({ type: 'prompt', key: 'p' + i })) };
      const big = {}; many.meeting.forEach(x => { big[x.key] = 'x'.repeat(5000); });
      try { pdpManagerPayload('', '', { notes: big }, many, 'now'); } catch (e) { threw = true; }
      _assertEqual(threw, true, 'AC7 over the JSON limit throws');
    },
  },
  {
    name: 'N-439 AC8 pdpHeldCheck',
    fn: function () {
      const m = _pdptM({ MeetingDate: '2027-01-20T12:00:00Z' });
      const full = (o) => pdpHeldCheck(m, _PDPT_DEF, { answers: { mgr: 'a' } }, { answers: { notes: 'n' } }, o.goals || [], o.actions || [], o.date || '', o.today || '2027-01-25');
      const g3 = [1, 2, 3].map(i => ({ id: i, MeetingID: 1 }));
      const ok = full({ goals: g3, actions: [{ MeetingID: 1, OwnerRole: 'Manager', OwnerEmail: 'lm@x.com', DueDate: '2027-02-01' }] });
      _assertEqual([ok.ok, ok.problems, ok.warnings], [true, [], ['The employee has not marked their prep ready.']], 'AC8 complete record, employee prep warning');
      _assertEqual(full({ goals: g3.slice(0, 2) }).problems, ['Record at least 3 goals.'], 'AC8 goal minimum');
      _assertEqual(full({ goals: g3, actions: [{ MeetingID: 1, OwnerRole: 'Manager', OwnerEmail: '', DueDate: '' }] }).problems, ['Every action needs an owner and a due date.'], 'AC8 action owner and date');
      _assertEqual(full({ goals: g3, date: '2027-02-01' }).problems, ['The meeting date cannot be in the future.'], 'AC8 future date');
      _assertEqual(pdpHeldCheck(m, _PDPT_DEF, { answers: {} }, { answers: {} }, g3, [], '', '2027-01-25').problems, ['Answer: Manager view', 'Answer: Notes'], 'AC8 required blocks');
      _assertEqual(pdpHeldCheck(_pdptM({ Status: 'Held' }), _PDPT_DEF, {}, {}, g3, [], '', '2027-01-25').problems[0], 'This meeting is already held.', 'AC8 already held');
      _assertEqual(pdpHeldCheck(_pdptM({ ManagerSignedAt: '2027-01-02T00:00:00Z' }), _PDPT_DEF, {}, {}, g3, [], '', '2027-01-25').problems.includes('This record is signed and locked.'), true, 'AC8 signed is locked');
    },
  },
  {
    name: 'N-439 AC9 patches: first touch opens prep and re-binds the template; sign plan records who',
    fn: function () {
      const tpl = { id: 7, VersionNo: 3, MeetingType: 'Annual' };
      const planned = _pdptM({ Status: 'Planned', TemplateVersion: 1 });
      _assertEqual(pdpMeetingPatchForManager(planned, tpl, { PrepManager: {} }, 'now'), { PrepManager: {}, Status: 'PrepOpen', TemplateID: 7, TemplateVersion: 3 }, 'AC9 Planned is opened and re-bound');
      _assertEqual(pdpMeetingPatchForManager(planned, tpl, { Status: 'Held' }, 'now').Status, 'Held', 'AC9 caller Status wins');
      _assertEqual(pdpMeetingPatchForManager(_pdptM({ TemplateVersion: 1 }), tpl, { A: 1 }, 'now'), { A: 1 }, 'AC9 PrepOpen is never re-bound');
      const held = _pdptM({ Status: 'Held', MeetingNotes: JSON.stringify({ schema: 1, answers: { notes: 'n' } }) });
      const plan = pdpManagerSignPlan(held, 'LM@x.com', '2027-02-01T10:00:00Z');
      _assertEqual(plan.ok, true, 'AC9 sign plan ok');
      _assertEqual([plan.patch.MeetingNotes.managerSignedBy, plan.patch.MeetingNotes.answers], ['lm@x.com', { notes: 'n' }], 'AC9 signer recorded, notes kept');
      _assertEqual(pdpManagerSignPlan(_pdptM({ Status: 'PrepOpen' }), 'lm@x.com', 'now').ok, false, 'AC9 only a held meeting can be signed');
    },
  },
  {
    name: 'N-439 AC10 goal and action payloads copy the meeting snapshot',
    fn: function () {
      const m = _pdptM({ id: 5 });
      const g = pdpGoalPayload(m, { Title: ' Grow ', Category: 'Career', TargetDate: '2027-06-30' }, 'create');
      _assertEqual([g.Title, g.GoalLevel, g.Period, g.MeetingID, g.PersonEmail, g.LineManagerEmail, g.CSDEmail, g.Status], ['Grow', 'Annual', '2027-01', 5, 'pat@x.com', 'lm@x.com', 'csd@x.com', 'Open'], 'AC10 goal snapshot');
      _assertEqual('GoalLevel' in pdpGoalPayload(m, { Title: 'x', Category: 'Career' }, 'update'), false, 'AC10 an update never rewrites the snapshot');
      _assertEqual(pdpGoalPayload(_pdptM({ MeetingType: 'BiAnnual' }), { Title: 'x', Category: 'Career' }, 'create').GoalLevel, 'H2', 'AC10 bi-annual is H2');
      let e1 = '', e2 = '';
      try { pdpGoalPayload(_pdptM({ MeetingType: 'Monthly' }), { Title: 'x', Category: 'Career' }, 'create'); } catch (e) { e1 = e.message; }
      try { pdpGoalPayload(m, { Title: 'x', Category: 'Nope' }, 'create'); } catch (e) { e2 = e.message; }
      _assertEqual([e1, e2], ['Goals are not set in this meeting.', 'Pick a goal category.'], 'AC10 goal errors');
      const a = pdpActionPayload(m, { Title: 'Do it', OwnerRole: 'Employee', DueDate: '2027-02-10' }, 'lm@x.com', 'create');
      _assertEqual([a.OwnerEmail, a.MeetingID, a.CSDEmail], ['pat@x.com', 5, 'csd@x.com'], 'AC10 employee-owned action');
      _assertEqual(pdpActionPayload(m, { Title: 'Do it', OwnerRole: 'Manager', DueDate: '2027-02-10' }, 'lm@x.com', 'create').OwnerEmail, 'lm@x.com', 'AC10 manager-owned action');
      let e3 = '';
      try { pdpActionPayload(m, { Title: 'x', OwnerRole: 'Manager', DueDate: '' }, 'lm@x.com', 'create'); } catch (e) { e3 = e.message; }
      _assertEqual(e3, 'Give the action a due date.', 'AC10 action needs a date');
    },
  },
  {
    name: 'N-439 AC11 API writers (source): Ghost, run rule, lock, fresh read; one delete only',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'];
      const part = src.slice(src.indexOf('// ── N-439 (PDP-7)'));
      const who = part.slice(part.indexOf('async function _pdpTeamWho'), part.indexOf('async function _pdpTeamMeeting'));
      _assertEqual(/_ensureGhostGate/.test(who) && /pdpEffectiveEmail\(/.test(who), true, 'AC11 effective identity');
      const guard = part.slice(part.indexOf('async function _pdpTeamMeeting'), part.indexOf('async function _pdpTeamPersonRows'));
      _assertEqual(/Ghost Mode is read-only/.test(guard) && /pdpTeamAccess\(who\.role, who\.email, m\)\.run/.test(guard) && /_cacheInvalidate\(CONFIG\.PDP\.LISTS\.MEETINGS\)/.test(guard), true, 'AC11 ghost, run rule and a fresh read');
      _assertEqual(/pdpManagerLock/.test(part), true, 'AC11 lock re-checked');
      _assertEqual((part.match(/deleteItem\(/g) || []).length, 1, 'AC11 exactly one delete (removeTeamItem)');
      const rm = part.slice(part.indexOf('async function removeTeamItem'), part.indexOf('async function resolvePdpNav'));
      _assertEqual(/deleteItem\(/.test(rm), true, 'AC11 the delete is removeTeamItem');
      _assertEqual(/AccessKey|graphRequest\(/.test(part), false, 'AC11 no raw Graph or access keys');
    },
  },
  {
    name: 'N-439 AC12 page (source): registered handlers, no inline handlers, no hex; load order',
    fn: function () {
      const page = ALL_SOURCES['pdp-team-page.js'], rules = ALL_SOURCES['pdp-team.js'];
      _assertEqual(/\son[a-z]+\s*=|style\s*=/.test(page), false, 'AC12 no inline handlers or styles');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(page + rules), false, 'AC12 no hex colours');
      const reg = page.slice(page.indexOf('registerActions({'));
      ['pdptYear', 'pdptView', 'pdptPerson', 'pdptOpen', 'pdptTeamBack', 'pdptTeamSave', 'pdptHeld', 'pdptSign', 'pdptGoalSave', 'pdptActionSave', 'pdptGoalRemove', 'pdptActionRemove'].forEach(n => {
        _assertEqual(new RegExp('\\b' + n + '\\b').test(reg), true, 'AC12 handler registered: ' + n);
      });
    },
  }
);