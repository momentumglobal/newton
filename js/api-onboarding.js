// js/api-onboarding.js — SharePoint reads and writes for My Onboarding (N-496 / ONB-1, epic N-482).
// Graph calls only; the rules are pure in onboarding-logic.js and the constants in CONFIG.ONBOARDING
// (onboarding-config.js). Loaded on reporting.html straight after onboarding-logic.js; N-497 adds
// people.html (the employee-record card) and admin.html (Data Health), N-499 my-momentum.html. Not in CONFIG.MCP.scripts.
//
//   AppSettings      OnboardingMode / OnboardingPilot on the single 'config' row (the switch, ONB-D11).
//   OnboardingPlans  one row per person's plan (ONB-D18). Never tier-2 cached. Newton Users read,
//                    Newton Admins edit (deviation from Tier 4, like SLATargets). N-497 is the first writer.
//   UserAssignments  read only, to tell whether anyone holds people_ops (ONB-D17).
// Ticks are ChecklistProgress rows (Title 'person'), read and written through api-checklists.js.

// -> { mode, pilot: [emails] }. A missing row, missing columns or a failed read is Off, [] (fail closed).
async function readOnboardingSwitch() {
  const row = await _getAppSettingsRow();
  const S = CONFIG.ONBOARDING.SETTINGS;
  return {
    mode: onbNormaliseMode(row ? row[S.MODE] : null),
    pilot: pdpParsePilot(row ? row[S.PILOT] : ''),
  };
}

// Admin only (onbSwitch), under Ghost Mode the ghosted user's role. Writes only the fields passed;
// creates the 'config' row when it is missing (same shape as writePdpSwitch).
async function writeOnboardingSwitch({ mode, pilot } = {}) {
  await _ensureGhostGate();
  const role = await getEffectiveRole(getCurrentUser()?.email || '');
  if (!roleCan(role, 'onbSwitch')) throw new Error('Only an Admin can change the onboarding switch.');
  const O = CONFIG.ONBOARDING;
  const fields = {};
  if (mode !== undefined) {
    const m = String(mode).trim();
    if (!O.MODES.includes(m)) throw new Error('Onboarding mode must be one of ' + O.MODES.join(' / ') + '.');
    fields[O.SETTINGS.MODE] = m;
  }
  if (pilot !== undefined) {
    const list = Array.isArray(pilot) ? pilot : pdpParsePilot(pilot);
    const bad = list.find(e => !pdpIsEmail(String(e).trim()));
    if (bad !== undefined) throw new Error('Not a valid pilot email address: ' + bad);
    fields[O.SETTINGS.PILOT] = pdpParsePilot(list.join(O.EMAIL_SEP)).join(O.EMAIL_SEP);
  }
  if (!Object.keys(fields).length) return;
  const row = await _getAppSettingsRow();
  if (row) await updateItem('AppSettings', row.id, fields);
  else     await createItem('AppSettings', { Title: 'config', ...fields });
}

