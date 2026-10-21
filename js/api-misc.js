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
// DM/admin — see renderProjectDashboard()). Prefers an Active UserAssignments
// row over an inactive one, so a TP who has just been reassigned lands on
// their current project, not an old one they still hold a historical
// (inactive) assignment row for. Falls back to the first assignment if none
// are Active (fully rolled off with no live assignment) — there is no
// "correct" project to prefer in that edge case.
// Deliberately re-queries UserAssignments rather than extending
// getUserProjectIds() with an activeOnly flag: that function's 13 other
// callers all correctly want the union of a user's projects, old and new, and
// must not change. The read is cached, so this doesn't add a real extra
// network round-trip alongside a getUserProjectIds() call for the same user.
// N-367 (PT-7): CONFIG.ACCESS_SCOPE.mode picks the source, as in
// getUserProjectIds(). 'assignments' → defaultProjectIdFromAssignments
// (permissions.js: a current assignment, else the latest start). 'shadow' →
// the UserAssignments answer below is returned and the Assignments answer is
// compared in the background (check 'default', diagnostics.js).
async function getDefaultUserProjectId(email) {
  await _ensureGhostGate();   // N-282: getGhostUser() is only valid after the gate
  const lower = (getGhostUser() || email).toLowerCase();
  const mode = accessScopeMode();
  if (mode === 'assignments') {
    return defaultProjectIdFromAssignments(await _getAssignmentsForUser(lower), localDayISO());
  }
  const assignments = await getItems("UserAssignments", `fields/Title eq '${odataStr(lower)}'`);
  // N-281: admin rows (ProjectID 0) are not a project — skip them.
  const projectRows = assignments.filter(a => a.AssignedRole !== 'admin');
  const active = projectRows.find(a => a.Active !== false);
  const legacy = projectRows.length ? String((active || projectRows[0]).ProjectID) : null;
  if (mode === 'shadow' && typeof scopeShadowDue === 'function' && scopeShadowDue('default', lower)) {
    _getAssignmentsForUser(lower)
      .then(rows => {
        const next = defaultProjectIdFromAssignments(rows, localDayISO());
        reportScopeShadow('default', lower, legacy ? [legacy] : [], next ? [next] : []);
      })
      .catch(e => console.warn('Access shadow: Assignments read failed —', e && e.message));
  }
  return legacy;
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
