// js/briefing-pack.js
// Candidate role briefing packs — N-211, phase 1.
//
// Reached from the "+ Briefing Pack" button in the Roles page header, which
// since N-235 lands on the LIBRARY (showBriefingPackLibrary) — the builder is
// only opened from a library row or the library's own "+ Briefing Pack"
// button. Both are deliberately NOT router pages: no PAGES entry, no sidebar
// link, no nav.js case — the same direct-render pattern as
// showBulkActivityPage(). Access is inherited from the Roles page (Admin,
// Delivery Manager, Talent Partner); the library then scopes rows by owner /
// DM project assignment / Admin-sees-all.
//
// Phase 1 is PDF-only. The export is the ONLY portrait export in Newton —
// printPage(title, false, ...) requests no @page override, so the global
// `@page { size: A4 portrait; }` applies. See N-202 (print migration).

let _bpPages        = [];    // Ordered page objects; title first, closing last
let _bpPackId       = null;  // SharePoint item ID when editing a saved pack
let _bpProjects     = [];
let _bpProjectId    = null;
let _bpRoleId       = '';
let _bpProjectRoles = [];
let _bpTpMap        = {};
let _bpTitle        = '';
let _bpClientName   = '';
let _bpRoleTitle    = '';
let _bpLocation     = '';
let _bpContactName  = '';
let _bpContactTitle = '';
let _bpContactEmail = '';
let _bpCoverDate    = '';    // YYYY-MM text — never a Date (BST shift)
let _bpClientLogo     = '';  // data: URI, held against the PROJECT not the pack
let _bpClientLogoName = '';

// Library state (N-235)
let _bpLibraryCache  = [];   // packs visible to this user, from the last load
let _bpLibraryFilter = '';   // '' = all clients
let _bpProjectMap    = {};   // projectId (string) -> CustomerName, for banding

function bpUid() { return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

function bpCurrentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function bpMonthLabel(ym) {
  const parts = String(ym || '').split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!y || !m) return '';
  return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

function bpDefaultPages() {
  return [
    { id: bpUid(), type: 'title',   subtitle: '' },
    { id: bpUid(), type: 'closing' },
  ];
}

// ── Entry point — the library (N-235) ─────────────────────────────────
async function showBriefingPackLibrary() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="page-header"><h2>Briefing Pack Library</h2></div><p>Loading...</p>';

  try {
    const user = getCurrentUser();
    // getProjects(false) deliberately — a Leadership user sees packs for
    // projects they hold no UserAssignments row for, and a scoped project list
    // would leave those bands unnamed.
    const [packs, projects, projectIds, tpMap] = await Promise.all([
      getBriefingPacks(),
      getProjects(false),
      getUserProjectIds(user.email),
      getTalentPartnerDisplayMap(),
    ]);
    _bpProjectMap = {};
    projects.forEach(p => { _bpProjectMap[String(p.id)] = p.CustomerName || ''; });
    _bpTpMap = tpMap;
    _bpLibraryCache = _bpVisiblePacks(packs, projectIds, user.email);
    _bpRenderLibrary();
  } catch (e) {
    main.innerHTML = pageErrorBlock({ message: e.message, retryOnClick: 'showBriefingPackLibrary()' });
    if (window.lucide) lucide.createIcons();
  }
}

// Admin/Leadership see everything; a DM sees their own packs plus any pack on a
// project assigned to them; everyone else sees only their own.
// getUserProjectIds() returns null for an admin ("all") and is ghost-aware.
function _bpVisiblePacks(packs, projectIds, email) {
  const me = (email || '').toLowerCase();
  if (_resolvedRole === 'admin' || _resolvedRole === 'leadership') return packs;
  const ids = projectIds || [];
  const mine = p => (p.PackOwner || '').toLowerCase() === me;
  if (_resolvedRole === 'delivery_manager') {
    return packs.filter(p => mine(p) || ids.includes(String(p.ProjectID)));
  }
  return packs.filter(mine);
}

// One resolver for grouping, filter options and filter matching, so all three
// agree. The linked project's customer name wins over the pack's free-text
// ClientName, so "Diamant" and "Diamant Software" band together.
function _bpPackClient(pack) {
  return _bpProjectMap[String(pack.ProjectID)] || pack.ClientName || 'Unassigned';
}

function bpLibraryFilterChanged(value) {
  _bpLibraryFilter = value;
  _bpRenderLibrary();   // re-render from cache, no refetch
}

function _bpLibraryClientOptions() {
  const values = [...new Set(_bpLibraryCache.map(_bpPackClient))].sort((a, b) => a.localeCompare(b));
  return ['<option value="">All</option>'].concat(values.map(v =>
    `<option value="${escAttr(v)}"${v === _bpLibraryFilter ? ' selected' : ''}>${escHtml(v)}</option>`
  )).join('');
}

