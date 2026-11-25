// js/api-bizgoals.js — Goals & Actions Graph calls (N-532 / BG-1)
// Loads on command-centre.html only, after bizgoals-data.js. Graph calls and role gates only; every rule is pure in
// bizgoals-data.js. Lists (CONFIG.BIZGOALS.LISTS): BusinessGoals, BusinessActions, BusinessGoalUpdates. SharePoint locks all three
// to Newton Admins (Edit) and Newton Leadership (Contribute without delete); a user outside both gets a 403, read here as no
// rows (CONFIG.RESTRICTED_LISTS). Nothing is persistently cached or exposed to Newton for Claude / the Command Bar (N-535
// decides the MCP side). Writes: capability bizgoalsEdit (Admin, Leadership), under Ghost Mode the ghosted role; the who stamp
// is the real signed-in user and never comes from the caller. Deletes: bizgoalsDelete (Admin only). An update entry can be added
// but never edited or deleted on its own (BG-D13); it goes only with its goal.
// N-533 (BG-2): the Command Centre page (bizgoals-track-ui.js) calls only the tracker functions at the bottom of this file
// plus addBusinessGoalUpdate / deleteBusinessGoal / deleteBusinessAction. Each re-reads fresh, applies the pure rule from
// bizgoals-track.js, then goes through the N-532 writers above, so cleaning, stamping and the owner rule stay in one place.

function _bgNumFilter(col, v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error('Business goals filter ' + col + ' must be a whole number');
  return 'fields/' + col + ' eq ' + n;
}

// Every column plus Created / Modified (the "when" of a change; the server's clock, not the browser's).
function _bgRead(list, filter) {
  return getItems(list, filter || '', ['Id', ...CONFIG.LIST_FIELDS[list], 'Created', 'Modified'].join(','));
}

async function getBusinessGoals()   { return _bgRead(CONFIG.BIZGOALS.LISTS.GOALS); }
async function getBusinessActions() { return _bgRead(CONFIG.BIZGOALS.LISTS.ACTIONS); }
// All entries, or one goal's (indexed GoalID, server-side). Newest first is the caller's sort (Created).
async function getBusinessGoalUpdates({ goalId = null } = {}) {
  return _bgRead(CONFIG.BIZGOALS.LISTS.UPDATES, goalId == null ? '' : _bgNumFilter('GoalID', goalId));
}

// -> [{ email, name }] (bizgoalsOwnerCandidates). fresh = bypass the 30 s cache: every write path passes it.
async function getBizGoalOwnerCandidates({ fresh = false } = {}) {
  if (fresh) { _cacheInvalidate('UserAssignments'); _cacheInvalidate('LeadershipAccess'); }
  const [userRows, leadershipRows] = await Promise.all([getItems('UserAssignments'), getLeadershipAccess()]);
  return bizgoalsOwnerCandidates({ userRows, leadershipRows });
}

// The signed-in user once the role passes `cap`. Under Ghost Mode the role is the ghosted person's, the stamp stays the real user.
async function _bgActor(cap) {
  await _ensureGhostGate();
  const user = getCurrentUser();
  const email = String(user && user.email || '').toLowerCase();
  if (!email) throw new Error('Sign in to change business goals.');
  const role = await getEffectiveRole(email);
  if (!roleCan(role, cap)) throw new Error(cap === 'bizgoalsDelete' ? 'Only an Admin can delete business goals.' : 'Only Admin and Leadership can change business goals.');
  return { email, name: String((user && user.name) || email) };
}

// Adds OwnerName to `clean` when the owner is new or changed; an unchanged owner (even one who has since lost access) is left alone.
async function _bgApplyOwner(clean, currentEmail) {
  if (clean.OwnerEmail === undefined) return;
  const r = bizgoalsOwnerChange(currentEmail, clean.OwnerEmail, await getBizGoalOwnerCandidates({ fresh: true }));
  if (r.error) throw new Error(r.error);
  if (r.changed) clean.OwnerName = r.name;
  else delete clean.OwnerEmail;
}

async function _bgRequireGoal(goalId) {
  try { return await getItem(CONFIG.BIZGOALS.LISTS.GOALS, goalId); }
  catch (e) { throw new Error('Business goal ' + goalId + ' was not found.'); }
}

