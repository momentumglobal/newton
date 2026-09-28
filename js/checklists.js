// js/checklists.js — Project & Role checklists (N-266a)
//
// Customer Name (Projects list) and Role Title (Roles list) link to a
// per-record workflow checklist. This file owns:
//   - CHECKLIST_ACTIONS, the Newton-action registry checklist items call;
//   - getChecklistListContext() / checklistCellData(), used by pages.js to
//     render the name links and the Checklist column;
//   - openChecklist(), the checklist page — a detail view of the Projects /
//     Roles page (same pattern as lci-editor.js under lciModels), not a
//     router page, so the sidebar keeps Projects/Roles highlighted.
// Graph calls live in api-checklists.js; the visibility / variant / progress
// rules are pure functions in utils.js (shared with N-266b's editor).
// Deep link: reporting.html#projects?action=checklist&id=N (or #roles…),
// handled in app.js:handleDeepLink().

// ── Newton action registry ──────────────────────────────────────────
// An 'action' checklist item names one of these keys in its ActionKey.
// Contract for every entry:
//   label       — button text
//   description — shown in the Config Panel editor's action picker (N-266b)
//   available(ctx) → boolean — false renders the button disabled
//   run(ctx) → Promise<boolean> — resolve true to tick the item
// ctx = { recordType, record, project, role, email }. record/project are the
// normalised SharePoint items (for a project checklist, project === record).
// N-259 / N-260 register their "Create starter folder" flows here.
const CHECKLIST_ACTIONS = {
  'newton.test': {
    label:       'Test action',
    description: 'Admin testing only — do not use in live checklists.',
    available:   ctx => ctx.role === 'admin',
    run:         async () => {
      toast('Test action ran', { type: 'success' });
      return true;
    },
  },
};

function _ckAction(key) {
  const k = String(key ?? '').trim();
  return Object.prototype.hasOwnProperty.call(CHECKLIST_ACTIONS, k) ? CHECKLIST_ACTIONS[k] : null;
}

const _CK_PARENT       = { project: 'projects', role: 'roles' };
const _CK_PARENT_LABEL = { project: 'Projects', role: 'Roles' };

// ── List-page integration (pages.js) ────────────────────────────────
// Everything the Projects/Roles list needs, in at most three reads. Returns
// null on ANY failure (e.g. the lists don't exist yet) — the list pages then
// render exactly as they did before checklists existed. That null is
// load-bearing: do not let this throw.
async function getChecklistListContext(recordType) {
  try {
    const isAdmin = _resolvedRole === 'admin';
    const [settingsAll, templates] = await Promise.all([
      getChecklistSettings(),
      getChecklistTemplates(recordType),
    ]);
    const settings = settingsAll[recordType];
    const hasItems = checklistVariants().some(v => activeChecklistItems(templates, recordType, v).length > 0);
    const showColumn = checklistColumnVisible({ settings, isAdmin, hasItems });
    const progress = showColumn
      ? await getChecklistProgress(recordType, { fromId: settings.fromId })
      : [];
    const progressByRecord = new Map();
    progress.forEach(r => {
      const k = String(r.RecordId);
      if (!progressByRecord.has(k)) progressByRecord.set(k, []);
      progressByRecord.get(k).push(r);
    });
    return { recordType, settings, templates, isAdmin, showColumn, progressByRecord };
  } catch (e) {
    console.warn(`Checklists unavailable for ${recordType} list:`, e);
    return null;
  }
}

// { mode, summary } for one list row. projectType = the project's own type
// (Projects) or the parent project's type (Roles).
function checklistCellData(ctx, record, projectType) {
  if (!ctx || !record) return { mode: 'none', summary: null };
  const variant = resolveChecklistVariant(ctx.templates, ctx.recordType, projectType);
  const items   = activeChecklistItems(ctx.templates, ctx.recordType, variant);
  const mode    = checklistMode({ settings: ctx.settings, isAdmin: ctx.isAdmin, recordId: record.id, hasItems: items.length > 0 });
  if (mode === 'none') return { mode, summary: null };
  const progress = resolveChecklistProgress(ctx.progressByRecord.get(String(record.id)) || []);
  return { mode, summary: summariseChecklist(items, progress) };
}

// ── Checklist page ──────────────────────────────────────────────────
let _ckView    = null;          // state of the checklist on screen
let _ckSeq     = 0;             // render token — drops a stale async render
const _ckBusy  = new Set();     // item keys with a write in flight