function _bpRenderLibrary() {
  const me      = (getCurrentUser().email || '').toLowerCase();
  const isAdmin = _resolvedRole === 'admin';
  const packs   = _bpLibraryCache.filter(p => !_bpLibraryFilter || _bpPackClient(p) === _bpLibraryFilter);

  const groups = {};
  packs.forEach(p => {
    const client = _bpPackClient(p);
    (groups[client] = groups[client] || []).push(p);
  });

  const rows = packs.length
    ? Object.keys(groups).sort((a, b) => a.localeCompare(b)).map(client => {
        const list = groups[client].slice().sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
        const packRows = list.map(p => {
          const owner = p.PackOwner || '';
          const canDelete = isAdmin || owner.toLowerCase() === me;
          return `
        <tr>
          <td>${escHtml(p.Title || '—')}</td>
          <td>${escHtml(p.RoleTitle || '—')}</td>
          <td>${escHtml(p.RoleLocation || '—')}</td>
          <td>${escHtml(_bpTpMap[owner.toLowerCase()] || owner || '—')}</td>
          <td>
            <div class="row-actions">
              <button class="btn-secondary" onclick="bpLoadPack(${p.id})">Open</button>
              <button class="btn-secondary" onclick="bpCopyPackAction(${p.id}, this)">Copy</button>
              ${canDelete ? `<button class="btn-secondary" onclick="bpDeletePack(${p.id}, '${escJsAttr(p.Title || '')}')">Delete</button>` : ''}
            </div>
          </td>
        </tr>`;
        }).join('');
        return `
        <tr class="bp-lib-client-row">
          <td colspan="5"><strong>${escHtml(client)}</strong> <span class="bp-lib-count">${list.length}</span></td>
        </tr>${packRows}`;
      }).join('')
    : emptyStateRow({
        colspan: 5,
        icon: 'folder',
        message: _bpLibraryCache.length
          ? 'No packs match the current filter.'
          : 'No briefing packs saved yet.',
      });

  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <h2>Briefing Pack Library</h2>
      <div class="page-header-actions">
        <button class="btn-secondary" onclick="navigateTo('roles')">&larr; Back to Roles</button>
        <button class="btn-primary" onclick="bpStartNewPack()">+ Briefing Pack</button>
      </div>
    </div>
    <div class="table-toolbar">
      ${listControlsBar([`
        <div class="form-group project-filter-select">
          <label>Client</label>
          <select onchange="bpLibraryFilterChanged(this.value)">${_bpLibraryClientOptions()}</select>
        </div>`])}
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>
          <th>Pack Name</th><th>Role</th><th>Location</th><th>Owner</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function bpCopyPackAction(id, btn) {
  setButtonLoading(btn);
  try {
    const copy = await copyBriefingPack(id, getCurrentUser().email);
    await bpLoadPack(copy.id);
  } catch (e) {
    toast('Could not copy that pack: ' + e.message, { type: 'error' });
  } finally {
    clearButtonLoading(btn);
  }
}

// ── Builder ───────────────────────────────────────────────────────────
async function bpStartNewPack() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="page-header"><h2>Briefing Pack</h2></div><p>Loading...</p>';

  _bpPackId       = null;
  _bpPages        = bpDefaultPages();
  _bpTitle        = '';
  _bpRoleId       = '';
  _bpClientName   = '';
  _bpRoleTitle    = '';
  _bpLocation     = '';
  _bpContactName  = '';
  _bpContactTitle = '';
  _bpContactEmail = '';
  _bpCoverDate    = bpCurrentMonth();

  const user = getCurrentUser();
  _bpProjects = await getScopedProjects(user.email, false);
    if (_bpProjects.length && !_bpProjectId) _bpProjectId = String(_bpProjects[0].id);
  _bpTpMap = await getTalentPartnerDisplayMap();
  await bpLoadRoles();
  await bpLoadClientLogo();
  bpApplyRoleAutofill();
  bpRender();
}

async function bpLoadRoles() {
  if (!_bpProjectId) { _bpProjectRoles = []; return; }
    const tpEmail = _resolvedRole === 'talent_partner' ? getScopedUserEmail() : null;
  _bpProjectRoles = await getRolesForProject(_bpProjectId, tpEmail);
  if (_bpRoleId && !_bpProjectRoles.some(r => String(r.id) === String(_bpRoleId))) _bpRoleId = '';
}

// ── Client logo (N-214) ───────────────────────────────────────────────
// Stored against the project, so uploading it once serves every pack built
// for that client. Never written into a BriefingPacks row.
async function bpLoadClientLogo() {
  _bpClientLogo = '';
  _bpClientLogoName = '';
  if (!_bpProjectId) return;
  const row = await getClientLogo(_bpProjectId);
  if (row && String(row.LogoData || '').startsWith('data:image/')) {
    _bpClientLogo     = row.LogoData;
    _bpClientLogoName = row.LogoName || '';
  }
}

