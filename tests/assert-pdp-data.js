// tests/assert-pdp-data.js — PDP lists: registration, projection, cache exclusion, keys, cleaners,
// JSON guard, overdue rule, getters / writers (N-434 / PDP-2). Loads AFTER tests/assertions.js.

// Fixture copy of the Data model tables in specs/N-434.md. Deliberately NOT derived from the code
// under test: a column added to or dropped from LIST_FIELDS has to be changed here as well.
// N-435 (specs/N-435.md): the five personal lists end with ReadOnlyEmails + AccessKey.
const _PDP_TABLES = {
  PDPFramework: ['Title', 'Level', 'Track', 'PillarKey', 'Pillar', 'Band', 'Descriptor', 'SortOrder', 'IsActive', 'UpdatedBy'],   // N-436 adds UpdatedBy
  PDPTemplates: ['Title', 'MeetingType', 'VersionNo', 'Status', 'Definition', 'PublishedAt', 'PublishedBy'],
  PDPCycles: ['Title', 'PersonID', 'PersonEmail', 'PersonName', 'CycleYear', 'Level', 'Track', 'LineManagerEmail', 'CSDEmail', 'JoinDate', 'BiAnnualScored', 'ScoringLevel', 'Status', 'ReadOnlyEmails', 'AccessKey'],
  PDPMeetings: ['Title', 'PersonID', 'PersonEmail', 'PersonName', 'CycleYear', 'CycleID', 'MeetingType', 'IsJoiner', 'Period', 'DueDate', 'MeetingDate', 'Status', 'SkipReason', 'TemplateID', 'TemplateVersion', 'PrepEmployee', 'PrepManager', 'MeetingNotes', 'EmployeeSignedAt', 'ManagerSignedAt', 'LineManagerEmail', 'CSDEmail', 'ReadOnlyEmails', 'AccessKey'],
  PDPGoals: ['Title', 'PersonID', 'PersonEmail', 'CycleYear', 'LineManagerEmail', 'CSDEmail', 'GoalLevel', 'Period', 'Category', 'ParentGoalID', 'MeetingID', 'WhyItMatters', 'SuccessMeasures', 'Support', 'TargetDate', 'Rag', 'Status', 'ReadOnlyEmails', 'AccessKey'],
  PDPActions: ['Title', 'PersonID', 'PersonEmail', 'LineManagerEmail', 'CSDEmail', 'MeetingID', 'GoalID', 'OwnerRole', 'OwnerEmail', 'DueDate', 'IsDone', 'DoneAt', 'ReadOnlyEmails', 'AccessKey'],
  PDPScores: ['Title', 'PersonID', 'PersonEmail', 'CycleYear', 'LineManagerEmail', 'CSDEmail', 'MeetingID', 'PillarKey', 'Source', 'ScoringLevel', 'Score', 'Rationale', 'SubmittedAt', 'CalibratedScore', 'CalibrationRationale', 'IsLocked', 'ReadOnlyEmails', 'AccessKey'],
};

function _pdpThrows(fn) { try { fn(); } catch (e) { return String(e.message); } return null; }

