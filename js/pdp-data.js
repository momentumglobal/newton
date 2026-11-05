// js/pdp-data.js — PDP list rules (N-434 / PDP-2). Pure: reads CONFIG.PDP only — no network I/O,
// no DOM. Loaded after pdp-identity.js (it reuses pdpIsEmail) and utils.js (isoDate).
//
// One column spec per PDP list. Every payload written to a PDP list is produced here, so a typo'd
// column, an out-of-enum value, a malformed email or an oversized JSON blob is a readable error
// BEFORE the Graph call, not a 400 from SharePoint. Record keys (Title on Cycles / Meetings /
// Scores) are built here and nowhere else; callers never concatenate their own.

// kind: text | email | int | bool | date | datetime | json | enum (+ enum name in CONFIG.PDP)
function _pdpCols() {
  const P = CONFIG.PDP;
  const person = { PersonID: { kind: 'int' }, PersonEmail: { kind: 'email' } };
  const snap = { LineManagerEmail: { kind: 'email' }, CSDEmail: { kind: 'email' } };
  const e = (list) => ({ kind: 'enum', values: list });
  return {
    [P.LISTS.FRAMEWORK]: {
      required: ['Title'],
      cols: {
        Title: { kind: 'text' }, Level: e(P.LEVELS), Track: e(P.TRACKS), PillarKey: { kind: 'text' },
        Pillar: { kind: 'text' }, Band: e(P.BANDS), Descriptor: { kind: 'text' },
        SortOrder: { kind: 'int' }, IsActive: { kind: 'bool' },
      },
    },
    [P.LISTS.TEMPLATES]: {
      required: ['Title', 'MeetingType', 'VersionNo'],
      cols: {
        Title: { kind: 'text' }, MeetingType: e(P.MEETING_TYPES), VersionNo: { kind: 'int' },
        Status: e(P.TEMPLATE_STATUS), Definition: { kind: 'json' },
        PublishedAt: { kind: 'datetime' }, PublishedBy: { kind: 'email' },
      },
    },
    [P.LISTS.CYCLES]: {
      required: ['PersonID', 'PersonEmail', 'CycleYear'],
      cols: Object.assign({ Title: { kind: 'text' } }, person, {
        PersonName: { kind: 'text' }, CycleYear: { kind: 'int' }, Level: e(P.LEVELS), Track: e(P.TRACKS),
      }, snap, {
        JoinDate: { kind: 'date' }, BiAnnualScored: { kind: 'bool' }, ScoringLevel: e(P.LEVELS),
        Status: e(P.CYCLE_STATUS),
      }),
    },
    [P.LISTS.MEETINGS]: {
      required: ['PersonID', 'PersonEmail', 'CycleYear', 'MeetingType', 'Period', 'DueDate'],
      cols: Object.assign({ Title: { kind: 'text' } }, person, {
        PersonName: { kind: 'text' }, CycleYear: { kind: 'int' }, CycleID: { kind: 'int' },
        MeetingType: e(P.MEETING_TYPES), IsJoiner: { kind: 'bool' }, Period: { kind: 'text' },
        DueDate: { kind: 'date' }, MeetingDate: { kind: 'date' }, Status: e(P.MEETING_STATUS),
        SkipReason: { kind: 'text' }, TemplateID: { kind: 'int' }, TemplateVersion: { kind: 'int' },
        PrepEmployee: { kind: 'json' }, PrepManager: { kind: 'json' }, MeetingNotes: { kind: 'json' },
        EmployeeSignedAt: { kind: 'datetime' }, ManagerSignedAt: { kind: 'datetime' },
      }, snap),
    },
    [P.LISTS.GOALS]: {
      required: ['Title', 'PersonID', 'PersonEmail', 'CycleYear'],
      cols: Object.assign({ Title: { kind: 'text' } }, person, { CycleYear: { kind: 'int' } }, snap, {
        GoalLevel: e(P.GOAL_LEVELS), Period: { kind: 'text' }, Category: e(P.GOAL_CATEGORIES),
        ParentGoalID: { kind: 'int' }, MeetingID: { kind: 'int' },
        WhyItMatters: { kind: 'text' }, SuccessMeasures: { kind: 'text' }, Support: { kind: 'text' },
        TargetDate: { kind: 'date' }, Rag: e(P.RAG), Status: e(P.GOAL_STATUS),
      }),
    },
    [P.LISTS.ACTIONS]: {
      required: ['Title', 'PersonID', 'PersonEmail'],
      cols: Object.assign({ Title: { kind: 'text' } }, person, snap, {
        MeetingID: { kind: 'int' }, GoalID: { kind: 'int' }, OwnerRole: e(P.OWNER_ROLES),
        OwnerEmail: { kind: 'email' }, DueDate: { kind: 'date' }, IsDone: { kind: 'bool' },
        DoneAt: { kind: 'datetime' },
      }),
    },
    [P.LISTS.SCORES]: {
      required: ['PersonID', 'PersonEmail', 'CycleYear', 'MeetingID', 'PillarKey', 'Source'],
      cols: Object.assign({ Title: { kind: 'text' } }, person, { CycleYear: { kind: 'int' } }, snap, {
        MeetingID: { kind: 'int' }, PillarKey: { kind: 'text' }, Source: e(P.SCORE_SOURCES),
        ScoringLevel: e(P.LEVELS), Score: { kind: 'int', min: P.SCORE_MIN, max: P.SCORE_MAX },
        Rationale: { kind: 'text' }, SubmittedAt: { kind: 'datetime' },
        CalibratedScore: { kind: 'int', min: P.SCORE_MIN, max: P.SCORE_MAX },
        CalibrationRationale: { kind: 'text' }, IsLocked: { kind: 'bool' },
      }),
    },
  };
}

