// js/lci-editor.js — LCI Cost Model editor
// Settings bar + CoE roadmap (milestones) + salary benchmark hints.
// Legacy / one-offs / fees sections and the live cost output arrive in step 6
// (placeholders rendered below the roadmap).
// Load order: after lci-model.js and lci-pages.js, before sales-app.js.

// Page-level cache. Rows are edited in memory; Save writes diffs only.
let _lciEd = null; // { model, rows, deletedRowIds, origRows, dirtySettings, dirtyRows }

// ── Entry point ──────────────────────────────────────────────────────

async function renderLCIEditorPage(modelId) {
  document.body.classList.remove('lci-summary-mode');
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';
  try {
    const [model, rows, milestones] = await Promise.all([
      getLCIModelById(modelId),
      getLCIRows(modelId),
      getLCIMilestones(modelId),
    ]);
    rows.sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
    milestones.sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));

    // Benchmark library: flatten coe rows across ALL models (excluding this
    // one at match time) into { modelId, title, location, ccy, salary }.
    let bench = [];
    try {
      const allModels = await getLCIModels();
      const rowArrays = await Promise.all(allModels.map(mm => getLCIRows(mm.id)));
      allModels.forEach((mm, i) => {
        for (const r of rowArrays[i]) {
          if (r.RowType === 'coe' && r.AnnualSalary != null) {
            bench.push({ modelId: mm.id, title: r.Title, location: mm.Location, ccy: mm.LocalCurrency, salary: r.AnnualSalary });
          }
        }
      });
    } catch (_) { bench = []; }

    _lciEd = {
      model,
      rows,
      milestones,
      bench,
      deletedRowIds: [],
      deletedMilestoneIds: [],
      origRows: new Map(rows.map(r => [String(r.id), JSON.stringify(_lciRowSnapshot(r))])),
      origMilestones: new Map(milestones.map(s => [String(s.id), JSON.stringify(_lciMilestoneSnapshot(s))])),
      dirtySettings: false,
      dirtyRows: false,
      dirtyMilestones: false,
    };
    main.innerHTML = _lciEditorHtml();
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    main.innerHTML = `<p style="color:red">Error loading model: ${e.message}</p>`;
  }
}

function _lciRowSnapshot(r) {
  return {
    Title: r.Title, RowType: r.RowType, Team: r.Team, CareerLevel: r.CareerLevel,
    AnnualSalary: r.AnnualSalary, BonusPct: r.BonusPct, Quantity: r.Quantity,
    ExitMonth: r.ExitMonth, LegacyCategory: r.LegacyCategory,
    NoticeMonthsOverride: r.NoticeMonthsOverride,
    MonthValues: r.MonthValues, SortOrder: r.SortOrder,
  };
}

function lciEditorBack() {
  if ((_lciEd?.dirtySettings || _lciEd?.dirtyRows || _lciEd?.dirtyMilestones) &&
      !confirm('You have unsaved changes. Leave without saving?')) return;
  _lciEd = null;
  renderLCIModelsPage();
}

// ── Page shell ───────────────────────────────────────────────────────

function _lciEditorHtml() {
  const m = _lciEd.model;
  return `
    <div class="page-header">
      <h2>${escHtml(m.Title)} <span style="font-weight:400;color:var(--text-muted);font-size:15px">— ${escHtml(m.ClientName)}</span></h2>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="lciEditorBack()">← Back to models</button>
        <button class="btn-primary" onclick="lciOpenSummary()">Summary / Print</button>
      </div>
    </div>
    ${_lciSettingsHtml()}
    ${lciSections(m).coe ? _lciRoadmapHtml() : ''}
    ${_lciTravelHtml()}
    ${_lciLegacyHtml()}
    ${_lciOneoffsHtml()}
    ${_lciFeesHtml()}
    ${_lciOutputHtml()}`;
}

function lciOpenSummary() {
  if ((_lciEd?.dirtySettings || _lciEd?.dirtyRows || _lciEd?.dirtyMilestones) &&
      !confirm('You have unsaved changes that will not appear in the summary. Continue?')) return;
  renderLCISummaryPage(_lciEd.model.id);
}

// ── Settings bar ─────────────────────────────────────────────────────

