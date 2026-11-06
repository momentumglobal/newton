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
        SortOrder: { kind: 'int' }, IsActive: { kind: 'bool' }, UpdatedBy: { kind: 'email' },   // N-436: who last edited the row
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

// ── N-436 (PDP-4): framework + template rules (pure) ───────────────────
// The editors on People > PDP Setup, the seed and the engine/screens that read the framework or a
// template all go through these. Row shapes are the SharePoint rows as getItems returns them.

function _pdpNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function _pdpTrim(v) { return String(v == null ? '' : v).trim(); }
function _pdpBand(rows, level, track) {
  return (rows || []).filter(r => r.Level === level && r.Track === track);
}

// The six pillar keys with their SortOrder (1-6). Names are data (framework rows / seed), keys are not.
function pdpPillarKeys() { return CONFIG.PDP.PILLAR_KEYS.slice(); }

// Pillar [{ key, name }] in order: the name from any framework row for that key, else `fallback`
// ([{ key, name }], e.g. PDP_SEED.pillars), else the key itself.
function pdpPillarsFrom(rows, fallback) {
  const fb = {};
  (fallback || []).forEach(p => { fb[p.key] = p.name; });
  return CONFIG.PDP.PILLAR_KEYS.map(key => {
    const hit = (rows || []).find(r => r.PillarKey === key && _pdpTrim(r.Pillar));
    return { key: key, name: hit ? _pdpTrim(hit.Pillar) : (fb[key] || key) };
  });
}

// Label only (never read for logic): "L3 · MG · Own It · Meets".
function pdpFrameworkTitle(level, track, pillarName, band) {
  const short = _pdpTrim(pillarName).replace(/^We\s+/i, '').replace(/\s+&.*$/, '').replace(/\s+with\s+.*$/i, '');
  return [level, track, short, band].join(' · ');
}

// One entry per level x track that has any row: { level, track, rows, complete, active }.
// Sorted by CONFIG.PDP.LEVELS then CONFIG.PDP.TRACKS.
function pdpFrameworkLevels(rows) {
  const seen = {}, out = [];
  (rows || []).forEach(r => {
    if (!CONFIG.PDP.LEVELS.includes(r.Level) || !CONFIG.PDP.TRACKS.includes(r.Track)) return;
    const k = r.Level + '|' + r.Track;
    if (seen[k]) return;
    seen[k] = true;
    const set = _pdpBand(rows, r.Level, r.Track);
    out.push({
      level: r.Level, track: r.Track, rows: set.length,
      complete: pdpFrameworkComplete(rows, r.Level, r.Track),
      active: set.length > 0 && set.every(x => x.IsActive === true),
    });
  });
  return out.sort((a, b) =>
    CONFIG.PDP.LEVELS.indexOf(a.level) - CONFIG.PDP.LEVELS.indexOf(b.level)
    || CONFIG.PDP.TRACKS.indexOf(a.track) - CONFIG.PDP.TRACKS.indexOf(b.track));
}

// The editable grid for one level x track: pillars in order, three bands each.
// -> { level, track, active, written, total, pillars: [{ key, name, order, bands: { Below: { id, text }, ... } }] }
function pdpFrameworkSet(rows, level, track) {
  const set = _pdpBand(rows, level, track);
  const names = pdpPillarsFrom(set, null);
  let written = 0;
  const pillars = names.map((p, i) => {
    const bands = {};
    CONFIG.PDP.BANDS.forEach(b => {
      const r = set.find(x => x.PillarKey === p.key && x.Band === b);
      const text = r ? _pdpTrim(r.Descriptor) : '';
      if (text) written++;
      bands[b] = { id: r ? r.id : null, text: text };
    });
    return { key: p.key, name: p.name, order: i + 1, bands: bands };
  });
  return {
    level: level, track: track, written: written, total: pillars.length * CONFIG.PDP.BANDS.length,
    active: set.length > 0 && set.every(x => x.IsActive === true), pillars: pillars,
  };
}

