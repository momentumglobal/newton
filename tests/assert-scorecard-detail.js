// tests/assert-scorecard-detail.js — My Scorecard detail: weekly trend, flagged roles, hires (N-454 / MM-4).
// Pure logic and markup run everywhere; the source-text checks need ALL_SOURCES (tests/run.js) and skip in the browser harness.

// Wed 11 Nov 2026, from local parts so the suite is the same in every time zone. Week-ending Sundays: 8 Nov, 1 Nov, 25 Oct …
const _SD_TODAY = new Date(2026, 10, 11, 12, 0, 0);
const _sdRow = (tp, day, c) => Object.assign({ RoleIDLookupId: 'R1', TalentPartner: tp, WeekEndingDate: day + 'T12:00:00Z',
  Outreach: 0, Responses: 0, Submitted: 0, Interview1: 0, Offers: 0, Hires: 0 }, c);
const _sdBench = { outreachConversion: 0.3, submissionConversion: 0.4, interviewToOffer: 5, offerSuccess: 0.6, timeToHireDays: 60, flagThreshold: 0.8 };
function _sdFixture() {
  // Ann: weeks ending 25 Oct, 8 Nov (1 Nov is a quiet week). Bo's rows must never leak into Ann's series.
  const activity = [
    _sdRow('a@x.com', '2026-10-25', { Outreach: 20, Responses: 10, Submitted: 4, Interview1: 2, Offers: 1, Hires: 1 }),
    _sdRow('A@x.com ', '2026-11-08', { Outreach: 30, Responses: 9, Submitted: 5, Interview1: 4, Offers: 2, Hires: 1 }),
    _sdRow('b@x.com', '2026-11-01', { Outreach: 99, Responses: 99 }),
    _sdRow('a@x.com', '2026-03-01', { Outreach: 50 }),   // before the quarter
  ];
  const placements = [
    { id: 'R1', placementId: 'P1', title: 'Dev', tpEmail: 'a@x.com', placementDate: '2026-11-04T00:00:00Z', openDate: '2026-09-04T00:00:00Z' },   // a Wednesday: counts in the week ending 8 Nov
    { id: 'R1', placementId: 'P2', title: 'Dev', tpEmail: 'a@x.com;b@x.com', placementDate: '2026-10-22T00:00:00Z', openDate: '2026-08-28T00:00:00Z' },
    { id: 'R2', placementId: 'P3', title: 'Ops', tpEmail: 'b@x.com', placementDate: '2026-10-27T00:00:00Z', openDate: '2026-08-28T00:00:00Z' },
    { id: 'R1', placementId: 'P4', title: 'Dev', tpEmail: 'a@x.com', placementDate: '2026-02-10T00:00:00Z', openDate: '2026-01-04T00:00:00Z' },   // before the quarter
  ];
  const placementsRaw = [{ id: 'P1', CandidateName: 'Cara <b>Dee</b>' }, { id: 'P2', CandidateName: 'Eli Fox' }, { id: 'P4', CandidateName: 'Old Hire' }];
  const allRoles = [
    { id: 'R1', RoleTitle: 'Dev', Stage: 'Sourcing', TalentPartner: 'a@x.com', Department: 'Eng', Location: 'UK', ProjectIDLookupId: 'PJ1', OpenDate: '2026-06-01' },
    { id: 'R2', RoleTitle: 'Ops', Stage: 'Sourcing', TalentPartner: 'b@x.com', Department: 'Eng', Location: 'UK', ProjectIDLookupId: 'PJ1' },
    { id: 'R3', RoleTitle: 'Done', Stage: 'Closed', TalentPartner: 'a@x.com', Department: 'Eng', Location: 'UK', ProjectIDLookupId: 'PJ1' },
  ];
  const allProjects = [{ id: 'PJ1', CustomerName: 'Acme & Co' }];
  return { activity, placements, placementsRaw, allRoles, allProjects };
}

