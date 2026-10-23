// tests/assert-sla-engine.js — SLA calc engine (N-383, DA-3): per-hire day metrics,
// On-hold pause, evidence rules, weekly rolling submissions, breaches, attainment.
// Loads AFTER tests/assertions.js and pushes this domain's entries into ASSERTIONS.
// Scenarios are built from FIXTURES.slaEngine by day offset from its openDay (D).

function _slaD(n) { return addDaysISO(FIXTURES.slaEngine.openDay, n); }
function _slaAt(n) { return _slaD(n) + 'T12:00:00Z'; }
// Local noon on day D+n — localDayISO() of it is D+n in any timezone.
function _slaToday(n) { const p = _slaD(n).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12, 0, 0); }
function _slaStage(n, oldV, newV, roleId) {
  return { RoleIDLookupId: roleId || 50, Field: 'Stage', OldValue: oldV, NewValue: newV, ChangedAt: _slaAt(n) };
}
function _slaPl(n, hcId, roleId) {
  return { id: 9000 + (hcId || 500), RoleIDLookupId: roleId === undefined ? 50 : roleId, HeadcountID: hcId || 500,
    OfferAcceptedDate: n === null ? null : _slaAt(n) };
}
function _slaWa(n, submitted, offers, roleId) {
  return { RoleIDLookupId: roleId || 50, WeekEndingDate: _slaAt(n), Submitted: submitted, Offers: offers || 0 };
}
function _slaHc(id, openN, extra) {
  return Object.assign({ id: id, RoleID: 50, ProjectID: 900, Sequence: id - 499,
    OpenDate: openN === null ? null : _slaAt(openN), Status: 'Open' }, extra || {});
}
function _slaRole(stage, extra) { return Object.assign({}, FIXTURES.slaEngine.role, { Stage: stage }, extra || {}); }
function _slaRun(o) {
  const F = FIXTURES.slaEngine;
  return computeProjectSla(Object.assign({
    project: F.project, slaRows: F.slaRows, roles: [F.role], headcount: [F.hc],
    placements: [], stageRows: [], activity: [], rejectedOffers: null, today: _slaToday(30),
  }, o || {}));
}
function _slaHire(r, hcId) { return r.hires.find(h => h.headcountId === String(hcId)); }
function _slaM(target, value, eventN, status, breachN) {
  return { target: target, value: value, eventDay: eventN === null ? null : _slaD(eventN), status: status,
    breachDay: breachN === null ? null : _slaD(breachN) };
}
function _slaThrows(fn, label) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  if (!threw) throw new Error(label + ': expected a throw');
}
// Every hire's events in order: submission <= offer <= hire (when present).
function _slaOrdered(r, label) {
  r.hires.forEach(h => {
    const s = h.metrics.firstSubmissionDays.eventDay, o = h.metrics.timeToOfferDays.eventDay, x = h.metrics.timeToHireDays.eventDay;
    if (s && o && s > o) throw new Error(label + ': submission after offer for ' + h.headcountId);
    if (o && x && o > x) throw new Error(label + ': offer after hire for ' + h.headcountId);
  });
}
// The standard single-hire history: created in Sourcing, submitted on D+subN,
// offered D+20, closed + placed D+40.
function _slaStdRows(subN) {
  return [_slaStage(0, null, 'Sourcing'), _slaStage(subN, 'Sourcing', 'Submitted'),
    _slaStage(20, 'Submitted', 'Offered'), _slaStage(40, 'Offered', 'Closed')];
}

