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

// → ["M1 (Jun 26)", "M2 (Jul 26)", ...]
function lciMonthLabels(startMonth, horizon) {
  const { y, m } = lciParseStartMonth(startMonth);
  return Array.from({ length: horizon }, (_, i) => {
    const total = (m - 1) + i;
    const name  = LCI_MONTH_NAMES[total % 12];
    const yr    = String((y + Math.floor(total / 12)) % 100).padStart(2, '0');
    return `M${i + 1} (${name} ${yr})`;
  });
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
  let s = { coe: true, legacy: true, oneoffs: true, fees: true };
  try { s = { ...s, ...JSON.parse(model.SectionsEnabled || '{}') }; } catch (e) {}
  return s;
}

// ── Currency model ───────────────────────────────────────────────────
// Each model has two currencies:
//   LocalCurrency   — CoE location currency. CoE-side inputs are entered in
//                     it: salaries, OfficeCostPerHead, EoRFeePerHead,
//                     TravelPerMonth.
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

// ── CoE section ──────────────────────────────────────────────────────

// Running headcount for one coe row (hires per month → cumulative).
// Hire month = first paid month. Stays flat after last hire (auto run-rate).
function lciCumulativeHeadcount(row, horizon) {
  const hires = lciMonthValues(row, horizon);
  const out = new Array(horizon).fill(0);
  let cum = 0;
  for (let i = 0; i < horizon; i++) { cum += hires[i]; out[i] = cum; }
  return out;
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
    const cum  = lciCumulativeHeadcount(row, horizon);
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
// Cost runs M1 → ExitMonth inclusive; no ExitMonth = runs to horizon (UI warns).
function lciLegacyCosts(rows, model) {
  const horizon = Number(model.HorizonMonths);
  const legacyRows = rows.filter(r => r.RowType === 'legacy');
  const total     = new Array(horizon).fill(0);
  const headcount = new Array(horizon).fill(0);

  for (const row of legacyRows) {
    const qty  = Number(row.Quantity) || 1;
    const cost = lciMonthlyCost(row, model) * qty;
    const exit = Number(row.ExitMonth) || horizon; // last paid month index (1-based)
    for (let i = 0; i < Math.min(exit, horizon); i++) {
      total[i]     += cost;
      headcount[i] += qty;
    }
  }
  return { total, headcount };
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

  const coe     = sections.coe     ? lciCoeCosts(rows, model)   : { total: zero(), headcount: zero(), byTeam: {} };
  const legacy  = sections.legacy  ? lciLegacyCosts(rows, model): { total: zero(), headcount: zero() };
  const oneoffs = sections.oneoffs ? lciSumByType(rows, model, 'oneoff') : zero();
  const fees    = sections.fees    ? lciSumByType(rows, model, 'fee')    : zero();

  // CoE side: local currency → DisplayCurrency
  coe.total = coe.total.map(v => v * fx);
  for (const t of Object.keys(coe.byTeam)) coe.byTeam[t] = coe.byTeam[t].map(v => v * fx);
  const eor    = coe.headcount.map(h => h * (Number(model.EoRFeePerHead)    || 0) * fx);
  const office = coe.headcount.map(h => h * (Number(model.OfficeCostPerHead)|| 0) * fx);
  const travel = new Array(horizon).fill((Number(model.TravelPerMonth) || 0) * fx);
  if (!sections.coe) travel.fill(0);

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
    legacyCost:      legacy.total,
    legacyHeadcount: legacy.headcount,
    totalHeadcount:  coe.headcount.map((h, i) => h + legacy.headcount[i]),
    oneoffs, fees,
    teamCosts, totalMonthly, cumulativeSpend,
  };
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

// ── KPIs (all monetary values in DisplayCurrency) ────────────────────
function lciComputeKPIs(model, rows) {
  const c = lciComputeModel(model, rows);
  const horizon = Number(model.HorizonMonths);
  const hires = lciHiresPerMonth(rows, model);

  let lastHireMonth = 0;
  let totalHires = 0;
  hires.forEach((h, i) => { totalHires += h; if (h > 0) lastHireMonth = i + 1; });

  const last = horizon - 1;
  const steadyMonthly = c.coeOperating[last] + c.legacyCost[last]; // fees/one-offs excluded from run-rate
  const finalHeadcount = c.coeHeadcount[last];

  // Peak crossover: max combined legacy + CoE monthly spend
  let peakCrossoverMonth = 0, peak = -1;
  for (let i = 0; i < horizon; i++) {
    const combined = c.coeOperating[i] + c.legacyCost[i];
    if (combined > peak) { peak = combined; peakCrossoverMonth = i + 1; }
  }

  return {
    totalSpend:        c.cumulativeSpend[last],
    steadyMonthly,
    steadyAnnual:      steadyMonthly * 12,
    totalHires,
    lastHireMonth,                       // "time to full ramp"
    costPerHead:       finalHeadcount ? steadyMonthly / finalHeadcount : 0,
    finalHeadcount,
    peakCrossoverMonth,
    peakCrossoverSpend: peak,
  };
}

// ── Compare ──────────────────────────────────────────────────────────
// Both models already render in their own DisplayCurrency, so comparison
// is only offered when DisplayCurrency matches (UI disables Compare
// otherwise). No extra conversion layer.
function lciModelsComparable(modelA, modelB) {
  return !!modelA.DisplayCurrency &&
         modelA.DisplayCurrency === modelB.DisplayCurrency;
}

function lciCompareModels(modelA, rowsA, modelB, rowsB) {
  const build = (model, rows) => {
    const comp = lciComputeModel(model, rows);
    return {
      name:     model.Title || model.ModelName,
      currency: model.DisplayCurrency,
      kpis:     lciComputeKPIs(model, rows),
      cumulativeSpend: comp.cumulativeSpend,
      labels:   comp.labels,
    };
  };
  return {
    comparable: lciModelsComparable(modelA, modelB),
    currency:   modelA.DisplayCurrency,
    a: build(modelA, rowsA),
    b: build(modelB, rowsB),
  };
}