function _lciSettingsHtml() {
  const m = _lciEd.model;
  const role = _salesResolvedRole;
  const canAssign = role === 'admin' || role === 'leadership';
  const currencies = lciCurrencyOptions(CONFIG.COUNTRY_CURRENCY);
  const ccyOpts = sel => currencies.map(c => `<option value="${c}"${c === sel ? ' selected' : ''}>${c}</option>`).join('');
  const statusOpts = CONFIG.LCI.STATUSES.map(s => `<option value="${s}"${s === (m.Status || 'Draft') ? ' selected' : ''}>${s}</option>`).join('');
  const smOpts = CONFIG.LCI.SALARY_MONTHS.map(n => `<option value="${n}"${Number(m.SalaryMonths) === n ? ' selected' : ''}>${n}</option>`).join('');
  const sections = lciSections(m);
  const fxDiffer = m.LocalCurrency !== m.DisplayCurrency;

  const field = (label, inner) => `
    <div class="form-group" style="margin:0">
      <label style="font-size:12px">${label}</label>
      ${inner}
    </div>`;
  const numInput = (name, val, step, min) =>
    `<input type="number" class="form-control" data-setting="${name}" value="${val ?? ''}"
            step="${step}" min="${min ?? 0}" onchange="lciSettingChanged()">`;

  return `
    <div class="lci-settings" id="lci-settings">
      <div class="lci-settings__grid">
        ${field('Status', `<select class="form-control" data-setting="Status" onchange="lciSettingChanged()">${statusOpts}</select>`)}
        ${field(`Local currency`, `<select class="form-control" data-setting="LocalCurrency" onchange="lciSettingChanged()">${ccyOpts(m.LocalCurrency)}</select>`)}
        ${field(`Display currency`, `<select class="form-control" data-setting="DisplayCurrency" onchange="lciSettingChanged()">${ccyOpts(m.DisplayCurrency)}</select>`)}
        <div id="lci-fx-setting" style="${fxDiffer ? '' : 'display:none'}">
        ${field(`FX rate (1 ${m.LocalCurrency} = X ${m.DisplayCurrency})`, numInput('FXRateLocalToDisplay', m.FXRateLocalToDisplay, '0.0001'))}
        </div>
        ${field(`Employer burden %`, numInput('EmployerBurdenPct', m.EmployerBurdenPct != null ? Math.round(m.EmployerBurdenPct * 100 * 100) / 100 : '', '0.5'))}
        ${field('Salary months', `<select class="form-control" data-setting="SalaryMonths" onchange="lciSettingChanged()">${smOpts}</select>`)}
        ${field('Notice period (default, months)', numInput('NoticeMonths', m.NoticeMonths ?? 0, '1'))}
        ${field(`Office / head / month (${m.LocalCurrency})`, numInput('OfficeCostPerHead', m.OfficeCostPerHead, '10'))}
        ${field(`EoR / head / month (${m.DisplayCurrency})`, numInput('EoRFeePerHead', m.EoRFeePerHead, '10'))}
        ${canAssign ? field('Assigned DM (email)',
          `<input type="email" class="form-control" data-setting="AssignedDMEmail" value="${escHtml(m.AssignedDMEmail)}" onchange="lciSettingChanged()">`) : ''}
      </div>
      <div class="lci-settings__toggles">
        ${Object.entries(CONFIG.LCI.SECTION_LABELS).map(([key, label]) => `
          <label class="lci-toggle">
            <input type="checkbox" data-section="${key}" ${sections[key] ? 'checked' : ''} onchange="lciSettingChanged()">
            ${label}
          </label>`).join('')}
        <button class="btn-primary" id="lci-settings-save" onclick="saveLCISettings()" disabled>Save Settings</button>
      </div>
    </div>`;
}

function lciSettingChanged() {
  _lciEd.dirtySettings = true;
  document.getElementById('lci-settings-save').disabled = false;
  // Show/hide FX input live as currencies change
  const el  = document.getElementById('lci-settings');
  const loc = el.querySelector('[data-setting="LocalCurrency"]').value;
  const dis = el.querySelector('[data-setting="DisplayCurrency"]').value;
  document.getElementById('lci-fx-setting').style.display = loc !== dis ? '' : 'none';
}

