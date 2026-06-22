// js/mobile-pages.js — Mobile view renderers

const STAGES = [
  'Backlog','Planning','Sourcing','Submitted',
  'Interview 1','Interview 2+','Final Interview',
  'Offered','Hired','On-hold','Cancelled'
];

// ── Roles List ────────────────────────────────────────────────────────

async function mobileRenderRoles(main) {
  mobileSetTitle('Newton', 'My Roles');
  main.innerHTML = '<div class="m-empty">Loading roles…</div>';

  try {
    const roles = await mobileGetRoles();

    if (!roles.length) {
      main.innerHTML = `
        <div class="m-action-row" style="margin-bottom:14px">
          <button class="m-btn-primary" onclick="mobileNav('add-role')">+ Add Role</button>
        </div>
        <div class="m-empty">No active roles assigned to you.</div>`;
      return;
    }

    // Group by project
    const byProject = {};
    roles.forEach(r => {
      const key = r.CustomerName || r.ProjectID || 'Unknown Project';
      if (!byProject[key]) byProject[key] = [];
      byProject[key].push(r);
    });

    let html = `
      <div class="m-action-row" style="margin-bottom:14px">
        <button class="m-btn-primary" onclick="mobileNav('add-role')">+ Add Role</button>
      </div>`;
    for (const [project, projectRoles] of Object.entries(byProject)) {
      html += `<div class="m-section-header">${project}</div>`;
      html += projectRoles.map(r => {
        const days = r.OpenDate
          ? Math.floor((Date.now() - new Date(r.OpenDate)) / 86400000)
          : null;
        const daysClass = days === null ? '' : days >= 45 ? 'alert' : days >= 30 ? 'warn' : '';
        const daysLabel = days !== null ? `${days}d open` : '';
        return `
          <div class="m-role-card" onclick="mobileSelectRole(${r.id})">
            <div class="m-role-title">${r.RoleTitle}</div>
            <div class="m-role-meta">${r.TalentPartner || ''}</div>
            <div class="m-role-footer">
              <span class="m-stage-badge">${r.Stage || '—'}</span>
              ${daysLabel ? `<span class="m-days-open ${daysClass}">${daysLabel}</span>` : ''}
            </div>
          </div>`;
      }).join('');
    }

    main.innerHTML = html;
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error loading roles: ${e.message}</div>`;
  }
}

async function mobileGetRoles() {
  const user = getCurrentUser();
  // DM and admin see all roles across their projects; TP sees their own
  const isDM = ['delivery_manager', 'admin'].includes(_mobileRole);
  const projects = await getScopedProjects(user.email, false);
  const projectIds = new Set(projects.map(p => String(p.id)));

  let allRoles = await getAllRoles();

  // Filter to accessible projects
  allRoles = allRoles.filter(r => projectIds.has(String(r.ProjectID)));

  // TP: scoped to their own roles only
  if (!isDM) {
    allRoles = allRoles.filter(r =>
      r.TalentPartner?.toLowerCase() === user.email.toLowerCase()
    );
  }

  // Exclude terminal stages
  return allRoles.filter(r => !['Hired','Cancelled'].includes(r.Stage));
}

// ── Role Detail ───────────────────────────────────────────────────────

async function mobileSelectRole(roleId) {
  _mobileRoleId = roleId;
  mobileNav('role-detail');
}

async function mobileRenderRoleDetail(main) {
  main.innerHTML = '<div class="m-empty">Loading…</div>';
  try {
    const role = await getItem('Roles', _mobileRoleId);
    mobileSetTitle(role.RoleTitle, role.CustomerName || 'Role Detail');

    const days = role.OpenDate
      ? Math.floor((Date.now() - new Date(role.OpenDate)) / 86400000)
      : null;

    main.innerHTML = `
      <div class="m-detail-panel">
        <div class="m-detail-label">Project</div>
        <div class="m-detail-value">${role.CustomerName || '—'}</div>
        <div class="m-detail-label">Stage</div>
        <div class="m-detail-value">${role.Stage || '—'}</div>
        <div class="m-detail-label">Talent Partner</div>
        <div class="m-detail-value">${role.TalentPartner || '—'}</div>
        <div class="m-detail-label">Open Date</div>
        <div class="m-detail-value">${role.OpenDate ? role.OpenDate.split('T')[0] : '—'}${days !== null ? ` (${days} days)` : ''}</div>
        <div class="m-detail-label">Target Hire Date</div>
        <div class="m-detail-value">${role.TargetHireDate ? role.TargetHireDate.split('T')[0] : '—'}</div>
      </div>

      <div class="m-action-row">
        <button class="m-btn-primary" onclick="mobileNav('stage-update')">
          Update Stage
        </button>
        <button class="m-btn-secondary" onclick="mobileNav('activity-role')">
          Log Weekly Activity
        </button>
        <button class="m-btn-secondary" onclick="mobileNav('placement-role')">
          Record Placement
        </button>
      </div>
    `;
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error: ${e.message}</div>`;
  }
}

