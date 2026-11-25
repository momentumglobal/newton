// js/bizgoals-track.js — Goals & Actions tracker: pure rules (N-533 / BG-2)
//
// No DOM, no Graph. Loads on command-centre.html only, after bizgoals-data.js and before api-bizgoals.js. Depends on
// bizgoals-config.js (CONFIG.BIZGOALS), bizgoals-data.js (bizgoalsPeriodYear, bizgoalsOwnerState) and utils.js (spDateIn,
// isoDate, localDayISO, addDaysISO). Writes happen only in api-bizgoals.js; the page is bizgoals-track-ui.js.
// BG-D9: copied from the My Development tracker (pdp-track.js), PDP untouched. Each comment names the pdp-track.js
// function it copies so N-537 can merge them after the Jan 2027 PDP go-live. Business goals have no meetings, so
// PDP's "agreed in a signed meeting" lock and its per-level cap have no counterpart here.
// Periods: Annual 'YYYY', H2 'YYYY-H2', Quarterly 'YYYY-Qn'. Rollover (BG-D14 to BG-D17): bizgoalsRolloverPlan.

function _bgtrText(v) { return String(v == null ? '' : v).trim(); }
function _bgtrStatus(g) { return (g && g.Status) || 'Open'; }
function _bgtrOpen(g) { return _bgtrStatus(g) === 'Open'; }
function _bgtrId(v) { return String(v == null ? '' : v); }
function _bgtrHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

function _bgtrQuarter(period) {
  const m = /-Q([1-4])$/.exec(_bgtrText(period));
  return m ? Number(m[1]) : 0;
}

// 'YYYY-MM-DD' for a SharePoint date-only value, '' when blank or unparseable.
function _bgtrDay(v) { return spDateIn(v) || ''; }

// The local calendar day of an instant (SharePoint Created / Modified), null when unparseable.
function bizgoalsInstantDay(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : localDayISO(d);
}

// The same day one year on ('YYYY-MM-DD' string maths, never Date arithmetic); 29 Feb -> 28 Feb; '' stays ''.
function _bgtrNextYearDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(_bgtrDay(v));
  if (!m) return '';
  const day = m[2] === '02' && m[3] === '29' ? '28' : m[3];
  return (Number(m[1]) + 1) + '-' + m[2] + '-' + day;
}

// The canonical Period of a new goal. Copies pdpGoalPeriod (no meeting-month fallback: a Quarterly goal needs `quarter`).
function bizgoalsGoalPeriod(level, year, quarter) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1) throw new Error('A goal needs a year.');
  if (level === 'Annual') return String(y);
  if (level === 'H2') return y + '-H2';
  if (level === 'Quarterly') {
    const q = Number(quarter);
    if (!Number.isInteger(q) || q < 1 || q > 4) throw new Error('Pick the quarter for a quarterly goal.');
    return y + '-Q' + q;
  }
  throw new Error('Pick a goal level.');
}

// The goals a goal of `level` / `period` may sit under: Open goals of the same year. H2 -> Annual; Quarterly -> H2 for
// the quarters inside the second half when an H2 goal exists, else Annual. Copies pdpGoalParentOptions.
function bizgoalsParentOptions(level, period, goals) {
  const year = bizgoalsPeriodYear(level, period);
  const live = (goals || []).filter(g => _bgtrOpen(g) && Number(g.GoalYear) === year);
  if (level === 'H2') return live.filter(g => g.GoalLevel === 'Annual');
  if (level === 'Quarterly') {
    const h2 = live.filter(g => g.GoalLevel === 'H2');
    const firstQ = Math.ceil(CONFIG.BIZGOALS.TRACKER.HALF_START_MONTH / 3);
    return _bgtrQuarter(period) >= firstQ && h2.length ? h2 : live.filter(g => g.GoalLevel === 'Annual');
  }
  return [];
}

