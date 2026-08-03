// js/lci-excel.js — LCI Cost Model → branded, formula-driven .xlsx (N-030)
//
// Loaded after lci-summary.js; reads the open model from _lciEd (model / rows /
// milestones) and writes a 7-sheet workbook.
//
// TWO RULES THIS FILE LIVES BY
//
// 1. It never recalculates anything. Every number comes from lciComputeModel()
//    / lciComputeKPIs() in lci-model.js. This file's only job is to express
//    those same numbers AS EXCEL FORMULAS and carry the JS-computed value as
//    the formula's cached result. If you find yourself writing arithmetic here
//    that lci-model.js already does, you are creating a second calc layer that
//    will drift.
//
// 2. Every formula cell is written as { formula, result }. The formula makes
//    the workbook live; the cached result means the file is correct the instant
//    it opens (ExcelJS writes no calc chain, so a formula-only cell shows 0 in
//    some viewers until recalculation) AND makes the export self-checking — if
//    a formula and the JS ever disagree, the divergence shows on open rather
//    than hiding.
//
// NOTE ON ESCAPING: cells hold values, not markup. Do NOT escHtml anything into
// a cell — it puts a literal &amp; in the client's spreadsheet. This is the one
// place in the LCI codebase where the N-012 rule inverts. The only escaping
// here is doubling " inside Excel string literals (_lciXlLit).

// ── Lazy loader ──────────────────────────────────────────────────────
let _lciExcelJsPromise = null;

