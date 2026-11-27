// tests/assert-report-narrative.js - N-550 (AMCP-6): the Report Library rules in js/report-logic.js and the panels refactor that
// feeds the Claude report tools. Pure checks in the shared vm; the tools themselves run through the real loader, write shim and
// fixture Graph in tests/mcp-report-check.js. Loads after tests/assertions.js and pushes into ASSERTIONS.
// Source-scan assertions skip under tests/index.html, where ALL_SOURCES / MCP_SOURCES are not defined.
//
// The three _n550Ref* functions below are the ORIGINAL renderKPIStrip / renderProjectLongOpenRolesPanel / renderUpcomingStartersPanel,
// copied byte for byte from js/dashboard-project-panels.js as it stood before N-550 (only the name differs). They are the oracle for
// "the refactor changed no markup" (AC14): the live functions must return the same string for the same inputs.

function _n550RefKpiStrip(roles, activity, period, placements = [], hc = null) {
  hc = hc || dashboardHeadcountContext(roles, placements, null);
  const openPipelines = roles.filter(r => isOpenPipelineStage(r.Stage));
  const activePipelines  = openPipelines.length;
  // S-4: one placement = one filled headcount. Counted against `roles` so a
  // caller passing an unscoped placements list (RB company scope) can't inflate it.
  const roleIdSet    = new Set(roles.map(r => String(r.id)));
  const totalHires   = placements.filter(p => roleIdSet.has(String(p.RoleIDLookupId)) || roleIdSet.has(String(p.RoleID))).length;
  const backlogPipelines = roles.filter(r => r.Stage === 'Backlog').length;
  const avgOpenDays  = avgOpenHeadcountDays(openPipelines, hc.headcount, hc.fillMap);
  // N-311 (S-2): open, dated headcount on the active pipelines; "—" when the
  // headcount read failed.
  const openHeadcount        = openHeadcountCount(openPipelines, hc.headcount, hc.fillMap);
  const openHeadcountDisplay = openHeadcount !== null ? openHeadcount : '—';
  const acts      = activity.filter(a => activityInKpiPeriod(a, period));
  const submitted = sumField(acts, 'Submitted');
  const int1      = sumField(acts, 'Interview1');
  const offers    = sumField(acts, 'Offers');
  const hires     = sumField(acts, 'Hires');
  const convPct  = submitted > 0 ? Math.round((int1 / submitted) * 100) : null;
  const ivOfferR = offers > 0    ? Math.round(int1 / offers)            : null;
  const offerPct = offers > 0    ? Math.round((hires / offers) * 100)   : null;
  const cur         = hireKpisForPeriod(hc.hires, 'this_' + period);
  const avgDays     = cur ? cur.avgDays : null;
  const onTimePct   = cur ? cur.onTimePct : null;
  const prevPeriod = getPreviousPeriod(period);
  const prevRange  = prevPeriod ? getDetailPeriodRange(prevPeriod) : null;
  const prevHireKpis = hireKpisForPeriod(hc.hires, prevPeriod);
  let prevConvPct = null, prevIvOfferR = null, prevOfferPct = null;
  const prevAvgDays   = prevHireKpis ? prevHireKpis.avgDays : null;
  const prevOnTimePct = prevHireKpis ? prevHireKpis.onTimePct : null;
  if (prevRange) {
    const prevActs = activity.filter(a => {
      const date = a.WeekEndingDate
        ? new Date(a.WeekEndingDate)
        : weekEndingDate(Number(a.Year), Number(a.WeekNumber));
      return date >= prevRange.start && date <= prevRange.end;
    });
    const pSubmitted = sumField(prevActs, 'Submitted');
    const pInt1      = sumField(prevActs, 'Interview1');
    const pOffers    = sumField(prevActs, 'Offers');
    const pHires     = sumField(prevActs, 'Hires');
    prevConvPct  = pSubmitted > 0 ? Math.round((pInt1 / pSubmitted) * 100) : null;
    prevIvOfferR = pOffers > 0    ? Math.round(pInt1 / pOffers)            : null;
    prevOfferPct = pOffers > 0    ? Math.round((pHires / pOffers) * 100)   : null;
  }
  const periodLabel  = period === 'month' ? 'this month' : period === 'quarter' ? 'this quarter' : 'this year';
  const convDisplay  = convPct  !== null ? convPct + '%'   : '—';
  const ivDisplay    = ivOfferR !== null ? ivOfferR + ':1' : '—';
  const offerDisplay = offerPct !== null ? offerPct + '%'  : '—';
  const daysDisplay  = avgDays  !== null ? avgDays         : '—';
  const otDisplay    = onTimePct !== null ? onTimePct + '%' : '—';
  const avgOpenDaysDisplay = avgOpenDays !== null ? avgOpenDays : '—';
  const convDelta  = kpiDelta(convPct,  prevConvPct,  false, true);
  const ivDelta    = kpiDelta(ivOfferR, prevIvOfferR, true,  false);
  const offerDelta = kpiDelta(offerPct, prevOfferPct, false, true);
  const daysDelta  = kpiDelta(avgDays,  prevAvgDays,  true,  false);
  const otDelta    = kpiDelta(onTimePct,prevOnTimePct,false, true);
  return `
    <div class='kpi-strip'>
      ${kpiCard('Active Pipelines', activePipelines, 'current')}
      ${kpiCard('Open Headcount', openHeadcountDisplay, 'current')}
      ${kpiCard('Pipeline Backlog', backlogPipelines, 'current')}
      ${kpiCard('Avg Days Open', avgOpenDaysDisplay, 'current')}
      ${kpiCard('Hires to Date', totalHires, 'all time')}
    </div>
    <div class='kpi-strip kpi-strip-period'>
      ${kpiCard('Submission Conversion', convDisplay + convDelta,   periodLabel)}
      ${kpiCard('IV to Offer Ratio',     ivDisplay   + ivDelta,     periodLabel)}
      ${kpiCard('Offer Success',         offerDisplay + offerDelta, periodLabel)}
      ${kpiCard('Avg Days to Hire',      daysDisplay  + daysDelta,  `per hire · ${periodLabel}`)}
      ${kpiCard('Hired On Time',         otDisplay    + otDelta,    `by target hire date · ${periodLabel}`)}
    </div>`;
}
function _n550RefLongOpen(roles, tpMap = {}, openSince = null) {
  const longOpen = roles
    .map(r => ({ r, day: pipelineOpenDay(r, openSince) }))
    .filter(({ r, day }) => isOpenPipelineStage(r.Stage) && day && daysOpen(day) >= 30)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (!longOpen.length) return `<div class='dash-panel'>
    <h3 class='panel-title'>Roles Open 30+ Days</h3>
    ${emptyStateBlock({ icon: 'briefcase', message: 'No roles open 30+ days.' })}
  </div>`;
  const rows = longOpen.map(({ r, day }) => {
    const days = daysOpen(day);
    // N-257b: no whole-row tint — the Days Open cell carries the flag instead.
    return `<tr>
     <td>${escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)}</td>
     <td>${escHtml(tpDisplay(r.TalentPartner, tpMap))}</td>
     <td><span class='badge'>${escHtml(r.Stage)}</span></td>
     <td>${ragTextHTML(days >= 45 ? 'red' : 'amber', days + ' days')}</td>
    </tr>`;
  }).join('');
  return `<div class='dash-panel'>
    <h3 class='panel-title'>Roles Open 30+ Days</h3>
    <div class="table-scroll">
    <table class='data-table'>
      <thead><tr><th>Role</th><th>Talent Partner</th><th>Stage</th><th>Days Open</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}
function _n550RefStarters(placements, roles) {
  const roleMap = Object.fromEntries(roles.map(r => [String(r.id), escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)]));
  const today   = new Date(); today.setHours(0,0,0,0);
  const upcoming = placements
    .filter(p => p.ProvisionalStartDate && new Date(p.ProvisionalStartDate) >= today)
    .sort((a, b) => new Date(a.ProvisionalStartDate) - new Date(b.ProvisionalStartDate));
  if (!upcoming.length) return `<div class='dash-panel'><h3 class='panel-title'>Upcoming Starters</h3>${emptyStateBlock({ icon: 'calendar', message: 'No upcoming starters.' })}</div>`;
  const rows = upcoming.map(p =>
    `<tr><td>${escHtml(p.CandidateName)}</td><td>${roleMap[String(p.RoleIDLookupId)] || roleMap[String(p.RoleID)] || '—'}</td><td>${spDateIn(p.ProvisionalStartDate) || '—'}</td></tr>`
  ).join('');
  return `<div class='dash-panel'><h3 class='panel-title'>Upcoming Starters</h3>
    <div class="table-scroll">
    <table class='data-table'>
      <thead><tr><th>Candidate</th><th>Role</th><th>Start Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}

