// js/pdp-track.js — pure rules for the Goals & actions tracker (N-440 / PDP-8)
//
// No DOM, no network. Depends on config.js (CONFIG.PDP), utils.js (spDateIn, localDayISO, isoDate,
// addDaysISO), pdp-identity.js (pdpAccessFor, _pdpEmail, _pdpYes), pdp-data.js (pdpCleanGoals,
// pdpCleanActions) and pdp-team.js (pdpManagerLock, _pdptSnap, _pdptText, _pdptCap). Loaded on people.html
// after pdp-team.js; not in CONFIG.MCP.scripts. PDP-D12 review (N-440): these rules shape the personal
// goal and action records of the people a person, line manager or CSD looks after, so the file is on the
// PDP-D12 allowlist (tests/assert-pdp-access.js). Writes happen only in api-pdp.js.
//
// Periods (schema, N-434): Annual 'YYYY', H2 'YYYY-H2', Quarterly 'YYYY-Qn'. N-439 wrote the meeting's
// 'YYYY-MM'; pdpGoalPeriodFix() reads either shape.

function _pdptrMonth(period) {
  const m = /^\d{4}-(\d{2})$/.exec(_pdptText(period));
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 12 ? n : 0;
}

function _pdptrQuarter(period) {
  const m = /-Q([1-4])$/.exec(_pdptText(period));
  return m ? Number(m[1]) : 0;
}

function _pdptrRef(map, id) {
  if (!map) return null;
  return typeof map.get === 'function' ? (map.get(String(id)) || null) : (map[String(id)] || null);
}

// The canonical Period of a new goal. Quarterly: `quarter` (1-4) when given, else the quarter holding the
// month of `meetingPeriod` ('YYYY-MM'). Throws when a Quarterly goal has neither.
function pdpGoalPeriod(level, cycleYear, meetingPeriod, quarter) {
  const y = Number(cycleYear);
  if (!Number.isInteger(y) || y < 1) throw new Error('A goal needs a cycle year.');
  if (level === 'Annual') return String(y);
  if (level === 'H2') return y + '-H2';
  if (level === 'Quarterly') {
    const q = Number(quarter) >= 1 && Number(quarter) <= 4 && Number.isInteger(Number(quarter)) ? Number(quarter) : Math.ceil(_pdptrMonth(meetingPeriod) / 3);
    if (!q) throw new Error('Pick the quarter for a quarterly goal.');
    return y + '-Q' + q;
  }
  throw new Error('Pick a goal level.');
}

// The canonical Period of an existing goal row, or null when it cannot be worked out. A canonical value
// for the goal's own level and year is returned unchanged; N-439's 'YYYY-MM' is mapped.
function pdpGoalPeriodFix(goal) {
  const g = goal || {};
  const y = Number(g.CycleYear), level = g.GoalLevel, p = _pdptText(g.Period);
  if (!Number.isInteger(y) || y < 1 || !CONFIG.PDP.GOAL_LEVELS.includes(level)) return null;
  if (level === 'Annual' && p === String(y)) return p;
  if (level === 'H2' && p === y + '-H2') return p;
  if (level === 'Quarterly' && new RegExp('^' + y + '-Q[1-4]$').test(p)) return p;
  try {
    if (level === 'Quarterly') return _pdptrMonth(p) ? pdpGoalPeriod(level, y, p) : null;
    return pdpGoalPeriod(level, y, p);
  } catch (e) { return null; }
}

// What `myEmail` (with `role`) may do with one goal / action / meeting-shaped record: { view, edit, as }.
// `edit` = the email is the record's own PersonEmail (self), LineManagerEmail (lm) or CSDEmail (csd),
// REGARDLESS of role (a CSD holds the Newton role Admin), and the person's cycle for the year is not Closed.
// Admin / People Ops who are none of those, and former managers (ReadOnlyEmails), can view only.
function pdpTrackerAccess(role, myEmail, record, cycle) {
  const none = { view: false, edit: false, as: null };
  const base = pdpAccessFor(role, myEmail, record);
  if (!base.level) return none;
  const me = _pdpEmail(myEmail), r = record || {};
  let as = base.as;
  if (me && me === _pdpEmail(r.PersonEmail)) as = 'self';
  else if (me && me === _pdpEmail(r.LineManagerEmail)) as = 'lm';
  else if (me && me === _pdpEmail(r.CSDEmail)) as = 'csd';
  const mine = as === 'self' || as === 'lm' || as === 'csd';
  const closed = !!cycle && cycle.Status === 'Closed';
  return { view: true, edit: mine && !closed, as };
}

