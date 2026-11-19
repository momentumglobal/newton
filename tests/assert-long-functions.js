// tests/assert-long-functions.js — N-477: fixture tests for the shaping halves split out of the seven
// long functions (people-views-logic.js, placement-analytics.js, starter-folder-logic.js,
// dashboard-project.js). Dates sit mid-month on purpose: the Gantt compares local month bounds with
// new Date('YYYY-MM-DD') (UTC midnight) and an exact month edge would move with the timezone.
// Loads AFTER tests/assertions.js (ASSERTIONS + shared helpers).

function _n477A(name, level, customer, start, end, extra) {
  return Object.assign({ EmployeeName: name, Level: level, Customer: customer, StartDate: start, EndDate: end, ProjectType: 'Embedded' }, extra || {});
}

ASSERTIONS.push(
  {
    name: 'N-477 ganttMonthRange / ganttMonthAssignments — overlap by month, local month bounds',
    fn: function () {
      const r = ganttMonthRange(2026, 1);
      _assertEqual([r.mStart.getFullYear(), r.mStart.getMonth(), r.mStart.getDate()], [2026, 1, 1], 'Feb start');
      _assertEqual([r.mEnd.getMonth(), r.mEnd.getDate()], [1, 28], 'Feb 2026 ends on the 28th');
      _assertEqual(ganttMonthRange(2028, 1).mEnd.getDate(), 29, 'leap year');
      _assertEqual(ganttMonthRange(2026, 11).mEnd.getDate(), 31, 'December ends on the 31st');
      const a = [
        _n477A('A', 'TP', 'X', '2026-01-10', '2026-02-15'),
        _n477A('A', 'TP', 'Y', '2026-03-10', '2026-04-20'),
        _n477A('A', 'TP', 'Z', '2025-06-10', '2026-12-20'),
      ];
      _assertEqual(ganttMonthAssignments(a, 2026, 1).map(x => x.Customer), ['X', 'Z'], 'Feb: X (ends mid-month) and the year-long Z');
      _assertEqual(ganttMonthAssignments(a, 2026, 2).map(x => x.Customer), ['Y', 'Z'], 'Mar');
      _assertEqual(ganttMonthAssignments(a, 2026, 5).map(x => x.Customer), ['Z'], 'Jun: only Z');
      _assertEqual(ganttMonthAssignments([], 2026, 5), [], 'no assignments');
    },
  },
  {
    name: 'N-477 _ganttComputeWindow — only assignments that touch the year, both dates required',
    fn: function () {
      const rows = [
        _n477A('In', 'TP', 'X', '2026-03-10', '2026-04-20'),
        _n477A('Spans', 'TP', 'X', '2025-03-10', '2027-04-20'),
        _n477A('Before', 'TP', 'X', '2024-03-10', '2025-04-20'),
        _n477A('After', 'TP', 'X', '2027-03-10', '2027-04-20'),
        _n477A('NoEnd', 'TP', 'X', '2026-03-10', ''),
        _n477A('NoStart', 'TP', 'X', '', '2026-04-20'),
      ];
      const w = _ganttComputeWindow(rows, 2026);
      _assertEqual(w.relevant.map(a => a.EmployeeName), ['In', 'Spans'], 'relevant rows');
      _assertEqual([w.yearStart.getMonth(), w.yearStart.getDate(), w.yearEnd.getMonth(), w.yearEnd.getDate()], [0, 1, 11, 31], 'year bounds');
    },
  },
  {
    name: 'N-477 _ganttBuildLanes — customers A–Z, bench last, level then name, External shows Partner',
    fn: function () {
      const rows = [
        _n477A('Zed', 'TP', 'Beta', '2026-03-10', '2026-04-20'),
        _n477A('Amy', 'STP', 'Beta', '2026-03-10', '2026-04-20'),
        _n477A('Bob', 'TP', 'Beta', '2026-03-10', '2026-04-20'),
        _n477A('Cat', 'SDM', 'Alpha', '2026-03-10', '2026-04-20'),
        _n477A('Dan', 'TP', 'Unassigned', '2026-03-10', '2026-04-20'),
        _n477A('Eve', 'TP', '', '2026-03-10', '2026-04-20'),
        _n477A('Fay', 'TP', 'Alpha', '2026-03-10', '2026-04-20', { IsForecast: true }),
        _n477A('Gus', 'TP', 'Alpha', '2026-03-10', '2026-04-20', { StaffType: CONFIG.STAFF_TYPE_EXTERNAL }),
      ];
      const lanes = _ganttBuildLanes(rows);
      _assertEqual(lanes.map(l => l.customer), ['Alpha', 'Beta', '__bench__'], 'lane order, bench last');
      _assertEqual(lanes.map(l => l.isBench), [false, false, true], 'isBench flags');
      _assertEqual(lanes[0].employees.map(e => e.name), ['Cat', 'Gus'], 'Alpha: SDM before TP; forecast moved to bench');
      _assertEqual(lanes[0].employees.map(e => e.level), ['SDM', CONFIG.EXTERNAL_LABEL], 'External row is labelled Partner (N-402)');
      _assertEqual(lanes[1].employees.map(e => e.name), ['Amy', 'Bob', 'Zed'], 'Beta: STP, then TP A–Z');
      _assertEqual(lanes[2].employees.map(e => e.name), ['Dan', 'Eve', 'Fay'], 'bench: Unassigned, blank customer and forecast');
      _assertEqual(lanes[1].employees[0].assignments.length, 1, 'assignments carried');
      _assertEqual(_ganttBuildLanes([]), [], 'no rows → no lanes');
    },
  },
  {
    name: 'N-477 ganttDeployableRows — month vs year, forecast / billed / CSD / External / undated excluded',
    fn: function () {
      const people = [
        { EmployeeName: 'Amy', ContractType: 'Permanent', Location: 'London' },
        { EmployeeName: 'Bob', ContractType: 'Contract', Location: 'Lisbon' },
      ];
      const bench = (n, lvl, s, e, x) => _n477A(n, lvl, 'Unassigned', s, e, x);
      const rows = [
        bench('Bob', 'TP', '2026-03-05', '2026-03-25'),
        bench('Amy', 'STP', '2026-03-05', '2026-03-25'),
        bench('Amy', 'STP', '2026-03-06', '2026-03-20'),                                   // duplicate → one row
        bench('Cid', 'TP', '2026-03-05', '2026-03-25'),                                    // not in People → dashes
        bench('Dee', 'CSD', '2026-03-05', '2026-03-25'),                                   // CSD never deployable
        bench('Eli', 'TP', '2026-03-05', '2026-03-25', { StaffType: CONFIG.STAFF_TYPE_EXTERNAL }),
        bench('Fox', 'TP', '2026-03-05', '2026-03-25'),                                    // forecast-covered in March
        _n477A('Fox', 'TP', 'Acme', '2026-03-10', '2026-03-12', { IsForecast: true }),
        bench('Gil', 'TP', '2026-03-05', '2026-03-25'),                                    // billed in March
        _n477A('Gil', 'TP', 'Acme', '2026-03-01', '2026-03-31', { Billed: 'Yes' }),
        bench('Hal', 'TP', '2026-03-05', ''),                                              // undated → excluded
        bench('Ivy', 'TP', '2026-07-05', '2026-07-25'),                                    // July only
      ];
      const mar = ganttDeployableRows(rows, people, { year: 2026, month: 2 });
      _assertEqual(mar.map(r => r.name), ['Amy', 'Bob', 'Cid'], 'March: level then name; one row per person');
      _assertEqual(mar[0], { name: 'Amy', level: 'STP', contract: 'Permanent', location: 'London' }, 'row shape');
      _assertEqual(mar[2], { name: 'Cid', level: 'TP', contract: '—', location: '—' }, 'unknown person → dashes');
      const jul = ganttDeployableRows(rows, people, { year: 2026, month: 6 });
      _assertEqual(jul.map(r => r.name), ['Ivy'], 'July: Fox and Gil are free again, only Ivy overlaps');
      const yr = ganttDeployableRows(rows, people, { year: 2026, month: null });
      _assertEqual(yr.map(r => r.name), ['Amy', 'Bob', 'Cid', 'Ivy'], 'whole year: Fox (forecast) and Gil (billed) stay excluded');
      _assertEqual(ganttDeployableRows([], [], { year: 2026, month: null }), [], 'empty');
    },
  },
  {
    name: 'N-477 assignmentSortColumns / assignmentsView — status filters around today',
    fn: function () {
      const today = utcDateOnly('2026-06-15');
      const rows = [
        _n477A('Cur', 'TP', 'Acme', '2026-01-01', '2026-12-31'),
        _n477A('OpenEnd', 'TP', 'Acme', '2026-01-01', ''),
        _n477A('Old', 'TP', 'Acme', '2025-01-01', '2026-03-31'),
        _n477A('Soon', 'TP', 'Acme', '2026-09-01', '2026-12-31'),
        _n477A('EndsToday', 'TP', 'Acme', '2026-01-01', '2026-06-15'),
      ];
      const names = s => assignmentsView(rows, { status: s }, today).rows.map(r => r.EmployeeName).sort();
      _assertEqual(names('current'), ['Cur', 'EndsToday', 'OpenEnd'], 'current (default, open-ended, ends today)');
      _assertEqual(assignmentsView(rows, {}, today).statusFilter, 'current', 'default status is current');
      _assertEqual(names('former'), ['Old'], 'former');
      _assertEqual(names('planned'), ['Soon'], 'planned');
      _assertEqual(names('all'), ['Cur', 'EndsToday', 'Old', 'OpenEnd', 'Soon'], 'all');
      _assertEqual(assignmentsView(rows, { status: 'former' }, today).total, 5, 'total ignores filters');
    },
  },
  {
    name: 'N-477 assignmentsView — customer / type filters, search, default order, column sort, option lists',
    fn: function () {
      const today = utcDateOnly('2026-06-15');
      const rows = [
        _n477A('Zoe', 'TP', 'Beta', '2026-01-01', '2026-12-31'),
        _n477A('Amy', 'STP', 'Beta', '2026-01-01', '2026-12-31', { ProjectType: 'CoE' }),
        _n477A('Bob', 'TP', 'Alpha', '2026-02-01', '2026-12-31', { Billed: 'Yes' }),
        _n477A('Cat', 'SDM', 'Alpha', '2026-03-01', '2026-12-31', { ProjectType: 'Exec Search', MonthlyBillRate: '9000' }),
        _n477A('Dan', 'TP', 'Alpha', '2026-04-01', '2026-12-31', { MonthlyBillRate: '4000' }),
      ];
      const view = (st) => assignmentsView(rows, Object.assign({ status: 'all' }, st), today);
      _assertEqual(view({}).rows.map(r => r.EmployeeName), ['Cat', 'Bob', 'Dan', 'Amy', 'Zoe'], 'default: customer, level, name');
      _assertEqual(view({ customer: 'Beta' }).rows.map(r => r.EmployeeName), ['Amy', 'Zoe'], 'customer filter');
      _assertEqual(view({ projectType: 'CoE' }).rows.map(r => r.EmployeeName), ['Amy'], 'project type filter');
      _assertEqual(view({ customer: 'Alpha', projectType: 'CoE' }).rows, [], 'filters combine');
      _assertEqual(view({ search: 'sdm' }).rows.map(r => r.EmployeeName), ['Cat'], 'search matches level, case-insensitive');
      _assertEqual(view({ search: 'bet' }).rows.map(r => r.EmployeeName), ['Amy', 'Zoe'], 'search matches customer');
      _assertEqual(view({}).customers, ['Alpha', 'Beta'], 'customer options A–Z, from all rows');
      _assertEqual(view({ customer: 'Beta' }).customers, ['Alpha', 'Beta'], 'options ignore the filters');
      _assertEqual(view({}).projectTypes, ['CoE', 'Embedded', 'Exec Search'], 'project type options A–Z');
      _assertEqual(view({ sort: { key: 'employee', dir: 'desc' } }).rows.map(r => r.EmployeeName), ['Zoe', 'Dan', 'Cat', 'Bob', 'Amy'], 'column sort');
      const byRate = view({ sort: { key: 'billRate', dir: 'asc' } }).rows.map(r => r.EmployeeName);
      _assertEqual(byRate.slice(0, 1), ['Dan'], 'billRate ascending: lowest rate first');
      _assertEqual(byRate[byRate.length - 1] === 'Cat' || byRate.indexOf('Cat') > byRate.indexOf('Dan'), true, 'split-fee row sorts after rated rows');
      _assertEqual(Object.keys(assignmentSortColumns()), ['employee', 'level', 'customer', 'projectType', 'start', 'end', 'billRate', 'billed'], 'sort column keys');
      _assertEqual(assignmentsView([], {}, today), { statusFilter: 'current', rows: [], customers: [], projectTypes: [], total: 0 }, 'empty');
    },
  },
  {
    name: 'N-477 _paSummaryTiles — four tiles, dashes when there is nothing to average',
    fn: function () {
      const full = _paSummaryTiles({
        ttfResult: { medianDays: 42, bandDays: 6.4, events: 10, censored: 14, closed: 1, medianReached: true, basis: 'x', maxObservedDays: 90, label: 'L' },
        avgTTHDays: 37.6, sampleSize: 1, totals: { Hires: 4, Outreach: 100, Offers: 5 },
      });
      _assertEqual(full.map(t => t.label), ['Predicted Time to Hire', 'Avg. Actual Time to Hire', 'Outreach per Hire', 'Offer Success Rate'], 'labels');
      _assertEqual(full.map(t => t.value), ['~42d', '38d', 25, '80%'], 'values');
      _assertEqual(full[1].note, '1 placement', 'singular placement');
      _assertEqual(full[3].note, '5 offers made', 'plural offers');
      const none = _paSummaryTiles({
        ttfResult: { medianDays: null, bandDays: null, medianReached: true, basis: null, label: 'Not enough data' },
        avgTTHDays: null, sampleSize: 0, totals: { Hires: 0, Outreach: 0, Offers: 0 },
      });
      _assertEqual(none.map(t => t.value), ['—', '—', '—', '—'], 'dashes');
      _assertEqual(none[0].note, 'Not enough data', 'label when no band');
      _assertEqual(none[1].note, '0 placements', 'plural zero');
      const censored = _paSummaryTiles({
        ttfResult: { medianDays: null, bandDays: null, medianReached: false, basis: 'b', maxObservedDays: 120, label: 'L' },
        avgTTHDays: null, sampleSize: 0, totals: { Hires: 0, Outreach: 0, Offers: 0 },
      });
      _assertEqual(censored[0].value, '>120d', 'median not reached → greater-than');
    },
  },
  {
    name: 'N-477 _paBreakdownView — search, sort, display strings, funnel cells',
    fn: function () {
      const stages = LEARNED_RATES.map((r, i) => ({ rag: i === 0 ? 'green' : 'red', stage: 'S' + i, conv: i === 0 ? 50 : null }));
      const g = (key, fa, sal, tth, tot) => ({
        key, functionArea: fa, sym: '£', avgSalary: sal, avgTth: tth, roleTotals: tot, roleFunnel: stages, bench: {},
      });
      const groups = [
        g('Engineer', 'Tech', 65000, 40, { Outreach: 100, Responses: 25, Offers: 4, Hires: 2 }),
        g('Analyst', '', null, null, { Outreach: 0, Responses: 0, Offers: 0, Hires: 0 }),
        g('Designer', 'Creative', 50000, 30, { Outreach: 50, Responses: 5, Offers: 2, Hires: 2 }),
      ];
      const all = _paBreakdownView(groups, '', null);
      _assertEqual(all.shown, 3, 'shown');
      _assertEqual(all.rows.map(r => r.key), ['Engineer', 'Analyst', 'Designer'], 'input order kept without a sort');
      _assertEqual(all.rows[0].salaryText, '£' + (65000).toLocaleString('en-GB'), 'salary text');
      _assertEqual([all.rows[0].tthText, all.rows[0].responseText, all.rows[0].offerText], ['40d', '25%', '50%'], 'tth / response / offer text');
      _assertEqual([all.rows[1].functionArea, all.rows[1].salaryText, all.rows[1].tthText, all.rows[1].responseText, all.rows[1].offerText], ['—', '—', '—', '—', '—'], 'empty group shows dashes');
      _assertEqual(all.rows[0].funnel.length, LEARNED_RATES.length, 'one funnel cell per learned rate');
      _assertEqual([all.rows[0].funnel[0].rag, all.rows[0].funnel[0].stage, all.rows[0].funnel[0].convText], ['green', 'S0', '50%'], 'funnel cell');
      _assertEqual(all.rows[0].funnel[1].convText, '—', 'null conversion → dash');
      _assertEqual(all.rows[0].funnel[0].tip, learnedBenchmarkTip({}, LEARNED_RATES[0].key), 'tip from learnedBenchmarkTip');
      _assertEqual(_paBreakdownView(groups, 'tech', null).rows.map(r => r.key), ['Engineer'], 'search by function area');
      _assertEqual(_paBreakdownView(groups, 'zzz', null).shown, 0, 'no match');
      _assertEqual(_paBreakdownView(groups, '', { key: 'role', dir: 'asc' }).rows.map(r => r.key), ['Analyst', 'Designer', 'Engineer'], 'sort by role');
      _assertEqual(_paBreakdownView(groups, '', { key: 'avgSalary', dir: 'desc' }).rows.map(r => r.key), ['Engineer', 'Designer', 'Analyst'], 'sort by salary, empty last');
    },
  },
  {
    name: 'N-477 starterFolderModalModel — project and role shapes',
    fn: function () {
      const deps = { adminEmails: ['admin1@x.co'], tpMap: { 'dm@x.co': 'Dee Em', 'tp1@x.co': 'Tee Pea', 'admin1@x.co': 'Ad Min' }, me: { email: 'me@x.co', name: 'Me Self' }, today: '19 Nov 2026' };
      const project = { CustomerName: 'Acme Ltd', DeliveryManager: 'dm@x.co', ProjectType: 'Embedded' };
      const p = starterFolderModalModel({ recordType: 'project', record: project, project }, deps);
      _assertEqual([p.recordType, p.noun, p.parentPath], ['project', 'project', CONFIG.STARTER_FOLDERS.PARENT_PATH.project], 'project basics');
      _assertEqual(p.recipients, ['dm@x.co', 'admin1@x.co'], 'DM then admins');
      _assertEqual(p.recipientsLabel, 'Dee Em, Ad Min', 'names via tpMap');
      _assertEqual(p.defaultName, 'Acme Ltd', 'default folder name');
      _assertEqual(Object.keys(p.values), CONFIG.STARTER_FOLDERS.PLACEHOLDERS.project, 'placeholder keys in config order');
      _assertEqual(typeof p.packLabel, 'string', 'pack label');
      const role = { RoleTitle: 'Engineer', Location: 'Lisbon', TalentPartner: 'tp1@x.co' };
      const r = starterFolderModalModel({ recordType: 'role', record: role, project }, deps);
      _assertEqual([r.noun, r.parentPath], ['role', CONFIG.STARTER_FOLDERS.PARENT_PATH.role], 'role basics');
      _assertEqual(r.recipients, ['dm@x.co', 'admin1@x.co', 'tp1@x.co'], 'role TP added');
      _assertEqual(Object.keys(r.values), CONFIG.STARTER_FOLDERS.PLACEHOLDERS.role, 'role placeholder keys');
      _assertEqual(r.defaultName, defaultRoleFolderName(role, project), 'role default name');
      const me = starterFolderModalModel({ recordType: 'project', record: project, project }, Object.assign({}, deps, { me: { email: 'dm@x.co', name: 'Dee Em' }, adminEmails: [] }));
      _assertEqual([me.recipients, me.recipientsLabel], [[], 'No one else'], 'creator is the DM → nobody else');
      const bare = starterFolderModalModel({ recordType: 'project', record: null, project: null }, Object.assign({}, deps, { adminEmails: [] }));
      _assertEqual([bare.recipients, bare.defaultName], [[], 'Project'], 'no project');
    },
  },
  {
    name: 'N-477 dashProjectSelectorModel — name, active / archive split, unknown id',
    fn: function () {
      const projects = [
        { id: 1, CustomerName: 'Acme', Status: 'Active' },
        { id: 2, CustomerName: 'Beta', Status: 'Completed' },
        { id: 3, CustomerName: 'Cora' },
      ];
      const m = dashProjectSelectorModel(projects, '2');
      _assertEqual(m.projectName, 'Beta', 'name by id (string or number)');
      _assertEqual(m.active.map(p => p.id), [1, 3], 'active');
      _assertEqual(m.archive.map(p => p.id), [2], 'archive');
      _assertEqual(dashProjectSelectorModel(projects, 99).projectName, 'Project', 'unknown id → Project');
      _assertEqual(dashProjectSelectorModel([], 1), { projectName: 'Project', active: [], archive: [] }, 'empty');
    },
  },
);
