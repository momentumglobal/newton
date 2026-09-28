// js/lci-model.js — LCI Cost Model calculation layer
// Pure functions only: no network I/O, no DOM access (analytics.js pattern).
// All per-month series are arrays of length model.HorizonMonths, index 0 = M1.
// Derived values are never stored — always computed from model header + rows.

// ── Timeline ─────────────────────────────────────────────────────────

// StartMonth is a 'YYYY-MM' string (never a SP date column — BST/UTC gotcha).
function lciParseStartMonth(startMonth) {
  const [y, m] = String(startMonth).split('-').map(Number);
  return { y, m }; // m = 1–12
}

const LCI_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// One month label, n >= 1 → "M9 (Jul 27)". Arithmetic, not an index into the
// horizon, so it also labels months PAST the horizon (N-263 payback).
function lciMonthLabel(startMonth, n) {
  const { y, m } = lciParseStartMonth(startMonth);
  const total = (m - 1) + (n - 1);
  const name  = LCI_MONTH_NAMES[total % 12];
  const yr    = String((y + Math.floor(total / 12)) % 100).padStart(2, '0');
  return `M${n} (${name} ${yr})`;
}

// → ["M1 (Jun 26)", "M2 (Jul 26)", ...]
function lciMonthLabels(startMonth, horizon) {
  return Array.from({ length: horizon }, (_, i) => lciMonthLabel(startMonth, i + 1));
}

// Parse a row's MonthValues JSON safely → array padded/trimmed to horizon
function lciMonthValues(row, horizon) {
  let arr = [];
  try { arr = JSON.parse(row.MonthValues || '[]'); } catch (e) { arr = []; }
  const out = new Array(horizon).fill(0);
  for (let i = 0; i < Math.min(arr.length, horizon); i++) out[i] = Number(arr[i]) || 0;
  return out;
}

function lciSections(model) {
  let s = { coe: true, travel: true, legacy: true, oneoffs: true, fees: true };
  try { s = { ...s, ...JSON.parse(model.SectionsEnabled || '{}') }; } catch (e) {}
  // N-008: CoE is always on — the toggle was removed. Must come AFTER the merge
  // above, or a stored "coe":false from before the toggle was dropped would win
  // and leave the model with a hidden roadmap and no way to switch it back on.
  s.coe = true;
  return s;
}

// ── Currency model ───────────────────────────────────────────────────
// Each model has two currencies:
//   LocalCurrency   — CoE location currency. CoE-side inputs are entered in
//                     it: salaries, OfficeCostPerHead.
//                     (EoRFeePerHead and travel rows are exceptions:
//                     entered in DisplayCurrency, NOT FX-converted.)
//   DisplayCurrency — the customer's modelling currency. Customer-side
//                     inputs are entered in it: legacy rows, one-offs, fees.
//                     ALL outputs render in DisplayCurrency.
// FXRateLocalToDisplay (manual, on the model header) converts the CoE side
// into DisplayCurrency. Same currency both sides → rate 1.
function lciFxRate(model) {
  if (model.LocalCurrency && model.DisplayCurrency &&
      model.LocalCurrency === model.DisplayCurrency) return 1;
  return Number(model.FXRateLocalToDisplay) || 1;
}

// Distinct sorted currency list derived from a country→currency map.
// Call as lciCurrencyOptions(CONFIG.COUNTRY_CURRENCY) — keeps config.js as
// the single source of truth for Newton currencies (Add Role modal uses the
// same map). Map passed as an argument so this file stays pure.
function lciCurrencyOptions(countryCurrencyMap) {
  return [...new Set(Object.values(countryCurrencyMap || {}))].sort();
}

// ── Per-role monthly cost ────────────────────────────────────────────
// Returns LOCAL currency for coe rows, DISPLAY currency for legacy rows
// (legacy salaries are customer-side inputs).
// SalaryMonths (12/13/14) grosses up base salary for 13th/14th-month markets.
// Bonus % applies to base annual salary (matches the Excel model).
function lciMonthlyCost(row, model) {
  const salary       = Number(row.AnnualSalary) || 0;
  const salaryMonths = Number(model.SalaryMonths) || 12;
  const burden       = Number(model.EmployerBurdenPct) || 0;
  const grossAnnual  = salary * (salaryMonths / 12);
  const annualBonus  = salary * (Number(row.BonusPct) || 0);
    const monthlyBase  = (grossAnnual + annualBonus) / 12;
  return monthlyBase * (1 + burden);
}

