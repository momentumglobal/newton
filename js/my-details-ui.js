// js/my-details-ui.js — My Details page (N-456 / MM-6): the employee's own form, the Admin / People Ops picker for on-behalf
// edits, and the Manage panel. The *Html functions are pure (string in, string out) so the test rig can assert them; the render
// functions and actions need the DOM and the module state declared in my-momentum-nav.js (_mmResolvedRole, _mmIdentity).
// Every value is escaped; classes only (no inline style, no inline handlers). All wording comes from CONFIG.MY_MOMENTUM.DETAILS.TEXT.
// Personal data is never logged, toasted or kept: console.warn gets e.message only, and state is dropped on every render.

let _mdSeq = 0;                 // a slower, older load must not overwrite a newer one
let _mdState = { people: null, targetId: null, row: null, dirty: false, report: null };

// ── Markup (pure) ───────────────────────────────────────────────────────

function mdNoticeHtml(title, msg) {
  return `<div class="empty-state">
      <i data-lucide="info" class="empty-state-icon"></i>
      <h2 class="empty-state-title">${escHtml(title)}</h2>
      <p class="empty-state-message">${escHtml(msg)}</p>
    </div>`;
}

// The page title, the Admin / People Ops slots (filled only for them) and the body the loaders fill.
function mdShellHtml() {
  return `<div class="page-header"><h1 class="page-title">${escHtml(mdText('title'))}</h1></div>
    <p class="ppl-muted-note">${escHtml(mdText('privacyNote'))}</p>
    <div id="mmd-admin"></div>
    <div id="mmd-body">${skeletonPanel(6)}</div>`;
}

function mdFieldHtml(f, value, error, onBehalf) {
  const id = 'mdf-' + f.key;
  const type = f.kind === 'phone' ? 'tel' : (f.kind === 'email' ? 'email' : 'text');
  const ac = onBehalf ? 'off' : (f.ac || 'off');
  return `<div class="form-group${error ? ' mmd-invalid' : ''}">
      <label for="${escAttr(id)}">${escHtml(f.label)}</label>
      <input id="${escAttr(id)}" type="${type}" data-mdf="${escAttr(f.key)}" value="${escAttr(value)}" maxlength="${Number(f.max)}" autocomplete="${escAttr(ac)}"${actOn('input', 'mdDirty')}>
      ${error ? `<span class="mmd-error" role="alert">${escHtml(error)}</span>` : ''}
    </div>`;
}

function mdGroupHtml(g, values, errors, onBehalf) {
  const C = CONFIG.MY_MOMENTUM.DETAILS;
  const fields = C.FIELDS.filter(f => f.group === g).map(f => mdFieldHtml(f, (values && values[f.key]) || '', errors && errors[f.key], onBehalf)).join('');
  return `<section class="ppl-card mmd-card">
      <h2 class="ppl-card-title">${escHtml(C.GROUPS[g].title)}</h2>
      <p class="ppl-card-hint">${escHtml(C.GROUPS[g].hint)}</p>
      <div class="mmd-grid">${fields}</div>
    </section>`;
}

// The form. `stamp` = the "Last updated" line (already text); `heading` = the on-behalf heading or ''.
function mdFormHtml({ values, errors, heading, onBehalf, stamp, note }) {
  const C = CONFIG.MY_MOMENTUM.DETAILS;
  const hasErrors = errors && Object.keys(errors).length > 0;
  return `${heading ? `<h2 class="mmsc-heading">${escHtml(heading)}</h2>` : ''}
    ${note ? `<p class="ppl-muted-note">${escHtml(note)}</p>` : ''}
    ${hasErrors ? `<p class="mmd-error" role="alert">${escHtml(mdText('invalid'))}</p>` : ''}
    ${Object.keys(C.GROUPS).map(g => mdGroupHtml(g, values, errors, onBehalf)).join('')}
    <div class="mmd-foot">
      <span class="ppl-muted-note">${escHtml(stamp || '')}</span>
      <button type="button" class="btn-primary"${act('mdSave')}>${escHtml(mdText('save'))}</button>
    </div>`;
}

// The picker. `options` = mdTargetOptions(); `hasOwn` = the person has a People row (the first option is their own details).
function mdPickerHtml(options, hasOwn, selectedId) {
  const first = `<option value=""${selectedId ? '' : ' selected'}>${escHtml(mdText(hasOwn ? 'pickerOwn' : 'pickerChoose'))}</option>`;
  const opts = (options || []).map(o => `<option value="${escAttr(o.id)}"${String(selectedId) === String(o.id) ? ' selected' : ''}>${escHtml(o.label)}</option>`).join('');
  return `<div class="ppl-card mmd-picker">
      <div class="form-group">
        <label for="mmd-pick">${escHtml(mdText('pickerLabel'))}</label>
        <select id="mmd-pick"${actOn('change', 'mdPick', ACT_VALUE)}>${first}${opts}</select>
      </div>
      <p class="ppl-card-hint">${escHtml(mdText('pickerHint'))}</p>
    </div>`;
}