// The goals a goal of `level` / `period` may sit under (the person's goals for the year, passed in).
// H2 -> Annual; Quarterly -> H2 for the quarters inside the second half when an H2 goal exists, else Annual.
// Dropped goals are never offered.
function pdpGoalParentOptions(level, period, goals) {
  const live = (goals || []).filter(g => (g.Status || 'Open') !== 'Dropped');
  if (level === 'H2') return live.filter(g => g.GoalLevel === 'Annual');
  if (level === 'Quarterly') {
    const h2 = live.filter(g => g.GoalLevel === 'H2');
    const firstQ = Math.ceil(CONFIG.PDP.TRACKER.HALF_START_MONTH / 3);
    return _pdptrQuarter(period) >= firstQ && h2.length ? h2 : live.filter(g => g.GoalLevel === 'Annual');
  }
  return [];
}

// Validates a parent choice and returns its id (0 for none). input = { level, period, parentId, goals,
// personId, cycleYear, selfId }. Throws a plain-English message.
function pdpGoalParentCheck(input) {
  const i = input || {};
  const pid = Number(i.parentId);
  if (!i.parentId || !Number.isInteger(pid) || pid <= 0) return 0;
  const goals = i.goals || [];
  const parent = goals.find(g => String(g.id) === String(pid));
  if (!parent) throw new Error('That parent goal was not found.');
  if (String(parent.PersonID) !== String(i.personId) || Number(parent.CycleYear) !== Number(i.cycleYear)) throw new Error('That parent goal belongs to someone else or to another year.');
  if (!pdpGoalParentOptions(i.level, i.period, goals).some(g => String(g.id) === String(pid))) throw new Error('Pick a parent from the level above (not a dropped goal).');
  const seen = new Set();
  let cur = parent;
  while (cur && !seen.has(String(cur.id))) {
    if (i.selfId != null && String(cur.id) === String(i.selfId)) throw new Error('A goal cannot sit under one of its own sub-goals.');
    seen.add(String(cur.id));
    cur = goals.find(g => String(g.id) === String(cur.ParentGoalID));
  }
  return pid;
}

// 'agreed' when the record was recorded in a meeting that is now signed (its AGREED_FIELDS may no longer
// change); 'open' for tracker-created records, a missing meeting, and meetings still open or skipped. Used for
// goals and for actions. RAG, Status and an action's done tick are never locked (CONFIG.PDP.TRACKER.LIVE_FIELDS).
function pdpGoalFieldLock(record, meetingsById) {
  const mid = Number(record && record.MeetingID);
  if (!mid) return 'open';
  const m = _pdptrRef(meetingsById, mid);
  return m && pdpManagerLock(m) === 'signed' ? 'agreed' : 'open';
}

const _PDPTR_LOCKED_MSG = 'This was agreed in a signed meeting, so only RAG, status and done can change.';

function _pdptrNorm(v) { return _pdptText(v); }

