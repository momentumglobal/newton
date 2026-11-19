// js/people-views-logic.js — shaping for two People views (N-477): the Deployment Timeline
// (people-gantt.js) and the Assignments tab (people-tracker.js).
// Pure: no Graph, no DOM. Nothing here runs at load. Loads on people.html only, straight after
// revenue-logic.js; assignmentsView() calls filterRowsByText (list-controls.js) and sortRows (utils.js)
// at call time. Not in CONFIG.MCP.scripts.

// ── Deployment Timeline ───────────────────────────────────────────────
// Pure date-window computation for the Deployment Timeline (N-239a)
function _ganttComputeWindow(assignments, year) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year, 11, 31);

  const relevant = assignments.filter(a => {
    if (!a.StartDate || !a.EndDate) return false;
    const s = new Date(a.StartDate);
    const e = new Date(a.EndDate);
    return s <= yearEnd && e >= yearStart;
  });

  return { yearStart, yearEnd, relevant };
}

// Pure lane grouping/sorting for the Deployment Timeline (N-239a)
function _ganttBuildLanes(relevant) {
  const BENCH_KEY = '__bench__';
  const customerMap = {};
  relevant.forEach(a => {
    const customer = (isForecastAssignment(a) || !a.Customer || a.Customer === 'Unassigned') ? BENCH_KEY : a.Customer;
    if (!customerMap[customer]) customerMap[customer] = {};
    if (!customerMap[customer][a.EmployeeName]) customerMap[customer][a.EmployeeName] = [];
    customerMap[customer][a.EmployeeName].push(a);
  });

  // Sort customers A-Z, bench last
  const customerNames = Object.keys(customerMap)
    .filter(c => c !== BENCH_KEY)
    .sort();
  if (customerMap[BENCH_KEY]) customerNames.push(BENCH_KEY);

  return customerNames.map(customer => {
    const employeeNames = Object.keys(customerMap[customer]).sort((a, b) => {
      const aLevel = customerMap[customer][a][0]?.Level;
      const bLevel = customerMap[customer][b][0]?.Level;
      const l = levelSortIndex(aLevel) - levelSortIndex(bLevel);
      if (l !== 0) return l;
      return a.localeCompare(b);
    });

    const employees = employeeNames.map(name => {
      const empAssignments = customerMap[customer][name];
      return {
        name,
        level: assignmentLevelLabel(empAssignments[0]),   // N-402: 'Partner' for External
        assignments: empAssignments,
      };
    });

    return { customer, isBench: customer === BENCH_KEY, employees };
  });
}

// First and last day of one month of `year` (monthIdx 0-11), local time like the rest of the timeline.
function ganttMonthRange(year, monthIdx) {
  return { mStart: new Date(year, monthIdx, 1), mEnd: new Date(year, monthIdx + 1, 0) };
}

// The assignments of one person that overlap a month cell.
function ganttMonthAssignments(empAssignments, year, monthIdx) {
  const { mStart, mEnd } = ganttMonthRange(year, monthIdx);
  return empAssignments.filter(a => {
    const s = new Date(a.StartDate);
    const e = new Date(a.EndDate);
    return s <= mEnd && e >= mStart;
  });
}

// Deployable Resources rows for the selected month (0-11) or, with month null, the whole year:
// [{ name, level, contract, location }], one per person, level then name.
function ganttDeployableRows(assignments, people, { year, month }) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year, 11, 31);
  const peopleMap = {};
  people.forEach(p => { peopleMap[p.EmployeeName] = p; });

  // People tied to a forecast are not deployable for the period it covers
  const _dpStart = month !== null ? new Date(year, month, 1) : yearStart;
  const _dpEnd   = month !== null ? new Date(year, month + 1, 0) : yearEnd;
  const forecastCovered = new Set(
    assignments.filter(a =>
      isForecastAssignment(a) && a.StartDate && a.EndDate &&
      new Date(a.StartDate) <= _dpEnd && new Date(a.EndDate) >= _dpStart
    ).map(a => a.EmployeeName)
  );

  // People with a billed assignment overlapping the period are not deployable,
  // even if a different, unbilled assignment of theirs also overlaps it (N-178)
  const billedCovered = new Set(
    assignments.filter(a =>
      a.Billed === 'Yes' && a.StartDate && a.EndDate &&
      new Date(a.StartDate) <= _dpEnd && new Date(a.EndDate) >= _dpStart
    ).map(a => a.EmployeeName)
  );

  // Find bench/unassigned assignments overlapping the selected month (or whole year)
  const deployable = assignments.filter(a => {
    if (isForecastAssignment(a)) return false;
    if (forecastCovered.has(a.EmployeeName)) return false;
    if (billedCovered.has(a.EmployeeName)) return false;
    if (a.Level === 'CSD') return false;
    if (isExternalStaff(a)) return false;   // N-402: a partner is never a Momentum resource
    if (!a.StartDate || !a.EndDate) return false;
    const s = new Date(a.StartDate);
    const e = new Date(a.EndDate);
    return s <= _dpEnd && e >= _dpStart;
  });

  // Deduplicate by employee — one row per person
  const seen = new Set();
  return deployable
    .filter(a => { if (seen.has(a.EmployeeName)) return false; seen.add(a.EmployeeName); return true; })
    .sort((a, b) => {
      const l = levelSortIndex(a.Level) - levelSortIndex(b.Level);
      if (l !== 0) return l;
      return (a.EmployeeName || '').localeCompare(b.EmployeeName || '');
    })
    .map(a => {
      const person = peopleMap[a.EmployeeName] || {};
      return { name: a.EmployeeName, level: a.Level || '—', contract: person.ContractType || '—', location: person.Location || '—' };
    });
}