async function bpUploadClientLogo(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!_bpProjectId) {
    toast('Select a project before uploading a logo.', { type: 'error' });
    input.value = '';
    return;
  }
  const max = CONFIG.BRIEFING_PACK.CLIENT_LOGO_MAX_BYTES;
  if (file.size > max) {
    toast(`Logo must be under ${Math.round(max / 1024)} KB — that file is ${Math.round(file.size / 1024)} KB.`,
          { type: 'error' });
    input.value = '';
    return;
  }

  let dataUri = '';
  try {
    dataUri = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload  = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  } catch (e) {
    toast('Could not read that file.', { type: 'error' });
    input.value = '';
    return;
  }
  // Only ever store an image data URI — nothing else reaches an <img src>.
  if (!dataUri.startsWith('data:image/')) {
    toast('That file is not an image.', { type: 'error' });
    input.value = '';
        return;
  }

  // Never fail silently. The first version swallowed the Graph rejection
  // inside this async onchange handler, so a logo that never saved looked
  // exactly like one that did — no row, no error, nothing to go on.
  try {
    await upsertClientLogo(_bpProjectId, dataUri, file.name);
  } catch (e) {
    toast(`Could not save the logo: ${e.message || e}`, { type: 'error' });
    input.value = '';
    return;
  }
  _bpClientLogo     = dataUri;
  _bpClientLogoName = file.name;
  document.getElementById('bp-sidebar').innerHTML = bpRenderSidebar();
  toast('Client logo saved for this project.');
}

async function bpRemoveClientLogo() {
  if (!_bpProjectId) return;
  if (!(await confirmModal({
    message: 'Remove the client logo for this project? Every pack for this client loses it.',
    confirmLabel: 'Remove', danger: true,
  }))) return;
  await deleteClientLogo(_bpProjectId);
  _bpClientLogo = '';
  _bpClientLogoName = '';
  document.getElementById('bp-sidebar').innerHTML = bpRenderSidebar();
}

// Momentum x Client lockup. With no logo uploaded the chip carries the client
// NAME, so the lockup always renders and never shows a broken image.
// Mirrors the Momentum lockup's own structure — mark then wordmark — so the two
// sides balance: [MG symbol + name]  x  [square logo tile + client name].
// The tile is square by design; a roughly square client logo sits in it best.
// With no logo the name stands alone and no empty tile is drawn.
function bpLockupHtml() {
  const tile = _bpClientLogo
    ? `<span class="bp-lockup-chip"><img class="bp-lockup-logo"
         src="${escAttr(_bpClientLogo)}" alt="${escAttr(_bpClientName || 'Client')}"></span>`
    : '';
  return `<div class="bp-lockup">
    <img class="bp-lockup-mg" src="momentum-symbol-and-name-global-white.png" alt="Momentum Global">
    <span class="bp-lockup-x">&times;</span>
    <span class="bp-lockup-client">
      ${tile}<span class="bp-lockup-client-name">${escHtml(_bpClientName || 'Client')}</span>
    </span>
  </div>`;
}

// Pre-populate the header fields from the selected project/role. Every value
// stays editable afterwards — this only ever fires on a project/role change.
function bpApplyRoleAutofill() {
  const project = _bpProjects.find(p => String(p.id) === String(_bpProjectId));
  _bpClientName = project ? (project.CustomerName || '') : '';

  const role = _bpProjectRoles.find(r => String(r.id) === String(_bpRoleId));
  _bpRoleTitle = role ? (role.RoleTitle || '') : '';
  _bpLocation  = role ? (role.Location  || '') : '';

  // TalentPartner can carry more than one email; the pack has one contact.
  const tpEmail = String((role && role.TalentPartner) || '').split(/[;,]/)[0].trim();
  if (tpEmail) {
    _bpContactName  = _bpTpMap[tpEmail.toLowerCase()] || '';
    _bpContactEmail = tpEmail;
  }
  if (!_bpContactTitle) _bpContactTitle = CONFIG.BRIEFING_PACK.DEFAULT_CONTACT_TITLE;
  if (!_bpTitle && _bpRoleTitle) _bpTitle = _bpRoleTitle + ' — Candidate Briefing Pack';
}

