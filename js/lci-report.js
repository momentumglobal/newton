// js/lci-report.js — Full LCI report export (step 9)
// Assembles multiple models + comparison into one print document:
// navy cover page → per model: navy divider + plan / cost model / chart /
// assumptions pages → comparison section (when 2+ models share a display
// currency). Selection reuses the compare checkboxes on the model list.
// Loaded after lci-summary.js. Reuses _lciEd-based renderers by setting
// _lciEd per model while building the HTML.

const LCI_REPORT_COLOURS = ['var(--c-navy-steel)', 'var(--c-accent)', 'var(--c-teal-chart)', 'var(--c-purple-chart)', 'var(--c-pink-chart)'];

// Currently-open report: {id, title, ids}. id null = unsaved (new export).
let _lciReport = { id: null, title: '', ids: [] };

// The models behind the report currently on screen, kept so the PowerPoint
// export (lci-pptx.js) can build from the same data the page rendered rather
// than re-fetching it — the same pattern lci-excel.js relies on with _lciEd.
// Emptied at the start of every render, so a failed assembly can never leave a
// previous report exportable.
let _lciReportBundles = [];

// Compare-table KPI rows (N-224). Shared by _lciCompareTableHtml below and the
// PowerPoint Key Metrics slide, so the two cannot list different metrics.
// `kind` selects the formatter; `lowerIsBetter` drives the Δ colour.
const LCI_COMPARE_KPIS = [
  { label: 'Total spend (horizon)',     key: 'totalSpend',         kind: 'money', lowerIsBetter: true },
  { label: 'Steady-state monthly cost', key: 'steadyMonthly',      kind: 'money', lowerIsBetter: true },
  { label: 'Steady-state annual cost',  key: 'steadyAnnual',       kind: 'money', lowerIsBetter: true },
  { label: 'Cost per head (steady)',    key: 'costPerHead',        kind: 'money', lowerIsBetter: true },
  { label: 'Total hires',               key: 'totalHires',         kind: 'count', lowerIsBetter: false },
  { label: 'Time to full ramp',         key: 'lastHireMonth',      kind: 'month', lowerIsBetter: true },
  { label: 'Peak crossover spend',      key: 'peakCrossoverSpend', kind: 'money', lowerIsBetter: true },
];

function _lciKpiValueText(v, kind, ccy) {
  if (kind === 'money') return _lciFmt(v, ccy);
  if (kind === 'month') return v ? `M${v}` : '—';
  return v ?? '—';
}

// Δ column text. Takes an ALREADY-ABSOLUTE value — the sign and colour are the
// caller's business.
function _lciKpiDeltaText(v, kind, ccy) {
  if (kind === 'money') return _lciFmt(v, ccy);
  if (kind === 'month') return `${v}mo`;
  return v;
}

