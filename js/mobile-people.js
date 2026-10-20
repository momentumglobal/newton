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
function mpKpiCard(label, value, sub, bg) {
  return `
    <div class="m-detail-panel" style="${bg ? 'background:' + bg + ';' : ''}margin-bottom:12px">
      <div class="m-detail-label" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700">${label}</div>
      <div class="kpi-value" style="font-size:26px;font-weight:700;color:var(--c-brand);margin:2px 0">${value}</div>
      ${sub ? `<div class="m-detail-label" style="margin-bottom:0">${sub}</div>` : ''}
    </div>`;
}

// Delta chip (+/- vs last quarter), mirrors desktop colours.
function mpDelta(curr, prev) {
  const d = curr - prev;
  if (d === 0) return ` <span style="color:var(--c-gray-450);font-size:15px">-</span>`;
  const colour = d > 0 ? 'var(--c-success)' : 'var(--c-danger)';
  return ` <span style="color:${colour};font-size:15px">${d > 0 ? '+' : ''}${d}</span>`;
}

async function mobileRenderPeopleDashboard(main) {
  mobileSetTitle('People', 'Dashboard');
  main.innerHTML = '<div class="m-empty">Loading dashboard...</div>';

  try {
    const [assignments, people] = await Promise.all([
      getAssignments({}),
      getPeople(false),
    ]);

    const allRows = computeMonthlyRows(assignments);
    const { year: thisY, revYTD, utilYTD, activeCustomers, prevQCustomers, billedHeadcount, prevQHeadcount } =
      peopleKpiFigures(allRows, assignments, new Date());

    const utilBg = utilYTD >= CONFIG.UTILISATION_THRESHOLDS.green ? 'var(--c-success-bg-alt)'
                 : utilYTD >= CONFIG.UTILISATION_THRESHOLDS.amber ? 'var(--c-warn-bg-soft)'
                 : 'var(--c-danger-bg-alt)';

    main.innerHTML = `
      ${mpKpiCard('Estimated Revenue ' + thisY, mpFmtGBP(revYTD), 'Current year YTD')}
      ${mpKpiCard('Utilisation ' + thisY, mpFmtPct(utilYTD), 'Current year YTD', utilBg)}
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
