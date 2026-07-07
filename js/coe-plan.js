// js/coe-plan.js — CoE Hiring Plan page (Reporting module)
// Entry point: renderHiringPlanPage() — wired in nav.js
// Data: CoEPlanRows + CoEPlanForecast lists via api.js getters.
// Phase defaults: CONFIG.COE_PHASE_DEFAULTS. Handover excluded from v1.
// coeGanttHtml() is a pure renderer shared with the Report Builder
// (landscape final-page export) — no DOM access, no cache reads.

let _coeCache = null;   // { projectId, planRows, roles, placements, forecast }
let _coeTPFilter = '';  // '' = all TPs

// ── Date helpers ────────────────────────────────────────────────────

function coeMonday(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function coeAddWeeks(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}
function coeWeekIndex(timelineStart, d) {
  return Math.floor((coeMonday(d) - timelineStart) / (7 * 24 * 3600 * 1000));
}
function coeFmtShort(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';
}

// ── Plan span computation ───────────────────────────────────────────
// Returns { rWeeks, nWeeks, oWeeks, start, targetHireDate, endDate }
// Target Hire Date is DERIVED: OpenDate + rWeeks (end of Recruitment).

function computePlanSpans(row) {
  const dflt = CONFIG.COE_PHASE_DEFAULTS;
  const rWeeks = row.RecruitmentWeeks || dflt.recruitmentWeeks;
  const nWeeks = (row.NoticeWeeks ?? null) !== null && row.NoticeWeeks !== undefined && row.NoticeWeeks !== '' ? Number(row.NoticeWeeks) : dflt.noticeWeeks;
  const oWeeks = (row.OnboardingWeeks ?? null) !== null && row.OnboardingWeeks !== undefined && row.OnboardingWeeks !== '' ? Number(row.OnboardingWeeks) : dflt.onboardingWeeks;
  const start = coeMonday(row.OpenDate);
  return {
    rWeeks, nWeeks, oWeeks, start,
    targetHireDate: coeAddWeeks(start, rWeeks),
    endDate: coeAddWeeks(start, rWeeks + nWeeks + oWeeks),
  };
}

// Phase letter for a given week index relative to the row, or ''
function coePhaseAt(row, timelineStart, weekIdx) {
  const s = computePlanSpans(row);
  const rel = weekIdx - coeWeekIndex(timelineStart, s.start);
  if (rel < 0) return '';
  if (rel < s.rWeeks) return 'R';
  if (rel < s.rWeeks + s.nWeeks) return 'N';
  if (rel < s.rWeeks + s.nWeeks + s.oWeeks) return 'O';
  return '';
}

// ── Actuals overlay ─────────────────────────────────────────────────
// R = Role.OpenDate → Role.ActualHireDate (or today if not yet hired)
// N = Role.ActualHireDate → Placement.ProvisionalStartDate (or today)
// O = Placement.ProvisionalStartDate + onboarding weeks (plan value)

function coeActualPhaseAt(row, role, placement, timelineStart, weekIdx) {
  if (!role || !role.OpenDate) return '';
  const today = new Date();
  const s = computePlanSpans(row);
  const rStart = coeWeekIndex(timelineStart, role.OpenDate);
  const hireIdx  = role.ActualHireDate ? coeWeekIndex(timelineStart, role.ActualHireDate) : null;
  const startIdx = placement?.ProvisionalStartDate ? coeWeekIndex(timelineStart, placement.ProvisionalStartDate) : null;
  const todayIdx = coeWeekIndex(timelineStart, today);
  const rEnd = hireIdx !== null ? hireIdx : Math.min(todayIdx, rStart + 200);
  if (weekIdx >= rStart && weekIdx < rEnd) return 'R';
  if (hireIdx !== null) {
    const nEnd = startIdx !== null ? startIdx : todayIdx;
    if (weekIdx >= hireIdx && weekIdx < nEnd) return 'N';
  }
  if (startIdx !== null && weekIdx >= startIdx && weekIdx < startIdx + s.oWeeks) return 'O';
  return '';
}

// ── Page ────────────────────────────────────────────────────────────

async function renderHiringPlanPage(selectedProjectId = null) {
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="page-header"><h2>Hiring Plan</h2></div><p>Loading…</p>`;

  const email = getCurrentUser().email;
  const role  = _resolvedRole || getUserRole(email);
  const canEdit = role === 'admin' || role === 'delivery_manager';

  const projects = (await getScopedProjects(email, false)).filter(p => p.ProjectType === 'CoE');
  if (!projects.length) {
    main.innerHTML = `<div class="page-header"><h2>Hiring Plan</h2></div>
      <p>No CoE projects found. Set a project's type to <strong>CoE</strong> in the project form to build a hiring plan.</p>`;
    return;
  }
  const pid = selectedProjectId || projects[0].id;

  const [planRows, roles, forecast] = await Promise.all([
    getCoEPlanRows(pid),
    getRolesForProject(pid),
    getCoEPlanForecast(pid),
  ]);
  // Placements only needed for linked rows
  const linkedRoleIds = planRows.map(r => r.LinkedRoleID).filter(Boolean);
  const placements = [];
  for (const rid of linkedRoleIds) placements.push(...await getPlacements(rid));

  _coeCache = { projectId: pid, projects, planRows, roles, placements, forecast, canEdit };
  coeRenderBody();
}

