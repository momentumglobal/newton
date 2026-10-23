// js/project-page.js — the Project page (N-364 / PT-4; Project Team N-365 / PT-5)
//
// Every project name on the Projects list opens this page (pages.js
// projectNameLinkHtml). It is a detail view of the Projects page, not a router
// page — same pattern as the role page (role-page.js) — so the sidebar keeps
// Projects highlighted. It shows:
//   - the project header: customer, type, status, dates, Lead DM
//     (Projects.DeliveryManager — D-5), with Edit project / Copy link;
//   - the Project Team (N-365): the project's Assignments rows (by ProjectID).
//     Editors (canEditProjectTeam, permissions.js — Admin / Leadership / People
//     Ops on any project, a DM on a project in their scope) add, edit and
//     delete members, see rates / fees, and set the Lead DM, which writes
//     Projects.DeliveryManager. Everyone else sees names, dates and Billed —
//     never a rate (design rule 6). Every save re-syncs that person's bench rows
//     (resyncBenchFor, api.js — design rule 4) and warns before ending or
//     removing a TP who still owns open roles here (design rule 5);
//   - the project's checklist, when it has one (checklistBodyHtml /
//     mountChecklistView, checklists.js).
// Desktop only — this file is loaded on reporting.html only.
// Deep link: reporting.html#projects?action=project&id=N. The older
// #projects?action=checklist&id=N link still works: openChecklist('project')
// redirects here. Graph calls are api.js helpers; the rules are pure functions
// in utils.js (projectPageFields) and project-team.js (pt*).

let _ppSeq  = 0;      // render token — drops a stale async render
let _pp     = null;   // state of the project page on screen
let _ppBusy = false;  // one Project Team write at a time (N-106 double-click guard)
let _ppSlaBusy = false;  // one SLA targets write at a time (N-382)

async function openProjectPage(projectId) {
  if (!canAccess('projects', _resolvedRole)) return;
  currentPage = 'projects';
  updateNavActiveLink('projects');
  const id    = Number(projectId);
  const main  = document.getElementById('main-content');
  const token = String(++_ppSeq);
  main.innerHTML = `<div class="project-page" data-project-page-token="${token}">${skeletonPanel(6)}</div>`;
  const stillHere = () => !!main.querySelector(`[data-project-page-token="${token}"]`);
  let data;
  try {
    data = await _ppLoad(id);
  } catch (e) {
    console.error('Project page load failed:', e);
    if (!stillHere()) return;
    main.innerHTML = `<div class="project-page">${_ppHeaderHtml(null)}${pageErrorBlock({
      message: "This project couldn't be loaded.",
      retryAct: ['openProjectPage', Number.isInteger(id) ? id : 0],
    })}</div>`;
    lucide.createIcons();
    return;
  }
  if (!stillHere()) return;       // the user navigated away mid-load
  if (!data) {
    renderBreadcrumb('projects');
    main.innerHTML = `<div class="project-page">${_ppHeaderHtml(null)}
      <p class="checklist-unavailable">This project isn't available.</p></div>`;
    lucide.createIcons();
    return;
  }
  _pp = data;
  _ppBusy = false;
  _ppSlaBusy = false;
  renderBreadcrumb('projects', data.title);
  main.innerHTML = _ppPageHtml(data);
  if (data.checklist && !data.checklist.error) mountChecklistView(data.checklist);
  if (document.getElementById('pp-sla-panel')) mountProjectSlaPanel('pp-sla-panel', data.project);   // N-384
  lucide.createIcons();
}

// Resolves to the page model, or null when the project isn't available to
// this user (bad id, not found, out of scope). Throws only on a genuine failure.
async function _ppLoad(id) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const email = getCurrentUser().email;
  const canViewSla = canViewSlaTargets(_resolvedRole);   // N-382
  const [projects, userProjectIds, dmMap, checklist, team, sla] = await Promise.all([
    getProjects(false),
    getUserProjectIds(email),
    getTalentPartnerDisplayMap(),
    loadProjectChecklistView(id),   // null = no checklist; never throws
    _ppLoadTeam(id),                // { error: true } on failure; never throws
    canViewSla ? _ppLoadSla() : null,   // N-382: { rows } or { error: true }; never throws
  ]);
  const project = projects.find(p => String(p.id) === String(id));
  if (!project) return null;
  // N-365 (S-1): Admin / Leadership / People Ops see every project.
  const allProjects = seesAllProjects(_resolvedRole);
  if (!allProjects && userProjectIds !== null && !userProjectIds.includes(String(id))) return null;
  const todayISO = localDayISO();
  if (!team.error) team.rows = ptSortTeam(team.rows, todayISO);
  return {
    projectId: id, project, dmMap, checklist, team, todayISO,
    title:       project.CustomerName || '—',
    canEdit:     canEditProjectRows(_resolvedRole),
    canEditTeam: canEditProjectTeam(_resolvedRole, id, userProjectIds),
    mode:        null,    // null | 'add' | assignment id in edit
    sla, canViewSla,
    canEditSla:  canEditSlaTargets(_resolvedRole, 'override'),
    slaMode:     null,    // null | 'edit' (N-382)
  };
}

