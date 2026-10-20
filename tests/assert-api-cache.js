// tests/assert-api-cache.js — _pickFields, tier-2 _ss* cache, persistentLists, BATCH, DELTA, WeeklyActivity read/create path.
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  {
    name: '_pickFields — whitelists keys and drops undefined/null even when whitelisted',
    fn: function () {
      const { obj, keys } = FIXTURES.lci2.pickFields;
      _assertEqual(_pickFields(obj, keys), { A: 1, D: 5 }, '_pickFields');
    },
  },
  // ── N-176 (F-3a): two-tier cache key/stamp helpers ──────────────────
  // These are the PURE helpers only. _ssGet/_ssSet/_ssPurge touch
  // sessionStorage, which does not exist in the Node harness, so they are
  // covered by the live QA checks in the ticket's QA doc instead.
  {
    name: 'N-176 _ssKey — embeds prefix, current APP_BUILD and the tier-1 cache key',
    fn: function () {
      _assertEqual(
        _ssKey('Projects', '', '*'),
        CONFIG.CACHE.prefix + '|' + CONFIG.APP_BUILD + '|' + _cacheKey('Projects', '', '*'),
        '_ssKey composition'
      );
      _assertEqual(_ssKey('Projects', '', '*').split('|')[1], CONFIG.APP_BUILD, '_ssKey build segment');
      _assertEqual(_ssKey('Projects', '', '*').split('|')[2], 'Projects', '_ssKey list segment');
    },
  },
  {
    name: 'N-176 _ssIsCacheKey — matches only our prefix, never another feature\'s keys',
    fn: function () {
      _assertEqual(_ssIsCacheKey(_ssKey('People', '', '*')), true, 'own key');
      _assertEqual(_ssIsCacheKey('newton_role_a@b.com'), false, 'role cache key');
      _assertEqual(_ssIsCacheKey('newton_dm_grants_a@b.com'), false, 'dm grants key');
      _assertEqual(_ssIsCacheKey('newton_ghost_user'), false, 'ghost key');
      _assertEqual(_ssIsCacheKey('newton_force_desktop'), false, 'force-desktop key');
      _assertEqual(_ssIsCacheKey('newton_survey_uuid'), false, 'survey key');
      _assertEqual(_ssIsCacheKey(null), false, 'null');
    },
  },
  {
    name: 'N-176 _ssKeyBuild — a stamp mismatch is detectable',
    fn: function () {
      const current = _ssKey('Projects', '', '*');
      const stale = CONFIG.CACHE.prefix + '|OLD-BUILD|Projects||*';
      _assertEqual(_ssKeyBuild(current), CONFIG.APP_BUILD, 'current stamp');
      _assertEqual(_ssKeyBuild(stale) !== CONFIG.APP_BUILD, true, 'stale stamp differs');
      _assertEqual(_ssKeyBuild('newton_role_a@b.com'), null, 'foreign key has no stamp');
    },
  },
  {
    name: 'N-176 _ssKeyMatchesList — targets one list, any build; null matches all ours',
    fn: function () {
      const projects = _ssKey('Projects', '', '*');
      const projectsFiltered = _ssKey('Projects', "fields/Status eq 'Active'", 'Id,Title');
      const people = _ssKey('People', '', '*');
      const staleProjects = CONFIG.CACHE.prefix + '|OLD-BUILD|Projects||*';
      _assertEqual(_ssKeyMatchesList(projects, 'Projects'), true, 'exact list');
      _assertEqual(_ssKeyMatchesList(projectsFiltered, 'Projects'), true, 'same list, different filter');
      _assertEqual(_ssKeyMatchesList(staleProjects, 'Projects'), true, 'same list, older build');
      _assertEqual(_ssKeyMatchesList(people, 'Projects'), false, 'different list');
      _assertEqual(_ssKeyMatchesList(projects, null), true, 'null purges all ours');
      _assertEqual(_ssKeyMatchesList('newton_role_a@b.com', null), false, 'null still spares foreign keys');
    },
  },
  {
    name: 'N-176/N-177 CONFIG.CACHE — fully configured, five lists enrolled',
    fn: function () {
      _assertEqual(Array.isArray(CONFIG.CACHE.persistentLists), true, 'persistentLists is an array');
      // N-176 asserted this was 0 (engine inert). N-177 enrolled six reference
      // lists; N-266a added ChecklistTemplates (seven). N-282 took the two
      // identity/access lists (UserAssignments, LeadershipAccess) back off
      // tier 2 — sessionStorage is user-writable — leaving five.
      _assertEqual(CONFIG.CACHE.persistentLists.length, 5, 'N-177 four + N-266a ChecklistTemplates (N-282 removed two)');
      _assertEqual(typeof CONFIG.APP_BUILD === 'string' && CONFIG.APP_BUILD.length > 0, true, 'APP_BUILD set');
      _assertEqual(typeof CONFIG.CACHE.ttlMs, 'number', 'ttlMs');
      _assertEqual(typeof CONFIG.CACHE.maxEntryBytes, 'number', 'maxEntryBytes');
      _assertEqual(typeof CONFIG.CACHE.prefix, 'string', 'prefix');
      _assertEqual(CONFIG.CACHE.prefix.indexOf('|'), -1, 'prefix must not contain the key separator');
      _assertEqual(CONFIG.APP_BUILD.indexOf('|'), -1, 'APP_BUILD must not contain the key separator');
    },
  },
  // ── N-177 (F-3b): enrolment set + role-cache stamping ───────────────
  {
    name: 'N-177 persistentLists — exactly the five reference lists (N-282: no identity/access lists)',
    fn: function () {
      _assertEqual([...CONFIG.CACHE.persistentLists].sort(),
        ['ChecklistTemplates', 'Departments', 'LCILocations', 'People', 'Projects'],
        'enrolment set');
    },
  },
  {
    name: 'N-177 persistentLists — no transactional list is enrolled',
    fn: function () {
      ['Roles', 'WeeklyActivity', 'Placements', 'Assignments', 'RoleHistory', 'ChecklistProgress'].forEach(function (l) {
        _assertEqual(CONFIG.CACHE.persistentLists.includes(l), false, l + ' must never be enrolled');
      });
    },
  },
  {
    name: 'N-177 _ssEnabled — true for the five, false for the transactional six and the identity lists (N-282)',
    fn: function () {
      // _ssEnabled() returns false whenever sessionStorage is absent, which it
      // is under Node (tests/run.js). Skipping is honest; asserting here would
      // report a meaningless PASS on the storage guard rather than on
      // enrolment. Runs for real in tests/index.html.
      if (typeof sessionStorage === 'undefined') _skip('no sessionStorage under Node — run tests/index.html for this one');
      ['Projects', 'People', 'Departments', 'LCILocations', 'ChecklistTemplates']
        .forEach(function (l) { _assertEqual(_ssEnabled(l), true, l + ' enrolled'); });
      ['Roles', 'WeeklyActivity', 'Placements', 'Assignments', 'RoleHistory', 'ChecklistProgress', 'UserAssignments', 'LeadershipAccess']
        .forEach(function (l) { _assertEqual(_ssEnabled(l), false, l + ' not enrolled'); });
    },
  },
  // ── N-186 (F-13a): delta sync engine — pure helpers only ────────────
  // _deltaSync/_deltaEntryGet/_deltaEntrySet touch sessionStorage and Graph,
  // which don't exist (or can't be faked cheaply) in the Node harness — same
  // reasoning as the tier-2 _ssGet/_ssSet/_ssPurge exclusion above. Covered
  // by the live QA checks in the ticket's QA doc instead.
  {
    name: 'N-188 CONFIG.BATCH — shape and defaults',
    fn: function () {
      _assertEqual(typeof CONFIG.BATCH.enabled, 'boolean', 'enabled flag present');
      _assertEqual(CONFIG.BATCH.maxSubRequests, 20, "Graph's documented per-$batch sub-request limit");
    },
  },
  {
    name: 'N-188 _batchEnabled — follows CONFIG.BATCH.enabled, false when the block is missing entirely',
    fn: function () {
      _assertEqual(_batchEnabled(), CONFIG.BATCH.enabled, 'tracks the live config value');
      const saved = CONFIG.BATCH;
      CONFIG.BATCH = undefined;
      _assertEqual(_batchEnabled(), false, 'defensive false, not a throw, if BATCH is ever absent');
      CONFIG.BATCH = saved;
    },
  },
  {
    name: 'N-186/N-187 CONFIG.DELTA — configured with exactly two enrolled lists',
    fn: function () {
      _assertEqual(Array.isArray(CONFIG.DELTA.enrolledLists), true, 'enrolledLists is an array');
      _assertEqual([...CONFIG.DELTA.enrolledLists].sort(), ['Placements', 'WeeklyActivity'], 'N-186 + N-187 enrol exactly these two');
      _assertEqual(typeof CONFIG.DELTA.enabled, 'boolean', 'enabled flag present');
    },
  },
  {
    name: 'N-186/N-187 _deltaEnabled — true only for the two enrolled lists, with sessionStorage available',
    fn: function () {
      if (typeof sessionStorage === 'undefined') _skip('no sessionStorage under Node — run tests/index.html for this one');
      _assertEqual(_deltaEnabled('WeeklyActivity'), true, 'enrolled since N-186');
      _assertEqual(_deltaEnabled('Placements'), true, 'enrolled since N-187');
      _assertEqual(_deltaEnabled('RejectedOffers'), false, 'shares getRejectedOffers()\'s identical filter shape but is deliberately NOT enrolled — not named in F-13\'s scope');
      _assertEqual(_deltaEnabled('Projects'), false, 'a tier-2 list is not delta-enrolled');
    },
  },
  {
    name: 'N-186 _deltaKey — stable, list-scoped, no filter/select component',
    fn: function () {
      _assertEqual(_deltaKey('WeeklyActivity'), 'newton_delta_WeeklyActivity', 'key shape');
      _assertEqual(_deltaKey('WeeklyActivity') === _deltaKey('WeeklyActivity'), true, 'deterministic — same list, same key, no filter/select inputs');
    },
  },
  {
    name: 'N-186 _deltaEntryUsable — a well-formed current-build entry is usable',
    fn: function () {
      const entry = { ts: Date.now(), build: CONFIG.APP_BUILD, deltaLink: '/sites/x/lists/y/items/delta?token=abc', items: [] };
      _assertEqual(_deltaEntryUsable(entry), true, 'well-formed');
    },
  },
  {
    name: 'N-186 _deltaEntryUsable — rejects a foreign build, a missing/empty deltaLink, and non-array items',
    fn: function () {
      const base = { ts: Date.now(), build: CONFIG.APP_BUILD, deltaLink: '/x', items: [] };
      _assertEqual(_deltaEntryUsable({ ...base, build: 'SOME-OTHER-BUILD' }), false, 'foreign build');
      _assertEqual(_deltaEntryUsable({ ...base, deltaLink: '' }), false, 'empty deltaLink');
      _assertEqual(_deltaEntryUsable({ ...base, deltaLink: undefined }), false, 'missing deltaLink');
      _assertEqual(_deltaEntryUsable({ ...base, items: 'not-an-array' }), false, 'items not an array');
      _assertEqual(_deltaEntryUsable(null), false, 'null');
      _assertEqual(_deltaEntryUsable(undefined), false, 'undefined');
      _assertEqual(_deltaEntryUsable([]), false, 'array itself is not a valid entry shape');
      _assertEqual(_deltaEntryUsable({ ts: Date.now(), build: CONFIG.APP_BUILD, deltaLink: '/x' }), false, 'missing items entirely');
    },
  },
  {
    name: 'N-186 _deltaMerge — upsert of a new id, replace of an existing id, removal via @removed',
    fn: function () {
      const baseline = [
        { id: '1', ProjectID: 100 },
        { id: '2', ProjectID: 200 },
      ];
      const page = [
        { id: '2', fields: { ProjectID: 201 } },
        { id: '3', fields: { ProjectID: 300 } },
        { id: '1', '@removed': { reason: 'deleted' } },
      ];
      const merged = _deltaMerge(baseline, page, 'WeeklyActivity');
      _assertEqual(merged === baseline, true, '_deltaMerge mutates and returns the same array it was given');
      _assertEqual(merged.length, 2, 'one removed, one replaced, one added = 2 remaining');
      _assertEqual(merged.find(function (i) { return i.id === '1'; }), undefined, 'id 1 removed');
      _assertEqual(merged.find(function (i) { return i.id === '2'; }).ProjectID, 201, 'id 2 replaced in place');
      _assertEqual(merged.find(function (i) { return i.id === '3'; }).ProjectID, 300, 'id 3 upserted');
    },
  },
  {
    name: 'N-271 _deltaEligibleCall — only the default projection may use the delta store',
    fn: function () {
      _assertEqual(_deltaEligibleCall('', null), true, 'AC22 default read');
      _assertEqual(_deltaEligibleCall('', undefined), true, 'AC22 select omitted');
      _assertEqual(_deltaEligibleCall('', 'Id'), false, 'AC22 id-only row count must not touch the store');
      _assertEqual(_deltaEligibleCall('', 'Id,Title'), false, 'AC22 any explicit select');
      _assertEqual(_deltaEligibleCall('fields/RoleID eq 1', null), false, 'AC22 filtered');
      _assertEqual(_deltaEligibleCall('fields/RoleID eq 1', 'Id'), false, 'AC22 filtered and explicit select');
    },
  },
  {
    name: 'N-271 weeklyActivityRowsUsable — an id-only (projected) result is not usable',
    fn: function () {
      _assertEqual(weeklyActivityRowsUsable([]), true, 'AC23 empty');
      _assertEqual(weeklyActivityRowsUsable(null), true, 'AC23 null');
      _assertEqual(weeklyActivityRowsUsable([{ id: '1' }, { id: '2' }]), false, 'AC23 id-only');
      _assertEqual(weeklyActivityRowsUsable([{ id: '1' }, { id: '2', RoleIDLookupId: '5' }]), true, 'AC23 one row with a role key');
      _assertEqual(weeklyActivityRowsUsable([{ id: '1', RoleID: '7' }]), true, 'AC23 RoleID fallback');
    },
  },
  // ── N-315: WeeklyActivity.ProjectID can no longer drop a row ──────────
  {
    name: 'N-315 getWeeklyActivity opts.roleIds — RoleID OR-chain, unfiltered above ROLE_ID_FILTER_MAX, empty set reads nothing',
    fn: function () {
      // getWeeklyActivity reaches getItems synchronously (before any await).
      const saved = getItems;
      const calls = [];
      getItems = function (list, filter) { calls.push([list, filter]); return Promise.resolve([]); };
      try {
        getWeeklyActivity(null, null, { roleIds: [3, '1', 3] });
        _assertEqual(calls[0], ['WeeklyActivity', '(fields/RoleID eq 3 or fields/RoleID eq 1)'], 'AC3 OR-chain, de-duplicated');
        getWeeklyActivity(null, null, { roleIds: [5], sinceWeeks: 13 });
        _assertEqual(/^\(fields\/RoleID eq 5\) and fields\/WeekEndingDate ge '\d{4}-\d{2}-\d{2}'$/.test(calls[1][1]), true, 'AC3 and-joined with the date window: ' + calls[1][1]);
        const many = [];
        for (let i = 1; i <= CONFIG.ROLE_ID_FILTER_MAX + 1; i++) many.push(i);
        getWeeklyActivity(null, null, { roleIds: many });
        _assertEqual(calls[2], ['WeeklyActivity', ''], 'AC3 above the cap the clause is dropped (over-fetch)');
        getWeeklyActivity(null, null, { roleIds: [7, null] });
        _assertEqual(calls[3], ['WeeklyActivity', ''], 'AC3 an unusable id drops the clause, never filters role 0');
        const before = calls.length;
        getWeeklyActivity(null, null, { roleIds: [] });
        _assertEqual(calls.length, before, 'empty role set → no read at all (not an unfiltered fetch)');
        getWeeklyActivity(null, 9);
        _assertEqual(calls[calls.length - 1], ['WeeklyActivity', 'fields/RoleID eq 9'], 'single-role branch unchanged');
      } finally {
        getItems = saved;
      }
      // Over-fetch + the callers' client-side role-id filter gives the same rows.
      const rows = [{ id: 1, RoleIDLookupId: '3' }, { id: 2, RoleIDLookupId: '99' }, { id: 3, RoleID: 4 }];
      const ids = new Set(['3', '4']);
      _assertEqual(rows.filter(a => ids.has(String(a.RoleIDLookupId)) || ids.has(String(a.RoleID))).map(r => r.id), [1, 3], 'AC3 client filter keeps only project roles');
    },
  },
  {
    name: 'N-315 project-scoped callers pass roleIds, never a project id, and keep a client role filter (AC1)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const dc = ALL_SOURCES['dashboard-core.js'], rb = ALL_SOURCES['report-builder.js'];
      _assertEqual(/getWeeklyActivity\(\s*projectId/.test(dc), false, 'dashboard-core: no project-id activity read');
      _assertEqual(dc.includes('getWeeklyActivity(null, null, { roleIds })'), true, 'dashboard-core: role-id scoped read');
      _assertEqual(dc.includes('activity.filter(a => projectRoleIds.has('), true, 'dashboard-core: client-side role backstop');
      _assertEqual(/getWeeklyActivity\(\s*_rbProjectId/.test(rb), false, 'report-builder: no project-id activity read');
      _assertEqual(rb.includes('getWeeklyActivity(null, null, { roleIds: allRoles.map(r => r.id) })'), true, 'report-builder: role-id scoped read');
      _assertEqual(rb.includes('activity.filter(a => ids.has('), true, 'report-builder: client-side role filter kept');
    },
  },
  {
    name: 'N-315 positiveLookupId / projectIdForRole / weeklyActivityResponseProjectId',
    fn: function () {
      _assertEqual([12, '12', ' 7 ', 0, -1, 1.5, NaN, null, undefined, '', 'x'].map(positiveLookupId),
        [12, 12, 7, null, null, null, null, null, null, null, null], 'positiveLookupId');
      _assertEqual(projectIdForRole({ id: 1, ProjectIDLookupId: '4' }), 4, 'LookupId first');
      _assertEqual(projectIdForRole({ id: 1, ProjectID: 6 }), 6, 'ProjectID fallback');
      _assertEqual(projectIdForRole({ id: 1 }), null, 'role with no project');
      _assertEqual(projectIdForRole(null), null, 'no role');
      _assertEqual(weeklyActivityResponseProjectId({ id: '9', fields: { ProjectIDLookupId: '4' } }), 4, 'response carries it');
      _assertEqual(weeklyActivityResponseProjectId({ id: '9', fields: { Title: '' } }), null, 'fields but no ProjectID → null (dropped)');
      _assertEqual(weeklyActivityResponseProjectId({ id: '9' }), undefined, 'no fields object → undefined (unknown, re-read)');
      _assertEqual(weeklyActivityResponseProjectId(null), undefined, 'no response');
    },
  },
  {
    name: 'N-315 createWeeklyActivity — copies fields, sends the form project id, derives from the role when missing',
    fn: function () {
      // Both paths reach their first Graph helper synchronously (before any await).
      const saved = { getItem, createItem };
      const calls = [];
      getItem = function (list, id) { calls.push(['getItem', list, id]); return new Promise(function () {}); };
      createItem = function (list, f) { calls.push(['create', list, f]); return new Promise(function () {}); };
      try {
        const desk = { ProjectIDLookupId: 7, RoleIDLookupId: 45, Hires: 1 };
        createWeeklyActivity(desk);
        _assertEqual(calls[0][0] + '|' + calls[0][1], 'create|WeeklyActivity', 'desktop: straight to create, no role read');
        _assertEqual(calls[0][2].ProjectIDLookupId, 7, 'desktop: form project id sent');
        _assertEqual(calls[0][2] !== desk, true, 'fields copied, not passed through');
        _assertEqual(desk, { ProjectIDLookupId: 7, RoleIDLookupId: 45, Hires: 1 }, 'caller fields not mutated');
        calls.length = 0;
        const mobile = { RoleIDLookupId: 45 };
        createWeeklyActivity(mobile);
        _assertEqual(calls, [['getItem', 'Roles', 45]], 'mobile (no ProjectID): role read first, nothing written yet');
        calls.length = 0;
        createWeeklyActivity({ ProjectIDLookupId: NaN, RoleIDLookupId: '45' });
        _assertEqual(calls, [['getItem', 'Roles', 45]], 'NaN project id is treated as missing');
      } finally {
        getItem = saved.getItem; createItem = saved.createItem;
      }
    },
  },
  {
    name: 'N-315 verify path — one heal PATCH, one Diagnostics report, response checked before any re-read (AC6)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      // The orchestration is async and this runner is sync, so its shape is
      // pinned from source; every decision it makes is a pure helper tested here.
      const api = ALL_SOURCES['api.js'];
      const start = api.indexOf('async function _verifyWeeklyActivityProjectId(');
      _assertEqual(start > -1, true, '_verifyWeeklyActivityProjectId exists');
      const body = api.slice(start, api.indexOf('\n}\n', start));
      const count = re => (body.match(re) || []).length;
      _assertEqual(count(/updateItem\('WeeklyActivity'/g), 1, 'exactly one heal PATCH, no loop');
      _assertEqual(/\b(for|while)\s*\(/.test(body), false, 'no retry loop');
      _assertEqual(count(/reportError\(/g), 1, 'exactly one Diagnostics report');
      _assertEqual(body.indexOf('if (response === sentId) return;') < body.indexOf("getItem('WeeklyActivity'"), true, 'response checked before the re-read');
      _assertEqual(body.indexOf('if (stored === sentId) return;') < body.indexOf("updateItem('WeeklyActivity'"), true, 'stored value confirmed blank before any PATCH');
      const create = api.slice(api.indexOf('async function createWeeklyActivity('), api.indexOf('async function _verifyWeeklyActivityProjectId('));
      _assertEqual(/try \{\s*await _verifyWeeklyActivityProjectId/.test(create), true, 'verify failure cannot fail the save');
      _assertEqual(/catch[^}]*\}\s*return created;/.test(create), true, 'returns the createItem result');
      const msg = weeklyActivityProjectDropMessage({ itemId: '801', roleId: 45, sent: 7, response: null, stored: null, heal: 'OK' });
      ['item 801', 'role 45', 'sent 7', 'create OK', 'response blank', 'stored blank', 'heal OK'].forEach(t =>
        _assertEqual(msg.includes(t), true, 'message carries "' + t + '": ' + msg));
      _assertEqual(weeklyActivityProjectDropMessage({ itemId: 1, roleId: 2, sent: 3, response: undefined, stored: null, heal: 'x' }).includes('response no fields'), true, 'no-fields response is named');
    },
  },
  {
    name: 'N-315 WeeklyActivity creates only via createWeeklyActivity (AC4)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintWeeklyActivityCreates(ALL_SOURCES).map(v => `${v.file}:${v.line}  ${v.text}`), [],
        'raw WeeklyActivity creates outside api.js (use createWeeklyActivity)');
      _assertEqual(countWeeklyActivityCreates(ALL_SOURCES['api.js']), 1, 'api.js: the one create inside createWeeklyActivity');
      ['forms-weekly.js', 'bulk-activity.js', 'mobile-pages.js'].forEach(f =>
        _assertEqual(ALL_SOURCES[f].includes('createWeeklyActivity(fields)'), true, f + ' writes through the wrapper'));
    },
  },
  {
    name: 'lint-weeklyactivity-writes control: flags raw creates outside api.js, ignores updates, reads and other lists (N-315)',
    fn: function () {
      const lint = src => lintWeeklyActivityCreates(src).map(v => `${v.file}:${v.line}`);
      _assertEqual(lint({ 'pages.js': "x();\nawait createItem('WeeklyActivity', f);\ncreateItem( \"WeeklyActivity\", f);\n" }),
        ['pages.js:2', 'pages.js:3'], 'single + double quotes flagged');
      _assertEqual(lint({ 'forms.js': 'createItem(`WeeklyActivity`, f);\n' }), ['forms.js:1'], 'backtick');
      _assertEqual(lint({ 'api.js': "createItem('WeeklyActivity', f);\n" }), [], 'api.js is counted separately');
      _assertEqual(lint({ 'pages.js': "updateItem('WeeklyActivity', 1, f);\ngetItems('WeeklyActivity');\ncreateItem('WeeklyActivityX', f);\ncreateWeeklyActivity(f);\n" }), [], 'updates, reads, other lists, the wrapper');
      _assertEqual(countWeeklyActivityCreates("a\ncreateItem('WeeklyActivity', f);\ncreateItem(\"WeeklyActivity\", g);\n"), 2, 'counter');
    },
  }
);
