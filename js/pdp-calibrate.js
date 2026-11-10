// js/pdp-calibrate.js — calibration panel, distribution check, lock, release (N-443 / PDP-11). Pure: CONFIG +
// plain objects in, plain objects out; no network I/O, no DOM. Loaded on people.html straight after
// pdp-assess.js (it uses pdpScoringState / pdpScoresBySource / pdpCompare / pdpOverall / pdpOverallBand /
// pdpPanelReasons / pdpAssessmentFrom from pdp-assess.js and pdpFrameworkSet / pdpParseLevelKey /
// pdpTemplateForMeeting / pdpScoresRevealed / pdpParseJson from pdp-data.js at run time).
//
// The Notion Performance / Capability Framework, steps 4-6: the calibration panel (Admin + People Ops, D1) sees
// every scored Bi-Annual that has been held, works through the panel cases (2-point gaps, an escalated boundary,
// anyone Below or Exceeding overall — pdpPanelReasons), sets a calibrated score per pillar (a written reason
// where it differs from the agreed score), checks the band distribution (warn only, D2) and locks each person's
// ratings (D3). The line manager / CSD then releases the result to the employee (D4). Calibrated scores live on
// the Agreed rows (CalibratedScore, CalibrationRationale, IsLocked); the meeting carries RatingsLockedAt / By,
// RatingsReleasedAt / By and the Calibration JSON. Names no PDP list and calls no PDP list reader or writer.

function _pdpclText(v) { return String(v == null ? '' : v).trim(); }
function _pdpclScore(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= CONFIG.PDP.SCORE_MIN && n <= CONFIG.PDP.SCORE_MAX ? n : NaN;
}
function _pdpclRound(x) { const f = Math.pow(10, CONFIG.PDP.ASSESS.DECIMALS); return Math.round(x * f) / f; }

function pdpRatingsLocked(meeting) { return _pdpclText((meeting || {}).RatingsLockedAt) !== ''; }
function pdpRatingsReleased(meeting) { return _pdpclText((meeting || {}).RatingsReleasedAt) !== ''; }

// The stored Calibration JSON, or the empty shape.
function pdpCalibrationFrom(text) {
  const o = pdpParseJson(text);
  const a = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  return {
    schema: a.schema || CONFIG.PDP.CALIBRATION.SCHEMA,
    final: a.final && typeof a.final === 'object' ? a.final : null,
    panelReasons: Array.isArray(a.panelReasons) ? a.panelReasons : [],
    pointers: Array.isArray(a.pointers) ? a.pointers : [],
    releaseNote: _pdpclText(a.releaseNote),
    log: Array.isArray(a.log) ? a.log : [],
  };
}

// Add an audit entry; keep the newest LOG_MAX entries and stay under JSON_MAX_CHARS (oldest dropped first).
function pdpCalibrationLogged(cal, entry) {
  const c = Object.assign({}, cal || pdpCalibrationFrom(''));
  const log = (c.log || []).concat([entry]);
  while (log.length > CONFIG.PDP.CALIBRATION.LOG_MAX) log.shift();
  c.log = log;
  while (c.log.length > 1 && JSON.stringify(c).length > CONFIG.PDP.JSON_MAX_CHARS) c.log.shift();
  return c;
}

// Rule 2: the case state. -> needsPanel | ready | locked | released
function pdpCaseState(meeting, panelReasons) {
  if (pdpRatingsReleased(meeting)) return 'released';
  if (pdpRatingsLocked(meeting)) return 'locked';
  return (panelReasons || []).length ? 'needsPanel' : 'ready';
}

// One person's case from their meeting, cycle and score rows (rows already visibility-filtered).
// input = { meeting, cycle, framework, def, rows }. -> null when the meeting is not a scored Bi-Annual.
function pdpCalibrationCase(input) {
  const i = input || {};
  const m = i.meeting || {};
  const scoring = pdpScoringState(m, i.cycle, i.framework, i.def);
  if (scoring.state !== 'open') return null;
  const k = pdpParseLevelKey(scoring.levelKey);
  const set = k ? pdpFrameworkSet(i.framework || [], k.level, k.track) : null;
  const names = {};
  (set ? set.pillars : []).forEach(p => { names[p.key] = p.name; });
  const bySource = pdpScoresBySource(i.rows);
  const held = m.Status === 'Held' || m.Status === 'SignedOff';
  const compare = pdpScoresRevealed(m) ? pdpCompare(bySource.Self, bySource.Manager) : [];
  const assessment = pdpAssessmentFrom(m.Assessment);
  const agreed = {};
  CONFIG.PDP.PILLAR_KEYS.forEach(key => { const r = bySource.Agreed[key]; agreed[key] = r ? _pdpclScore(r.Score) : null; });
  const overall = pdpOverall(agreed);
  const panel = compare.length ? pdpPanelReasons(compare, overall, assessment) : [];
  const calibration = pdpCalibrationFrom(m.Calibration);
  return {
    meeting: m, id: m.id, name: _pdpclText(m.PersonName), levelKey: scoring.levelKey, held, set, names,
    bySource, compare, agreed, overall, assessment, calibration,
    agreedBand: pdpOverallBand(overall, assessment.boundary),
    panel, isPanel: panel.length > 0, state: pdpCaseState(m, panel),
  };
}