// The Report Library's visibility rule exactly as _rbVisibleReports had it before N-550 (reference for reportVisibleTo).
function _n550RefVisible(role, email, projectIds, r) {
  if (role === 'admin') return true;
  const me = (email || '').toLowerCase();
  const mine = (r.ReportOwner || '').toLowerCase() === me;
  const onProj = r.Scope === 'project' && (projectIds || []).includes(String(r.ProjectID));
  if (role === 'delivery_manager') return r.Scope === 'company' || mine || onProj;
  return r.Scope === 'project' && (mine || onProj);
}

function _n550Today(offsetDays) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offsetDays);
  return d;
}
function _n550Iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _n550FnText(src, name) {
  const s = src.indexOf('function ' + name + '(');
  if (s === -1) throw new Error(name + ' not found');
  return src.slice(s, src.indexOf('\n}\n', s) + 2);
}
function _n550Live(name) {   // the live function, evaluated from the page file's source (dashboard-project-panels.js is not unit-loaded)
  return (0, eval)('(' + _n550FnText(ALL_SOURCES['dashboard-project-panels.js'], name) + ')');
}

// Inputs for the panel equivalence checks: roles, activity, placements and headcount relative to today.
function _n550PanelInputs() {
  const roles = [
    { id: 1, ProjectIDLookupId: 101, RoleTitle: 'Backend Engineer', Location: 'Lisbon', Stage: 'Sourcing', TalentPartner: 'a@x.co', OpenDate: _n550Iso(_n550Today(-50)) },
    { id: 2, ProjectIDLookupId: 101, RoleTitle: 'Data <Analyst>', Location: '', Stage: 'Submitted', TalentPartner: 'a@x.co;b@x.co', OpenDate: _n550Iso(_n550Today(-35)) },
    { id: 3, ProjectIDLookupId: 101, RoleTitle: 'QA', Stage: 'Backlog', TalentPartner: '', OpenDate: _n550Iso(_n550Today(-3)) },
    { id: 4, ProjectIDLookupId: 101, RoleTitle: 'Closed one', Stage: 'Closed', TalentPartner: 'b@x.co', OpenDate: _n550Iso(_n550Today(-90)) },
    { id: 5, ProjectIDLookupId: 101, RoleTitle: 'Old hold', Stage: 'On-hold', TalentPartner: 'b@x.co', OpenDate: _n550Iso(_n550Today(-90)) },
  ];
  const wk = n => _n550Iso(_n550Today(-7 * n)) + 'T00:00:00Z';
  const yw = n => ({ Year: _n550Today(-7 * n).getFullYear(), WeekNumber: getISOWeek(_n550Today(-7 * n)) });   // renderKPIStrip filters on Year / WeekNumber
  const activity = [
    { RoleIDLookupId: 1, WeekEndingDate: wk(0), ...yw(0), Outreach: 30, Responses: 6, Screened: 5, Submitted: 4, Interview1: 2, Interview2Plus: 1, FinalInterview: 0, Offers: 1, Hires: 1 },
    { RoleIDLookupId: 2, WeekEndingDate: wk(1), ...yw(1), Outreach: 20, Responses: 5, Screened: 4, Submitted: 3, Interview1: 1, Interview2Plus: 0, FinalInterview: 0, Offers: 1, Hires: 0 },
    { RoleIDLookupId: 2, WeekEndingDate: wk(6), ...yw(6), Outreach: 20, Responses: 5, Screened: 4, Submitted: 3, Interview1: 2, Interview2Plus: 1, FinalInterview: 1, Offers: 2, Hires: 1 },
    { RoleIDLookupId: 1, WeekEndingDate: wk(20), ...yw(20), Outreach: 9, Responses: 1, Screened: 1, Submitted: 1, Interview1: 1, Interview2Plus: 0, FinalInterview: 0, Offers: 0, Hires: 0 },
  ];
  const placements = [
    { id: 11, RoleIDLookupId: 1, CandidateName: 'Cand <One>', OfferAcceptedDate: _n550Iso(_n550Today(-10)), ProvisionalStartDate: _n550Iso(_n550Today(12)), HeadcountID: null },
    { id: 12, RoleIDLookupId: 2, CandidateName: 'Cand Two', OfferAcceptedDate: _n550Iso(_n550Today(-80)), ProvisionalStartDate: _n550Iso(_n550Today(-60)), HeadcountID: null },
    { id: 13, RoleIDLookupId: 1, CandidateName: 'Cand Three', OfferAcceptedDate: _n550Iso(_n550Today(-5)), ProvisionalStartDate: _n550Iso(_n550Today(3)), HeadcountID: null },
  ];
  const headcount = [
    { id: 21, RoleID: 1, Status: 'Open', OpenDate: _n550Iso(_n550Today(-50)), TargetHireDate: _n550Iso(_n550Today(5)) },
    { id: 22, RoleID: 2, Status: 'Open', OpenDate: _n550Iso(_n550Today(-35)) },
    { id: 23, RoleID: 2, Status: 'Open' },
  ];
  return { roles, activity, placements, headcount };
}

