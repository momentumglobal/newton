// js/my-details-logic.js — My Details rules (N-456 / MM-6).
// Pure: reads CONFIG (CONFIG.MY_MOMENTUM.DETAILS) and roleCan only — no network, no DOM, no storage. Used by api-my-details.js,
// my-details-ui.js and tests/assert-my-details.js. Loads after permissions.js, before graph-client.js.
//
// One row per person in the restricted PeopleDetails list. The registry (DETAILS.FIELDS) drives the form, the cleaner and Clear, so a
// column is added in config.js and nowhere else. The cleaner can only ever emit registry columns plus the stamp: PersonID, PersonEmail
// and AccessKey are never taken from form values (AccessKey is written by the access flow alone).

function _mdCfg() { return CONFIG.MY_MOMENTUM.DETAILS; }
function _mdStr(v) { return v === undefined || v === null ? '' : String(v); }
function _mdYes(v) { return v === true || v === 1 || v === 'Yes' || v === '1' || v === 'true'; }
function _mdOff(v) { return v === false || v === 0 || v === 'No' || v === '0' || v === 'false'; }
function _mdTrim(v) { return _mdStr(v).replace(/\s+/g, ' ').trim(); }

function mdNormEmail(v) { return _mdStr(v).trim().toLowerCase(); }

// A message from CONFIG.MY_MOMENTUM.DETAILS.TEXT; {name} placeholders filled from `vars`.
function mdText(key, vars) {
  let t = _mdCfg().TEXT[key] || '';
  Object.keys(vars || {}).forEach(k => { t = t.split('{' + k + '}').join(_mdStr(vars[k])); });
  return t;
}

function mdContentKeys() { return _mdCfg().FIELDS.map(f => f.key); }

// The loop-guard key the access flow stamps on a row it has locked: the lower-cased PersonEmail.
function mdAccessKey(email) { return mdNormEmail(email); }

// Locked for the current PersonEmail. A row with no PersonEmail cannot be locked (the flow has nobody to grant).
function mdIsLocked(row) {
  return !!row && !!mdNormEmail(row.PersonEmail) && mdNormEmail(row.AccessKey) === mdAccessKey(row.PersonEmail);
}

function mdHasContent(row) {
  return !!row && mdContentKeys().some(k => _mdTrim(row[k]) !== '');
}

// The person's row: the lowest item id among rows for that PersonID (the PeoplePay rule), or null.
function mdPickRow(rows, personId) {
  const pid = Number(personId);
  const mine = (rows || []).filter(r => r && Number(r.PersonID) === pid);
  mine.sort((a, b) => Number(a.id) - Number(b.id));
  return mine[0] || null;
}

// One value as it is stored: whitespace collapsed, emails lower-cased, capped at the field's max.
function mdCleanValue(field, raw) {
  let v = _mdTrim(raw);
  if (field.kind === 'email') v = v.toLowerCase();
  return v.length > field.max ? v.slice(0, field.max) : v;
}

// { ok, errors: { key: message } }. Messages never echo the value. Empty is always valid; a group's `required` columns must all be
// set once any column of that group is (so a fully blank form is valid and clears the lot).
function mdValidate(values) {
  const C = _mdCfg();
  const errors = {};
  const val = {};
  C.FIELDS.forEach(f => { val[f.key] = _mdTrim(values && values[f.key]); });
  C.FIELDS.forEach(f => {
    const v = val[f.key];
    if (!v) return;
    if (v.length > f.max) {
      errors[f.key] = mdText('tooLong', { max: f.max });
    } else if (f.kind === 'phone') {
      const digits = v.replace(/\D/g, '').length;
      if (!/^[0-9 +().\-]+$/.test(v) || digits < C.PHONE_DIGITS.min || digits > C.PHONE_DIGITS.max) errors[f.key] = mdText('badPhone');
    } else if (f.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      errors[f.key] = mdText('badEmail');
    }
  });
  Object.keys(C.GROUPS).forEach(g => {
    const keys = C.FIELDS.filter(f => f.group === g).map(f => f.key);
    if (!keys.some(k => val[k])) return;
    C.GROUPS[g].required.forEach(k => { if (!val[k] && !errors[k]) errors[k] = mdText('required'); });
  });
  return { ok: Object.keys(errors).length === 0, errors };
}

