// js/pdp-assess.js — Bi-Annual assessment rules (N-442 / PDP-10). Pure: CONFIG + plain objects in, plain
// objects out; no network I/O, no DOM. Loaded on people.html straight after pdp-track.js (it uses
// pdpFrameworkSet / pdpFrameworkComplete / pdpParseLevelKey / pdpScoresRevealed from pdp-data.js,
// pdpPrepWindow from pdp-prep.js, pdpManagerLock / pdpTeamAccess from pdp-team.js and, N-443, pdpRatingsLocked /
// pdpRatingsReleased / pdpResultView from pdp-calibrate.js at run time).
//
// The Notion Performance / Capability Framework, steps 1-3: the employee scores each of the six pillars 1-3
// with evidence (Source Self), the line manager / CSD scores blind with a rationale (Source Manager), the PDP
// score reveal flow opens each side to the other once both have submitted, then the manager records the
// agreed score per pillar (Source Agreed): same score = agreed; 1-point gap = the manager's call, one of the
// two, with a reason; 2-point gap = escalated to the calibration panel (N-443, blank agreed score). The total
// is the average to one decimal; a total on a band boundary is agreed into one of two bands or escalated.
// Names no PDP list and calls no PDP list reader or writer (the PDP-D12 guard in tests/assert-pdp-access.js).

function _pdpaxText(v) { return String(v == null ? '' : v).trim(); }
function _pdpaxScore(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= CONFIG.PDP.SCORE_MIN && n <= CONFIG.PDP.SCORE_MAX ? n : NaN;
}
function _pdpaxPillars() { return CONFIG.PDP.PILLAR_KEYS.slice(); }
function _pdpaxYes(v) { return v === true || v === 1 || v === 'Yes' || v === '1' || v === 'true'; }

// The template has a scoring block (only a Bi-Annual can, N-436).
function pdpHasScoringBlock(def) {
  const sections = (def && Array.isArray(def.sections)) ? def.sections : [];
  return sections.some(s => (s.blocks || []).some(b => b && b.type === 'scoring'));
}

// Rule 1: can this meeting be scored? -> { state, reason, levelKey }
//   none | skipped | notScored (PDP-D10) | noDescriptors (PDP-D5) | open
function pdpScoringState(meeting, cycle, frameworkRows, def) {
  const m = meeting || {};
  if (m.MeetingType !== 'BiAnnual' || !pdpHasScoringBlock(def)) return { state: 'none', reason: '', levelKey: '' };
  if (m.Status === 'Skipped') return { state: 'skipped', reason: 'This meeting was skipped.', levelKey: '' };
  if (!cycle || !_pdpaxYes(cycle.BiAnnualScored)) return { state: 'notScored', reason: 'Not scored this year: joined after 31 March.', levelKey: '' };
  const levelKey = _pdpaxText(cycle.ScoringLevel);
  const k = pdpParseLevelKey(levelKey);
  if (!k || !pdpFrameworkComplete(frameworkRows || [], k.level, k.track)) {
    return { state: 'noDescriptors', reason: 'Scoring is off for this level until its descriptors are written.', levelKey: levelKey };
  }
  return { state: 'open', reason: '', levelKey: levelKey };
}

// Score rows -> { Self: { pillarKey: row }, Manager: {...}, Agreed: {...} } (the lowest id wins a duplicate Title).
function pdpScoresBySource(rows) {
  const out = {};
  CONFIG.PDP.SCORE_SOURCES.forEach(s => { out[s] = {}; });
  (rows || []).slice().sort((a, b) => Number(a.id) - Number(b.id)).forEach(r => {
    if (!r || !out[r.Source] || out[r.Source][r.PillarKey]) return;
    out[r.Source][r.PillarKey] = r;
  });
  return out;
}

// Self / Manager submitted marker on the meeting (rule 2: each side locks on submit).
function pdpScoresLocked(meeting, source) {
  const m = meeting || {};
  return _pdpaxText(source === 'Self' ? m.SelfScoredAt : m.ManagerScoredAt) !== '';
}

