// js/api-onboarding-team.js — the reads and writes behind My Team > Onboarding (N-502 / ONB-7, epic N-482)
//
// Its own file because it reaches the PDP status reader (loadJoinerGoalSetting, api-pdp.js): api-onboarding.js is loaded by reporting.html and
// admin.html, which do not load the PDP files (N-479 closure). my-momentum.html only, after api-pdp.js and api-onboarding.js; never mobile.html,
// Newton for Claude or the Command Bar.

// The line manager's and CSD's page (ONB-D72) and its writes. Rights come from the plan's relations (onbTeamPlans / onbSignoffRights), never
// from the role alone: Leadership and People Ops see nothing here unless they are the joiner's line manager or CSD (ONB-D9). Every write re-reads
// fresh and re-checks every rule. LM sign-offs are OnboardingSignoffs rows (Newton Users Contribute, append-only); only the CSD countersign
// touches OnboardingPlans, and only an Admin can (ONB-D67). Under Ghost Mode the rights follow the ghosted person; the signer recorded is the
// real signed-in user, as DoneByEmail is.

// Every OnboardingSignoffs row, read fresh. A failed read throws: showing every sign-off as unsigned could invite a second one.
async function getOnboardingSignoffs() {
  _cacheInvalidate(CONFIG.ONBOARDING.SIGNOFF.LIST);
  return getItems(CONFIG.ONBOARDING.SIGNOFF.LIST);
}

// The My Team tab signal for my-momentum-app.js: { team } = how many Active or Complete plans the viewer is line manager or CSD of (Admin: all).
// Zero unless the gate is live or Admin preview; any read failure is zero (the sub-tab stays hidden, nothing throws).
async function resolveOnboardingTeamNav() {
  try {
    const { email, role } = await _onbViewerCtx();
    const [gate, plans, people] = await Promise.all([resolveOnboardingGate(), getOnboardingPlans(), getPeople(false)]);
    if (gate.state !== 'live' && gate.state !== 'preview') return { team: 0 };
    return { team: onbTeamPlans({ plans, people, email, role, peopleOpsActive: gate.peopleOpsActive }).length };
  } catch (e) {
    console.warn('My Team onboarding: tab signal unavailable', e);
    return { team: 0 };
  }
}

// The page. -> { none: true, gateState } when the viewer looks after no plan, else { gateState, readOnly } plus the onbTeamModel result.
// Progress is read only for the viewer's own plans, after they are known. The PDP status is a status-only read that never fails the page.
async function getOnboardingTeamView() {
  const O = CONFIG.ONBOARDING;
  const { email, role } = await _onbViewerCtx();
  const [gate, plans, people, templates] = await Promise.all([
    resolveOnboardingGate(), getOnboardingPlans(), getPeople(false), getChecklistTemplates(O.RECORD_TYPE),
  ]);
  if (gate.state !== 'live' && gate.state !== 'preview') return { none: true, gateState: gate.state };
  const mine = onbTeamPlans({ plans, people, email, role, peopleOpsActive: gate.peopleOpsActive });
  if (!mine.length) return { none: true, gateState: gate.state };
  const [rows, signoffs] = await Promise.all([
    Promise.all(mine.map(m => getChecklistProgress(O.RECORD_TYPE, { recordId: m.plan.PersonID }))),
    getOnboardingSignoffs(),
  ]);
  const progressByPlan = {};
  mine.forEach((m, i) => { progressByPlan[String(m.plan.id)] = rows[i]; });
  let pdpByPerson = {};
  try {
    pdpByPerson = await loadJoinerGoalSetting(mine.map(m => m.plan.PersonID));
  } catch (e) {
    console.warn('My Team onboarding: goal-setting status unavailable', e);
  }
  const readOnly = gate.state === 'preview';
  return Object.assign({ gateState: gate.state, readOnly }, onbTeamModel({
    plans, people, templates, progressByPlan, signoffs, pdpByPerson, email, role, peopleOpsActive: gate.peopleOpsActive, todayISO: localDayISO(), readOnly,
  }));
}

// The viewer's plan for a write: live gate (Preview is read-only), a plan they look after, Active. Fresh reads. -> everything the write needs.
async function _onbTeamWriteCtx(planId) {
  const O = CONFIG.ONBOARDING;
  const { email, role } = await _onbViewerCtx();
  _onbDropCaches();
  _cacheInvalidate(O.SIGNOFF.LIST);
  const [gate, plans, people, templates, signoffs] = await Promise.all([
    resolveOnboardingGate(), getOnboardingPlans(), getPeople(false), getChecklistTemplates(O.RECORD_TYPE), getOnboardingSignoffs(),
  ]);
  if (gate.state === 'preview') throw new Error(O.TEAM_TEXT.reasons.preview);
  if (gate.state !== 'live') throw new Error('Onboarding is not available to you.');
  const want = String(planId == null ? '' : planId).trim();
  const entry = onbTeamPlans({ plans, people, email, role, peopleOpsActive: gate.peopleOpsActive }).find(m => String(m.plan.id) === want);
  if (!entry) throw new Error('That onboarding plan is not available to you.');
  if (entry.plan.Status !== O.PLAN_ACTIVE) throw new Error(O.TEAM_TEXT.reasons.closed);
  return { gate, entry, plan: entry.plan, people, templates, signoffs, email, role };
}