// The SLATargets rows for the SLA targets section (N-382). Never throws: a failure is
// { error: true } and the rest of the page still renders.
async function _ppLoadSla() {
  try {
    return { rows: await getSLATargets() };
  } catch (e) {
    console.warn('SLA targets load failed:', e);
    return { error: true };
  }
}

// The Project Team data. Never throws: a failure is { error: true } and the
// rest of the page still renders.
async function _ppLoadTeam(id) {
  try {
    const [rows, ua, people, roles] = await Promise.all([
      getAssignments({ projectId: id }),
      getItems('UserAssignments'),
      getPeople(true),
      getRolesForProject(id),
    ]);
    return {
      rows, people, roles,
      emailIndex: ptEmailIndex(ua),
      roleByEmail: ptRoleByEmail(ua),
    };
  } catch (e) {
    console.warn('Project Team load failed:', e);
    return { error: true };
  }
}

function _ppOnScreen(v) {
  return !!(v && _pp === v &&
    document.querySelector(`#main-content [data-project-page="${Number(v.projectId)}"]`));
}

// ── Markup ──────────────────────────────────────────────────────────

function _ppHeaderHtml(v) {
  const id = v ? Number(v.projectId) : 0;
  return `
    <div class="page-header">
      <div class="checklist-heading">
        <h2>${escHtml(v ? v.title : 'Project')}</h2>
        ${v ? '<p class="checklist-subtitle">Project</p>' : ''}
      </div>
      <div class="page-header-actions">
        ${v && v.canEdit ? `<button class="btn-secondary"${act('showEditProjectForm', id)}><i data-lucide="pencil" aria-hidden="true"></i> Edit project</button>` : ''}
        ${v ? `<button class="btn-secondary"${act('copyProjectLink', id)}><i data-lucide="link" aria-hidden="true"></i> Copy link</button>` : ''}
        <button class="btn-secondary"${act('navigateTo', 'projects')}>← Back to Projects</button>
      </div>
    </div>`;
}

function _ppFieldsHtml(v) {
  return projectPageFields(v.project, v.dmMap).map(f => {
    const value = f.label === 'Status' && v.project.Status
      ? `<span class="badge badge-${escAttr(String(v.project.Status).toLowerCase())}">${escHtml(f.value)}</span>`
      : escHtml(f.value);
    return `<div class="project-field"><span class="project-field-label">${escHtml(f.label)}</span><span class="project-field-value">${value}</span></div>`;
  }).join('');
}

function _ppPageHtml(v) {
  const ck = v.checklist;
  let checklistHtml = '';
  if (ck && ck.error) {
    checklistHtml = `
      <section class="role-page-section">
        <h3 class="role-page-section-title">Checklist</h3>
        <p class="checklist-unavailable">The checklist couldn't be loaded.</p>
      </section>`;
  } else if (ck) {
    checklistHtml = `
      <section class="role-page-section">
        <h3 class="role-page-section-title">Checklist · ${escHtml(checklistVariantLabel(ck.variant))}</h3>
        ${checklistBodyHtml(ck)}
      </section>`;
  }
  return `
    <div class="project-page" data-project-page="${Number(v.projectId)}">
      ${_ppHeaderHtml(v)}
      <div class="project-fields" id="pp-fields">${_ppFieldsHtml(v)}</div>
      ${_ppSlaSectionHtml(v)}
      ${_ppSlaPanelSectionHtml(v)}
      <section class="role-page-section pp-team" id="pp-team">${_ppTeamHtml(v)}</section>
      ${checklistHtml}
    </div>`;
}

