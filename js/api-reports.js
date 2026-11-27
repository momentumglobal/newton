// js/api-reports.js — SavedReports Graph reads and writes (N-550).
// Moved verbatim from js/report-builder.js so the Newton for Claude server (which loads no page
// file) can read a saved report and update its ModuleOrder through Newton's own writers
// (AMCP-E1; specs/N-550.md). Declarations only: no call at load, no DOM. Global names are
// unchanged, so every caller is untouched. Transport and caching stay in graph-client.js.

async function getSavedReports() {
  return getItems('SavedReports');
}
async function getSavedReportById(id) {
  return getItem('SavedReports', id);
}
async function createSavedReport(fields) {
  return createItem('SavedReports', fields);
}
async function updateSavedReport(id, fields) {
  return updateItem('SavedReports', id, fields);
}

// N-244: Title and ReportOwner are set by the caller, never copied.
// Everything else is whitelisted — never round-trip a fetched Graph item
// into a create (LinkTitle and friends are read-only → 403). A report has
// no child rows, so this is a single create with no rollback sequence, same
// as copyBriefingPack.
const _SAVED_REPORT_COPY_FIELDS = ['Scope', 'ProjectID', 'RoleID', 'Period', 'KpiPeriod', 'ModuleOrder'];
async function copySavedReport(id, owner) {
  const src = await getSavedReportById(id);
  return createSavedReport({
    ..._pickFields(src, _SAVED_REPORT_COPY_FIELDS),
    Title:       `${src.Title} (copy)`,
    ReportOwner: (owner || '').toLowerCase(),
  });
}