function _lciLoadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (_lciExcelJsPromise) return _lciExcelJsPromise;
  _lciExcelJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CONFIG.LCI.EXCEL.CDN;
    s.onload = () => window.ExcelJS
      ? resolve(window.ExcelJS)
      : reject(new Error('Excel library loaded but did not register.'));
    s.onerror = () => {
      _lciExcelJsPromise = null;   // allow a retry on the next click
      reject(new Error('Could not load the Excel library. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return _lciExcelJsPromise;
}

// ── Low-level sheet helpers ──────────────────────────────────────────

// 1-based column number → column letter(s).
function _lciXlCol(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// A sheet name inside a formula. Always quoted — every LCI sheet name that
// contains a space or an & would otherwise break the reference.
function _lciXlSheet(name) { return `'${String(name).replace(/'/g, "''")}'`; }

// A string literal inside a formula: " must be doubled.
function _lciXlLit(s) { return `"${String(s ?? '').replace(/"/g, '""')}"`; }

function _lciXlMoneyFmt(ccy) {
  return CONFIG.LCI.EXCEL.FORMATS.money.replace('{ccy}', String(ccy || ''));
}

// The single cell writer. `value` is a raw value, or { formula, result }.
function _lciXlSet(ws, row, col, value, o = {}) {
  const cell = ws.getCell(row, col);
  if (value && typeof value === 'object' && value.formula !== undefined) {
    cell.value = { formula: value.formula, result: value.result };
  } else {
    cell.value = value;
  }
  if (o.fmt) cell.numFmt = o.fmt;
  if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
  if (o.bold || o.color || o.size) {
    cell.font = { bold: !!o.bold, size: o.size || 11, ...(o.color ? { color: { argb: o.color } } : {}) };
  }
  if (o.align) cell.alignment = { horizontal: o.align, wrapText: !!o.wrap, vertical: 'middle' };
  else if (o.wrap) cell.alignment = { wrapText: true, vertical: 'middle' };
  if (o.note) cell.note = o.note;
  if (o.topBorder) cell.border = { top: { style: 'thin', color: { argb: CONFIG.LCI.EXCEL.COLOURS.navy } } };
  return cell;
}

// Fill a whole row band (used for banners and header strips).
function _lciXlBand(ws, row, lastCol, fill) {
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  }
}

// Month header strip: label column(s) then one column per month.
function _lciXlMonthHeader(ws, row, firstMonthCol, labels, leadLabels) {
  const C = CONFIG.LCI.EXCEL.COLOURS;
  (leadLabels || []).forEach((l, i) => _lciXlSet(ws, row, i + 1, l,
    { bold: true, color: C.navyText, fill: C.navy, wrap: true, align: 'left' }));
  labels.forEach((l, i) => _lciXlSet(ws, row, firstMonthCol + i, l,
    { bold: true, color: C.navyText, fill: C.navy, wrap: true, align: 'center' }));
  ws.getRow(row).height = 30;
}

// ── Sheet 1: Assumptions ─────────────────────────────────────────────
// Every named cell defined here drives the rest of the workbook. Edit one and
// the model recalculates — that is the whole point of the export.
function _lciXlAssumptions(ctx) {
  const { wb, model: m } = ctx;
  const E = CONFIG.LCI.EXCEL, C = E.COLOURS;
  const ws = wb.addWorksheet(E.SHEETS.assumptions);
  ws.columns = [{ width: 38 }, { width: 24 }, { width: 78 }];

  _lciXlSet(ws, 1, 1, 'LCI Cost Model — internal working file',
    { bold: true, size: 14, color: C.navyText });
  _lciXlBand(ws, 1, 3, C.navy);

  const meta = [
    ['Model',                          m.Title || ''],
    ['Client',                         m.ClientName || ''],
    ['CoE location',                   m.Location || ''],
    ['Status',                         m.Status || ''],
    // YYYY-MM as TEXT. Never a Date object — that reintroduces the SharePoint
    // UTC→BST shift the text format exists to avoid.
    ['Start month (YYYY-MM)',          String(m.StartMonth || '')],
    ['Horizon (months)',               Number(m.HorizonMonths) || 0],
    ['Local currency (CoE side)',      m.LocalCurrency || ''],
    ['Display currency (all outputs)', m.DisplayCurrency || ''],
    ['Exported',                       new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })],
  ];
  let r = 3;
  const horizonRow = r + meta.findIndex(x => x[0].indexOf('Horizon') === 0);
  meta.forEach(([k, v]) => {
    _lciXlSet(ws, r, 1, k, { bold: true });
    _lciXlSet(ws, r, 2, v);
    r++;
  });
  _lciXlSet(ws, horizonRow, 2, Number(m.HorizonMonths) || 0, {
    fmt: E.FORMATS.integer, fill: C.inputFill,
    note: 'Used by the legacy run-to-horizon formulas. Editing it will NOT add or remove month columns — re-export from Newton to change the horizon.',
  });
  ctx.named.Horizon = `${_lciXlSheet(E.SHEETS.assumptions)}!$B$${horizonRow}`;

  r += 1;
  _lciXlSet(ws, r, 1, 'Assumptions — edit the blue cells and the whole workbook recalculates',
    { bold: true, color: C.navyText });
  _lciXlBand(ws, r, 3, C.navy);
  r++;

  const localMoney = _lciXlMoneyFmt(m.LocalCurrency);
  const dispMoney  = _lciXlMoneyFmt(m.DisplayCurrency);
  const defs = [
    ['Burden',        'Employer burden',                                        Number(m.EmployerBurdenPct) || 0, E.FORMATS.percent,
      'CoE roles only. Legacy rows are customer-side and already fully loaded — they deliberately do NOT use this (N-017).'],
    ['SalaryMonths',  'Salary payments per year',                               Number(m.SalaryMonths) || 12,     E.FORMATS.integer,
      '12, 13 or 14. Grosses up CoE base salary only — never legacy.'],
    ['NoticeDefault', 'Notice period (months)',                                 Number(m.NoticeMonths) || 0,      E.FORMATS.integer,
      'Model default. A hire in month N reaches payroll in month N + notice. Per-role overrides are on the CoE Roadmap sheet; a blank override inherits this, an explicit 0 means "starts in the hire month".'],
    ['OfficePerHead', `Office cost / head / month (${m.LocalCurrency || ''})`,   Number(m.OfficeCostPerHead) || 0, localMoney,
      'Entered in LOCAL currency — converted by FXRate.'],
    ['EoRPerHead',    `EoR fee / head / month (${m.DisplayCurrency || ''})`,     Number(m.EoRFeePerHead) || 0,     dispMoney,
      'Entered in DISPLAY currency (customer-side provider fee) — NOT FX-converted.'],
    ['FXRate',        `FX rate (1 ${m.LocalCurrency || ''} = X ${m.DisplayCurrency || ''})`, lciFxRate(m),         E.FORMATS.rate,
      'Display = local × rate. MULTIPLY. (The LCI Lead Magnet uses the opposite, divide-by convention — do not conflate the two.)'],
  ];
  defs.forEach(([name, label, val, fmt, note]) => {
    _lciXlSet(ws, r, 1, label, { bold: true });
    _lciXlSet(ws, r, 2, val, { fmt, fill: C.inputFill, note });
    ctx.named[name] = `${_lciXlSheet(E.SHEETS.assumptions)}!$B$${r}`;
    r++;
  });

  // Section switches. These exist because Monthly Calc keeps every per-row line
  // populated even when its section is off (that is the audit sheet's job), so
  // the subtotals need something to switch them off with. Without them the
  // cached 0 from lciComputeModel() and the live SUM over the row block
  // disagree, and the workbook changes its own totals the first time anything
  // recalculates. Only the six series lciComputeModel() actually gates are
  // multiplied by these — see the notes in _lciXlCalc.
  r += 1;
  _lciXlSet(ws, r, 1, 'Section switches — 1 includes the section, 0 excludes it',
    { bold: true, color: C.navyText });
  _lciXlBand(ws, r, 3, C.navy);
  r++;
  const sec = lciSections(m);
  // CoE has no switch: it is always on (N-008).
  [['TravelOn', 'travel'], ['LegacyOn', 'legacy'], ['OneoffsOn', 'oneoffs'], ['FeesOn', 'fees']]
    .forEach(([name, key]) => {
      _lciXlSet(ws, r, 1, `${CONFIG.LCI.SECTION_LABELS[key]} included?`, { bold: true });
      _lciXlSet(ws, r, 2, sec[key] ? 1 : 0, {
        fmt: E.FORMATS.integer, fill: C.inputFill,
        note: 'Mirrors the section toggle in Newton. Set to 0 to strip this section out of the totals, or 1 to bring it back in — the underlying rows stay on their own sheets either way.',
      });
      ctx.named[name] = `${_lciXlSheet(E.SHEETS.assumptions)}!$B$${r}`;
      r++;
    });

  r += 1;
  _lciXlSet(ws, r++, 1, 'How to read this workbook', { bold: true, size: 12 });
  [
    ['Blue cells', 'Inputs. Edit them — everything downstream recalculates.'],
    ['White / grey cells', 'Formulas. Do not overwrite; you will break the model.'],
    ['Currency', `The CoE side (salaries, office) is entered in ${m.LocalCurrency || '—'} and converted at FXRate. EoR fees, travel, legacy salaries, one-offs and fees are entered directly in ${m.DisplayCurrency || '—'}. Every output figure is in ${m.DisplayCurrency || '—'}.`],
    ['Monthly Calc', 'The audit sheet — every cost line for every month, including sections switched off in Newton.'],
    ['Output Summary', 'Mirrors the client PDF line for line. If it disagrees with the PDF, the export is wrong.'],
    ['Total Monthly Spend', 'CoE operating + legacy + one-offs + fees, with CoE operating counted ONCE. The original Barcelona workbook double-counted it; that bug is deliberately not reproduced, so totals here are lower than that spreadsheet for the same inputs.'],
  ].forEach(([k, v]) => {
    _lciXlSet(ws, r, 1, k, { bold: true });
    _lciXlSet(ws, r, 3, v, { wrap: true });
    r++;
  });

  if (m.Assumptions) {
    r += 1;
    _lciXlSet(ws, r++, 1, 'Model notes', { bold: true, size: 12 });
    _lciXlSet(ws, r, 1, String(m.Assumptions), { wrap: true });
    ws.getRow(r).height = 90;
    ws.mergeCells(r, 1, r, 3);
  }
}

