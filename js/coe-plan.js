// js/coe-plan.js — CoE Hiring Plan page (Reporting module)
// Entry point: renderHiringPlanPage() — wired in nav.js
// Data: CoEPlanRows + CoEPlanForecast lists via api.js getters. N-312: a plan
// row links to ONE hire slot — CoEPlanRows.LinkedHeadcountID → RoleHeadcount —
// with LinkedRoleID kept in sync (linkCoEPlanRow / unlinkCoEPlanRow, api-coe.js).
// Phase defaults: CONFIG.COE_PHASE_DEFAULTS. Handover excluded from v1.
// coeGanttHtml() is a pure renderer shared with the Report Builder
// (landscape final-page export) — no DOM access, no cache reads.

let _coeCache = null;   // { projectId, planRows, roles, headcount, placements, forecast } — headcount null = read failed
let _coeTPFilter = '';  // '' = all TPs

// ── Date helpers ────────────────────────────────────────────────────
// N-089: this file's date model is deliberately LOCAL midnight throughout.
// coeMonday/coeAddWeeks/coeWeekIndex must NOT be migrated to spDateOut() or
// utcDateOnly() — a local-midnight BST Date read through UTC getters is the
// PREVIOUS day, which is exactly the N-081 bug (every Gantt cell rendered one
// week left of its header). The local model is safe only because every CoE
// date is written through isoDate() as 'T12:00:00Z': midday UTC carries ±11h
// of headroom, so the intended calendar day survives any realistic browser
// offset. N-136: ±11h, NOT ±12h — at exactly UTC+12 midday UTC is midnight the
// NEXT local day, so a local-getter read returns the following date. Real zones
// affected: Pacific/Auckland (+12 winter, +13 summer) and Pacific/Kiritimati
// (+14). coeFmtShort() is immune since N-136 (it pins its formatter to UTC);
// coeMonday()/coeWeekIndex() still share the limit and are deliberately NOT
// rebuilt on UTC — that is the rewrite N-089 considered and rejected, of the
// one code path N-077 and N-081 broke twice. Not a live concern at UK+0..+2.
// Note the ±12h figure on spMonthIn() in utils.js is a DIFFERENT quantity (the
// SITE's offset) and is correct — do not "fix" it to match this one. N-130 closed the last gap: CoEPlanForecast.ForecastMonth used to be
// written as a bare 'YYYY-MM-01' (SharePoint reinterpreted it in the site's
// timezone) and read back with local getters, which cancelled out only for
// browsers at or AHEAD of the site's offset. It now writes through isoDate()
// and reads through spMonthIn(), which is timezone-independent and still
// handles the legacy stored shapes — no rows were migrated.
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
  // Math.round, not floor (N-081): coeMonday() returns LOCAL midnight, so
  // Mondays either side of a GMT/BST switch sit ±1h off exact-week
  // multiples — floor drops a week whenever tStart is GMT and d is BST.
  // Gaps are always whole weeks ±1h, so round is exact.
  return Math.round((coeMonday(d) - timelineStart) / (7 * 24 * 3600 * 1000));
}
function coeFmtShort(d) {
  // N-136: timeZone 'UTC' is load-bearing, not decoration. CoE dates are stored
  // at T12:00:00Z and the stored value's UTC day IS the intended day, so pinning
  // the formatter to UTC makes the output independent of the viewer's offset. A
  // LOCAL render is not: at exactly UTC+12 midday-UTC is midnight the NEXT local
  // day, so this returned the following date from NZ/Fiji/Kiribati.
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '—';
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

// ── Actuals overlay (N-312: per headcount) ──────────────────────────
// spans = coeHeadcountActualSpans() (utils.js) for the row's linked headcount:
// R = headcount OpenDate → placement OfferAcceptedDate (cancelled: its
//     CancelledDate; still open: today)
// N = OfferAcceptedDate → Placement.ProvisionalStartDate (or today)
// O = Placement.ProvisionalStartDate + onboarding weeks (plan value, oWeeks)
// Span values are stored SharePoint strings fed straight to coeWeekIndex —
// the local date model above is unchanged (N-089).

function coeActualPhaseAt(spans, oWeeks, timelineStart, weekIdx) {
  if (!spans || !spans.rStart) return '';
  const idx = d => coeWeekIndex(timelineStart, d);
  const rStart = idx(spans.rStart);
  // An open-ended R (no offer yet) is capped, as before N-312.
  const rEnd = spans.nStart ? idx(spans.rEnd) : Math.min(idx(spans.rEnd), rStart + 200);
  if (weekIdx >= rStart && weekIdx < rEnd) return 'R';
  if (spans.nStart && weekIdx >= idx(spans.nStart) && weekIdx < idx(spans.nEnd)) return 'N';
  if (spans.oStart) {
    const oStart = idx(spans.oStart);
    if (weekIdx >= oStart && weekIdx < oStart + oWeeks) return 'O';
  }
  return '';
}

// ── Page ────────────────────────────────────────────────────────────

async function renderHiringPlanPage(selectedProjectId = null) {
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="page-header"><h2>Hiring Plan</h2></div><p>Loading…</p>`;

  const email = getCurrentUser().email;
  const role  = _resolvedRole || 'viewer';
  const canEdit = role === 'admin' || role === 'delivery_manager';
  const isAdmin = role === 'admin';

  const projects = (await getScopedProjects(email, false)).filter(p => p.ProjectType === 'CoE');
  if (!projects.length) {
    main.innerHTML = `<div class="page-header"><h2>Hiring Plan</h2></div>
      <p>No CoE projects found. Set a project's type to <strong>CoE</strong> in the project form to build a hiring plan.</p>`;
    return;
  }
  const pid = selectedProjectId || projects[0].id;

  const [planRows, roles, forecast, headcount] = await Promise.all([
    getCoEPlanRows(pid),
    getRolesForProject(pid),
    getCoEPlanForecast(pid),
    // N-312: degrade, don't blank the page — a failed headcount read means no
    // actual bars, and Link / Create Headcount say so when used.
    getHeadcountForProject(pid).catch(e => { console.warn('Hiring Plan: headcount read failed', e); return null; }),
  ]);
  // N-312: one placements read for the project's roles — the overlay and the
  // link picker's "filled" label both need it. _odataIn drops the clause above
  // CONFIG.ROLE_ID_FILTER_MAX and returns every placement, so always filter.
  const roleIdSet = new Set(roles.map(r => String(r.id)));
  const placements = roles.length
    ? (await getPlacements(null, { roleIds: roles.map(r => r.id) }))
        .filter(p => roleIdSet.has(String(p.RoleIDLookupId)))
    : [];

  _coeCache = { projectId: pid, projects, planRows, roles, headcount, placements, forecast, canEdit, isAdmin };
  coeRenderBody();
}