// OnboardingPlans rows; for one person when personId is given (indexed PersonID, server-side).
async function getOnboardingPlans({ personId = null } = {}) {
  const list = CONFIG.ONBOARDING.PLAN_LIST;
  if (personId === null || personId === undefined || personId === '') return getItems(list);
  const n = Number(personId);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid People id: ${personId}`);
  return getItems(list, `fields/PersonID eq ${n}`);
}

// True when any active UserAssignments row holds people_ops (ONB-D17). One read, 30 s cache.
async function hasActivePeopleOps() {
  const rows = await getItems('UserAssignments');
  return rows.some(u => u.Active !== false && u.AssignedRole === CONFIG.ROLE_IDS.PEOPLE_OPS);
}

// The gate for the signed-in user (Ghost-aware): { mode, state, reason, peopleOpsActive }. Any read
// failure is 'none' for everyone but an Admin, who gets 'preview' with the error.
async function resolveOnboardingGate() {
  await _ensureGhostGate();
  const realEmail = getCurrentUser()?.email || '';
  const email = pdpEffectiveEmail(realEmail, getGhostUser());
  const role = await getEffectiveRole(realEmail);
  try {
    const [sw, people, plans, peopleOpsActive] = await Promise.all([
      readOnboardingSwitch(), getPeople(false), getOnboardingPlans(), hasActivePeopleOps(),
    ]);
    const gate = onbAccess({ mode: sw.mode, pilot: sw.pilot, people, plans, email, role, peopleOpsActive });
    return { mode: sw.mode, state: gate.state, reason: gate.reason, peopleOpsActive };
  } catch (e) {
    console.warn('Onboarding gate: read failed', e);
    const isAdmin = role === CONFIG.ROLE_IDS.ADMIN;
    return { mode: CONFIG.ONBOARDING.MODES[0], state: isAdmin ? 'preview' : 'none', reason: 'read-failed', error: e && e.message ? e.message : String(e), peopleOpsActive: false };
  }
}


// ── Plan writes (N-497 / ONB-2) ─────────────────────────────────────────
// Admin only (onbPlan; the CSD holds Admin). Every write re-reads fresh and re-checks, so a double click or two admins
// can never create two plan rows (Data Health check 'duplicate-plans' exists for the case that still slips through).

async function _onbPlanWriteGate() {
  await _ensureGhostGate();
  const role = await getEffectiveRole(getCurrentUser()?.email || '');
  if (!roleCan(role, 'onbPlan')) throw new Error('Only an Admin can start or change an onboarding plan.');
}

function _onbDropCaches() {
  [CONFIG.ONBOARDING.PLAN_LIST, 'People', 'ChecklistTemplates', 'ChecklistProgress'].forEach(_cacheInvalidate);
}

// One plan row by id, fresh. Throws when it is gone.
async function _onbPlanById(planId) {
  _cacheInvalidate(CONFIG.ONBOARDING.PLAN_LIST);
  const rows = await getOnboardingPlans();
  const plan = rows.find(p => String(p.id) === String(planId));
  if (!plan) throw new Error('That onboarding plan no longer exists. Refresh the page.');
  return plan;
}

// "Start onboarding": create the plan row for one person. buddyEmail is optional (ONB-D21). -> { id }
async function startOnboardingPlan({ personId, buddyEmail = '' } = {}) {
  await _onbPlanWriteGate();
  _onbDropCaches();
  const [people, plans, templates, sw] = await Promise.all([
    getPeople(false), getOnboardingPlans({ personId }), getChecklistTemplates(CONFIG.ONBOARDING.RECORD_TYPE), readOnboardingSwitch(),
  ]);
  const person = people.find(p => !p.IsPlaceholder && String(p.id) === String(personId)) || null;
  const todayISO = localDayISO();
  const chk = onbStartCheck({ person, people, plans, templates, mode: sw.mode, pilot: sw.pilot, todayISO });
  if (!chk.ok) throw new Error(onbReasonText(chk.reason));
  const fields = onbStartFields({ person, people, buddyEmail, byEmail: getCurrentUser()?.email || '', todayISO });
  const res = await createItem(CONFIG.ONBOARDING.PLAN_LIST, fields);
  return { id: res && res.id ? String(res.id) : null };
}

// Set, change or (blank) clear the buddy on an Active plan.
async function setOnboardingBuddy(planId, buddyEmail) {
  await _onbPlanWriteGate();
  const plan = await _onbPlanById(planId);
  if (String(plan.Status || '').trim() !== CONFIG.ONBOARDING.PLAN_ACTIVE) throw new Error('The buddy can only be changed on an Active plan.');
  const buddy = String(buddyEmail == null ? '' : buddyEmail).trim().toLowerCase();
  if (buddy) {
    _cacheInvalidate('People');
    const people = await getPeople(false);
    if (!onbBuddyCandidates(people, plan.PersonID, localDayISO()).some(c => c.email === buddy)) {
      throw new Error('That buddy cannot be picked: they are not an active Talent Partner who has started.');
    }
  }
  await updateItem(CONFIG.ONBOARDING.PLAN_LIST, plan.id, onbCleanPlanFields({ BuddyEmail: buddy }));
}

// Active -> Cancelled. A Complete plan is never touched.
async function cancelOnboardingPlan(planId) {
  await _onbPlanWriteGate();
  const plan = await _onbPlanById(planId);
  if (String(plan.Status || '').trim() !== CONFIG.ONBOARDING.PLAN_ACTIVE) throw new Error('Only an Active plan can be cancelled.');
  await updateItem(CONFIG.ONBOARDING.PLAN_LIST, plan.id, onbCleanPlanFields({ Status: 'Cancelled' }));
}

// Cancelled -> Active (same row; the ticks already made are kept). The person must still be an active People row.
async function restartOnboardingPlan(planId) {
  await _onbPlanWriteGate();
  const plan = await _onbPlanById(planId);
  if (String(plan.Status || '').trim() !== 'Cancelled') throw new Error('Only a Cancelled plan can be restarted.');
  _cacheInvalidate('People');
  const people = await getPeople(false);
  const person = people.find(p => !p.IsPlaceholder && String(p.id) === String(plan.PersonID));
  if (!person || !onbInScope(person)) throw new Error('This person is no longer an active Talent Partner, so the plan cannot be restarted.');
  await updateItem(CONFIG.ONBOARDING.PLAN_LIST, plan.id, onbCleanPlanFields({ Status: CONFIG.ONBOARDING.PLAN_ACTIVE }));
}

// The inputs for the Data Health "Onboarding plans" checks (onbCheckPlans). People includes inactive rows.
async function getOnboardingPlanInputs() {
  const [plans, people, templates] = await Promise.all([
    getOnboardingPlans(), getPeople(false), getChecklistTemplates(CONFIG.ONBOARDING.RECORD_TYPE),
  ]);
  return { plans, people, templates };
}


// ── Owner reminders (N-503 / ONB-8) ─────────────────────────────────────
// A client-side sweep for the signed-in user only (PDP N-441 pattern): the rules are pure in onboarding-reminders.js. Fires through
// fireNotification (notifications.js), so a row already active for the same key is never duplicated or un-read. Only this user's own
// onbDue / onbOverdue rows are ever cleared; PDP and every other notification row is left alone.
let _onbRemindersRan = false;

// The user's own active onboarding reminder rows.
async function _onbOwnReminderRows(me) {
  const types = Object.values(CONFIG.ONBOARDING.REMINDERS.TYPES);
  const rows = await getItems('Notifications', `fields/RecipientEmail eq '${odataStr(me)}' and fields/Status eq 'active'`);
  return rows.filter(r => types.includes(r.TriggerType));
}

// Marks the user's own active onboarding reminders cleared unless their key is in `keep`. -> number cleared.
async function _onbClearReminders(me, keep) {
  const keepSet = new Set(keep || []);
  const stale = (await _onbOwnReminderRows(me)).filter(r => !keepSet.has(r.TriggerKey));
  for (const r of stale) await updateItem('Notifications', r.id, { Status: 'cleared' });
  return stale.length;
}

// Everything the rules need: plans, people, templates and the progress of only the Active plans this person is a party to
// (parallel, one read per plan, never the whole ChecklistProgress list).
async function _onbReminderInputs(me, gate) {
  const O = CONFIG.ONBOARDING;
  const [plans, people, templates] = await Promise.all([getOnboardingPlans(), getPeople(false), getChecklistTemplates(O.RECORD_TYPE)]);
  const mine = onbReminderPlans({ plans, people, email: me, peopleOpsActive: gate.peopleOpsActive });
  const rows = await Promise.all(mine.map(m => getChecklistProgress(O.RECORD_TYPE, { recordId: m.plan.PersonID })));
  const progressByPlan = {};
  mine.forEach((m, i) => { progressByPlan[String(m.plan.id)] = rows[i]; });
  return { plans, people, templates, progressByPlan };
}

// Called once from my-momentum-app.js init, after the tab signals. Never throws. A failed read changes nothing (no clearing on error);
// a gate that is not live (Off, or not a party to any plan) clears this user's own reminder rows.
async function runOnboardingReminders() {
  if (_onbRemindersRan) return;
  _onbRemindersRan = true;
  try {
    await _ensureGhostGate();
    if (getGhostUser()) return;
    const me = _onbEmail(getCurrentUser()?.email || '');
    if (!me) return;
    const gate = await resolveOnboardingGate();
    if (gate.reason === 'read-failed') return;
    let send = [], keep = [];
    if (gate.state === 'live') {
      const inputs = await _onbReminderInputs(me, gate);
      ({ send, keep } = onbReminderPlan(Object.assign({ gate, email: me, today: localDayISO(new Date()), peopleOpsActive: gate.peopleOpsActive }, inputs)));
    }
    for (const s of send) {
      await fireNotification({ triggerType: s.type, triggerKey: s.key, tone: s.tone, deepLink: s.link, body: s.body, recipients: [me] });
    }
    const cleared = await _onbClearReminders(me, keep);
    if ((send.length || cleared) && typeof renderNotificationBell === 'function') await renderNotificationBell();
  } catch (e) { console.warn('Onboarding reminders unavailable', e); }
}


// ── My Onboarding page (N-499 / ONB-4) ──────────────────────────────────
// The joiner's and the buddy's view (ONB-D30). Rights come from the plan's relations (onbRelations / onbCanTick), never from the role alone:
// Leadership and People Ops see nothing here unless they are themselves a joiner or a buddy (ONB-D9). Under Ghost Mode the identity is the
// ghosted person's and DoneByEmail stays the real signed-in user (setChecklistItemDone), as every checklist does.

// { email, role }: the Ghost-aware viewer, as resolveOnboardingGate sees them.
async function _onbViewerCtx() {
  await _ensureGhostGate();
  const realEmail = getCurrentUser()?.email || '';
  return { email: pdpEffectiveEmail(realEmail, getGhostUser()), role: await getEffectiveRole(realEmail) };
}

// The tab signals for my-momentum-app.js: { plans, buddy, actions, rituals } (N-500: rituals = onbRitualsVisible; a failed read leaves it out, so false) (N-509: own plans, Active buddy plans, open Buddy-owned steps on
// them). Templates and progress are read only when the viewer buddies an Active plan, and progress only for those plans.
// Any read failure is all zero (the tabs stay hidden, nothing throws).
async function resolveOnboardingNav() {
  try {
    const O = CONFIG.ONBOARDING;
    const { email, role } = await _onbViewerCtx();
    const [gate, plans, people] = await Promise.all([resolveOnboardingGate(), getOnboardingPlans(), getPeople(false)]);
    const who = { gate, plans, people, email, role, peopleOpsActive: gate.peopleOpsActive };
    const buddy = gate.state === 'live' || gate.state === 'preview' ? onbBuddyPlans(who) : [];
    const rituals = onbRitualsVisible({ mode: gate.mode, gateState: gate.state });   // N-500 (ONB-D47): the Processes & Rituals tab
    if (!buddy.length) return Object.assign(onbNavSignal(who), { rituals });
    const [templates, rows] = await Promise.all([
      getChecklistTemplates(O.RECORD_TYPE),
      Promise.all(buddy.map(m => getChecklistProgress(O.RECORD_TYPE, { recordId: m.plan.PersonID }))),
    ]);
    const progressByPlan = {};
    buddy.forEach((m, i) => { progressByPlan[String(m.plan.id)] = rows[i]; });
    return Object.assign(onbNavSignal(Object.assign(who, { templates, progressByPlan, todayISO: localDayISO() })), { rituals });
  } catch (e) {
    console.warn('My Onboarding: tab signals unavailable', e);
    return { plans: 0, buddy: 0, actions: 0 };
  }
}

// The page for one plan the viewer relates to (planId '' = the first of their plans). Only that plan's progress is read.
// -> { none: true, gateState } when the viewer has no plan, else the onbPlanModel plus { gateState, choices }.
// Throws for a plan the viewer does not relate to, before any progress read.
async function getOnboardingPlanView(planId, { level = '' } = {}) {
  const { email, role } = await _onbViewerCtx();
  const O = CONFIG.ONBOARDING;
  const [gate, plans, people, templates] = await Promise.all([
    resolveOnboardingGate(), getOnboardingPlans(), getPeople(false), getChecklistTemplates(O.RECORD_TYPE),
  ]);
  if (gate.state !== 'live' && gate.state !== 'preview') return { none: true, gateState: gate.state };
  const mine = onbMyPlans({ plans, people, email, role, peopleOpsActive: gate.peopleOpsActive, kind: 'own' });   // N-509: own plan only; the buddy's are getBuddyingView
  if (!mine.length) return { none: true, gateState: gate.state };
  const want = String(planId == null ? '' : planId).trim();
  const entry = want ? mine.find(m => String(m.plan.id) === want) : mine[0];
  if (!entry) throw new Error('That onboarding plan is not available to you.');
  const progressRows = await getChecklistProgress(O.RECORD_TYPE, { recordId: entry.plan.PersonID });
  const model = onbPlanModel({
    plan: entry.plan, people, templates, progressRows, email, role, peopleOpsActive: gate.peopleOpsActive, todayISO: localDayISO(), level,
  });
  return Object.assign(model, { gateState: gate.state, choices: onbPlanChoices(mine, people) });
}

// Tick or untick one step. Fresh reads, then every rule again: live gate (Preview is read-only), a plan the viewer relates to, Active,
// an active visible step, and onbCanTick. One ChecklistProgress row is created or updated; unticking keeps the row (Done = false).
async function tickOnboardingStep({ planId, itemKey, done } = {}) {
  const O = CONFIG.ONBOARDING;
  const { email, role } = await _onbViewerCtx();
  if (typeof done !== 'boolean') throw new Error('A tick must be true or false.');
  _onbDropCaches();
  const [gate, plans, people, templates] = await Promise.all([
    resolveOnboardingGate(), getOnboardingPlans(), getPeople(false), getChecklistTemplates(O.RECORD_TYPE),
  ]);
  if (gate.state === 'preview') throw new Error('Preview is read-only.');
  if (gate.state !== 'live') throw new Error('Onboarding is not available to you.');
  const entry = onbMyPlans({ plans, people, email, role, peopleOpsActive: gate.peopleOpsActive })
    .find(m => String(m.plan.id) === String(planId == null ? '' : planId).trim());
  if (!entry) throw new Error('That onboarding plan is not available to you.');
  if (entry.plan.Status !== O.PLAN_ACTIVE) throw new Error('This plan is no longer active.');
  const key = String(itemKey == null ? '' : itemKey).trim();
  const step = key ? activeChecklistItems(templates, O.RECORD_TYPE, entry.plan.Track).find(t => String(t.ItemKey == null ? '' : t.ItemKey).trim() === key) : null;
  const emp = onbPlanParties(entry.plan, people).employee;
  const startDate = emp ? (spDateIn(emp.StartDate) || '') : '';
  if (!step || !onbStepVisible({ step, relations: entry.relations, startDate, todayISO: localDayISO() })) throw new Error('That step is not part of this plan.');
  if (!onbCanTick({ step, relations: entry.relations, peopleOpsActive: gate.peopleOpsActive, planStatus: entry.plan.Status })) throw new Error(O.PLAN_TEXT.tickNoRights);
  const rows = await getChecklistProgress(O.RECORD_TYPE, { recordId: entry.plan.PersonID });
  const prev = resolveChecklistProgress(rows).get(key) || null;
  return setChecklistItemDone(O.RECORD_TYPE, entry.plan.PersonID, key, done, prev ? prev.rowId : null);
}


// ── Buddying page (N-509 / ONB-4b) ──────────────────────────────────────
// The viewer's Active buddy plans as Buddying cards (onbBuddyModel), latest start first. Same viewer context and fresh-per-call reads as
// getOnboardingPlanView; progress is read only for the viewer's own Active buddy plans, after they are known, never for any other plan.
// -> { none: true, gateState } or { gateState, plans: [onbBuddyModel…] }. Ticking stays tickOnboardingStep (it re-checks every rule).
async function getBuddyingView() {
  const { email, role } = await _onbViewerCtx();
  const O = CONFIG.ONBOARDING;
  const [gate, plans, people, templates] = await Promise.all([
    resolveOnboardingGate(), getOnboardingPlans(), getPeople(false), getChecklistTemplates(O.RECORD_TYPE),
  ]);
  if (gate.state !== 'live' && gate.state !== 'preview') return { none: true, gateState: gate.state };
  const mine = onbBuddyPlans({ plans, people, email, role, peopleOpsActive: gate.peopleOpsActive });
  if (!mine.length) return { none: true, gateState: gate.state };
  const rows = await Promise.all(mine.map(m => getChecklistProgress(O.RECORD_TYPE, { recordId: m.plan.PersonID })));
  const todayISO = localDayISO();
  return {
    gateState: gate.state,
    plans: mine.map((m, i) => onbBuddyModel(onbPlanModel({
      plan: m.plan, people, templates, progressRows: rows[i], email, role, peopleOpsActive: gate.peopleOpsActive, todayISO,
    }))),
  };
}

// N-501 (ONB-D62): every SLATargets row for the Expectations & SLAs tab (company defaults are the rows with a ProjectType). The one
// reader, getSLATargets() in api-sla.js; Newton Users have Read on the list. The caller shows "unavailable" if this throws.
async function getOnboardingSlaRows() {
  return getSLATargets();
}

// N-518 (ONB-D102). The Learning Library tab's one read: the onboarding ChecklistTemplates rows (the same read every plan already makes,
// 30 s cache). No gate check: who sees the tab is the onbRituals signal; the rows carry no personal data. onbLibraryTabModel picks the Library.
async function getLearningLibraryRows() {
  return getChecklistTemplates(CONFIG.ONBOARDING.RECORD_TYPE);
}
