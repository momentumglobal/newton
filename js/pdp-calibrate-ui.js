// js/pdp-calibrate-ui.js — People > PDP Setup > Calibration (N-443 / PDP-11)
//
// The calibration panel (Admin + People Ops, D1): pick a cycle year, see the band distribution against target
// (warn only, D2), work through the held Bi-Annual reviews — panel cases first — set calibrated scores with a
// written reason, and lock each person's ratings (D3; an Admin can unlock with a reason). pdp-setup.js owns the
// page and calls pdpclTabHtml() for the tab. Rules are pure in pdp-calibrate.js; every read / write is a function
// in api-pdp.js (loadPdpCalibration / savePdpCalibration / lockPdpRatings / lockPdpNonPanel / unlockPdpRatings).
// Names no PDP list. Loaded only on people.html (after pdp-assess-ui.js, before pdp-setup.js), never by
// mobile.html, Newton for Claude or the Command Bar.

let _pdpclState = {
  year:     0,
  data:     null,    // loadPdpCalibration() result
  loading:  false,
  error:    '',
  filter:   '',      // '' = all, else a CASE_STATES value
  openId:   null,    // meeting id of the case being edited
  draft:    null,    // { scores: { key: { score, rationale } }, boundaryBand }
  dirty:    false,
  busy:     false,
  progress: '',
};

const _PDPCL_STATE_TEXT = { needsPanel: 'Needs panel', ready: 'Ready to lock', locked: 'Locked', released: 'Released' };
const _PDPCL_STATE_CLASS = { needsPanel: 'dh-badge-warn', locked: 'dh-badge-success', released: 'dh-badge-success' };
const _PDPCL_REASON_TEXT = { boundary: 'Boundary', Below: 'Below overall', Exceeding: 'Exceeding overall' };
const _PDPCL_SCORE_TEXT = { 1: 'Below', 2: 'Meets', 3: 'Exceeding' };

function pdpclReset() {
  Object.assign(_pdpclState, { data: null, loading: false, error: '', openId: null, draft: null, dirty: false, busy: false, progress: '' });
}

function pdpclIsDirty() { return _pdpclState.dirty; }

// The years offered: last year (a Bi-Annual is calibrated in the year it is held) plus the Cycle tab's years.
function _pdpclYears() {
  const ys = pdpCycleYears(new Date());
  return [ys[0] - 1].concat(ys);
}

// Called by pdp-setup.js. Draws the tab from _pdpclState and loads the year the first time.
function pdpclTabHtml() {
  const years = _pdpclYears();
  if (!years.includes(_pdpclState.year)) { _pdpclState.year = years[1]; _pdpclState.data = null; _pdpclState.error = ''; }
  if (!_pdpclState.data && !_pdpclState.loading && !_pdpclState.error) setTimeout(() => pdpclRefresh(), 0);
  const options = years.map(y => `<option value="${escAttr(y)}"${y === _pdpclState.year ? ' selected' : ''}>${escHtml(y)}</option>`).join('');
  return `
    <div class="pdpcl">
      <div class="pdps-toolbar">
        <div class="form-group pdps-set">
          <label for="pdpcl-year">Cycle year</label>
          <select id="pdpcl-year"${actOn('change', 'pdpclYear', ACT_VALUE)}>${options}</select>
        </div>
        <div class="pdpc-actions"><button type="button" class="btn-secondary"${act('pdpclRefresh')}>Refresh</button></div>
      </div>
      <p class="ppl-muted-note pdps-note">Every held Bi-Annual review of the year. Panel cases (a 2-point gap, an escalated boundary total, or anyone Below or Exceeding overall) can be adjusted, with a written reason. Everyone else locks at their agreed scores. The line manager releases the result to the employee once it is locked.</p>
      <p class="ppl-muted-small pdpc-progress" aria-live="polite">${escHtml(_pdpclState.progress)}</p>
      ${_pdpclBodyHtml()}
    </div>`;
}

function _pdpclBodyHtml() {
  const s = _pdpclState;
  if (s.loading) return dashboardSkeleton(2);
  if (s.error) return emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: 'Could not load calibration', message: s.error });
  const d = s.data;
  if (!d) return '';
  if (!d.cases.length) {
    return _pdpclDistHtml(d) + emptyStateBlock({ icon: 'inbox', title: 'Nothing to calibrate', message: `No Bi-Annual reviews held for ${d.year} yet.` });
  }
  return _pdpclDistHtml(d) + _pdpclTableHtml(d) + (s.openId != null ? _pdpclEditorHtml(d) : '');
}