function coeRenderBody() {
  const { projectId, projects, planRows, canEdit } = _coeCache;
  const main = document.getElementById('main-content');

  const projOpts = projects.map(p =>
    `<option value="${p.id}" ${p.id == projectId ? 'selected' : ''}>${p.CustomerName}</option>`).join('');
  const tps = [...new Set(planRows.map(r => r.TalentPartner).filter(Boolean))];
  const tpOpts = ['<option value="">All Talent Partners</option>']
    .concat(tps.map(t => `<option value="${t}" ${_coeTPFilter === t ? 'selected' : ''}>${t}</option>`)).join('');

  main.innerHTML = `
    <div class="page-header"><h2>Hiring Plan</h2></div>
    <div class="coe-toolbar">
      <select onchange="renderHiringPlanPage(parseInt(this.value))">${projOpts}</select>
      <select onchange="_coeTPFilter=this.value; coeRenderBody()">${tpOpts}</select>
      ${canEdit ? `<button class="btn-primary" onclick="coeOpenRowModal()">+ Add Planned Role</button>` : ''}
      <button class="print-btn" onclick="coeExportPDF()">⎙ Export PDF</button>
    </div>
    <div class="coe-legend">
      <span><span class="coe-swatch" style="background:#BDE3F5"></span> Recruitment</span>
      <span><span class="coe-swatch" style="background:#F5CCE8"></span> Notice</span>
      <span><span class="coe-swatch" style="background:#CDEBD3"></span> Onboarding</span>
      <span>Thin bar = actual (linked roles)</span>
    </div>
    <div id="coe-gantt"></div>
    <div class="page-header coe-fvp-header" style="margin-top:28px"><h3>Forecast vs Planned Hires</h3></div>
    <div id="coe-fvp"></div>
    <div id="coe-modal-host"></div>
  `;
  coeRenderGantt();
  coeRenderForecastTable();
}

// ── Gantt + capacity strip ──────────────────────────────────────────

// Shared row sort — used by the page and the Report Builder export
function coeSortRows(planRows) {
  return [...planRows].sort((a, b) =>
    (a.SortOrder || 0) - (b.SortOrder || 0) || new Date(a.OpenDate) - new Date(b.OpenDate));
}

// Thin DOM wrapper for the Hiring Plan page
function coeRenderGantt() {
  const { planRows, roles, placements, canEdit } = _coeCache;
  const host = document.getElementById('coe-gantt');
  const rows = coeSortRows(planRows.filter(r => !_coeTPFilter || r.TalentPartner === _coeTPFilter));
  if (!rows.length) { host.innerHTML = '<p>No planned roles yet.</p>'; return; }
  host.innerHTML = coeGanttHtml(rows, { roles, placements, canEdit, showActuals: true });
}

