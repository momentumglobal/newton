// js/report-builder.js

let _rbBlocks     = [];   // Array of block objects (panel or text)
let _rbScope      = 'project';  // 'project' | 'company'
let _rbProjectId  = null;
let _rbRoleId     = 'all';  // 'all' | role id — Project-scope role filter
let _rbPeriod     = 'this_quarter';
let _rbKpiPeriod  = 'quarter';
let _rbReportId   = null;  // SharePoint item ID if editing a saved report
let _rbReportData = null;  // Cached fetch result { roles, activity, placements, rejections, tpMap, hc }
let _rbTitle      = '';
let _rbIncludeGantt = false;  // append Hiring Plan as landscape final page (CoE projects)
let _rbProjectRoles = [];  // Roles for the selected project (drives Role dropdown)
let _rbLiveRoles = [];  // Live roles for the current project/role filter — drives the Snapshot editor
// N-330: optional branded title page (Project scope only). The logo is the
// project's ClientLogos row — shared with Briefing Packs in both directions.
let _rbIncludeTitlePage = false;
let _rbClientName       = '';  // selected project's CustomerName
let _rbClientLogo       = '';  // data: URI, held against the PROJECT not the report
let _rbClientLogoName   = '';
let _rbProjects         = [];  // last project list, so the sidebar can re-render alone

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
  { key: 'roleTracker',      label: 'Pipeline Tracker',           scope: 'project', group: 'Overview' },
  { key: 'rolesOpen30',      label: 'Roles Open 30+ Days',        scope: 'both',    group: 'Overview' },
  // Pipeline
  { key: 'pipelineActivity', label: 'Pipeline Activity',          scope: 'project', group: 'Pipeline', filtered: true },
  { key: 'activityByTP',     label: 'Activity by Talent Partner', scope: 'both',    group: 'Pipeline', filtered: true },
  { key: 'pipelineSummary',  label: 'Pipeline Summary (last 4 weeks)', scope: 'both', group: 'Pipeline' },
  { key: 'pipelineSummaryPTD', label: 'Pipeline Summary (project to date)', scope: 'project', group: 'Pipeline' },
  { key: 'candidateSnapshot', label: 'Candidate Pipeline Snapshot',    scope: 'project', group: 'Pipeline' },
  // Placements & Rejections
  { key: 'placements',       label: 'Placements',                 scope: 'both',    group: 'Placements & Rejections', filtered: true },
  { key: 'placementsPTD',    label: 'Placements (project to date)', scope: 'project', group: 'Placements & Rejections' },
  { key: 'spendVsBudget',    label: 'Actual Spend vs Budget',     scope: 'both',    group: 'Placements & Rejections' },
  { key: 'upcomingStarters', label: 'Upcoming Starters',          scope: 'both',    group: 'Placements & Rejections' },
  { key: 'rejections',       label: 'Offer Rejection Reasons',    scope: 'both',    group: 'Placements & Rejections', filtered: true },
  // N-385: company scope only; `cap` = a CONFIG.ROLE_CAPABILITIES key the viewer must hold.
  { key: 'slaRollup',        label: 'SLA Roll-up (last 90 days)', scope: 'company', group: 'Delivery Assurance', cap: 'slaRollupReport' },
  // N-388: company scope only; follows the report's period; amounts only for Admin / Leadership viewers.
  { key: 'rejectionIntel',   label: 'Rejection Intelligence',     scope: 'company', group: 'Delivery Assurance', cap: 'rejectionIntelReport' },
];

