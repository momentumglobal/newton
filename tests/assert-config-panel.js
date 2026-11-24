// tests/assert-config-panel.js — N-530 Config Panel for Delivery Managers: the pure rules
// (permissions.js), the capability table, and source guards for the async, DOM-bound parts
// (admin.js, checklist-admin.js, api-access.js, api-checklists.js) that need Graph or a DOM.
// Loads AFTER tests/assertions.js (ASSERTIONS + shared helpers).

// Body of the function starting at `sig` in js/<file>, up to its closing "\n}\n".
function _cpBody(file, sig) {
  const src = String((typeof ALL_SOURCES !== 'undefined' && ALL_SOURCES[file]) || '').replace(/\r\n/g, '\n');
  const i = src.indexOf(sig);
  if (i < 0) return '';
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j < 0 ? undefined : j);
}
function _cpNeedSources() {
  if (typeof ALL_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js.');
}

const _CP_TABS = ['departments', 'delete', 'snapshots', 'checklists', 'slaTargets', 'pdp', 'onboarding'];
const _CP_LISTS = ['Projects', 'Roles', 'WeeklyActivity', 'Placements', 'RejectedOffers'];
const _CP_OTHERS = ['leadership', 'people_ops', 'sales', 'talent_partner', 'staff', 'viewer', undefined, null, ''];

ASSERTIONS.push(
  {
    name: 'N-530 AC1-AC3 configPanelTabs — Admin all seven, DM three in panel order, everyone else none',
    fn: function () {
      _assertEqual(configPanelTabs('admin', _CP_TABS), _CP_TABS, 'admin sees every tab');
      _assertEqual(configPanelTabs('delivery_manager', _CP_TABS), ['departments', 'delete', 'checklists'], 'DM tabs');
      _CP_OTHERS.forEach(r => _assertEqual(configPanelTabs(r, _CP_TABS), [], 'no tabs for ' + r));
      _assertEqual(configPanelTabs('delivery_manager', null), [], 'bad tab list');
      _assertEqual(configPanelTabs('delivery_manager', ['snapshots', 'slaTargets', 'pdp', 'onboarding']), [], 'DM never gets an Admin-only tab');
      _assertEqual(configPanelTabs('admin', _CP_TABS) !== _CP_TABS, true, 'returns a copy');
      _assertEqual(canUseConfigPanel('admin'), true, 'admin');
      _assertEqual(canUseConfigPanel('delivery_manager'), true, 'DM');
      _CP_OTHERS.forEach(r => _assertEqual(canUseConfigPanel(r), false, 'not ' + r));
    },
  },
  {
    name: 'N-530 AC1-AC2 router + Command Bar — adminPanel is Admin and Delivery Manager only',
    fn: function () {
      const cb = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'adminPanel');
      _assertEqual(cb.roles, ['admin', 'delivery_manager'], 'Command Bar');
      _cpNeedSources();
      const router = String(ALL_SOURCES['router.js']).replace(/\r\n/g, '\n');
      const line = (router.match(/^ *adminPanel: .*$/m) || [''])[0];
      _assertEqual(/ROLE_IDS\.ADMIN, CONFIG\.ROLE_IDS\.DELIVERY_MANAGER\]/.test(line) && !/TALENT_PARTNER|LEADERSHIP|PEOPLE_OPS|SALES|STAFF/.test(line), true, 'router adminPanel roles');
    },
  },
  {
    name: 'N-530 AC4 adminDeleteLists — Admin all five, DM the four without Projects, others none',
    fn: function () {
      _assertEqual(adminDeleteLists('admin', _CP_LISTS), _CP_LISTS, 'admin');
      _assertEqual(adminDeleteLists('delivery_manager', _CP_LISTS), ['Roles', 'WeeklyActivity', 'Placements', 'RejectedOffers'], 'DM');
      _assertEqual(adminDeleteLists('delivery_manager', ['Projects']), [], 'DM never gets Projects');
      _assertEqual(adminDeleteLists('delivery_manager', ['People', 'UserAssignments']), [], 'DM gets no other list');
      _CP_OTHERS.forEach(r => _assertEqual(adminDeleteLists(r, _CP_LISTS), [], 'none for ' + r));
      _assertEqual(adminDeleteLists('admin', undefined), [], 'bad list');
    },
  },
  {
    name: 'N-530 AC8 checklistEditTypes / canSwitchChecklists — DM edits Project and Role only; only Admin switches',
    fn: function () {
      _assertEqual(checklistEditTypes('admin'), CONFIG.CHECKLISTS.RECORD_TYPES, 'admin: every type, onboarding included');
      _assertEqual(checklistEditTypes('delivery_manager'), CONFIG.CHECKLISTS.SWITCH_TYPES, 'DM: project + role');
      _assertEqual(checklistEditTypes('delivery_manager').includes(CONFIG.ONBOARDING.RECORD_TYPE), false, 'DM never onboarding');
      _CP_OTHERS.forEach(r => _assertEqual(checklistEditTypes(r), [], 'none for ' + r));
      _assertEqual(canSwitchChecklists('admin'), true, 'admin switches');
      ['delivery_manager'].concat(_CP_OTHERS).forEach(r => _assertEqual(canSwitchChecklists(r), false, 'no switch for ' + r));
      _assertEqual(hasFullConfigPanel('admin'), true, 'admin full');
      _assertEqual(hasFullConfigPanel('delivery_manager'), false, 'DM not full');
    },
  },
  {
    name: 'N-530 AC4 adminDeleteRecordProjectId — Roles directly, Activity / Placements / Rejections through their role, null when unresolvable',
    fn: function () {
      const roles = { 11: { id: 11, ProjectIDLookupId: '5' }, 12: { id: 12, ProjectID: 7 }, 13: { id: 13 } };
      _assertEqual(adminDeleteRecordProjectId('Roles', { ProjectIDLookupId: '5' }, roles), '5', 'role row');
      _assertEqual(adminDeleteRecordProjectId('Roles', { ProjectID: 9 }, roles), '9', 'role row ProjectID fallback');
      ['WeeklyActivity', 'Placements', 'RejectedOffers'].forEach(l => {
        _assertEqual(adminDeleteRecordProjectId(l, { RoleIDLookupId: '11' }, roles), '5', l + ' via RoleIDLookupId');
        _assertEqual(adminDeleteRecordProjectId(l, { RoleID: 12 }, roles), '7', l + ' via RoleID, role ProjectID fallback');
        _assertEqual(adminDeleteRecordProjectId(l, { RoleIDLookupId: '13' }, roles), null, l + ' role with no project');
        _assertEqual(adminDeleteRecordProjectId(l, { RoleIDLookupId: '99' }, roles), null, l + ' unknown role');
        _assertEqual(adminDeleteRecordProjectId(l, {}, roles), null, l + ' no role id');
        _assertEqual(adminDeleteRecordProjectId(l, { RoleIDLookupId: '11' }, null), null, l + ' no role map');
      });
      _assertEqual(adminDeleteRecordProjectId('Roles', { ProjectIDLookupId: '0' }, roles), null, 'zero project');
      _assertEqual(adminDeleteRecordProjectId('Roles', { ProjectIDLookupId: 'abc' }, roles), null, 'junk project');
      _assertEqual(adminDeleteRecordProjectId('Roles', {}, roles), null, 'blank project');
      _assertEqual(adminDeleteRecordProjectId('Projects', { ProjectIDLookupId: '5' }, roles), null, 'Projects has no project id here');
      _assertEqual(adminDeleteRecordProjectId('People', { ProjectIDLookupId: '5' }, roles), null, 'unknown list');
      _assertEqual(adminDeleteRecordProjectId('Roles', null, roles), null, 'null record');
      _assertEqual(adminDeleteRecordProjectId('Placements', { RoleIDLookupId: 'constructor' }, roles), null, 'prototype key is not a role');
    },
  },
  {
    name: 'N-530 AC4-AC6 canDeleteAdminRecord — Admin any; DM only the four lists on a writable project; fails closed',
    fn: function () {
      const w = ['5', '8'];
      _assertEqual(canDeleteAdminRecord('admin', 'Projects', null, null), true, 'admin Projects, no project id');
      _assertEqual(canDeleteAdminRecord('admin', 'Roles', '99', []), true, 'admin ignores the scope');
      ['Roles', 'WeeklyActivity', 'Placements', 'RejectedOffers'].forEach(l => {
        _assertEqual(canDeleteAdminRecord('delivery_manager', l, '5', w), true, 'DM ' + l + ' in scope');
        _assertEqual(canDeleteAdminRecord('delivery_manager', l, 8, w), true, 'DM ' + l + ' numeric id');
        _assertEqual(canDeleteAdminRecord('delivery_manager', l, '6', w), false, 'DM ' + l + ' out of scope');
        _assertEqual(canDeleteAdminRecord('delivery_manager', l, null, w), false, 'DM ' + l + ' unresolved project');
        _assertEqual(canDeleteAdminRecord('delivery_manager', l, '5', []), false, 'DM ' + l + ' empty scope');
        _assertEqual(canDeleteAdminRecord('delivery_manager', l, '5', null), false, 'DM ' + l + ' null scope is not "every project"');
        _assertEqual(canDeleteAdminRecord('delivery_manager', l, '5', undefined), false, 'DM ' + l + ' missing scope');
        _assertEqual(canDeleteAdminRecord('delivery_manager', l, '0', ['0']), false, 'DM ' + l + ' project 0');
      });
      _assertEqual(canDeleteAdminRecord('delivery_manager', 'Projects', '5', w), false, 'DM never deletes a Project');
      _assertEqual(canDeleteAdminRecord('delivery_manager', 'People', '5', w), false, 'DM unknown list');
      _assertEqual(canDeleteAdminRecord('delivery_manager', '', '5', w), false, 'blank list');
      _CP_OTHERS.forEach(r => _assertEqual(canDeleteAdminRecord(r, 'Roles', '5', w), false, 'not ' + r));
    },
  },
  {
    name: 'N-530 AC3-AC6 admin.js — gate, tab clamp, list filter, fresh checks before every delete and add',
    fn: function () {
      _cpNeedSources();
      const adm = String(ALL_SOURCES['admin.js']).replace(/\r\n/g, '\n');
      _assertEqual(/!canUseConfigPanel\(role\)/.test(_cpBody('admin.js', 'async function renderAdminPage()')), true, 'page gate');
      _assertEqual(/role !== 'admin'/.test(adm), false, 'no Admin literal gate left');
      const tab = _cpBody('admin.js', 'async function renderAdminTab(');
      _assertEqual(/configPanelTabs\(_resolvedRole, ADMIN_PANEL_TABS\)/.test(tab) && /if \(!tabs\.includes\(tab\)\) tab = tabs\[0\]/.test(tab), true, 'tab bar from configPanelTabs, stale tab clamped');
      _assertEqual(tab.indexOf('configPanelTabs') < tab.indexOf('_adminTab = tab'), true, '_adminTab is set after the clamp');
      _assertEqual(/adminDeleteLists\(_resolvedRole, Object\.keys\(DELETE_LIST_CONFIG\)\)/.test(_cpBody('admin.js', 'async function buildDeleteTab()')), true, 'delete options from adminDeleteLists');
      const load = _cpBody('admin.js', 'async function loadDeleteItems(');
      _assertEqual(/adminDeleteLists\(_resolvedRole, \[listName\]\)/.test(load) && /getUserWritableProjectIds\(/.test(load), true, 'list guard + writable scope');
      _assertEqual((load.match(/\.filter\(i => inScope\(i/g) || []).length, 4, 'Roles, Activity, Placements, Rejected Offers each filtered');
      const del = _cpBody('admin.js', 'async function confirmDelete()');
      _assertEqual(del.indexOf('checkAdminDelete(list, id)') > -1 && del.indexOf('checkAdminDelete(list, id)') < del.indexOf('await deleteItem('), true, 'checkAdminDelete runs before deleteItem');
      _assertEqual(/if \(!gate\.ok\) throw new Error\(gate\.reason\)/.test(del), true, 'a refusal stops the delete');
      const rm = _cpBody('admin.js', 'async function deleteAdminRecord(');
      _assertEqual(/listName !== 'Departments'\) return/.test(rm) && rm.indexOf("checkConfigPanelCapability('configFunctionalAreas')") < rm.indexOf('await deleteItem('), true, 'Remove: Departments only, fresh check first');
      const add = _cpBody('admin.js', 'async function submitDepartment()');
      _assertEqual(add.indexOf("checkConfigPanelCapability('configFunctionalAreas')") > -1 && add.indexOf("checkConfigPanelCapability('configFunctionalAreas')") < add.indexOf("createItem('Departments'"), true, 'Add: fresh check first');
    },
  },
  {
    name: 'N-530 AC5 api-access.js — checkAdminDelete / checkConfigPanelCapability fail closed, ghost-aware, Admin unchanged',
    fn: function () {
      _cpNeedSources();
      const c = _cpBody('api-access.js', 'async function checkAdminDelete(');
      _assertEqual(/getEffectiveRole\(email\)/.test(c) && /hasFullConfigPanel\(role\)\) return \{ ok: true/.test(c), true, 'fresh ghost-aware role; Admin passes');
      _assertEqual(/catch \(e\)[\s\S]*CONFIG_PANEL_CHECK_FAILED/.test(c), true, 'a read error refuses');
      _assertEqual(/ADMIN_DELETE_OUT_OF_SCOPE/.test(c) && /getUserWritableProjectIds\(email\)/.test(c) && /canDeleteAdminRecord\(/.test(c), true, 'scope from the writable projects');
      _assertEqual(/getItem\(listName, id\)/.test(c) && /getItem\('Roles', rid\)/.test(c), true, 'record and role read fresh (uncached getItem)');
      const k = _cpBody('api-access.js', 'async function checkConfigPanelCapability(');
      _assertEqual(/roleCan\(role, cap\)/.test(k) && /catch \(e\)[\s\S]*CONFIG_PANEL_CHECK_FAILED/.test(k), true, 'capability check fails closed');
    },
  },
  {
    name: 'N-530 AC8 checklist editor — DM gets no switch cards, no Onboarding; every template write and the switch re-check fresh',
    fn: function () {
      _cpNeedSources();
      const adm = String(ALL_SOURCES['checklist-admin.js']).replace(/\r\n/g, '\n');
      _assertEqual(/function _ckaEditTypes\(\) \{\n  return checklistEditTypes\(_resolvedRole\);\n\}/.test(adm), true, '_ckaEditTypes reads the pure rule');
      _assertEqual(/canSwitchChecklists\(_resolvedRole\) \? `<p class="admin-tab-intro">/.test(adm), true, 'switch cards behind canSwitchChecklists');
      _assertEqual(/_ckaBusy \|\| !canSwitchChecklists\(_resolvedRole\)/.test(_cpBody('checklist-admin.js', 'async function ckaToggleSwitch(')), true, 'toggle refuses a non-Admin');
      _assertEqual(/if \(!_ckaEditTypes\(\)\.includes\(_ckType\)\)/.test(_cpBody('checklist-admin.js', 'async function buildChecklistsTab()')), true, 'stale Onboarding selection reset for a DM');
      const api = String(ALL_SOURCES['api-checklists.js']).replace(/\r\n/g, '\n');
      _assertEqual(/async function createChecklistItem\(fields\) \{\n  await _ckAssertCanEdit\(\(fields \|\| \{\}\)\.RecordType\);/.test(api), true, 'create gated');
      _assertEqual(/async function updateChecklistItem\(id, fields\) \{\n  await _ckAssertCanEdit\(\(fields \|\| \{\}\)\.RecordType, id\);/.test(api), true, 'update gated');
      _assertEqual(/async function deleteChecklistItem\(id\) \{\n  await _ckAssertCanEdit\(undefined, id\);/.test(api), true, 'delete gated');
      _assertEqual(/canSwitchChecklists\(await getEffectiveRole\(getCurrentUser\(\)\.email\)\)/.test(_cpBody('api-checklists.js', 'async function setChecklistSettings(')), true, 'switch-on writes Admin only');
      const g = _cpBody('api-checklists.js', 'async function _ckAssertCanEdit(');
      _assertEqual(/hasFullConfigPanel\(role\)\) return/.test(g) && /checklistEditTypes\(role\)\.includes\(type\)/.test(g) && /CONFIG_PANEL_CHECK_FAILED/.test(g), true, 'Admin passes; DM by record type; read error refuses');
    },
  }
);
