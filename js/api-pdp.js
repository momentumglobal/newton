// js/api-pdp.js — SharePoint reads for the Development & Performance (PDP) epic (N-433 / PDP-1).
// Graph calls only; every rule lives in pdp-identity.js. Depends on getPeople (api.js),
// getCurrentUser (auth.js), getGhostUser / _ensureGhostGate (api.js). N-434 adds the list getters
// and writers; payload rules live in pdp-data.js (pdpClean*). Lists are named only through
// CONFIG.PDP.LISTS. PDP data is never cached, never exposed to MCP / Command Bar (PDP-D12), and
// there is no general delete writer: add one with the task that needs it. N-439's removeTeamItem() is the only one
// (a goal or action recorded in an open meeting).

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
// ── N-438 (PDP-6): My Development (employee) ───────────────────────────────────────────────────
// Reads the signed-in employee's own cycle, meetings, goals and actions, and makes the only two
// writes the employee page may make: their prep, and their sign-off. Rules are pure in pdp-prep.js.
// Ghost Mode is read-only here: an admin looking as a user never writes as them. Nothing is created
// or deleted, and Goals / Actions / Scores are never written from this page (N-440 owns those).
// These functions are deliberately NOT named getPdp* / updatePdp* for their callers: pdp-my.js never
// reaches a personal list directly.

// -> { gate, none } | { gate, noPerson, flags } | { gate, me, lm, csd, years, year, cycle, meetings,
//      templates, goals, actions, readOnly }
async function loadMyDevelopment(year) {
  const gate = await resolvePdpGate();
  if (gate.state === 'none') return { gate, none: true };
  const realEmail = getCurrentUser()?.email || '';
  const email = pdpEffectiveEmail(realEmail, getGhostUser());
  const [role, people] = await Promise.all([getEffectiveRole(realEmail), getPeople(false)]);
  const ident = pdpResolveIdentity(people, email);
  if (!ident.me) return { gate, noPerson: true, flags: ident.flags };
  const pid = Number(ident.me.id);
  const [cycles, templates] = await Promise.all([getPdpCycles(pid), getPdpTemplates()]);
  const years = [...new Set(pdpVisibleItems(cycles, role, email).map(c => Number(c.CycleYear)).filter(Number.isInteger))].sort((a, b) => b - a);
  const thisYear = Number(localDayISO(new Date()).slice(0, 4));
  const y = years.includes(Number(year)) ? Number(year) : (years.includes(thisYear) ? thisYear : (years[0] || thisYear));
  const [meetings, goals, actions] = years.length
    ? await Promise.all([getPdpMeetings(pid, y), getPdpGoals(pid, y), getPdpActions(pid)])
    : [[], [], []];
  return {
    gate, me: ident.me, lm: ident.lineManager, csd: ident.csd, years, year: y,
    cycle: pdpVisibleItems(cycles, role, email).find(c => Number(c.CycleYear) === y) || null,
    meetings: pdpVisibleItems(meetings, role, email),
    templates,
    goals: pdpVisibleItems(goals, role, email),
    actions: pdpVisibleItems(actions, role, email),
    readOnly: gate.state !== 'live' || _pdpEmail(email) !== _pdpEmail(realEmail),
  };
}

// The signed-in employee's own meeting, re-read fresh, or a thrown refusal. Used by both writers.
async function _pdpMyMeeting(meetingId) {
  await _ensureGhostGate();
  const realEmail = getCurrentUser()?.email || '';
  if (pdpEffectiveEmail(realEmail, getGhostUser()) !== _pdpEmail(realEmail)) throw new Error('Ghost Mode is read-only: you cannot save or sign as someone else.');
  const gate = await resolvePdpGate();
  if (gate.state !== 'live') throw new Error('Development & Performance is not available to you right now.');
  const id = Number(meetingId);
  if (!Number.isInteger(id)) throw new Error('PDP meeting id must be a whole number');
  const ident = pdpResolveIdentity(await getPeople(false), realEmail);
  if (!ident.me) throw new Error('Your work email is not linked to a People record.');
  _cacheInvalidate(CONFIG.PDP.LISTS.MEETINGS);
  const m = (await getPdpMeetings(Number(ident.me.id))).find(r => Number(r.id) === id);
  if (!m || String(m.PersonID) !== String(ident.me.id) || _pdpEmail(m.PersonEmail) !== _pdpEmail(realEmail)) throw new Error('That meeting is not yours.');
  return m;
}

