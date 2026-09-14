// js/lci-import.js — LCI Cost Model: import Legacy Team rows from Excel (N-231)
//
// Loaded after lci-excel.js (reuses its lazy ExcelJS loader — no second xlsx
// dependency is introduced) and before lci-report.js.
//
// Deliberately does NOT write to SharePoint itself. Imported rows are pushed
// into the same in-memory _lciEd.rows array a hand-typed row lands in (same
// shape as addLCILegacyRow, in lci-sections.js) and the section is marked
// dirty — the existing "Save Changes" button (saveLCIRows → saveLCIRoadmap,
// lci-editor.js) is what actually creates them via createLCIRow, one row at
// a time, with its own retry (N-082's graphRequest) and re-entrancy guard.
// See this diff's Reference section for why this differs from the spec's
// step 5/6 (an independent bulk-create-with-its-own-progress-bar path).

let _lciImp = null; // { matrix, hasHeader, mapping, preview }

const _LCI_IMPORT_FIELDS = [
  { key: 'Title',          label: 'Role / Title',    required: true  },
  { key: 'Team',           label: 'Team',             required: true  },
  { key: 'AnnualSalary',   label: 'Annual Salary',    required: true  },
  { key: 'BonusPct',       label: 'Bonus %',          required: false },
  { key: 'LegacyCategory', label: 'Legacy Category',  required: false },
  { key: 'CareerLevel',    label: 'Career Level',     required: false },
];

function _lciImportHost() {
  let host = document.getElementById('lci-import-host');
  if (!host) { host = document.createElement('div'); host.id = 'lci-import-host'; document.body.appendChild(host); }
  return host;
}

function openLCIImportModal() {
  _lciImp = { matrix: [], hasHeader: true, mapping: {}, preview: [] };
  _lciImportHost().innerHTML = _lciImportPickerHtml();
}

function closeLCIImport() {
  _lciImp = null;
  const host = document.getElementById('lci-import-host');
  if (host) host.innerHTML = '';
}

// Wider than the default .lci-modal-card (460px) — a mapping/preview table
// needs the room. Width is the only inline override; everything else reuses
// the shared component (same pattern _lciModelModal uses for its own
// wider-than-default card).
function _lciImportModalShell(title, bodyHtml) {
  return `
    <div class="lci-modal-overlay" onclick="if(event.target===this)closeLCIImport()">
      <div class="lci-modal-card" style="width:820px;max-width:95vw;max-height:90vh;overflow-y:auto">
        <h3 style="margin:0 0 16px;color:var(--brand-tertiary)">${escHtml(title)}</h3>
        ${bodyHtml}
      </div>
    </div>`;
}

function _lciImportPickerHtml() {
  return _lciImportModalShell('Import Legacy Team from Excel', `
    <p style="font-size:13px;color:var(--text-muted)">
      Upload the customer's Excel file. You'll map its columns to Title, Team
      and Annual Salary on the next step — nothing is saved to SharePoint
      until you click <strong>Save Changes</strong> in the Legacy Team
      section afterwards. Salaries are read as-is in this model's display
      currency (${escHtml(_lciEd.model.DisplayCurrency)}) — convert first if
      the source file uses a different currency; this import does not do FX
      conversion.
    </p>
    <input type="file" id="lci-import-file" accept=".xlsx,.xls" onchange="lciImportFileSelected(this)">
    <div id="lci-import-status" style="margin-top:12px;font-size:13px;color:var(--text-muted)"></div>
    <div style="display:flex;justify-content:flex-end;margin-top:20px">
      <button class="btn-secondary" onclick="closeLCIImport()">Cancel</button>
    </div>`);
}

