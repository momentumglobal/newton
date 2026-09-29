// js/checklist-admin.js — Config Panel "Checklists" tab (N-266b)
//
// Admins build Project & Role checklist content, and switch checklists on per
// record type, without editing SharePoint or releasing code. admin.js only
// registers the tab and dispatches to buildChecklistsTab(); everything the tab
// renders or does lives here.
//
// Graph calls go through api-checklists.js (createItem/updateItem underneath,
// so both cache tiers are invalidated — ChecklistTemplates is tier-2
// enrolled). Ordering, variant and validation rules are the shared pure
// functions in utils.js. The action picker is built from CHECKLIST_ACTIONS
// (checklists.js), so an action N-259/N-260 registers appears here with no
// change to this file.
//
// Switch-on: the FIRST switch-on per record type writes a one-shot ID
// watermark (FromId = highest existing id + 1) and OnAt. Later on/off only
// flips Enabled — FromId/OnAt are never rewritten (setChecklistSettings
// refuses to move a FromId that is already set).
//
// Every change re-renders through renderAdminTab('checklists'), which re-reads
// the lists, so the screen only ever shows what was actually saved.

let _ckType    = 'project';                          // record type being edited
let _ckVariant = CONFIG.CHECKLISTS.DEFAULT_VARIANT;  // variant being edited
let _ckaForm        = null;  // null = closed; { id: null } = add; { id: '<sp id>' } = edit
let _ckaRename      = null;  // index into _ckaSections of the section being renamed
let _ckaBusy        = false; // a write is running — every control in the tab is disabled
let _ckaVariantRows = {};    // variant → rows of the selected type (retired included)
let _ckaSections    = [];    // groupChecklistItems() of the selected type + variant
let _ckaItems       = [];    // _ckaSections flattened — display order, retired included

const _CKA_TEXT = {
  project: { one: 'Project', many: 'projects', list: 'Projects', spList: 'Projects' },
  role:    { one: 'Role',    many: 'roles',    list: 'Roles',    spList: 'Roles' },
};
const _CKA_TYPE_LABEL = { tick: 'Tick-box', link: 'Link', action: 'Newton action' };
// validateChecklistItem() error field → the input it belongs to, in screen order.
const _CKA_FIELD_INPUT = {
  section: 'ck-f-section', label: 'ck-f-label', type: 'ck-f-type',
  linkUrl: 'ck-f-link', actionKey: 'ck-f-action', help: 'ck-f-help',
};