// The distribution strip: per band count, %, target and an in / out chip (warn only, D2).
function _pdpclDistHtml(d) {
  const x = d.distribution, T = CONFIG.PDP.CALIBRATION.DISTRIBUTION;
  const cells = CONFIG.PDP.BANDS.map(b => {
    const chip = x.inRange[b] == null ? '' : (x.inRange[b] ? '<span class="dh-badge dh-badge-success">In range</span>' : '<span class="dh-badge dh-badge-warn">Outside target</span>');
    return `<div class="pdpcl-dist-cell">
      <div class="pdpm-label">${escHtml(b)}</div>
      <div class="pdpcl-dist-num">${escHtml(x.counts[b])}${x.pct[b] == null ? '' : ' · ' + escHtml(x.pct[b]) + '%'}</div>
      <div class="ppl-muted-small">Target ${escHtml(T[b][0])}–${escHtml(T[b][1])}%</div>${chip}</div>`;
  }).join('');
  const extra = `<div class="pdpcl-dist-cell"><div class="pdpm-label">Other</div><div class="ppl-muted-small">Pending: ${escHtml(x.pending)} · Not yet held: ${escHtml(x.notHeld)} · Total held: ${escHtml(x.total)}</div></div>`;
  const warn = !x.banded ? '<p class="ppl-muted-small">Not enough results yet.</p>'
    : (x.outOfRange.length ? '<p class="pdpcl-warn">Outside the target distribution — check before locking.</p>' : '');
  return `<div class="ppl-card pdpcl-dist"><div class="ppl-card-title">Distribution</div><div class="pdpcl-dist-row">${cells}${extra}</div>${warn}</div>`;
}

function _pdpclReasonsHtml(c) {
  if (!c.panel.length) return '<span class="ppl-muted-small">—</span>';
  return c.panel.map(r => `<span class="dh-badge dh-badge-warn">${escHtml(r.kind === 'gap' ? (c.names[r.key] || r.key) + ' gap' : _PDPCL_REASON_TEXT[r.kind])}</span>`).join(' ');
}

function _pdpclAgreedText(c) {
  if (c.overall.pending) return 'Pending';
  return c.overall.total + (c.agreedBand ? ' · ' + c.agreedBand : '');
}

function _pdpclTableHtml(d) {
  const s = _pdpclState;
  const states = CONFIG.PDP.CALIBRATION.CASE_STATES;
  const counts = {};
  states.forEach(st => { counts[st] = d.cases.filter(c => c.state === st).length; });
  const filterOpts = [{ value: '', label: 'All (' + d.cases.length + ')' }].concat(states.map(st => ({ value: st, label: _PDPCL_STATE_TEXT[st] + ' (' + counts[st] + ')' })))
    .map(o => `<option value="${escAttr(o.value)}"${o.value === s.filter ? ' selected' : ''}>${escHtml(o.label)}</option>`).join('');
  const rows = d.cases.filter(c => !s.filter || c.state === s.filter).map(c => {
    const m = c.meeting;
    const final = c.calibration.final && (c.state === 'locked' || c.state === 'released') ? ' → ' + c.calibration.final.total + ' · ' + c.calibration.final.band : '';
    return `<tr${String(c.id) === String(s.openId) ? ' class="pdpcl-open"' : ''}>
      <td>${escHtml(c.name || m.PersonEmail)}</td>
      <td>${escHtml(c.levelKey)}</td>
      <td>${escHtml(m.LineManagerEmail || '')}</td>
      <td>${escHtml(m.CSDEmail || '')}</td>
      <td>${escHtml(_pdpclAgreedText(c) + final)}</td>
      <td>${_pdpclReasonsHtml(c)}</td>
      <td><span class="dh-badge ${_PDPCL_STATE_CLASS[c.state] || ''}">${escHtml(_PDPCL_STATE_TEXT[c.state])}</span></td>
      <td><button type="button" class="pdpt-link"${act('pdpclOpen', String(c.id))}>${c.state === 'needsPanel' ? 'Calibrate' : 'Open'}</button></td>
    </tr>`;
  }).join('');
  const lockAll = !d.readOnly && counts.ready
    ? `<button type="button" class="btn-secondary"${act('pdpclLockAll')}>Lock all non-panel cases (${escHtml(counts.ready)})</button>` : '';
  return `<div class="pdps-toolbar">
      <div class="form-group pdps-set"><label for="pdpcl-filter">Show</label><select id="pdpcl-filter"${actOn('change', 'pdpclFilter', ACT_VALUE)}>${filterOpts}</select></div>
      <div class="pdpc-actions">${lockAll}</div>
    </div>
    <div class="pdpas-table-wrap"><table class="data-table pdps-table pdpcl-table">
      <thead><tr><th scope="col">Person</th><th scope="col">Level</th><th scope="col">Line manager</th><th scope="col">CSD</th><th scope="col">Agreed overall</th><th scope="col">Panel reasons</th><th scope="col">State</th><th scope="col">Action</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="ppl-muted-small">No cases in this view.</td></tr>'}</tbody>
    </table></div>`;
}

