// tests/lint-role-copy-fields.js — N-150 sync guard.
//
// _ROLE_COPY_FIELDS (api.js) is a hand-written whitelist of the fields
// Duplicate-role carries onto the new role. N-082 is the cautionary
// precedent this exists to avoid: LCI model copy's field whitelist went
// stale silently and dropped data. This is a pure function over SOURCE TEXT
// (forms.js is not loaded into the Node test rig — see run.js — because
// it's DOM-driven), following the same approach as lint-dates.js: locate
// submitRoleForm's `const fields = {` block in forms.js's source, extract
// its keys, map each through _resolveRoleDisplayField (api.js — the same
// internal→display mapping RoleHistory diffing already relies on) to the
// display name _ROLE_COPY_FIELDS uses, and compare the result against
// _ROLE_COPY_FIELDS ∪ _ROLE_RESET_FIELDS.
//
// Scoped to forms.js only, and to submitRoleForm's `fields` object
// specifically — not a general-purpose object-literal parser.

// Returns the internal SharePoint field names submitRoleForm writes, in
// source order — or throws if the block can't be found (a shape change big
// enough to break this deserves a loud failure, not a silently empty list).
function _extractSubmitRoleFormFields(formsSource) {
  const lines = String(formsSource).split('\n');
  const fnIdx = lines.findIndex(l => /async function submitRoleForm/.test(l));
  if (fnIdx === -1) {
    throw new Error('submitRoleForm not found in forms.js — has it moved or been renamed?');
  }
  const fieldsIdx = lines.findIndex((l, i) => i > fnIdx && /const\s+fields\s*=\s*\{/.test(l));
  if (fieldsIdx === -1) {
    throw new Error("submitRoleForm's `const fields = {` block not found — has its shape changed?");
  }
  const keys = [];
  let i = fieldsIdx + 1;
  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '};' || trimmed === '}') break;
    const m = lines[i].match(/^\s*(\w+)\s*:/);
    if (m) keys.push(m[1]);
  }
  if (i === lines.length) {
    throw new Error("submitRoleForm's `fields` object never closed — could not find the end of the block.");
  }
  return keys;
}

// sources: { 'forms.js': '<source text>', ... } (tests/run.js's ALL_SOURCES)
// copyFields: _ROLE_COPY_FIELDS (api.js) — display names Duplicate carries
// resetFields: _ROLE_RESET_FIELDS (api.js) — display names deliberately reset
// Returns:
//   missingFromCopyFields — fields submitRoleForm writes that neither list accounts for
//   extraInCopyFields     — fields in the two lists that submitRoleForm no longer writes
// Both empty when in sync.
function checkRoleFormFieldSync(sources, copyFields, resetFields) {
  const formsSource = sources && sources['forms.js'];
  if (!formsSource) {
    throw new Error('forms.js not found in sources');
  }
  const internalKeys = _extractSubmitRoleFormFields(formsSource);
  const displayKeys = internalKeys.map(k => _resolveRoleDisplayField(k));

  const expected = new Set([...(copyFields || []), ...(resetFields || [])]);
  const actual = new Set(displayKeys);

  const missingFromCopyFields = [...actual].filter(f => !expected.has(f)).sort();
  const extraInCopyFields = [...expected].filter(f => !actual.has(f)).sort();

  return { missingFromCopyFields, extraInCopyFields };
}
