// tests/assert-pdp-track.js — Goals & actions tracker (N-440 / PDP-8). Loads AFTER tests/assert-pdp-team.js.
// The pure rules (pdp-track.js) are exercised directly; the API functions, the pages and the shared markup are
// checked from source or from fixtures because the runner is synchronous. Spec: specs/N-440.md.

function _trThrows(fn) { try { fn(); } catch (e) { return e.message; } return ''; }

const _TR_SNAP = { id: 7, PersonID: 10, PersonEmail: 'pat@x.com', LineManagerEmail: 'lm@x.com', CSDEmail: 'csd@x.com', CycleYear: 2027, MeetingType: 'Annual', Period: '2027-01', Status: 'PrepOpen', DueDate: '2027-01-31T00:00:00Z' };
const _trG = (o) => Object.assign({ id: 1, PersonID: 10, CycleYear: 2027, Title: 'Goal', GoalLevel: 'Annual', Period: '2027', Status: 'Open', Rag: '', MeetingID: 0, ParentGoalID: null }, o || {});
const _trA = (o) => Object.assign({ id: 1, PersonID: 10, Title: 'Act', OwnerRole: 'Employee', DueDate: '2027-03-10T00:00:00Z', IsDone: false, MeetingID: 0 }, o || {});
const _trSigned = { id: 5, Status: 'Held', EmployeeSignedAt: '2027-02-01T10:00:00Z', ManagerSignedAt: '' };
const _trOpen = { id: 6, Status: 'Held', EmployeeSignedAt: '', ManagerSignedAt: '' };
const _trMeetings = new Map([['5', _trSigned], ['6', _trOpen]]);
const _TR_LOCKED = 'This was agreed in a signed meeting, so only RAG, status and done can change.';

