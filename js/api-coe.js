// CoE Hiring Plan forecast SharePoint API calls.
// Extracted from api.js by N-237b — single-consumer functions used only by
// coe-plan.js (reporting.html). Depends on getItems/createItem/updateItem/
// deleteItem/isoDate, all defined in api.js (loads first, see script order).
// getCoEPlanRows/createCoEPlanRow stay in api.js — multi-consumer
// (coe-plan.js, lci-link.js, report-builder.js).
// N-312: linkCoEPlanRow is also called from forms.js (Add Role opened from a
// plan row) — both files load on reporting.html only.

async function updateCoEPlanRow(id, payload) {
  return updateItem("CoEPlanRows", id, payload);
}

// N-312 (HC-6): a plan row tracks ONE headcount. LinkedRoleID is kept = that
// headcount's RoleID (spec S-2, like Placements keeping RoleID) and is always
// written together with LinkedHeadcountID. `headcount` needs id + RoleID.
async function linkCoEPlanRow(rowId, headcount) {
  return updateItem("CoEPlanRows", rowId, {
    LinkedHeadcountID: Number(headcount.id),
    LinkedRoleID:      Number(headcount.RoleID),
  });
}

async function unlinkCoEPlanRow(rowId) {
  return updateItem("CoEPlanRows", rowId, { LinkedHeadcountID: null, LinkedRoleID: null });
}

async function deleteCoEPlanRow(id) {
  return deleteItem("CoEPlanRows", id);
}

async function getCoEPlanForecast(projectId) {
  return getItems("CoEPlanForecast", `fields/ProjectID eq ${projectId}`);
}

async function saveCoEForecastMonth(projectId, monthISO, hires, existingId = null) {
  if (existingId) return updateItem("CoEPlanForecast", existingId, { ForecastedHires: hires });
  // N-130: isoDate() puts ForecastMonth on the same midday-UTC convention as
  // every other CoE date. Existing rows keep their legacy shape — nothing is
  // migrated — and spMonthIn() on the read side handles both.
  return createItem("CoEPlanForecast", { ProjectID: projectId, ForecastMonth: isoDate(monthISO), ForecastedHires: hires });
}
