// tests/assert-pdp-access.js — PDP confidentiality: personal lists, AccessKey, re-point plan,
// client access gate, Data Health / Org Chart hooks, PDP-D12 source guard (N-435 / PDP-3).
// Loads AFTER tests/assert-pdp-identity.js (reuses its _pdpFx People fixture) and assert-pdp-data.js.

const _PDP_PERSONAL = ['PDPCycles', 'PDPMeetings', 'PDPGoals', 'PDPActions', 'PDPScores'];

function _pdpAccThrows(fn) { try { fn(); } catch (e) { return String(e.message); } return null; }

// The flow's trigger-condition expression, evaluated the way Power Automate does: coalesce each
// column to '', concat with '|', toLower the result. Written out separately from pdpAccessKey so
// the two can be compared.
function _pdpFlowKey(it) {
  const c = v => (v === undefined || v === null ? '' : String(v));
  return (c(it.PersonEmail) + '|' + c(it.LineManagerEmail) + '|' + c(it.CSDEmail) + '|' + c(it.ReadOnlyEmails)).toLowerCase();
}

// An item for person `p` with the snapshot `lm` / `csd` (locked unless `locked` is false).
function _pdpAccItem(id, p, lm, csd, extra, locked) {
  const it = Object.assign({ id: String(id), PersonID: Number(p.id), PersonEmail: p.WorkEmail, LineManagerEmail: lm, CSDEmail: csd, ReadOnlyEmails: '' }, extra);
  if (locked !== false) it.AccessKey = _pdpFlowKey(it);
  return it;
}

// PDP-D12 guard: files (other than the allowlist) that mention a PDP list or a PDP data function.
// Adding a file to the allowlist is a deliberate PDP-D12 review: that file now handles PDP data.
const _PDP_GUARD_ALLOW = ['config.js', 'graph-client.js', 'pdp-identity.js', 'pdp-data.js', 'api-pdp.js', 'os-admin.js', 'org-chart.js',
  // PDP-D12 review: N-437 — the cycle engine (pure rules), the PDP Setup > Cycle tab and the PDP Setup
  // page's "missing meetings" banner read the personal Cycles / Meetings lists (Admin / People Ops only).
  'pdp-cycle.js', 'pdp-cycle-admin.js', 'pdp-setup.js',
  // PDP-D12 review: N-438 — My Development shows one person's own meeting records (pdp-my.js) using the
  // pure prep / sign-off rules (pdp-prep.js). people.html only; never mobile.html, MCP or the Command Bar.
  'pdp-prep.js', 'pdp-my.js'];
const _PDP_GUARD_RE = /\b(PDPFramework|PDPTemplates|PDPCycles|PDPMeetings|PDPGoals|PDPActions|PDPScores)\b|CONFIG\.PDP\.(LISTS|PERSONAL_LIST_KEYS)|\bpdpPersonalLists\b|\b(getPdp(?!Identity)\w*|createPdp\w*|updatePdp\w*|repointPdp\w*)/;
function _pdpGuardOffenders(sources, allow) {
  return Object.keys(sources).filter(f => !allow.includes(f) && _PDP_GUARD_RE.test(sources[f] || '')).sort();
}

