// js/people-logic.js — People / workforce rules: Level helpers (N-117), utilisation (N-328, N-391, N-394),
// deployable, internal and external staff rules (N-304, N-399, N-402, N-422, N-424, N-466, N-467),
// PeoplePay (N-286) and People photo URL rules (N-337).
// Pure: no Graph, no DOM. Split out of utils.js (N-474).
// personUtilisation() is the only utilisation formula; a source-scan test (assert-revenue.js, N-328) keeps
// capacity maths in this file. Loads straight after project-types.js on every shell and is listed in
// CONFIG.MCP.scripts. Nothing here runs at load.

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
// count the person once. Rows come from computeMonthlyRows(); CSD and
// External rows (countsForUtilisation, N-402) and zero-capacity placement
// rows (no DayFrom) are skipped. Person key = EmployeeName, as the Headcount columns count; a blank
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
    if (!countsForUtilisation(r) || r.DayFrom == null || r.DayTo == null) continue;   // N-402
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

// N-391: the People Dashboard Team Utilisation band roll-up, lifted verbatim from
// _renderUtilisationPanel (people-dashboard.js) so the MCP tools reuse it. rows =
// computeMonthlyRows() rows for the period. Bands = CONFIG.PEOPLE_LEVELS minus CSD, in
// order, bands with no rows dropped. u = personUtilisation ratio; total / utilised =
// distinct EmployeeName (utilised = a Billed 'Yes' row). Totals count billable levels only.
// N-402: External (partner) rows count nowhere here — countsForUtilisation.
function utilisationBandRollup(rows) {
  const all   = rows || [];
  const bands = CONFIG.PEOPLE_LEVELS.filter(l => l !== 'CSD').map(band => {
    const r        = all.filter(x => x.Level === band && countsForUtilisation(x));
    const u        = personUtilisation(r).ratio;
    // Headcount from assignment rows for the selected period (not today's people list)
    const total    = new Set(r.map(x => x.EmployeeName)).size;
    const utilised = new Set(r.filter(x => x.Billed === 'Yes').map(x => x.EmployeeName)).size;
    return { band, u, utilised, total };
  }).filter(b => b.total > 0);
  const total = {
    u:        personUtilisation(all).ratio,
    utilised: new Set(all.filter(x => x.Billed === 'Yes' && countsForUtilisation(x)).map(x => x.EmployeeName)).size,
    active:   new Set(all.filter(x => countsForUtilisation(x)).map(x => x.EmployeeName)).size,
  };
  return { bands, total };
}

