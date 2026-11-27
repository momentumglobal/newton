// js/weekly-activity-logic.js — N-548 (AMCP-4): the weekly-activity rules, DOM-free.
//
// One rule set for every writer of a WeeklyActivity row: the single-role form (forms-weekly.js),
// the bulk grid (bulk-activity.js), mobile quick-log (mobile-pages.js) and the Newton for Claude
// log_weekly_activity tool (mcp/newton-write-tools.js). Declarations only — no DOM, no Graph, nothing
// runs at load. Loads after utils.js and before forms-weekly.js / bulk-activity.js / mobile-pages.js
// in reporting.html and mobile.html, and in CONFIG.MCP.scripts. Runtime dependencies (call time only):
// getISOWeek / isoDate / spDateIn / addDaysISO / sundayOnOrAfterISO (utils.js), tpList (api.js).
//
// Conventions kept exactly as the UIs always had them (specs/N-548.md Gotchas):
//  * WeekEndingDate is the SUNDAY of the week. Yeare is read off the day STRING and WeekNumber from
//    getISOWeek(day) — never new Date(...).getFullYear(), which shifts a boundary day under BST (N-129).
//  * Field names are ASYMMETRIC: write Yeare / InterviewTwoPlus; the same values read back as Year /
//    Interview2Plus (FIELD_ALIASES.WeeklyActivity). `key` is the read name, `writeKey` the write name.

// The nine funnel counts, in funnel order. label = the bulk-grid column head; name = the full label.
const WEEKLY_COUNT_FIELDS = [
  { key: 'Outreach',       writeKey: 'Outreach',         label: 'Outreach',  name: 'Outreach' },
  { key: 'Responses',      writeKey: 'Responses',        label: 'Responses', name: 'Responses' },
  { key: 'Screened',       writeKey: 'Screened',         label: 'Screened',  name: 'Screened' },
  { key: 'Submitted',      writeKey: 'Submitted',        label: 'Submitted', name: 'Submitted' },
  { key: 'Interview1',     writeKey: 'Interview1',       label: 'IV1',       name: 'Interview 1' },
  { key: 'Interview2Plus', writeKey: 'InterviewTwoPlus', label: 'IV2+',      name: 'Interview 2+' },
  { key: 'FinalInterview', writeKey: 'FinalInterview',   label: 'Final IV',  name: 'Final interview' },
  { key: 'Offers',         writeKey: 'Offers',           label: 'Offers',    name: 'Offers' },
  { key: 'Hires',          writeKey: 'Hires',            label: 'Hires',     name: 'Hires' },
];

// Which Talent Partner a weekly row is written against. Prefers the signed-in user when they are one
// of the role's owners, so a TP logging their own week is always attributed to them; otherwise the
// first listed owner. Returns null when the role has NO owner — the caller must render that row
// disabled and exclude it from the save rather than attributing someone else's week to the user.
// (N-147 / N-237b; moved here from bulk-activity.js by N-548, body unchanged.)
function resolveRowTalentPartner(roleTalentPartnerValue, currentUserEmail) {
  const list = tpList(roleTalentPartnerValue);
  if (!list.length) return null;
  const me = String(currentUserEmail || '').trim().toLowerCase();
  return (me && list.includes(me)) ? me : list[0];
}

// One row per role x TalentPartner x week; the bulk grid's lookup key (role id | lower-case TP).
function weeklyRowKey(roleId, tpEmail) {
  return `${String(roleId === undefined || roleId === null ? '' : roleId)}|${String(tpEmail || '').trim().toLowerCase()}`;
}

