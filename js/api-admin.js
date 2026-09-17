// Schema/admin-console SharePoint API calls.
// Extracted from api.js by N-237b — single-consumer functions used only by
// os-admin.js (admin.html). Depends on getListColumns/getItems/updateItem/
// createItem, all defined in api.js (loads first, see script order).
// getAnnouncementMessage/getSeasonalEffect are beyond-spec additions to this
// file (see N-237b diff Reference section) — they're the read-side
// counterparts of setAnnouncementMessage/setSeasonalEffect and share the
// same single consumer, so splitting them across two files made no sense.
// _getAppSettingsRow stays in api.js — it's a private helper other
// functions there may grow to share; loads first, so still reachable here.

// { name, id, indexed }[] for just the requested internal column names.
async function getColumnIndexStatus(listName, columnNames) {
  const columns = await getListColumns(listName);
  return columns
    .filter(c => columnNames.includes(c.name))
    .map(c => ({ name: c.name, id: c.id, indexed: !!c.indexed }));
}

// N-174 (F-11a): per-list schema diff for the Data Health "Schema Check"
// panel. Iterates Object.keys(FIELD_ALIASES) DIRECTLY — not
// getMonitoredLists() — because DATA_HEALTH_EXCLUDED_LISTS is scoped to the
// row-count guard; a list opted out of row-count watching is not a reason
// to skip its schema check. FIELD_ALIASES stays un-exported (same reason as
// getMonitoredLists()); this is the one function besides that one allowed
// to read it directly.
//
// Expected set: CONFIG.LIST_FIELDS[list] where a projection entry exists
// (16 lists, "projected"); otherwise Object.keys(FIELD_ALIASES[list]) (the
// other 15). When that array is empty (9 lists registered as {} with no
// projection), no Graph call is made at all — nothing to check.
//
// "Unexpected" is only computed for projected lists: the 15 non-projected
// lists are read with fields($select=*), so there is no closed expected set
// to diff an extra column against.
//
// Failures are per-list and non-fatal — one broken list returns
// { list, error: true } and must not take out the panel, same discipline
// as getListItemCount()'s callers.
async function getSchemaDiffs() {
  const lists = Object.keys(FIELD_ALIASES).sort();
  return Promise.all(lists.map(async (list) => {
    const projected = Object.prototype.hasOwnProperty.call(CONFIG.LIST_FIELDS, list);
    const expectedRaw = projected ? CONFIG.LIST_FIELDS[list] : Object.keys(FIELD_ALIASES[list]);

    if (expectedRaw.length === 0) {
      return { list, projected, checked: false, expectedCount: 0, missing: [], unexpected: [] };
    }

    const expected = expectedRaw.map(schemaBaseColumnName);
    const ignore = CONFIG.SCHEMA_CHECK_IGNORE_COLUMNS || [];

    try {
      const columns = await getListColumns(list);
      const actual = columns.filter(c => !c.hidden).map(c => c.name);

      const missing = expected.filter(n => !actual.includes(n));
      const unexpected = projected
        ? actual.filter(n => !expected.includes(n) && !ignore.includes(n))
        : [];

      return { list, projected, checked: true, expectedCount: expected.length, missing, unexpected };
    } catch (e) {
      console.warn('Schema Check: column read failed for list "' + list + '"', e);
      return { list, projected, checked: true, error: true, expectedCount: expected.length, missing: [], unexpected: [] };
    }
  }));
}

// ── Admin list helpers ───────────────────────────────────────────────
async function getUserAssignments(projectId) {
  return getItems("UserAssignments",
    projectId ? `fields/ProjectID eq ${projectId}` : "");
}

async function getAnnouncementMessage() {
  const row = await _getAppSettingsRow();
  return row ? (row.AnnouncementMessage || '') : '';
}

async function setAnnouncementMessage(message) {
  const row = await _getAppSettingsRow();
  if (row) {
    await updateItem("AppSettings", row.id, { AnnouncementMessage: message });
  } else {
    await createItem("AppSettings", { Title: "config", AnnouncementMessage: message });
  }
}

async function getSeasonalEffect() {
  const row = await _getAppSettingsRow();
  return row ? (row.SeasonalEffect || 'none') : 'none';
}

async function setSeasonalEffect(effect) {
  const row = await _getAppSettingsRow();
  if (row) {
    await updateItem("AppSettings", row.id, { SeasonalEffect: effect });
  } else {
    await createItem("AppSettings", { Title: "config", SeasonalEffect: effect });
  }
}
