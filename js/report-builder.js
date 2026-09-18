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

// Library state (N-244)
let _rbLibraryCache  = [];  // reports visible to this user, from the last load
let _rbLibraryFilter = '';  // '' = all clients
let _rbProjectMap    = {};  // projectId (string) -> CustomerName, for banding
let _rbTpMap         = {};  // email (lower) -> display name, for the Owner column

const SNAP_FIELDS = [   // Candidate Pipeline Snapshot columns: [valueKey, header]
  ['screening', 'Screening'],
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
    const tpEmail = _resolvedRole === 'talent_partner' ? getScopedUserEmail() : null;
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
    .map(r => ({ id: r.id, label: escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle) }));

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
        <button class="btn-secondary" onclick="showReportBuilderLibrary()">&larr; Back to Library</button>
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
  `;

  rbInitSortable();
}

function rbRenderSidebar(projects) {
  // N-112: Active/Archive optgroup split.
  const sortedProjects  = sortProjectsByName(projects);
  const activeProjects  = sortedProjects.filter(isProjectActive);
  const archiveProjects = sortedProjects.filter(p => !isProjectActive(p));
  const projectOpts = [
    activeProjects.length  ? `<optgroup label="Active">${buildProjectOptionsHtml(activeProjects, _rbProjectId)}</optgroup>`   : '',
    archiveProjects.length ? `<optgroup label="Archive">${buildProjectOptionsHtml(archiveProjects, _rbProjectId)}</optgroup>` : '',
  ].join('');

  // Role options for the selected project, with an "All Roles" default.
  const roleOpts = ['<option value="all"' + (_rbRoleId === 'all' ? ' selected' : '') + '>All Roles</option>']
    .concat(_rbProjectRoles.map(r => {
      const label = escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle);
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
        value="${escAttr(_rbTitle || '')}" oninput="_rbTitle = this.value">

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
        <span class="rb-block-label">${escHtml(meta.label)}</span>
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
            ${rtTableToolbarButtonHtml()}
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
      `<td><input type="number" min="0" class="rb-snap-input" value="${escAttr(v[f] ?? '')}"
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

  // Column totals across shown rows; keep only columns that have data.
  const colTotals = SNAP_FIELDS.map((_, i) => rows.reduce((s, row) => s + row.nums[i], 0));
  const keep = SNAP_FIELDS.map((_, i) => colTotals[i] > 0);

  const head = `<tr><th>Role</th>${SNAP_FIELDS
    .filter((_, i) => keep[i])
    .map(([, l]) => `<th style="text-align:center">${l}</th>`).join('')}</tr>`;
  const body = rows.map(row =>
    `<tr><td>${row.label}</td>${row.nums
      .filter((_, i) => keep[i])
      .map(n => `<td style="text-align:center">${n > 0 ? n : '–'}</td>`).join('')}</tr>`
  ).join('');
  const totRow = `<tr class="totals-row"><td><strong>Total</strong></td>${colTotals
    .filter((_, i) => keep[i])
    .map(n => `<td style="text-align:center"><strong>${n}</strong></td>`).join('')}</tr>`;

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
  rtUpdateToolbarState(toolbar, 'rbFormat', 'rbFormatBlock');
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
    const tpEmail = _resolvedRole === 'talent_partner' ? getScopedUserEmail() : null;
    const [allRoles, activity, placements, rejections, tpMap] = await Promise.all([
      getRolesForProject(_rbProjectId, tpEmail),
      getWeeklyActivity(_rbProjectId, null),
      getPlacements(null),
      getRejectedOffers(null),
      getTalentPartnerDisplayMap(),
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
      tpMap,
    };
  } else {
    // Company scope — single call for all roles, matching Company Dashboard approach
    const [roles, activity, placements, rejections, tpMap] = await Promise.all([
      getRolesForUser(getCurrentUser().email),
      getWeeklyActivity(null, null),
      getPlacements(null),
      getRejectedOffers(null),
      getTalentPartnerDisplayMap(),
    ]);
    return { roles, activity, placements, rejections, tpMap };
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
  const titleHtml = `<div class="rb-report-title"><h2>${escHtml(title)}</h2></div>`;

  const blocks = _rbBlocks.map(block => {
    if (block.type === 'panel') {
      if (block.key === 'candidateSnapshot') {
        const EXCLUDED = ['Backlog','Hired','Cancelled','On-hold'];
        const liveRoles = data.roles
          .filter(r => !EXCLUDED.includes(r.Stage))
          .map(r => ({ id: r.id, label: escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle) }));
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
        <div class="dash-panel rb-hiring-plan-panel">
          <h3 class="panel-title">Hiring Plan</h3>
          ${coeGanttHtml(coeSortRows(ganttOpts.coeRows), { readOnly: true, canEdit: false, showActuals: false })}
        </div>
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
  printPage(title, true, 'Reporting');

  // Restore builder after print dialog closes
  setTimeout(() => renderReportBuilder(), 500);
}

async function rbSaveReport() {
  const title = document.getElementById('rb-title')?.value?.trim();
  if (!title) { toast('Please enter a report title before saving.', { type: 'error' }); return; }
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

// ── Report Builder Library (N-244) ─────────────────────────────────────
// Reached from nav.js's `reportBuilder` route. The builder itself is only
// opened from a Library row (Open/Copy) or the Library's own "+ New Report"
// button — never directly.

async function showReportBuilderLibrary() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="page-header"><h2>Report Library</h2></div><p>Loading...</p>';

  try {
    const user = getCurrentUser();
    // getProjects(false) deliberately, not getScopedProjects — an Admin's
    // Company-wide band still needs every client name resolvable, including
    // a project the viewer holds no assignment on (same reasoning N-235
    // uses for showBriefingPackLibrary's getProjects(false) call).
    const [reports, projects, projectIds, tpMap] = await Promise.all([
      getSavedReports(),
      getProjects(false),
      getUserProjectIds(user.email),
      getTalentPartnerDisplayMap(),
    ]);
    _rbProjectMap = {};
    projects.forEach(p => { _rbProjectMap[String(p.id)] = p.CustomerName || ''; });
    _rbTpMap = tpMap;
    _rbLibraryCache = _rbVisibleReports(reports, projectIds, user.email);
    _rbRenderLibrary();
  } catch (e) {
    main.innerHTML = pageErrorBlock({ message: e.message, retryOnClick: 'showReportBuilderLibrary()' });
    if (window.lucide) lucide.createIcons();
  }
}

// Admin sees everything. A Delivery Manager sees every company-scope report
// (a DM-level view — company reports have no project to assign) plus any
// project-scope report for a project assigned to them; a Talent Partner sees
// only project-scope reports for their assigned projects. Either role also
// keeps seeing a report they own even if no longer assigned to its project —
// mirrors _bpVisiblePacks' mine(p) || ids.includes(...) fallback.
// getUserProjectIds() returns null for an admin ("all"), but admin is
// short-circuited above, so `ids` here is only ever a real array.
function _rbVisibleReports(reports, projectIds, email) {
  if (_resolvedRole === 'admin') return reports;
  const me     = (email || '').toLowerCase();
  const ids    = projectIds || [];
  const mine   = r => (r.ReportOwner || '').toLowerCase() === me;
  const onProj = r => r.Scope === 'project' && ids.includes(String(r.ProjectID));
  if (_resolvedRole === 'delivery_manager') {
    return reports.filter(r => r.Scope === 'company' || mine(r) || onProj(r));
  }
  // talent_partner — project-scope only, own or assigned; Scope:'company'
  // is excluded outright, never surfaced by ownership alone (N-244 QA finding 1).
  return reports.filter(r => r.Scope === 'project' && (mine(r) || onProj(r)));
}

// One resolver for grouping, filter options and filter matching, so all
// three agree. A company-scope report has no project to band under.
function _rbReportClient(report) {
  if (report.Scope === 'company') return 'Company-wide';
  return _rbProjectMap[String(report.ProjectID)] || 'Unassigned';
}

// Company-wide first, Unassigned last, real clients A-Z between them.
function _rbClientSortKey(c) {
  if (c === 'Company-wide') return [0, c];
  if (c === 'Unassigned')   return [2, c];
  return [1, c];
}
function _rbSortClients(clients) {
  return clients.slice().sort((a, b) => {
    const ka = _rbClientSortKey(a), kb = _rbClientSortKey(b);
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]);
  });
}

function rbLibraryFilterChanged(value) {
  _rbLibraryFilter = value;
  _rbRenderLibrary();   // re-render from cache, no refetch
}

function _rbLibraryClientOptions() {
  const values = _rbSortClients([...new Set(_rbLibraryCache.map(_rbReportClient))]);
  return ['<option value="">All</option>'].concat(values.map(v =>
    `<option value="${escAttr(v)}"${v === _rbLibraryFilter ? ' selected' : ''}>${escHtml(v)}</option>`
  )).join('');
}

function _rbRenderLibrary() {
  const me      = (getCurrentUser().email || '').toLowerCase();
  const isAdmin = _resolvedRole === 'admin';
  const reports = _rbLibraryCache.filter(r => !_rbLibraryFilter || _rbReportClient(r) === _rbLibraryFilter);

  const groups = {};
  reports.forEach(r => {
    const client = _rbReportClient(r);
    (groups[client] = groups[client] || []).push(r);
  });

  const rows = reports.length
    ? _rbSortClients(Object.keys(groups)).map(client => {
        const list = groups[client].slice().sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
        const reportRows = list.map(r => {
          const owner = r.ReportOwner || '';
          const canDelete = isAdmin || owner.toLowerCase() === me;
          const periodLabel = (DETAIL_PERIOD_OPTIONS.find(([k]) => k === r.Period) || [])[1] || r.Period || '—';
          return `
        <tr>
          <td>${escHtml(r.Title || '—')}</td>
          <td>${escHtml(periodLabel)}</td>
          <td>${escHtml(_rbTpMap[owner.toLowerCase()] || owner || '—')}</td>
          <td>
            <div class="row-actions">
              <button class="btn-secondary" onclick="rbLoadReport(${r.id})">Open</button>
              <button class="btn-secondary" onclick="rbCopyReportAction(${r.id}, this)">Copy</button>
              ${canDelete ? `<button class="btn-secondary" onclick="rbDeleteReport(${r.id}, '${escJsAttr(r.Title || '')}')">Delete</button>` : ''}
            </div>
          </td>
        </tr>`;
        }).join('');
        return `
        <tr class="bp-lib-client-row">
          <td colspan="4"><strong>${escHtml(client)}</strong> <span class="bp-lib-count">${list.length}</span></td>
        </tr>${reportRows}`;
      }).join('')
    : emptyStateRow({
        colspan: 4,
        icon: 'folder',
        message: _rbLibraryCache.length
          ? 'No reports match the current filter.'
          : 'No saved reports yet.',
      });

  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <h2>Report Builder Library</h2>
      <div class="page-header-actions">
        <button class="btn-primary" onclick="rbStartNewReport()">+ New Report</button>
      </div>
    </div>
    <div class="table-toolbar">
      ${listControlsBar([`
        <div class="form-group project-filter-select">
          <label>Client</label>
          <select onchange="rbLibraryFilterChanged(this.value)">${_rbLibraryClientOptions()}</select>
        </div>`])}
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>
          <th>Title</th><th>Period</th><th>Owner</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

// ── Builder entry points ────────────────────────────────────────────────
function rbStartNewReport() {
  _rbReportId     = null;
  _rbBlocks       = [];
  _rbTitle        = '';
  _rbIncludeGantt = false;
  _rbScope        = 'project';
  _rbProjectId    = null;
  _rbRoleId       = 'all';
  renderReportBuilder();
}

async function rbCopyReportAction(id, btn) {
  setButtonLoading(btn);
  try {
    const copy = await copySavedReport(id, getCurrentUser().email);
    await rbLoadReport(copy.id);
  } catch (e) {
    toast('Could not copy that report: ' + e.message, { type: 'error' });
  } finally {
    clearButtonLoading(btn);
  }
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
  renderReportBuilder();
}

async function rbDeleteReport(id, title) {
  if (!(await confirmModal({
    message: `Delete "${title}"? This cannot be undone.`,
    confirmLabel: 'Delete', danger: true,
  }))) return;
  try {
    await deleteItem('SavedReports', id);
  } catch (e) {
    toast('Could not delete that report: ' + e.message, { type: 'error' });
    return;
  }
  showReportBuilderLibrary();
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

// N-244: Title and ReportOwner are set by the caller, never copied.
// Everything else is whitelisted — never round-trip a fetched Graph item
// into a create (LinkTitle and friends are read-only → 403). A report has
// no child rows, so this is a single create with no rollback sequence, same
// as copyBriefingPack.
const _SAVED_REPORT_COPY_FIELDS = ['Scope', 'ProjectID', 'RoleID', 'Period', 'KpiPeriod', 'ModuleOrder'];
async function copySavedReport(id, owner) {
  const src = await getSavedReportById(id);
  return createSavedReport({
    ..._pickFields(src, _SAVED_REPORT_COPY_FIELDS),
    Title:       `${src.Title} (copy)`,
    ReportOwner: (owner || '').toLowerCase(),
  });
}
