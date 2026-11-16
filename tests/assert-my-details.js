// tests/assert-my-details.js — My Details: restricted personal list, form rules, access gate, Manage checks (N-456 / MM-6).
// Pure logic and markup run everywhere; the source-text checks need ALL_SOURCES / ALL_HTML (tests/run.js) and skip in the browser harness.
// Network functions are checked up to their first await (the rig is synchronous): the calls they make before any promise settles.

const _MD_ALL = ['EmergencyName', 'EmergencyRelationship', 'EmergencyPhone', 'EmergencyPhoneAlt', 'PersonalMobile', 'PersonalEmail',
  'AddressLine1', 'AddressLine2', 'AddressTown', 'AddressPostcode', 'AddressCountry'];
const _MD_STAMP = ['UpdatedBy', 'UpdatedAt', 'UpdatedOnBehalf'];

function _mdFxPeople() {
  return [
    { id: 1, EmployeeName: 'Ann <b>Admin</b>', WorkEmail: 'Ann@mg.test', IsActive: 'Yes' },
    { id: 2, EmployeeName: 'Bob Builder', WorkEmail: 'bob@mg.test', IsActive: 'Yes' },
    { id: 3, EmployeeName: 'Cy NoEmail', WorkEmail: '', IsActive: 'Yes' },
    { id: 4, EmployeeName: 'Di Leaver', WorkEmail: 'di@mg.test', IsActive: 'No', EndDate: '2026-10-31T00:00:00Z' },
    { id: 5, EmployeeName: 'Ed Ended', WorkEmail: 'ed@mg.test', IsActive: 'Yes', EndDate: '2026-11-10T00:00:00Z' },
    { id: 6, EmployeeName: 'Fay Future', WorkEmail: 'fay@mg.test', IsActive: 'Yes', EndDate: '2026-11-16T00:00:00Z' },
    { id: 7, EmployeeName: 'To be hired', WorkEmail: '', IsActive: 'Yes', IsPlaceholder: 'Yes' },
  ];
}
function _mdRow(id, pid, extra) { return Object.assign({ id: String(id), PersonID: pid, PersonEmail: '', AccessKey: '' }, extra); }
function _mdSrc(f) { return (ALL_SOURCES[f] || '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'); }

// Files that may mention the list or its functions. Adding one is a deliberate review: that file now handles personal details.
const _MD_GUARD_ALLOW = ['config.js', 'graph-client.js', 'my-details-logic.js', 'api-my-details.js', 'my-details-ui.js', 'people-forms.js', 'my-momentum-nav.js'];
const _MD_GUARD_RE = /\bPeopleDetails\b|MY_MOMENTUM\.DETAILS|\b(getMyDetails\w*|ensureMyDetailsRow|saveMyDetails|clearMyDetailsRow|createMissingMyDetailsRows|fixMyDetailsEmails|renderMyDetailsPage)\b/;
function _mdGuardOffenders(sources, allow) {
  return Object.keys(sources).filter(f => !allow.includes(f) && _MD_GUARD_RE.test(sources[f] || '')).sort();
}

