// js/onboarding-logic.js — pure My Onboarding rules (N-496 / ONB-1, epic N-482). No network I/O, no DOM.
// Reads CONFIG.ONBOARDING (onboarding-config.js), CONFIG.CHECKLISTS and CONFIG.ROLE_IDS at call time.
// Reuses checklist-logic.js (spYesNo, normChecklistKey, isSafeChecklistUrl), pdp-identity.js
// (pdpResolveIdentity, pdpEmailIndex, pdpParsePilot, pdpIsEmail — identity and email-list helpers),
// people-logic.js (isDeployablePerson) and utils.js (spDateIn, isoDate); loads after all of them.
//
// Decisions encoded here (Chris, 20 Nov 2026):
//   ONB-D15  ticks live in ChecklistProgress; visibility (ONB-D9) is enforced on screen, by onbAccess().
//   ONB-D16  a step's owner ticks it; the joiner's line manager, their CSD and any Admin tick any step.
//   ONB-D17  'PeopleOps' steps: any active people_ops user; while there is none, the joiner's CSD.
//   ONB-D18  one OnboardingPlans row per plan; line manager and CSD are never stored, always resolved
//            live from People.ReportsTo (so a ReportsTo change moves access with it).
//   ONB-D19..D22 (N-497): no stored due dates (StartDate + offset), pre-start steps hidden from the joiner until
//            StartDate, buddy optional at start, plans only for new joiners (START_WINDOW_DAYS).
//   ONB-D23..D27 (N-498): tick-box-only onboarding steps with a content link, every Guided step Required, decks hosted in
//            the OnboardingContent library.
// Callers pass the EFFECTIVE (Ghost-aware) email and role, as PDP does.

