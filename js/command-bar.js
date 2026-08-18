// js/command-bar.js — shared Command Bar (⌘K / Ctrl+K) overlay (N-144).
//
// Renders a role-filtered, fuzzy-searchable directory of every page in
// CONFIG.COMMAND_BAR_PAGES (config.js — the single source of truth for
// this cross-module list). A result in the CURRENT module is activated
// in place via that module's own navigate function (no reload, same as
// a normal nav-link click). A result in another module is activated via
// a full navigation to <module-file>.html#<pageKey>; that module's
// *-app.js reads the hash on load (see handleDeepLink() in js/app.js and
// its people/sales equivalents) and lands directly on the target page.
//
// This is the first PERMANENT global `keydown` listener in the
// codebase — every earlier one (confirmModal/promptModal in utils.js)
// is added on open and removed on close, because those dialogs are
// created on demand. This one has to listen from page load so Ctrl+K
// works from anywhere. Keep it narrowly scoped: react to nothing but
// the one key combo, and never preventDefault() unless actually
// opening the overlay.

let _cmdBarInitialized = false;
let _cmdBarState        = null; // non-null while the overlay is open

// N-145 — entity search cache. null = not yet fetched this page session.
// Populated once, lazily, on first overlay open (never on init, never on
// keystroke) — see _cmdBarLoadEntities and its call site in _cmdBarOpen.
let _cmdBarEntityCache         = null;
let _cmdBarEntityFetchInFlight = null;

// Call once per module, right after that module's nav render.
//   currentModule — matches a CONFIG.OS_MODULES key ('reporting' | 'people' | 'sales' | 'command')
//   role          — the signed-in user's resolved role
//   navigateFn    — the NAME (string) of that module's navigate function,
//                   e.g. 'navigateTo' — same convention nav-core.js uses
//                   for onclick handlers, so results in the current
//                   module dispatch through window[navigateFn](key).
function initCommandBar({ currentModule, role, navigateFn }) {
  if (_cmdBarInitialized) return; // defensive — each module only calls this once
  _cmdBarInitialized = true;

  document.addEventListener('keydown', e => {
    const isCombo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
    if (!isCombo) return;
    if (_cmdBarState) return; // already open — leave it alone

    const el = document.activeElement;
    const inField = !!el && (
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable
    );
    if (inField || _confirmModalOpen) return; // let the field/dialog have the keypress

    e.preventDefault();
    _cmdBarOpen({ currentModule, role, navigateFn });
  });
}

function _cmdBarAccessiblePages(role) {
  return CONFIG.COMMAND_BAR_PAGES.filter(p => p.roles.includes(role));
}

function _cmdBarModuleName(moduleKey) {
  const m = CONFIG.OS_MODULES.find(m => m.key === moduleKey);
  return m ? m.name : moduleKey;
}

// N-145 — looks up a COMMAND_BAR_PAGES entry by key. Entity gating and
// navigation both go through this rather than canAccess()/peopleCanAccess()
// directly: command-bar.js runs on sales.html, command-centre.html,
// index.html and market-reporting.html, none of which load router.js or
// people-router.js, so calling either function here would throw.
function _cmdBarEntityPageInfo(pageKey) {
  return CONFIG.COMMAND_BAR_PAGES.find(p => p.key === pageKey);
}

