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
function onbValidateStep({ owner, dueOffsetDays, stepMode, levelTag, contentUrl } = {}) {
  const O = CONFIG.ONBOARDING;
  const errors = {};
  const text = v => String(v == null ? '' : v).trim();
  const own = text(owner);
  if (!own) errors.owner = 'Choose who owns this step.';
  else if (!onbNormaliseOwner(own)) errors.owner = 'Choose an owner from the list.';
  const rawOff = text(dueOffsetDays);
  const off = Number(rawOff);
  if (!rawOff) errors.dueOffsetDays = 'Enter the due day (days from the start date).';
  else if (!Number.isInteger(off)) errors.dueOffsetDays = 'Enter a whole number of days.';
  else if (off < O.DUE_OFFSET.MIN || off > O.DUE_OFFSET.MAX) errors.dueOffsetDays = `Use a day between ${O.DUE_OFFSET.MIN} and ${O.DUE_OFFSET.MAX}.`;
  const sm = normChecklistKey(stepMode);
  if (!O.STEP_MODES.some(s => normChecklistKey(s) === sm)) errors.stepMode = 'Choose Guided or Self-guided.';
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