// Legacy rows are customer-side: entered in DisplayCurrency with on-costs
// already included. EmployerBurdenPct and SalaryMonths describe the CoE
// location and must NOT be applied to them (N-017 — they were, inflating every
// model's legacy cost by 1 + burden, more at 13/14 salary months).
// Deliberately takes `row` only, with no `model` argument: the CoE settings are
// not in scope here and cannot be reintroduced by accident.
function lciLegacyMonthlyCost(row) {
  const salary      = Number(row.AnnualSalary) || 0;
  const annualBonus = salary * (Number(row.BonusPct) || 0);
  return (salary + annualBonus) / 12;
}

// ── CoE section ──────────────────────────────────────────────────────

// Running PAYROLL headcount for one coe row.
// A hire in month N reaches payroll in month N + notice (model.NoticeMonths,
// default 0 — hire month = first paid month). Assumes 1st-of-month starts.
// Stays flat after the last start (auto run-rate).
function lciCumulativeHeadcount(row, horizon, noticeMonths = 0) {
  const hires = lciMonthValues(row, horizon);
  const out = new Array(horizon).fill(0);
  let cum = 0;
  for (let i = 0; i < horizon; i++) {
    const src = i - noticeMonths;
    if (src >= 0) cum += hires[src];
    out[i] = cum;
  }
  return out;
}

// Notice period for one CoE row. A blank/absent NoticeMonthsOverride inherits
// the model default; 0 is a REAL value meaning "starts in the hire month".
// Deliberately not `Number(x) || fallback` — `Number('')` is 0, so that form
// would silently turn every blank cell into an immediate start.
function lciRowNotice(row, model) {
  const raw = row.NoticeMonthsOverride;
  const has = raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw));
  return Math.max(0, Number(has ? raw : model.NoticeMonths) || 0);
}

// Per-month CoE employee cost + headcount, with per-Team subtotals.
// Costs returned in LOCAL currency (converted in lciComputeModel).
function lciCoeCosts(rows, model) {
  const horizon = Number(model.HorizonMonths);
  const coeRows = rows.filter(r => r.RowType === 'coe');
  const total     = new Array(horizon).fill(0);
  const headcount = new Array(horizon).fill(0);
  const byTeam    = {}; // team → array[horizon]

  for (const row of coeRows) {
    const cum  = lciCumulativeHeadcount(row, horizon, lciRowNotice(row, model));
    const cost = lciMonthlyCost(row, model);
    const team = row.Team || 'Other';
    if (!byTeam[team]) byTeam[team] = new Array(horizon).fill(0);
    for (let i = 0; i < horizon; i++) {
      total[i]        += cum[i] * cost;
      headcount[i]    += cum[i];
      byTeam[team][i] += cum[i] * cost;
    }
  }
  return { total, headcount, byTeam };
}

// ── Legacy section ───────────────────────────────────────────────────
// Individual rows by default (Quantity 1); grouped allowed via Quantity.
// Salaries entered in DISPLAY currency (customer-side).
// Exiting rows run M1 → ExitMonth inclusive; no ExitMonth = runs to horizon
// (UI warns). Retained rows are the hybrid team — they stay in post, so they
// always run to the horizon and any stored ExitMonth is ignored.

// Blank/unknown → 'exiting', so rows created before N-010 behave exactly as
// they did. Only an explicit 'retained' opts in.
function lciLegacyCategory(row) {
  return String(row.LegacyCategory || '').trim().toLowerCase() === 'retained'
    ? 'retained' : 'exiting';
}

function lciLegacyCosts(rows, model) {
  const horizon = Number(model.HorizonMonths);
  const legacyRows = rows.filter(r => r.RowType === 'legacy');
  const total     = new Array(horizon).fill(0);
  const headcount = new Array(horizon).fill(0);
  // Cost splits by category; headcount stays combined by design.
  const byCategory = {
    exiting:  new Array(horizon).fill(0),
    retained: new Array(horizon).fill(0),
  };
  const headcountByCategory = {
    exiting:  new Array(horizon).fill(0),
    retained: new Array(horizon).fill(0),
  };

  for (const row of legacyRows) {
    const qty  = Number(row.Quantity) || 1;
    const cost = lciLegacyMonthlyCost(row) * qty;
    const cat  = lciLegacyCategory(row);
    // Category drives the end month, not the stored ExitMonth: a value left
    // over from before a row was switched to Retained must not truncate it.
    const exit = cat === 'retained' ? horizon : (Number(row.ExitMonth) || horizon);
    for (let i = 0; i < Math.min(exit, horizon); i++) {
      total[i]           += cost;
      headcount[i]       += qty;
      byCategory[cat][i] += cost;
      headcountByCategory[cat][i] += qty;
    }
  }
  return { total, headcount, byCategory, headcountByCategory };
}