function _onbEmail(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

// Off / Pilot / On; anything unrecognised is Off (fail closed).
function onbNormaliseMode(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  return CONFIG.ONBOARDING.MODES.find(m => m.toLowerCase() === s) || CONFIG.ONBOARDING.MODES[0];
}

// A stored owner value -> its OWNERS key ('people ops' and 'PeopleOps' both match), or '' when unknown.
function onbNormaliseOwner(raw) {
  const k = normChecklistKey(raw).replace(/\s+/g, '');
  if (!k) return '';
  const hit = CONFIG.ONBOARDING.OWNERS.find(o => normChecklistKey(o.key) === k);
  return hit ? hit.key : '';
}

function onbOwnerLabel(key) {
  const hit = CONFIG.ONBOARDING.OWNERS.find(o => o.key === key);
  return hit ? hit.label : '';
}

// Who can be a pilot joiner / have a TP-track plan: active, real, deployable, a SCOPE_LEVELS level.
// No started check — pre-start joiners must be pickable.
function onbInScope(person) {
  if (!person || person.IsPlaceholder || !spYesNo(person.IsActive, false)) return false;
  if (!isDeployablePerson(person)) return false;
  return CONFIG.ONBOARDING.SCOPE_LEVELS.includes(person.Level);
}

function _onbUniqueRow(index, email) {
  const rows = index.get(_onbEmail(email));
  return rows && rows.length === 1 ? rows[0] : null;
}

// In-scope people with a unique WorkEmail, by name: { id, name, level, email, startDate ('YYYY-MM-DD' | '') }.
function onbPilotCandidates(people) {
  const index = pdpEmailIndex(people);
  return (people || [])
    .filter(p => onbInScope(p) && _onbUniqueRow(index, p.WorkEmail))
    .map(p => ({ id: String(p.id), name: p.EmployeeName || '', level: p.Level, email: _onbEmail(p.WorkEmail), startDate: spDateIn(p.StartDate) || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The pilot list (emails or the raw column) -> the in-scope People rows it resolves to.
function onbPilotRows(people, pilot) {
  const set = new Set(Array.isArray(pilot) ? pdpParsePilot(pilot.join(CONFIG.ONBOARDING.EMAIL_SEP)) : pdpParsePilot(pilot));
  const index = pdpEmailIndex(people);
  return (people || []).filter(p => set.has(_onbEmail(p.WorkEmail)) && onbInScope(p) && _onbUniqueRow(index, p.WorkEmail));
}

// { employee, lineManager, csd, buddy } People rows (or null) for one OnboardingPlans row.
function onbPlanParties(plan, people) {
  const out = { employee: null, lineManager: null, csd: null, buddy: null };
  if (!plan) return out;
  const pid = String(plan.PersonID == null ? '' : plan.PersonID).trim();
  out.employee = (people || []).find(p => p && !p.IsPlaceholder && String(p.id) === pid) || null;
  if (out.employee) {
    const id = pdpResolveIdentity(people, out.employee.WorkEmail);
    if (id.me && String(id.me.id) === String(out.employee.id)) {
      out.lineManager = id.lineManager;
      out.csd = id.csd;
    }
  }
  if (_onbEmail(plan.BuddyEmail)) out.buddy = _onbUniqueRow(pdpEmailIndex(people), plan.BuddyEmail);
  return out;
}

// How the viewer relates to one plan: a Set of 'employee' | 'lm' | 'csd' | 'buddy' | 'peopleops' | 'admin'.
function onbRelations({ plan = null, people = [], email = '', role = '', peopleOpsActive = false } = {}) {
  const rel = new Set();
  const R = CONFIG.ROLE_IDS;
  if (role === R.ADMIN) rel.add('admin');
  if (role === R.PEOPLE_OPS && peopleOpsActive === true) rel.add('peopleops');
  const me = _onbEmail(email);
  if (!plan || !me) return rel;
  const parties = onbPlanParties(plan, people);
  const employeeEmail = parties.employee ? _onbEmail(parties.employee.WorkEmail) : _onbEmail(plan.Title);
  if (employeeEmail && employeeEmail === me) rel.add('employee');
  if (parties.lineManager && _onbEmail(parties.lineManager.WorkEmail) === me) rel.add('lm');
  if (parties.csd && _onbEmail(parties.csd.WorkEmail) === me) rel.add('csd');
  if (_onbEmail(plan.BuddyEmail) === me) rel.add('buddy');
  return rel;
}

// Who owns a step on this plan: { key, label, person }. person is a People row or null (Ops; People Ops
// once a people_ops user exists). A blank or unknown owner is DEFAULT_OWNER.
function onbStepOwner({ step = null, parties = {}, peopleOpsActive = false } = {}) {
  const O = CONFIG.ONBOARDING;
  const key = onbNormaliseOwner(step && step.Owner) || O.DEFAULT_OWNER;
  const p = parties || {};
  const person = { Employee: p.employee, LM: p.lineManager, CSD: p.csd, Buddy: p.buddy }[key] || null;
  if (key === 'PeopleOps') {
    return peopleOpsActive === true
      ? { key, label: onbOwnerLabel(key), person: null }
      : { key, label: O.PEOPLE_OPS_FALLBACK_LABEL, person: p.csd || null };
  }
  return { key, label: onbOwnerLabel(key), person };
}

// ONB-D16 / D17. Nobody ticks on a plan that is not Active. Admin, line manager and CSD tick any step;
// otherwise the owner: Employee <-> employee, Buddy <-> buddy, PeopleOps <-> peopleops (only while a
// people_ops user exists; until then the CSD owns them and is already covered).
function onbCanTick({ step = null, relations = [], peopleOpsActive = false, planStatus = '' } = {}) {
  if (planStatus !== CONFIG.ONBOARDING.PLAN_ACTIVE) return false;
  const rel = relations instanceof Set ? relations : new Set(relations || []);
  if (rel.has('admin') || rel.has('lm') || rel.has('csd')) return true;
  const key = onbNormaliseOwner(step && step.Owner) || CONFIG.ONBOARDING.DEFAULT_OWNER;
  if (key === 'Employee') return rel.has('employee');
  if (key === 'Buddy') return rel.has('buddy');
  if (key === 'PeopleOps') return peopleOpsActive === true && rel.has('peopleops');
  return false;
}

// The feature gate (shape of pdpAccess): { state: 'none' | 'preview' | 'live', reason }.
//   Off:   Admin preview, everyone else none.
//   Pilot: live for a pilot joiner, the line manager / CSD of one, and anyone with a relation to a plan;
//          Admin live; else none.
//   On:    live for in-scope people and anyone with a relation to a plan; Admin live; else none.
// No other role gets in by role (ONB-D9: Leadership only through a relation). Plans that are not
// Active still count, so their people keep read access.
function onbAccess({ mode = '', pilot = [], people = [], plans = [], email = '', role = '', peopleOpsActive = false } = {}) {
  const [OFF, PILOT] = CONFIG.ONBOARDING.MODES;
  const m = onbNormaliseMode(mode);
  const isAdmin = role === CONFIG.ROLE_IDS.ADMIN;
  const res = (state, reason) => ({ state, reason });
  if (m === OFF) return isAdmin ? res('preview', 'off-admin') : res('none', 'off');

  const me = _onbEmail(email);
  const index = pdpEmailIndex(people);
  const row = me ? _onbUniqueRow(index, me) : null;
  const related = (plans || []).some(plan => {
    const rel = onbRelations({ plan, people, email: me, role, peopleOpsActive });
    rel.delete('admin');
    return rel.size > 0;
  });

  let reason = '';
  if (me) {
    if (m === PILOT) {
      const pilotRows = onbPilotRows(people, pilot);
      if (row && pilotRows.some(p => String(p.id) === String(row.id))) reason = 'pilot';
      else if (pilotRows.some(p => {
        const parties = onbPlanParties({ PersonID: p.id }, people);
        return [parties.lineManager, parties.csd].some(x => x && _onbEmail(x.WorkEmail) === me);
      })) reason = 'pilot-reviewer';
      else if (related) reason = 'plan';
    } else if (row && onbInScope(row)) {
      reason = 'in-scope';
    } else if (related) {
      reason = 'plan';
    }
  }
  if (reason) return res('live', reason);
  if (isAdmin) return res('live', m === PILOT ? 'pilot-admin' : 'on-admin');
  return res('none', m === PILOT ? 'not-in-pilot' : 'not-in-scope');
}

// The person-only template fields (N-498 calls it alongside validateChecklistItem). -> { ok, errors }
// with keys owner, dueOffsetDays, stepMode, levelTag, contentUrl.
function onbValidateStep({ owner, dueOffsetDays, stepMode, levelTag, contentUrl, section } = {}) {
  const O = CONFIG.ONBOARDING;
  const errors = {};
  const text = v => String(v == null ? '' : v).trim();
  const lib = onbIsLibraryStep({ Section: section });   // N-499 (ONB-D29): a Library step has no due date and is self-guided
  const own = text(owner);
  if (!own) errors.owner = 'Choose who owns this step.';
  else if (!onbNormaliseOwner(own)) errors.owner = 'Choose an owner from the list.';
  const rawOff = text(dueOffsetDays);
  const off = Number(rawOff);
  if (!rawOff) { if (!lib) errors.dueOffsetDays = 'Enter the due day (days from the start date).'; }
  else if (!Number.isInteger(off)) errors.dueOffsetDays = 'Enter a whole number of days.';
  else if (off < O.DUE_OFFSET.MIN || off > O.DUE_OFFSET.MAX) errors.dueOffsetDays = `Use a day between ${O.DUE_OFFSET.MIN} and ${O.DUE_OFFSET.MAX}.`;
  const sm = normChecklistKey(stepMode);
  if (!O.STEP_MODES.some(s => normChecklistKey(s) === sm)) errors.stepMode = 'Choose Guided or Self-guided.';
  else if (lib && sm !== normChecklistKey(O.STEP_MODES[1])) errors.stepMode = 'Library items are self-guided.';
  const lt = normChecklistKey(levelTag);
  if (lt && !O.LEVEL_TAGS.some(s => normChecklistKey(s) === lt)) errors.levelTag = 'Choose a level, or leave it blank for every level.';
  const url = text(contentUrl);
  if (url) {
    if (!isSafeChecklistUrl(url)) errors.contentUrl = 'Enter an https:// address or a Newton page such as people.html.';
    else if (url.length > CONFIG.CHECKLISTS.LABEL_MAX) errors.contentUrl = `Keep the link to ${CONFIG.CHECKLISTS.LABEL_MAX} characters or fewer.`;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// The exact OnboardingPlans payload: PLAN_FIELDS only (undefined skipped, so an update sends just what
// changed), emails lower-cased, StartedAt through isoDate() (date-only, N-087). Throws on invalid input.
function onbCleanPlanFields(fields) {
  const O = CONFIG.ONBOARDING;
  const f = fields || {};
  const out = {};
  const has = k => Object.prototype.hasOwnProperty.call(f, k) && f[k] !== undefined;
  const email = (k, required) => {
    const e = _onbEmail(f[k]);
    if (!e) { if (required) throw new Error(`OnboardingPlans.${k} is required.`); return null; }
    if (!pdpIsEmail(e)) throw new Error(`OnboardingPlans.${k} is not an email address: ${e}`);
    return e;
  };
  if (has('Title')) out.Title = email('Title', true);
  if (has('PersonID')) {
    const n = Number(f.PersonID);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`OnboardingPlans.PersonID must be a People item id: ${f.PersonID}`);
    out.PersonID = n;
  }
  if (has('Track')) {
    if (!O.TRACKS.some(t => t.key === f.Track)) throw new Error(`Unknown onboarding track: ${f.Track}`);
    out.Track = f.Track;
  }
  if (has('Status')) {
    if (!O.PLAN_STATUSES.includes(f.Status)) throw new Error(`Unknown onboarding plan status: ${f.Status}`);
    out.Status = f.Status;
  }
  if (has('StartedByEmail')) out.StartedByEmail = email('StartedByEmail', true);
  if (has('StartedAt')) {
    const d = isoDate(spDateIn(f.StartedAt));
    if (!d) throw new Error(`OnboardingPlans.StartedAt must be a date: ${f.StartedAt}`);
    out.StartedAt = d;
  }
  if (has('BuddyEmail')) out.BuddyEmail = email('BuddyEmail', false);
  return out;
}


// ── Plan engine (N-497 / ONB-2) ─────────────────────────────────────────
// Due dates are never stored: StartDate ('YYYY-MM-DD', via spDateIn) + the step's DueOffsetDays. Dates are strings
// throughout, compared as strings.

// One step's due date, or '' when StartDate is blank or the offset is not a whole number.
function onbStepDue(startDate, step) {
  const start = String(startDate || '');
  const raw = step ? step.DueOffsetDays : null;
  const n = Number(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || raw === null || raw === undefined || raw === '' || !Number.isInteger(n)) return '';
  return addDaysISO(start, n);
}

// ONB-D20. A viewer who is only the joiner does not see a negative-offset (pre-start) step before StartDate.
// Everyone else sees every step from the moment the plan starts. Decided by offset, never by phase name.
function onbStepVisible({ step = null, relations = [], startDate = '', todayISO = '' } = {}) {
  const rel = relations instanceof Set ? relations : new Set(relations || []);
  const joinerOnly = rel.has('employee') && !['admin', 'lm', 'csd', 'buddy', 'peopleops'].some(r => rel.has(r));
  if (!joinerOnly) return true;
  const n = Number(step ? step.DueOffsetDays : NaN);
  return !(Number.isInteger(n) && n < 0 && startDate && todayISO && todayISO < startDate);
}

// { total, done, overdue, nextDue } over already-visible active steps. progress = resolveChecklistProgress() map.
// Overdue = not done and due before today (a step due today is not overdue). nextDue = earliest undone step with a date.
function onbPlanSummary({ steps = [], progress = null, startDate = '', todayISO = '' } = {}) {
  steps = (steps || []).filter(t => !onbIsLibraryStep(t));   // ONB-D32: the Library never counts in done / total / overdue (employee card included)
  const s = summariseChecklist(steps, progress);
  let overdue = 0;
  let nextDue = null;
  (steps || []).forEach(it => {
    const key = String(it.ItemKey == null ? '' : it.ItemKey);
    const p = progress ? progress.get(key) : null;
    if (p && p.done) return;
    const due = onbStepDue(startDate, it);
    if (!due) return;
    if (todayISO && due < todayISO) overdue++;
    if (!nextDue || due < nextDue.due) nextDue = { itemKey: key, label: String(it.ItemLabel == null ? '' : it.ItemLabel), due };
  });
  return { total: s.total, done: s.done, overdue, nextDue };
}

// Peers who can be a buddy: the pilot-candidate rules, minus the joiner and anyone who has not started yet.
function onbBuddyCandidates(people, joinerId, todayISO) {
  return onbPilotCandidates(people)
    .filter(c => c.id !== String(joinerId) && !(c.startDate && todayISO && c.startDate > todayISO));
}

// The text for a start-check reason (CONFIG.ONBOARDING.START_REASONS), {days} filled in.
function onbReasonText(reason) {
  const O = CONFIG.ONBOARDING;
  return String(O.START_REASONS[reason] || O.START_REASONS['out-of-scope']).replace('{days}', String(O.START_WINDOW_DAYS));
}

// Can "Start onboarding" be offered for this person? { ok, reason }. Reasons in this order: has-plan, off, not-pilot,
// out-of-scope, no-email, no-start-date, too-late, no-line-manager, no-steps (ONB-D5, D11, D22; Architect calls in N-497).
function onbStartCheck({ person = null, people = [], plans = [], templates = [], mode = '', pilot = [], todayISO = '' } = {}) {
  const O = CONFIG.ONBOARDING;
  const no = reason => ({ ok: false, reason });
  if (!person) return no('out-of-scope');
  if ((plans || []).some(p => p && String(p.PersonID) === String(person.id))) return no('has-plan');
  const m = onbNormaliseMode(mode);
  if (m === O.MODES[0]) return no('off');
  if (m === 'Pilot' && !onbPilotRows(people, pilot).some(p => String(p.id) === String(person.id))) return no('not-pilot');
  if (!onbInScope(person)) return no('out-of-scope');
  const email = _onbEmail(person.WorkEmail);
  if (!email || !_onbUniqueRow(pdpEmailIndex(people), email)) return no('no-email');
  const start = spDateIn(person.StartDate) || '';
  if (!start) return no('no-start-date');
  if (todayISO && start < addDaysISO(todayISO, -O.START_WINDOW_DAYS)) return no('too-late');
  if (!pdpResolveIdentity(people, email).lineManager) return no('no-line-manager');
  if (!activeChecklistItems(templates, O.RECORD_TYPE, O.DEFAULT_TRACK).length) return no('no-steps');
  return { ok: true, reason: '' };
}

// What the employee-record card shows: { kind, reason, plan }. A plan row wins over the switch (kind = active /
// cancelled / complete; an unknown Status reads as blocked 'has-plan'). No row: ready, off, or blocked + the reason.
function onbCardState({ person = null, people = [], plans = [], templates = [], mode = '', pilot = [], todayISO = '' } = {}) {
  const O = CONFIG.ONBOARDING;
  const mine = (plans || []).filter(p => p && person && String(p.PersonID) === String(person.id));
  const status = p => String(p.Status == null ? '' : p.Status).trim();
  const plan = mine.find(p => status(p) === O.PLAN_ACTIVE) || mine[0] || null;
  if (plan) {
    const kind = { Active: 'active', Cancelled: 'cancelled', Complete: 'complete' }[status(plan)];
    return kind ? { kind, reason: '', plan } : { kind: 'blocked', reason: 'has-plan', plan };
  }
  const chk = onbStartCheck({ person, people, plans, templates, mode, pilot, todayISO });
  if (chk.ok) return { kind: 'ready', reason: '', plan: null };
  return { kind: chk.reason === 'off' ? 'off' : 'blocked', reason: chk.reason, plan: null };
}

// The OnboardingPlans payload for a new plan. A non-blank buddy must be one of onbBuddyCandidates (throws otherwise).
function onbStartFields({ person = null, people = [], buddyEmail = '', byEmail = '', todayISO = '' } = {}) {
  const O = CONFIG.ONBOARDING;
  if (!person) throw new Error('No person to start a plan for.');
  const buddy = _onbEmail(buddyEmail);
  if (buddy && !onbBuddyCandidates(people, person.id, todayISO).some(c => c.email === buddy)) {
    throw new Error('That buddy cannot be picked: they are not an active Talent Partner who has started.');
  }
  return onbCleanPlanFields({
    Title: person.WorkEmail, PersonID: person.id, Track: O.DEFAULT_TRACK, Status: O.PLAN_ACTIVE,
    StartedByEmail: byEmail, StartedAt: todayISO, BuddyEmail: buddy,
  });
}

// Data Health: eight integrity checks over the plan rows, in this order -> [{ key, label, count, sample }].
// 1-5 and 7 look at Active plans only; 6 (duplicate rows) and 8 (unknown Track / Status) at every row.
function onbCheckPlans({ plans = [], people = [], templates = [] } = {}) {
  const O = CONFIG.ONBOARDING;
  const all = (plans || []).filter(Boolean);
  const stat = p => String(p.Status == null ? '' : p.Status).trim();
  const active = all.filter(p => stat(p) === O.PLAN_ACTIVE);
  const byId = new Map((people || []).filter(p => p && !p.IsPlaceholder).map(p => [String(p.id), p]));
  const index = pdpEmailIndex(people);
  const who = p => { const e = byId.get(String(p.PersonID)); return (e && e.EmployeeName) || _onbEmail(p.Title) || ('Person ' + p.PersonID); };
  const notFound = [], noStart = [], drift = [], noLm = [], badBuddy = [], noSteps = [];
  active.forEach(p => {
    const e = byId.get(String(p.PersonID));
    if (!e || !spYesNo(e.IsActive, false)) { notFound.push(who(p)); return; }
    if (!spDateIn(e.StartDate)) noStart.push(who(p));
    if (_onbEmail(p.Title) !== _onbEmail(e.WorkEmail)) drift.push(who(p));
    if (!pdpResolveIdentity(people, e.WorkEmail).lineManager) noLm.push(who(p));
    if (_onbEmail(p.BuddyEmail) && !_onbUniqueRow(index, p.BuddyEmail)) badBuddy.push(who(p) + ' (' + _onbEmail(p.BuddyEmail) + ')');
    if (!activeChecklistItems(templates, O.RECORD_TYPE, p.Track).length) noSteps.push(who(p));
  });
  const perPerson = new Map();
  all.forEach(p => { const k = String(p.PersonID); perPerson.set(k, (perPerson.get(k) || 0) + 1); });
  const dupes = [...perPerson.entries()].filter(([, n]) => n > 1).map(([k, n]) => who({ PersonID: k }) + ' (' + n + ' rows)');
  const unknown = all.filter(p => !O.TRACKS.some(t => t.key === p.Track) || !O.PLAN_STATUSES.includes(stat(p))).map(who);
  const mk = (key, label, sample) => ({ key, label, count: sample.length, sample });
  return [
    mk('person-missing', 'Active plans whose person is not in People or is inactive', notFound),
    mk('no-start-date', 'Active plans whose person has no start date', noStart),
    mk('email-drift', 'Active plans whose saved work email no longer matches the person', drift),
    mk('no-line-manager', 'Active plans with no resolvable line manager', noLm),
    mk('buddy-unresolved', 'Active plans whose buddy is not a single People row', badBuddy),
    mk('duplicate-plans', 'People with more than one plan row', dupes),
    mk('no-steps', 'Active plans whose track has no active steps', noSteps),
    mk('unknown-values', 'Plan rows with an unknown track or status', unknown),
  ];
}

// ── N-498 (ONB-3): the onboarding track editor and the one-off seed ────────────────────────────────────

// The track (ChecklistTemplates.Variant) keys for the 'person' record type, and a track's label.
function onbTrackKeys() { return CONFIG.ONBOARDING.TRACKS.map(t => t.key); }
function onbTrackLabel(key) {
  const k = normChecklistKey(key);
  const hit = CONFIG.ONBOARDING.TRACKS.find(t => normChecklistKey(t.key) === k);
  return hit ? hit.label : String(key == null ? '' : key);
}

// A ChecklistTemplates 'person' row -> the person-only fields, normalised for display and the edit form.
// Blank / unknown owner -> DEFAULT_OWNER, mode -> Guided, level -> '' unless a LEVEL_TAGS entry; offset null unless an integer.
function onbStepFromRow(row) {
  const O = CONFIG.ONBOARDING;
  const r = row || {};
  const owner = onbNormaliseOwner(r.Owner) || O.DEFAULT_OWNER;
  const sm = normChecklistKey(r.StepMode);
  const stepMode = O.STEP_MODES.find(m => normChecklistKey(m) === sm) || O.STEP_MODES[0];
  const lt = normChecklistKey(r.LevelTag);
  const levelTag = O.LEVEL_TAGS.find(t => normChecklistKey(t) === lt) || '';
  const rawOff = r.DueOffsetDays;
  const off = (rawOff === null || rawOff === undefined || rawOff === '') ? NaN : Number(rawOff);
  return {
    owner, ownerLabel: onbOwnerLabel(owner), stepMode, levelTag,
    dueOffsetDays: Number.isInteger(off) ? off : null,
    contentUrl: String(r.ContentUrl == null ? '' : r.ContentUrl).trim(),
  };
}

// 'Start day' / 'Day 3' / '5 days before start' (EDITOR_TEXT); '' for a null / non-integer offset.
function onbDueText(offset) {
  const T = CONFIG.ONBOARDING.EDITOR_TEXT;
  if (offset === null || offset === undefined || offset === '') return '';
  const n = Number(offset);
  if (!Number.isInteger(n)) return '';
  if (n === 0) return T.dueStart;
  if (n > 0) return T.dueAfter.replace('{n}', String(n + 1));   // N-508: the start day is Day 1, so offset n reads as Day n+1
  return n === -1 ? T.dueBefore1 : T.dueBefore.replace('{n}', String(-n));
}

// The person-only ChecklistTemplates payload from the editor form (or a seed step). Throws when onbValidateStep fails (the UI
// validates first; this is the belt). Blank level / link -> null so an edit clears them.
function onbStepFields(form) {
  const f = form || {};
  const chk = onbValidateStep(f);
  if (!chk.ok) throw new Error(Object.values(chk.errors)[0]);
  const O = CONFIG.ONBOARDING;
  const sm = normChecklistKey(f.stepMode);
  const lt = normChecklistKey(f.levelTag);
  const url = String(f.contentUrl == null ? '' : f.contentUrl).trim();
  const dueRaw = String(f.dueOffsetDays == null ? '' : f.dueOffsetDays).trim();
  return {
    Owner:         onbNormaliseOwner(f.owner),
    DueOffsetDays: dueRaw === '' ? null : Number(dueRaw),   // N-499: blank only passes validation for a Library step
    StepMode:      O.STEP_MODES.find(m => normChecklistKey(m) === sm),
    LevelTag:      lt ? O.LEVEL_TAGS.find(t => normChecklistKey(t) === lt) : null,
    ContentUrl:    url || null,
  };
}


// ── My Onboarding page (N-499 / ONB-4) ───────────────────────────────────
// Everything the joiner / buddy page shows, as data. Pure: the reads are in api-onboarding.js, the markup in onboarding-my-ui.js.

// '{name}' placeholders filled from vars (CONFIG.ONBOARDING.PLAN_TEXT).
function onbFillText(text, vars) {
  return Object.keys(vars || {}).reduce((s, k) => s.split('{' + k + '}').join(String(vars[k])), String(text == null ? '' : text));
}

// ONB-D29. A Library step is a row whose Section is CONFIG.ONBOARDING.LIBRARY_SECTION (case-insensitive).
function onbIsLibraryStep(step) {
  const sec = normChecklistKey(step ? step.Section : '');
  return !!sec && sec === normChecklistKey(CONFIG.ONBOARDING.LIBRARY_SECTION);
}

// ONB-D30 / D34. The plans this viewer opens in My Onboarding: Active or Complete plans where they are the joiner ('own') or the
// buddy ('buddy'). An LM, CSD or Admin relation alone lists nothing (that is N-502). Own plan first, then buddy plans by the joiner's
// StartDate, latest first, then name. -> [{ plan, kind, relations }]
function onbMyPlans({ plans = [], people = [], email = '', role = '', peopleOpsActive = false } = {}) {
  const O = CONFIG.ONBOARDING;
  const out = [];
  (plans || []).forEach(plan => {
    if (!plan || !O.PLAN_VISIBLE.includes(plan.Status)) return;
    const rel = onbRelations({ plan, people, email, role, peopleOpsActive });
    const kind = rel.has('employee') ? 'own' : (rel.has('buddy') ? 'buddy' : '');
    if (!kind) return;
    const emp = onbPlanParties(plan, people).employee;
    out.push({ plan, kind, relations: Array.from(rel), _start: emp ? (spDateIn(emp.StartDate) || '') : '', _name: emp ? String(emp.EmployeeName || '') : '' });
  });
  out.sort((a, b) => (a.kind === b.kind ? 0 : (a.kind === 'own' ? -1 : 1))
    || (a._start === b._start ? 0 : (a._start < b._start ? 1 : -1))
    || a._name.localeCompare(b._name));
  return out.map(o => ({ plan: o.plan, kind: o.kind, relations: o.relations }));
}

// The selector: [{ planId, kind, joinerName }] from onbMyPlans.
function onbPlanChoices(mine, people) {
  return (mine || []).map(m => {
    const emp = onbPlanParties(m.plan, people).employee;
    return { planId: String(m.plan.id), kind: m.kind, joinerName: emp ? String(emp.EmployeeName || '') : '' };
  });
}

// The tab signal for my-momentum-app.js: { plans: n }. Nothing unless the gate is live or Admin preview.
function onbNavSignal({ gate = null, plans = [], people = [], email = '', role = '', peopleOpsActive = false } = {}) {
  const state = gate && gate.state;
  if (state !== 'live' && state !== 'preview') return { plans: 0 };
  return { plans: onbMyPlans({ plans, people, email, role, peopleOpsActive }).length };
}

// The Library items a level filter shows. level '' = all; an item with no level tag shows under every filter.
// -> { items, hidden }
function onbLibraryFilter(items, level) {
  const lv = normChecklistKey(level);
  const all = items || [];
  const shown = all.filter(i => !lv || !i.levelTag || normChecklistKey(i.levelTag) === lv);
  return { items: shown, hidden: all.length - shown.length };
}

// One plan as a page model. progressRows = the person's ChecklistProgress rows, level = the Library filter key.
// phases: [{ section, done, total, open, items }] (visible, non-Library steps, ONB-D20); summary counts those only (ONB-D32);
// library: { items (filtered), hidden, all }. Each item: { itemKey, label, help, owner: { key, label, name, unnamed }, stepMode, guided,
// levelTag, contentUrl, dueISO, dueText, overdue, done, doneByName, doneAt, canTick }.
function onbPlanModel({ plan = null, people = [], templates = [], progressRows = [], email = '', role = '', peopleOpsActive = false, todayISO = '', level = '' } = {}) {
  const O = CONFIG.ONBOARDING;
  const parties = onbPlanParties(plan, people);
  const emp = parties.employee;
  const startDate = emp ? (spDateIn(emp.StartDate) || '') : '';
  const rel = onbRelations({ plan, people, email, role, peopleOpsActive });
  const kind = rel.has('employee') ? 'own' : (rel.has('buddy') ? 'buddy' : '');
  const status = plan ? String(plan.Status || '') : '';
  const readOnly = status !== O.PLAN_ACTIVE;
  const progress = resolveChecklistProgress(progressRows);
  const emailIndex = pdpEmailIndex(people);
  const nameOf = e => { const r = _onbUniqueRow(emailIndex, e); return r ? String(r.EmployeeName || '') : String(e || ''); };

  const steps = plan
    ? activeChecklistItems(templates, O.RECORD_TYPE, plan.Track)
        .filter(t => onbStepVisible({ step: t, relations: rel, startDate, todayISO }))
    : [];
  const phaseSteps = steps.filter(t => !onbIsLibraryStep(t));
  const libSteps = steps.filter(t => onbIsLibraryStep(t));

  const item = t => {
    const f = onbStepFromRow(t);
    const key = String(t.ItemKey == null ? '' : t.ItemKey);
    const p = progress.get(key);
    const done = !!(p && p.done);
    const dueISO = onbStepDue(startDate, t);
    const own = onbStepOwner({ step: t, parties, peopleOpsActive });
    return {
      itemKey: key,
      label: String(t.ItemLabel == null ? '' : t.ItemLabel),
      help: String(t.HelpText == null ? '' : t.HelpText),
      owner: { key: own.key, label: own.label, name: own.person ? String(own.person.EmployeeName || '') : '', unnamed: own.key === 'Buddy' && !own.person },
      stepMode: f.stepMode,
      guided: f.stepMode === O.STEP_MODES[0],
      levelTag: f.levelTag,
      contentUrl: isSafeChecklistUrl(f.contentUrl) ? f.contentUrl : '',
      dueISO,
      dueText: onbDueText(f.dueOffsetDays),
      overdue: !done && !!dueISO && !!todayISO && dueISO < todayISO,
      done,
      doneByName: done ? nameOf(p.by) : '',
      doneAt: done ? String(p.at || '') : '',
      canTick: !readOnly && !!key && onbCanTick({ step: t, relations: rel, peopleOpsActive, planStatus: status }),
    };
  };

  const phases = groupChecklistItems(phaseSteps).map(g => {
    const items = g.items.map(item);
    const done = items.filter(i => i.done).length;
    return { section: g.section, done, total: items.length, open: done < items.length, items };
  });
  const libAll = libSteps.length ? groupChecklistItems(libSteps).reduce((acc, g) => acc.concat(g.items), []).map(item) : [];
  const lib = onbLibraryFilter(libAll, level);

  return {
    planId: plan ? String(plan.id) : '',
    status,
    readOnly,
    kind,
    joiner: { id: emp ? String(emp.id) : '', name: emp ? String(emp.EmployeeName || '') : '', startDate },
    lineManagerName: parties.lineManager ? String(parties.lineManager.EmployeeName || '') : '',
    buddyName: parties.buddy ? String(parties.buddy.EmployeeName || '') : '',
    notStarted: !!startDate && !!todayISO && todayISO < startDate,
    summary: onbPlanSummary({ steps: phaseSteps, progress, startDate, todayISO }),
    phases,
    library: { items: lib.items, hidden: lib.hidden, all: libAll },
  };
}
