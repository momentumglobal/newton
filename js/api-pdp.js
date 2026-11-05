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