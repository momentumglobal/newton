// js/revenue-logic.js — assignment revenue maths: split-fee recognition (N-116), monthly rows (N-120, N-328),
// revenue and forecast revenue per year, and the Rate label.
// Pure: no Graph, no DOM. Split out of utils.js (N-474). Uses monthKeyFromISO() / addMonthsToKey() from
// utils.js (the BST string-slice rule lives there). Loads straight after people-logic.js on every shell and
// is listed in CONFIG.MCP.scripts. Nothing here runs at load.

// ── Split-fee revenue (N-116) ─────────────────────────────────────────
// Exec Search and MG AI bill as a retainer up front plus the balance on
// placement, not a monthly rate. Each is recognised as a single lump sum in a
// single month, never pro-rated:
//   retainer  → the month of StartDate
//   placement → the month AFTER the month of EndDate
// The placement month therefore falls OUTSIDE the assignment window, and for a
// December end lands in January of the following year.

function isSplitFeeAssignment(a) {
  return CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(a?.ProjectType);
}

// Revenue events for a split-fee assignment. [] for anything else.
// A blank or zero fee is omitted entirely — a search with no placement fee
// agreed yet contributes its retainer and nothing more (no zero-amount row).
function splitFeeRevenueEvents(a) {
  if (!isSplitFeeAssignment(a)) return [];
  const events    = [];
  const retainer  = parseFloat(a.RetainerFee)  || 0;
  const placement = parseFloat(a.PlacementFee) || 0;
  const startKey  = monthKeyFromISO(a.StartDate);
  const endKey    = monthKeyFromISO(a.EndDate);
  if (retainer && startKey) {
    events.push({ monthKey: startKey, amount: retainer, kind: 'retainer' });
  }
  if (placement && endKey) {
    events.push({ monthKey: addMonthsToKey(endKey, 1), amount: placement, kind: 'placement' });
  }
  return events;
}

// Same shape for a SalesForecasts row. The fees are FLAT for the whole line —
// deliberately NOT multiplied by ForecastedHeadcount. One TP can run several
// concurrent Exec Search / MG AI engagements, so headcount is not an engagement
// count; it drives utilisation only and never touches revenue. A headcount of 0
// is legal and means a double-up on an already-deployed employee: no incremental
// capacity, but the fees are still recognised — hence no `if (!hc) return []`.
function splitFeeForecastEvents(f) {
  if (!CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(f?.ProjectType)) return [];
  const events    = [];
  const retainer  = parseFloat(f.RetainerFee)  || 0;
  const placement = parseFloat(f.PlacementFee) || 0;
  const startKey  = monthKeyFromISO(f.ForecastStartDate);
  const endKey    = monthKeyFromISO(f.ForecastEndDate);
  if (retainer && startKey) {
    events.push({ monthKey: startKey, amount: retainer, kind: 'retainer' });
  }
  if (placement && endKey) {
    events.push({ monthKey: addMonthsToKey(endKey, 1), amount: placement, kind: 'placement' });
  }
  return events;
}

// N-116: one label for both the tracker Rate column and the Gantt tooltip.
function assignmentRateLabel(a) {
  const gbp = (v) => '£' + Number(v).toLocaleString('en-GB');
  if (isSplitFeeAssignment(a)) {
    const r = parseFloat(a.RetainerFee)  || 0;
    const p = parseFloat(a.PlacementFee) || 0;
    if (!r && !p) return a.Billed === 'No' ? 'Unbilled' : '—';   // N-327
    return `${r ? gbp(r) : '—'} + ${p ? gbp(p) : '—'} (split)`;
  }
  return a.MonthlyBillRate ? gbp(a.MonthlyBillRate) : '—';
}