// Pure renderer — no DOM access, no cache reads. Returns the Gantt table HTML.
// opts: roles, placements (for actuals overlay), canEdit (actions column),
//       showActuals (thin actual bars on linked rows)
function coeGanttHtml(rows, opts = {}) {
  const { roles = [], placements = [], canEdit = false, showActuals = true } = opts;

  // Timeline: earliest plan/actual start → latest plan end, +2wk buffer each side
  const spans = rows.map(computePlanSpans);
  let tStart = coeMonday(new Date(Math.min(...spans.map(s => s.start))));
  let tEnd   = new Date(Math.max(...spans.map(s => s.endDate)));
  tStart = coeAddWeeks(tStart, -1);
  const nWeeks = Math.min(coeWeekIndex(tStart, tEnd) + 3, 90);
  const todayIdx = coeWeekIndex(tStart, new Date());

  // Month header spans
  const monthCells = [];
  let curLabel = null, span = 0;
  for (let w = 0; w < nWeeks; w++) {
    const d = coeAddWeeks(tStart, w);
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    if (label !== curLabel) { if (curLabel) monthCells.push({ label: curLabel, span }); curLabel = label; span = 1; }
    else span++;
  }
  monthCells.push({ label: curLabel, span });

  const roleById = Object.fromEntries(roles.map(r => [String(r.id), r]));
  const placementByRole = {};
  placements.forEach(p => { placementByRole[String(p.RoleIDLookupId)] = p; });

  // Capacity counts
  const cap = { R: Array(nWeeks).fill(0), N: Array(nWeeks).fill(0), O: Array(nWeeks).fill(0) };
  rows.forEach(row => {
    for (let w = 0; w < nWeeks; w++) {
      const ph = coePhaseAt(row, tStart, w);
      if (ph) cap[ph][w]++;
    }
  });

  const capHtml = ['R', 'N', 'O'].map(ph => {
    const names = { R: '# in Recruitment', N: '# in Notice', O: '# in Onboarding' };
    return `<tr class="coe-capacity"><th class="coe-sticky coe-sticky--1 coe-cap-label" colspan="1">${names[ph]}</th>
      <th class="coe-sticky coe-sticky--2"></th><th class="coe-sticky coe-sticky--3"></th><th class="coe-sticky coe-sticky--4"></th>
      ${cap[ph].map(c => `<td>${c || '–'}</td>`).join('')}${canEdit ? '<td class="coe-col-actions"></td>' : ''}</tr>`;
  }).join('');

  const bodyHtml = rows.map(row => {
    const s = computePlanSpans(row);
    const role = row.LinkedRoleID ? roleById[String(row.LinkedRoleID)] : null;
    const plc  = role ? placementByRole[String(role.id)] : null;
    const cells = [];
    for (let w = 0; w < nWeeks; w++) {
      const ph  = coePhaseAt(row, tStart, w);
      const aph = showActuals ? coeActualPhaseAt(row, role, plc, tStart, w) : '';
      const cls = ['coe-cell',
        ph  ? `coe-cell--${ph}`  : '',
        aph ? `coe-cell--a${aph}` : '',
        w === todayIdx ? 'coe-cell--today' : ''].filter(Boolean).join(' ');
      cells.push(`<td class="${cls}">${ph}</td>`);
    }
    const actions = canEdit ? `<td class="coe-col-actions"><div class="coe-row-actions">
        <button class="btn-secondary" onclick="coeOpenRowModal(${row.id})">Edit</button>
        <button class="btn-secondary" onclick="coeOpenLinkPicker(${row.id})">${row.LinkedRoleID ? 'Re-link' : 'Link'}</button>
        ${!row.LinkedRoleID ? `<button class="btn-secondary" onclick="coeCreateRoleFromRow(${row.id})">Create Role</button>` : ''}
        <button class="btn-secondary" onclick="coeDeleteRow(${row.id})">✕</button>
      </div></td>` : '';
    return `<tr>
      <td class="coe-sticky coe-sticky--1">${row.Title}${role ? ' 🔗' : ''}</td>
      <td class="coe-sticky coe-sticky--2">${row.TalentPartner || '—'}</td>
      <td class="coe-sticky coe-sticky--3">${coeFmtShort(row.OpenDate)}</td>
      <td class="coe-sticky coe-sticky--4">${coeFmtShort(s.targetHireDate)}</td>
      ${cells.join('')}${actions}</tr>`;
  }).join('');

  return `<div class="coe-gantt-wrap"><table class="coe-gantt">
    <thead>
      <tr><th class="coe-sticky coe-sticky--1" rowspan="2">Role</th>
          <th class="coe-sticky coe-sticky--2" rowspan="2">TP</th>
          <th class="coe-sticky coe-sticky--3" rowspan="2">Open</th>
          <th class="coe-sticky coe-sticky--4" rowspan="2">Target Hire</th>
          ${monthCells.map(m => `<th class="coe-month" colspan="${m.span}">${m.label}</th>`).join('')}
          ${canEdit ? '<th rowspan="2" class="coe-col-actions"></th>' : ''}</tr>
      <tr>${Array.from({ length: nWeeks }, (_, w) => `<th>${coeAddWeeks(tStart, w).getDate()}</th>`).join('')}</tr>
      ${capHtml}
    </thead>
    <tbody>${bodyHtml}</tbody>
  </table></div>`;
}

// ── Forecast vs Planned table ───────────────────────────────────────

