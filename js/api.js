// js/api.js — Graph API data layer
const GRAPH = "https://graph.microsoft.com/v1.0";
 
// ── In-memory read cache ──────────────────────────────────────────────
// Caches GET results for 30 seconds to avoid redundant SharePoint calls
// during page navigation. Writes (POST/PATCH/DELETE) invalidate the
// relevant list automatically.
const _apiCache = new Map();
const _CACHE_TTL_MS = 30000; // 30 seconds
 
function _cacheKey(listName, filter, selectStr) {
  return listName + '|' + (filter || '') + '|' + (selectStr || '*');
}
function _cacheGet(listName, filter, selectStr) {
  const entry = _apiCache.get(_cacheKey(listName, filter, selectStr));
  if (!entry) return null;
  if (Date.now() - entry.ts > _CACHE_TTL_MS) {
    _apiCache.delete(_cacheKey(listName, filter, selectStr));
    return null;
  }
  return entry.data;
}
function _cacheSet(listName, filter, selectStr, data) {
  _apiCache.set(_cacheKey(listName, filter, selectStr), { ts: Date.now(), data });
}
function _cacheInvalidate(listName) {
  // Remove all cached entries for this list (any filter)
  for (const key of _apiCache.keys()) {
    if (key.startsWith(listName + '|')) _apiCache.delete(key);
  }
  // N-176 (F-3a): tier 2 as well. This one line IS the invalidation
  // contract — createItem/updateItem/deleteItem already call this function,
  // so every compliant write path invalidates both tiers with no change at
  // the call site. Any new write path that bypasses those three helpers
  // bypasses this too; that is why N-176 converted the three raw
  // graphRequest('DELETE', ...) sites in admin.js/os-admin.js.
  _ssPurge(listName);
}

// ── Session-persistent read cache — tier 2 (N-176 / F-3a) ─────────────
// Tier 1 (_apiCache, above) is per-page and dies on every navigation.
// Tier 2 keeps a list across navigations within one browser-tab session.
//
// ENROLMENT IS OPT-IN AND SHIPS EMPTY: CONFIG.CACHE.persistentLists is [],
// so this tier is inert and NO key is ever written. N-176 is the engine and
// the invalidation contract only; N-177 enrols the reference lists after
// its transactional-vs-reference analysis. Do not enrol a list here to
// "prove it works" — that is N-177's ticket.
//
// Every entry point below is wrapped and returns a safe value on throw.
// sessionStorage throws in private mode and on quota, and a cache tier must
// never be able to break a read — the same "must not throw" rule N-172 put
// on diagnostics.js. It is also absent entirely under the Node test
// harness (tests/run.js), which every helper handles by no-op.

// Is tier 2 live for this list? Storage-touching, hence guarded.
function _ssEnabled(listName) {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    if (!CONFIG.CACHE || !CONFIG.CACHE.enabled) return false;
    return (CONFIG.CACHE.persistentLists || []).includes(listName);
  } catch (e) {
    return false;
  }
}

// Pure. Reuses _cacheKey so the two tiers can never disagree on identity.
// Shape: <prefix>|<build>|<list>|<filter>|<select>
function _ssKey(listName, filter, selectStr) {
  return CONFIG.CACHE.prefix + '|' + CONFIG.APP_BUILD + '|' + _cacheKey(listName, filter, selectStr);
}

// Pure. True only for OUR keys. Six unrelated sessionStorage key families
// already exist (newton_role_, newton_dm_grants_, newton_ghost_,
// newton_diag_, newton_survey_, newton_force_desktop) and none of them may
// ever be touched by a cache purge.
function _ssIsCacheKey(key) {
  return typeof key === 'string' && key.indexOf(CONFIG.CACHE.prefix + '|') === 0;
}

// Pure. The build stamp embedded in one of our keys, or null.
function _ssKeyBuild(key) {
  return _ssIsCacheKey(key) ? (key.split('|')[1] || null) : null;
}

// Pure. Does this key belong to `listName`? Null/omitted listName matches
// every one of our keys. Build-independent on purpose: a purge should clear
// a list's stale-build entries too, not just the current build's.
function _ssKeyMatchesList(key, listName) {
  if (!_ssIsCacheKey(key)) return false;
  if (!listName) return true;
  return key.split('|')[2] === listName;
}

// Purge tier 2. listName omitted = every entry we own.
function _ssPurge(listName = null) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    // Snapshot the keys first — never iterate the live index while deleting.
    for (const key of Object.keys(sessionStorage)) {
      if (_ssKeyMatchesList(key, listName)) sessionStorage.removeItem(key);
    }
  } catch (e) {
    /* storage unavailable — nothing to purge */
  }
}

// Discard every entry written by a different deploy. This is what makes
// bumping CONFIG.APP_BUILD bust the cache.
function _ssPurgeStaleBuilds() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    for (const key of Object.keys(sessionStorage)) {
      if (_ssIsCacheKey(key) && _ssKeyBuild(key) !== CONFIG.APP_BUILD) sessionStorage.removeItem(key);
    }
  } catch (e) {
    /* storage unavailable — nothing to purge */
  }
}

function _ssGet(listName, filter, selectStr) {
  if (!_ssEnabled(listName)) return null;
  const key = _ssKey(listName, filter, selectStr);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.ts !== 'number' || Date.now() - entry.ts > CONFIG.CACHE.ttlMs) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch (e) {
    // Unparseable or unreadable — drop it and fall through to the network.
    try { sessionStorage.removeItem(key); } catch (e2) { /* ignore */ }
    return null;
  }
}

function _ssSet(listName, filter, selectStr, data) {
  if (!_ssEnabled(listName)) return;
  try {
    const payload = JSON.stringify({ ts: Date.now(), data });
    // Measured as JSON string length. SharePoint list text is near-ASCII so
    // length tracks bytes closely enough for a skip-if-huge guard; this is a
    // safety valve against blowing the ~5MB origin quota, not an accounting
    // figure.
    if (payload.length > CONFIG.CACHE.maxEntryBytes) return;
    sessionStorage.setItem(_ssKey(listName, filter, selectStr), payload);
  } catch (e) {
    /* quota exceeded or private mode — tier 1 still serves the page */
  }
}

// Runs once when api.js parses, after config.js has defined CONFIG (script
// load order is config.js -> auth.js -> utils.js -> api.js in every shell).
// No-op under the Node test harness and no-op while persistentLists is empty.
_ssPurgeStaleBuilds();
 
// ── Field normalisers ───────────────────────────────────────────────
const FIELD_ALIASES = {
  Projects:        { Title: "CustomerName" },
  Roles:           { Title: "RoleTitle", Currency: "Location" },
  WeeklyActivity:  { Yeare: "Year", InterviewTwoPlus: "Interview2Plus" },
  Placements:      { Title: "CandidateName" },
  RejectedOffers:  { Title: "CandidateName" },
  UserAssignments: { Title: "UserEmail" },
  LeadershipAccess:{ Title: "UserEmail" },
  Departments:     { Title: "DepartmentName" },
  SavedReports:    {},
  MarketReports:   { Title: "ReportTitle" },
  // ── People module ─────────────────────────────────────────
  People:          { Title: "EmployeeName" },
  Assignments:     { Title: "AssignmentID" },
  GPInvoices:      { Title: "InvoiceNumber" },
  // ── Sales module ──────────────────────────────────────────
  SalesForecasts:  {},
  // ── Command Centre ────────────────────────────────────────
  CCStatus:        {},
  // ── Engagement ────────────────────────────────────────────
  SurveyTemplates:   {},
  SurveyQuestions:   {},
  SurveyRuns:        {},
  SurveyResponses:   {},
  SurveyCompletions: {},
  // ── Notifications ─────────────────────────────────────────
  Notifications: {},
  // ── Client-side error telemetry (N-172 / F-7a) ────────────
  // {} is deliberate — every Diagnostics column is already the display name
  // Newton wants. A self-mapping alias would DELETE the field, for the
  // reason spelled out on the RoleHistory entry below.
  // Registering here also enrols the list in N-154's Data Health row-count
  // watch for free, which is wanted: this is the one list in Newton with an
  // unbounded write path, so it is exactly the list that should be watched
  // against LIST_ROW_COUNT_WARNING_THRESHOLD.
  Diagnostics: {},
  // ── Time-series snapshots (N-085 / L-1a) ────────────────────
  Snapshots: {},
  // ── CoE Hiring Plan ───────────────────────────────────────
  CoEPlanRows:     {},
  CoEPlanForecast: {},
  // ── LCI Cost Model ────────────────────────────────────────
  LCIModels:       {},
  LCIModelRows:    {},
  LCIMilestones:   {},
  LCIReports:      {},
    LCILocations:    {},
  // ── Role history (N-099 / D-3a) ──────────────────────────────
  // {} is deliberate — every RoleHistory column (Field, OldValue,
  // NewValue, ChangedBy, ChangedAt) is already the display name Newton
  // wants. A self-mapping alias (e.g. { Field: 'Field' }) would delete
  // the field — normaliseFields() deletes the internal key after copying
  // it to display, so display === internal nets to nothing. Same trap
  // documented on the CCStatus entry above.
  RoleHistory: {},
};
 
function normaliseFields(listName, fields) {
  const aliases = FIELD_ALIASES[listName];
  if (!aliases) return fields;
  const result = { ...fields };
  for (const [internal, display] of Object.entries(aliases)) {
    if (internal in result) {
      result[display] = result[internal];
      delete result[internal];
    }
  }
  return result;
}

