// tests/assert-sla-editor.js — SLA targets editor rules (N-382, DA-2).
// Loads AFTER tests/assert-sla.js and pushes this domain's entries into ASSERTIONS.

(function () {
  const R = CONFIG.ROLE_IDS;
  const ALL_ROLES = Object.keys(R).map(k => R[k]);
  const M = key => CONFIG.SLA.METRICS.find(m => m.key === key);
  const EMB = { id: '7', ProjectType: 'Embedded', CustomerName: 'Acme' };

  ASSERTIONS.push(
    {
      name: 'N-382 config — capabilities and input ceiling',
      fn: function () {
        _assertEqual(CONFIG.ROLE_CAPABILITIES.slaTargetsEdit, ['admin', 'leadership'], 'AC1 edit roles');
        _assertEqual(CONFIG.ROLE_CAPABILITIES.slaTargetsView, ['admin', 'leadership', 'delivery_manager'], 'AC1 view roles');
        _assertEqual(CONFIG.SLA.MAX_VALUE, 3650, 'AC1 ceiling');
        Object.keys(CONFIG.ROLE_CAPABILITIES).filter(k => /^slaTargets/.test(k)).forEach(k =>
          CONFIG.ROLE_CAPABILITIES[k].forEach(r => _assertEqual(ALL_ROLES.includes(r), true, 'AC1 ' + k + ' names a real role: ' + r)));
      },
    },
    {
      name: 'N-382 permissions — overrides: admin + leadership; defaults: admin only; view adds DM',
      fn: function () {
        const edit = kind => ALL_ROLES.filter(r => canEditSlaTargets(r, kind));
        _assertEqual(edit('override'), ['admin', 'leadership'].sort((a, b) => ALL_ROLES.indexOf(a) - ALL_ROLES.indexOf(b)), 'AC2 override editors');
        _assertEqual(edit('default'), ['admin'], 'AC2 default editors (Leadership cannot)');
        _assertEqual([canEditSlaTargets('admin', 'other'), canEditSlaTargets('admin'), canEditSlaTargets('nope', 'override'), canEditSlaTargets(undefined, 'default')],
          [false, false, false, false], 'AC2 unknown kind / role');
        _assertEqual(ALL_ROLES.filter(r => canViewSlaTargets(r)), ['admin', 'leadership', 'delivery_manager'].sort((a, b) => ALL_ROLES.indexOf(a) - ALL_ROLES.indexOf(b)), 'AC2 viewers');
        _assertEqual(canViewSlaTargets('talent_partner'), false, 'AC2 TP cannot view');
        // Widening the capability must not widen defaults.
        const cfg = Object.assign({}, CONFIG, { ROLE_CAPABILITIES: Object.assign({}, CONFIG.ROLE_CAPABILITIES, { slaTargetsEdit: ['admin', 'leadership', 'people_ops'] }) });
        _assertEqual(canEditSlaTargets('people_ops', 'default', cfg), false, 'AC2 capability does not gate defaults');
      },
    },
    {
      name: 'N-382 slaParseInput — blank, valid, decimals, ceiling, junk',
      fn: function () {
        const days = M('timeToHireDays'), wk = M('submissionsPerWeek');
        _assertEqual(['', '   ', null, undefined].map(v => slaParseInput(v, days)), [
          { ok: true, value: null }, { ok: true, value: null }, { ok: true, value: null }, { ok: true, value: null }], 'AC3 blank -> no target');
        _assertEqual([slaParseInput('45', days), slaParseInput(' 3650 ', days), slaParseInput('2.5', wk), slaParseInput('2.55', wk), slaParseInput('1', wk)].map(r => [r.ok, r.value]),
          [[true, 45], [true, 3650], [true, 2.5], [true, 2.55], [true, 1]], 'AC3 valid');
        ['0', '0.0', '-1', 'abc', 'NaN', '1e3', '4.', '.5', '3651', '2.555', '45.5'].forEach(v => {
          const metric = v === '2.555' ? wk : days;
          const r = slaParseInput(v, metric);
          _assertEqual(r.ok, false, 'AC3 rejects ' + JSON.stringify(v));
          _assertEqual(r.error.indexOf(metric.label) === 0, true, 'AC3 error names the metric for ' + JSON.stringify(v));
        });
        _assertEqual(slaParseInput('x', null).ok, false, 'AC3 null metric is tolerated');
      },
    },
    {
      name: 'N-382 slaEditorModel — null when ineligible; per-metric default/override/effective',
      fn: function () {
        const rows = [
          { id: '9', ProjectType: 'Embedded', TimeToHireDays: 45, TimeToOfferDays: 40 },
          { id: '3', ProjectType: 'Embedded', TimeToHireDays: 50 },                       // duplicate default: lowest id (3) wins
          { id: '12', ProjectID: 7, TimeToHireDays: 30 },
          { id: '13', ProjectID: 99, TimeToHireDays: 1 },                                 // other project
        ];
        _assertEqual([slaEditorModel(null, rows), slaEditorModel({ id: '1', ProjectType: 'LCI' }, rows),
          slaEditorModel({ id: '1', ProjectType: 'Transformation' }, rows),
          slaEditorModel({ id: '1', ProjectType: CONFIG.PROJECT_TYPE_INTERNAL }, rows),
          slaEditorModel({ id: '1', ProjectType: 'Nope' }, rows)], [null, null, null, null, null], 'AC4 ineligible');
        const before = JSON.stringify(rows);
        const m = slaEditorModel(EMB, rows);
        _assertEqual(JSON.stringify(rows), before, 'AC4 no mutation');
        _assertEqual(m.metrics.map(x => x.key), CONFIG.SLA.METRICS.map(x => x.key), 'AC4 registry order');
        _assertEqual([m.overrideRow.id, m.defaultRow.id], ['12', '3'], 'AC4 rows, lowest id on duplicates');
        const hire = m.metrics.find(x => x.key === 'timeToHireDays');
        _assertEqual([hire.effective, hire.defaultValue, hire.overrideValue], [{ value: 30, source: 'override' }, 50, 30], 'AC4 override metric');
        const offer = m.metrics.find(x => x.key === 'timeToOfferDays');
        _assertEqual([offer.effective, offer.defaultValue, offer.overrideValue], [{ value: null, source: null }, null, null], 'AC4 lowest-id default has no offer target');
        const none = slaEditorModel(EMB, []);
        _assertEqual([none.overrideRow, none.defaultRow, none.metrics.every(x => x.effective.value === null)], [null, null, true], 'AC4 empty rows');
        _assertEqual(slaEditorModel(EMB, undefined) !== null, true, 'AC4 rows undefined behaves as []');
      },
    },
    {
      name: 'N-382 slaEditPlan (default) — create / update / none, never delete',
      fn: function () {
        const vals = { timeToHireDays: 45, timeToOfferDays: null, firstSubmissionDays: null, submissionsPerWeek: 2.5 };
        const rows = [{ id: '5', ProjectType: 'CoE', TimeToHireDays: 60, FirstSubmissionDays: 9 }, { id: '2', ProjectType: 'CoE' }];
        const before = JSON.stringify(rows);
        _assertEqual(slaEditPlan('default', 'Embedded', rows, vals),
          { action: 'create', fields: { Title: 'Default · Embedded', ProjectType: 'Embedded', SubmissionsPerWeek: 2.5, TimeToHireDays: 45 } }, 'AC5 create: non-null metrics only');
        _assertEqual(slaEditPlan('default', 'CoE', rows, vals),
          { action: 'update', id: '2', fields: { FirstSubmissionDays: null, SubmissionsPerWeek: 2.5, TimeToOfferDays: null, TimeToHireDays: 45 } }, 'AC5 update lowest id, all four columns, null clears');
        _assertEqual(JSON.stringify(rows), before, 'AC5 no mutation');
        const blank = { firstSubmissionDays: null, submissionsPerWeek: null, timeToOfferDays: null, timeToHireDays: null };
        _assertEqual(slaEditPlan('default', 'Embedded', [], blank), { action: 'none' }, 'AC5 all blank, no row');
        _assertEqual(slaEditPlan('default', 'CoE', rows, blank).action, 'update', 'AC5 all blank, existing row -> update (never delete)');
        ['LCI', 'Transformation', CONFIG.PROJECT_TYPE_INTERNAL, 'Nope', '', null].forEach(t => {
          const p = slaEditPlan('default', t, rows, vals);
          _assertEqual([p.action, typeof p.error], ['none', 'string'], 'AC5 ineligible ' + t);
        });
        _assertEqual(slaEditPlan('default', 'Embedded', [{ id: '1', ProjectID: 4, ProjectType: 'Embedded' }], vals).action, 'create', 'AC5 an override row is not a default row');
      },
    },
    {
      name: 'N-382 slaEditPlan (override) — create / update / delete / none',
      fn: function () {
        const target = { id: 7, name: 'Acme', type: 'Embedded' };
        const vals = { timeToHireDays: 30, firstSubmissionDays: null, submissionsPerWeek: null, timeToOfferDays: null };
        const blank = { firstSubmissionDays: null, submissionsPerWeek: null, timeToOfferDays: null, timeToHireDays: null };
        const rows = [
          { id: '20', ProjectID: 7, TimeToHireDays: 28 },
          { id: '11', ProjectID: 7, TimeToHireDays: 33 },
          { id: '30', ProjectID: 8, TimeToHireDays: 1 },
          { id: '40', ProjectType: 'Embedded', TimeToHireDays: 45 },
        ];
        _assertEqual(slaEditPlan('override', target, [], vals),
          { action: 'create', fields: { Title: 'Override · Acme', ProjectID: 7, TimeToHireDays: 30 } }, 'AC6 create');
        _assertEqual(slaEditPlan('override', target, rows, vals),
          { action: 'update', id: '11', fields: { FirstSubmissionDays: null, SubmissionsPerWeek: null, TimeToOfferDays: null, TimeToHireDays: 30 } }, 'AC6 update lowest-id override row');
        _assertEqual(slaEditPlan('override', target, rows, blank), { action: 'delete', id: '11' }, 'AC6 all cleared -> delete the override row');
        _assertEqual(slaEditPlan('override', target, [rows[2], rows[3]], blank), { action: 'none' }, 'AC6 nothing to clear');
        _assertEqual(slaEditPlan('override', target, [rows[3]], vals).action, 'create', 'AC6 a default row is never the override row');
        _assertEqual(slaEditPlan('override', { id: 7, name: '', type: 'Embedded' }, [], vals).fields.Title, 'Override · Project 7', 'AC6 name fallback');
        ['LCI', 'Transformation', CONFIG.PROJECT_TYPE_INTERNAL, 'Nope'].forEach(t =>
          _assertEqual(slaEditPlan('override', { id: 7, name: 'x', type: t }, rows, vals).action, 'none', 'AC6 ineligible ' + t));
        _assertEqual([slaEditPlan('override', { id: 0, type: 'Embedded' }, rows, vals).action, slaEditPlan('override', null, rows, vals).action, slaEditPlan('bogus', 'x', rows, vals).action],
          ['none', 'none', 'none'], 'AC6 bad target / kind');
      },
    },
    {
      name: 'N-382 saveSlaTargets — one write per plan, SLATargets only; 403 translated',
      fn: function () {
        const calls = [];
        const o = { c: createItem, u: updateItem, d: deleteItem };
        try {
          createItem = function (l, f) { calls.push(['create', l, f]); return new Promise(function () {}); };
          updateItem = function (l, i, f) { calls.push(['update', l, i, f]); return new Promise(function () {}); };
          deleteItem = function (l, i) { calls.push(['delete', l, i]); return new Promise(function () {}); };
          saveSlaTargets({ action: 'create', fields: { Title: 'x' } });
          saveSlaTargets({ action: 'update', id: '4', fields: { TimeToHireDays: null } });
          saveSlaTargets({ action: 'delete', id: '5' });
          saveSlaTargets({ action: 'none' });
          saveSlaTargets(null);
          _assertEqual(calls, [['create', 'SLATargets', { Title: 'x' }], ['update', 'SLATargets', '4', { TimeToHireDays: null }], ['delete', 'SLATargets', '5']],
            'AC7 exactly one call per real plan, none for none/null');
        } finally { createItem = o.c; updateItem = o.u; deleteItem = o.d; }
        const forbidden = slaTranslateSaveError(Object.assign(new Error('Access denied'), { status: 403 }));
        _assertEqual(forbidden.message, "You don't have edit permission on the SLATargets list in SharePoint.", 'AC7 403 message');
        const other = Object.assign(new Error('boom'), { status: 500 });
        _assertEqual(slaTranslateSaveError(other) === other, true, 'AC7 other errors pass through unchanged');
      },
    },
    {
      name: 'N-382 slaFormatTarget',
      fn: function () {
        _assertEqual([slaFormatTarget(45, M('timeToHireDays')), slaFormatTarget('2.5', M('submissionsPerWeek')), slaFormatTarget(null, M('timeToHireDays')), slaFormatTarget(0, M('timeToHireDays'))],
          ['45 days', '2.5 per week', 'Not set', 'Not set'], 'format');
      },
    },
    {
      name: 'N-382 sources — editors are wired through escaping, delegated actions, fresh reads, no hardcoded values',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('source scan needs the filesystem (node tests/run.js)');
        const pp = ALL_SOURCES['project-page.js'], ad = ALL_SOURCES['sla-admin.js'], adm = ALL_SOURCES['admin.js'];
        const api = ALL_SOURCES['api.js'], utils = ALL_SOURCES['utils.js'];
        const ppSla = pp.slice(pp.indexOf('// ── SLA targets markup (N-382'), pp.indexOf('// ── Project Team markup (N-365)'));
        _assertEqual(ppSla.length > 800 && ad.length > 800, true, 'AC9 found the editor sources');
        [ppSla, ad].forEach((src, i) => {
          const tag = i === 0 ? 'project-page ' : 'sla-admin ';
          _assertEqual(/\son(click|change|input)=/i.test(src), false, tag + 'AC8/9 no inline handlers');
          _assertEqual(/#[0-9a-fA-F]{3,6}\b/.test(src), false, tag + 'no hex colours');
          _assertEqual(/ProjectType\s*(===|!==|==|!=)\s*['"]/.test(src), false, tag + 'no project-type literal comparisons');
          _assertEqual(src.includes('ANALYTICS_BENCHMARKS'), false, tag + 'AC12 never reads the benchmark');
        });
        // Every dynamic metric/type string goes through escHtml / escAttr.
        _assertEqual(/\$\{(?:m|type|v\.project)\.[A-Za-z]+\}/.test(ppSla.replace(/\$\{escHtml\([^}]*\}|\$\{escAttr\([^}]*\}/g, '')), false, 'AC9 no raw metric/project interpolation in the Project page section');
        // Saves plan from a fresh read taken inside the handler, after the click.
        _assertEqual(/async function _ppSlaWrite[\s\S]*?await getSLATargets\(\)[\s\S]*?slaEditPlan\(/.test(pp), true, 'AC10 Project page save re-reads before planning');
        const sd = ad.slice(ad.indexOf('async function slaSaveDefault'));
        _assertEqual(sd.indexOf('await getSLATargets()') > -1 && sd.indexOf('await getSLATargets()') < sd.indexOf('slaEditPlan('), true, 'AC8 Config Panel save re-reads before planning');
        _assertEqual(/_resolvedRole\s*!==\s*CONFIG\.ROLE_IDS\.ADMIN/.test(sd), true, 'AC8 defaults save is Admin-gated');
        // Reset is confirmed and only offered when an override row exists.
        _assertEqual(/async function ppSlaReset[\s\S]*?await confirmModal\([\s\S]*?_ppSlaWrite/.test(pp), true, 'AC10 reset asks first');
        _assertEqual(/model\.overrideRow \? `<button[^`]*ppSlaReset/.test(pp), true, 'AC10 reset button only with an override row');
        // Read-only for non-editors: every control sits behind canEditSla.
        _assertEqual(/v\.canEditSla && !editing \? `<button[^`]*ppSlaEdit/.test(pp), true, 'AC9 Edit button gated on canEditSla');
        _assertEqual(/editing = v\.slaMode === 'edit' && v\.canEditSla/.test(pp), true, 'AC9 edit state gated on canEditSla');
        _assertEqual(/async function _ppRunSla[\s\S]*?!v\.canEditSla/.test(pp), true, 'AC9 handlers refuse non-editors');
        // Project Team gating is independent of SLA.
        _assertEqual(/async function _ppRun\(fn\)[\s\S]*?!v\.canEditTeam[\s\S]*?\n\}/.test(pp) && !/_ppRun\(fn\)[\s\S]{0,200}canEditSla/.test(pp), true, 'AC11 Team guard untouched by SLA');
        // Tab registration + Admin-only page gate.
        _assertEqual(/'slaTargets'/.test(adm) && adm.includes('buildSlaTargetsTab()'), true, 'AC8 tab registered in admin.js');
        _assertEqual(/role !== 'admin'/.test(adm), true, 'AC8 Config Panel stays Admin-only');
        // The writer is api.js, only SLATargets, create/update/delete helpers only.
        const w = api.slice(api.indexOf('async function saveSlaTargets'), api.indexOf('async function saveSlaTargets') + 900);
        _assertEqual(/graphRequest/.test(w), false, 'AC7 no raw graphRequest writes');
        _assertEqual(/CONFIG\.SLA\.LIST/.test(w), true, 'AC7 writes the SLA list only');
        const blk = utils.slice(utils.indexOf('// ── SLA target editor (N-382'), utils.indexOf('// ── Text escaping'));
        _assertEqual(blk.length > 1500 && blk.includes('ANALYTICS_BENCHMARKS') === false, true, 'AC12 editor helpers never read the benchmark');
        _assertEqual(CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays, 45, 'AC12 benchmark unchanged');
      },
    }
  );
})();