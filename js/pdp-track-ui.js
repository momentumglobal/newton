// js/pdp-track-ui.js — Goals & actions tracker markup + handlers (N-440 / PDP-8)
//
// One tracker, shared by People > My Development (the employee's own year) and People > Team Development (one
// person's year, for their line manager / CSD / Admin / People Ops). The host page calls pdptrSync(ctx) each time
// it draws and puts pdptrHtml() in its markup; every rule is pure in pdp-track.js and every read / write is a
// function in api-pdp.js (saveTrackerGoal / saveTrackerAction / setTrackerGoalLive / setTrackerActionDone).
// PDP-D12 review (N-440): this file renders personal goal and action records, so it is on the PDP-D12 allowlist
// (tests/assert-pdp-access.js); it is loaded only on people.html, never by mobile.html, Newton for Claude or the
// Command Bar. Loads before pdp-my.js; the hosts' globals (_pdpmYes, pdpFmtDay) are used at run time only.
//
// ctx = { personId, year, data, load, redraw }
//   data = { goals, actions, meetings, edit, note }  (edit false = read-only; note = why, optional)
//   load()   -> a fresh data object (the host also keeps its own copy current)
//   redraw() -> the host redraws its page, which calls pdptrHtml() again

let _pdptrState = { ctx: null, data: null, form: null, busy: false, dirty: false };

const _PDPTR_RAG_CLASS = { Red: 'dh-badge-danger', Amber: 'dh-badge-warn', Green: 'dh-badge-success' };
const _PDPTR_LEVEL_TEXT = { Annual: 'Annual', H2: 'Second half', Quarterly: 'Quarter' };

function pdptrSync(ctx) {
  const s = _pdptrState;
  const same = !!s.ctx && String(s.ctx.personId) === String(ctx.personId) && Number(s.ctx.year) === Number(ctx.year);
  s.ctx = ctx;
  s.data = ctx.data;
  if (!same) { s.form = null; s.dirty = false; s.busy = false; }
}

function pdptrIsDirty() { return _pdptrState.dirty; }

function pdptrReset() { _pdptrState = { ctx: null, data: null, form: null, busy: false, dirty: false }; }

function _pdptrMeetings(d) { return new Map((d.meetings || []).map(m => [String(m.id), m])); }

function _pdptrRagPill(rag, label) {
  return rag ? `<span class="dh-badge ${_PDPTR_RAG_CLASS[rag] || ''}">${escHtml(label ? label + ' ' + rag : rag)}</span>` : '';
}

function _pdptrOptions(list, current, blank) {
  return (blank ? `<option value="">${escHtml(blank)}</option>` : '') +
    list.map(v => `<option value="${escAttr(v)}"${v === current ? ' selected' : ''}>${escHtml(v)}</option>`).join('');
}

function _pdptrGoalHtml(n, edit) {
  const g = n.goal;
  const meta = [g.Category, pdpGoalPeriodFix(g) || g.Period, g.TargetDate ? 'by ' + pdpFmtDay(spDateIn(g.TargetDate)) : ''].filter(Boolean).map(escHtml).join(' · ');
  const rolled = n.children.length && n.rag.rolled && n.rag.rolled !== n.rag.own ? _pdptrRagPill(n.rag.rolled, 'Rolled up') : '';
  const controls = edit
    ? `<select class="pdptr-rag" aria-label="RAG for ${escAttr(g.Title)}"${actOn('change', 'pdptrRag', g.id, ACT_VALUE)}>${_pdptrOptions(CONFIG.PDP.RAG, g.Rag || '', 'No RAG')}</select>
       <select class="pdptr-status" aria-label="Status of ${escAttr(g.Title)}"${actOn('change', 'pdptrStatus', g.id, ACT_VALUE)}>${_pdptrOptions(CONFIG.PDP.GOAL_STATUS, g.Status || 'Open')}</select>
       <button type="button" class="pdpt-link"${act('pdptrGoalForm', g.id)}>Edit</button>`
    : `${_pdptrRagPill(g.Rag) || '<span class="ppl-muted-small">No RAG</span>'} <span class="ppl-muted-small">${escHtml(g.Status || 'Open')}</span>`;
  const kids = n.children.length ? `<ul class="pdptr-tree">${n.children.map(c => _pdptrGoalHtml(c, edit)).join('')}</ul>` : '';
  return `<li class="pdptr-node">
    <div class="pdptr-goal">
      <span class="dh-badge">${escHtml(_PDPTR_LEVEL_TEXT[g.GoalLevel] || g.GoalLevel)}</span>
      <strong class="pdptr-title">${escHtml(g.Title)}</strong>
      ${n.overdue ? '<span class="dh-badge dh-badge-danger">Overdue</span>' : ''}${rolled}
      <span class="pdptr-controls">${controls}</span>
    </div>
    <div class="ppl-muted-small pdptr-meta">${meta}${n.lock === 'agreed' ? ' · agreed in a signed meeting' : ''}</div>
    ${kids}
  </li>`;
}

