// tests/assert-bizgoals.js — N-532 / BG-1 Goals & Actions: config, pure rules (bizgoals-data.js), and source guards for the
// Graph / role-gated parts (api-bizgoals.js) and the load scope (command-centre.html only).
// Loads AFTER tests/assertions.js (ASSERTIONS + shared helpers).

function _bgtSrc(file) {
  if (typeof ALL_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js.');
  return String(ALL_SOURCES[file] || '').replace(/\r\n/g, '\n');
}
function _bgtThrows(fn, re, label) {
  let msg = null;
  try { fn(); } catch (e) { msg = String(e && e.message); }
  if (msg === null) throw new Error(label + ': expected an error, none thrown');
  if (re && !re.test(msg)) throw new Error(label + ': error "' + msg + '" does not match ' + re);
}
// Body of the function starting at `sig` in js/<file>, up to its closing "\n}\n".
function _bgtBody(file, sig) {
  const src = _bgtSrc(file), i = src.indexOf(sig);
  if (i < 0) return '';
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j < 0 ? undefined : j);
}

const _BGT_LISTS = ['BusinessGoals', 'BusinessActions', 'BusinessGoalUpdates'];
const _BGT_GOAL = { Title: ' Grow Iberia ', GoalLevel: 'H2', Period: '2027-H2', OwnerEmail: ' Ann.Admin@MG.test ', Rag: 'Amber', TargetDate: '2027-12-31', ParentGoalID: '4' };

