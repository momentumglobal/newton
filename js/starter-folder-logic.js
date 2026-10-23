// js/starter-folder-logic.js — pure rules for starter folders (N-259; N-260
// adds roles). No network I/O, no DOM — same contract as checklist-logic.js
// (N-346c), so every rule here is unit-tested in tests/assert-starter-folders.js.
//
// Consumed by api-starter-folders.js (Graph) and starter-folders.js (the
// 'newton.starterFolder' checklist action + modal). Loaded on reporting.html
// straight before api-starter-folders.js, after checklist-logic.js — the pack
// variant reuses checklistVariantForProjectType() / projectHasChecklist()
// (D22: one variant mapping for checklists and starter packs).

// ── Switch-on + pack resolution ──────────────────────────────────────

// True when this record type can be offered at all: the template library's
// drive id and the record type's Default pack id are both configured. Blank
// either way = the feature is dark (D16 — Default is the only required pack).
function starterFoldersEnabled(recordType, cfg = CONFIG) {
  const sf = cfg && cfg.STARTER_FOLDERS;
  if (!sf || !String(sf.TEMPLATE_DRIVE_ID ?? '').trim()) return false;
  const t = sf.TEMPLATES && sf.TEMPLATES[recordType];
  return !!(t && String(t[cfg.CHECKLISTS.DEFAULT_VARIANT] ?? '').trim());
}

// The checklist variant key a project type's pack comes from, or null when
// the type gets no starter folder at all (LCI / Transformation, N-362).
// Blank / unmapped type → Default.
function starterPackVariant(projectType) {
  if (!projectHasChecklist(projectType)) return null;
  return checklistVariantForProjectType(projectType);
}

// { itemId, variantUsed } for a record type + variant: the variant's own pack,
// else the Default pack (D16), else null (feature dark). variantUsed is what
// StarterFolders.PackVariant records (D17).
function starterTemplateItemId(recordType, variant, cfg = CONFIG) {
  const t = (cfg.STARTER_FOLDERS.TEMPLATES || {})[recordType] || {};
  const own = String(t[variant] ?? '').trim();
  if (own) return { itemId: own, variantUsed: variant };
  const def = cfg.CHECKLISTS.DEFAULT_VARIANT;
  const fallback = String(t[def] ?? '').trim();
  return fallback ? { itemId: fallback, variantUsed: def } : null;
}

// ── Folder names ─────────────────────────────────────────────────────
// OneDrive / SharePoint naming rules. safeFilename() (utils.js) is NOT
// changed — it serves downloads, where these rules don't apply.
const _SF_BAD_CHARS     = /["*:<>?/\\|]/;
const _SF_CONTROL_CHARS = /[\u0000-\u001f]/;
const _SF_RESERVED      = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|\.lock|desktop\.ini)$/i;

// { ok, reason, clean }. clean = whitespace-collapsed, trimmed name; reason is
// a sentence for the modal when !ok. parentPath counts toward OneDrive's
// whole-path limit.
function validateFolderName(name, parentPath = '', cfg = CONFIG) {
  const sf = cfg.STARTER_FOLDERS;
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim();
  const fail = reason => ({ ok: false, reason, clean });
  if (!clean) return fail('Enter a folder name.');
  if (_SF_BAD_CHARS.test(clean)) return fail('Folder names can’t contain " * : < > ? / \\ |');
  if (_SF_CONTROL_CHARS.test(clean)) return fail('Folder names can’t contain control characters.');
  if (/\.$/.test(clean)) return fail('Folder names can’t end with a full stop.');
  if (/^~\$/.test(clean)) return fail('Folder names can’t start with ~$.');
  if (_SF_RESERVED.test(clean)) return fail(`“${clean}” is a reserved name — choose another.`);
  if (/_vti_/i.test(clean)) return fail('Folder names can’t contain _vti_.');
  if (clean.length > sf.NAME_MAX) return fail(`Folder names can be at most ${sf.NAME_MAX} characters.`);
  const full = (parentPath ? `${parentPath}/` : '') + clean;
  if (full.length > sf.PATH_MAX) return fail('That name makes the folder path too long for OneDrive — shorten it.');
  return { ok: true, reason: '', clean };
}