// True only when all six pillars x three bands have a non-blank descriptor (whitespace-only is
// blank). N-442 reads this: scoring stays off for a level/track that is not complete (PDP-D5).
function pdpFrameworkComplete(rows, level, track) {
  const s = pdpFrameworkSet(rows, level, track);
  return s.written === s.total;
}

// Latest edit across a set: { by, at } from the row with the newest Modified (read with Modified selected).
function pdpFrameworkAudit(rows, level, track) {
  let best = null;
  _pdpBand(rows, level, track).forEach(r => {
    if (r.Modified && (!best || String(r.Modified) > String(best.Modified))) best = r;
  });
  return best ? { by: _pdpTrim(best.UpdatedBy), at: best.Modified } : { by: '', at: '' };
}

// Plan a save of one level x track. `edit` = { descriptors: { pillarKey: { Below, Meets, Exceeding } },
// isActive }. Either part may be left out. Returns { updates: [{ id, fields }], creates: [fields] };
// nothing is written here. Activating a set that is not complete throws.
function pdpFrameworkPlanSave(rows, level, track, edit, by, fallbackPillars) {
  pdpAssertEnum('Level', level, CONFIG.PDP.LEVELS);
  pdpAssertEnum('Track', track, CONFIG.PDP.TRACKS);
  const set = _pdpBand(rows, level, track);
  if (!set.length) throw new Error('Add ' + level + ' / ' + track + ' to the framework first.');
  const e = edit || {};
  const who = pdpEmail(by);
  const names = pdpPillarsFrom(rows, fallbackPillars);
  const upd = {}, creates = [], merged = {};
  const max = CONFIG.PDP.TEMPLATE_LIMITS.DESCRIPTOR_MAX;
  names.forEach((p, i) => {
    CONFIG.PDP.BANDS.forEach(b => {
      const row = set.find(x => x.PillarKey === p.key && x.Band === b);
      const given = e.descriptors && e.descriptors[p.key] ? e.descriptors[p.key][b] : undefined;
      const oldText = row ? _pdpTrim(row.Descriptor) : '';
      const text = given === undefined ? oldText : _pdpTrim(given);
      if (text.length > max) throw new Error(p.name + ' (' + b + '): the descriptor is ' + text.length + ' characters; the limit is ' + max + '.');
      merged[p.key + '|' + b] = text;
      if (row && text !== oldText) upd[row.id] = Object.assign(upd[row.id] || {}, { Descriptor: text, UpdatedBy: who });
      if (!row && text) creates.push({ Title: pdpFrameworkTitle(level, track, p.name, b), Level: level, Track: track, PillarKey: p.key, Pillar: p.name, Band: b, Descriptor: text, SortOrder: i + 1, IsActive: false, UpdatedBy: who });
    });
  });
  const complete = Object.keys(merged).every(k => merged[k] !== '') && Object.keys(merged).length === names.length * CONFIG.PDP.BANDS.length;
  const wasActive = set.every(x => x.IsActive === true);
  const want = e.isActive === undefined ? wasActive : !!e.isActive;
  if (want && !complete) throw new Error(level + ' / ' + track + ' cannot be switched on until all ' + (names.length * CONFIG.PDP.BANDS.length) + ' descriptors are written.');
  set.forEach(r => { if ((r.IsActive === true) !== want) upd[r.id] = Object.assign(upd[r.id] || {}, { IsActive: want, UpdatedBy: who }); });
  creates.forEach(c => { c.IsActive = want; });
  return { updates: Object.keys(upd).map(id => ({ id: id, fields: upd[id] })), creates: creates };
}

