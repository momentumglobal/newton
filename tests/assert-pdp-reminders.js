// tests/assert-pdp-reminders.js — PDP reminders and the completion tile (N-441 / PDP-9).
// Loads AFTER tests/assert-pdp-assess.js. The pure rules (pdp-reminders.js, pdpCompletion,
// pdpNormaliseRemindersFrom) are exercised directly; the API orchestration, the Config Panel control, the
// dashboard tile and the page wiring are checked from source because the runner is synchronous.
// Spec: specs/N-441.md.

const _RMT_TODAY = '2027-03-20';
const _RMT_ME = 'tia@mg.test', _RMT_LM = 'sam@mg.test', _RMT_CSD = 'cara@mg.test', _RMT_ADMIN = 'chris@mg.test';
const _RMT_PREP_DEF = JSON.stringify({ schema: 1, sections: [{ key: 'a', title: 'Prep', blocks: [{ key: 'q', type: 'prepQuestion', by: 'employee', label: 'Q' }] }] });
const _RMT_NOPREP_DEF = JSON.stringify({ schema: 1, sections: [{ key: 'a', title: 'Meeting', blocks: [{ key: 'n', type: 'prompt', label: 'Notes' }] }] });
const _RMT_TPLS = [
  { id: '11', MeetingType: 'Quarterly', VersionNo: 1, Status: 'Published', Definition: _RMT_PREP_DEF },
  { id: '12', MeetingType: 'Monthly', VersionNo: 1, Status: 'Published', Definition: _RMT_NOPREP_DEF },
];
function _rmtM(extra) {
  return Object.assign({
    id: '1', PersonID: 4, PersonEmail: _RMT_ME, LineManagerEmail: _RMT_LM, CSDEmail: _RMT_CSD, CycleYear: 2027,
    MeetingType: 'Quarterly', Period: '2027-03', DueDate: '2027-03-26', Status: 'Planned', TemplateID: '11', PrepEmployee: '',
  }, extra || {});
}
function _rmtPlan(o) {
  return pdpReminderPlan(Object.assign({ today: _RMT_TODAY, email: _RMT_ME, mode: 'On', from: '2027-01-01', meetings: [], actions: [], templates: _RMT_TPLS }, o || {}));
}
const _rmtTypes = p => p.send.map(s => s.type);
function _rmtFn(src, name, next) {
  const a = src.indexOf('async function ' + name);
  const b = next ? src.indexOf(next, a + 1) : src.length;
  return src.slice(a, b);
}

