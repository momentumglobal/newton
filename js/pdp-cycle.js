// js/pdp-cycle.js — PDP cycle engine rules (N-437 / PDP-5). Pure: reads CONFIG.PDP and the shared
// helpers in utils.js (spDateIn, addDaysISO, localDayISO, utcDateOnly), pdp-identity.js (scope,
// reviewers, the switch) and pdp-data.js (keys, active template) — no network I/O, no DOM.
// Loaded on people.html straight after pdp-data.js. Not in CONFIG.MCP.scripts (PDP-D12).
//
// pdpBuildCyclePlan() turns People + the year's existing cycles / meetings + the templates into the
// exact rows to create and the few fields to update. api-pdp.js (planPdpCycle / applyPdpCycle) reads
// and writes; pdp-cycle-admin.js shows the plan. The rules (PDP-D9 to D11, Chris 5-6 Nov 2026):
//   • Calendar: CONFIG.PDP.CYCLE.CALENDAR, one meeting a month, due on the last day of the month.
//   • Joiners: goal setting (Annual template, IsJoiner) due join + 30 days; calendar meetings due
//     before it are not created, those due within 21 days after it are Skipped; a goal setting that
//     would fall in December means no cycle that year (they join the next January Annual).
//   • Existing employees (StartDate before the year, or blank) are never joiners: someone first brought
//     into PDP part-way through the year (added to the pilot, or PDP switched On) gets the standing
//     year, with the meetings already past created Skipped ("Before PDP start", N-446).
//   • Bi-Annual scored only if joined on or before 31 March and the July meeting is not Skipped.
//   • Promotion: ScoringLevel is the new level once People.LevelSince is 3+ months before the
//     Bi-Annual due date; frozen once the Bi-Annual is held.
//   • Leavers and scope exits: Planned / PrepOpen meetings due after they left are Skipped and the
//     cycle Closed. Removal from the pilot changes nothing (N-445).
// The engine never deletes, never touches prep / notes / sign-off, snapshots or AccessKey, and
// running a plan against its own applied output yields nothing to do.

const _PDPC_OPEN = ['Planned', 'PrepOpen'];
const _PDPC_DONE = ['Held', 'SignedOff'];

function _pdpcPad(n) { return String(n).padStart(2, '0'); }
function _pdpcDay(today) { return typeof today === 'string' ? today : localDayISO(today || new Date()); }

// Last day of a month: (2027, 2) -> '2027-02-28'. String maths only (UTC getters), no local dates.
function pdpMonthEnd(year, month) {
  const y = Number(year), m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new Error('PDP month must be a year and a month from 1 to 12');
  return y + '-' + _pdpcPad(m) + '-' + _pdpcPad(new Date(Date.UTC(y, m, 0)).getUTCDate());
}

// Shift a day by whole calendar months, clamping to the month end: ('2027-07-31', -3) -> '2027-04-30'.
function pdpAddMonthsISO(dayISO, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayISO || ''));
  if (!m) return null;
  const idx = Number(m[1]) * 12 + (Number(m[2]) - 1) + Number(n);
  const y = Math.floor(idx / 12), mo = (idx % 12 + 12) % 12 + 1;
  const last = Number(pdpMonthEnd(y, mo).split('-')[2]);
  return y + '-' + _pdpcPad(mo) + '-' + _pdpcPad(Math.min(Number(m[3]), last));
}

// The year's twelve calendar meetings: [{ MeetingType, Period 'YYYY-MM', DueDate 'YYYY-MM-DD' }].
function pdpCalendar(year) {
  const y = Number(year);
  if (!Number.isInteger(y)) throw new Error('PDP cycle year must be a whole number');
  return CONFIG.PDP.CYCLE.CALENDAR.map((type, i) => ({ MeetingType: type, Period: y + '-' + _pdpcPad(i + 1), DueDate: pdpMonthEnd(y, i + 1) }));
}
function _pdpcDueOf(year, type) {
  const m = pdpCalendar(year).find(x => x.MeetingType === type);
  return m ? m.DueDate : null;
}

