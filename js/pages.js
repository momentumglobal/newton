// js/pages.js — Page content renderers
// N-151: formatSalary/daysOpen deleted — they were duplicates of the
// utils.js definitions and silently shadowed them. The project/period
// dropdowns and getProjectFilterOptions moved to js/list-controls.js.

// ── Row/table template builders (moved from utils.js, N-237c) ─────────

// Pure HTML string builders for one list row, one per optimistic-insert
// list. Each is the single source of truth for that list's row markup --
// used by the list's normal render AND by the pending-row insert, so the
// two never drift. opts.pending renders the row with a row-pending class,
// a data-pending-id marker, and no row-actions cell (a pending item has no
// real id yet, so nothing on it is clickable). Deliberately called
// "pending", not "ghost" -- this codebase's "ghost" prefix already means
// Ghost Mode (view-as-user), an unrelated feature (see GHOST_USER_KEY in
// utils.js). Uses pendingRowId() from utils.js; not redefined here.
function projectRowHtml(p, { dmDisplay, canEdit, pending = false } = {}) {
  return `
          <tr class="${pending ? "row-pending" : ""}"${pending ? ` data-pending-id="${escAttr(p.id)}"` : ""}>
            <td>${escHtml(p.CustomerName)}</td>
            <td>${escHtml(dmDisplay)}</td>
            <td><span class="badge badge-${escAttr(p.Status?.toLowerCase())}">${escHtml(p.Status)}</span></td>
            <td>${spDateIn(p.StartDate) || "—"}</td>
            <td>${spDateIn(p.EndDate) || "—"}</td>
            ${canEdit ? (pending ? "<td></td>" : `<td><div class="row-actions"><a href="#" onclick="showEditProjectForm(${p.id})">Edit</a></div></td>`) : ""}
          </tr>
        `;
}

// N-247a: the Days Open value a Roles row shows — null where the cell is
// blank for this filter. Shared by roleRowHtml and the Days Open sort
// accessor so the sort can never disagree with what's displayed.
function roleDaysOpenValue(r, rolesFilter) {
  const isHired    = rolesFilter === "Hired";
  const daysHidden = rolesFilter === "Backlog" || rolesFilter === "Cancelled";
  return (!daysHidden && (!isHired || r.ActualHireDate))
    ? daysOpen(r.OpenDate, r.ActualHireDate) : null;
}

function roleRowHtml(r, { projectName, tpMap, canEdit, historyRoleIds, rolesFilter, pending = false } = {}) {
  const isHired    = rolesFilter === "Hired";
  const days       = roleDaysOpenValue(r, rolesFilter);
  const rowClass   = (isHired || rolesFilter === "Active") && days !== null && days > 45
    ? "row-age-critical" : "";
  const dateCell   = isHired
    ? (spDateIn(r.ActualHireDate) || "—")
    : (spDateIn(r.TargetHireDate) || "—");
  // A pending role has no real id yet, so it never gets the interactive
  // unlock button -- canEdit is forced false for the stage badge only.
  const stageCell  = stageBadgeHtml(r.id, r.Stage, pending ? false : canEdit);
  return `
          <tr class="${pending ? "row-pending" : rowClass}"${pending ? ` data-pending-id="${escAttr(r.id)}"` : ""}>
            <td>${escHtml(projectName)}</td>
            <td>${escHtml(r.RoleTitle)}</td>
            <td>${escHtml(r.Location || '—')}</td>
            <td${pending ? "" : ` id="stage-cell-${r.id}"`}>${stageCell}</td>
            <td>${escHtml(tpDisplay(r.TalentPartner, tpMap))}</td>
            <td>${escHtml(formatSalary(r.Budget))}</td>
            <td>${spDateIn(r.OpenDate) || "—"}</td>
            <td>${dateCell}</td>
            <td>${days !== null ? days + " days" : "—"}</td>
            ${canEdit ? (pending ? "<td></td>" : `<td><div class="row-actions"><a href="#" onclick="showEditRoleForm(${r.id})">Edit</a><a href="#" onclick="showDuplicateRoleForm(${r.id})">Duplicate</a>${historyRoleIds.has(String(r.id)) ? `<a href="#" onclick="showRoleTimeline(${r.id})">Timeline</a>` : ""}</div></td>`) : ""}
          </tr>`;
}

function activityRowHtml(a, { roleMap, tpMap, canEdit, pending = false } = {}) {
  return `
          <tr class="${pending ? "row-pending" : ""}"${pending ? ` data-pending-id="${escAttr(a.id)}"` : ""}>
            <td>${a.Year}</td>
            <td>Wk ${a.WeekNumber}</td>
            <td>${roleMap[String(a.RoleIDLookupId)] || roleMap[String(a.RoleID)] || "—"}</td>
            <td>${escHtml(tpMap[(a.TalentPartner || '').toLowerCase()] || a.TalentPartner || "—")}</td>
            <td style="text-align:center">${a.Outreach || 0}</td>
            <td style="text-align:center">${a.Responses || 0}</td>
            <td style="text-align:center">${a.Screened || 0}</td>
            <td style="text-align:center">${a.Submitted || 0}</td>
            <td style="text-align:center">${a.Interview1 || 0}</td>
            <td style="text-align:center">${a.Interview2Plus || 0}</td>
            <td style="text-align:center">${a.FinalInterview || 0}</td>
            <td style="text-align:center">${a.Offers || 0}</td>
            <td style="text-align:center">${a.Hires || 0}</td>
            ${canEdit ? (pending ? "<td></td>" : `<td><div class="row-actions"><a href="#" onclick="showEditActivityForm(${a.id})">Edit</a></div></td>`) : ""}
          </tr>
        `;
}

function placementRowHtml(p, { roleMap, canEdit, pending = false } = {}) {
  return `
          <tr class="${pending ? "row-pending" : ""}"${pending ? ` data-pending-id="${escAttr(p.id)}"` : ""}>
            <td>${escHtml(p.CandidateName)}</td>
            <td>${roleMap[String(p.RoleIDLookupId)] || roleMap[String(p.RoleID)] || "—"}</td>
            <td>${escHtml(formatSalary(p.SalaryAgreed))}</td>
            <td>${spDateIn(p.OfferAcceptedDate) || "—"}</td>
            <td>${spDateIn(p.ProvisionalStartDate) || "—"}</td>
            <td>${p.TimeToHire != null ? p.TimeToHire + " days" : "—"}</td>
            ${canEdit ? (pending ? "<td></td>" : `<td><div class="row-actions"><a href="#" onclick="showEditPlacementForm(${p.id})">Edit</a></div></td>`) : ""}
          </tr>
        `;
}

