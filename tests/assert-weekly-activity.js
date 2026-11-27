// tests/assert-weekly-activity.js - N-548 (AMCP-4): the shared weekly-activity rules (js/weekly-activity-logic.js),
// the save wrapper (js/api-weekly.js) and their callers. Loads after tests/assertions.js and pushes into ASSERTIONS.
// The MCP tool's behaviour (preview / commit / scoping / stale / failure) runs in tests/mcp-weekly-check.js.
// Source-scan assertions skip under tests/index.html, where ALL_SOURCES / MCP_SOURCES are not defined.

ASSERTIONS.push(
  {
    name: 'N-548 AC1 weeklyFields golden parity: the exact field object the single-role form, the bulk grid and mobile quick-log built before the extraction, on boundary Sundays (BST start / end, year ends)',
    fn: function () {
      var counts = { Outreach: '12', Responses: 3, Screened: '', Submitted: undefined, Interview1: '2', Interview2Plus: '1', FinalInterview: 0, Offers: 'x', Hires: '1' };
      var now = '2026-11-27T09:00:00.000Z';
      // Expected values written out by hand from the old builders (forms-weekly.js submitWeeklyForm, bulk-activity.js
      // _bulkFieldsFor, mobile-pages.js): year off the day STRING, ISO week, parseInt(...)||0, write names.
      [
        ['2026-10-25', 2026, 43],   // BST ends
        ['2026-03-29', 2026, 13],   // BST starts
        ['2026-12-27', 2026, 52],
        ['2027-01-03', 2027, 53],   // ISO week 53 of 2026 belongs to a 2027 Sunday: the year is the Sunday's year
      ].forEach(function (c) {
        var f = weeklyFields({ projectId: '5', roleId: '7', tpEmail: 'a@b.co', weekEnding: c[0], counts: counts, now: now });
        _assertEqual(f.Yeare, c[1], c[0] + ' Yeare');
        _assertEqual(f.WeekNumber, getISOWeek(c[0]), c[0] + ' WeekNumber');
        _assertEqual(f.WeekEndingDate, isoDate(c[0]), c[0] + ' WeekEndingDate');
        _assertEqual([f.ProjectIDLookupId, f.RoleIDLookupId, f.TalentPartner, f.SubmittedAt], [5, 7, 'a@b.co', now], c[0] + ' ids / TP / SubmittedAt');
        _assertEqual([f.Outreach, f.Responses, f.Screened, f.Submitted, f.Interview1, f.InterviewTwoPlus, f.FinalInterview, f.Offers, f.Hires], [12, 3, 0, 0, 2, 1, 0, 0, 1], c[0] + ' counts coerced as the forms did');
      });
      _assertEqual(Object.keys(weeklyFields({ projectId: '5', roleId: '7', tpEmail: 'a@b.co', weekEnding: '2026-10-25', counts: counts, now: now })),
        ['ProjectIDLookupId', 'RoleIDLookupId', 'TalentPartner', 'Yeare', 'WeekNumber', 'WeekEndingDate', 'Outreach', 'Responses', 'Screened', 'Submitted', 'Interview1', 'InterviewTwoPlus', 'FinalInterview', 'Offers', 'Hires', 'SubmittedAt'], 'field order');
      var m = weeklyFields({ roleId: '7', tpEmail: '', weekEnding: '2026-10-25', counts: {}, now: now });
      _assertEqual('ProjectIDLookupId' in m, false, 'mobile quick-log omits ProjectIDLookupId (createWeeklyActivity derives it, N-315)');
      _assertEqual(m.TalentPartner, undefined, 'no TP -> undefined, as before');
    },
  },
  {
    name: 'N-548 AC2 weeklyResolveWeek / weeklyWeekRefusal: a date means its Sunday, this / last week, blank = this week, garbage throws; weeks after this one are refused (string maths, Friday 2026-11-27)',
    fn: function () {
      var today = '2026-11-27';
      _assertEqual(weeklyResolveWeek('', today), '2026-11-29', 'blank');
      _assertEqual(weeklyResolveWeek(undefined, today), '2026-11-29', 'undefined');
      _assertEqual(weeklyResolveWeek('This Week', today), '2026-11-29', 'this week (case-insensitive)');
      _assertEqual(weeklyResolveWeek('last week', today), '2026-11-22', 'last week');
      _assertEqual(weeklyResolveWeek('2026-11-20', today), '2026-11-22', 'a Friday');
      _assertEqual(weeklyResolveWeek('2026-11-22', today), '2026-11-22', 'a Sunday is itself');
      _assertEqual(weeklyResolveWeek('2026-11-23', today), '2026-11-29', 'a Monday -> the next Sunday');
      _assertEqual(weeklyResolveWeek('2026-10-26', '2026-10-25'), '2026-11-01', 'BST end boundary');
      ['2026-02-30', '27/11/2026', 'next week', 'tomorrow'].forEach(function (bad) {
        var threw = false; try { weeklyResolveWeek(bad, today); } catch (e) { threw = true; }
        _assertEqual(threw, true, 'garbage: ' + bad);
      });
      _assertEqual(weeklyWeekRefusal('2026-11-29', today), null, 'this week allowed');
      _assertEqual(weeklyWeekRefusal('2026-11-22', today), null, 'last week allowed');
      _assertEqual(/future/.test(weeklyWeekRefusal('2026-12-06', today)), true, 'next week refused');
    },
  },
  {
    name: 'N-548 AC3 weeklyCleanCounts / weeklyEditFields / weeklyHiresTrigger / weeklyFindExisting / weeklyRowKey',
    fn: function () {
      var ok = weeklyCleanCounts({ Outreach: 5, Hires: 0, Offers: undefined, Screened: null });
      _assertEqual([ok.ok, ok.counts], [true, { Outreach: 5, Hires: 0 }], 'only supplied counts, 0 kept');
      ['-1', 1.5, NaN, '3', true].forEach(function (bad) {
        _assertEqual(weeklyCleanCounts({ Outreach: bad }).ok, false, 'rejects ' + String(bad));
      });
      _assertEqual(weeklyEditFields({ Interview2Plus: 2, Outreach: 4 }, 'T'), { Outreach: 4, InterviewTwoPlus: 2, SubmittedAt: 'T' }, 'edit uses write names, supplied counts only');
      _assertEqual(weeklyHiresTrigger({ isCreate: true, before: 0, after: 1 }), true, 'create with hires');
      _assertEqual(weeklyHiresTrigger({ isCreate: true, before: 0, after: 0 }), false, 'create without hires');
      _assertEqual(weeklyHiresTrigger({ isCreate: false, before: 1, after: 1 }), false, 'edit, hires unchanged');
      _assertEqual(weeklyHiresTrigger({ isCreate: false, before: 1, after: 2 }), true, 'edit, hires up');
      _assertEqual(weeklyHiresTrigger({ isCreate: false, before: 2, after: 1 }), false, 'edit, hires down');
      _assertEqual(weeklyRowKey(7, ' A@B.co '), '7|a@b.co', 'key lower-cases and trims the TP');
      var rows = [
        { id: 1, RoleIDLookupId: 7, TalentPartner: 'a@b.co', WeekEndingDate: '2026-11-22T12:00:00Z' },
        { id: 2, RoleIDLookupId: 7, TalentPartner: 'A@B.CO', WeekEndingDate: '2026-11-29T12:00:00Z' },
        { id: 3, RoleIDLookupId: 8, TalentPartner: 'a@b.co', WeekEndingDate: '2026-11-22T12:00:00Z' },
      ];
      _assertEqual(weeklyFindExisting(rows, 7, 'a@b.co', '2026-11-22').kind, 'one', 'one');
      _assertEqual(weeklyFindExisting(rows, 7, 'a@b.co', '2026-11-22').row.id, 1, 'the right row');
      _assertEqual(weeklyFindExisting(rows, 7, 'a@b.co', '2026-12-06').kind, 'none', 'none');
      _assertEqual(weeklyFindExisting(rows.concat([{ id: 9, RoleIDLookupId: 7, TalentPartner: 'a@b.co', WeekEndingDate: '2026-11-22T12:00:00Z' }]), 7, 'a@b.co', '2026-11-22').kind, 'many', 'many');
    },
  },
  {
    name: 'N-548 AC4 resolveRowTalentPartner kept its behaviour after the move from bulk-activity.js (signed-in owner first, else first owner, none -> null)',
    fn: function () {
      _assertEqual(resolveRowTalentPartner('a@b.co;c@d.co', 'C@D.co'), 'c@d.co', 'me when I own it');
      _assertEqual(resolveRowTalentPartner('a@b.co;c@d.co', 'x@y.co'), 'a@b.co', 'first owner');
      _assertEqual(resolveRowTalentPartner('', 'x@y.co'), null, 'no owner');
    },
  },
  {
    name: 'N-548 AC5 drift: WEEKLY_COUNT_FIELDS = the MCP funnel fields = the bulk grid columns (names, order, write names); nine counts; every writeKey is in the MCP writeLists',
    fn: function () {
      var keys = WEEKLY_COUNT_FIELDS.map(function (f) { return f.key; });
      _assertEqual(keys.length, 9, 'nine counts');
      _assertEqual(keys, MCP_FUNNEL_FIELDS, 'MCP_FUNNEL_FIELDS (newton-tools.js) order and names');
      if (typeof ALL_SOURCES !== 'undefined') {   // bulk-activity.js is a page file (DOM), so it is read, not run
        _assertEqual(ALL_SOURCES['bulk-activity.js'].includes('const BULK_COUNT_FIELDS = WEEKLY_COUNT_FIELDS.map(f => ({ readKey: f.key, writeKey: f.writeKey, label: f.label }));'), true, 'the bulk grid columns are derived from WEEKLY_COUNT_FIELDS');
      }
      var w = CONFIG.MCP.writeLists.WeeklyActivity;
      WEEKLY_COUNT_FIELDS.forEach(function (f) {
        _assertEqual(w.create.indexOf(f.writeKey) !== -1 && w.update.indexOf(f.writeKey) !== -1, true, f.writeKey + ' is in writeLists create and update');
      });
      _assertEqual(w.create.indexOf('Source') !== -1 && w.update.indexOf('Source') !== -1, true, 'Source is writable');
      _assertEqual(Object.keys(weeklyFields({ roleId: 1, weekEnding: '2026-11-22', counts: {}, now: 'T' })).every(function (k) { return w.create.indexOf(k) !== -1; }), true, 'every key weeklyFields builds is in writeLists.create');
    },
  },
  {
    name: 'N-548 AC6 SELECT_FIELDS.WeeklyActivity does NOT carry Source (the app must keep reading before the SharePoint column exists); saveWeeklyRow updates an existing week and otherwise ends in createWeeklyActivity (the only raw create)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      _assertEqual(/WeeklyActivity:\s*\[[^\]]*\bSource\b/.test(ALL_SOURCES['api.js'] + ALL_SOURCES['graph-client.js']), false, 'Source is not in the WeeklyActivity projection');
      var s = ALL_SOURCES['api-weekly.js'];
      _assertEqual(s.includes("updateItem('WeeklyActivity', existingId, fields)") && s.includes('createWeeklyActivity(fields)'), true, 'update / create paths');
      _assertEqual(/createItem\(/.test(s), false, 'no raw createItem');
    },
  },
  {
    name: 'N-548 AC7 the three UIs build their fields through weeklyFields and keep no copy of the count list or the BST-prone year; bulk save and the form save go through the shared functions',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      ['forms-weekly.js', 'bulk-activity.js', 'mobile-pages.js'].forEach(function (f) {
        _assertEqual(ALL_SOURCES[f].includes('weeklyFields('), true, f + ' builds fields with weeklyFields');
      });
      _assertEqual(ALL_SOURCES['mobile-pages.js'].replace(/\/\/.*$/gm, '').includes('getFullYear()'), false, 'mobile-pages.js no longer reads the year off the device clock (BST year bug)');
      _assertEqual(/InterviewTwoPlus/.test(ALL_SOURCES['bulk-activity.js'].replace(/\/\/.*$/gm, '')), false, 'bulk-activity.js keeps no second copy of the write names');
      _assertEqual(ALL_SOURCES['bulk-activity.js'].includes('weeklyRowKey('), true, 'bulk grid keys rows with weeklyRowKey');
      _assertEqual(ALL_SOURCES['forms-weekly.js'].includes('weeklyHiresTrigger('), true, 'the form prompts through weeklyHiresTrigger');
    },
  },
  {
    name: 'N-548 AC8 the new JS files are DOM-free declarations: nothing at top level but const / function declarations, no document / window / localStorage; loaded on reporting.html, mobile.html and in CONFIG.MCP.scripts in dependency order',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      ['weekly-activity-logic.js', 'api-weekly.js'].forEach(function (f) {
        var code = ALL_SOURCES[f].replace(/\/\/.*$/gm, '');
        _assertEqual(/\b(document|window|localStorage|sessionStorage|navigator)\b/.test(code), false, f + ' touches no browser global');
        var top = code.split('\n').filter(function (l) { return /^\S/.test(l) && !/^[}\])]/.test(l) && l.trim() !== ''; });
        _assertEqual(top.filter(function (l) { return !/^(const|async function|function) /.test(l); }), [], f + ' has only declarations at top level');
      });
      var sc = CONFIG.MCP.scripts;
      var at = function (n) { return sc.indexOf(n); };
      _assertEqual(at('js/weekly-activity-logic.js') > at('js/utils.js') && at('js/api-weekly.js') > at('js/api.js') && at('js/api-weekly.js') > at('js/weekly-activity-logic.js'), true, 'logic after utils.js, save after api.js and the logic');
      _assertEqual(at('js/notifications.js') > at('js/api-weekly.js') && at('js/notifications.js') < at('mcp/newton-tools.js'), true, 'notifications.js (fireNotification) is loaded for the hire prompt, before the tools');
      _assertEqual(at('mcp/newton-write-tools.js') === sc.length - 1, true, 'the write tools load last');
      ['reporting.html', 'mobile.html'].forEach(function (h) {
        var html = ALL_HTML[h];
        var a = html.indexOf('js/weekly-activity-logic.js'), b = html.indexOf('js/api-weekly.js');
        _assertEqual(a > html.indexOf('js/permissions.js') && b > html.indexOf('js/api-access.js') && b > a, true, h + ' loads the logic after permissions.js and the save after api-access.js');
        _assertEqual(html.indexOf('js/forms-weekly.js') === -1 || html.indexOf('js/forms-weekly.js') > b, true, h + ': callers load after both');
      });
    },
  },
  {
    name: 'N-548 AC9 the hire reminder: type mcpHire is celebrate-toned, its deep link is the existing N-146 addPlacement branch, and the bell shows it like any other row',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      _assertEqual(ALL_SOURCES['app.js'].includes("action === 'addPlacement'"), true, 'handleDeepLink already handles addPlacement (no app.js change)');
      var src = MCP_SOURCES['newton-write-tools.js'];
      _assertEqual(/triggerType: 'mcpHire'/.test(src) && /tone: 'celebrate'/.test(src), true, 'type and tone');
      _assertEqual(/celebrate: 'party-popper'/.test(ALL_SOURCES['notifications.js']), true, 'celebrate has a bell icon');
      _assertEqual(/#placements\?action=addPlacement&roleId=/.test(src), true, 'deep link shape');
    },
  },
);
