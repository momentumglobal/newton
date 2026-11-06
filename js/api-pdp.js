// js/api-pdp.js — SharePoint reads for the Development & Performance (PDP) epic (N-433 / PDP-1).
// Graph calls only; every rule lives in pdp-identity.js. Depends on getPeople (api.js),
// getCurrentUser (auth.js), getGhostUser / _ensureGhostGate (api.js). N-434 adds the list getters
// and writers; payload rules live in pdp-data.js (pdpClean*). Lists are named only through
// CONFIG.PDP.LISTS. PDP data is never cached, never exposed to MCP / Command Bar (PDP-D12), and
// there is deliberately no delete writer: add one with the task that needs it.

// The signed-in user's PDP identity: my People row, line manager, CSD, direct reports and CSD
// tree. Ghost-aware exactly like getEffectiveRole(): an admin's Ghost Mode resolves as the
// ghosted user; for anyone else the stored ghost key is ignored (the gate fails closed).
// Reads People through getPeople(), so it adds no new cache entry, and the result is never
// stored: callers re-resolve per page.
async function getPdpIdentity() {
  await _ensureGhostGate();
  const email = pdpEffectiveEmail(getCurrentUser()?.email, getGhostUser());
  const people = await getPeople(false);   // every non-placeholder row: a leaver still resolves as a manager
  return pdpResolveIdentity(people, email);
}

// ── N-434: list reads ──────────────────────────────────────────────────
// Optional filters are whole numbers (validated) — never string-built from user input.
function _pdpNumFilter(col, v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error('PDP filter ' + col + ' must be a whole number');
  return 'fields/' + col + ' eq ' + n;
}
function _pdpFilter(parts) { return parts.filter(Boolean).join(' and '); }

async function getPdpFramework() { return getItems(CONFIG.PDP.LISTS.FRAMEWORK); }
async function getPdpTemplates() { return getItems(CONFIG.PDP.LISTS.TEMPLATES); }
async function getPdpCycles(personId, year) {
  return getItems(CONFIG.PDP.LISTS.CYCLES, _pdpFilter([_pdpNumFilter('PersonID', personId), _pdpNumFilter('CycleYear', year)]));
}
async function getPdpMeetings(personId, year) {
  return getItems(CONFIG.PDP.LISTS.MEETINGS, _pdpFilter([_pdpNumFilter('PersonID', personId), _pdpNumFilter('CycleYear', year)]));
}
async function getPdpGoals(personId, year) {
  return getItems(CONFIG.PDP.LISTS.GOALS, _pdpFilter([_pdpNumFilter('PersonID', personId), _pdpNumFilter('CycleYear', year)]));
}
async function getPdpActions(personId) {
  return getItems(CONFIG.PDP.LISTS.ACTIONS, _pdpFilter([_pdpNumFilter('PersonID', personId)]));
}
async function getPdpScores(meetingId) {
  return getItems(CONFIG.PDP.LISTS.SCORES, _pdpFilter([_pdpNumFilter('MeetingID', meetingId)]));
}

// ── N-434: list writes — one create/update call each, payload from pdpClean* first ──
async function createPdpFramework(fields)       { return createItem(CONFIG.PDP.LISTS.FRAMEWORK, pdpCleanFramework(fields, 'create')); }
async function updatePdpFramework(id, fields)   { return updateItem(CONFIG.PDP.LISTS.FRAMEWORK, id, pdpCleanFramework(fields, 'update')); }
async function createPdpTemplate(fields)        { return createItem(CONFIG.PDP.LISTS.TEMPLATES, pdpCleanTemplates(fields, 'create')); }
async function updatePdpTemplate(id, fields)    { return updateItem(CONFIG.PDP.LISTS.TEMPLATES, id, pdpCleanTemplates(fields, 'update')); }
async function createPdpCycle(fields)           { return createItem(CONFIG.PDP.LISTS.CYCLES, pdpCleanCycles(fields, 'create')); }
async function updatePdpCycle(id, fields)       { return updateItem(CONFIG.PDP.LISTS.CYCLES, id, pdpCleanCycles(fields, 'update')); }
async function createPdpMeeting(fields)         { return createItem(CONFIG.PDP.LISTS.MEETINGS, pdpCleanMeetings(fields, 'create')); }
async function updatePdpMeeting(id, fields)     { return updateItem(CONFIG.PDP.LISTS.MEETINGS, id, pdpCleanMeetings(fields, 'update')); }
async function createPdpGoal(fields)            { return createItem(CONFIG.PDP.LISTS.GOALS, pdpCleanGoals(fields, 'create')); }
async function updatePdpGoal(id, fields)        { return updateItem(CONFIG.PDP.LISTS.GOALS, id, pdpCleanGoals(fields, 'update')); }
async function createPdpAction(fields)          { return createItem(CONFIG.PDP.LISTS.ACTIONS, pdpCleanActions(fields, 'create')); }
async function updatePdpAction(id, fields)      { return updateItem(CONFIG.PDP.LISTS.ACTIONS, id, pdpCleanActions(fields, 'update')); }
// `source` is the row's Source (Self / Manager / Agreed) so an update cannot smuggle calibration
// fields onto a Self or Manager row.
async function createPdpScore(fields)           { return createItem(CONFIG.PDP.LISTS.SCORES, pdpCleanScores(fields, 'create')); }
async function updatePdpScore(id, fields, source) { return updateItem(CONFIG.PDP.LISTS.SCORES, id, pdpCleanScores(fields, 'update', source)); }