// ── SLA targets markup (N-382 / DA-2) ───────────────────────────────

// The whole section, or '' when this viewer can't see SLAs or the project can't have them
// (LCI / Transformation / Internal). Re-rendered into #pp-sla by _ppRenderSla.
function _ppSlaSectionHtml(v) {
  if (!v.canViewSla || !v.sla || !slaEditorModel(v.project, [])) return '';
  return `<section class="role-page-section pp-sla" id="pp-sla">${_ppSlaHtml(v)}</section>`;
}

// N-384 (DA-4): the SLA panel's slot (sla-panel.js fills it after the page renders), or '' when
// this viewer can't see it or the project can't have SLAs. The section is the slot.
function _ppSlaPanelSectionHtml(v) {
  if (!canViewSlaPanel(_resolvedRole) || !slaEditorModel(v.project, [])) return '';
  return `<section class="role-page-section pp-sla-panel sla-panel" id="pp-sla-panel"></section>`;
}

function _ppSlaHtml(v) {
  if (v.sla.error) {
    return `
      <h3 class="role-page-section-title">SLA targets</h3>
      <p class="checklist-unavailable">SLA targets couldn't be loaded.</p>`;
  }
  const model = slaEditorModel(v.project, v.sla.rows);
  const editing = v.slaMode === 'edit' && v.canEditSla;
  const head = `
      <div class="role-hc-head">
        <h3 class="role-page-section-title">SLA targets</h3>
        ${v.canEditSla && !editing ? `<button type="button" class="btn-secondary btn-sm"${act('ppSlaEdit')}>Edit targets</button>` : ''}
      </div>`;
  const rows = model.metrics.map(m => {
    if (editing) {
      const ph = m.defaultValue !== null ? slaFormatTarget(m.defaultValue, m) + ' — default' : 'No default';
      const step = m.decimals > 0 ? (1 / Math.pow(10, m.decimals)).toFixed(m.decimals) : '1';
      return `
            <tr>
              <td><label for="pp-sla-${escAttr(m.key)}">${escHtml(m.label)}</label></td>
              <td><input type="number" class="sla-input" id="pp-sla-${escAttr(m.key)}" min="0" max="${escAttr(CONFIG.SLA.MAX_VALUE)}" step="${step}" inputmode="decimal" placeholder="${escAttr(ph)}" value="${escAttr(m.overrideValue === null ? '' : m.overrideValue)}"> <span class="sla-unit">${escHtml(m.unit)}</span></td>
            </tr>`;
    }
    const src = m.effective.source === 'override' ? 'Override' : 'Default';
    const note = m.effective.source === 'override' && m.defaultValue !== m.effective.value
      ? `<div class="sla-default-note">Default: ${escHtml(slaFormatTarget(m.defaultValue, m))}</div>` : '';
    return `
            <tr>
              <td>${escHtml(m.label)}</td>
              <td>${escHtml(slaFormatTarget(m.effective.value, m))}${note}</td>
              <td>${m.effective.source ? `<span class="checklist-tag">${src}</span>` : '—'}</td>
            </tr>`;
  }).join('');
  const table = editing
    ? `<table class="data-table pp-sla-table"><thead><tr><th>Metric</th><th>Override</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<table class="data-table pp-sla-table"><thead><tr><th>Metric</th><th>Target</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>`;
  const form = editing ? `
      <p class="sla-hint">Leave a box blank to use the ${escHtml(v.project.ProjectType || '')} default.</p>
      <div id="pp-sla-error" class="form-error"></div>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="pp-sla-save"${act('ppSlaSave')}>Save</button>
        <button type="button" class="btn-secondary"${act('ppSlaCancel')}>Cancel</button>
        ${model.overrideRow ? `<button type="button" class="btn-secondary"${act('ppSlaReset')}>Reset to defaults</button>` : ''}
      </div>` : '';
  return `${head}
      <div class="table-scroll">${table}</div>${form}`;
}

// ── Project Team markup (N-365) ─────────────────────────────────────

