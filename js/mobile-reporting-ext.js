// js/mobile-reporting-ext.js - Phase D: Reporting expansion
//   #2 search/filter on roles list (mobileRenderRolesFiltered + controls)
//   #3 Log Rejection form (mobileRenderRejectionForm / mobileSubmitRejection)
//   #4 Summary view (mobileRenderReportingSummary)
//
// Reuses the existing mobileGetRoles() (scoped roles) from mobile-pages.js and
// the same data layer. Search/filter is purely client-side over already-loaded
// roles - no extra network calls.

// --- Shared cache of the current scoped roles (for filtering without refetch) ---
let _mRolesCache = null;
let _mRoleSearch = '';
let _mRoleStage  = '';

// ── #4 Summary view ───────────────────────────────────────────────────
async function mobileRenderReportingSummary(main) {
  mobileSetTitle('Reporting', 'Summary');
  main.innerHTML = '<div class="m-empty">Loading summary...</div>';

  try {
    const roles = await mobileGetRoles();   // scoped, excludes Hired/Cancelled
    _mRolesCache = roles;                    // warm the cache for the Roles tab

    const total = roles.length;

    // Open >= 45 days (alert) and >= 30 (watch)
    const withDays = roles.map(r => ({
      r,
      days: r.OpenDate ? Math.floor((Date.now() - new Date(r.OpenDate)) / 86400000) : null,
    }));
    const over45 = withDays.filter(x => x.days !== null && x.days >= 45).length;
    const over30 = withDays.filter(x => x.days !== null && x.days >= 30).length;

    // Count by stage
    const byStage = {};
    roles.forEach(r => {
      const s = r.Stage || 'Unknown';
      byStage[s] = (byStage[s] || 0) + 1;
    });
    const stageRows = STAGES
      .filter(s => byStage[s])
      .map(s => `
        <tr>
          <td class="m-sc-metric">${s}</td>
          <td class="m-sc-val" style="color:#0A0B44">${byStage[s]}</td>
        </tr>`).join('');

    main.innerHTML = `
      <div class="m-an-grid">
        ${mobileSumTile(total, 'Open Roles')}
        ${mobileSumTile(over30, 'Open 30d+', over30 ? '' : '')}
        ${mobileSumTile(over45, 'Open 45d+ (alert)')}
        ${mobileSumTile(Object.keys(byStage).length, 'Active Stages')}
      </div>
      <div class="m-detail-panel" style="margin-top:4px">
        <div class="m-section-header" style="margin-top:0">Roles by Stage</div>
        <table class="m-sc-table"><tbody>${stageRows || '<tr><td class="m-sc-metric">No open roles</td><td></td></tr>'}</tbody></table>
      </div>
    `;
    if (typeof runKpiCountUps === 'function') runKpiCountUps(main);
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error loading summary: ${e.message}</div>`;
  }
}

function mobileSumTile(value, label) {
  return `
    <div class="m-an-tile">
      <div class="m-an-tile-value kpi-value">${value}</div>
      <div class="m-an-tile-label">${label}</div>
    </div>`;
}

// ── #2 Roles list with search + stage filter ─────────────────────────
// Replaces the plain roles render. Loads (or reuses) scoped roles, shows a
// search box + stage dropdown, and renders the filtered set grouped by project.
async function mobileRenderRolesFiltered(main) {
  mobileSetTitle('Reporting', 'Roles');
  main.innerHTML = '<div class="m-empty">Loading roles...</div>';

  try {
    if (!_mRolesCache) _mRolesCache = await mobileGetRoles();
    mobileDrawRolesList(main);
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error loading roles: ${e.message}</div>`;
  }
}

