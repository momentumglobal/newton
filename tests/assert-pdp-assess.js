// tests/assert-pdp-assess.js — Bi-Annual assessment (N-442 / PDP-10). Loads AFTER tests/assert-pdp-track.js.
// The pure rules (pdp-assess.js, pdp-identity.js visibility, pdp-data.js re-point) are exercised directly; the
// API writers and the shared markup are checked from source because the runner is synchronous. Spec: specs/N-442.md.

function _asThrows(fn) { try { fn(); } catch (e) { return e.message; } return ''; }

const _AS_E = { emp: 'tia.tp@mg.test', lm: 'sam.sdm@mg.test', csd: 'cara.csd@mg.test' };
const _AS_KEYS = ['own-it', 'decide', 'communicate', 'support', 'curious', 'adapt'];

// A complete (or blank-descriptor) framework set for one level x track.
function _asFramework(level, track, blank) {
  const rows = [];
  let id = 1;
  _AS_KEYS.forEach((k, i) => ['Below', 'Meets', 'Exceeding'].forEach(b => rows.push({
    id: id++, Level: level, Track: track, PillarKey: k, Pillar: 'Pillar ' + (i + 1), Band: b,
    Descriptor: blank ? '' : k + ' ' + b, SortOrder: i + 1, IsActive: true,
  })));
  return rows;
}
const _AS_FW = _asFramework('L4', 'IC').concat(_asFramework('L5', 'IC', true));
const _AS_DEF = { schema: 1, sections: [{ key: 's', title: 'Scoring', blocks: [{ key: 'score', type: 'scoring', label: 'Score', required: true }] }] };
const _AS_NODEF = { schema: 1, sections: [{ key: 's', title: 'Notes', blocks: [{ key: 'p', type: 'prompt', label: 'Talk' }] }] };
const _AS_CYCLE = { id: 3, PersonID: 4, CycleYear: 2027, BiAnnualScored: true, ScoringLevel: 'L4-IC' };

function _asMeeting(o) {
  return Object.assign({
    id: 88, PersonID: 4, PersonEmail: _AS_E.emp, LineManagerEmail: _AS_E.lm, CSDEmail: _AS_E.csd, ReadOnlyEmails: '',
    CycleYear: 2027, MeetingType: 'BiAnnual', Period: '2027-07', DueDate: '2027-07-31T00:00:00Z', Status: 'PrepOpen',
    SelfScoredAt: '', ManagerScoredAt: '', ScoresRevealedAt: '', Assessment: '', EmployeeSignedAt: '', ManagerSignedAt: '',
  }, o || {});
}

// Six rows for one side: scores = [n x6] (null = no row).
function _asRows(source, scores, extra) {
  const id = source === 'Self' ? 100 : (source === 'Manager' ? 200 : 300);
  return _AS_KEYS.map((k, i) => scores[i] == null ? null : Object.assign({
    id: id + i, MeetingID: 88, PillarKey: k, Source: source, Score: scores[i], Rationale: source + ' why ' + k,
    ScoringLevel: 'L4-IC', SubmittedAt: '2027-07-05T10:00:00Z',
    PersonID: 4, PersonEmail: _AS_E.emp, LineManagerEmail: _AS_E.lm, CSDEmail: _AS_E.csd, ReadOnlyEmails: '',
  }, extra || {})).filter(Boolean);
}
function _asBy(o) { const out = {}; _AS_KEYS.forEach((k, i) => { out[k] = o[i]; }); return out; }

