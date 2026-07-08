// js/lci-sections.js — LCI editor: legacy / one-offs / fees sections + live cost output
// Step 6. Loaded after lci-editor.js (shares _lciEd state and its save machinery).
// Kept separate from lci-editor.js per the file-size principle (pages.js truncation risk).

// ── Shared helpers ───────────────────────────────────────────────────

function _lciFmt(n, ccy) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0,
  }).format(n);
}

function _lciRowsOfType(type) {
  return _lciEd.rows.filter(r => r.RowType === type);
}

// Section wrapper with header, add + save buttons.
// All save buttons share the same diff-only saver (saveLCIRows); only
// changed rows are written, so saves are effectively per-section anyway.
function _lciSectionShell(id, title, subtitle, addFn, bodyHtml) {
  return `
    <div id="${id}" style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px;margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;color:#1B3A5C">${title} <span style="font-weight:400;font-size:13px;color:#888">${subtitle}</span></h3>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" onclick="${addFn}()">+ Add Row</button>
          <button class="btn-primary lci-rows-save" onclick="saveLCIRows()" disabled>Save Changes</button>
        </div>
      </div>
      ${bodyHtml}
    </div>`;
}

// ── Legacy team section ──────────────────────────────────────────────

function _lciLegacyHtml() {
  const m = _lciEd.model;
  if (!lciSections(m).legacy) return '';
  const horizon = Number(m.HorizonMonths);
  const rows = _lciRowsOfType('legacy');

  const exitOpts = sel => ['<option value="">— (runs to horizon)</option>']
    .concat(Array.from({ length: horizon }, (_, i) =>
      `<option value="${i + 1}"${Number(sel) === i + 1 ? ' selected' : ''}>M${i + 1}</option>`))
    .join('');

  const body = rows.length ? rows.map(r => {
    const gidx = _lciEd.rows.indexOf(r);
    const monthly = lciMonthlyCost(r, m) * (Number(r.Quantity) || 1);
    const noExit = !r.ExitMonth;
    return `
      <tr>
        <td><input type="text" class="lci-cell lci-cell--grow" value="${r.Title || ''}"
                   onchange="lciRowFieldChanged(${gidx}, 'Title', this.value)"></td>
        <td><input type="text" class="lci-cell lci-cell--grow" value="${r.Team || ''}"
                   onchange="lciRowFieldChanged(${gidx}, 'Team', this.value)"></td>
        <td><input type="number" class="lci-cell lci-cell--sm" min="1" value="${r.Quantity ?? 1}"
                   onchange="lciRowFieldChanged(${gidx}, 'Quantity', this.value)"></td>
        <td><input type="number" class="lci-cell lci-cell--grow" min="0" value="${r.AnnualSalary ?? ''}"
                   onchange="lciRowFieldChanged(${gidx}, 'AnnualSalary', this.value)"></td>
        <td><input type="number" class="lci-cell lci-cell--sm" min="0" max="100" step="1" value="${r.BonusPct != null ? Math.round(r.BonusPct * 100 * 100) / 100 : ''}"
                   onchange="lciRowFieldChanged(${gidx}, 'BonusPct', this.value)"></td>
        <td><select class="lci-cell" onchange="lciRowFieldChanged(${gidx}, 'ExitMonth', this.value)">${exitOpts(r.ExitMonth)}</select>
            ${noExit ? '<span class="lci-warn" title="No exit month — cost runs to horizon">⚠</span>' : ''}</td>
        <td class="lci-derived" id="lci-legacy-cost-${gidx}">${_lciFmt(monthly, m.DisplayCurrency)}</td>
        <td><button class="btn-danger lci-row-del" onclick="removeLCIRowAction(${gidx}, '_lciLegacyHtml', 'lci-legacy-section')">×</button></td>
      </tr>`;
  }).join('')
    : `<tr><td colspan="8" style="color:#888;text-align:center">No legacy roles yet.</td></tr>`;

  return _lciSectionShell('lci-legacy-section', 'Legacy Team',
    `(salaries in ${m.DisplayCurrency}; costs run M1 → exit month)`,
    'addLCILegacyRow', `
    <table class="data-table">
      <thead><tr>
        <th style="width:24%">Role</th><th style="width:24%">Team</th><th>Qty</th><th>Annual salary</th><th>Bonus %</th>
        <th>Exit month</th><th>Cost/mo</th><th></th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`);
}

