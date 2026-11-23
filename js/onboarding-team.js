// js/onboarding-team.js — pure rules for My Team > Onboarding (N-502 / ONB-7, epic N-482)
//
// The line manager's and CSD's view of their joiners (ONB-D72): progress, overdue and next steps by owner, "My actions", and the two
// sign-offs (ONB-D63..D69). Pure: no DOM, no Graph, no network. The reads and writes are getOnboardingTeamView / signOffOnboarding /
// countersignOnboarding in api-onboarding.js; the markup is onboarding-team-ui.js. Reuses onbPlanModel / onbRelations / onbPlanParties
// (onboarding-logic.js). my-momentum.html only, straight after onboarding-logic.js; never mobile.html, Newton for Claude or the Command Bar.
//
// Sign-offs: the line manager's role-play and Day-30 sign-offs are OnboardingSignoffs rows (append-only; the latest row per plan and kind
// wins, a Withdrawn row = unsigned). The CSD countersign is two columns on the plan, written together with Status = Complete.

function _onbtEmail(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

// Every plan this viewer looks after: Active or Complete plans where they are the joiner's line manager, their CSD, or an Admin.
// -> [{ plan, relations }] in the order given (the model sorts).
// N-520 (ONB-D114): with assignments, a plan where the viewer only holds a reassigned step is listed too, as { plan, relations, assigneeOnly: true }.
function onbTeamPlans({ plans = [], people = [], email = '', role = '', peopleOpsActive = false, assignments = [], directory = null } = {}) {
  const out = [];
  (plans || []).forEach(plan => {
    if (!plan || !CONFIG.ONBOARDING.PLAN_VISIBLE.includes(plan.Status)) return;
    const rel = onbRelations({ plan, people, email, role, peopleOpsActive, assignments, directory });
    const team = rel.has('lm') || rel.has('csd') || rel.has('admin');
    if (!team && !rel.has('assignee')) return;
    out.push(team ? { plan, relations: Array.from(rel) } : { plan, relations: Array.from(rel), assigneeOnly: true });
  });
  return out;
}

// One plan's sign-offs from the OnboardingSignoffs rows and the plan's own CSD columns.
// -> { roleplay, day30lm, csd }, each { signed, byEmail, at }. The latest row per kind wins by numeric item id; Withdrawn = unsigned.
function onbSignoffState({ signoffs = [], plan = null } = {}) {
  const S = CONFIG.ONBOARDING.SIGNOFF;
  const pid = plan ? String(plan.id) : '';
  const latest = {};
  (signoffs || []).forEach(r => {
    if (!r || !pid || String(r.PlanID) !== pid || !S.KINDS.includes(r.Kind)) return;
    const n = Number(r.id);
    const id = Number.isFinite(n) ? n : -1;
    if (!latest[r.Kind] || id > latest[r.Kind].id) latest[r.Kind] = { id, row: r };
  });
  const of = kind => {
    const hit = latest[kind];
    return hit && hit.row.Outcome === S.SIGNED
      ? { signed: true, byEmail: _onbtEmail(hit.row.SignedByEmail), at: spDateIn(hit.row.SignedAt) || '' }
      : { signed: false, byEmail: '', at: '' };
  };
  const csdBy = plan ? _onbtEmail(plan.CSDSignedByEmail) : '';
  return {
    roleplay: of(S.KINDS[0]),
    day30lm:  of(S.KINDS[1]),
    csd:      csdBy ? { signed: true, byEmail: csdBy, at: spDateIn(plan.CSDSignedAt) || '' } : { signed: false, byEmail: '', at: '' },
  };
}

// ONB-D65. The Day-30 gate over one onbPlanModel: every Required phase step ticked (Library, and the two sign-off steps, left out) and
// the role-play signed off. -> { ready, outstanding, roleplayMissing }
function onbDay30Gate({ model = null, state = null } = {}) {
  const items = ((model && model.phases) || []).reduce((acc, p) => acc.concat(p.items), []);
  const outstanding = items.filter(i => i.required && !i.done && !i.signoff).length;
  const roleplayMissing = !(state && state.roleplay && state.roleplay.signed);
  return { ready: outstanding === 0 && !roleplayMissing, outstanding, roleplayMissing };
}

// ONB-D65 / D68 / D69. What the viewer may do with each sign-off now: { roleplay, day30lm, csd }, each { canSign, canWithdraw, reason }.
// reason = why the button is off ('' when it is on or there is nothing to say). Nothing at all on a closed plan or in Preview (readOnly).
//   role-play, Day-30 LM: the joiner's line manager only. Withdraw until the CSD countersigns (a Complete plan is closed).
//   Day-30 LM sign: needs the gate. Role-play withdraw: not while the Day-30 LM sign-off stands.
//   countersign: the joiner's CSD, or an Admin when the plan has no resolvable CSD; needs the Day-30 LM sign-off.
function onbSignoffRights({ relations = [], planStatus = '', state = null, gate = null, csdPresent = true, readOnly = false } = {}) {
  const R = CONFIG.ONBOARDING.TEAM_TEXT.reasons;
  const rel = relations instanceof Set ? relations : new Set(relations || []);
  const st = state || { roleplay: { signed: false }, day30lm: { signed: false }, csd: { signed: false } };
  const g = gate || { ready: false, outstanding: 0, roleplayMissing: true };
  const off = reason => ({ canSign: false, canWithdraw: false, reason });
  const blocked = readOnly ? R.preview : (planStatus !== CONFIG.ONBOARDING.PLAN_ACTIVE ? R.closed : '');
  if (blocked) return { roleplay: off(blocked), day30lm: off(blocked), csd: off(blocked) };
  const isLm = rel.has('lm');
  const isCsd = rel.has('csd') || (rel.has('admin') && csdPresent !== true);

  const roleplay = !isLm ? off(R.onlyLm)
    : st.roleplay.signed ? { canSign: false, canWithdraw: !st.day30lm.signed, reason: st.day30lm.signed ? R.keepRoleplay : '' }
    : { canSign: true, canWithdraw: false, reason: '' };

  let day30lm;
  if (!isLm) day30lm = off(R.onlyLm);
  else if (st.day30lm.signed) day30lm = { canSign: false, canWithdraw: true, reason: '' };
  else if (g.ready) day30lm = { canSign: true, canWithdraw: false, reason: '' };
  else {
    const why = [];
    if (g.outstanding) why.push(g.outstanding === 1 ? R.stepsOpen1 : onbFillText(R.stepsOpen, { n: g.outstanding }));
    if (g.roleplayMissing) why.push(R.needRoleplay);
    day30lm = off(why.join(' '));
  }

  const csd = !isCsd ? off(R.onlyCsd)
    : !st.day30lm.signed ? off(R.needLm)
    : { canSign: true, canWithdraw: false, reason: '' };
  return { roleplay, day30lm, csd };
}

// The PDP joiner goal-setting status as a chip: { text, tone } (tone 'success' | 'warn' | ''). pdp = loadJoinerGoalSetting's entry
// { state, dueISO, heldISO }; anything else is unavailable. Informational only (ONB-D66).
function onbPdpLabel(pdp) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT.pdp;
  const p = pdp || {};
  const date = iso => formatLongDay(iso) || String(iso || '');
  switch (p.state) {
    case 'none':    return { text: T.none, tone: '' };
    case 'planned': return { text: p.dueISO ? onbFillText(T.planned, { date: date(p.dueISO) }) : T.none, tone: 'warn' };
    case 'held':    return { text: onbFillText(T.held, { date: date(p.heldISO) }), tone: 'success' };
    case 'signed':  return { text: onbFillText(T.signed, { date: date(p.heldISO) }), tone: 'success' };
    default:        return { text: T.unavailable, tone: '' };
  }
}

