// LCI (lead magnet / reports / model row & milestone edits) SharePoint API
// calls. Extracted from api.js by N-237b — single-consumer functions used
// across lci-leadmagnet.js, lci-pages.js, lci-report.js, lci-editor.js and
// lci-summary.js (all sales.html). Depends on getItems/createItem/
// updateItem/deleteItem, defined in graph-client.js (loads first, see script order).
// N-476 (R3-7): the rest of the LCI model / row / milestone CRUD and copyLCIModel
// (which uses _pickFields, api.js) live here too. Also loads on reporting.html:
// getRejectionIntelInputs (api-sla.js) reads getLCIModels / getAllLCIModelRows.

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

// ── LCI Cost Model ─────────────────────────────────────────
async function getLCIModels() {
  return getItems("LCIModels");
}
async function getLCIModelById(id) {
  return getItem("LCIModels", id);
}
async function createLCIModel(fields) {
  return createItem("LCIModels", fields);
}
async function updateLCIModel(id, fields) {
  return updateItem("LCIModels", id, fields);
}
async function deleteLCIModel(id) {
  // Delete rows + milestones first, then the header.
  const [rows, milestones] = await Promise.all([getLCIRows(id), getLCIMilestones(id)]);
  for (const r of rows)       await deleteItem("LCIModelRows", r.id);
  for (const m of milestones) await deleteItem("LCIMilestones", m.id);
  return deleteItem("LCIModels", id);
}

async function getLCIRows(modelId) {
  return getItems("LCIModelRows", `fields/ModelIDLookupId eq ${modelId}`);
}
// N-388 (DA-8): every LCIModelRows row, for the Rejection Intelligence benchmark index.
async function getAllLCIModelRows() {
  return getItems("LCIModelRows");
}
async function createLCIRow(fields) {
  return createItem("LCIModelRows", fields);
}
async function deleteLCIRow(id) {
  return deleteItem("LCIModelRows", id);
}

async function getLCIMilestones(modelId) {
  return getItems("LCIMilestones", `fields/ModelIDLookupId eq ${modelId}`);
}
async function createLCIMilestone(fields) {
  return createItem("LCIMilestones", fields);
}
async function deleteLCIMilestone(id) {
  return deleteItem("LCIMilestones", id);
}

// Duplicate a model: header (status reset to Draft) + all rows + milestones.
// Fields are whitelisted — Graph returns read-only system fields (LinkTitle,
// Created, Modified, Author...) that must not be sent back on create.
const _LCI_MODEL_COPY_FIELDS = [
  'ClientName', 'ProjectID', 'Location', 'LocalCurrency', 'DisplayCurrency',
  'FXRateLocalToDisplay', 'StartMonth', 'HorizonMonths', 'AssignedDMEmail',
  'EmployerBurdenPct', 'SalaryMonths', 'OfficeCostPerHead', 'EoRFeePerHead',
  'SectionsEnabled', 'Assumptions', 'NoticeMonths',
];
const _LCI_ROW_COPY_FIELDS = [
  'Title', 'RowType', 'Team', 'CareerLevel', 'AnnualSalary', 'BonusPct',
  'Quantity', 'ExitMonth', 'LegacyCategory', 'NoticeMonthsOverride',
  'MonthValues', 'SortOrder',
];
const _LCI_MILESTONE_COPY_FIELDS = ['Title', 'StartMonth', 'EndMonth', 'SortOrder'];

async function copyLCIModel(modelId, newTitle, onProgress = null) {
  const [model, rows, milestones] = await Promise.all([
    getLCIModelById(modelId), getLCIRows(modelId), getLCIMilestones(modelId),
  ]);
  const total = rows.length + milestones.length;
  let done = 0;
  const created = await createLCIModel({
    ..._pickFields(model, _LCI_MODEL_COPY_FIELDS),
    Title:  newTitle || `${model.Title} (copy)`,
    Status: 'Draft',
  });
  const newId = created.id;
  const createdRowIds = [];
  const createdMilestoneIds = [];
  try {
    for (const r of rows) {
      const cr = await createLCIRow({ ..._pickFields(r, _LCI_ROW_COPY_FIELDS), ModelIDLookupId: Number(newId) });
      createdRowIds.push(cr.id);
      if (onProgress) onProgress(++done, total);
    }
    for (const m of milestones) {
      const cm = await createLCIMilestone({ ..._pickFields(m, _LCI_MILESTONE_COPY_FIELDS), ModelIDLookupId: Number(newId) });
      createdMilestoneIds.push(cm.id);
      if (onProgress) onProgress(++done, total);
    }
  } catch (e) {
    // N-082: roll back the partial copy — best-effort, and a failed
    // cleanup delete must never mask the original error.
    for (const id of createdMilestoneIds) { try { await deleteLCIMilestone(id); } catch (_) { /* best-effort */ } }
    for (const id of createdRowIds)       { try { await deleteLCIRow(id); } catch (_) { /* best-effort */ } }
    try { await deleteLCIModel(newId); } catch (_) { /* best-effort */ }
    throw new Error('Copy failed — nothing was created. ' + e.message);
  }
  return created;
}