// A new, blank, inactive level x track: 18 rows. Throws when the set already exists.
function pdpFrameworkPlanAdd(rows, level, track, by, fallbackPillars) {
  pdpAssertEnum('Level', level, CONFIG.PDP.LEVELS);
  pdpAssertEnum('Track', track, CONFIG.PDP.TRACKS);
  if (_pdpBand(rows, level, track).length) throw new Error(level + ' / ' + track + ' is already in the framework.');
  const who = pdpEmail(by);
  const out = [];
  pdpPillarsFrom(rows, fallbackPillars).forEach((p, i) => {
    CONFIG.PDP.BANDS.forEach(b => out.push({ Title: pdpFrameworkTitle(level, track, p.name, b), Level: level, Track: track, PillarKey: p.key, Pillar: p.name, Band: b, SortOrder: i + 1, IsActive: false, UpdatedBy: who }));
  });
  return out;
}

// Create-only seed plan. `seed` is PDP_SEED (pdp-seed.js), `by` the seeding user's email, `nowIso` an
// instant. Framework: any missing level x track x pillar x band row is created (IsActive only where the
// seed has text). Templates: a meeting type with ANY existing row is skipped, otherwise v1 Published.
// Existing rows are never changed. -> { framework: [fields], templates: [fields] }
function pdpSeedPlan(frameworkRows, templateRows, seed, by, nowIso) {
  const who = by ? pdpEmail(by) : '';
  const have = {};
  (frameworkRows || []).forEach(r => { have[r.Level + '|' + r.Track + '|' + r.PillarKey + '|' + r.Band] = true; });
  const names = pdpPillarsFrom(frameworkRows, seed.pillars);
  const framework = [];
  seed.framework.forEach(set => {
    names.forEach((p, i) => {
      CONFIG.PDP.BANDS.forEach(b => {
        if (have[set.level + '|' + set.track + '|' + p.key + '|' + b]) return;
        const text = set.descriptors && set.descriptors[p.key] ? _pdpTrim(set.descriptors[p.key][b]) : '';
        const f = { Title: pdpFrameworkTitle(set.level, set.track, p.name, b), Level: set.level, Track: set.track, PillarKey: p.key, Pillar: p.name, Band: b, SortOrder: i + 1, IsActive: !!set.descriptors };
        if (text) f.Descriptor = text;
        if (who) f.UpdatedBy = who;
        framework.push(f);
      });
    });
  });
  const templates = [];
  CONFIG.PDP.MEETING_TYPES.forEach(type => {
    if ((templateRows || []).some(r => r.MeetingType === type) || !seed.templates[type]) return;
    const f = { Title: pdpTemplateTitle(type, 1), MeetingType: type, VersionNo: 1, Status: 'Published', Definition: seed.templates[type] };
    if (nowIso) f.PublishedAt = nowIso;
    if (who) f.PublishedBy = who;
    templates.push(f);
  });
  return { framework: framework, templates: templates };
}

// ── Templates ──────────────────────────────────────────────────────────
function pdpTemplateTitle(meetingType, versionNo) {
  return (CONFIG.PDP.MEETING_LABELS[meetingType] || meetingType) + ' v' + versionNo;
}

function _pdpTplRows(rows, type) { return (rows || []).filter(r => r.MeetingType === type); }

// The version in force: highest VersionNo among Published rows of the type (null when none). If a
// retire write ever failed and two are Published, the higher number wins.
function pdpActiveTemplate(rows, meetingType) {
  let best = null;
  _pdpTplRows(rows, meetingType).forEach(r => {
    if (r.Status === 'Published' && (!best || _pdpNum(r.VersionNo) > _pdpNum(best.VersionNo))) best = r;
  });
  return best;
}

// The open Draft of a type (newest if several), or null. One Draft per type is the rule.
function pdpTemplateDraft(rows, meetingType) {
  let best = null;
  _pdpTplRows(rows, meetingType).forEach(r => {
    if (r.Status === 'Draft' && (!best || _pdpNum(r.VersionNo) > _pdpNum(best.VersionNo))) best = r;
  });
  return best;
}

