// js/analytics.js — pure analytics functions, no network I/O
// Loaded after api.js, before module app scripts.

// ── Phase A — Time-to-Fill Prediction (N-269: survival-based) ────────
// Kaplan–Meier estimate of time from OpenDate to hire. N-309: the unit is the
// HEADCOUNT, not the role — filled headcount are events (getHistoricalPlacements
// rows); open headcount on pipelines in TTF_CENSORED_STAGES are right-censored
// at their current age; headcount on On-hold/Cancelled pipelines
// (CONFIG.TTF_SURVIVAL.closedStages) and cancelled headcount are right-censored
// where they stopped (ttfClosedCensorTimes). ttfHeadcountInputs builds both
// censored inputs; callers never assemble them by hand.
// Averaging completed hires alone ignores the slow roles that
// haven't filled yet and so under-states time to fill (survivorship bias) —
// counting open roles as "at least this long so far" removes that.
// Pool ladder: the filters as given (function × location), then — only when
// a country was given and it has < CONFIG.TTF_SURVIVAL.minEvents hires —
// the same function across all locations. Falsy functionArea/country means
// "no filter on that dimension" (Placement Analytics' "All" options).

// Stages whose roles are still open and so count as censored observations.
// Derived, not a second list. Backlog/Planning never started the clock;
// On-hold/Cancelled are censored too, but at the day they stopped being
// worked, not their current age — CONFIG.TTF_SURVIVAL.closedStages and
// ttfClosedCensorTimes (N-276, from N-272 D2); Closed (pre-N-306: Hired)
// roles are events (via `historical`), not censored.
// NOT ACTIVE_STAGES (which lists the closed/dormant stages). STAGE_ORDER, the
// old 4-stage subset isRoleFlagged used, was retired by N-274.
const TTF_CENSORED_STAGES = CONFIG.ROLE_STAGES.filter(s =>
  !CONFIG.ROLE_STAGES_ACTIVITY_EXCLUDED.includes(s) && s !== 'Planning'
);

// observations: [{ t: <int days >= 0>, event: <bool> }]
// → one step per distinct EVENT time, ascending: [{ t, atRisk, events, survival }].
// At-risk uses >=, so a censored observation sharing a time with an event is
// still at risk for that event (standard convention).
function kaplanMeier(observations) {
  const obs = (observations || []).filter(o => o && Number.isFinite(o.t) && o.t >= 0);
  const eventTimes = [...new Set(obs.filter(o => o.event).map(o => o.t))].sort((a, b) => a - b);
  let survival = 1;
  return eventTimes.map(t => {
    const atRisk = obs.filter(o => o.t >= t).length;
    const events = obs.filter(o => o.event && o.t === t).length;
    survival *= (1 - events / atRisk);
    return { t, atRisk, events, survival };
  });
}

// Smallest step t where survival <= 1 − p; null if the curve never gets there.
function kmQuantile(curve, p) {
  const step = (curve || []).find(s => s.survival <= 1 - p + 1e-12);
  return step ? step.t : null;
}

// N-276 (N-272 D2), re-based on headcount by N-309 (S-4). The day a pipeline
// left active work is the start of the TRAILING run of closed-stage rows in its
// Stage history, so On-hold → Cancelled stops the clock at the On-hold date.
// A pipeline is skipped — left out, exactly as under N-269 — when: it has no
// Stage rows; its latest row disagrees with role.Stage; the run began from a
// stage that never started the clock (creation row, Backlog, Planning); or the
// close day is older than closedLookbackDays. → 'YYYY-MM-DD' or null.
function _ttfPipelineCloseDay(role, rows, cutoffDay) {
  const closed = CONFIG.TTF_SURVIVAL.closedStages;
  const sorted = (rows || []).slice().sort((a, b) => new Date(a.ChangedAt) - new Date(b.ChangedAt));
  if (!sorted.length || sorted[sorted.length - 1].NewValue !== normaliseRoleStage(role.Stage)) return null;
  let start = sorted.length - 1;
  while (start > 0 && closed.includes(sorted[start - 1].NewValue)) start--;
  const first = sorted[start];
  // Falsy check, never === '' — a creation row's OldValue reads back null (N-100).
  if (!first.OldValue || !TTF_CENSORED_STAGES.includes(first.OldValue)) return null;
  // ChangedAt is an instant, OpenDate a day marker: take the local day
  // first, never raw milliseconds (N-100 diff-4).
  const closeDay = localDayISO(new Date(first.ChangedAt));
  if (!closeDay || closeDay < cutoffDay) return null;
  return closeDay;
}

// Censored observations for headcount that stopped without a fill (N-309 S-4).
// Filled headcount are never here (they are events, or outside the window).
//   A — pipeline On-hold/Cancelled with a known close day: each open OR
//       cancelled headcount with an OpenDate, censored at the close day — or
//       at its CancelledDate when that is earlier (the D-1 cascade stamps the
//       later cancel day; the clock stopped at the On-hold date). A skipped
//       pipeline skips all its headcount.
//   B — any other pipeline stage: each cancelled headcount with OpenDate +
//       CancelledDate, censored at CancelledDate.
// Open headcount on TTF_CENSORED_STAGES pipelines are NOT here — they are
// censored at their current age through computeTTFPrediction's 4th argument.
// End day older than closedLookbackDays, or t < 0 → left out.
// stageRows: RoleHistory Stage rows (getRoleStageHistory). fillMap:
// headcountFillMap(ALL placements). Build once per page load
// (ttfHeadcountInputs).
// → [{ roleId, headcountId, Department, Location, Stage, t }]
function ttfClosedCensorTimes(roles, stageRows, headcount, fillMap, today = new Date()) {
  const cfg    = CONFIG.TTF_SURVIVAL;
  const closed = cfg.closedStages;
  const cutoff = new Date(today.getTime());
  cutoff.setDate(cutoff.getDate() - cfg.closedLookbackDays);
  const cutoffDay = localDayISO(cutoff);
  const byRole = {};
  (stageRows || []).forEach(h => {
    if (h.Field && h.Field !== 'Stage') return;
    const k = String(h.RoleIDLookupId);
    (byRole[k] = byRole[k] || []).push(h);
  });
  const hcByRole = groupHeadcountByRole(headcount);
  const out = [];
  (roles || []).forEach(role => {
    if (!role) return;
    const rows = hcByRole.get(String(role.id));
    if (!rows || !rows.length) return;
    const stage    = normaliseRoleStage(role.Stage);
    const isClosed = closed.includes(stage);
    const closeDay = isClosed ? _ttfPipelineCloseDay(role, byRole[String(role.id)], cutoffDay) : null;
    if (isClosed && !closeDay) return;
    rows.forEach(hc => {
      const kind = classifyHeadcount(hc, fillMap);
      if (kind === 'filled' || !hc.OpenDate) return;
      const cancelledDay = kind === 'cancelled' && hc.CancelledDate ? spDateIn(hc.CancelledDate) : null;
      let endDay;
      if (isClosed) {
        endDay = cancelledDay && cancelledDay < closeDay ? cancelledDay : closeDay;
      } else {
        if (!cancelledDay) return;
        endDay = cancelledDay;
      }
      if (!endDay || endDay < cutoffDay) return;
      const t = daysOpen(hc.OpenDate, endDay);
      if (t === null || t < 0) return;
      out.push({ roleId: String(role.id), headcountId: String(hc.id), Department: role.Department, Location: role.Location, Stage: stage, t });
    });
  });
  return out;
}

// N-309 (S-3): both censored inputs for computeTTFPrediction, from one place.
//   openHeadcount  — every OPEN headcount whose role is in `roles`, role-shaped
//                    for computeTTFPrediction's 4th argument: Stage = the
//                    pipeline's stage, OpenDate = the headcount's. That
//                    function keeps only TTF_CENSORED_STAGES and drops undated
//                    rows (clock never started).
//   closedCensored — ttfClosedCensorTimes(), its 5th argument.
// `placements` = ALL placements (getPlacements(null) or
// getPlacementHeadcountIds()), never the 12-month window — a headcount filled
// 13 months ago must not read as open.
function ttfHeadcountInputs({ roles, headcount, placements, stageRows, today = new Date() } = {}) {
  const fill     = headcountFillMap(placements);
  const roleById = new Map((roles || []).filter(Boolean).map(r => [String(r.id), r]));
  const openHeadcount = [];
  (headcount || []).forEach(hc => {
    if (!hc || classifyHeadcount(hc, fill) !== 'open') return;
    const role = roleById.get(String(hc.RoleID));
    if (!role) return;
    openHeadcount.push({
      id: hc.id, roleId: role.id, Stage: normaliseRoleStage(role.Stage),
      Department: role.Department, Location: role.Location, OpenDate: hc.OpenDate || null,
    });
  });
  return { openHeadcount, closedCensored: ttfClosedCensorTimes(roles, stageRows, headcount, fill, today) };
}

// openRoles: open HEADCOUNT rows, role-shaped (ttfHeadcountInputs().openHeadcount,
// N-309). closedCensored: ttfHeadcountInputs().closedCensored.
function computeTTFPrediction(functionArea, country, historical, openRoles = [], closedCensored = []) {
  const cfg = CONFIG.TTF_SURVIVAL;

  const poolFor = (fn, loc) => {
    const events = (historical || [])
      .filter(r => (!fn || r.functionArea === fn) && (!loc || r.country === loc))
      .map(r => daysOpen(r.openDate, r.placementDate))
      .filter(t => t !== null && t >= 0)
      .map(t => ({ t, event: true }));
    const censored = (openRoles || [])
      .filter(r => TTF_CENSORED_STAGES.includes(r.Stage))
      .filter(r => (!fn || r.Department === fn) && (!loc || r.Location === loc))
      .map(r => daysOpen(r.OpenDate))
      .filter(t => t !== null && t >= 0)
      .map(t => ({ t, event: false }));
    // N-276: On-hold/Cancelled, censored at the day they left active work.
    const closed = (closedCensored || [])
      .filter(r => (!fn || r.Department === fn) && (!loc || r.Location === loc))
      .filter(r => Number.isFinite(r.t) && r.t >= 0)
      .map(r => ({ t: r.t, event: false }));
    const basis = fn && loc ? 'function+location' : fn ? 'function' : loc ? 'location' : 'all';
    return {
      obs: events.concat(censored, closed), events: events.length,
      censored: censored.length + closed.length, closed: closed.length, basis,
    };
  };

  const level1 = poolFor(functionArea, country);
  let pool = null, pooled = false;
  if (level1.events >= cfg.minEvents) {
    pool = level1;
  } else if (country) {
    const level2 = poolFor(functionArea, null);
    if (level2.events >= cfg.minEvents) { pool = level2; pooled = true; }
  }

  if (!pool) {
    return {
      label: 'Insufficient data', weeks: null, stdDevWeeks: null, sampleSize: level1.events,
      medianDays: null, bandDays: null, events: level1.events, censored: level1.censored,
      closed: level1.closed, basis: null, pooled: false, medianReached: false, maxObservedDays: null,
    };
  }

  const curve           = kaplanMeier(pool.obs);
  const medianDays      = kmQuantile(curve, 0.5);
  const maxObservedDays = Math.max(...pool.obs.map(o => o.t));
  const base = {
    sampleSize: pool.events, events: pool.events, censored: pool.censored,
    closed: pool.closed, basis: pool.basis, pooled, maxObservedDays,
  };

  if (medianDays === null) {
    // Fewer than half the pool has filled so far — a real result, not an error.
    return {
      label: `>${Math.round(maxObservedDays / 7)}w`, weeks: null, stdDevWeeks: null,
      medianDays: null, bandDays: null, medianReached: false, ...base,
    };
  }

  const q25 = kmQuantile(curve, 0.25);
  const q75 = kmQuantile(curve, 0.75);
  const bandDays = Math.max(
    q75 !== null ? (q75 - q25) / 2 : (medianDays - q25),
    cfg.minBandDays
  );
  const weeks       = Math.round(medianDays / 7);
  // Key name kept for return-shape compatibility — now a half-IQR band, not an SD.
  const stdDevWeeks = Math.round(bandDays / 7);

  return {
    label: `~${weeks}w ±${stdDevWeeks}w`, weeks, stdDevWeeks,
    medianDays, bandDays, medianReached: true, ...base,
  };
}

// ── Phase B — Funnel Drop-off Analysis ───────────────────────────────

function computeRoleFunnel(totals, benchmarks) {
  const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : null;
  const rag = (actual, bench) => {
    if (actual === null) return 'grey';
    if (actual >= bench * 100)                             return 'green';
    if (actual >= bench * 100 * benchmarks.flagThreshold)  return 'amber';
    return 'red';
  };
  return [
    { stage: 'Response',     conv: pct(totals.Responses, totals.Outreach),  benchmarked: true, rag: rag(pct(totals.Responses, totals.Outreach),  benchmarks.outreachConversion) },
    { stage: 'IV1 Conv.',    conv: pct(totals.Interview1, totals.Submitted), benchmarked: true, rag: rag(pct(totals.Interview1, totals.Submitted), benchmarks.submissionConversion) },
    { stage: 'IV→Offer',     conv: pct(totals.Offers, totals.Interview1),   benchmarked: true, rag: rag(pct(totals.Offers, totals.Interview1),   benchmarks.interviewToOffer) },
    { stage: 'Offer Success',conv: pct(totals.Hires, totals.Offers),        benchmarked: true, rag: rag(pct(totals.Hires, totals.Offers),        benchmarks.offerSuccess) },
  ];
}

