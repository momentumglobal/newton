// js/sla-admin.js — Config Panel "SLA targets" tab (N-382 / DA-2)
//
// Admin edits the company-default SLA targets per project type (DA-D2). Per-project
// overrides are edited on the Project page (project-page.js); they are listed here read-only.
// admin.js only registers the tab and dispatches to buildSlaTargetsTab(); the Config Panel
// itself is Admin-only (renderAdminPage), which is also the gate for defaults (DA-D7 decision).
//
// Rules are pure (utils.js: slaProjectTypes, slaParseInput, slaEditPlan, slaFormatTarget);
// the one writer is saveSlaTargets (api.js). Save re-reads SLATargets right before planning,
// so a stale screen can never create a duplicate default row. Every save re-renders through
// renderAdminTab('slaTargets'), which re-reads the list, so the screen shows what was saved.

let _slaaBusy = false;   // a save is running — one write at a time

function _slaaInputId(typeIndex, metricKey) {
  return 'sla-d-' + typeIndex + '-' + metricKey;
}

function _slaaInputHtml(typeIndex, m, value) {
  const step = m.decimals > 0 ? (1 / Math.pow(10, m.decimals)).toFixed(m.decimals) : '1';
  return `<input type="number" class="sla-input" id="${escAttr(_slaaInputId(typeIndex, m.key))}" min="0" max="${escAttr(CONFIG.SLA.MAX_VALUE)}" step="${step}" inputmode="decimal" placeholder="Not evaluated" aria-label="${escAttr(m.label)}" value="${escAttr(value == null ? '' : value)}">`;
}

function _slaaDefaultsHtml(rows) {
  const types = slaProjectTypes();
  const head = CONFIG.SLA.METRICS.map(m =>
    `<th>${escHtml(m.label)} <span class="sla-unit">(${escHtml(m.unit)})</span></th>`).join('');
  const body = types.map((type, i) => {
    const have = rows.filter(r => slaRowKind(r) === 'default' && String(r.ProjectType).trim() === type);
    const row = have.length ? have.reduce((a, b) => (Number(b.id) < Number(a.id) ? b : a)) : null;
    const cells = CONFIG.SLA.METRICS.map(m =>
      `<td>${_slaaInputHtml(i, m, row ? slaCleanValue(row[m.column]) : null)}</td>`).join('');
    return `
      <tr>
        <td>${escHtml(type)}${row ? '' : '<span class="checklist-tag">No default row yet</span>'}</td>
        ${cells}
        <td><button type="button" class="btn-primary btn-sm"${act('slaSaveDefault', type)}>Save</button></td>
      </tr>`;
  }).join('');
  return `
    <div class="table-scroll">
      <table class="data-table sla-defaults-table">
        <thead><tr><th>Project type</th>${head}<th></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function _slaaOverridesHtml(rows, projects) {
  const overrides = rows.filter(r => slaRowKind(r) === 'override')
    .sort((a, b) => Number(a.ProjectID) - Number(b.ProjectID) || Number(a.id) - Number(b.id));
  const cols = 2 + CONFIG.SLA.METRICS.length;
  const body = overrides.map(r => {
    const p = projects.find(x => String(x.id) === String(r.ProjectID));
    const name = p
      ? `<a href="#"${act('openProjectPage.prevent', Number(p.id))}>${escHtml(p.CustomerName || '—')}</a>`
      : escHtml('Project #' + Number(r.ProjectID) + ' (not found)');
    const cells = CONFIG.SLA.METRICS.map(m =>
      `<td>${escHtml(slaFormatTarget(r[m.column], m))}</td>`).join('');
    return `<tr><td>${name}</td><td>${escHtml(p ? (p.ProjectType || '—') : '—')}</td>${cells}</tr>`;
  }).join('');
  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Project</th><th>Type</th>${CONFIG.SLA.METRICS.map(m => `<th>${escHtml(m.label)}</th>`).join('')}</tr></thead>
        <tbody>${body || emptyStateRow({ colspan: cols, icon: 'inbox', message: 'No project overrides.' })}</tbody>
      </table>
    </div>`;
}

async function buildSlaTargetsTab() {
  let rows, projects;
  try {
    [rows, projects] = await Promise.all([getSLATargets(), getProjects(false)]);
  } catch (e) {
    console.warn('SLA targets tab: read failed', e);
    return pageErrorBlock({
      message: "SLATargets couldn't be read. Check the list exists (Admin → Data Health → SLA targets).",
      retryAct: ['renderAdminTab', 'slaTargets'],
    });
  }
  return `
    <div class="sla-admin">
      <h3>Company defaults</h3>
      <p class="admin-tab-intro">
        The target every project of a type starts from. Leave a box blank and that metric isn't
        evaluated. A project can override these on its Project page (Admin and Leadership).
        LCI, Transformation and Internal projects have no SLAs.
      </p>
      <div id="sla-d-error" class="form-error"></div>
      ${_slaaDefaultsHtml(rows)}
      <h3>Project overrides</h3>
      <p class="admin-tab-intro">Read-only here. Edit or reset an override from the project's own page.</p>
      ${_slaaOverridesHtml(rows, projects)}
    </div>`;
}

function _slaaShowError(msg) {
  if (msg) showFormError('sla-d', msg);
  else clearFormError('sla-d');
}

async function slaSaveDefault(type) {
  if (_slaaBusy || _resolvedRole !== CONFIG.ROLE_IDS.ADMIN || !canEditSlaTargets(_resolvedRole, 'default')) return;
  const typeIndex = slaProjectTypes().indexOf(type);
  if (typeIndex < 0) return;
  _slaaShowError('');
  const values = {};
  for (const m of CONFIG.SLA.METRICS) {
    const el = document.getElementById(_slaaInputId(typeIndex, m.key));
    const parsed = slaParseInput(el ? el.value : '', m);
    if (!parsed.ok) {
      if (el) el.setAttribute('aria-invalid', 'true');
      _slaaShowError(parsed.error);
      return;
    }
    if (el) el.removeAttribute('aria-invalid');
    values[m.key] = parsed.value;
  }
  _slaaBusy = true;
  try {
    const fresh = await getSLATargets();          // never plan from the rendered rows
    const plan = slaEditPlan('default', type, fresh, values);
    if (plan.error) { _slaaShowError(plan.error); return; }
    await saveSlaTargets(plan);
    await renderAdminTab('slaTargets');
    toast(type + ' defaults saved', { type: 'success' });
  } catch (e) {
    console.warn('SLA defaults save failed', e);
    _slaaShowError('Error: ' + (e && e.message ? e.message : String(e)));
  } finally {
    _slaaBusy = false;
  }
}

registerActions({
  slaSaveDefault,
});