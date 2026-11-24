// js/bizgoals-data.js — Goals & Actions pure rules (N-532 / BG-1)
// Loads on command-centre.html only, after bizgoals-config.js and before api-bizgoals.js. No DOM, no Graph.
// BG-D9: these rules copy the PDP ones into their own file, PDP untouched. Each comment names the PDP function it
// copies so N-537 (after the Jan 2027 PDP go-live) can merge them. Field shape only here: nesting rules
// (level vs parent, period plan) are N-533's (bizgoals-track.js, copying pdpGoalParentCheck / pdpGoalPeriod).

function _bgBlank(v) { return v === undefined || v === null || (typeof v === 'string' && v.trim() === ''); }
function _bgEmail(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function _bgIsEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s == null ? '' : s)); }   // copies pdpIsEmail (pdp-identity.js)

function _bgText(where, v, max) {
  const s = String(v).trim();
  if (s.length > max) throw new Error(where + ' must be ' + max + ' characters or fewer');
  return s;
}
function _bgEnum(where, v, values) {   // copies pdpAssertEnum (pdp-data.js)
  const s = String(v).trim();
  if (!values.includes(s)) throw new Error(where + ' must be one of ' + values.join(' / '));
  return s;
}
function _bgWhole(where, v, min, max) {   // copies the 'int' kind of _pdpCleanValue (pdp-data.js)
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(where + ' must be a whole number');
  if (min != null && n < min) throw new Error(where + ' must be ' + min + ' or more');
  if (max != null && n > max) throw new Error(where + ' must be ' + max + ' or less');
  return n;
}
function _bgDate(where, v) {   // copies the 'date' kind of _pdpCleanValue (pdp-data.js)
  const d = isoDate(v);
  if (!d) throw new Error(where + ' is not a YYYY-MM-DD date');
  return d;
}

// The year inside a goal Period for its level: Annual 'YYYY', H2 'YYYY-H2', Quarterly 'YYYY-Qn'. null when it does not match.
function bizgoalsPeriodYear(level, period) {
  const pattern = { Annual: /^(\d{4})$/, H2: /^(\d{4})-H2$/, Quarterly: /^(\d{4})-Q[1-4]$/ }[level];
  const m = pattern ? String(period == null ? '' : period).trim().match(pattern) : null;
  return m ? Number(m[1]) : null;
}