// Fetches Roles/Projects/People once, filtered to what `role` may see via
// each type's COMMAND_BAR_PAGES.roles (not a fresh Graph call — reuses
// getRolesForUser/getScopedProjects/getPeople exactly as their own pages
// call them, so this rides the existing _apiCache like any other caller).
async function _cmdBarLoadEntities(role) {
  const email = getCurrentUser().email;
  const records = [];

    const roleInfo    = _cmdBarEntityPageInfo('roles');
  const projectInfo = _cmdBarEntityPageInfo('projectDashboard'); // N-145 addendum — was 'projects'
  const personInfo  = _cmdBarEntityPageInfo('peopleTracker');

  const wantRoles    = !!roleInfo    && roleInfo.roles.includes(role);
  const wantProjects = !!projectInfo && projectInfo.roles.includes(role);
  const wantPeople   = !!personInfo  && personInfo.roles.includes(role);
  // Role results need a project NAME even when Project results themselves
  // aren't shown, so fetch scoped projects whenever either is wanted.
  const needProjectNames = wantRoles || wantProjects;

  const [roles, projects, people] = await Promise.all([
    wantRoles       ? getRolesForUser(email)          : Promise.resolve([]),
    needProjectNames ? getScopedProjects(email, false) : Promise.resolve([]),
    wantPeople       ? getPeople(true)                 : Promise.resolve([]),
  ]);

  const projectMap = Object.fromEntries(projects.map(p => [String(p.id), p.CustomerName]));

  if (wantRoles) {
    roles.forEach(r => {
      const projectName = projectMap[String(r.ProjectIDLookupId)] || projectMap[String(r.ProjectID)] || '';
      records.push({
        entityType:   'role',
        id:           r.id,
        title:        r.RoleTitle,
        subtitleText: [projectName, r.Stage].filter(Boolean).join(' · '),
        searchText:   [r.RoleTitle, projectName, r.TalentPartner].filter(Boolean).join(' '),
      });
    });
  }

  if (wantProjects) {
    projects.forEach(p => {
      records.push({
        entityType:   'project',
        id:           p.id,
        title:        p.CustomerName,
        subtitleText: p.Status || '',
        searchText:   p.CustomerName || '',
      });
    });
  }

  if (wantPeople) {
    people.forEach(p => {
      records.push({
        entityType:   'person',
        id:           p.id,
        title:        p.EmployeeName,
        subtitleText: p.Level || '',
        searchText:   p.EmployeeName || '',
      });
    });
  }

  return records;
}

