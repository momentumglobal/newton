// js/admin.js — Reporting Config Panel (Functional Areas + Delete Records)
let _adminTab = 'departments';

async function renderAdminPage() {
  const main = document.getElementById('main-content');
  const user = getCurrentUser();
  const role = getUserRole(user.email);
  if (role !== 'admin') {
    main.innerHTML = '<p>Access denied.</p>';
    return;
  }
  main.innerHTML = '<p>Loading...</p>';
  await renderAdminTab(_adminTab);
}

async function renderAdminTab(tab) {
  _adminTab = tab;
  const main = document.getElementById('main-content');
  const tabs = ['departments', 'delete'];
  const labels = { departments: 'Functional Areas', delete: 'Delete Records' };
  const tooltips = {
    departments: 'Manage the list of functional areas used when categorising roles across the system.',
    delete:      'Permanently delete records from the system. Use with caution — this action cannot be undone.',
  };
  const tabBar = tabs.map(t =>
    `<button class="btn-filter${_adminTab === t ? ' active' : ''}"
      onclick="renderAdminTab('${t}')">${labels[t]}<span class="help-tip">?<span class="help-tip-text">${tooltips[t]}</span></span></button>`
  ).join('');

  let content = '';
  if (tab === 'departments') content = await buildDepartmentsTab();
  if (tab === 'delete')      content = await buildDeleteTab();

  main.innerHTML = `
    <div class="page-header">
      <h2>Config Panel</h2>
      <div class="filter-group">${tabBar}</div>
    </div>
    <div style="padding:24px">${content}</div>
  `;
}

// ── Functional Areas Tab ───────────────────────────────────────────────
async function buildDepartmentsTab() {
  const depts = await getDepartments();
  const rows = depts.map(d => `
    <tr>
      <td>${d.DepartmentName}</td>
      <td><div class="row-actions"><button class="btn-danger" onclick="deleteAdminRecord('Departments',${d.id})">Remove</button></div></td>
    </tr>`).join('');
  return `
    <h3>Functional Area Options</h3>
    <table class="data-table" style="margin:0 0 24px">
      <thead><tr><th>Functional Area</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan=2>No functional areas defined yet.</td></tr>'}</tbody>
    </table>
    <h3>Add Functional Area</h3>
    <div class="form-container" style="padding:0;max-width:500px">
      <div class="form-group">
        <label>Functional Area Name *</label>
        <input type="text" id="dept-name" placeholder="e.g. Software Engineering">
      </div>
      <div id="dept-error" class="form-error"></div>
      <button class="btn-primary" onclick="submitDepartment()">Add Functional Area</button>
    </div>
  `;
}

async function submitDepartment() {
  const name  = document.getElementById('dept-name').value.trim();
  const errEl = document.getElementById('dept-error');
  errEl.style.display = 'none';
  if (!name) {
    errEl.textContent = 'Functional area name is required.';
    errEl.style.display = 'block'; return;
  }
  const btn = document.querySelector('.btn-primary[onclick="submitDepartment()"]');
  setButtonLoading(btn);
  try {
    await createItem('Departments', { Title: name });
    await renderAdminTab('departments');
  } catch(e) {
    clearButtonLoading(btn);
    errEl.textContent = `Error: ${e.message}`; errEl.style.display = 'block';
  }
}

// ── Currencies Tab ───────────────────────────────────────────────────
async function buildCurrenciesTab() {
  const currencies = await getCurrencies();
  const rows = currencies.map(c => `
    <tr>
      <td>${c.CurrencyCode}</td>
      <td><div class="row-actions"><button class="btn-danger" onclick="deleteAdminRecord('Currencies',${c.id})">Remove</button></div></td>
    </tr>`).join('');
  return `
    <h3>Currency Options</h3>
    <p style="font-size:13px;color:#666;margin-bottom:16px">
      These currencies are available when creating roles and are inherited by placements.
    </p>
    <table class="data-table" style="margin:0 0 24px">
      <thead><tr><th>Currency Code</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan=2>No currencies defined yet.</td></tr>'}</tbody>
    </table>
    <h3>Add Currency</h3>
    <div class="form-container" style="padding:0;max-width:300px">
      <div class="form-group">
        <label>Currency Code *</label>
        <input type="text" id="currency-code" placeholder="e.g. GBP" maxlength="5" style="text-transform:uppercase">
      </div>
      <div id="currency-error" class="form-error"></div>
      <button class="btn-primary" onclick="submitCurrency()">Add Currency</button>
    </div>
  `;
}

async function submitCurrency() {
  const code  = document.getElementById('currency-code').value.trim().toUpperCase();
  const errEl = document.getElementById('currency-error');
  errEl.style.display = 'none';
  if (!code) {
    errEl.textContent = 'Currency code is required.';
    errEl.style.display = 'block'; return;
  }
  const btn = document.querySelector('.btn-primary[onclick="submitCurrency()"]');
  setButtonLoading(btn);
  try {
    await createItem('Currencies', { Title: code });
    await renderAdminTab('currencies');
  } catch(e) {
    clearButtonLoading(btn);
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
  Departments:     { label: 'Functional Areas',   displayField: 'DepartmentName' },
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
  const list  = document.getElementById('del-list').value;
  const id    = document.getElementById('del-item').value;
  const errEl = document.getElementById('del-error');
  errEl.style.display = 'none';
  if (!list || !id) { errEl.textContent = 'Please select a list and a record.'; errEl.style.display = 'block'; return; }
  document.getElementById('del-confirm').style.display = 'block';
  document.getElementById('del-btn').style.display = 'none';
}

async function confirmDelete() {
  const list   = document.getElementById('del-list').value;
  const id     = document.getElementById('del-item').value;
  const yesBtn = document.querySelector('#del-confirm .btn-primary');
  setButtonLoading(yesBtn, 'Deleting…');
  try {
    await graphRequest('DELETE', `/sites/${CONFIG.SP_SITE_ID}/lists/${list}/items/${id}`);
    await renderAdminTab('delete');
  } catch(e) {
    clearButtonLoading(yesBtn);
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