function coeRenderBody() {
  const { projectId, projects, planRows, canEdit, isAdmin } = _coeCache;
  const main = document.getElementById('main-content');

  const projOpts = projects.map(p =>
    `<option value="${p.id}" ${p.id == projectId ? 'selected' : ''}>${escHtml(p.CustomerName)}</option>`).join('');
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
      ${isAdmin && planRows.length ? `<button class="btn-danger" id="coe-delete-plan-btn" onclick="coeDeletePlan()">Delete Plan</button>` : ''}
    </div>
    <div class="coe-legend">
      <span><span class="coe-swatch" style="background:var(--c-blue-pale)"></span> Recruitment</span>
      <span><span class="coe-swatch" style="background:var(--c-pink-pale)"></span> Notice</span>
      <span><span class="coe-swatch" style="background:var(--c-green-pale-border)"></span> Onboarding</span>
      <span>Thin bar = actual (linked headcount)</span>
    </div>
    <div id="coe-gantt"></div>
    <div class="page-header coe-fvp-header" style="margin-top:28px"><h3>Forecast vs Planned Hires</h3></div>
    <div id="coe-fvp"></div>
    <div id="coe-modal-host"></div>
  `;
  coeRenderGantt();
  coeRenderForecastTable();
  const proj = projects.find(p => p.id == projectId);
  renderBreadcrumb('hiringPlan', proj ? proj.CustomerName : undefined);
}

// ── Gantt + capacity strip ──────────────────────────────────────────

// Shared row sort — used by the page and the Report Builder export
function coeSortRows(planRows) {
  return [...planRows].sort((a, b) =>
    (a.SortOrder || 0) - (b.SortOrder || 0) || new Date(a.OpenDate) - new Date(b.OpenDate));
}

// Thin DOM wrapper for the Hiring Plan page
function coeRenderGantt() {
  const { planRows, headcount, placements, canEdit } = _coeCache;
  const host = document.getElementById('coe-gantt');
  const rows = coeSortRows(planRows.filter(r => !_coeTPFilter || r.TalentPartner === _coeTPFilter));
  if (!rows.length) { host.innerHTML = '<p>No planned roles yet.</p>'; return; }
  host.innerHTML = coeGanttHtml(rows, { headcount, placements, canEdit, showActuals: true });
}

// Pure renderer — no DOM access, no cache reads. Returns the Gantt table HTML.
// opts: headcount, placements (actuals overlay + 🔗 — N-312: per headcount),
//       canEdit (actions column), showActuals (thin actual bars on linked rows).
//       The Report Builder passes neither headcount nor placements: plan only.
function coeGanttHtml(rows, opts = {}) {
  const { headcount = [], placements = [], canEdit = false, showActuals = true } = opts;

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

  // N-312: keyed on String — SP item ids arrive as strings, the Number
  // columns (LinkedHeadcountID, HeadcountID) as numbers.
  const hcById  = Object.fromEntries((headcount || []).map(h => [String(h.id), h]));
  const fillMap = headcountFillMap(placements);
  const now     = new Date();

  // Capacity counts
  const cap = { R: Array(nWeeks).fill(0), N: Array(nWeeks).fill(0), O: Array(nWeeks).fill(0) };
  rows.forEach(row => {
    for (let w = 0; w < nWeeks; w++) {
      const ph = coePhaseAt(row, tStart, w);
      if (ph) cap[ph][w]++;
    }
  });

  const capHtml = ['R', 'N', 'O'].map((ph, i) => {
    const names = { R: '# in Recruitment', N: '# in Notice', O: '# in Onboarding' };
    return `<tr class="coe-capacity coe-capacity--${i}"><th class="coe-sticky coe-sticky--1 coe-cap-label" colspan="1">${names[ph]}</th>
      <th class="coe-sticky coe-sticky--2"></th><th class="coe-sticky coe-sticky--3"></th><th class="coe-sticky coe-sticky--4"></th>
      ${cap[ph].map(c => `<td>${c || '–'}</td>`).join('')}${canEdit ? '<td class="coe-col-actions"></td>' : ''}</tr>`;
  }).join('');

  const bodyHtml = rows.map(row => {
    const s = computePlanSpans(row);
    const linked = !_isBlankId(row.LinkedHeadcountID);
    const hc = linked ? (hcById[String(row.LinkedHeadcountID)] || null) : null;
    const actual = showActuals && hc ? coeHeadcountActualSpans(hc, fillMap.get(String(hc.id)), now) : null;
    const cells = [];
    for (let w = 0; w < nWeeks; w++) {
      const ph  = coePhaseAt(row, tStart, w);
      const aph = coeActualPhaseAt(actual, s.oWeeks, tStart, w);
      const cls = ['coe-cell',
        ph  ? `coe-cell--${ph}`  : '',
        aph ? `coe-cell--a${aph}` : '',
        w === todayIdx ? 'coe-cell--today' : ''].filter(Boolean).join(' ');
      cells.push(`<td class="${cls}">${ph}</td>`);
    }
    const actions = canEdit ? `<td class="coe-col-actions"><div class="coe-row-actions">
        <button class="btn-secondary" onclick="coeOpenRowModal(${row.id})">Edit</button>
        <button class="btn-secondary" onclick="coeOpenLinkPicker(${row.id})">${linked ? 'Re-link' : 'Link'}</button>
        ${!linked ? `<button class="btn-secondary" onclick="coeCreateHeadcountFromRow(${row.id})">Create Headcount</button>` : ''}
        <button class="btn-secondary" onclick="coeDeleteRow(${row.id})">✕</button>
      </div></td>` : '';
    return `<tr>
      <td class="coe-sticky coe-sticky--1">${escHtml(row.Title)}${hc ? ' 🔗' : ''}</td>
      <td class="coe-sticky coe-sticky--2">${escHtml(row.TalentPartner || '—')}</td>
      <td class="coe-sticky coe-sticky--3">${coeFmtShort(row.OpenDate)}</td>
      <td class="coe-sticky coe-sticky--4">${coeFmtShort(s.targetHireDate)}</td>
      ${cells.join('')}${actions}</tr>`;
  }).join('');

  return `<div class="coe-gantt-wrap table-scroll"><table class="coe-gantt">
    <thead>
      <tr class="coe-gantt-month-row"><th class="coe-sticky coe-sticky--1 coe-th-split-top">Role</th>
          <th class="coe-sticky coe-sticky--2 coe-th-split-top">TP</th>
          <th class="coe-sticky coe-sticky--3 coe-th-split-top">Open</th>
          <th class="coe-sticky coe-sticky--4 coe-th-split-top">Target Hire</th>
          ${monthCells.map(m => `<th class="coe-month" colspan="${m.span}">${m.label}</th>`).join('')}
          ${canEdit ? '<th class="coe-col-actions coe-th-split-top"></th>' : ''}</tr>
      <tr class="coe-gantt-date-row"><th class="coe-sticky coe-sticky--1 coe-th-split-bottom"></th><th class="coe-sticky coe-sticky--2 coe-th-split-bottom"></th><th class="coe-sticky coe-sticky--3 coe-th-split-bottom"></th><th class="coe-sticky coe-sticky--4 coe-th-split-bottom"></th>${Array.from({ length: nWeeks }, (_, w) => `<th>${coeAddWeeks(tStart, w).getDate()}</th>`).join('')}${canEdit ? '<th class="coe-col-actions coe-th-split-bottom"></th>' : ''}</tr>
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

  // N-130: spMonthIn() reads UTC only and tolerates all three stored shapes,
  // so the key no longer depends on the browser's offset. Both sides of this
  // lookup use 'YYYY-MM' — if only one is changed, every forecast cell silently
  // renders empty because the keys stop matching.
  const fByMonth = {};
  forecast.forEach(f => {
    const key = spMonthIn(f.ForecastMonth);
    if (key) fByMonth[key] = f;
  });

  let totP = 0, totF = 0;
  const body = months.map(m => {
    const key = monthKeyFromISO(localDayISO(m));
    const planned = targets.filter(t => t.getFullYear() === m.getFullYear() && t.getMonth() === m.getMonth()).length;
    const fRow = fByMonth[key];
    const fVal = fRow ? fRow.ForecastedHires : '';
    totP += planned; totF += Number(fVal) || 0;
    const varc = fVal === '' ? '' : planned - Number(fVal);
    const varCls = varc === '' ? '' : varc < 0 ? 'coe-fvp-var-neg' : varc > 0 ? 'coe-fvp-var-pos' : '';
    // N-089: localDayISO() is the canonical form of the manual build this
    // replaced — m is already local-midnight on the 1st, so the string is
    // byte-identical, and toISOString() is still the thing being avoided.
    const monthISO = localDayISO(m);
    const fCell = canEdit
      ? `<input type="number" min="0" class="coe-fvp-input" value="${fVal}"
           onchange="coeSaveForecast('${escJsAttr(monthISO)}', this.value, ${fRow ? fRow.id : 'null'})">`
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
  // SharePoint item ids come back from getItems() as strings, but the Gantt's
  // onclick emits a number literal — compare as strings (cf. roleById below).
  const row = rowId ? planRows.find(r => String(r.id) === String(rowId)) : null;
  const dflt = CONFIG.COE_PHASE_DEFAULTS;
  const tps = await getTalentPartnersForProject(projectId);
  // getTalentPartnersForProject returns UserAssignments rows (UserName / UserEmail)
  const tpOpts = ['<option value="">-- Unassigned --</option>']
    .concat(tps.map(t => {
      const label = t.UserName || t.UserEmail;
      return `<option value="${label}" ${row?.TalentPartner === label ? 'selected' : ''}>${label}</option>`;
    })).join('');

  document.getElementById('coe-modal-host').innerHTML = `
    <div style="display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;align-items:center;justify-content:center">
    <div class="form-container form-container--modal" id="coe-row-modal" style="max-width:640px;max-height:92vh;overflow-y:auto">
      <h2>${row ? 'Edit' : 'Add'} Planned Role</h2>
      <div id="coe-row-form-error" class="form-error"></div>
      <form id="coe-row-form" onsubmit="coeSubmitRow(event, ${rowId || 'null'})">
        <div class="form-group"><label>Role Title *</label>
          <input type="text" name="Title" required value="${escAttr(row?.Title || '')}"></div>
        <div class="form-group"><label>Talent Partner</label>
          <select name="TalentPartner">${tpOpts}</select></div>
        <div class="form-group"><label>Planned Open Date *</label>
          <input type="date" name="OpenDate" required value="${escAttr(spDateIn(row?.OpenDate) || '')}"></div>
        <div class="form-row">
          <div class="form-group"><label>Recruitment (wks)</label>
            <input type="number" min="1" name="RecruitmentWeeks" placeholder="${dflt.recruitmentWeeks}" value="${row?.RecruitmentWeeks || ''}"></div>
          <div class="form-group"><label>Notice (wks)</label>
            <input type="number" min="0" name="NoticeWeeks" placeholder="${dflt.noticeWeeks}" value="${row?.NoticeWeeks ?? ''}"></div>
          <div class="form-group"><label>Onboarding (wks)</label>
            <input type="number" min="0" name="OnboardingWeeks" placeholder="${dflt.onboardingWeeks}" value="${row?.OnboardingWeeks ?? ''}"></div>
        </div>
        <p style="font-size:12px;color:var(--text-muted)">Leave phase fields blank to use defaults. Target Hire Date = Open Date + Recruitment weeks.</p>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${row ? 'Save Changes' : 'Add to Plan'}</button>
          <button type="button" class="btn-secondary" onclick="document.getElementById('coe-modal-host').innerHTML=''">Cancel</button>
        </div>
      </form>
    </div>
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
  if (!(await confirmModal({
    message: 'Remove this planned role from the hiring plan?',
    confirmLabel: 'Remove', danger: true,
  }))) return;
  await deleteCoEPlanRow(rowId);
  await renderHiringPlanPage(_coeCache.projectId);
}

// N-080: admin-only — delete the project's ENTIRE hiring plan (all rows,
// ignoring the TP filter). Linked live Roles, Placements and Forecast
// values are untouched. Sequential deletes match the v1 write pattern.
async function coeDeletePlan() {
  const { planRows, projectId } = _coeCache;
  if (!planRows.length) return;
  if (!(await confirmModal({
    message: `Delete the entire hiring plan — all ${planRows.length} planned role(s) on this project? (Applies to the whole plan regardless of the TP filter. Linked live Roles and Forecast values are kept.)`,
    confirmLabel: 'Delete plan', danger: true,
  }))) return;
  const btn = document.getElementById('coe-delete-plan-btn');
  setButtonLoading(btn, 'Deleting…');
  try {
    let done = 0;
    for (const r of planRows) {
      await deleteCoEPlanRow(r.id);
      done++;
      if (btn) btn.textContent = `Deleting… ${done}/${planRows.length}`;
    }
    await renderHiringPlanPage(projectId);
  } catch (e) {
    clearButtonLoading(btn);
    toast(`Error deleting plan: ${e.message}`, { type: 'error' });
  }
}

// ── Headcount linkage (N-312 / HC-6) ────────────────────────────────
// A plan row links to ONE headcount. The picker population is spec S-1
// (coeLinkableHeadcount, utils.js): not linked elsewhere, not cancelled, on a
// pipeline outside PLAN_LINKABLE_EXCLUDED_STAGES (Backlog stays linkable);
// filled headcount on an open pipeline are offered, labelled "filled".

let _coeBusy = false;   // one link / create write at a time (N-106)

function _coeRowById(rowId) {
  // SP item ids arrive as strings, onclick emits numbers — compare as strings.
  return (_coeCache.planRows || []).find(r => String(r.id) === String(rowId)) || null;
}

function _coeHeadcountUnavailable() {
  if (_coeCache.headcount) return false;
  toast("Couldn't load this project's headcount — refresh and try again.", { type: 'error' });
  return true;
}

function coeOpenLinkPicker(rowId) {
  if (_coeHeadcountUnavailable()) return;
  const { roles, headcount, placements, planRows } = _coeCache;
  const row = _coeRowById(rowId);
  const linked = !!row && !_isBlankId(row.LinkedHeadcountID);
  const groups = coeLinkableHeadcount({
    roles, headcount, placements, planRows,
    currentHeadcountId: linked ? row.LinkedHeadcountID : null,
    excludedStages: PLAN_LINKABLE_EXCLUDED_STAGES,
  });
  const opts = groups.length
    ? groups.map(g => `<optgroup label="${escAttr(g.roleLabel)}">` + g.options.map(o =>
        `<option value="${Number(o.id)}"${o.current ? ' selected' : ''}>${escHtml(o.label)}</option>`).join('') + '</optgroup>').join('')
    : '<option value="" disabled>-- No linkable headcount — add headcount on the role page --</option>';

  document.getElementById('coe-modal-host').innerHTML = `
    <div style="display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;align-items:center;justify-content:center">
    <div class="form-container form-container--modal" id="coe-link-modal" style="max-width:640px;max-height:92vh;overflow-y:auto">
      <h2>Link to Headcount</h2>
      <div class="form-group"><label>Headcount</label>
        <select id="coe-link-select"><option value="">-- Select headcount --</option>${opts}</select></div>
      <div class="form-actions">
        <button class="btn-primary" onclick="coeSaveLink(${Number(rowId)})">Link</button>
        ${linked ? `<button class="btn-secondary" onclick="coeSaveLink(${Number(rowId)}, true)">Unlink</button>` : ''}
        <button class="btn-secondary" onclick="document.getElementById('coe-modal-host').innerHTML=''">Cancel</button>
      </div>
    </div>
    </div>`;
  document.getElementById('coe-link-modal').scrollIntoView({ behavior: 'smooth' });
}

async function coeSaveLink(rowId, unlink = false) {
  // N-106 pattern: capture the button synchronously, before any await.
  const btn = event?.target;
  if (_coeBusy) return;
  let hc = null;
  if (!unlink) {
    const val = document.getElementById('coe-link-select').value;
    hc = (_coeCache.headcount || []).find(h => String(h.id) === String(val)) || null;
    if (!hc) { toast('Choose a headcount to link.', { type: 'error' }); return; }
  }
  _coeBusy = true;
  setButtonLoading(btn);
  try {
    if (unlink) await unlinkCoEPlanRow(rowId);
    else await linkCoEPlanRow(rowId, hc);
  } catch (e) {
    _coeBusy = false;
    clearButtonLoading(btn);
    toast(`Couldn't save the link: ${e.message}`, { type: 'error' });
    return;
  }
  _coeBusy = false;
  await renderHiringPlanPage(_coeCache.projectId);
}

// "Create Headcount" — one new headcount for the row, linked straight back:
//   existing pipeline (S-4): a pipeline in this project outside
//     PLAN_LINKABLE_EXCLUDED_STAGES — Closed is not offered; reopening a
//     Closed pipeline (D-3) stays on the role page;
//   new pipeline (S-6): the Add Role form, pre-filled; submitRoleForm links
//     its first headcount to the row via the hidden LinkPlanRowID field.
// Dates (S-5) pre-fill from the row — Planned Open Date and the derived Target
// Hire (Open + Recruitment weeks) — and are editable; a cleared Open Date gives
// a "planned, not active" headcount.
function coeCreateHeadcountFromRow(rowId) {
  const { roles, headcount } = _coeCache;
  const row = _coeRowById(rowId);
  if (!row) return;
  const pipelines = (roles || [])
    .filter(r => !PLAN_LINKABLE_EXCLUDED_STAGES.includes(normaliseRoleStage(r.Stage)))
    .sort((a, b) => placementRoleLabel(a).localeCompare(placementRoleLabel(b)));
  const canExisting = !!headcount && pipelines.length > 0;
  const openDay   = row.OpenDate ? (spDateIn(row.OpenDate) || '') : '';
  // targetHireDate is a local-midnight Date (coe model) — localDayISO, not UTC.
  const targetDay = row.OpenDate ? (localDayISO(computePlanSpans(row).targetHireDate) || '') : '';
  const roleOpts = pipelines.map(r =>
    `<option value="${Number(r.id)}">${escHtml(placementRoleLabel(r))}</option>`).join('');
  const why = !headcount ? "Couldn't load headcount — only a new pipeline can be created."
    : 'No open pipelines on this project — create a new one.';

  document.getElementById('coe-modal-host').innerHTML = `
    <div style="display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;align-items:center;justify-content:center">
    <div class="form-container form-container--modal" id="coe-create-modal" style="max-width:640px;max-height:92vh;overflow-y:auto">
      <h2>Create Headcount</h2>
      <p class="form-section-note">For plan row: ${escHtml(row.Title || '')}</p>
      <div class="form-group">
        <label class="role-hc-check"><input type="radio" name="coe-create-mode" value="existing" onchange="coeCreateModeChange()"${canExisting ? ' checked' : ' disabled'}> Add to an existing pipeline</label>
        <label class="role-hc-check"><input type="radio" name="coe-create-mode" value="new" onchange="coeCreateModeChange()"${canExisting ? '' : ' checked'}> Create a new pipeline (opens Add Role)</label>
        ${canExisting ? '' : `<p class="form-section-note">${escHtml(why)}</p>`}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="coe-create-open">Open Date</label>
          <input type="date" id="coe-create-open" value="${escAttr(openDay)}" onchange="rpAutoTarget('coe-create-open', 'coe-create-target')">
        </div>
        <div class="form-group">
          <label for="coe-create-target">Target Hire Date</label>
          <input type="date" id="coe-create-target" value="${escAttr(targetDay)}">
        </div>
      </div>
      <p class="form-section-note">From the plan row. Clear Open Date for a headcount that is planned, not yet active.</p>
      <div id="coe-create-existing"${canExisting ? '' : ' hidden'}>
        <div class="form-group"><label for="coe-create-role">Pipeline *</label>
          <select id="coe-create-role"><option value="">-- Select pipeline --</option>${roleOpts}</select></div>
        <div class="form-group">
          <label class="role-hc-check"><input type="checkbox" id="coe-create-backfill"> Backfill</label>
        </div>
        <div class="form-group">
          <label for="coe-create-notes">Notes</label>
          <textarea id="coe-create-notes" rows="2"></textarea>
        </div>
      </div>
      <p class="form-section-note" id="coe-create-new"${canExisting ? ' hidden' : ''}>The Add Role form opens pre-filled with this row's title and dates. Its Headcount 1 is linked to this row when you save.</p>
      <div class="form-actions">
        <button class="btn-primary" id="coe-create-save" onclick="coeSubmitCreateFromRow(${Number(rowId)})">Continue</button>
        <button class="btn-secondary" onclick="document.getElementById('coe-modal-host').innerHTML=''">Cancel</button>
      </div>
    </div>
    </div>`;
  document.getElementById('coe-create-modal').scrollIntoView({ behavior: 'smooth' });
}

function _coeCreateMode() {
  const el = document.querySelector('input[name="coe-create-mode"]:checked');
  return el ? el.value : 'new';
}

function coeCreateModeChange() {
  const mode = _coeCreateMode();
  const existing = document.getElementById('coe-create-existing');
  const fresh    = document.getElementById('coe-create-new');
  if (existing) existing.hidden = mode !== 'existing';
  if (fresh)    fresh.hidden    = mode !== 'new';
}

async function coeSubmitCreateFromRow(rowId) {
  const row = _coeRowById(rowId);
  if (!row || _coeBusy) return;
  const val = id => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
  const openDay   = val('coe-create-open');
  const targetDay = val('coe-create-target');
  if (_coeCreateMode() === 'new') { await coeOpenRoleFormForRow(row, openDay, targetDay); return; }

  const role = (_coeCache.roles || []).find(r => String(r.id) === val('coe-create-role'));
  if (!role) { toast('Choose a pipeline.', { type: 'error' }); return; }
  const backfill = document.getElementById('coe-create-backfill');
  const fields = { RoleID: Number(role.id), ProjectID: Number(_coeCache.projectId), Backfill: !!(backfill && backfill.checked) };
  if (openDay)                     fields.OpenDate       = isoDate(openDay);
  if (targetDay)                   fields.TargetHireDate = isoDate(targetDay);
  if (val('coe-create-notes'))     fields.Notes          = val('coe-create-notes');
  const label = placementRoleLabel(role);
  const btn = document.getElementById('coe-create-save');
  _coeBusy = true;
  setButtonLoading(btn, 'Creating…');
  let created;
  try {
    created = await createHeadcount(fields);   // syncs Roles.OpenDate (rule 3)
  } catch (e) {
    _coeBusy = false;
    clearButtonLoading(btn);
    toast(`Couldn't create the headcount: ${e.message}`, { type: 'error' });
    return;
  }
  // The headcount exists now — a failed link must never re-run the create.
  try {
    await linkCoEPlanRow(rowId, { id: created.id, RoleID: role.id });
    toast(`Headcount added to ${label} and linked`, { type: 'success' });
  } catch (e) {
    console.warn('N-312: plan row link failed after headcount create', e);
    toast(`Headcount created on ${label} but not linked — use Link.`, { type: 'error' });
  }
  _coeBusy = false;
  await renderHiringPlanPage(_coeCache.projectId);
}

// New pipeline (S-6): the existing Add Role form, pre-filled. N-307 renamed
// the date inputs to HcOpenDate / HcTargetHireDate — writing [name="OpenDate"]
// (as before N-312) silently pre-filled nothing.
async function coeOpenRoleFormForRow(row, openDay, targetDay) {
  const main = document.getElementById('main-content');
  main.innerHTML = await renderRoleForm(null, _coeCache.projectId);
  const set = (name, v) => {
    const el = document.querySelector(`#role-form [name="${name}"]`);
    if (el && v) el.value = v;
  };
  set('RoleTitle', row.Title);
  set('HcOpenDate', openDay);
  set('HcTargetHireDate', targetDay);
  set('HeadcountCount', '1');
  set('LinkPlanRowID', String(row.id));
  // The project is pre-selected in markup, so the select's onchange never fires.
  // Load the Assign-to list explicitly (no-ops when the user can't assign).
  loadTalentPartnersForRole(_coeCache.projectId);
}

// ── Print / PDF export ──────────────────────────────────────────────
function coeExportPDF() {
  const proj = _coeCache.projects.find(p => p.id == _coeCache.projectId);
  printPage(`Hiring Plan — ${proj ? proj.CustomerName : ''}`, true, 'Reporting');
}