// ── One-offs & fees ──────────────────────────────────────────────────
// Entered in DISPLAY currency (customer-side).
function lciSumByType(rows, model, rowType) {
  const horizon = Number(model.HorizonMonths);
  const out = new Array(horizon).fill(0);
  for (const row of rows.filter(r => r.RowType === rowType)) {
    const vals = lciMonthValues(row, horizon);
    for (let i = 0; i < horizon; i++) out[i] += vals[i];
  }
  return out;
}

// ── Full model computation ───────────────────────────────────────────
// All outputs are in DisplayCurrency: the CoE side is computed in
// LocalCurrency then converted via lciFxRate(model); the legacy / one-off /
// fee sides are already entered in DisplayCurrency.
// NOTE: totalMonthly = coeOperating + legacy + oneoffs + fees, with CoE
// operating counted ONCE. The Barcelona reference Excel double-counts CoE
// operating in its "Total Monthly Spend" row (row 32 sums B17 + B25, but
// B25 already includes B17). That is a spreadsheet bug — intentionally not
// replicated. Newton totals will be lower than the Excel for same inputs.
function lciComputeModel(model, rows) {
  const horizon  = Number(model.HorizonMonths);
  const sections = lciSections(model);
  const fx       = lciFxRate(model);
  const zero = () => new Array(horizon).fill(0);

  const coe     = sections.coe     ? lciCoeCosts(rows, model)    : { total: zero(), headcount: zero(), byTeam: {} };
  const legacy  = sections.legacy  ? lciLegacyCosts(rows, model) : {
    total: zero(), headcount: zero(),
    byCategory:          { exiting: zero(), retained: zero() },
    headcountByCategory: { exiting: zero(), retained: zero() },
  };
  const oneoffs = sections.oneoffs ? lciSumByType(rows, model, 'oneoff') : zero();
  const fees    = sections.fees    ? lciSumByType(rows, model, 'fee')    : zero();

  // CoE side: local currency → DisplayCurrency
  coe.total = coe.total.map(v => v * fx);
  for (const t of Object.keys(coe.byTeam)) coe.byTeam[t] = coe.byTeam[t].map(v => v * fx);
  // EoR fee is entered in DisplayCurrency (customer-side) — no FX conversion.
  const eor    = coe.headcount.map(h => h * (Number(model.EoRFeePerHead)    || 0));
  const office = coe.headcount.map(h => h * (Number(model.OfficeCostPerHead)|| 0) * fx);
  // Travel is entered in DisplayCurrency (customer-side) — no FX conversion.
  // Travel comes from per-month travel rows and stays inside coeOperating
  // below, alongside EoR and office costs.
  const travel = sections.travel ? lciSumByType(rows, model, 'travel') : zero();

  const coeOperating   = coe.total.map((c, i) => c + eor[i] + office[i] + travel[i]);
  const teamCosts      = coeOperating.map((c, i) => c + legacy.total[i] + oneoffs[i]);
  const totalMonthly   = teamCosts.map((c, i) => c + fees[i]);
  const cumulativeSpend = [];
  totalMonthly.reduce((acc, v, i) => (cumulativeSpend[i] = acc + v), 0);

  return {
    labels: lciMonthLabels(model.StartMonth, horizon),
    coeEmployeeCost: coe.total,
    coeByTeam:       coe.byTeam,
    coeHeadcount:    coe.headcount,
    eor, office, travel,
    coeOperating,
    legacyCost:        legacy.total,
    legacyHeadcount:   legacy.headcount,
    legacyByCategory:  legacy.byCategory,
    legacyHeadcountByCategory: legacy.headcountByCategory,
    totalHeadcount:  coe.headcount.map((h, i) => h + legacy.headcount[i]),
    oneoffs, fees,
    teamCosts, totalMonthly, cumulativeSpend,
  };
}

