// tests/assert-pdp-cycle.js — PDP cycle engine (N-437 / PDP-5). Loads AFTER tests/assert-pdp-identity.js
// (reuses its _pdpFx People fixture). The pure engine (pdp-cycle.js) is exercised directly; the API
// plan / apply functions and the Cycle tab are checked from source because the runner is synchronous.
// Spec: specs/N-437.md.

const _PDPC_TODAY = new Date('2026-12-01T12:00:00Z');   // generating 2027 in December 2026

function _pdpcTpl(extra) {
  const rows = CONFIG.PDP.MEETING_TYPES.map((t, i) => ({ id: String(100 + i), MeetingType: t, VersionNo: 1, Status: 'Published' }));
  return rows.concat(extra || []);
}
// Plan on `people`. opts: { mode, pilot, cycles, meetings, templates, today, year }
function _pdpcPlan(people, opts) {
  const o = opts || {};
  return pdpBuildCyclePlan({
    year: o.year || 2027, mode: o.mode || 'On', pilot: o.pilot || [], people,
    cycles: o.cycles || [], meetings: o.meetings || [], templates: o.templates || _pdpcTpl(), today: o.today || _PDPC_TODAY,
  });
}
// A plan's writes applied to stored rows (ids assigned, payloads cleaned), as SharePoint would hold them.
function _pdpcApplied(plan, base) {
  const b = base || {};
  let n = 5000;
  const cycles = (b.cycles || []).map(c => Object.assign({}, c));
  const ids = {};
  plan.cycles.forEach(c => {
    const row = Object.assign({ id: String(++n) }, pdpCleanCycles(c.fields, 'create'));
    ids[c.personId] = row.id;
    cycles.push(row);
  });
  const meetings = (b.meetings || []).map(m => Object.assign({}, m));
  plan.meetings.forEach(m => {
    const f = Object.assign({}, m.fields);
    if (m.newCycle) f.CycleID = Number(ids[m.personId]);
    meetings.push(Object.assign({ id: String(++n) }, pdpCleanMeetings(f, 'create')));
  });
  plan.meetingUpdates.forEach(u => Object.assign(meetings.find(m => m.id === u.id), u.fields));
  plan.cycleUpdates.forEach(u => Object.assign(cycles.find(c => c.id === u.id), u.fields));
  return { cycles, meetings };
}
function _pdpcMine(plan, personId) { return plan.meetings.filter(m => m.personId === String(personId)).map(m => m.fields); }
function _pdpcBy(rows, period, type) { return rows.find(r => r.Period === period && (!type || r.MeetingType === type)); }

