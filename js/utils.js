// js/utils.js — pure helpers with no network I/O and no DOM
// Loaded before api.js in all HTML files. DOM/UI helpers are in ui-kit.js (loads
// straight after this file); the rich-text table editor is in richtext.js.
// Domain logic shared across modules (headcount, role history, placement picker, CoE link, WeeklyActivity
// ProjectID helpers) is in headcount.js.
// Checklist rules are in checklist-logic.js; role and permission rules (role resolution,
// roleCan, survey eligibility, restricted-list helpers) are in permissions.js.

// ── Platform detection ──────────────────────────────────────────────
// Used for the ⌘K/Ctrl+K sidebar hint (N-256) — never assume a platform,
// derive it. Defaults to false (Windows/Linux label) if navigator access
// throws for any reason; must never block sidebar render.
function isMacPlatform() {
  try {
    const uaPlatform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
    return /Mac/i.test(uaPlatform);
  } catch (e) {
    return false;
  }
}

// N-241 follow-up: the one-line lookup shared by getCurrencyForRole (api.js)
// and mobileRenderPlacementForm's role-preselected prefill (mobile-pages.js).
function currencyForRole(role) {
  return CONFIG.COUNTRY_CURRENCY[role.Location] || '';
}

// ── Sales forecast form logic (N-241) ───────────────────────────────────
// Shared by saveForecast (sales-pages.js) and mobileSaveForecast
// (mobile-sales.js) — desktop and mobile forms read fields with different
// element IDs and show errors differently, so each caller still does its
// own form-reading and error display; only the pure validation/shape logic
// below was identical between them.

// Returns an error message string, or null if the form is valid.
function validateForecastForm({ title, start, end, hc, isSplit }) {
  if (!title) return 'Customer / Project name is required.';
  if (!start) return 'Start date is required.';
  if (!end)   return 'End date is required.';
  if (new Date(end) <= new Date(start)) return 'End date must be after start date.';
  // N-116 QA1: split-fee lines may forecast 0 headcount — a double-up on an
  // already-deployed employee, which adds revenue but no capacity.
  if (Number.isNaN(hc) || hc < 0) {
    return 'Headcount must be 0 or more.';
  }
  if (!isSplit && hc < 1) {
    return 'Headcount must be at least 1.';
  }
  return null;
}

function buildForecastPayload({ title, start, end, hc, fcType, revPerHead, retainer, placement, notes, isSplit }) {
  return {
    Title: title,
    // N-116 QA1: isoDate() pins to T12:00:00Z. Without it SharePoint stores a
    // BST midnight as the previous day in UTC and 1 Sept reloads as 31 Aug —
    // which moves a whole split-fee lump sum into the wrong month. Every other
    // write path in Newton already does this; this form was the only omission.
    ForecastStartDate: isoDate(start),
    ForecastEndDate: isoDate(end),
    ForecastedHeadcount: hc,
    // N-116: a row is either monthly-rate OR split-fee, never both — the
    // unused side is written null so a type change leaves nothing stale
    // behind that would double-count in the revenue chart.
    ProjectType: fcType,
    ForecastMonthlyRevenuePerHead:
      isSplit || revPerHead === '' ? null : parseFloat(revPerHead),
    RetainerFee:  isSplit && retainer  !== '' ? parseFloat(retainer)  : null,
    PlacementFee: isSplit && placement !== '' ? parseFloat(placement) : null,
    Notes: notes,
  };
}

// ── Open pipeline predicate (N-305) ─────────────────────────────────────
// Open, actively-worked pipeline — the reporting / role-picker definition of
// an "open role" (dashboards KPI + panels, Report Builder, placement and
// rejected-offer pickers, Command Bar search, Roles page "Active" filter).
// Derived from CONFIG.ROLE_STAGES_PARKED + CONFIG.ROLE_STAGE_TERMINAL, never
// a third list. Unknown/blank stages return true — preserves the old
// `!EXCLUDED.includes(r.Stage)` behaviour. Set-equivalent to analytics.js's
// ACTIVE_STAGES over real stage values (pinned by assertion), so dashboards
// and Snapshots agree on "open".
function isOpenPipelineStage(stage) {
  return !CONFIG.ROLE_STAGES_PARKED.includes(stage) &&
         !CONFIG.ROLE_STAGE_TERMINAL.includes(stage);
}

// ── Role stage <select> markup (N-149 addendum) ─────────────────────────
// Pure HTML string builder for the Roles-list inline stage dropdown.
// Called once, when a row is unlocked (pages.js:unlockStageEdit) — not at
// initial table render, which now shows a plain badge. Per N-149's spec,
// meant for N-146 (Command Bar) to reuse rather than reimplementing the
// same option list.
function stageSelectHtml(roleId, currentStage) {
  const options = CONFIG.ROLE_STAGES
    .filter(s => !CONFIG.ROLE_STAGE_TERMINAL.includes(s))
    .map(s => `<option value="${s}" ${currentStage === s ? 'selected' : ''}>${s}</option>`)
    .join('');
  return `<select id="stage-select-${roleId}" data-prev-value="${escAttr(currentStage || '')}"${actOn('change', 'updateRoleStage', roleId, ACT_EL)}>${options}</select>`;
}

// Pure HTML string builder for the Roles-list locked stage badge -- the
// counterpart to stageSelectHtml() above. Single source of truth for this
// markup: used both by renderRolesPage()'s initial render and by
// updateRoleStage()'s optimistic apply() (pages.js), so the two never drift.
function stageBadgeHtml(roleId, stage, canEdit) {
  const locked = CONFIG.ROLE_STAGE_TERMINAL.includes(stage);
  const badge = `<span class="badge">${escHtml(stage || "—")}</span>`;
  return (canEdit && !locked)
    ? `${badge}<button type="button" class="stage-unlock-btn" title="Change stage"${act('unlockStageEdit', roleId, stage || '')}><i data-lucide="lock"></i></button>`
    : badge;
}

