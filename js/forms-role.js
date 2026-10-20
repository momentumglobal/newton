// js/forms-role.js — Role form: Add / Edit / Duplicate (Reporting). Split from forms.js by N-350a.
// Loads on reporting.html only, straight after forms.js. Load-time code is the registerActions
// call at the bottom; everything else is declarations.
// Runtime deps: getEffectiveRole/hasDMGrant/getScopedProjects (api.js, permissions.js), checkRoleStageChange,
// createHeadcountRows, syncHeadcountProject, cancelOpenHeadcount (api-headcount.js), createRoleWithHistory,
// updateRoleWithHistory (api.js), optimisticWrite (utils.js), confirmModal/toast/setButtonLoading (ui-kit.js),
// showFormError/clearFormError (forms.js).
// ── Role Form ────────────────────────────────────────────────────────
// N-150: isDuplicate decouples "is this an edit" from "was prefill data
// supplied" — Duplicate opens this same form pre-filled from the source
// role's data but must still render as Add Role (new item), not Edit Role.
async function renderRoleForm(existingData = null, preselectedProjectId = null, isDuplicate = false) {
  const c = await _roleFormContext(existingData, preselectedProjectId, isDuplicate);
  const { isEdit } = c;
  return `
    <div class="form-container">
      <h2>${isEdit ? 'Edit Role' : 'Add Role'}</h2>
      <div id="role-form-error" class="form-error"></div>
      <form id="role-form"${actOn('submit', 'submitRoleForm', ACT_EVENT, existingData?.id ? Number(existingData.id) : null)}>
        ${_roleFormBasicsHtml(c)}
        ${_roleFormOwnershipHtml(c)}
        ${_roleFormCommercialHtml(c)}
        ${_roleFormHeadcountHtml(c)}
        ${_roleFormAdditionalHtml(c)}
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Add Role'}</button>
          <button type="button" class="btn-secondary"${act('navigateTo', 'roles')}>Cancel</button>
        </div>
      </form>
    </div>
  `;
}

// Data the form needs before it can render (everything above the template in the baseline);
// the section builders below are pure string functions over this object.
async function _roleFormContext(existingData, preselectedProjectId, isDuplicate) {
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
  return { existingData, isEdit, isDuplicate, currentUser, canAssign, projects, lockProject, projectOptions, departmentOptions, showAdditional, hcCounts, targetDays };
}

// ── Role form sections (pure; template text moved verbatim from renderRoleForm) ──
function _roleFormBasicsHtml(c) {
  const { existingData, canAssign, projects, lockProject, projectOptions, departmentOptions } = c;
  return `
        <fieldset class="form-section">
          <legend class="form-section-title">Basics</legend>
          <div class="form-group">
            <label>Project *</label>
            ${lockProject ? `
            <input type="text" value="${escAttr(projects[0].CustomerName)}" disabled style="background:var(--surface-sunken);color:var(--text-label);">
            <input type="hidden" name="ProjectID" value="${projects[0].id}">` : `
            <select name="ProjectID" required${canAssign ? actOn('change', 'loadTalentPartnersForRole', ACT_VALUE) : ''}>
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
                ${_roleFormStageOptionsHtml(c)}
              </select>
            </div>
          </div>
        </fieldset>
  `;
}
function _roleFormStageOptionsHtml(c) {
  const { existingData, isEdit, hcCounts } = c;
  return (isEdit ? CONFIG.ROLE_STAGES : reopenStageOptions())   // N-307 S-6: no terminal stage on Add/Duplicate
                  .map(s => {
                    // New roles start at Backlog by design (Pipeline Backlog KPI, Roles page
                    // Backlog tab). State it explicitly — don't rely on the browser
                    // selecting the first option, which a reorder would silently change.
                    // Matches mobile-roleform.js:59.
                    const sel = isEdit ? existingData.Stage === s : s === 'Backlog';
                    const closeBlocked = isEdit && s === CONFIG.ROLE_STAGE_CLOSED &&
                      existingData.Stage !== s && hcCounts && hcCounts.open > 0;
                    return `<option value="${s}" ${sel ? 'selected' : ''}${closeBlocked ? ' disabled' : ''}>${closeBlocked ? `${s} (${hcCounts.open} open headcount)` : s}</option>`;
                  })
                  .join('');
}
function _roleFormOwnershipHtml(c) {
  const { existingData, currentUser, canAssign } = c;
  return `
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
  `;
}
function _roleFormCommercialHtml(c) {
  const { existingData } = c;
  return `
        <fieldset class="form-section">
          <legend class="form-section-title">Commercial</legend>
          <div class="form-group">
            <label>Location *</label>
            <select name="Location" id="role-location-select"${actOn('change', 'updateCurrencyFromLocation', ACT_VALUE)} required>
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
  `;
}
function _roleFormHeadcountHtml(c) {
  const { existingData, isEdit, isDuplicate, hcCounts, targetDays } = c;
  return `
        ${isEdit ? `
        <fieldset class="form-section">
          <legend class="form-section-title">Headcount</legend>
          <p class="form-section-note">
            Headcount: ${escHtml(hcCounts ? headcountXYTitle(hcCounts) : '—')} ·
            <a href="#"${act('openRolePage.prevent', Number(existingData.id))}>Manage on the role page</a>
          </p>
        </fieldset>` : `
        <fieldset class="form-section">
          <legend class="form-section-title">Headcount</legend>
          <p class="form-section-note">Applied to each new headcount. Edit them one by one on the role page.</p>
          <input type="hidden" name="LinkPlanRowID" value="">
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
                ${actOn('change', 'autoFillTargetDate')}
                value="${escAttr(isDuplicate ? (spDateIn(existingData?.OpenDate) || '') : '')}">
            </div>
            <div class="form-group">
              <label>Target Hire Date (auto: Open + ${targetDays}d)</label>
              <input type="date" name="HcTargetHireDate" id="role-target-date"
                value="${escAttr(isDuplicate ? (defaultTargetHireDate(spDateIn(existingData?.OpenDate)) || '') : '')}">
            </div>
          </div>
        </fieldset>`}
  `;
}
function _roleFormAdditionalHtml(c) {
  const { existingData, showAdditional } = c;
  return `
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

// ── Role form submit ────────────────────────────────────────────────────
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
  // Separate from `fields` on purpose: tests/lint-role-copy-fields.js parses `const fields = {`.
  const hc = _roleFormHeadcountInput(data);
  if (editId) {
    // N-218a: optimistic insert is a create-only concept; edits write directly.
    const check = await _roleFormValidateEdit(editId, fields, btn);
    if (!check) return;
    await _roleFormWriteEdit(editId, fields, check, btn);
    return;
  }
  await _roleFormWriteNew(fields, hc);
}