function _pdpclOpenCase() {
  const s = _pdpclState;
  return s.data ? s.data.cases.find(c => String(c.id) === String(s.openId)) || null : null;
}

function _pdpclDraftFrom(c) {
  const scores = {};
  CONFIG.PDP.PILLAR_KEYS.forEach(k => {
    const r = c.bySource.Agreed[k] || {};
    const cal = r.CalibratedScore == null || r.CalibratedScore === '' ? (c.agreed[k] == null ? '' : c.agreed[k]) : r.CalibratedScore;
    scores[k] = { score: cal === '' ? '' : String(cal), rationale: r.CalibrationRationale || '' };
  });
  const f = c.calibration.final;
  return { scores, boundaryBand: (f && f.boundaryBand) || '' };
}

function _pdpclScoreText(n) { return n == null || n === '' ? '—' : n + ' · ' + (_PDPCL_SCORE_TEXT[n] || ''); }

// The case editor: per pillar self, manager, agreed, gap and the calibrated score with its reason.
function _pdpclEditorHtml(d) {
  const s = _pdpclState, c = _pdpclOpenCase();
  if (!c) return '';
  if (!s.draft) s.draft = _pdpclDraftFrom(c);
  const own = pdpEmail(c.meeting.PersonEmail) === d.me;
  const locked = c.state === 'locked' || c.state === 'released';
  const edit = !d.readOnly && !locked && c.isPanel && !own;
  const max = CONFIG.PDP.ASSESS.RATIONALE_MAX;
  const scoreOpts = cur => [1, 2, 3].map(n => `<option value="${n}"${String(n) === String(cur) ? ' selected' : ''}>${escHtml(_pdpclScoreText(n))}</option>`).join('');
  const rows = (c.set ? c.set.pillars : []).map(p => {
    const cmp = c.compare.find(x => x.key === p.key) || {};
    const ag = c.bySource.Agreed[p.key] || {};
    const cur = s.draft.scores[p.key] || { score: '', rationale: '' };
    const calCell = edit
      ? `<select data-pcl-score="${escAttr(p.key)}" aria-label="Calibrated score for ${escAttr(p.name)}"${actOn('change', 'pdpclScore.stop')}><option value="">Score…</option>${scoreOpts(cur.score)}</select>
         <textarea rows="2" maxlength="${escAttr(max)}" data-pcl-why="${escAttr(p.key)}" aria-label="Reason for ${escAttr(p.name)}" placeholder="Reason (needed when it differs from the agreed score)">${escHtml(cur.rationale)}</textarea>`
      : `<span class="dh-badge">${escHtml(_pdpclScoreText(cur.score))}</span>${cur.rationale ? _pdpmTextHtml(cur.rationale) : ''}`;
    return `<tr>
      <th scope="row">${escHtml(p.order + '. ' + p.name)}${_pdpasDescriptorsHtml(p)}</th>
      <td>${escHtml(_pdpclScoreText(cmp.self))}</td>
      <td>${escHtml(_pdpclScoreText(cmp.manager))}</td>
      <td>${escHtml(cmp.kind === 'escalate' ? 'Escalated' : _pdpclScoreText(c.agreed[p.key]))}${ag.Rationale ? _pdpmTextHtml(ag.Rationale) : ''}</td>
      <td>${calCell}</td>
    </tr>`;
  }).join('');
  const plan = pdpCalibratedPlan(c, { scores: s.draft.scores, boundaryBand: s.draft.boundaryBand || undefined });
  const fo = plan.final;
  const overall = fo.pending ? 'Pending — set every calibrated score' : fo.total + (fo.band ? ' · ' + fo.band : '');
  const band = fo.boundary && edit
    ? `<div class="form-group pdpas-field"><label for="pdpcl-band">The total sits on a band boundary — final rating</label>
        <select id="pdpcl-band" data-pcl-band="1"${actOn('change', 'pdpclScore.stop')}><option value="">Choose…</option>${fo.boundary.map(b => `<option value="${escAttr(b)}"${b === fo.band ? ' selected' : ''}>${escHtml(b)}</option>`).join('')}</select></div>`
    : '';
  const notes = [];
  if (own) notes.push('This is your own review: someone else on the panel calibrates it.');
  else if (!c.isPanel && !locked) notes.push('Not a panel case: it locks at the agreed scores.');
  if (d.readOnly) notes.push('Read-only.');
  const open = !edit || !plan.problems.length ? '' : `<div class="pdpt-problems">Still to do before locking: ${escHtml(plan.problems.join(' '))}</div>`;
  let actions = '';
  if (!d.readOnly && !own) {
    if (!locked) {
      actions = (edit ? `<button type="button" class="btn-secondary"${act('pdpclSave')}>Save draft</button>` : '') +
        `<button type="button" class="btn-primary"${act('pdpclLock')}>Lock ratings</button>`;
    } else if (d.canUnlock) {
      actions = `<textarea rows="2" maxlength="${escAttr(CONFIG.PDP.ASSESS.NOTE_MAX)}" id="pdpcl-unlock-why" aria-label="Reason for unlocking" placeholder="Reason for unlocking (required, logged)"></textarea>
        <button type="button" class="btn-secondary"${act('pdpclUnlock')}>Unlock</button>`;
    }
  }
  const log = c.calibration.log.slice(-5).reverse().map(l => `<li>${escHtml(l.action)} · ${escHtml(l.by || '')} · ${escHtml(l.at ? pdpFmtDay(localDayISO(new Date(l.at))) : '')}${l.reason ? ' — ' + escHtml(l.reason) : ''}</li>`).join('');
  return `<div class="ppl-card pdpcl-editor" id="pdpcl-editor"${actOn('input', 'pdpclInput.stop')}>
    <div class="pdps-toolbar"><div class="ppl-card-title">${escHtml(c.name || c.meeting.PersonEmail)} · ${escHtml(c.levelKey)}</div>
      <div class="pdpc-actions"><button type="button" class="pdpt-link"${act('pdpclClose')}>Close</button></div></div>
    ${notes.length ? '<p class="ppl-muted-note">' + escHtml(notes.join(' ')) + '</p>' : ''}
    <div class="pdpas-table-wrap"><table class="pdpas-table">
      <thead><tr><th scope="col">Pillar</th><th scope="col">Self</th><th scope="col">Manager</th><th scope="col">Agreed</th><th scope="col">Calibrated</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="pdpas-overall"><span class="pdpm-label">Final overall</span> <strong>${escHtml(overall)}</strong></div>
    ${band}${open}
    <div class="pdpm-actions">${actions}</div>
    ${log ? '<details class="pdpas-desc"><summary>History</summary><ul class="pdpc-list">' + log + '</ul></details>' : ''}
  </div>`;
}

