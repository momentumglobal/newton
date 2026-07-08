// js/lci-summary.js — LCI editor milestones section + client summary / print view
// Step 7. Loaded after lci-sections.js. Shares _lciEd state.
// Milestones live in the LCIMilestones SP list (not LCIModelRows) and have
// their own diff-only save, keyed by ModelIDLookupId.

// ── Milestones editor section ────────────────────────────────────────

function _lciMilestonesHtml() {
  const m = _lciEd.model;
  const horizon = Number(m.HorizonMonths);
  const stones = (_lciEd.milestones || []).slice()
    .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));

  const monthOpts = sel => Array.from({ length: horizon }, (_, i) =>
    `<option value="${i + 1}"${Number(sel) === i + 1 ? ' selected' : ''}>M${i + 1}</option>`).join('');

  const rows = stones.length ? stones.map(s => {
    const idx = _lciEd.milestones.indexOf(s);
    return `
      <tr>
        <td><input type="text" class="lci-cell lci-cell--grow" value="${s.Title || ''}"
                   onchange="lciMilestoneChanged(${idx}, 'Title', this.value)"></td>
        <td><select class="lci-cell" onchange="lciMilestoneChanged(${idx}, 'StartMonth', this.value)">${monthOpts(s.StartMonth)}</select></td>
        <td><select class="lci-cell" onchange="lciMilestoneChanged(${idx}, 'EndMonth', this.value)">${monthOpts(s.EndMonth)}</select></td>
        <td><button class="btn-danger lci-row-del" onclick="removeLCIMilestone(${idx})">×</button></td>
      </tr>`;
  }).join('')
    : `<tr><td colspan="4" style="color:#888;text-align:center">No milestones yet.</td></tr>`;

  return `
    <div id="lci-milestones-section" style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px;margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;color:#1B3A5C">Project Milestones</h3>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" onclick="addLCIMilestone()">+ Add Milestone</button>
          <button class="btn-primary" id="lci-milestones-save" onclick="saveLCIMilestones()" disabled>Save Milestones</button>
        </div>
      </div>
      ${_lciMilestoneStripHtml()}
      <table class="data-table" style="max-width:640px">
        <thead><tr><th style="width:55%">Milestone</th><th>Start</th><th>End</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Marker strip: one bar per milestone across its month span.
function _lciMilestoneStripHtml() {
  const m = _lciEd.model;
  const horizon = Number(m.HorizonMonths);
  const labels = lciMonthLabels(m.StartMonth, horizon);
  const stones = (_lciEd.milestones || []).filter(s => s.Title && s.StartMonth);
  if (!stones.length) return '';

  const header = labels.map(l => `<div class="lci-ms-col">${l.split(' ')[0]}</div>`).join('');
  const rows = stones.map(s => {
    const start = Math.max(1, Number(s.StartMonth));
    const end = Math.min(horizon, Math.max(start, Number(s.EndMonth) || start));
    const cells = Array.from({ length: horizon }, (_, i) => {
      const on = i + 1 >= start && i + 1 <= end;
      return `<div class="lci-ms-col">${on ? '<div class="lci-ms-bar"></div>' : ''}</div>`;
    }).join('');
    return `
      <div class="lci-ms-row">
        <div class="lci-ms-label">${s.Title}</div>
        <div class="lci-ms-track">${cells}</div>
      </div>`;
  }).join('');

  return `
    <div class="lci-ms-strip">
      <div class="lci-ms-row">
        <div class="lci-ms-label"></div>
        <div class="lci-ms-track">${header}</div>
      </div>
      ${rows}
    </div>`;
}

function _lciMilestoneSnapshot(s) {
  return { Title: s.Title, StartMonth: s.StartMonth, EndMonth: s.EndMonth, SortOrder: s.SortOrder };
}

function lciMilestoneChanged(idx, field, value) {
  const s = _lciEd.milestones[idx];
  s[field] = field === 'Title' ? value : Number(value);
  if (field === 'StartMonth' && Number(s.EndMonth || 0) < s.StartMonth) s.EndMonth = s.StartMonth;
  _lciEd.dirtyMilestones = true;
  _lciMilestonesRefresh();
}

function addLCIMilestone() {
  const maxSort = Math.max(0, ...(_lciEd.milestones || []).map(s => s.SortOrder || 0));
  _lciEd.milestones.push({ Title: '', StartMonth: 1, EndMonth: 1, SortOrder: maxSort + 1 });
  _lciEd.dirtyMilestones = true;
  _lciMilestonesRefresh();
}

function removeLCIMilestone(idx) {
  const s = _lciEd.milestones[idx];
  if (s.Title && !confirm(`Remove milestone "${s.Title}"?`)) return;
  if (s.id) _lciEd.deletedMilestoneIds.push(s.id);
  _lciEd.milestones.splice(idx, 1);
  _lciEd.dirtyMilestones = true;
  _lciMilestonesRefresh();
}

function _lciMilestonesRefresh() {
  const el = document.getElementById('lci-milestones-section');
  if (el) el.outerHTML = _lciMilestonesHtml();
  const btn = document.getElementById('lci-milestones-save');
  if (btn) btn.disabled = !_lciEd.dirtyMilestones;
}

async function saveLCIMilestones() {
  const btn = document.getElementById('lci-milestones-save');
  setButtonLoading(btn);
  try {
    const modelId = _lciEd.model.id;
    for (const id of _lciEd.deletedMilestoneIds) await deleteLCIMilestone(id);
    _lciEd.deletedMilestoneIds = [];
    for (const s of _lciEd.milestones) {
      const snap = _lciMilestoneSnapshot(s);
      if (!s.id) {
        const created = await createLCIMilestone({ ...snap, ModelIDLookupId: Number(modelId) });
        s.id = created.id;
        _lciEd.origMilestones.set(String(s.id), JSON.stringify(snap));
      } else if (_lciEd.origMilestones.get(String(s.id)) !== JSON.stringify(snap)) {
        await updateLCIMilestone(s.id, snap);
        _lciEd.origMilestones.set(String(s.id), JSON.stringify(snap));
      }
    }
    _lciEd.dirtyMilestones = false;
    clearButtonLoading(btn);
    btn.disabled = true;
  } catch (e) {
    clearButtonLoading(btn);
    alert('Error saving milestones: ' + e.message);
  }
}

// ── Client summary / print view ──────────────────────────────────────

async function renderLCISummaryPage(modelId) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';
  try {
    const [model, rows, milestones] = await Promise.all([
      getLCIModelById(modelId), getLCIRows(modelId), getLCIMilestones(modelId),
    ]);
    rows.sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
    milestones.sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
    // Read-only view reuses _lciEd so the shared renderers work unchanged.
    _lciEd = {
      model, rows, milestones,
      deletedRowIds: [], deletedMilestoneIds: [],
      origRows: new Map(), origMilestones: new Map(),
      dirtySettings: false, dirtyRows: false, dirtyMilestones: false,
    };
    main.innerHTML = _lciSummaryHtml();
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error loading summary: ${e.message}</p>`;
  }
}

