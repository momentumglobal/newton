// js/role-page.js — the role page (N-307 / HC-2)
//
// Every role name on the Roles list opens this page (pages.js
// roleNameLinkHtml). It is a detail view of the Roles page, not a router
// page — same pattern as the checklist page (checklists.js) — so the sidebar
// keeps Roles highlighted. It shows:
//   - the role header (title, project, stage, Talent Partner);
//   - the Headcount section: add (n at a time; reopens a Closed / Cancelled
//     pipeline — D-3), edit dates / Backfill / Notes, cancel (D-1), restore
//     (S-4), and the close/cancel prompt when the last open headcount is
//     cancelled (S-5). Desktop only (D-6) — this file is loaded on
//     reporting.html only;
//   - the role's checklist, when it has one (checklistBodyHtml /
//     mountChecklistView, checklists.js).
// Deep link: reporting.html#roles?action=checklist&id=N (openChecklist('role')
// redirects here). Graph calls are api.js helpers; the rules are pure
// functions in utils.js (headcountSummary, roleStageChangeRule,
// pipelineAfterLastOpen …). Every Stage write runs checkRoleStageChange().

let _rpSeq  = 0;      // render token — drops a stale async render
let _rp     = null;   // state of the role page on screen
let _rpBusy = false;  // one headcount write at a time (N-106 double-click guard)

const _RP_STATUS_LABEL = { open: 'Open', filled: 'Filled', cancelled: 'Cancelled' };

async function openRolePage(roleId) {
  if (!canAccess('roles', _resolvedRole)) return;
  currentPage = 'roles';
  updateNavActiveLink('roles');
  const id    = Number(roleId);
  const main  = document.getElementById('main-content');
  const token = String(++_rpSeq);
  main.innerHTML = `<div class="role-page" data-role-page-token="${token}">${skeletonPanel(6)}</div>`;
  const stillHere = () => !!main.querySelector(`[data-role-page-token="${token}"]`);
  let data;
  try {
    data = await _rpLoad(id);
  } catch (e) {
    console.error('Role page load failed:', e);
    if (!stillHere()) return;
    main.innerHTML = `<div class="role-page">${_rpHeaderHtml(null)}${pageErrorBlock({
      message: "This role couldn't be loaded.",
      retryOnClick: `openRolePage(${Number.isInteger(id) ? id : 0})`,
    })}</div>`;
    lucide.createIcons();
    return;
  }
  if (!stillHere()) return;       // the user navigated away mid-load
  if (!data) {
    renderBreadcrumb('roles');
    main.innerHTML = `<div class="role-page">${_rpHeaderHtml(null)}
      <p class="checklist-unavailable">This role isn't available.</p></div>`;
    lucide.createIcons();
    return;
  }
  _rp = data;
  _rpBusy = false;
  renderBreadcrumb('roles', data.title);
  main.innerHTML = _rpPageHtml(data);
  if (data.checklist && !data.checklist.error) mountChecklistView(data.checklist);
  lucide.createIcons();
}

// Resolves to the page model, or null when the role isn't available to this
// user (bad id, not found, out of scope). Throws only on a genuine failure.
async function _rpLoad(id) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const email = getCurrentUser().email;
  const getRole = async () => {
    try {
      return await getItem('Roles', id);
    } catch (e) {
      if (/not ?found|404/i.test(String(e && e.message))) return null;
      throw e;
    }
  };
  const [role, projects, userProjectIds, tpMap, state, checklist] = await Promise.all([
    getRole(),
    getProjects(false),
    getUserProjectIds(email),
    getTalentPartnerDisplayMap(),
    getRoleHeadcountState(id),
    loadRoleChecklistView(id),   // null = no checklist; never throws
  ]);
  if (!role) return null;
  const projectId = role.ProjectIDLookupId ?? role.ProjectID;
  if (userProjectIds !== null && !userProjectIds.includes(String(projectId))) return null;
  const project = projects.find(p => String(p.id) === String(projectId)) || null;
  return {
    roleId: id, role, project, projectId, tpMap, state, checklist,
    title:   role.Location ? `${role.RoleTitle} (${role.Location})` : (role.RoleTitle || '—'),
    canEdit: canEditRoleRows(_resolvedRole),
    editId:  null,    // headcount row in inline edit, if any
    adding:  false,   // + Add headcount form open
  };
}

function _rpIsTerminal(v) {
  return CONFIG.ROLE_STAGE_TERMINAL.includes(normaliseRoleStage(v.role.Stage));
}

