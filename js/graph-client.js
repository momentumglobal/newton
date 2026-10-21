// js/graph-client.js — Graph transport and caching (N-347, split out of api.js).
// Owns: the Graph base URL, the tier-1 in-memory cache, the restricted-list
// denial memo, the tier-2 sessionStorage cache, delta sync, $batch queueing,
// the FIELD_ALIASES registry (normaliseFields, getMonitoredLists), the generic
// CRUD helpers (getItems / getItem / createItem / updateItem / deleteItem) and
// the "Refresh data" reset. Every read and write in Newton goes through here.
// Loads after permissions.js and straight before api.js in every shell.
// Executes ONE statement at load — _ssPurgeStaleBuilds(), below — which reads
// CONFIG (config.js) and is a no-op without sessionStorage (tests/run.js).
// Runtime dependencies: getToken (auth.js), isRestrictedList /
// isListAccessDenied / isDenialFresh (permissions.js), toast (ui-kit.js,
// refreshData only, typeof-guarded).

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
// ── Restricted-list denial memo (N-285) ────────────────────────────────
// A user without read on a CONFIG.RESTRICTED_LISTS list gets a 403 from
// Graph. getItems() turns that into an empty array and records the time
// here, so (a) the same list is not re-requested on every render for the
// next _CACHE_TTL_MS, and (b) a caller that must not act on missing data can
// ask wasListDenied(). This is deliberately NOT _apiCache / sessionStorage:
// a denial is never a cache entry (nothing to go stale or be forged), and a
// permission change is picked up on the next page load. Cleared by any write
// to the list (_cacheInvalidate) and by refreshData().
const _deniedLists = new Map();

function _denialMemoSet(listName) {
  if (!wasListDenied(listName)) {
    console.warn(`Newton: no read access to "${listName}" — treated as an empty list (N-285).`);
  }
  _deniedLists.set(listName, Date.now());
}

// True while a fresh denial is on record for the list. Call it straight
// after the read it qualifies — the window is _CACHE_TTL_MS.
function wasListDenied(listName) {
  const ts = _deniedLists.get(listName);
  if (ts === undefined) return false;
  if (isDenialFresh(ts, Date.now(), _CACHE_TTL_MS)) return true;
  _deniedLists.delete(listName);
  return false;
}

