// js/api-bizgoals.js — Goals & Actions Graph calls (N-532 / BG-1)
// Loads on command-centre.html only, after bizgoals-data.js. Graph calls and role gates only; every rule is pure in
// bizgoals-data.js. Lists (CONFIG.BIZGOALS.LISTS): BusinessGoals, BusinessActions, BusinessGoalUpdates. SharePoint locks all three
// to Newton Admins (Edit) and Newton Leadership (Contribute without delete); a user outside both gets a 403, read here as no
// rows (CONFIG.RESTRICTED_LISTS). Nothing is persistently cached or exposed to Newton for Claude / the Command Bar (N-535
// decides the MCP side). Writes: capability bizgoalsEdit (Admin, Leadership), under Ghost Mode the ghosted role; the who stamp
// is the real signed-in user and never comes from the caller. Deletes: bizgoalsDelete (Admin only). An update entry can be added
// but never edited or deleted on its own (BG-D13); it goes only with its goal.

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