// The stored row for a role x TP x week among `rows` (one role's WeeklyActivity rows, read names).
// { kind: 'none' | 'one' | 'many', row }. The week matches on the stored day string (spDateIn), so a
// row stored off-Sunday is not matched — as the bulk grid, whose lookup is an exact-date read.
function weeklyFindExisting(rows, roleId, tpEmail, sunday) {
  const key = weeklyRowKey(roleId, tpEmail);
  const hits = (rows || []).filter(r => {
    if (!r) return false;
    const rid = String(r.RoleIDLookupId || r.RoleID || '');
    return weeklyRowKey(rid, r.TalentPartner) === key
      && (r.WeekEndingDate ? spDateIn(r.WeekEndingDate) : null) === sunday;
  });
  return { kind: hits.length === 0 ? 'none' : (hits.length === 1 ? 'one' : 'many'), row: hits[0] || null };
}

// The Sunday a user-given week means. `input`: 'YYYY-MM-DD' (any day -> the Sunday on/after it),
// 'this week', 'last week', or blank (= this week). `today` = 'YYYY-MM-DD'. String maths only (F-12).
function weeklyResolveWeek(input, today) {
  const raw = String(input === undefined || input === null ? '' : input).trim().toLowerCase();
  const thisSunday = sundayOnOrAfterISO(today);
  if (!raw || raw === 'this week') return thisSunday;
  if (raw === 'last week') return addDaysISO(thisSunday, -7);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && addDaysISO(raw, 0) === raw) return sundayOnOrAfterISO(raw);
  throw new Error('The week must be a date (YYYY-MM-DD), "this week" or "last week".');
}

// A message when `sunday` is a week that has not ended yet beyond this one (weeks ahead are never
// logged); null when it is this week or earlier.
function weeklyWeekRefusal(sunday, today) {
  return sunday > sundayOnOrAfterISO(today)
    ? 'That week is in the future. Newton takes activity for this week or earlier.'
    : null;
}

// Strict counts for the Claude tool: only the supplied ones, each a whole number >= 0.
// `raw` is keyed by WEEKLY_COUNT_FIELDS key. -> { ok, counts, errors }.
function weeklyCleanCounts(raw) {
  const counts = {};
  const errors = [];
  WEEKLY_COUNT_FIELDS.forEach(f => {
    const v = raw ? raw[f.key] : undefined;
    if (v === undefined || v === null) return;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      errors.push(`${f.name} must be a whole number, 0 or more.`);
      return;
    }
    counts[f.key] = v;
  });
  return { ok: errors.length === 0, counts, errors };
}

// The body of a WeeklyActivity create, shared by every writer. `counts` is keyed by `key` and
// coerced the way the forms always did (parseInt || 0). projectId may be omitted (mobile quick-log:
// createWeeklyActivity derives it from the role). `now` = the write instant, an ISO string.
function weeklyFields({ projectId, roleId, tpEmail, weekEnding, counts, now }) {
  const fields = {};
  if (projectId !== undefined && projectId !== null) fields.ProjectIDLookupId = parseInt(projectId, 10);
  fields.RoleIDLookupId = parseInt(roleId, 10);
  fields.TalentPartner  = tpEmail || undefined;
  fields.Yeare          = Number(weekEnding.slice(0, 4));
  fields.WeekNumber     = getISOWeek(weekEnding);
  fields.WeekEndingDate = isoDate(weekEnding);
  WEEKLY_COUNT_FIELDS.forEach(f => {
    fields[f.writeKey] = parseInt(counts && counts[f.key], 10) || 0;
  });
  fields.SubmittedAt = now;
  return fields;
}

// The body of an edit from the Claude tool: only the supplied counts (by write name) + SubmittedAt.
// An edit never moves a row to another role, person or week.
function weeklyEditFields(counts, now) {
  const fields = {};
  WEEKLY_COUNT_FIELDS.forEach(f => {
    if (counts && counts[f.key] !== undefined && counts[f.key] !== null) fields[f.writeKey] = Number(counts[f.key]);
  });
  fields.SubmittedAt = now;
  return fields;
}

// Should the user be prompted to record a placement? A saved Hires > 0 on a create, or Hires rising
// on an edit.
function weeklyHiresTrigger({ isCreate, before, after }) {
  const a = Number(after) || 0;
  return a > 0 && (!!isCreate || a > (Number(before) || 0));
}