// ── Small helpers ────────────────────────────────────────────────────
// Section name as groupChecklistItems() groups it (blank → Default section).
function _ckaSec(it) {
  return String(it.Section ?? '').trim() || CONFIG.CHECKLISTS.DEFAULT_SECTION;
}
function _ckaNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function _ckaMaxOrder(rows, field) {
  return rows.reduce((max, r) => {
    const n = _ckaNum(r[field]);
    return n !== null && n > max ? n : max;
  }, 0);
}
// True when every value is set and no two are equal — i.e. swapping two
// neighbours' values is guaranteed to swap their positions.
function _ckaCleanOrders(values) {
  return values.every(n => n !== null) && new Set(values).size === values.length;
}
function _ckaSameVariant(row, variant) {
  return normChecklistKey(row.Variant) === normChecklistKey(variant);
}
function _ckaRows(variant) {
  return _ckaVariantRows[variant] || [];
}
// Generated once per item and never changed — progress rows key on it.
function _ckaNewKey() {
  return 'ck_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}
function _ckaTypeText(it) {
  const type = normChecklistKey(it.ItemType);
  if (type === 'action') {
    const action = _ckAction(it.ActionKey);
    return `Action: ${action ? action.label : 'unknown key'}`;
  }
  if (type === 'tick' || type === 'link') return _CKA_TYPE_LABEL[type];
  return String(it.ItemType ?? '').trim() || '—';
}

// ── Tab ──────────────────────────────────────────────────────────────
async function buildChecklistsTab() {
  let settingsAll, byType;
  try {
    const [settings, project, role] = await Promise.all([
      getChecklistSettings(),
      getChecklistTemplates('project'),
      getChecklistTemplates('role'),
    ]);
    settingsAll = settings;
    byType = { project, role };
  } catch (e) {
    console.warn('Checklists tab: checklist lists unavailable', e);
    return `
    <h3>Checklists</h3>
    <div class="ck-admin-setup" role="note">
      <i data-lucide="info" aria-hidden="true"></i>
      <span>Checklist lists not found — create ChecklistTemplates / ChecklistProgress and the AppSettings Checklist* columns (see Readme).</span>
    </div>`;
  }

  const variants = checklistVariants();
  if (!variants.includes(_ckVariant)) _ckVariant = CONFIG.CHECKLISTS.DEFAULT_VARIANT;
  _ckaVariantRows = {};
  variants.forEach(v => { _ckaVariantRows[v] = byType[_ckType].filter(r => _ckaSameVariant(r, v)); });
  _ckaSections = groupChecklistItems(_ckaRows(_ckVariant));
  _ckaItems    = _ckaSections.flatMap(g => g.items);
  if (_ckaForm && _ckaForm.id !== null && !_ckaItems.some(r => String(r.id) === _ckaForm.id)) _ckaForm = null;
  if (_ckaRename !== null && !_ckaSections[_ckaRename]) _ckaRename = null;

  return `
    <div class="ck-admin">
      <h3>Checklists</h3>
      <p class="admin-tab-intro">Build the workflow checklists shown on Projects and Roles, then switch each one on. Other users see content changes within 10 minutes, or straight away after <strong>Refresh data</strong>.</p>
      <div class="ck-admin-switches">
        ${CONFIG.CHECKLISTS.RECORD_TYPES.map(t => _ckaSwitchCardHtml(t, settingsAll[t], byType[t])).join('')}
      </div>
      ${_ckaPickerHtml()}
      <p id="ck-admin-status" class="ck-admin-status" role="status" aria-live="polite"></p>
      ${_ckaForm ? _ckaFormHtml() : ''}
      ${_ckaItems.length ? _ckaTableHtml() : _ckaEmptyHtml()}
    </div>`;
}

// Re-renders the tab and restores keyboard focus to the first focusable id
// in focusIds. An open form's typed values survive the re-render. Does
// nothing if the user has left the tab while a write was running.
async function _ckaRender(focusIds = []) {
  if (!document.querySelector('#main-content .ck-admin')) return;
  const formEl = document.getElementById('ck-form');
  const draft  = formEl ? { key: formEl.dataset.ckForm, values: _ckaReadForm() } : null;
  await renderAdminTab('checklists');
  const newForm = document.getElementById('ck-form');
  if (draft && newForm && newForm.dataset.ckForm === draft.key) _ckaFillForm(draft.values);
  for (const id of focusIds) {
    const el = document.getElementById(id);
    if (el && !el.disabled) { el.focus(); break; }
  }
}

// Disables every control in the tab while a write runs; the re-render that
// follows the write puts them back.
function _ckaLock(message = '') {
  _ckaBusy = true;
  const root = document.querySelector('#main-content .ck-admin');
  if (root) {
    root.setAttribute('aria-busy', 'true');
    root.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = true; });
  }
  const status = document.getElementById('ck-admin-status');
  if (status) status.textContent = message;
}

// Runs PATCHes one at a time, then re-renders from the lists. On a failure
// the cached templates are dropped so the re-render shows what SharePoint
// actually holds — never an order that wasn't saved.
async function _ckaWrite(patches, { focusIds = [], busyText = 'Saving…', doneText = '' } = {}) {
  if (!patches.length) return;
  _ckaLock(busyText);
  let done = 0;
  try {
    for (const p of patches) {
      await updateChecklistItem(p.id, p.fields);
      done++;
    }
    if (doneText) toast(doneText, { type: 'success' });
  } catch (e) {
    console.error('Checklist editor write failed:', e);
    refreshChecklistTemplates();
    toast(done
      ? `Only ${done} of ${patches.length} changes were saved — the list has been reloaded. Please try again.`
      : `Couldn't save that change — ${e.message}`, { type: 'error' });
    focusIds = [];
  }
  _ckaBusy = false;
  await _ckaRender(focusIds);
}

// ── Switch-on ────────────────────────────────────────────────────────
function _ckaSwitchCardHtml(type, s, rows) {
  const t        = _CKA_TEXT[type];
  const defaults = activeChecklistItems(rows, type, CONFIG.CHECKLISTS.DEFAULT_VARIANT).length;
  const date     = (s.onAt && spDateIn(s.onAt)) || '—';
  const on       = s.fromId !== null && s.enabled === true;
  let status;
  if (s.fromId === null) status = 'Off — Admin preview';
  else if (on)           status = `On since ${date} · applies to ${t.list} created from then on`;
  else                   status = `Off — Admin preview (cut-off kept: records from ${date})`;
  const blocked = !on && defaults === 0;
  return `
        <div class="ck-admin-switch">
          <div class="ck-admin-switch-title">${t.one} checklists</div>
          <p class="ck-admin-switch-status">${escHtml(status)}</p>
          <button type="button" class="${on ? 'btn-secondary' : 'btn-primary'}" id="ck-switch-${type}"
            onclick="ckaToggleSwitch('${type}', ${on ? 'false' : 'true'})"${blocked ? ` disabled title="Add Default items first" aria-describedby="ck-switch-hint-${type}"` : ''}>${on ? 'Switch off' : 'Switch on'}</button>
          ${blocked ? `<p class="ck-admin-hint" id="ck-switch-hint-${type}">Add Default items first.</p>` : ''}
        </div>`;
}