// Validates a parent choice and returns its id (0 for none). input = { level, period, parentId, goals, year, selfId }.
// Copies pdpGoalParentCheck (same year instead of same person).
function bizgoalsParentCheck(input) {
  const i = input || {};
  const pid = Number(i.parentId);
  if (!i.parentId || !Number.isInteger(pid) || pid <= 0) return 0;
  const goals = i.goals || [];
  const parent = goals.find(g => _bgtrId(g.id) === String(pid));
  if (!parent) throw new Error('That parent goal was not found.');
  if (Number(parent.GoalYear) !== Number(i.year)) throw new Error('That parent goal belongs to another year.');
  if (!bizgoalsParentOptions(i.level, i.period, goals).some(g => _bgtrId(g.id) === String(pid))) throw new Error('Pick an open parent from the level above.');
  const seen = new Set();
  let cur = parent;
  while (cur && !seen.has(_bgtrId(cur.id))) {
    if (i.selfId != null && _bgtrId(cur.id) === _bgtrId(i.selfId)) throw new Error('A goal cannot sit under one of its own sub-goals.');
    seen.add(_bgtrId(cur.id));
    cur = goals.find(g => _bgtrId(g.id) === _bgtrId(cur.ParentGoalID));
  }
  return pid;
}

// { Rag?, Status? } from an edit, validated. A blank Rag clears it; CARRIED is never picked by hand. Copies pdpLiveGoalPatch.
function bizgoalsLiveGoalPatch(edit) {
  const e = edit || {}, B = CONFIG.BIZGOALS, out = {};
  if (_bgtrHas(e, 'Rag')) {
    if (e.Rag && !B.RAG.includes(e.Rag)) throw new Error('Pick Red, Amber or Green.');
    out.Rag = e.Rag || '';
  }
  if (_bgtrHas(e, 'Status')) {
    if (!B.PICKABLE_STATUS.includes(e.Status)) throw new Error('Pick ' + B.PICKABLE_STATUS.join(', ') + '.');
    out.Status = e.Status;
  }
  if (!Object.keys(out).length) throw new Error('Nothing to change.');
  return out;
}

// Fields for a goal written from the tracker, for createBusinessGoal / updateBusinessGoal (which clean them).
// edit (create) = { Title, GoalLevel, Quarter, GoalYear, ParentGoalID, OwnerEmail, WhyItMatters, SuccessMeasures,
// TargetDate, Rag }. update: existing = the stored goal; only changed fields are returned. goals = every goal.
// Copies pdpTrackerGoalPayload without Category / Support / the meeting lock / the per-level cap.
function bizgoalsTrackerGoalPayload(edit, mode, goals, existing) {
  const e = edit || {}, B = CONFIG.BIZGOALS;
  const has = k => _bgtrHas(e, k);
  const date = v => { const t = _bgtrText(v); if (t && !isoDate(t)) throw new Error('The target date is not a valid date.'); return t; };
  if (mode === 'create') {
    const title = _bgtrText(e.Title);
    if (!title) throw new Error('Give the goal a title.');
    if (!B.GOAL_LEVELS.includes(e.GoalLevel)) throw new Error('Pick a goal level.');
    const year = Number(e.GoalYear);
    const period = bizgoalsGoalPeriod(e.GoalLevel, year, e.Quarter);
    const owner = _bgtrText(e.OwnerEmail).toLowerCase();
    if (!owner) throw new Error('Pick an owner.');
    const f = { Title: title, GoalLevel: e.GoalLevel, Period: period, GoalYear: year, Status: 'Open', OwnerEmail: owner };
    ['WhyItMatters', 'SuccessMeasures'].forEach(k => { if (_bgtrText(e[k])) f[k] = _bgtrText(e[k]); });
    const target = date(e.TargetDate);
    if (target) f.TargetDate = target;
    if (e.Rag) f.Rag = bizgoalsLiveGoalPatch({ Rag: e.Rag }).Rag;
    const parent = bizgoalsParentCheck({ level: e.GoalLevel, period, parentId: e.ParentGoalID, goals, year });
    if (parent) f.ParentGoalID = parent;
    return f;
  }
  if (!existing) throw new Error('That goal was not found.');
  if (_bgtrStatus(existing) === B.CARRIED) throw new Error('This goal was carried forward. Change it in the year it was carried to.');
  if ((has('GoalLevel') && e.GoalLevel !== existing.GoalLevel) || (has('Quarter') && e.Quarter && _bgtrQuarter(existing.Period) !== Number(e.Quarter))) {
    throw new Error('A goal’s level and period cannot change. Drop it and add a new one.');
  }
  const norm = {
    Title: v => _bgtrText(v), WhyItMatters: v => _bgtrText(v), SuccessMeasures: v => _bgtrText(v),
    TargetDate: v => _bgtrDay(v) || _bgtrText(v), ParentGoalID: v => (Number(v) ? String(Number(v)) : ''),
    OwnerEmail: v => _bgtrText(v).toLowerCase(),
  };
  const out = {};
  Object.keys(norm).forEach(k => { if (has(k) && norm[k](e[k]) !== norm[k](existing[k])) out[k] = norm[k](e[k]); });
  if ('Title' in out && !out.Title) throw new Error('Give the goal a title.');
  if ('OwnerEmail' in out && !out.OwnerEmail) throw new Error('Pick an owner.');
  if ('TargetDate' in out) out.TargetDate = date(out.TargetDate);
  if ('ParentGoalID' in out) {
    out.ParentGoalID = bizgoalsParentCheck({ level: existing.GoalLevel, period: existing.Period, parentId: out.ParentGoalID, goals, year: existing.GoalYear, selfId: existing.id }) || '';
  }
  const live = {};
  ['Rag', 'Status'].forEach(k => { if (has(k) && _bgtrText(e[k]) !== _bgtrText(k === 'Status' ? _bgtrStatus(existing) : existing[k])) live[k] = e[k]; });
  if (Object.keys(live).length) Object.assign(out, bizgoalsLiveGoalPatch(live));
  if (!Object.keys(out).length) throw new Error('Nothing to change.');
  return out;
}