// Whole days from StartDate to today, start day = 1 (the N-508 wording). 0 before the start day or without a date.
function _onbtDayNumber(startDate, todayISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(todayISO || '')) || todayISO < startDate) return 0;
  const ms = iso => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((ms(todayISO) - ms(startDate)) / 86400000) + 1;
}

// One joiner as a card. model = onbPlanModel for the viewer; relations / peopleOpsActive as onbTeamPlans / the gate; nameOf(email) -> display name.
// byOwner: the open steps grouped by owner (OWNERS order), overdue first then by due date. A step keeps its canTick (a sign-off step never has one).
// N-520 (ONB-D114): reassigned steps leave their owner's group for one trailing ASSIGN.TEXT.group group; viewerEmail lets onbTeamActions
// give the viewer the steps reassigned to them.
function onbTeamRow({ model = null, plan = null, relations = [], state = null, rights = null, gate = null, pdp = null, todayISO = '', peopleOpsActive = false, nameOf = null, viewerEmail = '' } = {}) {
  const O = CONFIG.ONBOARDING;
  const m = model || { phases: [], summary: { total: 0, done: 0, overdue: 0, nextDue: null }, joiner: { id: '', name: '', startDate: '' } };
  const items = (m.phases || []).reduce((acc, p) => acc.concat(p.items), []);
  const open = items.filter(i => !i.done);
  const rank = (a, b) => (a.overdue === b.overdue ? 0 : (a.overdue ? -1 : 1)) || String(a.dueISO || '9999').localeCompare(String(b.dueISO || '9999'));
  const sorted = list => list.map((i, idx) => ({ i, idx })).sort((a, b) => rank(a.i, b.i) || a.idx - b.idx).map(x => x.i);
  const byOwner = O.OWNERS.map(o => {
    const mine = sorted(open.filter(i => i.owner.key === o.key && !i.reassigned));
    return mine.length ? { key: o.key, label: mine[0].owner.label, name: mine[0].owner.name, items: mine } : null;
  }).filter(Boolean);
  const moved = sorted(open.filter(i => i.reassigned));
  if (moved.length) byOwner.push({ key: 'Reassigned', label: O.ASSIGN.TEXT.group, name: '', items: moved });
  const s = m.summary;
  const name = nameOf || (e => e);
  const who = st => (st.signed ? name(st.byEmail) : '');
  const sg = state || { roleplay: { signed: false }, day30lm: { signed: false }, csd: { signed: false } };
  const r = rights || { roleplay: {}, day30lm: {}, csd: {} };
  const part = (k, label) => Object.assign({ label, signed: !!sg[k].signed, byName: who(sg[k]), at: sg[k].at || '' }, r[k]);
  return {
    planId: m.planId,
    personId: m.joiner.id,
    name: m.joiner.name,
    startDate: m.joiner.startDate,
    dayNumber: _onbtDayNumber(m.joiner.startDate, todayISO),
    status: m.status,
    complete: m.status !== O.PLAN_ACTIVE,
    done: s.done,
    total: s.total,
    pct: s.total ? Math.round(s.done / s.total * 100) : 0,
    overdue: s.overdue,
    next: s.nextDue ? { label: s.nextDue.label, dueISO: s.nextDue.due } : null,
    lineManagerName: m.lineManagerName,
    buddyName: m.buddyName,
    relations: Array.from(relations instanceof Set ? relations : new Set(relations || [])),
    peopleOpsActive: peopleOpsActive === true,
    byOwner,
    openCount: open.length,
    gate: gate || { ready: false, outstanding: 0, roleplayMissing: true },
    signoff: {
      roleplay: part('roleplay', O.TEAM_TEXT.roleplay),
      day30lm:  part('day30lm', O.TEAM_TEXT.day30lm),
      csd:      part('csd', O.TEAM_TEXT.csd),
    },
    pdp: onbPdpLabel(pdp),
    viewerEmail: _onbtEmail(viewerEmail),
  };
}

