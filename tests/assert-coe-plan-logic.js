// tests/assert-coe-plan-logic.js - N-555 (AMCP-9): js/coe-plan-logic.js, the pure Hiring Plan logic the page, the Report Builder
// export and Newton for Claude's hiring_plan tool all call. The seven moved functions keep their own assertions (assert-headcount.js,
// assert-dates.js: coeWeekVariance, computePlanSpans, coeMonday, coeWeekIndex, coeOpensByMonth); this file checks what is new
// (coePlanActuals, coeHiresModel, coePlanPosition) and the extraction itself. The tools run through the real loader in
// tests/mcp-plan-check.js. Loads after tests/assertions.js and pushes into ASSERTIONS. Source-scan assertions skip under
// tests/index.html, where ALL_SOURCES is not defined.
//
// _n555RefActuals is the ORIGINAL inline `actuals` computation of coeGanttHtml, copied byte for byte from js/coe-plan.js as it
// stood before N-555 (only the function wrapper and name differ). It is the oracle for "the extraction changed no behaviour".

function _n555RefActuals(rows, headcount, placements, hasActuals, now) {
  const hcById  = Object.fromEntries((hasActuals ? headcount : []).map(h => [String(h.id), h]));
  const fillMap = headcountFillMap(hasActuals ? placements : []);
  const actuals = rows.map(row => {
    const hc = hasActuals && !_isBlankId(row.LinkedHeadcountID)
      ? (hcById[String(row.LinkedHeadcountID)] || null) : null;
    return { hc, spans: hc ? coeHeadcountActualSpans(hc, fillMap.get(String(hc.id)), now) : null };
  });
  return actuals;
}

// A plan of six rows against reality, read on 2026-06-10 (a Wednesday). Defaults: R 7, N 4, O 6 weeks.
//   1  opened early (-1 wk), offer accepted 1 May, started 1 Jun        -> started
//   2  opened late (+1 wk), offer accepted 20 May, start 22 Jun (ahead) -> hired
//   3  opened on plan, no offer yet                                      -> open
//   4  unlinked, planned 4 May: overdue                                  -> late (running +5)
//   5  unlinked, planned 6 Jul: not due                                  -> planned
//   6  headcount cancelled on 1 Apr                                      -> cancelled
function _n555Plan() {
  const row = (id, open, extra) => Object.assign({ id: id, Title: 'Role ' + id, TalentPartner: 'tp.one@mg.co', OpenDate: open + 'T12:00:00Z', LinkedHeadcountID: null, LinkedRoleID: null, SortOrder: id }, extra || {});
  const hc = (id, open, extra) => Object.assign({ id: id, RoleID: 490 + id, Status: 'Open', OpenDate: open ? open + 'T12:00:00Z' : null }, extra || {});
  return {
    rows: [
      row(1, '2026-03-16', { LinkedHeadcountID: 11, LinkedRoleID: 501 }),
      row(2, '2026-03-30', { LinkedHeadcountID: 12, LinkedRoleID: 502 }),
      row(3, '2026-04-13', { LinkedHeadcountID: 13, LinkedRoleID: 503 }),
      row(4, '2026-05-04'),
      row(5, '2026-07-06'),
      row(6, '2026-03-02', { LinkedHeadcountID: 14, LinkedRoleID: 504 }),
    ],
    headcount: [
      hc(11, '2026-03-12'), hc(12, '2026-04-08'), hc(13, '2026-04-13'),
      hc(14, '2026-03-02', { Status: 'Cancelled', CancelledDate: '2026-04-01T12:00:00Z' }),
    ],
    placements: [
      { id: 21, HeadcountID: 11, OfferAcceptedDate: '2026-05-01T12:00:00Z', ProvisionalStartDate: '2026-06-01T12:00:00Z' },
      { id: 22, HeadcountID: 12, OfferAcceptedDate: '2026-05-20T12:00:00Z', ProvisionalStartDate: '2026-06-22T12:00:00Z' },
    ],
    asOf: new Date(2026, 5, 10, 12),
  };
}