function _pdptrActionHtml(x, goals, edit) {
  const a = x.action;
  const goal = a.GoalID ? goals.find(g => String(g.id) === String(a.GoalID)) : null;
  const box = edit ? `<input type="checkbox" aria-label="Done: ${escAttr(a.Title)}"${x.done ? ' checked' : ''}${actOn('change', 'pdptrDone', a.id, ACT_CHECKED)}> ` : (x.done ? 'Done · ' : '');
  return `<li class="pdptr-action">${box}<span class="pdptr-title">${escHtml(a.Title)}</span>
    <span class="ppl-muted-small"> · ${escHtml(a.OwnerRole || '')}${a.DueDate ? ' · due ' + escHtml(pdpFmtDay(spDateIn(a.DueDate))) : ''}${goal ? ' · for ' + escHtml(goal.Title) : ''}</span>
    ${x.overdue ? ' <span class="dh-badge dh-badge-danger">Overdue</span>' : (x.dueSoon ? ' <span class="dh-badge dh-badge-warn">Due soon</span>' : '')}
    ${edit ? ` <button type="button" class="pdpt-link"${act('pdptrActionForm', a.id)}>Edit</button>` : ''}</li>`;
}

function _pdptrFv(form, name) { return (form && form.values && form.values[name]) || ''; }

function _pdptrGoalFormHtml(form, d, year) {
  const v = n => _pdptrFv(form, n);
  const locked = form.lock === 'agreed';
  const yearGoals = (d.goals || []).filter(g => Number(g.CycleYear) === Number(year) && String(g.id) !== String(form.id));
  const level = form.id ? form.level : (v('GoalLevel') || 'Annual');
  let period = form.id ? form.period : '';
  if (!form.id) { try { period = pdpGoalPeriod(level, year, null, v('Quarter')); } catch (e) { period = ''; } }
  const parents = level === 'Annual' ? [] : pdpGoalParentOptions(level, period, yearGoals);
  const parentOpts = '<option value="">No parent</option>' + parents.map(g => `<option value="${escAttr(g.id)}"${String(g.id) === String(v('ParentGoalID')) ? ' selected' : ''}>${escHtml((_PDPTR_LEVEL_TEXT[g.GoalLevel] || g.GoalLevel) + ': ' + g.Title)}</option>`).join('');
  const lockedParent = locked && !!Number(form.lockedParent);
  const text = (id, label, name, rows) => locked
    ? `<div class="form-group"><label>${escHtml(label)}</label><div class="pdpm-text">${escHtml(v(name)) || '—'}</div></div>`
    : (rows ? `<div class="form-group"><label for="${id}">${escHtml(label)}</label><textarea id="${id}" data-tf="${name}" rows="2">${escHtml(v(name))}</textarea></div>`
            : `<div class="form-group"><label for="${id}">${escHtml(label)}</label><input type="text" id="${id}" data-tf="${name}" maxlength="250" value="${escAttr(v(name))}"></div>`);
  const levelRow = form.id
    ? `<div class="form-group"><label>Level</label><div class="pdpm-text">${escHtml(_PDPTR_LEVEL_TEXT[level] || level)}${period ? ' · ' + escHtml(period) : ''}</div></div>`
    : `<div class="form-group"><label for="pdptr-g-level">Level</label><select id="pdptr-g-level"${actOn('change', 'pdptrFormLevel', ACT_VALUE)}>${CONFIG.PDP.GOAL_LEVELS.map(l => `<option value="${escAttr(l)}"${l === level ? ' selected' : ''}>${escHtml(_PDPTR_LEVEL_TEXT[l] || l)}</option>`).join('')}</select></div>`
      + (level === 'Quarterly' ? `<div class="form-group"><label for="pdptr-g-q">Quarter</label><select id="pdptr-g-q"${actOn('change', 'pdptrFormQuarter', ACT_VALUE)}><option value="">Pick…</option>${[1, 2, 3, 4].map(q => `<option value="${q}"${String(q) === String(v('Quarter')) ? ' selected' : ''}>Q${q}</option>`).join('')}</select></div>` : '');
  const cats = locked
    ? `<div class="form-group"><label>Category</label><div class="pdpm-text">${escHtml(v('Category')) || '—'}</div></div>`
    : `<div class="form-group"><label for="pdptr-g-cat">Category</label><select id="pdptr-g-cat" data-tf="Category">${_pdptrOptions(CONFIG.PDP.GOAL_CATEGORIES, v('Category'), 'Pick…')}</select></div>`;
  const date = locked
    ? `<div class="form-group"><label>Target date</label><div class="pdpm-text">${v('TargetDate') ? escHtml(pdpFmtDay(v('TargetDate'))) : '—'}</div></div>`
    : `<div class="form-group"><label for="pdptr-g-date">Target date</label><input type="date" id="pdptr-g-date" data-tf="TargetDate" value="${escAttr(v('TargetDate'))}"></div>`;
  return `<div class="pdpt-form pdptr-form"${actOn('input', 'pdptrDirty')}${actOn('change', 'pdptrDirty')}>
    <div class="ppl-card-title">${form.id ? 'Edit goal' : 'Add goal'}</div>
    ${locked ? '<p class="ppl-muted-note">Agreed in a signed meeting: the wording is locked. You can still change RAG and status on the goal, and link it to a parent.</p>' : ''}
    ${levelRow}
    ${level === 'Annual' ? '' : `<div class="form-group"><label for="pdptr-g-parent">Sits under</label><select id="pdptr-g-parent" data-tf="ParentGoalID"${lockedParent ? ' disabled' : ''}>${parentOpts}</select></div>`}
    ${text('pdptr-g-title', 'Goal', 'Title', false)}
    ${cats}
    ${text('pdptr-g-why', 'Why it matters', 'WhyItMatters', true)}
    ${text('pdptr-g-measures', 'Success measures', 'SuccessMeasures', true)}
    ${date}
    ${text('pdptr-g-support', 'Support needed', 'Support', true)}
    <div class="pdpm-actions"><button type="button" class="btn-primary"${act('pdptrGoalSave')}>Save goal</button><button type="button" class="btn-secondary"${act('pdptrFormCancel')}>Cancel</button></div>
  </div>`;
}

