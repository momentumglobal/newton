// tests/assert-onboarding-team.js — My Team > Onboarding (N-502 / ONB-7): sign-off rules, the page model, the page markup, the API contract.
// Loads AFTER tests/assert-onboarding.js (reuses _onbFx3 and _onbSrc) and pushes into ASSERTIONS. The api / ui files are checked on source
// text (Node runner only); the pure rules and the markup run in the vm.

const _ONBT_TODAY = '2026-11-26';

// Nina Neu (LM Sam Sdm, CSD Cara Csd) with: a required Week-1 step, the M05 role-play step and the Day-30 sign-off step.
function _onbtFx() {
  const x = _onbFx3();
  const tpl = (key, extra) => Object.assign({
    id: key, RecordType: 'person', Variant: 'TP', Active: true, ItemKey: key, ItemLabel: 'Step ' + key, Section: 'Week 1', SectionOrder: 2, ItemOrder: 1,
    Owner: 'LM', DueOffsetDays: 2, StepMode: 'Guided', Required: true, LevelTag: '', ContentUrl: '', HelpText: '',
  }, extra);
  const templates = [
    tpl('w2', { Owner: 'LM' }),
    tpl('w1', { Owner: 'Employee', ItemOrder: 2 }),
    tpl('onb_tp_m05', { Owner: 'LM', ItemOrder: 3, ItemLabel: 'M05 role-play' }),
    tpl('onb_tp_day30-signoff', { Owner: 'LM', Section: 'Day 30', SectionOrder: 3, ItemOrder: 1, DueOffsetDays: 30, ItemLabel: 'Day 30 sign-off' }),
  ];
  const plan = Object.assign({}, x.buddyPlan, { id: '30', PersonID: 30, Status: 'Active', BuddyEmail: '' });
  const rowFor = (key, who) => ({ id: 'r' + key, Title: 'person', RecordId: '30', ItemKey: key, Done: 'Yes', DoneByEmail: who || x.f.sdm.WorkEmail, DoneAt: '2026-11-25' });
  const signed = (id, kind, outcome) => ({ id: String(id), PlanID: 30, PersonID: 30, Kind: kind, Outcome: outcome || 'Signed', SignedByEmail: x.f.sdm.WorkEmail, SignedAt: '2026-11-26' });
  return Object.assign({}, x, { templates, plan, rowFor, signed });
}

function _onbtModel(x, o) {
  return onbTeamModel(Object.assign({
    plans: [x.plan], people: x.people, templates: x.templates, progressByPlan: {}, signoffs: [], pdpByPerson: {},
    email: x.f.sdm.WorkEmail, role: 'delivery_manager', todayISO: _ONBT_TODAY,
  }, o));
}

