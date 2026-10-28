// js/project-team.js — pure Project Team helpers: reads CONFIG, no network I/O, no DOM (N-361, PT epic N-360)
// Owns the Assignments → Project Team backfill plan (ProjectID / UserEmail / IsLeadDM), the
// UserAssignments ↔ Assignments reconciliation and the mixed-role report, and the CSV builder
// behind their downloads. Later PT tasks (N-362–N-373) add scope and write-window helpers here.
// N-365 adds the Project Team section helpers (picker, member status / sort, clash, open roles,
// field builder, Lead DM candidates) and ptComputeBenchChanges (moved from people-tracker.js).
// Graph calls live in api-admin.js / api.js, the Data Health UI in os-admin.js, the Project Team UI
// in project-page.js.
// Loaded on admin.html, reporting.html and people.html, after permissions.js and utils.js (it calls
// isOrgWideRole, resolveRoleFromAssignments, isForecastAssignment, isProjectActive, spDateIn,
// isoDate, utcDateOnly, spDateOut, isInternalStaff, isDeployablePerson and api.js's tpMatches at
// call time — never at load). api.js resyncBenchFor calls ptComputeBenchChanges at call time.

// The three columns N-361 adds to the Assignments list. The backfill may write these and nothing else.
const PT_ASSIGNMENT_COLUMNS = ['ProjectID', 'UserEmail', 'IsLeadDM'];

// Column sets shared by the on-screen report tables and their CSV downloads.
const PT_REPORTS = Object.freeze({
  uaNoAssignment: {
    title: 'Access with no assignment',
    note: 'A UserAssignments project row with no matching Assignments row (same email, same project; forecast rows do not count).',
    columns: [
      { key: 'user', label: 'User' }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role' },
      { key: 'project', label: 'Project' }, { key: 'projectId', label: 'ProjectID' },
    ],
  },
  assignmentNoAccess: {
    title: 'Assignments with no access row',
    note: 'A non-forecast Assignments row that cannot be matched to a UserAssignments project row today.',
    columns: [
      { key: 'employee', label: 'Employee' }, { key: 'customer', label: 'Customer' }, { key: 'email', label: 'Email' },
      { key: 'projectId', label: 'ProjectID' }, { key: 'reason', label: 'Reason' },
    ],
  },
  dmNoRow: {
    title: 'Delivery Managers with no assignment',
    note: 'Active projects whose Delivery Manager has no Assignments row on the project, or has no Delivery Manager set.',
    columns: [
      { key: 'project', label: 'Project' }, { key: 'projectId', label: 'ProjectID' },
      { key: 'deliveryManager', label: 'Delivery Manager' }, { key: 'reason', label: 'Reason' },
    ],
  },
  mixedRoles: {
    title: 'Users with more than one role (D-6)',
    note: 'Active UserAssignments rows carrying two or more different roles. Resolve to one role per user before N-371.',
    columns: [
      { key: 'email', label: 'Email' }, { key: 'name', label: 'Name' }, { key: 'roles', label: 'Roles' },
      { key: 'projects', label: 'Projects' }, { key: 'resolvedToday', label: 'Resolves to today' },
    ],
  },
});