// Fields for a goal written from the tracker. snap = a meeting record of the cycle year (snapshot columns).
// mode 'create' | 'update'; existing = the stored goal (update); goals = the person's goals for the year.
function pdpTrackerGoalPayload(snap, edit, mode, goals, existing, meetingsById) {
  const s = snap || {}, e = edit || {}, T = CONFIG.PDP.TRACKER;
  const cap = _pdptCap();
  const has = k => Object.prototype.hasOwnProperty.call(e, k);
  if (mode === 'create') {
    const title = _pdptText(e.Title);
    if (!title) throw new Error('Give the goal a title.');
    if (!CONFIG.PDP.GOAL_CATEGORIES.includes(e.Category)) throw new Error('Pick a goal category.');
    if (!CONFIG.PDP.GOAL_LEVELS.includes(e.GoalLevel)) throw new Error('Pick a goal level.');
    const target = _pdptText(e.TargetDate);
    if (target && !isoDate(target)) throw new Error('The target date is not a valid date.');
    const year = Number(s.CycleYear);
    const period = pdpGoalPeriod(e.GoalLevel, year, null, e.Quarter);
    const sameLevel = (goals || []).filter(g => g.GoalLevel === e.GoalLevel && (g.Status || 'Open') === 'Open').length;
    if (sameLevel >= T.GOALS_PER_LEVEL_MAX) throw new Error('You already have the most open ' + e.GoalLevel + ' goals allowed (' + T.GOALS_PER_LEVEL_MAX + '). Mark one Achieved or Dropped first.');
    const f = Object.assign({
      Title: title.slice(0, 250), Category: e.Category,
      WhyItMatters: _pdptText(e.WhyItMatters).slice(0, cap), SuccessMeasures: _pdptText(e.SuccessMeasures).slice(0, cap),
      Support: _pdptText(e.Support).slice(0, cap), TargetDate: target,
    }, _pdptSnap(s), { CycleYear: year, GoalLevel: e.GoalLevel, Period: period, Status: 'Open' });
    const parent = pdpGoalParentCheck({ level: e.GoalLevel, period, parentId: e.ParentGoalID, goals, personId: s.PersonID, cycleYear: year });
    if (parent) f.ParentGoalID = parent;
    if (has('Rag') && e.Rag) f.Rag = pdpLiveGoalPatch({ Rag: e.Rag }).Rag;
    return pdpCleanGoals(f, 'create');
  }
  if (!existing) throw new Error('That goal was not found.');
  const locked = pdpGoalFieldLock(existing, meetingsById) === 'agreed';
  if ((has('GoalLevel') && e.GoalLevel !== existing.GoalLevel) || (has('Quarter') && e.Quarter && _pdptrQuarter(existing.Period) !== Number(e.Quarter))) {
    throw new Error('A goal’s level and period cannot change. Drop it and add a new one.');
  }
  const out = {};
  T.AGREED_FIELDS.forEach(k => {
    if (!has(k)) return;
    const next = _pdptrNorm(k === 'TargetDate' ? (e[k] ? spDateIn(e[k]) || e[k] : '') : e[k]);
    const prev = _pdptrNorm(k === 'TargetDate' ? spDateIn(existing[k]) : existing[k]);
    if (next === prev) return;
    // Linking a goal that has no parent yet is not a change to what was agreed.
    if (locked && !(k === 'ParentGoalID' && !Number(existing.ParentGoalID))) throw new Error(_PDPTR_LOCKED_MSG);
    out[k] = e[k];
  });
  if ('Title' in out && !_pdptText(out.Title)) throw new Error('Give the goal a title.');
  if ('Category' in out && !CONFIG.PDP.GOAL_CATEGORIES.includes(out.Category)) throw new Error('Pick a goal category.');
  if ('TargetDate' in out && out.TargetDate && !isoDate(out.TargetDate)) throw new Error('The target date is not a valid date.');
  if ('Title' in out) out.Title = _pdptText(out.Title).slice(0, 250);
  ['WhyItMatters', 'SuccessMeasures', 'Support'].forEach(k => { if (k in out) out[k] = _pdptText(out[k]).slice(0, cap); });
  if ('ParentGoalID' in out) {
    out.ParentGoalID = pdpGoalParentCheck({ level: existing.GoalLevel, period: pdpGoalPeriodFix(existing) || existing.Period, parentId: out.ParentGoalID, goals, personId: existing.PersonID, cycleYear: existing.CycleYear, selfId: existing.id }) || '';
  }
  const live = {};
  T.LIVE_FIELDS.forEach(k => { if (has(k) && _pdptrNorm(e[k]) !== _pdptrNorm(existing[k])) live[k] = e[k]; });
  if (Object.keys(live).length) Object.assign(out, pdpLiveGoalPatch(live));
  if (!Object.keys(out).length) throw new Error('Nothing to change.');
  return pdpCleanGoals(out, 'update');
}

