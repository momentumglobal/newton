// js/admin.js — Admin Panel
let _adminTab = 'assignments';
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
  const tabs = ['assignments','leadership','departments','delete'];
  const labels = {
    assignments: 'User Assignments',
    leadership:  'Leadership Access',
    departments: 'Departments',
    delete:      'Delete Records',
  };
  const tabBar = tabs.map(t =>
    `<button class="btn-filter${_adminTab === t ? ' active' : ''}"
      onclick="renderAdminTab('${t}')">${labels[t]}</button>`
  ).join('');
  let content = '';
  if (tab === 'assignments') content = await buildAssignmentsTab();
  if (tab === 'leadership')  content = await buildLeadershipTab();
  if (tab === 'departments') content = await buildDepartmentsTab();
  if (tab === 'delete')      content = await buildDeleteTab();
  main.innerHTML = `
    <div class="page-header">
      <h2>Admin Panel</h2>
      <div class="filter-group">${tabBar}</div>
    </div>
    <div style="padding:24px">${content}</div>
  `;
}
// ── Assignments Tab ──────────────────────────────────────────────────
async function buildAssignmentsTab() {
  const [projects, assignments] = await Promise.all([
    getProjects(false), getUserAssignments()
  ]);
  const rows = assignments.map(a => `
    <tr>
      <td>${a.UserName || '—'}</td>
      <td>${a.UserEmail}</td>
      <td>${a.CustomerName || '—'}</td>
      <td>${a.AssignedRole === 'talent_partner' ? 'Talent Partner' : 'Delivery Manager'}</td>
      <td><a href="#" onclick="deleteAdminRecord('UserAssignments',${a.id})">Remove</a></td>
    </tr>`).join('');
  const projectOptions = projects.map(p =>
    `<option value="${p.id}|${p.CustomerName}">${p.CustomerName}</option>`
  ).join('');
  return `
    <h3>Current Assignments</h3>
    <table class="data-table" style="margin:0 0 24px">
      <thead><tr>
        <th>Name</th><th>Email</th><th>Customer</th><th>Role</th><th></th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan=5>No assignments yet.</td></tr>'}</tbody>
    </table>
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
          </select>
        </div>
      </div>
      <div id="assign-error" class="form-error"></div>
      <button class="btn-primary" onclick="submitAssignment()">Add Assignment</button>
    </div>
  `;
}
async function submitAssignment() {
  const name     = document.getElementById('assign-name').value.trim();
  const email    = document.getElementById('assign-email').value.trim();
  const projVal  = document.getElementById('assign-project').value;
  const role     = document.getElementById('assign-role').value;
  const errEl    = document.getElementById('assign-error');
  errEl.style.display = 'none';
  if (!email) {
    errEl.textContent = 'Email is required.';
    errEl.style.display = 'block'; return;
  }
  const [projectId, customerName] = projVal ? projVal.split('|') : ['0', ''];
  try {
    await createItem('UserAssignments', {
      Title: email, UserName: name,
      ProjectID: parseInt(projectId) || 0,
      CustomerName: customerName || '',
      AssignedRole: role
    });
    await renderAdminTab('assignments');
  } catch(e) {
    errEl.textContent = `Error: ${e.message}`;
    errEl.style.display = 'block';
  }
}
// ── Leadership Tab ───────────────────────────────────────────────────
async function buildLeadershipTab() {
  const list = await getLeadershipAccess();
  const rows = list.map(l => `
    <tr>
      <td>${l.UserName || '—'}</td>
      <td>${l.UserEmail}</td>
      <td><a href="#" onclick="deleteAdminRecord('LeadershipAccess',${l.id})">Remove</a></td>
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
  if (!email) {
    errEl.textContent = 'Email is required.';
    errEl.style.display = 'block'; return;
  }
  try {
    await createItem('LeadershipAccess', { Title: email, UserName: name });
    await renderAdminTab('leadership');
  } catch(e) {
    errEl.textContent = `Error: ${e.message}`;
    errEl.style.display = 'block';
  }
}
// ── Departments Tab ──────────────────────────────────────────────────
async function buildDepartmentsTab() {
  const [projects, depts] = await Promise.all([
    getProjects(false), getDepartments()
  ]);
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
    await createItem('Departments', {
      Title: name, ProjectID: parseInt(projectId), CustomerName: customerName
    });
    await renderAdminTab('departments');
  } catch(e) {
    errEl.textContent = `Error: ${e.message}`;
    errEl.style.display = 'block';
  }
}
// ── Delete Tab ───────────────────────────────────────────────────────
// Display labels for each list's items
const DELETE_LIST_CONFIG = {
  Projects:        { label: 'Projects',         displayField: 'CustomerName' },
  Roles:           { label: 'Roles',            displayField: 'RoleTitle' },
  WeeklyActivity:  { label: 'Weekly Activity',  displayField: 'ActivityTitle' },
  Placements:      { label: 'Placements',       displayField: 'CandidateName' },
  RejectedOffers:  { label: 'Rejected Offers',  displayField: 'CandidateName' },
  UserAssignments: { label: 'User Assignments', displayField: 'UserEmail' },
  LeadershipAccess:{ label: 'Leadership Access',displayField: 'UserEmail' },
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
          <button class="btn-primary" style="background:#c00000" onclick="confirmDelete()">
            Yes, Delete</button>
          <button class="btn-secondary" onclick="cancelDelete()">Cancel</button>
        </div>
      </div>
      <button class="btn-primary" id="del-btn" onclick="initiateDelete()">Delete Record</button>
    </div>
  `;
}
async function loadDeleteItems(listName) {
  const select = document.getElementById('del-item');
  if (!listName) {
    select.innerHTML = '<option value="">-- Select list first --</option>';
    select.disabled = true;
    return;
  }
  select.innerHTML = '<option value="">Loading...</option>';
  select.disabled = true;
  try {
    const items = await getItems(listName);
    const displayField = DELETE_LIST_CONFIG[listName]?.displayField || 'id';
    select.innerHTML = '<option value="">-- Select record --</option>' +
      items.map(i =>
        `<option value="${i.id}">${i[displayField] || `ID ${i.id}`}</option>`
      ).join('');
    select.disabled = false;
  } catch(e) {
    select.innerHTML = '<option value="">-- Error loading records --</option>';
  }
}
function initiateDelete() {
  const list  = document.getElementById('del-list').value;
  const id    = document.getElementById('del-item').value;
  const errEl = document.getElementById('del-error');
  errEl.style.display = 'none';
  if (!list || !id) {
    errEl.textContent = 'Please select a list and a record.';
    errEl.style.display = 'block'; return;
  }
  document.getElementById('del-confirm').style.display = 'block';
  document.getElementById('del-btn').style.display = 'none';
}
async function confirmDelete() {
  const list = document.getElementById('del-list').value;
  const id   = document.getElementById('del-item').value;
  try {
    await graphRequest('DELETE',
      `/sites/${CONFIG.SP_SITE_ID}/lists/${list}/items/${id}`);
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
// Shared remove helper used by Assignments, Leadership, Departments tabs
async function deleteAdminRecord(listName, id) {
  if (!confirm('Remove this record?')) return;
  await graphRequest('DELETE',
    `/sites/${CONFIG.SP_SITE_ID}/lists/${listName}/items/${id}`);
  await renderAdminTab(_adminTab);
}