// ── Multi-TP helpers (TalentPartner column may hold 'a@x.com;b@x.com') ──
function tpList(val) {
  return String(val || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean);
}
function tpMatches(val, email) {
  return tpList(val).includes((email || '').trim().toLowerCase());
}
function tpDisplay(val, nameMap = {}) {
  const names = tpList(val).map(e => nameMap[e] || e);
  return names.length ? names.join(', ') : '—';
}

// N-147 (T-2a), moved here from utils.js by N-166: which Talent Partner a
// bulk-activity grid row is written against. Prefers the signed-in user when
// they are one of the role's owners, so a TP logging their own week is
// always attributed to them; otherwise the first listed owner. Returns null
// when the role has NO owner — the caller must render that row disabled and
// exclude it from the save rather than attributing someone else's week to
// whoever happened to open the grid.
function resolveRowTalentPartner(roleTalentPartnerValue, currentUserEmail) {
  const list = tpList(roleTalentPartnerValue);
  if (!list.length) return null;
  const me = String(currentUserEmail || '').trim().toLowerCase();
  return (me && list.includes(me)) ? me : list[0];
}

// ── Generic helpers ─────────────────────────────────────────────────
async function graphRequest(method, path, body = null, elevated = false) {
  const token = elevated ? await getElevatedToken() : await getToken();
  if (!token) throw new Error("Not authenticated");
  const opts = {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  // N-082: retry 429/503 only — throttle responses were rejected, not
  // applied, so re-POSTing is safe. Everything else throws immediately.
  const { maxAttempts, baseDelayMs } = CONFIG.GRAPH_RETRY;
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`${GRAPH}${path}`, opts);
    if ((res.status === 429 || res.status === 503) && attempt < maxAttempts) {
      const ra = Number(res.headers.get('Retry-After'));
      const waitMs = ra > 0 ? ra * 1000 : baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }
    break;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
 
function listPath(listName) {
  return `/sites/${CONFIG.SP_SITE_ID}/lists/${listName}/items`;
}
function listColumnsPath(listName) {
  return `/sites/${CONFIG.SP_SITE_ID}/lists/${listName}/columns`;
}
 
// ── Read ─────────────────────────────────────────────────────────────
// `select`, if passed, is a comma-separated string of internal SharePoint
// field names. No caller passes it yet — CONFIG.LIST_FIELDS is empty and
// every existing call site is intentionally left on '*' (see N-050 QA:
// two callers already carried an unaudited third argument here that broke
// People Scorecards when activated; that argument is now dropped at the
// call sites below, pending the full field audit in N-052/N-053).
// If select is omitted, resolves from CONFIG.LIST_FIELDS[listName] when
// present and non-empty; otherwise falls back to '*' (today's behaviour).
async function getItems(listName, filter = "", select = null) {
  let selectStr = select;
  if (!selectStr) {
    const manifestFields = CONFIG.LIST_FIELDS && CONFIG.LIST_FIELDS[listName];
    if (Array.isArray(manifestFields) && manifestFields.length) {
      selectStr = manifestFields.includes('Id') ? manifestFields.join(',') : ['Id', ...manifestFields].join(',');
    } else {
      selectStr = '*';
    }
  }

  const cached = _cacheGet(listName, filter, selectStr);
  if (cached) return cached;
  // N-176: tier 2. A hit is promoted into tier 1 so repeated reads within
  // one page still cost nothing and still expire on the 30s in-memory TTL.
  const persisted = _ssGet(listName, filter, selectStr);
  if (persisted) {
    _cacheSet(listName, filter, selectStr, persisted);
    return persisted;
  }
 
  const qs = filter ? `?$expand=fields($select=${selectStr})&$filter=${encodeURIComponent(filter)}` : `?$expand=fields($select=${selectStr})`;
  let url = `${listPath(listName)}${qs}`;
  const items = [];
  while (url) {
    const data = await graphRequest("GET", url);
    items.push(...data.value.map(i => ({ id: i.id, ...normaliseFields(listName, i.fields) })));
    url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(GRAPH, '') : null;
  }
 
  _cacheSet(listName, filter, selectStr, items);
  _ssSet(listName, filter, selectStr, items);
  return items;
}
 
// NOTE: getItem() (single-item read, below) intentionally keeps
// fields($select=*) — it's a low-volume detail fetch, not a list scan, so
// it's out of scope for F-1 projection.
async function getItem(listName, itemId) {
  const data = await graphRequest("GET", `${listPath(listName)}/${itemId}?$expand=fields($select=*)`);
  return { id: data.id, ...normaliseFields(listName, data.fields) };
}

// ── Data Health (F-10 / N-092) ──────────────────────────────────────
// Row count only — id-only $select, same nextLink pagination as getItems.
// Deliberately NOT $count/ConsistencyLevel:eventual: that combination is
// inconsistently supported on SharePoint-backed list items in Graph v1.0.
// N-154: the caller renders a failure as an em-dash, which at a glance reads
// like a small number rather than "this did not run". With 29 lists watched
// instead of 14, a list name that no longer exists would hide there
// indefinitely — so failures are logged by name here.
async function getListItemCount(listName) {
  const items = await getItems(listName, "", "Id");
  return items.length;
}

// N-154 (F-10b): every list Newton knows about, minus deliberate exclusions.
// FIELD_ALIASES is the canonical registry — registering a list there is
// already mandatory — so deriving from it means a new list is monitored the
// day it is added, with no second place to forget.
//
// The derived array leaves api.js; FIELD_ALIASES itself deliberately does
// NOT. Exporting the raw map would make the registry editable from outside
// the one file that owns it. The EXCLUSIONS are config and live in
// config.js; the registry is not config and lives here.
function getMonitoredLists() {
  const excluded = new Set(CONFIG.DATA_HEALTH_EXCLUDED_LISTS || []);
  return Object.keys(FIELD_ALIASES).filter(l => !excluded.has(l)).sort();
}

// N-093 (F-2a): how many WeeklyActivity rows have no ProjectID. The column is
// written by forms.js:submitWeeklyActivityForm but read by nothing in js/, so
// a blank on historical rows has never had a way to surface — while the
// Project Dashboard has been filtering on it server-side for some time. A
// non-zero count here means that filter is already silently dropping rows.
// id-only $select, same discipline as getListItemCount.
async function getWeeklyActivityNullProjectCount() {
  try {
    const items = await getItems("WeeklyActivity", "fields/ProjectID eq null", "Id");
    return { ok: true, count: items.length };
  } catch (e) {
    console.error("WeeklyActivity null-ProjectID probe rejected:", e);
    return { ok: false, count: null };
  }
}
// N-158: how many WeeklyActivity rows have no WeekEndingDate. This is the
// row set DATE_WINDOW_DEFAULT_WEEKS: 26 was silently dropping from the
// Activity list page — a server-side `ge` bound cannot match a null date.
// Both date-window defaults now sit at 0 (All time) so this can't happen
// today, but the count stays visible so a future bounded default doesn't
// reintroduce the drop unnoticed. Same id-only $select discipline as
// getWeeklyActivityNullProjectCount().
async function getWeeklyActivityNullWeekEndingCount() {
  try {
    const items = await getItems("WeeklyActivity", "fields/WeekEndingDate eq null", "Id");
    return { ok: true, count: items.length };
  } catch (e) {
    console.error("WeeklyActivity null-WeekEndingDate probe rejected:", e);
    return { ok: false, count: null };
  }
}
// Raw columnDefinition[] for a list — includes system columns; callers filter.
async function getListColumns(listName) {
  const data = await graphRequest("GET", listColumnsPath(listName));
  return data.value || [];
}

// { name, id, indexed }[] for just the requested internal column names.
async function getColumnIndexStatus(listName, columnNames) {
  const columns = await getListColumns(listName);
  return columns
    .filter(c => columnNames.includes(c.name))
    .map(c => ({ name: c.name, id: c.id, indexed: !!c.indexed }));
}

// Schema mutation, not a data write — no _cacheInvalidate (doesn't touch
// item cache). Caller must confirm with the user before calling this.
async function setColumnIndexed(listName, columnId) {
  return graphRequest("PATCH", `${listColumnsPath(listName)}/${columnId}`, { indexed: true }, true);
}

// N-174 (F-11a): per-list schema diff for the Data Health "Schema Check"
// panel. Iterates Object.keys(FIELD_ALIASES) DIRECTLY — not
// getMonitoredLists() — because DATA_HEALTH_EXCLUDED_LISTS is scoped to the
// row-count guard; a list opted out of row-count watching is not a reason
// to skip its schema check. FIELD_ALIASES stays un-exported (same reason as
// getMonitoredLists()); this is the one function besides that one allowed
// to read it directly.
//
// Expected set: CONFIG.LIST_FIELDS[list] where a projection entry exists
// (16 lists, "projected"); otherwise Object.keys(FIELD_ALIASES[list]) (the
// other 15). When that array is empty (9 lists registered as {} with no
// projection), no Graph call is made at all — nothing to check.
//
// "Unexpected" is only computed for projected lists: the 15 non-projected
// lists are read with fields($select=*), so there is no closed expected set
// to diff an extra column against.
//
// Failures are per-list and non-fatal — one broken list returns
// { list, error: true } and must not take out the panel, same discipline
// as getListItemCount()'s callers.
async function getSchemaDiffs() {
  const lists = Object.keys(FIELD_ALIASES).sort();
  return Promise.all(lists.map(async (list) => {
    const projected = Object.prototype.hasOwnProperty.call(CONFIG.LIST_FIELDS, list);
    const expectedRaw = projected ? CONFIG.LIST_FIELDS[list] : Object.keys(FIELD_ALIASES[list]);

    if (expectedRaw.length === 0) {
      return { list, projected, checked: false, expectedCount: 0, missing: [], unexpected: [] };
    }

    const expected = expectedRaw.map(schemaBaseColumnName);
    const ignore = CONFIG.SCHEMA_CHECK_IGNORE_COLUMNS || [];

    try {
      const columns = await getListColumns(list);
      const actual = columns.filter(c => !c.hidden).map(c => c.name);

      const missing = expected.filter(n => !actual.includes(n));
      const unexpected = projected
        ? actual.filter(n => !expected.includes(n) && !ignore.includes(n))
        : [];

      return { list, projected, checked: true, expectedCount: expected.length, missing, unexpected };
    } catch (e) {
      console.warn('Schema Check: column read failed for list "' + list + '"', e);
      return { list, projected, checked: true, error: true, expectedCount: expected.length, missing: [], unexpected: [] };
    }
  }));
}
 
// ── Write ─────────────────────────────────────────────────────────────
async function createItem(listName, fields) {
  const result = await graphRequest("POST", listPath(listName), { fields });
  _cacheInvalidate(listName);
  return result;
}
// ── Error telemetry write (N-172 / F-7a) ──────────────────────────
// A named wrapper rather than a raw createItem call in diagnostics.js, so
// the telemetry write is greppable and so N-173's Diagnostics reads land
// next to it. Deliberately does NOT swallow: the caller owns the swallow,
// which keeps the reporter's failure path in exactly one place.
async function createDiagnostic(fields) {
  return createItem('Diagnostics', fields);
}
// ── Error telemetry reads/acks (N-173 / F-7b) ──────────────────────
// Server-side filtered to Status = 'new' so acknowledged groups are never
// fetched, not merely hidden client-side. FIELD_ALIASES.Diagnostics is {},
// so 'Status' here is the same name Graph and os-admin.js both use.
async function getDiagnostics() {
  return getItems('Diagnostics', "fields/Status eq 'new'");
}
// One PATCH per row id in a group. updateItem already calls
// _cacheInvalidate('Diagnostics'), so the next getDiagnostics() read is
// fresh with no manual cache handling here.
async function acknowledgeDiagnosticGroup(ids) {
  await Promise.all(ids.map(id => updateItem('Diagnostics', id, { Status: 'acknowledged' })));
}
// ── Role creation history (N-100) ─────────────────────────────────
// Companion to N-099's updateRoleWithHistory: createItem('Roles', fields)
// has no "old" state to diff against, so this does not reuse
// _logRoleHistory. It writes one deliberate RoleHistory row so the Role
// History timeline (N-100) has a real first node instead of starting at
// the first edit. OldValue: '' is the signal the timeline UI uses to
// render this row as "Role created" rather than a transition.
// Fire-and-forget, same non-blocking shape as updateRoleWithHistory — a
// history-write failure must never block or fail the role save.
async function createRoleWithHistory(fields) {
  const result = await createItem('Roles', fields);
  if (result && result.id) {
    // N-100 QA fix (round 2): AWAITED — unlike updateRoleWithHistory's six
    // existing fire-and-forget call sites, the Roles-list "Timeline" link's
    // very first appearance depends on this row existing by the time
    // navigateTo('roles') re-renders the list right after this function
    // returns. Without awaiting, that GET raced the RoleHistory POST and
    // won almost every time (found in N-100 QA). A failed write still never
    // blocks or fails the role save — only a console warning, same
    // guarantee the fire-and-forget version gave.
    try {
      await createItem('RoleHistory', {
        RoleIDLookupId: parseInt(result.id),
        Field:          'Stage',
        OldValue:       '',
        NewValue:       fields.Stage || '',
        ChangedBy:      getCurrentUser().email,
        ChangedAt:      new Date().toISOString(),
      });
    } catch (e) {
      console.warn('RoleHistory: creation write failed', e);
    }
  }
  return result;
}
async function updateItem(listName, itemId, fields) {
  const result = await graphRequest("PATCH", `${listPath(listName)}/${itemId}`, { fields });
  _cacheInvalidate(listName);
  return result;
}
// ── Role history (N-099 / D-3a) ────────────────────────────────────────
// Drop-in replacement for `updateItem('Roles', roleId, fields)` at the six
// call sites that mutate an existing Role. Reads the pre-update Role,
// performs the real update exactly as updateItem always did, then fires
// the RoleHistory write in the background — never awaited, never allowed
// to block or fail the caller's save (same non-blocking shape as
// ensureUserRegistered(...).catch(...) elsewhere in this codebase).
async function updateRoleWithHistory(roleId, fields) {
  let oldRole = null;
  try {
    oldRole = await getItem('Roles', roleId);
  } catch (e) {
    console.warn('RoleHistory: could not read prior Roles state', e);
  }
  const result = await updateItem('Roles', roleId, fields);
  if (oldRole) {
    _logRoleHistory(oldRole, fields).catch(e =>
      console.warn('RoleHistory: write failed', e)
    );
  }
  return result;
}
// `newFields` uses raw SharePoint internal names for aliased Roles columns
// (Title, Currency) because it's the same object handed to updateItem().
// `oldRole` is normalised (RoleTitle, Location) because it came from
// getItem(). Resolving each written field through FIELD_ALIASES.Roles
// before comparing is load-bearing: skip it and every save would log a
// false "Title changed" row, since oldRole.Title is always undefined.
function _resolveRoleDisplayField(internalField) {
  const aliases = FIELD_ALIASES.Roles;
  return (aliases && aliases[internalField]) || internalField;
}
async function _logRoleHistory(oldRole, newFields) {
  const email     = getCurrentUser().email;
  const changedAt = new Date().toISOString(); // genuine instant — N-091 exempt
  const rows = Object.keys(newFields)
    .filter(internalField => newFields[internalField] !== undefined)
    .map(internalField => {
      const field    = _resolveRoleDisplayField(internalField);
      const oldValue = oldRole[field];
      const newValue = newFields[internalField];
      return { field, oldValue, newValue };
    })
    .filter(({ oldValue, newValue }) => String(oldValue ?? '') !== String(newValue ?? ''));
  await Promise.all(rows.map(({ field, oldValue, newValue }) =>
    createItem('RoleHistory', {
      RoleIDLookupId: parseInt(oldRole.id),
      Field:          field,
      OldValue:       oldValue !== undefined && oldValue !== null ? String(oldValue) : '',
      NewValue:       newValue !== undefined && newValue !== null ? String(newValue) : '',
      ChangedBy:      email,
      ChangedAt:      changedAt,
    })
  ));
}
// ── Role History reads (N-100) ────────────────────────────────────
// Full-row read for one role's timeline. RoleIDLookupId is the Graph
// filter name for the RoleID lookup column, same convention as every
// other RoleIDLookupId filter in this file.
async function getRoleHistory(roleId) {
  return getItems('RoleHistory', `fields/RoleIDLookupId eq ${parseInt(roleId)}`);
}
// Existence check across the WHOLE list, used only to decide which
// Roles-list rows get a "Timeline" action. $select-limited to the lookup
// column so this stays cheap regardless of list size — never loop
// getRoleHistory(id) per row to build this; that's the N+1 pattern
// getAllRoles/getRolesForUser already avoid elsewhere in this file.
async function getRoleHistoryRoleIds() {
  const rows = await getItems('RoleHistory', '', 'RoleIDLookupId');
  return new Set(rows.map(r => String(r.RoleIDLookupId)));
}
async function deleteItem(listName, itemId) {
  const result = await graphRequest("DELETE", `${listPath(listName)}/${itemId}`);
  _cacheInvalidate(listName);
  return result;
}

// ── Explicit refresh (N-176 / F-3a) ──────────────────────────────────
// The user's escape hatch from a stale cache, behind the sidebar's
// "Refresh data" button. Clears BOTH tiers and nothing else: newton_role_*,
// newton_dm_grants_*, newton_ghost_*, newton_diag_*, newton_survey_* and
// newton_force_desktop belong to other features, and a "Refresh data" that
// silently re-resolved the user's role or dropped them out of Ghost Mode
// would be a different and surprising action.
// onDone re-renders in place when the caller can (nav-core.js passes the
// current page's navigate call); with no callback we fall back to a full
// reload, which is correct but loses the toast.
function refreshData(onDone = null) {
  _apiCache.clear();
  _ssPurge();
  if (typeof onDone === 'function') {
    if (typeof toast === 'function') toast('Data refreshed', { type: 'success' });
    onDone();
    return;
  }
  location.reload();
}
 
// ── List-specific helpers ─────────────────────────────────────────────
async function getProjects(activeOnly = true) {
  return getItems("Projects", activeOnly ? "fields/Status eq 'Active'" : "");
}
 
async function getRolesForProject(projectId, talentPartnerEmail = null) {
  const roles = await getItems("Roles", `fields/ProjectID eq ${projectId}`);
  if (!talentPartnerEmail) return roles;
  return roles.filter(r => tpMatches(r.TalentPartner, talentPartnerEmail));
}
 
async function getAllRoles() {
  return getItems("Roles");
}

// N-093 (F-2a): the roles this user is allowed to see, fetched server-side
// instead of fetching every role and filtering in JS.
//   - getUserProjectIds returns null for admins/leadership → genuinely all
//     roles, unfiltered, exactly as before.
//   - ghost mode returns a single-element array → one filtered request.
//   - otherwise one filtered request per assigned project, in parallel.
// Fan-out rather than an OR chain, reusing the pattern already proven in
// getScopedRolesVisibleTo: each project's response then caches under
// its own listName|filter|select key and is reused across pages, and there
// is no OR-chain length limit to discover the hard way.
async function getRolesForUser(email) {
  const projectIds = await getUserProjectIds(email);
  if (projectIds === null) return getAllRoles();
  if (!projectIds.length) return [];
  if (projectIds.length > CONFIG.SCOPE_FANOUT_MAX) return getAllRoles();
  const arrays = await Promise.all(projectIds.map(pid => getRolesForProject(pid)));
  const byId = new Map();
  arrays.flat().forEach(r => byId.set(String(r.id), r));
  return [...byId.values()];
}

// N-093 (F-2a): OData `ge` clause for a date column, `weeksBack` weeks before
// today, or '' when weeksBack is falsy ("All time" must send NO clause).
// localDayISO, NOT spDateOut — see the getActivityForAnalytics cutoff above,
// which this deliberately matches. The bound is a local wall-clock "N weeks
// ago", which is exactly what localDayISO is documented to answer; spDateOut
// requires a Date whose UTC getters already stand for the intended calendar
// day, which this is not.
function _odataDateFrom(field, weeksBack) {
  if (!weeksBack) return '';
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (weeksBack * 7));
  return `fields/${field} ge '${localDayISO(cutoff)}'`;
}

