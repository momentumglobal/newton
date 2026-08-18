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
// LOAD ORDER: after utils.js (isProjectActive, sortProjectsByName,
// buildProjectOptionsHtml, escHtml) and api.js (getProjects,
// getUserProjectIds), and BEFORE pages.js, which calls everything here.
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

// N-151: the count that makes a narrowed list legible as narrowed.
// `fetched` is what the query returned (after the date window, before any
// client-side filter); `shown` is what actually renders. The window label is
// ALWAYS present — including for "All time" — so this line can never be read
// as "these are all the records" while a window is active.
function listResultCount(shown, fetched, weeks, noun) {
  const label = dateWindowLabel(weeks);
  const body  = shown === fetched
    ? shown + ' ' + noun + (shown === 1 ? '' : 's')
    : 'Showing ' + shown + ' of ' + fetched;
  return '<div class="list-result-count">' + escHtml(body + ' \u00b7 ' + label) + '</div>';
}