ASSERTIONS.push(
  {
    name: 'N-437 AC1 config: calendar, level map, joiner / promotion constants, People.LevelSince',
    fn: function () {
      const C = CONFIG.PDP.CYCLE;
      _assertEqual(C.CALENDAR.length, 12, 'AC1 twelve months');
      _assertEqual(C.CALENDAR.every(t => CONFIG.PDP.MEETING_TYPES.includes(t)), true, 'AC1 every month is a meeting type');
      const count = t => C.CALENDAR.filter(x => x === t).length;
      _assertEqual([count('Annual'), count('BiAnnual'), count('Quarterly'), count('Monthly')], [1, 1, 2, 8], 'AC1 1 Annual, 1 Bi-Annual, 2 Quarterly, 8 Monthly');
      _assertEqual([C.CALENDAR[0], C.CALENDAR[3], C.CALENDAR[6], C.CALENDAR[9]], ['Annual', 'Quarterly', 'BiAnnual', 'Quarterly'], 'AC1 Jan / Apr / Jul / Oct');
      CONFIG.PDP.SCOPE_LEVELS.forEach(l => {
        const m = C.LEVEL_MAP[l];
        _assertEqual(!!m && CONFIG.PDP.LEVELS.includes(m.level) && CONFIG.PDP.TRACKS.includes(m.track), true, 'AC1 ' + l + ' maps to a framework level and track');
      });
      _assertEqual([C.LEVEL_MAP.PTP, C.LEVEL_MAP.SDM], [{ level: 'L5', track: 'IC' }, { level: 'L5', track: 'MG' }], 'AC1 PTP = L5 IC, SDM = L5 MG (PDP-D5)');
      _assertEqual([C.JOINER_DUE_DAYS, C.JOINER_SKIP_DAYS, C.BIANNUAL_CUTOFF, C.PROMOTION_MIN_MONTHS], [30, 21, '03-31', 3], 'AC1 PDP-D10 / D11 constants');
      _assertEqual(C.JOINER_GOALS, { min: 2, max: 3 }, 'AC1 joiner goals 2-3');
      _assertEqual(C.SKIP_REASONS.preStart, 'Before PDP start', 'N-446 pre-start skip reason in config');
      _assertEqual(CONFIG.LIST_FIELDS.People.includes('LevelSince'), true, 'AC17 People projection has LevelSince');
      _assertEqual(CONFIG.MCP.outputDenyFields.People.includes('LevelSince'), true, 'AC17 LevelSince never returned to Claude');
    },
  },
  {
    name: 'N-437 AC2 calendar: periods, month-end due dates, leap years, month arithmetic, years offered',
    fn: function () {
      const cal = pdpCalendar(2027);
      _assertEqual(cal.map(m => m.Period), ['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12'], 'AC2 periods');
      _assertEqual([cal[0].DueDate, cal[1].DueDate, cal[3].DueDate, cal[11].DueDate], ['2027-01-31', '2027-02-28', '2027-04-30', '2027-12-31'], 'AC2 month-end due dates');
      _assertEqual(pdpCalendar(2028)[1].DueDate, '2028-02-29', 'AC2 leap year');
      _assertEqual(pdpAddMonthsISO('2027-07-31', -3), '2027-04-30', 'AC2 months back, clamped');
      _assertEqual(pdpAddMonthsISO('2027-01-31', 1), '2027-02-28', 'AC2 months forward, clamped');
      _assertEqual(pdpAddMonthsISO('2027-02-15', -3), '2026-11-15', 'AC2 across a year');
      _assertEqual(pdpCycleYears(new Date('2026-10-31T12:00:00Z')), [2026], 'AC2 October: this year only');
      _assertEqual(pdpCycleYears(new Date('2026-11-06T12:00:00Z')), [2026, 2027], 'AC2 from November: next year too');
    },
  },
  {
    name: 'N-437 AC3 standing person: 12 Planned meetings, unique keys, template bound, cycle fields',
    fn: function () {
      const f = _pdpFx();
      const plan = _pdpcPlan(f.all);
      const tia = _pdpcMine(plan, f.tp1.id);
      _assertEqual(tia.length, 12, 'AC3 twelve meetings');
      _assertEqual(tia.every(m => m.Status === 'Planned' && m.IsJoiner === false), true, 'AC3 all Planned, none joiner');
      const keys = plan.meetings.map(m => m.key);
      _assertEqual(new Set(keys).size, keys.length, 'AC3 keys unique');
      _assertEqual(_pdpcBy(tia, '2027-07').MeetingType, 'BiAnnual', 'AC3 July is the Bi-Annual');
      _assertEqual([_pdpcBy(tia, '2027-01').TemplateID, _pdpcBy(tia, '2027-01').TemplateVersion], [100, 1], 'AC11 bound to the active Annual template');
      _assertEqual([_pdpcBy(tia, '2027-01').LineManagerEmail, _pdpcBy(tia, '2027-01').CSDEmail], [f.sdm.WorkEmail, f.csd.WorkEmail], 'AC3 LM / CSD snapshots from the resolver');
      const cyc = plan.cycles.find(c => c.personId === f.tp1.id).fields;
      _assertEqual([cyc.Level, cyc.Track, cyc.ScoringLevel, cyc.BiAnnualScored, cyc.JoinDate, cyc.Status], ['L3', 'IC', 'L3-IC', true, '', 'Open'], 'AC3 cycle: level at start, scored, no join date, Open');
      _assertEqual(plan.cycles.find(c => c.personId === f.sdm.id).fields.ScoringLevel, 'L5-MG', 'AC3 an SDM scores on L5-MG');
      _assertEqual(plan.cycles.some(c => c.personId === f.csd.id), false, 'AC3 a CSD gets no cycle (reviewer only)');
      _assertEqual(plan.cycles.length, 6, 'AC3 the six in-scope people');
      _assertEqual(pdpCleanCycles(cyc, 'create').Title, pdpCycleKey(f.tp1.id, 2027), 'AC13 cycle payload cleans, key built');
    },
  },
  {
    name: 'N-437 AC4-AC5 joiners: goal setting at +30 days, earlier meetings dropped, 3-week skip, Bi-Annual cut-off',
    fn: function () {
      const f = _pdpFx();
      const today = new Date('2027-03-20T12:00:00Z');
      const jo = f.P(20, 'Jo Joiner', 'TP', { StartDate: '2027-03-10', ReportsTo: f.sdm.WorkEmail });
      const plan = _pdpcPlan(f.all.concat(jo), { today });
      const m = _pdpcMine(plan, 20);
      const gs = m.find(x => x.IsJoiner);
      _assertEqual([gs.MeetingType, gs.DueDate, gs.Period, gs.Status], ['Annual', '2027-04-09', '2027-04', 'Planned'], 'AC4 goal setting due start + 30, Annual template');
      _assertEqual(m.some(x => x.Period === '2027-01' || x.Period === '2027-02' || x.Period === '2027-03'), false, 'AC4 nothing before the goal setting');
      const q = m.find(x => x.MeetingType === 'Quarterly' && x.Period === '2027-04');
      _assertEqual([q.Status, q.SkipReason, q.TemplateID], ['Skipped', CONFIG.PDP.CYCLE.SKIP_REASONS.joiner, undefined], 'AC4 April Quarterly (21 days later) Skipped, no template');
      _assertEqual(_pdpcBy(m, '2027-05').Status, 'Planned', 'AC4 May onwards Planned');
      _assertEqual(m.length, 10, 'AC4 goal setting + Apr skipped + May..Dec');
      const cyc = plan.cycles.find(c => c.personId === '20');
      _assertEqual([cyc.joiner, cyc.fields.JoinDate, cyc.fields.BiAnnualScored], [true, '2027-03-10', true], 'AC4 joined by 31 Mar: scored');
      const apr = f.P(21, 'Al April', 'TP', { StartDate: '2027-04-01', ReportsTo: f.sdm.WorkEmail });
      _assertEqual(_pdpcPlan([f.csd, f.sdm, apr], { today: new Date('2027-04-02T12:00:00Z') }).cycles.find(c => c.personId === '21').fields.BiAnnualScored, false, 'AC5 joined 1 Apr: not scored');
      const jan1 = f.P(22, 'Jan First', 'TP', { StartDate: '2027-01-01', ReportsTo: f.sdm.WorkEmail });
      const jan2 = f.P(23, 'Jan Second', 'TP', { StartDate: '2027-01-02', ReportsTo: f.sdm.WorkEmail });
      const p2 = _pdpcPlan([f.csd, f.sdm, jan1, jan2], { today: new Date('2027-01-05T12:00:00Z') });
      _assertEqual(_pdpcMine(p2, 22).length, 12, 'AC5 started 1 Jan: standing (12 meetings)');
      _assertEqual(_pdpcMine(p2, 23).find(x => x.IsJoiner).DueDate, '2027-02-01', 'AC5 started 2 Jan: joiner, due 1 Feb');
    },
  },
  {
    name: 'N-437 AC6-AC7 December goal setting waits for next January; future starters wait',
    fn: function () {
      const f = _pdpFx();
      const nov = f.P(30, 'Nia November', 'TP', { StartDate: '2027-11-05', ReportsTo: f.sdm.WorkEmail });
      const oct = f.P(31, 'Olu October', 'TP', { StartDate: '2027-10-31', ReportsTo: f.sdm.WorkEmail });
      const plan = _pdpcPlan([f.csd, f.sdm, nov, oct], { today: new Date('2027-11-06T12:00:00Z') });
      _assertEqual(plan.cycles.some(c => c.personId === '30'), false, 'AC6 no 2027 cycle for a December goal setting');
      _assertEqual(plan.waiting.find(w => w.personId === '30').reason, 'Joins the January 2028 Annual', 'AC6 listed under Waiting');
      const m = _pdpcMine(plan, 31);
      _assertEqual([m.find(x => x.IsJoiner).DueDate, _pdpcBy(m, '2027-12').Status, m.length], ['2027-11-30', 'Planned', 2], 'AC6 31 Oct starter: goal setting 30 Nov, Dec Monthly Planned (31 days later)');
      const fay = f.P(32, 'Fay Future', 'TP', { StartDate: '2026-12-15', ReportsTo: f.sdm.WorkEmail });
      const p2 = _pdpcPlan([f.csd, f.sdm, fay]);
      _assertEqual(p2.cycles.some(c => c.personId === '32'), false, 'AC7 a future starter is not created');
      _assertEqual(p2.waiting.find(w => w.personId === '32').reason, 'Starts ' + pdpFmtDay('2026-12-15'), 'AC7 listed under Waiting with the start date');
      _assertEqual(_pdpcPlan([f.csd, f.sdm, fay], { mode: 'Pilot', pilot: [] }).waiting.length, 0, 'AC7 Pilot: a future starter not in the pilot is not listed');
    },
  },
  {
    name: 'N-446 existing employee first generated mid-year: standing cycle, no joiner, no late entry',
    fn: function () {
      const f = _pdpFx();
      const plan = _pdpcPlan(f.all, { today: new Date('2027-03-15T12:00:00Z') });
      const cyc = plan.cycles.find(c => c.personId === f.tp1.id).fields;
      _assertEqual([cyc.JoinDate, cyc.BiAnnualScored], ['', true], 'N-446 started 2024, generated 15 Mar: standing, July still scored');
      const mine = _pdpcMine(plan, f.tp1.id);
      _assertEqual([mine.length, mine.some(x => x.IsJoiner), mine.filter(x => x.Status === 'Skipped').map(x => x.Period)], [12, false, ['2027-01', '2027-02']], 'N-446 Jan and Feb passed -> Skipped, rest Planned');
      _assertEqual(_pdpcMine(_pdpcPlan(f.all, { today: new Date('2027-01-20T12:00:00Z') }), f.tp1.id).every(x => x.Status === 'Planned'), true, 'generated before the Annual is due: all Planned');
    },
  },
  {
    name: 'N-446 AC1-AC5 pre-year or blank StartDate added on 10 Nov 2026: standing, Jan-Oct Skipped, Nov-Dec Planned',
    fn: function () {
      const f = _pdpFx();
      const T = (id, extra) => f.P(id, 'Ex Employee ' + id, 'TP', Object.assign({ ReportsTo: f.sdm.WorkEmail }, extra));
      const early = T(60, { StartDate: '2025-03-01' });
      const blank = T(61, { StartDate: '' });
      const today = new Date('2026-11-10T12:00:00Z');
      const plan = _pdpcPlan([f.csd, f.sdm, early, blank], { year: 2026, today });
      [60, 61].forEach(id => {
        const cyc = plan.cycles.find(c => c.personId === String(id)).fields;
        _assertEqual([cyc.JoinDate, cyc.Status, cyc.BiAnnualScored], ['', 'Open', false], 'AC1/AC4 ' + id + ' standing cycle, July skipped so not scored');
        _assertEqual(plan.waiting.some(w => w.personId === String(id)), false, 'AC1 ' + id + ' not Waiting');
        const mine = _pdpcMine(plan, id);
        _assertEqual(mine.length, 12, 'AC2 ' + id + ' twelve meetings');
        const sk = mine.filter(m => m.Status === 'Skipped');
        _assertEqual([sk.length, sk[sk.length - 1].Period, sk.every(m => m.SkipReason === CONFIG.PDP.CYCLE.SKIP_REASONS.preStart && m.TemplateID === undefined)], [10, '2026-10', true], 'AC2 ' + id + ' Jan-Oct Skipped, reason, no template');
        const pl = mine.filter(m => m.Status === 'Planned');
        _assertEqual([pl.map(m => m.Period), pl.every(m => !m.IsJoiner && m.TemplateID !== undefined)], [['2026-11', '2026-12'], true], 'AC2 ' + id + ' Nov and Dec Planned with template');
      });
    },
  },
  {
    name: 'N-446 AC4-AC8 boundaries, joiners unchanged, year ahead, idempotent, missing meeting on an existing cycle',
    fn: function () {
      const f = _pdpFx();
      const T = (id, extra) => f.P(id, 'Ex Employee ' + id, 'TP', Object.assign({ ReportsTo: f.sdm.WorkEmail }, extra));
      const early = T(62, { StartDate: '2025-03-01' });
      const base = [f.csd, f.sdm, early];
      const jun = _pdpcPlan(base, { year: 2026, today: new Date('2026-06-20T12:00:00Z') });
      const mj = _pdpcMine(jun, 62);
      _assertEqual([mj.filter(m => m.Status === 'Skipped').length, _pdpcBy(mj, '2026-07').Status, jun.cycles.find(c => c.personId === '62').fields.BiAnnualScored], [5, 'Planned', true], 'AC4 20 Jun: Jan-May Skipped, July Planned and scored');
      const oct = _pdpcMine(_pdpcPlan(base, { year: 2026, today: new Date('2026-10-31T12:00:00Z') }), 62);
      _assertEqual([_pdpcBy(oct, '2026-09').Status, _pdpcBy(oct, '2026-10').Status], ['Skipped', 'Planned'], 'AC5 due today is not past');
      const nov = new Date('2026-11-10T12:00:00Z');
      const ahead = _pdpcMine(_pdpcPlan(base, { year: 2027, today: nov }), 62);
      _assertEqual([ahead.length, ahead.every(m => m.Status === 'Planned')], [12, true], 'AC8 year ahead: all Planned');
      const sep = T(63, { StartDate: '2026-09-01' });
      const nv = T(64, { StartDate: '2026-11-05' });
      const jp = _pdpcPlan(base.concat(sep, nv), { year: 2026, today: nov });
      const js = jp.cycles.find(c => c.personId === '63');
      _assertEqual([js.joiner, js.fields.JoinDate, _pdpcMine(jp, 63).find(m => m.IsJoiner).DueDate], [true, '2026-09-01', '2026-10-01'], 'AC6 in-year starter stays a joiner');
      _assertEqual(jp.waiting.find(w => w.personId === '64').reason, 'Joins the January 2027 Annual', 'AC6 December goal setting stays Waiting');
      const plan = _pdpcPlan(base, { year: 2026, today: nov });
      const applied = _pdpcApplied(plan);
      _assertEqual(_pdpcPlan(base, { year: 2026, today: nov, cycles: applied.cycles, meetings: applied.meetings }).nothingToDo, true, 'AC9 re-run after Apply has nothing to do');
      const gap = applied.meetings.filter(m => m.Period !== '2026-03');
      const again = _pdpcPlan(base, { year: 2026, today: nov, cycles: applied.cycles, meetings: gap });
      const miss = again.meetings.filter(m => m.personId === '62').map(m => m.fields);
      _assertEqual([miss.length, miss[0].Period, miss[0].Status], [1, '2026-03', 'Planned'], 'AC10 existing cycle missing a meeting: created Planned (unchanged)');
      _assertEqual([pdpEntryDate.length, String(pdpBuildCyclePlan).includes('Before PDP start'), String(pdpExpectedMeetings).includes('Before PDP start')], [2, false, false], 'AC11 two-arg entry date, reason read from config');
    },
  },
  {
    name: 'N-437 AC8 cannot generate / warnings',
    fn: function () {
      const f = _pdpFx();
      const noLm = f.P(40, 'Nol Manager', 'TP', { ReportsTo: '' });
      const dupA = f.P(41, 'Dup One', 'TP', { WorkEmail: 'dup@mg.test', ReportsTo: f.sdm.WorkEmail });
      const dupB = f.P(42, 'Dup Two', 'TP', { WorkEmail: 'dup@mg.test', ReportsTo: f.sdm.WorkEmail });
      const noMail = f.P(43, 'Nom Email', 'TP', { WorkEmail: '', ReportsTo: f.sdm.WorkEmail });
      const orphan = f.P(44, 'Orla Orphan', 'SDM', { ReportsTo: 'someone@mg.test' });
      const plan = _pdpcPlan(f.all.concat(noLm, dupA, dupB, noMail, orphan));
      const why = id => (plan.cannot.find(c => c.personId === String(id)) || {}).reason;
      _assertEqual(why(40), 'No line manager (ReportsTo)', 'AC8 no line manager');
      _assertEqual([why(41), why(42)], ['Work email is shared with another People row', 'Work email is shared with another People row'], 'AC8 shared email');
      _assertEqual(why(43), 'No work email', 'AC8 no work email');
      _assertEqual([40, 41, 42, 43].some(id => plan.cycles.some(c => c.personId === String(id)) || plan.meetings.some(m => m.personId === String(id))), false, 'AC8 nothing written for them');
      _assertEqual(plan.warnings.some(w => w.personId === '44'), true, 'AC8 no CSD above: warned');
      _assertEqual(plan.cycles.find(c => c.personId === '44').fields.CSDEmail, '', 'AC8 generated with CSD blank');
    },
  },
  {
    name: 'N-437 AC9 promotion: ScoringLevel follows LevelSince at Bi-Annual - 3 months, frozen once held',
    fn: function () {
      const f = _pdpFx();
      const db = _pdpcApplied(_pdpcPlan(f.all));
      const promoted = since => f.all.map(p => p.id === f.stp.id ? Object.assign({}, p, { Level: 'SDM', LevelSince: since }) : p);
      const at = (since, extra) => _pdpcPlan(promoted(since), Object.assign({ today: new Date('2027-05-15T12:00:00Z') }, db, extra));
      const upd = pl => pl.cycleUpdates.find(u => u.personId === f.stp.id);
      _assertEqual(upd(at('2027-04-30')).fields, { ScoringLevel: 'L5-MG' }, 'AC9 promoted on 30 Apr: new level');
      _assertEqual(upd(at('2027-05-01')), undefined, 'AC9 promoted on 1 May: stays L4-IC (no update)');
      _assertEqual(upd(at('')).fields, { ScoringLevel: 'L5-MG' }, 'AC9 blank LevelSince: new level');
      const held = db.meetings.map(m => (String(m.PersonID) === f.stp.id && m.MeetingType === 'BiAnnual') ? Object.assign({}, m, { Status: 'Held' }) : m);
      _assertEqual(upd(at('2027-01-01', { meetings: held, today: new Date('2027-08-15T12:00:00Z') })), undefined, 'AC9 frozen once the Bi-Annual is held');
      _assertEqual(pdpScoringLevel('L4-IC', Object.assign({}, f.stp, { Level: 'CSD' }), 2027), 'L4-IC', 'AC9 an unmapped level keeps the start level');
    },
  },
  {
    name: 'N-437 AC10 leavers and scope exits skip what is left and close the cycle; pilot removal touches nothing',
    fn: function () {
      const f = _pdpFx();
      const db = _pdpcApplied(_pdpcPlan(f.all));
      const swap = (id, patch) => f.all.map(p => p.id === id ? Object.assign({}, p, patch) : p);
      const today = new Date('2027-06-20T12:00:00Z');
      const left = _pdpcPlan(swap(f.tp1.id, { EndDate: '2027-06-15', IsActive: false }), Object.assign({ today }, db));
      const skips = left.meetingUpdates.filter(u => u.personId === f.tp1.id);
      _assertEqual(skips.length, 7, 'AC10 everything due after 15 Jun skipped (Jun 30 to Dec)');
      _assertEqual(skips.every(u => u.fields.Status === 'Skipped' && u.fields.SkipReason === CONFIG.PDP.CYCLE.SKIP_REASONS.left), true, 'AC10 reason Left Momentum');
      _assertEqual(Object.keys(skips[0].fields).sort(), ['SkipReason', 'Status'], 'AC13 a skip writes only Status + SkipReason');
      _assertEqual(left.cycleUpdates.find(u => u.personId === f.tp1.id).fields, { Status: 'Closed' }, 'AC10 cycle Closed');
      _assertEqual(left.meetings.some(m => m.personId === f.tp1.id), false, 'AC10 nothing created for a leaver');
      const csd = _pdpcPlan(swap(f.sdm.id, { Level: 'CSD' }), Object.assign({ today }, db));
      const sk = csd.meetingUpdates.filter(u => u.personId === f.sdm.id);
      _assertEqual([sk.length, sk[0].fields.SkipReason], [7, CONFIG.PDP.CYCLE.SKIP_REASONS.scope], 'AC10 SDM -> CSD on 20 Jun: Jun 30 to Dec skipped, Left PDP scope');
      const pilotDb = _pdpcApplied(_pdpcPlan(f.all, { mode: 'Pilot', pilot: [f.tp1.WorkEmail] }));
      const removed = _pdpcPlan(f.all, Object.assign({ mode: 'Pilot', pilot: [], today }, pilotDb));
      _assertEqual([removed.meetingUpdates.length, removed.cycleUpdates.length, removed.meetings.length, removed.cycles.length], [0, 0, 0, 0], 'AC10 removed from the pilot: zero writes');
      const notice = _pdpcPlan(swap(f.tp2.id, { EndDate: '2027-09-10' }), Object.assign({ today }, db));
      _assertEqual([notice.meetingUpdates.filter(u => u.personId === f.tp2.id).length, notice.cycleUpdates.some(u => u.personId === f.tp2.id)], [4, false], 'AC10 future EndDate 10 Sep: Sep 30 to Dec skipped, cycle stays Open');
      const heldDb = { cycles: db.cycles, meetings: db.meetings.map(m => (String(m.PersonID) === f.tp1.id && m.Period === '2027-07') ? Object.assign({}, m, { Status: 'Held' }) : m) };
      _assertEqual(_pdpcPlan(swap(f.tp1.id, { EndDate: '2027-06-15', IsActive: false }), Object.assign({ today }, heldDb)).meetingUpdates.filter(u => u.personId === f.tp1.id).length, 6, 'AC10 a Held meeting is never changed');
    },
  },
  {
    name: 'N-437 AC11 templates: re-bind Planned to a newer version, never PrepOpen; a missing template blocks',
    fn: function () {
      const f = _pdpFx();
      const db = _pdpcApplied(_pdpcPlan(f.all));
      db.meetings.forEach(m => { if (String(m.PersonID) === f.tp1.id && m.Period === '2027-04') m.Status = 'PrepOpen'; });
      const v2 = _pdpcTpl([{ id: '200', MeetingType: 'Quarterly', VersionNo: 2, Status: 'Published' }]);
      const plan = _pdpcPlan(f.all, Object.assign({ templates: v2 }, db));
      const tia = plan.meetingUpdates.filter(u => u.personId === f.tp1.id);
      _assertEqual(tia.length, 1, 'AC11 one re-bind for Tia (October; April is PrepOpen)');
      _assertEqual(tia[0].fields, { TemplateID: 200, TemplateVersion: 2 }, 'AC11 a re-bind writes only the template fields');
      _assertEqual(plan.meetingUpdates.length, 6 * 2 - 1, 'AC11 every Planned Quarterly re-bound, the PrepOpen one not');
      const none = _pdpcPlan(f.all, { templates: _pdpcTpl().filter(t => t.MeetingType !== 'Monthly') });
      _assertEqual(none.blockedTemplates, [{ type: 'Monthly', label: CONFIG.PDP.MEETING_LABELS.Monthly }], 'AC11 a missing Monthly template blocks');
      const draft = _pdpcPlan(f.all, { templates: _pdpcTpl().concat({ id: '300', MeetingType: 'Annual', VersionNo: 2, Status: 'Draft' }) });
      _assertEqual(draft.meetings.find(m => m.fields.MeetingType === 'Annual').fields.TemplateID, 100, 'AC11 a Draft is never bound');
    },
  },
  {
    name: 'N-437 AC12-AC13 idempotent; a half-applied run finishes; payloads clean; the write set is narrow',
    fn: function () {
      const f = _pdpFx();
      const plan = _pdpcPlan(f.all);
      plan.meetings.forEach(m => _assertEqual('AccessKey' in pdpCleanMeetings(Object.assign({ CycleID: 1 }, m.fields), 'create'), false, 'AC13 no AccessKey'));
      const db = _pdpcApplied(plan);
      const again = _pdpcPlan(f.all, db);
      _assertEqual([again.cycles.length, again.meetings.length, again.meetingUpdates.length, again.cycleUpdates.length, again.nothingToDo], [0, 0, 0, 0, true], 'AC12 plan on its own output: nothing to do');
      const half = { cycles: db.cycles, meetings: db.meetings.filter(m => !(String(m.PersonID) === f.tp1.id && m.Period >= '2027-07')) };
      const rest = _pdpcPlan(f.all, half);
      const cyc = db.cycles.find(c => String(c.PersonID) === f.tp1.id);
      _assertEqual([rest.cycles.length, rest.meetings.length], [0, 6], 'AC12 half-applied: only the six missing meetings');
      _assertEqual(rest.meetings.every(m => m.newCycle === false && m.fields.CycleID === Number(cyc.id)), true, 'AC12 using the stored cycle id');
      const ended = _pdpcPlan(f.all, Object.assign({ today: new Date('2028-01-05T12:00:00Z') }, { cycles: db.cycles, meetings: db.meetings.map(m => Object.assign({}, m, { Status: 'SignedOff' })) }));
      _assertEqual(ended.cycleUpdates.filter(u => u.fields.Status === 'Closed').length, 6, 'year over, everything signed off: cycles Closed');
      const src = ALL_SOURCES['api-pdp.js'];
      const eng = src.slice(src.indexOf('async function planPdpCycle'), src.indexOf('// ── N-439 (PDP-7)'));
      _assertEqual(/deleteItem|graphRequest\(|createPdp(Goal|Action|Score)|updatePdp(Goal|Action|Score)|AccessKey/.test(_pdpApiNoTeamDelete(eng)), false, 'AC13 engine API: no delete, raw Graph, Goals / Actions / Scores or AccessKey');
    },
  },
  {
    name: 'N-437 AC14-AC15 API order + role gate (source); modes Off / Pilot / On',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'];
      const plan = src.slice(src.indexOf('async function planPdpCycle'), src.indexOf('async function applyPdpCycle'));
      const apply = src.slice(src.indexOf('async function applyPdpCycle'));
      _assertEqual(plan.indexOf('_pdpSetupWho(') > -1 && plan.indexOf('_pdpSetupWho(') < plan.indexOf('getPdpCycles('), true, 'AC14 role check before any personal-list read');
      _assertEqual(/wasListDenied/.test(plan), true, 'AC14 a denied list is an error for an admin');
      _assertEqual(/planPdpCycle\(year, true\)/.test(apply), true, 'AC14 Apply re-plans fresh');
      const a = apply.indexOf('createPdpCycle('), b = apply.indexOf('createPdpMeeting('), c = apply.indexOf('updatePdpMeeting(');
      _assertEqual(a > -1 && a < b && b < c, true, 'AC14 cycles, then meetings, then updates');
      _assertEqual(roleCan('leadership', 'pdpAdmin'), false, 'AC14 Leadership is refused');
      const f = _pdpFx();
      const off = _pdpcPlan(f.all, { mode: 'Off' });
      _assertEqual([off.off, off.nothingToDo], [true, true], 'AC15 Off: empty plan');
      _assertEqual(_pdpcPlan(f.all, { mode: 'Pilot', pilot: [f.tp1.WorkEmail] }).cycles.map(c => c.personId), [f.tp1.id], 'AC15 Pilot: only the pilot person, not their reviewers');
      _assertEqual(_pdpcPlan(f.all, { mode: 'On' }).cycles.length, 6, 'AC15 On: everyone in scope');
    },
  },
  {
    name: 'N-437 AC16 due state and cycle summary',
    fn: function () {
      const m = (due, st) => ({ DueDate: due, Status: st || 'Planned' });
      const t = '2027-03-10';
      _assertEqual(pdpMeetingState(m('2027-02-28'), t), 'overdue', 'AC16 past due');
      _assertEqual(pdpMeetingState(m('2027-03-10'), t), 'due', 'AC16 due today is due, not overdue');
      _assertEqual(pdpMeetingState(m('2027-03-24'), t), 'due', 'AC16 within 14 days');
      _assertEqual(pdpMeetingState(m('2027-03-25'), t), 'upcoming', 'AC16 15 days out');
      _assertEqual(pdpMeetingState(m('2027-02-28', 'Held'), t), 'done', 'AC16 held');
      _assertEqual(pdpMeetingState(m('2027-02-28', 'SignedOff'), t), 'done', 'AC16 signed off');
      _assertEqual(pdpMeetingState(m('2027-02-28', 'Skipped'), t), 'skipped', 'AC16 skipped');
      _assertEqual(pdpMeetingState(m('2027-02-28', 'PrepOpen'), t), 'overdue', 'AC16 prep open and past due');
      const s = pdpCycleSummary([m('2027-01-31', 'SignedOff'), m('2027-02-28'), m('2027-03-31'), m('2027-04-30', 'Skipped'), m('2027-05-31')], t);
      _assertEqual([s.total, s.done, s.overdue, s.due, s.skipped, s.upcoming, s.next.DueDate], [5, 1, 1, 0, 1, 2, '2027-02-28'], 'AC16 summary counts + next');
    },
  },
  {
    name: 'N-437 AC17-AC18 Level since on the employee form; Cycle tab + banner wiring; level key shape',
    fn: function () {
      const form = ALL_SOURCES['people-forms.js'];
      _assertEqual(/name='LevelSince'/.test(form) && /isoDate\(data\.LevelSince\)/.test(form), true, 'AC17 form field written through isoDate');
      _assertEqual(/_onPersonLevelChange/.test(form) && /localDayISO\(\)/.test(form), true, 'AC17 a Level change pre-fills today');
      const api = ALL_SOURCES['api.js'];
      _assertEqual(/LevelSince:\s+fields\.LevelSince/.test(api) && /payload\.LevelSince\s+= fields\.LevelSince/.test(api), true, 'AC17 createPerson / updatePerson map LevelSince');
      const setup = ALL_SOURCES['pdp-setup.js'];
      _assertEqual(/pdps-tab-cycle/.test(setup) && /pdpcCycleHtml\(\)/.test(setup) && /pdpsCycleBanner\(\)/.test(setup), true, 'AC18 Cycle tab and banner on PDP Setup');
      _assertEqual(/applyPdpCycle|createPdp|updatePdp/.test(setup), false, 'AC18 the banner never writes');
      const page = (CONFIG.COMMAND_BAR_PAGES || []).find(p => p.key === 'pdpSetup');
      _assertEqual(page.roles.slice().sort(), ['admin', 'people_ops'], 'AC18 PDP Setup is still Admin + People Ops only');
      _assertEqual(pdpLevelKey('L4', 'IC'), 'L4-IC', 'level key');
      _assertEqual(pdpParseLevelKey('l5-mg'), { level: 'L5', track: 'MG' }, 'level key parse, case-insensitive');
      _assertEqual([pdpParseLevelKey('L7-IC'), pdpParseLevelKey('L3'), pdpParseLevelKey('')], [null, null, null], 'invalid keys');
      _assertEqual(pdpCleanCycles({ ScoringLevel: 'L5-MG' }, 'update'), { ScoringLevel: 'L5-MG' }, 'cycle ScoringLevel takes a level key');
      let err = '';
      try { pdpCleanCycles({ ScoringLevel: 'L3' }, 'update'); } catch (e) { err = e.message; }
      _assertEqual(/level and track/.test(err), true, 'a bare level is rejected');
    },
  }
);