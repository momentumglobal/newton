// js/list-controls.js — shared controls for list pages (N-151 / T-8a).
//
// Owns the renderers every list page uses to narrow what it fetches and what
// it shows: the project dropdown, the date-window selector, and the result
// count. Extracted from pages.js, which was at its 600-line ceiling.
//
// Implements the N-140 decision: list pages bound their query with a DEFAULT
// DATE WINDOW plus an explicit "All time" escape, not $top/skiptoken
// pagination. The result count is not decoration — a window was chosen over
// pagination on the argument that a narrowed view stays legible as narrowed,
// so never render a window without the count.
//
// N-247a adds the sortable column header (sortableHeader) and its focus
// restore (focusSortHeader). The sort LOGIC is not here — it is pure and
// lives in utils.js (sortRows, nextSortState, compareSortValues).
//
// N-251a adds the shared list search box (listSearchBox, its focus restore
// focusListSearchBox), the page-agnostic substring filter
// (filterRowsByText), and a generic debounce() helper. Reference
// implementation is the Roles page (pages.js); N-247b/N-247c wire the
// remaining list pages in without changes here.
//
// LOAD ORDER: after utils.js (isProjectActive, sortProjectsByName,
// buildProjectOptionsHtml, escHtml, escAttr, escJsAttr) and api.js
// (getProjects, getUserProjectIds), and BEFORE pages.js, which calls
// everything here.
// ── Project filter helper ─────────────────────────────────────────────
async function getProjectFilterOptions() {
  const role = _resolvedRole;
  if (role === 'talent_partner') return { projects: [], canFilter: false };
  const user = getCurrentUser();
  let projects;
  if (role === 'admin') {
    projects = await getProjects(false);
  } else {
    const ids = await getUserProjectIds(user.email);
    const all = await getProjects(false);
    const idSet = new Set(ids.map(String));
    projects = all.filter(p => idSet.has(String(p.id)));
  }
  projects = sortProjectsByName(projects);
  return { projects, canFilter: true };
}
// N-112: Active (Status Active/Transition) and Archive (Status Completed)
// render as separate <optgroup>s, each sorted A-Z. "All Projects" stays the
// ungrouped default option.
function projectFilterDropdown(projects, selectedId, callbackFn) {
  const active  = sortProjectsByName(projects.filter(isProjectActive));
  const archive = sortProjectsByName(projects.filter(p => !isProjectActive(p)));
  const groups = [
    active.length  ? `<optgroup label="Active">${buildProjectOptionsHtml(active, selectedId)}</optgroup>`   : '',
    archive.length ? `<optgroup label="Archive">${buildProjectOptionsHtml(archive, selectedId)}</optgroup>` : '',
  ].join('');
  const options = `<option value="" ${!selectedId ? 'selected' : ''}>All Projects</option>${groups}`;
  return `<div class="project-filter-bar">
    <div class="form-group project-filter-select">
      <label>Project</label>
      <select onchange="${callbackFn}(this.value)">${options}</select>
    </div>
  </div>`;
}
// N-093: how much history to FETCH, not how much to render — changing this
// changes the $filter sent to SharePoint. Options come from
// CONFIG.DATE_WINDOW_WEEKS; 0 renders as "All time" and sends no date clause.
function periodFilterDropdown(selectedWeeks, callbackFn) {
  const options = CONFIG.DATE_WINDOW_WEEKS.map(function (w) {
    const label = dateWindowLabel(w);
    const sel   = Number(selectedWeeks) === w ? ' selected' : '';
    return '<option value="' + w + '"' + sel + '>' + label + '</option>';
  }).join('');
  return '<div class="form-group project-filter-select">' +
    '<label>Period</label>' +
    '<select onchange="' + callbackFn + '(this.value)">' + options + '</select>' +
    '</div>';
}

// N-151: the single place the window's wording is decided, so the dropdown
// and the result count can never disagree about what "0" means.
function dateWindowLabel(weeks) {
  return Number(weeks) ? 'Last ' + Number(weeks) + ' weeks' : 'All time';
}

// N-152: render-only page sizes. `0` means All. Mirrors periodFilterDropdown;
// string concatenation, no nested template literals (N-093 fix-1).
function pageSizeDropdown(selectedSize, callbackFn) {
  const options = CONFIG.PAGE_SIZES.map(function (n) {
    const label = n ? String(n) : 'All';
    const sel   = Number(selectedSize) === n ? ' selected' : '';
    return '<option value="' + n + '"' + sel + '>' + label + '</option>';
  }).join('');
  return '<div class="form-group project-filter-select">' +
    '<label>Show</label>' +
    '<select onchange="' + callbackFn + '(this.value)">' + options + '</select>' +
    '</div>';
}

