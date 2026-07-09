// js/lci-report.js — Full LCI report export (step 9)
// Assembles multiple models + comparison into one print document:
// navy cover page → per model: navy divider + plan / cost model / chart /
// assumptions pages → comparison section (when 2+ models share a display
// currency). Selection reuses the compare checkboxes on the model list.
// Loaded after lci-summary.js. Reuses _lciEd-based renderers by setting
// _lciEd per model while building the HTML.

const LCI_REPORT_COLOURS = ['#1B3A5C', '#E8703A', '#2E8B8B', '#7B5EA7', '#B0578D'];

// ── Entry (wired from lci-pages.js Export Report button) ─────────────

async function renderLCIReportPage(ids) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Assembling report...</p>';
  try {
    const bundles = await Promise.all(ids.map(async id => {
      const [model, rows, milestones] = await Promise.all([
        getLCIModelById(id), getLCIRows(id), getLCIMilestones(id),
      ]);
      rows.sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
      milestones.sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
      return { model, rows, milestones };
    }));

    const clients = [...new Set(bundles.map(b => b.model.ClientName).filter(Boolean))];
    const defaultTitle = `${clients[0] || 'Client'} — Location & Cost Intelligence`;
    const title = prompt('Report title:', defaultTitle);
    if (title === null) { renderLCIModelsPage(); return; }

    document.body.classList.add('lci-summary-mode'); // suppress Confidential banner + print header margins
    window._lciReportObs = ''; // Observations & Recommendations (session-only, not persisted)
    main.innerHTML = _lciReportHtml(title, clients, bundles);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error assembling report: ${e.message}</p>`;
  }
}

// ── Document assembly ────────────────────────────────────────────────

function _lciReportHtml(title, clients, bundles) {
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
          <h2 style="margin:0;color:#1B3A5C">${m.Title}</h2>
          <div style="color:#666;font-size:13px;margin-top:4px">${m.Location || ''}</div>
        </div>
        ${_lciSummaryRoadmapHtml()}
      </div>
      <div class="lci-summary-card lci-report-break">
        ${_lciOutputInnerHtml(false, true)}
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
      <h2>${title}</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="renderLCIModelsPage()">← Back to models</button>
        <button class="btn-primary" onclick="printPage('${title.replace(/'/g, '')}', true, 'LCI')">Print / PDF</button>
      </div>
    </div>
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
      <h3 style="margin:0 0 12px;color:#1B3A5C">Observations and Recommendations</h3>
      <div class="rb-rt-wrapper">
        <div class="rb-rt-toolbar lci-noprint">
          <button type="button" onclick="lciReportFormat('bold')"><b>B</b></button>
          <button type="button" onclick="lciReportFormat('italic')"><i>I</i></button>
          <button type="button" onclick="lciReportFormat('underline')"><u>U</u></button>
          <button type="button" onclick="lciReportFormat('insertUnorderedList')">&#8226; List</button>
          <button type="button" onclick="lciReportFormat('insertOrderedList')">1. List</button>
          <button type="button" onclick="lciReportFormatBlock('H3')">Heading</button>
          <button type="button" onclick="lciReportFormatBlock('P')">Body Text</button>
        </div>
        <div id="lci-report-obs" class="rb-richtext" contenteditable="true"
             style="min-height:200px;caret-color:#0A0B44;cursor:text;padding:8px 10px"
             data-placeholder="Add observations &amp; recommendations here..."
             oninput="window._lciReportObs = this.innerHTML">${window._lciReportObs || ''}</div>
      </div>
    </div>`;
}

function lciReportFormat(cmd) {
  document.execCommand(cmd, false, null);
  document.getElementById('lci-report-obs')?.focus();
}
function lciReportFormatBlock(tag) {
  document.execCommand('formatBlock', false, tag);
  document.getElementById('lci-report-obs')?.focus();
}

// ── Navy cover + dividers ────────────────────────────────────────────