// ── Sheet 2: CoE Roadmap ─────────────────────────────────────────────
// Columns: A Role | B Level | C Salary (local) | D Bonus % | E Notice override
//          F Effective notice | G Cost/mo (local) | H Cost/mo (display)
//          I.. months | (9+h) Total hires
// Mirrors the editor grid so a reader can map one to the other. Teams appear as
// band rows (as in the editor) rather than a repeated column.
function _lciXlRoadmap(ctx) {
  const { wb, model: m, horizon: h } = ctx;
  const E = CONFIG.LCI.EXCEL, C = E.COLOURS;
  const ws = wb.addWorksheet(E.SHEETS.roadmap);
  const FIRST_M = 9, totalCol = FIRST_M + h;
  const lastMonthL = _lciXlCol(FIRST_M + h - 1);

  ws.columns = [{ width: 30 }, { width: 12 }, { width: 16 }, { width: 10 }, { width: 12 },
                { width: 12 }, { width: 16 }, { width: 16 },
                ...Array.from({ length: h }, () => ({ width: 11 })), { width: 12 }];
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  _lciXlSet(ws, 1, 1, `Hiring roadmap — hires per month. Salaries in ${m.LocalCurrency || ''}.`,
    { bold: true, color: C.navyText });
  _lciXlBand(ws, 1, totalCol, C.navy);

  _lciXlMonthHeader(ws, 2, FIRST_M, ctx.labels,
    ['Role', 'Level', `Annual salary (${m.LocalCurrency || ''})`, 'Bonus %', 'Notice override',
     'Effective notice', `Cost/mo (${m.LocalCurrency || ''})`, `Cost/mo (${m.DisplayCurrency || ''})`]);
  _lciXlSet(ws, 2, totalCol, 'Total hires',
    { bold: true, color: C.navyText, fill: C.navy, wrap: true, align: 'center' });
  ws.getCell(2, 5).note = 'Blank inherits the model default (NoticeDefault). An explicit 0 is a real value — the role starts in its hire month.';

  const localMoney = _lciXlMoneyFmt(m.LocalCurrency);
  const dispMoney  = _lciXlMoneyFmt(m.DisplayCurrency);
  const fx = lciFxRate(m);

  let r = 3;
  ctx.coeMeta = [];
  const teams = _lciTeamsInOrder();
  for (const team of teams) {
    _lciXlSet(ws, r, 1, team, { bold: true });
    _lciXlBand(ws, r, totalCol, C.bandFill);
    r++;
    for (const row of _lciCoeRows().filter(x => (x.Team || 'Other') === team)) {
      const notice  = lciRowNotice(row, m);
      const hires   = lciMonthValues(row, h);
      const cum     = lciCumulativeHeadcount(row, h, notice);
      const monthly = lciMonthlyCost(row, m);

      _lciXlSet(ws, r, 1, row.Title || '');
      _lciXlSet(ws, r, 2, row.CareerLevel || '');
      _lciXlSet(ws, r, 3, Number(row.AnnualSalary) || 0, { fmt: localMoney, fill: C.inputFill });
      _lciXlSet(ws, r, 4, Number(row.BonusPct) || 0,      { fmt: E.FORMATS.percent, fill: C.inputFill });
      // Blank override must stay BLANK, not 0 — the IF below tests for "".
      const ov = row.NoticeMonthsOverride;
      const hasOv = ov !== null && ov !== undefined && ov !== '' && Number.isFinite(Number(ov));
      _lciXlSet(ws, r, 5, hasOv ? Number(ov) : '', { fmt: E.FORMATS.integer, fill: C.inputFill });

      _lciXlSet(ws, r, 6, { formula: `IF(E${r}="",NoticeDefault,E${r})`, result: notice },
        { fmt: E.FORMATS.integer, fill: C.derivedFill });
      _lciXlSet(ws, r, 7,
        { formula: `((C${r}*SalaryMonths/12)+C${r}*D${r})/12*(1+Burden)`, result: monthly },
        { fmt: localMoney, fill: C.derivedFill });
      _lciXlSet(ws, r, 8, { formula: `G${r}*FXRate`, result: monthly * fx },
        { fmt: dispMoney, fill: C.derivedFill });

      for (let i = 0; i < h; i++) {
        _lciXlSet(ws, r, FIRST_M + i, hires[i] || 0, { fmt: E.FORMATS.integer, fill: C.inputFill, align: 'center' });
      }
      _lciXlSet(ws, r, totalCol,
        { formula: `SUM(I${r}:${lastMonthL}${r})`, result: hires.reduce((a, b) => a + b, 0) },
        { fmt: E.FORMATS.integer, fill: C.derivedFill, align: 'center' });

      ctx.coeMeta.push({ row, excelRow: r, team, notice, cum, monthlyLocal: monthly, hires });
      r++;
    }
  }
  if (!ctx.coeMeta.length) _lciXlSet(ws, r++, 1, 'No CoE roles on this model.', { color: C.navy });

  ctx.roadmap = { firstMonthCol: FIRST_M, totalCol, firstDataRow: 3, lastRow: r - 1, lastMonthL };
}

