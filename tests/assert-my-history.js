// tests/assert-my-history.js — My History: tiles and assignment record (N-455 / MM-5).
// Pure logic and markup run everywhere; the source-text checks need ALL_SOURCES (tests/run.js) and skip in the browser harness.

const _MH_TODAY = '2026-11-16';
const _mhA = (o) => Object.assign({ ProjectID: 1, StartDate: '2026-01-01T00:00:00Z' }, o);
const _MH_PROJECTS = [
  { id: 1, CustomerName: 'Acme <b>Ltd</b>', Status: 'Active', ProjectType: 'Perm' },
  { id: 2, CustomerName: 'Beta', Status: 'Completed', ProjectType: 'Perm' },
  { id: 3, CustomerName: 'Gamma', Status: 'Active', ProjectType: 'RPO' },
  { id: 5, CustomerName: 'Delta', Status: 'Active', ProjectType: 'RPO' },
];
function _mhAssignments() {
  return [
    _mhA({ ProjectID: 1, StartDate: '2025-01-01T00:00:00Z', EndDate: '2026-03-31T00:00:00Z' }),                       // own row ended, project still Active -> Completed
    _mhA({ ProjectID: 1, StartDate: '2026-04-05T00:00:00Z' }),                                                         // same project, open -> Current
    _mhA({ ProjectID: 2 }),                                                                                            // project Completed, no end -> Completed (sorts last)
    _mhA({ ProjectID: 3, StartDate: '2026-12-01T00:00:00Z' }),                                                         // Upcoming
    _mhA({ ProjectID: 4, IsForecast: 'Yes', EndDate: '2026-02-01T00:00:00Z' }),                                        // forecast: out
    { StartDate: '2026-01-01T00:00:00Z', Customer: 'Unassigned' },                                                     // bench / no ProjectID: out
    _mhA({ ProjectID: 5, StartDate: '2026-11-01T00:00:00Z', EndDate: '2026-11-16T00:00:00Z' }),                       // ends today -> still Current
    _mhA({ ProjectID: 99, Customer: 'Old Co', StartDate: '2025-06-01T00:00:00Z', EndDate: '2026-01-31T00:00:00Z' }),  // no Project row: Completed chip, not counted
  ];
}

