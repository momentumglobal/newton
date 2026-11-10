// js/pdp-my.js — People > My Development (N-438 / PDP-6)
//
// The employee's own page: the year as a timeline of meetings, prep forms for the open meeting, the
// agreed record once it is held, and sign-off. Rules are pure in pdp-prep.js; reads and the two writes
// (prep, sign-off) are loadMyDevelopment / savePdpPrep / signOffPdpMeeting in api-pdp.js. PDP-D12 review
// (N-438): this page renders one person's own meeting records, so it is on the PDP-D12 allowlist
// (tests/assert-pdp-access.js); it is loaded only on people.html, never by mobile.html, Newton for
// Claude or the Command Bar.

let _pdpmState = {
  data:    null,    // last loadMyDevelopment() result
  year:    0,
  openId:  null,    // meeting id shown in the detail view, null = timeline
  error:   '',
  busy:    false,
  dirty:   false,   // prep fields changed since the last save
  tab:     'year',  // 'year' (timeline) | 'goals' (N-440 Goals & actions tracker)
};

const _PDPM_STATE_TEXT  = { done: 'Done', skipped: 'Skipped', overdue: 'Overdue', due: 'Due soon', upcoming: 'Upcoming' };
const _PDPM_STATE_CLASS = { done: 'dh-badge-success', overdue: 'dh-badge-danger', due: 'dh-badge-warn' };

function _pdpmName(p) { return (p && p.EmployeeName) || '—'; }

async function renderMyDevelopmentPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = dashboardSkeleton(2);
  _pdpmState.openId = null; _pdpmState.dirty = false; _pdpmState.busy = false;
  await _pdpmLoad(_pdpmState.year);
}

async function _pdpmLoad(year) {
  const main = document.getElementById('main-content');
  try {
    _pdpmState.data = await loadMyDevelopment(year);
    _pdpmState.error = '';
    if (_pdpmState.data.year) _pdpmState.year = _pdpmState.data.year;
  } catch (e) {
    console.error('My Development: load failed', e);
    _pdpmState.data = null;
    _pdpmState.error = e.message;
  }
  main.innerHTML = _pdpmPageHtml();
  lucide.createIcons();
}

function _pdpmShell(inner) {
  return `<div class="page-header"><h1 class="page-title">My Development</h1></div>${inner}`;
}

function _pdpmPageHtml() {
  const s = _pdpmState, d = s.data;
  if (s.error) return _pdpmShell(emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: 'Could not load My Development', message: s.error }));
  if (!d || d.none) return _pdpmShell(emptyStateBlock({ icon: 'lock', title: 'My Development', message: 'Development & Performance is not available to you right now.' }));
  if (d.noPerson) {
    const why = d.flags && d.flags.ambiguous
      ? 'Your work email matches more than one People record. Ask People Ops to fix it.'
      : 'Your work email is not linked to a People record, so there is nothing to show. Ask People Ops to link it.';
    return _pdpmShell(emptyStateBlock({ icon: 'user-x', title: 'No development record', message: why }));
  }
  if (!d.years.length) return _pdpmShell(_pdpmHeadHtml(d) + emptyStateBlock({ icon: 'calendar', title: 'No meetings yet', message: 'People Ops creates your meetings for the year before the January Annual. Check back soon.' }));
  const m = s.openId != null ? d.meetings.find(x => String(x.id) === String(s.openId)) : null;
  return _pdpmShell(_pdpmHeadHtml(d) + (m ? _pdpmDetailHtml(d, m) : _pdpmTabsHtml() + (s.tab === 'goals' ? _pdpmTrackerHtml(d) : _pdpmTimelineHtml(d))));
}

function _pdpmHeadHtml(d) {
  const me = d.me;
  const options = d.years.map(y => `<option value="${escAttr(y)}"${y === d.year ? ' selected' : ''}>${escHtml(y)}</option>`).join('');
  const sum = pdpCycleSummary(d.meetings, new Date());
  const note = d.readOnly ? '<p class="ppl-muted-note pdpm-note">You are previewing this page, so nothing here can be saved or signed.</p>' : '';
  return `
    <div class="ppl-card pdpm-head">
      <div class="pdpm-who">
        <div class="pdpm-name">${escHtml(_pdpmName(me))}</div>
        <div class="ppl-muted-small">${escHtml(me.Level || '')}${me.Title ? ' · ' + escHtml(me.Title) : ''}</div>
        <div class="ppl-muted-small">Line manager: ${escHtml(_pdpmName(d.lm))} · CSD: ${escHtml(_pdpmName(d.csd))}</div>
      </div>
      <div class="pdpm-chips">
        <span class="dh-badge dh-badge-success">${sum.done} done</span>
        <span class="dh-badge dh-badge-warn">${sum.due} due soon</span>
        <span class="dh-badge dh-badge-danger">${sum.overdue} overdue</span>
      </div>
      <div class="form-group pdpm-year">
        <label for="pdpm-year">Year</label>
        <select id="pdpm-year"${actOn('change', 'pdpmYear', ACT_VALUE)}>${options}</select>
      </div>
    </div>${note}`;
}

