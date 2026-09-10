// js/lci-pptx.js — LCI Report → native, editable PowerPoint deck (N-224)
//
// Loaded after lci-report.js. Reads the report that is currently open on
// screen (_lciReport / _lciReportBundles) and writes a .pptx. Replaces the
// Print / PDF button on the report page; the Summary page keeps its PDF.
//
// THREE RULES THIS FILE LIVES BY
//
// 1. It never recalculates anything. Every figure comes from
//    lciComputeModel() / lciComputeKPIs() / lciHiresPerMonth() in
//    lci-model.js, and every row-visibility decision is the one
//    _lciOutputInnerHtml() makes (N-008 / N-010 / N-018). If you find
//    yourself writing arithmetic here that lci-model.js already does, you are
//    creating a second calc layer that will drift — the same rule lci-excel.js
//    lives by, for the same reason.
//
// 2. Everything on a slide is a NATIVE PowerPoint object — real tables, real
//    charts, real text runs. Never rasterise a table or drop the on-screen SVG
//    onto a slide. Post-export editing is the entire point of this format; a
//    picture of a table defeats it.
//
// 3. escHtml INVERTS here, exactly as it does in lci-excel.js. A slide holds
//    values, not markup: escHtml-ing a title puts a literal &amp; on the
//    client's slide. The only sanitising in this file is safeFilename() on a
//    RAW title (N-012d) and the DOMParser pass that turns the contenteditable
//    Observations HTML back into plain text runs.
//
// FONTS: Polymath ships as three SEPARATE families in Outputs/ — 'Polymath'
// (regular), 'Polymath Medium' and 'Polymath Semibold', each with subfamily
// 'Regular'. The browser stitches them into one weighted family via @font-face;
// PowerPoint cannot. So bold text never sets bold:true on 'Polymath' (which
// would give PowerPoint's synthetic faux-bold) — it switches the FACE to
// CONFIG.LCI.PPTX.FONT.faceBold. Always go through _lciPptxFace().
//
// COLOURS: CONFIG.LCI.PPTX.COLOURS are plain 6-digit hex with NO alpha prefix.
// They are deliberately NOT CONFIG.LCI.EXCEL.COLOURS — pptxgenjs rejects the
// 8-character ARGB form ExcelJS requires. Do not derive one from the other.

// ── Lazy loader ──────────────────────────────────────────────────────
// Never on page render — only on the first Export click. The *bundle* build
// is required: pptxgen.min.js expects a separate JSZip global, the bundle
// carries JSZip inside it.
let _lciPptxPromise = null;