function _cacheInvalidate(listName) {
  // Remove all cached entries for this list (any filter)
  for (const key of _apiCache.keys()) {
    if (key.startsWith(listName + '|')) _apiCache.delete(key);
  }
  // N-285: a write to the list means its access may have changed.
  _deniedLists.delete(listName);
  // N-176 (F-3a): tier 2 as well. This one line IS the invalidation
  // contract — createItem/updateItem/deleteItem already call this function,
  // so every compliant write path invalidates both tiers with no change at
  // the call site. Any new write path that bypasses those three helpers
  // bypasses this too; that is why N-176 converted the three raw
  // graphRequest('DELETE', ...) sites in admin.js/os-admin.js.
  _ssPurge(listName);
  // N-186 (F-13a): the delta baseline + token as well, for any delta-
  // enrolled list. Simplest correct behaviour — a Newton-side write forces a
  // full bootstrap on the next read rather than trying to merge a local
  // optimistic change into the tracked baseline. Safe to call unconditionally
  // even for a non-enrolled list: the key is simply absent.
  try { sessionStorage.removeItem(_deltaKey(listName)); } catch (e) { /* ignore */ }
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

// Pure. True only for OUR keys. Four unrelated sessionStorage key families
// already exist (newton_ghost_, newton_diag_, newton_survey_,
// newton_force_desktop) and none of them may ever be touched by a cache
// purge. (newton_role_ and newton_dm_grants_ are legacy keys that are no
// longer written — N-296 removed the role cache, N-282 moved DM grants to
// memory — and must still be spared by a purge, hence the test.)
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

// Runs once when graph-client.js parses, after config.js has defined CONFIG
// (script load order is config.js -> … -> permissions.js -> graph-client.js
// in every shell).
// No-op under the Node test harness and no-op while persistentLists is empty.
_ssPurgeStaleBuilds();

// ── Delta sync — engine + token store (N-186 / F-13a) ─────────────────
// Replaces a full re-fetch-and-recache on a tier-1/tier-2 miss with an
// incremental sync: only rows Graph says changed since the stored deltaLink
// come back over the wire, merged into a persisted baseline array. ENGINE +
// ONE PILOT LIST ONLY (CONFIG.DELTA.enrolledLists = ['WeeklyActivity']) —
// N-187 (F-13b) adds Placements and handles composition with server-side
// filters; do not enrol a second list here for that ticket.
//
// A delta-enrolled list's UNFILTERED read (filter === "") is the only case
// this engine touches — SharePoint list-item delta queries do not support
// $filter. Every filtered read against an enrolled list is completely
// unaffected: it falls through to the existing tier-1/tier-2/paginated-fetch
// path in getItems(), exactly as it does today.
//
// One sessionStorage entry per enrolled list, key `newton_delta_<listName>`
// (no filter/select component — there is only ever one unfiltered read to
// track). Entry shape: { ts, build, deltaLink, items } — the baseline array
// and the token that advances it are written together in one setItem call,
// so a partial write can never leave a token pointing at a merge state the
// entry doesn't actually hold.
//
// Follows the stamped-entry pattern ({ ts, build, … }, build-stamp checked on
// read — the shape the retired N-177 role cache used, N-296), not the tier-2
// cache pattern. A delta token doesn't
// go stale on a client clock; it stays valid until Graph says otherwise (a
// 410 on use) or until we invalidate it ourselves (a build bump, or a
// Newton-side write via _cacheInvalidate). So the build stamp is still
// checked — a deploy busts it, same as every other cache tier — but
// CONFIG.CACHE.ttlMs is never consulted for this entry.

// PURE — same shape rules as the other stamped entries. No storage access, no side effects.
function _deltaEntryUsable(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (typeof entry.ts !== 'number') return false;
  if (entry.build !== CONFIG.APP_BUILD) return false;
  if (typeof entry.deltaLink !== 'string' || !entry.deltaLink) return false;
  if (!Array.isArray(entry.items)) return false;
  return true;
}

// PURE.
function _deltaKey(listName) {
  return 'newton_delta_' + listName;
}

// PURE. The delta store is keyed by list name ONLY (_deltaKey), not by $select,
// so it may only ever hold — and serve — the default projection. A call with an
// explicit `select` (Data Health's id-only row counts) must never bootstrap or
// read it: an id-only baseline would be handed back later to every default-
// projection read of the same list (N-271). Filtered calls never use it either.
function _deltaEligibleCall(filter, select) {
  return !filter && !select;
}

// Storage-touching, hence guarded. False whenever sessionStorage is absent
// (Node test harness), the live kill switch is off, or the list isn't the
// (currently singular) enrolled pilot.
function _deltaEnabled(listName) {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    if (!CONFIG.DELTA || !CONFIG.DELTA.enabled) return false;
    return (CONFIG.DELTA.enrolledLists || []).includes(listName);
  } catch (e) {
    return false;
  }
}

function _deltaEntryGet(listName) {
  try {
    const raw = sessionStorage.getItem(_deltaKey(listName));
    if (!raw) return null;
    let entry = null;
    try { entry = JSON.parse(raw); } catch (e) { entry = null; }
    if (!_deltaEntryUsable(entry)) {
      sessionStorage.removeItem(_deltaKey(listName));
      return null;
    }
    return entry;
  } catch (e) {
    try { sessionStorage.removeItem(_deltaKey(listName)); } catch (e2) { /* ignore */ }
    return null;
  }
}

function _deltaEntrySet(listName, deltaLink, items) {
  try {
    sessionStorage.setItem(_deltaKey(listName), JSON.stringify({
      ts: Date.now(), build: CONFIG.APP_BUILD, deltaLink, items
    }));
  } catch (e) {
    /* quota exceeded or private mode — next miss just bootstraps again */
  }
}

// PURE. `page` is the raw Graph `value[]` from a delta response (fields NOT
// yet normalised). Mutates and returns `baseline` (an array of already-
// normalised items — same shape getItems() has always returned).
function _deltaMerge(baseline, page, listName) {
  for (const raw of page) {
    const idx = baseline.findIndex(it => it.id === raw.id);
    if (raw['@removed']) {
      if (idx !== -1) baseline.splice(idx, 1);
      continue;
    }
    // N-230: a delta page item with no usable `fields` must never be
    // merged as an all-undefined row — throw so _deltaSync's existing
    // catch (today only exercised by a stale-token 410) drops the stored
    // entry and retries once as a full bootstrap instead.
    if (!raw.fields || typeof raw.fields !== 'object') {
      throw new Error(`Delta sync for ${listName}: item ${raw.id} has no usable fields`);
    }
    const item = { id: raw.id, ...normaliseFields(listName, raw.fields) };
    if (idx !== -1) baseline[idx] = item; else baseline.push(item);
  }
  return baseline;
}

