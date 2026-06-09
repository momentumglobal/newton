// js/placement-analytics.js — Placement Analytics page

// ── State ─────────────────────────────────────────────────────────────
let _paLocation      = "";   // selected Currency/Location filter value
let _paFunctionArea  = "";   // selected Department filter value
let _paData          = null; // { historical, activity, benchmarks }

// ── Entry point ───────────────────────────────────────────────────────
async function renderPlacementAnalytics() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="page-header">
      <h2>Placement Analytics</h2>
    </div>
    <div style="padding:32px;color:#888">Loading data…</div>
  `;

  // Load all data in parallel
  const [historical, activityRaw] = await Promise.all([
    getHistoricalPlacements(),
    getActivityForAnalytics(52),   // rolling 12 months of activity
  ]);
  const benchmarks = CONFIG.ANALYTICS_BENCHMARKS;

  _paData = { historical, activityRaw, benchmarks };

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

// ── Results renderer ──────────────────────────────────────────────────
function paRenderResults() {
  const container = document.getElementById("pa-results");
  if (!container || !_paData) return;

  const { historical, activityRaw, benchmarks } = _paData;

  // Filter historical placements by selected dimensions
  let filtered = historical;
  if (_paLocation)     filtered = filtered.filter(r => r.country      === _paLocation);
  if (_paFunctionArea) filtered = filtered.filter(r => r.functionArea === _paFunctionArea);

  if (filtered.length === 0) {
    container.innerHTML = `<p class="no-data" style="padding:32px">
      No placement data found for the selected filters.</p>`;
    return;
  }

  // ── Summary metrics ───────────────────────────────────────────────
  const ttfResult  = computeTTFPrediction(_paFunctionArea || null, _paLocation || null, historical);
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

  // ── Summary cards ─────────────────────────────────────────────────
  const summaryHtml = `
    <div style="background:#fff;border:1px solid #E8E8E8;border-radius:8px;padding:20px 24px 24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
      <div style="font-size:15px;font-weight:600;color:#0A0B44;margin:0 0 16px 0;padding-bottom:8px;border-bottom:1px solid #eee">
        Summary
        ${_paLocation || _paFunctionArea
          ? `<span style="font-size:12px;font-weight:400;color:#888;margin-left:8px">
              ${[_paFunctionArea, _paLocation].filter(Boolean).join(" · ")}</span>`
          : ""}
      </div>
      <div class="kpi-strip">
        <div class="kpi-card">
          <div class="kpi-value">${ttfResult.weeks !== null ? `~${ttfResult.weeks}w` : "—"}</div>
          <div class="kpi-label">Predicted Time to Hire</div>
          <div style="font-size:11px;color:#888;margin-top:4px">
            ${ttfResult.stdDevWeeks !== null ? `±${ttfResult.stdDevWeeks}w · n=${ttfResult.sampleSize}` : ttfResult.label}
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${avgTTHDays !== null ? `${Math.round(avgTTHDays / 7)}w` : "—"}</div>
          <div class="kpi-label">Avg. Actual Time to Hire</div>
          <div style="font-size:11px;color:#888;margin-top:4px">${sampleSize} placement${sampleSize !== 1 ? "s" : ""}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${totals.Hires > 0 ? Math.round(totals.Outreach / totals.Hires) : "—"}</div>
          <div class="kpi-label">Outreach per Hire</div>
          <div style="font-size:11px;color:#888;margin-top:4px">avg. across filtered roles</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${totals.Offers > 0 ? Math.round((totals.Hires / totals.Offers) * 100) + "%" : "—"}</div>
          <div class="kpi-label">Offer Success Rate</div>
          <div style="font-size:11px;color:#888;margin-top:4px">${totals.Offers} offer${totals.Offers !== 1 ? "s" : ""} made</div>
        </div>
      </div>
    </div>
  `;

  // ── Funnel drop-off ───────────────────────────────────────────────
  const ragDot = rag => {
    const colours = { green: "#27AE60", amber: "#F39C12", red: "#E74C3C", grey: "#CCC" };
    return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colours[rag] || colours.grey};margin-right:6px"></span>`;
  };

  const funnelHtml = `
    <div style="background:#fff;border:1px solid #E8E8E8;border-radius:8px;padding:20px 24px 24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
      <div style="font-size:15px;font-weight:600;color:#0A0B44;margin:0 0 16px 0;padding-bottom:8px;border-bottom:1px solid #eee">Funnel Drop-off</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        ${funnelStages.map(s => `
          <div style="flex:1;min-width:130px;background:#F9F9FC;border:1px solid #E8E8E8;border-radius:6px;padding:14px 16px">
            <div style="font-size:12px;color:#888;margin-bottom:6px">${s.stage}</div>
            <div style="font-size:22px;font-weight:700;color:#0A0B44">
              ${s.conv !== null ? s.conv + "%" : "—"}
            </div>
            <div style="font-size:12px;margin-top:6px">
              ${ragDot(s.rag)}${s.rag === "grey" ? "No data" : s.rag.charAt(0).toUpperCase() + s.rag.slice(1)}
            </div>
          </div>`).join("")}
      </div>
    </div>
  `;

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

  const rows = Object.values(groupMap)
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
        .map(r => Math.round((new Date(r.placementDate) - new Date(r.openDate)) / (1000 * 60 * 60 * 24 * 7)));
      const avgTth = tthValues.length
        ? Math.round(tthValues.reduce((s, v) => s + v, 0) / tthValues.length)
        : null;

      const roleFunnel = computeRoleFunnel(roleTotals, benchmarks);

      const funnelSummary = roleFunnel
        .map(s => `<span title="${s.stage}: ${s.conv !== null ? s.conv + "%" : "—"}">${ragDot(s.rag)}</span>`)
        .join("");

      return `
        <tr>
          <td>${_paEsc(group.key)}</td>
          <td>${_paEsc(group.functionArea || "—")}</td>
          <td style="text-align:center">${avgTth !== null ? avgTth + "w" : "—"}</td>
          <td style="text-align:center">${roleTotals.Outreach || "—"}</td>
          <td style="text-align:center">${funnelSummary}</td>
          <td style="text-align:center">${roleTotals.Offers > 0
            ? Math.round((roleTotals.Hires / roleTotals.Offers) * 100) + "%"
            : "—"}</td>
        </tr>`;
    })
    .join("");

  const breakdownHtml = `
    <div style="background:#fff;border:1px solid #E8E8E8;border-radius:8px;padding:20px 24px 24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
      <div style="font-size:15px;font-weight:600;color:#0A0B44;margin:0 0 16px 0;padding-bottom:8px;border-bottom:1px solid #eee">
        Role Breakdown <span style="font-size:12px;font-weight:400;color:#888">(${Object.keys(groupMap).length} role type${Object.keys(groupMap).length !== 1 ? "s" : ""})</span>
      </div>
      <table class="data-table" style="width:100%;margin:0">
        <thead>
          <tr>
            <th>Role</th>
            <th>Functional Area</th>
            <th style="text-align:center">Avg. Actual TTH</th>
            <th style="text-align:center">Outreach</th>
            <th style="text-align:center">Funnel (RAG)</th>
            <th style="text-align:center">Offer Success</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="font-size:11px;color:#aaa;margin-top:12px">
        Funnel RAG dots: Response rate · IV1 Conversion · IV→Offer · Offer Success. Hover for values.
      </div>
    </div>
  `;

  container.innerHTML = summaryHtml + funnelHtml + breakdownHtml;
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

function _paWorstRag(stages) {
  const rank = { red: 0, amber: 1, green: 2, grey: 3 };
  return stages.reduce((worst, s) =>
    (rank[s.rag] < rank[worst]) ? s.rag : worst, "grey");
}

function _paEsc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