// Unwraps the common ExcelJS cell-value shapes (formula result, hyperlink
// text, rich text runs) down to a plain string/number for mapping + preview.
// Not exhaustive — good enough for the salary-sheet shapes this feature
// targets; anything stranger falls through to String(v) rather than throwing.
function _lciImportCellValue(v) {
  if (v === null || v === undefined) return v;
  // N-088/N-129 guard (F-12 CI check): never toISOString().slice() a Date —
  // that re-expresses a local instant in UTC and truncates to the wrong day
  // under BST. localDayISO() (utils.js) uses local getters instead.
  if (v instanceof Date) return localDayISO(v);
  if (typeof v === 'object') {
    if ('result' in v) return v.result;
    if (typeof v.text === 'string') return v.text;
    if (Array.isArray(v.richText)) return v.richText.map(rt => rt.text).join('');
  }
  return v;
}

async function lciImportFileSelected(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('lci-import-status');
  if (statusEl) statusEl.textContent = 'Reading file…';
  try {
    const buf = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload  = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(file);
    });
    const ExcelJS = await _lciLoadExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('That workbook has no sheets.');

    const matrix = [];
    ws.eachRow({ includeEmpty: false }, row => {
      // row.values is 1-indexed with index 0 unused — slice it off.
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      matrix.push(vals.map(_lciImportCellValue));
    });
    if (!matrix.length) throw new Error('That sheet has no rows.');

    // Header heuristic: fewer than half of row 1's non-empty cells parse as
    // text (i.e. most look numeric) → treat row 1 as data, not a header.
    const first = matrix[0];
    const nonEmpty = first.filter(v => v !== null && v !== undefined && v !== '');
    const textLike = nonEmpty.filter(v => typeof v === 'string' && isNaN(Number(v)));

    _lciImp.matrix = matrix;
    _lciImp.hasHeader = nonEmpty.length > 0 && textLike.length >= nonEmpty.length / 2;
    _lciImp.mapping = {};
    _lciImportHost().innerHTML = _lciImportMappingHtml();
  } catch (e) {
    toast('Could not read that file: ' + e.message, { type: 'error' });
  } finally {
    input.value = '';
  }
}

function _lciImportColCount() {
  return Math.max(0, ..._lciImp.matrix.map(r => r.length));
}