function _pdptrActionFormHtml(form, d, year) {
  const v = n => _pdptrFv(form, n);
  const locked = form.lock === 'agreed';
  const goals = (d.goals || []).filter(g => Number(g.CycleYear) === Number(year) && (g.Status || 'Open') === 'Open');
  const goalOpts = '<option value="">Not linked to a goal</option>' + goals.map(g => `<option value="${escAttr(g.id)}"${String(g.id) === String(v('GoalID')) ? ' selected' : ''}>${escHtml(g.Title)}</option>`).join('');
  const body = locked
    ? `<p class="ppl-muted-note">Agreed in a signed meeting: you can tick it done, but not change it.</p>`
    : `<div class="form-group"><label for="pdptr-a-title">Action</label><input type="text" id="pdptr-a-title" data-tf="Title" maxlength="250" value="${escAttr(v('Title'))}"></div>
       <div class="form-group"><label for="pdptr-a-owner">Owner</label><select id="pdptr-a-owner" data-tf="OwnerRole">${_pdptrOptions(CONFIG.PDP.OWNER_ROLES, v('OwnerRole') || 'Employee')}</select></div>
       <div class="form-group"><label for="pdptr-a-due">Due date</label><input type="date" id="pdptr-a-due" data-tf="DueDate" value="${escAttr(v('DueDate'))}"></div>
       <div class="form-group"><label for="pdptr-a-goal">Goal</label><select id="pdptr-a-goal" data-tf="GoalID">${goalOpts}</select></div>`;
  return `<div class="pdpt-form pdptr-form"${actOn('input', 'pdptrDirty')}${actOn('change', 'pdptrDirty')}>
    <div class="ppl-card-title">${form.id ? 'Edit action' : 'Add action'}</div>${body}
    <div class="pdpm-actions">${locked ? '' : `<button type="button" class="btn-primary"${act('pdptrActionSave')}>Save action</button>`}<button type="button" class="btn-secondary"${act('pdptrFormCancel')}>${locked ? 'Close' : 'Cancel'}</button></div>
  </div>`;
}

