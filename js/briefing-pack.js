// js/briefing-pack.js
// Candidate role briefing packs — N-211, phase 1.
//
// Reached from the "+ Briefing Pack" button in the Roles page header. It is
// deliberately NOT a router page: no PAGES entry, no sidebar link, no nav.js
// case — the same direct-render pattern as showBulkActivityPage(). Access is
// inherited from the Roles page (Admin, Delivery Manager, Talent Partner).
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

// ── Entry point ───────────────────────────────────────────────────────
async function showBriefingPackPage() {
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
        <button class="btn-secondary" onclick="navigateTo('roles')">&larr; Back to Roles</button>
        <button class="btn-secondary" onclick="bpOpenLibraryModal()">Pack Library</button>
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
    <div id="bp-library-modal" class="rb-modal" style="display:none"></div>
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
              <button type="button" onclick="rtFormat('bold')"><b>B</b></button>
              <button type="button" onclick="rtFormat('italic')"><i>I</i></button>
              <button type="button" onclick="rtFormat('underline')"><u>U</u></button>
              <button type="button" onclick="rtFormat('insertUnorderedList')">&#8226; List</button>
              <button type="button" onclick="rtFormat('insertOrderedList')">1. List</button>
              <button type="button" onclick="rtFormatBlock('H3')">Heading</button>
              <button type="button" onclick="rtFormatBlock('P')">Body Text</button>
              ${rtTableToolbarButtonHtml()}
              ${rtCalloutToolbarButtonHtml()}
            </div>
            <div class="rb-richtext" contenteditable="true" data-id="${p.id}"
              oninput="bpUpdatePage('${p.id}', 'content', this.innerHTML)">${p.content || ''}</div>
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
            ? `<li><span class="bp-contents-num">${escHtml(c.num)}</span>${escHtml(c.heading)}</li>`
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
function bpExportPdf() {
  const modal = document.getElementById('bp-preview-modal');
  if (modal) modal.style.display = 'none';
  document.body.classList.add('bp-printing');
  document.getElementById('main-content').innerHTML = bpRenderPackHtml();
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

async function bpOpenLibraryModal() {
  const modal = document.getElementById('bp-library-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="rb-modal-inner"><h3>Briefing Pack Library</h3><p>Loading...</p>
    <button class="btn-secondary"
      onclick="document.getElementById('bp-library-modal').style.display='none'">Close</button></div>`;

  const [packs, tpMap] = await Promise.all([getBriefingPacks(), getTalentPartnerDisplayMap()]);
  const currentUser = getCurrentUser();
  const isAdmin = _resolvedRole === 'admin';

  const rows = packs.length
    ? packs.map(p => {
        const owner = p.PackOwner || '';
        const ownerDisplay = tpMap[owner.toLowerCase()] || owner;
        const canEdit = isAdmin || owner.toLowerCase() === currentUser.email.toLowerCase();
        return `<div class="rb-saved-row">
          <span>${escHtml(p.Title)}</span>
          <span class="rb-saved-meta">${escHtml(ownerDisplay)}</span>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn-secondary btn-sm" onclick="bpLoadPack(${p.id})">Open</button>
            ${canEdit ? `<button class="btn-danger btn-sm"
              onclick="bpDeletePack(${p.id}, '${escJsAttr(p.Title)}')">Delete</button>` : ''}
          </div>
        </div>`;
      }).join('')
    : '<p class="no-data">No briefing packs saved yet.</p>';

  modal.innerHTML = `<div class="rb-modal-inner">
    <h3>Briefing Pack Library</h3>${rows}
    <button class="btn-secondary" style="margin-top:16px"
      onclick="document.getElementById('bp-library-modal').style.display='none'">Close</button>
  </div>`;
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

  document.getElementById('bp-library-modal').style.display = 'none';
  await bpLoadRoles();
  await bpLoadClientLogo();
  bpRender();
}

async function bpDeletePack(id, title) {
  if (!(await confirmModal({
    message: `Delete "${title}"? This cannot be undone.`,
    confirmLabel: 'Delete', danger: true,
  }))) return;
  await deleteItem('BriefingPacks', id);
  if (String(_bpPackId) === String(id)) _bpPackId = null;
  bpOpenLibraryModal();
}
