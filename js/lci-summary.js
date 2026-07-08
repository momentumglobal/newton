// js/lci-summary.js — LCI milestones (integrated into the roadmap grid) +
// client summary / print view.
// Step 7 (revised: milestones render as rows INSIDE the Hiring Roadmap table,
// perfectly aligned with the month columns — no standalone section).
// Loaded after lci-sections.js. Shares _lciEd state.

// ── Milestone rows for the roadmap table (editor) ────────────────────
// Columns must mirror the roadmap row layout:
// Role | Level | Salary | Bonus % (colspan 3 for the span selects) | months… | Hires | Cost | del

function _lciRoadmapMilestoneRows(horizon) {
  const stones = (_lciEd.milestones || []).slice()
    .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
  if (!stones.length) return '';

  const monthOpts = sel => Array.from({ length: horizon }, (_, i) =>
    `<option value="${i + 1}"${Number(sel) === i + 1 ? ' selected' : ''}>M${i + 1}</option>`).join('');

  const rows = stones.map(s => {
    const idx = _lciEd.milestones.indexOf(s);
    const start = Math.max(1, Number(s.StartMonth) || 1);
    const end = Math.min(horizon, Math.max(start, Number(s.EndMonth) || start));
    const cells = Array.from({ length: horizon }, (_, i) =>
      `<td class="lci-mcol">${i + 1 >= start && i + 1 <= end ? '<div class="lci-ms-bar"></div>' : ''}</td>`).join('');
    return `
      <tr>
        <td><input type="text" class="lci-cell lci-cell--grow" value="${s.Title || ''}"
                   onchange="lciMilestoneChanged(${idx}, 'Title', this.value)"></td>
        <td colspan="3">
          <div style="display:flex;gap:4px;align-items:center;font-size:12px">
            <select class="lci-cell" onchange="lciMilestoneChanged(${idx}, 'StartMonth', this.value)">${monthOpts(start)}</select>
            –
            <select class="lci-cell" onchange="lciMilestoneChanged(${idx}, 'EndMonth', this.value)">${monthOpts(end)}</select>
          </div>
        </td>
        ${cells}
        <td></td><td></td>
        <td><button class="btn-danger lci-row-del" onclick="removeLCIMilestone(${idx})">×</button></td>
      </tr>`;
  }).join('');

  return `
    <tr class="lci-team-row"><td colspan="${horizon + 6}"><strong>Project Milestones</strong></td></tr>
    ${rows}`;
}

// Read-only milestone rows for the summary roadmap table:
// Label | months… | (Hires col blank)
function _lciSummaryMilestoneRows(horizon) {
  const stones = (_lciEd.milestones || []).filter(s => s.Title && s.StartMonth)
    .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
  if (!stones.length) return '';

  const rows = stones.map(s => {
    const start = Math.max(1, Number(s.StartMonth));
    const end = Math.min(horizon, Math.max(start, Number(s.EndMonth) || start));
    const cells = Array.from({ length: horizon }, (_, i) =>
      `<td class="lci-mcol">${i + 1 >= start && i + 1 <= end ? '<div class="lci-ms-bar"></div>' : ''}</td>`).join('');
    return `<tr><td class="lci-out-indent" style="padding-left:18px">${s.Title}</td>${cells}<td></td></tr>`;
  }).join('');

  return `
    <tr class="lci-team-row"><td colspan="${horizon + 2}"><strong>Project Milestones</strong></td></tr>
    ${rows}`;
}

// ── Milestone mutation handlers ──────────────────────────────────────

function _lciMilestoneSnapshot(s) {
  return { Title: s.Title, StartMonth: s.StartMonth, EndMonth: s.EndMonth, SortOrder: s.SortOrder };
}

function lciMilestoneChanged(idx, field, value) {
  const s = _lciEd.milestones[idx];
  s[field] = field === 'Title' ? value : Number(value);
  if (field === 'StartMonth' && Number(s.EndMonth || 0) < s.StartMonth) s.EndMonth = s.StartMonth;
  _lciEd.dirtyMilestones = true;
  _lciRerenderRoadmap();
}

function addLCIMilestone() {
  const maxSort = Math.max(0, ...(_lciEd.milestones || []).map(s => s.SortOrder || 0));
  _lciEd.milestones.push({ Title: '', StartMonth: 1, EndMonth: 1, SortOrder: maxSort + 1 });
  _lciEd.dirtyMilestones = true;
  _lciRerenderRoadmap();
}

