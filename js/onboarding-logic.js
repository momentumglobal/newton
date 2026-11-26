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
//   ONB-D125..D131 (N-541): a second track, Internal (internal staff, onbTrackFor); a line manager with no People row resolves from the
//            assignee directory (onbLineManager); tracks without a countersign close on the LM's Day-30 sign-off (onbDerivePlanStatus),
//            and their CSD / People Ops steps fall back to Admin.
//   ONB-D108..D118 (N-520): a step can be reassigned per plan (OnboardingStepAssignments, latest row wins); the assignee becomes the
//            step's owner for the chip, My actions, reminders and ticking. Every assignments param is optional: without it, nothing changes.
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

// N-541: a track's TRACKS entry (or null). Keys compare case-insensitively, as onbTrackLabel.
function onbTrackDef(key) {
  const k = normChecklistKey(key);
  return k ? (CONFIG.ONBOARDING.TRACKS.find(t => normChecklistKey(t.key) === k) || null) : null;
}

// N-541 (ONB-D126). The track a person's plan is on: active and real, then internal staff -> INTERNAL_TRACK, deployable at a SCOPE_LEVELS
// level -> DEFAULT_TRACK, anyone else (SDM, CSD, external, placeholder, inactive) -> ''. No started check — pre-start joiners must be pickable.
function onbTrackFor(person) {
  const O = CONFIG.ONBOARDING;
  if (!person || person.IsPlaceholder || !spYesNo(person.IsActive, false)) return '';
  if (isInternalStaff(person)) return O.INTERNAL_TRACK;
  if (isDeployablePerson(person) && O.SCOPE_LEVELS.includes(person.Level)) return O.DEFAULT_TRACK;
  return '';
}

// Who can be a pilot joiner / have a plan: anyone with a track.
function onbInScope(person) {
  return !!onbTrackFor(person);
}

