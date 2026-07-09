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

// ── Compare view (step 8) ────────────────────────────────────────────

async function renderLCIComparePage(idA, idB) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';
  try {
    const [modelA, rowsA, modelB, rowsB] = await Promise.all([
      getLCIModelById(idA), getLCIRows(idA),
      getLCIModelById(idB), getLCIRows(idB),
    ]);
    if (!lciModelsComparable(modelA, modelB)) {
      main.innerHTML = '<p style="color:red">Models must share the same display currency.</p>';
      return;
    }
    const cmp = lciCompareModels(modelA, rowsA, modelB, rowsB);
    main.innerHTML = _lciCompareHtml(cmp);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error loading comparison: ${e.message}</p>`;
  }
}

function _lciCompareHtml(cmp) {
  const ccy = cmp.currency;
  const money = v => _lciFmt(v, ccy);
  const month = v => v ? `M${v}` : '—';
  const plain = v => v ?? '—';
  const delta = (a, b, fmt, goodWhenLower = true) => {
    const d = b - a;
    if (!isFinite(d) || d === 0) return '<span style="color:#888">—</span>';
    const good = goodWhenLower ? d < 0 : d > 0;
    return `<span style="color:${good ? '#2E7D32' : '#C62828'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`;
  };

  const K = [
    ['Total spend (horizon)',      k => money(k.totalSpend),        (a, b) => delta(a.totalSpend, b.totalSpend, money)],
    ['Steady-state monthly cost',  k => money(k.steadyMonthly),     (a, b) => delta(a.steadyMonthly, b.steadyMonthly, money)],
    ['Steady-state annual cost',   k => money(k.steadyAnnual),      (a, b) => delta(a.steadyAnnual, b.steadyAnnual, money)],
    ['Cost per head (steady)',     k => money(k.costPerHead),       (a, b) => delta(a.costPerHead, b.costPerHead, money)],
    ['Total hires',                k => plain(k.totalHires),        (a, b) => delta(a.totalHires, b.totalHires, v => v, false)],
    ['Time to full ramp',          k => month(k.lastHireMonth),     (a, b) => delta(a.lastHireMonth, b.lastHireMonth, v => `${v}mo`)],
    ['Peak crossover month',       k => month(k.peakCrossoverMonth), () => ''],
    ['Peak crossover spend',       k => money(k.peakCrossoverSpend), (a, b) => delta(a.peakCrossoverSpend, b.peakCrossoverSpend, money)],
  ];

  const kpiRows = K.map(([label, fmt, dl]) => `
    <tr>
      <td>${label}</td>
      <td>${fmt(cmp.a.kpis)}</td>
      <td>${fmt(cmp.b.kpis)}</td>
      <td>${dl(cmp.a.kpis, cmp.b.kpis)}</td>
    </tr>`).join('');

  return `
    <div class="page-header">
      <h2>Compare Models <span style="font-weight:400;color:#888;font-size:15px">(${ccy})</span></h2>
      <button class="btn-secondary" onclick="renderLCIModelsPage()">← Back to models</button>
    </div>
    <div class="lci-summary-card">
      <table class="data-table lci-compare">
        <thead>
          <tr><th style="width:32%"></th><th>${cmp.a.name}</th><th>${cmp.b.name}</th><th>Δ (B − A)</th></tr>
        </thead>
        <tbody>${kpiRows}</tbody>
      </table>
      <p style="font-size:12px;color:#888;margin:8px 0 0">Δ green = ${cmp.b.name} favourable, red = unfavourable (cost down / hires up = good).</p>
    </div>
    <div class="lci-summary-card">
      ${_lciCompareChartSvg(cmp)}
    </div>`;
}

// Two-line cumulative spend chart: A solid navy, B dashed orange
// (mirrors the Revenue Tracking forecast-fork styling).
function _lciCompareChartSvg(cmp) {
  const ccy = cmp.currency;
  const horizon = Math.max(cmp.a.cumulativeSpend.length, cmp.b.cumulativeSpend.length);
  const labels = cmp.a.cumulativeSpend.length >= cmp.b.cumulativeSpend.length ? cmp.a.labels : cmp.b.labels;
  const W = 900, H = 260, padL = 70, padR = 20, padT = 16, padB = 50;
  const MAJOR = 500000, MINOR = 250000;
  const maxData = Math.max(...cmp.a.cumulativeSpend, ...cmp.b.cumulativeSpend, 1);
  const maxY = Math.max(Math.ceil(maxData / MAJOR) * MAJOR, MAJOR);
  const x = i => padL + (i / Math.max(horizon - 1, 1)) * (W - padL - padR);
  const y = v => padT + (1 - v / maxY) * (H - padT - padB);

  const fmtCompact = v => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: ccy || 'EUR', notation: 'compact', maximumFractionDigits: 1,
  }).format(v);

  let gridLines = '';
  for (let v = MINOR; v <= maxY; v += MINOR) {
    const gy = y(v);
    const isMajor = v % MAJOR === 0;
    gridLines += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" class="lci-chart-grid${isMajor ? '' : ' lci-chart-grid--minor'}"/>`;
    if (isMajor) gridLines += `<text x="${padL - 6}" y="${gy + 3}" font-size="10" fill="#999" text-anchor="end">${fmtCompact(v)}</text>`;
  }

  const line = (data, cls) => {
    const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const dots = data.map((v, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" class="${cls}-dot"><title>${labels[i]}: ${_lciFmt(v, ccy)}</title></circle>`).join('');
    return `<polyline points="${pts}" class="${cls}" fill="none"/>${dots}`;
  };

  const ticks = labels.map((l, i) => {
    if (!(horizon <= 12 || i % 2 === 0)) return '';
    const sub = (l.match(/\((.+)\)/) || [])[1] || '';
    return `<text x="${x(i).toFixed(1)}" y="${H - 30}" font-size="10" fill="#888" text-anchor="middle">M${i + 1}</text>
            <text x="${x(i).toFixed(1)}" y="${H - 18}" font-size="8" fill="#aaa" text-anchor="middle">(${sub})</text>`;
  }).join('');

  const legend = `
    <g font-size="10">
      <line x1="${padL}" y1="${H - 5}" x2="${padL + 24}" y2="${H - 5}" class="lci-chart-line"/>
      <text x="${padL + 30}" y="${H - 2}" fill="#555">${cmp.a.name}</text>
      <line x1="${padL + 200}" y1="${H - 5}" x2="${padL + 224}" y2="${H - 5}" class="lci-chart-line--b"/>
      <text x="${padL + 230}" y="${H - 2}" fill="#555">${cmp.b.name}</text>
    </g>`;

  return `
    <h3 style="margin:0 0 12px;color:#1B3A5C">Cumulative Spend <span style="font-weight:400;font-size:13px;color:#888">(${ccy})</span></h3>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">
      ${gridLines}
      ${line(cmp.a.cumulativeSpend, 'lci-chart-line')}
      ${line(cmp.b.cumulativeSpend, 'lci-chart-line--b')}
      ${ticks}
      ${legend}
    </svg>`;
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