// Shared navy-page layout: logo top-left, brand swirl right, title lower-left
// (mirrors the Momentum brand slide composition).
function _lciReportNavyPage(title, subtitle, extraClass = '', withSwirl = false) {
  return `
    <div class="lci-report-navy ${extraClass}">
      <img src="momentum-symbol-and-name-global-white.png" alt="Momentum Global" class="lci-report-logo">
      ${withSwirl ? '<img src="mg-visual-swirl.png" alt="" class="lci-report-swirl">' : ''}
      <div class="lci-report-titleblock">
        <h1>${title}</h1>
        <div class="lci-report-sub">${subtitle}</div>
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
  const money = v => _lciFmt(v, ccy);
  const month = v => v ? `M${v}` : '—';
  const twoModels = entries.length === 2;
  const delta = (a, b, fmt, goodWhenLower = true) => {
    const d = b - a;
    if (!isFinite(d) || d === 0) return '<span style="color:#888">—</span>';
    const good = goodWhenLower ? d < 0 : d > 0;
    return `<span style="color:${good ? '#2E7D32' : '#C62828'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`;
  };

  const K = [
    ['Total spend (horizon)',     k => money(k.totalSpend),         'totalSpend',        money, true],
    ['Steady-state monthly cost', k => money(k.steadyMonthly),      'steadyMonthly',     money, true],
    ['Steady-state annual cost',  k => money(k.steadyAnnual),       'steadyAnnual',      money, true],
    ['Cost per head (steady)',    k => money(k.costPerHead),        'costPerHead',       money, true],
    ['Total hires',               k => k.totalHires ?? '—',         'totalHires',        v => v, false],
    ['Time to full ramp',         k => month(k.lastHireMonth),      'lastHireMonth',     v => `${v}mo`, true],
    ['Peak crossover spend',      k => money(k.peakCrossoverSpend), 'peakCrossoverSpend', money, true],
  ];

  const head = `<tr><th style="width:26%"></th>${entries.map(e => `<th>${e.name}</th>`).join('')}${twoModels ? '<th>Δ (B − A)</th>' : ''}</tr>`;
  const rows = K.map(([label, fmt, key, dfmt, lower]) => `
    <tr>
      <td>${label}</td>
      ${entries.map(e => `<td>${fmt(e.kpis)}</td>`).join('')}
      ${twoModels ? `<td>${delta(entries[0].kpis[key], entries[1].kpis[key], dfmt, lower)}</td>` : ''}
    </tr>`).join('');

  return `
    <h3 style="margin:0 0 12px;color:#1B3A5C">Key Metrics <span style="font-weight:400;font-size:13px;color:#888">(${ccy})</span></h3>
    <table class="data-table lci-compare">
      <thead>${head}</thead>
      <tbody>${rows}</tbody>
    </table>
    ${twoModels ? `<p style="font-size:12px;color:#888;margin:8px 0 0">Δ green = ${entries[1].name} favourable, red = unfavourable (cost down / hires up = good).</p>` : ''}`;
}

// N-line cumulative spend chart, all solid, palette colours, centred legend.
function _lciReportCompareChartSvg(entries, ccy) {
  const horizon = Math.max(...entries.map(e => e.comp.cumulativeSpend.length));
  const labels = entries.find(e => e.comp.cumulativeSpend.length === horizon).comp.labels;
  const W = 900, H = 260, padL = 70, padR = 20, padT = 16, padB = 50;
  const MAJOR = 500000, MINOR = 250000;
  const maxData = Math.max(...entries.flatMap(e => e.comp.cumulativeSpend), 1);
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
    if (isMajor) gridLines += `<text x="${padL - 6}" y="${gy + 3}" font-size="8" fill="#999" text-anchor="end">${fmtCompact(v)}</text>`;
  }

  const lines = entries.map((e, n) => {
    const col = LCI_REPORT_COLOURS[n % LCI_REPORT_COLOURS.length];
    const pts = e.comp.cumulativeSpend.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const dots = e.comp.cumulativeSpend.map((v, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${col}"><title>${labels[i]}: ${_lciFmt(v, ccy)}</title></circle>`).join('');
    return `<polyline points="${pts}" stroke="${col}" stroke-width="2.5" fill="none"/>${dots}`;
  }).join('');

  const ticks = labels.map((l, i) => {
    if (!(horizon <= 12 || i % 2 === 0)) return '';
    const sub = (l.match(/\((.+)\)/) || [])[1] || '';
    return `<text x="${x(i).toFixed(1)}" y="${H - 30}" font-size="8" fill="#888" text-anchor="middle">M${i + 1}</text>
            <text x="${x(i).toFixed(1)}" y="${H - 20}" font-size="7" fill="#aaa" text-anchor="middle">(${sub})</text>`;
  }).join('');

  // Centred legend: items spaced evenly around W/2
  const itemW = 170;
  const startX = W / 2 - (entries.length * itemW) / 2;
  const legend = `
    <g font-size="9">
      ${entries.map((e, n) => {
        const col = LCI_REPORT_COLOURS[n % LCI_REPORT_COLOURS.length];
        const lx = startX + n * itemW;
        return `<line x1="${lx}" y1="${H - 6}" x2="${lx + 24}" y2="${H - 6}" stroke="${col}" stroke-width="2.5"/>
                <text x="${lx + 30}" y="${H - 3}" fill="#555">${e.name}</text>`;
      }).join('')}
    </g>`;

  return `
    <h3 style="margin:0 0 12px;color:#1B3A5C">Cumulative Spend <span style="font-weight:400;font-size:13px;color:#888">(${ccy})</span></h3>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">
      ${gridLines}
      ${lines}
      ${ticks}
      ${legend}
    </svg>`;
}
