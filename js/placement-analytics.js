// js/placement-analytics.js — Placement Analytics page

// ── State ─────────────────────────────────────────────────────────────
let _paLocation      = "";   // selected Currency/Location filter value
let _paFunctionArea  = "";   // selected Department filter value
let _paData          = null; // { historical, activityRaw, allPlacements, allRoles, openHeadcount, closedCensored }
let _paBreakdownSort   = null; // N-247c: { key, dir } — Role Breakdown table
let _paBreakdownSearch = "";   // N-247c: shared list search box (list-controls.js)

// ── Entry point ───────────────────────────────────────────────────────
async function renderPlacementAnalytics() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="page-header">
      <h2>Placement Analytics</h2>
    </div>
    ${dashboardSkeleton(4)}
  `;

  // Load all data in parallel
  // N-309: TTF counts headcount — open headcount censored at age, paused /
  // cancelled headcount where they stopped (ttfHeadcountInputs), built once
  // here, not per filter change. The fill map comes from allPlacements (every
  // placement, not the 12-month window). A failed stage-history or headcount
  // read degrades to "no censoring" rather than breaking the page.
  const [rawHistorical, rawActivity, rawPlacements, rawRoles, rawStageRows, rawHeadcount, allProjects] = await Promise.all([
    getHistoricalPlacements(),
    getActivityForAnalytics(52),
    getPlacements(null),
    getAllRoles(),
    getRoleStageHistory().catch(e => { console.warn('N-276: stage history read failed', e); return []; }),
    getAllHeadcount().catch(e => { console.warn('N-309: headcount read failed', e); return []; }),
    getProjects(false),
  ]);
  // N-333: client data only — filtered once, before the TTF inputs and the
  // Location / Functional Area options are built.
  const {
    historical, activity: activityRaw, placements: allPlacements,
    roles: allRoles, stageRows, headcount,
  } = excludeInternalProjectData(
    { historical: rawHistorical, activity: rawActivity, placements: rawPlacements,
      roles: rawRoles, stageRows: rawStageRows, headcount: rawHeadcount },
    { projects: allProjects, roles: rawRoles });
  const { openHeadcount, closedCensored } = ttfHeadcountInputs({ roles: allRoles, headcount, placements: allPlacements, stageRows });
  _paData = { historical, activityRaw, allPlacements, allRoles, openHeadcount, closedCensored };

  // Build unique filter options from historical placements
  const locations     = _paUnique(historical, "country").sort();
  const functionAreas = _paUnique(historical, "functionArea").sort();

  // Reset filters if the stored values no longer exist in data
  if (_paLocation     && !locations.includes(_paLocation))     _paLocation     = "";
  if (_paFunctionArea && !functionAreas.includes(_paFunctionArea)) _paFunctionArea = "";

  main.innerHTML = `
    <div class="page-header">
      <h2>Placement Analytics</h2>
    </div>

    <div class="pa-filter-row">
      <div>
        <div class="rb-section-label" style="margin-bottom:6px">Location</div>
        <select class="rb-select" id="pa-loc-filter" style="min-width:200px"
          ${actOn('change', 'paFiltersChanged')}>
          <option value="">All Locations</option>
          ${locations.map(l =>
            `<option value="${_paEsc(l)}"${l === _paLocation ? " selected" : ""}>${_paEsc(l)}</option>`
          ).join("")}
        </select>
      </div>
      <div>
        <div class="rb-section-label" style="margin-bottom:6px">Functional Area</div>
        <select class="rb-select" id="pa-fa-filter" style="min-width:200px"
          ${actOn('change', 'paFiltersChanged')}>
          <option value="">All Functional Areas</option>
          ${functionAreas.map(f =>
            `<option value="${_paEsc(f)}"${f === _paFunctionArea ? " selected" : ""}>${_paEsc(f)}</option>`
          ).join("")}
        </select>
      </div>
      ${listSearchBox(_paBreakdownSearch, 'paSetBreakdownSearch')}
    </div>

    <div id="pa-results"></div>
  `;

  paRenderResults();
}

// ── Filter handler ────────────────────────────────────────────────────
// N-302b: both dropdowns dispatch here; it reads the pair (the inline handlers
// each read the other dropdown from the DOM).
function paFiltersChanged() {
  paApplyFilters(document.getElementById('pa-loc-filter').value, document.getElementById('pa-fa-filter').value);
}

function paApplyFilters(location, functionArea) {
  _paLocation     = location;
  _paFunctionArea = functionArea;
  paRenderResults();
}

// N-247c: debounced search — narrows the Role Breakdown table only; the two
// dropdowns above still re-run _paComputeResults (a pure recompute off
// already-loaded _paData, not a fetch), search doesn't need to either.
const _debouncedPaRenderResults = debounce(() => { paRenderResults(); focusListSearchBox(); }, 250);
function paSetBreakdownSearch(val) { _paBreakdownSearch = val || ''; _debouncedPaRenderResults(); }
// N-247c: paRenderResults/_paComputeResults are NOT async — no await here,
// unlike every other sort setter in this ticket.
function paSetBreakdownSort(key) { _paBreakdownSort = nextSortState(_paBreakdownSort, key); paRenderResults(); focusSortHeader(key); }

// ── Results renderer ──────────────────────────────────────────────────
function paRenderResults() {
  const container = document.getElementById("pa-results");
  if (!container || !_paData) return;

  const results = _paComputeResults(_paData, _paLocation, _paFunctionArea);

  if (results.empty) {
    container.innerHTML = emptyStateBlock({ icon: 'bar-chart-2', message: 'No placement data found for the selected filters.' });
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = _paRenderResultsHtml(results, _paLocation, _paFunctionArea);
  if (window.lucide) lucide.createIcons();
}

// ── Results aggregation (pure — no DOM) ─────────────────────────────────
function _paComputeResults(data, location, functionArea) {
  const { historical, activityRaw, allPlacements, allRoles, openHeadcount, closedCensored } = data;

  // Filter historical placements by selected dimensions
  let filtered = historical;
  if (location)     filtered = filtered.filter(r => r.country      === location);
  if (functionArea) filtered = filtered.filter(r => r.functionArea === functionArea);

  if (filtered.length === 0) {
    return { empty: true };
  }

  // ── Summary metrics ───────────────────────────────────────────────
  // N-269: shared Kaplan–Meier estimate (analytics.js) — replaces the local
  // mean-of-hires copy, which ignored still-open roles (survivorship bias).
  const ttfResult = computeTTFPrediction(functionArea || null, location || null, historical, openHeadcount, closedCensored);
  const avgTTHDays = avgTimeToHireDays(filtered);
  const sampleSize = filtered.length;

  // Aggregate activity for funnel — match by role IDs in the filtered set
  const filteredIds = new Set(filtered.map(r => String(r.id)));
  const filtAct     = activityRaw.filter(a =>
    filteredIds.has(String(a.RoleIDLookupId))
  );
  const totals = {
    Outreach:      sumField(filtAct, "Outreach"),
    Responses:     sumField(filtAct, "Responses"),
    Screened:      sumField(filtAct, "Screened"),
    Submitted:     sumField(filtAct, "Submitted"),
    Interview1:    sumField(filtAct, "Interview1"),
    Interview2Plus:sumField(filtAct, "Interview2Plus"),
    FinalInterview:sumField(filtAct, "FinalInterview"),
    Offers:        sumField(filtAct, "Offers"),
    Hires:         sumField(filtAct, "Hires"),
  };
  // N-270: learned benchmarks. N-277: learning population is pipelines with
  // ≥1 fill (N-309 D-8 — still-open ones included) plus CANCELLED roles (their
  // completed stage progress is valid learning — cancellation is the client's
  // call). Pipelines with no fill that are Open/Backlog/On-hold stay out:
  // their funnels are unfinished and would bias the benchmarks green. The
  // roles being judged are the ones with fills. Leave-self-out: the roles
  // being judged never count toward their own benchmark.
  const benchObs     = buildFunnelObservations(activityRaw, funnelLearningIndex(historical, allRoles));
  const summaryBench = learnFunnelBenchmarks(benchObs, functionArea || null, location || null, { exclude: o => filteredIds.has(o.roleId) });
  const funnelStages = computeRoleFunnel(totals, summaryBench);

  // ── Role-by-role breakdown (grouped by RoleTitle + Location) ─────────
  const groupMap = {};
  filtered.forEach(role => {
    const key = role.title && role.country
      ? `${role.title} (${role.country})`
      : (role.title || '—');
    if (!groupMap[key]) {
      groupMap[key] = { key, functionArea: role.functionArea, country: role.country, roles: [] };
    }
    groupMap[key].roles.push(role);
  });

  const groups = Object.values(groupMap)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(group => {
      const groupIds = new Set(group.roles.map(r => String(r.id)));
      const roleAct = activityRaw.filter(a => groupIds.has(String(a.RoleIDLookupId)));
      const roleTotals = {
        Outreach:      sumField(roleAct, "Outreach"),
        Responses:     sumField(roleAct, "Responses"),
        Screened:      sumField(roleAct, "Screened"),
        Submitted:     sumField(roleAct, "Submitted"),
        Interview1:    sumField(roleAct, "Interview1"),
        Interview2Plus:sumField(roleAct, "Interview2Plus"),
        FinalInterview:sumField(roleAct, "FinalInterview"),
        Offers:        sumField(roleAct, "Offers"),
        Hires:         sumField(roleAct, "Hires"),
      };

      // Avg TTH across every fill in the group (one row per headcount, N-309)
      const groupTth = avgTimeToHireDays(group.roles);
      const avgTth   = groupTth === null ? null : Math.round(groupTth);

      const groupPlacements = allPlacements.filter(p => groupIds.has(String(p.RoleIDLookupId || p.RoleID || '')));
      const salaries = groupPlacements.map(p => parseFloat(p.SalaryAgreed)).filter(v => !isNaN(v) && v > 0);
      const avgSalary = salaries.length ? Math.round(salaries.reduce((s, v) => s + v, 0) / salaries.length) : null;
      const currency = groupPlacements.find(p => p.Currency)?.Currency || '';
      const SYMBOLS = { GBP: '£', EUR: '€', USD: '$', CAD: 'CA$', AUD: 'A$', SGD: 'S$', AED: 'AED', ZAR: 'R', LKR: 'LKR' };
      const sym = SYMBOLS[currency] || currency;

      const bench      = learnFunnelBenchmarks(benchObs, group.functionArea || null, group.country || null, { exclude: o => groupIds.has(o.roleId) });
      const roleFunnel = computeRoleFunnel(roleTotals, bench);

      return { key: group.key, functionArea: group.functionArea, roleTotals, avgTth, avgSalary, sym, roleFunnel, bench };
    });

  return { empty: false, ttfResult, avgTTHDays, sampleSize, totals, funnelStages, summaryBench, groups, groupCount: Object.keys(groupMap).length };
}

// ── Results view-model (pure — display strings, no HTML) ──────────────────
// N-477: the Summary tiles and the Role Breakdown rows, shaped from _paComputeResults output.
function _paSummaryTiles(results) {
  const { ttfResult, avgTTHDays, sampleSize, totals } = results;
  return [
    {
      value: ttfResult.medianDays !== null ? `~${ttfResult.medianDays}d`
        : (!ttfResult.medianReached && ttfResult.basis) ? `>${ttfResult.maxObservedDays}d` : "—",
      label: 'Predicted Time to Hire',
      note: ttfResult.bandDays !== null
        ? `±${Math.round(ttfResult.bandDays)}d · ${ttfResult.events} hires, ${ttfResult.censored - ttfResult.closed} open${ttfResult.closed ? `, ${ttfResult.closed} on hold/cancelled` : ""}${ttfResult.pooled ? " · all locations" : ""}`
        : ttfResult.label,
    },
    {
      value: avgTTHDays !== null ? `${Math.round(avgTTHDays)}d` : "—",
      label: 'Avg. Actual Time to Hire',
      note: `${sampleSize} placement${sampleSize !== 1 ? "s" : ""}`,
    },
    {
      value: totals.Hires > 0 ? Math.round(totals.Outreach / totals.Hires) : "—",
      label: 'Outreach per Hire',
      note: 'avg. across filtered roles',
    },
    {
      value: totals.Offers > 0 ? Math.round((totals.Hires / totals.Offers) * 100) + "%" : "—",
      label: 'Offer Success Rate',
      note: `${totals.Offers} offer${totals.Offers !== 1 ? "s" : ""} made`,
    },
  ];
}

// N-247c: raw ratios, not the rounded/%-formatted display values in the rows.
// Funnel (RAG) is not sortable — a multi-stage dot summary has no single scalar, same reasoning as
// leaving other computed badges alone.
const PA_BREAKDOWN_SORT_COLUMNS = {
  role:             { type: 'text',   get: g => g.key },
  functionArea:     { type: 'text',   get: g => g.functionArea },
  avgSalary:        { type: 'number', get: g => g.avgSalary },
  avgTth:           { type: 'number', get: g => g.avgTth },
  outreachResponse: { type: 'number', get: g => g.roleTotals.Outreach > 0 ? g.roleTotals.Responses / g.roleTotals.Outreach : null },
  offerSuccess:     { type: 'number', get: g => g.roleTotals.Offers > 0 ? g.roleTotals.Hires / g.roleTotals.Offers : null },
};

// N-247c: search narrows `groups` (Role/Location + Functional Area); sortRows layers on top of the
// existing key-alphabetical default order computed in _paComputeResults (kept as-is, not touched here).
// -> { rows: [{ key, functionArea, salaryText, tthText, responseText, funnel: [{ rag, stage, convText, tip }], offerText }], shown }
function _paBreakdownView(groups, searchText, sortState) {
  const searchedGroups = filterRowsByText(groups, searchText, g => [g.key, g.functionArea]);
  const sortedGroups = sortRows(searchedGroups, sortState, PA_BREAKDOWN_SORT_COLUMNS);
  const rows = sortedGroups.map(group => ({
    key: group.key,
    functionArea: group.functionArea || "—",
    salaryText: group.avgSalary !== null ? group.sym + group.avgSalary.toLocaleString('en-GB') : "—",
    tthText: group.avgTth !== null ? group.avgTth + "d" : "—",
    responseText: group.roleTotals.Outreach > 0 ? Math.round((group.roleTotals.Responses / group.roleTotals.Outreach) * 100) + "%" : "—",
    funnel: group.roleFunnel.map((s, i) => ({
      rag: s.rag, stage: s.stage, convText: s.conv !== null ? s.conv + "%" : "—",
      tip: learnedBenchmarkTip(group.bench, LEARNED_RATES[i].key),
    })),
    offerText: group.roleTotals.Offers > 0 ? Math.round((group.roleTotals.Hires / group.roleTotals.Offers) * 100) + "%" : "—",
  }));
  return { rows, shown: sortedGroups.length };
}

// ── Results HTML (pure — no fetching) ────────────────────────────────
function _paRenderResultsHtml(results, location, functionArea) {
  const view = _paBreakdownView(results.groups, _paBreakdownSearch, _paBreakdownSort);
  return _paSummaryHtml(results, location, functionArea) + _paFunnelHtml(results) + _paBreakdownHtml(view, results.groupCount);
}

function _paRagDotHtml(rag) {
  // N-411: colour comes from .pa-rag-* classes (the single status set), not inline styles.
  const key = String(rag ?? "").toLowerCase();
  const tone = ["green", "amber", "red"].includes(key) ? key : "grey";
  // N-254: red/amber render a shape (marker glyph) in the dot's colour, not just a hue.
  const marker = ragMarkerHTML(rag);
  if (marker) return `<span class="pa-rag-glyph pa-rag-glyph--${tone}">${marker}</span>`;
  return `<span class="pa-rag-dot pa-rag-dot--${tone}"></span>`;
}

// ── Summary cards ─────────────────────────────────────────────────
function _paSummaryHtml(results, location, functionArea) {
  const tiles = _paSummaryTiles(results).map(t => `
        <div class="kpi-card">
          <div class="kpi-value">${t.value}</div>
          <div class="kpi-label">${t.label}</div>
          <div class="pa-kpi-note">${t.note}</div>
        </div>`).join("");
  return `
      <div class="print-avoid-break mr-card">
      <div class="mr-card-title">
        Summary
        ${location || functionArea
          ? `<span class="mr-card-title-sub mr-card-title-sub--gap">
              ${[functionArea, location].filter(Boolean).join(" · ")}</span>`
          : ""}
      </div>
      <div class="kpi-strip">${tiles}
      </div>
    </div>
  `;
}

// ── Funnel drop-off ───────────────────────────────────────────────
function _paFunnelHtml(results) {
  const { funnelStages, summaryBench } = results;
  return `
      <div class="print-avoid-break mr-card">
      <div class="mr-card-title">Funnel Drop-off</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        ${funnelStages.map((s, i) => `
          <div title="${_paEsc(learnedBenchmarkTip(summaryBench, LEARNED_RATES[i].key))}" class="pa-stage-tile">
            <div class="pa-stage-label">${s.stage}</div>
            <div class="pa-stage-value">
              ${s.conv !== null ? s.conv + "%" : "—"}
            </div>
            <div class="pa-stage-rag">
              ${_paRagDotHtml(s.rag)}${s.rag === "grey" ? "No data" : s.rag.charAt(0).toUpperCase() + s.rag.slice(1)}
            </div>
          </div>`).join("")}
      </div>
    </div>
  `;
}

// ── Role-by-role breakdown ────────────────────────────────────────
function _paBreakdownHtml(view, groupCount) {
  const rows = view.rows.map(row => {
      const funnelSummary = row.funnel
        .map(f => `<span title="${f.stage}: ${f.convText} — ${_paEsc(f.tip)}">${_paRagDotHtml(f.rag)}</span>`)
        .join("");

      return `
        <tr>
          <td>${_paEsc(row.key)}</td>
          <td>${_paEsc(row.functionArea)}</td>
          <td class="cell-center">${row.salaryText}</td>
          <td class="cell-center">${row.tthText}</td>
          <td class="cell-center">${row.responseText}</td>
          <td class="cell-center">${funnelSummary}</td>
          <td class="cell-center">${row.offerText}</td>
        </tr>`;
    })
    .join("");

  return `
      <div class="print-avoid-break mr-card">
      <div class="mr-card-title">
        Role Breakdown <span class="mr-card-title-sub">(${view.shown} of ${groupCount} role type${groupCount !== 1 ? "s" : ""})</span>
      </div>
      <table class="data-table pa-breakdown-table mr-table">
        <thead>
          <tr>
            ${sortableHeader('Role', 'role', _paBreakdownSort, 'paSetBreakdownSort')}
            ${sortableHeader('Functional Area', 'functionArea', _paBreakdownSort, 'paSetBreakdownSort')}
            ${sortableHeader('Avg. Salary', 'avgSalary', _paBreakdownSort, 'paSetBreakdownSort')}
            ${sortableHeader('Avg. Actual TTH', 'avgTth', _paBreakdownSort, 'paSetBreakdownSort')}
            ${sortableHeader('Outreach Response', 'outreachResponse', _paBreakdownSort, 'paSetBreakdownSort')}
            <th class="cell-center">Funnel (RAG)</th>
            ${sortableHeader('Offer Success', 'offerSuccess', _paBreakdownSort, 'paSetBreakdownSort')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="pa-legend-note">
        Funnel RAG: Response rate · IV1 Conversion · IV→Offer · Offer Success. ● ok · ${ragMarkerHTML('amber')}watch · ${ragMarkerHTML('red')}at risk. Hover for values.
      </div>
    </div>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────────
function _paUnique(arr, key) {
  return [...new Set(arr.map(r => r[key]).filter(Boolean))];
}

function _paEsc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// N-302a: delegated actions this file owns that shared markup calls (js/actions.js).
// Later N-302 sub-tasks add their own names to this call; never register a name twice.
registerActions({
  paFiltersChanged,
  paSetBreakdownSearch,
  paSetBreakdownSort,
});
