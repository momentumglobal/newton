// Market Report SharePoint API calls.
// Extracted from api.js by N-237a — single-consumer functions used only by
// market-report.js. Depends on getItems/getItem/createItem/updateItem,
// defined in api.js (loads first, see script order).

// ── Market Report ─────────────────────────────────────────────
async function getMarketReports() {
  return getItems("MarketReports");
}
async function getMarketReportById(id) {
  return getItem("MarketReports", id);
}
async function createMarketReport(fields) {
  return createItem("MarketReports", fields);
}
async function updateMarketReport(id, fields) {
  return updateItem("MarketReports", id, fields);
}

// N-245: ReportTitle and CreatedByEmail are set by the caller, never
// copied. Everything else whitelisted — never round-trip a fetched Graph
// item into createItem (read-only system fields, e.g. LinkTitle, → 403),
// same gotcha as copyBriefingPack/copySavedReport. A report has no child
// rows, so this is a single create, no rollback sequence.
const _MARKET_REPORT_COPY_FIELDS = [
  "RoleID", "ProjectID", "TAM", "Observations", "RoleName", "CustomerName",
];
async function copyMarketReport(id, owner) {
  const src = await getMarketReportById(id);
  return createMarketReport({
    ..._pickFields(src, _MARKET_REPORT_COPY_FIELDS),
    ReportTitle:    `${src.ReportTitle} (copy)`,
    CreatedByEmail: (owner || "").toLowerCase(),
  });
}
