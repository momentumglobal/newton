// tests/assert-pdp-calibrate.js — calibration panel, distribution, lock, release (N-443 / PDP-11). Loads AFTER
// tests/assert-pdp-assess.js. The pure rules (pdp-calibrate.js, the N-443 fields of pdpAssessView) are exercised
// directly; the API writers and the markup are checked from source / by rendering markup strings, because the
// runner is synchronous and has no DOM. Spec: specs/N-443.md.

const _CL_E = { emp: 'tia.tp@mg.test', lm: 'sam.sdm@mg.test', csd: 'cara.csd@mg.test', ops: 'pat.ops@mg.test' };
const _CL_KEYS = ['own-it', 'decide', 'communicate', 'support', 'curious', 'adapt'];

function _clFramework(level, track) {
  const rows = [];
  let id = 1;
  _CL_KEYS.forEach((k, i) => ['Below', 'Meets', 'Exceeding'].forEach(b => rows.push({
    id: id++, Level: level, Track: track, PillarKey: k, Pillar: 'Pillar ' + (i + 1), Band: b,
    Descriptor: k + ' ' + b, SortOrder: i + 1, IsActive: true,
  })));
  return rows;
}
const _CL_FW = _clFramework('L4', 'IC');
const _CL_DEF = { schema: 1, sections: [{ key: 's', title: 'Scoring', blocks: [{ key: 'score', type: 'scoring', label: 'Score', required: true }] }] };
const _CL_TPL = [{ id: 7, MeetingType: 'BiAnnual', VersionNo: 1, Status: 'Published', Definition: JSON.stringify(_CL_DEF) }];

function _clMeeting(o) {
  return Object.assign({
    id: 88, PersonID: 4, PersonName: 'Tia', PersonEmail: _CL_E.emp, LineManagerEmail: _CL_E.lm, CSDEmail: _CL_E.csd, ReadOnlyEmails: '',
    CycleYear: 2027, MeetingType: 'BiAnnual', Period: '2027-07', DueDate: '2027-07-31T00:00:00Z', Status: 'Held', TemplateID: 7,
    SelfScoredAt: '2027-07-05T10:00:00Z', ManagerScoredAt: '2027-07-05T11:00:00Z', ScoresRevealedAt: '2027-07-05T11:10:00Z',
    Assessment: '', EmployeeSignedAt: '', ManagerSignedAt: '',
    RatingsLockedAt: '', RatingsLockedBy: '', RatingsReleasedAt: '', RatingsReleasedBy: '', Calibration: '',
  }, o || {});
}
function _clCycle(o) { return Object.assign({ id: 3, PersonID: 4, CycleYear: 2027, BiAnnualScored: true, ScoringLevel: 'L4-IC' }, o || {}); }

// One side's six rows. scores = [n|null x6]; extra[i] merges into row i (e.g. CalibratedScore).
function _clRows(meetingId, source, scores, extra) {
  const base = source === 'Self' ? 100 : (source === 'Manager' ? 200 : 300);
  return _CL_KEYS.map((k, i) => Object.assign({
    id: meetingId * 1000 + base + i, MeetingID: meetingId, PillarKey: k, Source: source, Score: scores[i], Rationale: source + ' ' + k,
    ScoringLevel: 'L4-IC', SubmittedAt: '2027-07-05T10:00:00Z', CalibratedScore: null, CalibrationRationale: '', IsLocked: false,
    PersonID: 4, PersonEmail: _CL_E.emp, LineManagerEmail: _CL_E.lm, CSDEmail: _CL_E.csd, ReadOnlyEmails: '',
  }, (extra && extra[i]) || {}));
}
// A whole case: self / manager / agreed score arrays (agreed null = escalated pillar).
function _clCase(self, mgr, agreed, mo, agreedExtra) {
  const m = _clMeeting(mo);
  const rows = _clRows(m.id, 'Self', self).concat(_clRows(m.id, 'Manager', mgr), _clRows(m.id, 'Agreed', agreed, agreedExtra));
  return pdpCalibrationCase({ meeting: m, cycle: _clCycle(), framework: _CL_FW, def: _CL_DEF, rows });
}
const _CL_MEETS = [2, 2, 2, 2, 2, 2];
function _clThrows(fn) { try { fn(); } catch (e) { return e.message; } return ''; }
function _clSlice(src, from, to) { const a = src.indexOf(from); return src.slice(a, src.indexOf(to, a + from.length)); }

