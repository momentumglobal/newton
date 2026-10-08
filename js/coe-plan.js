// js/coe-plan.js — CoE Hiring Plan page (Reporting module)
// Entry point: renderHiringPlanPage() — wired in nav.js
// Data: CoEPlanRows via api.js getters (N-317: CoEPlanForecast is no longer
// read — the forecast table became Planned vs Actual Role Opens). N-312: a plan
// row links to ONE hire slot — CoEPlanRows.LinkedHeadcountID → RoleHeadcount —
// with LinkedRoleID kept in sync (linkCoEPlanRow / unlinkCoEPlanRow, api-coe.js).
// Phase defaults: CONFIG.COE_PHASE_DEFAULTS. Handover excluded from v1.
// coeGanttHtml() is a pure renderer shared with the Report Builder
// (landscape final-page export) — no DOM access, no cache reads.

let _coeCache = null;   // { projectId, planRows, roles, headcount, placements } — headcount null = read failed

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

// ── Week variance (N-317) ───────────────────────────────────────────
// Monday-week gap between a row's Planned Open Date and its linked
// headcount's actual OpenDate, actual − planned: negative = opened early
// (good), positive = late. Built on coeWeekIndex (Math.round, N-081) and this
// file's local-midnight model — never floor, never the UTC helpers (N-089).
// Not opened yet: once the planned week has passed, a RUNNING gap to today's
// week ({ final: false }); before that, null. Only call this when headcount
// was actually read (coeGanttHtml's hasActuals) — an unread headcount would
// otherwise read as "not open".
function coeWeekVariance(row, hc, today) {
  if (!row || !row.OpenDate) return null;
  const planned = coeMonday(row.OpenDate);
  if (hc && hc.OpenDate) return { weeks: coeWeekIndex(planned, hc.OpenDate), final: true };
  const late = coeWeekIndex(planned, today || new Date());
  return late > 0 ? { weeks: late, final: false } : null;
}

