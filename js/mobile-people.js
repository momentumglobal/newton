// js/mobile-people.js - Mobile People module (read-only)
//
// Phase B: condensed People Dashboard = 4 KPI tiles, stacked for mobile.
// Reuses the SAME data layer and calculations as the desktop People
// dashboard (getAssignments / getPeople / computeMonthlyRows), so figures
// match exactly. No charts on mobile (KPI tiles only).
//
// Read-only: no write actions in the People module on mobile.

// --- formatting (mirrors desktop people-pages.js) ---
function mpFmtGBP(n) {
  return '£' + (n || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function mpFmtPct(n) {
  return ((n || 0) * 100).toFixed(1) + '%';
}

// Utilisation % comes from personUtilisation() (utils.js), as desktop (N-328).

// --- KPI card markup (reuses the mobile .m-* look) ---
// N-418: `tone` is 'success' | 'warn' | 'danger' (a fixed set chosen by the caller) or empty; the
// tint is a class on the single status set, not an inline colour.
function mpKpiCard(label, value, sub, tone) {
  return `
    <div class="m-detail-panel${tone ? ' m-kpi--' + tone : ''}">
      <div class="m-detail-label m-kpi-label">${label}</div>
      <div class="kpi-value m-kpi-value">${value}</div>
      ${sub ? `<div class="m-detail-label m-kpi-sub">${sub}</div>` : ''}
    </div>`;
}

// Delta chip (+/- vs last quarter), mirrors desktop colours.
function mpDelta(curr, prev) {
  const d = curr - prev;
  if (d === 0) return ` <span class="m-delta m-delta--flat">-</span>`;
  return ` <span class="m-delta m-delta--${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>`;
}

async function mobileRenderPeopleDashboard(main) {
  mobileSetTitle('People', 'Dashboard');
  main.innerHTML = dashboardSkeleton(4);   // N-418

  try {
    const [assignments, people] = await Promise.all([
      getAssignments({}),
      getPeople(false),
    ]);

    const allRows = computeMonthlyRows(assignments);
    const { year: thisY, revYTD, utilYTD, activeCustomers, prevQCustomers, billedHeadcount, prevQHeadcount } =
      peopleKpiFigures(allRows, assignments, new Date());

    const utilTone = utilYTD >= CONFIG.UTILISATION_THRESHOLDS.green ? 'success'
                   : utilYTD >= CONFIG.UTILISATION_THRESHOLDS.amber ? 'warn'
                   : 'danger';

    main.innerHTML = `
      ${mpKpiCard('Estimated Revenue ' + thisY, mpFmtGBP(revYTD), 'Current year YTD')}
      ${mpKpiCard('Utilisation ' + thisY, mpFmtPct(utilYTD), 'Current year YTD', utilTone)}
      ${mpKpiCard('Active Customers', activeCustomers + mpDelta(activeCustomers, prevQCustomers), 'As of today - vs last quarter')}
      ${mpKpiCard('Billed Headcount', billedHeadcount + mpDelta(billedHeadcount, prevQHeadcount), 'As of today - vs last quarter')}
    `;

    // KPI count-up animation if the helper is present (premium UI).
    if (typeof runKpiCountUps === 'function') runKpiCountUps(main);
  } catch (e) {
    main.innerHTML = mobilePageError(e.message, ['mobileRetryPeopleDashboard']);
  }
}

// === Delegated actions (N-302f, SEC-12b) ===
registerActions({
  mobileRetryPeopleDashboard: () => mobileRenderPeopleDashboard(document.getElementById('m-main')),
});
