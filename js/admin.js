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
  const depts = (await getDepartments()).sort((a, b) => a.DepartmentName.localeCompare(b.DepartmentName));
  const rows = depts.map(d => `
    <tr>
      <td>${d.DepartmentName}</td>
      <td><div class="row-actions"><button class="btn-danger" onclick="deleteAdminRecord('Departments',${d.id})">Remove</button></div></td>
    </tr>`).join('');
  return `
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
  Projects:       { label: 'Projects' },
  Roles:          { label: 'Roles' },
  WeeklyActivity: { label: 'Weekly Activity' },
  Placements:     { label: 'Placements' },
  RejectedOffers: { label: 'Rejected Offers' },
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
    let options = [];

    if (listName === 'Projects') {
      const items = await getItems('Projects');
      options = items
        .sort((a, b) => (a.CustomerName || '').localeCompare(b.CustomerName || ''))
        .map(i => ({ id: i.id, label: i.CustomerName || `ID ${i.id}` }));

    } else if (listName === 'Roles') {
      const [items, projects] = await Promise.all([getItems('Roles'), getItems('Projects')]);
      const projMap = Object.fromEntries(projects.map(p => [String(p.id), p.CustomerName]));
      options = items
        .sort((a, b) => {
          const pa = projMap[String(a.ProjectIDLookupId)] || '';
          const pb = projMap[String(b.ProjectIDLookupId)] || '';
          const pc = pa.localeCompare(pb);
          if (pc !== 0) return pc;
          const ra = a.Location ? `${a.RoleTitle} (${a.Location})` : (a.RoleTitle || '');
          const rb = b.Location ? `${b.RoleTitle} (${b.Location})` : (b.RoleTitle || '');
          return ra.localeCompare(rb);
        })
        .map(i => {
          const proj = projMap[String(i.ProjectIDLookupId)] || '—';
          const role = i.Location ? `${i.RoleTitle} (${i.Location})` : (i.RoleTitle || `ID ${i.id}`);
          return { id: i.id, label: `${proj} — ${role}` };
        });

    } else if (listName === 'WeeklyActivity') {
      const [items, roles, projects] = await Promise.all([getItems('WeeklyActivity'), getItems('Roles'), getItems('Projects')]);
      const projMap = Object.fromEntries(projects.map(p => [String(p.id), p.CustomerName]));
      const roleMap = Object.fromEntries(roles.map(r => [String(r.id), { title: r.RoleTitle, location: r.Location, projectId: String(r.ProjectIDLookupId) }]));
      options = items
        .sort((a, b) => {
          const rid_a = String(a.RoleIDLookupId || a.RoleID || '');
          const rid_b = String(b.RoleIDLookupId || b.RoleID || '');
          const pa = projMap[roleMap[rid_a]?.projectId] || '';
          const pb = projMap[roleMap[rid_b]?.projectId] || '';
          const pc = pa.localeCompare(pb);
          if (pc !== 0) return pc;
          const wc = Number(b.WeekNumber) - Number(a.WeekNumber);
          if (wc !== 0) return wc;
          const ra = roleMap[rid_a] ? (roleMap[rid_a].location ? `${roleMap[rid_a].title} (${roleMap[rid_a].location})` : roleMap[rid_a].title) : '';
          const rb = roleMap[rid_b] ? (roleMap[rid_b].location ? `${roleMap[rid_b].title} (${roleMap[rid_b].location})` : roleMap[rid_b].title) : '';
          return ra.localeCompare(rb);
        })
        .map(i => {
          const rid = String(i.RoleIDLookupId || i.RoleID || '');
          const r = roleMap[rid];
          const proj = r ? (projMap[r.projectId] || '—') : '—';
          const role = r ? (r.location ? `${r.title} (${r.location})` : r.title) : '—';
          return { id: i.id, label: `${proj} — ${role} — Wk ${i.WeekNumber}` };
        });

    } else if (listName === 'Placements') {
      const [items, roles, projects] = await Promise.all([getItems('Placements'), getItems('Roles'), getItems('Projects')]);
      const projMap = Object.fromEntries(projects.map(p => [String(p.id), p.CustomerName]));
      const roleMap = Object.fromEntries(roles.map(r => [String(r.id), { title: r.RoleTitle, projectId: String(r.ProjectIDLookupId) }]));
      options = items
        .sort((a, b) => new Date(b.OfferAcceptedDate || 0) - new Date(a.OfferAcceptedDate || 0))
        .map(i => {
          const rid = String(i.RoleIDLookupId || i.RoleID || '');
          const r = roleMap[rid];
          const proj = r ? (projMap[r.projectId] || '—') : '—';
          const role = r ? r.title : '—';
          return { id: i.id, label: `${proj} — ${role} — ${i.CandidateName || `ID ${i.id}`}` };
        });

    } else if (listName === 'RejectedOffers') {
      const [items, roles, projects] = await Promise.all([getItems('RejectedOffers'), getItems('Roles'), getItems('Projects')]);
      const projMap = Object.fromEntries(projects.map(p => [String(p.id), p.CustomerName]));
      const roleMap = Object.fromEntries(roles.map(r => [String(r.id), { title: r.RoleTitle, projectId: String(r.ProjectIDLookupId) }]));
      options = items
        .sort((a, b) => new Date(b.RejectionDate || 0) - new Date(a.RejectionDate || 0))
        .map(i => {
          const rid = String(i.RoleIDLookupId || i.RoleID || '');
          const r = roleMap[rid];
          const proj = r ? (projMap[r.projectId] || '—') : '—';
          const role = r ? r.title : '—';
          return { id: i.id, label: `${proj} — ${role} — ${i.CandidateName || `ID ${i.id}`}` };
        });
    }

    select.innerHTML = '<option value="">-- Select record --</option>' +
      options.map(o => `<option value="${o.id}">${o.label}</option>`).join('');
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