// Rule 2: the draft one side is typing, merged over its saved rows. edit = { pillarKey: { score, rationale } }.
// -> { pillarKey: { score: n|null, rationale } }. Throws on a score outside 1-3 or an over-long rationale.
function pdpScoreDraft(savedByKey, edit) {
  const max = CONFIG.PDP.ASSESS.RATIONALE_MAX;
  const out = {};
  _pdpaxPillars().forEach(k => {
    const saved = (savedByKey || {})[k] || {};
    const e = (edit || {})[k] || {};
    const score = _pdpaxScore(e.score !== undefined ? e.score : saved.Score);
    if (Number.isNaN(score)) throw new Error('Scores are whole numbers from ' + CONFIG.PDP.SCORE_MIN + ' to ' + CONFIG.PDP.SCORE_MAX + '.');
    const rationale = _pdpaxText(e.rationale !== undefined ? e.rationale : saved.Rationale);
    if (rationale.length > max) throw new Error('Keep each written reason under ' + max + ' characters.');
    out[k] = { score, rationale };
  });
  return out;
}

// Pillar keys without a score or a written reason (a submit needs all six). `names` maps key -> pillar name.
function pdpScoresMissing(draft, names) {
  return _pdpaxPillars().filter(k => { const d = (draft || {})[k] || {}; return d.score == null || !d.rationale; })
    .map(k => (names && names[k]) || k);
}

// Rule 2: the rows to write for one side. -> [{ id: existing id | null, fields }]. Snapshot columns come from
// the MEETING (the access flow secures the row for the same people); ScoringLevel from the cycle. A pillar with
// nothing typed and no saved row is not created. submit stamps SubmittedAt on all six.
function pdpScoreWrites(meeting, levelKey, source, savedByKey, draft, submit, nowIso) {
  const m = meeting || {};
  const out = [];
  _pdpaxPillars().forEach(k => {
    const d = (draft || {})[k] || { score: null, rationale: '' };
    const saved = (savedByKey || {})[k] || null;
    if (!saved && d.score == null && !d.rationale && !submit) return;
    const fields = { Score: d.score == null ? '' : d.score, Rationale: d.rationale, ScoringLevel: levelKey };
    if (submit) fields.SubmittedAt = nowIso;
    if (!saved) {
      Object.assign(fields, {
        PersonID: Number(m.PersonID), PersonEmail: m.PersonEmail, CycleYear: Number(m.CycleYear),
        LineManagerEmail: m.LineManagerEmail, CSDEmail: m.CSDEmail, MeetingID: Number(m.id), PillarKey: k, Source: source,
      });
    }
    out.push({ id: saved ? saved.id : null, fields });
  });
  return out;
}

// Rule 3: where the reveal stands. counts = { Self, Manager } rows visible to the viewer.
//   blind | unlocking | slow | revealed
function pdpRevealState(meeting, counts, now) {
  const m = meeting || {};
  const n = _pdpaxPillars().length;
  const c = counts || {};
  if (pdpScoresRevealed(m) && (c.Self || 0) >= n && (c.Manager || 0) >= n) return 'revealed';
  const a = _pdpaxText(m.SelfScoredAt), b = _pdpaxText(m.ManagerScoredAt);
  if (!a || !b) return 'blind';
  const since = Math.max(Date.parse(a) || 0, Date.parse(b) || 0, Date.parse(_pdpaxText(m.ScoresRevealedAt)) || 0);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return since && (nowMs - since) > CONFIG.PDP.ASSESS.REVEAL_WAIT_MIN * 60000 ? 'slow' : 'unlocking';
}