// ── Stage Update ──────────────────────────────────────────────────────

async function mobileRenderStageUpdate(main) {
  main.innerHTML = '<div class="m-empty">Loading…</div>';
  try {
    const role = await getItem('Roles', _mobileRoleId);
    mobileSetTitle('Update Stage', role.RoleTitle);

    const stageButtons = STAGES.map(s => `
      <button class="m-stage-btn ${role.Stage === s ? 'active' : ''}"
        id="stage-btn-${s.replace(/\s+/g,'_').replace(/\+/g,'plus')}"
        onclick="mobileSelectStage(this, '${s}')">
        ${s}
      </button>`).join('');

    main.innerHTML = `
      <div class="m-detail-panel">
        <div class="m-detail-label">Current Stage</div>
        <div class="m-detail-value" id="m-current-stage">${role.Stage || '—'}</div>
        <div class="m-stage-grid">${stageButtons}</div>
      </div>
      <div class="m-action-row">
        <button class="m-btn-primary" id="m-save-stage-btn"
          onclick="mobileSaveStage()" disabled>
          Save Stage
        </button>
      </div>
    `;
    main._selectedStage = role.Stage;
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error: ${e.message}</div>`;
  }
}

function mobileSelectStage(btn, stage) {
  document.querySelectorAll('.m-stage-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('m-main')._selectedStage = stage;
  document.getElementById('m-save-stage-btn').disabled = false;
}

async function mobileSaveStage() {
  const stage = document.getElementById('m-main')._selectedStage;
  const btn   = document.getElementById('m-save-stage-btn');
  if (!stage) return;
  btn.disabled    = true;
  btn.textContent = 'Saving…';
  try {
    await updateItem('Roles', _mobileRoleId, { Stage: stage });
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

    const today       = new Date().toISOString().split('T')[0];
    const weekEnding  = getWeekEnding(today);
    const projectOpts = projects.map(p =>
      `<option value="${p.id}">${p.CustomerName}</option>`
    ).join('');

    main.innerHTML = `
      <div class="m-detail-panel">
        ${rolePreselected && _mobileRoleId ? `
          <div class="m-form-group">
            <div class="m-label">Role</div>
            <input class="m-input" readonly value="${roleName}">
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
    main.innerHTML = `<div class="m-empty">Error: ${e.message}</div>`;
  }
}

async function mobileLoadRolesForActivity(projectId) {
  const sel = document.getElementById('ma-role-select');
  if (!projectId) { sel.innerHTML = '<option value="">— select project first —</option>'; return; }
  sel.innerHTML = '<option value="">Loading…</option>';
  const roles = await getRolesForProject(projectId);
  sel.innerHTML = '<option value="">— select role —</option>' +
    roles.filter(r => !['Hired','Cancelled'].includes(r.Stage))
         .map(r => `<option value="${r.id}">${r.RoleTitle}</option>`).join('');
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

  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const isoDate = d => d ? d + 'T12:00:00Z' : null;

  try {
    await createItem('WeeklyActivity', {
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
    });
    mobileToast('Activity saved ✓');
    if (rolePreselected) {
      mobileNav('role-detail', false);
    } else {
      mobileNav('roles');
    }
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = 'Save Activity';
    errEl.textContent   = 'Error: ' + e.message;
    errEl.style.display = 'block';
  }
}

// ── Placement Form ────────────────────────────────────────────────────

async function mobileRenderPlacementForm(main, rolePreselected) {
  main.innerHTML = '<div class="m-empty">Loading…</div>';
  try {
    const user     = getCurrentUser();
    const projects = await getScopedProjects(user.email, false);
    let   roleName = '';
    let   currency = '';

    if (rolePreselected && _mobileRoleId) {
      const role = await getItem('Roles', _mobileRoleId);
      roleName   = role.RoleTitle;
      currency   = CONFIG.COUNTRY_CURRENCY[role.Currency] || '';
      mobileSetTitle('Record Placement', roleName);
    } else {
      _mobileRoleId = null;
      mobileSetTitle('Record Placement', 'New Placement');
    }

    const projectOpts = projects.map(p =>
      `<option value="${p.id}">${p.CustomerName}</option>`
    ).join('');

    const today = new Date().toISOString().split('T')[0];

    main.innerHTML = `
      <div class="m-detail-panel">
        ${rolePreselected && _mobileRoleId ? `
          <div class="m-form-group">
            <div class="m-label">Role</div>
            <input class="m-input" readonly value="${roleName}">
            <input type="hidden" id="mp-role-id" value="${_mobileRoleId}">
          </div>` : `
          <div class="m-form-group">
            <label class="m-label">Project *</label>
            <select class="m-select" id="mp-project-select"
              onchange="mobileLoadRolesForPlacement(this.value)">
              <option value="">— select project —</option>
              ${projectOpts}
            </select>
          </div>
          <div class="m-form-group">
            <label class="m-label">Role *</label>
            <select class="m-select" id="mp-role-select"
              onchange="mobileLoadCurrencyForPlacement(this.value)">
              <option value="">— select project first —</option>
            </select>
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
        <button class="m-btn-primary" id="mp-submit-btn" onclick="mobileSubmitPlacement(${rolePreselected})">
          Record Placement
        </button>
      </div>
    `;
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error: ${e.message}</div>`;
  }
}

async function mobileLoadRolesForPlacement(projectId) {
  const sel = document.getElementById('mp-role-select');
  const cur = document.getElementById('mp-currency');
  if (!projectId) { sel.innerHTML = '<option value="">— select project first —</option>'; return; }
  sel.innerHTML = '<option value="">Loading…</option>';
  if (cur) cur.value = '';
  const roles = await getRolesForProject(projectId);
  sel.innerHTML = '<option value="">— select role —</option>' +
    roles.filter(r => !['Hired','Cancelled'].includes(r.Stage))
         .map(r => `<option value="${r.id}">${r.RoleTitle}</option>`).join('');
}

async function mobileLoadCurrencyForPlacement(roleId) {
  const cur = document.getElementById('mp-currency');
  if (!cur || !roleId) return;
  try {
    const role = await getItem('Roles', roleId);
    cur.value  = CONFIG.COUNTRY_CURRENCY[role.Currency] || '';
  } catch (e) { cur.value = ''; }
}

async function mobileSubmitPlacement(rolePreselected) {
  const btn    = document.getElementById('mp-submit-btn');
  const errEl  = document.getElementById('mp-error');
  const user   = getCurrentUser();
  errEl.style.display = 'none';

  const roleId    = rolePreselected
    ? parseInt(document.getElementById('mp-role-id').value)
    : parseInt(document.getElementById('mp-role-select')?.value);
  const candidate = document.getElementById('mp-candidate').value.trim();

  if (!roleId)    { errEl.textContent = 'Please select a role.';           errEl.style.display = 'block'; return; }
  if (!candidate) { errEl.textContent = 'Please enter a candidate name.';  errEl.style.display = 'block'; return; }

  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const isoDate   = d => d ? d + 'T12:00:00Z' : null;
  const offerDate = isoDate(document.getElementById('mp-offer-date').value);
  const startDate = isoDate(document.getElementById('mp-start-date').value);

  let timeToHire;
  try {
    const role = await getItem('Roles', roleId);
    if (role.OpenDate && offerDate) {
      timeToHire = Math.round(
        (new Date(offerDate) - new Date(role.OpenDate)) / (1000 * 60 * 60 * 24)
      );
    }
  } catch (e) { /* non-critical */ }

  try {
    await createItem('Placements', {
      RoleIDLookupId:       roleId,
      Title:                candidate,
      TalentPartner:        user.email,
      SalaryAgreed:         document.getElementById('mp-salary').value || undefined,
      Currency:             document.getElementById('mp-currency').value || undefined,
      OfferAcceptedDate:    offerDate || undefined,
      ProvisionalStartDate: startDate || undefined,
      TimeToHire:           timeToHire,
    });

    if (startDate) await updateItem('Roles', roleId, { CurrentStartDate: startDate });
    if (offerDate) await updateItem('Roles', roleId, { ActualHireDate: offerDate });

    mobileToast('Placement recorded ✓');
    if (rolePreselected) {
      mobileNav('role-detail', false);
    } else {
      mobileNav('roles');
    }
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = 'Record Placement';
    errEl.textContent   = 'Error: ' + e.message;
    errEl.style.display = 'block';
  }
}
