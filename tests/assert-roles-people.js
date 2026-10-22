// tests/assert-roles-people.js — role resolution/capabilities, internal staff/projects, respondent roles, role-id single source, router/Command Bar matrix, role-literal and internal-KPI lints.
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  {
    name: "_ROLE_COPY_FIELDS stays in sync with submitRoleForm's write set (N-150)",
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const { missingFromCopyFields, extraInCopyFields } = checkRoleFormFieldSync(
        ALL_SOURCES, _ROLE_COPY_FIELDS, _ROLE_RESET_FIELDS
      );
      _assertEqual(missingFromCopyFields, [], 'fields submitRoleForm writes that _ROLE_COPY_FIELDS/_ROLE_RESET_FIELDS does not account for');
      _assertEqual(extraInCopyFields, [], 'fields in _ROLE_COPY_FIELDS/_ROLE_RESET_FIELDS that submitRoleForm no longer writes');
    },
  },
  {
    name: 'FIELD_ALIASES entries have at least one consumer (N-175 — F-11b guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const found = checkAliasConsumers(ALL_SOURCES, FIELD_ALIASES);
      _assertEqual(
        found.map(v => `${v.list}.${v.internal} → ${v.display}`),
        [],
        'FIELD_ALIASES entries with no consumers found in js/'
      );
    },
  },
  {
    name: 'N-281 resolveRoleFromAssignments — precedence, whitelist, order-independence',
    fn: function () {
      const A = { AssignedRole: 'admin' }, AX = { AssignedRole: 'admin', Active: false };
      const DM = { AssignedRole: 'delivery_manager' }, TP = { AssignedRole: 'talent_partner' };
      _assertEqual(resolveRoleFromAssignments([A], false), 'admin', 'AC3a admin row');
      _assertEqual(resolveRoleFromAssignments([AX, DM], false), 'delivery_manager', 'AC3b inactive admin grants nothing');
      _assertEqual(resolveRoleFromAssignments([AX], true), 'leadership', 'AC3c inactive admin + leadership');
      _assertEqual(resolveRoleFromAssignments([DM, DM, A], false), 'admin', 'AC3d admin last');
      _assertEqual(resolveRoleFromAssignments([A, DM, DM], false), 'admin', 'AC3d admin first');
      _assertEqual(resolveRoleFromAssignments([TP, DM], false), 'delivery_manager', 'AC3d TP then DM');
      _assertEqual(resolveRoleFromAssignments([DM, TP], false), 'delivery_manager', 'AC3d DM then TP');
      _assertEqual(resolveRoleFromAssignments([A], true), 'admin', 'AC3e admin outranks leadership');
      _assertEqual(resolveRoleFromAssignments([{ AssignedRole: 'superuser' }], false), 'viewer', 'AC3f unknown role ignored');
      _assertEqual(resolveRoleFromAssignments([{ AssignedRole: 'leadership' }], false), 'viewer', 'AC3f leadership never from a row');
      _assertEqual(resolveRoleFromAssignments([{ AssignedRole: 'Admin ' }], false), 'viewer', 'AC3f near-miss admin string ignored');
      _assertEqual(resolveRoleFromAssignments([], false), 'viewer', 'AC3g no rows');
      _assertEqual(resolveRoleFromAssignments([], true), 'leadership', 'AC3g leadership only');
      _assertEqual(resolveRoleFromAssignments([{ AssignedRole: 'talent_partner', Active: false }], false), 'talent_partner', 'AC3h lower roles ignore Active');
      _assertEqual(resolveRoleFromAssignments(undefined, false), 'viewer', 'non-array input is safe');
      _assertEqual([A, AX, { AssignedRole: 'admin', Active: true }, TP, null].map(isAdminAssignment),
        [true, false, true, false, false], 'isAdminAssignment');
    },
  },
  {
    name: 'N-331 internal-staff roles — precedence, labels, config cross-checks',
    fn: function () {
      _assertEqual(CONFIG.ROLE_PRECEDENCE,
        ['admin', 'leadership', 'people_ops', 'sales', 'delivery_manager', 'talent_partner', 'staff', 'viewer'], 'AC1 precedence (N-326 D-7)');
      const known = r => CONFIG.ROLE_PRECEDENCE.includes(r);
      CONFIG.ROLE_PRECEDENCE.forEach(r => _assertEqual(typeof CONFIG.ROLE_LABELS[r], 'string', r + ' has a label'));
      CONFIG.ASSIGNABLE_ROLES.forEach(r => _assertEqual(known(r), true, 'assignable ' + r + ' is a known role'));
      CONFIG.ORG_WIDE_ROLES.forEach(r => _assertEqual(known(r), true, 'org-wide ' + r + ' is a known role'));
      _assertEqual(CONFIG.ASSIGNABLE_ROLES.includes('leadership'), false, 'leadership is never assignable');
      Object.keys(CONFIG.ROLE_CAPABILITIES).forEach(cap => {
        CONFIG.ROLE_CAPABILITIES[cap].forEach(r => _assertEqual(known(r), true, cap + ' role ' + r + ' is known'));
        _assertEqual(CONFIG.ROLE_CAPABILITIES[cap].includes('viewer'), false, cap + ' never grants viewer');
        _assertEqual(CONFIG.ROLE_CAPABILITIES[cap].includes('staff'), false, cap + ' never grants staff');
      });
      CONFIG.OS_MODULES.concat(CONFIG.COMMAND_BAR_PAGES).forEach(m =>
        m.roles.forEach(r => _assertEqual(known(r), true, m.key + ' role ' + r + ' is known')));
      const mod = k => CONFIG.OS_MODULES.find(m => m.key === k).roles;
      ['people_ops', 'sales', 'staff'].forEach(r => _assertEqual(mod('people').includes(r), true, 'People module has ' + r));
      _assertEqual(mod('sales').includes('sales'), true, 'Sales module has sales');
      ['people_ops', 'staff'].forEach(r => _assertEqual(mod('sales').includes(r), false, 'Sales module excludes ' + r));
      ['marketing', 'command'].forEach(k => ['people_ops', 'sales', 'staff'].forEach(r =>
        _assertEqual(mod(k).includes(r), false, k + ' excludes ' + r)));
      // N-365 (PT-5): People Ops reach Reporting for the Projects page (Project Team edits).
      _assertEqual(mod('reporting').includes('people_ops'), true, 'reporting has people_ops (N-365)');
      ['sales', 'staff'].forEach(r => _assertEqual(mod('reporting').includes(r), false, 'reporting excludes ' + r));
    },
  },
  {
    name: 'N-331 roleCan / isOrgWideRole — capability table, fails closed',
    fn: function () {
      const roles = ['admin', 'leadership', 'people_ops', 'sales', 'delivery_manager', 'talent_partner', 'staff', 'viewer'];
      const expect = {
        peopleFull:        ['admin', 'leadership', 'people_ops'],
        peopleEdit:        ['admin', 'people_ops'],
        engagementResults: ['admin', 'leadership', 'people_ops'],
        engagementAdmin:   ['admin', 'people_ops'],
        salesManage:       ['admin', 'leadership', 'sales'],
        projectTeamEdit:   ['admin', 'leadership', 'people_ops'],   // N-365
      };
      _assertEqual(Object.keys(CONFIG.ROLE_CAPABILITIES).sort(), Object.keys(expect).sort(), 'capability set');
      Object.keys(expect).forEach(cap => roles.forEach(r =>
        _assertEqual(roleCan(r, cap), expect[cap].includes(r), 'roleCan(' + r + ', ' + cap + ')')));
      _assertEqual(roleCan('admin', 'noSuchCap'), false, 'unknown cap');
      _assertEqual(roleCan('superuser', 'peopleFull'), false, 'unknown role');
      _assertEqual(roleCan(undefined, 'peopleFull'), false, 'undefined role');
      _assertEqual(roleCan('admin', undefined), false, 'undefined cap');
      _assertEqual(roleCan('admin', 'constructor'), false, 'prototype key is not a capability');
      _assertEqual(roleCan('admin', 'peopleFull', {}), false, 'cfg without ROLE_CAPABILITIES');
      _assertEqual(['admin', 'people_ops', 'sales', 'staff', 'leadership', 'delivery_manager', 'talent_partner', 'viewer', undefined].map(r => isOrgWideRole(r)),
        [true, true, true, true, false, false, false, false, false], 'isOrgWideRole');
    },
  },
  {
    name: 'N-331 resolveRoleFromAssignments — internal-staff roles, inactive org-wide rows grant nothing',
    fn: function () {
      const R = (role, active) => (active === undefined ? { AssignedRole: role } : { AssignedRole: role, Active: active });
      const res = resolveRoleFromAssignments;
      _assertEqual(res([R('people_ops')], false), 'people_ops', 'people_ops alone');
      _assertEqual(res([R('sales'), R('delivery_manager')], false), 'sales', 'sales outranks DM');
      _assertEqual(res([R('talent_partner'), R('staff')], false), 'talent_partner', 'TP outranks staff');
      _assertEqual(res([R('staff')], false), 'staff', 'staff alone');
      _assertEqual(res([R('people_ops'), R('sales')], false), 'people_ops', 'people_ops then sales');
      _assertEqual(res([R('sales'), R('people_ops')], false), 'people_ops', 'sales then people_ops');
      _assertEqual(res([R('people_ops', false)], false), 'viewer', 'A-2 inactive people_ops grants nothing');
      _assertEqual(res([R('sales', false), R('talent_partner')], false), 'talent_partner', 'A-2 inactive sales falls through to TP');
      _assertEqual(res([R('staff', false)], false), 'viewer', 'A-2 inactive staff grants nothing');
      _assertEqual(res([R('sales', true)], false), 'sales', 'Active true still grants');
      _assertEqual(res([R('talent_partner', false)], false), 'talent_partner', 'N-233 TP still ignores Active');
      _assertEqual(res([R('people_ops')], true), 'leadership', 'leadership outranks people_ops');
      _assertEqual(res([R('sales'), R('admin')], false), 'admin', 'admin outranks sales');
    },
  },
  {
    name: 'N-332 CONFIG.SURVEY_RESPONDENT_ROLES — respondent roles, helpers fail closed',
    fn: function () {
      _assertEqual(CONFIG.SURVEY_RESPONDENT_ROLES, ['talent_partner', 'delivery_manager', 'people_ops', 'sales', 'staff'], 'respondent roles');
      CONFIG.SURVEY_RESPONDENT_ROLES.forEach(r =>
        _assertEqual(CONFIG.ROLE_PRECEDENCE.includes(r), true, r + ' is in ROLE_PRECEDENCE'));
      const yes = ['talent_partner', 'delivery_manager', 'people_ops', 'sales', 'staff'];
      yes.forEach(r => {
        _assertEqual(isSurveyRespondentRole(r), true, 'isSurveyRespondentRole(' + r + ')');
      });
      ['admin', 'leadership', 'viewer', undefined, null, 'superuser', 'constructor'].forEach(r =>
        _assertEqual(isSurveyRespondentRole(r), false, 'isSurveyRespondentRole(' + String(r) + ')'));
      _assertEqual(isSurveyRespondentRole('sales', {}), false, 'cfg without SURVEY_RESPONDENT_ROLES');
    },
  },
  {
    name: 'N-332 isSurveyEligibleEmployee — all active People except CSD, internal staff included',
    fn: function () {
      const P = (level, extra) => Object.assign({ EmployeeName: 'X', IsActive: true, Level: level }, extra || {});
      const e = isSurveyEligibleEmployee;
      _assertEqual(CONFIG.SURVEY.EXCLUDED_LEVELS, ['CSD'], 'excluded levels');
      CONFIG.SURVEY.EXCLUDED_LEVELS.forEach(l =>
        _assertEqual(CONFIG.PEOPLE_LEVELS.includes(l), true, l + ' is in PEOPLE_LEVELS'));
      ['SDM', 'PTP', 'STP', 'TP'].forEach(l => _assertEqual(e(P(l)), true, l + ' counts'));
      _assertEqual(e(P('CSD')), false, 'CSD excluded');
      _assertEqual(e(P(undefined, { StaffType: 'Internal' })), true, 'internal staff (no Level) counts');
      _assertEqual(e(P('')), true, 'blank Level counts');
      _assertEqual(e(P('TP', { IsActive: false })), false, 'inactive excluded');
      _assertEqual(e(P('TP', { IsActive: undefined })), true, 'IsActive undefined (getPeople already filtered)');
      _assertEqual(e(P('TP', { IsPlaceholder: true })), false, 'placeholder excluded');
      _assertEqual(e(null), false, 'null');
      _assertEqual(e(undefined), false, 'undefined');
      _assertEqual(e(P('CSD'), {}), true, 'cfg without SURVEY.EXCLUDED_LEVELS excludes nothing');
    },
  },
  {
    name: 'N-332 no respondent-role literal left in survey-router.js, api-engagement.js or home.js',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const files = ['survey-router.js', 'api-engagement.js', 'home.js'];
      const hits = [];
      files.forEach(f => {
        _assertEqual(typeof ALL_SOURCES[f], 'string', f + ' is in ALL_SOURCES');
        // code lines only — comments may still name the roles in words
        const code = ALL_SOURCES[f].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
        if (/['"]delivery_manager['"]/.test(code)) hits.push(f);
      });
      _assertEqual(hits, [], 'files still hard-coding a respondent role');
    },
  },
  // ---- N-304: internal (non-deployable) staff ---------------------------------
  {
    name: 'N-304: isInternalStaff / isDeployablePerson / personRoleLabel',
    fn: function () {
      const I = CONFIG.STAFF_TYPE_INTERNAL, D = CONFIG.STAFF_TYPE_DEPLOYABLE;
      _assertEqual(isInternalStaff({ StaffType: I }), true, 'Internal');
      _assertEqual(isInternalStaff({ StaffType: D }), false, 'Deployable');
      _assertEqual(isInternalStaff({}), false, 'blank StaffType = Deployable');
      _assertEqual(isInternalStaff(null), false, 'null');
      _assertEqual(isBillableLevel(undefined), true, 'premise: a blank Level is billable, so the People-row check must not be isBillableLevel');
      _assertEqual(isDeployablePerson({ StaffType: I, StaffFunction: 'Sales' }), false, 'internal, blank Level');
      _assertEqual(isDeployablePerson({ StaffType: I, Level: 'TP' }), false, 'internal wins over a stray Level');
      _assertEqual(isDeployablePerson({ StaffType: D, Level: 'CSD' }), false, 'Deployable CSD');
      _assertEqual(isDeployablePerson({ StaffType: D, Level: 'TP' }), true, 'Deployable TP');
      _assertEqual(isDeployablePerson({ Level: 'TP' }), true, 'blank StaffType + TP');
      _assertEqual(isDeployablePerson(null), false, 'null');
      _assertEqual(personRoleLabel({ StaffType: I, StaffFunction: 'Marketing' }), 'Internal · Marketing', 'internal label');
      _assertEqual(personRoleLabel({ StaffType: I }), 'Internal · —', 'internal, missing function');
      _assertEqual(personRoleLabel({ Level: 'STP' }), 'STP', 'deployable label = Level');
      _assertEqual(personRoleLabel({}), '', 'no level');
      _assertEqual(CONFIG.STAFF_TYPES.includes(I) && CONFIG.STAFF_TYPES.includes(D), true, 'STAFF_TYPES holds both values');
      _assertEqual(typeof CONFIG.PROJECT_TYPE_COLOUR_VARS[I], 'string', 'STAFF_TYPE_INTERNAL is also a project-type colour key (Org Chart function bubbles)');
      _assertEqual(CONFIG.LIST_FIELDS.People.includes('StaffType') && CONFIG.LIST_FIELDS.People.includes('StaffFunction'), true, 'People projection carries StaffType + StaffFunction');
    },
  },
  {
    name: 'N-304: groupInternalByFunction / countInternalByFunction — config order, Unknown last, inactive / placeholder / deployable excluded',
    fn: function () {
      const I = CONFIG.STAFF_TYPE_INTERNAL;
      // Read the functions from config, never a hardcoded copy — the list is
      // Chris's to extend. Needs at least three; OFF_LIST is never one of them.
      _assertEqual(CONFIG.INTERNAL_FUNCTIONS.length >= 3, true, 'at least three internal functions configured');
      const [F1, F2, F3] = CONFIG.INTERNAL_FUNCTIONS;
      const OFF_LIST = 'zz-not-a-configured-function';
      _assertEqual(CONFIG.INTERNAL_FUNCTIONS.includes(OFF_LIST), false, 'OFF_LIST is not configured');
      const p = (name, fn, extra) => Object.assign({ EmployeeName: name, StaffType: I, StaffFunction: fn, IsActive: true }, extra);
      const people = [
        p('Zed', F2), p('Amy', F2), p('Bo', F3), p('Cy', ''), p('Di', F1, { IsActive: false }),
        p('Ed', F1, { IsPlaceholder: true }), { EmployeeName: 'Tp', Level: 'TP', IsActive: true }, p('Fi', OFF_LIST),
      ];
      _assertEqual(countInternalByFunction(people), [[F2, 2], [F3, 1], [OFF_LIST, 1], ['Unknown', 1]], 'counts');
      const g = groupInternalByFunction(people);
      _assertEqual(g.map(x => x[0]), [F1, F2, F3, OFF_LIST, 'Unknown'], 'grouping keeps inactive (the caller filters)');
      _assertEqual(g[1][1].map(x => x.EmployeeName), ['Amy', 'Zed'], 'members by name');
      _assertEqual(countInternalByFunction([]), [], 'none');
      _assertEqual(countInternalByFunction(undefined), [], 'undefined');
    },
  },
  {
    name: 'N-304: no People-row check calls isBillableLevel(p.Level) directly — use isDeployablePerson',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      const scan = src => {
        const hits = [];
        Object.keys(src).forEach(f => src[f].split('\n').forEach((line, i) => {
          if (/^\s*\/\//.test(line)) return;   // comments may name the old pattern
          if (/isBillableLevel\(\s*(p|person)\.Level\s*\)/.test(line) && !/!isInternalStaff\(p\)/.test(line)) hits.push(f + ':' + (i + 1));
        }));
        return hits;
      };
      _assertEqual(scan(ALL_SOURCES), [], 'People-row isBillableLevel calls');
      const bumped = Object.assign({}, ALL_SOURCES, { 'pages.js': ALL_SOURCES['pages.js'] + '\nconst _n = people.filter(p => isBillableLevel(p.Level));' });
      _assertEqual(scan(bumped).length, 1, 'mutation: a new People-row isBillableLevel call is flagged');
    },
  },
  // ── N-333: internal project excluded from client KPIs ─────────────────
  {
    name: 'N-333 CONFIG.PROJECT_TYPE_INTERNAL pinned; in PROJECT_TYPES (N-362); Sales Forecast drops it; projectFormTypes adds Internal last',
    fn: function () {
      _assertEqual(CONFIG.PROJECT_TYPE_INTERNAL, 'Internal', 'value');
      _assertEqual(CONFIG.PROJECT_TYPES.includes(CONFIG.PROJECT_TYPE_INTERNAL), true, 'in PROJECT_TYPES');
      _assertEqual(CONFIG.NON_REVENUE_PROJECT_TYPES.includes(CONFIG.PROJECT_TYPE_INTERNAL), true, 'in NON_REVENUE_PROJECT_TYPES');
      _assertEqual(salesForecastTypes(), ['Embedded', 'CoE', 'Exec Search', 'MG AI'], 'Sales Forecast dropdown has no Internal');
      _assertEqual(projectFormTypes(), ['Embedded', 'CoE', 'Exec Search', 'MG AI', 'Internal'], 'Project form options');
      _assertEqual(projectFormTypes() === projectFormTypes(), false, 'a fresh array each call');
    },
  },
  {
    name: 'N-333 isInternalProject / kpiExcludedProjectIdSet / kpiExcludedRoleIdSet (N-362 rename)',
    fn: function () {
      _assertEqual([null, {}, { ProjectType: 'Embedded' }, { ProjectType: 'Internal' }].map(isInternalProject), [false, false, false, true], 'isInternalProject');
      const projects = [{ id: 1, ProjectType: 'CoE' }, { id: 2, ProjectType: 'Internal', Status: 'Completed' }, { id: 3, ProjectType: 'Internal' }];
      _assertEqual([...kpiExcludedProjectIdSet(projects)], ['2', '3'], 'archived internal project included');
      _assertEqual(kpiExcludedProjectIdSet(undefined).size, 0, 'no projects');
      const roles = [{ id: 10, ProjectIDLookupId: 1 }, { id: 20, ProjectIDLookupId: '2' }, { id: 30, ProjectID: 3 }, null];
      _assertEqual([...kpiExcludedRoleIdSet(roles, projects)], ['20', '30'], 'via ProjectIDLookupId or ProjectID');
      _assertEqual(kpiExcludedRoleIdSet(roles, [{ id: 1, ProjectType: 'CoE' }]).size, 0, 'no internal project → empty');
    },
  },
  {
    name: 'N-333 excludeInternalProjectData — every key, role-keyed (not WeeklyActivity.ProjectID), fast path, no mutation, null pass-through, throws',
    fn: function () {
      const projects = [{ id: 1, ProjectType: 'Embedded' }, { id: 2, ProjectType: 'Internal' }];
      const roles = [{ id: 10, ProjectIDLookupId: 1 }, { id: 20, ProjectIDLookupId: 2 }, { id: 21, ProjectID: 2 }];
      const data = {
        projects,
        roles,
        // Row 1 is a CLIENT role with a wrong ProjectID copy; row 2 is internal
        // with a blank one — keyed by role, both land correctly.
        activity:   [{ id: 'a1', RoleIDLookupId: 10, ProjectIDLookupId: 2 }, { id: 'a2', RoleIDLookupId: 20, ProjectIDLookupId: null }, { id: 'a3', RoleID: 21 }],
        placements: [{ id: 'p1', RoleIDLookupId: 10 }, { id: 'p2', RoleIDLookupId: 21 }],
        rejections: [{ id: 'r1', RoleID: 10 }, { id: 'r2', RoleIDLookupId: 20 }],
        stageRows:  [{ id: 's1', RoleIDLookupId: 10 }, { id: 's2', RoleIDLookupId: 20 }],
        headcount:  [{ id: 'h1', RoleID: 10 }, { id: 'h2', RoleID: 21 }],
        historical: [{ id: 10, placementId: 'x1' }, { id: 20, placementId: 'x2' }],
      };
      const before = JSON.stringify(data);
      const out = excludeInternalProjectData(data, { projects });
      _assertEqual(Object.keys(out), Object.keys(data), 'same keys');
      _assertEqual(out.projects.map(p => p.id), [1], 'projects');
      _assertEqual(out.roles.map(r => r.id), [10], 'roles');
      _assertEqual(out.activity.map(r => r.id), ['a1'], 'activity by role, not ProjectID');
      _assertEqual(out.placements.map(r => r.id), ['p1'], 'placements');
      _assertEqual(out.rejections.map(r => r.id), ['r1'], 'rejections');
      _assertEqual(out.stageRows.map(r => r.id), ['s1'], 'stageRows');
      _assertEqual(out.headcount.map(r => r.id), ['h1'], 'headcount');
      _assertEqual(out.historical.map(r => r.placementId), ['x1'], 'historical');
      _assertEqual(JSON.stringify(data), before, 'inputs not mutated');
      _assertEqual(out.activity === data.activity, false, 'slow path returns new arrays');

      // Fast path: no internal project → the very same arrays.
      const client = [{ id: 1, ProjectType: 'Embedded' }];
      const fast = excludeInternalProjectData({ roles, activity: data.activity }, { projects: client });
      _assertEqual(fast.roles === roles && fast.activity === data.activity, true, 'fast path returns inputs as-is');

      // null / undefined pass through (degraded reads).
      const deg = excludeInternalProjectData({ roles, headcount: null, placements: undefined }, { projects });
      _assertEqual([deg.headcount, deg.placements, deg.roles.length], [null, undefined, 1], 'null passes through');

      // ctx.roles wins over data.roles: a filtered subset can't identify row 21.
      const sub = excludeInternalProjectData({ roles: [roles[0]], activity: data.activity }, { projects, roles });
      _assertEqual(sub.activity.map(r => r.id), ['a1'], 'ctx.roles maps rows outside data.roles');

      const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
      _assertEqual(throws(() => excludeInternalProjectData({ activty: [] }, { projects, roles })), true, 'unknown key throws');
      _assertEqual(throws(() => excludeInternalProjectData({ activity: [] }, { projects })), true, 'role-keyed rows with no roles throw');
      _assertEqual(throws(() => excludeInternalProjectData({ roles }, {})), true, 'missing ctx.projects throws');
      _assertEqual(throws(() => excludeInternalProjectData({ roles, activity: null }, { projects: client })), false, 'null role-keyed value needs no roles mapping');
    },
  },
  {
    name: 'N-333 every client-KPI consumer filters the internal project (lint-internal-kpi)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(
        lintInternalKpiConsumers(ALL_SOURCES, INTERNAL_KPI_CONSUMERS).map(v => `${v.file} ${v.fn}: ${v.problem}`),
        [],
        'client-KPI consumers missing the internal-project filter (see Readme → Internal project)'
      );
    },
  },
  {
    name: 'lint-internal-kpi control: flags a missing call, a renamed / duplicated function, a missing file; braces in strings and templates',
    fn: function () {
      const C = [{ file: 'a.js', fn: 'f', call: 'excludeInternalProjectData' }];
      const lint = src => lintInternalKpiConsumers(src, C).map(v => v.problem);
      _assertEqual(lint({ 'a.js': 'async function f(x = {}) {\n  const s = "}"; const t = `${ { a: 1 }.a }}`;\n  // }\n  return excludeInternalProjectData(x, {});\n}\n' }), [], 'call present, braces in string/template/comment ignored');
      _assertEqual(lint({ 'a.js': 'function f() {\n  return 1;\n}\nfunction g() { excludeInternalProjectData(); }\n' }), ['does not call excludeInternalProjectData()'], 'call in a different function does not count');
      _assertEqual(lint({ 'a.js': 'function g() { excludeInternalProjectData(); }\n' }), ['matched 0 function declarations (expected exactly 1)'], 'renamed');
      _assertEqual(lint({ 'a.js': 'function f() { excludeInternalProjectData(); }\nfunction f() {}\n' }), ['matched 2 function declarations (expected exactly 1)'], 'duplicated');
      _assertEqual(lint({ 'a.js': 'x.function f() {}\nconst y = 1;\n' }), ['matched 0 function declarations (expected exactly 1)'], 'member access is not a declaration');
      _assertEqual(lint({}), ['file not found'], 'missing file');
    },
  },
  // ── N-352 (R2-9): role constants single source ────────────────────────
  {
    name: 'N-352: CONFIG.ROLE_IDS values are exactly ROLE_PRECEDENCE, and every label key is a role id',
    fn: function () {
      const ids = Object.values(CONFIG.ROLE_IDS);
      _assertEqual(ids.slice().sort(), CONFIG.ROLE_PRECEDENCE.slice().sort(), 'ROLE_IDS values == ROLE_PRECEDENCE');
      _assertEqual(new Set(ids).size, ids.length, 'ROLE_IDS values are unique');
      Object.keys(CONFIG.ROLE_LABELS).forEach(k => _assertEqual(ids.includes(k), true, k + ' is a role id'));
    },
  },
  {
    name: 'N-352: router / Command Bar access matrix is unchanged (plain-string pin, evaluated from source)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Router sources need filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      // Deliberately plain strings: this pins today's behaviour independently of CONFIG.ROLE_IDS.
  const EXPECTED = {
    reporting: {
      companyDashboard: ['admin', 'leadership'],
      projectDashboard: ['admin', 'delivery_manager', 'talent_partner'],
      reportBuilder: ['admin', 'delivery_manager', 'talent_partner'],
      projects: ['admin', 'delivery_manager', 'leadership', 'people_ops', 'talent_partner'],
      roles: ['admin', 'delivery_manager', 'talent_partner'],
      activity: ['admin', 'delivery_manager', 'talent_partner'],
      placements: ['admin', 'delivery_manager', 'talent_partner'],
      rejections: ['admin', 'delivery_manager', 'talent_partner'],
      hiringPlan: ['admin', 'delivery_manager', 'leadership', 'talent_partner'],
      adminPanel: ['admin'],
    },
    marketing: {
      placementAnalytics: ['admin', 'delivery_manager', 'talent_partner'],
      marketReport: ['admin', 'delivery_manager', 'talent_partner'],
    },
    people: {
      peopleDashboard: ['admin', 'leadership', 'people_ops'],
      orgChart: ['admin', 'delivery_manager', 'leadership', 'people_ops', 'sales', 'staff', 'talent_partner'],
      peopleGantt: ['admin', 'leadership', 'people_ops'],
      peopleTracker: ['admin', 'leadership', 'people_ops'],
      gpInvoices: ['admin', 'leadership', 'people_ops'],
      scorecards: ['admin', 'delivery_manager', 'leadership', 'people_ops', 'talent_partner'],
      engagement: ['admin', 'leadership', 'people_ops'],
    },
    sales: {
      revenueTracking: ['admin', 'leadership', 'sales'],
      salesForecast: ['admin', 'leadership', 'sales'],
      lciModels: ['admin', 'delivery_manager', 'leadership', 'sales'],
      lciLeadMagnet: ['admin', 'leadership', 'sales'],
    },
    command: {
      overview: ['admin', 'leadership'],
    },
  };
  const LANDING = {
    people: {
      admin: 'peopleDashboard',
      leadership: 'peopleDashboard',
      people_ops: 'peopleDashboard',
      sales: 'orgChart',
      delivery_manager: 'scorecards',
      talent_partner: 'scorecards',
      staff: 'orgChart',
      viewer: null,
    },
    sales: {
      admin: 'revenueTracking',
      leadership: 'revenueTracking',
      people_ops: null,
      sales: 'revenueTracking',
      delivery_manager: 'lciModels',
      talent_partner: null,
      staff: null,
      viewer: null,
    },
  };
      const load = (file, expr) => new Function('CONFIG', ALL_SOURCES[file] + '\nreturn ' + expr + ';')(CONFIG);
      const matrix = pages => Object.keys(pages).reduce((m, k) => { m[k] = pages[k].roles.slice().sort(); return m; }, {});
      const actual = {
        reporting: matrix(load('router.js', 'PAGES')),
        marketing: matrix(load('mr-router.js', 'MR_PAGES')),
        people:    matrix(load('people-router.js', 'PEOPLE_PAGES')),
        sales:     matrix(load('sales-router.js', 'SALES_PAGES')),
        command:   matrix({ overview: load('cc-router.js', 'CC_PAGES')[0] }),
      };
      Object.keys(EXPECTED).forEach(mod => {
        Object.keys(EXPECTED[mod]).forEach(k => EXPECTED[mod][k].sort());
        _assertEqual(actual[mod], EXPECTED[mod], mod + ' page roles');
      });
      const ids = Object.values(CONFIG.ROLE_IDS);
      const cc = load('cc-router.js', 'ccCanAccess');
      _assertEqual(ids.filter(r => cc(r)).sort(), ['admin', 'leadership'], 'ccCanAccess');
      ids.forEach(r => {
        _assertEqual(load('people-router.js', 'getPeopleLandingPage')(r), LANDING.people[r], 'people landing for ' + r);
        _assertEqual(load('sales-router.js', 'getSalesLandingPage')(r), LANDING.sales[r], 'sales landing for ' + r);
      });
    },
  },
  {
    name: 'N-352: every router page has a Command Bar entry with the same roles (and vice versa)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Router sources need filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const load = (file, expr) => new Function('CONFIG', ALL_SOURCES[file] + '\nreturn ' + expr + ';')(CONFIG);
      const byModule = {
        reporting: load('router.js', 'PAGES'),
        marketing: load('mr-router.js', 'MR_PAGES'),
        people:    load('people-router.js', 'PEOPLE_PAGES'),
        sales:     load('sales-router.js', 'SALES_PAGES'),
        command:   { overview: load('cc-router.js', 'CC_PAGES')[0] },
      };
      Object.keys(byModule).forEach(mod => {
        const bar = CONFIG.COMMAND_BAR_PAGES.filter(p => p.module === mod);
        _assertEqual(bar.map(p => p.key).sort(), Object.keys(byModule[mod]).sort(), mod + ' page keys match the Command Bar');
        bar.forEach(p => _assertEqual(p.roles.slice().sort(), byModule[mod][p.key].roles.slice().sort(), mod + '/' + p.key + ' roles match the Command Bar'));
      });
    },
  },
  {
    name: 'no router or Command Bar page list types a role id (N-352 — lint-role-literals guard)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const found = lintRoleLiterals(ALL_SOURCES, Object.values(CONFIG.ROLE_IDS));
      _assertEqual(
        found.map(v => `${v.file}:${v.line}  ${v.text}`),
        [],
        'role id literals in router files / COMMAND_BAR_PAGES (use CONFIG.ROLE_IDS.*)'
      );
    },
  },
  {
    name: 'lint-role-literals control: flags router and Command Bar literals, ignores comments, keys and CONFIG.ROLE_IDS (N-352)',
    fn: function () {
      const roles = ['admin', 'leadership', 'talent_partner'];
      const lint = src => lintRoleLiterals(src, roles).map(v => `${v.file}:${v.line}`);
      _assertEqual(lint({ 'router.js': "const P = { a: { roles: ['admin'] } };\n" }), ['router.js:1'], 'single-quoted literal in a router');
      _assertEqual(lint({ 'cc-router.js': 'x();\nreturn role === "leadership";\n' }), ['cc-router.js:2'], 'double-quoted, correct line');
      _assertEqual(lint({ 'router.js': "// 'admin' was here\n/* 'leadership' */\nconst P = { roles: [CONFIG.ROLE_IDS.ADMIN] };\n" }), [], 'comments and CONFIG.ROLE_IDS are fine');
      const cfg = "x\n  COMMAND_BAR_PAGES: [\n    { key: 'leadership', module: 'admin', roles: ['admin', 'talent_partner'] },\n    { key: 'ok', roles: [_ROLE_IDS.ADMIN] },\n  ],\n  OTHER: ['admin'],\n";
      _assertEqual(lint({ 'config.js': cfg }), ['config.js:3', 'config.js:3'], 'only roles: [...] inside COMMAND_BAR_PAGES; key/module/OTHER ignored');
    },
  },
  // ── N-337: People photos load through Graph download URLs ────────────────
  {
    name: 'N-337 photoFileName — full URL, ?v= cache-bust, encoded and bare filenames, junk',
    fn: function () {
      _assertEqual(photoFileName('https://talentpoint.sharepoint.com/sites/SolutionsHubReporting/PeoplePhotos/person-1.png?v=1784901800'), 'person-1.png', 'full URL with ?v=');
      _assertEqual(photoFileName('https://talentpoint.sharepoint.com/sites/SolutionsHubReporting/PeoplePhotos/EM%201.png'), 'EM 1.png', 'encoded space in a full URL');
      _assertEqual(photoFileName('EM%201.png'), 'EM 1.png', 'encoded bare filename');
      _assertEqual(photoFileName('SWE 1.png'), 'SWE 1.png', 'bare filename with a space');
      _assertEqual(photoFileName('/person-2.jpg'), 'person-2.jpg', 'leading slash');
      _assertEqual(photoFileName('person-3.jpg#frag'), 'person-3.jpg', 'fragment');
      _assertEqual([photoFileName(''), photoFileName(null), photoFileName(undefined), photoFileName('   '), photoFileName('https://x.sharepoint.com/lib/'), photoFileName('https://x.sharepoint.com')],
        ['', '', '', '', '', ''], 'blank / unusable gives an empty string');
      _assertEqual(photoFileName('100%.png'), '100%.png', 'malformed % escape does not throw — kept raw');
    },
  },
  {
    name: 'N-337 buildPhotoUrlMap — keys by lower-cased name, skips folders and items with no download URL, tolerates junk input',
    fn: function () {
      const U = '@microsoft.graph.downloadUrl';
      const items = [
        { name: 'Person-1.PNG', file: {}, [U]: 'https://sp/a' },
        { name: 'sub', folder: {}, [U]: 'https://sp/folder' },
        { name: 'no-url.png', file: {} },
        { file: {}, [U]: 'https://sp/nameless' },
        null,
      ];
      const map = buildPhotoUrlMap(items);
      _assertEqual(Array.from(map.keys()), ['person-1.png'], 'only the usable file, lower-cased');
      _assertEqual(map.get('person-1.png'), 'https://sp/a', 'download URL kept');
      _assertEqual([buildPhotoUrlMap(undefined).size, buildPhotoUrlMap([]).size, buildPhotoUrlMap('x').size], [0, 0, 0], 'empty / junk input gives an empty Map');
    },
  },
  {
    name: 'N-337 photoMapFresh — true inside the TTL, false at or after it, with no build time, or if the clock went backwards',
    fn: function () {
      const ttl = CONFIG.PHOTO_URL_TTL_MS;
      _assertEqual(photoMapFresh(1000, 1000 + ttl - 1, ttl), true, 'just inside');
      _assertEqual(photoMapFresh(1000, 1000 + ttl, ttl), false, 'at the TTL');
      _assertEqual(photoMapFresh(null, 5000, ttl), false, 'never built');
      _assertEqual(photoMapFresh(5000, 1000, ttl), false, 'clock went backwards');
      _assertEqual(ttl > 0 && ttl < 60 * 60 * 1000, true, 'TTL stays below the ~1 h life of a download URL');
    },
  },
  {
    name: 'N-337 wiring — no PhotoUrl feeds an <img src>; the four consumers render data-photo and hydrate; upload clears the map; PDF export waits; people.css hides a src-less avatar',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const srcFed = s => /<img[^>]*\ssrc=['"]\$\{[^}]*PhotoUrl/.test(s);
      // Positive control: the check must flag the two old markup shapes and pass the new one.
      _assertEqual(srcFed('`<img src="${escAttr(p.PhotoUrl)}" alt="">`'), true, 'control: tracker shape');
      _assertEqual(srcFed("`<img src='${escHtml(existingData.PhotoUrl)}' alt=''>`"), true, 'control: form shape');
      _assertEqual(srcFed('`<img data-photo="${escAttr(photoFileName(p.PhotoUrl))}" alt="">`'), false, 'control: new shape passes');
      const strip = f => _vendorStripJsComments(ALL_SOURCES[f]).join('\n');
      Object.keys(ALL_SOURCES).forEach(f => {
        _assertEqual(srcFed(strip(f)), false, f + ' must not put PhotoUrl in an <img src> (use data-photo + hydratePhotoImgs, N-337)');
      });
      ['org-chart.js', 'people-tracker.js', 'people-forms.js', 'os-admin.js'].forEach(f => {
        const s = strip(f);
        _assertEqual(/data-photo=/.test(s) && /photoFileName\(/.test(s), true, f + ' renders data-photo from photoFileName()');
        _assertEqual(/hydratePhotoImgs\(/.test(s), true, f + ' calls hydratePhotoImgs()');
      });
      const oc = strip('org-chart.js');
      _assertEqual(oc.indexOf('_ocPhotoSrc') === -1, true, 'org-chart.js: _ocPhotoSrc is gone');
      _assertEqual(/async function exportOrgChartPdf[\s\S]*?await _ocPhotosReady/.test(oc), true, 'exportOrgChartPdf waits for the photos');
      const up = strip('api.js').match(/async function uploadPeoplePhoto[\s\S]*?\n}/);
      _assertEqual(!!up && up[0].indexOf('_photoMapInvalidate()') !== -1, true, 'uploadPeoplePhoto clears the photo map');
      _assertEqual(/\.org-avatar--img:not\(\[src\]\)\s*\{\s*visibility:\s*hidden/.test(ALL_CSS['people.css']), true, 'people.css hides an org avatar that has no src yet');
    },
  },
  {
    name: 'N-375 orgSubtreePeopleCount — unique real people beneath a node',
    fn: function () {
      const P = (name, kids, extra) => Object.assign({ kind: 'person', _key: 'p:' + name, children: kids || [] }, extra);
      const bubble = (kids) => ({ kind: 'project', children: kids });
      const dup = P('ana');
      const csd = { kind: 'csd', _key: 'p:csd', children: [
        bubble([P('sdm1', [dup, P('bo')])]),
        bubble([P('sdm2', [P('ana'), P('tbh', [], { _placeholder: true })])]),
      ] };
      _assertEqual(orgSubtreePeopleCount(csd), 4, 'sdm1, sdm2, ana (once across two bubbles), bo — placeholder and the CSD itself excluded');
      const leader = { kind: 'leader', _key: 'l:x@mg.com', children: [csd, { kind: 'leader', _key: 'l:p:csd', children: [] },
        { kind: 'function', children: [P('ops')] }] };
      _assertEqual(orgSubtreePeopleCount(leader), 7, 'leader counts CSD, nested leader (own namespace), function-bubble staff');
      _assertEqual(orgSubtreePeopleCount(bubble([P('x'), P('x')])), 1, 'bubble walked, not counted; duplicate key once');
      _assertEqual(orgSubtreePeopleCount(P('leaf')), 0, 'leaf');
      _assertEqual(orgSubtreePeopleCount(null), 0, 'null');
      _assertEqual(orgSubtreePeopleCount({ kind: 'csd', _key: 'p:c', children: [P('only', [], { _placeholder: true })] }), 0, 'placeholders only');
    },
  },
  {
    name: 'N-375 org chart collapse wiring — config-driven, actions registered, collapsed ul hidden',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      _assertEqual(CONFIG.ORG_COLLAPSIBLE_KINDS, ['leader', 'csd', 'person'], 'collapsible kinds (bubbles excluded, D-1)');
      const oc = _vendorStripJsComments(ALL_SOURCES['org-chart.js']).join('\n');
      _assertEqual(/CONFIG\.ORG_COLLAPSIBLE_KINDS\.includes\(n\.kind\)/.test(oc), true, 'renderTreeHtml reads ORG_COLLAPSIBLE_KINDS');
      _assertEqual(/orgSubtreePeopleCount\(n\)/.test(oc), true, 'count comes from the shared utils.js function');
      const reg = oc.match(/registerActions\(\{[\s\S]*?\}\);/);
      ['ocToggleNode', 'ocToggleNodeKey', 'ocSetAllCollapsed'].forEach(a =>
        _assertEqual(!!reg && new RegExp('\\b' + a + '\\b').test(reg[0]), true, a + ' registered'));
      _assertEqual(/li\.org-collapsed\s*>\s*ul\s*\{\s*display:\s*none/.test(ALL_CSS['people.css']), true, 'people.css hides a collapsed node\'s child ul');
    },
  }
);
