// js/mobile-analytics.js - Mobile Market Analytics: Placement Analytics (read-only)
//
// Phase C: condensed Placement Analytics = Summary tiles + Funnel Drop-off
// tiles, filterable by Location and/or Functional Area. Reuses the desktop
// data (getHistoricalPlacements / getActivityForAnalytics) and the shared
// computeRoleFunnel from analytics.js, so figures match the desktop page.
// The desktop role-by-role breakdown TABLE is intentionally omitted on mobile.

// State
let _maLocation     = '';
let _maFunctionArea = '';
let _maData         = null;  // { historical, activityRaw, benchmarks }

function maEsc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function maUnique(arr, key) {
  return [...new Set(arr.map(r => r[key]).filter(Boolean))];
}

async function mobileRenderPlacementAnalytics(main) {
  mobileSetTitle('Market Analytics', 'Placement Analytics');
  main.innerHTML = '<div class="m-empty">Loading analytics...</div>';

  try {
    const [historical, activityRaw] = await Promise.all([
      getHistoricalPlacements(),
      getActivityForAnalytics(52),
    ]);
    _maData = { historical, activityRaw, benchmarks: CONFIG.ANALYTICS_BENCHMARKS };

    const locations     = maUnique(historical, 'country').sort();
    const functionAreas = maUnique(historical, 'functionArea').sort();
    if (_maLocation     && !locations.includes(_maLocation))         _maLocation     = '';
    if (_maFunctionArea && !functionAreas.includes(_maFunctionArea)) _maFunctionArea = '';

    const locOpts = '<option value="">All Locations</option>' +
      locations.map(l => `<option value="${maEsc(l)}" ${l === _maLocation ? 'selected' : ''}>${maEsc(l)}</option>`).join('');
    const faOpts = '<option value="">All Functional Areas</option>' +
      functionAreas.map(f => `<option value="${maEsc(f)}" ${f === _maFunctionArea ? 'selected' : ''}>${maEsc(f)}</option>`).join('');

    main.innerHTML = `
      <div class="m-detail-panel" style="margin-bottom:12px">
        <div class="m-form-group">
          <label class="m-label">Location</label>
          <select class="m-select" id="ma-loc" onchange="mobileApplyAnalyticsFilters()">${locOpts}</select>
        </div>
        <div class="m-form-group" style="margin-bottom:0">
          <label class="m-label">Functional Area</label>
          <select class="m-select" id="ma-fa" onchange="mobileApplyAnalyticsFilters()">${faOpts}</select>
        </div>
      </div>
      <div id="ma-results"></div>
    `;

    maRenderResults();
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error loading analytics: ${e.message}</div>`;
  }
}

function mobileApplyAnalyticsFilters() {
  const loc = document.getElementById('ma-loc');
  const fa  = document.getElementById('ma-fa');
  _maLocation     = loc ? loc.value : '';
  _maFunctionArea = fa  ? fa.value  : '';
  maRenderResults();
}

function maRenderResults() {
  const container = document.getElementById('ma-results');
  if (!container || !_maData) return;

  const { historical, activityRaw, benchmarks } = _maData;

  let filtered = historical;
  if (_maLocation)     filtered = filtered.filter(r => r.country      === _maLocation);
  if (_maFunctionArea) filtered = filtered.filter(r => r.functionArea === _maFunctionArea);

  if (!filtered.length) {
    container.innerHTML = '<div class="m-empty">No placement data for the selected filters.</div>';
    return;
  }

  // Summary metrics (mirrors desktop)
  const ttfDays = filtered
    .filter(r => r.openDate && r.placementDate)
    .map(r => Math.round((new Date(r.placementDate) - new Date(r.openDate)) / 86400000));
  const ttfAvg = ttfDays.length >= 3
    ? Math.round(ttfDays.reduce((s, v) => s + v, 0) / ttfDays.length) : null;

  const validTth = filtered.filter(r => r.openDate && r.placementDate);
  const avgTTH = validTth.length
    ? Math.round(validTth.reduce((s, r) =>
        s + (new Date(r.placementDate) - new Date(r.openDate)), 0) / validTth.length / 86400000)
    : null;
  const sampleSize = filtered.length;

  const filteredIds = new Set(filtered.map(r => String(r.id)));
  const filtAct = activityRaw.filter(a => filteredIds.has(String(a.RoleIDLookupId)));
  const totals = {
    Outreach:   sumField(filtAct, 'Outreach'),
    Responses:  sumField(filtAct, 'Responses'),
    Submitted:  sumField(filtAct, 'Submitted'),
    Interview1: sumField(filtAct, 'Interview1'),
    Offers:     sumField(filtAct, 'Offers'),
    Hires:      sumField(filtAct, 'Hires'),
  };
  const funnelStages = computeRoleFunnel(totals, benchmarks);

  const filterLabel = [_maFunctionArea, _maLocation].filter(Boolean).join(' · ');

  // Summary tiles (2-up grid)
  const summaryTiles = `
    <div class="m-section-header" style="margin-top:0">Summary${filterLabel ? ` · ${maEsc(filterLabel)}` : ''}</div>
    <div class="m-an-grid">
      ${maTile(ttfAvg !== null ? `~${ttfAvg}d` : '-', 'Predicted Time to Hire')}
      ${maTile(avgTTH !== null ? `${avgTTH}d` : '-', 'Avg Actual TTH', `${sampleSize} placement${sampleSize !== 1 ? 's' : ''}`)}
      ${maTile(totals.Hires > 0 ? Math.round(totals.Outreach / totals.Hires) : '-', 'Outreach per Hire')}
      ${maTile(totals.Offers > 0 ? Math.round((totals.Hires / totals.Offers) * 100) + '%' : '-', 'Offer Success', `${totals.Offers} offer${totals.Offers !== 1 ? 's' : ''}`)}
    </div>`;

  // Funnel drop-off tiles
  const ragColour = { green: '#27AE60', amber: '#F39C12', red: '#E74C3C', grey: '#CCC' };
  const funnelTiles = `
    <div class="m-section-header">Funnel Drop-off</div>
    <div class="m-an-grid">
      ${funnelStages.map(s => `
        <div class="m-an-tile">
          <div class="m-an-tile-label">${s.stage}</div>
          <div class="m-an-tile-value">${s.conv !== null ? s.conv + '%' : '-'}</div>
          <div class="m-an-tile-sub">
            <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${ragColour[s.rag] || ragColour.grey};margin-right:5px"></span>
            ${s.rag === 'grey' ? 'No data' : s.rag.charAt(0).toUpperCase() + s.rag.slice(1)}
          </div>
        </div>`).join('')}
    </div>`;

  container.innerHTML = summaryTiles + funnelTiles;
  if (typeof runKpiCountUps === 'function') runKpiCountUps(container);
}

function maTile(value, label, sub) {
  return `
    <div class="m-an-tile">
      <div class="m-an-tile-value kpi-value">${value}</div>
      <div class="m-an-tile-label">${label}</div>
      ${sub ? `<div class="m-an-tile-sub">${sub}</div>` : ''}
    </div>`;
}