ASSERTIONS.push(
  {
    name: 'N-434 AC1 the seven PDP lists are registered as {} and watched by Data Health',
    fn: function () {
      const watched = getMonitoredLists();
      Object.keys(_PDP_TABLES).forEach(l => {
        _assertEqual(FIELD_ALIASES[l], {}, 'AC1 ' + l + ' alias is {}');
        _assertEqual(watched.includes(l), true, 'AC1 ' + l + ' watched');
        _assertEqual(CONFIG.DATA_HEALTH_EXCLUDED_LISTS.includes(l), false, 'AC1 ' + l + ' not excluded');
      });
    },
  },
  {
    name: 'N-434 AC2 LIST_FIELDS equals the data-model tables; no reserved or colliding names',
    fn: function () {
      Object.keys(_PDP_TABLES).forEach(l => {
        _assertEqual(CONFIG.LIST_FIELDS[l], _PDP_TABLES[l], 'AC2 ' + l + ' columns match the spec tables');
        _assertEqual(CONFIG.LIST_FIELDS[l][0], 'Title', 'AC2 ' + l + ' starts with Title');
        _assertEqual(new Set(CONFIG.LIST_FIELDS[l]).size, CONFIG.LIST_FIELDS[l].length, 'AC2 ' + l + ' no duplicates');
        ['Year', 'Version', 'Type', 'Owner', 'Order'].forEach(bad =>
          _assertEqual(CONFIG.LIST_FIELDS[l].includes(bad), false, 'AC2 ' + l + ' avoids ' + bad));
        _assertEqual(pdpListColumns(l), _PDP_TABLES[l], 'AC2 ' + l + ' cleaner spec matches the same tables');
      });
    },
  },
  {
    name: 'N-434 AC3 lists are named only through CONFIG.PDP.LISTS',
    fn: function () {
      _assertEqual(Object.values(CONFIG.PDP.LISTS).sort(), Object.keys(_PDP_TABLES).sort(), 'AC3 LISTS names the seven lists');
      ['api-pdp.js', 'pdp-data.js'].forEach(f => {
        const src = ALL_SOURCES[f];
        Object.keys(_PDP_TABLES).forEach(l =>
          _assertEqual(new RegExp("['\"]" + l + "['\"]").test(src), false, 'AC3 ' + f + ' has no literal ' + l));
      });
    },
  },
  {
    name: 'N-434 AC4 PDP lists are never cached, delta-synced, MCP-exposed or Command-Bar-read; N-435: personal lists restricted-mapped',
    fn: function () {
      const personal = ['PDPCycles', 'PDPMeetings', 'PDPGoals', 'PDPActions', 'PDPScores'];
      Object.keys(_PDP_TABLES).forEach(l => {
        _assertEqual(CONFIG.CACHE.persistentLists.includes(l), false, 'AC4 ' + l + ' not tier-2 cached');
        _assertEqual(CONFIG.DELTA.enrolledLists.includes(l), false, 'AC4 ' + l + ' not delta-enrolled');
        _assertEqual(CONFIG.MCP.allowedLists.includes(l), false, 'AC4 ' + l + ' not MCP-allowed');
        _assertEqual(CONFIG.RESTRICTED_LISTS.includes(l), personal.includes(l), 'AC4 ' + l + (personal.includes(l) ? ' restricted (N-435)' : ' readable by all, not restricted (N-435)'));
      });
      _assertEqual(CONFIG.MCP.scripts.some(f => /pdp/.test(f)), false, 'AC4 no PDP file in the MCP bundle');
      _assertEqual(/pdp|PDP/.test(ALL_SOURCES['command-bar.js']), false, 'AC4 Command Bar never reads PDP');
    },
  },
  {
    name: 'N-434 AC5 record keys: documented formats, throw on an empty or non-numeric part',
    fn: function () {
      _assertEqual(pdpCycleKey(12, 2027), '12|2027', 'AC5 cycle key');
      _assertEqual(pdpMeetingKey(12, 2027, 'Monthly', '2027-02'), '12|2027|Monthly|2027-02', 'AC5 meeting key');
      _assertEqual(pdpScoreKey(88, 'own-it', 'Self'), '88|own-it|Self', 'AC5 score key');
      _assertEqual(pdpScoreKey(88, 'own-it', 'Manager') !== pdpScoreKey(88, 'own-it', 'Self'), true, 'AC5 Source makes keys distinct');
      [() => pdpCycleKey('', 2027), () => pdpCycleKey('x', 2027), () => pdpCycleKey(12, null),
        () => pdpMeetingKey(12, 2027, 'Weekly', '2027-02'), () => pdpMeetingKey(12, 2027, 'Monthly', ''),
        () => pdpMeetingKey(12, 2027, 'Monthly', 'a|b'), () => pdpScoreKey(88, '', 'Self'),
        () => pdpScoreKey(88, 'own-it', 'Nope'), () => pdpScoreKey(-1, 'own-it', 'Self')
      ].forEach((fn, i) => _assertEqual(_pdpThrows(fn) !== null, true, 'AC5 bad key #' + i + ' throws'));
    },
  },
  {
    name: 'N-434 AC6 cleaners: own columns only, enums, emails, dates, create vs update',
    fn: function () {
      const mtg = { PersonID: 12, PersonEmail: 'a@b.co', CycleYear: 2027, MeetingType: 'Monthly', Period: '2027-02', DueDate: '2027-02-27' };
      const c = pdpCleanMeetings({
        PersonID: '12', PersonEmail: ' Tia.Tp@MG.test ', CycleYear: 2027, MeetingType: 'Monthly', Period: '2027-02',
        DueDate: '2027-02-27', Status: 'Planned', Bogus: 'x', SkipReason: '', MeetingDate: null,
        LineManagerEmail: 'SAM@mg.test',
      }, 'create');
      _assertEqual(c, {
        PersonID: 12, PersonEmail: 'tia.tp@mg.test', CycleYear: 2027, MeetingType: 'Monthly', Period: '2027-02',
        DueDate: '2027-02-27T12:00:00Z', Status: 'Planned', LineManagerEmail: 'sam@mg.test', Title: '12|2027|Monthly|2027-02',
      }, 'AC6 create: unknown dropped, blanks omitted, email lower-cased, date via isoDate, key built');
      _assertEqual(_pdpThrows(() => pdpCleanMeetings(Object.assign({}, mtg, { Status: 'Done' }), 'create')) !== null, true, 'AC6 out-of-enum Status throws');
      _assertEqual(_pdpThrows(() => pdpCleanMeetings(Object.assign({}, mtg, { PersonEmail: 'not-an-email' }), 'create')) !== null, true, 'AC6 bad email throws');
      _assertEqual(_pdpThrows(() => pdpCleanMeetings({ PersonID: 12, PersonEmail: 'a@b.co', CycleYear: 2027, MeetingType: 'Monthly', Period: '2027-02' }, 'create')) !== null, true, 'AC6 missing required DueDate throws');
      _assertEqual(_pdpThrows(() => pdpCleanMeetings({ DueDate: '27/02/2027' }, 'update')) !== null, true, 'AC6 non-ISO date throws');
      const u = pdpCleanMeetings({ Title: 'tamper', MeetingDate: '', SkipReason: '', IsJoiner: false, Status: 'Held' }, 'update');
      _assertEqual(u, { MeetingDate: null, SkipReason: '', IsJoiner: false, Status: 'Held' }, 'AC6 update: only supplied, blanks clear, keyed Title ignored');
      _assertEqual(pdpCleanMeetings({}, 'update'), {}, 'AC6 update with nothing supplied is empty');
      const goal = { Title: 'Win', PersonID: 1, PersonEmail: 'a@b.co', CycleYear: 2027 };
      _assertEqual(pdpCleanGoals(Object.assign({ Rag: 'Amber' }, goal), 'create').Title, 'Win', 'AC6 unkeyed list keeps Title');
      _assertEqual(_pdpThrows(() => pdpCleanGoals(Object.assign({ Rag: 'Purple' }, goal), 'create')) !== null, true, 'AC6 Rag enum');
      _assertEqual(_pdpThrows(() => pdpCleanFields('Nope', {}, 'create')) !== null, true, 'AC6 unknown list throws');
      _assertEqual(_pdpThrows(() => pdpCleanFields(CONFIG.PDP.LISTS.GOALS, {}, 'merge')) !== null, true, 'AC6 bad mode throws');
      _assertEqual(pdpCleanFramework({ Title: 'x', Level: 'L5', Track: 'IC', Band: 'Meets', Descriptor: '', IsActive: 'Yes', SortOrder: '3' }, 'create'),
        { Title: 'x', Level: 'L5', Track: 'IC', Band: 'Meets', IsActive: true, SortOrder: 3 }, 'AC6 framework: empty descriptor omitted, Yes becomes true, number coerced');
      _assertEqual(_pdpThrows(() => pdpCleanFramework({ Title: 'x', SortOrder: '1.5' }, 'create')) !== null, true, 'AC6 whole numbers only');
    },
  },
  {
    name: 'N-434 AC7 JSON guard: round trip, size limit, parse-safe read',
    fn: function () {
      const obj = { sections: [{ q: 'How did it go?', a: 'Well' }] };
      _assertEqual(pdpParseJson(pdpJsonField(obj)), obj, 'AC7 round trip');
      _assertEqual(pdpJsonField('{"a":1}'), '{"a":1}', 'AC7 valid JSON string passes through');
      _assertEqual(pdpJsonField(''), null, 'AC7 blank is null');
      _assertEqual(_pdpThrows(() => pdpJsonField('{nope')) !== null, true, 'AC7 invalid JSON string throws');
      const big = _pdpThrows(() => pdpJsonField({ t: 'x'.repeat(CONFIG.PDP.JSON_MAX_CHARS) }));
      _assertEqual(/too long to save/.test(big || ''), true, 'AC7 oversized gives a readable message');
      _assertEqual(pdpJsonField({ t: 'x'.repeat(CONFIG.PDP.JSON_MAX_CHARS - 20) }) !== null, true, 'AC7 just under the limit passes');
      _assertEqual([pdpParseJson('{nope'), pdpParseJson(null), pdpParseJson('')], [null, null, null], 'AC7 read never throws');
    },
  },
  {
    name: 'N-434 AC8 pdpIsOverdue is derived from DueDate and Status',
    fn: function () {
      const m = (due, st) => ({ DueDate: due, Status: st });
      _assertEqual(pdpIsOverdue(m('2027-02-10T12:00:00Z', 'Planned'), '2027-02-11'), true, 'AC8 past + Planned');
      _assertEqual(pdpIsOverdue(m('2027-02-10T12:00:00Z', 'PrepOpen'), '2027-02-11'), true, 'AC8 past + PrepOpen');
      ['Held', 'SignedOff', 'Skipped'].forEach(s => _assertEqual(pdpIsOverdue(m('2027-02-10T12:00:00Z', s), '2027-02-11'), false, 'AC8 ' + s));
      _assertEqual(pdpIsOverdue(m('2027-02-11T12:00:00Z', 'Planned'), '2027-02-11'), false, 'AC8 due today is not overdue');
      _assertEqual(pdpIsOverdue(m('', 'Planned'), '2027-02-11'), false, 'AC8 no due date');
      _assertEqual(pdpIsOverdue(null, '2027-02-11'), false, 'AC8 null');
    },
  },
  {
    name: 'N-434 AC9 getters and writers: right list, right filter, one call, invalid payload makes no call',
    fn: function () {
      const calls = [];
      const o = { g: getItems, c: createItem, u: updateItem };
      const never = function () { return new Promise(function () {}); };
      try {
        getItems = function (l, f) { calls.push(['get', l, f || '']); return never(); };
        createItem = function (l, f) { calls.push(['create', l, f]); return never(); };
        updateItem = function (l, i, f) { calls.push(['update', l, i, f]); return never(); };
        getPdpFramework(); getPdpTemplates();
        getPdpCycles(12, 2027); getPdpCycles(12); getPdpCycles();
        getPdpMeetings(12, 2027); getPdpGoals(12, 2027); getPdpActions(12); getPdpScores(88);
        _assertEqual(calls.map(c => c.join('~')), [
          'get~PDPFramework~', 'get~PDPTemplates~',
          'get~PDPCycles~fields/PersonID eq 12 and fields/CycleYear eq 2027', 'get~PDPCycles~fields/PersonID eq 12', 'get~PDPCycles~',
          'get~PDPMeetings~fields/PersonID eq 12 and fields/CycleYear eq 2027', 'get~PDPGoals~fields/PersonID eq 12 and fields/CycleYear eq 2027',
          'get~PDPActions~fields/PersonID eq 12', 'get~PDPScores~fields/MeetingID eq 88',
        ], 'AC9 each getter reads its own list with the right filter');
        calls.length = 0;
        const who = { PersonID: 12, PersonEmail: 'a@b.co' };
        createPdpAction(Object.assign({ Title: 'Book course', OwnerRole: 'Employee' }, who));
        updatePdpAction('5', { IsDone: true });
        createPdpCycle(Object.assign({ CycleYear: 2027 }, who));
        updatePdpCycle('6', { Status: 'Closed' });
        createPdpMeeting(Object.assign({ CycleYear: 2027, MeetingType: 'Annual', Period: '2027-01', DueDate: '2027-01-31' }, who));
        updatePdpMeeting('7', { Status: 'Held' });
        createPdpGoal(Object.assign({ Title: 'g', CycleYear: 2027 }, who));
        updatePdpGoal('8', { Rag: 'Green' });
        createPdpFramework({ Title: 'f' }); updatePdpFramework('9', { IsActive: true });
        createPdpTemplate({ Title: 't', MeetingType: 'Annual', VersionNo: 1 }); updatePdpTemplate('10', { Status: 'Published' });
        createPdpScore(Object.assign({ CycleYear: 2027, MeetingID: 88, PillarKey: 'own-it', Source: 'Self', Score: 2 }, who));
        updatePdpScore('11', { Score: 3 }, 'Manager');
        _assertEqual(calls.map(c => c[0] + ':' + c[1]), [
          'create:PDPActions', 'update:PDPActions', 'create:PDPCycles', 'update:PDPCycles', 'create:PDPMeetings', 'update:PDPMeetings',
          'create:PDPGoals', 'update:PDPGoals', 'create:PDPFramework', 'update:PDPFramework', 'create:PDPTemplates', 'update:PDPTemplates',
          'create:PDPScores', 'update:PDPScores',
        ], 'AC9 exactly one write per writer, on its own list');
        _assertEqual(calls[0][2], { Title: 'Book course', PersonID: 12, PersonEmail: 'a@b.co', OwnerRole: 'Employee' }, 'AC9 payload is the cleaned one');
        const n = calls.length;
        let rejected = 0;
        [createPdpMeeting({ PersonID: 12 }), updatePdpGoal('8', { Rag: 'Purple' }), getPdpCycles('1 or 1 eq 1')].forEach(p => p.catch(function () { rejected++; }));
        _assertEqual(calls.length, n, 'AC9 an invalid payload or filter makes no call');
      } finally { getItems = o.g; createItem = o.c; updateItem = o.u; }
    },
  },
  {
    name: 'N-434 AC10 api-pdp.js: no raw graphRequest, no delete, nothing stored client-side',
    fn: function () {
      const src = ALL_SOURCES['api-pdp.js'].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      _assertEqual(/graphRequest/.test(src), false, 'AC10 no raw graphRequest');
      _assertEqual(/deleteItem/.test(_pdpApiNoTeamDelete(src)), false, 'AC10 no delete writer');
      _assertEqual(/sessionStorage|localStorage/.test(src), false, 'AC10 nothing stored client-side');
    },
  },
  {
    name: 'N-434 AC11 PDPScores: three Sources, three keys; calibration fields only on the Agreed row',
    fn: function () {
      const base = { PersonID: 12, PersonEmail: 'a@b.co', CycleYear: 2027, MeetingID: 88, PillarKey: 'own-it', Score: 2, CalibratedScore: 3, CalibrationRationale: 'why', IsLocked: true };
      const rows = {};
      CONFIG.PDP.SCORE_SOURCES.forEach(s => { rows[s] = pdpCleanScores(Object.assign({ Source: s }, base), 'create'); });
      _assertEqual(new Set(Object.values(rows).map(r => r.Title)).size, 3, 'AC11 three distinct keys');
      ['Self', 'Manager'].forEach(s => ['CalibratedScore', 'CalibrationRationale', 'IsLocked'].forEach(k => _assertEqual(k in rows[s], false, 'AC11 ' + s + ' row drops ' + k)));
      _assertEqual([rows.Agreed.CalibratedScore, rows.Agreed.CalibrationRationale, rows.Agreed.IsLocked], [3, 'why', true], 'AC11 Agreed row carries calibration and lock');
      _assertEqual('CalibratedScore' in pdpCleanScores({ CalibratedScore: 3 }, 'update', 'Self'), false, 'AC11 update on a Self row cannot add calibration');
      _assertEqual(pdpCleanScores({ CalibratedScore: 3 }, 'update', 'Agreed').CalibratedScore, 3, 'AC11 update on the Agreed row can');
      [4, 0].forEach(sc => _assertEqual(_pdpThrows(() => pdpCleanScores(Object.assign({ Source: 'Self' }, base, { Score: sc }), 'create')) !== null, true, 'AC11 score ' + sc + ' rejected'));
    },
  }
);