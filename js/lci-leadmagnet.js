// js/lci-leadmagnet.js — LCI Lead Magnet (Sales module)
// Two parts: (1) shared Location Library table, (2) Insights Report Builder
// producing a single-page portrait "LCI Report Lite" PDF.
// Access: Admin + Leadership (gated in sales-router.js).
// Loaded by sales.html after lci-report.js.

let _lmLocations = null; // cache of LCILocations
let _lmSel = { current: '', scoped: [], disciplines: [], preparedFor: '', watchouts: '' };

// ── Pure calc ────────────────────────────────────────────────────────
// GBP cost of employment for a location/discipline, or null if no salary.
// cost = annualSalary × (1 + burden) × fxToGBP  (all normalised to GBP).
function _lmCostGBP(loc, disc) {
  const sal = Number(loc[disc.col]);
  if (!sal || sal <= 0) return null;
  const burden = Number(loc.EmployerBurdenPct) || 0;
  const fx = Number(loc.FXRateToGBP) || 0;
  if (!fx) return null;
  return sal * (1 + burden) * fx;
}

// Compare a current location against scoped locations across disciplines.
// disciplines = array of { key, label, col }.
// Returns { current, results:[{ location, overallPct, rows:[{key,label,currentGBP,scopedGBP,deltaPct}], missing:[label] }] }
function lciLeadMagnetCompute(currentLoc, scopedLocs, disciplines) {
  const results = (scopedLocs || []).map(s => {
    const rows = [];
    const missing = [];
    const cCosts = [];
    const sCosts = [];
    for (const d of disciplines) {
      const cg = _lmCostGBP(currentLoc, d);
      const sg = _lmCostGBP(s, d);
      if (cg == null || sg == null) { missing.push(d.label); continue; }
      rows.push({ key: d.key, label: d.label, currentGBP: cg, scopedGBP: sg,
                  deltaPct: ((sg - cg) / cg) * 100 });
      cCosts.push(cg); sCosts.push(sg);
    }
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const overallPct = cCosts.length ? ((avg(sCosts) - avg(cCosts)) / avg(cCosts)) * 100 : null;
    return { location: s.Title, overallPct, rows, missing };
  });
  return { current: currentLoc.Title, results };
}

if (typeof module !== 'undefined') module.exports = { lciLeadMagnetCompute, _lmCostGBP }; // node unit-check

// ── Formatting helpers ───────────────────────────────────────────────
function _lmGBP(v) {
  if (v == null || isNaN(v)) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v);
}
function _lmPct(v) {
  if (v == null || isNaN(v)) return '—';
  const s = v > 0 ? '+' : (v < 0 ? '−' : '');
  return `${s}${Math.abs(v).toFixed(1)}%`;
}
function _lmDeltaColour(v) { // lower cost than current = favourable (green)
  if (v == null || isNaN(v)) return '#888';
  return v < 0 ? '#2E7D32' : (v > 0 ? '#C62828' : '#555');
}