// ── Phase C — People Scorecards ───────────────────────────────────────

// N-309 (S-6): mean time to hire in days over getHistoricalPlacements() rows —
// daysOpen(openDate, placementDate), the same day count TTF uses (BST-safe,
// no raw ms). Rows missing either date (a not-opened headcount) are skipped;
// negative values dropped, as TTF does. Unrounded; null when nothing counts.
// The one copy — Scorecards, Placement Analytics (summary + breakdown) and
// mobile analytics all call it.
function avgTimeToHireDays(rows) {
  const vals = (rows || [])
    .filter(r => r && r.openDate && r.placementDate)
    .map(r => daysOpen(r.openDate, r.placementDate))
    .filter(t => t !== null && t >= 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ── Dashboard hire KPIs (N-310 / HC-4b) ──────────────────────────────
// Rows are hireRowsWithTargets() (headcount.js): one per placement, i.e. per
// filled headcount. All maths on local days (spDateIn), never ms.

// S-3: % of hires whose Offer Accepted day is on or before their headcount
// TargetHireDate. Hires with no target are excluded; null when none count.
function hiredOnTimePct(rows) {
  const dated = (rows || []).filter(r => r && r.targetDate && r.placementDate &&
    spDateIn(r.targetDate) && spDateIn(r.placementDate));
  if (!dated.length) return null;
  const onTime = dated.filter(r => spDateIn(r.placementDate) <= spDateIn(r.targetDate)).length;
  return Math.round(onTime / dated.length * 100);
}

// S-4 / S-5: hire KPIs for the hires whose Offer Accepted day falls in
// [fromDay, toDay] ('YYYY-MM-DD', inclusive). count includes not-opened
// headcount (a hire is a hire); avgDays excludes them (D-5).
function hireKpis(rows, fromDay, toDay) {
  const inRange = (rows || []).filter(r => {
    const d = r && r.placementDate ? spDateIn(r.placementDate) : null;
    return !!d && d >= fromDay && d <= toDay;
  });
  const avg = avgTimeToHireDays(inRange);
  return {
    count:     inRange.length,
    avgDays:   avg === null ? null : Math.round(avg),
    onTimePct: hiredOnTimePct(inRange),
  };
}

// S-6 / N-309 S-8: mean days open over OPEN, dated headcount on the given
// (already open) pipelines — the one rule for the Project KPI "Avg Days Open"
// and Snapshots AvgDaysOpen. headcount null → legacy mean over Roles.OpenDate.
function avgOpenHeadcountDays(openRoles, headcount, fillMap) {
  let openDates;
  if (headcount) {
        openDates = openDatedHeadcount(openRoles, headcount, fillMap).map(hc => hc.OpenDate);
  } else {
    openDates = (openRoles || []).filter(r => r.OpenDate).map(r => r.OpenDate);
  }
  return openDates.length
    ? Math.round(openDates.reduce((s, d) => s + daysOpen(d), 0) / openDates.length)
    : null;
}

// N-311 (S-2): the open, DATED headcount rows on the given (already open)
// pipelines — unfilled, not cancelled, with an Open Date. A headcount with no
// Open Date is planned, not active. The one row set behind both the Avg Days
// Open tile (avgOpenHeadcountDays) and the Open Headcount tile
// (openHeadcountCount), so the two cannot drift. Not the "x" of x/y (D-5),
// which counts undated headcount as open.
function openDatedHeadcount(openRoles, headcount, fillMap) {
  const openIds = new Set((openRoles || []).map(r => String(r.id)));
  return (headcount || []).filter(hc => hc && hc.OpenDate && openIds.has(String(hc.RoleID)) &&
    classifyHeadcount(hc, fillMap) === 'open');
}

// N-311 (S-2): "Open Headcount" KPI. null (headcount read failed) → the tile
// shows "—"; [] → 0.
function openHeadcountCount(openRoles, headcount, fillMap) {
  if (headcount === null || headcount === undefined) return null;
  return openDatedHeadcount(openRoles, headcount, fillMap).length;
}

// S-8: Actual Spend vs Budget, paired per placement. Each placement whose
// role has Budget > 0 AND whose SalaryAgreed > 0 adds the per-head budget
// (D-4) and its salary, in the role's currency; anything else is left out of
// BOTH sides and counted in `excluded`. rows in first-appearance order.
function budgetVsSpendByCurrency(roles, placements) {
  const roleById = new Map((roles || []).filter(Boolean).map(r => [String(r.id), r]));
  const byCcy = new Map();
  let excluded = 0;
  (placements || []).forEach(p => {
    if (!p) return;
    const rid    = (p.RoleIDLookupId === null || p.RoleIDLookupId === undefined || p.RoleIDLookupId === '') ? p.RoleID : p.RoleIDLookupId;
    const role   = roleById.get(String(rid));
    const budget = role ? parseFloat(role.Budget) || 0 : 0;
    const salary = parseFloat(p.SalaryAgreed) || 0;
    if (!(budget > 0) || !(salary > 0)) { excluded++; return; }
    const ccy = CONFIG.COUNTRY_CURRENCY[role.Location] || 'GBP';
    if (!byCcy.has(ccy)) byCcy.set(ccy, { ccy, budget: 0, spend: 0, hires: 0 });
    const row = byCcy.get(ccy);
    row.budget += budget; row.spend += salary; row.hires++;
  });
  return { rows: Array.from(byCcy.values()), excluded };
}

function computeVelocityScore(tpEmail, activity, placements, benchmarks) {
  return {
    tpEmail,
    window: '13 weeks',
    metrics: computeFunnelScorecard(activity, placements, benchmarks),
  };
}

// N-336: the scorecard metric rows for any owner — a TP (computeVelocityScore,
// People Scorecards) or a project (buildProjectScorecards, Command Centre).
// `activity` = WeeklyActivity rows already cut to the window; `placements` =
// getHistoricalPlacements() rows already cut to the window.
function computeFunnelScorecard(activity, placements, benchmarks) {
  const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : null;
  const rag = (actual, bench, invert = false) => {
    if (actual === null) return 'grey';
    if (!invert) {
      if (actual >= bench * 100)                              return 'green';
      if (actual >= bench * 100 * benchmarks.flagThreshold)  return 'amber';
      return 'red';
    } else {
      if (actual <= bench)                                    return 'green';
      if (actual <= bench / benchmarks.flagThreshold)        return 'amber';
      return 'red';
    }
  };

  const out  = sumField(activity, 'Outreach');
  const resp = sumField(activity, 'Responses');
  const sub  = sumField(activity, 'Submitted');
  const iv1  = sumField(activity, 'Interview1');
  const off  = sumField(activity, 'Offers');
  // N-342: `hir` (Weekly Activity, self-reported) feeds Offer success ONLY —
  // the same rule as the dashboards since N-310. The Hires row below counts
  // placements, so it agrees with the Placements table.
  const hir  = sumField(activity, 'Hires');

  // N-309: one row per filled headcount — a TP's own fills (D-7), or (N-336)
  // the fills on a project's pipelines. N-342: the Hires row is that row count.
  const hires   = (placements || []).length;
  const avgDays = avgTimeToHireDays(placements);
  const avgTTF  = avgDays === null ? null : Math.round(avgDays);

  return [
      { label: 'Outreach conversion',   value: pct(resp, out), unit: '%',     rag: rag(pct(resp, out),  benchmarks.outreachConversion) },
      { label: 'Submission conversion', value: pct(iv1, sub),  unit: '%',     rag: rag(pct(iv1, sub),   benchmarks.submissionConversion) },
      { label: 'Interview-to-offer',    value: iv1 > 0 && off > 0 ? +(iv1 / off).toFixed(1) : null, unit: ':1', rag: iv1 > 0 && off > 0 ? (iv1 / off <= 7 ? 'green' : iv1 / off <= 10 ? 'amber' : 'red') : 'grey' },
      { label: 'Offer success',         value: pct(hir, off),  unit: '%',     rag: rag(pct(hir, off),   benchmarks.offerSuccess) },
      { label: 'Hires',                 value: hires,          unit: 'hires', rag: 'grey', informational: true },
      { label: 'Avg time to hire',      value: avgTTF,         unit: 'days',  rag: rag(avgTTF,          benchmarks.timeToHireDays, true) },
  ];
}

// ── Phase D — Learned funnel benchmarks (N-270) ───────────────────────
// Beta-binomial conversion rates learned from WeeklyActivity. Each level's
// rate is shrunk toward its parent's with
// CONFIG.LEARNED_BENCHMARKS.priorStrength pseudo-trials:
//   company → function → function × location (or location alone)
// and the company level shrinks toward CONFIG.ANALYTICS_BENCHMARKS (the
// prior). The result never drops below target × floorFraction, so a market
// that is weak everywhere still reads red. `opts.exclude` removes whatever
// is being judged from EVERY level (leave-self-out) — a role group is never
// benchmarked against itself. Returns an ANALYTICS_BENCHMARKS-shaped object
// plus `meta`, so it drops into computeRoleFunnel / computeVelocityScore
// unchanged. Weekly counts are not cohorts, so each observation's numerator
// is clamped to its denominator (N-271 flags those rows; here they're only
// kept from pushing a rate past 1).

// ORDER MUST MATCH computeRoleFunnel's stages — it keeps its own inline
// mapping (its tests deep-equal the full return). Asserted in tests.
const LEARNED_RATES = [
  { key: 'outreachConversion',   num: 'Responses',  den: 'Outreach'   },
  { key: 'submissionConversion', num: 'Interview1', den: 'Submitted'  },
  { key: 'interviewToOffer',     num: 'Offers',     den: 'Interview1' },
  { key: 'offerSuccess',         num: 'Hires',      den: 'Offers'     },
];
// Scorecard metric label → benchmark key. Only the rows computeVelocityScore
// judges against a benchmark; Interview-to-offer uses its own fixed ratio.
const SCORECARD_BENCHMARK_KEYS = {
  'Outreach conversion':   'outreachConversion',
  'Submission conversion': 'submissionConversion',
  'Offer success':         'offerSuccess',
};
const _FUNNEL_COUNT_FIELDS = ['Outreach', 'Responses', 'Submitted', 'Interview1', 'Offers', 'Hires'];

// Map String(id) → { fn, loc }. Adapts the two role shapes:
// getAllRoles() ('Department', 'Location') and getHistoricalPlacements()
// ('functionArea', 'country' — one row per fill, keyed by PIPELINE id, so a
// pipeline with several fills is one entry; N-309). The roles passed ARE the
// learning population.
function funnelRoleIndex(roles, fnKey, locKey) {
  const index = new Map();
  (roles || []).forEach(r => {
    if (r && r.id != null) index.set(String(r.id), { fn: r[fnKey] || '', loc: r[locKey] || '' });
  });
  return index;
}

// N-277 (N-272 D4): learning population for Placement Analytics =
// `historical` (getHistoricalPlacements(), shape functionArea/country) plus
// every role in CONFIG.FUNNEL_LEARNING_EXTRA_STAGES (Cancelled) from
// `allRoles` (shape Department/Location). N-309 (D-8): `historical` is now
// every pipeline with ≥1 fill in the window, still-open ones included — so a
// partly-filled pipeline's activity is learning too. A cancelled role's
// completed stage progress is valid learning — cancellation is the client's
// decision. Pipelines with no fill that are open/Backlog/On-hold are NOT
// added (unfinished funnels would bias benchmarks green). The roles being
// JUDGED on the page are the `historical` ones; only this index widens. A
// historical entry wins on a duplicate id.
function funnelLearningIndex(historical, allRoles) {
  const index = funnelRoleIndex(historical, 'functionArea', 'country');
  (allRoles || []).forEach(r => {
    if (!r || r.id == null) return;
    if (!CONFIG.FUNNEL_LEARNING_EXTRA_STAGES.includes(r.Stage)) return;
    const id = String(r.id);
    if (!index.has(id)) index.set(id, { fn: r.Department || '', loc: r.Location || '' });
  });
  return index;
}

// WeeklyActivity rows → one observation per (role, TP), counts summed.
// Rows whose role isn't in roleIndex are dropped.
function buildFunnelObservations(activity, roleIndex) {
  const byKey = new Map();
  (activity || []).forEach(a => {
    const roleId = String(a.RoleIDLookupId || a.RoleID || '');
    const role   = roleIndex.get(roleId);
    if (!role) return;
    const tp  = a.TalentPartner || '';
    const key = roleId + '|' + tp;
    let o = byKey.get(key);
    if (!o) {
      o = { roleId, tp, fn: role.fn, loc: role.loc, c: {} };
      _FUNNEL_COUNT_FIELDS.forEach(f => { o.c[f] = 0; });
      byKey.set(key, o);
    }
    _FUNNEL_COUNT_FIELDS.forEach(f => { o.c[f] += Math.max(Number(a[f]) || 0, 0); });
  });
  return [...byKey.values()];
}

// Falsy fn / loc = no filter on that dimension (as computeTTFPrediction).
function learnFunnelBenchmarks(obs, fn, loc, opts = {}) {
  const prior   = opts.prior   || CONFIG.ANALYTICS_BENCHMARKS;
  const cfg     = opts.cfg     || CONFIG.LEARNED_BENCHMARKS;
  const exclude = opts.exclude || (() => false);
  const pool    = (obs || []).filter(o => !exclude(o));

  const levels = [{ basis: 'all', match: () => true }];
  if (fn)  levels.push({ basis: 'function', match: o => o.fn === fn });
  if (loc) levels.push(fn
    ? { basis: 'function+location', match: o => o.fn === fn && o.loc === loc }
    : { basis: 'location',          match: o => o.loc === loc });

  const out = { ...prior, meta: {} };
  LEARNED_RATES.forEach(({ key, num, den }) => {
    const mu0   = prior[key];
    const kappa = cfg.priorStrength[key];
    let mu = mu0, n = 0;
    levels.forEach(level => {
      let k = 0;
      n = 0;
      pool.forEach(o => {
        if (!level.match(o)) return;
        k += Math.min(o.c[num], o.c[den]);
        n += o.c[den];
      });
      mu = (k + kappa * mu) / (n + kappa);  // empty level → parent's rate
    });
    const floor   = mu0 * cfg.floorFraction;
    const floored = mu < floor;
    const value   = floored ? floor : mu;
    out[key] = value;
    out.meta[key] = {
      value, prior: mu0, n, basis: levels[levels.length - 1].basis,
      floored, fn: fn || null, loc: loc || null,
    };
  });
  return out;
}

// Scorecards: a TP works across several function × location cells. Each
// rate's benchmark is the average of the cells' learned rates, weighted by
// the TP's own denominator for that rate in each cell (weightObs = the TP's
// observations). No volume on a rate → the company-level learned rate.
function learnFunnelBenchmarksMix(obs, weightObs, opts = {}) {
  const prior = opts.prior || CONFIG.ANALYTICS_BENCHMARKS;
  const cells = new Map();
  (weightObs || []).forEach(w => {
    const key = w.fn + '|' + w.loc;
    let cell = cells.get(key);
    if (!cell) {
      cell = { fn: w.fn, loc: w.loc, w: {} };
      LEARNED_RATES.forEach(r => { cell.w[r.key] = 0; });
      cells.set(key, cell);
    }
    LEARNED_RATES.forEach(r => { cell.w[r.key] += w.c[r.den]; });
  });
  const learned = [...cells.values()].map(cell => ({
    ...cell, b: learnFunnelBenchmarks(obs, cell.fn || null, cell.loc || null, opts),
  }));

  let company = null;
  const out = { ...prior, meta: {} };
  LEARNED_RATES.forEach(({ key }) => {
    const used   = learned.filter(c => c.w[key] > 0);
    const totalW = used.reduce((s, c) => s + c.w[key], 0);
    if (!totalW) {
      company = company || learnFunnelBenchmarks(obs, null, null, opts);
      out[key] = company[key];
      out.meta[key] = { ...company.meta[key] };
      return;
    }
    const value = used.reduce((s, c) => s + c.w[key] * c.b[key], 0) / totalW;
    out[key] = value;
    out.meta[key] = {
      value, prior: prior[key], n: used.reduce((s, c) => s + c.b.meta[key].n, 0),
      basis: 'mix', cells: used.length, floored: used.every(c => c.b.meta[key].floored),
      fn: null, loc: null,
    };
  });
  return out;
}

// Plain-text tooltip — callers escape it for title="". A benchmarks object
// without `meta` (plain CONFIG) reads as the company target. `mixOwner`
// (N-336) names whose mix a 'mix' benchmark is weighted by.
function learnedBenchmarkTip(benchmarks, key, mixOwner = 'this TP works in') {
  const pctText = x => `${Math.round(x * 100)}%`;
  const b = benchmarks || {};
  const m = b.meta && b.meta[key];
  if (!m) return `Benchmark ${pctText(b[key])} · company target`;
  const nText  = Number(m.n).toLocaleString('en-GB');
  const target = `${pctText(m.prior)} target`;
  let tip;
  if (m.basis === 'mix') {
    tip = `Benchmark ${pctText(m.value)} · weighted across ${m.cells} function × location mix${m.cells !== 1 ? 'es' : ''} ${mixOwner} (${m.n > 0 ? `n=${nText}` : 'no direct peers yet'})`;
  } else {
    const where = m.basis === 'function+location' ? `${m.fn} × ${m.loc}`
      : m.basis === 'function' ? m.fn
      : m.basis === 'location' ? m.loc
      : 'company-wide';
    tip = m.n > 0
      ? `Benchmark ${pctText(m.value)} · learned from ${where} peers (n=${nText}), shrunk toward ${target}`
      : `Benchmark ${pctText(m.value)} · no ${where} peers yet, so taken from the wider pool, shrunk toward ${target}`;
  }
  if (m.floored) tip += ` · floored at ${pctText(m.value)} (${pctText(m.value / m.prior)} of ${target})`;
  return tip;
}

// N-336: scorecard metric rows + `tip` (learned-benchmark tooltip, plain text)
// on the rows judged against a learned benchmark. New objects; inputs never
// mutated. No `bench` → rows copied without tips.
function scorecardMetricTips(metrics, bench, mixOwner) {
  return (metrics || []).map(m => {
    const key = bench && SCORECARD_BENCHMARK_KEYS[m.label];
    return key ? { ...m, tip: learnedBenchmarkTip(bench, key, mixOwner) } : { ...m };
  });
}

// ── WeeklyActivity anomalies (N-271 / DS-3) ──────────────────────────
// Pure detection for Admin > Data Health. Three checks over WeeklyActivity —
// impossible funnels, open roles with no recent activity, and spikes against a
// TP's own median. Read-only: nothing here writes or corrects a row. Thresholds
// are all CONFIG.WEEKLY_ANOMALIES, injectable as the trailing `cfg` for tests.

// WeekEndingDate → { week, offSunday }. `week` is the Sunday on/after the
// stored day (a non-Sunday row is bucketed forward, as getWeekEnding() does);
// null when the row has no usable date. spDateIn, never a Date (F-12).
function _anomalyWeekKey(a) {
  const day = a && a.WeekEndingDate ? spDateIn(a.WeekEndingDate) : null;
  const week = day ? sundayOnOrAfterISO(day) : null;
  return week ? { week, offSunday: week !== day } : null;
}

// Same role-key resolution as buildFunnelObservations.
function _anomalyRoleKey(a) {
  return String((a && (a.RoleIDLookupId || a.RoleID)) || '');
}

// The most recent week-ending Sunday that is fully in the past. The current
// week is never judged: Wed 30 Sep 2026 → 27 Sep; Sun 4 Oct 2026 → 27 Sep.
function _anomalyLastComplete(today) {
  return addDaysISO(getWeekEnding(today), -7);
}

// Cumulative per role, any stage: later total > earlier total (strict) for a
// configured pair. → [{ roleId, roleTitle, stage, tp, breaches:
// [{ later, earlier, laterTotal, earlierTotal }] }], biggest excess first.
function findImpossibleFunnels(roles, activity, cfg = CONFIG.WEEKLY_ANOMALIES) {
  const byRole = new Map((roles || []).map(r => [String(r.id), r]));
  const fields = [...new Set(cfg.funnelPairs.flatMap(p => [p.later, p.earlier]))];
  const totals = {};
  (activity || []).forEach(a => {
    const k = _anomalyRoleKey(a);
    if (!byRole.has(k)) return;
    const t = totals[k] || (totals[k] = {});
    fields.forEach(f => { t[f] = (t[f] || 0) + (Number(a[f]) || 0); });
  });
  const out = [];
  Object.keys(totals).forEach(k => {
    const t = totals[k];
    const breaches = cfg.funnelPairs
      .filter(p => t[p.later] > t[p.earlier])
      .map(p => ({ later: p.later, earlier: p.earlier, laterTotal: t[p.later], earlierTotal: t[p.earlier] }));
    if (!breaches.length) return;
    const r = byRole.get(k);
    out.push({ roleId: k, roleTitle: r.RoleTitle || '', stage: r.Stage || '', tp: r.TalentPartner || '', breaches });
  });
  const excess = e => Math.max(...e.breaches.map(b => b.laterTotal - b.earlierTotal));
  return out.sort((a, b) => excess(b) - excess(a) || a.roleTitle.localeCompare(b.roleTitle));
}

// Open roles (TTF_CENSORED_STAGES — open and expected to log activity) with no
// dated WeeklyActivity row in the current (in-progress) week or the previous
// cfg.noActivity.recentWeeks - 1 weeks: 2 = this week + last week. A role is
// judged only once it has been open for the whole window (firstFull <=
// recentFrom; with 2 weeks that is one full week after it opened). Any row is
// an entry — TP, stage and values are irrelevant, an all-zero row counts — but
// an undated row cannot be placed in a week, so it does not.
// → [{ roleId, roleTitle, stage, tp, lastEntryWeek }] (null = no dated row at
// all), oldest last entry first, null first.
function findRolesWithNoActivity(roles, activity, today = new Date(), cfg = CONFIG.WEEKLY_ANOMALIES) {
  const currentWeek = addDaysISO(_anomalyLastComplete(today), 7);
  const recentFrom = addDaysISO(currentWeek, -7 * (cfg.noActivity.recentWeeks - 1));
  const lastEntry = {};
  (activity || []).forEach(a => {
    const w = _anomalyWeekKey(a);
    if (!w) return;
    const k = _anomalyRoleKey(a);
    if (!lastEntry[k] || w.week > lastEntry[k]) lastEntry[k] = w.week;
  });
  const out = [];
  (roles || []).forEach(r => {
    if (!TTF_CENSORED_STAGES.includes(r.Stage)) return;
    const openSunday = r.OpenDate ? sundayOnOrAfterISO(spDateIn(r.OpenDate) || '') : null;
    if (!openSunday || addDaysISO(openSunday, 7) > recentFrom) return;
    const last = lastEntry[String(r.id)] || null;
    if (last && last >= recentFrom) return;
    out.push({ roleId: String(r.id), roleTitle: r.RoleTitle || '', stage: r.Stage || '', tp: r.TalentPartner || '', lastEntryWeek: last });
  });
  return out.sort((a, b) =>
    String(a.lastEntryWeek || '').localeCompare(String(b.lastEntryWeek || ''))
    || a.roleTitle.localeCompare(b.roleTitle));
}

// False when there are rows but none carries a role key — the signature of a
// projected (e.g. id-only) fetch. Such a result must fail the check loudly and
// not be read as "no anomalies" (N-271: the delta store once handed back
// id-only rows and every table came out empty).
function weeklyActivityRowsUsable(activity) {
  const rows = activity || [];
  return !rows.length || rows.some(a => _anomalyRoleKey(a) !== '');
}

// Per TP per week, summed across all their roles: a field whose value is
// > multiplier x the median of the TP's previous baselineWeeks calendar weeks
// that have rows (at least minBaselineWeeks of them) and >= minValue. Only the
// last reportWeeks completed weeks are reported. → [{ tp, weekEnding, field,
// value, median, baselineWeeks }], newest week first.
function findActivitySpikes(activity, today = new Date(), cfg = CONFIG.WEEKLY_ANOMALIES) {
  const S = cfg.spikes;
  const lastComplete = _anomalyLastComplete(today);
  const reportFrom = addDaysISO(lastComplete, -7 * (S.reportWeeks - 1));
  const tpWeek = {};
  (activity || []).forEach(a => {
    const w = _anomalyWeekKey(a);
    const tp = tpList(a && a.TalentPartner).join(';');
    if (!w || !tp) return;
    const wk = (tpWeek[tp] || (tpWeek[tp] = {}))[w.week] || (tpWeek[tp][w.week] = {});
    S.fields.forEach(f => { wk[f] = (wk[f] || 0) + (Number(a[f]) || 0); });
  });
  const out = [];
  Object.keys(tpWeek).forEach(tp => {
    const weeks = tpWeek[tp];
    Object.keys(weeks).forEach(w => {
      if (w < reportFrom || w > lastComplete) return;
      S.fields.forEach(f => {
        const base = [];
        for (let i = 1; i <= S.baselineWeeks; i++) {
          const bw = weeks[addDaysISO(w, -7 * i)];
          if (bw) base.push(bw[f] || 0);
        }
        if (base.length < S.minBaselineWeeks) return;
        const median = medianOf(base);
        const value = weeks[w][f] || 0;
        if (value > S.multiplier * median && value >= S.minValue) {
          out.push({ tp, weekEnding: w, field: f, value, median, baselineWeeks: base.length });
        }
      });
    });
  });
  const ratio = e => (e.median > 0 ? e.value / e.median : Infinity);
  return out.sort((a, b) =>
    b.weekEnding.localeCompare(a.weekEnding)
    || (ratio(b) === ratio(a) ? 0 : ratio(b) > ratio(a) ? 1 : -1)
    || a.tp.localeCompare(b.tp) || a.field.localeCompare(b.field));
}

// The one entry point os-admin.js calls. `meta` counts what the checks had to
// set aside: orphanRows (role no longer in `roles` — skipped everywhere);
// then, for rows with a known role: offSundayRows (bucketed to the next
// Sunday), undatedRows (in funnel totals, out of the week checks), noTpRows
// (out of spikes).
function detectWeeklyActivityAnomalies(roles, activity, today = new Date(), cfg = CONFIG.WEEKLY_ANOMALIES) {
  const known = new Set((roles || []).map(r => String(r.id)));
  const meta = { lastComplete: _anomalyLastComplete(today), rowsScanned: (activity || []).length,
    orphanRows: 0, offSundayRows: 0, undatedRows: 0, noTpRows: 0 };
  (activity || []).forEach(a => {
    if (!known.has(_anomalyRoleKey(a))) { meta.orphanRows++; return; }
    const w = _anomalyWeekKey(a);
    if (!w) meta.undatedRows++;
    else if (w.offSunday) meta.offSundayRows++;
    if (!tpList(a && a.TalentPartner).length) meta.noTpRows++;
  });
  return {
    impossibleFunnels: findImpossibleFunnels(roles, activity, cfg),
    noActivity:        findRolesWithNoActivity(roles, activity, today, cfg),
    spikes:            findActivitySpikes(activity, today, cfg),
    meta,
  };
}

// ── Impossible-funnel acknowledgements (N-273) ───────────────────────
// PURE. A stable text signature of a flag's breaches, in the order
// findImpossibleFunnels emits them (CONFIG.WEEKLY_ANOMALIES.funnelPairs
// order): 'Responses:12>Outreach:10;Offers:3>Interview1:2'. An acknowledgement
// matches a flag only when the role AND this signature both match, so any
// change in the totals — or in which pairs are breached — brings the flag back.
function anomalyFunnelSignature(flag) {
  return ((flag && flag.breaches) || [])
    .map(b => `${b.later}:${b.laterTotal}>${b.earlier}:${b.earlierTotal}`)
    .join(';');
}

// PURE. Split funnel flags by the active acknowledgements read from AnomalyAcks.
//   open         — flags with no matching acknowledgement (input order kept)
//   acknowledged — [{ flag, signature, acks: [row…] }] — role + signature match
//   reappeared   — roleIds of OPEN flags whose role has an active ack at a
//                  different signature (acknowledged earlier, totals changed)
// Rows that are not active, not CheckType 'funnel', or belong to a role with no
// current flag are ignored. Two active rows for the same role + signature (a
// double-click, two admins) are one acknowledgement holding both rows.
function partitionAcknowledgedFunnels(flags, acks) {
  const active = (acks || []).filter(a => a && a.CheckType === 'funnel' && a.Status === 'active');
  const open = [], acknowledged = [], reappeared = [];
  (flags || []).forEach(f => {
    const mine = active.filter(a => String(a.SubjectKey) === String(f.roleId));
    const signature = anomalyFunnelSignature(f);
    const matching = mine.filter(a => a.Signature === signature);
    if (matching.length) {
      acknowledged.push({ flag: f, signature, acks: matching });
    } else {
      open.push(f);
      if (mine.length) reappeared.push(String(f.roleId));
    }
  });
  return { open, acknowledged, reappeared };
}

// PURE. The eight AnomalyAcks columns for one acknowledgement. The note is
// trimmed and capped at cfg.acknowledge.noteMaxChars; the email is lower-cased;
// nowIso is an instant (ISO 8601 text — the column is text, not a Date).
function buildAnomalyAckFields({ checkType, subjectKey, signature, note }, email, nowIso, cfg = CONFIG.WEEKLY_ANOMALIES) {
  return {
    Title:          `${checkType} · ${subjectKey}`,
    CheckType:      checkType,
    SubjectKey:     String(subjectKey),
    Signature:      signature,
    Note:           String(note || '').trim().slice(0, cfg.acknowledge.noteMaxChars),
    AcknowledgedBy: String(email || '').toLowerCase(),
    AcknowledgedAt: nowIso,
    Status:         'active',
  };
}


// ── Role flag helpers (shared by cc-pages.js, analytics-pages.js,
//    mobile-scorecards.js, index.html and computeSnapshotMetrics) ──
// Snapshots contract list (N-086's flow mirrors it) — values deliberately
// left as-is (N-305): 'Placed' is legacy/dead; 'Closed' is live since N-306
// and 'Hired' is kept as its pre-migration value — harmless, because the
// pinned assertion intersects with ROLE_STAGES. Over real stage values
// (CONFIG.ROLE_STAGES) it equals the
// complement of utils.js:isOpenPipelineStage() — pinned by assertion — so
// dashboards and Snapshots agree on "open". The one documented exception in
// tests/lint-stage-arrays.js (STAGE_ARRAY_ALLOW).
const ACTIVE_STAGES = ['Placed', 'Closed', 'Hired', 'Backlog', 'Cancelled', 'On-hold'];
// Stages that block linking a live role to a Hiring Plan row. Narrower than
// ACTIVE_STAGES: a Backlog role is dormant for velocity metrics but is exactly
// what a plan row tracks, so it stays linkable. Derived — not a second list.
const PLAN_LINKABLE_EXCLUDED_STAGES = ACTIVE_STAGES.filter(s => s !== 'Backlog');

// N-274 (N-272 D1): the at-risk flag measures time in the CURRENT stage, not
// role age. Per-stage budgets (days) = CONFIG.ROLE_FLAG.stageWeights scaled to
// ANALYTICS_BENCHMARKS.timeToHireDays, ordered by CONFIG.ROLE_STAGES (the old
// 4-stage STAGE_ORDER subset is gone). cumulative[S] = the days open by which
// a role on pace has left stage S. weight × target ÷ total keeps whole-number
// budgets exact (no float drift at the > comparison).
function roleStageBudgets(cfg = CONFIG.ROLE_FLAG, target = CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays) {
  const weights = cfg.stageWeights;
  Object.keys(weights).forEach(s => {
    if (!CONFIG.ROLE_STAGES.includes(s)) throw new Error(`ROLE_FLAG.stageWeights: unknown stage "${s}"`);
  });
  const stages = CONFIG.ROLE_STAGES.filter(s => s in weights);
  const total  = stages.reduce((n, s) => n + weights[s], 0);
  const budget = {}, cumulative = {};
  let run = 0;
  stages.forEach(s => {
    budget[s] = weights[s] * target / total;
    run += budget[s];
    cumulative[s] = run;
  });
  return { budget, cumulative };
}
const ROLE_STAGE_BUDGETS = roleStageBudgets();

// RoleHistory Stage rows → { [roleId]: rows, oldest first }. Build once per
// page load from getRoleStageHistory() and pass it to isRoleFlagged /
// roleFlagReasons / tallyRoleFlags.
function groupStageHistoryByRole(rows) {
  const byRole = {};
  (rows || []).forEach(h => {
    if (!h || (h.Field && h.Field !== 'Stage')) return;
    const k = String(h.RoleIDLookupId);
    (byRole[k] = byRole[k] || []).push(h);
  });
  Object.values(byRole).forEach(a => a.sort((x, y) => new Date(x.ChangedAt) - new Date(y.ChangedAt)));
  return byRole;
}

// Scorecards data load — shared by the desktop page (analytics-pages.js) and
// the mobile carousel (mobile-scorecards.js) so the two can't drift (N-351).
// N-270: 52 weeks fetched once — the full window feeds the learned
// benchmarks; everything on the cards stays on the 13-week slice.
async function loadScorecardData() {
  const [activity52, historical, tpMap, allRoles, stageRows, headcount, placementIds, allProjects] = await Promise.all([
    getActivityForAnalytics(52),
    getHistoricalPlacements(),
    getTalentPartnerDisplayMap(),
    getAllRoles(),
    getRoleStageHistory().catch(e => { console.warn('N-274: stage history read failed', e); return []; }),
    getAllHeadcount().catch(e => { console.warn('N-309: headcount read failed', e); return []; }),
    getPlacementHeadcountIds().catch(e => { console.warn('N-309: placement headcount read failed', e); return []; }),
    getProjects(false),
  ]);
  return {
    activity52, historical, tpMap, allRoles, allProjects,
    activityRaw:  activitySinceWeeks(activity52, 13),
    stageHistory: groupStageHistoryByRole(stageRows),                    // N-274
    // N-309: behind-pace measured from each pipeline's oldest open headcount.
    openSince:    oldestOpenHeadcountIndex(headcount, placementIds),
  };
}

// Returns a Set of lowercased TP emails assigned to the given user's projects.
// Used to scope a Delivery Manager to the scorecards of TPs on their projects
// (desktop and mobile Scorecards).
async function getScopedTpEmails(userEmail) {
  const projectIds = await getUserProjectIds(userEmail);
  // Admins resolve to null (all projects) — treat as unrestricted.
  if (projectIds === null) return null;
  const allowed = new Set();
  for (const pid of projectIds) {
    const assignments = await getTalentPartnersForProject(pid);
    assignments.forEach(a => {
      const email = (a.UserEmail || a.Title || '').toLowerCase();
      if (email) allowed.add(email);
    });
  }
  return allowed;
}

// Market Report metrics block (N-351): the interactive canvas, the live
// preview and the print canvas all call this. Pipeline key order is the
// printed column order.
function marketReportMetrics(activity, tam) {
  return {
    pctContacted: Math.round((sumField(activity, "Outreach")  / tam) * 100),
    pctResponded: Math.round((sumField(activity, "Responses") / tam) * 100),
    pipeline: {
      Screened:   sumField(activity, "Screened"),
      Submitted:  sumField(activity, "Submitted"),
      "IV1":      sumField(activity, "Interview1"),
      "IV2+":     sumField(activity, "Interview2Plus"),
      "Final IV": sumField(activity, "FinalInterview"),
      Offers:     sumField(activity, "Offers"),
      Hires:      sumField(activity, "Hires"),
    },
  };
}

// The day ('YYYY-MM-DD') the role entered its CURRENT stage, or null when the
// history can't say (no rows, or the latest row disagrees with role.Stage).
// ChangedAt is an instant → local day; OpenDate is a day marker → spDateIn.
// Never diff the two in raw ms (N-100 diff-4). Back-dated to OpenDate when
// that is earlier AND the row is the role's creation row (it sat in this stage
// before Newton logged it) or its first move into Sourcing (OpenDate is the
// true go-live) — the same two cases roleTimelineModel (pages-model.js) back-dates.
// Known overlap with that render code; the timeline is deliberately untouched.
function roleStageEntryDay(role, roleRows) {
  const rows = roleRows || [];
  const last = rows[rows.length - 1];
  if (!last || !role || last.NewValue !== role.Stage) return null;
  let entry = localDayISO(new Date(last.ChangedAt));
  if (!entry) return null;
  const openDay = role.OpenDate ? spDateIn(role.OpenDate) : null;
  // Falsy, never === '' — a creation row's OldValue reads back null (N-100).
  const isCreation = !last.OldValue;
  const firstSourcing = role.Stage === 'Sourcing' &&
    rows.findIndex(h => h.NewValue === 'Sourcing') === rows.length - 1;
  if (openDay && openDay < entry && (isCreation || firstSourcing)) entry = openDay;
  return entry;
}

// Why a role is (or isn't) flagged. flagged = stuck || conversion.
//   stuck      — in a budgeted stage (not ROLE_FLAG.noStuckStages) for longer
//                than its budget. Unknown stage entry → false: never falls
//                back to OpenDate, which is the age rule N-272 retired.
//   conversion — the last conversion.windowWeeks of activity hold
//                >= minSubmitted Submitted and Interview1 ÷ Submitted < minRate.
//                Windowed here, so every caller agrees whatever it fetched
//                (callers must pass at least windowWeeks of activity).
//   behindPace — days open > the cumulative budget through the current stage.
//                Information only (Chris, 2 Oct 2026): N-272 found a 130-day
//                median open → hire, so this is never counted as flagged,
//                never in a RAG, never notified.
//                N-309: "days open" = since the pipeline's OLDEST OPEN
//                HEADCOUNT opened, when opts.openSince is given
//                (oldestOpenHeadcountIndex(), headcount.js) — no open dated
//                headcount → null / false. Omitted → legacy role.OpenDate.
//                Every caller that SHOWS behind-pace passes it; `flagged`
//                never depends on it.
// stageHistory: groupStageHistoryByRole() output. `today` is injectable for
// tests. Stages with no budget (Planning, Backlog, …) are never age-evaluated.
function roleFlagReasons(role, activity, stageHistory = {}, today = new Date(), opts = {}) {
  const cfg        = CONFIG.ROLE_FLAG;
  const todayDay   = localDayISO(today);
  const stage      = role && role.Stage;
  const budget     = ROLE_STAGE_BUDGETS.budget[stage];
  const paceBudget = ROLE_STAGE_BUDGETS.cumulative[stage];
  const budgeted   = budget !== undefined;

  const entry       = budgeted ? roleStageEntryDay(role, (stageHistory || {})[String(role.id)]) : null;
  const daysInStage = entry ? Math.max(0, daysOpen(entry, todayDay)) : null;
  const stuck       = daysInStage !== null && !cfg.noStuckStages.includes(stage) && daysInStage > budget;

  const openSince  = opts && opts.openSince instanceof Map
    ? (opts.openSince.get(String(role.id)) || null)
    : role.OpenDate;
  const opened     = budgeted && openSince ? daysOpen(openSince, todayDay) : null;
  const behindPace = opened !== null && opened > paceBudget;

  const c          = cfg.conversion;
  const recent     = activitySinceWeeks(activity || [], c.windowWeeks, today);
  const submitted  = sumField(recent, 'Submitted');
  const iv1        = sumField(recent, 'Interview1');
  const conversion = submitted >= c.minSubmitted && (iv1 / submitted) < c.minRate;

  return {
    flagged: stuck || conversion,
    stuck, conversion, behindPace,
    daysInStage,
    stageBudget: budgeted ? budget : null,
    daysOpen:    opened,
    paceBudget:  budgeted ? paceBudget : null,
    entryKnown:  entry !== null,
  };
}

// Flagged = stuck in stage OR low recent conversion (N-274). The first two
// parameters are unchanged; a 2-argument call has no stage history, so only
// the conversion rule can fire.
function isRoleFlagged(role, activity, stageHistory = {}, today = new Date(), opts = {}) {
  return roleFlagReasons(role, activity, stageHistory, today, opts).flagged;
}

// Counts over a set of roles (callers pass open roles): total, flagged, and
// each reason. `activity` = every row the caller has, filtered per role by
// RoleIDLookupId here. One roleFlagReasons call per role. `opts` is passed
// through — callers that show `behind` pass { openSince } (N-309).
function tallyRoleFlags(roles, activity, stageHistory = {}, today = new Date(), opts = {}) {
  const t = { total: 0, flagged: 0, stuck: 0, conversion: 0, behind: 0 };
  (roles || []).forEach(role => {
    const acts = (activity || []).filter(a => String(a.RoleIDLookupId) === String(role.id));
    const r = roleFlagReasons(role, acts, stageHistory, today, opts);
    t.total++;
    if (r.flagged)    t.flagged++;
    if (r.stuck)      t.stuck++;
    if (r.conversion) t.conversion++;
    if (r.behindPace) t.behind++;
  });
  return t;
}

// Health RAG on flagged ÷ open roles — CC Health tile and homepage Health pill
// (one copy; index.html used to carry its own). No open roles → green, as both
// callers behaved before N-274. Thresholds: CONFIG.ROLE_FLAG.healthRag.
function flaggedShareRAG(flagged, open, cfg = CONFIG.ROLE_FLAG.healthRag) {
  if (!open) return 'green';
  const pct = flagged / open;
  if (pct < cfg.green)  return 'green';
  if (pct <= cfg.amber) return 'amber';
  return 'red';
}

// ── Project scorecards (N-336) ─────────────────────────────────────────
// Command Centre > Project Health detail: one People-Scorecard-style card per
// customer, from the same functions (computeFunnelScorecard, tallyRoleFlags,
// learnFunnelBenchmarksMix) — no maths of its own.
//   - A pipeline belongs to the customer its Project resolves to (projectMap,
//     as the old detail table). ALL of a project's pipelines feed its funnel
//     rows, closed ones included; only open ones count towards the x/y rows.
//   - Funnel rows use the `weeks` window; flagged / behind-pace are the
//     pipelines' current state and don't move with it.
//   - Benchmarks: weighted by the project's own function × location mix,
//     learned from every OTHER project's activity (leave-project-out).
// Sorted worst-first: flagged, then behind pace, then customer A→Z.
const PROJECT_SCORECARD_OMIT = ['Outreach conversion'];

function buildProjectScorecards({ customers, roles, projectMap, activity52, placements,
                                  stageHistory = {}, openSince, weeks, today = new Date() }) {
  const allRoles   = (roles || []).filter(Boolean);
  const map        = projectMap || {};
  const customerOf = r => map[String(r.ProjectIDLookupId)] || map[String(r.ProjectID)] || '';
  const roleIndex  = funnelRoleIndex(allRoles, 'Department', 'Location');
  const obs        = buildFunnelObservations(activity52, roleIndex);
  const windowActs = activitySinceWeeks(activity52, weeks, today);

  const cards = (customers || []).map(customer => {
    const projRoles = allRoles.filter(r => customerOf(r) === customer);
    const ids       = new Set(projRoles.map(r => String(r.id)));
    const open      = projRoles.filter(r => !ACTIVE_STAGES.includes(r.Stage));
    const acts      = windowActs.filter(a => ids.has(String(a.RoleIDLookupId || a.RoleID || '')));
    const hires     = placementsSinceWeeks(placements, weeks, today)
      .filter(p => p && p.placementDate && ids.has(String(p.id)));
    const bench     = learnFunnelBenchmarksMix(obs, buildFunnelObservations(acts, roleIndex),
      { exclude: o => ids.has(o.roleId) });
    const metrics   = scorecardMetricTips(computeFunnelScorecard(acts, hires, bench), bench, 'this project hires in')
      .filter(m => !PROJECT_SCORECARD_OMIT.includes(m.label));
    // isRoleFlagged windows its own conversion rule — pass the full 52 weeks.
    const roleHealth = tallyRoleFlags(open, activity52, stageHistory, today, { openSince });
    return { customer, roleHealth, metrics, bench };
  });
  return cards.sort((a, b) =>
    b.roleHealth.flagged - a.roleHealth.flagged ||
    b.roleHealth.behind  - a.roleHealth.behind  ||
    a.customer.localeCompare(b.customer));
}

// ── Time-series snapshots (N-085 / L-1a) ───────────────────────────────
// Pure aggregation for one project's weekly Snapshots row.
// `roles` = that project's full role set (any stage).
// `weekActivity` / `weekPlacements` = already filtered by the caller to
// the snapshot's week window (WeeklyActivity by WeekEndingDate equality,
// Placements by OfferAcceptedDate range).
//
// CONTRACT: openRoles / avgDaysOpen MUST derive from ACTIVE_STAGES, not
// any other "active stage" list in the codebase (dashboards use
// utils.js:isOpenPipelineStage(), which is pinned set-equal to this list
// over CONFIG.ROLE_STAGES (N-305) — do not swap it in here). N-086's
// flow reimplements this same "open role" definition and cannot read this
// file, so this function is the one place the contract is authoritative
// from — keep it that way.
//
// RolesByStage deliberately excludes 'Closed' (pre-N-306: 'Hired') and
// 'Cancelled' (N-111) —
// CONFIG.ROLE_STAGE_TERMINAL (N-305).
// Both are terminal — a role never leaves them once it lands there — so
// their counts only ever grow, unlike every other stage here, which
// reflects roles genuinely still in flight and can rise or fall week to
// week. Left in, they'd eventually swamp the stages this field exists to
// show. Cumulative hires-to-date isn't tracked here either — sum
// PlacementsInPeriod across a project's Snapshots rows for that instead.
//
// `allActivityForRoles` (N-114) is the project's FULL-HISTORY WeeklyActivity
// rows for its roles — NOT `weekActivity`, which is already windowed to the
// snapshot's single week. isRoleFlagged() needs a role's entire activity
// history to evaluate correctly (same pattern as cc-pages.js:ccHealthStats()),
// so flaggedCount would be silently wrong if passed the windowed set instead.
// `stageHistory` (N-274) = groupStageHistoryByRole(getRoleStageHistory()); the
// flag's stuck rule needs it. Omitted → conversion-only flags.
// `headcountState` (N-309 S-8) = { headcount: the project's RoleHeadcount
// rows, fillMap: headcountFillMap(ALL placements) }. Given → avgDaysOpen is
// the mean days open of OPEN, DATED headcount on the open pipelines in
// openRoleSet (filled, cancelled and undated excluded; per headcount, not per
// pipeline — migrated 1:1 data gives the same number). Omitted → the legacy
// role.OpenDate average.
function computeSnapshotMetrics(roles, weekActivity, weekPlacements, allActivityForRoles = [], stageHistory = {}, headcountState = null) {
  const openRoleSet = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage));

  const rolesByStage = roles.reduce((acc, r) => {
    if (CONFIG.ROLE_STAGE_TERMINAL.includes(r.Stage)) return acc;
    acc[r.Stage] = (acc[r.Stage] || 0) + 1;
    return acc;
  }, {});

  // N-310: one rule with the Project KPI tile (avgOpenHeadcountDays).
  const avgDaysOpen = headcountState
    ? avgOpenHeadcountDays(openRoleSet, headcountState.headcount || [], headcountState.fillMap)
    : avgOpenHeadcountDays(openRoleSet, null, null);

  const flaggedCount = openRoleSet.filter(r => {
    const acts = allActivityForRoles.filter(a => String(a.RoleIDLookupId) === String(r.id));
    return isRoleFlagged(r, acts, stageHistory);
  }).length;

  const activityTotals = {
    Outreach:       sumField(weekActivity, 'Outreach'),
    Responses:      sumField(weekActivity, 'Responses'),
    Screened:       sumField(weekActivity, 'Screened'),
    Submitted:      sumField(weekActivity, 'Submitted'),
    Interview1:     sumField(weekActivity, 'Interview1'),
    Interview2Plus: sumField(weekActivity, 'Interview2Plus'),
    FinalInterview: sumField(weekActivity, 'FinalInterview'),
    Offers:         sumField(weekActivity, 'Offers'),
    Hires:          sumField(weekActivity, 'Hires'),
  };

  return {
    openRoles:          openRoleSet.length,
    rolesByStage,
    avgDaysOpen,
    flaggedCount,
    placementsInPeriod: weekPlacements.length,
    activityTotals,
  };
}

