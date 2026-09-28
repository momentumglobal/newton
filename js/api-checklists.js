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
  return { project: read('ChecklistProject'), role: read('ChecklistRole') };
}