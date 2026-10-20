// js/pages-model.js — pure data shaping for the reporting list pages and the
// Role Timeline (N-350b). pages.js fetches and builds the HTML; everything in
// between lives here so tests/run.js can load and fixture-test it.
//
// Rules for this file: no DOM, no Graph calls, no module state (_rolesFilter
// and friends), no _resolvedRole / getCurrentUser / getScopedUserEmail and no
// `new Date()` default — the caller reads those and passes them in. Load-time
// code is declarations only. reporting.html only, straight before pages.js.
// Argument-object keys are lowerCamel (lint-escaping flags naked reads that
// end in an uppercase property).

// N-247a: the Days Open value a Roles row shows — null where the cell is
// blank for this filter. Shared by roleRowHtml and the Days Open sort
// accessor so the sort can never disagree with what's displayed.
// N-307: days since the OLDEST OPEN headcount with an Open Date
// (headcountSummary, headcount.js). Blank on the Closed filter too — a closed
// pipeline is done (one still holding open headcount is a Data Health item).
function roleDaysOpenValue(r, rolesFilter, summary) {
  const daysHidden = rolesFilter === "Backlog" || rolesFilter === "Cancelled" || rolesFilter === "Closed";
  return (!daysHidden && summary && summary.oldestOpenDay)
    ? daysOpen(summary.oldestOpenDay) : null;
}