async function openChecklist(recordType, id) {
  const parent = _CK_PARENT[recordType];
  if (!parent || !canAccess(parent, _resolvedRole)) return;
  currentPage = parent;
  updateNavActiveLink(parent);
  const main  = document.getElementById('main-content');
  const token = String(++_ckSeq);
  main.innerHTML = `<div class="checklist-page" data-checklist-token="${token}">${skeletonPanel(6)}</div>`;
  const stillHere = () => !!main.querySelector(`[data-checklist-token="${token}"]`);
  let view;
  try {
    view = await _loadChecklistView(recordType, id);
  } catch (e) {
    console.error('Checklist load failed:', e);
    if (!stillHere()) return;
    main.innerHTML = `<div class="checklist-page">${_ckHeaderHtml(recordType, 'Checklist', '')}${pageErrorBlock({
      message: "The checklist couldn't be loaded.",
      retryOnClick: `openChecklist('${recordType}', ${Number(id) || 0})`,
    })}</div>`;
    lucide.createIcons();
    return;
  }
  if (!stillHere()) return;       // the user navigated away mid-load
  if (!view) {
    renderBreadcrumb(parent);
    main.innerHTML = `<div class="checklist-page">${_ckHeaderHtml(recordType, 'Checklist', '')}
      <p class="checklist-unavailable">This checklist isn't available.</p></div>`;
    lucide.createIcons();
    return;
  }
  _ckView = view;
  _ckBusy.clear();
  renderBreadcrumb(parent, view.title);
  main.innerHTML = _checklistPageHtml(view);
  lucide.createIcons();
}

// Resolves to the view model, or null when the checklist isn't available to
// this user (bad id, not found, out of scope, or mode 'none'). Throws only
// on a genuine load failure.
async function _loadChecklistView(recordType, id) {
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) return null;
  const email   = getCurrentUser().email;
  const role    = _resolvedRole;
  const isAdmin = role === 'admin';
  const [settingsAll, templates, projects, userProjectIds, tpMap, progressRows] = await Promise.all([
    getChecklistSettings(),
    getChecklistTemplates(recordType),
    getProjects(false),
    getUserProjectIds(email),
    getTalentPartnerDisplayMap(),
    getChecklistProgress(recordType, { recordId }),
  ]);
  let record, project;
  if (recordType === 'project') {
    record  = projects.find(p => String(p.id) === String(recordId));
    project = record;
  } else {
    try {
      record = await getItem('Roles', recordId);
    } catch (e) {
      if (/not ?found|404/i.test(String(e && e.message))) return null;
      throw e;
    }
    const pid = record.ProjectIDLookupId || record.ProjectID;
    project = projects.find(p => String(p.id) === String(pid));
  }
  if (!record) return null;
  const projectId = recordType === 'project' ? record.id : (record.ProjectIDLookupId || record.ProjectID);
  if (userProjectIds !== null && !userProjectIds.includes(String(projectId))) return null;

  const settings = settingsAll[recordType];
  const variant  = resolveChecklistVariant(templates, recordType, project ? project.ProjectType : '');
  const items    = activeChecklistItems(templates, recordType, variant);
  const mode     = checklistMode({ settings, isAdmin, recordId, hasItems: items.length > 0 });
  if (mode === 'none') return null;

  const title = recordType === 'project'
    ? (record.CustomerName || '—')
    : (record.Location ? `${record.RoleTitle} (${record.Location})` : (record.RoleTitle || '—'));
  return {
    recordType, recordId, record, project, variant, mode, title, tpMap, role, email, isAdmin,
    items: groupChecklistItems(items).flatMap(g => g.items), // display order
    canTick: recordType === 'project' ? canEditProjectRows(role) : canEditRoleRows(role),
    progress: resolveChecklistProgress(progressRows),
  };
}

function _ckHeaderHtml(recordType, title, subtitle, recordId = 0) {
  return `
    <div class="page-header">
      <div class="checklist-heading">
        <h2>${escHtml(title)}</h2>
        ${subtitle ? `<p class="checklist-subtitle">${escHtml(subtitle)}</p>` : ''}
      </div>
      <div class="page-header-actions">
        ${subtitle ? `<button class="btn-secondary" onclick="copyChecklistLink('${recordType}', ${Number(recordId) || 0})"><i data-lucide="link" aria-hidden="true"></i> Copy link</button>` : ''}
        <button class="btn-secondary" onclick="navigateTo('${_CK_PARENT[recordType]}')">← Back to ${_CK_PARENT_LABEL[recordType]}</button>
      </div>
    </div>`;
}

