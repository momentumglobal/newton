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
        <td><input type="text" class="lci-cell lci-cell--grow" value="${escHtml(s.Title)}"
                   onchange="lciMilestoneChanged(${idx}, 'Title', this.value)"></td>
        <td colspan="4">
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
    <tr class="lci-team-row"><td colspan="${horizon + 7}"><strong>Project Milestones</strong></td></tr>
    ${rows}`;
}

// Read-only milestone rows for the summary roadmap table:
// Label | months… | (Hires col blank)
// `slice` (N-022) is optional; absent = the full horizon, exactly as before.
// A milestone spanning a slice boundary draws a clipped bar in both slices —
// start/end are still tested against absolute month numbers.
function _lciSummaryMilestoneRows(horizon, slice) {
  const stones = (_lciEd.milestones || []).filter(s => s.Title && s.StartMonth)
    .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
  if (!stones.length) return '';

  const sl = slice || { start: 0, end: horizon };
  const span = sl.end - sl.start;

  const rows = stones.map(s => {
    const start = Math.max(1, Number(s.StartMonth));
    const end = Math.min(horizon, Math.max(start, Number(s.EndMonth) || start));
    const cells = Array.from({ length: span }, (_, i) => {
      const mn = sl.start + i + 1;
      return `<td class="lci-mcol">${mn >= start && mn <= end ? '<div class="lci-ms-bar"></div>' : ''}</td>`;
    }).join('');
    return `<tr><td class="lci-out-indent" style="padding-left:18px">${escHtml(s.Title)}</td>${cells}<td></td></tr>`;
  }).join('');

  return `
    <tr class="lci-team-row"><td colspan="${span + 2}"><strong>Project Milestones</strong></td></tr>
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

// Print the summary. Reads the title from state rather than taking it through
// an onclick attribute, so no escaping question arises. The title becomes the
// document title / default PDF filename — it is never parsed as markup, so it
// must be passed raw (escaping it would put &amp; in the filename).
function lciPrintSummary() {
  printPage(_lciEd?.model?.Title || 'LCI Model', true, 'LCI');
}

function _lciSummaryHtml() {
  const m = _lciEd.model;
  const horizon = Number(m.HorizonMonths);
  const exportDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const c = lciComputeModel(m, _lciEd.rows);

  return `
    <div class="page-header lci-noprint">
      <h2>${escHtml(m.Title)} — Summary</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="openLCIModel(${m.id})">← Edit model</button>
        <button class="btn-primary" onclick="lciPrintSummary()">Print / PDF</button>
      </div>
    </div>

    <!-- Section 1: recruitment plan (milestones integrated) -->
    <div id="lci-print-p1" class="lci-summary-card">
      <div class="lci-summary-head">
        <h2 style="margin:0;color:#1B3A5C">${escHtml(m.Title)}</h2>
        <div style="color:#666;font-size:13px;margin-top:4px">
          ${escHtml(m.ClientName || 'Client')} x Momentum Global — ${exportDate}
        </div>
      </div>
      ${_lciRoadmapBlocksHtml()}
    </div>

    <!-- Section 2: cost model (plain — the card provides the tile) -->
    <div id="lci-print-p2" class="lci-summary-card">
      ${_lciCostModelBlocksHtml(false, true)}
    </div>

    <!-- Section 3: cumulative spend chart -->
    <div id="lci-print-p3" class="lci-summary-card">
      ${_lciSpendChartSvg(c, m.DisplayCurrency, horizon)}
    </div>

    <!-- Section 4: assumptions -->
    <div id="lci-print-p4" class="lci-summary-card">
      ${_lciAssumptionsHtml(m)}
    </div>`;
}

// Shared by the summary view and the full report export (lci-report.js)
function _lciAssumptionsHtml(m) {
  return `
      <h3 style="margin:0 0 12px;color:#1B3A5C">Model Guide and Assumptions</h3>
      ${m.Assumptions ? `<div style="white-space:pre-wrap;font-size:13px;line-height:1.6">${escHtml(m.Assumptions)}</div>` : ''}
      <table class="data-table lci-assump" style="max-width:640px;margin-top:16px">
        <tbody>
          <tr><td>Employer burden</td><td>${Math.round((m.EmployerBurdenPct || 0) * 1000) / 10}%</td></tr>
          <tr><td>Salary payments / year</td><td>${m.SalaryMonths || 12}</td></tr>
          <tr><td>Notice period (months)</td><td>${m.NoticeMonths ?? 0}</td></tr>
          <tr><td>Office cost / head / month</td><td>${m.OfficeCostPerHead ?? 0} ${m.LocalCurrency}</td></tr>
          <tr><td>EoR fee / head / month</td><td>${m.EoRFeePerHead ?? 0} ${m.DisplayCurrency}</td></tr>
          ${m.LocalCurrency !== m.DisplayCurrency ? `<tr><td>FX rate (${m.LocalCurrency}→${m.DisplayCurrency})</td><td>${m.FXRateLocalToDisplay ?? '—'}</td></tr>` : ''}
        </tbody>
      </table>
      <p style="font-size:12px;color:#888;margin-top:12px">
        A hire in month N reaches payroll in month N + notice period. Costs shown from the payroll month onward.
      </p>`;
}

// ── Compare view (step 8) ────────────────────────────────────────────

