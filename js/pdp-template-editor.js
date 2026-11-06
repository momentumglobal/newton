// js/pdp-template-editor.js — People > PDP Setup > Templates (N-436 / PDP-4)
//
// Version list, draft editor, preview and publish for the four meeting templates (PDP-D7). Only a
// Draft is ever edited; Publish retires the version it replaces, and meetings keep the version they
// used. Pure rules (validation, numbering, keys) are in pdp-data.js; Graph calls are in api-pdp.js
// (startPdpTemplateDraft, savePdpTemplateDraft, publishPdpTemplate, discardPdpTemplateDraft).
// pdp-setup.js owns the page and calls pdptTemplatesHtml(); this file never names a PDP list.
//
// Editing model: the draft lives in _pdptDraft.def. Every input carries data-f="<path>" and
// _pdptSync() copies the whole form into the draft before any structural change, Save, Preview or
// Publish, so a missed change event can never lose text. Block keys are issued once and never change
// when a label is edited (prep and notes JSON are keyed by them, N-438/439). No drag and drop:
// move buttons only.

let _pdptDraft = null;      // { id, meetingType, versionNo, title, def, dirty }
let _pdptView  = 'list';    // 'list' | 'editor' | 'preview'
let _pdptPrev  = null;      // { title, def, back } for a read-only preview
let _pdptBusy  = false;

const _PDPT_TYPE_TEXT = {
  prepQuestion: 'Pre-work question',
  prompt:       'Discussion note',
  goalSet:      'Goal setting',
  goalReview:   'Goal review',
  actions:      'Actions',
  scoring:      'Pillar scoring',
};
const _PDPT_BY_TEXT = { employee: 'Employee', manager: 'Manager', meeting: 'In the meeting' };
const _PDPT_STATUS_TEXT = { Draft: 'Draft', Published: 'Published', Retired: 'Retired' };