function _rpOnScreen(v) {
  return !!(v && _rp === v &&
    document.querySelector(`#main-content [data-role-page="${Number(v.roleId)}"]`));
}

// ── Markup ──────────────────────────────────────────────────────────

function _rpHeaderHtml(v) {
  const id = v ? Number(v.roleId) : 0;
  return `
    <div class="page-header">
      <div class="checklist-heading">
        <h2>${escHtml(v ? v.title : 'Role')}</h2>
        ${v ? '<p class="checklist-subtitle">Role pipeline</p>' : ''}
      </div>
      <div class="page-header-actions">
        ${v && v.canEdit ? `<button class="btn-secondary" onclick="showEditRoleForm(${id})"><i data-lucide="pencil" aria-hidden="true"></i> Edit role</button>` : ''}
        ${v ? `<button class="btn-secondary" onclick="copyChecklistLink('role', ${id})"><i data-lucide="link" aria-hidden="true"></i> Copy link</button>` : ''}
        <button class="btn-secondary" onclick="navigateTo('roles')">← Back to Roles</button>
      </div>
    </div>`;
}

function _rpMetaHtml(v) {
  const project = v.project ? v.project.CustomerName : '—';
  return `${escHtml(project)} · Stage ${stageBadgeHtml(v.roleId, v.role.Stage, false)} · Talent Partner: ${escHtml(tpDisplay(v.role.TalentPartner, v.tpMap))}`;
}

function _rpPageHtml(v) {
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
    <div class="role-page" data-role-page="${Number(v.roleId)}">
      ${_rpHeaderHtml(v)}
      <p class="checklist-meta" id="rp-meta">${_rpMetaHtml(v)}</p>
      <section class="role-page-section role-hc" id="rp-headcount">${_rpHeadcountHtml(v)}</section>
      ${checklistHtml}
    </div>`;
}

function _rpHeadcountHtml(v) {
  const { rows, fillMap, counts } = v.state;
  const sorted = rows.slice().sort((a, b) => (Number(a.Sequence) || 0) - (Number(b.Sequence) || 0));
  const cols = v.canEdit ? 7 : 6;
  const body = sorted.length
    ? sorted.map(hc => (v.canEdit && String(v.editId) === String(hc.id))
        ? _rpEditRowHtml(v, hc)
        : _rpRowHtml(v, hc)).join('')
    : `<tr><td colspan="${cols}" class="role-hc-empty">No headcount yet.</td></tr>`;
  return `
      <div class="role-hc-head">
        <h3 class="role-page-section-title">Headcount</h3>
        ${v.canEdit && !v.adding ? '<button type="button" class="btn-secondary btn-sm" onclick="rpStartAddHeadcount()">+ Add headcount</button>' : ''}
      </div>
      <p class="role-hc-summary">${escHtml(headcountXYTitle(counts))}</p>
      ${v.canEdit && v.adding ? _rpAddFormHtml(v) : ''}
      <div class="table-scroll">
        <table class="data-table role-hc-table">
          <thead><tr>
            <th>Headcount</th><th>Status</th><th>Open Date</th><th>Target Hire Date</th><th>Detail</th><th>Notes</th>${v.canEdit ? '<th></th>' : ''}
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
}

function _rpLabelHtml(hc) {
  const label = hc.Title || headcountLabel(hc.Sequence);
  return escHtml(label) + (spYesNo(hc.Backfill, false) ? '<span class="checklist-tag">Backfill</span>' : '');
}

function _rpStatusHtml(status) {
  return `<span class="hc-status hc-status--${status}">${_RP_STATUS_LABEL[status]}</span>`;
}

// The latest placement filling this headcount (by OfferAcceptedDate).
function _rpFillOf(v, hc) {
  const list = v.state.fillMap.get(String(hc.id)) || [];
  return list.slice().sort((a, b) =>
    String(spDateIn(b.OfferAcceptedDate) || '').localeCompare(String(spDateIn(a.OfferAcceptedDate) || '')))[0] || null;
}

function _rpDetailText(v, hc, status) {
  if (status === 'filled') {
    const p = _rpFillOf(v, hc);
    return `Filled · ${p ? (p.CandidateName || '—') : '—'} · ${p ? (spDateIn(p.OfferAcceptedDate) || '—') : '—'}`;
  }
  if (status === 'cancelled') return `Cancelled ${spDateIn(hc.CancelledDate) || ''}`.trim();
  const days = hc.OpenDate ? daysOpen(spDateIn(hc.OpenDate)) : null;
  return days === null ? 'not opened' : `${days} days open`;
}