function removeLCIMilestone(idx) {
  const s = _lciEd.milestones[idx];
  if (s.Title && !confirm(`Remove milestone "${s.Title}"?`)) return;
  if (s.id) _lciEd.deletedMilestoneIds.push(s.id);
  _lciEd.milestones.splice(idx, 1);
  _lciEd.dirtyMilestones = true;
  _lciRerenderRoadmap();
}

// Diff-only milestone save loop — called from saveLCIRoadmap (one Save
// button covers rows + milestones).
async function _lciSaveMilestonesData() {
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
    // Suppress the global 'Confidential — Internal' print banner for the
    // client-facing summary (body class read by @media print CSS).
    document.body.classList.add('lci-summary-mode');
    main.innerHTML = _lciSummaryHtml();
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error loading summary: ${e.message}</p>`;
  }
}

function _lciSummaryHtml() {
  const m = _lciEd.model;
  const horizon = Number(m.HorizonMonths);
  const exportDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const c = lciComputeModel(m, _lciEd.rows);

  return `
    <div class="page-header lci-noprint">
      <h2>${m.Title} — Summary</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="openLCIModel(${m.id})">← Edit model</button>
        <button class="btn-primary" onclick="printPage('${(m.Title || 'LCI Model').replace(/'/g, '')}', true, 'LCI')">Print / PDF</button>
      </div>
    </div>

    <!-- Section 1: recruitment plan (milestones integrated) -->
    <div id="lci-print-p1" class="lci-summary-card">
      <div class="lci-summary-head">
        <h2 style="margin:0;color:#1B3A5C">${m.Title}</h2>
        <div style="color:#666;font-size:13px;margin-top:4px">
          ${m.ClientName || 'Client'} x Momentum Global — ${exportDate}
        </div>
      </div>
      ${_lciSummaryRoadmapHtml()}
    </div>

    <!-- Section 2: cost model (plain — the card provides the tile) -->
    <div id="lci-print-p2" class="lci-summary-card">
      ${_lciOutputInnerHtml(false, true)}
    </div>

    <!-- Section 3: cumulative spend chart -->
    <div id="lci-print-p3" class="lci-summary-card">
      ${_lciSpendChartSvg(c, m.DisplayCurrency, horizon)}
    </div>

    <!-- Section 4: assumptions -->
    <div id="lci-print-p4" class="lci-summary-card">
      <h3 style="margin:0 0 12px;color:#1B3A5C">Model Guide and Assumptions</h3>
      ${m.Assumptions ? `<div style="white-space:pre-wrap;font-size:13px;line-height:1.6">${m.Assumptions}</div>` : ''}
      <table class="data-table lci-assump" style="max-width:640px;margin-top:16px">
        <tbody>
          <tr><td>Employer burden</td><td>${Math.round((m.EmployerBurdenPct || 0) * 1000) / 10}%</td></tr>
          <tr><td>Salary payments / year</td><td>${m.SalaryMonths || 12}</td></tr>
          <tr><td>Notice period (months)</td><td>${m.NoticeMonths ?? 0}</td></tr>
          <tr><td>Office cost / head / month</td><td>${m.OfficeCostPerHead ?? 0} ${m.LocalCurrency}</td></tr>
          <tr><td>EoR fee / head / month</td><td>${m.EoRFeePerHead ?? 0} ${m.DisplayCurrency}</td></tr>
          <tr><td>Travel / month</td><td>${m.TravelPerMonth ?? 0} ${m.DisplayCurrency}</td></tr>
          ${m.LocalCurrency !== m.DisplayCurrency ? `<tr><td>FX rate (${m.LocalCurrency}→${m.DisplayCurrency})</td><td>${m.FXRateLocalToDisplay ?? '—'}</td></tr>` : ''}
        </tbody>
      </table>
      <p style="font-size:12px;color:#888;margin-top:12px">
        A hire in month N reaches payroll in month N + notice period. Costs shown from the payroll month onward.
      </p>
    </div>`;
}

// Read-only roadmap: milestones + roles by team, hires per month, cumulative hires.
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
        <tbody>
          ${_lciSummaryMilestoneRows(horizon)}
          ${body}
        </tbody>
        <tfoot>
          <tr><td><strong>Hires per month</strong></td>${hireCells}<td class="lci-derived">${hires.reduce((a, b) => a + b, 0)}</td></tr>
          <tr><td><strong>Cumulative hires</strong></td>${cumCells}<td></td></tr>
        </tfoot>
      </table>
    </div>`;
}
