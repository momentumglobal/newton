// js/checklist-logic.js — pure checklist rules: no network I/O, no DOM (N-346c)
// Moved out of utils.js. Owns the Yes/No read (spYesNo), variant resolution, list
// visibility / mode, progress and summary maths, link safety and item validation
// for Project & Role checklists. Consumers: api-checklists.js, checklists.js,
// checklist-admin.js, role-page.js. Loaded on reporting.html only, straight before
// api-checklists.js; reads CONFIG.CHECKLISTS at call time (config.js loads first).

// ── Project & Role checklists (N-266a) ────────────────────────────────
// Pure helpers shared by the Projects/Roles lists (pages.js), the checklist
// page (checklists.js) and the Config Panel editor (N-266b). No network, no
// DOM. Template rows are ChecklistTemplates items (Title aliased to
// ItemLabel); progress rows are ChecklistProgress items.

// SharePoint Yes/No read. Graph may return true/false, 1/0 or 'Yes'/'No',
// and OMITS the field on a row where it was never set (a row created before
// the column existed, or added by hand in the SharePoint grid without
// touching it). Every checklist Yes/No read goes through this with an
// explicit fallback for that missing case — never `=== true`, never bare
// truthiness (a blank Active must still mean active). isForecastAssignment()
// above is the older, field-specific precedent and is left as it is.
function spYesNo(val, fallback) {
  if (val === true || val === 1) return true;
  if (val === false || val === 0) return false;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'yes' || s === 'true' || s === '1') return true;
    if (s === 'no' || s === 'false' || s === '0') return false;
  }
  return fallback;
}

// Case/whitespace-insensitive key for hand-entered template values
// (RecordType, Variant, ItemType) — 'CoE ', 'coe' and 'CoE' all match.
function normChecklistKey(val) {
  return String(val ?? '').trim().toLowerCase();
}

// Every variant key a checklist can have, in display order — from
// CONFIG.CHECKLISTS.VARIANTS (N-267; was Default + each ProjectType).
function checklistVariants() {
  return CONFIG.CHECKLISTS.VARIANTS.map(v => v.key);
}

// Display label for a variant key ('Default' → 'Embedded (default)'). Keys
// are what SharePoint stores; labels are never written or compared.
function checklistVariantLabel(key) {
  const k = normChecklistKey(key);
  const hit = CONFIG.CHECKLISTS.VARIANTS.find(v => normChecklistKey(v.key) === k);
  return hit ? hit.label : String(key ?? '');
}

// The variant key a Projects.ProjectType maps to (Exec Search and MG AI share
// one). Blank or unlisted types → DEFAULT_VARIANT.
function checklistVariantForProjectType(projectType) {
  const t = normChecklistKey(projectType);
  if (t) {
    const hit = CONFIG.CHECKLISTS.VARIANTS.find(v => (v.projectTypes || []).some(p => normChecklistKey(p) === t));
    if (hit) return hit.key;
  }
  return CONFIG.CHECKLISTS.DEFAULT_VARIANT;
}

// N-362: LCI / Transformation projects collect no recruitment data and have no
// checklist (nor N-259 starter pack). Every checklist entry point gates on this;
// checklistVariantForProjectType() is never reached for them. Blank type → true.
function projectHasChecklist(projectType) {
  return !isNoDashboardType(projectType);
}

// Active template items for one record type + variant (unordered — see
// groupChecklistItems for display order).
function activeChecklistItems(templates, recordType, variant) {
  const type = normChecklistKey(recordType);
  const v    = normChecklistKey(variant);
  return (templates || []).filter(t =>
    normChecklistKey(t.RecordType) === type &&
    normChecklistKey(t.Variant) === v &&
    spYesNo(t.Active, true));
}