// Rule 1: the year's population. input = { meetings, cycles, framework, templates, rows, year }.
// -> { cases (held, scored Bi-Annuals of the year, sorted by CASE_STATES then name), notHeld (scored, not yet held) }
function pdpCalibrationCases(input) {
  const i = input || {};
  const year = Number(i.year);
  const cyc = new Map((i.cycles || []).map(c => [String(c.PersonID) + '|' + Number(c.CycleYear), c]));
  const byMeeting = new Map();
  (i.rows || []).forEach(r => { const k = String(r.MeetingID); if (!byMeeting.has(k)) byMeeting.set(k, []); byMeeting.get(k).push(r); });
  const order = CONFIG.PDP.CALIBRATION.CASE_STATES;
  const cases = [];
  let notHeld = 0;
  (i.meetings || []).forEach(m => {
    if (!m || m.MeetingType !== 'BiAnnual' || Number(m.CycleYear) !== year) return;
    const tpl = pdpTemplateForMeeting(i.templates || [], m);
    const c = pdpCalibrationCase({
      meeting: m, cycle: cyc.get(String(m.PersonID) + '|' + year) || null, framework: i.framework,
      def: tpl ? pdpParseJson(tpl.Definition) : null, rows: byMeeting.get(String(m.id)) || [],
    });
    if (!c) return;
    if (!c.held) { notHeld++; return; }
    cases.push(c);
  });
  cases.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.name.localeCompare(b.name));
  return { cases, notHeld };
}

// Rule 4: overall from the calibrated scores. boundaryBand = the panel's pick on a boundary total; when none is
// given and the total is unchanged from the agreed total, the band the manager agreed (N-442) is used.
// -> { total, band, pending, boundary: [a, b] | null, needsBand }
function pdpFinalOverall(calibrated, boundaryBand, c) {
  const o = pdpOverall(calibrated);
  if (o.pending) return Object.assign({}, o, { needsBand: false });
  if (!o.boundary) return Object.assign({}, o, { needsBand: false });
  let band = o.boundary.includes(boundaryBand) ? boundaryBand : null;
  if (!band && !boundaryBand && c && c.overall && c.overall.total === o.total && c.assessment && c.assessment.boundary
      && o.boundary.includes(c.assessment.boundary.band) && c.assessment.boundary.escalated !== true) band = c.assessment.boundary.band;
  return Object.assign({}, o, { band, needsBand: !band });
}

// Rule 3: the calibrated plan for a case. edit = { scores: { key: { score, rationale } }, boundaryBand }.
// -> { invalid: [text] (refuse outright), problems: [text] (still to do before lock), calibrated, rationales,
//      rows: [{ id, fields }], final }
function pdpCalibratedPlan(c, edit) {
  const e = edit || {};
  const es = e.scores || {};
  const max = CONFIG.PDP.ASSESS.RATIONALE_MAX;
  const invalid = [], problems = [];
  const calibrated = {}, rationales = {}, rows = [];
  CONFIG.PDP.PILLAR_KEYS.forEach(k => {
    const row = c.bySource.Agreed[k] || null;
    const name = c.names[k] || k;
    const x = es[k] || {};
    if (!row) { problems.push('There is no agreed score row for ' + name + '.'); calibrated[k] = null; rationales[k] = ''; return; }
    const savedScore = _pdpclScore(row.CalibratedScore);
    let score = x.score !== undefined ? _pdpclScore(x.score) : (Number.isInteger(savedScore) ? savedScore : c.agreed[k]);
    if (Number.isNaN(score)) { invalid.push('Scores are whole numbers from ' + CONFIG.PDP.SCORE_MIN + ' to ' + CONFIG.PDP.SCORE_MAX + '.'); score = null; }
    const rationale = _pdpclText(x.rationale !== undefined ? x.rationale : row.CalibrationRationale);
    if (rationale.length > max) invalid.push('Keep the reason for ' + name + ' under ' + max + ' characters.');
    const agreed = c.agreed[k];
    if (!c.isPanel && score !== agreed) invalid.push('Only panel cases can be adjusted: ' + name + ' must stay at the agreed score.');
    if (score == null) problems.push('Set the calibrated score for ' + name + '.');
    else if ((agreed == null || score !== agreed) && !rationale) problems.push('Give a reason for the calibrated score for ' + name + '.');
    calibrated[k] = score;
    rationales[k] = rationale.slice(0, max);
    rows.push({ id: row.id, fields: { CalibratedScore: score == null ? '' : score, CalibrationRationale: rationales[k] } });
  });
  const final = pdpFinalOverall(calibrated, e.boundaryBand, c);
  if (e.boundaryBand && final.boundary && !final.boundary.includes(e.boundaryBand)) invalid.push('A total of ' + final.total + ' can only be ' + final.boundary.join(' or ') + '.');
  if (final.needsBand) problems.push('The total is ' + final.total + ', on a band boundary: choose ' + final.boundary.join(' or ') + '.');
  return { invalid, problems, calibrated, rationales, rows, final };
}

