// tests/assert-bizgoals-track.js — N-533 / BG-2 Goals & Actions page: nesting, RAG roll-up, payloads, view model, history
// chain, rollover plan (bizgoals-track.js), page markup (bizgoals-track-ui.js), and source guards for the API, the load
// scope and the PDP-D12 guard. Loads AFTER tests/assert-bizgoals.js (reuses _bgtSrc / _bgtThrows / _bgtBody).

// Fixture: 2026 has Annual 1 (owner ann, Amber) > H2 2 (Red) > Q4 3 (Green); Annual 4 (Dropped); Q1 5 unlinked;
// 2025 Annual 9 carried into 2026 as Annual 1 (CarriedFromID 9). Ann is a candidate, ed is not.
function _bgtrFx() {
  const goals = [
    { id: '1', Title: 'Grow Iberia', GoalYear: 2026, GoalLevel: 'Annual', Period: '2026', Status: 'Open', Rag: 'Amber', OwnerEmail: 'ann@mg.test', OwnerName: 'Ann Admin', TargetDate: '2026-12-31T12:00:00Z', WhyItMatters: 'Revenue', CarriedFromID: 9, ChangedByEmail: 'ann@mg.test', Modified: '2026-03-02T09:00:00Z' },
    { id: '2', Title: 'H2 pipeline', GoalYear: 2026, GoalLevel: 'H2', Period: '2026-H2', Status: 'Open', Rag: 'Red', ParentGoalID: 1, OwnerEmail: 'ed@mg.test', OwnerName: 'Ed Former' },
    { id: '3', Title: 'Q4 hires', GoalYear: 2026, GoalLevel: 'Quarterly', Period: '2026-Q4', Status: 'Open', Rag: 'Green', ParentGoalID: 2, OwnerEmail: 'ann@mg.test' },
    { id: '4', Title: 'Old idea', GoalYear: 2026, GoalLevel: 'Annual', Period: '2026', Status: 'Dropped', Rag: 'Red', OwnerEmail: 'ann@mg.test' },
    { id: '5', Title: 'Q1 loose', GoalYear: 2026, GoalLevel: 'Quarterly', Period: '2026-Q1', Status: 'Open', OwnerEmail: 'ann@mg.test' },
    { id: '9', Title: 'Grow Iberia', GoalYear: 2025, GoalLevel: 'Annual', Period: '2025', Status: 'Carried forward', OwnerEmail: 'ann@mg.test' },
  ];
  const actions = [
    { id: '11', Title: 'Hire SDM', GoalID: 1, OwnerEmail: 'ann@mg.test', DueDate: '2026-05-01T12:00:00Z', IsDone: false },
    { id: '12', Title: 'Q4 plan', GoalID: 3, OwnerEmail: 'ed@mg.test', DueDate: '2026-06-10T12:00:00Z', IsDone: false },
    { id: '13', Title: 'Kick-off', GoalID: 1, OwnerEmail: 'ann@mg.test', DueDate: '2026-01-10T12:00:00Z', IsDone: true },
    { id: '14', Title: 'Old', GoalID: 9, OwnerEmail: 'ann@mg.test', DueDate: '2025-05-01T12:00:00Z', IsDone: true },
  ];
  const updates = [
    { id: '21', GoalID: 1, UpdateText: 'On track', AuthorName: 'Ann Admin', Created: '2026-04-01T10:00:00Z' },
    { id: '22', GoalID: 1, UpdateText: 'Slipping', AuthorName: 'Lee Lead', Created: '2026-05-01T10:00:00Z' },
    { id: '23', GoalID: 9, UpdateText: 'Started', AuthorName: 'Ann Admin', Created: '2025-02-01T10:00:00Z' },
  ];
  const candidates = [{ email: 'ann@mg.test', name: 'Ann Admin' }, { email: 'lee@mg.test', name: 'Lee Lead' }];
  return { goals, actions, updates, candidates };
}