// A 403 on an item the access flow has not locked yet is not an error (N-435): say so.
function _pdpMyWriteError(e, meeting) {
  if (e && e.status === 403 && !pdpIsSecured(meeting)) return new Error('Still securing this record. Try again in a minute.');
  return e;
}

// edit = { answers, goalReview, submit }. -> the saved meeting patch.
async function savePdpPrep(meetingId, edit) {
  const m = await _pdpMyMeeting(meetingId);
  const now = new Date();
  const win = pdpPrepWindow(m, now);
  if (win.state === 'locked') throw new Error(m.Status === 'Skipped' ? 'This meeting was skipped.' : 'This meeting has been held, so prep is locked.');
  if (win.state === 'closed') throw new Error('Prep opens on ' + pdpFmtDay(win.opensOn) + '.');
  const templates = await getPdpTemplates();
  const bound = pdpTemplateForMeeting(templates, m);
  if (!bound) throw new Error('Template unavailable. Contact People Ops.');
  const blocks = pdpPrepBlocks(pdpParseJson(bound.Definition)).employee;
  const payload = pdpPrepPayload(pdpPrepFromJson(m.PrepEmployee), edit, blocks, now.toISOString());
  if (edit && edit.submit) {
    const missing = pdpPrepMissing(blocks, payload);
    if (missing.length) throw new Error('Answer the required questions first: ' + missing.join('; '));
  }
  const patch = pdpMeetingPatchForPrep(m, pdpActiveTemplate(templates, m.MeetingType), payload, now.toISOString());
  try {
    await updatePdpMeeting(m.id, patch);
  } catch (e) { throw _pdpMyWriteError(e, m); }
  return patch;
}

// -> the saved patch ({ EmployeeSignedAt, [Status] }).
async function signOffPdpMeeting(meetingId) {
  const m = await _pdpMyMeeting(meetingId);
  const plan = pdpSignOffPlan(m, 'employee', new Date().toISOString());
  if (!plan.ok) throw new Error(plan.reason);
  try {
    await updatePdpMeeting(m.id, plan.patch);
  } catch (e) { throw _pdpMyWriteError(e, m); }
  return plan.patch;
}

// Does the My Development nav item show for the signed-in user? True only when the PDP gate is live for
// them AS A PERSON IN THE PROGRAMME (CONFIG.PDP.ME.NAV_REASONS) and they have exactly one People row.
// A reviewer-only manager, Admin / People Ops in preview, and any failure give false.
// Kept for callers of the N-438 name; resolvePdpNav() below decides both PDP nav items in one read.
async function resolveMyDevelopmentNav() {
  return (await resolvePdpNav()).my;
}

// ── N-439 (PDP-7): Team Development (line manager + CSD) ───────────────────────────────────────────
// Graph only; every rule is pure in pdp-team.js (and pdp-prep.js). A writer never trusts the page: it
// re-reads the meeting fresh, checks pdpTeamAccess(...).run from the record's own LineManagerEmail /
// CSDEmail (a CSD holds the Newton role Admin, so role alone says nothing about whose meeting they run),
// and checks the lock rule again. Ghost Mode is read-only. The goal / action writers copy the snapshot
// columns from the MEETING record so the access flow secures them for the same people (N-435).

// One meeting by id (a fresh Graph read, never the list cache), or null when SharePoint says 404.
async function getPdpMeetingById(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('PDP meeting id must be a whole number');
  try { return await getItem(CONFIG.PDP.LISTS.MEETINGS, n); } catch (e) { if (e && e.status === 404) return null; throw e; }
}

async function _pdpTeamWho() {
  await _ensureGhostGate();
  const realEmail = getCurrentUser()?.email || '';
  const email = pdpEffectiveEmail(realEmail, getGhostUser());
  const role = await getEffectiveRole(realEmail);
  return { realEmail, email, role, ghost: _pdpEmail(email) !== _pdpEmail(realEmail) };
}

