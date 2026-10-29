// js/org-chart.js — People module Org Chart page
// Renders a static line-and-box org chart from People/Assignments/LeadershipAccess
// plus relationship fields: Projects.CSDName and ReportsTo (People +
// LeadershipAccess). LCI and Transformation customers are ordinary Projects
// rows since N-363, so they need no special case here.
// Hybrid tree: Leadership (email/ReportsTo) → CSD (People, Level=CSD) →
// Project node (Projects.CSDName) → project-anchored team (Assignments.Customer).
// Unclaimed/orphaned projects pool in "Unassigned projects"; people with no
// current assignment pool in the Bench (buildBenchPool / isBenchAssignment,
// project-team.js — N-391). See build guide §0–§6.

// ── helpers ────────────────────────────────────────────────────────────
function _ocNorm(s)  { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }
function _ocEmail(s) { return (s || '').toLowerCase().trim(); }
function _ocEsc(s)   { return String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function _ocInitials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

// PhotoUrl holds a full URL (from upload) or a bare filename entered by hand;
// photoFileName() (utils.js) resolves either to the library filename.
// N-337: the <img> is rendered with NO src — hydratePhotoImgs() (ui-kit.js)
// sets it from a Graph download URL, because a plain SharePoint src needs a
// session cookie that some browsers never send cross-site (401).
// _ocPhotosReady settles when this page's photos have; exportOrgChartPdf waits
// on it so no avatar prints blank.
let _ocPhotosReady = Promise.resolve();
function _ocAvatar(name, photo) {
  const ini = _ocEsc(_ocInitials(name));
  const file = photoFileName(photo);
  return `<span class='org-avatar-wrap'>`
    + `<span class='org-avatar org-avatar--initials'>${ini}</span>`
    + (file ? `<img class='org-avatar org-avatar--img' data-photo='${_ocEsc(file)}' alt=''${actOn('error', 'ocHideImg', ACT_EL)}>` : '')
    + `</span>`;
}

// N-116: single source of truth in config.js; values are CSS tokens (style.css)
function _ocTypeColour(t){
  return CONFIG.PROJECT_TYPE_COLOUR_VARS[t] || CONFIG.PROJECT_TYPE_COLOUR_FALLBACK;
}

// ── page entry ─────────────────────────────────────────────────────────
async function renderOrgChart() {
  const main = document.getElementById('main-content');
  main.innerHTML = skeletonList(6);

  const [people, leadership, projectsByCSD, currentAssign] = await Promise.all([
    getPeople(true, true),                 // active only, sorted by Level; incl. placeholders
    getLeadershipAccess(),
    getProjectsByCSD(),                    // { csdNameLower: [projectRow,…] }
    getCurrentAssignmentsByEmployee(),     // { EmployeeName: [assignmentRow,…] }
  ]);

  const { roots, unassignedProjects, internalUnassigned } = buildOrgTree({ people, leadership, projectsByCSD, currentAssign });
  const bench = buildBenchPool(people, currentAssign);
  const monthYear = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  main.innerHTML = `
    <div class='page-header'>
      <h2>Org Chart</h2>
      <div style='display:flex;gap:8px'>
        <button class='btn-secondary'${act('ocSetAllCollapsed', false)}>Expand all</button>
        <button class='btn-secondary'${act('ocSetAllCollapsed', true)}>Collapse all</button>
        ${roleCan(_resolvedRole, 'peopleFull')
          ? `<button class='btn-secondary'${act('showPlaceholderManager')}>+ Placeholders</button>
             <button class='btn-secondary'${act('showOrgChartEditForm')}>Edit reporting lines</button>` : ''}
        <button class='print-btn'${act('exportOrgChartPdf')}>⎙ Export PDF</button>
      </div>
    </div>
    <div id='org-chart-page'>
      <div class='org-print-title'>Momentum Global - Org Chart - ${monthYear}</div>
      <div id='org-chart-canvas'>
        <div id='org-chart-inner'>
          ${renderTreeHtml(roots)}
          ${renderUnassignedProjectsHtml(unassignedProjects)}
          ${renderInternalUnassignedHtml(internalUnassigned)}
          ${renderBenchHtml(bench)}
        </div>
      </div>
    </div>`;
  _ocPhotosReady = hydratePhotoImgs(main, getPhotoUrlMap);   // N-337
  if (window.lucide) lucide.createIcons();
}

// ── org tree node builders (module scope — N-239c; previously closures
// nested inside buildOrgTree) ───────────────────────────────────────────

// Project node for a given CSD (by display name), with its team hung beneath.
// A placeholder drops its level band colour (the dashed treatment reads better on
// white) and shows "To be hired" in place of a location it doesn't have yet.
function _ocPersonNode(p) {
  const ph = !!p.IsPlaceholder;
  // N-304: internal staff have no Level — the function leads their sub-label
  // and they take no level band colour. N-402: an External partner hangs under
  // their project like any member, labelled Partner, with no band colour.
  const internal = isInternalStaff(p);
  const external = isExternalStaff(p);
  const lead = internal ? (p.StaffFunction || '') : external ? CONFIG.EXTERNAL_LABEL : (p.Level || '');
  return { kind: 'person', label: p.EmployeeName,
    // Placeholders carry no sub-label — the vacancy is stated in the name itself.
    sub: ph ? '' : `${lead}${p.Location ? ' · ' + p.Location : ''}`,
    // STP and PTP both render in the TP band colour (.org-node--tp) — no
    // separate CSS needed for either.
    _band: (ph || internal || external) ? '' : ((p.Level === 'STP' || p.Level === 'PTP') ? 'TP' : p.Level),
    // N-375: _key de-duplicates multi-project people in the collapsed-node count.
    _placeholder: ph, _photo: p.PhotoUrl, _key: 'p:' + _ocNorm(p.EmployeeName), children: [] };
}

// Shared by real and synthetic bubbles so the two can't drift apart: the SDM sits
// directly under the bubble and everyone else reports into the first SDM; with no
// SDM the team hangs straight off the bubble.
function _ocTeamChildren(members) {
  const byName = (a, b) => a.EmployeeName.localeCompare(b.EmployeeName);
  const sdms    = members.filter(p => p.Level === 'SDM').sort(byName);
  const reports = members.filter(p => p.Level !== 'SDM').sort(byName);
  if (!sdms.length) return reports.map(_ocPersonNode); // no SDM → team reports into the bubble
  const sdmNodes = sdms.map(_ocPersonNode);
  sdmNodes[0].children = reports.map(_ocPersonNode);   // TPs/STPs report into the SDM
  return sdmNodes;                                      // (extra SDMs sit as siblings)
}

function _ocProjectNode(proj, people, currentAssign) {
  const members = [];
  people.forEach(p => {
    // Placeholders anchor via People.PlaceholderProject, never via Assignments —
    // fake assignment rows would leak into utilisation, bench sync and the timeline.
    if (p.IsPlaceholder) {
      const pp = _ocNorm(p.PlaceholderProject);
      if (pp && pp === _ocNorm(proj.CustomerName)) members.push(p);
      return;
    }
    if ((currentAssign[p.EmployeeName] || [])
          .some(a => _ocNorm(a.Customer) === _ocNorm(proj.CustomerName))) {
      members.push(p);
    }
  });
  return { kind: 'project', label: proj.CustomerName,
           sub: proj.ProjectType || 'Project',
           _colour: _ocTypeColour(proj.ProjectType),
           children: _ocTeamChildren(members) };
}

// Synthetic bubbles: placeholder-only teams with NO Projects row at all. Keeps
// fictional/vacant teams out of the Projects list, and therefore out of Reporting.
function _ocSyntheticNodes(csd, people, realProjects) {
  const groups = {};
  people.forEach(p => {
    if (!p.IsPlaceholder) return;
    const name = String(p.PlaceholderProject || '').trim();
    if (!name || realProjects.has(_ocNorm(name))) return;   // real bubble wins
    if (_ocNorm(p.PlaceholderCSD) !== _ocNorm(csd.EmployeeName)) return;
    (groups[name] = groups[name] || []).push(p);
  });
  return Object.keys(groups).sort().map(name => ({
    kind: 'project', label: name,
    sub: CONFIG.ORG_PLACEHOLDER_PROJECT_TYPE,
    _colour: _ocTypeColour(CONFIG.ORG_PLACEHOLDER_PROJECT_TYPE),
    children: _ocTeamChildren(groups[name]),
  }));
}

// CSD node: children are the projects that CSD owns, plus any synthetic bubbles.
function _ocCsdNode(csd, projectsByCSD, people, currentAssign, realProjects) {
  const projs = projectsByCSD[_ocNorm(csd.EmployeeName)] || [];
  return { kind: 'csd', label: csd.EmployeeName,
           sub: `CSD${csd.Location ? ' · ' + csd.Location : ''}`,
           _email: _ocEmail(csd.ReportsTo), _photo: csd.PhotoUrl,
           _key: 'p:' + _ocNorm(csd.EmployeeName),          // N-375
           children: [...projs.map(p => _ocProjectNode(p, people, currentAssign)),
                      ..._ocSyntheticNodes(csd, people, realProjects)] };
}

// N-304: internal (non-deployable) staff -> one bubble per function, grouped and
// ordered by groupInternalByFunction() (utils.js); deployable rows in `people`
// are ignored. Coloured with the 'Internal' project-type token.
function _ocFunctionNodes(people) {
  return groupInternalByFunction(people).map(([fn, members]) => ({
    kind: 'function', label: fn, sub: CONFIG.STAFF_TYPE_INTERNAL,
    _colour: _ocTypeColour(CONFIG.STAFF_TYPE_INTERNAL),
    children: members.map(_ocPersonNode),
  }));
}

// Leadership node: children are leaders + CSDs whose ReportsTo == this email,
// then internal staff reporting to it, in function bubbles (N-304).
function _ocBuildLeader(leader, seen, leadership, csds, projectsByCSD, people, currentAssign, realProjects) {
  const email = _ocEmail(leader.UserEmail);
  if (seen.has(email)) return null;      // loop guard
  seen.add(email);
  const kids = [];
  leadership.filter(l => _ocEmail(l.ReportsTo) === email)
    .forEach(l => {
      const n = _ocBuildLeader(l, seen, leadership, csds, projectsByCSD, people, currentAssign, realProjects);
      if (n) kids.push(n);
    });
  csds.filter(c => _ocEmail(c.ReportsTo) === email)
    .forEach(c => kids.push(_ocCsdNode(c, projectsByCSD, people, currentAssign, realProjects)));
  kids.push(..._ocFunctionNodes(people.filter(p => _ocEmail(p.ReportsTo) === email)));
  return { kind: 'leader', label: leader.UserName || leader.UserEmail,
           sub: leader.JobTitle || 'Leadership', _photo: leader.PhotoUrl,
           _key: 'l:' + email, children: kids };                // N-375
}

// ── tree builder ───────────────────────────────────────────────────────
// Returns { roots, unassignedProjects }. Node = { kind, label, sub, children:[] }.
function buildOrgTree({ people, leadership, projectsByCSD, currentAssign }) {
  const csds = people.filter(p => p.Level === 'CSD');

  // Every real (Projects-list) customer name, so a synthetic bubble never duplicates one.
  // LCI / Transformation customers are real Projects rows since N-363, so they are in here too.
  const realProjects = new Set();
  Object.values(projectsByCSD).forEach(list =>
    list.forEach(pr => realProjects.add(_ocNorm(pr.CustomerName))));

  const seen = new Set();
  const roots = [];
  // Top of tree = leaders with blank ReportsTo.
  leadership.filter(l => !_ocEmail(l.ReportsTo))
    .forEach(l => {
      const n = _ocBuildLeader(l, seen, leadership, csds, projectsByCSD, people, currentAssign, realProjects);
      if (n) roots.push(n);
    });
  // Orphan CSDs (blank ReportsTo, or leader not found) become their own roots.
  csds.filter(c => !_ocEmail(c.ReportsTo) ||
        !leadership.some(l => _ocEmail(l.UserEmail) === _ocEmail(c.ReportsTo)))
    .forEach(c => roots.push(_ocCsdNode(c, projectsByCSD, people, currentAssign, realProjects)));

  // N-219 / N-363: unassigned pool = real projects with no CSD owner (the
  // `__unassigned__` bucket `getProjectsByCSD()` already produces). LCI and
  // Transformation projects are ordinary Projects rows, so they land here too.
  const unassignedProjects = (projectsByCSD['__unassigned__'] || [])
    .map(p => _ocProjectNode(p, people, currentAssign));
  // N-304 (DF-4): internal staff whose ReportsTo is blank or not a leader on
  // the chart pool here, by function — never in the Bench. Same rule as an
  // orphan CSD.
  const leaderEmails = new Set(leadership.map(l => _ocEmail(l.UserEmail)));
  const internalUnassigned = _ocFunctionNodes(people.filter(p =>
    !leaderEmails.has(_ocEmail(p.ReportsTo))));
  return { roots, unassignedProjects, internalUnassigned };
}

// N-391: buildBenchPool() moved to project-team.js.

// ── rendering ──────────────────────────────────────────────────────────
function renderTreeHtml(roots) {
  if (!roots.length) return `<p class='org-empty'>No reporting structure to display yet.</p>`;
  const node = (n) => {
    const style = n._colour
      ? ` style='border-color:${n._colour};background:${n._colour}1A'` : '';
    const avatar = (n.kind === 'project' || n.kind === 'function') ? '' : _ocAvatar(n.label, n._photo);
    const avCls  = avatar ? ' org-node--has-avatar' : '';
    const phCls  = n._placeholder ? ' org-node--placeholder' : '';
    const kids   = n.children || [];
    // Wide sibling rows blow out the chart width (and shrink the whole PDF), so
    // past the threshold they run vertically off a single spine instead — except
    // for the structural leadership/CSD rows, which always stay side-by-side.
    const canStack = !CONFIG.ORG_STACK_EXEMPT_KINDS.includes(n.kind);
    const ulCls  = (canStack && kids.length >= CONFIG.ORG_STACK_THRESHOLD)
      ? " class='org-stack'" : '';
    // N-375: people nodes with reports collapse/expand on click (class toggle on
    // the li, no re-render). The count pill is always rendered and CSS shows it
    // only while collapsed, so a toggle never needs lucide.createIcons() again.
    const collapsible = CONFIG.ORG_COLLAPSIBLE_KINDS.includes(n.kind) && kids.length > 0;
    const colCls   = collapsible ? ' org-node--collapsible' : '';
    const colAttrs = collapsible
      ? ` role='button' tabindex='0' aria-expanded='true'${act('ocToggleNode', ACT_EL)}${actOn('keydown', 'ocToggleNodeKey', ACT_EL, ACT_EVENT)}`
      : '';
    let countHtml = '';
    if (collapsible) {
      const count = orgSubtreePeopleCount(n);
      countHtml = `<div class='org-node__count'><i data-lucide='users'></i>${count} ${count === 1 ? 'person' : 'people'}</div>`;
    }
    return `
    <li>
      <div class='org-node org-node--${n.kind}${n._band ? ' org-node--' + _ocEsc(n._band.toLowerCase()) : ''}${avCls}${phCls}${colCls}'${style}${colAttrs}>
        ${avatar}
        <div class='org-node__name'>${_ocEsc(n.label)}</div>
        ${n.sub ? `<div class='org-node__sub'>${_ocEsc(n.sub)}</div>` : ''}
        ${countHtml}
      </div>
      ${kids.length ? `<ul${ulCls}>${kids.map(node).join('')}</ul>` : ''}
    </li>`;
  };
  return `<div class='org-tree'><ul>${roots.map(node).join('')}</ul></div>`;
}

function renderBenchHtml(bench) {
  if (!bench.length) return '';
  return `
    <div class='org-bench'>
      <div class='org-bench__title'>Unassigned (${bench.length})</div>
      <div class='org-bench__grid'>
        ${bench.map(p => `
          <div class='org-node org-node--bench org-node--has-avatar'>
            ${_ocAvatar(p.EmployeeName, p.PhotoUrl)}
            <div class='org-node__name'>${_ocEsc(p.EmployeeName)}</div>
            <div class='org-node__sub'>${_ocEsc(p.Level || '')}${
              p.Location ? ' · ' + _ocEsc(p.Location) : ''}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderUnassignedProjectsHtml(list) {
  if (!list.length) return '';
  return `
    <div class='org-unassigned'>
      <div class='org-unassigned__title'>Unassigned projects (${list.length})</div>
      ${renderTreeHtml(list)}
    </div>`;
}

// N-304 (DF-4): internal staff with no reporting line on the chart, by function.
function renderInternalUnassignedHtml(list) {
  if (!list.length) return '';
  const n = list.reduce((s, f) => s + f.children.length, 0);
  return `
    <div class='org-unassigned'>
      <div class='org-unassigned__title'>Internal — no reporting line (${n})</div>
      ${renderTreeHtml(list)}
    </div>`;
}

// ── landscape scale-to-fit PDF ─────────────────────────────────────────
async function exportOrgChartPdf() {
  const inner = document.getElementById('org-chart-inner');
  if (!inner) return;
  await _ocPhotosReady;   // N-337: never rejects; capped by CONFIG.PHOTO_SETTLE_MS
  // A4 landscape at 96dpi is ~717px of usable height. Subtract the print header
  // (~72px after diff 7 trims its margin), the title (~26px) and the tile padding
  // (~16px) and ~600px remains — so 600 left no headroom at all and a full-height
  // chart tipped onto a second page. 540 keeps a deliberate safety margin.
  const pageW = 1050, pageH = 540;                  // A4 landscape usable, minus header & title
  const scale = Math.min(1, pageW / inner.scrollWidth, pageH / inner.scrollHeight);
  inner.style.setProperty('--org-print-scale', scale);
  const monthYear = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  document.body.classList.add('org-printing');
  printPage(`MG Org Chart - ${monthYear}`, true, 'People');
  setTimeout(() => {
    document.body.classList.remove('org-printing');
    inner.style.removeProperty('--org-print-scale');
  }, 1200);
}

// ── placeholder management: add / edit / remove ────────────────────────
// Cached so the row buttons can pass an id only. Interpolating a name into an
// onclick attribute is the JS-string-in-HTML-attribute trap from N-012d, where
// escHtml is the wrong tool and an apostrophe breaks the button outright.
let _ocPlaceholders = [];

// CSD is deliberately absent: buildOrgTree() derives csds from Level==='CSD' with
// no placeholder check, so a placeholder CSD would render as a real CSD node, own
// projects, and appear in the reporting-lines editor. Derived from
// CONFIG.PEOPLE_LEVELS (minus CSD) rather than a separate hardcoded copy —
// stays in sync with the canonical order by construction.
const OC_PLACEHOLDER_LEVELS = CONFIG.PEOPLE_LEVELS.filter(l => l !== 'CSD');

function _ocFormError(msg) {
  const el = document.getElementById('ph-form-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

async function showPlaceholderManager() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading…</p>';
  const people = await getPeople(true, true);     // must opt in — default excludes them
  _ocPlaceholders = people.filter(p => p.IsPlaceholder)
    .sort((a, b) => (a.PlaceholderProject || '').localeCompare(b.PlaceholderProject || '')
                 || (a.EmployeeName || '').localeCompare(b.EmployeeName || ''));

  const rows = _ocPlaceholders.map(p => `
    <tr>
      <td>${_ocEsc(p.EmployeeName)}</td>
      <td>${_ocEsc(p.Level || '')}</td>
      <td>${_ocEsc(p.PlaceholderProject || '—')}</td>
      <td>${_ocEsc(p.PlaceholderCSD || '—')}</td>
      <td style='white-space:nowrap'>
        <button class='btn-secondary'${act('showPlaceholderForm', Number(p.id))}>Edit</button>
        <button class='btn-secondary'${act('deletePlaceholder', Number(p.id))}>Remove</button>
      </td>
    </tr>`).join('');

  main.innerHTML = `
    <div class='form-container' style='max-width:860px'>
      <h2>Placeholders</h2>
      <p style='color:var(--text-label);font-size:13px;margin-top:-6px'>
        Vacancies and fictional roles shown on the org chart. They never appear in
        headcount, utilisation, the Employees tab or any report.
      </p>
      ${_ocPlaceholders.length ? `
      <table class='data-table'>
        <thead><tr><th>Name</th><th>Level</th><th>Team</th><th>CSD owner</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : `<p class='org-empty'>No placeholders yet.</p>`}
      <div class='form-actions'>
        <button type='button' class='btn-primary'${act('showPlaceholderForm', null)}>Add placeholder</button>
        <button type='button' class='btn-secondary'${act('navigateToPeople', 'orgChart')}>Back to chart</button>
      </div>
    </div>`;
}

async function showPlaceholderForm(id = null) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading…</p>';
  const [people, projects] = await Promise.all([getPeople(true, true), getProjects(true)]);
  const existing = id ? people.find(p => String(p.id) === String(id)) : null;
  const csds = people.filter(p => p.Level === 'CSD' && !p.IsPlaceholder);
  // N-333: the internal project is not a client team (see getProjectsByCSD).
  const projNames = projects.filter(p => !isInternalProject(p)).map(p => p.CustomerName).filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const curTeam = existing ? String(existing.PlaceholderProject || '') : '';
  const matched = projNames.find(n => _ocNorm(n) === _ocNorm(curTeam)) || '';

  const levelOpts = OC_PLACEHOLDER_LEVELS.map(l =>
    `<option value='${l}' ${existing && existing.Level === l ? 'selected' : ''}>${l}</option>`).join('');
  const teamOpts = `<option value=''>— new team —</option>` + projNames.map(n =>
    `<option value='${_ocEsc(n)}' ${_ocNorm(n) === _ocNorm(matched) && matched ? 'selected' : ''}>${_ocEsc(n)}</option>`).join('');
  const csdOpts = `<option value=''>— choose —</option>` + csds.map(c =>
    `<option value='${_ocEsc(c.EmployeeName)}' ${
      existing && _ocNorm(c.EmployeeName) === _ocNorm(existing.PlaceholderCSD) ? 'selected' : ''
    }>${_ocEsc(c.EmployeeName)}</option>`).join('');

  main.innerHTML = `
    <div class='form-container' style='max-width:560px'>
      <h2>${existing ? 'Edit placeholder' : 'Add placeholder'}</h2>
      <div id='ph-form-error' class='form-error'></div>
      <div class='form-group'>
        <label>Name *</label>
        <input type='text' id='ph-name' value='${_ocEsc(existing ? existing.EmployeeName : '')}'
          placeholder='e.g. TBH — Talent Partner'>
      </div>
      <div class='form-group'>
        <label>Level *</label>
        <select id='ph-level'>${levelOpts}</select>
        <small style='color:var(--text-muted)'>SDM sits directly under the team bubble; STP/TP report into the SDM.</small>
      </div>
      <div class='form-group'>
        <label>Team *</label>
        <select id='ph-team'${actOn('change', '_ocTeamModeChanged')}>${teamOpts}</select>
      </div>
      <div class='form-group' id='ph-new-team-wrap'>
        <label>New team name *</label>
        <input type='text' id='ph-team-new'${actOn('input', '_ocCheckTeamName')}
          value='${_ocEsc(matched ? '' : curTeam)}' placeholder='e.g. Newton Dev'>
        <small id='ph-team-warn' style='color:var(--status-warn-text);display:none'></small>
      </div>
      <div class='form-group' id='ph-csd-wrap'>
        <label>CSD owner *</label>
        <select id='ph-csd'>${csdOpts}</select>
        <small style='color:var(--text-muted)'>Only needed for a new team — an existing project uses its own CSD.</small>
      </div>
      <div class='form-actions'>
        <button type='button' class='btn-primary'${act('savePlaceholder', ACT_EL, existing ? Number(existing.id) : null)}>Save</button>
        <button type='button' class='btn-secondary'${act('showPlaceholderManager')}>Cancel</button>
      </div>
    </div>`;
  _ocTeamModeChanged();
}

// A real project carries its own CSD (Projects.CSDName), so the owner picker and the
// free-text box are only relevant for a synthetic team.
function _ocTeamModeChanged() {
  const isNew = !document.getElementById('ph-team').value;
  document.getElementById('ph-new-team-wrap').style.display = isNew ? '' : 'none';
  document.getElementById('ph-csd-wrap').style.display      = isNew ? '' : 'none';
  if (isNew) _ocCheckTeamName();
}

// Warn rather than surprise: syntheticNodes() suppresses a synthetic bubble whose name
// matches a real project (the realProjects guard), so the placeholder would silently
// join that project instead of getting its own bubble.
function _ocCheckTeamName() {
  const warn = document.getElementById('ph-team-warn');
  const val  = _ocNorm(document.getElementById('ph-team-new').value);
  const opts = [...document.getElementById('ph-team').options]
    .map(o => _ocNorm(o.value)).filter(Boolean);
  if (val && opts.includes(val)) {
    warn.textContent = 'That matches an existing project — this placeholder will attach to it '
      + 'rather than creating a new team.';
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}

async function savePlaceholder(btn, id) {
  const name  = document.getElementById('ph-name').value.trim();
  const level = document.getElementById('ph-level').value;
  const sel   = document.getElementById('ph-team').value;
  const free  = document.getElementById('ph-team-new').value.trim();
  const csd   = document.getElementById('ph-csd').value;
  const team  = sel || free;

  if (!name) return _ocFormError('Name is required.');
  if (!team) return _ocFormError('Choose an existing team or type a new team name.');
  if (!sel && !csd) return _ocFormError('A new team needs a CSD owner.');

  setButtonLoading(btn);
  try {
    // PlaceholderCSD is only meaningful for a synthetic bubble; cleared for a real
    // project so a later rename of the project's CSD doesn't leave a stale value.
    const fields = { EmployeeName: name, Level: level, IsPlaceholder: true,
                     PlaceholderProject: team, PlaceholderCSD: sel ? '' : csd };
    if (id) {
      await updatePerson(id, fields);        // defaults NOT reapplied, so manual
    } else {                                 // SharePoint edits (e.g. PhotoUrl) survive
      await createPerson({ ...fields, IsActive: true, ...CONFIG.ORG_PLACEHOLDER_DEFAULTS });
    }
    showPlaceholderManager();
  } catch (e) {
    clearButtonLoading(btn);
    _ocFormError(`Error saving: ${e.message}`);
  }
}

async function deletePlaceholder(id) {
  const p = _ocPlaceholders.find(x => String(x.id) === String(id));
  const name = p ? p.EmployeeName : 'this placeholder';
  if (!(await confirmModal({
    title: `Remove placeholder "${name}"?`,
    message: 'This permanently deletes the row from the People list.',
    confirmLabel: 'Remove', danger: true,
  }))) return;
  try {
    await deleteItem('People', id);
    showPlaceholderManager();
  } catch (e) {
    toast(`Error removing placeholder: ${e.message}`, { type: 'error' });
  }
}

// ── in-app edit form: set Projects.CSDName + ReportsTo lines ────────────
async function showOrgChartEditForm() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading…</p>';
  const [people, leadership, projects] = await Promise.all([
    getPeople(true), getLeadershipAccess(), getProjects(true),
  ]);
  const csds = people.filter(p => p.Level === 'CSD');
  const csdOpts = (sel) => `<option value=''>— none —</option>` +
    csds.map(c => `<option value='${_ocEsc(c.EmployeeName)}' ${
      _ocNorm(c.EmployeeName) === _ocNorm(sel) ? 'selected' : ''
    }>${_ocEsc(c.EmployeeName)}</option>`).join('');

  const projRows = projects.map(p => `
    <tr>
      <td>${_ocEsc(p.CustomerName)}</td>
      <td><select data-proj='${p.id}'>${csdOpts(p.CSDName)}</select></td>
    </tr>`).join('');

  // ReportsTo editors for leadership + CSDs (both key upward by leader email).
  const leaderEmails = leadership.map(l => _ocEmail(l.UserEmail));
  const emailOpts = (sel) => `<option value=''>— top of tree —</option>` +
    leadership.map(l => `<option value='${_ocEsc(_ocEmail(l.UserEmail))}' ${
      _ocEmail(l.UserEmail) === _ocEmail(sel) ? 'selected' : ''
    }>${_ocEsc(l.UserName || l.UserEmail)}</option>`).join('');

  // N-281 (D-4): LeadershipAccess is admin-only edit, so the Leadership
  // "Reports to" rows render for admins only. saveOrgChartEdits() needs no
  // change: with no [data-lead] elements on the page it writes nothing to
  // LeadershipAccess. Leadership users keep the Project, LCI and CSD rows.
  const leaderRows = _resolvedRole !== 'admin' ? '' : leadership.map(l => `
    <tr>
      <td>${_ocEsc(l.UserName || l.UserEmail)} <span class='org-tag'>Leadership</span></td>
      <td><select data-lead='${l.id}'>${emailOpts(l.ReportsTo)}</select></td>
    </tr>`).join('');
  // N-304: internal staff key upward by leader email exactly like CSDs, and
  // save through the same People ReportsTo loop ([data-person]).
  const personRow = (p, tag) => `
    <tr>
      <td>${_ocEsc(p.EmployeeName)} <span class='org-tag'>${_ocEsc(tag)}</span></td>
      <td><select data-person='${p.id}'>${emailOpts(p.ReportsTo)}</select></td>
    </tr>`;
  const csdRows = csds.map(c => personRow(c, 'CSD')).join('');
  const internalRows = people.filter(p => isInternalStaff(p))
    .map(p => personRow(p, personRoleLabel(p))).join('');

  main.innerHTML = `
    <div class='form-container' style='max-width:760px'>
      <h2>Edit reporting lines</h2>
      <div id='org-edit-error' class='form-error'></div>
      <h3>Project → CSD owner</h3>
      <table class='data-table'><thead><tr><th>Project / customer</th><th>CSD</th></tr></thead>
        <tbody>${projRows}</tbody></table>
      <h3 style='margin-top:20px'>Reports to</h3>
      <table class='data-table'><thead><tr><th>Person</th><th>Reports to</th></tr></thead>
        <tbody>${leaderRows}${csdRows}${internalRows}</tbody></table>
      <div class='form-actions'>
        <button type='button' class='btn-primary'${act('saveOrgChartEdits', ACT_EL)}>Save changes</button>
        <button type='button' class='btn-secondary'${act('navigateToPeople', 'orgChart')}>Cancel</button>
      </div>
    </div>`;
}

async function saveOrgChartEdits(btn) {
  setButtonLoading(btn);
  try {
    const jobs = [];
    document.querySelectorAll('[data-proj]').forEach(el =>
      jobs.push(updateItem('Projects', el.getAttribute('data-proj'), { CSDName: el.value })));
    document.querySelectorAll('[data-lead]').forEach(el =>
      jobs.push(updateItem('LeadershipAccess', el.getAttribute('data-lead'), { ReportsTo: el.value })));
    document.querySelectorAll('[data-person]').forEach(el =>     // CSDs + internal staff (N-304)
      jobs.push(updateItem('People', el.getAttribute('data-person'), { ReportsTo: el.value })));
    await Promise.all(jobs);
    navigateToPeople('orgChart');
  } catch (e) {
    clearButtonLoading(btn);
    const err = document.getElementById('org-edit-error');
    if (err) { err.textContent = `Error saving: ${e.message}`; err.style.display = 'block'; }
  }
}

// N-302c: a broken avatar photo falls back to the initials badge underneath it.
// Wired as a delegated 'error' listener (capture phase, js/actions.js) because
// <img> load failures do not bubble.
function ocHideImg(img) {
  img.style.display = 'none';
}

// N-375: collapse / expand a person node's org. The class lives on the parent
// li so CSS can hide its child ul; aria-expanded mirrors it for screen readers.
function _ocSetCollapsed(el, collapsed) {
  el.parentElement.classList.toggle('org-collapsed', collapsed);
  el.setAttribute('aria-expanded', String(!collapsed));
}

function ocToggleNode(el) {
  _ocSetCollapsed(el, !el.parentElement.classList.contains('org-collapsed'));
}

// Enter / Space on a focused node (role=button); preventDefault stops Space scrolling.
function ocToggleNodeKey(el, e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  ocToggleNode(el);
}

// Header buttons: every collapsible node on the page — the main tree and both
// Unassigned sections alike (all three are rendered by renderTreeHtml).
function ocSetAllCollapsed(collapsed) {
  document.querySelectorAll('#org-chart-inner .org-node--collapsible')
    .forEach(el => _ocSetCollapsed(el, !!collapsed));
}

// N-302c: delegated actions for the Org Chart page, the Placeholders manager and
// the reporting-lines editor (js/actions.js).
registerActions({
  showPlaceholderManager,
  showPlaceholderForm,
  deletePlaceholder,
  savePlaceholder,
  showOrgChartEditForm,
  saveOrgChartEdits,
  exportOrgChartPdf,
  ocHideImg,
  ocToggleNode,
  ocToggleNodeKey,
  ocSetAllCollapsed,
  _ocTeamModeChanged,
  _ocCheckTeamName,
});
