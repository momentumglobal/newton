// js/employee-page.js — the employee record page (N-457 / MM-7)
//
// Every employee name on the Employee Tracker opens this page (employeeNameLinkHtml, called from people-tracker.js). It is a detail
// view of the Employee Tracker, not a router page: the sidebar keeps Employee Tracker highlighted (same pattern as role-page.js and
// project-page.js). It shows:
//   - the header (name, level / function, status), Back to the tracker, and Edit employee for Admin / People Ops;
//   - the Employment card, from CONFIG.EMPLOYEE_PAGE.EMPLOYMENT: the People fields, and the salary behind the same padlock the
//     tracker uses for the roles that may see pay;
//   - the My Details section, read-only, for Admin and People Ops only. Leadership gets no section and no read. Ghost Mode gets a
//     fixed panel and no read. The page never creates or writes a row: Edit details opens the N-456 form in My Momentum
//     (my-momentum.html#myDetails?person=<id>), which owns the stamp and the on-behalf rules.
// Desktop only; people.html only (never mobile.html, Newton for Claude or the Command Bar). Graph reads go through api.js helpers and
// getMyDetails (api-my-details.js); the rules are pure functions in employee-logic.js. The details row is held in local variables and
// the DOM only, never in module state, storage, a toast or the console.
// Deep link: people.html#peopleTracker?action=record&id=N (people-app.js).

let _epSeq = 0;               // render token: drops a stale async render
let _epSalaryShown = false;   // reset on every open

// ── Markup (pure) ───────────────────────────────────────────────────────

// The tracker's name cell. A pending (optimistic) row has no real id yet, so it stays plain text.
function employeeNameLinkHtml(p, pending) {
  const name = escHtml(p.EmployeeName);
  if (pending) return name;
  return `<a href="#"${act('openEmployeePage.prevent', Number(p.id))}>${name}</a>`;
}

function epBackButtonHtml() {
  return `<button type="button" class="btn-secondary"${act('navigateToPeople', 'peopleTracker')}>${escHtml(CONFIG.EMPLOYEE_PAGE.TEXT.back)}</button>`;
}

function epRowHtml(r, salaryShown) {
  const T = CONFIG.EMPLOYEE_PAGE.TEXT;
  let val;
  if (r.kind === 'salary' && r.value) {
    val = `<span id="emp-sal-masked" class="${salaryShown ? 'is-hidden' : ''}">••••••
        <button type="button" class="btn-padlock" title="${escAttr(T.revealSalary)}"${act('epRevealSalary')}>🔒</button></span>
      <span id="emp-sal-revealed" class="${salaryShown ? '' : 'is-hidden'}">${escHtml(r.value)}
        <button type="button" class="btn-padlock" title="${escAttr(T.hideSalary)}"${act('epHideSalary')}>🔓</button></span>`;
  } else {
    val = escHtml(r.value || T.dash);
  }
  return `<div class="emp-row"><dt>${escHtml(r.label)}</dt><dd>${val}</dd></div>`;
}

// The My Details section's frame. mode = epDetailsMode(): 'none' draws nothing at all.
function epDetailsShellHtml(mode, person) {
  const T = CONFIG.EMPLOYEE_PAGE.TEXT;
  if (mode === 'none') return '';
  const edit = mode === 'view'
    ? `<a class="btn-secondary" href="${escAttr(epEditDetailsHref(person.id))}">${escHtml(T.editDetails)}</a>`
    : '';
  const body = mode === 'ghost' ? `<p class="ppl-muted-note">${escHtml(mdText('ghost'))}</p>` : skeletonPanel(4);
  return `<section class="emp-details">
      <div class="emp-section-head"><h2 class="emp-section-title">${escHtml(T.detailsTitle)}</h2>${edit}</div>
      <p class="ppl-card-hint">${escHtml(T.detailsHint)}</p>
      <div id="emp-details-body">${body}</div>
    </section>`;
}

// m = { person, rows, canEdit, mode, salaryShown, payDenied, token }
function epPageHtml(m) {
  const T = CONFIG.EMPLOYEE_PAGE.TEXT;
  const p = m.person;
  const badge = `<span class="badge badge-${p.IsActive ? 'active' : 'inactive'}">${p.IsActive ? 'Active' : 'Inactive'}</span>`;
  const edit = m.canEdit ? `<button type="button" class="btn-primary"${act('showEditPersonForm', Number(p.id))}>${escHtml(T.edit)}</button>` : '';
  const payNote = m.payDenied ? `<p class="ppl-muted-note">${escHtml(CONFIG.PEOPLE_PAY_DENIED_TEXT)}</p>` : '';
  const rows = m.rows.map(r => epRowHtml(r, m.salaryShown)).join('');
  return `<div class="emp-page" data-emp-page-token="${escAttr(m.token)}">
    <div class="page-header">
      <div>
        <h1 class="page-title">${escHtml(p.EmployeeName || T.dash)}</h1>
        <p class="ppl-muted-note">${escHtml(personRoleLabel(p) || T.dash)} ${badge}</p>
      </div>
      <div class="emp-actions">${epBackButtonHtml()}${edit}</div>
    </div>
    <section class="ppl-card emp-card">
      <h2 class="ppl-card-title">${escHtml(T.employment)}</h2>
      ${payNote}
      <dl class="emp-list">${rows}</dl>
    </section>
    ${epDetailsShellHtml(m.mode, p)}
  </div>`;
}

