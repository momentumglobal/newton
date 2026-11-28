// js/coe-plan-logic.js — CoE Hiring Plan: pure plan logic (N-555, AMCP-9)
// Moved out of coe-plan.js so the Hiring Plan page, the Report Builder export and
// Newton for Claude's hiring_plan / report_facts tools call ONE copy of the plan
// maths and cannot drift. No DOM, no Graph, no cache reads: declarations only.
// Loaded by reporting.html (before coe-plan.js), the test runner and CONFIG.MCP.scripts
// (after headcount.js: _isBlankId, headcountFillMap, coeHeadcountActualSpans, coeOpensByMonth).
// The seven functions moved verbatim: coeMonday, coeAddWeeks, coeWeekIndex,
// coeWeekVariance, computePlanSpans, coeSortRows, coeOpensModel. New in N-555:
// coePlanActuals (lifted from coeGanttHtml), coeHiresModel and coePlanPosition.

// N-089: this file's date model is deliberately LOCAL midnight throughout.
// coeMonday/coeAddWeeks/coeWeekIndex must NOT be migrated to spDateOut() or
// utcDateOnly() — a local-midnight BST Date read through UTC getters is the
// PREVIOUS day, which is exactly the N-081 bug (every Gantt cell rendered one
// week left of its header). The local model is safe only because every CoE
// date is written through isoDate() as 'T12:00:00Z': midday UTC carries ±11h
// of headroom, so the intended calendar day survives any realistic browser
// offset. N-136: ±11h, NOT ±12h — at exactly UTC+12 midday UTC is midnight the
// NEXT local day, so a local-getter read returns the following date. Real zones
// affected: Pacific/Auckland (+12 winter, +13 summer) and Pacific/Kiritimati
// (+14). coeFmtShort() is immune since N-136 (it pins its formatter to UTC);
// coeMonday()/coeWeekIndex() still share the limit and are deliberately NOT
// rebuilt on UTC — that is the rewrite N-089 considered and rejected, of the
// one code path N-077 and N-081 broke twice. Not a live concern at UK+0..+2.
// Note the ±12h figure on spMonthIn() in utils.js is a DIFFERENT quantity (the
// SITE's offset) and is correct — do not "fix" it to match this one. N-130 closed the last gap: CoEPlanForecast.ForecastMonth used to be
// written as a bare 'YYYY-MM-01' (SharePoint reinterpreted it in the site's
// timezone) and read back with local getters, which cancelled out only for
// browsers at or AHEAD of the site's offset. It now writes through isoDate()
// and reads through spMonthIn(), which is timezone-independent and still
// handles the legacy stored shapes — no rows were migrated.
function coeMonday(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function coeAddWeeks(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}
function coeWeekIndex(timelineStart, d) {
  // Math.round, not floor (N-081): coeMonday() returns LOCAL midnight, so
  // Mondays either side of a GMT/BST switch sit ±1h off exact-week
  // multiples — floor drops a week whenever tStart is GMT and d is BST.
  // Gaps are always whole weeks ±1h, so round is exact.
  return Math.round((coeMonday(d) - timelineStart) / (7 * 24 * 3600 * 1000));
}

// ── Week variance (N-317) ───────────────────────────────────────────
// Monday-week gap between a row's Planned Open Date and its linked
// headcount's actual OpenDate, actual − planned: negative = opened early
// (good), positive = late. Built on coeWeekIndex (Math.round, N-081) and this
// file's local-midnight model — never floor, never the UTC helpers (N-089).
// Not opened yet: once the planned week has passed, a RUNNING gap to today's
// week ({ final: false }); before that, null. Only call this when headcount
// was actually read (coeGanttHtml's hasActuals) — an unread headcount would
// otherwise read as "not open".
function coeWeekVariance(row, hc, today) {
  if (!row || !row.OpenDate) return null;
  const planned = coeMonday(row.OpenDate);
  if (hc && hc.OpenDate) return { weeks: coeWeekIndex(planned, hc.OpenDate), final: true };
  const late = coeWeekIndex(planned, today || new Date());
  return late > 0 ? { weeks: late, final: false } : null;
}

// ── Plan span computation ───────────────────────────────────────────
// Returns { rWeeks, nWeeks, oWeeks, start, targetHireDate, endDate }
// Target Hire Date is DERIVED: OpenDate + rWeeks (end of Recruitment).

function computePlanSpans(row) {
  const dflt = CONFIG.COE_PHASE_DEFAULTS;
  const rWeeks = row.RecruitmentWeeks || dflt.recruitmentWeeks;
  const nWeeks = (row.NoticeWeeks ?? null) !== null && row.NoticeWeeks !== undefined && row.NoticeWeeks !== '' ? Number(row.NoticeWeeks) : dflt.noticeWeeks;
  const oWeeks = (row.OnboardingWeeks ?? null) !== null && row.OnboardingWeeks !== undefined && row.OnboardingWeeks !== '' ? Number(row.OnboardingWeeks) : dflt.onboardingWeeks;
  const start = coeMonday(row.OpenDate);
  return {
    rWeeks, nWeeks, oWeeks, start,
    targetHireDate: coeAddWeeks(start, rWeeks),
    endDate: coeAddWeeks(start, rWeeks + nWeeks + oWeeks),
  };
}

// Shared row sort — used by the page and the Report Builder export
function coeSortRows(planRows) {
  return [...planRows].sort((a, b) =>
    (a.SortOrder || 0) - (b.SortOrder || 0) || new Date(a.OpenDate) - new Date(b.OpenDate));
}

// ── Planned vs Actual Role Opens model (N-317) ──────────────────────
// A plan row has OPENED when its linked headcount has an OpenDate — unlinked
// headcount is ignored — and the target is the plan row count. Aggregation and run
// rate are pure, in coeOpensByMonth() (headcount.js); this derives the day-string inputs.

function coeOpensModel(planRows, headcount, now = new Date()) {
  const hcById = Object.fromEntries((headcount || []).map(h => [String(h.id), h]));
  const plannedDays = planRows.map(r => spDateIn(r.OpenDate)).filter(Boolean);
  const actualDays = planRows.map(r => {
    if (_isBlankId(r.LinkedHeadcountID)) return null;
    const hc = hcById[String(r.LinkedHeadcountID)];
    return hc && hc.OpenDate ? spDateIn(hc.OpenDate) : null;
  }).filter(Boolean);
  // targetHireDate is a LOCAL-midnight Date (this file's model, N-089) —
  // localDayISO, never toISOString (a BST Monday would read as Sunday).
  const latestHire = new Date(Math.max(...planRows.map(r => computePlanSpans(r).targetHireDate)));
  return coeOpensByMonth({
    plannedDays, actualDays,
    target:           planRows.length,
    latestHireDay:    localDayISO(latestHire),
    todayDay:         localDayISO(now),
    finalNoOpenWeeks: CONFIG.COE_PHASE_DEFAULTS.finalNoOpenWeeks,
  });
}

// ── Linked actuals per plan row (N-312 / N-317; lifted from coeGanttHtml in N-555) ──
// One { hc, spans } per row: hc = the row's linked RoleHeadcount row (null when
// unlinked, or when headcount was not read), spans = coeHeadcountActualSpans() for it.
// `headcount` null (the read failed) → every row { hc: null, spans: null }.
// Keyed on String — SP item ids arrive as strings, the Number columns
// (LinkedHeadcountID, HeadcountID) as numbers.
function coePlanActuals(rows, headcount, placements, now = new Date()) {
  const hasActuals = Array.isArray(headcount);
  const hcById  = Object.fromEntries((hasActuals ? headcount : []).map(h => [String(h.id), h]));
  const fillMap = headcountFillMap(hasActuals ? placements : []);
  return rows.map(row => {
    const hc = hasActuals && !_isBlankId(row.LinkedHeadcountID)
      ? (hcById[String(row.LinkedHeadcountID)] || null) : null;
    return { hc, spans: hc ? coeHeadcountActualSpans(hc, fillMap.get(String(hc.id)), now) : null };
  });
}

// ── Planned vs actual hires (N-555, AMCP-F3) ─────────────────────────
// An actual hire is OFFER ACCEPTED: the earliest Placements.OfferAcceptedDate on the
// row's linked headcount (the Gantt's ✓), against the planned hire day (end of
// Recruitment). The same monthly model as the opens, so the two cannot drift:
// coeOpensByMonth with finalNoOpenWeeks 0 (the "no opens in the final weeks" rule is
// about opens, not hires). `positions` = coePlanPosition rows; result keys as
// coeOpensByMonth, where openedToDate reads as hires to date.
function coeHiresModel(positions, asOfDay) {
  const plannedDays = positions.map(p => p.plannedHireDay).filter(Boolean);
  return coeOpensByMonth({
    plannedDays,
    actualDays:       positions.map(p => p.hireConfirmedDay).filter(Boolean),
    target:           positions.length,
    latestHireDay:    plannedDays.slice().sort().pop() || null,
    todayDay:         asOfDay,
    finalNoOpenWeeks: 0,
  });
}

// ── Position as of a day (N-555) ─────────────────────────────────────
// The plan against reality on `asOfDay`: actuals dated after it have not happened yet,
// so a past day shows the plan as it then stood. Copies only — nothing passed in is changed.
//   - a headcount opened after asOfDay is treated as not opened (OpenDate cleared)
//   - a cancellation dated after asOfDay is not yet a cancellation
//   - a placement whose offer was accepted after asOfDay is dropped
// (a start date after asOfDay is cleared per row in coePlanRowPosition)
function coeTrimActualsAsOf(headcount, placements, asOfDay) {
  const after = v => !!v && spDateIn(v) > asOfDay;
  const hc = (headcount || []).map(h => {
    if (!h) return h;
    const c = Object.assign({}, h);
    if (after(c.OpenDate)) c.OpenDate = null;
    if (c.Status === CONFIG.HEADCOUNT.STATUS_CANCELLED && after(c.CancelledDate)) c.Status = CONFIG.HEADCOUNT.STATUS_OPEN;
    return c;
  });
  const pl = (placements || []).filter(p => !(p && after(p.OfferAcceptedDate)));
  return { headcount: hc, placements: pl };
}

// A Date → local 'YYYY-MM-DD', or null for an invalid Date. Plan dates are LOCAL-midnight
// Dates (N-089): localDayISO, never toISOString.
function _coeDay(d) {
  return d instanceof Date && !isNaN(d) ? localDayISO(d) : null;
}

function coePlanRowStatus(hasActuals, cancelled, startedDay, hireDay, openDay, variance) {
  if (!hasActuals) return null;
  if (cancelled) return 'cancelled';
  if (startedDay) return 'started';
  if (hireDay) return 'hired';
  if (openDay) return 'open';
  return variance && !variance.final ? 'late' : 'planned';
}

// One plan row against its trimmed actual ({ hc, spans } from coePlanActuals). Day strings only.
function coePlanRowPosition(row, actual, asOf, asOfDay, hasActuals) {
  const sp = computePlanSpans(row);
  const hc = actual.hc, s = actual.spans;
  const dayOf = v => (v ? spDateIn(v) : null);
  const openDay  = hc && hc.OpenDate ? dayOf(hc.OpenDate) : null;
  const hireDay  = s ? dayOf(s.nStart) : null;     // offer accepted: the hire (AMCP-F3)
  const startDay = s && s.oStart && dayOf(s.oStart) <= asOfDay ? dayOf(s.oStart) : null;
  const cancelled = !!hc && hc.Status === CONFIG.HEADCOUNT.STATUS_CANCELLED;
  const variance = hasActuals ? coeWeekVariance(row, hc, asOf) : null;   // only when headcount was read
  return {
    rowId: row.id,
    title: row.Title || null,
    talentPartner: row.TalentPartner || null,        // the stored value; the caller maps emails to names
    linkedHeadcountId: _isBlankId(row.LinkedHeadcountID) ? null : row.LinkedHeadcountID,
    linkedRoleId: _isBlankId(row.LinkedRoleID) ? null : row.LinkedRoleID,
    plannedOpenDay: dayOf(row.OpenDate),             // as entered; the Gantt aligns it to a Monday
    plannedHireDay: _coeDay(sp.targetHireDate),
    plannedStartDay: _coeDay(coeAddWeeks(sp.start, sp.rWeeks + sp.nWeeks)),
    plannedOnboardedDay: _coeDay(sp.endDate),
    actualOpenDay: openDay,
    hireConfirmedDay: hireDay,
    startedDay: startDay,
    openVariance: variance,                           // { weeks, final } as the Gantt: negative = opened early
    status: coePlanRowStatus(hasActuals, cancelled, startDay, hireDay, openDay, variance),
  };
}

// The whole plan against reality on asOf (a Date at local noon, so localDayISO returns the
// intended day). `headcount` null = the read failed: rows keep plan dates only, no status,
// opens and hires are null. A row with no Planned Open Date cannot sit on the timeline and is
// left out. Returns { asOfDay, hasActuals, rows, opens, hires }.
function coePlanPosition({ planRows = [], headcount = null, placements = [], asOf = new Date() } = {}) {
  const asOfDay = localDayISO(asOf);
  const rows = coeSortRows((planRows || []).filter(r => r && r.OpenDate));
  const hasActuals = Array.isArray(headcount);
  const trimmed = hasActuals ? coeTrimActualsAsOf(headcount, placements, asOfDay) : null;
  const actuals = coePlanActuals(rows, trimmed ? trimmed.headcount : null, trimmed ? trimmed.placements : [], asOf);
  const positions = rows.map((row, i) => coePlanRowPosition(row, actuals[i], asOf, asOfDay, hasActuals));
  return {
    asOfDay, hasActuals,
    rows: positions,
    opens: hasActuals && rows.length ? coeOpensModel(rows, trimmed.headcount, asOf) : null,
    hires: hasActuals && rows.length ? coeHiresModel(positions, asOfDay) : null,
  };
}
