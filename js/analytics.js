// js/analytics.js — pure analytics functions, no network I/O
// Loaded after api.js, before module app scripts.

// ── Phase A — Time-to-Fill Prediction ────────────────────────────────

/**
 * Predicts TTF for an active role from 12-month placement history.
 * @param {string} functionArea  - e.g. 'Engineering' (mapped from Department)
 * @param {string} country       - e.g. 'Croatia' (mapped from Currency)
 * @param {Array}  historical    - result of getHistoricalPlacements()
 * @returns {Object} { label, weeks, stdDevWeeks, sampleSize }
 */
function computeTTFPrediction(functionArea, country, historical) {
  const ttfDays = r => Math.round(
    (new Date(r.placementDate) - new Date(r.openDate)) / (1000 * 60 * 60 * 24)
  );

  const valid = historical.filter(r => r.openDate && r.placementDate);

  // Segment: type + country first, fall back to type only
  let pool = valid.filter(r =>
    r.functionArea === functionArea && r.country === country
  );
  if (pool.length < 3) {
    pool = valid.filter(r => r.functionArea === functionArea);
  }

  if (pool.length < 3) {
    return { label: 'Insufficient data', weeks: null, stdDevWeeks: null, sampleSize: pool.length };
  }

// ── Phase B — Funnel Drop-off Analysis ───────────────────────────────

/**
 * Computes funnel conversion rates for a single role's activity totals.
 * @param {Object} totals     - summed activity fields for this role
 * @param {Object} benchmarks - CONFIG.ANALYTICS_BENCHMARKS
 * @returns {Array} funnel stages with rag status
 */
function computeRoleFunnel(totals, benchmarks) {
  const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : null;

  const rag = (actual, bench) => {
    if (actual === null) return 'grey';
    if (actual >= bench * 100)                             return 'green';
    if (actual >= bench * 100 * benchmarks.flagThreshold)  return 'amber';
    return 'red';
  };

  return [
    {
      stage:       'Response',
      conv:        pct(totals.Responses, totals.Outreach),
      benchmarked: true,
      rag:         rag(pct(totals.Responses, totals.Outreach), benchmarks.outreachConversion),
    },
    {
      stage:       'IV1 Conv.',
      conv:        pct(totals.Interview1, totals.Submitted),
      benchmarked: true,
      rag:         rag(pct(totals.Interview1, totals.Submitted), benchmarks.submissionConversion),
    },
    {
      stage:       'IV→Offer',
      conv:        pct(totals.Offers, totals.Interview1),
      benchmarked: true,
      rag:         rag(pct(totals.Offers, totals.Interview1), benchmarks.interviewToOffer),
    },
    {
      stage:       'Offer Success',
      conv:        pct(totals.Hires, totals.Offers),
      benchmarked: true,
      rag:         rag(pct(totals.Hires, totals.Offers), benchmarks.offerSuccess),
    },
  ];
}
  
  // Use most recent 12
  const sample = pool
    .slice()
    .sort((a, b) => new Date(b.placementDate) - new Date(a.placementDate))
    .slice(0, 12);

  const days = sample.map(ttfDays);
  const mean = days.reduce((s, d) => s + d, 0) / days.length;
  const variance = days.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / days.length;
  const stdDev = Math.sqrt(variance);

  const weeks     = Math.round(mean / 7);
  const bandDays  = Math.max(stdDev, 7);
  const bandWeeks = Math.round(bandDays / 7);

  return {
    label:       `~${weeks}w ±${bandWeeks}w (n=${sample.length})`,
    weeks,
    stdDevWeeks: bandWeeks,
    sampleSize:  sample.length,
  };
}
