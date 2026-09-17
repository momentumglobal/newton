// LCI (lead magnet / reports / model row & milestone edits) SharePoint API
// calls. Extracted from api.js by N-237b — single-consumer functions used
// across lci-leadmagnet.js, lci-pages.js, lci-report.js, lci-editor.js and
// lci-summary.js (all sales.html). Depends on getItems/createItem/
// updateItem/deleteItem, defined in api.js (loads first, see script order).
// getLCIRows/createLCIRow/deleteLCIRow and getLCIMilestones/
// createLCIMilestone/deleteLCIMilestone stay in api.js — copyLCIModel's
// rollback logic calls them internally, so they are NOT single-consumer
// despite lci-editor.js/lci-summary.js being their only external caller.

// ── LCI Lead Magnet locations ───────────────────────────────────────
async function getLCILocations() {
  return getItems("LCILocations");
}
async function createLCILocation(fields) {
  return createItem("LCILocations", fields);
}
async function updateLCILocation(id, fields) {
  return updateItem("LCILocations", id, fields);
}
async function deleteLCILocation(id) {
  return deleteItem("LCILocations", id);
}

// ── LCI Reports (saved report definitions) ──────────────────────────
async function getLCIReports() {
  return getItems("LCIReports");
}
async function createLCIReport(fields) {
  return createItem("LCIReports", fields);
}
async function updateLCIReport(id, fields) {
  return updateItem("LCIReports", id, fields);
}
async function deleteLCIReport(id) {
  return deleteItem("LCIReports", id);
}

async function updateLCIRow(id, fields) {
  return updateItem("LCIModelRows", id, fields);
}

async function updateLCIMilestone(id, fields) {
  return updateItem("LCIMilestones", id, fields);
}