// N-093 (F-2a): joins non-empty OData clauses with `and`.
function _odataAnd(...clauses) {
  return clauses.filter(Boolean).join(' and ');
}

// N-094 (F-2b): builds `(fields/X eq 1 or fields/X eq 2 ...)` for a set of
// lookup ids. Returns '' for an empty set, or for one above
// CONFIG.ROLE_ID_FILTER_MAX, so _odataAnd drops the clause and the caller
// falls back to its client-side filter.
// Deliberately NOT in utils.js: it encodes Graph/SharePoint $filter grammar,
// and utils.js must not gain Graph knowledge. Same call N-093 made for its
// own OData helpers, and it is why the "pure functions -> utils.js" rule
// does not apply here.
// String concatenation, no nested template literals: a backtick inside a
// ${...} of another template literal is what broke pages.js in N-093 fix-1.
function _odataIn(field, ids) {
  if (!Array.isArray(ids) || !ids.length) return '';
  const nums = ids.map(Number);
  // Any unusable id means the set cannot be trusted as complete, so drop the
  // whole clause and over-fetch instead. Number(null) is 0, not NaN — a
  // Number.isFinite() test would have turned a null id into a filter for
  // role 0, which returns nothing and silently empties the page.
  if (nums.some(n => !Number.isInteger(n) || n <= 0)) return '';
  const uniq = [...new Set(nums)];
  if (uniq.length > CONFIG.ROLE_ID_FILTER_MAX) return '';
  const clauses = uniq.map(function (n) { return 'fields/' + field + ' eq ' + n; });
  return '(' + clauses.join(' or ') + ')';
}
 
