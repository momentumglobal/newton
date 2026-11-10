// tests/assert-pdp-setup.js — PDP framework + template editors (N-436 / PDP-4). Loads AFTER tests/assertions.js.
// Pure planners and the publish validator are exercised directly; the API writers (async, several awaits) are
// checked from source because the runner is synchronous. Spec: specs/N-436.md.

function _pdpsFlat(def) { const o = []; def.sections.forEach(s => s.blocks.forEach(b => o.push(b))); return o; }
function _pdpsCode(src) { return src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'); }
function _pdpsFnSrc(src, name, next) {
  const a = src.indexOf('async function ' + name);
  const b = next ? src.indexOf('async function ' + next) : src.length;
  return src.slice(a, b);
}

ASSERTIONS.push(
  {
    name: 'N-436 AC1 seed: 6 sets (L1-L4 IC, L5 MG, blank L5 IC), 108 framework rows, 4 templates, no L6',
    fn: function () {
      const plan = pdpSeedPlan([], [], PDP_SEED, 'Chris@Mg.test', '2026-11-06T09:00:00.000Z');
      _assertEqual(plan.framework.length, 108, 'AC1 6 sets x 6 pillars x 3 bands');
      _assertEqual(plan.templates.map(t => t.MeetingType).sort(), ['Annual', 'BiAnnual', 'Monthly', 'Quarterly'], 'AC1 four templates');
      _assertEqual(plan.framework.some(r => r.Level === 'L6'), false, 'AC1 no L6');
      const sets = {};
      plan.framework.forEach(r => { sets[r.Level + '/' + r.Track] = (sets[r.Level + '/' + r.Track] || 0) + 1; });
      _assertEqual(Object.keys(sets).sort(), ['L1/IC', 'L2/IC', 'L3/IC', 'L4/IC', 'L5/IC', 'L5/MG'], 'AC1 the six sets');
      Object.keys(sets).forEach(k => _assertEqual(sets[k], 18, 'AC1 ' + k + ' has 18 rows'));
      const blank = plan.framework.filter(r => r.Level === 'L5' && r.Track === 'IC');
      _assertEqual(blank.some(r => r.IsActive || r.Descriptor), false, 'AC1 L5 IC is blank and inactive');
      const live = plan.framework.filter(r => !(r.Level === 'L5' && r.Track === 'IC'));
      _assertEqual(live.every(r => r.IsActive === true && r.Descriptor), true, 'AC1 the other five sets are complete and active');
      _assertEqual(plan.framework.every(r => r.UpdatedBy === 'chris@mg.test'), true, 'AC1 UpdatedBy is the lower-cased seeding user');
      plan.templates.forEach(t => _assertEqual([t.VersionNo, t.Status, t.PublishedBy, t.PublishedAt], [1, 'Published', 'chris@mg.test', '2026-11-06T09:00:00.000Z'], 'AC1 ' + t.MeetingType + ' v1 Published'));
    },
  },
  {
    name: 'N-436 AC2 seed is create-only and idempotent: existing rows and meeting types are skipped',
    fn: function () {
      const first = pdpSeedPlan([], [], PDP_SEED, 'a@mg.test', 'x');
      const fw = first.framework.map((f, i) => Object.assign({ id: 'f' + i }, f));
      const tp = first.templates.map((t, i) => Object.assign({ id: 't' + i }, t));
      const again = pdpSeedPlan(fw, tp, PDP_SEED, 'a@mg.test', 'x');
      _assertEqual([again.framework.length, again.templates.length], [0, 0], 'AC2 second run creates nothing');
      const partial = pdpSeedPlan(fw.slice(0, 50), tp.filter(t => t.MeetingType !== 'Monthly'), PDP_SEED, 'a@mg.test', 'x');
      _assertEqual(partial.framework.length, 58, 'AC2 only the missing rows');
      _assertEqual(partial.templates.map(t => t.MeetingType), ['Monthly'], 'AC2 only the missing meeting type');
      const edited = fw.map(r => Object.assign({}, r, { Descriptor: 'Edited by Chris' }));
      _assertEqual(pdpSeedPlan(edited, tp, PDP_SEED, 'a@mg.test', 'x').framework.length, 0, 'AC2 an edited framework is never re-seeded');
      const anyRow = [{ id: 'q', MeetingType: 'Quarterly', VersionNo: 3, Status: 'Retired' }];
      _assertEqual(pdpSeedPlan([], anyRow, PDP_SEED, 'a@mg.test', 'x').templates.map(t => t.MeetingType).includes('Quarterly'), false, 'AC2 a type with any row (even Retired) is not re-seeded');
    },
  },
  {
    name: 'N-436 AC3 seeded content: descriptors, Bi-Annual has no reward/outcome and one scoring block, block shapes',
    fn: function () {
      const l3 = PDP_SEED.framework.find(s => s.level === 'L3' && s.track === 'IC');
      _assertEqual(l3.descriptors['own-it'].Meets, 'Owns their workstreams end-to-end; proactively manages risks and keeps stakeholders updated', 'AC3 L3 Own It Meets');
      CONFIG.PDP.PILLAR_KEYS.forEach(k => CONFIG.PDP.BANDS.forEach(b => _assertEqual(String(l3.descriptors[k][b]).trim().length > 0, true, 'AC3 L3 ' + k + ' ' + b)));
      const T = PDP_SEED.templates;
      CONFIG.PDP.MEETING_TYPES.forEach(t => {
        const v = pdpValidateTemplate(T[t], t);
        _assertEqual(v.ok, true, 'AC3 seeded ' + t + ' passes publish validation: ' + v.errors.join(' '));
      });
      const ba = _pdpsFlat(T.BiAnnual);
      _assertEqual(ba.filter(b => b.type === 'scoring').length, 1, 'AC3 Bi-Annual: exactly one scoring block');
      _assertEqual(/reward/i.test(JSON.stringify(T.BiAnnual)), false, 'AC3 Bi-Annual: no Reward text');
      _assertEqual(_pdpsFlat(T.Monthly).filter(b => b.type === 'actions').map(b => b.max), [3], 'AC3 Monthly: actions max 3');
      _assertEqual(_pdpsFlat(T.Annual).filter(b => b.type === 'goalSet').map(b => [b.min, b.max]), [[3, 5]], 'AC3 Annual: 3 to 5 goals');
      const qr = _pdpsFlat(T.Quarterly);
      _assertEqual(qr.filter(b => b.type === 'goalReview').map(b => b.by), ['employee', 'meeting'], 'AC3 Quarterly: employee then meeting goal review');
      _assertEqual(qr.filter(b => b.type === 'actions').length, 1, 'AC3 Quarterly: one actions block');
      Object.keys(T).forEach(t => _assertEqual(T[t].sections.every(s => !('phase' in s)), true, 'AC3 ' + t + ' has no section phase'));
      let dup = false;
      Object.keys(T).forEach(t => { const k = new Set(); _pdpsFlat(T[t]).forEach(b => { if (k.has(b.key)) dup = true; k.add(b.key); }); });
      _assertEqual(dup, false, 'AC3 block keys unique within each template');
    },
  },
  {
    name: 'N-436 AC4 validator rejects bad templates and accepts a good one',
    fn: function () {
      const good = () => ({ schema: 1, sections: [{ key: 's1', title: 'One', blocks: [
        { key: 'q1', type: 'prepQuestion', label: 'How did it go?', by: 'employee' },
        { key: 'g1', type: 'goalSet', label: 'Goals', level: CONFIG.PDP.GOAL_LEVELS[0], min: 1, max: 3 },
        { key: 'a1', type: 'actions', label: 'Actions', max: 3 },
      ] }] });
      _assertEqual(pdpValidateTemplate(good(), 'Monthly'), { ok: true, errors: [] }, 'AC4 good template');
      _assertEqual(pdpValidateTemplate(JSON.stringify(good()), 'Monthly').ok, true, 'AC4 JSON text accepted');
      _assertEqual(pdpValidateTemplate('{nope', 'Monthly').ok, false, 'AC4 bad JSON');
      const bad = (mut, type) => { const d = good(); mut(d); return pdpValidateTemplate(d, type || 'Monthly'); };
      _assertEqual(bad(d => { d.schema = 2; }).ok, false, 'AC4 wrong schema');
      _assertEqual(bad(d => { d.sections = []; }).ok, false, 'AC4 no sections');
      _assertEqual(bad(d => { d.sections[0].blocks[0].label = '  '; }).ok, false, 'AC4 blank label');
      _assertEqual(bad(d => { d.sections[0].title = 'a<b>'; }).ok, false, 'AC4 angle brackets in a title');
      _assertEqual(bad(d => { d.sections[0].blocks[0].hint = '<script>'; }).ok, false, 'AC4 angle brackets in a hint');
      _assertEqual(bad(d => { d.sections[0].blocks[0].key = 'Bad Key'; }).ok, false, 'AC4 invalid key');
      _assertEqual(bad(d => { d.sections[0].blocks[1].key = 'q1'; }).ok, false, 'AC4 duplicate block key');
      _assertEqual(bad(d => { d.sections.push({ key: 's1', title: 'Two', blocks: [] }); }).ok, false, 'AC4 duplicate section key');
      _assertEqual(bad(d => { d.sections[0].blocks[0].type = 'reward'; }).ok, false, 'AC4 unknown type');
      _assertEqual(bad(d => { d.sections[0].blocks[0].by = 'ceo'; }).ok, false, 'AC4 prepQuestion needs by');
      _assertEqual(bad(d => { d.sections[0].blocks[1].min = 4; }).ok, false, 'AC4 goal min above max');
      _assertEqual(bad(d => { d.sections[0].blocks[1].min = 0; }).ok, false, 'AC4 goal min below 1');
      _assertEqual(bad(d => { d.sections[0].blocks[1].max = CONFIG.PDP.TEMPLATE_LIMITS.GOALS_MAX + 1; }).ok, false, 'AC4 goal max above the limit');
      _assertEqual(bad(d => { d.sections[0].blocks[2].max = 0; }).ok, false, 'AC4 actions max below 1');
      _assertEqual(bad(d => { d.sections[0].blocks[2].max = CONFIG.PDP.TEMPLATE_LIMITS.ACTIONS_MAX + 1; }).ok, false, 'AC4 actions max above the limit');
      _assertEqual(pdpValidateTemplate(good(), 'Weekly').ok, false, 'AC4 unknown meeting type');
      const sc = { key: 'sc', type: 'scoring', label: 'Score' };
      _assertEqual(bad(d => { d.sections[0].blocks.push(sc); }, 'Monthly').ok, false, 'AC4 scoring outside Bi-Annual');
      _assertEqual(bad(d => { d.sections[0].blocks.push(sc); }, 'BiAnnual').ok, true, 'AC4 Bi-Annual with one scoring block');
      _assertEqual(bad(d => { d.sections[0].blocks.push(sc, Object.assign({}, sc, { key: 'sc2' })); }, 'BiAnnual').ok, false, 'AC4 two scoring blocks');
      _assertEqual(bad(() => {}, 'BiAnnual').ok, false, 'AC4 Bi-Annual without scoring');
      _assertEqual(bad(d => { for (let i = 0; i <= CONFIG.PDP.TEMPLATE_LIMITS.MAX_SECTIONS; i++) d.sections.push({ key: 'x' + i, title: 'S', blocks: [] }); }).ok, false, 'AC4 too many sections');
      _assertEqual(bad(d => { d.sections[0].blocks[0].label = 'x'.repeat(CONFIG.PDP.TEMPLATE_LIMITS.LABEL_MAX + 1); }).ok, false, 'AC4 label too long');
    },
  },
  {
    name: 'N-436 AC5 template versions: active, draft, next number, immutability',
    fn: function () {
      const rows = [
        { id: '1', MeetingType: 'Quarterly', VersionNo: 1, Status: 'Retired' },
        { id: '2', MeetingType: 'Quarterly', VersionNo: 2, Status: 'Published' },
        { id: '3', MeetingType: 'Quarterly', VersionNo: 3, Status: 'Draft' },
        { id: '4', MeetingType: 'Monthly', VersionNo: 1, Status: 'Published' },
      ];
      _assertEqual(pdpActiveTemplate(rows, 'Quarterly').id, '2', 'AC5 active is the Published row');
      _assertEqual(pdpTemplateDraft(rows, 'Quarterly').id, '3', 'AC5 open draft');
      _assertEqual(pdpTemplateDraft(rows, 'Monthly'), null, 'AC5 no draft');
      _assertEqual(pdpActiveTemplate(rows, 'Annual'), null, 'AC5 none for an unseeded type');
      _assertEqual(pdpNextVersionNo(rows, 'Quarterly'), 4, 'AC5 next number counts every status');
      _assertEqual(pdpNextVersionNo(rows, 'Annual'), 1, 'AC5 first version is 1');
      const two = rows.concat([{ id: '5', MeetingType: 'Quarterly', VersionNo: 4, Status: 'Published' }]);
      _assertEqual(pdpActiveTemplate(two, 'Quarterly').id, '5', 'AC5 two Published (failed retire): higher number wins');
      _assertEqual(rows.map(pdpTemplateEditable), [false, false, true, false], 'AC5 only a Draft is editable');
      _assertEqual(pdpTemplateEditable(null), false, 'AC5 null row');
      _assertEqual(pdpTemplateTitle('BiAnnual', 2), CONFIG.PDP.MEETING_LABELS.BiAnnual + ' v2', 'AC5 title');
    },
  },
  {
    name: 'N-436 AC6 framework: completeness, save plan, activation refusal, audit, add set',
    fn: function () {
      const seed = pdpSeedPlan([], [], PDP_SEED, 'a@mg.test', 'x');
      const rows = seed.framework.map((f, i) => Object.assign({ id: 'f' + i }, f));
      _assertEqual(pdpFrameworkComplete(rows, 'L3', 'IC'), true, 'AC6 L3 IC complete');
      _assertEqual(pdpFrameworkComplete(rows, 'L5', 'IC'), false, 'AC6 blank L5 IC incomplete');
      _assertEqual(pdpFrameworkComplete(rows, 'L2', 'MG'), false, 'AC6 absent set incomplete');
      const set = pdpFrameworkSet(rows, 'L3', 'IC');
      _assertEqual([set.written, set.total, set.active, set.pillars.length], [18, 18, true, 6], 'AC6 set shape');
      const P = PDP_SEED.pillars;
      const p = pdpFrameworkPlanSave(rows, 'L3', 'IC', { descriptors: { 'own-it': { Meets: '  New text  ' } } }, 'Bob@mg.test', P);
      _assertEqual(p.updates.length, 1, 'AC6 only the changed row is written');
      _assertEqual(p.updates[0].fields, { Descriptor: 'New text', UpdatedBy: 'bob@mg.test' }, 'AC6 trimmed text + UpdatedBy');
      _assertEqual(pdpFrameworkPlanSave(rows, 'L3', 'IC', { descriptors: { 'own-it': { Meets: set.pillars[0].bands.Meets.text } } }, 'b@mg.test', P).updates.length, 0, 'AC6 unchanged text writes nothing');
      const long = 'x'.repeat(CONFIG.PDP.TEMPLATE_LIMITS.DESCRIPTOR_MAX + 1);
      _assertEqual(/limit/.test(_pdpThrows(() => pdpFrameworkPlanSave(rows, 'L3', 'IC', { descriptors: { 'own-it': { Meets: long } } }, 'b@mg.test', P))), true, 'AC6 descriptor over the limit throws');
      _assertEqual(/cannot be switched on/.test(_pdpThrows(() => pdpFrameworkPlanSave(rows, 'L3', 'IC', { descriptors: { 'own-it': { Meets: '' } } }, 'b@mg.test', P))), true, 'AC6 a set left active with a blank descriptor is refused');
      const off = pdpFrameworkPlanSave(rows, 'L3', 'IC', { descriptors: { 'own-it': { Meets: '' } }, isActive: false }, 'b@mg.test', P);
      _assertEqual(off.updates.length, 18, 'AC6 switching off touches every row of the set');
      _assertEqual(/cannot be switched on/.test(_pdpThrows(() => pdpFrameworkPlanSave(rows, 'L5', 'IC', { isActive: true }, 'b@mg.test', P))), true, 'AC6 activating an incomplete set is refused');
      const full = {}; CONFIG.PDP.PILLAR_KEYS.forEach(k => { full[k] = { Below: 'b', Meets: 'm', Exceeding: 'e' }; });
      const act = pdpFrameworkPlanSave(rows, 'L5', 'IC', { descriptors: full, isActive: true }, 'b@mg.test', P);
      _assertEqual(act.updates.length, 18, 'AC6 filling and activating a blank set updates its 18 rows');
      _assertEqual(act.updates.every(u => u.fields.IsActive === true && u.fields.Descriptor && u.fields.UpdatedBy === 'b@mg.test'), true, 'AC6 each row active + text + UpdatedBy');
      _assertEqual(/first/.test(_pdpThrows(() => pdpFrameworkPlanSave(rows, 'L2', 'MG', {}, 'b@mg.test', P))), true, 'AC6 saving an absent set asks to add it first');
      const add = pdpFrameworkPlanAdd(rows, 'L2', 'MG', 'Bob@mg.test', P);
      _assertEqual(add.length, 18, 'AC6 add creates 18 rows');
      _assertEqual(add.every(r => r.IsActive === false && !r.Descriptor && r.UpdatedBy === 'bob@mg.test'), true, 'AC6 added rows are blank, inactive, attributed');
      _assertEqual(/already/.test(_pdpThrows(() => pdpFrameworkPlanAdd(rows, 'L3', 'IC', 'b@mg.test', P))), true, 'AC6 add refuses an existing set');
      _assertEqual(_pdpThrows(() => pdpFrameworkPlanAdd(rows, 'L9', 'IC', 'b@mg.test', P)) !== null, true, 'AC6 add refuses an unknown level');
      const aud = rows.map((r, i) => Object.assign({}, r, { Modified: i === 7 ? '2026-11-07T10:00:00Z' : '2026-11-01T10:00:00Z', UpdatedBy: i === 7 ? 'late@mg.test' : 'early@mg.test' }));
      _assertEqual(pdpFrameworkAudit(aud, 'L1', 'IC'), { by: 'late@mg.test', at: '2026-11-07T10:00:00Z' }, 'AC6 audit picks the newest Modified');
      _assertEqual(pdpFrameworkAudit([], 'L1', 'IC'), { by: '', at: '' }, 'AC6 audit of nothing');
    },
  },
  {
    name: 'N-436 AC7 editor helpers: keys, new blocks, moves, blank definition',
    fn: function () {
      _assertEqual(pdpBlockKey('How did it go?', []), 'how-did-it-go', 'AC7 key from label');
      _assertEqual(pdpBlockKey('How did it go?', ['how-did-it-go']), 'how-did-it-go-2', 'AC7 key de-duplicated');
      _assertEqual(pdpBlockKey('???', []), 'item', 'AC7 empty slug falls back');
      _assertEqual(pdpBlockKey('a'.repeat(80), []).length <= 40, true, 'AC7 key capped at 40');
      _assertEqual(/^[a-z0-9][a-z0-9-]{0,39}$/.test(pdpBlockKey('x'.repeat(39), ['x'.repeat(39)])), true, 'AC7 de-duplicated key stays valid at the cap');
      const def = pdpBlankDefinition();
      _assertEqual(def.schema, 1, 'AC7 blank schema');
      CONFIG.PDP.BLOCK_TYPES.forEach(t => {
        const b = pdpNewBlock(t, def);
        _assertEqual(b.type, t, 'AC7 new ' + t);
        def.sections[0].blocks.push(b);
      });
      _assertEqual(new Set(def.sections[0].blocks.map(b => b.key)).size, CONFIG.PDP.BLOCK_TYPES.length, 'AC7 new block keys unique');
      _assertEqual(pdpValidateTemplate(def, 'BiAnnual').ok, true, 'AC7 one of each type is a valid Bi-Annual: ' + pdpValidateTemplate(def, 'BiAnnual').errors.join(' '));
      _assertEqual(_pdpThrows(() => pdpNewBlock('reward', def)) !== null, true, 'AC7 unknown block type refused');
      _assertEqual(pdpMoveItem([1, 2, 3], 0, 1), [2, 1, 3], 'AC7 move down');
      _assertEqual(pdpMoveItem([1, 2, 3], 0, -1), [1, 2, 3], 'AC7 move above the top is a no-op');
      _assertEqual(pdpMoveItem([1, 2, 3], 2, 1), [1, 2, 3], 'AC7 move below the bottom is a no-op');
      const src = [1, 2]; pdpMoveItem(src, 0, 1); _assertEqual(src, [1, 2], 'AC7 input not mutated');
    },
  },
  {
    name: 'N-436 AC8 api-pdp.js writers: role-checked, fresh reads, validate before publish, retire not delete, one Draft',
    fn: function () {
      const src = _pdpsCode(ALL_SOURCES['api-pdp.js']);
      _assertEqual(/graphRequest|deleteItem/.test(_pdpApiNoTeamDelete(src)), false, 'AC8 no raw Graph / delete');
      const who = _pdpsFnSrc(src, '_pdpSetupWho', '_pdpFrameworkSelect');
      _assertEqual(/_ensureGhostGate\(\)/.test(who) && /roleCan\(role, 'pdpAdmin'\)/.test(who), true, 'AC8 Ghost-aware pdpAdmin check');
      const names = ['seedPdpDefaults', 'savePdpFramework', 'addPdpFrameworkSet', 'startPdpTemplateDraft', 'savePdpTemplateDraft', 'publishPdpTemplate', 'discardPdpTemplateDraft'];
      names.forEach((n, i) => {
        const f = _pdpsFnSrc(src, n, names[i + 1]);
        _assertEqual(/_pdpSetupWho\(\)/.test(f), true, 'AC8 ' + n + ' checks the role first');
        _assertEqual(/readPdpSetup\(true\)/.test(f), true, 'AC8 ' + n + ' re-reads fresh');
      });
      const rd = _pdpsFnSrc(src, 'readPdpSetup', '_pdpRunBatches');
      _assertEqual(/_cacheInvalidate\(L\.FRAMEWORK\)/.test(rd) && /_cacheInvalidate\(L\.TEMPLATES\)/.test(rd) && /Modified/.test(src), true, 'AC8 fresh read drops the cache and selects Modified');
      const pub = _pdpsFnSrc(src, 'publishPdpTemplate', 'discardPdpTemplateDraft');
      _assertEqual(pub.indexOf('pdpValidateTemplate(') > -1 && pub.indexOf('pdpValidateTemplate(') < pub.indexOf('updatePdpTemplate(id, fields)'), true, 'AC8 validated before the publish write');
      _assertEqual(/pdpTemplateEditable\(row\)/.test(pub), true, 'AC8 only a Draft can be published');
      _assertEqual(/pdpNextVersionNo\(rows/.test(pub), true, 'AC8 renumbers on a version clash');
      _assertEqual(/Status: 'Retired'/.test(pub) && /r\.Status === 'Published'/.test(pub) && /retireFailed/.test(pub), true, 'AC8 retires the previous Published; failure reported');
      _assertEqual(pub.indexOf('updatePdpTemplate(id, fields)') < pub.indexOf("Status: 'Retired'"), true, 'AC8 publish before retire');
      const save = _pdpsFnSrc(src, 'savePdpTemplateDraft', 'publishPdpTemplate');
      _assertEqual(/pdpTemplateEditable\(row\)/.test(save) && /updatePdpTemplate\(id, \{ Definition: definition \}\)/.test(save), true, 'AC8 save checks the stored row, writes only Definition');
      const disc = _pdpsFnSrc(src, 'discardPdpTemplateDraft');
      _assertEqual(/Status: 'Retired'/.test(disc) && /pdpTemplateEditable\(row\)/.test(disc), true, 'AC8 discard retires a Draft');
      const start = _pdpsFnSrc(src, 'startPdpTemplateDraft', 'savePdpTemplateDraft');
      _assertEqual(/pdpTemplateDraft\(rows, meetingType\)/.test(start) && start.indexOf('if (open) return open') < start.indexOf('createPdpTemplate('), true, 'AC8 one Draft per type');
      _assertEqual(/Status: 'Draft'/.test(start) && /pdpNextVersionNo\(rows, meetingType\)/.test(start), true, 'AC8 new version is a Draft with the next number');
      const seed = _pdpsFnSrc(src, 'seedPdpDefaults', 'savePdpFramework');
      _assertEqual(/pdpSeedPlan\(cur\.framework, cur\.templates, PDP_SEED/.test(seed) && !/updatePdp/.test(seed), true, 'AC8 seed is create-only');
    },
  },
  {
    name: 'N-436 AC9 permissions: pdpSetup page + Command Bar entry for Admin and People Ops only',
    fn: function () {
      _assertEqual(/pdpSetup:\s*\{[^}]*label: 'PDP Setup'[^}]*roles: \[CONFIG\.ROLE_IDS\.ADMIN, CONFIG\.ROLE_IDS\.PEOPLE_OPS\]/.test(ALL_SOURCES['people-router.js']), true, 'AC9 router entry');
      const cb = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'pdpSetup');
      _assertEqual(!!cb && cb.module === 'people' && cb.href === 'people.html#pdpSetup', true, 'AC9 Command Bar entry');
      _assertEqual(cb.roles, [_ROLE_IDS.ADMIN, _ROLE_IDS.PEOPLE_OPS], 'AC9 Command Bar roles match the router');
      _assertEqual(/case 'pdpSetup':\s*await renderPdpSetupPage\(\)/.test(ALL_SOURCES['people-nav.js']), true, 'AC9 people-nav dispatches the page');
      _assertEqual(CONFIG.ROLE_CAPABILITIES.pdpAdmin, ['admin', 'people_ops'], 'AC9 pdpAdmin unchanged');
    },
  },
  {
    name: 'N-436 AC10 UI sources: no PDP list names or personal-list API, no raw Graph, no inline handlers / styles / hex, escaped',
    fn: function () {
      ['pdp-setup.js', 'pdp-template-editor.js'].forEach(f => {
        const src = _pdpsCode(ALL_SOURCES[f]);
        _assertEqual(/PDPFramework|PDPTemplates|PDPCycles|PDPMeetings|PDPGoals|PDPActions|PDPScores|CONFIG\.PDP\.LISTS/.test(src), false, 'AC10 ' + f + ' names no PDP list');
        _assertEqual(/\b(get|create|update|repoint)Pdp[A-Z]\w*\(/.test(src), false, 'AC10 ' + f + ' uses no getPdp/createPdp/updatePdp/repointPdp');
        _assertEqual(/graphRequest|deleteItem|getItems\(|createItem\(|updateItem\(/.test(src), false, 'AC10 ' + f + ' no raw data access');
        _assertEqual(/\bon(click|change|input|submit)=|style="/.test(src), false, 'AC10 ' + f + ' no inline handlers or styles');
        _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(src), false, 'AC10 ' + f + ' no hex colours');
        _assertEqual(/escHtml\(/.test(src) && /escAttr\(/.test(src), true, 'AC10 ' + f + ' escapes output');
        _assertEqual(/act(On)?\([^)]*\)\.trim\(\)/.test(src), false, 'AC10 ' + f + ' keeps the leading space of act()');
      });
      const ed = ALL_SOURCES['pdp-template-editor.js'], st = ALL_SOURCES['pdp-setup.js'];
      _assertEqual(/registerActions\(\{[^}]*pdptSave[^}]*pdptPublish[^}]*\}\)/.test(ed), true, 'AC10 template actions registered');
      _assertEqual(/registerActions\(\{[^}]*pdpsSaveFramework[^}]*pdpsSeed[^}]*\}\)/.test(st), true, 'AC10 setup actions registered');
      ['readPdpSetup', 'seedPdpDefaults', 'savePdpFramework', 'addPdpFrameworkSet'].forEach(n => _assertEqual(st.indexOf(n + '(') > -1, true, 'AC10 setup page calls ' + n));
      ['startPdpTemplateDraft', 'savePdpTemplateDraft', 'publishPdpTemplate', 'discardPdpTemplateDraft'].forEach(n => _assertEqual(ed.indexOf(n + '(') > -1, true, 'AC10 editor calls ' + n));
    },
  },
  {
    name: 'N-436 AC11 wiring: people.html load order, framework column, seed file is data only',
    fn: function () {
      const html = ALL_HTML['people.html'];
      const at = (f) => html.indexOf('js/' + f);
      _assertEqual(at('pdp-data.js') > -1 && at('pdp-seed.js') > at('pdp-data.js'), true, 'AC11 pdp-seed.js after pdp-data.js');
      _assertEqual(at('pdp-setup.js') > at('engagement-forms.js') && at('pdp-template-editor.js') > at('pdp-setup.js'), true, 'AC11 UI files after engagement-forms.js');
      _assertEqual(CONFIG.LIST_FIELDS.PDPFramework.includes('UpdatedBy'), true, 'AC11 PDPFramework.UpdatedBy registered');
      _assertEqual(pdpCleanFramework({ Title: 't', UpdatedBy: 'A@Mg.test', Evil: 1 }, 'create').UpdatedBy, 'a@mg.test', 'AC11 UpdatedBy cleaned as an email');
      _assertEqual(/\bfunction\b|=>|getItems|createItem|fetch\(/.test(_pdpsCode(ALL_SOURCES['pdp-seed.js'])), false, 'AC11 pdp-seed.js is data only');
    },
  },
  {
    name: 'N-436 AC12 (QA fixes) a meeting keeps its template version; editor names; framework grid and error box contrast',
    fn: function () {
      const rows = [
        { id: '10', MeetingType: 'Quarterly', VersionNo: 1, Status: 'Retired' },
        { id: '11', MeetingType: 'Quarterly', VersionNo: 2, Status: 'Published' },
        { id: '12', MeetingType: 'Monthly', VersionNo: 1, Status: 'Published' },
      ];
      _assertEqual(pdpActiveTemplate(rows, 'Quarterly').id, '11', 'AC12 v2 is the active Quarterly version');
      _assertEqual(pdpTemplateForMeeting(rows, { TemplateID: 10, MeetingType: 'Quarterly', TemplateVersion: 1 }).id, '10', 'AC12 a v1 meeting still resolves v1 after v2 is published');
      _assertEqual(pdpTemplateForMeeting(rows, { TemplateID: '11' }).VersionNo, 2, 'AC12 resolved by TemplateID');
      _assertEqual(pdpTemplateForMeeting(rows, { MeetingType: 'Quarterly', TemplateVersion: 1 }).id, '10', 'AC12 falls back to type + version, not the active one');
      _assertEqual(pdpTemplateForMeeting(rows, { TemplateID: 99, MeetingType: 'Quarterly', TemplateVersion: 1 }).id, '10', 'AC12 an unknown id falls back to type + version');
      _assertEqual(pdpTemplateForMeeting(rows, { MeetingType: 'Quarterly' }), null, 'AC12 no pointer: null, never "latest"');
      _assertEqual(pdpTemplateForMeeting([], { TemplateID: 10 }), null, 'AC12 no rows');
      const people = [{ EmployeeName: 'Pat Ops', WorkEmail: 'Pat.Ops@mg.test' }, { EmployeeName: 'Ghost', WorkEmail: 'x@mg.test', IsPlaceholder: true }];
      _assertEqual(pdpNameByEmail(people, 'pat.ops@MG.test'), 'Pat Ops', 'AC12 name from the People row');
      _assertEqual(pdpNameByEmail(people, 'x@mg.test'), 'x@mg.test', 'AC12 a placeholder never names anyone');
      _assertEqual(pdpNameByEmail(people, 'nobody@mg.test'), 'nobody@mg.test', 'AC12 falls back to the email');
      _assertEqual(pdpNameByEmail(people, ''), '', 'AC12 blank stays blank');
      _assertEqual(/pdpNameByEmail\(_pdpsState\.people, audit\.by\)/.test(ALL_SOURCES['pdp-setup.js']), true, 'AC12 the footer shows the name');
      const css = ALL_CSS['people.css'];
      const pillar = (css.match(/\.data-table th\.pdps-pillar\s*\{[^}]*\}/) || [''])[0].replace(/\/\*[\s\S]*?\*\//g, '');
      _assertEqual(/background:\s*var\(--surface\)/.test(pillar) && /color:\s*var\(--text-primary\)/.test(pillar), true, 'AC12 pillar row header: neutral surface + primary text (not the brand band)');
      _assertEqual(/text-transform:\s*none/.test(pillar), true, 'AC12 pillar row header is not upper-cased');
      _assertEqual(/--brand-tertiary|--status-[a-z]+-text/.test(pillar), false, 'AC12 pillar row header uses no brand/status text token');
      const prob = (css.match(/\.pdpt-problems:not\(:empty\)\s*\{[^}]*\}/) || [''])[0];
      _assertEqual(/color:\s*var\(--text-primary\)/.test(prob) && !/color:\s*var\(--status-/.test(prob), true, 'AC12 error box text is not a status token on its own tint');
    },
  }
);