// Rule 4: per pillar { key, self, manager, gap, kind: agree | managerCall | escalate }.
function pdpCompare(selfByKey, managerByKey) {
  const A = CONFIG.PDP.ASSESS;
  return _pdpaxPillars().map(k => {
    const s = _pdpaxScore(((selfByKey || {})[k] || {}).Score);
    const mg = _pdpaxScore(((managerByKey || {})[k] || {}).Score);
    const ok = Number.isInteger(s) && Number.isInteger(mg);
    const gap = ok ? Math.abs(s - mg) : null;
    const kind = !ok ? 'missing' : (gap >= A.ESCALATE_GAP ? 'escalate' : (gap >= A.MANAGER_CALL_GAP ? 'managerCall' : 'agree'));
    return { key: k, self: ok ? s : null, manager: ok ? mg : null, gap, kind };
  });
}

// Rule 5: the agreed score per pillar. edit = { pillarKey: { score, rationale } } (the manager's call / note).
// -> { pillars: [{ key, kind, score|null, rationale, escalated }], problems: [text] }
function pdpAgreedResolve(compare, edit, names) {
  const max = CONFIG.PDP.ASSESS.RATIONALE_MAX;
  const problems = [];
  const pillars = (compare || []).map(c => {
    const e = (edit || {})[c.key] || {};
    const name = (names && names[c.key]) || c.key;
    const rationale = _pdpaxText(e.rationale);
    if (rationale.length > max) problems.push('Keep the reason for ' + name + ' under ' + max + ' characters.');
    if (c.kind === 'agree') return { key: c.key, kind: c.kind, score: c.self, rationale, escalated: false };
    if (c.kind === 'escalate') return { key: c.key, kind: c.kind, score: null, rationale, escalated: true };
    if (c.kind === 'managerCall') {
      const pick = _pdpaxScore(e.score);
      if (pick !== c.self && pick !== c.manager) problems.push('Choose the self or the manager score for ' + name + '.');
      else if (!rationale) problems.push('Give a reason for the agreed score for ' + name + '.');
      return { key: c.key, kind: c.kind, score: (pick === c.self || pick === c.manager) ? pick : null, rationale, escalated: false };
    }
    problems.push('Both scores are needed for ' + name + '.');
    return { key: c.key, kind: c.kind, score: null, rationale, escalated: false };
  });
  return { pillars, problems };
}

// The band a total falls in (CONFIG.PDP.ASSESS.BAND_MAX, CONFIG.PDP.BANDS order).
function pdpBandFor(total) {
  if (total == null || Number.isNaN(Number(total))) return null;
  const max = CONFIG.PDP.ASSESS.BAND_MAX, bands = CONFIG.PDP.BANDS;
  for (let i = 0; i < bands.length - 1; i++) if (Number(total) <= max[bands[i]]) return bands[i];
  return bands[bands.length - 1];
}

// Rule 6 + 7: overall from the agreed scores. agreed = { pillarKey: n|null } (escalated / missing = null).
// -> { total, band, pending, boundary: [bandA, bandB] | null }
function pdpOverall(agreed) {
  const A = CONFIG.PDP.ASSESS;
  const scores = _pdpaxPillars().map(k => _pdpaxScore((agreed || {})[k]));
  if (scores.some(s => !Number.isInteger(s))) return { total: null, band: null, pending: true, boundary: null };
  const f = Math.pow(10, A.DECIMALS);
  const total = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * f) / f;
  const bKey = Object.keys(A.BOUNDARIES).find(k => Number(k) === total);
  return { total, band: pdpBandFor(total), pending: false, boundary: bKey ? A.BOUNDARIES[bKey].slice() : null };
}

// Rule 7: a boundary total must be agreed into one of its two bands or escalated. -> problem text or ''.
function pdpBoundaryProblem(overall, boundary) {
  if (!overall || !overall.boundary) return '';
  const b = boundary || {};
  if (b.escalated === true) return '';
  if (overall.boundary.includes(b.band)) return '';
  return b.band ? 'A total of ' + overall.total + ' can only be agreed as ' + overall.boundary.join(' or ') + '.'
    : 'The total is ' + overall.total + ', on a band boundary: agree ' + overall.boundary.join(' or ') + ', or escalate it.';
}