ASSERTIONS.push(
  {
    name: 'N-383 CONFIG.SLA.ENGINE + slaEngineConfigCheck + slaStageBand',
    fn: function () {
      _assertEqual(CONFIG.SLA.ENGINE, {
        pauseStages: ['On-hold'], submissionBand: { from: 'Submitted', to: 'Offered' }, offerStage: 'Offered',
        activeWeekBand: { from: 'Sourcing', to: 'Final Interview' }, rollingWeeks: 4,
      }, 'AC1 config');
      _assertEqual(slaEngineConfigCheck(), true, 'AC1 live config passes');
      const bad = patch => Object.assign(JSON.parse(JSON.stringify(CONFIG.SLA.ENGINE)), patch);
      _slaThrows(() => slaEngineConfigCheck(bad({ pauseStages: ['Paused'] })), 'AC1 unknown pause stage');
      _slaThrows(() => slaEngineConfigCheck(bad({ offerStage: 'Offer' })), 'AC1 unknown offer stage');
      _slaThrows(() => slaEngineConfigCheck(bad({ submissionBand: { from: 'Offered', to: 'Submitted' } })), 'AC1 inverted band');
      _slaThrows(() => slaEngineConfigCheck(bad({ activeWeekBand: { from: 'Sourcing', to: 'Nope' } })), 'AC1 unknown band stage');
      _slaThrows(() => slaEngineConfigCheck(bad({ rollingWeeks: 0 })), 'AC1 rollingWeeks 0');
      _slaThrows(() => slaEngineConfigCheck(bad({ rollingWeeks: 2.5 })), 'AC1 rollingWeeks not an integer');
      _assertEqual(slaStageBand(CONFIG.SLA.ENGINE.submissionBand),
        ['Submitted', 'Interview 1', 'Interview 2+', 'Final Interview', 'Offered'], 'AC1 submission band');
      _assertEqual(slaStageBand(CONFIG.SLA.ENGINE.activeWeekBand),
        ['Sourcing', 'Submitted', 'Interview 1', 'Interview 2+', 'Final Interview'], 'AC1 active-week band');
      _assertEqual(slaStageBand(CONFIG.SLA.ENGINE.activeWeekBand) === slaStageBand(CONFIG.SLA.ENGINE.activeWeekBand), false, 'AC1 fresh array');
    },
  },
  {
    name: 'N-383 computeProjectSla — null for projects that cannot have SLAs, even with matching rows',
    fn: function () {
      const rows = FIXTURES.slaEngine.slaRows.concat([
        { id: 10, ProjectType: 'LCI', TimeToHireDays: 45 },
        { id: 11, ProjectType: 'Transformation', TimeToHireDays: 45 },
        { id: 12, ProjectType: CONFIG.PROJECT_TYPE_INTERNAL, TimeToHireDays: 45 },
        { id: 13, ProjectID: 900, TimeToHireDays: 10 },
      ]);
      ['LCI', 'Transformation', CONFIG.PROJECT_TYPE_INTERNAL, 'Mystery'].forEach(t =>
        _assertEqual(_slaRun({ project: { id: 900, ProjectType: t }, slaRows: rows }), null, 'AC2 ' + t));
      _assertEqual(_slaRun({ project: null, slaRows: rows }), null, 'AC2 null project');
      _assertEqual(_slaRun({ slaRows: rows }) !== null, true, 'AC2 Embedded is evaluated');
      _assertEqual(slaAttainment(null), null, 'AC2 attainment of null');
    },
  },
  {
    name: 'N-383 single hire — met, breach by event, running breach, pending',
    fn: function () {
      const met = _slaRun({ roles: [_slaRole('Closed')], stageRows: _slaStdRows(5), placements: [_slaPl(40)], today: _slaToday(50) });
      const h = _slaHire(met, 500);
      _assertEqual(h.state, 'filled', 'AC3 state');
      _assertEqual(h.openDay, _slaD(0), 'AC3 openDay');
      _assertEqual(h.metrics.firstSubmissionDays, _slaM(7, 5, 5, 'met', null), 'AC3 first submission');
      _assertEqual(h.metrics.timeToOfferDays, _slaM(30, 20, 20, 'met', null), 'AC3 offer');
      _assertEqual(h.metrics.timeToHireDays, _slaM(45, 40, 40, 'met', null), 'AC3 hire');
      _assertEqual(met.breaches, [], 'AC3 no breaches');
      _slaOrdered(met, 'AC8 order (AC3)');

      const late = _slaRun({ roles: [_slaRole('Closed')], stageRows: _slaStdRows(9), placements: [_slaPl(40)], today: _slaToday(50) });
      _assertEqual(_slaHire(late, 500).metrics.firstSubmissionDays, _slaM(7, 9, 9, 'breached', 8), 'AC4 breached by event');
      _assertEqual(late.breaches, [{ key: 'firstSubmissionDays:500', metric: 'firstSubmissionDays', roleId: '50',
        headcountId: '500', breachDay: _slaD(8), eventDay: _slaD(9), ongoing: false }], 'AC4 breach record');
      _slaOrdered(late, 'AC8 order (AC4)');

      const rows = [_slaStage(0, null, 'Sourcing')];
      const running = _slaRun({ stageRows: rows, today: _slaToday(10) });
      const rh = _slaHire(running, 500);
      _assertEqual(rh.state, 'open', 'AC5 state');
      _assertEqual(rh.metrics.firstSubmissionDays, _slaM(7, 10, null, 'breached', 8), 'AC5 running breach');
      _assertEqual(rh.metrics.timeToOfferDays, _slaM(30, 10, null, 'pending', null), 'AC5 offer pending');
      _assertEqual(running.breaches.map(b => [b.key, b.ongoing, b.eventDay]), [['firstSubmissionDays:500', true, null]], 'AC5 ongoing breach');
      _assertEqual(_slaHire(_slaRun({ stageRows: rows, today: _slaToday(6) }), 500).metrics.firstSubmissionDays,
        _slaM(7, 6, null, 'pending', null), 'AC5 pending at D+6');
    },
  },
  {
    name: 'N-383 evidence — Sunday dating, earliest wins, forward-entry rule, offer implies submission',
    fn: function () {
      // D+6 is the Sunday of D's week.
      const wk = _slaRun({ activity: [_slaWa(6, 1)] });
      _assertEqual(_slaHire(wk, 500).metrics.firstSubmissionDays.eventDay, _slaD(6), 'AC6 week-ending Sunday');
      const exact = _slaRun({ activity: [_slaWa(6, 1)], stageRows: [_slaStage(0, null, 'Sourcing'), _slaStage(2, 'Sourcing', 'Submitted')],
        roles: [_slaRole('Submitted')] });
      _assertEqual(_slaHire(exact, 500).metrics.firstSubmissionDays.eventDay, _slaD(2), 'AC6 exact RoleHistory day wins when earlier');

      const role = FIXTURES.slaEngine.role;
      const ev = slaRoleEvidence({ role: role, roleStageRows: [
        _slaStage(3, 'On-hold', 'Offered'),       // resume — not an offer, not a submission
        _slaStage(4, 'Interview 1', 'Submitted'), // backward — not a submission
        _slaStage(5, null, 'Interview 1'),        // creation row — a submission
        _slaStage(6, 'Sourcing', 'Interview 1'),  // skips Submitted — still a submission
        _slaStage(7, 'Sourcing', 'Submitted', 77), // another role — ignored
      ] });
      _assertEqual(ev, { submissionDays: [_slaD(5), _slaD(6)], offerDays: [] }, 'AC7 forward-entry rule');
      const ev2 = slaRoleEvidence({ role: role, roleStageRows: [_slaStage(8, 'Final Interview', 'Offered')],
        placements: [_slaPl(30)], rejectedOffers: [{ RoleIDLookupId: 50, RejectionDate: _slaAt(25) }, { RoleIDLookupId: 77, RejectionDate: _slaAt(1) }] });
      _assertEqual(ev2.offerDays, [_slaD(8), _slaD(25), _slaD(30)], 'AC7 offer sources');
      _assertEqual(ev2.submissionDays, [_slaD(8), _slaD(25), _slaD(30)], 'AC8 every offer day is a submission day');

      const offerOnly = _slaRun({ activity: [_slaWa(13, 0, 1)] });
      const oh = _slaHire(offerOnly, 500);
      _assertEqual([oh.metrics.firstSubmissionDays.eventDay, oh.metrics.timeToOfferDays.eventDay], [_slaD(13), _slaD(13)], 'AC8 offer implies submission');
      _slaOrdered(offerOnly, 'AC8 order (offer only)');
    },
  },
  {
    name: 'N-383 filled-hire cap and shared, re-armed attribution (open point 2)',
    fn: function () {
      // The placement carries no role id: it fills the headcount (fill map) but is not role evidence.
      const capped = _slaRun({ placements: [_slaPl(10, 500, null)], activity: [_slaWa(13, 1, 1)], today: _slaToday(30) });
      const ch = _slaHire(capped, 500);
      _assertEqual([ch.metrics.firstSubmissionDays.eventDay, ch.metrics.timeToOfferDays.eventDay, ch.metrics.timeToHireDays.eventDay],
        [_slaD(10), _slaD(10), _slaD(10)], 'AC9 capped at the fill day');
      _slaOrdered(capped, 'AC8 order (AC9)');

      const shared = _slaRun({
        roles: [_slaRole('Submitted')],
        headcount: [_slaHc(500, 0), _slaHc(501, 0), _slaHc(502, 30)],
        stageRows: [_slaStage(0, null, 'Sourcing'), _slaStage(4, 'Sourcing', 'Submitted')],
        today: _slaToday(40),
      });
      _assertEqual(_slaHire(shared, 500).metrics.firstSubmissionDays, _slaM(7, 4, 4, 'met', null), 'AC10 hire A');
      _assertEqual(_slaHire(shared, 501).metrics.firstSubmissionDays, _slaM(7, 4, 4, 'met', null), 'AC10 hire B shares the event');
      _assertEqual(_slaHire(shared, 502).metrics.firstSubmissionDays, _slaM(7, 10, null, 'breached', 38), 'AC10 hire C re-armed from its own OpenDate');
      _assertEqual(_slaHire(shared, 502).openDay, _slaD(30), 'AC10 hire C openDay');
      _slaOrdered(shared, 'AC8 order (AC10)');
    },
  },
  {
    name: 'N-383 On-hold pauses the clock (DA-D6); breachDay skips pauses; history mismatch',
    fn: function () {
      const resumed = _slaRun({ roles: [_slaRole('Submitted')], today: _slaToday(30), stageRows: [
        _slaStage(0, null, 'Sourcing'), _slaStage(3, 'Sourcing', 'On-hold'),
        _slaStage(13, 'On-hold', 'Sourcing'), _slaStage(15, 'Sourcing', 'Submitted')] });
      _assertEqual(_slaHire(resumed, 500).metrics.firstSubmissionDays, _slaM(7, 5, 15, 'met', null), 'AC11 10 paused days excluded');

      const held = [_slaStage(0, null, 'Sourcing'), _slaStage(3, 'Sourcing', 'On-hold')];
      const frozen = _slaRun({ roles: [_slaRole('On-hold')], stageRows: held, today: _slaToday(20) });
      _assertEqual(_slaHire(frozen, 500).metrics.firstSubmissionDays, _slaM(7, 3, null, 'pending', null), 'AC11 currently On-hold freezes the clock');
      _assertEqual(frozen.gaps.historyMismatch, 0, 'AC11 no mismatch');

      const mismatch = _slaRun({ roles: [_slaRole('Sourcing')], stageRows: held, today: _slaToday(20) });
      _assertEqual(_slaHire(mismatch, 500).metrics.firstSubmissionDays, _slaM(7, 20, null, 'breached', 8), 'AC11 mismatch drops the open pause');
      _assertEqual(mismatch.gaps.historyMismatch, 1, 'AC11 mismatch counted');

      const paused = _slaRun({ today: _slaToday(30), stageRows: [
        _slaStage(0, null, 'Sourcing'), _slaStage(3, 'Sourcing', 'On-hold'), _slaStage(13, 'On-hold', 'Sourcing')] });
      _assertEqual(_slaHire(paused, 500).metrics.firstSubmissionDays, _slaM(7, 20, null, 'breached', 18), 'AC12 breachDay skips the pause');
      _assertEqual(slaActiveDays(_slaD(0), _slaD(18), [{ from: _slaD(3), to: _slaD(13) }]), 8, 'AC12 slaActiveDays');
      _assertEqual(slaActiveDays(_slaD(0), _slaD(18), [{ from: null, to: _slaD(2) }]), 16, 'AC12 open-start pause');
      _assertEqual(slaDayAfterActiveDays(_slaD(0), 8, []), _slaD(8), 'AC12 no pause');
    },
  },
  {
    name: 'N-383 exclusions, gaps and no-target metrics',
    fn: function () {
      const r = _slaRun({
        headcount: [_slaHc(500, 0), _slaHc(503, null), _slaHc(504, 0, { Status: CONFIG.HEADCOUNT.STATUS_CANCELLED }), _slaHc(505, 0)],
        placements: [_slaPl(null, 505)],
      });
      _assertEqual(r.hires.map(h => h.headcountId), ['500', '505'], 'AC13 undated + cancelled excluded');
      _assertEqual(r.gaps, { undatedHires: 1, cancelledHires: 1, filledNoOfferDate: 1, historyMismatch: 0, noStageHistory: 1 }, 'AC13 gaps');
      _assertEqual(_slaHire(r, 505).metrics.timeToHireDays.status, 'not-applicable', 'AC13 filled, no OfferAcceptedDate');
      _assertEqual(_slaHire(r, 505).state, 'filled', 'AC13 state');

      const rows = FIXTURES.slaEngine.slaRows.map(x => Object.assign({}, x, x.id === 1 ? { TimeToOfferDays: null } : {}));
      const nt = _slaRun({ slaRows: rows, stageRows: [_slaStage(0, null, 'Sourcing')], today: _slaToday(10) });
      _assertEqual(_slaHire(nt, 500).metrics.timeToOfferDays, _slaM(null, 10, null, 'no-target', null), 'AC14 no target');
      _assertEqual(nt.breaches.some(b => b.metric === 'timeToOfferDays'), false, 'AC14 no breach without a target');
      _assertEqual(slaAttainment(nt).timeToOfferDays, { target: null, met: 0, breached: 0, pending: 0, pct: null }, 'AC14 attainment');
    },
  },
  {
    name: 'N-383 weekly — active weeks (open point 3a), complete weeks only, bucketing',
    fn: function () {
      // Weeks end D+6, D+13, D+20 … Today D+44 (Wed) → last complete week ends D+41.
      const r = _slaRun({ today: _slaToday(44), roles: [_slaRole('Offered')], stageRows: [
        _slaStage(0, null, 'Sourcing'),
        _slaStage(8, 'Sourcing', 'On-hold'),   // Tue of week 2: week 2 still active (Sourcing on Monday)
        _slaStage(21, 'On-hold', 'Sourcing'),  // week 3 all On-hold
        _slaStage(27, 'Sourcing', 'Offered'),  // Sunday of week 4; weeks 5–6 Offered only
      ] });
      const w = r.roles[0].weeks;
      _assertEqual(w.map(x => x.weekEnding), [6, 13, 20, 27, 34, 41].map(_slaD), 'AC15 complete weeks only');
      _assertEqual(w.map(x => x.active), [true, true, false, true, false, false], 'AC15 active by stage');

      const two = _slaRun({ today: _slaToday(24), roles: [_slaRole('Sourcing')],
        headcount: [_slaHc(500, 0), _slaHc(501, 15)], placements: [_slaPl(3, 500)] });
      _assertEqual(two.roles[0].weeks.map(x => x.active), [true, false, true], 'AC15 needs an open dated hire');

      const backlog = _slaRun({ today: _slaToday(44), roles: [_slaRole('Backlog')] });
      _assertEqual(backlog.roles[0].weeks.every(x => !x.active), true, 'AC15 Backlog weeks inactive');
      _assertEqual(_slaRun({ today: _slaToday(6) }).roles[0].weeks, [], 'AC15 current week never included');

      const b = _slaRun({ today: _slaToday(16), activity: [_slaWa(6, 1), _slaWa(6, 2), _slaWa(4, 4)] });
      _assertEqual(b.roles[0].weeks.map(x => x.submissions), [7, 0], 'AC18 TP rows summed; Friday-dated row buckets to its Sunday');
    },
  },
  {
    name: 'N-383 weekly — rolling 4-week mean (open point 3b) and episodes',
    fn: function () {
      const subs = [3, 1, 2, 2, 0];
      const plain = _slaRun({ today: _slaToday(37), activity: subs.map((s, i) => _slaWa(6 + 7 * i, s)) });
      const pw = plain.roles[0].weeks;
      _assertEqual(pw.map(x => x.rollingAvg), [null, null, null, 2, 1.25], 'AC16 rolling mean');
      _assertEqual(pw.map(x => x.breached), [false, false, false, false, true], 'AC16 breached');

      // Week 3 On-hold: skipped by the window, its 5 submissions not counted.
      const skip = _slaRun({ today: _slaToday(44), activity: [3, 1, 5, 2, 2, 0].map((s, i) => _slaWa(6 + 7 * i, s)),
        stageRows: [_slaStage(0, null, 'Sourcing'), _slaStage(13, 'Sourcing', 'On-hold'), _slaStage(21, 'On-hold', 'Sourcing')] });
      const sw = skip.roles[0].weeks;
      _assertEqual(sw.map(x => x.active), [true, true, false, true, true, true], 'AC16 week 3 inactive');
      _assertEqual(sw.map(x => x.rollingAvg), [null, null, null, null, 2, 1.25], 'AC16 inactive week skipped, not zero');

      // Weeks 1–9: active subs 2,2,2,2,0,0,6,(8 On-hold),0 → episodes w5–w6 and w9 (latest).
      const ep = _slaRun({ today: _slaToday(65), activity: [2, 2, 2, 2, 0, 0, 6, 0, 0].map((s, i) => _slaWa(6 + 7 * i, s)),
        stageRows: [_slaStage(0, null, 'Sourcing'), _slaStage(48, 'Sourcing', 'On-hold'), _slaStage(56, 'On-hold', 'Sourcing')] });
      const ew = ep.roles[0].weeks;
      _assertEqual(ew.map(x => x.active), [true, true, true, true, true, true, true, false, true], 'AC17 week 8 inactive');
      _assertEqual(ew.map(x => x.breached), [false, false, false, false, true, true, false, false, true], 'AC17 breached weeks');
      _assertEqual(ep.roles[0].episodes, [
        { startWeek: _slaD(34), endWeek: _slaD(41), ongoing: false, worstAvg: 1 },
        { startWeek: _slaD(62), endWeek: _slaD(62), ongoing: true, worstAvg: 1.5 },
      ], 'AC17 episodes');
      _assertEqual(ep.breaches.filter(x => x.metric === 'submissionsPerWeek').map(x => [x.key, x.breachDay, x.eventDay, x.ongoing, x.headcountId]), [
        ['submissionsPerWeek:50:' + _slaD(34), _slaD(34), _slaD(41), false, null],
        ['submissionsPerWeek:50:' + _slaD(62), _slaD(62), _slaD(62), true, null],
      ], 'AC17 breach records');
      const days = ep.breaches.map(x => x.breachDay);
      _assertEqual(days.slice().sort(), days, 'AC17 breaches ordered by breachDay');
    },
  },
  {
    name: 'N-383 scoping and no mutation',
    fn: function () {
      const base = { roles: [_slaRole('Closed')], stageRows: _slaStdRows(9), placements: [_slaPl(40)], today: _slaToday(50) };
      const alone = _slaRun(base);
      const other = { id: 60, Stage: 'Sourcing', ProjectIDLookupId: 901 };
      const mixed = {
        roles: base.roles.concat([other]),
        headcount: [FIXTURES.slaEngine.hc, { id: 600, RoleID: 60, ProjectID: 901, OpenDate: _slaAt(0), Status: 'Open' }],
        stageRows: base.stageRows.concat([_slaStage(1, 'Sourcing', 'Submitted', 60)]),
        placements: base.placements.concat([_slaPl(2, 600, 60)]),
        activity: [_slaWa(6, 9, 9, 60)],
        rejectedOffers: [{ RoleIDLookupId: 60, RejectionDate: _slaAt(1) }],
        today: base.today,
      };
      const before = JSON.stringify(mixed);
      const r = _slaRun(mixed);
      _assertEqual(JSON.stringify(mixed), before, 'AC19 inputs not mutated');
      _assertEqual(JSON.stringify(r), JSON.stringify(alone), 'AC19 other project ignored');
    },
  },
  {
    name: 'N-383 slaAttainment — period counting, pending, weekly, no target',
    fn: function () {
      const targets = slaTargetsFor(FIXTURES.slaEngine.project, FIXTURES.slaEngine.slaRows);
      const hire = (status, eventN, breachN) => ({ metrics: {
        firstSubmissionDays: { status: status, eventDay: eventN === null ? null : _slaD(eventN), breachDay: breachN === null ? null : _slaD(breachN) },
      } });
      const result = {
        targets: targets,
        hires: [hire('met', 10, null), hire('met', 15, null), hire('met', 20, null), hire('met', 25, null),
          hire('breached', 30, 12), hire('breached', null, 5), hire('pending', null, null), hire('no-target', 11, null)],
        roles: [{ weeks: [
          { weekEnding: _slaD(6), active: true, rollingAvg: 2, breached: false },
          { weekEnding: _slaD(13), active: true, rollingAvg: 1, breached: true },
          { weekEnding: _slaD(20), active: false, rollingAvg: null, breached: false },
          { weekEnding: _slaD(27), active: true, rollingAvg: null, breached: false },
        ] }],
      };
      const a = slaAttainment(result, _slaD(10), _slaD(20));
      _assertEqual(a.firstSubmissionDays, { target: 7, met: 3, breached: 1, pending: 1, pct: 75 }, 'AC20 in period');
      _assertEqual(a.submissionsPerWeek, { target: 2, met: 0, breached: 1, pending: 0, pct: 0 }, 'AC20 weekly in period');
      _assertEqual(a.timeToOfferDays, { target: 30, met: 0, breached: 0, pending: 0, pct: null }, 'AC20 nothing evaluated');
      const all = slaAttainment(result);
      _assertEqual(all.firstSubmissionDays, { target: 7, met: 4, breached: 2, pending: 1, pct: 67 }, 'AC20 null bounds count everything');
      _assertEqual(all.submissionsPerWeek, { target: 2, met: 1, breached: 1, pending: 0, pct: 50 }, 'AC20 weekly all');
      _assertEqual(Object.keys(all), CONFIG.SLA.METRICS.map(m => m.key), 'AC20 one entry per metric');
    },
  },
  {
    name: 'N-383 independence — engine never reads the flag / pace / KPI stage sets or benchmarks',
    fn: function () {
      _assertEqual(CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays, 45, 'AC21 benchmark unchanged');
      const fns = [slaEngineConfigCheck, slaStageBand, _slaRowRoleId, slaRoleTimeline, slaPauseIntervals, slaActiveDays,
        slaDayAfterActiveDays, slaRoleEvidence, _slaFillDay, slaHireMetrics, slaRoleWeeks, computeProjectSla, slaAttainment];
      fns.forEach(f => ['ANALYTICS_BENCHMARKS', 'ROLE_STAGE_BUDGETS', 'ACTIVE_STAGES', 'TTF_CENSORED_STAGES', 'LEARNED_BENCHMARKS'].forEach(bad =>
        _assertEqual(f.toString().includes(bad), false, 'AC21 ' + f.name + ' mentions ' + bad)));
    },
  }
);