function _pdpmCardNote(c) {
  if (c.state === 'skipped') return c.skipReason || 'Skipped';
  if (c.status === 'SignedOff') return 'Signed off';
  if (c.status === 'Held') return c.employeeSigned ? 'Waiting for your manager to sign' : 'Held · your sign-off is needed';
  if (c.window === 'closed') return c.opensOn ? 'Prep opens ' + pdpFmtDay(c.opensOn) : 'Not open yet';
  return c.submitted ? 'Prep ready' : 'Prep open';
}

function _pdpmTimelineHtml(d) {
  const cards = pdpMyTimeline(d.meetings, new Date());
  if (!cards.length) return emptyStateBlock({ icon: 'calendar', title: 'No meetings for ' + d.year, message: 'Nothing has been generated for this year yet.' });
  return `
    <div class="pdpm-timeline">${cards.map(c => `
      <button type="button" class="ppl-card pdpm-card" aria-label="${escAttr(c.label + ', ' + pdpFmtDay(c.due))}"${act('pdpmOpen', c.id)}>
        <span class="pdpm-card-title">${escHtml(c.label)}</span>
        <span class="ppl-muted-small">Due ${escHtml(pdpFmtDay(c.due))}</span>
        <span class="dh-badge ${_PDPM_STATE_CLASS[c.state] || ''}">${escHtml(_PDPM_STATE_TEXT[c.state] || c.state)}</span>
        <span class="ppl-muted-small">${escHtml(_pdpmCardNote(c))}</span>
      </button>`).join('')}
    </div>`;
}

// N-440: the two tabs under the head, and the Goals & actions tracker (markup and rules live in pdp-track-ui.js).
function _pdpmTabsHtml() {
  const t = _pdpmState.tab;
  const tab = (key, label) => `<button type="button" class="eng-tab${t === key ? ' eng-tab--active' : ''}" role="tab" aria-selected="${t === key ? 'true' : 'false'}"${act('pdpmTab', key)}>${label}</button>`;
  return `<div class="eng-tab-strip pdptr-tabs" role="tablist">${tab('year', 'My year')}${tab('goals', 'Goals &amp; actions')}</div>`;
}

function _pdpmTrackerData(d) {
  return {
    goals: d.goals, actions: d.actions, meetings: d.meetings, edit: !!d.trackerEdit,
    note: d.readOnly ? 'You are previewing this page, so nothing here can be saved.' : (d.trackerEdit ? '' : 'This cycle is closed, so goals and actions are read-only.'),
  };
}

function _pdpmTrackerHtml(d) {
  pdptrSync({
    personId: d.me.id, year: d.year, data: _pdpmTrackerData(d),
    load: async () => { _pdpmState.data = await loadMyDevelopment(_pdpmState.year); return _pdpmTrackerData(_pdpmState.data); },
    redraw: _pdpmRedraw,
  });
  return pdptrHtml();
}

function _pdpmTextHtml(text) {
  return text ? `<div class="pdpm-text">${escHtml(text)}</div>` : '<div class="ppl-muted-small">Nothing written.</div>';
}

function _pdpmListHtml(rows, line) {
  if (!rows.length) return '<div class="ppl-muted-small">None recorded.</div>';
  return `<ul class="pdpm-list">${rows.map(r => `<li>${line(r)}</li>`).join('')}</ul>`;
}