// Fields for an action written from the tracker (BG-D12: every action belongs to an Open goal; an unchanged GoalID on a
// goal that has since closed is allowed on update). edit = { Title, GoalID, OwnerEmail, DueDate }. Copies
// pdpTrackerActionPayload (the owner is a person here, not an owner role).
function bizgoalsTrackerActionPayload(edit, mode, goals, existing) {
  const e = edit || {};
  const has = k => _bgtrHas(e, k);
  const openGoal = id => {
    const g = (goals || []).find(x => _bgtrId(x.id) === _bgtrId(id));
    if (!id || !g || !_bgtrOpen(g)) throw new Error('Pick an open goal for the action.');
    return Number(g.id);
  };
  const due = v => { const t = _bgtrText(v); if (!t || !isoDate(t)) throw new Error('Give the action a due date.'); return t; };
  const owner = v => { const t = _bgtrText(v).toLowerCase(); if (!t) throw new Error('Pick an owner.'); return t; };
  if (mode === 'create') {
    const title = _bgtrText(e.Title);
    if (!title) throw new Error('Give the action a title.');
    return { Title: title, GoalID: openGoal(e.GoalID), OwnerEmail: owner(e.OwnerEmail), DueDate: due(e.DueDate), IsDone: false };
  }
  if (!existing) throw new Error('That action was not found.');
  const out = {};
  if (has('Title') && _bgtrText(e.Title) !== _bgtrText(existing.Title)) {
    if (!_bgtrText(e.Title)) throw new Error('Give the action a title.');
    out.Title = _bgtrText(e.Title);
  }
  if (has('GoalID') && _bgtrId(e.GoalID) !== _bgtrId(existing.GoalID)) out.GoalID = openGoal(e.GoalID);
  if (has('OwnerEmail') && _bgtrText(e.OwnerEmail).toLowerCase() !== _bgtrText(existing.OwnerEmail).toLowerCase()) out.OwnerEmail = owner(e.OwnerEmail);
  if (has('DueDate') && _bgtrText(e.DueDate) !== _bgtrDay(existing.DueDate)) out.DueDate = due(e.DueDate);
  if (!Object.keys(out).length) throw new Error('Nothing to change.');
  return out;
}

// The goal's own RAG and the worst RAG across it and its Open descendants (CONFIG.BIZGOALS.RAG, worst first). Derived,
// never stored. Copies pdpRagRollup.
function bizgoalsRagRollup(goal, descendants) {
  const order = CONFIG.BIZGOALS.RAG;
  const own = goal && order.includes(goal.Rag) ? goal.Rag : '';
  let worst = own ? order.indexOf(own) : -1;
  (descendants || []).forEach(d => {
    if (!_bgtrOpen(d) || !order.includes(d.Rag)) return;
    const i = order.indexOf(d.Rag);
    if (worst < 0 || i < worst) worst = i;
  });
  return { own, rolled: worst < 0 ? '' : order[worst] };
}

