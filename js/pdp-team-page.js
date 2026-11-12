// js/pdp-team-page.js — My Momentum > My Team > Development (N-439 / PDP-7; moved from People by N-452)
//
// The line manager's and CSD's page: their people with due / overdue / prep-ready / awaiting-signature, and
// the run-meeting screen (employee prep, last meeting's commitments, manager prep, notes, goals, actions,
// Held, sign-off). Rules are pure in pdp-team.js (and pdp-prep.js); every read and write is a function in
// api-pdp.js (loadTeamDevelopment / loadTeamMeeting / saveTeamMeeting / markPdpHeld / ...). PDP-D12 review
// (N-439): this page renders other people's meeting records, so it is on the PDP-D12 allowlist
// (tests/assert-pdp-access.js); it is loaded only on my-momentum.html, never by mobile.html, Newton for Claude
// or the Command Bar. It reuses the state pill maps and the text / list helpers from pdp-ui-common.js, and the
// tab strip from my-momentum-pages.js (mmTeamTabsHtml).

let _pdptpState = {
  list:     null,   // last loadTeamDevelopment() result
  year:     0,
  view:     '',
  personId: null,   // person whose meetings are listed, null = team table
  openId:   null,   // meeting shown on the run screen, null = list
  detail:   null,   // last loadTeamMeeting() result
  draft:    null,   // { prepManager, notes, meetingDate } the manager is typing
  form:     null,   // { kind: 'goal' | 'action', id, values } open add / edit form
  tab:      'meetings',   // person view: 'meetings' | 'goals' (N-440 Goals & actions tracker)
  tracker:  null,   // last loadTeamPerson() result for the open person ({ error } when it failed)
  error:    '',
  busy:     false,
  dirty:    false,
};

const _PDPTP_PILL = { overdue: 'dh-badge-danger', sign: 'dh-badge-warn', prep: 'dh-badge-success', due: 'dh-badge-warn', upcoming: '', done: 'dh-badge-success', none: '' };
const _PDPTP_ATTN = { overdue: 'Overdue', sign: 'Held · needs your signature', prep: 'Employee prep ready', due: 'Due soon', upcoming: 'Upcoming', done: 'All done', none: 'No meetings yet' };
const _PDPTP_VIEWS = { tree: 'Whole tree', reports: 'Direct reports', all: 'All staff' };

async function renderTeamDevelopmentPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = dashboardSkeleton(2);
  Object.assign(_pdptpState, { personId: null, openId: null, detail: null, draft: null, form: null, busy: false, dirty: false, tab: 'meetings', tracker: null });
  pdptrReset();
  await _pdptpLoadList();
}

async function _pdptpLoadList() {
  try {
    _pdptpState.list = await loadTeamDevelopment(_pdptpState.year, _pdptpState.view);
    _pdptpState.error = '';
    if (_pdptpState.list.year) _pdptpState.year = _pdptpState.list.year;
    if (_pdptpState.list.view) _pdptpState.view = _pdptpState.list.view;
  } catch (e) {
    console.error('Team Development: load failed', e);
    _pdptpState.list = null;
    _pdptpState.error = e.message;
  }
  _pdptpRedraw();
}

function _pdptpRedraw() {
  const main = document.getElementById('main-content');
  main.innerHTML = _pdptpPageHtml();
  lucide.createIcons();
}

function _pdptpShell(inner) {
  return `<div class="page-header"><h1 class="page-title">My Team</h1></div>${mmTeamTabsHtml('development')}${inner}`;
}

function _pdptpPageHtml() {
  const s = _pdptpState, d = s.list;
  if (s.error) return _pdptpShell(emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: 'Could not load My Team', message: s.error }));
  if (!d || d.none) return _pdptpShell(emptyStateBlock({ icon: 'lock', title: 'My Team', message: 'Development & Performance is not available to you right now.' }));
  if (d.noScope) return _pdptpShell(emptyStateBlock({ icon: 'users', title: 'No team to show', message: 'Nobody reports to you in Newton, so there is nothing here. If that looks wrong, ask People Ops to check your work email and your team’s line managers.' }));
  if (s.openId != null && s.detail) return _pdptpShell(_pdptpDetailHtml(s.detail, s));
  const row = s.personId != null ? d.rows.find(r => String(r.personId) === String(s.personId)) : null;
  return _pdptpShell(_pdptpHeadHtml(d) + (row ? _pdptpPersonHtml(d, row) : _pdptpTableHtml(d)));
}