// The band that counts: the agreed boundary band when the total sits on a boundary, else the computed band.
function pdpOverallBand(overall, boundary) {
  if (!overall || overall.pending) return null;
  if (overall.boundary) return boundary && boundary.escalated !== true && overall.boundary.includes(boundary.band) ? boundary.band : null;
  return overall.band;
}

// Rule 8: why this person goes to the calibration panel (N-443 intake). Derived, never stored.
// -> [{ kind: 'gap', key } | { kind: 'boundary' } | { kind: 'Below' } | { kind: 'Exceeding' }]
function pdpPanelReasons(compare, overall, assessment) {
  const bands = CONFIG.PDP.BANDS;
  const a = assessment || {};
  const out = (compare || []).filter(c => c.kind === 'escalate').map(c => ({ kind: 'gap', key: c.key }));
  if (overall && overall.boundary && a.boundary && a.boundary.escalated === true) out.push({ kind: 'boundary' });
  const band = pdpOverallBand(overall, a.boundary);
  if (band === bands[0] || band === bands[bands.length - 1]) out.push({ kind: band });
  return out;
}

// Rule 9: the L4 manager-track / succession suggestion (Notion framework, Level 4 note).
function pdpManagerTrackSuggested(levelKey, agreed) {
  const t = CONFIG.PDP.ASSESS.MANAGER_TRACK;
  if (levelKey !== t.LEVEL_KEY) return false;
  return t.PILLARS.every(k => _pdpaxScore((agreed || {})[k]) === t.SCORE);
}

function pdpManagerTrackApplies(levelKey) { return levelKey === CONFIG.PDP.ASSESS.MANAGER_TRACK.LEVEL_KEY; }

// -> problem text or ''. A reason is needed when the flag is set or differs from the suggestion.
function pdpManagerTrackProblem(levelKey, suggested, mt) {
  if (!pdpManagerTrackApplies(levelKey)) return '';
  const flagged = !!(mt && mt.flagged === true);
  const reason = _pdpaxText(mt && mt.reason);
  if (reason.length > CONFIG.PDP.ASSESS.NOTE_MAX) return 'Keep the manager-track reason under ' + CONFIG.PDP.ASSESS.NOTE_MAX + ' characters.';
  if ((flagged || flagged !== !!suggested) && !reason) return flagged ? 'Give a reason for the manager-track flag.' : 'Give a reason for not flagging the suggested manager track.';
  return '';
}

function pdpReadinessLabel(key) {
  const r = CONFIG.PDP.ASSESS.READINESS.find(x => x.key === key);
  return r ? r.label : '';
}

// The stored Assessment JSON, or the empty shape.
function pdpAssessmentFrom(text) {
  const o = pdpParseJson(text);
  const a = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  return {
    schema: a.schema || CONFIG.PDP.ASSESS.SCHEMA,
    boundary: a.boundary && typeof a.boundary === 'object' ? a.boundary : null,
    readiness: a.readiness && typeof a.readiness === 'object' ? a.readiness : { value: '', note: '' },
    managerTrack: a.managerTrack && typeof a.managerTrack === 'object' ? a.managerTrack : null,
    savedAt: a.savedAt || '', savedBy: a.savedBy || '',
  };
}