// The meeting a manager-side write may touch, re-read fresh, or a thrown refusal. opts.allowSigned lets the
// sign-off through once the employee has signed (the lock rule stops every other write at the first signature).
async function _pdpTeamMeeting(meetingId, opts) {
  const who = await _pdpTeamWho();
  if (who.ghost) throw new Error('Ghost Mode is read-only: you cannot save or sign as someone else.');
  const gate = await resolvePdpGate();
  if (gate.state !== 'live') throw new Error('Development & Performance is not available to you right now.');
  _cacheInvalidate(CONFIG.PDP.LISTS.MEETINGS);
  const m = await getPdpMeetingById(meetingId);
  if (!m) throw new Error('That meeting was not found.');
  if (!pdpTeamAccess(who.role, who.email, m).run) throw new Error('You are not this person’s line manager or CSD.');
  if (!(opts && opts.allowSigned)) {
    const lock = pdpManagerLock(m);
    if (lock === 'skipped') throw new Error('This meeting was skipped.');
    if (lock === 'signed') throw new Error('This record is signed and locked.');
  }
  return { m, who };
}

// The person's goals and actions, fresh (the 30 s list cache dropped first).
async function _pdpTeamPersonRows(m) {
  _cacheInvalidate(CONFIG.PDP.LISTS.GOALS);
  _cacheInvalidate(CONFIG.PDP.LISTS.ACTIONS);
  const pid = Number(m.PersonID);
  const [goals, actions] = await Promise.all([getPdpGoals(pid), getPdpActions(pid)]);
  return { goals, actions };
}

// -> { gate, none } | { gate, noScope } | { gate, year, years, view, views, rows, totals, readOnly }
async function loadTeamDevelopment(year, view) {
  const gate = await resolvePdpGate();
  if (gate.state === 'none') return { gate, none: true };
  const who = await _pdpTeamWho();
  const people = await getPeople(false);
  const identity = pdpResolveIdentity(people, who.email);
  const scope = pdpTeamScope(identity, who.role);
  if (!scope.views.length) return { gate, noScope: true };
  const years = pdpCycleYears(new Date());
  const y = years.includes(Number(year)) ? Number(year) : years[0];
  const meetings = pdpVisibleItems(await getPdpMeetings(null, y), who.role, who.email);
  const v = scope.views.includes(view) ? view : scope.default;
  const rows = pdpTeamRows({ people, identity, meetings, view: v, myEmail: who.email, role: who.role, today: new Date() });
  return { gate, year: y, years, view: v, views: scope.views, rows, totals: pdpTeamTotals(rows), readOnly: gate.state !== 'live' || who.ghost };
}

// The run-meeting view model for one meeting the user may see.
async function loadTeamMeeting(meetingId) {
  const gate = await resolvePdpGate();
  if (gate.state === 'none') throw new Error('Development & Performance is not available to you right now.');
  const who = await _pdpTeamWho();
  const m = await getPdpMeetingById(meetingId);
  if (!m) throw new Error('That meeting was not found.');
  const access = pdpTeamAccess(who.role, who.email, m);
  if (!access.view) throw new Error('That meeting is not available to you.');
  const pid = Number(m.PersonID);
  const [people, meetings, goals, actions, templates] = await Promise.all([getPeople(false), getPdpMeetings(pid), getPdpGoals(pid), getPdpActions(pid), getPdpTemplates()]);
  const vis = rows => pdpVisibleItems(rows, who.role, who.email);
  const allGoals = vis(goals), allActions = vis(actions);
  const tpl = pdpTemplateForMeeting(templates, m);
  const lock = pdpManagerLock(m);
  const live = gate.state === 'live' && !who.ghost;
  const id = String(m.id);
  return {
    gate, meeting: m, access, lock, tpl,
    def: tpl ? pdpParseJson(tpl.Definition) : null,
    person: people.find(p => String(p.id) === String(pid)) || null,
    prev: pdpPreviousCommitments(m, vis(meetings), allGoals, allActions),
    allGoals, allActions,
    goals: allGoals.filter(g => String(g.MeetingID) === id),
    actions: allActions.filter(a => String(a.MeetingID) === id),
    run: access.run && lock === 'open' && live,
    canSign: access.run && live && m.Status === 'Held' && !String(m.ManagerSignedAt || '').trim(),
    readOnly: !live,
  };
}