function _checklistPageHtml(v) {
  const variantLabel = v.variant === CONFIG.CHECKLISTS.DEFAULT_VARIANT ? 'Default checklist' : `${v.variant} checklist`;
  const person = e => (e ? (v.tpMap[String(e).toLowerCase()] || e) : '—');
  const meta = v.recordType === 'project'
    ? `Delivery Manager: ${person(v.record.DeliveryManager)}`
    : `${v.project ? v.project.CustomerName : '—'} · Talent Partner: ${tpDisplay(v.record.TalentPartner, v.tpMap)}`;
  const sections = [];
  let current = null;
  v.items.forEach((it, idx) => {
    const name = String(it.Section ?? '').trim() || CONFIG.CHECKLISTS.DEFAULT_SECTION;
    if (!current || current.name !== name) { current = { name, rows: [] }; sections.push(current); }
    current.rows.push(_checklistItemHtml(v, it, idx));
  });
  return `
    <div class="checklist-page" data-checklist-record="${escAttr(v.recordType)}-${v.recordId}">
      ${_ckHeaderHtml(v.recordType, v.title, `Checklist · ${variantLabel}`, v.recordId)}
      <p class="checklist-meta">${escHtml(meta)}</p>
      ${v.mode === 'preview' ? `
      <div class="checklist-preview-banner" role="note">
        <i data-lucide="eye" aria-hidden="true"></i>
        <span>Preview — checklists are switched off for users. Only Admins can see this.</span>
      </div>` : ''}
      <div id="checklist-summary">${_checklistSummaryHtml(v)}</div>
      ${sections.map(s => `
      <section class="checklist-section">
        <h3 class="checklist-section-title">${escHtml(s.name)}</h3>
        <ul class="checklist-items">${s.rows.join('')}</ul>
      </section>`).join('')}
    </div>`;
}

function _checklistSummaryHtml(v) {
  const s = summariseChecklist(v.items, v.progress);
  return `
    <div class="checklist-progress">
      <div class="checklist-progress-text"><strong>${s.done} of ${s.total} complete</strong>${s.reqTotal ? ` · Required: ${s.reqDone} of ${s.reqTotal}` : ''}</div>
      <progress class="checklist-progress-bar" max="${s.total || 1}" value="${s.done}" aria-label="Checklist progress: ${s.done} of ${s.total} complete"></progress>
    </div>`;
}

function _ckActionCtx(v) {
  return { recordType: v.recordType, record: v.record, project: v.project, role: v.role, email: v.email };
}

function _checklistItemHtml(v, it, idx) {
  const key      = String(it.ItemKey ?? '').trim();
  const p        = key ? v.progress.get(key) : null;
  const done     = !!(p && p.done);
  const required = spYesNo(it.Required, false);
  const busy     = key && _ckBusy.has(key);
  const disabled = !v.canTick || !key || busy;
  const type     = normChecklistKey(it.ItemType);
  let extra = '';
  if (type === 'link') {
    const url = String(it.LinkUrl ?? '').trim();
    extra = isSafeChecklistUrl(url)
      ? `<a class="checklist-item-link" href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">Open <i data-lucide="external-link" aria-hidden="true"></i></a>`
      : `<span class="checklist-item-note">Link unavailable${v.isAdmin ? ` — ${escHtml(url || 'no URL set')}` : ''}</span>`;
  } else if (type === 'action' && v.canTick) {   // read-only viewers get no action UI
    const action = _ckAction(it.ActionKey);
    if (!action) {
      extra = `<button type="button" class="btn-secondary btn-sm" disabled>Action unavailable</button>` +
        (v.isAdmin ? `<span class="checklist-item-note">Unknown action: ${escHtml(it.ActionKey || '(none set)')}</span>` : '');
    } else {
      const avail = typeof action.available === 'function' ? action.available(_ckActionCtx(v)) !== false : true;
      extra = `<button type="button" class="btn-secondary btn-sm" id="ck-action-${idx}" onclick="runChecklistAction(${idx})"` +
        (avail && !busy ? '' : ` disabled${avail ? '' : ` title="You don't have access to this action"`}`) +
        `>${escHtml(action.label)}</button>`;
    }
  }
  const meta = done
    ? `<div class="checklist-item-meta">Ticked by ${escHtml(tpDisplay(p.by, v.tpMap))} · ${escHtml(spDateIn(p.at) || '—')}</div>`
    : '';
  return `
        <li class="checklist-item${done ? ' checklist-item--done' : ''}" id="ck-item-${idx}">
          <input type="checkbox" class="checklist-item-check" id="ck-box-${idx}"${done ? ' checked' : ''}${disabled ? ' disabled' : ''} onchange="toggleChecklistItem(${idx}, this.checked)">
          <div class="checklist-item-body">
            <label class="checklist-item-label" for="ck-box-${idx}">${escHtml(it.ItemLabel || '')}</label>${required ? ' <span class="checklist-tag">Required</span>' : ''}
            ${it.HelpText ? `<div class="checklist-item-help">${escHtmlLines(it.HelpText)}</div>` : ''}
            ${meta}
            ${extra ? `<div class="checklist-item-actions">${extra}</div>` : ''}
            ${!key && v.isAdmin ? '<span class="checklist-item-note">This item has no ItemKey, so it can’t be ticked.</span>' : ''}
          </div>
        </li>`;
}

