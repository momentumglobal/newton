// js/richtext.js — shared rich-text table editor and paste sanitiser (N-346a).
// Loaded after ui-kit.js, and only by the shells that host a `.rb-richtext`
// editor: reporting.html, market-reporting.html, sales.html. Uses toast()
// from ui-kit.js at runtime.

// ── Shared rich-text editor helpers (N-211) ──────────────────────────
// Used by every `.rb-richtext` editor in Newton: Report Builder text blocks,
// Market Report observations, LCI Report observations, briefing pack sections.
// Kept here so there is exactly one table implementation to fix.

// Toggles a rich-text toolbar's button .active states to match the current
// selection. Shared by every `.rb-richtext` editor (Report Builder, Market
// Report, LCI Report, Briefing Pack) so the four can't drift out of sync
// again (N-228) — each caller passes its own toolbar element (found however
// that module scopes it: closest() for multi-instance editors, a fixed id
// for single-instance ones). Buttons are found by their data-rt="<command>"
// (bold, italic, underline, insertUnorderedList, insertOrderedList) and
// data-rt-block="H3"|"P" attributes (N-302a) — each editor's template puts
// those beside its act() call, so nothing here depends on handler text.
function rtUpdateToolbarState(toolbarEl) {
  if (!toolbarEl) return;
  ['bold', 'italic', 'underline'].forEach(cmd => {
    const btn = toolbarEl.querySelector(`button[data-rt="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
  const ulBtn = toolbarEl.querySelector('button[data-rt="insertUnorderedList"]');
  const olBtn = toolbarEl.querySelector('button[data-rt="insertOrderedList"]');
  if (ulBtn) ulBtn.classList.toggle('active', document.queryCommandState('insertUnorderedList'));
  if (olBtn) olBtn.classList.toggle('active', document.queryCommandState('insertOrderedList'));
  const blockTag = document.queryCommandValue('formatBlock').toUpperCase();
  const hBtn = toolbarEl.querySelector('button[data-rt-block="H3"]');
  const pBtn = toolbarEl.querySelector('button[data-rt-block="P"]');
  if (hBtn) hBtn.classList.toggle('active', blockTag === 'H3');
  if (pBtn) pBtn.classList.toggle('active', blockTag === 'P' || blockTag === 'DIV' || blockTag === '');
}

// Returns the canonical toolbar button markup. The mousedown preventDefault
// (noop.prevent) is load-bearing: a plain button steals focus on mousedown and
// collapses the selection, and insertHTML — unlike bold/italic — cannot
// recover from that.
function rtTableToolbarButtonHtml() {
  return '<button type="button" title="Insert table"'
       + actOn('mousedown', 'noop.prevent')
       + act('rtInsertTable') + '>&#8862; Table</button>';
}

// Insert a bordered table at the caret. Returns false and toasts if the caret
// is not inside a rich-text editor. Dispatches an `input` event on the host
// editor so each caller's existing oninput persistence path runs unchanged —
// no caller needs its own save handling for tables.
function rtInsertTable(rows, cols) {
  const cfg = (typeof CONFIG !== 'undefined' && CONFIG.BRIEFING_PACK) || {};
  const r = Math.max(2, rows || cfg.TABLE_DEFAULT_ROWS || 3);
  const c = Math.max(1, cols || cfg.TABLE_DEFAULT_COLS || 3);

  const sel = window.getSelection();
  const node = sel && sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
  const host = node && (node.nodeType === 1 ? node : node.parentElement);
  const editor = host && host.closest ? host.closest('.rb-richtext') : null;
  if (!editor) {
    toast('Click inside the text area first, then insert a table.', { type: 'error' });
    return false;
  }

  const headCells = Array.from({ length: c }, () => '<th>&nbsp;</th>').join('');
  const bodyRow   = '<tr>' + Array.from({ length: c }, () => '<td>&nbsp;</td>').join('') + '</tr>';
  const html = '<table class="rt-table"><thead><tr>' + headCells + '</tr></thead><tbody>'
             + Array.from({ length: r - 1 }, () => bodyRow).join('')
             + '</tbody></table><p><br></p>';

  document.execCommand('insertHTML', false, html);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

// ── Table controls (add/remove rows & columns, delete table) — N-216 ──
// Shared across the same four `.rb-richtext` editors as rtInsertTable above
// (Report Builder, Market Report, LCI Report, briefing pack). One floating
// controls bar, positioned over whichever `.rt-table` currently has
// focus/caret, rather than a per-editor toolbar — kept here for the same
// "exactly one implementation" reason as rtInsertTable above.
let _rtCurrentTable = null;
let _rtCurrentEditor = null;

// Lazily creates (once) and returns the shared floating controls bar.
function _rtTableControlsEl() {
  let el = document.getElementById('rt-table-controls');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rt-table-controls';
    el.className = 'rt-table-controls';
    el.style.display = 'none';
    const tableBtn = (action, label) =>
      '<button type="button"' + actOn('mousedown', 'noop.prevent') + act(action) + '>' + label + '</button>';
    el.innerHTML =
        tableBtn('rtTableAddRow', '+ Row')
      + tableBtn('rtTableRemoveRow', '&minus; Row')
      + tableBtn('rtTableAddCol', '+ Column')
      + tableBtn('rtTableRemoveCol', '&minus; Column')
      + tableBtn('rtTableDeleteTable', '&times; Delete table');
    document.body.appendChild(el);
  }
  return el;
}

// Repositions the controls bar over the currently tracked table. Self-heals
// by hiding if the table has been removed from the document by something
// other than rtTableDeleteTable — e.g. the owning page re-rendered the
// editor out from under an open bar.
function _rtRepositionTableControls() {
  if (!_rtCurrentTable || !document.contains(_rtCurrentTable)) {
    _rtHideTableControls();
    return;
  }
  const el = _rtTableControlsEl();
  el.style.display = 'flex'; // show before measuring — offsetWidth/offsetHeight read 0 while display:none
  const rect = _rtCurrentTable.getBoundingClientRect();
  el.style.top = Math.max(4, rect.top - el.offsetHeight - 4) + 'px';
  const idealLeft = rect.right - el.offsetWidth;
  const maxLeft = window.innerWidth - el.offsetWidth - 4;
  el.style.left = Math.max(4, Math.min(idealLeft, maxLeft)) + 'px';
}

function _rtShowTableControls(table) {
  _rtCurrentTable = table;
  _rtCurrentEditor = table.closest('.rb-richtext');
  _rtRepositionTableControls();
}

function _rtHideTableControls() {
  _rtCurrentTable = null;
  _rtCurrentEditor = null;
  const el = document.getElementById('rt-table-controls');
  if (el) el.style.display = 'none';
}

// Delegated click/keyup handler — same "one document-level listener, check
// with closest()/contains()" pattern as the nav-dropdown outside-click
// handlers in nav.js/mr-nav.js/people-nav.js/sales-nav.js.
function _rtHandleTableFocusEvent(e) {
  if (e.target.closest && e.target.closest('#rt-table-controls')) return;

  // Resolve the actual caret position via the selection, not e.target — for
  // a keyup inside contenteditable, e.target is always the .rb-richtext
  // host itself (the only focusable node), never the descendant the caret
  // is actually in, so e.target.closest() can never find a nested table.
  // Same technique rtInsertTable/rtWrapCallout already use above.
  const sel = window.getSelection();
  const node = sel && sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
  const host = node && (node.nodeType === 1 ? node : node.parentElement);
  const table = host && host.closest ? host.closest('table.rt-table') : null;
  const wellFormed = table
    && host.closest('.rb-richtext')
    && table.querySelector('thead')
    && table.querySelector('tbody');

  if (wellFormed) {
    _rtShowTableControls(table);
  } else {
    _rtHideTableControls();
  }
}

// N-262: shared paste sanitizer for every .rb-richtext editor (Report
// Builder, Market Report, LCI Report, briefing pack). Browser default
// paste carries the source's inline font-family/size/colour straight into
// the DOM — the toolbar's execCommand buttons can't undo styling they
// never set, and it round-trips into the PDF/PPTX exports. Strip all
// styling on the way in; keep only the structure the toolbar itself can
// already produce.
const RT_PASTE_ALLOWED_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI']);
// Block-level wrappers normalised rather than unwrapped, so separate
// Word/Google-Docs paragraphs (often <div>-wrapped) and pasted headings
// (any level) survive as a break instead of merging into one run of text.
const RT_PASTE_BLOCK_NORMALIZE = { DIV: 'P', H1: 'H3', H2: 'H3', H3: 'H3', H4: 'H3', H5: 'H3', H6: 'H3' };

// Recursively cleans a parsed clipboard fragment in place. Children are
// resolved before their parent so nested disallowed wrappers (e.g. Google
// Docs' <span style=...><span style=...>text</span></span>) fully
// collapse instead of leaving one level behind.
function _rtCleanPasteNode(node) {
  Array.from(node.childNodes).forEach(child => {
    if (child.nodeType === 1) {
      const tag = child.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') {
        child.remove();
        return;
      }
      _rtCleanPasteNode(child);
      const normalizeTo = RT_PASTE_BLOCK_NORMALIZE[tag];
      if (normalizeTo) {
        const el = document.createElement(normalizeTo);
        el.append(...child.childNodes);
        child.replaceWith(el);
      } else if (RT_PASTE_ALLOWED_TAGS.has(tag)) {
        Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
      } else {
        child.replaceWith(...child.childNodes);
      }
    } else if (child.nodeType === 8) {
      child.remove();
    }
  });
}

function _rtPlainTextToHtml(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.split(/\r\n|\r|\n/).map(line => `<p>${line || '<br>'}</p>`).join('');
}

// Delegated paste handler — same document-level pattern as
// _rtHandleTableFocusEvent above.
function _rtHandlePaste(e) {
  if (!e.target.closest || !e.target.closest('.rb-richtext')) return;
  e.preventDefault();

  const cd = e.clipboardData || window.clipboardData;
  const html = cd && cd.getData('text/html');
  let cleanHtml;
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    _rtCleanPasteNode(doc.body);
    cleanHtml = doc.body.innerHTML;
  } else {
    cleanHtml = _rtPlainTextToHtml((cd && cd.getData('text/plain')) || '');
  }
  document.execCommand('insertHTML', false, cleanHtml);
}

// N-216 fix: richtext.js is also loaded standalone into a bare Node `vm`
// context with no DOM by tests/run.js (see that file's header comment) —
// top-level document/window calls must not execute there. Same guard
// pattern as graph-client.js's _ssPurgeStaleBuilds() checking for sessionStorage.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('click', _rtHandleTableFocusEvent);
  document.addEventListener('keyup', _rtHandleTableFocusEvent);
  document.addEventListener('paste', _rtHandlePaste);
  window.addEventListener('scroll', () => { if (_rtCurrentTable) _rtRepositionTableControls(); }, true);
  window.addEventListener('resize', () => { if (_rtCurrentTable) _rtRepositionTableControls(); });
}

// Adds one row of empty cells, one per existing column. Column count is
// always read from thead — the one row guaranteed to exist and to already
// be correct even right after rtTableAddCol runs.
function rtTableAddRow() {
  if (!_rtCurrentTable || !_rtCurrentEditor) return;
  const headRow = _rtCurrentTable.querySelector('thead tr');
  const tbody = _rtCurrentTable.querySelector('tbody');
  if (!headRow || !tbody) return;
  const cols = headRow.children.length;
  const cells = Array.from({ length: cols }, () => '<td>&nbsp;</td>').join('');
  tbody.insertAdjacentHTML('beforeend', '<tr>' + cells + '</tr>');
  _rtCurrentEditor.dispatchEvent(new Event('input', { bubbles: true }));
  _rtRepositionTableControls();
}

// Adds one empty cell to every existing row: a <th> on the header row, a
// <td> on every body row.
function rtTableAddCol() {
  if (!_rtCurrentTable || !_rtCurrentEditor) return;
  const headRow = _rtCurrentTable.querySelector('thead tr');
  if (!headRow) return;
  headRow.insertAdjacentHTML('beforeend', '<th>&nbsp;</th>');
  _rtCurrentTable.querySelectorAll('tbody tr').forEach(row => {
    row.insertAdjacentHTML('beforeend', '<td>&nbsp;</td>');
  });
  _rtCurrentEditor.dispatchEvent(new Event('input', { bubbles: true }));
  _rtRepositionTableControls();
}

// Removes the last row, mirroring rtTableAddRow. A no-op if the table has
// no body rows left to remove.
function rtTableRemoveRow() {
  if (!_rtCurrentTable || !_rtCurrentEditor) return;
  const tbody = _rtCurrentTable.querySelector('tbody');
  if (!tbody || !tbody.lastElementChild) return;
  tbody.lastElementChild.remove();
  _rtCurrentEditor.dispatchEvent(new Event('input', { bubbles: true }));
  _rtRepositionTableControls();
}

// Removes the last column from every row, mirroring rtTableAddCol. Never
// removes the last remaining column — a table needs at least one.
function rtTableRemoveCol() {
  if (!_rtCurrentTable || !_rtCurrentEditor) return;
  const headRow = _rtCurrentTable.querySelector('thead tr');
  if (!headRow || headRow.children.length <= 1) return;
  headRow.lastElementChild.remove();
  _rtCurrentTable.querySelectorAll('tbody tr').forEach(row => {
    if (row.lastElementChild) row.lastElementChild.remove();
  });
  _rtCurrentEditor.dispatchEvent(new Event('input', { bubbles: true }));
  _rtRepositionTableControls();
}

// Removes the table entirely. The trailing <p><br></p> rtInsertTable always
// inserts after the table is left in place — contentEditable still has a
// block to land the caret in, nothing further to clean up.
function rtTableDeleteTable() {
  if (!_rtCurrentTable || !_rtCurrentEditor) return;
  const editor = _rtCurrentEditor;
  _rtCurrentTable.remove();
  _rtHideTableControls();
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

// N-302a: delegated actions owned by this file (js/actions.js).
registerActions({
  rtInsertTable,
  rtTableAddRow,
  rtTableRemoveRow,
  rtTableAddCol,
  rtTableRemoveCol,
  rtTableDeleteTable,
});