ASSERTIONS.push(
  {
    name: 'N-435 AC1–AC3 config: personal lists, ACCESS, restricted mapping, pdpAdmin / pdpAggregate',
    fn: function () {
      _assertEqual(pdpPersonalLists(), _PDP_PERSONAL, 'AC1 pdpPersonalLists = the five personal lists, from CONFIG.PDP.LISTS');
      CONFIG.PDP.PERSONAL_LIST_KEYS.forEach(k => _assertEqual(k in CONFIG.PDP.LISTS, true, 'AC1 ' + k + ' is a LISTS key'));
      _assertEqual(Number.isInteger(CONFIG.PDP.ACCESS.UNSECURED_GRACE_MIN) && CONFIG.PDP.ACCESS.UNSECURED_GRACE_MIN > 0, true, 'AC1 grace is a positive whole number');
      _assertEqual(CONFIG.PDP.ACCESS.EMAIL_SEP, ';', 'AC1 separator matches the flow split()');
      _PDP_PERSONAL.forEach(l => _assertEqual(CONFIG.RESTRICTED_LISTS.includes(l), true, 'AC2 ' + l + ' restricted'));
      ['PDPFramework', 'PDPTemplates'].forEach(l => _assertEqual(CONFIG.RESTRICTED_LISTS.includes(l), false, 'AC2 ' + l + ' not restricted'));
      _assertEqual(CONFIG.ROLE_CAPABILITIES.pdpAdmin, ['admin', 'people_ops'], 'AC3 pdpAdmin');
      _assertEqual(CONFIG.ROLE_CAPABILITIES.pdpAggregate, ['admin', 'people_ops', 'leadership'], 'AC3 pdpAggregate');
      _assertEqual(roleCan('leadership', 'pdpAdmin'), false, 'AC3 Leadership never pdpAdmin (PDP-D1)');
    },
  },
  {
    name: 'N-435 AC4–AC5 columns and cleaners: AccessKey never written, ReadOnlyEmails normalised',
    fn: function () {
      _PDP_PERSONAL.forEach(l => {
        _assertEqual(CONFIG.LIST_FIELDS[l].slice(-2), ['ReadOnlyEmails', 'AccessKey'], 'AC4 ' + l + ' ends with the two access columns');
        _assertEqual(pdpListColumns(l).slice(-2), ['ReadOnlyEmails', 'AccessKey'], 'AC4 ' + l + ' cleaner spec agrees');
      });
      ['PDPFramework', 'PDPTemplates'].forEach(l =>
        _assertEqual(CONFIG.LIST_FIELDS[l].some(c => c === 'AccessKey' || c === 'ReadOnlyEmails'), false, 'AC4 ' + l + ' unchanged'));
      const who = { PersonID: 4, PersonEmail: 'tia.tp@mg.test', CycleYear: 2027 };
      const base = {
        PDPCycles: who, PDPGoals: Object.assign({ Title: 'g' }, who), PDPActions: { Title: 'a', PersonID: 4, PersonEmail: 'tia.tp@mg.test' },
        PDPMeetings: Object.assign({ MeetingType: 'Monthly', Period: '2027-02', DueDate: '2027-02-27' }, who),
        PDPScores: Object.assign({ MeetingID: 9, PillarKey: 'own-it', Source: 'Self' }, who),
      };
      _PDP_PERSONAL.forEach(l => {
        const c = pdpCleanFields(l, Object.assign({ AccessKey: 'forged', ReadOnlyEmails: 'B@x.co; a@x.co,a@x.co' }, base[l]), 'create');
        _assertEqual('AccessKey' in c, false, 'AC5 ' + l + ' create drops AccessKey');
        _assertEqual(c.ReadOnlyEmails, 'a@x.co;b@x.co', 'AC5 ' + l + ' ReadOnlyEmails normalised');
        _assertEqual(pdpCleanFields(l, { AccessKey: 'forged' }, 'update'), {}, 'AC5 ' + l + ' update drops AccessKey');
      });
      _assertEqual(pdpCleanGoals({ ReadOnlyEmails: '' }, 'update'), { ReadOnlyEmails: '' }, 'AC5 update blank clears to ""');
      _assertEqual(pdpCleanGoals({ ReadOnlyEmails: ' ; ' }, 'update'), { ReadOnlyEmails: '' }, 'AC5 separators only = blank');
      _assertEqual(pdpEmailList([' Z@x.co ', 'a@x.co', '', null]), 'a@x.co;z@x.co', 'AC5 array in');
      _assertEqual(pdpEmailList(null), '', 'AC5 null is ""');
      _assertEqual(_pdpAccThrows(() => pdpCleanGoals({ ReadOnlyEmails: 'a@x.co;nope' }, 'update')) !== null, true, 'AC5 a bad email throws');
    },
  },
  {
    name: 'N-435 AC6 AccessKey parity with the flow expression; secured / unsecured',
    fn: function () {
      const it = { PersonEmail: 'Tia.Tp@mg.test', LineManagerEmail: 'sam.sdm@mg.test', CSDEmail: null, ReadOnlyEmails: 'old@mg.test' };
      _assertEqual(pdpAccessKey(it), 'tia.tp@mg.test|sam.sdm@mg.test||old@mg.test', 'AC6 pinned format (blank = "", lower-cased)');
      _assertEqual(pdpAccessKey(it), _pdpFlowKey(it), 'AC6 equals the flow expression');
      _assertEqual(pdpAccessKey({}), '|||', 'AC6 all blank');
      _assertEqual(pdpIsSecured(Object.assign({ AccessKey: _pdpFlowKey(it) }, it)), true, 'AC6 secured when the key matches');
      _assertEqual(pdpIsSecured(Object.assign({ AccessKey: _pdpFlowKey(it) }, it, { LineManagerEmail: 'new@mg.test' })), false, 'AC6 stale after a snapshot change');
      _assertEqual([pdpIsSecured(it), pdpIsSecured(Object.assign({ AccessKey: '' }, it)), pdpIsSecured(null)], [false, false, false], 'AC6 missing / blank key');
      const now = Date.parse('2027-02-01T12:00:00Z');
      const mins = m => new Date(now - m * 60000).toISOString();
      const lists = {
        PDPGoals: [
          Object.assign({ id: '1', PersonID: 4, Created: mins(5) }, it),                          // young, unlocked: grace
          Object.assign({ id: '2', PersonID: 4, Created: mins(40) }, it),                         // old, unlocked
          Object.assign({ id: '3', PersonID: 4, Created: mins(90), AccessKey: _pdpFlowKey(it) }, it),   // locked
        ],
        PDPActions: [Object.assign({ id: '7', PersonID: 5 }, it)],                                 // no Created: old
      };
      _assertEqual(pdpUnsecuredItems(lists, now).map(u => u.list + ':' + u.id + ':' + u.ageMin),
        ['PDPActions:7:null', 'PDPGoals:2:40'], 'AC6 unsecured past grace only, oldest first, no Created = old');
      _assertEqual(pdpUnsecuredItems(lists, new Date(now)).length, 2, 'AC6 now as a Date');
    },
  },
  {
    name: 'N-435 AC7 pdpIsPastItem per list; a Score follows its meeting',
    fn: function () {
      const mt = new Map([['9', { id: '9', Status: 'Held' }], ['10', { id: '10', Status: 'PrepOpen' }]]);
      const t = (l, it) => pdpIsPastItem(l, it, mt);
      _assertEqual(['Held', 'SignedOff', 'Skipped', 'Planned', 'PrepOpen'].map(s => t('PDPMeetings', { Status: s })), [true, true, true, false, false], 'AC7 meetings');
      _assertEqual([t('PDPCycles', { Status: 'Closed' }), t('PDPCycles', { Status: 'Open' })], [true, false], 'AC7 cycles');
      _assertEqual(['Achieved', 'Dropped', 'Open'].map(s => t('PDPGoals', { Status: s })), [true, true, false], 'AC7 goals');
      _assertEqual([t('PDPActions', { IsDone: true }), t('PDPActions', { IsDone: false }), t('PDPActions', {})], [true, false, false], 'AC7 actions');
      _assertEqual([t('PDPScores', { MeetingID: 9 }), t('PDPScores', { MeetingID: 10 }), t('PDPScores', { MeetingID: 99 })], [true, false, false], 'AC7 scores via meeting; missing = not past');
      _assertEqual([t('PDPFramework', { Status: 'Closed' }), t('PDPGoals', null)], [false, false], 'AC7 other lists / null');
    },
  },
  {
    name: 'N-435 AC8 re-point plan: open vs past, ReadOnlyEmails, unresolved, patch keys, idempotent',
    fn: function () {
      const fx = _pdpFx();
      const lm = fx.sdm.WorkEmail, csd = fx.csd.WorkEmail, tom = fx.tp2.WorkEmail;
      // Tia (4) now reports to Tom (5) -> LM tom, CSD unchanged (Tom reports to Cara).
      const people = fx.all.map(p => Object.assign({}, p));
      people.find(p => p.id === '4').ReportsTo = tom;
      const items = {
        PDPMeetings: [
          _pdpAccItem(20, fx.tp1, lm, csd, { Status: 'Planned' }),
          _pdpAccItem(21, fx.tp1, lm, csd, { Status: 'SignedOff', ReadOnlyEmails: tom + ';prev@mg.test' }),
          _pdpAccItem(22, fx.stp, fx.sdm.WorkEmail, csd, { Status: 'Planned' }),               // Stu unchanged
        ],
        PDPScores: [_pdpAccItem(30, fx.tp1, lm, csd, { MeetingID: 21, Source: 'Manager' })],    // meeting 21 is past
        PDPGoals: [_pdpAccItem(40, { id: '99', WorkEmail: 'ghost@mg.test' }, lm, csd, { Status: 'Open' })],   // no People row
        PDPActions: [], PDPCycles: [],
      };
      const plan = pdpBuildRepointPlan(people, items);
      const byId = {};
      plan.rows.forEach(r => { byId[r.list + ':' + r.id] = r; });
      _assertEqual(Object.keys(byId).sort(), ['PDPMeetings:20', 'PDPMeetings:21', 'PDPScores:30'], 'AC8 only Tia\'s items patched');
      _assertEqual(byId['PDPMeetings:20'].patch, { LineManagerEmail: tom }, 'AC8 open item: LM only, ReadOnlyEmails untouched, unchanged CSD not sent');
      _assertEqual(byId['PDPMeetings:21'].patch, { LineManagerEmail: tom, ReadOnlyEmails: 'prev@mg.test;' + lm },
        'AC8 past item: old LM added, new LM removed from ReadOnlyEmails, sorted');
      _assertEqual(byId['PDPScores:30'].patch, { LineManagerEmail: tom, ReadOnlyEmails: lm }, 'AC8 score of a past meeting is past');
      _assertEqual(byId['PDPScores:30'].source, 'Manager', 'AC8 row carries Source for the Scores writer');
      _assertEqual([byId['PDPMeetings:20'].from, byId['PDPMeetings:20'].to], [{ lm, csd }, { lm: tom, csd }], 'AC8 from / to');
      plan.rows.forEach(r => Object.keys(r.patch).forEach(k =>
        _assertEqual(['LineManagerEmail', 'CSDEmail', 'ReadOnlyEmails'].includes(k), true, 'AC8 patch key ' + k + ' allowed')));
      _assertEqual(plan.unresolved, [{ list: 'PDPGoals', id: '40', personId: 99, reason: 'noPerson' }], 'AC8 unresolvable listed, not patched');
      // Apply the patches and re-plan: nothing left.
      const applied = JSON.parse(JSON.stringify(items));
      plan.rows.forEach(r => Object.assign(applied[r.list].find(i => i.id === r.id), r.patch));
      _assertEqual(pdpBuildRepointPlan(people, applied).rows, [], 'AC8 idempotent');
      _assertEqual(pdpBuildRepointPlan(people, items, ['3']).rows, [], 'AC8 ids scope the plan');
      // Past item: an old LM equal to the person, or blank, is never added.
      const selfLm = _pdpAccItem(50, fx.tp1, fx.tp1.WorkEmail, '', { Status: 'Achieved' });
      _assertEqual(pdpBuildRepointPlan(people, { PDPGoals: [selfLm] }).rows[0].patch, { LineManagerEmail: tom, CSDEmail: csd }, 'AC8 self / blank old reviewers not added');
      // Broken chains never strip access.
      const noLm = people.map(p => (p.id === '4' ? Object.assign({}, p, { ReportsTo: '' }) : p));
      _assertEqual(pdpBuildRepointPlan(noLm, { PDPGoals: [items.PDPMeetings[0]] }).unresolved.map(u => u.reason), ['noLineManager'], 'AC8 no ReportsTo');
      const noCsd = people.map(p => (p.id === '5' ? Object.assign({}, p, { ReportsTo: '' }) : p));
      _assertEqual(pdpBuildRepointPlan(noCsd, { PDPMeetings: [items.PDPMeetings[0]] }).unresolved.map(u => u.reason), ['noCsd'], 'AC8 CSD lost up the chain');
      const noMail = people.map(p => (p.id === '4' ? Object.assign({}, p, { WorkEmail: '' }) : p));
      _assertEqual(pdpBuildRepointPlan(noMail, { PDPMeetings: [items.PDPMeetings[0]] }).unresolved.map(u => u.reason), ['noWorkEmail'], 'AC8 no WorkEmail');
    },
  },
  {
    name: 'N-435 AC9 pdpAffectedPeople: a TP move, a manager move (cascade), a no-op',
    fn: function () {
      const fx = _pdpFx();
      const before = fx.all.map(p => Object.assign({}, p));
      const move = (id, to) => before.map(p => (p.id === id ? Object.assign({}, p, { ReportsTo: to }) : Object.assign({}, p)));
      _assertEqual(pdpAffectedPeople(before, move('4', fx.tp2.WorkEmail)), ['4'], 'AC9 TP change = that TP');
      // A second CSD: Sam (SDM) moves to Cleo -> Sam, Stu, Tia and Deep (under Stu) all change CSD.
      const cleo = fx.P(8, 'Cleo Csd', 'CSD', { ReportsTo: 'leader@mg.test' });
      const b2 = before.concat([cleo]);
      const a2 = b2.map(p => (p.id === '2' ? Object.assign({}, p, { ReportsTo: cleo.WorkEmail }) : p));
      _assertEqual(pdpAffectedPeople(b2, a2), ['2', '3', '4', '7'], 'AC9 manager move cascades to the tree');
      _assertEqual(pdpAffectedPeople(before, before.map(p => Object.assign({}, p))), [], 'AC9 no-op');
    },
  },
  {
    name: 'N-435 AC10 client gate: pdpAccessFor, pdpScoreVisible, pdpVisibleItems (ghosted identity)',
    fn: function () {
      const it = { PersonEmail: 'tia.tp@mg.test', LineManagerEmail: 'sam.sdm@mg.test', CSDEmail: 'cara.csd@mg.test', ReadOnlyEmails: 'old.lm@mg.test;x@mg.test' };
      const a = (role, em) => pdpAccessFor(role, em, it);
      _assertEqual(a('admin', 'anyone@mg.test'), { level: 'edit', as: 'admin' }, 'AC10 admin');
      _assertEqual(a('people_ops', ''), { level: 'edit', as: 'admin' }, 'AC10 people_ops');
      _assertEqual(a('talent_partner', 'TIA.tp@mg.test'), { level: 'edit', as: 'self' }, 'AC10 self, case-insensitive');
      _assertEqual(a('delivery_manager', 'sam.sdm@mg.test'), { level: 'edit', as: 'manager' }, 'AC10 manager');
      _assertEqual(a('talent_partner', 'cara.csd@mg.test'), { level: 'edit', as: 'csd' }, 'AC10 csd');
      _assertEqual(a('talent_partner', 'old.lm@mg.test'), { level: 'read', as: 'former' }, 'AC10 former = read');
      [['leadership', 'boss@mg.test'], ['delivery_manager', 'other.dm@mg.test'], ['talent_partner', 'tom.tp@mg.test'], ['viewer', '']].forEach(([r, e]) =>
        _assertEqual(a(r, e), { level: null, as: null }, 'AC10 ' + r + ' stranger gets nothing'));
      _assertEqual(pdpAccessFor('admin', 'x', null), { level: null, as: null }, 'AC10 no item');
      const v = (as, src, rev) => pdpScoreVisible(as ? { level: 'edit', as } : { level: null, as: null }, src, rev);
      const all = ['self', 'manager', 'csd', 'former', 'admin'];
      _assertEqual(all.map(as => v(as, 'Self', false)), [true, false, false, false, true], 'AC10 Self row, not revealed');
      _assertEqual(all.map(as => v(as, 'Self', true)), [true, true, true, true, true], 'AC10 Self row, revealed');
      _assertEqual(all.map(as => v(as, 'Manager', false)), [false, true, true, false, true], 'AC10 Manager row, not revealed');
      _assertEqual(all.map(as => v(as, 'Manager', true)), [true, true, true, true, true], 'AC10 Manager row, revealed');
      _assertEqual(['self', 'manager', 'former', null].map(as => v(as, 'Agreed', false)), [true, true, true, false], 'AC10 Agreed row shared; no access = hidden');
      const rows = [
        Object.assign({ id: 'g1' }, it),
        Object.assign({ id: 'g2' }, it, { PersonEmail: 'tom.tp@mg.test', LineManagerEmail: 'cara.csd@mg.test', ReadOnlyEmails: '' }),
        Object.assign({ id: 's1', Source: 'Self' }, it),
        Object.assign({ id: 's2', Source: 'Manager' }, it),
      ];
      // Admin ghosting Sam (delivery_manager): the token returns every row; the gate must not.
      _assertEqual(pdpVisibleItems(rows, 'delivery_manager', pdpEffectiveEmail('admin@mg.test', 'sam.sdm@mg.test')).map(r => r.id), ['g1', 's2'], 'AC10 ghosted manager');
      _assertEqual(pdpVisibleItems(rows, 'talent_partner', 'tia.tp@mg.test').map(r => r.id), ['g1', 's1'], 'AC10 employee');
      _assertEqual(pdpVisibleItems(rows, 'talent_partner', 'tia.tp@mg.test', () => true).map(r => r.id), ['g1', 's1', 's2'], 'AC10 employee after reveal');
      _assertEqual(pdpVisibleItems(rows, 'leadership', 'boss@mg.test'), [], 'AC10 leadership sees none');
    },
  },
  {
    name: 'N-435 AC11 api-pdp.js: access reads, per-list writers, no raw Graph / delete / AccessKey write',
    fn: function () {
      const calls = [];
      const o = { g: getItems, u: updateItem, p: getPeople };
      const never = function () { return new Promise(function () {}); };
      try {
        getItems = function (l, f, s) { calls.push(['get', l, f || '', s || '']); return never(); };
        updateItem = function (l, i, f) { calls.push(['update', l, i, f]); return never(); };
        getPeople = function (a) { calls.push(['people', a]); return never(); };
        getPdpAccessReport();
        _assertEqual(calls[0], ['people', false], 'AC11 report reads People incl. leavers');
        _assertEqual(calls.slice(1).map(c => c[1] + '~' + c[2]), _PDP_PERSONAL.map(l => l + '~'), 'AC11 report reads every personal list unfiltered');
        calls.slice(1).forEach(c => _assertEqual(c[3], ['Id'].concat(CONFIG.LIST_FIELDS[c[1]], ['Created']).join(','), 'AC11 ' + c[1] + ' select adds Created'));
        calls.length = 0;
        repointPdpAccess(['4', '7']);
        _assertEqual(calls.filter(c => c[0] === 'get').map(c => c[1] + '~' + c[2]),
          [].concat(..._PDP_PERSONAL.map(l => [l + '~fields/PersonID eq 4', l + '~fields/PersonID eq 7'])), 'AC11 scoped re-point reads by PersonID');
        calls.length = 0;
        const done = repointPdpAccess([]);
        _assertEqual(calls, [], 'AC11 empty id list reads nothing');
        _assertEqual(typeof done.then, 'function', 'AC11 returns a promise');
        const patch = { LineManagerEmail: 'Tom.Tp@mg.test', ReadOnlyEmails: 'sam.sdm@mg.test', AccessKey: 'forged' };
        Object.keys(_PDP_REPOINT_WRITERS).forEach(k => _PDP_REPOINT_WRITERS[k]('5', patch, { source: 'Manager' }));
        _assertEqual(Object.keys(_PDP_REPOINT_WRITERS).sort(), CONFIG.PDP.PERSONAL_LIST_KEYS.slice().sort(), 'AC11 one writer per personal list');
        _assertEqual(calls.map(c => c[0] + ':' + c[1]).sort(), _PDP_PERSONAL.map(l => 'update:' + l).sort(), 'AC11 each writer updates its own list');
        calls.forEach(c => _assertEqual(c[3], { LineManagerEmail: 'tom.tp@mg.test', ReadOnlyEmails: 'sam.sdm@mg.test' }, 'AC11 ' + c[1] + ' cleaned, AccessKey dropped'));
      } finally { getItems = o.g; updateItem = o.u; getPeople = o.p; }
      const src = ALL_SOURCES['api-pdp.js'].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      _assertEqual(/graphRequest|deleteItem/.test(src), false, 'AC11 no raw graphRequest / deleteItem');
      _assertEqual(/AccessKey/.test(src), false, 'AC11 api-pdp.js never names AccessKey');
      _assertEqual(/wasListDenied\(/.test(src), true, 'AC11 denials reported');
    },
  },
  {
    name: 'N-435 AC12–AC13 hooks: Org Chart save (pdpAdmin only, non-blocking), Line managers apply, Data Health section',
    fn: function () {
      const oc = ALL_SOURCES['org-chart.js'];
      const save = oc.slice(oc.indexOf('async function saveOrgChartEdits'), oc.indexOf('async function _ocRepointPdp'));
      _assertEqual(/roleCan\(pdpRole, 'pdpAdmin'\)/.test(save), true, 'AC12 gated on pdpAdmin');
      _assertEqual(save.indexOf('getPeople(false)') > -1 && save.indexOf('getPeople(false)') < save.indexOf('await Promise.all(jobs)'), true, 'AC12 People snapshot taken before the writes');
      _assertEqual(save.indexOf('_ocRepointPdp(') > save.indexOf('await Promise.all(jobs)'), true, 'AC12 re-point after the writes');
      const rp = oc.slice(oc.indexOf('async function _ocRepointPdp'));
      _assertEqual(/pdpAffectedPeople\(before, after\)/.test(rp) && /repointPdpAccess\(ids\)/.test(rp), true, 'AC12 scoped to affected people');
      _assertEqual(/catch \(e\)[\s\S]*PDP access not updated/.test(rp.slice(0, 1400)), true, 'AC12 failure keeps the save, says what to do');
      const os = ALL_SOURCES['os-admin.js'];
      const lm = os.slice(os.indexOf('async function applyPdpLineManager'), os.indexOf('// ── Data Health Tab — PDP access'));
      _assertEqual(/repointPdpAccess\(\)/.test(lm) && /catch \(e\)/.test(lm), true, 'AC12 Line managers apply re-points, non-blocking');
      _assertEqual(/\+ _dhRenderPdpAccessHtml\(\)/.test(os), true, 'AC13 section rendered in Data Health');
      const sec = os.slice(os.indexOf('function _dhRenderPdpAccessHtml'), os.indexOf('async function applyPdpRepoint'));
      ['Query error', 'Denied', "act('runPdpAccessCheck')", "act('applyPdpRepoint')"].forEach(t =>
        _assertEqual(sec.indexOf(t) > -1, true, 'AC13 section has ' + t));
      const fetch = os.slice(os.indexOf('async function _dhFetchSectionData'), os.indexOf('function _dhRenderPdpIdentityHtml'));
      _assertEqual(fetch.length > 0 && !/getPdpAccessReport|repointPdpAccess/.test(fetch), true, 'AC13 nothing read on tab load');
      _assertEqual(/confirmModal\(/.test(os.slice(os.indexOf('async function applyPdpRepoint'))), true, 'AC13 re-point confirms first');
      ['org-chart.js', 'os-admin.js'].forEach(f =>
        _assertEqual(/(updateItem|createItem|deleteItem)\(\s*(['"]PDP|CONFIG\.PDP)/.test(ALL_SOURCES[f]), false, 'AC12 ' + f + ' never writes a PDP list directly'));
      const reg = os.slice(os.lastIndexOf('registerActions({'));
      _assertEqual(/runPdpAccessCheck,/.test(reg) && /applyPdpRepoint,/.test(reg), true, 'AC13 actions registered');
    },
  },
  {
    name: 'N-435 AC14 PDP-D12 guard: only allowlisted files touch PDP data; none in MCP / Command Bar / mobile',
    fn: function () {
      _assertEqual(_pdpGuardOffenders(ALL_SOURCES, _PDP_GUARD_ALLOW), [], 'AC14 no js/ file outside the allowlist mentions PDP data');
      // Positive control: the guard does catch a new consumer.
      const planted = Object.assign({}, ALL_SOURCES, { 'command-bar.js': ALL_SOURCES['command-bar.js'] + '\nconst x = getPdpGoals;' });
      _assertEqual(_pdpGuardOffenders(planted, _PDP_GUARD_ALLOW), ['command-bar.js'], 'AC14 positive control');
      _assertEqual(_PDP_GUARD_RE.test('getPdpIdentity()'), false, 'AC14 identity lookups (People data) are not PDP records');
      _assertEqual(CONFIG.MCP.scripts.some(f => /pdp/i.test(f)), false, 'AC14 no PDP file in the MCP bundle');
      if (typeof MCP_SOURCES === 'undefined' || typeof REPO_FILES === 'undefined' || typeof ALL_HTML === 'undefined') _skip('MCP / HTML sources are only read by node tests/run.js');
      _assertEqual(/pdp/i.test(MCP_SOURCES['newton-tools.js']), false, 'AC14 Newton for Claude tools never mention PDP');
      _assertEqual(REPO_FILES.mcpServerCore.length > 0 && !/pdp/i.test(REPO_FILES.mcpServerCore), true, 'AC14 MCP server core read and never mentions PDP');
      const loaders = Object.keys(ALL_HTML).filter(f => /<script[^>]+src="js\/(pdp-[a-z]+|api-pdp)\.js"/.test(ALL_HTML[f])).sort();
      _assertEqual(loaders, ['admin.html', 'people.html', 'reporting.html'], 'AC14 only people.html, admin.html and reporting.html (the Config Panel PDP tab, N-445) load PDP scripts (never mobile.html)');
    },
  },
  {
    name: 'N-435 AC15 admin.html and people.html load the PDP files in dependency order',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') _skip('ALL_HTML is only read by node tests/run.js');
      ['admin.html', 'people.html'].forEach(page => {
        const h = ALL_HTML[page];
        const at = f => h.indexOf('src="js/' + f + '"');
        ['permissions.js', 'pdp-identity.js', 'pdp-data.js', 'graph-client.js', 'api.js', 'api-pdp.js'].forEach(f => _assertEqual(at(f) > -1, true, page + ' loads ' + f));
        _assertEqual(at('permissions.js') < at('pdp-identity.js') && at('pdp-identity.js') < at('pdp-data.js') && at('pdp-data.js') < at('graph-client.js'), true, page + ' pure PDP files after permissions.js, before graph-client.js');
        _assertEqual(at('api.js') < at('api-pdp.js'), true, page + ' api-pdp.js after api.js');
      });
      const h = ALL_HTML['admin.html'];
      _assertEqual(h.indexOf('src="js/api-pdp.js"') < h.indexOf('src="js/os-admin.js"'), true, 'admin.html api-pdp.js before os-admin.js');
    },
  }
);