function _rpRowHtml(v, hc) {
  const status = classifyHeadcount(hc, v.state.fillMap);
  const id = Number(hc.id);
  const actions = [`<a href="#" onclick="rpEditHeadcount(${id}); return false;">Edit</a>`];
  if (status === 'open') actions.push(`<a href="#" onclick="rpCancelHeadcount(${id}); return false;">Cancel</a>`);
  if (status === 'cancelled' && !_rpIsTerminal(v)) actions.push(`<a href="#" onclick="rpRestoreHeadcount(${id}); return false;">Restore</a>`);
  return `
            <tr>
              <td>${_rpLabelHtml(hc)}</td>
              <td>${_rpStatusHtml(status)}</td>
              <td>${spDateIn(hc.OpenDate) || '—'}</td>
              <td>${spDateIn(hc.TargetHireDate) || '—'}</td>
              <td class="role-hc-detail">${escHtml(_rpDetailText(v, hc, status))}</td>
              <td>${escHtml(hc.Notes || '')}</td>
              ${v.canEdit ? `<td><div class="row-actions">${actions.join('')}</div></td>` : ''}
            </tr>`;
}

function _rpEditRowHtml(v, hc) {
  const status = classifyHeadcount(hc, v.state.fillMap);
  const id = Number(hc.id);
  return `
            <tr class="role-hc-edit-row">
              <td>${_rpLabelHtml(hc)}</td>
              <td>${_rpStatusHtml(status)}</td>
              <td><input type="date" class="role-hc-input" id="rp-hc-open" aria-label="Open Date"
                value="${escAttr(spDateIn(hc.OpenDate) || '')}" onchange="rpAutoTarget('rp-hc-open', 'rp-hc-target')"></td>
              <td><input type="date" class="role-hc-input" id="rp-hc-target" aria-label="Target Hire Date"
                value="${escAttr(spDateIn(hc.TargetHireDate) || '')}"></td>
              <td><label class="role-hc-check"><input type="checkbox" id="rp-hc-backfill"${spYesNo(hc.Backfill, false) ? ' checked' : ''}> Backfill</label></td>
              <td><textarea class="role-hc-input" id="rp-hc-notes" rows="2" aria-label="Notes">${escHtml(hc.Notes || '')}</textarea></td>
              <td><div class="role-hc-actions">
                <button type="button" class="btn-primary btn-sm" onclick="rpSaveHeadcount(${id})">Save</button>
                <button type="button" class="btn-secondary btn-sm" onclick="rpCancelEdit()">Cancel</button>
              </div></td>
            </tr>`;
}

function _rpAddFormHtml(v) {
  const terminal = _rpIsTerminal(v);
  const stage    = normaliseRoleStage(v.role.Stage);
  const reopen   = reopenStageOptions()
    .map(s => `<option value="${escAttr(s)}"${s === CONFIG.HEADCOUNT.reopenStage ? ' selected' : ''}>${escHtml(s)}</option>`)
    .join('');
  return `
      <div class="role-hc-add">
        ${terminal ? `<p class="role-hc-reopen-note">This pipeline is ${escHtml(stage)}. Adding headcount reopens it.</p>` : ''}
        <div class="form-row role-hc-add-row">
          <div class="form-group">
            <label for="rp-add-count">Number to add *</label>
            <input type="number" id="rp-add-count" min="1" max="${CONFIG.HEADCOUNT.maxPerAdd}" step="1" value="1">
          </div>
          <div class="form-group">
            <label for="rp-add-open">Open Date</label>
            <input type="date" id="rp-add-open" onchange="rpAutoTarget('rp-add-open', 'rp-add-target')">
          </div>
          <div class="form-group">
            <label for="rp-add-target">Target Hire Date (auto: Open + ${CONFIG.ANALYTICS_BENCHMARKS.timeToHireDays}d)</label>
            <input type="date" id="rp-add-target">
          </div>
          ${terminal ? `
          <div class="form-group">
            <label for="rp-add-reopen">Reopen pipeline at stage *</label>
            <select id="rp-add-reopen" required>${reopen}</select>
          </div>` : ''}
        </div>
        <div class="form-group">
          <label class="role-hc-check"><input type="checkbox" id="rp-add-backfill"> Backfill</label>
        </div>
        <div class="form-group">
          <label for="rp-add-notes">Notes</label>
          <textarea id="rp-add-notes" rows="2"></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-primary" id="rp-add-save" onclick="rpSaveAddHeadcount()">Add headcount</button>
          <button type="button" class="btn-secondary" onclick="rpCancelAdd()">Cancel</button>
        </div>
      </div>`;
}