function _ckOnScreen(v) {
  return !!document.querySelector(`#main-content [data-checklist-record="${v.recordType}-${v.recordId}"]`);
}

// Re-renders one item + the summary in place, keeping keyboard focus on the
// item's checkbox if it had it.
function _ckRefreshItem(v, idx) {
  const li = document.getElementById(`ck-item-${idx}`);
  if (!li) return;
  const hadFocus = document.activeElement && li.contains(document.activeElement);
  li.outerHTML = _checklistItemHtml(v, v.items[idx], idx);
  const summary = document.getElementById('checklist-summary');
  if (summary) summary.innerHTML = _checklistSummaryHtml(v);
  lucide.createIcons();
  if (hadFocus) {
    const box = document.getElementById(`ck-box-${idx}`);
    if (box) box.focus();
  }
}

// Optimistic: the tick shows at once, the write follows; a failed write
// reverts the item and the summary. The checkbox is disabled while its write
// is in flight so a double-click can't create two rows.
async function toggleChecklistItem(idx, checked) {
  const v = _ckView;
  if (!v || !_ckOnScreen(v) || !v.canTick) return;
  const it  = v.items[idx];
  const key = it ? String(it.ItemKey ?? '').trim() : '';
  if (!key || _ckBusy.has(key)) return;
  const prev = v.progress.get(key) || null;
  const next = {
    done:  checked === true,
    by:    (getCurrentUser()?.email || '').toLowerCase(),
    at:    isoDate(localDayISO()),   // same date-only shape setChecklistItemDone writes
    rowId: prev ? prev.rowId : null,
  };
  v.progress.set(key, next);
  _ckBusy.add(key);
  _ckRefreshItem(v, idx);
  try {
    const { rowId } = await setChecklistItemDone(v.recordType, v.recordId, key, next.done, prev ? prev.rowId : null);
    if (rowId) next.rowId = rowId;
  } catch (e) {
    console.error('Checklist tick failed:', e);
    if (prev) v.progress.set(key, prev); else v.progress.delete(key);
    toast("Couldn't save that change — please try again.", { type: 'error' });
  } finally {
    _ckBusy.delete(key);
    if (_ckView === v && _ckOnScreen(v)) _ckRefreshItem(v, idx);
  }
}

async function runChecklistAction(idx) {
  const v = _ckView;
  if (!v || !_ckOnScreen(v) || !v.canTick) return;
  const it     = v.items[idx];
  const action = it ? _ckAction(it.ActionKey) : null;
  if (!action) return;
  const ctx = _ckActionCtx(v);
  if (typeof action.available === 'function' && action.available(ctx) === false) return;
  const btn = document.getElementById(`ck-action-${idx}`);
  if (btn) btn.disabled = true;
  try {
    const completed = await action.run(ctx);
    const key = String(it.ItemKey ?? '').trim();
    const p = v.progress.get(key);
    if (completed === true && !(p && p.done) && _ckView === v && _ckOnScreen(v)) {
      await toggleChecklistItem(idx, true);
    }
  } catch (e) {
    console.error(`Checklist action ${it.ActionKey} failed:`, e);
    toast(`${action.label} failed — please try again.`, { type: 'error' });
  } finally {
    const b = document.getElementById(`ck-action-${idx}`);
    if (b && !_ckBusy.has(String(it.ItemKey ?? '').trim())) b.disabled = false;
  }
}

async function copyChecklistLink(recordType, id) {
  const parent = _CK_PARENT[recordType];
  if (!parent) return;
  const url = `${location.origin}${location.pathname}#${parent}?action=checklist&id=${parseInt(id, 10)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied', { type: 'success' });
  } catch (e) {
    toast("Couldn't copy the link", { type: 'error' });
  }
}