// js/os-admin.js — Newton OS Admin (User Assignments + Leadership Access)
let _osAdminTab = 'assignments';
let _showInactiveAssignments = false;
async function renderOsAdminPage(tab = 'assignments') {
  _osAdminTab = tab;
  const main = document.getElementById('main-content');
const tabs = ['assignments', 'leadership', 'homepage', 'ghost', 'datahealth'];
const labels = { assignments: 'User Assignments', leadership: 'Leadership Access', homepage: 'Homepage', ghost: 'Ghost Mode', datahealth: 'Data Health' };
const tooltips = {
  assignments: 'Manage user roles and project access. Users are auto-registered on first login — assign their role and projects here.',
  leadership:  'Grant Leadership-level access to users who should see the Company Dashboard without full system access.',
  homepage:    'Manage homepage appearance and seasonal effects.',
  ghost:       'Temporarily view Newton as a specific real user for testing or investigating a bug. Only visible to admins.',
  datahealth:  'Row counts per list and index status on the columns N-093 is about to filter server-side.',
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
// ── Assignments Tab ──────────────────────────────────────────────────
async function buildAssignmentsTab(editId = null) {
  const [projects, assignments] = await Promise.all([
    getProjects(false), getUserAssignments()
  ]);
  const visibleAssignments = _showInactiveAssignments
    ? assignments
    : assignments.filter(a => a.Active !== false);
  const projectOptions = projects
    .slice()
    .sort((a, b) => a.CustomerName.localeCompare(b.CustomerName))
    .map(p =>
      `<option value="${p.id}|${escAttr(p.CustomerName)}">${escHtml(p.CustomerName)}</option>`
    ).join('');
  let editRecord = null;
  if (editId) editRecord = assignments.find(a => String(a.id) === String(editId));
const rows = [...visibleAssignments].sort((a, b) => (a.UserName || '').localeCompare(b.UserName || '')).map(a => {
    const isActive = a.Active !== false;
    return `
    <tr id="assign-row-${a.id}" style="${isActive ? '' : 'opacity:0.55'}">
      <td>${escHtml(a.UserName || '—')}${isActive ? '' : ' <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--border-subtle);color:var(--text-label);">Inactive</span>'}</td>
      <td>${escHtml(a.UserEmail)}</td>
      <td>${escHtml(a.CustomerName || '—')}</td>
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
          <input type="text" id="assign-name" value="${escAttr(editRecord.UserName || '')}">
        </div>
        <div class="form-group">
          <label>User Email *</label>
          <input type="email" id="assign-email" value="${escAttr(editRecord.UserEmail || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Customer</label>
          <select id="assign-project">
            <option value="">-- Select customer --</option>
            ${projects.map(p => `
              <option value="${p.id}|${escAttr(p.CustomerName)}" ${String(p.id) === String(editRecord.ProjectID) ? 'selected' : ''}>
                ${escHtml(p.CustomerName)}
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
    <div style="margin-bottom:12px">
      <label style="font-size:13px;cursor:pointer">
        <input type="checkbox" ${_showInactiveAssignments ? 'checked' : ''}
          onchange="_toggleShowInactiveAssignments(this.checked)"
          style="margin-right:6px">
        Show inactive assignments
      </label>
    </div>
    <table class="data-table" style="margin:0 0 24px">
      <thead><tr><th>Name</th><th>Email</th><th>Customer</th><th>Role</th><th>Last Login</th><th></th></tr></thead>
      <tbody>${rows || emptyStateRow({ colspan: 6, icon: 'users', message: 'No assignments yet.' })}</tbody>
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

async function _toggleShowInactiveAssignments(checked) {
  _showInactiveAssignments = checked;
  renderOsAdminPage('assignments');
}

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
          <input type="file" id="lead-photofile-${l.id}" accept="image/*">
          <button class="btn-secondary" onclick="uploadLeadershipPhoto(${l.id})">Upload photo</button>
          <button class="btn-danger" onclick="deleteOsAdminRecord('LeadershipAccess',${l.id})">Remove</button>
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
  if (!file) { toast('Choose an image first.', { type: 'error' }); return; }
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
  if (!(await confirmModal({ message: 'Remove this record?', confirmLabel: 'Remove', danger: true }))) return;
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
                padding:16px 0;border-bottom:1px solid var(--border-subtle)">
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--brand)">${e.label}</div>
        <div style="font-size:13px;color:var(--text-label);margin-top:2px">${e.desc}</div>
      </div>
      <button class="btn-${active === e.key ? 'primary' : 'secondary'}"
        onclick="setFx('${active === e.key ? 'none' : e.key}')" style="min-width:80px">
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
        <button class="btn-primary" onclick="submitAnnouncement()">Save</button>
        <button class="btn-secondary" onclick="clearAnnouncement()">Clear Banner</button>
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
  const btn    = document.querySelector('.btn-primary[onclick="submitAnnouncement()"]');
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
    <button class="btn-primary" style="margin-top:16px"
      onclick="activateGhostUser()">
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
        <button class="btn-danger" style="margin-top:12px"
          onclick="deactivateGhost()">Exit Ghost Mode</button>` : ''}
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
  setGhostUser(email, opt?.dataset.name || email);
  window.location.href = 'reporting.html';
}

function deactivateGhost() {
  clearGhostUser();
  window.location.reload();
}
// ── Data Health Tab (F-10 / N-092) ───────────────────────────────────
async function buildDataHealthTab() {
  // N-154 (F-10b): every registered list, not just the ones with a
  // LIST_FIELDS projection entry. See getMonitoredLists().
  const lists = getMonitoredLists();
  const counts = await Promise.all(lists.map(l => getListItemCount(l).catch(e => {
    console.warn('Data Health: row count failed for list "' + l + '"', e);
    return null;  // one broken list must not take out the whole tab
  })));
  const excludedLists = CONFIG.DATA_HEALTH_EXCLUDED_LISTS || [];
  const countRows = lists.map((l, i) => {
    const count = counts[i];
    const warn = count !== null && count >= CONFIG.LIST_ROW_COUNT_WARNING_THRESHOLD;
    return `
    <tr>
      <td>${escHtml(l)}</td>
      <td>${count === null ? '<span class="dh-muted">—</span>' : count.toLocaleString('en-GB')}</td>
      <td>${warn ? '<span class="dh-badge dh-badge-warn">Amber</span>' : ''}</td>
    </tr>`;
  }).join('');

  const { ok: nullProjectOk, count: nullProjectCount } = await getWeeklyActivityNullProjectCount();
  const { ok: nullWeekEndingOk, count: nullWeekEndingCount } = await getWeeklyActivityNullWeekEndingCount();

  const targetLists = [...new Set(CONFIG.INDEX_TARGETS.map(t => t.list))];
  const statusByList = {};
  await Promise.all(targetLists.map(async l => {
    const names = CONFIG.INDEX_TARGETS.filter(t => t.list === l).map(t => t.column);
    statusByList[l] = await getColumnIndexStatus(l, names).catch(() => []);
  }));
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
      <td>${(indexed || !status)
            ? ''
            : `<button class="btn-secondary" onclick="indexColumnNow('${t.list}','${escJsAttr(status.id)}')">Index now</button>`}</td>
    </tr>`;
  }).join('');

  // N-174 (F-11a): schema contract check. One row per list registered in
  // FIELD_ALIASES; getSchemaDiffs() already tolerates a single list's
  // failure, so no extra .catch() batching is needed here.
  const schemaResults = await getSchemaDiffs();
  const schemaRows = schemaResults.map(r => {
    let statusCell;
    let detailCell;
    if (!r.checked) {
      statusCell = '<span class="dh-muted">—</span>';
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
      <td><button class="btn-secondary" onclick="acknowledgeDiagnosticsGroup('${escJsAttr(g.ids.join(','))}')">Acknowledge</button></td>
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
      browser console names which.
    </p>
    <table class="data-table dh-table">
      <thead><tr><th>List</th><th>Row count</th><th></th></tr></thead>
      <tbody>${countRows || emptyStateRow({ colspan: 3, icon: 'database', message: 'No lists configured.' })}</tbody>
    </table>
    <h3>Data Integrity</h3>
    <p class="dh-note">
      WeeklyActivity.ProjectID is written by the activity form but read by no
      page — every view maps activity to its project through the role instead.
      The Project Dashboard nonetheless filters on it server-side, so any row
      missing a value is being dropped from that view silently. This must read
      zero. A "Query error" badge means the check itself failed — unknown,
      not zero — see the browser console for the underlying error.
    </p>
    <table class="data-table dh-table">
      <thead><tr><th>Check</th><th>Rows</th><th></th></tr></thead>
      <tbody>
        <tr>
          <td>WeeklyActivity rows missing ProjectID</td>
          <td>${nullProjectOk ? nullProjectCount.toLocaleString('en-GB') : '<span class="dh-badge dh-badge-danger">Query error</span>'}</td>
          <td>${nullProjectOk && nullProjectCount ? '<span class="dh-badge dh-badge-warn">Amber</span>' : ''}</td>
        </tr>
        <tr>
          <td>WeeklyActivity rows missing WeekEndingDate</td>
          <td>${nullWeekEndingOk ? nullWeekEndingCount.toLocaleString('en-GB') : '<span class="dh-badge dh-badge-danger">Query error</span>'}</td>
          <td>${nullWeekEndingOk && nullWeekEndingCount ? '<span class="dh-badge dh-badge-warn">Amber</span>' : ''}</td>
        </tr>
      </tbody>
    </table>
    <h3>Index Status</h3>
    <p class="dh-note">
      Columns Newton filters on server-side (N-093). Indexing is a one-time
      SharePoint schema change — confirm before applying.
    </p>
    <table class="data-table dh-table-tight">
      <thead><tr><th>List</th><th>Column</th><th>Status</th><th></th></tr></thead>
      <tbody>${indexRows || emptyStateRow({ colspan: 4, icon: 'database', message: 'No index targets configured.' })}</tbody>
    </table>
    <h3>Schema Check</h3>
    <p class="dh-note">
      Every list registered in FIELD_ALIASES, diffed against what Newton
      expects to read (CONFIG.LIST_FIELDS for a projected list, otherwise
      just its aliased columns). Missing means an expected column is gone;
      Unexpected means a real column exists that no projection knows about
      — a rename usually shows up as both at once, on the same list. Lists
      with nothing registered to check show "No columns registered" rather
      than a false pass.
    </p>
    <table class="data-table dh-table">
      <thead><tr><th>List</th><th>Checked columns</th><th>Detail</th><th>Status</th></tr></thead>
      <tbody>${schemaRows || emptyStateRow({ colspan: 4, icon: 'database', message: 'No lists registered.' })}</tbody>
    </table>
    <h3>Error Telemetry</h3>
    <p class="dh-note">
      Uncaught errors and unhandled promise rejections from any Newton screen
      (N-172), grouped by message. Acknowledging a group clears it from this
      view — the underlying Diagnostics rows are never deleted.
    </p>
    <table class="data-table dh-table">
      <thead><tr><th>Message</th><th>Module</th><th>Occurrences</th><th>Users</th><th>Last seen</th><th></th></tr></thead>
      <tbody>${diagTableRows || emptyStateRow({ colspan: 6, icon: 'bug', message: 'No unacknowledged errors.' })}</tbody>
    </table>
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

async function indexColumnNow(listName, columnId) {
  // N-106: capture the button BEFORE awaiting the modal. The implicit global
  // `event` is only populated during synchronous dispatch, so reading it after
  // an await would yield undefined and silently break the loading state.
  const btn = event?.target;
  if (!(await confirmModal({
    message: `Index this column on ${listName}? This changes the SharePoint schema and cannot be undone from here.`,
    confirmLabel: 'Index column',
  }))) return;
  setButtonLoading(btn);
  try {
    await setColumnIndexed(listName, columnId);
    await renderOsAdminPage('datahealth');
  } catch (e) {
    clearButtonLoading(btn);
    toast('Error indexing column: ' + e.message, { type: 'error' });
  }
}
