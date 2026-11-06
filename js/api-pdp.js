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

// ── N-445 (PDP-13, PDP-D13): the Off / Pilot / On switch ───────────────────────────────────
// PDPMode and PDPPilot sit on the AppSettings 'config' row (column names: CONFIG.PDP.SETTINGS).
// The rules are pure in pdp-identity.js; this file only reads, writes and combines them. Named
// readPdpSwitch / writePdpSwitch / resolvePdpGate on purpose: a file that calls getPdp*() is
// treated as handling PDP records (the PDP-D12 source scan), and the switch holds none.

// -> { mode, pilot: [emails] }. A missing row, missing columns or a failed read is Off.
async function readPdpSwitch() {
  const row = await _getAppSettingsRow();
  const S = CONFIG.PDP.SETTINGS;
  return { mode: pdpNormaliseMode(row ? row[S.MODE] : null), pilot: pdpParsePilot(row ? row[S.PILOT] : '') };
}

// Admin only (pdpSwitch), under Ghost Mode the ghosted user's role. Writes only the fields passed;
// creates the 'config' row when it is missing (same shape as setChecklistSettings).
async function writePdpSwitch({ mode, pilot } = {}) {
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
  if (!Object.keys(fields).length) return;
  const row = await _getAppSettingsRow();
  if (row) await updateItem('AppSettings', row.id, fields);
  else     await createItem('AppSettings', { Title: 'config', ...fields });
}

// The single entry point for "may this user see PDP?" -> { mode, state, reason }.
// Ghost-aware: the effective email and role, exactly like getPdpIdentity(). The records check
// runs only in Pilot mode and only for a user the pilot rules left at none (a person removed from
// the pilot keeps their history); PDP Meetings are trimmed by SharePoint per user, and a
// denied or failed read counts as no records.
async function resolvePdpGate(today) {
  await _ensureGhostGate();
  const realEmail = getCurrentUser()?.email || '';
  const email = pdpEffectiveEmail(realEmail, getGhostUser());
  const [sw, people, role] = await Promise.all([readPdpSwitch(), getPeople(false), getEffectiveRole(realEmail)]);
  const base = { mode: sw.mode, pilot: sw.pilot, people, email, role, today: today || new Date() };
  let gate = pdpAccess(Object.assign({ hasRecords: false }, base));
  if (gate.state === 'none' && sw.mode === CONFIG.PDP.MODES[1]) {
    let has = false;
    try { has = pdpVisibleItems(await getPdpMeetings(), role, email).length > 0; } catch (e) { has = false; }
    if (has) gate = pdpAccess(Object.assign({ hasRecords: true }, base));
  }
  return { mode: sw.mode, state: gate.state, reason: gate.reason };
}


// ── N-436 (PDP-4): framework + template setup (Admin / People Ops, People > PDP Setup) ──────────
// Graph only; every rule is pure in pdp-data.js (pdpFrameworkPlanSave, pdpSeedPlan,
// pdpValidateTemplate, ...). These functions are deliberately NOT named getPdp* / createPdp* /
// updatePdp* for their callers: the editor files must never be able to read or write a personal PDP
// list, and the PDP-D12 source scan (assert-pdp-access) keeps them off the allowlist. Each write
// re-reads the rows fresh (the 30 s read cache is dropped first) and checks the rule against what is
// actually stored, so two editors cannot overwrite a Published template or double-number a version.

// The signed-in user's email for audit columns, after checking they may edit (pdpAdmin, Ghost Mode
// aware, same as writePdpSwitch).
async function _pdpSetupWho(refusal) {
  await _ensureGhostGate();
  const email = getCurrentUser()?.email || '';
  const role = await getEffectiveRole(email);
  if (!roleCan(role, 'pdpAdmin')) throw new Error(refusal || 'Only Admin or People Ops can change the PDP framework and templates.');
  return pdpEmail(email);
}

// Framework rows are read with Modified so the editor can say when a set was last edited.
function _pdpFrameworkSelect() {
  return ['Id', ...CONFIG.LIST_FIELDS[CONFIG.PDP.LISTS.FRAMEWORK], 'Modified'].join(',');
}

// -> { framework, templates }. fresh = true drops the read cache first (write paths and after saves).
async function readPdpSetup(fresh) {
  const L = CONFIG.PDP.LISTS;
  if (fresh) { _cacheInvalidate(L.FRAMEWORK); _cacheInvalidate(L.TEMPLATES); }
  const [framework, templates] = await Promise.all([
    getItems(L.FRAMEWORK, '', _pdpFrameworkSelect()),
    getPdpTemplates(),
  ]);
  return { framework, templates };
}

// Five writes at a time: a 108-row seed stays quick without flooding Graph.
async function _pdpRunBatches(tasks, size) {
  const n = size || 5;
  let done = 0;
  for (let i = 0; i < tasks.length; i += n) {
    await Promise.all(tasks.slice(i, i + n).map(t => t()));
    done = Math.min(tasks.length, i + n);
  }
  return done;
}

