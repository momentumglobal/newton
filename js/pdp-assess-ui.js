// js/pdp-assess-ui.js — Bi-Annual scoring block markup + handlers (N-442 / PDP-10)
//
// One scoring block, shared by People > My Development (the employee: self-assessment) and People > Team
// Development (the line manager / CSD: blind assessment, then the agreed scores, boundary, readiness and the L4
// manager-track flag). The host page calls pdpasSync(ctx) while it draws a meeting and puts pdpasHtml() where the
// template's `scoring` block sits. Rules are pure in pdp-assess.js; every read / write is a function in api-pdp.js
// (loadPdpAssessment / savePdpSelfScores / savePdpManagerScores / savePdpAgreed). Names no PDP list. Loaded only on
// people.html (after pdp-track-ui.js, before pdp-my.js), never by mobile.html, Newton for Claude or the Command Bar.
//
// ctx = { meetingId, readOnly, redraw }   redraw() -> the host redraws, which calls pdpasSync + pdpasHtml again.
//
// N-443 (PDP-11): after the calibration panel locks the ratings, the line manager / CSD releases them here
// (releasePdpRatings); the employee then sees the final overall, band, pillar scores and development pointers
// (pdpResultView). Calibrated values are never drawn for the employee before release.

let _pdpasState = { ctx: null, view: null, loading: false, error: '', draft: null, busy: false, dirty: false };

const _PDPAS_SCORE_TEXT = { 1: 'Below', 2: 'Meets', 3: 'Exceeding' };
const _PDPAS_GAP_CLASS = { agree: 'dh-badge-success', managerCall: 'dh-badge-warn', escalate: 'dh-badge-danger' };
const _PDPAS_GAP_TEXT = { agree: 'Agreed', managerCall: '1-point gap · manager’s call', escalate: '2-point gap · calibration panel' };
const _PDPAS_PANEL_TEXT = { boundary: 'Boundary total not agreed', Below: 'Below overall', Exceeding: 'Exceeding overall' };

function pdpasSync(ctx) {
  const s = _pdpasState;
  const same = !!s.ctx && String(s.ctx.meetingId) === String(ctx.meetingId);
  s.ctx = ctx;
  if (same) return;
  Object.assign(s, { view: null, error: '', draft: null, busy: false, dirty: false });
  _pdpasLoad(false);
}

function pdpasIsDirty() { return _pdpasState.dirty; }

// Re-read the open meeting's scores (after the host marks it Held or signs) and redraw when done.
function pdpasReload() {
  const s = _pdpasState;
  if (!s.ctx) return Promise.resolve();
  return _pdpasLoad(false);
}

function pdpasReset() { _pdpasState = { ctx: null, view: null, loading: false, error: '', draft: null, busy: false, dirty: false }; }

// What still stops "Mark as held" (pdpAssessHeldProblems), for the host's to-do card and its Held check.
function pdpasHeldProblems() {
  const s = _pdpasState;
  if (!s.view) return s.error ? ['The scores could not be loaded: ' + s.error] : ['The scores are still loading.'];
  return pdpAssessHeldProblems(s.view);
}

// The typed values, seeded from the saved rows / Assessment.
function _pdpasDraftFrom(v) {
  const own = v.side === 'self' ? v.bySource.Self : v.bySource.Manager;
  const scores = {}, agreed = {};
  CONFIG.PDP.PILLAR_KEYS.forEach(k => {
    const r = own[k] || {};
    scores[k] = { score: r.Score == null ? '' : String(r.Score), rationale: r.Rationale || '' };
    const a = v.bySource.Agreed[k] || {};
    agreed[k] = { score: a.Score == null ? '' : String(a.Score), rationale: a.Rationale || '' };
  });
  const a = v.assessment;
  const mt = a.managerTrack;
  return {
    scores, agreed,
    boundary: { band: (a.boundary && a.boundary.band) || '', escalated: !!(a.boundary && a.boundary.escalated) },
    readiness: { value: (a.readiness && a.readiness.value) || '', note: (a.readiness && a.readiness.note) || '' },
    // flagged stays undefined until the manager clicks the box (pdpasMt): until then it follows the live suggestion
    // and pdpAgreedPlan stores the suggestion (N-442 QA finding 1).
    managerTrack: { flagged: mt ? mt.flagged === true : undefined, reason: (mt && mt.reason) || '' },
  };
}