async function getHistoricalPlacements() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  // No select passed — the field list this used to carry was incomplete
  // (missing TalentPartner, silently breaking tpEmail below once select
  // support went live; see N-050 QA). Stays on '*' until N-052 audits and
  // re-adds a correct list.
  const roles = await getItems('Roles',
    `fields/Stage eq 'Hired' and fields/ActualHireDate ge '${localDayISO(cutoff)}'`
  );
  return roles.map(r => ({
    id:            r.id,
    title:         r.RoleTitle,
    functionArea:  r.Department,
    country:       r.Location,
    openDate:      r.OpenDate,
    placementDate: r.ActualHireDate,
    tpEmail:       r.TalentPartner || null,
  }));
}
 
async function getActivityForAnalytics(weeksBack) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (weeksBack * 7));
  // N-088: named cutoffDay, not isoDate — the old name shadowed the global
  // isoDate() helper from utils.js for the rest of this function.
  const cutoffDay = localDayISO(cutoff);
  // No select passed — the field list this used to carry was incomplete
  // (missing TalentPartner, silently breaking People Scorecards once select
  // support went live; see N-050 QA). Stays on '*' until N-052 audits and
  // re-adds a correct list.
  const activity = await getItems('WeeklyActivity',
    `fields/WeekEndingDate ge '${cutoffDay}'`
  );
  return activity;
}
 
// N-093 (F-2a): `opts.sinceWeeks` adds a WeekEndingDate lower bound.
// The projectId/roleId branches are UNCHANGED — both were already
// server-side before this task (Project Dashboard, Report Builder).
// WeekEndingDate is stored as the SUNDAY, and the bound is a plain
// 'YYYY-MM-DD' matching getActivityForAnalytics.
async function getWeeklyActivity(projectId, roleId, opts = {}) {
  let scope = "";
  if (projectId) scope = `fields/ProjectID eq ${projectId}`;
  if (roleId)    scope = `fields/RoleID eq ${roleId}`;
  const filter = _odataAnd(scope, _odataDateFrom('WeekEndingDate', opts.sinceWeeks));
  return getItems("WeeklyActivity", filter);
}

// N-147 (T-2a): every WeeklyActivity row for ONE week, for the bulk-entry
// grid's pre-fill. `weekEndingISO` is a plain 'YYYY-MM-DD' SUNDAY — the same
// bare day-string shape _odataDateFrom and getActivityForAnalytics use as a
// bound, and NOT spDateOut output. WeekEndingDate buckets on the Sunday
// boundary, so an equality filter here is exact, not a range.
// No `select` list, matching getWeeklyActivity above — deliberately on '*'
// until N-052's field audit.
async function getWeeklyActivityForWeek(weekEndingISO) {
  if (!weekEndingISO) return [];
  return getItems("WeeklyActivity", `fields/WeekEndingDate eq '${weekEndingISO}'`);
}
 
// N-093 (F-2a): `opts.fromDay` ('YYYY-MM-DD') adds an OfferAcceptedDate lower
// bound. There is deliberately NO project filter: Placements has no
// ProjectID column, only RoleIDLookupId. Project scoping stays client-side —
// documented here so N-094 does not rediscover it.
async function getPlacements(roleId, opts = {}) {
  const filter = _odataAnd(
    roleId ? `fields/RoleID eq ${roleId}` : '',
    _odataIn('RoleID', opts.roleIds),
    opts.fromDay ? `fields/OfferAcceptedDate ge '${opts.fromDay}'` : ''
  );
  return getItems("Placements", filter);
}
 
// N-094 (F-2b): `opts.roleIds` scopes to a set of roles.
// N-153: `opts.fromDay` ('YYYY-MM-DD') adds a RejectionDate lower bound,
// mirroring getPlacements.
// CAUTION for N-152: a server-side `ge` bound EXCLUDES rows with a null
// RejectionDate — SharePoint cannot match null against `ge`. That is the
// opposite of the client-side rule, where null is always-included. Any
// caller that sets fromDay either adds those rows back or states that it
// drops them; today only the two pre-N-153 rows are affected.
async function getRejectedOffers(roleId, opts = {}) {
  const filter = _odataAnd(
    roleId ? `fields/RoleID eq ${roleId}` : '',
    _odataIn('RoleID', opts.roleIds),
    opts.fromDay ? `fields/RejectionDate ge '${opts.fromDay}'` : ''
  );
  return getItems("RejectedOffers", filter);
}
 
// ── Admin list helpers ───────────────────────────────────────────────
async function getUserAssignments(projectId) {
  return getItems("UserAssignments",
    projectId ? `fields/ProjectID eq ${projectId}` : "");
}
 
async function getLeadershipAccess() {
  return getItems("LeadershipAccess");
}
 
// ── Sales Forecasts ────────────────────────────────────────
async function getSalesForecasts() {
  return getItems("SalesForecasts");
}
 
async function createSalesForecast(payload) {
  return createItem("SalesForecasts", payload);
}
 
async function updateSalesForecast(id, payload) {
  return updateItem("SalesForecasts", id, payload);
}
 
async function deleteSalesForecast(id) {
  return deleteItem("SalesForecasts", id);
}
 
// ── CoE Hiring Plan ─────────────────────────────────────────────────
async function getCoEPlanRows(projectId) {
  return getItems("CoEPlanRows", `fields/ProjectID eq ${projectId}`);
}
async function createCoEPlanRow(payload) {
  return createItem("CoEPlanRows", payload);
}
async function updateCoEPlanRow(id, payload) {
  return updateItem("CoEPlanRows", id, payload);
}
async function deleteCoEPlanRow(id) {
  return deleteItem("CoEPlanRows", id);
}
async function getCoEPlanForecast(projectId) {
  return getItems("CoEPlanForecast", `fields/ProjectID eq ${projectId}`);
}
async function saveCoEForecastMonth(projectId, monthISO, hires, existingId = null) {
  if (existingId) return updateItem("CoEPlanForecast", existingId, { ForecastedHires: hires });
  // N-130: isoDate() puts ForecastMonth on the same midday-UTC convention as
  // every other CoE date. Existing rows keep their legacy shape — nothing is
  // migrated — and spMonthIn() on the read side handles both.
  return createItem("CoEPlanForecast", { ProjectID: projectId, ForecastMonth: isoDate(monthISO), ForecastedHires: hires });
}

