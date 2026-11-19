// js/api-templates.js — Briefing Pack / Saved Report template Graph code (N-476, R3-7,
// moved from api.js): clone from a template, save as a template, and the plain Briefing
// Pack copy. Rules are in templates-logic.js; the write gates (checkProjectWrite,
// checkTemplateManage, checkTemplateWrite) in api-access.js; _pickFields in api.js.
// Loads on reporting and market-reporting.

// Clone template `id` into an ordinary item owned by `owner`. spec = a CONFIG.TEMPLATES
// entry. Whitelists only — never round-trip a fetched item into a create (LinkTitle and
// friends → 403): copyFields from the template, then overrideFields from the caller.
// IsTemplate, TemplateName and the owner are forced AFTER both picks, so no whitelist or
// override can produce a template or a foreign owner. A clone onto a project passes the
// N-369 write gate first. Anyone may clone; only the result's project is gated.
// N-429: optional `adjust(fields)` runs after the picks and before the project gate and
// the forced fields — the report wrapper uses it to clean ModuleOrder.
async function _cloneTemplateItem(spec, id, owner, overrides, adjust) {
  const src = await getItem(spec.list, id);
  if (!isTemplateRow(src)) throw new Error(CONFIG.TEMPLATES.MESSAGES.notTemplate);
  const o = overrides || {};
  const fields = {
    ..._pickFields(src, spec.copyFields),
    ..._pickFields(o, spec.overrideFields),
  };
  fields.Title = String(o.Title || src.Title || '').trim() || templateDisplayName(src);
  if (typeof adjust === 'function') adjust(fields);
  if (fields.ProjectID) {
    const w = await checkProjectWrite(fields.ProjectID);
    if (!w.ok) throw new Error(w.reason);
  }
  fields.IsTemplate = false;
  fields.TemplateName = '';
  fields[spec.ownerField] = String(owner || '').toLowerCase();
  return createItem(spec.list, fields);
}

async function cloneBriefingPackFromTemplate(id, owner, overrides) {
  return _cloneTemplateItem(CONFIG.TEMPLATES.BRIEFING_PACK, id, owner, overrides);
}

// N-429 (TPL-D12): every clone strips Candidate Pipeline Snapshot values from ModuleOrder
// (covers hand-made / older template rows too) and keeps the Hiring Plan page only when
// opts.keepHiringPlan (the caller's project is CoE). Default drops it — fail safe.
async function cloneSavedReportFromTemplate(id, owner, overrides, opts) {
  const keepHiringPlan = !!(opts && opts.keepHiringPlan);
  return _cloneTemplateItem(CONFIG.TEMPLATES.SAVED_REPORT, id, owner, overrides, f => {
    f.ModuleOrder = templateModuleOrder(f.ModuleOrder, { keepHiringPlan });
  });
}

// N-428 (TPL-D5, D10): the ONLY path that writes IsTemplate = true. kind = a
// CONFIG.TEMPLATES key. id = null creates a new template row owned by `owner`; an id
// updates that row, which must already be a template (an ordinary item is never flipped
// into one). Fresh, ghost-aware Admin check first; any failure throws (fail closed).
// Only spec.templateFields are written, the scope is blanked on every write, and the
// flag + name are forced after the strip.
async function saveTemplateItem(kind, id, fields, name, owner) {
  const spec = CONFIG.TEMPLATES[kind];
  if (!spec || !Array.isArray(spec.templateFields)) throw new Error('N-428: no templateFields for ' + kind);
  const n = normaliseTemplateName(name);
  if (!n) throw new Error(CONFIG.TEMPLATES.MESSAGES.nameRequired);
  if (id) {
    const row = await getItem(spec.list, id);
    if (!isTemplateRow(row)) throw new Error(CONFIG.TEMPLATES.MESSAGES.notTemplate);
  }
  const w = await checkTemplateManage();
  if (!w.ok) throw new Error(w.reason);
  const out = stripTemplateScope(kind, _pickFields(fields || {}, spec.templateFields));
  out.IsTemplate = true;
  out.TemplateName = n;
  if (id) return updateItem(spec.list, id, out);
  out[spec.ownerField] = String(owner || '').toLowerCase();
  return createItem(spec.list, out);
}

// N-235: Title and PackOwner are set by the caller, never copied. Everything
// else is whitelisted — never round-trip a fetched Graph item into a create
// (LinkTitle and friends are read-only → 403). A pack has no child rows, so
// this is a single create with no rollback sequence, unlike copyLCIModel.
const _BRIEFING_PACK_COPY_FIELDS = [
  "ProjectID", "RoleID", "ClientName", "RoleTitle", "RoleLocation",
  "ContactName", "ContactTitle", "ContactEmail", "CoverDate", "Pages",
];
async function copyBriefingPack(id, owner) {
  const src = await getItem("BriefingPacks", id);
  return createItem("BriefingPacks", {
    ..._pickFields(src, _BRIEFING_PACK_COPY_FIELDS),
    Title:     `${src.Title} (copy)`,
    PackOwner: (owner || "").toLowerCase(),
  });
}