// Columns of one list, in spec order (Title first). Used by the cross-check against LIST_FIELDS.
function pdpListColumns(listName) {
  const spec = _pdpCols()[listName];
  if (!spec) throw new Error('Unknown PDP list: ' + listName);
  return Object.keys(spec.cols);
}

// ── Keys ──────────────────────────────────────────────────────────────
function _pdpKeyNum(label, v) {
  const n = Number(v);
  if (v === '' || v == null || !Number.isInteger(n) || n < 0) throw new Error('PDP key: ' + label + ' must be a whole number');
  return String(n);
}
function _pdpKeyText(label, v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s.indexOf('|') > -1) throw new Error('PDP key: ' + label + ' is required and cannot contain "|"');
  return s;
}
function pdpCycleKey(personId, cycleYear) {
  return _pdpKeyNum('PersonID', personId) + '|' + _pdpKeyNum('CycleYear', cycleYear);
}
function pdpMeetingKey(personId, cycleYear, meetingType, period) {
  pdpAssertEnum('MeetingType', meetingType, CONFIG.PDP.MEETING_TYPES);
  return pdpCycleKey(personId, cycleYear) + '|' + meetingType + '|' + _pdpKeyText('Period', period);
}
function pdpScoreKey(meetingId, pillarKey, source) {
  pdpAssertEnum('Source', source, CONFIG.PDP.SCORE_SOURCES);
  return _pdpKeyNum('MeetingID', meetingId) + '|' + _pdpKeyText('PillarKey', pillarKey) + '|' + source;
}

// ── Guards ────────────────────────────────────────────────────────────
function pdpAssertEnum(label, value, values) {
  if (!values.includes(value)) throw new Error('PDP ' + label + ' must be one of ' + values.join(' / ') + ' (got "' + value + '")');
  return value;
}

// Lower-case, trimmed, validated. Blank stays blank; anything else that is not an email throws.
function pdpEmail(s) {
  const v = String(s == null ? '' : s).trim().toLowerCase();
  if (v && !pdpIsEmail(v)) throw new Error('PDP email is not valid: "' + v + '"');
  return v;
}

// Write side: an object is stringified, a string must already be valid JSON. Blank is null (clears).
// Over CONFIG.PDP.JSON_MAX_CHARS throws a readable message instead of a failed SharePoint write.
function pdpJsonField(value) {
  if (value == null || value === '') return null;
  let text;
  if (typeof value === 'string') {
    try { JSON.parse(value); } catch (e) { throw new Error('PDP JSON field is not valid JSON'); }
    text = value;
  } else {
    text = JSON.stringify(value);
  }
  if (text.length > CONFIG.PDP.JSON_MAX_CHARS) {
    throw new Error('PDP text is too long to save (' + text.length + ' of ' + CONFIG.PDP.JSON_MAX_CHARS + ' characters). Shorten it.');
  }
  return text;
}

// Read side: parse-safe. Anything unparseable is null, never a throw.
function pdpParseJson(text) {
  if (text == null || text === '') return null;
  try { return JSON.parse(text); } catch (e) { return null; }
}

// Overdue is derived, never stored: a past due date on a meeting that has not been held,
// signed off or skipped. YYYY-MM-DD string compare (N-087). `today` is a YYYY-MM-DD string.
function pdpIsOverdue(meeting, today) {
  if (!meeting || !meeting.DueDate) return false;
  const st = meeting.Status;
  if (st === 'Held' || st === 'SignedOff' || st === 'Skipped') return false;
  const due = spDateIn(meeting.DueDate);
  return !!due && due < String(today);
}

