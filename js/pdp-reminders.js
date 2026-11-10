// js/pdp-reminders.js — pure rules for PDP reminders (N-441 / PDP-9)
//
// No DOM, no network. Depends on config.js (CONFIG.PDP.REMINDERS), utils.js (spDateIn, addDaysISO,
// localDayISO), pdp-identity.js (_pdpEmail, _pdpYes, pdpNormaliseMode, pdpNormaliseRemindersFrom),
// pdp-data.js (pdpTemplateForMeeting, pdpParseJson), pdp-cycle.js (pdpMeetingState) and pdp-prep.js
// (pdpPrepWindow, pdpPrepBlocks, pdpPrepFromJson). Loaded on people.html straight after pdp-prep.js;
// not in CONFIG.MCP.scripts. Reads, writes and clearing happen in api-pdp.js (runPdpReminders); this
// file only decides what to send.
//
// Reminders exist only while the PDP switch is On: the pilot group gets none (Chris, 10 Nov 2026).
// The Notifications list is readable by every signed-in user, so a body is fixed text plus a count,
// never a name, goal, action text, score, note or meeting type (N-435 rule 7).

const _PDPR_OPEN = ['Planned', 'PrepOpen'];

function _pdprDay(today) { return typeof today === 'string' ? today : localDayISO(today || new Date()); }

// One digest per person, per type, per calendar month: pdp:<type>:<lower email>:<YYYY-MM>.
function pdpReminderKey(type, email, today) {
  return CONFIG.PDP.REMINDERS.KEY_PREFIX + ':' + type + ':' + _pdpEmail(email) + ':' + _pdprDay(today).slice(0, 7);
}

// Fixed wording from CONFIG plus a count. Nothing from a record ever reaches the text.
function pdpReminderBody(type, n) {
  const T = CONFIG.PDP.REMINDERS.TEXT[type];
  return n === 1 ? T.one : T.many.replace('{n}', String(n));
}

// What to send the signed-in user today.
//   opts: { mode, email, today, from, meetings, actions, templates }
//   meetings / actions: the records the user may see (the caller filters with pdpVisibleItems)
//   -> { send: [{ type, n, key, body, link, tone }], keep: [key] }
// Only Off -> nothing, Pilot -> nothing, On -> the three digests below. A reminder concerns a person
// only through an exact email match on the record itself (employee, line manager, CSD, action owner),
// never because the user is Admin / People Ops. A meeting or action due before `from` never counts.
function pdpReminderPlan(opts) {
  const R = CONFIG.PDP.REMINDERS, TY = R.TYPES;
  const o = opts || {};
  const none = { send: [], keep: [] };
  if (pdpNormaliseMode(o.mode) !== CONFIG.PDP.MODES[2]) return none;
  const me = _pdpEmail(o.email);
  if (!me) return none;
  const today = _pdprDay(o.today);
  const from = pdpNormaliseRemindersFrom(o.from);
  const mine = v => _pdpEmail(v) === me;
  const dueOf = r => spDateIn(r && r.DueDate);
  const counted = r => { const d = dueOf(r); return !!d && d >= from; };
  const meetings = (o.meetings || []).filter(m => m && counted(m));
  const send = [];
  const add = (type, n, link) => {
    if (n > 0) send.push({ type, n, key: pdpReminderKey(type, me, today), body: pdpReminderBody(type, n), link, tone: 'attention' });
  };

  // Prep due soon (the employee): the template has employee prep, the prep window is open, nothing
  // submitted yet, and the meeting is due within PREP_REMIND_DAYS. An overdue meeting is the overdue digest's.
  const soon = addDaysISO(today, R.PREP_REMIND_DAYS);
  const prepN = meetings.filter(m => {
    if (!mine(m.PersonEmail) || !_PDPR_OPEN.includes(m.Status)) return false;
    if (pdpMeetingState(m, today) === 'overdue' || dueOf(m) > soon) return false;
    if (pdpPrepWindow(m, today).state !== 'open') return false;
    if (pdpPrepFromJson(m.PrepEmployee).submittedAt) return false;
    const tpl = pdpTemplateForMeeting(o.templates, m);
    const def = tpl ? pdpParseJson(tpl.Definition) : null;
    return !!def && pdpPrepBlocks(def).employee.length > 0;
  }).length;
  add(TY.PREP, prepN, R.LINKS.MY);

  // Overdue meetings (employee, line manager, CSD). Held, signed-off and skipped meetings are never overdue.
  const late = meetings.filter(m => (mine(m.PersonEmail) || mine(m.LineManagerEmail) || mine(m.CSDEmail)) && pdpMeetingState(m, today) === 'overdue');
  add(TY.OVERDUE, late.length, late.some(m => mine(m.LineManagerEmail) || mine(m.CSDEmail)) ? R.LINKS.TEAM : R.LINKS.MY);

  // Actions the user owns that are not done and are due within ACTION_REMIND_DAYS (overdue included).
  const actionSoon = addDaysISO(today, R.ACTION_REMIND_DAYS);
  const actionN = (o.actions || []).filter(a => a && mine(a.OwnerEmail) && !_pdpYes(a.IsDone) && counted(a) && dueOf(a) <= actionSoon).length;
  add(TY.ACTION, actionN, R.LINKS.MY);

  return { send, keep: send.map(s => s.key) };
}