// N-328: opts.through (a Date, optional) moves the cap to the end of the month
// containing it. Only the forward-looking utilisation paths pass it. With no
// opts the cap is the end of the current month, exactly as before. Months
// after the current one carry ZERO revenue, so `through` rows can never put
// future revenue anywhere. DayFrom / DayTo (UTC day-of-month, inclusive) feed
// personUtilisation()'s per-person day union.
function computeMonthlyRows(assignments, opts = {}) {
  // N-120: anchor "today" to a UTC-midnight instant for the same calendar
  // day, so it composes safely with the UTC day-overlap arithmetic below —
  // mixing a local-midnight cap with UTC month boundaries could shift the
  // current-month cap by up to an hour across a BST/GMT transition.
  const todayLocal = new Date();
  const today = new Date(Date.UTC(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate()));
  // N-328: `through` is normalised the same way as `today` (its local calendar
  // day as a UTC midnight) before its month end is taken.
  const capRef = opts.through
    ? new Date(Date.UTC(opts.through.getFullYear(), opts.through.getMonth(), opts.through.getDate()))
    : today;
  const capEnd = new Date(Date.UTC(capRef.getUTCFullYear(), capRef.getUTCMonth() + 1, 0));
  const curKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  const rows = [];
  for (const a of assignments) {
    if (!a.StartDate || !a.EndDate) continue;
    if (isForecastAssignment(a)) continue; // forecasts never feed utilisation/revenue
    const aStart = utcDateOnly(a.StartDate);
    const aEnd   = utcDateOnly(a.EndDate);
    const effectiveEnd = aEnd < capEnd ? aEnd : capEnd;
    // N-116: null for every non-split-fee assignment, so the branch below is
    // a no-op and existing revenue figures are byte-identical.
    const _splitEvents = isSplitFeeAssignment(a) ? splitFeeRevenueEvents(a) : null;
    const cur = new Date(Date.UTC(aStart.getUTCFullYear(), aStart.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(effectiveEnd.getUTCFullYear(), effectiveEnd.getUTCMonth(), 1));
    while (cur <= endMonth) {
      const year  = cur.getUTCFullYear();
      const month = cur.getUTCMonth();
      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd   = new Date(Date.UTC(year, month + 1, 0));
      const overlapStart = aStart > monthStart ? aStart : monthStart;
      const overlapEnd   = effectiveEnd < monthEnd ? effectiveEnd : monthEnd;
      const daysOverlap = (overlapEnd - overlapStart) / 86400000 + 1;
      const daysInMonth = monthEnd.getUTCDate();
      const fraction    = daysInMonth > 0 ? daysOverlap / daysInMonth : 0;
      const rate    = parseFloat(a.MonthlyBillRate) || 0;
      const billed  = a.Billed === 'Yes';
      // N-116: split-fee lines carry no monthly rate. Revenue is the lump sum
      // due in THIS month (usually nothing); capacity below is unaffected.
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      // N-328: a month after the current one only exists for a `through`
      // caller (utilisation) — never recognise revenue in it.
      const prorated = monthKey > curKey ? 0
        : _splitEvents
        ? _splitEvents.filter(ev => ev.monthKey === monthKey)
                      .reduce((sum, ev) => sum + ev.amount, 0)
        : rate * fraction;
      rows.push({
        AssignmentID:     a.AssignmentID,
        EmployeeName:     a.EmployeeName,
        Level:            a.Level,
        StaffType:        a.StaffType,   // N-402: External rows skip utilisation
        Customer:         a.Customer,
        ProjectType:      a.ProjectType,
        Country:          a.Country,
        Billed:           a.Billed,
        Year:             year,
        Month:            month + 1,
        MonthStart:       `${monthKey}-01`,
        MonthFraction:    Math.round(fraction * 10000) / 10000,
        ProratedRevenue:  Math.round(prorated * 100) / 100,
        BilledRevenue:    billed ? Math.round(prorated * 100) / 100 : 0,
        Capacity:         Math.round(fraction * 10000) / 10000,
        BilledCapacity:   billed ? Math.round(fraction * 10000) / 10000 : 0,
        DayFrom:          overlapStart.getUTCDate(),   // N-328: day span within
        DayTo:            overlapEnd.getUTCDate(),     // the month, inclusive
      });
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }

    // N-116: the placement fee lands the month AFTER the assignment ends, which
    // the loop above never reaches. Emit it as a ZERO-CAPACITY revenue row — the
    // person is not assigned that month — subject to the same "not in the
    // future" cap that effectiveEnd applies to every other row.
    if (_splitEvents) {
      // N-403: UTC getters -- endMonth is a UTC-midnight Date, so local getters
      // read the previous month west of UTC. The "today" cap is curKey (same UTC key).
      const lastKey  = `${endMonth.getUTCFullYear()}-${String(endMonth.getUTCMonth() + 1).padStart(2, '0')}`;
      const billedFlag = a.Billed === 'Yes';
      for (const ev of _splitEvents) {
        if (ev.monthKey <= lastKey)  continue; // already emitted inside the loop
        if (ev.monthKey > curKey)    continue; // future month, same cap as above
        const amount = Math.round(ev.amount * 100) / 100;
        rows.push({
          AssignmentID:     a.AssignmentID,
          EmployeeName:     a.EmployeeName,
          Level:            a.Level,
          StaffType:        a.StaffType,   // N-402
          Customer:         a.Customer,
          ProjectType:      a.ProjectType,
          Country:          a.Country,
          Billed:           a.Billed,
          Year:             monthKeyYear(ev.monthKey),
          Month:            monthKeyMonth(ev.monthKey),
          MonthStart:       `${ev.monthKey}-01`,
          MonthFraction:    0,
          ProratedRevenue:  amount,
          BilledRevenue:    billedFlag ? amount : 0,
          Capacity:         0,
          BilledCapacity:   0,
        });
      }
    }
  }
  return rows;
}

// ── Revenue per month for a given year (no today cap) ─────────────────
// Pro-rates each assignment's MonthlyBillRate by day-overlap across all 12
// months of `year`. Includes former, current AND planned assignments
// (ignores the Billed flag — this is estimated revenue, not billed).
// Returns an array of 12 numbers, index 0 = Jan.
function computeMonthlyRevenueForYear(assignments, year) {
  const months = new Array(12).fill(0);
  for (const a of assignments) {
    // N-116: split-fee lines recognise two lump sums, not a pro-rated rate.
    // Checked BEFORE the date guards because the placement month sits outside
    // the assignment window and may belong to a different year entirely.
    if (isSplitFeeAssignment(a)) {
      for (const ev of splitFeeRevenueEvents(a)) {
        if (monthKeyYear(ev.monthKey) !== year) continue;
        months[monthKeyMonth(ev.monthKey) - 1] += ev.amount;
      }
      continue;
    }
    if (!a.StartDate || !a.EndDate) continue;
    const aStart = utcDateOnly(a.StartDate);
    const aEnd   = utcDateOnly(a.EndDate);
    const rate   = parseFloat(a.MonthlyBillRate) || 0;
    if (!rate) continue;
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(Date.UTC(year, m, 1));
      const monthEnd   = new Date(Date.UTC(year, m + 1, 0));
      if (aStart > monthEnd || aEnd < monthStart) continue; // no overlap
      const overlapStart = aStart > monthStart ? aStart : monthStart;
      const overlapEnd   = aEnd   < monthEnd   ? aEnd   : monthEnd;
      const daysOverlap  = (overlapEnd - overlapStart) / 86400000 + 1;
      const daysInMonth  = monthEnd.getUTCDate();
      const fraction     = daysInMonth > 0 ? daysOverlap / daysInMonth : 0;
      months[m] += rate * fraction;
    }
  }
  return months.map(v => Math.round(v));
}