// ── Render ────────────────────────────────────────────────────────────
function bpRender() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <h2>Briefing Pack</h2>
      <div class="page-header-actions">
        <button class="btn-secondary" onclick="showBriefingPackLibrary()">&larr; Back to Library</button>
        <button class="btn-secondary" id="bp-save-btn" onclick="bpSavePack()">Save</button>
        <button class="btn-secondary" onclick="bpPreview()">Preview</button>
        <button class="print-btn"     onclick="bpExportPdf()">&#8856; Export PDF</button>
      </div>
    </div>
    <div class="rb-shell">
      <div class="rb-sidebar" id="bp-sidebar">${bpRenderSidebar()}</div>
      <div class="rb-canvas"  id="bp-canvas">${bpRenderCanvas()}</div>
    </div>
    <div id="bp-preview-modal" class="rb-modal" style="display:none"></div>
  `;
  bpInitSortable();
}

function bpRenderSidebar() {
  const sorted  = sortProjectsByName(_bpProjects);
  const active  = sorted.filter(isProjectActive);
  const archive = sorted.filter(p => !isProjectActive(p));
  const projectOpts = [
    active.length  ? `<optgroup label="Active">${buildProjectOptionsHtml(active, _bpProjectId)}</optgroup>`   : '',
    archive.length ? `<optgroup label="Archive">${buildProjectOptionsHtml(archive, _bpProjectId)}</optgroup>` : '',
  ].join('');

  const roleOpts = ['<option value="">Select a role...</option>']
    .concat(_bpProjectRoles.map(r => {
      const label = escHtml(r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle);
      return `<option value="${r.id}" ${String(r.id) === String(_bpRoleId) ? 'selected' : ''}>${label}</option>`;
    })).join('');

  return `
    <div class="rb-sidebar-scroll">
    <div class="rb-config">
      <div class="rb-section-label">Project</div>
      <select class="rb-select" onchange="bpSetProject(this.value)">${projectOpts}</select>

      
      <div class="rb-section-label">Role</div>
      <select class="rb-select" onchange="bpSetRole(this.value)">${roleOpts}</select>

      <div class="rb-section-label">Client Logo</div>
      <div class="bp-logo-control">
        ${_bpClientLogo
          ? `<img class="bp-logo-thumb" src="${escAttr(_bpClientLogo)}" alt="${escAttr(_bpClientLogoName || 'Client logo')}">`
          : '<span class="bp-logo-empty">No logo uploaded</span>'}
        <input type="file" class="bp-logo-input" accept="image/png,image/jpeg,image/svg+xml"
          onchange="bpUploadClientLogo(this)">
        ${_bpClientLogo ? '<button class="btn-secondary btn-sm" onclick="bpRemoveClientLogo()">Remove</button>' : ''}
      </div>
      <p class="rb-footnote">Saved against the project and reused by every pack for this client.</p>

      <div class="rb-section-label">Pack Title</div>
      <input id="bp-title" class="rb-input" type="text" placeholder="Untitled Briefing Pack"
        value="${escAttr(_bpTitle)}" oninput="_bpTitle = this.value">

      <div class="rb-section-label">Client Name</div>
      <input class="rb-input" type="text" placeholder="Client"
        value="${escAttr(_bpClientName)}" oninput="_bpClientName = this.value">

      <div class="rb-section-label">Role Title</div>
      <input class="rb-input" type="text"
        value="${escAttr(_bpRoleTitle)}" oninput="_bpRoleTitle = this.value">

      <div class="rb-section-label">Location</div>
      <input class="rb-input" type="text"
        value="${escAttr(_bpLocation)}" oninput="_bpLocation = this.value">

      <div class="rb-section-label">Cover Date</div>
      <input class="rb-input" type="month"
        value="${escAttr(_bpCoverDate)}" oninput="_bpCoverDate = this.value">

      <div class="rb-section-label" style="margin-top:16px">Closing Page Contact</div>
      <input class="rb-input" type="text" placeholder="Name"
        value="${escAttr(_bpContactName)}" oninput="_bpContactName = this.value">
      <input class="rb-input" type="text" placeholder="Title"
        value="${escAttr(_bpContactTitle)}" oninput="_bpContactTitle = this.value">
      <input class="rb-input" type="email" placeholder="Email"
        value="${escAttr(_bpContactEmail)}" oninput="_bpContactEmail = this.value">
    </div>
    </div>

    <div class="rb-sidebar-footer">
      <div class="rb-section-label">Add Page</div>
      <button class="btn-secondary rb-full-btn" onclick="bpAddPage('section')">+ Content Section</button>
      <button class="btn-secondary rb-full-btn" onclick="bpAddPage('divider')">+ Divider</button>
      <p class="rb-footnote">The title and closing pages are always present and always first and last.</p>
    </div>
  `;
}

function bpRenderCanvas() {
  const title   = _bpPages.find(p => p.type === 'title');
  const closing = _bpPages.find(p => p.type === 'closing');
  const middle  = _bpPages.filter(p => p.type !== 'title' && p.type !== 'closing');

  const titleCard = `<div class="bp-block bp-block-fixed">
      <div class="bp-block-body">
        <span class="bp-block-tag">Title page</span>
        <input class="rb-input" type="text" placeholder="Subtitle (optional)"
          value="${escAttr(title ? title.subtitle : '')}"
          oninput="bpUpdatePage('${title ? title.id : ''}', 'subtitle', this.value)">
      </div>
    </div>`;

  const middleCards = middle.map(p => p.type === 'divider'
    ? `<div class="bp-block bp-block-divider" data-id="${p.id}">
        <span class="rb-drag-handle">&#9776;</span>
        <div class="bp-block-body">
          <span class="bp-block-tag">Divider page</span>
          <input class="rb-input" type="text" placeholder="Section break heading"
            value="${escAttr(p.heading || '')}"
            oninput="bpUpdatePage('${p.id}', 'heading', this.value)">
        </div>
        <button class="rb-remove-btn" onclick="bpRemovePage('${p.id}')">&#x2715;</button>
      </div>`
    : `<div class="bp-block bp-block-section" data-id="${p.id}">
        <span class="rb-drag-handle">&#9776;</span>
        <div class="bp-block-body">
          <span class="bp-block-tag">Content section</span>
          <input class="rb-input" type="text" placeholder="Section heading"
            value="${escAttr(p.heading || '')}"
            oninput="bpUpdatePage('${p.id}', 'heading', this.value)">
          <div class="rb-rt-wrapper">
            <div class="rb-rt-toolbar">
              <button type="button" onclick="bpFormat('bold')"><b>B</b></button>
              <button type="button" onclick="bpFormat('italic')"><i>I</i></button>
              <button type="button" onclick="bpFormat('underline')"><u>U</u></button>
              <button type="button" onclick="bpFormat('insertUnorderedList')">&#8226; List</button>
              <button type="button" onclick="bpFormat('insertOrderedList')">1. List</button>
              <button type="button" onclick="bpFormatBlock('H3')">Heading</button>
              <button type="button" onclick="bpFormatBlock('P')">Body Text</button>
              ${rtTableToolbarButtonHtml()}
              ${rtCalloutToolbarButtonHtml()}
            </div>
            <div class="rb-richtext" contenteditable="true" data-id="${p.id}"
              oninput="bpUpdatePage('${p.id}', 'content', this.innerHTML)"
              onkeyup="bpUpdateToolbarState()"
              onmouseup="bpUpdateToolbarState()">${p.content || ''}</div>
          </div>
        </div>
        <button class="rb-remove-btn" onclick="bpRemovePage('${p.id}')">&#x2715;</button>
      </div>`).join('');

  const closingCard = `<div class="bp-block bp-block-fixed">
      <div class="bp-block-body">
        <span class="bp-block-tag">Closing page</span>
        <p class="rb-footnote">Contact name, title and email come from the panel on the left.
          ${closing ? '' : 'Missing — will be added on save.'}</p>
      </div>
    </div>`;

  const inner = middleCards || `<div class="rb-empty">
      Add content section or divider pages from the panel on the left.</div>`;

  return titleCard + `<div id="bp-sortable">${inner}</div>` + closingCard;
}

function bpInitSortable() {
  const el = document.getElementById('bp-sortable');
  if (!el || typeof Sortable === 'undefined') return;
  Sortable.create(el, {
    handle: '.rb-drag-handle',
    animation: 150,
    onEnd() {
      const ids     = [...el.querySelectorAll('.bp-block')].map(b => b.dataset.id);
      const title   = _bpPages.find(p => p.type === 'title');
      const closing = _bpPages.find(p => p.type === 'closing');
      const middle  = ids.map(id => _bpPages.find(p => p.id === id)).filter(Boolean);
      _bpPages = [title, ...middle, closing].filter(Boolean);
    }
  });
}

// ── Page model ────────────────────────────────────────────────────────
function bpUpdatePage(id, key, value) {
  const page = _bpPages.find(p => p.id === id);
  if (page) page[key] = value;
}

// ── Rich-text primitives (moved from utils.js, N-237d) — single consumer,
// this toolbar only ─────────────────────────────────────────────────
function rtFormat(cmd) {
  document.execCommand(cmd, false, null);
}

function rtFormatBlock(tag) {
  document.execCommand('formatBlock', false, tag);
}

// Callout block (N-213). Briefing-pack toolbar only — .bp-callout is a
// briefing-pack visual, and offering it in the shared toolbar would leak an
// unstyled class into the Report Builder, Market Report and LCI exports.
function rtCalloutToolbarButtonHtml() {
  return '<button type="button" title="Insert callout block"'
       + ' onmousedown="event.preventDefault()"'
       + ' onclick="rtWrapCallout()">&#9776; Callout</button>';
}

// Wrap the selection (or insert a placeholder) as a callout. Same caret
// requirement, same input-event dispatch as Report Builder's rtInsertTable
// (still shared, stays in utils.js).
function rtWrapCallout() {
  const sel = window.getSelection();
  const node = sel && sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
  const host = node && (node.nodeType === 1 ? node : node.parentElement);
  const editor = host && host.closest ? host.closest('.rb-richtext') : null;
  if (!editor) {
    toast('Click inside the text area first, then add a callout.', { type: 'error' });
    return false;
  }

  const selected = sel.toString();
  const inner = selected ? escHtml(selected) : 'Key facts&hellip;';
  document.execCommand('insertHTML', false,
    '<div class="bp-callout"><p>' + inner + '</p></div><p><br></p>');
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

// Rich-text toolbar wrappers (N-228) — mirrors Report Builder's rbFormat/
// rbFormatBlock/rbUpdateToolbarState. Multi-instance like Report Builder
// (several content sections can be open on the canvas at once), so state
// is scoped to whichever section currently has focus, never globally.
function bpFormat(cmd) {
  rtFormat(cmd);
  bpUpdateToolbarState();
}

function bpFormatBlock(tag) {
  rtFormatBlock(tag);
  bpUpdateToolbarState();
}

function bpUpdateToolbarState() {
  const toolbar = document.activeElement?.closest('.bp-block-section')?.querySelector('.rb-rt-toolbar');
  rtUpdateToolbarState(toolbar, 'bpFormat', 'bpFormatBlock');
}

function bpAddPage(type) {
  const page = { id: bpUid(), type, heading: '', content: '' };
  const closingIdx = _bpPages.findIndex(p => p.type === 'closing');
  _bpPages.splice(closingIdx === -1 ? _bpPages.length : closingIdx, 0, page);
  document.getElementById('bp-canvas').innerHTML = bpRenderCanvas();
  bpInitSortable();
}

function bpRemovePage(id) {
  const page = _bpPages.find(p => p.id === id);
  if (!page || page.type === 'title' || page.type === 'closing') return;
  _bpPages = _bpPages.filter(p => p.id !== id);
  document.getElementById('bp-canvas').innerHTML = bpRenderCanvas();
  bpInitSortable();
}

async function bpSetProject(val) {
    _bpProjectId = val || null;
  _bpRoleId    = '';
  await bpLoadRoles();
  await bpLoadClientLogo();
  bpApplyRoleAutofill();
  document.getElementById('bp-sidebar').innerHTML = bpRenderSidebar();
}

function bpSetRole(val) {
  _bpRoleId = val || '';
  bpApplyRoleAutofill();
  document.getElementById('bp-sidebar').innerHTML = bpRenderSidebar();
}

// ── Output ────────────────────────────────────────────────────────────
// Footer wording is fixed; only the client name varies. Falls back to the
// client-free variant so a pack with no client never prints a stray "for".
function bpConfidentialText() {
  const cfg = CONFIG.BRIEFING_PACK;
  const client = (_bpClientName || '').trim();
  return client
    ? cfg.CONFIDENTIAL_TEXT.replace('{client}', client)
    : cfg.CONFIDENTIAL_TEXT_NO_CLIENT;
}

// Cover: logo top, flexible spacer, title block anchored to the lower third.
// The swirl graphic is a CSS layer on .bp-page-title, not markup.
function bpRenderTitlePageHtml(page) {
  const sub = page && page.subtitle ? page.subtitle : '';
  return `<section class="bp-page bp-page-full bp-page-title">
    ${bpLockupHtml()}
    <div class="bp-cover-spacer"></div>
    <div class="bp-cover-block">
      <h1 class="bp-cover-title">${escHtml(_bpTitle || 'Candidate Briefing Pack')}</h1>
      ${sub ? `<p class="bp-cover-subtitle">${escHtml(sub)}</p>` : ''}
      <span class="bp-cover-rule"></span>
      <p class="bp-cover-role">${escHtml(_bpRoleTitle)}${_bpLocation ? ' &middot; ' + escHtml(_bpLocation) : ''}</p>
      <p class="bp-cover-partner">Momentum Global in partnership with ${escHtml(_bpClientName)}</p>
      <p class="bp-cover-date">${escHtml(bpMonthLabel(_bpCoverDate))}</p>
    </div>
    <p class="bp-page-conf">${escHtml(bpConfidentialText())}</p>
    </section>`;
}

// Closing page mirrors the cover exactly: lockup top, spacer, contact block in
// the lower third, swirl centred behind, confidential line at the foot.
function bpRenderClosingPageHtml() {
  return `<section class="bp-page bp-page-full bp-page-closing">
    ${bpLockupHtml()}
    <div class="bp-cover-spacer"></div>
    <div class="bp-cover-block">
      <h2 class="bp-closing-heading">Your Key Contact</h2>
      <span class="bp-cover-rule"></span>
      <p class="bp-contact-name">${escHtml(_bpContactName)}</p>
      <p class="bp-contact-title">${escHtml(_bpContactTitle)}</p>
      <p class="bp-contact-email">${escHtml(_bpContactEmail)}</p>
      <p class="bp-closing-partner">Momentum Global in partnership with ${escHtml(_bpClientName)}</p>
    </div>
    <p class="bp-page-conf">${escHtml(bpConfidentialText())}</p>
  </section>`;
}

// Section content is authored HTML from the same trusted contenteditable path
// as Report Builder text blocks and Market Report observations, and is
// injected raw for the same reason. Every other field is escaped.
function bpRenderPackHtml() {
  const cfg = CONFIG.BRIEFING_PACK;
  const contents = [];
  let dividerNo = 0;

  const pages = _bpPages.map(p => {
    if (p.type === 'title')   return { full: true, html: bpRenderTitlePageHtml(p) };
    if (p.type === 'closing') return { full: true, html: bpRenderClosingPageHtml() };
    if (p.type === 'divider') {
      // Printed numeral comes from a CSS counter so reordering renumbers for
      // free; this JS count exists only to label the contents page.
      dividerNo += 1;
      contents.push({
        kind: 'divider',
                num: String(dividerNo).padStart(2, '0'),
        heading: p.heading || '',
      });
      return { full: true, html: `<section class="bp-page bp-page-full bp-page-divider">
        <div class="bp-divider-inner">
          <h2 class="bp-divider-heading">${escHtml(p.heading || '')}</h2>
        </div>
        <p class="bp-page-conf">${escHtml(bpConfidentialText())}</p>
      </section>` };
    }
    if (p.heading) contents.push({ kind: 'section', heading: p.heading });
    // A tile, not a page (N-214): sections share pages and break-inside:avoid
    // moves one that does not fit whole onto the next page. Deliberately not
    // .bp-page, so it carries no break-after — dividers and the contents page
    // still force a new page, which is what makes a divider mean something.
    return { full: false, html: `<article class="bp-section-tile">
      ${p.heading ? `<h2 class="bp-section-heading">${escHtml(p.heading)}</h2>` : ''}
      <div class="bp-section-body">${p.content || ''}</div>
    </article>` };
  });

  // Contents page — generated, never a page object, never saved. Headings
  // only: a flowing document cannot carry honest page numbers.
  if (contents.length) {
    const rows = contents.map(c => c.kind === 'divider'
            ? `<li class="bp-contents-item--divider"><span class="bp-contents-num">${escHtml(c.num)}</span>${escHtml(c.heading)}</li>`
      : `<li class="bp-contents-item--section">${escHtml(c.heading)}</li>`).join('');
    const coverIdx = _bpPages.findIndex(p => p.type === 'title');
    pages.splice(coverIdx + 1, 0, { full: false, html: `<section class="bp-page-contents">
      <h2 class="bp-section-heading">${escHtml(cfg.CONTENTS_HEADING)}</h2>
      <ul class="bp-contents-list">${rows}</ul>
    </section>` });
  }

  // Flowing content goes inside a table per contiguous run: thead repeats the
    // running header on every page AND reserves its space, tfoot reserves space
  // above the fixed confidential footer. Full-bleed pages stay outside the
  // tables, which is why no running header can ever appear on one.
  // Confidential line rides in the SAME thead band as the running header.
  // Chrome repeats a thead on every page and reserves its space, and it is the
  // only band that does: a tfoot renders once, on the last page of a run, and
  // a fixed element places unpredictably in this document (N-213 F2, N-214 QA).
  const runhead = `<div class="bp-runhead">
      <span>${escHtml(_bpRoleTitle)}</span><span>${escHtml(_bpClientName)}</span>
    </div>
    <div class="bp-confidential">${escHtml(bpConfidentialText())}</div>`;
  const out = [];
  let run = [];
  const flushRun = () => {
    if (!run.length) return;
    out.push(`<table class="bp-flow">
      <thead><tr><td>${runhead}</td></tr></thead>
      <tbody><tr><td>${run.join('')}</td></tr></tbody>
    </table>`);
    run = [];
  };
  pages.forEach(item => {
    if (item.full) { flushRun(); out.push(item.html); }
    else run.push(item.html);
  });
  flushRun();

  return `<div class="bp-pack" style="--bp-measure:${cfg.MEASURE_CH}ch;--bp-swirl-opacity:${cfg.SWIRL_OPACITY}">${out.join('')}</div>`;
}

function bpPreview() {
  const modal = document.getElementById('bp-preview-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="rb-preview-inner">
    <div class="rb-preview-toolbar">
      <button class="print-btn" onclick="bpExportPdf()">&#8856; Export PDF</button>
      <button class="btn-secondary"
        onclick="document.getElementById('bp-preview-modal').style.display='none'">Close</button>
    </div>
    <div id="bp-preview-content">${bpRenderPackHtml()}</div>
  </div>`;
}

