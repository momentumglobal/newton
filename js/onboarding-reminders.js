// js/onboarding-reminders.js — pure rules for onboarding owner reminders (N-503 / ONB-8, epic N-482)
//
// No DOM, no network. Depends on config.js (CONFIG.ONBOARDING.REMINDERS), utils.js (localDayISO, spDateIn),
// checklist-logic.js (activeChecklistItems, resolveChecklistProgress) and onboarding-logic.js (_onbEmail, onbRelations,
// onbPlanParties, onbStepOwner, onbStepDue, onbStepVisible, onbIsLibraryStep). Loaded on my-momentum.html straight after
// onboarding-team.js; not in CONFIG.MCP.scripts. Reads, writes and clearing happen in api-onboarding.js (runOnboardingReminders);
// this file only decides what to send. Pattern: pdp-reminders.js.
//
// Reminders go to the person a step RESOLVES to (ONB-D79), never to someone who merely may tick it: the relation is read with a
// blank role so an Admin who is not the joiner's LM / CSD / buddy gets nothing. Bodies are fixed text plus a count (ONB-D76): the
// Notifications list is readable by everyone, so never a name, email or step label.

const _ONBR_PARTIES = ['employee', 'lm', 'csd', 'buddy', 'assignee'];   // N-520: an assignee is reminded too (ONB-D115)

function _onbrDay(today) { return typeof today === 'string' ? today : localDayISO(today || new Date()); }

// One digest per person, per type, per day: onb:<type>:<lower email>:<YYYY-MM-DD>.
function onbReminderKey(type, email, today) {
  return CONFIG.ONBOARDING.REMINDERS.KEY_PREFIX + ':' + type + ':' + _onbEmail(email) + ':' + _onbrDay(today);
}

// Fixed wording from CONFIG plus a count. Nothing from a record ever reaches the text.
function onbReminderBody(type, n) {
  const T = CONFIG.ONBOARDING.REMINDERS.TEXT[type];
  return n === 1 ? T.one : T.many.replace('{n}', String(n));
}

// The Active plans this person is the joiner, line manager, CSD, buddy or (N-520) a step assignee of: the only plans whose progress is
// worth reading. -> [{ plan, relations: Set }]. Role is deliberately blank (ONB-D79). assignments = OnboardingStepAssignments rows (optional).
function onbReminderPlans({ plans = [], people = [], email = '', peopleOpsActive = false, assignments = [] } = {}) {
  const out = [];
  (plans || []).forEach(plan => {
    if (!plan || plan.Status !== CONFIG.ONBOARDING.PLAN_ACTIVE) return;
    const relations = onbRelations({ plan, people, email, role: '', peopleOpsActive, assignments });
    if (_ONBR_PARTIES.some(r => relations.has(r))) out.push({ plan, relations });
  });
  return out;
}

// What to send the signed-in user today.
//   opts: { gate, email, today, plans, people, templates, progressByPlan, peopleOpsActive, assignments }   (N-520: assignments optional)
//   progressByPlan: { [plan.id]: ChecklistProgress rows for that plan's person }
//   -> { send: [{ type, n, key, body, link, tone }], keep: [key] }
// Only a live gate sends (Off gives Admin a preview, everyone else none; Pilot and On are both live, ONB-D75). A step counts when it is
// on an Active plan, active, not a Library step, not ticked, has a due date, is visible to this viewer, and resolves to this person
// (a step with no named person, Ops or People Ops once someone holds the role, never reminds: ONB-D78). Due today = due; before today
// = overdue (ONB-D77). A step counts once per plan however many parts the person plays.
function onbReminderPlan(opts) {
  const o = opts || {};
  const R = CONFIG.ONBOARDING.REMINDERS;
  const none = { send: [], keep: [] };
  if (!o.gate || o.gate.state !== 'live') return none;
  const me = _onbEmail(o.email);
  if (!me) return none;
  const today = _onbrDay(o.today);
  const counts = { due: 0, overdue: 0 };
  const where = { own: false, team: false, buddy: false };
  const aIndex = onbAssignmentIndex(o.assignments || []);   // N-520: a reassigned step reminds its assignee, not its template owner
  onbReminderPlans({ plans: o.plans, people: o.people, email: me, peopleOpsActive: o.peopleOpsActive, assignments: aIndex }).forEach(({ plan, relations }) => {
    const parties = onbPlanParties(plan, o.people);
    const startDate = parties.employee ? (spDateIn(parties.employee.StartDate) || '') : '';
    const progress = resolveChecklistProgress((o.progressByPlan || {})[String(plan.id)] || []);
    activeChecklistItems(o.templates, CONFIG.ONBOARDING.RECORD_TYPE, plan.Track).forEach(step => {
      if (onbIsLibraryStep(step)) return;
      const p = progress.get(String(step.ItemKey == null ? '' : step.ItemKey));
      if (p && p.done) return;
      const due = onbStepDue(startDate, step);
      if (!due || due > today) return;
      if (!onbStepVisible({ step, relations, startDate, todayISO: today })) return;
      const assignee = onbStepAssignee({ step, plan, assignments: aIndex, people: o.people });
      const owner = onbStepOwner({ step, parties, peopleOpsActive: o.peopleOpsActive === true, assignee });
      if (!owner.person || _onbEmail(owner.person.WorkEmail) !== me) return;
      counts[due === today ? 'due' : 'overdue']++;
      where[owner.reassigned ? 'team' : (relations.has('employee') ? 'own' : (owner.key === 'Buddy' ? 'buddy' : 'team'))] = true;
    });
  });
  const link = where.own ? R.LINKS.MY : (where.team ? R.LINKS.TEAM : R.LINKS.BUDDY);   // ONB-D83
  const send = [];
  [[R.TYPES.DUE, counts.due], [R.TYPES.OVERDUE, counts.overdue]].forEach(([type, n]) => {
    if (n > 0) send.push({ type, n, key: onbReminderKey(type, me, today), body: onbReminderBody(type, n), link, tone: R.TONE });
  });
  return { send, keep: send.map(s => s.key) };
}
