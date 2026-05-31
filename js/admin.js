// js/admin.js — Reporting Admin Panel (Departments + Delete Records)
let _adminTab = 'departments';
async function renderAdminPage() {
  const main = document.getElementById('main-content');
  const user = getCurrentUser();
  const role = getUserRole(user.email);
  if (role !== 'admin') {
    main.innerHTML = '<p>Access denied.</p>';
    return;
  }
  main.innerHTML = '<p>Loading admin panel...</p>';
  await renderAdminTab(_adminTab);
}
async function renderAdminTab(tab) {
  _adminTab = tab;
  const main = document.getElementById('main-content');
  const tabs = ['departments', 'delete', 'homepage'];
  const labels = { departments: 'Departments', delete: 'Delete Records', homepage: 'Homepage' };
  const tooltips = {
    departments: 'Manage the list of departments used when categorising roles and projects across the system.',
    delete:      'Permanently delete records from the system. Use with caution — this action cannot be undone.',
    homepage:    'Set the announcement banner displayed to all users at the bottom of the screen.',
  };
  const tabBar = tabs.map(t =>
    `<button class="btn-filter${_adminTab === t ? ' active' : ''}"
      onclick="renderAdminTab('${t}')">${labels[t]}<span class="help-tip">?<span class="help-tip-text">${tooltips[t]}</span></span></button>`
  ).join('');
  let content = '';
  if (tab === 'departments') content = await buildDepartmentsTab();
  if (tab === 'delete')      content = await buildDeleteTab();
  if (tab === 'homepage')    content = await buildHomepageTab();
  main.innerHTML = `
    <div class="page-header">
      <h2>Admin Panel</h2>
      <div class="filter-group">${tabBar}</div>
    </div>
    <div style="padding:24px">${content}</div>
  `;
}
// ── Departments Tab ──────────────────────────────────────────────────
async function buildDepartmentsTab() {
  const [projects, depts] = await Promise.all([getProjects(false), getDepartments()]);
  const rows = depts.map(d => `
    <tr>
      <td>${d.DepartmentName}</td>
      <td>${d.CustomerName || '—'}</td>
      <td><a href="#" onclick="deleteAdminRecord('Departments',${d.id})">Remove</a></td>
    </tr>`).join('');
  const projectOptions = projects.map(p =>
    `<option value="${p.id}|${p.CustomerName}">${p.CustomerName}</option>`
  ).join('');
  return `
    <h3>Department Options</h3>
    <table class="data-table" style="margin:0 0 24px">
      <thead><tr><th>Department</th><th>Customer</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan=3>No departments defined yet.</td></tr>'}</tbody>
    </table>
    <h3>Add Department</h3>
    <div class="form-container" style="padding:0;max-width:500px">
      <div class="form-row">
        <div class="form-group">
          <label>Department Name *</label>
          <input type="text" id="dept-name" placeholder="e.g. Engineering">
        </div>
        <div class="form-group">
          <label>Customer *</label>
          <select id="dept-project">
            <option value="">-- Select customer --</option>
            ${projectOptions}
          </select>
        </div>
      </div>
      <div id="dept-error" class="form-error"></div>
      <button class="btn-primary" onclick="submitDepartment()">Add Department</button>
    </div>
  `;
}
async function submitDepartment() {
  const name    = document.getElementById('dept-name').value.trim();
  const projVal = document.getElementById('dept-project').value;
  const errEl   = document.getElementById('dept-error');
  errEl.style.display = 'none';
  if (!name || !projVal) {
    errEl.textContent = 'Department name and customer are required.';
    errEl.style.display = 'block'; return;
  }
  const [projectId, customerName] = projVal.split('|');
  try {
    await createItem('Departments', { Title: name, ProjectID: parseInt(projectId), CustomerName: customerName });
    await renderAdminTab('departments');
  } catch(e) {
    errEl.textContent = `Error: ${e.message}`; errEl.style.display = 'block';
  }
}
// ── Delete Tab ───────────────────────────────────────────────────────
const DELETE_LIST_CONFIG = {
  Projects:        { label: 'Projects',         displayField: 'CustomerName' },
  Roles:           { label: 'Roles',            displayField: 'RoleTitle' },
  WeeklyActivity:  { label: 'Weekly Activity',  displayField: 'ActivityTitle' },
  Placements:      { label: 'Placements',       displayField: 'CandidateName' },
  RejectedOffers:  { label: 'Rejected Offers',  displayField: 'CandidateName' },
  Departments:     { label: 'Departments',      displayField: 'DepartmentName' },
};
async function buildDeleteTab() {
  const listOptions = Object.entries(DELETE_LIST_CONFIG).map(([key, cfg]) =>
    `<option value="${key}">${cfg.label}</option>`
  ).join('');
  return `
    <h3>Delete Records</h3>
    <p style="font-size:13px;color:#666;margin-bottom:16px">
      Select a list, then choose the record to delete. This cannot be undone from the app —
      use SharePoint's recycle bin to recover deleted items.
    </p>
    <div class="form-container" style="padding:0;max-width:500px">
      <div class="form-group">
        <label>List *</label>
        <select id="del-list" onchange="loadDeleteItems(this.value)">
          <option value="">-- Select list --</option>
          ${listOptions}
        </select>
      </div>
      <div class="form-group">
        <label>Record *</label>
        <select id="del-item" disabled>
          <option value="">-- Select list first --</option>
        </select>
      </div>
      <div id="del-error" class="form-error"></div>
      <div id="del-confirm" style="display:none;background:#fde8e8;border:1px solid #e57373;
        padding:12px;border-radius:4px;margin-bottom:12px;font-size:13px">
        Are you sure? This record will be permanently deleted.
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn-primary" style="background:#c00000" onclick="confirmDelete()">Yes, Delete</button>
          <button class="btn-secondary" onclick="cancelDelete()">Cancel</button>
        </div>
      </div>
      <button class="btn-primary" id="del-btn" onclick="initiateDelete()">Delete Record</button>
    </div>
  `;
}
async function loadDeleteItems(listName) {
  const select = document.getElementById('del-item');
  if (!listName) { select.innerHTML = '<option value="">-- Select list first --</option>'; select.disabled = true; return; }
  select.innerHTML = '<option value="">Loading...</option>'; select.disabled = true;
  try {
    const items = await getItems(listName);
    const displayField = DELETE_LIST_CONFIG[listName]?.displayField || 'id';
    select.innerHTML = '<option value="">-- Select record --</option>' +
      items.map(i => `<option value="${i.id}">${i[displayField] || `ID ${i.id}`}</option>`).join('');
    select.disabled = false;
  } catch(e) { select.innerHTML = '<option value="">-- Error loading records --</option>'; }
}
function initiateDelete() {
  const list = document.getElementById('del-list').value;
  const id   = document.getElementById('del-item').value;
  const errEl = document.getElementById('del-error');
  errEl.style.display = 'none';
  if (!list || !id) { errEl.textContent = 'Please select a list and a record.'; errEl.style.display = 'block'; return; }
  document.getElementById('del-confirm').style.display = 'block';
  document.getElementById('del-btn').style.display = 'none';
}
async function confirmDelete() {
  const list = document.getElementById('del-list').value;
  const id   = document.getElementById('del-item').value;
  try {
    await graphRequest('DELETE', `/sites/${CONFIG.SP_SITE_ID}/lists/${list}/items/${id}`);
    await renderAdminTab('delete');
  } catch(e) {
    document.getElementById('del-error').textContent = `Error: ${e.message}`;
    document.getElementById('del-error').style.display = 'block';
    document.getElementById('del-confirm').style.display = 'none';
    document.getElementById('del-btn').style.display = 'block';
  }
}
function cancelDelete() {
  document.getElementById('del-confirm').style.display = 'none';
  document.getElementById('del-btn').style.display = 'block';
}
async function deleteAdminRecord(listName, id) {
  if (!confirm('Remove this record?')) return;
  await graphRequest('DELETE', `/sites/${CONFIG.SP_SITE_ID}/lists/${listName}/items/${id}`);
  await renderAdminTab(_adminTab);
}
// ── Homepage Tab ─────────────────────────────────────────────────────
async function buildHomepageTab() {
  const current = await getAnnouncementMessage();
  return `
    <h3>Announcement Banner</h3>
    <p style="font-size:13px;color:#666;margin-bottom:16px">
      Set a scrolling message that appears at the bottom of the screen for all users.
      Clear the field and save to remove it.
    </p>
    <div class="form-container" style="padding:0;max-width:600px">
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
  `;
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
