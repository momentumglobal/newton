// js/onboarding-welcome.js — the welcome email drafted from the pre-start onboarding step (N-516, epic N-482)
//
// ONB-D91–D94: a step whose ActionKey is 'onb.welcomeEmail' (CONFIG.ONBOARDING.STEP_ACTIONS) shows a "Draft welcome email" button in
// My Team > Onboarding. This file builds the email as data: the joiner's Week 1 agenda (every non-Library step due on offsets
// WELCOME.AGENDA_FROM..AGENDA_TO, grouped by day), the buddy and the line manager. The modal, clipboard and mailto hand-off are in
// onboarding-welcome-ui.js. Pure: no DOM, no Graph, no network. Every word is CONFIG.ONBOARDING.WELCOME_TEXT.
// N-517 (ONB-D95–D101): the html is the branded email, built with the email-brand kit (email-brand.js, which loads first); no colour or
// style literal lives here. my-momentum.html only, straight after onboarding-team.js; never mobile.html, Newton for Claude or the Command Bar.

// The owners whose name is worth naming in the agenda ("— with Jane Smith"): not the joiner themself, not Operations / IT.
const _ONBW_WITH_OWNERS = ['LM', 'CSD', 'PeopleOps', 'Buddy'];

// 'Monday 5 January' (withYear: 'Monday 5 January 2027') from YYYY-MM-DD, or '' when it isn't one. Built from the date parts (local),
// never new Date('YYYY-MM-DD') (UTC midnight, the BST trap). Weekday and date are formatted apart and joined with a space, because ICU
// builds differ on a comma after the weekday.
function _onbwDate(iso, withYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const opts = withYear ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' };
  return d.toLocaleDateString('en-GB', { weekday: 'long' }) + ' ' + d.toLocaleDateString('en-GB', opts);
}

// 'Day 1 (start day) · Monday 5 January' — the N-508 day text, then the weekday date. The date part is left off without a due date.
function _onbwDayLabel(offset, dueISO) {
  return [onbDueText(offset), _onbwDate(dueISO, false)].filter(Boolean).join(' \u00b7 ');
}

// What the email needs, from one onbPlanModel (the viewer's) and onbPlanParties for the same plan.
// -> { first, name, startDate, lineManagerName, buddy: { name, email } | null, agenda: [{ dayISO, dayText, items: [{ label, withName }] }] }
// The agenda takes every phase step (Library is never in model.phases) whose due offset is inside the Week 1 window, done or not, grouped by
// due date in date order, model order within a day. A step with no due date can't be placed in a day and is left out.
function onbWelcomeInput({ model = null, parties = null } = {}) {
  const W = CONFIG.ONBOARDING.WELCOME;
  const m = model || { phases: [], joiner: { name: '', startDate: '' }, lineManagerName: '' };
  const p = parties || {};
  const name = String((m.joiner && m.joiner.name) || '').trim();
  const first = name.split(/\s+/)[0] || 'there';
  const buddyRow = p.buddy || null;
  const buddy = buddyRow
    ? { name: String(buddyRow.EmployeeName || '').trim(), email: String(buddyRow.WorkEmail || '').trim().toLowerCase() }
    : null;
  const items = (m.phases || []).reduce((acc, ph) => acc.concat(ph.items || []), [])
    .filter(i => Number.isInteger(i.dueOffsetDays) && i.dueOffsetDays >= W.AGENDA_FROM && i.dueOffsetDays <= W.AGENDA_TO);
  const days = [];
  items.forEach((i, idx) => {
    const key = i.dueISO || ('offset:' + i.dueOffsetDays);
    let d = days.find(x => x.key === key);
    if (!d) { d = { key, offset: i.dueOffsetDays, dayISO: i.dueISO || '', idx, items: [] }; days.push(d); }
    const owner = i.owner || {};
    d.items.push({ label: String(i.label || ''), withName: _ONBW_WITH_OWNERS.includes(owner.key) && owner.name ? String(owner.name) : '' });
  });
  days.sort((a, b) => (a.offset - b.offset) || (a.idx - b.idx));
  return {
    first,
    name,
    startDate: String((m.joiner && m.joiner.startDate) || ''),
    lineManagerName: String(m.lineManagerName || '').trim(),
    buddy: buddy && buddy.name ? buddy : null,
    agenda: days.map(d => ({ dayISO: d.dayISO, dayText: _onbwDayLabel(d.offset, d.dayISO), items: d.items })),
  };
}

// The email from an onbWelcomeInput result. -> { subject, text, html }. Same content both ways; text uses '\n' line breaks. html is the
// branded email (N-517): logo header, eyebrow + headline, then one light card per Week 1 day (ONB-D98), footer — every value through escHtml.
function onbWelcomeEmail(input, { senderName = '' } = {}) {
  const T = CONFIG.ONBOARDING.WELCOME_TEXT;
  const i = input || { first: 'there', startDate: '', lineManagerName: '', buddy: null, agenda: [] };
  const fill = (t, v) => onbFillText(t, v);
  const date = _onbwDate(i.startDate, true);
  const intro = date ? fill(T.intro, { date }) : T.introNoDate;
  const lineOf = it => it.label + (it.withName ? ' — ' + fill(T.agendaWith, { name: it.withName }) : '');
  const buddy = i.buddy
    ? (i.buddy.email ? fill(T.buddy, { name: i.buddy.name, email: i.buddy.email }) : fill(T.buddyNoEmail, { name: i.buddy.name }))
    : T.buddyNone;
  const lm = i.lineManagerName ? fill(T.lm, { name: i.lineManagerName }) : '';
  const sender = String(senderName || '').trim();
  const agenda = i.agenda || [];

  const text = [fill(T.greeting, { first: i.first }), '', intro, '', T.agendaTitle];
  if (agenda.length) agenda.forEach((d, n) => { if (n) text.push(''); text.push(d.dayText); d.items.forEach(it => text.push('- ' + lineOf(it))); });
  else text.push(T.agendaEmpty);
  text.push('', T.buddyTitle, buddy);
  if (lm) text.push('', T.lmTitle, lm);
  text.push('', T.close, '', T.signoff);
  if (sender) text.push(sender);

  const e = escHtml, k = emailBrandText;
  const sections = [
    k(e(fill(T.greeting, { first: i.first })), 'p'),
    k(e(intro), 'p'),
    k(e(T.agendaTitle), 'title'),
  ].concat(agenda.length
    ? agenda.map(d => emailBrandCard(k(e(d.dayText), 'cardTitle') + d.items.map(it => k('&#9656;&nbsp;&nbsp;' + e(lineOf(it)), 'item')).join('')))
    : [k(e(T.agendaEmpty), 'p')]
  ).concat([
    k(e(T.buddyTitle), 'title') + k(e(buddy), 'p'),
    lm ? k(e(T.lmTitle), 'title') + k(e(lm), 'p') : '',
    k(e(T.close), 'p'),
    k(e(T.signoff) + (sender ? '<br>' + e(sender) : ''), 'p'),
  ]);
  const html = emailBrandHtml({ eyebrow: T.eyebrow, headline: fill(T.headline, { first: i.first }), footer: T.footer, sections });

  return { subject: fill(T.subject, { first: i.first }), text: text.join('\n'), html };
}

// The "Open in Outlook" link (N-517, ONB-D95): a new mail with a blank To and the subject only. The branded body can't travel in a mailto:
// URL, so the caller puts it on the clipboard and the sender pastes it. -> 'mailto:?subject=…'
function onbWelcomeMailto({ subject = '' } = {}) {
  return 'mailto:?subject=' + encodeURIComponent(String(subject || ''));
}