// { email, name, state } for an owner: name from the live candidate, else the stored snapshot, else the email.
function bizgoalsOwnerView(email, snapshotName, candidates) {
  const e = _bgtrText(email).toLowerCase();
  const hit = (candidates || []).find(c => c.email === e);
  return { email: e, name: hit ? hit.name : (_bgtrText(snapshotName) || e), state: bizgoalsOwnerState(e, candidates) };
}

// Newest first: SharePoint Created (an ISO instant), then id.
function _bgtrNewest(a, b) {
  return _bgtrText(b.Created).localeCompare(_bgtrText(a.Created)) || Number(b.id) - Number(a.id);
}

// The goal's update entries plus every entry of the goals it was carried from (CarriedFromID chain, cycle-safe),
// newest first. -> [{ entry, year, own }]
function bizgoalsGoalHistory(goalId, goals, updates) {
  const byId = new Map((goals || []).map(g => [_bgtrId(g.id), g]));
  const chain = new Map();
  let cur = byId.get(_bgtrId(goalId));
  while (cur && !chain.has(_bgtrId(cur.id))) {
    chain.set(_bgtrId(cur.id), cur);
    cur = cur.CarriedFromID ? byId.get(_bgtrId(cur.CarriedFromID)) : null;
  }
  return (updates || []).filter(u => chain.has(_bgtrId(u.GoalID))).slice().sort(_bgtrNewest)
    .map(u => ({ entry: u, year: Number(chain.get(_bgtrId(u.GoalID)).GoalYear), own: _bgtrId(u.GoalID) === _bgtrId(goalId) }));
}

// Distinct goal years, the current year and the next one, newest first.
function bizgoalsYearOptions(goals, today) {
  const day = typeof today === 'string' ? today : localDayISO(today || new Date());
  const now = Number(String(day).slice(0, 4));
  const years = new Set([now, now + 1]);
  (goals || []).forEach(g => { const y = Number(g.GoalYear); if (Number.isInteger(y) && y > 0) years.add(y); });
  return Array.from(years).sort((a, b) => b - a);
}

// Children of each goal across every year: parent id -> [goal].
function _bgtrKids(goals) {
  const kids = new Map();
  (goals || []).forEach(g => {
    const p = _bgtrId(g.ParentGoalID);
    if (p && p !== _bgtrId(g.id)) kids.set(p, (kids.get(p) || []).concat(g));
  });
  return kids;
}

// Every goal below `g` (cycle-safe).
function _bgtrBelow(g, kids) {
  const out = [], seen = new Set([_bgtrId(g.id)]);
  const walk = x => (kids.get(_bgtrId(x.id)) || []).forEach(c => {
    if (seen.has(_bgtrId(c.id))) return;
    seen.add(_bgtrId(c.id)); out.push(c); walk(c);
  });
  walk(g);
  return out;
}

// The goal in any year carried from `g` (its live copy), or null.
function _bgtrCopyOf(g, goals) {
  return (goals || []).find(c => c.CarriedFromID != null && _bgtrId(c.CarriedFromID) === _bgtrId(g.id)) || null;
}

function _bgtrGoalSort(a, b) {
  const t = g => _bgtrDay(g.TargetDate) || '9999-12-31';
  return t(a).localeCompare(t(b)) || _bgtrText(a.Title).localeCompare(_bgtrText(b.Title));
}