async function saveLCISettings() {
  const btn = document.getElementById('lci-settings-save');
  setButtonLoading(btn);
  try {
    const el = document.getElementById('lci-settings');
    const fields = {};
    el.querySelectorAll('[data-setting]').forEach(input => {
      const key = input.dataset.setting;
      let val = input.value;
      if (input.type === 'number') val = val === '' ? null : Number(val);
      if (key === 'EmployerBurdenPct' && val !== null) val = val / 100; // UI is whole %, stored as decimal
      fields[key] = val;
    });
    const sections = {};
    el.querySelectorAll('[data-section]').forEach(cb => { sections[cb.dataset.section] = cb.checked; });
    // N-008: no CoE checkbox to read — re-assert it so the stored JSON stays
    // self-describing (matches the create path in lci-pages.js) and a stale
    // "coe":false is cleaned up the next time settings are saved.
    sections.coe = true;
    fields.SectionsEnabled = JSON.stringify(sections);
    if (fields.LocalCurrency === fields.DisplayCurrency) fields.FXRateLocalToDisplay = null;

    // Diff against loaded model — write only what changed.
    const changed = {};
    for (const [k, v] of Object.entries(fields)) {
      if ((_lciEd.model[k] ?? null) !== (v ?? null)) changed[k] = v;
    }
    if (Object.keys(changed).length) {
      await updateLCIModel(_lciEd.model.id, changed);
      Object.assign(_lciEd.model, changed);
    }
    _lciEd.dirtySettings = false;
    clearButtonLoading(btn);
    btn.disabled = true;
    // Settings affect row costs, currency labels and section visibility, so
    // always re-render in full — a targeted refresh left a toggled section
    // visible until reload. Unsaved row edits survive: every cell commits to
    // _lciEd.rows on change, clicking Save Settings blurs and fires that
    // change first, and _lciEditorHtml() renders from _lciEd.rows.
    replaceInnerHtmlKeepingScroll('main-content', _lciEditorHtml(), '.lci-grid-scroll');
    if (window.lucide) lucide.createIcons();
    // Mandatory: the section shells and the roadmap emit their save buttons
    // with a hardcoded `disabled`, so without this a re-render with pending
    // row edits would lock the user out of saving them.
    _lciSyncSaveButtons();
  } catch (e) {
    clearButtonLoading(btn);
    alert('Error saving settings: ' + e.message);
  }
}

// ── CoE hiring roadmap grid ──────────────────────────────────────────

function _lciCoeRows() {
  return _lciEd.rows.filter(r => r.RowType === 'coe');
}

function _lciTeamsInOrder() {
  const seen = [];
  for (const r of _lciCoeRows()) {
    const t = r.Team || 'Other';
    if (!seen.includes(t)) seen.push(t);
  }
  return seen;
}