// Which variant a record uses: the variant its project's type maps to
// (checklistVariantForProjectType) when that variant has at least one ACTIVE
// item for this record type, else Default. Roles pass their parent project's
// ProjectType.
function resolveChecklistVariant(templates, recordType, projectType) {
  const v = checklistVariantForProjectType(projectType);
  if (v !== CONFIG.CHECKLISTS.DEFAULT_VARIANT && activeChecklistItems(templates, recordType, v).length) {
    return v;
  }
  return CONFIG.CHECKLISTS.DEFAULT_VARIANT;
}

// Display order: sections by their lowest SectionOrder (then name), items by
// ItemOrder (then numeric id). Blank orders sort last; a blank Section falls
// into CONFIG.CHECKLISTS.DEFAULT_SECTION. Returns [{ section, items }].
function groupChecklistItems(items) {
  const num = v => {
    if (v === null || v === undefined || v === '') return Infinity;
    const n = Number(v);
    return Number.isFinite(n) ? n : Infinity;
  };
  const groups = new Map();
  (items || []).forEach(it => {
    const name = String(it.Section ?? '').trim() || CONFIG.CHECKLISTS.DEFAULT_SECTION;
    if (!groups.has(name)) groups.set(name, { section: name, order: Infinity, items: [] });
    const g = groups.get(name);
    g.order = Math.min(g.order, num(it.SectionOrder));
    g.items.push(it);
  });
  // Infinity - Infinity is NaN (falsy), so equal/blank orders fall through
  // to the tie-breaker rather than returning NaN to sort().
  const byItem = (a, b) => (num(a.ItemOrder) - num(b.ItemOrder)) || (Number(a.id) - Number(b.id)) || 0;
  return [...groups.values()]
    .sort((a, b) => (a.order - b.order) || a.section.localeCompare(b.section))
    .map(g => ({ section: g.section, items: g.items.slice().sort(byItem) }));
}

// What a user gets for one record: 'none' | 'preview' | 'live'.
//   settings — { enabled, fromId } for the record type (AppSettings).
//   fromId null = never switched on: Admins preview every record.
//   Once switched on, only records with id >= fromId are in scope (the ID
//   watermark — SharePoint ids are monotonic and never reused), and Admins
//   keep a preview of those while it's switched off again.
// A pending optimistic row (N-218a, id 'pend_…') is never in scope.
function checklistMode({ settings = null, isAdmin = false, recordId = null, hasItems = false } = {}) {
  const id = Number(recordId);
  if (!hasItems || recordId === null || recordId === '' || !Number.isInteger(id)) return 'none';
  const s = settings || {};
  const fromId = (s.fromId === null || s.fromId === undefined || s.fromId === '') ? NaN : Number(s.fromId);
  if (!Number.isFinite(fromId)) return isAdmin ? 'preview' : 'none';
  if (id < fromId) return 'none';
  if (s.enabled === true) return 'live';
  return isAdmin ? 'preview' : 'none';
}

// Whether a list page shows the Checklist column at all.
function checklistColumnVisible({ settings = null, isAdmin = false, hasItems = false } = {}) {
  if (!hasItems) return false;
  if (isAdmin) return true;
  const s = settings || {};
  const on = s.fromId !== null && s.fromId !== undefined && s.fromId !== '' && Number.isFinite(Number(s.fromId));
  return on && s.enabled === true;
}

// ChecklistProgress rows → Map(itemKey → { done, by, at, rowId }). Two rows
// for one key (two users ticking at the same moment) resolve to the latest
// DoneDate, then — because DoneDate is a date-only column, so same-day rows
// tie — the higher row id, i.e. the row created last. ISO strings compare
// as strings.
function resolveChecklistProgress(rows) {
  const map = new Map();
  (rows || []).forEach(r => {
    const key = String(r.ItemKey ?? '');
    if (!key) return;
    const at  = String(r.DoneDate || '');
    const cur = map.get(key);
    if (cur) {
      if (at < cur.at) return;
      if (at === cur.at && Number(r.id) < Number(cur.rowId)) return;
    }
    map.set(key, { done: spYesNo(r.Done, false), by: r.DoneByEmail || '', at, rowId: r.id });
  });
  return map;
}

