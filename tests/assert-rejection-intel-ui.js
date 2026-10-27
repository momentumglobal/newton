// tests/assert-rejection-intel-ui.js — Rejection Intelligence surfaces (N-388, DA-8): capabilities
// and access, the view models (page, strip, report), money gating, the scope rule, the loader's
// reads, markup, and the page / dashboard / Report Builder wiring. Loads AFTER
// tests/assert-rejection-intel.js (reuses FIXTURES.rejectionIntel) and pushes into ASSERTIONS.
// The runner is synchronous, so the async mounts are covered by source scans plus the
// synchronous reach of getRejectionIntelInputs.

(function () {
  const F = FIXTURES.rejectionIntel;
  const throwsOn = (fn, label) => { let t = false; try { fn(); } catch (e) { t = true; } if (!t) throw new Error(label + ': expected a throw'); };
  const body = (src, start) => { const i = src.indexOf(start); if (i < 0) return ''; const m = /\r?\n\}\r?\n/.exec(src.slice(i)); return m ? src.slice(i, i + m.index + m[0].length) : src.slice(i); };
  const allKeys = (v, out = []) => {
    if (Array.isArray(v)) v.forEach(x => allKeys(x, out));
    else if (v && typeof v === 'object') Object.keys(v).forEach(k => { out.push(k); allKeys(v[k], out); });
    return out;
  };
  const HOSTILE = 'Alpha <img src=x onerror=alert(1)>';
  const PROJECTS = [{ id: 10, CustomerName: HOSTILE }, { id: 20, CustomerName: 'Beta' }];
  const NAMES = ['Candidate One', 'private note'];
  const summary = inc => rejectionIntelSummary({ rejections: F.rejections, roles: F.roles, activity: F.activity, models: F.models, lciRows: F.lciRows, includeFigures: inc });
  const page = (inc, dim, extra) => rejectionIntelPageModel(Object.assign({ summary: summary(inc), projects: PROJECTS, dim: dim || 'project', includeFigures: inc, benchmarkUnavailable: false, weeks: 0 }, extra || {}));
  const clone = v => JSON.parse(JSON.stringify(v));
  // An amount key: offer / bench / median / min / max (the N-387 rule), plus ccy.
  const MONEY_KEY = /^(offer|bench)[A-Z]|^(offer|bench|median|min|max)$|^ccy$/;
  const ROLES = ['admin', 'leadership', 'delivery_manager', 'talent_partner', 'people_ops', 'sales', 'staff', 'viewer', 'nobody'];

  ASSERTIONS.push(
    {
      name: 'N-388 capabilities + access — four capabilities, Leadership on the Rejected Offers page',
      fn: function () {
        const C = CONFIG.ROLE_CAPABILITIES;
        _assertEqual(C.rejectionIntelView, ['admin', 'leadership', 'delivery_manager'], 'AC1 view');
        _assertEqual(C.rejectionIntelFigures, ['admin', 'leadership'], 'AC1 figures');
        _assertEqual(C.rejectionsList, ['admin', 'delivery_manager', 'talent_partner'], 'AC1 list');
        _assertEqual(C.rejectionIntelReport, ['admin', 'delivery_manager'], 'AC1 report (N-396: no Leadership)');
        const who = fn => ROLES.filter(r => fn(r));
        _assertEqual(who(canViewRejectionIntel), ['admin', 'leadership', 'delivery_manager'], 'AC2 canViewRejectionIntel');
        _assertEqual(who(canViewRejectionIntelFigures), ['admin', 'leadership'], 'AC2 canViewRejectionIntelFigures');
        _assertEqual(who(canViewRejectionsList), ['admin', 'delivery_manager', 'talent_partner'], 'AC2 canViewRejectionsList');
        _assertEqual(who(canViewRejectionIntelReport), ['admin', 'delivery_manager'], 'AC2 canViewRejectionIntelReport');
        _assertEqual(canViewRejectionIntel('leadership') && canViewRejectionIntelFigures('leadership'), true, 'N-396 Leadership keeps the tab and figures');
        const bar = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'rejections');
        _assertEqual(bar.roles.slice().sort(), ['admin', 'delivery_manager', 'leadership', 'talent_partner'], 'AC1 command-bar roles');
        if (typeof ALL_SOURCES !== 'undefined') {
          const row = /\n\s*rejections:\s*\{[^}]*\}/.exec(ALL_SOURCES['router.js']);
          _assertEqual(!!row && /ADMIN[\s\S]*DELIVERY_MANAGER[\s\S]*TALENT_PARTNER[\s\S]*LEADERSHIP/.test(row[0]), true, 'AC1 router.js rejections page lists Leadership (mirrors the command bar)');
        }
        _assertEqual(canViewRejectionsList('leadership'), false, 'AC8 Leadership never gets the candidate list');
        _assertEqual(CONFIG.ROLE_CAPABILITIES.rejectionIntelView.includes('talent_partner'), false, 'AC8 TPs never get the tab');
      },
    },
    {
      name: 'N-388 rejectionGapText — direction words, level, claim gate',
      fn: function () {
        _assertEqual(rejectionGapText({ claim: true, gapMedianPct: -0.12 }).text, '12% below benchmark', 'AC3 below');
        _assertEqual(rejectionGapText({ claim: true, gapMedianPct: 0.08 }).text, '8% above benchmark', 'AC3 above');
        _assertEqual(rejectionGapText({ claim: true, gapMedianPct: 0.004 }).text, 'in line with benchmark', 'AC3 level');
        _assertEqual(rejectionGapText({ claim: true, gapMedianPct: -0.004 }).direction, 'level', 'AC3 level direction');
        _assertEqual(rejectionGapText({ claim: false, gapMedianPct: -0.12 }), null, 'AC3 no claim');
        _assertEqual(rejectionGapText({ claim: true, gapMedianPct: null }), null, 'AC3 no gap');
        _assertEqual(rejectionGapText(null), null, 'AC3 no salary');
      },
    },
    {
      name: 'N-388 rejectionIntelPageModel — reasons, claim gate, labels, whole-% funnel, order, purity',
      fn: function () {
        const m = page(true, 'project');
        _assertEqual(m.reasons.map(r => r.reason), CONFIG.REJECTION_REASONS.concat(['Unclassified']), 'AC4 every reason + Unclassified, config order');
        _assertEqual(m.reasons.reduce((s, r) => s + r.n, 0), m.totals.n, 'AC4 reasons add up to the total');
        _assertEqual(m.reasons.every(r => r.sharePct === null || Number.isInteger(r.sharePct)), true, 'AC4 whole-% shares');
        const a = m.clusters.find(c => c.key === '10'), b = m.clusters.find(c => c.key === '20');
        _assertEqual([a.claim, b.claim], [true, false], 'AC4 A claims, B does not');
        _assertEqual([a.topReason, b.topReason, b.topSharePct], ['Salary', null, null], 'AC4 B carries no top reason');
        _assertEqual(a.label, HOSTILE, 'AC4 project label from CustomerName (escaped by the markup)');
        _assertEqual(m.clusters.map(c => c.key), summary(true).byProject.clusters.map(c => c.key), 'AC4 engine order kept');
        _assertEqual(m.dimLabel, 'Project', 'dim label');
        const fa = m.funnel.rows.find(r => r.key === '10'), fb = m.funnel.rows.find(r => r.key === '20');
        _assertEqual(fa.steps.map(s => s.ratePct), [50, null, 8], 'AC4 A: claimed steps rounded, the thin step is null');
        _assertEqual(fa.steps.map(s => s.priorPct), [80, 20, 16], 'AC4 priors rounded (no raw floats)');
        _assertEqual(fb.steps.every(s => s.ratePct === null), true, 'AC4 B has no claimable step');
        _assertEqual(fa.worst, { from: 'Submitted', to: 'Offer' }, 'AC4 weakest step');
        _assertEqual(fb.worst, null, 'AC4 no weakest step without a claim');
        _assertEqual(m.funnel.steps.map(s => s.from + '>' + s.to), ['Submitted>Interview 1', 'Interview 1>Offer', 'Submitted>Offer'], 'AC4 funnel step labels');
        const loc = page(true, 'location');
        _assertEqual(loc.clusters.some(c => c.label === 'No location'), true, 'AC4 blank location label');
        _assertEqual(loc.dimLabel, 'Location', 'AC4 location dim label');
        _assertEqual(page(true, 'discipline').dimLabel, 'Discipline', 'AC4 discipline dim label');
        throwsOn(() => page(true, 'reason'), 'AC4 reason dim throws');
        throwsOn(() => page(true, 'nope'), 'AC4 unknown dim throws');
        _assertEqual(page(true, 'project', { weeks: 0 }).periodNote, '', 'AC9 All time: no note');
        _assertEqual(page(true, 'project', { weeks: 13 }).periodNote.indexOf('Last 13 weeks') === 0, true, 'AC9 a window explains itself');
        const s = summary(true), snap = clone(s);
        rejectionIntelPageModel({ summary: s, projects: PROJECTS, dim: 'project', includeFigures: true, weeks: 0 });
        _assertEqual(s, snap, 'AC14 the engine summary is not mutated');
        const empty = rejectionIntelPageModel({ summary: rejectionIntelSummary({}), projects: [], dim: 'location', includeFigures: false, weeks: 0 });
        _assertEqual([empty.totals.n, empty.clusters.length, empty.funnel.rows.length], [0, 0, 0], 'AC10 empty model');
      },
    },
    {
      name: 'N-388 money gating — no amounts in a model unless includeFigures; mixed currency; benchmark unavailable',
      fn: function () {
        const reportNoFig = () => rejectionIntelReportModel({ summary: summary(false), projects: PROJECTS, includeFigures: false, benchmarkUnavailable: false, periodLabel: 'This Year' });
        const stripNoFig = () => rejectionIntelProjectStrip({ summary: summary(false), projectId: 10, includeFigures: false });
        [['page', () => page(false, 'project')], ['location', () => page(false, 'location')], ['report', reportNoFig], ['strip', stripNoFig]].forEach(([name, make]) => {
          _assertEqual(allKeys(make()).filter(k => MONEY_KEY.test(k)), [], 'AC5 ' + name + ' model (no figures) has no money keys');
          const dump = JSON.stringify(make());
          _assertEqual(dump.indexOf('64750') === -1 && dump.indexOf('70000') === -1, true, 'AC5 ' + name + ' model has no fixture amount');
        });
        const withFig = page(true, 'project');
        _assertEqual(withFig.clusters.find(c => c.key === '10').figures, { ccy: 'RON', offerMedian: 64750, benchMedian: 70000, matched: 4 }, 'AC5 single-currency cluster carries figures');
        _assertEqual(withFig.clusters.find(c => c.key === '20').figures, null, 'AC5 a cluster below the salary claim has no figures');
        const mixed = clone(summary(true));
        const c10 = mixed.byProject.clusters.find(c => c.key === '10');
        c10.salary.mixedCurrency = true; c10.salary.offerMedian = null; c10.salary.benchMedian = null; delete c10.salary.ccy;
        const mc = rejectionIntelPageModel({ summary: mixed, projects: PROJECTS, dim: 'project', includeFigures: true, weeks: 0 }).clusters.find(c => c.key === '10');
        _assertEqual([mc.figures, mc.mixedCurrency], [null, true], 'AC5 mixed currencies: no figures, flagged');
        const leaky = rejectionIntelPageModel({ summary: summary(true), projects: PROJECTS, dim: 'project', includeFigures: false, weeks: 0 });
        _assertEqual(allKeys(leaky).filter(k => MONEY_KEY.test(k)), [], 'AC5 includeFigures false strips figures even from a figures summary');
        const un = page(true, 'project', { benchmarkUnavailable: true });
        _assertEqual(un.clusters.every(c => c.gap === null && c.figures === null), true, 'AC6 unavailable benchmark: no gap, no figures');
        _assertEqual(un.benchmarkUnavailable, true, 'AC6 flagged');
        const stripFig = rejectionIntelProjectStrip({ summary: summary(true), projectId: 10, includeFigures: true });
        const dump = JSON.stringify([page(true, 'project'), page(true, 'location'), stripFig]);
        NAMES.forEach(n => _assertEqual(dump.indexOf(n) === -1, true, 'AC6 no "' + n + '" in any model'));
        _assertEqual(allKeys([page(true, 'project'), stripFig]).filter(k => /^(Title|CandidateName|Notes|facts)$/.test(k)), [], 'AC6 no candidate keys, no facts array');
      },
    },
    {
      name: 'N-388 rejectionIntelProjectStrip — claimed facts only, empty, DM vs Admin',
      fn: function () {
        const a = rejectionIntelProjectStrip({ summary: summary(true), projectId: 10, includeFigures: true });
        _assertEqual([a.n, a.claim, a.topReason, a.topSharePct], [10, true, 'Salary', 60], 'AC12 project A strip');
        _assertEqual(a.gap.text, '8% below benchmark', 'AC12 gap (-0.075 rounds to 8)');
        _assertEqual(a.figures.offerMedian, 64750, 'AC12 Admin sees amounts');
        _assertEqual(a.worstStep, { from: 'Submitted', to: 'Offer', ratePct: 8, priorPct: 16 }, 'AC12 weakest step');
        _assertEqual(a.empty, false, 'AC12 not empty');
        const dm = rejectionIntelProjectStrip({ summary: summary(false), projectId: 10, includeFigures: false });
        _assertEqual([dm.gap.text, dm.figures], ['8% below benchmark', null], 'AC12 a DM sees the % gap and no amounts');
        const b = rejectionIntelProjectStrip({ summary: summary(true), projectId: 20, includeFigures: true });
        _assertEqual([b.claim, b.topReason, b.gap, b.worstStep], [false, null, null, null], 'AC12 project B: nothing claimed');
        _assertEqual([b.n, b.empty, b.minRejections], [3, false, 5], 'AC12 B has rejections, so the strip shows the "needs 5" line');
        const none = rejectionIntelProjectStrip({ summary: summary(true), projectId: 999, includeFigures: true });
        _assertEqual([none.n, none.empty], [0, true], 'AC12 unknown project: empty');
        const un = rejectionIntelProjectStrip({ summary: summary(true), projectId: 10, includeFigures: true, benchmarkUnavailable: true });
        _assertEqual([un.gap, un.figures, un.benchmarkUnavailable], [null, null, true], 'AC6 strip with no benchmark');
      },
    },
    {
      name: 'N-388 rejectionIntelScopeRows — DM sees only their projects, unlinked rows belong to nobody',
      fn: function () {
        const all = rejectionIntelScopeRows({ projectIds: null, roles: F.roles, rejections: F.rejections, activity: F.activity });
        _assertEqual([all.roles.length, all.rejections.length, all.activity.length], [F.roles.length, F.rejections.length, F.activity.length], 'AC7 null = everything, including unlinked rows');
        const dm = rejectionIntelScopeRows({ projectIds: ['10'], roles: F.roles, rejections: F.rejections, activity: F.activity });
        _assertEqual(dm.roles.every(r => String(projectIdForRole(r)) === '10'), true, 'AC7 only project 10 roles');
        const ids = new Set(dm.roles.map(r => String(r.id)));
        _assertEqual(dm.rejections.every(r => ids.has(String(r.RoleIDLookupId))), true, 'AC7 only rejections on those roles');
        _assertEqual(dm.activity.every(a => ids.has(String(a.RoleIDLookupId))), true, 'AC7 only activity on those roles');
        _assertEqual(dm.rejections.length < F.rejections.length && dm.rejections.length > 0, true, 'AC7 narrowed, not emptied');
        const unlinked = F.rejections.filter(r => !F.roles.some(x => String(x.id) === String(r.RoleIDLookupId)));
        _assertEqual(unlinked.length > 0 && dm.rejections.every(r => unlinked.indexOf(r) === -1), true, 'AC7 an unlinked rejection never reaches a DM');
        _assertEqual(rejectionIntelScopeRows({ projectIds: [10], roles: F.roles, rejections: F.rejections, activity: F.activity }).roles.length, dm.roles.length, 'AC7 ids compared as strings');
        _assertEqual(rejectionIntelScopeRows({ projectIds: [], roles: F.roles, rejections: F.rejections, activity: F.activity }).rejections, [], 'AC7 no projects, no rows');
        const before = clone(F.rejections);
        rejectionIntelScopeRows({ projectIds: ['10'], roles: F.roles, rejections: F.rejections, activity: F.activity });
        _assertEqual(F.rejections, before, 'AC14 inputs not mutated');
        const s = rejectionIntelSummary({ rejections: dm.rejections, roles: dm.roles, activity: dm.activity, models: F.models, lciRows: F.lciRows, includeFigures: false });
        _assertEqual(s.byProject.clusters.map(c => c.key), ['10'], 'AC7 DM summary has only their project');
      },
    },
    {
      name: 'N-388 getRejectionIntelInputs — reads, window, internal rows removed, only the LCI reads degrade',
      fn: function () {
        const keep = { u: getUserProjectIds, p: getProjects, r: getAllRoles, w: getWeeklyActivity, ro: getRejectedOffers, m: getLCIModels, l: getAllLCIModelRows };
        const seen = {}, never = () => new Promise(function () {});
        try {
          getUserProjectIds = function (e) { seen.u = e; return never(); };
          getProjects = function (a) { seen.p = a; return never(); };
          getAllRoles = function () { seen.r = true; return never(); };
          getWeeklyActivity = function (a, b, o) { seen.w = [a, b, o]; return never(); };
          getRejectedOffers = function (a, o) { seen.ro = [a, o]; return never(); };
          getLCIModels = function () { seen.m = true; return never(); };
          getAllLCIModelRows = function () { seen.l = true; return never(); };
          getRejectionIntelInputs('dm@x.com', { weeks: 13 });
        } finally { getUserProjectIds = keep.u; getProjects = keep.p; getAllRoles = keep.r; getWeeklyActivity = keep.w; getRejectedOffers = keep.ro; getLCIModels = keep.m; getAllLCIModelRows = keep.l; }
        _assertEqual(seen.u, 'dm@x.com', 'AC7 scope by the user\'s project ids');
        _assertEqual([seen.p, seen.r, seen.m, seen.l], [false, true, true, true], 'AC7 every project, roles, LCI models and rows');
        _assertEqual(seen.ro[0], null, 'AC7 company-wide rejections');
        _assertEqual(seen.ro[1].fromDay, weeksAgoDay(13), 'AC7 a window passes fromDay');
        _assertEqual(seen.w, [null, null, undefined], 'AC7 activity read un-windowed (trimmed in code by Sunday weeks)');
        if (typeof ALL_SOURCES === 'undefined') _skip('source scan needs the filesystem (node tests/run.js)');
        const loader = body(ALL_SOURCES['api.js'], 'async function getRejectionIntelInputs(');
        _assertEqual((loader.match(/\.catch\(/g) || []).length === 2 && /getLCIModels\(\)\.catch\(/.test(loader) && /getAllLCIModelRows\(\)\.catch\(/.test(loader), true, 'AC7 only the two LCI reads degrade; the rest throw');
        _assertEqual(/excludeInternalProjectData\(/.test(loader) && /rejectionIntelScopeRows\(/.test(loader) && /activitySinceWeeks\(/.test(loader), true, 'AC7 internal rows removed, scoped, windowed by Sunday weeks');
        _assertEqual(/benchmarkUnavailable/.test(loader), true, 'AC7 an LCI failure is flagged, not silent');
        _assertEqual(/fromDay: weeksAgoDay\(weeks\)/.test(loader), true, 'AC9 weeks 0 stays All time (no bound)');
      },
    },
    {
      name: 'N-388 markup — tab, report, strip, unavailable: sections, wording, gating, XSS, no inline handlers',
      fn: function () {
        const m = page(true, 'project');
        const tab = rejectionIntelTabHtml(m, { dim: 'project' });
        ['Why offers are rejected', 'By project', 'Where candidates drop out', 'Weakest step'].forEach(s => _assertEqual(tab.indexOf(s) > -1, true, 'AC10 tab has "' + s + '"'));
        _assertEqual(tab.indexOf('8% below benchmark') > -1, true, 'AC10 gap wording');
        _assertEqual(tab.indexOf('▼') > -1, true, 'AC10 direction glyph, not colour alone');
        _assertEqual(tab.indexOf('Too few to read (3)') > -1, true, 'AC10 sub-minimum row');
        _assertEqual(tab.indexOf('Offer vs benchmark (median)') > -1 && tab.indexOf('RON 64,750 vs 70,000') > -1, true, 'AC5 Admin/Leadership see the figures column');
        _assertEqual((tab.match(/rej-intel-dims/g) || []).length, 1, 'AC10 one dimension switcher');
        _assertEqual(/class="btn-filter active"[^>]*>Project</.test(tab), true, 'AC10 active dimension marked');
        _assertEqual(tab.indexOf('Salary vs benchmark') > -1, true, 'AC10 salary column');
        _assertEqual(tab.indexOf(HOSTILE) === -1 && tab.indexOf('Alpha &lt;img') > -1, true, 'AC10 hostile project name is inert');
        const dmTab = rejectionIntelTabHtml(page(false, 'project'), { dim: 'project' });
        _assertEqual(dmTab.indexOf('Offer vs benchmark') === -1 && dmTab.indexOf('64,750') === -1 && dmTab.indexOf('8% below benchmark') > -1, true, 'AC5 a DM tab: % gap, no amounts column');
        const mixed = clone(summary(true)); const c10 = mixed.byProject.clusters.find(c => c.key === '10');
        c10.salary.mixedCurrency = true; c10.salary.offerMedian = null; c10.salary.benchMedian = null;
        _assertEqual(rejectionIntelTabHtml(rejectionIntelPageModel({ summary: mixed, projects: PROJECTS, dim: 'project', includeFigures: true, weeks: 0 }), { dim: 'project' }).indexOf('Mixed currencies') > -1, true, 'AC5 mixed currencies');
        _assertEqual(rejectionIntelTabHtml(page(true, 'project', { benchmarkUnavailable: true }), { dim: 'project' }).indexOf('Benchmark unavailable') > -1, true, 'AC10 benchmark unavailable shown in the salary column');
        const emptyTab = rejectionIntelTabHtml(rejectionIntelPageModel({ summary: rejectionIntelSummary({}), projects: [], dim: 'project', includeFigures: false, weeks: 0 }), { dim: 'project' });
        _assertEqual(emptyTab.indexOf('No rejections in this period.') > -1 && emptyTab.indexOf('<table') === -1, true, 'AC10 empty state');
        [tab, dmTab, emptyTab].forEach(h => _assertEqual(/\son(click|change|input|dblclick)=/.test(h) || /\sstyle=/.test(h), false, 'AC10 no inline handlers or styles'));
        _assertEqual(rejectionIntelTabHtml(null).indexOf("couldn't be loaded") > -1, true, 'AC10 null model -> unavailable line');
        const rep = rejectionIntelReportHtml(rejectionIntelReportModel({ summary: summary(false), projects: PROJECTS, includeFigures: false, periodLabel: 'This Year' }), { title: 'Rejection Intelligence' });
        _assertEqual(rep.indexOf('This Year') > -1 && rep.indexOf('Why offers are rejected') > -1 && rep.indexOf('rej-intel-dims') === -1, true, 'AC13 report: period label, sections, no dimension switcher');
        _assertEqual(rep.indexOf('64,750') === -1 && rep.indexOf('Offer vs benchmark') === -1, true, 'AC13 a DM report has no amounts');
        _assertEqual(rejectionIntelReportHtml(null, { title: 'X' }).indexOf("couldn't be loaded") > -1, true, 'AC13 failed read -> unavailable line');
        const strip = rejectionIntelStripHtml(rejectionIntelProjectStrip({ summary: summary(true), projectId: 10, includeFigures: true }));
        _assertEqual(strip.indexOf('Rejection insight') > -1 && strip.indexOf('Salary (60% of 10)') > -1 && strip.indexOf('8% below benchmark') > -1 && strip.indexOf('RON 64,750 vs 70,000') > -1 && strip.indexOf('Submitted → Offer: 8% (vs 16%)') > -1, true, 'AC12 strip facts');
        _assertEqual(strip.indexOf('All time') > -1, true, 'AC12 the strip says it is All time');
        const dmStrip = rejectionIntelStripHtml(rejectionIntelProjectStrip({ summary: summary(false), projectId: 10, includeFigures: false }));
        _assertEqual(dmStrip.indexOf('64,750') === -1 && dmStrip.indexOf('8% below benchmark') > -1, true, 'AC12 DM strip: % only');
        const thin = rejectionIntelStripHtml(rejectionIntelProjectStrip({ summary: summary(true), projectId: 20, includeFigures: true }));
        _assertEqual(thin.indexOf('Not enough rejections yet to draw conclusions (needs 5).') > -1 && thin.indexOf('<ul') === -1, true, 'AC12 thin project: the muted line only');
        _assertEqual(rejectionIntelStripHtml(rejectionIntelProjectStrip({ summary: summary(true), projectId: 999, includeFigures: true })), '', 'AC12 nothing to say -> nothing rendered');
        _assertEqual(rejectionIntelStripHtml(null), '', 'AC12 null strip');
        const bar = rejectionsTabBarHtml('intel');
        _assertEqual(bar.indexOf('setRejectionsTab') > -1 && /class="btn-filter active"[^>]*>Rejection Intelligence</.test(bar), true, 'AC8 tab bar marks the active tab');
        _assertEqual(rejectionIntelUnavailableHtml('Rejection Intelligence').indexOf("Rejection Intelligence couldn't be loaded.") > -1, true, 'AC10 unavailable line');
      },
    },
    {
      name: 'N-388 page wiring — tabs by role, Leadership has no list path, shared period, stale result dropped',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('source scan needs the filesystem (node tests/run.js)');
        const pg = ALL_SOURCES['pages.js'];
        const render = body(pg, 'async function renderRejectionsPage(');
        _assertEqual(/canViewRejectionsList\(_resolvedRole\)/.test(render) && /canViewRejectionIntel\(_resolvedRole\)/.test(render), true, 'AC8 tabs decided by capability');
        const gate = render.indexOf('return renderRejectionIntelTab(');
        const listFetch = render.indexOf('getRejectedOffers(');
        _assertEqual(gate > -1 && listFetch > gate, true, 'AC8 the Intelligence-only path returns before the list fetch (Leadership never loads list rows)');
        _assertEqual(/_rejIntelToken\+\+/.test(render), true, 'AC11 every render supersedes an in-flight Intelligence load');
        _assertEqual(/tabBar: canIntel \? rejectionsTabBarHtml\('list'\) : ''/.test(render), true, 'AC8 TPs get no tab bar');
        const tab = body(pg, 'async function renderRejectionIntelTab(');
        _assertEqual(/periodFilterDropdown\(_rejectionsWeeks, 'setRejectionsWeeks'\)/.test(tab), true, 'AC9 the shared period dropdown');
        _assertEqual(tab.indexOf('projectFilterDropdown') === -1 && tab.indexOf('listSearchBox') === -1 && tab.indexOf('pageSizeDropdown') === -1 && tab.indexOf('Log Rejection') === -1, true, 'AC9 no list controls and no "+ Log Rejection" on the tab');
        _assertEqual(/token !== _rejIntelToken\) return/.test(tab) && /getRejectionIntelInputs\(/.test(tab) && /canViewRejectionIntelFigures\(_resolvedRole\)/.test(tab), true, 'AC11 stale result dropped; figures only for the capability');
        _assertEqual(/rejectionIntelUnavailableHtml\(/.test(tab), true, 'AC10 failure -> unavailable line');
        _assertEqual(/^let _rejectionsWeeks\s+= CONFIG\.REJECTIONS_DEFAULT_WEEKS;/m.test(pg) && CONFIG.REJECTIONS_DEFAULT_WEEKS === 0, true, 'AC9 default stays All time (N-152)');
        _assertEqual(/setRejectionsTab,\s*\n\s*setRejectionIntelDim,/.test(pg), true, 'actions registered');
        if (typeof ALL_HTML !== 'undefined') {
          const rph = ALL_HTML['reporting.html'];
          const at = f => rph.indexOf('js/' + f);
          _assertEqual(at('rejection-intel.js') > at('analytics.js') && at('rejection-intel.js') < at('pages.js') && at('rejection-intel.js') < at('dashboard-project-panels.js'), true, 'script on reporting.html after analytics, before pages and the report panels');
        }
      },
    },
    {
      name: 'N-388 dashboard strip + Report Builder wiring — slot outside the grid, capability-gated, read only when present',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('source scan needs the filesystem (node tests/run.js)');
        const S = ALL_SOURCES, dp = S['dashboard-project.js'], rb = S['report-builder.js'], pp = S['dashboard-project-panels.js'];
        const render = body(dp, 'async function renderProjectDashboard(');
        const slotAt = render.indexOf("id='proj-rejintel-slot'"), gridAt = render.indexOf("id='proj-detail-grid'");
        _assertEqual(slotAt > -1 && slotAt < gridAt, true, 'AC12 strip slot is outside (above) #proj-detail-grid, so setDetailPeriod cannot wipe it');
        _assertEqual(/isDMAdmin \? `<div id='proj-rejintel-slot'><\/div>` : ''/.test(render), true, 'AC12 Admin / DM only');
        _assertEqual(/mountRejectionIntelStrip\('proj-rejintel-slot'/.test(render), true, 'AC12 mounted after paint');
        const mount = body(dp, 'async function mountRejectionIntelStrip(');
        _assertEqual(/getRejectionIntelInputs\(getCurrentUser\(\)\.email, \{ weeks: 0, role: _resolvedRole \}\)/.test(mount) && /canViewRejectionIntelFigures\(_resolvedRole\)/.test(mount), true, 'AC12 All time; amounts only with the capability');
        _assertEqual(/catch \(e\)/.test(mount) && !/rejectionIntelUnavailableHtml/.test(mount), true, 'AC12 a failed read leaves the slot empty, no error text');
        _assertEqual(/dataset\.token/.test(mount), true, 'AC12 a stale result is dropped');
        _assertEqual(body(pp, 'function renderRejectionPanel(').indexOf('rejectionIntel') === -1, true, 'AC12 renderRejectionPanel untouched');
        _assertEqual(/key: 'rejectionIntel'[^}]*scope: 'company'[^}]*group: 'Delivery Assurance'[^}]*cap: 'rejectionIntelReport'/.test(rb), true, 'AC13 palette entry: company scope, own group, capability');
        const fetchBody = body(rb, 'async function rbFetchData(');
        const projectBranch = fetchBody.slice(0, fetchBody.indexOf('} else {'));
        _assertEqual(projectBranch.indexOf('rejectionIntel') === -1 && projectBranch.indexOf('RejectionIntel') === -1, true, 'AC13 project scope never reads it');
        _assertEqual(/_rbBlocks\.some\(b => b\.type === 'panel' && b\.key === 'rejectionIntel'\) && canViewRejectionIntelReport\(_resolvedRole\)/.test(fetchBody), true, 'AC13 read only when the module is present and allowed');
        const load = body(rb, 'async function rbLoadRejectionIntel(');
        _assertEqual(/catch \(e\)[\s\S]*return null/.test(load) && /getRejectionIntelInputs\(getCurrentUser\(\)\.email, \{ weeks: 0, role: _resolvedRole \}\)/.test(load), true, 'AC13 failure -> null, un-windowed, scoped to the user and role');
        const panel = pp.slice(pp.indexOf('rejectionIntel: (data, period)'));
        _assertEqual(/canViewRejectionIntelReport\(_resolvedRole\)\) return ''/.test(panel) && /rejectionIntelUnavailableHtml\(/.test(panel), true, 'AC13 empty without the capability; unavailable line on a failed read');
        _assertEqual(/rejectionInPeriod\(r, start, end\)/.test(panel) && /activityInDetailPeriod\(a, period\)/.test(panel), true, 'AC13 windowed by the report period with the existing rules');
        _assertEqual(/canViewRejectionIntelFigures\(_resolvedRole\)/.test(panel), true, 'AC13 amounts only for Admin / Leadership viewers');
        _assertEqual(body(rb, 'async function rbSaveReport(').indexOf('rejectionIntel') === -1, true, 'AC13 saved-report shape unchanged');
      },
    },
    {
      name: 'N-388 purity + independence — view-model functions do no I/O, hard-code no threshold, leave the engine alone',
      fn: function () {
        [rejectionGapText, rejectionIntelPageModel, rejectionIntelReportModel, rejectionIntelProjectStrip, rejectionIntelScopeRows].forEach(fn => {
          const src = fn.toString().replace(/'[^']*'|"[^"]*"/g, "''");   // code only: wording in strings is not I/O
          _assertEqual(/\b(getItems|fetch|document|window|localStorage|sessionStorage)\b/.test(src), false, 'AC14 ' + fn.name + ' does no I/O');
          _assertEqual(/ANALYTICS_BENCHMARKS|ACTIVE_STAGES|ROLE_STAGE_BUDGETS|TTF_CENSORED_STAGES/.test(src), false, 'AC14 ' + fn.name + ' reads no benchmark / stage list');
          _assertEqual(/[^\w.](5|3|20)[^\w.]/.test(src), false, 'AC14 ' + fn.name + ' hard-codes no 5 / 3 / 20 threshold');
        });
        _assertEqual(CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays, 45, 'AC14 KPI pace unchanged');
        if (typeof ALL_SOURCES === 'undefined') return;
        const dpp = ALL_SOURCES['dashboard-project-panels.js'];
        _assertEqual(/rejections\.filter\(rej => rejectionInPeriod\(rej, start, end\)\)/.test(dpp), true, 'N-387/N-379 panel rule intact');
        const ri = ALL_SOURCES['rejection-intel.js'];
        _assertEqual(/\b(getItems|fetch|createItem|updateItem)\(/.test(ri), false, 'rejection-intel.js has no Graph calls');
        _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(ri), false, 'rejection-intel.js has no hex colours');
      },
    },
    {
      name: 'N-388 fix — Leadership / People Ops see every project (their id list is empty, not null); DMs stay scoped; both loaders use the helper',
      fn: function () {
        // getUserProjectIds gives Leadership a LIST (empty without UserAssignments rows), only an admin row gets null.
        ['admin', 'leadership', 'people_ops'].forEach(function (role) {
          _assertEqual(projectScopeForRole(role, []), null, role + ' -> all projects, whatever the id list is');
        });
        _assertEqual(projectScopeForRole('delivery_manager', ['900']), ['900'], 'a DM keeps their own list');
        _assertEqual(projectScopeForRole('delivery_manager', []), [], 'a DM with no projects sees none');
        _assertEqual(projectScopeForRole(undefined, ['900']), ['900'], 'no role fails closed to the list');
        const rows = [{ id: 1, ProjectID: 900 }, { id: 2, ProjectID: 901 }];
        const rej = [{ RoleIDLookupId: 1 }, { RoleIDLookupId: 2 }];
        const scope = (role, ids) => rejectionIntelScopeRows({ projectIds: projectScopeForRole(role, ids), roles: rows, rejections: rej, activity: [] });
        _assertEqual(scope('leadership', []).rejections.length, 2, 'Leadership (empty list) keeps every rejection - the live defect');
        _assertEqual(scope('delivery_manager', ['900']).rejections.length, 1, 'a DM keeps only their project');
        _assertEqual(scope('delivery_manager', []).rejections.length, 0, 'a DM with an empty list keeps none');
        const P = [{ id: 900, CustomerName: 'A', ProjectType: 'Embedded', Status: 'Active' }, { id: 901, CustomerName: 'B', ProjectType: 'Embedded', Status: 'Active' }];
        _assertEqual(slaRollupProjects({ projects: P, projectIds: projectScopeForRole('leadership', []) }).length, 2, 'N-385: Leadership sees every SLA project');
        _assertEqual(slaRollupProjects({ projects: P, projectIds: projectScopeForRole('delivery_manager', ['901']) }).map(p => p.id), [901], 'N-385: a DM sees their own');
        if (typeof ALL_SOURCES === 'undefined') return;
        const api = ALL_SOURCES['api.js'];
        _assertEqual(/projectScopeForRole\(opts\.role, projectIds\)/.test(body(api, 'async function getSlaRollupInputs(')), true, 'getSlaRollupInputs scopes through the helper');
        const ril = body(api, 'async function getRejectionIntelInputs(');
        _assertEqual(/projectScopeForRole\(opts\.role, projectIds\)/.test(ril) && /new Set\(scopeIds\.map/.test(ril), true, 'getRejectionIntelInputs scopes rows AND the project list through the helper');
      },
    }
  );
})();