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
        <label style="font-size:13px;color:var(--text-label)">Year</label>
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
    if (window.lucide) lucide.createIcons();
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
    : emptyStateRow({ colspan: 6, icon: 'trending-up', message: 'No forecasts added yet.' });

  return `
    <div class="page-header">
      <h2>Sales Forecast</h2>
      <button class="btn-primary" onclick="openForecastModal()">+ Add Forecast</button>
    </div>
      <div class="print-avoid-break" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:20px">
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
        <div class="print-avoid-break" style="background:var(--surface);border-radius:8px;padding:32px;width:480px;max-width:95vw;
                  box-shadow:0 8px 32px rgba(0,0,0,0.18)">
          <h3 id="forecast-modal-title" style="margin:0 0 20px;color:var(--brand-tertiary)">Add Forecast</h3>
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
          <label>Project Type *</label>
          <select id="forecast-type" class="form-control"
            onchange="_onForecastTypeChange()">
            ${CONFIG.PROJECT_TYPES.map(t =>
              `<option value="${escAttr(t)}">${escHtml(t)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Forecasted Headcount *</label>
          <input type="number" id="forecast-hc" class="form-control" min="1" step="1"
            data-min-retained="1" data-min-split="0">
          <span class="form-hint" id="forecast-hc-hint"></span>
        </div>
        <div class="form-group" id="forecast-rate-group">
          <label>Monthly Revenue per Head (£)</label>
          <input type="number" id="forecast-rev-per-head" class="form-control" min="0" step="100">
        </div>
        <div class="form-group is-hidden" id="forecast-splitfee-group">
          <label>Retainer (£)</label>
          <input type="number" id="forecast-retainer" class="form-control" min="0" step="100">
          <span class="form-hint">Recognised in the forecast's start month.</span>
          <label style="margin-top:12px">Placement Fee (£)</label>
          <input type="number" id="forecast-placement" class="form-control" min="0" step="100">
          <span class="form-hint">Recognised in the month after the end month.</span>
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
  document.getElementById('forecast-retainer').value = '';
  document.getElementById('forecast-placement').value = '';
  document.getElementById('forecast-type').value = CONFIG.PROJECT_TYPES[0];
  document.getElementById('forecast-notes').value = '';
  document.getElementById('forecast-edit-id').value = '';
  _onForecastTypeChange();

  if (id) {
    document.getElementById('forecast-modal-title').textContent = 'Edit Forecast';
    document.getElementById('forecast-edit-id').value = id;
    try {
      const forecasts = await getSalesForecasts();
      const f = forecasts.find(x => String(x.id) === String(id));
      if (f) {
        document.getElementById('forecast-title').value = f.Title || '';
        document.getElementById('forecast-start').value = spDateIn(f.ForecastStartDate) || '';
        document.getElementById('forecast-end').value   = spDateIn(f.ForecastEndDate) || '';
        document.getElementById('forecast-hc').value = f.ForecastedHeadcount ?? '';
        document.getElementById('forecast-rev-per-head').value = f.ForecastMonthlyRevenuePerHead ?? '';
        // N-116: rows saved before this change have no ProjectType. Default them
        // to the first configured type so they keep their monthly-rate behaviour.
        document.getElementById('forecast-type').value =
          CONFIG.PROJECT_TYPES.includes(f.ProjectType) ? f.ProjectType : CONFIG.PROJECT_TYPES[0];
        document.getElementById('forecast-retainer').value  = f.RetainerFee  ?? '';
        document.getElementById('forecast-placement').value = f.PlacementFee ?? '';
        document.getElementById('forecast-notes').value = f.Notes || '';
        _onForecastTypeChange();
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

// N-116: Exec Search / MG AI forecast a flat retainer + placement fee for the
// whole line instead of a monthly rate per head, so the fee fields swap in. The
// Headcount label is UNCHANGED on every type — one TP can run several concurrent
// engagements, so headcount is a people count, never an engagement count. It
// drives utilisation only and is not part of the revenue calculation.
function _onForecastTypeChange() {
  const type    = document.getElementById('forecast-type')?.value;
  const isSplit = CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(type);
  document.getElementById('forecast-rate-group')
    ?.classList.toggle('is-hidden', isSplit);
  document.getElementById('forecast-splitfee-group')
    ?.classList.toggle('is-hidden', !isSplit);
  // N-116 QA2: the spinner must be able to reach 0 on a split-fee line, or the
  // hint below tells the user to do something the control won't allow. Retained
  // lines keep their floor of 1 so the guard stays visible, not just at save.
  const hcInput = document.getElementById('forecast-hc');
  if (hcInput) {
    hcInput.min = isSplit ? hcInput.dataset.minSplit : hcInput.dataset.minRetained;
  }
  const hint = document.getElementById('forecast-hc-hint');
  if (hint) {
    hint.textContent = isSplit
      ? 'Headcount drives utilisation only — the fees below are the total for this '
        + 'line, not per head. Enter 0 for a double-up on an already-deployed '
        + 'employee: no extra capacity, but the revenue is still recognised.'
      : '';
  }
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
  const fcType     = document.getElementById('forecast-type').value;
  const retainer   = document.getElementById('forecast-retainer').value;
  const placement  = document.getElementById('forecast-placement').value;
  const isSplit    = CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(fcType);
  const notes = document.getElementById('forecast-notes').value.trim();
  const editId = document.getElementById('forecast-edit-id').value;

  document.getElementById('forecast-error').style.display = 'none';

  if (!title) return showForecastError('Customer / Project name is required.');
  if (!start) return showForecastError('Start date is required.');
  if (!end)   return showForecastError('End date is required.');
  if (new Date(end) <= new Date(start)) return showForecastError('End date must be after start date.');
  // N-116 QA1: split-fee lines may forecast 0 headcount — a double-up on an
  // already-deployed employee, which adds revenue but no capacity.
  if (Number.isNaN(hc) || hc < 0) {
    return showForecastError('Headcount must be 0 or more.');
  }
  if (!isSplit && hc < 1) {
    return showForecastError('Headcount must be at least 1.');
  }

  const btn = document.getElementById('forecast-save-btn');
  const orig = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const payload = {
      Title: title,
      // N-116 QA1: isoDate() pins to T12:00:00Z. Without it SharePoint stores a
      // BST midnight as the previous day in UTC and 1 Sept reloads as 31 Aug —
      // which moves a whole split-fee lump sum into the wrong month. Every other
      // write path in Newton already does this; this form was the only omission.
      ForecastStartDate: isoDate(start),
      ForecastEndDate: isoDate(end),
      ForecastedHeadcount: hc,
      // N-116: a row is either monthly-rate OR split-fee, never both — the
      // unused side is written null so a type change leaves nothing stale
      // behind that would double-count in the revenue chart.
      ProjectType: fcType,
      ForecastMonthlyRevenuePerHead:
        isSplit || revPerHead === '' ? null : parseFloat(revPerHead),
      RetainerFee:  isSplit && retainer  !== '' ? parseFloat(retainer)  : null,
      PlacementFee: isSplit && placement !== '' ? parseFloat(placement) : null,
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
    toast('Error deleting forecast: ' + e.message, { type: 'error' });
  }
}