function _ppTeamHtml(v) {
  const t = v.team;
  if (t.error) {
    return `
      <h3 class="role-page-section-title">Project Team</h3>
      <p class="checklist-unavailable">The project team couldn't be loaded.</p>`;
  }
  const edit = v.canEditTeam;
  const cols = 6 + (edit ? 2 : 0);
  const leadIds = edit ? ptLeadDmCandidates(t.rows, t.roleByEmail) : [];
  const body = t.rows.length
    ? t.rows.map(r => _ppMemberRowHtml(v, r, leadIds)).join('')
    : `<tr><td colspan="${cols}" class="role-hc-empty">No one on this project yet.</td></tr>`;
  return `
      <div class="role-hc-head">
        <h3 class="role-page-section-title">Project Team</h3>
        ${edit && v.mode === null ? `<button type="button" class="btn-secondary btn-sm"${act('ppStartAddMember')}>+ Add member</button>` : ''}
      </div>
      ${edit && v.mode !== null ? _ppMemberFormHtml(v) : ''}
      <div class="table-scroll">
        <table class="data-table role-hc-table pp-team-table">
          <thead><tr>
            <th>Name</th><th>Level</th><th>Start</th><th>End</th><th>Status</th><th>Billed</th>${edit ? '<th>Rate / Fees</th><th></th>' : ''}
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
}

function _ppMemberRowHtml(v, r, leadIds) {
  const id     = Number(r.id);
  const status = ptMemberStatus(r, v.todayISO);
  const lead   = isLeadDmAssignment(r);
  const tags   = (lead ? '<span class="checklist-tag">Lead DM</span>' : '') +
    (v.canEditTeam && !String(r.UserEmail || '').trim() ? '<span class="checklist-tag">No login</span>' : '');
  let edit = '';
  if (v.canEditTeam) {
    const actions = [
      `<a href="#"${act('ppEditMember.prevent', id)}>Edit</a>`,
      `<a href="#"${act('ppDeleteMember.prevent', id)}>Delete</a>`,
    ];
    if (lead) actions.push(`<a href="#"${act('ppClearLeadDm.prevent')}>Remove Lead DM</a>`);
    else if (leadIds.includes(String(r.id))) actions.push(`<a href="#"${act('ppSetLeadDm.prevent', id)}>Make Lead DM</a>`);
    edit = `
              <td>${escHtml(assignmentRateLabel(r))}</td>
              <td><div class="row-actions">${actions.join('')}</div></td>`;
  }
  return `
            <tr class="pp-member pp-member--${status}">
              <td>${escHtml(r.EmployeeName || '—')}${tags}</td>
              <td>${escHtml(r.Level || '—')}</td>
              <td>${spDateIn(r.StartDate) || '—'}</td>
              <td>${spDateIn(r.EndDate) || '—'}</td>
              <td>${escHtml(PT_MEMBER_STATUS_LABELS[status])}</td>
              <td>${escHtml(r.Billed || '—')}</td>${edit}
            </tr>`;
}

// The add / edit panel. Rate inputs follow the PROJECT's type (fixed on this
// page): split-fee types take Retainer + Placement fee, the rest a monthly rate.
function _ppMemberFormHtml(v) {
  const isCreate = v.mode === 'add';
  const row = isCreate ? null : v.team.rows.find(r => String(r.id) === String(v.mode));
  if (!isCreate && !row) return '';
  const split = CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(v.project.ProjectType);
  const val = (k, fallback = '') => escAttr(row && row[k] != null ? row[k] : fallback);
  const personField = isCreate
    ? `<select id="pp-m-person" required${actOn('change', 'ppMemberFormChange')}>
              <option value="">— Select person —</option>
              ${ptTeamPickerPeople(v.team.people, v.project).map(p =>
                `<option value="${escAttr(p.EmployeeName)}">${escHtml(p.EmployeeName)} (${escHtml(personRoleLabel(p) || '—')})</option>`).join('')}
            </select>
            <span class="form-hint is-hidden" id="pp-m-login-hint">No Newton login matched — they'll show on the team but get no access.</span>`
    : `<input type="text" id="pp-m-person" value="${escAttr(row.EmployeeName || '')}" readonly aria-readonly="true" class="pp-readonly">`;
  return `
      <div class="role-hc-add pp-member-form">
        <div id="pp-m-error" class="form-error"></div>
        <div class="form-row role-hc-add-row">
          <div class="form-group">
            <label for="pp-m-person">Person *</label>
            ${personField}
          </div>
          <div class="form-group">
            <label for="pp-m-start">Start Date *</label>
            <input type="date" id="pp-m-start" required value="${escAttr(spDateIn(row && row.StartDate) || '')}">
          </div>
          <div class="form-group">
            <label for="pp-m-end">End Date *</label>
            <input type="date" id="pp-m-end" required value="${escAttr(spDateIn(row && row.EndDate) || '')}">
          </div>
          <div class="form-group">
            <label for="pp-m-country">Country *</label>
            <input type="text" id="pp-m-country" required value="${val('Country')}">
          </div>
        </div>
        <div class="form-row role-hc-add-row">
          <div class="form-group">
            <label for="pp-m-billed">Billed? *</label>
            <select id="pp-m-billed"${actOn('change', 'ppMemberFormChange')}>
              <option value="Yes"${!row || row.Billed !== 'No' ? ' selected' : ''}>Yes</option>
              <option value="No"${row && row.Billed === 'No' ? ' selected' : ''}>No</option>
            </select>
          </div>
          ${split ? `
          <div class="form-group pp-m-paid">
            <label for="pp-m-retainer">Retainer (£)</label>
            <input type="number" id="pp-m-retainer" min="0" step="0.01" value="${val('RetainerFee')}">
          </div>
          <div class="form-group pp-m-paid">
            <label for="pp-m-placement">Placement Fee (£)</label>
            <input type="number" id="pp-m-placement" min="0" step="0.01" value="${val('PlacementFee')}">
          </div>` : `
          <div class="form-group pp-m-paid">
            <label for="pp-m-rate">Monthly Bill Rate (£)</label>
            <input type="number" id="pp-m-rate" min="0" step="0.01" value="${val('MonthlyBillRate')}">
          </div>`}
        </div>
        <div class="form-group">
          <label class="role-hc-check"><input type="checkbox" id="pp-m-forecast"${row && isForecastAssignment(row) ? ' checked' : ''}> Forecast assignment (excluded from utilisation)</label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-primary" id="pp-m-save"${act('ppSaveMember')}>${isCreate ? 'Add member' : 'Save changes'}</button>
          <button type="button" class="btn-secondary"${act('ppCancelMember')}>Cancel</button>
        </div>
      </div>`;
}