async function renderReportBuilder() {
  const main  = document.getElementById('main-content');
  const role  = _resolvedRole;
  const user  = getCurrentUser();

  // Load projects for the project selector
  const projects = dashboardProjects(await getScopedProjects(user.email, false));   // N-362
  if (projects.length && !_rbProjectId) _rbProjectId = String(projects[0].id);
  _rbProjects   = projects;
  _rbClientName = (projects.find(p => String(p.id) === _rbProjectId) || {}).CustomerName || '';
  if (_rbScope === 'project' && _rbIncludeTitlePage) await rbLoadClientLogo();

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

  // Live roles for the Candidate Pipeline Snapshot editor — open pipelines
  // only, respecting the single-role filter. Mirrors what the output uses.
  _rbLiveRoles = _rbProjectRoles
    .filter(r => isOpenPipelineStage(r.Stage))
    .filter(r => _rbRoleId === 'all' || String(r.id) === String(_rbRoleId))
    .map(r => ({ id: r.id, label: escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle) }));

  main.innerHTML = `
    <div class="page-header">
      <h2>Report Builder</h2>
      <div class="page-header-actions">
        ${(_rbScope === 'project' && projects.find(p => String(p.id) === _rbProjectId)?.ProjectType === 'CoE') ? `
        <label class="rb-gantt-toggle">
          <input type="checkbox" ${_rbIncludeGantt ? 'checked' : ''}
            ${actOn('change', 'rbSetOption', 'includeGantt', ACT_CHECKED).trim()}>
          Planned vs Actual Role Opens final page
        </label>` : ''}
        <button class="btn-secondary"${act('showReportBuilderLibrary')}>&larr; Back to Library</button>
        <button class="btn-secondary" id="rb-save-btn"${act('rbSaveReport')}>Save</button>
        <button class="btn-secondary"${act('rbPreview')}>Preview</button>
        <button class="print-btn"    ${act('rbExportPdf')}>&#8856; Export PDF</button>
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
      ${actOn('dblclick', 'rbAddPanelBlock', m.key).trim()}><span>${m.label}${m.filtered ? '<span class="rb-filter-mark">*</span>' : ''}</span><button class="rb-add-btn"${act('rbAddPanelBlock', m.key)}>+</button>
    </div>`;

  const groupOrder = [...new Set(RB_PALETTE.map(m => m.group))];
  const paletteTiles = groupOrder.map(group => {
    const tiles = RB_PALETTE
      .filter(m => m.group === group && (m.scope === 'both' || m.scope === _rbScope))
      .filter(m => !m.cap || roleCan(_resolvedRole, m.cap))   // N-385
      .map(tileHtml).join('');
    if (!tiles) return '';  // hide empty group (e.g. Pipeline in Company scope)
    return `<div class="rb-subheading">${group}</div>` + tiles;
  }).join('');

  return `
    <div class="rb-sidebar-scroll">
    <div class="rb-config">
      <div class="rb-section-label">Report Title</div>
      <input id="rb-title" class="rb-input" type="text" placeholder="Untitled Report"
        value="${escAttr(_rbTitle || '')}"${actOn('input', 'rbSetOption', 'title', ACT_VALUE)}>
      ${_rbScope === 'project' ? rbTitlePageControlsHtml() : ''}

      <div class="rb-section-label">Scope</div>
      <div class="filter-group">
        <button class="btn-filter ${_rbScope==='project'?'active':''}"
          ${act('rbSetScope', 'project').trim()}>Project</button>
        ${_resolvedRole === 'talent_partner' ? '' : `<button class="btn-filter ${_rbScope==='company'?'active':''}"
          ${act('rbSetScope', 'company').trim()}>Company</button>`}
      </div>

      ${_rbScope === 'project' ? '<div class="rb-section-label">Project</div><select class="rb-select"' + actOn('change', 'rbSetProject', ACT_VALUE) + '>' + projectOpts + '</select>' : ''}

      ${_rbScope === 'project' ? '<div class="rb-section-label">Role</div><select class="rb-select"' + actOn('change', 'rbSetRole', ACT_VALUE) + '>' + roleOpts + '</select>' : ''}

      <div class="rb-section-label">Period</div>
      <select class="rb-select"${actOn('change', 'rbSetOption', 'period', ACT_VALUE)}>${periodOpts}</select>

      <div class="rb-section-label">KPI Period</div>
      <select class="rb-select"${actOn('change', 'rbSetOption', 'kpiPeriod', ACT_VALUE)}>${kpiOpts}</select>
    </div>

    <div class="rb-section-label" style="margin-top:16px">Add Modules</div>
    <div class="rb-palette" id="rb-palette">${paletteTiles}</div>
    </div>

    <div class="rb-sidebar-footer">
      <div class="rb-section-label">Add Text Block</div>
      <button class="btn-secondary rb-full-btn"${act('rbAddTextBlock')}>+ Text Block</button>
      <p class="rb-footnote"><span class="rb-filter-mark">*</span> Controlled by the Period / KPI Period filter above. Unmarked modules show all available data.</p>
    </div>
  `;
}