// Bootstrap (no usable stored entry) or incremental (stored entry present).
// Either way returns the current merged array and leaves a fresh entry
// stored. On any failure of an INCREMENTAL sync — including Graph's 410 on a
// stale deltaLink, which graphRequest() surfaces as a normal thrown error —
// drops the stored entry and retries ONCE as a bootstrap; never loops. A
// bootstrap failure propagates exactly like a normal getItems() network
// failure does today.
async function _deltaSync(listName, selectStr) {
  const entry = _deltaEntryGet(listName);
  let url, baseline;
  if (entry) {
    url = entry.deltaLink;
    baseline = entry.items;
  } else {
    url = `${listPath(listName)}/delta?$expand=fields($select=${selectStr})`;
    baseline = [];
  }
  try {
    let deltaLink = null;
    while (url) {
      const data = await graphRequest("GET", url);
      _deltaMerge(baseline, data.value, listName);
      if (data['@odata.deltaLink']) {
        deltaLink = data['@odata.deltaLink'].replace(GRAPH, '');
        url = null;
      } else {
        url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(GRAPH, '') : null;
      }
    }
    _deltaEntrySet(listName, deltaLink, baseline);
    return baseline;
  } catch (e) {
    if (entry) {
      console.warn(`Delta sync failed for ${listName}, falling back to a full resync:`, e);
      try { sessionStorage.removeItem(_deltaKey(listName)); } catch (e2) { /* ignore */ }
      return _deltaSync(listName, selectStr);
    }
    throw e; // bootstrap itself failed — behave like today's network error
  }
}

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
  // N-286: {} is deliberate — Title holds the People item id as text and
  // PersonID (Number) is the join key; both are read under their own names.
  // A self-mapping alias would DELETE the field (see RoleHistory below).
  // Restricted list: admin + leadership only (CONFIG.RESTRICTED_LISTS).
  PeoplePay:       {},
  // N-300: {} — every column is read/written under its own name. Restricted.
  PayrollSummaries: {},
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
  // ── WeeklyActivity anomaly acknowledgements (N-273) ─────────
  // {} is deliberate — every AnomalyAcks column is already the display name
  // Newton wants; a self-mapping alias would DELETE the field (see the
  // RoleHistory entry below). Registering here also enrols the list in
  // N-154's Data Health row-count watch, which is wanted.
  AnomalyAcks: {},
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
  // ── Role headcount (N-306 / HC-1) ────────────────────────────────
  // {} is deliberate — every RoleHeadcount column, Title included (the
  // 'Headcount <n>' label), is read and written under its own name; a
  // self-mapping alias would DELETE the field (see RoleHistory above).
  // RoleID / ProjectID are plain Number columns, not Lookups. Writes go only
  // through the headcount helpers below (tests/lint-headcount-writes.js).
  RoleHeadcount: {},
  // ── Candidate briefing packs (N-211) ─────────────────────────
  // {} is deliberate — every BriefingPacks column is already the display
  // name Newton wants, including Title (the pack title). Deliberately NOT
  // in CONFIG.CACHE.persistentLists: packs are user-edited and must appear
  // in the library the moment they are saved.
    BriefingPacks: {},
  // ── Client logos, one row per project (N-214) ─────────────
  // Deliberately its own list rather than a column on Projects: Projects is
  // enrolled in CONFIG.CACHE.persistentLists and bounded by
  // CONFIG.CACHE.maxEntryBytes (262144), and base64 logos on that row would
  // push it past the cap and silently disable tier-2 caching app-wide.
  ClientLogos: {},
  // ── LCI project → CSD owner, one row per claimed LCI customer (N-219) ──
  // RETIRED by N-363: LCI / Transformation customers are Projects rows now and the owner CSD
  // lives on Projects.CSDName. This list is a frozen backup, read only by the N-363 migration
  // (getLCIProjectOwners, api-admin.js). CSDName is a plain text column (a People.EmployeeName
  // value), never a Lookup. When the list is deleted from SharePoint, delete this alias and
  // that reader too.
  LCIProjectOwners: { Title: 'CustomerName' },
  // ── Project & Role checklists (N-266a) ──────────────────────
  // ChecklistTemplates: one row per checklist item; Title is the item label.
  // ChecklistProgress: one row per (record, item) tick; Title holds the
  // record type ('project' | 'role'). Writes use the internal 'Title';
  // OData filters use fields/Title. Calls live in api-checklists.js.
  ChecklistTemplates: { Title: 'ItemLabel' },
  ChecklistProgress:  { Title: 'RecordType' },
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