async function _pdpasLoad(keepDraft) {
  const s = _pdpasState;
  const ctx = s.ctx;
  if (!ctx) return;
  s.loading = true;
  try {
    const v = await loadPdpAssessment(ctx.meetingId);
    if (_pdpasState !== s || !s.ctx || String(s.ctx.meetingId) !== String(ctx.meetingId)) { s.loading = false; return; }   // the host moved on
    s.view = v;
    s.error = '';
    if (!keepDraft || !s.draft) { s.draft = _pdpasDraftFrom(v); s.dirty = false; }
  } catch (e) {
    console.error('PDP scoring: load failed', e);
    if (_pdpasState !== s) return;
    s.view = null;
    s.error = e.message;
  }
  s.loading = false;
  if (s.ctx) s.ctx.redraw();
}

function _pdpasOpts(values, current, blank) {
  return (blank ? `<option value="">${escHtml(blank)}</option>` : '') +
    values.map(o => `<option value="${escAttr(o.value)}"${String(o.value) === String(current) ? ' selected' : ''}>${escHtml(o.label)}</option>`).join('');
}

function _pdpasScoreLabel(n) { return n == null || n === '' ? '—' : escHtml(n + ' · ' + (_PDPAS_SCORE_TEXT[n] || '')); }

function _pdpasDescriptorsHtml(p) {
  const rows = CONFIG.PDP.BANDS.map(b => `<dt>${escHtml(b)}</dt><dd>${escHtml((p.bands[b] && p.bands[b].text) || '')}</dd>`).join('');
  return `<details class="pdpas-desc"><summary>What each score looks like at this level</summary><dl>${rows}</dl></details>`;
}

// The side's own inputs (blind): a 1-3 score and the evidence / rationale per pillar.
function _pdpasOwnHtml(v, edit) {
  const s = _pdpasState, d = s.draft;
  const why = v.side === 'self' ? 'Your evidence' : 'Your rationale (include customer feedback or delivery outcomes)';
  const scoreOpts = [1, 2, 3].map(n => ({ value: n, label: n + ' · ' + _PDPAS_SCORE_TEXT[n] }));
  return v.set.pillars.map(p => {
    const cur = d.scores[p.key] || { score: '', rationale: '' };
    const body = edit
      ? `<div class="pdpas-row">
           <select data-pas-score="${escAttr(p.key)}" aria-label="Score for ${escAttr(p.name)}">${_pdpasOpts(scoreOpts, cur.score, 'Score…')}</select>
           <textarea rows="3" maxlength="${escAttr(CONFIG.PDP.ASSESS.RATIONALE_MAX)}" data-pas-why="${escAttr(p.key)}" aria-label="${escAttr(why + ' for ' + p.name)}" placeholder="${escAttr(why)}">${escHtml(cur.rationale)}</textarea>
         </div>`
      : `<div class="pdpas-row"><span class="dh-badge">${_pdpasScoreLabel(cur.score)}</span> ${_pdpmTextHtml(cur.rationale)}</div>`;
    return `<div class="pdpas-pillar"><div class="pdpm-label">${escHtml(p.order + '. ' + p.name)}</div>${_pdpasDescriptorsHtml(p)}${body}</div>`;
  }).join('');
}