async function ckaToggleSwitch(recordType, turnOn) {
  if (_ckaBusy || !CONFIG.CHECKLISTS.RECORD_TYPES.includes(recordType)) return;
  const t = _CKA_TEXT[recordType];
  let s, defaults;
  try {
    const [settingsAll, rows] = await Promise.all([getChecklistSettings(), getChecklistTemplates(recordType)]);
    s = settingsAll[recordType];
    defaults = activeChecklistItems(rows, recordType, CONFIG.CHECKLISTS.DEFAULT_VARIANT).length;
  } catch (e) {
    toast(`Couldn't read the checklist settings — ${e.message}`, { type: 'error' });
    return;
  }
  const firstOn = turnOn && s.fromId === null;   // the one-shot watermark path
  if (turnOn && defaults === 0) {
    toast('Add Default items first.', { type: 'error' });
    return;
  }
  if (firstOn && !(await confirmModal({
    message: `Switch on ${t.one} checklists? They'll apply to ${t.many} created from now on. Existing ${t.many} won't get one, and this cut-off can't be moved later.`,
    confirmLabel: 'Switch on',
  }))) return;
  if (!turnOn && !(await confirmModal({
    message: `Switch off ${t.one} checklists? Users stop seeing them; Admins keep a preview. Ticks are kept, and switching back on keeps the same cut-off.`,
    confirmLabel: 'Switch off',
  }))) return;

  _ckaLock(turnOn ? 'Switching on…' : 'Switching off…');
  try {
    if (firstOn) {
      const fromId = (await getMaxItemId(t.spList)) + 1;
      // OnAt is a date-only column: today's UK day at midday UTC (N-087).
      await setChecklistSettings(recordType, { enabled: true, fromId, onAt: isoDate(localDayISO()) });
    } else {
      await setChecklistSettings(recordType, { enabled: turnOn });
    }
    toast(`${t.one} checklists switched ${turnOn ? 'on' : 'off'}.`, { type: 'success' });
  } catch (e) {
    console.error('Checklist switch failed:', e);
    toast(`Couldn't switch ${t.one.toLowerCase()} checklists ${turnOn ? 'on' : 'off'} — ${e.message}`, { type: 'error' });
  }
  _ckaBusy = false;
  await _ckaRender([`ck-switch-${recordType}`]);
}

// ── Record type + variant picker ─────────────────────────────────────
function _ckaPickerHtml() {
  const typeBtns = CONFIG.CHECKLISTS.RECORD_TYPES.map(t => `
          <button type="button" class="btn-filter${_ckType === t ? ' active' : ''}" id="ck-type-${t}" aria-pressed="${_ckType === t}"
            onclick="ckaSelectType('${t}')">${_CKA_TEXT[t].list}</button>`).join('');
  const variantBtns = checklistVariants().map((v, i) => {
    const n = activeChecklistItems(_ckaRows(v), _ckType, v).length;
    return `
          <button type="button" class="btn-filter${_ckVariant === v ? ' active' : ''}" id="ck-variant-${i}" aria-pressed="${_ckVariant === v}"
            onclick="ckaSelectVariant(${i})">${escHtml(v)} (${n})</button>`;
  }).join('');
  const activeHere = activeChecklistItems(_ckaRows(_ckVariant), _ckType, _ckVariant).length;
  const hint = (_ckVariant !== CONFIG.CHECKLISTS.DEFAULT_VARIANT && activeHere === 0)
    ? '<p class="ck-admin-hint">Uses Default until items are added.</p>'
    : '';
  return `
      <div class="ck-admin-picker">
        <div class="ck-admin-picker-row">
          <span class="ck-admin-picker-label" id="ck-type-label">Record type</span>
          <div class="filter-group" role="group" aria-labelledby="ck-type-label">${typeBtns}</div>
        </div>
        <div class="ck-admin-picker-row">
          <span class="ck-admin-picker-label" id="ck-variant-label">Variant</span>
          <div class="filter-group" role="group" aria-labelledby="ck-variant-label">${variantBtns}</div>
        </div>
        ${hint}
      </div>`;
}