// Goal payload. mode 'create': blanks are omitted, Title / GoalLevel / Period / OwnerEmail are required, GoalYear is taken
// from Period. mode 'update': only supplied columns, a blank clears (null; '' for text) except Title, level, period and
// owner, which cannot be blank. Level, Period and GoalYear travel together. Unknown keys, OwnerName and the stamp
// columns are dropped (the API sets them). Copies pdpCleanGoals / pdpCleanFields.
function bizgoalsCleanGoal(fields, mode) {
  if (mode !== 'create' && mode !== 'update') throw new Error('Business goal mode must be create or update');
  const f = fields || {}, C = CONFIG.BIZGOALS, W = 'Business goal ';
  const create = mode === 'create', out = {};
  if (create) ['Title', 'GoalLevel', 'Period', 'OwnerEmail'].forEach(c => { if (_bgBlank(f[c])) throw new Error(W + c + ' is required'); });
  const each = (col, make, blankValue) => {
    if (f[col] === undefined) return;
    if (_bgBlank(f[col])) {
      if (!create) out[col] = blankValue;
      return;
    }
    out[col] = make(String(W + col), f[col]);
  };
  const required = (col, make) => {
    if (f[col] === undefined) return;
    if (_bgBlank(f[col])) throw new Error(W + col + ' cannot be blank');
    out[col] = make(W + col, f[col]);
  };
  required('Title', (w, v) => _bgText(w, v, C.LIMITS.TITLE_MAX));
  each('WhyItMatters',    (w, v) => _bgText(w, v, C.LIMITS.TEXT_MAX), '');
  each('SuccessMeasures', (w, v) => _bgText(w, v, C.LIMITS.TEXT_MAX), '');
  each('TargetDate',      (w, v) => _bgDate(w, v), null);
  each('Rag',             (w, v) => _bgEnum(w, v, C.RAG), '');
  each('Status',          (w, v) => _bgEnum(w, v, C.GOAL_STATUS), '');
  each('ParentGoalID',    (w, v) => _bgWhole(w, v, 1), null);
  each('CarriedFromID',   (w, v) => _bgWhole(w, v, 1), null);
  required('OwnerEmail', (w, v) => { const e = _bgEmail(v); if (!_bgIsEmail(e)) throw new Error(w + ' is not an email address'); return e; });

  const hasPlace = ['GoalLevel', 'Period', 'GoalYear'].some(c => f[c] !== undefined);
  if (create || hasPlace) {
    ['GoalLevel', 'Period'].forEach(c => { if (_bgBlank(f[c])) throw new Error(W + c + ' is required with the level and period'); });
    const level = _bgEnum(W + 'GoalLevel', f.GoalLevel, C.GOAL_LEVELS);
    const period = String(f.Period).trim();
    const year = bizgoalsPeriodYear(level, period);
    if (year === null) throw new Error(W + 'Period ' + period + ' does not match level ' + level);
    if (year < C.LIMITS.YEAR_MIN || year > C.LIMITS.YEAR_MAX) throw new Error(W + 'GoalYear must be ' + C.LIMITS.YEAR_MIN + ' to ' + C.LIMITS.YEAR_MAX);
    if (!_bgBlank(f.GoalYear) && _bgWhole(W + 'GoalYear', f.GoalYear) !== year) throw new Error(W + 'GoalYear does not match Period ' + period);
    out.GoalLevel = level; out.Period = period; out.GoalYear = year;
  }
  return out;
}

// Action payload (BG-D12: GoalID is required on create and cannot be cleared). `nowIso` stamps DoneAt: IsDone true sets it,
// false clears it; a supplied DoneAt is ignored. Copies pdpCleanActions.
function bizgoalsCleanAction(fields, mode, nowIso) {
  if (mode !== 'create' && mode !== 'update') throw new Error('Business action mode must be create or update');
  const f = fields || {}, C = CONFIG.BIZGOALS, W = 'Business action ';
  const create = mode === 'create', out = {};
  if (create) ['Title', 'GoalID', 'OwnerEmail'].forEach(c => { if (_bgBlank(f[c])) throw new Error(W + c + ' is required'); });
  ['Title', 'GoalID', 'OwnerEmail'].forEach(c => { if (f[c] !== undefined && _bgBlank(f[c])) throw new Error(W + c + ' cannot be blank'); });
  if (f.Title !== undefined) out.Title = _bgText(W + 'Title', f.Title, C.LIMITS.TITLE_MAX);
  if (f.GoalID !== undefined) out.GoalID = _bgWhole(W + 'GoalID', f.GoalID, 1);
  if (f.OwnerEmail !== undefined) {
    const e = _bgEmail(f.OwnerEmail);
    if (!_bgIsEmail(e)) throw new Error(W + 'OwnerEmail is not an email address');
    out.OwnerEmail = e;
  }
  if (f.DueDate !== undefined) {
    if (!_bgBlank(f.DueDate)) out.DueDate = _bgDate(W + 'DueDate', f.DueDate);
    else if (!create) out.DueDate = null;
  }
  if (f.IsDone !== undefined) {
    const done = f.IsDone === true || f.IsDone === 'Yes' || f.IsDone === 'true' || f.IsDone === 1;
    out.IsDone = done;
    out.DoneAt = done ? (nowIso || null) : null;
    if (done && !nowIso) throw new Error(W + 'DoneAt needs the time it was ticked');
  }
  return out;
}