// Same normalisation as _ocNorm (org-chart.js) and the `norm` inside projectOptionLabels (utils.js).
// A third copy, deliberately: moving those would touch files N-361 promises not to change.
function ptNormKey(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function _ptEmail(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

// SharePoint Yes/No can come back as true / 1 / 'Yes'.
function _ptYes(v) {
  return v === true || v === 1 || v === 'Yes';
}

function _ptHasProjectId(v) {
  return v !== null && v !== undefined && v !== '' && Number(v) > 0;
}

// N-365: normalised UserAssignments UserName -> Set of lower-cased emails (every row, active or
// not — a name maps to an email whatever the row's state). Shared by the N-361 backfill and the
// Project Team picker so the two resolve a person to an email the same way.
function ptEmailIndex(userAssignments) {
  const index = new Map();
  (userAssignments || []).forEach(u => {
    const k = ptNormKey(u && u.UserName);
    const e = _ptEmail(u && u.UserEmail);
    if (!k || !e) return;
    if (!index.has(k)) index.set(k, new Set());
    index.get(k).add(e);
  });
  return index;
}

// N-365: the one email a People EmployeeName resolves to, or '' when there is none or more than
// one (ambiguous). '' = the person shows on a team but gets no Newton access from it.
function ptResolveEmail(name, index) {
  const set = index && index.get(ptNormKey(name));
  return set && set.size === 1 ? [...set][0] : '';
}

// N-391: THE read-side bench rule for all of Newton (Org Chart bench pool, every Project Team
// helper in this file, the MCP tools). A row is bench when Sync Bench generated it, or its
// Customer is blank, BENCH_CUSTOMER or one of BENCH_CUSTOMER_ALIASES (trimmed, any case).
// Sync Bench's own write side (which rows it may delete) is ptComputeBenchChanges, which keys
// on AutoGenerated only — never route it through this.
function isBenchAssignment(a) {
  if (!a) return false;
  if (_ptYes(a.AutoGenerated)) return true;
  const c = ptNormKey(a.Customer);
  if (!c) return true;
  const pt = CONFIG.PROJECT_TEAM;
  return [pt.BENCH_CUSTOMER, ...(pt.BENCH_CUSTOMER_ALIASES || [])].some(v => ptNormKey(v) === c);
}

// N-391: people on the bench now — moved from org-chart.js (body unchanged; the per-row test
// is now isBenchAssignment). currentAssign = getCurrentAssignmentsByEmployee() output
// ({ EmployeeName: [row,...] }, forecasts already removed). Placeholders, internal staff
// (N-304) and CSDs are never bench. Bench = no current rows, or every current row is bench.
// Sorted by EmployeeName.
function buildBenchPool(people, currentAssign) {
  return people.filter(p => {
    if (p.IsPlaceholder) return false;              // a vacancy is not on the bench
    if (isInternalStaff(p)) return false;           // N-304: internal staff sit in the tree
    if (p.Level === 'CSD') return false;            // CSDs sit in the tree
    const rows = currentAssign[p.EmployeeName] || [];
    return rows.length === 0 || rows.every(a => isBenchAssignment(a));
  }).sort((a, b) => a.EmployeeName.localeCompare(b.EmployeeName));
}

function isLeadDmAssignment(a) {
  return !!a && _ptYes(a.IsLeadDM);
}

// N-372: who owns an Assignments row. 'bench' = Sync Bench output; 'project' = a Project Team row
// (has a ProjectID); 'historic' = an old-customer row with no Newton project (kept for utilisation,
// owned by no Project Team). The People Assignments tab reads this and nothing else to decide
// which Customer cells link to a Project page.
function assignmentOwner(a) {
  if (isBenchAssignment(a)) return 'bench';
  return a && _ptHasProjectId(a.ProjectID) ? 'project' : 'historic';
}

// N-372: the Project page deep link (N-364) for a ProjectID, or '' when it is not a positive
// integer. A cross-page link from people.html, so a plain href rather than a delegated action.
function ptProjectPageHref(projectId) {
  const raw = String(projectId == null ? '' : projectId).trim();
  if (!/^[0-9]+$/.test(raw) || Number(raw) < 1) return '';
  return 'reporting.html#projects?action=project&id=' + Number(raw);
}

// Backfill plan. Pure: nothing is written here, and no value already present on a row is ever
// replaced (fill blanks only), so the plan is idempotent.
//   inputs = { assignments, projects, userAssignments }   projects must include Completed ones
//   picks  = { [assignmentId]: projectId }                Chris's choices for ambiguous / unmatched rows
// Returns { rows, summary }. Each row:
//   { id, employee, customer, projectType, isForecast,
//     current: { ProjectID, UserEmail, IsLeadDM },
//     project: { state, candidates, value }, email: { state, value }, lead: { state, value }, patch }
// project.state: has | matched | picked | ambiguous | unmatched | deferred | bench
// email.state:   has | matched | unmatched | ambiguous | bench
// lead.state:    has | set | none | bench
// patch holds only the keys to write (ProjectID as Number, UserEmail lower-cased, IsLeadDM true).
function ptBuildBackfillPlan(inputs, picks) {
  const A = (inputs && inputs.assignments) || [];
  const P = (inputs && inputs.projects) || [];
  const UA = (inputs && inputs.userAssignments) || [];
  const chosen = picks || {};

  const projById = new Map(P.map(p => [String(p.id), p]));
  const projsByCustomer = new Map();
  P.forEach(p => {
    const k = ptNormKey(p.CustomerName);
    if (!k) return;
    if (!projsByCustomer.has(k)) projsByCustomer.set(k, []);
    projsByCustomer.get(k).push(p);
  });
  const emailsByName = ptEmailIndex(UA);   // N-365: shared with the Project Team picker
  const rows = A.map(a => {
    const row = {
      id: a.id,
      employee: a.EmployeeName || '',
      customer: a.Customer || '',
      projectType: a.ProjectType || '',
      isForecast: isForecastAssignment(a),
      current: { ProjectID: a.ProjectID == null ? null : a.ProjectID, UserEmail: a.UserEmail || '', IsLeadDM: isLeadDmAssignment(a) },
      project: { state: 'bench', candidates: [], value: null },
      email: { state: 'bench', value: null },
      lead: { state: 'bench', value: null },
      patch: {},
    };
    // N-391 carve-out (Chris, 27 Oct 2026): a blank-Customer row stays pickable here
    // (unmatched → pick a project), as N-361 designed; every other bench row is skipped.
    if (isBenchAssignment(a) && (ptNormKey(a.Customer) || _ptYes(a.AutoGenerated))) return row;

    // ProjectID
    let finalProjectId = null;
    if (_ptHasProjectId(a.ProjectID)) {
      row.project.state = 'has';
      finalProjectId = String(a.ProjectID);
    } else {
      const cands = projsByCustomer.get(ptNormKey(a.Customer)) || [];
      const pick = chosen[a.id];
      if (cands.length === 1) {
        row.project.state = 'matched';
        row.project.value = Number(cands[0].id);
      } else if (cands.length > 1) {
        row.project.state = 'ambiguous';
        row.project.candidates = cands.map(p => String(p.id));
        if (pick != null && pick !== '' && row.project.candidates.includes(String(pick))) {
          row.project.state = 'picked';
          row.project.value = Number(pick);
        }
      } else if (ptNormKey(a.Customer) && isNoDashboardType(a.ProjectType)) {
        row.project.state = 'deferred';
      } else {
        row.project.state = 'unmatched';
        if (pick != null && pick !== '' && projById.has(String(pick))) {
          row.project.state = 'picked';
          row.project.value = Number(pick);
        }
      }
      if (row.project.value != null) {
        row.patch.ProjectID = row.project.value;
        finalProjectId = String(row.project.value);
      }
    }

    // UserEmail
    let finalEmail = '';
    if (_ptEmail(a.UserEmail)) {
      row.email.state = 'has';
      finalEmail = _ptEmail(a.UserEmail);
    } else {
      const set = emailsByName.get(ptNormKey(a.EmployeeName));
      if (set && set.size === 1) {
        row.email.state = 'matched';
        row.email.value = [...set][0];
        row.patch.UserEmail = row.email.value;
        finalEmail = row.email.value;
      } else {
        row.email.state = set && set.size > 1 ? 'ambiguous' : 'unmatched';
      }
    }

    // IsLeadDM — only ever raised to Yes
    if (isLeadDmAssignment(a)) {
      row.lead.state = 'has';
    } else {
      const proj = finalProjectId == null ? null : projById.get(finalProjectId);
      const dm = proj ? _ptEmail(proj.DeliveryManager) : '';
      if (dm && finalEmail && dm === finalEmail) {
        row.lead.state = 'set';
        row.lead.value = true;
        row.patch.IsLeadDM = true;
      } else {
        row.lead.state = 'none';
      }
    }
    return row;
  });

  const count = (sel, state) => rows.filter(r => r[sel].state === state).length;
  const summary = {
    total: rows.length,
    bench: count('project', 'bench'),
    rowsToWrite: rows.filter(r => Object.keys(r.patch).length).length,
    writes: {
      ProjectID: rows.filter(r => 'ProjectID' in r.patch).length,
      UserEmail: rows.filter(r => 'UserEmail' in r.patch).length,
      IsLeadDM: rows.filter(r => 'IsLeadDM' in r.patch).length,
    },
    needsPick: count('project', 'ambiguous') + count('project', 'unmatched'),
    deferred: count('project', 'deferred'),
    noLogin: count('email', 'unmatched'),
    ambiguousEmail: count('email', 'ambiguous'),
  };
  return { rows, summary };
}

// Throws if a backfill patch carries anything other than the three N-361 columns.
function ptAssertBackfillPatch(patch) {
  Object.keys(patch || {}).forEach(k => {
    if (!PT_ASSIGNMENT_COLUMNS.includes(k)) throw new Error('Backfill patch may only write ' + PT_ASSIGNMENT_COLUMNS.join(', ') + ' — got ' + k);
  });
}

// Which plan rows may be written. A row with an empty patch is dropped; a row whose patch carries
// anything beyond the three N-361 columns is refused (reported, never sent). api-admin.js sends
// the writes one at a time and carries on past a failure.
function ptPlanWrites(rows) {
  const out = { writes: [], refused: [] };
  (rows || []).forEach(r => {
    if (!r.patch || !Object.keys(r.patch).length) return;
    try {
      ptAssertBackfillPatch(r.patch);
      out.writes.push({ id: r.id, employee: r.employee, patch: r.patch });
    } catch (e) {
      out.refused.push({ id: r.id, employee: r.employee, message: e.message });
    }
  });
  return out;
}

// Reconciliation + mixed-role report (read-only). "Assignments row" means a non-bench,
// non-forecast row; an "access row" is an active, non-org-wide UserAssignments row with a project.
function ptBuildReconciliation(inputs) {
  const A = (inputs && inputs.assignments) || [];
  const P = (inputs && inputs.projects) || [];
  const UA = (inputs && inputs.userAssignments) || [];

  const projName = id => {
    const p = P.find(x => String(x.id) === String(id));
    return p ? (p.CustomerName || '') : '';
  };
  const pair = (email, projectId) => _ptEmail(email) + '|' + String(projectId);
  const roleLabel = r => CONFIG.ROLE_LABELS[r] || r || '';

  const live = A.filter(a => !isBenchAssignment(a) && !isForecastAssignment(a));
  const assignedPairs = new Set(live.filter(a => _ptEmail(a.UserEmail) && _ptHasProjectId(a.ProjectID))
    .map(a => pair(a.UserEmail, a.ProjectID)));
  const accessRows = UA.filter(u => u.Active !== false && !isOrgWideRole(u.AssignedRole) && _ptHasProjectId(u.ProjectID));
  const accessPairs = new Set(accessRows.map(u => pair(u.UserEmail, u.ProjectID)));

  const uaNoAssignment = accessRows
    .filter(u => !assignedPairs.has(pair(u.UserEmail, u.ProjectID)))
    .map(u => ({
      user: u.UserName || '', email: _ptEmail(u.UserEmail), role: roleLabel(u.AssignedRole),
      project: projName(u.ProjectID) || u.CustomerName || '', projectId: String(u.ProjectID),
    }));

  const assignmentNoAccess = [];
  live.forEach(a => {
    const reasons = [];
    const hasEmail = !!_ptEmail(a.UserEmail);
    const hasProject = _ptHasProjectId(a.ProjectID);
    if (!hasEmail) reasons.push('No UserEmail');
    if (!hasProject) reasons.push('No ProjectID');
    if (hasEmail && hasProject && !accessPairs.has(pair(a.UserEmail, a.ProjectID))) reasons.push('No access row today');
    if (!reasons.length) return;
    assignmentNoAccess.push({
      employee: a.EmployeeName || '', customer: a.Customer || '', email: _ptEmail(a.UserEmail),
      projectId: hasProject ? String(a.ProjectID) : '', reason: reasons.join('; '),
    });
  });

  const dmNoRow = [];
  P.filter(isProjectActive).forEach(p => {
    const dm = _ptEmail(p.DeliveryManager);
    if (!dm) {
      dmNoRow.push({ project: p.CustomerName || '', projectId: String(p.id), deliveryManager: '', reason: 'No Delivery Manager set' });
    } else if (!assignedPairs.has(pair(dm, p.id))) {
      dmNoRow.push({ project: p.CustomerName || '', projectId: String(p.id), deliveryManager: dm, reason: 'Delivery Manager has no Assignments row on this project' });
    }
  });

  const byEmail = new Map();
  UA.filter(u => u.Active !== false && _ptEmail(u.UserEmail)).forEach(u => {
    const e = _ptEmail(u.UserEmail);
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e).push(u);
  });
  const rank = r => { const i = CONFIG.ROLE_PRECEDENCE.indexOf(r); return i < 0 ? CONFIG.ROLE_PRECEDENCE.length : i; };
  const mixedRoles = [];
  byEmail.forEach((rows, email) => {
    const roles = [...new Set(rows.map(r => r.AssignedRole))].sort((x, y) => rank(x) - rank(y));
    if (roles.length < 2) return;
    const projects = roles.map(role => {
      const names = [...new Set(rows.filter(r => r.AssignedRole === role && _ptHasProjectId(r.ProjectID))
        .map(r => projName(r.ProjectID) || r.CustomerName || String(r.ProjectID)))];
      return names.length ? roleLabel(role) + ': ' + names.join(', ') : '';
    }).filter(Boolean).join('; ');
    mixedRoles.push({
      email, name: (rows.find(r => r.UserName) || {}).UserName || '',
      roles: roles.map(roleLabel).join(', '), projects,
      resolvedToday: roleLabel(resolveRoleFromAssignments(rows, false)),
      _tpAndDm: roles.includes(CONFIG.ROLE_IDS.TALENT_PARTNER) && roles.includes(CONFIG.ROLE_IDS.DELIVERY_MANAGER),
    });
  });
  mixedRoles.sort((a, b) => (b._tpAndDm - a._tpAndDm) || a.email.localeCompare(b.email));

  return { uaNoAssignment, assignmentNoAccess, dmNoRow, mixedRoles };
}

// CSV text (no BOM — the download adds it). Every cell is quoted; a cell that starts with
// = + - @ or a control character gets a leading ' so Excel cannot read it as a formula.
function ptToCsv(columns, rows) {
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const lines = [columns.map(c => cell(c.label)).join(',')];
  (rows || []).forEach(r => lines.push(columns.map(c => cell(r[c.key])).join(',')));
  return lines.join('\r\n');
}

// ── LCI / Transformation customers -> Projects rows (N-363 / PT-3) ─────
// The only Projects fields the migration may write.
const PT_PROJECT_COLUMNS = ['Title', 'Status', 'ProjectType', 'StartDate', 'EndDate', 'CSDName', 'Notes'];

// 'YYYY-MM-DD' of a SharePoint date string, '' when there is none. String compare only: no Date,
// so no UTC/BST shift.
function _ptDay(v) {
  const m = String(v == null ? '' : v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

// Migration plan. Pure: nothing is written here. Only ever CREATES: a customer that already
// matches a Projects row (any status) is listed as 'exists' and never changed, so a re-run is empty.
//   inputs = { assignments, projects, owners, today }  projects must include Completed ones;
//            owners = LCIProjectOwners rows; today = 'YYYY-MM-DD' (injectable, default local day)
//   picks  = { [ptNormKey(customer)]: type }           Chris's choice where a customer has both types
// Candidates: non-bench rows typed LCI / Transformation (isNoDashboardType) with a Customer, grouped by
// ptNormKey(Customer). Forecast rows count, but only a non-forecast row that is open-ended or ends
// today or later makes the project Active.
// Row: { key, label, types, type, typeState ('agreed'|'mixed'|'picked'), state ('create'|'exists'|
//   'type-pick'), assignmentCount, forecastOnly, owner, status, patch }
function ptBuildLciProjectPlan(inputs, picks) {
  const A = (inputs && inputs.assignments) || [];
  const P = (inputs && inputs.projects) || [];
  const O = (inputs && inputs.owners) || [];
  const today = _ptDay(inputs && inputs.today) || localDayISO();
  const pk = picks || {};
  const existing = new Set(P.map(p => ptNormKey(p.CustomerName)));
  const ownerByKey = {};
  O.forEach(o => {
    const k = ptNormKey(o.CustomerName);
    const csd = String(o.CSDName == null ? '' : o.CSDName).trim();
    if (k && csd && !ownerByKey[k]) ownerByKey[k] = csd;
  });

  const groups = new Map();
  A.forEach(a => {
    if (isBenchAssignment(a) || !isNoDashboardType(a.ProjectType)) return;
    const key = ptNormKey(a.Customer);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  });

  const rows = [];
  Array.from(groups.keys()).sort().forEach(key => {
    const list = groups.get(key);
    const counts = {};
    list.forEach(a => { const s = String(a.Customer).trim(); counts[s] = (counts[s] || 0) + 1; });
    const label = Object.keys(counts).sort((x, y) => counts[y] - counts[x] || (x < y ? -1 : x > y ? 1 : 0))[0];
    const types = Array.from(new Set(list.map(a => a.ProjectType))).sort();
    let type = types[0];
    let typeState = 'agreed';
    if (types.length > 1) {
      const choice = pk[key];
      if (isNoDashboardType(choice) && types.includes(choice)) { type = choice; typeState = 'picked'; }
      else { type = ''; typeState = 'mixed'; }
    }
    const live = list.filter(a => !isForecastAssignment(a));
    const active = live.some(a => { const e = _ptDay(a.EndDate); return !e || e >= today; });
    const starts = list.map(a => _ptDay(a.StartDate)).filter(Boolean).sort();
    const ends = list.map(a => _ptDay(a.EndDate)).filter(Boolean).sort();
    const owner = ownerByKey[key] || '';
    const exists = existing.has(key);
    const state = exists ? 'exists' : (typeState === 'mixed' ? 'type-pick' : 'create');
    const patch = {};
    if (state === 'create') {
      patch.Title = label;
      patch.Status = active ? 'Active' : 'Completed';
      patch.ProjectType = type;
      if (starts.length) patch.StartDate = isoDate(starts[0]);
      if (!active && ends.length) patch.EndDate = isoDate(ends[ends.length - 1]);
      if (owner) patch.CSDName = owner;
      patch.Notes = CONFIG.PROJECT_TEAM.LCI_MIGRATION_NOTE;
    }
    rows.push({
      key, label, types, type, typeState, state,
      assignmentCount: list.length, forecastOnly: live.length === 0,
      owner, status: active ? 'Active' : 'Completed', patch,
    });
  });

  const count = s => rows.filter(r => r.state === s).length;
  const created = rows.filter(r => r.state === 'create');
  return {
    rows,
    summary: {
      customers: rows.length,
      toCreate: created.length,
      exists: count('exists'),
      needsPick: count('type-pick'),
      active: created.filter(r => r.status === 'Active').length,
      completed: created.filter(r => r.status === 'Completed').length,
      withOwner: created.filter(r => r.owner).length,
      forecastOnly: created.filter(r => r.forecastOnly).length,
    },
  };
}

// Throws if a migration patch carries anything beyond the Projects columns above.
function ptAssertProjectPatch(patch) {
  Object.keys(patch || {}).forEach(k => {
    if (!PT_PROJECT_COLUMNS.includes(k)) throw new Error('Project migration may only write ' + PT_PROJECT_COLUMNS.join(', ') + ' - got ' + k);
  });
}

// Which plan rows may be created: state 'create' only; a patch with a foreign key is refused
// (reported, never sent). api-admin.js sends the writes one at a time.
function ptPlanProjectWrites(rows) {
  const out = { writes: [], refused: [] };
  (rows || []).forEach(r => {
    if (r.state !== 'create') return;
    try {
      ptAssertProjectPatch(r.patch);
      out.writes.push({ label: r.label, patch: r.patch });
    } catch (e) {
      out.refused.push({ label: r.label, message: e.message });
    }
  });
  return out;
}

// ── N-365 (PT-5): Project Team section ───────────────────────────────
// Dates are compared as 'YYYY-MM-DD' strings (spDateIn), never Date maths.

const PT_MEMBER_STATUS_LABELS = Object.freeze({
  current: 'Current', upcoming: 'Upcoming', forecast: 'Forecast', ended: 'Ended',
});

// Who the Project Team picker offers: active, non-placeholder People. Deployable staff on every
// project; internal staff only on the Internal-type project (N-333 — Internal TA keep visibility
// when N-367 switches access to Assignments). Input order kept (getPeople sorts).
function ptTeamPickerPeople(people, project) {
  const internalOk = isInternalProject(project);
  return (people || []).filter(p => p && p.IsActive !== false && !p.IsPlaceholder &&
    (isInternalStaff(p) ? internalOk : true));
}

// current | upcoming | forecast | ended. A forecast is always 'forecast'; start = today and
// end = today are both current.
function ptMemberStatus(a, todayISO) {
  if (isForecastAssignment(a || {})) return 'forecast';
  const s = spDateIn(a && a.StartDate) || '';
  const e = spDateIn(a && a.EndDate) || '';
  if (s && s > todayISO) return 'upcoming';
  if (e && e < todayISO) return 'ended';
  return 'current';
}

// Team display order: current, upcoming and forecast rows by StartDate (then name), then ended
// rows by EndDate, latest first. Bench rows are dropped. Returns a new array.
function ptSortTeam(rows, todayISO) {
  const day = v => spDateIn(v) || '';
  const name = r => String(r.EmployeeName || '');
  return (rows || []).filter(r => r && !isBenchAssignment(r)).slice().sort((a, b) => {
    const ea = ptMemberStatus(a, todayISO) === 'ended';
    const eb = ptMemberStatus(b, todayISO) === 'ended';
    if (ea !== eb) return ea ? 1 : -1;
    if (ea) return day(b.EndDate).localeCompare(day(a.EndDate)) || name(a).localeCompare(name(b));
    return day(a.StartDate).localeCompare(day(b.StartDate)) || name(a).localeCompare(name(b));
  });
}

// The confirmed assignment `cand` would overlap, or null. Moved from people-forms.js (N-365 S-7;
// N-372 deleted that form, so the Project Team save is the only caller):
// forecasts may overlap freely, and split-fee lines are exempt (N-116 QA1 — one TP routinely runs
// several concurrent Exec Search / MG AI engagements). Bench rows, forecasts, rows with a missing
// date, another person's rows and the row being edited (excludeId) never clash. Inclusive dates.
function ptFindClash(rows, cand, excludeId) {
  if (!cand || isForecastAssignment(cand) || CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(cand.ProjectType)) return null;
  const s = spDateIn(cand.StartDate), e = spDateIn(cand.EndDate);
  if (!s || !e) return null;
  return (rows || []).find(a =>
    a && String(a.id) !== String(excludeId) &&
    (!cand.EmployeeName || a.EmployeeName === cand.EmployeeName) &&
    !isBenchAssignment(a) &&                       // N-391: the one bench rule
    !isForecastAssignment(a) &&
    a.StartDate && a.EndDate &&
    spDateIn(a.StartDate) <= e && spDateIn(a.EndDate) >= s
  ) || null;
}

// Open-pipeline roles (isOpenPipelineStage) whose Talent Partner includes `email` — the roles to
// warn about before ending / removing that person (design rule 5). [] when the email is blank.
function ptOpenRolesFor(roles, email) {
  const e = _ptEmail(email);
  if (!e) return [];
  return (roles || []).filter(r => r && isOpenPipelineStage(r.Stage) && tpMatches(r.TalentPartner, e));
}

// The Assignments fields a Project Team save writes, or { ok:false, error }.
//   input = { startDate, endDate ('YYYY-MM-DD'), country, billed ('Yes'|'No'), monthlyRate,
//             retainer, placement (strings / numbers / ''), isForecast (bool) }
//   ctx   = { project, person (People row or null), email (resolved, may be ''), isCreate }
// Customer / ProjectType / ProjectID are copied from the project on every save. A row is either
// monthly-rate or split-fee, never both, and an unbilled row carries neither (N-116 / N-327).
// Internal staff are always Billed No with no rates. Person fields only on create.
function ptBuildMemberFields(input, ctx) {
  const i = input || {};
  const c = ctx || {};
  const project = c.project || {};
  const person = c.person || null;
  if (c.isCreate && !person) return { ok: false, error: 'Choose a person.' };
  const start = spDateIn(i.startDate), end = spDateIn(i.endDate);
  if (!start || !end) return { ok: false, error: 'Start and End dates are required.' };
  if (end < start) return { ok: false, error: 'End Date must be on or after Start Date.' };
  const country = String(i.country == null ? '' : i.country).trim();
  if (!country) return { ok: false, error: 'Country is required.' };
  const num = v => (v === '' || v == null || isNaN(parseFloat(v))) ? null : parseFloat(v);
  const internal = !!person && isInternalStaff(person);
  const billed = internal ? 'No' : (i.billed === 'No' ? 'No' : 'Yes');
  const split = CONFIG.SPLIT_FEE_PROJECT_TYPES.includes(project.ProjectType);
  const paid = billed === 'Yes';
  const fields = {
    ProjectID:       Number(project.id),
    Customer:        project.CustomerName || '',
    ProjectType:     project.ProjectType || '',
    StartDate:       isoDate(start),
    EndDate:         isoDate(end),
    MonthlyBillRate: !split && paid ? num(i.monthlyRate) : null,
    RetainerFee:     split && paid ? num(i.retainer) : null,
    PlacementFee:    split && paid ? num(i.placement) : null,
    Billed:          billed,
    Country:         country,
    IsForecast:      i.isForecast === true,
  };
  if ([fields.MonthlyBillRate, fields.RetainerFee, fields.PlacementFee].some(v => v !== null && v < 0)) {
    return { ok: false, error: "Rates and fees can't be negative." };
  }
  if (c.isCreate) {
    fields.EmployeeName = person.EmployeeName;
    fields.Level        = internal ? '' : (person.Level || '');
    fields.UserEmail    = _ptEmail(c.email);
    fields.IsLeadDM     = false;
  }
  return { ok: true, fields };
}

// Assignments Title for a new row: '<prefix>-NNN', one past the number of rows that exist
// (+ offset when several are created in one go). The rule People used to apply, now shared by the
// Project Team save and Sync Bench ('A' = assignment, 'B' = bench).
function ptNextAssignmentId(rows, prefix, offset = 0) {
  const n = (Array.isArray(rows) ? rows.length : 0) + 1 + (Number(offset) || 0);
  return prefix + '-' + String(n).padStart(3, '0');
}

// lower-cased email -> resolved role, from all UserAssignments rows (resolveRoleFromAssignments,
// no leadership — a leadership user never runs a project, D-3).
function ptRoleByEmail(userAssignments) {
  const byEmail = new Map();
  (userAssignments || []).forEach(u => {
    const e = _ptEmail(u && u.UserEmail);
    if (!e) return;
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e).push(u);
  });
  const out = new Map();
  byEmail.forEach((rows, e) => out.set(e, resolveRoleFromAssignments(rows, false)));
  return out;
}

// Ids (strings) of the team rows that may be the project's Lead DM (D-5): non-bench,
// non-forecast, with a UserEmail whose role is delivery_manager.
function ptLeadDmCandidates(rows, roleByEmail) {
  const roleOf = e => (roleByEmail instanceof Map ? roleByEmail.get(e) : (roleByEmail || {})[e]);
  return (rows || [])
    .filter(r => r && !isBenchAssignment(r) && !isForecastAssignment(r) &&
      _ptEmail(r.UserEmail) && roleOf(_ptEmail(r.UserEmail)) === CONFIG.ROLE_IDS.DELIVERY_MANAGER)
    .map(r => String(r.id));
}

// ── Bench gap computation (moved from people-tracker.js by N-365) ──────
// Pure: given already-fetched People/Assignments arrays (and an injectable
// `today` for deterministic testing), returns the bench records to
// create/delete. No DOM, no API calls. Two callers: _syncBenchAssignments
// (people-tracker.js, the Sync Bench button — every person) and resyncBenchFor
// (api.js, after a Project Team save — one person). Body unchanged from
// _sbaComputeChanges; only the name moved.
//
// N-090: this whole function is UTC by construction. Every Date below is
// UTC midnight (utcDateOnly / Date.UTC), every mutation uses a UTC setter,
// and every write goes out through spDateOut(). Do NOT reintroduce
// setHours() or a local getter: mixing the two conventions is what wrote
// bench StartDates a day early during BST, and made the stored value never
// match on re-read — so every affected record was deleted and recreated on
// every sync run.
function ptComputeBenchChanges(people, assignments, today = new Date()) {
  const thisYear = today.getUTCFullYear();
  const yearEnd  = new Date(Date.UTC(thisYear, 11, 31));

  // Only sync active employees at billable levels — never internal staff (N-304)
  const billable = activeDeployablePeople(people);   // N-399

  // Existing auto-generated bench records (so we can diff)
  const existingBench = assignments.filter(a => a.AutoGenerated === true || a.AutoGenerated === 1 || a.AutoGenerated === 'Yes');  
  const toCreate = [];
  const toDelete = [];

  // Clean up bench records for inactive employees and internal staff (N-304 —
  // e.g. someone switched Deployable → Internal) — they're excluded from the
  // main loop but their stale bench records still need removing
  const excludedBench = existingBench.filter(b =>
    people.some(p => p.EmployeeName === b.EmployeeName && (p.IsActive === false || isInternalStaff(p)))
  );
  excludedBench.forEach(b => { if (!toDelete.includes(b.id)) toDelete.push(b.id); });

  for (const person of billable) {
    // Employment end: use person's EndDate if set, else Dec 31.
    // utcDateOnly() replaces the old local _parseDate helper — it returns a
    // UTC-midnight Date for the encoded calendar day and is documented for
    // exactly this case (never `new Date(str)` + setHours).
    const yearStart = new Date(Date.UTC(thisYear, 0, 1));

    const empEndRaw = utcDateOnly(person.EndDate);
    const empEnd = empEndRaw && empEndRaw < yearEnd ? empEndRaw : new Date(yearEnd);

    const empStartRaw = utcDateOnly(person.StartDate);
    const empStart = empStartRaw && empStartRaw > yearStart
      ? empStartRaw
      : new Date(yearStart);

    if (empStart > empEnd) continue;

    // Get all non-bench, non-forecast assignments for this person this year,
    // sorted by start. N-329: a forecast is not cover. Forecast rows are
    // excluded from utilisation, so the bench row under one must stay (or be
    // recreated), or those person-days vanish from the denominator.
    const customerAssignments = assignments
      .filter(a =>
        a.EmployeeName === person.EmployeeName &&
        a.AutoGenerated !== true &&
        !isForecastAssignment(a) &&
        a.StartDate && a.EndDate
      )
      .map(a => ({
        s: utcDateOnly(a.StartDate),
        e: utcDateOnly(a.EndDate),
      }))
      .filter(a => a.s <= empEnd && a.e >= empStart)
      .sort((a, b) => a.s - b.s);

    // Calculate gaps
    const gaps = [];
    let cursor = new Date(empStart);

    for (const ca of customerAssignments) {
      const assignStart = new Date(Math.max(ca.s, empStart));
      if (cursor < assignStart) {
        gaps.push({ from: new Date(cursor), to: new Date(assignStart - 86400000) });
      }
      const after = new Date(ca.e);
      after.setUTCDate(after.getUTCDate() + 1);
      if (after > cursor) cursor = after;
    }
    // Gap after last assignment to empEnd
    if (cursor <= empEnd) {
      gaps.push({ from: new Date(cursor), to: new Date(empEnd) });
    }

    // Use all gaps for the full year — past and future
    // This ensures historical bench records are preserved/regenerated correctly
    const clampedGaps = gaps;

    // Existing bench records for this person
    const personBench = existingBench.filter(
      a => a.EmployeeName === person.EmployeeName
    );
    
    // Determine which existing bench records are still valid
    for (const bench of personBench) {
      const bs = utcDateOnly(bench.StartDate);
      const be = utcDateOnly(bench.EndDate);
      const stillNeeded = clampedGaps.some(
        g => g.from.getTime() === bs.getTime() && g.to.getTime() === be.getTime()
      );
      if (!stillNeeded) toDelete.push(bench.id);
    }

    // Determine which gaps don't yet have a bench record
    for (const gap of clampedGaps) {
      const alreadyExists = personBench.some(b => {
        const bs = utcDateOnly(b.StartDate);
        const be = utcDateOnly(b.EndDate);
        return bs.getTime() === gap.from.getTime() && be.getTime() === gap.to.getTime();
      });
      if (!alreadyExists) {
        toCreate.push({
          EmployeeName:  person.EmployeeName,
          Level:         person.Level,
          Customer:      'Unassigned',
          ProjectType:   'Internal',
          StartDate:     spDateOut(gap.from),
          EndDate:       spDateOut(gap.to),
          Billed:        'No',
          Country:       person.Location || '',
          AutoGenerated: true,
        });
      }
    }
  }

  return { toCreate, toDelete };
}