function _lciRoadmapHtml() {
  const m = _lciEd.model;
  const horizon = Number(m.HorizonMonths);
  const labels = lciMonthLabels(m.StartMonth, horizon);
  const coeRows = _lciCoeRows();
  const teams = _lciTeamsInOrder();

  const monthHead = labels.map(l => `<th class="lci-mcol">${l.replace(' (', '<br>(')}</th>`).join('');

  // `ti` is the TEAM index (not a row index like globalIdx). The button passes
  // it instead of the team name, so no user text ever reaches an onclick —
  // escaping a JS string inside an HTML attribute is not something escHtml can
  // do correctly (attribute entities are decoded before the JS is parsed).
  const bodyRows = teams.map((team, ti) => {
    const teamRows = coeRows.map((r, globalIdx) => ({ r, globalIdx }))
      .filter(({ r }) => (r.Team || 'Other') === team);
    const teamHtml = teamRows.map(({ r, globalIdx }) => _lciRoadmapRowHtml(r, globalIdx, horizon)).join('');
    return `
      <tr class="lci-team-row"><td colspan="${horizon + 7}"><strong>${escHtml(team)}</strong><button class="lci-team-btn" onclick="renameLCITeam(${ti})">Rename</button><button class="lci-team-btn lci-team-btn--danger" onclick="deleteLCITeam(${ti})">Delete</button></td></tr>
      ${teamHtml}
      <tr class="lci-add-role-row"><td colspan="${horizon + 8}"><button class="lci-add-role-btn" onclick="addLCIRoleToTeam(${ti})">+ Add role to ${escHtml(team)}</button></td></tr>`;
  }).join('');

  return `
    <div id="lci-roadmap-section" class="print-avoid-break" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:20px;margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;color:var(--brand-tertiary)">Hiring Roadmap <span style="font-weight:400;font-size:13px;color:var(--text-muted)">(salaries in ${m.LocalCurrency})</span></h3>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" onclick="addLCIMilestone()">+ Add Milestone</button>
          <button class="btn-secondary" onclick="addLCITeam()">+ Add Team</button>
          <button class="btn-primary" id="lci-roadmap-save" onclick="saveLCIRoadmap()" disabled>Save Roadmap</button>
        </div>
      </div>
      <div class="lci-grid-scroll">
        <table class="data-table lci-grid" id="lci-roadmap-table">
          <thead>
            <tr>
              <th style="min-width:180px">Role</th><th>Level</th>
              <th>Annual salary</th><th>Bonus %</th><th>Notice</th>
              ${monthHead}
              <th>Hires</th><th>Cost/mo</th><th></th>
            </tr>
          </thead>
          <tbody id="lci-roadmap-body">
            ${_lciRoadmapMilestoneRows(horizon)}
            ${bodyRows || emptyStateRow({ colspan: horizon + 8, icon: 'users', message: 'No teams yet — click + Add Team.' })}
          </tbody>
          <tfoot id="lci-roadmap-foot">
            ${_lciRoadmapFootHtml(horizon)}
          </tfoot>
        </table>
      </div>
    </div>`;
}

function _lciRoadmapRowHtml(r, idx, horizon) {
  const vals = lciMonthValues(r, horizon);
  const cells = vals.map((v, i) => `
    <td class="lci-mcol">
      <input type="number" class="lci-cell" min="0" value="${v || ''}"
             onchange="lciCoeCellChanged(${idx}, ${i}, this.value)">
    </td>`).join('');
  const cost = lciMonthlyCost(r, _lciEd.model);
  return `
    <tr data-row-idx="${idx}">
      <td><input type="text" class="lci-cell lci-cell--grow" value="${escHtml(r.Title)}"
                 onchange="lciCoeFieldChanged(${idx}, 'Title', this.value)"></td>
      <td><input type="text" class="lci-cell lci-cell--sm" value="${escHtml(r.CareerLevel)}"
                 onchange="lciCoeFieldChanged(${idx}, 'CareerLevel', this.value)"></td>
      <td><input type="number" class="lci-cell lci-cell--grow" min="0" value="${r.AnnualSalary ?? ''}"
                 onchange="lciCoeFieldChanged(${idx}, 'AnnualSalary', this.value)">
          <div class="lci-bench-hint" id="lci-bench-${idx}">${_lciBenchHintHtml(r, idx)}</div></td>
      <td><input type="number" class="lci-cell lci-cell--sm" min="0" max="100" step="1" value="${r.BonusPct != null ? Math.round(r.BonusPct * 100 * 100) / 100 : ''}"
                 onchange="lciCoeFieldChanged(${idx}, 'BonusPct', this.value)"></td>
      <td><input type="number" class="lci-cell lci-cell--sm" min="0" step="1"
                 value="${r.NoticeMonthsOverride ?? ''}"
                 placeholder="${_lciEd.model.NoticeMonths ?? 0}"
                 title="Notice period for this role. Blank inherits the model default."
                 onchange="lciCoeFieldChanged(${idx}, 'NoticeMonthsOverride', this.value)">
          ${Number(r.NoticeMonthsOverride) === 0 && r.NoticeMonthsOverride !== null && r.NoticeMonthsOverride !== undefined && r.NoticeMonthsOverride !== ''
            ? '<span class="lci-warn" title="No notice period — this role starts in the month it is hired">⚠</span>' : ''}</td>
      ${cells}
      <td class="lci-derived" id="lci-hires-${idx}">${vals.reduce((a, b) => a + b, 0)}</td>
      <td class="lci-derived" id="lci-cost-${idx}">${Math.round(cost).toLocaleString()}</td>
      <td><button class="btn-danger lci-row-del" onclick="removeLCICoeRow(${idx})">×</button></td>
    </tr>`;
}