// The tracker markup for the current context ('' before the first pdptrSync).
function pdptrHtml() {
  const s = _pdptrState;
  if (!s.ctx || !s.data) return '';
  const d = s.data, year = s.ctx.year, edit = !!d.edit;
  const model = pdpTrackerModel(d.goals, d.actions, d.meetings, new Date(), year);
  const c = model.counts, f = s.form;
  const note = edit ? '' : `<p class="ppl-muted-note pdptr-note">${escHtml(d.note || 'Read-only: only the person, their line manager and their CSD can change goals and actions.')}</p>`;
  const chips = `<div class="pdpm-chips">
    <span class="dh-badge">${c.open} open goals</span>
    <span class="dh-badge dh-badge-danger">${c.red} red</span><span class="dh-badge dh-badge-warn">${c.amber} amber</span><span class="dh-badge dh-badge-success">${c.green} green</span>
    <span class="dh-badge">${c.actionsOpen} open actions</span>
    ${c.actionsOverdue ? `<span class="dh-badge dh-badge-danger">${c.actionsOverdue} overdue</span>` : ''}
    ${c.goalsOverdue ? `<span class="dh-badge dh-badge-danger">${c.goalsOverdue} goals past target</span>` : ''}</div>`;
  const goalForm = f && f.kind === 'goal' ? _pdptrGoalFormHtml(f, d, year) : '';
  const actionForm = f && f.kind === 'action' ? _pdptrActionFormHtml(f, d, year) : '';
  const hasGoals = model.tree.length || model.orphans.length;
  const tree = hasGoals
    ? `<ul class="pdptr-tree pdptr-root-list">${model.tree.map(n => _pdptrGoalHtml(n, edit)).join('')}</ul>
       ${model.orphans.length ? `<div class="pdpm-label pdptr-sub">Not linked to an annual goal</div><ul class="pdptr-tree pdptr-root-list">${model.orphans.map(n => _pdptrGoalHtml(n, edit)).join('')}</ul>` : ''}`
    : emptyStateBlock({ icon: 'flag', title: 'No goals for ' + year, message: edit ? 'Add a goal, or record one in a meeting.' : 'No goals have been recorded for this year yet.' });
  const goals = (d.goals || []).filter(g => Number(g.CycleYear) === Number(year));
  const open = model.actionsOpen.length ? `<ul class="pdptr-actions">${model.actionsOpen.map(x => _pdptrActionHtml(x, goals, edit)).join('')}</ul>` : '<div class="ppl-muted-small">No open actions.</div>';
  const done = model.actionsDone.length ? `<div class="pdpm-label pdptr-sub">Done in ${escHtml(year)}</div><ul class="pdptr-actions">${model.actionsDone.map(x => _pdptrActionHtml(x, goals, edit)).join('')}</ul>` : '';
  return `<div id="pdptr-root">${note}${chips}
    <div class="ppl-card pdptr-card"><div class="ppl-card-title">Goals</div>${tree}${goalForm}${edit && !f ? `<button type="button" class="btn-secondary pdpt-add"${act('pdptrGoalForm', 0)}>Add goal</button>` : ''}</div>
    <div class="ppl-card pdptr-card"><div class="ppl-card-title">Actions</div>${open}${done}${actionForm}${edit && !f ? `<button type="button" class="btn-secondary pdpt-add"${act('pdptrActionForm', 0)}>Add action</button>` : ''}</div>
  </div>`;
}

// ── actions ──────────────────────────────────────────────────────────────────────────────────────
function _pdptrStash() {
  const s = _pdptrState, root = document.getElementById('pdptr-root');
  if (!root || !s.form) return;
  root.querySelectorAll('[data-tf]').forEach(el => { s.form.values[el.getAttribute('data-tf')] = el.value; });
}

function pdptrDirty() { _pdptrState.dirty = true; _pdptrStash(); }

// Runs one write, reloads the data, redraws. onOk runs before the redraw when the write worked.
async function _pdptrRun(fn, okText, onOk) {
  const s = _pdptrState;
  if (s.busy || !s.ctx) return false;
  s.busy = true;
  let ok = false;
  try {
    await fn();
    if (okText) toast(okText, { type: 'success' });
    s.data = await s.ctx.load();
    ok = true;
    if (onOk) onOk();
  } catch (e) {
    console.error('Goals & actions: write failed', e);
    toast(e.message, { type: 'error' });
  }
  s.busy = false;
  if (s.ctx) s.ctx.redraw();
  return ok;
}

