// js/lci-pages.js — LCI Cost Model pages (Sales module)
// Step 4 scope: model list page (create / copy / delete / visibility scoping).
// Editor, summary, compare and export pages arrive in later build steps.

let _lciModelsCache = null; // page-level cache; invalidated by api.js writes anyway

// ── Model list page ──────────────────────────────────────────────────

async function renderLCIModelsPage() {
  document.body.classList.remove('lci-summary-mode');
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';

  try {
    let models = await getLCIModels();

    // Visibility: Admin/Leadership see all; DMs only models assigned to them.
    const role = _salesResolvedRole;
    if (role === 'delivery_manager') {
      const email = (getCurrentUser().email || '').toLowerCase();
      models = models.filter(m => (m.AssignedDMEmail || '').toLowerCase() === email);
    }

    models.sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
    _lciModelsCache = models;
    main.innerHTML = _renderLCIModelList(models, role);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error loading LCI models: ${e.message}</p>`;
  }
}

function _lciStatusPill(status) {
  const s = status || 'Draft';
  return `<span class="lci-status lci-status--${s.toLowerCase()}">${s}</span>`;
}

function _lciTotalHires(model) {
  // Header-only list view: hires shown after rows load in the editor.
  // Kept as a placeholder column for now (populated in step 5+).
  return '—';
}

function _renderLCIModelList(models, role) {
  const isAdmin = role === 'admin';
  const canManage = role === 'admin' || role === 'leadership';

  const rows = models.length
    ? models.map(m => `
        <tr>
          <td style="width:32px;text-align:center">
            <input type="checkbox" class="lci-compare-cb" value="${m.id}"
                   data-ccy="${m.DisplayCurrency || ''}" onchange="lciCompareSelectionChanged()">
          </td>
          <td><strong>${m.Title || '—'}</strong></td>
          <td>${m.ClientName || '—'}</td>
          <td>${m.Location || '—'}</td>
          <td>${m.LocalCurrency || '—'} → ${m.DisplayCurrency || '—'}</td>
          <td>${_lciStatusPill(m.Status)}</td>
          <td>${m.AssignedDMEmail || '—'}</td>
          <td>${m.HorizonMonths ? m.HorizonMonths + 'm' : '—'}</td>
          <td>
            <div class="row-actions">
              <button class="btn-secondary" onclick="openLCIModel(${m.id})">Open</button>
              <button class="btn-secondary" onclick="openLCIModelModal(${m.id})">Edit</button>
              <button class="btn-secondary" onclick="copyLCIModelAction(${m.id})">Copy</button>
              ${isAdmin ? `<button class="btn-secondary lci-btn-muted" onclick="deleteLCIModelAction(${m.id})">Delete</button>` : ''}
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="9" style="color:#888;text-align:center">No models yet${role === 'delivery_manager' ? ' assigned to you' : ''}.</td></tr>`;

  return `
    <div class="page-header">
      <h2>LCI Cost Models</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" id="lci-report-btn" onclick="lciExportReport()" disabled
                title="Tick one or more models">Export Report</button>
        <button class="btn-secondary" id="lci-compare-btn" onclick="lciCompareSelected()" disabled
                title="Tick two or more models with the same display currency">Compare</button>
        ${canManage || role === 'delivery_manager' ? '<button class="btn-primary" onclick="openLCIModelModal()">+ New Model</button>' : ''}
      </div>
    </div>
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px">
      <table class="data-table">
        <thead>
          <tr>
            <th></th><th>Model</th><th>Client</th><th>Location</th><th>Currency (local → display)</th>
            <th>Status</th><th>Assigned DM</th><th>Horizon</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${_lciModelModal(role)}`;
}

// ── New Model modal ──────────────────────────────────────────────────

function _lciModelModal(role) {
  const canAssign = role === 'admin' || role === 'leadership';
  const currencies = lciCurrencyOptions(CONFIG.COUNTRY_CURRENCY);
  const ccyOptions = sel => currencies.map(c =>
    `<option value="${c}"${c === sel ? ' selected' : ''}>${c}</option>`).join('');
  const D = CONFIG.LCI.DEFAULTS;
  const thisMonth = new Date();
  const defaultStart = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}`;

  return `
    <div id="lci-model-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);
         z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:8px;padding:32px;width:520px;max-width:95vw;
                  max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
        <h3 style="margin:0 0 20px;color:#1B3A5C" id="lci-model-modal-title">New LCI Cost Model</h3>
        <form id="lci-model-form" onsubmit="saveLCIModel(event)">
          <div class="form-group">
            <label>Model name *</label>
            <input type="text" class="form-control" name="Title" required placeholder="e.g. Bucharest v1">
          </div>
          <div class="form-group">
            <label>Client name *</label>
            <input type="text" class="form-control" name="ClientName" required>
          </div>
          <div class="form-group">
            <label>CoE location *</label>
            <input type="text" class="form-control" name="Location" required placeholder="e.g. Bucharest, Romania">
          </div>
          <div style="display:flex;gap:12px">
            <div class="form-group" style="flex:1">
              <label>Local currency *</label>
              <select class="form-control" name="LocalCurrency" onchange="lciToggleFxInput()" id="lci-local-ccy">
                ${ccyOptions('EUR')}
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label>Display currency *</label>
              <select class="form-control" name="DisplayCurrency" onchange="lciToggleFxInput()" id="lci-display-ccy">
                ${ccyOptions('EUR')}
              </select>
            </div>
          </div>
          <div class="form-group" id="lci-fx-group" style="display:none">
            <label>FX rate (local → display) *</label>
            <input type="number" class="form-control" name="FXRateLocalToDisplay" step="0.0001" min="0" id="lci-fx-rate"
                   placeholder="e.g. 0.2 (1 local = 0.2 display)">
          </div>
          <div style="display:flex;gap:12px">
            <div class="form-group" style="flex:1">
              <label>Start month (M1) *</label>
              <input type="month" class="form-control" name="StartMonth" required value="${defaultStart}">
            </div>
            <div class="form-group" style="flex:1">
              <label>Horizon (months) *</label>
              <input type="number" class="form-control" name="HorizonMonths" required
                     min="${CONFIG.LCI.HORIZON_MIN}" max="${CONFIG.LCI.HORIZON_MAX}" value="${D.HorizonMonths}">
            </div>
          </div>
          ${canAssign ? `
          <div class="form-group">
            <label>Assigned DM (email)</label>
            <input type="email" class="form-control" name="AssignedDMEmail" placeholder="Optional">
          </div>` : ''}
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:24px">
            <button type="button" class="btn-secondary" onclick="closeLCIModelModal()">Cancel</button>
            <button type="submit" class="btn-primary" id="lci-model-save-btn">Create Model</button>
          </div>
        </form>
      </div>
    </div>`;
}

let _lciEditingModelId = null;

// No arg = create; with a model id = edit (name, client, location, currencies,
// FX, start month, horizon, assigned DM — assumptions/status stay on the model).
function openLCIModelModal(modelId = null) {
  _lciEditingModelId = modelId;
  const form = document.getElementById('lci-model-form');
  form.reset();
  if (modelId) {
    const m = (_lciModelsCache || []).find(x => String(x.id) === String(modelId));
    if (m) {
      for (const [k, v] of Object.entries({
        Title: m.Title, ClientName: m.ClientName, Location: m.Location,
        LocalCurrency: m.LocalCurrency, DisplayCurrency: m.DisplayCurrency,
        FXRateLocalToDisplay: m.FXRateLocalToDisplay, StartMonth: m.StartMonth,
        HorizonMonths: m.HorizonMonths, AssignedDMEmail: m.AssignedDMEmail,
      })) {
        if (form.elements[k] && v !== null && v !== undefined) form.elements[k].value = v;
      }
    }
  }
  document.getElementById('lci-model-modal-title').textContent = modelId ? 'Edit LCI Cost Model' : 'New LCI Cost Model';
  document.getElementById('lci-model-save-btn').textContent = modelId ? 'Save Changes' : 'Create Model';
  document.getElementById('lci-model-modal').style.display = 'flex';
  lciToggleFxInput();
}
function closeLCIModelModal() {
  _lciEditingModelId = null;
  document.getElementById('lci-model-modal').style.display = 'none';
}
function lciToggleFxInput() {
  const local   = document.getElementById('lci-local-ccy')?.value;
  const display = document.getElementById('lci-display-ccy')?.value;
  const group   = document.getElementById('lci-fx-group');
  const rate    = document.getElementById('lci-fx-rate');
  if (!group || !rate) return;
  const differ = local !== display;
  group.style.display = differ ? '' : 'none';
  rate.required = differ;
}

async function saveLCIModel(event) {
  event.preventDefault();
  const btn = document.getElementById('lci-model-save-btn');
  setButtonLoading(btn);
  try {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const user = getCurrentUser();
    const role = _salesResolvedRole;
    const D = CONFIG.LCI.DEFAULTS;

    if (_lciEditingModelId) {
      // Edit: update header fields only — rows, status, assumptions untouched.
      await updateLCIModel(_lciEditingModelId, {
        Title:                data.Title,
        ClientName:           data.ClientName,
        Location:             data.Location,
        LocalCurrency:        data.LocalCurrency,
        DisplayCurrency:      data.DisplayCurrency,
        FXRateLocalToDisplay: data.LocalCurrency !== data.DisplayCurrency ? Number(data.FXRateLocalToDisplay) : null,
        StartMonth:           data.StartMonth,
        HorizonMonths:        Number(data.HorizonMonths),
        ...(data.AssignedDMEmail !== undefined ? { AssignedDMEmail: data.AssignedDMEmail || null } : {}),
      });
      closeLCIModelModal();
      await renderLCIModelsPage();
      return;
    }

    await createLCIModel({
      Title:                data.Title,
      ClientName:           data.ClientName,
      Location:             data.Location,
      LocalCurrency:        data.LocalCurrency,
      DisplayCurrency:      data.DisplayCurrency,
      FXRateLocalToDisplay: data.LocalCurrency !== data.DisplayCurrency ? Number(data.FXRateLocalToDisplay) : null,
      StartMonth:           data.StartMonth,            // YYYY-MM string, never a Date
      HorizonMonths:        Number(data.HorizonMonths),
      Status:               'Draft',
      // DMs creating their own model are auto-assigned to it.
      AssignedDMEmail:      data.AssignedDMEmail || (role === 'delivery_manager' ? user.email : null),
      EmployerBurdenPct:    D.EmployerBurdenPct,
      SalaryMonths:         D.SalaryMonths,
      OfficeCostPerHead:    D.OfficeCostPerHead,
      EoRFeePerHead:        D.EoRFeePerHead,
      TravelPerMonth:       D.TravelPerMonth,
      SectionsEnabled:      JSON.stringify({ coe: true, legacy: true, oneoffs: true, fees: true }),
    });
    closeLCIModelModal();
    await renderLCIModelsPage();
  } catch (e) {
    alert('Error creating model: ' + e.message);
  } finally {
    clearButtonLoading(btn);
  }
}

// ── Compare selection ────────────────────────────────────────────────

function _lciCheckedCompareBoxes() {
  return [...document.querySelectorAll('.lci-compare-cb:checked')];
}

function lciCompareSelectionChanged() {
  const checked = _lciCheckedCompareBoxes();
  const btn = document.getElementById('lci-compare-btn');
  if (!btn) return;
  const sameCcy = checked.length >= 2 && checked[0].dataset.ccy &&
                  checked.every(cb => cb.dataset.ccy === checked[0].dataset.ccy);
  btn.disabled = !sameCcy;
  btn.textContent = `Compare (${checked.length})`;
  btn.title = checked.length < 2
    ? 'Tick two or more models with the same display currency'
    : (sameCcy ? 'Compare selected models' : 'Models must share the same display currency');

  const reportBtn = document.getElementById('lci-report-btn');
  if (reportBtn) {
    reportBtn.disabled = checked.length === 0;
    reportBtn.textContent = checked.length ? `Export Report (${checked.length})` : 'Export Report';
  }
}

function lciCompareSelected() {
  const checked = _lciCheckedCompareBoxes();
  if (checked.length < 2) return;
  renderLCIComparePage(checked.map(cb => cb.value));
}

function lciExportReport() {
  const checked = _lciCheckedCompareBoxes();
  if (!checked.length) return;
  renderLCIReportPage(checked.map(cb => cb.value));
}

// ── Row actions ──────────────────────────────────────────────────────

function openLCIModel(id) {
  renderLCIEditorPage(id);
}

async function copyLCIModelAction(id) {
  const m = (_lciModelsCache || []).find(x => String(x.id) === String(id));
  const newTitle = prompt('Name for the copy:', m ? `${m.Title} (copy)` : 'Copy');
  if (!newTitle) return;
  try {
    await copyLCIModel(id, newTitle);
    await renderLCIModelsPage();
  } catch (e) {
    alert('Error copying model: ' + e.message);
  }
}

async function deleteLCIModelAction(id) {
  const m = (_lciModelsCache || []).find(x => String(x.id) === String(id));
  if (!confirm(`Delete "${m ? m.Title : 'this model'}" and all its rows? This cannot be undone.`)) return;
  try {
    await deleteLCIModel(id);
    await renderLCIModelsPage();
  } catch (e) {
    alert('Error deleting model: ' + e.message);
  }
}