// ── Revenue RAG (N-323) ────────────────────────────────────────────────
// Moved from cc-pages.js (_ccRevenueCalc -> revenueForecastCalc) so the home
// Command Centre banner and the CC Revenue tile share one calculation.
// Current month = estimated only; forecast = avg of estimated + forecast over
// the current month + next 2 (clamped to December). Pure: uses the Revenue
// Tracking helpers in utils.js and CONFIG.REVENUE_THRESHOLDS.
function revenueForecastCalc(forecasts, assigns) {
  const now   = new Date();
  const year  = now.getFullYear();
  const estByMonth      = computeMonthlyRevenueForYear(assigns, year);          // array[12]
  const forecastByMonth = computeMonthlyForecastRevenueForYear(forecasts, year); // array[12]

  const m = now.getMonth();
  const thisMonth = estByMonth[m];

  // Average combined (est + forecast) across current month + next 2 (clamp to Dec)
  const idxs = [m, m + 1, m + 2].filter(i => i <= 11);
  const combinedAvg = idxs.reduce((s, i) => s + estByMonth[i] + forecastByMonth[i], 0) / idxs.length;

  return { thisMonth, forecast: combinedAvg };
}

function computeRevenueRAG(forecasts, assigns) {
  const t = CONFIG.REVENUE_THRESHOLDS;
  const { forecast } = revenueForecastCalc(forecasts, assigns);
  if (forecast >= t.green) return 'green';
  if (forecast >= t.amber) return 'amber';
  return 'red';
}

