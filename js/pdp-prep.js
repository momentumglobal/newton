// js/pdp-prep.js — pure rules for the employee's My Development page (N-438 / PDP-6)
//
// No DOM, no network. Depends on config.js (CONFIG.PDP), utils.js (spDateIn, addDaysISO, localDayISO),
// pdp-data.js (pdpJsonField, pdpParseJson, pdpTemplateForMeeting) and pdp-cycle.js (pdpMeetingState,
// pdpMeetingLabel, pdpCycleSummary). Loaded on people.html after pdp-cycle.js; not in CONFIG.MCP.scripts.
// PDP-D12 review (N-438): these rules shape one person's meeting records, so the file is on the
// PDP-D12 allowlist (tests/assert-pdp-access.js). Writes happen only in api-pdp.js.

const _PDPP_LOCKED = ['Held', 'SignedOff', 'Skipped'];

function _pdpPDay(today) { return typeof today === 'string' ? today : localDayISO(today || new Date()); }
function _pdpPText(v) { return String(v == null ? '' : v).trim(); }
function _pdpPYes(v) { return v === true || v === 1 || v === 'Yes' || v === '1' || v === 'true'; }

// When the employee's prep opens and whether it is editable today.
//   state 'locked'  Held / SignedOff / Skipped
//   state 'open'    today is on or after opensOn (an overdue meeting stays open until Held)
//   state 'closed'  before opensOn
// opensOn ('YYYY-MM-DD'):
//   Quarterly with a MeetingDate  that date minus PREP_LEAD_HOURS (whole days)
//   joiner goal setting           DueDate minus JOINER_DUE_DAYS (the day they joined)
//   anything else                 the 1st of the Period month (Quarterly with no MeetingDate falls back here)
function pdpPrepWindow(meeting, today) {
  const t = _pdpPDay(today);
  const m = meeting || {};
  if (_PDPP_LOCKED.includes(m.Status)) return { state: 'locked', opensOn: '' };
  const lead = Math.round(CONFIG.PDP.ME.PREP_LEAD_HOURS / 24);
  const meetingDate = spDateIn(m.MeetingDate);
  const due = spDateIn(m.DueDate);
  let opensOn = '';
  if (m.MeetingType === 'Quarterly' && meetingDate && !_pdpPYes(m.IsJoiner)) opensOn = addDaysISO(meetingDate, -lead);
  else if (_pdpPYes(m.IsJoiner) && due) opensOn = addDaysISO(due, -CONFIG.PDP.CYCLE.JOINER_DUE_DAYS);
  else if (/^\d{4}-\d{2}$/.test(String(m.Period || ''))) opensOn = m.Period + '-01';
  else if (due) opensOn = due.slice(0, 8) + '01';
  return { state: opensOn && t >= opensOn ? 'open' : 'closed', opensOn };
}

// The blocks of a template Definition that matter to the employee page, in order, each with its
// section title. employee = what the employee fills in (prepQuestion / goalReview by employee);
// manager = manager pre-work (hidden until Held); meeting = everything discussed in the room.
function pdpPrepBlocks(definition) {
  const out = { employee: [], manager: [], meeting: [] };
  const sections = (definition && Array.isArray(definition.sections)) ? definition.sections : [];
  sections.forEach(s => {
    (Array.isArray(s.blocks) ? s.blocks : []).forEach(b => {
      if (!b || !b.key) return;
      const row = Object.assign({}, b, { sectionKey: s.key, sectionTitle: s.title });
      const mine = (b.type === 'prepQuestion' || b.type === 'goalReview') && b.by === 'employee';
      if (mine) out.employee.push(row);
      else if (b.type === 'prepQuestion' && b.by === 'manager') out.manager.push(row);
      else out.meeting.push(row);
    });
  });
  return out;
}

// Stored PrepEmployee text -> { schema, answers, goalReview, savedAt, submittedAt }. Never throws.
function pdpPrepFromJson(text) {
  const raw = pdpParseJson(text);
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    schema: 1,
    answers: o.answers && typeof o.answers === 'object' && !Array.isArray(o.answers) ? Object.assign({}, o.answers) : {},
    goalReview: o.goalReview && typeof o.goalReview === 'object' && !Array.isArray(o.goalReview) ? Object.assign({}, o.goalReview) : {},
    savedAt: _pdpPText(o.savedAt),
    submittedAt: _pdpPText(o.submittedAt),
  };
}