function _pdptpHeadHtml(d) {
  const yearOpts = d.years.map(y => `<option value="${escAttr(y)}"${y === d.year ? ' selected' : ''}>${escHtml(y)}</option>`).join('');
  const viewOpts = d.views.map(v => `<option value="${escAttr(v)}"${v === d.view ? ' selected' : ''}>${escHtml(_PDPTP_VIEWS[v] || v)}</option>`).join('');
  const t = d.totals;
  const note = d.gate.state === 'preview'
    ? '<p class="ppl-muted-note pdpt-note">Preview: Development &amp; Performance is Off for everyone else, so nothing here can be saved.</p>'
    : (d.readOnly ? '<p class="ppl-muted-note pdpt-note">You are previewing this page, so nothing here can be saved or signed.</p>' : '')
      + (d.view === 'all' ? '<p class="ppl-muted-note pdpt-note">All staff is read-only except for the people you manage.</p>' : '');
  return `
    <div class="ppl-card pdpt-head">
      <div class="pdpm-chips">
        <span class="dh-badge dh-badge-danger">${t.overdue} overdue</span>
        <span class="dh-badge dh-badge-warn">${t.due} due soon</span>
        <span class="dh-badge dh-badge-success">${t.prepReady} prep ready</span>
        <span class="dh-badge dh-badge-warn">${t.toSign} to sign</span>
        ${t.noMeetings ? `<span class="dh-badge">${t.noMeetings} with no meetings</span>` : ''}
      </div>
      <div class="pdpt-controls">
        <div class="form-group"><label for="pdpt-view">View</label><select id="pdpt-view"${actOn('change', 'pdptView', ACT_VALUE)}>${viewOpts}</select></div>
        <div class="form-group"><label for="pdpt-year">Year</label><select id="pdpt-year"${actOn('change', 'pdptYear', ACT_VALUE)}>${yearOpts}</select></div>
      </div>
    </div>${note}`;
}

function _pdptpDateCell(r) {
  const n = r.next;
  if (!n) return '<span class="ppl-muted-small">Nothing open</span>';
  const date = (n.meetingType === 'Quarterly' && ['Planned', 'PrepOpen'].includes(n.status) && n.canRun && !_pdptpState.list.readOnly)
    ? `<span class="pdpt-date"><input type="date" id="pdpt-qd-${escAttr(n.id)}" value="${escAttr(n.meetingDate)}" aria-label="Meeting date for ${escAttr(r.name)}"><button type="button" class="btn-secondary"${act('pdptSetDate', n.id)}>Set date</button></span>` : '';
  return `<button type="button" class="pdpt-link"${act('pdptOpen', n.id)}>${escHtml(n.label)}</button>
    <span class="ppl-muted-small">due ${escHtml(pdpFmtDay(n.due))}</span>
    <span class="dh-badge ${_PDPM_STATE_CLASS[n.state] || ''}">${escHtml(_PDPM_STATE_TEXT[n.state] || n.state)}</span>${date}`;
}

function _pdptpTableHtml(d) {
  if (!d.rows.length) return emptyStateBlock({ icon: 'users', title: 'Nobody to show', message: 'No meetings exist for ' + d.year + ' in this view yet.' });
  const showLm = d.view !== 'reports';
  const body = d.rows.map(r => `
    <tr>
      <td><button type="button" class="pdpt-link"${act('pdptPerson', r.personId)}>${escHtml(r.name)}</button>
        <div class="ppl-muted-small">${escHtml(r.level)}${r.title ? ' · ' + escHtml(r.title) : ''}</div></td>
      ${showLm ? `<td>${escHtml(r.lmName)}</td>` : ''}
      <td>${r.noMeetings ? '<span class="ppl-muted-small">No meetings yet. People Ops runs the cycle.</span>' : _pdptpDateCell(r)}</td>
      <td><span class="dh-badge ${_PDPTP_PILL[r.attention] || ''}">${escHtml(_PDPTP_ATTN[r.attention] || '')}</span>${r.waitingOnEmployee ? '<div class="ppl-muted-small">Waiting for the employee to sign</div>' : ''}</td>
      <td>${r.summary.done} / ${r.summary.total}</td>
    </tr>`).join('');
  return `<div class="table-scroll"><table class="data-table pdpt-table"><thead><tr>
    <th>Person</th>${showLm ? '<th>Line manager</th>' : ''}<th>Next meeting</th><th>Needs attention</th><th>Done</th>
  </tr></thead><tbody>${body}</tbody></table></div>`;
}

function _pdptpCardNote(c) {
  if (c.state === 'skipped') return c.skipReason || 'Skipped';
  if (c.status === 'SignedOff') return 'Signed off';
  if (c.status === 'Held') return c.managerSigned ? 'Waiting for the employee to sign' : (c.employeeSigned ? 'Employee signed · needs your signature' : 'Held · needs your signature');
  return c.submitted ? 'Employee prep ready' : (c.window === 'closed' && c.opensOn ? 'Prep opens ' + pdpFmtDay(c.opensOn) : 'Prep not ready yet');
}

