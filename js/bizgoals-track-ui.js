// js/bizgoals-track-ui.js — Command Centre "Goals & Actions" page (N-533 / BG-2)
//
// Loads on command-centre.html only, after cc-pages.js and before cc-claude.js. Markup + handlers only: every rule is pure
// in bizgoals-track.js / bizgoals-data.js and every read / write is a function in api-bizgoals.js (getBusinessGoalsData,
// saveTrackerBusinessGoal, saveTrackerBusinessAction, setBusinessGoalLive, setBusinessActionDone, addBusinessGoalUpdate,
// deleteBusinessGoal, deleteBusinessAction, bizgoalsRolloverPreview, rolloverBusinessGoals). Admin + Leadership edit
// everything (BG-D4); Delete shows for bizgoalsDelete (Admin) only and the API enforces it.
// BG-D9: the structure copies pdp-track-ui.js (pdptrHtml, _pdptrRun, _pdptrFormFor); PDP untouched. Classes are .bgtr-*
// in css/command-centre.css (people.css is not loaded on this shell).

let _bgtrState = { year: null, data: null, form: null, busy: false, dirty: false, history: {}, rollover: null, canDelete: false, me: '' };

const _BGTR_RAG_CLASS = { Red: 'dh-badge-danger', Amber: 'dh-badge-warn', Green: 'dh-badge-success' };
const _BGTR_LEVEL_TEXT = { Annual: 'Annual', H2: 'Second half', Quarterly: 'Quarter' };
const _BGTR_LATEST_MAX = 200;

function bgtrIsDirty() { return _bgtrState.dirty; }

function bgtrReset() {
  const s = _bgtrState;
  s.form = null; s.dirty = false; s.busy = false; s.history = {}; s.rollover = null;
}

// Leaving the page (navigateToCC): asks before an unsaved form is thrown away. -> true to go on.
async function bgtrConfirmLeave() {
  if (!_bgtrState.dirty) return true;
  const ok = await confirmModal({ title: 'Discard changes?', message: 'You have an unsaved goal, action or update. Leaving discards it.', confirmLabel: 'Discard' });
  if (ok) bgtrReset();
  return ok;
}

function _bgtrDayText(day) { return day ? (formatLongDay(day) || day) : ''; }
function _bgtrRagPill(rag, label) {
  return rag ? `<span class="dh-badge ${_BGTR_RAG_CLASS[rag] || ''}">${escHtml(label ? label + ' ' + rag : rag)}</span>` : '';
}
function _bgtrOptions(list, current, blank) {
  return (blank ? `<option value="">${escHtml(blank)}</option>` : '') +
    list.map(v => `<option value="${escAttr(v)}"${v === current ? ' selected' : ''}>${escHtml(v)}</option>`).join('');
}
function _bgtrName(email, candidates) {
  const e = String(email || '').toLowerCase(), hit = (candidates || []).find(c => c.email === e);
  return hit ? hit.name : e;
}
function _bgtrOwnerHtml(owner) {
  if (!owner || !owner.email) return '<span class="bgtr-muted">No owner</span>';
  return `<span class="bgtr-owner">${escHtml(owner.name)}</span>${owner.state === 'stale' ? ' <span class="bgtr-muted">(no longer Admin / Leadership)</span>' : ''}`;
}

// Owner select: the candidates, plus a stale current owner kept as the selected value (so saving never blanks them).
function _bgtrOwnerSelect(id, current, candidates, staleName) {
  const cur = String(current || '').toLowerCase();
  const list = (candidates || []).slice();
  const stale = cur && !list.some(c => c.email === cur) ? `<option value="${escAttr(cur)}" selected>${escHtml((staleName || cur) + ' (no longer Admin / Leadership)')}</option>` : '';
  return `<select id="${id}" data-tf="OwnerEmail"><option value="">Pick…</option>${stale}${list.map(c => `<option value="${escAttr(c.email)}"${c.email === cur ? ' selected' : ''}>${escHtml(c.name)}</option>`).join('')}</select>`;
}

function _bgtrFv(form, name) { return (form && form.values && form.values[name]) || ''; }

