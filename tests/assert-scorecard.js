// tests/assert-scorecard.js — My Scorecard / Team Scorecards (N-453 / MM-3). Pure logic runs everywhere; the
// source-text checks need ALL_SOURCES / ALL_HTML (tests/run.js) and skip in the browser harness.
// my-momentum-scorecard.js itself is not loaded in the rig (it needs the DOM); its pure parts live in analytics.js,
// utils.js and my-momentum-logic.js, which are.

// A fixed "today" built from local parts, so the suite is the same in every time zone. Wed 11 Nov 2026.
const _SC_TODAY = new Date(2026, 10, 11, 12, 0, 0);
const _scRow = (tp, day, c) => Object.assign({ RoleIDLookupId: 'R1', TalentPartner: tp, WeekEndingDate: day + 'T12:00:00Z',
  Outreach: 0, Responses: 0, Submitted: 0, Interview1: 0, Offers: 0, Hires: 0 }, c);

ASSERTIONS.push(
  {
    name: 'N-453 AC3 scorecardPeriod: quarter = 13 weeks back, YTD = 1 January (local), all = no window, unknown key = default',
    fn: function () {
      const q = scorecardPeriod('quarter', _SC_TODAY), y = scorecardPeriod('ytd', _SC_TODAY), a = scorecardPeriod('all', _SC_TODAY);
      _assertEqual(q.fromDay, weeksAgoDay(13, _SC_TODAY), 'quarter cuts where People Scorecards always cut');
      _assertEqual(y.fromDay, '2026-01-01', 'ytd is 1 January of the local year');
      _assertEqual(a.fromDay, null, 'all time has no window');
      _assertEqual([q.key, y.key, a.key], ['quarter', 'ytd', 'all'], 'keys');
      _assertEqual(scorecardPeriod('nope', _SC_TODAY).key, CONFIG.MY_MOMENTUM.SCORECARD.DEFAULT_PERIOD, 'unknown key falls back to the default');
      _assertEqual(scorecardPeriod(undefined, _SC_TODAY).key, 'quarter', 'missing key falls back to the default');
      _assertEqual(scorecardPeriod('ytd', new Date(2027, 0, 1, 0, 30)).fromDay, '2027-01-01', 'control: 00:30 on 1 January is already the new year (no toISOString drift)');
    },
  },
  {
    name: 'N-453 scorecardFetchWeeks: never below the 52-week benchmark pool, reaches 1 January late in a leap year',
    fn: function () {
      _assertEqual(scorecardFetchWeeks(new Date(2026, 0, 5)), 52, 'early January: the benchmark pool sets the width');
      _assertEqual(scorecardFetchWeeks(new Date(2026, 11, 31)) >= 52, true, 'end of a plain year');
      _assertEqual(scorecardFetchWeeks(new Date(2028, 11, 31)) * 7 >= 365, true, 'end of a leap year still reaches 1 January');
    },
  },
  {
    name: 'N-453 activitySinceDay / placementsSinceDay / scorecardHasActivity: day cut, null window = everything, email match',
    fn: function () {
      const rows = [_scRow('a@x.com', '2026-01-04'), _scRow('a@x.com', '2026-01-11'), { TalentPartner: 'a@x.com' }];
      _assertEqual(activitySinceDay(rows, '2026-01-05').length, 1, 'rows before the day drop, and a row with no date drops when a window applies');
      _assertEqual(activitySinceDay(rows, '2026-01-04').length, 2, 'the cut day itself is inside');
      _assertEqual(activitySinceDay(rows, null).length, 3, 'null window returns every row, dateless included (as weeks 0 does)');
      const pl = [{ placementDate: '2026-02-01T00:00:00Z' }, { placementDate: '2025-02-01T00:00:00Z' }, {}];
      _assertEqual(placementsSinceDay(pl, '2026-01-01').length, 1, 'placements cut the same way');
      _assertEqual(placementsSinceDay(pl, null).length, 3, 'null window returns all placements');
      _assertEqual(scorecardHasActivity(rows, ' A@X.com '), true, 'trimmed, case-insensitive email match');
      _assertEqual([scorecardHasActivity(rows, 'b@x.com'), scorecardHasActivity(rows, ''), scorecardHasActivity(null, 'a@x.com'), scorecardHasActivity(rows, undefined)], [false, false, false, false], 'control: no match, empty email, null rows');
    },
  },
  {
    name: 'N-453 buildScorecardCards: one card per person with activity in the period; the rest are counted, not carded; period slices the rows but not the benchmark pool',
    fn: function () {
      const roles = [{ id: 'R1', RoleTitle: 'R1', Stage: 'Sourcing', TalentPartner: 'a@x.com', Department: 'Eng', Location: 'UK' }];
      const old = '2026-03-01', recent = '2026-11-08';
      const data = {
        activity: [_scRow('a@x.com', old, { Outreach: 10, Responses: 5 }), _scRow('A@x.com ', recent, { Outreach: 20, Responses: 8, Submitted: 3 }), _scRow('c@x.com', old, { Outreach: 9 })],
        placements: [], allRoles: roles, allProjects: [], stageHistory: {}, openSince: new Map(),
      };
      const people = [{ email: 'a@x.com', name: 'Ann' }, { email: 'b@x.com', name: 'Bo' }, { email: 'c@x.com', name: 'Cy' }];
      const q = buildScorecardCards({ people, data, period: scorecardPeriod('quarter', _SC_TODAY), today: _SC_TODAY });
      _assertEqual(q.cards.map(c => c.email), ['a@x.com'], 'quarter: only Ann has a row in the window (Cy only has an old one)');
      _assertEqual(q.omitted, 2, 'the two without activity are counted, not carded');
      const all = buildScorecardCards({ people, data, period: scorecardPeriod('all', _SC_TODAY), today: _SC_TODAY });
      _assertEqual(all.cards.map(c => c.email), ['a@x.com', 'c@x.com'], 'all time: Cy appears; order follows `people`; Bo never has a card');
      _assertEqual(all.omitted, 1, 'all time omits only Bo');
      _assertEqual(typeof all.cards[0].scorecard, 'object', 'each card carries a scorecard');
      _assertEqual(all.cards[0].name, 'Ann', 'name from the people list');
      _assertEqual(buildScorecardCards({ people: [], data, period: scorecardPeriod('all', _SC_TODAY), today: _SC_TODAY }), { cards: [], omitted: 0 }, 'no people → nothing');
      _assertEqual(buildScorecardCards({ people: [{ email: '', name: 'No mail' }], data, today: _SC_TODAY }).omitted, 1, 'control: a person with no email can never match activity');
      let threw = '';
      try { buildScorecardCards({ people, data: { activity: data.activity, allRoles: roles }, today: _SC_TODAY }); } catch (e) { threw = String(e.message); }
      _assertEqual(/ctx\.projects/.test(threw), true, 'N-333 guard kept: without the Projects rows the internal-project exclusion refuses to guess');
    },
  },
  {
    name: 'N-453 AC1/AC9 golden: the quarter cards equal what the old People Scorecards loop produced (metrics, benchmark, role health), for the same fixture',
    fn: function () {
      const roles = [
        { id: 'R1', RoleTitle: 'R1', Stage: 'Sourcing', TalentPartner: 'a@x.com', Department: 'Eng', Location: 'UK' },
        { id: 'R2', RoleTitle: 'R2', Stage: 'Interviewing', TalentPartner: 'b@x.com', Department: 'Sales', Location: 'US' },
        { id: 'R3', RoleTitle: 'R3', Stage: 'Placed', TalentPartner: 'a@x.com', Department: 'Eng', Location: 'UK' },
      ];
      const days = [];
      for (let w = 0; w < 20; w++) { const d = new Date(2026, 10, 8 - 7 * w); days.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); }   // Sundays, newest first
      const activity = [];
      days.forEach((day, w) => ['a@x.com', 'b@x.com'].forEach((tp, i) => ['R1', 'R2'].forEach((rid, j) =>
        activity.push(_scRow(tp, day, { RoleIDLookupId: rid, Outreach: 20 + w + i * 3 + j, Responses: 8 + (w % 4) + i, Submitted: 3 + (w % 3), Interview1: 2 + (w % 2), Offers: w % 3 === 0 ? 1 : 0, Hires: w % 5 === 0 ? 1 : 0 })))));
      const placements = [
        { tpEmail: 'a@x.com', placementDate: '2026-10-20T00:00:00Z', openDate: '2026-08-01T00:00:00Z' },
        { tpEmail: 'b@x.com', placementDate: '2026-09-02T00:00:00Z', openDate: '2026-07-01T00:00:00Z' },
        { tpEmail: 'a@x.com', placementDate: '2025-12-02T00:00:00Z', openDate: '2025-10-01T00:00:00Z' },   // outside the quarter
      ];
      const stageHistory = {}, openSince = new Map(), projects = [];
      // The old renderScorecardsPage loop, copied from the version N-453 removed (analytics-pages.js), minus the DOM and the role scoping.
      const activity52 = activitySinceWeeks(activity, 52, _SC_TODAY), activityRaw = activitySinceWeeks(activity, 13, _SC_TODAY);
      const roleIndex = funnelRoleIndex(roles, 'Department', 'Location');
      const { activity: clientActivity52 } = excludeInternalProjectData({ activity: activity52 }, { projects, roles });
      const benchObs = buildFunnelObservations(clientActivity52, roleIndex);
      const recent = placementsSinceWeeks(placements, 13);
      const old = ['a@x.com', 'b@x.com'].map(tpEmail => {
        const tpActivity = activityRaw.filter(a => a.TalentPartner === tpEmail);
        const bench = learnFunnelBenchmarksMix(benchObs, buildFunnelObservations(tpActivity, roleIndex), { exclude: o => o.tp === tpEmail });
        const scorecard = computeVelocityScore(tpEmail, tpActivity, recent.filter(r => tpMatches(r.tpEmail, tpEmail)), bench);
        const tpRoles = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage) && tpMatches(r.TalentPartner, tpEmail));
        return { scorecard, bench, roleHealth: tallyRoleFlags(tpRoles, activityRaw, stageHistory, undefined, { openSince }) };
      });
      const built = buildScorecardCards({ people: [{ email: 'a@x.com', name: 'A' }, { email: 'b@x.com', name: 'B' }],
        data: { activity, placements, allRoles: roles, allProjects: projects, stageHistory, openSince }, period: scorecardPeriod('quarter', _SC_TODAY), today: _SC_TODAY });
      _assertEqual(built.cards.length, 2, 'both people get a card');
      built.cards.forEach((c, i) => {
        _assertEqual(JSON.stringify(c.scorecard), JSON.stringify(old[i].scorecard), c.email + ' scorecard (metrics, RAG) equals the old loop');
        _assertEqual(JSON.stringify(c.bench), JSON.stringify(old[i].bench), c.email + ' benchmark equals the old loop');
        _assertEqual(JSON.stringify(c.roleHealth), JSON.stringify(old[i].roleHealth), c.email + ' role health equals the old loop');
      });
      _assertEqual(built.cards[0].scorecard.metrics.some(m => m && (m.value != null || m.display != null)) || JSON.stringify(built.cards[0].scorecard).length > 50, true, 'control: the fixture produces real numbers, so the equalities above compare something');
      const ytd = buildScorecardCards({ people: [{ email: 'a@x.com', name: 'A' }], data: { activity, placements, allRoles: roles, allProjects: projects, stageHistory, openSince }, period: scorecardPeriod('ytd', _SC_TODAY), today: _SC_TODAY });
      // AC2: the learning pool is the same 52 weeks for every period. A person who works one role has the same own mix in every period, so their benchmark must be identical in quarter and YTD.
      const oneRole = activity.filter(a => a.TalentPartner !== 'a@x.com' || a.RoleIDLookupId === 'R1');
      const r9 = o => JSON.stringify(o, (k, v) => typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v);   // the weighted mean differs in the last float digit when the weights differ
      const bench = key => buildScorecardCards({ people: [{ email: 'a@x.com', name: 'A' }], data: { activity: oneRole, placements, allRoles: roles, allProjects: projects, stageHistory, openSince }, period: scorecardPeriod(key, _SC_TODAY), today: _SC_TODAY }).cards[0].bench;
      _assertEqual(r9(bench('ytd')), r9(bench('quarter')), 'AC2 the benchmark does not move with the period (same 52-week pool)');
      _assertEqual(r9(bench('all')), r9(bench('quarter')), 'AC2 all time uses the same 52-week pool too');
      const noB = oneRole.filter(a => a.TalentPartner === 'a@x.com');
      _assertEqual(r9(buildScorecardCards({ people: [{ email: 'a@x.com', name: 'A' }], data: { activity: noB, placements, allRoles: roles, allProjects: projects, stageHistory, openSince }, period: scorecardPeriod('quarter', _SC_TODAY), today: _SC_TODAY }).cards[0].bench) === r9(bench('quarter')), false, 'control: a different pool does change the benchmark, so the equalities above test the pool');
      _assertEqual(JSON.stringify(ytd.cards[0].roleHealth), JSON.stringify(built.cards[0].roleHealth), 'AC9 role health is identical across periods');
      _assertEqual(JSON.stringify(ytd.cards[0].scorecard) === JSON.stringify(built.cards[0].scorecard), false, 'control: the period does change the scorecard (YTD sees the December placement and more weeks)');
    },
  },
  {
    name: 'N-453 mmTeamSubTabs: Development follows pdpTeam, Team Scorecards follows hasReports or an all-staff role',
    fn: function () {
      const k = ctx => mmTeamSubTabs(ctx).map(t => t.key);
      _assertEqual(k({ role: 'delivery_manager', signals: { pdpTeam: true, hasReports: true } }), ['development', 'scorecards'], 'both, Development first');
      _assertEqual(k({ role: 'delivery_manager', signals: { hasReports: true } }), ['scorecards'], 'reports without PDP: scorecards only');
      _assertEqual(k({ role: 'talent_partner', signals: { pdpTeam: true } }), ['development'], 'PDP without reports or an all-staff role: Development only');
      ['admin', 'leadership', 'people_ops'].forEach(r => _assertEqual(k({ role: r, signals: {} }), ['scorecards'], r + ': all-staff role gets Team Scorecards (MM-D8)'));
      _assertEqual(k({ role: 'staff', signals: {} }), [], 'control: an ordinary role with nothing has no sub-tab');
      _assertEqual(k(null), [], 'null-safe');
    },
  },
  {
    name: 'N-453 mmScorecardScope / mmScorecardMembers: views follow the ReportsTo line (MM-D12); leavers, placeholders, no-email rows and duplicates drop; A→Z',
    fn: function () {
      const L = CONFIG.PDP.REVIEWER_LEVEL;
      const p = (id, name, email, o) => Object.assign({ id, EmployeeName: name, WorkEmail: email, IsActive: 'Yes' }, o || {});
      const dr = [p(1, 'Zed', 'z@x.com'), p(2, 'Amy', 'A@x.com'), p(2, 'Amy dup', 'a@x.com'), p(3, 'Gone', 'g@x.com', { IsActive: 'No' }), p(4, 'Ph', 'ph@x.com', { IsPlaceholder: true }), p(5, 'NoMail', '')];
      const id = { me: { id: 9, Level: L }, directReports: dr, csdTree: [{ person: p(6, 'Tree', 't@x.com') }] };
      _assertEqual(mmScorecardScope(id, 'delivery_manager'), { views: ['tree', 'reports'], default: 'tree' }, 'a CSD sees the tree and their reports, tree first');
      _assertEqual(mmScorecardScope({ me: { id: 9, Level: 'x' }, directReports: dr }, 'delivery_manager'), { views: ['reports'], default: 'reports' }, 'a line manager sees their reports');
      _assertEqual(mmScorecardScope({ me: { id: 9, Level: 'x' }, directReports: [] }, 'admin'), { views: ['all'], default: 'all' }, 'an all-staff role sees all');
      _assertEqual(mmScorecardScope({ me: { id: 9, Level: 'x' }, directReports: dr }, 'admin').views, ['reports', 'all'], 'a manager who is also Admin gets both');
      _assertEqual(mmScorecardScope(null, 'staff'), { views: [], default: '' }, 'control: nobody, no views');
      _assertEqual(mmScorecardMembers([], id, 'reports'), [{ email: 'a@x.com', name: 'Amy' }, { email: 'z@x.com', name: 'Zed' }], 'reports: A→Z, lower-cased, one Amy, no leaver / placeholder / no-email row');
      _assertEqual(mmScorecardMembers([], id, 'tree'), [{ email: 't@x.com', name: 'Tree' }], 'tree view reads csdTree');
      _assertEqual(mmScorecardMembers([p(7, 'Eve', 'e@x.com'), p(8, 'Al', 'al@x.com')], id, 'all').map(x => x.name), ['Al', 'Eve'], 'all view reads the people list');
      _assertEqual(mmScorecardMembers([p(7, 'Eve', 'e@x.com')], id, 'bogus'), [], 'control: an unknown view is empty, never everyone');
    },
  },
  {
    name: 'N-453 mmResolveDeepLink: tab key, Team Scorecards alias, and the #scorecards fallback for someone with no card of their own',
    fn: function () {
      const cfg = CONFIG.MY_MOMENTUM;
      const tabs = ks => ks.map(key => ({ key }));
      const subs = ks => ks.map(key => ({ key }));
      _assertEqual(mmResolveDeepLink('myScorecard', tabs(['myHistory', 'myScorecard']), [], cfg), { tab: 'myScorecard' }, 'a visible tab key opens that tab');
      _assertEqual(mmResolveDeepLink('teamScorecards', tabs(['myHistory', 'myTeam']), subs(['scorecards']), cfg), { tab: 'myTeam', sub: 'scorecards' }, 'the alias opens My Team on the Team Scorecards sub-tab');
      _assertEqual(mmResolveDeepLink('myScorecard', tabs(['myHistory', 'myTeam']), subs(['scorecards']), cfg), { tab: 'myTeam', sub: 'scorecards' }, 'no card of their own: an old #scorecards link falls back to Team Scorecards');
      _assertEqual(mmResolveDeepLink('teamScorecards', tabs(['myHistory', 'myTeam']), subs(['development']), cfg), null, 'control: My Team without the scorecards sub-tab does not match (landing tab opens)');
      _assertEqual(mmResolveDeepLink('myScorecard', tabs(['myHistory']), [], cfg), null, 'nothing fits → null');
      _assertEqual(mmResolveDeepLink('constructor', tabs(['myHistory']), [], cfg), null, 'prototype keys never match');
      _assertEqual(mmResolveDeepLink('', tabs(['myHistory']), [], cfg), null, 'empty page');
    },
  },
  {
    name: 'N-453 My Momentum scorecard markup: escaped names, classes only, empty and omitted notes, view labels equal Development\'s',
    fn: function () {
      const labels = mmScorecardViewLabels();
      _assertEqual(labels, { tree: 'Whole tree', reports: 'Direct reports', all: 'All staff' }, 'view wording');
      if (typeof ALL_SOURCES !== 'undefined') {
        const tp = ALL_SOURCES['pdp-team-page.js'];
        Object.values(labels).forEach(l => _assertEqual(tp.includes("'" + l + "'"), true, 'the Development tab says "' + l + '" too'));
      }
      const empty = mmScorecardEmptyHtml('quarter');
      _assertEqual(typeof empty, 'string', 'empty state renders');
      [empty, mmScorecardOmittedHtml(3), mmScorecardBasisNote()].forEach(h => _assertEqual(/<script|\bon[a-z]+=|\sstyle=/.test(h), false, 'plain markup: no script, handler or inline style'));
      _assertEqual(mmScorecardOmittedHtml(0), '', 'nothing omitted → no note');
      _assertEqual(/BENCHMARK_WEEKS|52/.test(mmScorecardBasisNote()), true, 'the basis note names the 52-week pool');
    },
  },
  {
    name: 'N-453 source guards: scorecard file registers its own actions, no inline handler / style / hex; People Scorecards and analytics-pages.js are gone',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') _skip('needs ALL_SOURCES / ALL_HTML (tests/run.js)');
      _assertEqual(Object.prototype.hasOwnProperty.call(ALL_SOURCES, 'analytics-pages.js'), false, 'analytics-pages.js no longer exists');
      const sc = ALL_SOURCES['my-momentum-scorecard.js'] || '';
      _assertEqual(sc.length > 0, true, 'my-momentum-scorecard.js is in the source set');
      _assertEqual(/registerActions\(\{[\s\S]*mmScPeriod[\s\S]*mmScView[\s\S]*mmScRetry/.test(sc), true, 'the file registers mmScPeriod, mmScView and mmScRetry itself (it loads after nav.js)');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(sc.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')), false, 'no hex colour in JS');
      _assertEqual(/\bon(click|change|input)=|\.style\.|setAttribute\('style'/.test(sc), false, 'no inline handler or inline style');
      _assertEqual(/toISOString/.test(sc), false, 'no toISOString date handling');
      _assertEqual(/const PEOPLE_LANDING_ORDER = \['peopleDashboard', 'orgChart'\];/.test(ALL_SOURCES['people-router.js']), true, 'AC10 People lands on the Dashboard or Org Chart; the scorecards are not a landing page');
      _assertEqual(/case 'scorecards'/.test(ALL_SOURCES['people-nav.js']), false, 'AC10 People nav no longer routes scorecards');
      ['myScorecard', 'teamScorecards'].forEach(k => {
        const e = CONFIG.COMMAND_BAR_PAGES.filter(p => p.key === k);
        _assertEqual(e.length === 1 && e[0].module === 'myMomentum' && e[0].href === 'my-momentum.html#' + k, true, 'AC12 one Command Bar entry for ' + k + ', inside My Momentum');
      });
      _assertEqual(CONFIG.COMMAND_BAR_PAGES.some(p => /people\.html#scorecards/.test(p.href)), false, 'AC12 nothing points at people.html#scorecards');
      ['people.html'].forEach(f => _assertEqual(/analytics-pages\.js/.test(ALL_HTML[f]), false, f + ' does not load analytics-pages.js'));
      _assertEqual(/analytics-pages\.js/.test(ALL_HTML['my-momentum.html']), false, 'my-momentum.html does not load analytics-pages.js');
      _assertEqual(/renderScorecardsPage|renderScorecardPanel/.test(Object.keys(ALL_SOURCES).filter(f => !/^mobile-/.test(f)).map(f => ALL_SOURCES[f]).join('\n')), false, 'no caller of the retired People Scorecards renderers is left on desktop');
    },
  }
);