// People.Level -> { level, track } on the framework, or null (not a PDP level).
function pdpLevelFor(person) {
  const m = person ? CONFIG.PDP.CYCLE.LEVEL_MAP[person.Level] : null;
  return m ? { level: m.level, track: m.track } : null;
}

// When the person joins this year's cycle: their StartDate if it is in the year; otherwise '' (an
// existing employee, or a blank StartDate: the standing year).
function pdpEntryDate(person, year) {
  const start = spDateIn(person && person.StartDate) || '';
  return start && start >= year + '-01-01' ? start : '';
}

// -> { kind: 'standing' } | { kind: 'waiting' } | { kind: 'joiner', joinDate, gsDue, gsPeriod }
function pdpJoinerPlan(entry, year) {
  if (!entry) return { kind: 'standing' };
  const gsDue = addDaysISO(entry, CONFIG.PDP.CYCLE.JOINER_DUE_DAYS);
  if (!gsDue) return { kind: 'standing' };
  if (gsDue <= _pdpcDueOf(year, 'Annual')) return { kind: 'standing' };
  if (gsDue >= year + '-12-01') return { kind: 'waiting' };   // goal setting would fall in December (or later)
  return { kind: 'joiner', joinDate: entry, gsDue, gsPeriod: gsDue.slice(0, 7) };
}

// PDP-D10: the July Bi-Annual is scored for the standing population and for anyone who joined on
// or before the cut-off ('03-31').
function pdpBiAnnualScored(joinDate, year) {
  return !joinDate || joinDate <= year + '-' + CONFIG.PDP.CYCLE.BIANNUAL_CUTOFF;
}

// PDP-D11: the level key the Bi-Annual scores against. startKey = the cycle's level at creation.
// A changed level counts once People.LevelSince is on or before the Bi-Annual due date minus
// PROMOTION_MIN_MONTHS calendar months; a blank LevelSince counts as held long enough.
function pdpScoringLevel(startKey, person, year) {
  const cur = pdpLevelFor(person);
  if (!cur) return startKey;
  const curKey = pdpLevelKey(cur.level, cur.track);
  if (curKey === startKey) return startKey;
  const since = spDateIn(person.LevelSince) || '';
  if (!since) return curKey;
  const limit = pdpAddMonthsISO(_pdpcDueOf(year, 'BiAnnual'), -CONFIG.PDP.CYCLE.PROMOTION_MIN_MONTHS);
  return since <= limit ? curKey : startKey;
}

// The meetings a plan should hold: [{ MeetingType, Period, DueDate, IsJoiner, Status, SkipReason }].
// notBefore (optional, a day): a standing plan's meetings due before it are Skipped, "Before PDP start".
function pdpExpectedMeetings(plan, year, notBefore) {
  const cal = pdpCalendar(year);
  const row = (m, extra) => Object.assign({ MeetingType: m.MeetingType, Period: m.Period, DueDate: m.DueDate, IsJoiner: false, Status: 'Planned', SkipReason: '' }, extra);
  if (!plan || plan.kind === 'standing') {
    return cal.map(m => notBefore && m.DueDate < notBefore ? row(m, { Status: 'Skipped', SkipReason: CONFIG.PDP.CYCLE.SKIP_REASONS.preStart }) : row(m));
  }
  if (plan.kind !== 'joiner') return [];
  const skipTo = addDaysISO(plan.gsDue, CONFIG.PDP.CYCLE.JOINER_SKIP_DAYS);
  const out = [row({ MeetingType: 'Annual', Period: plan.gsPeriod, DueDate: plan.gsDue }, { IsJoiner: true })];
  cal.forEach(m => {
    if (m.DueDate <= plan.gsDue) return;
    out.push(m.DueDate <= skipTo ? row(m, { Status: 'Skipped', SkipReason: CONFIG.PDP.CYCLE.SKIP_REASONS.joiner }) : row(m));
  });
  return out;
}