// ── Sheet 3: Legacy Team ─────────────────────────────────────────────
// Columns: A Role | B Team | C Category | D Qty | E Salary (display)
//          F Bonus % | G Exit month | H Effective exit | I Cost/mo
// CRITICAL (N-017): column I must NOT reference Burden or SalaryMonths. Legacy
// rows are customer-side, entered fully loaded in DisplayCurrency. Referencing
// the CoE assumptions here re-opens a fixed bug that overstated every legacy
// figure by 1 + burden.
function _lciXlLegacy(ctx) {
  const { wb, model: m } = ctx;
  const E = CONFIG.LCI.EXCEL, C = E.COLOURS;
  const ws = wb.addWorksheet(E.SHEETS.legacy);
  ws.columns = [{ width: 30 }, { width: 20 }, { width: 14 }, { width: 8 }, { width: 18 },
                { width: 10 }, { width: 12 }, { width: 14 }, { width: 18 }];
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  _lciXlSet(ws, 1, 1,
    `Legacy team — fully loaded salaries in ${m.DisplayCurrency || ''}. Exiting rows run M1 → exit month; Retained rows run to the horizon.`,
    { bold: true, color: C.navyText });
  _lciXlBand(ws, 1, 9, C.navy);
  ['Role', 'Team', 'Category', 'Qty', `Annual salary (${m.DisplayCurrency || ''})`, 'Bonus %',
   'Exit month', 'Effective exit', `Cost/mo (${m.DisplayCurrency || ''})`]
    .forEach((l, i) => _lciXlSet(ws, 2, i + 1, l, { bold: true, color: C.navyText, fill: C.navy, wrap: true }));
  ws.getCell(2, 8).note = 'Retained rows ignore any stored exit month by design (N-010) — they stay in post to the horizon.';
  ws.getCell(2, 9).note = 'Legacy rows are customer-side and already fully loaded: employer burden and 13th/14th-month gross-up are CoE settings and are deliberately not applied here (N-017).';

  const dispMoney = _lciXlMoneyFmt(m.DisplayCurrency);
  let r = 3;
  ctx.legacyMeta = [];
  for (const row of _lciRowsOfType('legacy')) {
    const cat = lciLegacyCategory(row);
    const qty = Number(row.Quantity) || 1;
    const effExit = cat === 'retained' ? ctx.horizon : (Number(row.ExitMonth) || ctx.horizon);
    const cost = lciLegacyMonthlyCost(row) * qty;

    _lciXlSet(ws, r, 1, row.Title || '');
    _lciXlSet(ws, r, 2, row.Team || '');
    _lciXlSet(ws, r, 3, CONFIG.LCI.LEGACY_CATEGORIES[cat].label, { fill: C.inputFill });
    _lciXlSet(ws, r, 4, qty, { fmt: E.FORMATS.integer, fill: C.inputFill });
    _lciXlSet(ws, r, 5, Number(row.AnnualSalary) || 0, { fmt: dispMoney, fill: C.inputFill });
    _lciXlSet(ws, r, 6, Number(row.BonusPct) || 0, { fmt: E.FORMATS.percent, fill: C.inputFill });
    _lciXlSet(ws, r, 7, Number(row.ExitMonth) || '', { fmt: E.FORMATS.integer, fill: C.inputFill });
    _lciXlSet(ws, r, 8, {
      formula: `IF(LOWER(C${r})=${_lciXlLit('retained')},Horizon,IF(G${r}="",Horizon,G${r}))`,
      result: effExit,
    }, { fmt: E.FORMATS.integer, fill: C.derivedFill });
    _lciXlSet(ws, r, 9, { formula: `(E${r}+E${r}*F${r})/12*D${r}`, result: cost },
      { fmt: dispMoney, fill: C.derivedFill });

    ctx.legacyMeta.push({ row, excelRow: r, cat, qty, cost, effExit });
    r++;
  }
  if (!ctx.legacyMeta.length) _lciXlSet(ws, r++, 1, 'No legacy roles on this model.', { color: C.navy });
  ctx.legacy = { firstDataRow: 3, lastRow: r - 1 };
}

// ── Sheet 4: One-offs & Fees ─────────────────────────────────────────
// Three labelled blocks (Retention & Relocation / Project Fees / Travel), each
// with the full month grid. Months start at column B here AND on Monthly Calc,
// so the column letters line up between the two sheets.
function _lciXlOneoffs(ctx) {
  const { wb, model: m, horizon: h } = ctx;
  const E = CONFIG.LCI.EXCEL, C = E.COLOURS;
  const ws = wb.addWorksheet(E.SHEETS.oneoffs);
  const totalCol = 2 + h;
  ws.columns = [{ width: 34 }, ...Array.from({ length: h }, () => ({ width: 13 })), { width: 15 }];
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  _lciXlSet(ws, 1, 1, `Month-by-month inputs — all values in ${m.DisplayCurrency || ''} (customer-side, no FX conversion).`,
    { bold: true, color: C.navyText });
  _lciXlBand(ws, 1, totalCol, C.navy);
  _lciXlMonthHeader(ws, 2, 2, ctx.labels, ['Item']);
  _lciXlSet(ws, 2, totalCol, 'Total', { bold: true, color: C.navyText, fill: C.navy, align: 'center' });

  const dispMoney = _lciXlMoneyFmt(m.DisplayCurrency);
  const lastML = _lciXlCol(1 + h);
  let r = 3;
  ctx.oneoffBlocks = {};

  const block = (type, title, note) => {
    _lciXlSet(ws, r, 1, title, { bold: true });
    _lciXlBand(ws, r, totalCol, C.subtotalFill);
    if (note) ws.getCell(r, 1).note = note;
    r++;
    const first = r;
    const rowsOf = _lciRowsOfType(type);
    for (const row of rowsOf) {
      const vals = lciMonthValues(row, h);
      _lciXlSet(ws, r, 1, row.Title || title);
      for (let i = 0; i < h; i++) _lciXlSet(ws, r, 2 + i, vals[i] || 0, { fmt: dispMoney, fill: C.inputFill });
      _lciXlSet(ws, r, totalCol, { formula: `SUM(B${r}:${lastML}${r})`, result: vals.reduce((a, b) => a + b, 0) },
        { fmt: dispMoney, fill: C.derivedFill });
      r++;
    }
    const last = r - 1;
    if (!rowsOf.length) { _lciXlSet(ws, r++, 1, '(none)', { color: C.navy }); }
    r++; // spacer
    return { first, last, rows: rowsOf.map((row, i) => ({ row, excelRow: first + i })) };
  };

  // Block titles come from CONFIG.LCI.SECTION_LABELS — the same labels the
  // editor's section toggles use. Single source of truth.
  const SLB = CONFIG.LCI.SECTION_LABELS;
  ctx.oneoffBlocks.oneoff = block('oneoff', SLB.oneoffs);
  ctx.oneoffBlocks.fee    = block('fee',    SLB.fees);
  ctx.oneoffBlocks.travel = block('travel', SLB.travel,
    'Entered here for convenience, but Travel belongs to CoE Operating in the output — matching the app (N-009).');
}

