// js/headcount.js — pure domain helpers shared by several modules: headcount, role history, placement
// picker, Hiring Plan ↔ headcount link, WeeklyActivity.ProjectID integrity (N-346b). No network I/O, no DOM.
// Loaded on every page after utils.js and ui-kit.js (and richtext.js where present), before permissions.js,
// graph-client.js and api.js.
// Needs from utils.js: addDaysISO, addMonthsToKey, daysOpen, escAttr, escHtml, fillTemplate, isOpenPipelineStage,
// monthKeyFromISO, monthKeyMonth, monthKeyYear, spDateIn (and CONFIG). utils.js calls nothing in this file.

// ── Headcount (N-306 / HC-1) ───────────────────────────────────────────
// Pure helpers for the RoleHeadcount list. A Role is the pipeline; each
// RoleHeadcount row is one hire slot. Status ('Open' | 'Cancelled') is
// stored; "filled" is DERIVED from Placements.HeadcountID and never stored
// (headcount model rule 4). RoleID / ProjectID / HeadcountID are plain
// Number columns that can arrive as numbers or numeric strings, so every id
// comparison here goes through String(). Day values go through spDateIn() —
// never a Date and a local getter (BST shift).

// Retired stage → current stage (CONFIG.ROLE_STAGE_LEGACY_ALIASES): 'Hired'
// → 'Closed'. Anything else, blank included, comes back unchanged.
function normaliseRoleStage(stage) {
  const aliases = CONFIG.ROLE_STAGE_LEGACY_ALIASES || {};
  return Object.prototype.hasOwnProperty.call(aliases, stage) ? aliases[stage] : stage;
}

// RoleHistory rows with their Stage values read through normaliseRoleStage().
// Applied on EVERY RoleHistory read path (api.js, api-admin.js) — RoleHistory
// itself is never rewritten (model rule 5). Only Field 'Stage' rows change.
// Returns a new array and new objects for changed rows; never mutates its
// input, which may be an array shared through the tier-1 cache.
function normaliseRoleHistoryRows(rows) {
  return (rows || []).map(r => {
    if (!r || r.Field !== 'Stage') return r;
    const oldValue = normaliseRoleStage(r.OldValue);
    const newValue = normaliseRoleStage(r.NewValue);
    return (oldValue === r.OldValue && newValue === r.NewValue)
      ? r : { ...r, OldValue: oldValue, NewValue: newValue };
  });
}

// ── Role History timeline (N-100, N-313) ────────────────────────────────
// Pure helpers behind pages.js:showRoleTimeline — here, not in pages.js, so
// tests/run.js can reach them.
//
// Classifies one Stage RoleHistory row for the timeline's colour coding.
// 'start' = the creation row; 'branch' = On-hold/Cancelled on either end, or
// an unresolvable/equal comparison — deliberately neutral, never green or
// red, since neither is a point on the linear pipeline. Forward/backward is
// index comparison on CONFIG.ROLE_STAGES — the full canonical order (never
// analytics.js's ACTIVE_STAGES).
// N-313 'reset' (neutral, not a regression):
//   - Closed → an open-pipeline stage: the D-3 reopen. Always reset — the
//     placement that closed the pipeline normally predates the Closed node.
//   - a backward move with a placement since the previous node
//     (opts.placementSincePrev, from roleTimelineSequence): the pipeline
//     restarted for its next headcount.
// Legacy 'Hired' never reaches here — every RoleHistory read path runs
// normaliseRoleHistoryRows (N-306). Don't add a second alias.
function roleTimelineNodeClass(oldStage, newStage, opts = {}) {
  // N-100 UAT fix (round 2): falsy, never === '' — SharePoint hands a text
  // column written as '' back as null, so the creation row's OldValue may
  // be either.
  if (!oldStage) return 'start';
  const branchStages = CONFIG.ROLE_STAGES_BRANCH;
  if (branchStages.includes(newStage) || branchStages.includes(oldStage)) return 'branch';
  if (oldStage === CONFIG.ROLE_STAGE_CLOSED && isOpenPipelineStage(newStage)) return 'reset';
  const oldIdx = CONFIG.ROLE_STAGES.indexOf(oldStage);
  const newIdx = CONFIG.ROLE_STAGES.indexOf(newStage);
  if (oldIdx === -1 || newIdx === -1 || newIdx === oldIdx) return 'branch';
  if (newIdx > oldIdx) return 'forward';
  return opts.placementSincePrev ? 'reset' : 'backward';
}

// A placement's timeline day: OfferAcceptedDate's stored date portion
// ('YYYY-MM-DD'), or null. Day marker — never a Date + local getter.
function roleTimelinePlacementDay(p) {
  return p && p.OfferAcceptedDate ? spDateIn(p.OfferAcceptedDate) : null;
}

