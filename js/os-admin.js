// js/os-admin.js — Newton OS Admin (User Assignments + Leadership Access)
let _osAdminTab = 'assignments';
async function renderOsAdminPage(tab = 'assignments') {
  _osAdminTab = tab;
  const main = document.getElementById('main-content');
const tabs = ['assignments', 'leadership', 'homepage'];
const labels = { assignments: 'User Assignments', leadership: 'Leadership Access', homepage: 'Homepage' };
const tooltips = {
  assignments: 'Manage user roles and project access. Users are auto-registered on first login — assign their role and projects here.',
  leadership:  'Grant Leadership-level access to users who should see the Company Dashboard without full system access.',
  homepage:    'Manage homepage appearance and seasonal effects.',
};
  const tabBar = tabs.map(t =>
    `<button class="btn-filter${_osAdminTab === t ? ' active' : ''}"
      onclick="renderOsAdminPage('${t}')">${labels[t]}<span class="help-tip">?<span class="help-tip-text">${tooltips[t]}</span></span></button>`
  ).join('');
  let content = '';
  if (tab === 'assignments') content = await buildAssignmentsTab();
  if (tab === 'leadership')  content = await buildLeadershipTab();
  if (tab === 'homepage')    content = await buildHomepageTab();
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
const rows = [...assignments].sort((a, b) => (a.UserName || '').localeCompare(b.UserName || '')).map(a => `
    <tr id="assign-row-${a.id}">
      <td>${a.UserName || '—'}</td>
      <td>${a.UserEmail}</td>
      <td>${a.CustomerName || '—'}</td>
      <td>${a.AssignedRole === 'talent_partner' ? 'Talent Partner' : a.AssignedRole === 'delivery_manager' ? 'Delivery Manager' : a.AssignedRole || '—'}</td>
      <td>${a.LastLogin ? new Date(a.LastLogin).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
      <td style="display:flex;gap:8px">
        <a href="#" onclick="showEditAssignment(${a.id})">Edit</a>
        <a href="#" onclick="deleteOsAdminRecord('UserAssignments',${a.id})">Remove</a>
      </td>
    </tr>`).join('');
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
  const [projectId, customerName] = projVal ? projVal.split('|') : ['0', ''];
  try {
    if (editId) {
      await updateItem('UserAssignments', editId, {
        Title: email, UserName: name,
        ProjectID: parseInt(projectId) || 0,
        CustomerName: customerName || '', AssignedRole: role
      });
    } else {
      await createItem('UserAssignments', {
        Title: email, UserName: name,
        ProjectID: parseInt(projectId) || 0,
        CustomerName: customerName || '', AssignedRole: role
      });
    }
    await renderOsAdminPage('assignments');
  } catch(e) {
    errEl.textContent = `Error: ${e.message}`; errEl.style.display = 'block';
  }
}
// ── Leadership Tab ───────────────────────────────────────────────────
async function buildLeadershipTab() {
  const list = await getLeadershipAccess();
  const rows = list.map(l => `
    <tr>
      <td>${l.UserName || '—'}</td>
      <td>${l.UserEmail}</td>
      <td><a href="#" onclick="deleteOsAdminRecord('LeadershipAccess',${l.id})">Remove</a></td>
    </tr>`).join('');
  return `
    <h3>Leadership Access List</h3>
    <p style="font-size:13px;color:#666;margin-bottom:16px">
      These individuals have read-only access to the Company Dashboard.
    </p>
    <table class="data-table" style="margin:0 0 24px">
      <thead><tr><th>Name</th><th>Email</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan=3>No leadership users yet.</td></tr>'}</tbody>
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
      <div id="lead-error" class="form-error"></div>
      <button class="btn-primary" onclick="submitLeadershipUser()">Add User</button>
    </div>
  `;
}
async function submitLeadershipUser() {
  const name  = document.getElementById('lead-name').value.trim();
  const email = document.getElementById('lead-email').value.trim();
  const errEl = document.getElementById('lead-error');
  errEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Email is required.'; errEl.style.display = 'block'; return; }
  try {
    await createItem('LeadershipAccess', { Title: email, UserName: name });
    await renderOsAdminPage('leadership');
  } catch(e) {
    errEl.textContent = `Error: ${e.message}`; errEl.style.display = 'block';
  }
}
async function deleteOsAdminRecord(listName, id) {
  if (!confirm('Remove this record?')) return;
  await graphRequest('DELETE', `/sites/${CONFIG.SP_SITE_ID}/lists/${listName}/items/${id}`);
  await renderOsAdminPage(_osAdminTab);
}
// ── Homepage Tab ───────────────────────────────────────────────────
async function buildHomepageTab() {
  const current = await getAnnouncementMessage();
  const active = localStorage.getItem('newton_fx') || 'none';
  const effects = [
    { key: 'spring', label: '🌸 Spring',           desc: 'Grass and flowers along the bottom of the screen' },
    { key: 'summer', label: '☀ Summer Scene',      desc: 'Sun, sandy beach and gentle waves' },
    { key: 'autumn', label: '🍂 Autumn',           desc: 'Falling autumn leaves' },
    { key: 'snow',   label: '❄ Snowfall',         desc: 'Falling snow animation' },
    { key: 'lights', label: '🎄 Christmas Lights', desc: 'String of twinkling coloured lights across the top' },
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
function setFx(key) {
  localStorage.setItem('newton_fx', key);
  renderOsAdminPage('homepage');
}
async function submitAnnouncement() {
  const msg    = document.getElementById('announcement-text').value.trim();
  const status = document.getElementById('announcement-status');
  status.style.display = 'none';
  try {
    await setAnnouncementMessage(msg);
    refreshAnnouncementTicker(msg);
    status.style.color   = '#2e7d32';
    status.textContent   = msg ? 'Banner updated.' : 'Banner cleared.';
    status.style.display = 'block';
  } catch(e) {
    status.style.color   = '#c62828';
    status.textContent   = `Error: ${e.message}`;
    status.style.display = 'block';
  }
}
async function clearAnnouncement() {
  document.getElementById('announcement-text').value = '';
  await submitAnnouncement();
}
