// js/report-builder.js
 
let _rbBlocks     = [];   // Array of block objects (panel or text)
let _rbScope      = 'project';  // 'project' | 'company'
let _rbProjectId  = null;
let _rbPeriod     = 'this_quarter';
let _rbKpiPeriod  = 'quarter';
let _rbReportId   = null;  // SharePoint item ID if editing a saved report
let _rbReportData = null;  // Cached fetch result { roles, activity, placements, rejections }

const RB_PALETTE = [
  { key: 'kpiStrip',       label: 'KPI Strip',                scope: 'both'    },
  { key: 'pipelineActivity',label: 'Pipeline Activity',        scope: 'project' },
  { key: 'activityByTP',   label: 'Activity by Talent Partner',scope: 'both'    },
  { key: 'rejections',     label: 'Offer Rejection Reasons',   scope: 'both'    },
  { key: 'upcomingStarters',label: 'Upcoming Starters',        scope: 'both'    },
  { key: 'spendVsBudget',  label: 'Actual Spend vs Budget',    scope: 'both'    },
  { key: 'rolesOpen30',    label: 'Roles Open 30+ Days',       scope: 'both'    },
  { key: 'roleTracker',    label: 'Role Tracker',              scope: 'project' },
  { key: 'placements',     label: 'Placements',                scope: 'both'    },
];

async function renderReportBuilder() {
  const main  = document.getElementById('main-content');
  const role  = _resolvedRole;
  const user  = getCurrentUser();
 
  // Load projects for the project selector
  const projects = await getScopedProjects(user.email, false);
  if (projects.length && !_rbProjectId) _rbProjectId = String(projects[0].id);
 
  // Load saved reports from SharePoint
  const saved = await getSavedReports();
 
  main.innerHTML = `
    <div class="page-header">
      <h2>Report Builder</h2>
      <div class="page-header-actions">
        <button class="btn-secondary" onclick="rbOpenSavedModal()">Saved Reports</button>
        <button class="btn-secondary" onclick="rbSaveReport()">Save</button>
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
 
  const periodOpts = DETAIL_PERIOD_OPTIONS.map(([k, l]) =>
    `<option value="${k}" ${_rbPeriod === k ? 'selected' : ''>${l}</option>`).join('');
 
  const kpiOpts = [['month','Month'],['quarter','Quarter'],['year','Year']]
    .map(([k,l]) => `<option value="${k}" ${_rbKpiPeriod===k ? 'selected' : ''>${l}</option>`).join('');
 
  // Palette tiles — scope-filtered
  const paletteTiles = RB_PALETTE
    .filter(m => m.scope === 'both' || m.scope === _rbScope)
    .map(m => `<div class="rb-palette-tile" data-key="${m.key}" draggable="false"
      ondblclick="rbAddPanelBlock('${m.key}')">${m.label}
      <button class="rb-add-btn" onclick="rbAddPanelBlock('${m.key}')">+</button>
    </div>`).join('');
 
  return `
    <div class="rb-config">
      <div class="rb-section-label">Report Title</div>
      <input id="rb-title" class="rb-input" type="text" placeholder="Untitled Report"
        value="${_rbTitle || ''}" oninput="_rbTitle = this.value">
 
      <div class="rb-section-label">Scope</div>
      <div class="filter-group">
        <button class="btn-filter ${_rbScope==='project'?'active':''}"
          onclick="rbSetScope('project')">Project</button>
        <button class="btn-filter ${_rbScope==='company'?'active':''}"
          onclick="rbSetScope('company')">Company</button>
      </div>
 
      ${_rbScope === 'project' ? '<div class="rb-section-label">Project</div><select class="rb-select" onchange="rbSetProject(this.value)">' + projectOpts + '</select>' : ''}
 
      <div class="rb-section-label">Period</div>
      <select class="rb-select" onchange="_rbPeriod = this.value">${periodOpts}</select>
 
      <div class="rb-section-label">KPI Period</div>
      <select class="rb-select" onchange="_rbKpiPeriod = this.value">${kpiOpts}</select>
    </div>
 
    <div class="rb-section-label" style="margin-top:16px">Add Modules</div>
    <div class="rb-palette" id="rb-palette">${paletteTiles}</div>
 
    <div class="rb-section-label" style="margin-top:16px">Add Text Block</div>
    <button class="btn-secondary rb-full-btn" onclick="rbAddTextBlock()">+ Text Block</button>
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
      const meta = RB_PALETTE.find(p => p.key === block.key) || { label: block.key };
      return `<div class="rb-block rb-block-panel" data-index="${i}" data-id="${block.id}">
        <span class="rb-drag-handle">&#9776;</span>
        <span class="rb-block-label">${meta.label}</span>
        <button class="rb-remove-btn" onclick="rbRemoveBlock('${block.id}')">&#x2715;</button>
      </div>`;
    } else {
      return `<div class="rb-block rb-block-text" data-index="${i}" data-id="${block.id}">
        <span class="rb-drag-handle">&#9776;</span>
        <textarea class="rb-textarea" placeholder="Enter text or notes..."
          oninput="rbUpdateTextBlock('${block.id}', this.value)">${block.content || ''}</textarea>
        <button class="rb-remove-btn" onclick="rbRemoveBlock('${block.id}')">&#x2715;</button>
      </div>`;
    }
  }).join('');
 
  return `<div id="rb-sortable">${items}</div>`;
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
  _rbBlocks.push({ id: rbUid(), type: 'panel', key });
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
  _rbScope = scope;
  renderReportBuilder();
}
 