// ── Utilisation RAG (N-325, N-328) ─────────────────────────────────────
// Moved from cc-pages.js (_ccUtilCalc -> utilisationForecastCalc) by N-325, so
// the home Command Centre banner and the CC Utilisation tile share one
// calculation. N-328 made both figures person-based through
// personUtilisation() (utils.js): each person counts once per day, and the
// 13-week base is day-weighted over [today, horizon] instead of counting
// overlapping assignments. Headcount = deployable billable people
// (isDeployablePerson — N-304 excludes internal staff); forecast (bench-bar)
// assignments are skipped (computeMonthlyRows); thresholds in
// CONFIG.UTILISATION_THRESHOLDS. Pure.
function utilisationForecastCalc(forecasts, assigns, people) {
  const now     = new Date();
  const horizon = new Date(now.getTime() + 91 * 86400000); // 13 weeks

  // Active headcount (deployable billable people only — consistent with People Dashboard)
  const totalActiveHeadcount = (people || []).filter(p =>
    p.IsActive !== false && isDeployablePerson(p)
  ).length;

  // Current: use computeMonthlyRows for current month — consistent with People Dashboard
  const allRows     = computeMonthlyRows(assigns);
  const curMonth    = now.getMonth() + 1;
  const curYear     = now.getFullYear();
  const currentRows = allRows.filter(r => r.Year === curYear && r.Month === curMonth);
  const known       = personUtilisation(currentRows).ratio;   // N-328 (CSD excluded inside)

  // Known 13 weeks (forecast base): person-days from today to the horizon, N-328
  const fwdRows           = computeMonthlyRows(assigns, { through: horizon });
  const knownForecastBase = personUtilisation(fwdRows, { from: now, to: horizon }).ratio;

  // Forecast: known + sales forecasts overlapping next 13 weeks
  const forecastedHeadcount = forecasts.reduce((sum, f) => {
    const s = new Date(f.ForecastStartDate);
    const e = new Date(f.ForecastEndDate);
    return (s <= horizon && e >= now) ? sum + (f.ForecastedHeadcount || 0) : sum;
  }, 0);
  const added    = totalActiveHeadcount > 0 ? forecastedHeadcount / totalActiveHeadcount : 0;
  const forecast = Math.min(knownForecastBase + added, 1.0);

  return { known, forecast };
}