// The manager's agreed save, checked. edit = { agreed: { key: { score, rationale } }, boundary: { band, escalated },
// readiness: { value, note }, managerTrack: { flagged, reason } }.
// -> { ok, problems, agreedRows: [{ id|null, fields }], assessment (object for the meeting's Assessment column) }
// `strict` false = a draft save: problems are reported, the rows still written as far as they are valid.
function pdpAgreedPlan(input) {
  const i = input || {};
  const e = i.edit || {};
  const A = CONFIG.PDP.ASSESS;
  const names = i.names || {};
  const res = pdpAgreedResolve(i.compare, e.agreed, names);
  const agreed = {};
  res.pillars.forEach(p => { agreed[p.key] = p.score; });
  const overall = pdpOverall(agreed);
  const problems = res.problems.slice();
  const bIn = e.boundary || {};
  const boundary = overall.boundary ? { total: overall.total, band: overall.boundary.includes(bIn.band) ? bIn.band : null, escalated: bIn.escalated === true } : null;
  if (overall.boundary) {
    if (bIn.band && !overall.boundary.includes(bIn.band)) problems.push(pdpBoundaryProblem(overall, bIn));
    else { const bp = pdpBoundaryProblem(overall, boundary); if (bp) problems.push(bp); }
  }
  const rIn = e.readiness || {};
  const rValue = A.READINESS.some(r => r.key === rIn.value) ? rIn.value : '';
  const rNote = _pdpaxText(rIn.note);
  if (rIn.value && !rValue) problems.push('Pick a progression readiness option.');
  if (!rValue) problems.push('Choose the progression readiness.');
  if (rNote.length > A.NOTE_MAX) problems.push('Keep the readiness note under ' + A.NOTE_MAX + ' characters.');
  const suggested = pdpManagerTrackSuggested(i.levelKey, agreed);
  let managerTrack = null;
  if (pdpManagerTrackApplies(i.levelKey)) {
    const mIn = e.managerTrack || {};
    managerTrack = { suggested, flagged: mIn.flagged === undefined ? suggested : mIn.flagged === true, reason: _pdpaxText(mIn.reason).slice(0, A.NOTE_MAX) };
    const mp = pdpManagerTrackProblem(i.levelKey, suggested, { flagged: managerTrack.flagged, reason: mIn.reason });
    if (mp) problems.push(mp);
  }
  const m = i.meeting || {};
  const agreedRows = res.pillars.map(p => {
    const saved = (i.savedAgreed || {})[p.key] || null;
    const fields = { Score: p.score == null ? '' : p.score, Rationale: p.rationale.slice(0, A.RATIONALE_MAX), ScoringLevel: i.levelKey };
    if (!saved) {
      Object.assign(fields, {
        PersonID: Number(m.PersonID), PersonEmail: m.PersonEmail, CycleYear: Number(m.CycleYear),
        LineManagerEmail: m.LineManagerEmail, CSDEmail: m.CSDEmail, MeetingID: Number(m.id), PillarKey: p.key, Source: 'Agreed',
      });
    }
    return { id: saved ? saved.id : null, fields };
  });
  const assessment = {
    schema: A.SCHEMA, boundary, readiness: { value: rValue, note: rNote.slice(0, A.NOTE_MAX) }, managerTrack,
    savedAt: i.nowIso || '', savedBy: i.by || '',
  };
  return { ok: !problems.length, problems, agreedRows, assessment, overall, pillars: res.pillars };
}

// Rule 10: what stops "Mark as held" for a scorable Bi-Annual. view = pdpAssessView(...) result.
function pdpAssessHeldProblems(view) {
  const v = view || {};
  if (!v.scoring || v.scoring.state !== 'open') return [];
  const m = v.meeting || {};
  const p = [];
  if (!pdpScoresLocked(m, 'Self')) p.push('The employee has not submitted their scores.');
  if (!pdpScoresLocked(m, 'Manager')) p.push('The manager scores have not been submitted.');
  if (p.length) return p;
  if (v.reveal !== 'revealed') return ['The scores are still unlocking. Try again in a few minutes.'];
  const by = v.bySource || {};
  const levels = new Set(['Self', 'Manager'].flatMap(s => Object.values(by[s] || {}).map(r => _pdpaxText(r.ScoringLevel))));
  if (levels.size > 1) p.push('Scores were given against different levels — ask People Ops.');
  const agreed = by.Agreed || {};
  const compare = v.compare || [];
  compare.forEach(c => {
    const row = agreed[c.key];
    const name = (v.names && v.names[c.key]) || c.key;
    if (!row) p.push('Record the agreed score for ' + name + '.');
    else if (c.kind !== 'escalate' && !Number.isInteger(_pdpaxScore(row.Score))) p.push('Record the agreed score for ' + name + '.');
  });
  const a = v.assessment || pdpAssessmentFrom('');
  const ag = {};
  compare.forEach(c => { ag[c.key] = agreed[c.key] ? _pdpaxScore(agreed[c.key].Score) : null; });
  const overall = pdpOverall(ag);
  const bp = pdpBoundaryProblem(overall, a.boundary);
  if (bp) p.push(bp);
  if (!a.readiness || !CONFIG.PDP.ASSESS.READINESS.some(r => r.key === a.readiness.value)) p.push('Choose the progression readiness.');
  return p;
}