function _lciRoadmapFootHtml(horizon) {
  const hires = lciHiresPerMonth(_lciEd.rows, _lciEd.model);
  let cum = 0;
  const cumCells = hires.map(h => { cum += h; return `<td class="lci-mcol lci-derived">${cum}</td>`; }).join('');
  const hireCells = hires.map(h => `<td class="lci-mcol lci-derived">${h || ''}</td>`).join('');
  return `
    <tr><td colspan="5"><strong>Hires per month</strong></td>${hireCells}<td class="lci-derived">${hires.reduce((a, b) => a + b, 0)}</td><td></td><td></td></tr>
    <tr><td colspan="5"><strong>Cumulative hires</strong></td>${cumCells}<td></td><td></td><td></td></tr>`;
}

// ── Benchmark salary hints ───────────────────────────────────────────

// HTML for the hint under a coe row's salary input, or '' if no match.
function _lciBenchHintHtml(r, idx) {
  const m = _lciEd.model;
  const b = lciBenchmark(_lciEd.bench, r.Title, m.Location, m.LocalCurrency, [m.id]);
  if (!b) return '';
  const same = Number(r.AnnualSalary) === b.median;
  return `Benchmark: ${b.median.toLocaleString()} (n=${b.n})` +
    (same ? '' : ` <a onclick="lciApplyBenchmark(${idx})">apply</a>`);
}

// Refresh just one row's hint (title/salary change) without touching inputs.
function _lciRefreshBenchHint(idx) {
  const el = document.getElementById(`lci-bench-${idx}`);
  if (el) el.innerHTML = _lciBenchHintHtml(_lciCoeRows()[idx], idx);
}

function lciApplyBenchmark(idx) {
  const m = _lciEd.model;
  const r = _lciCoeRows()[idx];
  const b = lciBenchmark(_lciEd.bench, r.Title, m.Location, m.LocalCurrency, [m.id]);
  if (!b) return;
  r.AnnualSalary = b.median;
  _lciMarkRowsDirty();
  // update the visible salary input + derived cells + hint
  const row = document.querySelector(`tr[data-row-idx="${idx}"]`);
  const inp = row && row.querySelectorAll('input')[2]; // Title, Level, Salary
  if (inp) inp.value = b.median;
  _lciRefreshDerived(idx);
  _lciRefreshBenchHint(idx);
}

// ── Grid change handlers ─────────────────────────────────────────────

function _lciMarkRowsDirty() {
  lciMarkRowsDirtyAll(); // defined in lci-sections.js — syncs all save buttons
}

function lciCoeCellChanged(idx, monthIdx, value) {
  const r = _lciCoeRows()[idx];
  const horizon = Number(_lciEd.model.HorizonMonths);
  const vals = lciMonthValues(r, horizon);
  vals[monthIdx] = Number(value) || 0;
  r.MonthValues = JSON.stringify(vals);
  _lciMarkRowsDirty();
  _lciRefreshDerived(idx);
}

function lciCoeFieldChanged(idx, field, value) {
  const r = _lciCoeRows()[idx];
  if (field === 'BonusPct') {
    r[field] = value === '' ? null : Number(value) / 100; // UI is whole %, stored as decimal
  } else if (field === 'AnnualSalary' || field === 'NoticeMonthsOverride') {
    // Blank must stay null — it means "inherit the model default", which is
    // not the same as 0 (start in the hire month).
    r[field] = value === '' ? null : Number(value);
  } else {
    r[field] = value;
  }
  _lciMarkRowsDirty();
  if (field === 'NoticeMonthsOverride') {
    // Shifts payroll timing for this role and toggles the ⚠, so re-render the
    // section rather than just the derived cells. _lciRerenderRoadmap also
    // refreshes the Cost Model output (N-018 rides on it).
    _lciRerenderRoadmap();
    return;
  }
  _lciRefreshDerived(idx);
  if (field === 'Title' || field === 'AnnualSalary') _lciRefreshBenchHint(idx);
}

