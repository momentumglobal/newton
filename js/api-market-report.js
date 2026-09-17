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