// N-100: turns a plain integer day count into a short human label for the
// Role History timeline ("time in stage"). Takes a number only — never a
// date string — so it carries none of the SharePoint UTC/BST date-shift
// risk the date helpers exist to guard against.
function formatDurationDays(days) {
  if (days == null || isNaN(days)) return '—';
  if (days < 1) return '<1 day';
  if (days === 1) return '1 day';
  if (days < 14) return `${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
}

function placementFilterCutoff(filter, today = new Date()) {
  if (!filter || !filter.type) return null;
  const year = filter.type === 'year' ? filter.value : today.getFullYear();
  if (!Number.isFinite(year)) return null;
  return `${year}-01-01`;
}

function placementInFilter(p, filter) {
  if (!filter.type) return true;
  const dateStr = p.OfferAcceptedDate;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  if (filter.type === "year")    return year === filter.value;
  if (filter.type === "quarter") return year === new Date().getFullYear() && Math.floor(month / 3) + 1 === filter.value;
  if (filter.type === "month")   return year === new Date().getFullYear() && month === filter.value;
  return true;
}

// ── Roles ─────────────────────────────────────────────────────────────
const ROLE_FILTERS = {
  Backlog:   r => CONFIG.ROLE_STAGES_PARKED.includes(r.Stage),
  Active:    r => isOpenPipelineStage(r.Stage),
  Closed:    r => r.Stage === CONFIG.ROLE_STAGE_CLOSED,   // N-306: was Hired
  Cancelled: r => r.Stage === "Cancelled",
};

// N-307: one headcount summary per role, memoised — the sort accessors and
// the row both read it.
function _rolesHcSummaryFn(allHeadcount, placementLinks) {
  const hcByRole = groupHeadcountByRole(allHeadcount);
  const hcFill   = headcountFillMap(placementLinks);
  const cache = new Map();
  return r => {
    const k = String(r.id);
    if (!cache.has(k)) cache.set(k, headcountSummary(hcByRole.get(k) || [], hcFill));
    return cache.get(k);
  };
}

// N-266a: a role's checklist variant comes from its parent project's type.
// Memoised per role — the sort accessor and the row both read it.
function _rolesChecklistFn(ckCtx, allProjects) {
  const projectTypeMap = Object.fromEntries(allProjects.map(p => [String(p.id), p.ProjectType]));
  const cache = new Map();
  return r => {
    const k = String(r.id);
    if (!cache.has(k)) {
      cache.set(k, checklistCellData(ckCtx, r, projectTypeMap[String(r.ProjectIDLookupId || r.ProjectID)]));
    }
    return cache.get(k);
  };
}

// N-247a: the user's column sort goes ON TOP of the default order. sortRows
// is stable, so ties keep project → open-date order. Accessors return what
// the cell shows, raw (no "—"), so blanks sort last.
function _rolesSortColumns({ filter, tpMap, projectNameOf, hcSummaryOf, showChecklistCol, checklistOf }) {
  return {
    project:  { type: 'text',   get: r => projectNameOf(r) },
    role:     { type: 'text',   get: r => r.RoleTitle },
    location: { type: 'text',   get: r => r.Location },
    stage:    { type: 'enum',   get: r => r.Stage, order: CONFIG.ROLE_STAGES },
    tp:       { type: 'text',   get: r => tpList(r.TalentPartner).length ? tpDisplay(r.TalentPartner, tpMap) : '' },
    budget:   { type: 'number', get: r => r.Budget },
    // N-307: open headcount count; a role with no headcount sorts last.
    headcount: { type: 'number', get: r => { const c = hcSummaryOf(r).counts; return c.total ? c.open : null; } },
    daysOpen: { type: 'number', get: r => roleDaysOpenValue(r, filter, hcSummaryOf(r)) },
    // N-266a: fraction complete; no checklist → null, which sorts last.
    checklist: { type: 'number', get: r => {
      const s = showChecklistCol ? checklistOf(r).summary : null;
      return s && s.total ? s.done / s.total : null;
    } },
  };
}

function _rolesEmptyMsg(filter, projectId) {
  const ROLE_FILTER_LABELS = { Backlog: 'backlog', Active: 'active', Closed: 'closed', Cancelled: 'cancelled' };
  return projectId
    ? `No ${ROLE_FILTER_LABELS[filter] || 'matching'} roles for the selected project.`
    : `No ${ROLE_FILTER_LABELS[filter] || 'matching'} roles.`;
}

// Scope → pendingItem → rolesTotal → project dropdown → stage filter → search
// → default sort → column sort → paginate. The stage .filter before .sort is
// what stops the cached allRoles array being sorted in place.
function rolesPageModel(d) {
  const { allRoles, allProjects, userProjectIds, tpMap, ckCtx, pendingItem, filter, projectId, canFilter, search, sort, pageSize } = d;
  const hcSummaryOf = _rolesHcSummaryFn(d.allHeadcount, d.placementLinks);
  const projectMap = Object.fromEntries(allProjects.map(p => [String(p.id), p.CustomerName]));
  const showChecklistCol = !!(ckCtx && ckCtx.showColumn);
  const checklistOf = _rolesChecklistFn(ckCtx, allProjects);
  // Scope to user's assigned projects
  let roles = userProjectIds
    ? allRoles.filter(r => userProjectIds.includes(String(r.ProjectIDLookupId || r.ProjectID)))
    : allRoles;
  // N-218a: splice the not-yet-created row in before the remaining filters,
  // exactly like a real fetched row -- it only shows up below if it
  // actually belongs on the active project/stage filter.
  if (pendingItem) roles = [...roles, pendingItem];
  const rolesTotal = roles.length;  // N-152: pre-filter denominator for the count
  if (canFilter && projectId) {
    roles = roles.filter(r =>
      String(r.ProjectIDLookupId) === String(projectId) ||
      String(r.ProjectID) === String(projectId)
    );
  }
  roles = roles.filter(ROLE_FILTERS[filter] || (() => true));
  // N-247a: one project-name lookup for the default sort, the sort column and the row.
  const projectNameOf = r => projectMap[String(r.ProjectIDLookupId)] || projectMap[String(r.ProjectID)] || '';
  // N-251a: shared list search (list-controls.js) — narrows further, after
  // the project/stage filters and before any sort.
  roles = filterRowsByText(roles, search, r => [
    r.RoleTitle,
    r.Location,
    projectNameOf(r),
    tpList(r.TalentPartner).length ? tpDisplay(r.TalentPartner, tpMap) : '',
  ]);
  roles.sort((a, b) => {
    const proj = projectNameOf(a).localeCompare(projectNameOf(b));
    if (proj !== 0) return proj;
    return new Date(a.OpenDate || 0) - new Date(b.OpenDate || 0);
  });
  // Must stay BEFORE paginate().
  roles = sortRows(roles, sort, _rolesSortColumns({ filter, tpMap, projectNameOf, hcSummaryOf, showChecklistCol, checklistOf }));
  return {
    roles, rolesTotal, pagedRoles: paginate(roles, pageSize),
    projectNameOf, hcSummaryOf, checklistOf, showChecklistCol,
    emptyMsg: _rolesEmptyMsg(filter, projectId),
  };
}

// ── Weekly Activity ───────────────────────────────────────────────────
// N-247b: the user's column sort goes ON TOP of the default Year/Week order.
// Accessors return the raw value (not the cell's `|| 0` display fallback), so
// a genuinely blank metric sorts last, same rule as Roles' `budget`.
function _activitySortColumns(roleMap, tpMap) {
  return {
    year:      { type: 'number', get: a => a.Year },
    week:      { type: 'number', get: a => a.WeekNumber },
    role:      { type: 'text',   get: a => roleMap[String(a.RoleIDLookupId)] || roleMap[String(a.RoleID)] || '' },
    tp:        { type: 'text',   get: a => tpMap[(a.TalentPartner || '').toLowerCase()] || a.TalentPartner || '' },
    outreach:  { type: 'number', get: a => a.Outreach },
    responses: { type: 'number', get: a => a.Responses },
    screened:  { type: 'number', get: a => a.Screened },
    submitted: { type: 'number', get: a => a.Submitted },
    iv1:       { type: 'number', get: a => a.Interview1 },
    iv2plus:   { type: 'number', get: a => a.Interview2Plus },
    finalIv:   { type: 'number', get: a => a.FinalInterview },
    offers:    { type: 'number', get: a => a.Offers },
    hires:     { type: 'number', get: a => a.Hires },
  };
}

// Role dropdown choices: respects the existing project + role scoping.
function _activityRoleChoices(allRoles, roleMap, filtered) {
  const scopedRoleIds = new Set(filtered.map(a => String(a.RoleIDLookupId || a.RoleID || '')));
  return allRoles
    .filter(r => scopedRoleIds.has(String(r.id)))
    .sort((a, b) => (roleMap[String(a.id)] || '').localeCompare(roleMap[String(b.id)] || ''))
    .map(r => ({ id: r.id, label: roleMap[String(r.id)] }));
}

// The default Year/Week sort is in place on the fetched array (as before this task).
function activityPageModel(d) {
  const { allRoles, userProjectIds, tpMap, isTalentPartner, scopedEmail, canFilter, projectId, roleId, search, sort, pageSize, pendingItem } = d;
  let activity = d.activity;
  const roleProjectMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), String(r.ProjectIDLookupId || r.ProjectID || '')])
  );
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)]));
  // N-218a: splice the not-yet-created row in before sort/scope, exactly
  // like a real fetched row -- it only shows up below if it actually
  // belongs to the active project/role filter.
  if (pendingItem) activity = [...activity, pendingItem];
  activity.sort((a, b) => {
    const yr = Number(b.Year) - Number(a.Year);
    if (yr !== 0) return yr;
    return Number(b.WeekNumber) - Number(a.WeekNumber);
  });
  // Scope to user's assigned projects
  let filtered = userProjectIds
    ? activity.filter(a => {
        const rid = String(a.RoleIDLookupId || a.RoleID || '');
        return userProjectIds.includes(roleProjectMap[rid]);
      })
    : activity;
  // For Talent Partners, also scope to their own entries — the ghosted
  // user's own entries when Ghost Mode is active (N-162 fix).
  if (isTalentPartner) {
    filtered = filtered.filter(a => (a.TalentPartner || '').toLowerCase() === scopedEmail);
  }
  // N-152: denominator captured AFTER both permission scopes and BEFORE any
  // user-chosen filter — a TP must not be told about rows they cannot see.
  const total = filtered.length;
  if (canFilter && projectId) {
    filtered = filtered.filter(a => {
      const rid = String(a.RoleIDLookupId || a.RoleID || '');
      return roleProjectMap[rid] === String(projectId);
    });
  }
  if (roleId) {
    filtered = filtered.filter(a =>
      String(a.RoleIDLookupId || a.RoleID || '') === String(roleId)
    );
  }
  // N-247b: shared list search (list-controls.js) — after every existing
  // scope/filter and before any sort. Accessors mirror the cell exactly:
  // roleMap/tpMap are already the display strings the row renders.
  filtered = filterRowsByText(filtered, search, a => [
    roleMap[String(a.RoleIDLookupId)] || roleMap[String(a.RoleID)] || '',
    tpMap[(a.TalentPartner || '').toLowerCase()] || a.TalentPartner || '',
  ]);
  // Must stay BEFORE paginate().
  filtered = sortRows(filtered, sort, _activitySortColumns(roleMap, tpMap));
  return {
    roleMap, filtered, total, paged: paginate(filtered, pageSize),
    roleChoices: _activityRoleChoices(allRoles, roleMap, filtered),
    emptyMsg: (projectId || roleId)
      ? "No activity logged for the selected filters."
      : "No activity logged yet.",
  };
}

// ── Placements ────────────────────────────────────────────────────────
// N-247b: the user's column sort goes ON TOP of the default
// OfferAcceptedDate-desc order. Must stay BEFORE paginate().
function _placementSortColumns(roleMap, tpMap) {
  return {
    candidate:     { type: 'text',   get: p => p.CandidateName },
    role:          { type: 'text',   get: p => roleMap[String(p.RoleIDLookupId)] || roleMap[String(p.RoleID)] || '' },
    salary:        { type: 'number', get: p => p.SalaryAgreed },
    offerAccepted: { type: 'date',   get: p => p.OfferAcceptedDate },
    startDate:     { type: 'date',   get: p => p.ProvisionalStartDate },
    timeToHire:    { type: 'number', get: p => p.TimeToHire },
    // N-340: only reachable from the header, which only Admin/DM are given.
    talentPartner: { type: 'text',   get: p => tpList(p.TalentPartner).length ? tpDisplay(p.TalentPartner, tpMap) : '' },
  };
}

// The default OfferAcceptedDate sort is in place on the fetched array (as before this task).
function placementsPageModel(d) {
  const { allRoles, userProjectIds, tpMap, showTp, isTalentPartner, scopedEmail, canFilter, projectId, filter, search, sort, pageSize, pendingItem } = d;
  let allPlacements = d.allPlacements;
  const roleProjectMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), String(r.ProjectIDLookupId || r.ProjectID || '')])
  );
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)]));
  // N-218a: splice the not-yet-created row in before sort/scope, exactly
  // like a real fetched row -- it only shows up below if it actually
  // belongs to the active period/project filter. This read started before
  // the create write (apply() and commit() run in parallel), so it cannot
  // already contain the real row in the normal case.
  if (pendingItem) allPlacements = [...allPlacements, pendingItem];
  allPlacements.sort((a, b) =>
    new Date(b.OfferAcceptedDate || 0) - new Date(a.OfferAcceptedDate || 0)
  );
  // Scope to user's assigned projects
  let scopedPlacements = userProjectIds
    ? allPlacements.filter(p => {
        const rid = String(p.RoleIDLookupId || p.RoleID || '');
        return userProjectIds.includes(roleProjectMap[rid]);
      })
    : allPlacements;
  // N-341: a Talent Partner sees only placements logged under their name
  // (Placements.TalentPartner; tpMatches lower-cases both sides and a blank
  // value never matches) — folded into scopedPlacements itself, so the N-151
  // "Showing X of Y" denominator already reflects it. scopedEmail comes from
  // getScopedUserEmail(), which keeps this correct under ghost mode.
  if (isTalentPartner) {
    scopedPlacements = scopedPlacements.filter(p => tpMatches(p.TalentPartner, scopedEmail));
  }
  let placements = scopedPlacements.filter(p => placementInFilter(p, filter));
  if (canFilter && projectId) {
    placements = placements.filter(p => {
      const rid = String(p.RoleIDLookupId || p.RoleID || '');
      return roleProjectMap[rid] === String(projectId);
    });
  }
  // N-247b: shared list search (list-controls.js) — after every existing
  // filter, before any sort.
  placements = filterRowsByText(placements, search, p => [
    p.CandidateName,
    roleMap[String(p.RoleIDLookupId)] || roleMap[String(p.RoleID)] || '',
    // N-340: gated, so the TP view's search surface is unchanged.
    showTp && tpList(p.TalentPartner).length ? tpDisplay(p.TalentPartner, tpMap) : '',
  ]);
  placements = sortRows(placements, sort, _placementSortColumns(roleMap, tpMap));
  return { roleMap, scopedPlacements, placements, paged: paginate(placements, pageSize) };
}

// ── Rejected Offers ───────────────────────────────────────────────────
// N-247b: the user's column sort goes ON TOP of the default role-name-A→Z
// order. Must stay BEFORE paginate().
function _rejectionSortColumns(roleMap) {
  return {
    candidate:     { type: 'text',   get: r => r.CandidateName },
    role:          { type: 'text',   get: r => roleMap[String(r.RoleIDLookupId)] || roleMap[String(r.RoleID)] || '' },
    rejected:      { type: 'date',   get: r => r.RejectionDate },
    salaryOffered: { type: 'number', get: r => r.SalaryOffered },
    reason:        { type: 'text',   get: r => r.RejectionReason },
    notes:         { type: 'text',   get: r => r.Notes },
  };
}

// The default role-name sort is in place on the fetched array (as before this task).
function rejectionsPageModel(d) {
  const { allRoles, userProjectIds, isTalentPartner, scopedEmail, canFilter, projectId, search, sort, pageSize, pendingItem } = d;
  let rejections = d.rejections;
  const roleProjectMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), String(r.ProjectIDLookupId || r.ProjectID || '')])
  );
  // N-207: RejectedOffers has no TalentPartner column of its own — the linked
  // Role's TalentPartner is the only source, and it's what Placements used
  // too, for consistency between the two pages.
  const roleTpMap = Object.fromEntries(allRoles.map(r => [String(r.id), r.TalentPartner]));
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)]));
  // N-218a: splice the not-yet-created row in before sort/scope, exactly
  // like a real fetched row -- it only shows up below if it actually
  // belongs to the active project filter.
  if (pendingItem) rejections = [...rejections, pendingItem];
  rejections.sort((a, b) => {
    const rA = roleMap[String(a.RoleIDLookupId)] || roleMap[String(a.RoleID)] || '';
    const rB = roleMap[String(b.RoleIDLookupId)] || roleMap[String(b.RoleID)] || '';
    return rA.localeCompare(rB);
  });
  // Scope to user's assigned projects
  let filtered = userProjectIds
    ? rejections.filter(r => {
        const rid = String(r.RoleIDLookupId || r.RoleID || '');
        return userProjectIds.includes(roleProjectMap[rid]);
      })
    : rejections;
  // N-207: also scope to the TP's own rejections, via the linked Role's
  // TalentPartner (tpMatches handles a multi-TP role) — BEFORE the N-152
  // denominator below, so "Showing X of Y" never counts a row the TP cannot see.
  if (isTalentPartner) {
    filtered = filtered.filter(r => {
      const rid = String(r.RoleIDLookupId || r.RoleID || '');
      return tpMatches(roleTpMap[rid], scopedEmail);
    });
  }
  const total = filtered.length;  // N-152: pre-filter denominator
  if (canFilter && projectId) {
    filtered = filtered.filter(r => {
      const rid = String(r.RoleIDLookupId || r.RoleID || '');
      return roleProjectMap[rid] === String(projectId);
    });
  }
  // N-247b: shared list search (list-controls.js) — after every existing
  // filter, before any sort.
  filtered = filterRowsByText(filtered, search, r => [
    r.CandidateName,
    roleMap[String(r.RoleIDLookupId)] || roleMap[String(r.RoleID)] || '',
    r.RejectionReason,
    r.Notes,
  ]);
  filtered = sortRows(filtered, sort, _rejectionSortColumns(roleMap));
  return {
    roleMap, filtered, total, paged: paginate(filtered, pageSize),
    emptyMsg: projectId ? "No rejected offers for this project." : "No rejected offers logged yet.",
  };
}

// ── Role Timeline ─────────────────────────────────────────────────────
// A role's real-world journey can start before Newton ever logged it. Two
// cases, both driven off role.OpenDate:
//  (a) the role was entered into Newton after it actually opened — the
//      creation row (node 0) is later than OpenDate — so node 0 shows
//      OpenDate and relabels "Role opened".
//  (b) the role sat in Planning/Backlog with no OpenDate, then was moved
//      to Sourcing later with OpenDate backfilled to when it truly went
//      live — the FIRST row whose NewValue is 'Sourcing' (which may not
//      be node 0) shows OpenDate instead of the system-logged transition
//      date. This also shrinks the *preceding* node's "time in stage".
// A role can only ever get ONE of these: node 0 is only also the
// Sourcing-entry node when the role was created directly into Sourcing,
// in which case case (a)'s condition already covers it identically. (N-100)
//
// All day comparisons/diffs use utcDateOnly (this codebase's canonical
// calendar-day helper — see daysOpen() in utils.js), not raw millisecond
// arithmetic on ChangedAt instants: OpenDate is a day marker with no real
// time-of-day (always written as T12:00:00Z via isoDate()), so diffing it
// against a genuine ChangedAt instant at millisecond precision would flip by
// ±1 day depending purely on what time of day the role happened to be
// created/moved, or when someone views an ongoing "so far" count.
// `now` is passed in so the "so far" count is testable.
function _timelineDayGap(startStr, endStrOrNow) {
  const start = utcDateOnly(startStr);
  const end = endStrOrNow instanceof Date
    ? new Date(Date.UTC(endStrOrNow.getUTCFullYear(), endStrOrNow.getUTCMonth(), endStrOrNow.getUTCDate()))
    : utcDateOnly(endStrOrNow);
  return Math.floor((end - start) / 86400000);
}

function roleTimelineModel({ role, allProjects, history, hcState, now }) {
  const projectName = allProjects.find(p => String(p.id) === String(role.ProjectIDLookupId || role.ProjectID))?.CustomerName || '—';
  const stageChanges = history
    .filter(h => h.Field === 'Stage')
    .sort((a, b) => new Date(a.ChangedAt) - new Date(b.ChangedAt));
  const openDateDay = role.OpenDate ? utcDateOnly(role.OpenDate) : null;
  const sourcingIdx = stageChanges.findIndex(h => h.NewValue === 'Sourcing');
  const useOpenDateFlags = stageChanges.map((h, i) =>
    (i === 0 || i === sourcingIdx) && openDateDay !== null && openDateDay < utcDateOnly(h.ChangedAt)
  );
  const effectiveDates = stageChanges.map((h, i) => useOpenDateFlags[i] ? role.OpenDate : h.ChangedAt);
  const gapDays = stageChanges.map((h, i) =>
    _timelineDayGap(effectiveDates[i], stageChanges[i + 1] ? effectiveDates[i + 1] : now));
  // N-313: placement markers merged in by OfferAcceptedDate (read-only —
  // they never split a stage's duration; every gap still runs stage node to
  // stage node). stageDays go through spDateIn, the same function each
  // node's printed date uses.
  const hcLabelById = new Map((hcState.rows || []).map(hc =>
    [String(hc.id), hc.Title || headcountLabel(hc.Sequence)]));
  const seq = roleTimelineSequence(effectiveDates.map(d => spDateIn(d)), hcState.placements);
  return { projectName, stageChanges, useOpenDateFlags, effectiveDates, gapDays, seq, hcLabelById };
}