function addLCILegacyRow() {
  _lciAddRow({ RowType: 'legacy', Title: '', Team: '', Quantity: 1, AnnualSalary: null, BonusPct: 0, ExitMonth: null, MonthValues: '[]' },
    '_lciLegacyHtml', 'lci-legacy-section');
}

// ── One-offs & fees (month-value grids) ──────────────────────────────

function _lciMonthGridHtml(sectionId, type, title, subtitle, addFn) {
  const m = _lciEd.model;
  const horizon = Number(m.HorizonMonths);
  const labels = lciMonthLabels(m.StartMonth, horizon);
  const rows = _lciRowsOfType(type);

  const monthHead = labels.map(l => `<th class="lci-mcol">${l.replace(' (', '<br>(')}</th>`).join('');

  const body = rows.length ? rows.map(r => {
    const gidx = _lciEd.rows.indexOf(r);
    const vals = lciMonthValues(r, horizon);
    const cells = vals.map((v, i) => `
      <td class="lci-mcol">
        <input type="number" class="lci-cell" min="0" value="${v || ''}"
               onchange="lciRowMonthChanged(${gidx}, ${i}, this.value)">
      </td>`).join('');
    return `
      <tr>
        <td><input type="text" class="lci-cell lci-cell--grow" value="${r.Title || ''}"
                   onchange="lciRowFieldChanged(${gidx}, 'Title', this.value)"></td>
        ${cells}
        <td class="lci-derived" id="lci-mtotal-${gidx}">${_lciFmt(vals.reduce((a, b) => a + b, 0), m.DisplayCurrency)}</td>
        <td><button class="btn-danger lci-row-del" onclick="removeLCIRowAction(${gidx}, '_lci${type === 'oneoff' ? 'Oneoffs' : 'Fees'}Html', '${sectionId}')">×</button></td>
      </tr>`;
  }).join('')
    : `<tr><td colspan="${horizon + 3}" style="color:#888;text-align:center">No rows yet.</td></tr>`;

  return _lciSectionShell(sectionId, title, subtitle, addFn, `
    <div class="lci-grid-scroll">
      <table class="data-table lci-grid lci-grid--amounts">
        <thead><tr><th style="min-width:130px">Item</th>${monthHead}<th>Total</th><th></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`);
}

function _lciOneoffsHtml() {
  if (!lciSections(_lciEd.model).oneoffs) return '';
  return _lciMonthGridHtml('lci-oneoffs-section', 'oneoff', 'Retention & Relocation',
    `(one-off amounts in ${_lciEd.model.DisplayCurrency}, entered in the month(s) they land)`, 'addLCIOneoffRow');
}
function _lciFeesHtml() {
  if (!lciSections(_lciEd.model).fees) return '';
  return _lciMonthGridHtml('lci-fees-section', 'fee', 'Project Fees',
    `(monthly amounts in ${_lciEd.model.DisplayCurrency} — e.g. Momentum Build Team, licences)`, 'addLCIFeeRow');
}

function addLCIOneoffRow() {
  _lciAddRow({ RowType: 'oneoff', Title: '', MonthValues: '[]' }, '_lciOneoffsHtml', 'lci-oneoffs-section');
}
function addLCIFeeRow() {
  _lciAddRow({ RowType: 'fee', Title: '', MonthValues: '[]' }, '_lciFeesHtml', 'lci-fees-section');
}

// ── Generic row mutation (shared with roadmap handlers) ──────────────

function _lciAddRow(row, renderFnName, sectionId) {
  const maxSort = Math.max(0, ..._lciEd.rows.map(r => r.SortOrder || 0));
  _lciEd.rows.push({ ...row, SortOrder: maxSort + 1 });
  lciMarkRowsDirtyAll();
  _lciReplaceSection(renderFnName, sectionId);
}

function removeLCIRowAction(gidx, renderFnName, sectionId) {
  const r = _lciEd.rows[gidx];
  if (!confirm(`Remove "${r.Title || 'this row'}"?`)) return;
  if (r.id) _lciEd.deletedRowIds.push(r.id);
  _lciEd.rows.splice(gidx, 1);
  lciMarkRowsDirtyAll();
  _lciReplaceSection(renderFnName, sectionId);
}