// Has the person left? -> { left, cutoff }. cutoff = the last day a meeting may fall on ('' = none).
function _pdpcEnd(person, todayISO) {
  if (!person) return { left: true, cutoff: todayISO };
  const end = spDateIn(person.EndDate) || '';
  if (!_pdpYes(person.IsActive)) return { left: true, cutoff: end && end < todayISO ? end : todayISO };
  if (end && end < todayISO) return { left: true, cutoff: end };
  return { left: false, cutoff: end };
}

// Display label of one meeting.
function pdpMeetingLabel(m) {
  if (m && _pdpYes(m.IsJoiner)) return 'Joiner goal setting';
  return (m && CONFIG.PDP.MEETING_LABELS[m.MeetingType]) || (m && m.MeetingType) || '';
}

// 'YYYY-MM-DD' -> '31 Jan 2027' (UTC, so no day shift). '' for a blank.
function pdpFmtDay(dayISO) {
  const d = utcDateOnly(dayISO);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
}

// Due state of one meeting, derived (never stored): done | skipped | overdue | due | upcoming.
// 'due' = due within CONFIG.PDP.CYCLE.DUE_SOON_DAYS (due today is due, not overdue).
function pdpMeetingState(meeting, today) {
  const t = _pdpcDay(today);
  const st = meeting && meeting.Status;
  if (_PDPC_DONE.includes(st)) return 'done';
  if (st === 'Skipped') return 'skipped';
  if (pdpIsOverdue(meeting, t)) return 'overdue';
  const due = spDateIn(meeting && meeting.DueDate);
  if (due && due <= addDaysISO(t, CONFIG.PDP.CYCLE.DUE_SOON_DAYS)) return 'due';
  return 'upcoming';
}

// One person-year: { total, done, skipped, overdue, due, upcoming, next } (next = earliest open meeting).
function pdpCycleSummary(meetings, today) {
  const t = _pdpcDay(today);
  const s = { total: 0, done: 0, skipped: 0, overdue: 0, due: 0, upcoming: 0, next: null };
  (meetings || []).forEach(m => {
    const st = pdpMeetingState(m, t);
    s.total++;
    s[st]++;
    if (st !== 'done' && st !== 'skipped' && (!s.next || String(spDateIn(m.DueDate)) < String(spDateIn(s.next.DueDate)))) s.next = m;
  });
  return s;
}

// N-441: completion for one cycle year, aggregate only (no names). Counts the meetings of `year` due on or
// before `today`, Skipped excluded: held = Held / SignedOff, overdue = pdpMeetingState 'overdue',
// peopleOverdue = distinct people with at least one overdue meeting, pct = held / dueToDate as a whole
// percent (null while nothing is due yet).
function pdpCompletion(meetings, today, year) {
  const t = _pdpcDay(today);
  const out = { year: Number(year), dueToDate: 0, held: 0, overdue: 0, peopleOverdue: 0, pct: null };
  const late = new Set();
  (meetings || []).forEach(m => {
    if (!m || Number(m.CycleYear) !== Number(year) || m.Status === 'Skipped') return;
    const due = spDateIn(m.DueDate);
    if (!due || due > t) return;
    out.dueToDate++;
    const st = pdpMeetingState(m, t);
    if (st === 'done') out.held++;
    else if (st === 'overdue') { out.overdue++; late.add(String(m.PersonID)); }
  });
  out.peopleOverdue = late.size;
  out.pct = out.dueToDate ? Math.round(out.held * 100 / out.dueToDate) : null;
  return out;
}

// The years the Cycle tab offers: this year, plus next year from NEXT_YEAR_FROM_MONTH.
function pdpCycleYears(today) {
  const t = _pdpcDay(today);
  const y = Number(t.split('-')[0]), mo = Number(t.split('-')[1]);
  return mo >= CONFIG.PDP.CYCLE.NEXT_YEAR_FROM_MONTH ? [y, y + 1] : [y];
}