// Published and Retired rows are immutable (PDP-D7).
function pdpTemplateEditable(row) { return !!row && row.Status === 'Draft'; }

// Highest VersionNo of the type, any status, plus one (1 when the type has no rows).
function pdpNextVersionNo(rows, meetingType) {
  return _pdpTplRows(rows, meetingType).reduce((m, r) => Math.max(m, _pdpNum(r.VersionNo)), 0) + 1;
}

// Block key from a label: lower-case a-z 0-9 and hyphens, 40 characters at most, unique among
// `existing` (array or Set). Issued once; never recomputed when a label is edited.
function pdpBlockKey(label, existing) {
  const used = existing instanceof Set ? existing : new Set(existing || []);
  const base = _pdpTrim(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'item';
  let key = base, n = 2;
  while (used.has(key)) {
    const suf = '-' + n++;
    key = base.slice(0, 40 - suf.length) + suf;
  }
  return key;
}

function pdpBlankDefinition() {
  return { schema: 1, sections: [{ key: 'section-1', title: 'New section', blocks: [] }] };
}

// Every key already used in a definition (sections and blocks share one namespace per kind, so the
// two sets are returned separately).
function pdpDefinitionKeys(def) {
  const sections = new Set(), blocks = new Set();
  ((def && def.sections) || []).forEach(s => {
    sections.add(s.key);
    (s.blocks || []).forEach(b => blocks.add(b.key));
  });
  return { sections: sections, blocks: blocks };
}

// A new block of `type` with defaults the editor can show immediately.
function pdpNewBlock(type, def) {
  pdpAssertEnum('block type', type, CONFIG.PDP.BLOCK_TYPES);
  const T = CONFIG.PDP.BLOCK_TYPES;
  const label = { prepQuestion: 'New question', prompt: 'New discussion note', goalSet: 'Agree goals', goalReview: 'Review goals', actions: 'Actions', scoring: 'Score each pillar' }[type];
  const b = { key: pdpBlockKey(label, pdpDefinitionKeys(def).blocks), type: type, label: label, hint: '', required: type === 'scoring' };
  if (type === T[0]) b.by = CONFIG.PDP.BLOCK_BY[0];
  if (type === 'goalSet') { b.level = CONFIG.PDP.GOAL_LEVELS[0]; b.min = 1; b.max = 3; }
  if (type === 'goalReview') b.by = CONFIG.PDP.REVIEW_BY[1];
  if (type === 'actions') b.max = 3;
  return b;
}

// Move item i of an array by dir (-1 / +1). Returns a new array; out of range returns a copy.
function pdpMoveItem(arr, i, dir) {
  const out = (arr || []).slice(), j = i + dir;
  if (i < 0 || i >= out.length || j < 0 || j >= out.length) return out;
  const t = out[i]; out[i] = out[j]; out[j] = t;
  return out;
}

// Publish gate. `def` = object or JSON text. -> { ok, errors: [string] }
function pdpValidateTemplate(def, meetingType) {
  const P = CONFIG.PDP, L = P.TEMPLATE_LIMITS, errors = [];
  let d = def;
  if (typeof d === 'string') {
    d = pdpParseJson(d);
    if (!d) return { ok: false, errors: ['The template is not valid JSON.'] };
  }
  if (!d || typeof d !== 'object' || d.schema !== 1 || !Array.isArray(d.sections)) {
    return { ok: false, errors: ['The template must have schema 1 and a list of sections.'] };
  }
  if (!P.MEETING_TYPES.includes(meetingType)) errors.push('Unknown meeting type.');
  const keyRe = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const bad = (s) => /[<>]/.test(s);
  const text = (what, v, max, required) => {
    const s = _pdpTrim(v);
    if (required && !s) errors.push(what + ' cannot be blank.');
    if (s.length > max) errors.push(what + ' is too long (' + s.length + ' of ' + max + ').');
    if (bad(s)) errors.push(what + ' cannot contain < or >.');
  };
  if (!d.sections.length) errors.push('Add at least one section.');
  if (d.sections.length > L.MAX_SECTIONS) errors.push('At most ' + L.MAX_SECTIONS + ' sections.');
  const sKeys = new Set(), bKeys = new Set();
  let blocks = 0, scoring = 0;
  d.sections.forEach((s, si) => {
    const sName = 'Section ' + (si + 1) + (_pdpTrim(s && s.title) ? ' "' + _pdpTrim(s.title) + '"' : '');
    if (!s || typeof s !== 'object') { errors.push(sName + ' is not valid.'); return; }
    if (!keyRe.test(String(s.key || ''))) errors.push(sName + ' has an invalid key.');
    else if (sKeys.has(s.key)) errors.push(sName + ' repeats the key "' + s.key + '".');
    sKeys.add(s.key);
    text(sName + ' title', s.title, L.TITLE_MAX, true);
    if (!Array.isArray(s.blocks)) { errors.push(sName + ' has no block list.'); return; }
    s.blocks.forEach((b, bi) => {
      blocks++;
      const bName = sName + ', item ' + (bi + 1) + (_pdpTrim(b && b.label) ? ' "' + _pdpTrim(b.label) + '"' : '');
      if (!b || typeof b !== 'object') { errors.push(bName + ' is not valid.'); return; }
      if (!keyRe.test(String(b.key || ''))) errors.push(bName + ' has an invalid key.');
      else if (bKeys.has(b.key)) errors.push(bName + ' repeats the key "' + b.key + '".');
      bKeys.add(b.key);
      if (!P.BLOCK_TYPES.includes(b.type)) { errors.push(bName + ' has an unknown type "' + b.type + '".'); return; }
      text(bName + ' label', b.label, L.LABEL_MAX, true);
      if (b.hint !== undefined && b.hint !== null) text(bName + ' hint', b.hint, L.HINT_MAX, false);
      if (b.required !== undefined && typeof b.required !== 'boolean') errors.push(bName + ': "required" must be true or false.');
      if (b.type === 'prepQuestion' && !P.BLOCK_BY.includes(b.by)) errors.push(bName + ' needs "by" employee or manager.');
      if (b.type === 'goalReview' && !P.REVIEW_BY.includes(b.by)) errors.push(bName + ' needs "by" employee or meeting.');
      if (b.type === 'goalSet') {
        if (!P.GOAL_LEVELS.includes(b.level)) errors.push(bName + ' needs a goal level.');
        if (!(Number.isInteger(b.min) && Number.isInteger(b.max) && b.min >= 1 && b.min <= b.max && b.max <= L.GOALS_MAX)) {
          errors.push(bName + ': goals must be 1 to ' + L.GOALS_MAX + ' with the minimum no higher than the maximum.');
        }
      }
      if (b.type === 'actions' && !(Number.isInteger(b.max) && b.max >= 1 && b.max <= L.ACTIONS_MAX)) {
        errors.push(bName + ': the action limit must be 1 to ' + L.ACTIONS_MAX + '.');
      }
      if (b.type === 'scoring') {
        scoring++;
        if (meetingType !== 'BiAnnual') errors.push(bName + ': scoring is only for the Bi-Annual review.');
      }
    });
  });
  if (blocks > L.MAX_BLOCKS) errors.push('At most ' + L.MAX_BLOCKS + ' items in a template.');
  if (scoring > 1) errors.push('Only one scoring item is allowed.');
  if (meetingType === 'BiAnnual' && scoring === 0) errors.push('The Bi-Annual review needs one scoring item.');
  if (JSON.stringify(d).length > P.JSON_MAX_CHARS) errors.push('The template is too long to save (limit ' + P.JSON_MAX_CHARS + ' characters).');
  return { ok: errors.length === 0, errors: errors };
}
