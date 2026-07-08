// js/lci-editor.js — LCI Cost Model editor
// Step 5 scope: settings bar + CoE hiring roadmap grid.
// Legacy / one-offs / fees sections and the live cost output arrive in step 6
// (placeholders rendered below the roadmap).
// Load order: after lci-model.js and lci-pages.js, before sales-app.js.

// Page-level cache. Rows are edited in memory; Save writes diffs only.
let _lciEd = null; // { model, rows, deletedRowIds, origRows, dirtySettings, dirtyRows }

// ── Entry point ──────────────────────────────────────────────────────

async function renderLCIEditorPage(modelId) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';
  try {
    const [model, rows] = await Promise.all([
      getLCIModelById(modelId),
      getLCIRows(modelId),
    ]);
    rows.sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
    _lciEd = {
      model,
      rows,
      deletedRowIds: [],
      origRows: new Map(rows.map(r => [String(r.id), JSON.stringify(_lciRowSnapshot(r))])),
      dirtySettings: false,
      dirtyRows: false,
    };
    main.innerHTML = _lciEditorHtml();
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error loading model: ${e.message}</p>`;
  }
}

function _lciRowSnapshot(r) {
  return {
    Title: r.Title, RowType: r.RowType, Team: r.Team, CareerLevel: r.CareerLevel,
    AnnualSalary: r.AnnualSalary, BonusPct: r.BonusPct, Quantity: r.Quantity,
    ExitMonth: r.ExitMonth, MonthValues: r.MonthValues, SortOrder: r.SortOrder,
  };
}

function lciEditorBack() {
  if ((_lciEd?.dirtySettings || _lciEd?.dirtyRows) &&
      !confirm('You have unsaved changes. Leave without saving?')) return;
  _lciEd = null;
  renderLCIModelsPage();
}

// ── Page shell ───────────────────────────────────────────────────────

function _lciEditorHtml() {
  const m = _lciEd.model;
  return `
    <div class="page-header">
      <h2>${m.Title} <span style="font-weight:400;color:#888;font-size:15px">— ${m.ClientName || ''}</span></h2>
      <button class="btn-secondary" onclick="lciEditorBack()">← Back to models</button>
    </div>
    ${_lciSettingsHtml()}
    ${_lciRoadmapHtml()}
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px;margin-top:16px;color:#888">
      Legacy team, one-offs, fees and the live cost output are delivered in build step 6.
    </div>`;
}

// ── Settings bar ─────────────────────────────────────────────────────

function _lciSettingsHtml() {
  const m = _lciEd.model;
  const role = _salesResolvedRole;
  const canAssign = role === 'admin' || role === 'leadership';
  const currencies = lciCurrencyOptions(CONFIG.COUNTRY_CURRENCY);
  const ccyOpts = sel => currencies.map(c => `<option value="${c}"${c === sel ? ' selected' : ''}>${c}</option>`).join('');
  const statusOpts = CONFIG.LCI.STATUSES.map(s => `<option value="${s}"${s === (m.Status || 'Draft') ? ' selected' : ''}>${s}</option>`).join('');
  const smOpts = CONFIG.LCI.SALARY_MONTHS.map(n => `<option value="${n}"${Number(m.SalaryMonths) === n ? ' selected' : ''}>${n}</option>`).join('');
  const sections = lciSections(m);
  const fxDiffer = m.LocalCurrency !== m.DisplayCurrency;

  const field = (label, inner) => `
    <div class="form-group" style="margin:0">
      <label style="font-size:12px">${label}</label>
      ${inner}
    </div>`;
  const numInput = (name, val, step, min) =>
    `<input type="number" class="form-control" data-setting="${name}" value="${val ?? ''}"
            step="${step}" min="${min ?? 0}" onchange="lciSettingChanged()">`;

  return `
    <div class="lci-settings" id="lci-settings">
      <div class="lci-settings__grid">
        ${field('Status', `<select class="form-control" data-setting="Status" onchange="lciSettingChanged()">${statusOpts}</select>`)}
        ${field(`Local currency`, `<select class="form-control" data-setting="LocalCurrency" onchange="lciSettingChanged()">${ccyOpts(m.LocalCurrency)}</select>`)}
        ${field(`Display currency`, `<select class="form-control" data-setting="DisplayCurrency" onchange="lciSettingChanged()">${ccyOpts(m.DisplayCurrency)}</select>`)}
        <div id="lci-fx-setting" style="${fxDiffer ? '' : 'display:none'}">
          ${field(`FX rate (local→display)`, numInput('FXRateLocalToDisplay', m.FXRateLocalToDisplay, '0.0001'))}
        </div>
        ${field(`Employer burden (0–1)`, numInput('EmployerBurdenPct', m.EmployerBurdenPct, '0.005'))}
        ${field('Salary months', `<select class="form-control" data-setting="SalaryMonths" onchange="lciSettingChanged()">${smOpts}</select>`)}
        ${field(`Office / head / month (${m.LocalCurrency})`, numInput('OfficeCostPerHead', m.OfficeCostPerHead, '10'))}
        ${field(`EoR / head / month (${m.LocalCurrency})`, numInput('EoRFeePerHead', m.EoRFeePerHead, '10'))}
        ${field(`Travel / month (${m.LocalCurrency})`, numInput('TravelPerMonth', m.TravelPerMonth, '100'))}
        ${canAssign ? field('Assigned DM (email)',
          `<input type="email" class="form-control" data-setting="AssignedDMEmail" value="${m.AssignedDMEmail || ''}" onchange="lciSettingChanged()">`) : ''}
      </div>
      <div class="lci-settings__toggles">
        ${Object.entries(CONFIG.LCI.SECTION_LABELS).map(([key, label]) => `
          <label class="lci-toggle">
            <input type="checkbox" data-section="${key}" ${sections[key] ? 'checked' : ''} onchange="lciSettingChanged()">
            ${label}
          </label>`).join('')}
        <button class="btn-primary" id="lci-settings-save" onclick="saveLCISettings()" disabled>Save Settings</button>
      </div>
    </div>`;
}

function lciSettingChanged() {
  _lciEd.dirtySettings = true;
  document.getElementById('lci-settings-save').disabled = false;
  // Show/hide FX input live as currencies change
  const el  = document.getElementById('lci-settings');
  const loc = el.querySelector('[data-setting="LocalCurrency"]').value;
  const dis = el.querySelector('[data-setting="DisplayCurrency"]').value;
  document.getElementById('lci-fx-setting').style.display = loc !== dis ? '' : 'none';
}

async function saveLCISettings() {
  const btn = document.getElementById('lci-settings-save');
  setButtonLoading(btn);
  try {
    const el = document.getElementById('lci-settings');
    const fields = {};
    el.querySelectorAll('[data-setting]').forEach(input => {
      const key = input.dataset.setting;
      let val = input.value;
      if (input.type === 'number') val = val === '' ? null : Number(val);
      fields[key] = val;
    });
    const sections = {};
    el.querySelectorAll('[data-section]').forEach(cb => { sections[cb.dataset.section] = cb.checked; });
    fields.SectionsEnabled = JSON.stringify(sections);
    if (fields.LocalCurrency === fields.DisplayCurrency) fields.FXRateLocalToDisplay = null;

    // Diff against loaded model — write only what changed.
    const changed = {};
    for (const [k, v] of Object.entries(fields)) {
      if ((_lciEd.model[k] ?? null) !== (v ?? null)) changed[k] = v;
    }
    if (Object.keys(changed).length) {
      await updateLCIModel(_lciEd.model.id, changed);
      Object.assign(_lciEd.model, changed);
    }
    _lciEd.dirtySettings = false;
    clearButtonLoading(btn);
    btn.disabled = true;
    _lciRefreshDerived(); // burden / salary-months / FX changes affect row costs
  } catch (e) {
    clearButtonLoading(btn);
    alert('Error saving settings: ' + e.message);
  }
}

// ── CoE hiring roadmap grid ──────────────────────────────────────────

function _lciCoeRows() {
  return _lciEd.rows.filter(r => r.RowType === 'coe');
}

function _lciTeamsInOrder() {
  const seen = [];
  for (const r of _lciCoeRows()) {
    const t = r.Team || 'Other';
    if (!seen.includes(t)) seen.push(t);
  }
  return seen;
}

function _lciRoadmapHtml() {
  const m = _lciEd.model;
  const horizon = Number(m.HorizonMonths);
  const labels = lciMonthLabels(m.StartMonth, horizon);
  const coeRows = _lciCoeRows();
  const teams = _lciTeamsInOrder();

  const monthHead = labels.map(l => `<th class="lci-mcol">${l.replace(' (', '<br>(')}</th>`).join('');

  const bodyRows = teams.map(team => {
    const teamRows = coeRows.map((r, globalIdx) => ({ r, globalIdx }))
      .filter(({ r }) => (r.Team || 'Other') === team);
    const teamHtml = teamRows.map(({ r, globalIdx }) => _lciRoadmapRowHtml(r, globalIdx, horizon)).join('');
    return `
      <tr class="lci-team-row"><td colspan="${horizon + 6}"><strong>${team}</strong></td></tr>
      ${teamHtml}`;
  }).join('');

  return `
    <div id="lci-roadmap-section" style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px;margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;color:#1B3A5C">Hiring Roadmap <span style="font-weight:400;font-size:13px;color:#888">(salaries in ${m.LocalCurrency})</span></h3>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" onclick="addLCICoeRow()">+ Add Role</button>
          <button class="btn-primary" id="lci-roadmap-save" onclick="saveLCIRoadmap()" disabled>Save Roadmap</button>
        </div>
      </div>
      <div class="lci-grid-scroll">
        <table class="data-table lci-grid" id="lci-roadmap-table">
          <thead>
            <tr>
              <th style="min-width:180px">Role</th><th>Level</th>
              <th>Salary</th><th>Bonus %</th>
              ${monthHead}
              <th>Hires</th><th>Cost/mo</th><th></th>
            </tr>
          </thead>
          <tbody id="lci-roadmap-body">
            ${bodyRows || `<tr><td colspan="${horizon + 7}" style="color:#888;text-align:center">No roles yet — click + Add Role.</td></tr>`}
          </tbody>
          <tfoot id="lci-roadmap-foot">
            ${_lciRoadmapFootHtml(horizon)}
          </tfoot>
        </table>
      </div>
    </div>`;
}

function _lciRoadmapRowHtml(r, idx, horizon) {
  const vals = lciMonthValues(r, horizon);
  const cells = vals.map((v, i) => `
    <td class="lci-mcol">
      <input type="number" class="lci-cell" min="0" value="${v || ''}"
             onchange="lciCoeCellChanged(${idx}, ${i}, this.value)">
    </td>`).join('');
  const cost = lciMonthlyCost(r, _lciEd.model);
  return `
    <tr data-row-idx="${idx}">
      <td><input type="text" class="lci-cell lci-cell--wide" value="${r.Title || ''}"
                 onchange="lciCoeFieldChanged(${idx}, 'Title', this.value)"></td>
      <td><input type="text" class="lci-cell lci-cell--sm" value="${r.CareerLevel || ''}"
                 onchange="lciCoeFieldChanged(${idx}, 'CareerLevel', this.value)"></td>
      <td><input type="number" class="lci-cell" min="0" value="${r.AnnualSalary ?? ''}"
                 onchange="lciCoeFieldChanged(${idx}, 'AnnualSalary', this.value)"></td>
      <td><input type="number" class="lci-cell lci-cell--sm" min="0" max="1" step="0.01" value="${r.BonusPct ?? ''}"
                 onchange="lciCoeFieldChanged(${idx}, 'BonusPct', this.value)"></td>
      ${cells}
      <td class="lci-derived" id="lci-hires-${idx}">${vals.reduce((a, b) => a + b, 0)}</td>
      <td class="lci-derived" id="lci-cost-${idx}">${Math.round(cost).toLocaleString()}</td>
      <td><button class="btn-danger lci-row-del" onclick="removeLCICoeRow(${idx})">×</button></td>
    </tr>`;
}

function _lciRoadmapFootHtml(horizon) {
  const hires = lciHiresPerMonth(_lciEd.rows, _lciEd.model);
  let cum = 0;
  const cumCells = hires.map(h => { cum += h; return `<td class="lci-mcol lci-derived">${cum}</td>`; }).join('');
  const hireCells = hires.map(h => `<td class="lci-mcol lci-derived">${h || ''}</td>`).join('');
  return `
    <tr><td colspan="4"><strong>Hires per month</strong></td>${hireCells}<td class="lci-derived">${hires.reduce((a, b) => a + b, 0)}</td><td></td><td></td></tr>
    <tr><td colspan="4"><strong>Cumulative headcount</strong></td>${cumCells}<td></td><td></td><td></td></tr>`;
}

// ── Grid change handlers ─────────────────────────────────────────────

function _lciMarkRowsDirty() {
  _lciEd.dirtyRows = true;
  document.getElementById('lci-roadmap-save').disabled = false;
}

function lciCoeCellChanged(idx, monthIdx, value) {
  const r = _lciCoeRows()[idx];
  const horizon = Number(_lciEd.model.HorizonMonths);
  const vals = lciMonthValues(r, horizon);
  vals[monthIdx] = Number(value) || 0;
  r.MonthValues = JSON.stringify(vals);
  _lciMarkRowsDirty();
  _lciRefreshDerived(idx);
}

function lciCoeFieldChanged(idx, field, value) {
  const r = _lciCoeRows()[idx];
  r[field] = (field === 'AnnualSalary' || field === 'BonusPct')
    ? (value === '' ? null : Number(value)) : value;
  _lciMarkRowsDirty();
  _lciRefreshDerived(idx);
}

// Refresh derived cells (row totals + footer) without a full re-render,
// so inputs keep focus. Pass an idx to refresh one row, or nothing for all.
function _lciRefreshDerived(idx = null) {
  const horizon = Number(_lciEd.model.HorizonMonths);
  const coeRows = _lciCoeRows();
  const targets = idx === null ? coeRows.map((_, i) => i) : [idx];
  for (const i of targets) {
    const r = coeRows[i];
    if (!r) continue;
    const hiresEl = document.getElementById(`lci-hires-${i}`);
    const costEl  = document.getElementById(`lci-cost-${i}`);
    if (hiresEl) hiresEl.textContent = lciMonthValues(r, horizon).reduce((a, b) => a + b, 0);
    if (costEl)  costEl.textContent  = Math.round(lciMonthlyCost(r, _lciEd.model)).toLocaleString();
  }
  const foot = document.getElementById('lci-roadmap-foot');
  if (foot) foot.innerHTML = _lciRoadmapFootHtml(horizon);
}

// ── Add / remove rows ────────────────────────────────────────────────

function addLCICoeRow() {
  const team = prompt('Team (existing teams: ' + (_lciTeamsInOrder().join(', ') || 'none') + '):');
  if (team === null) return;
  const maxSort = Math.max(0, ..._lciEd.rows.map(r => r.SortOrder || 0));
  _lciEd.rows.push({
    // no id → created on save
    RowType: 'coe',
    Title: '',
    Team: team || 'Other',
    CareerLevel: '',
    AnnualSalary: null,
    BonusPct: 0,
    Quantity: 1,
    MonthValues: '[]',
    SortOrder: maxSort + 1,
  });
  _lciMarkRowsDirty();
  _lciRerenderRoadmap();
}

function removeLCICoeRow(idx) {
  const r = _lciCoeRows()[idx];
  if (!confirm(`Remove "${r.Title || 'this role'}" from the roadmap?`)) return;
  if (r.id) _lciEd.deletedRowIds.push(r.id);
  _lciEd.rows.splice(_lciEd.rows.indexOf(r), 1);
  _lciMarkRowsDirty();
  _lciRerenderRoadmap();
}

function _lciRerenderRoadmap() {
  // Full roadmap re-render (add/remove only — cell edits use _lciRefreshDerived)
  const section = document.getElementById('lci-roadmap-section');
  if (section) section.outerHTML = _lciRoadmapHtml();
  document.getElementById('lci-roadmap-save').disabled = !_lciEd.dirtyRows;
}

// ── Save roadmap (diff-only batch) ───────────────────────────────────

async function saveLCIRoadmap() {
  const btn = document.getElementById('lci-roadmap-save');
  setButtonLoading(btn);
  try {
    const modelId = _lciEd.model.id;

    // Deletes
    for (const id of _lciEd.deletedRowIds) await deleteLCIRow(id);
    _lciEd.deletedRowIds = [];

    // Creates + diff-only updates
    for (const r of _lciEd.rows) {
      const snapshot = _lciRowSnapshot(r);
      if (!r.id) {
        const created = await createLCIRow({ ...snapshot, ModelIDLookupId: Number(modelId) });
        r.id = created.id;
        _lciEd.origRows.set(String(r.id), JSON.stringify(snapshot));
      } else if (_lciEd.origRows.get(String(r.id)) !== JSON.stringify(snapshot)) {
        await updateLCIRow(r.id, snapshot);
        _lciEd.origRows.set(String(r.id), JSON.stringify(snapshot));
      }
    }

    _lciEd.dirtyRows = false;
    clearButtonLoading(btn);
    btn.disabled = true;
  } catch (e) {
    clearButtonLoading(btn);
    alert('Error saving roadmap: ' + e.message);
  }
}