function ckaSelectType(type) {
  if (_ckaBusy || !CONFIG.CHECKLISTS.RECORD_TYPES.includes(type)) return;
  _ckType = type;
  _ckaForm = null;
  _ckaRename = null;
  _ckaRender([`ck-type-${type}`]);
}

function ckaSelectVariant(i) {
  const v = checklistVariants()[i];
  if (_ckaBusy || !v) return;
  _ckVariant = v;
  _ckaForm = null;
  _ckaRename = null;
  _ckaRender([`ck-variant-${i}`]);
}

// ── Item table ───────────────────────────────────────────────────────
function _ckaTableHtml() {
  const last = _ckaSections.length - 1;
  const body = _ckaSections.map((g, si) => {
    const head = _ckaRename === si ? _ckaRenameRowHtml(g) : `
        <tr class="ck-admin-section-row">
          <td colspan="5">
            <div class="ck-admin-section-head">
              <span class="ck-admin-section-name">${escHtml(g.section)}</span>
              <div class="row-actions">
                <button type="button" class="btn-secondary btn-sm" id="ck-sec-rename-${si}" onclick="ckaStartRename(${si})" aria-label="Rename section ${escAttr(g.section)}">Rename</button>
                <button type="button" class="btn-secondary btn-sm" id="ck-sec-up-${si}" onclick="ckaMoveSection(${si}, -1)" aria-label="Move section ${escAttr(g.section)} up"${si === 0 ? ' disabled' : ''}>↑</button>
                <button type="button" class="btn-secondary btn-sm" id="ck-sec-down-${si}" onclick="ckaMoveSection(${si}, 1)" aria-label="Move section ${escAttr(g.section)} down"${si === last ? ' disabled' : ''}>↓</button>
              </div>
            </div>
          </td>
        </tr>`;
    return head + g.items.map((it, ii) => _ckaItemRowHtml(it, ii === 0, ii === g.items.length - 1)).join('');
  }).join('');
  return `
      ${_ckaForm ? '' : `
      <div class="ck-admin-toolbar">
        <button type="button" class="btn-primary" id="ck-add-btn" onclick="ckaOpenForm(null)">+ Add item</button>
      </div>`}
      <table class="data-table ck-admin-table">
        <thead><tr><th>Item</th><th>Type</th><th>Required</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${body}</tbody>
      </table>`;
}

function _ckaItemRowHtml(it, first, last) {
  const id       = Number(it.id);
  const active   = spYesNo(it.Active, true);
  const required = spYesNo(it.Required, false);
  const label    = String(it.ItemLabel ?? '');
  return `
        <tr class="ck-admin-item${active ? '' : ' ck-admin-item--retired'}">
          <td>${escHtml(label || '(no label)')}${active ? '' : ' <span class="checklist-tag">Retired</span>'}</td>
          <td>${escHtml(_ckaTypeText(it))}</td>
          <td>${required ? 'Yes' : '—'}</td>
          <td>${active ? 'Active' : 'Retired'}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="btn-secondary btn-sm" id="ck-edit-${id}" onclick="ckaOpenForm(${id})" aria-label="Edit ${escAttr(label)}">Edit</button>
              <button type="button" class="btn-secondary btn-sm" id="ck-up-${id}" onclick="ckaMoveItem(${id}, -1)" aria-label="Move ${escAttr(label)} up"${first ? ' disabled' : ''}>↑</button>
              <button type="button" class="btn-secondary btn-sm" id="ck-down-${id}" onclick="ckaMoveItem(${id}, 1)" aria-label="Move ${escAttr(label)} down"${last ? ' disabled' : ''}>↓</button>
              <button type="button" class="btn-secondary btn-sm" id="ck-retire-${id}" onclick="ckaSetActive(${id}, ${active ? 'false' : 'true'})" aria-label="${active ? 'Retire' : 'Restore'} ${escAttr(label)}">${active ? 'Retire' : 'Restore'}</button>
            </div>
          </td>
        </tr>`;
}

function _ckaEmptyHtml() {
  const sources = checklistVariants().filter(v => v !== _ckVariant && _ckaRows(v).length);
  const copy = sources.length ? `
          <div class="ck-admin-copy">
            <label for="ck-copy-src">Copy items from…</label>
            <select id="ck-copy-src">${sources.map(v => `<option value="${escAttr(v)}">${escHtml(v)} (${_ckaRows(v).length})</option>`).join('')}</select>
            <button type="button" class="btn-secondary" id="ck-copy-btn" onclick="ckaCopyVariant()">Copy items</button>
          </div>` : '';
  return `
      <div class="ck-admin-empty">
        <p>No ${_CKA_TEXT[_ckType].one.toLowerCase()} items in ${escHtml(_ckVariant)} yet.</p>
        <div class="ck-admin-empty-actions">
          ${_ckaForm ? '' : '<button type="button" class="btn-primary" id="ck-add-btn" onclick="ckaOpenForm(null)">+ Add item</button>'}
          ${copy}
        </div>
      </div>`;
}