// "My actions" across rows for one viewer: the open steps they own (LM-owned for a line manager; CSD-owned, and People Ops steps while the
// CSD stands in for People Ops, for a CSD), and the sign-offs they may take now. A sign-off sits IN the list at the due position of its linked
// step (M05 role-play, Day 30), so the joiner's actions read in one due-date order; the countersign comes last. Only rows on an Active plan.
// Grouped per joiner, in row order; within a joiner, overdue first then by due date.
// -> [{ planId, name, entries: [{ type: 'step', item } | { type: 'signoff', kind: 'roleplay'|'day30'|'countersign', label }], steps, signoffs }]
//    (steps / signoffs are the same entries split by type, for callers that only want one.)
function onbTeamActions(rows) {
  const T = CONFIG.ONBOARDING.TEAM_TEXT;
  const part = { roleplay: 'roleplay', day30: 'day30lm' };
  const out = [];
  (rows || []).forEach(row => {
    if (row.complete) return;
    const rel = new Set(row.relations || []);
    const mine = o => (o.key === 'LM' && rel.has('lm'))
      || (o.key === 'CSD' && rel.has('csd'))
      || (o.key === 'PeopleOps' && rel.has('csd') && row.peopleOpsActive !== true);
    const assignedToMe = i => !!i.reassigned && !!row.viewerEmail && i.assign && i.assign.assigneeEmail === row.viewerEmail;   // N-520
    const label = { roleplay: T.roleplay, day30: T.day30lm, countersign: T.csd };
    const can = k => !!(row.signoff[k === 'countersign' ? 'csd' : part[k]] || {}).canSign;
    const open = [];
    row.byOwner.forEach(g => g.items.forEach(i => open.push(i)));
    const seen = new Set();
    const entries = [];
    open.filter(i => i.signoff ? can(i.signoff) : (assignedToMe(i) || row.byOwner.some(g => mine(g) && g.items.includes(i))))
      .sort((a, b) => (a.overdue === b.overdue ? 0 : (a.overdue ? -1 : 1)) || String(a.dueISO || '9999').localeCompare(String(b.dueISO || '9999')))
      .forEach(i => {
        if (i.signoff) { seen.add(i.signoff); entries.push({ type: 'signoff', kind: i.signoff, label: label[i.signoff] }); }
        else entries.push({ type: 'step', item: i });
      });
    ['roleplay', 'day30'].forEach(k => { if (can(k) && !seen.has(k)) entries.push({ type: 'signoff', kind: k, label: label[k] }); });
    if (can('countersign')) entries.push({ type: 'signoff', kind: 'countersign', label: label.countersign });
    if (entries.length) out.push({
      planId: row.planId, name: row.name, entries,
      steps: entries.filter(e => e.type === 'step').map(e => e.item),
      signoffs: entries.filter(e => e.type === 'signoff').map(e => ({ kind: e.kind, label: e.label })),
    });
  });
  return out;
}