// ── LCI Cost Model ──────────────────────────────────────────────────
async function getLCIModels() {
  return getItems("LCIModels");
}
async function getLCIModelById(id) {
  return getItem("LCIModels", id);
}
async function createLCIModel(fields) {
  return createItem("LCIModels", fields);
}
async function updateLCIModel(id, fields) {
  return updateItem("LCIModels", id, fields);
}
async function deleteLCIModel(id) {
  // Delete rows + milestones first, then the header.
  const [rows, milestones] = await Promise.all([getLCIRows(id), getLCIMilestones(id)]);
  for (const r of rows)       await deleteItem("LCIModelRows", r.id);
  for (const m of milestones) await deleteItem("LCIMilestones", m.id);
  return deleteItem("LCIModels", id);
}

async function getLCIRows(modelId) {
  return getItems("LCIModelRows", `fields/ModelIDLookupId eq ${modelId}`);
}
async function createLCIRow(fields) {
  return createItem("LCIModelRows", fields);
}
async function updateLCIRow(id, fields) {
  return updateItem("LCIModelRows", id, fields);
}
async function deleteLCIRow(id) {
  return deleteItem("LCIModelRows", id);
}

async function getLCIMilestones(modelId) {
  return getItems("LCIMilestones", `fields/ModelIDLookupId eq ${modelId}`);
}
async function createLCIMilestone(fields) {
  return createItem("LCIMilestones", fields);
}
async function updateLCIMilestone(id, fields) {
  return updateItem("LCIMilestones", id, fields);
}
async function deleteLCIMilestone(id) {
  return deleteItem("LCIMilestones", id);
}

// Duplicate a model: header (status reset to Draft) + all rows + milestones.
// Fields are whitelisted — Graph returns read-only system fields (LinkTitle,
// Created, Modified, Author...) that must not be sent back on create.
const _LCI_MODEL_COPY_FIELDS = [
  'ClientName', 'ProjectID', 'Location', 'LocalCurrency', 'DisplayCurrency',
  'FXRateLocalToDisplay', 'StartMonth', 'HorizonMonths', 'AssignedDMEmail',
  'EmployerBurdenPct', 'SalaryMonths', 'OfficeCostPerHead', 'EoRFeePerHead',
  'SectionsEnabled', 'Assumptions', 'NoticeMonths',
];
const _LCI_ROW_COPY_FIELDS = [
  'Title', 'RowType', 'Team', 'CareerLevel', 'AnnualSalary', 'BonusPct',
  'Quantity', 'ExitMonth', 'LegacyCategory', 'NoticeMonthsOverride',
  'MonthValues', 'SortOrder',
];
const _LCI_MILESTONE_COPY_FIELDS = ['Title', 'StartMonth', 'EndMonth', 'SortOrder'];

// N-150: Duplicate role — fields carried from the source role onto the new
// one, in display-normalized names (the shape getItem('Roles', id) returns,
// which is what renderRoleForm's pre-fill already reads). Kept in sync with
// submitRoleForm's actual write set (forms.js) by
// tests/lint-role-copy-fields.js — update that test's expectations, don't
// just edit this list, if the write set changes.
const _ROLE_COPY_FIELDS = [
  'ProjectIDLookupId', 'RoleTitle', 'HiringManager', 'TalentPartner', 'Budget',
  'Location', 'Priority', 'Backfill', 'Department', 'Notes',
];
// Fields submitRoleForm writes that duplication deliberately does NOT carry
// over — Stage always resets to Backlog, OpenDate resets to today, and
// TargetHireDate is cleared. Used only by the sync test above.
const _ROLE_RESET_FIELDS = ['Stage', 'OpenDate', 'TargetHireDate'];

function _pickFields(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}

async function copyLCIModel(modelId, newTitle, onProgress = null) {
  const [model, rows, milestones] = await Promise.all([
    getLCIModelById(modelId), getLCIRows(modelId), getLCIMilestones(modelId),
  ]);
  const total = rows.length + milestones.length;
  let done = 0;
  const created = await createLCIModel({
    ..._pickFields(model, _LCI_MODEL_COPY_FIELDS),
    Title:  newTitle || `${model.Title} (copy)`,
    Status: 'Draft',
  });
  const newId = created.id;
  const createdRowIds = [];
  const createdMilestoneIds = [];
  try {
    for (const r of rows) {
      const cr = await createLCIRow({ ..._pickFields(r, _LCI_ROW_COPY_FIELDS), ModelIDLookupId: Number(newId) });
      createdRowIds.push(cr.id);
      if (onProgress) onProgress(++done, total);
    }
    for (const m of milestones) {
      const cm = await createLCIMilestone({ ..._pickFields(m, _LCI_MILESTONE_COPY_FIELDS), ModelIDLookupId: Number(newId) });
      createdMilestoneIds.push(cm.id);
      if (onProgress) onProgress(++done, total);
    }
  } catch (e) {
    // N-082: roll back the partial copy — best-effort, and a failed
    // cleanup delete must never mask the original error.
    for (const id of createdMilestoneIds) { try { await deleteLCIMilestone(id); } catch (_) { /* best-effort */ } }
    for (const id of createdRowIds)       { try { await deleteLCIRow(id); } catch (_) { /* best-effort */ } }
    try { await deleteLCIModel(newId); } catch (_) { /* best-effort */ }
    throw new Error('Copy failed — nothing was created. ' + e.message);
  }
  return created;
}

// ── LCI Reports (saved report definitions) ──────────────────────────
async function getLCIReports() {
  return getItems("LCIReports");
}
async function getLCIReportById(id) {
  return getItem("LCIReports", id);
}
async function createLCIReport(fields) {
  return createItem("LCIReports", fields);
}
async function updateLCIReport(id, fields) {
  return updateItem("LCIReports", id, fields);
}
async function deleteLCIReport(id) {
  return deleteItem("LCIReports", id);
}

async function getDepartments() {
  return getItems("Departments", "");
}

// ── LCI Lead Magnet locations ───────────────────────────────────────
async function getLCILocations() {
  return getItems("LCILocations");
}
async function createLCILocation(fields) {
  return createItem("LCILocations", fields);
}
async function updateLCILocation(id, fields) {
  return updateItem("LCILocations", id, fields);
}
async function deleteLCILocation(id) {
  return deleteItem("LCILocations", id);
}

// Resolve the effective role for `email` — or, if Ghost Mode is active, for
// the ghosted user instead (N-162: ghosting simulates a real user's actual
// resolved role, not a synthetic label):
// 1. Check ADMIN_USERS in config.js
// 2. Check LeadershipAccess list
// 3. Check UserAssignments list
// ── Role / DM-grant cache (N-177 / F-3b) ─────────────────────────────
// newton_role_<email> and newton_dm_grants_<email> are NOT part of the
// tier-2 list cache. They hold a value DERIVED from UserAssignments and
// LeadershipAccess, they are keyed by email rather than by list, and they
// are not gated on CONFIG.CACHE.persistentLists. They borrow only the TTL
// and the build stamp.
//
// Before N-177 both were bare, unstamped values that lived for the whole
// browser-tab session, so an admin changing someone's access had no effect
// on that person until they signed out. Enrolling UserAssignments and
// LeadershipAccess on a 10-minute TTL made that incoherent — the cheaper
// cache would have been the fresher one. Stamping these two makes access
// data strictly fresher than it was.
//
// Entry shape: { ts, build, value }.

// PURE — no storage access, no side effects. Split out so the shape, stamp
// and TTL rules are testable in the Node harness, where sessionStorage does
// not exist. Exposed for tests/assertions.js.
function _roleEntryUsable(entry, honourTtl) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (typeof entry.ts !== 'number') return false;
  if (entry.build !== CONFIG.APP_BUILD) return false;
  if (!('value' in entry)) return false;
  if (honourTtl && Date.now() - entry.ts > CONFIG.CACHE.ttlMs) return false;
  return true;
}

// honourTtl: false is for hasDMGrant() ONLY — see the comment there. Anything
// that is not a well-formed stamped entry, INCLUDING a legacy bare string or
// bare array written before N-177, is treated as absent so the caller
// re-resolves. Never migrated in place, never allowed to throw.
function _roleCacheGet(key, { honourTtl = true } = {}) {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    let entry = null;
    try { entry = JSON.parse(raw); } catch (e) { entry = null; }
    if (!_roleEntryUsable(entry, honourTtl)) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.value;
  } catch (e) {
    try { sessionStorage.removeItem(key); } catch (e2) { /* ignore */ }
    return null;
  }
}

// A failed write must degrade to "resolve every time", never to an error.
function _roleCacheSet(key, value) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), build: CONFIG.APP_BUILD, value }));
  } catch (e) {
    /* quota exceeded or private mode — the role is simply re-resolved */
  }
}

// 4. Fall back to 'viewer'
async function getEffectiveRole(email) {
  const lower = (getGhostUser() || email).toLowerCase();
  const cacheKey = 'newton_role_' + lower;
  // N-177: honours both the build stamp and CONFIG.CACHE.ttlMs, so an access
  // change now takes effect within the TTL instead of only on sign-out.
  const cached = _roleCacheGet(cacheKey);
  if (cached) return cached;
 
  let role;
  if (CONFIG.ADMIN_USERS?.includes(lower)) {
    role = 'admin';
  } else {
    const leadership = await getLeadershipAccess();
    if (leadership.some(l => l.UserEmail?.toLowerCase() === lower)) {
      role = 'leadership';
      // Leadership user may ALSO hold explicit DM assignments — cache those project IDs
      const assignments = await getItems("UserAssignments",
        `fields/Title eq '${lower}'`);
      const dmProjects = assignments
        .filter(a => a.AssignedRole === 'delivery_manager' && a.ProjectID && a.ProjectID !== 0)
        .map(a => String(a.ProjectID));
      _roleCacheSet('newton_dm_grants_' + lower, dmProjects);
    } else {
      const assignments = await getItems("UserAssignments",
        `fields/Title eq '${lower}'`);
      role = assignments.length > 0 ? assignments[0].AssignedRole : 'viewer';
    }
  }
 
  _roleCacheSet(cacheKey, role);
  return role;
}
 