// N-154 (F-10b): every list Newton knows about, minus deliberate exclusions.
// FIELD_ALIASES is the canonical registry — registering a list there is
// already mandatory — so deriving from it means a new list is monitored the
// day it is added, with no second place to forget.
//
// The derived array leaves graph-client.js; FIELD_ALIASES itself deliberately does
// NOT. Exporting the raw map would make the registry editable from outside
// the one file that owns it. The EXCLUSIONS are config and live in
// config.js; the registry is not config and lives here.
function getMonitoredLists() {
  const excluded = new Set(CONFIG.DATA_HEALTH_EXCLUDED_LISTS || []);
  return Object.keys(FIELD_ALIASES).filter(l => !excluded.has(l)).sort();
}

// ── Generic helpers ─────────────────────────────────────────────────
// N-188 (F-14): graphRequest() is a thin router. A GET call, when
// CONFIG.BATCH is enabled, is queued and
// flushed as one shared Graph $batch POST alongside any other GET calls
// that land in the same macrotask window (see _flushBatchQueue below for
// why a macrotask boundary, not a microtask, is what makes this safe).
// Every other call — POST/PATCH/DELETE — goes
// straight through to _graphRequestSolo, unchanged from before N-188.
// N-291: one token for every call (the Sites.Manage.All path is gone).
async function graphRequest(method, path, body = null) {
  if (method !== 'GET' || !_batchEnabled()) {
    return _graphRequestSolo(method, path, body);
  }
  return new Promise((resolve, reject) => {
    _batchQueue.push({ path, resolve, reject });
    if (_batchQueue.length === 1) setTimeout(_flushBatchQueue, 0);
  });
}

// N-285: every Graph failure is built here so the HTTP status survives on the
// Error (err.status) — before this, status was discarded and nothing could
// tell a 403 from a 500. The message is exactly what it was before (Graph's
// own message, else "HTTP <status>"), so no existing caller changes.
function _graphError(status, body) {
  const detail = body && body.error;
  const e = new Error((detail && detail.message) || `HTTP ${status}`);
  e.status = status;
  e.graphCode = (detail && detail.code) || '';
  return e;
}

// The single-request path: every POST/PATCH/DELETE, and the solo-fallback
// GET, goes through exactly this.
async function _graphRequestSolo(method, path, body = null) {
  const token = await getToken();
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
    throw _graphError(res.status, err);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── $batch queueing (N-188 / F-14) ──────────────────────────────────
// GET-only. Concurrent Promise.all-driven reads (Company
// Dashboard, Report Builder) reach this point at different await depths —
// each wrapper function (getProjects, getWeeklyActivity, ...) crosses a
// different number of internal cache-check awaits first — so a microtask
// flush would fire too early and miss most of the cohort. A macrotask
// boundary (setTimeout 0) waits for the whole microtask queue to drain —
// every pending cache-check across every concurrent wrapper call — before
// flushing, and costs nothing: getToken() only runs AFTER the window
// closes, once per chunk, so this delay is pure JS-side cache-check time,
// never MSAL/network latency (confirmed by reading js/auth.js in full).
function _batchEnabled() {
  return !!(CONFIG.BATCH && CONFIG.BATCH.enabled);
}
let _batchQueue = [];
function _flushBatchQueue() {
  // Synchronous snapshot-and-clear: anything pushed after this line starts
  // its own next window rather than being dropped or folded into this one.
  const chunk = _batchQueue;
  _batchQueue = [];
  const maxSub = (CONFIG.BATCH && CONFIG.BATCH.maxSubRequests) || 20;
  for (let i = 0; i < chunk.length; i += maxSub) {
    _dispatchBatchGroup(chunk.slice(i, i + maxSub));
  }
}
async function _dispatchBatchGroup(group) {
  // A lone item never pays for a $batch envelope.
  if (group.length === 1) {
    const item = group[0];
    _graphRequestSolo('GET', item.path, null).then(item.resolve, item.reject);
    return;
  }
  try {
    const results = await _dispatchBatchChunk(group);
    for (const { status, body, item } of results) {
      if (status >= 200 && status < 300) {
        item.resolve(body);
      } else if (status === 429 || status === 503) {
        // Don't retry inside the batch — fall back to a solo, retryable
        // call for just this item, reusing the unmodified GRAPH_RETRY loop
        // rather than reimplementing per-sub-request backoff bookkeeping.
        _graphRequestSolo('GET', item.path, null).then(item.resolve, item.reject);
      } else {
        item.reject(_graphError(status, body));
      }
    }
  } catch (e) {
    // The outer envelope itself failed (after retry) — every item in this
    // group fails together, same as if each had made its own failed call.
    for (const item of group) item.reject(e);
  }
}
async function _dispatchBatchChunk(group) {
  // One shared token for the whole chunk — the actual auth-overhead saving
  // this ticket exists for. Never call getToken() per sub-request.
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const requests = group.map((item, i) => ({
    id: String(i),
    method: 'GET',
    url: item.path,
    headers: { "Prefer": "HonorNonIndexedQueriesWarningMayFailRandomly" },
  }));
  const opts = {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  };
  const { maxAttempts, baseDelayMs } = CONFIG.GRAPH_RETRY;
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`${GRAPH}/$batch`, opts);
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
    throw _graphError(res.status, err);
  }
  const data = await res.json();
  const byId = new Map((data.responses || []).map(r => [String(r.id), r]));
  // Match by id, not array position — Graph does not guarantee responses[]
  // preserves requests[] order.
  return group.map((item, i) => {
    const r = byId.get(String(i)) || { status: 502, body: { error: { message: 'No matching batch response' } } };
    return { id: String(i), status: r.status, body: r.body, item };
  });
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
// api.js call sites, pending the full field audit in N-052/N-053).
// If select is omitted, resolves from CONFIG.LIST_FIELDS[listName] when
// present and non-empty; otherwise falls back to '*' (today's behaviour).
//
// N-285: for a list in CONFIG.RESTRICTED_LISTS a 403 is "no rows" — a fresh
// empty array (callers sort/mutate it), nothing written to either cache tier,
// and the denial memoised (see _deniedLists) so it is not re-requested every
// render. Everything else rethrows unchanged. The memo is checked BEFORE the
// cache tiers: a list that just 403'd must not be answered from an older
// cached copy of itself.
async function getItems(listName, filter = "", select = null) {
  const restricted = isRestrictedList(listName);
  if (restricted && wasListDenied(listName)) return [];
  try {
    return await _getItemsRaw(listName, filter, select);
  } catch (e) {
    if (restricted && isListAccessDenied(listName, e)) {
      _denialMemoSet(listName);
      return [];
    }
    throw e;
  }
}

