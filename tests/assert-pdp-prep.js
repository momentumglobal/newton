// tests/assert-pdp-prep.js — My Development (N-438 / PDP-6). Loads AFTER tests/assert-pdp-cycle.js.
// The pure rules (pdp-prep.js) are exercised directly; the API functions, the page and the nav wiring are
// checked from source because the runner is synchronous. Spec: specs/N-438.md.

const _PDPP_BLOCKS = [
  { key: 'proud', type: 'prepQuestion', by: 'employee', label: 'Proud of?', required: true },
  { key: 'help',  type: 'prepQuestion', by: 'employee', label: 'Support?' },
  { key: 'goal-review', type: 'goalReview', by: 'employee', label: 'Goal review' },
];
const _PDPP_DEF = { schema: 1, sections: [
  { key: 'a', title: 'Prep', blocks: _PDPP_BLOCKS.concat([{ key: 'mgr', type: 'prepQuestion', by: 'manager', label: 'Manager view' }]) },
  { key: 'b', title: 'Meeting', blocks: [{ key: 'notes', type: 'prompt', label: 'Notes' }, { key: 'g', type: 'goalSet', level: 'Annual', min: 3, max: 5, label: 'Goals' }, { key: 'sc', type: 'scoring', label: 'Score' }] },
] };