// Fields for an action written from the tracker (always without a meeting). actor = { email, as } where `as`
// is 'self' | 'lm' | 'csd'. Owner Employee = the person; Manager = the line manager's email when the person
// is the one writing, otherwise the acting manager's email. update: existing = the stored action.
function pdpTrackerActionPayload(snap, edit, mode, actor, goals, existing, meetingsById) {
  const s = snap || {}, e = edit || {}, a = actor || {};
  const has = k => Object.prototype.hasOwnProperty.call(e, k);
  const ownerEmail = role => role === 'Employee' ? s.PersonEmail : (a.as === 'self' ? s.LineManagerEmail : a.email);
  const goalId = () => {
    if (!e.GoalID) return '';
    const g = (goals || []).find(x => String(x.id) === String(e.GoalID));
    if (!g || String(g.PersonID) !== String(s.PersonID)) throw new Error('Pick one of this person’s goals.');
    return Number(g.id);
  };
  if (mode === 'create') {
    const title = _pdptText(e.Title);
    if (!title) throw new Error('Give the action a title.');
    if (!CONFIG.PDP.OWNER_ROLES.includes(e.OwnerRole)) throw new Error('Pick who owns the action.');
    const due = _pdptText(e.DueDate);
    if (!due || !isoDate(due)) throw new Error('Give the action a due date.');
    const f = Object.assign({ Title: title.slice(0, 250), OwnerRole: e.OwnerRole, OwnerEmail: ownerEmail(e.OwnerRole), DueDate: due }, _pdptSnap(s), { IsDone: false });
    const g = goalId();
    if (g) f.GoalID = g;
    return pdpCleanActions(f, 'create');
  }
  if (!existing) throw new Error('That action was not found.');
  const out = {};
  const prevDue = spDateIn(existing.DueDate);
  const changed = (k, next, prev) => has(k) && _pdptrNorm(next) !== _pdptrNorm(prev);
  const locked = pdpGoalFieldLock(existing, meetingsById) === 'agreed';
  if (changed('Title', e.Title, existing.Title) || changed('OwnerRole', e.OwnerRole, existing.OwnerRole) || changed('DueDate', e.DueDate, prevDue) || changed('GoalID', e.GoalID, existing.GoalID)) {
    if (locked) throw new Error(_PDPTR_LOCKED_MSG);
    if (has('Title')) { if (!_pdptText(e.Title)) throw new Error('Give the action a title.'); out.Title = _pdptText(e.Title).slice(0, 250); }
    if (has('OwnerRole')) {
      if (!CONFIG.PDP.OWNER_ROLES.includes(e.OwnerRole)) throw new Error('Pick who owns the action.');
      out.OwnerRole = e.OwnerRole; out.OwnerEmail = ownerEmail(e.OwnerRole);
    }
    if (has('DueDate')) { if (!e.DueDate || !isoDate(e.DueDate)) throw new Error('Give the action a due date.'); out.DueDate = e.DueDate; }
    if (has('GoalID')) out.GoalID = goalId() || '';
  }
  if (!Object.keys(out).length) throw new Error('Nothing to change.');
  return pdpCleanActions(out, 'update');
}

// { Rag?, Status? } from an edit, validated. A blank Rag clears it.
function pdpLiveGoalPatch(edit) {
  const e = edit || {}, out = {};
  if (Object.prototype.hasOwnProperty.call(e, 'Rag')) {
    if (e.Rag && !CONFIG.PDP.RAG.includes(e.Rag)) throw new Error('Pick Red, Amber or Green.');
    out.Rag = e.Rag || '';
  }
  if (Object.prototype.hasOwnProperty.call(e, 'Status')) {
    if (!CONFIG.PDP.GOAL_STATUS.includes(e.Status)) throw new Error('Pick Open, Achieved or Dropped.');
    out.Status = e.Status;
  }
  if (!Object.keys(out).length) throw new Error('Nothing to change.');
  return out;
}

function pdpActionDonePatch(done, nowIso) {
  return done ? { IsDone: true, DoneAt: nowIso } : { IsDone: false, DoneAt: '' };
}

// The goal's own RAG and the worst RAG across it and its open descendants (CONFIG.PDP.TRACKER.RAG_ORDER, worst
// first). Derived, never stored. descendants = every goal below it; Achieved / Dropped ones are ignored.
function pdpRagRollup(goal, descendants) {
  const order = CONFIG.PDP.TRACKER.RAG_ORDER;
  const own = goal && order.includes(goal.Rag) ? goal.Rag : '';
  let worst = own ? order.indexOf(own) : -1;
  (descendants || []).forEach(d => {
    if ((d.Status || 'Open') !== 'Open' || !order.includes(d.Rag)) return;
    const i = order.indexOf(d.Rag);
    if (worst < 0 || i < worst) worst = i;
  });
  return { own, rolled: worst < 0 ? '' : order[worst] };
}

function _pdptrLevelRank(level) { return Math.max(0, CONFIG.PDP.GOAL_LEVELS.indexOf(level)); }