function rbSetProject(id) {
  _rbProjectId = String(id);
}

async function rbFetchData() {
  if (_rbScope === 'project') {
    if (!_rbProjectId) return null;
    const [allRoles, activity, placements, rejections] = await Promise.all([
      getRolesForProject(_rbProjectId),
      getWeeklyActivity(_rbProjectId, null),
      getPlacements(null),
      getRejectedOffers(null),
    ]);
    const ids = new Set(allRoles.map(r => String(r.id)));
    return {
      roles: allRoles,
      activity,
      placements: placements.filter(p => ids.has(String(p.RoleIDLookupId)) || ids.has(String(p.RoleID))),
      rejections: rejections.filter(r => ids.has(String(r.RoleIDLookupId)) || ids.has(String(r.RoleID))),
    };
  } else {
    // Company scope — fetch all projects, aggregate
    const allProjects = await getAllProjects();
    const [activity, placements, rejections, ...roleArrays] = await Promise.all([
      getWeeklyActivity(null, null),
      getPlacements(null),
      getRejectedOffers(null),
      ...allProjects.map(p => getRolesForProject(String(p.id))),
    ]);
    const roles = roleArrays.flat();
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
  const html  = rbRenderReportHtml(title, data);
  document.getElementById('rb-preview-content').innerHTML = html;
}

function rbRenderReportHtml(title, data) {
  const titleHtml = `<div class="rb-report-title"><h2>${title}</h2>
    <div class="rb-report-meta">
      ${_rbScope === 'project' ? 'Project report' : 'Company-wide report'}
      &nbsp;·&nbsp; ${DETAIL_PERIOD_OPTIONS.find(([k]) => k === _rbPeriod)?.[1] || _rbPeriod}
    </div></div>`;
 
  const blocks = _rbBlocks.map(block => {
    if (block.type === 'panel') {
      const fn = REPORT_PANELS[block.key];
      return fn ? fn(data, _rbPeriod, _rbKpiPeriod) : '';
    } else {
      return `<div class="rb-text-block">${block.content.replace(/\n/g, '<br>')}</div>`;
    }
  }).join('');
 
  return titleHtml + blocks;
}

async function rbExportPdf() {
  const title = document.getElementById('rb-title')?.value || 'Report';
  const data  = _rbReportData || await rbFetchData();
  if (!data) return;
  _rbReportData = data;
 
  // Use existing printPage() — sets print-header title/sub and calls window.print()
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="page-header"><h2>${title}</h2></div>` + rbRenderReportHtml(title, data);
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
    ProjectId:   _rbScope === 'project' ? _rbProjectId : null,
    Period:      _rbPeriod,
    KpiPeriod:   _rbKpiPeriod,
    ModuleOrder: JSON.stringify(_rbBlocks),
    ModifiedBy:  getCurrentUser().email,
  };
 
  if (_rbReportId) {
    await updateSavedReport(_rbReportId, payload);
  } else {
    payload.CreatedBy = getCurrentUser().email;
    const result = await createSavedReport(payload);
    _rbReportId = result.id;
  }
  // Brief confirmation — no intrusive alert
  const btn = document.querySelector('.page-header-actions .btn-secondary');
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
 
  const reports = await getSavedReports();
  const rows = reports.length
    ? reports.map(r => `<div class="rb-saved-row">
        <span>${r.Title}</span>
        <span class="rb-saved-meta">${r.Scope} · ${r.Period}</span>
        <button class="btn-secondary btn-sm" onclick="rbLoadReport(${r.id})">Open</button>
      </div>`).join('')
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
  _rbProjectId  = report.ProjectId || null;
  _rbPeriod     = report.Period || 'this_quarter';
  _rbKpiPeriod  = report.KpiPeriod || 'quarter';
  _rbBlocks     = JSON.parse(report.ModuleOrder || '[]');
  _rbTitle      = report.Title;
  document.getElementById('rb-saved-modal').style.display = 'none';
  renderReportBuilder();
}

// SharePoint API functions
 
async function getSavedReports() {
  return spGet('SavedReports', '$orderby=Modified desc&$top=100');
}
 
async function getSavedReportById(id) {
  return spGetById('SavedReports', id);
}
 
async function createSavedReport(fields) {
  return spCreate('SavedReports', fields);
}
 
async function updateSavedReport(id, fields) {
  return spUpdate('SavedReports', id, fields);
}