// Create-only and idempotent: only rows that are missing are created; nothing existing is changed.
// -> { framework: n, templates: n } created.
async function seedPdpDefaults() {
  const by = await _pdpSetupWho();
  const cur = await readPdpSetup(true);
  const plan = pdpSeedPlan(cur.framework, cur.templates, PDP_SEED, by, new Date().toISOString());
  const tasks = plan.framework.map(f => () => createPdpFramework(f)).concat(plan.templates.map(t => () => createPdpTemplate(t)));
  let made = 0;
  try {
    for (let i = 0; i < tasks.length; i += 5) {
      const chunk = tasks.slice(i, i + 5);
      await Promise.all(chunk.map(t => t()));
      made += chunk.length;
    }
  } catch (e) {
    throw new Error('Seeded ' + made + ' of ' + tasks.length + ' rows before an error: ' + e.message + ' Press Seed defaults again to finish.');
  }
  return { framework: plan.framework.length, templates: plan.templates.length };
}

// edit = { level, track, descriptors: { pillarKey: { Below, Meets, Exceeding } }, isActive }
// Writes only the rows that changed. -> { updated, created }
async function savePdpFramework(edit) {
  const by = await _pdpSetupWho();
  const cur = await readPdpSetup(true);
  const plan = pdpFrameworkPlanSave(cur.framework, edit.level, edit.track, edit, by, PDP_SEED.pillars);
  await _pdpRunBatches(plan.updates.map(u => () => updatePdpFramework(u.id, u.fields)));
  await _pdpRunBatches(plan.creates.map(c => () => createPdpFramework(c)));
  return { updated: plan.updates.length, created: plan.creates.length };
}

// A new blank, inactive level x track (18 rows).
async function addPdpFrameworkSet(level, track) {
  const by = await _pdpSetupWho();
  const cur = await readPdpSetup(true);
  const rows = pdpFrameworkPlanAdd(cur.framework, level, track, by, PDP_SEED.pillars);
  await _pdpRunBatches(rows.map(r => () => createPdpFramework(r)));
  return { created: rows.length };
}

// "New version": the type's open Draft if one exists (one Draft per type), otherwise a Draft copied
// from `fromId` or from the active version, or blank. The next VersionNo comes from a fresh read.
async function startPdpTemplateDraft(meetingType, fromId) {
  await _pdpSetupWho();
  pdpAssertEnum('MeetingType', meetingType, CONFIG.PDP.MEETING_TYPES);
  const rows = (await readPdpSetup(true)).templates;
  const open = pdpTemplateDraft(rows, meetingType);
  if (open) return open;
  const src = fromId != null ? rows.find(r => String(r.id) === String(fromId) && r.MeetingType === meetingType) : pdpActiveTemplate(rows, meetingType);
  const def = (src && pdpParseJson(src.Definition)) || pdpBlankDefinition();
  const n = pdpNextVersionNo(rows, meetingType);
  return createPdpTemplate({ Title: pdpTemplateTitle(meetingType, n), MeetingType: meetingType, VersionNo: n, Status: 'Draft', Definition: def });
}

// Only a Draft can be saved; the stored row is checked, not the caller's copy.
async function savePdpTemplateDraft(id, definition) {
  await _pdpSetupWho();
  const rows = (await readPdpSetup(true)).templates;
  const row = rows.find(r => String(r.id) === String(id));
  if (!pdpTemplateEditable(row)) throw new Error('Only a draft can be edited. Start a new version instead.');
  return updatePdpTemplate(id, { Definition: definition });
}

// Validates, publishes and retires the version it replaces. If another row already took the draft's
// number (or a higher version is Published) the draft is renumbered first. A failed retire is reported,
// not thrown: pdpActiveTemplate still resolves to the highest Published version.
// -> { versionNo, retireFailed }
async function publishPdpTemplate(id) {
  const by = await _pdpSetupWho();
  const rows = (await readPdpSetup(true)).templates;
  const row = rows.find(r => String(r.id) === String(id));
  if (!pdpTemplateEditable(row)) throw new Error('Only a draft can be published.');
  const check = pdpValidateTemplate(pdpParseJson(row.Definition), row.MeetingType);
  if (!check.ok) throw new Error('Cannot publish yet: ' + check.errors.join(' '));
  const others = rows.filter(r => r.MeetingType === row.MeetingType && String(r.id) !== String(id));
  let versionNo = Number(row.VersionNo);
  const fields = { Status: 'Published', PublishedAt: new Date().toISOString(), PublishedBy: by };
  if (others.some(o => Number(o.VersionNo) >= versionNo)) {
    versionNo = pdpNextVersionNo(rows, row.MeetingType);
    fields.VersionNo = versionNo;
    fields.Title = pdpTemplateTitle(row.MeetingType, versionNo);
  }
  await updatePdpTemplate(id, fields);
  let retireFailed = false;
  for (const o of others.filter(r => r.Status === 'Published')) {
    try { await updatePdpTemplate(o.id, { Status: 'Retired' }); } catch (e) { retireFailed = true; console.warn('PDP template retire failed', e); }
  }
  return { versionNo, retireFailed };
}