// ── Optimistic-insert row helpers (N-218a) ──────────────────────────────
// Temp client-side id for an item that has been submitted but not yet
// confirmed created -- same shape as the existing bpUid()/rbUid() convention
// (briefing-pack.js/report-builder.js), centralised here because it's
// shared across all 5 optimistic-insert submit paths in forms*.js, unlike
// those two single-file ids.
function pendingRowId() {
  return 'pend_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// ── Monthly calculation ───────────────────────────────────────────────
// True when an assignment is a forecast (SP Yes/No may come back as true/1/'Yes')
function isForecastAssignment(a) {
  return a.IsForecast === true || a.IsForecast === 1 || a.IsForecast === 'Yes';
}

// ── Split-fee revenue (N-116) ─────────────────────────────────────────
// Exec Search and MG AI bill as a retainer up front plus the balance on
// placement, not a monthly rate. Each is recognised as a single lump sum in a
// single month, never pro-rated:
//   retainer  → the month of StartDate
//   placement → the month AFTER the month of EndDate
// The placement month therefore falls OUTSIDE the assignment window, and for a
// December end lands in January of the following year.

// 'YYYY-MM' from an ISO date string, BY STRING SLICE — deliberately never via
// new Date(). SharePoint returns UTC; parsed in BST a month-boundary date can
// shift a day, which for a lump sum moves the whole fee into the wrong month
// and at a year end into the wrong year. Returns null on anything unparseable.
function monthKeyFromISO(iso) {
  if (!iso) return null;
  const key = String(iso).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
}

// Add n months to a 'YYYY-MM' key, rolling the year over. Integer arithmetic
// only — no Date object, for the same reason as above.
function addMonthsToKey(key, n) {
  if (!key) return null;
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1 + n;
  const year  = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function monthKeyYear(key)  { return parseInt(key.slice(0, 4), 10); }
function monthKeyMonth(key) { return parseInt(key.slice(5, 7), 10); } // 1-12

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
      const lastKey  = `${endMonth.getFullYear()}-${String(endMonth.getMonth() + 1).padStart(2, '0')}`;
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const billedFlag = a.Billed === 'Yes';
      for (const ev of _splitEvents) {
        if (ev.monthKey <= lastKey)  continue; // already emitted inside the loop
        if (ev.monthKey > todayKey)  continue; // future month, same cap as above
        const amount = Math.round(ev.amount * 100) / 100;
        rows.push({
          AssignmentID:     a.AssignmentID,
          EmployeeName:     a.EmployeeName,
          Level:            a.Level,
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

// ── Formatting ────────────────────────────────────────────────────────
function formatSalary(val) {
  if (!val) return '—';
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(num)) return val;
  return num.toLocaleString('en-GB');
}

function daysOpen(openDate, hireDate) {
  if (!openDate) return null;
  const start = utcDateOnly(openDate);
  if (!start) return null;
  const now = new Date();
  const end = hireDate ? utcDateOnly(hireDate)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}

// ── List sorting (N-247a) ─────────────────────────────────────────────
// Pure data side of the click-to-sort column headers. The header renderer
// (sortableHeader) and focus restore (focusSortHeader) live in
// list-controls.js; nothing here touches the DOM, so it is covered by
// tests/run.js.
//
// CONTRACT for every list page:
//   filters → page default sort → sortRows(user sort) → paginate → render
// Sorting BEFORE paginate() is what makes a sort reach every matched row,
// not just the rows currently on screen.

// Comparable key for `v` under `type`, or null when the value counts as
// EMPTY for that type (null/undefined, blank or whitespace-only string,
// unparseable number, unparseable date). Numbers strip thousands commas the
// same way formatSalary() does. Dates become spDateIn() 'YYYY-MM-DD' strings
// — never a Date built from a SharePoint string (Timezone discipline) — which
// also keeps the order identical to the date the cell displays.
function _sortKey(v, type) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  if (type === 'number') {
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  if (type === 'date') return spDateIn(v);
  return v;
}

// ASCENDING comparison of two NON-EMPTY values. Empties are handled by
// sortRows (always last), so call this through sortRows rather than directly.
//   text   — case-insensitive, numeric-aware ('Role 2' < 'Role 10')
//   number — numeric, commas stripped
//   date   — calendar day as displayed (spDateIn string compare)
//   enum   — position in `order` (e.g. CONFIG.ROLE_STAGES); values not in
//            `order` sort after every known value, then by text
function compareSortValues(a, b, type, order) {
  const ka = _sortKey(a, type);
  const kb = _sortKey(b, type);
  if (type === 'number') return ka - kb;
  if (type === 'date') return ka < kb ? -1 : ka > kb ? 1 : 0;
  if (type === 'enum' && Array.isArray(order)) {
    const ia = order.indexOf(ka);
    const ib = order.indexOf(kb);
    const ra = ia === -1 ? order.length : ia;
    const rb = ib === -1 ? order.length : ib;
    if (ra !== rb) return ra - rb;
  }
  return String(ka).localeCompare(String(kb), undefined, { sensitivity: 'base', numeric: true });
}

// Returns rows sorted by sortState = { key, dir: 'asc'|'desc' } using
// columns = { [key]: { type, get: row => rawValue, order? } }.
// A null state, or a key that isn't a column (stale state), returns `rows`
// itself, untouched — the page's default order stands. Otherwise returns a
// NEW array; the input is never mutated. Empties sort last in BOTH
// directions (Excel behaviour). Stable: ties keep their incoming order, so
// the page's default sort acts as the tie-breaker — load-bearing, don't
// swap in an unstable sort.
function sortRows(rows, sortState, columns) {
  if (!sortState || !columns || !Object.prototype.hasOwnProperty.call(columns, sortState.key)) return rows;
  const col  = columns[sortState.key];
  const sign = sortState.dir === 'desc' ? -1 : 1;
  const keyed = rows.map(function (row) {
    const v = col.get(row);
    return { row: row, v: v, empty: _sortKey(v, col.type) === null };
  });
  keyed.sort(function (x, y) {
    if (x.empty || y.empty) return x.empty === y.empty ? 0 : (x.empty ? 1 : -1);
    return sign * compareSortValues(x.v, y.v, col.type, col.order);
  });
  return keyed.map(function (k) { return k.row; });
}

// Header click cycle: a new column starts at asc; asc → desc → null
// (null = back to the page's default order).
function nextSortState(current, key) {
  if (!current || current.key !== key) return { key: key, dir: 'asc' };
  if (current.dir === 'asc') return { key: key, dir: 'desc' };
  return null;
}

// ── Date helpers (N-054: consolidated from forms.js + five duplicate/
// shim copies previously scattered across people-forms.js, mobile-app.js,
// lci-link.js, mobile-pages.js and mobile-roleform.js) ─────────────────

// Extracts 'YYYY-MM-DDT12:00:00Z' from a date-input value (or any string
// starting with YYYY-MM-DD); null if none. Midday UTC avoids the
// SharePoint UTC↔BST date-shift on write.
function isoDate(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] + 'T12:00:00Z' : null;
}

// Returns a UTC-midnight Date for the calendar day encoded in `dateStr`
// (ignores time-of-day/offset in the source string). Use this — never
// `new Date(str); d.setHours(0,0,0,0)` — for any day-overlap/day-count
// arithmetic: local setHours() zeroes wall-clock time, not the UTC
// instant, so months spanning a BST/GMT transition silently gain or lose
// an hour and skew fraction math (N-120 — MonthFraction came out 1.0013
// instead of 1.0 for a full month).
function utcDateOnly(dateStr) {
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
}

// N-087: canonical write-path helper for a Date object (isoDate() above
// covers the date-input-STRING case; this covers the case where the
// caller already has a Date). Reads the input via UTC getters only —
// never local getters — so the caller must hand it a Date whose UTC
// getters already reflect the intended calendar day (e.g. built via
// Date.UTC(...), same "UTC getters once inside date-safe code" discipline
// computeMonthlyRows follows per its N-120 comment). Returns null for
// anything that isn't a valid Date — a wrong type here should surface,
// not get silently coerced.
function spDateOut(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}T12:00:00Z`;
}

// N-087: canonical read-path helper for a SharePoint-returned datetime
// string (utcDateOnly() above covers the case where the caller needs a
// Date for arithmetic; this covers the case where a safe display/compare
// STRING is enough). Regex/string-slice only, same pattern as
// monthKeyFromISO() and for the same reason — never construct a Date from
// a SharePoint string and never call a local getter on it. That is
// precisely the operation that shifts the 1st of a month into the prior
// month under BST. Returns null on anything unparseable.
function spDateIn(str) {
  const match = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

// N-130: the MONTH a SharePoint month-marker date refers to, as 'YYYY-MM'.
// CoEPlanForecast.ForecastMonth is by contract always the 1st of a month, but
// three stored shapes exist: 'T00:00:00Z' (written while the site was on GMT),
// '(prev-day)T23:00:00Z' (written on BST — SharePoint resolves a bare date in
// the SITE's timezone, so 1 Jul 00:00 BST is stored as 30 Jun 23:00Z), and
// 'T12:00:00Z' (written via isoDate() from N-130 on). The BST shape is CONFIRMED
// against live data (14 Aug 2026): four real CoEPlanForecast rows read back as
// 2026-06-30T23:00:00Z, 2026-07-31T23:00:00Z, 2026-08-31T23:00:00Z and
// 2026-09-30T23:00:00Z — i.e. Jul/Aug/Sep/Oct markers, each stored on the last
// day of the preceding month. The GMT shape is inferred, not observed (no
// winter forecast month existed to check), but it is the benign one: no shift. Adding 12h before
// reading the UTC month collapses all three onto the intended month, and reads
// no local getter — so unlike the `new Date()` + local-getter code this
// replaced, it returns the same month in every browser timezone. That old read
// keyed the row to the PREVIOUS month on any browser behind the site's offset,
// silently dropping the figure out of the forecast table.
//
// This is the one place where `new Date(<SharePoint string>)` is correct: the
// value being recovered is an INSTANT, not a calendar day, and only UTC getters
// are read from it. Do NOT "fix" this to utcDateOnly() — that discards the time
// component the ±12h rounding depends on.
//
// Precondition: the stored instant is within ±12h of the intended month's 1st
// at UTC midnight, which holds for any SITE offset in ±12h (verified: correct
// through exactly +12, breaking only at +13). N-136: this ±12h is a DIFFERENT
// quantity from the ±11h browser-offset limit documented in coe-plan.js — that
// one governs reading a stored midday value with a local getter, this one
// governs how far the SharePoint site's own offset can move a bare write. Both
// figures are correct; do not reconcile them. Returns null on anything
// unparseable.
function spMonthIn(str) {
  const t = Date.parse(str);
  if (isNaN(t)) return null;
  const d = new Date(t + 12 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// N-088: the LOCAL calendar day as 'YYYY-MM-DD'. Use this — never
// `new Date().toISOString().split('T')[0]` — whenever "today", or a
// relative cutoff derived from it, is needed as a day string.
// toISOString() re-expresses a local instant in UTC, and under BST (local
// ahead of UTC) that returns YESTERDAY for any moment between 00:00 and
// 01:00 local. Local getters here are deliberate and are NOT a breach of
// spDateOut's "UTC getters only" rule: that rule governs a Date standing
// for a SharePoint calendar day, whereas this answers the local
// wall-clock question "what day is it where the user is". Same root cause
// as N-129, which fixed the identical pattern inside getWeekEnding();
// that function keeps its own inlined copy deliberately (see its comment)
// rather than being rewired through here.
function localDayISO(date = new Date()) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// N-330: 'YYYY-MM-DD' -> '13 October 2026' (en-GB long form). Builds a LOCAL
// date from the string's own parts, so no UTC shift either side of BST; null
// on anything unparseable. Report Builder title page date.
function formatLongDay(dayISO) {
  const m = String(dayISO || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// N-093 (F-2a): the earliest calendar day the Placements page's existing
// month/quarter/year filter can possibly match, as 'YYYY-MM-DD', or null
// when no filter is set. Used ONLY as a server-side `ge` lower bound — it is
// deliberately loose (a quarter/month filter returns that year's 1 January),
// because placementInFilter() (pages-model.js) still applies the exact test client-side. A
// loose lower bound over-fetches and stays correct; a tight one that got the
// boundary wrong would silently drop placements.
// Local getters, matching localDayISO's reasoning: this answers "what does
// the user's wall-clock year look like", not "what calendar day does a
// SharePoint value stand for".
// N-151: the calendar day `weeks` weeks before today, as 'YYYY-MM-DD', or
// null for 0 — which must produce NO date clause at all, per
// CONFIG.DATE_WINDOW_WEEKS. localDayISO, not spDateOut: this is a local
// wall-clock "N weeks ago", which is exactly what localDayISO answers.
function weeksAgoDay(weeks, today = new Date()) {
  const w = Number(weeks);
  if (!w) return null;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - (w * 7));
  return localDayISO(cutoff);
}

// N-270: the WeeklyActivity rows whose WeekEndingDate falls on/after the day
// `weeks` weeks ago — the client-side equivalent of
// getActivityForAnalytics(weeks), for a page that fetches a longer window
// once and needs a shorter slice of it too. spDateIn, never a raw
// truncation (F-12). 0/falsy `weeks` = no window, every row returned.
function activitySinceWeeks(acts, weeks, today = new Date()) {
  const from = weeksAgoDay(weeks, today);
  if (!from) return acts || [];
  return (acts || []).filter(a => {
    const day = a && a.WeekEndingDate ? spDateIn(a.WeekEndingDate) : null;
    return !!day && day >= from;
  });
}

// N-342: the getHistoricalPlacements() rows whose placementDate (Offer
// Accepted) falls on/after the day `weeks` weeks ago — the placements twin of
// activitySinceWeeks, so People Scorecards (desktop + mobile) and the Command
// Centre project cards cut placements by ONE rule. Whole days via spDateIn,
// never a Date compare: a `new Date(placementDate) >= now - 91d` cut is
// time-of-day sensitive and dropped a placement exactly 13 weeks old.
// 0/falsy `weeks` = no window, every row returned. A row with no usable
// placementDate is dropped when a window applies.
function placementsSinceWeeks(placements, weeks, today = new Date()) {
  const from = weeksAgoDay(weeks, today);
  if (!from) return placements || [];
  return (placements || []).filter(p => {
    const day = p && p.placementDate ? spDateIn(p.placementDate) : null;
    return !!day && day >= from;
  });
}

// N-151: the lower bound for a list query that has BOTH a background date
// window and an optional explicit period selection. The query must be a
// superset of whatever either control needs, so an explicit selection WIDENS
// the window rather than intersecting with it — otherwise picking "Jan" under
// a 13-week window returns nothing, from two controls that each look correct.
// A null window means "All time" and always wins; a null selection means the
// selection imposes no requirement and the window stands.
function listQueryFromDay(windowDay, selectionDay) {
  if (!windowDay) return null;
  if (!selectionDay) return windowDay;
  return selectionDay < windowDay ? selectionDay : windowDay;
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Returns the Sunday on/after `date` (or today, if omitted) as 'YYYY-MM-DD'.
// WeeklyActivity.WeekEndingDate buckets on this Sunday boundary, not
// Friday — verify against that convention before changing this.
function getWeekEnding(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  // N-129: local getters, not toISOString(). getDay()/setDate() above
  // already computed the right Sunday in LOCAL calendar terms — routing
  // the result back through toISOString() re-expresses it in UTC, and in
  // BST (local ahead of UTC) that rolls it back to the previous day. This
  // also silently fixed a same-Sunday-input case that was off by a day
  // for the identical reason.
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ── Day-string arithmetic (N-271) ────────────────────────────────────
// Pure 'YYYY-MM-DD' maths for the WeeklyActivity anomaly checks. UTC getters
// only, via utcDateOnly() — no local getter ever sees these dates, so BST/GMT
// cannot shift a day (F-12). Null for anything unparseable.
function addDaysISO(dayISO, n) {
  const d = utcDateOnly(dayISO);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// The Sunday on/after a day — the same bucket getWeekEnding() gives a Date,
// for a day string.
function sundayOnOrAfterISO(dayISO) {
  const d = utcDateOnly(dayISO);
  return d ? addDaysISO(dayISO, (7 - d.getUTCDay()) % 7) : null;
}

// Median of the finite numbers in `nums`; null when there are none. The input
// is not mutated.
function medianOf(nums) {
  const a = (nums || []).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}


// ── Activity field summation ─────────────────────────────────────────
function sumField(acts, field) {
  return acts.reduce((s, a) => s + (Number(a[field]) || 0), 0);
}

// ── Ghost / impersonation mode ────────────────────────────────────────
// Admin-only. Temporarily resolves role/project scope as a real chosen user
// instead of the signed-in admin. Stored in sessionStorage — cleared on
// sign-out or by clearGhostUser().

const GHOST_USER_KEY  = 'newton_ghost_user';
const GHOST_LABEL_KEY = 'newton_ghost_label';

// N-282 / SEC-2: Ghost Mode is honoured ONLY while this flag is true. It is
// set by api.js (_verifyGhost / getEffectiveRole) after the REAL signed-in
// account — MSAL, via getCurrentUser() — has resolved as admin, and is never
// read from storage. Default false = fail closed: until that check has run on
// a page, getGhostUser() reports "no ghost" and every caller sees the real
// identity. Strictly boolean true only.
let _ghostRealAdmin = false;
function _setGhostRealAdmin(isAdmin) { _ghostRealAdmin = isAdmin === true; }

// True when a ghost key is stored. Raw — says nothing about whether ghost is
// honoured (see getGhostUser()). Used only by api.js's ghost gate.
function _hasStoredGhost() {
  try { return !!sessionStorage.getItem(GHOST_USER_KEY); } catch (e) { return false; }
}

// Returns true when ghost mode was set, false when refused (not a real admin).
function setGhostUser(email, displayName) {
  if (!_ghostRealAdmin) return false;
  sessionStorage.setItem(GHOST_USER_KEY, email.toLowerCase());
  sessionStorage.setItem(GHOST_LABEL_KEY, displayName || email);
  // N-176/N-205: entering ghost mode changes which rows the UI derives from a
  // cached list. Purging tier 1 (_apiCache) and tier 2 (sessionStorage) on
  // both transitions is cheaper and safer than reasoning about which lists
  // happen to be identity-independent. Guarded because utils.js parses
  // before graph-client.js.
  if (typeof _apiCache !== 'undefined') _apiCache.clear();
  if (typeof _ssPurge === 'function') _ssPurge();
  return true;
}
function getGhostUser() {
  if (!_ghostRealAdmin) return null;
  return sessionStorage.getItem(GHOST_USER_KEY);
}
function getGhostLabel() {
  if (!_ghostRealAdmin) return null;
  return sessionStorage.getItem(GHOST_LABEL_KEY);
}
function clearGhostUser() {
  sessionStorage.removeItem(GHOST_USER_KEY);
  sessionStorage.removeItem(GHOST_LABEL_KEY);
  // N-176/N-205: see setGhostUser() — purge tier 1 and tier 2 on the way out too.
  if (typeof _apiCache !== 'undefined') _apiCache.clear();
  if (typeof _ssPurge === 'function') _ssPurge();
}

function exitGhostMode() {
  clearGhostUser();
  // Reload the current page to re-initialise with the real role
  window.location.reload();
}

// Effective identity for READ-scoping "my own records" views (e.g. a
// Talent Partner's own Weekly Activity, their own Scorecard) — the ghosted
// user's email when Ghost Mode is active, else the real signed-in user's.
// Distinct from getCurrentUser().email, which must stay untouched wherever
// an action is being ATTRIBUTED (ChangedBy, CreatedByEmail, ReportOwner,
// etc.) — ghosting never changes who is really making a change, only what
// they can see.
function getScopedUserEmail() {
  return (getGhostUser() || getCurrentUser()?.email || '').toLowerCase();
}

// ── Theme (light / dark) ────────────────────────────────────────────
// Explicit user choice, once made, overrides prefers-color-scheme permanently.
// theme-init.js sets the initial data-theme attribute before first paint using
// the same localStorage key — keep THEME_KEY's value in sync with the literal
// string in theme-init.js if it ever changes.
const THEME_KEY = 'newton_theme';

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function setTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}

// ── Density (comfortable / compact) ─────────────────────────────────
// Same pattern as Theme above. theme-init.js sets the initial data-density
// attribute before first paint using the same localStorage key — keep
// DENSITY_KEY's value in sync with the literal string in theme-init.js if
// it ever changes.
const DENSITY_KEY = 'newton_density';

function getDensity() {
  return document.documentElement.getAttribute('data-density') === 'compact' ? 'compact' : 'comfortable';
}
function setDensity(density) {
  if (density === 'compact') {
    document.documentElement.setAttribute('data-density', 'compact');
  } else {
    document.documentElement.removeAttribute('data-density');
  }
  try { localStorage.setItem(DENSITY_KEY, density); } catch (e) {}
}

// ── Project Active/Archive (N-112) ─────────────────────────────
// Active bucket = Status Active or Transition. Archive bucket = Status
// Completed. This is the single source of truth for that line — every
// caller filters through this predicate rather than checking p.Status inline.
function isProjectActive(project) {
  return project?.Status !== 'Completed';
}

// N-364: the Project page header, as ordered { label, value } plain strings
// (project-page.js escapes them). Lead DM is Projects.DeliveryManager (D-5);
// dmMap is email -> display name. Blank values read '—'.
function projectPageFields(project, dmMap) {
  const p  = project || {};
  const dm = p.DeliveryManager ? String(p.DeliveryManager) : '';
  return [
    { label: 'Type',    value: p.ProjectType || '—' },
    { label: 'Status',  value: p.Status || '—' },
    { label: 'Start',   value: spDateIn(p.StartDate) || '—' },
    { label: 'End',     value: spDateIn(p.EndDate) || '—' },
    { label: 'Lead DM', value: dm ? ((dmMap && dmMap[dm.toLowerCase()]) || dm) : '—' },
  ];
}

// N-356: 'current' for pickers that must exclude Transition as well as
// Completed (User Assignments → Customer). Narrower than isProjectActive()
// above — do not merge the two. 'Active' is the same literal getProjects(true)
// filters on.
function isProjectCurrent(project) {
  return project?.Status === 'Active';
}

// N-356: display labels for a project <select> in which one customer can have
// several projects. Returns a Map of String(id) → PLAIN-TEXT label (callers
// escape). A customer listed once keeps its plain CustomerName. A customer
// listed more than once (name compared trimmed, case- and space-insensitive)
// reads 'Name (ProjectType)'; if the type is blank or the label still
// collides, the StartDate month is added: 'Name (CoE, from 2026-03)' /
// 'Name (from 2026-03)'. With no StartDate the label is left as it is. Labels
// only — an option's value must keep the raw CustomerName. Pure; the input is
// not mutated.
function projectOptionLabels(projects) {
  const list = projects || [];
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const tally = keyOf => list.reduce((acc, p) => {
    const k = keyOf(p);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const nameCounts = tally(p => norm(p.CustomerName));
  const isShared = p => nameCounts[norm(p.CustomerName)] > 1;
  const typed = p => (isShared(p) && p.ProjectType
    ? `${p.CustomerName || ''} (${p.ProjectType})`
    : (p.CustomerName || ''));
  const typedCounts = tally(p => norm(typed(p)));
  const labels = new Map();
  list.forEach(p => {
    let label = typed(p);
    if (isShared(p) && (!p.ProjectType || typedCounts[norm(label)] > 1)) {
      const month = monthKeyFromISO(p.StartDate);
      if (month) {
        label = p.ProjectType
          ? `${p.CustomerName || ''} (${p.ProjectType}, from ${month})`
          : `${p.CustomerName || ''} (from ${month})`;
      }
    }
    labels.set(String(p.id), label);
  });
  return labels;
}

// Returns a NEW array sorted by CustomerName A-Z. Does not mutate the input.
function sortProjectsByName(projects) {
  return [...projects].sort((a, b) => (a.CustomerName || '').localeCompare(b.CustomerName || ''));
}

// Flat, escaped <option> list for a project array — no grouping, no "All
// Projects" default. Shared by every project <select> in the app.
function buildProjectOptionsHtml(projects, selectedId) {
  return projects.map(p =>
    `<option value="${p.id}" ${String(selectedId) === String(p.id) ? 'selected' : ''}>${escHtml(p.CustomerName)}</option>`
  ).join('');
}

// ── Internal project (N-333) ─────────────────────────────────────
// The Momentum-internal Projects row (Internal TA hiring) has ProjectType
// CONFIG.PROJECT_TYPE_INTERNAL. Its rows show on its own project-scoped pages
// and on one TP's own scorecard, but never in a company aggregate, learned
// benchmark or RAG. Every such consumer filters ONCE, at load, through
// excludeInternalProjectData() — the list is tests/lint-internal-kpi.js.
function isInternalProject(p) {
  return !!p && p.ProjectType === CONFIG.PROJECT_TYPE_INTERNAL;
}

// ── No-dashboard project types (N-362, D-4) ──────────────────────
// LCI and Transformation are Projects with no Project Dashboard.
// CONFIG.NO_DASHBOARD_PROJECT_TYPES is read ONLY here; every other file asks
// one of these helpers (tests/lint-project-types.js fails on a direct compare).
// String-level, so it also works on an Assignments.ProjectType value that has
// no Projects row yet.
function isNoDashboardType(type) {
  return !!type && CONFIG.NO_DASHBOARD_PROJECT_TYPES.includes(type);
}

function isNoDashboardProject(p) {
  return !!p && isNoDashboardType(p.ProjectType);
}

// Excluded from company KPIs, benchmarks, RAG and Snapshots: the internal
// project (own dashboard, never a company figure) or a no-dashboard project.
// Org Chart uses isInternalProject() alone — LCI / Transformation projects
// belong there.
function isKpiExcludedProject(p) {
  return isInternalProject(p) || isNoDashboardProject(p);
}

// Project pickers (role / activity / placement forms, Project Dashboard,
// Report Builder project scope): drops no-dashboard projects. Apply BEFORE
// any "only one project → lock the picker" test.
function dashboardProjects(projects) {
  return (projects || []).filter(p => !isNoDashboardProject(p));
}

// Sales Forecast type dropdown: every type that can be forecast, i.e. not
// no-dashboard and not Internal. A fresh array each call.
function salesForecastTypes() {
  return CONFIG.PROJECT_TYPES.filter(t => !isNoDashboardType(t) && t !== CONFIG.PROJECT_TYPE_INTERNAL);
}

// Set of String(project id) for every KPI-excluded project (internal or
// no-dashboard), archived included.
function kpiExcludedProjectIdSet(projects) {
  return new Set((projects || []).filter(isKpiExcludedProject).map(p => String(p.id)));
}

// Set of String(role id) whose project is KPI-excluded. Role → project is
// ProjectIDLookupId || ProjectID, as dashboard-company.js and the Snapshots writer.
function kpiExcludedRoleIdSet(roles, projects) {
  const pids = kpiExcludedProjectIdSet(projects);
  if (!pids.size) return new Set();
  return new Set((roles || [])
    .filter(r => r && pids.has(String(r.ProjectIDLookupId || r.ProjectID)))
    .map(r => String(r.id)));
}

// Role id of a row, per data key. Activity is keyed by ROLE, never by
// WeeklyActivity.ProjectID (an unvalidated copy — N-315); Placements and
// RejectedOffers have no ProjectID at all. `historical` = getHistoricalPlacements()
// rows, whose `id` is the pipeline (role) id.
const _INTERNAL_ROW_ROLE_ID = {
  activity:   r => r.RoleIDLookupId || r.RoleID,
  placements: r => r.RoleIDLookupId || r.RoleID,
  rejections: r => r.RoleIDLookupId || r.RoleID,
  stageRows:  r => r.RoleIDLookupId || r.RoleID,
  headcount:  r => r.RoleID,
  historical: r => r.id,
};

// THE shared filter. `data` holds any subset of: projects, roles, activity,
// placements, rejections, stageRows, headcount, historical. `ctx.projects` =
// every Projects row (getProjects(false)) — required; `ctx.roles` = the FULL
// role list used to map rows to projects (defaults to data.roles).
// Returns a NEW object, same keys, internal- and no-dashboard-project rows removed
// (N-362: the name stays, 15+ call sites and the lint list use it); null /
// undefined values pass through (degraded reads). With no internal project the
// input arrays come back as-is (no copy). Never mutates its inputs. An unknown
// key, a missing ctx.projects, or role-keyed rows with no roles to map them
// THROW: a programming error must fail loudly, never let internal rows through.
function excludeInternalProjectData(data, ctx = {}) {
  const src  = data || {};
  const keys = Object.keys(src);
  keys.forEach(k => {
    if (k !== 'projects' && k !== 'roles' && !_INTERNAL_ROW_ROLE_ID[k]) {
      throw new Error(`excludeInternalProjectData: unknown key '${k}'`);
    }
  });
  if (!Array.isArray(ctx.projects)) {
    throw new Error('excludeInternalProjectData: ctx.projects (every Projects row) is required');
  }
  const roles = ctx.roles || src.roles;
  if (!roles && keys.some(k => _INTERNAL_ROW_ROLE_ID[k] && src[k] != null)) {
    throw new Error('excludeInternalProjectData: role-keyed rows need ctx.roles or data.roles');
  }
  const out  = {};
  const pids = kpiExcludedProjectIdSet(ctx.projects);
  if (!pids.size) { keys.forEach(k => { out[k] = src[k]; }); return out; }
  const rids = kpiExcludedRoleIdSet(roles, ctx.projects);
  keys.forEach(k => {
    const rows = src[k];
    if (rows == null) { out[k] = rows; return; }
    if (k === 'projects')   out[k] = rows.filter(p => !isKpiExcludedProject(p));
    else if (k === 'roles') out[k] = rows.filter(r => !(r && pids.has(String(r.ProjectIDLookupId || r.ProjectID))));
    else                    out[k] = rows.filter(r => !(r && rids.has(String(_INTERNAL_ROW_ROLE_ID[k](r)))));
  });
  return out;
}

// Project form Project Type options (N-333, N-362): every type except the
// no-dashboard ones, which only the N-363 migration creates (dormant). Editing
// a project that already has a no-dashboard type passes it as `currentType` so
// the select keeps it instead of silently switching the type.
function projectFormTypes(currentType) {
  const types = CONFIG.PROJECT_TYPES.filter(t => !isNoDashboardType(t));
  if (isNoDashboardType(currentType)) types.push(currentType);
  return types;
}

// ── SLA targets (N-381 / DA-1) ────────────────────────────────────────
// Pure: no Graph, no DOM. Rows come from getSLATargets() (api.js); see CONFIG.SLA.
// Project types that can have SLAs: every type with a dashboard except the internal project
// (N-333, excluded from client KPIs). Derived, so a new project type changes this by
// derivation, not by edit. A fresh array each call.
function slaProjectTypes() {
  return CONFIG.PROJECT_TYPES.filter(t => !isNoDashboardType(t) && t !== CONFIG.PROJECT_TYPE_INTERNAL);
}

// A target value: a finite number above zero, else null (blank / 0 / negative / junk = no target).
function slaCleanValue(v) {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 'override' when ProjectID > 0 (wins even if ProjectType is also set), 'default' when
// ProjectType is non-blank, else null (ignored).
function slaRowKind(row) {
  if (!row) return null;
  const pid = Number(row.ProjectID);
  if (Number.isFinite(pid) && pid > 0) return 'override';
  return String(row.ProjectType == null ? '' : row.ProjectType).trim() ? 'default' : null;
}

// The lowest SharePoint item id of a non-empty row list - the deterministic tie-break when a
// key has duplicate rows.
function _slaLowestIdRow(rows) {
  return rows.reduce((a, b) => (Number(b.id) < Number(a.id) ? b : a));
}

// What are this project's SLA targets? null = the project cannot have SLAs (no project, or a
// type outside slaProjectTypes() - LCI, Transformation, Internal, unknown - even if a row
// exists). Otherwise one { value, source } per CONFIG.SLA.METRICS key: the project's override
// row, else its type's default row, else { value: null, source: null }. Resolved per metric,
// so a partial override inherits the rest. Duplicate rows for a key: lowest item id wins.
function slaTargetsFor(project, rows) {
  if (!project || !slaProjectTypes().includes(project.ProjectType)) return null;
  const all = Array.isArray(rows) ? rows : [];
  const pid = Number(project.id);
  const overrides = all.filter(r => slaRowKind(r) === 'override' && Number(r.ProjectID) === pid);
  const defaults = all.filter(r => slaRowKind(r) === 'default' && String(r.ProjectType).trim() === project.ProjectType);
  const ov = overrides.length ? _slaLowestIdRow(overrides) : null;
  const df = defaults.length ? _slaLowestIdRow(defaults) : null;
  const out = {};
  CONFIG.SLA.METRICS.forEach(m => {
    const o = ov ? slaCleanValue(ov[m.column]) : null;
    if (o !== null) { out[m.key] = { value: o, source: 'override' }; return; }
    const d = df ? slaCleanValue(df[m.column]) : null;
    out[m.key] = d !== null ? { value: d, source: 'default' } : { value: null, source: null };
  });
  return out;
}

// The default rows Seed defaults would create: one per eligible type that has no default row
// yet. Existing rows never appear in the plan, so seeding cannot overwrite an edited row.
// Metrics without a CONFIG.SLA.SEED_DEFAULTS value are omitted (blank), never written as 0.
function slaSeedPlan(rows) {
  const have = new Set((Array.isArray(rows) ? rows : [])
    .filter(r => slaRowKind(r) === 'default')
    .map(r => String(r.ProjectType).trim()));
  const seed = {};
  CONFIG.SLA.METRICS.forEach(m => {
    if (CONFIG.SLA.SEED_DEFAULTS[m.key] !== undefined) seed[m.column] = CONFIG.SLA.SEED_DEFAULTS[m.key];
  });
  return slaProjectTypes()
    .filter(t => !have.has(t))
    .map(t => Object.assign({ Title: 'Default · ' + t, ProjectType: t }, seed));
}

// ── Text escaping ─────────────────────────────────────────────
// Escape a value for safe interpolation into an HTML template string.
function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// As escHtml, but preserves user line breaks as <br>.
function escHtmlLines(str) {
  return escHtml(str).replace(/\r?\n/g, '<br>');
}

// Fill "{key}" placeholders from an object — fillTemplate('M{n}', { n: 9 })
// → 'M9'. An unknown key is left as-is so a typo shows up on screen rather
// than silently vanishing. Plain text out: escape at the HTML call site.
function fillTemplate(tpl, vals) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) =>
    (vals && vals[k] !== undefined && vals[k] !== null ? String(vals[k]) : m));
}

// ── Breadcrumb (N-255a) ───────────────────────────────────────
// Pure markup builder for the "Home › Module › Page" trail. No DOM, no
// CONFIG — nav-core.js's renderBreadcrumb() supplies the segments from
// router state; N-255b (record-level segments, mobile) reuses this.
// segments: [{ label, href? }, …] — the LAST segment is the current page and
// always renders as aria-current text, never a link. Ancestors without an
// href render as plain text. Separators are CSS ::before (not in the DOM).
//   breadcrumbHTML([{label:'Home',href:'index.html'},{label:'Org Chart'}])
function breadcrumbHTML(segments) {
  if (!Array.isArray(segments)) return '';
  const segs = segments.filter(s => s && s.label);
  if (!segs.length) return '';
  const items = segs.map((s, i) => {
    const label = escHtml(s.label);
    let inner;
    if (i === segs.length - 1) {
      inner = `<span class="breadcrumb__current" aria-current="page">${label}</span>`;
    } else if (s.href) {
      inner = `<a class="breadcrumb__link" href="${escAttr(s.href)}">${label}</a>`;
    } else {
      inner = `<span class="breadcrumb__text">${label}</span>`;
    }
    return `<li class="breadcrumb__item">${inner}</li>`;
  }).join('');
  return `<nav aria-label="Breadcrumb" class="breadcrumb"><ol class="breadcrumb__list">${items}</ol></nav>`;
}

// ── RAG markers (N-254) ───────────────────────────────────────
// Non-colour differentiator for red / amber states: a glyph from
// CONFIG.RAG_MARKERS, optionally with its visible label. Colour is inherited
// (currentColor) from the host element. Green / grey / neutral / unknown
// return '' — only exceptions get a marker.
//   ragMarkerHTML('red')                  → ⚠ glyph, accessible name "At risk"
//   ragMarkerHTML('amber', { label: true }) → ! glyph (aria-hidden) + "Watch"
function ragMarkerHTML(rag, { label = false } = {}) {
  const key = String(rag ?? '').toLowerCase();
  const markers = CONFIG.RAG_MARKERS;
  if (!Object.prototype.hasOwnProperty.call(markers, key)) return '';
  const m = markers[key];
  const text = escHtml(m.label);
  if (label) {
    return `<span class="rag-marker rag-marker--${key}"><span class="rag-marker__glyph" aria-hidden="true">${m.glyph}</span><span class="rag-marker__label">${text}</span></span>`;
  }
  return `<span class="rag-marker rag-marker--${key}" role="img" aria-label="${text}" title="${text}">${m.glyph}</span>`;
}

// ── Scorecard card (N-336) ────────────────────────────────────
// One card's markup, shared by People Scorecards (analytics-pages.js) and the
// Command Centre Project Health detail (cc-pages.js). `healthRows` =
// scorecardHealthRows(); `metrics` = computeFunnelScorecard() rows, with
// `tip` from scorecardMetricTips() where wanted. Plain strings in — every
// text value is escaped here. No inline styles (N-324): classes only.
function scorecardCardHTML({ title, windowLabel, healthRows = [], metrics = [] }) {
  const tipAttr = tip => tip ? ` title="${escHtml(tip)}"` : '';
  const health = healthRows.map(h => `<tr>
      <td class='sc-label'>${escHtml(h.label)}</td>
      <td class='sc-value sc-value--center sc-grey'${tipAttr(h.tip)}>${escHtml(h.value)}</td>
    </tr>`).join('');
  const rows = metrics.map(m => {
    const display  = m.value !== null ? `${m.value}${m.unit === '%' ? '%' : ' ' + m.unit}` : '—';
    const ragClass = m.informational ? 'sc-grey' : `sc-${m.rag}`;
    return `<tr>
      <td class='sc-label'>${escHtml(m.label)}</td>
      <td class='sc-value sc-value--center ${ragClass}'${tipAttr(m.tip)}>${m.informational ? '' : ragMarkerHTML(m.rag)}${escHtml(display)}</td>
    </tr>`;
  }).join('');
  return `<div class='dash-panel sc-card'>
    <div class='sc-card__head'>
      <h3 class='panel-title sc-tp-name'>${escHtml(title)}</h3>
      <span class="sc-rag-pill sc-rag-pill--grey">NOT RATED</span>
    </div>
    <p class='sc-window'>${escHtml(windowLabel)}</p>
    <table class='sc-table'><tbody>${health}${rows}</tbody></table>
  </div>`;
}

// The two pipeline-health rows on a scorecard card. `roleHealth` =
// tallyRoleFlags() output; null → no rows. A pipeline can be both stuck and
// low-conversion, so the tooltip's two numbers can sum past the flagged count.
function scorecardHealthRows(roleHealth, flaggedLabel) {
  if (!roleHealth) return [];
  const of = n => roleHealth.total > 0 ? `${n || 0}/${roleHealth.total}` : '—';
  return [
    { label: flaggedLabel, value: of(roleHealth.flagged),
      tip: `Stuck in stage: ${roleHealth.stuck || 0} · Low conversion: ${roleHealth.conversion || 0}` },
    { label: `Behind ${CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays}-day pace`, value: of(roleHealth.behind) },
  ];
}

// ── Status text, neutral by default (N-257) ───────────────────
// The single place that decides green renders neutral: green / grey text
// gets no marker and no status colour (grey is muted via CSS); amber / red
// get their N-254 marker and style.css colours them (amber: glyph only, text
// stays --text-primary for contrast; red: --status-danger + bold).
//   ragTextHTML('green', '85%') → <span class="rag-text rag-text--green">85%</span>
//   ragTextHTML('red', '62%')   → <span class="rag-text rag-text--red">⚠62%</span>
// `text` is escaped here — pass plain strings.
function ragTextHTML(rag, text) {
  const key = String(rag ?? '').toLowerCase();
  const body = escHtml(text);
  const marker = ragMarkerHTML(key);
  if (marker) return `<span class="rag-text rag-text--${key}">${marker}${body}</span>`;
  if (key === 'green' || key === 'grey') return `<span class="rag-text rag-text--${key}">${body}</span>`;
  return `<span class="rag-text">${body}</span>`;
}

// Escape for safe interpolation into a double-quoted HTML attribute.
// Example: value="${escAttr(title)}" where title may contain "
function escAttr(str) {
  return String(str ?? '').replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[c]);
}

// Escape for safe interpolation into a JavaScript string inside an HTML attribute.
// Legacy: only needed for the inline handler attributes N-302 is retiring; new
// markup passes data through act()/actOn() (actions.js), which needs no escaping.
// Handles a title containing ' or \
// Escape backslash first, then apostrophe in JS-safe way, then HTML entities.
function escJsAttr(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')      // backslash to \\
    .replace(/'/g, "\\'")        // apostrophe to \'
    .replace(/&/g, '&amp;')      // ampersand (HTML)
    .replace(/"/g, '&quot;')     // quote (HTML attribute)
    .replace(/</g, '&lt;')       // less-than (defensive)
    .replace(/>/g, '&gt;');      // greater-than (defensive)
}

// ── OData + upload guards (N-284) ───────────────────────────────
// Escape a string value for use INSIDE the single quotes of an OData $filter:
//   `fields/Title eq '${odataStr(email)}'`
// Doubles every apostrophe (o'brien → o''brien). Returns the inner text only —
// the caller keeps the quotes. Do NOT also encodeURIComponent it: getItems()
// already encodes the whole filter once (graph-client.js).
function odataStr(v) {
  return String(v ?? '').replace(/'/g, "''");
}

// Check a File against CONFIG.UPLOADS[kind] before uploading/reading it.
// Reads only .name, .size and .type, so tests can pass plain objects.
// Returns { ok: true, ext, mime } — both taken from the allowlist, never echoed
// from the file — or { ok: false, reason } with a user-facing reason.
// An EMPTY file.type is accepted (some browsers leave it blank for Office/PDF
// files) provided the extension passes; a non-blank type that does not match
// the extension's allowlisted MIME is rejected.
function validateUpload(file, kind) {
  const cfg = CONFIG.UPLOADS[kind];
  if (!cfg) throw new Error('Unknown upload kind: ' + kind);
  if (!file) return { ok: false, reason: 'No file selected.' };
  const max = kind === 'LOGO' ? CONFIG.BRIEFING_PACK.CLIENT_LOGO_MAX_BYTES : cfg.MAX_BYTES;
  const fmt = n => n >= 1024 * 1024 ? (n / (1024 * 1024)).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
  const name = String(file.name || '');
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (!cfg.EXTS.includes(ext)) {
    return { ok: false, reason: cfg.NAME + ' must be ' + cfg.ALLOWED + '.' };
  }
  const mime = CONFIG.UPLOADS.MIME_BY_EXT[ext];
  const type = String(file.type || '').toLowerCase();
  if (type && type !== mime) {
    // jpg/jpeg may arrive as either spelling of the same type; everything else must match exactly.
    return { ok: false, reason: cfg.NAME + ' must be ' + cfg.ALLOWED + '.' };
  }
  const size = Number(file.size);
  if (!(size > 0)) return { ok: false, reason: 'That file is empty.' };
  if (size > max) {
    return { ok: false, reason: 'That file is ' + fmt(size) + ' \u2014 the limit for ' + cfg.NAME.toLowerCase() + ' is ' + fmt(max) + '.' };
  }
  return { ok: true, ext: ext === 'jpeg' ? 'jpg' : ext, mime: mime };
}

// accept="" value for <input type=file>, generated from the same allowlist.
function uploadAcceptAttr(kind) {
  return CONFIG.UPLOADS[kind].EXTS.map(e => '.' + e).join(',');
}

// Safe stored filename: basename only, [A-Za-z0-9._-], capped, forced extension.
function safeUploadName(name, ext, maxLen = 60) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|[._]+$/g, '').slice(0, maxLen);
  return (base || 'file') + '.' + ext;
}

// ── Sign-in helpers (N-290 / SEC-10) ─────────────────────────────
// Pure. auth.js calls both from authReady(). No MSAL, no storage access.

// True for a localStorage key MSAL v2 wrote: the msal.* index and
// active-account keys, token entries (they contain the app's client ID) and
// account entries (they contain the tenant ID). v5 keeps tokens in
// sessionStorage and leaves these behind, so authReady() deletes them.
// Never matches a Newton key (newton_*, userName, benchSyncLast).
function isLegacyMsalStorageKey(key, clientId, tenantId) {
  const k = String(key || '').toLowerCase();
  if (!k) return false;
  if (k.startsWith('msal.')) return true;
  const c = String(clientId || '').toLowerCase();
  const t = String(tenantId || '').toLowerCase();
  return (c !== '' && k.includes(c)) || (t !== '' && k.includes(t));
}

// The one automatic sign-in redirect per tab: only when nobody is signed in,
// it hasn't already been tried in this tab, the user didn't just sign out,
// and the URL isn't carrying a Microsoft response.
function shouldAutoSignIn({ hasAccount, triedThisTab, signedOut, authResponseInUrl } = {}) {
  return !hasAccount && !triedThisTab && !signedOut && !authResponseInUrl;
}

// N-374: the page + ?query + #hash a sign-in should return to. auth.js saves it
// in sessionStorage before the Microsoft redirect and restores it afterwards.
// Pure. Returns a same-site relative target ('reporting.html#projects?...') or
// null when there is nothing worth keeping or it is unsafe: not a string, over
// 500 chars, control characters, backslash, '..', a scheme or '//', a page that
// isn't name.html, mobile.html (its own app-login routing), redirect.html (the
// silent-token bridge), a Microsoft response (code= / error= / state= ...) in
// the query or hash, or the bare site root / index.html with no hash.
function safeReturnTarget(href) {
  if (typeof href !== 'string') return null;
  const s = href.trim();
  if (!s || s.length > 500) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(s) || s.indexOf('..') !== -1) return null;
  const m = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(s);
  if (!m) return null;
  const path = m[1], query = m[2] || '', hash = m[3] || '';
  if (path.indexOf('//') === 0 || !/^[A-Za-z0-9_\-\/.]*$/.test(path)) return null;
  if (/[?#&](code|error|error_description|state|id_token|client_info)=/.test(query + hash)) return null;
  const seg  = path.split('/').pop();
  const page = seg === '' ? 'index.html' : seg;
  if (!/^[A-Za-z0-9_-]+\.html$/.test(page)) return null;
  if (page === 'mobile.html' || page === 'redirect.html') return null;
  if (page === 'index.html' && !query && !hash) return null;
  return page + query + hash;
}

// N-374: is a safeReturnTarget() result on the page the browser is already on?
// pathname is location.pathname; a trailing slash means index.html.
function sameReturnPage(target, pathname) {
  const targetPage = String(target || '').split(/[?#]/)[0];
  const current    = String(pathname || '').split('/').pop() || 'index.html';
  return targetPage === current;
}

// ── Fuzzy search (N-144) ─────────────────────────────────────────
// Case-insensitive subsequence match: every character of `query` must
// appear in `text`, in order (not necessarily contiguous). Returns a
// numeric score (higher = better) or null when query isn't a subsequence
// of text at all. Rewards a match starting at position 0 and rewards
// runs of consecutive matched characters, so short queries rank a
// prefix/contiguous hit above a scattered one. Pure function — no
// network I/O, no DOM — used by js/command-bar.js to filter
// CONFIG.COMMAND_BAR_PAGES against what the user types.
function fuzzyMatch(query, text) {
  const q = String(query ?? '').toLowerCase().trim();
  const t = String(text ?? '').toLowerCase();
  if (!q) return 0;
  let score = 0;
  let searchFrom = 0;
  let runLength = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], searchFrom);
    if (idx === -1) return null;
    if (idx === searchFrom) {
      runLength++;
      score += runLength * 2; // consecutive-match bonus, compounding
    } else {
      runLength = 1;
      score += 1;
    }
    if (idx === 0) score += 3; // starts-with bonus
    searchFrom = idx + 1;
  }
  return score;
}

// Wraps a write with instant, reversible UI feedback: apply() mutates the
// view synchronously, commit() performs the real write in the background,
// and either resolves silently (view and server now agree) or the change
// is rolled back and an error toast with a Retry action is shown. No
// network calls of its own -- commit() supplies the write.
async function optimisticWrite({ apply, revert, commit, errorMessage = "That didn't save — change reverted.", toastFn = toast } = {}) {
  apply();
  try {
    return await commit();
  } catch (err) {
    await revert();
    toastFn(errorMessage, {
      type: 'error',
      action: { label: 'Retry', onClick: () => optimisticWrite({ apply, revert, commit, errorMessage, toastFn }) }
    });
    throw err;
  }
}

// Strip characters Windows/macOS reject in filenames, collapse whitespace.
// Apostrophes and ampersands SURVIVE — they are legal in a filename and
// mangling them is exactly the N-012d regression. Never HTML-escape a
// filename: &amp; in a download name is a bug, not a safety measure.
function safeFilename(str, fallback = 'export') {
  const out = String(str ?? '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out || fallback;
}
// ── LCI horizon slicing (N-022) ───────────────────────────────
// Split a model horizon into printable chunks of `chunk` months.
// Returns [{ start, end, index, label }] — start inclusive / end exclusive,
// both 0-based month indices; index is the 1-based year number.
// A horizon of `chunk` or less returns one slice with label null, which every
// renderer treats as "no slicing" — a 12-month model is unchanged.
// A trailing partial year is its own slice, labelled with its true range
// (18 months → "Year 2 (M13–M18)", not M13–M24).
function lciYearSlices(horizon, chunk = 12) {
  const h = Math.max(1, Number(horizon) || 0);
  if (h <= chunk) return [{ start: 0, end: h, index: 1, label: null }];
  const out = [];
  for (let start = 0; start < h; start += chunk) {
    const end = Math.min(start + chunk, h);
    out.push({
      start, end,
      index: out.length + 1,
      label: `Year ${out.length + 1} (M${start + 1}\u2013M${end})`,
    });
  }
  return out;
}

// ── People.Level helpers (N-117) ────────────────────────────────
// Sort rank for a Level value, per CONFIG.PEOPLE_LEVELS order. Unknown/blank
// levels sort last (99), matching every levelOrder map's prior fallback.
function levelSortIndex(level) {
  const i = CONFIG.PEOPLE_LEVELS.indexOf(level);
  return i === -1 ? 99 : i;
}

// True for every "billable team" level (everyone except CSD). Single source
// of truth for the "counts toward TP-tier headcount/utilisation" line — a
// future new Level value only ever needs to be added to CONFIG.PEOPLE_LEVELS
// for this to keep working, no call site needs to change.
function isBillableLevel(level) {
  return level !== 'CSD';
}

// ── Person-based utilisation (N-328) ────────────────────────────
// THE utilisation formula — nothing else may sum Capacity / BilledCapacity.
// Per person per month: billed = days covered by at least one Billed = 'Yes'
// row, total = days covered by any row (union of the rows' DayFrom..DayTo),
// each as a fraction of the month rounded to 4dp exactly like Capacity. So a
// person with one assignment at a time scores the old row-capacity figure,
// and concurrent assignments (an SDM on 1 billed + 2 unbilled customers)
// count the person once. Rows come from computeMonthlyRows(); CSD rows
// (isBillableLevel) and zero-capacity placement rows (no DayFrom) are
// skipped. Person key = EmployeeName, as the Headcount columns count; a blank
// name never merges (keyed per AssignmentID). Optional clip = { from, to }
// (Dates, inclusive, by local calendar day): days outside are ignored — the
// 13-week CC base. Returns { ratio, billed, total }: billed / total in
// person-months; ratio 0 when total is 0 (callers showing "no data" test
// total). Sums run in whole 1/10000ths so the ratio has no float drift.
function personUtilisation(rows, clip) {
  const DAY    = 86400000;
  const dayNum = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  const lo = clip && clip.from ? dayNum(clip.from) : -Infinity;
  const hi = clip && clip.to   ? dayNum(clip.to)   :  Infinity;
  const groups = new Map();
  for (const r of rows || []) {
    if (!isBillableLevel(r.Level) || r.DayFrom == null || r.DayTo == null) continue;
    const day0 = Math.round(Date.UTC(r.Year, r.Month - 1, 1) / DAY) - 1;
    const from = Math.max(day0 + r.DayFrom, lo);
    const to   = Math.min(day0 + r.DayTo, hi);
    if (to < from) continue;
    const key = (r.EmployeeName || '#' + r.AssignmentID) + '|' + r.Year + '-' + r.Month;
    let g = groups.get(key);
    if (!g) {
      g = { dim: new Date(Date.UTC(r.Year, r.Month, 0)).getUTCDate(), all: [], billed: [] };
      groups.set(key, g);
    }
    g.all.push([from, to]);
    if (r.Billed === 'Yes') g.billed.push([from, to]);
  }
  const unionDays = spans => {
    let n = 0, end = -Infinity;
    spans.sort((x, y) => x[0] - y[0]).forEach(([s, e]) => {
      if (e <= end) return;
      n += e - Math.max(s, end + 1) + 1;
      end = e;
    });
    return n;
  };
  let billedU = 0, totalU = 0;
  for (const g of groups.values()) {
    totalU  += Math.round(unionDays(g.all)    / g.dim * 10000);
    billedU += Math.round(unionDays(g.billed) / g.dim * 10000);
  }
  return { ratio: totalU > 0 ? billedU / totalU : 0, billed: billedU / 10000, total: totalU / 10000 };
}

// Monthly rows (computeMonthlyRows) whose month starts within [start, end] —
// inclusive, local-midnight Dates. Year/Month, not MonthStart: MonthStart is a
// UTC-midnight string, which sits an hour past local midnight in BST (N-351).
function monthlyRowsInRange(rows, start, end) {
  return rows.filter(r => {
    const ms = new Date(r.Year, r.Month - 1, 1);
    return ms >= start && ms <= end;
  });
}

// People dashboard KPI figures — the shaping half shared by the desktop strip
// (people-dashboard.js) and the mobile tiles (mobile-people.js); each keeps its
// own markup (N-351). `now` is a parameter so tests can pin it. Forecast
// assignments are excluded from both counts, as on desktop.
function peopleKpiFigures(allRows, assignments, now) {
  const year  = now.getFullYear();
  const today = new Date(year, now.getMonth(), now.getDate());

  // Revenue and utilisation — current year to date (person-based, N-328)
  const ytdRows = monthlyRowsInRange(allRows, new Date(year, 0, 1), today);
  const revYTD  = ytdRows.reduce((s, r) => s + r.BilledRevenue, 0);
  const utilYTD = personUtilisation(ytdRows).ratio;

  // Last day of the previous quarter
  const cq       = Math.floor(now.getMonth() / 3);
  const prevQEnd = new Date(cq === 0 ? year - 1 : year, cq === 0 ? 12 : cq * 3, 0);
  prevQEnd.setHours(0, 0, 0, 0);

  const activeOn = asOf => assignments.filter(a => {
    const s = a.StartDate ? new Date(a.StartDate) : null;
    const e = a.EndDate   ? new Date(a.EndDate)   : null;
    return !isForecastAssignment(a) && s && s <= asOf && (!e || e >= asOf);
  });
  const countCustomers = asOf => new Set(
    activeOn(asOf).filter(a => a.Customer && a.Customer !== 'Unassigned').map(a => a.Customer)).size;
  const countBilledHC = asOf => new Set(
    activeOn(asOf).filter(a => a.Billed === 'Yes').map(a => a.EmployeeName)).size;

  return {
    year, revYTD, utilYTD,
    activeCustomers: countCustomers(today), prevQCustomers: countCustomers(prevQEnd),
    billedHeadcount: countBilledHC(today),  prevQHeadcount: countBilledHC(prevQEnd),
  };
}

// ── Internal (non-deployable) staff helpers (N-304) ─────────────
// People.StaffType 'Internal' = payroll staff in an internal function
// (CONFIG.INTERNAL_FUNCTIONS). They have no Level and never count towards
// utilisation, bench or deployable headcount. Blank StaffType = Deployable.
function isInternalStaff(p) {
  return !!p && p.StaffType === CONFIG.STAFF_TYPE_INTERNAL;
}

// The People-row counterpart of isBillableLevel(): use this — never
// isBillableLevel(p.Level) — for any People-row headcount or bench check.
// isBillableLevel('') is true, so an internal person (blank Level) would
// otherwise count. isBillableLevel() stays for Assignment / monthly rows.
function isDeployablePerson(p) {
  return !!p && !isInternalStaff(p) && isBillableLevel(p.Level);
}

// Display label for a person's band: the Level, or 'Internal · <Function>'.
function personRoleLabel(p) {
  if (isInternalStaff(p)) return `${CONFIG.STAFF_TYPE_INTERNAL} · ${p.StaffFunction || '—'}`;
  return (p && p.Level) || '';
}

// Internal staff grouped by function: [[function, [person, …]], …] in
// CONFIG.INTERNAL_FUNCTIONS order, then any unlisted function A–Z, then a
// blank function as 'Unknown'; members by name. Placeholders and deployable
// rows are ignored; active/inactive is the caller's choice. Shared by the
// Org Chart function bubbles and countInternalByFunction().
function groupInternalByFunction(people) {
  const UNKNOWN = 'Unknown';
  const order = CONFIG.INTERNAL_FUNCTIONS;
  const rank = fn => {
    if (fn === UNKNOWN) return order.length + 1;
    const i = order.indexOf(fn);
    return i === -1 ? order.length : i;
  };
  const groups = new Map();
  (people || []).forEach(p => {
    if (!p || p.IsPlaceholder || !isInternalStaff(p)) return;
    const fn = p.StaffFunction || UNKNOWN;
    if (!groups.has(fn)) groups.set(fn, []);
    groups.get(fn).push(p);
  });
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([fn, members]) => [fn, members.slice()
      .sort((a, b) => (a.EmployeeName || '').localeCompare(b.EmployeeName || ''))]);
}

// Active internal staff counted per function (People Dashboard, N-304):
// [[function, n], …] in groupInternalByFunction() order; empty functions omitted.
function countInternalByFunction(people) {
  return groupInternalByFunction((people || []).filter(p => p && p.IsActive !== false))
    .map(([fn, members]) => [fn, members.length]);
}

// N-375: unique real people beneath an Org Chart node (the node itself is not
// counted). Nodes carry `_key` ('p:' + name for People rows, 'l:' + email for
// leaders); project/function bubbles have none and are walked, not counted.
// Placeholders (`_placeholder`) are excluded. Node shape is set by org-chart.js.
function orgSubtreePeopleCount(node) {
  const keys = new Set();
  const walk = n => ((n && n.children) || []).forEach(c => {
    if (!c) return;
    if (c._key && !c._placeholder) keys.add(c._key);
    walk(c);
  });
  walk(node);
  return keys.size;
}

// ── Shared SVG chart primitives (N-197) ────────────────────
// Used by every inline-SVG chart (Revenue, Team Utilisation, LCI Spend,
// LCI Compare) so gridlines/ticks/legends look and theme identically.
// Pure markup generation — no network I/O, belongs here per file rules.

// `lines`: [{ y, label, minor }] — caller has already resolved the axis
// value to chart-space y and formatted the label text; this only emits the
// <line>/<text> pair with the shared classes.
function _chartGridSvg(padL, W, padR, lines) {
  return lines.map(l => {
    const cls = 'nt-chart-grid' + (l.minor ? ' nt-chart-grid--minor' : '');
    const label = l.label != null
      ? `<text x='${padL - 6}' y='${l.y + 4}' text-anchor='end' class='nt-chart-tick'>${l.label}</text>`
      : '';
    return `<line x1='${padL}' y1='${l.y}' x2='${W - padR}' y2='${l.y}' class='${cls}'/>${label}`;
  }).join('');
}

// N-257: neutral dashed threshold lines — replace coloured RAG bands behind
// charts. `lines`: [{ y, label, value?, place? }] — y already in chart space.
// The line stays inside the plot; its label sits in a right-hand gutter
// OUTSIDE it (x = W - padR + 6) so it never collides with late-year data —
// callers must reserve ~70 units in padR. label + value stack as two rows;
// place 'above' (default) stacks them over the line, 'below' under it. Give
// the upper threshold 'above' and the lower 'below' so a close pair can never
// overlap (N-257a Addendum A). label / value are plain text, escaped here.
function _chartThresholdSvg(padL, W, padR, lines) {
  const x = W - padR + 6;
  return lines.map(l => {
    const rows = [l.label, l.value].filter(t => t != null);
    // Baselines 11 apart: above → last row 3 over the line; below → first row 11 under it.
    const ys = l.place === 'below'
      ? rows.map((_, i) => l.y + 11 + i * 11)
      : rows.map((_, i) => l.y - 3 - (rows.length - 1 - i) * 11);
    const label = rows.length
      ? `<text text-anchor='start' class='nt-chart-threshold-label'>${rows.map((t, i) =>
          `<tspan x='${x}' y='${ys[i]}'>${escHtml(t)}</tspan>`).join('')}</text>`
      : '';
    return `<line x1='${padL}' y1='${l.y}' x2='${W - padR}' y2='${l.y}' class='nt-chart-threshold'/>${label}`;
  }).join('');
}

// `items`: [{ color, label, dashed?, box?, dot?, border? }]. `box` renders a
// small square swatch, `dot` a small circle (a flagged chart point, N-257),
// otherwise a line swatch.
function _chartLegendHtml(items) {
  return `<div class='nt-chart-legend'>${items.map(it => {
    const style = `--nt-chart-color:${it.color}` + (it.border ? `;--nt-chart-border:${it.border}` : '');
    const cls = it.box ? 'nt-chart-legend-swatch--box' : it.dot ? 'nt-chart-legend-swatch--dot' : (it.dashed ? 'nt-chart-legend-swatch--dashed' : '');
    return `<div class='nt-chart-legend-item'>
      <span class='nt-chart-legend-swatch ${cls}' style='${style}'></span>${it.label}</div>`;
  }).join('')}</div>`;
}

// Runs worker(item, index) over items with at most `limit` in flight and
// resolves to the results in input order. No network I/O of its own. A
// rejected worker rejects the whole call — callers that need per-item
// failure isolation catch inside the worker.
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  };
  const lanes = Math.max(1, Math.min(limit || 1, items.length));
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}

// ── PeoplePay (N-286 / SEC-6) ─────────────────────────────────────────
// Pure. PersonID → the PeoplePay row for it; with duplicates the lowest
// item id wins (the row setPersonSalary() updates).
function _peoplePayByPerson(payRows) {
  const byPerson = new Map();
  [...(payRows || [])]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .forEach(r => {
      const key = String(r.PersonID);
      if (!byPerson.has(key)) byPerson.set(key, r);
    });
  return byPerson;
}

// Pure. Returns NEW person objects with Salary taken from PeoplePay
// (undefined when there is no row). Never mutates its inputs — getPeople()
// rows are shared through the tier-1 cache. Any Salary already on a person
// (e.g. People.Salary from a $select=* getItem before the column is deleted)
// is overwritten, never trusted.
function attachSalaries(people, payRows) {
  const byPerson = _peoplePayByPerson(payRows);
  return (people || []).map(p => {
    const row = byPerson.get(String(p.id));
    const salary = row && row.Salary !== null && row.Salary !== undefined && row.Salary !== ''
      ? Number(row.Salary) : undefined;
    return { ...p, Salary: salary };
  });
}

// N-300 (SEC-6b). Pure. The PayrollSummaries row for one payroll send.
// Column names and JSON shapes are exactly what the Notifications row carried
// before N-300 — the payroll Power Automate flow's body expressions read them
// unchanged. Do not rename keys or add fields without updating the flow.
// month is 1–12.
const _PAYROLL_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function buildPayrollSummaryFields({ month, year, joiners, leavers, bonus }) {
  return {
    Title:     `payrollsummary-${year}-${month}`,
    Month:     _PAYROLL_MONTH_NAMES[month - 1],
    Year:      String(year),
    Joiners:   JSON.stringify(joiners),
    Leavers:   JSON.stringify(leavers),
    BonusData: bonus ? JSON.stringify(bonus) : null,
  };
}

// ── People photos (N-337) ─────────────────────────────────────────────
// Photos load through Graph download URLs (api.js getPhotoUrlMap), not a
// cookie-authenticated <img src>. These three pure helpers are the rules.

// PhotoUrl holds a full SharePoint URL (written by uploadPeoplePhoto, with a
// ?v= cache-bust) or a bare / URL-encoded filename typed by hand. Returns the
// decoded filename as the PeoplePhotos library lists it, or '' for blank or
// unusable input. Never throws.
function photoFileName(val) {
  let v = String(val == null ? '' : val).trim();
  if (!v) return '';
  v = v.split('#')[0].split('?')[0].replace(/^https?:\/\/[^/]+/i, '');
  v = v.slice(v.lastIndexOf('/') + 1);
  try { v = decodeURIComponent(v); } catch (e) { /* malformed % escape — keep it raw */ }
  return v.trim();
}

// Graph driveItem[] (children of the PeoplePhotos drive root) -> Map of
// lower-cased filename -> @microsoft.graph.downloadUrl. Skips folders and any
// item with no name or no download URL. Junk input gives an empty Map.
function buildPhotoUrlMap(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach(it => {
    const url = it && it['@microsoft.graph.downloadUrl'];
    if (!it || it.folder || !it.name || !url) return;
    map.set(String(it.name).toLowerCase(), url);
  });
  return map;
}

// True while a map built at `builtAt` (ms) is still inside `ttl` (ms).
// No build time, or a clock that went backwards, counts as stale.
function photoMapFresh(builtAt, now, ttl) {
  return typeof builtAt === 'number' && now >= builtAt && now - builtAt < ttl;
}

// N-302a: delegated actions owned by this file (js/actions.js).
registerActions({
  exitGhostMode,
});