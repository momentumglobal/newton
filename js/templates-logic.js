// js/templates-logic.js — Briefing Pack / Saved Report template rules (N-427 – N-430).
// Pure: no Graph, no DOM. Split out of utils.js (N-474).
// Loads straight after utils.js on every shell (api.js and permissions.js call these) and is listed in
// CONFIG.MCP.scripts. Everything is called at runtime; nothing here runs at load.

// ── Templates (N-427) ─────────────────────────────────────────────────
// A BriefingPacks / SavedReports row with IsTemplate = Yes. SP Yes/No may come back as
// true/1/'Yes'; anything else — including a missing column — is NOT a template.
function isTemplateRow(row) {
  return !!row && (row.IsTemplate === true || row.IsTemplate === 1 || row.IsTemplate === 'Yes');
}

// Split rows into templates and ordinary items. Order preserved, input never mutated.
function partitionTemplates(rows) {
  const templates = [];
  const items = [];
  (Array.isArray(rows) ? rows : []).forEach(r => (isTemplateRow(r) ? templates : items).push(r));
  return { templates, items };
}

// The label a template is listed under: TemplateName, else Title, else UNTITLED_NAME.
function templateDisplayName(row, cfg = CONFIG) {
  const name = String((row && row.TemplateName) || '').trim();
  if (name) return name;
  const title = String((row && row.Title) || '').trim();
  return title || cfg.TEMPLATES.UNTITLED_NAME;
}

// A template name as stored: whitespace collapsed, trimmed, capped at
// CONFIG.TEMPLATES.NAME_MAX_CHARS. '' when blank (callers show MESSAGES.nameRequired).
function normaliseTemplateName(v, cfg = CONFIG) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
    .slice(0, cfg.TEMPLATES.NAME_MAX_CHARS).trim();
}

// N-428 (TPL-D5): `fields` with the template kind's stripFields laid over it, so a template
// row never carries a project, role, client or contact. New object; input never mutated.
// Unknown kind / no stripFields → shallow copy. Non-object fields → just the strip values.
function stripTemplateScope(kind, fields, cfg = CONFIG) {
  const spec = cfg && cfg.TEMPLATES && cfg.TEMPLATES[kind];
  const base = fields && typeof fields === 'object' ? fields : {};
  return { ...base, ...((spec && spec.stripFields) || {}) };
}

// N-429 (TPL-D5, D12): a Report Builder ModuleOrder (JSON text) made safe for a template
// write or a clone. Candidate Pipeline Snapshot blocks lose `values` (keyed by another
// project's role ids — client data never travels in a template); the hiringPlan marker
// is dropped when keepHiringPlan is false. Order, text blocks and titlePage are kept.
// Bad JSON / not an array → '[]' (fail closed: unknown content is never passed through).
function templateModuleOrder(json, { keepHiringPlan = true } = {}) {
  let blocks;
  try { blocks = JSON.parse(json); } catch (e) { return '[]'; }
  if (!Array.isArray(blocks)) return '[]';
  return JSON.stringify(blocks
    .filter(b => keepHiringPlan || !(b && b.type === 'hiringPlan'))
    .map(b => {
      if (!b || b.key !== 'candidateSnapshot') return b;
      const { values, ...rest } = b;   // eslint-disable-line no-unused-vars
      return rest;
    }));
}

// N-429: one rule for "this project gets the CoE Hiring Plan page".
function isCoEProject(p) {
  return !!p && p.ProjectType === 'CoE';
}

// ── Split-fee revenue (N-116) ─────────────────────────────────────────
// Exec Search and MG AI bill as a retainer up front plus the balance on
// placement, not a monthly rate. Each is recognised as a single lump sum in a
// single month, never pro-rated:
//   retainer  → the month of StartDate
//   placement → the month AFTER the month of EndDate
// The placement month therefore falls OUTSIDE the assignment window, and for a
// December end lands in January of the following year.
