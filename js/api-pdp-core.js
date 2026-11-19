// js/api-pdp-core.js — PDP Graph calls shared by every PDP shell (N-479 / R3-10, split out of api-pdp.js).
// Loads on admin.html, reporting.html, people.html and my-momentum.html, directly before api-pdp.js
// (admin / reporting: in its slot, they do not load api-pdp.js). Owns: the Off / Pilot / On switch
// (readPdpSwitch / writePdpSwitch: the only part reporting.html calls), the Data Health access report
// and re-point (getPdpAccessReport / repointPdpAccess: admin.html and org-chart.js) and the update
// writers they use. Graph calls only; every rule lives in pdp-identity.js / pdp-data.js. The access
// report, re-point and update writers call pdp-data.js (pdpClean*, pdpBuildRepointPlan), which
// reporting.html does NOT load: reporting must never call them (the N-479 closure assertion checks it).
// PDP data is never cached and never exposed to MCP / Command Bar (PDP-D12); there is no delete writer.
// Not in CONFIG.MCP.scripts.

// Optional filters are whole numbers (validated) — never string-built from user input.
function _pdpNumFilter(col, v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error('PDP filter ' + col + ' must be a whole number');
  return 'fields/' + col + ' eq ' + n;
}

// ── list updates (the personal-list re-point below and api-pdp.js use them) ──
async function updatePdpCycle(id, fields)       { return updateItem(CONFIG.PDP.LISTS.CYCLES, id, pdpCleanCycles(fields, 'update')); }
async function updatePdpMeeting(id, fields)     { return updateItem(CONFIG.PDP.LISTS.MEETINGS, id, pdpCleanMeetings(fields, 'update')); }
async function updatePdpGoal(id, fields)        { return updateItem(CONFIG.PDP.LISTS.GOALS, id, pdpCleanGoals(fields, 'update')); }
async function updatePdpAction(id, fields)      { return updateItem(CONFIG.PDP.LISTS.ACTIONS, id, pdpCleanActions(fields, 'update')); }
// `source` is the row's Source (Self / Manager / Agreed) so an update cannot smuggle calibration
// fields onto a Self or Manager row.
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

// ── N-445 (PDP-13, PDP-D13): the Off / Pilot / On switch ───────────────────────────────────
// PDPMode and PDPPilot sit on the AppSettings 'config' row (column names: CONFIG.PDP.SETTINGS).
// The rules are pure in pdp-identity.js; this file only reads, writes and combines them. Named
// readPdpSwitch / writePdpSwitch / resolvePdpGate on purpose: a file that calls getPdp*() is
// treated as handling PDP records (the PDP-D12 source scan), and the switch holds none.

// -> { mode, pilot: [emails], remindersFrom: 'YYYY-MM-DD' }. A missing row, missing columns or a failed read is
// Off; a blank or invalid reminders-from date is CONFIG.PDP.REMINDERS.DEFAULT_FROM (N-441).
async function readPdpSwitch() {
  const row = await _getAppSettingsRow();
  const S = CONFIG.PDP.SETTINGS;
  return {
    mode: pdpNormaliseMode(row ? row[S.MODE] : null),
    pilot: pdpParsePilot(row ? row[S.PILOT] : ''),
    remindersFrom: pdpNormaliseRemindersFrom(row ? row[S.REMINDERS_FROM] : ''),
  };
}

// Admin only (pdpSwitch), under Ghost Mode the ghosted user's role. Writes only the fields passed;
// creates the 'config' row when it is missing (same shape as setChecklistSettings).
async function writePdpSwitch({ mode, pilot, remindersFrom } = {}) {
  await _ensureGhostGate();
  const role = await getEffectiveRole(getCurrentUser()?.email || '');
  if (!roleCan(role, 'pdpSwitch')) throw new Error('Only an Admin can change the PDP switch.');
  const S = CONFIG.PDP.SETTINGS;
  const fields = {};
  if (mode !== undefined) {
    const m = String(mode).trim();
    if (!CONFIG.PDP.MODES.includes(m)) throw new Error('PDP mode must be one of ' + CONFIG.PDP.MODES.join(' / ') + '.');
    fields[S.MODE] = m;
  }
  if (pilot !== undefined) {
    const list = Array.isArray(pilot) ? pilot : pdpParsePilot(pilot);
    const bad = list.find(e => !pdpIsEmail(String(e).trim()));
    if (bad !== undefined) throw new Error('Not a valid pilot email address: ' + bad);
    fields[S.PILOT] = pdpFormatPilot(list);
  }
  if (remindersFrom !== undefined) {   // N-441: blank = back to the default date
    const d = String(remindersFrom == null ? '' : remindersFrom).trim();
    if (d !== '' && pdpNormaliseRemindersFrom(d) !== d) throw new Error('Reminders from must be a valid date (YYYY-MM-DD).');
    fields[S.REMINDERS_FROM] = d;
  }
  if (!Object.keys(fields).length) return;
  const row = await _getAppSettingsRow();
  if (row) await updateItem('AppSettings', row.id, fields);
  else     await createItem('AppSettings', { Title: 'config', ...fields });
}
