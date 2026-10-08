// js/mobile-pages.js — Mobile view renderers
// Stage lists come from CONFIG (N-305) — never redeclare one here.

async function mobileGetRoles() {
  const user = getCurrentUser();
  // DM and admin see all roles across their projects; TP sees their own
  const isDM = ['delivery_manager', 'admin'].includes(_mobileRole);
  const projects = await getScopedProjects(user.email, false);
  const projectIds = new Set(projects.map(p => String(p.id)));

  let allRoles = await getAllRoles();

  // Filter to accessible projects
  allRoles = allRoles.filter(r => projectIds.has(String(r.ProjectIDLookupId || r.ProjectID)));

  // TP: scoped to their own roles only
  if (!isDM) {
    allRoles = allRoles.filter(r =>
      tpMatches(r.TalentPartner, user.email)
    );
  }

  // Exclude terminal stages
  return allRoles.filter(r => !CONFIG.ROLE_STAGE_TERMINAL.includes(r.Stage));
}

// ── Role Detail ───────────────────────────────────────────────────────

async function mobileSelectRole(roleId) {
  _mobileRoleId = roleId;
  mobileNav('role-detail');
}

async function mobileRenderRoleDetail(main) {
  main.innerHTML = '<div class="m-empty">Loading…</div>';
  try {
    // N-310 (S-10): read-only headcount summary (the Headcount section itself
    // stays desktop-only, D-6). A failed headcount read falls back to
    // Roles.OpenDate for "Oldest open" and "—" for the rest.
    const [role, hcState] = await Promise.all([
      getItem('Roles', _mobileRoleId),
      getRoleHeadcountState(_mobileRoleId).catch(e => { console.warn('N-310: headcount read failed', e); return null; }),
    ]);
    mobileSetTitle(role.RoleTitle, role.CustomerName || 'Role Detail');

    const openDay = hcState
      ? headcountSummary(hcState.rows, hcState.fillMap).oldestOpenDay
      : pipelineOpenDay(role, null);
    const days       = openDay ? daysOpen(openDay) : null;
    const nextTarget = hcState ? nextOpenTargetDay(hcState.rows, hcState.fillMap) : null;
    const hcXY       = hcState ? headcountXY(hcState.counts) : '—';
    const hcTitle    = hcState ? headcountXYTitle(hcState.counts) : '';

    main.innerHTML = `
      <div class="m-detail-panel">
        <div class="m-detail-label">Project</div>
        <div class="m-detail-value">${escHtml(role.CustomerName || '—')}</div>
        <div class="m-detail-label">Stage</div>
        <div class="m-detail-value">${escHtml(role.Stage || '—')}</div>
        <div class="m-detail-label">Talent Partner</div>
        <div class="m-detail-value">${escHtml(tpList(role.TalentPartner).join(', ')) || '—'}</div>
        <div class="m-detail-label">Headcount</div>
        <div class="m-detail-value"${hcTitle ? ` title="${escAttr(hcTitle)}"` : ''}>${escHtml(hcXY)}</div>
        <div class="m-detail-label">Oldest open</div>
        <div class="m-detail-value">${openDay || '—'}${days !== null ? ` (${days} days)` : ''}</div>
        <div class="m-detail-label">Next target hire</div>
        <div class="m-detail-value">${nextTarget || '—'}</div>
      </div>

      <div class="m-action-row">
        <button class="m-btn-primary" onclick="mobileNav('stage-update')">
          Update Stage
        </button>
        <button class="m-btn-secondary" onclick="mobileOpenActivitySheet(true)">
          Log Weekly Activity
        </button>
        <button class="m-btn-secondary" onclick="mobileOpenPlacementSheet(true)">
          Record Placement
        </button>
        <button class="m-btn-secondary" onclick="mobileOpenRejectionSheet(true)">
          Log Rejection
        </button>
      </div>
    `;
  } catch (e) {
    main.innerHTML = mobilePageError(e.message, `mobileRenderRoleDetail(document.getElementById('m-main'))`);
  }
}

// ── Stage Update ──────────────────────────────────────────────────────

