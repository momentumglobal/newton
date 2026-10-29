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
// N-266a: who may edit rows on the Projects / Roles lists. One definition
// each — the list renderers below AND the checklist page (checklists.js,
// "who can tick") use these, so the two can never drift apart.
function canEditProjectRows(role) {
  return ["admin","delivery_manager"].includes(role) || hasDMGrant();
}
function canEditRoleRows(role) {
  return ["admin","delivery_manager","talent_partner"].includes(role);
}
// N-369 (PT-9, D-2): the per-project write gate for a list page. writable(pid) = may this
// user write that project (canWriteProject, permissions.js); any = may they write at
// least one (drives the "+ Add / + Log" buttons). writableIds from getUserWritableProjectIds.
// Narrow only: callers still check their role rule (canEditRoleRows / canEditProjectRows).
function _listWriteGate(role, writableIds) {
  return {
    writable: pid => canWriteProject(role, pid, writableIds),
    any: writableIds === null || seesAllProjects(role) || (Array.isArray(writableIds) && writableIds.length > 0),
  };
}
// N-266a: the Checklist column cell — "done/total" of the record's active
// items, "—" when the record has no checklist for this user, and an empty
// cell on a pending row (it has no real id yet). Rendered only when the
// list shows the column at all (showChecklistCol).
function checklistCellHtml(checklist, pending) {
  if (pending) return "<td></td>";
  if (!checklist || checklist.mode === "none" || !checklist.summary) return `<td class="checklist-cell">—</td>`;
  const s = checklist.summary;
  const title = s.reqTotal ? ` title="${s.reqDone} of ${s.reqTotal} required"` : "";
  return `<td class="checklist-cell"${title}>${s.done}/${s.total}</td>`;
}
// N-364: every project name opens the Project page (project-page.js), checklist
// or not. A pending row has no real id yet, so it renders as plain text.
function projectNameLinkHtml(p, pending) {
  if (pending) return escHtml(p.CustomerName);
  return `<a href="#" class="cell-link"${act('openProjectPage.prevent', Number(p.id))}>${escHtml(p.CustomerName)}</a>`;
}
function projectRowHtml(p, { dmDisplay, canEdit, readOnly = false, pending = false, checklist = null, showChecklistCol = false } = {}) {
  return `
          <tr class="${pending ? "row-pending" : ""}"${pending ? ` data-pending-id="${escAttr(p.id)}"` : ""}>
            <td>${projectNameLinkHtml(p, pending)}</td>
            <td>${escHtml(dmDisplay)}</td>
            <td><span class="badge badge-${escAttr(p.Status?.toLowerCase())}">${escHtml(p.Status)}</span></td>
            <td>${spDateIn(p.StartDate) || "—"}</td>
            <td>${spDateIn(p.EndDate) || "—"}</td>
            ${showChecklistCol ? checklistCellHtml(checklist, pending) : ""}
            ${canEdit ? (pending || readOnly ? "<td></td>" : `<td><div class="row-actions"><a href="#"${act('showEditProjectForm', Number(p.id))}>Edit</a></div></td>`) : ""}
          </tr>
        `;
}

// N-307: every role name opens the role page (role-page.js), checklist or
// not. A pending row has no real id yet, so it renders as plain text.
function roleNameLinkHtml(r, pending) {
  if (pending) return escHtml(r.RoleTitle);
  return `<a href="#" class="cell-link"${act('openRolePage.prevent', Number(r.id))}>${escHtml(r.RoleTitle)}</a>`;
}

function roleRowHtml(r, { projectName, tpMap, canEdit, readOnly = false, historyRoleIds, rolesFilter, pending = false, checklist = null, showChecklistCol = false, hcSummary = null } = {}) {
  const summary    = pending ? null : hcSummary;
  const days       = roleDaysOpenValue(r, rolesFilter, summary);
  const rowClass   = rolesFilter === "Active" && days !== null && days > CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays
    ? "row-age-critical" : "";
  const hcCell     = summary
    ? `<td title="${escAttr(headcountXYTitle(summary.counts))}">${escHtml(headcountXY(summary.counts))}</td>`
    : "<td>—</td>";
  // A pending role has no real id yet, so it never gets the interactive
  // unlock button -- canEdit is forced false for the stage badge only.
  // N-369: nor on a row whose project the user can no longer write.
  const stageCell  = stageBadgeHtml(r.id, r.Stage, (pending || readOnly) ? false : canEdit);
  return `
          <tr class="${pending ? "row-pending" : rowClass}"${pending ? ` data-pending-id="${escAttr(r.id)}"` : ""}>
            <td>${escHtml(projectName)}</td>
            <td>${roleNameLinkHtml(r, pending)}</td>
            <td>${escHtml(r.Location || '—')}</td>
            <td${pending ? "" : ` id="stage-cell-${r.id}"`}>${stageCell}</td>
            <td>${escHtml(tpDisplay(r.TalentPartner, tpMap))}</td>
            <td>${escHtml(formatSalary(r.Budget))}</td>
            ${hcCell}
            <td>${days !== null ? days + " days" : "—"}</td>
            ${showChecklistCol ? checklistCellHtml(checklist, pending) : ""}
            ${canEdit ? (pending ? "<td></td>" : `<td><div class="row-actions">${readOnly ? "" : `<a href="#"${act('showEditRoleForm', Number(r.id))}>Edit</a><a href="#"${act('showDuplicateRoleForm', Number(r.id))}>Duplicate</a>`}${historyRoleIds.has(String(r.id)) ? `<a href="#"${act('showRoleTimeline', Number(r.id))}>Timeline</a>` : ""}</div></td>`) : ""}
          </tr>`;
}