function _pdptpPersonHtml(d, r) {
  const cards = pdpMyTimeline(r.meetings, new Date());
  const list = cards.length ? `<div class="pdpm-timeline">${cards.map(c => `
      <button type="button" class="ppl-card pdpm-card" aria-label="${escAttr(c.label + ', ' + pdpFmtDay(c.due))}"${act('pdptOpen', c.id)}>
        <span class="pdpm-card-title">${escHtml(c.label)}</span>
        <span class="ppl-muted-small">Due ${escHtml(pdpFmtDay(c.due))}</span>
        <span class="dh-badge ${_PDPM_STATE_CLASS[c.state] || ''}">${escHtml(_PDPM_STATE_TEXT[c.state] || c.state)}</span>
        <span class="ppl-muted-small">${escHtml(_pdptpCardNote(c))}</span>
      </button>`).join('')}</div>`
    : emptyStateBlock({ icon: 'calendar', title: 'No meetings yet', message: 'People Ops creates the year’s meetings before the January Annual.' });
  return `
    <div class="pdpt-person-head">
      <button type="button" class="btn-secondary"${act('pdptTeamBack')}>Back to the team</button>
      <h2 class="pdpm-detail-title">${escHtml(r.name)}</h2>
      <span class="ppl-muted-small">${escHtml(r.level)} · Line manager: ${escHtml(r.lmName || '—')}</span>
    </div>${_pdptpTabsHtml()}${_pdptpState.tab === 'goals' ? _pdptpTrackerHtml(d, r) : list}`;
}

// N-440: the person view's two tabs, and the Goals & actions tracker (markup and rules live in pdp-track-ui.js).
function _pdptpTabsHtml() {
  const t = _pdptpState.tab;
  const tab = (key, label) => `<button type="button" class="eng-tab${t === key ? ' eng-tab--active' : ''}" role="tab" aria-selected="${t === key ? 'true' : 'false'}"${act('pdptTab', key)}>${label}</button>`;
  return `<div class="eng-tab-strip pdptr-tabs" role="tablist">${tab('meetings', 'Meetings')}${tab('goals', 'Goals &amp; actions')}</div>`;
}

function _pdptpTrackerHtml(d, r) {
  const t = _pdptpState.tracker;
  if (!t) return dashboardSkeleton(1);
  if (t.error) return emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: 'Could not load goals and actions', message: t.error });
  if (t.none) return emptyStateBlock({ icon: 'lock', title: 'Goals & actions', message: 'Development & Performance is not available to you right now.' });
  pdptrSync({
    personId: r.personId, year: t.year, data: t,
    load: async () => { _pdptpState.tracker = await loadTeamPerson(r.personId, t.year); return _pdptpState.tracker; },
    redraw: _pdptpRedraw,
  });
  return pdptrHtml();
}

// ── run-meeting screen ───────────────────────────────────────────────────────────────────────────
function _pdptpFmtStamp(v) { return v ? pdpFmtDay(localDayISO(new Date(v))) : ''; }

function _pdptpEmployeePrepHtml(v) {
  const m = v.meeting, blocks = pdpPrepBlocks(v.def).employee;
  const prep = pdpPrepFromJson(m.PrepEmployee);
  if (!blocks.length) return '';
  const rows = blocks.map(b => {
    const label = `<div class="pdpm-label">${escHtml(b.label)}</div>`;
    if (b.type === 'goalReview') {
      const saved = prep.goalReview[b.key] || {};
      const items = v.prev.goals.filter(g => saved[String(g.id)]);
      return `<div class="pdpm-block">${label}${_pdpmListHtml(items, g => `<strong>${escHtml(g.Title)}</strong> · ${escHtml(saved[String(g.id)].rag || 'No rating')}${saved[String(g.id)].comment ? ' · ' + escHtml(saved[String(g.id)].comment) : ''}`)}</div>`;
    }
    return `<div class="pdpm-block">${label}${_pdpmTextHtml(prep.answers[b.key] || '')}</div>`;
  }).join('');
  const state = prep.submittedAt ? 'Marked ready ' + pdpFmtDay(localDayISO(new Date(prep.submittedAt))) : 'Not marked ready yet';
  return `<div class="ppl-card pdpm-section"><div class="ppl-card-title">Employee prep</div><p class="ppl-muted-small">${escHtml(state)}</p>${rows}</div>`;
}

function _pdptpPreviousHtml(v, edit) {
  const p = v.prev;
  if (!p.meeting) return '<div class="ppl-card pdpm-section"><div class="ppl-card-title">Since the last meeting</div><div class="ppl-muted-small">First meeting. Nothing carried over.</div></div>';
  const acts = p.actions.length ? `<ul class="pdpm-list">${p.actions.map(a => {
    const done = _pdpmYes(a.IsDone);
    const box = edit ? `<input type="checkbox" aria-label="Done: ${escAttr(a.Title)}"${done ? ' checked' : ''}${actOn('change', 'pdptDone', a.id, ACT_CHECKED)}> ` : (done ? 'Done · ' : '');
    return `<li>${box}${escHtml(a.Title)} · ${escHtml(a.OwnerRole || '')}${a.DueDate ? ' · due ' + escHtml(pdpFmtDay(spDateIn(a.DueDate))) : ''}</li>`;
  }).join('')}</ul>` : '<div class="ppl-muted-small">No actions from earlier meetings.</div>';
  return `<div class="ppl-card pdpm-section"><div class="ppl-card-title">Since the last meeting</div>
    <p class="ppl-muted-small">Last held: ${escHtml(pdpMeetingLabel(p.meeting))}, due ${escHtml(pdpFmtDay(spDateIn(p.meeting.DueDate)))}</p>
    <div class="pdpm-label">Actions</div>${acts}
    <div class="pdpm-label">Open goals</div>${_pdpmListHtml(p.goals, g => `<strong>${escHtml(g.Title)}</strong> · ${escHtml(g.Rag || 'No rating')}`)}</div>`;
}

