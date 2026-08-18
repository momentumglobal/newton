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

  let visible   = allPages;
  let highlight = 0;

  function render() {
    if (!visible.length) {
      resultsEl.innerHTML = `<div class="cmd-bar-empty">No matching pages</div>`;
      return;
    }
    resultsEl.innerHTML = visible.map((p, i) => `
      <div class="cmd-bar-result${i === highlight ? ' active' : ''}" data-index="${i}">
        <span class="cmd-bar-result-label">${escHtml(p.label)}</span>
        ${p.module !== currentModule
          ? `<span class="cmd-bar-result-badge">${escHtml(_cmdBarModuleName(p.module))}</span>`
          : ''}
      </div>
    `).join('');
  }

  function filter(query) {
    visible = allPages
      .map(p => ({ page: p, score: fuzzyMatch(query, p.label) }))
      .filter(r => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .map(r => r.page);
    highlight = 0;
    render();
  }

  function activate(index) {
    const page = visible[index];
    if (!page) return;
    close();
    if (page.module === currentModule) {
      window[navigateFn](page.key);
    } else {
      window.location.href = page.href;
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
}
