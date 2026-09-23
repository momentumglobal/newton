// js/placement-analytics.js — Placement Analytics page

// ── State ─────────────────────────────────────────────────────────────
let _paLocation      = "";   // selected Currency/Location filter value
let _paFunctionArea  = "";   // selected Department filter value
let _paData          = null; // { historical, activity, benchmarks }
let _paBreakdownSort   = null; // N-247c: { key, dir } — Role Breakdown table
let _paBreakdownSearch = "";   // N-247c: shared list search box (list-controls.js)

// ── Entry point ───────────────────────────────────────────────────────
async function renderPlacementAnalytics() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="page-header">
      <h2>Placement Analytics</h2>
    </div>
    <div style="padding:32px;color:var(--text-muted)">Loading data…</div>
  `;

  // Load all data in parallel
  const [historical, activityRaw, allPlacements] = await Promise.all([
    getHistoricalPlacements(),
    getActivityForAnalytics(52),
    getPlacements(null),
  ]);
  const benchmarks = CONFIG.ANALYTICS_BENCHMARKS;

  _paData = { historical, activityRaw, benchmarks, allPlacements };

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

    <div style="display:flex;gap:16px;align-items:flex-end;padding:0 0 24px 0;flex-wrap:wrap">
      <div>
        <div class="rb-section-label" style="margin-bottom:6px">Location</div>
        <select class="rb-select" style="min-width:200px"
          onchange="paApplyFilters(this.value, document.getElementById('pa-fa-filter').value)">
          <option value="">All Locations</option>
          ${locations.map(l =>
            `<option value="${_paEsc(l)}"${l === _paLocation ? " selected" : ""}>${_paEsc(l)}</option>`
          ).join("")}
        </select>
      </div>
      <div>
        <div class="rb-section-label" style="margin-bottom:6px">Functional Area</div>
        <select class="rb-select" id="pa-fa-filter" style="min-width:200px"
          onchange="paApplyFilters(document.querySelector('.rb-select').value, this.value)">
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
    container.innerHTML = `<p class="no-data" style="padding:32px">
      No placement data found for the selected filters.</p>`;
    return;
  }

  container.innerHTML = _paRenderResultsHtml(results, _paLocation, _paFunctionArea);
}

// ── Results aggregation (pure — no DOM) ─────────────────────────────────
function _paComputeResults(data, location, functionArea) {
  const { historical, activityRaw, benchmarks, allPlacements } = data;

  // Filter historical placements by selected dimensions
  let filtered = historical;
  if (location)     filtered = filtered.filter(r => r.country      === location);
  if (functionArea) filtered = filtered.filter(r => r.functionArea === functionArea);

  if (filtered.length === 0) {
    return { empty: true };
  }

  // ── Summary metrics ───────────────────────────────────────────────
  const ttfDays = filtered
    .filter(r => r.openDate && r.placementDate)
    .map(r => Math.round((new Date(r.placementDate) - new Date(r.openDate)) / (1000 * 60 * 60 * 24)));
  const ttfAvgDays = ttfDays.length >= 3
    ? Math.round(ttfDays.reduce((s, v) => s + v, 0) / ttfDays.length)
    : null;
  const ttfStdDev = ttfDays.length >= 3
    ? Math.round(Math.sqrt(ttfDays.reduce((s, d) => s + Math.pow(d - ttfDays.reduce((a, b) => a + b, 0) / ttfDays.length, 2), 0) / ttfDays.length))
    : null;
  const ttfResult = {
    weeks: ttfAvgDays,
    stdDevWeeks: ttfStdDev,
    label: ttfAvgDays !== null ? `~${ttfAvgDays}d ±${ttfStdDev}d` : 'Insufficient data',
    sampleSize: ttfDays.length
  };
  const avgTTHDays = _paAvgTTH(filtered);
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
  const funnelStages = computeRoleFunnel(totals, benchmarks);

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

      // Avg TTH across all roles in the group that have both dates
      const tthValues = group.roles
        .filter(r => r.openDate && r.placementDate)
        .map(r => Math.round((new Date(r.placementDate) - new Date(r.openDate)) / (1000 * 60 * 60 * 24)));
      const avgTth = tthValues.length
        ? Math.round(tthValues.reduce((s, v) => s + v, 0) / tthValues.length)
        : null;

      const groupPlacements = allPlacements.filter(p => groupIds.has(String(p.RoleIDLookupId || p.RoleID || '')));
      const salaries = groupPlacements.map(p => parseFloat(p.SalaryAgreed)).filter(v => !isNaN(v) && v > 0);
      const avgSalary = salaries.length ? Math.round(salaries.reduce((s, v) => s + v, 0) / salaries.length) : null;
      const currency = groupPlacements.find(p => p.Currency)?.Currency || '';
      const SYMBOLS = { GBP: '£', EUR: '€', USD: '$', CAD: 'CA$', AUD: 'A$', SGD: 'S$', AED: 'AED', ZAR: 'R', LKR: 'LKR' };
      const sym = SYMBOLS[currency] || currency;

      const roleFunnel = computeRoleFunnel(roleTotals, benchmarks);

      return { key: group.key, functionArea: group.functionArea, roleTotals, avgTth, avgSalary, sym, roleFunnel };
    });

  return { empty: false, ttfResult, avgTTHDays, sampleSize, totals, funnelStages, groups, groupCount: Object.keys(groupMap).length };
}

// ── Results HTML (pure — no fetching) ────────────────────────────────
function _paRenderResultsHtml(results, location, functionArea) {
  const { ttfResult, avgTTHDays, sampleSize, totals, funnelStages, groups, groupCount } = results;

  const ragDot = rag => {
    const colours = { green: "var(--status-success-text)", amber: "var(--c-amber-mid)", red: "var(--c-red-mid)", grey: "var(--c-gray-300)" };
    return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colours[rag] || colours.grey};margin-right:6px"></span>`;
  };

  // ── Summary cards ─────────────────────────────────────────────────
  const summaryHtml = `
      <div class="print-avoid-break" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px 24px 24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
      <div style="font-size:15px;font-weight:600;color:var(--brand);margin:0 0 16px 0;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)">
        Summary
        ${location || functionArea
          ? `<span style="font-size:12px;font-weight:400;color:var(--text-muted);margin-left:8px">
              ${[functionArea, location].filter(Boolean).join(" · ")}</span>`
          : ""}
      </div>
      <div class="kpi-strip">
        <div class="kpi-card">
          <div class="kpi-value">${ttfResult.weeks !== null ? `~${ttfResult.weeks}d` : "—"}</div>
          <div class="kpi-label">Predicted Time to Hire</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
            ${ttfResult.stdDevWeeks !== null ? `±${ttfResult.stdDevWeeks}d` : ttfResult.label}
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${avgTTHDays !== null ? `${Math.round(avgTTHDays)}d` : "—"}</div>
          <div class="kpi-label">Avg. Actual Time to Hire</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${sampleSize} placement${sampleSize !== 1 ? "s" : ""}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${totals.Hires > 0 ? Math.round(totals.Outreach / totals.Hires) : "—"}</div>
          <div class="kpi-label">Outreach per Hire</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">avg. across filtered roles</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${totals.Offers > 0 ? Math.round((totals.Hires / totals.Offers) * 100) + "%" : "—"}</div>
          <div class="kpi-label">Offer Success Rate</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${totals.Offers} offer${totals.Offers !== 1 ? "s" : ""} made</div>
        </div>
      </div>
    </div>
  `;

  // ── Funnel drop-off ───────────────────────────────────────────────
  const funnelHtml = `
      <div class="print-avoid-break" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px 24px 24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
      <div style="font-size:15px;font-weight:600;color:var(--brand);margin:0 0 16px 0;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)">Funnel Drop-off</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        ${funnelStages.map(s => `
          <div style="flex:1;min-width:130px;background:var(--surface-tint);border:1px solid var(--border);border-radius:6px;padding:14px 16px">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${s.stage}</div>
            <div style="font-size:22px;font-weight:700;color:var(--brand)">
              ${s.conv !== null ? s.conv + "%" : "—"}
            </div>
            <div style="font-size:12px;margin-top:6px">
              ${ragDot(s.rag)}${s.rag === "grey" ? "No data" : s.rag.charAt(0).toUpperCase() + s.rag.slice(1)}
            </div>
          </div>`).join("")}
      </div>
    </div>
  `;

 // ── Role-by-role breakdown ────────────────────────────────────────
  // N-247c: search narrows `groups` (Role/Location + Functional Area);
  // sortRows layers on top of the existing key-alphabetical default order
  // computed in _paComputeResults (kept as-is, not touched here).
  const searchedGroups = filterRowsByText(groups, _paBreakdownSearch, g => [g.key, g.functionArea]);
  const PA_BREAKDOWN_SORT_COLUMNS = {
    role:             { type: 'text',   get: g => g.key },
    functionArea:     { type: 'text',   get: g => g.functionArea },
    avgSalary:        { type: 'number', get: g => g.avgSalary },
    avgTth:           { type: 'number', get: g => g.avgTth },
    // N-247c: raw ratios, not the rounded/%-formatted display values below.
    outreachResponse: { type: 'number', get: g => g.roleTotals.Outreach > 0 ? g.roleTotals.Responses / g.roleTotals.Outreach : null },
    offerSuccess:     { type: 'number', get: g => g.roleTotals.Offers > 0 ? g.roleTotals.Hires / g.roleTotals.Offers : null },
    // Funnel (RAG) is not sortable — a multi-stage dot summary has no
    // single scalar, same reasoning as leaving other computed badges alone.
  };
  const sortedGroups = sortRows(searchedGroups, _paBreakdownSort, PA_BREAKDOWN_SORT_COLUMNS);
  const rows = sortedGroups.map(group => {
      const funnelSummary = group.roleFunnel
        .map(s => `<span title="${s.stage}: ${s.conv !== null ? s.conv + "%" : "—"}">${ragDot(s.rag)}</span>`)
        .join("");

      return `
        <tr>
          <td>${_paEsc(group.key)}</td>
          <td>${_paEsc(group.functionArea || "—")}</td>
          <td style="text-align:center">${group.avgSalary !== null ? group.sym + group.avgSalary.toLocaleString('en-GB') : "—"}</td>
          <td style="text-align:center">${group.avgTth !== null ? group.avgTth + "d" : "—"}</td>
          <td style="text-align:center">${group.roleTotals.Outreach > 0 ? Math.round((group.roleTotals.Responses / group.roleTotals.Outreach) * 100) + "%" : "—"}</td>
          <td style="text-align:center">${funnelSummary}</td>
          <td style="text-align:center">${group.roleTotals.Offers > 0
            ? Math.round((group.roleTotals.Hires / group.roleTotals.Offers) * 100) + "%"
            : "—"}</td>
        </tr>`;
    })
    .join("");

  const breakdownHtml = `
      <div class="print-avoid-break" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px 24px 24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
      <div style="font-size:15px;font-weight:600;color:var(--brand);margin:0 0 16px 0;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)">
        Role Breakdown <span style="font-size:12px;font-weight:400;color:var(--text-muted)">(${sortedGroups.length} of ${groupCount} role type${groupCount !== 1 ? "s" : ""})</span>
      </div>
      <table class="data-table pa-breakdown-table" style="width:100%;margin:0">
        <thead>
          <tr>
            ${sortableHeader('Role', 'role', _paBreakdownSort, 'paSetBreakdownSort')}
            ${sortableHeader('Functional Area', 'functionArea', _paBreakdownSort, 'paSetBreakdownSort')}
            ${sortableHeader('Avg. Salary', 'avgSalary', _paBreakdownSort, 'paSetBreakdownSort')}
            ${sortableHeader('Avg. Actual TTH', 'avgTth', _paBreakdownSort, 'paSetBreakdownSort')}
            ${sortableHeader('Outreach Response', 'outreachResponse', _paBreakdownSort, 'paSetBreakdownSort')}
            <th style="text-align:center">Funnel (RAG)</th>
            ${sortableHeader('Offer Success', 'offerSuccess', _paBreakdownSort, 'paSetBreakdownSort')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="font-size:11px;color:var(--text-faint);margin-top:12px">
        Funnel RAG dots: Response rate · IV1 Conversion · IV→Offer · Offer Success. Hover for values.
      </div>
    </div>
  `;

  return summaryHtml + funnelHtml + breakdownHtml;
}

// ── Helpers ───────────────────────────────────────────────────────────
function _paUnique(arr, key) {
  return [...new Set(arr.map(r => r[key]).filter(Boolean))];
}

function _paAvgTTH(placements) {
  const valid = placements.filter(r => r.openDate && r.placementDate);
  if (!valid.length) return null;
  const total = valid.reduce((s, r) =>
    s + (new Date(r.placementDate) - new Date(r.openDate)), 0);
  return total / valid.length / (1000 * 60 * 60 * 24); // days
}

function _paEsc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