// The page's view model for one year. goals / actions / updates = every row; candidates = owner candidates; today =
// Date or 'YYYY-MM-DD'. Copies pdpTrackerModel, plus owner, latest update, history count and carry state per goal.
function bizgoalsTrackerModel(input) {
  const i = input || {}, B = CONFIG.BIZGOALS;
  const all = i.goals || [], updates = i.updates || [], cands = i.candidates || [];
  const day = typeof i.today === 'string' ? i.today : localDayISO(i.today || new Date());
  const soon = addDaysISO(day, B.TRACKER.DUE_SOON_DAYS), y = Number(i.year);
  const list = all.filter(g => Number(g.GoalYear) === y);
  const ids = new Set(list.map(g => _bgtrId(g.id)));
  const kids = new Map();
  list.forEach(g => { const p = _bgtrId(g.ParentGoalID); if (p && ids.has(p) && p !== _bgtrId(g.id)) kids.set(p, (kids.get(p) || []).concat(g)); });
  const linked = g => { const p = _bgtrId(g.ParentGoalID); return !!p && ids.has(p) && p !== _bgtrId(g.id); };
  const node = (g, seen) => {
    const sub = (kids.get(_bgtrId(g.id)) || []).slice().sort(_bgtrGoalSort).filter(c => !seen.has(_bgtrId(c.id)));
    sub.forEach(c => seen.add(_bgtrId(c.id)));
    const target = _bgtrDay(g.TargetDate), copy = _bgtrCopyOf(g, all);
    const own = updates.filter(u => _bgtrId(u.GoalID) === _bgtrId(g.id)).sort(_bgtrNewest);
    return {
      goal: g, rag: bizgoalsRagRollup(g, _bgtrBelow(g, kids)),
      overdue: _bgtrOpen(g) && !!target && target < day,
      owner: bizgoalsOwnerView(g.OwnerEmail, g.OwnerName, cands),
      latest: own[0] || null, historyCount: bizgoalsGoalHistory(g.id, all, updates).length,
      carriedTo: copy ? Number(copy.GoalYear) : null, copyId: copy ? copy.id : null,
      // An Open Annual goal that already has a copy is a rollover that stopped part-way: carrying again finishes it.
      canCarry: g.GoalLevel === 'Annual' && _bgtrOpen(g),
      children: sub.map(c => node(c, seen)),
    };
  };
  const seen = new Set();
  const rank = g => Math.max(0, B.GOAL_LEVELS.indexOf(g.GoalLevel));
  const roots = list.filter(g => g.GoalLevel === 'Annual' && !linked(g)).sort(_bgtrGoalSort);
  roots.forEach(g => seen.add(_bgtrId(g.id)));
  const orphanGoals = list.filter(g => g.GoalLevel !== 'Annual' && !linked(g)).sort((a, b) => rank(a) - rank(b) || _bgtrGoalSort(a, b));
  orphanGoals.forEach(g => seen.add(_bgtrId(g.id)));
  const tree = roots.map(g => node(g, seen)), orphans = orphanGoals.map(g => node(g, seen));
  const top = tree.concat(orphans).filter(n => _bgtrOpen(n.goal));
  const count = st => list.filter(g => _bgtrStatus(g) === st).length;
  const counts = {
    open: count('Open'), achieved: count('Achieved'), dropped: count('Dropped'), carried: count(B.CARRIED),
    red: top.filter(n => n.rag.rolled === 'Red').length, amber: top.filter(n => n.rag.rolled === 'Amber').length, green: top.filter(n => n.rag.rolled === 'Green').length,
    goalsOverdue: list.filter(g => _bgtrOpen(g) && _bgtrDay(g.TargetDate) && _bgtrDay(g.TargetDate) < day).length,
    canCarry: tree.concat(orphans).filter(n => n.canCarry).length,
  };
  const goalById = new Map(list.map(g => [_bgtrId(g.id), g]));
  const done = a => a.IsDone === true || a.IsDone === 'Yes' || a.IsDone === 1;
  const dueOf = a => _bgtrDay(a.DueDate);
  const decorate = a => {
    const g = goalById.get(_bgtrId(a.GoalID)), d = done(a);
    return { action: a, done: d, goalTitle: g ? g.Title : '', overdue: !d && !!dueOf(a) && dueOf(a) < day, dueSoon: !d && !!dueOf(a) && dueOf(a) >= day && dueOf(a) <= soon, owner: bizgoalsOwnerView(a.OwnerEmail, a.OwnerName, cands) };
  };
  const mine = (i.actions || []).filter(a => goalById.has(_bgtrId(a.GoalID))).map(decorate);
  const actionsOpen = mine.filter(x => !x.done).sort((a, b) => (dueOf(a.action) || '9999').localeCompare(dueOf(b.action) || '9999') || _bgtrText(a.action.Title).localeCompare(_bgtrText(b.action.Title)));
  const actionsDone = mine.filter(x => x.done).sort((a, b) => dueOf(b.action).localeCompare(dueOf(a.action)));
  counts.actionsOpen = actionsOpen.length;
  counts.actionsOverdue = actionsOpen.filter(x => x.overdue).length;
  counts.actionsDueSoon = actionsOpen.filter(x => x.dueSoon).length;
  counts.actionsDone = actionsDone.length;
  return { tree, orphans, counts, actionsOpen, actionsDone };
}