// N-541 (ONB-D127). The line manager for a People email: the People row ReportsTo names, as pdpResolveIdentity. Only when ReportsTo is on
// no People row at all does a directory (onbAssigneeDirectory) entry stand in: a single entry with that email from UserAssignments or
// LeadershipAccess. A People row always wins (ONB-D120); the CSD never comes from the directory.
function onbLineManager(people, email, directory = null) {
  const id = pdpResolveIdentity(people, email);
  if (id.lineManager || !id.flags.lineManagerNotInPeople || !Array.isArray(directory) || !id.me) return id.lineManager || null;
  const rt = _onbEmail(id.me.ReportsTo);
  const hits = directory.filter(d => d && d.DirectorySource && _onbEmail(d.WorkEmail) === rt);
  return hits.length === 1 ? hits[0] : null;
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
// N-541: directory (optional) lets a line manager with no People row resolve (onbLineManager); without it, People only.
function onbPlanParties(plan, people, directory = null) {
  const out = { employee: null, lineManager: null, csd: null, buddy: null };
  if (!plan) return out;
  const pid = String(plan.PersonID == null ? '' : plan.PersonID).trim();
  out.employee = (people || []).find(p => p && !p.IsPlaceholder && String(p.id) === pid) || null;
  if (out.employee) {
    const id = pdpResolveIdentity(people, out.employee.WorkEmail);
    if (id.me && String(id.me.id) === String(out.employee.id)) {
      out.lineManager = id.lineManager || (directory ? onbLineManager(people, out.employee.WorkEmail, directory) : null);
      out.csd = id.csd;
    }
  }
  if (_onbEmail(plan.BuddyEmail)) out.buddy = _onbUniqueRow(pdpEmailIndex(people), plan.BuddyEmail);
  return out;
}

// How the viewer relates to one plan: a Set of 'employee' | 'lm' | 'csd' | 'buddy' | 'peopleops' | 'admin' | 'assignee'.
// N-522: directory (optional, onbAssigneeDirectory) is used only to resolve the viewer as an assignee; the parties stay People-only.
function onbRelations({ plan = null, people = [], email = '', role = '', peopleOpsActive = false, assignments = [], directory = null } = {}) {
  const rel = new Set();
  const R = CONFIG.ROLE_IDS;
  if (role === R.ADMIN) rel.add('admin');
  if (role === R.PEOPLE_OPS && peopleOpsActive === true) rel.add('peopleops');
  const me = _onbEmail(email);
  if (!plan || !me) return rel;
  const parties = onbPlanParties(plan, people, directory);
  const employeeEmail = parties.employee ? _onbEmail(parties.employee.WorkEmail) : _onbEmail(plan.Title);
  if (employeeEmail && employeeEmail === me) rel.add('employee');
  if (parties.lineManager && _onbEmail(parties.lineManager.WorkEmail) === me) rel.add('lm');
  if (parties.csd && _onbEmail(parties.csd.WorkEmail) === me) rel.add('csd');
  if (_onbEmail(plan.BuddyEmail) === me) rel.add('buddy');
  if (onbIsPlanAssignee({ plan, assignments, people: directory || people, email: me })) rel.add('assignee');   // N-520 (ONB-D114 / D118); N-522: resolved against the directory
  return rel;
}

// Who owns a step on this plan: { key, label, person }. person is a People row or null (Ops; People Ops
// once a people_ops user exists). A blank or unknown owner is DEFAULT_OWNER.
// N-520 (ONB-D113): assignee = the People row the step is reassigned to (onbStepAssignee), or null. With one, person is the assignee and
// the result adds reassigned: true plus originalPerson / originalLabel (the template owner as above); without one the shape is unchanged.
// N-541 (ONB-D130): on a track with no countersign (no CSD; track = the step's Variant unless given), CSD steps, and People Ops steps while
// no people_ops user exists, are Admin's: ADMIN_FALLBACK_LABEL and no person (no reminder; Admin ticks any step).
function onbStepOwner({ step = null, parties = {}, peopleOpsActive = false, assignee = null, track = null } = {}) {
  const O = CONFIG.ONBOARDING;
  const key = onbNormaliseOwner(step && step.Owner) || O.DEFAULT_OWNER;
  const p = parties || {};
  const person = { Employee: p.employee, LM: p.lineManager, CSD: p.csd, Buddy: p.buddy }[key] || null;
  const t = onbTrackDef(track == null ? (step && step.Variant) : track);
  const adminFallback = !!t && t.countersign === false && (key === 'CSD' || (key === 'PeopleOps' && peopleOpsActive !== true));
  let base;
  if (adminFallback) {
    base = { key, label: onbFillText(O.ADMIN_FALLBACK_LABEL, { role: onbOwnerLabel(key) }), person: null };
  } else if (key === 'PeopleOps') {
    base = peopleOpsActive === true
      ? { key, label: onbOwnerLabel(key), person: null }
      : { key, label: O.PEOPLE_OPS_FALLBACK_LABEL, person: p.csd || null };
  } else {
    base = { key, label: onbOwnerLabel(key), person };
  }
  if (!assignee) return base;
  return { key: base.key, label: base.label, person: assignee, reassigned: true, originalPerson: base.person, originalLabel: base.label };
}

// ONB-D16 / D17. Nobody ticks on a plan that is not Active. Admin, line manager and CSD tick any step;
// otherwise the owner: Employee <-> employee, Buddy <-> buddy, PeopleOps <-> peopleops (only while a
// people_ops user exists; until then the CSD owns them and is already covered).
// N-520 (ONB-D113): on a reassigned step (reassigned = true) the owner's right moves to the assignee alone (isAssignee = the viewer is it).
function onbCanTick({ step = null, relations = [], peopleOpsActive = false, planStatus = '', reassigned = false, isAssignee = false } = {}) {
  if (planStatus !== CONFIG.ONBOARDING.PLAN_ACTIVE) return false;
  const rel = relations instanceof Set ? relations : new Set(relations || []);
  if (rel.has('admin') || rel.has('lm') || rel.has('csd')) return true;
  if (reassigned === true) return isAssignee === true;
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
function onbAccess({ mode = '', pilot = [], people = [], plans = [], email = '', role = '', peopleOpsActive = false, assignments = [], directory = null } = {}) {
  const [OFF, PILOT] = CONFIG.ONBOARDING.MODES;
  const m = onbNormaliseMode(mode);
  const isAdmin = role === CONFIG.ROLE_IDS.ADMIN;
  const res = (state, reason) => ({ state, reason });
  if (m === OFF) return isAdmin ? res('preview', 'off-admin') : res('none', 'off');

  const me = _onbEmail(email);
  const index = pdpEmailIndex(people);
  const row = me ? _onbUniqueRow(index, me) : null;
  const related = (plans || []).some(plan => {
    const rel = onbRelations({ plan, people, email: me, role, peopleOpsActive, assignments, directory });   // N-520: an assignment counts (ONB-D118); N-522: directory-only assignees too
    rel.delete('admin');
    return rel.size > 0;
  });

  let reason = '';
  if (me) {
    if (m === PILOT) {
      const pilotRows = onbPilotRows(people, pilot);
      if (row && pilotRows.some(p => String(p.id) === String(row.id))) reason = 'pilot';
      else if (pilotRows.some(p => {
        const parties = onbPlanParties({ PersonID: p.id }, people, directory);
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
function onbValidateStep({ owner, dueOffsetDays, stepMode, levelTag, contentUrl, section, actionKey } = {}) {
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
  const ak = text(actionKey);   // N-516 (ONB-D94): blank = no action; otherwise a STEP_ACTIONS key
  if (ak && !onbStepActionKey({ ActionKey: ak })) errors.actionKey = 'Choose an action from the list, or None.';
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
  if (has('CSDSignedByEmail')) out.CSDSignedByEmail = email('CSDSignedByEmail', true);   // N-502 (ONB-D64): the CSD countersign
  if (has('CSDSignedAt')) {
    const d = isoDate(spDateIn(f.CSDSignedAt));
    if (!d) throw new Error(`OnboardingPlans.CSDSignedAt must be a date: ${f.CSDSignedAt}`);
    out.CSDSignedAt = d;
  }
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
// N-541: {track} = the track's label (trackKey, default DEFAULT_TRACK).
function onbReasonText(reason, trackKey = '') {
  const O = CONFIG.ONBOARDING;
  return String(O.START_REASONS[reason] || O.START_REASONS['out-of-scope'])
    .replace('{days}', String(O.START_WINDOW_DAYS))
    .replace('{track}', onbTrackLabel(trackKey || O.DEFAULT_TRACK));
}

// Can "Start onboarding" be offered for this person? { ok, reason }. Reasons in this order: has-plan, off, not-pilot,
// out-of-scope, no-email, no-start-date, too-late, no-line-manager, no-steps (ONB-D5, D11, D22; Architect calls in N-497).
// N-541: directory (optional) resolves a line manager with no People row (onbLineManager); no-steps is checked on the person's own track.
function onbStartCheck({ person = null, people = [], plans = [], templates = [], mode = '', pilot = [], todayISO = '', directory = null } = {}) {
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
  if (!onbLineManager(people, email, directory)) return no('no-line-manager');
  if (!activeChecklistItems(templates, O.RECORD_TYPE, onbTrackFor(person)).length) return no('no-steps');
  return { ok: true, reason: '' };
}

// What the employee-record card shows: { kind, reason, plan }. A plan row wins over the switch (kind = active /
// cancelled / complete; an unknown Status reads as blocked 'has-plan'). No row: ready, off, or blocked + the reason.
// N-541 (ONB-D129): a plan read as Complete by onbDerivePlanStatus (DerivedComplete) -> kind 'derived' (Admin can close the record).
function onbCardState({ person = null, people = [], plans = [], templates = [], mode = '', pilot = [], todayISO = '', directory = null } = {}) {
  const O = CONFIG.ONBOARDING;
  const mine = (plans || []).filter(p => p && person && String(p.PersonID) === String(person.id));
  const status = p => String(p.Status == null ? '' : p.Status).trim();
  const plan = mine.find(p => status(p) === O.PLAN_ACTIVE) || mine[0] || null;
  if (plan) {
    if (plan.DerivedComplete === true) return { kind: 'derived', reason: '', plan };
    const kind = { Active: 'active', Cancelled: 'cancelled', Complete: 'complete' }[status(plan)];
    return kind ? { kind, reason: '', plan } : { kind: 'blocked', reason: 'has-plan', plan };
  }
  const chk = onbStartCheck({ person, people, plans, templates, mode, pilot, todayISO, directory });
  if (chk.ok) return { kind: 'ready', reason: '', plan: null };
  return { kind: chk.reason === 'off' ? 'off' : 'blocked', reason: chk.reason, plan: null };
}

// The OnboardingPlans payload for a new plan. A non-blank buddy must be one of onbBuddyCandidates (throws otherwise).
function onbStartFields({ person = null, people = [], buddyEmail = '', byEmail = '', todayISO = '' } = {}) {
  const O = CONFIG.ONBOARDING;
  if (!person) throw new Error('No person to start a plan for.');
  const buddy = _onbEmail(buddyEmail);
  if (buddy && !onbBuddyCandidates(people, person.id, todayISO).some(c => c.email === buddy)) {
    throw new Error(O.TEXT.buddyRefused);
  }
  return onbCleanPlanFields({
    Title: person.WorkEmail, PersonID: person.id, Track: onbTrackFor(person) || O.DEFAULT_TRACK, Status: O.PLAN_ACTIVE,
    StartedByEmail: byEmail, StartedAt: todayISO, BuddyEmail: buddy,
  });
}

// Data Health: eight integrity checks over the plan rows, in this order -> [{ key, label, count, sample }].
// 1-5 and 7 look at Active plans only; 6 (duplicate rows) and 8 (unknown Track / Status) at every row.
// N-520: when assignments (OnboardingStepAssignments rows) are passed, a 9th check 'assignee-unresolved' is added.
// N-522: directory (optional, onbAssigneeDirectory) is what that check resolves against; without it, People alone.
function onbCheckPlans({ plans = [], people = [], templates = [], assignments = null, directory = null } = {}) {
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
    if (!onbLineManager(people, e.WorkEmail, directory)) noLm.push(who(p));   // N-541: a directory-only line manager counts
    if (_onbEmail(p.BuddyEmail) && !_onbUniqueRow(index, p.BuddyEmail)) badBuddy.push(who(p) + ' (' + _onbEmail(p.BuddyEmail) + ')');
    if (!activeChecklistItems(templates, O.RECORD_TYPE, p.Track).length) noSteps.push(who(p));
  });
  const perPerson = new Map();
  all.forEach(p => { const k = String(p.PersonID); perPerson.set(k, (perPerson.get(k) || 0) + 1); });
  const dupes = [...perPerson.entries()].filter(([, n]) => n > 1).map(([k, n]) => who({ PersonID: k }) + ' (' + n + ' rows)');
  const unknown = all.filter(p => !O.TRACKS.some(t => t.key === p.Track) || !O.PLAN_STATUSES.includes(stat(p))).map(who);
  const mk = (key, label, sample) => ({ key, label, count: sample.length, sample });
  const extra = [];
  if (Array.isArray(assignments)) {   // N-520 (ONB-D113)
    const aIdx = onbAssignmentIndex(assignments);
    const activeIds = new Set(active.map(p => String(p.id)));
    const badAssign = [];
    aIdx.forEach((v, k) => {
      const pid = k.slice(0, k.indexOf('|'));
      if (!activeIds.has(pid) || _onbActiveUnique(directory || people, v.email)) return;   // N-522: the directory (People + access rows)
      badAssign.push(who(active.find(p => String(p.id) === pid)) + ' (' + v.email + ')');
    });
    extra.push(mk('assignee-unresolved', 'Active plans with a step assigned to someone who is not a single active person (People, User Assignments or Leadership Access)', badAssign));
  }
  return [
    mk('person-missing', 'Active plans whose person is not in People or is inactive', notFound),
    mk('no-start-date', 'Active plans whose person has no start date', noStart),
    mk('email-drift', 'Active plans whose saved work email no longer matches the person', drift),
    mk('no-line-manager', 'Active plans with no resolvable line manager', noLm),
    mk('buddy-unresolved', 'Active plans whose buddy is not a single People row', badBuddy),
    mk('duplicate-plans', 'People with more than one plan row', dupes),
    mk('no-steps', 'Active plans whose track has no active steps', noSteps),
    mk('unknown-values', 'Plan rows with an unknown track or status', unknown),
  ].concat(extra);
}

// ── N-498 (ONB-3): the onboarding track editor and the one-off seed ────────────────────────────────────

// The track (ChecklistTemplates.Variant) keys for the 'person' record type, and a track's label.
function onbTrackKeys() { return CONFIG.ONBOARDING.TRACKS.map(t => t.key); }
function onbTrackLabel(key) {
  const hit = onbTrackDef(key);
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
    ActionKey:     onbStepActionKey({ ActionKey: f.actionKey }) || null,   // N-516: validated above; overrides the editor's generic ActionKey: null
  };
}

// N-516 (ONB-D94). The STEP_ACTIONS key a ChecklistTemplates 'person' row carries in ActionKey (exact match after trim), else ''.
function onbStepActionKey(row) {
  const k = String(row && row.ActionKey != null ? row.ActionKey : '').trim();
  return k && (CONFIG.ONBOARDING.STEP_ACTIONS || []).some(a => a.key === k) ? k : '';
}


// ── My Onboarding page (N-499 / ONB-4) ───────────────────────────────────
// Everything the joiner / buddy page shows, as data. Pure: the reads are in api-onboarding.js, the markup in onboarding-my-ui.js.

// '{name}' placeholders filled from vars (CONFIG.ONBOARDING.PLAN_TEXT).
function onbFillText(text, vars) {
  return Object.keys(vars || {}).reduce((s, k) => s.split('{' + k + '}').join(String(vars[k])), String(text == null ? '' : text));
}

// ONB-D29. A Library step is a row whose Section is CONFIG.ONBOARDING.LIBRARY_SECTION (case-insensitive).
// N-502 (ONB-D71). 'roleplay' | 'day30' when this step is one a sign-off ticks, else ''. N-541: the ItemKeys are per track
// (TRACKS[].signoffKeys) and the track is the step's Variant (a blank or unknown Variant reads as DEFAULT_TRACK).
function onbSignoffStepKind(step) {
  const t = onbTrackDef(step && step.Variant) || onbTrackDef(CONFIG.ONBOARDING.DEFAULT_TRACK);
  const keys = (t && t.signoffKeys) || {};
  const k = String(step && step.ItemKey != null ? step.ItemKey : '').trim();
  if (!k) return '';
  return Object.keys(keys).find(n => keys[n] && String(keys[n]).trim() === k) || '';
}

// N-541. The ItemKey a sign-off ('roleplay' | 'day30') ticks on a track, or '' (no linked step).
function onbTrackSignoffKey(trackKey, kind) {
  const t = onbTrackDef(trackKey);
  return String((t && t.signoffKeys && t.signoffKeys[kind]) || '').trim();
}

// N-502 / N-541. The latest OnboardingSignoffs row of one Kind for one plan (by numeric item id), or null. onbSignoffState reads it too.
function onbLatestSignoff(signoffs, planId, kind) {
  const pid = String(planId == null ? '' : planId);
  let best = null, bestId = -Infinity;
  (signoffs || []).forEach(r => {
    if (!r || !pid || String(r.PlanID) !== pid || r.Kind !== kind) return;
    const n = Number(r.id);
    const id = Number.isFinite(n) ? n : -1;
    if (!best || id > bestId) { best = r; bestId = id; }
  });
  return best;
}

// N-541 (ONB-D129). Plans as everyone reads them: on a track with no countersign, an Active plan whose latest Day-30 LM sign-off is Signed
// reads as Complete (Status 'Complete', StoredStatus 'Active', DerivedComplete true) — the line manager cannot write OnboardingPlans, so the
// stored Status waits for an Admin to close the record. Every other row is returned as given (same object).
function onbDerivePlanStatus(plans, signoffs) {
  const O = CONFIG.ONBOARDING;
  const S = O.SIGNOFF;
  return (plans || []).map(plan => {
    if (!plan) return plan;
    const t = onbTrackDef(plan.Track);
    if (!t || t.countersign !== false || String(plan.Status == null ? '' : plan.Status).trim() !== O.PLAN_ACTIVE) return plan;
    const last = onbLatestSignoff(signoffs, plan.id, S.KINDS[1]);
    if (!last || last.Outcome !== S.SIGNED) return plan;
    return Object.assign({}, plan, { Status: O.PLAN_STATUSES[1], StoredStatus: O.PLAN_ACTIVE, DerivedComplete: true });
  });
}

// N-541. True when any plan is on a track with no countersign (its status may be derived from the sign-offs).
function onbNeedsSignoffs(plans) {
  return (plans || []).some(p => { const t = p ? onbTrackDef(p.Track) : null; return !!t && t.countersign === false; });
}

function onbIsLibraryStep(step) {
  const sec = normChecklistKey(step ? step.Section : '');
  return !!sec && sec === normChecklistKey(CONFIG.ONBOARDING.LIBRARY_SECTION);
}

// ONB-D30 / D34. The plans this viewer opens in My Onboarding: Active or Complete plans where they are the joiner ('own') or the
// buddy ('buddy'). An LM, CSD or Admin relation alone lists nothing (that is N-502). Own plan first, then buddy plans by the joiner's
// StartDate, latest first, then name. -> [{ plan, kind, relations }]
// N-509: kind 'own' or 'buddy' lists only that kind (My Onboarding: own; Buddying: buddy); '' (the default) lists both, as N-499.
function onbMyPlans({ plans = [], people = [], email = '', role = '', peopleOpsActive = false, kind: only = '' } = {}) {
  const O = CONFIG.ONBOARDING;
  const out = [];
  (plans || []).forEach(plan => {
    if (!plan || !O.PLAN_VISIBLE.includes(plan.Status)) return;
    const rel = onbRelations({ plan, people, email, role, peopleOpsActive });
    const kind = rel.has('employee') ? 'own' : (rel.has('buddy') ? 'buddy' : '');
    if (!kind || (only && kind !== only)) return;
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

// N-509 (ONB-D38). The plans the viewer buddies that the Buddying tab, its page and its count are all about: Active only (a Complete
// or Cancelled plan leaves no buddy action). The one rule for all three; ordered as onbMyPlans orders them (latest StartDate first).
function onbBuddyPlans(args) {
  return onbMyPlans(Object.assign({}, args, { kind: 'buddy' })).filter(m => m.plan.Status === CONFIG.ONBOARDING.PLAN_ACTIVE);
}

// N-509 (ONB-D40). One plan (an onbPlanModel result) as a Buddying card: "actions" = the Buddy-owned phase steps, open first (each
// group in plan order); "rest" = every other phase step, context only. The Library is in neither. Each item keeps the canTick
// onbPlanModel worked out (the N-499 rules). openActions = the Buddy-owned steps not yet done, due or not (ONB-D41).
function onbBuddyModel(model) {
  const m = model || {};
  const items = (m.phases || []).reduce((acc, p) => acc.concat(p.items), []);
  const isBuddy = i => !!i.owner && i.owner.key === 'Buddy' && !i.reassigned;   // N-520 (ONB-D114): a reassigned Buddy step leaves the buddy
  const mine = items.filter(isBuddy);
  const open = mine.filter(i => !i.done);
  return {
    planId: m.planId || '',
    status: m.status || '',
    readOnly: !!m.readOnly,
    joiner: m.joiner || { id: '', name: '', startDate: '' },
    actions: open.concat(mine.filter(i => i.done)),
    openActions: open.length,
    rest: items.filter(i => !isBuddy(i)),
  };
}

// The tab signals for my-momentum-app.js: { plans, buddy, actions } (N-509). plans = the viewer's own plans, buddy = their Active buddy
// plans, actions = open Buddy-owned steps across those. All zero unless the gate is live or Admin preview. templates, todayISO and
// progressByPlan ({ planId: ChecklistProgress rows }) are needed only for the count; without them a buddy plan counts every Buddy step as open.
// N-520: assignments (optional) keep a reassigned Buddy step out of the count.
function onbNavSignal({ gate = null, plans = [], people = [], email = '', role = '', peopleOpsActive = false, templates = [], progressByPlan = {}, todayISO = '', assignments = [], directory = null } = {}) {
  const state = gate && gate.state;
  if (state !== 'live' && state !== 'preview') return { plans: 0, buddy: 0, actions: 0 };
  const who = { plans, people, email, role, peopleOpsActive };
  const buddy = onbBuddyPlans(who);
  const actions = buddy.reduce((n, m) => n + onbBuddyModel(onbPlanModel({
    plan: m.plan, people, templates, progressRows: (progressByPlan || {})[String(m.plan.id)] || [], email, role, peopleOpsActive, todayISO, assignments, directory,
  })).openActions, 0);
  return { plans: onbMyPlans(Object.assign({ kind: 'own' }, who)).length, buddy: buddy.length, actions };
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
// levelTag, contentUrl, actionKey, dueISO, dueOffsetDays, dueText, overdue, done, doneByName, doneAt, canTick }.
// N-522: directory (optional, onbAssigneeDirectory) resolves and names assignees; People still gives every party.
// N-520: assignments = OnboardingStepAssignments rows (optional). A reassigned item's owner.name is the assignee's; every item also carries
// reassigned, canReassign and assign: { originalEmail, originalName, originalLabel, assigneeEmail } (the Reassign modal's input).
function onbPlanModel({ plan = null, people = [], templates = [], progressRows = [], email = '', role = '', peopleOpsActive = false, todayISO = '', level = '', assignments = [], directory = null } = {}) {
  const O = CONFIG.ONBOARDING;
  const parties = onbPlanParties(plan, people, directory);   // N-541: a directory-only line manager
  const emp = parties.employee;
  const startDate = emp ? (spDateIn(emp.StartDate) || '') : '';
  const aIndex = onbAssignmentIndex(assignments, plan ? plan.id : null);   // N-520
  const rel = onbRelations({ plan, people, email, role, peopleOpsActive, assignments: aIndex, directory });
  const kind = rel.has('employee') ? 'own' : (rel.has('buddy') ? 'buddy' : '');
  const status = plan ? String(plan.Status || '') : '';
  const readOnly = status !== O.PLAN_ACTIVE;
  const progress = resolveChecklistProgress(progressRows);
  const emailIndex = pdpEmailIndex(directory || people);   // N-522: a directory-only assignee is named, not shown as an email
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
    const assignee = onbStepAssignee({ step: t, plan, assignments: aIndex, people: directory || people });   // N-520; N-522: the directory
    const own = onbStepOwner({ step: t, parties, peopleOpsActive, assignee });
    const reassigned = own.reassigned === true;
    const original = reassigned ? own.originalPerson : own.person;
    const isAssignee = reassigned && _onbEmail(assignee.WorkEmail) === _onbEmail(email);
    const signoff = onbSignoffStepKind(t);
    return {
      itemKey: key,
      label: String(t.ItemLabel == null ? '' : t.ItemLabel),
      help: String(t.HelpText == null ? '' : t.HelpText),
      owner: { key: own.key, label: own.label, name: own.person ? String(own.person.EmployeeName || '') : '', unnamed: own.key === 'Buddy' && !own.person },
      stepMode: f.stepMode,
      guided: f.stepMode === O.STEP_MODES[0],
      levelTag: f.levelTag,
      required: spYesNo(t.Required, false),   // N-502: the Day-30 gate counts the Required phase steps
      signoff,                                // N-502 (ONB-D71): a sign-off step is ticked by its sign-off, never by hand
      contentUrl: isSafeChecklistUrl(f.contentUrl) ? f.contentUrl : '',
      actionKey: onbStepActionKey(t),           // N-516 (ONB-D94): '' unless a registered STEP_ACTIONS key
      dueISO,
      dueOffsetDays: f.dueOffsetDays,           // N-516: the welcome email's Week 1 window
      dueText: onbDueText(f.dueOffsetDays),
      overdue: !done && !!dueISO && !!todayISO && dueISO < todayISO,
      done,
      doneByName: done ? nameOf(p.by) : '',
      doneAt: done ? String(p.at || '') : '',
      canTick: !readOnly && !!key && !signoff && onbCanTick({ step: t, relations: rel, peopleOpsActive, planStatus: status, reassigned, isAssignee }),
      reassigned,                                                                                              // N-520 (ONB-D117)
      canReassign: !!key && onbCanReassign({ step: t, relations: rel, viewerEmail: email, originalPerson: original, assignee, done, planStatus: status }).ok,
      assign: {
        originalEmail: original ? _onbEmail(original.WorkEmail) : '',
        originalName:  original ? String(original.EmployeeName || '') : '',
        originalLabel: reassigned ? own.originalLabel : own.label,
        assigneeEmail: reassigned ? _onbEmail(assignee.WorkEmail) : '',
      },
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
    track: plan ? String(plan.Track == null ? '' : plan.Track) : '',   // N-541
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

// ── Step reassignment (N-520, ONB-D108..D118) ───────────────────────────
// Pure. Rows are OnboardingStepAssignments (append-only); the latest row per (PlanID, ItemKey) wins by numeric item id and a blank
// AssigneeEmail means "back with the template owner". The write is reassignOnboardingStep (api-onboarding.js), which re-checks all of this.

function _onbAssignKey(planId, itemKey) {
  return String(planId == null ? '' : planId).trim() + '|' + String(itemKey == null ? '' : itemKey).trim();
}

// rows -> Map '<planId>|<itemKey>' -> { email, rowId, byEmail, at } (only the current assignments: a blank latest row gives no entry).
// planId given: that plan's rows only.
function onbAssignmentIndex(rows, planId) {
  if (rows instanceof Map) return rows;
  const want = planId === null || planId === undefined || planId === '' ? null : String(planId).trim();
  const latest = new Map();
  (rows || []).forEach(r => {
    if (!r) return;
    const pid = String(r.PlanID == null ? '' : r.PlanID).trim();
    const key = String(r.ItemKey == null ? '' : r.ItemKey).trim();
    if (!pid || !key || (want !== null && pid !== want)) return;
    const k = _onbAssignKey(pid, key);
    const prev = latest.get(k);
    if (!prev || Number(r.id) > Number(prev.id)) latest.set(k, r);
  });
  const out = new Map();
  latest.forEach((r, k) => {
    const email = _onbEmail(r.AssigneeEmail);
    if (email) out.set(k, { email, rowId: String(r.id), byEmail: _onbEmail(r.AssignedByEmail), at: String(r.AssignedAt == null ? '' : r.AssignedAt) });
  });
  return out;
}

// The one People row an email belongs to, when it is a single, active, real row; else null.
function _onbActiveUnique(people, email) {
  const row = _onbUniqueRow(pdpEmailIndex(people), email);
  return row && !row.IsPlaceholder && spYesNo(row.IsActive, false) ? row : null;
}

// ONB-D113. The People row this plan's step is reassigned to, or null (none, or the email no longer resolves: the step falls back).
// assignments = rows or an onbAssignmentIndex Map.
function onbStepAssignee({ step = null, plan = null, assignments = [], people = [] } = {}) {
  if (!step || !plan) return null;
  const hit = onbAssignmentIndex(assignments, plan.id).get(_onbAssignKey(plan.id, step.ItemKey));
  return hit ? _onbActiveUnique(people, hit.email) : null;
}

// ONB-D114 / D118. Is this viewer the current assignee of any step on this plan?
function onbIsPlanAssignee({ plan = null, assignments = [], people = [], email = '' } = {}) {
  const me = _onbEmail(email);
  if (!plan || !me || !assignments || (Array.isArray(assignments) && !assignments.length)) return false;
  const prefix = _onbAssignKey(plan.id, '');
  let hit = false;
  onbAssignmentIndex(assignments, plan.id).forEach((v, k) => { if (!hit && k.startsWith(prefix) && v.email === me) hit = true; });
  return hit && !!_onbActiveUnique(people, me);
}

// N-522 (ONB-D119..D123). The assignee directory: every People row as it is, then one People-shaped entry for each person who has no People
// row at all but holds an active UserAssignments row (any role; Active false is out, a blank Active counts as active) or a LeadershipAccess
// row. It only resolves and names assignees (onbStepAssignee, onbIsPlanAssignee, onbAssignCandidates, the name lookups): the joiner, line
// manager, CSD, buddy and every scope rule keep reading People alone. A People row wins even when it excludes the person (D120): an email on
// any People row (inactive, placeholder, future starter, duplicate) gets no extra. Name: UserAssignments.UserName, then LeadershipAccess.UserName,
// then the email (D121). -> the People rows first (the same objects), then the extras by name.
function onbAssigneeDirectory({ people = [], userRows = [], leadershipRows = [] } = {}) {
  const base = Array.isArray(people) ? people.slice() : [];
  const taken = new Set();
  base.forEach(p => { const e = p ? _onbEmail(p.WorkEmail) : ''; if (e) taken.add(e); });
  const extras = new Map();
  const add = (row, source, prefix) => {
    const email = row ? _onbEmail(row.UserEmail) : '';
    if (!email || !pdpIsEmail(email) || taken.has(email)) return;
    const name = String(row.UserName == null ? '' : row.UserName).trim();
    const prev = extras.get(email);
    if (prev) {
      if (!prev.named && name) { prev.entry.EmployeeName = name; prev.named = true; }
      return;
    }
    extras.set(email, { named: !!name, entry: { id: prefix + String(row.id), EmployeeName: name || email, WorkEmail: email, IsActive: true, IsPlaceholder: false, StartDate: '', DirectorySource: source } });
  };
  (userRows || []).forEach(r => { if (r && r.Active !== false) add(r, 'UserAssignments', 'ua-'); });
  (leadershipRows || []).forEach(r => add(r, 'LeadershipAccess', 'la-'));
  const more = Array.from(extras.values()).map(x => x.entry).sort((a, b) => a.EmployeeName.localeCompare(b.EmployeeName));
  return base.concat(more);
}

// ONB-D111. Who a step can be reassigned to: anyone with a Newton work email (active, real, unique WorkEmail, started; blank StartDate
// counts as started), deployable or internal, minus the joiner. -> [{ id, name, email }] by name.
// N-522 (ONB-D119): callers pass the directory (onbAssigneeDirectory) as people, so access-role holders with no People row are included.
function onbAssignCandidates(people, joinerId, todayISO) {
  const index = pdpEmailIndex(people);
  return (people || [])
    .filter(p => p && !p.IsPlaceholder && spYesNo(p.IsActive, false) && String(p.id) !== String(joinerId))
    .map(p => ({ p, email: _onbEmail(p.WorkEmail), start: spDateIn(p.StartDate) || '' }))
    .filter(x => x.email && _onbUniqueRow(index, x.email) && !(x.start && todayISO && x.start > todayISO))
    .map(x => ({ id: String(x.p.id), name: String(x.p.EmployeeName || ''), email: x.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ONB-D109 / D110. Can this viewer reassign this step? -> { ok, reason } (reason = an ASSIGN.TEXT.reasons key).
// originalPerson = the template owner's person on this plan (onbStepOwner without an assignee); assignee = the current one or null.
function onbCanReassign({ step = null, relations = [], viewerEmail = '', originalPerson = null, assignee = null, done = false, planStatus = '', readOnly = false } = {}) {
  const no = reason => ({ ok: false, reason });
  if (!step) return no('noRights');
  if (readOnly) return no('preview');
  if (planStatus !== CONFIG.ONBOARDING.PLAN_ACTIVE) return no('closed');
  const key = onbNormaliseOwner(step.Owner) || CONFIG.ONBOARDING.DEFAULT_OWNER;
  if (key === 'Employee') return no('employee');
  if (onbSignoffStepKind(step)) return no('signoff');
  if (onbIsLibraryStep(step)) return no('library');
  if (done) return no('done');
  const rel = relations instanceof Set ? relations : new Set(relations || []);
  if (rel.has('admin')) return { ok: true, reason: '' };
  const me = _onbEmail(viewerEmail);
  if (me && [originalPerson, assignee].some(x => x && _onbEmail(x.WorkEmail) === me)) return { ok: true, reason: '' };
  return no('noRights');
}

// The exact OnboardingStepAssignments payload (ASSIGN.FIELDS). A blank assignee is '' (= back with the template owner). Throws on bad input.
function onbCleanAssignFields({ plan = null, itemKey = '', assigneeEmail = '', byEmail = '', todayISO = '' } = {}) {
  const pid = Number(plan ? plan.id : NaN);
  const person = Number(plan ? plan.PersonID : NaN);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`OnboardingStepAssignments.PlanID must be a plan item id: ${plan ? plan.id : plan}`);
  if (!Number.isInteger(person) || person <= 0) throw new Error(`OnboardingStepAssignments.PersonID must be a People item id: ${plan ? plan.PersonID : plan}`);
  const key = String(itemKey == null ? '' : itemKey).trim();
  if (!key) throw new Error('OnboardingStepAssignments.ItemKey is required.');
  const to = _onbEmail(assigneeEmail);
  if (to && !pdpIsEmail(to)) throw new Error(`OnboardingStepAssignments.AssigneeEmail is not an email address: ${to}`);
  const by = _onbEmail(byEmail);
  if (!by || !pdpIsEmail(by)) throw new Error(`OnboardingStepAssignments.AssignedByEmail is not an email address: ${by}`);
  const at = String(todayISO == null ? '' : todayISO).trim();   // a text column, 'YYYY-MM-DD' (no UTC→BST shift)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) throw new Error(`OnboardingStepAssignments.AssignedAt must be a YYYY-MM-DD date: ${todayISO}`);
  return { Title: `${pid}-${key}`, PlanID: pid, PersonID: person, ItemKey: key, AssigneeEmail: to, AssignedByEmail: by, AssignedAt: at };
}

// ONB-D115. The notification key for one assignee of one step.
function onbAssignNotifyKey(planId, itemKey, email) {
  return CONFIG.ONBOARDING.ASSIGN.NOTIFY.KEY_PREFIX + ':' + _onbAssignKey(planId, itemKey).replace('|', ':') + ':' + _onbEmail(email);
}

// ONB-D116. The Reassign modal's options for one plan item (onbPlanModel): the original owner first ('' = hand back), then the candidates
// minus the original owner. defaultValue = the current assignee ('' when not reassigned). -> { options: [{ value, label }], defaultValue }
function onbReassignOptions({ item = null, candidates = [] } = {}) {
  const A = CONFIG.ONBOARDING.ASSIGN.TEXT;
  const a = (item && item.assign) || { originalEmail: '', originalName: '', originalLabel: '', assigneeEmail: '' };
  const first = { value: '', label: a.originalName ? onbFillText(A.originalOwner, { name: a.originalName }) : onbFillText(A.backTo, { role: a.originalLabel }) };
  const rest = (candidates || []).filter(c => c.email !== a.originalEmail).map(c => ({ value: c.email, label: c.name }));
  return { options: [first].concat(rest), defaultValue: a.assigneeEmail || '' };
}

// ── Processes & Rituals tab (N-500 / ONB-5) ─────────────────────────────

// Is the Processes & Rituals reference tab shown to this person? ONB-D47: when the switch is On (every member of staff who can open
// My Momentum), or when their gate is already live / preview (Admin preview while Off; pilot people and plan-related people while Pilot).
// While Off or Pilot an ordinary member of staff does not see it, so the pilot stays contained. A missing gate is not live.
function onbRitualsVisible({ mode = '', gateState = '' } = {}) {
  const on = CONFIG.ONBOARDING.MODES[2];
  return gateState === 'live' || gateState === 'preview' || onbNormaliseMode(mode) === on;
}

// The My Onboarding sub-tabs this person has (ONB-D49), in CONFIG.ONBOARDING.SUB_TABS order. signals = my-momentum's _mmSignals:
// Onboarding Plan needs a plan of their own (onbPlans), Processes & Rituals needs onbRituals. N-501 (ONB-D56): Expectations & SLAs is the
// other all-staff reference tab, so it follows the same onbRituals signal. N-518 (ONB-D105): so does the Learning Library.
function onbSubTabs(signals) {
  const s = signals || {};
  const has = { plan: !!s.onbPlans, rituals: !!s.onbRituals, expectations: !!s.onbRituals, library: !!s.onbRituals };
  return CONFIG.ONBOARDING.SUB_TABS.filter(t => has[t.key] === true);
}

// The link for a Newton page a ritual step points at (ONB-D50): the CONFIG.COMMAND_BAR_PAGES entry's href, only when that entry lists
// the viewer's role. '' = plain text (no page key, unknown key, or a role that cannot open the page).
function onbRitualLink(pageKey, role) {
  const entry = pageKey ? CONFIG.COMMAND_BAR_PAGES.find(p => p.key === pageKey) : null;
  return entry && Array.isArray(entry.roles) && entry.roles.includes(role) ? String(entry.href || '') : '';
}

// The Processes & Rituals page model: CONFIG.ONBOARDING.RITUALS with every touchpoint resolved to { label, href } (href '' = plain
// text), the Role Checklist link resolved for this role, and the Expectations & SLAs sentence linked only when that sub-tab is shown
// (ONB-D52; `subTabs` = onbSubTabs()). Pure: the config is read, never changed.
function onbRitualsModel(role, subTabs) {
  const touch = t => (t ? { label: String(t.label || ''), href: onbRitualLink(t.page, role) } : null);
  const hasSla = (subTabs || []).some(t => t.key === 'expectations');
  return {
    text: CONFIG.ONBOARDING.RITUALS.TEXT,
    sections: CONFIG.ONBOARDING.RITUALS.SECTIONS.map(sec => {
      const out = { key: sec.key, title: sec.title, intro: sec.intro || '' };
      if (sec.cards) {
        out.cards = sec.cards.map(c => Object.assign({}, c, {
          steps: (c.steps || []).map(st => Object.assign({}, st, { touch: touch(st.touch) })),
        }));
      }
      if (sec.rows) out.rows = sec.rows.map(r => Object.assign({}, r, { touch: touch(r.touch) }));
      if (sec.signpost) {
        const sp = sec.signpost;
        out.signpost = {
          text: sp.text, takenIn: sp.takenIn || '', slaText: sp.slaText, slaLink: hasSla,
          link: { label: sp.link.label, href: onbRitualLink(sp.link.page, role) },
        };
      }
      return out;
    }),
  };
}

// The Expectations & SLAs page model (N-501, ONB-D53 / D54): the signed-off standards as written, the company goal and the five
// benchmarks read from CONFIG.ANALYTICS_BENCHMARKS (never typed), and the company default SLA target per eligible project type.
// slaRows = getSLATargets(); anything but an array means the read failed, so kpis.sla is null and the page says "unavailable" (never an
// empty or zero-filled table). Each type's defaults come from slaTargetsFor() with a project id of 0: an override row needs ProjectID > 0,
// so only the type default can match (ONB-D61). Pure: the config is read, never changed.
function onbExpectationsModel({ slaRows } = {}) {
  const S = CONFIG.ONBOARDING.STANDARDS;
  const B = CONFIG.ANALYTICS_BENCHMARKS;
  const metrics = CONFIG.SLA.METRICS;
  const fmt = (b) => (b.kind === 'pct' ? Math.round(B[b.key] * 100) + '%' : B[b.key] + ' days');
  const sla = !Array.isArray(slaRows) ? null : {
    metrics: metrics.map(m => ({ key: m.key, label: m.label, unit: m.unit })),
    rows: slaProjectTypes().map(type => {
      const t = slaTargetsFor({ id: 0, ProjectType: type }, slaRows) || {};
      return { type, cells: metrics.map(m => slaFormatTarget(t[m.key] ? t[m.key].value : null, m)) };
    }),
  };
  return {
    text: S.TEXT,
    groups: S.GROUPS,
    kpis: {
      title: S.KPIS.title,
      goal: S.KPIS.goal.replace('{days}', String(B.timeToHireDays)),
      slaTitle: S.KPIS.slaTitle, slaIntro: S.KPIS.slaIntro, slaOverrideNote: S.KPIS.slaOverrideNote, typeHead: S.KPIS.typeHead,
      sla,
      benchmarksTitle: S.KPIS.benchmarksTitle, benchmarksIntro: S.KPIS.benchmarksIntro,
      benchmarks: S.KPIS.benchmarks.map(b => ({ label: b.label, value: fmt(b) })),
      howUsed: S.KPIS.howUsed,
    },
  };
}

// ── Learning Library tab (N-518) ────────────────────────────────────────

// The Learning Library page model (ONB-D102–D104): the Active Library-section steps of the DEFAULT_TRACK, in Checklist Admin order (the
// same order the plan's Library uses), read-only: no owner, due date, tick or progress. templates = ChecklistTemplates rows; anything but
// an array is treated as none. level = the filter key ('' = all). -> { text, all, items, hidden }; each item { itemKey, label, help,
// levelTag, contentUrl ('' unless safe) }. Pure: the config is read, never changed.
function onbLibraryTabModel({ templates = [], level = '' } = {}) {
  const O = CONFIG.ONBOARDING;
  const rows = activeChecklistItems(Array.isArray(templates) ? templates : [], O.RECORD_TYPE, O.DEFAULT_TRACK).filter(t => onbIsLibraryStep(t));
  const all = rows.length ? groupChecklistItems(rows).reduce((acc, g) => acc.concat(g.items), []).map(t => {
    const f = onbStepFromRow(t);
    return {
      itemKey: String(t.ItemKey == null ? '' : t.ItemKey),
      label: String(t.ItemLabel == null ? '' : t.ItemLabel),
      help: String(t.HelpText == null ? '' : t.HelpText),
      levelTag: f.levelTag,
      contentUrl: isSafeChecklistUrl(f.contentUrl) ? f.contentUrl : '',
    };
  }) : [];
  const f = onbLibraryFilter(all, level);
  return { text: O.LIBRARY_TEXT, all, items: f.items, hidden: f.hidden };
}
