// js/report-builder.js

let _rbBlocks     = [];   // Array of block objects (panel or text)
let _rbScope      = 'project';  // 'project' | 'company'
let _rbProjectId  = null;
let _rbRoleId     = 'all';  // 'all' | role id — Project-scope role filter
let _rbPeriod     = 'this_quarter';
let _rbKpiPeriod  = 'quarter';
let _rbReportId   = null;  // SharePoint item ID if editing a saved report
let _rbReportData = null;  // Cached fetch result { roles, activity, placements, rejections }
let _rbTitle      = '';
let _rbIncludeGantt = false;  // append Hiring Plan as landscape final page (CoE projects)
let _rbProjectRoles = [];  // Roles for the selected project (drives Role dropdown)
let _rbLiveRoles = [];  // Live roles for the current project/role filter — drives the Snapshot editor
const SNAP_FIELDS = [   // Candidate Pipeline Snapshot columns: [valueKey, header]
  ['hmReview', 'HM Review'],
  ['iv1',      'IV1'],
  ['iv2plus',  'IV2+'],
  ['finalIv',  'Final IV'],
  ['offer',    'Offer'],
];

const RB_PALETTE = [
  // Overview — no subheading; tiles sit directly under "Add Modules"
  { key: 'kpiStrip',         label: 'KPI Strip',                  scope: 'both',    group: 'Overview', filtered: true },
  { key: 'roleTracker',      label: 'Role Tracker',               scope: 'project', group: 'Overview' },
  { key: 'rolesOpen30',      label: 'Roles Open 30+ Days',        scope: 'both',    group: 'Overview' },
  // Pipeline
  { key: 'pipelineActivity', label: 'Pipeline Activity',          scope: 'project', group: 'Pipeline', filtered: true },
  { key: 'activityByTP',     label: 'Activity by Talent Partner', scope: 'both',    group: 'Pipeline', filtered: true },
  { key: 'pipelineSummary',  label: 'Pipeline Summary (last 4 weeks)', scope: 'both', group: 'Pipeline' },
  { key: 'candidateSnapshot', label: 'Candidate Pipeline Snapshot',    scope: 'project', group: 'Pipeline' },
  // Placements & Rejections
  { key: 'placements',       label: 'Placements',                 scope: 'both',    group: 'Placements & Rejections', filtered: true },
  { key: 'spendVsBudget',    label: 'Actual Spend vs Budget',     scope: 'both',    group: 'Placements & Rejections' },
  { key: 'upcomingStarters', label: 'Upcoming Starters',          scope: 'both',    group: 'Placements & Rejections' },
  { key: 'rejections',       label: 'Offer Rejection Reasons',    scope: 'both',    group: 'Placements & Rejections', filtered: true },
];

