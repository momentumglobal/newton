// tests/assert-sla-rollup.js — SLA roll-up (N-385, DA-5): config + capability, project scope,
// results, fixed-period model, markup, loader, Command Centre and Report Builder wiring.
// Loads AFTER tests/assert-sla-engine.js and tests/assert-sla-panel.js (reuses _slaRun / _slaToday)
// and pushes into ASSERTIONS. The runner is synchronous, so the async mounts are covered by source
// scans plus the synchronous reach of getSlaRollupInputs.

(function () {
  const throwsOn = (fn, label) => { let t = false; try { fn(); } catch (e) { t = true; } if (!t) throw new Error(label + ': expected a throw'); };
  const clone = f => { const c = JSON.parse(JSON.stringify(CONFIG.SLA)); f(c); return c; };
  const body = (src, start) => { const i = src.indexOf(start); if (i < 0) return ''; const m = /\r?\n\}\r?\n/.exec(src.slice(i)); return m ? src.slice(i, i + m.index + m[0].length) : src.slice(i); };

  // Alpha (id 900, Embedded, real engine result: one ongoing first-submission breach), Beta (901,
  // Embedded, no roles: nothing evaluated), a Completed client project, an Internal project and a
  // Transformation project (no SLAs).
  const HOSTILE = 'Alpha <img src=x onerror=alert(1)>';
  const PROJECTS = [
    { id: 900, CustomerName: HOSTILE, ProjectType: 'Embedded', Status: 'Active' },
    { id: 901, CustomerName: 'Beta', ProjectType: 'Embedded', Status: 'Active' },
    { id: 902, CustomerName: 'Gone', ProjectType: 'Embedded', Status: 'Completed' },
    { id: 903, CustomerName: 'MG Internal', ProjectType: 'Internal', Status: 'Active' },
    { id: 904, CustomerName: 'Shell', ProjectType: 'Transformation', Status: 'Active' },
  ];
  const inputsFor = (projects, today) => {
    const F = FIXTURES.slaEngine;
    return { projects: projects, slaRows: F.slaRows, roles: [F.role], headcount: [F.hc], placements: [], stageRows: [], activity: [], rejectedOffers: null, today: today };
  };
  function model(projects, today) {
    const t = today || _slaToday(30);
    const results = slaProjectResults(inputsFor(projects, t));
    return { results: results, model: slaRollupModel({ projects: projects, results: results, today: t }) };
  }
  const ELIGIBLE = PROJECTS.filter(p => p.id === 900 || p.id === 901);

  ASSERTIONS.push(
    {
      name: 'N-385 config + capability — ROLLUP_PERIOD, slaRollupReport, canViewSlaRollupReport',
      fn: function () {
        _assertEqual(CONFIG.SLA.ROLLUP_PERIOD, '90d', 'AC1 fixed period');
        const p = CONFIG.SLA.PERIODS.find(x => x.key === CONFIG.SLA.ROLLUP_PERIOD);
        _assertEqual(Number.isInteger(p.days) && p.days > 0, true, 'AC1 a bounded window');
        _assertEqual(CONFIG.ROLE_CAPABILITIES.slaRollupReport, ['admin', 'leadership', 'delivery_manager'], 'AC1 capability roles');
        _assertEqual(slaPanelConfigCheck(), true, 'AC1 live config passes');
        throwsOn(() => slaPanelConfigCheck(clone(c => { c.ROLLUP_PERIOD = 'nope'; })), 'AC1 unknown key');
        throwsOn(() => slaPanelConfigCheck(clone(c => { c.ROLLUP_PERIOD = 'all'; })), 'AC1 the all-time key');
        throwsOn(() => slaPanelConfigCheck(clone(c => { delete c.ROLLUP_PERIOD; })), 'AC1 missing');
        ['admin', 'leadership', 'delivery_manager'].forEach(r => _assertEqual(canViewSlaRollupReport(r), true, 'AC1 ' + r));
        ['talent_partner', 'people_ops', 'sales', 'staff', 'viewer', 'nobody', undefined].forEach(r => _assertEqual(canViewSlaRollupReport(r), false, 'AC1 not ' + r));
        _assertEqual(canViewSlaPortfolio('leadership') && !canViewSlaPortfolio('delivery_manager'), true, 'CC section stays Admin / Leadership');
      },
    },
    {
      name: 'N-385 slaRollupProjects — scope by project ids, active client projects only, no mutation',
      fn: function () {
        const before = JSON.stringify(PROJECTS);
        const ids = p => p.map(x => x.id);
        _assertEqual(ids(slaRollupProjects({ projects: PROJECTS, projectIds: null })), [900, 901], 'AC2 null = every active client project (Completed, Internal, Transformation dropped)');
        _assertEqual(ids(slaRollupProjects({ projects: PROJECTS, projectIds: ['901'] })), [901], 'AC2 an array scopes (string compare)');
        _assertEqual(ids(slaRollupProjects({ projects: PROJECTS, projectIds: [900, 901, 902, 903] })), [900, 901], 'AC2 Completed and Internal dropped even when listed');
        _assertEqual(ids(slaRollupProjects({ projects: PROJECTS, projectIds: [] })), [], 'AC2 an empty scope is empty');
        _assertEqual(JSON.stringify(PROJECTS), before, 'AC2 input not mutated');
      },
    },
    {
      name: 'N-385 slaProjectResults + slaRollupModel — same engine, fixed 90-day period, row metrics',
      fn: function () {
        const today = _slaToday(30);
        const m = model(PROJECTS, today);
        _assertEqual(Object.keys(m.results).sort(), ['900', '901', '902', '903', '904'], 'AC3 one entry per project');
        _assertEqual(m.results['900'], _slaRun({ today: today }), 'AC3 equals computeProjectSla');
        _assertEqual([m.results['903'], m.results['904']], [null, null], 'AC3 Internal / Transformation: no SLAs');
        const direct = slaPortfolioModel({ projects: PROJECTS, results: m.results, periodKey: '90d', today: today });
        _assertEqual(m.model, direct, 'AC4 roll-up = portfolio model over 90d');
        _assertEqual(m.model.period.key, '90d', 'AC4 period');
        _assertEqual(m.model.period.toDay, localDayISO(today), 'AC4 ends today');
        _assertEqual(m.model.period.fromDay, addDaysISO(localDayISO(today), -(CONFIG.SLA.PERIODS[0].days - 1)), 'AC4 starts 89 days back (BST->GMT safe)');
        const rows = m.model.rows;
        _assertEqual(rows.map(r => r.projectId).sort(), ['900', '901', '902'], 'AC4 null results (Internal, Transformation) skipped; status filtering is slaRollupProjects\'s job');
        const a = rows.find(r => r.projectId === '900');
        _assertEqual(a.metrics.map(x => x.key), CONFIG.SLA.METRICS.map(x => x.key), 'AC4 four metrics in order');
        const att = slaAttainment(m.results['900'], m.model.period.fromDay, m.model.period.toDay);
        a.metrics.forEach(x => {
          _assertEqual(x.target, att[x.key].target, 'AC4 target ' + x.key);
          if (att[x.key].target === null) _assertEqual([x.pct, x.rag], [null, 'grey'], 'AC4 no target ' + x.key);
          else _assertEqual(x.pct, att[x.key].pct, 'AC4 pct ' + x.key);
        });
        ['projectId', 'name', 'rag', 'ongoingBreaches', 'problems', 'summary'].forEach(k => _assertEqual(k in a, true, 'AC4 field kept: ' + k));
        // The fixed period ignores the panel toggle (set before, restored after).
        _assertEqual(slaRollupModel({ projects: PROJECTS, results: m.results, today: today }).period.key, '90d', 'AC4 independent of the toggle');
      },
    },
    {
      name: 'N-385 scope — a DM-style project list gives exactly those rows, un-narrowed figures',
      fn: function () {
        const today = _slaToday(30);
        const all = model(slaRollupProjects({ projects: PROJECTS, projectIds: null }), today).model;
        const dm = model(slaRollupProjects({ projects: PROJECTS, projectIds: ['900'] }), today).model;
        _assertEqual(dm.rows.map(r => r.projectId), ['900'], 'AC5 only the DM\'s project');
        _assertEqual(dm.rows[0], all.rows.find(r => r.projectId === '900'), 'AC5 same figures as the all-projects view');
        const total = dm.counts.green + dm.counts.amber + dm.counts.red + dm.counts.grey;
        _assertEqual(total, 1, 'AC5 counts cover only that project');
      },
    },
    {
      name: 'N-385 markup — slaRollupHtml / slaRollupUnavailableHtml',
      fn: function () {
        const m = model(ELIGIBLE).model;
        const html = slaRollupHtml(m);
        _assertEqual(html.indexOf('Last 90 days') > -1, true, 'AC7 period label');
        _assertEqual(CONFIG.SLA.METRICS.every(x => html.indexOf('<th>' + x.label + '</th>') > -1), true, 'AC7 one column per metric');
        _assertEqual((html.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr>/g) || []).length, m.rows.length, 'AC7 a row per project');
        _assertEqual(html.indexOf('rag-text') > -1 && html.indexOf('sc-rag-pill--') > -1, true, 'AC7 pill + rag text');
        _assertEqual(/on[a-z]+\s*=\s*"|style\s*=/.test(html.replace(/&lt;[^]*?&gt;/g, '')), false, 'AC7 no inline handlers or styles');
        _assertEqual(/data-act|setSlaPeriod|btn-filter|filter-group/.test(html), false, 'AC7 no toggle, no action');
        _assertEqual(html.indexOf('<img') === -1 && html.indexOf('&lt;img') > -1, true, 'AC7 hostile project name inert');
        const red = { period: m.period, counts: { green: 0, amber: 0, red: 1, grey: 0 }, metrics: [], rows: [{
          projectId: '1', name: 'R', rag: 'red', ongoingBreaches: 2, summary: 'Time to offer 40%',
          metrics: CONFIG.SLA.METRICS.map((x, i) => ({ key: x.key, label: x.label, target: i ? 5 : null, pct: i === 1 ? 40 : (i ? 90 : null), rag: i === 1 ? 'red' : (i ? 'green' : 'grey') })) }] };
        const rh = slaRollupHtml(red);
        _assertEqual(rh.indexOf('rag-text--red') > -1 && rh.indexOf('rag-text--green') > -1, true, 'AC7 red and green rag text');
        _assertEqual(rh.indexOf('<td>—</td>') > -1 && rh.indexOf('<td>2</td>') > -1, true, 'AC7 dash for no pct, count for ongoing');
        _assertEqual(/rag-text--red">[^<]*<\/span>|rag-text--red"><span[^>]*>/.test(rh), true, 'AC7 red carries the marker');
        _assertEqual(slaRollupHtml({ period: m.period, counts: { green: 0, amber: 0, red: 0, grey: 0 }, metrics: [], rows: [] }).indexOf('No projects have SLA targets yet.') > -1, true, 'AC7 empty state');
        const un = slaRollupUnavailableHtml('SLA roll-up');
        _assertEqual([un.indexOf("SLA roll-up couldn't be loaded.") > -1, un.indexOf('<table') === -1], [true, true], 'AC8 unavailable line only');
        _assertEqual(slaRollupHtml(null).indexOf("couldn't be loaded") > -1, true, 'AC8 null model = unavailable');
      },
    },
    {
      name: 'N-385 getSlaRollupInputs — unwindowed reads, internal rows removed, only rejected offers degrade',
      fn: function () {
        const keep = { u: getUserProjectIds, p: getProjects, r: getAllRoles, w: getWeeklyActivity, pl: getPlacements, h: getAllHeadcount, t: getSLATargets, s: getRoleStageHistory, ro: getRejectedOffers };
        const seen = {}, never = () => new Promise(function () {});
        try {
          getUserProjectIds = function (e) { seen.u = e; return never(); };
          getProjects = function (a) { seen.p = a; return never(); };
          getAllRoles = function () { seen.r = true; return never(); };
          getWeeklyActivity = function (a, b, o) { seen.w = [a, b, o]; return never(); };
          getPlacements = function (a, o) { seen.pl = [a, o]; return never(); };
          getAllHeadcount = function () { seen.h = true; return never(); };
          getSLATargets = function () { seen.t = true; return never(); };
          getRoleStageHistory = function () { seen.s = true; return never(); };
          getRejectedOffers = function (a, o) { seen.ro = [a, o]; return never(); };
          getSlaRollupInputs('dm@x.com');
        } finally { getUserProjectIds = keep.u; getProjects = keep.p; getAllRoles = keep.r; getWeeklyActivity = keep.w; getPlacements = keep.pl; getAllHeadcount = keep.h; getSLATargets = keep.t; getRoleStageHistory = keep.s; getRejectedOffers = keep.ro; }
        _assertEqual(seen.u, 'dm@x.com', 'AC6 scope by the user\'s project ids');
        _assertEqual([seen.w, seen.pl, seen.ro], [[null, null, undefined], [null, undefined], [null, undefined]], 'AC6 company-wide, no window, no role ids');
        _assertEqual([seen.p, seen.r, seen.h, seen.t, seen.s], [false, true, true, true, true], 'AC6 every project, roles, headcount, targets, stage history');
        if (typeof ALL_SOURCES === 'undefined') _skip('source scan needs the filesystem (node tests/run.js)');
        const loader = body(ALL_SOURCES['api.js'], 'async function getSlaRollupInputs(');
        _assertEqual(loader.indexOf('sinceWeeks') === -1 && loader.indexOf('fromDay') === -1, true, 'AC6 no window');
        _assertEqual((loader.match(/\.catch\(/g) || []).length === 1 && /getRejectedOffers\([^\n]*\.catch\(/.test(loader), true, 'AC6 only rejected offers degrade; the rest throw');
        _assertEqual(/excludeInternalProjectData\(/.test(loader) && /slaRollupProjects\(/.test(loader), true, 'AC6 internal rows removed, project list scoped');
      },
    },
    {
      name: 'N-385 Command Centre wiring — slot under the scorecards, toggle leaves it alone, cached, gated',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('source scan needs the filesystem (node tests/run.js)');
        const S = ALL_SOURCES, cc = S['cc-pages.js'];
        const detail = body(cc, 'function renderHealthDetail(');
        const wrapAt = detail.indexOf('id="cc-health-cards-wrap"'), slotAt = detail.indexOf('id="cc-sla-slot"');
        _assertEqual(wrapAt > -1 && slotAt > wrapAt, true, 'AC9 SLA slot is after the scorecards');
        _assertEqual(/ccMountSlaRollup\(data\)/.test(detail), true, 'AC9 mounted when the detail opens');
        const win = body(cc, 'function ccHealthWindow(');
        _assertEqual(win.indexOf("getElementById('cc-health-cards-wrap')") > -1 && win.indexOf('cc-tile__detail') === -1 && win.indexOf('SlaRollup') === -1, true, 'AC10 the window toggle re-renders only the scorecards');
        const mount = body(cc, 'async function ccMountSlaRollup(');
        _assertEqual(/if \(data\.slaRollup\)/.test(mount) && /data\.slaRollup = slaRollupModel\(/.test(mount), true, 'AC9 cached on the grid data, no read on re-expand');
        _assertEqual(/canViewSlaPortfolio\(role\)/.test(mount) && /slaRollupUnavailableHtml\(/.test(mount) && /live\(\)/.test(mount), true, 'AC9/11 gated, failure isolated, stale result dropped');
        _assertEqual(mount.indexOf('setSlaPeriod') === -1 && mount.indexOf('_slaPeriod') === -1, true, 'AC10 no period control');
        _assertEqual(/ccHealthStats\(roles, acts13, stageHistory, openSince\)/.test(body(cc, 'async function renderCCOverview(')) && /ragHealth/.test(body(cc, 'async function renderCCOverview(')), true, 'AC9 tile headline unchanged');
        if (typeof ALL_HTML !== 'undefined') {
          const cch = ALL_HTML['command-centre.html'], rph = ALL_HTML['reporting.html'];
          _assertEqual(cch.indexOf('js/sla-rollup.js') > cch.indexOf('js/analytics.js') && cch.indexOf('js/sla-rollup.js') > cch.indexOf('js/ui-kit.js') && cch.indexOf('js/sla-rollup.js') < cch.indexOf('js/cc-pages.js'), true, 'script on command-centre.html after analytics / ui-kit, before cc-pages');
          _assertEqual(rph.indexOf('js/sla-rollup.js') > -1 && rph.indexOf('js/sla-rollup.js') < rph.indexOf('js/sla-panel.js') && rph.indexOf('js/sla-rollup.js') < rph.indexOf('js/dashboard-project-panels.js'), true, 'script on reporting.html before sla-panel and the report panels');
        }
      },
    },
    {
      name: 'N-385 Report Builder wiring — company-only, capability-gated, read only when present, safe print',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('source scan needs the filesystem (node tests/run.js)');
        const S = ALL_SOURCES, rb = S['report-builder.js'], pp = S['dashboard-project-panels.js'];
        _assertEqual(/key: 'slaRollup'[^}]*scope: 'company'[^}]*group: 'Delivery Assurance'[^}]*cap: 'slaRollupReport'/.test(rb), true, 'AC12 palette entry: company scope, own group, capability');
        _assertEqual(/\.filter\(m => !m\.cap \|\| roleCan\(_resolvedRole, m\.cap\)\)/.test(rb), true, 'AC12 tile hidden without the capability');
        const fetchBody = body(rb, 'async function rbFetchData(');
        const projectBranch = fetchBody.slice(0, fetchBody.indexOf('} else {'));
        _assertEqual(projectBranch.indexOf('slaRollup') === -1 && projectBranch.indexOf('getSlaRollupInputs') === -1, true, 'AC12/13 project scope never reads it');
        _assertEqual(/_rbBlocks\.some\(b => b\.type === 'panel' && b\.key === 'slaRollup'\) && canViewSlaRollupReport\(_resolvedRole\)/.test(fetchBody), true, 'AC13 read only when the module is present and allowed');
        const load = body(rb, 'async function rbLoadSlaRollup(');
        _assertEqual(/catch \(e\)[\s\S]*return null/.test(load) && /getSlaRollupInputs\(getCurrentUser\(\)\.email\)/.test(load), true, 'AC13 failure -> null, scoped to the user');
        _assertEqual(/slaRollup: \(data\) =>[\s\S]*canViewSlaRollupReport\(_resolvedRole\)\) return ''[\s\S]*slaRollupUnavailableHtml/.test(pp), true, 'AC13 empty for a viewer without the capability; unavailable line on a failed read');
        const save = body(rb, 'async function rbSaveReport(');
        _assertEqual(save.indexOf('slaRollup') === -1, true, 'AC14 saved-report shape unchanged: the block is stored like any other panel');
      },
    },
    {
      name: 'N-385 independence — no benchmark / stage / literal coupling in the new pure functions',
      fn: function () {
        _assertEqual(CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays, 45, 'AC15 KPI pace unchanged');
        [slaRollupProjects, slaProjectResults, slaRollupModel].forEach(fn => {
          const src = fn.toString();
          ['ANALYTICS_BENCHMARKS', 'ROLE_STAGE_BUDGETS', 'ACTIVE_STAGES', 'TTF_CENSORED_STAGES'].forEach(t => _assertEqual(src.indexOf(t), -1, 'AC15 ' + fn.name + ' has no ' + t));
          _assertEqual(/\b(80|60|90|25)\b/.test(src), false, 'AC15 ' + fn.name + ' has no band / period / cap literal');
        });
        if (typeof ALL_SOURCES === 'undefined') return;
        const r = ALL_SOURCES['sla-rollup.js'];
        _assertEqual(/\b(80|60|90|25)\b/.test(r.replace(/\/\/.*$/gm, '')) || /#[0-9a-fA-F]{3,6}\b/.test(r), false, 'AC15 no literals or hex in the markup file');
        _assertEqual(r.indexOf('_slaMounts') === -1 && r.indexOf('_slaPeriod') === -1, true, 'AC10 the roll-up never joins the toggle');
      },
    }
  );
})();