function _lciSummaryHtml() {
  const m = _lciEd.model;
  const horizon = Number(m.HorizonMonths);
  const labels = lciMonthLabels(m.StartMonth, horizon);
  const fxNote = m.LocalCurrency !== m.DisplayCurrency
    ? ` · FX ${m.LocalCurrency}→${m.DisplayCurrency}: ${m.FXRateLocalToDisplay}` : '';

  return `
    <div class="page-header lci-noprint">
      <h2>${m.Title} — Summary</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="openLCIModel(${m.id})">← Edit model</button>
        <button class="btn-primary" onclick="printPage('${(m.Title || 'LCI Model').replace(/'/g, '')}', true, 'Sales — LCI')">Print / PDF</button>
      </div>
    </div>

    <!-- Page 1: recruitment plan -->
    <div id="lci-print-p1" class="lci-summary-card">
      <div class="lci-summary-head">
        <h2 style="margin:0;color:#1B3A5C">${m.Title}</h2>
        <div style="color:#666;font-size:13px;margin-top:4px">
          ${m.ClientName || ''} · ${m.Location || ''} · ${labels[0]} – ${labels[horizon - 1]}
          · Values in ${m.DisplayCurrency}${fxNote}
        </div>
      </div>
      ${_lciMilestoneStripHtml()}
      ${_lciSummaryRoadmapHtml()}
    </div>

    <!-- Page 2: cost model -->
    <div id="lci-print-p2" class="lci-summary-card">
      ${_lciOutputInnerHtml()}
    </div>

    <!-- Page 3: assumptions -->
    <div id="lci-print-p3" class="lci-summary-card">
      <h3 style="margin:0 0 12px;color:#1B3A5C">Model Guide and Assumptions</h3>
      <div style="white-space:pre-wrap;font-size:13px;line-height:1.6">${m.Assumptions || 'No assumptions recorded.'}</div>
      <table class="data-table" style="max-width:480px;margin-top:16px">
        <tbody>
          <tr><td>Employer burden</td><td>${Math.round((m.EmployerBurdenPct || 0) * 1000) / 10}%</td></tr>
          <tr><td>Salary payments / year</td><td>${m.SalaryMonths || 12}</td></tr>
          <tr><td>Office cost / head / month</td><td>${m.OfficeCostPerHead ?? 0} ${m.LocalCurrency}</td></tr>
          <tr><td>EoR fee / head / month</td><td>${m.EoRFeePerHead ?? 0} ${m.DisplayCurrency}</td></tr>
          <tr><td>Travel / month</td><td>${m.TravelPerMonth ?? 0} ${m.LocalCurrency}</td></tr>
          ${m.LocalCurrency !== m.DisplayCurrency ? `<tr><td>FX rate (${m.LocalCurrency}→${m.DisplayCurrency})</td><td>${m.FXRateLocalToDisplay ?? '—'}</td></tr>` : ''}
        </tbody>
      </table>
    </div>`;
}