function _lciLoadPptxGen() {
  if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  if (_lciPptxPromise) return _lciPptxPromise;
  _lciPptxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CONFIG.LCI.PPTX.CDN;
    s.onload = () => window.PptxGenJS
      ? resolve(window.PptxGenJS)
      : reject(new Error('PowerPoint library loaded but did not register.'));
    s.onerror = () => {
      _lciPptxPromise = null;   // allow a retry on the next click
      reject(new Error('Could not load the PowerPoint library. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return _lciPptxPromise;
}

// ── Assets ───────────────────────────────────────────────────────────
// Fetched to data URLs UP FRONT rather than handed to addImage({path}).
// addImage's own fetch happens inside writeFile(), where a 404 rejects the
// whole export; pre-fetching turns a missing asset into a plain navy slide.
async function _lciPptxAsset(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload  = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch (_) {
    return null;
  }
}

// ── Type ─────────────────────────────────────────────────────────────
// Weight is a FACE choice, not a bold flag — see the FONTS note at the top.
function _lciPptxFace(bold) {
  const F = CONFIG.LCI.PPTX.FONT;
  return bold ? F.faceBold : F.face;
}

// ── Masters ──────────────────────────────────────────────────────────

function _lciPptxDefineMasters(pptx, assets) {
  const P = CONFIG.LCI.PPTX, C = P.COLOURS, F = P.FONT, G = P.GEO;

  const navyObjects = [];
  if (assets.logo) {
    navyObjects.push({ image: { data: assets.logo, x: G.margin, y: G.margin, w: G.logoW, h: G.logoH } });
  }
  pptx.defineSlideMaster({
    title: P.MASTERS.navy,
    background: { color: C.navy },
    objects: navyObjects,
  });

  pptx.defineSlideMaster({
    title: P.MASTERS.content,
    background: { color: C.paper },
    objects: [
      { rect: { x: 0, y: P.LAYOUT.height - G.footerH, w: P.LAYOUT.width, h: G.rule, fill: { color: C.navy } } },
    ],
    slideNumber: {
      x: P.LAYOUT.width - G.margin - G.slideNumW, y: P.LAYOUT.height - G.footerH + G.footerPad,
      w: G.slideNumW, align: 'right', fontFace: F.face, fontSize: F.footer, color: C.textMuted,
    },
  });
}

// ── Slide shells ─────────────────────────────────────────────────────

// Navy cover / divider. `withSwirl` is the cover composition only.
function _lciPptxNavySlide(ctx, title, subtitle, withSwirl) {
  const P = CONFIG.LCI.PPTX, C = P.COLOURS, F = P.FONT, G = P.GEO;
  const slide = ctx.pptx.addSlide({ masterName: P.MASTERS.navy });
  if (withSwirl && ctx.assets.swirl) {
    slide.addImage({
      data: ctx.assets.swirl,
      x: P.LAYOUT.width - G.margin - G.swirlW, y: (P.LAYOUT.height - G.swirlH) / 2,
      w: G.swirlW, h: G.swirlH,
    });
  }
  const blockY = P.LAYOUT.height - G.margin - G.titleBlockH;
  slide.addText(String(title || ''), {
    x: G.margin, y: blockY, w: P.LAYOUT.width - G.margin * 2 - (withSwirl ? G.swirlW : 0), h: G.titleH,
    fontFace: _lciPptxFace(true), fontSize: withSwirl ? F.coverTitle : F.dividerTitle,
    color: C.navyText, valign: 'bottom',
  });
  slide.addText(String(subtitle || ''), {
    x: G.margin, y: blockY + G.titleH, w: P.LAYOUT.width - G.margin * 2, h: G.subH,
    fontFace: F.face, fontSize: withSwirl ? F.coverSub : F.dividerSub,
    color: C.navyMuted, valign: 'top',
  });
  return slide;
}

// White content slide: navy heading, optional grey note under it, footer line.
function _lciPptxContentSlide(ctx, title, note) {
  const P = CONFIG.LCI.PPTX, C = P.COLOURS, F = P.FONT, G = P.GEO;
  const slide = ctx.pptx.addSlide({ masterName: P.MASTERS.content });
  slide.addText(String(title || ''), {
    x: G.margin, y: G.margin, w: P.LAYOUT.width - G.margin * 2, h: G.headingH,
    fontFace: _lciPptxFace(true), fontSize: F.slideTitle, color: C.navySteel, valign: 'middle',
  });
  if (note) {
    slide.addText(String(note), {
      x: G.margin, y: G.margin + G.headingH, w: P.LAYOUT.width - G.margin * 2, h: G.noteH,
      fontFace: F.face, fontSize: F.note, color: C.textMuted, valign: 'top',
    });
  }
  slide.addText(ctx.footer, {
    x: G.margin, y: P.LAYOUT.height - G.footerH + G.footerPad, w: P.LAYOUT.width / 2, h: G.footerTextH,
    fontFace: F.face, fontSize: F.footer, color: C.textMuted, valign: 'middle',
  });
  return slide;
}

// Y at which slide body content starts (below the heading, and the note when present).
function _lciPptxBodyTop(hasNote) {
  const G = CONFIG.LCI.PPTX.GEO;
  return G.margin + G.headingH + (hasNote ? G.noteH : 0) + G.gap;
}

// ── Table rendering ──────────────────────────────────────────────────
// A logical table becomes one or more slides. Rows are {style, cells}; a cell
// is a string or {text, fill}. Styles mirror the HTML row classes:
//   band     → lci-team-row        subtotal → lci-out-subtotal
//   total    → lci-out-total       plain    → an ordinary data row
function _lciPptxRowStyle(style) {
  const P = CONFIG.LCI.PPTX, C = P.COLOURS;
  if (style === 'band')     return { fill: C.bandFill,     bold: true };
  if (style === 'subtotal') return { fill: C.subtotalFill, bold: true };
  if (style === 'total')    return { fill: C.totalFill,    bold: true };
  return { fill: C.paper, bold: false };
}

// `opts.grid` marks a month-grid table (Hiring Roadmap / Cost Model). Those
// render at a smaller size than the narrow tables — the deck mirrors the print
// stylesheet, where @media print pulls .lci-grid down to --fs-10 with tightened
// padding while .lci-assump and .lci-compare keep their normal size.
//
// PowerPoint table cells always wrap (pptxgenjs's `wrap` option is text-box
// only — setting it on a cell emits nothing), so the way a month cell is kept
// on one line is the same way print does it: make the type small enough that
// the widest figure fits the column. FONT.gridCell is set from that
// measurement, not by eye — see the Reference in the N-224 diff.
function _lciPptxTableSlides(ctx, title, header, bodyRows, opts = {}) {
  const P = CONFIG.LCI.PPTX, C = P.COLOURS, F = P.FONT, G = P.GEO;
  const cap = opts.rowsPerSlide || P.TABLE.rowsPerSlide;
  const headSize = opts.grid ? F.gridHeader : F.tableHeader;
  const cellSize = opts.grid ? F.gridCell   : F.tableCell;
  const chunks = [];
  for (let i = 0; i < bodyRows.length; i += cap) chunks.push(bodyRows.slice(i, i + cap));
  if (!chunks.length) chunks.push([]);

  const cols = header.length;
  const totalW = P.LAYOUT.width - G.margin * 2;
  // Grid tables get a fixed label column (the print rule caps .lci-grid--roadmap
  // td:first-child at 180px); the narrow tables get a proportional one, as
  // .lci-assump (45%) and .lci-compare (26%) do on screen and in print.
  const labelW = opts.labelFrac ? totalW * opts.labelFrac : Math.min(P.TABLE.labelColW, totalW / 2);
  const restW  = cols > 1 ? (totalW - labelW) / (cols - 1) : 0;
  const colW   = [labelW, ...new Array(Math.max(cols - 1, 0)).fill(restW)];

  const headRow = header.map((h, i) => ({
    text: String(h ?? ''),
    options: {
      fill: { color: C.navy }, color: C.navyText,
      fontFace: _lciPptxFace(true), fontSize: headSize,
      align: i === 0 ? 'left' : 'center', valign: 'middle',
    },
  }));

  chunks.forEach((chunk, n) => {
    const slideTitle = n === 0 ? title : `${title} (cont.)`;
    const slide = _lciPptxContentSlide(ctx, slideTitle, opts.note);
    const rows = [headRow].concat(chunk.map(r => {
      const st = _lciPptxRowStyle(r.style);
      return r.cells.map((cell, i) => {
        const isObj = cell && typeof cell === 'object';
        return {
          text: isObj ? String(cell.text ?? '') : String(cell ?? ''),
          options: {
            fill: { color: (isObj && cell.fill) || st.fill },
            color: C.textBody,
            fontFace: _lciPptxFace(st.bold), fontSize: cellSize,
            align: i === 0 ? 'left' : 'center', valign: 'middle',
          },
        };
      });
    }));
    slide.addTable(rows, {
      x: G.margin, y: _lciPptxBodyTop(!!opts.note), w: totalW,
      colW, rowH: P.TABLE.rowH, autoPage: false,
      border: { type: 'solid', pt: P.TABLE.borderPt, color: C.tableBorder },
    });
  });
}

// ── Slide 3: Key figures ─────────────────────────────────────────────
// The one page with no equivalent in the HTML report. A single-model report
// has no KPI summary anywhere today — the figures only surface inside the
// two-model comparison table. Values come straight from lciComputeKPIs().
function _lciPptxKpiSlide(ctx, m, kpis) {
  const P = CONFIG.LCI.PPTX, C = P.COLOURS, F = P.FONT, G = P.GEO;
  const ccy = m.DisplayCurrency;
  const tiles = [
    ['Total spend (horizon)',  _lciFmt(kpis.totalSpend, ccy)],
    ['Steady-state / month',   _lciFmt(kpis.steadyMonthly, ccy)],
    ['Steady-state / year',    _lciFmt(kpis.steadyAnnual, ccy)],
    ['Cost per head (steady)', _lciFmt(kpis.costPerHead, ccy)],
    ['Total hires',            String(kpis.totalHires ?? 0)],
    ['Time to full ramp',      kpis.lastHireMonth ? `M${kpis.lastHireMonth}` : '—'],
    ['Final CoE headcount',    String(kpis.finalHeadcount ?? 0)],
    ['Peak crossover spend',   _lciFmt(kpis.peakCrossoverSpend, ccy)],
  ];

  const slide = _lciPptxContentSlide(ctx, `Key Figures — ${m.Title || 'Model'}`,
    `All values in ${ccy || ''}.`);
  const top     = _lciPptxBodyTop(true);
  const perRow  = P.KPI.perRow;
  const totalW  = P.LAYOUT.width - G.margin * 2;
  const tileW   = (totalW - P.KPI.gap * (perRow - 1)) / perRow;

  tiles.forEach(([label, value], i) => {
    const col = i % perRow, row = Math.floor(i / perRow);
    const x = G.margin + col * (tileW + P.KPI.gap);
    const y = top + row * (P.KPI.tileH + P.KPI.gap);
    slide.addShape(ctx.pptx.ShapeType.roundRect, {
      x, y, w: tileW, h: P.KPI.tileH,
      fill: { color: C.subtotalFill }, line: { color: C.tableBorder, width: P.TABLE.borderPt },
      rectRadius: P.KPI.radius,
    });
    slide.addText(value, {
      x, y: y + P.KPI.valuePad, w: tileW, h: P.KPI.valueH,
      fontFace: _lciPptxFace(true), fontSize: F.kpiValue, color: C.navySteel,
      align: 'center', valign: 'middle',
    });
    slide.addText(label, {
      x, y: y + P.KPI.valuePad + P.KPI.valueH, w: tileW, h: P.KPI.labelH,
      fontFace: F.face, fontSize: F.kpiLabel, color: C.textMuted,
      align: 'center', valign: 'top',
    });
  });
}

// ── Roadmap rows ─────────────────────────────────────────────────────
// Mirrors _lciSummaryRoadmapHtml + _lciSummaryMilestoneRows: milestone band,
// milestone bars, team bands, role rows, then hires / cumulative hires.
// Cumulative runs over the FULL horizon before slicing, so a Year 2 slide
// opens at the Year 1 closing total instead of restarting at zero.
function _lciPptxRoadmapRows(m, rows, milestones, sl) {
  const P = CONFIG.LCI.PPTX;
  const horizon = Number(m.HorizonMonths);
  const span = sl.end - sl.start;
  const cut = arr => arr.slice(sl.start, sl.end);
  const blank = () => new Array(span + 1).fill('');
  const out = [];

  const stones = (milestones || []).filter(s => s.Title && s.StartMonth)
    .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
  if (stones.length) {
    out.push({ style: 'band', cells: ['Project Milestones', ...blank()] });
    stones.forEach(s => {
      const start = Math.max(1, Number(s.StartMonth));
      const end   = Math.min(horizon, Math.max(start, Number(s.EndMonth) || start));
      const cells = [s.Title || ''];
      for (let i = sl.start; i < sl.end; i++) {
        const mn = i + 1;
        cells.push(mn >= start && mn <= end ? { text: '', fill: P.COLOURS.accent } : '');
      }
      cells.push('');
      out.push({ style: 'plain', cells });
    });
  }

  const coeRows = rows.filter(r => r.RowType === 'coe');
  const teams = [];
  for (const r of coeRows) {
    const t = r.Team || 'Other';
    if (!teams.includes(t)) teams.push(t);
  }
  teams.forEach(team => {
    out.push({ style: 'band', cells: [team, ...blank()] });
    coeRows.filter(r => (r.Team || 'Other') === team).forEach(r => {
      const vals = cut(lciMonthValues(r, horizon));
      const lvl  = String(r.CareerLevel || '').trim();
      out.push({
        style: 'plain',
        cells: [`${r.Title || ''}${lvl ? ` (${lvl})` : ''}`,
                ...vals.map(v => v || ''),
                vals.reduce((a, b) => a + b, 0)],
      });
    });
  });

  const hires = lciHiresPerMonth(rows, m);
  let running = 0;
  const cumAll = hires.map(hv => (running += hv));
  const sliceHires = cut(hires);
  out.push({ style: 'subtotal', cells: ['Hires per month', ...sliceHires.map(v => v || ''), sliceHires.reduce((a, b) => a + b, 0)] });
  out.push({ style: 'subtotal', cells: ['Cumulative hires', ...cut(cumAll), ''] });
  return out;
}

// ── Cost model rows ──────────────────────────────────────────────────
// Row VISIBILITY is lifted from _lciOutputInnerHtml() (N-008 / N-010 / N-018)
// so the deck and the on-screen table reconcile line for line — the same
// contract _lciXlOutput() honours for the workbook.
// Slice semantics also carry over unchanged: FLOW rows total by the sum of
// the slice; STOCK rows (cumulative spend, both headcount rows) show the
// slice's CLOSING month. Summing a cumulative or headcount series gives a
// plausible-looking but meaningless figure — do not "simplify" these.
function _lciPptxCostRows(m, rows, c, sl) {
  const ccy = m.DisplayCurrency;
  const horizon  = Number(m.HorizonMonths);
  const sections = lciSections(m);
  const cut   = arr => (arr || []).slice(sl.start, sl.end);
  const sum   = arr => cut(arr).reduce((a, b) => a + (Number(b) || 0), 0);
  const close = arr => { const s = cut(arr); return s.length ? s[s.length - 1] : 0; };

  const money = arr => cut(arr).map(v => _lciFmt(v, ccy)).concat(sl.label ? [_lciFmt(sum(arr), ccy)] : []);
  const cum   = arr => cut(arr).map(v => _lciFmt(v, ccy)).concat(sl.label ? [_lciFmt(close(arr), ccy)] : []);
  const int   = arr => cut(arr).map(v => v || '').concat(sl.label ? [close(arr) || ''] : []);

  const out = [];
  const push = (style, label, cells) => out.push({ style, cells: [label, ...cells] });

  if (sections.coe) {
    Object.entries(c.coeByTeam).forEach(([team, arr]) => push('plain', `   ${team}`, money(arr)));
    push('subtotal', 'Total Employee Cost', money(c.coeEmployeeCost));
    push('plain', 'CoE Headcount (on payroll)', int(c.coeHeadcount));
    const hasEoR    = (Number(m.EoRFeePerHead) || 0) > 0;
    const hasOffice = (Number(m.OfficeCostPerHead) || 0) > 0;
    const hasTravel = c.travel.some(v => v);
    if (hasEoR)    push('plain', '   EoR Costs',    money(c.eor));
    if (hasOffice) push('plain', '   Office Costs', money(c.office));
    if (hasTravel) push('plain', '   Travel Costs', money(c.travel));
    if (hasEoR || hasOffice || hasTravel) {
      push('subtotal', 'Total CoE Operating Costs', money(c.coeOperating));
    }
  }

  if (sections.legacy || sections.oneoffs) {
    const lbc = c.legacyByCategory || { exiting: [], retained: [] };
    const showCatRows = lbc.exiting.some(v => v) && lbc.retained.some(v => v);
    // N-018: "Legacy Team Costs" only earns a row when it is not derivable
    // from the rows around it — a single category WITH R&R amounts.
    const showLegacyTeamCosts = !showCatRows && c.oneoffs.some(v => v);
    if (sections.legacy) {
      push('plain', 'Legacy Headcount', int(c.legacyHeadcount));
      if (showLegacyTeamCosts) push('plain', '   Legacy Team Costs', money(c.legacyCost));
      if (showCatRows) {
        Object.entries(CONFIG.LCI.LEGACY_CATEGORIES).forEach(([k, v]) =>
          push('plain', `   ${v.costLine}`, money(lbc[k])));
      }
    }
    if (sections.oneoffs) push('plain', '   Retention & Relocation', money(c.oneoffs));
    push('subtotal', 'Total Legacy Costs', money(c.legacyCost.map((v, i) => v + c.oneoffs[i])));
  }

  if (sections.fees) {
    _lciRowsOfType('fee').forEach(r =>
      push('plain', `   ${r.Title || 'Fee'}`, money(lciMonthValues(r, horizon))));
    push('subtotal', 'Total Project Fees', money(c.fees));
  }

  push('total', 'Total Monthly Spend', money(c.totalMonthly));
  push('total', 'Cumulative Spend',    cum(c.cumulativeSpend));
  return out;
}

// ── Charts ───────────────────────────────────────────────────────────
// A real PowerPoint line chart, never the on-screen SVG.
function _lciPptxSpendChart(ctx, slide, series, labels, ccy) {
  const P = CONFIG.LCI.PPTX, C = P.COLOURS, F = P.FONT, G = P.GEO;
  const data = series.map(s => ({ name: s.name, labels, values: s.values }));
  slide.addChart(ctx.pptx.ChartType.line, data, {
    x: G.margin, y: _lciPptxBodyTop(true),
    w: P.LAYOUT.width - G.margin * 2,
    h: P.LAYOUT.height - _lciPptxBodyTop(true) - G.footerH - G.gap,
    chartColors: series.map((_s, n) => C.series[n % C.series.length]),
    lineDataSymbol: 'circle', lineSize: P.CHART.lineSize,
    showLegend: series.length > 1, legendPos: 'b',
    legendFontFace: F.face, legendFontSize: F.chartLabel,
    catAxisLabelFontFace: F.face, catAxisLabelFontSize: F.chartLabel, catAxisLabelColor: C.textMuted,
    valAxisLabelFontFace: F.face, valAxisLabelFontSize: F.chartLabel, valAxisLabelColor: C.textMuted,
    valAxisLabelFormatCode: `#,##0,\\k "${ccy || ''}"`,
    valGridLine: { color: C.tableBorder, style: 'solid', size: P.CHART.gridSize },
    catGridLine: { style: 'none' },
  });
}

// ── Observations & Recommendations ───────────────────────────────────
// window._lciReportObs is contenteditable HTML. Parsed into ordered blocks of
// text runs — never injected as markup, and never rendered as one flat string.
function _lciPptxObsBlocks(html) {
  const blocks = [];
  if (!html || !String(html).trim()) return blocks;
  const doc  = new DOMParser().parseFromString(`<div id="lci-obs-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('lci-obs-root');
  if (!root) return blocks;

  const HEADINGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

  const runsOf = (node, inherited) => {
    const runs = [];
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) {
        const text = child.nodeValue.replace(/\s+/g, ' ');
        if (text.trim()) runs.push({ text, ...inherited });
        return;
      }
      if (child.nodeType !== 1) return;
      const tag = child.tagName.toUpperCase();
      if (tag === 'BR') { runs.push({ text: '', ...inherited, hardBreak: true }); return; }
      if (tag === 'UL' || tag === 'OL' || tag === 'LI') return; // handled by the block walker
      runs.push(...runsOf(child, {
        bold:      inherited.bold      || tag === 'B' || tag === 'STRONG',
        italic:    inherited.italic    || tag === 'I' || tag === 'EM',
        underline: inherited.underline || tag === 'U',
      }));
    });
    return runs;
  };

  const pushBlock = (node, opts) => {
    const runs = runsOf(node, { bold: !!opts.heading, italic: false, underline: false });
    if (runs.length) blocks.push({ runs, bullet: !!opts.bullet, level: opts.level || 0, heading: !!opts.heading });
  };

  const walk = (parent, level) => {
    parent.childNodes.forEach(node => {
      if (node.nodeType === 3) {
        const text = node.nodeValue.replace(/\s+/g, ' ');
        if (text.trim()) blocks.push({ runs: [{ text }], bullet: false, level, heading: false });
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toUpperCase();
      if (tag === 'UL' || tag === 'OL') { walk(node, level + 1); return; }
      if (tag === 'LI') {
        pushBlock(node, { bullet: true, level: Math.max(level - 1, 0) });
        node.querySelectorAll(':scope > ul, :scope > ol').forEach(sub => walk(sub, level + 1));
        return;
      }
      if (HEADINGS.includes(tag)) { pushBlock(node, { heading: true, level }); return; }
      if (tag === 'DIV' || tag === 'P') {
        if (node.querySelector('ul, ol')) { walk(node, level); return; }
        pushBlock(node, { level });
        return;
      }
      pushBlock(node, { level });
    });
  };

  walk(root, 0);
  return blocks;
}

function _lciPptxObsSlides(ctx, html) {
  const P = CONFIG.LCI.PPTX, C = P.COLOURS, F = P.FONT, G = P.GEO;
  const blocks = _lciPptxObsBlocks(html);
  if (!blocks.length) return;

  const cap = P.OBS.blocksPerSlide;
  for (let i = 0; i < blocks.length; i += cap) {
    const chunk = blocks.slice(i, i + cap);
    const slide = _lciPptxContentSlide(ctx,
      i === 0 ? 'Observations and Recommendations' : 'Observations and Recommendations (cont.)');
    const runs = [];
    chunk.forEach((b, n) => {
      b.runs.forEach((r, j) => {
        runs.push({
          text: r.text,
          options: {
            fontFace: _lciPptxFace(!!r.bold || b.heading),
            italic: !!r.italic, underline: !!r.underline,
            fontSize: b.heading ? F.obsHeading : F.body,
            color: b.heading ? C.navySteel : C.textBody,
            bullet: b.bullet ? { indent: P.OBS.bulletIndent } : false,
            indentLevel: b.bullet ? b.level : 0,
            breakLine: j === b.runs.length - 1,
          },
        });
      });
    });
    slide.addText(runs, {
      x: G.margin, y: _lciPptxBodyTop(false), w: P.LAYOUT.width - G.margin * 2,
      h: P.LAYOUT.height - _lciPptxBodyTop(false) - G.footerH - G.gap,
      fontFace: F.face, valign: 'top',
    });
  }
}

// ── Comparison section ───────────────────────────────────────────────
// Same gate as _lciReportComparisonHtml: 2+ models, all sharing a display
// currency. KPI rows come from LCI_COMPARE_KPIS (lci-report.js) so the deck
// and the on-screen compare table cannot drift apart.
function _lciPptxComparisonSlides(ctx, bundles) {
  if (bundles.length < 2) return;
  const ccy = bundles[0].model.DisplayCurrency;
  if (!bundles.every(b => b.model.DisplayCurrency === ccy)) return;

  const entries = bundles.map(b => ({
    name: b.model.Title,
    kpis: lciComputeKPIs(b.model, b.rows),
    comp: lciComputeModel(b.model, b.rows),
  }));

  _lciPptxNavySlide(ctx, 'Location Comparison', entries.map(e => e.name).join(' · '), false);

  const header = ['', ...entries.map(e => e.name)];
  const rows = LCI_COMPARE_KPIS.map(k => ({
    style: 'plain',
    cells: [k.label, ...entries.map(e => _lciKpiValueText(e.kpis[k.key], k.kind, ccy))],
  }));
  _lciPptxTableSlides(ctx, 'Key Metrics', header, rows,
    { labelFrac: CONFIG.LCI.PPTX.TABLE.compareLabelFrac, note: `All values in ${ccy || ''}.` });

  const horizon = Math.max(...entries.map(e => e.comp.cumulativeSpend.length));
  const labels = Array.from({ length: horizon }, (_, i) => `M${i + 1}`);
  const slide = _lciPptxContentSlide(ctx, 'Cumulative Spend', `All values in ${ccy || ''}.`);
  _lciPptxSpendChart(ctx, slide,
    entries.map(e => ({ name: e.name, values: e.comp.cumulativeSpend })), labels, ccy);
}

// ── Per-model slides ─────────────────────────────────────────────────

function _lciPptxModelSlides(ctx, bundle, single) {
  const m = bundle.model;
  const horizon = Number(m.HorizonMonths);
  const slices  = lciYearSlices(horizon);
  const c       = lciComputeModel(m, bundle.rows);
  const kpis    = lciComputeKPIs(m, bundle.rows);
  const ccy     = m.DisplayCurrency;

  _lciPptxNavySlide(ctx, m.Title, m.Location || '', false);
  _lciPptxKpiSlide(ctx, m, kpis);

  // Hiring Roadmap — one slide (set) per year slice.
  if (lciSections(m).coe) {
    slices.forEach(sl => {
      const labels = lciMonthLabels(m.StartMonth, horizon).slice(sl.start, sl.end);
      _lciPptxTableSlides(ctx,
        `Hiring Roadmap — ${m.Title}${sl.label ? ` · ${sl.label}` : ''}`,
        ['Role', ...labels.map((_l, i) => `M${sl.start + i + 1}`), 'Hires'],
        _lciPptxRoadmapRows(m, bundle.rows, bundle.milestones, sl),
        { grid: true, note: labels.length ? `${labels[0]} – ${labels[labels.length - 1]}` : '' });
    });
  }

  // Cost Model — one slide (set) per year slice.
  slices.forEach(sl => {
    const labels = c.labels.slice(sl.start, sl.end).map((_l, i) => `M${sl.start + i + 1}`);
    if (sl.label) labels.push(`Year ${sl.index}`);
    _lciPptxTableSlides(ctx,
      `Cost Model — ${m.Title}${sl.label ? ` · ${sl.label}` : ''}`,
      ['', ...labels],
      _lciPptxCostRows(m, bundle.rows, c, sl),
      { grid: true, note: `All values in ${ccy || ''}.` });
  });

  // Per-model chart in single-model decks only — the comparison chart covers
  // them otherwise, matching the HTML report's rule.
  if (single) {
    const labels = c.labels.map((_l, i) => `M${i + 1}`);
    const slide = _lciPptxContentSlide(ctx, `Cumulative Spend — ${m.Title}`, `All values in ${ccy || ''}.`);
    _lciPptxSpendChart(ctx, slide, [{ name: m.Title || 'Model', values: c.cumulativeSpend }], labels, ccy);
  }

  // Assumptions.
  const assumpRows = [
    ['Employer burden',            `${Math.round((m.EmployerBurdenPct || 0) * 1000) / 10}%`],
    ['Salary payments / year',     String(m.SalaryMonths || 12)],
    ['Notice period (months)',     String(m.NoticeMonths ?? 0)],
    ['Office cost / head / month', `${m.OfficeCostPerHead ?? 0} ${m.LocalCurrency || ''}`],
    ['EoR fee / head / month',     `${m.EoRFeePerHead ?? 0} ${m.DisplayCurrency || ''}`],
  ];
  if (m.LocalCurrency !== m.DisplayCurrency) {
    assumpRows.push([`FX rate (${m.LocalCurrency}→${m.DisplayCurrency})`, String(m.FXRateLocalToDisplay ?? '—')]);
  }
  _lciPptxTableSlides(ctx, `Model Guide and Assumptions — ${m.Title}`,
    ['Assumption', 'Value'],
    assumpRows.map(([k, v]) => ({ style: 'plain', cells: [k, v] })),
    { labelFrac: CONFIG.LCI.PPTX.TABLE.assumpLabelFrac,
      note: 'A hire in month N reaches payroll in month N + notice period. Costs shown from the payroll month onward.' });

  if (m.Assumptions) {
    _lciPptxObsNoteSlide(ctx, `Model Notes — ${m.Title}`, String(m.Assumptions));
  }
}

// Plain-text note slide (model Assumptions free text — already plain text,
// never markup, so it takes no DOMParser pass).
function _lciPptxObsNoteSlide(ctx, title, text) {
  const P = CONFIG.LCI.PPTX, C = P.COLOURS, F = P.FONT, G = P.GEO;
  const slide = _lciPptxContentSlide(ctx, title);
  slide.addText(text, {
    x: G.margin, y: _lciPptxBodyTop(false), w: P.LAYOUT.width - G.margin * 2,
    h: P.LAYOUT.height - _lciPptxBodyTop(false) - G.footerH - G.gap,
    fontFace: F.face, fontSize: F.body, color: C.textBody, valign: 'top',
  });
}

// ── Entry point ──────────────────────────────────────────────────────

async function lciExportReportPptx(btn) {
  if (!Array.isArray(_lciReportBundles) || !_lciReportBundles.length) {
    toast('No report open.', { type: 'error' });
    return;
  }
  if (btn) setButtonLoading(btn, 'Building…');
  try {
    const PptxGenJSLib = await _lciLoadPptxGen();
    const P = CONFIG.LCI.PPTX;
    const bundles = _lciReportBundles;
    const title   = document.querySelector('.lci-report-title')?.textContent || _lciReport.title || 'LCI Report';
    const clients = [...new Set(bundles.map(b => b.model.ClientName).filter(Boolean))];
    const exportDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const subtitle = `${clients.length === 1 ? clients[0] + ' x ' : ''}Momentum Global — ${exportDate}`;

    const [logo, swirl] = await Promise.all([
      _lciPptxAsset(P.ASSETS.logoWhite),
      _lciPptxAsset(P.ASSETS.swirl),
    ]);

    const pptx = new PptxGenJSLib();
    pptx.defineLayout(P.LAYOUT);
    pptx.layout  = P.LAYOUT.name;
    pptx.author  = 'Newton — Momentum Global';
    pptx.company = 'Momentum Global';
    pptx.title   = title;

    const ctx = { pptx, assets: { logo, swirl }, footer: subtitle };
    _lciPptxDefineMasters(pptx, ctx.assets);

    _lciPptxNavySlide(ctx, title, subtitle, true);

    // _lciEd is reassigned per model exactly as _lciReportHtml() does, so the
    // shared _lciEd-based helpers (_lciRowsOfType) resolve against the model
    // whose slides are being built. The last model stays loaded on exit —
    // the same state the on-screen report already leaves behind.
    const single = bundles.length === 1;
    bundles.forEach(b => {
      _lciEd = {
        model: b.model, rows: b.rows, milestones: b.milestones,
        deletedRowIds: [], deletedMilestoneIds: [],
        origRows: new Map(), origMilestones: new Map(),
        dirtySettings: false, dirtyRows: false, dirtyMilestones: false,
      };
      _lciPptxModelSlides(ctx, b, single);
    });

    _lciPptxComparisonSlides(ctx, bundles);
    _lciPptxObsSlides(ctx, window._lciReportObs || '');

    // Title passed RAW then filename-sanitised — apostrophes and ampersands
    // must survive (N-012d). Never escHtml a filename.
    await pptx.writeFile({ fileName: `LCI Report - ${safeFilename(title, 'Report')} - ${localDayISO()}.pptx` });
  } catch (e) {
    toast(`PowerPoint export failed: ${e.message}`, { type: 'error' });
  } finally {
    if (btn) clearButtonLoading(btn);
  }
}