function coeRenderForecastTable() {
  const { projectId, planRows, forecast, canEdit } = _coeCache;
  const host = document.getElementById('coe-fvp');
  const rows = planRows.filter(r => !_coeTPFilter || r.TalentPartner === _coeTPFilter);
  if (!rows.length) { host.innerHTML = ''; return; }

  // Month range = plan target-hire range
  const targets = rows.map(r => computePlanSpans(r).targetHireDate);
  const min = new Date(Math.min(...targets)), max = new Date(Math.max(...targets));
  const months = [];
  const cur = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cur <= max) { months.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }

  const fByMonth = {};
  forecast.forEach(f => {
    // SP returns ForecastMonth as UTC datetime (e.g. 2026-06-30T23:00:00Z
    // = 1 July 00:00 BST). new Date() converts back to local, so local
    // year/month give the intended month.
    const d = new Date(f.ForecastMonth);
    fByMonth[`${d.getFullYear()}-${d.getMonth()}`] = f;
  });

  let totP = 0, totF = 0;
  const body = months.map(m => {
    const key = `${m.getFullYear()}-${m.getMonth()}`;
    const planned = targets.filter(t => t.getFullYear() === m.getFullYear() && t.getMonth() === m.getMonth()).length;
    const fRow = fByMonth[key];
    const fVal = fRow ? fRow.ForecastedHires : '';
    totP += planned; totF += Number(fVal) || 0;
    const varc = fVal === '' ? '' : planned - Number(fVal);
    const varCls = varc === '' ? '' : varc < 0 ? 'coe-fvp-var-neg' : varc > 0 ? 'coe-fvp-var-pos' : '';
    // Build the ISO date manually — toISOString() shifts to UTC and can
    // land on the last day of the previous month during BST.
    const monthISO = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
    const fCell = canEdit
      ? `<input type="number" min="0" class="coe-fvp-input" value="${fVal}"
           onchange="coeSaveForecast('${monthISO}', this.value, ${fRow ? fRow.id : 'null'})">`
      : (fVal === '' ? '—' : fVal);
    return `<tr><td>${m.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td>
      <td>${fCell}</td><td>${planned}</td>
      <td class="${varCls}">${varc === '' ? '—' : (varc > 0 ? '+' : '') + varc}</td></tr>`;
  }).join('');

  host.innerHTML = `<table class="coe-fvp-table">
    <thead><tr><th>Month</th><th>Planned Hires</th><th>Forecasted Hires</th><th>Variance</th></tr></thead>
    <tbody>${body}
      <tr><th>Total</th><th>${totF}</th><th>${totP}</th><th></th></tr>
    </tbody></table>`;
}

async function coeSaveForecast(monthISO, value, existingId) {
  const hires = parseInt(value);
  if (isNaN(hires) || hires < 0) return;
  await saveCoEForecastMonth(_coeCache.projectId, monthISO, hires, existingId);
  _coeCache.forecast = await getCoEPlanForecast(_coeCache.projectId);
  coeRenderForecastTable();
}

// ── Row CRUD modal ──────────────────────────────────────────────────

async function coeOpenRowModal(rowId = null) {
  const { projectId, planRows } = _coeCache;
  const row = rowId ? planRows.find(r => r.id === rowId) : null;
  const dflt = CONFIG.COE_PHASE_DEFAULTS;
  const tps = await getTalentPartnersForProject(projectId);
  // getTalentPartnersForProject returns UserAssignments rows (UserName / UserEmail)
  const tpOpts = ['<option value="">-- Unassigned --</option>']
    .concat(tps.map(t => {
      const label = t.UserName || t.UserEmail;
      return `<option value="${label}" ${row?.TalentPartner === label ? 'selected' : ''}>${label}</option>`;
    })).join('');

  document.getElementById('coe-modal-host').innerHTML = `
    <div class="form-container" id="coe-row-modal">
      <h2>${row ? 'Edit' : 'Add'} Planned Role</h2>
      <div id="coe-row-form-error" class="form-error"></div>
      <form id="coe-row-form" onsubmit="coeSubmitRow(event, ${rowId || 'null'})">
        <div class="form-group"><label>Role Title *</label>
          <input type="text" name="Title" required value="${row?.Title || ''}"></div>
        <div class="form-group"><label>Talent Partner</label>
          <select name="TalentPartner">${tpOpts}</select></div>
        <div class="form-group"><label>Planned Open Date *</label>
          <input type="date" name="OpenDate" required value="${row?.OpenDate ? row.OpenDate.split('T')[0] : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>Recruitment (wks)</label>
            <input type="number" min="1" name="RecruitmentWeeks" placeholder="${dflt.recruitmentWeeks}" value="${row?.RecruitmentWeeks || ''}"></div>
          <div class="form-group"><label>Notice (wks)</label>
            <input type="number" min="0" name="NoticeWeeks" placeholder="${dflt.noticeWeeks}" value="${row?.NoticeWeeks ?? ''}"></div>
          <div class="form-group"><label>Onboarding (wks)</label>
            <input type="number" min="0" name="OnboardingWeeks" placeholder="${dflt.onboardingWeeks}" value="${row?.OnboardingWeeks ?? ''}"></div>
        </div>
        <p style="font-size:12px;color:#777">Leave phase fields blank to use defaults. Target Hire Date = Open Date + Recruitment weeks.</p>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${row ? 'Save Changes' : 'Add to Plan'}</button>
          <button type="button" class="btn-secondary" onclick="document.getElementById('coe-modal-host').innerHTML=''">Cancel</button>
        </div>
      </form>
    </div>`;
  document.getElementById('coe-row-modal').scrollIntoView({ behavior: 'smooth' });
}

