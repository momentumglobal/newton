// js/api-onboarding.js — SharePoint reads and writes for My Onboarding (N-496 / ONB-1, epic N-482).
// Graph calls only; the rules are pure in onboarding-logic.js and the constants in CONFIG.ONBOARDING
// (onboarding-config.js). Loaded on reporting.html straight after onboarding-logic.js; N-497 adds
// people.html, N-499 my-momentum.html. Not in CONFIG.MCP.scripts.
//
//   AppSettings      OnboardingMode / OnboardingPilot on the single 'config' row (the switch, ONB-D11).
//   OnboardingPlans  one row per person's plan (ONB-D18). Never tier-2 cached. Newton Users read,
//                    Newton Admins edit (deviation from Tier 4, like SLATargets). N-497 is the first writer.
//   UserAssignments  read only, to tell whether anyone holds people_ops (ONB-D17).
// Ticks are ChecklistProgress rows (Title 'person'), read and written through api-checklists.js.

// -> { mode, pilot: [emails] }. A missing row, missing columns or a failed read is Off, [] (fail closed).
async function readOnboardingSwitch() {
  const row = await _getAppSettingsRow();
  const S = CONFIG.ONBOARDING.SETTINGS;
  return {
    mode: onbNormaliseMode(row ? row[S.MODE] : null),
    pilot: pdpParsePilot(row ? row[S.PILOT] : ''),
  };
}

// Admin only (onbSwitch), under Ghost Mode the ghosted user's role. Writes only the fields passed;
// creates the 'config' row when it is missing (same shape as writePdpSwitch).
async function writeOnboardingSwitch({ mode, pilot } = {}) {
  await _ensureGhostGate();
  const role = await getEffectiveRole(getCurrentUser()?.email || '');
  if (!roleCan(role, 'onbSwitch')) throw new Error('Only an Admin can change the onboarding switch.');
  const O = CONFIG.ONBOARDING;
  const fields = {};
  if (mode !== undefined) {
    const m = String(mode).trim();
    if (!O.MODES.includes(m)) throw new Error('Onboarding mode must be one of ' + O.MODES.join(' / ') + '.');
    fields[O.SETTINGS.MODE] = m;
  }
  if (pilot !== undefined) {
    const list = Array.isArray(pilot) ? pilot : pdpParsePilot(pilot);
    const bad = list.find(e => !pdpIsEmail(String(e).trim()));
    if (bad !== undefined) throw new Error('Not a valid pilot email address: ' + bad);
    fields[O.SETTINGS.PILOT] = pdpParsePilot(list.join(O.EMAIL_SEP)).join(O.EMAIL_SEP);
  }
  if (!Object.keys(fields).length) return;
  const row = await _getAppSettingsRow();
  if (row) await updateItem('AppSettings', row.id, fields);
  else     await createItem('AppSettings', { Title: 'config', ...fields });
}

// OnboardingPlans rows; for one person when personId is given (indexed PersonID, server-side).
async function getOnboardingPlans({ personId = null } = {}) {
  const list = CONFIG.ONBOARDING.PLAN_LIST;
  if (personId === null || personId === undefined || personId === '') return getItems(list);
  const n = Number(personId);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid People id: ${personId}`);
  return getItems(list, `fields/PersonID eq ${n}`);
}

// True when any active UserAssignments row holds people_ops (ONB-D17). One read, 30 s cache.
async function hasActivePeopleOps() {
  const rows = await getItems('UserAssignments');
  return rows.some(u => u.Active !== false && u.AssignedRole === CONFIG.ROLE_IDS.PEOPLE_OPS);
}

// The gate for the signed-in user (Ghost-aware): { mode, state, reason, peopleOpsActive }. Any read
// failure is 'none' for everyone but an Admin, who gets 'preview' with the error.
async function resolveOnboardingGate() {
  await _ensureGhostGate();
  const realEmail = getCurrentUser()?.email || '';
  const email = pdpEffectiveEmail(realEmail, getGhostUser());
  const role = await getEffectiveRole(realEmail);
  try {
    const [sw, people, plans, peopleOpsActive] = await Promise.all([
      readOnboardingSwitch(), getPeople(false), getOnboardingPlans(), hasActivePeopleOps(),
    ]);
    const gate = onbAccess({ mode: sw.mode, pilot: sw.pilot, people, plans, email, role, peopleOpsActive });
    return { mode: sw.mode, state: gate.state, reason: gate.reason, peopleOpsActive };
  } catch (e) {
    console.warn('Onboarding gate: read failed', e);
    const isAdmin = role === CONFIG.ROLE_IDS.ADMIN;
    return { mode: CONFIG.ONBOARDING.MODES[0], state: isAdmin ? 'preview' : 'none', reason: 'read-failed', error: e && e.message ? e.message : String(e), peopleOpsActive: false };
  }
}
