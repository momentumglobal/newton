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

// Utilisation % from monthly rows (excludes CSD level), as desktop.
function mpCalcUtilisation(rows) {
  const filtered  = rows.filter(r => r.Level !== 'CSD');
  const billedCap = filtered.reduce((s, r) => s + r.BilledCapacity, 0);
  const totalCap  = filtered.reduce((s, r) => s + r.Capacity, 0);
  return totalCap > 0 ? billedCap / totalCap : 0;
}

// Monthly rows whose MonthStart falls within [start, end].
function mpRowsInRange(rows, start, end) {
  return rows.filter(r => {
    const d = new Date(r.MonthStart);
    return d >= start && d <= end;
  });
}

// --- KPI card markup (reuses the mobile .m-* look) ---
function mpKpiCard(label, value, sub, bg) {
  return `
    <div class="m-detail-panel" style="${bg ? 'background:' + bg + ';' : ''}margin-bottom:12px">
      <div class="m-detail-label" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700">${label}</div>
      <div class="kpi-value" style="font-size:26px;font-weight:700;color:#0A0B44;margin:2px 0">${value}</div>
      ${sub ? `<div class="m-detail-label" style="margin-bottom:0">${sub}</div>` : ''}
    </div>`;
}

// Delta chip (+/- vs last quarter), mirrors desktop colours.
function mpDelta(curr, prev) {
  const d = curr - prev;
  if (d === 0) return ` <span style="color:#999;font-size:15px">-</span>`;
  const colour = d > 0 ? '#2e7d32' : '#c62828';
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

    const now    = new Date();
    const thisY  = now.getFullYear();
    const today  = new Date(); today.setHours(0, 0, 0, 0);

    // Revenue - YTD current year
    const ytdStart = new Date(thisY, 0, 1);
    const ytdRows  = mpRowsInRange(allRows, ytdStart, today);
    const revYTD   = ytdRows.reduce((s, r) => s + r.BilledRevenue, 0);

    // Utilisation - YTD current year
    const utilYTD  = mpCalcUtilisation(ytdRows);

    // Active customers + billed headcount, today vs end of previous quarter
    const cq       = Math.floor(now.getMonth() / 3);
    const prevQEnd = new Date(cq === 0 ? thisY - 1 : thisY, cq === 0 ? 12 : cq * 3, 0);
    prevQEnd.setHours(0, 0, 0, 0);

    const countCustomers = (asOf) => new Set(
      assignments.filter(a => {
        const s = a.StartDate ? new Date(a.StartDate) : null;
        const e = a.EndDate   ? new Date(a.EndDate)   : null;
        return s && s <= asOf && (!e || e >= asOf)
          && a.Customer && a.Customer !== 'Unassigned';
      }).map(a => a.Customer)
    ).size;

    const countBilledHC = (asOf) => new Set(
      assignments.filter(a => {
        const s = a.StartDate ? new Date(a.StartDate) : null;
        const e = a.EndDate   ? new Date(a.EndDate)   : null;
        return a.Billed === 'Yes' && s && s <= asOf && (!e || e >= asOf);
      }).map(a => a.EmployeeName)
    ).size;

    const activeCustomers = countCustomers(today);
    const prevQCustomers  = countCustomers(prevQEnd);
    const billedHeadcount = countBilledHC(today);
    const prevQHeadcount  = countBilledHC(prevQEnd);

    const utilBg = utilYTD >= CONFIG.UTILISATION_THRESHOLDS.green ? '#e6f4ea'
                 : utilYTD >= CONFIG.UTILISATION_THRESHOLDS.amber ? '#fff3e0'
                 : '#fce8e8';

    main.innerHTML = `
      ${mpKpiCard('Estimated Revenue ' + thisY, mpFmtGBP(revYTD), 'Current year YTD')}
      ${mpKpiCard('Utilisation ' + thisY, mpFmtPct(utilYTD), 'Current year YTD', utilBg)}
      ${mpKpiCard('Active Customers', activeCustomers + mpDelta(activeCustomers, prevQCustomers), 'As of today - vs last quarter')}
      ${mpKpiCard('Billed Headcount', billedHeadcount + mpDelta(billedHeadcount, prevQHeadcount), 'As of today - vs last quarter')}
    `;

    // KPI count-up animation if the helper is present (premium UI).
    if (typeof runKpiCountUps === 'function') runKpiCountUps(main);
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error loading dashboard: ${e.message}</div>`;
  }
}