// A/B/C… column labeller for files with no header row. Deliberately local
// rather than reusing lci-excel.js's _lciXlCol — this file's only dependency
// on lci-excel.js is the shared _lciLoadExcelJS() lazy loader.
function _lciImportColLetters(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function _lciImportColLabel(i) {
  if (_lciImp.hasHeader) {
    const h = _lciImp.matrix[0][i];
    if (h !== null && h !== undefined && String(h).trim() !== '') return String(h);
  }
  return `Column ${_lciImportColLetters(i + 1)}`;
}

function _lciImportDataRows() {
  return _lciImp.hasHeader ? _lciImp.matrix.slice(1) : _lciImp.matrix;
}

function _lciImportMappingHtml() {
  const cols = _lciImportColCount();
  const sample = _lciImportDataRows()[0] || [];

  const optsFor = selected => {
    let html = '<option value="">— not mapped —</option>';
    for (let i = 0; i < cols; i++) {
      html += `<option value="${i}"${String(selected) === String(i) ? ' selected' : ''}>${escHtml(_lciImportColLabel(i))}</option>`;
    }
    return html;
  };

  const rowsHtml = _LCI_IMPORT_FIELDS.map(f => {
    const mapped = _lciImp.mapping[f.key];
    const exampleVal = (mapped !== undefined && mapped !== '' && sample[mapped] !== undefined && sample[mapped] !== null)
      ? sample[mapped] : null;
    return `
      <div class="form-group" style="display:flex;align-items:center;gap:12px">
        <label style="width:160px;margin:0">${escHtml(f.label)}${f.required ? ' *' : ''}</label>
        <select class="form-control" style="flex:1" onchange="lciImportSetMapping('${f.key}', this.value)">
          ${optsFor(mapped)}
        </select>
        <span style="width:160px;font-size:12px;color:var(--text-muted)">${exampleVal !== null ? `e.g. ${escHtml(String(exampleVal))}` : ''}</span>
      </div>`;
  }).join('');

  const ready = _LCI_IMPORT_FIELDS.filter(f => f.required)
    .every(f => _lciImp.mapping[f.key] !== undefined && _lciImp.mapping[f.key] !== '');

  return _lciImportModalShell('Map Columns', `
    <p style="font-size:13px;color:var(--text-muted)">
      ${_lciImp.hasHeader ? 'Detected a header row.' : 'No header row detected — columns are labelled A, B, C…'}
      Map each Newton field to a column from the file. Fields marked * are required.
    </p>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:12px">
      <input type="checkbox" ${_lciImp.hasHeader ? 'checked' : ''} onchange="lciImportToggleHeader(this.checked)">
      First row is a header row, not data
    </label>
    ${rowsHtml}
    <p style="font-size:12px;color:var(--text-muted);margin-top:8px">${_lciImportDataRows().length} data row(s) found in the file.</p>
    <div style="display:flex;justify-content:space-between;margin-top:20px">
      <button class="btn-secondary" onclick="openLCIImportModal()">Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="closeLCIImport()">Cancel</button>
        <button class="btn-primary" id="lci-import-preview-btn" onclick="lciImportGoToPreview()" ${ready ? '' : 'disabled'}>Preview rows</button>
      </div>
    </div>`);
}

function lciImportSetMapping(key, value) {
  _lciImp.mapping[key] = value;
  _lciImportHost().innerHTML = _lciImportMappingHtml();
}

function lciImportToggleHeader(checked) {
  _lciImp.hasHeader = checked;
  _lciImportHost().innerHTML = _lciImportMappingHtml();
}

function lciImportGoToPreview() {
  const dataRows = _lciImportDataRows();
  const get = (row, key) => {
    const idx = _lciImp.mapping[key];
    return (idx !== undefined && idx !== '') ? row[Number(idx)] : null;
  };
  _lciImp.preview = dataRows.map((row, i) => {
    const title = get(row, 'Title');
    const team = get(row, 'Team');
    const salaryRaw = get(row, 'AnnualSalary');
    const salary = (salaryRaw === null || salaryRaw === '' || isNaN(Number(salaryRaw))) ? null : Number(salaryRaw);
    const bonusRaw = get(row, 'BonusPct');
    const catRaw = get(row, 'LegacyCategory');
    const levelRaw = get(row, 'CareerLevel');
    return {
      sourceIndex: i,
      include: true,
      Title: title !== null ? String(title) : '',
      Team: team !== null ? String(team) : '',
      AnnualSalary: salary,
      // Whole-number percentage, same convention the Legacy grid's own Bonus
      // % input uses (lciRowFieldChanged divides by 100 on save) — kept as
      // BonusPctInput until commit so re-editing in preview stays in the
      // same units the user is looking at in the source file.
      BonusPctInput: (bonusRaw === null || bonusRaw === '') ? '' : Number(bonusRaw),
      LegacyCategory: catRaw !== null ? String(catRaw) : '',
      CareerLevel: levelRaw !== null ? String(levelRaw) : '',
    };
  });
  _lciImportHost().innerHTML = _lciImportPreviewHtml();
}

function _lciImportRowWarn(r) {
  return !r.Title.trim() || !r.Team.trim() || r.AnnualSalary === null;
}

function _lciImportCountText() {
  const included = _lciImp.preview.filter(r => r.include).length;
  const flagged = _lciImp.preview.filter(r => r.include && _lciImportRowWarn(r)).length;
  return `${included} of ${_lciImp.preview.length} row(s) will be imported${flagged ? ` — ${flagged} flagged` : ''}.`;
}

function _lciImportWarnHtml(r) {
  return _lciImportRowWarn(r)
    ? '<span class="lci-warn" title="Missing or invalid Title/Team/Salary — can still be imported">⚠</span>' : '';
}

function _lciImportPreviewHtml() {
  const rowsHtml = _lciImp.preview.map((r, i) => `
    <tr>
      <td><input type="checkbox" ${r.include ? 'checked' : ''} onchange="lciImportToggleRow(${i}, this.checked)"></td>
      <td><input type="text" class="lci-cell lci-cell--grow" value="${escAttr(r.Title)}"
                 onchange="lciImportEditRow(${i}, 'Title', this.value)"></td>
      <td><input type="text" class="lci-cell lci-cell--grow" value="${escAttr(r.Team)}"
                 onchange="lciImportEditRow(${i}, 'Team', this.value)"></td>
      <td><input type="number" class="lci-cell" min="0" value="${r.AnnualSalary ?? ''}"
                 onchange="lciImportEditRow(${i}, 'AnnualSalary', this.value)"></td>
      <td id="lci-import-warn-${i}">${_lciImportWarnHtml(r)}</td>
    </tr>`).join('');

  return _lciImportModalShell('Preview Import', `
    <div class="lci-grid-scroll table-scroll" style="max-height:50vh">
      <table class="data-table">
        <thead><tr><th></th><th>Role</th><th>Team</th><th>Annual salary</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <p id="lci-import-count" style="font-size:12px;color:var(--text-muted);margin-top:8px">${_lciImportCountText()}</p>
    <div style="display:flex;justify-content:space-between;margin-top:16px">
      <button class="btn-secondary" onclick="lciImportBackToMapping()">Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="closeLCIImport()">Cancel</button>
        <button class="btn-primary" onclick="lciImportCommit()">Add to Legacy Team</button>
      </div>
    </div>`);
}

function lciImportToggleRow(i, checked) {
  _lciImp.preview[i].include = checked;
  const countEl = document.getElementById('lci-import-count');
  if (countEl) countEl.textContent = _lciImportCountText();
}

function lciImportEditRow(i, field, value) {
  const r = _lciImp.preview[i];
  r[field] = field === 'AnnualSalary' ? (value === '' ? null : Number(value)) : value;
  const warnEl = document.getElementById(`lci-import-warn-${i}`);
  if (warnEl) warnEl.innerHTML = _lciImportWarnHtml(r);
  const countEl = document.getElementById('lci-import-count');
  if (countEl) countEl.textContent = _lciImportCountText();
}

function lciImportBackToMapping() {
  _lciImportHost().innerHTML = _lciImportMappingHtml();
}

// Builds the LCIModelRows-shaped objects and adds them to the in-memory
// roadmap the same way addLCILegacyRow does (same field defaults), then
// marks the section dirty. Nothing is written to SharePoint here — see the
// file header and this diff's Reference section.
function lciImportCommit() {
  const included = _lciImp.preview.filter(r => r.include);
  if (!included.length) { toast('No rows selected to import.', { type: 'error' }); return; }

  let maxSort = Math.max(0, ..._lciEd.rows.map(r => r.SortOrder || 0));
  for (const r of included) {
    _lciEd.rows.push({
      RowType: 'legacy',
      Title: r.Title,
      Team: r.Team,
      Quantity: 1,
      AnnualSalary: r.AnnualSalary,
      // UI/import value is a whole percentage, stored as a decimal — same
      // conversion lciRowFieldChanged applies. Unmapped/blank → 0, matching
      // addLCILegacyRow's default (never left null).
      BonusPct: (r.BonusPctInput === '' || r.BonusPctInput === null || r.BonusPctInput === undefined)
        ? 0 : Number(r.BonusPctInput) / 100,
      ExitMonth: null,
      // Blank = exiting (N-010) — never write the literal string 'exiting'.
      LegacyCategory: r.LegacyCategory || '',
      CareerLevel: r.CareerLevel || '',
      MonthValues: '[]',
      SortOrder: ++maxSort,
    });
  }
  lciMarkRowsDirtyAll();
  _lciReplaceSection('_lciLegacyHtml', 'lci-legacy-section');
  closeLCIImport();
  toast(`Added ${included.length} row(s) to Legacy Team — click Save Changes to write them to SharePoint.`, { type: 'success' });
}