// The tracker's view model for one person and year. meetings = the person's meetings (every year, for the
// lock rule). Goals sorted by TargetDate then Title; a goal whose parent is missing (or in another year) is an
// orphan. RAG counts are over the top-level goals (roots and orphans) that are still Open, using the rolled RAG.
function pdpTrackerModel(goals, actions, meetings, today, year) {
  const day = _pdptDay(today), soon = addDaysISO(day, CONFIG.PDP.CYCLE.DUE_SOON_DAYS);
  const y = Number(year);
  const byMeeting = new Map((meetings || []).map(m => [String(m.id), m]));
  const list = (goals || []).filter(g => Number(g.CycleYear) === y);
  const ids = new Set(list.map(g => String(g.id)));
  const targetOf = g => spDateIn(g.TargetDate) || '9999-12-31';
  const sorter = (a, b) => targetOf(a).localeCompare(targetOf(b)) || String(a.Title).localeCompare(String(b.Title));
  const kids = new Map();
  list.forEach(g => {
    const p = String(g.ParentGoalID || '');
    if (p && ids.has(p) && p !== String(g.id)) kids.set(p, (kids.get(p) || []).concat(g));
  });
  const below = (g, seen) => {
    const out = [];
    (kids.get(String(g.id)) || []).forEach(c => { if (!seen.has(String(c.id))) { seen.add(String(c.id)); out.push(c, ...below(c, seen)); } });
    return out;
  };
  const node = (g, seen) => {
    const sub = (kids.get(String(g.id)) || []).slice().sort(sorter).filter(c => !seen.has(String(c.id)));
    sub.forEach(c => seen.add(String(c.id)));
    const target = spDateIn(g.TargetDate);
    return {
      goal: g, lock: pdpGoalFieldLock(g, byMeeting),
      rag: pdpRagRollup(g, below(g, new Set([String(g.id)]))),
      overdue: (g.Status || 'Open') === 'Open' && !!target && target < day,
      children: sub.map(c => node(c, seen)),
    };
  };
  const linked = g => { const p = String(g.ParentGoalID || ''); return p && ids.has(p) && p !== String(g.id); };
  const seen = new Set();
  const roots = list.filter(g => g.GoalLevel === 'Annual' && !linked(g)).sort(sorter);
  roots.forEach(g => seen.add(String(g.id)));
  const orphanGoals = list.filter(g => g.GoalLevel !== 'Annual' && !linked(g)).sort((a, b) => _pdptrLevelRank(a.GoalLevel) - _pdptrLevelRank(b.GoalLevel) || sorter(a, b));
  orphanGoals.forEach(g => seen.add(String(g.id)));
  const tree = roots.map(g => node(g, seen));
  const orphans = orphanGoals.map(g => node(g, seen));
  const top = tree.concat(orphans).filter(n => (n.goal.Status || 'Open') === 'Open');
  const counts = {
    open: list.filter(g => (g.Status || 'Open') === 'Open').length,
    achieved: list.filter(g => g.Status === 'Achieved').length,
    dropped: list.filter(g => g.Status === 'Dropped').length,
    red: top.filter(n => n.rag.rolled === 'Red').length, amber: top.filter(n => n.rag.rolled === 'Amber').length, green: top.filter(n => n.rag.rolled === 'Green').length,
    goalsOverdue: list.filter(g => (g.Status || 'Open') === 'Open' && spDateIn(g.TargetDate) && spDateIn(g.TargetDate) < day).length,
  };
  const dueOf = a => spDateIn(a.DueDate) || '';
  const decorate = a => ({ action: a, lock: pdpGoalFieldLock(a, byMeeting), done: _pdpYes(a.IsDone), overdue: !_pdpYes(a.IsDone) && !!dueOf(a) && dueOf(a) < day, dueSoon: !_pdpYes(a.IsDone) && !!dueOf(a) && dueOf(a) >= day && dueOf(a) <= soon });
  const all = (actions || []).map(decorate);
  const actionsOpen = all.filter(x => !x.done).sort((a, b) => (dueOf(a.action) || '9999').localeCompare(dueOf(b.action) || '9999') || String(a.action.Title).localeCompare(String(b.action.Title)));
  const inYear = x => String(dueOf(x.action) || spDateIn(x.action.DoneAt) || '').slice(0, 4) === String(y);
  const actionsDone = all.filter(x => x.done && inYear(x)).sort((a, b) => dueOf(b.action).localeCompare(dueOf(a.action)));
  counts.actionsOpen = actionsOpen.length;
  counts.actionsOverdue = actionsOpen.filter(x => x.overdue).length;
  counts.actionsDueSoon = actionsOpen.filter(x => x.dueSoon).length;
  counts.actionsDone = actionsDone.length;
  return { tree, orphans, counts, actionsOpen, actionsDone };
}

// What the "Tidy goal periods" migration would write: [{ id, from, to }] for rows whose Period is not canonical,
// and skipped = [{ id, reason }] for rows it cannot work out. Idempotent: a second plan is empty.
function pdpGoalPeriodPlan(goals) {
  const rows = [], skipped = [];
  (goals || []).forEach(g => {
    const fix = pdpGoalPeriodFix(g);
    if (fix === null) skipped.push({ id: g.id, reason: 'Period “' + _pdptText(g.Period) + '” cannot be mapped for a ' + (g.GoalLevel || 'goal') + ' goal in ' + (g.CycleYear || '?') + '.' });
    else if (fix !== _pdptText(g.Period)) rows.push({ id: g.id, from: _pdptText(g.Period), to: fix });
  });
  return { rows, skipped };
}