function _pdpclRedraw() {
  const tab = document.querySelector('.pdpcl');
  if (!tab) return;
  tab.outerHTML = pdpclTabHtml();
  lucide.createIcons();
}

function _pdpclStash() {
  const s = _pdpclState, root = document.getElementById('pdpcl-editor');
  if (!root || !s.draft) return;
  root.querySelectorAll('[data-pcl-score]').forEach(el => { s.draft.scores[el.getAttribute('data-pcl-score')].score = el.value; });
  root.querySelectorAll('[data-pcl-why]').forEach(el => { s.draft.scores[el.getAttribute('data-pcl-why')].rationale = el.value; });
  const b = root.querySelector('[data-pcl-band]');
  if (b) s.draft.boundaryBand = b.value;
}

function _pdpclEdit() {
  const d = _pdpclState.draft;
  return { scores: d.scores, boundaryBand: d.boundaryBand || undefined };
}

async function _pdpclConfirmLeave() {
  if (!_pdpclState.dirty) return true;
  return confirmModal({ title: 'Discard changes?', message: 'You have unsaved calibrated scores. Leaving discards them.', confirmLabel: 'Discard' });
}

async function pdpclRefresh() {
  const s = _pdpclState;
  if (s.busy || s.loading) return;
  s.loading = true;
  s.error = '';
  _pdpclRedraw();
  try {
    s.data = await loadPdpCalibration(s.year);
  } catch (e) {
    console.error('PDP calibration load failed:', e);
    s.data = null;
    s.error = e.message;
  }
  s.loading = false;
  if (s.openId != null && !_pdpclOpenCase()) { s.openId = null; s.draft = null; s.dirty = false; }
  _pdpclRedraw();
}