// ── Page entry ───────────────────────────────────────────────────────
async function renderLCILeadMagnetPage() {
  document.body.classList.remove('lci-summary-mode');
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';
  try {
    _lmLocations = await getLCILocations();
    _lmLocations.sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
    main.innerHTML = _lmLibraryHtml() + _lmBuilderHtml();
    _lmRenderPreview();
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error loading locations: ${e.message}</p>`;
  }
}

// ── Part 1: Location Library ─────────────────────────────────────────
function _lmLibraryHtml() {
  const D = CONFIG.LCI_DISCIPLINES;
  const head = D.map(d => `<th class="lm-scol">${d.label}</th>`).join('');
  const rows = _lmLocations.length
    ? _lmLocations.map(l => `
        <tr>
          <td><strong>${l.Title || '—'}</strong></td>
          <td>${l.EmployerBurdenPct != null ? (Math.round(l.EmployerBurdenPct * 1000) / 10) + '%' : '—'}</td>
          <td>${l.FXRateToGBP ?? '—'}</td>
          ${D.map(d => `<td class="lm-scol">${l[d.col] != null ? Number(l[d.col]).toLocaleString() : '—'}</td>`).join('')}
          <td>
            <div class="row-actions">
              <button class="btn-secondary" onclick="openLMLocation(${l.id})">Edit</button>
              <button class="btn-secondary lci-btn-muted" onclick="deleteLMLocation(${l.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="${D.length + 4}" style="color:#888;text-align:center">No locations yet.</td></tr>`;

  return `
    <div class="page-header">
      <h2>LCI Lead Magnet</h2>
      <button class="btn-primary" onclick="openLMLocation()">+ Add Location</button>
    </div>
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px">
      <h3 style="margin:0 0 12px;color:#1B3A5C">Location Library <span style="font-weight:400;font-size:13px;color:#888">(annual average salaries, local currency)</span></h3>
      <div class="lm-scroll">
        <table class="data-table lm-grid">
          <thead><tr><th>Location</th><th>Burden %</th><th>FX → GBP</th>${head}<th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    ${_lmLocationModal()}`;
}

function _lmLocationModal() {
  const D = CONFIG.LCI_DISCIPLINES;
  const salFields = D.map(d => `
    <div class="form-group" style="margin:0">
      <label style="font-size:12px">${d.label}</label>
      <input type="number" class="form-control" name="${d.col}" min="0" step="1000">
    </div>`).join('');
  return `
    <div id="lm-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:8px;padding:28px;width:640px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
        <h3 style="margin:0 0 16px;color:#1B3A5C" id="lm-modal-title">Add Location</h3>
        <form id="lm-form" onsubmit="saveLMLocation(event)">
          <div style="display:flex;gap:12px">
            <div class="form-group" style="flex:2"><label>Location (City, Country) *</label>
              <input type="text" class="form-control" name="Title" required placeholder="e.g. Bucharest, Romania"></div>
            <div class="form-group" style="flex:1"><label>Employer burden %</label>
              <input type="number" class="form-control" name="EmployerBurdenPct" min="0" step="0.5" placeholder="e.g. 32.5"></div>
            <div class="form-group" style="flex:1"><label>FX rate → GBP</label>
              <input type="number" class="form-control" name="FXRateToGBP" min="0" step="0.0001" placeholder="GBP per 1 local"></div>
          </div>
          <p style="font-size:12px;color:#888;margin:4px 0 12px">Average annual salary per discipline, in local currency. Leave blank where unknown.</p>
          <div class="lci-settings__grid">${salFields}</div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
            <button type="button" class="btn-secondary" onclick="closeLMLocation()">Cancel</button>
            <button type="submit" class="btn-primary" id="lm-save-btn">Save Location</button>
          </div>
        </form>
      </div>
    </div>`;
}

let _lmEditingId = null;
function openLMLocation(id = null) {
  _lmEditingId = id;
  const form = document.getElementById('lm-form');
  form.reset();
  document.getElementById('lm-modal-title').textContent = id ? 'Edit Location' : 'Add Location';
  if (id) {
    const l = (_lmLocations || []).find(x => String(x.id) === String(id));
    if (l) {
      form.elements['Title'].value = l.Title || '';
      form.elements['EmployerBurdenPct'].value = l.EmployerBurdenPct != null ? Math.round(l.EmployerBurdenPct * 1000) / 10 : '';
      form.elements['FXRateToGBP'].value = l.FXRateToGBP ?? '';
      CONFIG.LCI_DISCIPLINES.forEach(d => { if (form.elements[d.col]) form.elements[d.col].value = l[d.col] ?? ''; });
    }
  }
  document.getElementById('lm-modal').style.display = 'flex';
}
function closeLMLocation() {
  _lmEditingId = null;
  document.getElementById('lm-modal').style.display = 'none';
}

async function saveLMLocation(event) {
  event.preventDefault();
  const btn = document.getElementById('lm-save-btn');
  setButtonLoading(btn);
  try {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const fields = {
      Title: data.Title,
      EmployerBurdenPct: data.EmployerBurdenPct !== '' ? Number(data.EmployerBurdenPct) / 100 : null, // whole % → decimal
      FXRateToGBP: data.FXRateToGBP !== '' ? Number(data.FXRateToGBP) : null,
    };
    CONFIG.LCI_DISCIPLINES.forEach(d => {
      fields[d.col] = data[d.col] !== '' ? Number(data[d.col]) : null;
    });
    if (_lmEditingId) await updateLCILocation(_lmEditingId, fields);
    else await createLCILocation(fields);
    closeLMLocation();
    await renderLCILeadMagnetPage();
  } catch (e) {
    clearButtonLoading(btn);
    alert('Error saving location: ' + e.message);
  }
}

async function deleteLMLocation(id) {
  const l = (_lmLocations || []).find(x => String(x.id) === String(id));
  if (!confirm(`Delete "${l ? l.Title : 'this location'}" from the library?`)) return;
  try {
    await deleteLCILocation(id);
    await renderLCILeadMagnetPage();
  } catch (e) {
    alert('Error deleting location: ' + e.message);
  }
}

// ── Part 2: Insights Report Builder ──────────────────────────────────
function _lmBuilderHtml() {
  const locOpts = _lmLocations.map(l => `<option value="${l.id}">${l.Title}</option>`).join('');
  const scopedBoxes = _lmLocations.map(l =>
    `<label class="lm-chk"><input type="checkbox" class="lm-scoped" value="${l.id}" onchange="_lmSelChanged()"> ${l.Title}</label>`).join('');
  const discBoxes = CONFIG.LCI_DISCIPLINES.map(d =>
    `<label class="lm-chk"><input type="checkbox" class="lm-disc" value="${d.key}" onchange="_lmSelChanged()"> ${d.label}</label>`).join('');

  return `
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px;margin-top:16px">
      <h3 style="margin:0 0 12px;color:#1B3A5C">Insights Report Builder</h3>
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div class="form-group" style="min-width:220px">
          <label>Current location</label>
          <select class="form-control" id="lm-current" onchange="_lmSelChanged()">
            <option value="">— Select —</option>${locOpts}
          </select>
        </div>
        <div class="form-group" style="flex:1;min-width:220px">
          <label>Scoped locations</label>
          <div class="lm-chk-grid">${scopedBoxes || '<span style="color:#888">Add locations first.</span>'}</div>
        </div>
        <div class="form-group" style="flex:1;min-width:220px">
          <label>Disciplines</label>
          <div class="lm-chk-grid">${discBoxes}</div>
        </div>
      </div>
      <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:8px">
        <div class="form-group" style="flex:1;min-width:220px">
          <label>Prepared for (optional)</label>
          <input type="text" class="form-control" id="lm-prepared" placeholder="Prospect company name" oninput="_lmSel.preparedFor=this.value">
        </div>
        <div class="form-group" style="flex:2;min-width:280px">
          <label>Watchouts / comments</label>
          <textarea class="form-control" id="lm-watchouts" rows="2" placeholder="Any caveats to note on the report..." oninput="_lmSel.watchouts=this.value"></textarea>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button class="btn-primary" onclick="_lmPrint()">Generate PDF</button>
      </div>
    </div>
    <div id="lm-preview" style="margin-top:16px"></div>`;
}

function _lmSelChanged() {
  _lmSel.current = document.getElementById('lm-current').value;
  _lmSel.scoped = [...document.querySelectorAll('.lm-scoped:checked')].map(c => c.value);
  _lmSel.disciplines = [...document.querySelectorAll('.lm-disc:checked')].map(c => c.value);
  _lmRenderPreview();
}

function _lmResolve() {
  const byId = id => (_lmLocations || []).find(l => String(l.id) === String(id));
  const current = byId(_lmSel.current);
  const scoped = _lmSel.scoped.map(byId).filter(Boolean).filter(s => String(s.id) !== String(_lmSel.current));
  const disciplines = CONFIG.LCI_DISCIPLINES.filter(d => _lmSel.disciplines.includes(d.key));
  return { current, scoped, disciplines };
}

function _lmRenderPreview() {
  const host = document.getElementById('lm-preview');
  if (!host) return;
  const { current, scoped, disciplines } = _lmResolve();
  if (!current || !scoped.length || !disciplines.length) {
    host.innerHTML = `<div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px;color:#888">
      Select a current location, at least one scoped location, and at least one discipline to preview the report.</div>`;
    return;
  }
  host.innerHTML = _lmReportHtml(lciLeadMagnetCompute(current, scoped, disciplines), current);
}

// Shared report markup (preview + print).
function _lmReportHtml(computed, current) {
  const preparedFor = (_lmSel.preparedFor || '').trim();
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const disc = _lmResolve().disciplines;

  const locBlocks = computed.results.map(r => {
    const discRows = r.rows.map(row => `
      <tr>
        <td>${row.label}</td>
        <td>${_lmGBP(row.currentGBP)}</td>
        <td>${_lmGBP(row.scopedGBP)}</td>
        <td style="color:${_lmDeltaColour(row.deltaPct)};font-weight:600">${_lmPct(row.deltaPct)}</td>
      </tr>`).join('');
    return `
      <div class="lm-loc-block">
        <div class="lm-loc-head">
          <span class="lm-loc-name">${r.location}</span>
          <span class="lm-overall" style="color:${_lmDeltaColour(r.overallPct)}">${_lmPct(r.overallPct)} <span style="font-weight:400;color:#888;font-size:12px">overall vs current</span></span>
        </div>
        <table class="data-table lm-report-table">
          <thead><tr><th>Discipline</th><th>${current.Title}</th><th>${r.location}</th><th>Delta</th></tr></thead>
          <tbody>${discRows || `<tr><td colspan="4" style="color:#888">No comparable salary data.</td></tr>`}</tbody>
        </table>
        ${r.missing.length ? `<p class="lm-missing">No data for: ${r.missing.join(', ')} — excluded from this comparison.</p>` : ''}
      </div>`;
  }).join('');

  return `
    <div id="lm-report" class="lm-report">
      <div class="lm-report-band">
        <div>
          <div class="lm-report-title">Location &amp; Cost Intelligence — Report Lite</div>
          <div class="lm-report-sub">Current location: ${current.Title}${preparedFor ? ' · Prepared for ' + preparedFor : ''} · ${date}</div>
        </div>
        <img src="momentum-symbol-and-name-global-white.png" alt="Momentum Global" class="lm-report-logo">
      </div>
      <div class="lm-report-body">
        ${locBlocks}
        ${(_lmSel.watchouts || '').trim() ? `<div class="lm-watchouts"><h4>Watchouts</h4><p>${(_lmSel.watchouts).trim().replace(/</g,'&lt;')}</p></div>` : ''}
        <p class="lm-foot">All figures converted to GBP for comparison and include employer on-costs. Estimates for discussion only.</p>
      </div>
    </div>`;
}

function _lmPrint() {
  const { current, scoped, disciplines } = _lmResolve();
  if (!current || !scoped.length || !disciplines.length) {
    alert('Select a current location, at least one scoped location, and at least one discipline first.');
    return;
  }
  document.body.classList.add('lci-summary-mode'); // suppress the Confidential print banner
  printPage(`LCI Report Lite - ${current.Title}`, false, 'LCI'); // portrait
}