// getUserProjectIds — defined above with admin null handling
 
// Check if email is in LeadershipAccess list
async function isLeadershipUser(email) {
  const list = await getLeadershipAccess();
  return list.some(l => l.UserEmail?.toLowerCase() === email.toLowerCase());
}

// True if the resolved user (the ghosted user if Ghost Mode is active, else
// the signed-in user) holds an explicit DM grant.
// Pass a projectId to scope the check; omit for "any DM grant?"
// N-177: reads the stamped entry, but deliberately does NOT honour the TTL.
// This function is SYNCHRONOUS — it cannot re-resolve on a miss, so treating
// an aged entry as absent would silently strip a leadership user's DM access
// mid-page. A build change implies a page load and is therefore safe to
// honour; a TTL expiry is not. The TTL still bounds these grants in practice
// because getEffectiveRole() re-resolves and rewrites them on every module
// init (app.js, cc-app.js, mr-app.js, people-app.js, mobile-app.js, forms.js).
// Do not "tidy" this asymmetry away.
function hasDMGrant(projectId = null) {
  const email = (getGhostUser() || getCurrentUser()?.email || '').toLowerCase();
  const grants = _roleCacheGet('newton_dm_grants_' + email, { honourTtl: false }) || [];
  return projectId ? grants.includes(String(projectId)) : grants.length > 0;
}

// Auto-register user on first login if not already in UserAssignments
async function ensureUserRegistered(email, displayName) {
  const lower = email.toLowerCase();
  if (CONFIG.ADMIN_USERS?.includes(lower)) return;
  const existing = await getItems("UserAssignments",
    `fields/Title eq '${lower}'`);
  if (existing.length === 0) {
    await createItem("UserAssignments", {
      Title: lower,
      UserName: displayName || lower,
      ProjectID: 0,
      CustomerName: "",
      AssignedRole: "talent_partner",
      LastLogin: new Date().toISOString(),
    });
  } else {
    await updateItem("UserAssignments", existing[0].id, {
      LastLogin: new Date().toISOString(),
    });
  }
}
 
async function getTalentPartnersForProject(projectId, includeEmail = null) {
  const assignments = await getItems("UserAssignments", `fields/ProjectID eq ${projectId}`);
  const keep = includeEmail ? includeEmail.toLowerCase() : null;
  return assignments.filter(a =>
    (a.AssignedRole === 'talent_partner' || a.AssignedRole === 'delivery_manager') &&
    (a.Active !== false || (keep && a.UserEmail?.toLowerCase() === keep))
  );
}

// All assignable users (deduped by email) — used to populate DM dropdown
async function getAllAssignableUsers() {
  const assignments = await getItems("UserAssignments");
  const seen = new Map();
  assignments.forEach(u => {
    if (u.Active === false) return;
    const email = (u.UserEmail || '').toLowerCase();
    if (email && !seen.has(email)) {
      seen.set(email, { UserEmail: u.UserEmail, UserName: u.UserName || u.UserEmail });
    }
  });
  return [...seen.values()].sort((a, b) =>
    (a.UserName || '').localeCompare(b.UserName || ''));
}

async function getTalentPartnerDisplayMap() {
  const assignments = await getItems("UserAssignments");
  const map = {};
  assignments.forEach(u => {
    if (u.UserEmail) map[u.UserEmail.toLowerCase()] = u.UserName || u.UserEmail;
  });
  return map;
}

// Filter a list of TP emails down to those matching an ACTIVE People record.
// People has no email column, so we match the UserAssignments display name
// against People.EmployeeName (case/whitespace-insensitive).
// If the People list is empty/unavailable, returns the list unfiltered.
async function filterToActiveTpEmails(tpEmails, tpMap) {
  const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const activePeople = await getPeople(true); // IsActive eq 1
  if (!activePeople.length) return tpEmails;
  const activeNames = new Set(activePeople.map(p => norm(p.EmployeeName)));
  return tpEmails.filter(e => activeNames.has(norm(tpMap[e.toLowerCase()])));
}
 
// Role precedence: admin > leadership > talent_partner > delivery_manager > viewer
const ROLE_PRECEDENCE = ['admin','leadership','talent_partner','delivery_manager','viewer'];
function higherRole(a, b) {
  const ai = ROLE_PRECEDENCE.indexOf(a);
  const bi = ROLE_PRECEDENCE.indexOf(b);
  return ai <= bi ? a : b;
}
 
// Return all project IDs this user is assigned to (null = admin, sees all).
// N-162: resolves against the ghosted user's real assignments when Ghost
// Mode is active, instead of a single manually-picked ghost project.
async function getUserProjectIds(email) {
  const lower = (getGhostUser() || email).toLowerCase();
  if (CONFIG.ADMIN_USERS?.includes(lower)) return null;
  const assignments = await getItems("UserAssignments", `fields/Title eq '${lower}'`);
  // N-165: de-duped — a user with two UserAssignments rows for the same
  // project (e.g. TP + DM-granted) must not get that project ID twice, or
  // every downstream per-project role fan-out doubles that project's roles.
  return [...new Set(assignments.map(a => String(a.ProjectID)))];
}
 
async function getScopedProjects(email, activeOnly = false) {
  const projectIds = await getUserProjectIds(email);
  const allProjects = await getProjects(activeOnly);
  if (projectIds === null) return allProjects;
  return allProjects.filter(p => projectIds.includes(String(p.id)));
}
 
// ── App Settings ─────────────────────────────────────────────────────
// AppSettings is a single-row SharePoint list with columns:
//   Title (single line text, value always "config")
//   AnnouncementMessage (multiple lines of text)
//   SeasonalEffect (single line text, e.g. "snow", "spring", or "" for none)
 
async function _getAppSettingsRow() {
  try {
    const items = await getItems("AppSettings");
    return items.find(i => (i.Title || '').toLowerCase() === 'config') || null;
  } catch (e) {
    return null;
  }
}
 
async function getAnnouncementMessage() {
  const row = await _getAppSettingsRow();
  return row ? (row.AnnouncementMessage || '') : '';
}
 
async function setAnnouncementMessage(message) {
  const row = await _getAppSettingsRow();
  if (row) {
    await updateItem("AppSettings", row.id, { AnnouncementMessage: message });
  } else {
    await createItem("AppSettings", { Title: "config", AnnouncementMessage: message });
  }
}
 
async function getSeasonalEffect() {
  const row = await _getAppSettingsRow();
  return row ? (row.SeasonalEffect || 'none') : 'none';
}
 
async function setSeasonalEffect(effect) {
  const row = await _getAppSettingsRow();
  if (row) {
    await updateItem("AppSettings", row.id, { SeasonalEffect: effect });
  } else {
    await createItem("AppSettings", { Title: "config", SeasonalEffect: effect });
  }
}
 
// ── People module: People list ────────────────────────────────────────
// Placeholder rows (vacancies / fictional roles) are EXCLUDED unless the caller
// opts in — only the Org Chart does. Filtered client-side, not in the OData
// $filter: rows created before the IsPlaceholder column existed have no value
// for it, and a server-side "eq 0" would drop every one of them.
async function getPeople(activeOnly = true, includePlaceholders = false) {
  const filter = activeOnly ? "fields/IsActive eq 1" : "";
  const all = await getItems("People", filter);
  const people = includePlaceholders ? all : all.filter(p => !p.IsPlaceholder);
  return people.sort((a, b) => {
    const lDiff = levelSortIndex(a.Level) - levelSortIndex(b.Level);
    if (lDiff !== 0) return lDiff;
    return (a.EmployeeName || "").localeCompare(b.EmployeeName || "");
  });
}

// ── Org Chart data ────────────────────────────────────────────────────
// Active projects keyed by overseeing CSD display name (normalised).
async function getProjectsByCSD() {
  const projects = await getProjects(true); // active only
  const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const map = {};
  projects.forEach(p => {
    const key = norm(p.CSDName) || '__unassigned__';
    (map[key] = map[key] || []).push(p);
  });
  return map;
}

// Current (non-forecast) assignments per employee → { EmployeeName: [row,…] }.
// Keeps ALL current rows so a split person can be duplicated under each project.
async function getCurrentAssignmentsByEmployee() {
  const all = await getAssignments();       // no year filter = current list
  const today = new Date(); today.setHours(0,0,0,0);
  const map = {};
  all.filter(a => !a.IsForecast).forEach(a => {
    const s = a.StartDate ? new Date(a.StartDate) : null;
    const e = a.EndDate   ? new Date(a.EndDate)   : null;
    if (s) s.setHours(0,0,0,0);
    if (e) e.setHours(0,0,0,0);
    const current = (!s || s <= today) && (!e || e >= today);
    if (current) (map[a.EmployeeName] = map[a.EmployeeName] || []).push(a);
  });
  return map;
}