// edit = { prepManager: { key: text }, notes: { key: text }, meetingDate }. A draft save: no status change
// beyond the first-touch rule in pdpMeetingPatchForManager.
async function saveTeamMeeting(meetingId, edit) {
  const { m } = await _pdpTeamMeeting(meetingId);
  const nowIso = new Date().toISOString();
  const templates = await getPdpTemplates();
  const bound = pdpTemplateForMeeting(templates, m);
  if (!bound) throw new Error('Template unavailable. Contact People Ops.');
  const payload = pdpManagerPayload(m.PrepManager, m.MeetingNotes, edit, pdpPrepBlocks(pdpParseJson(bound.Definition)), nowIso);
  const fields = { PrepManager: payload.prepManager, MeetingNotes: payload.notes };
  const day = edit && edit.meetingDate ? (spDateIn(edit.meetingDate) || '') : '';
  if (day) {
    if (!isoDate(day)) throw new Error('The meeting date is not a valid date.');
    fields.MeetingDate = day;
  }
  const patch = pdpMeetingPatchForManager(m, pdpActiveTemplate(templates, m.MeetingType), fields, nowIso);
  try {
    await updatePdpMeeting(m.id, patch);
  } catch (e) { throw _pdpMyWriteError(e, m); }
  return patch;
}

// Writes MeetingDate only ('' clears it). The Quarterly prep window (N-438) opens 48 h before it.
async function setPdpMeetingDate(meetingId, day) {
  const { m } = await _pdpTeamMeeting(meetingId);
  const d = day ? (spDateIn(day) || '') : '';
  if (d && !isoDate(d)) throw new Error('The meeting date is not a valid date.');
  try {
    await updatePdpMeeting(m.id, { MeetingDate: d });
  } catch (e) { throw _pdpMyWriteError(e, m); }
  return d;
}

// Mark the meeting Held: pdpHeldCheck against a fresh read of the meeting, goals and actions, then ONE patch.
async function markPdpHeld(meetingId, edit) {
  const { m, who } = await _pdpTeamMeeting(meetingId);
  const now = new Date(), nowIso = now.toISOString();
  const templates = await getPdpTemplates();
  const bound = pdpTemplateForMeeting(templates, m);
  if (!bound) throw new Error('Template unavailable. Contact People Ops.');
  const active = pdpActiveTemplate(templates, m.MeetingType);
  const probe = pdpMeetingPatchForManager(m, active, { Status: 'Held' }, nowIso);
  const eff = probe.TemplateID != null ? (templates.find(t => Number(t.id) === probe.TemplateID) || bound) : bound;   // the template the meeting will be bound to
  const def = pdpParseJson(eff.Definition);
  const day = edit && edit.meetingDate ? (spDateIn(edit.meetingDate) || '') : (spDateIn(m.MeetingDate) || localDayISO(now));
  if (!isoDate(day)) throw new Error('The meeting date is not a valid date.');
  const rows = await _pdpTeamPersonRows(m);
  const payload = pdpManagerPayload(m.PrepManager, m.MeetingNotes, edit, pdpPrepBlocks(def), nowIso);
  payload.notes.heldBy = who.email;
  payload.notes.heldAt = nowIso;
  const check = pdpHeldCheck(m, def, payload.prepManager, payload.notes, rows.goals, rows.actions, day, now);
  if (!check.ok) throw new Error(check.problems.join(' '));
  const patch = pdpMeetingPatchForManager(m, active, { Status: 'Held', MeetingDate: day, PrepManager: payload.prepManager, MeetingNotes: payload.notes }, nowIso);
  try {
    await updatePdpMeeting(m.id, patch);
  } catch (e) { throw _pdpMyWriteError(e, m); }
  return patch;
}

// -> the saved patch ({ ManagerSignedAt, MeetingNotes, [Status] }).
async function signOffPdpAsManager(meetingId) {
  const { m, who } = await _pdpTeamMeeting(meetingId, { allowSigned: true });
  const plan = pdpManagerSignPlan(m, who.email, new Date().toISOString());
  if (!plan.ok) throw new Error(plan.reason);
  try {
    await updatePdpMeeting(m.id, plan.patch);
  } catch (e) { throw _pdpMyWriteError(e, m); }
  return plan.patch;
}

async function _pdpTeamDef(m) {
  const bound = pdpTemplateForMeeting(await getPdpTemplates(), m);
  return bound ? pdpParseJson(bound.Definition) : null;
}

// goalEdit = { id?, Title, Category, WhyItMatters, SuccessMeasures, Support, TargetDate }. Create or edit a goal
// recorded in THIS meeting, within the template's goal limit.
async function saveTeamGoal(meetingId, goalEdit) {
  const { m } = await _pdpTeamMeeting(meetingId);
  const lim = pdpGoalLimit(m, await _pdpTeamDef(m));
  if (!lim) throw new Error('This meeting has no goals section.');
  const mine = (await _pdpTeamPersonRows(m)).goals.filter(g => String(g.MeetingID) === String(m.id));
  try {
    if (goalEdit && goalEdit.id) {
      const g = mine.find(x => String(x.id) === String(goalEdit.id));
      if (!g) throw new Error('That goal was not recorded in this meeting.');
      await updatePdpGoal(g.id, pdpGoalPayload(m, goalEdit, 'update'));
      return g.id;
    }
    if (mine.length >= lim.max) throw new Error('This meeting already has the most goals it allows (' + lim.max + ').');
    return (await createPdpGoal(pdpGoalPayload(m, goalEdit, 'create'))).id;
  } catch (e) { throw _pdpMyWriteError(e, m); }
}