function _pdpmBlockHtml(b, ctx) {
  const L = CONFIG.PDP;
  const label = `<div class="pdpm-label">${escHtml(b.label)}${b.required ? ' <span class="pdpm-req">required</span>' : ''}</div>`;
  const hint = b.hint ? `<div class="ppl-muted-small">${escHtml(b.hint)}</div>` : '';
  const type = b.type;
  if (type === 'prepQuestion' && b.by === 'employee') {
    const val = ctx.prep.answers[b.key] || '';
    if (ctx.edit) {
      const kpi = b.key === L.ME.KPI_BLOCK_KEY && ctx.scorecards
        ? `<button type="button" class="btn-secondary pdpm-kpi"${act('pdpmScorecard')}>Open my Scorecard</button>` : '';
      return `<div class="pdpm-block">${label}${hint}<textarea rows="4" maxlength="${escAttr(L.TEMPLATE_LIMITS.LABEL_MAX * 10)}" data-pa="${escAttr(b.key)}" aria-label="${escAttr(b.label)}">${escHtml(val)}</textarea>${kpi}</div>`;
    }
    return `<div class="pdpm-block">${label}${_pdpmTextHtml(val)}</div>`;
  }
  if (type === 'prepQuestion' && b.by === 'manager') {
    return ctx.record ? `<div class="pdpm-block">${label}${_pdpmTextHtml(ctx.mgr[b.key] || '')}</div>` : '';
  }
  if (type === 'goalReview' && b.by === 'employee') {
    const saved = ctx.prep.goalReview[b.key] || {};
    if (!ctx.goalsOpen.length) return `<div class="pdpm-block">${label}<div class="ppl-muted-small">No open goals to review yet.</div></div>`;
    const rows = ctx.goalsOpen.map(g => {
      const cur = saved[String(g.id)] || {};
      if (!ctx.edit) return `<li><strong>${escHtml(g.Title)}</strong> · ${escHtml(cur.rag || 'No rating')}${cur.comment ? ' · ' + escHtml(cur.comment) : ''}</li>`;
      const opts = ['<option value="">Rating…</option>'].concat(L.RAG.map(r => `<option value="${escAttr(r)}"${cur.rag === r ? ' selected' : ''}>${escHtml(r)}</option>`)).join('');
      return `<li class="pdpm-goal"><strong>${escHtml(g.Title)}</strong>
        <select data-gr="${escAttr(b.key)}" data-gid="${escAttr(g.id)}" data-gf="rag" aria-label="Rating for ${escAttr(g.Title)}">${opts}</select>
        <input type="text" data-gr="${escAttr(b.key)}" data-gid="${escAttr(g.id)}" data-gf="comment" value="${escAttr(cur.comment || '')}" maxlength="${escAttr(L.TEMPLATE_LIMITS.LABEL_MAX)}" aria-label="Comment on ${escAttr(g.Title)}"></li>`;
    }).join('');
    return `<div class="pdpm-block">${label}${hint}<ul class="pdpm-list">${rows}</ul></div>`;
  }
  if (type === 'goalReview') {
    return `<div class="pdpm-block">${label}${ctx.record ? _pdpmListHtml(ctx.rec.goals, g => `<strong>${escHtml(g.Title)}</strong> · ${escHtml(g.Rag || 'No rating')}`) : '<div class="ppl-muted-small">Reviewed in the meeting.</div>'}</div>`;
  }
  if (type === 'prompt') {
    return `<div class="pdpm-block">${label}${ctx.record ? _pdpmTextHtml(ctx.rec.answers[b.key] || '') : '<div class="ppl-muted-small">Discussed in the meeting.</div>'}</div>`;
  }
  if (type === 'goalSet') {
    const range = ctx.joiner ? CONFIG.PDP.CYCLE.JOINER_GOALS : { min: b.min, max: b.max };
    if (!ctx.record) return `<div class="pdpm-block">${label}<div class="ppl-muted-small">${range.min === range.max ? range.min : range.min + ' to ' + range.max} goals are agreed in the meeting.</div></div>`;
    return `<div class="pdpm-block">${label}${_pdpmListHtml(ctx.rec.goals, g => `<strong>${escHtml(g.Title)}</strong>${g.Category ? ' · ' + escHtml(g.Category) : ''}${g.TargetDate ? ' · by ' + escHtml(pdpFmtDay(spDateIn(g.TargetDate))) : ''}`)}</div>`;
  }
  if (type === 'actions') {
    if (!ctx.record) return `<div class="pdpm-block">${label}<div class="ppl-muted-small">Actions (up to ${escHtml(b.max)}) are agreed in the meeting.</div></div>`;
    return `<div class="pdpm-block">${label}${_pdpmListHtml(ctx.rec.actions, a => `${escHtml(a.Title)} · ${escHtml(a.OwnerRole || '')}${a.DueDate ? ' · due ' + escHtml(pdpFmtDay(spDateIn(a.DueDate))) : ''}${_pdpmYes(a.IsDone) ? ' · done' : ''}`)}</div>`;
  }
  if (type === 'scoring') return `<div class="pdpm-block">${label}<div class="ppl-muted-small">Scored in the review. Nothing to do here.</div></div>`;
  return '';
}