// Portrait — printPage's second argument stays false so no @page override is
// added and the global A4 portrait rule applies. This is the only portrait
// export in Newton; see N-202.
// The cover and closing swirl is a CSS background image, and window.print()
// snapshots the page immediately. On a cold cache — exactly the state a hard
// refresh leaves the browser in — the print can be taken before that artwork
// has loaded, producing brand pages with no swirl and no error anywhere.
// Wait for every <img> in the pack and for the swirl itself before printing,
// with a ceiling so a missing asset can never block the export.
function bpAwaitArtwork(root) {
  const waits = [...root.querySelectorAll('img')].map(img =>
    img.complete
      ? Promise.resolve()
      : new Promise(res => { img.onload = img.onerror = res; }));

  waits.push(new Promise(res => {
    const probe = new Image();
    probe.onload = probe.onerror = res;
    probe.src = 'mg-visual-swirl-report.png';
  }));

  return Promise.race([
    Promise.all(waits),
    new Promise(res => setTimeout(res, 3000)),
  ]);
}

async function bpExportPdf() {
  const modal = document.getElementById('bp-preview-modal');
  if (modal) modal.style.display = 'none';
  document.body.classList.add('bp-printing');
  const main = document.getElementById('main-content');
  main.innerHTML = bpRenderPackHtml();
  await bpAwaitArtwork(main);
  printPage(_bpTitle || 'Briefing Pack', false, 'Reporting');
  setTimeout(() => {
    document.body.classList.remove('bp-printing');
    bpRender();
  }, 500);
}

