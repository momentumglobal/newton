// js/pdp-data.js — PDP list rules (N-434 / PDP-2). Pure: reads CONFIG.PDP only — no network I/O,
// no DOM. Loaded after pdp-identity.js (it reuses pdpIsEmail) and utils.js (isoDate).
//
// One column spec per PDP list. Every payload written to a PDP list is produced here, so a typo'd
// column, an out-of-enum value, a malformed email or an oversized JSON blob is a readable error
// BEFORE the Graph call, not a 400 from SharePoint. Record keys (Title on Cycles / Meetings /
// Scores) are built here and nowhere else; callers never concatenate their own.

// kind: text | email | emails | int | bool | date | datetime | json | enum (+ enum name in CONFIG.PDP)
//       | flow (written by the PDP access flow only: read, never written by Newton — N-435)
function _pdpCols() {
  const P = CONFIG.PDP;
  const person = { PersonID: { kind: 'int' }, PersonEmail: { kind: 'email' } };
  const snap = { LineManagerEmail: { kind: 'email' }, CSDEmail: { kind: 'email' } };
  // N-435: last two columns of every personal list.
  const access = { ReadOnlyEmails: { kind: 'emails' }, AccessKey: { kind: 'flow' } };
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
      }, access),
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
      }, snap, access),
    },
    [P.LISTS.GOALS]: {
      required: ['Title', 'PersonID', 'PersonEmail', 'CycleYear'],
      cols: Object.assign({ Title: { kind: 'text' } }, person, { CycleYear: { kind: 'int' } }, snap, {
        GoalLevel: e(P.GOAL_LEVELS), Period: { kind: 'text' }, Category: e(P.GOAL_CATEGORIES),
        ParentGoalID: { kind: 'int' }, MeetingID: { kind: 'int' },
        WhyItMatters: { kind: 'text' }, SuccessMeasures: { kind: 'text' }, Support: { kind: 'text' },
        TargetDate: { kind: 'date' }, Rag: e(P.RAG), Status: e(P.GOAL_STATUS),
      }, access),
    },
    [P.LISTS.ACTIONS]: {
      required: ['Title', 'PersonID', 'PersonEmail'],
      cols: Object.assign({ Title: { kind: 'text' } }, person, snap, {
        MeetingID: { kind: 'int' }, GoalID: { kind: 'int' }, OwnerRole: e(P.OWNER_ROLES),
        OwnerEmail: { kind: 'email' }, DueDate: { kind: 'date' }, IsDone: { kind: 'bool' },
        DoneAt: { kind: 'datetime' },
      }, access),
    },
    [P.LISTS.SCORES]: {
      required: ['PersonID', 'PersonEmail', 'CycleYear', 'MeetingID', 'PillarKey', 'Source'],
      cols: Object.assign({ Title: { kind: 'text' } }, person, { CycleYear: { kind: 'int' } }, snap, {
        MeetingID: { kind: 'int' }, PillarKey: { kind: 'text' }, Source: e(P.SCORE_SOURCES),
        ScoringLevel: e(P.LEVELS), Score: { kind: 'int', min: P.SCORE_MIN, max: P.SCORE_MAX },
        Rationale: { kind: 'text' }, SubmittedAt: { kind: 'datetime' },
        CalibratedScore: { kind: 'int', min: P.SCORE_MIN, max: P.SCORE_MAX },
        CalibrationRationale: { kind: 'text' }, IsLocked: { kind: 'bool' },
      }, access),
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

// N-435: ReadOnlyEmails form. An array or a ';' / ',' / whitespace separated string in; every entry
// validated by pdpEmail (a bad one throws), blanks dropped, de-duplicated, sorted, joined with
// CONFIG.PDP.ACCESS.EMAIL_SEP and no spaces. None left = ''. The PDP access flow splits on the
// same separator, so this is the only shape ever stored.
function pdpEmailList(value) {
  const parts = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[;,\s]+/);
  const set = new Set(parts.map(pdpEmail).filter(Boolean));
  return [...set].sort().join(CONFIG.PDP.ACCESS.EMAIL_SEP);
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
    case 'emails': return pdpEmailList(v);
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
    if (spec.cols[col].kind === 'flow') return;                 // N-435: AccessKey is the flow's alone
    if (f[col] === undefined) return;
    const kind = spec.cols[col].kind;
    if (_pdpBlank(f[col]) || (kind === 'emails' && !pdpEmailList(f[col]))) {
      if (create) return;
      out[col] = (kind === 'text' || kind === 'emails') ? '' : (kind === 'bool' ? false : null);
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

// ── N-435 (PDP-3): access state, "past" items, re-point plan (pure) ──────
// The five personal lists, in CONFIG.PDP.PERSONAL_LIST_KEYS order.
function pdpPersonalLists() {
  return CONFIG.PDP.PERSONAL_LIST_KEYS.map(k => CONFIG.PDP.LISTS[k]);
}

// The key the PDP access flow stamps on an item once its permissions match its snapshot. MUST be
// character-for-character the flow's trigger-condition expression:
//   toLower(concat(coalesce(PersonEmail,''),'|',coalesce(LineManagerEmail,''),'|',
//                  coalesce(CSDEmail,''),'|',coalesce(ReadOnlyEmails,'')))
// No trimming on either side: Newton only ever writes these columns lower-cased and trimmed.
function pdpAccessKey(item) {
  const it = item || {};
  return ['PersonEmail', 'LineManagerEmail', 'CSDEmail', 'ReadOnlyEmails']
    .map(c => (it[c] == null ? '' : String(it[c]))).join('|').toLowerCase();
}

// True once the flow has locked the item for its CURRENT snapshot.
function pdpIsSecured(item) {
  return !!item && typeof item.AccessKey === 'string' && item.AccessKey !== '' && item.AccessKey === pdpAccessKey(item);
}

// Items not (or no longer) locked for their snapshot, older than CONFIG.PDP.ACCESS.UNSECURED_GRACE_MIN
// by Created (no Created = treated as old). `itemsByList` = { listName: [items] }; `now` = Date or ms.
// [{ list, id, personId, ageMin }], oldest first.
function pdpUnsecuredItems(itemsByList, now) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const grace = CONFIG.PDP.ACCESS.UNSECURED_GRACE_MIN;
  const out = [];
  Object.keys(itemsByList || {}).forEach(list => {
    (itemsByList[list] || []).forEach(it => {
      if (pdpIsSecured(it)) return;
      const created = it && it.Created ? Date.parse(it.Created) : NaN;
      const ageMin = isNaN(created) ? null : Math.floor((nowMs - created) / 60000);
      if (ageMin !== null && ageMin < grace) return;
      out.push({ list, id: String(it.id), personId: it.PersonID, ageMin });
    });
  });
  return out.sort((a, b) => (b.ageMin === null ? Infinity : b.ageMin) - (a.ageMin === null ? Infinity : a.ageMin));
}

// "Past" drives who keeps read after a ReportsTo change (PDP-D14). Meetings Held / SignedOff /
// Skipped; Cycles Closed; Goals Achieved / Dropped; Actions done; a Score when its meeting is
// past (a missing meeting is not past). `meetingsById` = Map(String(id) -> meeting).
function pdpIsPastItem(listName, item, meetingsById) {
  const L = CONFIG.PDP.LISTS;
  if (!item) return false;
  if (listName === L.MEETINGS) return ['Held', 'SignedOff', 'Skipped'].includes(item.Status);
  if (listName === L.CYCLES)   return item.Status === 'Closed';
  if (listName === L.GOALS)    return item.Status === 'Achieved' || item.Status === 'Dropped';
  if (listName === L.ACTIONS)  return item.IsDone === true || item.IsDone === 'Yes';
  if (listName === L.SCORES) {
    const m = meetingsById && meetingsById.get(String(item.MeetingID));
    return !!m && pdpIsPastItem(L.MEETINGS, m, meetingsById);
  }
  return false;
}

function _pdpRoList(v) { return v ? String(v).split(CONFIG.PDP.ACCESS.EMAIL_SEP).filter(Boolean) : []; }

// The re-point plan (PDP-D6 + PDP-D14). For each item: resolve its person (PersonID -> People row)
// to their current line manager and CSD; if the snapshot differs, patch LineManagerEmail / CSDEmail.
// For a PAST item the old LM / CSD are added to ReadOnlyEmails (not blanks, not the person, not the
// new LM / CSD). The current LM / CSD are always taken out of ReadOnlyEmails (they have edit).
// Patches hold only the changed keys among LineManagerEmail, CSDEmail, ReadOnlyEmails — never
// PersonEmail, AccessKey or content. An item whose person cannot be resolved is listed, not
// patched (reason: noPerson | noWorkEmail | noLineManager | noCsd), so access is never stripped
// on a broken chain. `ids` (optional) limits the plan to those PersonIDs.
// -> { rows: [{ list, id, personId, personName, source, from: { lm, csd }, to: { lm, csd }, patch }],
//      unresolved: [{ list, id, personId, reason }] }
function pdpBuildRepointPlan(people, itemsByList, ids) {
  const L = CONFIG.PDP.LISTS;
  const real = (people || []).filter(p => p && !p.IsPlaceholder);
  const index = pdpEmailIndex(real);
  const byId = new Map(real.map(p => [String(p.id), p]));
  const only = ids ? new Set(ids.map(String)) : null;
  const meetingsById = new Map(((itemsByList || {})[L.MEETINGS] || []).map(m => [String(m.id), m]));
  const resolved = new Map();
  const resolve = pid => {
    if (resolved.has(pid)) return resolved.get(pid);
    const p = byId.get(pid);
    let r;
    if (!p) r = { reason: 'noPerson' };
    else if (!_pdpEmail(p.WorkEmail) || (index.get(_pdpEmail(p.WorkEmail)) || []).length !== 1) r = { reason: 'noWorkEmail' };
    else {
      const rv = pdpReviewerEmails(index, p);
      r = rv.lm ? { person: p, lm: rv.lm, csd: rv.csd } : { reason: 'noLineManager' };
    }
    resolved.set(pid, r);
    return r;
  };
  const rows = [];
  const unresolved = [];
  pdpPersonalLists().forEach(list => {
    ((itemsByList || {})[list] || []).forEach(it => {
      const pid = String(it.PersonID);
      if (only && !only.has(pid)) return;
      const r = resolve(pid);
      const oldLm = _pdpEmail(it.LineManagerEmail);
      const oldCsd = _pdpEmail(it.CSDEmail);
      if (r.reason) { unresolved.push({ list, id: String(it.id), personId: it.PersonID, reason: r.reason }); return; }
      if (!r.csd && oldCsd) { unresolved.push({ list, id: String(it.id), personId: it.PersonID, reason: 'noCsd' }); return; }
      const self = _pdpEmail(it.PersonEmail);
      const ro = new Set(_pdpRoList(it.ReadOnlyEmails).map(_pdpEmail));
      if (pdpIsPastItem(list, it, meetingsById)) {
        [oldLm, oldCsd].forEach(e => { if (e && e !== self && e !== r.lm && e !== r.csd) ro.add(e); });
      }
      ro.delete(r.lm); ro.delete(r.csd);
      const after = [...ro].filter(Boolean).sort().join(CONFIG.PDP.ACCESS.EMAIL_SEP);
      const patch = {};
      if (oldLm !== r.lm) patch.LineManagerEmail = r.lm;
      if (oldCsd !== r.csd) patch.CSDEmail = r.csd;
      if (after !== String(it.ReadOnlyEmails || '')) patch.ReadOnlyEmails = after;
      if (!Object.keys(patch).length) return;
      rows.push({
        list, id: String(it.id), personId: it.PersonID, personName: (r.person && r.person.EmployeeName) || '',
        source: it.Source || '', from: { lm: oldLm, csd: oldCsd }, to: { lm: r.lm, csd: r.csd }, patch,
      });
    });
  });
  return { rows, unresolved };
}

// PersonIDs whose resolved line manager or CSD differs between two People snapshots (e.g. before
// and after an Org Chart save) — including everyone downstream of a manager whose own line moved.
function pdpAffectedPeople(peopleBefore, peopleAfter) {
  const reviewers = list => {
    const real = (list || []).filter(p => p && !p.IsPlaceholder);
    const index = pdpEmailIndex(real);
    return new Map(real.map(p => { const r = pdpReviewerEmails(index, p); return [String(p.id), r.lm + '|' + r.csd]; }));
  };
  const a = reviewers(peopleBefore);
  const b = reviewers(peopleAfter);
  const ids = new Set();
  b.forEach((v, id) => { if (a.get(id) !== v) ids.add(id); });
  a.forEach((v, id) => { if (!b.has(id)) ids.add(id); });
  return [...ids].sort((x, y) => Number(x) - Number(y));
}