// ── N-435 (PDP-3): access report + re-point (Admin / People Ops) ──────
// The flow locks each personal-list item to its PersonEmail / LineManagerEmail / CSDEmail /
// ReadOnlyEmails snapshot. Newton keeps the snapshots right: the rules are pure in pdp-data.js
// (pdpBuildRepointPlan, pdpUnsecuredItems); this file only reads and writes. Callers gate on
// roleCan(role, 'pdpAdmin'); SharePoint enforces it regardless (only Admins / People hold edit
// on every item).

// One personal list, plus Created (the unsecured-age clock). Explicit select: the default
// LIST_FIELDS projection is left untouched for every other reader.
function _pdpAccessRead(listName, filter) {
  return getItems(listName, filter || '', ['Id', ...CONFIG.LIST_FIELDS[listName], 'Created'].join(','));
}

// Every personal list, or only `personIds`' rows (one PersonID-filtered read per person per list).
async function _pdpReadPersonal(personIds) {
  const lists = pdpPersonalLists();
  const itemsByList = {};
  await Promise.all(lists.map(async list => {
    if (!personIds) { itemsByList[list] = await _pdpAccessRead(list); return; }
    const parts = await Promise.all(personIds.map(id => _pdpAccessRead(list, _pdpNumFilter('PersonID', id))));
    itemsByList[list] = [].concat(...parts);
  }));
  const denied = lists.filter(l => wasListDenied(l));
  return { itemsByList, denied };
}

// Data Health -> PDP access. { unsecured, drift, unresolved, denied, counts: { list: n } }.
// A denied list for Admin / People Ops is a permissions misconfiguration and is reported as such.
async function getPdpAccessReport() {
  const [people, read] = await Promise.all([getPeople(false), _pdpReadPersonal(null)]);
  const plan = pdpBuildRepointPlan(people, read.itemsByList);
  const counts = {};
  Object.keys(read.itemsByList).forEach(l => { counts[l] = read.itemsByList[l].length; });
  return {
    unsecured: pdpUnsecuredItems(read.itemsByList, Date.now()),
    drift: plan.rows,
    unresolved: plan.unresolved,
    denied: read.denied,
    counts,
  };
}

const _PDP_REPOINT_WRITERS = {
  CYCLES:   (id, patch) => updatePdpCycle(id, patch),
  MEETINGS: (id, patch) => updatePdpMeeting(id, patch),
  GOALS:    (id, patch) => updatePdpGoal(id, patch),
  ACTIONS:  (id, patch) => updatePdpAction(id, patch),
  SCORES:   (id, patch, row) => updatePdpScore(id, patch, row.source),
};

// Re-point the snapshots of `personIds` (all people when omitted) to their current line manager
// and CSD; the PDP access flow then re-permissions each patched item. An empty list does nothing.
// One update per patch, one at a time; a failed row is recorded and the rest carry on.
// -> { written, failed: [{ list, id, message }], unresolved, denied }
async function repointPdpAccess(personIds) {
  const ids = personIds ? personIds.map(String).filter(Boolean) : null;
  if (ids && !ids.length) return { written: 0, failed: [], unresolved: [], denied: [] };
  const [people, read] = await Promise.all([getPeople(false), _pdpReadPersonal(ids)]);
  const plan = pdpBuildRepointPlan(people, read.itemsByList, ids);
  const keyOf = {};
  CONFIG.PDP.PERSONAL_LIST_KEYS.forEach(k => { keyOf[CONFIG.PDP.LISTS[k]] = k; });
  const out = { written: 0, failed: [], unresolved: plan.unresolved, denied: read.denied };
  for (const row of plan.rows) {
    try {
      await _PDP_REPOINT_WRITERS[keyOf[row.list]](row.id, row.patch, row);
      out.written++;
    } catch (e) {
      out.failed.push({ list: row.list, id: row.id, message: e && e.message ? e.message : String(e) });
    }
  }
  return out;
}