// ── Re-render ───────────────────────────────────────────────────────

function _ppRenderTeam(v) {
  const el = document.getElementById('pp-team');
  if (!el || !_ppOnScreen(v)) return;
  el.innerHTML = _ppTeamHtml(v);
  const fields = document.getElementById('pp-fields');
  if (fields) fields.innerHTML = _ppFieldsHtml(v);
  if (v.mode !== null) ppMemberFormChange();
  lucide.createIcons();
}

function _ppRenderSla(v) {
  const el = document.getElementById('pp-sla');
  if (!el || !_ppOnScreen(v)) return;
  el.innerHTML = _ppSlaHtml(v);
  lucide.createIcons();
}

// Re-reads the project + its team after a write, then re-renders. Never
// throws — the write it follows has already succeeded.
async function _ppRefresh(v) {
  try {
    const [projects, team] = await Promise.all([getProjects(false), _ppLoadTeam(v.projectId)]);
    const project = projects.find(p => String(p.id) === String(v.projectId));
    if (project) v.project = project;
    if (team.error) throw new Error('team reload failed');
    team.rows = ptSortTeam(team.rows, v.todayISO);
    v.team = team;
  } catch (e) {
    console.warn('Project page refresh failed:', e);
    toast("Saved, but this page couldn't refresh — reload to see the change.", { type: 'error' });
  }
  _ppRenderTeam(v);
}

// One Project Team handler at a time; does nothing while another is running,
// when the page has gone, or for a user who can't edit this team.
async function _ppRun(fn) {
  const v = _pp;
  if (_ppBusy || !_ppOnScreen(v) || !v.canEditTeam || v.team.error) return;
  _ppBusy = true;
  try {
    await fn(v);
  } finally {
    _ppBusy = false;
  }
}

// One SLA targets handler at a time (own flag: Project Team's canEditTeam never gates SLA actions).
// Does nothing while another is running, when the page has gone, or for a viewer who can't edit.
async function _ppRunSla(fn) {
  const v = _pp;
  if (_ppSlaBusy || !_ppOnScreen(v) || !v.canEditSla || !v.sla || v.sla.error) return;
  _ppSlaBusy = true;
  try {
    await fn(v);
  } finally {
    _ppSlaBusy = false;
  }
}