function computeUtilisationRAG(forecasts, assigns, people) {
  const t = CONFIG.UTILISATION_THRESHOLDS;
  const { forecast } = utilisationForecastCalc(forecasts, assigns, people);
  if (forecast >= t.green) return 'green';
  if (forecast >= t.amber) return 'amber';
  return 'red';
}

// ── SLA engine (N-383 / DA-3) ─────────────────────────────────────────
// Pure: no Graph, no DOM. Targets come from slaTargetsFor() (utils.js); stage
// anchors, pause stages and the rolling window from CONFIG.SLA.ENGINE. Day maths
// on 'YYYY-MM-DD' strings only: day markers (OpenDate, OfferAcceptedDate,
// RejectionDate, WeekEndingDate) through spDateIn, the RoleHistory ChangedAt
// instant through localDayISO(new Date(...)) — never raw ms (N-100 diff-4).
// Decisions (Chris, 23 Oct 2026): first submission / offer are role-level events
// shared by every hire open at the time and re-armed per hire (an event counts for
// a hire when it is on/after that hire's OpenDate); WeeklyActivity evidence is
// dated to its week-ending Sunday, exact days win when earlier; On-hold pauses the
// clock (DA-D6); submissions per role per week = rolling mean of the trailing
// CONFIG.SLA.ENGINE.rollingWeeks ACTIVE weeks. Deliberately independent of
// the flag / pace thresholds and the Avg Time to Hire KPI (SLA time to hire
// excludes On-hold days; the KPI does not).

