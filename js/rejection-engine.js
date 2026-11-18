// js/rejection-engine.js — Rejection Intelligence engine and view model (N-387 / N-388).
// Pure: no Graph, no DOM. Split out of analytics.js (N-473). Needs sla-targets.js (_slaRowRoleId)
// and analytics.js (buildFunnelObservations, funnelRoleIndex).
// Loaded after sla-targets.js on reporting.html and market-reporting.html.

// ── Rejection Intelligence engine (N-387 / DA-7) ──────────────────────
// Pure: no Graph, no DOM. Why are we losing candidates? Offer rejections
// clustered by project / location / discipline / reason, offers against the LCI
// salary benchmark, and WeeklyActivity funnel pass-through by the same
// dimensions. Every headline claim is gated by CONFIG.REJECTION_INTEL minimums.
// Decisions (Chris, 26 Oct 2026):
//  - Benchmark match = country + currency + exact title. Role.Location is a
//    COUNTRY_CURRENCY key; LCIModels.Location is free text ("Bucharest, Romania"),
//    so the country is read from that text. lciBenchmark() (lci-model.js, sales
//    only) matches the exact location text and is deliberately NOT reused.
//  - The offer's currency = COUNTRY_CURRENCY[role.Location] (as
//    budgetVsSpendByCurrency). No FX: a benchmark in another currency never matches.
//  - DMs see the % gap only. Money fields appear ONLY with includeFigures: true
//    (Admin / Leadership); the default is false. Candidate names and Notes never
//    leave this block.
// Callers window the inputs (activitySinceWeeks for WeeklyActivity,
// rejectionInPeriod for RejectedOffers) and apply DA-D11 scoping and
// excludeInternalProjectData (N-388).

const REJECTION_UNCLASSIFIED = 'Unclassified';
const REJECTION_DIMS = ['project', 'location', 'discipline', 'reason'];
// Funnel pass-through steps. from / to are display labels (stage names where
// one exists); num / den are WeeklyActivity count fields (buildFunnelObservations);
// prior = the ANALYTICS_BENCHMARKS rate(s) whose product is the step's company prior.
const REJECTION_FUNNEL_STEPS = [
  { from: 'Submitted',   to: 'Interview 1', num: 'Interview1', den: 'Submitted',  prior: ['submissionConversion'] },
  { from: 'Interview 1', to: 'Offer',       num: 'Offers',     den: 'Interview1', prior: ['interviewToOffer'] },
  { from: 'Submitted',   to: 'Offer',       num: 'Offers',     den: 'Submitted',  prior: ['submissionConversion', 'interviewToOffer'] },
];