// ── Re-render ───────────────────────────────────────────────────────

function _rpRenderHeadcount(v) {
  const el = document.getElementById('rp-headcount');
  if (!el || !_rpOnScreen(v)) return;
  el.innerHTML = _rpHeadcountHtml(v);
  const meta = document.getElementById('rp-meta');
  if (meta) meta.innerHTML = _rpMetaHtml(v);
  lucide.createIcons();
}

// Re-reads the role + its headcount after a write, then re-renders. Never
// throws — the write it follows has already succeeded.
async function _rpRefresh(v) {
  try {
    const [role, state] = await Promise.all([getItem('Roles', v.roleId), getRoleHeadcountState(v.roleId)]);
    v.role  = role;
    v.state = state;
  } catch (e) {
    console.warn('Role page refresh failed:', e);
    toast("Saved, but this page couldn't refresh — reload to see the change.", { type: 'error' });
  }
  _rpRenderHeadcount(v);
}

// One headcount handler at a time; does nothing while another is running, when
// the page has gone, or for a read-only viewer.
async function _rpRun(fn) {
  const v = _rp;
  if (_rpBusy || !_rpOnScreen(v) || !v.canEdit) return;
  _rpBusy = true;
  try {
    await fn(v);
  } finally {
    _rpBusy = false;
  }
}