// Per-hire (day) metrics and the role-level weekly metric. Together exactly the
// CONFIG.SLA.METRICS keys (checked at load).
const SLA_HIRE_METRIC_KEYS  = ['firstSubmissionDays', 'timeToOfferDays', 'timeToHireDays'];
const SLA_WEEKLY_METRIC_KEY = 'submissionsPerWeek';

// Throws on a broken CONFIG.SLA.ENGINE: unknown stage, inverted band, bad
// rollingWeeks, or metric keys that don't match CONFIG.SLA.METRICS. Run at load.
function slaEngineConfigCheck(cfg = CONFIG.SLA.ENGINE) {
  const stages = CONFIG.ROLE_STAGES;
  const known = s => { if (!stages.includes(s)) throw new Error(`SLA.ENGINE: unknown stage "${s}"`); };
  if (!cfg) throw new Error('SLA.ENGINE missing');
  (cfg.pauseStages || []).forEach(known);
  known(cfg.offerStage);
  ['submissionBand', 'activeWeekBand'].forEach(k => {
    const b = cfg[k];
    if (!b) throw new Error(`SLA.ENGINE.${k} missing`);
    known(b.from); known(b.to);
    if (stages.indexOf(b.from) > stages.indexOf(b.to)) throw new Error(`SLA.ENGINE.${k}: "${b.from}" comes after "${b.to}"`);
  });
  if (!Number.isInteger(cfg.rollingWeeks) || cfg.rollingWeeks < 1) throw new Error('SLA.ENGINE.rollingWeeks must be an integer >= 1');
  const keys = CONFIG.SLA.METRICS.map(m => m.key).sort();
  const mine = SLA_HIRE_METRIC_KEYS.concat([SLA_WEEKLY_METRIC_KEY]).sort();
  if (keys.join() !== mine.join()) throw new Error('SLA engine metric keys do not match CONFIG.SLA.METRICS');
  return true;
}
slaEngineConfigCheck();

// { from, to } band → the ROLE_STAGES slice it spans, inclusive. Fresh array.
function slaStageBand(band) {
  const s = CONFIG.ROLE_STAGES;
  return s.slice(s.indexOf(band.from), s.indexOf(band.to) + 1);
}

// The role id a WeeklyActivity / Placements / RejectedOffers / RoleHistory row
// belongs to (LookupId first, then plain RoleID), or null.
function _slaRowRoleId(row) {
  if (!row) return null;
  return positiveLookupId(row.RoleIDLookupId) ?? positiveLookupId(row.RoleID);
}

// A role's stage over time from its RoleHistory Stage rows.
// → { segments: [{ stage, from, to }], mismatch, noHistory }. `from` is the day
// the stage was entered (null = before the first logged row), `to` the day it was
// left (null = still in it). A segment touches every day in [from, to] for the
// "any day in the week" test; a pause excludes `to` (the day it resumed).
// Before the first row the stage is that row's OldValue when set. No rows → the
// current Stage throughout (noHistory). mismatch = the latest row disagrees with
// role.Stage, so the history is incomplete.
function slaRoleTimeline(role, roleStageRows) {
  const current = role ? normaliseRoleStage(role.Stage) : null;
  const rows = (roleStageRows || [])
    .filter(h => h && (!h.Field || h.Field === 'Stage'))
    .map(h => ({
      t:    new Date(h.ChangedAt).getTime(),
      day:  localDayISO(new Date(h.ChangedAt)),
      oldV: h.OldValue ? normaliseRoleStage(h.OldValue) : null,
      newV: normaliseRoleStage(h.NewValue),
    }))
    .filter(h => h.day)
    .sort((a, b) => a.t - b.t);
  if (!rows.length) {
    return { segments: current ? [{ stage: current, from: null, to: null }] : [], mismatch: false, noHistory: true };
  }
  const segments = [];
  if (rows[0].oldV) segments.push({ stage: rows[0].oldV, from: null, to: rows[0].day });
  rows.forEach((r, i) => segments.push({ stage: r.newV, from: r.day, to: i + 1 < rows.length ? rows[i + 1].day : null }));
  return { segments, mismatch: rows[rows.length - 1].newV !== current, noHistory: false };
}

// Paused intervals [{ from, to }] (from null = unbounded start, to exclusive) —
// the timeline's CONFIG.SLA.ENGINE.pauseStages segments. A pause still running
// ends tomorrow (today is paused), but only when the history agrees with the role's
// current Stage; on a mismatch that open pause is dropped and the clock runs.
function slaPauseIntervals(timeline, todayDay) {
  const pause = CONFIG.SLA.ENGINE.pauseStages;
  const out = [];
  ((timeline && timeline.segments) || []).forEach(s => {
    if (!pause.includes(s.stage)) return;
    let to = s.to;
    if (to === null) {
      if (timeline.mismatch) return;
      to = addDaysISO(todayDay, 1);
    }
    out.push({ from: s.from, to });
  });
  return out;
}

// Whole days from fromDay to toDay minus the paused days in [fromDay, toDay).
// Never below 0; null when fromDay/toDay can't be read.
function slaActiveDays(fromDay, toDay, pauses) {
  const total = daysOpen(fromDay, toDay);
  if (total === null || !toDay) return null;
  let n = total;
  (pauses || []).forEach(p => {
    const a = p.from && p.from > fromDay ? p.from : fromDay;
    const b = p.to && p.to < toDay ? p.to : toDay;
    if (b > a) n -= daysOpen(a, b);
  });
  return Math.max(0, n);
}

// The first day d with slaActiveDays(fromDay, d, pauses) >= n. Paused days
// don't count, so this walks forward from fromDay + n by at most the paused days.
function slaDayAfterActiveDays(fromDay, n, pauses) {
  let d = addDaysISO(fromDay, n);
  for (let guard = 0; d && slaActiveDays(fromDay, d, pauses) < n; guard++) {
    if (guard > 36600) return null;
    d = addDaysISO(d, 1);
  }
  return d;
}

// Every day the role shows evidence of a submission / an offer, ascending, unique.
//   offer      — a forward RoleHistory entry into offerStage (OldValue null or
//                earlier in ROLE_STAGES, so On-hold → Offered is a resume, not an
//                offer); a WeeklyActivity week with Offers > 0 (its Sunday); every
//                placement's OfferAcceptedDate; every RejectionDate.
//   submission — a forward RoleHistory entry into submissionBand (OldValue null
//                or before the band); a week with Submitted > 0 (its Sunday); and
//                every offer day — an offer implies a submission.
// Rows of other roles are ignored, so callers may pass project-wide arrays.
function slaRoleEvidence({ role, roleStageRows, activity, placements, rejectedOffers } = {}) {
  const rid = role ? positiveLookupId(role.id) : null;
  const mine = r => rid !== null && _slaRowRoleId(r) === rid;
  const S = CONFIG.ROLE_STAGES, E = CONFIG.SLA.ENGINE;
  const subBand = slaStageBand(E.submissionBand);
  const subFrom = S.indexOf(E.submissionBand.from);
  const offIdx  = S.indexOf(E.offerStage);
  const forward = (oldV, idx) => !oldV || (S.indexOf(oldV) >= 0 && S.indexOf(oldV) < idx);
  const offer = new Set(), sub = new Set();
  (roleStageRows || []).forEach(h => {
    if (!h || (h.Field && h.Field !== 'Stage') || !mine(h)) return;
    const day = localDayISO(new Date(h.ChangedAt));
    if (!day) return;
    const nv = normaliseRoleStage(h.NewValue);
    const ov = h.OldValue ? normaliseRoleStage(h.OldValue) : null;
    if (nv === E.offerStage && forward(ov, offIdx)) offer.add(day);
    if (subBand.includes(nv) && forward(ov, subFrom)) sub.add(day);
  });
  (activity || []).forEach(a => {
    if (!mine(a)) return;
    const raw = a.WeekEndingDate ? spDateIn(a.WeekEndingDate) : null;
    const wk  = raw ? sundayOnOrAfterISO(raw) : null;
    if (!wk) return;
    if (Number(a.Submitted) > 0) sub.add(wk);
    if (Number(a.Offers) > 0) offer.add(wk);
  });
  (placements || []).forEach(p => {
    const d = mine(p) && p.OfferAcceptedDate ? spDateIn(p.OfferAcceptedDate) : null;
    if (d) offer.add(d);
  });
  (rejectedOffers || []).forEach(r => {
    const d = mine(r) && r.RejectionDate ? spDateIn(r.RejectionDate) : null;
    if (d) offer.add(d);
  });
  offer.forEach(d => sub.add(d));
  return { submissionDays: [...sub].sort(), offerDays: [...offer].sort() };
}

// The earliest OfferAcceptedDate day among a filled headcount's placements, or null.
function _slaFillDay(hc, fillMap) {
  const fills = (fillMap && fillMap.get(String(hc.id))) || [];
  const days = fills.map(p => (p && p.OfferAcceptedDate ? spDateIn(p.OfferAcceptedDate) : null)).filter(Boolean).sort();
  return days[0] || null;
}

// One hire's three day metrics. null for a cancelled hire or an undated one (no
// OpenDate: the clock never started). Otherwise
//   { headcountId, openDay, state: 'open'|'filled', metrics }
// metrics[key] = { target, value, eventDay, status, breachDay } for each of
// SLA_HIRE_METRIC_KEYS:
//   eventDay  — submission / offer: the first evidence day on/after openDay,
//               capped at the hire's own fill day; hire: its OfferAcceptedDate.
//   value     — active days from openDay to eventDay (or to today while running).
//   status    — 'no-target' | 'met' (event, value <= target) | 'breached' (event
//               late, or running past target) | 'pending' (running, within) |
//               'not-applicable' (a filled hire with no usable event day).
//   breachDay — the day the value first exceeded target (paused days skipped).
// fillMap = headcountFillMap(ALL placements). targets = slaTargetsFor() output.
function slaHireMetrics({ hc, fillMap, evidence, pauses, targets, todayDay } = {}) {
  if (!hc) return null;
  const kind = classifyHeadcount(hc, fillMap);
  const openDay = hc.OpenDate ? spDateIn(hc.OpenDate) : null;
  if (kind === 'cancelled' || !openDay) return null;
  const fillDay = kind === 'filled' ? _slaFillDay(hc, fillMap) : null;
  const firstFrom = days => (days || []).find(d => d >= openDay) || null;
  const cap = d => (fillDay && (!d || d > fillDay) ? fillDay : d);
  const ev = evidence || {};
  const events = {
    firstSubmissionDays: cap(firstFrom(ev.submissionDays)),
    timeToOfferDays:     cap(firstFrom(ev.offerDays)),
    timeToHireDays:      fillDay,
  };
  const metrics = {};
  SLA_HIRE_METRIC_KEYS.forEach(k => {
    const target = targets && targets[k] ? targets[k].value : null;
    const eventDay = events[k] || null;
    if (kind === 'filled' && !eventDay) {
      metrics[k] = { target, value: null, eventDay: null, status: 'not-applicable', breachDay: null };
      return;
    }
    const value = slaActiveDays(openDay, eventDay || todayDay, pauses);
    let status;
    if (target === null) status = 'no-target';
    else if (eventDay) status = value <= target ? 'met' : 'breached';
    else status = value > target ? 'breached' : 'pending';
    metrics[k] = {
      target, value, eventDay, status,
      breachDay: status === 'breached' ? slaDayAfterActiveDays(openDay, target + 1, pauses) : null,
    };
  });
  return { headcountId: String(hc.id), openDay, state: kind, metrics };
}