// Accepts an array of model ids (2+). All must share a display currency
// (the list-page button enforces this before we get here).
async function renderLCIComparePage(ids) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';
  try {
    const bundles = await Promise.all(ids.map(async id => {
      const [model, rows] = await Promise.all([getLCIModelById(id), getLCIRows(id)]);
      return { model, rows };
    }));
    const ccy = bundles[0].model.DisplayCurrency;
    if (!ccy || !bundles.every(b => b.model.DisplayCurrency === ccy)) {
      main.innerHTML = '<p style="color:red">Models must share the same display currency.</p>';
      return;
    }
    const entries = bundles.map(b => ({
      name: b.model.Title,
      kpis: lciComputeKPIs(b.model, b.rows),
      comp: lciComputeModel(b.model, b.rows),
    }));
    main.innerHTML = `
      <div class="page-header">
        <h2>Compare Models <span style="font-weight:400;color:#888;font-size:15px">(${ccy})</span></h2>
        <button class="btn-secondary" onclick="renderLCIModelsPage()">← Back to models</button>
      </div>
      <div class="lci-summary-card">
        ${_lciCompareTableHtml(entries, ccy)}
      </div>
      <div class="lci-summary-card">
        ${_lciReportCompareChartSvg(entries, ccy)}
      </div>`;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error loading comparison: ${e.message}</p>`;
  }
}

// Print-only year splitting (N-022). Screen keeps one full-horizon table;
// print gets one table per 12-month slice, each on its own page. Both copies
// live in the DOM and CSS chooses — there is no reliable render-time signal
// for "is printing", and the user can change paper size in the print dialog.
// A model of 12 months or less has one slice, so this returns the bare table
// with no wrapper divs — that output is byte-identical to pre-N-022.
function _lciRoadmapBlocksHtml() {
  const m = _lciEd.model;
  if (!lciSections(m).coe) return '';
  const slices = lciYearSlices(Number(m.HorizonMonths));
  if (slices.length === 1) return _lciSummaryRoadmapHtml();
  return `<div class="lci-screenonly">${_lciSummaryRoadmapHtml()}</div>` +
    slices.map(s => `<div class="lci-printonly">${_lciSummaryRoadmapHtml(s)}</div>`).join('');
}

// Read-only roadmap: milestones + roles by team, hires per month, cumulative hires.
// `slice` (N-022) is optional; absent = the full horizon, exactly as before.
// Every series is still computed over the FULL horizon and only cut at render
// time, so no figure changes — cumulative hires in Year 2 correctly continues
// from the Year 1 closing count rather than restarting at zero.
function _lciSummaryRoadmapHtml(slice) {
  const m = _lciEd.model;
  if (!lciSections(m).coe) return '';
  const horizon = Number(m.HorizonMonths);
  const sl = slice || { start: 0, end: horizon, label: null };
  const cut = arr => arr.slice(sl.start, sl.end);
  const labels = cut(lciMonthLabels(m.StartMonth, horizon));
  const coeRows = _lciEd.rows.filter(r => r.RowType === 'coe');

  const monthHead = labels.map(l => `<th class="lci-mcol">${l.replace(' (', '<br>(')}</th>`).join('');
  const teams = [];
  for (const r of coeRows) {
    const t = r.Team || 'Other';
    if (!teams.includes(t)) teams.push(t);
  }

  const body = teams.map(team => {
    const teamRows = coeRows.filter(r => (r.Team || 'Other') === team).map(r => {
      const vals = cut(lciMonthValues(r, horizon));
      const cells = vals.map(v => `<td class="lci-mcol">${v || ''}</td>`).join('');
      // Level shown in brackets after the title. Trimmed so a whitespace-only
      // CareerLevel renders no empty "( )"; handles '' (new rows) and null
      // (older SharePoint rows) alike.
      const lvl = String(r.CareerLevel || '').trim();
      return `<tr><td class="lci-out-indent" style="padding-left:18px">${escHtml(r.Title)}${lvl ? ` (${escHtml(lvl)})` : ''}</td>${cells}<td class="lci-derived">${vals.reduce((a, b) => a + b, 0)}</td></tr>`;
    }).join('');
    return `<tr class="lci-team-row"><td colspan="${(sl.end - sl.start) + 2}"><strong>${team}</strong></td></tr>${teamRows}`;
  }).join('');

  const hires = lciHiresPerMonth(_lciEd.rows, m);
  // Cumulative runs over the full horizon before cutting, so Year 2 opens at
  // the Year 1 closing total instead of restarting.
  let running = 0;
  const cumAll = hires.map(h => (running += h));
  const sliceHires = cut(hires);
  const hireCells = sliceHires.map(h => `<td class="lci-mcol lci-derived">${h || ''}</td>`).join('');
  const cumCells = cut(cumAll).map(v => `<td class="lci-mcol lci-derived">${v}</td>`).join('');

  return `
    <div class="lci-grid-scroll" style="margin-top:16px">
      <table class="data-table lci-grid lci-grid--roadmap">
        <thead><tr><th style="min-width:180px">Hiring Roadmap${sl.label ? ` — ${sl.label}` : ''}</th>${monthHead}<th>Hires</th></tr></thead>
        <tbody>
          ${_lciSummaryMilestoneRows(horizon, sl)}
          ${body}
        </tbody>
        <tfoot>
          <tr><td><strong>Hires per month</strong></td>${hireCells}<td class="lci-derived">${sliceHires.reduce((a, b) => a + b, 0)}</td></tr>
          <tr><td><strong>Cumulative hires</strong></td>${cumCells}<td></td></tr>
        </tfoot>
      </table>
    </div>`;
}