// Refresh derived cells (row totals + footer) without a full re-render,
// so inputs keep focus. Pass an idx to refresh one row, or nothing for all.
function _lciRefreshDerived(idx = null) {
  const horizon = Number(_lciEd.model.HorizonMonths);
  const coeRows = _lciCoeRows();
  const targets = idx === null ? coeRows.map((_, i) => i) : [idx];
  for (const i of targets) {
    const r = coeRows[i];
    if (!r) continue;
    const hiresEl = document.getElementById(`lci-hires-${i}`);
    const costEl  = document.getElementById(`lci-cost-${i}`);
    if (hiresEl) hiresEl.textContent = lciMonthValues(r, horizon).reduce((a, b) => a + b, 0);
    if (costEl)  costEl.textContent  = Math.round(lciMonthlyCost(r, _lciEd.model)).toLocaleString();
  }
  const foot = document.getElementById('lci-roadmap-foot');
  if (foot) foot.innerHTML = _lciRoadmapFootHtml(horizon);
  if (typeof lciRefreshOutput === 'function') lciRefreshOutput();
}

// ── Add / remove rows ────────────────────────────────────────────────

// Push an empty CoE role row for a team, then re-render the roadmap.
function _lciPushCoeRow(team) {
  const maxSort = Math.max(0, ..._lciEd.rows.map(r => r.SortOrder || 0));
  _lciEd.rows.push({
    RowType: 'coe', Title: '', Team: team || 'Other', CareerLevel: '',
    AnnualSalary: null, BonusPct: 0, Quantity: 1, MonthValues: '[]',
    SortOrder: maxSort + 1,
  });
  _lciMarkRowsDirty();
  _lciRerenderRoadmap();
}
// "+ Add Team" — prompt for a name, seed it with one empty role.
function addLCITeam() {
  const team = prompt('New team name:');
  if (team === null) return;
  _lciPushCoeRow(team.trim() || 'Other');
}
// "+ Add role to [team]" — add an empty role to an existing team (no prompt).
// Takes the team's index into _lciTeamsInOrder(), re-derived here so the button
// carries no user text. Every mutation that could reorder that list
// (_lciPushCoeRow, removeLCICoeRow) re-renders the roadmap and regenerates the
// buttons. renameLCITeam / deleteLCITeam also change the team list, and they
// re-render too, so the index is always regenerated alongside the list.
// Guarded anyway: a stale index is a no-op, never a row on the wrong team.
function addLCIRoleToTeam(teamIndex) {
  const team = _lciTeamsInOrder()[teamIndex];
  if (team === undefined) return;
  _lciPushCoeRow(team);
}

// Teams are not an entity — they are derived from the Team field on CoE rows.
// So renaming a team rewrites Team on its rows, and deleting one deletes them.
// Rows are matched with the same expression the renderer groups by,
// `(r.Team || 'Other') === team`, so a row with a blank Team (shown under
// "Other") is picked up. Scoped to _lciCoeRows(): legacy rows have their own
// free-text Team column and must not be touched.
function _lciRowsInTeam(team) {
  return _lciCoeRows().filter(r => (r.Team || 'Other') === team);
}

// "Rename" — retitle every row in the team. Renaming onto an existing team
// merges the two, after an explicit confirm.
function renameLCITeam(teamIndex) {
  const teams = _lciTeamsInOrder();
  const team = teams[teamIndex];
  if (team === undefined) return;

  const input = prompt('Rename team:', team);
  if (input === null) return;                    // cancelled
  const next = input.trim() || 'Other';          // matches "+ Add Team"
  if (next === team) return;                     // no change — stay clean

  const rows = _lciRowsInTeam(team);
  if (teams.includes(next) &&
      !confirm(`"${next}" already exists. Merge "${team}" into "${next}"? ` +
               `${rows.length} role${rows.length === 1 ? '' : 's'} will move.`)) return;

  for (const r of rows) r.Team = next;
  _lciMarkRowsDirty();
  _lciRerenderRoadmap();
}

