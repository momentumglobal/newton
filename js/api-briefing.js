// Briefing-pack and client-logo SharePoint API calls.
// Extracted from api.js by N-237a — single-consumer functions used only by
// briefing-pack.js. Depends on getItems/getItem/createItem/updateItem/
// deleteItem, defined in api.js (loads first, see script order).

// ── Client logos (N-214) ──────────────────────────────────────
// Keyed by project id held as text in Title, so one filtered read serves the
// briefing pack builder without touching the Projects payload.
async function getClientLogo(projectId) {
  const rows = await getItems("ClientLogos", `fields/Title eq '${String(projectId)}'`);
  return rows.length ? rows[0] : null;
}
async function upsertClientLogo(projectId, logoData, logoName) {
  const existing = await getClientLogo(projectId);
  const fields = {
    Title:     String(projectId),
    ProjectID: parseInt(projectId),
    LogoData:  logoData,
    LogoName:  logoName || "",
  };
  return existing
    ? updateItem("ClientLogos", existing.id, fields)
    : createItem("ClientLogos", fields);
}
async function deleteClientLogo(projectId) {
  const existing = await getClientLogo(projectId);
  if (existing) await deleteItem("ClientLogos", existing.id);
}

// ── Candidate briefing packs (N-211) ──────────────────────────
async function getBriefingPacks() {
  return getItems("BriefingPacks");
}
async function getBriefingPackById(id) {
  return getItem("BriefingPacks", id);
}
async function createBriefingPack(fields) {
  return createItem("BriefingPacks", fields);
}
async function updateBriefingPack(id, fields) {
  return updateItem("BriefingPacks", id, fields);
}