// ── Sheet 5: Monthly Calc ────────────────────────────────────────────
// The engine and the audit sheet. UNCONDITIONAL: every line for every month
// regardless of which sections are toggled off in Newton. Months occupy
// columns B..(B+h-1); a key column sits to the right of the grid and is used by
// the SUMPRODUCT subtotals (SUMPRODUCT, not SUMIF — a team name containing *
// or ? would be treated as a wildcard by SUMIF and silently over-match).
function _lciXlCalc(ctx) {
  const { wb, model: m, horizon: h, comp: c } = ctx;
  const E = CONFIG.LCI.EXCEL, C = E.COLOURS;
  const ws = wb.addWorksheet(E.SHEETS.calc);
  const keyCol = 3 + h, keyL = _lciXlCol(keyCol);
  ws.columns = [{ width: 40 }, ...Array.from({ length: h }, () => ({ width: 14 })), { width: 4 }, { width: 22 }];
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  const dispMoney = _lciXlMoneyFmt(m.DisplayCurrency);
  const ML  = i => _lciXlCol(2 + i);                       // month column letter, this sheet
  const RML = i => _lciXlCol(ctx.roadmap.firstMonthCol + i); // month column letter, roadmap sheet
  const SR  = _lciXlSheet(E.SHEETS.roadmap);
  const SL  = _lciXlSheet(E.SHEETS.legacy);
  const SO  = _lciXlSheet(E.SHEETS.oneoffs);

  _lciXlSet(ws, 1, 1, 'Monthly Calc — every line, every month, including sections switched off in Newton.',
    { bold: true, color: C.navyText });
  _lciXlBand(ws, 1, keyCol, C.navy);
  _lciXlMonthHeader(ws, 2, 2, ctx.labels, ['Line']);
  _lciXlSet(ws, 2, keyCol, 'Key', { bold: true, color: C.navyText, fill: C.navy });

  let r = 3;
  const K = {}; // logical name → excel row

  const heading = text => {
    _lciXlSet(ws, r, 1, text, { bold: true });
    _lciXlBand(ws, r, keyCol, C.subtotalFill);
    r++;
  };
  // Write one line of month cells from a per-month formula builder + result series.
  const line = (label, fn, series, o = {}) => {
    _lciXlSet(ws, r, 1, label, o.labelOpts || {});
    for (let i = 0; i < h; i++) {
      _lciXlSet(ws, r, 2 + i, { formula: fn(i), result: series[i] },
        { fmt: o.fmt || dispMoney, fill: o.fill });
    }
    if (o.key !== undefined) _lciXlSet(ws, r, keyCol, o.key);
    return r++;
  };
  // SUM down a contiguous block of rows in this sheet; 0 when the block is empty.
  const sumBlock = (first, last, i) => (last >= first ? `SUM(${ML(i)}${first}:${ML(i)}${last})` : '0');
  // Apply a section switch to a subtotal formula. A already-constant '0' is left
  // alone rather than becoming '0*LegacyOn' — same answer, less noise in the
  // formula bar for models with no rows of that type.
  const gate = (f, flag) => (f === '0' ? '0' : `${f}*${flag}`);

  // ── CoE payroll headcount by role ──
  // A hire in month N is on payroll in month N + notice. INDEX's argument is
  // guarded by the IF so it can never be < 1 (which would be a #VALUE!).
  heading('CoE payroll headcount by role');
  const hcFirst = r;
  ctx.coeMeta.forEach(meta => {
    const er = meta.excelRow;
    K[`hc:${er}`] = line(
      `${meta.team} — ${meta.row.Title || 'Role'}`,
      i => `IF(${i + 1}-${SR}!$F$${er}<1,0,SUM(${SR}!$${RML(0)}$${er}:INDEX(${SR}!$${RML(0)}$${er}:$${ctx.roadmap.lastMonthL}$${er},${i + 1}-${SR}!$F$${er})))`,
      meta.cum, { fmt: E.FORMATS.integer });
  });
  const hcLast = r - 1;

  // ── CoE employee cost by role ──
  heading('CoE employee cost by role (display currency)');
  const ecFirst = r;
  ctx.coeMeta.forEach(meta => {
    const er = meta.excelRow, hcRow = K[`hc:${er}`];
    line(`${meta.team} — ${meta.row.Title || 'Role'}`,
      i => `${ML(i)}${hcRow}*${SR}!$H$${er}`,
      meta.cum.map(v => v * meta.monthlyLocal * lciFxRate(m)),
      { key: meta.team });
  });
  const ecLast = r - 1;

  heading('CoE totals');
  K.coeHeadcount = line('CoE headcount (on payroll)', i => sumBlock(hcFirst, hcLast, i),
    c.coeHeadcount, { fmt: E.FORMATS.integer, fill: C.derivedFill });
  Object.entries(c.coeByTeam).forEach(([team, arr]) => {
    K[`team:${team}`] = line(`Team — ${team}`,
      i => (ecLast >= ecFirst
        ? `SUMPRODUCT(($${keyL}$${ecFirst}:$${keyL}$${ecLast}=${_lciXlLit(team)})*${ML(i)}${ecFirst}:${ML(i)}${ecLast})`
        : '0'),
      arr, { fill: C.derivedFill });
  });
  K.coeEmployeeCost = line('Total employee cost', i => sumBlock(ecFirst, ecLast, i),
    c.coeEmployeeCost, { fill: C.subtotalFill, labelOpts: { bold: true } });
  K.hires = line('Hires per month', i => `SUM(${SR}!${RML(i)}$${ctx.roadmap.firstDataRow}:${RML(i)}$${ctx.roadmap.lastRow})`,
    lciHiresPerMonth(ctx.rows, m), { fmt: E.FORMATS.integer });

  heading('CoE operating costs');
  // EoR is entered in DISPLAY currency — no FX. Office is LOCAL — × FXRate.
  K.eor    = line('EoR costs',    i => `${ML(i)}${K.coeHeadcount}*EoRPerHead`,            c.eor);
  K.office = line('Office costs', i => `${ML(i)}${K.coeHeadcount}*OfficePerHead*FXRate`,  c.office);
  const tb = ctx.oneoffBlocks.travel;
  K.travel = line('Travel costs',
    i => gate(tb.last >= tb.first ? `SUM(${SO}!${ML(i)}${tb.first}:${ML(i)}${tb.last})` : '0', 'TravelOn'),c.travel);
  K.coeOperating = line('Total CoE operating costs',
    i => `${ML(i)}${K.coeEmployeeCost}+${ML(i)}${K.eor}+${ML(i)}${K.office}+${ML(i)}${K.travel}`,
    c.coeOperating, { fill: C.subtotalFill, labelOpts: { bold: true } });

  // ── Legacy ──
  heading('Legacy team by row');
  const lhFirst = r;
  ctx.legacyMeta.forEach(meta => {
    const lr = meta.excelRow;
    line(`Headcount — ${meta.row.Title || 'Role'}`,
      i => `IF(${i + 1}<=${SL}!$H$${lr},${SL}!$D$${lr},0)`,
      Array.from({ length: h }, (_, i) => (i < meta.effExit ? meta.qty : 0)),
      { fmt: E.FORMATS.integer });
  });
  const lhLast = r - 1;
  const lcFirst = r;
  ctx.legacyMeta.forEach(meta => {
    const lr = meta.excelRow;
    line(`Cost — ${meta.row.Title || 'Role'}`,
      i => `IF(${i + 1}<=${SL}!$H$${lr},${SL}!$I$${lr},0)`,
      Array.from({ length: h }, (_, i) => (i < meta.effExit ? meta.cost : 0)),
      { key: meta.cat });
  });
  const lcLast = r - 1;

  heading('Legacy totals');
  K.legacyHeadcount = line('Legacy headcount', i => gate(sumBlock(lhFirst, lhLast, i), 'LegacyOn'),
    c.legacyHeadcount, { fmt: E.FORMATS.integer, fill: C.derivedFill });
  Object.keys(CONFIG.LCI.LEGACY_CATEGORIES).forEach(cat => {
    K[`legacy:${cat}`] = line(CONFIG.LCI.LEGACY_CATEGORIES[cat].costLine,
      i => gate(lcLast >= lcFirst
        ? `SUMPRODUCT(($${keyL}$${lcFirst}:$${keyL}$${lcLast}=${_lciXlLit(cat)})*${ML(i)}${lcFirst}:${ML(i)}${lcLast})`
        : '0', 'LegacyOn'),
      c.legacyByCategory[cat], { fill: C.derivedFill });
  });
  K.legacyCost = line('Legacy team costs', i => gate(sumBlock(lcFirst, lcLast, i), 'LegacyOn'),
    c.legacyCost, { fill: C.subtotalFill, labelOpts: { bold: true } });

  // ── One-offs & fees ──
  heading('One-offs & project fees');
  const ob = ctx.oneoffBlocks.oneoff, fb = ctx.oneoffBlocks.fee;
  K.oneoffs = line('Retention & Relocation',
    i => gate(ob.last >= ob.first ? `SUM(${SO}!${ML(i)}${ob.first}:${ML(i)}${ob.last})` : '0', 'OneoffsOn'),c.oneoffs);
  K.fee = {};
  fb.rows.forEach(({ row, excelRow }) => {
    K.fee[excelRow] = line(row.Title || 'Fee', i => `${SO}!${ML(i)}${excelRow}`,
      lciMonthValues(row, h));
  });
  K.fees = line('Total project fees',
    i => gate(fb.last >= fb.first ? `SUM(${SO}!${ML(i)}${fb.first}:${ML(i)}${fb.last})` : '0', 'FeesOn'),
    c.fees, { fill: C.subtotalFill, labelOpts: { bold: true } });

  // ── Totals ──
  // CoE operating counted ONCE. Do not "fix" this to match the Barcelona sheet.
  heading('Totals');
  K.totalMonthly = line('Total monthly spend',
    i => `${ML(i)}${K.coeOperating}+${ML(i)}${K.legacyCost}+${ML(i)}${K.oneoffs}+${ML(i)}${K.fees}`,
    c.totalMonthly, { fill: C.totalFill, labelOpts: { bold: true } });
  // `r` inside this builder is still the cumulative row itself — `line` reads
  // the formula before incrementing — so ${r} is the self-reference to the
  // previous month's cumulative cell on the SAME row. Do not hoist `r`.
  K.cumulative = line('Cumulative spend',
    i => (i === 0 ? `${ML(0)}${K.totalMonthly}` : `${ML(i - 1)}${r}+${ML(i)}${K.totalMonthly}`),
    c.cumulativeSpend, { fill: C.totalFill, labelOpts: { bold: true } });
  K.crossover = line('CoE operating + legacy (peak crossover series)',
    i => `${ML(i)}${K.coeOperating}+${ML(i)}${K.legacyCost}`,
    c.coeOperating.map((v, i) => v + c.legacyCost[i]), { fill: C.derivedFill });

  ctx.calc = K;
  ctx.calcML = ML;
}

