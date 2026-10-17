// js/os-admin.js — Newton OS Admin (User Assignments + Leadership Access)
// N-246 — hoisted out of renderOsAdminPage() to module scope so admin.html's
// deep-link handler can validate a hash against the same list instead of
// keeping a second copy (single source of truth).
const ADMIN_TABS = ['assignments', 'leadership', 'homepage', 'ghost', 'datahealth'];
let _osAdminTab = 'assignments';
let _showInactiveAssignments = false;
let _osaSort   = null; // N-247c: { key, dir } — User Assignments table
let _osaSearch = '';   // N-247c: shared list search box (list-controls.js)
async function renderOsAdminPage(tab = 'assignments') {
  _osAdminTab = tab;
  const main = document.getElementById('main-content');
const tabs = ADMIN_TABS;
const labels = { assignments: 'User Assignments', leadership: 'Leadership Access', homepage: 'Homepage', ghost: 'Ghost Mode', datahealth: 'Data Health' };
const tooltips = {
  assignments: 'Manage user roles and project access. New users have no access until you add them here. Admin rows apply across all projects.',
  leadership:  'Grant Leadership-level access to users who should see the Company Dashboard without full system access.',
  homepage:    'Manage homepage appearance and seasonal effects.',
  ghost:       'Temporarily view Newton as a specific real user for testing or investigating a bug. Only visible to admins.',
  datahealth:  'Row counts per list and index status on the columns N-093 is about to filter server-side.',
};
  const tabBar = tabs.map(t =>
    `<button class="btn-filter${_osAdminTab === t ? ' active' : ''}"${act('renderOsAdminPage', t)}>${labels[t]}<span class="help-tip">?<span class="help-tip-text">${tooltips[t]}</span></span></button>`
  ).join('');
  let content = '';
  if (tab === 'assignments') content = await buildAssignmentsTab();
  if (tab === 'leadership')  content = await buildLeadershipTab();
  if (tab === 'homepage')    content = await buildHomepageTab();
  if (tab === 'ghost') content = await buildGhostTab();
  if (tab === 'datahealth') content = await buildDataHealthTab();
  main.innerHTML = `
    <div class="page-header">
      <h2>${labels[tab]}</h2>
      <div class="filter-group">${tabBar}</div>
    </div>
    <div style="padding:24px">${content}</div>
  `;
  lucide.createIcons();
}
// N-331: role <option>s from CONFIG.ASSIGNABLE_ROLES (order) and
// CONFIG.ROLE_LABELS (text) — no role list in this file. With no `selected`
// the browser shows the first entry (the Add form default).
function _osaRoleOptions(selected) {
  return CONFIG.ASSIGNABLE_ROLES.map(r =>
    `<option value="${escAttr(r)}"${r === selected ? ' selected' : ''}>${escHtml(CONFIG.ROLE_LABELS[r] || r)}</option>`
  ).join('');
}