// Rule 10: development pointers — the lowest pillars (ties in PILLAR_KEYS order), up to POINTERS_MAX, each with
// the next band's descriptor at the person's level. set = pdpFrameworkSet(...). -> [{ key, name, score, band, text }]
function pdpDevelopmentPointers(calibrated, set) {
  const bands = CONFIG.PDP.BANDS;
  const scored = CONFIG.PDP.PILLAR_KEYS.map(k => ({ key: k, score: _pdpclScore((calibrated || {})[k]) })).filter(x => Number.isInteger(x.score));
  if (!scored.length) return [];
  const low = Math.min(...scored.map(x => x.score));
  if (low >= CONFIG.PDP.SCORE_MAX) return [];
  const ranked = scored.slice().sort((a, b) => a.score - b.score || CONFIG.PDP.PILLAR_KEYS.indexOf(a.key) - CONFIG.PDP.PILLAR_KEYS.indexOf(b.key))
    .filter(x => x.score < CONFIG.PDP.SCORE_MAX).slice(0, CONFIG.PDP.CALIBRATION.POINTERS_MAX);
  return ranked.map(x => {
    const p = set && set.pillars ? set.pillars.find(y => y.key === x.key) : null;
    const next = bands[x.score - CONFIG.PDP.SCORE_MIN + 1];
    return { key: x.key, name: p ? p.name : x.key, score: x.score, band: next, text: p && p.bands[next] ? p.bands[next].text : '' };
  });
}

// Rule 5: what stops a lock. plan = pdpCalibratedPlan(c, edit).
function pdpLockProblems(c, plan) {
  const p = [];
  if (!c.held) p.push('The meeting has not been held yet.');
  if (pdpRatingsLocked(c.meeting)) p.push('These ratings are already locked.');
  return p.concat(plan.invalid, plan.problems);
}

// Rule 6: the writes for a lock. -> { rows: [{ id, fields }], meeting: patch }
function pdpLockWrites(c, plan, by, nowIso) {
  const rows = plan.rows.map(r => ({ id: r.id, fields: Object.assign({}, r.fields, { IsLocked: true }) }));
  const cal = pdpCalibrationLogged(Object.assign(pdpCalibrationFrom(c.meeting.Calibration), {
    final: { total: plan.final.total, band: plan.final.band, boundaryBand: plan.final.boundary ? plan.final.band : null },
    panelReasons: c.panel.slice(),
    pointers: pdpDevelopmentPointers(plan.calibrated, c.set).map(x => x.key),
  }), { at: nowIso, by: by, action: 'lock' });
  return { rows, meeting: { RatingsLockedAt: nowIso, RatingsLockedBy: by, Calibration: cal } };
}

// A draft save's meeting patch (the draft final and a 'calibrate' log entry).
function pdpCalibrationDraftPatch(c, plan, by, nowIso) {
  const cal = pdpCalibrationLogged(Object.assign(pdpCalibrationFrom(c.meeting.Calibration), {
    final: plan.final.pending ? null : { total: plan.final.total, band: plan.final.band, boundaryBand: plan.final.boundary ? plan.final.band : null },
  }), { at: nowIso, by: by, action: 'calibrate' });
  return { Calibration: cal };
}