// ── Forecast revenue per month for a given year ───────────────────────
// From the SalesForecasts list. Monthly £ = ForecastedHeadcount ×
// ForecastMonthlyRevenuePerHead, pro-rated by day-overlap per month.
// Rows overlapping a month are summed. Returns array[12], index 0 = Jan.
function computeMonthlyForecastRevenueForYear(salesForecasts, year) {
  const months = new Array(12).fill(0);
  for (const f of salesForecasts) {
    // N-116: split-fee forecast lines recognise two FLAT lump sums — see
    // splitFeeForecastEvents() for why ForecastedHeadcount is deliberately not a
    // multiplier. Checked before the date guards because the placement month
    // sits outside the window and may belong to another year.
    if (CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(f.ProjectType)) {
      for (const ev of splitFeeForecastEvents(f)) {
        if (monthKeyYear(ev.monthKey) !== year) continue;
        months[monthKeyMonth(ev.monthKey) - 1] += ev.amount;
      }
      continue;
    }
    if (!f.ForecastStartDate || !f.ForecastEndDate) continue;
    const fStart = utcDateOnly(f.ForecastStartDate);
    const fEnd   = utcDateOnly(f.ForecastEndDate);
    const hc     = parseFloat(f.ForecastedHeadcount) || 0;
    const rate   = parseFloat(f.ForecastMonthlyRevenuePerHead) || 0;
    const monthly = hc * rate;
    if (!monthly) continue;
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(Date.UTC(year, m, 1));
      const monthEnd   = new Date(Date.UTC(year, m + 1, 0));
      if (fStart > monthEnd || fEnd < monthStart) continue; // no overlap
      const overlapStart = fStart > monthStart ? fStart : monthStart;
      const overlapEnd   = fEnd   < monthEnd   ? fEnd   : monthEnd;
      const daysOverlap  = (overlapEnd - overlapStart) / 86400000 + 1;
      const daysInMonth  = monthEnd.getUTCDate();
      const fraction     = daysInMonth > 0 ? daysOverlap / daysInMonth : 0;
      months[m] += monthly * fraction;
    }
  }
  return months.map(v => Math.round(v));
}

// ── Distinct years spanned by assignment data (ascending) ─────────────
function getAssignmentDataYears(assignments) {
  const years = new Set();
  for (const a of assignments) {
    if (!a.StartDate || !a.EndDate) continue;
    const s = new Date(a.StartDate).getFullYear();
    const e = new Date(a.EndDate).getFullYear();
    for (let y = s; y <= e; y++) years.add(y);
    // N-116: a placement fee on a December-ending split-fee assignment is
    // recognised in January of the following year — that year must be
    // selectable or the revenue is invisible.
    for (const ev of splitFeeRevenueEvents(a)) years.add(monthKeyYear(ev.monthKey));
  }
  if (!years.size) years.add(new Date().getFullYear());
  return [...years].sort((x, y) => x - y);
}