async function pdpclYear(value) {
  const y = Number(value);
  if (_pdpclState.busy || y === _pdpclState.year) return;
  if (!(await _pdpclConfirmLeave())) { _pdpclRedraw(); return; }
  Object.assign(_pdpclState, { year: y, data: null, error: '', openId: null, draft: null, dirty: false, progress: '' });
  await pdpclRefresh();
}

function pdpclFilter(value) { _pdpclState.filter = value || ''; _pdpclRedraw(); }

async function pdpclOpen(id) {
  if (_pdpclState.busy || String(id) === String(_pdpclState.openId)) return;
  if (!(await _pdpclConfirmLeave())) return;
  Object.assign(_pdpclState, { openId: id, draft: null, dirty: false });
  _pdpclRedraw();
}

async function pdpclClose() {
  if (!(await _pdpclConfirmLeave())) return;
  Object.assign(_pdpclState, { openId: null, draft: null, dirty: false });
  _pdpclRedraw();
}

function pdpclInput() { _pdpclState.dirty = true; _pdpclStash(); }

// A score or boundary pick redraws the editor so the final overall and any boundary choice follow it.
function pdpclScore() { _pdpclState.dirty = true; _pdpclStash(); _pdpclRedraw(); }

async function _pdpclRun(fn, okText, confirm) {
  const s = _pdpclState;
  if (s.busy) return;
  _pdpclStash();
  if (confirm && !(await confirmModal(confirm))) return;
  s.busy = true;
  _pdpsLock(true);
  try {
    const res = await fn();
    const open = res && Array.isArray(res.problems) ? res.problems : [];
    toast(okText + (open.length ? ' Still to do: ' + open.join(' ') : ''), { type: open.length ? 'info' : 'success' });
    s.dirty = false;
    s.draft = null;
  } catch (e) {
    console.error('PDP calibration write failed:', e);
    toast(e.message, { type: 'error' });
  }
  s.busy = false;
  _pdpsLock(false);
  await pdpclRefresh();
}

function pdpclSave() {
  const id = _pdpclState.openId;
  if (id == null) return;
  return _pdpclRun(() => savePdpCalibration(id, _pdpclEdit()), 'Calibration saved as a draft.', null);
}

function pdpclLock() {
  const id = _pdpclState.openId;
  if (id == null) return;
  return _pdpclRun(() => lockPdpRatings(id, _pdpclEdit()), 'Ratings locked.',
    { title: 'Lock ratings', message: 'Ratings will be final. Only an Admin can unlock them.', confirmLabel: 'Lock ratings' });
}

function pdpclUnlock() {
  const id = _pdpclState.openId;
  if (id == null) return;
  const el = document.getElementById('pdpcl-unlock-why');
  const reason = el ? el.value : '';
  return _pdpclRun(() => unlockPdpRatings(id, reason), 'Ratings unlocked. The employee no longer sees them until they are released again.',
    { title: 'Unlock ratings', message: 'This reopens the ratings and withdraws any release to the employee.', confirmLabel: 'Unlock' });
}

async function pdpclLockAll() {
  const s = _pdpclState;
  const d = s.data;
  if (s.busy || !d) return;
  const n = d.cases.filter(c => c.state === 'ready').length;
  if (!n) return;
  const ok = await confirmModal({ title: 'Lock all non-panel cases', message: 'Lock ' + _pdpcPlural(n, 'person’s', 'people’s') + ' ratings at their agreed scores? Panel cases are left alone.', confirmLabel: 'Lock all' });
  if (!ok) return;
  s.busy = true;
  _pdpsLock(true);
  try {
    const r = await lockPdpNonPanel(s.year, (done, total) => {
      s.progress = 'Locking ' + done.toLocaleString('en-GB') + ' of ' + total.toLocaleString('en-GB') + '…';
      const el = document.querySelector('.pdpcl .pdpc-progress');
      if (el) el.textContent = s.progress;
    });
    s.progress = 'Locked ' + _pdpcPlural(r.locked, 'person', 'people') + (r.skipped.length ? '; skipped ' + r.skipped.map(x => x.name + ' (' + x.problem + ')').join('; ') : '') + '.';
    toast(s.progress, { type: r.skipped.length ? 'info' : 'success' });
  } catch (e) {
    console.error('PDP lock all failed:', e);
    s.progress = e.message;
    toast(e.message, { type: 'error' });
  }
  s.busy = false;
  _pdpsLock(false);
  await pdpclRefresh();
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  pdpclRefresh,
  pdpclYear,
  pdpclFilter,
  pdpclOpen,
  pdpclClose,
  pdpclInput,
  pdpclScore,
  pdpclSave,
  pdpclLock,
  pdpclUnlock,
  pdpclLockAll,
});
