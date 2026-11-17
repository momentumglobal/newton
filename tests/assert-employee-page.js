// tests/assert-employee-page.js — employee record page (N-457 / MM-7): tracker link, access, employment rows, read-only My Details,
// deep links. Pure logic and markup run everywhere; the source-text checks need ALL_SOURCES / ALL_HTML (tests/run.js) and skip in the
// browser harness.

const _EP_ROLES = ['admin', 'leadership', 'people_ops', 'sales', 'delivery_manager', 'talent_partner', 'staff'];

function _epFxPeople() {
  return [
    { id: 1, EmployeeName: 'Ann <b>Boss</b>', WorkEmail: 'Ann@mg.test', IsActive: true, Level: 'CSD' },
    { id: 2, EmployeeName: 'Bob Builder', WorkEmail: 'bob@mg.test', IsActive: true, Level: 'Senior TP', StaffType: '', ContractType: 'Permanent', Location: 'UK',
      StartDate: '2024-03-04T00:00:00Z', EndDate: '', LevelSince: '2025-09-01T00:00:00Z', ReportsTo: 'ANN@mg.test', Salary: 51234.5 },
    { id: 3, EmployeeName: 'Cy Internal', WorkEmail: '', IsActive: true, StaffType: CONFIG.STAFF_TYPE_INTERNAL, StaffFunction: 'Finance', ContractType: 'Permanent', Location: 'Portugal', ReportsTo: 'nobody@mg.test', Salary: 40000 },
    { id: 4, EmployeeName: 'Di External', WorkEmail: 'di@mg.test', IsActive: false, StaffType: CONFIG.STAFF_TYPE_EXTERNAL, ContractType: 'Contractor', Location: 'UK', Salary: 99 },
  ];
}
function _epKeys(rows) { return rows.map(r => r.key); }
function _epRow(rows, k) { return rows.find(r => r.key === k); }
function _epSrc(f) { return (ALL_SOURCES[f] || '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'); }