// Read-only roadmap: roles by team, hires per month, cumulative headcount.
function _lciSummaryRoadmapHtml() {
  const m = _lciEd.model;
  if (!lciSections(m).coe) return '';
  const horizon = Number(m.HorizonMonths);
  const labels = lciMonthLabels(m.StartMonth, horizon);
  const coeRows = _lciEd.rows.filter(r => r.RowType === 'coe');

  const monthHead = labels.map(l => `<th class="lci-mcol">${l.replace(' (', '<br>(')}</th>`).join('');
  const teams = [];
  for (const r of coeRows) {
    const t = r.Team || 'Other';
    if (!teams.includes(t)) teams.push(t);
  }

  const body = teams.map(team => {
    const teamRows = coeRows.filter(r => (r.Team || 'Other') === team).map(r => {
      const vals = lciMonthValues(r, horizon);
      const cells = vals.map(v => `<td class="lci-mcol">${v || ''}</td>`).join('');
      return `<tr><td class="lci-out-indent" style="padding-left:18px">${r.Title || ''}</td>${cells}<td class="lci-derived">${vals.reduce((a, b) => a + b, 0)}</td></tr>`;
    }).join('');
    return `<tr class="lci-team-row"><td colspan="${horizon + 2}"><strong>${team}</strong></td></tr>${teamRows}`;
  }).join('');

  const hires = lciHiresPerMonth(_lciEd.rows, m);
  let cum = 0;
  const hireCells = hires.map(h => `<td class="lci-mcol lci-derived">${h || ''}</td>`).join('');
  const cumCells = hires.map(h => { cum += h; return `<td class="lci-mcol lci-derived">${cum}</td>`; }).join('');

  return `
    <div class="lci-grid-scroll" style="margin-top:16px">
      <table class="data-table lci-grid">
        <thead><tr><th style="min-width:180px">Hiring Roadmap</th>${monthHead}<th>Hires</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr><td><strong>Hires per month</strong></td>${hireCells}<td class="lci-derived">${hires.reduce((a, b) => a + b, 0)}</td></tr>
          <tr><td><strong>Cumulative headcount</strong></td>${cumCells}<td></td></tr>
        </tfoot>
      </table>
    </div>`;
}