// ── Entry ────────────────────────────────────────────────────────────
// Called two ways:
//   renderLCIReportPage(ids)                    — new export (prompts title)
//   renderLCIReportPage(ids, {reportId, title, observations})  — open saved
async function renderLCIReportPage(ids, opts = {}) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Assembling report...</p>';
  _lciReportBundles = [];   // any failure below leaves nothing exportable
  try {
    const bundles = [];
    const missing = [];
    for (const id of ids) {
      try {
        const [model, rows, milestones] = await Promise.all([
          getLCIModelById(id), getLCIRows(id), getLCIMilestones(id),
        ]);
        rows.sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
        milestones.sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
        bundles.push({ model, rows, milestones });
      } catch (_) {
        missing.push(id);
      }
    }
    if (!bundles.length) {
      main.innerHTML = '<p style="color:red">None of this report\'s models still exist.</p>';
      return;
    }

    _lciReportBundles = bundles;
    const clients = [...new Set(bundles.map(b => b.model.ClientName).filter(Boolean))];
    let title = opts.title;
    if (title == null) {
      title = await promptModal({ message: 'Report title:', defaultValue: `${clients[0] || 'Client'} — Location & Cost Intelligence` });
      if (title === null) { renderLCIModelsPage(); return; }
    }

    _lciReport = { id: opts.reportId || null, title, ids: bundles.map(b => b.model.id) };
    document.body.classList.add('lci-summary-mode');
    window._lciReportObs = opts.observations || '';
    main.innerHTML = _lciReportHtml(title, clients, bundles, missing.length);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error assembling report: ${e.message}</p>`;
  }
}

// ── Save / update the open report ────────────────────────────────────

async function saveLCIReport() {
  const btn = document.getElementById('lci-report-save-btn');
  setButtonLoading(btn);
  try {
    const fields = {
      Title:        _lciReport.title,
      ModelIDs:     JSON.stringify(_lciReport.ids),
      Observations: window._lciReportObs || '',
    };
    if (_lciReport.id) {
      await updateLCIReport(_lciReport.id, fields);
    } else {
      fields.CreatedByEmail = (getCurrentUser().email || '').toLowerCase();
      const created = await createLCIReport(fields);
      _lciReport.id = created.id;
    }
    clearButtonLoading(btn);
    btn.textContent = 'Saved \u2713';
    setTimeout(() => { if (btn) btn.textContent = 'Save Report'; }, 2000);
  } catch (e) {
    clearButtonLoading(btn);
    toast('Error saving report: ' + e.message, { type: 'error' });
  }
}

async function lciReportRename() {
  const t = await promptModal({ message: 'Report title:', defaultValue: _lciReport.title });
  if (t === null) return;
  _lciReport.title = t;
  document.querySelectorAll('.lci-report-title').forEach(el => { el.textContent = t; });
}

// Return to the model list to change selection, carrying the report identity
// + current title/observations so re-export updates the same saved report.
function lciEditSelectionFromReport() {
  const title = document.querySelector('.lci-report-title')?.textContent || _lciReport.title;
  lciEditReportSelection(_lciReport.ids, {
    id: _lciReport.id,
    title,
    observations: window._lciReportObs || '',
  });
}

// ── Document assembly ────────────────────────────────────────────────

function _lciReportHtml(title, clients, bundles, missingCount = 0) {
  const exportDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const subtitle = `${clients.length === 1 ? clients[0] + ' x ' : ''}Momentum Global — ${exportDate}`;

  const modelSections = bundles.map(b => {
    _lciEd = {
      model: b.model, rows: b.rows, milestones: b.milestones,
      deletedRowIds: [], deletedMilestoneIds: [],
      origRows: new Map(), origMilestones: new Map(),
      dirtySettings: false, dirtyRows: false, dirtyMilestones: false,
    };
    const m = b.model;
    const c = lciComputeModel(m, b.rows);
    return `
      ${_lciReportDividerHtml(m)}
      <div class="lci-summary-card lci-report-break">
        <div class="lci-summary-head">
          <h2 style="margin:0;color:var(--brand-tertiary)">${escHtml(m.Title)}</h2>
          <div style="color:var(--text-label);font-size:13px;margin-top:4px">${escHtml(m.Location)}</div>
        </div>
        ${_lciRoadmapBlocksHtml()}
      </div>
      <div class="lci-summary-card lci-report-break">
        ${_lciCostModelBlocksHtml(false, true)}
      </div>
      ${bundles.length === 1 ? `
      <div class="lci-summary-card lci-report-break">
        ${_lciSpendChartSvg(c, m.DisplayCurrency, Number(m.HorizonMonths))}
      </div>` : ''}
      <div class="lci-summary-card lci-report-break">
        ${_lciAssumptionsHtml(m)}
      </div>`;
  }).join('');
  // Note: per-model cumulative spend charts are omitted in multi-model
  // reports — the combined chart in the comparison section covers them.

  return `
    <div class="page-header lci-noprint">
      <h2 class="lci-report-title">${escHtml(title)}</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="renderLCIModelsPage()">← Back to models</button>
        <button class="btn-secondary" onclick="lciEditSelectionFromReport()">Edit selection</button>
        <button class="btn-secondary" onclick="lciReportRename()">Rename</button>
        <button class="btn-secondary" id="lci-report-save-btn" onclick="saveLCIReport()">Save Report</button>
        <button class="btn-primary" onclick="lciExportReportPptx(this)">Export to PowerPoint</button>
      </div>
    </div>
    ${missingCount ? `<p class="lci-noprint" style="color:var(--accent);font-size:13px;margin:0 0 12px">${missingCount} model(s) in this saved report no longer exist and were skipped.</p>` : ''}
    ${_lciReportCoverHtml(title, subtitle)}
    ${modelSections}
    ${_lciReportComparisonHtml(bundles)}
    ${_lciReportObsHtml()}`;
}

// ── Observations & Recommendations (final page, rich text) ──────────
// Mirrors the Market Report observations editor (rb-richtext + toolbar).
// Session-only: typed content prints but is not persisted to SharePoint.

function _lciReportObsHtml() {
  return `
    <div class="lci-summary-card lci-report-break">
      <h3 style="margin:0 0 12px;color:var(--brand-tertiary)">Observations and Recommendations</h3>
      <div class="rb-rt-wrapper">
        <div class="rb-rt-toolbar lci-noprint" id="lci-report-obs-toolbar">
          <button type="button" onclick="lciReportFormat('bold')"><b>B</b></button>
          <button type="button" onclick="lciReportFormat('italic')"><i>I</i></button>
          <button type="button" onclick="lciReportFormat('underline')"><u>U</u></button>
          <button type="button" onclick="lciReportFormat('insertUnorderedList')">&#8226; List</button>
          <button type="button" onclick="lciReportFormat('insertOrderedList')">1. List</button>
          <button type="button" onclick="lciReportFormatBlock('H3')">Heading</button>
          <button type="button" onclick="lciReportFormatBlock('P')">Body Text</button>
          ${rtTableToolbarButtonHtml()}
        </div>
        <div id="lci-report-obs" class="rb-richtext" contenteditable="true"
             style="min-height:200px;caret-color:var(--brand);cursor:text;padding:8px 10px"
             data-placeholder="Add observations &amp; recommendations here..."
             oninput="window._lciReportObs = this.innerHTML"
             onkeyup="lciReportUpdateToolbarState()"
             onmouseup="lciReportUpdateToolbarState()">${window._lciReportObs || ''}</div>
      </div>
    </div>`;
}

function lciReportFormat(cmd) {
  document.execCommand(cmd, false, null);
  document.getElementById('lci-report-obs')?.focus();
  lciReportUpdateToolbarState();
}
function lciReportFormatBlock(tag) {
  document.execCommand('formatBlock', false, tag);
  document.getElementById('lci-report-obs')?.focus();
  lciReportUpdateToolbarState();
}

function lciReportUpdateToolbarState() {
  rtUpdateToolbarState(document.getElementById('lci-report-obs-toolbar'), 'lciReportFormat', 'lciReportFormatBlock');
}

// ── Navy cover + dividers ────────────────────────────────────────────

// Shared navy-page layout: logo top-left, brand swirl right, title lower-left
// (mirrors the Momentum brand slide composition).
function _lciReportNavyPage(title, subtitle, extraClass = '', withSwirl = false) {
  return `
    <div class="lci-report-navy ${extraClass}">
      <img src="momentum-symbol-and-name-global-white.png" alt="Momentum Global" class="lci-report-logo">
      ${withSwirl ? '<img src="mg-visual-swirl-report.png" alt="" class="lci-report-swirl">' : ''}
      <div class="lci-report-titleblock">
        <h1>${escHtml(title)}</h1>
        <div class="lci-report-sub">${escHtml(subtitle)}</div>
      </div>
    </div>`;
}

function _lciReportCoverHtml(title, subtitle) {
  return _lciReportNavyPage(title, subtitle, 'lci-report-cover', true);
}

function _lciReportDividerHtml(m) {
  return _lciReportNavyPage(m.Title, m.Location || '', 'lci-report-divider lci-report-break');
}

// ── Comparison section (2+ models, all sharing a display currency) ───

function _lciReportComparisonHtml(bundles) {
  if (bundles.length < 2) return '';
  const ccy = bundles[0].model.DisplayCurrency;
  if (!bundles.every(b => b.model.DisplayCurrency === ccy)) return '';

  const entries = bundles.map(b => ({
    name: b.model.Title,
    kpis: lciComputeKPIs(b.model, b.rows),
    comp: lciComputeModel(b.model, b.rows),
  }));

  return `
    ${_lciReportNavyPage('Location Comparison', entries.map(e => e.name).join(' · '), 'lci-report-divider lci-report-break')}
    <div class="lci-summary-card lci-report-break">
      ${_lciCompareTableHtml(entries, ccy)}
      <div style="margin-top:20px">
        ${_lciReportCompareChartSvg(entries, ccy)}
      </div>
    </div>`;
}

// N-model KPI table (Δ column only when exactly 2 models).
// Shared by the report and the on-screen compare view.
function _lciCompareTableHtml(entries, ccy) {
  const twoModels = entries.length === 2;
  const delta = (a, b, kind, goodWhenLower) => {
    const d = b - a;
    if (!isFinite(d) || d === 0) return '<span style="color:var(--text-muted)">—</span>';
    const good = goodWhenLower ? d < 0 : d > 0;
    return `<span style="color:${good ? 'var(--status-success)' : 'var(--status-danger)'}">${d > 0 ? '+' : '−'}${_lciKpiDeltaText(Math.abs(d), kind, ccy)}</span>`;
  };

  const head = `<tr><th style="width:26%"></th>${entries.map(e => `<th>${escHtml(e.name)}</th>`).join('')}${twoModels ? '<th>Δ (B − A)</th>' : ''}</tr>`;
  const rows = LCI_COMPARE_KPIS.map(k => `
    <tr>
      <td>${k.label}</td>
      ${entries.map(e => `<td>${_lciKpiValueText(e.kpis[k.key], k.kind, ccy)}</td>`).join('')}
      ${twoModels ? `<td>${delta(entries[0].kpis[k.key], entries[1].kpis[k.key], k.kind, k.lowerIsBetter)}</td>` : ''}
    </tr>`).join('');

  return `
    <h3 style="margin:0 0 12px;color:var(--brand-tertiary)">Key Metrics <span style="font-weight:400;font-size:13px;color:var(--text-muted)">(${ccy})</span></h3>
    <table class="data-table lci-compare">
      <thead>${head}</thead>
      <tbody>${rows}</tbody>
    </table>
    ${twoModels ? `<p style="font-size:12px;color:var(--text-muted);margin:8px 0 0">Δ green = ${escHtml(entries[1].name)} favourable, red = unfavourable (cost down / hires up = good).</p>` : ''}`;
}

// N-line cumulative spend chart, all solid, palette colours, centred legend.
function _lciReportCompareChartSvg(entries, ccy) {
  const horizon = Math.max(...entries.map(e => e.comp.cumulativeSpend.length));
  const labels = entries.find(e => e.comp.cumulativeSpend.length === horizon).comp.labels;
  const W = 900, H = 248, padL = 70, padR = 20, padT = 16, padB = 38;
  const MAJOR = 500000, MINOR = 250000;
  const maxData = Math.max(...entries.flatMap(e => e.comp.cumulativeSpend), 1);
  const maxY = Math.max(Math.ceil(maxData / MAJOR) * MAJOR, MAJOR);
  const x = i => padL + (i / Math.max(horizon - 1, 1)) * (W - padL - padR);
  const y = v => padT + (1 - v / maxY) * (H - padT - padB);

  const fmtCompact = v => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: ccy || 'EUR', notation: 'compact', maximumFractionDigits: 1,
  }).format(v);

  const gridLines = _chartGridSvg(padL, W, padR, (() => {
    const out = [];
    for (let v = MINOR; v <= maxY; v += MINOR) {
      const isMajor = v % MAJOR === 0;
      out.push({ y: y(v), minor: !isMajor, label: isMajor ? fmtCompact(v) : null });
    }
    return out;
  })());

  const lines = entries.map((e, n) => {
    const col = LCI_REPORT_COLOURS[n % LCI_REPORT_COLOURS.length];
    const pts = e.comp.cumulativeSpend.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const dots = e.comp.cumulativeSpend.map((v, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" class="nt-chart-dot" style="--nt-chart-color:${col}"><title>${labels[i]}: ${_lciFmt(v, ccy)}</title></circle>`).join('');
    return `<polyline points="${pts}" class="nt-chart-line" style="--nt-chart-color:${col}"/>${dots}`;
  }).join('');

  const ticks = labels.map((l, i) => {
    if (!(horizon <= 12 || i % 2 === 0)) return '';
    const sub = (l.match(/\((.+)\)/) || [])[1] || '';
    return `<text x="${x(i).toFixed(1)}" y="${H - 18}" class="nt-chart-tick" text-anchor="middle">M${i + 1}</text>
            <text x="${x(i).toFixed(1)}" y="${H - 6}" class="nt-chart-tick--sub" text-anchor="middle">(${sub})</text>`;
  }).join('');

  const legend = _chartLegendHtml(entries.map((e, n) => ({
    color: LCI_REPORT_COLOURS[n % LCI_REPORT_COLOURS.length],
    label: escHtml(e.name),
  })));

  return `
    <h3 style="margin:0 0 12px;color:var(--brand-tertiary)">Cumulative Spend <span style="font-weight:400;font-size:13px;color:var(--text-muted)">(${ccy})</span></h3>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">
      ${gridLines}
      ${lines}
      ${ticks}
    </svg>
    ${legend}`;
}