ASSERTIONS.push(
  {
    name: 'N-457 AC1 config: registry, links and wording; every row kind is one the page knows',
    fn: function () {
      const C = CONFIG.EMPLOYEE_PAGE;
      _assertEqual(C.RECORD_HREF, 'people.html#peopleTracker?action=record&id=', 'record link');
      _assertEqual(C.EDIT_DETAILS_HREF, 'my-momentum.html#myDetails?person=', 'edit-details link');
      _assertEqual(C.EMPLOYMENT.map(f => f.key), ['role', 'StaffType', 'ContractType', 'Location', 'StartDate', 'EndDate', 'LevelSince', 'ReportsTo', 'WorkEmail', 'Salary'], 'registry order');
      _assertEqual(C.EMPLOYMENT.every(f => ['role', 'text', 'date', 'manager', 'salary'].includes(f.kind)), true, 'kinds');
      _assertEqual(C.EMPLOYMENT.every(f => (f.hideFor || []).every(k => ['internal', 'external'].includes(k))), true, 'hideFor values');
      _assertEqual(C.EMPLOYMENT.filter(f => f.kind === 'salary').length, 1, 'one salary row');
      _assertEqual(Object.keys(C.TEXT).sort(), ['back', 'backToRecord', 'dash', 'detailsHint', 'detailsLoadFailed', 'detailsTitle', 'edit', 'editDetails', 'employment', 'hideSalary', 'loadFailed', 'noDetails', 'revealSalary', 'unavailable'], 'wording keys');
    },
  },
  {
    name: 'N-457 AC2 access: Admin / Leadership / People Ops open a record; nobody else',
    fn: function () {
      _assertEqual(_EP_ROLES.filter(r => epCanOpen(r)), ['admin', 'leadership', 'people_ops'], 'who opens');
      _assertEqual(epCanOpen(undefined), false, 'no role');
      _assertEqual(epCanOpen('viewer'), false, 'unknown role');
    },
  },
  {
    name: 'N-457 AC6/AC7/AC9 details mode: only Admin / People Ops read; Leadership gets none; Ghost Mode gets the panel',
    fn: function () {
      _assertEqual(_EP_ROLES.map(r => epDetailsMode(r, null)), ['view', 'none', 'view', 'none', 'none', 'none', 'none'], 'no ghost');
      _assertEqual(_EP_ROLES.map(r => epDetailsMode(r, { email: 'g@mg.test' })), ['ghost', 'none', 'ghost', 'none', 'none', 'none', 'none'], 'ghost: Leadership still none');
    },
  },
  {
    name: 'N-457 AC10/AC11 links: a positive whole id only, never a half-built link',
    fn: function () {
      _assertEqual(epRecordHref(5), 'people.html#peopleTracker?action=record&id=5', 'record');
      _assertEqual(epEditDetailsHref('12'), 'my-momentum.html#myDetails?person=12', 'edit details, string id');
      _assertEqual([0, -1, 1.5, 'x', '5 or 1', '', null, undefined].map(v => epRecordHref(v) + '|' + epEditDetailsHref(v)), Array(8).fill('|'), 'bad ids give empty links');
      _assertEqual(['?person=12', 'myDetails?person=12', 'myDetails?x=1&person=7', 'myDetails?person=07', 'myDetails?person=0', 'myDetails?person=-3', 'myDetails?person=1.5', 'myDetails?person=12abc', 'myDetails?person=99999999999', 'myDetails', '', null, undefined].map(mmDeepLinkPerson),
        [12, 12, 7, null, null, null, null, null, null, null, null, null, null], 'mmDeepLinkPerson takes a positive whole number only');
    },
  },
  {
    name: 'N-457 AC4 employment rows: level / function / partner label, dates as day strings, reports-to name with fallbacks, hidden rows by staff kind',
    fn: function () {
      const people = _epFxPeople();
      const bob = epEmploymentRows(people[1], people, { canSalary: true });
      _assertEqual(_epKeys(bob), ['role', 'StaffType', 'ContractType', 'Location', 'StartDate', 'EndDate', 'LevelSince', 'ReportsTo', 'WorkEmail', 'Salary'], 'levelled staff see every row');
      _assertEqual([_epRow(bob, 'role').value, _epRow(bob, 'StartDate').value, _epRow(bob, 'EndDate').value, _epRow(bob, 'LevelSince').value], ['Senior TP', '2024-03-04', '', '2025-09-01'], 'level, day strings, blank end');
      _assertEqual(_epRow(bob, 'ReportsTo').value, 'Ann <b>Boss</b>', 'manager by work email, case-insensitive');
      const cy = epEmploymentRows(people[2], people, { canSalary: true });
      _assertEqual(_epKeys(cy).includes('LevelSince'), false, 'Internal staff: no level-since row');
      _assertEqual(_epRow(cy, 'role').value, CONFIG.STAFF_TYPE_INTERNAL + ' · Finance', 'internal staff show the function');
      _assertEqual(_epRow(cy, 'ReportsTo').value, 'nobody@mg.test', 'unmatched reports-to falls back to the email');
      _assertEqual(_epRow(cy, 'Salary').value, '', 'a salary outside the salary location is blank');
      const di = epEmploymentRows(people[3], people, { canSalary: true });
      _assertEqual(_epKeys(di).filter(k => ['ContractType', 'LevelSince', 'Salary'].includes(k)), [], 'External staff: no contract, level-since or salary row');
      _assertEqual(_epRow(di, 'role').value, CONFIG.EXTERNAL_LABEL, 'external staff show the partner label');
      _assertEqual(_epRow(epEmploymentRows(people[0], people, { canSalary: true }), 'ReportsTo').value, '', 'blank reports-to stays blank');
    },
  },
  {
    name: 'N-457 AC5 salary: UK only, formatted as the tracker formats it, left off entirely for a role that may not see pay',
    fn: function () {
      const people = _epFxPeople();
      _assertEqual(epSalaryText(people[1]), '£51,234.50', 'formatted');
      _assertEqual(epSalaryText(people[2]), '', 'non-UK blank');
      _assertEqual(epSalaryText({ Location: 'UK' }), '', 'no salary on record');
      _assertEqual(epSalaryText({ Location: 'UK', Salary: 0 }), '£0.00', 'zero is a salary, not blank');
      _assertEqual(_epKeys(epEmploymentRows(people[1], people, { canSalary: false })).includes('Salary'), false, 'no pay row without canSalary');
      _assertEqual(_epKeys(epEmploymentRows(people[1], people, {})).includes('Salary'), false, 'default is no pay row');
    },
  },
  {
    name: 'N-457 AC7 details rows: grouped in registry order, blanks stay blank; epHasDetails mirrors the Manage test',
    fn: function () {
      const D = CONFIG.MY_MOMENTUM.DETAILS;
      const row = { EmergencyName: ' Sam ', EmergencyPhone: '07700900123', AddressLine1: '1 High St' };
      const g = epDetailsRows(row, D.FIELDS, D.GROUPS);
      _assertEqual(g.map(x => x.group), Object.keys(D.GROUPS), 'group order');
      _assertEqual(g[0].rows.find(r => r.key === 'EmergencyName').value, 'Sam', 'trimmed');
      _assertEqual(g[0].rows.find(r => r.key === 'EmergencyRelationship').value, '', 'blank stays blank');
      _assertEqual(g.reduce((n, x) => n + x.rows.length, 0), D.FIELDS.length, 'every registry field appears once');
      _assertEqual([epHasDetails(null), epHasDetails({}), epHasDetails({ PersonalMobile: '  ' }), epHasDetails(row)], [false, false, false, true], 'has details');
    },
  },
  {
    name: 'N-457 AC1/AC13 tracker link: saved row links by id, pending row is plain text, every name escaped',
    fn: function () {
      const p = { id: 7, EmployeeName: 'A <b>b</b> & "c"' };
      const saved = employeeNameLinkHtml(p, false);
      _assertEqual(/data-act="[^"]*openEmployeePage[^"]*7/.test(saved), true, 'link calls openEmployeePage with the id');
      _assertEqual(saved.includes('<b>'), false, 'name escaped in the link');
      const pending = employeeNameLinkHtml(p, true);
      _assertEqual(pending, escHtml(p.EmployeeName), 'pending row: plain escaped text');
      _assertEqual(/<a /.test(pending), false, 'pending row: no link');
    },
  },
  {
    name: 'N-457 AC3/AC4/AC5/AC6/AC9/AC12/AC13 page markup: header, employment card, padlock, details shell per mode, escaping, no inline style or handler',
    fn: function () {
      const people = _epFxPeople();
      const mk = (mode, extra) => epPageHtml(Object.assign({ person: people[1], rows: epEmploymentRows(people[1], people, { canSalary: true }), canEdit: true, mode, salaryShown: false, payDenied: false, token: '3' }, extra));
      const admin = mk('view');
      _assertEqual(admin.includes('emp-details-body') && admin.includes('href="my-momentum.html#myDetails?person=2"'), true, 'view: details frame and Edit details link');
      _assertEqual(admin.includes('showEditPersonForm'), true, 'Edit employee for peopleEdit roles');
      _assertEqual(mk('view', { canEdit: false }).includes('showEditPersonForm'), false, 'no Edit employee for Leadership');
      const lead = mk('none', { canEdit: false });
      _assertEqual(lead.includes('emp-details') || lead.includes('myDetails') || lead.includes(CONFIG.EMPLOYEE_PAGE.TEXT.detailsTitle), false, 'none (Leadership): the details section is absent from the markup');
      const ghost = mk('ghost');
      _assertEqual(ghost.includes(escHtml(mdText('ghost'))) && !ghost.includes('myDetails?person'), true, 'ghost: fixed panel, no Edit link');
      _assertEqual(/id="emp-sal-masked" class=""/.test(admin) && /id="emp-sal-revealed" class="is-hidden"/.test(admin), true, 'salary masked by default');
      const shown = mk('view', { salaryShown: true });
      _assertEqual(/id="emp-sal-masked" class="is-hidden"/.test(shown) && /id="emp-sal-revealed" class=""/.test(shown), true, 'salary revealed state');
      _assertEqual(mk('view', { payDenied: true }).includes(escHtml(CONFIG.PEOPLE_PAY_DENIED_TEXT)), true, 'a denied pay read says so');
      const evil = Object.assign({}, people[1], { EmployeeName: 'X <img src=x onerror=1>', WorkEmail: 'a"><script>@mg.test' });
      const html = mk('view', { person: evil, rows: epEmploymentRows(evil, people, { canSalary: true }) });
      _assertEqual(/<img|<script/.test(html), false, 'names and emails render as text');
      _assertEqual(/\sstyle=|\son[a-z]+=/.test(admin + lead + ghost), false, 'no inline style or handler');
    },
  },
  {
    name: 'N-457 AC7 details body: cards and stamp; empty row and no row say so; a denied list is a misconfiguration, never "no details"; no work email note',
    fn: function () {
      const people = _epFxPeople();
      const T = CONFIG.EMPLOYEE_PAGE.TEXT;
      const row = { EmergencyName: 'Sam <b>x</b>', PersonalMobile: '07700900123', UpdatedAt: '2026-11-16T16:40:00Z', UpdatedBy: 'ann@mg.test', UpdatedOnBehalf: 'Yes' };
      const ok = epDetailsBodyHtml({ row, denied: false }, people[1], people);
      _assertEqual(ok.includes('Sam &lt;b&gt;x&lt;/b&gt;') && !ok.includes('<b>x'), true, 'values escaped');
      _assertEqual(ok.includes(escHtml(CONFIG.MY_MOMENTUM.DETAILS.GROUPS.emergency.title)) && ok.includes(escHtml(CONFIG.MY_MOMENTUM.DETAILS.GROUPS.address.title)), true, 'one card per group');
      _assertEqual(ok.includes('on behalf of the employee') && ok.includes(escHtml('Ann <b>Boss</b>')), true, 'stamp line: on-behalf wording and the name');
      _assertEqual(ok.includes(T.dash), true, 'blank values show a dash');
      _assertEqual(epDetailsBodyHtml({ row: null, denied: false }, people[1], people).includes(escHtml(T.noDetails)), true, 'no row');
      _assertEqual(epDetailsBodyHtml({ row: { PersonalMobile: '' }, denied: false }, people[1], people).includes(escHtml(T.noDetails)), true, 'empty row');
      const denied = epDetailsBodyHtml({ row: null, denied: true }, people[1], people);
      _assertEqual(denied.includes(escHtml(mdText('noAccessAdmin'))) && !denied.includes(escHtml(T.noDetails)), true, 'denied is reported, not shown as empty');
      _assertEqual(epDetailsBodyHtml({ row: null, denied: false }, people[2], people).includes(escHtml(mdText('noWorkEmailNote'))), true, 'person with no work email: the note');
      _assertEqual(epDetailsBodyHtml({ row, denied: false }, people[1], people).includes(escHtml(mdText('noWorkEmailNote'))), false, 'person with a work email: no note');
    },
  },
  {
    name: 'N-457 AC10 My Details hand-off: the preselect is Admin / People Ops only, cleared by use; the Back link escapes and survives "$&" in a name',
    fn: function () {
      const had = Object.prototype.hasOwnProperty.call(globalThis, '_mmResolvedRole');
      const old = globalThis._mmResolvedRole;
      try {
        globalThis._mmResolvedRole = 'admin';
        mdSetPreselect(7);
        _assertEqual(_mdPreselect, '7', 'admin keeps it');
        mdSetPreselect(null);
        _assertEqual(_mdPreselect, null, 'null clears it');
        ['leadership', 'staff', 'talent_partner', undefined].forEach(r => {
          globalThis._mmResolvedRole = r;
          mdSetPreselect(7);
          _assertEqual(_mdPreselect, null, 'role ' + r + ' ignores it');
        });
        globalThis._mmResolvedRole = 'people_ops';
        mdSetPreselect(9);
        _assertEqual(_mdPreselect, '9', 'people ops keeps it');
        mdSetPreselect(null);
      } finally {
        if (had) globalThis._mmResolvedRole = old; else delete globalThis._mmResolvedRole;
      }
      const back = mdBackHtml('Ann <b>$&</b>', 5);
      _assertEqual(back.includes('href="people.html#peopleTracker?action=record&amp;id=5"') || back.includes('href="people.html#peopleTracker?action=record&id=5"'), true, 'link to the record');
      _assertEqual(back.includes('Ann &lt;b&gt;$&amp;&lt;/b&gt;') && !back.includes('<b>'), true, 'name escaped and "$&" kept literally');
      _assertEqual([mdBackHtml('x', 0), mdBackHtml('x', 'abc'), mdBackHtml('x', ''), mdBackHtml('x', null)], ['', '', '', ''], 'no id, no link');
    },
  },
  {
    name: 'N-457 AC6/AC8/AC11/AC13/AC14 source checks: no writes, one gated read, safe logging, no storage, nothing in the other surfaces, script order',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('source text is only read by node tests/run.js');
      const page = _epSrc('employee-page.js');
      const logic = _epSrc('employee-logic.js');
      _assertEqual(/createItem|updateItem|deleteItem|graphRequest|fetch\(|saveMyDetails|ensureMyDetailsRow|clearMyDetailsRow|createMissingMyDetailsRows|fixMyDetailsEmails/.test(page + logic), false, 'AC8 no write, no raw Graph call, no row creation');
      _assertEqual((page.match(/getMyDetails\(/g) || []).length, 1, 'AC6 exactly one read of the details list');
      _assertEqual(page.indexOf("if (mode === 'view') _epLoadDetails(") > -1 && page.indexOf('getMyDetails(') > page.indexOf('async function _epLoadDetails'), true, 'AC6 the read sits in _epLoadDetails, called only for mode view');
      _assertEqual(/getMyDetails/.test(logic), false, 'AC6 the pure file never reads');
      _assertEqual(/localStorage|sessionStorage/.test(page + logic), false, 'AC13 nothing kept in browser storage');
      const consoles = page.split('\n').filter(l => /console\./.test(l));
      _assertEqual(consoles.length > 0 && consoles.every(l => /console\.warn\('N-457: [^']*', e && e\.message\)/.test(l)), true, 'AC13 every console call logs a fixed label and e.message only');
      _assertEqual(/^(let|var) /m.test(page.replace(/^let _epSeq.*$/m, '').replace(/^let _epSalaryShown.*$/m, '')), false, 'AC13 module state is the render token and the padlock only');
      _assertEqual(typeof _MD_GUARD_RE !== 'undefined' && _MD_GUARD_RE.test(logic), false, 'AC14 employee-logic.js never names the details list or its registry');
      const tracker = ALL_SOURCES['people-tracker.js'];
      _assertEqual(tracker.includes('<td>${employeeNameLinkHtml(p, pending)}</td>') && !tracker.includes('<td>${escHtml(p.EmployeeName)}</td>'), true, 'AC1 the tracker name cell is the link helper');
      _assertEqual((tracker.match(/employeeNameLinkHtml/g) || []).length, 1, 'AC1 only the name cell links');
      const mcp = (CONFIG.MCP.scripts || []).join(',') + ',' + (CONFIG.MCP.allowedLists || []).join(',');
      _assertEqual(/employee-(page|logic)|EMPLOYEE_PAGE|PeopleDetails/.test(mcp), false, 'AC14 not in the Newton for Claude bundle or lists');
      ['command-bar.js', 'api.js', 'mobile-app.js', 'mobile-people.js'].forEach(f => {
        _assertEqual(/openEmployeePage|employee-page|EMPLOYEE_PAGE|employeeNameLinkHtml/.test(ALL_SOURCES[f] || ''), false, 'AC14 ' + f + ' never references the record page');
      });
      _assertEqual(CONFIG.CACHE.persistentLists.includes('PeopleDetails') || CONFIG.DELTA.enrolledLists.includes('PeopleDetails'), false, 'AC14 the list is still out of the persistent cache and delta');
      const app = _epSrc('people-app.js');
      const rec = app.indexOf("get('action') === 'record'");
      _assertEqual(rec > -1 && app.indexOf('openEmployeePage(') > rec && app.indexOf('openEmployeePage(') < app.indexOf('navigateToPeople(page)'), true, 'AC11 the record deep link runs before the tracker render');
      const ph = ALL_HTML['people.html'] || '';
      const at = f => ph.indexOf('js/' + f + '"');
      _assertEqual(at('my-details-logic.js') > -1 && at('my-details-logic.js') < at('employee-logic.js') && at('employee-logic.js') < at('graph-client.js'), true, 'script order: employee-logic.js after my-details-logic.js, before graph-client.js');
      _assertEqual(at('people-tracker.js') > -1 && at('people-tracker.js') < at('employee-page.js') && at('api-my-details.js') < at('employee-page.js') && at('employee-page.js') < at('people-app.js'), true, 'script order: employee-page.js after people-tracker.js and api-my-details.js, before people-app.js');
      _assertEqual(/employee-(page|logic)\.js/.test((ALL_HTML['my-momentum.html'] || '') + (ALL_HTML['mobile.html'] || '')), false, 'the record page loads on people.html only');
      _assertEqual(_epSrc('my-momentum-app.js').includes("hit.tab === 'myDetails') mdSetPreselect(mmDeepLinkPerson(raw))"), true, 'AC10 the My Details tab hands the parameter on');
    },
  }
);