function epDetailsCardsHtml(groups) {
  const T = CONFIG.EMPLOYEE_PAGE.TEXT;
  return groups.map(g => `<section class="ppl-card emp-card">
      <h3 class="ppl-card-title">${escHtml(g.title)}</h3>
      <dl class="emp-list">${g.rows.map(r => `<div class="emp-row"><dt>${escHtml(r.label)}</dt><dd>${escHtml(r.value || T.dash)}</dd></div>`).join('')}</dl>
    </section>`).join('');
}

// The My Details body once the read is back. res = getMyDetails() -> { row, denied }. A denied list is a misconfiguration for these
// roles and is reported as one, never shown as "no details".
function epDetailsBodyHtml(res, person, people) {
  const T = CONFIG.EMPLOYEE_PAGE.TEXT;
  if (res && res.denied) return `<p class="ppl-muted-note">${escHtml(mdText('noAccessAdmin'))}</p>`;
  const note = _epStr(person && person.WorkEmail).trim() ? '' : `<p class="ppl-muted-note">${escHtml(mdText('noWorkEmailNote'))}</p>`;
  const row = res ? res.row : null;
  if (!epHasDetails(row)) return note + `<p class="ppl-muted-note">${escHtml(T.noDetails)}</p>`;
  const D = CONFIG.MY_MOMENTUM.DETAILS;
  const stamp = mdStampLine(row, email => epNameByEmail(people, email), false);
  return note + epDetailsCardsHtml(epDetailsRows(row, D.FIELDS, D.GROUPS))
    + (stamp ? `<p class="ppl-muted-note">${escHtml(stamp)}</p>` : '');
}

// ── Load and render ─────────────────────────────────────────────────────

// Resolves to { person, people, payDenied }, or null when the person is not available (bad id, not found, a placeholder).
// Throws only on a genuine failure. One People read serves the person, the line manager's name and the stamp's name.
async function _epLoad(id, role) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const canSalary = roleCan(role, 'peopleFull');
  const [people, payRows] = await Promise.all([
    getPeople(false, true),
    canSalary ? getPeoplePay() : Promise.resolve([]),
  ]);
  const found = people.find(p => String(p.id) === String(id));
  if (!found || found.IsPlaceholder) return null;
  const person = canSalary ? attachSalaries([found], payRows)[0] : found;
  return { person, people, payDenied: canSalary && wasListDenied('PeoplePay') };
}

async function openEmployeePage(personId) {
  const role = _resolvedRole;
  if (!epCanOpen(role)) return;
  _peopleCurrentPage = 'peopleTracker';
  updateNavActiveLink('peopleTracker');
  _epSalaryShown = false;
  const T = CONFIG.EMPLOYEE_PAGE.TEXT;
  const id = Number(personId);
  const main = document.getElementById('main-content');
  const token = String(++_epSeq);
  main.innerHTML = `<div class="emp-page" data-emp-page-token="${escAttr(token)}">${skeletonPanel(6)}</div>`;
  const stillHere = () => !!main.querySelector(`[data-emp-page-token="${token}"]`);
  let data;
  try {
    data = await _epLoad(id, role);
  } catch (e) {
    console.warn('N-457: employee page load failed', e && e.message);
    if (!stillHere()) return;
    main.innerHTML = `<div class="emp-page">${epBackButtonHtml()}${pageErrorBlock({
      message: T.loadFailed,
      retryAct: ['openEmployeePage', Number.isInteger(id) ? id : 0],
    })}</div>`;
    lucide.createIcons();
    return;
  }
  if (!stillHere()) return;       // the user navigated away mid-load
  if (!data) {
    renderBreadcrumb('peopleTracker');
    main.innerHTML = `<div class="emp-page">${epBackButtonHtml()}<p class="ppl-muted-note">${escHtml(T.unavailable)}</p></div>`;
    return;
  }
  const mode = epDetailsMode(role, getGhostUser());
  renderBreadcrumb('peopleTracker', data.person.EmployeeName);
  main.innerHTML = epPageHtml({
    person: data.person,
    rows: epEmploymentRows(data.person, data.people, { canSalary: roleCan(role, 'peopleFull') }),
    canEdit: roleCan(role, 'peopleEdit'),
    mode,
    salaryShown: _epSalaryShown,
    payDenied: data.payDenied,
    token,
  });
  lucide.createIcons();
  // After the page has painted, so the employment fields never wait on the personal-data read. Only 'view' reads.
  if (mode === 'view') _epLoadDetails(data.person, data.people, token);
}

// Read-only My Details. Reads one row (Admin / People Ops hold list-level read), draws it, keeps nothing.
async function _epLoadDetails(person, people, token) {
  const slot = () => document.querySelector(`[data-emp-page-token="${token}"] #emp-details-body`);
  let res;
  try {
    res = await getMyDetails(person.id);
  } catch (e) {
    console.warn('N-457: details read failed', e && e.message);
    const failed = slot();
    if (failed) failed.innerHTML = `<p class="ppl-muted-note">${escHtml(CONFIG.EMPLOYEE_PAGE.TEXT.detailsLoadFailed)}</p>`;
    return;
  }
  const body = slot();
  if (!body) return;              // navigated away: nothing is drawn, nothing is kept
  body.innerHTML = epDetailsBodyHtml(res, person, people);
}

// The salary padlock. Local to this page (the tracker's own reveal uses different element ids).
function _epSalaryToggle(show) {
  _epSalaryShown = show;
  const masked = document.getElementById('emp-sal-masked');
  const shown = document.getElementById('emp-sal-revealed');
  if (masked) masked.classList.toggle('is-hidden', show);
  if (shown) shown.classList.toggle('is-hidden', !show);
}
function epRevealSalary() { _epSalaryToggle(true); }
function epHideSalary() { _epSalaryToggle(false); }

registerActions({
  openEmployeePage,
  epRevealSalary,
  epHideSalary,
});