function _pdptpFieldValue(form, name) { return (form && form.values && form.values[name]) || ''; }

function _pdptpGoalFormHtml(v, form) {
  const val = n => escAttr(_pdptpFieldValue(form, n));
  const cats = CONFIG.PDP.GOAL_CATEGORIES.map(c => `<option value="${escAttr(c)}"${_pdptpFieldValue(form, 'Category') === c ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
  return `<div class="pdpt-form">
    <div class="form-group"><label for="pdpt-g-title">Goal</label><input type="text" id="pdpt-g-title" data-pf="Title" maxlength="250" value="${val('Title')}"></div>
    <div class="form-group"><label for="pdpt-g-cat">Category</label><select id="pdpt-g-cat" data-pf="Category"><option value="">Pick…</option>${cats}</select></div>
    <div class="form-group"><label for="pdpt-g-why">Why it matters</label><textarea id="pdpt-g-why" data-pf="WhyItMatters" rows="2">${escHtml(_pdptpFieldValue(form, 'WhyItMatters'))}</textarea></div>
    <div class="form-group"><label for="pdpt-g-measures">Success measures</label><textarea id="pdpt-g-measures" data-pf="SuccessMeasures" rows="2">${escHtml(_pdptpFieldValue(form, 'SuccessMeasures'))}</textarea></div>
    <div class="form-group"><label for="pdpt-g-date">Target date</label><input type="date" id="pdpt-g-date" data-pf="TargetDate" value="${val('TargetDate')}"></div>
    <div class="form-group"><label for="pdpt-g-support">Support needed</label><textarea id="pdpt-g-support" data-pf="Support" rows="2">${escHtml(_pdptpFieldValue(form, 'Support'))}</textarea></div>
    <div class="pdpm-actions"><button type="button" class="btn-primary"${act('pdptGoalSave')}>Save goal</button><button type="button" class="btn-secondary"${act('pdptFormCancel')}>Cancel</button></div>
  </div>`;
}

function _pdptpActionFormHtml(v, form) {
  const owner = _pdptpFieldValue(form, 'OwnerRole') || 'Employee';
  const opts = CONFIG.PDP.OWNER_ROLES.map(r => `<option value="${escAttr(r)}"${owner === r ? ' selected' : ''}>${escHtml(r)}</option>`).join('');
  return `<div class="pdpt-form">
    <div class="form-group"><label for="pdpt-a-title">Action</label><input type="text" id="pdpt-a-title" data-pf="Title" maxlength="250" value="${escAttr(_pdptpFieldValue(form, 'Title'))}"></div>
    <div class="form-group"><label for="pdpt-a-owner">Owner</label><select id="pdpt-a-owner" data-pf="OwnerRole">${opts}</select></div>
    <div class="form-group"><label for="pdpt-a-due">Due date</label><input type="date" id="pdpt-a-due" data-pf="DueDate" value="${escAttr(_pdptpFieldValue(form, 'DueDate'))}"></div>
    <div class="pdpm-actions"><button type="button" class="btn-primary"${act('pdptActionSave')}>Save action</button><button type="button" class="btn-secondary"${act('pdptFormCancel')}>Cancel</button></div>
  </div>`;
}

function _pdptpGoalsBlockHtml(b, v, ctx) {
  const lim = pdpGoalLimit(v.meeting, v.def) || { min: 0, max: 0 };
  const range = lim.min === lim.max ? String(lim.min) : lim.min + ' to ' + lim.max;
  const rows = v.goals.length ? `<ul class="pdpm-list">${v.goals.map(g => `<li><strong>${escHtml(g.Title)}</strong>${g.Category ? ' · ' + escHtml(g.Category) : ''}${g.TargetDate ? ' · by ' + escHtml(pdpFmtDay(spDateIn(g.TargetDate))) : ''}${ctx.edit ? ` <button type="button" class="pdpt-link"${act('pdptGoalForm', g.id)}>Edit</button> <button type="button" class="pdpt-link"${act('pdptGoalRemove', g.id)}>Remove</button>` : ''}</li>`).join('')}</ul>` : '<div class="ppl-muted-small">No goals recorded yet.</div>';
  const form = ctx.form && ctx.form.kind === 'goal' ? _pdptpGoalFormHtml(v, ctx.form)
    : (ctx.edit && v.goals.length < lim.max ? `<button type="button" class="btn-secondary pdpt-add"${act('pdptGoalForm', 0)}>Add goal</button>` : '');
  return `<div class="pdpm-block"><div class="pdpm-label">${escHtml(b.label)} <span class="pdpm-req">${escHtml(range)} goals</span></div>${rows}${form}</div>`;
}

function _pdptpActionsBlockHtml(b, v, ctx) {
  const lim = pdpActionLimit(v.def) || { max: 0 };
  const rows = v.actions.length ? `<ul class="pdpm-list">${v.actions.map(a => `<li>${escHtml(a.Title)} · ${escHtml(a.OwnerRole || '')}${a.DueDate ? ' · due ' + escHtml(pdpFmtDay(spDateIn(a.DueDate))) : ''}${ctx.edit ? ` <button type="button" class="pdpt-link"${act('pdptActionForm', a.id)}>Edit</button> <button type="button" class="pdpt-link"${act('pdptActionRemove', a.id)}>Remove</button>` : ''}</li>`).join('')}</ul>` : '<div class="ppl-muted-small">No actions recorded yet.</div>';
  const form = ctx.form && ctx.form.kind === 'action' ? _pdptpActionFormHtml(v, ctx.form)
    : (ctx.edit && v.actions.length < lim.max ? `<button type="button" class="btn-secondary pdpt-add"${act('pdptActionForm', 0)}>Add action</button>` : '');
  return `<div class="pdpm-block"><div class="pdpm-label">${escHtml(b.label)} <span class="pdpm-req">up to ${escHtml(lim.max)}</span></div>${rows}${form}</div>`;
}

function _pdptpBlockHtml(b, v, ctx) {
  const hint = b.hint ? `<div class="ppl-muted-small">${escHtml(b.hint)}</div>` : '';
  const label = `<div class="pdpm-label">${escHtml(b.label)}${b.required ? ' <span class="pdpm-req">required</span>' : ''}</div>`;
  if (b.type === 'prepQuestion' && b.by === 'manager') {
    const val = ctx.pm[b.key] || '';
    return ctx.edit
      ? `<div class="pdpm-block">${label}${hint}<textarea rows="4" maxlength="${escAttr(CONFIG.PDP.TEMPLATE_LIMITS.LABEL_MAX * 10)}" data-pm="${escAttr(b.key)}" aria-label="${escAttr(b.label)}">${escHtml(val)}</textarea></div>`
      : `<div class="pdpm-block">${label}${_pdpmTextHtml(val)}</div>`;
  }
  if (b.type === 'prompt') {
    const val = ctx.pn[b.key] || '';
    return ctx.edit
      ? `<div class="pdpm-block">${label}${hint}<textarea rows="5" maxlength="${escAttr(CONFIG.PDP.TEMPLATE_LIMITS.LABEL_MAX * 10)}" data-pn="${escAttr(b.key)}" aria-label="${escAttr(b.label)}">${escHtml(val)}</textarea></div>`
      : `<div class="pdpm-block">${label}${_pdpmTextHtml(val)}</div>`;
  }
  if (b.type === 'goalSet') return _pdptpGoalsBlockHtml(b, v, ctx);
  if (b.type === 'actions') return _pdptpActionsBlockHtml(b, v, ctx);
  if (b.type === 'goalReview' && b.by !== 'employee') return `<div class="pdpm-block">${label}${_pdpmListHtml(v.prev.goals, g => `<strong>${escHtml(g.Title)}</strong> · ${escHtml(g.Rag || 'No rating')}`)}</div>`;
  if (b.type === 'scoring') return pdpasHtml(b.label);   // N-442: blind manager scoring, then the agreed scores (pdp-assess-ui.js)
  return '';   // employee prep blocks are shown in the Employee prep card
}

// The manager-side objects the screen would save right now (null when over the size cap).
function _pdptpPayload(v, draft) {
  try {
    return pdpManagerPayload(v.meeting.PrepManager, v.meeting.MeetingNotes, { prepManager: draft.prepManager, notes: draft.notes }, pdpPrepBlocks(v.def), new Date().toISOString());
  } catch (e) { return null; }
}

function _pdptpSignHtml(v) {
  const m = v.meeting;
  const mine = _pdptpFmtStamp(m.ManagerSignedAt), theirs = _pdptpFmtStamp(m.EmployeeSignedAt);
  const notes = pdpParseJson(m.MeetingNotes) || {};
  const by = mine && notes.managerSignedBy ? ' (' + escHtml(notes.managerSignedBy) + ')' : '';
  return `
    <div class="ppl-card pdpm-sign">
      <div class="ppl-card-title">Sign-off</div>
      <p class="ppl-muted-note">${theirs ? 'The employee signed on ' + escHtml(theirs) + '.' : 'The employee has not signed yet.'} ${mine ? 'Signed on the manager side on ' + escHtml(mine) + by + '.' : 'The manager side has not signed yet.'}</p>
      ${v.canSign ? `<button type="button" class="btn-primary"${act('pdptSign')}>Sign off as manager</button>` : ''}
    </div>`;
}

function _pdptpDetailHtml(v, s) {
  const m = v.meeting;
  const record = m.Status === 'Held' || m.Status === 'SignedOff';
  const head = `
    <div class="pdpm-detail-head">
      <button type="button" class="btn-secondary"${act('pdptTeamBack')}>Back</button>
      <h2 class="pdpm-detail-title">${escHtml(pdpMeetingLabel(m))}</h2>
      <span class="ppl-muted-small">${escHtml(v.person ? v.person.EmployeeName : m.PersonName)} · Due ${escHtml(pdpFmtDay(spDateIn(m.DueDate)))}</span>
      <span class="dh-badge ${_PDPM_STATE_CLASS[pdpMeetingState(m, new Date())] || ''}">${escHtml(m.Status)}</span>
    </div>`;
  if (m.Status === 'Skipped') return head + emptyStateBlock({ icon: 'alert-circle', title: 'Skipped', message: m.SkipReason || 'This meeting was skipped.' });
  if (!v.def || !Array.isArray(v.def.sections)) return head + emptyStateBlock({ icon: 'file-text', title: 'Template unavailable', message: 'Contact People Ops: this meeting has no readable template.' });
  const draft = s.draft || { prepManager: {}, notes: {}, meetingDate: '' };
  const edit = !!v.run && !v.readOnly;
  if (pdpHasScoringBlock(v.def)) pdpasSync({ meetingId: m.id, readOnly: v.readOnly, redraw: _pdptpRedraw });   // N-442
  const ctx = { edit, form: s.form, pm: draft.prepManager, pn: draft.notes };
  const sections = v.def.sections.map(sec => {
    const body = (sec.blocks || []).map(b => _pdptpBlockHtml(b, v, ctx)).join('');
    return body ? `<div class="ppl-card pdpm-section"><div class="ppl-card-title">${escHtml(sec.title)}</div>${body}</div>` : '';
  }).join('');
  let note = '';
  if (v.readOnly) note = '<p class="ppl-muted-note pdpt-note">You are previewing this page, so nothing here can be saved or signed.</p>';
  else if (!v.access.run) note = '<p class="ppl-muted-note pdpt-note">You can view this record, but you are not this person’s line manager or CSD, so it is read-only.</p>';
  else if (v.lock === 'signed') note = '<p class="ppl-muted-note pdpt-note">Signed, so this record is locked.</p>';
  const payload = edit && m.Status !== 'Held' ? _pdptpPayload(v, draft) : null;
  const check = payload ? _pdptpHeldCheck(v, payload, draft) : null;
  const todo = check && check.problems.length ? `<div class="ppl-card pdpt-todo"><div class="ppl-card-title">Before you can mark this as held</div><ul class="pdpm-list">${check.problems.map(p => `<li>${escHtml(p)}</li>`).join('')}</ul></div>` : '';
  const details = edit ? `<div class="ppl-card pdpm-section"><div class="ppl-card-title">Meeting details</div><div class="form-group"><label for="pdpt-md">Meeting date</label><input type="date" id="pdpt-md" value="${escAttr(draft.meetingDate)}"></div></div>` : '';
  const buttons = edit ? `
    <div class="pdpm-actions">
      <button type="button" class="btn-secondary"${act('pdptTeamSave')}>Save draft</button>
      ${m.Status !== 'Held' ? `<button type="button" class="btn-primary"${act('pdptHeld')}>Mark as held</button>` : ''}
    </div>` : '';
  return `<div id="pdpt-detail"${actOn('input', 'pdptTeamDirty')}${actOn('change', 'pdptTeamDirty')}>${head}${note}${_pdptpEmployeePrepHtml(v)}${_pdptpPreviousHtml(v, edit)}${sections}${details}${todo}${buttons}${record ? _pdptpSignHtml(v) : ''}</div>`;
}

// pdpHeldCheck plus, for a scorable Bi-Annual, what the scores still need (N-442, pdpAssessHeldProblems).
function _pdptpHeldCheck(v, payload, draft) {
  const check = pdpHeldCheck(v.meeting, v.def, payload.prepManager, payload.notes, v.allGoals, v.allActions, draft.meetingDate, new Date());
  const extra = pdpHasScoringBlock(v.def) ? pdpasHeldProblems() : [];
  return { ok: check.ok && !extra.length, problems: check.problems.concat(extra), warnings: check.warnings };
}

// ── actions ──────────────────────────────────────────────────────────────────────────────────────
function _pdptpStash() {
  const s = _pdptpState, root = document.getElementById('pdpt-detail');
  if (!root || !s.draft) return;
  root.querySelectorAll('[data-pm]').forEach(el => { s.draft.prepManager[el.getAttribute('data-pm')] = el.value; });
  root.querySelectorAll('[data-pn]').forEach(el => { s.draft.notes[el.getAttribute('data-pn')] = el.value; });
  const md = document.getElementById('pdpt-md');
  if (md) s.draft.meetingDate = md.value;
  if (s.form) root.querySelectorAll('[data-pf]').forEach(el => { s.form.values[el.getAttribute('data-pf')] = el.value; });
}

function pdptTeamDirty() { _pdptpState.dirty = true; _pdptpStash(); }

async function _pdptpConfirmLeave(what) {
  if (!_pdptpState.dirty && !pdpasIsDirty()) return true;
  return confirmModal({ title: 'Discard changes?', message: 'You have unsaved changes. ' + what + ' discards them.', confirmLabel: 'Discard' });
}

async function pdptYear(value) {
  if (!(await _pdptpConfirmLeave('Switching year'))) { _pdptpRedraw(); return; }
  Object.assign(_pdptpState, { dirty: false, openId: null, personId: null, year: Number(value), tab: 'meetings', tracker: null });
  pdptrReset();
  document.getElementById('main-content').innerHTML = dashboardSkeleton(2);
  await _pdptpLoadList();
}

async function pdptView(value) {
  Object.assign(_pdptpState, { view: String(value), personId: null, tab: 'meetings', tracker: null });
  pdptrReset();
  document.getElementById('main-content').innerHTML = dashboardSkeleton(2);
  await _pdptpLoadList();
}

function pdptPerson(id) {
  Object.assign(_pdptpState, { personId: id, tab: 'meetings', tracker: null });
  pdptrReset();
  _pdptpRedraw();
}

async function _pdptpLoadTracker() {
  const s = _pdptpState;
  try {
    s.tracker = await loadTeamPerson(s.personId, s.list && s.list.year);
  } catch (e) {
    console.error('Team Development: goals and actions load failed', e);
    s.tracker = { error: e.message };
  }
  _pdptpRedraw();
}

// N-440: switch between a person's Meetings and Goals & actions. An open goal / action form is confirmed away first.
async function pdptTab(tab) {
  const s = _pdptpState, next = tab === 'goals' ? 'goals' : 'meetings';
  if (next === s.tab) return;
  if (pdptrIsDirty() && !(await confirmModal({ title: 'Discard changes?', message: 'You have an unsaved goal or action. Switching tabs discards it.', confirmLabel: 'Discard' }))) return;
  Object.assign(s, { tab: next, tracker: null });
  pdptrReset();
  _pdptpRedraw();
  if (next === 'goals') await _pdptpLoadTracker();
}

async function _pdptpLoadDetail(id, keepDraft) {
  const s = _pdptpState;
  const v = await loadTeamMeeting(id);
  s.detail = v;
  if (!keepDraft || !s.draft) {
    const rec = pdpMyAgreedRecord(v.meeting, [], []);
    s.draft = { prepManager: Object.assign({}, rec.managerPrep), notes: Object.assign({}, rec.answers), meetingDate: spDateIn(v.meeting.MeetingDate) || '' };
  }
}

async function pdptOpen(id) {
  const s = _pdptpState;
  if (s.busy) return;
  document.getElementById('main-content').innerHTML = dashboardSkeleton(2);
  try {
    Object.assign(s, { openId: id, dirty: false, form: null, draft: null });
    pdpasReset();   // N-442: the scoring block reloads for this meeting
    await _pdptpLoadDetail(id, false);
  } catch (e) {
    console.error('Team Development: meeting load failed', e);
    toast(e.message, { type: 'error' });
    Object.assign(s, { openId: null, detail: null });
  }
  _pdptpRedraw();
}

async function pdptTeamBack() {
  const s = _pdptpState;
  if (s.openId != null) {
    if (!(await _pdptpConfirmLeave('Going back'))) return;
    Object.assign(s, { openId: null, detail: null, draft: null, form: null, dirty: false });
    pdpasReset();
    document.getElementById('main-content').innerHTML = dashboardSkeleton(2);
    await _pdptpLoadList();
    return;
  }
  if (pdptrIsDirty() && !(await confirmModal({ title: 'Discard changes?', message: 'You have an unsaved goal or action. Going back discards it.', confirmLabel: 'Discard' }))) return;
  Object.assign(s, { personId: null, tab: 'meetings', tracker: null });
  pdptrReset();
  _pdptpRedraw();
}

// Runs one write, then reloads the open meeting (keeping what is being typed) and redraws.
async function _pdptpRun(fn, okText, keepDirty) {
  const s = _pdptpState;
  if (s.busy || s.openId == null) return false;
  s.busy = true;
  let ok = false;
  try {
    await fn();
    if (okText) toast(okText, { type: 'success' });
    if (!keepDirty) s.dirty = false;
    await _pdptpLoadDetail(s.openId, true);
    ok = true;
  } catch (e) {
    console.error('Team Development: write failed', e);
    toast(e.message, { type: 'error' });
  }
  s.busy = false;
  _pdptpRedraw();
  return ok;
}

function _pdptpEdit() {
  const d = _pdptpState.draft;
  return { prepManager: d.prepManager, notes: d.notes, meetingDate: d.meetingDate };
}

async function pdptTeamSave() {
  _pdptpStash();
  await _pdptpRun(() => saveTeamMeeting(_pdptpState.openId, _pdptpEdit()), 'Draft saved.', false);
}

async function pdptHeld() {
  const s = _pdptpState;
  _pdptpStash();
  const v = s.detail, payload = _pdptpPayload(v, s.draft);
  if (!payload) { toast('Your notes are too long to save. Shorten them.', { type: 'error' }); return; }
  const check = _pdptpHeldCheck(v, payload, s.draft);
  if (!check.ok) { toast(check.problems.join(' '), { type: 'error' }); _pdptpRedraw(); return; }
  const message = (check.warnings.length ? check.warnings.join(' ') + ' ' : '') + 'You can keep editing the notes until someone signs.';
  if (!(await confirmModal({ title: 'Mark this meeting as held', message, confirmLabel: 'Mark as held' }))) return;
  if (await _pdptpRun(() => markPdpHeld(s.openId, _pdptpEdit()), 'Marked as held.', false)) pdpasReload();   // N-442: reload the scores as Held
}

async function pdptSign() {
  const s = _pdptpState;
  if (!(await confirmModal({ title: 'Sign off this record', message: 'You are confirming the agreed record is accurate. The record locks and this cannot be undone.', confirmLabel: 'Sign off' }))) return;
  if (await _pdptpRun(() => signOffPdpAsManager(s.openId), 'Signed off.', false)) pdpasReload();   // N-442: the agreed scores lock
}

async function pdptSetDate(id) {
  const el = document.getElementById('pdpt-qd-' + id);
  const day = el ? el.value : '';
  if (!day) { toast('Pick a date first.', { type: 'error' }); return; }
  try {
    await setPdpMeetingDate(id, day);
    toast('Meeting date saved.', { type: 'success' });
    await _pdptpLoadList();
  } catch (e) {
    console.error('Team Development: date save failed', e);
    toast(e.message, { type: 'error' });
  }
}

function _pdptpFormFor(kind, id) {
  const v = _pdptpState.detail;
  const values = {};
  if (id) {
    const it = (kind === 'goal' ? v.goals : v.actions).find(x => String(x.id) === String(id));
    if (it) {
      ['Title', 'Category', 'WhyItMatters', 'SuccessMeasures', 'Support', 'OwnerRole'].forEach(k => { if (it[k]) values[k] = it[k]; });
      if (it.TargetDate) values.TargetDate = spDateIn(it.TargetDate);
      if (it.DueDate) values.DueDate = spDateIn(it.DueDate);
    }
  }
  return { kind, id: id || null, values };
}

function pdptGoalForm(id)   { _pdptpStash(); _pdptpState.form = _pdptpFormFor('goal', id);   _pdptpRedraw(); }
function pdptActionForm(id) { _pdptpStash(); _pdptpState.form = _pdptpFormFor('action', id); _pdptpRedraw(); }
function pdptFormCancel()   { _pdptpStash(); _pdptpState.form = null; _pdptpRedraw(); }

async function pdptGoalSave() {
  const s = _pdptpState;
  _pdptpStash();
  const f = s.form;
  if (!f) return;
  const ok = await _pdptpRun(() => saveTeamGoal(s.openId, Object.assign({ id: f.id }, f.values)), 'Goal saved.', true);
  if (ok) s.form = null;
  _pdptpRedraw();
}

async function pdptActionSave() {
  const s = _pdptpState;
  _pdptpStash();
  const f = s.form;
  if (!f) return;
  const ok = await _pdptpRun(() => saveTeamAction(s.openId, Object.assign({ OwnerRole: 'Employee', id: f.id }, f.values)), 'Action saved.', true);
  if (ok) s.form = null;
  _pdptpRedraw();
}

async function _pdptpRemove(kind, id) {
  const s = _pdptpState;
  _pdptpStash();
  if (!(await confirmModal({ title: 'Remove this ' + kind + '?', message: 'It was recorded in this meeting, so it is deleted for good.', confirmLabel: 'Remove', danger: true }))) return;
  await _pdptpRun(() => removeTeamItem(s.openId, kind, id), 'Removed.', true);
}

function pdptGoalRemove(id)   { return _pdptpRemove('goal', id); }
function pdptActionRemove(id) { return _pdptpRemove('action', id); }

async function pdptDone(id, checked) {
  _pdptpStash();
  await _pdptpRun(() => setTeamActionDone(_pdptpState.openId, id, !!checked), '', true);
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  pdptYear,
  pdptView,
  pdptPerson,
  pdptOpen,
  pdptTeamBack,
  pdptTeamDirty,
  pdptTeamSave,
  pdptHeld,
  pdptSign,
  pdptSetDate,
  pdptGoalForm,
  pdptActionForm,
  pdptFormCancel,
  pdptGoalSave,
  pdptActionSave,
  pdptGoalRemove,
  pdptActionRemove,
  pdptDone,
  pdptTab,
});