// ── Monthly cost composition (N-261) ────────────────────────────────
// Series for the stacked Legacy + CoE-operating column chart. Takes the
// lciComputeModel() result — section gating has already happened there, so
// this must NOT call lciSections() or re-sum rows. "Legacy" is the Cost
// Model's "Total Legacy Costs" line (team + Retention & Relocation); it
// intentionally differs from the Peak Crossover KPI, which is team-only.
// Fees are excluded.
function lciCostCompositionSeries(c) {
  const coe    = c.coeOperating.slice();
  const legacy = c.legacyCost.map((v, i) => v + (c.oneoffs[i] || 0));
  return { coe, legacy, hasLegacy: legacy.some(v => v) };
}

// ── Hires per month (roadmap header rows) ────────────────────────────
function lciHiresPerMonth(rows, model) {
  const horizon = Number(model.HorizonMonths);
  const out = new Array(horizon).fill(0);
  for (const row of rows.filter(r => r.RowType === 'coe')) {
    const vals = lciMonthValues(row, horizon);
    for (let i = 0; i < horizon; i++) out[i] += vals[i];
  }
  return out;
}

// ── Payback (N-263) ──────────────────────────────────────────────────
// First month N where cumulative programme spend <= legacy baseline x N.
// Inside the horizon it reads cumulativeSpend. Past the horizon every further
// month adds steadyMonthly to programme spend and `baseline` to the legacy
// line, so the gap closes by (baseline - steadyMonthly) a month.
//   status 'ok'   — month found (may be > horizon)
//   status 'none' — never pays back (saving <= 0)
//   status 'na'   — no legacy baseline to compare against
function lciPaybackMonth({ cumulativeSpend, baseline, steadyMonthly }) {
  if (!(baseline > 0)) return { month: null, status: 'na' };
  const H = cumulativeSpend.length;
  for (let i = 0; i < H; i++) {
    if (cumulativeSpend[i] <= baseline * (i + 1)) return { month: i + 1, status: 'ok' };
  }
  const saving = baseline - steadyMonthly;
  if (!(saving > 0)) return { month: null, status: 'none' };
  const excess = (H ? cumulativeSpend[H - 1] : 0) - baseline * H;
  return { month: H + Math.ceil(excess / saving), status: 'ok' };
}

// ── KPIs (all monetary values in DisplayCurrency) ────────────────────
// N-263 definitions. Section gating already happened in lciComputeModel — do
// not re-gate here.
//   Steady state = the final modelled month's CoE operating cost + RETAINED
//     legacy team cost. Exiting legacy and project fees are excluded by
//     definition (Chris, 28 Sep 2026); retained staff are part of the future
//     run rate. steadyReached is false only when some hire is not yet on
//     payroll by the final month — exiting legacy still present does not
//     block it (they are excluded anyway).
//   Legacy baseline = M1 legacy TEAM cost (legacyCost[0]). Retention &
//     Relocation one-offs are transition costs, never baseline.
//   Peak = max(totalMonthly - fees): CoE operating + legacy team + one-offs.
function lciComputeKPIs(model, rows) {
  const c = lciComputeModel(model, rows);
  const horizon = Number(model.HorizonMonths) || 0;
  const hires = lciHiresPerMonth(rows, model);

  let lastHireMonth = 0;
  let totalHires = 0;
  hires.forEach((h, i) => { totalHires += h; if (h > 0) lastHireMonth = i + 1; });

  const last = horizon - 1;
  const at = arr => (last >= 0 ? (arr[last] || 0) : 0);

  let payrollMonth = null;
  if (totalHires > 0) {
    const idx = c.coeHeadcount.findIndex(h => h >= totalHires);
    if (idx > -1) payrollMonth = idx + 1;
  }

  const steadyMonthly   = at(c.coeOperating) + at(c.legacyByCategory.retained);
  const steadyHeadcount = at(c.coeHeadcount) + at(c.legacyHeadcountByCategory.retained);
  const finalHeadcount  = at(c.coeHeadcount);
  const costPerHead     = steadyHeadcount ? steadyMonthly / steadyHeadcount : 0;

  let peakMonth = 0, peakSpend = -1;
  for (let i = 0; i < horizon; i++) {
    const v = c.totalMonthly[i] - c.fees[i];
    if (v > peakSpend) { peakSpend = v; peakMonth = i + 1; }
  }
  if (peakSpend < 0) peakSpend = 0;

  const legacyBaseline          = horizon ? (c.legacyCost[0] || 0) : 0;
  const legacyBaselineHeadcount = horizon ? (c.legacyHeadcount[0] || 0) : 0;
  const legacyCostPerHead = legacyBaselineHeadcount ? legacyBaseline / legacyBaselineHeadcount : null;
  const legacyAnnual      = legacyBaseline * 12;
  const hasBaseline       = legacyBaseline > 0;
  const annualSaving      = hasBaseline ? (legacyBaseline - steadyMonthly) * 12 : null;
  const totalFees         = c.fees.reduce((a, v) => a + v, 0);

  return {
    horizon,
    totalSpend:        at(c.cumulativeSpend),
    steadyMonthly,
    steadyAnnual:      steadyMonthly * 12,
    steadyHeadcount,
    steadyReached:     payrollMonth !== null,
    totalHires,
    lastHireMonth,                       // time to full ramp — hired
    payrollMonth,                        // time to full ramp — on payroll
    costPerHead,
    finalHeadcount,
    peakMonth,
    peakSpend,
    legacyBaseline,
    legacyBaselineHeadcount,
    legacyCostPerHead,
    legacyAnnual,
    annualSaving,
    annualSavingPct:     hasBaseline ? annualSaving / legacyAnnual : null,
    costPerHeadDeltaPct: (legacyCostPerHead && costPerHead) ? 1 - costPerHead / legacyCostPerHead : null,
    totalFees,
    avgFeePerHire:       totalHires ? totalFees / totalHires : null,
    payback: lciPaybackMonth({ cumulativeSpend: c.cumulativeSpend, baseline: legacyBaseline, steadyMonthly }),
  };
}