ASSERTIONS.push(
  {
    name: 'N-550 AC1 reportVisibleTo equals the Report Library rule it replaced, for every role x report x owner x project combination; the Library filter calls it',
    fn: function () {
      const reports = [];
      ['project', 'company'].forEach(function (scope) {
        ['101', '102', ''].forEach(function (pid) {
          ['tp.one@mg.co', 'dm.one@mg.co', 'someone@else.co', ''].forEach(function (owner) {
            reports.push({ Scope: scope, ProjectID: pid, ReportOwner: owner });
          });
        });
      });
      let n = 0;
      ['admin', 'delivery_manager', 'talent_partner', 'leadership'].forEach(function (role) {
        ['tp.one@mg.co', 'DM.One@mg.co'].forEach(function (email) {
          [['101'], ['102'], [], null].forEach(function (ids) {
            reports.forEach(function (r) {
              _assertEqual(reportVisibleTo(role, email, ids, r), _n550RefVisible(role, email, ids, r), role + ' ' + email + ' ' + JSON.stringify(ids) + ' ' + JSON.stringify(r));
              n++;
            });
          });
        });
      });
      _assertEqual(n > 500, true, 'matrix size');
      if (typeof ALL_SOURCES === 'undefined') return;
      const rb = ALL_SOURCES['report-builder.js'];
      const f = _n550FnText(rb, '_rbVisibleReports');
      _assertEqual(f.includes('reportVisibleTo(_resolvedRole, email, projectIds, r)'), true, 'the Library filter calls the shared rule');
      _assertEqual(/ReportOwner|\.Scope\b/.test(f.replace(/\/\/.*$/gm, '')), false, 'no second copy of the rule in report-builder.js');
    },
  },
  {
    name: 'N-550 AC2 reportBlocks / reportLayout: markers skipped, positions 1-based, panel labels from RB_PALETTE, bad JSON throws a plain message',
    fn: function () {
      const json = JSON.stringify([{ type: 'titlePage' }, { id: 'a', type: 'text', content: '<p>x</p>' }, { type: 'hiringPlan' }, { id: 'b', type: 'panel', key: 'kpiStrip' }, { id: 'c', type: 'text' }]);
      const lay = reportLayout(reportBlocks(json));
      _assertEqual(lay.map(function (x) { return [x.position, x.type, x.id]; }), [[1, 'text', 'a'], [2, 'panel', 'b'], [3, 'text', 'c']], 'layout');
      _assertEqual(lay[1].label, 'KPI Strip', 'panel label from the palette');
      _assertEqual(lay[2].html, '', 'a text block with no content reads empty');
      _assertEqual(reportTextBlocks(reportBlocks(json)).map(function (t) { return [t.blockId, t.after]; }), [['a', 'top of report'], ['c', 'KPI Strip']], 'after = the panel above');
      let threw = '';
      try { reportBlocks('{not json'); } catch (e) { threw = e.message; }
      _assertEqual(threw, "This report's layout could not be read.", 'bad JSON');
      threw = '';
      try { reportBlocks('{"a":1}'); } catch (e) { threw = e.message; }
      _assertEqual(threw, "This report's layout could not be read.", 'not an array');
    },
  },
  {
    name: 'N-550 AC7 reportTextToHtml escapes first and builds only h3 / ul / li / p / br: markup, quotes and ampersands in the text come out inert; paragraphs, headings and bullets map; text -> html -> text is stable',
    fn: function () {
      const hostile = '<script>alert(1)</script> & "q" \'s\' <img src=x onerror=alert(1)>';
      const html = reportTextToHtml(hostile);
      _assertEqual(html, '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot; &#39;s&#39; &lt;img src=x onerror=alert(1)&gt;</p>', 'hostile text');
      _assertEqual(/<(?!\/?(p|h3|ul|li|br)\b)[a-z]/i.test(html), false, 'no tag but p / h3 / ul / li / br');
      _assertEqual(reportTextToHtml('## Heading <b>\n\nPara one\nline two\n\n- a\n- b & c\n\nAfter'),
        '<h3>Heading &lt;b&gt;</h3><p>Para one<br>line two</p><ul><li>a</li><li>b &amp; c</li></ul><p>After</p>', 'structure');
      const text = '## Summary\n\nFour submissions & one interview.\n\n- Backend Engineer\n- Data Analyst\n\nNext: chase.';
      _assertEqual(reportHtmlToText(reportTextToHtml(text)), text, 'round trip');
      _assertEqual(reportTextToHtml('   \n\n  '), '', 'blank text -> empty html');
      _assertEqual(reportHtmlToText('<h3>Summary</h3><p>Last week: 4 submissions &amp; 1 interview.</p><ul><li>One</li><li>Two</li></ul><div>Tail<br>line</div>'),
        '## Summary\n\nLast week: 4 submissions & 1 interview.\n\n- One\n- Two\n\nTail\nline', 'toolbar HTML to plain text');
      _assertEqual(reportHtmlToText('<p>a&nbsp;b &lt;i&gt; &#65;&#x42;</p>'), 'a b <i> AB', 'entities');
    },
  },
  {
    name: 'N-550 AC10 reportReplaceTextBlocks changes only the named text blocks (content + source:claude); every other block, marker, key and order is byte-identical; a panel or unknown id throws',
    fn: function () {
      const blocks = [{ type: 'titlePage' }, { id: 't1', type: 'text', content: '<p>old 1</p>' }, { id: 'p1', type: 'panel', key: 'kpiStrip', extra: { n: [1, 2] } }, { id: 't2', type: 'text', content: '<p>old 2</p>', keep: true }, { id: 'p2', type: 'panel', key: 'candidateSnapshot', rows: [{ name: 'ZZQ-SNAP-NAME' }] }];
      const json = JSON.stringify(blocks);
      const out = reportReplaceTextBlocks(json, [{ blockId: 't2', content: '<p>new 2</p>' }], 'claude');
      const expected = JSON.parse(json);
      expected[3].content = '<p>new 2</p>';
      expected[3].source = 'claude';
      _assertEqual(out, JSON.stringify(expected), 'only t2 content + source changed');
      const both = JSON.parse(reportReplaceTextBlocks(json, [{ blockId: 't1', content: 'A' }, { blockId: 't2', content: 'B' }], 'claude'));
      _assertEqual([both[1].content, both[1].source, both[3].content, both[3].source], ['A', 'claude', 'B', 'claude'], 'two blocks');
      _assertEqual(JSON.stringify(both[2]) + JSON.stringify(both[4]) + JSON.stringify(both[0]), JSON.stringify(blocks[2]) + JSON.stringify(blocks[4]) + JSON.stringify(blocks[0]), 'panels and marker untouched');
      ['p1', 'nope', 't9'].forEach(function (id) {
        let threw = false;
        try { reportReplaceTextBlocks(json, [{ blockId: id, content: 'x' }], 'claude'); } catch (e) { threw = true; }
        _assertEqual(threw, true, id + ' is not a text block');
      });
      _assertEqual(json, JSON.stringify(blocks), 'input not mutated (a string)');
    },
  },
  {
    name: 'N-550 AC3 reportPeriodWindow: a detail-period key gives concrete start / end days relative to today; an unknown key reads as this month, like getDetailPeriodRange',
    fn: function () {
      const w = reportPeriodWindow('this_week');
      _assertEqual([w.key, /^\d{4}-\d{2}-\d{2}$/.test(w.start), /^\d{4}-\d{2}-\d{2}$/.test(w.end), w.start <= w.end], ['this_week', true, true, true], 'this_week');
      const r = getDetailPeriodRange('this_week');
      _assertEqual([w.start, w.end], [localDayISO(r.start), localDayISO(r.end)], 'same range the dashboards use');
      _assertEqual(w.label, (DETAIL_PERIOD_OPTIONS.find(function (o) { return o[0] === 'this_week'; }) || [])[1], 'label from DETAIL_PERIOD_OPTIONS');
      _assertEqual(reportPeriodWindow('no_such_period').key, 'this_month', 'unknown key');
      _assertEqual(reportPeriodWindow(undefined).key, 'this_month', 'missing key');
    },
  },
  {
    name: 'N-550 AC14 the panels refactor changes no markup: renderKPIStrip, renderProjectLongOpenRolesPanel and renderUpcomingStartersPanel return exactly what the pre-N-550 functions returned, for populated, empty and headcount-less inputs',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      const live = { kpi: _n550Live('renderKPIStrip'), long: _n550Live('renderProjectLongOpenRolesPanel'), starters: _n550Live('renderUpcomingStartersPanel') };
      const I = _n550PanelInputs();
      const hcFull = dashboardHeadcountContext(I.roles, I.placements, I.headcount);
      const hcNull = dashboardHeadcountContext(I.roles, I.placements, null);
      const cases = [
        ['populated, headcount', I.roles, I.activity, I.placements, hcFull],
        ['populated, headcount read failed', I.roles, I.activity, I.placements, hcNull],
        ['populated, hc omitted', I.roles, I.activity, I.placements, null],
        ['empty', [], [], [], null],
        ['no activity', I.roles, [], I.placements, hcFull],
      ];
      let compared = 0;
      cases.forEach(function (c) {
        ['month', 'quarter', 'year'].forEach(function (period) {
          const want = _n550RefKpiStrip(c[1], c[2], period, c[3], c[4]);
          _assertEqual(live.kpi(c[1], c[2], period, c[3], c[4]), want, 'renderKPIStrip ' + c[0] + ' ' + period);
          compared++;
        });
        const tp = { 'a@x.co': 'Ann A', 'b@x.co': 'Bob B' };
        const os = c[4] ? c[4].openSince : null;
        _assertEqual(live.long(c[1], tp, os), _n550RefLongOpen(c[1], tp, os), 'long open ' + c[0]);
        _assertEqual(live.starters(c[3], c[1]), _n550RefStarters(c[3], c[1]), 'starters ' + c[0]);
        compared += 2;
      });
      _assertEqual(compared, 25, 'cases compared');
      // positive control: the oracle really does see a difference when the numbers move
      _assertEqual(_n550RefKpiStrip(I.roles, I.activity, 'quarter', I.placements, hcFull) === _n550RefKpiStrip(I.roles, [], 'quarter', I.placements, hcFull), false, 'control: the oracle is sensitive to the activity');
    },
  },
  {
    name: 'N-550 kpiStripModel / longOpenPipelines / upcomingStarterPlacements: the model carries the numbers the strip formats; the row helpers return the rows the panels render',
    fn: function () {
      const I = _n550PanelInputs();
      const hc = dashboardHeadcountContext(I.roles, I.placements, I.headcount);
      const m = kpiStripModel(I.roles, I.activity, 'quarter', I.placements, hc);
      _assertEqual([m.activePipelines, m.backlogPipelines, m.totalHires], [I.roles.filter(function (r) { return isOpenPipelineStage(r.Stage); }).length, 1, 3], 'counts');
      _assertEqual(m.openHeadcount, openHeadcountCount(I.roles.filter(function (r) { return isOpenPipelineStage(r.Stage); }), hc.headcount, hc.fillMap), 'open headcount');
      _assertEqual(kpiStripModel(I.roles, I.activity, 'quarter', I.placements, dashboardHeadcountContext(I.roles, I.placements, null)).openHeadcount, null, 'headcount read failed -> null (the strip shows a dash)');
      _assertEqual(Object.keys(m.prev), ['convPct', 'ivOfferR', 'offerPct', 'avgDays', 'onTimePct'], 'previous-period keys');
      const lo = longOpenPipelines(I.roles, hc.openSince, 30);
      _assertEqual(lo.map(function (x) { return x.r.id; }), [1, 2], 'open 30+ days, oldest first');
      _assertEqual(lo.every(function (x) { return x.days >= 30; }), true, 'days');
      _assertEqual(upcomingStarterPlacements(I.placements).map(function (p) { return p.id; }), [13, 11], 'upcoming starters, soonest first; a past start is out');
    },
  },
  {
    name: 'N-550 AC15 source: the report tools file is clean under lintMcpWriteTools (updateSavedReport only in the named commit); createSavedReport is not an approved writer; a writer in a preview, a getter outside MCP_GETTER_LISTS and a spread each fail',
    fn: function () {
      _assertEqual(MCP_APPROVED_WRITERS.indexOf('createSavedReport'), -1, 'no createSavedReport (Claude never creates a report)');
      _assertEqual(MCP_APPROVED_WRITERS.indexOf('updateSavedReport') > -1, true, 'updateSavedReport approved');
      _assertEqual(MCP_GETTER_LISTS.getSavedReports, ['SavedReports'], 'getSavedReports registered');
      _assertEqual(CONFIG.MCP.allowedLists.indexOf('SavedReports') > -1, true, 'SavedReports readable');
      const rules = function (s) { return lintMcpWriteTools(s, CONFIG).map(function (v) { return v.rule; }); };
      const base = 'async function rc(plan, ctx) {\n  await updateSavedReport(plan.id, { ModuleOrder: "x" });\n  return 1;\n}\nMCP_TOOLS.push({ name: "t", roles: ["admin"], write: true, preview: rp, commit: rc });\nasync function rp(a) { return { summary: "s", changes: [], plan: {} }; }\n';
      _assertEqual(rules(base), [], 'updateSavedReport in the commit');
      _assertEqual(rules(base.replace('await updateSavedReport(plan.id, { ModuleOrder: "x" });', 'await createSavedReport({ Title: "x" });')), ['write'], 'createSavedReport in the commit');
      _assertEqual(rules(base.replace('return { summary: "s", changes: [], plan: {} };', 'await updateSavedReport(1, {}); return {};')), ['write'], 'updateSavedReport in a preview');
      _assertEqual(rules(base + 'async function h() { return getBriefingPacks(); }\n'), ['getter'], 'a getter outside MCP_GETTER_LISTS');
      _assertEqual(rules(base + 'function s(r) { return { ...r }; }\n'), ['spread'], 'spread');
      if (typeof MCP_SOURCES === 'undefined') _skip('Source scan needs filesystem access - runs under node tests/run.js.');
      _assertEqual(lintMcpWriteTools(MCP_SOURCES['newton-report-tools.js'], CONFIG).map(function (v) { return v.line + ' ' + v.rule + ': ' + v.problem; }), [], 'lintMcpWriteTools on mcp/newton-report-tools.js');
    },
  },
  {
    name: 'N-550 AC16 no contract bump, no new SharePoint column, nothing under mcp/bootstrap/: CONFIG.MCP.contract stays 2; writeLists.SavedReports updates ModuleOrder only (no create); the tools read no key outside the SavedReports columns the Library already uses',
    fn: function () {
      _assertEqual(CONFIG.MCP.contract, 2, 'contract');
      _assertEqual(CONFIG.MCP.writeLists.SavedReports, { update: ['ModuleOrder'] }, 'ModuleOrder only, never a create');
      _assertEqual(CONFIG.MCP.outputDenyFields.SavedReports, ['ModuleOrder'], 'ModuleOrder is never returned raw');
      _assertEqual([CONFIG.MCP.maxNarrativeEdits, CONFIG.MCP.maxNarrativeChars], [6, 4000], 'limits');
      if (typeof MCP_SOURCES === 'undefined') _skip('Source scan needs filesystem access - runs under node tests/run.js.');
      const src = MCP_SOURCES['newton-report-tools.js'].replace(/\/\/.*$/gm, '');
      const cols = (src.match(/\b(?:report|r|again)\.([A-Z][A-Za-z]+)\b/g) || []).map(function (x) { return x.split('.')[1]; });
      const known = ['Title', 'ProjectID', 'RoleID', 'Period', 'KpiPeriod', 'ModuleOrder', 'Scope', 'ReportOwner', 'CustomerName', 'Stage', 'TalentPartner', 'RoleTitle'];
      _assertEqual(cols.filter(function (c) { return known.indexOf(c) === -1; }), [], 'only known columns are read');
    },
  },
);