async function createPerson(fields) {
  return createItem("People", {
    Title:        fields.EmployeeName,
    Level:        fields.Level,
    ContractType: fields.ContractType,
    Location:     fields.Location,
    StartDate:    fields.StartDate || undefined,
    EndDate:      fields.EndDate   || undefined,
    IsActive:     fields.IsActive !== false,
    Salary:       fields.Salary   || undefined,
    PhotoUrl:     fields.PhotoUrl || undefined,
    IsPlaceholder:      fields.IsPlaceholder || undefined,
    PlaceholderProject: fields.PlaceholderProject || undefined,
    PlaceholderCSD:     fields.PlaceholderCSD     || undefined,
  });
}
async function updatePerson(id, fields) {
  const payload = {};
  if (fields.EmployeeName !== undefined) payload.Title        = fields.EmployeeName;
  if (fields.Level        !== undefined) payload.Level        = fields.Level;
  if (fields.ContractType !== undefined) payload.ContractType = fields.ContractType;
  if (fields.Location     !== undefined) payload.Location     = fields.Location;
  if (fields.StartDate    !== undefined) payload.StartDate    = fields.StartDate;
  if (fields.EndDate      !== undefined) payload.EndDate      = fields.EndDate;
  if (fields.IsActive     !== undefined) payload.IsActive     = fields.IsActive;
  if (fields.Salary       !== undefined) payload.Salary       = fields.Salary;
  if (fields.PhotoUrl     !== undefined) payload.PhotoUrl     = fields.PhotoUrl;
  if (fields.IsPlaceholder      !== undefined) payload.IsPlaceholder      = fields.IsPlaceholder;
  if (fields.PlaceholderProject !== undefined) payload.PlaceholderProject = fields.PlaceholderProject;
  if (fields.PlaceholderCSD     !== undefined) payload.PlaceholderCSD     = fields.PlaceholderCSD;
  return updateItem("People", id, payload);
}
 
// ── People module: Assignments list ──────────────────────────────────
async function getAssignments(filters = {}) {
  const parts = [];
  if (filters.employeeName) parts.push(`fields/EmployeeName eq '${filters.employeeName}'`);
  if (filters.customer)     parts.push(`fields/Customer eq '${filters.customer}'`);
  if (filters.billed !== undefined && filters.billed !== '')
    parts.push(`fields/Billed eq '${filters.billed}'`);
  const filterStr = parts.join(" and ");
  const assignments = await getItems("Assignments", filterStr);
  if (filters.year) {
    const y = parseInt(filters.year);
    const yearStart = new Date(y, 0, 1);
    const yearEnd   = new Date(y, 11, 31, 23, 59, 59);
    return assignments.filter(a => {
      const s = a.StartDate ? new Date(a.StartDate) : null;
      const e = a.EndDate   ? new Date(a.EndDate)   : null;
      if (!s) return false;
      return s <= yearEnd && (!e || e >= yearStart);
    });
  }
  return assignments;
}
async function createAssignment(fields) {
  return createItem("Assignments", {
    Title:           fields.AssignmentID,
    EmployeeName:    fields.EmployeeName,
    Level:           fields.Level,
    Customer:        fields.Customer,
    ProjectType:     fields.ProjectType,
    StartDate:       fields.StartDate,
    EndDate:         fields.EndDate,
    MonthlyBillRate: fields.MonthlyBillRate || undefined,
    RetainerFee:     fields.RetainerFee  || undefined,   // N-116 split-fee
    PlacementFee:    fields.PlacementFee || undefined,   // N-116 split-fee
    Billed:          fields.Billed,
    Country:         fields.Country,
    IsForecast:      fields.IsForecast || false,
    AutoGenerated:   fields.AutoGenerated || false,
  });
}
async function updateAssignment(id, fields) {
  const payload = {};
  if (fields.AssignmentID    !== undefined) payload.Title           = fields.AssignmentID;
  if (fields.EmployeeName    !== undefined) payload.EmployeeName    = fields.EmployeeName;
  if (fields.Level           !== undefined) payload.Level           = fields.Level;
  if (fields.Customer        !== undefined) payload.Customer        = fields.Customer;
  if (fields.ProjectType     !== undefined) payload.ProjectType     = fields.ProjectType;
  if (fields.StartDate       !== undefined) payload.StartDate       = fields.StartDate;
  if (fields.EndDate         !== undefined) payload.EndDate         = fields.EndDate;
  if (fields.MonthlyBillRate !== undefined) payload.MonthlyBillRate = fields.MonthlyBillRate;
  if (fields.RetainerFee     !== undefined) payload.RetainerFee     = fields.RetainerFee;
  if (fields.PlacementFee    !== undefined) payload.PlacementFee    = fields.PlacementFee;
  if (fields.Billed          !== undefined) payload.Billed          = fields.Billed;
  if (fields.Country         !== undefined) payload.Country         = fields.Country;
  if (fields.IsForecast      !== undefined) payload.IsForecast      = fields.IsForecast;
  return updateItem("Assignments", id, payload);
}
 
// ── People module: GPInvoices list ────────────────────────────────────
async function getGPInvoices() {
  const invoices = await getItems("GPInvoices");
  return invoices.sort((a, b) => {
    const da = a.InvoiceDate ? new Date(a.InvoiceDate) : new Date(0);
    const db = b.InvoiceDate ? new Date(b.InvoiceDate) : new Date(0);
    return db - da;
  });
}
async function createInvoice(fields) {
  return createItem("GPInvoices", {
    Title:       fields.InvoiceNumber,
    InvoiceDate: fields.InvoiceDate,
    DueDate:     fields.DueDate,
    Amount:      fields.Amount,
    Notes:       fields.Notes  || undefined,
    Status:      fields.Status || "Sent",
  });
}
async function updateInvoice(id, fields) {
  const payload = {};
  if (fields.InvoiceNumber !== undefined) payload.Title       = fields.InvoiceNumber;
  if (fields.InvoiceDate   !== undefined) payload.InvoiceDate = fields.InvoiceDate;
  if (fields.DueDate       !== undefined) payload.DueDate     = fields.DueDate;
  if (fields.Amount        !== undefined) payload.Amount      = fields.Amount;
  if (fields.Notes         !== undefined) payload.Notes       = fields.Notes;
  if (fields.Status        !== undefined) payload.Status      = fields.Status;
  return updateItem("GPInvoices", id, payload);
}

async function uploadInvoiceAttachment(itemId, file) {
 // Upload PDF to GPInvoiceFiles document library via Graph Drive API.
 // filename includes itemId to avoid collisions.
 const filename = `invoice-${itemId}-${file.name}`;
 const token = await getToken();
 if (!token) throw new Error('Not authenticated');
 const url = `${GRAPH}/sites/${CONFIG.SP_SITE_ID}/drives/${CONFIG.GP_INVOICE_DRIVE_ID}/items/root:/${encodeURIComponent(filename)}:/content`;
 const res = await fetch(url, {
 method: 'PUT',
 headers: {
 'Authorization': `Bearer ${token}`,
 'Content-Type': 'application/pdf',
 },
 body: file,
 });
 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 throw new Error(err?.error?.message || `Upload failed: HTTP ${res.status}`);
 }
 const result = await res.json();
 // Return the web URL so it can be stored on the list item
 return result?.webUrl || null;
}
async function addInvoiceFileURL(itemId, fileUrl) {
 // Write the uploaded file's URL back to the GPInvoices list item.
 return updateItem('GPInvoices', itemId, { FileURL: fileUrl });
}

// ── People photos: upload into the PeoplePhotos document library ───────
let _peoplePhotosDriveId = null;
async function getPeoplePhotosDriveId() {
  if (_peoplePhotosDriveId) return _peoplePhotosDriveId;
  const data = await graphRequest('GET', `/sites/${CONFIG.SP_SITE_ID}/drives`);
  const drive = (data.value || []).find(d => d.name === 'PeoplePhotos');
  if (!drive) throw new Error("'PeoplePhotos' document library not found on the site.");
  _peoplePhotosDriveId = drive.id;
  return drive.id;
}