// Warn on a tab close or reload with unsaved template edits (in-page navigation has its own prompt).
window.addEventListener('beforeunload', (e) => {
  if (_pdptView === 'editor' && _pdptDraft && _pdptDraft.dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ── List ──────────────────────────────────────────────────────────────

// Called by pdp-setup.js for the Templates tab. Shows the editor or a preview instead when one is open.
function pdptTemplatesHtml(setup) {
  if (_pdptView === 'editor' && _pdptDraft) return _pdptEditorHtml();
  if (_pdptView === 'preview' && _pdptPrev) return _pdptPreviewHtml();
  return CONFIG.PDP.MEETING_TYPES.map(type => _pdptTypeCardHtml(setup.templates, type)).join('');
}

function _pdptTypeCardHtml(templates, type) {
  const label  = CONFIG.PDP.MEETING_LABELS[type] || type;
  const active = pdpActiveTemplate(templates, type);
  const draft  = pdpTemplateDraft(templates, type);
  const rows   = templates.filter(r => r.MeetingType === type).sort((a, b) => Number(b.VersionNo) - Number(a.VersionNo));
  const state  = active
    ? `Version ${escHtml(String(active.VersionNo))} is in force${active.PublishedAt ? ', published ' + escHtml(_pdpsFmtDate(active.PublishedAt)) : ''}${active.PublishedBy ? ' by ' + escHtml(active.PublishedBy) : ''}.`
    : 'No published version yet. Meetings of this type cannot be generated until one is published.';
  const history = rows.length
    ? rows.map(r => `
          <tr>
            <td>v${escHtml(String(r.VersionNo))}</td>
            <td>${escHtml(_PDPT_STATUS_TEXT[r.Status] || r.Status || '')}</td>
            <td>${escHtml(_pdpsFmtDate(r.PublishedAt))}</td>
            <td>${escHtml(r.PublishedBy || '')}</td>
            <td><button type="button" class="btn-secondary btn--sm"${act('pdptPreviewRow', String(r.id))}>View</button></td>
          </tr>`).join('')
    : emptyStateRow({ colspan: 5, icon: 'file-text', message: 'No versions yet.' });
  return `
    <div class="ppl-card pdpt-type">
      <div class="pdpt-type-head">
        <div>
          <div class="ppl-card-title ppl-card-title--flush">${escHtml(label)}</div>
          <p class="ppl-muted-note">${state}${draft ? ` A draft (v${escHtml(String(draft.VersionNo))}) is open.` : ''}</p>
        </div>
        <div class="pdpt-type-actions">
          ${draft
            ? `<button type="button" class="btn-primary"${act('pdptEdit', String(draft.id))}>Edit draft v${escHtml(String(draft.VersionNo))}</button>`
            : `<button type="button" class="btn-primary"${act('pdptNew', type)}>New version</button>`}
        </div>
      </div>
      <table class="data-table pdpt-history">
        <thead><tr><th>Version</th><th>Status</th><th>Published</th><th>By</th><th></th></tr></thead>
        <tbody>${history}
        </tbody>
      </table>
    </div>`;
}

async function _pdptRefresh() {
  _pdpsState.setup = await readPdpSetup(true);
}

function _pdptShow() {
  const body = document.getElementById('pdps-body');
  if (body) body.innerHTML = pdptTemplatesHtml(_pdpsState.setup);
  lucide.createIcons();
}

function _pdptLock(on) {
  _pdptBusy = on;
  const root = document.getElementById('main-content');
  if (root) root.setAttribute('aria-busy', on ? 'true' : 'false');
  if (root) root.classList.toggle('pdp-busy', on);   // CSS blocks clicks; the greyed-out move buttons stay disabled
}

async function pdptNew(meetingType) {
  if (_pdptBusy) return;
  _pdptLock(true);
  try {
    const row = await startPdpTemplateDraft(meetingType);
    await _pdptRefresh();
    const draft = pdpTemplateDraft(_pdpsState.setup.templates, meetingType) || row;
    _pdptOpen(draft);
  } catch (e) {
    console.error('PDP new template version failed:', e);
    toast(`Couldn't start a new version — ${e.message}`, { type: 'error' });
  }
  _pdptLock(false);
}

async function pdptEdit(id) {
  if (_pdptBusy) return;
  const row = _pdpsState.setup.templates.find(r => String(r.id) === String(id));
  if (!pdpTemplateEditable(row)) { toast('Only a draft can be edited.', { type: 'error' }); return; }
  _pdptOpen(row);
}

function _pdptOpen(row) {
  const parsed = pdpParseJson(row.Definition);
  _pdptDraft = {
    id: String(row.id), meetingType: row.MeetingType, versionNo: Number(row.VersionNo),
    title: row.Title || pdpTemplateTitle(row.MeetingType, row.VersionNo),
    def: parsed && Array.isArray(parsed.sections) ? parsed : pdpBlankDefinition(),
    dirty: false,
  };
  _pdptDraft.def.schema = 1;
  _pdptView = 'editor';
  _pdptShow();
}

function pdptPreviewRow(id) {
  const row = _pdpsState.setup.templates.find(r => String(r.id) === String(id));
  if (!row) return;
  const def = pdpParseJson(row.Definition);
  _pdptPrev = { title: `${row.Title || ''} (${_PDPT_STATUS_TEXT[row.Status] || row.Status})`, def: def, back: 'list' };
  _pdptView = 'preview';
  _pdptShow();
}

// ── Editor ────────────────────────────────────────────────────────────

function _pdptOptions(values, current, text) {
  return values.map(v => `<option value="${escAttr(v)}"${v === current ? ' selected' : ''}>${escHtml((text && text[v]) || v)}</option>`).join('');
}

function _pdptBlockSettingsHtml(si, bi, b) {
  const f = (k) => `${si}:${bi}:${k}`;
  const num = (k, v, lo, hi, label) => `<label class="pdpt-mini">${escHtml(label)}
        <input type="number" min="${lo}" max="${hi}" value="${escAttr(String(v))}" data-f="b:${f(k)}" data-num="1"></label>`;
  switch (b.type) {
    case 'prepQuestion':
      return `<label class="pdpt-mini">Answered by
        <select data-f="b:${f('by')}">${_pdptOptions(CONFIG.PDP.BLOCK_BY, b.by, _PDPT_BY_TEXT)}</select></label>`;
    case 'goalReview':
      return `<label class="pdpt-mini">When
        <select data-f="b:${f('by')}">${_pdptOptions(CONFIG.PDP.REVIEW_BY, b.by, { employee: 'Before the meeting (employee)', meeting: 'In the meeting' })}</select></label>`;
    case 'goalSet':
      return `<label class="pdpt-mini">Goal level
        <select data-f="b:${f('level')}">${_pdptOptions(CONFIG.PDP.GOAL_LEVELS, b.level)}</select></label>
        ${num('min', b.min, 1, CONFIG.PDP.TEMPLATE_LIMITS.GOALS_MAX, 'Fewest goals')}
        ${num('max', b.max, 1, CONFIG.PDP.TEMPLATE_LIMITS.GOALS_MAX, 'Most goals')}`;
    case 'actions':
      return num('max', b.max, 1, CONFIG.PDP.TEMPLATE_LIMITS.ACTIONS_MAX, 'Most actions');
    default:
      return '';
  }
}

function _pdptBlockHtml(si, bi, b, count) {
  const f = (k) => `b:${si}:${bi}:${k}`;
  return `
        <div class="pdpt-block">
          <div class="pdpt-block-head">
            <span class="pdpt-type-tag">${escHtml(_PDPT_TYPE_TEXT[b.type] || b.type)}</span>
            <span class="pdpt-block-actions">
              <button type="button" class="btn-icon" aria-label="Move up"${bi === 0 ? ' disabled' : ''}${act('pdptMoveBlock', si, bi, -1)}><i data-lucide="chevron-up"></i></button>
              <button type="button" class="btn-icon" aria-label="Move down"${bi === count - 1 ? ' disabled' : ''}${act('pdptMoveBlock', si, bi, 1)}><i data-lucide="chevron-down"></i></button>
              <button type="button" class="btn-icon" aria-label="Remove item"${act('pdptRemoveBlock', si, bi)}><i data-lucide="trash-2"></i></button>
            </span>
          </div>
          <div class="form-group">
            <label>${b.type === 'scoring' || b.type === 'goalSet' || b.type === 'goalReview' || b.type === 'actions' ? 'Heading' : 'Question or note'}</label>
            <input type="text" maxlength="${escAttr(CONFIG.PDP.TEMPLATE_LIMITS.LABEL_MAX)}" value="${escAttr(b.label || '')}" data-f="${f('label')}">
          </div>
          <div class="form-group">
            <label>Hint (optional)</label>
            <textarea rows="2" maxlength="${escAttr(CONFIG.PDP.TEMPLATE_LIMITS.HINT_MAX)}" data-f="${f('hint')}">${escHtml(b.hint || '')}</textarea>
          </div>
          <div class="pdpt-settings">
            ${_pdptBlockSettingsHtml(si, bi, b)}
            <label class="pdpt-mini pdpt-required"><input type="checkbox" data-f="${f('required')}"${b.required ? ' checked' : ''}> Required</label>
          </div>
        </div>`;
}

function _pdptSectionHtml(si, s, total) {
  const blocks = s.blocks || [];
  const typeChoices = CONFIG.PDP.BLOCK_TYPES.filter(t => t !== 'scoring' || _pdptDraft.meetingType === 'BiAnnual');
  return `
      <div class="ppl-card pdpt-section">
        <div class="pdpt-section-head">
          <div class="form-group pdpt-section-title">
            <label>Section title</label>
            <input type="text" maxlength="${escAttr(CONFIG.PDP.TEMPLATE_LIMITS.TITLE_MAX)}" value="${escAttr(s.title || '')}" data-f="s:${si}:title">
          </div>
          <span class="pdpt-block-actions">
            <button type="button" class="btn-icon" aria-label="Move section up"${si === 0 ? ' disabled' : ''}${act('pdptMoveSection', si, -1)}><i data-lucide="chevron-up"></i></button>
            <button type="button" class="btn-icon" aria-label="Move section down"${si === total - 1 ? ' disabled' : ''}${act('pdptMoveSection', si, 1)}><i data-lucide="chevron-down"></i></button>
            <button type="button" class="btn-icon" aria-label="Remove section"${act('pdptRemoveSection', si)}><i data-lucide="trash-2"></i></button>
          </span>
        </div>
        ${blocks.map((b, bi) => _pdptBlockHtml(si, bi, b, blocks.length)).join('') || '<p class="ppl-muted-small">No items in this section yet.</p>'}
        <div class="pdpt-add">
          <select aria-label="Add an item to this section"${actOn('change', 'pdptAddBlock', si, ACT_VALUE)}>
            <option value="">Add an item…</option>
            ${typeChoices.map(t => `<option value="${escAttr(t)}">${escHtml(_PDPT_TYPE_TEXT[t] || t)}</option>`).join('')}
          </select>
        </div>
      </div>`;
}

function _pdptEditorHtml() {
  const d = _pdptDraft;
  const secs = d.def.sections;
  return `
    <div id="pdpt-editor"${actOn('input', 'pdptDirty')}>
      <div class="pdpt-bar">
        <button type="button" class="btn-secondary"${act('pdptBack')}>Back to templates</button>
        <div class="pdpt-bar-title"><strong>${escHtml(d.title)}</strong> <span class="ppl-muted-small">Draft${d.dirty ? ' — unsaved changes' : ''}</span></div>
        <div class="pdpt-bar-actions">
          <button type="button" class="btn-secondary"${act('pdptPreview')}>Preview</button>
          <button type="button" class="btn-secondary"${act('pdptSave')}>Save draft</button>
          <button type="button" class="btn-primary"${act('pdptPublish')}>Publish</button>
          <button type="button" class="btn-secondary"${act('pdptDiscard')}>Discard draft</button>
        </div>
      </div>
      <div id="pdpt-problems" class="pdpt-problems" role="alert" aria-live="polite"></div>
      ${secs.map((s, si) => _pdptSectionHtml(si, s, secs.length)).join('')}
      <button type="button" class="btn-secondary pdpt-add-section"${act('pdptAddSection')}>Add a section</button>
    </div>`;
}

// Copy every data-f input into the draft. Trims text; numbers become numbers.
function _pdptSync() {
  const root = document.getElementById('pdpt-editor');
  if (!root || !_pdptDraft) return;
  const secs = _pdptDraft.def.sections;
  root.querySelectorAll('[data-f]').forEach(el => {
    const p = el.dataset.f.split(':');
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.dataset.num) v = Number(el.value);
    else v = el.tagName === 'SELECT' ? el.value : el.value.trim();
    if (p[0] === 's') { if (secs[+p[1]]) secs[+p[1]][p[2]] = v; }
    else if (secs[+p[1]] && secs[+p[1]].blocks[+p[2]]) secs[+p[1]].blocks[+p[2]][p[3]] = v;
  });
}

function _pdptRedraw(keepDirty) {
  if (keepDirty) _pdptDraft.dirty = true;
  const host = document.getElementById('pdpt-editor');
  if (!host) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = _pdptEditorHtml();
  host.replaceWith(wrap.firstElementChild);
  lucide.createIcons();
}

function pdptDirty() {
  if (!_pdptDraft || _pdptDraft.dirty) return;
  _pdptDraft.dirty = true;
  const t = document.querySelector('.pdpt-bar-title .ppl-muted-small');
  if (t) t.textContent = 'Draft — unsaved changes';
}

function pdptAddSection() {
  _pdptSync();
  const secs = _pdptDraft.def.sections;
  if (secs.length >= CONFIG.PDP.TEMPLATE_LIMITS.MAX_SECTIONS) { toast(`At most ${CONFIG.PDP.TEMPLATE_LIMITS.MAX_SECTIONS} sections.`, { type: 'error' }); return; }
  const key = pdpBlockKey('section ' + (secs.length + 1), pdpDefinitionKeys(_pdptDraft.def).sections);
  secs.push({ key: key, title: 'New section', blocks: [] });
  _pdptRedraw(true);
}

async function pdptRemoveSection(si) {
  _pdptSync();
  const s = _pdptDraft.def.sections[si];
  if (!s) return;
  if (s.blocks.length && !(await confirmModal({ message: `Remove the section "${s.title}" and its ${s.blocks.length} ${s.blocks.length === 1 ? 'item' : 'items'}?`, confirmLabel: 'Remove', danger: true }))) return;
  _pdptDraft.def.sections.splice(si, 1);
  _pdptRedraw(true);
}

function pdptMoveSection(si, dir) {
  _pdptSync();
  _pdptDraft.def.sections = pdpMoveItem(_pdptDraft.def.sections, si, dir);
  _pdptRedraw(true);
}

function pdptAddBlock(si, type) {
  if (!type) return;
  _pdptSync();
  const s = _pdptDraft.def.sections[si];
  if (!s) return;
  const total = _pdptDraft.def.sections.reduce((n, x) => n + x.blocks.length, 0);
  if (total >= CONFIG.PDP.TEMPLATE_LIMITS.MAX_BLOCKS) { toast(`At most ${CONFIG.PDP.TEMPLATE_LIMITS.MAX_BLOCKS} items in a template.`, { type: 'error' }); _pdptRedraw(false); return; }
  if (type === 'scoring' && _pdptDraft.def.sections.some(x => x.blocks.some(b => b.type === 'scoring'))) {
    toast('A template can have only one scoring item.', { type: 'error' });
    _pdptRedraw(false);
    return;
  }
  s.blocks.push(pdpNewBlock(type, _pdptDraft.def));
  _pdptRedraw(true);
}

function pdptMoveBlock(si, bi, dir) {
  _pdptSync();
  const s = _pdptDraft.def.sections[si];
  if (!s) return;
  s.blocks = pdpMoveItem(s.blocks, bi, dir);
  _pdptRedraw(true);
}

function pdptRemoveBlock(si, bi) {
  _pdptSync();
  const s = _pdptDraft.def.sections[si];
  if (!s) return;
  s.blocks.splice(bi, 1);
  _pdptRedraw(true);
}

// Shows what stops a publish, next to the buttons. Returns true when the draft is valid.
function _pdptCheck() {
  const box = document.getElementById('pdpt-problems');
  const r = pdpValidateTemplate(_pdptDraft.def, _pdptDraft.meetingType);
  if (box) {
    box.innerHTML = r.ok ? '' : `<strong>Fix these before publishing:</strong><ul>${r.errors.map(e => `<li>${escHtml(e)}</li>`).join('')}</ul>`;
  }
  return r.ok;
}

async function pdptSave() {
  if (_pdptBusy || !_pdptDraft) return false;
  _pdptSync();
  _pdptLock(true);
  let ok = false;
  try {
    await savePdpTemplateDraft(_pdptDraft.id, _pdptDraft.def);
    _pdptDraft.dirty = false;
    toast('Draft saved.', { type: 'success' });
    ok = true;
  } catch (e) {
    console.error('PDP template save failed:', e);
    toast(`Couldn't save the draft — ${e.message}`, { type: 'error' });
  }
  _pdptLock(false);
  if (ok) { await _pdptRefresh().catch(() => {}); _pdptRedraw(false); _pdptCheck(); }
  return ok;
}

function pdptPreview() {
  _pdptSync();
  _pdptPrev = { title: `${_pdptDraft.title} (preview of the draft)`, def: _pdptDraft.def, back: 'editor' };
  _pdptView = 'preview';
  _pdptShow();
}

async function pdptPublish() {
  if (_pdptBusy || !_pdptDraft) return;
  _pdptSync();
  if (!_pdptCheck()) { toast('The draft has problems to fix before it can be published.', { type: 'error' }); return; }
  const label = CONFIG.PDP.MEETING_LABELS[_pdptDraft.meetingType] || _pdptDraft.meetingType;
  const active = pdpActiveTemplate(_pdpsState.setup.templates, _pdptDraft.meetingType);
  if (!(await confirmModal({
    message: `Publish v${_pdptDraft.versionNo} of ${label}?${active ? ` Version ${active.VersionNo} is retired.` : ''} Meetings already started keep the version they used.`,
    confirmLabel: 'Publish',
  }))) return;
  if (!(await pdptSave())) return;
  _pdptLock(true);
  try {
    const r = await publishPdpTemplate(_pdptDraft.id);
    toast(r.retireFailed ? `Published v${r.versionNo}. The previous version could not be retired; it is harmless.` : `Published v${r.versionNo}.`, { type: r.retireFailed ? 'info' : 'success' });
    _pdptDraft = null;
    _pdptView = 'list';
    await _pdptRefresh();
    _pdptShow();
  } catch (e) {
    console.error('PDP template publish failed:', e);
    toast(`Couldn't publish — ${e.message}`, { type: 'error' });
  }
  _pdptLock(false);
}

async function pdptDiscard() {
  if (_pdptBusy || !_pdptDraft) return;
  if (!(await confirmModal({ message: `Discard draft v${_pdptDraft.versionNo}? It is kept as Retired and no longer offered for editing.`, confirmLabel: 'Discard', danger: true }))) return;
  _pdptLock(true);
  try {
    await discardPdpTemplateDraft(_pdptDraft.id);
    _pdptDraft = null;
    _pdptView = 'list';
    await _pdptRefresh();
    _pdptShow();
  } catch (e) {
    console.error('PDP template discard failed:', e);
    toast(`Couldn't discard the draft — ${e.message}`, { type: 'error' });
  }
  _pdptLock(false);
}

async function pdptBack() {
  if (_pdptView === 'preview') {
    _pdptView = _pdptPrev && _pdptPrev.back === 'editor' && _pdptDraft ? 'editor' : 'list';
    _pdptPrev = null;
    _pdptShow();
    return;
  }
  if (_pdptDraft && _pdptDraft.dirty && !(await confirmModal({ message: 'You have unsaved changes to this draft. Leave without saving?', confirmLabel: 'Leave', danger: true }))) return;
  _pdptDraft = null;
  _pdptView = 'list';
  _pdptShow();
}

// ── Preview (read-only) ───────────────────────────────────────────────

function _pdptPreviewBlockHtml(b) {
  const by = b.by ? ` (${escHtml(_PDPT_BY_TEXT[b.by] || b.by)})` : '';
  const hint = b.hint ? `<p class="ppl-muted-small">${escHtml(b.hint)}</p>` : '';
  const req = b.required ? ' <span class="ppl-muted-small">Required</span>' : '';
  let body;
  switch (b.type) {
    case 'prepQuestion': body = `<div class="pdpt-sample">${escHtml(_PDPT_BY_TEXT[b.by] || '')} answers before the meeting</div>`; break;
    case 'prompt':       body = '<div class="pdpt-sample">Discussion note taken in the meeting</div>'; break;
    case 'goalSet':      body = `<div class="pdpt-sample">Agree ${escHtml(String(b.min))} to ${escHtml(String(b.max))} ${escHtml(b.level || '')} goals: objective, why it matters, success measures, target date, support and category</div>`; break;
    case 'goalReview':   body = `<div class="pdpt-sample">${b.by === 'employee' ? 'Employee reviews' : 'Reviewed in the meeting'}: Red / Amber / Green and a comment for each open goal</div>`; break;
    case 'actions':      body = `<div class="pdpt-sample">Up to ${escHtml(String(b.max))} actions, each with an owner and a due date</div>`; break;
    case 'scoring':      body = '<div class="pdpt-sample">Score each of the six pillars 1 to 3 against the descriptors for the level: self first, then the manager, blind to each other</div>'; break;
    default:             body = '';
  }
  return `
        <div class="pdpt-prev-block">
          <div><strong>${escHtml(b.label || '')}</strong>${by}${req}</div>
          ${hint}${body}
        </div>`;
}

function _pdptPreviewHtml() {
  const def = _pdptPrev.def;
  const sections = def && Array.isArray(def.sections) ? def.sections : [];
  return `
    <div id="pdpt-preview">
      <div class="pdpt-bar">
        <button type="button" class="btn-secondary"${act('pdptBack')}>${_pdptPrev.back === 'editor' ? 'Back to the draft' : 'Back to templates'}</button>
        <div class="pdpt-bar-title"><strong>${escHtml(_pdptPrev.title)}</strong></div>
      </div>
      ${sections.length ? sections.map(s => `
      <div class="ppl-card pdpt-section">
        <div class="ppl-card-title">${escHtml(s.title || '')}</div>
        ${(s.blocks || []).map(_pdptPreviewBlockHtml).join('') || '<p class="ppl-muted-small">No items.</p>'}
      </div>`).join('') : emptyStateBlock({ icon: 'file-text', message: 'This version has no readable content.' })}
    </div>`;
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  pdptNew,
  pdptEdit,
  pdptPreviewRow,
  pdptDirty,
  pdptAddSection,
  pdptRemoveSection,
  pdptMoveSection,
  pdptAddBlock,
  pdptMoveBlock,
  pdptRemoveBlock,
  pdptSave,
  pdptPreview,
  pdptPublish,
  pdptDiscard,
  pdptBack,
});