async function mobileRenderStageUpdate(main) {
  main.innerHTML = '<div class="m-empty">Loading…</div>';
  try {
    const role = await getItem('Roles', _mobileRoleId);
    mobileSetTitle('Update Stage', role.RoleTitle);
    // N-307: the role's headcount counts — a UI hint for the D-2 Close block
    // and the D-1 cascade warning. A failed read leaves null; mobileSaveStage
    // re-checks authoritatively through checkRoleStageChange either way.
    let hcCounts = null;
    try {
      hcCounts = (await getRoleHeadcountState(_mobileRoleId)).counts;
    } catch (e) {
      console.warn('N-307: headcount read failed for role ' + _mobileRoleId, e);
    }
    const closeBlocked = !!(hcCounts && hcCounts.open > 0) && role.Stage !== CONFIG.ROLE_STAGE_CLOSED;

    const stageButtons = CONFIG.ROLE_STAGES.map(s => `
      <button class="m-stage-btn ${role.Stage === s ? 'active' : ''}"
        id="stage-btn-${s.replace(/\s+/g,'_').replace(/\+/g,'plus')}"
        ${closeBlocked && s === CONFIG.ROLE_STAGE_CLOSED ? 'disabled' : ''}
        onclick="mobileSelectStage(this, '${s}')">
        ${s}
      </button>`).join('');

    main.innerHTML = `
      <div class="m-detail-panel">
        <div class="m-detail-label">Current Stage</div>
        <div class="m-detail-value" id="m-current-stage">${escHtml(role.Stage || '—')}</div>
        <div class="m-stage-grid">${stageButtons}</div>
        ${closeBlocked ? `<div class="m-form-hint">Close is blocked while ${hcCounts.open} headcount ${hcCounts.open === 1 ? 'is' : 'are'} open.</div>` : ''}
        <div class="m-form-hint" id="m-stage-cascade" hidden></div>
      </div>
      <div class="m-action-row">
        <button class="m-btn-primary" id="m-save-stage-btn"
          onclick="mobileSaveStage()" disabled>
          Save Stage
        </button>
      </div>
    `;
    main._selectedStage = role.Stage;
    main._hcCounts = hcCounts;
  } catch (e) {
    main.innerHTML = mobilePageError(e.message, `mobileRenderStageUpdate(document.getElementById('m-main'))`);
  }
}

