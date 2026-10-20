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
//   currentModule — matches a CONFIG.OS_MODULES key ('reporting' | 'people' | 'sales' | 'command'),
//                   or a CONFIG.COMMAND_BAR_EXTRA_MODULES key ('admin') for a
//                   module that isn't part of the OS_MODULES switcher (N-246)
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
  const m = CONFIG.OS_MODULES.find(m => m.key === moduleKey)
    || (CONFIG.COMMAND_BAR_EXTRA_MODULES || []).find(m => m.key === moduleKey);
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

// N-146 — action buttons for a Role entity row (Log activity / Update
// stage / Add placement), pre-scoped to that role. Update stage is left
// out for a terminal-stage role (Closed/Cancelled) — same rule N-149
// already applies to the Roles-list lock icon; there is nothing to
// unlock for those rows.
function _cmdBarRoleActions(rec) {
  const typeInfo = CONFIG.COMMAND_BAR_ENTITY_TYPES.find(t => t.type === 'role');
  const actions = (typeInfo && typeInfo.actions) || [];
  const isTerminal = CONFIG.ROLE_STAGE_TERMINAL.includes(rec.stage);
  return isTerminal ? actions.filter(a => a.key !== 'updateStage') : actions;
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
    // N-146 addendum (19 Aug 2026) — only active roles are searchable
    // here, matching the exclusion every other role-picker in the app
    // already applies (forms*.js's role dropdowns, pages-model.js's Roles-list
    // "Active" filter) — cuts noise from roles nobody needs to act on via
    // the Command Bar. N-305: all of them read utils.js:isOpenPipelineStage().
    roles.filter(r => isOpenPipelineStage(r.Stage)).forEach(r => {
      const projectName = projectMap[String(r.ProjectIDLookupId)] || projectMap[String(r.ProjectID)] || '';
      records.push({
        entityType:   'role',
        id:           r.id,
        title:        r.RoleTitle,
        subtitleText: [projectName, r.Stage].filter(Boolean).join(' · '),
        searchText:   [r.RoleTitle, projectName, r.TalentPartner].filter(Boolean).join(' '),
        // N-146 — needed by the row's inline action buttons: projectId to
        // pre-scope Log activity / Add placement, stage to know whether
        // Update stage applies (terminal stages don't get the button).
        projectId:    r.ProjectIDLookupId || r.ProjectID || null,
        stage:        r.Stage || null,
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
        subtitleText: personRoleLabel(p),   // N-304: 'Internal · <Function>' for internal staff
        searchText:   p.EmployeeName || '',
      });
    });
  }

  return records;
}

// N-145 — page rows render as before; entity rows show a title, an
// optional subtitle (project/stage for a Role, status for a Project,
// level for a Person), and an always-on type badge (unlike the page
// badge, which only shows when the result is in a different module).
const _CMD_BAR_ENTITY_BADGE_LABEL = { role: 'Role', project: 'Project', person: 'Person' };