// ── Assignments Tab ──────────────────────────────────────────────────
async function buildAssignmentsTab(editId = null) {
  const [projects, assignments] = await Promise.all([
    getProjects(false), getUserAssignments()
  ]);
  const visibleAssignments = _showInactiveAssignments
    ? assignments
    : assignments.filter(a => a.Active !== false);
  let editRecord = null;
  if (editId) editRecord = assignments.find(a => String(a.id) === String(editId));
  // N-356: Customer lists current (Active) projects only — a customer can have
  // several projects over time. Editing a row keeps its saved project listed,
  // even if no longer current, so Save Changes never silently changes it.
  let selectableProjects = projects.filter(isProjectCurrent);
  const savedProjectId = editRecord && Number(editRecord.ProjectID) ? String(editRecord.ProjectID) : '';
  if (savedProjectId && !selectableProjects.some(p => String(p.id) === savedProjectId)) {
    const savedProject = projects.find(p => String(p.id) === savedProjectId);
    if (savedProject) selectableProjects = [...selectableProjects, savedProject];
  }
  selectableProjects = sortProjectsByName(selectableProjects);
  const projectLabels = projectOptionLabels(selectableProjects);
  const projectOptions = selectableProjects.map(p =>
    `<option value="${p.id}|${escAttr(p.CustomerName)}"${String(p.id) === savedProjectId ? ' selected' : ''}>${escHtml(projectLabels.get(String(p.id)))}</option>`
  ).join('');
  // N-247c: search after the existing show-inactive filter, before the
  // pre-existing default order (kept as-is below); sortRows layers on top.
  const roleLabel = a => CONFIG.ROLE_LABELS[a.AssignedRole] || a.AssignedRole || ''; // N-281
  // N-331: org-wide roles ignore Customer (saved with ProjectID 0).
  const customerLabel = `Customer (not used for ${escHtml(CONFIG.ORG_WIDE_ROLES.map(r => CONFIG.ROLE_LABELS[r] || r).join(', '))})`;
  const searched = filterRowsByText(visibleAssignments, _osaSearch, a => [a.UserName, a.UserEmail, a.CustomerName, roleLabel(a)]);
  const OSA_SORT_COLUMNS = {
    name:     { type: 'text', get: a => a.UserName },
    email:    { type: 'text', get: a => a.UserEmail },
    customer: { type: 'text', get: a => a.CustomerName },
    role:     { type: 'text', get: roleLabel },
  };
  const rows = sortRows([...searched].sort((a, b) => (a.UserName || '').localeCompare(b.UserName || '')), _osaSort, OSA_SORT_COLUMNS).map(a => {
    const isActive = a.Active !== false;
    return `
    <tr id="assign-row-${a.id}" style="${isActive ? '' : 'opacity:0.55'}">
      <td>${escHtml(a.UserName || '—')}${isActive ? '' : ' <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--border-subtle);color:var(--text-label);">Inactive</span>'}</td>
      <td>${escHtml(a.UserEmail)}</td>
      <td>${escHtml(a.CustomerName || '—')}</td>
      <td>${escHtml(roleLabel(a) || '—')}</td>
      <td>
        <div class="row-actions" style="gap:12px;align-items:center">
          <a href="#"${act('showEditAssignment', Number(a.id))}>Edit</a>
          <button class="btn-secondary"${act('toggleAssignmentActive', Number(a.id), !isActive)}>${isActive ? 'Deactivate' : 'Reactivate'}</button>
          <button class="btn-danger"${act('deleteOsAdminRecord', 'UserAssignments', Number(a.id))}>Remove</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  
  const editForm = editRecord ? `
    <h3>Edit Assignment</h3>
    <div class="form-container" style="padding:0;max-width:600px">
      <div class="form-row">
        <div class="form-group">
          <label>User Display Name</label>
          <input type="text" id="assign-name" value="${escAttr(editRecord.UserName || '')}">
        </div>
        <div class="form-group">
          <label>User Email *</label>
          <input type="email" id="assign-email" value="${escAttr(editRecord.UserEmail || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${customerLabel}</label>
          <select id="assign-project">
            <option value="">-- Select customer --</option>
            ${projectOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Role *</label>
          <select id="assign-role">
            ${_osaRoleOptions(editRecord.AssignedRole)}
          </select>
        </div>
      </div>
      <div id="assign-error" class="form-error"></div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary" id="osa-submit-assignment"${act('submitAssignment', Number(editRecord.id))}>Save Changes</button>
        <button class="btn-secondary"${act('renderOsAdminPage', 'assignments')}>Cancel</button>
      </div>
    </div>
  ` : `
    <h3>Add Assignment</h3>
    <div class="form-container" style="padding:0;max-width:600px">
      <div class="form-row">
        <div class="form-group">
          <label>User Display Name</label>
          <input type="text" id="assign-name" placeholder="e.g. Jane Smith">
        </div>
        <div class="form-group">
          <label>User Email *</label>
          <input type="email" id="assign-email" placeholder="jane@company.com">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${customerLabel}</label>
          <select id="assign-project">
            <option value="">-- Select customer --</option>
            ${projectOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Role *</label>
          <select id="assign-role">
            ${_osaRoleOptions()}
          </select>
        </div>
      </div>
      <div id="assign-error" class="form-error"></div>
      <button class="btn-primary" id="osa-submit-assignment"${act('submitAssignment')}>Add Assignment</button>
    </div>
  `;
  return `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:16px">
      <label style="font-size:13px;cursor:pointer">
        <input type="checkbox" ${_showInactiveAssignments ? 'checked' : ''}${actOn('change', '_toggleShowInactiveAssignments', ACT_CHECKED)}
          style="margin-right:6px">
        Show inactive assignments
      </label>
      ${listSearchBox(_osaSearch, 'setOsaSearch')}
    </div>
    ${listResultCount(searched.length, searched.length, assignments.length, null, 'assignment')}
    <table class="data-table" style="margin:0 0 24px">
      <thead><tr>
        ${sortableHeader('Name', 'name', _osaSort, 'setOsaSort')}
        ${sortableHeader('Email', 'email', _osaSort, 'setOsaSort')}
        ${sortableHeader('Customer', 'customer', _osaSort, 'setOsaSort')}
        ${sortableHeader('Role', 'role', _osaSort, 'setOsaSort')}
        <th></th>
      </tr></thead>
      <tbody>${rows || emptyStateRow({ colspan: 5, icon: 'users', message: 'No assignments yet.' })}</tbody>
    </table>
    ${editForm}
  `;
}
async function showEditAssignment(id) {
  const content = await buildAssignmentsTab(id);
  document.querySelector('#main-content > div[style]').innerHTML = content;
}
// N-281: self-guard. An admin can never demote, deactivate, re-point or
// remove their OWN active admin row from here — that is the one edit that
// can lock the last admin out. Compares against the signed-in account.
const _OSA_SELF_GUARD_MSG = "You can't remove your own admin access. Ask another admin.";
async function _osaOwnAdminRow(id) {
  const me = (getCurrentUser()?.email || '').toLowerCase();
  const row = (await getUserAssignments()).find(a => String(a.id) === String(id));
  return row && isAdminAssignment(row) && (row.UserEmail || '').toLowerCase() === me ? row : null;
}
async function submitAssignment(editId = null) {
  const name    = document.getElementById('assign-name').value.trim();
  const email   = document.getElementById('assign-email').value.trim();
  const projVal = document.getElementById('assign-project').value;
  const role    = document.getElementById('assign-role').value;
  const errEl   = document.getElementById('assign-error');
  errEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Email is required.'; errEl.style.display = 'block'; return; }
  if (editId && await _osaOwnAdminRow(editId) &&
      (role !== 'admin' || email.toLowerCase() !== (getCurrentUser()?.email || '').toLowerCase())) {
    errEl.textContent = _OSA_SELF_GUARD_MSG; errEl.style.display = 'block'; return;
  }
  const btn = document.getElementById('osa-submit-assignment') ||
              document.querySelector('.form-container .btn-primary');
  setButtonLoading(btn);
  // N-281: an admin row applies across all projects — always ProjectID 0, no
  // customer. N-331: same for every org-wide role (people_ops / sales / staff).
  const [projectId, customerName] = isOrgWideRole(role) ? ['0', ''] : (projVal ? projVal.split('|') : ['0', '']);
  try {
    if (editId) {
      await updateItem('UserAssignments', editId, {
        Title: email.toLowerCase(), UserName: name,
        ProjectID: parseInt(projectId) || 0,
        CustomerName: customerName || '', AssignedRole: role
      });
    } else {
      await createItem('UserAssignments', {
        Title: email.toLowerCase(), UserName: name,
        ProjectID: parseInt(projectId) || 0,
        CustomerName: customerName || '', AssignedRole: role
      });
    }
    await renderOsAdminPage('assignments');
  } catch(e) {
    clearButtonLoading(btn);
    errEl.textContent = `Error: ${e.message}`; errEl.style.display = 'block';
  }
}

async function toggleAssignmentActive(id, makeActive) {
  if (!makeActive && await _osaOwnAdminRow(id)) { toast(_OSA_SELF_GUARD_MSG, { type: 'error' }); return; } // N-281
  await updateItem('UserAssignments', id, { Active: makeActive });
  renderOsAdminPage('assignments');
}

async function _toggleShowInactiveAssignments(checked) {
  _showInactiveAssignments = checked;
  renderOsAdminPage('assignments');
}

// N-247c: debounced search — re-renders through renderOsAdminPage('assignments'),
// not a direct buildAssignmentsTab() splice (that pattern is reserved for
// entering edit mode without losing the tab shell — see showEditAssignment).
const _debouncedRenderOsAssignments = debounce(async () => { await renderOsAdminPage('assignments'); focusListSearchBox(); }, 250);
function setOsaSearch(val) { _osaSearch = val || ''; _debouncedRenderOsAssignments(); }
async function setOsaSort(key) { _osaSort = nextSortState(_osaSort, key); await renderOsAdminPage('assignments'); focusSortHeader(key); }

// ── Leadership Tab ───────────────────────────────────────────────────
async function buildLeadershipTab() {
  const list = await getLeadershipAccess();
  const rows = list.map(l => `
    <tr>
      <td>${l.PhotoUrl
            ? `<img src="${escAttr(l.PhotoUrl)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover">`
            : '<span style="color:var(--text-faint);font-size:12px">—</span>'}</td>
      <td>${escHtml(l.UserName || '—')}</td>
      <td>${escHtml(l.UserEmail)}</td>
      <td>
        <div class="row-actions" style="gap:6px">
          <input type="file" id="lead-photofile-${l.id}" accept="${uploadAcceptAttr('PHOTO')}">
          <button class="btn-secondary"${act('uploadLeadershipPhoto', Number(l.id))}>Upload photo</button>
          <button class="btn-danger"${act('deleteOsAdminRecord', 'LeadershipAccess', Number(l.id))}>Remove</button>
        </div>
      </td>
    </tr>`).join('');
  return `
    <h3>Leadership Access List</h3>
    <p style="font-size:13px;color:var(--text-label);margin-bottom:16px">
      These individuals have read-only access to the Company Dashboard.
    </p>
    <table class="data-table" style="margin:0 0 24px">
      <thead><tr><th>Photo</th><th>Name</th><th>Email</th><th></th></tr></thead>
      <tbody>${rows || emptyStateRow({ colspan: 4, icon: 'shield', message: 'No leadership users yet.' })}</tbody>
    </table>
    <h3>Add User</h3>
    <div class="form-container" style="padding:0;max-width:500px">
      <div class="form-row">
        <div class="form-group">
          <label>Display Name</label>
          <input type="text" id="lead-name" placeholder="e.g. Alex Jones">
        </div>
        <div class="form-group">
          <label>Email *</label>
          <input type="email" id="lead-email" placeholder="alex@company.com">
        </div>
      </div>
      <div class="form-group">
        <label>Photo <span style="font-size:11px;color:var(--text-muted);font-weight:normal">optional</span></label>
        <input type="file" id="lead-photofile" accept="${uploadAcceptAttr('PHOTO')}">
      </div>
      <div id="lead-error" class="form-error"></div>
      <button class="btn-primary" id="osa-submit-leadership"${act('submitLeadershipUser')}>Add User</button>
    </div>
  `;
}
async function submitLeadershipUser() {
  const name  = document.getElementById('lead-name').value.trim();
  const email = document.getElementById('lead-email').value.trim();
  const file  = document.getElementById('lead-photofile')?.files?.[0] || null;
  const errEl = document.getElementById('lead-error');
  errEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Email is required.'; errEl.style.display = 'block'; return; }
  if (file) {                                   // N-284: fail before anything is saved
    const photoCheck = validateUpload(file, 'PHOTO');
    if (!photoCheck.ok) { errEl.textContent = photoCheck.reason; errEl.style.display = 'block'; return; }
  }
  const btn = document.getElementById('osa-submit-leadership');
  setButtonLoading(btn);
  try {
    const saved = await createItem('LeadershipAccess', { Title: email, UserName: name });
    if (file && saved?.id) {
      const url = await uploadPeoplePhoto('leader', saved.id, file);
      if (url) await updateItem('LeadershipAccess', saved.id, { PhotoUrl: url });
    }
    await renderOsAdminPage('leadership');
  } catch(e) {
    clearButtonLoading(btn);
    errEl.textContent = `Error: ${e.message}`; errEl.style.display = 'block';
  }
}
async function uploadLeadershipPhoto(id) {
  const input = document.getElementById('lead-photofile-' + id);
  const file = input?.files?.[0];
  if (!file) { toast('Choose an image first.', { type: 'error' }); return; }
  const photoCheck = validateUpload(file, 'PHOTO');                 // N-284
  if (!photoCheck.ok) { toast(photoCheck.reason, { type: 'error' }); input.value = ''; return; }
  const btn = input.nextElementSibling;
  setButtonLoading(btn);
  try {
    const url = await uploadPeoplePhoto('leader', id, file);
    await updateItem('LeadershipAccess', id, { PhotoUrl: url });
    await renderOsAdminPage('leadership');
  } catch (e) {
    clearButtonLoading(btn);
    toast('Error uploading photo: ' + e.message, { type: 'error' });
  }
}
async function deleteOsAdminRecord(listName, id) {
  if (listName === 'UserAssignments' && await _osaOwnAdminRow(id)) { toast(_OSA_SELF_GUARD_MSG, { type: 'error' }); return; } // N-281
  if (!(await confirmModal({ message: 'Remove this record?', confirmLabel: 'Remove', danger: true }))) return;
  // N-176: raw DELETE bypassed _cacheInvalidate(); deleteItem() is the same
  // request plus both-tier invalidation.
  await deleteItem(listName, id);
  await renderOsAdminPage(_osAdminTab);
}
// ── Homepage Tab ───────────────────────────────────────────────────
async function buildHomepageTab() {
  const [current, active] = await Promise.all([
    getAnnouncementMessage(),
    getSeasonalEffect(),
  ]);
  const effects = [
    { key: 'spring', label: '🌸 Spring',           desc: 'Grass and flowers along the bottom of the screen' },
    { key: 'summer', label: '☀ Summer Scene',      desc: 'Sun, sandy beach and gentle waves' },
    { key: 'autumn', label: '🍂 Autumn',           desc: 'Falling autumn leaves' },
    { key: 'snow',   label: '❄ Snowfall',         desc: 'Falling snow animation' },
    { key: 'lights', label: '🎄 Christmas Lights', desc: 'String of twinkling coloured lights across the top' },
    { key: 'football', label: '⚽ World Cup Football', desc: 'Full-screen grass pitch with line markings and a ball bouncing around' },
  ];
  const effectRows = effects.map(e => `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:16px 0;border-bottom:1px solid var(--border-subtle)">
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--brand)">${e.label}</div>
        <div style="font-size:13px;color:var(--text-label);margin-top:2px">${e.desc}</div>
      </div>
      <button class="btn-secondary"
        ${act('setFx', active === e.key ? 'none' : e.key)} style="min-width:80px">
        ${active === e.key ? 'On' : 'Off'}
      </button>
    </div>`).join('');
  return `
    <h3>Announcement Banner</h3>
        <p style="font-size:13px;color:var(--text-label);margin-bottom:16px">
      Set a scrolling message that appears at the bottom of the screen for all users.
      Clear the field and save to remove it.
    </p>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;
                padding:20px 24px;max-width:520px;margin-bottom:32px">
      <div class="form-group">
        <label>Message</label>
        <textarea id="announcement-text" rows="3"
          placeholder="e.g. Welcome to Newton — Q2 targets are live!"
          style="resize:vertical">${current ? escHtml(current) : ''}</textarea>
      </div>
      <div id="announcement-status" style="display:none;font-size:13px;margin-bottom:12px"></div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn-primary" id="osa-submit-announcement"${act('submitAnnouncement')}>Save</button>
        <button class="btn-secondary"${act('clearAnnouncement')}>Clear Banner</button>
      </div>
    </div>
    <h3>Seasonal Effects</h3>
        <p style="font-size:13px;color:var(--text-label);margin-bottom:16px">
      One effect can be active at a time. Changes take effect on the Newton home screen immediately.
    </p>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;
                padding:4px 24px;max-width:520px">
      ${effectRows}
    </div>`;
}
async function setFx(key) {
  const btn = event?.target;
  setButtonLoading(btn, key === 'none' ? 'Turning off…' : 'Turning on…');
  await setSeasonalEffect(key);
  renderOsAdminPage('homepage');
}
async function submitAnnouncement() {
  const msg    = document.getElementById('announcement-text').value.trim();
  const status = document.getElementById('announcement-status');
  const btn    = document.getElementById('osa-submit-announcement');
  status.style.display = 'none';
  setButtonLoading(btn);
  try {
    await setAnnouncementMessage(msg);
    clearButtonLoading(btn);
    status.style.color   = 'var(--status-success)';
    status.textContent   = msg ? 'Banner updated.' : 'Banner cleared.';
    status.style.display = 'block';
  } catch(e) {
    clearButtonLoading(btn);
    status.style.color   = 'var(--status-danger)';
    status.textContent   = `Error: ${e.message}`;
    status.style.display = 'block';
  }
}
async function clearAnnouncement() {
  document.getElementById('announcement-text').value = '';
  await submitAnnouncement();
}

// ── Ghost Mode Tab ───────────────────────────────────────────────────
async function buildGhostTab() {
  const currentEmail = getGhostUser();
  const currentLabel = getGhostLabel();

  const [assignable, leadership] = await Promise.all([
    getAllAssignableUsers(), getLeadershipAccess()
  ]);
  const merged = new Map();
  assignable.forEach(u => merged.set(u.UserEmail.toLowerCase(), u.UserName || u.UserEmail));
  leadership.forEach(l => {
    if (l.UserEmail) merged.set(l.UserEmail.toLowerCase(), l.UserName || l.UserEmail);
  });
  const users = [...merged.entries()]
    .map(([email, name]) => ({ email, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const userOptions = users.map(u => `
    <option value="${escAttr(u.email)}" data-name="${escAttr(u.name)}" ${currentEmail === u.email ? 'selected' : ''}>
      ${escHtml(u.name)} (${escHtml(u.email)})
    </option>`).join('');

  const activateBtn = `
    <button class="btn-primary" style="margin-top:16px"${act('activateGhostUser')}>
      Activate Ghost Mode
    </button>`;

  return `
    <h3>Ghost Mode</h3>
        <p style="font-size:13px;color:var(--text-label);margin-bottom:24px">
      Temporarily view Newton as a specific real user — their real resolved role and real
      project scope. A banner will appear at the top of every page while ghost mode is
      active. Navigate to any module to see their experience. Your real admin access is
      restored when you exit.
    </p>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;
                padding:20px 24px;max-width:520px">
      ${currentEmail ? `
        <div style="background:var(--status-warn-bg-soft);border:1px solid var(--badge-cc-amber);border-radius:4px;
                    padding:12px 16px;margin-bottom:20px;font-size:13px">
          👻 Currently ghosting as <strong>${escHtml(currentLabel || currentEmail)}</strong>
          (${escHtml(currentEmail)})
        </div>` : ''}
      <div class="form-group" style="max-width:420px">
        <label>User to ghost as</label>
        <select id="ghost-user-select">
          <option value="">-- Select user --</option>
          ${userOptions}
        </select>
      </div>
      ${activateBtn}
      ${currentEmail ? `
        <button class="btn-danger" style="margin-top:12px"${act('deactivateGhost')}>Exit Ghost Mode</button>` : ''}
    </div>
  `;
}

function activateGhostUser() {
  const sel = document.getElementById('ghost-user-select');
  const email = sel?.value;
  if (!email) {
    toast('Please select a user before activating ghost mode.', { type: 'error' });
    return;
  }
  const opt = sel.options[sel.selectedIndex];
  // N-282: refused unless the signed-in account is a real admin.
  if (!setGhostUser(email, opt?.dataset.name || email)) {
    toast('Ghost Mode is only available to Newton admins.', { type: 'error' });
    return;
  }
  window.location.href = 'reporting.html';
}

function deactivateGhost() {
  clearGhostUser();
  window.location.reload();
}
// ── Data Health Tab (F-10 / N-092) ───────────────────────────────────
async function buildDataHealthTab() {
  const data = await _dhFetchSectionData();
  return _dhRenderRowCountsHtml(data)
    + _dhRenderDataIntegrityHtml(data)
    + _dhRenderHeadcountIntegrityHtml(data)
    + _dhRenderWeeklyAnomaliesHtml(data)
    + _dhRenderIndexStatusHtml(data)
    + _dhRenderSchemaCheckHtml(data)
    + _dhRenderErrorTelemetryHtml(data);
}

// ── Data Health Tab — data fetch (no DOM) ────────────────────────────
async function _dhFetchSectionData() {
  // N-154 (F-10b): every registered list, not just the ones with a
  // LIST_FIELDS projection entry. See getMonitoredLists().
  const lists = getMonitoredLists();
  const counts = await Promise.all(lists.map(l => getListItemCount(l).catch(e => {
    console.warn('Data Health: row count failed for list "' + l + '"', e);
    return null;  // one broken list must not take out the whole tab
  })));
  // N-285: getListItemCount() returns null for a list this account cannot
  // read. Capture which, now — the denial memo has a short window and the
  // rest of this function takes a while.
  const deniedLists = lists.map(l => wasListDenied(l));
  const excludedLists = CONFIG.DATA_HEALTH_EXCLUDED_LISTS || [];

  const { ok: nullProjectOk, count: nullProjectCount } = await getWeeklyActivityNullProjectCount();
  const { ok: nullWeekEndingOk, count: nullWeekEndingCount } = await getWeeklyActivityNullWeekEndingCount();

  const targetLists = [...new Set(CONFIG.INDEX_TARGETS.map(t => t.list))];
  const statusByList = {};
  await Promise.all(targetLists.map(async l => {
    const names = CONFIG.INDEX_TARGETS.filter(t => t.list === l).map(t => t.column);
    statusByList[l] = await getColumnIndexStatus(l, names).catch(() => []);
  }));

  // N-174 (F-11a): schema contract check. One row per list registered in
  // FIELD_ALIASES; getSchemaDiffs() already tolerates a single list's
  // failure, so no extra .catch() batching is needed here.
  const schemaResults = await getSchemaDiffs();

  // N-173: client-side read + group. Graph has no GROUP BY; this mirrors
  // the dedupe key diagnostics.js:reportError() uses (errorType|message|
  // first real stack line) via the SAME diagStackHead() helper — reused,
  // not duplicated, since diagnostics.js loads before this file in every
  // shell that has this tab.
  const diagRows = await getDiagnostics().catch(e => {
    console.warn('Data Health: diagnostics fetch failed', e);
    return [];
  });
  const diagGroups = {};
  diagRows.forEach(r => {
    const key = r.ErrorType + '|' + r.Message + '|' + diagStackHead(r.Stack);
    if (!diagGroups[key]) {
      diagGroups[key] = { message: r.Message, module: r.Module, users: new Set(), ids: [], lastSeen: r.OccurredAt, count: 0 };
    }
    const g = diagGroups[key];
    g.count++;
    g.ids.push(r.id);
    if (r.UserEmail) g.users.add(r.UserEmail);
    if (r.OccurredAt > g.lastSeen) { g.lastSeen = r.OccurredAt; g.module = r.Module; }
  });
  const diagList = Object.values(diagGroups).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

  // N-271: WeeklyActivity anomaly flags. Never throws — a failure is
  // { ok: false } and renders as a Query error, not as zeros.
  const anomalies = await _dhFetchAnomalies();

  // N-306: headcount integrity. Pure check (checkHeadcountIntegrity, headcount.js);
  // a failed read is { ok: false } and renders as Query error, never zeros.
  let headcountIntegrity;
  try {
    const [hRoles, hRows, hPlacements] = await Promise.all([getAllRoles(), getAllHeadcount(), getPlacements()]);
    headcountIntegrity = { ok: true, checks: checkHeadcountIntegrity({ roles: hRoles, headcount: hRows, placements: hPlacements }) };
  } catch (e) {
    console.warn('Data Health: headcount integrity read failed', e);
    headcountIntegrity = { ok: false, checks: [] };
  }

  return {
    lists, counts, deniedLists, excludedLists,
    nullProjectOk, nullProjectCount, nullWeekEndingOk, nullWeekEndingCount,
    statusByList,
    schemaResults,
    diagList,
    anomalies,
    headcountIntegrity,
  };
}

// ── Data Health Tab — data fetch: WeeklyActivity anomalies (N-271) ────
// No DOM. The detection is pure (detectWeeklyActivityAnomalies, analytics.js);
// this only fetches. A rejected query is { ok: false }, never zeros — a check
// that did not run must not read as a clean bill of health (N-138).
// N-273: what the Acknowledge / Restore handlers act on. Set by
// _dhFetchAnomalies from the FETCHED flags — the handlers never read a role's
// breach or an ack id back out of the DOM.
//   flags  — roleId → funnel flag (open or acknowledged)
//   ackIds — roleId → ids of the active ack rows matching that role's flag
let _dhAnomalyState = { flags: new Map(), ackIds: new Map() };

async function _dhFetchAnomalies() {
  _dhAnomalyState = { flags: new Map(), ackIds: new Map() };
  try {
    const [roles, activity, nameMap, acksRes] = await Promise.all([
      getAllRoles(),
      getWeeklyActivity(null, null),
      getTalentPartnerDisplayMap().catch(() => ({})),
      // N-273: an unreadable AnomalyAcks list must never hide a flag or fail the
      // check — every flag is simply shown, with a note.
      getAnomalyAcks().then(rows => ({ ok: true, rows }), e => {
        console.warn('Data Health: could not read AnomalyAcks', e);
        return { ok: false, rows: [] };
      }),
    ]);
    // A projected fetch (rows with no role key — e.g. an id-only delta baseline)
    // would come out as "no anomalies". Fail loudly instead.
    if (!weeklyActivityRowsUsable(activity)) {
      console.error('Data Health: WeeklyActivity rows carry no role key — the fetch was projected, not full');
      return { ok: false };
    }
    const result = detectWeeklyActivityAnomalies(roles, activity);
    const partition = partitionAcknowledgedFunnels(result.impossibleFunnels, acksRes.rows);
    _dhAnomalyState = {
      flags: new Map(result.impossibleFunnels.map(f => [String(f.roleId), f])),
      ackIds: new Map(partition.acknowledged.map(e => [String(e.flag.roleId), e.acks.map(a => a.id)])),
    };
    return { ok: true, result, nameMap, acksOk: acksRes.ok, partition };
  } catch (e) {
    console.error('Data Health: WeeklyActivity anomaly check failed', e);
    return { ok: false };
  }
}


// ── Data Health Tab — render: List Row Counts ────────────────────────
function _dhRenderRowCountsHtml(data) {
  const { lists, counts, deniedLists, excludedLists } = data;
  const countRows = lists.map((l, i) => {
    const count = counts[i];
    const warn = count !== null && count >= CONFIG.LIST_ROW_COUNT_WARNING_THRESHOLD;
    const noCount = (deniedLists && deniedLists[i]) ? 'No access' : '—';
    return `
    <tr>
      <td>${escHtml(l)}</td>
      <td>${count === null ? '<span class="dh-muted">' + noCount + '</span>' : count.toLocaleString('en-GB')}</td>
      <td>${warn ? '<span class="dh-badge dh-badge-warn">Amber</span>' : ''}</td>
    </tr>`;
  }).join('');

  return `
    <h3>List Row Counts</h3>
    <p class="dh-note">
      SharePoint scans the whole list to evaluate a filter on an unindexed
      column, and throws once a result set passes 5,000 rows. Amber below
      flags a list approaching that — index the columns below before it does.
      Every list Newton is registered against is watched.
      ${excludedLists.length
        ? 'Deliberately excluded: ' + escHtml(excludedLists.join(', ')) + '.'
        : 'No lists are excluded.'}
      An em-dash means the count failed, not that the list is empty — the
      browser console names which. "No access" means this account cannot read
      the list (CONFIG.RESTRICTED_LISTS), so no count is available.
    </p>
    <div class="table-scroll">
    <table class="data-table dh-table">
      <thead><tr><th>List</th><th>Row count</th><th></th></tr></thead>
      <tbody>${countRows || emptyStateRow({ colspan: 3, icon: 'database', message: 'No lists configured.' })}</tbody>
    </table>
    </div>
`;
}

// ── Data Health Tab — render: Data Integrity ─────────────────────────
function _dhRenderDataIntegrityHtml(data) {
  const { nullProjectOk, nullProjectCount, nullWeekEndingOk, nullWeekEndingCount } = data;
  return `    <h3>Data Integrity</h3>
    <p class="dh-note">
      WeeklyActivity.ProjectID is a copy of the role's project. Since N-315 no
      page filters on it — the Project Dashboard and Report Builder scope
      activity by role — and every new row is checked on save, with any drop
      repaired and reported under Error telemetry. This should read zero and
      is read-only: a non-zero count means a row slipped past the save-time
      check, so look in Error telemetry. A "Query error" badge means the check itself
      failed — unknown, not zero — see the browser console for the underlying
      error.
    </p>
    <div class="table-scroll">
    <table class="data-table dh-table">
      <thead><tr><th>Check</th><th>Rows</th><th></th></tr></thead>
      <tbody>
        <tr>
          <td>WeeklyActivity rows missing ProjectID</td>
          <td>${nullProjectOk ? nullProjectCount.toLocaleString('en-GB') : '<span class="dh-badge dh-badge-danger">Query error</span>'}</td>
          <td>${nullProjectOk && nullProjectCount ? `<span class="dh-badge dh-badge-warn">Amber</span>` : ''}</td>
        </tr>
        <tr>
          <td>WeeklyActivity rows missing WeekEndingDate</td>
          <td>${nullWeekEndingOk ? nullWeekEndingCount.toLocaleString('en-GB') : '<span class="dh-badge dh-badge-danger">Query error</span>'}</td>
          <td>${nullWeekEndingOk && nullWeekEndingCount ? '<span class="dh-badge dh-badge-warn">Amber</span>' : ''}</td>
        </tr>
      </tbody>
    </table>
    </div>
`;
}

// ── Data Health Tab — render: Headcount integrity (N-306) ────────────
function _dhRenderHeadcountIntegrityHtml(data) {
  const h = data.headcountIntegrity || { ok: false, checks: [] };
  const cap = CONFIG.WEEKLY_ANOMALIES.displayRows;
  const body = !h.ok
    ? `<tr><td>Headcount checks</td><td><span class="dh-badge dh-badge-danger">Query error</span></td><td></td></tr>`
    : h.checks.map(c => `
        <tr>
          <td>${escHtml(c.label)}${c.count ? `
            <details><summary class="dh-muted">Show</summary>
              <span class="dh-muted">${c.sample.slice(0, cap).map(escHtml).join(', ')}${c.count > cap ? ` +${c.count - cap} more` : ''}</span>
            </details>` : ''}</td>
          <td>${c.count.toLocaleString('en-GB')}</td>
          <td>${c.count ? '<span class="dh-badge dh-badge-warn">Amber</span>' : ''}</td>
        </tr>`).join('');
  return `    <h3>Headcount integrity (N-306)</h3>
    <p class="dh-note">
      Roles are pipelines; each RoleHeadcount row is one hire. Every check must
      read zero once the headcount migration below has run — except "Closed
      pipelines with open headcount", which also lists closed roles that never
      had a placement recorded: add the placement, or cancel the headcount.
      A "Query error" badge means the check itself failed — unknown, not zero.
    </p>
    <div class="table-scroll">
    <table class="data-table dh-table">
      <thead><tr><th>Check</th><th>Rows</th><th></th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    </div>
`;
}

// ── Data Health Tab — render: WeeklyActivity Anomalies (N-271) ───────
// '2026-09-27' → '27 Sep'. utcDateOnly + timeZone 'UTC': no local getter.
function _dhDay(iso) {
  const d = utcDateOnly(iso);
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : escHtml(iso);
}

// One anomaly table: a label line with the count + badge, then the rows,
// capped at CONFIG.WEEKLY_ANOMALIES.displayRows.
function _dhAnomalyBlockHtml({ title, ok, items, head, rowFn, emptyMessage, icon }) {
  const cap = CONFIG.WEEKLY_ANOMALIES.displayRows;
  const badge = !ok
    ? '<span class="dh-badge dh-badge-danger">Query error</span>'
    : (items.length ? '<span class="dh-badge dh-badge-warn">Amber</span>' : '');
  let body;
  if (!ok) {
    body = emptyStateRow({ colspan: head.length, icon: 'alert-triangle', message: 'This check did not run — see the browser console.' });
  } else if (!items.length) {
    body = emptyStateRow({ colspan: head.length, icon, message: emptyMessage });
  } else {
    body = items.slice(0, cap).map(rowFn).join('')
      + (items.length > cap
        ? `<tr><td colspan="${head.length}" class="dh-muted">+${items.length - cap} more</td></tr>`
        : '');
  }
  return `
    <p class="dh-note"><strong>${escHtml(title)}</strong>${ok ? ' · ' + items.length.toLocaleString('en-GB') : ''} ${badge}</p>
    <div class="table-scroll">
    <table class="data-table dh-table">
      <thead><tr>${head.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    </div>
`;
}

// '12 Sep 2026' from an ISO instant, in the viewer's own zone: an instant (an
// acknowledgement's timestamp), not a stored date-only value, so the local
// rendering is the right one — a 00:30 BST acknowledgement reads as that day.
function _dhInstant(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// One funnel flag's breaches as plain-text lines: 'Responses 12 > Outreach 10'.
function _dhBreachLines(flag) {
  return flag.breaches.map(b => `${b.later} ${b.laterTotal.toLocaleString('en-GB')} > ${b.earlier} ${b.earlierTotal.toLocaleString('en-GB')}`);
}

// The collapsed "Acknowledged (n)" block under the funnels table, plus the
// note shown when the acknowledgements could not be read.
function _dhAckedFunnelsHtml(partition, acksOk, tp) {
  const unreadable = acksOk ? '' : `
    <p class="dh-note dh-muted">Acknowledgements could not be read — showing every flag.</p>`;
  if (!partition.acknowledged.length) return unreadable;
  const rows = partition.acknowledged.map(({ flag: f, acks }) => {
    const latest = acks.slice().sort((a, b) => String(b.AcknowledgedAt).localeCompare(String(a.AcknowledgedAt)))[0];
    return `
        <tr>
          <td>${escHtml(f.roleTitle)}</td>
          <td>${tp(f.tp)}</td>
          <td>${escHtml(f.stage)}</td>
          <td>${_dhBreachLines(f).map(escHtml).join('<br>')}</td>
          <td>${escHtml(latest.AcknowledgedBy || '')}</td>
          <td>${escHtml(_dhInstant(latest.AcknowledgedAt))}</td>
          <td>${latest.Note ? escHtml(latest.Note) : '<span class="dh-muted">—</span>'}</td>
          <td><button class="btn-secondary"${act('restoreFunnelFlag', String(f.roleId))}>Restore</button></td>
        </tr>`;
  }).join('');
  return `
    <details class="dh-ack">
      <summary>Acknowledged (${partition.acknowledged.length})</summary>
      <div class="table-scroll">
      <table class="data-table dh-table">
        <thead><tr><th>Role</th><th>Talent Partner</th><th>Stage</th><th>Breach</th><th>Acknowledged by</th><th>On</th><th>Note</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
    </details>${unreadable}`;
}

function _dhRenderWeeklyAnomaliesHtml(data) {
  const { ok, result, nameMap, acksOk, partition } = data.anomalies;
  const C = CONFIG.WEEKLY_ANOMALIES;
  const N = C.noActivity.recentWeeks;
  const windowText = N === 1 ? 'this week' : N === 2 ? 'this week or last week' : `this week or in the previous ${N - 1} weeks`;
  const tp = v => escHtml(tpDisplay(v, nameMap || {}));
  const r = ok ? result : { impossibleFunnels: [], noActivity: [], spikes: [], meta: {} };
  // N-273: the funnels table shows OPEN flags only; acknowledged ones are in the
  // collapsed block below it.
  const part = ok ? partition : { open: [], acknowledged: [], reappeared: [] };
  const reappeared = new Set(part.reappeared);

  const funnels = _dhAnomalyBlockHtml({
    title: 'Impossible funnels', ok, items: part.open, icon: 'check-circle',
    emptyMessage: 'No role has a stage larger than the stage it depends on.',
    head: ['Role', 'Talent Partner', 'Stage', 'Breach', 'Action'],
    rowFn: f => `
        <tr>
          <td>${escHtml(f.roleTitle)}</td>
          <td>${tp(f.tp)}</td>
          <td>${escHtml(f.stage)}</td>
          <td>${_dhBreachLines(f).map(escHtml).join('<br>')}${reappeared.has(String(f.roleId)) ? '<br><span class="dh-muted">Acknowledged earlier at different totals</span>' : ''}</td>
          <td><button class="btn-secondary"${act('acknowledgeFunnelFlag', String(f.roleId))}>Acknowledge</button></td>
        </tr>`,
  });
  const ackedFunnels = ok ? _dhAckedFunnelsHtml(part, acksOk, tp) : '';
  const noActivity = _dhAnomalyBlockHtml({
    title: 'Open roles with no recent activity', ok, items: r.noActivity, icon: 'check-circle',
    emptyMessage: `Every open role has an entry for ${windowText}.`,
    head: ['Role', 'Talent Partner', 'Stage', 'Last entry (week ending)'],
    rowFn: n => `
        <tr>
          <td>${escHtml(n.roleTitle)}</td>
          <td>${tp(n.tp)}</td>
          <td>${escHtml(n.stage)}</td>
          <td>${n.lastEntryWeek ? _dhDay(n.lastEntryWeek) : '<span class="dh-muted">—</span>'}</td>
        </tr>`,
  });
  const spikes = _dhAnomalyBlockHtml({
    title: 'Spikes against the Talent Partner\'s own median', ok, items: r.spikes, icon: 'check-circle',
    emptyMessage: 'No week stands out from its Talent Partner\'s norm.',
    head: ['Talent Partner', 'Week ending', 'Field', 'Value', 'Their median (prior weeks)'],
    rowFn: s => `
        <tr>
          <td>${tp(s.tp)}</td>
          <td>${_dhDay(s.weekEnding)}</td>
          <td>${escHtml(s.field)}</td>
          <td>${s.value.toLocaleString('en-GB')}</td>
          <td>${s.median.toLocaleString('en-GB')} (${s.baselineWeeks} wks)</td>
        </tr>`,
  });

  const m = r.meta;
  const notes = [
    m.orphanRows    ? `${m.orphanRows} row(s) for roles that no longer exist were skipped` : '',
    m.offSundayRows ? `${m.offSundayRows} row(s) not dated on a Sunday were counted in the following week` : '',
    m.undatedRows   ? `${m.undatedRows} row(s) with no WeekEndingDate count toward funnel totals only` : '',
    m.noTpRows      ? `${m.noTpRows} row(s) with no Talent Partner were left out of the spike check` : '',
  ].filter(Boolean);

  return `    <h3>WeeklyActivity Anomalies</h3>
    <p class="dh-note">
      Read-only checks on the numbers Talent Partners log. Impossible funnel:
      a role's all-time total for a stage is larger than the stage it depends
      on. No recent activity: a role that is still open (Sourcing to Offered)
      with no WeeklyActivity row dated ${windowText}; a role is skipped until
      it has been open long enough to be judged. Spike: a Talent Partner's
      weekly total is over ${C.spikes.multiplier}&times; their own median for
      the previous ${C.spikes.baselineWeeks} weeks (needs
      ${C.spikes.minBaselineWeeks}+ weeks of history and a value of at least
      ${C.spikes.minValue}), checked over the last ${C.spikes.reportWeeks}
      weeks. Nothing is corrected automatically — fix the row in Activity,
      then reload this tab. A justified impossible funnel can be acknowledged;
      it stays out of the table until that role's totals change. A "Query
      error" badge means the check did not run.
    </p>${funnels}${ackedFunnels}${noActivity}${spikes}${notes.length ? `
    <p class="dh-note dh-muted">${escHtml(notes.join(' · '))}.</p>
` : ''}`;
}

// ── Data Health Tab — Acknowledge / Restore an impossible funnel (N-273) ──
// Both act on the flag held in _dhAnomalyState (set by the fetch), never on
// anything read back from the DOM.
async function acknowledgeFunnelFlag(roleId) {
  // N-106 pattern: capture the button synchronously — the implicit global
  // `event` is only populated during the synchronous dispatch.
  const btn = event?.target;
  const flag = _dhAnomalyState.flags.get(String(roleId));
  if (!flag) { toast('That flag is no longer shown — reload the tab.', { type: 'error' }); return; }
  const note = await promptModal({
    title: 'Acknowledge impossible funnel',
    message: `${flag.roleTitle}: ${_dhBreachLines(flag).join('; ')}. It stays out of the table until this role's totals change. Reason (optional):`,
    placeholder: 'e.g. Historic data, confirmed with the Talent Partner',
    confirmLabel: 'Acknowledge',
  });
  if (note === null) return;
  setButtonLoading(btn);
  try {
    await acknowledgeAnomaly({ checkType: 'funnel', subjectKey: flag.roleId, signature: anomalyFunnelSignature(flag), note });
    await renderOsAdminPage('datahealth');
  } catch (e) {
    clearButtonLoading(btn);
    toast('Error acknowledging: ' + e.message, { type: 'error' });
  }
}

async function restoreFunnelFlag(roleId) {
  const btn = event?.target;
  const ids = _dhAnomalyState.ackIds.get(String(roleId));
  if (!ids || !ids.length) { toast('That acknowledgement is no longer shown — reload the tab.', { type: 'error' }); return; }
  if (!(await confirmModal({
    message: 'Restore this flag? It will return to the Impossible funnels table.',
    confirmLabel: 'Restore',
  }))) return;
  setButtonLoading(btn);
  try {
    await restoreAnomalyAcks(ids);
    await renderOsAdminPage('datahealth');
  } catch (e) {
    clearButtonLoading(btn);
    toast('Error restoring: ' + e.message, { type: 'error' });
  }
}


// ── Data Health Tab — render: Index Status ───────────────────────────
function _dhRenderIndexStatusHtml(data) {
  const { statusByList } = data;
  const indexRows = CONFIG.INDEX_TARGETS.map(t => {
    const status = (statusByList[t.list] || []).find(s => s.name === t.column);
    const indexed = status?.indexed;
    return `
    <tr>
      <td>${escHtml(t.list)}</td>
      <td>${escHtml(t.column)}</td>
      <td>${indexed
            ? '<span class="dh-badge dh-badge-success">Indexed</span>'
            : '<span class="dh-badge dh-badge-warn">Not indexed</span>'}</td>
    </tr>`;
  }).join('');

  return `    <h3>Index Status</h3>
    <p class="dh-note">
      Columns Newton filters on server-side (N-093). Read-only since N-291: to
      index a column, a site owner uses SharePoint List settings → Indexed columns.
    </p>
    <div class="table-scroll">
    <table class="data-table dh-table-tight">
      <thead><tr><th>List</th><th>Column</th><th>Status</th></tr></thead>
      <tbody>${indexRows || emptyStateRow({ colspan: 3, icon: 'database', message: 'No index targets configured.' })}</tbody>
    </table>
    </div>
`;
}

// ── Data Health Tab — render: Schema Check ───────────────────────────
function _dhRenderSchemaCheckHtml(data) {
  const { schemaResults } = data;
  const schemaRows = schemaResults.map(r => {
    let statusCell;
    let detailCell;
    if (!r.checked) {
      statusCell = '<span class="dh-muted">Not checked</span>';
      detailCell = '<span class="dh-muted">No columns registered</span>';
    } else if (r.error) {
      statusCell = '<span class="dh-badge dh-badge-danger">Query error</span>';
      detailCell = '<span class="dh-muted">—</span>';
    } else if (r.missing.length === 0 && r.unexpected.length === 0) {
      statusCell = '<span class="dh-badge dh-badge-success">OK</span>';
      detailCell = '<span class="dh-muted">—</span>';
    } else {
      const parts = [];
      if (r.missing.length) parts.push(r.missing.length + ' missing');
      if (r.unexpected.length) parts.push(r.unexpected.length + ' unexpected');
      statusCell = '<span class="dh-badge dh-badge-warn">' + escHtml(parts.join(', ')) + '</span>';
      const detailParts = [];
      if (r.missing.length) detailParts.push('Missing: ' + escHtml(r.missing.join(', ')));
      if (r.unexpected.length) detailParts.push('Unexpected: ' + escHtml(r.unexpected.join(', ')));
      detailCell = detailParts.join('<br>');
    }
    return `
    <tr>
      <td>${escHtml(r.list)}</td>
      <td>${r.checked ? r.expectedCount.toLocaleString('en-GB') : '<span class="dh-muted">—</span>'}</td>
      <td>${detailCell}</td>
      <td>${statusCell}</td>
    </tr>`;
  }).join('');

  return `    <h3>Schema Check</h3>
    <p class="dh-note">
      Every list registered in FIELD_ALIASES, diffed against what Newton
      expects to read (CONFIG.LIST_FIELDS for a projected list, otherwise
      just its aliased columns). Missing means an expected column is gone;
      Unexpected means a real column exists that no projection knows about
      — a rename usually shows up as both at once, on the same list. Lists
      with nothing registered to check show "No columns registered" rather
      than a false pass.
    </p>
    <div class="table-scroll">
    <table class="data-table dh-table">
      <thead><tr><th>List</th><th>Checked columns</th><th>Detail</th><th>Status</th></tr></thead>
      <tbody>${schemaRows || emptyStateRow({ colspan: 4, icon: 'database', message: 'No lists registered.' })}</tbody>
    </table>
    </div>
`;
}

// ── Data Health Tab — render: Error Telemetry ────────────────────────
function _dhRenderErrorTelemetryHtml(data) {
  const { diagList } = data;
  const diagTableRows = diagList.map(g => {
    const users = [...g.users];
    // Display-only truncation, not a business threshold — no CONFIG entry.
    const usersDisplay = users.length > 3
      ? escHtml(users.slice(0, 3).join(', ')) + ' <span class="dh-muted">+' + (users.length - 3) + ' more</span>'
      : escHtml(users.join(', ') || '—');
    const lastSeenDisplay = new Date(g.lastSeen).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    return `
    <tr>
      <td>${escHtml(g.message)}</td>
      <td>${escHtml(g.module)}</td>
      <td>${g.count}</td>
      <td>${usersDisplay}</td>
      <td>${lastSeenDisplay}</td>
      <td><button class="btn-secondary"${act('acknowledgeDiagnosticsGroup', g.ids.join(','))}>Acknowledge</button></td>
    </tr>`;
  }).join('');

  return `    <h3>Error Telemetry</h3>
    <p class="dh-note">
      Uncaught errors and unhandled promise rejections from any Newton screen
      (N-172), grouped by message. Acknowledging a group clears it from this
      view — the underlying Diagnostics rows are never deleted.
    </p>
    <div class="table-scroll">
    <table class="data-table dh-table">
      <thead><tr><th>Message</th><th>Module</th><th>Occurrences</th><th>Users</th><th>Last seen</th><th></th></tr></thead>
      <tbody>${diagTableRows || emptyStateRow({ colspan: 6, icon: 'bug', message: 'No unacknowledged errors.' })}</tbody>
    </table>
    </div>
  `;
}
async function acknowledgeDiagnosticsGroup(idsCsv) {
  // N-106 pattern: capture the button synchronously — the implicit global
  // `event` is only populated during the synchronous dispatch, so reading it
  // after the confirmModal await would yield undefined.
  const btn = event?.target;
  if (!(await confirmModal({
    message: 'Acknowledge this error group? It will disappear from this view.',
    confirmLabel: 'Acknowledge',
  }))) return;
  setButtonLoading(btn);
  try {
    await acknowledgeDiagnosticGroup(idsCsv.split(',').map(Number));
    await renderOsAdminPage('datahealth');
  } catch (e) {
    clearButtonLoading(btn);
    toast('Error acknowledging group: ' + e.message, { type: 'error' });
  }
}

// N-302a / N-302e: delegated actions this file owns (js/actions.js).
// Never register a name twice.
registerActions({
  setOsaSearch,
  setOsaSort,
  renderOsAdminPage,
  showEditAssignment,
  toggleAssignmentActive,
  deleteOsAdminRecord,
  submitAssignment,
  _toggleShowInactiveAssignments,
  uploadLeadershipPhoto,
  submitLeadershipUser,
  setFx,
  submitAnnouncement,
  clearAnnouncement,
  activateGhostUser,
  deactivateGhost,
  restoreFunnelFlag,
  acknowledgeFunnelFlag,
  acknowledgeDiagnosticsGroup,
});