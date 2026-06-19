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

function _fmtGBPk(v) {
  return '£' + Math.round(v).toLocaleString('en-GB');
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

// ── Revenue Line Graph (mirrors People > Team Utilisation) ────────
function _renderRevenueLineGraph(assignments, year, salesForecasts) {
  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const revenue = computeMonthlyRevenueForYear(assignments, year); // array[12]
  const forecastRev = computeMonthlyForecastRevenueForYear(salesForecasts || [], year);

  // Combined (estimated + forecast) series, used from the fork month onward
  const combined = revenue.map((v, i) => v + forecastRev[i]);

  // Fork at the current calendar month (same index rule for all years)
  const forkIdx = new Date().getMonth();

  const green = CONFIG.REVENUE_THRESHOLDS.green;
  const amber = CONFIG.REVENUE_THRESHOLDS.amber;

  // Dynamic y-axis: top is 10% above the higher of (max month, combined, green band)
  const dataMax = Math.max(...revenue, ...combined, green);
  const yMax    = Math.ceil((dataMax * 1.1) / 25000) * 25000; // round to £25k

  const W = 900, H = 240;
  const PAD = { top: 10, right: 24, bottom: 32, left: 64 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  const xOf = (i) => PAD.left + (i / 11) * chartW;
  const yOf = (v) => PAD.top + chartH - (Math.min(v, yMax) / yMax) * chartH;

  // Gridlines every £50k
  const gridVals = [];
  for (let v = 0; v <= yMax; v += 50000) gridVals.push(v);
  const gridLines = gridVals.map(v => {
    const y = yOf(v);
    return `
      <line x1='${PAD.left}' y1='${y}' x2='${W - PAD.right}' y2='${y}'
            stroke='#e8e8e8' stroke-width='1'/>
      <text x='${PAD.left - 6}' y='${y + 4}' text-anchor='end'
            font-size='10' fill='#999'>£${(v / 1000).toFixed(0)}k</text>`;
  }).join('');

  const xLabels = MONTH_LABELS.map((lbl, i) =>
    `<text x='${xOf(i)}' y='${PAD.top + chartH + 18}' text-anchor='middle'
           font-size='10' fill='#888'>${lbl}</text>`
  ).join('');

  // Threshold bands: green from green→top, orange amber→green, red 0→amber
  const bands = `
    <rect x='${PAD.left}' y='${yOf(yMax)}' width='${chartW}'
          height='${yOf(green) - yOf(yMax)}' fill='#e6f4ea' opacity='0.6'/>
    <rect x='${PAD.left}' y='${yOf(green)}' width='${chartW}'
          height='${yOf(amber) - yOf(green)}' fill='#fff3e0' opacity='0.6'/>
    <rect x='${PAD.left}' y='${yOf(amber)}' width='${chartW}'
          height='${yOf(0) - yOf(amber)}' fill='#fce8e8' opacity='0.6'/>`;

  const linePts = revenue
    .map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`)
    .join(' ');
  const line = `<polyline points='${linePts}' fill='none' stroke='#2E75B6'
                  stroke-width='2.5' stroke-linejoin='round'/>`;

  // Dashed forecast line: forks at forkIdx (shares that point with the solid
  // line), runs to Dec. Only drawn if any forecast revenue exists from the
  // fork month onward.
  const hasForecast = forecastRev.slice(forkIdx).some(v => v > 0);
  const forecastPts = combined
    .map((v, i) => ({ v, i }))
    .filter(p => p.i >= forkIdx)
    .map(p => `${xOf(p.i).toFixed(1)},${yOf(p.v).toFixed(1)}`)
    .join(' ');
  const forecastLine = hasForecast && forecastPts.includes(' ')
    ? `<polyline points='${forecastPts}' fill='none' stroke='#E8703A'
                stroke-width='2' stroke-dasharray='5,4'
                stroke-linejoin='round' opacity='0.85'/>`
    : '';

  const dots = revenue.map((v, i) => `
    <circle cx='${xOf(i).toFixed(1)}' cy='${yOf(v).toFixed(1)}'
            r='3.5' fill='#2E75B6' stroke='#fff' stroke-width='1.5'>
      <title>${MONTH_LABELS[i]} ${year}: ${_fmtGBPk(v)}</title>
    </circle>`).join('');

  const forecastDots = hasForecast
    ? combined.map((v, i) => ({ v, i }))
        .filter(p => p.i > forkIdx && forecastRev[p.i] > 0)
        .map(p => `
          <circle cx='${xOf(p.i).toFixed(1)}' cy='${yOf(p.v).toFixed(1)}'
                  r='3' fill='#fff' stroke='#E8703A' stroke-width='2' opacity='0.85'>
            <title>${MONTH_LABELS[p.i]} ${year}: ${_fmtGBPk(p.v)} (est. + forecast)</title>
          </circle>`).join('')
    : '';

  return `
    <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;
                padding:20px 20px 12px;margin-bottom:24px'>
      <div style='font-size:13px;font-weight:700;color:#1B3A5C;margin-bottom:8px'>
        Estimated Monthly Revenue ${year}</div>
      <svg viewBox='0 0 ${W} ${H}' style='width:100%;height:auto;display:block'
           xmlns='http://www.w3.org/2000/svg'>
        ${bands}
        ${gridLines}
        ${xLabels}
        ${line}
        ${forecastLine}
        ${dots}
        ${forecastDots}
      </svg>
      <div style='display:flex;justify-content:center;gap:24px;margin-top:4px;
                  font-size:11px;color:#555'>
        <div style='display:flex;align-items:center;gap:6px'>
          <svg width='24' height='2' style='overflow:visible'>
            <line x1='0' y1='1' x2='24' y2='1' stroke='#2E75B6' stroke-width='2.5'/>
          </svg>
          Estimated (booked)
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <svg width='24' height='2' style='overflow:visible'>
            <line x1='0' y1='1' x2='24' y2='1' stroke='#E8703A' stroke-width='2'
                  stroke-dasharray='5,4' opacity='0.85'/>
          </svg>
          Estimated + Forecast
        </div>
      </div>
      <div style='display:flex;justify-content:center;gap:24px;margin-top:8px;
                  font-size:11px;color:#555'>
        <div style='display:flex;align-items:center;gap:6px'>
          <span style='width:12px;height:12px;background:#e6f4ea;border:1px solid #cde6d4;
                       display:inline-block;border-radius:2px'></span>
          ≥ ${_fmtGBPk(green)}
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <span style='width:12px;height:12px;background:#fff3e0;border:1px solid #f0dcc0;
                       display:inline-block;border-radius:2px'></span>
          ${_fmtGBPk(amber)} – ${_fmtGBPk(green)}
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <span style='width:12px;height:12px;background:#fce8e8;border:1px solid #efcccc;
                       display:inline-block;border-radius:2px'></span>
          < ${_fmtGBPk(amber)}
        </div>
      </div>
    </div>`;
}

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
      const f = forecasts.find(x => x.id === id);
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