async function renderReportBuilder() {
  const main  = document.getElementById('main-content');
  const role  = _resolvedRole;
  const user  = getCurrentUser();

  // Load projects for the project selector
  const projects = await getScopedProjects(user.email, false);
  if (projects.length && !_rbProjectId) _rbProjectId = String(projects[0].id);

  // Load roles for the selected project (drives the Role filter dropdown).
  // Only needed in Project scope. Talent Partners are scoped to their own roles.
  if (_rbScope === 'project' && _rbProjectId) {
    const tpEmail = _resolvedRole === 'talent_partner' ? user.email : null;
    _rbProjectRoles = await getRolesForProject(_rbProjectId, tpEmail);
    // Reset the role filter if the selected role isn't in this project.
    if (_rbRoleId !== 'all' && !_rbProjectRoles.some(r => String(r.id) === String(_rbRoleId))) {
      _rbRoleId = 'all';
    }
  } else {
    _rbProjectRoles = [];
  }

  // Live roles for the Candidate Pipeline Snapshot editor — excluded stages
  // removed, respecting the single-role filter. Mirrors what the output uses.
  const RB_EXCLUDED_STAGES = ['Backlog','Hired','Cancelled','On-hold'];
  _rbLiveRoles = _rbProjectRoles
    .filter(r => !RB_EXCLUDED_STAGES.includes(r.Stage))
    .filter(r => _rbRoleId === 'all' || String(r.id) === String(_rbRoleId))
    .map(r => ({ id: r.id, label: r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle }));

  // Load saved reports from SharePoint
  const saved = await getSavedReports();

  main.innerHTML = `
    <div class="page-header">
      <h2>Report Builder</h2>
      <div class="page-header-actions">
        ${(_rbScope === 'project' && projects.find(p => String(p.id) === _rbProjectId)?.ProjectType === 'CoE') ? `
        <label class="rb-gantt-toggle">
          <input type="checkbox" ${_rbIncludeGantt ? 'checked' : ''}
            onchange="_rbIncludeGantt = this.checked">
          Hiring Plan final page
        </label>` : ''}
        <button class="btn-secondary" onclick="rbOpenSavedModal()">Saved Reports</button>
        <button class="btn-secondary" id="rb-save-btn" onclick="rbSaveReport()">Save</button>
        <button class="btn-secondary" onclick="rbPreview()">Preview</button>
        <button class="print-btn"     onclick="rbExportPdf()">&#8856; Export PDF</button>
      </div>
    </div>
    <div class="rb-shell">
      <div class="rb-sidebar" id="rb-sidebar">${rbRenderSidebar(projects)}</div>
      <div class="rb-canvas"  id="rb-canvas">${rbRenderCanvas()}</div>
    </div>
    <div id="rb-preview-modal" class="rb-modal" style="display:none"></div>
    <div id="rb-saved-modal"   class="rb-modal" style="display:none"></div>
  `;

  rbInitSortable();
}

function rbRenderSidebar(projects) {
  const projectOpts = projects.map(p =>
    `<option value="${p.id}" ${String(p.id) === _rbProjectId ? 'selected' : ''}>
      ${p.CustomerName}</option>`).join('');

  // Role options for the selected project, with an "All Roles" default.
  const roleOpts = ['<option value="all"' + (_rbRoleId === 'all' ? ' selected' : '') + '>All Roles</option>']
    .concat(_rbProjectRoles.map(r => {
      const label = r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle;
      return `<option value="${r.id}" ${String(r.id) === String(_rbRoleId) ? 'selected' : ''}>${label}</option>`;
    })).join('');

  const periodOpts = DETAIL_PERIOD_OPTIONS.map(([k, l]) =>
    `<option value="${k}" ${_rbPeriod === k ? 'selected' : ''}>${l}</option>`).join('');

  const kpiOpts = [['month','Month'],['quarter','Quarter'],['year','Year']]
    .map(([k,l]) => `<option value="${k}" ${_rbKpiPeriod===k ? 'selected' : ''}>${l}</option>`).join('');

  // Palette tiles — scope-filtered, grouped under subheadings.
  // Group order follows first appearance in RB_PALETTE. Empty groups are skipped.
  const tileHtml = m => `<div class="rb-palette-tile" data-key="${m.key}" draggable="false"
      ondblclick="rbAddPanelBlock('${m.key}')"><span>${m.label}${m.filtered ? '<span class="rb-filter-mark">*</span>' : ''}</span><button class="rb-add-btn" onclick="rbAddPanelBlock('${m.key}')">+</button>
    </div>`;

  const groupOrder = [...new Set(RB_PALETTE.map(m => m.group))];
  const paletteTiles = groupOrder.map(group => {
    const tiles = RB_PALETTE
      .filter(m => m.group === group && (m.scope === 'both' || m.scope === _rbScope))
      .map(tileHtml).join('');
    if (!tiles) return '';  // hide empty group (e.g. Pipeline in Company scope)
    return `<div class="rb-subheading">${group}</div>` + tiles;
  }).join('');

  return `
    <div class="rb-sidebar-scroll">
    <div class="rb-config">
      <div class="rb-section-label">Report Title</div>
      <input id="rb-title" class="rb-input" type="text" placeholder="Untitled Report"
        value="${_rbTitle || ''}" oninput="_rbTitle = this.value">

      <div class="rb-section-label">Scope</div>
      <div class="filter-group">
        <button class="btn-filter ${_rbScope==='project'?'active':''}"
          onclick="rbSetScope('project')">Project</button>
        ${_resolvedRole === 'talent_partner' ? '' : `<button class="btn-filter ${_rbScope==='company'?'active':''}"
          onclick="rbSetScope('company')">Company</button>`}
      </div>

      ${_rbScope === 'project' ? '<div class="rb-section-label">Project</div><select class="rb-select" onchange="rbSetProject(this.value)">' + projectOpts + '</select>' : ''}

      ${_rbScope === 'project' ? '<div class="rb-section-label">Role</div><select class="rb-select" onchange="rbSetRole(this.value)">' + roleOpts + '</select>' : ''}

      <div class="rb-section-label">Period</div>
      <select class="rb-select" onchange="_rbPeriod = this.value">${periodOpts}</select>

      <div class="rb-section-label">KPI Period</div>
      <select class="rb-select" onchange="_rbKpiPeriod = this.value">${kpiOpts}</select>
    </div>

    <div class="rb-section-label" style="margin-top:16px">Add Modules</div>
    <div class="rb-palette" id="rb-palette">${paletteTiles}</div>
    </div>

    <div class="rb-sidebar-footer">
      <div class="rb-section-label">Add Text Block</div>
      <button class="btn-secondary rb-full-btn" onclick="rbAddTextBlock()">+ Text Block</button>
      <p class="rb-footnote"><span class="rb-filter-mark">*</span> Controlled by the Period / KPI Period filter above. Unmarked modules show all available data.</p>
    </div>
  `;
}