// A discarded draft is Retired, never deleted (records are retained).
async function discardPdpTemplateDraft(id) {
  await _pdpSetupWho();
  const rows = (await readPdpSetup(true)).templates;
  const row = rows.find(r => String(r.id) === String(id));
  if (!pdpTemplateEditable(row)) throw new Error('Only a draft can be discarded.');
  return updatePdpTemplate(id, { Status: 'Retired' });
}


// ── N-437 (PDP-5): the cycle engine (Admin / People Ops, People > PDP Setup > Cycle) ─────────────
// Graph only; every rule is pure in pdp-cycle.js (pdpBuildCyclePlan). Cycles and Meetings are created
// ONLY here, from an Admin / People Ops session (N-435 / PDP-D14: Members have no list-level access to
// those two lists, so SharePoint refuses anyone else). Under Ghost Mode the effective role is checked,
// so an admin ghosting a TP is refused; the writes themselves are always the real admin's.
const _PDP_ENGINE_REFUSAL = 'Only Admin or People Ops can run the PDP cycle engine.';

// The plan for one cycle year (nothing is written). fresh = true drops the 30 s read cache first.
async function planPdpCycle(year, fresh) {
  await _pdpSetupWho(_PDP_ENGINE_REFUSAL);
  const y = Number(year);
  if (!Number.isInteger(y)) throw new Error('PDP cycle year must be a whole number');
  const L = CONFIG.PDP.LISTS;
  if (fresh) [L.CYCLES, L.MEETINGS, L.TEMPLATES, 'People'].forEach(l => _cacheInvalidate(l));
  const [sw, people, cycles, meetings, templates] = await Promise.all([
    readPdpSwitch(), getPeople(false), getPdpCycles(null, y), getPdpMeetings(null, y), getPdpTemplates(),
  ]);
  // A 403 on a restricted list reads as "no rows"; for Admin / People Ops that is a misconfiguration,
  // and planning on it would create every meeting a second time.
  const denied = [L.CYCLES, L.MEETINGS].filter(l => wasListDenied(l));
  if (denied.length) throw new Error('Newton could not read ' + denied.join(' and ') + ' (access denied). Check the PDP list permissions (N-435) before running the cycle engine.');
  return pdpBuildCyclePlan({ year: y, mode: sw.mode, pilot: sw.pilot, people, cycles, meetings, templates, today: new Date() });
}

// Re-plans from a fresh read (never the preview's copy), then writes: cycles first, then each
// person's meetings with the new CycleID, then the updates; five at a time. Idempotent, so a run cut
// short is finished by running it again. onProgress(done, total) after each write.
// -> { cycles, meetings, updates, total }
async function applyPdpCycle(year, onProgress) {
  const plan = await planPdpCycle(year, true);
  if (plan.off) throw new Error('PDP is Off. Switch it to Pilot or On before generating meetings.');
  if (plan.blockedTemplates.length) throw new Error('Publish a template first: ' + plan.blockedTemplates.map(b => b.label).join(', ') + '.');
  const total = plan.cycles.length + plan.meetings.length + plan.meetingUpdates.length + plan.cycleUpdates.length;
  let done = 0;
  const tick = () => { done++; if (onProgress) onProgress(done, total); };
  const newCycleId = {};
  try {
    await _pdpRunBatches(plan.cycles.map(c => async () => {
      const saved = await createPdpCycle(c.fields);
      if (!saved || saved.id == null) throw new Error('SharePoint did not return the new cycle for ' + c.name + '.');
      newCycleId[c.personId] = Number(saved.id);
      tick();
    }));
    await _pdpRunBatches(plan.meetings.map(m => async () => {
      const fields = Object.assign({}, m.fields);
      if (m.newCycle) fields.CycleID = newCycleId[m.personId];
      await createPdpMeeting(fields);
      tick();
    }));
    await _pdpRunBatches(plan.meetingUpdates.map(u => async () => { await updatePdpMeeting(u.id, u.fields); tick(); }));
    await _pdpRunBatches(plan.cycleUpdates.map(u => async () => { await updatePdpCycle(u.id, u.fields); tick(); }));
  } catch (e) {
    throw new Error('Wrote ' + done + ' of ' + total + ' changes before an error: ' + e.message + ' Press Apply again to finish; nothing is written twice.');
  }
  return { cycles: plan.cycles.length, meetings: plan.meetings.length, updates: plan.meetingUpdates.length + plan.cycleUpdates.length, total };
}