async function _getItemsRaw(listName, filter = "", select = null) {
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

  // N-186 (F-13a): a miss on an unfiltered, delta-enrolled list is an
  // incremental sync, not a full re-fetch. SharePoint list-item delta
  // queries don't support $filter, so any filtered call — including every
  // existing WeeklyActivity call site except admin.js's unfiltered dashboard
  // pull — is untouched and falls straight through to the paginated fetch
  // below, exactly as it does today.
  //
  // N-271: nor may a call with an explicit `select`. The stored baseline is
  // keyed by list name alone, so an id-only row count would leave an id-only
  // baseline behind for every later default-projection read (_deltaEligibleCall).
  if (_deltaEligibleCall(filter, select) && _deltaEnabled(listName)) {
    const items = await _deltaSync(listName, selectStr);
    _cacheSet(listName, filter, selectStr, items);
    _ssSet(listName, filter, selectStr, items);
    return items;
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

// ── Write ─────────────────────────────────────────────────────────────
async function createItem(listName, fields) {
  const result = await graphRequest("POST", listPath(listName), { fields });
  _cacheInvalidate(listName);
  return result;
}
async function updateItem(listName, itemId, fields) {
  const result = await graphRequest("PATCH", `${listPath(listName)}/${itemId}`, { fields });
  _cacheInvalidate(listName);
  return result;
}
async function deleteItem(listName, itemId) {
  const result = await graphRequest("DELETE", `${listPath(listName)}/${itemId}`);
  _cacheInvalidate(listName);
  return result;
}

// ── Explicit refresh (N-176 / F-3a) ──────────────────────────────────
// The user's escape hatch from a stale cache, behind the sidebar's
// "Refresh data" button. Clears BOTH tiers and nothing else:
// newton_ghost_*, newton_diag_*, newton_survey_* and
// newton_force_desktop belong to other features, and a "Refresh data" that
// silently re-resolved the user's role or dropped them out of Ghost Mode
// would be a different and surprising action.
// onDone re-renders in place when the caller can (nav-core.js passes the
// current page's navigate call); with no callback we fall back to a full
// reload, which is correct but loses the toast.
function refreshData(onDone = null) {
  _apiCache.clear();
  _deniedLists.clear(); // N-285: re-check restricted lists on the next read
  _ssPurge();
  if (typeof onDone === 'function') {
    if (typeof toast === 'function') toast('Data refreshed', { type: 'success' });
    onDone();
    return;
  }
  location.reload();
}
