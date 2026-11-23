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
    name: 'N-502 fix2 My actions: a sign-off sits at its linked step\'s due position, countersign last; the joiner filter narrows actions and cards',
    fn: function () {
      const x = _onbtFx();
      const tpl = (key, extra) => Object.assign({ id: key, RecordType: 'person', Variant: 'TP', Active: true, ItemKey: key, ItemLabel: 'Step ' + key, Section: 'Week 1', SectionOrder: 2, ItemOrder: 1, Owner: 'LM', DueOffsetDays: 2, StepMode: 'Guided', Required: true, LevelTag: '', ContentUrl: '', HelpText: '' }, extra);
      const templates = [tpl('early', { DueOffsetDays: 1 }), tpl('onb_tp_m05', { DueOffsetDays: 5, ItemOrder: 2 }), tpl('late', { DueOffsetDays: 9, ItemOrder: 3 }), tpl('onb_tp_day30-signoff', { Section: 'Day 30', SectionOrder: 3, DueOffsetDays: 30 })];
      const mdl = _onbtModel(x, { templates });
      const names = mdl.actions[0].entries.map(e => (e.type === 'step' ? e.item.itemKey : 'SIGN:' + e.kind));
      _assertEqual(names, ['early', 'SIGN:roleplay', 'late'], 'fix2 the role-play sign-off sits between its due-date neighbours, not above them');
      const view = Object.assign({ gateState: 'live', readOnly: false }, mdl);
      const second = Object.assign({}, view.rows[0], { planId: '31', name: 'Zed Other' });
      const two = Object.assign({}, view, { rows: view.rows.concat([second]), actions: view.actions.concat([Object.assign({}, view.actions[0], { planId: '31', name: 'Zed Other' })]) });
      if (typeof onbtPageHtml !== 'function') _skip('needs onboarding-team-ui.js');
      const all = onbtPageHtml(two, { open: [], person: '' }), one = onbtPageHtml(two, { open: [], person: '31' });
      _assertEqual([all.includes('Nina New'), all.includes('Zed Other'), all.includes('onbt-person')], [true, true, true], 'fix2 filter drawn with two joiners, both listed');
      _assertEqual([one.includes('Nina New</h3>'), one.includes('Zed Other</h3>')], [false, true], 'fix2 the filter narrows actions and cards to one joiner');
      _assertEqual(onbtPageHtml(view, { open: [], person: '' }).includes('onbt-person'), false, 'fix2 no filter for a single joiner');
      _assertEqual(onbtPageHtml(two, { open: [], person: 'gone' }).includes('Nina New'), true, 'fix2 an unknown filter value shows everyone');
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
      const tk = api.slice(api.indexOf('async function tickOnboardingTeamStep'), api.indexOf('async function signOffOnboarding'));
      _assertEqual(tk.indexOf('_onbTeamWriteCtx(') > -1 && tk.indexOf('_onbTeamWriteCtx(') < tk.indexOf('setChecklistItemDone(') && /onbSignoffStepKind\(step\)/.test(tk) && /onbCanTick\(/.test(tk) && !/onbMyPlans\(/.test(tk), true, 'AC9 a My Team tick uses the team plans, refuses linked steps, checks onbCanTick');
      const ui = _onbSrc('onboarding-team-ui.js');
      _assertEqual(/tickOnboardingTeamStep\(/.test(ui) && !/[^m]tickOnboardingStep\(/.test(ui), true, 'AC9 the page ticks through the team writer');
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

// ── N-516: the "Draft welcome email" step action (ONB-D91–D94) ──────────────────────────────────────────────────────────────
// Nina New starts Wed 25 Nov 2026 (LM Sam Sdm, CSD Cara Csd, buddy Tia Tp in _onbFx3's buddyPlan). Pre-start step carries the action.
function _onbwFx() {
  const x = _onbFx3();
  const extra = [
    Object.assign({}, x.templates[0], { id: 'wel', ItemKey: 'wel', ItemLabel: 'Welcome email and Week 1 agenda sent; buddy named', Owner: 'LM', DueOffsetDays: -2, ItemOrder: 2, ActionKey: ' onb.welcomeEmail ' }),
    Object.assign({}, x.templates[1], { id: 'w4', ItemKey: 'w4', ItemLabel: 'Fifth day <b>&</b> wrap', Owner: 'CSD', DueOffsetDays: 4, ItemOrder: 5 }),
    Object.assign({}, x.templates[1], { id: 'w5', ItemKey: 'w5', ItemLabel: 'Day six step', Owner: 'LM', DueOffsetDays: 5, ItemOrder: 6 }),
    Object.assign({}, x.templates[1], { id: 'w0b', ItemKey: 'w0b', ItemLabel: 'Second start-day step', Owner: 'Ops', DueOffsetDays: 0, ItemOrder: 7, ActionKey: 'nope' }),
  ];
  const templates = x.templates.concat(extra);
  const model = o => onbTeamModel(Object.assign({
    plans: [x.buddyPlan], people: x.people, templates, progressByPlan: {}, signoffs: [], pdpByPerson: {},
    email: x.f.sdm.WorkEmail, role: 'delivery_manager', todayISO: '2026-11-23',
  }, o));
  return Object.assign({}, x, { templates, model });
}

ASSERTIONS.push(
  {
    name: 'N-516 AC1-AC3 STEP_ACTIONS / WELCOME config, onbStepActionKey, onbValidateStep and onbStepFields carry the action',
    fn: function () {
      const O = CONFIG.ONBOARDING;
      _assertEqual(O.STEP_ACTIONS.map(a => a.key), ['onb.welcomeEmail'], 'AC1 one registered action');
      _assertEqual(O.STEP_ACTIONS.every(a => a.label && a.description), true, 'AC1 label + description');
      _assertEqual(O.WELCOME, { AGENDA_FROM: 0, AGENDA_TO: 4, MAILTO_MAX: 1800 }, 'AC1 WELCOME');
      ['subject', 'greeting', 'intro', 'introNoDate', 'agendaTitle', 'agendaWith', 'agendaEmpty', 'buddyTitle', 'buddy', 'buddyNoEmail', 'buddyNone',
        'lmTitle', 'lm', 'close', 'signoff', 'subjectLabel', 'modalTitle', 'modalHint', 'warnNoBuddy', 'warnNoStart', 'btnCopy', 'btnOpen', 'btnClose',
        'copied', 'copyFailed', 'openedLong'].forEach(k => _assertEqual(typeof O.WELCOME_TEXT[k] === 'string' && O.WELCOME_TEXT[k].length > 0, true, 'AC1 WELCOME_TEXT.' + k));
      ['actionLabel', 'actionNone', 'actionHint', 'actionNote', 'actionUnknown'].forEach(k => _assertEqual(typeof O.EDITOR_TEXT[k], 'string', 'AC2 EDITOR_TEXT.' + k));
      _assertEqual(onbStepActionKey({ ActionKey: ' onb.welcomeEmail ' }), 'onb.welcomeEmail', 'registered key, trimmed');
      _assertEqual([onbStepActionKey({}), onbStepActionKey({ ActionKey: null }), onbStepActionKey({ ActionKey: 'newton.test' }), onbStepActionKey(null)], ['', '', '', ''], 'blank / unknown / project action / no row');
      const ok = { owner: 'LM', dueOffsetDays: '-2', stepMode: 'Guided' };
      _assertEqual(onbValidateStep(Object.assign({}, ok, { actionKey: 'onb.welcomeEmail' })).ok, true, 'AC2 a registered action passes');
      _assertEqual(onbValidateStep(Object.assign({}, ok, { actionKey: '' })).ok, true, 'AC2 None passes');
      _assertEqual(Object.keys(onbValidateStep(Object.assign({}, ok, { actionKey: 'newton.test' })).errors), ['actionKey'], 'AC3 an unregistered key is blocked on the field');
      _assertEqual(onbStepFields(Object.assign({}, ok, { actionKey: 'onb.welcomeEmail' })).ActionKey, 'onb.welcomeEmail', 'AC2 ActionKey written');
      _assertEqual(onbStepFields(Object.assign({}, ok, { actionKey: '' })).ActionKey, null, 'AC2 None writes null');
    },
  },
  {
    name: 'N-516 AC5 onbPlanModel items carry actionKey (registered only) and dueOffsetDays',
    fn: function () {
      const x = _onbwFx();
      const m = onbPlanModel({ plan: x.buddyPlan, people: x.people, templates: x.templates, progressRows: [], email: x.f.sdm.WorkEmail, role: 'delivery_manager', todayISO: '2026-11-23' });
      const items = m.phases.reduce((a, p) => a.concat(p.items), []);
      const by = k => items.find(i => i.itemKey === k);
      _assertEqual(by('wel').actionKey, 'onb.welcomeEmail', 'registered key');
      _assertEqual(by('w0b').actionKey, '', 'unknown key -> ""');
      _assertEqual(by('w1').actionKey, '', 'no key -> ""');
      _assertEqual([by('wel').dueOffsetDays, by('w4').dueOffsetDays, by('w1').dueOffsetDays], [-2, 4, 0], 'dueOffsetDays');
    },
  },
  {
    name: 'N-516 AC9-AC11 onbWelcomeInput: Week 1 window, grouping by day, owner names, buddy, no start date',
    fn: function () {
      const x = _onbwFx();
      const v = x.model();
      const row = v.rows[0];
      const w = row.welcome;
      _assertEqual([w.first, w.name, w.startDate, w.lineManagerName], ['Nina', 'Nina New', '2026-11-25', 'Sam Sdm'], 'AC9 joiner, start date, line manager');
      _assertEqual(w.buddy, { name: 'Tia Tp', email: x.f.tp1.WorkEmail }, 'AC10 buddy name + work email');
      _assertEqual(w.agenda.map(d => d.dayISO), ['2026-11-25', '2026-11-27', '2026-11-28', '2026-11-29'], 'AC9 offsets 0, 2, 3, 4 only (pre-start -2 and day-6 offset 5 left out), in date order');
      _assertEqual(w.agenda[0].dayText, 'Day 1 (start day) · Wednesday 25 November', 'AC9 day text + weekday date');
      _assertEqual(w.agenda[0].items.map(i => i.label), ['Step w1', 'Second start-day step'], 'AC9 model order inside a day');
      _assertEqual(w.agenda[0].items.map(i => i.withName), ['', ''], 'AC9 no "with" for Employee / Ops owners');
      _assertEqual(w.agenda[1].items[0].withName, 'Sam Sdm', 'AC9 "with" the named line manager');
      _assertEqual(w.agenda[2].items[0].withName, 'Tia Tp', 'AC9 "with" the named buddy');
      _assertEqual(w.agenda[3].items[0].withName, 'Cara Csd', 'AC9 "with" the named CSD');
      _assertEqual(JSON.stringify(w.agenda).includes('library') || JSON.stringify(w.agenda).includes('Step lf'), false, 'AC9 no Library step');
      const done = x.model({ progressByPlan: { pl30: [{ id: 'r1', Title: 'person', RecordId: '30', ItemKey: 'w1', Done: 'Yes', DoneByEmail: x.f.sdm.WorkEmail, DoneAt: '2026-11-25' }] } });
      _assertEqual(done.rows[0].welcome.agenda[0].items.length, 2, 'AC9 done steps stay on the agenda');
      const noBuddy = x.model({ plans: [Object.assign({}, x.buddyPlan, { BuddyEmail: '' })] });
      _assertEqual(noBuddy.rows[0].welcome.buddy, null, 'AC10 no buddy -> null');
      const people = x.people.map(p => (p.id === '30' ? Object.assign({}, p, { StartDate: '' }) : p));
      const noStart = onbWelcomeInput({ model: { phases: [{ items: [{ label: 'A', dueOffsetDays: 0, dueISO: '', owner: { key: 'LM', name: 'Sam Sdm' } }] }], joiner: { name: '', startDate: '' }, lineManagerName: '' }, parties: {} });
      _assertEqual([noStart.first, noStart.startDate, noStart.agenda[0].dayText, noStart.buddy], ['there', '', 'Day 1 (start day)', null], 'AC11 no start date: no dates, first-name fallback');
      _assertEqual(Array.isArray(people), true, 'fixture sanity');
    },
  },
  {
    name: 'N-516 AC9-AC13 onbWelcomeEmail text / html and onbWelcomeMailto',
    fn: function () {
      const x = _onbwFx();
      const w = x.model().rows[0].welcome;
      const T = CONFIG.ONBOARDING.WELCOME_TEXT;
      const mail = onbWelcomeEmail(w, { senderName: 'Sam Sdm' });
      _assertEqual(mail.subject, 'Welcome to Momentum Global, Nina — your first week', 'subject');
      const lines = mail.text.split('\n');
      _assertEqual(lines[0], 'Hi Nina,', 'greeting');
      _assertEqual(lines[2], onbFillText(T.intro, { date: 'Wednesday 25 November 2026' }), 'intro with the long start date');
      _assertEqual(lines.includes('Day 1 (start day) · Wednesday 25 November') && lines.includes('- Step w2 — with Sam Sdm'), true, 'agenda day heading + "with" line');
      _assertEqual(lines.includes(onbFillText(T.buddy, { name: 'Tia Tp', email: x.f.tp1.WorkEmail })), true, 'AC10 buddy line');
      _assertEqual(lines.includes(onbFillText(T.lm, { name: 'Sam Sdm' })), true, 'line manager line');
      _assertEqual(lines.slice(-2), [T.signoff, 'Sam Sdm'], 'sign-off with the sender');
      _assertEqual(onbWelcomeEmail(w).text.split('\n').slice(-1)[0], T.signoff, 'no sender -> sign-off line only');
      _assertEqual(mail.html.includes('Fifth day &lt;b&gt;&amp;&lt;/b&gt; wrap') && !mail.html.includes('<b>&</b>'), true, 'AC12 html escapes a step label');
      _assertEqual(/style=|class=|#[0-9a-f]{3,6}\b/i.test(mail.html), false, 'AC12 html: no style, class or hex');
      const nb = onbWelcomeEmail(Object.assign({}, w, { buddy: null, lineManagerName: '', startDate: '', agenda: [] }));
      _assertEqual([nb.text.includes(T.buddyNone), nb.text.includes(T.agendaEmpty), nb.text.includes(T.introNoDate), nb.text.includes(T.lmTitle)], [true, true, true, false], 'AC10/AC11 no buddy, no agenda, no date, no line manager');
      _assertEqual(onbWelcomeEmail(Object.assign({}, w, { buddy: { name: 'Bo', email: '' } })).text.includes(onbFillText(T.buddyNoEmail, { name: 'Bo' })), true, 'buddy without email');
      const short = onbWelcomeMailto({ subject: 'S & T', text: 'a\nb' }, 1800);
      _assertEqual(short, { url: 'mailto:?subject=S%20%26%20T&body=a%0D%0Ab', withBody: true }, 'AC13 short: blank To, subject + CRLF body');
      const long = onbWelcomeMailto({ subject: 'S', text: 'x'.repeat(2000) }, 1800);
      _assertEqual(long, { url: 'mailto:?subject=S', withBody: false }, 'AC13 long: subject only');
      _assertEqual(onbWelcomeMailto(mail, CONFIG.ONBOARDING.WELCOME.MAILTO_MAX).url.startsWith('mailto:?subject='), true, 'AC13 the To is left blank');
    },
  },
  {
    name: 'N-516 AC6/AC7 step markup: the action button only with actionAttr + a registered actionKey + canTick; otherwise byte-identical',
    fn: function () {
      const base = { itemKey: 'wel', label: 'Welcome', help: '', owner: { key: 'LM', label: 'Line Manager', name: 'Sam Sdm', unnamed: false }, guided: true, levelTag: '',
        contentUrl: '', dueISO: '2026-11-23', dueText: '2 days before start', overdue: false, done: false, doneByName: '', doneAt: '', canTick: true, signoff: '', actionKey: 'onb.welcomeEmail' };
      const attr = it => act('onbtStepAction', 'pl30', it.itemKey);
      const tick = it => actOn('change', 'onbtTick', 'pl30', it.itemKey, ACT_CHECKED);
      const withBtn = _onbmStepHtml(base, 0, tick, attr);
      _assertEqual((withBtn.match(/class="btn-secondary onb-step-action"/g) || []).length, 1, 'AC6 one button');
      _assertEqual(withBtn.includes('>Draft welcome email</button>'), true, 'AC6 STEP_ACTIONS label');
      _assertEqual(_onbmStepHtml(Object.assign({}, base, { done: true }), 0, tick, attr).includes('onb-step-action'), true, 'AC6 shown on a done step too');
      const same = (it, note) => _assertEqual(_onbmStepHtml(it, 0, tick, attr), _onbmStepHtml(it, 0, tick), 'AC7 ' + note);
      same(Object.assign({}, base, { canTick: false }), 'not tickable -> no button');
      same(Object.assign({}, base, { actionKey: '' }), 'no action -> no button');
      same(Object.assign({}, base, { actionKey: 'newton.test' }), 'unregistered -> no button');
      _assertEqual(_onbmStepHtml(base, 0, tick).includes('onb-step-action'), false, 'AC7 no actionAttr (My Onboarding / Buddying) -> no button');
    },
  },
  {
    name: 'N-516 AC6/AC7/AC14 onbTeamModel welcome + viewerName; the dispatcher, modal, editor and load scope (source contract)',
    fn: function () {
      const x = _onbwFx();
      const v = x.model();
      _assertEqual(v.viewerName, 'Sam Sdm', 'viewer name resolved');
      _assertEqual(x.model({ email: 'nobody@mg.test', role: 'admin' }).viewerName, '', 'unmatched viewer -> ""');
      const wel = v.actions[0].steps.find(i => i.itemKey === 'wel');
      _assertEqual([wel.actionKey, wel.canTick], ['onb.welcomeEmail', true], 'AC6 the LM sees the step in My actions, tickable, with the action');
      const pv = x.model({ email: 'nobody@mg.test', role: 'admin', readOnly: true });
      _assertEqual(pv.rows[0].byOwner.reduce((a, g) => a.concat(g.items), []).every(i => !i.canTick), true, 'AC7 Admin preview: nothing tickable, so no button');
      const done = x.model({ plans: [Object.assign({}, x.buddyPlan, { Status: 'Complete' })] });
      _assertEqual(done.completed[0].welcome, null, 'AC7 a Complete plan has no welcome data');
      const ui = _onbSrc('onboarding-team-ui.js');
      _assertEqual(/_onbmStepHtml\(e\.item, counter\.n\+\+, _onbtTickAttr\(a\.planId\), _onbtActionAttr\(a\.planId\)\)/.test(ui)
        && /_onbmStepHtml\(it, counter\.n\+\+, _onbtTickAttr\(row\.planId\), _onbtActionAttr\(row\.planId\)\)/.test(ui), true, 'AC6 My actions and by-owner pass the action attribute');
      _assertEqual(/function onbtStepAction\(planId, itemKey\)/.test(ui) && /ONB_STEP_ACTION_RUN\[it\.actionKey\]/.test(ui) && /onbtStepAction,/.test(ui), true, 'dispatcher registered');
      _assertEqual(typeof ONB_STEP_ACTION_RUN['onb.welcomeEmail'], 'function', 'runtime map has the handler');
      _assertEqual(CONFIG.ONBOARDING.STEP_ACTIONS.every(a => typeof ONB_STEP_ACTION_RUN[a.key] === 'function'), true, 'every STEP_ACTIONS key has a handler');
      const my = _onbSrc('onboarding-my-ui.js'), bud = _onbSrc('onboarding-buddy-ui.js');
      _assertEqual(/_onbmStepHtml\([^)]*Action/.test(my.replace(/function _onbmStepHtml\(it, n, tickAttr, actionAttr\)/, '')) || /_onbmStepHtml\([^)]*Action/.test(bud), false, 'AC7 My Onboarding / Buddying never pass an action');
      const wu = _onbSrc('onboarding-welcome-ui.js');
      _assertEqual(/\.onbw-preview'\)\.textContent =/.test(wu) && !/innerHTML/.test(wu), true, 'AC12 preview through textContent, no innerHTML');
      _assertEqual(/_openModal\(\{/.test(wu) && /onbWelcomeMailto\(mail, CONFIG\.ONBOARDING\.WELCOME\.MAILTO_MAX\)/.test(wu), true, 'AC8/AC13 modal engine + mailto limit');
      _assertEqual(/tickOnboarding|createItem|updateItem|setChecklistItemDone|graph/i.test(wu), false, 'AC14 never writes or ticks');
      const adm = _onbSrc('checklist-admin.js');
      _assertEqual(/\$\{err\('contentUrl'\)\}\s*<\/div>\$\{_ckaStepActionFieldHtml\(it\)\}/.test(adm) && /id="ck-f-action"/.test(adm) && /_ckaStepActionNote\(it\)/.test(adm), true, 'AC2/AC4 editor action field + Step cell note');
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (Node runner only)');
      const mm = ALL_HTML['my-momentum.html'];
      const at = f => mm.indexOf('js/' + f + '"');
      _assertEqual(at('onboarding-welcome.js') > at('onboarding-team.js') && at('onboarding-welcome.js') < at('onboarding-reminders.js'), true, 'AC15 onboarding-welcome.js straight after onboarding-team.js');
      _assertEqual(at('onboarding-welcome-ui.js') > at('onboarding-team-ui.js') && at('onboarding-team-ui.js') > -1, true, 'AC15 onboarding-welcome-ui.js after onboarding-team-ui.js');
      ['reporting.html', 'people.html', 'mobile.html', 'index.html'].forEach(h => _assertEqual((ALL_HTML[h] || '').includes('onboarding-welcome'), false, 'AC15 not on ' + h));
      _assertEqual(CONFIG.MCP.scripts.some(s => /onboarding-welcome/.test(s)), false, 'AC15 not in the MCP bundle');
      if (typeof ALL_CSS === 'undefined') _skip('needs ALL_CSS (Node runner only)');
      const css = ALL_CSS['my-momentum.css'];
      _assertEqual(/\.onb-step-meta \.onb-step-action \{/.test(css) && /\.onbw-preview \{[^}]*white-space: pre-wrap/.test(css), true, 'CSS rules present, tokens only');
    },
  },
);