// ── Cleaners ──────────────────────────────────────────────────────────
function _pdpBlank(v) { return v === undefined || v === null || v === ''; }

function _pdpCleanValue(list, col, def, v) {
  const where = 'PDP ' + list + '.' + col;
  switch (def.kind) {
    case 'text':  return String(v);
    case 'email': return pdpEmail(v);
    case 'bool':  return v === true || v === 'Yes' || v === 'true' || v === 1;
    case 'date':  { const d = isoDate(v); if (!d) throw new Error(where + ' is not a YYYY-MM-DD date'); return d; }
    case 'datetime': {
      const t = new Date(v);
      if (isNaN(t.getTime())) throw new Error(where + ' is not a valid date and time');
      return t.toISOString();
    }
    case 'json':  return pdpJsonField(v);
    case 'enum':  return pdpAssertEnum(where, v, def.values);
    case 'int': {
      const n = Number(v);
      if (!Number.isInteger(n)) throw new Error(where + ' must be a whole number');
      if (def.min != null && n < def.min) throw new Error(where + ' must be ' + def.min + ' or more');
      if (def.max != null && n > def.max) throw new Error(where + ' must be ' + def.max + ' or less');
      return n;
    }
    default: throw new Error(where + ': unknown kind');
  }
}

// Returns the exact payload to write. mode 'create': blank values are omitted, required columns
// must be present, a record key (Title on Cycles / Meetings / Scores) is built from its parts.
// mode 'update': only supplied columns, a blank clears (null; '' for text), keys are immutable
// so a supplied Title is ignored on a keyed list. Unknown columns are dropped.
function pdpCleanFields(listName, fields, mode, ctx) {
  const spec = _pdpCols()[listName];
  if (!spec) throw new Error('Unknown PDP list: ' + listName);
  const f = fields || {};
  const L = CONFIG.PDP.LISTS;
  const keyed = listName === L.CYCLES || listName === L.MEETINGS || listName === L.SCORES;
  const create = mode === 'create';
  if (mode !== 'create' && mode !== 'update') throw new Error('PDP mode must be create or update');

  if (create) {
    spec.required.forEach(c => { if (_pdpBlank(f[c])) throw new Error('PDP ' + listName + ': ' + c + ' is required'); });
  }
  const scoreSource = listName === L.SCORES ? ((ctx && ctx.source) || f.Source) : null;
  const out = {};
  Object.keys(spec.cols).forEach(col => {
    if (col === 'Title' && keyed) return;                       // built below, never supplied
    if (f[col] === undefined) return;
    if (_pdpBlank(f[col])) {
      if (create) return;
      out[col] = spec.cols[col].kind === 'text' ? '' : (spec.cols[col].kind === 'bool' ? false : null);
      return;
    }
    out[col] = _pdpCleanValue(listName, col, spec.cols[col], f[col]);
  });

  // Score-row ownership: only the Agreed row carries calibration and the lock.
  if (listName === L.SCORES && scoreSource !== 'Agreed') {
    delete out.CalibratedScore; delete out.CalibrationRationale; delete out.IsLocked;
  }
  if (create && keyed) {
    if (listName === L.CYCLES)   out.Title = pdpCycleKey(f.PersonID, f.CycleYear);
    if (listName === L.MEETINGS) out.Title = pdpMeetingKey(f.PersonID, f.CycleYear, f.MeetingType, f.Period);
    if (listName === L.SCORES)   out.Title = pdpScoreKey(f.MeetingID, f.PillarKey, f.Source);
  }
  return out;
}

function pdpCleanFramework(f, mode)         { return pdpCleanFields(CONFIG.PDP.LISTS.FRAMEWORK, f, mode); }
function pdpCleanTemplates(f, mode)         { return pdpCleanFields(CONFIG.PDP.LISTS.TEMPLATES, f, mode); }
function pdpCleanCycles(f, mode)            { return pdpCleanFields(CONFIG.PDP.LISTS.CYCLES, f, mode); }
function pdpCleanMeetings(f, mode)          { return pdpCleanFields(CONFIG.PDP.LISTS.MEETINGS, f, mode); }
function pdpCleanGoals(f, mode)             { return pdpCleanFields(CONFIG.PDP.LISTS.GOALS, f, mode); }
function pdpCleanActions(f, mode)           { return pdpCleanFields(CONFIG.PDP.LISTS.ACTIONS, f, mode); }
function pdpCleanScores(f, mode, source)    { return pdpCleanFields(CONFIG.PDP.LISTS.SCORES, f, mode, { source: source }); }