// who = { email, onBehalf, nowISO }. The caller passes the real signed-in email (never the ghosted one) and the clock.
function mdStamp(who) {
  const w = who || {};
  return { UpdatedBy: mdNormEmail(w.email), UpdatedAt: _mdStr(w.nowISO), UpdatedOnBehalf: !!w.onBehalf };
}

// The PATCH body for a save: every registry column (cleaned; blank clears it) plus the stamp. Nothing else can appear in it.
function mdSavePayload(values, who) {
  const out = {};
  _mdCfg().FIELDS.forEach(f => { out[f.key] = mdCleanValue(f, values && values[f.key]); });
  return Object.assign(out, mdStamp(who));
}

// Clear contents: every registry column blank, stamped as an on-behalf edit. The row stays.
function mdClearPayload(who) {
  const out = {};
  _mdCfg().FIELDS.forEach(f => { out[f.key] = ''; });
  return Object.assign(out, mdStamp(Object.assign({}, who, { onBehalf: true })));
}

// A new empty row. PersonEmail is left out until the person's WorkEmail exists (Manage > Fix fills it, then the flow locks the row).
// `person` = a People row (or { id, WorkEmail }). null when there is no usable id.
function mdNewRowPayload(person) {
  const id = Number(person && person.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const out = { Title: String(id), PersonID: id };
  const email = mdNormEmail(person.WorkEmail);
  if (email) out.PersonEmail = email;
  return out;
}

function mdFixEmailPayload(person) {
  return { PersonEmail: mdNormEmail(person && person.WorkEmail) };
}

// What the signed-in person may do with `targetId`'s row. Ghost Mode reads and writes nothing (the ghosted token is the Admin's).
// `role` = the effective role; meId = the signed-in person's own People id (null if none).
function mdAccessFor(role, ghost, meId, targetId) {
  if (ghost) return { edit: false, onBehalf: false };
  const own = meId !== null && meId !== undefined && _mdStr(meId) !== '' && _mdStr(meId) === _mdStr(targetId);
  const edit = own || roleCan(role, 'myDetailsAdmin');
  return { edit, onBehalf: edit && !own };
}

function _mdEligible(people) {
  return (people || []).filter(p => p && !p.IsPlaceholder && !_mdOff(p.IsActive));
}

// People who should have a row but have none (every non-placeholder, still-active person, with or without a WorkEmail), and the
// eligible people with no WorkEmail yet (their row cannot be locked until it is set).
function mdPlanMissingRows(people, rows) {
  const have = new Set((rows || []).map(r => Number(r && r.PersonID)));
  const eligible = _mdEligible(people);
  return {
    create: eligible.filter(p => !have.has(Number(p.id))),
    noWorkEmail: eligible.filter(p => !mdNormEmail(p.WorkEmail)),
  };
}

// Rows whose PersonEmail is not the person's WorkEmail (blank counts). A person with no WorkEmail is never drift.
function mdFindDrift(people, rows) {
  const byId = new Map((people || []).filter(Boolean).map(p => [String(p.id), p]));
  const out = [];
  (rows || []).forEach(r => {
    const p = r && byId.get(String(Number(r.PersonID)));
    const want = p ? mdNormEmail(p.WorkEmail) : '';
    if (!want || mdNormEmail(r.PersonEmail) === want) return;
    out.push({ id: String(r.id), personId: Number(r.PersonID), name: p.EmployeeName || '', to: want, blank: !mdNormEmail(r.PersonEmail) });
  });
  return out;
}

// Rows with a PersonEmail that the flow has not locked after GRACE_MIN minutes (no Created = treated as old, as for the PDP lists).
function mdFindUnlocked(rows, now) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const grace = _mdCfg().GRACE_MIN;
  const out = [];
  (rows || []).forEach(r => {
    if (!r || !mdNormEmail(r.PersonEmail) || mdIsLocked(r)) return;
    const created = r.Created ? Date.parse(r.Created) : NaN;
    const ageMin = isNaN(created) ? null : Math.floor((nowMs - created) / 60000);
    if (ageMin !== null && ageMin < grace) return;
    out.push({ id: String(r.id), personId: Number(r.PersonID), ageMin });
  });
  return out.sort((a, b) => (b.ageMin === null ? Infinity : b.ageMin) - (a.ageMin === null ? Infinity : a.ageMin));
}