function mobileDrawRolesList(main) {
  const roles = _mRolesCache || [];

  const stageOpts = '<option value="">All stages</option>' +
    STAGES.filter(s => roles.some(r => r.Stage === s))
      .map(s => `<option value="${s}" ${s === _mRoleStage ? 'selected' : ''}>${s}</option>`).join('');

  const controls = `
    <div class="m-action-row" style="margin-bottom:10px">
      <button class="m-btn-primary" onclick="mobileNav('add-role')">+ Add Role</button>
    </div>
    <div class="m-detail-panel" style="margin-bottom:12px">
      <input class="m-input" type="text" id="mrl-search" placeholder="Search role or TP..."
        value="${_mRoleSearch.replace(/"/g, '&quot;')}"
        oninput="mobileRoleSearch(this.value)">
      <div class="m-form-group" style="margin:10px 0 0">
        <select class="m-select" id="mrl-stage" onchange="mobileRoleStageFilter(this.value)">
          ${stageOpts}
        </select>
      </div>
    </div>`;

  // Apply filters
  const q = _mRoleSearch.trim().toLowerCase();
  let filtered = roles;
  if (q) filtered = filtered.filter(r =>
    (r.RoleTitle || '').toLowerCase().includes(q) ||
    (r.TalentPartner || '').toLowerCase().includes(q));
  if (_mRoleStage) filtered = filtered.filter(r => r.Stage === _mRoleStage);

  let listHtml;
  if (!filtered.length) {
    listHtml = '<div class="m-empty">No roles match your filters.</div>';
  } else {
    const byProject = {};
    filtered.forEach(r => {
      const key = r.CustomerName || r.ProjectID || 'Unknown Project';
      (byProject[key] = byProject[key] || []).push(r);
    });
    listHtml = '';
    for (const [project, projectRoles] of Object.entries(byProject)) {
      listHtml += `<div class="m-section-header">${project}</div>`;
      listHtml += projectRoles.map(r => {
        const days = r.OpenDate
          ? Math.floor((Date.now() - new Date(r.OpenDate)) / 86400000) : null;
        const daysClass = days === null ? '' : days >= 45 ? 'alert' : days >= 30 ? 'warn' : '';
        const daysLabel = days !== null ? `${days}d open` : '';
        return `
          <div class="m-role-card" onclick="mobileSelectRole(${r.id})">
            <div class="m-role-title">${r.RoleTitle}</div>
            <div class="m-role-meta">${tpList(role.TalentPartner).join(', ') || '—'}</div>
            <div class="m-role-footer">
              <span class="m-stage-badge">${r.Stage || '-'}</span>
              ${daysLabel ? `<span class="m-days-open ${daysClass}">${daysLabel}</span>` : ''}
            </div>
          </div>`;
      }).join('');
    }
  }

  main.innerHTML = controls + `<div id="mrl-list">${listHtml}</div>`;
}

function mobileRoleSearch(val) {
  _mRoleSearch = val;
  // Re-render only the list portion to keep input focus.
  mobileRedrawRolesListOnly();
}
function mobileRoleStageFilter(val) {
  _mRoleStage = val;
  mobileRedrawRolesListOnly();
}

// Re-render just the #mrl-list node so the search box keeps focus while typing.
function mobileRedrawRolesListOnly() {
  const listEl = document.getElementById('mrl-list');
  if (!listEl) return;
  const roles = _mRolesCache || [];
  const q = _mRoleSearch.trim().toLowerCase();
  let filtered = roles;
  if (q) filtered = filtered.filter(r =>
    (r.RoleTitle || '').toLowerCase().includes(q) ||
    (r.TalentPartner || '').toLowerCase().includes(q));
  if (_mRoleStage) filtered = filtered.filter(r => r.Stage === _mRoleStage);

  if (!filtered.length) {
    listEl.innerHTML = '<div class="m-empty">No roles match your filters.</div>';
    return;
  }
  const byProject = {};
  filtered.forEach(r => {
    const key = r.CustomerName || r.ProjectID || 'Unknown Project';
    (byProject[key] = byProject[key] || []).push(r);
  });
  let html = '';
  for (const [project, projectRoles] of Object.entries(byProject)) {
    html += `<div class="m-section-header">${project}</div>`;
    html += projectRoles.map(r => {
      const days = r.OpenDate
        ? Math.floor((Date.now() - new Date(r.OpenDate)) / 86400000) : null;
      const daysClass = days === null ? '' : days >= 45 ? 'alert' : days >= 30 ? 'warn' : '';
      const daysLabel = days !== null ? `${days}d open` : '';
      return `
        <div class="m-role-card" onclick="mobileSelectRole(${r.id})">
          <div class="m-role-title">${r.RoleTitle}</div>
          <div class="m-role-meta">${tpList(role.TalentPartner).join(', ') || '—'}</div>
          <div class="m-role-footer">
            <span class="m-stage-badge">${r.Stage || '-'}</span>
            ${daysLabel ? `<span class="m-days-open ${daysClass}">${daysLabel}</span>` : ''}
          </div>
        </div>`;
    }).join('');
  }
  listEl.innerHTML = html;
}