function rbRenderCanvas() {
  if (!_rbBlocks.length) {
    return `<div class="rb-empty">
      Add modules from the panel on the left to build your report.
    </div>`;
  }
  const items = _rbBlocks.map((block, i) => {
    if (block.type === 'panel') {
      if (block.key === 'candidateSnapshot') return rbRenderSnapshotBlock(block, i);
      const meta = RB_PALETTE.find(p => p.key === block.key) || { label: block.key };
      return `<div class="rb-block rb-block-panel" data-index="${i}" data-id="${block.id}">
        <span class="rb-drag-handle">&#9776;</span>
        <span class="rb-block-label">${meta.label}</span>
        <button class="rb-remove-btn" onclick="rbRemoveBlock('${block.id}')">&#x2715;</button>
      </div>`;
    } else {
      return `<div class="rb-block rb-block-text" data-index="${i}" data-id="${block.id}">
        <span class="rb-drag-handle">&#9776;</span>
        <div class="rb-rt-wrapper">
          <div class="rb-rt-toolbar">
            <button type="button" onclick="rbFormat('bold')"><b>B</b></button>
            <button type="button" onclick="rbFormat('italic')"><i>I</i></button>
            <button type="button" onclick="rbFormat('underline')"><u>U</u></button>
            <button type="button" onclick="rbFormat('insertUnorderedList')">&#8226; List</button>
            <button type="button" onclick="rbFormat('insertOrderedList')">1. List</button>
            <button type="button" onclick="rbFormatBlock('H3')">Heading</button>
            <button type="button" onclick="rbFormatBlock('P')">Body Text</button>
          </div>
          <div class="rb-richtext" contenteditable="true" data-id="${block.id}"
            oninput="rbUpdateTextBlock('${block.id}', this.innerHTML)"
            onkeyup="rbUpdateToolbarState()"
            onmouseup="rbUpdateToolbarState()">${block.content || ''}</div>
        </div>
        <button class="rb-remove-btn" onclick="rbRemoveBlock('${block.id}')">&#x2715;</button>
      </div>`;
    }
  }).join('');

  return `<div id="rb-sortable">${items}</div>`;
}

