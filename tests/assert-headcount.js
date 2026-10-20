// tests/assert-headcount.js — role-stage sets, headcount model, placement headcount, hire KPIs, coe actuals/opens, role timeline.
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  {
    name: 'N-276 ttfClosedCensorTimes — trailing closed run, skips, lookback, BST day (N-309: one open headcount per pipeline)',
    fn: function () {
      const today = new Date(2026, 9, 1, 12);  // 1 Oct 2026, local noon
      const R = (id, stage, open) => ({ id, Stage: stage, Department: 'Eng', Location: 'UK', OpenDate: open + 'T12:00:00Z' });
      const S = (id, oldV, newV, at) => ({ RoleIDLookupId: id, Field: 'Stage', OldValue: oldV, NewValue: newV, ChangedAt: at });
      const roles = [
        R(1, 'Cancelled', '2026-06-01'), R(2, 'Cancelled', '2026-06-01'), R(3, 'On-hold', '2026-06-01'),
        R(4, 'Cancelled', '2026-06-01'), R(5, 'Cancelled', '2026-06-01'), R(6, 'On-hold', '2026-06-01'),
        R(7, 'Cancelled', '2026-06-01'), R(8, 'Cancelled', '2026-06-01'), R(9, 'Cancelled', '2026-06-01'),
        R(10, 'Cancelled', '2025-06-01'), R(11, 'Sourcing', '2026-06-01'), R(12, 'Cancelled', '2026-06-10'),
      ];
      const rows = [
        S(1, null, 'Sourcing', '2026-06-01T09:00:00Z'), S(1, 'Sourcing', 'Cancelled', '2026-07-01T10:00:00Z'),
        S(2, 'Interview 1', 'On-hold', '2026-06-21T10:00:00Z'), S(2, 'On-hold', 'Cancelled', '2026-07-31T10:00:00Z'),
        S(3, 'Sourcing', 'On-hold', '2026-06-16T10:00:00Z'),
        S(4, null, 'Cancelled', '2026-06-05T10:00:00Z'),
        S(5, 'Backlog', 'Cancelled', '2026-06-05T10:00:00Z'),
        S(6, 'Planning', 'On-hold', '2026-06-05T10:00:00Z'),
        S(7, 'Sourcing', 'On-hold', '2026-06-05T10:00:00Z'),          // latest row disagrees with Stage
        S(9, 'Sourcing', 'Cancelled', '2026-05-20T10:00:00Z'),        // t < 0
        S(10, 'Sourcing', 'Cancelled', '2025-07-01T10:00:00Z'),       // outside lookback
        S(11, 'Sourcing', 'Sourcing', '2026-06-05T10:00:00Z'),
        S(12, 'Sourcing', 'Cancelled', '2026-07-09T23:30:00Z'),       // 00:30 BST on 10 Jul
        { RoleIDLookupId: 1, Field: 'Priority', OldValue: 'Sourcing', NewValue: 'Cancelled', ChangedAt: '2026-08-01T10:00:00Z' },
      ];
      // N-309: the unit is the headcount — each pipeline gets one open headcount
      // opened on the role's OpenDate, so every N-276 t value carries over.
      const hc = roles.map(r => ({ id: 100 + r.id, RoleID: r.id, OpenDate: r.OpenDate, Status: 'Open' }));
      const out = ttfClosedCensorTimes(roles, rows, hc, new Map(), today);
      const t = Object.fromEntries(out.map(o => [o.roleId, o.t]));
      _assertEqual(t['1'], 30, 'AC4 Sourcing → Cancelled');
      _assertEqual(t['2'], 20, 'AC5 On-hold → Cancelled censored at the On-hold date');
      _assertEqual(t['3'], 15, 'AC6 currently On-hold');
      _assertEqual(Object.keys(t).filter(k => ['4', '5', '6', '7', '8', '9', '10', '11'].includes(k)), [], 'AC7 skips');
      _assertEqual(Object.keys(out[0]).sort(), ['Department', 'Location', 'Stage', 'headcountId', 'roleId', 't'], 'shape (N-309 adds headcountId)');
      if (localDayISO(new Date('2026-07-09T23:30:00Z')) !== '2026-07-10') {
        _skip('AC8 needs a UK timezone (BST) — runs under node tests/run.js.');
      }
      _assertEqual(t['12'], 30, 'AC8 BST instant resolves to the next local day');
    },
  },
  // ── N-305 (HC-0): centralised role-stage sets ──────────────────────────
  {
    name: 'isOpenPipelineStage: open stages true; parked, terminal false; blank true (N-305)',
    fn: function () {
      ['Planning', 'Sourcing', 'Submitted', 'Interview 1', 'Interview 2+', 'Final Interview', 'Offered']
        .forEach(s => _assertEqual(isOpenPipelineStage(s), true, s + ' is open'));
      ['Backlog', 'Closed', 'On-hold', 'Cancelled']
        .forEach(s => _assertEqual(isOpenPipelineStage(s), false, s + ' is not open'));
      // Old `!EXCLUDED.includes(r.Stage)` was true for a missing stage — preserved.
      [undefined, null, ''].forEach(s => _assertEqual(isOpenPipelineStage(s), true, JSON.stringify(s) + ' (blank) counts as open'));
    },
  },
  {
    name: 'Dashboards and Snapshots agree on "open": ACTIVE_STAGES ≡ not isOpenPipelineStage over ROLE_STAGES (N-305)',
    fn: function () {
      const notOpen = CONFIG.ROLE_STAGES.filter(s => !isOpenPipelineStage(s)).slice().sort();
      const snapshotClosed = ACTIVE_STAGES.filter(s => CONFIG.ROLE_STAGES.includes(s)).slice().sort();
      _assertEqual(notOpen, snapshotClosed, 'not-open stages vs ACTIVE_STAGES ∩ ROLE_STAGES');
    },
  },
  {
    name: 'Role-stage CONFIG sets: activity-excluded = parked ∪ terminal; every set ⊂ ROLE_STAGES (N-305)',
    fn: function () {
      const sorted = a => a.slice().sort();
      _assertEqual(sorted(CONFIG.ROLE_STAGES_ACTIVITY_EXCLUDED),
        sorted(CONFIG.ROLE_STAGES_PARKED.concat(CONFIG.ROLE_STAGE_TERMINAL)),
        'ROLE_STAGES_ACTIVITY_EXCLUDED vs PARKED ∪ TERMINAL');
      ['ROLE_STAGE_TERMINAL', 'ROLE_STAGES_PARKED', 'ROLE_STAGES_BRANCH', 'ROLE_STAGES_ACTIVITY_EXCLUDED'].forEach(k => {
        _assertEqual(CONFIG[k].filter(s => !CONFIG.ROLE_STAGES.includes(s)), [], k + ' values not in ROLE_STAGES');
      });
    },
  },
  {
    name: 'no page file redeclares a role-stage array (N-305 — lint-stage-arrays guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const found = lintStageArrays(ALL_SOURCES, ALL_HTML, stageArrayVocab(CONFIG), STAGE_ARRAY_ALLOW);
      _assertEqual(
        found.map(v => `${v.file}:${v.line}  ${v.text}`),
        [],
        'role-stage arrays outside config.js (use CONFIG.ROLE_STAGE* sets or isOpenPipelineStage())'
      );
    },
  },
  {
    name: 'lint-stage-arrays control: flags stage arrays, ignores mixed/single, catches a stale allow entry (N-305)',
    fn: function () {
      const vocab = stageArrayVocab(CONFIG);
      const lint = (src, html, allow) => lintStageArrays(src, html || {}, vocab, allow || [])
        .map(v => `${v.file}:${v.line}`);
      _assertEqual(lint({ 'a.js': "x();\nconst X = ['Backlog','Hired'];\n" }), ['a.js:2'], 'single-line, single-quoted');
      _assertEqual(lint({ 'b.js': 'const Y = [\n  "Backlog", "Planning",\n  // note\n  "Hired"\n];\n' }), ['b.js:1'], 'multi-line, double-quoted, with comment');
      _assertEqual(lint({ 'c.js': "f(['Closed', 'Cancelled']);\n" }), ['c.js:1'], "'Closed' is a live stage (N-306)");
      _assertEqual(lint({ 'd.js': "const L = ['Outreach','Submitted','Hired'];\nconst s = ['Hired'];\n" }), [], 'mixed array and single stage are not stage sets');
      _assertEqual(lint({ 'config.js': "const CONFIG = { S: ['Backlog','Hired'] };\n" }), [], 'config.js is the home of stage sets');
      _assertEqual(lint({}, { 'p.html': '<script src="x.js"></script>\n<script>\nconst Z = ["Hired","Cancelled"];\n</script>\n' }), ['p.html:3'], 'inline <script> in HTML');
      _assertEqual(lint({ 'analytics.js': "const ACTIVE_STAGES = ['Hired','Backlog'];\n" }, {}, [{ file: 'analytics.js', name: 'ACTIVE_STAGES' }]), [], 'allow-listed declaration');
      _assertEqual(lint({ 'e.js': 'x();\n' }, {}, [{ file: 'e.js', name: 'GONE' }]), ['e.js:0'], 'stale allow entry is reported');
    },
  },
  // ── N-306 (HC-1): headcount model + Hired → Closed ────────────────────
  {
    name: 'N-306 CONFIG: Closed replaces Hired; legacy alias, headcount + migration config; projections and index targets',
    fn: function () {
      _assertEqual(CONFIG.ROLE_STAGES.includes('Hired'), false, 'Hired is no longer a live stage');
      _assertEqual(CONFIG.ROLE_STAGES.indexOf('Closed'), CONFIG.ROLE_STAGES.indexOf('Offered') + 1, 'Closed sits right after Offered');
      _assertEqual(CONFIG.ROLE_STAGE_CLOSED, 'Closed', 'ROLE_STAGE_CLOSED');
      _assertEqual(CONFIG.ROLE_STAGE_TERMINAL, ['Closed', 'Cancelled'], 'ROLE_STAGE_TERMINAL');
      _assertEqual(CONFIG.ROLE_STAGE_LEGACY_ALIASES, { Hired: 'Closed' }, 'ROLE_STAGE_LEGACY_ALIASES');
      Object.keys(CONFIG.ROLE_STAGE_LEGACY_ALIASES).forEach(k => {
        _assertEqual(CONFIG.ROLE_STAGES.includes(k), false, k + ' (legacy) is not a live stage');
        _assertEqual(CONFIG.ROLE_STAGES.includes(CONFIG.ROLE_STAGE_LEGACY_ALIASES[k]), true, k + ' maps to a live stage');
      });
      _assertEqual([CONFIG.HEADCOUNT.STATUS_OPEN, CONFIG.HEADCOUNT.STATUS_CANCELLED], ['Open', 'Cancelled'], 'headcount statuses');
      _assertEqual(CONFIG.LIST_FIELDS.Placements.includes('HeadcountID'), true, 'Placements projects HeadcountID');
      _assertEqual(CONFIG.LIST_FIELDS.RoleHeadcount,
        ['Title', 'RoleID', 'ProjectID', 'Sequence', 'OpenDate', 'TargetHireDate', 'Backfill', 'Notes', 'Status', 'CancelledDate'],
        'RoleHeadcount projection');
      _assertEqual(FIELD_ALIASES.RoleHeadcount, {}, 'RoleHeadcount registers as {} (no alias)');
      const idx = CONFIG.INDEX_TARGETS.map(t => t.list + '.' + t.column);
      ['RoleHeadcount.RoleID', 'RoleHeadcount.ProjectID', 'Placements.HeadcountID']
        .forEach(k => _assertEqual(idx.includes(k), true, k + ' in INDEX_TARGETS'));
      _assertEqual(CONFIG.CACHE.persistentLists.includes('RoleHeadcount'), false, 'RoleHeadcount is transactional — never tier 2');
      _assertEqual(CONFIG.DELTA.enrolledLists.includes('RoleHeadcount'), false, 'RoleHeadcount not delta-enrolled');
      _assertEqual(CONFIG.RESTRICTED_LISTS.includes('RoleHeadcount'), false, 'RoleHeadcount is not restricted (Tier 4)');
    },
  },
  {
    name: 'N-306 normaliseRoleStage / normaliseRoleHistoryRows — Hired reads as Closed; Stage rows only; input never mutated',
    fn: function () {
      _assertEqual(normaliseRoleStage('Hired'), 'Closed', 'Hired → Closed');
      _assertEqual(normaliseRoleStage('Closed'), 'Closed', 'Closed unchanged');
      _assertEqual(normaliseRoleStage('Sourcing'), 'Sourcing', 'Sourcing unchanged');
      _assertEqual(normaliseRoleStage(undefined), undefined, 'undefined unchanged');
      _assertEqual(normaliseRoleStage(null), null, 'null unchanged');
      _assertEqual(normaliseRoleStage('toString'), 'toString', 'prototype keys are not aliases');
      const rows = [
        { id: 1, Field: 'Stage', OldValue: 'Offered', NewValue: 'Hired' },
        { id: 2, Field: 'Stage', OldValue: 'Hired', NewValue: 'Sourcing' },
        { id: 3, Field: 'Stage', OldValue: null, NewValue: 'Planning' },
        { id: 4, Field: 'Notes', OldValue: 'Hired', NewValue: 'Hired' },
      ];
      const before = JSON.stringify(rows);
      const out = normaliseRoleHistoryRows(rows);
      _assertEqual(JSON.stringify(rows), before, 'input not mutated');
      _assertEqual(out.map(r => [r.OldValue, r.NewValue]),
        [['Offered', 'Closed'], ['Closed', 'Sourcing'], [null, 'Planning'], ['Hired', 'Hired']], 'mapped values');
      _assertEqual(out[2] === rows[2] && out[3] === rows[3], true, 'unchanged rows are passed through as-is');
      _assertEqual(normaliseRoleHistoryRows(null), [], 'null → []');
    },
  },
  {
    name: 'N-306 headcount classification: filled is derived from placements; counts are D-5 x/y',
    fn: function () {
      const hc = [
        { id: '1', Status: 'Open' },                                     // open (no placement)
        { id: '2', Status: 'Open', OpenDate: '2026-01-05T12:00:00Z' },   // filled
        { id: '3', Status: 'Cancelled' },                                // cancelled
        { id: '4', Status: 'Cancelled' },                                // cancelled, but a placement links it → filled
      ];
      const fill = headcountFillMap([
        { id: 'p1', HeadcountID: 2 }, { id: 'p2', HeadcountID: '4' }, { id: 'p3', HeadcountID: '' }, { id: 'p4' }, null,
      ]);
      _assertEqual([...fill.keys()].sort(), ['2', '4'], 'fill map skips blank ids; number and string ids both key as strings');
      _assertEqual(hc.map(h => classifyHeadcount(h, fill)), ['open', 'filled', 'cancelled', 'filled'], 'classification');
      _assertEqual(headcountCounts(hc, fill), { open: 1, filled: 2, cancelled: 1, total: 3 }, 'counts (total = open + filled)');
      _assertEqual(headcountCounts([], fill), { open: 0, filled: 0, cancelled: 0, total: 0 }, 'empty');
    },
  },
  {
    name: 'N-306 orderOpenHeadcount (D-5)',
    fn: function () {
      const hc = [
        { id: '10', Sequence: 1, Status: 'Open', OpenDate: '2026-03-01T12:00:00Z' },
        { id: '11', Sequence: 2, Status: 'Open' },                                     // not opened → last
        { id: '12', Sequence: 3, Status: 'Open', OpenDate: '2026-02-01T12:00:00Z' },
        { id: '13', Sequence: 4, Status: 'Open', OpenDate: '2026-02-01T12:00:00Z' },   // tie → Sequence
        { id: '14', Sequence: 5, Status: 'Cancelled', OpenDate: '2026-01-01T12:00:00Z' },
        { id: '15', Sequence: 6, Status: 'Open', OpenDate: '2026-01-01T12:00:00Z' },   // filled → excluded
      ];
      const fill = headcountFillMap([{ id: 'p', HeadcountID: 15 }]);
      _assertEqual(orderOpenHeadcount(hc, fill).map(h => h.id), ['12', '13', '10', '11'], 'OpenDate asc, tie by Sequence, no OpenDate last');
      // N-308: defaultHeadcountForPlacement (transitional) removed — the
      // placement picker (placementHeadcountGroups) replaces it.
    },
  },
  {
    name: 'N-306 earliestHeadcountOpenDate / nextHeadcountSequence / headcountLabel',
    fn: function () {
      _assertEqual(earliestHeadcountOpenDate([
        { OpenDate: '2026-05-01T12:00:00Z' }, { OpenDate: '2026-04-02T12:00:00Z', Status: 'Cancelled' }, { OpenDate: '' }, {},
      ]), '2026-04-02', 'min day, cancelled included, blanks ignored');
      _assertEqual(earliestHeadcountOpenDate([{}, { OpenDate: null }]), null, 'all blank → null');
      _assertEqual(earliestHeadcountOpenDate([]), null, 'none → null');
      // Day = spDateIn() string slice — the same day rule every Roles.OpenDate
      // reader uses (roleStageEntryDay, the timeline); no Date, no local getter.
      _assertEqual(earliestHeadcountOpenDate([{ OpenDate: '2026-06-30T23:00:00Z' }]), '2026-06-30', 'spDateIn day');
      _assertEqual(nextHeadcountSequence([]), 1, 'first');
      _assertEqual(nextHeadcountSequence([{ Sequence: 1 }, { Sequence: '3' }, { Sequence: null }]), 4, 'max + 1, never reused');
      _assertEqual(headcountLabel(2), 'Headcount 2', 'label');
    },
  },
  {
    name: 'N-306 checkHeadcountIntegrity — each probe fires on its own fixture; a clean set reads all zero',
    fn: function () {
      const KEYS = ['placementNoHeadcount', 'placementHeadcountMismatch', 'roleNoHeadcount', 'closedWithOpen',
        'openPipelineNoOpen', 'openDateDrift', 'headcountProjectMismatch', 'legacyStage'];
      const counts = d => checkHeadcountIntegrity(d).map(c => c.count);
      const only = key => KEYS.map(k => (k === key ? 1 : 0));
      // Clean: an open pipeline with one open headcount; a closed pipeline whose one headcount is filled.
      const clean = () => ({
        roles: [
          { id: '1', Stage: 'Sourcing', ProjectIDLookupId: 5, OpenDate: '2026-02-01T12:00:00Z' },
          { id: '2', Stage: 'Closed', ProjectIDLookupId: 5 },
        ],
        headcount: [
          { id: '10', RoleID: 1, ProjectID: 5, Sequence: 1, Status: 'Open', OpenDate: '2026-02-01T12:00:00Z' },
          { id: '20', RoleID: 2, ProjectID: '5', Sequence: 1, Status: 'Open' },
        ],
        placements: [{ id: 'p', RoleIDLookupId: 2, HeadcountID: 20 }],
      });
      _assertEqual(checkHeadcountIntegrity(clean()).map(c => c.key), KEYS, 'check order');
      _assertEqual(counts(clean()), KEYS.map(() => 0), 'clean → all zero');
      let d;
      d = clean(); d.placements.push({ id: 'q', RoleIDLookupId: 2, HeadcountID: '' });
      _assertEqual(counts(d), only('placementNoHeadcount'), 'placement with no HeadcountID');
      d = clean(); d.placements.push({ id: 'r', RoleIDLookupId: 2, HeadcountID: 999 });
      _assertEqual(counts(d), only('placementHeadcountMismatch'), 'placement linked to a headcount that does not exist');
      d = clean(); d.roles.push({ id: '3', Stage: 'Backlog', ProjectIDLookupId: 5 });
      _assertEqual(counts(d), only('roleNoHeadcount'), 'role with no headcount');
      d = clean(); d.headcount.push({ id: '22', RoleID: 2, ProjectID: 5, Sequence: 2, Status: 'Open' });
      _assertEqual(counts(d), only('closedWithOpen'), 'closed pipeline with an open headcount');
      d = clean(); d.headcount[0].Status = 'Cancelled';
      _assertEqual(counts(d), only('openPipelineNoOpen'), 'open pipeline with no open headcount');
      d = clean(); d.roles[0].OpenDate = '2026-01-15T12:00:00Z';
      _assertEqual(counts(d), only('openDateDrift'), 'Roles.OpenDate ≠ earliest headcount OpenDate');
      d = clean(); d.headcount[0].ProjectID = 9;
      _assertEqual(counts(d), only('headcountProjectMismatch'), 'headcount on another project');
      d = clean(); d.roles[0].Stage = 'Hired';
      _assertEqual(counts(d), only('legacyStage'), 'role still at Hired');
      // Another role's headcount also counts as a mismatch.
      d = clean(); d.headcount.push({ id: '11', RoleID: 1, ProjectID: 5, Sequence: 2, Status: 'Open', OpenDate: '2026-03-01T12:00:00Z' });
      d.placements.push({ id: 's', RoleIDLookupId: 2, HeadcountID: 11 });
      _assertEqual(counts(d), only('placementHeadcountMismatch'), "placement linked to another role's headcount");
      _assertEqual(checkHeadcountIntegrity({}).map(c => c.count), KEYS.map(() => 0), 'no data → all zero');
    },
  },
  {
    name: 'N-306 headcount writes only via api-headcount.js helpers (lint-headcount-writes guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintHeadcountWrites(ALL_SOURCES).map(v => `${v.file}:${v.line}  ${v.text}`), [],
        'raw RoleHeadcount writes outside api-headcount.js (use createHeadcount / updateHeadcount / cancelHeadcount)');
    },
  },
  {
    name: 'lint-headcount-writes control: flags raw writes outside api-headcount.js, ignores reads and api-headcount.js (N-306)',
    fn: function () {
      const lint = src => lintHeadcountWrites(src).map(v => `${v.file}:${v.line}`);
      _assertEqual(lint({ 'pages.js': "x();\nawait createItem('RoleHeadcount', f);\nupdateItem( \"RoleHeadcount\", 1, f);\n" }),
        ['pages.js:2', 'pages.js:3'], 'create + update flagged');
      _assertEqual(lint({ 'forms.js': 'deleteItem(`RoleHeadcount`, 3);\n' }), ['forms.js:1'], 'delete, backtick');
      _assertEqual(lint({ 'api-headcount.js': "createItem('RoleHeadcount', f);\n" }), [], 'api-headcount.js is the home of headcount writes');
      _assertEqual(lint({ 'api.js': "createItem('RoleHeadcount', f);\n" }), ['api.js:1'], 'api.js is no longer exempt (N-347)');
      _assertEqual(lint({ 'pages.js': "getItems('RoleHeadcount');\ncreateItem('RoleHistory', f);\n" }), [], 'reads and other lists not flagged');
    },
  },
  {
    name: 'N-306 stageArrayVocab keeps the retired Hired, plus Closed and Placed',
    fn: function () {
      const v = stageArrayVocab(CONFIG);
      ['Hired', 'Closed', 'Placed'].forEach(s => _assertEqual(v.includes(s), true, s + ' in the vocabulary'));
    },
  },
  {
    name: 'N-307 headcountSummary / headcountXY / headcountXYTitle',
    fn: function () {
      const hc = [
        { id: '1', RoleID: 7, Sequence: 1, Status: 'Open', OpenDate: '2026-05-10T12:00:00Z' },
        { id: '2', RoleID: 7, Sequence: 2, Status: 'Open' },                                   // open, undated
        { id: '3', RoleID: 7, Sequence: 3, Status: 'Open', OpenDate: '2026-01-01T12:00:00Z' }, // filled
        { id: '4', RoleID: 7, Sequence: 4, Status: 'Cancelled', OpenDate: '2025-12-01T12:00:00Z' },
        { id: '5', RoleID: 7, Sequence: 5, Status: 'Open', OpenDate: '2026-04-02T12:00:00Z' },
      ];
      const fill = headcountFillMap([{ id: 'p1', HeadcountID: '3' }]);
      const sm = headcountSummary(hc, fill);
      _assertEqual(sm.counts, { open: 3, filled: 1, cancelled: 1, total: 4 }, 'counts');
      _assertEqual(sm.oldestOpenDay, '2026-04-02', 'oldest OPEN dated headcount — filled / cancelled / undated ignored');
      _assertEqual(headcountSummary([{ id: '9', Status: 'Open' }], new Map()).oldestOpenDay, null, 'all undated → null');
      _assertEqual(headcountXY(sm.counts), '3/4', 'x/y = open / (open + filled)');
      _assertEqual(headcountXY(headcountCounts([], new Map())), '—', 'nothing to count → dash');
      _assertEqual(headcountXYTitle(sm.counts), '3 open of 4 · 1 filled · 1 cancelled', 'title breakdown');
      _assertEqual([...groupHeadcountByRole(hc).keys()], ['7'], 'grouped by String(RoleID)');
    },
  },
  {
    name: 'N-307 roleStageChangeRule (D-1, D-2, S-2)',
    fn: function () {
      const c = open => ({ open, filled: 0, cancelled: 0, total: open });
      const r = (from, to, open) => roleStageChangeRule({ fromStage: from, toStage: to, counts: c(open) });
      _assertEqual(r('Offered', 'Closed', 1).ok, false, 'Closed blocked while headcount open');
      _assertEqual(/1 headcount still open/.test(r('Offered', 'Closed', 1).reason), true, 'reason names the count');
      _assertEqual(r('Offered', 'Closed', 0).ok, true, 'Closed allowed with none open');
      _assertEqual(r('Sourcing', 'Cancelled', 2), { ok: true, reason: '', cascadeCancel: true }, 'Cancelled cascades open headcount');
      _assertEqual(r('Sourcing', 'Cancelled', 0).cascadeCancel, false, 'nothing to cascade');
      _assertEqual(r('Closed', 'Sourcing', 0).ok, false, 'open stage refused with 0 open');
      _assertEqual(r('Closed', 'Sourcing', 1).ok, true, 'open stage allowed with 1 open');
      _assertEqual(r('Sourcing', 'Backlog', 0).ok, true, 'parked stage allowed with 0 open');
      _assertEqual(r('Interview 1', 'Interview 1', 0).ok, true, 'same stage always ok');
      _assertEqual(r('Hired', 'Closed', 3).ok, true, "legacy 'Hired' normalises to Closed → same stage");
    },
  },
  {
    name: 'N-307 pipelineAfterLastOpen (S-5)',
    fn: function () {
      _assertEqual(pipelineAfterLastOpen({ open: 0, filled: 1, cancelled: 0, total: 1 }), 'close', 'a fill → offer Close');
      _assertEqual(pipelineAfterLastOpen({ open: 0, filled: 0, cancelled: 2, total: 0 }), 'cancel', 'no fill → offer Cancel');
      _assertEqual(pipelineAfterLastOpen({ open: 1, filled: 1, cancelled: 0, total: 2 }), null, 'still open → nothing');
      _assertEqual(pipelineAfterLastOpen({ open: 0, filled: 0, cancelled: 0, total: 0 }), null, 'no headcount at all → nothing');
    },
  },
  {
    name: 'N-307 defaultTargetHireDate follows ANALYTICS_BENCHMARKS.timeToHireDays',
    fn: function () {
      const n = CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays;
      _assertEqual(defaultTargetHireDate('2026-10-08'), addDaysISO('2026-10-08', n), 'Open + configured days');
      _assertEqual(addDaysISO('2026-10-08', 45), '2026-11-22', 'arithmetic control: 8 Oct + 45d = 22 Nov');
      _assertEqual(defaultTargetHireDate('2026-12-20'), addDaysISO('2026-12-20', n), 'year rollover');
      _assertEqual(addDaysISO('2026-12-20', 45), '2027-02-03', 'rollover arithmetic control');
      _assertEqual(defaultTargetHireDate(''), null, 'blank → null');
      _assertEqual(defaultTargetHireDate(null), null, 'null → null');
    },
  },
  {
    name: 'N-307 reopenStageOptions / HEADCOUNT.reopenStage / clampHeadcountCount',
    fn: function () {
      const opts = reopenStageOptions();
      CONFIG.ROLE_STAGE_TERMINAL.forEach(s => _assertEqual(opts.includes(s), false, s + ' excluded'));
      _assertEqual(opts, CONFIG.ROLE_STAGES.filter(s => opts.includes(s)), 'ROLE_STAGES order kept');
      _assertEqual(opts.length, CONFIG.ROLE_STAGES.length - CONFIG.ROLE_STAGE_TERMINAL.length, 'only terminal stages dropped');
      _assertEqual(CONFIG.ROLE_STAGES.includes(CONFIG.HEADCOUNT.reopenStage), true, 'reopenStage is a stage');
      _assertEqual(isOpenPipelineStage(CONFIG.HEADCOUNT.reopenStage), true, 'reopenStage is an open-pipeline stage');
      const max = CONFIG.HEADCOUNT.maxPerAdd;
      _assertEqual([clampHeadcountCount(''), clampHeadcountCount('0'), clampHeadcountCount('3'),
        clampHeadcountCount('999'), clampHeadcountCount('2.7'), clampHeadcountCount(undefined)],
        [1, 1, 3, max, 2, 1], 'clamped to 1..maxPerAdd');
    },
  },
  {
    name: 'N-308 placementHeadcountGroups (S-1, S-2, S-4)',
    fn: function () {
      const roles = [
        { id: 1, RoleTitle: 'Zeta Engineer', Location: 'Lisbon', Stage: 'Sourcing' },
        { id: 2, RoleTitle: 'Alpha Analyst', Stage: 'On-hold' },
        { id: 3, RoleTitle: 'Mid Designer', Stage: 'Closed' },
        { id: 4, RoleTitle: 'Beta PM', Stage: 'Interview 1' },
      ];
      const headcount = [
        { id: 10, RoleID: 1, Sequence: 1, Status: 'Open' },                                  // undated → last
        { id: 11, RoleID: 1, Sequence: 2, Status: 'Open', OpenDate: '2026-09-03T12:00:00Z' },
        { id: 12, RoleID: 1, Sequence: 3, Status: 'Open', OpenDate: '2026-08-01T12:00:00Z' }, // filled
        { id: 13, RoleID: 1, Sequence: 4, Status: 'Cancelled' },
        { id: 20, RoleID: 2, Sequence: 1, Status: 'Open' },                                  // On-hold pipeline
        { id: 30, RoleID: 3, Sequence: 1, Status: 'Open', OpenDate: '2026-07-01T12:00:00Z' }, // filled by the edited placement
        { id: 40, RoleID: 4, Sequence: 1, Status: 'Open', OpenDate: '2026-06-01T12:00:00Z', Backfill: true },
        { id: 99, RoleID: 77, Sequence: 1, Status: 'Open' },                                 // role not in scope
      ];
      const placements = [{ id: 'p1', HeadcountID: 12 }, { id: 'p2', HeadcountID: 30 }];
      const g = placementHeadcountGroups({ roles, headcount, placements });
      _assertEqual(g.map(x => x.roleLabel), ['Beta PM', 'Zeta Engineer (Lisbon)'], 'open-stage pipelines only, alphabetical; On-hold/Closed/out-of-scope absent');
      _assertEqual(g[1].options.map(o => o.id), [11, 10], 'Zeta: dated open first, undated last; filled and cancelled excluded');
      _assertEqual(g[1].options.every(o => o.roleId === 1 && o.current === false), true, 'option carries roleId, not current');
      const e = placementHeadcountGroups({ roles, headcount, placements, currentHeadcountId: 30, excludePlacementId: 'p2' });
      const mid = e.find(x => x.roleId === 3);
      _assertEqual(mid && mid.options.map(o => [o.id, o.current]), [[30, true]], 'Closed pipeline listed only for the current headcount, marked current');
      _assertEqual(e.map(x => x.roleLabel), ['Beta PM', 'Mid Designer', 'Zeta Engineer (Lisbon)'], 'still alphabetical');
      const ex = placementHeadcountGroups({ roles, headcount, placements, excludePlacementId: 'p1' });
      _assertEqual(ex.find(x => x.roleId === 1).options.map(o => o.id), [12, 11, 10], 'excluding the filling placement re-opens its headcount');
      const cur = placementHeadcountGroups({ roles, headcount, placements, currentHeadcountId: 12 });
      _assertEqual(cur.find(x => x.roleId === 1).options.map(o => [o.id, o.current]), [[12, true], [11, false], [10, false]], 'a filled current headcount is prepended');
      _assertEqual(placementHeadcountGroups({ roles: [], headcount, placements }), [], 'no roles → no groups');
      _assertEqual(placementPreselectHeadcountId(g, 1), 11, 'preselect = first option of the role');
      _assertEqual(placementPreselectHeadcountId(g, 2), null, 'role with no group → null');
      _assertEqual(placementPreselectHeadcountId(g, null), null, 'no role → null');
    },
  },
  {
    name: 'N-308 placementHeadcountOptionLabel / placementHeadcountOptionsHtml',
    fn: function () {
      _assertEqual(placementHeadcountOptionLabel({ Title: 'Headcount 2', OpenDate: '2026-09-03T12:00:00Z' }), 'Headcount 2 · opened 2026-09-03', 'dated');
      _assertEqual(placementHeadcountOptionLabel({ Sequence: 3 }), 'Headcount 3 · not opened', 'undated; title falls back to the label template');
      _assertEqual(placementHeadcountOptionLabel({ Title: 'Headcount 1', Backfill: true }, { current: true }), 'Headcount 1 · not opened · Backfill · current', 'suffixes');
      _assertEqual(placementHeadcountOptionLabel({ Title: 'Headcount 1', OpenDate: '2026-08-31T23:00:00Z' }), 'Headcount 1 · opened 2026-08-31', 'spDateIn day rule (string slice)');
      const groups = [
        { roleId: 1, roleLabel: 'A <b>"&\'', options: [{ id: 5, roleId: 1, label: 'Headcount 1 · <x>', current: false }, { id: 6, roleId: 1, label: 'Headcount 2', current: false }] },
        { roleId: 2, roleLabel: 'B', options: [{ id: 7, roleId: 2, label: 'Headcount 1', current: false }] },
      ];
      const html = placementHeadcountOptionsHtml(groups, 6);
      _assertEqual((html.match(/ selected/g) || []).length, 1, 'exactly one selected');
      _assertEqual(/<option value="6" data-role-id="1" selected>/.test(html), true, 'selected id marked, with its role id');
      _assertEqual(html.indexOf('<b>'), -1, 'optgroup label escaped');
      _assertEqual(html.indexOf('<x>'), -1, 'option text escaped');
      _assertEqual((html.match(/<optgroup /g) || []).length, 2, 'one optgroup per pipeline');
      _assertEqual(html.indexOf('<option value="">-- Select headcount --</option>'), 0, 'placeholder first');
      _assertEqual((placementHeadcountOptionsHtml(groups, null).match(/ selected/g) || []).length, 0, 'no selection');
      _assertEqual(placementHeadcountOptionsHtml([], null), '<option value="">-- No open headcount — add headcount on the role page --</option>', 'empty state');
    },
  },
  {
    name: 'N-308 validatePlacementHeadcount (S-3)',
    fn: function () {
      const open = { id: 1, Status: 'Open' }, cancelled = { id: 2, Status: 'Cancelled' }, filled = { id: 3, Status: 'Open' };
      const state = { placements: [{ id: 'p9', HeadcountID: 3 }] };
      _assertEqual(validatePlacementHeadcount({ headcount: null, state }).ok, false, 'missing → refused');
      _assertEqual(validatePlacementHeadcount({ headcount: open, state }), { ok: true, reason: '' }, 'open → ok');
      const f = validatePlacementHeadcount({ headcount: filled, state });
      _assertEqual([f.ok, /filled/.test(f.reason)], [false, true], 'filled → refused with reason');
      const c = validatePlacementHeadcount({ headcount: cancelled, state });
      _assertEqual([c.ok, /cancelled/.test(c.reason)], [false, true], 'cancelled → refused with reason');
      _assertEqual(validatePlacementHeadcount({ headcount: filled, state, excludePlacementId: 'p9' }).ok, true, 'filled only by the edited placement → ok');
      _assertEqual(validatePlacementHeadcount({ headcount: filled, state, currentHeadcountId: '3' }).ok, true, 'edit keeping its own headcount → ok');
      _assertEqual(validatePlacementHeadcount({ headcount: cancelled, state, currentHeadcountId: 2 }).ok, true, 'current headcount ok even if cancelled since');
    },
  },
  {
    name: 'N-308 placementTimeToHire (day maths, BST-safe)',
    fn: function () {
      _assertEqual(placementTimeToHire('2026-09-01T12:00:00Z', '2026-09-15T12:00:00Z'), 14, 'two weeks');
      _assertEqual(placementTimeToHire('2026-08-31T23:00:00Z', '2026-09-15T12:00:00Z'), 15, 'BST-stored open reads as 31 Aug');
      _assertEqual(placementTimeToHire('2026-12-20T12:00:00Z', '2027-01-03T12:00:00Z'), 14, 'year rollover');
      _assertEqual(placementTimeToHire('2026-02-27T12:00:00Z', '2026-03-02T12:00:00Z'), 3, 'month rollover (non-leap Feb)');
      _assertEqual(placementTimeToHire(null, '2026-09-15T12:00:00Z'), null, 'not opened → null');
      _assertEqual(placementTimeToHire('2026-09-01T12:00:00Z', undefined), null, 'no offer date → null');
    },
  },
  {
    name: 'N-308 placementFollowUp (D-2 close / stage prompt)',
    fn: function () {
      _assertEqual(placementFollowUp({ stage: 'Offered', counts: { open: 0, filled: 2, cancelled: 0, total: 2 } }), 'close', 'last open filled → close');
      _assertEqual(placementFollowUp({ stage: 'Offered', counts: { open: 1, filled: 1, cancelled: 0, total: 2 } }), 'stage', 'open remain → stage');
      _assertEqual(placementFollowUp({ stage: CONFIG.ROLE_STAGE_CLOSED, counts: { open: 0, filled: 1, cancelled: 0, total: 1 } }), null, 'Closed → nothing');
      _assertEqual(placementFollowUp({ stage: 'Hired', counts: { open: 0, filled: 1, cancelled: 0, total: 1 } }), null, "legacy 'Hired' normalises to Closed → nothing");
      _assertEqual(placementFollowUp({ stage: 'Cancelled', counts: { open: 1, filled: 0, cancelled: 0, total: 1 } }), null, 'Cancelled → nothing');
      _assertEqual(placementFollowUp({ stage: 'Sourcing', counts: { open: 0, filled: 0, cancelled: 1, total: 0 } }), null, 'nothing filled, nothing open → nothing');
    },
  },
  {
    name: 'N-309 historicalHiresFromPlacements — one row per fill, id = pipeline, D-5 / D-7, fallbacks',
    fn: function () {
      const roles = [{ id: 1, RoleTitle: 'Eng', Department: 'Eng', Location: 'UK', OpenDate: '2026-01-01T12:00:00Z', TalentPartner: 'a@x.com;b@x.com' }];
      const headcount = [
        { id: 11, RoleID: 1, OpenDate: '2026-02-01T12:00:00Z' },
        { id: 12, RoleID: 1, OpenDate: null },
      ];
      const P = (id, roleId, hcId, offer, tp) => ({ id, RoleIDLookupId: roleId, HeadcountID: hcId, OfferAcceptedDate: offer, TalentPartner: tp });
      const placements = [
        P(101, 1, 11, '2026-03-01T12:00:00Z', 'a@x.com'),
        P(102, 1, 12, '2026-04-01T12:00:00Z', 'b@x.com'),
        P(103, 1, null, '2026-05-01T12:00:00Z', ''),
        P(104, 99, 11, '2026-05-01T12:00:00Z', 'a@x.com'),     // role gone → dropped
        P(105, 1, 11, null, 'a@x.com'),                        // no offer date → dropped
        P(106, 1, 999, '2026-06-01T12:00:00Z', 'a@x.com'),     // unknown headcount → role OpenDate
      ];
      const before = JSON.stringify([roles, headcount, placements]);
      const out = historicalHiresFromPlacements(placements, roles, headcount);
      _assertEqual(out.map(r => r.placementId), [101, 102, 103, 106], 'one row per placement with an offer date on a known role');
      _assertEqual(out.map(r => r.id), [1, 1, 1, 1], 'id is the pipeline id on every row');
      _assertEqual(out.map(r => r.headcountId), [11, 12, null, null], 'headcountId');
      _assertEqual(out.map(r => r.openDate), ['2026-02-01T12:00:00Z', null, '2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z'],
        'headcount OpenDate; not opened → null; blank/unknown HeadcountID → role OpenDate');
      _assertEqual(out.map(r => r.tpEmail), ['a@x.com', 'b@x.com', null, 'a@x.com'], 'tpEmail = placer (D-7), never the role TP list');
      _assertEqual(out[0], { id: 1, headcountId: 11, placementId: 101, title: 'Eng', functionArea: 'Eng', country: 'UK',
        openDate: '2026-02-01T12:00:00Z', placementDate: '2026-03-01T12:00:00Z', tpEmail: 'a@x.com' }, 'row shape');
      _assertEqual(JSON.stringify([roles, headcount, placements]), before, 'inputs not mutated');
      _assertEqual(historicalHiresFromPlacements(null, null, null), [], 'null-safe');

      // D-8: an OPEN pipeline with a fill joins the funnel learning population.
      const idx = funnelLearningIndex(out, [{ id: 1, Stage: 'Sourcing', Department: 'Eng', Location: 'UK' }, { id: 2, Stage: 'Sourcing' }]);
      _assertEqual(Array.from(idx.keys()), ['1'], 'D-8 open pipeline with ≥1 fill is learning; one with none is not');
    },
  },
  {
    name: 'N-309 getHistoricalPlacements reads placements, roles and headcount — no Stage / ActualHireDate filter',
    fn: function () {
      const saved = getItems; const calls = [];
      getItems = function (list, filter, select) { calls.push([list, filter || '', select]); return Promise.resolve([]); };
      try {
        getHistoricalPlacements();
        _assertEqual(calls.map(c => c[0]).sort(), ['Placements', 'RoleHeadcount', 'Roles'], 'three reads');
        const pl = calls.find(c => c[0] === 'Placements');
        _assertEqual(/^fields\/OfferAcceptedDate ge '\d{4}-\d{2}-\d{2}'$/.test(pl[1]), true, 'Placements bounded on OfferAcceptedDate only');
        _assertEqual(calls.some(c => /Stage|ActualHireDate/.test(c[1])), false, 'no Stage / ActualHireDate filter anywhere');
      } finally { getItems = saved; }

      // AC 11 (QA fix): a failed RoleHeadcount read degrades to [] instead of
      // rejecting the whole call. Tests run synchronously, so capture the
      // .catch handler getHistoricalPlacements attaches and invoke it directly.
      const savedItems = getItems, savedHc = getAllHeadcount, savedWarn = console.warn;
      let handler = null;
      getItems = function () { return Promise.resolve([]); };
      getAllHeadcount = function () { return { catch: function (fn) { handler = fn; return Promise.resolve([]); } }; };
      console.warn = function () {};
      try {
        getHistoricalPlacements();
        _assertEqual(typeof handler, 'function', 'AC11 headcount read has a .catch fallback');
        _assertEqual(handler(new Error('403 RoleHeadcount')), [], 'AC11 fallback resolves to no headcount');
      } finally { getItems = savedItems; getAllHeadcount = savedHc; console.warn = savedWarn; }
      const fb = historicalHiresFromPlacements(
        [{ id: 1, RoleIDLookupId: 5, HeadcountID: 50, OfferAcceptedDate: '2026-03-01T12:00:00Z', TalentPartner: 'a@x.com' }],
        [{ id: 5, OpenDate: '2026-02-01T12:00:00Z' }], []);
      _assertEqual(fb.map(r => r.openDate), ['2026-02-01T12:00:00Z'], 'AC11 with no headcount the hire keeps the pipeline Open Date');
    },
  },
  {
    name: 'N-309 ttfClosedCensorTimes / ttfHeadcountInputs — per headcount, rules A/B/C, no double count',
    fn: function () {
      const today = new Date(2026, 9, 1, 12);  // 1 Oct 2026, local noon
      const R = (id, stage) => ({ id, Stage: stage, Department: 'Eng', Location: 'UK' });
      const S = (id, oldV, newV, at) => ({ RoleIDLookupId: id, Field: 'Stage', OldValue: oldV, NewValue: newV, ChangedAt: at });
      const H = (id, roleId, open, extra) => Object.assign({ id, RoleID: roleId, OpenDate: open ? open + 'T12:00:00Z' : null, Status: 'Open' }, extra || {});
      const X = (day) => ({ Status: 'Cancelled', CancelledDate: day + 'T12:00:00Z' });
      const roles = [R(1, 'On-hold'), R(2, 'Cancelled'), R(3, 'Sourcing'), R(4, 'Hired')];
      const rows = [
        S(1, 'Sourcing', 'On-hold', '2026-08-01T10:00:00Z'),
        S(2, 'Interview 1', 'On-hold', '2026-08-01T10:00:00Z'), S(2, 'On-hold', 'Cancelled', '2026-09-01T10:00:00Z'),
      ];
      const headcount = [
        H(11, 1, '2026-07-01'), H(12, 1, '2026-07-11'), H(13, 1, '2026-07-01'), H(14, 1, null),
        H(21, 2, '2026-07-01', X('2026-09-01')),        // cascade-cancelled after the On-hold run → On-hold day
        H(22, 2, '2026-07-01', X('2026-07-22')),        // cancelled before the run → its own cancel day
        H(31, 3, '2026-09-01', X('2026-09-11')),        // rule B
        H(32, 3, '2025-05-01', X('2025-06-01')),        // outside lookback
        H(33, 3, '2026-09-01'),                         // open on a censored stage → rule C only
        H(34, 3, null, X('2026-09-11')),                // undated
        H(35, 3, '2026-09-01', X('2026-09-11')),        // filled wins over Cancelled
        H(41, 4, '2026-09-01'),                         // open on a legacy-Hired (Closed) pipeline
        H(91, 99, '2026-09-01'),                        // role not in `roles`
      ];
      const placements = [{ HeadcountID: 13 }, { HeadcountID: 35 }];
      const before = JSON.stringify([roles, rows, headcount]);
      const { openHeadcount, closedCensored } = ttfHeadcountInputs({ roles, headcount, placements, stageRows: rows, today });
      const t = Object.fromEntries(closedCensored.map(o => [o.headcountId, o.t]));
      _assertEqual(t, { 11: 31, 12: 21, 21: 31, 22: 21, 31: 10 }, 'A: paused pipeline → close day (min with cancel day); B: cancelled → CancelledDate; filled / undated / out-of-window / open-on-active excluded');
      _assertEqual(closedCensored.find(o => o.headcountId === '11').Stage, 'On-hold', 'Stage = pipeline stage');
      _assertEqual(openHeadcount.map(o => o.id), [11, 12, 14, 33, 41], 'openHeadcount = open headcount on known roles');
      _assertEqual(openHeadcount.find(o => o.id === 41).Stage, 'Closed', "legacy 'Hired' normalised");
      _assertEqual(openHeadcount.find(o => o.id === 33), { id: 33, roleId: 3, Stage: 'Sourcing', Department: 'Eng', Location: 'UK', OpenDate: '2026-09-01T12:00:00Z' }, 'role-shaped row, OpenDate from the headcount');
      _assertEqual(JSON.stringify([roles, rows, headcount]), before, 'inputs not mutated');

      // No headcount is both censored-at-age (rule C) and closed-censored (A/B).
      const ageIds = openHeadcount.filter(o => TTF_CENSORED_STAGES.includes(o.Stage) && o.OpenDate).map(o => String(o.id));
      _assertEqual(ageIds.filter(id => id in t), [], 'no double count');
      _assertEqual(CONFIG.TTF_SURVIVAL.closedStages.filter(s => TTF_CENSORED_STAGES.includes(s)), [], 'closedStages ∩ TTF_CENSORED_STAGES = ∅');

      const hist = [10, 20, 30].map(d => ({ functionArea: 'Eng', country: 'UK', openDate: '2026-01-01T12:00:00Z',
        placementDate: new Date(Date.UTC(2026, 0, 1 + d, 12)).toISOString() }));
      const r = computeTTFPrediction('Eng', 'UK', hist, openHeadcount, closedCensored);
      _assertEqual([r.events, r.censored - r.closed, r.closed], [3, 1, 5], 'KM pool: 3 fills, 1 open dated headcount on a censored stage, 5 stopped');

      _assertEqual(ttfClosedCensorTimes(roles, rows, [H(23, 2, '2026-07-01', { Status: 'Cancelled', CancelledDate: '2026-07-21T23:00:00Z' })], new Map(), today)[0].t, 20,
        'CancelledDate read as its stored day via spDateIn (23:00Z → that date)');
      _assertEqual(ttfHeadcountInputs({}), { openHeadcount: [], closedCensored: [] }, 'null-safe');
    },
  },
  {
    name: 'N-309 avgTimeToHireDays — day maths, skips undated / negative',
    fn: function () {
      const r = (o, p) => ({ openDate: o, placementDate: p });
      _assertEqual(avgTimeToHireDays([r('2026-09-01T12:00:00Z', '2026-09-15T12:00:00Z'), r('2026-09-01T12:00:00Z', '2026-09-02T12:00:00Z')]), 7.5, 'mean, unrounded');
      _assertEqual(avgTimeToHireDays([r('2026-08-31T23:00:00Z', '2026-09-15T12:00:00Z')]), 15, 'BST-stored open reads as 31 Aug');
      _assertEqual(avgTimeToHireDays([r(null, '2026-09-15T12:00:00Z'), r('2026-09-20T12:00:00Z', '2026-09-15T12:00:00Z'), r('2025-12-25T12:00:00Z', '2026-01-05T12:00:00Z')]), 11,
        'undated and negative skipped; year rollover');
      _assertEqual([avgTimeToHireDays([]), avgTimeToHireDays(null)], [null, null], 'empty → null');
    },
  },
  {
    name: 'N-309 oldestOpenHeadcountIndex + roleFlagReasons / tallyRoleFlags opts.openSince',
    fn: function () {
      const H = (id, roleId, open, status) => ({ id, RoleID: roleId, OpenDate: open ? open + 'T12:00:00Z' : null, Status: status || 'Open' });
      const headcount = [
        H(71, 7, '2026-09-02'), H(72, 7, '2026-09-25'), H(73, 7, null), H(74, 7, '2026-09-01', 'Cancelled'),
        H(81, 8, '2026-08-01'),
      ];
      const idx = oldestOpenHeadcountIndex(headcount, [{ HeadcountID: 71 }, { HeadcountID: 81 }]);
      _assertEqual(Array.from(idx.entries()), [['7', '2026-09-25'], ['8', null]], 'oldest OPEN dated headcount; filled / cancelled / undated ignored');

      const TODAY = new Date(2026, 9, 2, 12);
      const h = groupStageHistoryByRole([
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: null,       NewValue: 'Sourcing', ChangedAt: '2026-09-02T09:00:00Z' },
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: 'Sourcing', NewValue: 'On-hold',  ChangedAt: '2026-09-10T09:00:00Z' },
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: 'On-hold',  NewValue: 'Sourcing', ChangedAt: '2026-09-29T09:00:00Z' },
      ]);
      const role = { id: 7, Stage: 'Sourcing', OpenDate: '2026-09-02T12:00:00Z' };
      const legacy = roleFlagReasons(role, [], h, TODAY);
      const hc     = roleFlagReasons(role, [], h, TODAY, { openSince: idx });
      _assertEqual([legacy.behindPace, legacy.daysOpen], [true, 30], 'no opts → legacy role.OpenDate (N-274 AC7 unchanged)');
      _assertEqual([hc.behindPace, hc.daysOpen, hc.flagged, hc.daysInStage], [false, 7, false, 3], 'openSince → days since the oldest open headcount');
      const none = roleFlagReasons(role, [], h, TODAY, { openSince: new Map() });
      _assertEqual([none.behindPace, none.daysOpen], [false, null], 'no open dated headcount → null / not behind');
      _assertEqual(isRoleFlagged(role, [], h, TODAY, { openSince: idx }), false, 'isRoleFlagged passes opts through');

      const roles = [
        { id: 2, Stage: 'Submitted', OpenDate: '2026-08-01T12:00:00Z' },
        { id: 3, Stage: 'Interview 1' },
      ];
      const sh = groupStageHistoryByRole([{ RoleIDLookupId: 2, Field: 'Stage', OldValue: 'Sourcing', NewValue: 'Submitted', ChangedAt: '2026-09-24T09:00:00Z' }]);
      const acts = [{ RoleIDLookupId: 3, WeekEndingDate: '2026-09-27T12:00:00Z', Submitted: 5, Interview1: 1 }];
      _assertEqual(tallyRoleFlags(roles, acts, sh, TODAY), { total: 2, flagged: 2, stuck: 1, conversion: 1, behind: 1 }, 'tally without opts');
      _assertEqual(tallyRoleFlags(roles, acts, sh, TODAY, { openSince: new Map([['2', '2026-09-29']]) }), { total: 2, flagged: 2, stuck: 1, conversion: 1, behind: 0 },
        'tally passes opts: behind changes, flagged does not');
    },
  },
  {
    name: 'N-309 computeSnapshotMetrics — avgDaysOpen from open dated headcount on open pipelines (S-8)',
    fn: function () {
      const now = new Date();
      const ago = n => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n, 12)).toISOString();
      const roles = [
        { id: 1, Stage: 'Sourcing', OpenDate: ago(100) },
        { id: 2, Stage: CONFIG.ROLE_STAGE_CLOSED, OpenDate: ago(300) },
        { id: 3, Stage: 'Cancelled', OpenDate: ago(50) },
        { id: 4, Stage: 'Interview 1', OpenDate: ago(30) },
      ];
      const H = (id, roleId, open, status) => ({ id, RoleID: roleId, OpenDate: open, Status: status || 'Open' });
      const headcount = [
        H(11, 1, ago(10)), H(12, 1, ago(20)), H(13, 1, ago(100)), H(14, 1, ago(200), 'Cancelled'), H(15, 1, null),
        H(21, 2, ago(300)),                 // stray open headcount on a Closed pipeline
        H(31, 3, ago(50)),
        H(41, 4, ago(30)),
      ];
      const fillMap = headcountFillMap([{ HeadcountID: 13 }]);
      const withHc = computeSnapshotMetrics(roles, [], [], [], {}, { headcount, fillMap });
      _assertEqual(withHc.avgDaysOpen, 20, 'mean of 10, 20, 30 — filled, cancelled, undated and Closed-pipeline rows excluded');
      _assertEqual(computeSnapshotMetrics(roles, [], [], [], {}).avgDaysOpen, 65, 'no headcountState → legacy role average');
      _assertEqual(Object.keys(withHc.rolesByStage).sort(), ['Interview 1', 'Sourcing'], 'RolesByStage has no Closed / Cancelled key');
      _assertEqual(withHc.openRoles, 2, 'openRoles unchanged (pipelines)');
      _assertEqual(computeSnapshotMetrics(roles, [], [], [], {}, { headcount: [], fillMap: new Map() }).avgDaysOpen, null, 'no open headcount → null');
    },
  },
  {
    name: 'N-310 hireRowsWithTargets — N-309 rows + targetDate (headcount, role fallback)',
    fn: function () {
      const roles = [{ id: 1, RoleTitle: 'Eng', Department: 'Eng', Location: 'UK', OpenDate: '2026-01-01T12:00:00Z', TargetHireDate: '2026-02-15T12:00:00Z' },
                     { id: 2, RoleTitle: 'PM', OpenDate: '2026-01-01T12:00:00Z' }];
      const headcount = [{ id: 11, RoleID: 1, OpenDate: '2026-02-01T12:00:00Z', TargetHireDate: '2026-03-18T12:00:00Z' },
                         { id: 12, RoleID: 1, OpenDate: null }];
      const P = (id, roleId, hcId) => ({ id, RoleIDLookupId: roleId, HeadcountID: hcId, OfferAcceptedDate: '2026-03-01T12:00:00Z', TalentPartner: 'a@x.com' });
      const placements = [P(101, 1, 11), P(102, 1, 12), P(103, 1, null), P(104, 1, 999), P(105, 2, null)];
      const before = JSON.stringify([roles, headcount, placements]);
      const out  = hireRowsWithTargets(placements, roles, headcount);
      const base = historicalHiresFromPlacements(placements, roles, headcount);
      _assertEqual(out.map(r => r.targetDate), ['2026-03-18T12:00:00Z', null, '2026-02-15T12:00:00Z', '2026-02-15T12:00:00Z', null],
        'headcount target; headcount without target → null; blank/unknown HeadcountID → role target; neither → null');
      _assertEqual(out.map(r => { const { targetDate, ...rest } = r; return rest; }), base, 'every other key identical to historicalHiresFromPlacements');
      _assertEqual(JSON.stringify([roles, headcount, placements]), before, 'inputs not mutated');
    },
  },
  {
    name: 'N-310 dashboardHeadcountContext + pipelineOpenDay + nextOpenTargetDay',
    fn: function () {
      const roles = [{ id: 1, OpenDate: '2026-09-01T12:00:00Z' }, { id: 2, OpenDate: '2026-01-01T12:00:00Z' }];
      const headcount = [
        { id: 11, RoleID: 1, OpenDate: '2026-09-01T12:00:00Z', TargetHireDate: '2026-10-16T12:00:00Z' },
        { id: 12, RoleID: 1, OpenDate: '2026-09-15T12:00:00Z', TargetHireDate: '2026-10-30T12:00:00Z' },
        { id: 13, RoleID: 1, OpenDate: '2026-09-20T12:00:00Z', TargetHireDate: '2026-11-04T12:00:00Z' },
        { id: 14, RoleID: 1, OpenDate: '2026-08-01T12:00:00Z', TargetHireDate: '2026-09-01T12:00:00Z', Status: CONFIG.HEADCOUNT.STATUS_CANCELLED },
        { id: 91, RoleID: 9, OpenDate: '2026-01-01T12:00:00Z' },   // another project's role
      ];
      const placements = [{ id: 1, RoleIDLookupId: 1, HeadcountID: 11, OfferAcceptedDate: '2026-10-01T12:00:00Z' }];
      const ctx = dashboardHeadcountContext(roles, placements, headcount);
      _assertEqual(ctx.headcount.map(h => h.id), [11, 12, 13, 14], 'headcount limited to the given roles');
      _assertEqual(Array.from(ctx.openSince.entries()), Array.from(oldestOpenHeadcountIndex(ctx.headcount, placements).entries()), 'openSince = oldestOpenHeadcountIndex');
      _assertEqual(ctx.openSince.get('1'), '2026-09-15', 'filled + cancelled headcount ignored');
      _assertEqual(ctx.hires.length, 1, 'hires built');
      const nul = dashboardHeadcountContext(roles, placements, null);
      _assertEqual([nul.headcount, nul.openSince], [null, null], 'null headcount → null headcount / openSince');
      _assertEqual(nul.hires.map(r => r.openDate), ['2026-09-01T12:00:00Z'], 'null headcount → hires still built from the role-date fallback');
      _assertEqual(pipelineOpenDay(roles[0], ctx.openSince), '2026-09-15', 'Map hit');
      _assertEqual(pipelineOpenDay(roles[1], ctx.openSince), null, 'Map miss → null (no Roles.OpenDate fallback)');
      _assertEqual(pipelineOpenDay(roles[0], null), '2026-09-01', 'null Map → spDateIn(Roles.OpenDate)');
      _assertEqual(nextOpenTargetDay(ctx.headcount, ctx.fillMap), '2026-10-30', 'earliest target among OPEN headcount (filled 16 Oct, cancelled 1 Sep ignored)');
      _assertEqual(nextOpenTargetDay([headcount[0]], ctx.fillMap), null, 'none open → null');
    },
  },
  {
    name: 'N-310 hiredOnTimePct + hireKpis — local-day ranges, D-5 exclusions',
    fn: function () {
      const R = (open, offer, target) => ({ openDate: open, placementDate: offer, targetDate: target });
      const rows = [
        R('2026-09-01T12:00:00Z', '2026-10-01T12:00:00Z', '2026-10-01T12:00:00Z'),   // 30 days, on target day → on time
        R('2026-09-15T12:00:00Z', '2026-10-07T12:00:00Z', '2026-10-06T12:00:00Z'),   // 22 days, one day late
        R(null,                   '2026-10-05T12:00:00Z', null),                     // not opened, no target
        R('2026-08-01T12:00:00Z', '2026-10-01T00:00:00Z', '2026-12-01T12:00:00Z'),   // midnight-UTC shape: still 1 Oct (spDateIn, no local getter)
        R('2026-06-01T12:00:00Z', '2026-09-29T12:00:00Z', '2026-12-01T12:00:00Z'),   // previous quarter
      ];
      _assertEqual(hiredOnTimePct(rows.slice(0, 3)), 50, 'inclusive day compare; no-target row excluded');
      _assertEqual(hiredOnTimePct([R(null, '2026-10-01', null)]), null, 'nothing with a target → null');
      _assertEqual(hiredOnTimePct([]), null, 'empty → null');
      const q4 = hireKpis(rows, '2026-10-01', '2026-12-31');
      _assertEqual(q4.count, 4, 'count includes the not-opened hire and the T00:00Z 1 Oct offer; excludes 29 Sep');
      _assertEqual(q4.avgDays, Math.round((30 + 22 + 61) / 3), 'avgDays rounded, not-opened excluded');
      _assertEqual(q4.onTimePct, 67, '2 of 3 targeted hires on time');
      _assertEqual(hireKpis(rows, '2026-10-07', '2026-10-07').count, 1, 'range inclusive at both ends');
      _assertEqual(hireKpis([R(null, '2026-10-05T12:00:00Z', null)], '2026-10-01', '2026-12-31'), { count: 1, avgDays: null, onTimePct: null }, 'no dated rows → avgDays null');
    },
  },
  {
    name: 'N-310 avgOpenHeadcountDays — the Snapshots S-8 rule, shared with the KPI tile',
    fn: function () {
      const now = new Date();
      const ago = n => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n, 12)).toISOString();
      const open = [{ id: 1, OpenDate: ago(100) }, { id: 4, OpenDate: ago(30) }];
      const H = (id, roleId, o, status) => ({ id, RoleID: roleId, OpenDate: o, Status: status || 'Open' });
      const headcount = [H(11, 1, ago(10)), H(12, 1, ago(20)), H(13, 1, ago(100)), H(14, 1, ago(200), 'Cancelled'), H(15, 1, null), H(21, 2, ago(300)), H(41, 4, ago(30))];
      const fillMap = headcountFillMap([{ HeadcountID: 13 }]);
      _assertEqual(avgOpenHeadcountDays(open, headcount, fillMap), 20, '10, 20, 30 — filled / cancelled / undated / other-pipeline excluded');
      _assertEqual(avgOpenHeadcountDays(open, null, null), 65, 'null headcount → legacy Roles.OpenDate mean');
      _assertEqual(avgOpenHeadcountDays(open, [], new Map()), null, '[] → null (not the legacy path)');
    },
  },
  {
    name: 'N-311 openHeadcountCount — open DATED headcount on open pipelines (S-2); same rows as avgOpenHeadcountDays',
    fn: function () {
      const now = new Date();
      const ago = n => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n, 12)).toISOString();
      const roles = [
        { id: 1, Stage: 'Interview' }, { id: 2, Stage: 'On-hold' }, { id: 3, Stage: 'Backlog' },
        { id: 4, Stage: 'Closed' }, { id: 5, Stage: 'Offered' },
      ];
      const openRoles = roles.filter(r => isOpenPipelineStage(r.Stage));
      const H = (id, roleId, o, status) => ({ id, RoleID: roleId, OpenDate: o, Status: status || 'Open' });
      const headcount = [
        H(11, 1, ago(10)),                 // open, dated → counts
        H(12, 1, ago(50)),                 // filled
        H(13, 1, ago(5), 'Cancelled'),     // cancelled
        H(14, 1, null),                    // open but undated → planned, not active
        H(21, 2, ago(5)),                  // On-hold pipeline
        H(31, 3, ago(5)),                  // Backlog pipeline
        H(41, 4, ago(90)),                 // Closed pipeline, filled
        H(51, 5, ago(3)), H(52, 5, ago(8)),// Offered pipeline, two open dated
      ];
      const fillMap = headcountFillMap([{ HeadcountID: 12 }, { HeadcountID: 41 }]);
      _assertEqual(openHeadcountCount(openRoles, headcount, fillMap), 3, 'ids 11, 51, 52 only — undated / filled / cancelled / parked / closed excluded');
      _assertEqual(openDatedHeadcount(openRoles, headcount, fillMap).map(h => h.id).sort(), [11, 51, 52], 'selector rows');
      _assertEqual(headcountCounts(headcount.filter(h => h.RoleID === 1), fillMap).open, 2, 'x of x/y still counts the undated head (D-5)');
      _assertEqual(openHeadcountCount(openRoles, [], new Map()), 0, '[] → 0');
      _assertEqual(openHeadcountCount(openRoles, null, null), null, 'null (read failed) → null');
      _assertEqual(openHeadcountCount([], headcount, fillMap), 0, 'no open pipelines → 0');
      _assertEqual(avgOpenHeadcountDays(openRoles, headcount, fillMap), 7, 'same three rows: (10 + 3 + 8) / 3');
    },
  },
  {
    name: 'N-310 budgetVsSpendByCurrency — paired per placement (S-8)',
    fn: function () {
      const roles = [
        { id: 1, Location: 'UK', Budget: 50000 },
        { id: 2, Location: 'Ireland', Budget: '40000' },
        { id: 3, Location: 'UK' },                 // unbudgeted
      ];
      const P = (roleId, salary) => ({ RoleIDLookupId: roleId, SalaryAgreed: salary });
      const placements = [P(1, 50000), P(1, '52000'), P(1, 48000), P(1, null), P(2, 41000), P(3, 60000), P(99, 10000)];
      const out = budgetVsSpendByCurrency(roles, placements);
      const ukCcy = CONFIG.COUNTRY_CURRENCY['UK'] || 'GBP';
      const ptCcy = CONFIG.COUNTRY_CURRENCY['Ireland'] || 'GBP';
      const uk = out.rows.find(r => r.ccy === ukCcy);
      _assertEqual([uk.budget, uk.spend, uk.hires], ukCcy === ptCcy ? [190000, 191000, 4] : [150000, 150000, 3], 'per-head budget × hires with a salary');
      if (ukCcy !== ptCcy) _assertEqual(out.rows.map(r => r.ccy), [ukCcy, ptCcy], 'split by role Location currency, first-appearance order');
      _assertEqual(out.excluded, 3, 'no salary, unbudgeted role and unknown role are excluded from both sides');
      _assertEqual(budgetVsSpendByCurrency([], []), { rows: [], excluded: 0 }, 'empty');
    },
  },
  {
    name: 'N-312 coeLinkableHeadcount — S-1 population, D-5 order, filled + current labels',
    fn: function () {
      const roles = [
        { id: '1', RoleTitle: 'Eng', Location: 'Lisbon', Stage: 'Sourcing' },
        { id: '2', RoleTitle: 'PM', Stage: 'Backlog' },
        { id: '3', RoleTitle: 'QA', Stage: 'Closed' },
        { id: '4', RoleTitle: 'Ops', Stage: 'Hired' },        // legacy → Closed
        { id: '5', RoleTitle: 'Fin', Stage: 'On-hold' },
        { id: '6', RoleTitle: 'HR', Stage: 'Cancelled' },
      ];
      const H = (id, roleId, seq, open, status) =>
        ({ id: String(id), RoleID: roleId, Sequence: seq, OpenDate: open, Status: status || 'Open', Title: 'Headcount ' + seq });
      const headcount = [
        H(11, 1, 1, '2026-05-01T12:00:00Z'),               // filled
        H(12, 1, 2, null),                                 // open, undated
        H(13, 1, 3, '2026-06-01T12:00:00Z'),               // open, dated
        H(14, 1, 4, '2026-04-01T12:00:00Z', 'Cancelled'),  // cancelled
        H(15, 1, 5, '2026-03-01T12:00:00Z'),               // open, linked to row r1
        H(21, 2, 1, null),                                 // Backlog pipeline → linkable
        H(31, 3, 1, '2026-01-01T12:00:00Z'),               // Closed pipeline, filled, row r2
        H(41, 4, 1, '2026-01-01T12:00:00Z'),               // legacy Hired
        H(51, 5, 1, '2026-01-01T12:00:00Z'),               // On-hold
        H(61, 6, 1, '2026-01-01T12:00:00Z'),               // Cancelled pipeline
      ];
      const placements = [{ id: 'p1', HeadcountID: 11 }, { id: 'p3', HeadcountID: 31 }];
      const planRows = [{ id: 'r1', LinkedHeadcountID: 15 }, { id: 'r2', LinkedHeadcountID: 31 }, { id: 'r3' }];
      const ex = PLAN_LINKABLE_EXCLUDED_STAGES;
      const g = coeLinkableHeadcount({ roles, headcount, placements, planRows, excludedStages: ex });
      _assertEqual(g.map(x => x.roleLabel), ['Eng (Lisbon)', 'PM'], 'open headcount on Closed / legacy Hired / On-hold / Cancelled pipelines out (their only filled one is linked to r2); Backlog in; alphabetical');
      _assertEqual(g[0].options.map(o => o.id), [13, 12, 11], 'open dated, open undated, then filled; cancelled + linked elsewhere excluded');
      _assertEqual(g[0].options.map(o => o.label),
        ['Headcount 3 · opened 2026-06-01', 'Headcount 2 · not opened', 'Headcount 1 · opened 2026-05-01 · filled'], 'labels');
      _assertEqual(g[0].options.map(o => o.roleId), [1, 1, 1], 'roleId carried');
      const g2 = coeLinkableHeadcount({ roles, headcount, placements, planRows, currentHeadcountId: 31, excludedStages: ex });
      const qa = g2.find(x => x.roleId === 3);
      _assertEqual(qa && qa.options.map(o => [o.id, o.current, o.label]),
        [[31, true, 'Headcount 1 · opened 2026-01-01 · filled · current']], "the row's own link is kept on a Closed pipeline");
      const g3 = coeLinkableHeadcount({ roles, headcount, placements, planRows, currentHeadcountId: '15', excludedStages: ex });
      _assertEqual(g3[0].options.map(o => o.id), [15, 13, 12, 11], 'current first, then the usual order');
      _assertEqual(coeLinkableHeadcount({}), [], 'empty input');
    },
  },
  {
    name: 'N-312 diff-2 coeLinkableHeadcount — filled headcount linkable on any pipeline stage',
    fn: function () {
      // Live case (8 Oct 2026): a plan row for a hire on a Closed pipeline could
      // not be linked, and freeing a filled headcount meant re-linking another
      // row onto a Closed pipeline first.
      const roles = [
        { id: '37', RoleTitle: 'COM', Location: 'NL', Stage: 'Closed' },
        { id: '56', RoleTitle: 'CSM', Location: 'NL', Stage: 'Hired' },     // legacy → Closed
        { id: '46', RoleTitle: 'TL', Stage: 'Cancelled' },
        { id: '38', RoleTitle: 'BDR', Stage: 'On-hold' },
      ];
      const headcount = [
        { id: '26', RoleID: 37, Sequence: 1, Status: 'Open', OpenDate: '2026-06-18T12:00:00Z', Title: 'Headcount 1' },  // filled
        { id: '27', RoleID: 37, Sequence: 2, Status: 'Open', OpenDate: null, Title: 'Headcount 2' },                  // open on Closed
        { id: '41', RoleID: 56, Sequence: 1, Status: 'Open', OpenDate: '2026-08-12T12:00:00Z', Title: 'Headcount 1' },  // filled
        { id: '34', RoleID: 46, Sequence: 1, Status: 'Cancelled', OpenDate: '2026-07-13T12:00:00Z', Title: 'Headcount 1' },
        { id: '35', RoleID: 46, Sequence: 2, Status: 'Open', OpenDate: '2026-07-13T12:00:00Z', Title: 'Headcount 2' },  // filled on Cancelled
        { id: '39', RoleID: 38, Sequence: 1, Status: 'Open', OpenDate: '2026-06-18T12:00:00Z', Title: 'Headcount 1' },  // open on On-hold
      ];
      const placements = [{ HeadcountID: 26 }, { HeadcountID: '41' }, { HeadcountID: 35 }];
      const g = coeLinkableHeadcount({ roles, headcount, placements, planRows: [], excludedStages: PLAN_LINKABLE_EXCLUDED_STAGES });
      _assertEqual(g.map(x => [x.roleId, x.options.map(o => [o.id, o.filled])]),
        [[37, [[26, true]]], [56, [[41, true]]], [46, [[35, true]]]],
        'filled offered on Closed / legacy Hired / Cancelled; open on Closed + On-hold and cancelled headcount still out');
      const g2 = coeLinkableHeadcount({ roles, headcount, placements, planRows: [{ id: 'x', LinkedHeadcountID: 41 }], excludedStages: PLAN_LINKABLE_EXCLUDED_STAGES });
      _assertEqual(g2.map(x => x.roleId), [37, 46], 'a filled headcount linked to another row stays hidden');
    },
  },
  {
    name: 'N-312 coeHeadcountActualSpans — R / N / O per headcount',
    fn: function () {
      const T = 'TODAY';
      const hc = extra => Object.assign({ id: '1', OpenDate: '2026-02-02T12:00:00Z', Status: 'Open' }, extra || {});
      const none = { rStart: null, rEnd: null, nStart: null, nEnd: null, oStart: null };
      _assertEqual(coeHeadcountActualSpans(hc({ OpenDate: null }), [], T), none, 'no OpenDate → no bar');
      _assertEqual(coeHeadcountActualSpans(null, [], T), none, 'no headcount → no bar');
      _assertEqual(coeHeadcountActualSpans(hc(), undefined, T),
        { rStart: '2026-02-02T12:00:00Z', rEnd: T, nStart: null, nEnd: null, oStart: null }, 'open → R to today');
      _assertEqual(coeHeadcountActualSpans(hc(), [{ OfferAcceptedDate: '2026-03-16T12:00:00Z', ProvisionalStartDate: '2026-04-13T12:00:00Z' }], T),
        { rStart: '2026-02-02T12:00:00Z', rEnd: '2026-03-16T12:00:00Z', nStart: '2026-03-16T12:00:00Z', nEnd: '2026-04-13T12:00:00Z', oStart: '2026-04-13T12:00:00Z' },
        'filled → R, N, O');
      _assertEqual(coeHeadcountActualSpans(hc(), [{ OfferAcceptedDate: '2026-03-16T12:00:00Z' }], T),
        { rStart: '2026-02-02T12:00:00Z', rEnd: '2026-03-16T12:00:00Z', nStart: '2026-03-16T12:00:00Z', nEnd: T, oStart: null },
        'filled, no start date → N to today, no O');
      _assertEqual(coeHeadcountActualSpans(hc({ Status: 'Cancelled', CancelledDate: '2026-03-02T12:00:00Z' }), [], T),
        { rStart: '2026-02-02T12:00:00Z', rEnd: '2026-03-02T12:00:00Z', nStart: null, nEnd: null, oStart: null },
        'cancelled → R ends at CancelledDate, no N / O');
      const two = coeHeadcountActualSpans(hc(), [
        { OfferAcceptedDate: '2026-04-01T12:00:00Z', ProvisionalStartDate: '2026-05-01T12:00:00Z' },
        { OfferAcceptedDate: '2026-03-01T12:00:00Z', ProvisionalStartDate: '2026-03-30T12:00:00Z' },
      ], T);
      _assertEqual([two.rEnd, two.oStart], ['2026-03-01T12:00:00Z', '2026-03-30T12:00:00Z'], 'two placements → the earliest offer and its start');
    },
  },
  // ── N-317 (HP-1): Hiring Plan v2 — track against plan ──
  {
    name: 'N-317 coeActualMarkerWeeks — ✓ hire-confirmed / ▶ start week on the plan timeline (replaces coeActualPhaseAt)',
    fn: function () {
      const t0 = coeMonday('2026-01-05T12:00:00Z');
      const none = { hire: null, start: null };
      _assertEqual(coeActualMarkerWeeks({ rStart: '2026-01-05T12:00:00Z', rEnd: '2026-01-28T12:00:00Z', nStart: '2026-01-28T12:00:00Z', nEnd: '2026-02-09T12:00:00Z', oStart: '2026-02-09T12:00:00Z' }, t0),
        { hire: 3, start: 5 }, 'offer Wed of week 3, start Mon of week 5');
      _assertEqual(coeActualMarkerWeeks({ rStart: '2026-01-05T12:00:00Z', rEnd: 'TODAY', nStart: '2026-01-28T12:00:00Z', nEnd: 'TODAY', oStart: null }, t0),
        { hire: 3, start: null }, 'offer, no start date → ✓ only (never a marker at "today")');
      _assertEqual(coeActualMarkerWeeks({ rStart: '2026-01-05T12:00:00Z', rEnd: 'TODAY', nStart: null, nEnd: null, oStart: null }, t0), none, 'still recruiting → no markers');
      _assertEqual(coeActualMarkerWeeks(null, t0), none, 'unlinked → no markers');
      _assertEqual(coeActualMarkerWeeks({ nStart: '2026-04-15T12:00:00Z', oStart: null }, t0).hire, 14,
        'GMT timeline start, BST offer → Monday 13 Apr is week 14 (Math.round, N-081)');
    },
  },
  {
    name: 'N-317 coeWeekVariance — Monday-week gap, actual − planned; running only once overdue',
    fn: function () {
      const row = { OpenDate: '2026-03-16T12:00:00Z' };          // Monday of ISO week 12
      const hc = d => ({ OpenDate: d });
      const later = new Date(2026, 5, 1);
      _assertEqual(coeWeekVariance(row, hc('2026-03-12T12:00:00Z'), later), { weeks: -1, final: true }, 'opened Thu of week 11 → -1 (early)');
      _assertEqual(coeWeekVariance(row, hc('2026-03-20T12:00:00Z'), later), { weeks: 0, final: true }, 'opened Fri of the planned week → 0');
      _assertEqual(coeWeekVariance(row, hc('2026-03-31T12:00:00Z'), later), { weeks: 2, final: true }, 'opened Tue of week 14 → +2 (late)');
      _assertEqual(coeWeekVariance(row, null, new Date(2026, 3, 8)), { weeks: 3, final: false }, 'not open, today Wed of week 15 → running +3');
      _assertEqual(coeWeekVariance(row, { OpenDate: null }, new Date(2026, 2, 18)), null, 'not open, still the planned week → null');
      _assertEqual(coeWeekVariance(row, null, new Date(2026, 2, 10)), null, 'not open, before the planned week → null');
      _assertEqual(coeWeekVariance({ OpenDate: '2026-03-23T12:00:00Z' }, hc('2026-04-06T12:00:00Z'), later).weeks, 2, 'GMT planned → BST actual: +2, no dropped week');
      _assertEqual(coeWeekVariance({ OpenDate: '2026-10-19T12:00:00Z' }, hc('2026-11-02T12:00:00Z'), later).weeks, 2, 'BST planned → GMT actual: +2, no extra week');
      _assertEqual(coeWeekVarianceHtml({ weeks: -1, final: true }), '<span class="coe-var--early">-1</span>', 'early renders green');
      _assertEqual(/\+3 \(not open\)/.test(coeWeekVarianceHtml({ weeks: 3, final: false })), true, 'running renders "+3 (not open)"');
      _assertEqual(coeWeekVarianceHtml(null), '—', 'null renders a dash');
    },
  },
  {
    name: 'N-317 coeOpensByMonth — planned / actual / variance per month and the required run rate',
    fn: function () {
      const r = coeOpensByMonth({
        plannedDays: ['2026-08-03', '2026-08-24', '2026-09-07', '2026-11-02', '2026-12-01', '2027-01-04'],
        actualDays:  ['2026-07-30', '2026-09-10', '2026-10-05', '2026-10-20'],   // 20 Oct is after today → not yet opened
        target: 6, latestHireDay: '2027-03-03', todayDay: '2026-10-08', finalNoOpenWeeks: 4,
      });
      _assertEqual(r.months.map(m => m.key), ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'], 'contiguous range, through the cutoff month');
      _assertEqual(r.months.map(m => m.planned), [0, 2, 1, 0, 1, 1, 1, 0], 'planned per month');
      _assertEqual(r.months.map(m => m.actual), [1, 0, 1, 1, null, null, null, null], 'actual per month; future null; future-dated open excluded');
      _assertEqual(r.months.map(m => m.variance), [1, -2, 0, 1, null, null, null, null], 'variance = actual − planned');
      _assertEqual(r.months.map(m => m.isCurrent), [false, false, false, true, false, false, false, false], 'current month flagged');
      _assertEqual(r.months.map(m => m.inWindow), [false, false, false, true, true, true, true, true], 'window = current → cutoff month');
      _assertEqual([r.cutoffDay, r.cutoffMonth, r.openedToDate, r.remaining, r.monthsLeft, r.status],
        ['2027-02-03', '2027-02', 3, 3, 5, 'in-window'], 'cutoff = latest hire − 4 weeks; 3 of 6 to open over Oct–Feb');
      _assertEqual(r.requiredPerMonth, 0.6, 'required run rate 3 / 5');

      const edge = (today, weeks) => coeOpensByMonth({ plannedDays: ['2026-01-05', '2026-02-02'], actualDays: [],
        target: 2, latestHireDay: '2026-03-03', todayDay: today, finalNoOpenWeeks: weeks });
      _assertEqual([edge('2026-01-15', 4).cutoffMonth, edge('2026-01-15', 4).monthsLeft], ['2026-02', 2], '3 Mar − 4 wks = 3 Feb: window Jan–Feb');
      _assertEqual([edge('2026-01-15', 0).cutoffMonth, edge('2026-01-15', 0).monthsLeft], ['2026-03', 3], 'finalNoOpenWeeks read from the argument');
      const past = edge('2026-04-01', 4);
      _assertEqual([past.status, past.requiredPerMonth, past.monthsLeft, past.months[past.months.length - 1].key], ['past-cutoff', null, 0, '2026-04'],
        'after the cutoff with roles left: past-cutoff, no rate, range runs to the current month');
      _assertEqual(past.months.some(m => m.inWindow), false, 'past-cutoff: no in-window months');
      const done = coeOpensByMonth({ plannedDays: ['2026-01-05'], actualDays: ['2026-01-09'], target: 1,
        latestHireDay: '2026-03-03', todayDay: '2026-02-10', finalNoOpenWeeks: 4 });
      _assertEqual([done.status, done.remaining, done.requiredPerMonth], ['complete', 0, null], 'all opened → complete');
    },
  },
  {
    name: 'N-317 coeGanttHtml — four frozen columns; no running variance without a headcount read (hasActuals)',
    fn: function () {
      const rows = [{ id: '1', Title: 'Past row', OpenDate: '2025-01-06T12:00:00Z' }];
      const planOnly = coeGanttHtml(rows, { canEdit: false, showActuals: false });
      const heads = [...planOnly.matchAll(/coe-th-split-top"[^>]*>([^<]*)</g)].map(m => m[1]);
      _assertEqual(heads, ['Role', 'Planned Open', 'Actual Open', 'Week Variance'], 'frozen header labels');
      _assertEqual(/Talent Partner|Target Hire|>TP</.test(planOnly), false, 'no TP / Target Hire column');
      _assertEqual(/\(not open\)/.test(planOnly), false, 'Report Builder (plan only) never shows "(not open)"');
      _assertEqual(/\(not open\)/.test(coeGanttHtml(rows, { headcount: null, showActuals: true })), false, 'failed headcount read never shows "(not open)"');
      _assertEqual(/\(not open\)/.test(coeGanttHtml(rows, { headcount: [], placements: [], showActuals: true })), true, 'headcount read, overdue unlinked row → running variance');
    },
  },
  {
    name: 'N-318 coeOpensBlockHtml — chart + table for the Report Builder final page; summary optional; unread headcount is not zero',
    fn: function () {
      const rows = [
        { id: '1', Title: 'A', OpenDate: '2026-08-03T12:00:00Z', LinkedHeadcountID: '10' },
        { id: '2', Title: 'B', OpenDate: '2026-11-02T12:00:00Z' },
      ];
      const hc = [{ id: '10', OpenDate: '2026-07-30T12:00:00Z' }];
      const bare = coeOpensBlockHtml(rows, hc, { summary: false });
      _assertEqual(/coe-opens-svg/.test(bare) && /coe-opens-table/.test(bare), true, 'chart + table present');
      _assertEqual(/coe-opens-summary/.test(bare), false, 'summary:false leaves the summary line off');
      const full = coeOpensBlockHtml(rows, hc);
      _assertEqual(/coe-opens-summary/.test(full), true, 'default keeps the summary line (Hiring Plan page)');
      _assertEqual(full.endsWith(bare), true, 'page output = summary + the same chart + table');
      _assertEqual(coeOpensBlockHtml(rows, null), null, 'unread headcount (null) → null, not an empty chart');
      _assertEqual(coeOpensBlockHtml(rows, undefined), null, 'undefined headcount → null');
      _assertEqual(coeOpensBlockHtml([], hc), '', 'no plan rows → empty string');
      _assertEqual(/coe-opens-table/.test(coeOpensBlockHtml(rows, [], { summary: false })), true, 'a successful read with no headcount ([]) still renders');
      _assertEqual(coeOpensModel(rows, [], new Date(2026, 9, 8)).openedToDate, 0, '[] headcount → 0 opened (a real read, not the failure path)');
      _assertEqual(coeOpensModel(rows, hc, new Date(2026, 9, 8)).openedToDate, 1, 'linked headcount with an OpenDate counts as opened');
    },
  },
  {
    name: 'N-318 coeOpensHorizontalTableHtml — months across, strips for long plans, Total on the last strip, same figures as the vertical table',
    fn: function () {
      // n consecutive months from Jan 2026: planned 1 each; actual 1,0,1 for the first three (current = 3rd); the rest are future.
      const mk = n => {
        const months = [];
        for (let i = 0; i < n; i++) {
          const future = i > 2;
          months.push({ key: `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, planned: 1,
            actual: future ? null : (i === 1 ? 0 : 1), variance: future ? null : (i === 1 ? -1 : 0),
            isCurrent: i === 2, isFuture: future, inWindow: i >= 2 });
        }
        return { months, requiredPerMonth: 0.5 };
      };
      const tablesOf = html => html.split('</table>').filter(x => x.includes('<table'));
      const rowsOf = tbl => [...tbl.matchAll(/<tr>(.*?)<\/tr>/gs)].map(r => [...r[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map(c => c[1].replace(/<[^>]+>/g, '')));
      const m6 = mk(6);
      const first = rowsOf(tablesOf(coeOpensHorizontalTableHtml(m6))[0]);
      _assertEqual(first.map(r => r[0]), ['Month', 'Planned Opens', 'Actual Opens', 'Variance', 'Required'], 'row labels, in order');
      _assertEqual(first.map(r => r.length), [8, 8, 8, 8, 8], 'every row: label + 6 months + Total');
      _assertEqual(first[1].slice(-1)[0] === '6' && first[2].slice(-1)[0] === '2' && first[3].slice(-1)[0] === '-1' && first[4].slice(-1)[0] === '', true, 'Total column: planned 6, actual to date 2, variance −1, Required blank');
      _assertEqual(first[2].slice(1, 7), ['1', '0', '1', '—', '—', '—'], 'future months show — for actual');
      _assertEqual(first[3].slice(4, 7), ['—', '—', '—'], 'future months show — for variance');
      _assertEqual(first[4].slice(1, 7), ['—', '—', '0.5', '0.5', '0.5', '0.5'], 'Required only in the window');
      _assertEqual(/to date/.test(first[0][3]) && !/to date/.test(first[0][2]), true, 'current month (3rd) marked "to date"');
      const t = coeOpensTotals(m6);
      _assertEqual([t.planned, t.actual, t.variance], [6, 2, -1], 'coeOpensTotals');
      _assertEqual(coeOpensTableHtml(m6).includes(`<th>Total</th><th>${t.planned}</th><th>${t.actual}</th>`), true, 'vertical Total row uses the same totals');
      const strips = n => tablesOf(coeOpensHorizontalTableHtml(mk(n)));
      _assertEqual([18, 19, 36, 37].map(n => strips(n).length), [1, 2, 2, 3], 'strip count: ceil(months / 18)');
      const s19 = strips(19).map(rowsOf);
      _assertEqual(s19.map(t => t[0].length), [11, 11], '19 months → 10 + 9 (+ Total on the last): equal width, label + 10');
      _assertEqual(s19[0][0].includes('Total'), false, 'Total only on the last strip');
      _assertEqual(s19[1][0].includes('Total'), true, 'Total on the last strip');
      _assertEqual(s19.every(tb => tb.map(r => r.length).every(len => len === tb[0].length)), true, 'all rows in a strip have equal cell counts');
      const keep = CONFIG.COE_OPENS_STRIP_MONTHS;
      try {
        CONFIG.COE_OPENS_STRIP_MONTHS = 6;
        _assertEqual(strips(13).length, 3, 'strip size is read from CONFIG.COE_OPENS_STRIP_MONTHS');
      } finally { CONFIG.COE_OPENS_STRIP_MONTHS = keep; }
      _assertEqual(coeOpensHorizontalTableHtml({ months: [] }), '', 'no months → empty');
      const rows = [{ id: '1', Title: 'A', OpenDate: '2026-08-03T12:00:00Z', LinkedHeadcountID: '10' }, { id: '2', Title: 'B', OpenDate: '2026-11-02T12:00:00Z' }];
      const hc = [{ id: '10', OpenDate: '2026-07-30T12:00:00Z' }];
      const hz = coeOpensBlockHtml(rows, hc, { summary: true, horizontal: true });
      _assertEqual(/coe-opens-table--h/.test(hz) && /coe-opens-summary/.test(hz) && !/<th>Planned Opens<\/th>/.test(hz), true, 'horizontal block: summary + chart + months-across table');
      const vt = coeOpensBlockHtml(rows, hc);
      _assertEqual(/coe-opens-table--h/.test(vt), false, 'default block keeps the vertical table');
    },
  },
  // ── N-313 (HC-7): Role History timeline for multi-headcount pipelines ──
  {
    name: 'N-313 roleTimelineNodeClass — N-100 classes unchanged; backward after a placement and Closed reopen → reset',
    fn: function () {
      _assertEqual(roleTimelineNodeClass(null, 'Sourcing'), 'start', 'creation row (null)');
      _assertEqual(roleTimelineNodeClass('', 'Planning'), 'start', 'creation row (empty string)');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'On-hold'), 'branch', 'into On-hold');
      _assertEqual(roleTimelineNodeClass('Cancelled', 'Sourcing'), 'branch', 'out of Cancelled');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'Sourcing'), 'branch', 'equal');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'Bogus'), 'branch', 'unresolvable');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'Submitted'), 'forward', 'forward');
      _assertEqual(roleTimelineNodeClass('Offered', 'Closed'), 'forward', 'Offered → Closed');
      _assertEqual(roleTimelineNodeClass('Offered', 'Sourcing'), 'backward', 'backward, no placement');
      _assertEqual(roleTimelineNodeClass('Offered', 'Sourcing', { placementSincePrev: true }), 'reset', 'backward after a placement');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'Submitted', { placementSincePrev: true }), 'forward', 'forward stays forward');
      _assertEqual(roleTimelineNodeClass('Sourcing', 'On-hold', { placementSincePrev: true }), 'branch', 'branch stays branch');
      _assertEqual(roleTimelineNodeClass('Closed', CONFIG.HEADCOUNT.reopenStage), 'reset', 'D-3 reopen, no placement in window');
      _assertEqual(roleTimelineNodeClass('Closed', 'Interview 1'), 'reset', 'reopen into any open stage');
    },
  },
  {
    name: 'N-313 roleTimelineSequence — marker slots, same-day tie, inclusive placementSincePrev, undated count, no mutation',
    fn: function () {
      const tag = o => o.map(e => (e.kind === 'stage' ? 'S' + e.index : 'P' + e.placement.id));
      const P = (id, d) => ({ id, OfferAcceptedDate: d });
      const days = ['2026-05-01', '2026-06-01', '2026-07-10', '2026-08-01'];
      const placements = [
        P(5, '2026-09-01T12:00:00Z'),  // after every node → last
        P(2, '2026-07-10T12:00:00Z'),  // same day as node 2 → above node 2
        P(1, '2026-04-20T12:00:00Z'),  // before node 0 → first
        P(3, null),                    // undated
        P(4, '2026-07-10T23:00:00Z'),  // same slot as 2, higher id
      ];
      const snapshot = JSON.stringify([days, placements]);
      const s = roleTimelineSequence(days, placements);
      _assertEqual(tag(s.order), ['P1', 'S0', 'S1', 'P2', 'P4', 'S2', 'S3', 'P5'], 'display order');
      _assertEqual(s.placementSincePrev, [false, false, true, true], 'inclusive window (07-10 counts for nodes 2 and 3)');
      _assertEqual(s.undated, 1, 'undated counted, not ordered');
      _assertEqual(JSON.stringify([days, placements]), snapshot, 'inputs not mutated');
      const edge = roleTimelineSequence(['2026-05-01', '2026-06-01'], [P(9, '2026-05-01T12:00:00Z')]);
      _assertEqual(tag(edge.order), ['S0', 'P9', 'S1'], 'on node 0 day → after node 0');
      _assertEqual(edge.placementSincePrev, [false, true], 'lower bound inclusive');
      _assertEqual(roleTimelineSequence(['2026-05-01'], []).order, [{ kind: 'stage', index: 0 }], 'no placements → stage nodes only');
      _assertEqual(roleTimelineSequence([], []).order, [], 'empty');
      _assertEqual(roleTimelinePlacementDay({ OfferAcceptedDate: '2026-06-30T23:00:00Z' }), '2026-06-30', 'stored date portion (spDateIn)');
      _assertEqual(roleTimelinePlacementDay({}), null, 'no date');
    },
  },
  {
    name: 'N-313 legacy Hired reaches the timeline and roleStageEntryDay as Closed (N-306 read alias, no second alias)',
    fn: function () {
      const rows = normaliseRoleHistoryRows([
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: null,      NewValue: 'Offered',  ChangedAt: '2026-03-02T10:00:00Z' },
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: 'Offered', NewValue: 'Hired',    ChangedAt: '2026-04-01T10:00:00Z' },
        { RoleIDLookupId: 7, Field: 'Stage', OldValue: 'Hired',   NewValue: 'Sourcing', ChangedAt: '2026-05-01T10:00:00Z' },
      ]);
      _assertEqual(roleTimelineNodeClass(rows[1].OldValue, rows[1].NewValue), 'forward', 'Offered → Hired reads Offered → Closed');
      _assertEqual(roleTimelineNodeClass(rows[2].OldValue, rows[2].NewValue), 'reset', 'Hired → Sourcing reads as a Closed reopen');
      _assertEqual(roleStageEntryDay({ Stage: 'Closed', OpenDate: '2026-03-01T12:00:00Z' }, rows.slice(0, 2)), '2026-04-01', 'entered Closed on the Hired row day');
    },
  },
  {
    name: 'N-313 earliestHeadcountOpenDate — filled / cancelled headcount keep anchoring Roles.OpenDate (back-dating stable)',
    fn: function () {
      _assertEqual(earliestHeadcountOpenDate([
        { id: 1, OpenDate: '2026-02-01T12:00:00Z', Status: 'Open' },   // filled (a placement carries HeadcountID 1)
        { id: 2, OpenDate: '2026-06-01T12:00:00Z', Status: 'Open' },
      ]), '2026-02-01', 'filled earlier headcount still anchors');
      _assertEqual(earliestHeadcountOpenDate([
        { id: 3, OpenDate: '2026-01-15T12:00:00Z', Status: 'Cancelled', CancelledDate: '2026-03-01T12:00:00Z' },
        { id: 4, OpenDate: '2026-05-01T12:00:00Z', Status: 'Open' },
      ]), '2026-01-15', 'cancelled earlier headcount still anchors');
    },
  }
);
