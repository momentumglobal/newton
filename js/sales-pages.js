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
    main.innerHTML = pageErrorBlock({ message: e.message, retryOnClick: 'renderRevenueTrackingPage()' });
    if (window.lucide) lucide.createIcons();
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

let _forecastSort   = null; // N-247c: { key, dir } — null = default order
let _forecastSearch = '';   // N-247c: shared list search box (list-controls.js)

async function renderSalesForecastPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';

  try {
    const forecasts = await getSalesForecasts();
    // N-247c: pre-existing default order, kept as-is — sortRows layers the
    // user's column sort on top of it inside _renderForecastPage.
    forecasts.sort((a, b) => new Date(a.ForecastStartDate) - new Date(b.ForecastStartDate));
    main.innerHTML = _renderForecastPage(forecasts);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = pageErrorBlock({ message: e.message, retryOnClick: 'renderSalesForecastPage()' });
    if (window.lucide) lucide.createIcons();
  }
}

function _fmtForecastDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function _renderForecastPage(forecasts) {
  // N-247c: search + sort, applied after the caller's default order
  // (renderSalesForecastPage's forecasts.sort by start date, kept as-is).
  const filtered = filterRowsByText(forecasts, _forecastSearch, f => [f.Title, f.Notes]);
  const FORECAST_SORT_COLUMNS = {
    title:     { type: 'text',   get: f => f.Title },
    // N-247c: spDateIn via sortRows, not _fmtForecastDate's month/year-only
    // display — that's not a real day-level sort key.
    start:     { type: 'date',   get: f => f.ForecastStartDate },
    end:       { type: 'date',   get: f => f.ForecastEndDate },
    headcount: { type: 'number', get: f => f.ForecastedHeadcount },
  };
  const sorted = sortRows(filtered, _forecastSort, FORECAST_SORT_COLUMNS);
  const rows = sorted.length
    ? sorted.map(f => `
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
      <div class="table-toolbar">${listControlsBar([listSearchBox(_forecastSearch, 'setForecastSearch')])}</div>
      ${listResultCount(sorted.length, sorted.length, forecasts.length, null, 'forecast')}
      <table class="data-table">
        <thead>
          <tr>
            ${sortableHeader('Customer / Project', 'title', _forecastSort, 'setForecastSort')}
            ${sortableHeader('Start', 'start', _forecastSort, 'setForecastSort')}
            ${sortableHeader('End', 'end', _forecastSort, 'setForecastSort')}
            ${sortableHeader('Headcount', 'headcount', _forecastSort, 'setForecastSort')}
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${_forecastModal()}`;
}

// N-247c: re-renders through renderSalesForecastPage() — no separate
// fetch-vs-render split exists on this page today, so re-running the whole
// page is the floor here; not worth adding a cache for this ticket.
const _debouncedRenderSalesForecastPage = debounce(async () => { await renderSalesForecastPage(); focusListSearchBox(); }, 250);
function setForecastSearch(val) { _forecastSearch = val || ''; _debouncedRenderSalesForecastPage(); }
async function setForecastSort(key) { _forecastSort = nextSortState(_forecastSort, key); await renderSalesForecastPage(); focusSortHeader(key); }

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
      toast('Failed to load forecast: ' + e.message, { type: 'error' });
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

  const validationError = validateForecastForm({ title, start, end, hc, isSplit });
  if (validationError) return showForecastError(validationError);

  const btn = document.getElementById('forecast-save-btn');
  const orig = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const payload = buildForecastPayload({ title, start, end, hc, fcType, revPerHead, retainer, placement, notes, isSplit });
    if (editId) {
      await updateSalesForecast(parseInt(editId, 10), payload);
    } else {
      await createSalesForecast(payload);
    }
    closeForecastModal();
    await renderSalesForecastPage();
  } catch (e) {
    toast('Failed to save forecast: ' + e.message, { type: 'error' });
    btn.textContent = orig;
    btn.disabled = false;
  }
}

async function deleteForecastRecord(id) {
  if (!(await confirmModal({
    message: 'Delete this forecast? This cannot be undone.',
    confirmLabel: 'Delete', danger: true,
  }))) return;
  try {
    await deleteSalesForecast(id);
    await renderSalesForecastPage();
  } catch (e) {
    toast('Error deleting forecast: ' + e.message, { type: 'error' });
  }
}
