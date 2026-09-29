// js/api-checklists.js — SharePoint API calls for Project & Role checklists
// (N-266a). Consumed by checklists.js (and N-266b's Config Panel editor).
//
// Two lists plus six AppSettings columns:
//   ChecklistTemplates — the content, one row per item (Title → ItemLabel).
//                        Tier-2 cached (CONFIG.CACHE.persistentLists).
//   ChecklistProgress  — one row per (record, item) tick (Title →
//                        RecordType). Transactional: tier 1 (30s) only.
//   AppSettings        — Checklist{Project|Role}{Enabled|FromId|OnAt} on the
//                        existing single 'config' row (switch-on state).
//
// Every Yes/No read goes through spYesNo() (utils.js): Graph returns these
// as true/1/'Yes' and omits the field on rows where it was never set. Yes/No
// columns are never filtered server-side here — Done/Active/Required are
// filtered client-side after the read.
//
// Readers let errors throw; callers decide. getChecklistListContext()
// (checklists.js) swallows them so Projects/Roles still render when the
// lists haven't been created yet.

// Guards for values interpolated into a Graph $filter — never a raw string.
function _ckRecordType(recordType) {
  if (!CONFIG.CHECKLISTS.RECORD_TYPES.includes(recordType)) {
    throw new Error(`Unknown checklist record type: ${recordType}`);
  }
  return recordType;
}
function _ckInt(val) {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid checklist record id: ${val}`);
  return n;
}

// Whole list read (it's small), filtered to one record type client-side so
// every caller shares one cache entry.
async function getChecklistTemplates(recordType) {
  const type = _ckRecordType(recordType);
  const rows = await getItems('ChecklistTemplates');
  return rows.filter(r => normChecklistKey(r.RecordType) === type);
}

// Progress rows for a record type — for one record (checklist page) or for
// every record from the switch-on watermark up (list-page column).
// Title and RecordId should be indexed on this list (see Readme).
async function getChecklistProgress(recordType, { recordId = null, fromId = null } = {}) {
  const type = _ckRecordType(recordType);
  let idClause = '';
  if (recordId !== null && recordId !== undefined) idClause = `fields/RecordId eq ${_ckInt(recordId)}`;
  else if (fromId !== null && fromId !== undefined) idClause = `fields/RecordId ge ${_ckInt(fromId)}`;
  return getItems('ChecklistProgress', _odataAnd(`fields/Title eq '${type}'`, idClause));
}

// Tick / untick one item. PATCHes the row this view already knows about,
// else creates one. Unticking keeps the row (Done = false) as the audit of
// who unticked and when — rows are never deleted. DoneByEmail is the real
// signed-in user, so Ghost Mode attributes to the admin, as everywhere else.
// DoneDate is a DATE-ONLY column: today's UK calendar day, written at
// midday UTC via isoDate() so SharePoint's UTC↔BST shift can't move it to
// the previous day (the N-087 write convention).
async function setChecklistItemDone(recordType, recordId, itemKey, done, existingRowId = null) {
  const type = _ckRecordType(recordType);
  const fields = {
    Done:        done === true,
    DoneByEmail: (getCurrentUser()?.email || '').toLowerCase(),
    DoneDate:    isoDate(localDayISO()),   // date-only column — see above
  };
  if (existingRowId) {
    await updateItem('ChecklistProgress', existingRowId, fields);
    return { rowId: String(existingRowId) };
  }
  const result = await createItem('ChecklistProgress', {
    Title:    type,
    RecordId: _ckInt(recordId),
    ItemKey:  String(itemKey),
    ...fields,
  });
  return { rowId: result && result.id ? String(result.id) : null };
}

// AppSettings column prefix per record type — shared by the reader and
// setChecklistSettings() below.
const _CK_SETTINGS_PREFIX = { project: 'ChecklistProject', role: 'ChecklistRole' };

// Switch-on state per record type from the AppSettings 'config' row.
// OnAt is a date-only column (display only; N-266b writes it).
// Missing row/columns → off, never switched on. fromId is a Number or null.
async function getChecklistSettings() {
  const row = await _getAppSettingsRow();
  const read = prefix => {
    const raw = row ? row[`${prefix}FromId`] : null;
    const num = Number(raw);
    return {
      enabled: spYesNo(row ? row[`${prefix}Enabled`] : undefined, false),
      fromId:  (raw === null || raw === undefined || raw === '' || !Number.isFinite(num)) ? null : num,
      onAt:    (row && row[`${prefix}OnAt`]) || null,
    };
  };
  return { project: read(_CK_SETTINGS_PREFIX.project), role: read(_CK_SETTINGS_PREFIX.role) };
}

// ── Config Panel editor writes (N-266b) ─────────────────────────────
// Template writes always go through createItem/updateItem: they invalidate
// both cache tiers, and ChecklistTemplates is tier-2 enrolled — a raw
// graphRequest would leave the old content cached for 10 minutes. Fields use
// internal names (Title for the label). A create omits null/undefined
// fields; an update sends null to clear a column (e.g. LinkUrl when an item
// stops being a link).
async function createChecklistItem(fields) {
  const clean = {};
  Object.entries(fields || {}).forEach(([k, v]) => {
    if (v !== null && v !== undefined) clean[k] = v;
  });
  return createItem('ChecklistTemplates', clean);
}

async function updateChecklistItem(id, fields) {
  return updateItem('ChecklistTemplates', _ckInt(id), fields);
}

// Drops the cached template rows so the next read is fresh. The editor calls
// it after a failed write, when it can't be sure what SharePoint holds.
function refreshChecklistTemplates() {
  _cacheInvalidate('ChecklistTemplates');
}

// Hard delete of one template item (N-267). The editor only offers it for
// items with no ChecklistProgress rows — see getTickedChecklistKeys().
// deleteItem invalidates both cache tiers. ChecklistProgress is never
// touched from here.
async function deleteChecklistItem(id) {
  return deleteItem('ChecklistTemplates', _ckInt(id));
}

// ItemKeys with ANY ChecklistProgress row for a record type (N-267). A row is
// only ever created by a tick, and unticking keeps it, so "any row" means
// "has tick history". Uses the indexed Title filter only — ItemKey isn't
// indexed, so it's matched client-side. fresh drops the 30s cache first (the
// editor re-checks this way immediately before deleting).
async function getTickedChecklistKeys(recordType, { fresh = false } = {}) {
  if (fresh) _cacheInvalidate('ChecklistProgress');
  const rows = await getChecklistProgress(recordType);
  return new Set(rows.map(r => String(r.ItemKey ?? '').trim()).filter(Boolean));
}

// PATCHes the switch-on columns for one record type on the AppSettings
// 'config' row (created if missing — same shape as setAnnouncementMessage).
// Writes only the fields passed. FromId is the one-shot watermark: once set
// it is never moved, so a write that passes fromId while one is already
// stored is refused rather than silently re-cutting.
async function setChecklistSettings(recordType, { enabled, fromId, onAt } = {}) {
  const prefix = _CK_SETTINGS_PREFIX[_ckRecordType(recordType)];
  const fields = {};
  if (enabled !== undefined) fields[`${prefix}Enabled`] = enabled === true;
  if (fromId  !== undefined) fields[`${prefix}FromId`]  = _ckInt(fromId);
  if (onAt    !== undefined) fields[`${prefix}OnAt`]    = onAt;
  if (!Object.keys(fields).length) return;
  const row = await _getAppSettingsRow();
  if (fromId !== undefined && row) {
    const stored = row[`${prefix}FromId`];
    if (stored !== null && stored !== undefined && stored !== '') {
      throw new Error('The checklist cut-off is already set and can\'t be moved.');
    }
  }
  if (row) await updateItem('AppSettings', row.id, fields);
  else     await createItem('AppSettings', { Title: 'config', ...fields });
}

// Highest item id in Projects or Roles (0 when empty) — the switch-on
// watermark is this + 1. SharePoint ids are monotonic and never reused, so
// every record created afterwards has a higher id. Id-only read of the whole
// list (like getListItemCount), never a scoped read. The cache is dropped
// first: Projects is tier-2 cached for 10 minutes, and a stale max would put
// records created in that window — before switch-on — inside the cut-off.
async function getMaxItemId(listName) {
  if (listName !== 'Projects' && listName !== 'Roles') {
    throw new Error(`getMaxItemId: unsupported list ${listName}`);
  }
  _cacheInvalidate(listName);
  const rows = await getItems(listName, '', 'Id');
  return rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);
}