function _cmdBarOpen({ currentModule, role, navigateFn }) {
  const previouslyFocused = document.activeElement;
  const allPages = _cmdBarAccessiblePages(role);

  const overlay = document.createElement('div');
  overlay.className = 'cmd-bar-overlay';
  overlay.innerHTML = `
    <div class="cmd-bar-panel" role="dialog" aria-modal="true" aria-label="Command bar">
      <input type="text" class="cmd-bar-input" placeholder="Jump to a page…" autocomplete="off">
      <div class="cmd-bar-results"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input     = overlay.querySelector('.cmd-bar-input');
  const resultsEl  = overlay.querySelector('.cmd-bar-results');

    let visible      = allPages.map(page => ({ kind: 'page', page }));
  let highlight    = 0;
  let currentQuery = '';

  // N-145 — page rows render as before; entity rows show a title, an
  // optional subtitle (project/stage for a Role, status for a Project,
  // level for a Person), and an always-on type badge (unlike the page
  // badge, which only shows when the result is in a different module).
  const ENTITY_BADGE_LABEL = { role: 'Role', project: 'Project', person: 'Person' };

  function render() {
    const rowsHtml = visible.map((row, i) => {
      const activeClass = i === highlight ? ' active' : '';
      if (row.kind === 'page') {
        const p = row.page;
        return `
      <div class="cmd-bar-result${activeClass}" data-index="${i}">
        <span class="cmd-bar-result-label">${escHtml(p.label)}</span>
        ${p.module !== currentModule
          ? `<span class="cmd-bar-result-badge">${escHtml(_cmdBarModuleName(p.module))}</span>`
          : ''}
      </div>`;
      }
      const rec = row.record;
      return `
      <div class="cmd-bar-result cmd-bar-result-entity${activeClass}" data-index="${i}">
        <div class="cmd-bar-result-text">
          <span class="cmd-bar-result-label">${escHtml(rec.title)}</span>
          ${rec.subtitleText ? `<span class="cmd-bar-result-subtitle">${escHtml(rec.subtitleText)}</span>` : ''}
        </div>
        <span class="cmd-bar-result-badge">${escHtml(ENTITY_BADGE_LABEL[rec.entityType] || rec.entityType)}</span>
      </div>`;
    }).join('');

    const showLoading = !!_cmdBarEntityFetchInFlight
      && currentQuery.trim().length >= CONFIG.COMMAND_BAR_ENTITY_MIN_QUERY_LEN;
    const loadingHtml = showLoading
      ? `<div class="cmd-bar-loading">Loading roles, projects and people…</div>`
      : '';

    resultsEl.innerHTML = (visible.length ? rowsHtml : `<div class="cmd-bar-empty">No matches</div>`) + loadingHtml;
  }

  function filter(query) {
    currentQuery = query;
    const q = query.trim();

    const pageMatches = allPages
      .map(page => ({ kind: 'page', page, score: fuzzyMatch(q, page.label) }))
      .filter(r => r.score !== null);

    let entityMatches = [];
    if (_cmdBarEntityCache && q.length >= CONFIG.COMMAND_BAR_ENTITY_MIN_QUERY_LEN) {
      const byType = {};
      _cmdBarEntityCache.forEach(record => {
        const score = fuzzyMatch(q, record.searchText);
        if (score === null) return;
        (byType[record.entityType] = byType[record.entityType] || []).push({ kind: 'entity', record, score });
      });
      Object.values(byType).forEach(list => {
        list.sort((a, b) => b.score - a.score);
        entityMatches = entityMatches.concat(list.slice(0, CONFIG.COMMAND_BAR_ENTITY_RESULT_CAP));
      });
    }

    visible = pageMatches.concat(entityMatches).sort((a, b) => b.score - a.score);
    highlight = 0;
    render();
  }

  function activate(index) {
    const row = visible[index];
    if (!row) return;
    close();

    if (row.kind === 'page') {
      const page = row.page;
      if (page.module === currentModule) {
        window[navigateFn](page.key);
      } else {
        window.location.href = page.href;
      }
      return;
    }

    // N-145 — entity row. Two activation kinds:
    //  'edit'   (Role, Person) — navigate, then open the edit form once
    //           the page is up. Same-module timing deliberately matches
    //           handleDeepLink()'s existing action=add setTimeout(…, 50).
    //  'filter' (Project, addendum 18 Aug 2026) — set the destination
    //           page's filter state BEFORE navigating, so its very first
    //           render is already scoped — no setTimeout, no race,
    //           because the target render function reads that state
    //           synchronously at the top, before any await.
    const rec      = row.record;
    const typeInfo = CONFIG.COMMAND_BAR_ENTITY_TYPES.find(t => t.type === rec.entityType);
    const pageInfo = _cmdBarEntityPageInfo(typeInfo.pageKey);
    if (pageInfo.module === currentModule) {
      if (typeInfo.activationKind === 'filter') {
        window[typeInfo.setterFn](rec.id);
        window[navigateFn](typeInfo.pageKey);
      } else {
        window[navigateFn](typeInfo.pageKey);
        setTimeout(() => window[typeInfo.openerFn](rec.id), 50);
      }
    } else {
      const actionQs = typeInfo.activationKind === 'filter'
        ? `action=filter&projectId=${rec.id}`
        : `action=edit&id=${rec.id}`;
      window.location.href = `${pageInfo.href}?${actionQs}`;
    }
  }

  function close() {
    document.removeEventListener('keydown', onOverlayKeydown);
    overlay.remove();
    _cmdBarState = null;
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
  }

  // Added on open, removed on close — same shape as confirmModal's own
  // keydown handler in utils.js.
  function onOverlayKeydown(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visible.length) highlight = (highlight + 1) % visible.length;
      render();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (visible.length) highlight = (highlight - 1 + visible.length) % visible.length;
      render();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      activate(highlight);
    }
  }

  resultsEl.addEventListener('click', e => {
    const row = e.target.closest('.cmd-bar-result');
    if (row) activate(Number(row.dataset.index));
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  input.addEventListener('input', () => filter(input.value));
  document.addEventListener('keydown', onOverlayKeydown);

    _cmdBarState = { close };
  render();
  input.focus();

  // N-145 — kick off the entity fetch once per page session, without
  // blocking the overlay's own open/render above. If the overlay is
  // still open when it resolves, re-run the current filter so any
  // matching entities appear without the user retyping.
  if (_cmdBarEntityCache === null && !_cmdBarEntityFetchInFlight) {
    _cmdBarEntityFetchInFlight = _cmdBarLoadEntities(role).then(records => {
      _cmdBarEntityCache = records;
      _cmdBarEntityFetchInFlight = null;
      if (_cmdBarState) filter(currentQuery);
    });
  }
}