// ── N-330: title page — sidebar controls, client logo, cover ──────────
function rbTitlePageOn() {
  return _rbIncludeTitlePage && _rbScope === 'project';
}

function rbTitlePageControlsHtml() {
  const logo = !_rbIncludeTitlePage ? '' : `
      <div class="rb-section-label">Client Logo</div>
      <div class="bp-logo-control">
        ${_rbClientLogo
          ? `<img class="bp-logo-thumb" src="${escAttr(_rbClientLogo)}" alt="${escAttr(_rbClientLogoName || 'Client logo')}">`
          : '<span class="bp-logo-empty">No logo uploaded</span>'}
        <input type="file" class="bp-logo-input" accept="${uploadAcceptAttr('LOGO')}"
          ${actOn('change', 'rbUploadClientLogo', ACT_EL).trim()}>
        ${_rbClientLogo ? `<button class="btn-secondary btn-sm"${act('rbRemoveClientLogo')}>Remove</button>` : ''}
      </div>
      <p class="rb-footnote">Saved against the project — shared with Briefing Packs for this project.</p>`;
  return `
      <label class="rb-check-row">
        <input type="checkbox" ${_rbIncludeTitlePage ? 'checked' : ''}
          ${actOn('change', 'rbSetTitlePage', ACT_CHECKED).trim()}>
        Include title page
      </label>${logo}`;
}

function rbRefreshSidebar() {
  const el = document.getElementById('rb-sidebar');
  if (el) el.innerHTML = rbRenderSidebar(_rbProjects);
}

// A failed read degrades to "no logo" — the lockup then shows the client
// name alone — never a broken builder or export.
async function rbLoadClientLogo() {
  _rbClientLogo = '';
  _rbClientLogoName = '';
  if (!_rbProjectId) return;
  try {
    const row = await getClientLogo(_rbProjectId);
    if (row && String(row.LogoData || '').startsWith('data:image/')) {
      _rbClientLogo     = row.LogoData;
      _rbClientLogoName = row.LogoName || '';
    }
  } catch (e) {
    console.warn('N-330: client logo read failed', e);
  }
}

async function rbSetTitlePage(checked) {
  _rbIncludeTitlePage = !!checked;
  if (_rbIncludeTitlePage) await rbLoadClientLogo();
  rbRefreshSidebar();
}

// Same validation and storage as the Briefing Pack control (readClientLogoFile,
// briefing-pack.js) — one ClientLogos row per project, so a pack sees it too.
async function rbUploadClientLogo(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!_rbProjectId) {
    toast('Select a project before uploading a logo.', { type: 'error' });
    input.value = '';
    return;
  }
  const read = await readClientLogoFile(file);
  if (!read.ok) {
    toast(read.reason, { type: 'error' });
    input.value = '';
    return;
  }
  try {
    await upsertClientLogo(_rbProjectId, read.dataUri, file.name);
  } catch (e) {
    toast(`Could not save the logo: ${e.message || e}`, { type: 'error' });
    input.value = '';
    return;
  }
  _rbClientLogo     = read.dataUri;
  _rbClientLogoName = file.name;
  rbRefreshSidebar();
  toast('Client logo saved for this project.');
}