function _pdptrFormFor(kind, id) {
  const s = _pdptrState, d = s.data, values = {};
  const byMeeting = _pdptrMeetings(d);
  const form = { kind, id: id || null, values, lock: 'open' };
  if (!id) { if (kind === 'goal') values.GoalLevel = 'Annual'; return form; }
  const it = (kind === 'goal' ? d.goals : d.actions).find(x => String(x.id) === String(id));
  if (!it) return { kind, id: null, values, lock: 'open' };
  form.lock = pdpGoalFieldLock(it, byMeeting);
  if (kind === 'goal') {
    ['Title', 'Category', 'WhyItMatters', 'SuccessMeasures', 'Support'].forEach(k => { if (it[k]) values[k] = it[k]; });
    if (it.TargetDate) values.TargetDate = spDateIn(it.TargetDate);
    if (Number(it.ParentGoalID)) values.ParentGoalID = String(it.ParentGoalID);
    form.level = it.GoalLevel; form.period = pdpGoalPeriodFix(it) || it.Period || '';
    form.lockedParent = Number(it.ParentGoalID) || 0;
  } else {
    ['Title', 'OwnerRole'].forEach(k => { if (it[k]) values[k] = it[k]; });
    if (it.DueDate) values.DueDate = spDateIn(it.DueDate);
    if (Number(it.GoalID)) values.GoalID = String(it.GoalID);
  }
  return form;
}

function pdptrGoalForm(id)   { _pdptrStash(); _pdptrState.form = _pdptrFormFor('goal', id);   _pdptrState.dirty = false; _pdptrState.ctx.redraw(); }
function pdptrActionForm(id) { _pdptrStash(); _pdptrState.form = _pdptrFormFor('action', id); _pdptrState.dirty = false; _pdptrState.ctx.redraw(); }
function pdptrFormCancel()   { _pdptrState.form = null; _pdptrState.dirty = false; _pdptrState.ctx.redraw(); }

function _pdptrReform(name, value) {
  const s = _pdptrState;
  _pdptrStash();
  if (!s.form) return;
  s.form.values[name] = value;
  s.form.values.ParentGoalID = '';
  if (name === 'GoalLevel') s.form.values.Quarter = '';
  s.dirty = true;
  s.ctx.redraw();
}
function pdptrFormLevel(value)   { _pdptrReform('GoalLevel', value); }
function pdptrFormQuarter(value) { _pdptrReform('Quarter', value); }

async function pdptrGoalSave() {
  const s = _pdptrState;
  _pdptrStash();
  const f = s.form;
  if (!f || f.kind !== 'goal') return;
  await _pdptrRun(() => saveTrackerGoal(s.ctx.personId, s.ctx.year, Object.assign({}, f.values, f.id ? { id: f.id } : {})), 'Goal saved.', () => { s.form = null; s.dirty = false; });
}

async function pdptrActionSave() {
  const s = _pdptrState;
  _pdptrStash();
  const f = s.form;
  if (!f || f.kind !== 'action') return;
  await _pdptrRun(() => saveTrackerAction(s.ctx.personId, s.ctx.year, Object.assign({ OwnerRole: 'Employee' }, f.values, f.id ? { id: f.id } : {})), 'Action saved.', () => { s.form = null; s.dirty = false; });
}

async function pdptrRag(id, value) {
  const s = _pdptrState;
  await _pdptrRun(() => setTrackerGoalLive(s.ctx.personId, s.ctx.year, id, { Rag: value }), 'RAG updated.');
}

async function pdptrStatus(id, value) {
  const s = _pdptrState;
  await _pdptrRun(() => setTrackerGoalLive(s.ctx.personId, s.ctx.year, id, { Status: value }), 'Status updated.');
}

async function pdptrDone(id, checked) {
  const s = _pdptrState;
  await _pdptrRun(() => setTrackerActionDone(s.ctx.personId, s.ctx.year, id, !!checked), '');
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  pdptrDirty,
  pdptrGoalForm,
  pdptrActionForm,
  pdptrFormCancel,
  pdptrFormLevel,
  pdptrFormQuarter,
  pdptrGoalSave,
  pdptrActionSave,
  pdptrRag,
  pdptrStatus,
  pdptrDone,
});