ASSERTIONS.push(
  {
    name: 'N-555 AC1 extraction: coe-plan-logic.js holds the seven moved functions and the three new ones, with no DOM / Graph; coe-plan.js no longer declares the moved ones',
    fn: function () {
      const moved = ['coeMonday', 'coeAddWeeks', 'coeWeekIndex', 'coeWeekVariance', 'computePlanSpans', 'coeSortRows', 'coeOpensModel'];
      const added = ['coePlanActuals', 'coeHiresModel', 'coePlanPosition'];
      moved.concat(added).forEach(function (n) { _assertEqual(typeof globalThis[n], 'function', n + ' is loaded'); });
      if (typeof ALL_SOURCES === 'undefined') _skip('Source scan needs filesystem access - runs under node tests/run.js.');
      const logic = ALL_SOURCES['coe-plan-logic.js'];
      const page = ALL_SOURCES['coe-plan.js'];
      moved.concat(added).forEach(function (n) {
        _assertEqual((logic.match(new RegExp('^function ' + n + '\\(', 'gm')) || []).length, 1, n + ' declared once in coe-plan-logic.js');
      });
      moved.forEach(function (n) { _assertEqual(new RegExp('^(async )?function ' + n + '\\(', 'm').test(page), false, n + ' is not declared in coe-plan.js'); });
      const code = logic.replace(/\/\/.*$/gm, '');
      _assertEqual(/\b(document|window|navigator|localStorage|sessionStorage|getItems|getItem|graphRequest|fetch)\b/.test(code), false, 'no DOM, Graph or transport in the logic file');
      _assertEqual(/\bcoeGanttHtml\(/.test(page) && /coePlanActuals\(/.test(page), true, 'the page calls coePlanActuals');
    },
  },
  {
    name: 'N-555 AC3 coePlanActuals reproduces the page\'s former inline actuals: offer, open with no offer, unlinked, cancelled, two placements (earliest offer), headcount not read',
    fn: function () {
      const p = _n555Plan();
      const now = new Date(2026, 5, 10, 12);
      const two = p.placements.concat([{ id: 23, HeadcountID: 11, OfferAcceptedDate: '2026-04-20T12:00:00Z', ProvisionalStartDate: '2026-05-25T12:00:00Z' }]);
      [[p.headcount, p.placements, true], [p.headcount, two, true], [p.headcount, p.placements, false], [[], [], true]].forEach(function (c, i) {
        _assertEqual(coePlanActuals(p.rows, c[2] ? c[0] : null, c[1], now), _n555RefActuals(p.rows, c[0], c[1], c[2], now), 'scenario ' + (i + 1));
      });
      const a = coePlanActuals(p.rows, p.headcount, two, now);
      _assertEqual(a[0].spans.nStart, '2026-04-20T12:00:00Z', 'two placements: the earliest offer');
      _assertEqual(a[3], { hc: null, spans: null }, 'an unlinked row has no actual');
      _assertEqual(coePlanActuals(p.rows, null, p.placements, now).every(function (x) { return x.hc === null && x.spans === null; }), true, 'headcount not read: no actuals');
    },
  },
  {
    name: 'N-555 AC8 coePlanPosition rows: planned days as the Gantt derives them, actual days, variance and status for started / hired / open / late / planned / cancelled',
    fn: function () {
      const p = _n555Plan();
      const pos = coePlanPosition({ planRows: p.rows, headcount: p.headcount, placements: p.placements, asOf: p.asOf });
      _assertEqual(pos.asOfDay, '2026-06-10', 'asOfDay');
      _assertEqual(pos.hasActuals, true, 'hasActuals');
      const pick = function (r) { return [r.status, r.openVariance, r.plannedOpenDay, r.plannedHireDay, r.plannedStartDay, r.plannedOnboardedDay, r.actualOpenDay, r.hireConfirmedDay, r.startedDay]; };
      _assertEqual(pos.rows.map(function (r) { return r.rowId; }), [1, 2, 3, 4, 5, 6], 'sorted as the Gantt');
      _assertEqual(pick(pos.rows[0]), ['started', { weeks: -1, final: true }, '2026-03-16', '2026-05-04', '2026-06-01', '2026-07-13', '2026-03-12', '2026-05-01', '2026-06-01'], 'row 1');
      _assertEqual(pick(pos.rows[1]), ['hired', { weeks: 1, final: true }, '2026-03-30', '2026-05-18', '2026-06-15', '2026-07-27', '2026-04-08', '2026-05-20', null], 'row 2: a start date after asOf is not a start');
      _assertEqual(pick(pos.rows[2]), ['open', { weeks: 0, final: true }, '2026-04-13', '2026-06-01', '2026-06-29', '2026-08-10', '2026-04-13', null, null], 'row 3');
      _assertEqual(pick(pos.rows[3]), ['late', { weeks: 5, final: false }, '2026-05-04', '2026-06-22', '2026-07-20', '2026-08-31', null, null, null], 'row 4: overdue, running variance');
      _assertEqual(pick(pos.rows[4]), ['planned', null, '2026-07-06', '2026-08-24', '2026-09-21', '2026-11-02', null, null, null], 'row 5: not due');
      _assertEqual(pos.rows[5].status, 'cancelled', 'row 6');
      _assertEqual([pos.rows[0].title, pos.rows[0].talentPartner, pos.rows[0].linkedHeadcountId, pos.rows[0].linkedRoleId, pos.rows[3].linkedHeadcountId, pos.rows[3].linkedRoleId],
        ['Role 1', 'tp.one@mg.co', 11, 501, null, null], 'identity and links as stored (the tool maps emails to names)');
      pos.rows.forEach(function (r) {
        ['plannedOpenDay', 'plannedHireDay', 'plannedStartDay', 'plannedOnboardedDay'].forEach(function (k) { _assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(r[k]), true, k + ' is a day string'); });
      });
    },
  },
  {
    name: 'N-555 AC4 opens: coePlanPosition().opens is the N-317 model, unchanged (coeOpensModel on the same rows, headcount and day)',
    fn: function () {
      const p = _n555Plan();
      const pos = coePlanPosition({ planRows: p.rows, headcount: p.headcount, placements: p.placements, asOf: p.asOf });
      _assertEqual(pos.opens, coeOpensModel(coeSortRows(p.rows), p.headcount, p.asOf), 'opens');
      _assertEqual([pos.opens.target, pos.opens.openedToDate], [6, 4], 'six planned, four opened by 10 Jun (rows 1, 2, 3 and the cancelled one)');
    },
  },
  {
    name: 'N-555 AC5 hires: an actual hire is the offer accepted; the model is coeOpensByMonth on the planned hire days with no final-weeks rule; an offer after asOf is not a hire',
    fn: function () {
      const p = _n555Plan();
      const pos = coePlanPosition({ planRows: p.rows, headcount: p.headcount, placements: p.placements, asOf: p.asOf });
      const direct = coeOpensByMonth({
        plannedDays: ['2026-05-04', '2026-05-18', '2026-06-01', '2026-06-22', '2026-08-24', '2026-04-20'],
        actualDays: ['2026-05-01', '2026-05-20'], target: 6, latestHireDay: '2026-08-24', todayDay: '2026-06-10', finalNoOpenWeeks: 0,
      });
      _assertEqual(pos.hires, direct, 'hires = coeOpensByMonth on hire days, finalNoOpenWeeks 0');
      _assertEqual([pos.hires.openedToDate, pos.hires.remaining, pos.hires.cutoffMonth], [2, 4, '2026-08'], 'two hires to date, four to go, last month August');
      _assertEqual(pos.hires.months.filter(function (m) { return m.key === '2026-05'; })[0], { key: '2026-05', planned: 2, actual: 2, variance: 0, isCurrent: false, isFuture: false, inWindow: false }, 'May: 2 planned, 2 offers accepted');
      const may = coePlanPosition({ planRows: p.rows, headcount: p.headcount, placements: p.placements, asOf: new Date(2026, 4, 10, 12) });
      _assertEqual(may.hires.openedToDate, 1, 'as of 10 May only row 1 had accepted');
      _assertEqual(may.rows[1].hireConfirmedDay, null, 'row 2 offer (20 May) not yet');
      _assertEqual(may.rows[1].status, 'open', 'row 2 is open then');
      _assertEqual(may.rows[0].status, 'hired', 'row 1 hired, not started (1 Jun is after 10 May)');
      _assertEqual(may.rows[0].startedDay, null, 'a start after asOf is cleared');
    },
  },
  {
    name: 'N-555 AC7 as-of trimming: a headcount opened after asOf is not open, a cancellation after asOf is not yet a cancellation; inputs are never changed',
    fn: function () {
      const p = _n555Plan();
      const before = JSON.stringify([p.headcount, p.placements, p.rows]);
      const apr = coePlanPosition({ planRows: p.rows, headcount: p.headcount, placements: p.placements, asOf: new Date(2026, 3, 5, 12) });
      _assertEqual([apr.rows[2].actualOpenDay, apr.rows[2].status, apr.rows[2].openVariance], [null, 'planned', null], 'row 3 opens on 13 Apr: not open on 5 Apr, not due');
      _assertEqual(apr.opens.openedToDate, 2, 'opened by 5 Apr: row 1 (12 Mar) and the cancelled one (2 Mar); not row 2 (8 Apr) or row 3 (13 Apr)');
      _assertEqual([apr.rows[1].actualOpenDay, apr.rows[1].status], [null, 'planned'], 'row 2 opens on 8 Apr, planned 30 Mar: overdue but not open');
      _assertEqual(apr.rows[5].status, 'cancelled', 'cancelled on 1 Apr is cancelled on 5 Apr');
      const mar = coePlanPosition({ planRows: p.rows, headcount: p.headcount, placements: p.placements, asOf: new Date(2026, 2, 25, 12) });
      _assertEqual([mar.rows[5].status, mar.rows[5].actualOpenDay], ['open', '2026-03-02'], 'on 25 Mar the cancellation (1 Apr) has not happened');
      _assertEqual(JSON.stringify([p.headcount, p.placements, p.rows]), before, 'no input was changed');
    },
  },
  {
    name: 'N-555 AC8b degraded and edge inputs: headcount not read keeps plan dates with no status, opens or hires; no rows; a row with no Planned Open Date is left out',
    fn: function () {
      const p = _n555Plan();
      const none = coePlanPosition({ planRows: p.rows, headcount: null, placements: [], asOf: p.asOf });
      _assertEqual([none.hasActuals, none.opens, none.hires], [false, null, null], 'no headcount, no models');
      _assertEqual(none.rows.every(function (r) { return r.status === null && r.openVariance === null && r.actualOpenDay === null && r.hireConfirmedDay === null; }), true, 'no actuals, no variance, no status');
      _assertEqual(none.rows[0].plannedHireDay, '2026-05-04', 'plan dates are still there');
      const empty = coePlanPosition({ planRows: [], headcount: [], placements: [], asOf: p.asOf });
      _assertEqual([empty.rows, empty.opens, empty.hires], [[], null, null], 'an empty plan');
      const undated = coePlanPosition({ planRows: p.rows.concat([{ id: 9, Title: 'No date', OpenDate: null }]), headcount: p.headcount, placements: p.placements, asOf: p.asOf });
      _assertEqual(undated.rows.length, 6, 'the undated row is left out');
      _assertEqual(undated.opens.target, 6, 'and not counted in the target');
    },
  },
  {
    name: 'N-555 AC6 dates: planned open is the day as entered (spDateIn of the stored value, not the Gantt Monday), every planned day is a local day string, and the hire day matches computePlanSpans',
    fn: function () {
      const bst = { id: 1, Title: 'Mid-week open', OpenDate: '2026-07-01T12:00:00Z', SortOrder: 1 };   // a Wednesday: the Gantt aligns to Monday 29 Jun
      const march = { id: 2, Title: 'Across the clock change', OpenDate: '2026-03-23T12:00:00Z', SortOrder: 2 };
      const pos = coePlanPosition({ planRows: [bst, march], headcount: [], placements: [], asOf: new Date(2026, 5, 10, 12) });
      _assertEqual(pos.rows[0].plannedOpenDay, spDateIn(bst.OpenDate), 'planned open is spDateIn of the stored value, not the Gantt Monday');
      _assertEqual(pos.rows[0].plannedOpenDay, '2026-07-01', 'as entered (Wednesday), not the Monday');
      _assertEqual(pos.rows[0].plannedHireDay, '2026-08-17', 'hire = the Gantt Monday (29 Jun) + 7 weeks');
      [bst, march].forEach(function (r, i) {
        const sp = computePlanSpans(r);
        _assertEqual(pos.rows[i].plannedHireDay, localDayISO(sp.targetHireDate), 'hire day, row ' + (i + 1));
        _assertEqual(pos.rows[i].plannedOnboardedDay, localDayISO(sp.endDate), 'onboarded day, row ' + (i + 1));
      });
      _assertEqual(pos.rows[1].plannedHireDay, '2026-05-11', '23 Mar + 7 weeks across the GMT to BST change is 11 May');
      _assertEqual(pos.rows[1].plannedStartDay, '2026-06-08', '23 Mar + 11 weeks is 8 Jun');
    },
  },
);