// actionEdit = { id?, Title, OwnerRole, DueDate }. Create or edit an action recorded in THIS meeting.
async function saveTeamAction(meetingId, actionEdit) {
  const { m, who } = await _pdpTeamMeeting(meetingId);
  const lim = pdpActionLimit(await _pdpTeamDef(m));
  if (!lim) throw new Error('This meeting has no actions section.');
  const mine = (await _pdpTeamPersonRows(m)).actions.filter(a => String(a.MeetingID) === String(m.id));
  try {
    if (actionEdit && actionEdit.id) {
      const a = mine.find(x => String(x.id) === String(actionEdit.id));
      if (!a) throw new Error('That action was not recorded in this meeting.');
      await updatePdpAction(a.id, pdpActionPayload(m, actionEdit, who.email, 'update'));
      return a.id;
    }
    if (mine.length >= lim.max) throw new Error('This meeting already has the most actions it allows (' + lim.max + ').');
    return (await createPdpAction(pdpActionPayload(m, actionEdit, who.email, 'create'))).id;
  } catch (e) { throw _pdpMyWriteError(e, m); }
}

// Tick or untick an action from this or an earlier meeting of the same person (the commitments panel).
async function setTeamActionDone(meetingId, actionId, done) {
  const { m, who } = await _pdpTeamMeeting(meetingId);
  const a = (await _pdpTeamPersonRows(m)).actions.find(x => String(x.id) === String(actionId));
  if (!a || String(a.PersonID) !== String(m.PersonID)) throw new Error('That action was not found.');
  if (!pdpTeamAccess(who.role, who.email, a).run) throw new Error('You are not this person’s line manager or CSD.');
  try {
    await updatePdpAction(a.id, done ? { IsDone: true, DoneAt: new Date().toISOString() } : { IsDone: false, DoneAt: '' });
  } catch (e) { throw _pdpMyWriteError(e, a); }
}

// The ONLY delete in PDP: a goal or action recorded in this open meeting. Earlier commitments are never deleted.
async function removeTeamItem(meetingId, kind, id) {
  if (kind !== 'goal' && kind !== 'action') throw new Error('Only a goal or an action can be removed here.');
  const { m } = await _pdpTeamMeeting(meetingId);
  const rows = await _pdpTeamPersonRows(m);
  const it = (kind === 'goal' ? rows.goals : rows.actions).find(x => String(x.id) === String(id));
  if (!it || String(it.MeetingID) !== String(m.id)) throw new Error('Only items recorded in this meeting can be removed here.');
  if (kind === 'goal' && rows.goals.some(g => String(g.ParentGoalID) === String(it.id))) throw new Error('Other goals build on this one, so it cannot be removed.');
  try {
    await deleteItem(kind === 'goal' ? CONFIG.PDP.LISTS.GOALS : CONFIG.PDP.LISTS.ACTIONS, Number(it.id));
  } catch (e) { throw _pdpMyWriteError(e, it); }
}

// { my, team }: which PDP nav items show for the signed-in user. my = the gate is live for them AS A PERSON IN
// THE PROGRAMME (CONFIG.PDP.ME.NAV_REASONS) with exactly one People row; team = the gate is not 'none' and they
// have direct reports or a tree, or are Admin / People Ops. Any failure leaves both hidden (the caller catches).
async function resolvePdpNav() {
  const gate = await resolvePdpGate();
  if (gate.state === 'none') return { my: false, team: false };
  const who = await _pdpTeamWho();
  const ident = pdpResolveIdentity(await getPeople(false), who.email);
  const my = gate.state === 'live' && CONFIG.PDP.ME.NAV_REASONS.includes(gate.reason) && !!ident.me;
  const reports = !!ident.me && (ident.directReports.length > 0 || ident.csdTree.length > 0);
  return { my, team: reports || roleCan(who.role, 'pdpAdmin') };
}