// The object to store. prev = pdpPrepFromJson(old); edit = { answers, goalReview, submit };
// blocks = pdpPrepBlocks(...).employee. Only keys of employee blocks survive; text is trimmed and
// capped; a RAG must be in CONFIG.PDP.RAG. submittedAt is kept on a draft save and set on submit.
function pdpPrepPayload(prev, edit, blocks, nowIso) {
  const e = edit || {};
  const cap = CONFIG.PDP.TEMPLATE_LIMITS.LABEL_MAX * 10;
  const answers = {}, goalReview = {};
  (blocks || []).forEach(b => {
    if (b.type === 'prepQuestion') {
      const v = _pdpPText(e.answers && e.answers[b.key]);
      if (v) answers[b.key] = v.slice(0, cap);
    } else if (b.type === 'goalReview') {
      const src = (e.goalReview && e.goalReview[b.key]) || {};
      const goals = {};
      Object.keys(src).forEach(id => {
        if (!/^\d+$/.test(id)) return;
        const rag = _pdpPText(src[id] && src[id].rag);
        const comment = _pdpPText(src[id] && src[id].comment).slice(0, cap);
        if (rag && !CONFIG.PDP.RAG.includes(rag)) throw new Error('Unknown RAG value: ' + rag);
        if (rag || comment) goals[id] = { rag, comment };
      });
      if (Object.keys(goals).length) goalReview[b.key] = goals;
    }
  });
  const p = pdpPrepFromJson(prev ? JSON.stringify(prev) : '');
  const out = { schema: 1, answers, goalReview, savedAt: nowIso };
  const submittedAt = e.submit ? nowIso : p.submittedAt;
  if (submittedAt) out.submittedAt = submittedAt;
  pdpJsonField(out);   // throws when over CONFIG.PDP.JSON_MAX_CHARS
  return out;
}

// Labels of required employee blocks that are still blank (whitespace counts as blank).
function pdpPrepMissing(blocks, prep) {
  const p = prep || {};
  return (blocks || []).filter(b => {
    if (!b.required) return false;
    if (b.type === 'prepQuestion') return !_pdpPText(p.answers && p.answers[b.key]);
    if (b.type === 'goalReview') {
      const g = p.goalReview && p.goalReview[b.key];
      return !g || !Object.keys(g).length;
    }
    return false;
  }).map(b => b.label);
}

// The meeting patch for a prep save. First save moves Planned -> PrepOpen and, only then, binds a
// newer active Published template of the type (N-437 hand-off). PrepOpen is never re-bound.
function pdpMeetingPatchForPrep(meeting, activeTemplate, payload, nowIso) {
  const m = meeting || {};
  const patch = { PrepEmployee: JSON.stringify(payload) };
  if (m.Status === 'Planned') {
    patch.Status = 'PrepOpen';
    const t = activeTemplate;
    if (t && t.id != null && Number(t.VersionNo) > Number(m.TemplateVersion || 0) && t.MeetingType === m.MeetingType) {
      patch.TemplateID = Number(t.id);
      patch.TemplateVersion = Number(t.VersionNo);
    }
  }
  return patch;
}

// Sign-off rule shared by the employee page and (N-439) the manager screen.
// party 'employee' | 'manager' -> { ok, reason, patch }. Only a Held meeting can be signed, once per
// party; the second signature also moves Status to SignedOff.
function pdpSignOffPlan(meeting, party, nowIso) {
  const m = meeting || {};
  const col = party === 'employee' ? 'EmployeeSignedAt' : party === 'manager' ? 'ManagerSignedAt' : '';
  const other = party === 'employee' ? 'ManagerSignedAt' : 'EmployeeSignedAt';
  if (!col) return { ok: false, reason: 'Unknown signer.', patch: null };
  if (m.Status !== 'Held') return { ok: false, reason: m.Status === 'SignedOff' ? 'This meeting is already signed off.' : 'The meeting has to be held before it can be signed.', patch: null };
  if (_pdpPText(m[col])) return { ok: false, reason: 'You have already signed this meeting.', patch: null };
  const patch = {};
  patch[col] = nowIso;
  if (_pdpPText(m[other])) patch.Status = 'SignedOff';
  return { ok: true, reason: '', patch };
}

// One card per meeting, earliest due first.
function pdpMyTimeline(meetings, today) {
  const t = _pdpPDay(today);
  return (meetings || []).slice().sort((a, b) => String(spDateIn(a.DueDate)).localeCompare(String(spDateIn(b.DueDate)))).map(m => {
    const win = pdpPrepWindow(m, t);
    const prep = pdpPrepFromJson(m.PrepEmployee);
    return {
      id: m.id,
      label: pdpMeetingLabel(m),
      meetingType: m.MeetingType,
      period: m.Period,
      due: spDateIn(m.DueDate),
      state: pdpMeetingState(m, t),
      status: m.Status,
      window: win.state,
      opensOn: win.opensOn,
      submitted: !!prep.submittedAt,
      employeeSigned: !!_pdpPText(m.EmployeeSignedAt),
      managerSigned: !!_pdpPText(m.ManagerSignedAt),
      skipReason: m.Status === 'Skipped' ? _pdpPText(m.SkipReason) : '',
    };
  });
}

// Read-only view of a held meeting: discussion answers by block key (MeetingNotes JSON, shape owned by
// N-439; absent or malformed reads as empty), the goals and actions linked to the meeting.
function pdpMyAgreedRecord(meeting, goals, actions) {
  const m = meeting || {};
  const notes = pdpParseJson(m.MeetingNotes);
  const answers = notes && typeof notes === 'object' && notes.answers && typeof notes.answers === 'object' ? notes.answers : {};
  const id = String(m.id);
  return {
    answers,
    managerPrep: (() => { const p = pdpParseJson(m.PrepManager); return p && typeof p === 'object' && p.answers && typeof p.answers === 'object' ? p.answers : {}; })(),
    goals: (goals || []).filter(g => String(g.MeetingID) === id),
    actions: (actions || []).filter(a => String(a.MeetingID) === id),
  };
}