// ── Add / edit form ──────────────────────────────────────────────────
function _ckaFormHtml() {
  const C  = CONFIG.CHECKLISTS;
  const it = _ckaForm.id === null ? null : _ckaItems.find(r => String(r.id) === _ckaForm.id);
  const rawType   = it ? normChecklistKey(it.ItemType) : 'tick';
  const type      = C.ITEM_TYPES.includes(rawType) ? rawType : '';
  const actionKey = it ? String(it.ActionKey ?? '').trim() : '';
  const unknownAction = type === 'action' && actionKey && !_ckAction(actionKey);
  const err = f => `<div class="ck-admin-field-error" id="ck-err-${f}"></div>`;
  return `
      <fieldset class="form-section ck-admin-form" id="ck-form" data-ck-form="${it ? Number(it.id) : 'new'}">
        <legend class="form-section-title">${it ? 'Edit item' : 'Add item'} — ${_CKA_TEXT[_ckType].list} · ${escHtml(_ckVariant)}</legend>
        <div class="form-row">
          <div class="form-group">
            <label for="ck-f-section">Section *</label>
            <input type="text" id="ck-f-section" list="ck-f-sections" value="${escAttr(it ? _ckaSec(it) : '')}" aria-describedby="ck-err-section">
            <datalist id="ck-f-sections">${_ckaSections.map(g => `<option value="${escAttr(g.section)}"></option>`).join('')}</datalist>
            ${err('section')}
          </div>
          <div class="form-group">
            <label for="ck-f-label">Item label *</label>
            <input type="text" id="ck-f-label" value="${escAttr(it ? it.ItemLabel || '' : '')}" aria-describedby="ck-err-label">
            ${err('label')}
          </div>
        </div>
        <div class="form-group">
          <label for="ck-f-type">Type *</label>
          <select id="ck-f-type" onchange="ckaFormTypeChanged()" aria-describedby="ck-err-type">
            ${type ? '' : '<option value="" selected>-- Choose a type --</option>'}
            ${C.ITEM_TYPES.map(k => `<option value="${k}"${k === type ? ' selected' : ''}>${_CKA_TYPE_LABEL[k]}</option>`).join('')}
          </select>
          ${err('type')}
        </div>
        <div class="form-group" id="ck-f-link-group"${type === 'link' ? '' : ' hidden'}>
          <label for="ck-f-link">Link URL *</label>
          <input type="text" id="ck-f-link" value="${escAttr(it ? it.LinkUrl || '' : '')}" placeholder="https://…" aria-describedby="ck-f-link-hint ck-err-linkUrl">
          <span class="form-hint" id="ck-f-link-hint">https:// address, or a Newton page such as people.html</span>
          ${err('linkUrl')}
        </div>
        <div class="form-group" id="ck-f-action-group"${type === 'action' ? '' : ' hidden'}>
          <label for="ck-f-action">Action *</label>
          <select id="ck-f-action" aria-describedby="ck-f-action-hint ck-err-actionKey">
            <option value="">-- Choose an action --</option>
            ${Object.entries(CHECKLIST_ACTIONS).map(([k, a]) => `<option value="${escAttr(k)}"${k === actionKey ? ' selected' : ''}>${escHtml(a.label)} — ${escHtml(a.description || '')}</option>`).join('')}
          </select>
          <span class="form-hint" id="ck-f-action-hint">${unknownAction
            ? `The saved action key “${escHtml(actionKey)}” isn't registered — choose one from the list.`
            : 'Only actions registered in Newton can be chosen.'}</span>
          ${err('actionKey')}
        </div>
        <div class="form-group">
          <label for="ck-f-help">Help text</label>
          <textarea id="ck-f-help" rows="3" aria-describedby="ck-err-help">${escHtml(it ? it.HelpText || '' : '')}</textarea>
          ${err('help')}
        </div>
        <label class="ck-admin-check"><input type="checkbox" id="ck-f-required"${it && spYesNo(it.Required, false) ? ' checked' : ''}> Required</label>
        <div class="form-actions">
          <button type="button" class="btn-primary" id="ck-f-save" onclick="ckaSaveItem()">${it ? 'Save changes' : 'Add item'}</button>
          <button type="button" class="btn-secondary" onclick="ckaCloseForm()">Cancel</button>
        </div>
      </fieldset>`;
}

function _ckaReadForm() {
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const req = document.getElementById('ck-f-required');
  return {
    section:   val('ck-f-section'),
    label:     val('ck-f-label'),
    type:      val('ck-f-type'),
    linkUrl:   val('ck-f-link'),
    actionKey: val('ck-f-action'),
    help:      val('ck-f-help'),
    required:  !!(req && req.checked),
  };
}

function _ckaFillForm(v) {
  Object.entries(_CKA_FIELD_INPUT).forEach(([f, inputId]) => {
    const el = document.getElementById(inputId);
    if (el) el.value = v[f];
  });
  const req = document.getElementById('ck-f-required');
  if (req) req.checked = v.required;
  ckaFormTypeChanged();
}

function _ckaShowErrors(errors) {
  let first = null;
  Object.entries(_CKA_FIELD_INPUT).forEach(([f, inputId]) => {
    const msg   = errors[f] || '';
    const errEl = document.getElementById(`ck-err-${f}`);
    const input = document.getElementById(inputId);
    if (errEl) errEl.textContent = msg;
    if (input) {
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    if (msg && !first) first = input;
  });
  if (first) first.focus();
}

function ckaFormTypeChanged() {
  const typeEl = document.getElementById('ck-f-type');
  const type   = typeEl ? typeEl.value : '';
  const link   = document.getElementById('ck-f-link-group');
  const action = document.getElementById('ck-f-action-group');
  if (link)   link.hidden   = type !== 'link';
  if (action) action.hidden = type !== 'action';
}

function ckaOpenForm(id) {
  if (_ckaBusy) return;
  const isNew = id === null || id === undefined;
  _ckaForm   = { id: isNew ? null : String(id) };
  _ckaRename = null;
  _ckaRender([isNew ? 'ck-f-section' : 'ck-f-label']);
}

function ckaCloseForm() {
  if (_ckaBusy) return;
  const id = _ckaForm && _ckaForm.id;
  _ckaForm = null;
  _ckaRender(id ? [`ck-edit-${Number(id)}`] : ['ck-add-btn']);
}

// A typed section that matches an existing one (ignoring case) takes that
// section's spelling, so 'setup' can't start a second 'Setup' section.
function _ckaResolveSection(typed) {
  const s   = String(typed ?? '').trim();
  const hit = _ckaSections.find(g => g.section.toLowerCase() === s.toLowerCase());
  return hit ? hit.section : s;
}

// SectionOrder/ItemOrder that put an item at the end of `section` — an
// existing section keeps its order; a new one goes after every other section.
function _ckaPlaceAtEnd(section, exclude) {
  const isOther = r => !exclude || String(r.id) !== String(exclude.id);
  const g = _ckaSections.find(x => x.section === section);
  const members = g ? g.items.filter(isOther) : [];
  if (members.length) {
    const orders = members.map(r => _ckaNum(r.SectionOrder)).filter(n => n !== null);
    return {
      SectionOrder: orders.length ? Math.min(...orders) : null,
      ItemOrder:    _ckaMaxOrder(members, 'ItemOrder') + 1,
    };
  }
  return { SectionOrder: _ckaMaxOrder(_ckaItems.filter(isOther), 'SectionOrder') + 1, ItemOrder: 1 };
}

async function ckaSaveItem() {
  if (_ckaBusy || !_ckaForm) return;
  const f = _ckaReadForm();
  const { ok, errors } = validateChecklistItem(f, Object.keys(CHECKLIST_ACTIONS));
  _ckaShowErrors(errors);
  if (!ok) return;
  const editing = _ckaForm.id === null ? null : _ckaItems.find(r => String(r.id) === _ckaForm.id);
  if (_ckaForm.id !== null && !editing) { ckaCloseForm(); return; }

  const type    = normChecklistKey(f.type);
  const section = _ckaResolveSection(f.section);
  // Edit never touches ItemKey, RecordType or Variant. The unused
  // LinkUrl/ActionKey is written null so a type change leaves nothing behind.
  const fields = {
    Title:     f.label.trim(),
    ItemType:  type,
    HelpText:  f.help.trim() || null,
    LinkUrl:   type === 'link'   ? f.linkUrl.trim()   : null,
    ActionKey: type === 'action' ? f.actionKey.trim() : null,
    Required:  f.required === true,
  };
  if (!editing || section !== _ckaSec(editing)) {
    Object.assign(fields, { Section: section }, _ckaPlaceAtEnd(section, editing));
  }

  const btn = document.getElementById('ck-f-save');
  _ckaBusy = true;
  setButtonLoading(btn);
  try {
    if (editing) {
      await updateChecklistItem(editing.id, fields);
    } else {
      await createChecklistItem({
        ...fields,
        ItemKey:    _ckaNewKey(),
        RecordType: _ckType,
        Variant:    _ckVariant,
        Active:     true,
      });
    }
  } catch (e) {
    console.error('Checklist item save failed:', e);
    _ckaBusy = false;
    clearButtonLoading(btn);
    toast(`Couldn't save the item — ${e.message}`, { type: 'error' });
    return;
  }
  _ckaForm = null;
  _ckaBusy = false;
  toast(editing ? 'Item saved' : 'Item added', { type: 'success' });
  await _ckaRender(editing ? [`ck-edit-${Number(editing.id)}`] : ['ck-add-btn']);
}