ASSERTIONS.push(
  {
    name: 'N-532 AC4 config: CONFIG.BIZGOALS, three lists, columns, aliases {}, capabilities, restricted',
    fn: function () {
      const B = CONFIG.BIZGOALS;
      _assertEqual([B.LISTS.GOALS, B.LISTS.ACTIONS, B.LISTS.UPDATES], _BGT_LISTS, 'AC4 list names');
      _assertEqual(B.GOAL_LEVELS, ['Annual', 'H2', 'Quarterly'], 'AC4 levels (BG-D3)');
      _assertEqual(B.RAG, ['Red', 'Amber', 'Green'], 'AC4 RAG worst first');
      _assertEqual(CONFIG.LIST_FIELDS.BusinessGoals, ['Title', 'GoalYear', 'GoalLevel', 'Period', 'ParentGoalID', 'WhyItMatters', 'SuccessMeasures', 'TargetDate', 'Rag', 'Status', 'OwnerEmail', 'OwnerName', 'CarriedFromID', 'AddedByEmail', 'ChangedByEmail'], 'AC4 BusinessGoals columns');
      _assertEqual(CONFIG.LIST_FIELDS.BusinessActions, ['Title', 'GoalID', 'OwnerEmail', 'OwnerName', 'DueDate', 'IsDone', 'DoneAt', 'AddedByEmail', 'ChangedByEmail'], 'AC4 BusinessActions columns');
      _assertEqual(CONFIG.LIST_FIELDS.BusinessGoalUpdates, ['Title', 'GoalID', 'UpdateText', 'RagAtUpdate', 'StatusAtUpdate', 'AuthorEmail', 'AuthorName'], 'AC4 BusinessGoalUpdates columns');
      _BGT_LISTS.forEach(l => {
        _assertEqual(FIELD_ALIASES[l], {}, 'AC4 FIELD_ALIASES ' + l + ' is {} (a self-mapping alias would delete the field)');
        _assertEqual(CONFIG.RESTRICTED_LISTS.includes(l), true, 'AC4 ' + l + ' is restricted (403 = no rows)');
        _assertEqual(isRestrictedList(l), true, 'AC4 isRestrictedList ' + l);
        _assertEqual(CONFIG.CACHE.persistentLists.includes(l), false, 'AC4 ' + l + ' not in persistentLists');
        _assertEqual(JSON.stringify(CONFIG.DELTA).includes(l), false, 'AC4 ' + l + ' not in DELTA');
        _assertEqual(CONFIG.MCP.allowedLists.includes(l), false, 'AC4 ' + l + ' not in MCP.allowedLists (N-535 decides)');
      });
      _assertEqual(CONFIG.ROLE_CAPABILITIES.bizgoalsEdit, ['admin', 'leadership'], 'AC4 bizgoalsEdit');
      _assertEqual(CONFIG.ROLE_CAPABILITIES.bizgoalsDelete, ['admin'], 'AC4 bizgoalsDelete Admin only (BG-D11)');
      _assertEqual([roleCan('leadership', 'bizgoalsDelete'), roleCan('delivery_manager', 'bizgoalsEdit'), roleCan('people_ops', 'bizgoalsEdit')], [false, false, false], 'AC4 Leadership cannot delete; DM and People Ops cannot edit');
      _assertEqual(/Business/.test(_bgtSrc('command-bar.js')), false, 'AC4 the Command Bar does not read business goals');
    },
  },
  {
    name: 'N-532 AC5 bizgoalsCleanGoal — create: trims, derives GoalYear, lower-cases owner, dates; every bad input rejected',
    fn: function () {
      const g = bizgoalsCleanGoal(_BGT_GOAL, 'create');
      _assertEqual([g.Title, g.GoalLevel, g.Period, g.GoalYear, g.OwnerEmail, g.Rag, g.ParentGoalID, g.TargetDate], ['Grow Iberia', 'H2', '2027-H2', 2027, 'ann.admin@mg.test', 'Amber', 4, '2027-12-31T12:00:00Z'], 'AC5 cleaned create');
      _assertEqual(bizgoalsCleanGoal({ ..._BGT_GOAL, GoalYear: '2027' }, 'create').GoalYear, 2027, 'AC5 matching GoalYear accepted');
      const bad = (patch, re, label) => _bgtThrows(() => bizgoalsCleanGoal({ ..._BGT_GOAL, ...patch }, 'create'), re, 'AC5 ' + label);
      bad({ Title: '  ' }, /Title is required/, 'blank title');
      bad({ Title: 'x'.repeat(CONFIG.BIZGOALS.LIMITS.TITLE_MAX + 1) }, /characters or fewer/, 'long title');
      bad({ GoalLevel: 'Monthly' }, /one of/, 'bad level');
      bad({ Period: '2027-Q2' }, /does not match level/, 'period for another level');
      bad({ GoalYear: 2028 }, /does not match Period/, 'year vs period');
      bad({ Period: '1999-H2' }, /GoalYear must be/, 'year out of range');
      bad({ ParentGoalID: '1.5' }, /whole number/, 'non-integer parent');
      bad({ Rag: 'Purple' }, /one of/, 'bad RAG');
      bad({ Status: 'Done' }, /one of/, 'bad status');
      bad({ TargetDate: 'soon' }, /YYYY-MM-DD/, 'bad date');
      bad({ OwnerEmail: 'nobody' }, /email/, 'bad owner');
      bad({ OwnerEmail: '' }, /OwnerEmail is required/, 'missing owner');
      bad({ WhyItMatters: 'y'.repeat(CONFIG.BIZGOALS.LIMITS.TEXT_MAX + 1) }, /characters or fewer/, 'long text');
      _bgtThrows(() => bizgoalsCleanGoal(_BGT_GOAL, 'merge'), /create or update/, 'AC5 bad mode');
    },
  },
  {
    name: 'N-532 AC5 bizgoalsCleanGoal — update: only supplied, blanks clear, place travels together, stamps and unknown keys dropped',
    fn: function () {
      _assertEqual(bizgoalsCleanGoal({ Rag: 'Red' }, 'update'), { Rag: 'Red' }, 'AC5 only what is supplied');
      _assertEqual(bizgoalsCleanGoal({ Rag: '', ParentGoalID: '', TargetDate: '', WhyItMatters: '' }, 'update'), { Rag: '', ParentGoalID: null, TargetDate: null, WhyItMatters: '' }, 'AC5 blanks clear');
      _bgtThrows(() => bizgoalsCleanGoal({ Title: '' }, 'update'), /cannot be blank/, 'AC5 title cannot be cleared');
      _bgtThrows(() => bizgoalsCleanGoal({ OwnerEmail: '' }, 'update'), /cannot be blank/, 'AC5 owner cannot be cleared');
      _bgtThrows(() => bizgoalsCleanGoal({ Period: '2027' }, 'update'), /required with the level/, 'AC5 period alone is refused');
      _assertEqual(bizgoalsCleanGoal({ GoalLevel: 'Annual', Period: '2028' }, 'update'), { GoalLevel: 'Annual', Period: '2028', GoalYear: 2028 }, 'AC5 level + period together');
      const dirty = bizgoalsCleanGoal({ ..._BGT_GOAL, AddedByEmail: 'x@x.co', ChangedByEmail: 'x@x.co', OwnerName: 'Mallory', Colour: 'red', id: 9 }, 'create');
      ['AddedByEmail', 'ChangedByEmail', 'OwnerName', 'Colour', 'id'].forEach(k => _assertEqual(k in dirty, false, 'AC5 ' + k + ' dropped'));
    },
  },
  {
    name: 'N-532 AC6 bizgoalsCleanAction / bizgoalsCleanUpdate — GoalID required (BG-D12), IsDone/DoneAt consistent, update entry shape',
    fn: function () {
      const NOW = '2026-11-24T14:00:00.000Z';
      const a = bizgoalsCleanAction({ Title: ' Hire CFO ', GoalID: '7', OwnerEmail: 'Ann@MG.test', DueDate: '2027-03-31', DoneAt: 'x' }, 'create', NOW);
      _assertEqual(a, { Title: 'Hire CFO', GoalID: 7, OwnerEmail: 'ann@mg.test', DueDate: '2027-03-31T12:00:00Z' }, 'AC6 create (a supplied DoneAt is ignored)');
      _bgtThrows(() => bizgoalsCleanAction({ Title: 'x', OwnerEmail: 'a@b.co' }, 'create', NOW), /GoalID is required/, 'AC6 goal required');
      _bgtThrows(() => bizgoalsCleanAction({ GoalID: '' }, 'update', NOW), /GoalID cannot be blank/, 'AC6 goal cannot be cleared');
      _assertEqual(bizgoalsCleanAction({ IsDone: true }, 'update', NOW), { IsDone: true, DoneAt: NOW }, 'AC6 done stamps DoneAt');
      _assertEqual(bizgoalsCleanAction({ IsDone: false }, 'update', NOW), { IsDone: false, DoneAt: null }, 'AC6 undone clears DoneAt');
      _assertEqual(bizgoalsCleanAction({ DueDate: '' }, 'update', NOW), { DueDate: null }, 'AC6 due date clears');
      const u = bizgoalsCleanUpdate({ GoalID: '7', UpdateText: ' On track ', RagAtUpdate: 'Green', AuthorEmail: 'spoof@x.co', Id: 3 });
      _assertEqual(u, { Title: '7', GoalID: 7, UpdateText: 'On track', RagAtUpdate: 'Green' }, 'AC6 update entry (author is stamped by the API, never supplied)');
      _bgtThrows(() => bizgoalsCleanUpdate({ GoalID: 7, UpdateText: '  ' }), /UpdateText is required/, 'AC6 empty text');
      _bgtThrows(() => bizgoalsCleanUpdate({ UpdateText: 'x' }), /GoalID is required/, 'AC6 no goal');
      _bgtThrows(() => bizgoalsCleanUpdate({ GoalID: 7, UpdateText: 'x', RagAtUpdate: 'Blue' }), /one of/, 'AC6 bad RAG');
    },
  },
  {
    name: 'N-532 AC7 owner candidates — active admin rows + LeadershipAccess, de-duplicated, shared accounts out; state ok / stale / none',
    fn: function () {
      const userRows = [
        { UserEmail: 'ann@mg.test', UserName: 'Ann Admin', AssignedRole: 'admin', Active: true },
        { UserEmail: 'ed@mg.test', UserName: 'Ed Gone', AssignedRole: 'admin', Active: false },
        { UserEmail: 'tom@mg.test', UserName: 'Tom TP', AssignedRole: 'talent_partner', Active: true },
        { UserEmail: 'Lee@MG.test', UserName: '', AssignedRole: 'admin' },
        { UserEmail: 'admin@momentumglobal.co', UserName: 'Shared', AssignedRole: 'admin', Active: true },
      ];
      const leadershipRows = [
        { UserEmail: 'lee@mg.test', UserName: 'Lee Lead' },
        { UserEmail: 'ann@mg.test', UserName: 'Ann Duplicate' },
        { UserEmail: 'admin@talentpoint.onmicrosoft.com', UserName: 'Tenant' },
        { UserEmail: 'not-an-email', UserName: 'Broken' },
      ];
      const c = bizgoalsOwnerCandidates({ userRows, leadershipRows });
      _assertEqual(c, [{ email: 'ann@mg.test', name: 'Ann Admin' }, { email: 'lee@mg.test', name: 'Lee Lead' }], 'AC7 candidates by name');
      _assertEqual(bizgoalsOwnerCandidates({}), [], 'AC7 no rows');
      _assertEqual([bizgoalsOwnerState('ANN@mg.test', c), bizgoalsOwnerState('ed@mg.test', c), bizgoalsOwnerState('', c), bizgoalsOwnerState(null, c)], ['ok', 'stale', 'none', 'none'], 'AC7 state');
    },
  },
  {
    name: 'N-532 AC8 owner rule + stamp: unchanged stale owner passes, new owner must be a candidate, stamps come from the user',
    fn: function () {
      const c = [{ email: 'ann@mg.test', name: 'Ann Admin' }];
      _assertEqual(bizgoalsOwnerChange('ed@mg.test', 'ED@mg.test', c), { changed: false }, 'AC8 unchanged stale owner passes');
      _assertEqual(bizgoalsOwnerChange('ed@mg.test', 'Ann@mg.test', c), { changed: true, name: 'Ann Admin' }, 'AC8 changed to a candidate, name snapshot');
      _assertEqual(typeof bizgoalsOwnerChange('', 'tom@mg.test', c).error, 'string', 'AC8 a non-candidate is refused');
      _assertEqual(typeof bizgoalsOwnerChange('ann@mg.test', '', c).error, 'string', 'AC8 a blank owner is refused');
      _assertEqual(bizgoalsStamp(' Ann@MG.test ', true), { AddedByEmail: 'ann@mg.test', ChangedByEmail: 'ann@mg.test' }, 'AC8 create stamp');
      _assertEqual(bizgoalsStamp('ann@mg.test', false), { ChangedByEmail: 'ann@mg.test' }, 'AC8 update stamp');
      _bgtThrows(() => bizgoalsStamp('', true), /signed-in/, 'AC8 no user, no write');
      ['createBusinessGoal', 'updateBusinessGoal', 'createBusinessAction', 'updateBusinessAction', 'addBusinessGoalUpdate'].forEach(n =>
        _assertEqual(_bgtBody('api-bizgoals.js', 'async function ' + n + '(').includes("_bgActor('bizgoalsEdit')"), true, 'AC8 ' + n + ' is gated on bizgoalsEdit'));
      ['createBusinessGoal', 'updateBusinessGoal', 'createBusinessAction', 'updateBusinessAction'].forEach(n =>
        _assertEqual(_bgtBody('api-bizgoals.js', 'async function ' + n + '(').includes('bizgoalsStamp(actor.email'), true, 'AC8 ' + n + ' stamps from the signed-in user'));
      _assertEqual(/AuthorEmail: actor\.email/.test(_bgtBody('api-bizgoals.js', 'async function addBusinessGoalUpdate(')), true, 'AC8 an update entry is authored by the signed-in user');
      const actor = _bgtBody('api-bizgoals.js', 'async function _bgActor(');
      _assertEqual(/_ensureGhostGate\(\)/.test(actor) && /getEffectiveRole\(email\)/.test(actor) && /roleCan\(role, cap\)/.test(actor), true, 'AC8 role resolved under Ghost Mode, then roleCan');
    },
  },
  {
    name: 'N-532 AC9 no editor or deleter for a single update entry; delete is Admin only and refuses a goal with children or actions',
    fn: function () {
      const api = _bgtSrc('api-bizgoals.js');
      _assertEqual(/function (update|delete|edit|remove)BusinessGoalUpdate/i.test(api), false, 'AC9 no writer edits or deletes one entry');
      _assertEqual((api.match(/updateItem\(L\.UPDATES|updateItem\(CONFIG\.BIZGOALS\.LISTS\.UPDATES/g) || []).length, 0, 'AC9 updateItem never targets the updates list');
      _assertEqual((api.match(/deleteItem\(L\.UPDATES/g) || []).length, 1, 'AC9 entries are deleted in one place only (with their goal)');
      const del = _bgtBody('api-bizgoals.js', 'async function deleteBusinessGoal(');
      _assertEqual(del.includes("_bgActor('bizgoalsDelete')"), true, 'AC9 deleteBusinessGoal is Admin only');
      _assertEqual(del.indexOf('bizgoalsDeleteBlockers') > -1 && del.indexOf('bizgoalsDeleteBlockers') < del.indexOf('deleteItem('), true, 'AC9 blockers checked before anything is deleted');
      _assertEqual(del.indexOf('deleteItem(L.UPDATES') < del.indexOf('deleteItem(L.GOALS'), true, 'AC9 entries go before the goal');
      _assertEqual(_bgtBody('api-bizgoals.js', 'async function deleteBusinessAction(').includes("_bgActor('bizgoalsDelete')"), true, 'AC9 deleteBusinessAction is Admin only');
      const goals = [{ id: 1 }, { id: 2, ParentGoalID: 1 }, { id: 3, ParentGoalID: '1' }, { id: 4, ParentGoalID: 2 }];
      const actions = [{ id: 9, GoalID: 1 }, { id: 10, GoalID: 4 }];
      _assertEqual(bizgoalsDeleteBlockers(1, goals, actions), { children: 2, actions: 1 }, 'AC9 goal 1 is blocked');
      _assertEqual(bizgoalsDeleteBlockers(3, goals, actions), { children: 0, actions: 0 }, 'AC9 a leaf goal is free');
      _assertEqual(bizgoalsDeleteBlockers('4', goals, actions), { children: 0, actions: 1 }, 'AC9 goal 4 has an action');
      _assertEqual(bizgoalsDeleteBlockers(5, null, null), { children: 0, actions: 0 }, 'AC9 empty input');
    },
  },
  {
    name: 'N-532 AC10-AC11 load scope: command-centre.html loads the three files in order, nothing else does; no PDP file knows about BIZGOALS',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') _skip('Load scope scan needs filesystem access — runs under node tests/run.js.');
      const order = ['js/bizgoals-config.js', 'js/bizgoals-data.js', 'js/api-bizgoals.js'];
      const srcs = html => (html.match(/<script src="([^"]+)"/g) || []).map(s => s.replace(/<script src="|"/g, ''));
      const cc = srcs(ALL_HTML['command-centre.html']);
      const at = order.map(f => cc.indexOf(f));
      _assertEqual(at.every(i => i > -1) && at[0] < at[1] && at[1] < at[2], true, 'AC10 command-centre.html loads config, data, api in that order');
      _assertEqual(at[0] > cc.indexOf('js/api-headcount.js') && at[2] < cc.indexOf('js/analytics.js'), true, 'AC10 after api-headcount.js, before analytics.js');
      Object.keys(ALL_HTML).filter(p => p !== 'command-centre.html').forEach(p =>
        order.forEach(f => _assertEqual(srcs(ALL_HTML[p]).includes(f), false, 'AC10 ' + p + ' must not load ' + f)));
      Object.keys(ALL_SOURCES).filter(n => /^(api-)?pdp-/.test(n) || n === 'pdp-data.js').forEach(n =>
        _assertEqual(/BIZGOALS|bizgoals|BusinessGoals/.test(ALL_SOURCES[n]), false, 'AC11 ' + n + ' does not reference business goals (BG-D9)'));
      ['bizgoals-config.js', 'bizgoals-data.js'].forEach(n =>
        _assertEqual(/\b(getItems|getItem|createItem|updateItem|deleteItem)\(/.test(_bgtSrc(n)), false, 'AC10 ' + n + ' makes no Graph call'));
    },
  },
);