// N-313: interleaves read-only placement markers with the timeline's stage
// nodes. stageDays[i] = 'YYYY-MM-DD' of stage node i's EFFECTIVE date (after
// OpenDate back-dating), through the same spDateIn the node prints, so the
// marker order always agrees with the dates on screen. Markers never split a
// stage's duration — the caller still measures stage node i to node i+1.
//   order — { kind: 'stage', index } and { kind: 'placement', placement, day }
//           in display order. Before node 0's day → first; otherwise
//           immediately before the first node i >= 1 on or after its day (so
//           on a shared day the marker sits ABOVE the stage move); after
//           every node → last. Within one slot: day, then id ascending.
//   placementSincePrev[i] — a dated placement falls on
//           stageDays[i-1] <= day <= stageDays[i] (inclusive); [0] is false.
//   undated — placements with no OfferAcceptedDate (left out of order).
// Never mutates its inputs.
function roleTimelineSequence(stageDays, placements) {
  const days = stageDays || [];
  const dated = [];
  let undated = 0;
  (placements || []).forEach(p => {
    if (!p) return;
    const day = roleTimelinePlacementDay(p);
    if (day) dated.push({ placement: p, day });
    else undated++;
  });
  dated.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1
    : (Number(a.placement.id) || 0) - (Number(b.placement.id) || 0)));
  const slotOf = day => {
    if (!days.length || day < days[0]) return 0;
    for (let i = 1; i < days.length; i++) if (days[i] && days[i] >= day) return i;
    return days.length;
  };
  const slots = Array.from({ length: days.length + 1 }, () => []);
  dated.forEach(d => slots[slotOf(d.day)].push({ kind: 'placement', placement: d.placement, day: d.day }));
  const order = [];
  slots.forEach((markers, i) => {
    order.push(...markers);
    if (i < days.length) order.push({ kind: 'stage', index: i });
  });
  const placementSincePrev = days.map((day, i) =>
    i > 0 && !!days[i - 1] && !!day && dated.some(d => d.day >= days[i - 1] && d.day <= day));
  return { order, placementSincePrev, undated };
}

function _isBlankId(v) {
  return v === null || v === undefined || v === '';
}

// Map<String(headcountId), placement[]> — the placements filling each
// headcount. Placements with no HeadcountID are skipped.
function headcountFillMap(placements) {
  const map = new Map();
  (placements || []).forEach(p => {
    if (!p || _isBlankId(p.HeadcountID)) return;
    const k = String(p.HeadcountID);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  });
  return map;
}

// 'filled' | 'cancelled' | 'open'. A linked placement wins over a Cancelled
// status: the placement is a fact, the status a stored flag.
function classifyHeadcount(hc, fillMap) {
  if (hc && fillMap && fillMap.has(String(hc.id))) return 'filled';
  if (hc && hc.Status === CONFIG.HEADCOUNT.STATUS_CANCELLED) return 'cancelled';
  return 'open';
}

// D-5: "x/y" = open / total, where total = open + filled (cancelled is
// excluded from y). A headcount with no OpenDate still counts as open.
function headcountCounts(rows, fillMap) {
  const out = { open: 0, filled: 0, cancelled: 0, total: 0 };
  (rows || []).forEach(hc => { if (hc) out[classifyHeadcount(hc, fillMap)]++; });
  out.total = out.open + out.filled;
  return out;
}

// "Pipeline opened" (model rule 3): the earliest OpenDate across ALL of a
// role's headcount, cancelled included, as 'YYYY-MM-DD' — null when none has
// one. syncRoleOpenDate() (api-headcount.js) keeps Roles.OpenDate equal to this.
function earliestHeadcountOpenDate(rows) {
  let min = null;
  (rows || []).forEach(hc => {
    const day = hc && hc.OpenDate ? spDateIn(hc.OpenDate) : null;
    if (day && (min === null || day < min)) min = day;
  });
  return min;
}