function _pdpasStatusHtml(v) {
  const m = v.meeting;
  const sub = src => pdpScoresLocked(m, src) ? 'submitted' : 'not submitted yet';
  const who = v.side === 'self' ? `Your scores: ${sub('Self')} · Your manager’s scores: ${sub('Manager')}`
    : (v.side === 'manager' ? `Manager scores: ${sub('Manager')} · Employee’s scores: ${sub('Self')}` : `Employee: ${sub('Self')} · Manager: ${sub('Manager')}`);
  const reveal = {
    blind: 'Scores stay hidden from the other side until both have submitted.',
    unlocking: 'Both sides have submitted. Unlocking the scores — this can take a few minutes.',
    slow: 'Unlocking is taking longer than usual — tell People Ops.',
    revealed: '',
  }[v.reveal];
  const refresh = v.reveal === 'unlocking' || v.reveal === 'slow' ? ` <button type="button" class="pdpt-link"${act('pdpasRefresh')}>Refresh</button>` : '';
  return `<p class="ppl-muted-note pdpas-status">${escHtml(who)}${reveal ? '<br>' + escHtml(reveal) : ''}${refresh}</p>`;
}

// The revealed comparison: self | manager | gap | agreed, per pillar.
function _pdpasCompareHtml(v, edit) {
  const d = _pdpasState.draft;
  const by = v.bySource;
  const rows = v.compare.map(c => {
    const p = v.set.pillars.find(x => x.key === c.key) || { name: c.key, order: '' };
    const self = by.Self[c.key] || {}, mgr = by.Manager[c.key] || {}, ag = by.Agreed[c.key] || null;
    const cur = d.agreed[c.key] || { score: '', rationale: '' };
    let agreedCell;
    if (c.kind === 'escalate') {
      agreedCell = `<span class="dh-badge dh-badge-danger">With calibration panel</span>` +
        (edit ? `<textarea rows="2" maxlength="${escAttr(CONFIG.PDP.ASSESS.RATIONALE_MAX)}" data-pas-agree-why="${escAttr(c.key)}" aria-label="Note for ${escAttr(p.name)}" placeholder="Note for the panel (optional)">${escHtml(cur.rationale)}</textarea>`
          : (ag && ag.Rationale ? _pdpmTextHtml(ag.Rationale) : ''));
    } else if (c.kind === 'managerCall' && edit) {
      const opts = [c.self, c.manager].filter((x, i, a) => a.indexOf(x) === i).sort().map(n => ({ value: n, label: n + ' · ' + _PDPAS_SCORE_TEXT[n] }));
      agreedCell = `<select data-pas-agree="${escAttr(c.key)}" aria-label="Agreed score for ${escAttr(p.name)}"${actOn('change', 'pdpasAgree.stop')}>${_pdpasOpts(opts, cur.score, 'Agreed score…')}</select>
        <textarea rows="2" maxlength="${escAttr(CONFIG.PDP.ASSESS.RATIONALE_MAX)}" data-pas-agree-why="${escAttr(c.key)}" aria-label="Reason for ${escAttr(p.name)}" placeholder="Reason for the agreed score">${escHtml(cur.rationale)}</textarea>`;
    } else {
      const n = c.kind === 'agree' ? c.self : (ag ? ag.Score : null);
      agreedCell = `<span class="dh-badge">${_pdpasScoreLabel(n)}</span>${c.kind !== 'agree' && ag && ag.Rationale ? _pdpmTextHtml(ag.Rationale) : ''}${c.kind !== 'agree' && !ag ? '<span class="ppl-muted-small"> not recorded yet</span>' : ''}`;
    }
    return `<tr>
      <th scope="row">${escHtml(p.order + '. ' + p.name)}</th>
      <td><span class="dh-badge">${_pdpasScoreLabel(c.self)}</span>${self.Rationale ? _pdpmTextHtml(self.Rationale) : ''}</td>
      <td><span class="dh-badge">${_pdpasScoreLabel(c.manager)}</span>${mgr.Rationale ? _pdpmTextHtml(mgr.Rationale) : ''}</td>
      <td><span class="dh-badge ${_PDPAS_GAP_CLASS[c.kind] || ''}">${escHtml(_PDPAS_GAP_TEXT[c.kind] || '')}</span></td>
      <td>${agreedCell}</td>
    </tr>`;
  }).join('');
  return `<div class="pdpas-table-wrap"><table class="pdpas-table">
    <thead><tr><th scope="col">Pillar</th><th scope="col">Self</th><th scope="col">Manager</th><th scope="col">Comparison</th><th scope="col">Agreed</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// Overall, boundary, readiness and the L4 flag.
function _pdpasOutcomeHtml(v, edit) {
  const d = _pdpasState.draft;
  const A = CONFIG.PDP.ASSESS;
  const o = v.overall;
  const parts = [];
  // Live overall from what is typed (manager) or from the saved rows (everyone else).
  let live = o;
  const ag = {};
  if (edit) {
    v.compare.forEach(c => { ag[c.key] = c.kind === 'agree' ? c.self : (c.kind === 'escalate' ? null : (d.agreed[c.key].score === '' ? null : Number(d.agreed[c.key].score))); });
    live = pdpOverall(ag);
  }
  const boundary = edit ? d.boundary : (v.assessment.boundary || {});
  const band = pdpOverallBand(live, boundary);
  const total = live.pending ? 'Pending — ' + (v.compare.some(c => c.kind === 'escalate') ? 'a pillar is with the calibration panel' : 'record every agreed score') : escHtml(live.total) + (band ? ' · ' + escHtml(band) : '');
  parts.push(`<div class="pdpas-overall"><span class="pdpm-label">Overall</span> <strong>${live.pending ? escHtml(total) : total}</strong></div>`);
  if (live.boundary) {
    if (edit) {
      parts.push(`<div class="form-group pdpas-field"><label for="pdpas-band">The total sits on a band boundary — agreed rating</label>
        <select id="pdpas-band" data-pas-band="1"${boundary.escalated ? ' disabled' : ''}>${_pdpasOpts(live.boundary.map(b => ({ value: b, label: b })), boundary.band, 'Choose…')}</select>
        <label class="pdpas-check"><input type="checkbox" data-pas-band-esc="1"${boundary.escalated ? ' checked' : ''}> We can’t agree — escalate to the calibration panel</label></div>`);
    } else if (boundary.escalated) parts.push('<p class="ppl-muted-small">Boundary total escalated to the calibration panel.</p>');
  }
  if (v.showOutcome) {
    const r = edit ? d.readiness : (v.assessment.readiness || {});
    if (edit) {
      parts.push(`<div class="form-group pdpas-field"><label for="pdpas-ready">Progression readiness</label>
        <select id="pdpas-ready" data-pas-ready="1">${_pdpasOpts(A.READINESS.map(x => ({ value: x.key, label: x.label })), r.value, 'Choose…')}</select>
        <textarea rows="2" maxlength="${escAttr(A.NOTE_MAX)}" data-pas-ready-note="1" aria-label="Readiness note" placeholder="Note (optional)">${escHtml(r.note || '')}</textarea></div>`);
    } else {
      parts.push(`<div class="pdpas-field"><span class="pdpm-label">Progression readiness</span> ${escHtml(pdpReadinessLabel(r.value) || 'Not recorded yet')}${r.note ? _pdpmTextHtml(r.note) : ''}</div>`);
    }
    if (pdpManagerTrackApplies(v.scoring.levelKey)) {
      const mt = edit ? d.managerTrack : (v.assessment.managerTrack || { flagged: false, reason: '' });
      // The suggestion follows the agreed scores as they are typed (edit) or as saved (read-only).
      const suggested = edit ? pdpManagerTrackSuggested(v.scoring.levelKey, ag) : !!(v.assessment.managerTrack && v.assessment.managerTrack.suggested);
      const ticked = mt.flagged === undefined ? suggested : mt.flagged === true;
      const sugg = suggested ? 'Suggested: agreed scores of 3 on Support People, Stay Curious and Adapt are the framework’s manager-track signal.' : 'Not suggested by the agreed scores.';
      parts.push(edit
        ? `<div class="form-group pdpas-field"><label class="pdpas-check"><input type="checkbox" data-pas-mt="1"${ticked ? ' checked' : ''}${actOn('change', 'pdpasMt.stop', ACT_CHECKED)}> Flag for manager-track / succession discussion</label>
            <div class="ppl-muted-small">${escHtml(sugg)}</div>
            <textarea rows="2" maxlength="${escAttr(A.NOTE_MAX)}" data-pas-mt-why="1" aria-label="Reason for the manager-track decision" placeholder="Reason (needed when flagged, or when overriding the suggestion)">${escHtml(mt.reason || '')}</textarea></div>`
        : `<div class="pdpas-field"><span class="pdpm-label">Manager-track / succession</span> ${ticked ? '<span class="dh-badge dh-badge-success">Flagged</span>' : 'Not flagged'}${mt.reason ? _pdpmTextHtml(mt.reason) : ''}</div>`);
    }
  }
  if (v.side !== 'self' && v.panel.length) {
    const names = v.panel.map(r => r.kind === 'gap' ? (v.names[r.key] || r.key) + ' (2-point gap)' : _PDPAS_PANEL_TEXT[r.kind]);
    parts.push(`<p class="ppl-muted-note">Goes to the calibration panel: ${escHtml(names.join('; '))}.</p>`);
  }
  return `<div class="pdpas-outcome">${parts.join('')}</div>`;
}

// N-443: the calibration status line, the manager's release, and the employee's released result.
function _pdpasCalibrationHtml(v, ro) {
  const r = v.result || { state: 'none' };
  const A = CONFIG.PDP.ASSESS;
  if (v.side === 'self') {
    if (r.state === 'finalising') return '<p class="ppl-muted-note pdpas-cal">Your ratings are being finalised.</p>';
    if (r.state !== 'released') return '';
    const pillars = r.pillars.map(p => `<li><span class="pdpas-cal-name">${escHtml(p.name)}</span> <span class="dh-badge">${_pdpasScoreLabel(p.score)}</span></li>`).join('');
    const pointers = r.pointers.length
      ? '<ul class="pdpas-cal-list">' + r.pointers.map(p => `<li><strong>${escHtml(p.name)}</strong> — what ${escHtml(p.band)} looks like at your level: ${_pdpmTextHtml(p.text)}</li>`).join('') + '</ul>'
      : '<p class="ppl-muted-small">Exceeding on every pillar — keep stretching.</p>';
    return `<div class="pdpas-cal pdpas-result">
      <div class="pdpm-label">Your final ratings</div>
      <div class="pdpas-overall"><span class="pdpm-label">Overall</span> <strong>${escHtml(r.total)}${r.band ? ' · ' + escHtml(r.band) : ''}</strong></div>
      <ul class="pdpas-cal-list">${pillars}</ul>
      <div class="pdpm-label">Where to develop next</div>${pointers}
      ${r.note ? '<div class="pdpas-field"><span class="pdpm-label">From your manager</span>' + _pdpmTextHtml(r.note) + '</div>' : ''}
    </div>`;
  }
  const m = v.meeting;
  let line = '';
  if (v.ratingsReleased) line = 'Calibrated ratings released to the employee on ' + pdpFmtDay(localDayISO(new Date(m.RatingsReleasedAt))) + '.';
  else if (v.ratingsLocked) line = 'Ratings locked by the calibration panel on ' + pdpFmtDay(localDayISO(new Date(m.RatingsLockedAt))) + '. Not yet released to the employee.';
  else if (v.panel.length) line = 'With the calibration panel: the ratings are final once the panel locks them.';
  else if (v.compare.length) line = 'Waiting for the calibration panel to lock the ratings.';
  let release = '';
  if (v.canRelease && !ro) {
    release = `<div class="form-group pdpas-field">
      <textarea rows="2" maxlength="${escAttr(A.NOTE_MAX)}" id="pdpas-release-note" aria-label="Note to the employee" placeholder="Note to the employee (optional)"></textarea>
      <div class="pdpm-actions"><button type="button" class="btn-primary"${act('pdpasRelease')}>Release to employee</button></div></div>`;
  }
  return line || release ? `<div class="pdpas-cal">${line ? '<p class="ppl-muted-note">' + escHtml(line) + '</p>' : ''}${release}</div>` : '';
}

function pdpasHtml(label) {
  const s = _pdpasState, v = s.view;
  const head = `<div class="pdpm-label">${escHtml(label || 'Pillar scoring')}</div>`;
  if (s.error && !v) return `<div class="pdpm-block">${head}<div class="ppl-muted-small">Could not load the scores: ${escHtml(s.error)}</div></div>`;
  if (!v) return `<div class="pdpm-block">${head}<div class="ppl-muted-small">Loading the scores…</div></div>`;
  if (v.scoring.state !== 'open') return `<div class="pdpm-block">${head}<div class="ppl-muted-small">${escHtml(v.scoring.reason || 'Not scored in this meeting.')}</div></div>`;
  const ro = s.ctx && s.ctx.readOnly;
  let body = _pdpasStatusHtml(v);
  if (v.reveal === 'revealed') {
    const edit = v.canAgree && !ro;
    body += _pdpasCompareHtml(v, edit) + _pdpasOutcomeHtml(v, edit);
    if (edit) body += `<div class="pdpm-actions"><button type="button" class="btn-primary"${act('pdpasAgreedSave')}>Save agreed scores</button></div>`;
    body += _pdpasCalibrationHtml(v, ro);   // N-443
  } else if (v.side === 'viewer') {
    body += '<div class="ppl-muted-small">Scores are shown once both sides have submitted and they are revealed.</div>';
  } else {
    const edit = (v.side === 'self' ? v.canSelf : v.canManager) && !ro;
    if (v.side === 'self' && !edit && !pdpScoresLocked(v.meeting, 'Self')) {
      const win = pdpPrepWindow(v.meeting, new Date());
      if (win.state === 'closed') body += `<p class="ppl-muted-small">Scoring opens with prep on ${escHtml(pdpFmtDay(win.opensOn))}.</p>`;
    }
    body += _pdpasOwnHtml(v, edit);
    if (edit) {
      body += `<div class="pdpm-actions">
        <button type="button" class="btn-secondary"${act('pdpasSave')}>Save scores as draft</button>
        <button type="button" class="btn-primary"${act('pdpasSubmit')}>Submit scores</button></div>`;
    }
  }
  return `<div class="pdpm-block pdpas" id="pdpas-root"${actOn('input', 'pdpasInput.stop')}${actOn('change', 'pdpasInput.stop')}>${head}${body}</div>`;
}

// ── actions ──────────────────────────────────────────────────────────────────────────────────
function _pdpasStash() {
  const s = _pdpasState, root = document.getElementById('pdpas-root');
  if (!root || !s.draft) return;
  const d = s.draft;
  root.querySelectorAll('[data-pas-score]').forEach(el => { d.scores[el.getAttribute('data-pas-score')].score = el.value; });
  root.querySelectorAll('[data-pas-why]').forEach(el => { d.scores[el.getAttribute('data-pas-why')].rationale = el.value; });
  root.querySelectorAll('[data-pas-agree]').forEach(el => { d.agreed[el.getAttribute('data-pas-agree')].score = el.value; });
  root.querySelectorAll('[data-pas-agree-why]').forEach(el => { d.agreed[el.getAttribute('data-pas-agree-why')].rationale = el.value; });
  const q = sel => root.querySelector(sel);
  if (q('[data-pas-band]')) d.boundary.band = q('[data-pas-band]').value;
  if (q('[data-pas-band-esc]')) d.boundary.escalated = q('[data-pas-band-esc]').checked;
  if (q('[data-pas-ready]')) d.readiness.value = q('[data-pas-ready]').value;
  if (q('[data-pas-ready-note]')) d.readiness.note = q('[data-pas-ready-note]').value;
  if (q('[data-pas-mt-why]')) d.managerTrack.reason = q('[data-pas-mt-why]').value;
}

function pdpasInput() {
  _pdpasState.dirty = true;
  _pdpasStash();
  const d = _pdpasState.draft, band = document.querySelector('[data-pas-band]');
  if (band) band.disabled = !!(d && d.boundary.escalated);
}

async function _pdpasRun(fn, okText, confirm) {
  const s = _pdpasState;
  if (s.busy || !s.ctx) return;
  _pdpasStash();
  if (confirm && !(await confirmModal(confirm))) return;
  s.busy = true;
  try {
    const res = await fn();
    const open = res && Array.isArray(res.problems) ? res.problems : [];
    toast(okText + (open.length ? ' Still to do: ' + open.join(' ') : ''), { type: open.length ? 'info' : 'success' });
    s.dirty = false;
    s.busy = false;
    await _pdpasLoad(false);
    return;
  } catch (e) {
    console.error('PDP scoring: write failed', e);
    toast(e.message, { type: 'error' });
  }
  s.busy = false;
}

function _pdpasScoresEdit(submit) {
  const out = {};
  Object.keys(_pdpasState.draft.scores).forEach(k => { const x = _pdpasState.draft.scores[k]; out[k] = { score: x.score, rationale: x.rationale }; });
  return { scores: out, submit };
}

function _pdpasSaveSide(submit) {
  const s = _pdpasState;
  if (!s.view) return;
  const id = s.ctx.meetingId;
  const fn = s.view.side === 'self' ? () => savePdpSelfScores(id, _pdpasScoresEdit(submit)) : () => savePdpManagerScores(id, _pdpasScoresEdit(submit));
  const confirm = submit ? { title: 'Submit your scores', message: 'You can’t change your scores after submitting. They stay hidden from the other side until both have submitted.', confirmLabel: 'Submit scores' } : null;
  return _pdpasRun(fn, submit ? 'Scores submitted.' : 'Scores saved as a draft.', confirm);
}

function pdpasSave()   { return _pdpasSaveSide(false); }
function pdpasSubmit() { return _pdpasSaveSide(true); }

function pdpasAgreedSave() {
  const s = _pdpasState;
  if (!s.view) return;
  const id = s.ctx.meetingId;
  return _pdpasRun(() => {
    const d = s.draft;
    return savePdpAgreed(id, { agreed: d.agreed, boundary: d.boundary, readiness: d.readiness, managerTrack: d.managerTrack });
  }, 'Agreed scores saved.', null);
}

// An agreed-score pick redraws the block, so the overall, any boundary choice and the manager-track suggestion follow it.
function pdpasAgree() {
  const s = _pdpasState;
  if (!s.draft || !s.ctx) return;
  s.dirty = true;
  _pdpasStash();
  s.ctx.redraw();
}

// The manager-track box is the only control that sets `flagged` (the generic input handler leaves it alone, so an
// untouched box keeps following the suggestion).
function pdpasMt(checked) {
  const s = _pdpasState;
  if (!s.draft) return;
  s.dirty = true;
  _pdpasStash();
  s.draft.managerTrack.flagged = !!checked;
}

// N-443: release the locked, calibrated result to the employee.
function pdpasRelease() {
  const s = _pdpasState;
  if (!s.view || !s.ctx) return;
  const id = s.ctx.meetingId;
  const el = document.getElementById('pdpas-release-note');
  const note = el ? el.value : '';
  return _pdpasRun(() => releasePdpRatings(id, note), 'Ratings released to the employee.',
    { title: 'Release the ratings', message: 'The employee will see their final overall, band, pillar scores and development pointers.', confirmLabel: 'Release' });
}

async function pdpasRefresh() {
  const s = _pdpasState;
  if (s.busy || !s.ctx) return;
  _pdpasStash();
  await _pdpasLoad(true);
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  pdpasInput,
  pdpasSave,
  pdpasSubmit,
  pdpasAgreedSave,
  pdpasRefresh,
  pdpasMt,
  pdpasAgree,
  pdpasRelease,   // N-443
});
