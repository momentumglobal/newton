// CoE Hiring Plan SharePoint API calls. N-317: the CoEPlanForecast read/write
// (getCoEPlanForecast / saveCoEForecastMonth) was removed with the forecast
// table — the list and its data are kept.
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
