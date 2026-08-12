// js/mobile-sales.js - Mobile Sales module (write-enabled)
//
// Phase C: Sales Forecast list with add / edit (write actions, like Reporting).
// Reuses the desktop CRUD: getSalesForecasts / createSalesForecast /
// updateSalesForecast. (Delete is desktop-only for now - mobile keeps it to
// add + edit to avoid accidental taps on a phone.)
//
// Sales module is admin/leadership-only (matches CONFIG.OS_MODULES roles).

function msFmtForecastDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

// --- Forecast list ---
async function mobileRenderSalesForecast(main) {
  mobileSetTitle('Sales', 'Forecast');
  main.innerHTML = '<div class="m-empty">Loading forecasts...</div>';

  try {
    const forecasts = await getSalesForecasts();
    forecasts.sort((a, b) =>
      new Date(a.ForecastStartDate) - new Date(b.ForecastStartDate));

    const addBtn = `
      <div class="m-action-row" style="margin-bottom:14px">
        <button class="m-btn-primary" onclick="mobileSalesForecastForm()">+ Add Forecast</button>
      </div>`;

    if (!forecasts.length) {
      main.innerHTML = addBtn +
        '<div class="m-empty">No forecasts added yet.</div>';
      return;
    }

    const cards = forecasts.map(f => `
      <div class="m-role-card" onclick="mobileSalesForecastForm(${f.id})">
        <div class="m-role-title">${escHtml(f.Title || '-')}</div>
        <div class="m-role-meta">${msFmtForecastDate(f.ForecastStartDate)} - ${msFmtForecastDate(f.ForecastEndDate)}</div>
        <div class="m-role-footer">
          <span class="m-stage-badge">${f.ForecastedHeadcount ?? '-'} ${
            CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(f.ProjectType) ? 'searches' : 'HC'}</span>
          ${CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(f.ProjectType)
            ? `<span class="m-days-open">£${Number((parseFloat(f.RetainerFee)||0) + (parseFloat(f.PlacementFee)||0)).toLocaleString('en-GB')}/search</span>`
            : (f.ForecastMonthlyRevenuePerHead ? `<span class="m-days-open">£${Number(f.ForecastMonthlyRevenuePerHead).toLocaleString('en-GB')}/head</span>` : '')}
        </div>
      </div>`).join('');

    main.innerHTML = addBtn + cards;
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error loading forecasts: ${e.message}</div>`;
  }
}

// --- Add / Edit forecast form ---
async function mobileSalesForecastForm(editId) {
  mobileSetTitle(editId ? 'Edit Forecast' : 'Add Forecast', 'Sales');
  const main = document.getElementById('m-main');
  main.innerHTML = '<div class="m-empty">Loading...</div>';

  let f = {};
  if (editId) {
    try {
      const forecasts = await getSalesForecasts();
      f = forecasts.find(x => x.id === editId) || {};
    } catch (e) { /* fall back to empty */ }
  }

  const dVal = iso => iso ? iso.substring(0, 10) : '';

  main.innerHTML = `
    <div class="m-detail-panel">
      <div class="m-form-group">
        <label class="m-label">Customer / Project Name *</label>
        <input class="m-input" type="text" id="msf-title" value="${escAttr(f.Title || '')}">
      </div>
      <div class="m-input-row">
        <div class="m-form-group">
          <label class="m-label">Start *</label>
          <input class="m-input" type="date" id="msf-start" value="${dVal(f.ForecastStartDate)}">
        </div>
        <div class="m-form-group">
          <label class="m-label">End *</label>
          <input class="m-input" type="date" id="msf-end" value="${dVal(f.ForecastEndDate)}">
        </div>
      </div>
      <div class="m-form-group">
        <label class="m-label">Project Type *</label>
        <select class="m-input" id="msf-type" onchange="_msfTypeChange()">
          ${CONFIG.PROJECT_TYPES.map(t =>
            `<option value="${escAttr(t)}" ${
              (CONFIG.PROJECT_TYPES.includes(f.ProjectType) ? f.ProjectType : CONFIG.PROJECT_TYPES[0]) === t
                ? 'selected' : ''}>${escHtml(t)}</option>`).join('')}
        </select>
      </div>
      <div class="m-input-row">
        <div class="m-form-group">
          <label class="m-label" id="msf-hc-label">Headcount *</label>
          <input class="m-input" type="number" id="msf-hc" min="1" step="1" value="${f.ForecastedHeadcount ?? ''}">
        </div>
        <div class="m-form-group" id="msf-rev-group">
          <label class="m-label">Rev / head (£)</label>
          <input class="m-input" type="number" id="msf-rev" min="0" step="100" value="${f.ForecastMonthlyRevenuePerHead ?? ''}">
        </div>
      </div>
      <div class="m-input-row is-hidden" id="msf-splitfee-row">
        <div class="m-form-group">
          <label class="m-label">Retainer (£)</label>
          <input class="m-input" type="number" id="msf-retainer" min="0" step="100" value="${f.RetainerFee ?? ''}">
        </div>
        <div class="m-form-group">
          <label class="m-label">Placement (£)</label>
          <input class="m-input" type="number" id="msf-placement" min="0" step="100" value="${f.PlacementFee ?? ''}">
        </div>
      </div>
      <div class="m-form-group">
        <label class="m-label">Notes</label>
        <input class="m-input" type="text" id="msf-notes" value="${escAttr(f.Notes || '')}">
      </div>
      <div class="m-form-error" id="msf-error"></div>
    </div>
    <div class="m-action-row">
      <button class="m-btn-primary" id="msf-submit" onclick="mobileSaveForecast(${editId || 'null'})">
        ${editId ? 'Save Changes' : 'Add Forecast'}
      </button>
      <button class="m-btn-secondary" onclick="mobileNav('sales-forecast', false)">Cancel</button>
    </div>
  `;
  _msfTypeChange();   // N-116: match the fee fields to the saved/default type
}

// N-116: mirrors _onForecastTypeChange() on desktop.
function _msfTypeChange() {
  const type    = document.getElementById('msf-type')?.value;
  const isSplit = CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(type);
  document.getElementById('msf-rev-group')?.classList.toggle('is-hidden', isSplit);
  document.getElementById('msf-splitfee-row')?.classList.toggle('is-hidden', !isSplit);
  const label = document.getElementById('msf-hc-label');
  if (label) label.textContent = isSplit ? 'Searches *' : 'Headcount *';
}

async function mobileSaveForecast(editId) {
  const btn   = document.getElementById('msf-submit');
  const errEl = document.getElementById('msf-error');
  errEl.style.display = 'none';
  const fail = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };

  const title = document.getElementById('msf-title').value.trim();
  const start = document.getElementById('msf-start').value;
  const end   = document.getElementById('msf-end').value;
  const hc    = parseInt(document.getElementById('msf-hc').value, 10);
  const rev   = document.getElementById('msf-rev').value;
  const fcType    = document.getElementById('msf-type').value;
  const retainer  = document.getElementById('msf-retainer').value;
  const placement = document.getElementById('msf-placement').value;
  const isSplit   = CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(fcType);
  const notes = document.getElementById('msf-notes').value.trim();

  if (!title) return fail('Customer / Project name is required.');
  if (!start) return fail('Start date is required.');
  if (!end)   return fail('End date is required.');
  if (new Date(end) <= new Date(start)) return fail('End date must be after start date.');
  if (!hc || hc < 1) return fail('Headcount must be at least 1.');

  btn.disabled = true; btn.textContent = 'Saving...';

  // IDENTICAL payload to desktop saveForecast.
  const payload = {
    Title: title,
    ForecastStartDate: start,
    ForecastEndDate: end,
    ForecastedHeadcount: hc,
    ProjectType: fcType,
    ForecastMonthlyRevenuePerHead:
      isSplit || rev === '' ? null : parseFloat(rev),
    RetainerFee:  isSplit && retainer  !== '' ? parseFloat(retainer)  : null,
    PlacementFee: isSplit && placement !== '' ? parseFloat(placement) : null,
    Notes: notes,
  };

  try {
    if (editId) await updateSalesForecast(editId, payload);
    else        await createSalesForecast(payload);
    mobileToast(editId ? 'Forecast updated ✓' : 'Forecast added ✓');
    mobileNav('sales-forecast', false);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = editId ? 'Save Changes' : 'Add Forecast';
    fail('Error: ' + e.message);
  }
}
