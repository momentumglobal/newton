// js/sales-pages.js — Sales module pages

// ── Revenue Tracking Page ─────────────────────────────────────────

let _revTrackYear = null;      // selected year, set on first render
let _revTrackForecasts = null; // SalesForecasts cache for the chart

async function renderRevenueTrackingPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';

  try {
    const assignments = await getAssignments();
    _revTrackForecasts = await getSalesForecasts();
    const years = getAssignmentDataYears(assignments);
    if (_revTrackYear === null || !years.includes(_revTrackYear)) {
      const thisYear = new Date().getFullYear();
      _revTrackYear = years.includes(thisYear) ? thisYear : years[years.length - 1];
    }
    main.innerHTML = _renderRevenueTrackingPage(assignments, years);
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error loading revenue data: ${e.message}</p>`;
  }
}

function onRevTrackYearChange(val) {
  _revTrackYear = parseInt(val, 10);
  renderRevenueTrackingPage();
}

function _renderRevenueTrackingPage(assignments, years) {
  const yearOptions = years.map(y =>
    `<option value="${y}"${y === _revTrackYear ? ' selected' : ''}>${y}</option>`
  ).join('');

  return `
    <div class="page-header">
      <h2>Revenue Tracking</h2>
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:13px;color:#555">Year</label>
        <select class="form-control" style="width:auto"
                onchange="onRevTrackYearChange(this.value)">
          ${yearOptions}
        </select>
      </div>
    </div>
    ${_renderRevenueLineGraph(assignments, _revTrackYear, _revTrackForecasts || [])}`;
}

// ── Revenue Line Graph ────────────────────────────────────────────
// Moved to js/revenue-chart.js (shared with Command Centre).

// ── Sales Forecast Page ───────────────────────────────────────────

async function renderSalesForecastPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';

  try {
    const forecasts = await getSalesForecasts();
    forecasts.sort((a, b) => new Date(a.ForecastStartDate) - new Date(b.ForecastStartDate));
    main.innerHTML = _renderForecastPage(forecasts);
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error loading forecasts: ${e.message}</p>`;
  }
}