function activityRowHtml(a, { roleMap, tpMap, canEdit, readOnly = false, pending = false } = {}) {
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
            ${canEdit ? (pending || readOnly ? "<td></td>" : `<td><div class="row-actions"><a href="#"${act('showEditActivityForm', Number(a.id))}>Edit</a></div></td>`) : ""}
          </tr>
        `;
}

// N-340: showTp (Admin / Delivery Manager only) adds the Talent Partner cell —
// Placements.TalentPartner, the TP the placement is logged against — as the
// last data cell, before the Edit cell. tpMap is email -> display name.
function placementRowHtml(p, { roleMap, canEdit, readOnly = false, showTp = false, tpMap = {}, pending = false } = {}) {
  return `
          <tr class="${pending ? "row-pending" : ""}"${pending ? ` data-pending-id="${escAttr(p.id)}"` : ""}>
            <td>${escHtml(p.CandidateName)}</td>
            <td>${roleMap[String(p.RoleIDLookupId)] || roleMap[String(p.RoleID)] || "—"}</td>
            <td>${escHtml(formatSalary(p.SalaryAgreed))}</td>
            <td>${spDateIn(p.OfferAcceptedDate) || "—"}</td>
            <td>${spDateIn(p.ProvisionalStartDate) || "—"}</td>
            <td>${p.TimeToHire != null ? p.TimeToHire + " days" : "—"}</td>
            ${showTp ? `<td>${escHtml(tpDisplay(p.TalentPartner, tpMap))}</td>` : ""}
            ${canEdit ? (pending || readOnly ? "<td></td>" : `<td><div class="row-actions"><a href="#"${act('showEditPlacementForm', Number(p.id))}>Edit</a></div></td>`) : ""}
          </tr>
        `;
}

function rejectionRowHtml(r, { roleMap, canEdit, readOnly = false, pending = false } = {}) {
  return `
          <tr class="${pending ? "row-pending" : ""}"${pending ? ` data-pending-id="${escAttr(r.id)}"` : ""}>
            <td>${escHtml(r.CandidateName)}</td>
            <td>${roleMap[String(r.RoleIDLookupId)] || roleMap[String(r.RoleID)] || "—"}</td>
            <td>${escHtml(spDateIn(r.RejectionDate) || "—")}</td>
            <td>${escHtml(formatSalary(r.SalaryOffered))}</td>
            <td>${escHtml(r.RejectionReason || "—")}</td>
            <td>${escHtml(r.Notes || "—")}</td>
            ${canEdit ? (pending || readOnly ? "<td></td>" : `<td><div class="row-actions"><a href="#"${act('showEditRejectionForm', Number(r.id))}>Edit</a></div></td>`) : ""}
          </tr>
        `;
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
  let [projects, dmMap, ckCtx, writableIds] = await Promise.all([
    // N-365 (S-1): Admin / Leadership / People Ops see every project.
    seesAllProjects(role) ? getProjects(false) : getScopedProjects(user.email, false),
    getTalentPartnerDisplayMap(),
    getChecklistListContext("project"),   // N-266a — null = render as before
    getUserWritableProjectIds(user.email),   // N-369
  ]);
  const canEdit = canEditProjectRows(role);
  const gate = _listWriteGate(role, writableIds);   // N-369: per-row Edit; + Add Project unchanged (S-9)
  const showChecklistCol = !!(ckCtx && ckCtx.showColumn);
  const dmName = email => email ? (dmMap[email.toLowerCase()] || email) : "—";
  // N-218a: splice the not-yet-created row in before sort/filter, exactly
  // like a real fetched row -- it only shows up below if it actually
  // belongs on the active tab.
  if (pendingItem) projects = [...projects, pendingItem];
  projects = sortProjectsByName(projects);
  projects = projects.filter(_projectsFilter === "Active" ? isProjectActive : p => !isProjectActive(p));
  const filterBtns = ["Active", "Archive"].map(f =>
    `<button class="btn-filter${_projectsFilter === f ? " active" : ""}"${act('renderProjectsPage', f)}>${f}</button>`
  ).join("");
  const projectsEmptyMsg = _projectsFilter === "Archive"
    ? "No archived projects."
    : "No active projects yet.";
  main.innerHTML = `
    <div class="page-header">
      <h2>Projects</h2>
      ${canEdit ? `<button class="btn-primary"${act('showAddProjectForm')}>+ Add Project</button>` : ""}
    </div>
    <div class="table-toolbar">
      <div class="filter-group">${filterBtns}</div>
    </div>
    <table class="data-table">
      <thead><tr>
        <th>Customer</th><th>Delivery Manager</th><th>Status</th>
        <th>Start</th><th>End</th>${showChecklistCol ? "<th>Checklist</th>" : ""}${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${projects.length ? projects.map(p => projectRowHtml(p, {
          dmDisplay: dmName(p.DeliveryManager),
          canEdit,
          readOnly: !gate.writable(p.id),
          pending: pendingItem ? p.id === pendingItem.id : false,
          checklist: checklistCellData(ckCtx, p, p.ProjectType),
          showChecklistCol,
        })).join("") : emptyStateRow({
          colspan: 5 + (showChecklistCol ? 1 : 0) + (canEdit ? 1 : 0),
          icon: "building-2",
          message: projectsEmptyMsg,
          actionLabel: (canEdit && _projectsFilter !== "Archive") ? "+ Add Project" : "",
          actionAct: (canEdit && _projectsFilter !== "Archive") ? ['showAddProjectForm'] : null,
        })}
      </tbody>
    </table>
  `;
  lucide.createIcons();
}
// N-365 (D-5): the Project form has no Delivery Manager picker — the Lead DM
// is set from the Project Team on the Project page.
async function showAddProjectForm() {
  document.getElementById("main-content").innerHTML = renderProjectForm();
}
async function showEditProjectForm(id) {
  const w = await checkProjectWrite(id);   // N-369
  if (!w.ok) { toast(w.reason, { type: 'error' }); return; }
  const data = await getItem("Projects", id);
  document.getElementById("main-content").innerHTML = renderProjectForm(data);
}
// ── Roles ─────────────────────────────────────────────────────────────
let _rolesFilter    = "Active";
let _rolesProjectId = null;
let _rolesPageSize  = CONFIG.PAGE_SIZE_DEFAULT;
let _rolesSort      = null;  // N-247a: { key, dir } — null = default order
let _rolesSearch    = '';    // N-251a: shared list search box (list-controls.js)
async function renderRolesPage(filter, pendingItem = null) {
  if (filter !== undefined) _rolesFilter = filter;
  const main = document.getElementById("main-content");
  main.innerHTML = skeletonTable(6, 8);
  const user = getCurrentUser();
  const [userProjectIds, writableIds] = await Promise.all([getUserProjectIds(user.email), getUserWritableProjectIds(user.email)]);   // N-369
  const [allRoles, allProjects, { projects: scopedProjects, canFilter }, tpMap, historyRoleIds, ckCtx, allHeadcount, placementLinks] = await Promise.all([
  getRolesForUser(user.email),
  getProjects(false),
  getProjectFilterOptions(),
  getTalentPartnerDisplayMap(),
  getRoleHistoryRoleIds(),
  getChecklistListContext("role"),   // N-266a — null = render as before
  getAllHeadcount(),                 // N-307 — Headcount x/y + Days Open
  getPlacementHeadcountIds(),        // N-307 — which headcount are filled
]);
  const m = rolesPageModel({
    allRoles, allProjects, userProjectIds, tpMap, allHeadcount, placementLinks, ckCtx, pendingItem, canFilter,
    filter: _rolesFilter, projectId: _rolesProjectId, search: _rolesSearch, sort: _rolesSort, pageSize: _rolesPageSize,
  });
  main.innerHTML = _rolesPageHtml(m, { canEdit: canEditRoleRows(_resolvedRole), gate: _listWriteGate(_resolvedRole, writableIds), canFilter, scopedProjects, tpMap, historyRoleIds, pendingItem });
  lucide.createIcons();
}
function _rolesPageHtml(m, o) {
  const { roles, rolesTotal, pagedRoles, projectNameOf, projectIdOf, hcSummaryOf, checklistOf, showChecklistCol, emptyMsg: rolesEmptyMsg } = m;
  const { canEdit, gate, canFilter, scopedProjects, tpMap, historyRoleIds, pendingItem } = o;
  const canAdd = canEdit && gate.any;   // N-369
  const filterBtns = Object.keys(ROLE_FILTERS).map(f =>
    `<button class="btn-filter${_rolesFilter === f ? " active" : ""}"${act('renderRolesPage', f)}>${f}</button>`
  ).join("");
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _rolesProjectId, 'setRolesProject')
    : '';
  return `
    <div class="page-header">
      <h2>Roles</h2>
      <div class="page-header-actions">
        <button class="btn-secondary"${act('showBriefingPackLibrary')}>Briefing Packs</button>
        ${canAdd ? `<button class="btn-primary"${act('showAddRoleForm')}>+ Add Role</button>` : ""}
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
        ${sortableHeader('Headcount', 'headcount', _rolesSort, 'setRolesSort')}
        ${sortableHeader('Days Open', 'daysOpen', _rolesSort, 'setRolesSort')}${showChecklistCol ? sortableHeader('Checklist', 'checklist', _rolesSort, 'setRolesSort') : ""}${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${pagedRoles.length ? pagedRoles.map(r => roleRowHtml(r, {
          projectName: projectNameOf(r) || "—",
          tpMap,
          canEdit,
          historyRoleIds,
          rolesFilter: _rolesFilter,
          readOnly: !gate.writable(projectIdOf(r)),
          pending: pendingItem ? r.id === pendingItem.id : false,
          checklist: checklistOf(r),
          showChecklistCol,
          hcSummary: pendingItem && r.id === pendingItem.id ? null : hcSummaryOf(r),
        })).join("") : emptyStateRow({
          colspan: 8 + (showChecklistCol ? 1 : 0) + (canEdit ? 1 : 0),
          icon: "briefcase",
          message: rolesEmptyMsg,
          actionLabel: canAdd ? "+ Add Role" : "",
          actionAct: canAdd ? ['showAddRoleForm'] : null,
        })}
      </tbody>
    </table>
        </div>
  `;
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
  const w = await checkRoleWrite(roleId);   // N-369
  if (!w.ok) { toast(w.reason, { type: 'error' }); return; }
  unlockStageEdit(roleId, role.Stage || '');
}
async function updateRoleStage(roleId, selectEl) {
  const prevStage = selectEl.dataset.prevValue;
  const newStage  = selectEl.value;
  const row = selectEl.closest('tr');
  // N-307: the Stage rule (D-2 / S-2) is checked BEFORE the optimistic apply,
  // and fails closed. The select never offers terminal stages, so a Cancel
  // cascade can't arise here.
  const restoreBadge = () => {
    const cell = document.getElementById(`stage-cell-${roleId}`);
    if (cell) {
      cell.innerHTML = stageBadgeHtml(roleId, prevStage, true);
      lucide.createIcons();
    }
  };
  // N-369: the project write gate first — fails closed.
  const gateCheck = await checkRoleWrite(roleId);
  if (!gateCheck.ok) {
    toast(gateCheck.reason, { type: 'error' });
    restoreBadge();
    return;
  }
  let check;
  try {
    check = await checkRoleStageChange(roleId, newStage);
  } catch (e) {
    console.warn('N-307: stage check failed for role ' + roleId, e);
    check = { ok: false, reason: "Couldn't check this role's headcount — stage not changed." };
  }
  if (!check.ok) {
    toast(check.reason, { type: 'error' });
    restoreBadge();
    return;
  }
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
  const w = await checkRoleWrite(id);   // N-369
  if (!w.ok) { toast(w.reason, { type: 'error' }); return; }
  const data = await getItem("Roles", id);
  document.getElementById("main-content").innerHTML = await renderRoleForm(data);
  const pid = data.ProjectID || data.ProjectIDLookupId;
  if (pid) loadTalentPartnersForRole(pid, data.TalentPartner || '');
}
// N-150 — "Duplicate" row action: opens the Add Role form pre-filled from an
// existing role. Always re-fetches via getItem rather than reusing the row's
// cached list data, same reasoning showEditRoleForm follows above. Stage
// resets to Backlog purely because _ROLE_COPY_FIELDS excludes it —
// renderRoleForm's own isEdit-gated Stage default (forms-role.js) does the rest.
// N-307: OpenDate is set to today (localDayISO(), local) only to seed the
// form's Headcount fieldset — dates and Backfill live on headcount now and
// are never carried from the source role.
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
  const [role, allProjects, history, tpMap, hcState] = await Promise.all([
    getItem('Roles', roleId),
    getProjects(false),
    getRoleHistory(roleId),
    getTalentPartnerDisplayMap(),
    getRoleHeadcountState(roleId),  // N-313: placements + headcount labels
  ]);
  const m = roleTimelineModel({ role, allProjects, history, hcState, now: new Date() });
  main.innerHTML = _roleTimelineHtml(role, m, tpMap);
  lucide.createIcons();
}
// Dot class plus the two label strings for one stage node.
function _roleTimelineStageText(h, i, m) {
  const { useOpenDateFlags, seq } = m;
  const cls = roleTimelineNodeClass(h.OldValue, h.NewValue, { placementSincePrev: seq.placementSincePrev[i] });
  // N-100 UAT fix (round 2): loosened from `h.OldValue === ''` — Graph/
  // SharePoint normalises a text column written as '' back to null on
  // read, so the strict empty-string check silently never matched the
  // real creation row (wrong "— → Sourcing" label, wrong 'branch'/orange
  // dot in roleTimelineNodeClass (headcount.js), and skipped the OpenDate
  // back-date since useOpenDate required isCreated). Falsy catches '',
  // null, and undefined alike; a real Stage name is never falsy, so this
  // can't misfire on an actual transition.
  const isCreated = !h.OldValue;
  const useOpenDate = useOpenDateFlags[i];
  const label = isCreated
    ? `${useOpenDate ? 'Role opened' : 'Role created'} — entered ${escHtml(h.NewValue || '—')}`
    : `${escHtml(h.OldValue || '—')} → ${escHtml(h.NewValue || '—')}${useOpenDate ? ' — role opened' : ''}`;
  // N-313: say why a backward-looking move is neutral.
  const resetNote = cls !== 'reset' ? ''
    : (h.OldValue === CONFIG.ROLE_STAGE_CLOSED ? ' — reopened' : ' — reset after placement');
  return { cls, label, resetNote };
}
function _roleTimelineStageNodeHtml(h, i, m, tpMap) {
  const { cls, label, resetNote } = _roleTimelineStageText(h, i, m);
  const effectiveChangedAt = m.effectiveDates[i];
  const next = m.stageChanges[i + 1];
  const gapLabel = next
    ? `${formatDurationDays(m.gapDays[i])} in ${escHtml(h.NewValue || '—')}`
    : `${formatDurationDays(m.gapDays[i])} in ${escHtml(h.NewValue || '—')} so far`;
    return `
      <div class="role-timeline-node role-timeline-node--${cls}">
        <div class="role-timeline-track">
          <div class="role-timeline-connector"></div>
          <div class="role-timeline-dot"></div>
        </div>
        <div class="role-timeline-content">
          <div class="role-timeline-label">${label}${resetNote}</div>
          <div class="role-timeline-meta">${spDateIn(effectiveChangedAt) || "—"} · ${escHtml(tpDisplay(h.ChangedBy, tpMap))}</div>
          <div class="role-timeline-duration${!next ? ' role-timeline-duration--ongoing' : ''}">${gapLabel}</div>
        </div>
      </div>`;
}
// N-313: one placement marker — no duration line.
function _roleTimelinePlacementNodeHtml({ placement: p, day }, m, tpMap) {
  const hcLabel = m.hcLabelById.get(String(p.HeadcountID));
    return `
      <div class="role-timeline-node role-timeline-node--placement">
        <div class="role-timeline-track">
          <div class="role-timeline-connector"></div>
          <div class="role-timeline-dot"></div>
        </div>
        <div class="role-timeline-content">
          <div class="role-timeline-label">Placement — ${escHtml(p.Title || '—')}${hcLabel ? ` · ${escHtml(hcLabel)}` : ''}</div>
          <div class="role-timeline-meta">${escHtml(day)} · ${escHtml(tpDisplay(p.TalentPartner, tpMap))}</div>
        </div>
      </div>`;
}
function _roleTimelineHtml(role, m, tpMap) {
  const { projectName, stageChanges, seq } = m;
  const nodesHtml = seq.order.map(e => e.kind === 'stage'
    ? _roleTimelineStageNodeHtml(stageChanges[e.index], e.index, m, tpMap)
    : _roleTimelinePlacementNodeHtml(e, m, tpMap)).join("");
  const undatedNote = seq.undated
    ? `<p class="role-timeline-note">${seq.undated} placement${seq.undated === 1 ? '' : 's'} without an Offer Accepted date not shown.</p>`
    : '';
  return `
    <div class="page-header">
      <h2>Role History — ${escHtml(role.RoleTitle)}</h2>
      <div class="page-header-actions"><button class="btn-secondary"${act('navigateTo', 'roles')}>← Back to Roles</button></div>
    </div>
    <p class="role-timeline-subhead">${escHtml(projectName)} · Current stage: <span class="badge">${escHtml(role.Stage || "—")}</span></p>
    <div class="role-timeline">
      ${nodesHtml || '<p style="color:var(--text-muted);">No stage history recorded.</p>'}
    </div>
    ${undatedNote}
  `;
}
// (N-313: the stage classifier moved to headcount.js:roleTimelineNodeClass; the timeline day maths is roleTimelineModel, pages-model.js.)
// ── Weekly Activity ───
let _activityProjectId = null;
let _activityRoleId    = null;
// N-093: weeks of history fetched from SharePoint. 0 = All time (no clause).
let _activityWeeks     = CONFIG.DATE_WINDOW_DEFAULT_WEEKS;
let _activityPageSize  = CONFIG.PAGE_SIZE_DEFAULT;
let _activitySort      = null;  // N-247b: { key, dir } — null = default order
let _activitySearch    = '';    // N-247b: shared list search box (list-controls.js)
async function renderActivityPage(pendingItem = null) {
  const main = document.getElementById("main-content");
  main.innerHTML = skeletonTable(6, 13);
  const user = getCurrentUser();
  const [userProjectIds, writableIds] = await Promise.all([getUserProjectIds(user.email), getUserWritableProjectIds(user.email)]);   // N-369
  const [activity, allRoles, { projects: scopedProjects, canFilter }, tpMap] = await Promise.all([
  getWeeklyActivity(null, null, { sinceWeeks: _activityWeeks }),
  getRolesForUser(user.email),
  getProjectFilterOptions(),
  getTalentPartnerDisplayMap(),
]);
  const isTalentPartner = _resolvedRole === 'talent_partner';
  const m = activityPageModel({
    activity, allRoles, userProjectIds, tpMap, isTalentPartner, canFilter, pendingItem,
    scopedEmail: isTalentPartner ? getScopedUserEmail() : null,
    projectId: _activityProjectId, roleId: _activityRoleId, search: _activitySearch, sort: _activitySort, pageSize: _activityPageSize,
  });
  main.innerHTML = _activityPageHtml(m, { canEdit: ["admin","delivery_manager","talent_partner"].includes(_resolvedRole), gate: _listWriteGate(_resolvedRole, writableIds), canFilter, scopedProjects, tpMap, pendingItem });
  lucide.createIcons();
}
function _activityPageHtml(m, o) {
  const { roleMap, filtered: filteredActivity, total: activityTotal, paged: pagedActivity, roleChoices, projectIdOf, emptyMsg: activityEmptyMsg } = m;
  const { canEdit, gate, canFilter, scopedProjects, tpMap, pendingItem } = o;
  const canAdd = canEdit && gate.any;   // N-369
  const roleOptions = [
    `<option value="" ${!_activityRoleId ? 'selected' : ''}>All Roles</option>`,
    ...roleChoices.map(c => `<option value="${c.id}" ${String(_activityRoleId) === String(c.id) ? 'selected' : ''}>${c.label}</option>`)
  ].join('');
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _activityProjectId, 'setActivityProject')
    : '';
  const roleDropdown = `<div class="form-group project-filter-select">
    <label>Role</label>
    <select${actOn('change', 'setActivityRole', ACT_VALUE)}>${roleOptions}</select>
  </div>`;
  const periodDropdown = periodFilterDropdown(_activityWeeks, 'setActivityWeeks');
  return `
    <div class="page-header">
      <h2>Weekly Activity</h2>
      ${canAdd ? '<div class="page-header-actions">' + (typeof bulkEntryAvailable === 'function' && bulkEntryAvailable() ? '<button class="btn-secondary"' + act('showBulkActivityPage') + '>Bulk log week</button>' : '') + '<button class="btn-primary"' + act('showAddActivityForm') + '>+ Log Activity</button></div>' : ""}
    </div>
    <div class="table-toolbar">
      ${listControlsBar([projDropdown, roleDropdown, periodDropdown, listSearchBox(_activitySearch, 'setActivitySearch'), pageSizeDropdown(_activityPageSize, 'setActivityPageSize')])}
    </div>
    ${listResultCount(pagedActivity.length, filteredActivity.length, activityTotal, _activityWeeks, 'activity row')}
    <table class="data-table activity-table">
      <thead><tr>
        ${sortableHeader('Year', 'year', _activitySort, 'setActivitySort')}
        ${sortableHeader('Week', 'week', _activitySort, 'setActivitySort')}
        ${sortableHeader('Role', 'role', _activitySort, 'setActivitySort')}
        ${sortableHeader('Talent Partner', 'tp', _activitySort, 'setActivitySort')}
        ${sortableHeader('Outreach', 'outreach', _activitySort, 'setActivitySort')}
        ${sortableHeader('Responses', 'responses', _activitySort, 'setActivitySort')}
        ${sortableHeader('Screened', 'screened', _activitySort, 'setActivitySort')}
        ${sortableHeader('Submitted', 'submitted', _activitySort, 'setActivitySort')}
        ${sortableHeader('IV1', 'iv1', _activitySort, 'setActivitySort')}
        ${sortableHeader('IV2+', 'iv2plus', _activitySort, 'setActivitySort')}
        ${sortableHeader('Final IV', 'finalIv', _activitySort, 'setActivitySort')}
        ${sortableHeader('Offers', 'offers', _activitySort, 'setActivitySort')}
        ${sortableHeader('Hires', 'hires', _activitySort, 'setActivitySort')}
        ${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${pagedActivity.length ? pagedActivity.map(a => activityRowHtml(a, {
          roleMap,
          tpMap,
          canEdit,
          readOnly: !gate.writable(projectIdOf(a)),
          pending: pendingItem ? a.id === pendingItem.id : false,
        })).join("") : emptyStateRow({
          colspan: canEdit ? 14 : 13,
          icon: "activity",
          message: activityEmptyMsg,
          actionLabel: canAdd ? "+ Log Activity" : "",
          actionAct: canAdd ? ['showAddActivityForm'] : null,
        })}
      </tbody>
    </table>
  `;
}
function setActivityWeeks(val) { _activityWeeks = Number(val); renderActivityPage(); }
function setActivityPageSize(val) { _activityPageSize = Number(val); renderActivityPage(); }
function setActivityProject(val) { _activityProjectId = val || null; _activityRoleId = null; renderActivityPage(); }
function setActivityRole(val) { _activityRoleId = val || null; renderActivityPage(); }
// N-247b: debounced re-render, same shape as Roles' _debouncedRenderRolesPage.
const _debouncedRenderActivityPage = debounce(async () => { await renderActivityPage(); focusListSearchBox(); }, 250);
function setActivitySearch(val) { _activitySearch = val || ''; _debouncedRenderActivityPage(); }
// N-247b: re-renders through renderActivityPage like the setters above
// (cached fetch, same skeleton flash). Focus goes back to the clicked
// header once the new table is in place.
async function setActivitySort(key) { _activitySort = nextSortState(_activitySort, key); await renderActivityPage(); focusSortHeader(key); }
// N-146 — preselectedRoleId/preselectedProjectId let the Command Bar's
// Log activity row action pre-scope the form to a role, same shape as
// showAddPlacementForm below.
async function showAddActivityForm(preselectedRoleId = null, preselectedProjectId = null) {
  document.getElementById("main-content").innerHTML = await renderWeeklyActivityForm(null, preselectedRoleId, preselectedProjectId);
}
async function showEditActivityForm(id) {
  const data = await getItem("WeeklyActivity", id);
  // N-369: the row's role decides its project (as the list scope does); else the row's own ProjectID.
  const w = await (data.RoleIDLookupId ? checkRoleWrite(data.RoleIDLookupId) : checkProjectWrite(data.ProjectIDLookupId));
  if (!w.ok) { toast(w.reason, { type: 'error' }); return; }
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
let _placementSort      = null;  // N-247b: { key, dir } — null = default order
let _placementSearch    = '';    // N-247b: shared list search box (list-controls.js)
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
  const [userProjectIds, writableIds] = await Promise.all([getUserProjectIds(user.email), getUserWritableProjectIds(user.email)]);   // N-369
  // N-340: the Talent Partner column is for Admin and Delivery Manager only —
  // a Talent Partner can only see their own placements. Allow-list on
  // _resolvedRole (not `!== 'talent_partner'`) so Admin ghost-mode-as-a-TP
  // sees exactly what that TP sees.
  const showTp = _resolvedRole === 'admin' || _resolvedRole === 'delivery_manager';
  const [allPlacements, allRoles, { projects: scopedProjects, canFilter }, tpMap] = await Promise.all([
    // N-093 / N-151: the query is bounded by the background date window and,
    // when one is active, by the month/quarter/year selection — whichever is
    // LOOSER (see listQueryFromDay). placementInFilter() applies the exact
    // test in the model, so this can only ever over-fetch.
    getPlacements(null, { fromDay: listQueryFromDay(
      weeksAgoDay(_placementWeeks), placementFilterCutoff(_placementFilter)) }),
    getRolesForUser(user.email),
    getProjectFilterOptions(),
    showTp ? getTalentPartnerDisplayMap() : Promise.resolve({}),
  ]);
  const isTalentPartner = _resolvedRole === 'talent_partner';
  const m = placementsPageModel({
    allPlacements, allRoles, userProjectIds, tpMap, showTp, isTalentPartner, canFilter, pendingItem,
    scopedEmail: isTalentPartner ? getScopedUserEmail() : null,
    projectId: _placementProjectId, filter: _placementFilter, search: _placementSearch, sort: _placementSort, pageSize: _placementPageSize,
  });
  main.innerHTML = _placementsPageHtml(m, { canEdit: ["admin","delivery_manager","talent_partner"].includes(_resolvedRole), gate: _listWriteGate(_resolvedRole, writableIds), canFilter, scopedProjects, showTp, tpMap, pendingItem });
  lucide.createIcons();
}
function _placementFilterRowsHtml() {
  const monthBtns = PLACEMENT_MONTHS.map((m, i) =>
    `<button class="btn-filter${_placementFilter.type === "month" && _placementFilter.value === i ? " active" : ""}"${act('setPlacementFilter', 'month', i)}>${m}</button>`
  ).join("");
  const quarterBtns = [1,2,3,4].map(q =>
    `<button class="btn-filter${_placementFilter.type === "quarter" && _placementFilter.value === q ? " active" : ""}"${act('setPlacementFilter', 'quarter', q)}>Q${q}</button>`
  ).join("");
  const yearBtns = PLACEMENT_YEARS.map(y =>
    `<button class="btn-filter${_placementFilter.type === "year" && _placementFilter.value === y ? " active" : ""}"${act('setPlacementFilter', 'year', y)}>${y}</button>`
  ).join("");
  return `<div class="placement-filter-rows">
        <div class="placement-filter-row">
          <div class="filter-labeled-group"><span class="filter-label">Month</span><div class="filter-group">${monthBtns}</div></div>
        </div>
        <div class="placement-filter-row">
          <div class="filter-labeled-group"><span class="filter-label">Quarter</span><div class="filter-group">${quarterBtns}</div></div>
          <div class="filter-labeled-group"><span class="filter-label">Year</span><div class="filter-group">${yearBtns}</div></div>
        </div>
      </div>`;
}
function _placementsPageHtml(m, o) {
  const { roleMap, scopedPlacements, placements, paged: pagedPlacements, projectIdOf } = m;
  const { canEdit, gate, canFilter, scopedProjects, showTp, tpMap, pendingItem } = o;
  const canAdd = canEdit && gate.any;   // N-369
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _placementProjectId, 'setPlacementProject')
    : '';
  const periodDropdown = periodFilterDropdown(_placementWeeks, 'setPlacementWeeks');
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
  return `
    <div class="page-header">
      <h2>Placements</h2>
      <div class="page-header-actions">
        ${canAdd ? `<button class="btn-primary"${act('showAddPlacementForm')}>+ Record Placement</button>` : ""}
      </div>
    </div>
    <div class="table-toolbar">
      ${listControlsBar([projDropdown, periodDropdown, listSearchBox(_placementSearch, 'setPlacementSearch'), pageSizeDropdown(_placementPageSize, 'setPlacementPageSize')])}
      ${_placementFilterRowsHtml()}
    </div>
    ${resultCount}
    <table class="data-table">
      <thead><tr>
        ${sortableHeader('Candidate', 'candidate', _placementSort, 'setPlacementSort')}
        ${sortableHeader('Role', 'role', _placementSort, 'setPlacementSort')}
        ${sortableHeader('Salary', 'salary', _placementSort, 'setPlacementSort')}
        ${sortableHeader('Offer Accepted', 'offerAccepted', _placementSort, 'setPlacementSort')}
        ${sortableHeader('Start Date', 'startDate', _placementSort, 'setPlacementSort')}
        ${sortableHeader('Time to Hire', 'timeToHire', _placementSort, 'setPlacementSort')}
        ${showTp ? sortableHeader('Talent Partner', 'talentPartner', _placementSort, 'setPlacementSort') : ""}
        ${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${pagedPlacements.length ? pagedPlacements.map(p => placementRowHtml(p, {
          roleMap,
          canEdit,
          showTp,
          tpMap,
          readOnly: !gate.writable(projectIdOf(p)),
          pending: pendingItem ? p.id === pendingItem.id : false,
        })).join("") : emptyStateRow({
          colspan: 6 + (showTp ? 1 : 0) + (canEdit ? 1 : 0),
          icon: "user-check",
          message: placementsEmptyMsg,
          actionLabel: canAdd ? "+ Record Placement" : "",
          actionAct: canAdd ? ['showAddPlacementForm'] : null,
        })}
      </tbody>
    </table>
  `;
}
function setPlacementProject(val) { _placementProjectId = val || null; renderPlacementsPage(); }
function setPlacementWeeks(val) { _placementWeeks = Number(val); renderPlacementsPage(); }
function setPlacementPageSize(val) { _placementPageSize = Number(val); renderPlacementsPage(); }
// N-247b: debounced re-render, same shape as Roles' _debouncedRenderRolesPage.
const _debouncedRenderPlacementsPage = debounce(async () => { await renderPlacementsPage(); focusListSearchBox(); }, 250);
function setPlacementSearch(val) { _placementSearch = val || ''; _debouncedRenderPlacementsPage(); }
async function setPlacementSort(key) { _placementSort = nextSortState(_placementSort, key); await renderPlacementsPage(); focusSortHeader(key); }
// N-146 — preselectedRoleId/preselectedProjectId let the Command Bar's
// Add placement row action pre-scope the form to a role; renderPlacementForm
// already accepts them (N-145's logged-hire flow uses the same params).
async function showAddPlacementForm(preselectedRoleId = null, preselectedProjectId = null) {
  document.getElementById("main-content").innerHTML = await renderPlacementForm(null, preselectedRoleId, preselectedProjectId);
}
async function showEditPlacementForm(id) {
  const data = await getItem("Placements", id);
  const w = await checkRoleWrite(data.RoleIDLookupId);   // N-369
  if (!w.ok) { toast(w.reason, { type: 'error' }); return; }
  document.getElementById("main-content").innerHTML = await renderPlacementForm(data);
}
// ── Rejected Offers ───────────────────────────────────────────────────
let _rejectionsProjectId = null;
let _rejectionsWeeks     = CONFIG.REJECTIONS_DEFAULT_WEEKS;
let _rejectionsPageSize  = CONFIG.PAGE_SIZE_DEFAULT;
let _rejectionsSort      = null;  // N-247b: { key, dir } — null = default order
let _rejectionsSearch    = '';    // N-247b: shared list search box (list-controls.js)
// N-388 (DA-8): 'list' = the candidate list, 'intel' = Rejection Intelligence. _rejIntelToken is bumped
// by every render so a slow Intelligence load that lands after a tab / period change is dropped.
let _rejectionsTab       = 'list';
let _rejIntelDim         = 'project';
let _rejIntelToken       = 0;
async function renderRejectionsPage(pendingItem = null) {
  _rejIntelToken++;   // N-388: any render supersedes an in-flight Intelligence load
  const canList  = canViewRejectionsList(_resolvedRole);
  const canIntel = canViewRejectionIntel(_resolvedRole);
  if (pendingItem && canList) _rejectionsTab = 'list';
  // Leadership: the Intelligence tab only. This returns BEFORE the list fetch below, so no
  // candidate-level row is ever read for them.
  if (canIntel && (!canList || _rejectionsTab === 'intel')) return renderRejectionIntelTab(canList);
  const main = document.getElementById("main-content");
  main.innerHTML = skeletonTable(6, 6);
  const user = getCurrentUser();
  const [userProjectIds, writableIds] = await Promise.all([getUserProjectIds(user.email), getUserWritableProjectIds(user.email)]);   // N-369
  const [rejections, allRoles, { projects: scopedProjects, canFilter }] = await Promise.all([
    // N-152: bounded ONLY when the user picks a window. The default is 0
    // (All time) and must stay that way — a `ge` bound cannot match a null
    // RejectionDate, so a bounded default would silently drop the rows that
    // were deliberately never backfilled. See CONFIG.REJECTIONS_DEFAULT_WEEKS.
    getRejectedOffers(null, { fromDay: weeksAgoDay(_rejectionsWeeks) }),
    getRolesForUser(user.email),
    getProjectFilterOptions(),
  ]);
  const isTalentPartner = _resolvedRole === 'talent_partner';
  const m = rejectionsPageModel({
    rejections, allRoles, userProjectIds, isTalentPartner, canFilter, pendingItem,
    scopedEmail: isTalentPartner ? getScopedUserEmail() : null,
    projectId: _rejectionsProjectId, search: _rejectionsSearch, sort: _rejectionsSort, pageSize: _rejectionsPageSize,
  });
  main.innerHTML = _rejectionsPageHtml(m, { canEdit: ["admin","delivery_manager","talent_partner"].includes(_resolvedRole), gate: _listWriteGate(_resolvedRole, writableIds), canFilter, scopedProjects, pendingItem, tabBar: canIntel ? rejectionsTabBarHtml('list') : '' });
  lucide.createIcons();
}
// N-388 (DA-8): the Rejection Intelligence tab. Own skeleton, own load; the period dropdown is the
// page's shared one (setRejectionsWeeks re-renders whichever tab is active). No project filter,
// search box or page size: those belong to the candidate list.
async function renderRejectionIntelTab(showTabs) {
  const main  = document.getElementById("main-content");
  const token = _rejIntelToken;
  main.innerHTML = `${showTabs ? rejectionsTabBarHtml('intel') : ''}
    <div class="page-header">
      <h2>Rejected Offers</h2>
    </div>
    <div class="table-toolbar">
      ${listControlsBar([periodFilterDropdown(_rejectionsWeeks, 'setRejectionsWeeks')])}
    </div>
    <div id="rej-intel-body">${skeletonTable(6, 5)}</div>`;
  lucide.createIcons();
  try {
    const inputs = await getRejectionIntelInputs(getCurrentUser().email, { weeks: _rejectionsWeeks, role: _resolvedRole });
    await new Promise(resolve => setTimeout(resolve, 0));
    if (token !== _rejIntelToken) return;
    const includeFigures = canViewRejectionIntelFigures(_resolvedRole);
    const summary = rejectionIntelSummary({
      rejections: inputs.rejections, roles: inputs.roles, activity: inputs.activity,
      models: inputs.models, lciRows: inputs.lciRows, includeFigures,
    });
    const model = rejectionIntelPageModel({
      summary, projects: inputs.projects, dim: _rejIntelDim, includeFigures,
      benchmarkUnavailable: inputs.benchmarkUnavailable, weeks: _rejectionsWeeks,
    });
    const body = document.getElementById('rej-intel-body');
    if (body) { body.innerHTML = rejectionIntelTabHtml(model, { dim: _rejIntelDim }); lucide.createIcons(); }
  } catch (e) {
    console.warn('N-388: Rejection Intelligence failed', e);
    const body = document.getElementById('rej-intel-body');
    if (token === _rejIntelToken && body) body.innerHTML = rejectionIntelUnavailableHtml('Rejection Intelligence');
  }
}
function _rejectionsPageHtml(m, o) {
  const { roleMap, filtered: filteredRejections, total: rejectionsTotal, paged: pagedRejections, projectIdOf, emptyMsg: rejectionsEmptyMsg } = m;
  const { canEdit, gate, canFilter, scopedProjects, pendingItem, tabBar } = o;
  const canAdd = canEdit && gate.any;   // N-369
  const projDropdown = canFilter
    ? projectFilterDropdown(scopedProjects, _rejectionsProjectId, 'setRejectionsProject')
    : '';
  return `${tabBar || ''}
    <div class="page-header">
      <h2>Rejected Offers</h2>
      ${canAdd ? `<div class="page-header-actions"><button class="btn-primary"${act('showAddRejectionForm')}>+ Log Rejection</button></div>` : ""}
    </div>
    <div class="table-toolbar">
      ${listControlsBar([projDropdown, periodFilterDropdown(_rejectionsWeeks, 'setRejectionsWeeks'), listSearchBox(_rejectionsSearch, 'setRejectionsSearch'), pageSizeDropdown(_rejectionsPageSize, 'setRejectionsPageSize')])}
    </div>
    ${listResultCount(pagedRejections.length, filteredRejections.length, rejectionsTotal, _rejectionsWeeks, 'rejection')}
    <table class="data-table">
      <thead><tr>
        ${sortableHeader('Candidate', 'candidate', _rejectionsSort, 'setRejectionsSort')}
        ${sortableHeader('Role', 'role', _rejectionsSort, 'setRejectionsSort')}
        ${sortableHeader('Rejected', 'rejected', _rejectionsSort, 'setRejectionsSort')}
        ${sortableHeader('Salary Offered', 'salaryOffered', _rejectionsSort, 'setRejectionsSort')}
        ${sortableHeader('Reason', 'reason', _rejectionsSort, 'setRejectionsSort')}
        ${sortableHeader('Notes', 'notes', _rejectionsSort, 'setRejectionsSort')}${canEdit ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${pagedRejections.length ? pagedRejections.map(r => rejectionRowHtml(r, {
          roleMap,
          canEdit,
          readOnly: !gate.writable(projectIdOf(r)),
          pending: pendingItem ? r.id === pendingItem.id : false,
        })).join("") : emptyStateRow({
          colspan: canEdit ? 7 : 6,
          icon: "user-x",
          message: rejectionsEmptyMsg,
          actionLabel: canAdd ? "+ Log Rejection" : "",
          actionAct: canAdd ? ['showAddRejectionForm'] : null,
        })}
      </tbody>
    </table>
  `;
}
function setRejectionsProject(val) { _rejectionsProjectId = val || null; renderRejectionsPage(); }
function setRejectionsWeeks(val) { _rejectionsWeeks = Number(val); renderRejectionsPage(); }
function setRejectionsPageSize(val) { _rejectionsPageSize = Number(val); renderRejectionsPage(); }
// N-247b: debounced re-render, same shape as Roles' _debouncedRenderRolesPage.
const _debouncedRenderRejectionsPage = debounce(async () => { await renderRejectionsPage(); focusListSearchBox(); }, 250);
function setRejectionsSearch(val) { _rejectionsSearch = val || ''; _debouncedRenderRejectionsPage(); }
async function setRejectionsSort(key) { _rejectionsSort = nextSortState(_rejectionsSort, key); await renderRejectionsPage(); focusSortHeader(key); }
// N-388: tab and dimension switches. Only the active tab renders, so the list's filters are untouched.
function setRejectionsTab(tab) { _rejectionsTab = tab === 'intel' ? 'intel' : 'list'; renderRejectionsPage(); }
function setRejectionIntelDim(dim) { _rejIntelDim = ['project', 'location', 'discipline'].includes(dim) ? dim : 'project'; renderRejectionsPage(); }
async function showAddRejectionForm() {
  document.getElementById("main-content").innerHTML = await renderRejectedOfferForm();
}
async function showEditRejectionForm(id) {
  const data = await getItem("RejectedOffers", id);
  const w = await checkRoleWrite(data.RoleIDLookupId);   // N-369
  if (!w.ok) { toast(w.reason, { type: 'error' }); return; }
  document.getElementById("main-content").innerHTML = await renderRejectedOfferForm(data);
}

// N-302a: delegated actions this file owns that shared markup calls (js/actions.js).
// Later N-302 sub-tasks add their own names to this call; never register a name twice.
registerActions({
  updateRoleStage,
  unlockStageEdit,
  showAddProjectForm,
  showAddRoleForm,
  showAddActivityForm,
  showAddPlacementForm,
  showAddRejectionForm,
  setRolesProject,
  setRolesSearch,
  setRolesPageSize,
  setRolesSort,
  setActivityProject,
  setActivityWeeks,
  setActivitySearch,
  setActivityPageSize,
  setActivitySort,
  setPlacementProject,
  setPlacementWeeks,
  setPlacementSearch,
  setPlacementPageSize,
  setPlacementSort,
  setRejectionsProject,
  setRejectionsWeeks,
  setRejectionsSearch,
  setRejectionsPageSize,
  setRejectionsSort,
  setRejectionsTab,
  setRejectionIntelDim,
  // N-302b: row actions, filters and page headers on the Reporting lists.
  showEditProjectForm,
  showEditRoleForm,
  showDuplicateRoleForm,
  showRoleTimeline,
  showEditActivityForm,
  showEditPlacementForm,
  showEditRejectionForm,
  renderProjectsPage,
  renderRolesPage,
  setActivityRole,
  setPlacementFilter,
  showBulkActivityPage,
});
