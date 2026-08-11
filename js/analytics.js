// js/analytics.js — pure analytics functions, no network I/O
// Loaded after api.js, before module app scripts.

// ── Phase A — Time-to-Fill Prediction ────────────────────────────────

function computeTTFPrediction(functionArea, country, historical) {
  const ttfDays = r => Math.round(
    (new Date(r.placementDate) - new Date(r.openDate)) / (1000 * 60 * 60 * 24)
  );
  const valid = historical.filter(r => r.openDate && r.placementDate);

  let pool = valid.filter(r =>
    r.functionArea === functionArea && r.country === country
  );
  
  if (pool.length < 3) {
    return { label: 'Insufficient data', weeks: null, stdDevWeeks: null, sampleSize: pool.length };
  }

  const sample = pool
    .slice()
    .sort((a, b) => new Date(b.placementDate) - new Date(a.placementDate))
    .slice(0, 12);

  const days     = sample.map(ttfDays);
  const mean     = days.reduce((s, d) => s + d, 0) / days.length;
  const variance = days.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / days.length;
  const stdDev   = Math.sqrt(variance);
  const weeks     = Math.round(mean / 7);
  const bandDays  = Math.max(stdDev, 7);
  const bandWeeks = Math.round(bandDays / 7);

  return {
    label:       `~${weeks}w ±${bandWeeks}w`,
    weeks,
    stdDevWeeks: bandWeeks,
    sampleSize:  sample.length,
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

function computeVelocityScore(tpEmail, activity, placements, benchmarks) {
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
  const hir  = sumField(activity, 'Hires');

  const ttfValues = placements
    .filter(r => r.openDate && r.placementDate)
    .map(r => Math.round(
      (new Date(r.placementDate) - new Date(r.openDate)) / (1000 * 60 * 60 * 24)
    ));
  const avgTTF = ttfValues.length
    ? Math.round(ttfValues.reduce((a, b) => a + b, 0) / ttfValues.length)
    : null;

  return {
    tpEmail,
    window: '13 weeks',
    metrics: [
      { label: 'Outreach conversion',   value: pct(resp, out), unit: '%',     rag: rag(pct(resp, out),  benchmarks.outreachConversion) },
      { label: 'Submission conversion', value: pct(iv1, sub),  unit: '%',     rag: rag(pct(iv1, sub),   benchmarks.submissionConversion) },
      { label: 'Interview-to-offer',    value: iv1 > 0 && off > 0 ? +(iv1 / off).toFixed(1) : null, unit: ':1', rag: iv1 > 0 && off > 0 ? (iv1 / off <= 7 ? 'green' : iv1 / off <= 10 ? 'amber' : 'red') : 'grey' },
      { label: 'Offer success',         value: pct(hir, off),  unit: '%',     rag: rag(pct(hir, off),   benchmarks.offerSuccess) },
      { label: 'Hires',                 value: hir,            unit: 'hires', rag: 'grey', informational: true },
      { label: 'Avg time to hire',      value: avgTTF,         unit: 'days',  rag: rag(avgTTF,          benchmarks.timeToHireDays, true) },
    ],
  };
}

// ── Role flag helpers (shared by cc-pages.js and analytics-pages.js) ──
const ACTIVE_STAGES = ['Placed', 'Closed', 'Hired', 'Backlog', 'Cancelled', 'On-hold'];
const STAGE_ORDER   = ['Sourcing', 'Interview 1', 'Interview 2+', 'Final Interview'];
// Stages that block linking a live role to a Hiring Plan row. Narrower than
// ACTIVE_STAGES: a Backlog role is dormant for velocity metrics but is exactly
// what a plan row tracks, so it stays linkable. Derived — not a second list.
const PLAN_LINKABLE_EXCLUDED_STAGES = ACTIVE_STAGES.filter(s => s !== 'Backlog');

function isRoleFlagged(role, activity) {
  const today = new Date();
  const days = role.OpenDate ? Math.floor((today - new Date(role.OpenDate)) / 86400000) : 0;
  const idx  = STAGE_ORDER.indexOf(role.Stage);
  if (days >= 15 && idx < 0) return true;
  if (days >= 25 && idx < 1) return true;
  if (days >= 35 && idx < 2) return true;
  if (days >= 40 && idx < 3) return true;
  const submitted = sumField(activity, 'Submitted');
  const iv1       = sumField(activity, 'Interview1');
  if (submitted > 0 && (iv1 / submitted) < 0.50) return true;
  return false;
}

// ── Time-series snapshots (N-085 / L-1a) ───────────────────────────────
// Pure aggregation for one project's weekly Snapshots row.
// `roles` = that project's full role set (any stage).
// `weekActivity` / `weekPlacements` = already filtered by the caller to
// the snapshot's week window (WeeklyActivity by WeekEndingDate equality,
// Placements by OfferAcceptedDate range).
//
// CONTRACT: openRoles / avgDaysOpen MUST derive from ACTIVE_STAGES, not
// any other "active stage" list in the codebase (dashboard-core.js's
// avgDaysOpen() and the KPI-strip openRoles count use a different,
// narrower, undocumented local array — do not copy that here). N-086's
// flow reimplements this same "open role" definition and cannot read this
// file, so this function is the one place the contract is authoritative
// from — keep it that way.
//
// RolesByStage deliberately excludes 'Hired' and 'Cancelled' (N-111).
// Both are terminal — a role never leaves them once it lands there — so
// their counts only ever grow, unlike every other stage here, which
// reflects roles genuinely still in flight and can rise or fall week to
// week. Left in, they'd eventually swamp the stages this field exists to
// show. Cumulative hires-to-date isn't tracked here either — sum
// PlacementsInPeriod across a project's Snapshots rows for that instead.
function computeSnapshotMetrics(roles, weekActivity, weekPlacements) {
  const openRoleSet = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage));

  const rolesByStage = roles.reduce((acc, r) => {
    if (r.Stage === 'Hired' || r.Stage === 'Cancelled') return acc;
    acc[r.Stage] = (acc[r.Stage] || 0) + 1;
    return acc;
  }, {});

  const openWithDate = openRoleSet.filter(r => r.OpenDate);
  const avgDaysOpen = openWithDate.length
    ? Math.round(openWithDate.reduce((s, r) => s + daysOpen(r.OpenDate), 0) / openWithDate.length)
    : null;

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
    placementsInPeriod: weekPlacements.length,
    activityTotals,
  };
}
