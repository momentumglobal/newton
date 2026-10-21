// js/project-page.js — the Project page (N-364 / PT-4, Project Team epic)
//
// Every project name on the Projects list opens this page (pages.js
// projectNameLinkHtml). It is a detail view of the Projects page, not a router
// page — same pattern as the role page (role-page.js) — so the sidebar keeps
// Projects highlighted. It shows:
//   - the project header: customer, type, status, dates, Lead DM
//     (Projects.DeliveryManager — D-5), with Edit project / Copy link;
//   - the project's checklist, when it has one (checklistBodyHtml /
//     mountChecklistView, checklists.js).
// N-365 adds the Project Team section below the header. Desktop only — this
// file is loaded on reporting.html only.
// Deep link: reporting.html#projects?action=project&id=N. The older
// #projects?action=checklist&id=N link still works: openChecklist('project')
// redirects here. Graph calls are api.js helpers; the header fields are the
// pure projectPageFields() in utils.js.

let _ppSeq = 0;      // render token — drops a stale async render

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
  renderBreadcrumb('projects', data.title);
  main.innerHTML = _ppPageHtml(data);
  if (data.checklist && !data.checklist.error) mountChecklistView(data.checklist);
  lucide.createIcons();
}

// Resolves to the page model, or null when the project isn't available to
// this user (bad id, not found, out of scope). Throws only on a genuine failure.
async function _ppLoad(id) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const email = getCurrentUser().email;
  const [projects, userProjectIds, dmMap, checklist] = await Promise.all([
    getProjects(false),
    getUserProjectIds(email),
    getTalentPartnerDisplayMap(),
    loadProjectChecklistView(id),   // null = no checklist; never throws
  ]);
  const project = projects.find(p => String(p.id) === String(id));
  if (!project) return null;
  if (userProjectIds !== null && !userProjectIds.includes(String(id))) return null;
  return {
    projectId: id, project, dmMap, checklist,
    title:   project.CustomerName || '—',
    canEdit: canEditProjectRows(_resolvedRole),
  };
}

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
      <div class="project-fields">${_ppFieldsHtml(v)}</div>
      ${checklistHtml}
    </div>`;
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
});