// Rule 7: Admin unlock. -> { problems, rows: [{ id, fields }], meeting: patch }
function pdpUnlockPlan(c, reason, by, nowIso) {
  const why = _pdpclText(reason);
  const problems = [];
  if (!pdpRatingsLocked(c.meeting)) problems.push('These ratings are not locked.');
  if (!why) problems.push('Give a reason for unlocking.');
  if (why.length > CONFIG.PDP.ASSESS.NOTE_MAX) problems.push('Keep the reason under ' + CONFIG.PDP.ASSESS.NOTE_MAX + ' characters.');
  const rows = CONFIG.PDP.PILLAR_KEYS.map(k => c.bySource.Agreed[k]).filter(Boolean).map(r => ({ id: r.id, fields: { IsLocked: false } }));
  const cal = pdpCalibrationLogged(pdpCalibrationFrom(c.meeting.Calibration), { at: nowIso, by: by, action: 'unlock', reason: why });
  return { problems, rows, meeting: { RatingsLockedAt: '', RatingsLockedBy: '', RatingsReleasedAt: '', RatingsReleasedBy: '', Calibration: cal } };
}

// Rule 8: what stops the line manager / CSD releasing. access = pdpTeamAccess(role, email, meeting).
function pdpReleaseProblems(meeting, access, note) {
  const p = [];
  if (!access || !access.run) p.push('Only the person’s line manager or CSD can release their ratings.');
  if (!pdpRatingsLocked(meeting)) p.push('The calibration panel has not locked these ratings yet.');
  if (pdpRatingsReleased(meeting)) p.push('These ratings have already been released.');
  if (_pdpclText(note).length > CONFIG.PDP.ASSESS.NOTE_MAX) p.push('Keep the note under ' + CONFIG.PDP.ASSESS.NOTE_MAX + ' characters.');
  return p;
}

function pdpReleasePatch(meeting, note, by, nowIso) {
  const cal = pdpCalibrationLogged(Object.assign(pdpCalibrationFrom(meeting.Calibration), { releaseNote: _pdpclText(note) }), { at: nowIso, by: by, action: 'release' });
  return { RatingsReleasedAt: nowIso, RatingsReleasedBy: by, Calibration: cal };
}

// The band that counts for the distribution: the locked final band, else the agreed band (null = pending).
function pdpCaseBand(c) {
  if (pdpRatingsLocked(c.meeting) && c.calibration.final && c.calibration.final.band) return c.calibration.final.band;
  return c.agreedBand || null;
}

// Rule 9: distribution of banded cases against CONFIG.PDP.CALIBRATION.DISTRIBUTION (warn only).
// -> { counts, pct, inRange, outOfRange: [band], pending, notHeld, banded, total }
function pdpDistribution(cases, notHeld) {
  const bands = CONFIG.PDP.BANDS, T = CONFIG.PDP.CALIBRATION.DISTRIBUTION;
  const counts = {}, pct = {}, inRange = {};
  bands.forEach(b => { counts[b] = 0; });
  let pending = 0;
  (cases || []).forEach(c => { const b = pdpCaseBand(c); if (b && b in counts) counts[b]++; else pending++; });
  const banded = bands.reduce((a, b) => a + counts[b], 0);
  bands.forEach(b => {
    pct[b] = banded ? _pdpclRound(counts[b] * 100 / banded) : null;
    inRange[b] = pct[b] == null ? null : (pct[b] >= T[b][0] && pct[b] <= T[b][1]);
  });
  return {
    counts, pct, inRange, outOfRange: bands.filter(b => inRange[b] === false),
    pending, notHeld: Number(notHeld) || 0, banded, total: (cases || []).length,
  };
}

// Rule 11: what the employee sees of the calibration. -> { state: none | finalising | released, ... }
//   none       not locked yet: the N-442 agreed view (escalated pillars say "With calibration panel")
//   finalising locked, not released: "Your ratings are being finalised." — no calibrated value is exposed
//   released   total, band, per-pillar calibrated score, pointers, release note
function pdpResultView(meeting, agreedByKey, set) {
  const m = meeting || {};
  if (pdpRatingsReleased(m)) {
    const cal = pdpCalibrationFrom(m.Calibration);
    const calibrated = {};
    CONFIG.PDP.PILLAR_KEYS.forEach(k => { const r = (agreedByKey || {})[k]; calibrated[k] = r ? _pdpclScore(r.CalibratedScore) : null; });
    const o = pdpOverall(calibrated);
    const band = cal.final && cal.final.band ? cal.final.band : o.band;
    const pillars = CONFIG.PDP.PILLAR_KEYS.map(k => {
      const p = set && set.pillars ? set.pillars.find(y => y.key === k) : null;
      return { key: k, name: p ? p.name : k, score: calibrated[k] };
    });
    return { state: 'released', total: cal.final && cal.final.total != null ? cal.final.total : o.total, band, pillars,
      pointers: pdpDevelopmentPointers(calibrated, set), note: cal.releaseNote, releasedAt: _pdpclText(m.RatingsReleasedAt) };
  }
  if (pdpRatingsLocked(m)) return { state: 'finalising' };
  return { state: 'none' };
}