ASSERTIONS.push(
  {
    name: 'N-502 AC1 config: CONFIG.ONBOARDING.SIGNOFF, TEAM_TEXT, plan columns, deep link, nothing in the MCP bundle',
    fn: function () {
      const O = CONFIG.ONBOARDING, S = O.SIGNOFF;
      _assertEqual(S.LIST, 'OnboardingSignoffs', 'AC1 list name');
      _assertEqual(S.KINDS, ['RolePlay', 'Day30LM'], 'AC1 kinds');
      _assertEqual(S.STEP_KEYS, { roleplay: 'onb_tp_m05', day30: 'onb_tp_day30-signoff' }, 'AC1 linked step keys');
      _assertEqual(O.PLAN_FIELDS.slice(-2), ['CSDSignedByEmail', 'CSDSignedAt'], 'AC1 CSD countersign columns on the plan');
      _assertEqual(FIELD_ALIASES.OnboardingSignoffs, {}, 'AC1 OnboardingSignoffs registered as {}');
      _assertEqual(CONFIG.MY_MOMENTUM.DEEP_LINKS.teamOnboarding, { tab: 'myTeam', sub: 'onboarding' }, 'AC1 deep link');
      ['pageTitle', 'actionsTitle', 'btnSign', 'btnWithdraw', 'btnCountersign', 'confirmCountersign', 'signoffOk', 'countersignOk'].forEach(k =>
        _assertEqual(typeof O.TEAM_TEXT[k] === 'string' && O.TEAM_TEXT[k].length > 0, true, 'TEAM_TEXT.' + k));
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding/.test(s)), false, 'AC1 no onboarding file in the MCP bundle');
    },
  },
  {
    name: 'N-502 AC2 onbTeamPlans: the LM and the CSD see the plan, Admin sees all, Leadership / People Ops / a stranger see none, Cancelled never',
    fn: function () {
      const x = _onbtFx();
      const mine = (email, role, plans) => onbTeamPlans({ plans: plans || [x.plan], people: x.people, email, role }).length;
      _assertEqual([mine(x.f.sdm.WorkEmail, 'delivery_manager'), mine(x.f.csd.WorkEmail, 'delivery_manager'), mine('a@mg.test', 'admin')], [1, 1, 1], 'AC2 LM, CSD, Admin');
      _assertEqual([mine('leader@mg.test', 'leadership'), mine('po@mg.test', 'people_ops'), mine(x.f.tp2.WorkEmail, 'talent_partner')], [0, 0, 0], 'AC2 Leadership, People Ops, a stranger');
      _assertEqual(mine(x.f.sdm.WorkEmail, 'delivery_manager', [Object.assign({}, x.plan, { Status: 'Cancelled' })]), 0, 'AC2 Cancelled hidden');
      _assertEqual(mine(x.f.sdm.WorkEmail, 'delivery_manager', [Object.assign({}, x.plan, { Status: 'Complete' })]), 1, 'AC2 Complete listed');
    },
  },
  {
    name: 'N-502 AC3 onbSignoffState: latest row per kind by numeric id wins, Withdrawn = unsigned, other plans ignored, CSD from the plan columns',
    fn: function () {
      const x = _onbtFx();
      const st = rows => onbSignoffState({ signoffs: rows, plan: x.plan });
      _assertEqual(st([]).roleplay.signed, false, 'AC3 nothing signed');
      _assertEqual(st([x.signed(2, 'RolePlay'), x.signed(10, 'RolePlay', 'Withdrawn')]).roleplay.signed, false, 'AC3 id 10 (Withdrawn) beats id 2 numerically');
      _assertEqual(st([x.signed(9, 'RolePlay', 'Withdrawn'), x.signed(10, 'RolePlay')]).roleplay.signed, true, 'AC3 re-signed after a withdrawal');
      _assertEqual(st([Object.assign(x.signed(5, 'Day30LM'), { PlanID: 99 })]).day30lm.signed, false, 'AC3 another plan\'s row ignored');
      const csd = onbSignoffState({ signoffs: [], plan: Object.assign({}, x.plan, { CSDSignedByEmail: 'Cara@MG.test', CSDSignedAt: '2026-11-27' }) }).csd;
      _assertEqual([csd.signed, csd.byEmail, csd.at], [true, 'cara@mg.test', '2026-11-27'], 'AC3 CSD countersign from the plan');
    },
  },
  {
    name: 'N-502 AC4 onbDay30Gate + onbSignoffRights: Required steps and role-play gate the LM; CSD needs the LM; withdraw rules; closed / preview off',
    fn: function () {
      const x = _onbtFx();
      const view = (progress, signoffs, email) => _onbtModel(x, { progressByPlan: { '30': progress || [] }, signoffs: signoffs || [], email: email || x.f.sdm.WorkEmail }).rows[0];
      let r = view();
      _assertEqual([r.gate.ready, r.gate.outstanding, r.gate.roleplayMissing], [false, 2, true], 'AC4 two Required steps open (sign-off steps excluded), role-play missing');
      _assertEqual([r.signoff.roleplay.canSign, r.signoff.day30lm.canSign, r.signoff.csd.canSign], [true, false, false], 'AC4 only the role-play can be signed first');
      r = view([x.rowFor('w1'), x.rowFor('w2')], [x.signed(1, 'RolePlay')]);
      _assertEqual([r.gate.ready, r.signoff.day30lm.canSign, r.signoff.roleplay.canWithdraw], [true, true, true], 'AC4 gate open: Day-30 signable, role-play withdrawable');
      r = view([x.rowFor('w1'), x.rowFor('w2')], [x.signed(1, 'RolePlay'), x.signed(2, 'Day30LM')]);
      _assertEqual([r.signoff.day30lm.canWithdraw, r.signoff.roleplay.canWithdraw, r.signoff.csd.canSign], [true, false, false], 'AC4 role-play locked while Day-30 stands; the LM is not the CSD');
      r = view([x.rowFor('w1'), x.rowFor('w2')], [x.signed(1, 'RolePlay'), x.signed(2, 'Day30LM')], x.f.csd.WorkEmail);
      _assertEqual([r.signoff.csd.canSign, r.signoff.roleplay.canSign, r.signoff.day30lm.canWithdraw], [true, false, false], 'AC4 the CSD countersigns, cannot do the LM\'s sign-offs');
      const both = onbSignoffRights({ relations: ['lm', 'csd'], planStatus: 'Active', state: onbSignoffState({ signoffs: [x.signed(2, 'Day30LM')], plan: x.plan }), gate: { ready: true, outstanding: 0, roleplayMissing: false }, csdPresent: true });
      _assertEqual(both.csd.canSign, true, 'AC4 one person may be both LM and CSD');
      const closed = onbSignoffRights({ relations: ['lm', 'csd'], planStatus: 'Complete', state: null, gate: null });
      const prev = onbSignoffRights({ relations: ['lm', 'csd'], planStatus: 'Active', state: null, gate: null, readOnly: true });
      [closed, prev].forEach(g => _assertEqual(['roleplay', 'day30lm', 'csd'].every(k => !g[k].canSign && !g[k].canWithdraw), true, 'AC4 closed / preview: nothing'));
      const noCsd = onbSignoffRights({ relations: ['admin'], planStatus: 'Active', state: onbSignoffState({ signoffs: [x.signed(2, 'Day30LM')], plan: x.plan }), gate: null, csdPresent: false });
      _assertEqual(noCsd.csd.canSign, true, 'AC4 Admin stands in when the plan has no CSD');
    },
  },
  {
    name: 'N-502 AC5 linked steps: M05 and Day-30 are never hand-tickable; every other step keeps its rights',
    fn: function () {
      const x = _onbtFx();
      const m = onbPlanModel({ plan: x.plan, people: x.people, templates: x.templates, progressRows: [], email: x.f.sdm.WorkEmail, role: 'delivery_manager', todayISO: _ONBT_TODAY });
      const items = m.phases.reduce((a, p) => a.concat(p.items), []);
      const by = k => items.find(i => i.itemKey === k);
      _assertEqual([!!by('onb_tp_m05').signoff, by('onb_tp_m05').canTick, by('onb_tp_day30-signoff').canTick], [true, false, false], 'AC5 linked steps flagged and not tickable');
      _assertEqual([by('w2').canTick, !!by('w2').signoff, by('w2').required], [true, false, true], 'AC5 an ordinary LM step still ticks');
    },
  },
  {
    name: 'N-502 AC6 onbTeamModel: rows, My actions (LM-owned steps + sign-offs now), totals, preview strips everything, Complete sits apart',
    fn: function () {
      const x = _onbtFx();
      const mdl = _onbtModel(x);
      const row = mdl.rows[0];
      _assertEqual([row.name, row.done, row.total, row.pct, row.dayNumber], ['Nina Nina'.replace('Nina Nina', 'Nina New'), 0, 4, 0, 2], 'AC6 row header');
      _assertEqual(mdl.actions.length, 1, 'AC6 one joiner with actions');
      _assertEqual(mdl.actions[0].steps.map(i => i.itemKey), ['w2'], 'AC6 the LM-owned step; sign-off steps are not listed as steps');
      _assertEqual(mdl.actions[0].signoffs.map(s => s.kind), ['roleplay'], 'AC6 the role-play sign-off is the action');
      _assertEqual([mdl.totals.active, mdl.totals.awaiting], [1, 1], 'AC6 totals');
      const pre = _onbtModel(x, { readOnly: true });
      _assertEqual([pre.actions.length, pre.rows[0].signoff.roleplay.canSign], [0, false], 'AC6 preview: no actions, no rights');
      const done = _onbtModel(x, { plans: [Object.assign({}, x.plan, { Status: 'Complete' })] });
      _assertEqual([done.rows.length, done.completed.length, done.actions.length], [0, 1, 0], 'AC6 Complete plans sit apart, no actions');
    },
  },
  {
    name: 'N-502 AC7 onbPdpLabel: status only, each state worded, unknown = unavailable',
    fn: function () {
      const T = CONFIG.ONBOARDING.TEAM_TEXT.pdp;
      _assertEqual(onbPdpLabel({ state: 'none' }).text, T.none, 'AC7 none');
      _assertEqual(onbPdpLabel({ state: 'planned', dueISO: '2026-12-01' }).tone, 'warn', 'AC7 planned is a warn');
      _assertEqual(onbPdpLabel({ state: 'signed', heldISO: '2026-12-02' }).tone, 'success', 'AC7 signed is a success');
      _assertEqual([onbPdpLabel(null).text, onbPdpLabel({ state: 'zzz' }).text], [T.unavailable, T.unavailable], 'AC7 anything else is unavailable');
      _assertEqual(Object.keys(onbPdpLabel({ state: 'held', heldISO: '2026-12-02' })).sort(), ['text', 'tone'], 'AC7 nothing but text and tone leaves');
    },
  },
  {
    name: 'N-502 AC8 onbtPageHtml: states, escaping, no inline handlers, buttons follow the rights',
    fn: function () {
      const x = _onbtFx();
      const T = CONFIG.ONBOARDING.TEAM_TEXT;
      if (typeof onbtPageHtml !== 'function') _skip('needs onboarding-team-ui.js');
      const html = (view, ui) => onbtPageHtml(view, ui);
      _assertEqual(html({ none: true }, {}).includes(T.noJoiners), true, 'AC8 no joiners: the empty state');
      _assertEqual(html(null, { error: 'boom <b>' }).includes('boom &lt;b&gt;'), true, 'AC8 the error is escaped');
      const mdl = _onbtModel(x);
      const view = Object.assign({ gateState: 'live', readOnly: false }, mdl);
      const h = html(view, { open: ['30'], completedOpen: false, error: '' });
      _assertEqual(/onclick=|onchange=/.test(h), false, 'AC8 no inline handlers');
      _assertEqual(h.includes('onbtSignoff'), true, 'AC8 the role-play sign-off button is drawn');
      _assertEqual(h.includes('onbtCountersign'), false, 'AC8 no countersign button for the LM');
      _assertEqual(h.indexOf(T.actionsTitle) < h.indexOf(T.joinersTitle), true, 'AC8 My actions before Joiners');
      const evil = _onbtModel(x, { people: x.people.map(p => (p.id === '30' ? Object.assign({}, p, { EmployeeName: '<img src=x>' }) : p)) });
      _assertEqual(html(Object.assign({ gateState: 'live' }, evil), { open: ['30'] }).includes('<img src=x>'), false, 'AC8 names are escaped');
      _assertEqual(html(Object.assign({ gateState: 'preview' }, _onbtModel(x, { readOnly: true })), {}).includes(T.previewNote), true, 'AC8 preview note');
    },
  },
  {
    name: 'N-502 AC9 api-onboarding-team.js: gate and relation checks before any write; one row per sign-off; countersign is one Admin-gated update; PDP is status-only',
    fn: function () {
      const api = _onbSrc('api-onboarding-team.js');
      const ctx = api.slice(api.indexOf('async function _onbTeamWriteCtx'), api.indexOf('async function signOffOnboarding'));
      const order = ['_onbDropCaches()', "gate.state === 'preview'", "gate.state !== 'live'", 'onbTeamPlans(', 'PLAN_ACTIVE'];
      _assertEqual(order.every(s => ctx.indexOf(s) > -1) && order.every((s, i) => !i || ctx.indexOf(s) > ctx.indexOf(order[i - 1])), true, 'AC9 fresh reads, preview, live, relation, Active');
      const sign = api.slice(api.indexOf('async function signOffOnboarding'), api.indexOf('async function countersignOnboarding'));
      _assertEqual((sign.match(/createItem\(/g) || []).length, 1, 'AC9 exactly one OnboardingSignoffs row per sign-off');
      _assertEqual(/updateItem\(/.test(sign), false, 'AC9 a sign-off never touches the plan row');
      _assertEqual(sign.indexOf('onbSignoffRights(') > -1 && sign.indexOf('onbSignoffRights(') < sign.indexOf('createItem('), true, 'AC9 rights checked before the write');
      const cs = api.slice(api.indexOf('async function countersignOnboarding'));
      _assertEqual((cs.match(/updateItem\(/g) || []).length, 1, 'AC9 one update closes the plan');
      _assertEqual(cs.indexOf('_onbPlanWriteGate()') > -1 && cs.indexOf('_onbPlanWriteGate()') < cs.indexOf('updateItem('), true, 'AC9 Admin gate before the update');
      _assertEqual(/CSDSignedByEmail[\s\S]*CSDSignedAt[\s\S]*Status:/.test(cs), true, 'AC9 countersign and Complete in the same write');
      _assertEqual(/\bgetPdp|createPdp|updatePdp|repointPdp/.test(api), false, 'AC9 PDP-D12: no personal-list function named here');
      const pdp = _onbSrc('api-pdp.js');
      const fn = pdp.slice(pdp.indexOf('async function loadJoinerGoalSetting'));
      _assertEqual(/\b(Notes?|Goals?|Score|Rating)\b/.test(fn), false, 'AC9 the status reader names no note, goal or score field');
    },
  },
  {
    name: 'N-502 AC10 wiring: sub-tab for LM / CSD / Admin only, load order, ui file never on mobile',
    fn: function () {
      const base = { role: 'delivery_manager', signals: { hasReports: true } };
      _assertEqual(mmTeamSubTabs(base).some(t => t.key === 'onboarding'), false, 'AC10 hidden without the signal');
      _assertEqual(mmTeamSubTabs({ role: 'delivery_manager', signals: { onbTeam: true } }).some(t => t.key === 'onboarding'), true, 'AC10 shown with it');
      const subs = mmTeamSubTabs({ role: 'delivery_manager', signals: { onbTeam: true } });
      _assertEqual(mmResolveDeepLink('teamOnboarding', [{ key: 'myTeam' }], subs, CONFIG.MY_MOMENTUM, []), { tab: 'myTeam', sub: 'onboarding' }, 'AC10 deep link resolves');
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (Node runner only)');
      const mm = ALL_HTML['my-momentum.html'];
      const at = f => mm.indexOf('js/' + f + '"');
      _assertEqual(at('onboarding-logic.js') > -1 && at('onboarding-team.js') > at('onboarding-logic.js') && at('api-onboarding-team.js') > at('api-pdp.js') && at('onboarding-team-ui.js') > at('onboarding-expectations-ui.js'), true, 'AC10 load order');
      Object.keys(ALL_HTML).filter(k => k !== 'my-momentum.html').forEach(k =>
        _assertEqual(/<script src="js\/(api-)?onboarding-team/.test(ALL_HTML[k]), false, 'AC10 only my-momentum.html loads the team files: ' + k));
    },
  },
);