// Call this after Add Role / Stage changes so the cache refreshes next view.
function mobileInvalidateRolesCache() { _mRolesCache = null; }

// ── #3 Log Rejection form ─────────────────────────────────────────────
const M_REJECT_REASONS = ['Salary','Motivations','Counter-offer','Took another opportunity','Other'];

async function mobileRenderRejectionForm(main, rolePreselected) {
  main.innerHTML = '<div class="m-empty">Loading...</div>';
  try {
    const user = getCurrentUser();
    let roleName = '';
    let roleOpts = '';

    if (rolePreselected && _mobileRoleId) {
      const role = await getItem('Roles', _mobileRoleId);
      roleName = role.RoleTitle;
      mobileSetTitle('Log Rejection', roleName);
    } else {
      _mobileRoleId = null;
      mobileSetTitle('Log Rejection', 'Rejected Offer');
      // Build role options from the scoped roles (reuse cache or fetch).
      const roles = _mRolesCache || await mobileGetRoles();
      roleOpts = '<option value="">- select role -</option>' +
        [...roles].sort((a, b) => (a.RoleTitle || '').localeCompare(b.RoleTitle || ''))
          .map(r => `<option value="${r.id}">${r.RoleTitle}${r.CustomerName ? ' - ' + r.CustomerName : ''}</option>`).join('');
    }

    const reasonOpts = '<option value="">- select reason -</option>' +
      M_REJECT_REASONS.map(r => `<option value="${r}">${r}</option>`).join('');

    main.innerHTML = `
      <div class="m-detail-panel">
        ${rolePreselected && _mobileRoleId ? `
          <div class="m-form-group">
            <div class="m-label">Role</div>
            <input class="m-input" readonly value="${roleName}">
            <input type="hidden" id="mrj-role-id" value="${_mobileRoleId}">
          </div>` : `
          <div class="m-form-group">
            <label class="m-label">Role *</label>
            <select class="m-select" id="mrj-role">${roleOpts}</select>
          </div>`}

        <div class="m-form-group">
          <label class="m-label">Candidate Name *</label>
          <input class="m-input" type="text" id="mrj-candidate" placeholder="Full name">
        </div>
        <div class="m-input-row">
          <div class="m-form-group">
            <label class="m-label">Salary Offered</label>
            <input class="m-input" type="text" id="mrj-salary" placeholder="e.g. 65000">
          </div>
          <div class="m-form-group">
            <label class="m-label">Reason *</label>
            <select class="m-select" id="mrj-reason">${reasonOpts}</select>
          </div>
        </div>
        <div class="m-form-group">
          <label class="m-label">Notes</label>
          <input class="m-input" type="text" id="mrj-notes">
        </div>
        <div class="m-form-error" id="mrj-error"></div>
      </div>
      <div class="m-action-row">
        <button class="m-btn-primary" id="mrj-submit" onclick="mobileSubmitRejection(${rolePreselected})">
          Log Rejection
        </button>
      </div>
    `;
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error: ${e.message}</div>`;
  }
}

async function mobileSubmitRejection(rolePreselected) {
  const btn   = document.getElementById('mrj-submit');
  const errEl = document.getElementById('mrj-error');
  errEl.style.display = 'none';
  const fail = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };

  const roleId = rolePreselected
    ? parseInt(document.getElementById('mrj-role-id').value)
    : parseInt(document.getElementById('mrj-role')?.value);
  const candidate = document.getElementById('mrj-candidate').value.trim();
  const reason    = document.getElementById('mrj-reason').value;
  const salary    = document.getElementById('mrj-salary').value.trim();
  const notes     = document.getElementById('mrj-notes').value.trim();

  if (!roleId)    return fail('Please select a role.');
  if (!candidate) return fail('Please enter a candidate name.');
  if (!reason)    return fail('Please select a rejection reason.');

  btn.disabled = true; btn.textContent = 'Saving...';

  // IDENTICAL payload to desktop submitRejectedForm.
  const fields = {
    RoleIDLookupId:  roleId,
    Title:           candidate,
    SalaryOffered:   salary || undefined,
    RejectionReason: reason,
    Notes:           notes || undefined,
  };

  try {
    await createItem('RejectedOffers', fields);
    mobileToast('Rejection logged ✓');
    if (rolePreselected) mobileNav('role-detail', false);
    else mobileNav('summary', false);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Log Rejection';
    fail('Error: ' + e.message);
  }
}
