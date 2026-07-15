// js/mobile-roleform.js - Mobile "Add Role" form (Reporting module)
//
// Phase B, Reporting expansion #1: add a new role from the mobile roles list.
// Mirrors the desktop renderRoleForm/submitRoleForm field set and writes the
// IDENTICAL createItem('Roles', fields) payload, so mobile-created roles match
// desktop-created ones exactly.
//
// Role-aware, same as desktop:
//   - admin / delivery_manager: choose project, then assign to a Talent Partner.
//   - talent_partner: project auto-scoped; role assigned to themselves.

const M_ROLE_STAGES = [
  'Backlog','Planning','Sourcing','Submitted','Interview 1','Interview 2+',
  'Final Interview','Offered','Hired','On-hold','Cancelled'
];

// Add 45 days to a yyyy-mm-dd string -> yyyy-mm-dd.
function mRoleAddDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

async function mobileRenderAddRole(main) {
  mobileSetTitle('Add Role', 'New Role');
  main.innerHTML = '<div class="m-empty">Loading...</div>';

  try {
    const user     = getCurrentUser();
    const email    = user.email;
    const canAssign = ['admin', 'delivery_manager'].includes(_mobileRole);
    const isTP      = _mobileRole === 'talent_partner';

    const projects = await getScopedProjects(email, false);
    const lockProject = isTP && projects.length === 1;

    const projectOpts = [...projects]
      .sort((a, b) => (a.CustomerName || '').localeCompare(b.CustomerName || ''))
      .map(p => `<option value="${p.id}">${p.CustomerName}</option>`).join('');

    // Functional areas (global)
    let deptOpts = '<option value="">- Select functional area -</option>';
    try {
      const depts = (await getDepartments()).sort((a, b) =>
        a.DepartmentName.localeCompare(b.DepartmentName));
      deptOpts += depts.map(d =>
        `<option value="${d.DepartmentName}">${d.DepartmentName}</option>`).join('');
    } catch (e) { /* leave empty */ }

    const locationOpts = '<option value="">- Select location -</option>' +
      Object.keys(CONFIG.COUNTRY_CURRENCY).sort().map(c =>
        `<option value="${c}">${c}</option>`).join('');

    const stageOpts = M_ROLE_STAGES.map(s =>
      `<option value="${s}" ${s === 'Backlog' ? 'selected' : ''}>${s}</option>`).join('');

    main.innerHTML = `
      <div class="m-detail-panel">
        <div class="m-form-group">
          <label class="m-label">Project *</label>
          ${lockProject ? `
            <input class="m-input" readonly value="${projects[0].CustomerName}">
            <input type="hidden" id="mr-project" value="${projects[0].id}">` : `
            <select class="m-select" id="mr-project" ${canAssign ? 'onchange="mobileLoadTPsForRole(this.value)"' : ''}>
              <option value="">- Select project -</option>
              ${projectOpts}
            </select>`}
        </div>

        ${canAssign ? `
        <div class="m-form-group">
          <label class="m-label">Assign to * (tick one or more)</label>
          <div id="mr-tp" style="border:1px solid #ccc;border-radius:8px;padding:10px;max-height:180px;overflow-y:auto;background:#fff;">
            <span style="color:#888;">- Select project first -</span>
          </div>
        </div>` : `<input type="hidden" id="mr-tp" value="${email}">`}

        <div class="m-form-group">
          <label class="m-label">Role Title *</label>
          <input class="m-input" type="text" id="mr-title" placeholder="e.g. Senior Engineer">
        </div>

        <div class="m-form-group">
          <label class="m-label">Hiring Manager</label>
          <input class="m-input" type="text" id="mr-hm">
        </div>

        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Location *</label>
            <select class="m-select" id="mr-location" onchange="mobileRoleCurrency(this.value)">
              ${locationOpts}
            </select>
          </div>
          <div class="m-form-group">
            <label class="m-label">Currency</label>
            <input class="m-input" readonly id="mr-currency" placeholder="Auto">
          </div>
        </div>

        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Stage *</label>
            <select class="m-select" id="mr-stage">${stageOpts}</select>
          </div>
          <div class="m-form-group">
            <label class="m-label">Functional Area *</label>
            <select class="m-select" id="mr-dept">${deptOpts}</select>
          </div>
        </div>

        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Priority</label>
            <select class="m-select" id="mr-priority">
              <option value="">--</option>
              <option value="1">1 - High</option>
              <option value="2">2 - Medium</option>
              <option value="3">3 - Low</option>
            </select>
          </div>
          <div class="m-form-group">
            <label class="m-label">Budget</label>
            <input class="m-input" type="number" id="mr-budget" placeholder="e.g. 60000">
          </div>
        </div>

        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Open Date</label>
            <input class="m-input" type="date" id="mr-open" onchange="mobileRoleAutoTarget()">
          </div>
          <div class="m-form-group">
            <label class="m-label">Target Hire (auto +45d)</label>
            <input class="m-input" type="date" id="mr-target">
          </div>
        </div>

        <div class="m-form-error" id="mr-error"></div>
      </div>

      <div class="m-action-row">
        <button class="m-btn-primary" id="mr-submit" onclick="mobileSubmitAddRole()">
          Add Role
        </button>
      </div>
    `;
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error: ${e.message}</div>`;
  }
}

async function mobileLoadTPsForRole(projectId) {
  const box = document.getElementById('mr-tp');
  if (!box) return;
  if (!projectId) { box.innerHTML = '<span style="color:#888;">- Select project first -</span>'; return; }
  box.innerHTML = '<span style="color:#888;">Loading...</span>';
  try {
    const tps = await getTalentPartnersForProject(projectId);
    const me  = getCurrentUser().email.toLowerCase();
    box.innerHTML = tps.map(u => `
      <label style="display:block;font-weight:normal;margin:3px 0;">
        <input type="checkbox" class="mr-tp-check" value="${u.UserEmail}"
          ${(u.UserEmail || '').toLowerCase() === me ? 'checked' : ''}>
        ${u.UserName || u.UserEmail}
      </label>`).join('') || '<span style="color:#888;">- No team members -</span>';
  } catch (e) {
    box.innerHTML = '<span style="color:#c00;">- Error loading team -</span>';
  }
}

function mobileRoleCurrency(country) {
  const el = document.getElementById('mr-currency');
  if (el) el.value = CONFIG.COUNTRY_CURRENCY[country] || '';
}

function mobileRoleAutoTarget() {
  const open = document.getElementById('mr-open').value;
  const target = document.getElementById('mr-target');
  if (open && !target.value) target.value = mRoleAddDays(open, 45);
}

async function mobileSubmitAddRole() {
  const btn   = document.getElementById('mr-submit');
  const errEl = document.getElementById('mr-error');
  errEl.style.display = 'none';

  const projectId = document.getElementById('mr-project').value;
  const tpEl = document.getElementById('mr-tp');
  const tp   = tpEl.tagName === 'INPUT'
    ? tpEl.value   // TP path: hidden input, own email
    : [...tpEl.querySelectorAll('.mr-tp-check:checked')].map(cb => cb.value).join(';');
  const title     = document.getElementById('mr-title').value.trim();
  const location  = document.getElementById('mr-location').value;
  const stage     = document.getElementById('mr-stage').value;
  const dept      = document.getElementById('mr-dept').value;

  const fail = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };

  if (!projectId) return fail('Please select a project.');
  if (!tp)        return fail('Please choose who to assign the role to.');
  if (!title)     return fail('Please enter a role title.');
  if (!location)  return fail('Please select a location.');
  if (!dept)      return fail('Please select a functional area.');

  const isoDate = d => d ? d + 'T12:00:00Z' : undefined;
  const openVal   = document.getElementById('mr-open').value;
  const targetVal = document.getElementById('mr-target').value;
  const budgetVal = document.getElementById('mr-budget').value;
  const priVal    = document.getElementById('mr-priority').value;
  const hmVal     = document.getElementById('mr-hm').value.trim();

  btn.disabled = true; btn.textContent = 'Saving...';

  // IDENTICAL payload shape to desktop submitRoleForm.
  const fields = {
    ProjectIDLookupId: parseInt(projectId),
    Title:          title,
    HiringManager:  hmVal || undefined,
    TalentPartner:  tp || undefined,
    Budget:         budgetVal ? parseFloat(budgetVal) : undefined,
    Currency:       location || undefined,   // desktop stores Location in Currency field
    Priority:       priVal ? parseInt(priVal) : undefined,
    Stage:          stage,
    OpenDate:       isoDate(openVal),
    TargetHireDate: isoDate(targetVal),
    Department:     dept || undefined,
  };

  try {
    await createItem('Roles', fields);
    if (typeof mobileInvalidateRolesCache === 'function') mobileInvalidateRolesCache();
    mobileToast('Role added ✓');
    // Back to the roles list (refreshed).
    mobileNav('roles', false);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Add Role';
    fail('Error: ' + e.message);
  }
}