// ── Sheet 6: Output Summary ──────────────────────────────────────────
// A formula mirror of the client Cost Model table. Row VISIBILITY replicates
// _lciOutputInnerHtml() exactly (N-010 / N-018 conditions) so the workbook and
// the PDF reconcile line for line — that is acceptance criterion 4.
function _lciXlOutput(ctx) {
  const { wb, model: m, horizon: h, comp: c, kpis } = ctx;
  const E = CONFIG.LCI.EXCEL, C = E.COLOURS;
  const sections = lciSections(m);
  const ws = wb.addWorksheet(E.SHEETS.output);
  ws.columns = [{ width: 40 }, ...Array.from({ length: h }, () => ({ width: 14 }))];
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  const dispMoney = _lciXlMoneyFmt(m.DisplayCurrency);
  const SC = _lciXlSheet(E.SHEETS.calc);
  const ML = ctx.calcML, K = ctx.calc;

  _lciXlSet(ws, 1, 1, `Cost Model — all values in ${m.DisplayCurrency || ''}. Mirrors the client PDF.`,
    { bold: true, color: C.navyText });
  _lciXlBand(ws, 1, 1 + h, C.navy);
  _lciXlMonthHeader(ws, 2, 2, ctx.labels, ['']);

  let r = 3;
  const mirror = (label, calcRow, series, o = {}) => {
    _lciXlSet(ws, r, 1, label, { bold: !!o.bold, fill: o.fill });
    for (let i = 0; i < h; i++) {
      _lciXlSet(ws, r, 2 + i, { formula: `${SC}!${ML(i)}${calcRow}`, result: series[i] },
        { fmt: o.fmt || dispMoney, fill: o.fill });
    }
    r++;
  };

  // CoE (always on — N-008)
  Object.entries(c.coeByTeam).forEach(([team, arr]) => mirror(`   ${team}`, K[`team:${team}`], arr));
  mirror('Total Employee Cost', K.coeEmployeeCost, c.coeEmployeeCost, { bold: true, fill: C.subtotalFill });
  mirror('CoE Headcount (on payroll)', K.coeHeadcount, c.coeHeadcount, { fmt: E.FORMATS.integer });
  const hasEoR    = (Number(m.EoRFeePerHead) || 0) > 0;
  const hasOffice = (Number(m.OfficeCostPerHead) || 0) > 0;
  const hasTravel = c.travel.some(v => v);
  if (hasEoR)    mirror('   EoR Costs',    K.eor,    c.eor);
  if (hasOffice) mirror('   Office Costs', K.office, c.office);
  if (hasTravel) mirror('   Travel Costs', K.travel, c.travel);
  if (hasEoR || hasOffice || hasTravel) {
    mirror('Total CoE Operating Costs', K.coeOperating, c.coeOperating, { bold: true, fill: C.subtotalFill });
  }

  // Legacy / one-offs — visibility rules lifted verbatim from _lciOutputInnerHtml
  const lbc = c.legacyByCategory || { exiting: [], retained: [] };
  const showCatRows = lbc.exiting.some(v => v) && lbc.retained.some(v => v);
  const showLegacyTeamCosts = !showCatRows && c.oneoffs.some(v => v);
  if (sections.legacy || sections.oneoffs) {
    if (sections.legacy) {
      mirror('Legacy Headcount', K.legacyHeadcount, c.legacyHeadcount, { fmt: E.FORMATS.integer });
      if (showLegacyTeamCosts) mirror('   Legacy Team Costs', K.legacyCost, c.legacyCost);
      if (showCatRows) {
        Object.entries(CONFIG.LCI.LEGACY_CATEGORIES).forEach(([k, v]) =>
          mirror(`   ${v.costLine}`, K[`legacy:${k}`], lbc[k]));
      }
    }
    if (sections.oneoffs) mirror('   Retention & Relocation', K.oneoffs, c.oneoffs);
    // Total Legacy Costs = legacy + one-offs (matches the app exactly).
    _lciXlSet(ws, r, 1, 'Total Legacy Costs', { bold: true, fill: C.subtotalFill });
    for (let i = 0; i < h; i++) {
      _lciXlSet(ws, r, 2 + i,
        { formula: `${SC}!${ML(i)}${K.legacyCost}+${SC}!${ML(i)}${K.oneoffs}`,
          result: c.legacyCost[i] + c.oneoffs[i] },
        { fmt: dispMoney, fill: C.subtotalFill });
    }
    r++;
  }

  if (sections.fees) {
    ctx.oneoffBlocks.fee.rows.forEach(({ row, excelRow }) =>
      mirror(`   ${row.Title || 'Fee'}`, K.fee[excelRow], lciMonthValues(row, h)));
    mirror('Total Project Fees', K.fees, c.fees, { bold: true, fill: C.subtotalFill });
  }

  mirror('Total Monthly Spend', K.totalMonthly, c.totalMonthly, { bold: true, fill: C.totalFill });
  mirror('Cumulative Spend',    K.cumulative,   c.cumulativeSpend, { bold: true, fill: C.totalFill });

  // ── KPIs ──
  r += 1;
  _lciXlSet(ws, r, 1, 'Key figures', { bold: true, size: 12, color: C.navyText });
  _lciXlBand(ws, r, 3, C.navy);
  r++;
  const lastML  = ML(h - 1);
  const hiresR  = `${SC}!$B$${K.hires}:$${_lciXlCol(1 + h)}$${K.hires}`;
  const crossR  = `${SC}!$B$${K.crossover}:$${_lciXlCol(1 + h)}$${K.crossover}`;
  const kpiRows = [];
  const kpi = (label, formula, result, fmt) => {
    _lciXlSet(ws, r, 1, label, { bold: true });
    _lciXlSet(ws, r, 2, { formula, result }, { fmt, fill: C.derivedFill });
    kpiRows.push(r);
    return r++;
  };
  kpi('Total spend over horizon', `${SC}!${lastML}${K.cumulative}`, kpis.totalSpend, dispMoney);
  const steadyRow = kpi('Steady-state monthly run-rate',
    `${SC}!${lastML}${K.coeOperating}+${SC}!${lastML}${K.legacyCost}`, kpis.steadyMonthly, dispMoney);
  kpi('Steady-state annual run-rate', `B${steadyRow}*12`, kpis.steadyAnnual, dispMoney);
  kpi('Total hires', `SUM(${hiresR})`, kpis.totalHires, E.FORMATS.integer);
  kpi('Time to full ramp (last hire month)',
    `IF(SUM(${hiresR})=0,0,SUMPRODUCT(MAX((${hiresR}>0)*(COLUMN(${hiresR})-COLUMN(${SC}!$B$${K.hires})+1))))`,
    kpis.lastHireMonth, E.FORMATS.integer);
  const fhRow = kpi('Final CoE headcount', `${SC}!${lastML}${K.coeHeadcount}`, kpis.finalHeadcount, E.FORMATS.integer);
  kpi('Cost per head (steady state)', `IF(B${fhRow}=0,0,B${steadyRow}/B${fhRow})`, kpis.costPerHead, dispMoney);
  kpi('Peak crossover month', `MATCH(MAX(${crossR}),${crossR},0)`, kpis.peakCrossoverMonth, E.FORMATS.integer);
  kpi('Peak crossover spend', `MAX(${crossR})`, kpis.peakCrossoverSpend, dispMoney);
}

