// js/os-admin.js — Newton OS Admin (User Assignments + Leadership Access)
let _osAdminTab = 'assignments';
async function renderOsAdminPage(tab = 'assignments') {
  _osAdminTab = tab;
  const main = document.getElementById('main-content');
const tabs = ['assignments', 'leadership', 'homepage', 'ghost'];
const labels = { assignments: 'User Assignments', leadership: 'Leadership Access', homepage: 'Homepage', ghost: 'Ghost Mode' };
const tooltips = {
  assignments: 'Manage user roles and project access. Users are auto-registered on first login — assign their role and projects here.',
  leadership:  'Grant Leadership-level access to users who should see the Company Dashboard without full system access.',
  homepage:    'Manage homepage appearance and seasonal effects.',
  ghost:       'Temporarily view Newton as a different role type for testing. Only visible to admins.',
};
  const tabBar = tabs.map(t =>
    `<button class="btn-filter${_osAdminTab === t ? ' active' : ''}"
      onclick="renderOsAdminPage('${t}')">${labels[t]}<span class="help-tip">?<span class="help-tip-text">${tooltips[t]}</span></span></button>`
  ).join('');
  let content = '';
  if (tab === 'assignments') content = await buildAssignmentsTab();
  if (tab === 'leadership')  content = await buildLeadershipTab();
  if (tab === 'homepage')    content = await buildHomepageTab();
  if (tab === 'ghost') content = await buildGhostTab();
  main.innerHTML = `
    <div class="page-header">
      <h2>${labels[tab]}</h2>
      <div class="filter-group">${tabBar}</div>
    </div>
    <div style="padding:24px">${content}</div>
  `;
}
// ── Assignments Tab ──────────────────────────────────────────────────
async function buildAssignmentsTab(editId = null) {
  const [projects, assignments] = await Promise.all([
    getProjects(false), getUserAssignments()
  ]);
  const projectOptions = projects.map(p =>
    `<option value="${p.id}|${p.CustomerName}">${p.CustomerName}</option>`
  ).join('');
  let editRecord = null;
  if (editId) editRecord = assignments.find(a => String(a.id) === String(editId));
const rows = [...assignments].sort((a, b) => (a.UserName || '').localeCompare(b.UserName || '')).map(a => {
    const isActive = a.Active !== false;
    return `
    <tr id="assign-row-${a.id}" style="${isActive ? '' : 'opacity:0.55'}">
      <td>${a.UserName || '—'}${isActive ? '' : ' <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:#eee;color:#666;">Inactive</span>'}</td>
      <td>${a.UserEmail}</td>
      <td>${a.CustomerName || '—'}</td>
      <td>${a.AssignedRole === 'talent_partner' ? 'Talent Partner' : a.AssignedRole === 'delivery_manager' ? 'Delivery Manager' : a.AssignedRole || '—'}</td>
      <td>${a.LastLogin ? new Date(a.LastLogin).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
      <td>
        <div class="row-actions" style="gap:12px;align-items:center">
          <a href="#" onclick="showEditAssignment(${a.id})">Edit</a>
          <button class="btn-secondary" onclick="toggleAssignmentActive(${a.id}, ${!isActive})">${isActive ? 'Deactivate' : 'Reactivate'}</button>
          <button class="btn-danger" onclick="deleteOsAdminRecord('UserAssignments',${a.id})">Remove</button>
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
          <input type="text" id="assign-name" value="${editRecord.UserName || ''}">
        </div>
        <div class="form-group">
          <label>User Email *</label>
          <input type="email" id="assign-email" value="${editRecord.UserEmail || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Customer</label>
          <select id="assign-project">
            <option value="">-- Select customer --</option>
            ${projects.map(p => `
              <option value="${p.id}|${p.CustomerName}" ${String(p.id) === String(editRecord.ProjectID) ? 'selected' : ''}>
                ${p.CustomerName}
              </option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Role *</label>
          <select id="assign-role">
            <option value="talent_partner" ${editRecord.AssignedRole === 'talent_partner' ? 'selected' : ''}>Talent Partner</option>
            <option value="delivery_manager" ${editRecord.AssignedRole === 'delivery_manager' ? 'selected' : ''}>Delivery Manager</option>
            <option value="viewer" ${editRecord.AssignedRole === 'viewer' ? 'selected' : ''}>Viewer</option>
          </select>
        </div>
      </div>
      <div id="assign-error" class="form-error"></div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary" onclick="submitAssignment(${editRecord.id})">Save Changes</button>
        <button class="btn-secondary" onclick="renderOsAdminPage('assignments')">Cancel</button>
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
          <label>Customer</label>
          <select id="assign-project">
            <option value="">-- Select customer --</option>
            ${projectOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Role *</label>
          <select id="assign-role">
            <option value="talent_partner">Talent Partner</option>
            <option value="delivery_manager">Delivery Manager</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>
      <div id="assign-error" class="form-error"></div>
      <button class="btn-primary" onclick="submitAssignment()">Add Assignment</button>
    </div>
  `;
  return `
    <h3>Current Assignments</h3>
    <table class="data-table" style="margin:0 0 24px">
      <thead><tr><th>Name</th><th>Email</th><th>Customer</th><th>Role</th><th>Last Login</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan=5>No assignments yet.</td></tr>'}</tbody>
    </table>
    ${editForm}
  `;
}
async function showEditAssignment(id) {
  const content = await buildAssignmentsTab(id);
  document.querySelector('#main-content > div[style]').innerHTML = content;
}
async function submitAssignment(editId = null) {
  const name    = document.getElementById('assign-name').value.trim();
  const email   = document.getElementById('assign-email').value.trim();
  const projVal = document.getElementById('assign-project').value;
  const role    = document.getElementById('assign-role').value;
  const errEl   = document.getElementById('assign-error');
  errEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Email is required.'; errEl.style.display = 'block'; return; }
  const btn = document.querySelector('.btn-primary[onclick^="submitAssignment"]') ||
              document.querySelector('.form-container .btn-primary');
  setButtonLoading(btn);
  const [projectId, customerName] = projVal ? projVal.split('|') : ['0', ''];
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
  await updateItem('UserAssignments', id, { Active: makeActive });
  renderOsAdminPage('assignments');
}

// ── Leadership Tab ───────────────────────────────────────────────────
async function buildLeadershipTab() {
  const list = await getLeadershipAccess();
  const rows = list.map(l => `
    <tr>
      <td>${l.PhotoUrl
            ? `<img src="${l.PhotoUrl}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover">`
            : '<span style="color:#aaa;font-size:12px">—</span>'}</td>
      <td>${l.UserName || '—'}</td>
      <td>${l.UserEmail}</td>
      <td>
        <div class="row-actions" style="gap:6px">
          <input type="file" id="lead-photofile-${l.id}" accept="image/*">
          <button class="btn-secondary" onclick="uploadLeadershipPhoto(${l.id})">Upload photo</button>
          <button class="btn-danger" onclick="deleteOsAdminRecord('LeadershipAccess',${l.id})">Remove</button>
        </div>
      </td>
    </tr>`).join('');
  return `
    <h3>Leadership Access List</h3>
    <p style="font-size:13px;color:#666;margin-bottom:16px">
      These individuals have read-only access to the Company Dashboard.
    </p>
    <table class="data-table" style="margin:0 0 24px">
      <thead><tr><th>Photo</th><th>Name</th><th>Email</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan=4>No leadership users yet.</td></tr>'}</tbody>
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
        <label>Photo <span style="font-size:11px;color:#888;font-weight:normal">optional</span></label>
        <input type="file" id="lead-photofile" accept="image/*">
      </div>
      <div id="lead-error" class="form-error"></div>
      <button class="btn-primary" onclick="submitLeadershipUser()">Add User</button>
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
  const btn = document.querySelector('.btn-primary[onclick="submitLeadershipUser()"]');
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
  if (!file) { alert('Choose an image first.'); return; }
  const btn = input.nextElementSibling;
  setButtonLoading(btn);
  try {
    const url = await uploadPeoplePhoto('leader', id, file);
    await updateItem('LeadershipAccess', id, { PhotoUrl: url });
    await renderOsAdminPage('leadership');
  } catch (e) {
    clearButtonLoading(btn);
    alert('Error uploading photo: ' + e.message);
  }
}
async function deleteOsAdminRecord(listName, id) {
  if (!confirm('Remove this record?')) return;
  await graphRequest('DELETE', `/sites/${CONFIG.SP_SITE_ID}/lists/${listName}/items/${id}`);
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
                padding:16px 0;border-bottom:1px solid #eee">
      <div>
        <div style="font-size:14px;font-weight:600;color:#0A0B44">${e.label}</div>
        <div style="font-size:13px;color:#666;margin-top:2px">${e.desc}</div>
      </div>
      <button class="btn-${active === e.key ? 'primary' : 'secondary'}"
        onclick="setFx('${active === e.key ? 'none' : e.key}')" style="min-width:80px">
        ${active === e.key ? 'On' : 'Off'}
      </button>
    </div>`).join('');
  return `
    <h3>Announcement Banner</h3>
    <p style="font-size:13px;color:#666;margin-bottom:16px">
      Set a scrolling message that appears at the bottom of the screen for all users.
      Clear the field and save to remove it.
    </p>
    <div style="background:white;border:1px solid #e0e0e0;border-radius:6px;
                padding:20px 24px;max-width:520px;margin-bottom:32px">
      <div class="form-group">
        <label>Message</label>
        <textarea id="announcement-text" rows="3"
          placeholder="e.g. Welcome to Newton — Q2 targets are live!"
          style="resize:vertical">${current ? current.replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''}</textarea>
      </div>
      <div id="announcement-status" style="display:none;font-size:13px;margin-bottom:12px"></div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn-primary" onclick="submitAnnouncement()">Save</button>
        <button class="btn-secondary" onclick="clearAnnouncement()">Clear Banner</button>
      </div>
    </div>
    <h3>Seasonal Effects</h3>
    <p style="font-size:13px;color:#666;margin-bottom:16px">
      One effect can be active at a time. Changes take effect on the Newton home screen immediately.
    </p>
    <div style="background:white;border:1px solid #e0e0e0;border-radius:6px;
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
  const btn    = document.querySelector('.btn-primary[onclick="submitAnnouncement()"]');
  status.style.display = 'none';
  setButtonLoading(btn);
  try {
    await setAnnouncementMessage(msg);
    clearButtonLoading(btn);
    status.style.color   = '#2e7d32';
    status.textContent   = msg ? 'Banner updated.' : 'Banner cleared.';
    status.style.display = 'block';
  } catch(e) {
    clearButtonLoading(btn);
    status.style.color   = '#c62828';
    status.textContent   = `Error: ${e.message}`;
    status.style.display = 'block';
  }
}
async function clearAnnouncement() {
  document.getElementById('announcement-text').value = '';
  await submitAnnouncement();
}

// ── Ghost Mode Tab ───────────────────────────────────────────────────
const GHOST_PROJECT_ROLES = ['delivery_manager', 'talent_partner'];

async function buildGhostTab() {
  const current        = getGhostRole();
  const currentProject = getGhostProject();
  const projects       = await getProjects(false);

  const roles = [
    { key: 'delivery_manager', label: 'Delivery Manager' },
    { key: 'talent_partner',   label: 'Talent Partner' },
    { key: 'leadership',       label: 'Leadership' },
    { key: 'viewer',           label: 'Viewer' },
  ];

  const projectOptions = projects
    .sort((a, b) => a.CustomerName.localeCompare(b.CustomerName))
    .map(p => `<option value="${p.id}" ${String(p.id) === currentProject ? 'selected' : ''}>${p.CustomerName}</option>`)
    .join('');

  const roleButtons = roles.map(r => `
    <button class="btn-${current === r.key ? 'primary' : 'secondary'}"
      onclick="selectGhostRole('${r.key}')" style="min-width:160px">
      ${r.label}${current === r.key ? ' ✓' : ''}
    </button>`).join('');

  const needsProject = current && GHOST_PROJECT_ROLES.includes(current);

  const projectPicker = needsProject ? `
    <div class="form-group" style="margin-top:16px;max-width:320px">
      <label>Project to ghost as</label>
      <select id="ghost-project-select">
        <option value="">-- Select project --</option>
        ${projectOptions}
      </select>
    </div>` : '';

  const activateBtn = current ? `
    <button class="btn-primary" style="margin-top:16px"
      onclick="activateGhost()">
      Activate Ghost Mode
    </button>` : '';

  return `
    <h3>Ghost Mode</h3>
    <p style="font-size:13px;color:#666;margin-bottom:24px">
      Temporarily view Newton as a different role. A banner will appear at the top of every
      page while ghost mode is active. Navigate to any module to see that role's experience.
      Your real admin access is restored when you exit.
    </p>
    <div style="background:white;border:1px solid #e0e0e0;border-radius:6px;
                padding:20px 24px;max-width:520px">
      ${current ? `
        <div style="background:#fff3e0;border:1px solid #ffb74d;border-radius:4px;
                    padding:12px 16px;margin-bottom:20px;font-size:13px">
          👻 Currently ghosting as <strong>${current.replace(/_/g, ' ')}
          ${currentProject ? '— ' + (projects.find(p => String(p.id) === currentProject)?.CustomerName || '') : ''}
          </strong>
        </div>` : ''}
      <div style="display:flex;flex-direction:column;gap:10px">
        ${roleButtons}
      </div>
      ${projectPicker}
      ${activateBtn}
      ${current ? `
        <button class="btn-danger" style="margin-top:12px"
          onclick="deactivateGhost()">Exit Ghost Mode</button>` : ''}
    </div>
  `;
}

function selectGhostRole(role) {
  setGhostRole(role);
  sessionStorage.removeItem(GHOST_PROJECT_KEY);
  renderOsAdminPage('ghost');
}

function activateGhost() {
  const role = getGhostRole();
  if (!role) return;
  if (GHOST_PROJECT_ROLES.includes(role)) {
    const projectId = document.getElementById('ghost-project-select')?.value;
    if (!projectId) {
      alert('Please select a project before activating ghost mode.');
      return;
    }
    setGhostProject(projectId);
  }
  window.location.href = 'reporting.html';
}

function deactivateGhost() {
  clearGhostRole();
  window.location.reload();
}