ASSERTIONS.push(
  {
    name: 'N-454 config: every trend entry names a computeFunnelScorecard row, in the card\'s order; the 7:1 reference is the green limit the card uses',
    fn: function () {
      const rows = computeFunnelScorecard([], [], _sdBench);
      const T = CONFIG.MY_MOMENTUM.SCORECARD.TREND;
      _assertEqual(T.map(t => t.label), rows.map(r => r.label), 'same six metrics in the same order as the card');
      _assertEqual(T.map(t => t.unit), rows.map(r => r.unit), 'same units');
      const i2o = T.find(t => t.label === 'Interview-to-offer');
      const at = ratio => computeFunnelScorecard([{ Interview1: ratio * 2, Offers: 2 }], [], _sdBench).find(r => r.label === 'Interview-to-offer').rag;
      _assertEqual([at(i2o.fixed), at(i2o.fixed + 0.5)], ['green', 'amber'], 'the fixed reference is exactly where the card turns green → amber');
    },
  },
  {
    name: 'N-454 AC3-5 buildScorecardTrend: continuous Sunday weeks, a quiet week is a gap (Hires 0), another person\'s rows never leak, norm lines equal the card\'s benchmark',
    fn: function () {
      const f = _sdFixture();
      const period = scorecardPeriod('quarter', _SD_TODAY);
      const t = buildScorecardTrend({ activity: f.activity, placements: f.placements, period, bench: _sdBench, key: 'a@x.com', today: _SD_TODAY });
      _assertEqual(t.weeks, ['2026-10-25', '2026-11-01', '2026-11-08'], 'three continuous Sundays, the quiet 1 Nov week included');
      const by = label => t.series.find(s => s.label === label);
      _assertEqual(by('Outreach conversion').values, [50, null, 30], 'rate per week; the quiet week is a gap, not 0');
      _assertEqual(by('Hires').values, [1, 0, 1], 'Hires counts placements; a quiet week is 0');
      _assertEqual(by('Avg time to hire').values, [55, null, 61], 'a placement is bucketed to the Sunday on or after its day (Wed 4 Nov → w/e 8 Nov; Thu 22 Oct → w/e 25 Oct)');
      _assertEqual(t.weekly.map(w => w.Outreach), [20, 0, 30], 'only Ann\'s rows (Bo\'s 99 never appears, nor the March row)');
      _assertEqual([by('Outreach conversion').bench, by('Submission conversion').bench, by('Offer success').bench, by('Avg time to hire').bench], [30, 40, 60, 60], 'reference lines are the card benchmark in the row\'s unit');
      _assertEqual([by('Interview-to-offer').bench, by('Hires').bench], [7, null], 'fixed limit; Hires has no line');
      _assertEqual(by('Avg time to hire').lower && by('Interview-to-offer').lower, true, 'lower-is-better flagged');
      // The chart and the card cannot disagree: the weekly counts add up to the card's period totals.
      const rows = activitySinceDay(f.activity, period.fromDay).filter(a => scorecardEmailKey(a.TalentPartner) === 'a@x.com');
      const card = computeFunnelScorecard(rows, placementsSinceDay(f.placements, period.fromDay).filter(p => tpMatches(p.tpEmail, 'a@x.com')), _sdBench);
      ['Outreach', 'Responses', 'Submitted', 'Interview1', 'Offers', 'Hires'].forEach(k =>
        _assertEqual(t.weekly.reduce((n, w) => n + w[k], 0), sumField(rows, k), k + ' weekly counts sum to the period total'));
      _assertEqual(t.weekly.reduce((n, w) => n + w.Placements, 0), card.find(r => r.label === 'Hires').value, 'weekly placements sum to the card Hires');
      _assertEqual(buildScorecardTrend({ activity: f.activity, placements: f.placements, period, bench: _sdBench, key: 'nobody@x.com', today: _SD_TODAY }), { weeks: [], series: [], weekly: [] }, 'no activity → empty');
      _assertEqual(buildScorecardTrend({ activity: f.activity, placements: f.placements, period, bench: _sdBench, key: '', today: _SD_TODAY }).weeks, [], 'control: no email → empty');
      const all = buildScorecardTrend({ activity: f.activity, placements: f.placements, period: scorecardPeriod('all', _SD_TODAY), bench: _sdBench, key: 'a@x.com', today: _SD_TODAY });
      _assertEqual(all.weeks[0], '2026-02-15', 'all time reaches the February placement (w/e 15 Feb) and the weeks run unbroken to 8 Nov');
      _assertEqual(all.weeks.length, 39, '15 Feb → 8 Nov is 39 Sundays');
    },
  },
  {
    name: 'N-454 AC6 listScorecardRoles: counts equal the card\'s role-health numerators; reasons and order; closed and other people\'s roles never listed',
    fn: function () {
      const f = _sdFixture();
      // R1 has 6 weeks of Submitted ≥ 3 with Interview1 ÷ Submitted < 50 %: flagged for conversion. R2 is Bo's.
      const act = [_sdRow('a@x.com', '2026-11-08', { Submitted: 10, Interview1: 1 })];
      const key = 'a@x.com';
      const args = { allRoles: f.allRoles, allProjects: f.allProjects, activity: act, stageHistory: {}, openSince: new Map(), key, today: _SD_TODAY };
      const list = listScorecardRoles(args);
      const tally = tallyRoleFlags(scorecardOpenRoles(f.allRoles, key), activitySinceWeeks(act, 13, _SD_TODAY), {}, _SD_TODAY, { openSince: new Map() });
      _assertEqual([list.flagged.length, list.behind.length], [tally.flagged, tally.behind], 'same counts as tallyRoleFlags');
      _assertEqual(list.flagged.map(r => [r.id, r.title, r.project, r.stage, r.reason]), [['R1', 'Dev', 'Acme & Co', 'Sourcing', 'conversion']], 'one flagged role, with its project and reason');
      _assertEqual(scorecardOpenRoles(f.allRoles, key).map(r => r.id), ['R1'], 'the closed role and Bo\'s role are not Ann\'s open roles');
      _assertEqual(listScorecardRoles(Object.assign({}, args, { activity: [] })).flagged, [], 'no activity, no conversion flag');
      // Stuck: a stage entry long ago puts the role over its budget; with the conversion rule too it is "both".
      const hist = { R1: [{ NewValue: 'Sourcing', Created: '2026-05-01T00:00:00Z' }] };
      const stuck = listScorecardRoles(Object.assign({}, args, { stageHistory: hist }));
      const tallyStuck = tallyRoleFlags(scorecardOpenRoles(f.allRoles, key), activitySinceWeeks(act, 13, _SD_TODAY), hist, _SD_TODAY, { openSince: new Map() });
      _assertEqual(stuck.flagged.length, tallyStuck.flagged, 'still equal to the tally with stage history');
    },
  },
  {
    name: 'N-454 AC8 listScorecardHires: exactly the placements behind the Hires metric, newest first, candidate joined by placement id, multi-TP rows credited',
    fn: function () {
      const f = _sdFixture();
      const period = scorecardPeriod('quarter', _SD_TODAY);
      const rows = listScorecardHires({ placements: f.placements, placementsRaw: f.placementsRaw, allRoles: f.allRoles, allProjects: f.allProjects, period, key: 'a@x.com', today: _SD_TODAY });
      _assertEqual(rows.map(r => r.date), ['2026-11-04', '2026-10-22'], 'newest first; the February hire is outside the quarter; Bo\'s sole placement is not Ann\'s');
      _assertEqual(rows[0], { id: 'R1', title: 'Dev', project: 'Acme & Co', candidate: 'Cara <b>Dee</b>', date: '2026-11-04' }, 'row shape (raw text; escaping is the markup\'s job)');
      _assertEqual(rows[1].candidate, 'Eli Fox', 'a placement shared with another TP is credited (tpMatches)');
      const metric = computeFunnelScorecard([], placementsSinceDay(f.placements, period.fromDay).filter(p => tpMatches(p.tpEmail, 'a@x.com')), _sdBench).find(r => r.label === 'Hires').value;
      _assertEqual(rows.length, metric, 'row count equals the card Hires metric');
      _assertEqual(listScorecardHires({ placements: f.placements, placementsRaw: [], allRoles: f.allRoles, allProjects: f.allProjects, period, key: 'a@x.com', today: _SD_TODAY })[0].candidate, '', 'a placement with no raw row leaves the candidate blank, never throws');
      _assertEqual(listScorecardHires({ placements: f.placements, placementsRaw: f.placementsRaw, allRoles: f.allRoles, allProjects: f.allProjects, period: scorecardPeriod('all', _SD_TODAY), key: 'a@x.com', today: _SD_TODAY }).length, 3, 'all time adds the February hire');
    },
  },
  {
    name: 'N-454 AC1/AC7/AC9 markup: three sections, escaped values, links only for roles that can open the Role page, empty states, no inline style',
    fn: function () {
      const f = _sdFixture();
      const period = scorecardPeriod('quarter', _SD_TODAY);
      const trend = buildScorecardTrend({ activity: f.activity, placements: f.placements, period, bench: _sdBench, key: 'a@x.com', today: _SD_TODAY });
      const hires = listScorecardHires({ placements: f.placements, placementsRaw: f.placementsRaw, allRoles: f.allRoles, allProjects: f.allProjects, period, key: 'a@x.com', today: _SD_TODAY });
      const roles = { flagged: [{ id: 'R1', title: 'Dev <script>', project: 'Acme & Co', stage: 'Sourcing', reason: 'both', daysInStage: 30, stageBudget: 15 }], behind: [{ id: 7, title: 'Slow', project: 'P', stage: 'Offered', daysOpen: 120, paceBudget: 90 }] };
      const html = mmScorecardDetailHtml({ trend, roles, hires, periodLabel: period.label, canLinkRoles: true });
      _assertEqual((html.match(/<h2 class="mmsc-heading">/g) || []).length, 3, 'three sections');
      _assertEqual((html.match(/<svg /g) || []).length, 6, 'one chart per metric');
      _assertEqual(/<script>|<b>Dee/.test(html), false, 'role title and candidate name are escaped');
      _assertEqual(html.indexOf('Cara &lt;b&gt;Dee&lt;/b&gt;') > -1 && html.indexOf('Dev &lt;script&gt;') > -1 && html.indexOf('Acme &amp; Co') > -1, true, 'escaped forms present');
      _assertEqual(/href="reporting\.html#roles\?action=checklist&amp;id=7"/.test(html), true, 'a role links to the Role page by id');
      _assertEqual(/ style=|onclick|#[0-9a-fA-F]{3,6}\b/.test(html.replace(/&#\d+;/g, '')), false, 'no inline style, handler or hex');
      _assertEqual(/Stuck and low conversion/.test(html) && /30 days \(budget 15\)/.test(html), true, 'reason and days in stage');
      _assertEqual(/Behind pace \(information only\)/.test(html), true, 'behind-pace roles are a separate, information-only group');
      const plain = mmScorecardDetailHtml({ trend, roles, hires, periodLabel: period.label, canLinkRoles: false });
      _assertEqual(/action=checklist/.test(plain), false, 'no link when the viewer cannot open the Role page');
      _assertEqual(/>Dev &lt;script&gt;</.test(plain), true, '…but the name is still shown');
      _assertEqual([ 'admin', 'delivery_manager', 'talent_partner', 'leadership', 'people_ops', 'staff', 'sales' ].map(mmCanOpenRolePage), [true, true, true, false, false, false, false], 'only Admin, Delivery Manager and Talent Partner can open the Role page');
      const empty = mmScorecardDetailHtml({ trend: { weeks: [], series: [], weekly: [] }, roles: { flagged: [], behind: [] }, hires: [], periodLabel: 'Rolling quarter', canLinkRoles: true });
      _assertEqual(/No flagged roles/.test(empty) && /No hires in this period \(Rolling quarter\)/.test(empty) && /No weekly activity in this period/.test(empty), true, 'empty states name the period');
      const one = mmTrendChartSvg({ label: 'X', unit: '%', values: [null, 5, null], bench: null }, ['2026-11-01', '2026-11-08', '2026-11-15'], 0);
      _assertEqual(/Not enough data/.test(one) && !/<svg/.test(one), true, 'fewer than two points → a note, no empty chart');
      const gap = mmTrendChartSvg({ label: 'X', unit: '%', values: [10, null, 20, 30], bench: 15 }, ['a', 'b', 'c', 'd'].map((_, i) => '2026-11-0' + (i + 1)), 2);
      _assertEqual(/d="M[^"]* M[^"]*L/.test(gap), true, 'a gap lifts the pen: two segments');
      _assertEqual(/class="mmsc-norm"/.test(gap) && /mmsc-s3/.test(gap), true, 'reference line and series class');
    },
  },
  {
    name: 'N-454 table audit: every row of each new table has as many cells as its header',
    fn: function () {
      const f = _sdFixture();
      const period = scorecardPeriod('quarter', _SD_TODAY);
      const hires = listScorecardHires({ placements: f.placements, placementsRaw: f.placementsRaw, allRoles: f.allRoles, allProjects: f.allProjects, period, key: 'a@x.com', today: _SD_TODAY });
      const roles = { flagged: [{ id: 1, title: 'A', project: '', stage: 'Sourcing', reason: 'stuck', daysInStage: null, stageBudget: null }], behind: [{ id: 2, title: 'B', project: '', stage: 'Offered', daysOpen: null, paceBudget: null }] };
      const html = mmScorecardDetailHtml({ trend: { weeks: [], series: [] }, roles, hires, periodLabel: 'Q', canLinkRoles: true });
      const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
      _assertEqual(tables.length, 3, 'flagged, behind pace and hires');
      tables.forEach((t, k) => {
        const head = (t.match(/<th>/g) || []).length;
        (t.match(/<tr>[\s\S]*?<\/tr>/g) || []).filter(r => /<td>/.test(r)).forEach(r => _assertEqual((r.match(/<td>/g) || []).length, head, 'table ' + k + ' row width'));
      });
    },
  },
  {
    name: 'N-454 AC11/AC12 sources: the read is one request shared with getHistoricalPlacements, mobile is untouched, the detail is My Scorecard only, no hex or inline style in the new CSS',
    fn: function () {
      // getHistoricalPlacementRows is the SAME read getHistoricalPlacements makes (one cache entry).
      const saved = getItems; const calls = [];
      getItems = function (list, filter) { calls.push([list, filter || '']); return Promise.resolve([]); };
      try {
        getHistoricalPlacementRows(); getHistoricalPlacementRows({ allTime: true }); getHistoricalPlacements(); getHistoricalPlacements({ allTime: true });
        const pl = calls.filter(c => c[0] === 'Placements').map(c => c[1]);
        _assertEqual(pl[0], pl[2], 'default window: the raw read and the hires read use the same filter');
        _assertEqual([pl[1], pl[3]], ['', ''], 'all time: no filter in either');
        _assertEqual(/^fields\/OfferAcceptedDate ge '\d{4}-\d{2}-\d{2}'$/.test(pl[0]), true, 'default window is the one-year OfferAcceptedDate bound');
      } finally { getItems = saved; }
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_CSS === 'undefined') _skip('needs ALL_SOURCES / ALL_CSS (tests/run.js)');
      const mob = ALL_SOURCES['mobile-scorecards.js'];
      _assertEqual(/buildScorecardTrend|listScorecardRoles|listScorecardHires|placementsRaw/.test(mob), false, 'mobile-scorecards.js does not use the detail');
      const sc = ALL_SOURCES['my-momentum-scorecard.js'].replace(/\r/g, '');   // the repo files are CRLF
      _assertEqual(/ctx\.kind === 'own' \? _mmScDetailHtml\(/.test(sc), true, 'the detail is appended for My Scorecard only');
      _assertEqual(/_mmScDetailHtml/.test(sc.replace(/function _mmScDetailHtml[\s\S]*?\n}\n/, '').replace(/ctx\.kind === 'own' \? _mmScDetailHtml\(/, '')), false, 'and nowhere else (Team Scorecards never calls it)');
      const mmCss = ALL_CSS['my-momentum.css'].replace(/\r/g, '');
      const css = mmCss.slice(mmCss.indexOf('N-454'));
      _assertEqual(/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'no hex or rgb() in the N-454 CSS');
      _assertEqual((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, 'braces balance');
    },
  },
);