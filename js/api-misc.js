// Small single-consumer SharePoint API calls with no natural shared home.
// Extracted from api.js by N-237b — one function each for people-invoices.js
// (people.html), sales-pages.js (sales.html), dashboard-project.js
// (reporting.html / market-reporting.html) and people-payroll.js
// (people.html). Depends on getItems/createItem/deleteItem (graph-client.js)
// and getGhostUser and buildPayrollSummaryFields (utils.js), all loading first
// (see script order).

// ── People module: GPInvoices list ──────────────────────────
async function getGPInvoices() {
  const invoices = await getItems("GPInvoices");
  return invoices.sort((a, b) => {
    const da = a.InvoiceDate ? new Date(a.InvoiceDate) : new Date(0);
    const db = b.InvoiceDate ? new Date(b.InvoiceDate) : new Date(0);
    return db - da;
  });
}

async function deleteSalesForecast(id) {
  return deleteItem("SalesForecasts", id);
}

// N-206: picks the ONE project to default a Talent Partner's Project Dashboard
// to, when they have no project selector to correct a wrong guess (unlike a
// DM/admin — see renderProjectDashboard()). N-367: a current Project Team
// (Assignments) row, else the latest start — defaultProjectIdFromAssignments
// (permissions.js). Its own read rather than a getUserProjectIds() flag: that
// function's callers want the union of a user's projects, old and new. The read
// is cached, so it adds no real round trip. N-472: a bad CONFIG.ACCESS_SCOPE.mode
// gives null (_accessScopeOk, api.js).
async function getDefaultUserProjectId(email) {
  await _ensureGhostGate();   // N-282: getGhostUser() is only valid after the gate
  const lower = (getGhostUser() || email).toLowerCase();
  if (!_accessScopeOk()) return null;
  return defaultProjectIdFromAssignments(await _getAssignmentsForUser(lower), localDayISO());
}

// ── Payroll summary ───────────────────────────────────────────────────
// N-300 (SEC-6b): the summary is written to the restricted PayrollSummaries
// list (admin + leadership), never to Notifications (everyone can read
// that). The payroll Power Automate flow triggers on PayrollSummaries.
async function getPayrollSummaryFor(year, month) {
  const key  = buildPayrollSummaryFields({ month, year, joiners: [], leavers: [], bonus: null }).Title;
  const rows = await getItems('PayrollSummaries', `fields/Title eq '${odataStr(key)}'`);
  return rows.length ? rows[0] : null;
}

// One summary per month: an existing row for the month means nothing is
// written (and so no second email). Errors propagate to the caller.
async function createPayrollSummary(args) {
  const fields = buildPayrollSummaryFields(args);
  if (await getPayrollSummaryFor(args.year, args.month)) return { alreadySent: true, fields };
  await createItem('PayrollSummaries', fields);
  return { alreadySent: false, fields };
}