// ── markup ────────────────────────────────────────────────────────────────────────────────────────────────────
function _bgtrChipsHtml(c) {
  return `<div class="bgtr-chips">
    <span class="dh-badge">${c.open} open goals</span>
    <span class="dh-badge dh-badge-danger">${c.red} red</span><span class="dh-badge dh-badge-warn">${c.amber} amber</span><span class="dh-badge dh-badge-success">${c.green} green</span>
    <span class="dh-badge">${c.actionsOpen} open actions</span>
    ${c.actionsOverdue ? `<span class="dh-badge dh-badge-danger">${c.actionsOverdue} overdue</span>` : ''}
    ${c.goalsOverdue ? `<span class="dh-badge dh-badge-danger">${c.goalsOverdue} goals past target</span>` : ''}
    ${c.carried ? `<span class="dh-badge">${c.carried} carried forward</span>` : ''}</div>`;
}

function _bgtrHeadHtml(s, model) {
  const years = bizgoalsYearOptions(s.data.goals, new Date());
  if (!years.includes(Number(s.year))) years.push(Number(s.year));
  return `<div class="bgtr-head">
    <label class="bgtr-year">Year <select aria-label="Year"${actOn('change', 'bgtrYear', ACT_VALUE)}>${years.sort((a, b) => b - a).map(y => `<option value="${y}"${y === Number(s.year) ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
    <div class="bgtr-btns">
      <button type="button" class="btn-secondary"${act('bgtrGoalForm', 0)}>Add goal</button>
      <button type="button" class="btn-secondary"${act('bgtrActionForm', 0)}>Add action</button>
      ${model.counts.canCarry ? `<button type="button" class="btn-secondary"${act('bgtrRollover')}>Roll over year</button>` : ''}
    </div>
  </div>`;
}

function _bgtrGoalControls(n, s) {
  const g = n.goal, B = CONFIG.BIZGOALS;
  const carried = g.Status === B.CARRIED;
  const del = s.canDelete ? ` <button type="button" class="bgtr-link bgtr-danger"${act('bgtrDeleteGoal', g.id)}>Delete</button>` : '';
  const hist = ` <button type="button" class="bgtr-link"${act('bgtrHistory', g.id)}>History (${n.historyCount})</button>`;
  if (carried && n.copyId) {
    return `${_bgtrRagPill(g.Rag)} <button type="button" class="bgtr-link"${act('bgtrYear', String(n.carriedTo))}>Carried forward to ${escHtml(n.carriedTo)}</button>${hist}${del}`;
  }
  const statuses = carried ? [B.CARRIED].concat(B.PICKABLE_STATUS) : B.PICKABLE_STATUS;
  return `<select class="bgtr-rag" aria-label="RAG for ${escAttr(g.Title)}"${actOn('change', 'bgtrRag', g.id, ACT_VALUE)}>${_bgtrOptions(B.RAG, g.Rag || '', 'No RAG')}</select>
    <select class="bgtr-status" aria-label="Status of ${escAttr(g.Title)}"${actOn('change', 'bgtrStatus', g.id, ACT_VALUE)}>${_bgtrOptions(statuses, g.Status || 'Open')}</select>
    ${carried ? '' : `<button type="button" class="bgtr-link"${act('bgtrGoalForm', g.id)}>Edit</button>`}
    ${carried ? '' : ` <button type="button" class="bgtr-link"${act('bgtrUpdateForm', g.id)}>Post update</button>`}${hist}
    ${n.canCarry ? ` <button type="button" class="bgtr-link"${act('bgtrCarry', g.id)}>Carry forward</button>` : ''}${del}`;
}

function _bgtrLatestHtml(n, s) {
  const u = n.latest;
  if (!u) return '';
  const text = String(u.UpdateText || ''), cut = text.length > _BGTR_LATEST_MAX ? text.slice(0, _BGTR_LATEST_MAX) + '…' : text;
  return `<div class="bgtr-latest"><span class="bgtr-label">Latest update</span> ${escHtml(cut)} <span class="bgtr-muted">— ${escHtml(u.AuthorName || _bgtrName(u.AuthorEmail, s.data.candidates))}, ${escHtml(_bgtrDayText(bizgoalsInstantDay(u.Created)))}</span></div>`;
}

function _bgtrHistoryHtml(goalId, s) {
  const rows = bizgoalsGoalHistory(goalId, s.data.goals, s.data.updates);
  if (!rows.length) return '<div class="bgtr-history bgtr-muted">No updates yet.</div>';
  return `<ul class="bgtr-history">${rows.map(r => {
    const u = r.entry, at = [u.RagAtUpdate, u.StatusAtUpdate].filter(Boolean).join(' · ');
    return `<li class="bgtr-history-row"><span class="bgtr-muted">${escHtml(_bgtrDayText(bizgoalsInstantDay(u.Created)))} · ${escHtml(u.AuthorName || _bgtrName(u.AuthorEmail, s.data.candidates))}${at ? ' · ' + escHtml(at) : ''}${r.own ? '' : ' · (' + escHtml(r.year) + ')'}</span>
      <div class="bgtr-text">${escHtml(u.UpdateText)}</div></li>`;
  }).join('')}</ul>`;
}

function _bgtrUpdateFormHtml(form) {
  return `<div class="bgtr-form"${actOn('input', 'bgtrDirty')}>
    <div class="form-group"><label for="bgtr-u-text">Update</label><textarea id="bgtr-u-text" data-tf="UpdateText" rows="3" maxlength="${escAttr(CONFIG.BIZGOALS.LIMITS.UPDATE_MAX)}">${escHtml(_bgtrFv(form, 'UpdateText'))}</textarea></div>
    <div class="bgtr-btns"><button type="button" class="btn-primary"${act('bgtrUpdateSave')}>Save update</button><button type="button" class="btn-secondary"${act('bgtrFormCancel')}>Cancel</button></div>
  </div>`;
}

function _bgtrGoalHtml(n, s) {
  const g = n.goal, f = s.form;
  const changed = g.ChangedByEmail ? 'Changed by ' + _bgtrName(g.ChangedByEmail, s.data.candidates) + (g.Modified ? ' · ' + _bgtrDayText(bizgoalsInstantDay(g.Modified)) : '') : '';
  const meta = [g.Period, g.TargetDate ? 'by ' + _bgtrDayText(spDateIn(g.TargetDate)) : '', changed].filter(Boolean).map(escHtml).join(' · ');
  const rolled = n.children.length && n.rag.rolled && n.rag.rolled !== n.rag.own ? _bgtrRagPill(n.rag.rolled, 'Rolled up') : '';
  const updateForm = f && f.kind === 'update' && String(f.goalId) === String(g.id) ? _bgtrUpdateFormHtml(f) : '';
  const history = s.history[String(g.id)] ? _bgtrHistoryHtml(g.id, s) : '';
  const kids = n.children.length ? `<ul class="bgtr-tree">${n.children.map(c => _bgtrGoalHtml(c, s)).join('')}</ul>` : '';
  return `<li class="bgtr-node">
    <div class="bgtr-goal">
      <span class="dh-badge">${escHtml(_BGTR_LEVEL_TEXT[g.GoalLevel] || g.GoalLevel)}</span>
      <strong class="bgtr-title">${escHtml(g.Title)}</strong>
      ${n.overdue ? '<span class="dh-badge dh-badge-danger">Overdue</span>' : ''}${rolled}
      ${_bgtrOwnerHtml(n.owner)}
      <span class="bgtr-controls">${_bgtrGoalControls(n, s)}</span>
    </div>
    <div class="bgtr-muted bgtr-meta">${meta}</div>
    ${_bgtrLatestHtml(n, s)}${updateForm}${history}
    ${kids}
  </li>`;
}

function _bgtrGoalFormHtml(form, s) {
  const v = n => _bgtrFv(form, n), year = Number(s.year);
  const goals = s.data.goals.filter(g => String(g.id) !== String(form.id));
  const level = form.id ? form.level : (v('GoalLevel') || 'Annual');
  let period = form.id ? form.period : '';
  if (!form.id) { try { period = bizgoalsGoalPeriod(level, year, v('Quarter')); } catch (e) { period = ''; } }
  const parents = level === 'Annual' || !period ? [] : bizgoalsParentOptions(level, period, goals);
  const parentOpts = '<option value="">No parent</option>' + parents.map(g => `<option value="${escAttr(g.id)}"${String(g.id) === String(v('ParentGoalID')) ? ' selected' : ''}>${escHtml((_BGTR_LEVEL_TEXT[g.GoalLevel] || g.GoalLevel) + ': ' + g.Title)}</option>`).join('');
  const L = CONFIG.BIZGOALS.LIMITS;
  const levelRow = form.id
    ? `<div class="form-group"><label>Level</label><div class="bgtr-text">${escHtml(_BGTR_LEVEL_TEXT[level] || level)}${period ? ' · ' + escHtml(period) : ''}</div></div>`
    : `<div class="form-group"><label for="bgtr-g-level">Level</label><select id="bgtr-g-level"${actOn('change', 'bgtrFormLevel', ACT_VALUE)}>${CONFIG.BIZGOALS.GOAL_LEVELS.map(l => `<option value="${escAttr(l)}"${l === level ? ' selected' : ''}>${escHtml(_BGTR_LEVEL_TEXT[l] || l)}</option>`).join('')}</select></div>`
      + (level === 'Quarterly' ? `<div class="form-group"><label for="bgtr-g-q">Quarter</label><select id="bgtr-g-q"${actOn('change', 'bgtrFormQuarter', ACT_VALUE)}><option value="">Pick…</option>${[1, 2, 3, 4].map(q => `<option value="${q}"${String(q) === String(v('Quarter')) ? ' selected' : ''}>Q${q}</option>`).join('')}</select></div>` : '');
  return `<div class="bgtr-form"${actOn('input', 'bgtrDirty')}${actOn('change', 'bgtrDirty')}>
    <div class="bgtr-card-title">${form.id ? 'Edit goal' : 'Add goal for ' + escHtml(year)}</div>
    ${levelRow}
    ${level === 'Annual' ? '' : `<div class="form-group"><label for="bgtr-g-parent">Sits under</label><select id="bgtr-g-parent" data-tf="ParentGoalID">${parentOpts}</select></div>`}
    <div class="form-group"><label for="bgtr-g-title">Goal</label><input type="text" id="bgtr-g-title" data-tf="Title" maxlength="${escAttr(L.TITLE_MAX)}" value="${escAttr(v('Title'))}"></div>
    <div class="form-group"><label for="bgtr-g-owner">Owner</label>${_bgtrOwnerSelect('bgtr-g-owner', v('OwnerEmail'), s.data.candidates, form.ownerName)}</div>
    <div class="form-group"><label for="bgtr-g-why">Why it matters</label><textarea id="bgtr-g-why" data-tf="WhyItMatters" rows="2" maxlength="${escAttr(L.TEXT_MAX)}">${escHtml(v('WhyItMatters'))}</textarea></div>
    <div class="form-group"><label for="bgtr-g-measures">Success measures</label><textarea id="bgtr-g-measures" data-tf="SuccessMeasures" rows="2" maxlength="${escAttr(L.TEXT_MAX)}">${escHtml(v('SuccessMeasures'))}</textarea></div>
    <div class="form-group"><label for="bgtr-g-date">Target date</label><input type="date" id="bgtr-g-date" data-tf="TargetDate" value="${escAttr(v('TargetDate'))}"></div>
    <div class="bgtr-btns"><button type="button" class="btn-primary"${act('bgtrGoalSave')}>Save goal</button><button type="button" class="btn-secondary"${act('bgtrFormCancel')}>Cancel</button></div>
  </div>`;
}

function _bgtrActionHtml(x, s) {
  const a = x.action;
  const del = s.canDelete ? ` <button type="button" class="bgtr-link bgtr-danger"${act('bgtrDeleteAction', a.id)}>Delete</button>` : '';
  return `<li class="bgtr-action"><input type="checkbox" aria-label="Done: ${escAttr(a.Title)}"${x.done ? ' checked' : ''}${actOn('change', 'bgtrDone', a.id, ACT_CHECKED)}> <span class="bgtr-title">${escHtml(a.Title)}</span>
    <span class="bgtr-muted"> · ${escHtml(x.owner.name || 'No owner')}${x.owner.state === 'stale' ? ' (no longer Admin / Leadership)' : ''}${a.DueDate ? ' · due ' + escHtml(_bgtrDayText(spDateIn(a.DueDate))) : ''}${x.goalTitle ? ' · for ' + escHtml(x.goalTitle) : ''}</span>
    ${x.overdue ? ' <span class="dh-badge dh-badge-danger">Overdue</span>' : (x.dueSoon ? ' <span class="dh-badge dh-badge-warn">Due soon</span>' : '')}
    <button type="button" class="bgtr-link"${act('bgtrActionForm', a.id)}>Edit</button>${del}</li>`;
}

function _bgtrActionFormHtml(form, s) {
  const v = n => _bgtrFv(form, n), year = Number(s.year);
  const goals = s.data.goals.filter(g => Number(g.GoalYear) === year && ((g.Status || 'Open') === 'Open' || String(g.id) === String(v('GoalID'))));
  const goalOpts = '<option value="">Pick…</option>' + goals.map(g => `<option value="${escAttr(g.id)}"${String(g.id) === String(v('GoalID')) ? ' selected' : ''}>${escHtml((_BGTR_LEVEL_TEXT[g.GoalLevel] || g.GoalLevel) + ': ' + g.Title)}</option>`).join('');
  return `<div class="bgtr-form"${actOn('input', 'bgtrDirty')}${actOn('change', 'bgtrDirty')}>
    <div class="bgtr-card-title">${form.id ? 'Edit action' : 'Add action'}</div>
    <div class="form-group"><label for="bgtr-a-title">Action</label><input type="text" id="bgtr-a-title" data-tf="Title" maxlength="${escAttr(CONFIG.BIZGOALS.LIMITS.TITLE_MAX)}" value="${escAttr(v('Title'))}"></div>
    <div class="form-group"><label for="bgtr-a-goal">Goal</label><select id="bgtr-a-goal" data-tf="GoalID"${actOn('change', 'bgtrActionGoal', ACT_VALUE)}>${goalOpts}</select></div>
    <div class="form-group"><label for="bgtr-a-owner">Owner</label>${_bgtrOwnerSelect('bgtr-a-owner', v('OwnerEmail'), s.data.candidates, form.ownerName)}</div>
    <div class="form-group"><label for="bgtr-a-due">Due date</label><input type="date" id="bgtr-a-due" data-tf="DueDate" value="${escAttr(v('DueDate'))}"></div>
    <div class="bgtr-btns"><button type="button" class="btn-primary"${act('bgtrActionSave')}>Save action</button><button type="button" class="btn-secondary"${act('bgtrFormCancel')}>Cancel</button></div>
  </div>`;
}

// The rollover confirm panel (BG-D17): r = { plan, ticked: Set of goal ids, busy }.
function _bgtrRolloverHtml(r) {
  if (!r) return '';
  if (!r.plan) return `<div class="bgtr-card bgtr-roll">${skeletonPanel(3)}</div>`;
  const p = r.plan;
  const rows = p.items.map(it => `<li class="bgtr-roll-item"><label><input type="checkbox"${r.ticked.has(it.goalId) ? ' checked' : ''}${actOn('change', 'bgtrRollTick', it.goalId, ACT_CHECKED)}> <strong>${escHtml(it.title)}</strong></label>
    <div class="bgtr-muted">${it.copyId ? 'Already copied into ' + escHtml(p.toYear) + ': finishes the carry. ' : ''}${it.closeIds.length} sub-goal${it.closeIds.length === 1 ? '' : 's'} close · ${it.moveActionIds.length} open action${it.moveActionIds.length === 1 ? '' : 's'} move</div>
    ${it.ownerSwap ? '<div class="bgtr-muted bgtr-warn">The owner is no longer Admin / Leadership: you will own the copy.</div>' : ''}</li>`).join('');
  const skipped = p.skipped.length ? `<div class="bgtr-label">Not carried</div><ul class="bgtr-actions">${p.skipped.map(x => `<li class="bgtr-action">${escHtml(x.reason)}</li>`).join('')}</ul>` : '';
  return `<div class="bgtr-card bgtr-roll">
    <div class="bgtr-card-title">Carry forward into ${escHtml(p.toYear)}</div>
    <p class="bgtr-note">Each ticked annual goal is copied into ${escHtml(p.toYear)}. The old goal and its open sub-goals are marked Carried forward, and its open actions move to the copy.</p>
    ${rows ? `<ul class="bgtr-actions">${rows}</ul>` : '<p class="bgtr-note">No open annual goals to carry.</p>'}${skipped}
    <div class="bgtr-btns">${rows ? `<button type="button" class="btn-primary"${act('bgtrRollConfirm')}${r.busy || !r.ticked.size ? ' disabled' : ''}>Carry forward ${r.ticked.size} goal${r.ticked.size === 1 ? '' : 's'}</button>` : ''}<button type="button" class="btn-secondary"${act('bgtrRollCancel')}>Cancel</button></div>
  </div>`;
}

// The page body for the current state (no DOM). s = _bgtrState shape.
function bgtrPageHtml(s) {
  const head = '<div class="page-header"><h2>Goals &amp; Actions</h2></div>';
  const d = s.data;
  if (!d) return head + skeletonPanel(5);
  if (d.denied) return head + emptyStateBlock({ icon: 'flag', title: 'No access to Goals & Actions', message: 'You can’t see the Goals & Actions lists. Ask Chris to check your Newton Admins / Newton Leadership group.' });
  const model = bizgoalsTrackerModel({ goals: d.goals, actions: d.actions, updates: d.updates, candidates: d.candidates, today: new Date(), year: s.year });
  const f = s.form;
  const hasGoals = model.tree.length || model.orphans.length;
  const tree = hasGoals
    ? `<ul class="bgtr-tree bgtr-root-list">${model.tree.map(n => _bgtrGoalHtml(n, s)).join('')}</ul>
       ${model.orphans.length ? `<div class="bgtr-label bgtr-sub">Not linked to an annual goal</div><ul class="bgtr-tree bgtr-root-list">${model.orphans.map(n => _bgtrGoalHtml(n, s)).join('')}</ul>` : ''}`
    : emptyStateBlock({ icon: 'flag', title: 'No goals for ' + s.year, message: 'Add an annual goal to start.' });
  const open = model.actionsOpen.length ? `<ul class="bgtr-actions">${model.actionsOpen.map(x => _bgtrActionHtml(x, s)).join('')}</ul>` : '<div class="bgtr-muted">No open actions.</div>';
  const done = model.actionsDone.length ? `<div class="bgtr-label bgtr-sub">Done</div><ul class="bgtr-actions">${model.actionsDone.map(x => _bgtrActionHtml(x, s)).join('')}</ul>` : '';
  return `${head}<div id="bgtr-root">${_bgtrHeadHtml(s, model)}${_bgtrChipsHtml(model.counts)}${_bgtrRolloverHtml(s.rollover)}
    <div class="bgtr-card"><div class="bgtr-card-title">Goals</div>${f && f.kind === 'goal' ? _bgtrGoalFormHtml(f, s) : ''}${tree}</div>
    <div class="bgtr-card"><div class="bgtr-card-title">Actions</div>${f && f.kind === 'action' ? _bgtrActionFormHtml(f, s) : ''}${open}${done}</div>
  </div>`;
}

// ── page ──────────────────────────────────────────────────────────────────────────────────────────────────────
function _bgtrDraw() {
  const el = document.getElementById('page-content');
  if (el && document.getElementById('bgtr-root')) el.innerHTML = bgtrPageHtml(_bgtrState);
}

async function renderCCGoalsPage(container) {
  const s = _bgtrState;
  if (s.year == null) s.year = Number(localDayISO().slice(0, 4));
  bgtrReset();
  s.data = null;
  container.innerHTML = bgtrPageHtml(s);
  try {
    const user = getCurrentUser();
    s.me = String((user && user.email) || '').toLowerCase();
    const [data, role] = await Promise.all([getBusinessGoalsData(), getEffectiveRole(s.me)]);
    s.data = data;
    s.canDelete = roleCan(role, 'bizgoalsDelete');
  } catch (e) {
    console.error('Goals & Actions: load failed', e);
    container.innerHTML = '<div class="page-header"><h2>Goals &amp; Actions</h2></div>' + emptyStateBlock({ icon: 'flag', title: 'Couldn’t load Goals & Actions', message: e.message || 'Try again.' });
    return;
  }
  container.innerHTML = bgtrPageHtml(s);
}

// ── actions ───────────────────────────────────────────────────────────────────────────────────────────────────
function _bgtrStash() {
  const s = _bgtrState, root = document.getElementById('bgtr-root');
  if (!root || !s.form) return;
  root.querySelectorAll('[data-tf]').forEach(el => { s.form.values[el.getAttribute('data-tf')] = el.value; });
}

function bgtrDirty() { _bgtrState.dirty = true; _bgtrStash(); }

// Runs one write, reloads, redraws. onOk runs before the redraw when the write worked. Copies _pdptrRun.
async function _bgtrRun(fn, okText, onOk) {
  const s = _bgtrState;
  if (s.busy) return false;
  s.busy = true;
  let ok = false;
  try {
    const res = await fn();
    if (okText) toast(typeof okText === 'function' ? okText(res) : okText, { type: 'success' });
    ok = true;
    if (onOk) onOk(res);
  } catch (e) {
    console.error('Goals & Actions: write failed', e);
    toast(e.message, { type: 'error' });
  }
  try { s.data = await getBusinessGoalsData({ fresh: true }); } catch (e) { console.error('Goals & Actions: reload failed', e); }
  s.busy = false;
  _bgtrDraw();
  return ok;
}

function _bgtrFormFor(kind, id) {
  const s = _bgtrState, d = s.data, values = {};
  const form = { kind, id: id || null, values };
  const it = id ? (kind === 'goal' ? d.goals : d.actions).find(x => String(x.id) === String(id)) : null;
  if (!it) {
    form.id = null;
    if (kind === 'goal') { values.GoalLevel = 'Annual'; if (bizgoalsOwnerState(s.me, d.candidates) === 'ok') values.OwnerEmail = s.me; }
    return form;
  }
  ['Title', 'WhyItMatters', 'SuccessMeasures', 'OwnerEmail'].forEach(k => { if (it[k]) values[k] = String(it[k]); });
  form.ownerName = it.OwnerName || '';
  if (kind === 'goal') {
    if (it.TargetDate) values.TargetDate = spDateIn(it.TargetDate);
    if (Number(it.ParentGoalID)) values.ParentGoalID = String(it.ParentGoalID);
    form.level = it.GoalLevel; form.period = it.Period || '';
  } else {
    if (it.DueDate) values.DueDate = spDateIn(it.DueDate);
    if (Number(it.GoalID)) values.GoalID = String(it.GoalID);
  }
  return form;
}

async function _bgtrSwitchForm(next) {
  const s = _bgtrState;
  if (s.dirty && !(await bgtrConfirmLeave())) return;
  s.form = next; s.dirty = false; s.rollover = null;
  _bgtrDraw();
}

function bgtrGoalForm(id)   { return _bgtrSwitchForm(_bgtrFormFor('goal', id)); }
function bgtrActionForm(id) { return _bgtrSwitchForm(_bgtrFormFor('action', id)); }
function bgtrUpdateForm(id) { return _bgtrSwitchForm({ kind: 'update', goalId: String(id), values: {} }); }
function bgtrFormCancel()   { const s = _bgtrState; s.form = null; s.dirty = false; _bgtrDraw(); }

async function bgtrYear(value) {
  const s = _bgtrState, y = Number(value);
  if (!Number.isInteger(y) || y === Number(s.year)) return;
  if (s.dirty && !(await bgtrConfirmLeave())) { _bgtrDraw(); return; }
  s.year = y; s.form = null; s.dirty = false; s.rollover = null; s.history = {};
  _bgtrDraw();
}

function _bgtrReform(name, value) {
  const s = _bgtrState;
  _bgtrStash();
  if (!s.form) return;
  s.form.values[name] = value;
  s.form.values.ParentGoalID = '';
  if (name === 'GoalLevel') s.form.values.Quarter = '';
  s.dirty = true;
  _bgtrDraw();
}
function bgtrFormLevel(value)   { _bgtrReform('GoalLevel', value); }
function bgtrFormQuarter(value) { _bgtrReform('Quarter', value); }

// A new action defaults its owner to the chosen goal's owner (when none is picked yet).
function bgtrActionGoal(value) {
  const s = _bgtrState;
  _bgtrStash();
  if (!s.form) return;
  s.dirty = true;
  const g = s.data.goals.find(x => String(x.id) === String(value));
  if (g && !s.form.values.OwnerEmail && g.OwnerEmail) { s.form.values.OwnerEmail = String(g.OwnerEmail).toLowerCase(); _bgtrDraw(); }
}

async function bgtrGoalSave() {
  const s = _bgtrState;
  _bgtrStash();
  const f = s.form;
  if (!f || f.kind !== 'goal') return;
  const edit = Object.assign({}, f.values, f.id ? { id: f.id } : { GoalYear: s.year });
  await _bgtrRun(() => saveTrackerBusinessGoal(edit), 'Goal saved.', () => { s.form = null; s.dirty = false; });
}

async function bgtrActionSave() {
  const s = _bgtrState;
  _bgtrStash();
  const f = s.form;
  if (!f || f.kind !== 'action') return;
  const edit = Object.assign({}, f.values, f.id ? { id: f.id } : {});
  await _bgtrRun(() => saveTrackerBusinessAction(edit), 'Action saved.', () => { s.form = null; s.dirty = false; });
}

async function bgtrUpdateSave() {
  const s = _bgtrState;
  _bgtrStash();
  const f = s.form;
  if (!f || f.kind !== 'update') return;
  const g = s.data.goals.find(x => String(x.id) === String(f.goalId)) || {};
  const entry = { GoalID: f.goalId, UpdateText: f.values.UpdateText, RagAtUpdate: g.Rag || '', StatusAtUpdate: g.Status || 'Open' };
  await _bgtrRun(() => addBusinessGoalUpdate(entry), 'Update posted.', () => { s.form = null; s.dirty = false; });
}

function bgtrHistory(id) {
  const h = _bgtrState.history, k = String(id);
  h[k] = !h[k];
  _bgtrDraw();
}

async function bgtrRag(id, value)    { await _bgtrRun(() => setBusinessGoalLive(id, { Rag: value }), 'RAG updated.'); }
async function bgtrStatus(id, value) { await _bgtrRun(() => setBusinessGoalLive(id, { Status: value }), 'Status updated.'); }
async function bgtrDone(id, checked) { await _bgtrRun(() => setBusinessActionDone(id, !!checked), ''); }

// deleteBusinessGoal refuses (ok false) while the goal has sub-goals or actions; that reads as an error toast.
function _bgtrBlockedText(b) {
  const n = (k, word) => k + ' ' + word + (k === 1 ? '' : 's');
  return 'Remove or move its ' + n(b.children, 'sub-goal') + ' and ' + n(b.actions, 'action') + ' first.';
}

async function bgtrDeleteGoal(id) {
  const g = (_bgtrState.data.goals || []).find(x => String(x.id) === String(id));
  if (!(await confirmModal({ title: 'Delete goal?', message: 'Delete “' + (g ? g.Title : 'this goal') + '” and its update history? This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
  await _bgtrRun(async () => {
    const r = await deleteBusinessGoal(id);
    if (!r.ok) throw new Error(_bgtrBlockedText(r.blockers));
    return r;
  }, 'Goal deleted.');
}

async function bgtrDeleteAction(id) {
  const a = (_bgtrState.data.actions || []).find(x => String(x.id) === String(id));
  if (!(await confirmModal({ title: 'Delete action?', message: 'Delete “' + (a ? a.Title : 'this action') + '”? This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
  await _bgtrRun(() => deleteBusinessAction(id), 'Action deleted.');
}

// Carry forward (one goal) and Roll over year (every carryable annual goal of the year, all ticked) share one panel.
async function _bgtrOpenRollover(goalIds) {
  const s = _bgtrState;
  if (s.dirty && !(await bgtrConfirmLeave())) return;
  s.form = null;
  s.rollover = { plan: null, ticked: new Set(), busy: false };
  _bgtrDraw();
  try {
    const plan = await bizgoalsRolloverPreview(s.year, goalIds);
    s.rollover = { plan, ticked: new Set(plan.items.map(it => it.goalId)), busy: false };
  } catch (e) {
    console.error('Goals & Actions: rollover preview failed', e);
    toast(e.message, { type: 'error' });
    s.rollover = null;
  }
  _bgtrDraw();
}

function bgtrCarry(id) { return _bgtrOpenRollover([String(id)]); }

function bgtrRollover() {
  const s = _bgtrState;
  const model = bizgoalsTrackerModel({ goals: s.data.goals, actions: s.data.actions, updates: s.data.updates, candidates: s.data.candidates, today: new Date(), year: s.year });
  return _bgtrOpenRollover(model.tree.concat(model.orphans).filter(n => n.canCarry).map(n => String(n.goal.id)));
}

function bgtrRollTick(id, checked) {
  const r = _bgtrState.rollover;
  if (!r) return;
  if (checked) r.ticked.add(String(id)); else r.ticked.delete(String(id));
  _bgtrDraw();
}

function bgtrRollCancel() { _bgtrState.rollover = null; _bgtrDraw(); }

function _bgtrRollSummary(res) {
  return [res.done.length + ' carried into ' + res.toYear, res.skipped.length ? res.skipped.length + ' skipped' : '', res.failed.length ? res.failed.length + ' failed (run it again to finish)' : ''].filter(Boolean).join(', ') + '.';
}

async function bgtrRollConfirm() {
  const s = _bgtrState, r = s.rollover;
  if (!r || !r.plan || !r.ticked.size || r.busy) return;
  r.busy = true;
  _bgtrDraw();
  await _bgtrRun(() => rolloverBusinessGoals(s.year, Array.from(r.ticked)), '', res => {
    s.rollover = null;
    toast(_bgtrRollSummary(res), { type: res.failed.length ? 'error' : 'success' });
  });
  if (s.rollover) s.rollover.busy = false;
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  bgtrDirty,
  bgtrYear,
  bgtrGoalForm,
  bgtrActionForm,
  bgtrUpdateForm,
  bgtrFormCancel,
  bgtrFormLevel,
  bgtrFormQuarter,
  bgtrActionGoal,
  bgtrGoalSave,
  bgtrActionSave,
  bgtrUpdateSave,
  bgtrHistory,
  bgtrRag,
  bgtrStatus,
  bgtrDone,
  bgtrDeleteGoal,
  bgtrDeleteAction,
  bgtrCarry,
  bgtrRollover,
  bgtrRollTick,
  bgtrRollCancel,
  bgtrRollConfirm,
});