function _fmtForecastDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function _renderForecastPage(forecasts) {
  const rows = forecasts.length
    ? forecasts.map(f => `
        <tr>
          <td>${f.Title || '—'}</td>
          <td>${_fmtForecastDate(f.ForecastStartDate)}</td>
          <td>${_fmtForecastDate(f.ForecastEndDate)}</td>
          <td>${f.ForecastedHeadcount ?? '—'}</td>
          <td>${f.Notes || ''}</td>
          <td>
            <div class="row-actions">
              <button class="btn-secondary" onclick="openForecastModal(${f.id})">Edit</button>
              <button class="btn-danger" onclick="deleteForecastRecord(${f.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="6" style="color:#888;text-align:center">No forecasts added yet.</td></tr>`;

  return `
    <div class="page-header">
      <h2>Sales Forecast</h2>
      <button class="btn-primary" onclick="openForecastModal()">+ Add Forecast</button>
    </div>
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px">
      <table class="data-table">
        <thead>
          <tr>
            <th>Customer / Project</th>
            <th>Start</th>
            <th>End</th>
            <th>Headcount</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${_forecastModal()}`;
}

function _forecastModal() {
  return `
    <div id="forecast-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);
         z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:8px;padding:32px;width:480px;max-width:95vw;
                  box-shadow:0 8px 32px rgba(0,0,0,0.18)">
        <h3 id="forecast-modal-title" style="margin:0 0 20px;color:#1B3A5C">Add Forecast</h3>
        <input type="hidden" id="forecast-edit-id">
        <div class="form-group">
          <label>Customer / Project Name *</label>
          <input type="text" id="forecast-title" class="form-control">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="form-group">
            <label>Forecast Start Date *</label>
            <input type="date" id="forecast-start" class="form-control">
          </div>
          <div class="form-group">
            <label>Forecast End Date *</label>
            <input type="date" id="forecast-end" class="form-control">
          </div>
        </div>
        <div class="form-group">
          <label>Forecasted Headcount *</label>
          <input type="number" id="forecast-hc" class="form-control" min="1" step="1">
        </div>
        <div class="form-group">
          <label>Monthly Revenue per Head (£)</label>
          <input type="number" id="forecast-rev-per-head" class="form-control" min="0" step="100">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="forecast-notes" class="form-control" rows="3"></textarea>
        </div>
        <div id="forecast-error" class="form-error" style="display:none"></div>
        <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px">
          <button class="btn-secondary" onclick="closeForecastModal()">Cancel</button>
          <button class="btn-primary" id="forecast-save-btn" onclick="saveForecast()">Save</button>
        </div>
      </div>
    </div>`;
}

// ── Modal open/close ──────────────────────────────────────────────

async function openForecastModal(id) {
  document.getElementById('forecast-modal').style.display = 'flex';
  document.getElementById('forecast-error').style.display = 'none';
  document.getElementById('forecast-title').value = '';
  document.getElementById('forecast-start').value = '';
  document.getElementById('forecast-end').value = '';
  document.getElementById('forecast-hc').value = '';
  document.getElementById('forecast-rev-per-head').value = '';
  document.getElementById('forecast-notes').value = '';
  document.getElementById('forecast-edit-id').value = '';

  if (id) {
    document.getElementById('forecast-modal-title').textContent = 'Edit Forecast';
    document.getElementById('forecast-edit-id').value = id;
    try {
      const forecasts = await getSalesForecasts();
      const f = forecasts.find(x => String(x.id) === String(id));
      if (f) {
        document.getElementById('forecast-title').value = f.Title || '';
        document.getElementById('forecast-start').value = f.ForecastStartDate
          ? f.ForecastStartDate.substring(0, 10) : '';
        document.getElementById('forecast-end').value = f.ForecastEndDate
          ? f.ForecastEndDate.substring(0, 10) : '';
        document.getElementById('forecast-hc').value = f.ForecastedHeadcount ?? '';
        document.getElementById('forecast-rev-per-head').value = f.ForecastMonthlyRevenuePerHead ?? '';
        document.getElementById('forecast-notes').value = f.Notes || '';
      }
    } catch (e) {
      showForecastError('Error loading forecast: ' + e.message);
    }
  } else {
    document.getElementById('forecast-modal-title').textContent = 'Add Forecast';
  }
}

function closeForecastModal() {
  document.getElementById('forecast-modal').style.display = 'none';
}

function showForecastError(msg) {
  const el = document.getElementById('forecast-error');
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Save / Delete ─────────────────────────────────────────────────

async function saveForecast() {
  const title = document.getElementById('forecast-title').value.trim();
  const start = document.getElementById('forecast-start').value;
  const end   = document.getElementById('forecast-end').value;
  const hc    = parseInt(document.getElementById('forecast-hc').value, 10);
  const revPerHead = document.getElementById('forecast-rev-per-head').value;
  const notes = document.getElementById('forecast-notes').value.trim();
  const editId = document.getElementById('forecast-edit-id').value;

  document.getElementById('forecast-error').style.display = 'none';

  if (!title) return showForecastError('Customer / Project name is required.');
  if (!start) return showForecastError('Start date is required.');
  if (!end)   return showForecastError('End date is required.');
  if (new Date(end) <= new Date(start)) return showForecastError('End date must be after start date.');
  if (!hc || hc < 1) return showForecastError('Headcount must be at least 1.');

  const btn = document.getElementById('forecast-save-btn');
  const orig = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const payload = {
      Title: title,
      ForecastStartDate: start,
      ForecastEndDate: end,
      ForecastedHeadcount: hc,
      ForecastMonthlyRevenuePerHead: revPerHead === '' ? null : parseFloat(revPerHead),
      Notes: notes,
    };
    if (editId) {
      await updateSalesForecast(parseInt(editId, 10), payload);
    } else {
      await createSalesForecast(payload);
    }
    closeForecastModal();
    await renderSalesForecastPage();
  } catch (e) {
    showForecastError('Error saving forecast: ' + e.message);
    btn.textContent = orig;
    btn.disabled = false;
  }
}

async function deleteForecastRecord(id) {
  if (!confirm('Delete this forecast? This cannot be undone.')) return;
  try {
    await deleteSalesForecast(id);
    await renderSalesForecastPage();
  } catch (e) {
    alert('Error deleting forecast: ' + e.message);
  }
}