function _ppVal(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function _ppPersonByName(v, name) {
  return (v.team.people || []).find(p => p.EmployeeName === name) || null;
}

// "Save anyway?" before ending / removing a TP who still owns open roles here.
async function _ppConfirmOpenRoles(name, roles, confirmLabel) {
  const titles = roles.map(r => r.Location ? `${r.RoleTitle} (${r.Location})` : (r.RoleTitle || '—')).join(', ');
  return confirmModal({
    title:        'Open roles',
    message:      `${name} is the Talent Partner on ${roles.length} open role${roles.length === 1 ? '' : 's'} on this project: ${titles}. Reassign them from the Roles page.`,
    confirmLabel,
    cancelLabel:  'Go back',
  });
}

function _ppBenchToast(result) {
  if (!result.ok) toast("Saved, but bench rows couldn't be updated — run Sync Bench in People.", { type: 'error' });
}

// ── Handlers ────────────────────────────────────────────────────────

function ppStartAddMember() {
  const v = _pp;
  if (!_ppOnScreen(v) || _ppBusy || !v.canEditTeam) return;
  v.mode = 'add';
  _ppRenderTeam(v);
  const person = document.getElementById('pp-m-person');
  if (person) person.focus();
}

function ppEditMember(id) {
  const v = _pp;
  if (!_ppOnScreen(v) || _ppBusy || !v.canEditTeam) return;
  v.mode = Number(id);
  _ppRenderTeam(v);
  const start = document.getElementById('pp-m-start');
  if (start) start.focus();
}

function ppCancelMember() {
  const v = _pp;
  if (!_ppOnScreen(v) || _ppBusy) return;
  v.mode = null;
  _ppRenderTeam(v);
}

// Person / Billed changed (and once after every panel render): prefill Country
// from People Location, show the no-login hint, force Billed No for internal
// staff (N-304), and hide the rate inputs on an unbilled line (N-327).
function ppMemberFormChange() {
  const v = _pp;
  if (!_ppOnScreen(v) || v.mode === null) return;
  const isCreate = v.mode === 'add';
  const row = isCreate ? null : v.team.rows.find(r => String(r.id) === String(v.mode));
  const name = isCreate ? _ppVal('pp-m-person') : (row ? row.EmployeeName : '');
  const person = name ? _ppPersonByName(v, name) : null;
  const country = document.getElementById('pp-m-country');
  if (country && person && !country.value && person.Location) country.value = person.Location;
  const hint = document.getElementById('pp-m-login-hint');
  if (hint) hint.classList.toggle('is-hidden', !(isCreate && name && !ptResolveEmail(name, v.team.emailIndex)));
  const billed = document.getElementById('pp-m-billed');
  const internal = !!person && isInternalStaff(person);
  if (billed) {
    if (internal) billed.value = 'No';
    billed.disabled = internal;
  }
  const unpaid = internal || (billed && billed.value === 'No');
  document.querySelectorAll('#pp-team .pp-m-paid').forEach(g => g.classList.toggle('is-hidden', unpaid));
}

async function ppSaveMember() {
  await _ppRun(async v => {
    const isCreate = v.mode === 'add';
    const row = isCreate ? null : v.team.rows.find(r => String(r.id) === String(v.mode));
    if (!isCreate && !row) return;
    clearFormError('pp-m');
    const name   = isCreate ? _ppVal('pp-m-person') : row.EmployeeName;
    const person = name ? _ppPersonByName(v, name) : null;
    const email  = isCreate ? ptResolveEmail(name, v.team.emailIndex) : (row.UserEmail || '');
    const forecast = document.getElementById('pp-m-forecast');
    const built = ptBuildMemberFields({
      startDate:   _ppVal('pp-m-start'),
      endDate:     _ppVal('pp-m-end'),
      country:     _ppVal('pp-m-country'),
      billed:      _ppVal('pp-m-billed'),
      monthlyRate: _ppVal('pp-m-rate'),
      retainer:    _ppVal('pp-m-retainer'),
      placement:   _ppVal('pp-m-placement'),
      isForecast:  !!(forecast && forecast.checked),
    }, { project: v.project, person, email, isCreate });
    if (!built.ok) { showFormError('pp-m', built.error); return; }
    const fields = built.fields;

    // Advisory clash check (moved from people-forms.js — ptFindClash). A read
    // failure never blocks the save.
    let mine = [];
    try { mine = await getAssignments({ employeeName: name }); } catch (_) { /* advisory */ }
    const clash = ptFindClash(mine, Object.assign({ EmployeeName: name }, fields), isCreate ? null : row.id);
    if (clash) {
      const ok = await confirmModal({
        title:        'Overlapping assignment',
        message:      `Warning: ${name} already has a confirmed assignment with ${clash.Customer} ` +
                      `(${spDateIn(clash.StartDate)} – ${spDateIn(clash.EndDate)}) overlapping these dates.`,
        confirmLabel: 'Save anyway',
      });
      if (!ok) return;
    }
    // Design rule 5: ending a TP who still owns open roles here.
    if (!isCreate && spDateIn(row.EndDate) !== spDateIn(fields.EndDate)) {
      const open = ptOpenRolesFor(v.team.roles, row.UserEmail);
      if (open.length && !(await _ppConfirmOpenRoles(name, open, 'Save anyway'))) return;
    }

    const btn = document.getElementById('pp-m-save');
    if (btn) btn.disabled = true;
    try {
      if (isCreate) {
        fields.AssignmentID = ptNextAssignmentId(await getAssignments({}), 'A');
        await createAssignment(fields);
      } else {
        await updateAssignment(row.id, fields);
      }
    } catch (e) {
      console.error('Project Team save failed:', e);
      if (btn) btn.disabled = false;
      showFormError('pp-m', `Couldn't save: ${e.message}`);
      return;
    }
    v.mode = null;
    toast(isCreate ? `${name} added to the team` : 'Team member saved', { type: 'success' });
    _ppBenchToast(await resyncBenchFor(name));
    await _ppRefresh(v);
  });
}

async function ppDeleteMember(id) {
  await _ppRun(async v => {
    const row = v.team.rows.find(r => String(r.id) === String(id));
    if (!row) return;
    const name = row.EmployeeName || 'this person';
    const lead = isLeadDmAssignment(row);
    const open = ptOpenRolesFor(v.team.roles, row.UserEmail);
    const titles = open.map(r => r.Location ? `${r.RoleTitle} (${r.Location})` : (r.RoleTitle || '—')).join(', ');
    const ok = await confirmModal({
      title:        'Remove from team',
      message:      `Remove ${name} from this project's team? This deletes the assignment.` +
        (open.length ? ` ${name} is the Talent Partner on ${open.length} open role${open.length === 1 ? '' : 's'} here: ${titles}.` : '') +
        (lead ? " They are the Lead DM — the project's Lead DM will be cleared." : ''),
      confirmLabel: 'Delete',
      cancelLabel:  'Keep',
      danger:       true,
    });
    if (!ok) return;
    try {
      await deleteAssignment(row.id);
    } catch (e) {
      console.error('Project Team delete failed:', e);
      toast("Couldn't remove that team member — please try again.", { type: 'error' });
      return;
    }
    if (String(v.mode) === String(row.id)) v.mode = null;
    toast(`${name} removed from the team`, { type: 'success' });
    if (lead) {
      try {
        await setProjectLeadDm(v.projectId, null, v.team.rows.filter(r => String(r.id) !== String(row.id)));
      } catch (e) {
        console.error('Lead DM clear failed:', e);
        toast("Removed, but the project's Delivery Manager wasn't cleared — set a new Lead DM.", { type: 'error' });
      }
    }
    _ppBenchToast(await resyncBenchFor(row.EmployeeName));
    await _ppRefresh(v);
  });
}

const _PP_LEAD_STEP_ERRORS = {
  1: "Couldn't change the Lead DM — please try again.",
  2: 'Lead DM set, but another member is still marked Lead DM — try again.',
  3: "Lead DM changed on the team, but the project's Delivery Manager didn't update — try again.",
};

async function _ppLeadDm(v, assignmentId) {
  try {
    await setProjectLeadDm(v.projectId, assignmentId, v.team.rows);
  } catch (e) {
    console.error('Lead DM change failed:', e);
    toast(_PP_LEAD_STEP_ERRORS[e && e.step] || _PP_LEAD_STEP_ERRORS[1], { type: 'error' });
    await _ppRefresh(v);
    return;
  }
  toast(assignmentId == null ? 'Lead DM removed' : 'Lead DM set', { type: 'success' });
  await _ppRefresh(v);
}

async function ppSetLeadDm(id) {
  await _ppRun(async v => {
    if (!ptLeadDmCandidates(v.team.rows, v.team.roleByEmail).includes(String(id))) return;
    await _ppLeadDm(v, Number(id));
  });
}

async function ppClearLeadDm() {
  await _ppRun(async v => {
    if (!v.team.rows.some(isLeadDmAssignment) && !v.project.DeliveryManager) return;
    await _ppLeadDm(v, null);
  });
}

// ── SLA targets handlers (N-382) ────────────────────────────────────

function ppSlaEdit() {
  const v = _pp;
  if (!_ppOnScreen(v) || _ppSlaBusy || !v.canEditSla || !v.sla || v.sla.error) return;
  v.slaMode = 'edit';
  _ppRenderSla(v);
  const first = document.getElementById('pp-sla-' + CONFIG.SLA.METRICS[0].key);
  if (first) first.focus();
}

function ppSlaCancel() {
  const v = _pp;
  if (!_ppOnScreen(v) || _ppSlaBusy) return;
  v.slaMode = null;
  _ppRenderSla(v);
}

// Plans from FRESH rows (never the rendered ones), writes once, then re-reads only the SLA rows.
async function _ppSlaWrite(v, values) {
  const fresh = await getSLATargets();
  const plan = slaEditPlan('override',
    { id: v.projectId, name: v.project.CustomerName, type: v.project.ProjectType }, fresh, values);
  if (plan.error) { showFormError('pp-sla', plan.error); return false; }
  await saveSlaTargets(plan);
  const next = await _ppLoadSla();
  if (next.error) toast("Saved, but the SLA targets couldn't refresh — reload to see the change.", { type: 'error' });
  else v.sla = next;
  v.slaMode = null;
  _ppRenderSla(v);
  refreshSlaPanel('pp-sla-panel');   // N-384: a target edit rewrites history
  return true;
}

async function ppSlaSave() {
  await _ppRunSla(async v => {
    if (v.slaMode !== 'edit') return;
    clearFormError('pp-sla');
    const values = {};
    for (const m of CONFIG.SLA.METRICS) {
      const el = document.getElementById('pp-sla-' + m.key);
      const parsed = slaParseInput(el ? el.value : '', m);
      if (!parsed.ok) {
        if (el) el.setAttribute('aria-invalid', 'true');
        showFormError('pp-sla', parsed.error);
        return;
      }
      if (el) el.removeAttribute('aria-invalid');
      values[m.key] = parsed.value;
    }
    const btn = document.getElementById('pp-sla-save');
    if (btn) btn.disabled = true;
    try {
      if (await _ppSlaWrite(v, values)) toast('SLA targets saved', { type: 'success' });
    } catch (e) {
      console.warn('SLA targets save failed:', e);
      if (btn) btn.disabled = false;
      showFormError('pp-sla', 'Error: ' + (e && e.message ? e.message : String(e)));
    }
  });
}

async function ppSlaReset() {
  await _ppRunSla(async v => {
    if (v.slaMode !== 'edit' || !slaEditorModel(v.project, v.sla.rows).overrideRow) return;
    const ok = await confirmModal({
      title:        'Reset to defaults',
      message:      `Remove this project's SLA overrides? It will use the ${v.project.ProjectType} defaults.`,
      confirmLabel: 'Reset',
      cancelLabel:  'Go back',
    });
    if (!ok) return;
    try {
      const values = {};
      CONFIG.SLA.METRICS.forEach(m => { values[m.key] = null; });
      if (await _ppSlaWrite(v, values)) toast('SLA targets reset to defaults', { type: 'success' });
    } catch (e) {
      console.warn('SLA targets reset failed:', e);
      showFormError('pp-sla', 'Error: ' + (e && e.message ? e.message : String(e)));
    }
  });
}

async function copyProjectLink(id) {
  const url = `${location.origin}${location.pathname}#projects?action=project&id=${parseInt(id, 10)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied', { type: 'success' });
  } catch (e) {
    toast("Couldn't copy the link", { type: 'error' });
  }
}

// N-302a: delegated actions this file owns that shared markup calls (js/actions.js).
// Never register a name twice.
registerActions({
  openProjectPage,
  copyProjectLink,
  // N-365: Project Team section.
  ppStartAddMember,
  ppEditMember,
  ppCancelMember,
  ppMemberFormChange,
  ppSaveMember,
  ppDeleteMember,
  ppSetLeadDm,
  ppClearLeadDm,
  // N-382: SLA targets section.
  ppSlaEdit,
  ppSlaCancel,
  ppSlaSave,
  ppSlaReset,
});