async function rbRemoveClientLogo() {
  if (!_rbProjectId) return;
  if (!(await confirmModal({
    message: 'Remove the client logo for this project? Briefing Packs and reports for this project lose it.',
    confirmLabel: 'Remove', danger: true,
  }))) return;
  try {
    await deleteClientLogo(_rbProjectId);
  } catch (e) {
    toast(`Could not remove the logo: ${e.message || e}`, { type: 'error' });
    return;
  }
  _rbClientLogo = '';
  _rbClientLogoName = '';
  rbRefreshSidebar();
}

// The Briefing Pack cover composition (lockup top, title block lower third),
// landscape, with no Confidential line. Date = the day of export.
function rbRenderTitlePageHtml(title) {
  const client = (_rbClientName || '').trim();
  return `<section class="bp-page-full bp-page-title rb-cover">
    ${clientLockupHtml(_rbClientLogo, client)}
    <div class="bp-cover-spacer"></div>
    <div class="bp-cover-block">
      <h1 class="bp-cover-title">${escHtml(title)}</h1>
      <span class="bp-cover-rule"></span>
      ${client ? `<p class="bp-cover-partner">Momentum Global in partnership with ${escHtml(client)}</p>` : ''}
      <p class="bp-cover-date">${escHtml(formatLongDay(localDayISO()) || '')}</p>
    </div>
  </section>`;
}