function rejectionRowHtml(r, { roleMap, canEdit, pending = false } = {}) {
  return `
          <tr class="${pending ? "row-pending" : ""}"${pending ? ` data-pending-id="${escAttr(r.id)}"` : ""}>
            <td>${escHtml(r.CandidateName)}</td>
            <td>${roleMap[String(r.RoleIDLookupId)] || roleMap[String(r.RoleID)] || "—"}</td>
            <td>${escHtml(spDateIn(r.RejectionDate) || "—")}</td>
            <td>${escHtml(formatSalary(r.SalaryOffered))}</td>
            <td>${escHtml(r.RejectionReason || "—")}</td>
            <td>${escHtml(r.Notes || "—")}</td>
            ${canEdit ? (pending ? "<td></td>" : `<td><div class="row-actions"><a href="#" onclick="showEditRejectionForm(${r.id})">Edit</a></div></td>`) : ""}
          </tr>
        `;
}

// N-100: turns a plain integer day count into a short human label for the
// Role History timeline ("time in stage"). Takes a number only — never a
// date string — so it carries none of the SharePoint UTC/BST date-shift
// risk the date helpers above exist to guard against.
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

// skeletonPanel()/skeletonList() stay in utils.js (other consumers);
// skeletonTable() moves here — pages.js is its only caller.
function skeletonTable(rowCount = 5, colCount = 4) {
  const row = `<div class="skel-row">${
    Array.from({length: colCount}, () => `<div class="skel skel-cell"></div>`).join('')
  }</div>`;
  return `<div class="skel-table">${row.repeat(rowCount)}</div>`;
}