// N-251a: generic debounce — delays invoking fn until `delay` ms after the
// last call. Page-agnostic; keeps list re-renders off the fast path of
// every keystroke in a search box.
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// N-251a: pure substring filter. `getSearchableFields(row)` returns an array
// of strings for that row — the page decides which columns count, so this
// stays page-agnostic and N-247b/N-247c call it from the remaining list
// pages unchanged.
function filterRowsByText(rows, query, getSearchableFields) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(row =>
    getSearchableFields(row).some(field => String(field || '').toLowerCase().includes(q))
  );
}

// N-251a: shared list search box. Page owns the value and passes its
// setter's name as callbackFn — same shape as pageSizeDropdown() /
// periodFilterDropdown(). `.form-group` gives it the standard input look;
// `.list-search-box` is the toolbar-alignment hook (see style.css).
function listSearchBox(value, callbackFn) {
  return '<div class="form-group list-search-box">' +
    '<label>Search</label>' +
    '<input type="search" value="' + escAttr(value || '') + '"' +
    ' placeholder="Filter this list…"' +
    ' oninput="' + callbackFn + '(this.value)">' +
    '</div>';
}

// N-251a: restores focus + caret position after a re-render replaces the
// search box's DOM node — mirrors focusSortHeader's fix for the same
// innerHTML-replacement problem. No-op when the box isn't on the page.
function focusListSearchBox() {
  const input = document.querySelector('#main-content .list-search-box input');
  if (input) {
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }
}

// N-152: RENDER-ONLY row cap. This must never influence a query — it runs
// after every sort and every client-side filter, so the page always shows the
// first N of what the user actually asked for, not an arbitrary N.
function paginate(rows, size) {
  const n = Number(size);
  return n > 0 ? rows.slice(0, n) : rows;
}

// N-152: one flex row for a page's controls, replacing the inline
// style="display:flex..." each page was hand-rolling. Empty parts drop out.
function listControlsBar(parts) {
  const inner = parts.filter(Boolean).join('');
  return inner ? '<div class="list-controls-bar">' + inner + '</div>' : '';
}

// N-151 / N-152: the count that makes a narrowed list legible as narrowed.
// Three quantities, deliberately kept apart now that a page cap exists:
//   shown   — rows actually rendered (after the page cap)
//   matched — rows passing every client-side filter
//   total   — rows the user is entitled to see in this window, pre-filter
// "Showing first N" is what distinguishes a PAGE CAP from a FILTER RESULT;
// without that word "Showing 25 of 42" is ambiguous. The window label is
// ALWAYS present — including "All time" — so no state can be read as "these
// are all the records" while a window is active. Do not regress that.
function listResultCount(shown, matched, total, weeks, noun) {
  // weeks === null means the page has NO date window at all (Roles). Showing
  // "All time" there would advertise a control that does not exist.
  const label = weeks === null ? '' : dateWindowLabel(weeks);
  let body;
  if (shown < matched) {
    body = 'Showing first ' + shown + ' of ' + matched
         + (matched < total ? ' matching (' + total + ' total)' : '');
  } else if (matched < total) {
    body = 'Showing ' + matched + ' of ' + total;
  } else {
    body = matched + ' ' + noun + (matched === 1 ? '' : 's');
  }
  return '<div class="list-result-count">' + escHtml(label ? body + ' \u00b7 ' + label : body) + '</div>';
}

// N-247a: one sortable column header, returned as a complete <th>.
// A native <button> inside the <th> — Enter/Space and tab order come free,
// and the <th> keeps its header semantics. aria-sort goes on the ACTIVE
// column only (ARIA APG). The page owns the { key, dir } state and passes
// its setter's name as callbackFn — same shape as pageSizeDropdown().
// String concatenation, no nested template literals (N-093 fix-1).
function sortableHeader(label, key, sortState, callbackFn) {
  const dir  = sortState && sortState.key === key ? sortState.dir : null;
  const icon = dir === 'asc' ? 'chevron-up' : dir === 'desc' ? 'chevron-down' : 'chevrons-up-down';
  const aria = dir ? ' aria-sort="' + (dir === 'asc' ? 'ascending' : 'descending') + '"' : '';
  return '<th class="th-sortable' + (dir ? ' is-sorted' : '') + '"' + aria + '>' +
    '<button type="button" class="th-sort-btn" data-sort-key="' + escAttr(key) + '"' +
    ' onclick="' + callbackFn + '(\'' + escJsAttr(key) + '\')">' +
    escHtml(label) +
    '<i data-lucide="' + icon + '" class="th-sort-ind" aria-hidden="true"></i>' +
    '</button></th>';
}

// N-247a: a sort re-renders the page through innerHTML, which destroys the
// focused header button — without this a keyboard user is dropped back on
// <body> after every sort. No-op when the header isn't on the page.
function focusSortHeader(key) {
  const btn = document.querySelector('#main-content .th-sort-btn[data-sort-key="' + CSS.escape(key) + '"]');
  if (btn) btn.focus();
}