function _pdpmYes(v) { return v === true || v === 1 || v === 'Yes' || v === '1' || v === 'true'; }

function _pdpmDetailHtml(d, m) {
  const win = pdpPrepWindow(m, new Date());
  const record = m.Status === 'Held' || m.Status === 'SignedOff';
  const edit = win.state === 'open' && !d.readOnly;
  const label = pdpMeetingLabel(m);
  const head = `
    <div class="pdpm-detail-head">
      <button type="button" class="btn-secondary"${act('pdpmBack')}>Back to my year</button>
      <h2 class="pdpm-detail-title">${escHtml(label)}</h2>
      <span class="ppl-muted-small">Due ${escHtml(pdpFmtDay(spDateIn(m.DueDate)))}</span>
    </div>`;
  if (m.Status === 'Skipped') {
    return head + emptyStateBlock({ icon: 'alert-circle', title: 'Skipped', message: m.SkipReason || 'This meeting was skipped.' });
  }
  const tpl = pdpTemplateForMeeting(d.templates, m);
  const def = tpl ? pdpParseJson(tpl.Definition) : null;
  if (!def || !Array.isArray(def.sections)) {
    return head + emptyStateBlock({ icon: 'file-text', title: 'Template unavailable', message: 'Contact People Ops: this meeting has no readable template.' });
  }
  const ctx = {
    edit, record, joiner: _pdpmYes(m.IsJoiner), rec: pdpMyAgreedRecord(m, d.goals, d.actions),
    prep: pdpPrepFromJson(m.PrepEmployee), mgr: {}, scorecards: peopleCanAccess('scorecards', _resolvedRole),
    goalsOpen: d.goals.filter(g => (g.Status || 'Open') === 'Open'),
  };
  ctx.mgr = ctx.rec.managerPrep;
  // N-447: a template with no employee prep blocks (the seeded Monthly) has nothing to prepare.
  const needsPrep = pdpPrepBlocks(def).employee.length > 0;
  const banner = !needsPrep
    ? '<p class="ppl-muted-note pdpm-note">No prep needed for this meeting.</p>'
    : (win.state === 'closed'
      ? `<p class="ppl-muted-note pdpm-note">Prep opens ${escHtml(pdpFmtDay(win.opensOn))}.</p>`
      : (edit ? '<p class="ppl-muted-note pdpm-note">Your answers stay private to you, your line manager and your CSD. You can keep editing until the meeting is held.</p>' : ''));
  const sections = def.sections.map(s => {
    const body = (s.blocks || []).map(b => _pdpmBlockHtml(b, ctx)).join('');
    return body ? `<div class="ppl-card pdpm-section"><div class="ppl-card-title">${escHtml(s.title)}</div>${body}</div>` : '';
  }).join('');
  const actions = edit && needsPrep ? `
    <div class="pdpm-actions">
      <button type="button" class="btn-secondary"${act('pdpmSave')}>Save draft</button>
      <button type="button" class="btn-primary"${act('pdpmSubmit')}>Mark prep ready</button>
      ${ctx.prep.submittedAt ? `<span class="ppl-muted-small">Marked ready ${escHtml(pdpFmtDay(localDayISO(new Date(ctx.prep.submittedAt))))}</span>` : ''}
    </div>` : '';
  return `<div id="pdpm-detail"${actOn('input', 'pdpmDirty')}${actOn('change', 'pdpmDirty')}>${head}${banner}${sections}${actions}${record ? _pdpmSignHtml(d, m) : ''}</div>`;
}

function _pdpmSignHtml(d, m) {
  const fmt = v => v ? pdpFmtDay(localDayISO(new Date(v))) : '';
  const mine = fmt(m.EmployeeSignedAt), theirs = fmt(m.ManagerSignedAt);
  const can = m.Status === 'Held' && !mine && !d.readOnly;
  return `
    <div class="ppl-card pdpm-sign">
      <div class="ppl-card-title">Sign-off</div>
      <p class="ppl-muted-note">${mine ? 'You signed on ' + escHtml(mine) + '.' : 'You have not signed yet.'} ${theirs ? 'Your manager signed on ' + escHtml(theirs) + '.' : 'Your manager has not signed yet.'}</p>
      ${can ? `<button type="button" class="btn-primary"${act('pdpmSignOff')}>Sign off this record</button>` : ''}
    </div>`;
}