// ── Sheet 7: Milestones ──────────────────────────────────────────────
function _lciXlMilestones(ctx) {
  const { wb } = ctx;
  const E = CONFIG.LCI.EXCEL, C = E.COLOURS;
  const ws = wb.addWorksheet(E.SHEETS.milestones);
  ws.columns = [{ width: 46 }, { width: 16 }, { width: 16 }];
  _lciXlSet(ws, 1, 1, 'Project milestones', { bold: true, color: C.navyText });
  _lciXlBand(ws, 1, 3, C.navy);
  ['Milestone', 'Start month', 'End month'].forEach((l, i) =>
    _lciXlSet(ws, 2, i + 1, l, { bold: true, color: C.navyText, fill: C.navy }));
  let r = 3;
  const stones = (ctx.milestones || []).slice().sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
  for (const s of stones) {
    _lciXlSet(ws, r, 1, s.Title || '');
    _lciXlSet(ws, r, 2, Number(s.StartMonth) || '', { fmt: E.FORMATS.integer });
    _lciXlSet(ws, r, 3, Number(s.EndMonth) || Number(s.StartMonth) || '', { fmt: E.FORMATS.integer });
    r++;
  }
  if (!stones.length) _lciXlSet(ws, r, 1, 'No milestones on this model.', { color: C.navy });
}