// ── Assignments tab ───────────────────────────────────────────────────

// The Assignments table's sort columns. A function, so nothing runs at load.
function assignmentSortColumns() {
  return {
    employee:    { type: 'text', get: a => a.EmployeeName },
    level:       { type: 'enum', order: CONFIG.PEOPLE_LEVELS, get: a => a.Level },
    customer:    { type: 'text', get: a => a.Customer },
    projectType: { type: 'enum', order: CONFIG.PROJECT_TYPES, get: a => a.ProjectType },
    start:       { type: 'date', get: a => a.StartDate },
    end:         { type: 'date', get: a => a.EndDate },
    // N-247c: does NOT mirror the cell 1:1 — assignmentRateLabel() renders a
    // composite split-fee string for some rows, with no single scalar to
    // sort by. Split-fee assignments sort as empty (last); every other row
    // sorts on its raw MonthlyBillRate.
    billRate:    { type: 'number', get: a => isSplitFeeAssignment(a) ? null : (parseFloat(a.MonthlyBillRate) || null) },
    billed:      { type: 'text', get: a => a.Billed },
  };
}

// The Assignments tab rows. state = { status, customer, projectType, search, sort }; `today` is
// utcDateOnly(localDayISO()) from the caller.
// N-132: UTC by construction, matching syncBenchAssignments (N-090) — this tab no longer carries two
// date conventions. localDayISO() answers "what day is it where the user is" (the filter follows the
// USER's calendar, not UTC's), and utcDateOnly() expresses that day as UTC midnight so it compares
// like-for-like against the assignment dates. Do NOT reintroduce `new Date(str)` + setHours(): mixing
// the two conventions in one file is exactly what produced N-090's off-by-one bench writes.
// -> { statusFilter, rows, customers, projectTypes, total }
function assignmentsView(assignments, state, today) {
  const statusFilter = state.status || 'current';

  // Status predicate for the Current / Former / Planned filter.
  const matchesStatus = a => {
    const start = utcDateOnly(a.StartDate);
    const end   = utcDateOnly(a.EndDate);
    const isPlanned = start && start > today;
    const isCurrent = !isPlanned && (!end || end >= today);
    if (statusFilter === 'current') return isCurrent;
    if (statusFilter === 'former')  return !isPlanned && end && end < today;
    if (statusFilter === 'planned') return isPlanned;
    return true;
  };
  const matchesOtherFilters = a => {
    if (state.customer    && a.Customer    !== state.customer)    return false;
    if (state.projectType && a.ProjectType !== state.projectType) return false;
    return true;
  };

  let filtered = assignments.filter(matchesStatus).filter(matchesOtherFilters);

  const customers    = [...new Set(assignments.map(a => a.Customer).filter(Boolean))].sort();
  const projectTypes = [...new Set(assignments.map(a => a.ProjectType).filter(Boolean))].sort();

  // N-247c: search after every existing filter, before the pre-existing
  // default order (kept as-is below); sortRows layers on top of it.
  filtered = filterRowsByText(filtered, state.search, a => [a.EmployeeName, a.Customer, a.ProjectType, a.Level]);

  filtered.sort((a, b) => {
    const c = (a.Customer || '').localeCompare(b.Customer || '');
    if (c !== 0) return c;
    const l = levelSortIndex(a.Level) - levelSortIndex(b.Level);
    if (l !== 0) return l;
    return (a.EmployeeName || '').localeCompare(b.EmployeeName || '');
  });
  filtered = sortRows(filtered, state.sort, assignmentSortColumns());
  return { statusFilter, rows: filtered, customers, projectTypes, total: assignments.length };
}