// ── actions ──────────────────────────────────────────────────────────────────────────────────
function _pdpmRedraw() {
  const main = document.getElementById('main-content');
  main.innerHTML = _pdpmPageHtml();
  lucide.createIcons();
}

async function pdpmYear(value) {
  if ((_pdpmState.dirty || pdptrIsDirty()) && !(await confirmModal({ title: 'Discard changes?', message: 'You have unsaved changes. Switching year discards them.', confirmLabel: 'Discard' }))) { _pdpmRedraw(); return; }
  _pdpmState.dirty = false; _pdpmState.openId = null;
  document.getElementById('main-content').innerHTML = dashboardSkeleton(2);
  await _pdpmLoad(Number(value));
}

// N-440: switch between My year and Goals & actions. An open goal / action form is confirmed away first.
async function pdpmTab(tab) {
  const s = _pdpmState, next = tab === 'goals' ? 'goals' : 'year';
  if (next === s.tab) return;
  if (pdptrIsDirty() && !(await confirmModal({ title: 'Discard changes?', message: 'You have an unsaved goal or action. Switching tabs discards it.', confirmLabel: 'Discard' }))) return;
  s.tab = next; s.openId = null; s.dirty = false;
  pdptrReset();
  _pdpmRedraw();
}

function pdpmOpen(id) { _pdpmState.openId = id; _pdpmState.dirty = false; _pdpmRedraw(); }

async function pdpmBack() {
  if (_pdpmState.dirty && !(await confirmModal({ title: 'Discard changes?', message: 'You have unsaved prep. Going back discards it.', confirmLabel: 'Discard' }))) return;
  _pdpmState.openId = null; _pdpmState.dirty = false; _pdpmRedraw();
}

function pdpmDirty() { _pdpmState.dirty = true; }

function pdpmScorecard() { navigateToPeople('scorecards'); }

function _pdpmCollect() {
  const root = document.getElementById('pdpm-detail');
  const answers = {}, goalReview = {};
  if (!root) return { answers, goalReview };
  root.querySelectorAll('[data-pa]').forEach(el => { answers[el.getAttribute('data-pa')] = el.value; });
  root.querySelectorAll('[data-gr]').forEach(el => {
    const key = el.getAttribute('data-gr'), gid = el.getAttribute('data-gid'), f = el.getAttribute('data-gf');
    goalReview[key] = goalReview[key] || {};
    goalReview[key][gid] = goalReview[key][gid] || {};
    goalReview[key][gid][f] = el.value;
  });
  return { answers, goalReview };
}

async function _pdpmSavePrep(submit) {
  if (_pdpmState.busy || _pdpmState.openId == null) return;
  _pdpmState.busy = true;
  const edit = Object.assign(_pdpmCollect(), { submit });
  try {
    await savePdpPrep(_pdpmState.openId, edit);
    toast(submit ? 'Prep marked ready.' : 'Draft saved.', { type: 'success' });
    _pdpmState.dirty = false;
    _pdpmState.data = await loadMyDevelopment(_pdpmState.year);
    _pdpmRedraw();
  } catch (e) {
    console.error('My Development: save failed', e);
    toast(e.message, { type: 'error' });
  }
  _pdpmState.busy = false;
}

function pdpmSave()   { return _pdpmSavePrep(false); }
function pdpmSubmit() { return _pdpmSavePrep(true); }

async function pdpmSignOff() {
  if (_pdpmState.busy || _pdpmState.openId == null) return;
  const ok = await confirmModal({ title: 'Sign off this record', message: 'You are confirming the agreed record is accurate. This cannot be undone.', confirmLabel: 'Sign off' });
  if (!ok) return;
  _pdpmState.busy = true;
  try {
    await signOffPdpMeeting(_pdpmState.openId);
    toast('Signed off.', { type: 'success' });
    _pdpmState.data = await loadMyDevelopment(_pdpmState.year);
    _pdpmRedraw();
  } catch (e) {
    console.error('My Development: sign-off failed', e);
    toast(e.message, { type: 'error' });
  }
  _pdpmState.busy = false;
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  pdpmYear,
  pdpmOpen,
  pdpmBack,
  pdpmDirty,
  pdpmScorecard,
  pdpmSave,
  pdpmSubmit,
  pdpmSignOff,
  pdpmTab,
});