async function coeSubmitRow(event, rowId) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(document.getElementById('coe-row-form')));
  const payload = {
    Title:            data.Title,
    ProjectID:        _coeCache.projectId,
    TalentPartner:    data.TalentPartner || undefined,
    OpenDate:         isoDate(data.OpenDate),
    RecruitmentWeeks: data.RecruitmentWeeks ? parseInt(data.RecruitmentWeeks) : null,
    NoticeWeeks:      data.NoticeWeeks !== '' ? parseInt(data.NoticeWeeks) : null,
    OnboardingWeeks:  data.OnboardingWeeks !== '' ? parseInt(data.OnboardingWeeks) : null,
  };
  try {
    if (rowId) await updateCoEPlanRow(rowId, payload);
    else await createCoEPlanRow(payload);
    await renderHiringPlanPage(_coeCache.projectId);
  } catch (e) {
    showFormError('coe-row-form', `Error saving: ${e.message}`);
  }
}

async function coeDeleteRow(rowId) {
  if (!confirm('Remove this planned role from the hiring plan?')) return;
  await deleteCoEPlanRow(rowId);
  await renderHiringPlanPage(_coeCache.projectId);
}

// ── Roles linkage ───────────────────────────────────────────────────

function coeOpenLinkPicker(rowId) {
  const { roles, planRows } = _coeCache;
  const linked = new Set(planRows.map(r => r.LinkedRoleID).filter(Boolean));
  const opts = roles
    .filter(r => !linked.has(r.id))
    .map(r => `<option value="${r.id}">${r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle}</option>`).join('');
  document.getElementById('coe-modal-host').innerHTML = `
    <div class="form-container" id="coe-link-modal">
      <h2>Link to Live Role</h2>
      <div class="form-group"><label>Role</label>
        <select id="coe-link-select"><option value="">-- Select role --</option>${opts}</select></div>
      <div class="form-actions">
        <button class="btn-primary" onclick="coeSaveLink(${rowId})">Link</button>
        <button class="btn-secondary" onclick="coeSaveLink(${rowId}, true)">Unlink</button>
        <button class="btn-secondary" onclick="document.getElementById('coe-modal-host').innerHTML=''">Cancel</button>
      </div>
    </div>`;
  document.getElementById('coe-link-modal').scrollIntoView({ behavior: 'smooth' });
}

async function coeSaveLink(rowId, unlink = false) {
  const val = unlink ? null : parseInt(document.getElementById('coe-link-select').value) || null;
  await updateCoEPlanRow(rowId, { LinkedRoleID: val });
  await renderHiringPlanPage(_coeCache.projectId);
}

// "Create Role from row" — opens the existing Add Role form pre-filled.
// After the role is saved (form navigates to Roles page), return to the
// Hiring Plan and use Link to connect the new role to the plan row.
async function coeCreateRoleFromRow(rowId) {
  const row = _coeCache.planRows.find(r => r.id === rowId);
  const main = document.getElementById('main-content');
  main.innerHTML = await renderRoleForm(null, _coeCache.projectId);
  const titleInput = document.querySelector('#role-form [name="RoleTitle"]');
  if (titleInput && row) titleInput.value = row.Title;
  const openInput = document.querySelector('#role-form [name="OpenDate"]');
  if (openInput && row?.OpenDate) openInput.value = row.OpenDate.split('T')[0];
}

// ── Print / PDF export ──────────────────────────────────────────────
function coeExportPDF() {
  const proj = _coeCache.projects.find(p => p.id == _coeCache.projectId);
  printPage(`Hiring Plan — ${proj ? proj.CustomerName : ''}`, true, 'Reporting');
}