async function createBusinessGoal(fields) {
  const actor = await _bgActor('bizgoalsEdit');
  const clean = bizgoalsCleanGoal(fields, 'create');
  await _bgApplyOwner(clean, '');
  return createItem(CONFIG.BIZGOALS.LISTS.GOALS, { ...clean, ...bizgoalsStamp(actor.email, true) });
}

async function updateBusinessGoal(id, fields) {
  const actor = await _bgActor('bizgoalsEdit');
  const list = CONFIG.BIZGOALS.LISTS.GOALS;
  const clean = bizgoalsCleanGoal(fields, 'update');
  if (clean.OwnerEmail !== undefined) await _bgApplyOwner(clean, (await getItem(list, id)).OwnerEmail);
  return updateItem(list, id, { ...clean, ...bizgoalsStamp(actor.email, false) });
}

async function createBusinessAction(fields) {
  const actor = await _bgActor('bizgoalsEdit');
  const clean = bizgoalsCleanAction(fields, 'create', new Date().toISOString());
  await _bgRequireGoal(clean.GoalID);
  await _bgApplyOwner(clean, '');
  return createItem(CONFIG.BIZGOALS.LISTS.ACTIONS, { ...clean, ...bizgoalsStamp(actor.email, true) });
}

async function updateBusinessAction(id, fields) {
  const actor = await _bgActor('bizgoalsEdit');
  const list = CONFIG.BIZGOALS.LISTS.ACTIONS;
  const clean = bizgoalsCleanAction(fields, 'update', new Date().toISOString());
  if (clean.GoalID !== undefined) await _bgRequireGoal(clean.GoalID);
  if (clean.OwnerEmail !== undefined) await _bgApplyOwner(clean, (await getItem(list, id)).OwnerEmail);
  return updateItem(list, id, { ...clean, ...bizgoalsStamp(actor.email, false) });
}

// Append-only (BG-D13): there is no writer that edits or deletes a single entry.
async function addBusinessGoalUpdate(fields) {
  const actor = await _bgActor('bizgoalsEdit');
  const clean = bizgoalsCleanUpdate(fields);
  await _bgRequireGoal(clean.GoalID);
  return createItem(CONFIG.BIZGOALS.LISTS.UPDATES, { ...clean, AuthorEmail: actor.email, AuthorName: actor.name });
}

// Admin only. A goal that still has child goals or actions is refused with the counts (nothing deleted); otherwise its
// update entries go first, then the goal. -> { ok: false, blockers: { children, actions } } | { ok: true, updatesDeleted }
async function deleteBusinessGoal(id) {
  await _bgActor('bizgoalsDelete');
  const L = CONFIG.BIZGOALS.LISTS;
  [L.GOALS, L.ACTIONS].forEach(_cacheInvalidate);
  const [goals, actions] = await Promise.all([getBusinessGoals(), getBusinessActions()]);
  const blockers = bizgoalsDeleteBlockers(id, goals, actions);
  if (blockers.children || blockers.actions) return { ok: false, blockers };
  const updates = await getBusinessGoalUpdates({ goalId: id });
  for (const u of updates) await deleteItem(L.UPDATES, u.id);
  await deleteItem(L.GOALS, id);
  return { ok: true, updatesDeleted: updates.length };
}

async function deleteBusinessAction(id) {
  await _bgActor('bizgoalsDelete');
  return deleteItem(CONFIG.BIZGOALS.LISTS.ACTIONS, id);
}

// ── N-533 (BG-2): tracker reads and writes ─────────────────────────────────────────────────────────────────────

function _bgInvalidateAll() { const L = CONFIG.BIZGOALS.LISTS; [L.GOALS, L.ACTIONS, L.UPDATES].forEach(_cacheInvalidate); }

// Everything the page draws from. denied = a list answered 403 (the user is in neither SharePoint group).
// -> { goals, actions, updates, candidates, denied }
async function getBusinessGoalsData({ fresh = false } = {}) {
  const L = CONFIG.BIZGOALS.LISTS;
  if (fresh) _bgInvalidateAll();
  const [goals, actions, updates, candidates] = await Promise.all([getBusinessGoals(), getBusinessActions(), getBusinessGoalUpdates(), getBizGoalOwnerCandidates({ fresh })]);
  const denied = [L.GOALS, L.ACTIONS, L.UPDATES].some(wasListDenied);
  return { goals, actions, updates, candidates, denied };
}