ASSERTIONS.push(
  {
    name: 'N-438 AC1 config: CONFIG.PDP.ME, page registry, Command Bar mirror, roles',
    fn: function () {
      const me = CONFIG.PDP.ME;
      _assertEqual([me.PREP_LEAD_HOURS, me.KPI_BLOCK_KEY, me.NAV_REASONS], [48, 'how-have-i-performed-against-kpis', ['pilot', 'in-scope', 'has-records']], 'AC1 ME constants');
      const reg = ALL_SOURCES['people-router.js'];
      _assertEqual(/myDevelopment:\s*\{[^}]*label: 'My Development'[^}]*ADMIN, CONFIG\.ROLE_IDS\.PEOPLE_OPS, CONFIG\.ROLE_IDS\.DELIVERY_MANAGER, CONFIG\.ROLE_IDS\.TALENT_PARTNER\]/.test(reg), true, 'AC1 registry roles');
      const cb = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'myDevelopment');
      _assertEqual(!!cb && cb.module === 'people' && cb.href === 'people.html#myDevelopment', true, 'AC1 Command Bar entry');
      _assertEqual(cb.roles.slice().sort(), ['admin', 'delivery_manager', 'people_ops', 'talent_partner'], 'AC1 Command Bar roles mirror the registry (no Leadership, Sales, Staff)');
      _assertEqual(/case 'myDevelopment':\s*await renderMyDevelopmentPage\(\)/.test(ALL_SOURCES['people-nav.js']), true, 'AC1 people-nav dispatches the page');
    },
  },
  {
    name: 'N-438 AC2 nav gate: hidden unless the PDP gate is live for the person themselves',
    fn: function () {
      const nav = ALL_SOURCES['people-nav.js'], app = ALL_SOURCES['people-app.js'], api = ALL_SOURCES['api-pdp.js'];
      _assertEqual(/filter\(p => p\.key !== 'myDevelopment' \|\| _peopleMyDevNav\)/.test(nav) && /let _peopleMyDevNav\s*= false/.test(nav), true, 'AC2 nav item filtered, default hidden');
      _assertEqual(/resolvePdpNav\(\)\.then/.test(app) && /\.catch\(/.test(app), true, 'AC2 resolved after init; a failure leaves it hidden');
      const fn = api.slice(api.indexOf('async function resolvePdpNav'));
      _assertEqual(/gate\.state === 'live'/.test(fn) && /NAV_REASONS\.includes\(gate\.reason\)/.test(fn) && /ident\.me/.test(fn), true, 'AC2 live + reason + a People row');
    },
  },
  {
    name: 'N-438 AC3 pdpPrepWindow',
    fn: function () {
      const w = (m, t) => pdpPrepWindow(m, t);
      _assertEqual(w({ Status: 'Planned', MeetingType: 'Monthly', Period: '2027-02', DueDate: '2027-02-28' }, '2027-01-31'), { state: 'closed', opensOn: '2027-02-01' }, 'AC3 monthly closed before the 1st');
      _assertEqual(w({ Status: 'Planned', MeetingType: 'Monthly', Period: '2027-02', DueDate: '2027-02-28' }, '2027-02-01').state, 'open', 'AC3 monthly opens on the 1st');
      _assertEqual(w({ Status: 'Planned', MeetingType: 'Annual', Period: '2027-01', DueDate: '2027-01-31' }, '2027-01-15').opensOn, '2027-01-01', 'AC3 annual');
      _assertEqual(w({ Status: 'Planned', MeetingType: 'BiAnnual', Period: '2027-07', DueDate: '2027-07-31' }, '2027-07-01').state, 'open', 'AC3 bi-annual');
      const q = { Status: 'Planned', MeetingType: 'Quarterly', Period: '2027-04', DueDate: '2027-04-30', MeetingDate: '2027-04-20T12:00:00Z' };
      _assertEqual(w(q, '2027-04-17'), { state: 'closed', opensOn: '2027-04-18' }, 'AC3 quarterly opens 48h (2 days) before MeetingDate');
      _assertEqual(w(q, '2027-04-18').state, 'open', 'AC3 quarterly open on the day');
      _assertEqual(w({ Status: 'Planned', MeetingType: 'Quarterly', Period: '2027-04', DueDate: '2027-04-30' }, '2027-04-01'), { state: 'open', opensOn: '2027-04-01' }, 'AC3 quarterly with no MeetingDate falls back to the 1st');
      _assertEqual(w({ Status: 'Planned', MeetingType: 'Annual', IsJoiner: 'Yes', Period: '2027-04', DueDate: '2027-04-09' }, '2027-03-10'), { state: 'open', opensOn: '2027-03-10' }, 'AC3 joiner opens DueDate minus 30 days');
      _assertEqual(w({ Status: 'PrepOpen', MeetingType: 'Monthly', Period: '2027-02', DueDate: '2027-02-28' }, '2027-06-01').state, 'open', 'AC3 overdue stays open');
      ['Held', 'SignedOff', 'Skipped'].forEach(st => _assertEqual(w({ Status: st, MeetingType: 'Monthly', Period: '2027-02', DueDate: '2027-02-28' }, '2027-02-10').state, 'locked', 'AC3 ' + st + ' is locked'));
    },
  },
  {
    name: 'N-438 AC4 payload, JSON round-trip, required check, blocks split',
    fn: function () {
      const blocks = _PDPP_BLOCKS;
      const now = '2027-02-10T09:00:00.000Z';
      const p1 = pdpPrepPayload(null, { answers: { proud: '  Shipped N-438  ', junk: 'x', help: '' }, goalReview: { 'goal-review': { '12': { rag: 'Amber', comment: ' ok ' }, 'abc': { rag: 'Red' } } } }, blocks, now);
      _assertEqual(p1, { schema: 1, answers: { proud: 'Shipped N-438' }, goalReview: { 'goal-review': { '12': { rag: 'Amber', comment: 'ok' } } }, savedAt: now }, 'AC4 unknown keys and non-numeric goal ids dropped, text trimmed, no submittedAt on a draft');
      const p2 = pdpPrepPayload(p1, { answers: { proud: 'Shipped N-438' }, submit: true }, blocks, '2027-02-11T09:00:00.000Z');
      _assertEqual(p2.submittedAt, '2027-02-11T09:00:00.000Z', 'AC4 submit sets submittedAt');
      const p3 = pdpPrepPayload(p2, { answers: { proud: 'Edited' } }, blocks, '2027-02-12T09:00:00.000Z');
      _assertEqual([p3.submittedAt, p3.savedAt], ['2027-02-11T09:00:00.000Z', '2027-02-12T09:00:00.000Z'], 'AC4 a draft re-save keeps submittedAt');
      _assertEqual(pdpPrepFromJson(JSON.stringify(p3)).answers, { proud: 'Edited' }, 'AC4 round-trip');
      _assertEqual(pdpPrepFromJson('not json'), { schema: 1, answers: {}, goalReview: {}, savedAt: '', submittedAt: '' }, 'AC4 malformed JSON reads as empty');
      let err = ''; try { pdpPrepPayload(null, { goalReview: { 'goal-review': { '1': { rag: 'Purple' } } } }, blocks, now); } catch (e) { err = e.message; }
      _assertEqual(/Unknown RAG/.test(err), true, 'AC4 RAG enum');
      const one = pdpPrepPayload(null, { answers: { proud: 'x'.repeat(100000) } }, blocks, now);
      _assertEqual(one.answers.proud.length, CONFIG.PDP.TEMPLATE_LIMITS.LABEL_MAX * 10, 'AC4 one answer is capped');
      const many = []; for (let i = 0; i < 20; i++) many.push({ key: 'k' + i, type: 'prepQuestion', by: 'employee' });
      const big = {}; many.forEach(b => { big[b.key] = 'y'.repeat(3000); });
      err = ''; try { pdpPrepPayload(null, { answers: big }, many, now); } catch (e) { err = e.message; }
      _assertEqual(/too long/.test(err), true, 'AC4 over-size payload throws a readable message');
      _assertEqual(pdpPrepMissing(blocks, { answers: { proud: '   ' } }), ['Proud of?'], 'AC4 whitespace counts as blank');
      _assertEqual(pdpPrepMissing(blocks, { answers: { proud: 'x' } }), [], 'AC4 required answered');
      const split = pdpPrepBlocks(_PDPP_DEF);
      _assertEqual([split.employee.map(b => b.key), split.manager.map(b => b.key), split.meeting.map(b => b.key)], [['proud', 'help', 'goal-review'], ['mgr'], ['notes', 'g', 'sc']], 'AC4 blocks split by who answers');
    },
  },
  {
    name: 'N-438 AC5 prep patch: Planned -> PrepOpen binds a newer template once, PrepOpen never re-binds',
    fn: function () {
      const payload = { schema: 1, answers: {}, goalReview: {}, savedAt: 'x' };
      const tpl = { id: '300', MeetingType: 'Monthly', VersionNo: 2, Status: 'Published' };
      const planned = { id: '9', Status: 'Planned', MeetingType: 'Monthly', TemplateID: 200, TemplateVersion: 1 };
      const a = pdpMeetingPatchForPrep(planned, tpl, payload, 'x');
      _assertEqual(Object.keys(a).sort(), ['PrepEmployee', 'Status', 'TemplateID', 'TemplateVersion'], 'AC5 first save: status + rebind');
      _assertEqual([a.Status, a.TemplateID, a.TemplateVersion], ['PrepOpen', 300, 2], 'AC5 values');
      _assertEqual(Object.keys(pdpMeetingPatchForPrep(Object.assign({}, planned, { TemplateVersion: 2 }), tpl, payload, 'x')).sort(), ['PrepEmployee', 'Status'], 'AC5 same version is not re-bound');
      _assertEqual(Object.keys(pdpMeetingPatchForPrep(Object.assign({}, planned, { Status: 'PrepOpen' }), tpl, payload, 'x')), ['PrepEmployee'], 'AC5 PrepOpen: prep only, no status, no re-bind');
      _assertEqual(JSON.parse(a.PrepEmployee), payload, 'AC5 payload is stored as JSON text');
      _assertEqual(pdpCleanMeetings(a, 'update').Status, 'PrepOpen', 'AC5 the patch passes pdpCleanMeetings');
    },
  },
  {
    name: 'N-438 AC6 sign-off plan (employee and manager, symmetrical)',
    fn: function () {
      const now = '2027-03-01T10:00:00.000Z';
      const held = { Status: 'Held' };
      _assertEqual(pdpSignOffPlan(held, 'employee', now), { ok: true, reason: '', patch: { EmployeeSignedAt: now } }, 'AC6 employee signs a Held meeting');
      _assertEqual(pdpSignOffPlan(held, 'manager', now).patch, { ManagerSignedAt: now }, 'AC6 manager variant');
      _assertEqual(pdpSignOffPlan({ Status: 'Held', ManagerSignedAt: '2027-02-28T10:00:00Z' }, 'employee', now).patch, { EmployeeSignedAt: now, Status: 'SignedOff' }, 'AC6 second signature closes the record');
      _assertEqual(pdpSignOffPlan({ Status: 'Held', EmployeeSignedAt: '2027-02-28T10:00:00Z' }, 'manager', now).patch, { ManagerSignedAt: now, Status: 'SignedOff' }, 'AC6 symmetrical');
      ['Planned', 'PrepOpen', 'Skipped'].forEach(s => _assertEqual(pdpSignOffPlan({ Status: s }, 'employee', now).ok, false, 'AC6 ' + s + ' cannot be signed'));
      _assertEqual(pdpSignOffPlan({ Status: 'SignedOff' }, 'employee', now).ok, false, 'AC6 already signed off');
      _assertEqual(pdpSignOffPlan({ Status: 'Held', EmployeeSignedAt: 'x' }, 'employee', now).ok, false, 'AC6 no double signing');
      _assertEqual(pdpSignOffPlan(held, 'robot', now).ok, false, 'AC6 unknown signer');
      _assertEqual(pdpCleanMeetings(pdpSignOffPlan({ Status: 'Held', ManagerSignedAt: 'x' }, 'employee', now).patch, 'update').Status, 'SignedOff', 'AC6 patch passes pdpCleanMeetings');
    },
  },
  {
    name: 'N-438 AC7-AC8 API: load filters by the effective identity; writes refuse Ghost, non-owners, locked meetings (source)',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'];
      const load = src.slice(src.indexOf('async function loadMyDevelopment'), src.indexOf('async function _pdpMyMeeting'));
      _assertEqual((load.match(/pdpVisibleItems\(/g) || []).length >= 4, true, 'AC7 cycles, meetings, goals and actions are all filtered');
      _assertEqual(/pdpEffectiveEmail\(realEmail, getGhostUser\(\)\)/.test(load) && /noPerson: true/.test(load) && /readOnly:/.test(load), true, 'AC7 effective identity, noPerson, readOnly');
      const mine = src.slice(src.indexOf('async function _pdpMyMeeting'), src.indexOf('async function savePdpPrep'));
      _assertEqual(/Ghost Mode is read-only/.test(mine) && /gate\.state !== 'live'/.test(mine) && /That meeting is not yours/.test(mine) && /_cacheInvalidate\(CONFIG\.PDP\.LISTS\.MEETINGS\)/.test(mine), true, 'AC8 ghost, gate, ownership and a fresh read');
      const save = src.slice(src.indexOf('async function savePdpPrep'), src.indexOf('async function signOffPdpMeeting'));
      _assertEqual(/pdpPrepWindow\(m, now\)/.test(save) && /prep is locked/.test(save) && /Prep opens on/.test(save), true, 'AC8 window check on the fresh row');
      _assertEqual(/Template unavailable/.test(save) && /pdpTemplateForMeeting\(templates, m\)/.test(save), true, 'AC8 template resolved from the meeting, not "latest"');
      const sign = src.slice(src.indexOf('async function signOffPdpMeeting'), src.indexOf('async function resolveMyDevelopmentNav'));
      _assertEqual(/pdpSignOffPlan\(m, 'employee'/.test(sign) && /!plan\.ok/.test(sign), true, 'AC8 sign-off uses the shared plan on the fresh row');
      _assertEqual(/Still securing this record/.test(src) && /e\.status === 403 && !pdpIsSecured/.test(src), true, 'AC8 the unlocked-item 403 gets the "still securing" message');
      const mypart = src.slice(src.indexOf('// ── N-438 (PDP-6)'), src.indexOf('// ── N-439 (PDP-7)'));
      _assertEqual(/deleteItem|graphRequest\(|createPdp\w*\(|updatePdp(Goal|Action|Score|Cycle|Framework|Template)|AccessKey/.test(mypart), false, 'AC8 no delete, raw Graph, create, or writes to other lists');
      _assertEqual((mypart.match(/updatePdpMeeting\(/g) || []).length, 2, 'AC8 exactly two meeting writes: prep and sign-off');
    },
  },
  {
    name: 'N-438 AC9-AC11 timeline, template binding, manager prep visibility',
    fn: function () {
      const rows = [
        { id: '2', MeetingType: 'Monthly', Period: '2027-03', DueDate: '2027-03-31', Status: 'Planned' },
        { id: '1', MeetingType: 'Annual', Period: '2027-01', DueDate: '2027-01-31', Status: 'SignedOff', EmployeeSignedAt: 'a', ManagerSignedAt: 'b' },
        { id: '3', MeetingType: 'Annual', IsJoiner: 'Yes', Period: '2027-04', DueDate: '2027-04-09', Status: 'Skipped', SkipReason: 'Within 3 weeks of goal setting' },
        { id: '4', MeetingType: 'Quarterly', Period: '2027-04', DueDate: '2027-04-30', Status: 'PrepOpen', PrepEmployee: JSON.stringify({ submittedAt: 'z' }) },
      ];
      const t = pdpMyTimeline(rows, '2027-03-20');
      _assertEqual(t.map(c => c.id), ['1', '2', '3', '4'], 'AC9 sorted by due date');
      _assertEqual([t[0].state, t[1].state, t[2].state, t[3].state], ['done', 'due', 'skipped', 'upcoming'], 'AC9 states from pdpMeetingState');
      _assertEqual([t[0].employeeSigned, t[0].managerSigned, t[3].submitted, t[2].skipReason, t[2].label], [true, true, true, 'Within 3 weeks of goal setting', 'Joiner goal setting'], 'AC9 flags, skip reason and joiner label');
      const src = ALL_SOURCES['pdp-my.js'];
      _assertEqual(/CONFIG\.PDP\.CYCLE\.JOINER_GOALS/.test(src), true, 'AC9 joiner goal count comes from the engine constant');
      _assertEqual(/peopleCanAccess\('scorecards', _resolvedRole\)/.test(src) && /ME\.KPI_BLOCK_KEY/.test(src) && /navigateToPeople\('scorecards'\)/.test(src), true, 'AC9 Scorecard link only for roles that can open the page');
      const v1 = { id: '100', MeetingType: 'Quarterly', VersionNo: 1, Definition: '{"v":1}' }, v2 = { id: '101', MeetingType: 'Quarterly', VersionNo: 2, Definition: '{"v":2}', Status: 'Published' };
      _assertEqual(pdpTemplateForMeeting([v1, v2], { MeetingType: 'Quarterly', TemplateID: 100, TemplateVersion: 1 }).id, '100', 'AC10 a v1 meeting still renders v1 after v2 is published');
      const rec = pdpMyAgreedRecord({ id: '9', MeetingNotes: '{"answers":{"notes":"Agreed"}}', PrepManager: '{"answers":{"mgr":"Strong"}}' }, [{ MeetingID: 9, Title: 'G1' }, { MeetingID: 8, Title: 'G2' }], [{ MeetingID: 9, Title: 'A1' }]);
      _assertEqual([rec.answers, rec.managerPrep, rec.goals.length, rec.actions.length], [{ notes: 'Agreed' }, { mgr: 'Strong' }, 1, 1], 'AC11 agreed record');
      _assertEqual(pdpMyAgreedRecord({ id: '9', MeetingNotes: 'garbage' }, [], []).answers, {}, 'AC11 malformed notes read as empty');
      _assertEqual(/return ctx\.record \? `<div class="pdpm-block">\$\{label\}\$\{_pdpmTextHtml\(ctx\.mgr\[b\.key\]/.test(src), true, 'AC11 manager prep is rendered only for a Held / SignedOff record');
    },
  },
  {
    name: 'N-438 AC12 sources: allowlist, no PDP list access in the page, no inline handlers / styles / hex, registered files',
    fn: function () {
      _assertEqual(_PDP_GUARD_ALLOW.includes('pdp-prep.js') && _PDP_GUARD_ALLOW.includes('pdp-my.js'), true, 'AC12 allowlist has the two files');
      const my = ALL_SOURCES['pdp-my.js'];
      _assertEqual(/\bon[a-z]+\s*=\s*["']/.test(my) || /style="/.test(my), false, 'AC12 no inline handlers or inline styles');
      _assertEqual(/getPdp\w*\(|createPdp\w*\(|updatePdp\w*\(|PDP(Meetings|Goals|Actions|Cycles|Scores)/.test(my), false, 'AC12 the page never reaches a personal list; it goes through api-pdp.js');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(my + ALL_SOURCES['pdp-prep.js']), false, 'AC12 no hex colours');
      _assertEqual(CONFIG.MCP.scripts.some(f => /pdp-(prep|my)/.test(f)), false, 'AC12 not in the MCP bundle');
      if (typeof ALL_HTML === 'undefined') _skip('HTML sources are only read by node tests/run.js');
      _assertEqual(/src="js\/pdp-prep\.js"/.test(ALL_HTML['people.html']) && /src="js\/pdp-my\.js"/.test(ALL_HTML['people.html']), true, 'AC12 people.html loads both');
      const at = f => ALL_HTML['people.html'].indexOf('src="js/' + f + '"');
      _assertEqual(at('pdp-prep.js') > at('pdp-cycle.js') && at('pdp-my.js') > at('pdp-cycle-admin.js') && at('pdp-my.js') < at('people-app.js'), true, 'AC12 script load order');
      _assertEqual(/pdp-(prep|my)/.test(ALL_HTML['mobile.html']), false, 'AC12 mobile.html never loads them');
    },
  }
);

ASSERTIONS.push(
  {
    name: 'N-438 AC9/AC11 page markup: prep form, locked view, record view, KPI link, sign-off button, escaping',
    fn: function () {
      if (typeof _pdpmDetailHtml !== 'function') _skip('pdp-my.js is not loaded in this harness');
      globalThis._resolvedRole = 'talent_partner';
      if (typeof peopleCanAccess !== 'function') globalThis.peopleCanAccess = (page, role) => page === 'scorecards' && ['talent_partner', 'admin'].includes(role);
      const kpi = CONFIG.PDP.ME.KPI_BLOCK_KEY;
      const def = { schema: 1, sections: [
        { key: 'p', title: 'Pre-work <b>', blocks: [
          { key: kpi, type: 'prepQuestion', by: 'employee', label: 'KPIs?', required: true },
          { key: 'gr', type: 'goalReview', by: 'employee', label: 'Goal review' },
          { key: 'mp', type: 'prepQuestion', by: 'manager', label: 'Manager prep' }] },
        { key: 'm', title: 'Meeting', blocks: [
          { key: 'n', type: 'prompt', label: 'Notes' },
          { key: 'gs', type: 'goalSet', level: 'Annual', min: 3, max: 5, label: 'Goals' },
          { key: 'ac', type: 'actions', max: 3, label: 'Actions' }] },
      ] };
      const tpl = { id: '50', MeetingType: 'Quarterly', VersionNo: 1, Definition: JSON.stringify(def) };
      const thisMonth = localDayISO(new Date()).slice(0, 7);   // the window is derived from today, so the open case uses the current month
      const base = { id: '7', MeetingType: 'Quarterly', Period: thisMonth, DueDate: thisMonth + '-28', TemplateID: 50, TemplateVersion: 1 };
      const data = (m, extra) => Object.assign({ readOnly: false, templates: [tpl], goals: [{ id: 12, Title: 'Goal <i>1</i>', Status: 'Open', MeetingID: 7 }], actions: [{ MeetingID: 7, Title: 'Do it', OwnerRole: 'Employee' }], meetings: [m] }, extra || {});
      const openRow = Object.assign({ Status: "PrepOpen", PrepEmployee: JSON.stringify({ answers: { [kpi]: "Hit <script>" } }), PrepManager: "{\"answers\":{\"mp\":\"SECRET-MANAGER-VIEW\"}}" }, base);
      const open = _pdpmDetailHtml(data(openRow), openRow);
      _assertEqual(/<textarea[^>]+data-pa="/.test(open) && /data-gr="gr"/.test(open), true, 'AC9 an open meeting shows the prep form and the per-goal review');
      _assertEqual(/Open my Scorecard/.test(open), true, 'AC9 the KPI block has the Scorecard link');
      _assertEqual(/SECRET-MANAGER-VIEW|Manager prep/.test(open), false, 'AC11 manager prep is not shown before Held');
      _assertEqual(/<script>|<b>|<i>/.test(open), false, 'AC12 template, goal and answer text are escaped');
      _assertEqual(/Save draft/.test(open) && /Mark prep ready/.test(open) && !/Sign off this record/.test(open), true, 'AC9 prep buttons, no sign-off yet');
      const closed = _pdpmDetailHtml(data(Object.assign({ Status: 'Planned', Period: '2099-04', DueDate: '2099-04-30' }, base, { Period: '2099-04', DueDate: '2099-04-30' })), Object.assign({ Status: 'Planned' }, base, { Period: '2099-04', DueDate: '2099-04-30' }));
      _assertEqual(/Prep opens/.test(closed) && !/<textarea/.test(closed) && !/Save draft/.test(closed), true, 'AC3 before the window: message, no editable fields');
      const heldRow = Object.assign({ Status: 'Held', PrepEmployee: JSON.stringify({ answers: { [kpi]: 'Mine' } }), PrepManager: '{"answers":{"mp":"Strong view"}}', MeetingNotes: '{"answers":{"n":"We agreed X"}}' }, base);
      const held = _pdpmDetailHtml(data(heldRow), heldRow);
      _assertEqual(/Strong view/.test(held) && /We agreed X/.test(held) && /Goal &lt;i&gt;1/.test(held) && /Do it/.test(held), true, 'AC11 Held: manager prep, notes, goals and actions are shown');
      _assertEqual(!/<textarea/.test(held) && /Sign off this record/.test(held), true, 'AC9 Held: read-only, sign-off offered');
      const signed = _pdpmDetailHtml(data(Object.assign({}, heldRow, { EmployeeSignedAt: '2027-05-01T10:00:00Z' })), Object.assign({}, heldRow, { EmployeeSignedAt: '2027-05-01T10:00:00Z' }));
      _assertEqual(/Sign off this record/.test(signed), false, 'AC6 no second sign-off button');
      const ro = _pdpmDetailHtml(data(heldRow, { readOnly: true }), heldRow);
      _assertEqual(/Sign off this record/.test(ro), false, 'AC8 preview / Ghost: no sign-off button');
      const roOpen = _pdpmDetailHtml(data(Object.assign({}, base, { Status: 'PrepOpen' }), { readOnly: true }), Object.assign({}, base, { Status: 'PrepOpen' }));
      _assertEqual(/Save draft/.test(roOpen), false, 'AC8 preview / Ghost: no save buttons');
    },
  }
);

ASSERTIONS.push(
  {
    name: 'N-447 no-prep meeting: note, no prep buttons, sign-off unchanged',
    fn: function () {
      if (typeof _pdpmDetailHtml !== 'function') _skip('pdp-my.js is not loaded in this harness');
      globalThis._resolvedRole = 'talent_partner';
      if (typeof peopleCanAccess !== 'function') globalThis.peopleCanAccess = () => false;
      const def = { schema: 1, sections: [
        { key: 'lb', title: 'Looking Back', blocks: [{ key: 'a', type: 'prompt', label: 'What happened?' }] },
        { key: 'mt', title: 'Meeting', blocks: [{ key: 'ac', type: 'actions', max: 3, label: 'Actions' }] },
      ] };
      const tpl = { id: '60', MeetingType: 'Monthly', VersionNo: 1, Definition: JSON.stringify(def) };
      const thisMonth = localDayISO(new Date()).slice(0, 7);
      const base = { id: '8', MeetingType: 'Monthly', Period: thisMonth, DueDate: thisMonth + '-28', TemplateID: 60, TemplateVersion: 1 };
      const data = m => ({ readOnly: false, templates: [tpl], goals: [], actions: [], meetings: [m] });
      const openRow = Object.assign({ Status: 'PrepOpen' }, base);
      const open = _pdpmDetailHtml(data(openRow), openRow);
      _assertEqual(/No prep needed for this meeting/.test(open) && !/<textarea/.test(open) && !/Save draft/.test(open) && !/Mark prep ready/.test(open), true, 'AC1 open: note, no fields, no prep buttons');
      _assertEqual(/Your answers stay private/.test(open), false, 'AC4 privacy banner suppressed');
      const futureRow = Object.assign({}, base, { Status: 'Planned', Period: '2099-04', DueDate: '2099-04-30' });
      const future = _pdpmDetailHtml(data(futureRow), futureRow);
      _assertEqual(/No prep needed/.test(future) && !/Prep opens/.test(future) && !/Save draft/.test(future), true, 'AC2 before the window: note, no Prep opens banner');
      const heldRow = Object.assign({ Status: 'Held' }, base);
      const held = _pdpmDetailHtml(data(heldRow), heldRow);
      _assertEqual(/No prep needed/.test(held) && /Sign off this record/.test(held), true, 'AC3 Held: note and sign-off offered');
      const signedRow = Object.assign({}, heldRow, { EmployeeSignedAt: '2027-05-01T10:00:00Z' });
      _assertEqual(/Sign off this record/.test(_pdpmDetailHtml(data(signedRow), signedRow)), false, 'AC3 signed: no second sign-off button');
    },
  }
);