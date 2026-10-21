// tests/assert-project-types.js — one project-type enum + no-dashboard types (N-362).
// Loads AFTER tests/assertions.js and pushes this domain's entries into ASSERTIONS.

ASSERTIONS.push(
  {
    name: 'N-362 config — one PROJECT_TYPES enum; NO_DASHBOARD_PROJECT_TYPES is LCI + Transformation; old lists gone',
    fn: function () {
      _assertEqual(CONFIG.PROJECT_TYPES, ['Embedded', 'CoE', 'Transformation', 'LCI', 'Exec Search', 'MG AI', 'Internal'], 'AC1 enum + order');
      _assertEqual(CONFIG.ASSIGNMENT_PROJECT_TYPES, undefined, 'AC1 ASSIGNMENT_PROJECT_TYPES retired');
      _assertEqual(CONFIG.PROJECT_TEAM.DEFERRED_PROJECT_TYPES, undefined, 'AC1 DEFERRED_PROJECT_TYPES retired');
      _assertEqual(CONFIG.NO_DASHBOARD_PROJECT_TYPES, ['LCI', 'Transformation'], 'AC2 list');
      CONFIG.NO_DASHBOARD_PROJECT_TYPES.forEach(t => _assertEqual(CONFIG.PROJECT_TYPES.includes(t), true, 'AC2 ' + t + ' in PROJECT_TYPES'));
      _assertEqual(CONFIG.NO_DASHBOARD_PROJECT_TYPES.includes(CONFIG.PROJECT_TYPE_INTERNAL), false, 'AC2 Internal has a dashboard');
      _assertEqual(CONFIG.NO_DASHBOARD_PROJECT_TYPES.includes('CoE'), false, 'AC10 CoE gates (Hiring Plan, RB panel, LCI link) never match a no-dashboard type');
      CONFIG.SPLIT_FEE_PROJECT_TYPES.forEach(t => _assertEqual(CONFIG.NO_DASHBOARD_PROJECT_TYPES.includes(t), false, 'AC2 split-fee type ' + t));
    },
  },
  {
    name: 'N-362 isNoDashboardType / isNoDashboardProject / isKpiExcludedProject / dashboardProjects',
    fn: function () {
      const types = CONFIG.PROJECT_TYPES;
      _assertEqual(types.map(isNoDashboardType), [false, false, true, true, false, false, false], 'AC3 per type');
      _assertEqual([null, undefined, '', 'Bogus'].map(isNoDashboardType), [false, false, false, false], 'AC3 null-safe');
      _assertEqual([null, {}, { ProjectType: 'LCI' }, { ProjectType: 'CoE' }].map(isNoDashboardProject), [false, false, true, false], 'AC3 project');
      _assertEqual(types.map(t => isKpiExcludedProject({ ProjectType: t })), [false, false, true, true, false, false, true], 'AC3 KPI-excluded = internal OR no-dashboard');
      _assertEqual(isKpiExcludedProject(null), false, 'AC3 null');
      const ps = [{ id: 1, ProjectType: 'CoE' }, { id: 2, ProjectType: 'LCI' }, { id: 3, ProjectType: 'Internal' }, { id: 4, ProjectType: 'Transformation' }];
      _assertEqual(dashboardProjects(ps).map(p => p.id), [1, 3], 'AC3 dashboardProjects keeps Internal (it has a dashboard)');
      _assertEqual(dashboardProjects(null), [], 'AC3 null → []');
      _assertEqual(isInternalProject({ ProjectType: 'LCI' }), false, 'A-1 isInternalProject unchanged');
    },
  },
  {
    name: 'N-362 salesForecastTypes / projectFormTypes',
    fn: function () {
      _assertEqual(salesForecastTypes(), ['Embedded', 'CoE', 'Exec Search', 'MG AI'], 'AC4 Sales Forecast dropdown unchanged');
      _assertEqual(projectFormTypes(), ['Embedded', 'CoE', 'Exec Search', 'MG AI', 'Internal'], 'AC5 form options (dormant)');
      _assertEqual(projectFormTypes('LCI'), ['Embedded', 'CoE', 'Exec Search', 'MG AI', 'Internal', 'LCI'], 'AC5 existing LCI project keeps its type');
      _assertEqual(projectFormTypes('CoE'), ['Embedded', 'CoE', 'Exec Search', 'MG AI', 'Internal'], 'AC5 no duplicate');
      _assertEqual(projectFormTypes() === projectFormTypes(), false, 'a fresh array each call');
      _assertEqual(salesForecastTypes() === salesForecastTypes(), false, 'a fresh array each call');
    },
  },
  {
    name: 'N-362 excludeInternalProjectData also drops no-dashboard projects (and their rows); fast path when none',
    fn: function () {
      const projects = [
        { id: 1, ProjectType: 'CoE' }, { id: 2, ProjectType: 'LCI' },
        { id: 3, ProjectType: 'Transformation' }, { id: 4, ProjectType: 'Internal' },
      ];
      const roles = [
        { id: 10, ProjectIDLookupId: 1 }, { id: 20, ProjectIDLookupId: 2 },
        { id: 30, ProjectID: 3 }, { id: 40, ProjectIDLookupId: 4 },
      ];
      const data = {
        projects, roles,
        activity:   [{ id: 'a1', RoleIDLookupId: 10 }, { id: 'a2', RoleIDLookupId: 20 }, { id: 'a3', RoleID: 30 }, { id: 'a4', RoleID: 40 }],
        placements: [{ id: 'p1', RoleIDLookupId: 10 }, { id: 'p2', RoleIDLookupId: 20 }],
        rejections: [{ id: 'r1', RoleID: 10 }, { id: 'r2', RoleID: 30 }],
        headcount:  [{ id: 'h1', RoleID: 10 }, { id: 'h2', RoleID: 40 }],
      };
      const before = JSON.stringify(data);
      const out = excludeInternalProjectData(data, { projects });
      _assertEqual(out.projects.map(p => p.id), [1], 'AC6 only the CoE project survives');
      _assertEqual(out.roles.map(r => r.id), [10], 'AC6 roles');
      _assertEqual(out.activity.map(r => r.id), ['a1'], 'AC6 activity');
      _assertEqual(out.placements.map(r => r.id), ['p1'], 'AC6 placements');
      _assertEqual(out.rejections.map(r => r.id), ['r1'], 'AC6 rejections');
      _assertEqual(out.headcount.map(r => r.id), ['h1'], 'AC6 headcount');
      _assertEqual(JSON.stringify(data), before, 'AC6 no mutation');
      const clean = { projects: [{ id: 1, ProjectType: 'CoE' }], roles: [{ id: 10, ProjectIDLookupId: 1 }], activity: [{ id: 'a1', RoleIDLookupId: 10 }] };
      const same = excludeInternalProjectData(clean, { projects: clean.projects });
      _assertEqual(same.activity === clean.activity && same.projects === clean.projects, true, 'AC6 fast path: arrays returned as-is');
      _assertEqual([...kpiExcludedProjectIdSet(projects)], ['2', '3', '4'], 'AC6 id set');
      _assertEqual([...kpiExcludedRoleIdSet(roles, projects)], ['20', '30', '40'], 'AC6 role id set');
    },
  },
  {
    name: 'N-362 projectHasChecklist — false for no-dashboard types, true otherwise',
    fn: function () {
      _assertEqual(CONFIG.PROJECT_TYPES.map(projectHasChecklist), [true, true, false, false, true, true, true], 'AC11 per type');
      _assertEqual([projectHasChecklist(''), projectHasChecklist(null), projectHasChecklist(undefined)], [true, true, true], 'AC11 blank type keeps the default checklist');
    },
  },
  {
    name: 'N-362 lint-project-types — no call site compares a project type directly',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(
        lintProjectTypeCompares(ALL_SOURCES, PROJECT_TYPE_LINT_ALLOW).map(v => `${v.file}:${v.line} ${v.problem}`),
        [],
        'direct project-type comparisons (use isNoDashboardType / isKpiExcludedProject / isInternalProject — see Readme → Project types)'
      );
      _assertEqual(PROJECT_TYPE_LINT_ALLOW.length, 1, 'AC12 exactly one allowlisted site (org-chart.js)');
    },
  },
  {
    name: 'lint-project-types control: flags each comparison shape, ignores comments / StaffType / CoE, reports a stale allowlist entry',
    fn: function () {
      const lint = (src, allow) => lintProjectTypeCompares(src, allow || []).map(v => v.problem.split(':')[0]);
      const F = 'compares a project type directly';
      _assertEqual(lint({ 'a.js': "const x = p.ProjectType === 'LCI';\n" }), [F], 'AC12 planted === LCI is flagged');
      _assertEqual(lint({ 'a.js': "if (a.ProjectType !== \"Transformation\") {}\n" }), [F], 'double quotes, !==');
      _assertEqual(lint({ 'a.js': "if ('Internal' == r?.ProjectType) {}\n" }), [F], 'reversed operands');
      _assertEqual(lint({ 'a.js': "if (p.ProjectType === CONFIG.PROJECT_TYPE_INTERNAL) {}\n" }), [F], 'CONFIG.PROJECT_TYPE_INTERNAL compare');
      _assertEqual(lint({ 'a.js': "if (['LCI', 'Transformation'].includes(a.ProjectType)) {}\n" }), [F], 'literal array includes');
      _assertEqual(lint({ 'a.js': "const l = CONFIG.NO_DASHBOARD_PROJECT_TYPES;\n" }), [F], 'raw list outside utils.js');
      _assertEqual(lint({ 'a.js': "// p.ProjectType === 'LCI'\n/* a.ProjectType !== 'Internal' */\nconst s = 'x';\n" }), [], 'comments ignored');
      _assertEqual(lint({ 'a.js': "if (s.StaffType === 'Internal') {}\nif (p.ProjectType === 'CoE') {}\nif (p.ProjectType === t) {}\n" }), [], 'StaffType, CoE and variables are not flagged');
      _assertEqual(lint({ 'utils.js': "return p.ProjectType === CONFIG.PROJECT_TYPE_INTERNAL;\n", 'config.js': "NO_DASHBOARD_PROJECT_TYPES: ['LCI'],\n" }), [], 'utils.js and config.js are exempt');
      const allow = [{ file: 'a.js', contains: "p.ProjectType === 'LCI'", reason: 'test' }];
      _assertEqual(lint({ 'a.js': "if (p.ProjectType === 'LCI') {}\n" }, allow), [], 'allowlisted site passes');
      _assertEqual(lint({ 'a.js': "const ok = 1;\n" }, allow), ['stale allowlist entry (no longer matches)'], 'stale allowlist entry is reported');
      _assertEqual(lintProjectTypeCompares({ 'a.js': "x\ny\nif (p.ProjectType === 'LCI') {}\n" }, [])[0].line, 3, 'line number');
    },
  }
);