// Why a goal cannot be carried, or '' when it can.
function _bgtrCarryBlock(g, y) {
  if (!g) return 'That goal was not found.';
  if (Number(g.GoalYear) !== y) return 'That goal is not in ' + y + '.';
  if (g.GoalLevel !== 'Annual') return 'Only annual goals carry forward.';
  if (!_bgtrOpen(g)) return 'It is already ' + _bgtrStatus(g) + '.';
  return '';
}

// The new year's copy of an Annual goal (BG-D14): text, RAG and owner kept, target date one year on, CarriedFromID set.
function _bgtrCopyFields(g, toYear, ownerEmail) {
  const f = { Title: _bgtrText(g.Title), GoalLevel: 'Annual', Period: String(toYear), GoalYear: toYear, Status: 'Open', OwnerEmail: ownerEmail, CarriedFromID: Number(g.id) };
  ['WhyItMatters', 'SuccessMeasures'].forEach(k => { if (_bgtrText(g[k])) f[k] = _bgtrText(g[k]); });
  if (CONFIG.BIZGOALS.RAG.includes(g.Rag)) f.Rag = g.Rag;
  const target = _bgtrNextYearDate(g.TargetDate);
  if (target) f.TargetDate = target;
  return f;
}

// What a rollover of `goalIds` from `fromYear` would write (BG-D14 to BG-D17). Pure and deterministic; re-running it
// after a partial rollover reuses the copy (copyId) and leaves out the steps already done, so the API can finish the job.
// input = { goals, actions, updates, candidates, fromYear, goalIds, actorEmail }
// -> { toYear, items: [{ goalId, title, copyId, copy, ownerSwap, closeIds, moveActionIds, addEntry }], skipped: [{ goalId, reason }] }
function bizgoalsRolloverPlan(input) {
  const i = input || {}, B = CONFIG.BIZGOALS;
  const y = Number(i.fromYear), toYear = y + 1;
  if (!Number.isInteger(y) || y < B.LIMITS.YEAR_MIN) throw new Error('Pick the year to roll over.');
  if (toYear > B.LIMITS.YEAR_MAX) throw new Error('Goals cannot roll past ' + B.LIMITS.YEAR_MAX + '.');
  const goals = i.goals || [], kids = _bgtrKids(goals);
  const byId = new Map(goals.map(g => [_bgtrId(g.id), g]));
  const entry = 'Carried forward to ' + toYear + '.';
  const items = [], skipped = [], seen = new Set();
  (i.goalIds || []).forEach(raw => {
    const id = _bgtrId(raw);
    if (seen.has(id)) return;
    seen.add(id);
    const g = byId.get(id), reason = _bgtrCarryBlock(g, y);
    if (reason) { skipped.push({ goalId: id, reason }); return; }
    const copyRow = _bgtrCopyOf(g, goals);
    const closeIds = _bgtrBelow(g, kids).filter(d => _bgtrOpen(d)).map(d => _bgtrId(d.id));
    const tree = new Set([id].concat(closeIds));
    const moveActionIds = (i.actions || []).filter(a => tree.has(_bgtrId(a.GoalID)) && !(a.IsDone === true || a.IsDone === 'Yes' || a.IsDone === 1)).map(a => _bgtrId(a.id));
    const ownerSwap = !copyRow && bizgoalsOwnerState(g.OwnerEmail, i.candidates) !== 'ok';
    const owner = ownerSwap ? _bgtrText(i.actorEmail).toLowerCase() : _bgtrText(g.OwnerEmail).toLowerCase();
    const addEntry = !(i.updates || []).some(u => _bgtrId(u.GoalID) === id && _bgtrText(u.UpdateText) === entry);
    items.push({ goalId: id, title: _bgtrText(g.Title), copyId: copyRow ? _bgtrId(copyRow.id) : null, copy: copyRow ? null : _bgtrCopyFields(g, toYear, owner), ownerSwap, closeIds, moveActionIds, addEntry });
  });
  return { toYear, items, skipped };
}