// Upload an image; returns its web URL. prefix = 'person' | 'leader'.
// Stable filename (prefix-id.ext) so re-uploads overwrite the previous photo.
async function uploadPeoplePhoto(prefix, id, file) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const driveId = await getPeoplePhotosDriveId();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const filename = `${prefix}-${id}.${ext}`;
  const url = `${GRAPH}/sites/${CONFIG.SP_SITE_ID}/drives/${driveId}/items/root:/${encodeURIComponent(filename)}:/content`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type || 'image/jpeg' },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Photo upload failed: HTTP ${res.status}`);
  }
  const result = await res.json();
  const web = result?.webUrl;
  return web ? web + (web.includes('?') ? '&' : '?') + 'v=' + Date.now() : null;
}

// ── Payroll summary ───────────────────────────────────────────────────
async function createPayrollNotification({ month, year, joiners, leavers, bonus }) {
  const extraFields = {
    Month:      ['January','February','March','April','May','June','July','August','September','October','November','December'][month - 1],
    Year:       String(year),
    Joiners:    JSON.stringify(joiners),
    Leavers:    JSON.stringify(leavers),
    BonusData:  bonus ? JSON.stringify(bonus) : null,
  };
  return fireNotification({
    triggerType: 'payrollSummary',
    recipients:  ['system@newton'],
    triggerKey:  `payrollsummary-${year}-${month}`,
    tone:        'info',
    deepLink:    '',
    body:        `Payroll summary for ${month}/${year}`,
    extraFields,
  });
}

// ── Shared utilities ──────────────────────────────────────────────────
function printPage(title, landscape = false, module = 'Newton') {
  document.getElementById('print-header-title').textContent = 'Newton';
  document.getElementById('print-header-sub').textContent = module;
  // Set the document title so it becomes the default PDF filename, then restore.
  const prevDocTitle = document.title;
  if (title) document.title = title;
  let styleEl = null;
  if (landscape) {
    styleEl = document.createElement('style');
    styleEl.id = '__print-orientation__';
    styleEl.textContent = '@page { size: A4 landscape; }';
    document.head.appendChild(styleEl);
  }
  window.print();
  if (styleEl) {
    setTimeout(() => styleEl.remove(), 1000);
  }
  setTimeout(() => { document.title = prevDocTitle; }, 1000);
}

// ── Market Report ─────────────────────────────────────────────
async function getMarketReports() {
  return getItems("MarketReports");
}
async function getMarketReportById(id) {
  return getItem("MarketReports", id);
}
async function createMarketReport(fields) {
  return createItem("MarketReports", fields);
}
async function updateMarketReport(id, fields) {
  return updateItem("MarketReports", id, fields);
}

// Generic role-visibility resolver, despite the old name — used by both the
// Market Report builder and the bulk weekly-activity grid (N-147, N-165).
async function getScopedRolesVisibleTo(email, effectiveRole) {
  const lower = email.toLowerCase();

  if (effectiveRole === "admin") {
    return getAllRoles();
  }

  if (effectiveRole === "delivery_manager") {
    const projectIds = await getUserProjectIds(email);
    if (!projectIds) return getAllRoles();
    const arrays = await Promise.all(
      projectIds.map(pid => getRolesForProject(pid))
    );
    return arrays.flat();
  }

  // Talent Partner: only roles where TalentPartner column matches their email.
  // projectIds is de-duped here (not via getUserProjectIds, which this branch
  // doesn't call) so the per-project role fan-out below can't double up.
  const assignments = await getItems(
    "UserAssignments",
    `fields/Title eq '${lower}'`
  );
  if (!assignments.length) return [];
  const projectIds = [...new Set(assignments.map(a => String(a.ProjectID)))];
  const arrays = await Promise.all(
    projectIds.map(pid => getRolesForProject(pid))
  );
  return arrays.flat().filter(r => tpMatches(r.TalentPartner, lower));
}

// ── Employee Engagement ───────────────────────────────────────────────

// Field aliases for the 5 new survey lists.
// Extend FIELD_ALIASES at the top of the file with these entries:
//   SurveyTemplates:   {},
//   SurveyQuestions:   {},
//   SurveyRuns:        {},
//   SurveyResponses:   {},
//   SurveyCompletions: {},
// (No aliasing needed — all SP column names match the display names.)

// ── Read ──────────────────────────────────────────────────────────────

async function getSurveyTemplates() {
  return getItems("SurveyTemplates");
}

async function getActiveSurveyRun() {
  const runs = await getItems("SurveyRuns", "fields/Status eq 'Active'");
  return runs.length > 0 ? runs[0] : null;
}

async function getSurveyRunById(runId) {
  return getItem("SurveyRuns", runId);
}

async function getSurveyRuns() {
  return getItems("SurveyRuns");
}

async function getSurveyQuestions(templateId) {
  const questions = await getItems("SurveyQuestions", `fields/TemplateID eq '${templateId}'`);
  return questions.sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
}

async function getSurveyResponses(runId) {
  return getItems("SurveyResponses", `fields/RunID eq '${runId}'`);
}

async function hasCompletedSurvey(runId, email) {
  const completions = await getItems(
    "SurveyCompletions",
    `fields/RunID eq '${runId}' and fields/RespondentEmail eq '${email.toLowerCase()}'`
  );
  return completions.length > 0;
}

async function getSurveyCompletionCount(runId) {
  const completions = await getItems("SurveyCompletions", `fields/RunID eq '${runId}'`);
  return completions.length;
}

// ── Write ─────────────────────────────────────────────────────────────

async function createSurveyTemplate(fields) {
  return createItem("SurveyTemplates", {
    Title:          fields.Title,
    Description:    fields.Description   || "",
    TargetAudience: fields.TargetAudience || "All",
    Status:         fields.Status         || "Draft",
    // N-133: isoDate() pins these to T12:00:00Z. Written bare, SharePoint
    // resolved them in the SITE's timezone, so a BST-season date stored 23:00Z
    // on the PREVIOUS day — and because the edit form redisplays the stored day
    // and re-saves it, the value walked back one day on every edit. CloseDate
    // is currently supplied by no caller, but it is the same shape one line
    // over and would ratchet identically the moment one does.
    TargetDate:     isoDate(fields.TargetDate) || undefined,
    CloseDate:      isoDate(fields.CloseDate)  || undefined,
    CreatedByEmail: fields.CreatedByEmail || "",
  });
}

async function updateSurveyTemplate(id, fields) {
  const payload = {};
  if (fields.Title          !== undefined) payload.Title          = fields.Title;
  if (fields.Description    !== undefined) payload.Description    = fields.Description;
  if (fields.TargetAudience !== undefined) payload.TargetAudience = fields.TargetAudience;
  if (fields.Status         !== undefined) payload.Status         = fields.Status;
  // N-133: the UPDATE path is what actually drove the ratchet — each edit
  // re-stored the (already shifted) day the form was showing. isoDate() returns
  // null for an empty value, which is the correct way to clear a SharePoint
  // date field, so deliberately emptying the field still clears it.
  if (fields.TargetDate     !== undefined) payload.TargetDate     = isoDate(fields.TargetDate);
  if (fields.CloseDate      !== undefined) payload.CloseDate      = isoDate(fields.CloseDate);
  return updateItem("SurveyTemplates", id, payload);
}

async function createSurveyQuestion(fields) {
  return createItem("SurveyQuestions", {
    TemplateID:         String(fields.TemplateID),
    QuestionText:       fields.QuestionText,
    QuestionType:       fields.QuestionType,
    ScaleMin:           fields.ScaleMin       ?? 1,
    ScaleMax:           fields.ScaleMax       ?? 5,
    ScaleMinLabel:      fields.ScaleMinLabel  || "",
    ScaleMaxLabel:      fields.ScaleMaxLabel  || "",
    Options:            fields.Options        || "",
    IsRequired:         fields.IsRequired  ?? false,
    SortOrder:          fields.SortOrder   ?? 0,
  });
}

async function updateSurveyQuestion(id, fields) {
  const payload = {};
  if (fields.QuestionText !== undefined) payload.QuestionText = fields.QuestionText;
  if (fields.QuestionType !== undefined) payload.QuestionType = fields.QuestionType;
  if (fields.ScaleMin      !== undefined) payload.ScaleMin      = fields.ScaleMin;
  if (fields.ScaleMax      !== undefined) payload.ScaleMax      = fields.ScaleMax;
  if (fields.ScaleMinLabel !== undefined) payload.ScaleMinLabel = fields.ScaleMinLabel;
  if (fields.ScaleMaxLabel !== undefined) payload.ScaleMaxLabel = fields.ScaleMaxLabel;
  if (fields.Options       !== undefined) payload.Options       = fields.Options;
  if (fields.IsRequired   !== undefined) payload.IsRequired   = fields.IsRequired;
  if (fields.SortOrder    !== undefined) payload.SortOrder    = fields.SortOrder;
  return updateItem("SurveyQuestions", id, payload);
}

async function deleteSurveyQuestion(id) {
  return deleteItem("SurveyQuestions", id);
}

async function createSurveyRun(fields) {
  // N-131: canonical midday-UTC, like every other SharePoint date write. The
  // bare shape was kept until now (see N-088) because index.html does
  // ARITHMETIC on these two values, so changing the shape moves behaviour:
  //   index.html ~233  daysSince -> the reminder gate (CONFIG.SURVEY.REMINDER_DAY)
  //   index.html ~299  hrsLeft   -> the "closes in Xh" notification
  // Both were reworked in the same change to be time-of-day insensitive —
  // daysSince now counts calendar days, and hrsLeft counts to the END of the
  // close date (a run closing on the 20th is open THROUGH the 20th). If either
  // consumer is touched again, keep them insensitive to the stored time.
  // localDayISO() below still produces the correct local DAY; isoDate() only
  // pins it to midday so no browser offset can shift it.
  const openDate  = fields.OpenDate  || localDayISO();
  const closeDate = fields.CloseDate || (() => {
    const d = new Date(); d.setDate(d.getDate() + CONFIG.SURVEY.DEFAULT_DURATION_DAYS);
    return localDayISO(d);
  })();
  return createItem("SurveyRuns", {
    Title:              fields.RunLabel,
    TemplateID:         String(fields.TemplateID),
    OpenDate:           isoDate(openDate),
    CloseDate:          isoDate(closeDate),
    Status:             "Active",
    EligibleCount:      fields.EligibleCount || 0,
  });
}

async function updateSurveyRun(id, fields) {
  const payload = {};
  if (fields.Status        !== undefined) payload.Status    = fields.Status;
  // N-131: the edit path needs it too — fixing only createSurveyRun would
  // leave a close date changed after activation writing the bare shape.
  if (fields.CloseDate     !== undefined) payload.CloseDate = isoDate(fields.CloseDate);
  if (fields.EligibleCount !== undefined) payload.EligibleCount = fields.EligibleCount;
  return updateItem("SurveyRuns", id, payload);
}

// Called once per question answer on survey submission.
// UUID only — no email, no user identifier.
async function createSurveyResponse(fields) {
  return createItem("SurveyResponses", {
    RunID:              String(fields.RunID),
    QuestionID:         String(fields.QuestionID),
    RespondentUUID:     fields.RespondentUUID,
    AnswerValue:        String(fields.AnswerValue),
    SubmittedAt:        new Date().toISOString(),
  });
}

// Called once on submit — email only, no answers.
async function createSurveyCompletion(runId, email) {
  return createItem("SurveyCompletions", {
    RunID:           String(runId),
    RespondentEmail: email.toLowerCase(),
  });
}