ASSERTIONS.push(
  {
    name: 'N-443 AC1 CONFIG.PDP.CALIBRATION holds targets, pointers, log cap, states; unlock capability Admin only',
    fn: function () {
      const C = CONFIG.PDP.CALIBRATION;
      _assertEqual(C.DISTRIBUTION, { Below: [5, 10], Meets: [65, 75], Exceeding: [15, 25] }, 'AC1 targets');
      _assertEqual(Object.keys(C.DISTRIBUTION), CONFIG.PDP.BANDS, 'AC1 keyed by BANDS');
      _assertEqual([C.POINTERS_MAX, C.LOG_MAX], [2, 50], 'AC1 pointers, log cap');
      _assertEqual(C.CASE_STATES, ['needsPanel', 'ready', 'locked', 'released'], 'AC1 states');
      _assertEqual(CONFIG.ROLE_CAPABILITIES.pdpCalibrationUnlock, ['admin'], 'AC1 unlock = Admin');
      _assertEqual(roleCan('people_ops', 'pdpCalibrationUnlock'), false, 'AC1 People Ops cannot unlock');
      _assertEqual(Object.values(CONFIG.PDP.REMINDERS.TYPES).includes(C.RELEASE.TYPE), false, 'AC1/AC10 release type is not a reminder type (never swept)');
      ['pdp-calibrate.js', 'pdp-calibrate-ui.js'].forEach(f => {
        const src = ALL_SOURCES[f].replace(/\/\/.*$/gm, '');
        _assertEqual(/\b(65|75|15|25)\b/.test(src), false, 'AC1 ' + f + ' has no target literal');
      });
    },
  },
  {
    name: 'N-443 AC2 PDPMeetings gains the five calibration columns; Self / Manager rows still drop calibration fields',
    fn: function () {
      const cols = pdpListColumns(CONFIG.PDP.LISTS.MEETINGS);
      ['RatingsLockedAt', 'RatingsLockedBy', 'RatingsReleasedAt', 'RatingsReleasedBy', 'Calibration'].forEach(c => {
        _assertEqual(cols.includes(c) && CONFIG.LIST_FIELDS.PDPMeetings.includes(c), true, 'AC2 ' + c);
      });
      const out = pdpCleanMeetings({ RatingsLockedAt: '2027-07-10T09:00:00Z', RatingsLockedBy: 'Pat.Ops@MG.test', Calibration: { schema: 1 } }, 'update');
      _assertEqual([out.RatingsLockedBy, typeof out.Calibration], ['pat.ops@mg.test', 'string'], 'AC2 email lower-cased, JSON stored as text');
      _assertEqual(_clThrows(() => pdpCleanMeetings({ Calibration: { x: 'y'.repeat(CONFIG.PDP.JSON_MAX_CHARS + 1) } }, 'update')) !== '', true, 'AC2 Calibration capped at JSON_MAX_CHARS');
      const cleared = pdpCleanMeetings({ RatingsLockedAt: '', RatingsLockedBy: '' }, 'update');
      _assertEqual([cleared.RatingsLockedAt, cleared.RatingsLockedBy], [null, null], 'AC2 unlock clears the lock columns');
      const self = pdpCleanScores({ CalibratedScore: 3, IsLocked: true, Score: 2 }, 'update', 'Self');
      _assertEqual(['CalibratedScore' in self, 'IsLocked' in self, self.Score], [false, false, 2], 'AC2 Self rows never carry calibration');
      const ag = pdpCleanScores({ CalibratedScore: 3, CalibrationRationale: 'x', IsLocked: true }, 'update', 'Agreed');
      _assertEqual([ag.CalibratedScore, ag.IsLocked], [3, true], 'AC2 Agreed rows do');
      _assertEqual(/RatingsLocked|Calibration/.test(String(pdpAccessKey)), false, 'AC2 pdpAccessKey unchanged');
    },
  },
  {
    name: 'N-443 AC3 population: held scored Bi-Annuals of the year; notScored / noDescriptors / Skipped excluded; not-held counted',
    fn: function () {
      const mk = (id, o) => _clMeeting(Object.assign({ id, PersonID: id, PersonName: 'P' + id }, o));
      const meetings = [
        mk(1), mk(2, { Status: 'PrepOpen', ScoresRevealedAt: '' }), mk(3, { Status: 'Skipped' }), mk(4), mk(5), mk(6, { CycleYear: 2026 }),
        mk(7, { MeetingType: 'Quarterly' }),
      ];
      const cycles = [1, 2, 3, 6, 7].map(id => _clCycle({ PersonID: id }))
        .concat([_clCycle({ PersonID: 4, BiAnnualScored: false }), _clCycle({ PersonID: 5, ScoringLevel: 'L5-IC' })]);
      const rows = [].concat(...[1, 2, 4, 5].map(id => _clRows(id, 'Self', _CL_MEETS).concat(_clRows(id, 'Manager', _CL_MEETS), _clRows(id, 'Agreed', _CL_MEETS))));
      const r = pdpCalibrationCases({ meetings, cycles, framework: _CL_FW, templates: _CL_TPL, rows, year: 2027 });
      _assertEqual(r.cases.map(c => c.id), [1], 'AC3 only the held, scored 2027 Bi-Annual');
      _assertEqual(r.notHeld, 1, 'AC3 a scorable Bi-Annual not yet held is counted as Not yet held');
      _assertEqual(pdpDistribution(r.cases, r.notHeld).notHeld, 1, 'AC3 distribution carries notHeld');
    },
  },
  {
    name: 'N-443 AC4 case state: gap-2 / boundary escalated / Below / Exceeding = needsPanel; Meets = ready; locked; released',
    fn: function () {
      _assertEqual(_clCase([1, 2, 2, 2, 2, 2], [3, 2, 2, 2, 2, 2], [null, 2, 2, 2, 2, 2]).state, 'needsPanel', 'AC4 2-point gap');
      _assertEqual(_clCase([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1]).state, 'needsPanel', 'AC4 Below overall');
      _assertEqual(_clCase([3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 3, 3]).state, 'needsPanel', 'AC4 Exceeding overall');
      const bnd = _clCase([3, 3, 3, 2, 2, 2], [3, 3, 3, 2, 2, 2], [3, 3, 3, 2, 2, 2], { Assessment: JSON.stringify({ boundary: { total: 2.5, band: null, escalated: true } }) });
      _assertEqual([bnd.state, bnd.panel.some(p => p.kind === 'boundary')], ['needsPanel', true], 'AC4 escalated boundary');
      _assertEqual(_clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS).state, 'ready', 'AC4 Meets with no reasons = ready');
      _assertEqual(_clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS, { RatingsLockedAt: '2027-07-20T09:00:00Z' }).state, 'locked', 'AC4 locked');
      _assertEqual(_clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS, { RatingsLockedAt: '2027-07-20T09:00:00Z', RatingsReleasedAt: '2027-07-21T09:00:00Z' }).state, 'released', 'AC4 released');
    },
  },
  {
    name: 'N-443 AC5 calibrated plan: score range, reasons, escalated pillars, non-panel cases fixed',
    fn: function () {
      const esc = _clCase([1, 2, 2, 2, 2, 2], [3, 2, 2, 2, 2, 2], [null, 2, 2, 2, 2, 2]);
      _assertEqual(pdpCalibratedPlan(esc, { scores: { 'own-it': { score: 4 } } }).invalid.length > 0, true, 'AC5 out of range refused');
      _assertEqual(pdpCalibratedPlan(esc, { scores: { 'own-it': { score: 1.5 } } }).invalid.length > 0, true, 'AC5 non-integer refused');
      const none = pdpCalibratedPlan(esc, {});
      _assertEqual(none.problems.some(p => /Set the calibrated score for Pillar 1/.test(p)), true, 'AC5 escalated pillar needs a calibrated score');
      const noWhy = pdpCalibratedPlan(esc, { scores: { 'own-it': { score: 2 } } });
      _assertEqual(noWhy.problems, ['Give a reason for the calibrated score for Pillar 1.'], 'AC5 escalated pillar needs a reason, naming it');
      const ok = pdpCalibratedPlan(esc, { scores: { 'own-it': { score: 2, rationale: 'Panel view' } } });
      _assertEqual([ok.invalid, ok.problems, ok.final.total, ok.final.band], [[], [], 2, 'Meets'], 'AC5 resolved');
      const ch = pdpCalibratedPlan(esc, { scores: { 'own-it': { score: 2, rationale: 'x' }, decide: { score: 3 } } });
      _assertEqual(ch.problems, ['Give a reason for the calibrated score for Pillar 2.'], 'AC5 a change without a reason blocks the lock, naming the pillar');
      _assertEqual(ch.rows.length === 6 && ch.rows.every(r => !('IsLocked' in r.fields)), true, 'AC5 draft rows never set IsLocked');
      const ready = _clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS);
      _assertEqual(pdpCalibratedPlan(ready, {}).problems, [], 'AC5 unchanged scores need no reason');
      _assertEqual(/Only panel cases/.test(pdpCalibratedPlan(ready, { scores: { decide: { score: 3, rationale: 'x' } } }).invalid.join(' ')), true, 'AC5 non-panel case cannot be adjusted');
    },
  },
  {
    name: 'N-443 AC6 final overall: 2.3 Meets; boundary needs a band; N-442 band pre-filled when unchanged; outside pair refused',
    fn: function () {
      const c = _clCase([1, 2, 2, 2, 2, 2], [3, 2, 2, 2, 2, 2], [null, 2, 2, 2, 2, 2]);
      const p = pdpCalibratedPlan(c, { scores: { 'own-it': { score: 2, rationale: 'r' }, curious: { score: 3, rationale: 'r' }, adapt: { score: 3, rationale: 'r' } } });
      _assertEqual([p.final.total, p.final.band], [2.3, 'Meets'], 'AC6 2,2,2,2,3,3 -> 2.3 Meets');
      const low = { 'own-it': { score: 1, rationale: 'r' }, decide: { score: 1, rationale: 'r' }, communicate: { score: 1, rationale: 'r' } };
      const b = pdpCalibratedPlan(c, { scores: low });
      _assertEqual([b.final.total, b.final.boundary, b.final.needsBand], [1.5, ['Below', 'Meets'], true], 'AC6 sum 9 -> boundary, band needed');
      const b2 = pdpCalibratedPlan(c, { scores: low, boundaryBand: 'Meets' });
      _assertEqual([b2.final.band, b2.problems], ['Meets', []], 'AC6 band chosen');
      _assertEqual(pdpCalibratedPlan(c, { scores: low, boundaryBand: 'Exceeding' }).invalid.length > 0, true, 'AC6 band outside the pair refused');
      const agreedB = _clCase([3, 3, 3, 2, 2, 2], [3, 3, 3, 2, 2, 2], [3, 3, 3, 2, 2, 2], { Assessment: JSON.stringify({ boundary: { total: 2.5, band: 'Exceeding', escalated: false } }) });
      _assertEqual(pdpCalibratedPlan(agreedB, {}).final.band, 'Exceeding', 'AC6 manager-agreed boundary band pre-filled when the total is unchanged');
    },
  },
  {
    name: 'N-443 AC7 lock: problems named; rows (IsLocked + CalibratedScore) before the meeting marker; distribution never blocks',
    fn: function () {
      const notHeld = _clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS, { Status: 'PrepOpen' });
      _assertEqual(pdpLockProblems(notHeld, pdpCalibratedPlan(notHeld, {})).includes('The meeting has not been held yet.'), true, 'AC7 not held');
      const esc = _clCase([1, 2, 2, 2, 2, 2], [3, 2, 2, 2, 2, 2], [null, 2, 2, 2, 2, 2]);
      _assertEqual(pdpLockProblems(esc, pdpCalibratedPlan(esc, {})).length > 0, true, 'AC7 unresolved escalation blocks the lock');
      const ready = _clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS);
      const plan = pdpCalibratedPlan(ready, {});
      _assertEqual(pdpLockProblems(ready, plan), [], 'AC7 ready case locks');
      const w = pdpLockWrites(ready, plan, _CL_E.ops, '2027-07-20T09:00:00Z');
      _assertEqual(w.rows.length === 6 && w.rows.every(r => r.fields.IsLocked === true && r.fields.CalibratedScore === 2), true, 'AC7 six rows locked at the calibrated score');
      _assertEqual([w.meeting.RatingsLockedAt, w.meeting.RatingsLockedBy, w.meeting.Calibration.final.band, w.meeting.Calibration.log.slice(-1)[0].action],
        ['2027-07-20T09:00:00Z', _CL_E.ops, 'Meets', 'lock'], 'AC7 meeting marker + final + log');
      const lockedAlready = _clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS, { RatingsLockedAt: '2027-07-20T09:00:00Z' });
      _assertEqual(pdpLockProblems(lockedAlready, pdpCalibratedPlan(lockedAlready, {})).includes('These ratings are already locked.'), true, 'AC7 already locked');
      const body = _clSlice(ALL_SOURCES['api-pdp.js'], 'async function _pdpCalLock', 'async function lockPdpRatings');
      const rowsAt = body.indexOf('_pdpCalWriteRows(w.rows)'), markAt = body.indexOf('updatePdpMeeting(c.meeting.id, w.meeting)');
      _assertEqual(rowsAt > -1 && markAt > rowsAt, true, 'AC7 rows before the meeting marker');
      _assertEqual(/IsLocked === true/.test(body) && /Lock again/.test(body), true, 'AC7 re-read check; a retry finishes the job');
      const lp = _clSlice(ALL_SOURCES['pdp-calibrate.js'], 'function pdpLockProblems', 'function pdpLockWrites');
      _assertEqual(/istribution/.test(lp), false, 'AC7 the distribution is not a lock problem (D2)');
    },
  },
  {
    name: 'N-443 AC8 lock all non-panel cases: ready cases only, at agreed scores, skipped reported',
    fn: function () {
      const body = _clSlice(ALL_SOURCES['api-pdp.js'], 'async function lockPdpNonPanel', 'async function unlockPdpRatings');
      _assertEqual(/c\.state === 'ready'/.test(body) && /_pdpCalLock\(who, c, null\)/.test(body), true, 'AC8 ready cases, agreed scores (no edit)');
      _assertEqual(/skipped\.push/.test(body) && /onProgress/.test(body), true, 'AC8 skipped names + progress');
    },
  },
  {
    name: 'N-443 AC9 unlock: Admin only, reason required, clears lock AND release, logged, IsLocked off',
    fn: function () {
      const c = _clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS, { RatingsLockedAt: '2027-07-20T09:00:00Z', RatingsReleasedAt: '2027-07-21T09:00:00Z' });
      _assertEqual(pdpUnlockPlan(c, '  ', 'a@mg.test', 'now').problems, ['Give a reason for unlocking.'], 'AC9 reason required');
      const p = pdpUnlockPlan(c, 'Wrong level used', 'a@mg.test', '2027-07-22T09:00:00Z');
      _assertEqual([p.problems, p.rows.length, p.rows.every(r => r.fields.IsLocked === false)], [[], 6, true], 'AC9 six rows unlocked');
      _assertEqual([p.meeting.RatingsLockedAt, p.meeting.RatingsReleasedAt, p.meeting.RatingsReleasedBy], ['', '', ''], 'AC9 lock and release cleared');
      _assertEqual(p.meeting.Calibration.log.slice(-1)[0], { at: '2027-07-22T09:00:00Z', by: 'a@mg.test', action: 'unlock', reason: 'Wrong level used' }, 'AC9 logged with reason');
      _assertEqual(pdpUnlockPlan(_clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS), 'x', 'a', 'n').problems, ['These ratings are not locked.'], 'AC9 not locked');
      const body = _clSlice(ALL_SOURCES['api-pdp.js'], 'async function unlockPdpRatings', 'async function releasePdpRatings');
      _assertEqual(/roleCan\(who\.role, 'pdpCalibrationUnlock'\)/.test(body), true, 'AC9 Admin-only gate');
      let cal = pdpCalibrationFrom('');
      for (let i = 0; i < 60; i++) cal = pdpCalibrationLogged(cal, { at: 't' + i, by: 'b', action: 'calibrate' });
      _assertEqual([cal.log.length, cal.log[0].at], [CONFIG.PDP.CALIBRATION.LOG_MAX, 't10'], 'AC9 log trimmed oldest-first to LOG_MAX');
    },
  },
  {
    name: 'N-443 AC10 release: record LM / CSD only, after lock, once; notice only when PDPMode is On',
    fn: function () {
      const m = _clMeeting({ RatingsLockedAt: '2027-07-20T09:00:00Z' });
      _assertEqual(pdpReleaseProblems(m, pdpTeamAccess('admin', _CL_E.lm, m), ''), [], 'AC10 LM may release');
      _assertEqual(pdpReleaseProblems(m, pdpTeamAccess('admin', _CL_E.csd, m), ''), [], 'AC10 CSD may release');
      _assertEqual(pdpReleaseProblems(m, pdpTeamAccess('admin', 'other.admin@mg.test', m), '').length, 1, 'AC10 an unrelated Admin is refused');
      _assertEqual(pdpReleaseProblems(m, pdpTeamAccess('people_ops', _CL_E.emp, m), '').length, 1, 'AC10 the employee is refused');
      const open = _clMeeting();
      _assertEqual(pdpReleaseProblems(open, pdpTeamAccess('admin', _CL_E.lm, open), '').includes('The calibration panel has not locked these ratings yet.'), true, 'AC10 before lock refused');
      const rel = _clMeeting({ RatingsLockedAt: 'x', RatingsReleasedAt: '2027-07-21T09:00:00Z' });
      _assertEqual(pdpReleaseProblems(rel, pdpTeamAccess('admin', _CL_E.lm, rel), '').includes('These ratings have already been released.'), true, 'AC10 once');
      const patch = pdpReleasePatch(m, ' Well done ', _CL_E.lm, '2027-07-21T09:00:00Z');
      _assertEqual([patch.RatingsReleasedAt, patch.RatingsReleasedBy, patch.Calibration.releaseNote, patch.Calibration.log.slice(-1)[0].action],
        ['2027-07-21T09:00:00Z', _CL_E.lm, 'Well done', 'release'], 'AC10 release patch');
      const src = ALL_SOURCES['api-pdp.js'];
      const body = _clSlice(src, 'async function releasePdpRatings', '// ── N-441 (PDP-9)');
      _assertEqual(/_pdpTeamMeeting\(meetingId, \{ allowSigned: true \}\)/.test(body), true, 'AC10 Ghost Mode / live gate / LM-CSD check via _pdpTeamMeeting');
      _assertEqual(/sw\.mode === CONFIG\.PDP\.MODES\[2\]/.test(body) && body.indexOf('MODES[2]') < body.indexOf('fireNotification'), true, 'AC10 notice only when On');
      _assertEqual(/recipients: \[_pdpEmail\(m\.PersonEmail\)\]/.test(body), true, 'AC10 notice to the employee');
      _assertEqual(/Object\.values\(CONFIG\.PDP\.REMINDERS\.TYPES\)/.test(_clSlice(src, 'async function _pdpOwnReminderRows', 'async function _pdpClearReminders')), true, 'AC10 reminder sweep still limited to REMINDERS.TYPES');
    },
  },
  {
    name: 'N-443 AC11 distribution: percentages, out-of-range bands, pending excluded, nothing banded yet',
    fn: function () {
      const mk = band => ({ meeting: {}, calibration: pdpCalibrationFrom(''), agreedBand: band });
      const ten = [mk('Below')].concat(Array.from({ length: 7 }, () => mk('Meets')), [mk('Exceeding'), mk('Exceeding')]);
      const d = pdpDistribution(ten, 0);
      _assertEqual([d.pct.Below, d.pct.Meets, d.pct.Exceeding, d.outOfRange], [10, 70, 20, []], 'AC11 10 / 70 / 20 all in range');
      const d2 = pdpDistribution(ten.slice(1).concat([mk(null)]), 2);
      _assertEqual([d2.counts.Below, d2.inRange.Below, d2.outOfRange.includes('Below'), d2.pending, d2.banded, d2.notHeld], [0, false, true, 1, 9, 2], 'AC11 no Below = out of range; pending excluded');
      _assertEqual(pdpDistribution([mk(null)], 0).pct.Meets, null, 'AC11 nothing banded -> no %');
      const lockedCase = { meeting: { RatingsLockedAt: 'x' }, calibration: { final: { band: 'Exceeding' } }, agreedBand: 'Meets' };
      _assertEqual(pdpCaseBand(lockedCase), 'Exceeding', 'AC11 a locked case counts its final band');
      const ui = _pdpclDistHtml({ distribution: d2 });
      _assertEqual(/Outside the target distribution/.test(ui) && /pdpcl-warn/.test(ui), true, 'AC11 warning shown (warn token)');
      _assertEqual(/Not enough results yet/.test(_pdpclDistHtml({ distribution: pdpDistribution([], 0) })), true, 'AC11 empty message');
    },
  },
  {
    name: 'N-443 AC12 development pointers: lowest pillars, ties in pillar order, next-band descriptor; all 3s none',
    fn: function () {
      const set = pdpFrameworkSet(_CL_FW, 'L4', 'IC');
      const p = pdpDevelopmentPointers({ 'own-it': 1, decide: 2, communicate: 2, support: 3, curious: 3, adapt: 3 }, set);
      _assertEqual(p.map(x => [x.key, x.band, x.text]), [['own-it', 'Meets', 'own-it Meets'], ['decide', 'Exceeding', 'decide Exceeding']], 'AC12 1 then the first 2');
      const tie = pdpDevelopmentPointers({ 'own-it': 3, decide: 2, communicate: 3, support: 2, curious: 2, adapt: 3 }, set);
      _assertEqual(tie.map(x => x.key), ['decide', 'support'], 'AC12 ties broken by PILLAR_KEYS order, capped at POINTERS_MAX');
      _assertEqual(pdpDevelopmentPointers({ 'own-it': 3, decide: 3, communicate: 3, support: 3, curious: 3, adapt: 3 }, set), [], 'AC12 all 3s -> no pointers');
    },
  },
  {
    name: 'N-443 AC13 employee view: agreed view before lock; "being finalised" with no calibrated values; full result once released',
    fn: function () {
      const set = pdpFrameworkSet(_CL_FW, 'L4', 'IC');
      const agreed = pdpScoresBySource(_clRows(88, 'Agreed', _CL_MEETS, _CL_KEYS.map((k, i) => ({ CalibratedScore: i === 0 ? 1 : 2 })))).Agreed;
      _assertEqual(pdpResultView(_clMeeting(), agreed, set).state, 'none', 'AC13 before lock');
      const fin = pdpResultView(_clMeeting({ RatingsLockedAt: 'x' }), agreed, set);
      _assertEqual(fin, { state: 'finalising' }, 'AC13 locked, not released: no values in the view model');
      const relM = _clMeeting({ RatingsLockedAt: 'x', RatingsReleasedAt: '2027-07-21T09:00:00Z', Calibration: JSON.stringify({ final: { total: 1.8, band: 'Meets' }, releaseNote: 'Great half' }) });
      const rel = pdpResultView(relM, agreed, set);
      _assertEqual([rel.state, rel.total, rel.band, rel.pillars.map(x => x.score), rel.pointers[0].key, rel.note], ['released', 1.8, 'Meets', [1, 2, 2, 2, 2, 2], 'own-it', 'Great half'], 'AC13 released result');
      // Markup: the employee side never prints a calibrated score before release.
      const base = { side: 'self', meeting: relM, panel: [], compare: [] };
      const finHtml = _pdpasCalibrationHtml(Object.assign({}, base, { result: fin }), false);
      _assertEqual(/being finalised/.test(finHtml) && !/Your final ratings/.test(finHtml), true, 'AC13 finalising markup');
      _assertEqual(_pdpasCalibrationHtml(Object.assign({}, base, { result: { state: 'none' } }), false), '', 'AC13 nothing extra before lock');
      const relHtml = _pdpasCalibrationHtml(Object.assign({}, base, { result: rel }), false);
      _assertEqual(/Your final ratings/.test(relHtml) && /1\.8 · Meets/.test(relHtml) && /Great half/.test(relHtml) && /own-it Meets/.test(relHtml), true, 'AC13 released markup');
      const xss = _pdpasCalibrationHtml(Object.assign({}, base, { result: Object.assign({}, rel, { note: '<img src=x>' }) }), false);
      _assertEqual(/<img/.test(xss), false, 'AC13 release note escaped');
      // The view model: N-443 fields; canRelease for the record's LM only once locked.
      const v = pdpAssessView({
        meeting: _clMeeting({ RatingsLockedAt: '2027-07-20T09:00:00Z' }), cycle: _clCycle(), framework: _CL_FW, def: _CL_DEF,
        rows: _clRows(88, 'Self', _CL_MEETS).concat(_clRows(88, 'Manager', _CL_MEETS), _clRows(88, 'Agreed', _CL_MEETS)),
        role: 'admin', email: _CL_E.lm, live: true, now: new Date('2027-07-22T00:00:00Z'),
      });
      _assertEqual([v.ratingsLocked, v.ratingsReleased, v.canRelease, v.canAgree], [true, false, true, false], 'AC13/AC14 manager may release; agreed scores locked');
      const mgrHtml = _pdpasCalibrationHtml(v, false);
      _assertEqual(/Release to employee/.test(mgrHtml) && /Not yet released/.test(mgrHtml), true, 'AC13 release control for the LM');
      _assertEqual(/Release to employee/.test(_pdpasCalibrationHtml(v, true)), false, 'AC13 no release control read-only (Ghost / preview)');
    },
  },
  {
    name: 'N-443 AC14 agreed scores and calibration refuse once locked',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'];
      const agreed = _clSlice(src, 'async function savePdpAgreed', '// ── N-443 (PDP-11)');
      _assertEqual(/view\.ratingsLocked/.test(agreed) && /locked by the calibration panel/.test(agreed), true, 'AC14 savePdpAgreed refuses');
      const cal = _clSlice(src, 'async function savePdpCalibration', 'async function _pdpCalLock');
      _assertEqual(/pdpRatingsLocked\(c\.meeting\)/.test(cal) && /throw new Error/.test(cal), true, 'AC14 savePdpCalibration refuses');
    },
  },
  {
    name: 'N-443 AC15 gates: panel = pdpAdmin; writes need live + no Ghost; no own record; Leadership nothing',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'];
      const who = _clSlice(src, 'async function _pdpCalWho', 'function _pdpCalVisible');
      _assertEqual(/roleCan\(who\.role, 'pdpAdmin'\)/.test(who) && /write && who\.ghost/.test(who) && /write && gate\.state !== 'live'/.test(who), true, 'AC15 panel gate');
      _assertEqual(roleCan('leadership', 'pdpAdmin'), false, 'AC15 Leadership is not on the panel');
      const cc = _clSlice(src, 'async function _pdpCalCase', 'async function _pdpCalWriteRows');
      _assertEqual(/_pdpCalWho\(true\)/.test(cc) && /cannot calibrate your own ratings/.test(cc), true, 'AC15 writers checked; own record refused');
      const load = _clSlice(src, 'async function loadPdpCalibration', 'async function _pdpCalCase');
      _assertEqual(/readOnly: who\.ghost \|\| gate\.state !== 'live'/.test(load) && /_pdpCalVisible/.test(load), true, 'AC15 preview / Ghost read-only; rows via pdpVisibleItems');
      const setup = ALL_SOURCES['pdp-setup.js'];
      _assertEqual(/pdps-tab-calibration/.test(setup) && /pdpclTabHtml\(\)/.test(setup), true, 'AC15 Calibration tab on PDP Setup (pdpAdmin page)');
      const ui = ALL_SOURCES['pdp-calibrate-ui.js'];
      _assertEqual(/d\.canUnlock/.test(ui) && /d\.readOnly/.test(ui), true, 'AC15 unlock shown only with the capability; read-only respected');
    },
  },
  {
    name: 'N-443 AC16 guard, escaping, no inline styles / hex / handlers in the new files',
    fn: function () {
      ['pdp-calibrate.js', 'pdp-calibrate-ui.js'].forEach(f => {
        _assertEqual(_PDP_GUARD_RE.test(ALL_SOURCES[f]), false, 'AC16 ' + f + ' passes the PDP-D12 guard');
        _assertEqual(_PDP_GUARD_ALLOW.includes(f), false, 'AC16 ' + f + ' is not on the allowlist');
        _assertEqual(/#[0-9a-fA-F]{3,6}\b/.test(ALL_SOURCES[f]), false, 'AC16 ' + f + ' no hex');
        _assertEqual(/\son(click|change|input)=|style="/.test(ALL_SOURCES[f]), false, 'AC16 ' + f + ' no inline handler / style');
      });
      const c = _clCase([1, 2, 2, 2, 2, 2], [3, 2, 2, 2, 2, 2], [null, 2, 2, 2, 2, 2], { PersonName: '<b>x</b>' });
      _assertEqual(/<b>x<\/b>/.test(_pdpclTableHtml({ cases: [c], readOnly: false })), false, 'AC16 names escaped in the case table');
      _assertEqual(/Lock all non-panel cases/.test(_pdpclTableHtml({ cases: [_clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS)], readOnly: false })), true, 'AC16 lock-all offered when ready cases exist');
      _assertEqual(/Lock all non-panel cases/.test(_pdpclTableHtml({ cases: [_clCase(_CL_MEETS, _CL_MEETS, _CL_MEETS)], readOnly: true })), false, 'AC16 positive control: hidden read-only');
    },
  },
  {
    name: 'N-443 AC17 load order: pdp-calibrate.js after pdp-assess.js; pdp-calibrate-ui.js after pdp-assess-ui.js; never mobile / MCP',
    fn: function () {
      const html = ALL_HTML['people.html'];
      const at = f => html.indexOf('js/' + f + '"');
      _assertEqual(at('pdp-assess.js') > -1 && at('pdp-assess.js') < at('pdp-calibrate.js') && at('pdp-calibrate.js') < at('api-pdp.js'), true, 'AC17 pdp-calibrate.js after pdp-assess.js');
      _assertEqual(at('pdp-assess-ui.js') < at('pdp-calibrate-ui.js') && at('pdp-calibrate-ui.js') < at('pdp-my.js'), true, 'AC17 pdp-calibrate-ui.js after pdp-assess-ui.js');
      _assertEqual(/pdp-calibrate/.test(ALL_HTML['mobile.html'] || ''), false, 'AC17 never on mobile');
      _assertEqual(CONFIG.MCP.scripts.some(f => /pdp-calibrate/.test(f)), false, 'AC17 never in the MCP bundle');
    },
  }
);
