// js/api-weekly.js — N-548 (AMCP-4): the one WeeklyActivity write sequence.
//
// create-or-update for a weekly row, shared by the bulk grid and the Newton for Claude
// log_weekly_activity commit. Declarations only — nothing runs at load. Loads after api.js and
// api-access.js in reporting.html and mobile.html, and in CONFIG.MCP.scripts. Runtime dependencies:
// createWeeklyActivity (api.js: N-315 ProjectID resolve + verify/heal — still the ONLY raw create,
// tests/lint-weeklyactivity-writes.js), updateItem (graph-client.js).
// The single-role form keeps its own optimistic create/edit paths; it only shares weekly-activity-logic.js.

// `fields` is the body from weeklyFields (create) or weeklyEditFields (edit); `existingId` the stored
// row's id when one exists. -> { id, created }.
async function saveWeeklyRow({ existingId, fields }) {
  if (existingId) {
    await updateItem('WeeklyActivity', existingId, fields);
    return { id: existingId, created: false };
  }
  const created = await createWeeklyActivity(fields);
  return { id: created && created.id ? created.id : null, created: true };
}