// 1-based per role, never reused: one past the highest Sequence present.
function nextHeadcountSequence(rows) {
  const max = (rows || []).reduce((m, hc) => {
    const n = Number(hc && hc.Sequence);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return max + 1;
}

// RoleHeadcount.Title — 'Headcount 2'.
function headcountLabel(n) {
  return fillTemplate(CONFIG.HEADCOUNT.labelTemplate, { n });
}

// D-5 order for a role's OPEN headcount: OpenDate earliest first, no OpenDate
// last ("not opened"), ties by Sequence. Filled and cancelled rows are
// excluded. Returns a new array. The placement picker uses this order
// (placementHeadcountGroups, N-308).
function orderOpenHeadcount(rows, fillMap) {
  const day = hc => (hc.OpenDate ? spDateIn(hc.OpenDate) : null);
  const seq = hc => { const n = Number(hc.Sequence); return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; };
  return (rows || [])
    .filter(hc => hc && classifyHeadcount(hc, fillMap) === 'open')
    .sort((a, b) => {
      const da = day(a), db = day(b);
      if (da !== db) {
        if (da === null) return 1;
        if (db === null) return -1;
        return da < db ? -1 : 1;
      }
      return seq(a) - seq(b);
    });
}

function _groupByKey(rows, keyFn) {
  const map = new Map();
  (rows || []).forEach(r => {
    if (!r) return;
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return map;
}

function _headcountRoleLabel(role) {
  return role.Location ? `${role.RoleTitle} (${role.Location})` : (role.RoleTitle || ('Role ' + role.id));
}

// N-306. Headcount integrity probes for Admin > Data Health. Pure. Returns
// [{ key, label, count, sample }] in display order; `sample` is every
// offending row's label (the renderer truncates). Every count must read 0,
// except closedWithOpen for Closed pipelines that never had a placement
// recorded.
// Checks 4–6 only look at roles that HAVE headcount, so a role with none is
// reported once (roleNoHeadcount), not three times.
function checkHeadcountIntegrity({ roles = [], headcount = [], placements = [] } = {}) {
  roles = (roles || []).filter(Boolean);
  headcount = (headcount || []).filter(Boolean);
  placements = (placements || []).filter(Boolean);
  const roleById = new Map(roles.map(r => [String(r.id), r]));
  const hcById = new Map(headcount.map(h => [String(h.id), h]));
  const hcByRole = _groupByKey(headcount, h => String(h.RoleID));
  const fill = headcountFillMap(placements);
  const rowsOf = r => hcByRole.get(String(r.id)) || [];
  const openOf = r => headcountCounts(rowsOf(r), fill).open;
  const withHc = roles.filter(r => rowsOf(r).length);
  const plLabel = p => p.CandidateName || ('Placement ' + p.id);
  const hcLabel = h => {
    const r = roleById.get(String(h.RoleID));
    return (r ? _headcountRoleLabel(r) : 'Role ' + h.RoleID) + ' · ' + (h.Title || headcountLabel(h.Sequence));
  };
  const aliases = CONFIG.ROLE_STAGE_LEGACY_ALIASES || {};
  const checks = [
    ['placementNoHeadcount', 'Placements with no HeadcountID',
      placements.filter(p => _isBlankId(p.HeadcountID)).map(plLabel)],
    ['placementHeadcountMismatch', 'Placements whose headcount is missing or belongs to another role',
      placements.filter(p => {
        if (_isBlankId(p.HeadcountID)) return false;
        const h = hcById.get(String(p.HeadcountID));
        return !h || String(h.RoleID) !== String(p.RoleIDLookupId);
      }).map(plLabel)],
    ['roleNoHeadcount', 'Roles with no headcount',
      roles.filter(r => !rowsOf(r).length).map(_headcountRoleLabel)],
    ['closedWithOpen', 'Closed pipelines with open headcount',
      withHc.filter(r => r.Stage === CONFIG.ROLE_STAGE_CLOSED && openOf(r) > 0).map(_headcountRoleLabel)],
    ['openPipelineNoOpen', 'Open pipelines with no open headcount',
      withHc.filter(r => isOpenPipelineStage(r.Stage) && openOf(r) === 0).map(_headcountRoleLabel)],
    ['openDateDrift', 'Roles whose Open Date is not their earliest headcount Open Date',
      withHc.filter(r => (r.OpenDate ? spDateIn(r.OpenDate) : null) !== earliestHeadcountOpenDate(rowsOf(r)))
        .map(_headcountRoleLabel)],
    ['headcountProjectMismatch', "Headcount whose project differs from its role's (or whose role is gone)",
      headcount.filter(h => {
        const r = roleById.get(String(h.RoleID));
        return !r || String(h.ProjectID) !== String(r.ProjectIDLookupId ?? r.ProjectID);
      }).map(hcLabel)],
    ['legacyStage', 'Roles still at a retired stage (' + Object.keys(aliases).join(', ') + ')',
      roles.filter(r => Object.prototype.hasOwnProperty.call(aliases, r.Stage)).map(_headcountRoleLabel)],
  ];
  return checks.map(([key, label, sample]) => ({ key, label, count: sample.length, sample }));
}

// ── Headcount UI (N-307 / HC-2) ───────────────────────────────────────
// Pure helpers behind the Roles table Headcount / Days Open columns, the
// role page's Headcount section, the role forms and every Stage write.

// Map<String(RoleID), headcount[]>.
function groupHeadcountByRole(rows) {
  return _groupByKey(rows, hc => String(hc.RoleID));
}

// { counts, oldestOpenDay } for one role. counts = headcountCounts().
// oldestOpenDay = earliest OpenDate ('YYYY-MM-DD') among OPEN headcount that
// have one — filled, cancelled and undated rows never drive days open (D-5).
function headcountSummary(rows, fillMap) {
  const counts = headcountCounts(rows, fillMap);
  let oldestOpenDay = null;
  (rows || []).forEach(hc => {
    if (!hc || classifyHeadcount(hc, fillMap) !== 'open' || !hc.OpenDate) return;
    const day = spDateIn(hc.OpenDate);
    if (day && (oldestOpenDay === null || day < oldestOpenDay)) oldestOpenDay = day;
  });
  return { counts, oldestOpenDay };
}

// N-309 (S-5): Map<String(RoleID), 'YYYY-MM-DD'|null> — each pipeline's
// oldest OPEN headcount OpenDate (headcountSummary().oldestOpenDay, the value
// the Roles page "Days open" shows). Behind-pace reads it through
// roleFlagReasons' opts.openSince. `placements` must be ALL placements (or
// getPlacementHeadcountIds() rows), never a date window — a headcount filled
// outside the window would read as open.
function oldestOpenHeadcountIndex(headcount, placements) {
  const fill  = headcountFillMap(placements);
  const index = new Map();
  groupHeadcountByRole(headcount).forEach((rows, roleId) => {
    index.set(roleId, headcountSummary(rows, fill).oldestOpenDay);
  });
  return index;
}

// N-309 (S-1, S-2): getHistoricalPlacements() rows — one per placement, i.e.
// one per filled headcount. `id` is the PIPELINE (role) id, because every
// consumer joins WeeklyActivity on it; a pipeline appears once per fill.
//   openDate      — the placement's headcount OpenDate; null for a not-opened
//                   headcount (no time to hire, D-5). A blank or unknown
//                   HeadcountID falls back to Roles.OpenDate (model rule 3;
//                   Data Health probe 1 reports those placements).
//   placementDate — OfferAcceptedDate (rows without one are dropped).
//   tpEmail       — Placement.TalentPartner, the placer (D-7) — never the
//                   pipeline's TP list.
// A placement whose role no longer exists is dropped. Inputs come from the
// cache and are never mutated.
function historicalHiresFromPlacements(placements, roles, headcount) {
  const roleById = new Map((roles || []).filter(Boolean).map(r => [String(r.id), r]));
  const hcById   = new Map((headcount || []).filter(Boolean).map(hc => [String(hc.id), hc]));
  const out = [];
  (placements || []).forEach(p => {
    if (!p || !p.OfferAcceptedDate) return;
    const rid  = _isBlankId(p.RoleIDLookupId) ? p.RoleID : p.RoleIDLookupId;
    const role = _isBlankId(rid) ? null : roleById.get(String(rid));
    if (!role) return;
    const hc = _isBlankId(p.HeadcountID) ? null : (hcById.get(String(p.HeadcountID)) || null);
    out.push({
      id:            role.id,
      headcountId:   hc ? hc.id : null,
      placementId:   p.id,
      title:         role.RoleTitle,
      functionArea:  role.Department,
      country:       role.Location,
      openDate:      hc ? (hc.OpenDate || null) : (role.OpenDate || null),
      placementDate: p.OfferAcceptedDate,
      tpEmail:       p.TalentPartner || null,
    });
  });
  return out;
}

// N-310 (S-3): historicalHiresFromPlacements() rows + `targetDate` — the
// headcount's TargetHireDate, or Roles.TargetHireDate when the placement has
// no (known) headcount (same fallback as openDate). A separate function
// because N-309's row shape is pinned. New objects; inputs never mutated.
function hireRowsWithTargets(placements, roles, headcount) {
  const roleById = new Map((roles || []).filter(Boolean).map(r => [String(r.id), r]));
  const hcById   = new Map((headcount || []).filter(Boolean).map(hc => [String(hc.id), hc]));
  return historicalHiresFromPlacements(placements, roles, headcount).map(row => {
    const hc   = _isBlankId(row.headcountId) ? null : hcById.get(String(row.headcountId));
    const role = roleById.get(String(row.id));
    const targetDate = hc ? (hc.TargetHireDate || null) : ((role && role.TargetHireDate) || null);
    return { ...row, targetDate };
  });
}

// N-310 (S-1): one headcount context per dashboard data load — every KPI /
// panel reads it. `placements` must be ALL-TIME placements for `roles` (the
// fill map must never come from a date window). headcount === null (read
// failed) → headcount/openSince null, and consumers fall back to
// Roles.OpenDate (pipeline opened, model rule 3) via pipelineOpenDay().
function dashboardHeadcountContext(roles, placements, headcount) {
  const fillMap = headcountFillMap(placements);
  if (headcount === null || headcount === undefined) {
    return { headcount: null, fillMap, openSince: null, hires: hireRowsWithTargets(placements, roles, null) };
  }
  const roleIds = new Set((roles || []).filter(Boolean).map(r => String(r.id)));
  const scoped  = headcount.filter(hc => hc && roleIds.has(String(hc.RoleID)));
  return {
    headcount: scoped,
    fillMap,
    openSince: oldestOpenHeadcountIndex(scoped, placements),
    hires:     hireRowsWithTargets(placements, roles, scoped),
  };
}

// N-310 (S-7): the one "days open since" day for a pipeline —
// oldestOpenHeadcountIndex() value ('YYYY-MM-DD' | null); openSince null
// (headcount unavailable) → legacy Roles.OpenDate.
function pipelineOpenDay(role, openSince) {
  if (!role) return null;
  if (openSince instanceof Map) return openSince.get(String(role.id)) || null;
  return role.OpenDate ? (spDateIn(role.OpenDate) || null) : null;
}

// N-310 (S-10): earliest TargetHireDate ('YYYY-MM-DD') among a role's OPEN
// headcount; filled / cancelled ignored; null when none has one.
function nextOpenTargetDay(rows, fillMap) {
  let min = null;
  (rows || []).forEach(hc => {
    if (!hc || !hc.TargetHireDate || classifyHeadcount(hc, fillMap) !== 'open') return;
    const day = spDateIn(hc.TargetHireDate);
    if (day && (min === null || day < min)) min = day;
  });
  return min;
}

// D-5 'x/y' (open / open + filled); '—' when there is nothing to count.
function headcountXY(counts) {
  return counts && counts.total > 0 ? `${counts.open}/${counts.total}` : '—';
}

// Title text for the x/y cell and the role page summary line.
function headcountXYTitle(counts) {
  const c = counts || { open: 0, filled: 0, cancelled: 0, total: 0 };
  return `${c.open} open of ${c.total} · ${c.filled} filled · ${c.cancelled} cancelled`;
}

// The one Stage-change rule (D-1, D-2, N-307 S-2). Every Stage write path
// checks it first, through checkRoleStageChange() (api-headcount.js). Returns
// { ok, reason, cascadeCancel }.
function roleStageChangeRule({ fromStage, toStage, counts } = {}) {
  const from = normaliseRoleStage(fromStage);
  const to   = normaliseRoleStage(toStage);
  const open = (counts && counts.open) || 0;
  if (to === from) return { ok: true, reason: '', cascadeCancel: false };
  if (to === CONFIG.ROLE_STAGE_CLOSED && open > 0) {
    return { ok: false, cascadeCancel: false,
      reason: `Can't close — ${open} headcount still open. Fill or cancel ${open === 1 ? 'it' : 'them'} first.` };
  }
  if (to === 'Cancelled') return { ok: true, reason: '', cascadeCancel: open > 0 };
  if (isOpenPipelineStage(to) && open === 0) {
    return { ok: false, cascadeCancel: false,
      reason: 'This pipeline has no open headcount — add one on the role page first.' };
  }
  return { ok: true, reason: '', cascadeCancel: false };
}

// N-307 S-5 (reused by N-308 after a fill): what to offer once a pipeline has
// no open headcount left — 'close' when something was filled, 'cancel' when
// nothing was, null while headcount is still open (or there is none at all).
function pipelineAfterLastOpen(counts) {
  if (!counts || counts.open > 0) return null;
  if (counts.filled > 0) return 'close';
  return (counts.total + counts.cancelled) > 0 ? 'cancel' : null;
}

// Open + ANALYTICS_BENCHMARKS.timeToHireDays, as 'YYYY-MM-DD'; null for blank.
function defaultTargetHireDate(openDayISO) {
  if (!openDayISO) return null;
  return addDaysISO(openDayISO, CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays);
}

// Every non-terminal stage, in ROLE_STAGES order — the Add/Duplicate Stage
// select (S-6) and the reopen-at-stage select (D-3). Derived, never a literal.
function reopenStageOptions() {
  return CONFIG.ROLE_STAGES.filter(s => !CONFIG.ROLE_STAGE_TERMINAL.includes(s));
}

// '# of Headcount' input → integer in 1..CONFIG.HEADCOUNT.maxPerAdd.
function clampHeadcountCount(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, CONFIG.HEADCOUNT.maxPerAdd);
}

// ── Placement against headcount (N-308 / HC-3) ─────────────────────────
// A placement is recorded against one OPEN headcount (D-5), never just a
// role. The picker (desktop forms.js, mobile mobile-pages.js) is built from
// these pure helpers; submit re-reads the headcount and validates it
// (getPlacementTarget in api-headcount.js + validatePlacementHeadcount) before any
// write. "Filled" stays derived from Placements.HeadcountID (rule 4), so a
// headcount a placement moves away from is open again with no write.

// 'Role (Location)' — the same text the Role select showed before N-308.
function placementRoleLabel(role) {
  return role.Location ? `${role.RoleTitle} (${role.Location})` : (role.RoleTitle || '');
}

// Picker groups for one project: [{ roleId, roleLabel, options:[{ id, roleId,
// label, current }] }]. A role qualifies when it is at an open-pipeline stage
// (N-308 S-2), or when it owns currentHeadcountId (an edit — S-4). Options are
// the role's open headcount in D-5 order (orderOpenHeadcount); the current
// headcount is listed first when it isn't open (it is filled by the placement
// being edited, or its pipeline is closed). excludePlacementId drops the edited
// placement from the fill map. Groups with no options are dropped; groups are
// alphabetical (S-1). Headcount whose role isn't in `roles` are ignored — the
// caller's role list carries the Talent Partner scoping.
function placementHeadcountGroups({ roles = [], headcount = [], placements = [], currentHeadcountId = null, excludePlacementId = null } = {}) {
  const excl = excludePlacementId === null || excludePlacementId === undefined ? null : String(excludePlacementId);
  const fill = headcountFillMap((placements || []).filter(p => p && (excl === null || String(p.id) !== excl)));
  const cur = _isBlankId(currentHeadcountId) ? null : String(currentHeadcountId);
  const byRole = groupHeadcountByRole((headcount || []).filter(Boolean));
  const groups = [];
  (roles || []).forEach(role => {
    if (!role) return;
    const rows = byRole.get(String(role.id)) || [];
    const openStage   = isOpenPipelineStage(normaliseRoleStage(role.Stage));
    const ownsCurrent = cur !== null && rows.some(hc => String(hc.id) === cur);
    if (!openStage && !ownsCurrent) return;
    // A role that qualifies only through the current headcount lists just it.
    let list = openStage ? orderOpenHeadcount(rows, fill) : [];
    if (ownsCurrent && !list.some(hc => String(hc.id) === cur)) {
      list = [rows.find(hc => String(hc.id) === cur), ...list];
    }
    if (!list.length) return;
    groups.push({
      roleId:    Number(role.id),
      roleLabel: placementRoleLabel(role),
      options:   list.map(hc => {
        const current = cur !== null && String(hc.id) === cur;
        return { id: Number(hc.id), roleId: Number(role.id), current,
                 label: placementHeadcountOptionLabel(hc, { current }) };
      }),
    });
  });
  return groups.sort((a, b) => a.roleLabel.localeCompare(b.roleLabel));
}

// 'Headcount 2 · opened 2026-09-03' / 'Headcount 3 · not opened', plus
// ' · Backfill' and ' · current'. Day via spDateIn — the Roles page's rule.
function placementHeadcountOptionLabel(hc, { current = false } = {}) {
  const name = hc.Title || headcountLabel(hc.Sequence);
  const day = hc.OpenDate ? spDateIn(hc.OpenDate) : null;
  let label = `${name} · ${day ? 'opened ' + day : 'not opened'}`;
  if (hc.Backfill === true) label += ' · Backfill';
  if (current) label += ' · current';
  return label;
}

// <option>/<optgroup> markup for the Headcount select, shared by desktop and
// mobile (precedent: stageSelectHtml). selectedId marks one option.
function placementHeadcountOptionsHtml(groups, selectedId = null) {
  if (!groups || !groups.length) {
    return '<option value="">-- No open headcount — add headcount on the role page --</option>';
  }
  const sel = _isBlankId(selectedId) ? null : String(selectedId);
  return '<option value="">-- Select headcount --</option>' + groups.map(g =>
    `<optgroup label="${escAttr(g.roleLabel)}">` +
    g.options.map(o =>
      `<option value="${Number(o.id)}" data-role-id="${Number(o.roleId)}"${sel !== null && String(o.id) === sel ? ' selected' : ''}>${escHtml(o.label)}</option>`
    ).join('') +
    '</optgroup>'
  ).join('');
}

// The id to pre-select when the form arrives for a role (logged-hire prompt,
// Command Bar): the first option of that role's group, else null.
function placementPreselectHeadcountId(groups, roleId) {
  if (_isBlankId(roleId)) return null;
  const g = (groups || []).find(x => String(x.roleId) === String(roleId));
  return g && g.options.length ? g.options[0].id : null;
}

// Submit-time check (N-308 S-3). `state` = getRoleHeadcountState() output for
// the headcount's role. An edit keeping its own headcount is always ok.
function validatePlacementHeadcount({ headcount, state, currentHeadcountId = null, excludePlacementId = null } = {}) {
  if (!headcount) return { ok: false, reason: 'That headcount no longer exists — pick another.' };
  if (!_isBlankId(currentHeadcountId) && String(headcount.id) === String(currentHeadcountId)) {
    return { ok: true, reason: '' };
  }
  const excl = excludePlacementId === null || excludePlacementId === undefined ? null : String(excludePlacementId);
  const pls = ((state && state.placements) || []).filter(p => p && (excl === null || String(p.id) !== excl));
  const kind = classifyHeadcount(headcount, headcountFillMap(pls));
  if (kind === 'filled')    return { ok: false, reason: 'That headcount has just been filled — pick another.' };
  if (kind === 'cancelled') return { ok: false, reason: 'That headcount was cancelled — pick another.' };
  return { ok: true, reason: '' };
}

// Placements.TimeToHire: days from the headcount's OpenDate to the offer
// accepted day; null when either is blank ("not opened" → blank, D-5).
function placementTimeToHire(hcOpenDate, offerDate) {
  const open  = hcOpenDate ? spDateIn(hcOpenDate) : null;
  const offer = offerDate ? spDateIn(offerDate) : null;
  if (!open || !offer) return null;
  return daysOpen(open, offer);
}

// N-330: Placements tile "Time to Hire" cell from the stored TimeToHire —
// '32 days' / '1 day'; '—' when blank (a not-opened headcount, D-5).
function placementTimeToHireLabel(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

// What to ask after a placement lands on a pipeline: 'close' when it filled
// the last open headcount (D-2), 'stage' while headcount stay open (avoids a
// stale stage reading as stuck), null on a terminal pipeline or otherwise.
function placementFollowUp({ stage, counts } = {}) {
  if (CONFIG.ROLE_STAGE_TERMINAL.includes(normaliseRoleStage(stage))) return null;
  if (pipelineAfterLastOpen(counts) === 'close') return 'close';
  return counts && counts.open > 0 ? 'stage' : null;
}

// ── Hiring Plan → headcount (N-312 / HC-6) ─────────────────────────────
// A CoEPlanRows row tracks ONE hire slot: LinkedHeadcountID. LinkedRoleID is
// kept in sync (= that headcount's RoleID) but nothing displays from it.

// Link picker groups: [{ roleId, roleLabel, options:[{ id, roleId, current,
// filled, label }] }]. Spec S-1 (amended by diff-2) — never a headcount linked
// to another plan row, never a cancelled one. OPEN headcount only on a
// pipeline whose stage is not in excludedStages (the caller passes
// PLAN_LINKABLE_EXCLUDED_STAGES from analytics.js, so this stays pure).
// FILLED headcount on ANY pipeline — a completed hire is a fact whatever the
// pipeline's stage now is; most filled headcount sit on Closed pipelines.
// Per pipeline: open headcount in D-5 order (orderOpenHeadcount), then filled
// by Sequence. currentHeadcountId (the row's own link) is always listed,
// first in its group, whatever its state. Groups alphabetical.
function coeLinkableHeadcount({ roles = [], headcount = [], placements = [], planRows = [], currentHeadcountId = null, excludedStages = [] } = {}) {
  const cur   = _isBlankId(currentHeadcountId) ? null : String(currentHeadcountId);
  const fill  = headcountFillMap(placements);
  const taken = new Set((planRows || [])
    .map(r => r && r.LinkedHeadcountID).filter(v => !_isBlankId(v)).map(String));
  const seq = hc => { const n = Number(hc.Sequence); return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; };
  const byRole = groupHeadcountByRole((headcount || []).filter(Boolean));
  const groups = [];
  (roles || []).forEach(role => {
    if (!role) return;
    const rows = byRole.get(String(role.id)) || [];
    const free = rows.filter(hc => !taken.has(String(hc.id)));
    const openOk = !(excludedStages || []).includes(normaliseRoleStage(role.Stage));
    let list = [
      ...(openOk ? orderOpenHeadcount(free, fill) : []),
      ...free.filter(hc => classifyHeadcount(hc, fill) === 'filled').sort((a, b) => seq(a) - seq(b)),
    ];
    const curRow = cur === null ? null : rows.find(hc => String(hc.id) === cur);
    if (curRow) list = [curRow, ...list.filter(hc => String(hc.id) !== cur)];
    if (!list.length) return;
    groups.push({
      roleId:    Number(role.id),
      roleLabel: placementRoleLabel(role),
      options:   list.map(hc => {
        const current = cur !== null && String(hc.id) === cur;
        const filled  = classifyHeadcount(hc, fill) === 'filled';
        return { id: Number(hc.id), roleId: Number(role.id), current, filled,
                 label: coeLinkOptionLabel(hc, { filled, current }) };
      }),
    });
  });
  return groups.sort((a, b) => a.roleLabel.localeCompare(b.roleLabel));
}

// 'Headcount 2 · opened 2026-09-03 · filled · current' — the +Placement
// picker's label (placementHeadcountOptionLabel) plus the two plan flags.
function coeLinkOptionLabel(hc, { filled = false, current = false } = {}) {
  let label = placementHeadcountOptionLabel(hc);
  if (filled)  label += ' · filled';
  if (current) label += ' · current';
  return label;
}

// The actual bar for one linked headcount. placements = the placements
// filling it (headcountFillMap entry; normally one). Values are the STORED
// SharePoint strings — or `today` exactly as passed — because coe-plan.js
// feeds them to its local-model week maths unchanged, as the role-based
// overlay did (N-089). spDateIn days are used only to order placements.
//   R = OpenDate → OfferAcceptedDate (cancelled: CancelledDate; open: today)
//   N = OfferAcceptedDate → ProvisionalStartDate (or today)
//   O starts at ProvisionalStartDate (length = the plan row's onboarding)
// No OpenDate → no bar. 2+ placements (a Data Health error) → the earliest
// offer, and that placement's start date.
function coeHeadcountActualSpans(hc, placements, today) {
  const out = { rStart: null, rEnd: null, nStart: null, nEnd: null, oStart: null };
  if (!hc || !hc.OpenDate) return out;
  out.rStart = hc.OpenDate;
  const day = p => (p && p.OfferAcceptedDate ? spDateIn(p.OfferAcceptedDate) : null);
  const plc = (placements || []).filter(Boolean).sort((a, b) => {
    const da = day(a), db = day(b);
    if (da === db) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da < db ? -1 : 1;
  })[0] || null;
  if (plc && plc.OfferAcceptedDate) {
    out.rEnd   = plc.OfferAcceptedDate;
    out.nStart = plc.OfferAcceptedDate;
    out.nEnd   = plc.ProvisionalStartDate || today;
    out.oStart = plc.ProvisionalStartDate || null;
  } else if (!plc && hc.Status === CONFIG.HEADCOUNT.STATUS_CANCELLED) {
    out.rEnd = hc.CancelledDate || hc.OpenDate;
  } else {
    out.rEnd = today;
  }
  return out;
}

// ── Hiring Plan: planned vs actual role opens + required run rate (N-317) ──
// Pure and string-only ('YYYY-MM-DD' in, 'YYYY-MM' keys out), so it is
// browser-timezone-independent: coe-plan.js derives the day strings
// (spDateIn on stored SharePoint values, localDayISO on its local Dates).
//   plannedDays    one per plan row — its Planned Open Date
//   actualDays     one per plan row whose LINKED headcount has an OpenDate
//   target         plan row count
//   latestHireDay  latest planned hire across the plan (project end)
//   todayDay, finalNoOpenWeeks (CONFIG.COE_PHASE_DEFAULTS)
// An actual open counts only once its day is <= today. Required run rate =
// remaining / months from the current month to the cutoff month INCLUSIVE,
// cutoff = latestHireDay - finalNoOpenWeeks weeks. Variance per month =
// actual - planned (+ = ahead of plan); future months carry null actual and
// variance. The range runs from the first planned/actual month to the cutoff
// month, and always includes the current month while roles remain to open.
function coeOpensByMonth({ plannedDays = [], actualDays = [], target = 0,
                           latestHireDay = null, todayDay = null, finalNoOpenWeeks = 0 } = {}) {
  const curKey = monthKeyFromISO(todayDay);
  const planned = (plannedDays || []).map(monthKeyFromISO).filter(Boolean);
  const actualToDate = (actualDays || []).filter(d => d && todayDay && d <= todayDay);
  const actual = actualToDate.map(monthKeyFromISO).filter(Boolean);

  let cutoffDay = null;
  if (latestHireDay) {
    const [y, m, d] = String(latestHireDay).split('-').map(Number);
    const c = new Date(Date.UTC(y, m - 1, d - 7 * finalNoOpenWeeks));
    cutoffDay = `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, '0')}-${String(c.getUTCDate()).padStart(2, '0')}`;
  }
  const cutoffMonth = monthKeyFromISO(cutoffDay);
  const openedToDate = actualToDate.length;
  const remaining = Math.max(0, target - openedToDate);
  const keyIdx = k => monthKeyYear(k) * 12 + monthKeyMonth(k);
  const monthsLeft = (cutoffMonth && curKey && cutoffMonth >= curKey)
    ? keyIdx(cutoffMonth) - keyIdx(curKey) + 1 : 0;
  const status = remaining === 0 ? 'complete' : monthsLeft === 0 ? 'past-cutoff' : 'in-window';
  const requiredPerMonth = status === 'in-window' ? remaining / monthsLeft : null;

  const keys = [...planned, ...actual];
  if (cutoffMonth) keys.push(cutoffMonth);
  if (remaining > 0 && curKey) keys.push(curKey);
  keys.sort();
  const months = [];
  if (keys.length) {
    const count = (arr, k) => arr.filter(x => x === k).length;
    for (let k = keys[0]; k <= keys[keys.length - 1]; k = addMonthsToKey(k, 1)) {
      const isFuture = !!curKey && k > curKey;
      const p = count(planned, k);
      const a = isFuture ? null : count(actual, k);
      months.push({
        key: k, planned: p, actual: a, variance: isFuture ? null : a - p,
        isCurrent: k === curKey, isFuture,
        inWindow: status === 'in-window' && k >= curKey && k <= cutoffMonth,
      });
    }
  }
  return { months, target, openedToDate, remaining, cutoffDay, cutoffMonth, monthsLeft,
           requiredPerMonth, status, latestHireDay, finalNoOpenWeeks };
}

// ── WeeklyActivity.ProjectID integrity (N-315) ─────────────────────────
// Pure halves of api.js createWeeklyActivity. The async orchestration stays
// in api.js; the decisions live here so the
// sync test runner can pin them.

// A SharePoint lookup id as a positive integer, or null. Graph returns
// lookup ids as strings ("12"); a form's parseInt('') is NaN, which
// JSON.stringify writes as null — both must read as "no id", never as 0.
function positiveLookupId(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// A Roles row's project id (LookupId first, same order as every other
// Roles → project read), or null.
function projectIdForRole(role) {
  if (!role) return null;
  return positiveLookupId(role.ProjectIDLookupId ?? role.ProjectID);
}

// The ProjectID a WeeklyActivity create response carries: a number, null
// when the response has fields but no usable ProjectID, or undefined when the
// response has no fields object at all (unknown — the caller re-reads).
function weeklyActivityResponseProjectId(created) {
  if (!created || !created.fields || typeof created.fields !== 'object') return undefined;
  return positiveLookupId(created.fields.ProjectIDLookupId);
}

// One Diagnostics message per dropped ProjectID. Carries the item id, so
// each occurrence is its own row rather than deduping into the first.
function weeklyActivityProjectDropMessage({ itemId, roleId, sent, response, stored, heal }) {
  const v = x => (x === undefined ? 'no fields' : (x === null ? 'blank' : String(x)));
  return 'N-315 WeeklyActivity ProjectID dropped on create — item ' + itemId
    + ', role ' + v(roleId) + ', sent ' + v(sent)
    + ', create OK, response ' + v(response) + ', stored ' + v(stored)
    + ', heal ' + heal;
}