function _rpVal(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

// ── Handlers ────────────────────────────────────────────────────────

function rpAutoTarget(openId, targetId) {
  const open   = document.getElementById(openId);
  const target = document.getElementById(targetId);
  if (open && target && open.value && !target.value) target.value = defaultTargetHireDate(open.value) || '';
}

function rpStartAddHeadcount() {
  const v = _rp;
  if (!_rpOnScreen(v) || _rpBusy) return;
  v.adding = true;
  v.editId = null;
  _rpRenderHeadcount(v);
  const count = document.getElementById('rp-add-count');
  if (count) count.focus();
}

function rpCancelAdd() {
  const v = _rp;
  if (!_rpOnScreen(v) || _rpBusy) return;
  v.adding = false;
  _rpRenderHeadcount(v);
}

function rpEditHeadcount(id) {
  const v = _rp;
  if (!_rpOnScreen(v) || _rpBusy) return;
  v.editId = Number(id);
  v.adding = false;
  _rpRenderHeadcount(v);
  const open = document.getElementById('rp-hc-open');
  if (open) open.focus();
}

function rpCancelEdit() {
  const v = _rp;
  if (!_rpOnScreen(v) || _rpBusy) return;
  v.editId = null;
  _rpRenderHeadcount(v);
}

async function rpSaveHeadcount(id) {
  await _rpRun(async v => {
    const backfill = document.getElementById('rp-hc-backfill');
    const fields = {
      OpenDate:       isoDate(_rpVal('rp-hc-open')) || null,       // blank clears
      TargetHireDate: isoDate(_rpVal('rp-hc-target')) || null,
      Backfill:       !!(backfill && backfill.checked),
      Notes:          _rpVal('rp-hc-notes') || null,
    };
    try {
      await updateHeadcount(Number(id), v.roleId, fields);
    } catch (e) {
      console.error('Headcount save failed:', e);
      toast("Couldn't save that headcount — please try again.", { type: 'error' });
      return;
    }
    v.editId = null;
    toast('Headcount saved', { type: 'success' });
    await _rpRefresh(v);
  });
}

async function rpCancelHeadcount(id) {
  await _rpRun(async v => {
    const hc = v.state.rows.find(r => String(r.id) === String(id));
    if (!hc) return;
    const label = hc.Title || headcountLabel(hc.Sequence);
    const ok = await confirmModal({
      title:        'Cancel headcount',
      message:      `Cancel ${label}? It stops counting toward this pipeline's headcount.`,
      confirmLabel: 'Cancel headcount',
      cancelLabel:  'Keep',
      danger:       true,
    });
    if (!ok) return;
    try {
      await cancelHeadcount(Number(id), v.roleId, localDayISO());
    } catch (e) {
      console.error('Headcount cancel failed:', e);
      toast("Couldn't cancel that headcount — please try again.", { type: 'error' });
      return;
    }
    if (String(v.editId) === String(id)) v.editId = null;
    toast(`${label} cancelled`, { type: 'success' });
    await _rpRefresh(v);
    await _rpOfferAfterLastOpen(v);
  });
}

async function rpRestoreHeadcount(id) {
  await _rpRun(async v => {
    const hc = v.state.rows.find(r => String(r.id) === String(id));
    if (!hc || _rpIsTerminal(v) || classifyHeadcount(hc, v.state.fillMap) !== 'cancelled') return;
    try {
      await restoreHeadcount(Number(id), v.roleId);
    } catch (e) {
      console.error('Headcount restore failed:', e);
      toast("Couldn't restore that headcount — please try again.", { type: 'error' });
      return;
    }
    toast(`${hc.Title || headcountLabel(hc.Sequence)} restored`, { type: 'success' });
    await _rpRefresh(v);
  });
}

// S-5: the last open headcount on a non-terminal pipeline has just been
// cancelled — offer Close (it has a fill) or Cancel (it has none). Declining
// leaves the stage alone (Data Health probe 5 then lists it).
async function _rpOfferAfterLastOpen(v) {
  if (_rpIsTerminal(v)) return;
  const next = pipelineAfterLastOpen(v.state.counts);
  if (!next) return;
  const close   = next === 'close';
  const toStage = close ? CONFIG.ROLE_STAGE_CLOSED : 'Cancelled';
  const ok = await confirmModal({
    title:        close ? 'Close pipeline' : 'Cancel pipeline',
    message:      close
      ? 'No open headcount left on this pipeline. Close it?'
      : 'No open headcount left on this pipeline. Cancel the pipeline?',
    confirmLabel: close ? 'Close pipeline' : 'Cancel pipeline',
    cancelLabel:  'Leave it',
    danger:       !close,
  });
  if (!ok) return;
  try {
    const check = await checkRoleStageChange(v.roleId, toStage);
    if (!check.ok) { toast(check.reason, { type: 'error' }); return; }
    await updateRoleWithHistory(v.roleId, { Stage: toStage });
  } catch (e) {
    console.error('Pipeline stage change failed:', e);
    toast("Couldn't change the pipeline's stage — change it from Edit role.", { type: 'error' });
    return;
  }
  toast(close ? 'Pipeline closed' : 'Pipeline cancelled', { type: 'success' });
  await _rpRefresh(v);
}

async function rpSaveAddHeadcount() {
  await _rpRun(async v => {
    const btn = document.getElementById('rp-add-save');
    const terminal  = _rpIsTerminal(v);
    const fromStage = normaliseRoleStage(v.role.Stage);
    const reopenTo  = terminal ? _rpVal('rp-add-reopen') : null;
    if (terminal && !reopenStageOptions().includes(reopenTo)) {
      toast('Choose the stage to reopen this pipeline at.', { type: 'error' });
      return;
    }
    const count    = clampHeadcountCount(_rpVal('rp-add-count'));
    const backfill = document.getElementById('rp-add-backfill');
    const values = {
      OpenDate:       isoDate(_rpVal('rp-add-open')) || undefined,
      TargetHireDate: isoDate(_rpVal('rp-add-target')) || undefined,
      Backfill:       !!(backfill && backfill.checked),
      Notes:          _rpVal('rp-add-notes') || undefined,
    };
    if (btn) btn.disabled = true;
    let partial = false;
    try {
      await createHeadcountRows(v.roleId, v.projectId, count, values);
    } catch (e) {
      console.error('Headcount add failed:', e);
      const landed = e && e.created ? e.created : 0;
      if (!landed) {
        toast("Couldn't add headcount — please try again.", { type: 'error' });
        if (btn) btn.disabled = false;
        return;
      }
      partial = true;
      toast(`Only ${landed} of ${count} headcount saved — add the rest again.`, { type: 'error' });
    }
    v.adding = false;
    if (terminal) {
      // D-3: headcount first, then the stage — a failed stage write leaves a
      // Closed pipeline with open headcount, which Data Health probe 4 lists.
      try {
        const check = await checkRoleStageChange(v.roleId, reopenTo);
        if (!check.ok) throw new Error(check.reason);
        await updateRoleWithHistory(v.roleId, { Stage: reopenTo });
        toast(`Pipeline reopened at ${reopenTo}`, { type: 'success' });
      } catch (e) {
        console.error('Pipeline reopen failed:', e);
        toast(`Headcount added, but the pipeline is still ${fromStage} — change its stage from Edit role.`, { type: 'error' });
      }
    } else if (!partial) {
      toast(count === 1 ? 'Headcount added' : `${count} headcount added`, { type: 'success' });
    }
    await _rpRefresh(v);
  });
}