// Throws on a broken CONFIG.REJECTION_REASONS / REJECTION_INTEL. Run at load.
function rejectionIntelConfigCheck(cfg = { reasons: CONFIG.REJECTION_REASONS, intel: CONFIG.REJECTION_INTEL }) {
  const reasons = cfg && cfg.reasons;
  const intel   = cfg && cfg.intel;
  if (!Array.isArray(reasons) || reasons.length !== 5 ||
      reasons.some(r => typeof r !== 'string' || !r.trim()) ||
      new Set(reasons).size !== reasons.length) {
    throw new Error('REJECTION_REASONS must be 5 unique non-empty strings');
  }
  if (reasons.includes(REJECTION_UNCLASSIFIED)) throw new Error(`REJECTION_REASONS must not contain "${REJECTION_UNCLASSIFIED}"`);
  if (!intel) throw new Error('REJECTION_INTEL missing');
  ['minRejections', 'minMatchedOffers', 'minBenchmarkN', 'minFunnelDen'].forEach(k => {
    if (!Number.isInteger(intel[k]) || intel[k] < 1) throw new Error(`REJECTION_INTEL.${k} must be an integer >= 1`);
  });
  const pr = intel.plausibleRatio;
  if (!pr || !(typeof pr.min === 'number' && typeof pr.max === 'number' && pr.min > 0 && pr.min < 1 && pr.max > 1)) {
    throw new Error('REJECTION_INTEL.plausibleRatio must satisfy 0 < min < 1 < max');
  }
  Object.entries(intel.countryAliases || {}).forEach(([k, v]) => {
    if (k !== k.toLowerCase()) throw new Error(`REJECTION_INTEL.countryAliases: key "${k}" must be lower-case`);
    if (!Object.prototype.hasOwnProperty.call(CONFIG.COUNTRY_CURRENCY, v)) throw new Error(`REJECTION_INTEL.countryAliases: "${v}" is not a COUNTRY_CURRENCY key`);
  });
  REJECTION_FUNNEL_STEPS.forEach(s => s.prior.forEach(p => {
    if (typeof CONFIG.ANALYTICS_BENCHMARKS[p] !== 'number') throw new Error(`Rejection funnel: ANALYTICS_BENCHMARKS.${p} missing`);
  }));
  // Step labels are stage names, except the 'Offer' outcome (Offers count, not the Offered stage).
  REJECTION_FUNNEL_STEPS.forEach(s => [s.from, s.to].forEach(l => {
    if (l !== 'Offer' && !CONFIG.ROLE_STAGES.includes(l)) throw new Error(`Rejection funnel: "${l}" is not a ROLE_STAGES value`);
  }));
  return true;
}
rejectionIntelConfigCheck();

// Is a RejectedOffers row in [start, end]? start / end = getDetailPeriodRange()
// Dates. Moved from renderRejectionPanel (N-153 rule): a blank RejectionDate
// stays always-included, by decision — the two pre-N-153 rows were not
// backfilled, and excluding them would silently drop real rejections.
function rejectionInPeriod(rej, start, end) {
  if (!rej) return false;
  if (!rej.RejectionDate) return true;
  // isoDate() stores T12:00:00Z — that midday anchor is what makes a plain
  // new Date() safe against these LOCAL period bounds. Do NOT switch to
  // utcDateOnly: UTC midnight against a local 23:59:59 end loses the last
  // day of every period in BST.
  const d = new Date(rej.RejectionDate);
  return d >= start && d <= end;
}