ASSERTIONS.push(
  {
    name: 'N-442 AC1 CONFIG.PDP.ASSESS holds the bands, boundaries, gaps, readiness and manager-track settings',
    fn: function () {
      const A = CONFIG.PDP.ASSESS;
      _assertEqual(A.BAND_MAX, { Below: 1.5, Meets: 2.4 }, 'AC1 band limits');
      _assertEqual(A.BOUNDARIES, { '1.5': ['Below', 'Meets'], '2.5': ['Meets', 'Exceeding'] }, 'AC1 boundaries');
      _assertEqual([A.DECIMALS, A.MANAGER_CALL_GAP, A.ESCALATE_GAP, A.REVEAL_WAIT_MIN], [1, 1, 2, 15], 'AC1 decimals, gaps, wait');
      _assertEqual(A.READINESS.map(r => r.label), ['Ready now', 'Ready in 6–12 months', 'Not yet ready'], 'AC1 readiness (D3)');
      _assertEqual(A.MANAGER_TRACK, { LEVEL_KEY: 'L4-IC', PILLARS: ['support', 'curious', 'adapt'], SCORE: 3 }, 'AC1 manager track (D4)');
      _assertEqual(A.MANAGER_TRACK.PILLARS.every(k => CONFIG.PDP.PILLAR_KEYS.includes(k)), true, 'AC1 manager-track pillars are pillar keys');
      ['pdp-assess.js', 'pdp-assess-ui.js'].forEach(f => {
        _assertEqual(/\b(1\.5|2\.4|2\.5)\b/.test(ALL_SOURCES[f].replace(/\/\/.*$/gm, '')), false, 'AC1 ' + f + ' has no band literal');
        _assertEqual(/'L4-IC'|'Ready now'/.test(ALL_SOURCES[f]), false, 'AC1 ' + f + ' reads level key / readiness from CONFIG');
      });
    },
  },
  {
    name: 'N-442 AC2 PDPMeetings scoring columns: projected, cleaned, ScoresRevealedAt flow-only, AccessKey unchanged',
    fn: function () {
      ['SelfScoredAt', 'ManagerScoredAt', 'ScoresRevealedAt', 'Assessment'].forEach(c =>
        _assertEqual(CONFIG.LIST_FIELDS.PDPMeetings.includes(c), true, 'AC2 LIST_FIELDS has ' + c));
      const L = CONFIG.PDP.LISTS.MEETINGS;
      const out = pdpCleanFields(L, { SelfScoredAt: '2027-07-05T10:00:00Z', ScoresRevealedAt: '2027-07-05T11:00:00Z', Assessment: { schema: 1 } }, 'update');
      _assertEqual(out, { SelfScoredAt: '2027-07-05T10:00:00.000Z', Assessment: '{"schema":1}' }, 'AC2 reveal stamp dropped, JSON serialised');
      _assertEqual(/too long/.test(_asThrows(() => pdpCleanFields(L, { Assessment: { x: 'y'.repeat(CONFIG.PDP.JSON_MAX_CHARS) } }, 'update'))), true, 'AC2 Assessment capped');
      _assertEqual(pdpAccessKey(_asMeeting({ SelfScoredAt: 'x', ScoresRevealedAt: 'y', Assessment: '{}' })), pdpAccessKey(_asMeeting()), 'AC2 scoring columns are not in the access key');
      _assertEqual([pdpScoresRevealed(_asMeeting()), pdpScoresRevealed(_asMeeting({ ScoresRevealedAt: '2027-07-06T09:00:00Z' })), pdpScoresRevealed(null)], [false, true, false], 'AC2 pdpScoresRevealed');
    },
  },
  {
    name: 'N-442 AC3 pdpScoringState: none / skipped / notScored / noDescriptors / open',
    fn: function () {
      const st = (m, c, d) => pdpScoringState(_asMeeting(m), c === undefined ? _AS_CYCLE : c, _AS_FW, d || _AS_DEF).state;
      _assertEqual(st({ MeetingType: 'Quarterly' }), 'none', 'AC3 not a Bi-Annual');
      _assertEqual(st({}, undefined, _AS_NODEF), 'none', 'AC3 no scoring block');
      _assertEqual(st({ Status: 'Skipped' }), 'skipped', 'AC3 skipped');
      _assertEqual(st({}, Object.assign({}, _AS_CYCLE, { BiAnnualScored: false })), 'notScored', 'AC3 joined after 31 March (PDP-D10)');
      _assertEqual(st({}, null), 'notScored', 'AC3 no cycle = not scored');
      _assertEqual(st({}, Object.assign({}, _AS_CYCLE, { ScoringLevel: 'L5-IC' })), 'noDescriptors', 'AC3 PTP L5-IC blank descriptors (PDP-D5)');
      _assertEqual(st({}, Object.assign({}, _AS_CYCLE, { ScoringLevel: '' })), 'noDescriptors', 'AC3 no scoring level');
      const open = pdpScoringState(_asMeeting(), _AS_CYCLE, _AS_FW, _AS_DEF);
      _assertEqual([open.state, open.levelKey], ['open', 'L4-IC'], 'AC3 complete L4-IC is open, on the cycle level (promotion via N-437)');
    },
  },
  {
    name: 'N-442 AC4 score draft, missing pillars and the rows each side writes',
    fn: function () {
      _assertEqual(/whole numbers/.test(_asThrows(() => pdpScoreDraft({}, { 'own-it': { score: 4 } }))), true, 'AC4 4 refused');
      _assertEqual(/whole numbers/.test(_asThrows(() => pdpScoreDraft({}, { 'own-it': { score: 1.5 } }))), true, 'AC4 non-integer refused');
      _assertEqual(/under/.test(_asThrows(() => pdpScoreDraft({}, { 'own-it': { score: 2, rationale: 'x'.repeat(CONFIG.PDP.ASSESS.RATIONALE_MAX + 1) } }))), true, 'AC4 over-long rationale refused');
      const d2 = pdpScoreDraft({}, { 'own-it': { score: '2', rationale: ' a ' }, decide: { score: 3, rationale: 'b' } });
      _assertEqual([d2['own-it'], d2.adapt], [{ score: 2, rationale: 'a' }, { score: null, rationale: '' }], 'AC4 partial draft accepted, trimmed');
      _assertEqual(pdpScoresMissing(d2, { communicate: 'Communicate' }).length, 4, 'AC4 four pillars missing');
      const five = {};
      _AS_KEYS.forEach((k, i) => { five[k] = { score: 2, rationale: i === 5 ? '' : 'ok' }; });
      _assertEqual(pdpScoresMissing(pdpScoreDraft({}, five), { adapt: 'Adapt' }), ['Adapt'], 'AC4 a blank rationale is missing, named');
      const saved = pdpScoresBySource(_asRows('Self', [2, null, null, null, null, null])).Self;
      const w = pdpScoreWrites(_asMeeting(), 'L4-IC', 'Self', saved, pdpScoreDraft(saved, { decide: { score: 1, rationale: 'r' } }), false, '2027-07-05T10:00:00Z');
      _assertEqual(w.map(x => [x.id, x.fields.PillarKey || null, x.fields.Score]), [[100, null, 2], [null, 'decide', 1]], 'AC4 update existing, create new, skip untouched');
      _assertEqual(w[1].fields, { Score: 1, Rationale: 'r', ScoringLevel: 'L4-IC', PersonID: 4, PersonEmail: _AS_E.emp, CycleYear: 2027, LineManagerEmail: _AS_E.lm, CSDEmail: _AS_E.csd, MeetingID: 88, PillarKey: 'decide', Source: 'Self' }, 'AC4 snapshot from the meeting');
      const all = pdpScoreWrites(_asMeeting(), 'L4-IC', 'Manager', {}, pdpScoreDraft({}, five), true, '2027-07-05T10:00:00Z');
      _assertEqual([all.length, all.every(x => x.fields.SubmittedAt === '2027-07-05T10:00:00Z' && x.fields.Source === 'Manager')], [6, true], 'AC4 submit writes six with SubmittedAt');
      _assertEqual(pdpCleanScores(w[1].fields, 'create').Title, '88|decide|Self', 'AC4 rows key by Title MeetingID|PillarKey|Source');
      _assertEqual([pdpScoresLocked(_asMeeting({ SelfScoredAt: 'x' }), 'Self'), pdpScoresLocked(_asMeeting({ SelfScoredAt: 'x' }), 'Manager')], [true, false], 'AC4 each side locks on its own marker (D6)');
    },
  },
  {
    name: 'N-442 AC5 writers: marker after the six submitted rows, side checked from the record, no reveal write',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'];
      const body = src.slice(src.indexOf('async function _pdpSaveSideScores'), src.indexOf('async function savePdpSelfScores'));
      _assertEqual(body.indexOf('SubmittedAt') > -1 && body.indexOf('SubmittedAt') < body.indexOf('SelfScoredAt'), true, 'AC5 rows re-read for SubmittedAt before the marker');
      _assertEqual(/view\.side !== side/.test(src) && /pdpAssessSide/.test(ALL_SOURCES['pdp-assess.js']), true, 'AC5 acting side from the record (pdpTeamAccess), not role');
      _assertEqual(/who\.ghost\) throw/.test(src.slice(src.indexOf('async function _pdpAssessCtx'))), true, 'AC5 Ghost Mode refused');
      _assertEqual(/ScoresRevealedAt\s*:/.test(src), false, 'AC5 Newton never writes ScoresRevealedAt');
      _assertEqual(['loadPdpAssessment', 'savePdpSelfScores', 'savePdpManagerScores', 'savePdpAgreed'].every(f => new RegExp('async function ' + f + '\\(').test(src)), true, 'AC5 the four api-pdp functions');
      _assertEqual(/pdpAssessHeldProblems\(await _pdpAssessRead/.test(src.slice(src.indexOf('async function markPdpHeld'))), true, 'AC5 markPdpHeld adds the assessment problems');
    },
  },
  {
    name: 'N-442 AC6 visibility: relationship first, blind before the reveal for everyone incl. Admin (D2)',
    fn: function () {
      const rows = _asRows('Self', [2, 2, 2, 2, 2, 2]).slice(0, 1).concat(_asRows('Manager', [2, 2, 2, 2, 2, 2]).slice(0, 1), _asRows('Agreed', [2, 2, 2, 2, 2, 2]).slice(0, 1));
      const ids = (role, em, rev) => pdpVisibleItems(rows, role, em, () => rev).map(r => r.Source);
      _assertEqual(ids('talent_partner', _AS_E.emp, false), ['Self', 'Agreed'], 'AC6 employee before reveal');
      _assertEqual(ids('delivery_manager', _AS_E.lm, false), ['Manager', 'Agreed'], 'AC6 LM before reveal');
      _assertEqual(ids('admin', _AS_E.csd, false), ['Manager', 'Agreed'], 'AC6 CSD who is an Admin is blind on screen');
      _assertEqual(ids('admin', 'other.admin@mg.test', false), ['Agreed'], 'AC6 unrelated Admin sees no draft scores');
      _assertEqual(ids('people_ops', 'po@mg.test', false), ['Agreed'], 'AC6 People Ops likewise');
      [['talent_partner', _AS_E.emp], ['delivery_manager', _AS_E.lm], ['admin', _AS_E.csd], ['admin', 'other.admin@mg.test']].forEach(([r, e]) =>
        _assertEqual(ids(r, e, true), ['Self', 'Manager', 'Agreed'], 'AC6 after reveal ' + e + ' sees both'));
      _assertEqual(ids('leadership', 'boss@mg.test', true), [], 'AC6 Leadership none');
      _assertEqual(ids('talent_partner', 'tom.tp@mg.test', true), [], 'AC6 stranger none');
      _assertEqual(ids('delivery_manager', pdpEffectiveEmail('admin@mg.test', _AS_E.lm), false), ['Manager', 'Agreed'], 'AC6 Ghost Mode: the ghosted side');
      _assertEqual(pdpScoreViewer('admin', _AS_E.lm, rows[0]), { level: 'edit', as: 'manager' }, 'AC6 viewer: relationship before admin');
      _assertEqual(pdpScoreViewer('admin', 'x@mg.test', rows[0]), { level: 'edit', as: 'admin' }, 'AC6 viewer: admin otherwise');
    },
  },
  {
    name: 'N-442 AC7 reveal states: blind / unlocking / slow / revealed',
    fn: function () {
      const t0 = Date.parse('2027-07-05T10:00:00Z');
      const both = { SelfScoredAt: '2027-07-05T09:00:00Z', ManagerScoredAt: '2027-07-05T10:00:00Z' };
      const st = (m, c, mins) => pdpRevealState(_asMeeting(m), c, t0 + (mins || 0) * 60000);
      _assertEqual(st({ SelfScoredAt: '2027-07-05T09:00:00Z' }, { Self: 6, Manager: 0 }), 'blind', 'AC7 one side submitted');
      _assertEqual(st(both, { Self: 6, Manager: 0 }, 5), 'unlocking', 'AC7 both submitted, not revealed');
      _assertEqual(st(both, { Self: 6, Manager: 0 }, 16), 'slow', 'AC7 past REVEAL_WAIT_MIN');
      _assertEqual(st(Object.assign({ ScoresRevealedAt: '2027-07-05T10:05:00Z' }, both), { Self: 6, Manager: 3 }, 5), 'unlocking', 'AC7 revealed, rows not yet readable');
      _assertEqual(st(Object.assign({ ScoresRevealedAt: '2027-07-05T10:05:00Z' }, both), { Self: 6, Manager: 6 }, 5), 'revealed', 'AC7 revealed');
    },
  },
  {
    name: 'N-442 AC8 compare + agreed: same score fixed, 1-point gap = one of the two with a reason, 2-point = panel',
    fn: function () {
      const c = pdpCompare(pdpScoresBySource(_asRows('Self', [2, 3, 1, 2, 2, 2])).Self, pdpScoresBySource(_asRows('Manager', [2, 2, 3, 2, 2, 2])).Manager);
      _assertEqual(c.slice(0, 3).map(x => [x.gap, x.kind]), [[0, 'agree'], [1, 'managerCall'], [2, 'escalate']], 'AC8 kinds');
      const names = { decide: 'Decide' };
      let r = pdpAgreedResolve(c, {});
      _assertEqual([r.pillars[0].score, r.pillars[2].score, r.pillars[2].escalated], [2, null, true], 'AC8 agree fixed; escalate blank');
      _assertEqual(r.problems, ['Choose the self or the manager score for decide.'], 'AC8 1-point gap needs a pick');
      r = pdpAgreedResolve(c, { decide: { score: 1, rationale: 'x' } }, names);
      _assertEqual(r.problems, ['Choose the self or the manager score for Decide.'], 'AC8 a score outside the two refused (D7)');
      r = pdpAgreedResolve(c, { decide: { score: 3 } }, names);
      _assertEqual(r.problems, ['Give a reason for the agreed score for Decide.'], 'AC8 a reason is required');
      r = pdpAgreedResolve(c, { decide: { score: 3, rationale: 'evidence' } }, names);
      _assertEqual([r.problems, r.pillars[1].score], [[], 3], 'AC8 valid manager call');
      const plan = pdpAgreedPlan({ meeting: _asMeeting(), compare: c, edit: { agreed: { decide: { score: 3, rationale: 'e' } }, readiness: { value: 'now' } }, levelKey: 'L3-IC', savedAgreed: {} });
      _assertEqual([plan.agreedRows.length, plan.agreedRows[2].fields.Score, plan.agreedRows[2].fields.Source], [6, '', 'Agreed'], 'AC8 escalated pillar written with a blank Score');
      _assertEqual(pdpCleanScores(plan.agreedRows[2].fields, 'create').Score, undefined, 'AC8 blank Score omitted on create');
    },
  },
  {
    name: 'N-442 AC9 overall: average to one decimal, band, boundaries, pending',
    fn: function () {
      const o = a => pdpOverall(_asBy(a));
      _assertEqual([o([2, 2, 2, 2, 3, 3]).total, o([2, 2, 2, 2, 3, 3]).band], [2.3, 'Meets'], 'AC9 2.3 Meets');
      _assertEqual([o([1, 1, 1, 2, 2, 2]).total, o([1, 1, 1, 2, 2, 2]).boundary], [1.5, ['Below', 'Meets']], 'AC9 sum 9 = 1.5 boundary');
      _assertEqual([o([2, 2, 2, 3, 3, 3]).total, o([2, 2, 2, 3, 3, 3]).boundary], [2.5, ['Meets', 'Exceeding']], 'AC9 sum 15 = 2.5 boundary');
      _assertEqual([o([2, 2, 3, 3, 3, 3]).total, o([2, 2, 3, 3, 3, 3]).band, o([2, 2, 3, 3, 3, 3]).boundary], [2.7, 'Exceeding', null], 'AC9 sum 16 = 2.7 Exceeding');
      _assertEqual([o([1, 1, 1, 1, 1, 2]).band, o([1, 1, 1, 1, 2, 2]).total, o([1, 1, 1, 1, 2, 2]).band], ['Below', 1.3, 'Below'], 'AC9 low totals');
      _assertEqual(o([2, 2, null, 2, 2, 2]), { total: null, band: null, pending: true, boundary: null }, 'AC9 an escalated pillar leaves the total pending');
      _assertEqual([pdpBandFor(1.6), pdpBandFor(2.4), pdpBandFor(2.5)], ['Meets', 'Meets', 'Exceeding'], 'AC9 band edges');
    },
  },
  {
    name: 'N-442 AC10 boundary: agreed into one of two bands or escalated; unresolved blocks',
    fn: function () {
      const ov = pdpOverall(_asBy([2, 2, 2, 3, 3, 3]));
      _assertEqual(/band boundary/.test(pdpBoundaryProblem(ov, null)), true, 'AC10 unresolved');
      _assertEqual(/only be agreed as Meets or Exceeding/.test(pdpBoundaryProblem(ov, { band: 'Below' })), true, 'AC10 band outside the pair refused');
      _assertEqual([pdpBoundaryProblem(ov, { band: 'Exceeding' }), pdpBoundaryProblem(ov, { escalated: true })], ['', ''], 'AC10 agreed or escalated');
      _assertEqual([pdpOverallBand(ov, { band: 'Meets' }), pdpOverallBand(ov, { escalated: true }), pdpOverallBand(ov, null)], ['Meets', null, null], 'AC10 the band that counts');
      _assertEqual(pdpBoundaryProblem(pdpOverall(_asBy([2, 2, 2, 2, 2, 2])), null), '', 'AC10 off-boundary needs nothing');
    },
  },
  {
    name: 'N-442 AC11 calibration-panel reasons (N-443 intake)',
    fn: function () {
      const cmp = (s, m) => pdpCompare(_asBy(s.map(x => ({ Score: x }))), _asBy(m.map(x => ({ Score: x }))));
      const meets = cmp([2, 2, 2, 2, 2, 2], [2, 2, 2, 2, 2, 2]);
      _assertEqual(pdpPanelReasons(meets, pdpOverall(_asBy([2, 2, 2, 2, 2, 2])), {}), [], 'AC11 Meets, no gaps');
      _assertEqual(pdpPanelReasons(cmp([1, 2, 2, 2, 2, 2], [3, 2, 2, 2, 2, 2]), pdpOverall(_asBy([null, 2, 2, 2, 2, 2])), {}), [{ kind: 'gap', key: 'own-it' }], 'AC11 2-point gap');
      _assertEqual(pdpPanelReasons(meets, pdpOverall(_asBy([1, 1, 1, 1, 1, 2])), {}), [{ kind: 'Below' }], 'AC11 Below overall');
      _assertEqual(pdpPanelReasons(meets, pdpOverall(_asBy([3, 3, 3, 3, 3, 3])), {}), [{ kind: 'Exceeding' }], 'AC11 Exceeding overall');
      _assertEqual(pdpPanelReasons(meets, pdpOverall(_asBy([2, 2, 2, 3, 3, 3])), { boundary: { escalated: true } }), [{ kind: 'boundary' }], 'AC11 unagreed boundary');
      _assertEqual(pdpPanelReasons(meets, pdpOverall(_asBy([2, 2, 2, 3, 3, 3])), { boundary: { band: 'Exceeding' } }), [{ kind: 'Exceeding' }], 'AC11 boundary agreed as Exceeding');
    },
  },
  {
    name: 'N-442 AC12 L4 manager-track suggestion and reason rules (D4)',
    fn: function () {
      _assertEqual(pdpManagerTrackSuggested('L4-IC', _asBy([2, 2, 2, 3, 3, 3])), true, 'AC12 3/3/3 on support, curious, adapt');
      _assertEqual(pdpManagerTrackSuggested('L4-IC', _asBy([3, 3, 3, 3, 2, 3])), false, 'AC12 a 2 on curious');
      _assertEqual(pdpManagerTrackSuggested('L4-IC', _asBy([3, 3, 3, 3, null, 3])), false, 'AC12 escalated counts as not met');
      _assertEqual(pdpManagerTrackSuggested('L3-IC', _asBy([3, 3, 3, 3, 3, 3])), false, 'AC12 not L4');
      _assertEqual([pdpManagerTrackApplies('L4-IC'), pdpManagerTrackApplies('L5-MG')], [true, false], 'AC12 applies to L4-IC only');
      _assertEqual(pdpManagerTrackProblem('L4-IC', false, { flagged: true, reason: '' }), 'Give a reason for the manager-track flag.', 'AC12 ticked without a reason');
      _assertEqual(pdpManagerTrackProblem('L4-IC', true, { flagged: false, reason: '' }), 'Give a reason for not flagging the suggested manager track.', 'AC12 unticking a suggestion without a reason');
      _assertEqual([pdpManagerTrackProblem('L4-IC', false, { flagged: false }), pdpManagerTrackProblem('L4-IC', true, { flagged: true, reason: 'ready' }), pdpManagerTrackProblem('L3-IC', false, { flagged: true })], ['', '', ''], 'AC12 fine cases');
      const c = pdpCompare(_asBy([2, 2, 2, 3, 3, 3].map(x => ({ Score: x }))), _asBy([2, 2, 2, 3, 3, 3].map(x => ({ Score: x }))));
      const p3 = pdpAgreedPlan({ meeting: _asMeeting(), compare: c, edit: { readiness: { value: 'now' }, boundary: { band: 'Meets' } }, levelKey: 'L3-IC' });
      _assertEqual(p3.assessment.managerTrack, null, 'AC12 non-L4: no managerTrack');
      const p4 = pdpAgreedPlan({ meeting: _asMeeting(), compare: c, edit: { readiness: { value: 'now' }, boundary: { band: 'Exceeding' } }, levelKey: 'L4-IC' });
      _assertEqual(p4.assessment.managerTrack, { suggested: true, flagged: true, reason: '' }, 'AC12 the flag defaults to the suggestion');
      _assertEqual(p4.problems, ['Give a reason for the manager-track flag.'], 'AC12 and needs a reason');
      // QA finding 1: an untouched box (flagged undefined) follows the suggestion; the UI leaves it undefined.
      const p5 = pdpAgreedPlan({ meeting: _asMeeting(), compare: c, edit: { readiness: { value: 'now' }, boundary: { band: 'Exceeding' }, managerTrack: { flagged: undefined, reason: 'strong lead' } }, levelKey: 'L4-IC' });
      _assertEqual([p5.assessment.managerTrack, p5.problems], [{ suggested: true, flagged: true, reason: 'strong lead' }, []], 'AC12 untouched box stores the suggestion');
      const ui = ALL_SOURCES['pdp-assess-ui.js'];
      const stash = ui.slice(ui.indexOf('function _pdpasStash'), ui.indexOf('function pdpasInput'));
      _assertEqual(/data-pas-mt\]/.test(stash), false, 'AC12 the generic stash never sets the manager-track tick');
      _assertEqual(/actOn\('change', 'pdpasMt\.stop', ACT_CHECKED\)/.test(ui) && /pdpManagerTrackSuggested\(v\.scoring\.levelKey, ag\)/.test(ui), true, 'AC12 the box has its own action; the suggestion is computed from the typed agreed scores');
      const seed = { side: 'manager', bySource: { Self: {}, Manager: {}, Agreed: {} }, assessment: pdpAssessmentFrom(''), suggested: false };
      _assertEqual(_pdpasDraftFrom(seed).managerTrack.flagged, undefined, 'AC12 no stored flag = untouched (follows the suggestion)');
      seed.assessment = pdpAssessmentFrom(JSON.stringify({ managerTrack: { suggested: true, flagged: false, reason: 'not yet' } }));
      _assertEqual(_pdpasDraftFrom(seed).managerTrack, { flagged: false, reason: 'not yet' }, 'AC12 a stored decision is kept');
    },
  },
  {
    name: 'N-442 AC13 Held check for a scorable Bi-Annual (D6)',
    fn: function () {
      const now = new Date('2027-07-10T10:00:00Z');
      const both = { SelfScoredAt: '2027-07-05T09:00:00Z', ManagerScoredAt: '2027-07-05T10:00:00Z', ScoresRevealedAt: '2027-07-05T10:05:00Z' };
      const ready = r => Object.assign({ Assessment: JSON.stringify({ readiness: { value: r || 'now' } }) }, both);
      const view = (m, rows) => pdpAssessView({ meeting: _asMeeting(m), cycle: _AS_CYCLE, framework: _AS_FW, def: _AS_DEF, rows, role: 'delivery_manager', email: _AS_E.lm, live: true, now });
      _assertEqual(pdpAssessHeldProblems(view({}, [])), ['The employee has not submitted their scores.', 'The manager scores have not been submitted.'], 'AC13 nothing submitted');
      _assertEqual(pdpAssessHeldProblems(view({ SelfScoredAt: 'x', ManagerScoredAt: 'y' }, [])), ['The scores are still unlocking. Try again in a few minutes.'], 'AC13 not revealed');
      const sm = _asRows('Self', [2, 2, 2, 2, 2, 2]).concat(_asRows('Manager', [2, 2, 2, 2, 2, 3]));
      const p = pdpAssessHeldProblems(view(both, sm));
      _assertEqual([p.length, p[6]], [7, 'Choose the progression readiness.'], 'AC13 six agreed scores + readiness missing');
      const ag = _asRows('Agreed', [2, 2, 2, 2, 2, 3]);
      _assertEqual(pdpAssessHeldProblems(view(ready('6-12'), sm.concat(ag))), [], 'AC13 complete');
      const mixed = sm.map(r => r.Source === 'Manager' && r.PillarKey === 'adapt' ? Object.assign({}, r, { ScoringLevel: 'L3-IC' }) : r);
      _assertEqual(pdpAssessHeldProblems(view(ready(), mixed.concat(ag))), ['Scores were given against different levels — ask People Ops.'], 'AC13 one level across Self / Manager');
      const bnd = _asRows('Self', [2, 2, 2, 3, 3, 3]).concat(_asRows('Manager', [2, 2, 2, 3, 3, 3]), _asRows('Agreed', [2, 2, 2, 3, 3, 3]));
      _assertEqual(/band boundary/.test(pdpAssessHeldProblems(view(ready(), bnd)).join(' ')), true, 'AC13 boundary unresolved blocks');
      const esc = _asRows('Self', [1, 2, 2, 2, 2, 2]).concat(_asRows('Manager', [3, 2, 2, 2, 2, 2]), _asRows('Agreed', [null, 2, 2, 2, 2, 2]), [Object.assign(_asRows('Agreed', [2])[0], { Score: null })]);
      _assertEqual(pdpAssessHeldProblems(view(ready(), esc)), [], 'AC13 an escalated pillar with a blank agreed row is resolved');
      _assertEqual(pdpAssessHeldProblems(pdpAssessView({ meeting: _asMeeting(), cycle: Object.assign({}, _AS_CYCLE, { BiAnnualScored: false }), framework: _AS_FW, def: _AS_DEF, rows: [], role: 'delivery_manager', email: _AS_E.lm, live: true, now })), [], 'AC13 notScored adds nothing');
      _assertEqual(/pdpasHeldProblems\(\)/.test(ALL_SOURCES['pdp-team-page.js']), true, 'AC13 the Team page shows and checks the same problems');
    },
  },
  {
    name: 'N-442 AC14 / AC15 view flags: who can score, agree, and when the outcome shows',
    fn: function () {
      const now = new Date('2027-07-10T10:00:00Z');
      const both = { SelfScoredAt: '2027-07-05T09:00:00Z', ManagerScoredAt: '2027-07-05T10:00:00Z', ScoresRevealedAt: '2027-07-05T10:05:00Z' };
      const rows = _asRows('Self', [2, 2, 2, 2, 2, 2]).concat(_asRows('Manager', [2, 2, 2, 2, 2, 2]));
      const v = (m, role, em, live, n) => pdpAssessView({ meeting: _asMeeting(m), cycle: _AS_CYCLE, framework: _AS_FW, def: _AS_DEF, rows, role, email: em, live: live !== false, now: n || now });
      const emp = v({}, 'talent_partner', _AS_E.emp), lm = v({}, 'delivery_manager', _AS_E.lm), csd = v({}, 'admin', _AS_E.csd), adm = v({}, 'admin', 'x@mg.test');
      _assertEqual([emp.side, lm.side, csd.side, adm.side], ['self', 'manager', 'manager', 'viewer'], 'AC14 sides from the record');
      _assertEqual([emp.canSelf, emp.canManager, lm.canManager, csd.canManager, adm.canManager], [true, false, true, true, false], 'AC14 who scores');
      _assertEqual(v({}, 'talent_partner', _AS_E.emp, true, new Date('2027-06-20T10:00:00Z')).canSelf, false, 'AC14 before the prep window');
      _assertEqual(v({ SelfScoredAt: 'x' }, 'talent_partner', _AS_E.emp).canSelf, false, 'AC14 locked after submit');
      _assertEqual(v({}, 'talent_partner', _AS_E.emp, false).canSelf, false, 'AC14 Ghost / preview read-only');
      _assertEqual([v(both, 'delivery_manager', _AS_E.lm).canAgree, v(both, 'talent_partner', _AS_E.emp).canAgree], [true, false], 'AC14 the manager agrees once revealed');
      _assertEqual(v(Object.assign({ Status: 'Held' }, both), 'delivery_manager', _AS_E.lm).canAgree, true, 'AC14 still editable while Held');
      _assertEqual(v(Object.assign({ Status: 'Held', EmployeeSignedAt: '2027-07-12T10:00:00Z' }, both), 'delivery_manager', _AS_E.lm).canAgree, false, 'AC14 locked at the first signature');
      _assertEqual(v({ Status: 'Held', SelfScoredAt: 'x' }, 'delivery_manager', _AS_E.lm).canManager, false, 'AC14 no manager scoring once Held');
      _assertEqual([v(both, 'talent_partner', _AS_E.emp).showOutcome, v(Object.assign({ Status: 'Held' }, both), 'talent_partner', _AS_E.emp).showOutcome, v(both, 'delivery_manager', _AS_E.lm).showOutcome], [false, true, true], 'AC15 the employee sees readiness once Held');
      _assertEqual(pdpReadinessLabel('6-12'), 'Ready in 6–12 months', 'AC15 readiness label');
    },
  },
  {
    name: 'N-442 AC16 re-point keeps the reveal on Score rows',
    fn: function () {
      const fx = _pdpFx();
      const lm = fx.sdm.WorkEmail, csd = fx.csd.WorkEmail, tom = fx.tp2.WorkEmail;
      const people = fx.all.map(p => Object.assign({}, p));
      people.find(p => p.id === '4').ReportsTo = tom;           // Tia now reports to Tom; CSD stays Cara
      const rev = { ScoresRevealedAt: '2027-07-05T10:05:00Z' };
      const items = {
        PDPMeetings: [
          _pdpAccItem(50, fx.tp1, lm, csd, Object.assign({ Status: 'PrepOpen' }, rev)),   // revealed, not held
          _pdpAccItem(51, fx.tp1, lm, csd, Object.assign({ Status: 'SignedOff' }, rev)),  // revealed, past
          _pdpAccItem(52, fx.tp1, lm, csd, { Status: 'Skipped' }),                        // unrevealed, past
        ],
        PDPScores: [
          _pdpAccItem(60, fx.tp1, lm, csd, { MeetingID: 50, Source: 'Self', ReadOnlyEmails: csd + ';' + lm }),
          _pdpAccItem(61, fx.tp1, lm, csd, { MeetingID: 51, Source: 'Self', ReadOnlyEmails: lm + ';' + csd }),
          _pdpAccItem(62, fx.tp1, lm, csd, { MeetingID: 50, Source: 'Manager', ReadOnlyEmails: fx.tp1.WorkEmail }),
          _pdpAccItem(63, fx.tp1, lm, csd, { MeetingID: 52, Source: 'Self' }),
          _pdpAccItem(64, fx.tp1, lm, csd, { MeetingID: 52, Source: 'Manager' }),
          _pdpAccItem(65, fx.tp1, lm, csd, { MeetingID: 51, Source: 'Agreed' }),
        ],
        PDPGoals: [], PDPActions: [], PDPCycles: [],
      };
      const plan = pdpBuildRepointPlan(people, items);
      const p = id => (plan.rows.find(r => r.list === 'PDPScores' && r.id === String(id)) || {}).patch;
      _assertEqual(p(60), { LineManagerEmail: tom, ReadOnlyEmails: [csd, tom].sort().join(';') }, 'AC16 revealed open Self: new LM + CSD read, old LM gone');
      _assertEqual(p(61), { LineManagerEmail: tom, ReadOnlyEmails: [csd, lm, tom].sort().join(';') }, 'AC16 revealed past Self: old LM kept as former');
      _assertEqual(p(62), { LineManagerEmail: tom }, 'AC16 revealed Manager row keeps the person (no ReadOnly change)');
      _assertEqual(p(63), { LineManagerEmail: tom }, 'AC16 unrevealed Self of a past meeting never gains a former reviewer');
      _assertEqual(p(64), { LineManagerEmail: tom, ReadOnlyEmails: lm }, 'AC16 unrevealed Manager of a past meeting: former LM as N-435');
      _assertEqual(p(65), { LineManagerEmail: tom, ReadOnlyEmails: lm }, 'AC16 Agreed rows as N-435');
      const same = { PDPMeetings: items.PDPMeetings, PDPScores: [_pdpAccItem(66, fx.tp1, lm, csd, { MeetingID: 50, Source: 'Self', ReadOnlyEmails: csd + ';' + lm })], PDPGoals: [], PDPActions: [], PDPCycles: [] };
      _assertEqual(pdpBuildRepointPlan(fx.all, same).rows, [], 'AC16 no change = no patch, whatever the stored order');
      const applied = JSON.parse(JSON.stringify(items));
      plan.rows.forEach(r => Object.assign(applied[r.list].find(i => i.id === r.id), r.patch));
      _assertEqual(pdpBuildRepointPlan(people, applied).rows, [], 'AC16 idempotent');
    },
  },
  {
    name: 'N-442 AC17 / AC18 guard, markup and load order',
    fn: function () {
      ['pdp-assess.js', 'pdp-assess-ui.js'].forEach(f => {
        _assertEqual(typeof ALL_SOURCES[f], 'string', 'AC17 ' + f + ' is loaded');
        _assertEqual(_PDP_GUARD_RE.test(ALL_SOURCES[f]), false, 'AC17 ' + f + ' names no PDP list or data function');
        _assertEqual(_PDP_GUARD_ALLOW.includes(f), false, 'AC17 ' + f + ' needs no allowlist entry');
      });
      const ui = ALL_SOURCES['pdp-assess-ui.js'];
      _assertEqual(/\son[a-z]+=/.test(ui), false, 'AC17 no inline handlers');
      _assertEqual(/style="/.test(ui), false, 'AC17 no inline styles');
      _assertEqual(/#[0-9a-fA-F]{3,6}\b/.test(ui + ALL_SOURCES['pdp-assess.js']), false, 'AC17 no hex');
      _assertEqual(/pdpasHtml\(b\.label\)/.test(ALL_SOURCES['pdp-my.js']) && /pdpasHtml\(b\.label\)/.test(ALL_SOURCES['pdp-team-page.js']), true, 'AC17 both pages mount the scoring block');
      _assertEqual(/Nothing to do here/.test(ALL_SOURCES['pdp-my.js'] + ALL_SOURCES['pdp-team-page.js']), false, 'AC17 the placeholders are gone');
      if (typeof ALL_HTML === 'undefined') _skip('ALL_HTML not available');
      const h = ALL_HTML['people.html'];
      const at = f => h.indexOf('js/' + f + '"');
      _assertEqual(at('pdp-track.js') < at('pdp-assess.js') && at('pdp-assess.js') < at('api-pdp.js'), true, 'AC18 pdp-assess.js after pdp-track.js');
      _assertEqual(at('pdp-track-ui.js') < at('pdp-assess-ui.js') && at('pdp-assess-ui.js') < at('pdp-my.js'), true, 'AC18 pdp-assess-ui.js after pdp-track-ui.js, before pdp-my.js');
      _assertEqual(/pdp-assess/.test(ALL_HTML['mobile.html'] || ''), false, 'AC18 never on mobile');
      _assertEqual(CONFIG.MCP.scripts.some(f => /pdp-assess/.test(f)), false, 'AC18 never in the MCP bundle');
    },
  },
);
