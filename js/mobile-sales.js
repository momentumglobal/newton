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
        <div class="m-role-title">${f.Title || '-'}</div>
        <div class="m-role-meta">${msFmtForecastDate(f.ForecastStartDate)} - ${msFmtForecastDate(f.ForecastEndDate)}</div>
        <div class="m-role-footer">
          <span class="m-stage-badge">${f.ForecastedHeadcount ?? '-'} HC</span>
          ${f.ForecastMonthlyRevenuePerHead ? `<span class="m-days-open">£${Number(f.ForecastMonthlyRevenuePerHead).toLocaleString('en-GB')}/head</span>` : ''}
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
        <input class="m-input" type="text" id="msf-title" value="${(f.Title || '').replace(/"/g, '&quot;')}">
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
      <div class="m-input-row">
        <div class="m-form-group">
          <label class="m-label">Headcount *</label>
          <input class="m-input" type="number" id="msf-hc" min="1" step="1" value="${f.ForecastedHeadcount ?? ''}">
        </div>
        <div class="m-form-group">
          <label class="m-label">Rev / head (£)</label>
          <input class="m-input" type="number" id="msf-rev" min="0" step="100" value="${f.ForecastMonthlyRevenuePerHead ?? ''}">
        </div>
      </div>
      <div class="m-form-group">
        <label class="m-label">Notes</label>
        <input class="m-input" type="text" id="msf-notes" value="${(f.Notes || '').replace(/"/g, '&quot;')}">
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
    ForecastMonthlyRevenuePerHead: rev === '' ? null : parseFloat(rev),
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
