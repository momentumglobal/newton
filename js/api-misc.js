// Small single-consumer SharePoint API calls with no natural shared home.
// Extracted from api.js by N-237b — one function each for people-invoices.js
// (people.html), sales-pages.js (sales.html), dashboard-project.js
// (reporting.html / market-reporting.html) and people-payroll.js
// (people.html). Depends on getItems/updateItem/deleteItem/getGhostUser/
// fireNotification, all defined in api.js (loads first, see script order).

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
async function getDefaultUserProjectId(email) {
  const lower = (getGhostUser() || email).toLowerCase();
  const assignments = await getItems("UserAssignments", `fields/Title eq '${lower}'`);
  if (!assignments.length) return null;
  const active = assignments.find(a => a.Active !== false);
  return String((active || assignments[0]).ProjectID);
}

// ── Payroll summary ───────────────────────────────────────────────────
async function createPayrollNotification({ month, year, joiners, leavers, bonus }) {
  const extraFields = {
    Month:      ['January','February','March','April','May','June','July','August','September','October','November','December'][month - 1],
    Year:       String(year),
    Joiners:    JSON.stringify(joiners),
    Leavers:    JSON.stringify(leavers),
    BonusData:  bonus ? JSON.stringify(bonus) : null,
  };
  return fireNotification({
    triggerType: 'payrollSummary',
    recipients:  ['system@newton'],
    triggerKey:  `payrollsummary-${year}-${month}`,
    tone:        'info',
    deepLink:    '',
    body:        `Payroll summary for ${month}/${year}`,
    extraFields,
  });
}