// Create (no edit.id) or update a goal from the tracker form (nesting, level / period and carried rules: bizgoalsTrackerGoalPayload).
async function saveTrackerBusinessGoal(edit) {
  await _bgActor('bizgoalsEdit');
  const e = edit || {};
  _bgInvalidateAll();
  const goals = await getBusinessGoals();
  if (!e.id) return createBusinessGoal(bizgoalsTrackerGoalPayload(e, 'create', goals, null));
  const existing = goals.find(g => String(g.id) === String(e.id));
  return updateBusinessGoal(e.id, bizgoalsTrackerGoalPayload(e, 'update', goals, existing));
}

// Create (no edit.id) or update an action from the tracker form (BG-D12: an Open goal; bizgoalsTrackerActionPayload).
async function saveTrackerBusinessAction(edit) {
  await _bgActor('bizgoalsEdit');
  const e = edit || {};
  _bgInvalidateAll();
  const [goals, actions] = await Promise.all([getBusinessGoals(), getBusinessActions()]);
  if (!e.id) return createBusinessAction(bizgoalsTrackerActionPayload(e, 'create', goals, null));
  const existing = actions.find(a => String(a.id) === String(e.id));
  return updateBusinessAction(e.id, bizgoalsTrackerActionPayload(e, 'update', goals, existing));
}

// RAG / Status from the tracker selects. A carried goal whose copy still exists cannot change here.
async function setBusinessGoalLive(id, patch) {
  await _bgActor('bizgoalsEdit');
  _bgInvalidateAll();
  const goals = await getBusinessGoals();
  const g = goals.find(x => String(x.id) === String(id));
  if (!g) throw new Error('That goal was not found.');
  if (g.Status === CONFIG.BIZGOALS.CARRIED && goals.some(c => c.CarriedFromID != null && String(c.CarriedFromID) === String(id))) {
    throw new Error('This goal was carried forward. Change it in the year it was carried to.');
  }
  return updateBusinessGoal(id, bizgoalsLiveGoalPatch(patch));
}

async function setBusinessActionDone(id, done) {
  await _bgActor('bizgoalsEdit');
  return updateBusinessAction(id, { IsDone: !!done });
}

// The rollover plan from a fresh read (bizgoalsRolloverPlan); the stale-owner swap goes to the signed-in user.
async function _bgRolloverPlanFresh(fromYear, goalIds, actorEmail) {
  _bgInvalidateAll();
  const data = await getBusinessGoalsData({ fresh: true });
  return bizgoalsRolloverPlan({ goals: data.goals, actions: data.actions, updates: data.updates, candidates: data.candidates, fromYear, goalIds, actorEmail });
}

// Read-only: what rolling `goalIds` over from `fromYear` would do (the confirm step shows it).
async function bizgoalsRolloverPreview(fromYear, goalIds) {
  const actor = await _bgActor('bizgoalsEdit');
  return _bgRolloverPlanFresh(fromYear, goalIds, actor.email);
}

// BG-D14 to BG-D17. Per goal, in this order: copy (unless a copy exists), move its open actions, close its open sub-goals,
// add the audit entry (once), close the goal. The goal stays Open until the last step, so a failure part-way is finished by
// running it again, never doubled. One goal failing does not stop the next.
// -> { toYear, done: [{ goalId, copyId }], skipped: [{ goalId, reason }], failed: [{ goalId, message }] }
async function rolloverBusinessGoals(fromYear, goalIds) {
  const actor = await _bgActor('bizgoalsEdit');
  const C = CONFIG.BIZGOALS;
  const plan = await _bgRolloverPlanFresh(fromYear, goalIds, actor.email);
  const out = { toYear: plan.toYear, done: [], skipped: plan.skipped, failed: [] };
  for (const it of plan.items) {
    try {
      const copyId = it.copyId || String((await createBusinessGoal(it.copy)).id);
      for (const aid of it.moveActionIds) await updateBusinessAction(aid, { GoalID: Number(copyId) });
      for (const gid of it.closeIds) await updateBusinessGoal(gid, { Status: C.CARRIED });
      if (it.addEntry) await addBusinessGoalUpdate({ GoalID: it.goalId, UpdateText: 'Carried forward to ' + plan.toYear + '.', StatusAtUpdate: C.CARRIED });
      await updateBusinessGoal(it.goalId, { Status: C.CARRIED });
      out.done.push({ goalId: it.goalId, copyId });
    } catch (e) {
      console.error('N-533: rollover failed for goal ' + it.goalId, e);
      out.failed.push({ goalId: it.goalId, message: e.message });
    }
  }
  return out;
}