ASSERTIONS.push(
  {
    name: 'N-455 AC2/AC4/AC5/AC6 rows: real rows only, three chips, own end completes a row, sort order',
    fn: function () {
      const rows = mmHistoryRows(_mhAssignments(), _MH_PROJECTS, _MH_TODAY);
      _assertEqual(rows.length, 6, 'forecast and no-ProjectID rows are out');
      _assertEqual(rows.map(r => r.projectId), [5, 1, 3, 1, 99, 2], 'Current (newest start), Upcoming, Completed (newest end, no end last)');
      _assertEqual(rows.map(r => r.status), ['current', 'current', 'upcoming', 'completed', 'completed', 'completed'], 'chips');
      _assertEqual(rows[0].end, '2026-11-16', 'a row that ends today is still Current');
      _assertEqual(rows[3].end, '2026-03-31', 'own row ended on a still-Active project is Completed');
      _assertEqual(rows[5].status, 'completed', 'project Completed completes a row with no end date');
      _assertEqual(rows[4].known, false, 'unknown project flagged');
      _assertEqual(rows[4].project, 'Old Co', 'unknown project falls back to the assignment Customer text');
      _assertEqual(rows.some(r => r.status === 'ended'), false, 'no Ended chip');
      _assertEqual(mmHistoryRows(null, null, _MH_TODAY), [], 'null inputs');
    },
  },
  {
    name: 'N-455 AC1/AC2/AC3 tiles: distinct known completed projects, blank start date, hires rule',
    fn: function () {
      const rows = mmHistoryRows(_mhAssignments(), _MH_PROJECTS, _MH_TODAY);
      const t = mmHistoryTiles({ StartDate: '2021-03-01T00:00:00Z' }, rows, 4);
      _assertEqual(t.projectsCompleted, 2, 'projects 1 (twice on the record, once counted) and 2; unknown project 99 not counted');
      _assertEqual(t.since, '2021-03-01', 'join date');
      _assertEqual(mmHistoryTiles({}, rows, 0).since, null, 'blank StartDate');
      _assertEqual(mmHistoryTiles({ StartDate: 'not a date' }, rows, 0).since, null, 'unreadable StartDate');
      _assertEqual(mmHistoryTiles(null, [], 0).projectsCompleted, 0, 'no rows = 0');
      _assertEqual(mmHistoryTiles({}, [], undefined).hires, null, 'no hires read = null');
      const pl = [
        { tpEmail: 'a@x.com', placementDate: '2026-11-04T00:00:00Z' },
        { tpEmail: 'A@x.com;b@x.com', placementDate: '2026-10-22T00:00:00Z' },
        { tpEmail: 'b@x.com', placementDate: '2026-10-27T00:00:00Z' },
        { tpEmail: 'a@x.com', placementDate: '2019-02-10T00:00:00Z' },
      ];
      _assertEqual(mmHistoryHireCount(pl, 'a@x.com'), 3, 'all time, shared placements credited, other people not');
      _assertEqual(mmHistoryHireCount(pl, 'nobody@x.com'), 0, 'none = 0');
      _assertEqual(mmHistoryHireCount(null, 'a@x.com'), 0, 'null placements');
    },
  },
  {
    name: 'N-455 AC1/AC3/AC4/AC7/AC10 markup: tiles, dash and zero, blank join date drops the tile, escaping, links, empty state',
    fn: function () {
      const rows = mmHistoryRows(_mhAssignments(), _MH_PROJECTS, _MH_TODAY);
      const tiles = mmHistoryTiles({ StartDate: '2021-03-01T00:00:00Z' }, rows, 0);
      const full = mmHistoryBodyHtml({ tiles, rows, canLink: true });
      _assertEqual(full.includes('@ Momentum since') && full.includes('1 Mar 2021'), true, 'join date tile');
      _assertEqual(full.includes('Projects completed') && full.includes('Total hires'), true, 'other tiles');
      _assertEqual(/Total hires/.test(full) && />0<\/div><div class="kpi-label">Total hires/.test(full), true, 'zero hires shows 0');
      _assertEqual(mmHistoryTilesHtml(mmHistoryTiles({}, rows, 3)).includes('@ Momentum since'), false, 'blank StartDate: tile absent');
      _assertEqual((mmHistoryTilesHtml(mmHistoryTiles({}, rows, 3)).match(/kpi-card/g) || []).length, 2, 'blank StartDate: two tiles remain');
      _assertEqual(mmHistoryTilesHtml(mmHistoryTiles({}, rows, null)).includes('>—</div><div class="kpi-label">Total hires'), true, 'failed hires read shows a dash');
      _assertEqual(full.includes('Acme &lt;b&gt;Ltd'), true, 'project name escaped');
      _assertEqual(full.includes('<b>'), false, 'no raw tag from data');
      _assertEqual(full.includes('reporting.html#projects?action=project&amp;id=1'), true, 'link for a viewer who can open it');
      _assertEqual(full.includes('id=99'), false, 'no link for an unknown project');
      _assertEqual(mmHistoryTableHtml(rows, false).includes('mmsc-link'), false, 'no link when the viewer cannot open Projects');
      _assertEqual(full.includes('Ongoing'), true, 'blank end reads Ongoing');
      _assertEqual(full.includes('badge badge-active') && full.includes('mmh-chip--upcoming') && full.includes('>Completed<'), true, 'chips');
      _assertEqual(mmHistoryBodyHtml({ tiles, rows: [], canLink: true }).includes('No project assignments recorded yet.'), true, 'empty state with tiles still drawn');
      _assertEqual(mmHistoryErrorHtml().includes('couldn’t load'), true, 'error panel');
    },
  },
  {
    name: 'N-455 AC7 access: who can open the Project page',
    fn: function () {
      ['admin', 'delivery_manager', 'talent_partner', 'leadership', 'people_ops'].forEach(r => _assertEqual(mmCanOpenProjectPage(r), true, r));
      ['sales', 'staff', 'viewer'].forEach(r => _assertEqual(mmCanOpenProjectPage(r), false, r));
    },
  },
  {
    name: 'N-455 diff-2 merge: rows of one project that run on with no gap are one line; a gap keeps them apart; the tile counts stints',
    fn: function () {
      const P = [
        { id: 6, CustomerName: 'Zen', Status: 'Active', ProjectType: 'CoE' },
        { id: 7, CustomerName: 'Pro', Status: 'Active', ProjectType: 'Embedded' },
        { id: 8, CustomerName: 'Open', Status: 'Active', ProjectType: 'RPO' },
        { id: 9, CustomerName: 'Month', Status: 'Active', ProjectType: 'RPO' },
      ];
      const a = [
        _mhA({ ProjectID: 6, StartDate: '2026-08-11T00:00:00Z', EndDate: '2026-10-31T00:00:00Z' }),   // listed first on purpose: input order must not matter
        _mhA({ ProjectID: 6, StartDate: '2026-08-01T00:00:00Z', EndDate: '2026-08-10T00:00:00Z' }),   // ends the day before: one stint
        _mhA({ ProjectID: 7, StartDate: '2026-01-01T00:00:00Z', EndDate: '2026-01-31T00:00:00Z' }),
        _mhA({ ProjectID: 7, StartDate: '2026-02-03T00:00:00Z', EndDate: '2026-07-31T00:00:00Z' }),   // 1-2 Feb is a gap: two stints
        _mhA({ ProjectID: 8, StartDate: '2026-05-01T00:00:00Z', EndDate: '2026-06-30T00:00:00Z' }),
        _mhA({ ProjectID: 8, StartDate: '2026-06-15T00:00:00Z', EndDate: '2026-07-15T00:00:00Z' }),   // overlaps the first
        _mhA({ ProjectID: 8, StartDate: '2026-07-01T00:00:00Z' }),                                    // open-ended: the stint is Current
        _mhA({ ProjectID: 9, StartDate: '2026-01-01T00:00:00Z', EndDate: '2026-01-31T00:00:00Z' }),
        _mhA({ ProjectID: 9, StartDate: '2026-02-01T00:00:00Z', EndDate: '2026-02-28T00:00:00Z' }),   // month boundary: one stint
      ];
      const rows = mmHistoryRows(a, P, _MH_TODAY);
      _assertEqual(rows.map(r => r.projectId), [8, 6, 7, 9, 7], 'one line per unbroken stint: Open (current), Zen, Pro, Month, Pro');
      _assertEqual(rows.map(r => r.status), ['current', 'completed', 'completed', 'completed', 'completed'], 'status judged on the merged span');
      _assertEqual([rows[0].start, rows[0].end], ['2026-05-01', ''], 'overlaps and an open end merge into one open stint');
      _assertEqual([rows[1].start, rows[1].end], ['2026-08-01', '2026-10-31'], 'extension: first start, last end');
      _assertEqual([rows[2].start, rows[2].end, rows[4].start, rows[4].end], ['2026-02-03', '2026-07-31', '2026-01-01', '2026-01-31'], 'a gap keeps the stints apart');
      _assertEqual([rows[3].start, rows[3].end], ['2026-01-01', '2026-02-28'], 'month boundary merges');
      _assertEqual(Object.keys(rows[0]).includes('done'), false, 'no working field leaks into the rows');
      _assertEqual(mmHistoryTiles({}, rows, 0).projectsCompleted, 4, 'tile: Zen once, Month once, Pro twice (gap); Open is not completed');
      _assertEqual(mmHistoryTableHtml(rows, false).match(/<tr>/g).length, 6, 'table: header + one body row per stint');
    },
  },
  {
    name: 'N-455 AC8/AC9/AC12 wiring: the landing tab renders the real page, the read keys off the (Ghost-aware) People row, no hex, no stub left',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      const nav = ALL_SOURCES['my-momentum-nav.js'], pages = ALL_SOURCES['my-momentum-pages.js'], api = ALL_SOURCES['api-access.js'];
      _assertEqual(nav.includes("case 'myHistory':     renderMyHistory();"), true, 'dispatch');
      _assertEqual(/renderMyHistoryStub|mmHistoryStubHtml/.test(nav + pages), false, 'stub removed');
      _assertEqual(/WorkEmail/.test(/function _mmHistFill[\s\S]*?\n}\r?\n/.exec(pages)[0]), true, 'keyed on the People row WorkEmail, not the signed-in account');
      _assertEqual(/getUserEmail|getCurrentUser/.test(/async function _mmHistFill[\s\S]*?\n}\r?\n/.exec(pages)[0]), false, 'no signed-in-account read in the fill');
      _assertEqual(/async function getMyHistoryData[\s\S]*?Promise\.all[\s\S]*?\.catch\(e => \{ console\.warn\('N-455/.test(api), true, 'reads in parallel; hires failure degrades');
      const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
      _assertEqual(/#[0-9a-fA-F]{3,6}\b/.test(strip(pages)), false, 'no hex in my-momentum-pages.js');
      _assertEqual(/new Date\(/.test(/function mmHistoryRows[\s\S]*?\n}\r?\n/.exec(ALL_SOURCES['my-momentum-logic.js'])[0]), false, 'no Date objects on SharePoint dates in the chip logic');
    },
  },
);