// ── Reorder, rename, retire ──────────────────────────────────────────
// Item ↑/↓ swaps ItemOrder with its neighbour in the same section (2 PATCHes).
// If the section's orders are blank or duplicated a swap can't be trusted to
// move anything, so the section is renumbered 1..n in the new order instead.
async function ckaMoveItem(id, dir) {
  if (_ckaBusy) return;
  const g = _ckaSections.find(s => s.items.some(r => String(r.id) === String(id)));
  if (!g) return;
  const i = g.items.findIndex(r => String(r.id) === String(id));
  const j = i + dir;
  if (j < 0 || j >= g.items.length) return;
  const a = g.items[i], b = g.items[j];
  let patches;
  if (_ckaCleanOrders(g.items.map(r => _ckaNum(r.ItemOrder)))) {
    patches = [
      { id: a.id, fields: { ItemOrder: _ckaNum(b.ItemOrder) } },
      { id: b.id, fields: { ItemOrder: _ckaNum(a.ItemOrder) } },
    ];
  } else {
    const order = g.items.slice();
    order[i] = b;
    order[j] = a;
    patches = order
      .map((r, k) => ({ id: r.id, n: k + 1, cur: _ckaNum(r.ItemOrder) }))
      .filter(x => x.cur !== x.n)
      .map(x => ({ id: x.id, fields: { ItemOrder: x.n } }));
  }
  const n = Number(id);
  await _ckaWrite(patches, { focusIds: [dir < 0 ? `ck-up-${n}` : `ck-down-${n}`, `ck-edit-${n}`] });
}