// Sign off or withdraw the role-play (kind 'roleplay') or the Day-30 line-manager review (kind 'day30'). One OnboardingSignoffs row is created
// (Signed / Withdrawn, the real signed-in user, today). Then the linked checklist step is ticked or unticked (ONB-D71); if only that fails the
// sign-off still stands and the result carries a warning. -> { ok: true, warning: '' | 'step' }
async function signOffOnboarding({ planId, kind, action } = {}) {
  const O = CONFIG.ONBOARDING;
  const S = O.SIGNOFF;
  if (!Object.prototype.hasOwnProperty.call(S.ACTION_KINDS, kind)) throw new Error('Unknown sign-off.');
  if (!S.ACTIONS.includes(action)) throw new Error('Unknown sign-off action.');
  const c = await _onbTeamWriteCtx(planId);
  const progressRows = await getChecklistProgress(O.RECORD_TYPE, { recordId: c.plan.PersonID });
  const model = onbPlanModel({ plan: c.plan, people: c.people, templates: c.templates, progressRows, email: c.email, role: c.role, peopleOpsActive: c.gate.peopleOpsActive, todayISO: localDayISO() });
  const state = onbSignoffState({ signoffs: c.signoffs, plan: c.plan });
  const gate = onbDay30Gate({ model, state });
  const rights = onbSignoffRights({ relations: c.entry.relations, planStatus: c.plan.Status, state, gate, csdPresent: !!onbPlanParties(c.plan, c.people).csd });
  const r = rights[kind === 'roleplay' ? 'roleplay' : 'day30lm'];
  if (action === 'sign' ? !r.canSign : !r.canWithdraw) throw new Error(r.reason || 'That sign-off is not available.');
  const kindName = S.ACTION_KINDS[kind];
  await createItem(S.LIST, {
    Title: `${c.plan.id}-${kindName}`,
    PlanID: Number(c.plan.id),
    PersonID: Number(c.plan.PersonID),
    Kind: kindName,
    Outcome: action === 'sign' ? S.SIGNED : S.WITHDRAWN,
    SignedByEmail: (getCurrentUser()?.email || '').trim().toLowerCase(),
    SignedAt: isoDate(localDayISO()),
  });
  const stepKey = String(S.STEP_KEYS[kind] || '').trim();
  const step = stepKey ? activeChecklistItems(c.templates, O.RECORD_TYPE, c.plan.Track).find(t => String(t.ItemKey == null ? '' : t.ItemKey).trim() === stepKey) : null;
  if (!step) return { ok: true, warning: '' };
  try {
    const prev = resolveChecklistProgress(progressRows).get(stepKey) || null;
    await setChecklistItemDone(O.RECORD_TYPE, c.plan.PersonID, stepKey, action === 'sign', prev ? prev.rowId : null);
  } catch (e) {
    console.warn('My Team onboarding: the linked step was not updated', e);
    return { ok: true, warning: 'step' };
  }
  return { ok: true, warning: '' };
}

// The CSD countersign: needs the line manager's Day-30 sign-off. One update on the plan row writes CSDSignedByEmail, CSDSignedAt and
// Status = Complete together, so a plan is never half-closed. Admin only (CSDs hold Admin), through the same gate as the other plan writes.
async function countersignOnboarding({ planId } = {}) {
  const O = CONFIG.ONBOARDING;
  await _onbPlanWriteGate();
  const c = await _onbTeamWriteCtx(planId);
  const state = onbSignoffState({ signoffs: c.signoffs, plan: c.plan });
  const rights = onbSignoffRights({ relations: c.entry.relations, planStatus: c.plan.Status, state, csdPresent: !!onbPlanParties(c.plan, c.people).csd });
  if (!rights.csd.canSign) throw new Error(rights.csd.reason || 'You cannot countersign this plan.');
  await updateItem(O.PLAN_LIST, c.plan.id, onbCleanPlanFields({
    CSDSignedByEmail: (getCurrentUser()?.email || '').trim().toLowerCase(),
    CSDSignedAt: localDayISO(),
    Status: O.PLAN_STATUSES[1],
  }));
}