// Submissions per role per week (role-level — the per-hire clock doesn't apply).
// Weeks run Monday..Sunday, keyed by the Sunday, from the week of the earliest
// dated non-cancelled hire to the last COMPLETE week (the latest Sunday before
// today). A week is active when the timeline touches activeWeekBand on any day
// of it AND a hire was open during it (OpenDate <= Sunday, not filled before
// Monday; cancelled hires and filled hires with no fill day never count).
// rollingAvg (active weeks only) = mean of this and the previous
// rollingWeeks − 1 ACTIVE weeks (inactive weeks are skipped, not zero); null
// until rollingWeeks active weeks exist. breached = target set and rollingAvg <
// target. Episodes = runs of consecutive breached evaluated active weeks
// (inactive weeks don't break a run); ongoing = the run reaches the role's
// latest evaluated week.
// → { weeks: [{ weekEnding, active, submissions, rollingAvg, breached }],
//     episodes: [{ startWeek, endWeek, ongoing, worstAvg }] }
function slaRoleWeeks({ role, timeline, roleHeadcount, fillMap, activity, target = null, todayDay } = {}) {
  const rid = role ? positiveLookupId(role.id) : null;
  const E = CONFIG.SLA.ENGINE;
  const band = slaStageBand(E.activeWeekBand);
  const R = E.rollingWeeks;
  const hires = [];
  (roleHeadcount || []).forEach(hc => {
    if (!hc) return;
    const kind = classifyHeadcount(hc, fillMap);
    const openDay = hc.OpenDate ? spDateIn(hc.OpenDate) : null;
    if (kind === 'cancelled' || !openDay) return;
    const fillDay = kind === 'filled' ? _slaFillDay(hc, fillMap) : null;
    if (kind === 'filled' && !fillDay) return;
    hires.push({ openDay, fillDay });
  });
  const weeks = [], episodes = [];
  if (!hires.length || !todayDay) return { weeks, episodes };
  const subsBySunday = new Map();
  (activity || []).forEach(a => {
    if (rid === null || _slaRowRoleId(a) !== rid) return;
    const raw = a.WeekEndingDate ? spDateIn(a.WeekEndingDate) : null;
    const wk  = raw ? sundayOnOrAfterISO(raw) : null;
    if (!wk) return;
    const n = Number(a.Submitted);
    subsBySunday.set(wk, (subsBySunday.get(wk) || 0) + (Number.isFinite(n) ? n : 0));
  });
  const segments = (timeline && timeline.segments) || [];
  const start = sundayOnOrAfterISO(hires.map(h => h.openDay).sort()[0]);
  const last  = addDaysISO(sundayOnOrAfterISO(todayDay), -7);
  const activeSubs = [];
  for (let sun = start; sun && last && sun <= last; sun = addDaysISO(sun, 7)) {
    const mon = addDaysISO(sun, -6);
    const inBand = segments.some(s => band.includes(s.stage) &&
      (s.from === null || s.from <= sun) && (s.to === null || s.to >= mon));
    const hireOpen = hires.some(h => h.openDay <= sun && (!h.fillDay || h.fillDay >= mon));
    const active = inBand && hireOpen;
    const submissions = subsBySunday.get(sun) || 0;
    let rollingAvg = null;
    if (active) {
      activeSubs.push(submissions);
      if (activeSubs.length >= R) rollingAvg = activeSubs.slice(-R).reduce((a, b) => a + b, 0) / R;
    }
    const breached = target !== null && rollingAvg !== null && rollingAvg < target;
    weeks.push({ weekEnding: sun, active, submissions, rollingAvg, breached });
  }
  let run = null;
  weeks.forEach(w => {
    if (!w.active || w.rollingAvg === null) return;
    if (!w.breached) { run = null; return; }
    if (!run) {
      run = { startWeek: w.weekEnding, endWeek: w.weekEnding, ongoing: false, worstAvg: w.rollingAvg };
      episodes.push(run);
    } else {
      run.endWeek = w.weekEnding;
      if (w.rollingAvg < run.worstAvg) run.worstAvg = w.rollingAvg;
    }
  });
  const lastEval = weeks.filter(w => w.active && w.rollingAvg !== null).pop();
  episodes.forEach(e => { e.ongoing = !!lastEval && e.endWeek === lastEval.weekEnding; });
  return { weeks, episodes };
}

// One project's SLA picture, recomputed from existing lists (no Snapshots).
// null when the project can't have SLAs (slaTargetsFor null: no project, LCI,
// Transformation, Internal, unknown type). Otherwise
//   { targets, hires: [{ roleId, headcountId, openDay, state, metrics }],
//     roles: [{ roleId, weeks, episodes }],
//     breaches: [{ key, metric, roleId, headcountId, breachDay, eventDay, ongoing }],
//     gaps: { undatedHires, cancelledHires, filledNoOfferDate, historyMismatch, noStageHistory } }
// Breach keys are stable for de-dup (N-386): '<metricKey>:<headcountId>' (one per
// hire per metric) and 'submissionsPerWeek:<roleId>:<startWeek>' (one per
// episode). Ordered by breachDay, then key. A target edit recomputes history.
// CONSUMER CONTRACT: `placements` must be ALL-TIME (fill-map rule, N-309) and
// `activity` UNWINDOWED for the project's roles — a 13-week slice makes older
// hires look like they never had a submission and false-breaches them.
// Scoping is done here (roles by projectIdForRole), so project-wide or
// company-wide arrays are fine. Inputs are never mutated.
function computeProjectSla({ project, slaRows, roles, headcount, placements, stageRows, activity, rejectedOffers = null, today = new Date() } = {}) {
  const targets = slaTargetsFor(project, slaRows);
  if (!targets) return null;
  const todayDay = localDayISO(today);
  const pid = positiveLookupId(project.id);
  const projRoles = (roles || []).filter(r => r && pid !== null && projectIdForRole(r) === pid);
  const roleIds = new Set(projRoles.map(r => String(r.id)));
  const inProject = r => roleIds.has(String(_slaRowRoleId(r)));
  const projHc   = (headcount || []).filter(hc => hc && roleIds.has(String(hc.RoleID)));
  const projPl   = (placements || []).filter(p => p && inProject(p));
  const projAct  = (activity || []).filter(a => a && inProject(a));
  const projRej  = rejectedOffers ? rejectedOffers.filter(r => r && inProject(r)) : null;
  const fillMap  = headcountFillMap(placements);
  const stageByRole = groupStageHistoryByRole((stageRows || []).filter(h => h && inProject(h)));
  const hcByRole = groupHeadcountByRole(projHc);
  const weeklyTarget = targets[SLA_WEEKLY_METRIC_KEY] ? targets[SLA_WEEKLY_METRIC_KEY].value : null;
  const gaps = { undatedHires: 0, cancelledHires: 0, filledNoOfferDate: 0, historyMismatch: 0, noStageHistory: 0 };
  const hires = [], roleOut = [], breaches = [];
  projRoles.forEach(role => {
    const rid = String(role.id);
    const rows = stageByRole[rid] || [];
    const timeline = slaRoleTimeline(role, rows);
    if (timeline.noHistory) gaps.noStageHistory++;
    else if (timeline.mismatch) gaps.historyMismatch++;
    const pauses = slaPauseIntervals(timeline, todayDay);
    const evidence = slaRoleEvidence({ role, roleStageRows: rows, activity: projAct, placements: projPl, rejectedOffers: projRej });
    const roleHc = hcByRole.get(rid) || [];
    roleHc.forEach(hc => {
      if (!hc) return;
      if (classifyHeadcount(hc, fillMap) === 'cancelled') { gaps.cancelledHires++; return; }
      if (!hc.OpenDate || !spDateIn(hc.OpenDate)) { gaps.undatedHires++; return; }
      const h = slaHireMetrics({ hc, fillMap, evidence, pauses, targets, todayDay });
      if (!h) return;
      if (h.metrics.timeToHireDays.status === 'not-applicable') gaps.filledNoOfferDate++;
      hires.push(Object.assign({ roleId: rid }, h));
      SLA_HIRE_METRIC_KEYS.forEach(k => {
        const m = h.metrics[k];
        if (m.status !== 'breached') return;
        breaches.push({ key: `${k}:${h.headcountId}`, metric: k, roleId: rid, headcountId: h.headcountId,
          breachDay: m.breachDay, eventDay: m.eventDay, ongoing: !m.eventDay });
      });
    });
    const wk = slaRoleWeeks({ role, timeline, roleHeadcount: roleHc, fillMap, activity: projAct, target: weeklyTarget, todayDay });
    roleOut.push({ roleId: rid, weeks: wk.weeks, episodes: wk.episodes });
    wk.episodes.forEach(e => breaches.push({
      key: `${SLA_WEEKLY_METRIC_KEY}:${rid}:${e.startWeek}`, metric: SLA_WEEKLY_METRIC_KEY, roleId: rid,
      headcountId: null, breachDay: e.startWeek, eventDay: e.endWeek, ongoing: e.ongoing,
    }));
  });
  breaches.sort((a, b) => (a.breachDay === b.breachDay
    ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    : (a.breachDay < b.breachDay ? -1 : 1)));
  return { targets, hires, roles: roleOut, breaches, gaps };
}

// Attainment per metric over [fromDay, toDay] (inclusive; null bound = open).
// → { [metricKey]: { target, met, breached, pending, pct } } for every
// CONFIG.SLA.METRICS key. Day metrics: met = hires whose event day is in range,
// breached = hires whose breach day is in range, pending = hires still running
// within target (not period-bound). Weekly: evaluated active weeks whose Sunday is
// in range. pct = round(met ÷ (met + breached) × 100); null when nothing counts
// or there is no target. No RAG here — thresholds belong to the panel (N-384).
// result null → null.
function slaAttainment(result, fromDay = null, toDay = null) {
  if (!result) return null;
  const inRange = d => !!d && (!fromDay || d >= fromDay) && (!toDay || d <= toDay);
  const out = {};
  CONFIG.SLA.METRICS.forEach(m => {
    const target = result.targets && result.targets[m.key] ? result.targets[m.key].value : null;
    let met = 0, breached = 0, pending = 0;
    if (target !== null && m.key === SLA_WEEKLY_METRIC_KEY) {
      (result.roles || []).forEach(r => (r.weeks || []).forEach(w => {
        if (!w.active || w.rollingAvg === null || !inRange(w.weekEnding)) return;
        if (w.breached) breached++; else met++;
      }));
    } else if (target !== null) {
      (result.hires || []).forEach(h => {
        const x = h.metrics && h.metrics[m.key];
        if (!x) return;
        if (x.status === 'met' && inRange(x.eventDay)) met++;
        else if (x.status === 'breached' && inRange(x.breachDay)) breached++;
        else if (x.status === 'pending') pending++;
      });
    }
    out[m.key] = { target, met, breached, pending, pct: met + breached ? Math.round(met / (met + breached) * 100) : null };
  });
  return out;
}

// ── SLA panel model (N-384 / DA-4) ───────────────────────────────────────────
// Pure: no Graph, no DOM. Turns computeProjectSla() / slaAttainment() output into what the
// SLA panel (project) and tile (company) render. RAG bands, periods, labels and the breach-row
// cap all come from CONFIG.SLA (RAG, PERIODS, PERIOD_DEFAULT, PANEL_BREACH_ROWS).

// Throws on a broken CONFIG.SLA panel block. Run at load.
function slaPanelConfigCheck(cfg = CONFIG.SLA) {
  const rag = cfg && cfg.RAG;
  if (!rag) throw new Error('SLA.RAG missing');
  if (!Number.isInteger(rag.green) || !Number.isInteger(rag.amber) || rag.amber < 0 || rag.green > 100 || rag.amber >= rag.green) {
    throw new Error('SLA.RAG: green and amber must be integers with 0 <= amber < green <= 100');
  }
  ['green', 'amber', 'red', 'grey'].forEach(k => {
    if (!rag.LABELS || typeof rag.LABELS[k] !== 'string' || !rag.LABELS[k]) throw new Error(`SLA.RAG.LABELS.${k} missing`);
  });
  const periods = cfg.PERIODS;
  if (!Array.isArray(periods) || !periods.length) throw new Error('SLA.PERIODS missing');
  const keys = periods.map(p => p && p.key);
  if (keys.some(k => typeof k !== 'string' || !k) || new Set(keys).size !== keys.length) {
    throw new Error('SLA.PERIODS: keys must be unique, non-empty strings');
  }
  periods.forEach(p => {
    if (typeof p.label !== 'string' || !p.label) throw new Error(`SLA.PERIODS "${p.key}": label missing`);
    if (p.days !== null && !(Number.isInteger(p.days) && p.days > 0)) throw new Error(`SLA.PERIODS "${p.key}": days must be null or a positive integer`);
  });
  if (!keys.includes(cfg.PERIOD_DEFAULT)) throw new Error('SLA.PERIOD_DEFAULT is not one of SLA.PERIODS');
  if (!Number.isInteger(cfg.PANEL_BREACH_ROWS) || cfg.PANEL_BREACH_ROWS < 1) throw new Error('SLA.PANEL_BREACH_ROWS must be an integer >= 1');
  // N-385: the roll-up period is a bounded window, never the all-time key.
  const roll = periods.find(p => p.key === cfg.ROLLUP_PERIOD);
  if (!roll || !(Number.isInteger(roll.days) && roll.days > 0)) throw new Error('SLA.ROLLUP_PERIOD must be a SLA.PERIODS key with a positive day count');
  return true;
}
slaPanelConfigCheck();