function mobileSelectStage(btn, stage) {
  document.querySelectorAll('.m-stage-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const main = document.getElementById('m-main');
  main._selectedStage = stage;
  const saveBtn = document.getElementById('m-save-stage-btn');
  saveBtn.disabled = false;
  // N-307 (D-1): cancelling a pipeline also cancels its open headcount — say
  // so before Save, and relabel Save so the tap is the confirmation.
  const open = main._hcCounts ? main._hcCounts.open : 0;
  const cascade = stage === 'Cancelled' && open > 0;
  const note = document.getElementById('m-stage-cascade');
  if (note) {
    note.textContent = cascade ? `Cancelling also cancels ${open} open headcount.` : '';
    note.hidden = !cascade;
  }
  saveBtn.textContent = cascade ? 'Cancel pipeline' : 'Save Stage';
}

async function mobileSaveStage() {
  const stage = document.getElementById('m-main')._selectedStage;
  const btn   = document.getElementById('m-save-stage-btn');
  if (!stage) return;
  const label = btn.textContent;
  btn.disabled    = true;
  btn.textContent = 'Saving…';
  // N-307: the Stage rule (D-1 / D-2 / S-2) — fails closed.
  let check;
  try {
    check = await checkRoleStageChange(_mobileRoleId, stage);
  } catch (e) {
    check = { ok: false, reason: "Couldn't check this role's headcount — stage not changed." };
  }
  if (!check.ok) {
    btn.disabled    = false;
    btn.textContent = label;
    mobileToast(check.reason, { type: 'error' });
    return;
  }
  try {
    await updateRoleWithHistory(_mobileRoleId, { Stage: stage });
    if (check.cascadeCancel) {
      try {
        await cancelOpenHeadcount(_mobileRoleId, localDayISO());   // D-1, after the stage write
      } catch (e) {
        console.warn('N-307: headcount cascade cancel failed for role ' + _mobileRoleId, e);
        mobileToast("Pipeline cancelled, but its open headcount wasn't — cancel it on desktop.", { type: 'error' });
      }
    }
    if (typeof mobileInvalidateRolesCache === 'function') mobileInvalidateRolesCache();
    mobileToast('Stage updated ✓');
    mobileNav('role-detail', false);
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = 'Save Stage';
    mobileToast('Error: ' + e.message);
  }
}

// ── Weekly Activity Form ──────────────────────────────────────────────

async function mobileRenderActivityForm(main, rolePreselected) {
  main.innerHTML = '<div class="m-empty">Loading…</div>';
  try {
    const user     = getCurrentUser();
    const projects = await getScopedProjects(user.email, false);
    let   roleName = '';

    if (rolePreselected && _mobileRoleId) {
      const role = await getItem('Roles', _mobileRoleId);
      roleName   = role.RoleTitle;
      mobileSetTitle('Log Activity', roleName);
    } else {
      _mobileRoleId = null;
      mobileSetTitle('Log Activity', 'Weekly Activity');
    }

    const today       = localDayISO();
    const weekEnding  = getWeekEnding(today);
    // N-112: only Active/Transition projects are selectable
    const projectOpts = buildProjectOptionsHtml(sortProjectsByName(projects.filter(isProjectActive)), '');

    main.innerHTML = `
      <div class="m-detail-panel">
        ${rolePreselected && _mobileRoleId ? `
          <div class="m-form-group">
            <div class="m-label">Role</div>
            <input class="m-input" readonly value="${escAttr(roleName)}">
            <input type="hidden" id="ma-role-id" value="${_mobileRoleId}">
          </div>` : `
          <div class="m-form-group">
            <label class="m-label">Project *</label>
            <select class="m-select" id="ma-project-select"
              onchange="mobileLoadRolesForActivity(this.value)">
              <option value="">— select project —</option>
              ${projectOpts}
            </select>
          </div>
          <div class="m-form-group">
            <label class="m-label">Role *</label>
            <select class="m-select" id="ma-role-select">
              <option value="">— select project first —</option>
            </select>
          </div>`}

        <div class="m-form-group">
          <label class="m-label">Week Ending Date *</label>
          <input class="m-input" type="date" id="ma-week-ending"
            value="${weekEnding}">
        </div>

        <div class="m-section-header" style="margin-top:4px">Activity Counts</div>

        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Outreach</label>
            <input class="m-input" type="number" id="ma-outreach" min="0" value="0">
          </div>
          <div class="m-form-group">
            <label class="m-label">Responses</label>
            <input class="m-input" type="number" id="ma-responses" min="0" value="0">
          </div>
        </div>
        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Screened</label>
            <input class="m-input" type="number" id="ma-screened" min="0" value="0">
          </div>
          <div class="m-form-group">
            <label class="m-label">Submitted</label>
            <input class="m-input" type="number" id="ma-submitted" min="0" value="0">
          </div>
        </div>
        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Interview 1</label>
            <input class="m-input" type="number" id="ma-iv1" min="0" value="0">
          </div>
          <div class="m-form-group">
            <label class="m-label">Interview 2+</label>
            <input class="m-input" type="number" id="ma-iv2" min="0" value="0">
          </div>
        </div>
        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Final Interview</label>
            <input class="m-input" type="number" id="ma-final" min="0" value="0">
          </div>
          <div class="m-form-group">
            <label class="m-label">Offers</label>
            <input class="m-input" type="number" id="ma-offers" min="0" value="0">
          </div>
        </div>
        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Hires</label>
            <input class="m-input" type="number" id="ma-hires" min="0" value="0">
          </div>
          <div class="m-form-group"></div>
        </div>

        <div class="m-form-error" id="ma-error"></div>
      </div>

      <div class="m-action-row">
        <button class="m-btn-primary" id="ma-submit-btn" onclick="mobileSubmitActivity(${rolePreselected})">
          Save Activity
        </button>
      </div>
    `;
  } catch (e) {
    main.innerHTML = mobilePageError(e.message, `mobileRenderActivityForm(document.getElementById('m-sheet-body'), ${rolePreselected})`);
  }
}

async function mobileLoadRolesForActivity(projectId) {
  const sel = document.getElementById('ma-role-select');
  if (!projectId) { sel.innerHTML = '<option value="">— select project first —</option>'; return; }
  sel.innerHTML = '<option value="">Loading…</option>';
  const roles = await getRolesForProject(projectId);
  sel.innerHTML = '<option value="">— select role —</option>' +
    roles.filter(r => !CONFIG.ROLE_STAGE_TERMINAL.includes(r.Stage))
         .map(r => `<option value="${r.id}">${escHtml(r.RoleTitle)}</option>`).join('');
}

async function mobileSubmitActivity(rolePreselected) {
  const btn    = document.getElementById('ma-submit-btn');
  const errEl  = document.getElementById('ma-error');
  const user   = getCurrentUser();
  errEl.style.display = 'none';

  const roleId = rolePreselected
    ? parseInt(document.getElementById('ma-role-id').value)
    : parseInt(document.getElementById('ma-role-select')?.value);

  if (!roleId) {
    errEl.textContent = 'Please select a role.';
    errEl.style.display = 'block';
    return;
  }

  const weekEndingRaw = document.getElementById('ma-week-ending').value;
  if (!weekEndingRaw) {
    errEl.textContent = 'Please enter a week ending date.';
    errEl.style.display = 'block';
    return;
  }

  const fields = {
    RoleIDLookupId:   roleId,
    TalentPartner:    user.email,
    Yeare:            new Date(weekEndingRaw).getFullYear(),
    WeekNumber:       getISOWeek(weekEndingRaw),
    WeekEndingDate:   isoDate(weekEndingRaw),
    Outreach:         parseInt(document.getElementById('ma-outreach').value)  || 0,
    Responses:        parseInt(document.getElementById('ma-responses').value) || 0,
    Screened:         parseInt(document.getElementById('ma-screened').value)  || 0,
    Submitted:        parseInt(document.getElementById('ma-submitted').value) || 0,
    Interview1:       parseInt(document.getElementById('ma-iv1').value)       || 0,
    InterviewTwoPlus: parseInt(document.getElementById('ma-iv2').value)       || 0,
    FinalInterview:   parseInt(document.getElementById('ma-final').value)     || 0,
    Offers:           parseInt(document.getElementById('ma-offers').value)    || 0,
    Hires:            parseInt(document.getElementById('ma-hires').value)     || 0,
    SubmittedAt:      new Date().toISOString(),
  };

  // N-218d: close-immediately variant -- no list is on screen behind this
  // sheet to hold a pending row, so apply() only closes the sheet and
  // shows the success toast; revert() has nothing to undo.
  try {
    await optimisticWrite({
      apply:  () => { mobileCloseSheet(); mobileToast('Activity saved ✓'); },
      revert: () => {},
      commit: () => createItem('WeeklyActivity', fields),
      errorMessage: 'Error saving activity — change reverted.',
      toastFn: mobileToast,
    });
  } catch (e) {
    // optimisticWrite() already showed the error/Retry toast; the sheet is
    // already closed, so there's no form left to re-enable the button on.
  }
}

// ── Placement Form ────────────────────────────────────────────────────
// N-308 (HC-3): recorded against one OPEN headcount, same picker helpers as
// desktop (placementHeadcountGroups / placementHeadcountOptionsHtml). The
// role is taken from the chosen headcount at submit (getPlacementTarget).

async function mobileRenderPlacementForm(main, rolePreselected) {
  main.innerHTML = '<div class="m-empty">Loading…</div>';
  try {
    const user     = getCurrentUser();
    const projects = await getScopedProjects(user.email, false);
    let   roleName = '';
    let   currency = '';
    let   hcOptions = '';
    let   hcEmpty   = false;

    if (rolePreselected && _mobileRoleId) {
      const role = await getItem('Roles', _mobileRoleId);
      roleName   = role.RoleTitle;
      currency   = currencyForRole(role);
      mobileSetTitle('Record Placement', roleName);
      // This role's open headcount only (D-5 order), the first selected.
      const r = await _mobilePlacementHeadcountOptions(role.ProjectIDLookupId ?? role.ProjectID, _mobileRoleId);
      hcOptions = r.html;
      hcEmpty   = !r.selectedId;
    } else {
      _mobileRoleId = null;
      mobileSetTitle('Record Placement', 'New Placement');
    }

    // N-112: only Active/Transition projects are selectable
    const projectOpts = buildProjectOptionsHtml(sortProjectsByName(projects.filter(isProjectActive)), '');

    const today = localDayISO();
    const hint = '<div class="m-form-hint">Open headcount, earliest opened first. Not listed? Add headcount on the role page (desktop).</div>';

    main.innerHTML = `
      <div class="m-detail-panel">
        ${rolePreselected && _mobileRoleId ? `
          <div class="m-form-group">
            <div class="m-label">Role</div>
            <input class="m-input" readonly value="${escAttr(roleName)}">
          </div>
          <div class="m-form-group">
            <label class="m-label">Headcount *</label>
            <select class="m-select" id="mp-hc-select">${hcOptions}</select>
            ${hint}
          </div>` : `
          <div class="m-form-group">
            <label class="m-label">Project *</label>
            <select class="m-select" id="mp-project-select"
              onchange="mobileLoadHeadcountForPlacement(this.value)">
              <option value="">— select project —</option>
              ${projectOpts}
            </select>
          </div>
          <div class="m-form-group">
            <label class="m-label">Headcount *</label>
            <select class="m-select" id="mp-hc-select"
              onchange="mobileLoadCurrencyForPlacement(this.selectedOptions[0] ? this.selectedOptions[0].dataset.roleId : '')">
              <option value="">— select project first —</option>
            </select>
            ${hint}
          </div>`}

        <div class="m-form-group">
          <label class="m-label">Candidate Name *</label>
          <input class="m-input" type="text" id="mp-candidate" placeholder="Full name">
        </div>

        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Salary Agreed</label>
            <input class="m-input" type="number" id="mp-salary" placeholder="e.g. 65000">
          </div>
          <div class="m-form-group">
            <label class="m-label">Currency</label>
            <input class="m-input" readonly id="mp-currency"
              value="${currency}" placeholder="Auto-filled">
          </div>
        </div>

        <div class="m-form-group">
          <label class="m-label">Offer Accepted Date</label>
          <input class="m-input" type="date" id="mp-offer-date" value="${today}">
        </div>

        <div class="m-form-group">
          <label class="m-label">Provisional Start Date</label>
          <input class="m-input" type="date" id="mp-start-date">
        </div>

        <div class="m-form-error" id="mp-error"></div>
      </div>

      <div class="m-action-row">
        <button class="m-btn-primary" id="mp-submit-btn" onclick="mobileSubmitPlacement(${rolePreselected})"${hcEmpty ? ' disabled' : ''}>
          Record Placement
        </button>
      </div>
    `;
  } catch (e) {
    main.innerHTML = mobilePageError(e.message, `mobileRenderPlacementForm(document.getElementById('m-sheet-body'), ${rolePreselected})`);
  }
}

// N-308: Headcount options for one project (no Talent Partner filter on
// mobile, as before). onlyRoleId limits them to one pipeline and selects its
// first open headcount. Returns { html, selectedId }.
async function _mobilePlacementHeadcountOptions(projectId, onlyRoleId = null) {
  try {
    const data = await getPlacementPickerData(projectId);
    let groups = placementHeadcountGroups(data);
    if (onlyRoleId) groups = groups.filter(g => String(g.roleId) === String(onlyRoleId));
    const selectedId = onlyRoleId ? placementPreselectHeadcountId(groups, onlyRoleId) : null;
    return { html: placementHeadcountOptionsHtml(groups, selectedId), selectedId };
  } catch (e) {
    console.warn('N-308: headcount picker load failed for project ' + projectId, e);
    return { html: "<option value=\"\">— couldn't load headcount —</option>", selectedId: null };
  }
}

async function mobileLoadHeadcountForPlacement(projectId) {
  const sel = document.getElementById('mp-hc-select');
  const cur = document.getElementById('mp-currency');
  if (!projectId) { sel.innerHTML = '<option value="">— select project first —</option>'; return; }
  sel.innerHTML = '<option value="">Loading…</option>';
  if (cur) cur.value = '';
  sel.innerHTML = (await _mobilePlacementHeadcountOptions(projectId)).html;
}

async function mobileLoadCurrencyForPlacement(roleId) {
  const cur = document.getElementById('mp-currency');
  if (!cur) return;
  if (!roleId) { cur.value = ''; return; }
  cur.value = await getCurrencyForRole(roleId);
}

async function mobileSubmitPlacement(rolePreselected) {
  const btn    = document.getElementById('mp-submit-btn');
  const errEl  = document.getElementById('mp-error');
  const user   = getCurrentUser();
  errEl.style.display = 'none';
  const fail = msg => { errEl.textContent = msg; errEl.style.display = 'block'; if (btn) btn.disabled = false; };

  const headcountId = document.getElementById('mp-hc-select')?.value;
  const candidate   = document.getElementById('mp-candidate').value.trim();

  if (!headcountId) { fail('Please pick a headcount.');       return; }
  if (!candidate)   { fail('Please enter a candidate name.'); return; }
  if (btn) btn.disabled = true;

  // N-308 S-3: fresh check before any write. Fail closed.
  let target;
  try {
    target = await getPlacementTarget(headcountId);
  } catch (e) {
    console.warn('N-308: placement headcount check failed', e);
    fail("Couldn't check the headcount — nothing saved.");
    return;
  }
  const v = validatePlacementHeadcount({ headcount: target.headcount, state: target.state });
  if (!v.ok) { fail(v.reason); return; }

  const roleId    = target.roleId;
  const offerDate = isoDate(document.getElementById('mp-offer-date').value);
  const startDate = isoDate(document.getElementById('mp-start-date').value);

  const fields = {
    RoleIDLookupId:       roleId,
    Title:                candidate,
    TalentPartner:        user.email,
    SalaryAgreed:         document.getElementById('mp-salary').value || undefined,
    Currency:             document.getElementById('mp-currency').value || undefined,
    OfferAcceptedDate:    offerDate || undefined,
    ProvisionalStartDate: startDate || undefined,
    TimeToHire:           placementTimeToHire(target.headcount.OpenDate, offerDate) ?? undefined,
    HeadcountID:          Number(target.headcount.id),
  };

  // N-218d: close-immediately variant -- no list is on screen behind this
  // sheet to hold a pending row, so apply() only closes the sheet and
  // shows the success toast; revert() has nothing to undo.
  // N-308: no Roles writes (ActualHireDate / CurrentStartDate retired).
  try {
    await optimisticWrite({
      apply:  () => { mobileCloseSheet(); mobileToast('Placement recorded ✓'); },
      revert: () => {},
      commit: () => createItem('Placements', fields),
      errorMessage: 'Error saving placement — change reverted.',
      toastFn: mobileToast,
    });
  } catch (e) {
    // optimisticWrite() already showed the error/Retry toast; the sheet is
    // already closed, so there's no form left to re-enable the button on.
    return;
  }
  await _mobilePlacementFollowUp(roleId);
}

// N-308: mobile has no modal — the close / stage prompt is a toast whose
// action opens the Update Stage page for the pipeline (which applies the
// D-2 rule itself). A failed read asks nothing.
async function _mobilePlacementFollowUp(roleId) {
  let role, state;
  try {
    [role, state] = await Promise.all([getItem('Roles', roleId), getRoleHeadcountState(roleId)]);
  } catch (e) {
    console.warn('N-308: placement follow-up read failed for role ' + roleId, e);
    return;
  }
  const kind = placementFollowUp({ stage: role.Stage, counts: state.counts });
  if (!kind) return;
  const msg = kind === 'close'
    ? 'Last open headcount filled — close the pipeline?'
    : `${state.counts.open} headcount still open — update the stage?`;
  mobileToast(msg, { action: { label: 'Update stage', onClick: () => { _mobileRoleId = roleId; mobileNav('stage-update'); } } });
}