// Update entry payload (BG-D6, append-only: create only). Title is the goal id as text, a label never read for logic.
function bizgoalsCleanUpdate(fields) {
  const f = fields || {}, C = CONFIG.BIZGOALS, W = 'Business goal update ';
  if (_bgBlank(f.GoalID)) throw new Error(W + 'GoalID is required');
  if (_bgBlank(f.UpdateText) || !String(f.UpdateText).trim()) throw new Error(W + 'UpdateText is required');
  const goalId = _bgWhole(W + 'GoalID', f.GoalID, 1);
  const out = { Title: String(goalId), GoalID: goalId, UpdateText: _bgText(W + 'UpdateText', f.UpdateText, C.LIMITS.UPDATE_MAX) };
  if (!_bgBlank(f.RagAtUpdate)) out.RagAtUpdate = _bgEnum(W + 'RagAtUpdate', f.RagAtUpdate, C.RAG);
  if (!_bgBlank(f.StatusAtUpdate)) out.StatusAtUpdate = _bgEnum(W + 'StatusAtUpdate', f.StatusAtUpdate, C.GOAL_STATUS);
  return out;
}

// The who stamp the API adds to every write; callers can never supply it. -> { AddedByEmail?, ChangedByEmail }
function bizgoalsStamp(email, isCreate) {
  const e = _bgEmail(email);
  if (!_bgIsEmail(e)) throw new Error('A signed-in user is needed to change business goals');
  return isCreate ? { AddedByEmail: e, ChangedByEmail: e } : { ChangedByEmail: e };
}

// BG-D8 / open point 2: who can own a goal or action. Active admin rows of UserAssignments + every LeadershipAccess row,
// de-duplicated by lower-case email, minus CONFIG.BIZGOALS.OWNER_EXCLUDE. Named from UserName, else the email.
// -> [{ email, name }] by name. Same sources as onbAssigneeDirectory (onboarding-logic.js), without People.
function bizgoalsOwnerCandidates({ userRows = [], leadershipRows = [] } = {}) {
  const skip = new Set(CONFIG.BIZGOALS.OWNER_EXCLUDE.map(_bgEmail));
  const found = new Map();
  const add = row => {
    const email = row ? _bgEmail(row.UserEmail) : '';
    if (!_bgIsEmail(email) || skip.has(email)) return;
    const name = String(row.UserName == null ? '' : row.UserName).trim();
    const prev = found.get(email);
    if (!prev) found.set(email, { email, name: name || email, named: !!name });
    else if (!prev.named && name) { prev.name = name; prev.named = true; }
  };
  (userRows || []).forEach(r => { if (r && r.Active !== false && r.AssignedRole === CONFIG.ROLE_IDS.ADMIN) add(r); });
  (leadershipRows || []).forEach(add);
  return Array.from(found.values()).map(c => ({ email: c.email, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
}

// 'ok' = a current candidate, 'stale' = an owner who no longer has Admin / Leadership access, 'none' = no owner.
function bizgoalsOwnerState(email, candidates) {
  const e = _bgEmail(email);
  if (!e) return 'none';
  return (candidates || []).some(c => c.email === e) ? 'ok' : 'stale';
}

// Owner rule for a write: an unchanged owner always passes (a stale owner is kept); a changed or new owner must be a current
// candidate. -> { changed: false } | { changed: true, name } | { error }
function bizgoalsOwnerChange(currentEmail, nextEmail, candidates) {
  const next = _bgEmail(nextEmail);
  if (next && next === _bgEmail(currentEmail)) return { changed: false };
  const hit = (candidates || []).find(c => c.email === next);
  if (!hit) return { error: (next || 'That owner') + ' is not an Admin or Leadership user' };
  return { changed: true, name: String(hit.name).slice(0, CONFIG.BIZGOALS.LIMITS.OWNER_NAME_MAX) };
}

// What stops a goal being deleted: goals with it as parent and actions on it. -> { children, actions }
function bizgoalsDeleteBlockers(goalId, goals, actions) {
  const id = String(goalId);
  return {
    children: (goals || []).filter(g => g && g.ParentGoalID != null && String(g.ParentGoalID) === id).length,
    actions:  (actions || []).filter(a => a && a.GoalID != null && String(a.GoalID) === id).length,
  };
}