// Default root name for a project folder: the customer name (brief, D3).
// Falls back to a safeFilename() version, then 'Project', if the raw name
// breaks a rule.
function defaultProjectFolderName(project, cfg = CONFIG) {
  const parent = cfg.STARTER_FOLDERS.PARENT_PATH.project;
  const raw = (project && (project.CustomerName ?? project.Title)) || '';
  let v = validateFolderName(raw, parent, cfg);
  if (v.ok) return v.clean;
  v = validateFolderName(safeFilename(raw, '').replace(/\.+$/, ''), parent, cfg);
  return v.ok ? v.clean : 'Project';
}

// ── Placeholder values ───────────────────────────────────────────────
const _SF_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' → 'd MMM yyyy' ('2026-10-22' → '22 Oct 2026'). String parts
// only — no Date, so no UTC/BST shift and no ICU 'Sept' variance. null on
// anything else.
function formatShortDay(dayISO) {
  const m = String(dayISO ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const mon = _SF_MONTHS[Number(m[2]) - 1];
  return mon ? `${Number(m[3])} ${mon} ${m[1]}` : null;
}

// Token name → plain-text value for a project folder. Keys are exactly
// CONFIG.STARTER_FOLDERS.PLACEHOLDERS.project (asserted). ctx = { dmName,
// createdBy, today } — today is a 'YYYY-MM-DD' local day (localDayISO()).
// SharePoint dates go through spDateIn() (date part only — BST-safe).
function projectPlaceholderValues(project, ctx = {}) {
  const p = project || {};
  const day = v => formatShortDay(spDateIn(v)) || '';
  return {
    CustomerName:    String(p.CustomerName ?? p.Title ?? ''),
    ProjectType:     String(p.ProjectType ?? ''),
    DeliveryManager: String(ctx.dmName ?? ''),
    StartDate:       p.StartDate ? day(p.StartDate) : '',
    EndDate:         p.EndDate ? day(p.EndDate) : '',
    CreatedBy:       String(ctx.createdBy ?? ''),
    CreatedDate:     formatShortDay(ctx.today) || '',
  };
}

// ── .docx token filling ──────────────────────────────────────────────

// Text-node escaping for WordprocessingML. NOT escHtml: these values land in
// <w:t> XML text, never in HTML.
function xmlEscapeText(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const _SF_TOKEN_RE = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g;
const _SF_T_RE     = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>|<w:t(\s[^>]*)?\/>/g;
const _SF_P_EDGE   = /<w:p[\s>/]|<\/w:p>/g;

// Replaces {{Token}} in one WordprocessingML part. Returns { xml, replaced,
// unknown }: replaced = known tokens filled, unknown = distinct token names
// with no value (left byte-identical).
//
// The split-run trap: Word often stores {{CustomerName}} as several <w:r>
// runs ('{{Cust' | 'omer' | 'Name}}') after spell-check or a mid-edit. So the
// text of each paragraph's <w:t> nodes is concatenated, tokens are found in
// that string, and each match is written back into the <w:t> where it STARTS
// (keeping that run's formatting); the token's remaining characters are
// removed from the nodes it spans. Touched nodes get xml:space="preserve" so
// edge spaces survive. Tokens never span paragraphs. Works on the raw
// (already-escaped) node text — a token has no entities, so offsets hold.
function fillDocxXml(xml, values) {
  const src = String(xml ?? '');
  const vals = values || {};
  const unknown = new Set();
  // Fast path on a single '{' — a split token has no literal '{{' in the raw XML.
  if (src.indexOf('{') < 0) return { xml: src, replaced: 0, unknown: [] };

  const edges = [];
  let m;
  _SF_P_EDGE.lastIndex = 0;
  while ((m = _SF_P_EDGE.exec(src)) !== null) edges.push(m.index);

  const nodes = [];
  _SF_T_RE.lastIndex = 0;
  let e = 0;
  while ((m = _SF_T_RE.exec(src)) !== null) {
    while (e < edges.length && edges[e] < m.index) e++;
    const selfClosing = m[2] === undefined;
    nodes.push({
      start: m.index, end: m.index + m[0].length, group: e,
      attrs: (selfClosing ? m[3] : m[1]) || '', text: selfClosing ? '' : m[2],
    });
  }

  let replaced = 0;
  const rewrites = [];   // { node, text }
  let i = 0;
  while (i < nodes.length) {
    let j = i;
    while (j < nodes.length && nodes[j].group === nodes[i].group) j++;
    const group = nodes.slice(i, j);
    i = j;
    const joined = group.map(n => n.text).join('');
    if (joined.indexOf('{{') < 0) continue;
    const edits = [];
    _SF_TOKEN_RE.lastIndex = 0;
    while ((m = _SF_TOKEN_RE.exec(joined)) !== null) {
      if (Object.prototype.hasOwnProperty.call(vals, m[1])) {
        edits.push({ from: m.index, to: m.index + m[0].length, value: xmlEscapeText(vals[m[1]]) });
        replaced++;
      } else {
        unknown.add(m[1]);
      }
    }
    if (!edits.length) continue;
    let offset = 0;
    group.forEach(n => {
      const lo = offset, hi = offset + n.text.length;
      offset = hi;
      if (!edits.some(ed => ed.from < hi && ed.to > lo)) return;
      let out = '';
      let p = lo;
      while (p < hi) {
        const ed = edits.find(x => x.from <= p && p < x.to);
        if (ed) {
          if (p === ed.from) out += ed.value;
          p = Math.min(ed.to, hi);
        } else {
          out += joined[p];
          p++;
        }
      }
      rewrites.push({ node: n, text: out });
    });
  }

  let out = src;
  rewrites.sort((a, b) => b.node.start - a.node.start).forEach(({ node, text }) => {
    const attrs = /\sxml:space\s*=/.test(node.attrs) ? node.attrs : `${node.attrs} xml:space="preserve"`;
    out = out.slice(0, node.start) + `<w:t${attrs}>${text}</w:t>` + out.slice(node.end);
  });
  return { xml: out, replaced, unknown: [...unknown].sort() };
}

// ── Sharing ──────────────────────────────────────────────────────────

// ';' / ',' / whitespace-separated emails → lower-cased, trimmed, de-duped.
function splitEmailList(s) {
  return [...new Set(String(s ?? '').split(/[;,\s]+/).map(x => x.trim().toLowerCase()).filter(x => x.includes('@')))];
}

// Who a new folder is shared with (D24): the Lead DM + active admins,
// de-duplicated, minus the creator and the SHARE_EXCLUDE list (D11).
function shareRecipients({ leadDm = '', adminEmails = [], creator = '', exclude = [] } = {}) {
  const skip = new Set([String(creator).trim().toLowerCase(), ...exclude.map(x => String(x).trim().toLowerCase())]);
  return splitEmailList([leadDm, ...(adminEmails || [])].join(';')).filter(x => !skip.has(x));
}

// StarterFolders.ShareStatus from how many invites were attempted / landed.
function starterShareStatus(attempted, succeeded) {
  if (!attempted) return 'none';
  if (succeeded >= attempted) return 'ok';
  return succeeded > 0 ? 'partial' : 'failed';
}

// ── Permissions + state (D24, D26, D27) ──────────────────────────────

// 'd MMM yyyy' local day a StarterFolders row was created, or null. Created is
// SharePoint's system timestamp — a genuine instant, so the local day of it is
// correct (unlike a date-only column, which goes through spDateIn).
function starterCreatedDay(row) {
  const t = row && row.Created ? new Date(row.Created) : null;
  return t && !isNaN(t.getTime()) ? formatShortDay(localDayISO(t)) : null;
}

// Project folder: an Admin, or the project's Lead DM (Projects.DeliveryManager).
function canCreateProjectStarterFolder(role, project, email) {
  if (role === 'admin') return true;
  const me = String(email ?? '').trim().toLowerCase();
  const dm = String((project && project.DeliveryManager) ?? '').trim().toLowerCase();
  return !!me && me === dm;
}

// The record's starter folder row, or null. One per project (D26); if a race
// ever wrote two, the lowest id is the one shown.
function recordStarterFolder(rows, recordType, recordId) {
  const type = normChecklistKey(recordType);
  const hits = (rows || []).filter(r =>
    normChecklistKey(r.RecordType) === type && Number(r.RecordId) === Number(recordId));
  hits.sort((a, b) => Number(a.id) - Number(b.id));
  return hits[0] || null;
}

// Owner or a share recipient sees Open folder (D27). Owner-only details are
// gated on isStarterFolderOwner.
function isStarterFolderOwner(row, email) {
  const me = String(email ?? '').trim().toLowerCase();
  return !!(row && me && String(row.OwnerEmail ?? '').trim().toLowerCase() === me);
}
function canOpenStarterFolder(row, email) {
  if (!row) return false;
  const me = String(email ?? '').trim().toLowerCase();
  return isStarterFolderOwner(row, me) || (!!me && splitEmailList(row.SharedWith).includes(me));
}