// The whole page model. progressByPlan = { planId: ChecklistProgress rows }; signoffs = OnboardingSignoffs rows; pdpByPerson = { personId: status }.
// readOnly (Admin preview) strips every right and every tick. Rows: Active first (most overdue, then latest start), Complete last.
// -> { rows, completed, viewerName, actions, totals: { active, overdue, awaiting } }. Each Active row also carries welcome (onbWelcomeInput, N-516).
// N-520 (ONB-D114): assignments (optional). A plan the viewer only holds reassigned steps on adds those steps to actions and nothing else
// (no row, tile or count); assignOnly = true when that is all the viewer has.
function onbTeamModel({ plans = [], people = [], templates = [], progressByPlan = {}, signoffs = [], pdpByPerson = {}, email = '', role = '', peopleOpsActive = false, todayISO = '', readOnly = false, assignments = [], directory = null } = {}) {
  const emailIndex = pdpEmailIndex(directory || people);   // N-522: names a directory-only assignee (and the viewer, when they have no People row)
  const nameOf = e => {
    const hit = (emailIndex.get ? emailIndex.get(_onbtEmail(e)) : null) || [];
    return hit.length === 1 ? String(hit[0].EmployeeName || e) : String(e || '');
  };
  const all = onbTeamPlans({ plans, people, email, role, peopleOpsActive, assignments, directory }).map(({ plan, relations, assigneeOnly }) => {
    let model = onbPlanModel({ plan, people, templates, progressRows: (progressByPlan || {})[String(plan.id)] || [], email, role, peopleOpsActive, todayISO, assignments, directory });
    if (readOnly) model = Object.assign({}, model, { phases: model.phases.map(p => Object.assign({}, p, { items: p.items.map(i => Object.assign({}, i, { canTick: false, canReassign: false })) })) });
    const state = onbSignoffState({ signoffs, plan });
    const gate = onbDay30Gate({ model, state });
    const parties = onbPlanParties(plan, people);
    const csdPresent = !!parties.csd;
    const rights = onbSignoffRights({ relations, planStatus: plan.Status, state, gate, csdPresent, readOnly });
    const row = onbTeamRow({ model, plan, relations, state, rights, gate, pdp: (pdpByPerson || {})[String(plan.PersonID)], todayISO, peopleOpsActive, nameOf, viewerEmail: email });
    row.welcome = row.complete ? null : onbWelcomeInput({ model, parties });   // N-516: the "Draft welcome email" step action's data
    if (assigneeOnly) row.assigneeOnly = true;   // N-520
    return row;
  });
  const assignRows = all.filter(r => r.assigneeOnly && !r.complete);   // N-520 (ONB-D114): actions only
  const teamAll = all.filter(r => !r.assigneeOnly);
  const active = teamAll.filter(r => !r.complete).sort((a, b) => (b.overdue - a.overdue) || String(b.startDate || '').localeCompare(String(a.startDate || '')) || a.name.localeCompare(b.name));
  const completed = teamAll.filter(r => r.complete).sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')) || a.name.localeCompare(b.name));
  const viewer = nameOf(email);
  return {
    rows: active,
    completed,
    viewerName: viewer && viewer !== String(email || '') ? viewer : '',   // N-516: the welcome email's sign-off; '' when unmatched
    actions: readOnly ? [] : onbTeamActions(active.concat(assignRows)),
    assignOnly: !active.length && !completed.length && assignRows.length > 0,   // N-520: the page shows My actions alone
    totals: {
      active: active.length,
      overdue: active.reduce((n, r) => n + r.overdue, 0),
      awaiting: active.filter(r => r.signoff.roleplay.canSign || r.signoff.day30lm.canSign || r.signoff.csd.canSign || (r.signoff.day30lm.signed && !r.signoff.csd.signed)).length,
    },
  };
}