// ── Candidate Pipeline Snapshot (input module) ────────────────────────
// A manual-entry table: one row per live role, user types candidate counts
// per stage. Values are stored on the block (block.values, keyed by role id)
// and persist with the saved report. Empty rows are hidden in the output.
function rbRenderSnapshotBlock(block, i) {
  const values = block.values || {};
  const head = `<tr><th>Role</th>${SNAP_FIELDS.map(([, l]) => `<th>${l}</th>`).join('')}</tr>`;
  const bodyRows = _rbLiveRoles.map(r => {
    const rid = String(r.id);
    const v = values[rid] || {};
    const cells = SNAP_FIELDS.map(([f]) =>
      `<td><input type="number" min="0" class="rb-snap-input" value="${v[f] ?? ''}"
        oninput="rbUpdateSnapshotValue('${block.id}','${rid}','${f}',this.value)"></td>`
    ).join('');
    return `<tr><td>${r.label}</td>${cells}</tr>`;
  }).join('');
  const table = _rbLiveRoles.length
    ? `<table class="rb-snap-table"><thead>${head}</thead><tbody>${bodyRows}</tbody></table>`
    : `<p class="no-data">No live roles for this project.</p>`;
  return `<div class="rb-block rb-block-snap" data-index="${i}" data-id="${block.id}">
    <span class="rb-drag-handle">&#9776;</span>
    <div class="rb-snap">
      <div class="rb-snap-title">Candidate Pipeline Snapshot</div>
      ${table}
    </div>
    <button class="rb-remove-btn" onclick="rbRemoveBlock('${block.id}')">&#x2715;</button>
  </div>`;
}

function rbUpdateSnapshotValue(blockId, roleId, field, value) {
  const block = _rbBlocks.find(b => b.id === blockId);
  if (!block) return;
  if (!block.values) block.values = {};
  if (!block.values[roleId]) block.values[roleId] = {};
  block.values[roleId][field] = value;
  // No re-render — keeps input focus, matching text-block behaviour.
}

// Output renderer — read-only table, empty rows hidden, with a Total row.
function rbRenderSnapshotOutput(block, liveRoles) {
  const values = block.values || {};
  const rows = liveRoles.map(r => {
    const v = values[String(r.id)] || {};
    const nums = SNAP_FIELDS.map(([f]) => Number(v[f]) || 0);
    return { label: r.label, nums, hasData: nums.some(n => n > 0) };
  }).filter(row => row.hasData);

  if (!rows.length) return `<div class="dash-panel">
    <h3 class="panel-title">Candidate Pipeline Snapshot</h3>
    <p class="no-data">No candidate pipeline data entered.</p>
  </div>`;

  const head = `<tr><th>Role</th>${SNAP_FIELDS.map(([, l]) => `<th style="text-align:center">${l}</th>`).join('')}</tr>`;
  const body = rows.map(row =>
    `<tr><td>${row.label}</td>${row.nums.map(n => `<td style="text-align:center">${n > 0 ? n : '–'}</td>`).join('')}</tr>`
  ).join('');
  const totals = SNAP_FIELDS.map((_, i) => rows.reduce((s, row) => s + row.nums[i], 0));
  const totRow = `<tr class="totals-row"><td><strong>Total</strong></td>${totals.map(n => `<td style="text-align:center"><strong>${n}</strong></td>`).join('')}</tr>`;

  return `<div class="dash-panel">
    <h3 class="panel-title">Candidate Pipeline Snapshot</h3>
    <table class="data-table"><thead>${head}</thead><tbody>${body}${totRow}</tbody></table>
  </div>`;
}

function rbFormat(cmd) {
  document.execCommand(cmd, false, null);
  rbUpdateToolbarState();
}

function rbFormatBlock(tag) {
  document.execCommand('formatBlock', false, tag);
  rbUpdateToolbarState();
}