// ── Entry point ──────────────────────────────────────────────────────
async function lciExportModelExcel(btn) {
  const m = _lciEd && _lciEd.model;
  if (!m) { alert('No model open.'); return; }
  if (btn) setButtonLoading(btn, 'Building…');
  try {
    const ExcelJSLib = await _lciLoadExcelJS();
    const horizon = Number(m.HorizonMonths) || 0;
    const wb = new ExcelJSLib.Workbook();
    wb.creator = 'Newton — Momentum Global';
    wb.created = new Date();

    const ctx = {
      wb, model: m,
      rows:       _lciEd.rows || [],
      milestones: _lciEd.milestones || [],
      horizon,
      labels: lciMonthLabels(m.StartMonth, horizon),
      comp:   lciComputeModel(m, _lciEd.rows || []),
      kpis:   lciComputeKPIs(m, _lciEd.rows || []),
      named:  {},
    };

    // Order matters: each builder records the row/column map the next one
    // references. Assumptions first (named cells), Output last (mirrors Calc).
    _lciXlAssumptions(ctx);
    _lciXlRoadmap(ctx);
    _lciXlLegacy(ctx);
    _lciXlOneoffs(ctx);
    _lciXlCalc(ctx);
    _lciXlOutput(ctx);
    _lciXlMilestones(ctx);

    Object.entries(ctx.named).forEach(([name, ref]) => wb.definedNames.add(ref, name));

    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    // Title passed RAW then filename-sanitised — apostrophes and ampersands
    // must survive (N-012d). Never escHtml a filename.
    a.href = url;
    a.download = `LCI Cost Model - ${safeFilename(m.Title, 'Model')} - ${stamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    alert(`Excel export failed: ${e.message}`);
  } finally {
    if (btn) clearButtonLoading(btn);
  }
}