// ── Save / library ────────────────────────────────────────────────────
async function bpSavePack() {
  const title = (_bpTitle || '').trim();
  if (!title) { toast('Please enter a pack title before saving.', { type: 'error' }); return; }

  const payload = {
    Title:        title,
    ProjectID:    _bpProjectId ? parseInt(_bpProjectId) : null,
    RoleID:       _bpRoleId    ? parseInt(_bpRoleId)    : null,
    ClientName:   _bpClientName,
    RoleTitle:    _bpRoleTitle,
    RoleLocation: _bpLocation,
    ContactName:  _bpContactName,
    ContactTitle: _bpContactTitle,
    ContactEmail: _bpContactEmail,
    CoverDate:    _bpCoverDate || bpCurrentMonth(),
    Pages:        JSON.stringify(_bpPages),
  };

  if (_bpPackId) {
    await updateBriefingPack(_bpPackId, payload);
  } else {
    payload.PackOwner = getCurrentUser().email.toLowerCase();
    const result = await createBriefingPack(payload);
    _bpPackId = result.id;
  }

  const btn = document.getElementById('bp-save-btn');
  if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => { btn.textContent = 'Save'; }, 2000); }
}

async function bpLoadPack(id) {
  const pack = await getBriefingPackById(id);
  _bpPackId       = id;
  _bpProjectId    = pack['ProjectID'] ? String(pack['ProjectID']) : null;
  _bpRoleId       = pack['RoleID']    ? String(pack['RoleID'])    : '';
  _bpTitle        = pack.Title        || '';
  _bpClientName   = pack.ClientName   || '';
  _bpRoleTitle    = pack.RoleTitle    || '';
  _bpLocation     = pack.RoleLocation || '';
  _bpContactName  = pack.ContactName  || '';
  _bpContactTitle = pack.ContactTitle || '';
  _bpContactEmail = pack.ContactEmail || '';
  _bpCoverDate    = pack.CoverDate    || bpCurrentMonth();

  let pages = [];
  try { pages = JSON.parse(pack.Pages || '[]'); } catch (e) { pages = []; }
  if (!pages.some(p => p.type === 'title'))   pages.unshift({ id: bpUid(), type: 'title', subtitle: '' });
  if (!pages.some(p => p.type === 'closing')) pages.push({ id: bpUid(), type: 'closing' });
  _bpPages = pages;

  await bpLoadRoles();
  await bpLoadClientLogo();
  bpRender();
}

async function bpDeletePack(id, title) {
  if (!(await confirmModal({
    message: `Delete "${title}"? This cannot be undone.`,
    confirmLabel: 'Delete', danger: true,
  }))) return;
  try {
    await deleteItem('BriefingPacks', id);
  } catch (e) {
    toast('Could not delete that pack: ' + e.message, { type: 'error' });
    return;
  }
  if (String(_bpPackId) === String(id)) _bpPackId = null;
  await showBriefingPackLibrary();
}