// PersonIDs with more than one row. [{ personId, ids }]
function mdFindDuplicates(rows) {
  const by = new Map();
  (rows || []).forEach(r => {
    const pid = Number(r && r.PersonID);
    if (!pid) return;
    if (!by.has(pid)) by.set(pid, []);
    by.get(pid).push(String(r.id));
  });
  return Array.from(by.entries()).filter(([, ids]) => ids.length > 1).map(([personId, ids]) => ({ personId, ids }));
}

// Leavers (inactive, or an EndDate before today) whose row still holds details. todayDay = 'YYYY-MM-DD' (the caller's local day).
// Day strings compared as text via spDateIn, never Date objects.
function mdFindLeavers(people, rows, todayDay) {
  const byId = new Map((people || []).filter(Boolean).map(p => [String(p.id), p]));
  const out = [];
  (rows || []).forEach(r => {
    const p = r && byId.get(String(Number(r.PersonID)));
    if (!p || p.IsPlaceholder || !mdHasContent(r)) return;
    const end = p.EndDate ? spDateIn(p.EndDate) : null;
    if (_mdOff(p.IsActive) || (end && end < todayDay)) out.push({ id: String(r.id), personId: Number(p.id), name: p.EmployeeName || '' });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// The picker's options (N-464): every non-placeholder person. [{ id, name, detail, left, label }]
// detail = Level, or the function for staff without one ('' when neither, e.g. an External). left = inactive.
// Current staff first, then leavers, each A–Z by name. label = "Name · Level" with " · Left" for a leaver.
function mdTargetOptions(people) {
  return (people || []).filter(p => p && !p.IsPlaceholder)
    .map(p => {
      const name = _mdTrim(p.EmployeeName) || '—';
      const detail = _mdTrim(p.Level) || _mdTrim(p.StaffFunction);
      const left = _mdOff(p.IsActive);
      return { id: String(p.id), name, detail, left, label: name + (detail ? ' · ' + detail : '') + (left ? ' · ' + mdText('pickerLeft') : '') };
    })
    .sort((a, b) => (a.left === b.left ? 0 : a.left ? 1 : -1) || a.name.localeCompare(b.name));
}

// N-464: the options whose NAME contains the query (case-insensitive, trimmed; plain text, never a RegExp). Empty query = all.
// Level, function and "Left" are shown beside a name but not searched. Returns a new array in the same order.
function mdFilterOptions(options, query) {
  const q = _mdTrim(query).toLowerCase();
  const list = (options || []).filter(Boolean);
  return q === '' ? list : list.filter(o => _mdStr(o.name).toLowerCase().includes(q));
}

// "Last updated 16 Nov 2026, 16:40" plus who, from the row's stamp. `nameFor(email)` gives a display name (or the email).
// ownerView: the employee reading their own row says "on your behalf"; an Admin / People Ops reader says "on behalf of the employee".
function mdStampLine(row, nameFor, ownerView) {
  const at = row ? Date.parse(_mdStr(row.UpdatedAt)) : NaN;
  if (isNaN(at)) return '';
  const when = new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  let line = mdText('lastUpdated', { when });
  if (_mdYes(row.UpdatedOnBehalf)) {
    const who = (nameFor && nameFor(mdNormEmail(row.UpdatedBy))) || mdNormEmail(row.UpdatedBy) || '—';
    line += ' ' + mdText(ownerView ? 'byOnYourBehalf' : 'byOnBehalf', { name: who });
  }
  return line;
}