function coeWeekVarianceHtml(v) {
  if (!v) return '—';
  if (!v.final) return `<span class="coe-var--late coe-var--running">+${v.weeks} (not open)</span>`;
  if (v.weeks < 0) return `<span class="coe-var--early">${v.weeks}</span>`;
  if (v.weeks > 0) return `<span class="coe-var--late">+${v.weeks}</span>`;
  return '0';
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

// ── Actual markers (N-317: replace N-312's thin R/N/O bar) ──────────
// spans = coeHeadcountActualSpans() (utils.js) for the row's linked headcount
// — it already picks the earliest-offer placement. Returns the plan-timeline
// week index of the hire-confirmed week (placement OfferAcceptedDate → ✓) and
// the start week (Placement.ProvisionalStartDate → ▶), or null. nStart is set
// only from a real offer and oStart only from a real start date (never
// "today"), so no marker is drawn from a placeholder. Span values are stored
// SharePoint strings fed straight to coeWeekIndex — the local date model
// above is unchanged (N-089).
function coeActualMarkerWeeks(spans, timelineStart) {
  const out = { hire: null, start: null };
  if (!spans) return out;
  if (spans.nStart) out.hire  = coeWeekIndex(timelineStart, spans.nStart);
  if (spans.oStart) out.start = coeWeekIndex(timelineStart, spans.oStart);
  return out;
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

  const [planRows, roles, headcount] = await Promise.all([
    getCoEPlanRows(pid),
    getRolesForProject(pid),
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

  _coeCache = { projectId: pid, projects, planRows, roles, headcount, placements, canEdit, isAdmin };
  coeRenderBody();
}

function coeRenderBody() {
  const { projectId, projects, planRows, canEdit, isAdmin } = _coeCache;
  const main = document.getElementById('main-content');

  const projOpts = projects.map(p =>
    `<option value="${p.id}" ${p.id == projectId ? 'selected' : ''}>${escHtml(p.CustomerName)}</option>`).join('');

  main.innerHTML = `
    <div class="page-header"><h2>Hiring Plan</h2></div>
    <div class="coe-toolbar">
      <select onchange="renderHiringPlanPage(parseInt(this.value))">${projOpts}</select>
      ${canEdit ? `<button class="btn-primary" onclick="coeOpenRowModal()">+ Planned Headcount</button>` : ''}
      <button class="print-btn" onclick="coeExportPDF()">⎙ Export PDF</button>
      ${isAdmin && planRows.length ? `<button class="btn-danger" id="coe-delete-plan-btn" onclick="coeDeletePlan()">Delete Plan</button>` : ''}
    </div>
    <div class="coe-legend">
      <span><span class="coe-swatch" style="background:var(--c-blue-pale)"></span> Recruitment</span>
      <span><span class="coe-swatch" style="background:var(--c-pink-pale)"></span> Notice</span>
      <span><span class="coe-swatch" style="background:var(--c-green-pale-border)"></span> Onboarding</span>
      <span><span class="coe-mark coe-mark--hire">✓&#xFE0E;</span> Hire confirmed</span>
      <span><span class="coe-mark coe-mark--start">▶&#xFE0E;</span> Started</span>
    </div>
    <div id="coe-gantt"></div>
    <div class="page-header coe-fvp-header" style="margin-top:28px"><h3>Planned vs Actual Role Opens</h3></div>
    <div id="coe-opens"></div>
    <div id="coe-modal-host"></div>
  `;
  coeRenderGantt();
  coeRenderOpensSection();
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
  const rows = coeSortRows(planRows);
  if (!rows.length) { host.innerHTML = '<p>No planned headcount yet.</p>'; return; }
  host.innerHTML = coeGanttHtml(rows, { headcount, placements, canEdit, showActuals: true });
}

// Pure renderer — no DOM access, no cache reads. Returns the Gantt table HTML.
// opts: headcount, placements — N-317: Actual Open, Week Variance and the
//       ✓ hire-confirmed / ▶ started markers, per linked headcount (N-312);
//       canEdit (actions column); showActuals.
//       Actuals render only when showActuals is on AND a headcount ARRAY is
//       passed (hasActuals). The Report Builder passes none (plan only; N-318
//       adds them) and the page passes null when the headcount read failed —
//       without headcount an unopened row can't be told from an unread one,
//       so Actual Open / Week Variance show '—' and never "(not open)".
function coeGanttHtml(rows, opts = {}) {
  const { headcount = null, placements = [], canEdit = false, showActuals = true } = opts;
  const hasActuals = showActuals && Array.isArray(headcount);
  const now = new Date();

  // N-312: keyed on String — SP item ids arrive as strings, the Number
  // columns (LinkedHeadcountID, HeadcountID) as numbers.
  const hcById  = Object.fromEntries((hasActuals ? headcount : []).map(h => [String(h.id), h]));
  const fillMap = headcountFillMap(hasActuals ? placements : []);
  const actuals = rows.map(row => {
    const hc = hasActuals && !_isBlankId(row.LinkedHeadcountID)
      ? (hcById[String(row.LinkedHeadcountID)] || null) : null;
    return { hc, spans: hc ? coeHeadcountActualSpans(hc, fillMap.get(String(hc.id)), now) : null };
  });

  // Timeline: earliest plan start → latest plan end, −1wk / +2wk buffer.
  // N-317: actual hire/start markers widen it too, so a late hire or start
  // isn't clipped off the edge (still capped at 90 weeks).
  const spans = rows.map(computePlanSpans);
  const markerMondays = actuals.flatMap(a => a.spans ? [a.spans.nStart, a.spans.oStart] : [])
    .filter(Boolean).map(d => coeMonday(d));
  let tStart = coeMonday(new Date(Math.min(...spans.map(s => s.start), ...markerMondays)));
  let tEnd   = new Date(Math.max(...spans.map(s => s.endDate), ...markerMondays));
  tStart = coeAddWeeks(tStart, -1);
  const nWeeks = Math.min(coeWeekIndex(tStart, tEnd) + 3, 90);
  const todayIdx = coeWeekIndex(tStart, now);

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

  const bodyHtml = rows.map((row, i) => {
    const { hc, spans: act } = actuals[i];
    const linked = !_isBlankId(row.LinkedHeadcountID);
    const mk = coeActualMarkerWeeks(act, tStart);
    const cells = [];
    for (let w = 0; w < nWeeks; w++) {
      const ph = coePhaseAt(row, tStart, w);
      const isHire = w === mk.hire, isStart = w === mk.start;
      const cls = ['coe-cell',
        ph ? `coe-cell--${ph}` : '',
        w === todayIdx ? 'coe-cell--today' : ''].filter(Boolean).join(' ');
      const tip = [isHire ? `Hire confirmed ${coeFmtShort(act.nStart)}` : '',
                   isStart ? `Started ${coeFmtShort(act.oStart)}` : ''].filter(Boolean).join(' · ');
      const marks = (isHire ? '<span class="coe-mark coe-mark--hire">✓&#xFE0E;</span>' : '')
                  + (isStart ? '<span class="coe-mark coe-mark--start">▶&#xFE0E;</span>' : '');
      // &#xFE0E; forces text presentation — Windows Chrome otherwise draws ▶ as a colour emoji.
      cells.push(`<td class="${cls}"${tip ? ` title="${escAttr(tip)}"` : ''}>${marks || ph}</td>`);
    }
    const actions = canEdit ? `<td class="coe-col-actions"><div class="coe-row-actions">
        <button class="btn-secondary" onclick="coeOpenRowModal(${row.id})">Edit</button>
        <button class="btn-secondary" onclick="coeOpenLinkPicker(${row.id})">${linked ? 'Re-link' : 'Link'}</button>
        ${!linked ? `<button class="btn-secondary" onclick="coeCreateHeadcountFromRow(${row.id})">Create Headcount</button>` : ''}
        <button class="btn-secondary" onclick="coeDeleteRow(${row.id})">✕</button>
      </div></td>` : '';
    // A cancelled linked headcount keeps its open date — it was opened — and
    // is tagged so the DM re-links the row to its replacement.
    const cancelled = !!hc && hc.Status === CONFIG.HEADCOUNT.STATUS_CANCELLED;
    const actualOpen = hc && hc.OpenDate
      ? coeFmtShort(hc.OpenDate) + (cancelled ? '<span class="coe-hc-cancelled">cancelled</span>' : '')
      : '—';
    const variance = hasActuals ? coeWeekVarianceHtml(coeWeekVariance(row, hc, now)) : '—';
    return `<tr>
      <td class="coe-sticky coe-sticky--1">${escHtml(row.Title)}${hc ? ' 🔗' : ''}</td>
      <td class="coe-sticky coe-sticky--2">${coeFmtShort(row.OpenDate)}</td>
      <td class="coe-sticky coe-sticky--3">${actualOpen}</td>
      <td class="coe-sticky coe-sticky--4">${variance}</td>
      ${cells.join('')}${actions}</tr>`;
  }).join('');

  return `<div class="coe-gantt-wrap table-scroll"><table class="coe-gantt">
    <thead>
      <tr class="coe-gantt-month-row"><th class="coe-sticky coe-sticky--1 coe-th-split-top">Role</th>
          <th class="coe-sticky coe-sticky--2 coe-th-split-top">Planned Open</th>
          <th class="coe-sticky coe-sticky--3 coe-th-split-top">Actual Open</th>
          <th class="coe-sticky coe-sticky--4 coe-th-split-top" title="Weeks between planned and actual open: − opened early, + opened late">Week Variance</th>
          ${monthCells.map(m => `<th class="coe-month" colspan="${m.span}">${m.label}</th>`).join('')}
          ${canEdit ? '<th class="coe-col-actions coe-th-split-top"></th>' : ''}</tr>
      <tr class="coe-gantt-date-row"><th class="coe-sticky coe-sticky--1 coe-th-split-bottom"></th><th class="coe-sticky coe-sticky--2 coe-th-split-bottom"></th><th class="coe-sticky coe-sticky--3 coe-th-split-bottom"></th><th class="coe-sticky coe-sticky--4 coe-th-split-bottom"></th>${Array.from({ length: nWeeks }, (_, w) => `<th>${coeAddWeeks(tStart, w).getDate()}</th>`).join('')}${canEdit ? '<th class="coe-col-actions coe-th-split-bottom"></th>' : ''}</tr>
      ${capHtml}
    </thead>
    <tbody>${bodyHtml}</tbody>
  </table></div>`;
}

// ── Planned vs Actual Role Opens (N-317) ────────────────────────────
// Replaces the Forecast vs Planned Hires table (CoEPlanForecast is no longer
// read; its data is kept). A plan row has OPENED when its linked headcount has
// an OpenDate — unlinked headcount is ignored — and the target is the plan row
// count. Aggregation and run rate are pure, in coeOpensByMonth() (utils.js);
// this file only derives the day-string inputs and renders.

function coeOpensModel(planRows, headcount, now = new Date()) {
  const hcById = Object.fromEntries((headcount || []).map(h => [String(h.id), h]));
  const plannedDays = planRows.map(r => spDateIn(r.OpenDate)).filter(Boolean);
  const actualDays = planRows.map(r => {
    if (_isBlankId(r.LinkedHeadcountID)) return null;
    const hc = hcById[String(r.LinkedHeadcountID)];
    return hc && hc.OpenDate ? spDateIn(hc.OpenDate) : null;
  }).filter(Boolean);
  // targetHireDate is a LOCAL-midnight Date (this file's model, N-089) —
  // localDayISO, never toISOString (a BST Monday would read as Sunday).
  const latestHire = new Date(Math.max(...planRows.map(r => computePlanSpans(r).targetHireDate)));
  return coeOpensByMonth({
    plannedDays, actualDays,
    target:           planRows.length,
    latestHireDay:    localDayISO(latestHire),
    todayDay:         localDayISO(now),
    finalNoOpenWeeks: CONFIG.COE_PHASE_DEFAULTS.finalNoOpenWeeks,
  });
}

// 'YYYY-MM' → 'Oct 26' / 'Oct 2026'. Built from integers (local midnight on
// the 1st), never from a parsed ISO string.
function coeMonthLabel(key, long = false) {
  const d = new Date(monthKeyYear(key), monthKeyMonth(key) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: long ? 'numeric' : '2-digit' });
}

// 'YYYY-MM-DD' → '03 Feb' through coeFmtShort (UTC-pinned, so the day is exact).
function coeDayLabel(day) {
  return day ? coeFmtShort(`${day}T12:00:00Z`) : '—';
}

function coeRenderOpensSection() {
  const { planRows, headcount } = _coeCache;
  const host = document.getElementById('coe-opens');
  if (!host) return;
  if (!planRows.length) { host.innerHTML = ''; return; }
  // N-312 degrade: without headcount the actual opens are unknown — showing
  // them as 0 would report the whole plan as behind.
  if (!headcount) {
    host.innerHTML = `<p class="no-data">Couldn't load this project's headcount — actual opens and the run rate are unavailable. Refresh to try again.</p>`;
    return;
  }
  const m = coeOpensModel(planRows, headcount);
  host.innerHTML = coeOpensSummaryHtml(m) + coeOpensChartSvg(m) + coeOpensTableHtml(m);
}

function coeOpensSummaryHtml(m) {
  const note = `<p class="coe-opens-note">The run rate assumes no roles open in the final ${m.finalNoOpenWeeks} weeks before the last planned hire (${coeDayLabel(m.latestHireDay)}) — too late to make the hire.</p>`;
  if (m.status === 'complete') {
    return `<p class="coe-opens-summary">All ${m.target} planned headcount opened.</p>`;
  }
  if (m.status === 'past-cutoff') {
    return `<p class="coe-opens-summary coe-opens-summary--late">Past the final opening date (${coeDayLabel(m.cutoffDay)}) — ${m.remaining} of ${m.target} still to open.</p>${note}`;
  }
  const n = m.monthsLeft;
  return `<p class="coe-opens-summary">Target <strong>${m.target}</strong> · Opened <strong>${m.openedToDate}</strong> · Remaining <strong>${m.remaining}</strong> — need <strong>${m.requiredPerMonth.toFixed(1)}</strong> per month over ${n} month${n === 1 ? '' : 's'} (last opening month: ${coeMonthLabel(m.cutoffMonth, true)}).</p>${note}`;
}

// Pure renderer: planned vs actual opens as paired columns per month, plus
// the required run rate as a dashed reference line over the in-window months.
// Shared chart primitives (utils.js) and token classes only — no hex here.
function coeOpensChartSvg(m) {
  const months = m.months;
  if (!months.length) return '';
  const W = 900, H = 220;
  const PAD = { top: 18, right: 16, bottom: 30, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const rate = m.status === 'in-window' ? m.requiredPerMonth : null;

  const dataMax = Math.max(1, rate || 0, ...months.map(x => Math.max(x.planned, x.actual || 0)));
  const step = dataMax <= 5 ? 1 : dataMax <= 10 ? 2 : dataMax <= 25 ? 5 : 10;
  const yMax = Math.ceil(dataMax / step) * step;
  const yOf = v => PAD.top + chartH - (v / yMax) * chartH;
  const slot = chartW / months.length;
  const barW = Math.max(3, Math.min(18, (slot - 10) / 2));
  const mid = i => PAD.left + (i + 0.5) * slot;

  const grid = [];
  for (let v = 0; v <= yMax; v += step) grid.push({ y: yOf(v), label: String(v) });

  // One <rect> per non-zero value, 2px apart within the pair.
  const col = (x, v, cls, tip) => {
    if (!v) return '';
    const h = (v / yMax) * chartH;
    return `<rect x='${x.toFixed(1)}' y='${(PAD.top + chartH - h).toFixed(1)}' width='${barW.toFixed(1)}' height='${h.toFixed(1)}' rx='2' class='coe-opens-col ${cls}'><title>${escHtml(tip)}</title></rect>`;
  };
  const labelEvery = Math.ceil(months.length / 18);
  const bars = months.map((x, i) => {
    const lbl = coeMonthLabel(x.key);
    return col(mid(i) - barW - 1, x.planned, 'coe-opens-col--planned', `${lbl} · Planned opens: ${x.planned}`)
      + (x.isFuture ? '' : col(mid(i) + 1, x.actual, 'coe-opens-col--actual',
          `${lbl} · Actual opens: ${x.actual}${x.isCurrent ? ' (to date)' : ''}`))
      + (i % labelEvery === 0
          ? `<text x='${mid(i).toFixed(1)}' y='${PAD.top + chartH + 18}' text-anchor='middle' class='nt-chart-tick'>${lbl}</text>`
          : '');
  }).join('');

  let rateSvg = '';
  const win = months.map((x, i) => (x.inWindow ? i : -1)).filter(i => i >= 0);
  if (rate != null && win.length) {
    const xa = PAD.left + win[0] * slot + 2;
    const xb = PAD.left + (win[win.length - 1] + 1) * slot - 2;
    const y = yOf(rate);
    rateSvg = `<line x1='${xa.toFixed(1)}' y1='${y.toFixed(1)}' x2='${xb.toFixed(1)}' y2='${y.toFixed(1)}' class='nt-chart-threshold'><title>Required run rate: ${rate.toFixed(1)} per month</title></line>`
      + `<text x='${xb.toFixed(1)}' y='${(y - 5).toFixed(1)}' text-anchor='end' class='nt-chart-threshold-label'>Required ${rate.toFixed(1)}/mo</text>`;
  }

  const legend = _chartLegendHtml([
    { color: 'var(--coe-opens-planned)', label: 'Planned opens', box: true },
    { color: 'var(--coe-opens-actual)',  label: 'Actual opens',  box: true },
    ...(rateSvg ? [{ color: 'var(--text-muted)', label: 'Required run rate', dashed: true }] : []),
  ]);
  return `<div class='coe-opens-chart'><svg viewBox='0 0 ${W} ${H}' class='coe-opens-svg' role='img' aria-label='Planned vs actual role opens by month'>`
    + _chartGridSvg(PAD.left, W, PAD.right, grid) + bars + rateSvg + `</svg>${legend}</div>`;
}

function coeOpensTableHtml(m) {
  const varCell = v => {
    if (v == null) return '—';
    const cls = v > 0 ? 'coe-fvp-var-pos' : v < 0 ? 'coe-fvp-var-neg' : '';
    return `<span class="${cls}">${v > 0 ? '+' : ''}${v}</span>`;
  };
  let planned = 0, plannedToDate = 0, actual = 0;
  const body = m.months.map(x => {
    planned += x.planned;
    if (!x.isFuture) { plannedToDate += x.planned; actual += x.actual; }
    return `<tr${x.isCurrent ? ' class="coe-opens-current"' : ''}>
      <td>${coeMonthLabel(x.key, true)}${x.isCurrent ? ' (to date)' : ''}</td>
      <td>${x.planned}</td><td>${x.isFuture ? '—' : x.actual}</td><td>${varCell(x.variance)}</td>
      <td>${x.inWindow ? m.requiredPerMonth.toFixed(1) : '—'}</td></tr>`;
  }).join('');
  return `<table class="coe-fvp-table coe-opens-table">
    <thead><tr><th>Month</th><th>Planned Opens</th><th>Actual Opens</th>
      <th title="Actual − planned: + ahead of plan, − behind">Variance</th><th>Required</th></tr></thead>
    <tbody>${body}
      <tr><th>Total</th><th>${planned}</th><th>${actual}</th><th>${varCell(actual - plannedToDate)}</th><th></th></tr>
    </tbody></table>`;
}

// ── Row CRUD modal ──────────────────────────────────────────────────

async function coeOpenRowModal(rowId = null) {
  const { planRows } = _coeCache;
  // SharePoint item ids come back from getItems() as strings, but the Gantt's
  // onclick emits a number literal — compare as strings (cf. roleById below).
  const row = rowId ? planRows.find(r => String(r.id) === String(rowId)) : null;
  const dflt = CONFIG.COE_PHASE_DEFAULTS;
  // N-317: no Talent Partner field — stored TalentPartner values are left as-is.

  document.getElementById('coe-modal-host').innerHTML = `
    <div style="display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;align-items:center;justify-content:center">
    <div class="form-container form-container--modal" id="coe-row-modal" style="max-width:640px;max-height:92vh;overflow-y:auto">
      <h2>${row ? 'Edit' : 'Add'} Planned Headcount</h2>
      <div id="coe-row-form-error" class="form-error"></div>
      <form id="coe-row-form" onsubmit="coeSubmitRow(event, ${rowId || 'null'})">
        <div class="form-group"><label>Role Title *</label>
          <input type="text" name="Title" required value="${escAttr(row?.Title || '')}"></div>
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
        <p style="font-size:12px;color:var(--text-muted)">Leave phase fields blank to use defaults. Planned hire = Planned Open Date + Recruitment weeks.</p>
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
    // N-317: TalentPartner deliberately not sent — stored values stay untouched.
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
    message: 'Remove this planned headcount from the hiring plan?',
    confirmLabel: 'Remove', danger: true,
  }))) return;
  await deleteCoEPlanRow(rowId);
  await renderHiringPlanPage(_coeCache.projectId);
}

// N-080: admin-only — delete the project's ENTIRE hiring plan (all rows).
// Linked live Roles, headcount and Placements are untouched. Sequential
// deletes match the v1 write pattern.
async function coeDeletePlan() {
  const { planRows, projectId } = _coeCache;
  if (!planRows.length) return;
  if (!(await confirmModal({
    message: `Delete the entire hiring plan — all ${planRows.length} planned headcount on this project? (Linked live Roles and headcount are kept.)`,
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