ASSERTIONS.push(
  {
    name: 'N-440 AC1 config: CONFIG.PDP.TRACKER, no new page',
    fn: function () {
      const t = CONFIG.PDP.TRACKER;
      _assertEqual(t.RAG_ORDER, ['Red', 'Amber', 'Green'], 'AC1 worst first');
      _assertEqual([t.GOALS_PER_LEVEL_MAX, t.HALF_START_MONTH], [10, 7], 'AC1 caps and half-year month');
      _assertEqual(t.AGREED_FIELDS, ['Title', 'Category', 'WhyItMatters', 'SuccessMeasures', 'Support', 'TargetDate', 'ParentGoalID'], 'AC1 agreed fields');
      _assertEqual(t.LIVE_FIELDS, ['Rag', 'Status'], 'AC1 live fields');
      _assertEqual(CONFIG.COMMAND_BAR_PAGES.some(p => /goalsAndActions|goalsTracker|pdpTrack|pdptr/i.test(p.key)), false, 'AC1 no Command Bar entry');
      _assertEqual(/goalsTracker|pdpTracker/i.test(ALL_SOURCES['people-router.js']), false, 'AC1 no new People page');
    },
  },
  {
    name: 'N-440 AC2 pdpGoalPeriod / pdpGoalPeriodFix',
    fn: function () {
      _assertEqual([pdpGoalPeriod('Annual', 2027), pdpGoalPeriod('H2', 2027), pdpGoalPeriod('Quarterly', 2027, '2027-04'), pdpGoalPeriod('Quarterly', 2027, '2027-10')], ['2027', '2027-H2', '2027-Q2', '2027-Q4'], 'AC2 canonical periods');
      _assertEqual(pdpGoalPeriod('Quarterly', 2027, null, 3), '2027-Q3', 'AC2 explicit quarter');
      _assertEqual(_trThrows(() => pdpGoalPeriod('Quarterly', 2027, null, null)), 'Pick the quarter for a quarterly goal.', 'AC2 quarterly needs a quarter');
      _assertEqual(pdpGoalPeriodFix(_trG({ GoalLevel: 'Quarterly', Period: '2027-04' })), '2027-Q2', 'AC2 legacy quarterly');
      _assertEqual(pdpGoalPeriodFix(_trG({ GoalLevel: 'H2', Period: '2027-07' })), '2027-H2', 'AC2 legacy H2');
      _assertEqual(pdpGoalPeriodFix(_trG({ GoalLevel: 'Annual', Period: '2027-01' })), '2027', 'AC2 legacy annual');
      _assertEqual(pdpGoalPeriodFix(_trG({ GoalLevel: 'Quarterly', Period: '2027-Q3' })), '2027-Q3', 'AC2 canonical unchanged');
      _assertEqual([pdpGoalPeriodFix(_trG({ GoalLevel: 'Quarterly', Period: 'soon' })), pdpGoalPeriodFix(_trG({ GoalLevel: 'Nope' })), pdpGoalPeriodFix(_trG({ CycleYear: '' }))], [null, null, null], 'AC2 unfixable is null');
    },
  },
  {
    name: 'N-440 AC3 N-439 goal payload writes the canonical Period',
    fn: function () {
      const m = Object.assign({}, _TR_SNAP, { id: 5 });
      const mk = (type, period) => pdpGoalPayload(Object.assign({}, m, { MeetingType: type, Period: period }), { Title: 'x', Category: 'Career' }, 'create');
      _assertEqual([mk('Annual', '2027-01').Period, mk('BiAnnual', '2027-07').Period, mk('Quarterly', '2027-04').Period, mk('Quarterly', '2027-10').Period], ['2027', '2027-H2', '2027-Q2', '2027-Q4'], 'AC3 periods');
      const g = mk('Annual', '2027-01');
      _assertEqual([g.MeetingID, g.GoalLevel, g.PersonEmail, g.Status], [5, 'Annual', 'pat@x.com', 'Open'], 'AC3 rest unchanged');
    },
  },
  {
    name: 'N-440 AC4 pdpTrackerAccess: self / LM / CSD edit, admin view only, closed cycle read-only',
    fn: function () {
      _assertEqual(pdpTrackerAccess('talent_partner', 'pat@x.com', _TR_SNAP), { view: true, edit: true, as: 'self' }, 'AC4 person');
      _assertEqual(pdpTrackerAccess('admin', 'pat@x.com', _TR_SNAP).as, 'self', 'AC4 an admin who is the person is still self');
      _assertEqual(pdpTrackerAccess('delivery_manager', 'LM@x.com', _TR_SNAP), { view: true, edit: true, as: 'lm' }, 'AC4 line manager');
      _assertEqual(pdpTrackerAccess('admin', 'csd@x.com', _TR_SNAP), { view: true, edit: true, as: 'csd' }, 'AC4 CSD with the Admin role');
      _assertEqual(pdpTrackerAccess('admin', 'other@x.com', _TR_SNAP), { view: true, edit: false, as: 'admin' }, 'AC4 admin who is nobody: view only');
      _assertEqual(pdpTrackerAccess('people_ops', 'other@x.com', _TR_SNAP).edit, false, 'AC4 People Ops view only');
      _assertEqual(pdpTrackerAccess('leadership', 'other@x.com', _TR_SNAP), { view: false, edit: false, as: null }, 'AC4 leadership none');
      _assertEqual(pdpTrackerAccess('delivery_manager', 'old@x.com', Object.assign({}, _TR_SNAP, { ReadOnlyEmails: 'old@x.com' })), { view: true, edit: false, as: 'former' }, 'AC4 former manager reads');
      _assertEqual(pdpTrackerAccess('talent_partner', 'pat@x.com', _TR_SNAP, { Status: 'Closed' }).edit, false, 'AC4 closed cycle is read-only for the person');
      _assertEqual(pdpTrackerAccess('admin', 'lm@x.com', _TR_SNAP, { Status: 'Closed' }).edit, false, 'AC4 closed cycle is read-only for the manager');
    },
  },
  {
    name: 'N-440 AC5 parent options and check',
    fn: function () {
      const a = _trG({ id: 1 }), h = _trG({ id: 2, GoalLevel: 'H2', Period: '2027-H2' }), d = _trG({ id: 3, GoalLevel: 'H2', Status: 'Dropped' });
      const goals = [a, h, d];
      const ids = l => l.map(g => g.id);
      _assertEqual(ids(pdpGoalParentOptions('Annual', '2027', goals)), [], 'AC5 annual has no parent');
      _assertEqual(ids(pdpGoalParentOptions('H2', '2027-H2', goals)), [1], 'AC5 H2 sits under annual');
      _assertEqual(ids(pdpGoalParentOptions('Quarterly', '2027-Q2', goals)), [1], 'AC5 Q2 under annual');
      _assertEqual(ids(pdpGoalParentOptions('Quarterly', '2027-Q3', goals)), [2], 'AC5 Q3 under H2 when present');
      _assertEqual(ids(pdpGoalParentOptions('Quarterly', '2027-Q4', [a])), [1], 'AC5 Q4 falls back to annual');
      const chk = (o) => pdpGoalParentCheck(Object.assign({ level: 'H2', period: '2027-H2', goals, personId: 10, cycleYear: 2027 }, o));
      _assertEqual([chk({ parentId: '' }), chk({ parentId: 0 }), chk({ parentId: '1' })], [0, 0, 1], 'AC5 none or valid');
      _assertEqual(_trThrows(() => chk({ parentId: 99 })), 'That parent goal was not found.', 'AC5 unknown parent');
      _assertEqual(_trThrows(() => chk({ personId: 11, parentId: 1 })), 'That parent goal belongs to someone else or to another year.', 'AC5 other person');
      _assertEqual(_trThrows(() => chk({ cycleYear: 2028, parentId: 1 })), 'That parent goal belongs to someone else or to another year.', 'AC5 other year');
      _assertEqual(_trThrows(() => chk({ parentId: 2 })), 'Pick a parent from the level above (not a dropped goal).', 'AC5 wrong level');
      _assertEqual(_trThrows(() => chk({ level: 'Quarterly', period: '2027-Q3', parentId: 3 })), 'Pick a parent from the level above (not a dropped goal).', 'AC5 dropped parent');
      const loop = [_trG({ id: 1, ParentGoalID: 2 }), _trG({ id: 2, GoalLevel: 'H2', ParentGoalID: 1 })];
      _assertEqual(_trThrows(() => pdpGoalParentCheck({ level: 'H2', period: '2027-H2', parentId: 1, goals: loop, personId: 10, cycleYear: 2027, selfId: 2 })), 'A goal cannot sit under one of its own sub-goals.', 'AC5 cycle');
    },
  },
  {
    name: 'N-440 AC6 pdpGoalFieldLock: agreed only once the originating meeting is signed',
    fn: function () {
      _assertEqual(pdpGoalFieldLock(_trG({ MeetingID: 5 }), _trMeetings), 'agreed', 'AC6 signed meeting');
      _assertEqual(pdpGoalFieldLock(_trG({ MeetingID: 6 }), _trMeetings), 'open', 'AC6 unsigned held meeting');
      _assertEqual(pdpGoalFieldLock(_trG({ MeetingID: 0 }), _trMeetings), 'open', 'AC6 tracker-created');
      _assertEqual(pdpGoalFieldLock(_trG({ MeetingID: 9 }), _trMeetings), 'open', 'AC6 meeting not found');
      _assertEqual(pdpGoalFieldLock(_trA({ MeetingID: 5 }), _trMeetings), 'agreed', 'AC6 actions use the same rule');
      _assertEqual(pdpGoalFieldLock(_trG({ MeetingID: 5 }), { 5: _trSigned }), 'agreed', 'AC6 plain-object map');
    },
  },
  {
    name: 'N-440 AC7 pdpTrackerGoalPayload / pdpTrackerActionPayload',
    fn: function () {
      const ok = { Title: ' Ship it ', Category: 'Business', GoalLevel: 'Quarterly', Quarter: '2', TargetDate: '2027-06-30', Rag: 'Amber' };
      const g = pdpTrackerGoalPayload(_TR_SNAP, ok, 'create', [], null, _trMeetings);
      _assertEqual([g.Title, g.GoalLevel, g.Period, g.CycleYear, g.PersonEmail, g.CSDEmail, g.Status, g.Rag, 'MeetingID' in g, 'ParentGoalID' in g], ['Ship it', 'Quarterly', '2027-Q2', 2027, 'pat@x.com', 'csd@x.com', 'Open', 'Amber', false, false], 'AC7 create');
      _assertEqual(_trThrows(() => pdpTrackerGoalPayload(_TR_SNAP, Object.assign({}, ok, { Title: ' ' }), 'create', [], null)), 'Give the goal a title.', 'AC7 title');
      _assertEqual(_trThrows(() => pdpTrackerGoalPayload(_TR_SNAP, Object.assign({}, ok, { Quarter: '' }), 'create', [], null)), 'Pick the quarter for a quarterly goal.', 'AC7 quarter');
      _assertEqual(_trThrows(() => pdpTrackerGoalPayload(_TR_SNAP, Object.assign({}, ok, { GoalLevel: 'Weekly' }), 'create', [], null)), 'Pick a goal level.', 'AC7 level');
      const full = Array.from({ length: 10 }, (_, i) => _trG({ id: 100 + i, GoalLevel: 'Quarterly', Period: '2027-Q1' }));
      _assertEqual(/most open Quarterly goals allowed \(10\)/.test(_trThrows(() => pdpTrackerGoalPayload(_TR_SNAP, ok, 'create', full, null))), true, 'AC7 per-level cap');
      const annual = _trG({ id: 1 });
      const h = pdpTrackerGoalPayload(_TR_SNAP, { Title: 'H', Category: 'Career', GoalLevel: 'H2', ParentGoalID: '1' }, 'create', [annual], null);
      _assertEqual([h.Period, h.ParentGoalID], ['2027-H2', 1], 'AC7 parent kept');
      _assertEqual(_trThrows(() => pdpTrackerGoalPayload(_TR_SNAP, { Title: 'H', Category: 'Career', GoalLevel: 'Annual', ParentGoalID: '1' }, 'create', [annual], null)), 'Pick a parent from the level above (not a dropped goal).', 'AC7 annual cannot have a parent');
      const open = _trG({ id: 4, Title: 'Old', Category: 'Career', MeetingID: 6, GoalLevel: 'H2', Period: '2027-07' });
      const upd = pdpTrackerGoalPayload(_TR_SNAP, { Title: 'New', Rag: 'Red' }, 'update', [annual, open], open, _trMeetings);
      _assertEqual([upd.Title, upd.Rag], ['New', 'Red'], 'AC7 open goal edits');
      const agreed = _trG({ id: 5, Title: 'Agreed', Category: 'Career', MeetingID: 5, GoalLevel: 'H2', Period: '2027-07', TargetDate: '2027-12-31T00:00:00Z' });
      _assertEqual(_trThrows(() => pdpTrackerGoalPayload(_TR_SNAP, { Title: 'Renamed' }, 'update', [annual, agreed], agreed, _trMeetings)), _TR_LOCKED, 'AC7 agreed wording locked');
      _assertEqual(pdpTrackerGoalPayload(_TR_SNAP, { Title: 'Agreed', Category: 'Career', TargetDate: '2027-12-31', Rag: 'Green', Status: 'Achieved' }, 'update', [annual, agreed], agreed, _trMeetings), { Rag: 'Green', Status: 'Achieved' }, 'AC7 unchanged agreed fields pass; live fields write');
      _assertEqual(pdpTrackerGoalPayload(_TR_SNAP, { ParentGoalID: '1' }, 'update', [annual, agreed], agreed, _trMeetings).ParentGoalID, 1, 'AC7 first parent link allowed after sign-off');
      const linked = _trG({ id: 6, MeetingID: 5, GoalLevel: 'H2', Period: '2027-07', ParentGoalID: 1 });
      _assertEqual(_trThrows(() => pdpTrackerGoalPayload(_TR_SNAP, { ParentGoalID: '' }, 'update', [annual, linked], linked, _trMeetings)), _TR_LOCKED, 'AC7 an agreed link cannot be removed');
      _assertEqual(_trThrows(() => pdpTrackerGoalPayload(_TR_SNAP, { GoalLevel: 'Annual' }, 'update', [open], open, _trMeetings)), 'A goal’s level and period cannot change. Drop it and add a new one.', 'AC7 level fixed');
      const kid = Object.assign({}, open, { ParentGoalID: 1 });
      _assertEqual(pdpTrackerGoalPayload(_TR_SNAP, { ParentGoalID: '' }, 'update', [annual, kid], kid, _trMeetings).ParentGoalID, null, 'AC7 clearing a parent writes blank');
      _assertEqual(_trThrows(() => pdpTrackerGoalPayload(_TR_SNAP, { Title: 'Old' }, 'update', [annual, open], Object.assign({}, open, { Title: 'Old' }), _trMeetings)), 'Nothing to change.', 'AC7 goal: nothing to change');
      const actor = { email: 'lm@x.com', as: 'lm' };
      const a = pdpTrackerActionPayload(_TR_SNAP, { Title: ' Call ', OwnerRole: 'Manager', DueDate: '2027-03-01', GoalID: '1' }, 'create', actor, [annual], null);
      _assertEqual([a.Title, a.OwnerEmail, a.PersonEmail, a.CSDEmail, a.IsDone, a.GoalID, 'MeetingID' in a], ['Call', 'lm@x.com', 'pat@x.com', 'csd@x.com', false, 1, false], 'AC7 manager-owned action, no meeting');
      _assertEqual(pdpTrackerActionPayload(_TR_SNAP, { Title: 'x', OwnerRole: 'Manager', DueDate: '2027-03-01' }, 'create', { email: 'pat@x.com', as: 'self' }, [], null).OwnerEmail, 'lm@x.com', 'AC7 employee giving the manager an action');
      _assertEqual(pdpTrackerActionPayload(_TR_SNAP, { Title: 'x', OwnerRole: 'Employee', DueDate: '2027-03-01' }, 'create', actor, [], null).OwnerEmail, 'pat@x.com', 'AC7 employee-owned action');
      _assertEqual(_trThrows(() => pdpTrackerActionPayload(_TR_SNAP, { Title: 'x', OwnerRole: 'Employee', DueDate: '' }, 'create', actor, [], null)), 'Give the action a due date.', 'AC7 due date');
      _assertEqual(_trThrows(() => pdpTrackerActionPayload(_TR_SNAP, { Title: 'x', OwnerRole: 'Employee', DueDate: '2027-03-01', GoalID: '9' }, 'create', actor, [annual], null)), 'Pick one of this person’s goals.', 'AC7 goal must be theirs');
      const act = _trA({ id: 8, MeetingID: 5, Title: 'Old' });
      _assertEqual(_trThrows(() => pdpTrackerActionPayload(_TR_SNAP, { Title: 'New' }, 'update', actor, [], act, _trMeetings)), _TR_LOCKED, 'AC7 agreed action locked');
      _assertEqual(pdpTrackerActionPayload(_TR_SNAP, { Title: 'New' }, 'update', actor, [], _trA({ id: 9, Title: 'Old' }), _trMeetings).Title, 'New', 'AC7 tracker action edits');
      _assertEqual(_trThrows(() => pdpTrackerActionPayload(_TR_SNAP, { Title: 'Old' }, 'update', actor, [], _trA({ id: 9, Title: 'Old' }), _trMeetings)), 'Nothing to change.', 'AC7 action: nothing to change');
    },
  },
  {
    name: 'N-440 AC8 pdpLiveGoalPatch / pdpActionDonePatch',
    fn: function () {
      _assertEqual(pdpLiveGoalPatch({ Rag: 'Red' }), { Rag: 'Red' }, 'AC8 rag');
      _assertEqual(pdpLiveGoalPatch({ Rag: '' }), { Rag: '' }, 'AC8 blank clears');
      _assertEqual(pdpLiveGoalPatch({ Status: 'Achieved', Rag: 'Green' }), { Rag: 'Green', Status: 'Achieved' }, 'AC8 both');
      _assertEqual(_trThrows(() => pdpLiveGoalPatch({ Rag: 'Purple' })), 'Pick Red, Amber or Green.', 'AC8 bad rag');
      _assertEqual(_trThrows(() => pdpLiveGoalPatch({ Status: 'Done' })), 'Pick Open, Achieved or Dropped.', 'AC8 bad status');
      _assertEqual(_trThrows(() => pdpLiveGoalPatch({})), 'Nothing to change.', 'AC8 empty');
      _assertEqual([pdpActionDonePatch(true, 'T'), pdpActionDonePatch(false, 'T')], [{ IsDone: true, DoneAt: 'T' }, { IsDone: false, DoneAt: '' }], 'AC8 done patch');
    },
  },
  {
    name: 'N-440 AC9 pdpRagRollup: worst of own and open descendants, derived only',
    fn: function () {
      const p = _trG({ Rag: 'Green' });
      const kid = (rag, status) => _trG({ id: 2, Rag: rag, Status: status || 'Open' });
      _assertEqual(pdpRagRollup(p, [kid('Amber')]), { own: 'Green', rolled: 'Amber' }, 'AC9 amber child');
      _assertEqual(pdpRagRollup(p, [kid('Amber'), kid('Red')]).rolled, 'Red', 'AC9 worst wins');
      _assertEqual(pdpRagRollup(p, [kid('Red', 'Dropped'), kid('Red', 'Achieved')]).rolled, 'Green', 'AC9 achieved and dropped ignored');
      _assertEqual(pdpRagRollup(_trG({ Rag: '' }), [kid('')]), { own: '', rolled: '' }, 'AC9 nothing set');
      _assertEqual(pdpRagRollup(_trG({ Rag: '' }), [kid('Amber')]).rolled, 'Amber', 'AC9 parent blank takes the child');
      const api = ALL_SOURCES['api-pdp.js'];
      _assertEqual(/rolled/.test(api.slice(api.indexOf('// ── N-440 (PDP-8)'))), false, 'AC9 never stored by the API');
    },
  },
  {
    name: 'N-440 AC10 pdpTrackerModel: tree, orphans, counts, actions shown',
    fn: function () {
      const goals = [
        _trG({ id: 1, Title: 'A1', Rag: 'Green', TargetDate: '2027-12-31T00:00:00Z' }),
        _trG({ id: 2, Title: 'H', GoalLevel: 'H2', Period: '2027-H2', ParentGoalID: 1, Rag: 'Amber', TargetDate: '2027-12-31T00:00:00Z' }),
        _trG({ id: 3, Title: 'Q', GoalLevel: 'Quarterly', Period: '2027-Q3', ParentGoalID: 2, Rag: 'Red', TargetDate: '2027-02-01T00:00:00Z' }),
        _trG({ id: 4, Title: 'Lone', GoalLevel: 'Quarterly', Period: '2027-Q2', Rag: 'Green' }),
        _trG({ id: 5, Title: 'Gone', Status: 'Dropped' }),
        _trG({ id: 6, Title: 'Won', Status: 'Achieved' }),
        _trG({ id: 7, Title: 'Other year', CycleYear: 2026 }),
      ];
      const actions = [
        _trA({ id: 1, Title: 'late', DueDate: '2027-03-01T00:00:00Z' }),
        _trA({ id: 2, Title: 'soon', DueDate: '2027-03-12T00:00:00Z' }),
        _trA({ id: 3, Title: 'far', DueDate: '2027-09-01T00:00:00Z' }),
        _trA({ id: 4, Title: 'done27', IsDone: true, DueDate: '2027-02-01T00:00:00Z' }),
        _trA({ id: 5, Title: 'done26', IsDone: true, DueDate: '2026-12-01T00:00:00Z' }),
        _trA({ id: 6, Title: 'open26', DueDate: '2026-12-15T00:00:00Z' }),
      ];
      const m = pdpTrackerModel(goals, actions, [_trSigned], '2027-03-05', 2027);
      const a1 = m.tree.find(n => n.goal.Title === 'A1');
      _assertEqual(m.tree.map(n => n.goal.Title).sort(), ['A1', 'Gone', 'Won'], 'AC10 annual goals are the roots (this year only)');
      _assertEqual([a1.children.map(c => c.goal.Title), a1.children[0].children.map(c => c.goal.Title)], [['H'], ['Q']], 'AC10 annual -> H2 -> quarterly');
      _assertEqual([a1.rag.own, a1.rag.rolled, a1.children[0].rag.rolled], ['Green', 'Red', 'Red'], 'AC10 roll-up');
      _assertEqual(m.orphans.map(n => n.goal.Title), ['Lone'], 'AC10 orphan');
      _assertEqual([a1.children[0].children[0].overdue, a1.overdue], [true, false], 'AC10 goal overdue only when Open and past target');
      const c = m.counts;
      _assertEqual([c.open, c.achieved, c.dropped, c.red, c.amber, c.green], [4, 1, 1, 1, 0, 1], 'AC10 goal counts (rolled RAG over open top-level goals)');
      _assertEqual([m.actionsOpen.map(x => x.action.Title), m.actionsDone.map(x => x.action.Title)], [['open26', 'late', 'soon', 'far'], ['done27']], 'AC10 actions shown: all open + done due in the year');
      _assertEqual([c.actionsOpen, c.actionsOverdue, c.actionsDueSoon, c.actionsDone], [4, 2, 1, 1], 'AC10 action counts');
    },
  },
  {
    name: 'N-440 AC11 pdpGoalPeriodPlan: planned, skipped, idempotent',
    fn: function () {
      const goals = [
        _trG({ id: 1, GoalLevel: 'Quarterly', Period: '2027-04' }), _trG({ id: 2, Period: '2027' }),
        _trG({ id: 3, GoalLevel: 'H2', Period: '2027-07' }), _trG({ id: 4, GoalLevel: 'Quarterly', Period: 'later' }),
      ];
      const p = pdpGoalPeriodPlan(goals);
      _assertEqual(p.rows, [{ id: 1, from: '2027-04', to: '2027-Q2' }, { id: 3, from: '2027-07', to: '2027-H2' }], 'AC11 rows');
      _assertEqual(p.skipped.map(s => s.id), [4], 'AC11 skipped');
      const applied = goals.map(g => { const r = p.rows.find(x => x.id === g.id); return r ? Object.assign({}, g, { Period: r.to }) : g; });
      _assertEqual(pdpGoalPeriodPlan(applied).rows, [], 'AC11 a second plan is empty');
    },
  },
  {
    name: 'N-440 AC12 API writers (source): Ghost, gate, access from the record, fresh read, live fields, no delete',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'];
      const part = src.slice(src.indexOf('// ── N-440 (PDP-8)'));
      const ctx = part.slice(part.indexOf('async function _pdpTrackerCtx'), part.indexOf('function _pdpTrackerOwn'));
      _assertEqual(/Ghost Mode is read-only/.test(ctx) && /gate\.state !== 'live'/.test(ctx) && /pdpTrackerAccess\(who\.role, who\.email, snap, cycle\)/.test(ctx) && /access\.edit/.test(ctx), true, 'AC12 ghost, gate, access from the record');
      _assertEqual(/_cacheInvalidate\(l\)/.test(ctx) && /L\.GOALS/.test(ctx) && /L\.ACTIONS/.test(ctx) && /L\.MEETINGS/.test(ctx) && /L\.CYCLES/.test(ctx), true, 'AC12 fresh reads');
      ['saveTrackerGoal', 'saveTrackerAction', 'setTrackerGoalLive', 'setTrackerActionDone'].forEach(n => {
        const fn = part.slice(part.indexOf('async function ' + n));
        _assertEqual(/_pdpTrackerCtx\(personId, year\)/.test(fn.slice(0, 400)), true, 'AC12 ' + n + ' goes through the guard');
      });
      _assertEqual(/_pdpMyWriteError/.test(part), true, 'AC12 the still-securing message');
      const live = part.slice(part.indexOf('async function setTrackerGoalLive'), part.indexOf('async function setTrackerActionDone'));
      _assertEqual(/pdpGoalFieldLock/.test(live), false, 'AC12 live fields are never locked by a meeting');
      const load = part.slice(part.indexOf('async function loadTeamPerson'), part.indexOf('async function planPdpGoalPeriods'));
      _assertEqual((load.match(/vis\(/g) || []).length >= 4 && /pdpVisibleItems\(rows, who\.role, who\.email\)/.test(load), true, 'AC12 loadTeamPerson filters through pdpVisibleItems with the effective identity');
      const mig = part.slice(part.indexOf('async function planPdpGoalPeriods'));
      _assertEqual(/_pdpSetupWho\(_PDP_ENGINE_REFUSAL\)/.test(mig) && /updatePdpGoal\(r\.id, \{ Period: r\.to \}\)/.test(mig) && /failed\.push/.test(mig), true, 'AC12 migration: pdpAdmin only, Period only, failures listed');
      _assertEqual((part.match(/deleteItem\(/g) || []).length, 0, 'AC12 the tracker has no delete');
      _assertEqual(/graphRequest\(|AccessKey/.test(part), false, 'AC12 no raw Graph or access keys');
      const mine = src.slice(src.indexOf('async function loadMyDevelopment'), src.indexOf('async function _pdpMyMeeting'));
      _assertEqual(/trackerEdit/.test(mine) && /pdpTrackerAccess\(role, email, snap, myCycle\)/.test(mine), true, 'AC12 loadMyDevelopment reports whether the tracker is editable');
    },
  },
  {
    name: 'N-440 AC13 pages: tabs, shared tracker markup from fixtures, read-only mode, locked wording',
    fn: function () {
      const my = ALL_SOURCES['pdp-my.js'], team = ALL_SOURCES['pdp-team-page.js'], ui = ALL_SOURCES['pdp-track-ui.js'];
      _assertEqual(/pdpmTab/.test(my) && /My year/.test(my) && /Goals &amp; actions/.test(my) && /pdptrSync\(/.test(my) && /pdptrHtml\(\)/.test(my), true, 'AC13 My Development tabs and tracker');
      _assertEqual(/pdptTab/.test(team) && /Meetings/.test(team) && /Goals &amp; actions/.test(team) && /loadTeamPerson\(/.test(team) && /pdptrSync\(/.test(team), true, 'AC13 Team Development person tabs and tracker');
      const goals = [_trG({ id: 1, Title: 'Own it <b>', Rag: 'Amber', TargetDate: '2027-12-31T00:00:00Z' }), _trG({ id: 2, Title: 'Signed one', MeetingID: 5, GoalLevel: 'H2', Period: '2027-H2', ParentGoalID: 1, Rag: 'Red' })];
      const actions = [_trA({ id: 1, Title: 'Call', DueDate: '2020-01-01T00:00:00Z' })];
      const data = (edit) => ({ goals, actions, meetings: [_trSigned], edit, note: '' });
      const ctx = (edit) => ({ personId: 10, year: 2027, data: data(edit), load: async () => data(edit), redraw: () => {} });
      pdptrReset(); pdptrSync(ctx(true));
      const html = pdptrHtml();
      _assertEqual(/Own it &lt;b&gt;/.test(html) && !/Own it <b>/.test(html), true, 'AC13 titles are escaped');
      _assertEqual(/pdptr-rag/.test(html) && /pdptrRag/.test(html) && /pdptrDone/.test(html) && /pdptrGoalForm/.test(html) && /Add goal/.test(html) && /Add action/.test(html), true, 'AC13 edit controls when edit is true');
      _assertEqual(/Rolled up/.test(html), true, 'AC13 rolled-up RAG (child Red under an Amber parent)');
      _assertEqual(/agreed in a signed meeting/.test(html) && /Overdue/.test(html), true, 'AC13 agreed marker and overdue badge');
      pdptrSync(ctx(true));
      _pdptrState.form = { kind: 'goal', id: null, values: { GoalLevel: 'Quarterly', Quarter: '3' }, lock: 'open' };
      const f1 = pdptrHtml();
      _assertEqual(/Sits under/.test(f1) && /Second half: Signed one/.test(f1) && !/Annual: Own it/.test(f1) && /pdptrFormLevel/.test(f1) && /pdptrFormQuarter/.test(f1) && /pdptrGoalSave/.test(f1), true, 'AC13 new quarterly goal form offers the H2 goal as parent (Q3)');
      _pdptrState.form = { kind: 'goal', id: 2, values: { Title: 'Signed one', ParentGoalID: '1' }, lock: 'agreed', level: 'H2', period: '2027-H2', lockedParent: 1 };
      const f2 = pdptrHtml();
      _assertEqual(/wording is locked/.test(f2) && !/data-tf="Title"/.test(f2) && /data-tf="ParentGoalID" disabled/.test(f2) && /pdptrGoalSave/.test(f2), true, 'AC13 agreed goal: wording read-only, linked parent fixed');
      _pdptrState.form = { kind: 'action', id: 1, values: {}, lock: 'agreed' };
      const f3 = pdptrHtml();
      _assertEqual(/Agreed in a signed meeting: you can tick it done/.test(f3) && !/pdptrActionSave/.test(f3) && !/data-tf="Title"/.test(f3), true, 'AC13 agreed action: no edit form, only Close');
      pdptrReset(); pdptrSync(ctx(false));
      const ro = pdptrHtml();
      _assertEqual(/pdptr-rag|pdptrRag|pdptrDone|Add goal|Add action|pdptrGoalForm/.test(ro), false, 'AC13 read-only renders no controls');
      _assertEqual(/Read-only: only the person/.test(ro), true, 'AC13 read-only note');
      pdptrReset();
      _assertEqual(pdptrHtml(), '', 'AC13 nothing before the first sync');
      _assertEqual(/\son[a-z]+\s*=|style\s*=/.test(ui), false, 'AC13 no inline handlers or styles');
      const reg = ui.slice(ui.indexOf('registerActions({'));
      ['pdptrDirty', 'pdptrGoalForm', 'pdptrActionForm', 'pdptrFormCancel', 'pdptrFormLevel', 'pdptrFormQuarter', 'pdptrGoalSave', 'pdptrActionSave', 'pdptrRag', 'pdptrStatus', 'pdptrDone'].forEach(n => {
        _assertEqual(new RegExp('\\b' + n + '\\b').test(reg), true, 'AC13 handler registered: ' + n);
      });
      _assertEqual(/pdptTab,/.test(team.slice(team.indexOf('registerActions({'))) && /pdpmTab,/.test(my.slice(my.indexOf('registerActions({'))), true, 'AC13 tab handlers registered');
      const cyc = ALL_SOURCES['pdp-cycle-admin.js'];
      _assertEqual(/Tidy goal periods/.test(cyc) && /planPdpGoalPeriods\(\)/.test(cyc) && /applyPdpGoalPeriods\(/.test(cyc) && /pdpcPeriodsPreview,/.test(cyc) && /pdpcPeriodsApply,/.test(cyc), true, 'AC13 PDP Setup Cycle: Tidy goal periods Preview / Apply');
    },
  },
  {
    name: 'N-440 AC14 source scans: allowlist, no hex, no mobile / MCP / Command Bar',
    fn: function () {
      ['pdp-track.js', 'pdp-track-ui.js'].forEach(f => {
        _assertEqual(_PDP_GUARD_ALLOW.includes(f), true, 'AC14 on the PDP-D12 allowlist: ' + f);
        _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(ALL_SOURCES[f]), false, 'AC14 no hex in ' + f);
        _assertEqual(/\bgetPdp|\bcreatePdp|\bupdatePdp/.test(ALL_SOURCES[f]), false, 'AC14 ' + f + ' never calls the list helpers directly');
      });
      _assertEqual(/pdp-track|pdptr|PDPGoals|PDPActions/.test(ALL_SOURCES['command-bar.js'] || ''), false, 'AC14 not in the Command Bar');
      _assertEqual(/pdp-track|pdpTracker|PDPGoals|PDPActions/.test(JSON.stringify(CONFIG.MCP.scripts || [])), false, 'AC14 not in MCP.scripts');
    },
  }
);