// Counts over the given (already active-only) items.
function summariseChecklist(items, progressMap) {
  let done = 0, reqDone = 0, reqTotal = 0;
  (items || []).forEach(it => {
    const p = progressMap ? progressMap.get(String(it.ItemKey ?? '')) : null;
    const isDone = !!(p && p.done);
    if (isDone) done++;
    if (spYesNo(it.Required, false)) {
      reqTotal++;
      if (isDone) reqDone++;
    }
  });
  return { done, total: (items || []).length, reqDone, reqTotal };
}

// Link items may only point at an https:// address or a Newton page
// (people.html, reporting.html#roles …). Everything else — javascript:,
// data:, http:, protocol-relative //host — is refused. Deliberately regex
// only, not new URL(): URL isn't available in the Node test vm, and
// whitespace/quotes/angle brackets are refused outright rather than
// normalised (paste SharePoint links as copied — they arrive %20-encoded).
function isSafeChecklistUrl(url) {
  const s = String(url ?? '').trim();
  if (!s) return false;
  if (/^[a-z0-9-]+\.html(#[^\s"'<>\\]*)?$/.test(s)) return true;
  return /^https:\/\/[^\s"'<>\\/?#]+(?:[/?#][^\s"'<>\\]*)?$/i.test(s);
}

// Config Panel editor (N-266b): validates one checklist item before it is
// written. Returns { ok, errors: { field: message } } — the fields are
// label, section, type, linkUrl, actionKey, help. Pure: the registry keys
// (Object.keys(CHECKLIST_ACTIONS)) are passed in, never read from a global.
// linkUrl is only checked for a link and actionKey only for an action — the
// editor writes the unused one as null. Lengths are counted after trimming;
// LABEL_MAX is SharePoint's single-line text limit, so it also caps LinkUrl.
function validateChecklistItem({ label, section, type, linkUrl, actionKey, help } = {}, actionKeys = []) {
  const C      = CONFIG.CHECKLISTS;
  const errors = {};
  const text   = v => String(v ?? '').trim();
  const lab = text(label), sec = text(section), url = text(linkUrl);
  if (!lab) errors.label = 'Enter an item label.';
  else if (lab.length > C.LABEL_MAX) errors.label = `Keep the label to ${C.LABEL_MAX} characters or fewer.`;
  if (!sec) errors.section = 'Choose a section, or add a new one.';
  else if (sec.length > C.LABEL_MAX) errors.section = `Keep the section to ${C.LABEL_MAX} characters or fewer.`;
  const t = normChecklistKey(type);
  if (!C.ITEM_TYPES.includes(t)) {
    errors.type = 'Choose a type.';
  } else if (t === 'link') {
    if (!isSafeChecklistUrl(url)) errors.linkUrl = 'Enter an https:// address or a Newton page such as people.html.';
    else if (url.length > C.LABEL_MAX) errors.linkUrl = `Keep the link to ${C.LABEL_MAX} characters or fewer.`;
  } else if (t === 'action' && !(actionKeys || []).includes(text(actionKey))) {
    errors.actionKey = 'Choose an action from the list.';
  }
  if (text(help).length > C.HELP_MAX) errors.help = `Keep the help text to ${C.HELP_MAX} characters or fewer.`;
  return { ok: Object.keys(errors).length === 0, errors };
}

// N-400: the Section the editor form is asking for. The form has a dropdown
// of existing sections plus a "+ New section…" option (value
// CONFIG.CHECKLISTS.NEW_SECTION_VALUE) that reveals a name box: New → the
// typed name; anything else → the dropdown's value (blank for the placeholder,
// whatever is typed in the name box is then ignored). Pure; never throws.
function checklistSectionFromInput(choice, typed) {
  const pick = String(choice ?? '');
  return pick === CONFIG.CHECKLISTS.NEW_SECTION_VALUE ? String(typed ?? '') : pick;
}