// A typed salary as a finite number > 0, else null. Commas and whitespace are
// stripped, then Number() — deliberately NOT parseFloat (formatSalary's rule):
// parseFloat('45k') is 45, which would read as "99% below benchmark".
function parseSalaryAmount(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Trimmed, lower-cased, inner whitespace collapsed. '' for blank.
function _rejTitleKey(t) {
  return String(t == null ? '' : t).trim().replace(/\s+/g, ' ').toLowerCase();
}

// Free-text location ("Bucharest, Romania") → COUNTRY_CURRENCY key, or null.
// Comma segments are walked last → first; each is compared whole (trimmed,
// case-insensitive) to the keys, then to CONFIG.REJECTION_INTEL.countryAliases.
// No substring matching: "Northern Ireland" must never read as Ireland.
function countryFromLocationText(text) {
  if (text === null || text === undefined) return null;
  const keys = new Map(Object.keys(CONFIG.COUNTRY_CURRENCY).map(k => [k.toLowerCase(), k]));
  const aliases = CONFIG.REJECTION_INTEL.countryAliases || {};
  const segs = String(text).split(',').map(s => s.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    if (keys.has(segs[i])) return keys.get(segs[i]);
    if (Object.prototype.hasOwnProperty.call(aliases, segs[i])) return aliases[segs[i]];
  }
  return null;
}

// LCI CoE rows → [{ modelId, title, country, ccy, salary }]. A row qualifies
// when RowType is 'coe', it has a title and a salary, and its model resolves a
// country and a LocalCurrency. Every model counts, whatever its Status
// (lciBenchmark's population rule). Built once per page load by the caller.
function buildOfferBenchmarkIndex(models, lciRows) {
  const byId = new Map((models || []).filter(Boolean).map(m => [String(m.id), m]));
  const out = [];
  (lciRows || []).forEach(r => {
    if (!r || r.RowType !== 'coe') return;
    const salary = parseSalaryAmount(r.AnnualSalary);
    const title  = _rejTitleKey(r.Title);
    const model  = byId.get(String(r.ModelIDLookupId));
    if (salary === null || !title || !model) return;
    const country = countryFromLocationText(model.Location);
    const ccy     = String(model.LocalCurrency || '').trim();
    if (!country || !ccy) return;
    out.push({ modelId: String(model.id), title, country, ccy, salary });
  });
  return out;
}

// { median, n, min, max } for an exact title + country + currency, or null.
// Same shape and rounding as lciBenchmark.
function offerBenchmarkFor(index, title, country, ccy) {
  const t = _rejTitleKey(title);
  if (!t || !country || !ccy) return null;
  const vals = (index || [])
    .filter(b => b.title === t && b.country === country && b.ccy === ccy)
    .map(b => b.salary)
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  return { median: Math.round(medianOf(vals)), n: vals.length, min: vals[0], max: vals[vals.length - 1] };
}

const _rej4dp = x => Math.round(x * 1e4) / 1e4;

// One fact per rejection whose role resolves → { facts, unlinked }. A fact never
// carries the candidate (Title / CandidateName) or Notes. salaryStatus, in
// precedence order: noOffer, noCurrency, noBenchmark, thinBenchmark,
// implausible, matched.
function buildRejectionFacts(rejections, roles, benchIndex) {
  const cfg = CONFIG.REJECTION_INTEL;
  const roleById = new Map((roles || []).filter(Boolean).map(r => [String(r.id), r]));
  const facts = [];
  let unlinked = 0;
  (rejections || []).forEach(rej => {
    if (!rej) return;
    const rid  = _slaRowRoleId(rej);
    const role = rid === null ? null : roleById.get(String(rid));
    if (!role) { unlinked++; return; }
    const location = role.Location || '';
    const ccy   = CONFIG.COUNTRY_CURRENCY[location] || null;
    const offer = parseSalaryAmount(rej.SalaryOffered);
    const bench = ccy ? offerBenchmarkFor(benchIndex, role.RoleTitle, location, ccy) : null;
    let salaryStatus, gapPct = null;
    if (offer === null)                   salaryStatus = 'noOffer';
    else if (!ccy)                        salaryStatus = 'noCurrency';
    else if (!bench)                      salaryStatus = 'noBenchmark';
    else if (bench.n < cfg.minBenchmarkN) salaryStatus = 'thinBenchmark';
    else {
      const ratio = offer / bench.median;
      if (ratio < cfg.plausibleRatio.min || ratio > cfg.plausibleRatio.max) salaryStatus = 'implausible';
      else { salaryStatus = 'matched'; gapPct = _rej4dp(ratio - 1); }
    }
    facts.push({
      rejectionId: rej.id != null ? String(rej.id) : null,
      roleId:      String(rid),
      projectId:   projectIdForRole(role),
      location,
      discipline:  role.Department || '',
      reason:      CONFIG.REJECTION_REASONS.includes(rej.RejectionReason) ? rej.RejectionReason : REJECTION_UNCLASSIFIED,
      day:         rej.RejectionDate ? spDateIn(rej.RejectionDate) : null,
      ccy, offer, bench, gapPct, salaryStatus,
    });
  });
  return { facts, unlinked };
}

function _rejDimKey(fact, dim) {
  if (dim === 'project')    return fact.projectId == null ? '' : String(fact.projectId);
  if (dim === 'location')   return fact.location || '';
  if (dim === 'discipline') return fact.discipline || '';
  return fact.reason;
}

// facts → { dim, clusters, totals }. `facts` is buildRejectionFacts(...).facts;
// opts.unlinked carries its count into totals. Money (offerMedian / benchMedian /
// ccy) only with opts.includeFigures === true, and only for a single-currency
// cluster (else both null and mixedCurrency: true).
function clusterRejections(facts, dim, opts = {}) {
  if (!REJECTION_DIMS.includes(dim)) throw new Error(`clusterRejections: unknown dim "${dim}"`);
  const cfg = CONFIG.REJECTION_INTEL;
  const reasonKeys = CONFIG.REJECTION_REASONS.concat([REJECTION_UNCLASSIFIED]);
  const groups = new Map();
  (facts || []).forEach(f => {
    const k = _rejDimKey(f, dim);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  });
  const clusters = [...groups.entries()].map(([key, fs]) => {
    const reasons = {};
    reasonKeys.forEach(r => { reasons[r] = 0; });
    fs.forEach(f => { reasons[f.reason]++; });
    let topReason = null;
    reasonKeys.forEach(r => { if (reasons[r] > 0 && (topReason === null || reasons[r] > reasons[topReason])) topReason = r; });
    const statuses = { noOffer: 0, noCurrency: 0, noBenchmark: 0, thinBenchmark: 0, implausible: 0 };
    const matched = fs.filter(f => f.salaryStatus === 'matched');
    fs.forEach(f => { if (f.salaryStatus !== 'matched') statuses[f.salaryStatus]++; });
    const gap = medianOf(matched.map(f => f.gapPct));
    const salary = {
      matched: matched.length,
      gapMedianPct: gap === null ? null : _rej4dp(gap),
      claim: matched.length >= cfg.minMatchedOffers,
      statuses,
    };
    if (opts.includeFigures === true) {
      const ccys = new Set(matched.map(f => f.ccy));
      if (ccys.size === 1) {
        salary.ccy = [...ccys][0];
        salary.offerMedian = medianOf(matched.map(f => f.offer));
        salary.benchMedian = medianOf(matched.map(f => f.bench.median));
        salary.mixedCurrency = false;
      } else {
        salary.ccy = null; salary.offerMedian = null; salary.benchMedian = null;
        salary.mixedCurrency = ccys.size > 1;
      }
    }
    return {
      key, n: fs.length, claim: fs.length >= cfg.minRejections,
      reasons, topReason,
      topShare: topReason === null ? null : _rej4dp(reasons[topReason] / fs.length),
      salary,
    };
  }).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  const all = facts || [];
  return {
    dim, clusters,
    totals: { n: all.length, unlinked: opts.unlinked || 0, matched: all.filter(f => f.salaryStatus === 'matched').length },
  };
}

// WeeklyActivity (caller-windowed) → { dim, rows } of Submitted → Interview 1 →
// Offer pass-through per project / location / discipline. Numerators are
// clamped per (role, TP) observation, as learnFunnelBenchmarks. priorRate = the
// company ANALYTICS_BENCHMARKS rate (read only, never written). claim = den >=
// minFunnelDen. worstStep = index of the claimable step with the lowest
// rate / priorRate, or null.
function rejectionFunnel(activity, roles, dim) {
  if (dim === 'reason' || !REJECTION_DIMS.includes(dim)) throw new Error(`rejectionFunnel: unsupported dim "${dim}"`);
  const cfg = CONFIG.REJECTION_INTEL;
  const roleById = new Map((roles || []).filter(Boolean).map(r => [String(r.id), r]));
  const obs = buildFunnelObservations(activity, funnelRoleIndex(roles, 'Department', 'Location'));
  const groups = new Map();
  obs.forEach(o => {
    const key = dim === 'project'
      ? String(projectIdForRole(roleById.get(o.roleId)) ?? '')
      : (dim === 'location' ? o.loc : o.fn) || '';
    let g = groups.get(key);
    if (!g) {
      g = { key, submitted: 0, interview: 0, offers: 0, nums: REJECTION_FUNNEL_STEPS.map(() => 0), dens: REJECTION_FUNNEL_STEPS.map(() => 0) };
      groups.set(key, g);
    }
    g.submitted += o.c.Submitted; g.interview += o.c.Interview1; g.offers += o.c.Offers;
    REJECTION_FUNNEL_STEPS.forEach((s, i) => {
      g.nums[i] += Math.min(o.c[s.num], o.c[s.den]);
      g.dens[i] += o.c[s.den];
    });
  });
  const rows = [...groups.values()].map(g => {
    const steps = REJECTION_FUNNEL_STEPS.map((s, i) => ({
      from: s.from, to: s.to, num: g.nums[i], den: g.dens[i],
      rate: g.dens[i] > 0 ? g.nums[i] / g.dens[i] : null,
      priorRate: s.prior.reduce((p, k) => p * CONFIG.ANALYTICS_BENCHMARKS[k], 1),
      claim: g.dens[i] >= cfg.minFunnelDen,
    }));
    let worstStep = null;
    steps.forEach((s, i) => {
      if (!s.claim || s.rate === null) return;
      if (worstStep === null || s.rate / s.priorRate < steps[worstStep].rate / steps[worstStep].priorRate) worstStep = i;
    });
    return { key: g.key, submitted: g.submitted, interview: g.interview, offers: g.offers, steps, worstStep };
  }).sort((a, b) => b.submitted - a.submitted || a.key.localeCompare(b.key));
  return { dim, rows };
}

// The one entry point N-388 calls. Inputs are already windowed and scoped by the
// caller. The per-rejection facts are NOT returned (they carry offer amounts).
function rejectionIntelSummary({ rejections, roles, activity, models, lciRows, includeFigures = false } = {}) {
  const index = buildOfferBenchmarkIndex(models, lciRows);
  const { facts, unlinked } = buildRejectionFacts(rejections, roles, index);
  const opts = { includeFigures: includeFigures === true, unlinked };
  const byProject    = clusterRejections(facts, 'project', opts);
  return {
    byProject,
    byLocation:         clusterRejections(facts, 'location', opts),
    byDiscipline:       clusterRejections(facts, 'discipline', opts),
    byReason:           clusterRejections(facts, 'reason', opts),
    funnelByProject:    rejectionFunnel(activity, roles, 'project'),
    funnelByLocation:   rejectionFunnel(activity, roles, 'location'),
    funnelByDiscipline: rejectionFunnel(activity, roles, 'discipline'),
    totals: byProject.totals,
  };
}

// ── Rejection Intelligence view model (N-388 / DA-8) ──────────────────
// Page, strip and report shapes over the N-387 engine output. Pure: no Graph, no DOM. Every
// sentence, ordering rule and sample guard is decided here (rejection-intel.js only prints), and
// money fields reach a model only when the caller passed includeFigures, so a DM's model has no
// amounts to leak. Thresholds and reasons come from CONFIG.REJECTION_INTEL / REJECTION_REASONS.
const REJECTION_INTEL_DIMS = {
  project:    { cluster: 'byProject',    funnel: 'funnelByProject',    label: 'Project',    blank: 'No project' },
  location:   { cluster: 'byLocation',   funnel: 'funnelByLocation',   label: 'Location',   blank: 'No location' },
  discipline: { cluster: 'byDiscipline', funnel: 'funnelByDiscipline', label: 'Discipline', blank: 'No department' },
};

// 0.1234 -> 12 (whole per cent for display; raw engine floats are never shown). null stays null.
function _rejectionPct(x) {
  return (x === null || x === undefined || !isFinite(x)) ? null : Math.round(x * 100);
}

// "12% below benchmark" / "8% above benchmark" / "in line with benchmark", or null unless the
// cluster's salary claim holds. salary = a cluster's `salary` object from clusterRejections().
function rejectionGapText(salary) {
  if (!salary || !salary.claim || salary.gapMedianPct === null || salary.gapMedianPct === undefined) return null;
  const pct = Math.round(Math.abs(salary.gapMedianPct) * 100);
  if (pct === 0) return { text: 'in line with benchmark', direction: 'level', pct: 0 };
  const below = salary.gapMedianPct < 0;
  return { text: pct + '% ' + (below ? 'below' : 'above') + ' benchmark', direction: below ? 'below' : 'above', pct: pct };
}

// Amounts, only for a caller that passed includeFigures AND only when the salary claim holds.
// A cluster mixing currencies has no single median: figures null, mixedCurrency true.
function _rejectionFigures(salary, includeFigures) {
  const none = { figures: null, mixedCurrency: false };
  if (!includeFigures || !salary || !salary.claim) return none;
  if (salary.mixedCurrency) return { figures: null, mixedCurrency: true };
  if (salary.offerMedian === null || salary.offerMedian === undefined || salary.benchMedian === null || salary.benchMedian === undefined) return none;
  return { figures: { ccy: salary.ccy || '', offerMedian: salary.offerMedian, benchMedian: salary.benchMedian, matched: salary.matched }, mixedCurrency: false };
}

function _rejectionLabel(dim, key, projectNames) {
  if (key === '' || key === null || key === undefined) return REJECTION_INTEL_DIMS[dim].blank;
  if (dim === 'project') return projectNames[String(key)] || ('Project ' + key);
  return String(key);
}

function _rejectionProjectNames(projects) {
  const out = {};
  (projects || []).forEach(p => { if (p) out[String(p.id)] = p.CustomerName || p.Title || ''; });
  Object.keys(out).forEach(k => { if (!out[k]) delete out[k]; });
  return out;
}

// One funnel step for display. Unclaimed steps carry no rate (the cell prints a dash).
function _rejectionStepView(s) {
  return { from: s.from, to: s.to, den: s.den, claim: !!s.claim, ratePct: s.claim ? _rejectionPct(s.rate) : null, priorPct: _rejectionPct(s.priorRate) };
}

// The Rejection Intelligence tab / report model for one dimension. summary = rejectionIntelSummary().
function rejectionIntelPageModel({ summary, projects, dim, includeFigures, benchmarkUnavailable, weeks } = {}) {
  const D = REJECTION_INTEL_DIMS[dim];
  if (!D) throw new Error('rejectionIntelPageModel: dim must be project, location or discipline');
  const s = summary || {};
  const names = _rejectionProjectNames(projects);
  const unavailable = benchmarkUnavailable === true;
  const withFigures = includeFigures === true;
  const totals = Object.assign({ n: 0, unlinked: 0, matched: 0 }, s.totals || {});

  // Reasons: every reason (config order) plus any extra the engine emits, zeros kept.
  const byReason = (s.byReason && s.byReason.clusters) || [];
  const counts = {};
  byReason.forEach(c => { counts[c.key] = c.n; });
  const firstProject = ((s.byProject && s.byProject.clusters) || [])[0];
  const keys = firstProject ? Object.keys(firstProject.reasons) : CONFIG.REJECTION_REASONS.slice();
  const reasonsClaim = totals.n >= CONFIG.REJECTION_INTEL.minRejections;
  const reasons = keys.map(k => {
    const n = counts[k] || 0;
    return { reason: k, n: n, sharePct: reasonsClaim && totals.n > 0 ? _rejectionPct(n / totals.n) : null };
  });

  const clusters = (((s[D.cluster] || {}).clusters) || []).map(c => {
    const claim = !!c.claim;
    const gap = unavailable ? null : rejectionGapText(c.salary);
    const fig = unavailable ? { figures: null, mixedCurrency: false } : _rejectionFigures(c.salary, withFigures);
    return {
      key: c.key, label: _rejectionLabel(dim, c.key, names), n: c.n, claim: claim,
      topReason: claim ? c.topReason : null, topSharePct: claim ? _rejectionPct(c.topShare) : null,
      gap: gap, figures: fig.figures, mixedCurrency: fig.mixedCurrency,
    };
  });

  const funnelRows = (((s[D.funnel] || {}).rows) || []).map(r => {
    const worst = r.worstStep === null || r.worstStep === undefined ? null : r.steps[r.worstStep];
    return {
      key: r.key, label: _rejectionLabel(dim, r.key, names), submitted: r.submitted,
      steps: r.steps.map(_rejectionStepView),
      worst: worst ? { from: worst.from, to: worst.to } : null,
    };
  });
  const firstFunnel = funnelRows[0];

  const weeksN = Number(weeks) || 0;
  return {
    dim: dim, dimLabel: D.label, weeks: weeksN,
    periodNote: weeksN ? ('Last ' + weeksN + ' weeks. Rejections with no recorded date are not included.') : '',
    totals: totals, benchmarkUnavailable: unavailable, includeFigures: withFigures,
    reasons: reasons, clusters: clusters,
    funnel: { steps: firstFunnel ? firstFunnel.steps.map(x => ({ from: x.from, to: x.to })) : [], rows: funnelRows },
  };
}

// The Report Builder module: the by-project page model plus the report's period label.
function rejectionIntelReportModel({ summary, projects, includeFigures, benchmarkUnavailable, periodLabel } = {}) {
  return Object.assign(
    rejectionIntelPageModel({ summary, projects, dim: 'project', includeFigures, benchmarkUnavailable, weeks: 0 }),
    { periodLabel: periodLabel || '' });
}

// The Project dashboard strip for one project. Same guards as the page: a fact is present only
// when its claim holds. empty = nothing to say at all (no rejections, no claimable funnel step).
function rejectionIntelProjectStrip({ summary, projectId, includeFigures, benchmarkUnavailable } = {}) {
  const s = summary || {};
  const key = String(projectId);
  const c = (((s.byProject || {}).clusters) || []).find(x => x.key === key) || null;
  const f = (((s.funnelByProject || {}).rows) || []).find(x => x.key === key) || null;
  const unavailable = benchmarkUnavailable === true;
  const claim = !!(c && c.claim);
  const fig = c && !unavailable ? _rejectionFigures(c.salary, includeFigures === true) : { figures: null, mixedCurrency: false };
  const worstRaw = f && f.worstStep !== null && f.worstStep !== undefined ? f.steps[f.worstStep] : null;
  const worst = worstRaw ? _rejectionStepView(worstRaw) : null;
  const n = c ? c.n : 0;
  return {
    n: n, claim: claim,
    topReason: claim ? c.topReason : null, topSharePct: claim ? _rejectionPct(c.topShare) : null,
    gap: c && !unavailable ? rejectionGapText(c.salary) : null,
    figures: fig.figures, mixedCurrency: fig.mixedCurrency,
    worstStep: worst ? { from: worst.from, to: worst.to, ratePct: worst.ratePct, priorPct: worst.priorPct } : null,
    benchmarkUnavailable: unavailable,
    minRejections: CONFIG.REJECTION_INTEL.minRejections,
    empty: n === 0 && !worst,
  };
}

// DA-D11 scope for the Rejection Intelligence inputs. projectIds = getUserProjectIds() (null = all).
// A listed id keeps that project's roles, and only the rejections / activity rows on those roles
// (a rejection whose role cannot be resolved belongs to nobody, so a DM never sees it).
// Inputs are not mutated.
function rejectionIntelScopeRows({ projectIds, roles, rejections, activity } = {}) {
  const allRoles = roles || [];
  if (projectIds === null || projectIds === undefined) {
    return { roles: allRoles.slice(), rejections: (rejections || []).slice(), activity: (activity || []).slice() };
  }
  const ids = new Set((projectIds || []).map(String));
  const scoped = allRoles.filter(r => ids.has(String(projectIdForRole(r))));
  const roleIds = new Set(scoped.map(r => String(r.id)));
  const onRole = row => roleIds.has(String(row.RoleIDLookupId || row.RoleID || ''));
  return { roles: scoped, rejections: (rejections || []).filter(onRole), activity: (activity || []).filter(onRole) };
}
