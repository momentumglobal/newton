// js/forms.js — Shared form helpers, Project form and Rejected Offer form (Reporting data entry).
// Role, weekly-activity and placement forms live in forms-role.js, forms-weekly.js and
// forms-placement.js (N-350a); all four load on reporting.html only.
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
      <form id="project-form"${actOn('submit', 'submitProjectForm', ACT_EVENT, existingData?.id ? Number(existingData.id) : null)}>
        <div class="form-group">
          <label>Customer Name *</label>
          <input type="text" name="CustomerName" required
            value="${escAttr(existingData?.CustomerName || '')}">
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
            ${projectFormTypes(existingData?.ProjectType).map(t => `
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
          <button type="button" class="btn-secondary"${act('navigateTo', 'projects')}>Cancel</button>
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
  // N-365 (D-5): no Delivery Manager field — the Lead DM is set from the Project
  // Team on the Project page, and an edit here must never clear it.
  const fields = {
    Title:           data.CustomerName,
    Status:          data.Status,
    ProjectType:     data.ProjectType,
    StartDate:       isoDate(data.StartDate) || undefined,
    EndDate:         isoDate(data.EndDate) || undefined,
    Notes:           data.Notes || undefined,
  };
  if (editId) {
    // N-369: the project must still be writable — fails closed.
    const w = await checkProjectWrite(editId);
    if (!w.ok) { clearButtonLoading(btn); showFormError('project-form', w.reason); return; }
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
// ── Rejected Offer Form ──────────────────────────────────────────────
async function renderRejectedOfferForm(existingData = null, preselectedRoleId = null) {
  const isEdit = !!existingData;
  const email = getCurrentUser().email;
  const userRole = await getEffectiveRole(email);
  const isTalentPartner = userRole === 'talent_partner';
  const projectIds = await getUserWritableProjectIds(email);   // N-369: writable projects only (null = all)
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
      <form id="rejected-form"${actOn('submit', 'submitRejectedForm', ACT_EVENT, existingData?.id ? Number(existingData.id) : null)}>
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
              ${CONFIG.REJECTION_REASONS
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
          <button type="button" class="btn-secondary"${act('navigateTo', 'rejections')}>Cancel</button>
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
  // N-369: the write gate — fails closed.
  let stored = null;
  if (editId) {
    try { stored = await getItem('RejectedOffers', editId); } catch (e) { /* checked below: fails closed */ }
  }
  const w = editId && !stored
    ? { ok: false, reason: PROJECT_WRITE_CHECK_FAILED }
    : await checkRoleWrites(fields.RoleIDLookupId, stored && stored.RoleIDLookupId);
  if (!w.ok) { clearButtonLoading(btn); showFormError('rejected-form', w.reason); return; }
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

// Actions for the other three forms are registered in their own files.
registerActions({
  submitProjectForm,
  submitRejectedForm,
});