// Section ↑/↓ swaps SectionOrder for every item in the two sections (retired
// included). Blank or duplicated section orders → renumber every section.
async function ckaMoveSection(si, dir) {
  if (_ckaBusy) return;
  const sj = si + dir;
  if (!_ckaSections[si] || !_ckaSections[sj]) return;
  const groupOrder = g => {
    const orders = g.items.map(r => _ckaNum(r.SectionOrder)).filter(n => n !== null);
    return orders.length === g.items.length ? Math.min(...orders) : null;
  };
  const setAll = (g, n) => g.items
    .filter(r => _ckaNum(r.SectionOrder) !== n)
    .map(r => ({ id: r.id, fields: { SectionOrder: n } }));
  let patches;
  if (_ckaCleanOrders(_ckaSections.map(groupOrder))) {
    const a = _ckaSections[si], b = _ckaSections[sj];
    patches = [...setAll(a, groupOrder(b)), ...setAll(b, groupOrder(a))];
  } else {
    const order = _ckaSections.slice();
    order[si] = _ckaSections[sj];
    order[sj] = _ckaSections[si];
    patches = order.flatMap((g, k) => setAll(g, k + 1));
  }
  await _ckaWrite(patches, {
    focusIds: [dir < 0 ? `ck-sec-up-${sj}` : `ck-sec-down-${sj}`, `ck-sec-rename-${sj}`],
    busyText: 'Moving section…',
  });
}

function _ckaRenameRowHtml(g) {
  return `
        <tr class="ck-admin-section-row">
          <td colspan="5">
            <div class="ck-admin-rename">
              <label for="ck-rename-input" class="ck-admin-picker-label">Section name</label>
              <input type="text" id="ck-rename-input" value="${escAttr(g.section)}" aria-describedby="ck-rename-error"
                onkeydown="if (event.key === 'Enter') { event.preventDefault(); ckaSaveRename(); } else if (event.key === 'Escape') { ckaCancelRename(); }">
              <button type="button" class="btn-primary btn-sm" onclick="ckaSaveRename()">Save</button>
              <button type="button" class="btn-secondary btn-sm" onclick="ckaCancelRename()">Cancel</button>
              <span class="ck-admin-field-error" id="ck-rename-error"></span>
            </div>
          </td>
        </tr>`;
}