function _cmdBarBuildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'cmd-bar-overlay';
  overlay.innerHTML = `
    <div class="cmd-bar-panel" role="dialog" aria-modal="true" aria-label="Command bar">
      <input type="text" class="cmd-bar-input" placeholder="Jump to a page…" autocomplete="off">
      <div class="cmd-bar-results"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return {
    overlay,
    input:     overlay.querySelector('.cmd-bar-input'),
    resultsEl: overlay.querySelector('.cmd-bar-results'),
  };
}

function _cmdBarRowHtml(row, i, activeClass, currentModule) {
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
  // N-146 — inline action buttons, Role rows only (empty for Project/Person).
  const roleActions = rec.entityType === 'role' ? _cmdBarRoleActions(rec) : [];
  const actionsHtml = roleActions.length
    ? `<div class="cmd-bar-result-actions">${roleActions.map(a =>
        `<button type="button" class="cmd-bar-action-btn" title="${escHtml(a.label)}" data-action="${a.key}"><i data-lucide="${a.icon}"></i></button>`
      ).join('')}</div>`
    : '';
  return `
      <div class="cmd-bar-result cmd-bar-result-entity${activeClass}" data-index="${i}">
        <div class="cmd-bar-result-text">
          <span class="cmd-bar-result-label">${escHtml(rec.title)}</span>
          ${rec.subtitleText ? `<span class="cmd-bar-result-subtitle">${escHtml(rec.subtitleText)}</span>` : ''}
        </div>
        <div class="cmd-bar-result-meta">
          ${actionsHtml}
          <span class="cmd-bar-result-badge">${escHtml(_CMD_BAR_ENTITY_BADGE_LABEL[rec.entityType] || rec.entityType)}</span>
        </div>
      </div>`;
}

function _cmdBarResultsHtml(visible, highlight, query, currentModule) {
  const rowsHtml = visible.map((row, i) =>
    _cmdBarRowHtml(row, i, i === highlight ? ' active' : '', currentModule)
  ).join('');
  const showLoading = !!_cmdBarEntityFetchInFlight
    && query.trim().length >= CONFIG.COMMAND_BAR_ENTITY_MIN_QUERY_LEN;
  const loadingHtml = showLoading
    ? `<div class="cmd-bar-loading">Loading roles, projects and people…</div>`
    : '';
  return (visible.length ? rowsHtml : `<div class="cmd-bar-empty">No matches</div>`) + loadingHtml;
}

// Page matches + capped entity matches (+ browse mode), best score first.
function _cmdBarFilterRows(query, allPages, entityCache) {
  const q = query.trim();
  const qLower = q.toLowerCase();

  const pageMatches = allPages
    .map(page => ({ kind: 'page', page, score: fuzzyMatch(q, page.label) }))
    .filter(r => r.score !== null);

  let entityMatches = [];
  if (entityCache && q.length >= CONFIG.COMMAND_BAR_ENTITY_MIN_QUERY_LEN) {
    const byType = {};
    entityCache.forEach(record => {
      const score = fuzzyMatch(q, record.searchText);
      if (score === null) return;
      (byType[record.entityType] = byType[record.entityType] || []).push({ kind: 'entity', record, score });
    });
    Object.values(byType).forEach(list => {
      list.sort((a, b) => b.score - a.score);
      entityMatches = entityMatches.concat(list.slice(0, CONFIG.COMMAND_BAR_ENTITY_RESULT_CAP));
    });

    // N-146 addendum (19 Aug 2026) — browse mode: typing a prefix of an
    // entity-bearing page's own label (e.g. "Roles") lists every cached
    // record of that entity type, uncapped. fuzzyMatch is a subsequence
    // match over each record's title/project/TP text, so a role like
    // "Recruiter" has no reason to contain the letters "roles" in order —
    // typing the category name was never going to surface it. The CAP
    // above exists to bound a free-text search's noise, not to truncate
    // a deliberate "show me all of them" browse, so this skips it
    // entirely (still excludes anything already included above from a
    // genuine text match, and still respects the active-roles-only
    // filter already applied when the cache was built).
    const includedIds = new Set(entityMatches.map(m => `${m.record.entityType}:${m.record.id}`));
    CONFIG.COMMAND_BAR_ENTITY_TYPES.forEach(typeInfo => {
      const page = allPages.find(p => p.key === typeInfo.pageKey);
      if (!page || !qLower || !page.label.toLowerCase().startsWith(qLower)) return;
      entityCache
        .filter(r => r.entityType === typeInfo.type && !includedIds.has(`${r.entityType}:${r.id}`))
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        .forEach(record => entityMatches.push({ kind: 'entity', record, score: 0 }));
    });
  }

  return pageMatches.concat(entityMatches).sort((a, b) => b.score - a.score);
}

// What activating a result row should do, as data (_cmdBarRunTarget does it).
// A result in the current module is activated in place; one in another
// module is a full navigation to its page.
// N-145 — entity row. Two activation kinds:
//  'edit'   (Role, Person) — navigate, then open the edit form once
//           the page is up. Same-module timing deliberately matches
//           handleDeepLink()'s existing action=add setTimeout(…, 50).
//  'filter' (Project, addendum 18 Aug 2026) — set the destination
//           page's filter state BEFORE navigating, so its very first
//           render is already scoped — no setTimeout, no race,
//           because the target render function reads that state
//           synchronously at the top, before any await.
function _cmdBarActivationTarget(row, currentModule) {
  if (row.kind === 'page') {
    const page = row.page;
    return page.module === currentModule
      ? { kind: 'nav', pageKey: page.key }
      : { kind: 'href', url: page.href };
  }
  const rec      = row.record;
  const typeInfo = CONFIG.COMMAND_BAR_ENTITY_TYPES.find(t => t.type === rec.entityType);
  const pageInfo = _cmdBarEntityPageInfo(typeInfo.pageKey);
  if (pageInfo.module === currentModule) {
    return typeInfo.activationKind === 'filter'
      ? { kind: 'filter', setterFn: typeInfo.setterFn, id: rec.id, pageKey: typeInfo.pageKey }
      : { kind: 'edit', pageKey: typeInfo.pageKey, openerFn: typeInfo.openerFn, id: rec.id };
  }
  const actionQs = typeInfo.activationKind === 'filter'
    ? `action=filter&projectId=${rec.id}`
    : `action=edit&id=${rec.id}`;
  return { kind: 'href', url: `${pageInfo.href}?${actionQs}` };
}

// N-146 — dispatch for an inline action button on a Role row (Log
// activity / Update stage / Add placement), pre-scoped to that role.
// Same-module/cross-module split as above, and the same
// href?action=…&param=… convention app.js's handleDeepLink() already
// parses for action=edit/action=add.
function _cmdBarActionTarget(rec, actionKey, currentModule) {
  if (actionKey === 'updateStage') {
    const pageInfo = _cmdBarEntityPageInfo('roles');
    return pageInfo.module === currentModule
      ? { kind: 'scrollUnlock', pageKey: 'roles', id: rec.id }
      : { kind: 'href', url: `${pageInfo.href}?action=updateStage&roleId=${rec.id}` };
  }
  const targetPageKey = actionKey === 'logActivity' ? 'activity' : 'placements';
  const pageInfo = _cmdBarEntityPageInfo(targetPageKey);
  if (pageInfo.module === currentModule) {
    return {
      kind: 'openForm', pageKey: targetPageKey,
      fnName: actionKey === 'logActivity' ? 'showAddActivityForm' : 'showAddPlacementForm',
      args: [rec.id, rec.projectId],
    };
  }
  return { kind: 'href', url: `${pageInfo.href}?action=${actionKey}&roleId=${rec.id}&projectId=${rec.projectId}` };
}

function _cmdBarRunTarget(t, navigateFn) {
  if (t.kind === 'href') { window.location.href = t.url; return; }
  if (t.kind === 'filter') window[t.setterFn](t.id);
  window[navigateFn](t.pageKey);
  if (t.kind === 'edit')         setTimeout(() => window[t.openerFn](t.id), 50);
  if (t.kind === 'scrollUnlock') setTimeout(() => window.scrollToAndUnlockStage(t.id), 50);
  if (t.kind === 'openForm')     setTimeout(() => window[t.fnName](...t.args), 50);
}

function _cmdBarNextHighlight(key, highlight, count) {
  if (!count) return highlight;
  return key === 'ArrowDown' ? (highlight + 1) % count : (highlight - 1 + count) % count;
}

// Which result a click landed on. N-146 — action buttons are nested inside a
// .cmd-bar-result row, so this more specific check must run first and return,
// or the row's own click (activate — open the role) fires as well.
function _cmdBarClickTarget(e, visible) {
  const actionBtn = e.target.closest('.cmd-bar-action-btn');
  if (actionBtn) {
    const row = actionBtn.closest('.cmd-bar-result');
    const rec = row && visible[Number(row.dataset.index)]?.record;
    return rec ? { rec, actionKey: actionBtn.dataset.action } : null;
  }
  const row = e.target.closest('.cmd-bar-result');
  return row ? { index: Number(row.dataset.index) } : null;
}

// N-145 — kick off the entity fetch once per page session, without
// blocking the overlay's own open/render. onLoaded re-runs the current
// filter if the overlay is still open when it resolves, so any matching
// entities appear without the user retyping.
function _cmdBarStartEntityFetch(role, onLoaded) {
  if (_cmdBarEntityCache !== null || _cmdBarEntityFetchInFlight) return;
  _cmdBarEntityFetchInFlight = _cmdBarLoadEntities(role).then(records => {
    _cmdBarEntityCache = records;
    _cmdBarEntityFetchInFlight = null;
    onLoaded();
  });
}

function _cmdBarOpen({ currentModule, role, navigateFn }) {
  const previouslyFocused = document.activeElement;
  const allPages = _cmdBarAccessiblePages(role);
  const { overlay, input, resultsEl } = _cmdBarBuildOverlay();

  let visible      = allPages.map(page => ({ kind: 'page', page }));
  let highlight    = 0;
  let currentQuery = '';

  function render() {
    resultsEl.innerHTML = _cmdBarResultsHtml(visible, highlight, currentQuery, currentModule);
    // N-146 — action buttons render lucide icon tags; paint them on every
    // re-render (first open and every filter keystroke), same as every
    // other page that calls lucide.createIcons() after building markup.
    lucide.createIcons();
  }

  function filter(query) {
    currentQuery = query;
    visible = _cmdBarFilterRows(query, allPages, _cmdBarEntityCache);
    highlight = 0;
    render();
  }

  function activate(index) {
    const row = visible[index];
    if (!row) return;
    close();
    _cmdBarRunTarget(_cmdBarActivationTarget(row, currentModule), navigateFn);
  }

  function activateEntityAction(rec, actionKey) {
    close();
    _cmdBarRunTarget(_cmdBarActionTarget(rec, actionKey, currentModule), navigateFn);
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
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      highlight = _cmdBarNextHighlight(e.key, highlight, visible.length);
      render();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      activate(highlight);
    }
  }

  resultsEl.addEventListener('click', e => {
    const t = _cmdBarClickTarget(e, visible);
    if (!t) return;
    if (t.rec) activateEntityAction(t.rec, t.actionKey);
    else activate(t.index);
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  input.addEventListener('input', () => filter(input.value));
  document.addEventListener('keydown', onOverlayKeydown);

  _cmdBarState = { close };
  render();
  input.focus();

  _cmdBarStartEntityFetch(role, () => { if (_cmdBarState) filter(currentQuery); });
}