// Attainment % → 'green' | 'amber' | 'red'; null / non-numeric (nothing evaluated) → 'grey'.
function slaRag(pct, cfg = CONFIG.SLA.RAG) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return 'grey';
  if (pct >= cfg.green) return 'green';
  if (pct >= cfg.amber) return 'amber';
  return 'red';
}

const _SLA_RAG_RANK = { green: 1, amber: 2, red: 3 };

// The worst of several RAGs; grey entries are ignored, none rated → 'grey'.
function _slaWorstRag(rags) {
  let worst = 'grey';
  (rags || []).forEach(r => {
    if (_SLA_RAG_RANK[r] && (worst === 'grey' || _SLA_RAG_RANK[r] > _SLA_RAG_RANK[worst])) worst = r;
  });
  return worst;
}

// Panel period key → { key, label, fromDay, toDay }. days N = the last N days INCLUDING today;
// days null = all time (both bounds null). An unknown key falls back to PERIOD_DEFAULT.
function slaPanelPeriod(key, today = new Date()) {
  const periods = CONFIG.SLA.PERIODS;
  const p = periods.find(x => x.key === key) || periods.find(x => x.key === CONFIG.SLA.PERIOD_DEFAULT);
  if (p.days === null) return { key: p.key, label: p.label, fromDay: null, toDay: null };
  const toDay = localDayISO(today);
  return { key: p.key, label: p.label, fromDay: addDaysISO(toDay, -(p.days - 1)), toDay };
}

// Plain-English notes for the data gaps that make the numbers softer. Only non-zero gaps
// speak; cancelledHires is expected and never listed. [] when clean.
function slaGapNotes(gaps) {
  const g = gaps || {};
  const n = k => Number(g[k]) || 0;
  const many = (c, one, more) => `${c} ${c === 1 ? one : more}`;
  const out = [];
  if (n('undatedHires')) out.push(`${many(n('undatedHires'), 'hire has', 'hires have')} no open date, so ${n('undatedHires') === 1 ? 'it is' : 'they are'} not measured.`);
  if (n('filledNoOfferDate')) out.push(`${many(n('filledNoOfferDate'), 'filled hire has', 'filled hires have')} no offer-accepted date, so time to hire cannot be measured.`);
  if (n('noStageHistory')) out.push(`${many(n('noStageHistory'), 'role has', 'roles have')} no stage history, so On-hold time cannot be excluded.`);
  if (n('historyMismatch')) out.push(`${many(n('historyMismatch'), 'role has', 'roles have')} stage history that disagrees with its current stage, so ongoing On-hold time is ignored.`);
  return out;
}

// One project's panel. result = computeProjectSla() output (null → null). roles / headcount
// label the breach rows. Attainment and RAG follow the period; the breach list never does.
//   { period, hasTargets, rag, ongoingBreaches, gapNotes,
//     metrics:    [{ key, label, unit, noun, target, met, breached, pending, pct, rag, ongoing }],
//     breachRows: [{ key, metric, metricLabel, roleId, roleLabel, hireLabel, target, value,
//                    worstAvg, breachDay, eventDay, ongoing, status }] }
// Breach rows: ongoing first, then breachDay descending, then key. status 'ongoing' | 'resolved'
// (a late event, or an ended weekly episode). value = the hire's days now (ongoing) or at the
// event (resolved); weekly rows carry worstAvg instead and hireLabel null. Labels are plain text.
function slaPanelModel({ result, roles, headcount, periodKey, today = new Date() } = {}) {
  if (!result) return null;
  const period = slaPanelPeriod(periodKey, today);
  const att = slaAttainment(result, period.fromDay, period.toDay);
  const ongoingBy = {};
  (result.breaches || []).forEach(b => { if (b.ongoing) ongoingBy[b.metric] = (ongoingBy[b.metric] || 0) + 1; });
  const metrics = CONFIG.SLA.METRICS.map(m => {
    const a = att[m.key];
    return {
      key: m.key, label: m.label, unit: m.unit,
      noun: m.key === SLA_WEEKLY_METRIC_KEY ? 'weeks' : 'hires',
      target: a.target, met: a.met, breached: a.breached, pending: a.pending, pct: a.pct,
      rag: slaRag(a.pct), ongoing: ongoingBy[m.key] || 0,
    };
  });
  const roleMap = new Map((roles || []).filter(Boolean).map(r => [String(r.id), r]));
  const hcMap = new Map((headcount || []).filter(Boolean).map(h => [String(h.id), h]));
  const hireMap = new Map((result.hires || []).map(h => [String(h.headcountId), h]));
  const episodeMap = new Map();
  (result.roles || []).forEach(r => (r.episodes || []).forEach(e => episodeMap.set(`${r.roleId}:${e.startWeek}`, e)));
  const labelOf = Object.fromEntries(CONFIG.SLA.METRICS.map(m => [m.key, m.label]));
  const breachRows = (result.breaches || []).map(b => {
    const role = roleMap.get(String(b.roleId));
    const tgt = result.targets && result.targets[b.metric] ? result.targets[b.metric].value : null;
    const row = {
      key: b.key, metric: b.metric, metricLabel: labelOf[b.metric] || b.metric,
      roleId: String(b.roleId), roleLabel: role ? headcountRoleLabel(role) : `Role ${b.roleId}`,
      hireLabel: null, target: tgt, value: null, worstAvg: null,
      breachDay: b.breachDay, eventDay: b.eventDay, ongoing: !!b.ongoing, status: b.ongoing ? 'ongoing' : 'resolved',
    };
    if (b.headcountId !== null && b.headcountId !== undefined) {
      const hc = hcMap.get(String(b.headcountId));
      row.hireLabel = hc ? (hc.Title || headcountLabel(hc.Sequence)) : `Hire ${b.headcountId}`;
      const h = hireMap.get(String(b.headcountId));
      const mm = h && h.metrics ? h.metrics[b.metric] : null;
      row.value = mm ? mm.value : null;
    } else {
      const e = episodeMap.get(`${b.roleId}:${b.breachDay}`);
      row.worstAvg = e ? e.worstAvg : null;
    }
    return row;
  });
  breachRows.sort((a, b) =>
    (a.ongoing === b.ongoing ? 0 : (a.ongoing ? -1 : 1)) ||
    (a.breachDay === b.breachDay ? 0 : (a.breachDay > b.breachDay ? -1 : 1)) ||
    (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0)));
  return {
    period,
    hasTargets: metrics.some(m => m.target !== null),
    rag: _slaWorstRag(metrics.map(m => m.rag)),
    ongoingBreaches: breachRows.filter(r => r.ongoing).length,
    gapNotes: slaGapNotes(result.gaps),
    metrics, breachRows,
  };
}

// The line a project gets on the Company tile.
function _slaProjectSummary(rag, problems, ongoing) {
  const on = `${ongoing} ongoing ${ongoing === 1 ? 'breach' : 'breaches'}`;
  if (problems.length) return problems.map(p => `${p.label} ${p.pct}%`).join(' · ') + (ongoing ? ` · ${on}` : '');
  if (rag === 'grey') return ongoing ? `Not rated · ${on}` : 'Not rated';
  return ongoing ? `Ongoing breaches: ${ongoing}` : 'No problem areas';
}

// The Company Dashboard tile. projects = the (already internal-filtered) projects; results =
// { [projectId]: computeProjectSla() output }. Null results (LCI / Transformation / Internal /
// unknown type) are skipped. Pooled per metric by COUNTS over projects that have a target for it:
// round(sum met / (sum met + sum breached) x 100), not a mean of project percentages. A project's
// RAG is its worst rated metric. One row per project, worst first.
//   { period, counts: { green, amber, red, grey },
//     metrics: [{ key, label, unit, noun, met, breached, pending, pct, rag, rated }],
//     rows: [{ projectId, name, rag, ongoingBreaches, problems: [{ key, label, pct, rag }], summary }] }
function slaPortfolioModel({ projects, results, periodKey, today = new Date() } = {}) {
  const period = slaPanelPeriod(periodKey, today);
  const pools = {};
  CONFIG.SLA.METRICS.forEach(m => { pools[m.key] = { met: 0, breached: 0, pending: 0, rated: 0 }; });
  const rows = [];
  (projects || []).forEach(p => {
    const res = p && results ? results[String(p.id)] : null;
    if (!res) return;
    const att = slaAttainment(res, period.fromDay, period.toDay);
    const rags = [], problems = [], rowMetrics = [];
    CONFIG.SLA.METRICS.forEach(m => {
      const a = att[m.key];
      if (a.target === null) { rowMetrics.push({ key: m.key, label: m.label, target: null, pct: null, rag: 'grey' }); return; }
      rowMetrics.push({ key: m.key, label: m.label, target: a.target, pct: a.pct, rag: slaRag(a.pct) });
      const pool = pools[m.key];
      pool.met += a.met; pool.breached += a.breached; pool.pending += a.pending;
      if (a.pct === null) return;
      pool.rated++;
      const rag = slaRag(a.pct);
      rags.push(rag);
      if (rag === 'amber' || rag === 'red') problems.push({ key: m.key, label: m.label, pct: a.pct, rag });
    });
    problems.sort((a, b) => a.pct - b.pct);
    const ongoing = (res.breaches || []).filter(b => b.ongoing).length;
    const rag = _slaWorstRag(rags);
    rows.push({
      projectId: String(p.id), name: p.CustomerName || `Project ${p.id}`, rag,
      ongoingBreaches: ongoing, problems, summary: _slaProjectSummary(rag, problems, ongoing),
      metrics: rowMetrics,   // N-385: all four metrics, for the roll-up table
    });
  });
  const order = { red: 0, amber: 1, green: 2, grey: 3 };
  rows.sort((a, b) => (order[a.rag] - order[b.rag]) || (b.ongoingBreaches - a.ongoingBreaches) || a.name.localeCompare(b.name));
  const counts = { green: 0, amber: 0, red: 0, grey: 0 };
  rows.forEach(r => { counts[r.rag]++; });
  const metrics = CONFIG.SLA.METRICS.map(m => {
    const pool = pools[m.key];
    const pct = pool.met + pool.breached ? Math.round(pool.met / (pool.met + pool.breached) * 100) : null;
    return {
      key: m.key, label: m.label, unit: m.unit, noun: m.key === SLA_WEEKLY_METRIC_KEY ? 'weeks' : 'hires',
      met: pool.met, breached: pool.breached, pending: pool.pending, pct, rag: slaRag(pct), rated: pool.rated,
    };
  });
  return { period, counts, metrics, rows };
}

// ── SLA roll-up (N-385 / DA-5) ────────────────────────────────────────
// The portfolio table on the Command Centre (Project Health detail) and in Report Builder
// (company scope). Fixed period CONFIG.SLA.ROLLUP_PERIOD. Pure; the reads are
// getSlaRollupInputs() (api.js), the markup is sla-rollup.js.

// The projects that can appear. projectIds = getUserProjectIds() (null = every project, else an
// array of ids). Active, client projects only. SLA eligibility by type is decided later:
// computeProjectSla gives null for LCI / Transformation / Internal and slaPortfolioModel skips those.
function slaRollupProjects({ projects, projectIds } = {}) {
  const ids = Array.isArray(projectIds) ? new Set(projectIds.map(String)) : null;
  return (projects || []).filter(p => p
    && isProjectActive(p)
    && !isKpiExcludedProject(p)
    && (!ids || ids.has(String(p.id))));
}

// computeProjectSla for each project, keyed by String(project id). Roles, activity, placements
// and the rest are passed whole: computeProjectSla scopes them per project.
function slaProjectResults({ projects, slaRows, roles, headcount, placements, stageRows, activity, rejectedOffers, today = new Date() } = {}) {
  const results = {};
  (projects || []).forEach(p => {
    results[String(p.id)] = computeProjectSla({ project: p, slaRows, roles, headcount, placements, stageRows, activity, rejectedOffers, today });
  });
  return results;
}

// slaPortfolioModel over the fixed roll-up period. One owner for that period.
function slaRollupModel({ projects, results, today = new Date() } = {}) {
  return slaPortfolioModel({ projects, results, periodKey: CONFIG.SLA.ROLLUP_PERIOD, today });
}