// Who is acting on the scores of this meeting: 'self' (the person), 'manager' (their LM or CSD), else 'viewer'.
function pdpAssessSide(role, myEmail, meeting) {
  const t = pdpTeamAccess(role, myEmail, meeting);
  if (t.as === 'self') return 'self';
  if (t.run) return 'manager';
  return 'viewer';
}

// The view model both pages render. input = { meeting, cycle, framework, def, rows (already visibility-filtered),
// role, email, live (gate live and not Ghost), now }.
function pdpAssessView(input) {
  const i = input || {};
  const m = i.meeting || {};
  const scoring = pdpScoringState(m, i.cycle, i.framework, i.def);
  const k = pdpParseLevelKey(scoring.levelKey || (i.cycle && i.cycle.ScoringLevel) || '');
  const set = k ? pdpFrameworkSet(i.framework || [], k.level, k.track) : null;
  const names = {};
  (set ? set.pillars : []).forEach(p => { names[p.key] = p.name; });
  const bySource = pdpScoresBySource(i.rows);
  const counts = { Self: Object.keys(bySource.Self).length, Manager: Object.keys(bySource.Manager).length };
  const reveal = pdpRevealState(m, counts, i.now || new Date());
  const compare = reveal === 'revealed' ? pdpCompare(bySource.Self, bySource.Manager) : [];
  const assessment = pdpAssessmentFrom(m.Assessment);
  const agreed = {};
  compare.forEach(c => { agreed[c.key] = bySource.Agreed[c.key] ? _pdpaxScore(bySource.Agreed[c.key].Score) : null; });
  const overall = compare.length ? pdpOverall(agreed) : { total: null, band: null, pending: true, boundary: null };
  const side = pdpAssessSide(i.role, i.email, m);
  const live = !!i.live && scoring.state === 'open';
  const lock = pdpManagerLock(m);
  const open = m.Status === 'Planned' || m.Status === 'PrepOpen';
  return {
    meeting: m, scoring, set, names, bySource, counts, reveal, compare, assessment, overall,
    band: pdpOverallBand(overall, assessment.boundary),
    panel: compare.length ? pdpPanelReasons(compare, overall, assessment) : [],
    suggested: compare.length ? pdpManagerTrackSuggested(scoring.levelKey, agreed) : false,
    side,
    canSelf: live && side === 'self' && open && !pdpScoresLocked(m, 'Self') && pdpPrepWindow(m, i.now || new Date()).state === 'open',
    canManager: live && side === 'manager' && open && !pdpScoresLocked(m, 'Manager'),
    canAgree: live && side === 'manager' && reveal === 'revealed' && lock === 'open' && m.Status !== 'SignedOff' && !pdpRatingsLocked(m),
    showOutcome: side !== 'self' || m.Status === 'Held' || m.Status === 'SignedOff',
    // N-443: the calibration panel's lock, the manager's release and what the employee may see of the result.
    ratingsLocked: pdpRatingsLocked(m),
    ratingsReleased: pdpRatingsReleased(m),
    result: pdpResultView(m, bySource.Agreed, set),
    canRelease: live && side === 'manager' && pdpRatingsLocked(m) && !pdpRatingsReleased(m),
  };
}