// Planned / PrepOpen meetings due after `cutoff` -> Skipped with `reason`.
function _pdpcSkipAfter(out, mine, cutoff, reason, personId, name) {
  mine.forEach(m => {
    const due = spDateIn(m.DueDate) || '';
    if (!_PDPC_OPEN.includes(m.Status) || !due || due <= cutoff) return;
    out.meetingUpdates.push({ id: String(m.id), personId, name, fields: { Status: 'Skipped', SkipReason: reason }, why: pdpMeetingLabel(m) + ' (' + pdpFmtDay(due) + ') skipped: ' + reason });
  });
}

// The whole engine. input = { year, mode, pilot, people, cycles, meetings, templates, today (Date) }.
// -> { year, mode, off, cycles: [{ personId, name, joiner, fields }], meetings: [{ personId, name, key,
//      newCycle, fields }], meetingUpdates / cycleUpdates: [{ id, personId, name, fields, why }],
//      cannot / warnings / waiting: [{ personId, name, reason }], blockedTemplates: [{ type, label }],
//      people: [{ personId, name, lm, joinDate, status, summary }], counts, nothingToDo }
// Meeting `fields` of a new cycle carry no CycleID: the caller fills it once the cycle exists.
function pdpBuildCyclePlan(input) {
  const o = input || {};
  const year = Number(o.year);
  if (!Number.isInteger(year)) throw new Error('PDP cycle year must be a whole number');
  const today = o.today instanceof Date ? o.today : new Date();
  const todayISO = localDayISO(today);
  const C = CONFIG.PDP.CYCLE;
  const mode = pdpNormaliseMode(o.mode);
  const out = {
    year, mode, off: mode === CONFIG.PDP.MODES[0],
    cycles: [], meetings: [], meetingUpdates: [], cycleUpdates: [],
    cannot: [], warnings: [], waiting: [], blockedTemplates: [], people: [], counts: {}, nothingToDo: true,
  };
  const finish = () => {
    const touched = new Set(out.cycles.concat(out.meetings).map(x => x.personId));
    out.counts = {
      cycles: out.cycles.length, meetings: out.meetings.length,
      planned: out.meetings.filter(m => m.fields.Status === 'Planned').length,
      skipped: out.meetings.filter(m => m.fields.Status === 'Skipped').length,
      updates: out.meetingUpdates.length + out.cycleUpdates.length,
      peopleToCreate: touched.size,
      cannot: out.cannot.length, warnings: out.warnings.length, waiting: out.waiting.length,
    };
    out.nothingToDo = !out.counts.cycles && !out.counts.meetings && !out.counts.updates;
    return out;
  };
  if (out.off) return finish();

  const people = o.people || [];
  const index = pdpEmailIndex(people);
  const byId = new Map(people.map(p => [String(p.id), p]));
  const scope = pdpEngineScope(mode, o.pilot, people, today);
  const scopeIds = new Set(scope.map(p => String(p.id)));
  const cycleByPerson = new Map();
  (o.cycles || []).filter(c => Number(c.CycleYear) === year).forEach(c => {
    const k = String(c.PersonID);
    if (!cycleByPerson.has(k)) cycleByPerson.set(k, c);
  });
  const meetingsByPerson = new Map();
  (o.meetings || []).filter(m => Number(m.CycleYear) === year).forEach(m => {
    const k = String(m.PersonID);
    if (!meetingsByPerson.has(k)) meetingsByPerson.set(k, []);
    meetingsByPerson.get(k).push(m);
  });
  const tpl = {};
  CONFIG.PDP.MEETING_TYPES.forEach(t => { tpl[t] = pdpActiveTemplate(o.templates || [], t); });
  const blocked = new Set();

  const nameOf = id => { const p = byId.get(id); const c = cycleByPerson.get(id); return (p && _pdpName(p)) || (c && c.PersonName) || ('Person ' + id); };
  const ids = [...new Set([...scopeIds, ...cycleByPerson.keys()])].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  ids.forEach(id => {
    const p = byId.get(id) || null;
    const c = cycleByPerson.get(id) || null;
    const mine = meetingsByPerson.get(id) || [];
    const name = nameOf(id);
    const person = (status, lm, joinDate) => out.people.push({ personId: id, name, lm: lm || '', joinDate: joinDate || '', status, summary: pdpCycleSummary(mine, todayISO) });
    const end = _pdpcEnd(p, todayISO);
    const exit = !end.left && !pdpInScope(p, today);

    // Leavers and scope exits: skip what is left, close the cycle (only people who have a cycle).
    if (c && (end.left || exit)) {
      const reason = end.left ? C.SKIP_REASONS.left : C.SKIP_REASONS.scope;
      _pdpcSkipAfter(out, mine, end.left ? end.cutoff : todayISO, reason, id, name);
      if (c.Status !== 'Closed') out.cycleUpdates.push({ id: String(c.id), personId: id, name, fields: { Status: 'Closed' }, why: 'Cycle closed: ' + reason });
      person('closed', c.LineManagerEmail, spDateIn(c.JoinDate));
      return;
    }
    // Out of the engine's scope but still in PDP (removed from the pilot): records untouched.
    if (!scopeIds.has(id)) {
      if (c) person(c.Status === 'Closed' ? 'closed' : 'untouched', c.LineManagerEmail, spDateIn(c.JoinDate));
      return;
    }

    const email = _pdpEmail(p.WorkEmail);
    if (!email || (index.get(email) || []).length !== 1) {
      out.cannot.push({ personId: id, name, reason: email ? 'Work email is shared with another People row' : 'No work email' });
      return;
    }
    const rev = pdpReviewerEmails(index, p);
    if (!rev.lm) { out.cannot.push({ personId: id, name, reason: 'No line manager (ReportsTo)' }); return; }
    const lvl = pdpLevelFor(p);
    if (!lvl) { out.cannot.push({ personId: id, name, reason: 'No PDP level for ' + (p.Level || 'a blank level') }); return; }
    if (!rev.csd) out.warnings.push({ personId: id, name, reason: rev.flag === 'chainCycle' ? 'The reporting line loops, so no CSD was found. CSD left blank.' : 'No CSD above them. CSD left blank.' });

    let plan;
    if (c) {
      const jd = spDateIn(c.JoinDate) || '';
      plan = jd ? pdpJoinerPlan(jd, year) : { kind: 'standing' };
      if (plan.kind === 'waiting') plan = { kind: 'joiner', joinDate: jd, gsDue: addDaysISO(jd, C.JOINER_DUE_DAYS), gsPeriod: addDaysISO(jd, C.JOINER_DUE_DAYS).slice(0, 7) };
    } else {
      plan = pdpJoinerPlan(pdpEntryDate(p, year), year);
      if (plan.kind === 'waiting') { out.waiting.push({ personId: id, name, reason: 'Joins the January ' + (year + 1) + ' Annual' }); return; }
    }
    const joinDate = plan.kind === 'joiner' ? plan.joinDate : '';
    const curKey = pdpLevelKey(lvl.level, lvl.track);
    // A new cycle's passed meetings are Skipped (N-446); an existing cycle only gains what is missing.
    const expected = pdpExpectedMeetings(plan, year, c ? '' : todayISO);

    if (!c) {
      out.cycles.push({
        personId: id, name, joiner: !!joinDate,
        fields: {
          PersonID: Number(id), PersonEmail: email, PersonName: name, CycleYear: year,
          Level: lvl.level, Track: lvl.track, LineManagerEmail: rev.lm, CSDEmail: rev.csd,
          JoinDate: joinDate, ScoringLevel: curKey, Status: 'Open',
          BiAnnualScored: pdpBiAnnualScored(joinDate, year) && !expected.some(e => e.MeetingType === 'BiAnnual' && e.Status === 'Skipped'),
        },
      });
    } else {
      const bi = mine.find(m => m.MeetingType === 'BiAnnual');
      if (!(bi && _PDPC_DONE.includes(bi.Status))) {
        const startKey = pdpParseLevelKey(c.Level + '-' + c.Track) ? pdpLevelKey(c.Level, c.Track) : curKey;
        const want = pdpScoringLevel(startKey, p, year);
        if (want !== String(c.ScoringLevel || '')) out.cycleUpdates.push({ id: String(c.id), personId: id, name, fields: { ScoringLevel: want }, why: 'Bi-Annual scores on ' + want + (c.ScoringLevel ? ' (was ' + c.ScoringLevel + ')' : '') });
      }
    }

    // A leaver-to-be (EndDate in the future): nothing is created after it; anything already there is skipped.
    if (c && end.cutoff) _pdpcSkipAfter(out, mine, end.cutoff, C.SKIP_REASONS.left, id, name);
    const have = new Map(mine.map(m => [String(m.Title), m]));
    expected.filter(e => !end.cutoff || e.DueDate <= end.cutoff).forEach(e => {
      const key = pdpMeetingKey(id, year, e.MeetingType, e.Period);
      const t = tpl[e.MeetingType];
      const ex = have.get(key);
      if (ex) {
        if (ex.Status === 'Planned' && t && Number(ex.TemplateVersion || 0) < Number(t.VersionNo)) {
          out.meetingUpdates.push({ id: String(ex.id), personId: id, name, fields: { TemplateID: Number(t.id), TemplateVersion: Number(t.VersionNo) }, why: pdpMeetingLabel(ex) + ' (' + pdpFmtDay(e.DueDate) + ') now uses template v' + t.VersionNo });
        }
        return;
      }
      if (e.Status === 'Planned' && !t) blocked.add(e.MeetingType);
      const fields = {
        PersonID: Number(id), PersonEmail: email, PersonName: name, CycleYear: year,
        MeetingType: e.MeetingType, IsJoiner: e.IsJoiner, Period: e.Period, DueDate: e.DueDate,
        Status: e.Status, SkipReason: e.SkipReason, LineManagerEmail: rev.lm, CSDEmail: rev.csd,
      };
      if (c) fields.CycleID = Number(c.id);
      if (e.Status === 'Planned' && t) { fields.TemplateID = Number(t.id); fields.TemplateVersion = Number(t.VersionNo); }
      out.meetings.push({ personId: id, name, key, newCycle: !c, fields });
    });

    // Year over and nothing left open: close the cycle.
    if (c && c.Status !== 'Closed' && todayISO > year + '-12-31' && mine.length
        && !out.meetings.some(m => m.personId === id) && mine.every(m => _PDPC_DONE.includes(m.Status) || m.Status === 'Skipped')) {
      out.cycleUpdates.push({ id: String(c.id), personId: id, name, fields: { Status: 'Closed' }, why: 'Cycle closed: the year has ended' });
    }
    person(c ? 'existing' : 'new', rev.lm, joinDate);
  });

  // Future starters the engine will pick up on a later run (Pilot: only if already in the pilot).
  const pilotSet = new Set(Array.isArray(o.pilot) ? pdpParsePilot(o.pilot.join(CONFIG.PDP.ACCESS.EMAIL_SEP)) : pdpParsePilot(o.pilot));
  people.forEach(p => {
    const id = String(p.id);
    if (scopeIds.has(id) || cycleByPerson.has(id)) return;
    const start = spDateIn(p.StartDate) || '';
    if (!start || start <= todayISO || start > year + '-12-31') return;
    if (!pdpInScope(p, new Date(utcDateOnly(start).getTime() + 12 * 3600 * 1000))) return;
    if (mode === CONFIG.PDP.MODES[1] && !pilotSet.has(_pdpEmail(p.WorkEmail))) return;
    out.waiting.push({ personId: id, name: _pdpName(p), reason: 'Starts ' + pdpFmtDay(start) });
  });

  out.blockedTemplates = [...blocked].map(t => ({ type: t, label: CONFIG.PDP.MEETING_LABELS[t] || t }));
  return finish();
}