function ckaStartRename(si) {
  if (_ckaBusy || !_ckaSections[si]) return;
  _ckaRename = si;
  _ckaRender(['ck-rename-input']);
}

function ckaCancelRename() {
  if (_ckaBusy) return;
  const si = _ckaRename;
  _ckaRename = null;
  _ckaRender(si === null ? [] : [`ck-sec-rename-${si}`]);
}

// Renames by PATCHing Section on every item in the section, retired included.
async function ckaSaveRename() {
  if (_ckaBusy || _ckaRename === null) return;
  const si = _ckaRename;
  const g  = _ckaSections[si];
  const input = document.getElementById('ck-rename-input');
  const errEl = document.getElementById('ck-rename-error');
  if (!g || !input) return;
  const name = input.value.trim();
  let msg = '';
  if (!name) msg = 'Enter a section name.';
  else if (name.length > CONFIG.CHECKLISTS.LABEL_MAX) msg = `Keep the section name to ${CONFIG.CHECKLISTS.LABEL_MAX} characters or fewer.`;
  else if (_ckaSections.some((x, k) => k !== si && x.section.toLowerCase() === name.toLowerCase())) msg = 'That section already exists in this variant.';
  if (msg) {
    if (errEl) errEl.textContent = msg;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  if (name === g.section) { ckaCancelRename(); return; }
  _ckaRename = null;
  await _ckaWrite(g.items.map(r => ({ id: r.id, fields: { Section: name } })), {
    focusIds: [`ck-sec-rename-${si}`],
    busyText: 'Renaming section…',
    doneText: 'Section renamed',
  });
}

// Retire/Restore flips Active. No hard delete: progress rows for a retired
// item are kept and reappear with it on Restore.
async function ckaSetActive(id, active) {
  if (_ckaBusy) return;
  await _ckaWrite([{ id, fields: { Active: active === true } }], {
    focusIds: [`ck-retire-${Number(id)}`],
    busyText: active ? 'Restoring…' : 'Retiring…',
    doneText: active ? 'Item restored' : 'Item retired',
  });
}

// ── Copy items from another variant ──────────────────────────────────
// Only into an EMPTY variant. Copies every source item (active and retired)
// with a new ItemKey, one write at a time.
async function ckaCopyVariant() {
  if (_ckaBusy) return;
  const sel    = document.getElementById('ck-copy-src');
  const src    = sel ? sel.value : '';
  const target = _ckVariant;
  const type   = _ckType;
  if (!checklistVariants().includes(src) || src === target) return;
  let source;
  try {
    const rows = await getChecklistTemplates(type);
    if (rows.some(r => _ckaSameVariant(r, target))) {
      toast(`${target} already has items — copying only goes into an empty variant.`, { type: 'error' });
      await _ckaRender();
      return;
    }
    source = groupChecklistItems(rows.filter(r => _ckaSameVariant(r, src))).flatMap(g => g.items);
  } catch (e) {
    toast(`Couldn't read the items to copy — ${e.message}`, { type: 'error' });
    return;
  }
  if (!source.length) return;

  _ckaLock(`Copying 1 of ${source.length}…`);
  const status = document.getElementById('ck-admin-status');
  let copied = 0;
  try {
    for (const it of source) {
      if (status) status.textContent = `Copying ${copied + 1} of ${source.length}…`;
      await createChecklistItem({
        Title:        it.ItemLabel || '',
        ItemKey:      _ckaNewKey(),
        RecordType:   type,
        Variant:      target,
        Section:      it.Section,
        SectionOrder: it.SectionOrder,
        ItemOrder:    it.ItemOrder,
        ItemType:     it.ItemType,
        HelpText:     it.HelpText,
        LinkUrl:      it.LinkUrl,
        ActionKey:    it.ActionKey,
        Required:     spYesNo(it.Required, false),
        Active:       spYesNo(it.Active, true),
      });
      copied++;
    }
    toast(`Copied ${copied} item${copied === 1 ? '' : 's'} from ${src}.`, { type: 'success' });
  } catch (e) {
    console.error('Checklist copy failed:', e);
    refreshChecklistTemplates();
    toast(`Copy stopped — ${copied} of ${source.length} items copied. ${e.message}`, { type: 'error' });
  }
  _ckaBusy = false;
  await _ckaRender(['ck-add-btn']);
}