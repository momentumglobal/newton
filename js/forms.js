// js/forms.js — Data entry forms
// ── Utilities ───────────────────────────────────────────────────────
function showFormError(formId, message) {
  const el = document.getElementById(`${formId}-error`);
  if (el) { el.textContent = message; el.style.display = 'block'; }
}
function clearFormError(formId) {
  const el = document.getElementById(`${formId}-error`);
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}
// ── Project Form ────────────────────────────────────────────────────
function renderProjectForm(existingData = null) {
  const isEdit = !!existingData;
  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Project' : 'Add Project'}</h2>
      <div id="project-form-error" class="form-error"></div>
      <form id="project-form" onsubmit="submitProjectForm(event, ${existingData?.id || 'null'})">
        <div class="form-group">
          <label>Customer Name *</label>
          <input type="text" name="CustomerName" required
            value="${escAttr(existingData?.CustomerName || '')}">
        </div>
        <div class="form-group">
          <label>Delivery Manager</label>
          <select name="DeliveryManager" id="project-dm-select">
            <option value="">-- Unassigned --</option>
          </select>
        </div>
        <div class="form-group">
          <label>Status *</label>
          <select name="Status" required>
            <option value="Active" ${existingData?.Status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="Transition" ${existingData?.Status === 'Transition' ? 'selected' : ''}>Transition</option>
            <option value="Completed" ${existingData?.Status === 'Completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="form-group">
          <label>Project Type *</label>
          <select name="ProjectType" required>
            ${CONFIG.PROJECT_TYPES.map(t => `
            <option value="${escAttr(t)}" ${
              (existingData?.ProjectType === t
                || (!existingData?.ProjectType && t === 'Embedded')) ? 'selected' : ''
            }>${escHtml(t)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Start Date</label>
            <input type="date" name="StartDate"
              value="${escAttr(spDateIn(existingData?.StartDate) || '')}">
          </div>
          <div class="form-group">
            <label>End Date</label>
            <input type="date" name="EndDate"
              value="${escAttr(spDateIn(existingData?.EndDate) || '')}">
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="Notes" rows="3">${escHtml(existingData?.Notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Add Project'}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('projects')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}
async function submitProjectForm(event, editId = null) {
  event.preventDefault();
  clearFormError('project-form');
  const form = document.getElementById('project-form');
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    Title:           data.CustomerName,
    DeliveryManager: data.DeliveryManager,
    Status:          data.Status,
    ProjectType:     data.ProjectType,
    StartDate:       isoDate(data.StartDate) || undefined,
    EndDate:         isoDate(data.EndDate) || undefined,
    Notes:           data.Notes || undefined,
  };
  if (editId) {
    // N-218a: optimistic insert is a create-only concept -- editing an
    // existing project is unaffected, unchanged from before this task.
    try {
      await updateItem('Projects', editId, fields);
      navigateTo('projects');
    } catch (e) {
      clearButtonLoading(btn);
      showFormError('project-form', `Error saving project: ${e.message}`);
    }
    return;
  }
  try {
    await optimisticWrite({
      apply: () => {
        const pendingItem = { id: pendingRowId(), ...normaliseFields('Projects', fields) };
        navigateTo('projects', pendingItem);
      },
      revert: async () => { await renderProjectsPage(_projectsFilter); },
      commit: () => createItem('Projects', fields),
      errorMessage: 'Error saving project — change reverted.',
    });
    await renderProjectsPage(_projectsFilter);
  } catch (e) {
    // optimisticWrite() already reverted the view and showed a Retry toast.
  }
}
// ── Role Form ────────────────────────────────────────────────────────
// N-150: isDuplicate decouples "is this an edit" from "was prefill data
// supplied" — Duplicate opens this same form pre-filled from the source
// role's data but must still render as Add Role (new item), not Edit Role.
async function renderRoleForm(existingData = null, preselectedProjectId = null, isDuplicate = false) {
  const isEdit = !!existingData && !isDuplicate;
  const currentUser = getCurrentUser();
  const email = currentUser.email;
  const userRole = await getEffectiveRole(email);
  const canAssign = ['admin', 'delivery_manager'].includes(userRole) || hasDMGrant();
  const isTalentPartner = userRole === 'talent_partner';
  const projects = await getScopedProjects(email, false);
  const lockProject = isTalentPartner && projects.length === 1;
  const selectedProjectId = existingData?.ProjectIDLookupId ?? existingData?.ProjectID ?? preselectedProjectId ?? '';
  // N-112: only Active/Transition projects are selectable; a Completed project
  // that's already selected (editing an old record) stays visible so the edit
  // doesn't silently lose its project.
  let selectableProjects = sortProjectsByName(projects.filter(isProjectActive));
  if (selectedProjectId && !selectableProjects.some(p => String(p.id) === String(selectedProjectId))) {
    const existingProject = projects.find(p => String(p.id) === String(selectedProjectId));
    if (existingProject) selectableProjects = sortProjectsByName([...selectableProjects, existingProject]);
  }
  const projectOptions = buildProjectOptionsHtml(selectableProjects, selectedProjectId);
  // Pre-load function areas (global — not scoped to project)
  let departmentOptions = '<option value="">-- Select functional area --</option>';
  try {
    const depts = (await getDepartments()).sort((a, b) => a.DepartmentName.localeCompare(b.DepartmentName));
    departmentOptions = '<option value="">-- Select functional area --</option>' +
      depts.map(d =>
        `<option value="${escAttr(d.DepartmentName)}" ${existingData?.Department === d.DepartmentName ? 'selected' : ''}>${escHtml(d.DepartmentName)}</option>`
      ).join('');
  } catch (e) { /* fall back to empty */ }
  // N-250a: open 'Additional details' on Edit/Duplicate when any of its
  // fields already holds a value, so existing data is never hidden.
  // N-307: Backfill moved to the Headcount fieldset (it's per headcount, D-4).
  const showAdditional = ['Priority', 'Notes']
    .some(k => existingData?.[k] != null && existingData[k] !== '');
  // N-307: Edit shows the role's headcount (managed on the role page) and
  // disables Closed while any is open (D-2 — a hint only; submitRoleForm
  // re-checks through checkRoleStageChange). A failed read just shows '—'.
  let hcCounts = null;
  if (isEdit) {
    try {
      hcCounts = (await getRoleHeadcountState(existingData.id)).counts;
    } catch (e) {
      console.warn('N-307: headcount read failed for role ' + existingData.id, e);
    }
  }
  const targetDays = CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays;

  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Role' : 'Add Role'}</h2>
      <div id="role-form-error" class="form-error"></div>
      <form id="role-form" onsubmit="submitRoleForm(event, ${existingData?.id || 'null'})">
        <fieldset class="form-section">
          <legend class="form-section-title">Basics</legend>
          <div class="form-group">
            <label>Project *</label>
            ${lockProject ? `
            <input type="text" value="${escAttr(projects[0].CustomerName)}" disabled style="background:var(--surface-sunken);color:var(--text-label);">
            <input type="hidden" name="ProjectID" value="${projects[0].id}">` : `
            <select name="ProjectID" required onchange="${canAssign ? 'loadTalentPartnersForRole(this.value)' : ''}">
              <option value="">-- Select project --</option>
              ${projectOptions}
            </select>`}
          </div>
          <div class="form-group">
            <label>Role Title *</label>
            <input type="text" name="RoleTitle" required
              value="${escAttr(existingData?.RoleTitle || '')}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Functional Area *</label>
              <select name="Department" id="role-department-select" required>
                ${departmentOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Stage *</label>
              <select name="Stage" required>
                ${(isEdit ? CONFIG.ROLE_STAGES : reopenStageOptions())   // N-307 S-6: no terminal stage on Add/Duplicate
                  .map(s => {
                    // New roles start at Backlog by design (Role Backlog KPI, Roles page
                    // Backlog tab). State it explicitly — don't rely on the browser
                    // selecting the first option, which a reorder would silently change.
                    // Matches mobile-roleform.js:59.
                    const sel = isEdit ? existingData.Stage === s : s === 'Backlog';
                    const closeBlocked = isEdit && s === CONFIG.ROLE_STAGE_CLOSED &&
                      existingData.Stage !== s && hcCounts && hcCounts.open > 0;
                    return `<option value="${s}" ${sel ? 'selected' : ''}${closeBlocked ? ' disabled' : ''}>${closeBlocked ? `${s} (${hcCounts.open} open headcount)` : s}</option>`;
                  })
                  .join('')}
              </select>
            </div>
          </div>
        </fieldset>
        <fieldset class="form-section">
          <legend class="form-section-title">Ownership</legend>
          ${canAssign ? `
          <div class="form-group">
            <label>Assign to * <span style="font-weight:normal;color:var(--text-muted);">(tick one or more)</span></label>
            <div id="role-tp-select" class="print-avoid-break" style="border:1px solid var(--border-strong);border-radius:4px;padding:8px;max-height:170px;overflow-y:auto;background:var(--surface);">
              <span style="color:var(--text-muted);">-- Select project first --</span>
            </div>
          </div>` : `<input type="hidden" name="TalentPartnerName" value="${escAttr(currentUser.email)}">`}
          <div class="form-group">
            <label>Hiring Manager</label>
            <input type="text" name="HiringManager"
              value="${escAttr(existingData?.HiringManager || '')}">
          </div>
        </fieldset>
        <fieldset class="form-section">
          <legend class="form-section-title">Commercial</legend>
          <div class="form-group">
            <label>Location *</label>
            <select name="Location" id="role-location-select" onchange="updateCurrencyFromLocation(this.value)" required>
              <option value="">-- Select location --</option>
              ${Object.keys(CONFIG.COUNTRY_CURRENCY).sort().map(country =>
                `<option value="${escAttr(country)}" ${existingData?.Location === country ? 'selected' : ''}>${escHtml(country)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Budget (per head)</label>
              <input type="text" name="Budget"
                value="${escAttr(existingData?.Budget || '')}">
            </div>
            <div class="form-group">
              <label>Currency</label>
              <input type="text" id="role-currency-display" name="Currency" readonly
                style="background:var(--surface-sunken);color:var(--text-label);"
                value="${escAttr(existingData?.Location ? (CONFIG.COUNTRY_CURRENCY[existingData.Location] || '') : '')}"
                placeholder="Auto-filled from location">
            </div>
          </div>
        </fieldset>
        ${isEdit ? `
        <fieldset class="form-section">
          <legend class="form-section-title">Headcount</legend>
          <p class="form-section-note">
            Headcount: ${escHtml(hcCounts ? headcountXYTitle(hcCounts) : '—')} ·
            <a href="#" onclick="openRolePage(${Number(existingData.id)}); return false;">Manage on the role page</a>
          </p>
        </fieldset>` : `
        <fieldset class="form-section">
          <legend class="form-section-title">Headcount</legend>
          <p class="form-section-note">Applied to each new headcount. Edit them one by one on the role page.</p>
          <div class="form-row">
            <div class="form-group">
              <label># of Headcount *</label>
              <input type="number" name="HeadcountCount" min="1" max="${CONFIG.HEADCOUNT.maxPerAdd}" step="1" value="1" required>
            </div>
            <div class="form-group">
              <label>Backfill?</label>
              <select name="HcBackfill">
                <option value="">--</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Open Date</label>
              <input type="date" name="HcOpenDate" id="role-open-date"
                onchange="autoFillTargetDate()"
                value="${escAttr(isDuplicate ? (spDateIn(existingData?.OpenDate) || '') : '')}">
            </div>
            <div class="form-group">
              <label>Target Hire Date (auto: Open + ${targetDays}d)</label>
              <input type="date" name="HcTargetHireDate" id="role-target-date"
                value="${escAttr(isDuplicate ? (defaultTargetHireDate(spDateIn(existingData?.OpenDate)) || '') : '')}">
            </div>
          </div>
        </fieldset>`}
        <details class="form-section form-section--collapsible" ${showAdditional ? 'open' : ''}>
          <summary class="form-section-title">Additional details <span class="form-section-hint">optional</span></summary>
          <div class="form-row">
            <div class="form-group">
              <label>Priority</label>
              <select name="Priority">
                <option value="">--</option>
                <option value="1" ${existingData?.Priority == 1 ? 'selected' : ''}>1 — High</option>
                <option value="2" ${existingData?.Priority == 2 ? 'selected' : ''}>2 — Medium</option>
                <option value="3" ${existingData?.Priority == 3 ? 'selected' : ''}>3 — Low</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea name="Notes" rows="3">${escHtml(existingData?.Notes || '')}</textarea>
          </div>
        </details>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Add Role'}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('roles')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

function autoFillTargetDate() {
  const open = document.getElementById('role-open-date').value;
  const target = document.getElementById('role-target-date');
  if (open && !target.value) {
    target.value = defaultTargetHireDate(open) || '';   // N-307: Open + timeToHireDays
  }
}

function updateCurrencyFromLocation(country) {
  const currencyEl = document.getElementById('role-currency-display');
  if (currencyEl) currencyEl.value = CONFIG.COUNTRY_CURRENCY[country] || '';
}

async function loadDeliveryManagersForProject(selectedEmail) {
  const select = document.getElementById('project-dm-select');
  if (!select) return;
  try {
    const users = await getAllAssignableUsers();
    const sel = (selectedEmail || '').toLowerCase();
    select.innerHTML = '<option value="">-- Unassigned --</option>' +
      users.map(u => `<option value="${escAttr(u.UserEmail)}" ${
        u.UserEmail?.toLowerCase() === sel ? 'selected' : ''
      }>${escHtml(u.UserName || u.UserEmail)}</option>`).join('');
  } catch (e) {
    select.innerHTML = '<option value="">-- Error loading team --</option>';
  }
}

async function loadTalentPartnersForRole(projectId, selected = '') {
  const box = document.getElementById('role-tp-select');
  if (!box) return;
  if (!projectId) {
    box.innerHTML = '<span style="color:var(--text-muted);">-- Select project first --</span>';
    return;
  }
  box.innerHTML = '<span style="color:var(--text-muted);">Loading...</span>';
  try {
    const tps = await getTalentPartnersForProject(projectId);
    const pre = tpList(selected);
    const mine = getCurrentUser().email.toLowerCase();
    const checked = e => pre.length ? pre.includes(e) : e === mine;
    box.innerHTML = tps.map(u => `
      <label style="display:block;font-weight:normal;margin:3px 0;cursor:pointer;">
        <input type="checkbox" name="TalentPartnerName" value="${escAttr(u.UserEmail)}"
          ${checked((u.UserEmail || '').toLowerCase()) ? 'checked' : ''}>
        ${escHtml(u.UserName || u.UserEmail)}
      </label>`).join('') || '<span style="color:var(--text-muted);">-- No team members --</span>';
  } catch(e) {
    box.innerHTML = '<span style="color:var(--status-danger-text);">-- Error loading team --</span>';
  }
}

async function submitRoleForm(event, editId = null) {
  event.preventDefault();
  clearFormError('role-form');
  const form = document.getElementById('role-form');
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const fd   = new FormData(form);
  const data = Object.fromEntries(fd);
  const tpJoined = fd.getAll('TalentPartnerName').filter(Boolean).join(';');
  if (!tpJoined) {
    clearButtonLoading(btn);
    showFormError('role-form', 'Please assign at least one Talent Partner.');
    return;
  }
  const fields = {
    ProjectIDLookupId: parseInt(data.ProjectID),
    Title:          data.RoleTitle,
    HiringManager:  data.HiringManager || undefined,
    TalentPartner:  tpJoined,
    Budget:         data.Budget ? parseFloat(data.Budget) : undefined,
    Currency:       data.Location || undefined,
    Priority:       data.Priority ? parseInt(data.Priority) : undefined,
    Stage:          data.Stage,
    Department:     data.Department || undefined,
    Notes:          data.Notes || undefined,
  };
  // N-307: dates + Backfill are headcount fields (D-4) — the Add/Duplicate
  // form's Headcount fieldset applies them to each of the n new headcount.
  // Deliberately separate objects, built after `fields` —
  // tests/lint-role-copy-fields.js parses `const fields = {`.
  const headcountCount  = clampHeadcountCount(data.HeadcountCount);
  const headcountValues = {
    OpenDate:       isoDate(data.HcOpenDate) || undefined,
    TargetHireDate: isoDate(data.HcTargetHireDate) || undefined,
    Backfill:       data.HcBackfill === 'Yes' ? true : data.HcBackfill === 'No' ? false : undefined,
  };
  if (editId) {
    // N-218a: optimistic insert is a create-only concept -- editing an
    // existing role is unaffected, unchanged from before this task.
    // N-307: the Stage rule (D-1 / D-2 / S-2) runs first and fails closed.
    let check;
    try {
      check = await checkRoleStageChange(editId, fields.Stage);
    } catch (e) {
      clearButtonLoading(btn);
      showFormError('role-form', "Couldn't check this role's headcount — nothing saved. Please try again.");
      return;
    }
    if (!check.ok) {
      clearButtonLoading(btn);
      showFormError('role-form', check.reason);
      return;
    }
    if (check.cascadeCancel) {
      const ok = await confirmModal({
        title:        'Cancel pipeline',
        message:      `This also cancels ${check.counts.open} open headcount.`,
        confirmLabel: 'Cancel pipeline',
        cancelLabel:  'Keep',
        danger:       true,
      });
      if (!ok) { clearButtonLoading(btn); return; }
    }
    try {
      await updateRoleWithHistory(editId, fields);
    } catch (e) {
      clearButtonLoading(btn);
      showFormError('role-form', `Error saving role: ${e.message}`);
      return;
    }
    // The role is saved — headcount follow-ups only toast on failure.
    try {
      await syncHeadcountProject(editId, fields.ProjectIDLookupId);
    } catch (e) {
      console.warn('N-307: headcount project sync failed for role ' + editId, e);
      toast('Role saved, but its headcount project did not update — see Admin → Data Health.', { type: 'error' });
    }
    if (check.cascadeCancel) {
      try {
        await cancelOpenHeadcount(editId, localDayISO());   // D-1 cascade, after the stage write
      } catch (e) {
        console.warn('N-307: headcount cascade cancel failed for role ' + editId, e);
        toast("Pipeline cancelled, but its open headcount wasn't — cancel it on the role page.", { type: 'error' });
      }
    }
    navigateTo('roles');
    return;
  }
  try {
    await optimisticWrite({
      apply: () => {
        const pendingItem = { id: pendingRowId(), ...normaliseFields('Roles', fields) };
        navigateTo('roles', pendingItem);
      },
      revert: async () => { await renderRolesPage(_rolesFilter); },
      // N-306/N-307: a headcount failure must NOT reject commit — that would
      // revert the view and offer a Retry that creates a duplicate role. The
      // missing headcount are added on the role page.
      commit: async () => {
        const created = await createRoleWithHistory(fields);
        try {
          await createHeadcountRows(created.id, fields.ProjectIDLookupId, headcountCount, headcountValues);
        } catch (e) {
          console.warn('N-307: headcount create failed for role ' + created.id, e);
          toast(`Role saved, but only ${(e && e.created) || 0} of ${headcountCount} headcount saved — add the rest on the role page.`, { type: 'error' });
        }
        return created;
      },
      errorMessage: 'Error saving role — change reverted.',
    });
    await renderRolesPage(_rolesFilter);
  } catch (e) {
    // optimisticWrite() already reverted the view and showed a Retry toast.
  }
}
// ── Weekly Activity Form ────────────────────────────────────────────
// N-146 — preselectedRoleId/preselectedProjectId let a caller (the
// Command Bar's Log activity row action) pre-scope the form to a role
// without an existing record, mirroring renderPlacementForm's own
// preselectedRoleId/preselectedProjectId params below.
async function renderWeeklyActivityForm(existingData = null, preselectedRoleId = null, preselectedProjectId = null) {
  const isEdit = !!existingData;
  // SharePoint returns lookup columns as *LookupId; fall back so edits preselect correctly
  const existingProjectId = existingData?.ProjectIDLookupId ?? existingData?.ProjectID ?? preselectedProjectId;
  const existingRoleId    = existingData?.RoleIDLookupId    ?? existingData?.RoleID    ?? preselectedRoleId;
  const currentUser = getCurrentUser();
  const email = currentUser.email;
  const userRole = await getEffectiveRole(email);
  const canLogOnBehalf = ['admin', 'delivery_manager'].includes(userRole) || hasDMGrant();
  const isTalentPartner = userRole === 'talent_partner';
  const projects = await getScopedProjects(email, false);
  const lockProject = isTalentPartner && projects.length === 1;
  // N-112: only Active/Transition projects are selectable; keep an already-
  // selected Completed project visible so editing an old record doesn't lose it.
  let selectableProjects = sortProjectsByName(projects.filter(isProjectActive));
  if (existingProjectId && !selectableProjects.some(p => String(p.id) === String(existingProjectId))) {
    const existingProject = projects.find(p => String(p.id) === String(existingProjectId));
    if (existingProject) selectableProjects = sortProjectsByName([...selectableProjects, existingProject]);
  }
  const projectOptions = buildProjectOptionsHtml(selectableProjects, existingProjectId);
  const today = localDayISO();
  const defaultWeek = existingData?.WeekNumber || getISOWeek(today);
  const defaultYear = existingData?.Year || new Date().getFullYear();
  // If single project, pre-load TP's own roles immediately
  let preloadedRoleOptions = '';
  if (lockProject) {
    try {
      const roles = (await getRolesForProject(projects[0].id, email))
        .filter(r => !CONFIG.ROLE_STAGES_ACTIVITY_EXCLUDED.includes(r.Stage))
        .sort((a, b) => (a.Location ? `${a.RoleTitle} (${a.Location})` : a.RoleTitle).localeCompare(b.Location ? `${b.RoleTitle} (${b.Location})` : b.RoleTitle));
       preloadedRoleOptions = roles.map(r =>
        `<option value="${r.id}" ${existingRoleId == r.id ? 'selected' : ''}>${escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)}</option>`
       ).join('');
    } catch (e) { /* fall back to empty */ }
  }
  // On edit, or when arriving pre-scoped to a role (N-146 Command Bar
  // action) — either way non-locked-project only — reload + reselect the
  // target role after the form mounts.
  if ((isEdit || preselectedRoleId) && !lockProject && existingProjectId) {
    setTimeout(() => {
      loadRolesForWeekly(existingProjectId, existingRoleId);
      if (canLogOnBehalf) loadTalentPartnersForWeekly(existingProjectId, existingData?.TalentPartner);
    }, 0);
  }
  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Weekly Activity' : 'Log Weekly Activity'}</h2>
      <div id="weekly-form-error" class="form-error"></div>
      <form id="weekly-form" onsubmit="submitWeeklyForm(event, ${existingData?.id || 'null'})">
        <fieldset class="form-section">
        <legend class="form-section-title">Basics</legend>
        <div class="form-row">
          <div class="form-group">
            <label>Project *</label>
            ${lockProject ? `
            <input type="text" value="${escAttr(projects[0].CustomerName)}" disabled style="background:var(--surface-sunken);color:var(--text-label);">
            <input type="hidden" name="ProjectID" value="${projects[0].id}">` : `
            <select name="ProjectID" required onchange="loadRolesForWeekly(this.value)${canLogOnBehalf ? ';loadTalentPartnersForWeekly(this.value)' : ''}">
              <option value="">-- Select project --</option>
              ${projectOptions}
            </select>`}
          </div>
          <div class="form-group">
            <label>Role *</label>
            <select name="RoleID" id="weekly-role-select" required
              ${isTalentPartner ? `data-tp-email="${escAttr(email)}"` : ''}>
              ${lockProject && preloadedRoleOptions
                ? preloadedRoleOptions
                : '<option value="">-- Select project first --</option>'}
            </select>
          </div>
        </div>
        ${canLogOnBehalf ? `
        <div class="form-group">
          <label>Log activity as *</label>
          <select name="TalentPartnerName" id="weekly-tp-select" required>
            <option value="">-- Select project first --</option>
          </select>
        </div>` : `<input type="hidden" name="TalentPartnerName" value="${escAttr(currentUser.email)}">`}
        </fieldset>
        <fieldset class="form-section">
        <legend class="form-section-title">Period</legend>
        <div class="form-group">
          <label>Week Ending Date *</label>
          <input type="date" name="WeekEndingDate" required
            onchange="autoFillWeekYear(this.value)"
            value="${existingData?.WeekEndingDate ? escAttr(spDateIn(existingData.WeekEndingDate) || '') : getWeekEnding(today)}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Year</label>
            <input type="number" name="Year" id="weekly-year" min="2020" max="2099"
              value="${defaultYear}" readonly>
          </div>
          <div class="form-group">
            <label>Week Number</label>
            <input type="number" name="WeekNumber" id="weekly-weeknum" min="1" max="53"
              value="${defaultWeek}" onchange="autoFillWeekEndingFromWeekNum(this.value)">
          </div>
        </div>
        </fieldset>
        <fieldset class="form-section">
        <legend class="form-section-title">Activity Counts</legend>
        <div class="form-row">
          <div class="form-group"><label>Outreach</label>
            <input type="number" name="Outreach" min="0" value="${existingData?.Outreach || 0}"></div>
          <div class="form-group"><label>Responses</label>
            <input type="number" name="Responses" min="0" value="${existingData?.Responses || 0}"></div>
          <div class="form-group"><label>Screened</label>
            <input type="number" name="Screened" min="0" value="${existingData?.Screened || 0}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Submitted</label>
            <input type="number" name="Submitted" min="0" value="${existingData?.Submitted || 0}"></div>
          <div class="form-group"><label>Interview 1</label>
            <input type="number" name="Interview1" min="0" value="${existingData?.Interview1 || 0}"></div>
          <div class="form-group"><label>Interview 2+</label>
            <input type="number" name="Interview2Plus" min="0" value="${existingData?.Interview2Plus || 0}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Final Interview</label>
            <input type="number" name="FinalInterview" min="0" value="${existingData?.FinalInterview || 0}"></div>
          <div class="form-group"><label>Offers</label>
            <input type="number" name="Offers" min="0" value="${existingData?.Offers || 0}"></div>
          <div class="form-group"><label>Hires</label>
            <input type="number" name="Hires" min="0" value="${existingData?.Hires || 0}"></div>
        </div>
        </fieldset>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Log Activity'}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('activity')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}
async function loadRolesForWeekly(projectId, selectedRoleId = null) {
  const select = document.getElementById('weekly-role-select');
  if (!projectId) { select.innerHTML = '<option value="">-- Select project first --</option>'; return; }
  select.innerHTML = '<option value="">Loading...</option>';
  const tpEmail = select.dataset.tpEmail || null;
  const roles = (await getRolesForProject(projectId, tpEmail))
    .filter(r => !CONFIG.ROLE_STAGES_ACTIVITY_EXCLUDED.includes(r.Stage))
    .sort((a, b) => (a.Location ? `${a.RoleTitle} (${a.Location})` : a.RoleTitle).localeCompare(b.Location ? `${b.RoleTitle} (${b.Location})` : b.RoleTitle));
  select.innerHTML = roles.length
    ? '<option value="">-- Select role --</option>' + roles.map(r => `<option value="${r.id}" ${selectedRoleId == r.id ? 'selected' : ''}>${escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)}</option>`).join('')
    : '<option value="">-- No roles assigned --</option>';
}
async function loadTalentPartnersForWeekly(projectId, selectedEmail = null) {
  const select = document.getElementById('weekly-tp-select');
  if (!select) return;
  if (!projectId) {
    select.innerHTML = '<option value="">-- Select project first --</option>';
    return;
  }
  select.innerHTML = '<option value="">Loading...</option>';
  try {
    const tps = await getTalentPartnersForProject(projectId, selectedEmail);
    const targetEmail = (selectedEmail || getCurrentUser().email).toLowerCase();
    select.innerHTML = '<option value="">-- Select team member --</option>' +
      tps.map(u => `<option value="${escAttr(u.UserEmail)}" ${u.UserEmail?.toLowerCase() === targetEmail ? 'selected' : ''}>${escHtml(u.UserName || u.UserEmail)}</option>`).join('');
  } catch(e) {
    select.innerHTML = '<option value="">-- Error loading team --</option>';
  }
}
function autoFillWeekYear(dateStr) {
  if (!dateStr) return;
  document.getElementById('weekly-year').value = new Date(dateStr).getFullYear();
  document.getElementById('weekly-weeknum').value = getISOWeek(dateStr);
}

// Moved from utils.js (N-237d) — single consumer, this file only.
// N-204: inverse of getISOWeek/getWeekEnding — given an ISO week number and a
// calendar year, returns that week's Sunday as 'YYYY-MM-DD'. Same Sunday-
// boundary convention as getWeekEnding, same local-getter approach (no
// toISOString — see the N-129 comment inside utils.js's getWeekEnding()).
// Week 1/52/53 can resolve into an adjacent calendar year; the returned
// string reflects the RESOLVED year, which callers must reconcile against
// any displayed Year field themselves. Returns null for out-of-range input
// rather than a garbage date.
function weekEndingFromWeekNumber(year, weekNum) {
  if (!Number.isFinite(year) || !Number.isFinite(weekNum) || weekNum < 1 || weekNum > 53) {
    return null;
  }
  const jan4 = new Date(year, 0, 4);
  const jan4IsoDay = jan4.getDay() || 7; // Mon=1..Sun=7
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (jan4IsoDay - 1));
  const targetSunday = new Date(week1Monday);
  targetSunday.setDate(week1Monday.getDate() + (weekNum - 1) * 7 + 6);
  const y  = targetSunday.getFullYear();
  const m  = String(targetSunday.getMonth() + 1).padStart(2, '0');
  const dd = String(targetSunday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// N-204: inverse of autoFillWeekYear. Week Number → Week Ending Date, using
// the currently-displayed Year. If the resolved week's Sunday lands in a
// different calendar year (week 1/52/53 edge cases), corrects the Year field
// to match so the three fields never end up mismatched.
function autoFillWeekEndingFromWeekNum(weekNumStr) {
  const weekNum = parseInt(weekNumStr, 10);
  if (!Number.isFinite(weekNum) || weekNum < 1 || weekNum > 53) return;
  const yearField = document.getElementById('weekly-year');
  const year = parseInt(yearField.value, 10);
  if (!Number.isFinite(year)) return;
  const weekEnding = weekEndingFromWeekNumber(year, weekNum);
  if (!weekEnding) return;
  const dateField = document.querySelector('input[name="WeekEndingDate"]');
  if (dateField) dateField.value = weekEnding;
  const resolvedYear = Number(weekEnding.slice(0, 4));
  if (resolvedYear !== year) yearField.value = resolvedYear;
}
async function submitWeeklyForm(event, editId = null) {
  event.preventDefault();
  clearFormError('weekly-form');
  const form = document.getElementById('weekly-form');
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    ProjectIDLookupId: parseInt(data.ProjectID),
    RoleIDLookupId:    parseInt(data.RoleID),
    TalentPartner:     data.TalentPartnerName || undefined,
    // The year is read off the day string itself, not via new Date() — see
    // _bulkFieldsFor in bulk-activity.js for the identical pattern.
    // data.WeekEndingDate IS the calendar day; re-parsing it into a Date and
    // asking for a local year is the exact shape that shifts a boundary date
    // by a day under BST.
    Yeare:             Number(data.WeekEndingDate.slice(0, 4)),
    WeekNumber:        getISOWeek(data.WeekEndingDate),
    WeekEndingDate:    isoDate(data.WeekEndingDate),
    Outreach:          parseInt(data.Outreach) || 0,
    Responses:         parseInt(data.Responses) || 0,
    Screened:          parseInt(data.Screened) || 0,
    Submitted:         parseInt(data.Submitted) || 0,
    Interview1:        parseInt(data.Interview1) || 0,
    InterviewTwoPlus:  parseInt(data.Interview2Plus) || 0,
    FinalInterview:    parseInt(data.FinalInterview) || 0,
    Offers:            parseInt(data.Offers) || 0,
    Hires:             parseInt(data.Hires) || 0,
    SubmittedAt:       new Date().toISOString(),
  };
  if (editId) {
    // N-218a: optimistic insert is a create-only concept -- editing an
    // existing activity row is unaffected, unchanged from before this task.
    try {
      await updateItem('WeeklyActivity', editId, fields);
      navigateTo('activity');
    } catch (e) {
      clearButtonLoading(btn);
      showFormError('weekly-form', `Error saving activity: ${e.message}`);
    }
    return;
  }
  try {
    await optimisticWrite({
      apply: () => {
        const pendingItem = { id: pendingRowId(), ...normaliseFields('WeeklyActivity', fields) };
        navigateTo('activity', pendingItem);
      },
      revert: async () => { await renderActivityPage(); },
      commit: () => createItem('WeeklyActivity', fields),
      errorMessage: 'Error saving activity — change reverted.',
    });
    // Hire logged → offer to record a placement, prefilled with this
    // role/project. Same decision as before this task, just moved after
    // the optimistic write resolves instead of after a plain await
    // createItem() -- unchanged in effect, since it only ever ran after a
    // successful write either way.
    if (fields.Hires > 0 &&
        await confirmModal({
          message: 'You logged a hire. Would you like to record a placement now?',
          confirmLabel: 'Record placement', cancelLabel: 'Not now',
        })) {
      document.getElementById('main-content').innerHTML =
        await renderPlacementForm(null, fields.RoleIDLookupId, fields.ProjectIDLookupId);
      return;
    }
    await renderActivityPage();
  } catch (e) {
    // optimisticWrite() already reverted the view and showed a Retry toast.
  }
}
// ── Placement Form ───────────────────────────────────────────────────
// N-308 (HC-3): a placement is recorded against one OPEN headcount. The
// Headcount select lists the project's open headcount grouped by pipeline
// (placementHeadcountGroups, utils.js); the role is taken from the chosen
// headcount row at submit (getPlacementTarget, api.js), never from the form.
async function renderPlacementForm(existingData = null, preselectedRoleId = null, preselectedProjectId = null) {
  const isEdit = !!existingData;
  const currentUser = getCurrentUser();
  const email = currentUser.email;
  const userRole = await getEffectiveRole(email);
  const canLogOnBehalf = ['admin', 'delivery_manager'].includes(userRole) || hasDMGrant();
  const isTalentPartner = userRole === 'talent_partner';
  const projects = await getScopedProjects(email, false);
  const lockProject = isTalentPartner && projects.length === 1;
  // N-308 S-4: Placements has no ProjectID — an edit takes its project from
  // the placement's role. A failed read leaves the project unselected.
  let currentRole = null;
  if (isEdit && existingData.RoleIDLookupId) {
    try { currentRole = await getItem('Roles', existingData.RoleIDLookupId); } catch (e) { /* no preselection */ }
  }
  const selectedProjectId = (currentRole && (currentRole.ProjectIDLookupId ?? currentRole.ProjectID))
    ?? preselectedProjectId ?? (lockProject ? projects[0].id : '');
  // N-112: only Active/Transition projects are selectable; keep an already-
  // selected Completed project visible so editing an old record doesn't lose it.
  let selectableProjects = sortProjectsByName(projects.filter(isProjectActive));
  if (selectedProjectId && !selectableProjects.some(p => String(p.id) === String(selectedProjectId))) {
    const existingProject = projects.find(p => String(p.id) === String(selectedProjectId));
    if (existingProject) selectableProjects = sortProjectsByName([...selectableProjects, existingProject]);
  }
  const projectOptions = buildProjectOptionsHtml(selectableProjects, selectedProjectId);
  // Project known at render → fill the Headcount select now (no flicker).
  let headcountOptions = '<option value="">-- Select project first --</option>';
  let preselectedHeadcountRoleId = null;
  if (selectedProjectId) {
    const r = await _placementHeadcountOptions(selectedProjectId, {
      tpEmail: isTalentPartner ? email : null,
      existingData, currentRole, preselectedRoleId,
    });
    headcountOptions = r.html;
    preselectedHeadcountRoleId = r.selectedRoleId;
  }
  // Currency: the stored value on an edit, else from the pre-selected role.
  const inheritedCurrency = existingData?.Currency || '';
  if (!isEdit && preselectedHeadcountRoleId) {
    setTimeout(() => loadCurrencyForPlacement(preselectedHeadcountRoleId), 0);
  }
  if (selectedProjectId && canLogOnBehalf) {
    setTimeout(() => loadTalentPartnersForPlacement(selectedProjectId, existingData?.TalentPartner || null), 0);
  }
  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Placement' : 'Record Placement'}</h2>
      <div id="placement-form-error" class="form-error"></div>
      <form id="placement-form" onsubmit="submitPlacementForm(event, ${existingData?.id || 'null'})">
        <div class="form-row">
          <div class="form-group">
            <label>Project *</label>
            ${lockProject ? `
            <input type="text" value="${escAttr(projects[0].CustomerName)}" disabled style="background:var(--surface-sunken);color:var(--text-label);">
            <input type="hidden" name="ProjectID" value="${projects[0].id}">` : `
            <select name="ProjectID" required onchange="loadHeadcountForPlacement(this.value)${canLogOnBehalf ? ';loadTalentPartnersForPlacement(this.value)' : ''}">
              <option value="">-- Select project --</option>
              ${projectOptions}
            </select>`}
          </div>
          <div class="form-group">
            <label>Headcount *</label>
            <select name="HeadcountID" id="placement-hc-select" required
              onchange="loadCurrencyForPlacement(this.selectedOptions[0] ? this.selectedOptions[0].dataset.roleId : '')"
              ${isTalentPartner ? `data-tp-email="${escAttr(email)}"` : ''}>
              ${headcountOptions}
            </select>
            <span class="form-hint">Open headcount on this project, earliest opened first. Not listed? Add headcount on the role page.</span>
          </div>
        </div>
        ${canLogOnBehalf ? `
        <div class="form-group">
          <label>Record placement as *</label>
          <select name="TalentPartnerName" id="placement-tp-select" required>
            <option value="">-- Select project first --</option>
          </select>
        </div>` : `<input type="hidden" name="TalentPartnerName" value="${escAttr(currentUser.email)}">`}
        <div class="form-group">
          <label>Candidate Name *</label>
          <input type="text" name="CandidateName" required
            value="${escAttr(existingData?.CandidateName || '')}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Salary Agreed</label>
            <input type="text" name="SalaryAgreed"
              value="${escAttr(existingData?.SalaryAgreed || '')}">
          </div>
          <div class="form-group">
            <label>Currency</label>
            <input type="text" id="placement-currency" name="Currency" readonly
              style="background:var(--surface-sunken);color:var(--text-label);"
              value="${escAttr(inheritedCurrency)}"
              placeholder="Auto-filled from role">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Offer Accepted Date</label>
            <input type="date" name="OfferAcceptedDate"
              value="${escAttr(spDateIn(existingData?.OfferAcceptedDate) || '')}">
          </div>
          <div class="form-group">
            <label>Provisional Start Date</label>
            <input type="date" name="ProvisionalStartDate"
              value="${escAttr(spDateIn(existingData?.ProvisionalStartDate) || '')}">
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="Notes" rows="3">${escHtml(existingData?.Notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Record Placement'}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('placements')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}
// N-308: the Headcount select's options for one project. Edit: the
// placement's current headcount is listed (and selected) even when its
// pipeline is now Closed or hidden by the Talent Partner filter. Otherwise
// the first open headcount of preselectedRoleId is selected. Returns
// { html, selectedRoleId }; a read failure returns the error option.
async function _placementHeadcountOptions(projectId, { tpEmail = null, existingData = null, currentRole = null, preselectedRoleId = null } = {}) {
  try {
    const data = await getPlacementPickerData(projectId, tpEmail);
    const roles = data.roles.slice();
    if (currentRole && !roles.some(r => String(r.id) === String(currentRole.id))) roles.push(currentRole);
    const groups = placementHeadcountGroups({
      roles, headcount: data.headcount, placements: data.placements,
      currentHeadcountId: existingData ? existingData.HeadcountID : null,
      excludePlacementId: existingData ? existingData.id : null,
    });
    const selectedId = existingData && existingData.HeadcountID !== null && existingData.HeadcountID !== undefined && existingData.HeadcountID !== ''
      ? existingData.HeadcountID
      : placementPreselectHeadcountId(groups, preselectedRoleId);
    const sel = groups.flatMap(g => g.options).find(o => String(o.id) === String(selectedId));
    return { html: placementHeadcountOptionsHtml(groups, sel ? sel.id : null), selectedRoleId: sel ? sel.roleId : null };
  } catch (e) {
    console.warn('N-308: headcount picker load failed for project ' + projectId, e);
    return { html: "<option value=\"\">-- Couldn't load headcount --</option>", selectedRoleId: null };
  }
}
async function loadHeadcountForPlacement(projectId) {
  const select = document.getElementById('placement-hc-select');
  if (!select) return;
  const currencyEl = document.getElementById('placement-currency');
  if (currencyEl) currencyEl.value = '';
  if (!projectId) { select.innerHTML = '<option value="">-- Select project first --</option>'; return; }
  select.innerHTML = '<option value="">Loading...</option>';
  const r = await _placementHeadcountOptions(projectId, { tpEmail: select.dataset.tpEmail || null });
  select.innerHTML = r.html;
}
async function loadCurrencyForPlacement(roleId) {
  const currencyEl = document.getElementById('placement-currency');
  if (!currencyEl) return;
  if (!roleId) { currencyEl.value = ''; return; }
  currencyEl.value = await getCurrencyForRole(roleId);
}
async function loadTalentPartnersForPlacement(projectId, selectedEmail = null) {
  const select = document.getElementById('placement-tp-select');
  if (!select) return;
  if (!projectId) { select.innerHTML = '<option value="">-- Select project first --</option>'; return; }
  select.innerHTML = '<option value="">Loading...</option>';
  try {
    const tps = await getTalentPartnersForProject(projectId);
    // N-308: an edit pre-selects the placement's stored TP; otherwise the user.
    const want = (selectedEmail || getCurrentUser().email).toLowerCase();
    select.innerHTML = '<option value="">-- Select team member --</option>' +
      tps.map(u => `<option value="${escAttr(u.UserEmail)}" ${u.UserEmail?.toLowerCase() === want ? 'selected' : ''}>${escHtml(u.UserName || u.UserEmail)}</option>`).join('');
  } catch(e) {
    select.innerHTML = '<option value="">-- Error loading team --</option>';
  }
}
async function submitPlacementForm(event, editId = null) {
  event.preventDefault();
  clearFormError('placement-form');
  const form = document.getElementById('placement-form');
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const data = Object.fromEntries(new FormData(form));
  const offerDate = isoDate(data.OfferAcceptedDate);
  const startDate = isoDate(data.ProvisionalStartDate);
  const fail = msg => { clearButtonLoading(btn); showFormError('placement-form', msg); };

  // N-308 S-3: validate the chosen headcount against a fresh read BEFORE any
  // write or optimistic apply. Fail closed — nothing is saved on a refusal.
  if (!data.HeadcountID) { fail('Pick a headcount.'); return; }
  let target, stored = null;
  try {
    if (editId) stored = await getItem('Placements', editId);
    target = await getPlacementTarget(data.HeadcountID);
  } catch (e) {
    console.warn('N-308: placement headcount check failed', e);
    fail("Couldn't check the headcount — nothing saved.");
    return;
  }
  const currentHeadcountId = stored && stored.HeadcountID !== null && stored.HeadcountID !== undefined && stored.HeadcountID !== ''
    ? stored.HeadcountID : null;
  const v = validatePlacementHeadcount({
    headcount: target.headcount, state: target.state,
    currentHeadcountId, excludePlacementId: editId,
  });
  if (!v.ok) { fail(v.reason); return; }

  const roleId = target.roleId;
  const timeToHire = placementTimeToHire(target.headcount.OpenDate, offerDate);
  const fields = {
    RoleIDLookupId:       roleId,
    Title:                data.CandidateName,
    TalentPartner:        data.TalentPartnerName || undefined,
    SalaryAgreed:         data.SalaryAgreed || undefined,
    Currency:             data.Currency || undefined,
    OfferAcceptedDate:    offerDate || undefined,
    ProvisionalStartDate: startDate || undefined,
    // Create omits a blank value; an edit writes null so a re-point to a
    // not-opened headcount (or a cleared offer date) clears a stale one.
    TimeToHire:           timeToHire ?? (editId ? null : undefined),
    Notes:                data.Notes || undefined,
    HeadcountID:          Number(target.headcount.id),
  };

  if (editId) {
    // N-218a: optimistic insert is a create-only concept -- editing an
    // existing placement is unaffected, unchanged from before this task.
    // N-308: no Roles writes (ActualHireDate / CurrentStartDate retired).
    try {
      await updateItem('Placements', editId, fields);
    } catch (e) {
      fail(`Error saving placement: ${e.message}`);
      return;
    }
    navigateTo('placements');
    // S-5: a moved placement frees its old headcount (derived — rule 4).
    const moved = currentHeadcountId !== null && String(currentHeadcountId) !== String(fields.HeadcountID);
    if (moved) {
      await _placementFreedHeadcount(currentHeadcountId, stored.RoleIDLookupId);
      await _placementFollowUp(roleId, { closeOnly: true });
    }
    return;
  }

  try {
    await optimisticWrite({
      apply: () => {
        const pendingItem = { id: pendingRowId(), ...normaliseFields('Placements', fields) };
        navigateTo('placements', pendingItem);
      },
      revert: async () => { await renderPlacementsPage(); },
      commit: async () => {
        const created = await createItem('Placements', fields);
        // N-308: no Roles writes here any more — ActualHireDate /
        // CurrentStartDate are retired (analytics re-base: N-309/N-310).
        // N-093: was getAllRoles() + a lookup map to find one role by id.
        const role  = await getItem('Roles', roleId);
        const projId = String(role.ProjectIDLookupId || role.ProjectID);
        const projects = await getItems('Projects');
        const proj = projects.find(pr => String(pr.id) === projId) || {};
        // 6.4 placement landed (TP + DM)
        await fireNotification({ triggerType:'placement',
          triggerKey:`placement:${created.id}`, tone:'celebrate',
          deepLink:'reporting.html#placements',
          body:`Placement: ${data.CandidateName} placed`,
          recipients:[data.TalentPartnerName, proj.DeliveryManager] });
        // 6.5 project first placement (leadership)
        const allPlac = await getItems('Placements');
        // N-183: rolesById was removed by N-093; scope the lookup to this
        // project's roles via getRolesForProject instead of refetching everything.
        const projectRoles = await getRolesForProject(projId);
        const projectRoleIds = new Set(projectRoles.map(r => String(r.id)));
        const prior = allPlac.filter(pl => String(pl.id) !== String(created.id) &&
          projectRoleIds.has(String(pl.RoleIDLookupId))).length;
        if (prior === 0) {
          const roleTitle = role.Location
            ? `${role.RoleTitle} (${role.Location})` : role.RoleTitle;

          // resolve emails -> names. TP = who MADE the placement;
          // DM = who owns the project. May be the same person
          // (a DM can log their own placement).
          const nameMap = await getTalentPartnerDisplayMap(); // email -> UserName
          const tpEmail = (data.TalentPartnerName || '').toLowerCase();
          const dmEmail = (proj.DeliveryManager  || '').toLowerCase();
          const tpName  = nameMap[tpEmail] || data.TalentPartnerName || '';
          const dmName  = nameMap[dmEmail] || proj.DeliveryManager  || '';
          const samePerson = tpEmail && dmEmail && tpEmail === dmEmail;

          const enrich = {
            RoleTitle: roleTitle,
            CustomerName: proj.CustomerName,
            TalentPartnerName: tpName,       // the placer
            DeliveryManagerName: dmName,     // project DM
            SamePerson: samePerson ? 'yes' : 'no',
          };

          // in-app rows for Leadership (enriched)
          await fireNotification({ triggerType:'firstPlacement',
            triggerKey:`firstplacement:${projId}`, tone:'milestone',
            deepLink:'reporting.html#placements',
            body:`${proj.CustomerName} has its first placement!`,
            recipients: await getLeadershipRecipients(),
            extraFields: enrich });

          // sentinel row — drives the Power Automate email (one per placement)
          await fireNotification({ triggerType:'firstPlacement',
            triggerKey:`firstplacement-email:${projId}`, tone:'milestone',
            deepLink:'reporting.html#placements',
            body:`${proj.CustomerName} has its first placement!`,
            recipients: ['system@newton'],
            extraFields: enrich });
        }
        return created;
      },
      errorMessage: 'Error saving placement — change reverted.',
    });
    await renderPlacementsPage();
  } catch (e) {
    // optimisticWrite() already reverted the view and showed a Retry toast.
    return;
  }
  await _placementFollowUp(roleId);
}
// N-308: after a placement lands — offer to close the pipeline when it
// filled the last open headcount (D-2), otherwise offer a stage update so a
// pipeline left on e.g. Offered doesn't read as stuck. closeOnly skips the
// stage prompt (an edit that moved the placement). Reads fresh; a failed read
// ends quietly — nothing is asked, nothing written.
async function _placementFollowUp(roleId, { closeOnly = false } = {}) {
  let role, state;
  try {
    [role, state] = await Promise.all([getItem('Roles', roleId), getRoleHeadcountState(roleId)]);
  } catch (e) {
    console.warn('N-308: placement follow-up read failed for role ' + roleId, e);
    return;
  }
  const kind  = placementFollowUp({ stage: role.Stage, counts: state.counts });
  const label = placementRoleLabel(role);
  try {
    if (kind === 'close') {
      const yes = await confirmModal({ title: 'Close pipeline',
        message: `That filled the last open headcount on ${label}. Close the pipeline?`,
        confirmLabel: 'Close pipeline', cancelLabel: 'Not now' });
      if (!yes) return;
      const chk = await checkRoleStageChange(roleId, CONFIG.ROLE_STAGE_CLOSED);
      if (!chk.ok) { toast(chk.reason, { type: 'error' }); return; }
      await updateRoleWithHistory(roleId, { Stage: CONFIG.ROLE_STAGE_CLOSED });
      toast('Pipeline closed.');
    } else if (kind === 'stage' && !closeOnly) {
      const current = normaliseRoleStage(role.Stage);
      const n = state.counts.open;
      const chosen = await selectModal({ title: 'Update pipeline stage',
        message: `${label} still has ${n} open headcount. Which stage is the pipeline at now?`,
        options: reopenStageOptions().map(s => ({ value: s, label: s })),
        defaultValue: current, confirmLabel: 'Update stage', cancelLabel: 'Not now' });
      if (chosen === null || chosen === current) return;
      const chk = await checkRoleStageChange(roleId, chosen);
      if (!chk.ok) { toast(chk.reason, { type: 'error' }); return; }
      await updateRoleWithHistory(roleId, { Stage: chosen });
      toast(`Pipeline moved to ${chosen}.`);
    } else {
      return;
    }
  } catch (e) {
    console.warn('N-308: placement follow-up stage write failed', e);
    toast("Couldn't update the pipeline stage — change it on the Roles page.", { type: 'error' });
  }
}
// N-308 S-5: a placement moved off a Closed / Cancelled pipeline leaves its
// old headcount open there (filled is derived), which D-2 forbids — offer to
// cancel it. A non-terminal pipeline simply has one more open headcount.
async function _placementFreedHeadcount(headcountId, roleId) {
  let role, state;
  try {
    [role, state] = await Promise.all([getItem('Roles', roleId), getRoleHeadcountState(roleId)]);
  } catch (e) {
    console.warn('N-308: freed-headcount read failed for role ' + roleId, e);
    return;
  }
  const stage = normaliseRoleStage(role.Stage);
  if (!CONFIG.ROLE_STAGE_TERMINAL.includes(stage)) return;
  const hc = state.rows.find(r => String(r.id) === String(headcountId));
  if (!hc || classifyHeadcount(hc, state.fillMap) !== 'open') return;
  const label   = placementRoleLabel(role);
  const hcLabel = hc.Title || headcountLabel(hc.Sequence);
  try {
    const yes = await confirmModal({ title: 'Headcount freed',
      message: `${label} is ${stage}, and moving this placement leaves ${hcLabel} on it open. Cancel that headcount?`,
      confirmLabel: 'Cancel headcount', cancelLabel: 'Leave open', danger: true });
    if (yes) {
      await cancelHeadcount(hc.id, roleId, localDayISO());
      toast(`${hcLabel} cancelled.`);
    } else {
      toast(`${label} is ${stage} with an open headcount — reopen or cancel it on the role page.`, { type: 'error' });
    }
  } catch (e) {
    console.warn('N-308: freed-headcount cancel failed', e);
    toast(`Couldn't cancel ${hcLabel} — cancel it on the role page.`, { type: 'error' });
  }
}
// ── Rejected Offer Form ──────────────────────────────────────────────
async function renderRejectedOfferForm(existingData = null, preselectedRoleId = null) {
  const isEdit = !!existingData;
  const email = getCurrentUser().email;
  const userRole = await getEffectiveRole(email);
  const isTalentPartner = userRole === 'talent_partner';
  const projectIds = await getUserProjectIds(email);
  let roles = [];
  if (projectIds === null) {
    roles = (await getAllRoles()).filter(r => isOpenPipelineStage(r.Stage));
  } else {
    const roleArrays = await Promise.all(
      projectIds.map(async pid => (await getRolesForProject(pid, isTalentPartner ? email : null)).filter(r => isOpenPipelineStage(r.Stage)))
    );
    roles = roleArrays.flat();
  }
  roles.sort((a, b) => (a.Location ? `${a.RoleTitle} (${a.Location})` : a.RoleTitle).localeCompare(b.Location ? `${b.RoleTitle} (${b.Location})` : b.RoleTitle));
  const roleOptions = roles.map(r =>
    `<option value="${r.id}" ${
      (existingData?.RoleID == r.id || preselectedRoleId == r.id) ? 'selected' : ''
    }>${escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle)}</option>`
  ).join('');
  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Rejected Offer' : 'Log Rejected Offer'}</h2>
      <div id="rejected-form-error" class="form-error"></div>
      <form id="rejected-form" onsubmit="submitRejectedForm(event, ${existingData?.id || 'null'})">
        <div class="form-group">
          <label>Role *</label>
          <select name="RoleID" required>
            <option value="">-- Select role --</option>
            ${roleOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Candidate Name *</label>
          <input type="text" name="CandidateName" required
            value="${escAttr(existingData?.CandidateName || '')}">
        </div>
        <div class="form-group">
          <label>Rejection Date *</label>
          <input type="date" name="RejectionDate" required
            value="${escAttr(spDateIn(existingData?.RejectionDate) || (isEdit ? '' : localDayISO()))}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Salary Offered</label>
            <input type="text" name="SalaryOffered"
              value="${escAttr(existingData?.SalaryOffered || '')}">
          </div>
          <div class="form-group">
            <label>Rejection Reason *</label>
            <select name="RejectionReason" required>
              <option value="">-- Select --</option>
              ${'Salary,Motivations,Counter-offer,Took another opportunity,Other'.split(',')
                .map(r => `<option value="${r}" ${existingData?.RejectionReason === r ? 'selected' : ''}>${r}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="Notes" rows="3">${escHtml(existingData?.Notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Log Rejection'}</button>
          <button type="button" class="btn-secondary" onclick="navigateTo('rejections')">Cancel</button>
        </div>
      </form>
    </div>
  `;
}
async function submitRejectedForm(event, editId = null) {
  event.preventDefault();
  clearFormError('rejected-form');
  const form = document.getElementById('rejected-form');
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const data = Object.fromEntries(new FormData(form));
  const fields = {
    RoleIDLookupId:  parseInt(data.RoleID),
    Title:           data.CandidateName,
    SalaryOffered:   data.SalaryOffered || undefined,
    RejectionReason: data.RejectionReason,
    RejectionDate:   isoDate(data.RejectionDate) || undefined,
    Notes:           data.Notes || undefined,
  };
  if (editId) {
    // N-218a: optimistic insert is a create-only concept -- editing an
    // existing rejection is unaffected, unchanged from before this task.
    try {
      await updateItem('RejectedOffers', editId, fields);
      navigateTo('rejections');
    } catch (e) {
      clearButtonLoading(btn);
      showFormError('rejected-form', `Error saving rejection: ${e.message}`);
    }
    return;
  }
  try {
    await optimisticWrite({
      apply: () => {
        const pendingItem = { id: pendingRowId(), ...normaliseFields('RejectedOffers', fields) };
        navigateTo('rejections', pendingItem);
      },
      revert: async () => { await renderRejectionsPage(); },
      commit: () => createItem('RejectedOffers', fields),
      errorMessage: 'Error saving rejection — change reverted.',
    });
    await renderRejectionsPage();
  } catch (e) {
    // optimisticWrite() already reverted the view and showed a Retry toast.
  }
}