// ── Notice-period groups (N-263) ─────────────────────────────────────
// There is no seniority field: tiers are whatever distinct notice values
// lciRowNotice() resolves across the CoE rows. Default group always first
// (even when no role uses it), then each other value ascending. Titles are
// de-duplicated within a group, first-seen (roadmap) order.
function lciNoticeGroups(rows, model) {
  const def = Math.max(0, Number(model.NoticeMonths) || 0);
  const map = new Map([[def, []]]);
  for (const row of (rows || []).filter(r => r.RowType === 'coe')) {
    const n = lciRowNotice(row, model);
    if (!map.has(n)) map.set(n, []);
    const title = String(row.Title || '').trim() || 'Role';
    if (!map.get(n).includes(title)) map.get(n).push(title);
  }
  const others = [...map.keys()].filter(k => k !== def).sort((a, b) => a - b);
  return [def, ...others].map(k => ({ months: k, isDefault: k === def, roles: map.get(k) }));
}

// Notice groups → [[label, value]] assumption rows. T = CONFIG.LCI.KPI_TEXT,
// passed in so this file stays free of config reads (lciCurrencyOptions
// pattern). Shared by the PowerPoint Assumptions slide and the HTML
// Summary/report assumptions table, so the two cannot drift.
function lciNoticeRowsText(groups, T) {
  const months = n => (n === 1 ? T.monthOne : fillTemplate(T.monthMany, { n }));
  const hasOthers = groups.length > 1;
  return groups.map(g => g.isDefault
    ? [T.noticeDefault, months(g.months) + (hasOthers ? ` (${T.noticeDefaultNote})` : '')]
    : [fillTemplate(T.noticeGroup, { n: months(g.months) }), g.roles.join(', ')]);
}

// ── Compare ──────────────────────────────────────────────────────────
// Both models already render in their own DisplayCurrency, so comparison
// is only offered when DisplayCurrency matches (UI disables Compare
// otherwise). No extra conversion layer.
// ── Salary benchmark library (step 13) ───────────────────────────────
// The library IS the accumulated LCIModelRows data — no separate storage.
// bench = array of { title, location, ccy, salary } from coe rows across all
// models (built in the editor). Returns median for an exact title match in
// the same location AND local currency, or null. All matches weighted equally.
function lciBenchmark(bench, title, location, ccy, excludeIds) {
  if (!title || !location || !ccy) return null;
  const t = String(title).trim().toLowerCase();
  const loc = String(location).trim().toLowerCase();
  const ex = new Set((excludeIds || []).map(String));
  const vals = (bench || [])
    .filter(b => !ex.has(String(b.modelId)) &&
                 b.salary != null && Number(b.salary) > 0 &&
                 String(b.title || '').trim().toLowerCase() === t &&
                 String(b.location || '').trim().toLowerCase() === loc &&
                 String(b.ccy || '') === String(ccy))
    .map(b => Number(b.salary))
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  return { median: Math.round(median), n: vals.length, min: vals[0], max: vals[vals.length - 1] };
}

function lciModelsComparable(modelA, modelB) {
  return !!modelA.DisplayCurrency &&
         modelA.DisplayCurrency === modelB.DisplayCurrency;
}
