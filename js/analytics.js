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