function lciRowFieldChanged(gidx, field, value) {
  const r = _lciEd.rows[gidx];
  const numeric = ['AnnualSalary', 'BonusPct', 'Quantity', 'ExitMonth'];
  if (field === 'BonusPct') {
    r[field] = value === '' ? null : Number(value) / 100; // UI is whole %, stored as decimal
  } else {
    r[field] = numeric.includes(field) ? (value === '' ? null : Number(value)) : value;
  }
  lciMarkRowsDirtyAll();
  if (field === 'ExitMonth') {
    // Re-render the section so the ⚠ marker and cost drop-off refresh
    _lciReplaceSection('_lciLegacyHtml', 'lci-legacy-section');
    return; // _lciReplaceSection already refreshes the output
  }
  if (r.RowType === 'legacy') {
    const el = document.getElementById(`lci-legacy-cost-${gidx}`);
    if (el) el.textContent = _lciFmt(lciMonthlyCost(r, _lciEd.model) * (Number(r.Quantity) || 1), _lciEd.model.DisplayCurrency);
  }
  lciRefreshOutput();
}

function lciRowMonthChanged(gidx, monthIdx, value) {
  const r = _lciEd.rows[gidx];
  const horizon = Number(_lciEd.model.HorizonMonths);
  const vals = lciMonthValues(r, horizon);
  vals[monthIdx] = Number(value) || 0;
  r.MonthValues = JSON.stringify(vals);
  lciMarkRowsDirtyAll();
  const el = document.getElementById(`lci-mtotal-${gidx}`);
  if (el) el.textContent = _lciFmt(vals.reduce((a, b) => a + b, 0), _lciEd.model.DisplayCurrency);
  lciRefreshOutput();
}

function _lciReplaceSection(renderFnName, sectionId) {
  const el = document.getElementById(sectionId);
  if (el) el.outerHTML = window[renderFnName]();
  _lciSyncSaveButtons();
  lciRefreshOutput();
}

// Enable/disable every rows-save button together (roadmap + sections).
function lciMarkRowsDirtyAll() {
  _lciEd.dirtyRows = true;
  _lciSyncSaveButtons();
}
function _lciSyncSaveButtons() {
  const disabled = !(_lciEd.dirtyRows || _lciEd.dirtyMilestones);
  document.querySelectorAll('.lci-rows-save, #lci-roadmap-save').forEach(b => { b.disabled = disabled; });
}

// Shared saver — same diff-only logic as the roadmap save.
async function saveLCIRows() {
  await saveLCIRoadmap(); // diff-only across ALL rows; then sync buttons
  _lciSyncSaveButtons();
  lciRefreshOutput();
}

// ── Live cost output ─────────────────────────────────────────────────

function _lciOutputHtml() {
  return `<div id="lci-output-section" style="margin-top:16px">${_lciOutputInnerHtml()}</div>`;
}

function lciRefreshOutput() {
  const el = document.getElementById('lci-output-section');
  if (el) el.innerHTML = _lciOutputInnerHtml();
}

