// AppSettings (announcement banner + seasonal home-screen effect) reads and
// writes. Split out of js/api-admin.js by N-238b: os-admin.js (admin.html)
// needs full read+write on both settings to build its admin form;
// index.html needs only the two getters, for the home banner and the
// seasonal-effects autoload — it must not also load api-admin.js's other
// three, admin-only functions (getColumnIndexStatus/getSchemaDiffs/
// getUserAssignments). Depends on _getAppSettingsRow/updateItem/createItem,
// all defined in api.js (loads first, see script order).

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