function _mdNameList(rows, line, total) {
  const cap = CONFIG.MY_MOMENTUM.DETAILS.DISPLAY_ROWS;
  const items = (rows || []).slice(0, cap).map(r => `<li>${line(r)}</li>`).join('');
  const more = total > cap ? `<p class="ppl-muted-note">+${total - cap} more</p>` : '';
  return `<ul class="mmd-names">${items}</ul>${more}`;
}

// The Manage card. `report` = getMyDetailsReport() or null (not read yet); `result` = the last action's one-line outcome.
function mdManageHtml(report, result) {
  const head = `<h2 class="ppl-card-title">${escHtml(mdText('manageTitle'))}</h2>
      <p class="ppl-card-hint">${escHtml(mdText('manageHint'))}</p>
      <p><button type="button" class="btn-secondary"${act('mdCheck')}>${escHtml(mdText('check'))}</button></p>
      ${result ? `<p class="ppl-muted-note">${escHtml(result)}</p>` : ''}`;
  let body = '';
  if (report && report.denied) {
    body = `<p><span class="dh-badge dh-badge-danger">${escHtml(mdText('denied'))}</span> ${escHtml(mdText('noAccessAdmin'))}</p>`;
  } else if (report) {
    const badge = n => (n ? '<span class="dh-badge dh-badge-warn">Amber</span>' : '<span class="dh-badge dh-badge-success">OK</span>');
    const row = (label, n, action) => `<tr><td>${escHtml(label)}</td><td>${Number(n)}</td><td>${badge(n)}</td><td>${n && action ? action : ''}</td></tr>`;
    const T = k => mdText(k);
    const table = `<div class="table-scroll"><table class="data-table"><thead><tr><th>${escHtml(T('colCheck'))}</th><th>${escHtml(T('colPeople'))}</th><th></th><th></th></tr></thead><tbody>
        ${row(T('chkMissing'), report.toCreate.length, `<button type="button" class="btn-primary"${act('mdCreateMissing')}>${escHtml(mdText('createRows', { n: report.toCreate.length }))}</button>`)}
        ${row(T('chkNoEmail'), report.noWorkEmail.length, '')}
        ${row(T('chkDrift'), report.drift.length, `<button type="button" class="btn-primary"${act('mdFixEmails')}>${escHtml(mdText('fixEmails', { n: report.drift.length }))}</button>`)}
        ${row(T('chkUnlocked'), report.unlocked.length, '')}
        ${row(T('chkDuplicates'), report.duplicates.length, '')}
        ${row(T('chkLeavers'), report.leavers.length, '')}
      </tbody></table></div>`;
    const lists = [
      report.toCreate.length ? `<h3 class="mmsc-sub">${escHtml(T('chkMissing'))}</h3>${_mdNameList(report.toCreate, r => escHtml(r.name || '—'), report.toCreate.length)}` : '',
      report.noWorkEmail.length ? `<h3 class="mmsc-sub">${escHtml(T('chkNoEmail'))}</h3>${_mdNameList(report.noWorkEmail, r => escHtml(r.name || '—'), report.noWorkEmail.length)}` : '',
      report.drift.length ? `<h3 class="mmsc-sub">${escHtml(T('chkDrift'))}</h3>${_mdNameList(report.drift, r => escHtml(r.name || '—'), report.drift.length)}` : '',
      report.unlocked.length ? `<h3 class="mmsc-sub">${escHtml(T('chkUnlocked'))}</h3><p class="ppl-muted-note">${escHtml(T('unlockedHint'))}</p>${_mdNameList(report.unlocked, r => escHtml((r.name || '—') + (r.ageMin === null ? '' : ' (' + r.ageMin + ' min)')), report.unlocked.length)}` : '',
      report.duplicates.length ? `<h3 class="mmsc-sub">${escHtml(T('chkDuplicates'))}</h3>${_mdNameList(report.duplicates, r => escHtml((r.name || '—') + ' (' + r.ids.length + ' rows)'), report.duplicates.length)}` : '',
      report.leavers.length ? `<h3 class="mmsc-sub">${escHtml(T('chkLeavers'))}</h3><p class="ppl-muted-note">${escHtml(T('leaversHint'))}</p>${_mdNameList(report.leavers, r => `${escHtml(r.name || '—')} <button type="button" class="btn-secondary"${act('mdClearRow', r.id)}>${escHtml(T('clear'))}</button>`, report.leavers.length)}` : '',
    ].join('');
    body = table + lists;
  }
  return `<section class="ppl-card mmd-card" id="mmd-manage">${head}${body}</section>`;
}