function _lciOutputInnerHtml() {
  const m = _lciEd.model;
  const c = lciComputeModel(m, _lciEd.rows);
  const ccy = m.DisplayCurrency;
  const horizon = Number(m.HorizonMonths);
  const sections = lciSections(m);

  const td = arr => arr.map(v => `<td>${_lciFmt(v, ccy)}</td>`).join('');
  const tdInt = arr => arr.map(v => `<td>${v || ''}</td>`).join('');
  const monthHead = c.labels.map(l => `<th class="lci-mcol">${l.replace(' (', '<br>(')}</th>`).join('');

  const teamRows = Object.entries(c.coeByTeam).map(([team, arr]) =>
    `<tr class="lci-out-indent"><td>${team}</td>${td(arr)}</tr>`).join('');

  return `
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px">
      <h3 style="margin:0 0 12px;color:#1B3A5C">Cost Model <span style="font-weight:400;font-size:13px;color:#888">(all values in ${ccy})</span></h3>
      <div class="lci-grid-scroll">
        <table class="data-table lci-grid lci-output">
          <thead><tr><th style="min-width:220px"></th>${monthHead}</tr></thead>
          <tbody>
            ${sections.coe ? `
            ${teamRows}
            <tr class="lci-out-subtotal"><td>Total Employee Cost</td>${td(c.coeEmployeeCost)}</tr>
            <tr><td>CoE Headcount (on payroll)</td>${tdInt(c.coeHeadcount)}</tr>
            <tr class="lci-out-section lci-out-indent"><td>EoR Costs</td>${td(c.eor)}</tr>
            <tr class="lci-out-indent"><td>Office Costs</td>${td(c.office)}</tr>
            <tr class="lci-out-indent"><td>Travel Costs</td>${td(c.travel)}</tr>
            <tr class="lci-out-subtotal"><td>Total CoE Operating Costs</td>${td(c.coeOperating)}</tr>` : ''}
            ${sections.legacy || sections.oneoffs ? `
            ${sections.legacy ? `<tr class="lci-out-section"><td>Legacy Headcount</td>${tdInt(c.legacyHeadcount)}</tr>
            <tr class="lci-out-indent"><td>Legacy Team Costs</td>${td(c.legacyCost)}</tr>` : ''}
            ${sections.oneoffs ? `<tr class="lci-out-indent${sections.legacy ? '' : ' lci-out-section'}"><td>Retention & Relocation</td>${td(c.oneoffs)}</tr>` : ''}
            <tr class="lci-out-subtotal"><td>Total Legacy Costs</td>${td(c.legacyCost.map((v, i) => v + c.oneoffs[i]))}</tr>` : ''}
            ${sections.fees ? `${_lciRowsOfType('fee').map((r, i) =>
              `<tr class="lci-out-indent${i === 0 ? ' lci-out-section' : ''}"><td>${r.Title || 'Fee'}</td>${td(lciMonthValues(r, horizon))}</tr>`).join('')}
            <tr class="lci-out-subtotal"><td>Total Project Fees</td>${td(c.fees)}</tr>` : ''}
            <tr class="lci-out-total lci-out-heavy"><td>Total Monthly Spend</td>${td(c.totalMonthly)}</tr>
            <tr class="lci-out-total"><td>Cumulative Spend</td>${td(c.cumulativeSpend)}</tr>
          </tbody>
        </table>
      </div>
      ${_lciSpendChartSvg(c, ccy, horizon)}
    </div>`;
}

// Cumulative spend line chart — hand-built inline SVG
// (Revenue Tracking / Team Utilisation pattern — not Chart.js).
// Y grid: major lines every 500k (labelled, compact format), minor every 250k.
function _lciSpendChartSvg(c, ccy, horizon) {
  const W = 900, H = 240, padL = 70, padR = 20, padT = 16, padB = 28;
  const data = c.cumulativeSpend;
  const MAJOR = 500000, MINOR = 250000;
  const maxY = Math.max(Math.ceil(Math.max(...data, 1) / MAJOR) * MAJOR, MAJOR);
  const x = i => padL + (i / Math.max(horizon - 1, 1)) * (W - padL - padR);
  const y = v => padT + (1 - v / maxY) * (H - padT - padB);

  const fmtCompact = v => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: ccy || 'EUR', notation: 'compact', maximumFractionDigits: 1,
  }).format(v);

  const points = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dots = data.map((v, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" class="lci-chart-dot"><title>${c.labels[i]}: ${_lciFmt(v, ccy)}</title></circle>`).join('');
  const ticks = c.labels.map((l, i) =>
    (horizon <= 12 || i % 2 === 0) ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="10" fill="#888" text-anchor="middle">M${i + 1}</text>` : '').join('');

  let gridLines = '';
  for (let v = MINOR; v <= maxY; v += MINOR) {
    const gy = y(v);
    const isMajor = v % MAJOR === 0;
    gridLines += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" class="lci-chart-grid${isMajor ? '' : ' lci-chart-grid--minor'}"/>`;
    if (isMajor) gridLines += `<text x="${padL - 6}" y="${gy + 3}" font-size="10" fill="#999" text-anchor="end">${fmtCompact(v)}</text>`;
  }

  return `
    <div style="margin-top:16px">
      <h4 style="margin:0 0 8px;color:#1B3A5C;font-size:14px">Cumulative Spend</h4>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">
        ${gridLines}
        <polyline points="${points}" class="lci-chart-line" fill="none"/>
        ${dots}
        ${ticks}
      </svg>
    </div>`;
}