ASSERTIONS.push(
  {
    name: 'N-456 AC1/AC2 config: list, columns in step with the registry, restricted, myDetailsAdmin, tab live, alias {}',
    fn: function () {
      const C = CONFIG.MY_MOMENTUM.DETAILS;
      _assertEqual(C.LIST, 'PeopleDetails', 'AC1 list name');
      _assertEqual(C.FIELDS.map(f => f.key), _MD_ALL, 'AC1 registry order');
      _assertEqual(CONFIG.LIST_FIELDS.PeopleDetails, ['Title', 'PersonID', 'PersonEmail'].concat(_MD_ALL, _MD_STAMP, ['AccessKey']), 'AC1 projection = key columns + registry + stamp, AccessKey last');
      C.FIELDS.forEach(f => {
        _assertEqual(['text', 'phone', 'email'].includes(f.kind), true, 'AC1 ' + f.key + ' kind');
        _assertEqual(Number.isInteger(f.max) && f.max > 0, true, 'AC1 ' + f.key + ' max');
        _assertEqual(f.group in C.GROUPS, true, 'AC1 ' + f.key + ' group exists');
      });
      Object.keys(C.GROUPS).forEach(g => C.GROUPS[g].required.forEach(k => _assertEqual(C.FIELDS.some(f => f.key === k && f.group === g), true, 'AC1 required ' + k + ' is in ' + g)));
      _assertEqual(CONFIG.RESTRICTED_LISTS.includes('PeopleDetails'), true, 'AC2 restricted');
      _assertEqual(CONFIG.ROLE_CAPABILITIES.myDetailsAdmin, ['admin', 'people_ops'], 'AC2 capability');
      _assertEqual(roleCan('leadership', 'myDetailsAdmin'), false, 'AC2 Leadership never reads others\' details');
      _assertEqual(roleCan('delivery_manager', 'myDetailsAdmin'), false, 'AC2 Delivery Manager never');
      _assertEqual(CONFIG.MY_MOMENTUM.TABS.find(t => t.key === 'myDetails').live, true, 'AC2 tab live');
      Object.keys(C.TEXT).forEach(k => _assertEqual(typeof C.TEXT[k] === 'string' && C.TEXT[k].length > 0, true, 'AC2 text ' + k));
      ['title', 'save', 'saved', 'invalid', 'required', 'tooLong', 'badPhone', 'badEmail', 'lastUpdated', 'byOnYourBehalf', 'byOnBehalf', 'ghost', 'notAllowed', 'badPerson',
        'noAccessAdmin', 'notReady', 'loadFailed', 'noOwn', 'leaveMsg', 'clearMsg', 'createMsg', 'fixMsg'].forEach(k => _assertEqual(k in C.TEXT, true, 'AC2 text key ' + k + ' exists'));
      if (typeof FIELD_ALIASES === 'undefined') _skip('FIELD_ALIASES is only visible in the node rig');
      _assertEqual(FIELD_ALIASES.PeopleDetails, {}, 'AC2 alias is {} (a self-mapping alias would delete the field)');
    },
  },
  {
    name: 'N-456 AC3 exclusions: tier 1 only, not enrolled, not in MCP, Command Bar or mobile; PDP-D12-style source guard with positive control',
    fn: function () {
      _assertEqual(CONFIG.CACHE.persistentLists.includes('PeopleDetails'), false, 'AC3 not tier 2');
      _assertEqual(CONFIG.DELTA.enrolledLists.includes('PeopleDetails'), false, 'AC3 not delta-enrolled');
      _assertEqual(CONFIG.MCP.allowedLists.includes('PeopleDetails'), false, 'AC3 not MCP-readable');
      _assertEqual(CONFIG.MCP.scripts.some(f => /my-details|api-my-details/.test(f)), false, 'AC3 no My Details file in the MCP bundle');
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') _skip('sources are only read by node tests/run.js');
      _assertEqual(_mdGuardOffenders(ALL_SOURCES, _MD_GUARD_ALLOW), [], 'AC3 no js/ file outside the allowlist mentions My Details data');
      const planted = Object.assign({}, ALL_SOURCES, { 'command-bar.js': ALL_SOURCES['command-bar.js'] + '\nconst x = getMyDetails;' });
      _assertEqual(_mdGuardOffenders(planted, _MD_GUARD_ALLOW), ['command-bar.js'], 'AC3 positive control');
      _assertEqual(_mdGuardOffenders(Object.assign({}, ALL_SOURCES, { 'api.js': ALL_SOURCES['api.js'] + '\nawait ensureMyDetailsRow(p);' }), _MD_GUARD_ALLOW), ['api.js'], 'AC3 positive control: the create hook never moves into api.js (MCP bundle)');
      _assertEqual(/my-details/.test(ALL_HTML['mobile.html'] || ''), false, 'AC3 mobile.html loads no My Details file');
      _assertEqual(/my-details/.test(ALL_HTML['admin.html'] || ''), false, 'AC3 admin.html loads no My Details file');
      ['my-momentum.html', 'people.html'].forEach(h => {
        const t = ALL_HTML[h];
        _assertEqual(t.indexOf('js/my-details-logic.js') > -1 && t.indexOf('js/my-details-logic.js') < t.indexOf('js/graph-client.js'), true, 'AC3 ' + h + ' pure rules before graph-client.js');
        _assertEqual(t.indexOf('js/api-my-details.js') > t.indexOf('js/api.js'), true, 'AC3 ' + h + ' api after api.js');
      });
      const mm = ALL_HTML['my-momentum.html'];
      _assertEqual(mm.indexOf('js/my-details-ui.js') > mm.indexOf('js/my-momentum-pages.js') && mm.indexOf('js/my-details-ui.js') < mm.indexOf('js/my-momentum-app.js'), true, 'AC3 ui between pages and app');
      _assertEqual(/my-details-ui/.test(ALL_HTML['people.html']), false, 'AC3 people.html loads no My Details page');
    },
  },
  {
    name: 'N-456 AC4 validation: blank is valid, group rules, phone / email shape, length, no value ever echoed',
    fn: function () {
      _assertEqual(mdValidate({}).ok, true, 'AC4 empty object valid');
      _assertEqual(mdValidate(null).ok, true, 'AC4 null valid');
      const blank = {}; _MD_ALL.forEach(k => { blank[k] = '   '; });
      _assertEqual(mdValidate(blank).ok, true, 'AC4 whitespace-only form valid (clears everything)');
      const only = mdValidate({ EmergencyName: 'Mum' });
      _assertEqual(Object.keys(only.errors).sort(), ['EmergencyPhone', 'EmergencyRelationship'], 'AC4 emergency: name alone needs relationship and phone');
      _assertEqual(mdValidate({ EmergencyName: 'Mum', EmergencyRelationship: 'Mother', EmergencyPhone: '+44 (0)7700 900123' }).ok, true, 'AC4 emergency complete; alt phone optional');
      _assertEqual(Object.keys(mdValidate({ AddressPostcode: 'SO23 8AA' }).errors).sort(), ['AddressCountry', 'AddressLine1', 'AddressTown'], 'AC4 address: postcode alone needs line 1, town, country');
      _assertEqual(mdValidate({ AddressLine1: '1 High St', AddressTown: 'Winchester', AddressCountry: 'UK' }).ok, true, 'AC4 address without postcode valid');
      _assertEqual(mdValidate({ PersonalMobile: 'abc123456' }).errors.PersonalMobile, mdText('badPhone'), 'AC4 letters in a phone');
      _assertEqual(mdValidate({ PersonalMobile: '12345' }).ok, false, 'AC4 too few digits');
      _assertEqual(mdValidate({ PersonalMobile: '1'.repeat(16) }).ok, false, 'AC4 too many digits');
      _assertEqual(mdValidate({ PersonalMobile: '07700 900123' }).ok, true, 'AC4 UK mobile');
      _assertEqual(mdValidate({ PersonalEmail: 'no-at-sign' }).errors.PersonalEmail, mdText('badEmail'), 'AC4 bad email');
      _assertEqual(mdValidate({ PersonalEmail: 'a b@c.com' }).ok, false, 'AC4 space in email');
      _assertEqual(mdValidate({ PersonalEmail: 'me@home.example' }).ok, true, 'AC4 good email');
      _assertEqual(mdValidate({ AddressLine2: 'x'.repeat(151) }).errors.AddressLine2, mdText('tooLong', { max: 150 }), 'AC4 too long names the limit');
      const secret = 'ZQ-SECRET-7731';
      const all = mdValidate({ EmergencyName: secret, PersonalMobile: secret, PersonalEmail: secret, AddressPostcode: secret });
      _assertEqual(JSON.stringify(all.errors).includes(secret), false, 'AC4 an error message never echoes the value');
    },
  },
  {
    name: 'N-456 AC5 cleaner: only registry columns plus the stamp; forged keys dropped; clear is blank + on-behalf; new row payload',
    fn: function () {
      const who = { email: ' Real.Admin@MG.test ', onBehalf: true, nowISO: '2026-11-16T10:00:00.000Z' };
      const forged = { PersonID: 99, PersonEmail: 'evil@x.test', AccessKey: 'forged', Title: 'x', UpdatedBy: 'someone@else', EmergencyName: '  Mum   Smith ', PersonalEmail: ' Me@Home.EXAMPLE ', AddressLine1: 'y'.repeat(200) };
      const p = mdSavePayload(forged, who);
      _assertEqual(Object.keys(p).sort(), _MD_ALL.concat(_MD_STAMP).sort(), 'AC5 exactly the registry and the stamp');
      _assertEqual(p.EmergencyName, 'Mum Smith', 'AC5 whitespace collapsed');
      _assertEqual(p.PersonalEmail, 'me@home.example', 'AC5 email lower-cased');
      _assertEqual(p.AddressLine1.length, 150, 'AC5 capped at max');
      _assertEqual(p.AddressTown, '', 'AC5 blank clears');
      _assertEqual([p.UpdatedBy, p.UpdatedAt, p.UpdatedOnBehalf], ['real.admin@mg.test', '2026-11-16T10:00:00.000Z', true], 'AC5 stamp from the real signed-in email, never from the form');
      const c = mdClearPayload({ email: 'a@mg.test', nowISO: 'T' });
      _assertEqual(Object.keys(c).sort(), _MD_ALL.concat(_MD_STAMP).sort(), 'AC5 clear writes the same columns');
      _assertEqual(_MD_ALL.every(k => c[k] === ''), true, 'AC5 clear blanks everything');
      _assertEqual(c.UpdatedOnBehalf, true, 'AC5 clear is stamped as an on-behalf edit');
      _assertEqual(mdNewRowPayload({ id: 2, WorkEmail: 'Bob@MG.test' }), { Title: '2', PersonID: 2, PersonEmail: 'bob@mg.test' }, 'AC5 new row with a work email');
      _assertEqual(mdNewRowPayload({ id: 3, WorkEmail: '' }), { Title: '3', PersonID: 3 }, 'AC5 new row without one: no PersonEmail yet');
      _assertEqual([mdNewRowPayload(null), mdNewRowPayload({ id: 'x' }), mdNewRowPayload({ id: 0 }), mdNewRowPayload({ id: 1.5 })], [null, null, null, null], 'AC5 no usable id: no payload');
      _assertEqual(mdFixEmailPayload({ WorkEmail: ' Bob@MG.test ' }), { PersonEmail: 'bob@mg.test' }, 'AC5 fix payload');
      _assertEqual(mdAccessKey(' A@B.C '), 'a@b.c', 'AC5 access key = lower-cased PersonEmail (the flow\'s loop guard)');
    },
  },
  {
    name: 'N-456 AC6 access gate: own row, Admin / People Ops for anyone, nobody else, Ghost Mode nothing',
    fn: function () {
      const A = (role, ghost, me, target) => mdAccessFor(role, ghost, me, target);
      ['staff', 'talent_partner', 'delivery_manager', 'sales', 'leadership'].forEach(r => {
        _assertEqual(A(r, null, 5, 5), { edit: true, onBehalf: false }, 'AC6 ' + r + ' own row');
        _assertEqual(A(r, null, 5, 6), { edit: false, onBehalf: false }, 'AC6 ' + r + ' another person');
      });
      ['admin', 'people_ops'].forEach(r => {
        _assertEqual(A(r, null, 5, 5), { edit: true, onBehalf: false }, 'AC6 ' + r + ' own');
        _assertEqual(A(r, null, 5, 6), { edit: true, onBehalf: true }, 'AC6 ' + r + ' on behalf');
        _assertEqual(A(r, null, null, 6), { edit: true, onBehalf: true }, 'AC6 ' + r + ' with no People row of their own');
        _assertEqual(A(r, { email: 'x' }, 5, 6), { edit: false, onBehalf: false }, 'AC6 ' + r + ' Ghost Mode: nothing');
      });
      _assertEqual(A('staff', null, null, 6), { edit: false, onBehalf: false }, 'AC6 no own id, no role: nothing');
      _assertEqual(A('staff', { email: 'x' }, 5, 5), { edit: false, onBehalf: false }, 'AC6 Ghost Mode blocks even the own row');
      _assertEqual(A('staff', null, '5', 5), { edit: true, onBehalf: false }, 'AC6 ids compare as text');
      _assertEqual(A('admin', null, 0, 0).edit, true, 'AC6 id 0 is still an id');
    },
  },
  {
    name: 'N-456 AC7 tab visibility: everyone with a People row; Admin / People Ops without one; nobody else',
    fn: function () {
      const live = CONFIG.MY_MOMENTUM.TABS;
      const keys = (st, role) => mmVisibleTabs(live, { state: st, role, signals: {} }).map(t => t.key);
      ['staff', 'talent_partner', 'delivery_manager', 'sales', 'leadership', 'admin', 'people_ops'].forEach(r =>
        _assertEqual(keys('ok', r).includes('myDetails'), true, 'AC7 ' + r + ' with a People row'));
      ['admin', 'people_ops'].forEach(r => ['notLinked', 'ambiguous', 'error'].forEach(s =>
        _assertEqual(keys(s, r).includes('myDetails'), true, 'AC7 ' + r + ' with state ' + s + ' still gets the picker')));
      ['staff', 'talent_partner', 'delivery_manager', 'sales', 'leadership'].forEach(r => ['notLinked', 'ambiguous', 'error'].forEach(s =>
        _assertEqual(keys(s, r).includes('myDetails'), false, 'AC7 ' + r + ' with state ' + s + ' has no My Details')));
    },
  },
  {
    name: 'N-456 AC8 markup: every value escaped, no inline style or handler, registry-driven fields, picker, ghost and notice panels',
    fn: function () {
      const evil = '<img src=x onerror=alert(1)>"\'';
      const vals = {}; _MD_ALL.forEach(k => { vals[k] = evil; });
      const html = mdFormHtml({ values: vals, errors: { PersonalEmail: evil }, heading: evil, onBehalf: true, stamp: evil, note: evil });
      _assertEqual(/<img/i.test(html), false, 'AC8 no injected tag anywhere in the form');
      _assertEqual(/\sstyle=|\sonclick=|\sonchange=|\soninput=|javascript:/i.test(html), false, 'AC8 no inline style or handler');
      _MD_ALL.forEach(k => _assertEqual(html.includes('data-mdf="' + k + '"'), true, 'AC8 field ' + k + ' drawn'));
      _assertEqual((html.match(/autocomplete="off"/g) || []).length >= _MD_ALL.length, true, 'AC8 on-behalf form turns autofill off for every field');
      const own = mdFormHtml({ values: {}, errors: {}, heading: '', onBehalf: false, stamp: '', note: '' });
      _assertEqual(own.includes('autocomplete="email"') && own.includes('autocomplete="postal-code"'), true, 'AC8 own form keeps the browser autofill tokens');
      _assertEqual(own.includes('mmd-error'), false, 'AC8 no error markup when valid');
      _assertEqual(html.includes('role="alert"'), true, 'AC8 errors are announced');
      const pick = mdPickerHtml(mdTargetOptions(_mdFxPeople()), true, '2');
      _assertEqual(/<img|<b>/.test(pick), false, 'AC8 picker escapes names');
      _assertEqual(pick.includes('value="2" selected'), true, 'AC8 picker marks the chosen person');
      _assertEqual(pick.includes('(left)'), true, 'AC8 leavers marked');
      _assertEqual(mdNoticeHtml('<b>t</b>', '<i>m</i>').includes('<b>'), false, 'AC8 notice escapes');
      _assertEqual(mdNoticeHtml(mdText('ghostTitle'), mdText('ghost')).includes('Ghost Mode'), true, 'AC8 ghost panel wording from config');
    },
  },
  {
    name: 'N-456 AC9 stamp line: when, who, owner vs admin wording',
    fn: function () {
      const nm = e => ({ 'ann@mg.test': 'Ann <b>Admin</b>' })[e] || '';
      const row = { UpdatedAt: '2026-11-16T16:40:00.000Z', UpdatedBy: 'Ann@MG.test', UpdatedOnBehalf: 'Yes' };
      _assertEqual(mdStampLine(row, nm, true), 'Last updated 16 Nov 2026, 16:40. Updated by Ann <b>Admin</b> on your behalf.', 'AC9 owner view (London time, text not HTML)');
      _assertEqual(mdStampLine(row, nm, false).endsWith('on behalf of the employee.'), true, 'AC9 admin view');
      _assertEqual(mdStampLine({ UpdatedAt: '2026-06-16T16:40:00.000Z', UpdatedOnBehalf: 'No' }, nm, true), 'Last updated 16 Jun 2026, 17:40.', 'AC9 BST applied, no "on behalf" for an own edit');
      _assertEqual(mdStampLine({ UpdatedAt: '2026-11-16T10:00:00Z', UpdatedBy: 'x@y.z', UpdatedOnBehalf: 'Yes' }, nm, false).includes('x@y.z'), true, 'AC9 unknown editor falls back to the email');
      _assertEqual([mdStampLine({}, nm, true), mdStampLine(null, nm, true), mdStampLine({ UpdatedAt: 'not a date' }, nm, true)], ['', '', ''], 'AC9 no stamp, no line');
      _assertEqual(mdFormHtml({ values: {}, errors: {}, stamp: mdStampLine(row, nm, true) }).includes('<b>Admin'), false, 'AC9 the markup escapes the stamp');
    },
  },
  {
    name: 'N-456 AC10 Manage plans: missing rows, no work email, drift, unlocked, duplicates, leavers',
    fn: function () {
      const people = _mdFxPeople();
      const rows = [_mdRow(10, 1, { PersonEmail: 'ann@mg.test', AccessKey: 'ann@mg.test' }), _mdRow(11, 2, { PersonEmail: 'old@mg.test' }), _mdRow(12, 2), _mdRow(13, 4, { PersonEmail: 'di@mg.test', AccessKey: 'di@mg.test', EmergencyName: 'Mum' })];
      const plan = mdPlanMissingRows(people, rows);
      _assertEqual(plan.create.map(p => p.id), [3, 5, 6], 'AC10 missing: active, non-placeholder, no row (Cy has no email but still gets a row)');
      _assertEqual(plan.noWorkEmail.map(p => p.id), [3], 'AC10 no work email (placeholder excluded)');
      _assertEqual(mdFindDrift(people, rows).map(d => [d.id, d.to, d.blank]), [['11', 'bob@mg.test', false], ['12', 'bob@mg.test', true]], 'AC10 drift incl. blank; Ann\'s case-insensitive match is not drift');
      _assertEqual(mdFindDrift(people, [_mdRow(20, 3)]), [], 'AC10 a person with no WorkEmail is never drift');
      const now = Date.parse('2026-11-16T12:00:00Z');
      const un = mdFindUnlocked([
        _mdRow(30, 2, { PersonEmail: 'bob@mg.test', Created: '2026-11-16T11:50:00Z' }),
        _mdRow(31, 5, { PersonEmail: 'ed@mg.test', Created: '2026-11-16T11:00:00Z' }),
        _mdRow(32, 6, { PersonEmail: 'fay@mg.test' }),
        _mdRow(33, 1, { PersonEmail: 'ann@mg.test', AccessKey: 'ann@mg.test', Created: '2026-01-01T00:00:00Z' }),
        _mdRow(34, 3),
      ], now);
      _assertEqual(un.map(u => [u.id, u.ageMin]), [['32', null], ['31', 60]], 'AC10 unlocked after the grace; no Created = old; locked, blank-email and fresh rows left out');
      _assertEqual(mdFindDuplicates(rows), [{ personId: 2, ids: ['11', '12'] }], 'AC10 duplicates');
      _assertEqual(mdPickRow([_mdRow(12, 2), _mdRow(11, 2)], 2).id, '11', 'AC10 the lowest id wins');
      _assertEqual(mdPickRow(rows, 99), null, 'AC10 no row');
      const lv = mdFindLeavers(people, [
        _mdRow(40, 4, { EmergencyName: 'Mum' }), _mdRow(41, 5, { PersonalMobile: '07700900123' }), _mdRow(42, 6, { PersonalMobile: '07700900123' }),
        _mdRow(43, 4), _mdRow(44, 2, { EmergencyName: 'x' })], '2026-11-16');
      _assertEqual(lv.map(l => l.id), ['40', '41'], 'AC10 leavers holding details: inactive, or ended before today; ending today is still here; empty rows and current staff left out');
      _assertEqual(mdTargetOptions(people).map(o => o.label), ['Ann <b>Admin</b>', 'Bob Builder', 'Cy NoEmail', 'Di Leaver (left)', 'Ed Ended', 'Fay Future'], 'AC10 picker options: no placeholders, leavers marked');
      _assertEqual(mdIsLocked({ PersonEmail: 'A@b.c', AccessKey: 'a@b.c' }), true, 'AC10 locked');
      _assertEqual([mdIsLocked({ PersonEmail: '', AccessKey: '' }), mdIsLocked({ PersonEmail: 'a@b.c', AccessKey: '' }), mdIsLocked(null)], [false, false, false], 'AC10 not locked');
      const rep = mdManageHtml({ denied: false, total: 0, toCreate: [{ id: '3', name: '<img src=x>' }], noWorkEmail: [], drift: [], unlocked: [], duplicates: [], leavers: [{ id: '40', name: 'Di <b>L</b>' }] }, '<i>done</i>');
      _assertEqual(/<img|<b>|<i>/.test(rep), false, 'AC10 Manage escapes names and the result line');
      _assertEqual(rep.includes('data-act'), true, 'AC10 Manage actions are data-act');
      const den = mdManageHtml({ denied: true }, '');
      _assertEqual(den.includes('<table'), false, 'AC10 a denied list shows no counts (so it can never read as "everyone is missing a row")');
      _assertEqual(den.includes(mdText('noAccessAdmin')), true, 'AC10 denied wording');
    },
  },
  {
    name: 'N-456 AC11 api-my-details.js: reads by whole-number PersonID, admin gate first, no delete, no logging of values',
    fn: function () {
      const calls = [];
      const hadUser = typeof getCurrentUser !== 'undefined';   // auth.js is not in the node rig
      const o = { g: getItems, e: getEffectiveRole, u: hadUser ? getCurrentUser : undefined, w: getGhostUser };
      const never = function () { return new Promise(function () {}); };
      try {
        getItems = function (l, f, s) { calls.push(['get', l, f || '', s || '']); return never(); };
        getEffectiveRole = function (e) { calls.push(['role', e]); return never(); };
        getCurrentUser = function () { return { email: 'me@mg.test' }; };
        getGhostUser = function () { return null; };
        getMyDetails(7);
        _assertEqual(calls[0], ['get', 'PeopleDetails', 'fields/PersonID eq 7', ''], 'AC11 own-row read filters by PersonID and keeps the default projection');
        getMyDetailsAll();
        _assertEqual(calls[1].slice(0, 3), ['get', 'PeopleDetails', ''], 'AC11 all-rows read is unfiltered');
        // N-456 QA problem 1: the report ages a row from Created, which the default projection does not carry.
        const sel = calls[1][3].split(',');
        _assertEqual(sel[0] === 'Id' && sel[sel.length - 1] === 'Created' && CONFIG.LIST_FIELDS.PeopleDetails.every(c => sel.includes(c)), true, 'AC11 all-rows read selects Id, every column and Created');
        _assertEqual(CONFIG.LIST_FIELDS.PeopleDetails.includes('Created'), false, 'AC11 Created stays out of the default projection (own-row reads, other readers)');
        // Positive control: without Created (what production returned before this fix) a row made a second ago is already listed as unlocked, with no age.
        const fresh = { id: '1', PersonID: 2, PersonEmail: 'bob@mg.test', AccessKey: '' };
        _assertEqual(mdFindUnlocked([fresh], Date.now()).map(u => u.ageMin), [null], 'AC11 control: no Created = listed at once, age unknown');
        _assertEqual(mdFindUnlocked([Object.assign({ Created: new Date().toISOString() }, fresh)], Date.now()), [], 'AC11 control: with Created a new row waits out the grace period');
        const bad = []; ['7 or 1 eq 1', -1, 0, 1.5, null, undefined, 'x'].forEach(v => { try { _mdPersonFilter(v); bad.push(v); } catch (e) { /* expected */ } });
        _assertEqual(bad, [], 'AC11 anything that is not a positive whole number is refused before any request');
        calls.length = 0;
        ensureMyDetailsRow({ id: 2, WorkEmail: 'bob@mg.test' }).catch(function () {});
        getMyDetailsReport().catch(function () {});
        createMissingMyDetailsRows().catch(function () {});
        fixMyDetailsEmails().catch(function () {});
        clearMyDetailsRow(5).catch(function () {});
        _assertEqual(calls.map(c => c[0]), ['role', 'role', 'role', 'role', 'role'], 'AC11 every admin function checks the role before reading anything');
        _assertEqual(calls.every(c => c[1] === 'me@mg.test'), true, 'AC11 role check uses the signed-in email');
        calls.length = 0;
        saveMyDetails(5, { PersonalMobile: '07700900123' }, { onBehalf: true }).catch(function () {});
        _assertEqual(calls.map(c => c[0]), ['role'], 'AC11 an on-behalf save checks the role first');
        calls.length = 0;
        getGhostUser = function () { return { email: 'ghost@mg.test' }; };
        saveMyDetails(5, {}, {}).catch(function () {});
        _assertEqual(calls.length, 0, 'AC11 Ghost Mode save touches nothing');
      } finally { getItems = o.g; getEffectiveRole = o.e; getGhostUser = o.w; if (hadUser) getCurrentUser = o.u; else delete globalThis.getCurrentUser; }
      if (typeof ALL_SOURCES === 'undefined') _skip('source text is only read by node tests/run.js');
      const api = _mdSrc('api-my-details.js');
      const ui = _mdSrc('my-details-ui.js');
      _assertEqual(/deleteItem|graphRequest|fetch\(/.test(api + ui), false, 'AC11 no delete, raw Graph call or fetch');
      _assertEqual(/AccessKey/.test(api.replace(/mdAccessKey/g, '') + ui.replace(/mdAccessKey/g, '')), false, 'AC11 api and ui never name AccessKey (the flow writes it)');
      const consoles = (api + '\n' + ui).split('\n').filter(l => /console\./.test(l));
      _assertEqual(consoles.length > 0 && consoles.every(l => /console\.warn\('N-456: [^']*', e && e\.message\)/.test(l)), true, 'AC11 every console call logs a fixed label and e.message only');
      _assertEqual(/localStorage|sessionStorage/.test(api + ui), false, 'AC11 nothing kept in browser storage');
      const save = api.slice(api.indexOf('async function saveMyDetails'), api.indexOf('async function getMyDetailsReport'));
      _assertEqual(save.indexOf('_mdNoGhost()') > -1 && save.indexOf('_mdNoGhost()') < save.indexOf('updateItem'), true, 'AC11 Ghost check precedes the write');
      _assertEqual(/getCurrentUser\(\)/.test(save), true, 'AC11 the stamp uses the real signed-in user');
      _assertEqual(/wasListDenied\(list\)/.test(api), true, 'AC11 denials are reported, never read as zero rows');
      _assertEqual(/if \(all\.denied\) return \{ denied: true \}/.test(api), true, 'AC11 a denied report returns nothing else');
    },
  },
  {
    name: 'N-456 AC12 hooks: Add Employee creates an empty row (non-blocking, never for placeholders); nav guards unsaved edits; dispatcher wired',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('source text is only read by node tests/run.js');
      const pf = ALL_SOURCES['people-forms.js'];
      const hook = pf.slice(pf.indexOf('commit: async () => {'));
      const i = hook.indexOf('await ensureMyDetailsRow');
      _assertEqual(i > -1, true, 'AC12 hook present');
      const before = hook.slice(Math.max(0, i - 260), i);
      _assertEqual(before.includes('!fields.IsPlaceholder') && before.includes("typeof ensureMyDetailsRow === 'function'"), true, 'AC12 guarded: not for placeholders, and only where the function loaded');
      _assertEqual(/try \{\s*await ensureMyDetailsRow\(/.test(hook) && /catch \(e\) \{\s*toast\(/.test(hook), true, 'AC12 a failure warns and never fails the employee save');
      _assertEqual(hook.slice(i).indexOf('return saved') > -1, true, 'AC12 the saved employee is still returned');
      _assertEqual(/ensureMyDetailsRow|MyDetails/.test(ALL_SOURCES['api.js']), false, 'AC12 api.js (MCP bundle) knows nothing of it');
      const nav = ALL_SOURCES['my-momentum-nav.js'];
      _assertEqual(/case 'myDetails':\s+await renderMyDetailsPage\(\)/.test(nav), true, 'AC12 dispatcher');
      _assertEqual(/async function navigateToMyMomentum/.test(nav) && /_mmCurrentPage === 'myDetails'[^\n]*mdConfirmLeave\(\)/.test(nav), true, 'AC12 leaving My Details with unsaved edits asks first');
      const ui = ALL_SOURCES['my-details-ui.js'];
      _assertEqual(/registerActions\(\{[^}]*mdSave[^}]*\}\)/.test(ui), true, 'AC12 actions registered');
      const render = ui.slice(ui.indexOf('async function renderMyDetailsPage'), ui.indexOf('async function _mdOpen'));
      _assertEqual(render.indexOf('getGhostUser()') > -1 && render.indexOf('getGhostUser()') < render.indexOf('getPeople'), true, 'AC12 Ghost Mode is closed before anything is read');
    },
  },
);