// ── Renderers and actions ───────────────────────────────────────────────

function _mdPeopleName(email) {
  const e = mdNormEmail(email);
  const p = (_mdState.people || []).find(x => mdNormEmail(x.WorkEmail) === e);
  return p ? p.EmployeeName : '';
}

function _mdMeId() { return _mmIdentity && _mmIdentity.me ? _mmIdentity.me.id : null; }

function _mdDrawBody(html) {
  const body = document.getElementById('mmd-body');
  if (!body) return false;
  body.innerHTML = html;
  lucide.createIcons();
  return true;
}

function _mdDrawManage(result) {
  const slot = document.getElementById('mmd-manage-slot');
  if (slot) slot.innerHTML = mdManageHtml(_mdState.report, result);
}

async function renderMyDetailsPage() {
  const main = document.getElementById('main-content');
  const seq = ++_mdSeq;
  _mdBindUnload();
  _mdState = { people: null, targetId: null, row: null, dirty: false, report: null };
  if (getGhostUser()) {
    main.innerHTML = mdNoticeHtml(mdText('ghostTitle'), mdText('ghost'));
    lucide.createIcons();
    return;
  }
  main.innerHTML = mdShellHtml();
  const admin = roleCan(_mmResolvedRole, 'myDetailsAdmin');
  const meId = _mdMeId();
  if (admin) {
    try {
      _mdState.people = await getPeople(false);
    } catch (e) {
      console.warn('N-456: people read failed', e && e.message);
      _mdState.people = [];
    }
    if (seq !== _mdSeq) return;
    const slot = document.getElementById('mmd-admin');
    if (slot) slot.innerHTML = mdPickerHtml(mdTargetOptions(_mdState.people), !!meId, '') + '<div id="mmd-manage-slot">' + mdManageHtml(null, '') + '</div>';
  }
  await _mdOpen(meId, seq);
}

// Open one person's form. null = nobody chosen (an Admin / People Ops person with no People row of their own).
async function _mdOpen(personId, seq) {
  _mdState.targetId = personId;
  _mdState.row = null;
  _mdState.dirty = false;
  const meId = _mdMeId();
  if (personId === null || personId === undefined || personId === '') {
    _mdDrawBody(mdNoticeHtml(mdText('noOwnTitle'), mdText('noOwn')));
    return;
  }
  const access = mdAccessFor(_mmResolvedRole, getGhostUser(), meId, personId);
  if (!access.edit) { _mdDrawBody(mdNoticeHtml(mdText('notAllowedTitle'), mdText('notAllowed'))); return; }
  const admin = roleCan(_mmResolvedRole, 'myDetailsAdmin');
  let row = null;
  let denied = false;
  try {
    if (admin) {
      const person = String(personId) === String(meId) ? _mmIdentity.me : (_mdState.people || []).find(p => String(p.id) === String(personId));
      if (!person) { _mdDrawBody(mdNoticeHtml(mdText('notAllowedTitle'), mdText('badPerson'))); return; }
      row = (await ensureMyDetailsRow(person)).row;
    } else {
      const r = await getMyDetails(personId);
      row = r.row;
      denied = r.denied;
    }
  } catch (e) {
    console.warn('N-456: My Details load failed', e && e.message);
    if (seq === _mdSeq) _mdDrawBody(mdNoticeHtml(mdText('loadFailedTitle'), mdText('loadFailed')));
    return;
  }
  if (seq !== _mdSeq) return;
  if (!row) {
    _mdDrawBody(mdNoticeHtml(mdText('notReadyTitle'), denied || !admin ? mdText('notReady') : mdText('loadFailed')));
    return;
  }
  _mdState.row = row;
  _mdShowForm(row, null);
}

function _mdShowForm(row, errors, values) {
  const onBehalf = String(_mdState.targetId) !== String(_mdMeId());
  const person = onBehalf ? (_mdState.people || []).find(p => String(p.id) === String(_mdState.targetId)) : null;
  const noEmail = onBehalf && person && !mdNormEmail(person.WorkEmail);
  _mdDrawBody(mdFormHtml({
    values: values || row,
    errors: errors || {},
    heading: onBehalf ? mdText('editingFor', { name: person ? person.EmployeeName : '' }) : '',
    onBehalf,
    stamp: mdStampLine(row, _mdPeopleName, !onBehalf),
    note: noEmail ? mdText('noWorkEmailNote') : '',
  }));
}

