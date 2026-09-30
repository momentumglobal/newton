// js/analytics.js — pure analytics functions, no network I/O
// Loaded after api.js, before module app scripts.

// ── Phase A — Time-to-Fill Prediction (N-269: survival-based) ────────
// Kaplan–Meier estimate of time from OpenDate to hire. Completed hires are
// events; roles still open (TTF_CENSORED_STAGES) are right-censored at their
// current age. Averaging completed hires alone ignores the slow roles that
// haven't filled yet and so under-states time to fill (survivorship bias) —
// counting open roles as "at least this long so far" removes that.
// Pool ladder: the filters as given (function × location), then — only when
// a country was given and it has < CONFIG.TTF_SURVIVAL.minEvents hires —
// the same function across all locations. Falsy functionArea/country means
// "no filter on that dimension" (Placement Analytics' "All" options).

// Stages whose roles are still open and so count as censored observations.
// Derived, not a second list. Backlog/Planning never started the clock;
// On-hold/Cancelled are excluded until N-272's cancellation audit; Hired
// roles are events (via `historical`), not censored.
// NOT ACTIVE_STAGES (which lists the closed/dormant stages) or STAGE_ORDER
// (a 4-stage subset built only for isRoleFlagged).
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

function computeTTFPrediction(functionArea, country, historical, openRoles = []) {
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
    const basis = fn && loc ? 'function+location' : fn ? 'function' : loc ? 'location' : 'all';
    return { obs: events.concat(censored), events: events.length, censored: censored.length, basis };
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
      basis: null, pooled: false, medianReached: false, maxObservedDays: null,
    };
  }

  const curve           = kaplanMeier(pool.obs);
  const medianDays      = kmQuantile(curve, 0.5);
  const maxObservedDays = Math.max(...pool.obs.map(o => o.t));
  const base = {
    sampleSize: pool.events, events: pool.events, censored: pool.censored,
    basis: pool.basis, pooled, maxObservedDays,
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
// ('functionArea', 'country'). The roles passed ARE the learning population.
function funnelRoleIndex(roles, fnKey, locKey) {
  const index = new Map();
  (roles || []).forEach(r => {
    if (r && r.id != null) index.set(String(r.id), { fn: r[fnKey] || '', loc: r[locKey] || '' });
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
// without `meta` (plain CONFIG) reads as the company target.
function learnedBenchmarkTip(benchmarks, key) {
  const pctText = x => `${Math.round(x * 100)}%`;
  const b = benchmarks || {};
  const m = b.meta && b.meta[key];
  if (!m) return `Benchmark ${pctText(b[key])} · company target`;
  const nText  = Number(m.n).toLocaleString('en-GB');
  const target = `${pctText(m.prior)} target`;
  let tip;
  if (m.basis === 'mix') {
    tip = `Benchmark ${pctText(m.value)} · weighted across ${m.cells} function × location mix${m.cells !== 1 ? 'es' : ''} this TP works in (${m.n > 0 ? `n=${nText}` : 'no direct peers yet'})`;
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
//
// `allActivityForRoles` (N-114) is the project's FULL-HISTORY WeeklyActivity
// rows for its roles — NOT `weekActivity`, which is already windowed to the
// snapshot's single week. isRoleFlagged() needs a role's entire activity
// history to evaluate correctly (same pattern as cc-pages.js:ccHealthStats()),
// so flaggedCount would be silently wrong if passed the windowed set instead.
function computeSnapshotMetrics(roles, weekActivity, weekPlacements, allActivityForRoles = []) {
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

  const flaggedCount = openRoleSet.filter(r => {
    const acts = allActivityForRoles.filter(a => String(a.RoleIDLookupId) === String(r.id));
    return isRoleFlagged(r, acts);
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