// N-391: person-based utilisation per calendar month — [{ month: 'YYYY-MM', u }], ascending.
// The People Dashboard Monthly Trend; rows = computeMonthlyRows() rows.
function utilisationByMonth(rows) {
  const monthMap = {};
  (rows || []).forEach(r => {
    const key = `${r.Year}-${String(r.Month).padStart(2,'0')}`;
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(r);
  });
  return Object.keys(monthMap).sort().map(k => ({ month: k, u: personUtilisation(monthMap[k]).ratio }));
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

// N-525: is the assignment live on a calendar day? Start and end are inclusive. Compares
// 'YYYY-MM-DD' strings (spDateIn) because stored dates are 'YYYY-MM-DDT12:00:00Z' (isoDate), which
// is LATER than a local-midnight Date, so `new Date(a.StartDate) <= midnight` drops a row that starts
// on the day itself (N-087). A blank EndDate is open-ended; a blank or unparseable StartDate is false.
function assignmentSpansDay(a, dayISO) {
  return assignmentOverlapsDays(a, dayISO, dayISO);
}

// N-525: does the assignment overlap the inclusive day range fromISO..toISO ('YYYY-MM-DD')? Same
// rules as assignmentSpansDay. Callers turn their local Date bounds into days with localDayISO().
function assignmentOverlapsDays(a, fromISO, toISO) {
  const s = a && a.StartDate ? spDateIn(a.StartDate) : null;
  if (!s || s > toISO) return false;
  const e = a.EndDate ? spDateIn(a.EndDate) : null;
  return !e || e >= fromISO;
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

  // N-525: calendar-day compare, so a row starting today counts today.
  const activeOn = asOf => assignments.filter(a =>
    !isForecastAssignment(a) && assignmentSpansDay(a, localDayISO(asOf)));
  const countCustomers = asOf => new Set(
    activeOn(asOf).filter(a => a.Customer && a.Customer !== 'Unassigned').map(a => a.Customer)).size;
  // N-402: an External partner on a billed row is not Momentum billed headcount.
  const countBilledHC = asOf => new Set(
    activeOn(asOf).filter(a => a.Billed === 'Yes' && !isExternalStaff(a)).map(a => a.EmployeeName)).size;

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

// N-422: has this person started? A People row whose StartDate is after today is
// a future starter: in Newton so they can be set up, but not yet working for us,
// so the Org Chart and the Newton for Claude bench tool leave them out. Visible ON
// the start date. A blank or unparseable StartDate counts as started, and a
// placeholder is a vacancy, not a joiner, so it always passes. Compares two
// 'YYYY-MM-DD' strings (spDateIn / localDayISO), never a Date built from the
// SharePoint string (N-087, BST shift).
function isStartedPerson(p, today = new Date()) {
  if (!p) return false;
  if (p.IsPlaceholder) return true;
  const start = spDateIn(p.StartDate);
  return !start || start <= localDayISO(today);
}

// N-402: StaffType 'External' = an outside partner on a Project Team. Works on
// a People row, an Assignments row (StaffType copied at create) and a
// computeMonthlyRows row. Not deployable; revenue still counts.
function isExternalStaff(x) {
  return !!x && x.StaffType === CONFIG.STAFF_TYPE_EXTERNAL;
}

// The People-row counterpart of isBillableLevel(): use this — never
// isBillableLevel(p.Level) — for any People-row headcount or bench check.
// isBillableLevel('') is true, so an internal or external person (blank
// Level) would otherwise count. Assignment / monthly rows use
// countsForUtilisation() (N-402).
function isDeployablePerson(p) {
  return !!p && !isInternalStaff(p) && !isExternalStaff(p) && isBillableLevel(p.Level);
}

// N-402: THE row-level utilisation filter (Assignments / monthly rows): CSD and
// External rows never count. Revenue is never filtered by it — use it only for
// capacity, utilisation and the headcount behind utilisation.
function countsForUtilisation(row) {
  return !!row && isBillableLevel(row.Level) && !isExternalStaff(row);
}

// N-402: the Payroll Summary population — UK staff; External partners are not
// on Momentum's payroll.
function isPayrollPerson(p) {
  return !!p && p.Location === 'UK' && !isExternalStaff(p);
}

// N-394: deployable, active people - the headcount denominator for utilisation (People
// Dashboard, CC utilisation, the MCP utilisation tool). Pure.
// N-399: the filter itself returns the array (input order kept) so Sync Bench can use the same
// rule; the count is its length. No other file may carry its own copy.
function activeDeployablePeople(people) {
  return (people || []).filter(p => p.IsActive !== false && isDeployablePerson(p));   // N-304
}
// N-424: asOf = the date the headcount is measured at (default today). Someone whose StartDate is
// after asOf has not started and is left out; pass a month end for a forecast month (N-423 D1).
// activeDeployablePeople() is NOT filtered by start date: Sync Bench needs a joiner's bench rows
// from day one.
function activeDeployableCount(people, asOf = new Date()) {
  return activeDeployablePeople(people).filter(p => isStartedPerson(p, asOf)).length;
}

// N-394: the People Dashboard period filter -> { start, end } local Dates. filter =
// { year, month (0-based or null), quarter (1-4 or null) }; month wins, then quarter, else the
// whole year. Moved verbatim from people-dashboard.js (_dashDateRange) for the MCP tools.
function peoplePeriodRange(filter) {
  const { year, month, quarter } = filter;
  if (month !== null) {
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
  }
  if (quarter !== null) {
    return { start: new Date(year, (quarter - 1) * 3, 1), end: new Date(year, quarter * 3, 0) };
  }
  return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
}

// Display label for a person's band: the Level, or 'Internal · <Function>'.
function personRoleLabel(p) {
  if (isInternalStaff(p)) return `${CONFIG.STAFF_TYPE_INTERNAL} · ${p.StaffFunction || '—'}`;
  if (isExternalStaff(p)) return CONFIG.EXTERNAL_LABEL;   // N-402
  return (p && p.Level) || '';
}

// N-402: the Level label for an Assignments row (Deployment Timeline): the
// partner label for an External row, else its Level, else '—'.
function assignmentLevelLabel(a) {
  if (isExternalStaff(a)) return CONFIG.EXTERNAL_LABEL;
  return (a && a.Level) || '—';
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
function countInternalByFunction(people, asOf = new Date()) {
  // N-424: staff who have not started yet are not counted. N-466: asOf = the date measured at (default today).
  return groupInternalByFunction((people || []).filter(p => p && p.IsActive !== false && isStartedPerson(p, asOf)))
    .map(([fn, members]) => [fn, members.length]);
}

// N-466: the People Dashboard Workforce Segmentation counts, shared by the panel
// (people-dashboard.js) and the Newton for Claude workforce_segmentation tool. N-468: Location and
// ContractType count every active, started, non-placeholder, non-partner employee (deployable AND
// internal staff); Level counts deployable staff only (internal staff have no Level). Started
// by asOf (N-424; default today, pass a month end for a month snapshot); external partners
// (N-402) are in none. Internal staff are also counted by function. Returns count entries
// [[label, n], ...]: Location and ContractType largest first, Level in levelSortIndex order; a blank
// value groups as 'Unknown'. total = deployableTotal + internalTotal. Percentages are the caller's:
// Location / ContractType over total, Level over deployableTotal.
// N-524: optional staffType narrows the counted group once, before grouping. 'all' (default) is the
// output above, unchanged. 'deployable' = the utilisation population (isDeployablePerson: no internal
// staff, no CSDs, no partners) in all three tables, so total = deployableTotal. 'internal' = internal-
// function staff only; byLevel is [] (no Level), total = internalTotal. Any other value throws. The
// result carries the staffType used.
function workforceSegmentation(people, asOf = new Date(), staffType = 'all') {
  if (staffType !== 'all' && staffType !== 'deployable' && staffType !== 'internal') throw new Error('staffType must be all, deployable or internal');
  const counted = (people || []).filter(p => p && p.IsActive !== false && !p.IsPlaceholder && !isExternalStaff(p) && isStartedPerson(p, asOf));
  const deployable = counted.filter(p => !isInternalStaff(p));
  const group = (list, key) => {
    const map = {};
    list.forEach(p => {
      const v = p[key] || 'Unknown';
      map[v] = (map[v] || 0) + 1;
    });
    return Object.entries(map);
  };
  const internalByFunction = countInternalByFunction(people, asOf);
  const byCount = (a, b) => b[1] - a[1];
  const byLevelOrder = (a, b) => levelSortIndex(a[0]) - levelSortIndex(b[0]);
  if (staffType === 'deployable') {
    const scope = counted.filter(isDeployablePerson);
    return {
      staffType,
      total: scope.length,
      deployableTotal: scope.length,
      internalTotal: 0,
      byLocation: group(scope, 'Location').sort(byCount),
      byContractType: group(scope, 'ContractType').sort(byCount),
      byLevel: group(scope, 'Level').sort(byLevelOrder),
      internalByFunction: [],
    };
  }
  if (staffType === 'internal') {
    const scope = counted.filter(isInternalStaff);
    return {
      staffType,
      total: scope.length,
      deployableTotal: 0,
      internalTotal: scope.length,
      byLocation: group(scope, 'Location').sort(byCount),
      byContractType: group(scope, 'ContractType').sort(byCount),
      byLevel: [],
      internalByFunction,
    };
  }
  return {
    staffType,
    total: counted.length,
    deployableTotal: deployable.length,
    internalTotal: internalByFunction.reduce((sum, e) => sum + e[1], 0),
    byLocation: group(counted, 'Location').sort(byCount),
    byContractType: group(counted, 'ContractType').sort(byCount),
    byLevel: group(deployable, 'Level').sort(byLevelOrder),
    internalByFunction,
  };
}

// N-467: People who start in a calendar month (the Newton for Claude joiners tool). Active, real
// (not a placeholder) deployable or internal staff; external partners (N-402) are not Momentum staff
// and are left out. StartDate falls in year / month (1-12), so a starter later in the month counts.
// A blank or unparseable StartDate is not a joiner (N-422 reads blank as "started long ago").
// Compares 'YYYY-MM-DD' strings (spDateIn / localDayISO), never a Date built from the SharePoint
// string (N-087, BST shift). Returns the People rows sorted by start day, then name.
function peopleJoiners(people, year, month) {
  const from = localDayISO(new Date(year, month - 1, 1));
  const to = localDayISO(new Date(year, month, 0));
  return (people || [])
    .filter(p => {
      if (!p || p.IsActive === false || p.IsPlaceholder || isExternalStaff(p)) return false;
      const start = spDateIn(p.StartDate);
      return !!start && start >= from && start <= to;
    })
    .sort((a, b) => spDateIn(a.StartDate).localeCompare(spDateIn(b.StartDate))
      || String(a.EmployeeName || '').localeCompare(String(b.EmployeeName || '')));
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

// ── Revenue by project type (N-521) ─────────────────────────────
// People Dashboard → Revenue → By Project Type. `rows` = computeMonthlyRows() rows for the
// period. Returns { rows: [{ type, revenue }], total }. `rows` follows CONFIG.PROJECT_TYPES order,
// minus CONFIG.NON_REVENUE_PROJECT_TYPES, and OMITS any type whose pence-rounded BilledRevenue is
// 0 (no rows, or only unbilled / zero-rate rows). `total` is the sum of BilledRevenue over every
// input row, as the panel's Total always was. Never throws on null / non-array input.
function revenueByProjectType(rows) {
  const sums = {};
  let total = 0;
  (Array.isArray(rows) ? rows : []).forEach(r => {
    if (!r) return;
    const v = Number(r.BilledRevenue) || 0;
    sums[r.ProjectType] = (sums[r.ProjectType] || 0) + v;
    total += v;
  });
  const out = CONFIG.PROJECT_TYPES
    .filter(t => !CONFIG.NON_REVENUE_PROJECT_TYPES.includes(t))
    .map(t => ({ type: t, revenue: Math.round((sums[t] || 0) * 100) / 100 }))
    .filter(x => x.revenue !== 0);
  return { rows: out, total };
}
