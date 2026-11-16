// js/api-my-details.js — SharePoint reads and writes for My Details (N-456 / MM-6). Graph calls only; every rule lives in
// my-details-logic.js. Depends on getItems / createItem / updateItem / normaliseFields / wasListDenied (graph-client.js),
// getEffectiveRole / getPeople (api.js), getCurrentUser (auth.js), getGhostUser / localDayISO (utils.js).
//
// The list (CONFIG.MY_MOMENTUM.DETAILS.LIST) is restricted and holds personal data: it is read on tier 1 only (never
// sessionStorage), never exposed to Newton for Claude, the Command Bar, mobile or any export, and no function here deletes.
// Nothing here logs a row, a payload or a field value: errors carry fixed text, and callers log e.message only.

function _mdListName() { return CONFIG.MY_MOMENTUM.DETAILS.LIST; }

// Whole-number filter, validated (never string-built from input).
function _mdPersonFilter(personId) {
  const n = Number(personId);
  if (!Number.isInteger(n) || n <= 0) throw new Error(mdText('badPerson'));
  return 'fields/PersonID eq ' + n;
}

// Admin / People Ops only (re-checked on every admin write; SharePoint enforces it as well).
async function _mdRequireAdmin() {
  const user = getCurrentUser();
  const role = await getEffectiveRole(user && user.email ? user.email : '');
  if (!roleCan(role, 'myDetailsAdmin')) throw new Error(mdText('notAllowed'));
}

function _mdNoGhost() {
  if (getGhostUser()) throw new Error(mdText('ghost'));
}

function _mdRowFrom(created) {
  return { id: String(created.id), ...normaliseFields(_mdListName(), created.fields || {}) };
}

// One person's row. An employee's read is trimmed by SharePoint to their own row, so { row: null } means "not ready" (no row, or the
// flow has not locked it yet, or a 403). `denied` = the list returned a 403 (for Admin / People Ops that is a misconfiguration).
async function getMyDetails(personId) {
  const list = _mdListName();
  const rows = await getItems(list, _mdPersonFilter(personId));
  return { row: mdPickRow(rows, personId), denied: wasListDenied(list) };
}

// Every row. Admin / People Ops only (list-level read). The select adds Created, the age clock mdFindUnlocked needs for the grace
// period (the default LIST_FIELDS projection has no Created, so without it every new row looked old; same approach as api-pdp.js
// _pdpAccessRead). The own-row read (getMyDetails) stays on the default projection.
async function getMyDetailsAll() {
  const list = _mdListName();
  const rows = await getItems(list, '', ['Id', ...CONFIG.LIST_FIELDS[list], 'Created'].join(','));
  return { rows, denied: wasListDenied(list) };
}

// The person's row, created empty when it does not exist yet. person = a People row or { id, WorkEmail }. PersonEmail is written
// only when the WorkEmail is known; until then the row is readable by Admin / People Ops alone. -> { row, created }
async function ensureMyDetailsRow(person) {
  await _mdRequireAdmin();
  const payload = mdNewRowPayload(person);
  if (!payload) throw new Error(mdText('badPerson'));
  const cur = await getMyDetails(person.id);
  if (cur.denied) throw new Error(mdText('noAccessAdmin'));
  if (cur.row) return { row: cur.row, created: false };
  const made = await createItem(_mdListName(), payload);
  return { row: _mdRowFrom(made), created: true };
}

// Save the content columns of one row. opts.onBehalf = the target is not the signed-in person's own record (Admin / People Ops).
// The stamp always carries the REAL signed-in email. Throws an Error with .fieldErrors when validation fails (nothing is written).
async function saveMyDetails(rowId, values, opts) {
  _mdNoGhost();
  const onBehalf = !!(opts && opts.onBehalf);
  if (onBehalf) await _mdRequireAdmin();
  const check = mdValidate(values);
  if (!check.ok) {
    const e = new Error(mdText('invalid'));
    e.fieldErrors = check.errors;
    throw e;
  }
  const rid = Number(rowId);
  if (!Number.isInteger(rid) || rid <= 0) throw new Error(mdText('badPerson'));
  const user = getCurrentUser();
  return updateItem(_mdListName(), rid, mdSavePayload(values, { email: user && user.email, onBehalf, nowISO: new Date().toISOString() }));
}

// Manage panel read. Names only. A denied list returns { denied: true } and nothing else, so an empty read can never look like
// "everyone is missing a row".
async function getMyDetailsReport() {
  await _mdRequireAdmin();
  const [people, all] = await Promise.all([getPeople(false), getMyDetailsAll()]);
  if (all.denied) return { denied: true };
  const name = new Map((people || []).map(p => [String(p.id), p.EmployeeName || '']));
  const brief = p => ({ id: String(p.id), name: p.EmployeeName || '' });
  const plan = mdPlanMissingRows(people, all.rows);
  return {
    denied: false,
    total: all.rows.length,
    toCreate: plan.create.map(brief),
    noWorkEmail: plan.noWorkEmail.map(brief),
    unlocked: mdFindUnlocked(all.rows, Date.now()).map(u => Object.assign(u, { name: name.get(String(u.personId)) || '' })),
    drift: mdFindDrift(people, all.rows),
    duplicates: mdFindDuplicates(all.rows).map(d => Object.assign(d, { name: name.get(String(d.personId)) || '' })),
    leavers: mdFindLeavers(people, all.rows, localDayISO()),
  };
}

// Create the missing rows, one at a time; a failed row is recorded and the rest carry on. -> { written, failed: [{ personId, message }] }
async function createMissingMyDetailsRows() {
  await _mdRequireAdmin();
  const [people, all] = await Promise.all([getPeople(false), getMyDetailsAll()]);
  if (all.denied) throw new Error(mdText('noAccessAdmin'));
  const out = { written: 0, failed: [] };
  for (const p of mdPlanMissingRows(people, all.rows).create) {
    try {
      await createItem(_mdListName(), mdNewRowPayload(p));
      out.written++;
    } catch (e) {
      out.failed.push({ personId: p.id, message: e && e.message ? e.message : 'failed' });
    }
  }
  return out;
}

// Set PersonEmail to the person's WorkEmail on every row that differs (blank included); the access flow then locks the row.
async function fixMyDetailsEmails() {
  await _mdRequireAdmin();
  const [people, all] = await Promise.all([getPeople(false), getMyDetailsAll()]);
  if (all.denied) throw new Error(mdText('noAccessAdmin'));
  const out = { written: 0, failed: [] };
  for (const d of mdFindDrift(people, all.rows)) {
    try {
      await updateItem(_mdListName(), d.id, mdFixEmailPayload({ WorkEmail: d.to }));
      out.written++;
    } catch (e) {
      out.failed.push({ personId: d.personId, message: e && e.message ? e.message : 'failed' });
    }
  }
  return out;
}

// Blank every content column of one row and stamp it. The row stays; nothing is deleted.
async function clearMyDetailsRow(rowId) {
  await _mdRequireAdmin();
  const rid = Number(rowId);
  if (!Number.isInteger(rid) || rid <= 0) throw new Error(mdText('badPerson'));
  const user = getCurrentUser();
  return updateItem(_mdListName(), rid, mdClearPayload({ email: user && user.email, nowISO: new Date().toISOString() }));
}