// ── Projects ─────────────────────────────────────────────────────────
let _projectsFilter = "Active";
async function renderProjectsPage(filter, pendingItem = null) {
  if (filter !== undefined) _projectsFilter = filter;
  const main = document.getElementById("main-content");
  main.innerHTML = skeletonTable(6, 5);
  const role = _resolvedRole;
  const user = getCurrentUser();
  let [projects, dmMap] = await Promise.all([
    getScopedProjects(user.email, false),
    getTalentPartnerDisplayMap(),
  ]);
  const canEdit = ["admin","delivery_manager"].includes(role) || hasDMGrant();
  const dmName = email => email ? (dmMap[email.toLowerCase()] || email) : "—";
  // N-218a: splice the not-yet-created row in before sort/filter, exactly
  // like a real fetched row -- it only shows up below if it actually
  // belongs on the active tab.
  if (pendingItem) projects = [...projects, pendingItem];
  projects = sortProjectsByName(projects);
  projects = projects.filter(_projectsFilter === "Active" ? isProjectActive : p => !isProjectActive(p));
  const filterBtns = ["Active", "Archive"].map(f =>
    `<button class="btn-filter${_projectsFilter === f ? " active" : ""}" onclick="renderProjectsPage('${f}')">${f}</button>`
  ).join("");
  const projectsEmptyMsg = _projectsFilter === "Archive"
    ? "No archived projects."
    : "No active projects yet.";
  main.innerHTML = `
    <div class="page-header">
      <h2>Projects</h2>
      ${canEdit ? '<button class="btn-primary" onclick="showAddProjectForm()">+ Add Project</button>' : ""}
    </div>
    <div class="table-toolbar">
      <div class="filter-group">${filterBtns}</div>
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Customer</th><th>Delivery Manager</th><th>Status</th>
        <th>Start</th><th>End</th>${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${projects.length ? projects.map(p => projectRowHtml(p, {
          dmDisplay: dmName(p.DeliveryManager),
          canEdit,
          pending: pendingItem ? p.id === pendingItem.id : false,
        })).join("") : emptyStateRow({
          colspan: canEdit ? 6 : 5,
          icon: "building-2",
          message: projectsEmptyMsg,
          actionLabel: (canEdit && _projectsFilter !== "Archive") ? "+ Add Project" : "",
          actionOnClick: (canEdit && _projectsFilter !== "Archive") ? "showAddProjectForm()" : "",
        })}
      </tbody>
    </table>
  `;
  lucide.createIcons();
}
async function showAddProjectForm() {
  document.getElementById("main-content").innerHTML = renderProjectForm();
  loadDeliveryManagersForProject('');
}
async function showEditProjectForm(id) {
  const data = await getItem("Projects", id);
  document.getElementById("main-content").innerHTML = renderProjectForm(data);
  loadDeliveryManagersForProject(data.DeliveryManager);
}
// ── Roles ─────────────────────────────────────────────────────────────
const ROLE_FILTERS = {
  Backlog:   r => ["Backlog","On-hold"].includes(r.Stage),
  Active:    r => !["Backlog","Hired","On-hold","Cancelled"].includes(r.Stage),
  Hired:     r => r.Stage === "Hired",
  Cancelled: r => r.Stage === "Cancelled",
};
let _rolesFilter    = "Active";
let _rolesProjectId = null;
let _rolesPageSize  = CONFIG.PAGE_SIZE_DEFAULT;
let _rolesSort      = null;  // N-247a: { key, dir } — null = default order
let _rolesSearch    = '';    // N-251a: shared list search box (list-controls.js)
async function renderRolesPage
  if (filter !== undefined) _rolesFilter = filter;
  const main = document.getElementById("main-content");
  main.innerHTML = skeletonTable(6, 9);
  const user = getCurrentUser();
  const userProjectIds = await getUserProjectIds(user.email);
  const [allRoles, allProjects, { projects: scopedProjects, canFilter }, tpMap, historyRoleIds] = await Promise.all([
  getRolesForUser(user.email),
  getProjects(false),
  getProjectFilterOptions(),
  getTalentPartnerDisplayMap(),
  getRoleHistoryRoleIds(),
]);
  const projectMap = Object.fromEntries(allProjects.map(p => [String(p.id), p.CustomerName]));
  // Scope to user's assigned projects
  let roles = userProjectIds
    ? allRoles.filter(r => userProjectIds.includes(String(r.ProjectIDLookupId || r.ProjectID)))
    : allRoles;
  // N-218a: splice the not-yet-created row in before the remaining filters,
  // exactly like a real fetched row -- it only shows up below if it
  // actually belongs on the active project/stage filter.
  if (pendingItem) roles = [...roles, pendingItem];
  const rolesTotal = roles.length;  // N-152: pre-filter denominator for the count
  // Apply project dropdown filter
  if (canFilter && _rolesProjectId) {
    roles = roles.filter(r =>
      String(r.ProjectIDLookupId) === String(_rolesProjectId) ||
      String(r.ProjectID) === String(_rolesProjectId)
    );
  }
  roles = roles.filter(ROLE_FILTERS[_rolesFilter] || (() => true));
  // N-247a: one project-name lookup for the default sort, the sort column and the row.
  const projectNameOf = r => projectMap[String(r.ProjectIDLookupId)] || projectMap[String(r.ProjectID)] || '';
  // N-251a: shared list search (list-controls.js) — narrows further, after
  // the project/stage filters and before any sort, same position N-140's
  // other filters sit in. `roles.length` below (default sort, ROLE_SORT_COLUMNS,
  // listResultCount's `matched`) already reflects this filter once applied.
  roles = filterRowsByText(roles, _rolesSearch, r => [
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
  // N-247a: the user's column sort goes ON TOP of the default order above.
  // sortRows is stable, so ties keep project → open-date order. Accessors
  // return what the cell shows, raw (no "—"), so blanks sort last.
  // Must stay BEFORE paginate().
  const ROLE_SORT_COLUMNS = {
    project:  { type: 'text',   get: r => projectNameOf(r) },
    role:     { type: 'text',   get: r => r.RoleTitle },
    location: { type: 'text',   get: r => r.Location },
    stage:    { type: 'enum',   get: r => r.Stage, order: CONFIG.ROLE_STAGES },
    tp:       { type: 'text',   get: r => tpList(r.TalentPartner).length ? tpDisplay(r.TalentPartner, tpMap) : '' },
    budget:   { type: 'number', get: r => r.Budget },
    openDate: { type: 'date',   get: r => r.OpenDate },
    hireDate: { type: 'date',   get: r => _rolesFilter === "Hired" ? r.ActualHireDate : r.TargetHireDate },
    daysOpen: { type: 'number', get: r => roleDaysOpenValue(r, _rolesFilter) },
  };
  roles = sortRows(roles, _rolesSort, ROLE_SORT_COLUMNS);
  const userRole = _resolvedRole;
  const canEdit  = ["admin","delivery_manager","talent_partner"].includes(userRole);
  const filterBtns = Object.keys(ROLE_FILTERS).map(f =>
    `<button class="btn-filter${_rolesFilter === f ? " active" : ""}" onclick="renderRolesPage('${f}')">${f}</button>`
  ).join("");
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _rolesProjectId, 'setRolesProject')
    : '';
  const pagedRoles = paginate(roles, _rolesPageSize);
  const ROLE_FILTER_LABELS = { Backlog: 'backlog', Active: 'active', Hired: 'hired', Cancelled: 'cancelled' };
  const rolesEmptyMsg = _rolesProjectId
    ? `No ${ROLE_FILTER_LABELS[_rolesFilter] || 'matching'} roles for the selected project.`
    : `No ${ROLE_FILTER_LABELS[_rolesFilter] || 'matching'} roles.`;
  main.innerHTML = `
    <div class="page-header">
      <h2>Roles</h2>
      <div class="page-header-actions">
        <button class="btn-secondary" onclick="showBriefingPackLibrary()">Briefing Packs</button>
        ${canEdit ? '<button class="btn-primary" onclick="showAddRoleForm()">+ Add Role</button>' : ""}
      </div>
    </div>
    <div class="table-toolbar">
      ${listControlsBar([projDropdown, listSearchBox(_rolesSearch, 'setRolesSearch'), pageSizeDropdown(_rolesPageSize, 'setRolesPageSize')])}
      <div class="filter-group">${filterBtns}</div>
    </div>
    ${listResultCount(pagedRoles.length, roles.length, rolesTotal, null, 'role')}
        <div class="table-scroll">
        <table class="data-table">
      <thead><tr>
        ${sortableHeader('Project', 'project', _rolesSort, 'setRolesSort')}
        ${sortableHeader('Role', 'role', _rolesSort, 'setRolesSort')}
        ${sortableHeader('Location', 'location', _rolesSort, 'setRolesSort')}
        ${sortableHeader('Stage', 'stage', _rolesSort, 'setRolesSort')}
        ${sortableHeader('Talent Partner', 'tp', _rolesSort, 'setRolesSort')}
        ${sortableHeader('Budget', 'budget', _rolesSort, 'setRolesSort')}
        ${sortableHeader('Open Date', 'openDate', _rolesSort, 'setRolesSort')}
        ${sortableHeader(_rolesFilter === "Hired" ? "Actual Hire Date" : "Target Hire Date", 'hireDate', _rolesSort, 'setRolesSort')}
        ${sortableHeader('Days Open', 'daysOpen', _rolesSort, 'setRolesSort')}${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${pagedRoles.length ? pagedRoles.map(r => roleRowHtml(r, {
          projectName: projectNameOf(r) || "—",
          tpMap,
          canEdit,
          historyRoleIds,
          rolesFilter: _rolesFilter,
          pending: pendingItem ? r.id === pendingItem.id : false,
        })).join("") : emptyStateRow({
          colspan: canEdit ? 10 : 9,
          icon: "briefcase",
          message: rolesEmptyMsg,
          actionLabel: canEdit ? "+ Add Role" : "",
          actionOnClick: canEdit ? "showAddRoleForm()" : "",
        })}
      </tbody>
    </table>
        </div>
  `;
  lucide.createIcons();
}
function setRolesProject(val) { _rolesProjectId = val || null; renderRolesPage(); }
function setRolesPageSize(val) { _rolesPageSize = Number(val); renderRolesPage(); }
// N-251a: debounced re-render so a fast typist doesn't trigger a full
// re-render (and skeleton flash) on every keystroke. _rolesSearch updates
// immediately here so the box always reflects what was typed; only the
// render lags. Precedent for N-251b's rollout to other list pages.
const _debouncedRenderRolesPage = debounce(async () => { await renderRolesPage(); focusListSearchBox(); }, 250);
function setRolesSearch(val) { _rolesSearch = val || ''; _debouncedRenderRolesPage(); }
// N-247a: re-renders through renderRolesPage like the setters above (cached
// fetches, same skeleton flash as a page-size change). N-247b owns sorting
// WITHOUT the re-fetch — don't copy this onto the fetch-heavy pages as-is.
// Focus goes back to the clicked header once the new table is in place.
async function setRolesSort(key) { _rolesSort = nextSortState(_rolesSort, key); await renderRolesPage(); focusSortHeader(key); }
function unlockStageEdit(roleId, currentStage) {
  const cell = document.getElementById(`stage-cell-${roleId}`);
  if (!cell) return;
  cell.innerHTML = stageSelectHtml(roleId, currentStage);
}
// N-146 — Command Bar "Update stage" action on a Role row. Called after
// navigating to the Roles page (same-module) or after the cross-module
// deep link lands here (app.js:handleDeepLink, action=updateStage).
// Reuses unlockStageEdit/stageSelectHtml rather than a second dropdown —
// per N-146's spec decision to keep exactly one stage-picker implementation.
async function scrollToAndUnlockStage(roleId) {
  const cell = document.getElementById(`stage-cell-${roleId}`);
  if (!cell) return;
  cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const user = getCurrentUser();
  const roles = await getRolesForUser(user.email);
  const role = roles.find(r => String(r.id) === String(roleId));
  if (!role) return;
  unlockStageEdit(roleId, role.Stage || '');
}
async function updateRoleStage(roleId, selectEl) {
  const prevStage = selectEl.dataset.prevValue;
  const newStage  = selectEl.value;
  const row = selectEl.closest('tr');
  await optimisticWrite({
    apply: () => {
      if (!(ROLE_FILTERS[_rolesFilter] || (() => true))({ Stage: newStage })) {
        row?.remove();          // no longer belongs in this filtered view
        return;
      }
      const cell = document.getElementById(`stage-cell-${roleId}`);
      if (cell) {
        cell.innerHTML = stageBadgeHtml(roleId, newStage, true);
        lucide.createIcons();
      }
    },
    revert: async () => {
      // The write never landed server-side, so a fresh render (cache still
      // holds the pre-write Stage) is the correct rollback -- also the only
      // way to safely restore a row that apply() removed.
      await renderRolesPage(_rolesFilter);
    },
    commit: () => updateRoleWithHistory(roleId, { Stage: newStage }),
    errorMessage: `Could not update stage from ${prevStage || '—'}.`
  });
}
async function showAddRoleForm() {
  document.getElementById("main-content").innerHTML = await renderRoleForm();
}
async function showEditRoleForm(id) {
  const data = await getItem("Roles", id);
  document.getElementById("main-content").innerHTML = await renderRoleForm(data);
  const pid = data.ProjectID || data.ProjectIDLookupId;
  if (pid) loadTalentPartnersForRole(pid, data.TalentPartner || '');
}
// N-150 — "Duplicate" row action: opens the Add Role form pre-filled from an
// existing role. Always re-fetches via getItem rather than reusing the row's
// cached list data, same reasoning showEditRoleForm follows above. Stage
// resets to Backlog and TargetHireDate is left blank purely because
// _ROLE_COPY_FIELDS excludes them — renderRoleForm's own isEdit-gated Stage
// default (forms.js) does the rest. OpenDate is the one field explicitly
// overridden here, via localDayISO() (today, local) rather than carried.
async function showDuplicateRoleForm(id) {
  const data = await getItem("Roles", id);
  const prefill = _pickFields(data, _ROLE_COPY_FIELDS);
  prefill.OpenDate = localDayISO();
  document.getElementById("main-content").innerHTML = await renderRoleForm(prefill, null, true);
  const pid = prefill.ProjectIDLookupId;
  if (pid) loadTalentPartnersForRole(pid, prefill.TalentPartner || '');
}
// N-100 — Role History timeline. Read-only. Only reachable via the
// "Timeline" row action above, which is itself only shown for roles with
// at least one RoleHistory row (historyRoleIds in renderRolesPage) — so a
// role landing here always has >=1 node. Stage-only: other RoleHistory
// fields (Title, Location, Budget, TalentPartner, dates) are out of scope
// for this view per the N-100 spec.
async function showRoleTimeline(roleId) {
  const main = document.getElementById("main-content");
  main.innerHTML = "<p>Loading role history...</p>";
  const [role, allProjects, history, tpMap] = await Promise.all([
    getItem('Roles', roleId),
    getProjects(false),
    getRoleHistory(roleId),
    getTalentPartnerDisplayMap(),
  ]);
  const projectName = allProjects.find(p => String(p.id) === String(role.ProjectIDLookupId || role.ProjectID))?.CustomerName || '—';
  const stageChanges = history
    .filter(h => h.Field === 'Stage')
    .sort((a, b) => new Date(a.ChangedAt) - new Date(b.ChangedAt));
  // N-100 UAT fix (round 2): a role's real-world journey can start before
  // Newton ever logged it. Two cases, both driven off role.OpenDate:
  //  (a) the role was entered into Newton after it actually opened — the
  //      creation row (node 0) is later than OpenDate — so node 0 shows
  //      OpenDate and relabels "Role opened".
  //  (b) the role sat in Planning/Backlog with no OpenDate, then was moved
  //      to Sourcing later with OpenDate backfilled to when it truly went
  //      live — the FIRST row whose NewValue is 'Sourcing' (which may not
  //      be node 0) shows OpenDate instead of the system-logged transition
  //      date. This also shrinks the *preceding* node's "time in stage" —
  //      Planning is measured up to when the role actually opened, not up
  //      to whenever the Sourcing transition happened to get logged.
  // A role can only ever get ONE of these: node 0 is only also the
  // Sourcing-entry node when the role was created directly into Sourcing,
  // in which case case (a)'s condition already covers it identically.
  //
  // All day comparisons/diffs below use utcDateOnly (this codebase's
  // canonical calendar-day helper — see daysOpen() in utils.js), not raw
  // millisecond arithmetic on ChangedAt instants: OpenDate is a day marker
  // with no real time-of-day (always written as T12:00:00Z via isoDate()),
  // so comparing/diffing it against a genuine ChangedAt instant at
  // millisecond precision would flip by ±1 day depending purely on what
  // time of day the role happened to be created/moved, or what time of
  // day someone views an ongoing "so far" count. Calendar-day diffing is
  // stable regardless of time-of-day on either end.
  const openDateDay = role.OpenDate ? utcDateOnly(role.OpenDate) : null;
  const sourcingIdx = stageChanges.findIndex(h => h.NewValue === 'Sourcing');
  const useOpenDateFlags = stageChanges.map((h, i) =>
    (i === 0 || i === sourcingIdx) && openDateDay !== null && openDateDay < utcDateOnly(h.ChangedAt)
  );
  const effectiveDates = stageChanges.map((h, i) => useOpenDateFlags[i] ? role.OpenDate : h.ChangedAt);
  const dayGap = (startStr, endStrOrNow) => {
    const start = utcDateOnly(startStr);
    const end = endStrOrNow instanceof Date
      ? new Date(Date.UTC(endStrOrNow.getUTCFullYear(), endStrOrNow.getUTCMonth(), endStrOrNow.getUTCDate()))
      : utcDateOnly(endStrOrNow);
    return Math.floor((end - start) / 86400000);
  };
  const nodesHtml = stageChanges.map((h, i) => {
    const cls = _roleTimelineNodeClass(h.OldValue, h.NewValue);
    // N-100 UAT fix (round 2): loosened from `h.OldValue === ''` — Graph/
    // SharePoint normalises a text column written as '' back to null on
    // read, so the strict empty-string check silently never matched the
    // real creation row (wrong "— → Sourcing" label, wrong 'branch'/orange
    // dot in _roleTimelineNodeClass below, and skipped the OpenDate
    // back-date since useOpenDate required isCreated). Falsy catches '',
    // null, and undefined alike; a real Stage name is never falsy, so this
    // can't misfire on an actual transition.
    const isCreated = !h.OldValue;
    const useOpenDate = useOpenDateFlags[i];
    const effectiveChangedAt = effectiveDates[i];
    const label = isCreated
      ? `${useOpenDate ? 'Role opened' : 'Role created'} — entered ${escHtml(h.NewValue || '—')}`
      : `${escHtml(h.OldValue || '—')} → ${escHtml(h.NewValue || '—')}${useOpenDate ? ' — role opened' : ''}`;
    const next = stageChanges[i + 1];
    const gapDays = dayGap(effectiveChangedAt, next ? effectiveDates[i + 1] : new Date());
    const gapLabel = next
      ? `${formatDurationDays(gapDays)} in ${escHtml(h.NewValue || '—')}`
      : `${formatDurationDays(gapDays)} in ${escHtml(h.NewValue || '—')} so far`;
    return `
      <div class="role-timeline-node role-timeline-node--${cls}">
        <div class="role-timeline-track">
          <div class="role-timeline-connector"></div>
          <div class="role-timeline-dot"></div>
        </div>
        <div class="role-timeline-content">
          <div class="role-timeline-label">${label}</div>
          <div class="role-timeline-meta">${spDateIn(effectiveChangedAt) || "—"} · ${escHtml(tpDisplay(h.ChangedBy, tpMap))}</div>
          <div class="role-timeline-duration${!next ? ' role-timeline-duration--ongoing' : ''}">${gapLabel}</div>
        </div>
      </div>`;
  }).join("");
  main.innerHTML = `
    <div class="page-header">
      <h2>Role History — ${escHtml(role.RoleTitle)}</h2>
      <div class="page-header-actions"><button class="btn-secondary" onclick="navigateTo('roles')">← Back to Roles</button></div>
    </div>
    <p class="role-timeline-subhead">${escHtml(projectName)} · Current stage: <span class="badge">${escHtml(role.Stage || "—")}</span></p>
    <div class="role-timeline">
      ${nodesHtml || '<p style="color:var(--text-muted);">No stage history recorded.</p>'}
    </div>
  `;
  lucide.createIcons();
}
// Classifies a Stage RoleHistory row for the timeline's colour coding.
// 'start' = the creation row (OldValue ''); 'branch' = On-hold/Cancelled on
// either end, or an unresolvable/equal comparison — deliberately neutral,
// never green or red, since neither is a point on the linear pipeline.
// Forward/backward is index comparison on CONFIG.ROLE_STAGES — the full
// 11-stage canonical order — NEVER analytics.js's STAGE_ORDER, which is a
// 4-stage subset built only for isRoleFlagged's velocity check.
function _roleTimelineNodeClass(oldStage, newStage) {
  // N-100 UAT fix (round 2): same SharePoint null-vs-empty-string quirk as
  // showRoleTimeline's isCreated check above — a falsy check catches the
  // real creation row whether SharePoint hands it back as '' or null.
  if (!oldStage) return 'start';
  const branchStages = ['On-hold', 'Cancelled'];
  if (branchStages.includes(newStage) || branchStages.includes(oldStage)) return 'branch';
  const oldIdx = CONFIG.ROLE_STAGES.indexOf(oldStage);
  const newIdx = CONFIG.ROLE_STAGES.indexOf(newStage);
  if (oldIdx === -1 || newIdx === -1 || newIdx === oldIdx) return 'branch';
  return newIdx > oldIdx ? 'forward' : 'backward';
}
// ── Weekly Activity ───────────────────────────────────────────────────
let _activityProjectId = null;
let _activityRoleId    = null;
// N-093: weeks of history fetched from SharePoint. 0 = All time (no clause).
let _activityWeeks     = CONFIG.DATE_WINDOW_DEFAULT_WEEKS;
let _activityPageSize  = CONFIG.PAGE_SIZE_DEFAULT;
async function renderActivityPage(pendingItem = null) {
  const main = document.getElementById("main-content");
  main.innerHTML = skeletonTable(6, 13);
  const user = getCurrentUser();
  const userProjectIds = await getUserProjectIds(user.email);
  const [activity, allRoles, { projects: scopedProjects, canFilter }, tpMap] = await Promise.all([
  getWeeklyActivity(null, null, { sinceWeeks: _activityWeeks }),
  getRolesForUser(user.email),
  getProjectFilterOptions(),
  getTalentPartnerDisplayMap(),
]);
  const roleProjectMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), String(r.ProjectIDLookupId || r.ProjectID || '')])
  );
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)]));
  // N-218a: splice the not-yet-created row in before sort/scope, exactly
  // like a real fetched row -- it only shows up below if it actually
  // belongs to the active project/role filter.
  if (pendingItem) activity.push(pendingItem);
  activity.sort((a, b) => {
    const yr = Number(b.Year) - Number(a.Year);
    if (yr !== 0) return yr;
    return Number(b.WeekNumber) - Number(a.WeekNumber);
  });
  // Scope to user's assigned projects
  let filteredActivity = userProjectIds
    ? activity.filter(a => {
        const rid = String(a.RoleIDLookupId || a.RoleID || '');
        return userProjectIds.includes(roleProjectMap[rid]);
      })
    : activity;
  // For Talent Partners, also scope to their own entries — the ghosted
  // user's own entries when Ghost Mode is active (N-162 fix).
  if (_resolvedRole === 'talent_partner') {
    filteredActivity = filteredActivity.filter(a =>
      (a.TalentPartner || '').toLowerCase() === getScopedUserEmail()
    );
  }
  // N-152: denominator captured AFTER both permission scopes and BEFORE any
  // user-chosen filter — a TP must not be told about rows they cannot see.
  const activityTotal = filteredActivity.length;
  if (canFilter && _activityProjectId) {
    filteredActivity = filteredActivity.filter(a => {
      const rid = String(a.RoleIDLookupId || a.RoleID || '');
      return roleProjectMap[rid] === String(_activityProjectId);
    });
  }
  if (_activityRoleId) {
    filteredActivity = filteredActivity.filter(a =>
      String(a.RoleIDLookupId || a.RoleID || '') === String(_activityRoleId)
    );
  }
  // Build scoped role options for dropdown (respects existing project + role scoping)
  const scopedRoleIds = new Set(filteredActivity.map(a => String(a.RoleIDLookupId || a.RoleID || '')));
  const roleOptions = [
    `<option value="" ${!_activityRoleId ? 'selected' : ''}>All Roles</option>`,
    ...allRoles
      .filter(r => scopedRoleIds.has(String(r.id)))
      .sort((a, b) => (roleMap[String(a.id)] || '').localeCompare(roleMap[String(b.id)] || ''))
      .map(r => `<option value="${r.id}" ${String(_activityRoleId) === String(r.id) ? 'selected' : ''}>${roleMap[String(r.id)]}</option>`)
  ].join('');
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _activityProjectId, 'setActivityProject')
    : '';
  const roleDropdown = `<div class="form-group project-filter-select">
    <label>Role</label>
    <select onchange="setActivityRole(this.value)">${roleOptions}</select>
  </div>`;
  const role    = _resolvedRole;
  const canEdit = ["admin","delivery_manager","talent_partner"].includes(role);
  const periodDropdown = periodFilterDropdown(_activityWeeks, 'setActivityWeeks');
  const pagedActivity = paginate(filteredActivity, _activityPageSize);
  const activityEmptyMsg = (_activityProjectId || _activityRoleId)
    ? "No activity logged for the selected filters."
    : "No activity logged yet.";
  main.innerHTML = `
    <div class="page-header">
      <h2>Weekly Activity</h2>
      ${canEdit ? '<div class="page-header-actions">' + (typeof bulkEntryAvailable === 'function' && bulkEntryAvailable() ? '<button class="btn-secondary" onclick="showBulkActivityPage()">Bulk log week</button>' : '') + '<button class="btn-primary" onclick="showAddActivityForm()">+ Log Activity</button></div>' : ""}
    </div>
    <div class="table-toolbar">
      ${listControlsBar([projDropdown, roleDropdown, periodDropdown, pageSizeDropdown(_activityPageSize, 'setActivityPageSize')])}
    </div>
    ${listResultCount(pagedActivity.length, filteredActivity.length, activityTotal, _activityWeeks, 'activity row')}
    <table class="data-table">
      <thead><tr>
        <th>Year</th><th>Week</th><th>Role</th><th>Talent Partner</th>
        <th style="text-align:center">Outreach</th>
        <th style="text-align:center">Responses</th>
        <th style="text-align:center">Screened</th>
        <th style="text-align:center">Submitted</th>
        <th style="text-align:center">IV1</th>
        <th style="text-align:center">IV2+</th>
        <th style="text-align:center">Final IV</th>
        <th style="text-align:center">Offers</th>
        <th style="text-align:center">Hires</th>
        ${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${pagedActivity.length ? pagedActivity.map(a => activityRowHtml(a, {
          roleMap,
          tpMap,
          canEdit,
          pending: pendingItem ? a.id === pendingItem.id : false,
        })).join("") : emptyStateRow({
          colspan: canEdit ? 14 : 13,
          icon: "activity",
          message: activityEmptyMsg,
          actionLabel: canEdit ? "+ Log Activity" : "",
          actionOnClick: canEdit ? "showAddActivityForm()" : "",
        })}
      </tbody>
    </table>
  `;
  lucide.createIcons();
}
function setActivityWeeks(val) { _activityWeeks = Number(val); renderActivityPage(); }
function setActivityPageSize(val) { _activityPageSize = Number(val); renderActivityPage(); }
function setActivityProject(val) { _activityProjectId = val || null; _activityRoleId = null; renderActivityPage(); }
function setActivityRole(val) { _activityRoleId = val || null; renderActivityPage(); }
// N-146 — preselectedRoleId/preselectedProjectId let the Command Bar's
// Log activity row action pre-scope the form to a role, same shape as
// showAddPlacementForm below.
async function showAddActivityForm(preselectedRoleId = null, preselectedProjectId = null) {
  document.getElementById("main-content").innerHTML = await renderWeeklyActivityForm(null, preselectedRoleId, preselectedProjectId);
}
async function showEditActivityForm(id) {
  const data = await getItem("WeeklyActivity", id);
  document.getElementById("main-content").innerHTML = await renderWeeklyActivityForm(data);
}
// N-147 (T-2a) — the bulk grid is a sub-view of this page, not a PAGES entry:
// it renders into #main-content exactly as showAddActivityForm does, and
// returns via navigateTo('activity'). Grid logic lives in bulk-activity.js.
async function showBulkActivityPage() {
  await renderBulkActivityPage();
}
// ── Placements ────────────────────────────────────────────────────────
const PLACEMENT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PLACEMENT_YEARS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);
let _placementFilter    = { type: null, value: null };
let _placementProjectId = null;
let _placementWeeks     = CONFIG.PLACEMENTS_DEFAULT_WEEKS;
let _placementPageSize  = CONFIG.PAGE_SIZE_DEFAULT;
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
function setPlacementFilter(type, value) {
  if (_placementFilter.type === type && _placementFilter.value === value) {
    _placementFilter = { type: null, value: null };
  } else {
    _placementFilter = { type, value };
  }
  renderPlacementsPage();
}
async function renderPlacementsPage(pendingItem = null) {
  const main = document.getElementById("main-content");
  main.innerHTML = skeletonTable(6, 6);
  const user = getCurrentUser();
  const userProjectIds = await getUserProjectIds(user.email);
  const [allPlacements, allRoles, { projects: scopedProjects, canFilter }] = await Promise.all([
    // N-093 / N-151: the query is bounded by the background date window and,
    // when one is active, by the month/quarter/year selection — whichever is
    // LOOSER (see listQueryFromDay). placementInFilter() below still applies
    // the exact test, so this can only ever over-fetch.
    getPlacements(null, { fromDay: listQueryFromDay(
      weeksAgoDay(_placementWeeks), placementFilterCutoff(_placementFilter)) }),
    getRolesForUser(user.email),
    getProjectFilterOptions(),
  ]);
  const roleProjectMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), String(r.ProjectIDLookupId || r.ProjectID || '')])
  );
  // N-207: scope Placements by the linked Role's TalentPartner (not
  // Placements' own TalentPartner column) — see spec N-207.md for why: the
  // Rejected Offers page below has no TalentPartner column of its own and
  // must use the Role's, so both pages use the same source for consistency.
  const roleTpMap = Object.fromEntries(allRoles.map(r => [String(r.id), r.TalentPartner]));
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)]));
  // N-218a: splice the not-yet-created row in before sort/scope, exactly
  // like a real fetched row -- it only shows up below if it actually
  // belongs to the active period/project filter. This read started before
  // the create write (apply() and commit() run in parallel), so it cannot
  // already contain the real row in the normal case.
  if (pendingItem) allPlacements.push(pendingItem);
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
  // N-207: also scope to the TP's own placements, via the linked Role's
  // TalentPartner (tpMatches handles a multi-TP role) — folded into
  // scopedPlacements itself, before it, so the N-151 "Showing X of Y"
  // denominator below already reflects it.
  if (_resolvedRole === 'talent_partner') {
    scopedPlacements = scopedPlacements.filter(p => {
      const rid = String(p.RoleIDLookupId || p.RoleID || '');
      return tpMatches(roleTpMap[rid], getScopedUserEmail());
    });
  }
  let placements = scopedPlacements.filter(p => placementInFilter(p, _placementFilter));
  if (canFilter && _placementProjectId) {
    placements = placements.filter(p => {
      const rid = String(p.RoleIDLookupId || p.RoleID || '');
      return roleProjectMap[rid] === String(_placementProjectId);
    });
  }
  const role    = _resolvedRole;
  const canEdit = ["admin","delivery_manager","talent_partner"].includes(role);
  const monthBtns = PLACEMENT_MONTHS.map((m, i) =>
    `<button class="btn-filter${_placementFilter.type === "month" && _placementFilter.value === i ? " active" : ""}" onclick="setPlacementFilter('month',${i})">${m}</button>`
  ).join("");
  const quarterBtns = [1,2,3,4].map(q =>
    `<button class="btn-filter${_placementFilter.type === "quarter" && _placementFilter.value === q ? " active" : ""}" onclick="setPlacementFilter('quarter',${q})">Q${q}</button>`
  ).join("");
  const yearBtns = PLACEMENT_YEARS.map(y =>
    `<button class="btn-filter${_placementFilter.type === "year" && _placementFilter.value === y ? " active" : ""}" onclick="setPlacementFilter('year',${y})">${y}</button>`
  ).join("");
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _placementProjectId, 'setPlacementProject')
    : '';
  const periodDropdown = periodFilterDropdown(_placementWeeks, 'setPlacementWeeks');
  const pagedPlacements = paginate(placements, _placementPageSize);
  // N-151: the denominator is scopedPlacements, NOT allPlacements — a talent
  // partner would otherwise read "Showing 3 of 128" and think 125 rows were
  // hidden by their filters, when most are hidden by their permissions.
  const resultCount = listResultCount(pagedPlacements.length, placements.length, scopedPlacements.length, _placementWeeks, 'placement');
  const placementFilterLabel = _placementFilter.type === "month" ? PLACEMENT_MONTHS[_placementFilter.value]
    : _placementFilter.type === "quarter" ? `Q${_placementFilter.value}`
    : _placementFilter.type === "year" ? String(_placementFilter.value)
    : '';
  const placementsEmptyMsg = placementFilterLabel
    ? `No placements recorded for ${placementFilterLabel}.`
    : "No placements recorded yet.";
  main.innerHTML = `
    <div class="page-header">
      <h2>Placements</h2>
      <div class="page-header-actions">
        ${canEdit ? '<button class="btn-primary" onclick="showAddPlacementForm()">+ Record Placement</button>' : ""}
      </div>
    </div>
    <div class="table-toolbar">
      ${listControlsBar([projDropdown, periodDropdown, pageSizeDropdown(_placementPageSize, 'setPlacementPageSize')])}
      <div class="placement-filter-rows">
        <div class="placement-filter-row">
          <div class="filter-labeled-group"><span class="filter-label">Month</span><div class="filter-group">${monthBtns}</div></div>
        </div>
        <div class="placement-filter-row">
          <div class="filter-labeled-group"><span class="filter-label">Quarter</span><div class="filter-group">${quarterBtns}</div></div>
          <div class="filter-labeled-group"><span class="filter-label">Year</span><div class="filter-group">${yearBtns}</div></div>
        </div>
      </div>
    </div>
    ${resultCount}
    <table class="data-table">
      <thead><tr>
        <th>Candidate</th><th>Role</th><th>Salary</th>
        <th>Offer Accepted</th><th>Start Date</th><th>Time to Hire</th>
        ${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        <tbody>
        ${pagedPlacements.length ? pagedPlacements.map(p => placementRowHtml(p, {
          roleMap,
          canEdit,
          pending: pendingItem ? p.id === pendingItem.id : false,
        })).join("") : emptyStateRow({
          colspan: canEdit ? 7 : 6,
          icon: "user-check",
          message: placementsEmptyMsg,
          actionLabel: canEdit ? "+ Record Placement" : "",
          actionOnClick: canEdit ? "showAddPlacementForm()" : "",
        })}
      </tbody>
    </table>
  `;
  lucide.createIcons();
}
function setPlacementProject(val) { _placementProjectId = val || null; renderPlacementsPage(); }
function setPlacementWeeks(val) { _placementWeeks = Number(val); renderPlacementsPage(); }
function setPlacementPageSize(val) { _placementPageSize = Number(val); renderPlacementsPage(); }
// N-146 — preselectedRoleId/preselectedProjectId let the Command Bar's
// Add placement row action pre-scope the form to a role; renderPlacementForm
// already accepts them (N-145's logged-hire flow uses the same params).
async function showAddPlacementForm(preselectedRoleId = null, preselectedProjectId = null) {
  document.getElementById("main-content").innerHTML = await renderPlacementForm(null, preselectedRoleId, preselectedProjectId);
}
async function showEditPlacementForm(id) {
  const data = await getItem("Placements", id);
  document.getElementById("main-content").innerHTML = await renderPlacementForm(data);
}
// ── Rejected Offers ───────────────────────────────────────────────────
let _rejectionsProjectId = null;
let _rejectionsWeeks     = CONFIG.REJECTIONS_DEFAULT_WEEKS;
let _rejectionsPageSize  = CONFIG.PAGE_SIZE_DEFAULT;
async function renderRejectionsPage(pendingItem = null) {
  const main = document.getElementById("main-content");
  main.innerHTML = skeletonTable(6, 6);
  const user = getCurrentUser();
  const userProjectIds = await getUserProjectIds(user.email);
  const [rejections, allRoles, { projects: scopedProjects, canFilter }] = await Promise.all([
    // N-152: bounded ONLY when the user picks a window. The default is 0
    // (All time) and must stay that way — a `ge` bound cannot match a null
    // RejectionDate, so a bounded default would silently drop the rows that
    // were deliberately never backfilled. See CONFIG.REJECTIONS_DEFAULT_WEEKS.
    getRejectedOffers(null, { fromDay: weeksAgoDay(_rejectionsWeeks) }),
    getRolesForUser(user.email),
    getProjectFilterOptions(),
  ]);
  const roleProjectMap = Object.fromEntries(
    allRoles.map(r => [String(r.id), String(r.ProjectIDLookupId || r.ProjectID || '')])
  );
  // N-207: RejectedOffers has no TalentPartner column of its own — the linked
  // Role's TalentPartner is the only source, and it's what Placements above
  // uses too, for consistency between the two pages.
  const roleTpMap = Object.fromEntries(allRoles.map(r => [String(r.id), r.TalentPartner]));
  const roleMap = Object.fromEntries(allRoles.map(r => [String(r.id), escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)]));
  // N-218a: splice the not-yet-created row in before sort/scope, exactly
  // like a real fetched row -- it only shows up below if it actually
  // belongs to the active project filter.
  if (pendingItem) rejections.push(pendingItem);
  rejections.sort((a, b) => {
    const rA = roleMap[String(a.RoleIDLookupId)] || roleMap[String(a.RoleID)] || '';
    const rB = roleMap[String(b.RoleIDLookupId)] || roleMap[String(b.RoleID)] || '';
    return rA.localeCompare(rB);
  });
  // Scope to user's assigned projects
  let filteredRejections = userProjectIds
    ? rejections.filter(r => {
        const rid = String(r.RoleIDLookupId || r.RoleID || '');
        return userProjectIds.includes(roleProjectMap[rid]);
      })
    : rejections;
  // N-207: also scope to the TP's own rejections, via the linked Role's
  // TalentPartner (tpMatches handles a multi-TP role) — inserted BEFORE the
  // N-152 pre-filter denominator capture below, so "Showing X of Y" never
  // counts a row the TP cannot see.
  if (_resolvedRole === 'talent_partner') {
    filteredRejections = filteredRejections.filter(r => {
      const rid = String(r.RoleIDLookupId || r.RoleID || '');
      return tpMatches(roleTpMap[rid], getScopedUserEmail());
    });
  }
  const rejectionsTotal = filteredRejections.length;  // N-152: pre-filter denominator
  if (canFilter && _rejectionsProjectId) {
    filteredRejections = filteredRejections.filter(r => {
      const rid = String(r.RoleIDLookupId || r.RoleID || '');
      return roleProjectMap[rid] === String(_rejectionsProjectId);
    });
  }
  const role    = _resolvedRole;
  const canEdit = ["admin","delivery_manager","talent_partner"].includes(role);
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _rejectionsProjectId, 'setRejectionsProject')
    : '';
  const pagedRejections = paginate(filteredRejections, _rejectionsPageSize);
  const rejectionsEmptyMsg = _rejectionsProjectId
    ? "No rejected offers for this project."
    : "No rejected offers logged yet.";
  main.innerHTML = `
    <div class="page-header">
      <h2>Rejected Offers</h2>
      ${canEdit ? '<div class="page-header-actions"><button class="btn-primary" onclick="showAddRejectionForm()">+ Log Rejection</button></div>' : ""}
    </div>
    <div class="table-toolbar">
      ${listControlsBar([projDropdown, periodFilterDropdown(_rejectionsWeeks, 'setRejectionsWeeks'), pageSizeDropdown(_rejectionsPageSize, 'setRejectionsPageSize')])}
    </div>
    ${listResultCount(pagedRejections.length, filteredRejections.length, rejectionsTotal, _rejectionsWeeks, 'rejection')}
    <table class="data-table">
      <thead><tr>
        <th>Candidate</th><th>Role</th><th>Rejected</th><th>Salary Offered</th><th>Reason</th><th>Notes</th>${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${pagedRejections.length ? pagedRejections.map(r => rejectionRowHtml(r, {
          roleMap,
          canEdit,
          pending: pendingItem ? r.id === pendingItem.id : false,
        })).join("") : emptyStateRow({
          colspan: canEdit ? 7 : 6,
          icon: "user-x",
          message: rejectionsEmptyMsg,
          actionLabel: canEdit ? "+ Log Rejection" : "",
          actionOnClick: canEdit ? "showAddRejectionForm()" : "",
        })}
      </tbody>
    </table>
  `;
  lucide.createIcons();
}
function setRejectionsProject(val) { _rejectionsProjectId = val || null; renderRejectionsPage(); }
function setRejectionsWeeks(val) { _rejectionsWeeks = Number(val); renderRejectionsPage(); }
function setRejectionsPageSize(val) { _rejectionsPageSize = Number(val); renderRejectionsPage(); }
async function showAddRejectionForm() {
  document.getElementById("main-content").innerHTML = await renderRejectedOfferForm();
}
async function showEditRejectionForm(id) {
  const data = await getItem("RejectedOffers", id);
  document.getElementById("main-content").innerHTML = await renderRejectedOfferForm(data);
}