function _mdGather() {
  const v = {};
  document.querySelectorAll('[data-mdf]').forEach(el => { v[el.getAttribute('data-mdf')] = el.value; });
  return v;
}

function mdDirty() { _mdState.dirty = true; }

// Leaving with unsaved edits asks first (tab switch, picker change). Resolves true when it is fine to go.
async function mdConfirmLeave() {
  if (!_mdState.dirty) return true;
  const ok = await confirmModal({ title: mdText('leaveTitle'), message: mdText('leaveMsg'), confirmLabel: mdText('leave'), danger: true });
  if (ok) _mdState.dirty = false;
  return ok;
}

// One listener for the page's life; added on first render so the file stays declarations-only.
let _mdUnloadBound = false;
function _mdBindUnload() {
  if (_mdUnloadBound) return;
  _mdUnloadBound = true;
  window.addEventListener('beforeunload', function (e) {
    if (_mdState.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

async function mdPick(value) {
  if (!(await mdConfirmLeave())) {
    const sel = document.getElementById('mmd-pick');
    if (sel) sel.value = _mdState.targetId && String(_mdState.targetId) !== String(_mdMeId()) ? String(_mdState.targetId) : '';
    return;
  }
  const seq = ++_mdSeq;
  _mdDrawBody(skeletonPanel(6));
  await _mdOpen(value === '' ? _mdMeId() : value, seq);
}

async function mdSave() {
  const btn = event && event.target;   // capture synchronously (N-106)
  const row = _mdState.row;
  if (!row) return;
  const values = _mdGather();
  const onBehalf = String(_mdState.targetId) !== String(_mdMeId());
  const check = mdValidate(values);
  if (!check.ok) { _mdShowForm(row, check.errors, values); return; }
  setButtonLoading(btn);
  try {
    await saveMyDetails(row.id, values, { onBehalf });
    const fresh = await getMyDetails(_mdState.targetId);
    _mdState.row = fresh.row || row;
    _mdState.dirty = false;
    _mdShowForm(_mdState.row, null);
    toast(mdText('saved'), { type: 'success' });
  } catch (e) {
    clearButtonLoading(btn);
    console.warn('N-456: My Details save failed', e && e.message);
    if (e && e.fieldErrors) _mdShowForm(row, e.fieldErrors, values);
    else toast(mdText('saveFailed'), { type: 'error' });
  }
}

async function mdCheck() {
  const btn = event && event.target;
  setButtonLoading(btn);
  try {
    _mdState.report = await getMyDetailsReport();
    _mdDrawManage('');
  } catch (e) {
    console.warn('N-456: Manage check failed', e && e.message);
    _mdState.report = null;
    _mdDrawManage(mdText('checkFailed'));
  }
}

async function _mdRunManage(confirmOpts, work, doneKey) {
  if (!(await confirmModal(confirmOpts))) return;
  try {
    const out = await work();
    const msg = out && out.failed && out.failed.length ? mdText('doneWithFailures', { n: out.written, f: out.failed.length }) : mdText(doneKey, { n: out && out.written !== undefined ? out.written : '' });
    _mdState.report = await getMyDetailsReport();
    _mdDrawManage(msg);
  } catch (e) {
    console.warn('N-456: Manage action failed', e && e.message);
    _mdDrawManage(mdText('actionFailed'));
  }
}

async function mdCreateMissing() {
  const n = _mdState.report && _mdState.report.toCreate ? _mdState.report.toCreate.length : 0;
  if (!n) return;
  await _mdRunManage({ title: mdText('createTitle'), message: mdText('createMsg', { n }), confirmLabel: mdText('createRows', { n }) }, createMissingMyDetailsRows, 'created');
}

async function mdFixEmails() {
  const n = _mdState.report && _mdState.report.drift ? _mdState.report.drift.length : 0;
  if (!n) return;
  await _mdRunManage({ title: mdText('fixTitle'), message: mdText('fixMsg', { n }), confirmLabel: mdText('fixEmails', { n }) }, fixMyDetailsEmails, 'fixed');
}

async function mdClearRow(rowId) {
  const r = _mdState.report && (_mdState.report.leavers || []).find(x => String(x.id) === String(rowId));
  await _mdRunManage({ title: mdText('clearTitle'), message: mdText('clearMsg', { name: r ? r.name : '' }), confirmLabel: mdText('clear'), danger: true }, () => clearMyDetailsRow(rowId).then(() => ({ written: 1 })), 'cleared');
}

registerActions({
  mdDirty,
  mdPick,
  mdSave,
  mdCheck,
  mdCreateMissing,
  mdFixEmails,
  mdClearRow,
});