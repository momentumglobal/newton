// js/pdp-team.js — pure rules for the Team Development page (N-439 / PDP-7)
//
// No DOM, no network. Depends on config.js (CONFIG.PDP), utils.js (spDateIn, localDayISO, isoDate),
// pdp-identity.js (pdpAccessFor, pdpInScope, pdpEmailIndex), pdp-data.js (pdpJsonField, pdpParseJson,
// pdpPrepBlocks callers, pdpNameByEmail, pdpClean*), pdp-cycle.js (pdpCycleSummary, pdpMeetingState,
// pdpMeetingLabel) and pdp-prep.js (pdpPrepBlocks, pdpPrepFromJson, pdpSignOffPlan). Loaded on people.html
// after pdp-prep.js; not in CONFIG.MCP.scripts. PDP-D12 review (N-439): these rules shape the personal
// records a line manager or CSD works with, so the file is on the PDP-D12 allowlist
// (tests/assert-pdp-access.js). Writes happen only in api-pdp.js.

const _PDPT_OPEN_STATUS = ['Planned', 'PrepOpen'];

function _pdptText(v) { return String(v == null ? '' : v).trim(); }
function _pdptDay(today) { return typeof today === 'string' ? today : localDayISO(today || new Date()); }
function _pdptJson(text) { const o = pdpParseJson(text); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
function _pdptAnswers(o) { return o && o.answers && typeof o.answers === 'object' && !Array.isArray(o.answers) ? o.answers : {}; }
function _pdptCap() { return CONFIG.PDP.TEMPLATE_LIMITS.LABEL_MAX * 10; }

// What `myEmail` (with `role`) may do with one meeting-shaped record: { view, run, as }.
// `view` = pdpAccessFor allows any access. `run` = the email is the record's own LineManagerEmail or
// CSDEmail and is not the person themselves, REGARDLESS of role: a CSD holds the Newton role Admin, so
// pdpAccessFor calls them 'admin' for every record, which says nothing about whose meeting they run.
function pdpTeamAccess(role, myEmail, meeting) {
  const none = { view: false, run: false, as: null };
  const base = pdpAccessFor(role, myEmail, meeting);
  if (!base.level) return none;
  const me = _pdpEmail(myEmail);
  if (me && me === _pdpEmail(meeting.PersonEmail)) return { view: true, run: false, as: 'self' };
  if (me && me === _pdpEmail(meeting.LineManagerEmail)) return { view: true, run: true, as: 'lm' };
  if (me && me === _pdpEmail(meeting.CSDEmail)) return { view: true, run: true, as: 'csd' };
  return { view: true, run: false, as: base.as };
}

// The views the signed-in user may switch between: 'tree' (a CSD: everyone under them), 'reports' (people
// whose ReportsTo is me), 'all' (Admin / People Ops, read-only for records that are not theirs).
function pdpTeamScope(identity, role) {
  const id = identity || {};
  const views = [];
  if (id.me && id.me.Level === CONFIG.PDP.REVIEWER_LEVEL) views.push('tree');
  if (id.me && (id.directReports || []).length) views.push('reports');
  if (roleCan(role, 'pdpAdmin')) views.push('all');
  return { views, default: views[0] || '' };
}

// Attention flag of one team row, most urgent first (CONFIG.PDP.TEAM.ATTENTION_ORDER).
function pdpAttention(row) {
  if (!row || row.noMeetings) return 'none';
  const s = row.summary || {};
  if (s.overdue > 0) return 'overdue';
  if (row.toSign) return 'sign';
  if (row.prepReady) return 'prep';
  if (s.due > 0) return 'due';
  if (s.total > 0 && s.done + s.skipped === s.total) return 'done';
  return 'upcoming';
}

// One row per person in `view`. Membership comes from the meeting records' own snapshots
// (LineManagerEmail / CSDEmail), so a re-pointed person follows their new manager; the People tree only
// adds in-scope people who have no meetings yet. meetings = already filtered through pdpVisibleItems.
function pdpTeamRows(input) {
  const i = input || {};
  const today = _pdptDay(i.today);
  const scopeDay = typeof i.today === 'string' ? new Date(i.today + 'T12:00:00Z') : (i.today || new Date());
  const me = _pdpEmail(i.myEmail);
  const people = i.people || [];
  const idn = i.identity || {};
  const view = i.view;
  const mine = m => {
    if (view === 'all') return true;
    const lm = _pdpEmail(m.LineManagerEmail), csd = _pdpEmail(m.CSDEmail);
    return view === 'tree' ? (lm === me || csd === me) : lm === me;
  };
  const byPerson = new Map();
  (i.meetings || []).filter(mine).forEach(m => {
    const k = String(m.PersonID);
    if (!byPerson.has(k)) byPerson.set(k, []);
    byPerson.get(k).push(m);
  });
  let expected;
  if (view === 'reports') expected = idn.directReports || [];
  else if (view === 'tree') expected = (idn.csdTree || []).map(t => t.person);
  else expected = people;
  expected = expected.filter(p => pdpInScope(p, scopeDay));
  const byId = new Map(people.map(p => [String(p.id), p]));
  const depth = new Map((idn.csdTree || []).map(t => [String(t.person.id), t.depth]));
  const ids = new Set(byPerson.keys());
  expected.forEach(p => ids.add(String(p.id)));

  const rows = [];
  ids.forEach(id => {
    const ms = (byPerson.get(id) || []).slice();
    const p = byId.get(id) || {};
    const first = ms[0] || {};
    const summary = pdpCycleSummary(ms, today);
    const held = ms.filter(m => m.Status === 'Held');
    const unsigned = held.find(m => !_pdptText(m.ManagerSignedAt));
    const focus = unsigned || summary.next;
    const row = {
      personId: id,
      name: p.EmployeeName || first.PersonName || '—',
      level: p.Level || '',
      title: p.Title || '',
      lmName: pdpNameByEmail(people, p.ReportsTo || first.LineManagerEmail),
      depth: depth.get(id) || 0,
      summary,
      toSign: !!unsigned,
      waitingOnEmployee: held.some(m => _pdptText(m.ManagerSignedAt) && !_pdptText(m.EmployeeSignedAt)),
      prepReady: ms.some(m => _PDPT_OPEN_STATUS.includes(m.Status) && !!pdpPrepFromJson(m.PrepEmployee).submittedAt),
      noMeetings: ms.length === 0,
      canRun: ms.some(m => pdpTeamAccess(i.role, i.myEmail, m).run),
      next: focus ? {
        id: focus.id, label: pdpMeetingLabel(focus), meetingType: focus.MeetingType, status: focus.Status,
        due: spDateIn(focus.DueDate), meetingDate: spDateIn(focus.MeetingDate) || '', state: pdpMeetingState(focus, today),
        canRun: pdpTeamAccess(i.role, i.myEmail, focus).run,
      } : null,
      meetings: ms,
    };
    row.attention = pdpAttention(row);
    rows.push(row);
  });
  const order = CONFIG.PDP.TEAM.ATTENTION_ORDER;
  const rank = r => { const k = order.indexOf(r.attention); return k < 0 ? order.length : k; };
  return rows.sort((a, b) => (rank(a) - rank(b)) || String(a.name).localeCompare(String(b.name)));
}

// Chip counts for the header.
function pdpTeamTotals(rows) {
  const t = { people: 0, overdue: 0, due: 0, prepReady: 0, toSign: 0, noMeetings: 0 };
  (rows || []).forEach(r => {
    t.people++;
    t.overdue += (r.summary && r.summary.overdue) || 0;
    t.due += (r.summary && r.summary.due) || 0;
    if (r.prepReady) t.prepReady++;
    if (r.toSign) t.toSign++;
    if (r.noMeetings) t.noMeetings++;
  });
  return t;
}

// What was agreed before this meeting: the nearest earlier Held / SignedOff meeting of the same person by
// DueDate (crosses the year boundary; Skipped ignored), the actions still open from it or any earlier
// meeting plus its own done actions, and the person's open goals. Empty for a first meeting.
function pdpPreviousCommitments(meeting, personMeetings, goals, actions) {
  const m = meeting || {};
  const due = spDateIn(m.DueDate) || '';
  const dueOf = x => String(spDateIn(x.DueDate) || '');
  const prior = (personMeetings || [])
    .filter(x => String(x.id) !== String(m.id) && ['Held', 'SignedOff'].includes(x.Status) && dueOf(x) < due)
    .sort((a, b) => dueOf(b).localeCompare(dueOf(a)));
  const prev = prior[0];
  if (!prev) return { meeting: null, actions: [], goals: [] };
  const earlier = new Set((personMeetings || []).filter(x => dueOf(x) <= dueOf(prev)).map(x => String(x.id)));
  const acts = (actions || []).filter(a => {
    const done = _pdpYes(a.IsDone);
    if (String(a.MeetingID) === String(prev.id)) return true;     // the previous meeting's own, done or not
    return !done && earlier.has(String(a.MeetingID));              // still open from an earlier one
  });
  const open = (goals || []).filter(g => (g.Status || 'Open') === 'Open' && String(g.MeetingID) !== String(m.id));
  return { meeting: prev, actions: acts, goals: open };
}

// 'open' (Planned / PrepOpen / Held with no signature) | 'signed' (any signature, or SignedOff) | 'skipped'.
function pdpManagerLock(meeting) {
  const m = meeting || {};
  if (m.Status === 'Skipped') return 'skipped';
  if (m.Status === 'SignedOff' || _pdptText(m.EmployeeSignedAt) || _pdptText(m.ManagerSignedAt)) return 'signed';
  return 'open';
}

// The goalSet block's limits for this meeting (a joiner uses CONFIG.PDP.CYCLE.JOINER_GOALS), or null when
// the template has no goal block (Monthly).
function pdpGoalLimit(meeting, def) {
  const sections = (def && Array.isArray(def.sections)) ? def.sections : [];
  let block = null;
  sections.forEach(s => (Array.isArray(s.blocks) ? s.blocks : []).forEach(b => { if (!block && b && b.type === 'goalSet') block = b; }));
  if (!block) return null;
  if (_pdpYes(meeting && meeting.IsJoiner)) return { min: CONFIG.PDP.CYCLE.JOINER_GOALS.min, max: CONFIG.PDP.CYCLE.JOINER_GOALS.max, key: block.key };
  return { min: Number(block.min) || 0, max: Number(block.max) || CONFIG.PDP.TEMPLATE_LIMITS.GOALS_MAX, key: block.key };
}

// The actions block's cap, or null when the template has none.
function pdpActionLimit(def) {
  const sections = (def && Array.isArray(def.sections)) ? def.sections : [];
  let block = null;
  sections.forEach(s => (Array.isArray(s.blocks) ? s.blocks : []).forEach(b => { if (!block && b && b.type === 'actions') block = b; }));
  return block ? { max: Number(block.max) || CONFIG.PDP.TEMPLATE_LIMITS.ACTIONS_MAX, key: block.key } : null;
}

// The manager-side objects to store. prevPrep / prevNotes = the stored JSON text; edit = { prepManager:
// { key: text }, notes: { key: text } }; blocks = pdpPrepBlocks(def). Only manager prepQuestion keys and
// prompt keys survive; text is trimmed and capped; a key missing from the edit keeps its stored answer;
// heldBy / heldAt / managerSignedBy are carried over. Throws over CONFIG.PDP.JSON_MAX_CHARS.
function pdpManagerPayload(prevPrep, prevNotes, edit, blocks, nowIso) {
  const e = edit || {}, b = blocks || { manager: [], meeting: [] };
  const pp = _pdptJson(prevPrep), pn = _pdptJson(prevNotes);
  const cap = _pdptCap();
  const build = (keys, src, prevAns) => {
    const out = {};
    keys.forEach(k => {
      const has = src && Object.prototype.hasOwnProperty.call(src, k);
      const v = _pdptText(has ? src[k] : prevAns[k]);
      if (v) out[k] = v.slice(0, cap);
    });
    return out;
  };
  const schema = CONFIG.PDP.TEAM.NOTES_SCHEMA;
  const prepKeys = (b.manager || []).filter(x => x.type === 'prepQuestion').map(x => x.key);
  const promptKeys = (b.meeting || []).filter(x => x.type === 'prompt').map(x => x.key);
  const prepManager = { schema, answers: build(prepKeys, e.prepManager, _pdptAnswers(pp)), savedAt: nowIso };
  const notes = { schema, answers: build(promptKeys, e.notes, _pdptAnswers(pn)), savedAt: nowIso };
  ['heldBy', 'heldAt', 'managerSignedBy'].forEach(k => { if (_pdptText(pn[k])) notes[k] = _pdptText(pn[k]); });
  pdpJsonField(prepManager);   // throws when over CONFIG.PDP.JSON_MAX_CHARS
  pdpJsonField(notes);
  return { prepManager, notes };
}

// Can this meeting be marked Held? problems block it, warnings only ask for a confirm.
// prepManager / notes = the payload objects (pdpManagerPayload); goals / actions = the person's rows
// (filtered here to this meeting); meetingDate = the date being set ('' = stored date, else today).
function pdpHeldCheck(meeting, def, prepManager, notes, goals, actions, meetingDate, today) {
  const m = meeting || {};
  const t = _pdptDay(today);
  const problems = [], warnings = [];
  if (!_PDPT_OPEN_STATUS.includes(m.Status)) problems.push(m.Status === 'Held' ? 'This meeting is already held.' : 'This meeting cannot be marked as held.');
  else if (pdpManagerLock(m) !== 'open') problems.push('This record is signed and locked.');
  const day = spDateIn(meetingDate) || spDateIn(m.MeetingDate) || t;
  if (day > t) problems.push('The meeting date cannot be in the future.');
  const blocks = pdpPrepBlocks(def);
  const pa = _pdptAnswers(prepManager), na = _pdptAnswers(notes);
  blocks.manager.filter(b => b.type === 'prepQuestion' && b.required && !_pdptText(pa[b.key])).forEach(b => problems.push('Answer: ' + b.label));
  blocks.meeting.filter(b => b.type === 'prompt' && b.required && !_pdptText(na[b.key])).forEach(b => problems.push('Answer: ' + b.label));
  const id = String(m.id);
  const mg = (goals || []).filter(g => String(g.MeetingID) === id);
  const ma = (actions || []).filter(a => String(a.MeetingID) === id);
  const gl = pdpGoalLimit(m, def);
  if (gl && mg.length < gl.min) problems.push('Record at least ' + gl.min + ' goal' + (gl.min === 1 ? '' : 's') + '.');
  if (ma.some(a => !_pdptText(a.OwnerRole) || !_pdptText(a.OwnerEmail) || !spDateIn(a.DueDate))) problems.push('Every action needs an owner and a due date.');
  if (blocks.employee.length && !pdpPrepFromJson(m.PrepEmployee).submittedAt) warnings.push('The employee has not marked their prep ready.');
  if (pdpActionLimit(def) && !ma.length) warnings.push('No actions are recorded.');
  return { ok: !problems.length, problems, warnings };
}

// The patch for a manager-side write. `fields` are the columns the caller wants written. The first touch
// of a Planned meeting (by either side) sets Status PrepOpen (unless the caller sets Status) and re-binds
// to a newer Published template of the same type, exactly like pdpMeetingPatchForPrep; PrepOpen / Held
// meetings are never re-bound.
function pdpMeetingPatchForManager(meeting, activeTemplate, fields, nowIso) {
  const m = meeting || {};
  const patch = Object.assign({}, fields);
  if (m.Status === 'Planned') {
    if (!patch.Status) patch.Status = 'PrepOpen';
    const t = activeTemplate;
    if (t && t.id != null && Number(t.VersionNo) > Number(m.TemplateVersion || 0) && t.MeetingType === m.MeetingType) {
      patch.TemplateID = Number(t.id);
      patch.TemplateVersion = Number(t.VersionNo);
    }
  }
  return patch;
}

// The manager side of the shared sign-off rule (pdpSignOffPlan). On success the patch also records who
// signed in MeetingNotes (merged into the stored notes).
function pdpManagerSignPlan(meeting, byEmail, nowIso) {
  const plan = pdpSignOffPlan(meeting, 'manager', nowIso);
  if (!plan.ok) return plan;
  const notes = _pdptJson(meeting && meeting.MeetingNotes);
  notes.schema = CONFIG.PDP.TEAM.NOTES_SCHEMA;
  notes.managerSignedBy = _pdpEmail(byEmail);
  pdpJsonField(notes);
  return { ok: true, reason: '', patch: Object.assign({}, plan.patch, { MeetingNotes: notes }) };
}

function _pdptSnap(meeting) {
  const m = meeting || {};
  return { PersonID: Number(m.PersonID), PersonEmail: m.PersonEmail, LineManagerEmail: m.LineManagerEmail, CSDEmail: m.CSDEmail };
}

// Fields for a goal written from a meeting. mode 'create' | 'update'; the snapshot columns come from the
// MEETING record (never recomputed), so the access flow secures the goal for the same people.
function pdpGoalPayload(meeting, edit, mode) {
  const m = meeting || {}, e = edit || {};
  const cap = _pdptCap();
  const title = _pdptText(e.Title);
  if (!title) throw new Error('Give the goal a title.');
  if (!CONFIG.PDP.GOAL_CATEGORIES.includes(e.Category)) throw new Error('Pick a goal category.');
  const target = _pdptText(e.TargetDate);
  if (target && !isoDate(target)) throw new Error('The target date is not a valid date.');
  const f = {
    Title: title.slice(0, 250), Category: e.Category,
    WhyItMatters: _pdptText(e.WhyItMatters).slice(0, cap), SuccessMeasures: _pdptText(e.SuccessMeasures).slice(0, cap),
    Support: _pdptText(e.Support).slice(0, cap), TargetDate: target,
  };
  if (mode === 'create') {
    const level = CONFIG.PDP.TEAM.GOAL_LEVEL_BY_TYPE[m.MeetingType];
    if (!level) throw new Error('Goals are not set in this meeting.');
    Object.assign(f, _pdptSnap(m), { CycleYear: Number(m.CycleYear), GoalLevel: level, Period: pdpGoalPeriod(level, m.CycleYear, m.Period), MeetingID: Number(m.id), Status: 'Open' });   // N-440: schema Period (YYYY / YYYY-H2 / YYYY-Qn), not the meeting month
  }
  return pdpCleanGoals(f, mode);
}

// Fields for an action written from a meeting. Owner Employee = the person's email; Manager = the acting
// manager's email.
function pdpActionPayload(meeting, edit, byEmail, mode) {
  const m = meeting || {}, e = edit || {};
  const title = _pdptText(e.Title);
  if (!title) throw new Error('Give the action a title.');
  if (!CONFIG.PDP.OWNER_ROLES.includes(e.OwnerRole)) throw new Error('Pick who owns the action.');
  const due = _pdptText(e.DueDate);
  if (!due || !isoDate(due)) throw new Error('Give the action a due date.');
  const f = {
    Title: title.slice(0, 250), OwnerRole: e.OwnerRole,
    OwnerEmail: e.OwnerRole === 'Employee' ? m.PersonEmail : byEmail, DueDate: due,
  };
  if (mode === 'create') Object.assign(f, _pdptSnap(m), { MeetingID: Number(m.id), IsDone: false });
  return pdpCleanActions(f, mode);
}