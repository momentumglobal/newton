// tests/assert-revenue.js — computeMonthlyRows, split-fee, assignmentRateLabel, person-based utilisation, revenue/utilisation RAG, ptComputeBenchChanges (was _sbaComputeChanges).
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  {
    name: 'computeMonthlyRows — prorates a mid-month start correctly',
    fn: function () {
      const rows = computeMonthlyRows(FIXTURES.monthlyRows.assignments);
      _assertEqual(rows.length, 1, 'row count');
      const row = rows[0];
      _assertEqual(row.MonthStart, '2024-03-01', 'MonthStart');
      _assertEqual(row.MonthFraction, 0.5484, 'MonthFraction');
      _assertEqual(row.ProratedRevenue, 1700, 'ProratedRevenue');
      _assertEqual(row.BilledRevenue, 1700, 'BilledRevenue');
    },
  },
  {
    name: 'computeMonthlyRows — split-fee revenue: retainer at start, placement fee the month after end (N-116)',
    fn: function () {
      const rows = computeMonthlyRows(FIXTURES.analytics2.splitFee.assignments);
      _assertEqual(rows.length, 4, 'row count');
      _assertEqual(rows[0].MonthStart, '2024-03-01', 'retainer month MonthStart');
      _assertEqual(rows[0].ProratedRevenue, 10000, 'retainer month ProratedRevenue');
      const feeRow = rows[3];
      _assertEqual(feeRow.MonthStart, '2024-06-01', 'placement fee month MonthStart');
      _assertEqual(feeRow.ProratedRevenue, 20000, 'placement fee month ProratedRevenue');
      _assertEqual(feeRow.Capacity, 0, 'placement fee month Capacity');
    },
  },
  {
    name: 'computeMonthlyRows — unbilled split-fee line (SDM): capacity but no revenue, no placement-month row (N-327)',
    fn: function () {
      const a = FIXTURES.analytics2.splitFeeUnbilled.assignments;
      _assertEqual(splitFeeRevenueEvents(a[0]).length, 0, 'no revenue events');
      const rows = computeMonthlyRows(a);
      _assertEqual(rows.length, 3, 'row count (Mar-May, no placement month)');
      _assertEqual(rows.every(r => r.ProratedRevenue === 0), true, 'ProratedRevenue 0');
      _assertEqual(rows.every(r => r.BilledRevenue === 0), true, 'BilledRevenue 0');
      _assertEqual(rows.every(r => r.Capacity > 0), true, 'Capacity counted');
      _assertEqual(rows.every(r => r.BilledCapacity === 0), true, 'BilledCapacity 0');
    },
  },
  {
    name: 'assignmentRateLabel — Unbilled only for a fee-less Billed=No split-fee line (N-327)',
    fn: function () {
      const a = FIXTURES.analytics2.splitFeeUnbilled.assignments[0];
      _assertEqual(assignmentRateLabel(a), 'Unbilled', 'unbilled split-fee');
      _assertEqual(assignmentRateLabel({ ...a, Billed: 'Yes' }), '—', 'billed split-fee, no fees yet');
      _assertEqual(assignmentRateLabel({ ...a, ProjectType: 'Embedded' }), '—', 'non-split unbilled, no rate');
      _assertEqual(assignmentRateLabel({ ...a, RetainerFee: '10000', PlacementFee: '20000' }),
        '£10,000 + £20,000 (split)', 'fee-bearing row unchanged');
    },
  },
  // ---- N-323: home.js split ------------------------------------------------
  {
    name: 'N-323: computeRevenueRAG (analytics.js) hits each threshold and equals the pre-refactor inline banner formula',
    fn: function () {
      const t = CONFIG.REVENUE_THRESHOLDS;
      const y = new Date().getFullYear();
      const flat = rate => [{ StartDate: y + '-01-01', EndDate: y + '-12-31', MonthlyBillRate: rate }];
      const fc = perMonth => [{ ForecastStartDate: y + '-01-01', ForecastEndDate: y + '-12-31', ForecastedHeadcount: 1, ForecastMonthlyRevenuePerHead: perMonth }];
      // Oracle: the inline block that refreshCCBanner used before N-323, kept verbatim.
      const oracle = (forecasts, assigns) => {
        const rt = CONFIG.REVENUE_THRESHOLDS;
        const now = new Date();
        const revYear = now.getFullYear();
        const revEst = computeMonthlyRevenueForYear(assigns, revYear);
        const revFcast = computeMonthlyForecastRevenueForYear(forecasts, revYear);
        const revM = now.getMonth();
        const revIdxs = [revM, revM + 1, revM + 2].filter(i => i <= 11);
        const revForecast = revIdxs.reduce((s, i) => s + revEst[i] + revFcast[i], 0) / revIdxs.length;
        return revForecast >= rt.green ? 'green' : revForecast >= rt.amber ? 'amber' : 'red';
      };
      [
        ['at green',            [], flat(t.green),       'green'],
        ['above green',         [], flat(t.green + 5000), 'green'],
        ['just under green',    [], flat(t.green - 1),   'amber'],
        ['at amber',            [], flat(t.amber),       'amber'],
        ['just under amber',    [], flat(t.amber - 1),   'red'],
        ['no data',             [], [],                   'red'],
        ['forecast lifts red to amber', fc(1000), flat(t.amber - 1000), 'amber'],
      ].forEach(([label, forecasts, assigns, want]) => {
        _assertEqual(computeRevenueRAG(forecasts, assigns), want, label);
        _assertEqual(computeRevenueRAG(forecasts, assigns), oracle(forecasts, assigns), label + ' = old inline formula');
      });
      const calc = revenueForecastCalc([], flat(1000));
      _assertEqual(Object.keys(calc).sort(), ['forecast', 'thisMonth'], 'revenueForecastCalc returns { thisMonth, forecast }');
      _assertEqual(calc.thisMonth, 1000, 'a flat full-year rate gives that rate for the current month');
    },
  },
  // ---- N-325: banner Utilisation RAG mirrors the CC tile ------------------
  {
    // N-328 changed the body to person-based utilisation. The oracle stays
    // verbatim; the property now pinned is "one assignment per person, same
    // span => identical result", which is what N-328 promises to preserve.
    name: 'N-325/N-328: utilisationForecastCalc equals the old CC tile calculation when every person has one assignment (oracle = the old _ccUtilCalc, verbatim)',
    fn: function () {
      function oldCcUtilCalc(forecasts, assigns, people) {
        const now     = new Date();
        const horizon = new Date(now.getTime() + 91 * 86400000); // 13 weeks
      
        // Active headcount (billable levels only — consistent with People Dashboard)
        const totalActiveHeadcount = (people || []).filter(p =>
          p.IsActive !== false && isBillableLevel(p.Level)
        ).length;
      
        // Current: use computeMonthlyRows for current month — consistent with People Dashboard
        const allRows     = computeMonthlyRows(assigns);
        const curMonth    = now.getMonth() + 1;
        const curYear     = now.getFullYear();
        const currentRows = allRows.filter(r => r.Year === curYear && r.Month === curMonth && r.Level !== 'CSD');
        const totalCap    = currentRows.reduce((s, r) => s + r.Capacity, 0);
        const billedCap   = currentRows.reduce((s, r) => s + r.BilledCapacity, 0);
        const known       = totalCap > 0 ? billedCap / totalCap : 0;
      
        // Known 13 weeks: assignments active at any point in the next 13 weeks (for forecast base)
        const known13 = assigns.filter(a => {
          if (isForecastAssignment(a)) return false;
          if (!a.StartDate || !a.EndDate || a.Level === 'CSD') return false;
          const s = new Date(a.StartDate);
          const e = new Date(a.EndDate);
          return s <= horizon && e >= now;
        });
        const totalCap13  = known13.reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
        const billedCap13 = known13.filter(a => a.Billed === 'Yes').reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
        const knownForecastBase = totalCap13 > 0 ? billedCap13 / totalCap13 : 0;
      
        // Forecast: known + sales forecasts overlapping next 13 weeks
        const forecastedHeadcount = forecasts.reduce((sum, f) => {
          const s = new Date(f.ForecastStartDate);
          const e = new Date(f.ForecastEndDate);
          return (s <= horizon && e >= now) ? sum + (f.ForecastedHeadcount || 0) : sum;
        }, 0);
        const added    = totalActiveHeadcount > 0 ? forecastedHeadcount / totalActiveHeadcount : 0;
        const forecast = Math.min(knownForecastBase + added, 1.0);
      
        return { known, forecast };
      }
      const d = n => localDayISO(new Date(Date.now() + n * 86400000));
      let _who = 0;   // N-328: one distinct person per assignment
      const asg = (n, over) => Array.from({ length: n }, (_, i) => Object.assign({ AssignmentID: 'a' + i + (over && over.IsForecast ? 'f' : ''), EmployeeName: 'Person ' + (_who++), Level: 'TP', Billed: 'Yes', MonthlyCapacity: 1, StartDate: d(-10), EndDate: d(60) }, over));
      const ppl = (n, level, extra) => Array.from({ length: n }, () => Object.assign({ Level: level, IsActive: true }, extra));
      const cases = {
        'all billable':               [[], [...asg(3), ...asg(1, { Billed: 'No' })], [...ppl(4, 'TP')]],
        'a CSD assignment':           [[], [...asg(3), ...asg(1, { Level: 'CSD' })], [...ppl(4, 'TP')]],
        'forecast assignment true':   [[], [...asg(3), ...asg(2, { IsForecast: true })], [...ppl(4, 'TP')]],
        'forecast assignment 1':      [[], [...asg(3), ...asg(2, { IsForecast: 1 })], [...ppl(4, 'TP')]],
        'forecast assignment Yes':    [[], [...asg(3), ...asg(2, { IsForecast: 'Yes' })], [...ppl(4, 'TP')]],
        'inactive and CSD people':    [[], asg(3), [...ppl(4, 'TP'), ...ppl(2, 'TP', { IsActive: false }), ...ppl(2, 'CSD')]],
        'a PTP in the headcount':     [[{ ForecastStartDate: d(-5), ForecastEndDate: d(30), ForecastedHeadcount: 1 }], [...asg(1), ...asg(3, { Billed: 'No' })], [...ppl(4, 'TP'), ...ppl(1, 'PTP')]],
        'no assignments':             [[], [], ppl(3, 'TP')],
        'no people':                  [[], asg(3), []],
        'people undefined':           [[], asg(3), undefined],
        'forecast rows lift amber':   [[{ ForecastStartDate: d(-5), ForecastEndDate: d(30), ForecastedHeadcount: 2 }], [...asg(3), ...asg(1, { Billed: 'No' })], ppl(10, 'TP')],
      };
      Object.keys(cases).forEach(k => {
        const [f, a, p] = cases[k];
        const got = utilisationForecastCalc(f, a, p), want = oldCcUtilCalc(f, a, p);
        // 1e-12: the old sums drift in the last bit (0.7499999999999999); the new ones don't.
        _assertEqual(Math.abs(got.known - want.known) < 1e-12 && Math.abs(got.forecast - want.forecast) < 1e-12, true,
          k + ': { known, forecast } equal the old tile calculation (got ' + JSON.stringify(got) + ', old ' + JSON.stringify(want) + ')');
      });
      _assertEqual(typeof computeUtilisationRAG, 'function', 'computeUtilisationRAG is global (analytics.js)');
    },
  },
  {
    name: 'N-325: computeUtilisationRAG thresholds, and the banner no longer disagrees with the tile (fixture where the old banner formula differed)',
    fn: function () {
      const t = CONFIG.UTILISATION_THRESHOLDS;
      const d = n => localDayISO(new Date(Date.now() + n * 86400000));
      const mk = (billed, unbilled, over) => [
        ...Array.from({ length: billed }, (_, i) => Object.assign({ AssignmentID: 'b' + i, EmployeeName: 'Billed ' + i, Level: 'TP', Billed: 'Yes', MonthlyCapacity: 1, StartDate: d(-10), EndDate: d(60) }, over)),
        ...Array.from({ length: unbilled }, (_, i) => Object.assign({ AssignmentID: 'u' + i, EmployeeName: 'Unbilled ' + i, Level: 'TP', Billed: 'No', MonthlyCapacity: 1, StartDate: d(-10), EndDate: d(60) }, over)),
      ];
      const people = Array.from({ length: 20 }, () => ({ Level: 'TP', IsActive: true }));
      // 20 units of capacity: billed share = billed / 20.
      [[17, 3, 'green', t.green], [16, 4, 'amber', 0.8], [15, 5, 'amber', t.amber], [14, 6, 'red', 0.7]].forEach(([b, u, want, share]) => {
        _assertEqual(computeUtilisationRAG([], mk(b, u), people), want, 'billed share ' + share + ' -> ' + want);
      });
      _assertEqual(computeUtilisationRAG([], [], people), 'red', 'no assignments -> red');
      // The old banner formula, verbatim, as a second oracle.
      function oldBannerUtilRAG(forecasts, assigns, people) {
      const t = CONFIG.UTILISATION_THRESHOLDS;
      const now = new Date();
      const horizon = new Date(now.getTime() + 91 * 86400000);
      const totalActiveHeadcount = people.filter(p => p.IsActive !== false && ['SDM','STP','TP'].includes(p.Level)).length;
      const known13 = assigns.filter(a => {
        if (!a.StartDate || !a.EndDate) return false;
        const s = new Date(a.StartDate); const e = new Date(a.EndDate);
        return s <= horizon && e >= now && a.Level !== 'CSD';
      });
      const totalCap  = known13.reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
      const billedCap = known13.filter(a => a.Billed === 'Yes').reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
      const knownUtil = totalCap > 0 ? billedCap / totalCap : 0;
      const forecastedHC = forecasts.reduce((sum, f) => {
        const s = new Date(f.ForecastStartDate); const e = new Date(f.ForecastEndDate);
        return (s <= horizon && e >= now) ? sum + (f.ForecastedHeadcount || 0) : sum;
      }, 0);
      const forecastUtil = Math.min(knownUtil + (totalActiveHeadcount > 0 ? forecastedHC / totalActiveHeadcount : 0), 1.0);
      const ragUtil = forecastUtil >= t.green ? 'green' : forecastUtil >= t.amber ? 'amber' : 'red';
        return ragUtil;
      }
      // Fixture: 3 billed + 1 unbilled real assignments (75% -> amber on the tile) plus 3 billed FORECAST
      // assignments, which the old banner counted (6 of 7 = 86% -> green) and the tile skips.
      const assigns = [...mk(3, 1), ...mk(3, 0, { IsForecast: true }).map((a, i) => Object.assign(a, { AssignmentID: 'f' + i }))];
      const ppl = [...Array.from({ length: 4 }, () => ({ Level: 'TP', IsActive: true })), { Level: 'PTP', IsActive: true }];
      _assertEqual(oldBannerUtilRAG([], assigns, ppl), 'green', 'positive control: the old banner formula says green on this fixture');
      _assertEqual(computeUtilisationRAG([], assigns, ppl), 'amber', 'the shared (tile) calculation says amber on the same fixture');
      _assertEqual(oldBannerUtilRAG([], mk(14, 6), people), computeUtilisationRAG([], mk(14, 6), people), 'on plain data (no forecast assignments, TP-only) the old banner and the tile agree');
    },
  },
  {
    name: 'N-325: Utilisation maths lives in analytics.js only; the banner calls it and keeps its N-285 skip',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const code = f => _vendorStripJsComments(ALL_SOURCES[f]).join('\n');
      const defines = (f, n) => new RegExp('(^|\\n)\\s*(async\\s+)?function\\s+' + n + '\\s*\\(').test(code(f));
      ['utilisationForecastCalc', 'computeUtilisationRAG'].forEach(n => Object.keys(ALL_SOURCES).forEach(g =>
        _assertEqual(defines(g, n), g === 'analytics.js', n + (g === 'analytics.js' ? ' is defined in ' : ' is not defined in ') + g)));
      Object.keys(ALL_SOURCES).forEach(g => _assertEqual(code(g).indexOf('_ccUtilCalc'), -1, g + ': no _ccUtilCalc (retired, N-325)'));
      const banner = code('home-banner.js');
      _assertEqual(banner.indexOf('computeUtilisationRAG(forecasts, assigns, people)') !== -1, true, 'home-banner.js calls the shared function');
      _assertEqual(banner.indexOf('UTILISATION_THRESHOLDS'), -1, 'home-banner.js holds no utilisation threshold maths');
      _assertEqual(/\[\s*'SDM'\s*,\s*'STP'\s*,\s*'TP'\s*\]/.test(banner), false, "home-banner.js no longer hard-codes ['SDM','STP','TP']");
      _assertEqual(ALL_SOURCES['home-banner.js'].indexOf('NOT the same maths'), -1, 'the N-323 caveat comment is gone');
      _assertEqual(banner.split('skip: forecastsDenied').length - 1, 2, 'N-285: util and revenue still skip their CCStatus writes when SalesForecasts is denied');
      _assertEqual(banner.indexOf('if (s.skip) continue;') !== -1, true, 'N-285: the skip is still honoured');
    },
  },
  {
    name: 'N-304: utilisationForecastCalc headcount ignores internal staff (positive control: as many extra TPs do move it)',
    fn: function () {
      const d = n => localDayISO(new Date(Date.now() + n * 86400000));
      const asg = Array.from({ length: 4 }, (_, i) => ({ AssignmentID: 'a' + i, EmployeeName: 'Person ' + i, Level: 'TP', Billed: i < 3 ? 'Yes' : 'No', MonthlyCapacity: 1, StartDate: d(-10), EndDate: d(60) }));
      const fc = [{ ForecastStartDate: d(-5), ForecastEndDate: d(30), ForecastedHeadcount: 2 }];
      const tps = n => Array.from({ length: n }, () => ({ Level: 'TP', IsActive: true }));
      const internal = Array.from({ length: 5 }, () => ({ StaffType: CONFIG.STAFF_TYPE_INTERNAL, StaffFunction: 'Sales', IsActive: true }));
      const base = utilisationForecastCalc(fc, asg, tps(10));
      _assertEqual(utilisationForecastCalc(fc, asg, [...tps(10), ...internal]), base, 'internal staff leave { known, forecast } unchanged');
      _assertEqual(_deepEqual(utilisationForecastCalc(fc, asg, tps(15)), base), false, 'positive control: 5 more TPs change the forecast');
    },
  },
  // ---- N-328: person-based utilisation --------------------------------------
  {
    name: 'N-328: personUtilisation counts a person once — SDM on 1 billed + 2 unbilled concurrent customers = 100%',
    fn: function () {
      const A = (id, name, billed, s, e, level) => ({ AssignmentID: id, EmployeeName: name, Level: level || 'SDM', Billed: billed ? 'Yes' : 'No', StartDate: s, EndDate: e });
      const rows = computeMonthlyRows([
        A('s1', 'Sam', true, '2024-03-01', '2024-03-31'),
        A('s2', 'Sam', false, '2024-03-01', '2024-03-31'),
        A('s3', 'Sam', false, '2024-03-01', '2024-03-31'),
      ]);
      const oldWay = rows.reduce((s, r) => s + r.BilledCapacity, 0) / rows.reduce((s, r) => s + r.Capacity, 0);
      _assertEqual(Math.round(oldWay * 1000) / 1000, 0.333, 'positive control: the old row-capacity formula says 1/3');
      _assertEqual(personUtilisation(rows), { ratio: 1, billed: 1, total: 1 }, 'person-based: one person-month, fully billed');
      // with a bench TP alongside, the SDM is one head of two
      const two = computeMonthlyRows([
        A('s1', 'Sam', true, '2024-03-01', '2024-03-31'), A('s2', 'Sam', false, '2024-03-01', '2024-03-31'),
        A('b1', 'Ben', false, '2024-03-01', '2024-03-31', 'TP'),
      ]);
      _assertEqual(personUtilisation(two).ratio, 0.5, 'SDM + bench TP = 1 of 2 heads');
    },
  },
  {
    name: 'N-328: part-month concurrency is exact (joiner: billed + unbilled on the same 16 days = 100%; min(1, sum) would say ~52%)',
    fn: function () {
      const A = (id, billed, s, e) => ({ AssignmentID: id, EmployeeName: 'Joy', Level: 'TP', Billed: billed ? 'Yes' : 'No', StartDate: s, EndDate: e });
      const rows = computeMonthlyRows([A('j1', true, '2024-03-16', '2024-03-31'), A('j2', false, '2024-03-16', '2024-03-31')]);
      const u = personUtilisation(rows);
      _assertEqual(u.ratio, 1, 'ratio 1');
      _assertEqual(u.total, 0.5161, 'total = 16/31 person-months, not capped-sum 1');
      const minWay = Math.min(1, rows.reduce((s, r) => s + r.BilledCapacity, 0)) / Math.min(1, rows.reduce((s, r) => s + r.Capacity, 0));
      _assertEqual(minWay < 0.6, true, 'positive control: the min(1, sum) approach really does understate this case');
      // billed first half, unbilled the whole month: half billed
      const half = computeMonthlyRows([A('h1', true, '2024-04-01', '2024-04-15'), A('h2', false, '2024-04-01', '2024-04-30')]);
      _assertEqual(personUtilisation(half), { ratio: 0.5, billed: 0.5, total: 1 }, 'billed days 1-15 of 30, assigned all month = 50%');
    },
  },
  {
    name: 'N-328: with one assignment per person-month, personUtilisation equals the old row-capacity formula (positive control: a concurrent row changes it)',
    fn: function () {
      const A = (id, name, level, billed, s, e) => ({ AssignmentID: id, EmployeeName: name, Level: level, Billed: billed ? 'Yes' : 'No', StartDate: s, EndDate: e });
      const base = [
        A('p1', 'Ann',  'TP',  true,  '2024-01-10', '2024-03-20'),
        A('p2', 'Bob',  'STP', false, '2024-02-01', '2024-04-30'),
        A('p3', 'Cat',  'SDM', true,  '2024-03-05', '2024-03-25'),
        A('p4', 'Dan',  'PTP', true,  '2024-02-14', '2024-06-02'),
        A('p5', 'Eve',  'CSD', true,  '2024-01-01', '2024-06-30'),
      ];
      const oldUtil = rows => {
        const f = rows.filter(r => isBillableLevel(r.Level));
        const t = f.reduce((s, r) => s + r.Capacity, 0);
        return t > 0 ? f.reduce((s, r) => s + r.BilledCapacity, 0) / t : 0;
      };
      const rows = computeMonthlyRows(base);
      _assertEqual(Math.abs(personUtilisation(rows).ratio - oldUtil(rows)) < 1e-12, true, 'whole set equals the old formula');
      for (let m = 1; m <= 6; m++) {
        const mr = rows.filter(r => r.Month === m);
        _assertEqual(Math.abs(personUtilisation(mr).ratio - oldUtil(mr)) < 1e-12, true, 'month ' + m + ' equals the old formula');
      }
      const withSdm = computeMonthlyRows(base.concat([A('p6', 'Cat', 'SDM', false, '2024-03-05', '2024-03-25')]));
      _assertEqual(Math.abs(personUtilisation(withSdm).ratio - oldUtil(withSdm)) > 1e-3, true, 'positive control: a concurrent unbilled row moves the old formula but not the person count');
      _assertEqual(personUtilisation(withSdm).ratio, personUtilisation(rows).ratio, 'the concurrent row leaves the person-based figure unchanged');
    },
  },
  {
    name: 'N-328: blank names never merge; CSD and forecast assignments excluded; empty input is 0 / 0',
    fn: function () {
      const A = (id, name, level, billed, over) => Object.assign({ AssignmentID: id, EmployeeName: name, Level: level, Billed: billed ? 'Yes' : 'No', StartDate: '2024-03-01', EndDate: '2024-03-31' }, over);
      _assertEqual(personUtilisation(computeMonthlyRows([A('x1', '', 'TP', true), A('x2', '', 'TP', false)])).ratio, 0.5, 'two blank-name rows are two people');
      _assertEqual(personUtilisation(computeMonthlyRows([A('c1', 'Cara', 'CSD', true), A('t1', 'Tom', 'TP', false)])).ratio, 0, 'CSD billed row ignored');
      _assertEqual(personUtilisation(computeMonthlyRows([A('f1', 'Fay', 'TP', true, { IsForecast: true }), A('t1', 'Tom', 'TP', false)])).ratio, 0, 'forecast billed row ignored');
      _assertEqual(personUtilisation([]), { ratio: 0, billed: 0, total: 0 }, 'no rows');
      _assertEqual(personUtilisation(undefined), { ratio: 0, billed: 0, total: 0 }, 'undefined rows');
    },
  },
  {
    name: 'N-328: clip window trims days outside [from, to]',
    fn: function () {
      const A = (id, name, billed) => ({ AssignmentID: id, EmployeeName: name, Level: 'TP', Billed: billed ? 'Yes' : 'No', StartDate: '2024-03-01', EndDate: '2024-04-30' });
      const rows = computeMonthlyRows([A('c1', 'Ann', true), A('c2', 'Bob', false)]);
      _assertEqual(personUtilisation(rows).total, 4, 'unclipped: 2 people x 2 months');
      const u = personUtilisation(rows, { from: new Date(2024, 2, 16), to: new Date(2024, 3, 15) });
      _assertEqual(u.billed, 1.0161, 'Ann: 16/31 + 15/30');
      _assertEqual(u.total, 2.0322, 'Ann + Bob');
      _assertEqual(u.ratio, 0.5, 'ratio');
      _assertEqual(personUtilisation(rows, { from: new Date(2024, 4, 1), to: new Date(2024, 5, 1) }).total, 0, 'window after the assignments -> nothing');
    },
  },
  {
    name: 'N-328: computeMonthlyRows — DayFrom/DayTo are additive; placement rows carry none; same across BST->GMT',
    fn: function () {
      const rows = computeMonthlyRows(FIXTURES.monthlyRows.assignments);
      _assertEqual(Object.keys(rows[0]).sort(), ['AssignmentID', 'Billed', 'BilledCapacity', 'BilledRevenue', 'Capacity', 'Country', 'Customer', 'DayFrom', 'DayTo',
        'EmployeeName', 'Level', 'Month', 'MonthFraction', 'MonthStart', 'ProjectType', 'ProratedRevenue', 'Year'], 'row keys = the old set + DayFrom, DayTo');
      const sf = computeMonthlyRows(FIXTURES.analytics2.splitFee.assignments);
      _assertEqual([sf[0].DayFrom, sf[0].DayTo], [10, 31], 'first split-fee month: 10-31 Mar');
      _assertEqual([sf[2].DayFrom, sf[2].DayTo], [1, 20], 'last month: 1-20 May');
      _assertEqual(sf[3].DayFrom === undefined && sf[3].DayTo === undefined, true, 'placement-fee row has no day span');
      const bst = computeMonthlyRows([{ AssignmentID: 'z', EmployeeName: 'Zoe', Level: 'TP', Billed: 'Yes', StartDate: '2024-10-20', EndDate: '2024-11-03' }]);
      _assertEqual(bst.map(r => [r.Month, r.DayFrom, r.DayTo]), [[10, 20, 31], [11, 1, 3]], 'span across the 27 Oct clock change');
      _assertEqual(personUtilisation(bst).total, 0.4871, '12/31 + 3/30 person-months (0.3871 + 0.1)');
    },
  },
  {
    name: 'N-328: computeMonthlyRows { through } extends rows for utilisation only — future months carry no revenue, placement fee stays capped at today',
    fn: function () {
      const DAY = 86400000;
      const d = n => localDayISO(new Date(Date.now() + n * DAY));
      const now = new Date();
      const curKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      const rated = { AssignmentID: 'r', EmployeeName: 'Rae', Level: 'TP', Billed: 'Yes', MonthlyBillRate: 3000, StartDate: d(-5), EndDate: d(150) };
      const def = computeMonthlyRows([rated]);
      _assertEqual(def.every(r => r.MonthStart.slice(0, 7) <= curKey), true, 'default: nothing after the current month');
      const fwd = computeMonthlyRows([rated], { through: new Date(Date.now() + 150 * DAY) });
      const later = fwd.filter(r => r.MonthStart.slice(0, 7) > curKey);
      _assertEqual(later.length >= 4, true, 'through: rows run on past the current month (' + later.length + ')');
      _assertEqual(later.every(r => r.Capacity > 0 && r.ProratedRevenue === 0 && r.BilledRevenue === 0), true, 'future months: capacity yes, revenue no');
      _assertEqual(fwd.filter(r => r.MonthStart.slice(0, 7) <= curKey).map(r => r.ProratedRevenue), def.map(r => r.ProratedRevenue), 'months to date: revenue identical to the default');
      const split = { AssignmentID: 's', EmployeeName: 'Sid', Level: 'TP', Billed: 'Yes', ProjectType: CONFIG.SPLIT_FEE_PROJECT_TYPES[0],
                      RetainerFee: '1000', PlacementFee: '5000', StartDate: d(-5), EndDate: d(70) };
      const sfRows = computeMonthlyRows([split], { through: new Date(Date.now() + 150 * DAY) });
      _assertEqual(sfRows.reduce((s, r) => s + r.ProratedRevenue, 0), 1000, 'retainer only — the future placement fee never appears');
      _assertEqual(sfRows.every(r => r.Capacity > 0), true, 'no zero-capacity placement row in the future');
    },
  },
  {
    name: 'N-328: utilisationForecastCalc is person-based — an SDM with unbilled concurrent rows no longer drags it down',
    fn: function () {
      const d = n => localDayISO(new Date(Date.now() + n * 86400000));
      const A = (id, name, billed) => ({ AssignmentID: id, EmployeeName: name, Level: 'SDM', Billed: billed ? 'Yes' : 'No', StartDate: d(-40), EndDate: d(120) });
      const people = [{ Level: 'SDM', IsActive: true }];
      _assertEqual(utilisationForecastCalc([], [A('1', 'Sam', true), A('2', 'Sam', false), A('3', 'Sam', false)], people), { known: 1, forecast: 1 }, 'one SDM, billed throughout');
      // roll-off: billed for the first part of the 13 weeks, bench after -> day-weighted, not 1 of 2
      const roll = [{ AssignmentID: 'a', EmployeeName: 'Tia', Level: 'TP', Billed: 'Yes', StartDate: d(-40), EndDate: d(13) },
                    { AssignmentID: 'b', EmployeeName: 'Tia', Level: 'TP', Billed: 'No', StartDate: d(14), EndDate: d(200) }];
      const base = utilisationForecastCalc([], roll, [{ Level: 'TP', IsActive: true }]).forecast;
      _assertEqual(base > 0.1 && base < 0.25, true, 'roll-off after 2 of 13 weeks scores ~2/13, not 50% (got ' + base + ')');
    },
  },
  {
    name: 'N-328: only utils.js turns Capacity into utilisation — no BilledCapacity/Capacity sums, MonthlyCapacity or retired helpers elsewhere',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      const BAD = /\.(Billed)?Capacity\b|MonthlyCapacity|\b_calcUtilisation\b|\bmpCalcUtilisation\b/;
      const scan = src => {
        const hits = [];
        Object.keys(src).forEach(f => {
          if (f === 'utils.js') return;
          _vendorStripJsComments(src[f]).forEach((line, i) => { if (BAD.test(line)) hits.push(f + ':' + (i + 1)); });
        });
        return hits;
      };
      _assertEqual(scan(ALL_SOURCES), [], 'utilisation maths outside utils.js');
      const bumped = Object.assign({}, ALL_SOURCES, { 'people-dashboard.js': ALL_SOURCES['people-dashboard.js'] + '\nconst _x = rows.reduce((s, r) => s + r.BilledCapacity, 0);' });
      _assertEqual(scan(bumped).length, 1, 'mutation: a new BilledCapacity sum is flagged');
      _assertEqual(/function\s+personUtilisation\s*\(/.test(ALL_SOURCES['utils.js']), true, 'personUtilisation is defined in utils.js');
    },
  },
  {
    // N-329, moved by N-365: the pure bench computation now lives in
    // project-team.js (loaded by run.js) as ptComputeBenchChanges, so it is
    // called directly. The positive control patches a copy of its source.
    name: 'N-329: ptComputeBenchChanges — a forecast assignment is not cover (bench row kept / recreated under it); no-forecast output unchanged',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || !ALL_SOURCES['project-team.js']) {
        _skip('Source extraction needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const src = String(ptComputeBenchChanges);
      _assertEqual(src.indexOf('function ptComputeBenchChanges(') === 0, true, 'ptComputeBenchChanges source located');
      _assertEqual(/function\s+_sbaComputeChanges\s*\(/.test(ALL_SOURCES['people-tracker.js'] || ''), false, 'no second copy left in people-tracker.js');
      _assertEqual(/ptComputeBenchChanges\(people, assignments\)/.test(ALL_SOURCES['people-tracker.js'] || ''), true, 'Sync Bench calls ptComputeBenchChanges');
      const sba = ptComputeBenchChanges;
      const today = new Date(Date.UTC(2026, 5, 15));
      const people = [{ EmployeeName: 'Ann', Level: 'TP', IsActive: true, StartDate: '2026-01-01', Location: 'UK' }];
      const row = (id, s, e, x) => Object.assign({ id: id, EmployeeName: 'Ann', Customer: 'Acme', StartDate: s, EndDate: e }, x || {});
      const bench = (id, s, e) => row(id, s, e, { Customer: 'Unassigned', AutoGenerated: true });
      const forecast = row('f', '2026-04-01', '2026-06-30', { IsForecast: true });
      const d10 = v => String(v).slice(0, 10);
      const span = c => d10(c.StartDate) + '..' + d10(c.EndDate);

      // 1. forecast-only gap, no bench row yet: one bench row for exactly the forecast span
      const base = [row('1', '2026-01-01', '2026-03-31'), forecast, row('3', '2026-07-01', '2026-12-31')];
      const r1 = sba(people, base, today);
      _assertEqual(r1.toCreate.map(span), ['2026-04-01..2026-06-30'], 'bench row created under the forecast');
      _assertEqual(r1.toDelete, [], 'nothing deleted');

      // 2. the bench row already exists: kept, not deleted, nothing recreated
      const r2 = sba(people, base.concat([bench('b', '2026-04-01', '2026-06-30')]), today);
      _assertEqual(r2.toDelete, [], 'existing bench row under a forecast is kept');
      _assertEqual(r2.toCreate, [], 'nothing recreated');

      // 3. a forecast overlapping a billed assignment adds no bench under billed days
      const over = [row('1', '2026-01-01', '2026-12-31'), row('f2', '2026-03-01', '2026-05-31', { IsForecast: true })];
      const r3 = sba(people, over, today);
      _assertEqual([r3.toCreate.length, r3.toDelete.length], [0, 0], 'forecast over billed cover changes nothing');

      // 4. no forecast anywhere: a plain gap still gets a bench row, a stale bench row is still deleted
      const plain = [row('1', '2026-01-01', '2026-03-31'), row('3', '2026-07-01', '2026-12-31'), bench('old', '2026-05-01', '2026-05-31')];
      const r4 = sba(people, plain, today);
      _assertEqual(r4.toCreate.map(span), ['2026-04-01..2026-06-30'], 'plain gap bench row');
      _assertEqual(r4.toDelete, ['old'], 'stale bench row deleted');

      // 5. inactive person's stale bench row is still cleaned up
      const r5 = sba([Object.assign({}, people[0], { IsActive: false })], [bench('z', '2026-01-01', '2026-12-31')], today);
      _assertEqual(r5.toDelete, ['z'], 'inactive person cleanup unchanged');

      // 6. source guard: the cover filter excludes forecasts
      const cover = src.slice(src.indexOf('const customerAssignments = assignments'), src.indexOf('.map(a => ({', src.indexOf('const customerAssignments = assignments')));
      _assertEqual(/isForecastAssignment\(a\)/.test(cover), true, 'cover filter contains isForecastAssignment');
      // positive control: with the exclusion removed, case 1 must FAIL (the test can see the bug)
      const patched = src.replace('!isForecastAssignment(a) &&', '');
      _assertEqual(patched !== src, true, 'control: the exclusion text was found and removed');
      const old = new Function(patched + '\nreturn ptComputeBenchChanges;')();
      _assertEqual(old(people, base, today).toCreate.length, 0, 'control: pre-fix logic creates no bench row under a forecast');
    },
  },
  {
    name: 'N-391 utilisationBandRollup / utilisationByMonth equal the old People Dashboard inline panel maths (AC8, AC9, AC13)',
    fn: function () {
      // Oracle: pre-N-391 _renderUtilisationPanel figures, verbatim.
      function oldPanel(rows) {
        const bands = CONFIG.PEOPLE_LEVELS.filter(l => l !== 'CSD');
        const bandRows = bands.map(band => {
          const r        = rows.filter(r => r.Level === band);
          const u        = personUtilisation(r).ratio;
          const total    = new Set(r.map(r => r.EmployeeName)).size;
          const utilised = new Set(r.filter(r => r.Billed === 'Yes').map(r => r.EmployeeName)).size;
          return { band, u, utilised, total };
        }).filter(b => b.total > 0);
        const totalUtil     = personUtilisation(rows).ratio;
        const totalActive   = new Set(rows.filter(r => isBillableLevel(r.Level)).map(r => r.EmployeeName)).size;
        const totalUtilised = new Set(rows.filter(r => r.Billed === 'Yes' && isBillableLevel(r.Level)).map(r => r.EmployeeName)).size;
        const monthMap = {};
        rows.forEach(r => {
          const key = `${r.Year}-${String(r.Month).padStart(2,'0')}`;
          if (!monthMap[key]) monthMap[key] = [];
          monthMap[key].push(r);
        });
        const chartData = Object.keys(monthMap).sort().map(k => ({ label: k, value: personUtilisation(monthMap[k]).ratio }));
        return { bandRows, totalUtil, totalActive, totalUtilised, chartData };
      }
      const A = (id, name, level, billed, s, e) => ({ AssignmentID: id, EmployeeName: name, Level: level, Billed: billed ? 'Yes' : 'No',
        Customer: billed ? 'Acme' : 'Unassigned', StartDate: s, EndDate: e });
      const rows = computeMonthlyRows([
        A('1', 'Ann', 'TP',  true,  '2024-01-01', '2024-03-31'),
        A('2', 'Ann', 'TP',  false, '2024-02-01', '2024-02-29'),   // unbilled concurrent row
        A('3', 'Bob', 'STP', false, '2024-01-10', '2024-02-20'),
        A('4', 'Cat', 'SDM', true,  '2024-03-05', '2024-03-25'),
        A('5', 'Cara', 'CSD', true, '2024-01-01', '2024-03-31'),  // CSD: never counted
      ]);
      const want = oldPanel(rows);
      const got  = utilisationBandRollup(rows);
      _assertEqual(got.bands, want.bandRows, 'band rows identical');
      _assertEqual(got.total, { u: want.totalUtil, utilised: want.totalUtilised, active: want.totalActive }, 'totals identical');
      _assertEqual(utilisationByMonth(rows).map(m => ({ label: m.month, value: m.u })), want.chartData, 'monthly trend identical');
      _assertEqual(got.bands.map(b => b.band), ['SDM', 'STP', 'TP'], 'PTP (no rows) and CSD dropped, config order kept');
      // positive control: an extra billed PTP changes both the bands and the total
      const more = rows.concat(computeMonthlyRows([A('6', 'Dan', 'PTP', true, '2024-01-01', '2024-03-31')]));
      _assertEqual(_deepEqual(utilisationBandRollup(more), got), false, 'control: another person moves the roll-up');
      _assertEqual(utilisationBandRollup(more), (w => ({ bands: w.bandRows, total: { u: w.totalUtil, utilised: w.totalUtilised, active: w.totalActive } }))(oldPanel(more)), 'control set still equals the oracle');
      _assertEqual([utilisationBandRollup([]), utilisationByMonth(undefined)],
        [{ bands: [], total: { u: 0, utilised: 0, active: 0 } }, []], 'empty / undefined rows');
      if (typeof ALL_SOURCES !== 'undefined') {
        const pd = ALL_SOURCES['people-dashboard.js'];
        const panel = pd.slice(pd.indexOf('function _renderUtilisationPanel'), pd.indexOf('// Panel 2'));
        _assertEqual([/Level === band/.test(panel), /padStart/.test(panel), /utilisationBandRollup\(rows\)/.test(panel), /utilisationByMonth\(rows\)/.test(panel)],
          [false, false, true, true], 'panel calls the helpers and keeps no maths of its own');
        _assertEqual(['utilisationBandRollup', 'utilisationByMonth'].map(n => Object.keys(ALL_SOURCES).filter(f => new RegExp('function\\s+' + n + '\\s*\\(').test(ALL_SOURCES[f]))),
          [['utils.js'], ['utils.js']], 'defined only in utils.js');
      }
    },
  }
);