ASSERTIONS.push(
  {
    name: 'N-441 AC1 config: reminder constants, settings column, no new role',
    fn: function () {
      const R = CONFIG.PDP.REMINDERS;
      _assertEqual([R.DEFAULT_FROM, R.PREP_REMIND_DAYS, R.ACTION_REMIND_DAYS], ['2027-01-01', 7, 3], 'AC1 thresholds and default date');
      _assertEqual(R.TYPES, { PREP: 'pdpPrep', OVERDUE: 'pdpOverdue', ACTION: 'pdpAction' }, 'AC1 three types');
      Object.values(R.TYPES).forEach(t => _assertEqual(typeof R.TEXT[t].one === 'string' && R.TEXT[t].many.includes('{n}'), true, 'AC1 text for ' + t));
      _assertEqual(CONFIG.PDP.SETTINGS.REMINDERS_FROM, 'PDPRemindersFrom', 'AC1 AppSettings column');
      _assertEqual(CONFIG.ROLE_CAPABILITIES.pdpAdmin, ['admin', 'people_ops'], 'AC1 the tile reuses pdpAdmin');
    },
  },
  {
    name: 'N-441 AC2 pdpNormaliseRemindersFrom',
    fn: function () {
      _assertEqual(pdpNormaliseRemindersFrom('2027-02-15'), '2027-02-15', 'AC2 valid kept');
      _assertEqual(pdpNormaliseRemindersFrom(' 2027-02-15 '), '2027-02-15', 'AC2 trimmed');
      _assertEqual(pdpNormaliseRemindersFrom('2028-02-29'), '2028-02-29', 'AC2 leap day');
      ['', null, undefined, '15/02/2027', '2027-2-5', '2027-02-30', '2027-13-01', '2027-00-10', '2027-02-29', 'soon'].forEach(v =>
        _assertEqual(pdpNormaliseRemindersFrom(v), '2027-01-01', 'AC2 default for ' + JSON.stringify(v)));
    },
  },
  {
    name: 'N-441 AC3 Off, Pilot and unknown modes send nothing, whatever is overdue',
    fn: function () {
      const busy = { meetings: [_rmtM({ DueDate: '2027-03-10' }), _rmtM({ id: '2', DueDate: '2027-03-26' })], actions: [{ OwnerEmail: _RMT_ME, DueDate: '2027-03-21', IsDone: false }] };
      ['Off', 'Pilot', 'off', 'pilot', '', null, 'nonsense'].forEach(mode =>
        _assertEqual(_rmtPlan(Object.assign({ mode }, busy)), { send: [], keep: [] }, 'AC3 ' + JSON.stringify(mode)));
      _assertEqual(_rmtTypes(_rmtPlan(busy)).sort(), ['pdpAction', 'pdpOverdue', 'pdpPrep'], 'AC3 control: the same data in On mode sends all three');
      _assertEqual(_rmtPlan({ email: '', meetings: busy.meetings }), { send: [], keep: [] }, 'AC3 no email, nothing');
    },
  },
  {
    name: 'N-441 AC4 prep due: window open, not submitted, template has employee prep, due within 7 days',
    fn: function () {
      const t = ms => _rmtTypes(_rmtPlan({ meetings: ms }));
      _assertEqual(t([_rmtM({ DueDate: '2027-03-26' })]), ['pdpPrep'], 'AC4 due in 6 days');
      _assertEqual(t([_rmtM({ DueDate: '2027-03-27' })]), ['pdpPrep'], 'AC4 due in 7 days (inclusive)');
      _assertEqual(t([_rmtM({ DueDate: '2027-03-28' })]), [], 'AC4 due in 8 days');
      _assertEqual(t([_rmtM({ PrepEmployee: JSON.stringify({ schema: 1, answers: {}, submittedAt: '2027-03-19T09:00:00Z' }) })]), [], 'AC4 already submitted');
      _assertEqual(t([_rmtM({ PrepEmployee: JSON.stringify({ schema: 1, answers: {}, savedAt: '2027-03-19T09:00:00Z' }) })]), ['pdpPrep'], 'AC4 a saved draft is not submitted');
      _assertEqual(t([_rmtM({ MeetingType: 'Monthly', TemplateID: '12', Period: '2027-03' })]), [], 'AC4 a template with no employee prep (Monthly) never reminds');
      _assertEqual(t([_rmtM({ TemplateID: '', TemplateVersion: '' })]), [], 'AC4 no readable template, no reminder');
      _assertEqual(t([_rmtM({ Period: '2027-04', DueDate: '2027-04-30' })]), [], 'AC4 window not open yet');
      _assertEqual(t([_rmtM({ PersonEmail: 'other@mg.test' })]), [], 'AC4 only the employee is told to prepare');
      _assertEqual(t([_rmtM({ DueDate: '2027-03-10' })]), ['pdpOverdue'], 'AC4 overdue is the overdue digest, not a prep reminder');
      const p = _rmtPlan({ meetings: [_rmtM({ id: '1' }), _rmtM({ id: '2', MeetingType: 'Quarterly', DueDate: '2027-03-27' })] });
      _assertEqual([p.send[0].n, p.send[0].body, p.send[0].link], [2, '2 PDP preps are due soon.', 'my-momentum.html#myDevelopment'], 'AC4 two preps are one digest');
    },
  },
  {
    name: 'N-441 AC5 overdue: employee, line manager and CSD each get one digest; nobody else',
    fn: function () {
      const late = [_rmtM({ id: '1', DueDate: '2027-02-28' }), _rmtM({ id: '2', DueDate: '2027-03-19', MeetingType: 'Monthly', TemplateID: '12' })];
      const pe = _rmtPlan({ email: _RMT_ME, meetings: late }), pl = _rmtPlan({ email: _RMT_LM, meetings: late }), pc = _rmtPlan({ email: _RMT_CSD, meetings: late });
      [pe, pl, pc].forEach((p, i) => _assertEqual([_rmtTypes(p), p.send[0].n, p.send[0].body], [['pdpOverdue'], 2, '2 PDP meetings are overdue.'], 'AC5 recipient ' + i));
      _assertEqual([pe.send[0].link, pl.send[0].link, pc.send[0].link], ['my-momentum.html#myDevelopment', 'my-momentum.html#myTeam', 'my-momentum.html#myTeam'], 'AC5 links: employee vs reviewer');
      _assertEqual(_rmtPlan({ email: _RMT_ADMIN, meetings: late }), { send: [], keep: [] }, 'AC5 Admin / People Ops get nothing for records that are not theirs');
      _assertEqual(_rmtPlan({ email: _RMT_ME.toUpperCase(), meetings: late }).send.length, 1, 'AC5 email match is case-insensitive');
      ['Held', 'SignedOff', 'Skipped'].forEach(s =>
        _assertEqual(_rmtPlan({ meetings: [_rmtM({ DueDate: '2027-02-28', Status: s })] }), { send: [], keep: [] }, 'AC5 ' + s + ' never reminds'));
      _assertEqual(_rmtTypes(_rmtPlan({ meetings: [_rmtM({ DueDate: '2027-03-20' })] })), ['pdpPrep'], 'AC5 due today is due, not overdue');
      _assertEqual(_rmtPlan({ email: _RMT_LM, meetings: [_rmtM({ DueDate: '2027-02-28' })] }).send[0].body, '1 PDP meeting is overdue.', 'AC5 singular wording');
    },
  },
  {
    name: 'N-441 AC6 actions: owner only, not done, due within 3 days (overdue included)',
    fn: function () {
      const a = (extra) => Object.assign({ id: '9', OwnerEmail: _RMT_ME, DueDate: '2027-03-23', IsDone: false }, extra || {});
      const t = (list, email) => _rmtTypes(_rmtPlan({ actions: list, email: email || _RMT_ME }));
      _assertEqual(t([a()]), ['pdpAction'], 'AC6 due in 3 days');
      _assertEqual(t([a({ DueDate: '2027-03-24' })]), [], 'AC6 due in 4 days');
      _assertEqual(t([a({ DueDate: '2027-03-01' })]), ['pdpAction'], 'AC6 overdue action');
      _assertEqual(t([a({ IsDone: true })]), [], 'AC6 done');
      _assertEqual(t([a({ IsDone: 'Yes' })]), [], 'AC6 done (Yes)');
      _assertEqual(t([a({ OwnerEmail: _RMT_LM })]), [], 'AC6 owned by someone else');
      _assertEqual(_rmtPlan({ actions: [a(), a({ id: '10' })] }).send[0].body, '2 PDP actions are due soon.', 'AC6 digest wording');
    },
  },
  {
    name: 'N-441 AC7-AC8 from date: due before it never reminds, due on it does; Skipped never reminds',
    fn: function () {
      const m = _rmtM({ DueDate: '2027-03-10' });
      const a = { OwnerEmail: _RMT_ME, DueDate: '2027-03-21', IsDone: false };
      _assertEqual(_rmtTypes(_rmtPlan({ from: '2027-03-10', meetings: [m] })), ['pdpOverdue'], 'AC7 due on the from date counts');
      _assertEqual(_rmtPlan({ from: '2027-03-11', meetings: [m] }), { send: [], keep: [] }, 'AC7 due the day before: silent');
      _assertEqual(_rmtPlan({ from: '2027-03-22', actions: [a] }), { send: [], keep: [] }, 'AC7 actions follow the same date');
      _assertEqual(_rmtTypes(_rmtPlan({ from: '2027-03-21', actions: [a] })), ['pdpAction'], 'AC7 action on the from date counts');
      _assertEqual(_rmtPlan({ from: 'garbage', meetings: [_rmtM({ DueDate: '2026-12-31' })] }), { send: [], keep: [] }, 'AC7 an invalid date falls back to the default (1 Jan 2027): the 2026 backlog stays silent');
      _assertEqual(_rmtPlan({ from: undefined, meetings: [_rmtM({ DueDate: '2026-11-30' })] }), { send: [], keep: [] }, 'AC7 no setting: default date');
      _assertEqual(_rmtPlan({ meetings: [_rmtM({ DueDate: '2027-01-31', Status: 'Skipped', SkipReason: 'Before PDP start' })] }), { send: [], keep: [] }, 'AC8 a Before-PDP-start skipped meeting is silent');
    },
  },
  {
    name: 'N-441 AC9 keys: pdp:<type>:<email>:<YYYY-MM>, stable across runs in a month',
    fn: function () {
      _assertEqual(pdpReminderKey('pdpOverdue', 'Tia@MG.test', '2027-03-20'), 'pdp:pdpOverdue:tia@mg.test:2027-03', 'AC9 key shape');
      _assertEqual(pdpReminderKey('pdpOverdue', _RMT_ME, new Date('2027-04-02T12:00:00Z')), 'pdp:pdpOverdue:tia@mg.test:2027-04', 'AC9 next month, new key');
      const ms = [_rmtM({ DueDate: '2027-03-10' })];
      const one = _rmtPlan({ meetings: ms }), two = _rmtPlan({ meetings: ms });
      _assertEqual(one, two, 'AC9 same input, same plan');
      _assertEqual(one.keep, one.send.map(s => s.key), 'AC9 keep = the keys sent');
      _assertEqual(_rmtPlan({ today: '2027-04-02', meetings: ms }).send[0].key === one.send[0].key, false, 'AC9 a new month is a new digest');
    },
  },
  {
    name: 'N-441 AC10 privacy: bodies are CONFIG text plus a count; no record value reaches the plan',
    fn: function () {
      const R = CONFIG.PDP.REMINDERS;
      const secret = 'ZZSECRET';
      const m = _rmtM({ DueDate: '2027-03-10', PersonName: secret + ' name', MeetingNotes: secret + ' notes', PrepManager: secret, Assessment: secret });
      const a = { OwnerEmail: _RMT_ME, DueDate: '2027-03-21', IsDone: false, Title: secret + ' action', Notes: secret };
      const p = _rmtPlan({ meetings: [m, _rmtM({ id: '3', DueDate: '2027-03-27', PersonName: secret })], actions: [a] });
      _assertEqual(JSON.stringify(p).includes(secret), false, 'AC10 nothing from a record is in the plan');
      p.send.forEach(s => {
        const T = R.TEXT[s.type];
        _assertEqual(s.body === (s.n === 1 ? T.one : T.many.replace('{n}', String(s.n))), true, 'AC10 ' + s.type + ' body is the CONFIG text');
        _assertEqual(s.tone, 'attention', 'AC10 tone');
        _assertEqual(/@|\d{4}-\d{2}/.test(s.body), false, 'AC10 no email or date in the body');
      });
      const src = ALL_SOURCES['pdp-reminders.js'];
      _assertEqual(/PersonName|MeetingNotes|PrepManager|Assessment|\.Title\b/.test(src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')), false, 'AC10 the rules never read a name, note, score or title');
    },
  },
  {
    name: 'N-441 AC11-AC12 runPdpReminders: ghost and Pilot / Off read no PDP list; self-only writes; own rows cleared',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      const run = _rmtFn(src, 'runPdpReminders', 'async function readPdpCompletion');
      _assertEqual(run.indexOf('_pdpRemindersRan') > -1 && /if \(_pdpRemindersRan\) return;/.test(run), true, 'AC11 once per page load');
      const g = run.indexOf('getGhostUser()'), sw = run.indexOf('readPdpSwitch()'), rd = run.indexOf('getPdpMeetings('), rd2 = run.indexOf('getPdpActions(');
      _assertEqual(g > -1 && g < sw && sw < rd && sw < rd2, true, 'AC11 ghost check, then the switch, then the PDP reads');
      _assertEqual(/CONFIG\.PDP\.MODES\[2\]/.test(run.slice(0, rd)) && /_pdpClearReminders\(me, \[\]\)/.test(run.slice(0, rd)), true, 'AC11 anything but On clears the user\'s own reminders before any PDP read');
      _assertEqual(/gate\.state !== 'live'/.test(run.slice(0, rd)), true, 'AC11 the user must be live');
      _assertEqual((run.match(/getPdpMeetings\(/g) || []).length + (run.match(/getPdpActions\(/g) || []).length, 2, 'AC11 one read of each');
      _assertEqual(/pdpReminderPlan\(/.test(run) && /pdpVisibleItems\(/.test(run), true, 'AC11 plan over the visible records');
      _assertEqual(/recipients: \[me\]/.test(run) && !/recipients: (?!\[me\])/.test(run), true, 'AC12 a session writes reminders only for itself');
      const clear = _rmtFn(src, '_pdpClearReminders', 'async function runPdpReminders');
      const own = _rmtFn(src, '_pdpOwnReminderRows', 'async function _pdpClearReminders');
      _assertEqual(/RecipientEmail eq '\$\{odataStr\(me\)\}'/.test(own) && /Object\.values\(CONFIG\.PDP\.REMINDERS\.TYPES\)/.test(own), true, 'AC12 own rows, the three types only');
      _assertEqual(/updateItem\('Notifications', r\.id, \{ Status: 'cleared' \}\)/.test(clear) && !/clearNotification\(/.test(src.slice(src.indexOf('async function runPdpReminders'))), true, 'AC12 clearing touches only Status, own rows (not clearNotification)');
      _assertEqual(/catch \(e\) \{ console\.warn\(/.test(run), true, 'AC11 a failure never breaks a page');
    },
  },
  {
    name: 'N-441 AC13 reminders-from setting: read normalised, write admin-only, validated, only when changed',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      const rd = _rmtFn(src, 'readPdpSwitch', 'async function writePdpSwitch'), w = _rmtFn(src, 'writePdpSwitch', 'async function resolvePdpGate');
      _assertEqual(/remindersFrom: pdpNormaliseRemindersFrom\(row \? row\[S\.REMINDERS_FROM\] : ''\)/.test(rd), true, 'AC13 read normalises (blank = default)');
      _assertEqual(/roleCan\(role, 'pdpSwitch'\)/.test(w) && /remindersFrom !== undefined/.test(w), true, 'AC13 same Admin-only gate, only the fields passed');
      _assertEqual(/pdpNormaliseRemindersFrom\(d\) !== d/.test(w) && /Reminders from must be a valid date/.test(w), true, 'AC13 invalid dates refused');
      _assertEqual(/fields\[S\.REMINDERS_FROM\] = d;/.test(w), true, 'AC13 blank is written as blank (default applies)');
      const tab = ALL_SOURCES['pdp-admin.js'];
      _assertEqual(/id="pdp-reminders-from"/.test(tab) && /type="date"/.test(tab), true, 'AC13 date control on the PDP tab');
      _assertEqual(/if \(from !== _pdpaFrom\) payload\.remindersFrom = from;/.test(tab), true, 'AC13 sent only when changed (the column need not exist for a mode-only save)');
      _assertEqual(/only when PDP is On/.test(tab) && /pilot users receive none/.test(tab), true, 'AC13 the tab says pilot users receive none');
      _assertEqual(/\bon(click|change|input)=|style="/.test(tab), false, 'AC13 no inline handlers or styles');
      const off = Object.keys(ALL_SOURCES).filter(f => !['config.js', 'pdp-identity.js', 'api-pdp.js', 'pdp-admin.js'].includes(f) && /PDPRemindersFrom|REMINDERS_FROM/.test(ALL_SOURCES[f]));
      _assertEqual(off, [], 'AC13 only the switch files name the column');
    },
  },
  {
    name: 'N-441 AC14 pdpCompletion: due-to-date aggregate, Skipped excluded, no names',
    fn: function () {
      const mt = (id, pid, due, status, extra) => Object.assign({ id: String(id), PersonID: pid, PersonName: 'Name ' + pid, CycleYear: 2027, DueDate: due, Status: status }, extra || {});
      const ms = [
        mt(1, 1, '2027-01-31', 'SignedOff'), mt(2, 1, '2027-02-28', 'Held'), mt(3, 2, '2027-01-31', 'Planned'), mt(4, 2, '2027-02-28', 'PrepOpen'),
        mt(5, 3, '2027-03-31', 'Planned'), mt(6, 3, '2027-03-20', 'Planned'), mt(7, 3, '2027-02-28', 'Skipped'), mt(8, 4, '2026-12-31', 'Planned', { CycleYear: 2026 }),
      ];
      const c = pdpCompletion(ms, _RMT_TODAY, 2027);
      _assertEqual([c.year, c.dueToDate, c.held, c.overdue, c.peopleOverdue, c.pct], [2027, 5, 2, 2, 1, 40], 'AC14 counts (due 20 Mar counts as due, not overdue; later and Skipped and other years out)');
      _assertEqual(pdpCompletion([], _RMT_TODAY, 2027), { year: 2027, dueToDate: 0, held: 0, overdue: 0, peopleOverdue: 0, pct: null }, 'AC14 nothing due: pct null');
      _assertEqual(pdpCompletion(null, _RMT_TODAY, 2027).pct, null, 'AC14 null input is safe');
      _assertEqual(JSON.stringify(c).includes('Name'), false, 'AC14 aggregate only: no names');
      _assertEqual(pdpCompletion(ms, new Date('2027-03-20T12:00:00Z'), 2027).dueToDate, 5, 'AC14 accepts a Date');
    },
  },
  {
    name: 'N-441 AC15 completion tile: pdpAdmin only, not in Off, quiet on failure; Leadership never',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      const f = _rmtFn(src, 'readPdpCompletion', null);
      _assertEqual(/_ensureGhostGate\(\)/.test(f) && /getEffectiveRole\(/.test(f), true, 'AC15 effective (Ghost-aware) role');
      _assertEqual(/roleCan\(role, 'pdpAdmin'\)\) return null/.test(f) && /CONFIG\.PDP\.MODES\[0\]\) return null/.test(f), true, 'AC15 null for non-admin and for Off');
      _assertEqual(roleCan('leadership', 'pdpAdmin') || roleCan('talent_partner', 'pdpAdmin'), false, 'AC15 Leadership and TPs are refused by the role check');
      const dash = ALL_SOURCES['people-dashboard.js'];
      const strip = dash.slice(dash.indexOf('async function _renderKPIStrip'), dash.indexOf('// Panel 1 - Team Utilisation'));
      _assertEqual(/readPdpCompletion\(\)/.test(strip) && /catch \(e\) \{ console\.warn\(/.test(strip) && /if \(c\) pdpCard =/.test(strip), true, 'AC15 tile only for a non-null result; a failure renders nothing');
      _assertEqual(/escHtml\(c\.mode\)/.test(strip) && /\$\{pdpCard\}/.test(strip), true, 'AC15 mode escaped; card sits in the KPI strip');
      _assertEqual(_PDP_GUARD_RE.test(dash), false, 'AC15 the dashboard names no PDP list or reader');
    },
  },
  {
    name: 'N-441 AC16 wiring and PDP-D12: people.html and my-momentum.html only, load order, not mobile / MCP / Command Bar, no inline or hex',
    fn: function () {
      const h = ALL_HTML['people.html'];
      const at = f => h.indexOf('js/' + f + '"');
      _assertEqual(at('pdp-reminders.js') > at('pdp-prep.js') && at('pdp-prep.js') > at('pdp-cycle.js') && at('pdp-cycle.js') > -1, true, 'AC16 pdp-reminders.js loads after pdp-cycle.js and pdp-prep.js');
      _assertEqual(at('pdp-reminders.js') < at('api-pdp.js'), true, 'AC16 pure rules before the API');
      _assertEqual(ALL_HTML['mobile.html'].includes('pdp-reminders.js'), false, 'AC16 not on mobile.html');
      _assertEqual(CONFIG.MCP.scripts.some(f => /pdp/.test(f)), false, 'AC16 no PDP file in the MCP bundle');
      const offenders = Object.keys(ALL_SOURCES).filter(f => /runPdpReminders|pdpReminderPlan|readPdpCompletion|pdpCompletion/.test(ALL_SOURCES[f]) && !['api-pdp.js', 'pdp-reminders.js', 'pdp-cycle.js', 'people-app.js', 'people-dashboard.js', 'my-momentum-app.js'].includes(f));
      _assertEqual(offenders, [], 'AC16 only the named files use the reminder / tile functions (not Command Bar, mobile, MCP)');
      const app = ALL_SOURCES['people-app.js'], mm = ALL_SOURCES['my-momentum-app.js'];
      _assertEqual(/runPdpReminders\(\)\.catch\(/.test(app) && app.split('runPdpReminders()').length === 2, true, 'AC16 People init calls it once (N-452: no longer tied to a PDP nav read)');
      _assertEqual(/runPdpReminders\(\)\.catch\(/.test(mm) && mm.split('runPdpReminders()').length === 2 && mm.indexOf('runPdpReminders()') > mm.indexOf('resolvePdpNav()'), true, 'AC16 My Momentum init calls it once, after the PDP signals (N-452)');
      _assertEqual(ALL_HTML['my-momentum.html'].includes('js/pdp-reminders.js'), true, 'AC16 my-momentum.html loads the rules file');
      const pure = ALL_SOURCES['pdp-reminders.js'].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      _assertEqual(/document\.|window\.|getItems|createItem|updateItem|fireNotification|fetch\(|graphRequest/.test(pure), false, 'AC16 pure: no DOM, no network, no writes');
      _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(pure), false, 'AC16 no hex');
    },
  },
  {
    name: 'N-441 AC17 the existing notification engine is untouched',
    fn: function () {
      const n = ALL_SOURCES['notifications.js'];
      _assertEqual(/N-441/.test(n), false, 'AC17 notifications.js has no N-441 change');
      _assertEqual(/const \{ triggerType, triggerKey, tone, deepLink, body, recipients,/.test(n), true, 'AC17 fireNotification signature unchanged');
    },
  }
);