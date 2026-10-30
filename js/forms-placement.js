// js/forms-placement.js — Placement form (Reporting). Split from forms.js by N-350a.
// Loads on reporting.html only, straight after forms.js. Load-time code is the registerActions
// call at the bottom; everything else is declarations.
// Runtime deps: getPlacementTarget, getPlacementPickerData, getRoleHeadcountState, checkRoleStageChange,
// cancelHeadcount (api-headcount.js), placementHeadcountGroups & co (headcount.js), fireNotification
// (notifications.js), optimisticWrite (utils.js), confirmModal/selectModal/toast (ui-kit.js),
// showFormError/clearFormError (forms.js).
// ── Placement Form ───────────────────────────────────────────────────
// N-308 (HC-3): a placement is recorded against one OPEN headcount. The
// Headcount select lists the project's open headcount grouped by pipeline
// (placementHeadcountGroups, headcount.js); the role is taken from the chosen
// headcount row at submit (getPlacementTarget, api-headcount.js), never from the form.
async function renderPlacementForm(existingData = null, preselectedRoleId = null, preselectedProjectId = null) {
  const isEdit = !!existingData;
  const currentUser = getCurrentUser();
  const email = currentUser.email;
  const userRole = await getEffectiveRole(email);
  const canLogOnBehalf = ['admin', 'delivery_manager'].includes(userRole);
  const isTalentPartner = userRole === 'talent_partner';
  const projects = dashboardProjects(await getWritableScopedProjects(email, false));   // N-362; N-369 writable only
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
      <form id="placement-form"${actOn('submit', 'submitPlacementForm', ACT_EVENT, existingData?.id ? Number(existingData.id) : null)}>
        <div class="form-row">
          <div class="form-group">
            <label>Project *</label>
            ${lockProject ? `
            <input type="text" value="${escAttr(projects[0].CustomerName)}" disabled style="background:var(--surface-sunken);color:var(--text-label);">
            <input type="hidden" name="ProjectID" value="${projects[0].id}">` : `
            <select name="ProjectID" required${actOn('change', 'formsPlacementProjectChanged', ACT_VALUE, !!canLogOnBehalf)}>
              <option value="">-- Select project --</option>
              ${projectOptions}
            </select>`}
          </div>
          <div class="form-group">
            <label>Headcount *</label>
            <select name="HeadcountID" id="placement-hc-select" required
              ${actOn('change', 'formsPlacementHeadcountChanged', ACT_EL)}
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
          <button type="button" class="btn-secondary"${act('navigateTo', 'placements')}>Cancel</button>
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
// ── Placement form submit: validate → build → write ─────────────────────
async function submitPlacementForm(event, editId = null) {
  event.preventDefault();
  clearFormError('placement-form');
  const form = document.getElementById('placement-form');
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const data = Object.fromEntries(new FormData(form));
  const fail = msg => { clearButtonLoading(btn); showFormError('placement-form', msg); };

  // N-308 S-3: validate the chosen headcount against a fresh read BEFORE any
  // write or optimistic apply. Fail closed — nothing is saved on a refusal.
  const checked = await _placementValidate(data, editId, fail);
  if (!checked) return;
  const { target, stored, currentHeadcountId } = checked;
  const roleId = target.roleId;
  // N-369: the write gate — fails closed.
  const gate = await checkRoleWrites(roleId, stored && stored.RoleIDLookupId);
  if (!gate.ok) { fail(gate.reason); return; }
  const fields = _placementBuildFields(data, target, editId);
  if (editId) {
    await _placementWriteEdit(editId, fields, stored, currentHeadcountId, roleId, fail);
    return;
  }
  await _placementWriteNew(fields, data, roleId);
}

// Step 1: returns { target, stored, currentHeadcountId }, or null after fail() has fired.
async function _placementValidate(data, editId, fail) {
  if (!data.HeadcountID) { fail('Pick a headcount.'); return null; }
  let target, stored = null;
  try {
    if (editId) stored = await getItem('Placements', editId);
    target = await getPlacementTarget(data.HeadcountID);
  } catch (e) {
    console.warn('N-308: placement headcount check failed', e);
    fail("Couldn't check the headcount — nothing saved.");
    return null;
  }
  const currentHeadcountId = stored && stored.HeadcountID !== null && stored.HeadcountID !== undefined && stored.HeadcountID !== ''
    ? stored.HeadcountID : null;
  const v = validatePlacementHeadcount({
    headcount: target.headcount, state: target.state,
    currentHeadcountId, excludePlacementId: editId,
  });
  if (!v.ok) { fail(v.reason); return null; }
  return { target, stored, currentHeadcountId };
}

// Step 2: pure — the Placements field set.
function _placementBuildFields(data, target, editId) {
  const offerDate = isoDate(data.OfferAcceptedDate);
  const startDate = isoDate(data.ProvisionalStartDate);
  const timeToHire = placementTimeToHire(target.headcount.OpenDate, offerDate);
  const fields = {
    RoleIDLookupId:       target.roleId,
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
  return fields;
}

// Step 3a: edit. A moved placement frees its old headcount (S-5).
async function _placementWriteEdit(editId, fields, stored, currentHeadcountId, roleId, fail) {
  // N-218a: optimistic insert is a create-only concept; edits write directly.
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
}

// Step 3b: create — optimistic insert, then the follow-up prompts (only after a successful write).
async function _placementWriteNew(fields, data, roleId) {
  try {
    await optimisticWrite({
      apply: () => {
        const pendingItem = { id: pendingRowId(), ...normaliseFields('Placements', fields) };
        navigateTo('placements', pendingItem);
      },
      revert: async () => { await renderPlacementsPage(); },
      commit: () => _placementCommitNew(fields, data, roleId),
      errorMessage: 'Error saving placement — change reverted.',
    });
    await renderPlacementsPage();
  } catch (e) {
    // optimisticWrite() already reverted the view and showed a Retry toast.
    return;
  }
  await _placementFollowUp(roleId);
}

async function _placementCommitNew(fields, data, roleId) {
  const created = await createItem('Placements', fields);
  await _placementNotify(created, data, roleId);
  return created;
}

// Placement notifications. Order matters (see submitPlacementForm): role → project → "landed" → prior count →
// first-placement rows.
async function _placementNotify(created, data, roleId) {
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
  if (prior === 0) await _placementNotifyFirst(data, role, projId, proj);
}

async function _placementNotifyFirst(data, role, projId, proj) {
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

// N-302b: delegated actions (js/actions.js) — replace inline handlers that held a second statement; the
// condition arrives as data (canLogOnBehalf).
function formsPlacementProjectChanged(projectId, canLogOnBehalf) {
  loadHeadcountForPlacement(projectId);
  if (canLogOnBehalf) loadTalentPartnersForPlacement(projectId);
}
// The headcount <select>: the role id rides on the chosen <option>'s data-role-id.
function formsPlacementHeadcountChanged(selectEl) {
  const opt = selectEl.selectedOptions[0];
  loadCurrencyForPlacement(opt ? opt.dataset.roleId : '');
}

registerActions({
  submitPlacementForm,
  formsPlacementProjectChanged,
  formsPlacementHeadcountChanged,
});