function rbUpdateToolbarState() {
  const toolbar = document.activeElement?.closest('.rb-block-text')?.querySelector('.rb-rt-toolbar');
  if (!toolbar) return;
  ['bold','italic','underline'].forEach(cmd => {
    const btn = toolbar.querySelector(`button[onclick="rbFormat('${cmd}')"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
  const ulBtn = toolbar.querySelector(`button[onclick="rbFormat('insertUnorderedList')"]`);
  const olBtn = toolbar.querySelector(`button[onclick="rbFormat('insertOrderedList')"]`);
  if (ulBtn) ulBtn.classList.toggle('active', document.queryCommandState('insertUnorderedList'));
  if (olBtn) olBtn.classList.toggle('active', document.queryCommandState('insertOrderedList'));
  const headingBtn  = toolbar.querySelector(`button[onclick="rbFormatBlock('H3')"]`);
  const bodyBtn     = toolbar.querySelector(`button[onclick="rbFormatBlock('P')"]`);
  const blockTag    = document.queryCommandValue('formatBlock').toUpperCase();
  if (headingBtn) headingBtn.classList.toggle('active', blockTag === 'H3');
  if (bodyBtn)    bodyBtn.classList.toggle('active',    blockTag === 'P' || blockTag === 'DIV' || blockTag === '');
}

function rbInitSortable() {
  const el = document.getElementById('rb-sortable');
  if (!el || typeof Sortable === 'undefined') return;
  Sortable.create(el, {
    handle: '.rb-drag-handle',
    animation: 150,
    onEnd(evt) {
      // Reorder _rbBlocks to match the new DOM order
      const ids = [...el.querySelectorAll('.rb-block')].map(b => b.dataset.id);
      _rbBlocks = ids.map(id => _rbBlocks.find(b => b.id === id)).filter(Boolean);
    }
  });
}

// Generate a simple unique ID for blocks
function rbUid() { return 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

function rbAddPanelBlock(key) {
  const block = { id: rbUid(), type: 'panel', key };
  if (key === 'candidateSnapshot') block.values = {};
  _rbBlocks.push(block);
  document.getElementById('rb-canvas').innerHTML = rbRenderCanvas();
  rbInitSortable();
}

function rbAddTextBlock() {
  _rbBlocks.push({ id: rbUid(), type: 'text', content: '' });
  document.getElementById('rb-canvas').innerHTML = rbRenderCanvas();
  rbInitSortable();
}

function rbRemoveBlock(id) {
  _rbBlocks = _rbBlocks.filter(b => b.id !== id);
  document.getElementById('rb-canvas').innerHTML = rbRenderCanvas();
  rbInitSortable();
}

function rbUpdateTextBlock(id, value) {
  const block = _rbBlocks.find(b => b.id === id);
  if (block) block.content = value;
}

function rbSetScope(scope) {
  // Talent Partners are restricted to Project scope (Company scope is unscoped).
  if (scope === 'company' && _resolvedRole === 'talent_partner') return;
  _rbScope = scope;
  renderReportBuilder();
}

function rbSetProject(id) {
  _rbProjectId = String(id);
  // Role list is project-specific — reset filter and re-render to refresh options.
  _rbRoleId = 'all';
  renderReportBuilder();
}

function rbSetRole(id) {
  _rbRoleId = id === 'all' ? 'all' : String(id);
}

async function rbFetchData() {
  if (_rbScope === 'project') {
    if (!_rbProjectId) return null;
    // Talent Partners are scoped to their own assigned roles within the project.
    const tpEmail = _resolvedRole === 'talent_partner' ? getCurrentUser().email : null;
    const [allRoles, activity, placements, rejections] = await Promise.all([
      getRolesForProject(_rbProjectId, tpEmail),
      getWeeklyActivity(_rbProjectId, null),
      getPlacements(null),
      getRejectedOffers(null),
    ]);
    // Apply the Role filter — narrow to a single role if one is selected.
    const roles = _rbRoleId === 'all'
      ? allRoles
      : allRoles.filter(r => String(r.id) === String(_rbRoleId));
    const ids = new Set(roles.map(r => String(r.id)));
    // Always constrain to the roles id-set. For Admin/DM with "All Roles" this is
    // every project role (no-op); for a TP it narrows to their assigned roles.
    return {
      roles,
      activity:   activity.filter(a => ids.has(String(a.RoleIDLookupId)) || ids.has(String(a.RoleID))),
      placements: placements.filter(p => ids.has(String(p.RoleIDLookupId)) || ids.has(String(p.RoleID))),
      rejections: rejections.filter(r => ids.has(String(r.RoleIDLookupId)) || ids.has(String(r.RoleID))),
    };
  } else {
    // Company scope — single call for all roles, matching Company Dashboard approach
    const [roles, activity, placements, rejections] = await Promise.all([
      getAllRoles(),
      getWeeklyActivity(null, null),
      getPlacements(null),
      getRejectedOffers(null),
    ]);
    return { roles, activity, placements, rejections };
  }
}

async function rbPreview() {
  const modal = document.getElementById('rb-preview-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="rb-preview-inner">
    <div class="rb-preview-toolbar">
      <button class="print-btn" onclick="rbExportPdf()">&#8856; Export PDF</button>
      <button class="btn-secondary" onclick="document.getElementById('rb-preview-modal').style.display='none'">
        Close</button>
    </div>
    <div id="rb-preview-content"><p>Loading data...</p></div>
  </div>`;

  const data = await rbFetchData();
  if (!data) {
    document.getElementById('rb-preview-content').innerHTML = '<p>No data available.</p>';
    return;
  }
  _rbReportData = data;

  const title = document.getElementById('rb-title')?.value || 'Report';
  const html  = rbRenderReportHtml(title, data, { forPrint: false });
  document.getElementById('rb-preview-content').innerHTML = html;
}

function rbRenderReportHtml(title, data, ganttOpts = null) {
  // ganttOpts: { coeRows, forPrint } — appended Hiring Plan final page
  const titleHtml = `<div class="rb-report-title"><h2>${title}</h2></div>`;

  const blocks = _rbBlocks.map(block => {
    if (block.type === 'panel') {
      if (block.key === 'candidateSnapshot') {
        const EXCLUDED = ['Backlog','Hired','Cancelled','On-hold'];
        const liveRoles = data.roles
          .filter(r => !EXCLUDED.includes(r.Stage))
          .map(r => ({ id: r.id, label: r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle }));
        return rbRenderSnapshotOutput(block, liveRoles);
      }
      const fn = REPORT_PANELS[block.key];
      return fn ? fn(data, _rbPeriod, _rbKpiPeriod) : '';
    } else {
      return `<div class="rb-text-block">${block.content}</div>`;
    }
  }).join('');

  let ganttHtml = '';
  if (_rbIncludeGantt && _rbScope === 'project' && ganttOpts) {
    if (!ganttOpts.forPrint) {
      ganttHtml = `<div class="rb-gantt-placeholder">
        Hiring Plan — renders as a landscape final page on PDF export</div>`;
    } else if (ganttOpts.coeRows?.length) {
      ganttHtml = `<div class="rb-hiring-plan-page">
        <h3>Hiring Plan</h3>
        ${coeGanttHtml(coeSortRows(ganttOpts.coeRows), { readOnly: true, canEdit: false, showActuals: false })}
      </div>`;
    }
  }
  return titleHtml + blocks + ganttHtml;
}

async function rbExportPdf() {
  const title = document.getElementById('rb-title')?.value || 'Report';
  const data  = _rbReportData || await rbFetchData();
  if (!data) return;
  _rbReportData = data;

  // Fetch plan rows only when the Hiring Plan page is enabled
  const coeRows = (_rbIncludeGantt && _rbScope === 'project' && _rbProjectId)
    ? await getCoEPlanRows(_rbProjectId) : [];

  // Use existing printPage() — sets print-header title/sub and calls window.print()
  const main = document.getElementById('main-content');
  main.innerHTML = rbRenderReportHtml(title, data, { forPrint: true, coeRows });
  printPage(title, false, 'Reporting');

  // Restore builder after print dialog closes
  setTimeout(() => renderReportBuilder(), 500);
}

async function rbSaveReport() {
  const title = document.getElementById('rb-title')?.value?.trim();
  if (!title) { alert('Please enter a report title before saving.'); return; }
  const payload = {
    Title:       title,
    Scope:       _rbScope,
    ProjectID:   _rbScope === 'project' ? _rbProjectId : null,
    RoleID:      _rbScope === 'project' && _rbRoleId !== 'all' ? _rbRoleId : null,
    Period:      _rbPeriod,
    KpiPeriod:   _rbKpiPeriod,
    ModuleOrder: JSON.stringify(_rbIncludeGantt ? [..._rbBlocks, { type: 'hiringPlan' }] : _rbBlocks),
  };
  if (_rbReportId) {
    await updateSavedReport(_rbReportId, payload);
  } else {
    payload.ReportOwner = getCurrentUser().email;
    const result = await createSavedReport(payload);
    _rbReportId = result.id;
  }

  // Brief confirmation — no intrusive alert
   const btn = document.getElementById('rb-save-btn');
 if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => { btn.textContent = 'Save'; }, 2000); }
}

async function rbOpenSavedModal() {
  const modal = document.getElementById('rb-saved-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="rb-modal-inner">
    <h3>Saved Reports</h3>
    <p>Loading...</p>
    <button class="btn-secondary" onclick="document.getElementById('rb-saved-modal').style.display='none'">
      Close</button>
  </div>`;

  const [reports, tpMap] = await Promise.all([getSavedReports(), getTalentPartnerDisplayMap()]);
  const currentUser = getCurrentUser();
  const isAdmin = _resolvedRole === 'admin';

  const rows = reports.length
    ? reports.map(r => {
        const owner = r.ReportOwner || '';
        const ownerDisplay = tpMap[owner.toLowerCase()] || owner;
        const canEdit = isAdmin || owner.toLowerCase() === currentUser.email.toLowerCase();
        return `<div class="rb-saved-row">
          <span>${r.Title}</span>
          <span class="rb-saved-meta">${ownerDisplay}</span>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn-secondary btn-sm" onclick="rbLoadReport(${r.id})">Open</button>
            ${canEdit ? `<button class="btn-danger btn-sm" onclick="rbDeleteReport(${r.id}, '${r.Title.replace(/'/g, "\\'")}')">Delete</button>` : ''}
          </div>
        </div>`;
      }).join('')
    : '<p class="no-data">No saved reports yet.</p>';

  modal.innerHTML = `<div class="rb-modal-inner">
    <h3>Saved Reports</h3>${rows}
    <button class="btn-secondary" style="margin-top:16px"
      onclick="document.getElementById('rb-saved-modal').style.display='none'">Close</button>
  </div>`;
}

async function rbLoadReport(id) {
  const report = await getSavedReportById(id);
  _rbReportId   = id;
  _rbScope      = report.Scope || 'project';
  _rbProjectId  = report['ProjectID'] ? String(report['ProjectID']) : null;
  _rbRoleId     = report['RoleID'] ? String(report['RoleID']) : 'all';
  _rbPeriod     = report.Period || 'this_quarter';
  _rbKpiPeriod  = report.KpiPeriod || 'quarter';
  const _loadedBlocks = JSON.parse(report.ModuleOrder || '[]');
  _rbIncludeGantt = _loadedBlocks.some(b => b.type === 'hiringPlan');
  _rbBlocks     = _loadedBlocks.filter(b => b.type !== 'hiringPlan');
  _rbTitle      = report.Title;
  document.getElementById('rb-saved-modal').style.display = 'none';
  renderReportBuilder();
}

async function rbDeleteReport(id, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  await deleteItem('SavedReports', id);
  rbOpenSavedModal();
}

// SharePoint API functions

async function getSavedReports() {
  return getItems('SavedReports');
}
async function getSavedReportById(id) {
  return getItem('SavedReports', id);
}
async function createSavedReport(fields) {
  return createItem('SavedReports', fields);
}
async function updateSavedReport(id, fields) {
  return updateItem('SavedReports', id, fields);
}