// Headcount inputs from the Add/Duplicate form's Headcount fieldset.
function _roleFormHeadcountInput(data) {
  // N-307: dates + Backfill are headcount fields (D-4) — the Add/Duplicate
  // form's Headcount fieldset applies them to each of the n new headcount.
  // Deliberately separate objects, built after `fields` —
  // tests/lint-role-copy-fields.js parses `const fields = {`.
  const count = clampHeadcountCount(data.HeadcountCount);
  // N-312: set only when the form was opened by Hiring Plan "Create Headcount"
  // (coe-plan.js) — the new pipeline's first headcount is linked to that row.
  const planRowIdNum = parseInt(data.LinkPlanRowID, 10);
  const planRowId = Number.isInteger(planRowIdNum) && planRowIdNum > 0 ? planRowIdNum : null;
  const values = {
    OpenDate:       isoDate(data.HcOpenDate) || undefined,
    TargetHireDate: isoDate(data.HcTargetHireDate) || undefined,
    Backfill:       data.HcBackfill === 'Yes' ? true : data.HcBackfill === 'No' ? false : undefined,
  };
  return { count, planRowId, values };
}

// Edit, step 1: the Stage rule. Returns the check, or null once it has already shown its error / been cancelled.
async function _roleFormValidateEdit(editId, fields, btn) {
  // N-307: the Stage rule (D-1 / D-2 / S-2) runs first and fails closed.
    let check;
    try {
      check = await checkRoleStageChange(editId, fields.Stage);
    } catch (e) {
      clearButtonLoading(btn);
      showFormError('role-form', "Couldn't check this role's headcount — nothing saved. Please try again.");
      return null;
    }
    if (!check.ok) {
      clearButtonLoading(btn);
      showFormError('role-form', check.reason);
      return null;
    }
    if (check.cascadeCancel) {
      const ok = await confirmModal({
        title:        'Cancel pipeline',
        message:      `This also cancels ${check.counts.open} open headcount.`,
        confirmLabel: 'Cancel pipeline',
        cancelLabel:  'Keep',
        danger:       true,
      });
      if (!ok) { clearButtonLoading(btn); return null; }
    }
  return check;
}

// Edit, step 2: write, then headcount follow-ups (which only toast on failure).
async function _roleFormWriteEdit(editId, fields, check, btn) {
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
}

// Create: optimistic insert, then the role + its headcount.
async function _roleFormWriteNew(fields, hc) {
  try {
    await optimisticWrite({
      apply: () => {
        const pendingItem = { id: pendingRowId(), ...normaliseFields('Roles', fields) };
        navigateTo('roles', pendingItem);
      },
      revert: async () => { await renderRolesPage(_rolesFilter); },
      // Why commit swallows headcount failures: see _roleFormCommitNew.
      commit: () => _roleFormCommitNew(fields, hc),
      errorMessage: 'Error saving role — change reverted.',
    });
    await renderRolesPage(_rolesFilter);
  } catch (e) {
    // optimisticWrite() already reverted the view and showed a Retry toast.
  }
}

// N-306/N-307: a headcount failure must NOT reject commit — that would revert the view and offer a Retry
// that creates a duplicate role. The missing headcount are added on the role page.
async function _roleFormCommitNew(fields, hc) {
        const created = await createRoleWithHistory(fields);
        let headcountRows = [];
        try {
          headcountRows = await createHeadcountRows(created.id, fields.ProjectIDLookupId, hc.count, hc.values);
        } catch (e) {
          console.warn('N-307: headcount create failed for role ' + created.id, e);
          toast(`Role saved, but only ${(e && e.created) || 0} of ${hc.count} headcount saved — add the rest on the role page.`, { type: 'error' });
        }
        // N-312: same rule as above — a link failure only toasts.
        if (hc.planRowId) {
          try {
            if (!headcountRows.length) throw new Error('no headcount to link');
            await linkCoEPlanRow(hc.planRowId, { id: headcountRows[0].id, RoleID: created.id });
            toast('Linked to the Hiring Plan row', { type: 'success' });
          } catch (e) {
            console.warn('N-312: Hiring Plan link failed for role ' + created.id, e);
            toast('Role saved, but not linked to the Hiring Plan row — use Link on the Hiring Plan.', { type: 'error' });
          }
        }
        return created;
}

registerActions({
  submitRoleForm,
  loadTalentPartnersForRole,
  updateCurrencyFromLocation,
  autoFillTargetDate,
});