ASSERTIONS.push(
  {
    name: 'N-533 config: Carried forward status, pickable statuses, tracker settings',
    fn: function () {
      const B = CONFIG.BIZGOALS;
      _assertEqual(B.GOAL_STATUS, ['Open', 'Achieved', 'Dropped', 'Carried forward'], 'GOAL_STATUS gains Carried forward (BG-D14)');
      _assertEqual(B.CARRIED, 'Carried forward', 'CARRIED');
      _assertEqual(B.PICKABLE_STATUS, ['Open', 'Achieved', 'Dropped'], 'PICKABLE_STATUS has no Carried forward');
      _assertEqual(B.TRACKER, { HALF_START_MONTH: 7, DUE_SOON_DAYS: 14 }, 'TRACKER');
      _assertEqual(bizgoalsCleanGoal({ Status: 'Carried forward' }, 'update'), { Status: 'Carried forward' }, 'the N-532 cleaner accepts the new status');
    },
  },
  {
    name: 'N-533 AC2-AC3 periods, parent options and parent check (level, year, open, cycle)',
    fn: function () {
      const { goals } = _bgtrFx();
      _assertEqual([bizgoalsGoalPeriod('Annual', 2027), bizgoalsGoalPeriod('H2', 2027), bizgoalsGoalPeriod('Quarterly', 2027, 3)], ['2027', '2027-H2', '2027-Q3'], 'periods');
      _bgtThrows(() => bizgoalsGoalPeriod('Quarterly', 2027), /quarter/, 'Quarterly needs a quarter');
      _bgtThrows(() => bizgoalsGoalPeriod('Monthly', 2027), /level/, 'bad level');
      _assertEqual(bizgoalsParentOptions('H2', '2026-H2', goals).map(g => g.id), ['1'], 'H2 -> open Annual of the year (Dropped 4 out)');
      _assertEqual(bizgoalsParentOptions('Quarterly', '2026-Q3', goals).map(g => g.id), ['2'], 'Q3 -> H2 when one exists');
      _assertEqual(bizgoalsParentOptions('Quarterly', '2026-Q2', goals).map(g => g.id), ['1'], 'Q2 -> Annual');
      _assertEqual(bizgoalsParentOptions('H2', '2025-H2', goals).map(g => g.id), [], 'carried 2025 goal is not offered');
      _assertEqual(bizgoalsParentCheck({ level: 'Quarterly', period: '2026-Q4', parentId: '2', goals, year: 2026 }), 2, 'valid parent');
      _assertEqual(bizgoalsParentCheck({ level: 'H2', period: '2026-H2', parentId: '', goals, year: 2026 }), 0, 'no parent');
      _bgtThrows(() => bizgoalsParentCheck({ level: 'H2', period: '2026-H2', parentId: 77, goals, year: 2026 }), /not found/, 'missing parent');
      _bgtThrows(() => bizgoalsParentCheck({ level: 'H2', period: '2026-H2', parentId: 9, goals, year: 2026 }), /another year/, 'other year');
      _bgtThrows(() => bizgoalsParentCheck({ level: 'H2', period: '2026-H2', parentId: 4, goals, year: 2026 }), /open parent/, 'dropped parent');
      _bgtThrows(() => bizgoalsParentCheck({ level: 'Quarterly', period: '2026-Q2', parentId: 2, goals, year: 2026 }), /open parent/, 'wrong level');
      const loop = goals.map(g => g.id === '2' ? Object.assign({}, g, { ParentGoalID: 3 }) : g);
      _bgtThrows(() => bizgoalsParentCheck({ level: 'Quarterly', period: '2026-Q4', parentId: '2', goals: loop, year: 2026, selfId: '3' }), /own sub-goals/, 'cycle');
    },
  },
  {
    name: 'N-533 AC5-AC7 goal / action payloads and the live patch (Carried forward never picked, level fixed, BG-D12)',
    fn: function () {
      const { goals } = _bgtrFx();
      _assertEqual(bizgoalsTrackerGoalPayload({ Title: ' Win Pirum ', GoalLevel: 'H2', GoalYear: 2026, ParentGoalID: '1', OwnerEmail: 'Lee@MG.test', TargetDate: '2026-11-30', Rag: 'Green', WhyItMatters: ' ' }, 'create', goals),
        { Title: 'Win Pirum', GoalLevel: 'H2', Period: '2026-H2', GoalYear: 2026, Status: 'Open', OwnerEmail: 'lee@mg.test', TargetDate: '2026-11-30', Rag: 'Green', ParentGoalID: 1 }, 'create payload');
      _bgtThrows(() => bizgoalsTrackerGoalPayload({ Title: 'x', GoalLevel: 'Annual', GoalYear: 2026 }, 'create', goals), /owner/, 'owner required');
      _bgtThrows(() => bizgoalsTrackerGoalPayload({ GoalLevel: 'Annual', GoalYear: 2026, OwnerEmail: 'a@b.c' }, 'create', goals), /title/, 'title required');
      _bgtThrows(() => bizgoalsTrackerGoalPayload({ Title: 'x', GoalLevel: 'Annual', GoalYear: 2026, OwnerEmail: 'a@b.c', TargetDate: 'soon' }, 'create', goals), /target date/, 'bad date');
      const g2 = goals[1];
      _assertEqual(bizgoalsTrackerGoalPayload({ Title: 'H2 pipeline', OwnerEmail: 'ED@mg.test', Rag: 'Red', Status: 'Achieved' }, 'update', goals, g2), { Status: 'Achieved' }, 'update passes only changes; an unchanged stale owner is not sent');
      _assertEqual(bizgoalsTrackerGoalPayload({ ParentGoalID: '' }, 'update', goals, g2), { ParentGoalID: '' }, 'unlinking a parent');
      _bgtThrows(() => bizgoalsTrackerGoalPayload({ GoalLevel: 'Annual' }, 'update', goals, g2), /level and period/, 'level cannot change');
      _bgtThrows(() => bizgoalsTrackerGoalPayload({ Quarter: 2 }, 'update', goals, goals[2]), /level and period/, 'quarter cannot change');
      _bgtThrows(() => bizgoalsTrackerGoalPayload({ Title: 'x' }, 'update', goals, goals[5]), /carried forward/, 'a carried goal cannot be edited');
      _bgtThrows(() => bizgoalsTrackerGoalPayload({ Title: 'H2 pipeline' }, 'update', goals, g2), /Nothing to change/, 'no change');
      _bgtThrows(() => bizgoalsTrackerGoalPayload({ OwnerEmail: '' }, 'update', goals, g2), /owner/, 'owner cannot clear');
      _assertEqual(bizgoalsLiveGoalPatch({ Rag: '' }), { Rag: '' }, 'blank RAG clears');
      _bgtThrows(() => bizgoalsLiveGoalPatch({ Status: 'Carried forward' }), /Pick Open/, 'AC6 Carried forward is never picked');
      _bgtThrows(() => bizgoalsLiveGoalPatch({ Rag: 'Blue' }), /Red, Amber/, 'bad RAG');
      _assertEqual(bizgoalsTrackerActionPayload({ Title: ' Call ', GoalID: '2', OwnerEmail: 'Lee@mg.test', DueDate: '2026-07-01' }, 'create', goals),
        { Title: 'Call', GoalID: 2, OwnerEmail: 'lee@mg.test', DueDate: '2026-07-01', IsDone: false }, 'action create');
      _bgtThrows(() => bizgoalsTrackerActionPayload({ Title: 'x', GoalID: '4', OwnerEmail: 'a@b.c', DueDate: '2026-07-01' }, 'create', goals), /open goal/, 'AC7 a dropped goal cannot take an action');
      _bgtThrows(() => bizgoalsTrackerActionPayload({ Title: 'x', OwnerEmail: 'a@b.c', DueDate: '2026-07-01' }, 'create', goals), /open goal/, 'AC7 a goal is required (BG-D12)');
      _bgtThrows(() => bizgoalsTrackerActionPayload({ Title: 'x', GoalID: '1', OwnerEmail: 'a@b.c' }, 'create', goals), /due date/, 'due date required');
      const a = { id: '30', Title: 'Old', GoalID: 4, OwnerEmail: 'ann@mg.test', DueDate: '2026-05-01T12:00:00Z' };
      _assertEqual(bizgoalsTrackerActionPayload({ Title: 'Old', GoalID: '4', OwnerEmail: 'ann@mg.test', DueDate: '2026-06-01' }, 'update', goals, a), { DueDate: '2026-06-01' }, 'unchanged goal on a closed goal is fine');
      _bgtThrows(() => bizgoalsTrackerActionPayload({ GoalID: '4' }, 'update', goals, Object.assign({}, a, { GoalID: 1 })), /open goal/, 'moving to a closed goal is refused');
    },
  },
  {
    name: 'N-533 AC2 AC4 AC7 AC8 tracker model: tree, orphans, roll-up, owners, latest update, history count, carry state, actions',
    fn: function () {
      const fx = _bgtrFx();
      const m = bizgoalsTrackerModel(Object.assign({}, fx, { today: '2026-06-01', year: 2026 }));
      _assertEqual(m.tree.map(n => n.goal.id), ['1', '4'], 'roots = Annual goals by target date');
      _assertEqual(m.tree[0].children[0].goal.id, '2', 'H2 under Annual');
      _assertEqual(m.tree[0].children[0].children[0].goal.id, '3', 'Q4 under H2');
      _assertEqual(m.orphans.map(n => n.goal.id), ['5'], 'unlinked quarterly is an orphan');
      _assertEqual(m.tree[0].rag, { own: 'Amber', rolled: 'Red' }, 'AC4 worst-first roll-up over open descendants');
      _assertEqual(bizgoalsRagRollup({ Rag: 'Green' }, [{ Rag: 'Red', Status: 'Achieved' }, { Rag: 'Red', Status: 'Carried forward' }]), { own: 'Green', rolled: 'Green' }, 'AC4 closed descendants ignored');
      _assertEqual([m.counts.open, m.counts.dropped, m.counts.red, m.counts.amber, m.counts.green], [4, 1, 1, 0, 0], 'AC4 counts: top-level open goals by rolled RAG (orphan 5 has none)');
      _assertEqual(m.tree[0].children[0].owner, { email: 'ed@mg.test', name: 'Ed Former', state: 'stale' }, 'AC5 stale owner keeps the snapshot name');
      _assertEqual(m.tree[0].owner.name, 'Ann Admin', 'owner name from the candidate');
      _assertEqual(m.tree[0].latest.id, '22', 'AC8 latest = newest own entry');
      _assertEqual(m.tree[0].historyCount, 3, 'AC8 history counts the 2025 goal it was carried from');
      _assertEqual([m.tree[0].canCarry, m.tree[1].canCarry, m.orphans[0].canCarry, m.counts.canCarry], [true, false, false, 1], 'only open Annual goals can carry');
      _assertEqual(m.actionsOpen.map(x => x.action.id), ['11', '12'], 'AC7 open actions of the year by due date (2025 action out)');
      _assertEqual([m.actionsOpen[0].overdue, m.actionsOpen[1].dueSoon, m.actionsOpen[1].owner.state], [true, true, 'stale'], 'AC7 overdue / due soon / stale owner');
      _assertEqual(m.actionsDone.map(x => x.action.id), ['13'], 'done actions of the year');
      const m25 = bizgoalsTrackerModel(Object.assign({}, fx, { today: '2026-06-01', year: 2025 }));
      _assertEqual([m25.tree[0].carriedTo, m25.tree[0].copyId, m25.tree[0].canCarry, m25.counts.carried], [2026, '1', false, 1], 'AC14 a carried goal knows its copy');
    },
  },
  {
    name: 'N-533 AC8 history chain and year options',
    fn: function () {
      const fx = _bgtrFx();
      const h = bizgoalsGoalHistory('1', fx.goals, fx.updates);
      _assertEqual(h.map(r => [r.entry.id, r.year, r.own]), [['22', 2026, true], ['21', 2026, true], ['23', 2025, false]], 'newest first across the CarriedFromID chain');
      _assertEqual(bizgoalsGoalHistory('9', fx.goals, fx.updates).map(r => r.entry.id), ['23'], 'the old goal shows only its own');
      const loop = [{ id: 'a', CarriedFromID: 'b', GoalYear: 2027 }, { id: 'b', CarriedFromID: 'a', GoalYear: 2026 }];
      _assertEqual(bizgoalsGoalHistory('a', loop, [{ id: 1, GoalID: 'b' }]).length, 1, 'cycle-safe');
      _assertEqual(bizgoalsYearOptions(fx.goals, '2026-11-24'), [2027, 2026, 2025], 'goal years + current + next, newest first');
      _assertEqual(bizgoalsInstantDay('nonsense'), null, 'bad instant');
    },
  },
  {
    name: 'N-533 AC11-AC13 rollover plan: copy fields, owner swap, sub-goals close, open actions move, idempotent',
    fn: function () {
      const fx = _bgtrFx();
      const p = bizgoalsRolloverPlan(Object.assign({}, fx, { fromYear: 2026, goalIds: ['1', '4', '5', '1', '77'], actorEmail: 'Lee@mg.test' }));
      _assertEqual(p.toYear, 2027, 'toYear');
      _assertEqual(p.skipped.map(x => x.goalId), ['4', '5', '77'], 'AC13 dropped, non-annual and missing goals skipped; duplicate id ignored');
      _assertEqual(p.items.length, 1, 'one item');
      const it = p.items[0];
      _assertEqual(it.copy, { Title: 'Grow Iberia', GoalLevel: 'Annual', Period: '2027', GoalYear: 2027, Status: 'Open', OwnerEmail: 'ann@mg.test', CarriedFromID: 1, WhyItMatters: 'Revenue', Rag: 'Amber', TargetDate: '2027-12-31' }, 'AC12 copy keeps text / RAG / owner, target +1 year');
      _assertEqual([it.closeIds, it.moveActionIds, it.ownerSwap, it.addEntry, it.copyId], [['2', '3'], ['11', '12'], false, true, null], 'AC12 open sub-goals close, open actions on the tree move (done 13 stays)');
      const stale = fx.goals.map(g => g.id === '1' ? Object.assign({}, g, { OwnerEmail: 'ed@mg.test', TargetDate: '2028-02-29T12:00:00Z' }) : g);
      const s = bizgoalsRolloverPlan(Object.assign({}, fx, { goals: stale, fromYear: 2026, goalIds: ['1'], actorEmail: 'Lee@mg.test' })).items[0];
      _assertEqual([s.ownerSwap, s.copy.OwnerEmail, s.copy.TargetDate], [true, 'lee@mg.test', '2029-02-28'], 'AC12 stale owner -> the actor; 29 Feb -> 28 Feb');
      // Half done: the copy exists, action 11 moved, entry posted, goal 1 still Open.
      const half = fx.goals.concat([{ id: '40', GoalYear: 2027, GoalLevel: 'Annual', Period: '2027', Status: 'Open', CarriedFromID: 1, OwnerEmail: 'ann@mg.test' }]);
      const acts = fx.actions.map(a => a.id === '11' ? Object.assign({}, a, { GoalID: 40 }) : a);
      const ups = fx.updates.concat([{ id: '50', GoalID: 1, UpdateText: 'Carried forward to 2027.' }]);
      const r = bizgoalsRolloverPlan({ goals: half, actions: acts, updates: ups, candidates: fx.candidates, fromYear: 2026, goalIds: ['1'], actorEmail: 'lee@mg.test' }).items[0];
      _assertEqual([r.copyId, r.copy, r.moveActionIds, r.addEntry, r.ownerSwap], ['40', null, ['12'], false, false], 'AC13 re-run reuses the copy and skips what is done');
      _assertEqual(bizgoalsTrackerModel({ goals: half, actions: acts, updates: ups, candidates: fx.candidates, today: '2026-06-01', year: 2026 }).tree[0].canCarry, true, 'AC13 a half-carried goal can be carried again to finish');
      const noRag = fx.goals.map(g => g.id === '1' ? Object.assign({}, g, { Rag: '', TargetDate: '' }) : g);
      const n = bizgoalsRolloverPlan(Object.assign({}, fx, { goals: noRag, fromYear: 2026, goalIds: ['1'] })).items[0].copy;
      _assertEqual(['Rag' in n, 'TargetDate' in n], [false, false], 'blank RAG / target stay blank');
      _bgtThrows(() => bizgoalsRolloverPlan({ fromYear: CONFIG.BIZGOALS.LIMITS.YEAR_MAX, goalIds: [] }), /cannot roll past/, 'year limit');
    },
  },
  {
    name: 'N-533 AC5 AC6 AC10 AC14 AC15 page markup: owners, statuses, Delete only for Admin, carried goals, denied / empty states',
    fn: function () {
      const fx = _bgtrFx();
      const st = extra => Object.assign({ year: 2026, data: Object.assign({ denied: false }, fx), form: null, history: {}, rollover: null, canDelete: false, me: 'lee@mg.test' }, extra);
      const leader = bgtrPageHtml(st());
      _assertEqual(leader.includes('Goals &amp; Actions'), true, 'header');
      _assertEqual(/bgtrDeleteGoal|bgtrDeleteAction/.test(leader), false, 'AC10 Leadership sees no Delete');
      _assertEqual(/bgtrDeleteGoal/.test(bgtrPageHtml(st({ canDelete: true }))), true, 'AC10 Admin sees Delete');
      _assertEqual(leader.includes('(no longer Admin / Leadership)'), true, 'AC5 stale owner tag');
      _assertEqual(leader.includes('>Carried forward</option>'), false, 'AC6 no Carried forward option on open goals');
      _assertEqual(leader.includes('Roll over year'), true, 'AC11 Roll over year shown when a goal can carry');
      _assertEqual(leader.includes('Latest update'), true, 'AC8 latest update line');
      _assertEqual(leader.includes('Changed by Ann Admin'), true, 'AC9 changed by');
      const y25 = bgtrPageHtml(st({ year: 2025 }));
      _assertEqual(y25.includes('Carried forward to 2026'), true, 'AC14 carried label');
      _assertEqual(/bgtrRag|bgtrStatus|bgtrGoalForm&quot;,&quot;9/.test(y25), false, 'AC14 no RAG / Status / Edit on a carried goal with a live copy');
      _assertEqual(y25.includes('Roll over year'), false, 'nothing to carry in 2025');
      const gone = bgtrPageHtml(st({ year: 2025, data: Object.assign({ denied: false }, fx, { goals: fx.goals.filter(g => g.id !== '1') }) }));
      _assertEqual(/bgtrStatus/.test(gone), true, 'AC14 selects return when the copy is gone');
      _assertEqual(bgtrPageHtml(st({ data: { denied: true, goals: [], actions: [], updates: [], candidates: [] } })).includes('No access to Goals'), true, 'AC15 denied state');
      _assertEqual(bgtrPageHtml(st({ year: 2030 })).includes('No goals for 2030'), true, 'AC15 empty year');
      const form = bgtrPageHtml(st({ form: { kind: 'goal', id: '2', values: { Title: 'H2 pipeline', OwnerEmail: 'ed@mg.test' }, level: 'H2', period: '2026-H2', ownerName: 'Ed Former' } }));
      _assertEqual(/<option value="ed@mg.test" selected>Ed Former \(no longer Admin \/ Leadership\)<\/option>/.test(form), true, 'AC5 a stale owner stays selected in the form');
      const plan = bizgoalsRolloverPlan(Object.assign({}, fx, { fromYear: 2026, goalIds: ['1'], actorEmail: 'lee@mg.test' }));
      const roll = bgtrPageHtml(st({ rollover: { plan, ticked: new Set(['1']), busy: false } }));
      _assertEqual(roll.includes('2 sub-goals close · 2 open actions move') && roll.includes('Carry forward 1 goal'), true, 'AC11 preview counts');
    },
  },
  {
    name: 'N-533 AC1 AC17 sources: page registered, writers gated, rollover order, load scope, no Graph outside the API, PDP-D12 guard',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js.');
      ['saveTrackerBusinessGoal', 'saveTrackerBusinessAction', 'setBusinessGoalLive', 'setBusinessActionDone', 'rolloverBusinessGoals', 'bizgoalsRolloverPreview'].forEach(n =>
        _assertEqual(_bgtBody('api-bizgoals.js', 'async function ' + n + '(').includes("_bgActor('bizgoalsEdit')"), true, n + ' is gated on bizgoalsEdit'));
      const roll = _bgtBody('api-bizgoals.js', 'async function rolloverBusinessGoals(');
      const at = ['createBusinessGoal(', 'updateBusinessAction(', 'updateBusinessGoal(gid', 'addBusinessGoalUpdate(', 'updateBusinessGoal(it.goalId'].map(x => roll.indexOf(x));
      _assertEqual(at.every((v, i) => v > -1 && (i === 0 || v > at[i - 1])), true, 'AC13 rollover order: copy, move, close sub-goals, entry, close goal last');
      const srcs = html => (html.match(/<script src="([^"]+)"/g) || []).map(s => s.replace(/<script src="|"/g, ''));
      const cc = srcs(ALL_HTML['command-centre.html']);
      _assertEqual(cc.indexOf('js/bizgoals-track.js') === cc.indexOf('js/bizgoals-data.js') + 1, true, 'bizgoals-track.js straight after bizgoals-data.js');
      _assertEqual(cc.indexOf('js/bizgoals-track-ui.js') === cc.indexOf('js/cc-pages.js') + 1 && cc.indexOf('js/bizgoals-track-ui.js') < cc.indexOf('js/cc-claude.js'), true, 'bizgoals-track-ui.js after cc-pages.js, before cc-claude.js');
      Object.keys(ALL_HTML).filter(p => p !== 'command-centre.html').forEach(p =>
        ['js/bizgoals-track.js', 'js/bizgoals-track-ui.js'].forEach(f => _assertEqual(srcs(ALL_HTML[p]).includes(f), false, p + ' must not load ' + f)));
      ['bizgoals-track.js', 'bizgoals-track-ui.js'].forEach(n => {
        _assertEqual(/\b(getItems|getItem|createItem|updateItem|deleteItem)\(/.test(_bgtSrc(n)), false, n + ' makes no Graph call');
        _assertEqual(/CONFIG\.PDP\b|\bpdp[A-Z]\w*\(/.test(_bgtSrc(n).replace(/\/\/.*$/gm, '')), false, n + ' calls no PDP code (BG-D9)');
      });
      ['bizgoals-config.js', 'bizgoals-data.js', 'bizgoals-track.js', 'bizgoals-track-ui.js', 'api-bizgoals.js'].forEach(n =>
        _assertEqual(_PDP_GUARD_RE.test(_bgtSrc(n)), false, n + ' stays outside the PDP-D12 guard'));
      _assertEqual(CONFIG.COMMAND_BAR_PAGES.filter(p => p.module === 'command').map(p => p.key), ['overview', 'goals', 'claudeMcp'], 'AC1 Command Bar order');
    },
  },
);