// "Delete" — remove the team and every role in it. Nothing else to remove: a
// team with no roles cannot exist. Rows with an id go to deletedRowIds so the
// next Save Roadmap deletes them in SharePoint.
function deleteLCITeam(teamIndex) {
  const team = _lciTeamsInOrder()[teamIndex];
  if (team === undefined) return;

  const rows = _lciRowsInTeam(team);
  if (!confirm(`Delete team "${team}" and its ${rows.length} ` +
               `role${rows.length === 1 ? '' : 's'}? This cannot be undone.`)) return;

  for (const r of rows) {
    if (r.id) _lciEd.deletedRowIds.push(r.id);
    // Remove by identity, not a captured index — indices shift as we splice.
    const at = _lciEd.rows.indexOf(r);
    if (at !== -1) _lciEd.rows.splice(at, 1);
  }
  _lciMarkRowsDirty();
  _lciRerenderRoadmap();
}

function removeLCICoeRow(idx) {
  const r = _lciCoeRows()[idx];
  if (!confirm(`Remove "${r.Title || 'this role'}" from the roadmap?`)) return;
  if (r.id) _lciEd.deletedRowIds.push(r.id);
  _lciEd.rows.splice(_lciEd.rows.indexOf(r), 1);
  _lciMarkRowsDirty();
  _lciRerenderRoadmap();
}

function _lciRerenderRoadmap() {
  // Full roadmap re-render (add/remove only — cell edits use _lciRefreshDerived).
  // Keeps the grid's horizontal/vertical scroll position; no-op when the
  // roadmap section isn't rendered (CoE section toggled off).
  replaceHtmlKeepingScroll('lci-roadmap-section', _lciRoadmapHtml(), '.lci-grid-scroll');
  // Shared state (lci-sections.js): also covers dirtyMilestones — a
  // milestone-only change used to leave this button disabled — and is safe
  // when the CoE section is toggled off and the button doesn't exist.
  _lciSyncSaveButtons();
  // Structural roadmap changes (add/remove role, add/rename/delete team) alter
  // the cost model, so recompute the output below — same as _lciReplaceSection
  // does for the legacy / one-off / fee sections. Cell edits reach this via
  // _lciRefreshDerived instead. Defensive typeof: lci-sections.js loads after
  // this file.
  if (typeof lciRefreshOutput === 'function') lciRefreshOutput();
}

// ── Save roadmap (diff-only batch) ───────────────────────────────────

async function saveLCIRoadmap() {
  // Re-entrancy guard: four buttons call this saver (roadmap + the three
  // section "Save Changes" buttons via saveLCIRows), and setButtonLoading only
  // ever disables the roadmap one. A second click while a save is in flight is
  // a silent no-op — the disabled buttons are the feedback.
  if (_lciSaveInFlight) return;
  const btn = document.getElementById('lci-roadmap-save');
  _lciSaveInFlight = true;
  setButtonLoading(btn);
  _lciSyncSaveButtons(); // disable ALL save buttons, not just btn
  try {
    const modelId = _lciEd.model.id;

    // Deletes
    for (const id of _lciEd.deletedRowIds) await deleteLCIRow(id);
    _lciEd.deletedRowIds = [];

    // Creates + diff-only updates
    for (const r of _lciEd.rows) {
      const snapshot = _lciRowSnapshot(r);
      if (!r.id) {
        const created = await createLCIRow({ ...snapshot, ModelIDLookupId: Number(modelId) });
        r.id = created.id;
        _lciEd.origRows.set(String(r.id), JSON.stringify(snapshot));
      } else if (_lciEd.origRows.get(String(r.id)) !== JSON.stringify(snapshot)) {
        await updateLCIRow(r.id, snapshot);
        _lciEd.origRows.set(String(r.id), JSON.stringify(snapshot));
      }
    }

    // Milestones save through the same button (separate SP list, diff-only)
    if (typeof _lciSaveMilestonesData === 'function') await _lciSaveMilestonesData();

    _lciEd.dirtyRows = false;
  } catch (e) {
    // dirtyRows stays true so the retry writes whatever didn't land; rows
    // already created carry their id, so the retry can't duplicate them.
    alert('Error saving roadmap: ' + e.message);
  } finally {
    // Must clear on every path — a stuck flag would leave the editor
    // permanently read-only until a page reload.
    _lciSaveInFlight = false;
    clearButtonLoading(btn);
    _lciSyncSaveButtons();
  }
}