// The Newton / Reporting bar for the top of the first data page. #print-header
// is hidden under body.rb-printing (it would print on the cover); this copy
// shares its print rules through the `#print-header, .rb-print-band` selector
// list in style.css, and is hidden on screen.
function rbPrintBandHtml() {
  return `<div class="rb-print-band">
    <div>
      <div class="print-header-title">Newton</div>
      <div class="print-header-sub">Reporting</div>
    </div>
    <img src="momentum-symbol-and-name-global-white.png" alt="Momentum Global">
  </div>`;
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
        <button class="rb-remove-btn"${act('rbRemoveBlock', String(block.id))}>&#x2715;</button>
      </div>`;
    } else {
      return `<div class="rb-block rb-block-text" data-index="${i}" data-id="${block.id}">
        <span class="rb-drag-handle">&#9776;</span>
        <div class="rb-rt-wrapper">
          <div class="rb-rt-toolbar">
            <button type="button"${act('rbFormat', 'bold')} data-rt="bold"><b>B</b></button>
            <button type="button"${act('rbFormat', 'italic')} data-rt="italic"><i>I</i></button>
            <button type="button"${act('rbFormat', 'underline')} data-rt="underline"><u>U</u></button>
            <button type="button"${act('rbFormat', 'insertUnorderedList')} data-rt="insertUnorderedList">&#8226; List</button>
            <button type="button"${act('rbFormat', 'insertOrderedList')} data-rt="insertOrderedList">1. List</button>
            <button type="button"${act('rbFormatBlock', 'H3')} data-rt-block="H3">Heading</button>
            <button type="button"${act('rbFormatBlock', 'P')} data-rt-block="P">Body Text</button>
            ${rtTableToolbarButtonHtml()}
          </div>
          <div class="rb-richtext" contenteditable="true" data-id="${block.id}"
            ${actOn('input', 'rbUpdateTextBlock', String(block.id), ACT_HTML).trim()}
            ${actOn('keyup', 'rbUpdateToolbarState').trim()}
            ${actOn('mouseup', 'rbUpdateToolbarState').trim()}>${block.content || ''}</div>
        </div>
        <button class="rb-remove-btn"${act('rbRemoveBlock', String(block.id))}>&#x2715;</button>
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
        ${actOn('input', 'rbUpdateSnapshotValue', String(block.id), rid, f, ACT_VALUE).trim()}></td>`
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
    <button class="rb-remove-btn"${act('rbRemoveBlock', String(block.id))}>&#x2715;</button>
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
  rtUpdateToolbarState(toolbar);
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
    // N-315: roles first — activity is scoped by their ids, not by the
    // unvalidated WeeklyActivity.ProjectID column. The ids.has() filter below
    // stays: above CONFIG.ROLE_ID_FILTER_MAX roles the read over-fetches.
    const allRoles = await getRolesForProject(_rbProjectId, tpEmail);
    const [activity, placements, rejections, tpMap, headcount] = await Promise.all([
      getWeeklyActivity(null, null, { roleIds: allRoles.map(r => r.id) }),
      getPlacements(null),
      getRejectedOffers(null),
      getTalentPartnerDisplayMap(),
      // N-310 (S-11): KPI Strip / Roles Open 30+ headcount context.
      getAllHeadcount().catch(e => { console.warn('N-310: headcount read failed', e); return null; }),
    ]);
    // Apply the Role filter — narrow to a single role if one is selected.
    const roles = _rbRoleId === 'all'
      ? allRoles
      : allRoles.filter(r => String(r.id) === String(_rbRoleId));
    const ids = new Set(roles.map(r => String(r.id)));
    // Always constrain to the roles id-set. For Admin/DM with "All Roles" this is
    // every project role (no-op); for a TP it narrows to their assigned roles.
    const scopedPlacements = placements.filter(p => ids.has(String(p.RoleIDLookupId)) || ids.has(String(p.RoleID)));
    return {
      roles,
      activity:   activity.filter(a => ids.has(String(a.RoleIDLookupId)) || ids.has(String(a.RoleID))),
      placements: scopedPlacements,
      rejections: rejections.filter(r => ids.has(String(r.RoleIDLookupId)) || ids.has(String(r.RoleID))),
      tpMap,
      hc: dashboardHeadcountContext(roles, scopedPlacements, headcount),
    };
  } else {
    // Company scope — single call for all roles, matching Company Dashboard approach
    // N-333: company scope is a client report — the internal project is
    // excluded (a project-scope report on it, above, is not). The FULL role
    // list maps rows to projects: getRolesForUser may be a DM's subset.
    const [userRoles, allActivity, allPlacements, allRejections, tpMap, allHeadcount, projects, allRoles] = await Promise.all([
      getRolesForUser(getCurrentUser().email),
      getWeeklyActivity(null, null),
      getPlacements(null),
      getRejectedOffers(null),
      getTalentPartnerDisplayMap(),
      getAllHeadcount().catch(e => { console.warn('N-310: headcount read failed', e); return null; }),
      getProjects(false),
      getAllRoles(),
    ]);
    const { roles, activity, placements, rejections, headcount } = excludeInternalProjectData(
      { roles: userRoles, activity: allActivity, placements: allPlacements, rejections: allRejections, headcount: allHeadcount },
      { projects, roles: allRoles });
    // N-385: the SLA roll-up is read and computed only when the report has that module.
    const slaRollup = (_rbBlocks.some(b => b.type === 'panel' && b.key === 'slaRollup') && canViewSlaRollupReport(_resolvedRole))
      ? await rbLoadSlaRollup()
      : undefined;
    // N-388: Rejection Intelligence inputs, read only when the report has that module.
    const rejectionIntel = (_rbBlocks.some(b => b.type === 'panel' && b.key === 'rejectionIntel') && canViewRejectionIntelReport(_resolvedRole))
      ? await rbLoadRejectionIntel()
      : undefined;
    return { roles, activity, placements, rejections, tpMap, hc: dashboardHeadcountContext(roles, placements, headcount), slaRollup, rejectionIntel };
  }
}

// N-385: the SLA Roll-up module's model for the current user (Admin / Leadership all projects, a DM
// their own - scoped inside getSlaRollupInputs). null = the read failed: the module prints its
// unavailable line and every other block still renders.
async function rbLoadSlaRollup() {
  try {
    const inputs = await getSlaRollupInputs(getCurrentUser().email, { role: _resolvedRole });
    const today = new Date();
    const results = slaProjectResults(Object.assign({}, inputs, { today }));
    return slaRollupModel({ projects: inputs.projects, results, today });
  } catch (e) {
    console.warn('N-385: SLA roll-up read failed', e);
    return null;
  }
}

// N-388: the Rejection Intelligence module's inputs for the current user (Admin / Leadership all
// projects, a DM their own - scoped inside getRejectionIntelInputs). Un-windowed: the panel cuts them
// by the report's period. null = the read failed: the module prints its unavailable line and every
// other block still renders.
async function rbLoadRejectionIntel() {
  try {
    return await getRejectionIntelInputs(getCurrentUser().email, { weeks: 0, role: _resolvedRole });
  } catch (e) {
    console.warn('N-388: Rejection Intelligence read failed', e);
    return null;
  }
}


// N-302b: the config inputs (title, periods, Gantt toggle) write straight to
// module state. One action with a fixed key -> setter map, so markup can only
// reach these four fields.
const _RB_OPTION_SETTERS = {
  includeGantt: v => { _rbIncludeGantt = v; },
  title:        v => { _rbTitle = v; },
  period:       v => { _rbPeriod = v; },
  kpiPeriod:    v => { _rbKpiPeriod = v; },
};
function rbSetOption(key, value) {
  if (Object.prototype.hasOwnProperty.call(_RB_OPTION_SETTERS, key)) _RB_OPTION_SETTERS[key](value);
}

function rbClosePreview() {
  document.getElementById('rb-preview-modal').style.display = 'none';
}

async function rbPreview() {
  const modal = document.getElementById('rb-preview-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="rb-preview-inner">
    <div class="rb-preview-toolbar">
      <button class="print-btn"${act('rbExportPdf')}>&#8856; Export PDF</button>
      <button class="btn-secondary"${act('rbClosePreview')}>
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
  // ganttOpts: { coeRows, headcount, forPrint } — appended final page (N-318: Planned vs Actual Role Opens chart + table)
  // N-330: with the title page on, the cover + Newton bar replace the <h2>.
  const titleHtml = rbTitlePageOn()
    ? rbRenderTitlePageHtml(title) + rbPrintBandHtml()
    : `<div class="rb-report-title"><h2>${escHtml(title)}</h2></div>`;

  const blocks = _rbBlocks.map(block => {
    if (block.type === 'panel') {
      if (block.key === 'candidateSnapshot') {
        const liveRoles = data.roles
          .filter(r => isOpenPipelineStage(r.Stage))
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
        Planned vs Actual Role Opens — renders as a landscape final page on PDF export</div>`;
    } else if (ganttOpts.coeRows?.length) {
      // N-318: summary + chart + month-across table — no Gantt. An unread headcount
      // (null) prints a message, never zero-filled actuals (N-312 degrade rule).
      const opensHtml = Array.isArray(ganttOpts.headcount)
        ? `<div class="rb-opens-layout">${coeOpensBlockHtml(ganttOpts.coeRows, ganttOpts.headcount, { summary: true, horizontal: true })}</div>`
        : `<p class="no-data">Couldn't load this project's headcount — actual opens aren't available. Export again to retry.</p>`;
      ganttHtml = `<div class="rb-hiring-plan-page">
        <div class="dash-panel rb-hiring-plan-panel">
          <h3 class="panel-title">Planned vs Actual Role Opens</h3>
          ${opensHtml}
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

  // Fetch plan rows + headcount only when the Hiring Plan page is enabled (N-318).
  // A failed headcount read degrades to null: the page prints a message, not zero opens.
  const wantPlan = _rbIncludeGantt && _rbScope === 'project' && _rbProjectId;
  const [coeRows, headcount] = wantPlan
    ? await Promise.all([
        getCoEPlanRows(_rbProjectId),
        getHeadcountForProject(_rbProjectId).catch(e => { console.warn('N-318: headcount read failed', e); return null; }),
      ])
    : [[], null];

    // Use existing printPage() — sets print-header title/sub and calls window.print()
  const main = document.getElementById('main-content');
  const withCover = rbTitlePageOn();
  if (withCover) document.body.classList.add('rb-printing');
  main.innerHTML = rbRenderReportHtml(title, data, { forPrint: true, coeRows, headcount });
  // N-330: the cover's logo and swirl must have loaded before window.print()
  // snapshots the page — the same cold-cache trap as the Briefing Pack cover.
  if (withCover) await bpAwaitArtwork(main);
  printPage(title, true, 'Reporting');

  // Restore builder after print dialog closes
  setTimeout(() => {
    document.body.classList.remove('rb-printing');
    renderReportBuilder();
  }, 500);
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
    // Markers, not blocks: hiringPlan (N-318) and titlePage (N-330).
    ModuleOrder: JSON.stringify([
      ..._rbBlocks,
      ...(_rbIncludeGantt ? [{ type: 'hiringPlan' }] : []),
      ...(rbTitlePageOn() ? [{ type: 'titlePage' }] : []),
    ]),
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
    main.innerHTML = pageErrorBlock({ message: e.message, retryAct: ['showReportBuilderLibrary'] });
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
          const periodLabel = (DETAIL_PERIOD_OPTIONS.find(([k]) => k === r.Period) || [])[1] || r.Period || '—';
          return reportLibraryRowHtml({
            title: r.Title || '—', detail: periodLabel,
            ownerLabel: _rbTpMap[owner.toLowerCase()] || owner || '—',
            canDelete: isAdmin || owner.toLowerCase() === me,
            acts: {
              open: act('rbLoadReport', Number(r.id)),
              copy: act('rbCopyReportAction', Number(r.id), ACT_EL),
              del:  act('rbDeleteReport', Number(r.id), r.Title || ''),
            },
          });
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
      <h2>Report Library</h2>
      <div class="page-header-actions">
        <button class="btn-primary"${act('rbStartNewReport')}>+ New Report</button>
      </div>
    </div>
    <div class="table-toolbar">
      ${listControlsBar([`
        <div class="form-group project-filter-select">
          <label>Client</label>
          <select${actOn('change', 'rbLibraryFilterChanged', ACT_VALUE)}>${_rbLibraryClientOptions()}</select>
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
  _rbIncludeTitlePage = false;
  _rbClientLogo       = '';
  _rbClientLogoName   = '';
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
  _rbIncludeTitlePage = _loadedBlocks.some(b => b.type === 'titlePage');
  _rbBlocks     = _loadedBlocks.filter(b => b.type !== 'hiringPlan' && b.type !== 'titlePage');
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

// N-302a: delegated actions this file owns that shared markup calls (js/actions.js).
// Later N-302 sub-tasks add their own names to this call; never register a name twice.
registerActions({
  rbFormat,
  rbFormatBlock,
  showReportBuilderLibrary,
  // N-302b: library, editor header, sidebar and canvas controls.
  rbSaveReport,
  rbPreview,
  rbClosePreview,
  rbExportPdf,
  rbSetOption,
  rbSetScope,
  rbSetProject,
  rbSetRole,
  rbAddPanelBlock,
  rbAddTextBlock,
  rbRemoveBlock,
  rbUpdateTextBlock,
  rbUpdateSnapshotValue,
  rbUpdateToolbarState,
  rbLoadReport,
  rbCopyReportAction,
  rbDeleteReport,
  rbStartNewReport,
  rbLibraryFilterChanged,
  // N-330: title page + shared client logo.
  rbSetTitlePage,
  rbUploadClientLogo,
  rbRemoveClientLogo,
  });
