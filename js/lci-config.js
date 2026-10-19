// js/lci-config.js — LCI Cost Model and Lead Magnet configuration
// Extends CONFIG (config.js); loaded by sales.html only, directly before
// lci-model.js. Declarations only — nothing here is read at load time.

// ── LCI Cost Model ────────────────────────────────────────────────
// Defaults for new models; all editable per model in the Settings bar.
// NOTE: no CURRENCIES list here — LCI currency dropdowns (LocalCurrency
// and DisplayCurrency) are DERIVED from CONFIG.COUNTRY_CURRENCY via
// lciCurrencyOptions(CONFIG.COUNTRY_CURRENCY) in lci-model.js.
// Single source of truth: adding a new location/currency to
// COUNTRY_CURRENCY automatically flows into LCI (and the Add Role modal).
// LocalCurrency = CoE location (salaries, office, EoR, travel entered in
// it); DisplayCurrency = customer's modelling currency (legacy/one-offs/
// fees entered in it; all outputs render in it). FXRateLocalToDisplay
// converts the CoE side; ignored when the two currencies match.
CONFIG.LCI = {
  STATUSES:            ['Draft', 'Presented', 'Won', 'Lost'],
  SALARY_MONTHS:       [12, 13, 14],
  HORIZON_MIN:         3,
  HORIZON_MAX:         24,
  DEFAULTS: {
    HorizonMonths:     9,
    EmployerBurdenPct: 0.30,
    SalaryMonths:      12,
    OfficeCostPerHead: 300,
    EoRFeePerHead:     0,
    NoticeMonths:      1,
  },
  // CoE has no entry: it is always on (N-008 — the toggle was removed to stop
  // the roadmap being hidden mid-build by mistake). lciSections() forces it.
  // Order here drives the toggle row, which mirrors the section order down
  // the editor page.
  SECTION_LABELS: {
    travel:  'Travel',
    legacy:  'Legacy Team',
    oneoffs: 'Retention, Relocation & Severance',
    fees:    'Project Fees',
  },
  // Legacy row categories (N-010). Keys are stored in
  // LCIModelRows.LegacyCategory; blank means 'exiting', so rows created
  // before N-010 keep exactly the behaviour they had.
  //   label    — editor dropdown
  //   costLine — client-facing Cost Model row
  //   hcLine   — Excel Monthly Calc headcount-by-category row (N-263)
  LEGACY_CATEGORIES: {
    exiting:  { label: 'Exiting',  costLine: 'Exiting Team Costs',  hcLine: 'Exiting headcount'  },
    retained: { label: 'Retained', costLine: 'Retained Team Costs', hcLine: 'Retained headcount' },
  },

  // Monthly Cost Composition chart (N-261) — shared by the on-screen SVG
  // and the PowerPoint chart so the two can never label differently.
  //   CHART_STEPS           — Y-axis major-step ladder; the smallest step
  //                           giving <= CHART_MAX_MAJOR_LINES lines wins.
  //   COMPOSITION_LABELS    — series names, bottom-of-stack first.
  CHART_STEPS:           [5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000],
  CHART_MAX_MAJOR_LINES: 6,
  COMPOSITION_LABELS: {
    coe:    'CoE Operating Costs',
    legacy: 'Legacy Costs',
  },

  // ── Key Figures layout (N-278) ────────────────────────────────
  // Row groups -> figure keys, in display order. ONE list for the
  // PowerPoint Key Figures slide (tiles) and the compare table (on-screen,
  // report and PowerPoint), so the two cannot list different figures or
  // order them differently. Group
  // headings: KPI_TEXT.groups. Labels: KPI_TEXT.tiles (single model) and
  // KPI_TEXT.compare (compare table).
  KEY_FIGURES: [
    { group: 'investment', tiles: ['totalSpend', 'peakSpend', 'peakMonth', 'avgFee'] },
    { group: 'steady',     tiles: ['runMonthly', 'runAnnual', 'saving', 'costPerHead'] },
    { group: 'delivery',   tiles: ['totalHires', 'finalHeadcount', 'ramp', 'payback'] },
  ],

  // ── KPI text (N-263) ──────────────────────────────────────────
  // Every KPI label and display string, for the PowerPoint Key Figures
  // slide (tiles), the on-screen/PPTX compare table (compare) and the Excel
  // Key figures block (excel). Templates use {placeholders} — fillTemplate().
  // Steady state = CoE operating + retained legacy in the final month;
  // exiting legacy and project fees excluded.
  KPI_TEXT: {
    groups: {
      investment: 'Investment',
      steady:     'Steady state',
      delivery:   'Delivery',
    },
    // tiles.* may use {n} = model horizon in months (filled in lci-pptx.js).
    tiles: {
      totalSpend:     'Total spend ({n}-month horizon)',
      peakSpend:      'Peak monthly spend (excl. project fees)',
      peakMonth:      'Peak exposure month',
      avgFee:         'Average cost per hire',
      runMonthly:     'Run rate / month — CoE vs Legacy',
      runAnnual:      'Run rate / year — CoE vs Legacy',
      saving:         'Annual saving at steady state',
      costPerHead:    'Cost per head / month — CoE vs Legacy',
      totalHires:     'Total hires',
      finalHeadcount: 'Final CoE headcount',
      ramp:           'Time to full ramp',
      payback:        'Projected breakeven (investment recovered)',
    },
    // Compare-table row labels (N-278): the same 12 keys as `tiles`, worded
    // for a column-per-model table. The legacy comparison sits inside the
    // cell (compareCell below), not in the label.
    compare: {
      totalSpend:     'Total spend',
      peakSpend:      'Peak monthly spend (excl. project fees)',
      peakMonth:      'Peak exposure month',
      avgFee:         'Average cost per hire',
      runMonthly:     'Monthly run rate',
      runAnnual:      'Annual run rate',
      saving:         'Annual saving at steady state',
      costPerHead:    'Monthly cost per head',
      totalHires:     'Total hires',
      finalHeadcount: 'Final CoE headcount',
      ramp:           'Time to full ramp',
      payback:        'Projected breakeven (investment recovered)',
    },
    // Compare-table cell templates (N-278). The run-rate note reuses
    // vsLegacy; ramp reuses rampHired / rampPayroll.
    compareCell: {
      withNote: '{v} ({note})',
      saving:   '{p}% saving vs Legacy',
      higher:   '{p}% higher than Legacy',
      ramp:     '{hired}, {payroll}',
    },
    compareTitle: 'Key Figures — Comparison',
    excel: {
      totalSpend:     'Total spend over horizon',
      steadyMonthly:  'Steady-state monthly run-rate (CoE + retained)',
      steadyAnnual:   'Steady-state annual run-rate',
      totalHires:     'Total hires',
      rampHired:      'Time to full ramp — hired (last hire month)',
      rampPayroll:    'Time to full ramp — on payroll (first month all hires paid)',
      finalHeadcount: 'Final CoE headcount',
      costPerHead:    'Cost per head (steady state, CoE + retained heads)',
      peakMonth:      'Peak exposure month',
      peakSpend:      'Peak monthly spend (excl. project fees)',
      peakSeries:     'Monthly spend excl. project fees (peak series)',
    },
    rampHired:     'Hired: {m}',
    rampPayroll:   'On payroll: {m}',
    vsLegacy:      'vs Legacy {v}',
    pctLower:      '{p}% lower',
    pctHigher:     '{p}% higher',
    savingPct:     '{p}% of legacy',
    noPayback:     'No payback',
    noLegacy:      'No legacy baseline',
    notReached:    'Steady state not reached within the horizon. Run-rate figures use the final month.',
    // Decimal places: saving % reads 33.1%, cost-per-head % reads 35%.
    pctDp: { saving: 1, costPerHead: 0 },
    // Assumptions notice rows — lciNoticeRowsText().
    noticeDefault:     'Notice period — default',
    noticeGroup:       'Notice period — {n}',
    noticeDefaultNote: 'all other roles',
    monthOne:          '1 month',
    monthMany:         '{n} months',
  },

  // ── Excel export (N-030) ──────────────────────────────────────
  // ExcelJS, lazy-loaded on first click only (~950KB — never on page
  // render). Vendored in js/vendor/ (N-289) — never a CDN. To upgrade, change
  // the file, js/vendor/VERSIONS.md and package.json together.
  EXCEL: {
    SRC: 'js/vendor/exceljs-4.4.0.min.js',
    // Tab order is the order the builders run in — see lci-excel.js.
    SHEETS: {
      assumptions: 'Assumptions',
      roadmap:     'CoE Roadmap',
      legacy:      'Legacy Team',
      oneoffs:     'One-offs & Fees',
      calc:        'Monthly Calc',
      output:      'Output Summary',
      milestones:  'Milestones',
    },
    // ARGB, not CSS hex. Deliberate, documented exception to "no hex in
    // JS": a workbook cannot read style.css custom properties, so the
    // palette has to live somewhere in config — here, once, rather than
    // scattered through the sheet builders. `navy` must stay in step with
    // .data-table th (#0A0B44) in style.css.
    COLOURS: {
      navy:         'FF0A0B44',
      navyText:     'FFFFFFFF',
      headerFill:   'FFEDEFF5',
      subtotalFill: 'FFE4E8F2',
      totalFill:    'FFD6DCEC',
      inputFill:    'FFDCE9F7',
      derivedFill:  'FFF5F5F5',
      bandFill:     'FFEFEFEF',
    },
    // {ccy} is replaced with the model's currency code at build time —
    // a code, never a locale symbol, so EUR/RON/GBP all read unambiguously.
    FORMATS: {
      money:   '"{ccy}" #,##0',
      money2:  '"{ccy}" #,##0.00',
      integer: '#,##0',
      percent: '0.0%',
      rate:    '#,##0.0000',
    },
  },

  // ── PowerPoint export (N-224) ─────────────────────────────────
  // pptxgenjs, lazy-loaded on first click only (~450KB — never on page
  // render). Vendored in js/vendor/ (N-289) — never a CDN. To upgrade, change
  // the file, js/vendor/VERSIONS.md and package.json together. Use the *bundle*
  // build — it carries JSZip inside it, where pptxgen.min.js expects a
  // separate JSZip global that this app does not load.
  PPTX: {
    SRC: 'js/vendor/pptxgenjs-4.0.1.bundle.js',
    // Inches. 13.333 x 7.5 is 16:9 widescreen — PowerPoint's own default.
    LAYOUT:  { name: 'LCI16x9', width: 13.333, height: 7.5 },
    MASTERS: { navy: 'LCI_NAVY', content: 'LCI_CONTENT' },
    ASSETS: {
      logoWhite: 'momentum-symbol-and-name-global-white.png',
      swirl:     'mg-visual-swirl-report.png',
    },
    // Plain 6-digit hex, NO alpha prefix. Deliberately NOT the ARGB form
    // CONFIG.LCI.EXCEL.COLOURS uses — pptxgenjs rejects 8-character values.
    // Same documented exception to "no hex in JS" the Excel export carries:
    // a deck cannot read style.css. `navy` must stay in step with
    // .data-table th (#0A0B44); `series` mirrors LCI_REPORT_COLOURS.
    COLOURS: {
      navy:         '0A0B44',
      navySteel:    '1B3A5C',
      navyText:     'FFFFFF',
      navyMuted:    'C7CBDE',
      paper:        'FFFFFF',
      accent:       'E8703A',
      subtotalFill: 'E4E8F2',
      totalFill:    'D6DCEC',
      bandFill:     'EFEFEF',
      tableBorder:  'E0E0E0',
      textBody:     '1A1A2E',
      textMuted:    '888888',
      series: ['1B3A5C', 'E8703A', '2E8B8B', '7B5EA7', 'B0578D'],
    },
    // Polymath, matching the app. It ships as three SEPARATE families —
    // 'Polymath' (regular), 'Polymath Medium', 'Polymath Semibold', each
    // with subfamily 'Regular'. The browser stitches them into one weighted
    // family via @font-face; PowerPoint cannot, so `bold: true` on
    // 'Polymath' would give synthetic faux-bold. Bold text switches FACE to
    // faceBold instead — see _lciPptxFace() in lci-pptx.js.
    //
    // gridHeader / gridCell are the month-grid sizes and mirror the print
    // stylesheet's `.lci-grid { font-size: var(--fs-10) }` step; the wider
    // tableHeader / tableCell serve the narrow tables (Assumptions, Key
    // Metrics), which @media print leaves at their normal size. 9pt is the
    // largest size at which the widest realistic figure still fits a column
    // of the densest table — measured, not guessed.
    FONT: {
      face:     'Polymath',
      faceBold: 'Polymath Semibold',
      coverTitle: 36, coverSub: 15,
      dividerTitle: 28, dividerSub: 14,
      slideTitle: 20, note: 11,
      gridHeader: 9,  gridCell: 9,
      tableHeader: 11, tableCell: 11,
      kpiValue: 20, kpiLabel: 10,
      kpiValueSm: 14, kpiSub: 10, kpiGroup: 11,
      body: 13, obsHeading: 16,
      chartLabel: 10, footer: 9,
    },
    // Slide geometry, inches. `margin` is the content slides' side margin —
    // halved from 0.6 so the month grids get the full width they need (see
    // the note on TABLE below). `navyMargin` is deliberately NOT halved: the
    // cover and divider pages have no table to widen, and their logo/title
    // composition mirrors the Momentum brand slide.
    GEO: {
      margin: 0.3, navyMargin: 0.6, gap: 0.12, rule: 0.03,
      logoW: 2.2, logoH: 0.5,
      swirlW: 4.6, swirlH: 4.6,
      titleBlockH: 1.9, titleH: 1.2, subH: 0.5,
      headingH: 0.5, noteH: 0.3,
      footerH: 0.45, footerPad: 0.06, footerTextH: 0.3, slideNumW: 0.6,
    },
    // labelColW is the month grids' fixed first column (the print rule caps
    // .lci-grid--roadmap td:first-child at 180px ≈ 1.9in). The two Frac
    // values are the narrow tables' proportional first column, as
    // .lci-assump (45%) and .lci-compare (26%) already use.
    // rowH is the height of EVERY row — header, body, subtotal and total
    // alike; the hierarchy is shading and weight, never height. 0.21in is a
    // 9pt line (0.15in) plus cellMargin's 2pt top and bottom. PowerPoint
    // treats rowH as a minimum and grows any row that needs more, so the
    // insets have to come down with it or the rows drift apart again —
    // cellMargin is [top, right, bottom, left] in POINTS and replaces
    // pptxgenjs's default 0.05in/0.1in, which is also what was eating the
    // width the widest figures needed. rowsPerSlide follows from the height:
    // (6.93 - 1.22) / 0.21 = 27 rows, minus the header.
    TABLE: {
      labelColW: 1.9, rowH: 0.21, rowsPerSlide: 26, borderPt: 0.5,
      cellMargin: [2, 3, 2, 3],
      // N-295: Cost Model table only. Its longest label ("   Retention, Relocation &
      // Severance", ~140pt at 9pt Polymath) wraps in labelColW's 1.9in; 2.1in clears it.
      costLabelColW: 2.1,
      assumpLabelFrac: 0.45, compareLabelFrac: 0.26,
    },
    // Key Figures (N-263): 3 groups x (groupH + tileH) + 2 x gap = 5.32in,
    // inside the 5.71in between _lciPptxBodyTop(true) (1.22) and the footer
    // band (7.5 - footerH - GEO.gap = 6.93). Tile interior: valuePad +
    // valueH + subH + labelH = 1.35 <= tileH. labelH holds two 10pt lines
    // (N-264: the breakeven label can wrap).
    KPI:   { perRow: 4, gap: 0.14, tileH: 1.4, radius: 0.06, valuePad: 0.15, valueH: 0.5, subH: 0.3, labelH: 0.4, groupH: 0.28 },
    OBS:   { blocksPerSlide: 12, bulletIndent: 18 },
    CHART: { lineSize: 2, gridSize: 1 },
  },
};

// ── LCI Lead Magnet ───────────────────────────────────────────────
// Disciplines for the Lead Magnet location comparator. key = internal id,
// label = UI text, col = LCILocations salary column name. Add a discipline
// here + a matching Sal_* column on the list to extend.
CONFIG.LCI_DISCIPLINES = [
  { key: 'softwareEngineering', label: 'Software Engineering', col: 'Sal_SoftwareEngineering' },
  { key: 'technology',          label: 'Technology',           col: 'Sal_Technology' },
  { key: 'product',             label: 'Product',              col: 'Sal_Product' },
  { key: 'salesGtm',            label: 'Sales/GTM',            col: 'Sal_SalesGTM' },
  { key: 'customerSuccess',     label: 'Customer Success',     col: 'Sal_CustomerSuccess' },
  { key: 'finance',             label: 'Finance',              col: 'Sal_Finance' },
  { key: 'marketing',           label: 'Marketing',            col: 'Sal_Marketing' },
  { key: 'operations',          label: 'Operations',           col: 'Sal_Operations' },
  { key: 'hr',                  label: 'HR',                   col: 'Sal_HR' },
  { key: 'legal',               label: 'Legal',                col: 'Sal_Legal' },
];
