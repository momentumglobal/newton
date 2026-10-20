// js/forms-weekly.js — Weekly Activity form (Reporting). Split from forms.js by N-350a.
// Loads on reporting.html only, straight after forms.js. Load-time code is the registerActions
// call at the bottom; everything else is declarations.
// Runtime deps: getEffectiveRole/hasDMGrant/getScopedProjects/getRolesForProject (api.js), createWeeklyActivity
// (api.js), optimisticWrite (utils.js), confirmModal/setButtonLoading (ui-kit.js), renderPlacementForm
// (forms-placement.js), showFormError/clearFormError (forms.js). WeekEndingDate is the SUNDAY of the week.
// ── Weekly Activity Form ────────────────────────────────────────────
// N-146 — preselectedRoleId/preselectedProjectId let a caller (the
// Command Bar's Log activity row action) pre-scope the form to a role
// without an existing record, mirroring renderPlacementForm's own
// preselectedRoleId/preselectedProjectId params below.
async function renderWeeklyActivityForm(existingData = null, preselectedRoleId = null, preselectedProjectId = null) {
  const c = await _weeklyFormContext(existingData, preselectedRoleId, preselectedProjectId);
  const { isEdit, existingProjectId, existingRoleId, canLogOnBehalf, lockProject } = c;
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
      <form id="weekly-form"${actOn('submit', 'submitWeeklyForm', ACT_EVENT, existingData?.id ? Number(existingData.id) : null)}>
        ${_weeklyFormBasicsHtml(c)}
        ${_weeklyFormPeriodHtml(c)}
        ${_weeklyFormCountsHtml(c)}
        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Log Activity'}</button>
          <button type="button" class="btn-secondary"${act('navigateTo', 'activity')}>Cancel</button>
        </div>
      </form>
    </div>
  `;
}

// Data the form needs before it can render; the builders below are pure string functions over it.
async function _weeklyFormContext(existingData, preselectedRoleId, preselectedProjectId) {
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
  return { existingData, isEdit, existingProjectId, existingRoleId, currentUser, email, isTalentPartner, canLogOnBehalf, projects, lockProject, projectOptions, today, defaultWeek, defaultYear, preloadedRoleOptions };
}

// ── Weekly form sections (pure; template text moved verbatim from renderWeeklyActivityForm) ──
function _weeklyFormBasicsHtml(c) {
  const { currentUser, email, isTalentPartner, canLogOnBehalf, projects, lockProject, projectOptions, preloadedRoleOptions } = c;
  return `
        <fieldset class="form-section">
        <legend class="form-section-title">Basics</legend>
        <div class="form-row">
          <div class="form-group">
            <label>Project *</label>
            ${lockProject ? `
            <input type="text" value="${escAttr(projects[0].CustomerName)}" disabled style="background:var(--surface-sunken);color:var(--text-label);">
            <input type="hidden" name="ProjectID" value="${projects[0].id}">` : `
            <select name="ProjectID" required${actOn('change', 'formsWeeklyProjectChanged', ACT_VALUE, !!canLogOnBehalf)}>
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
  `;
}
function _weeklyFormPeriodHtml(c) {
  const { existingData, today, defaultWeek, defaultYear } = c;
  return `
        <fieldset class="form-section">
        <legend class="form-section-title">Period</legend>
        <div class="form-group">
          <label>Week Ending Date *</label>
          <input type="date" name="WeekEndingDate" required
            ${actOn('change', 'autoFillWeekYear', ACT_VALUE)}
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
              value="${defaultWeek}" ${actOn('change', 'autoFillWeekEndingFromWeekNum', ACT_VALUE)}>
          </div>
        </div>
        </fieldset>
  `;
}
function _weeklyFormCountsHtml(c) {
  const { existingData } = c;
  return `
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

// Single consumer, this file only.
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
    // N-218a: optimistic insert is a create-only concept; edits write directly.
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
      commit: () => createWeeklyActivity(fields),
      errorMessage: 'Error saving activity — change reverted.',
    });
    // Hire logged → offer to record a placement, prefilled with this
    // role/project; offered only after the write succeeded.
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

// N-302b: delegated action (js/actions.js) — replaces an inline handler that held a second statement;
// the condition arrives as data (canLogOnBehalf).
function formsWeeklyProjectChanged(projectId, canLogOnBehalf) {
  loadRolesForWeekly(projectId);
  if (canLogOnBehalf) loadTalentPartnersForWeekly(projectId);
}

registerActions({
  submitWeeklyForm,
  autoFillWeekYear,
  autoFillWeekEndingFromWeekNum,
  formsWeeklyProjectChanged,
});
