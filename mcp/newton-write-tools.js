// mcp/newton-write-tools.js - Newton for Claude: write tools (N-548, AMCP-4; specs/N-545.md AMCP-A4 / A5 / A8 / A9,
// specs/N-548.md).
//
// log_weekly_activity: create a week for a role, or correct the counts on an existing one. Served from GitHub
// Pages and loaded into the MCP server's vm context after mcp/newton-guides.js (CONFIG.MCP.scripts order); it
// pushes its entry onto MCP_TOOLS. No Newton page loads it. tests/run.js loads it too (declarations + MCP_TOOLS only).
//
// Every write tool is preview + commit (AMCP-A4): preview(args, ctx) reads and gates exactly as the commit will and
// writes NOTHING; server-core stores the plan and returns a confirm token; commit(plan, ctx) runs on the STORED plan
// only, inside the armed write shim, one commit at a time. Rules (tests/lint-mcp.js lintMcpWriteTools): the
// lintMcpTools rules (no Graph path, no direct transport, no DOM, no spread), and a write-shaped call only inside a
// top-level function named by `commit:` and only for a MCP_APPROVED_WRITERS function (saveWeeklyRow, fireNotification).
//
// The weekly rules are NOT written here: week, row key, field build, counts and the hires trigger are the shared
// functions in js/weekly-activity-logic.js (the same ones the form, the bulk grid and mobile quick-log call); the
// create / update sequence is saveWeeklyRow (js/api-weekly.js), which ends in createWeeklyActivity (N-315 heal).
// Scope and write gates are Newton's own: mcpScope() (newton-tools.js), checkRoleWrite (N-369), getTalentPartnersForProject.
//
// update_role_stage (N-549, AMCP-5; specs/N-549.md): move roles forward or back through the linear stages
// (Backlog ... Offered). The gate -> headcount rule -> write sequence is applyRoleStageChange (js/api-headcount.js),
// the same code the Roles page runs; the RoleHistory row is awaited and tagged Source = claude (AMCP-C5).

// Entry keys Claude may send: the role, who and when, and the nine counts.
var MCP_WEEKLY_ENTRY_KEYS = ['role', 'project', 'week', 'talentPartner'].concat(WEEKLY_COUNT_FIELDS.map(function (f) { return f.key; }));
var MCP_WEEKLY_SOURCE = 'claude';   // WeeklyActivity.Source on every row Claude writes (AMCP-A7)

function mcpWeeklyProps() {
  var props = {
    role: { type: 'string', description: 'The role: its id (from list_roles) or its title. A title is matched among the roles you can write, narrowed by project if given.' },
    project: { type: 'string', description: 'Optional project name or id, to narrow a role title.' },
    week: { type: 'string', description: 'The week: a date (any day of that week), "this week" or "last week". Default: the call-level week, else this week.' },
    talentPartner: { type: 'string', description: 'Whose activity this is (name or email). Delivery Managers and Admins only; default is the role\'s Talent Partner. Talent Partners log as themselves.' },
  };
  WEEKLY_COUNT_FIELDS.forEach(function (f) {
    props[f.key] = { type: 'integer', minimum: 0, description: f.name + ' count for the week. Leave out to leave it unchanged (an edit) or 0 (a new week).' };
  });
  return props;
}

// ── Preview helpers ───────────────────────────────────────────────────

// A user-facing refusal naming the entry it came from.
function mcpWeeklyRefuse(i, message) {
  return mcpRefuse('Entry ' + (i + 1) + ': ' + message);
}

// Runs a resolver that throws plain or MCP_REFUSED errors and re-throws them naming the entry.
function mcpWeeklyEntryError(i, e) {
  if (e && e.code === 'MCP_STALE') return e;
  return mcpWeeklyRefuse(i, e && e.message ? e.message : String(e));
}

function mcpWeeklyEntries(args) {
  var list = args.entries;
  var max = CONFIG.MCP.maxWeeklyEntries;
  if (!Array.isArray(list) || !list.length) throw mcpRefuse('Give at least one entry to log.');
  if (list.length > max) throw mcpRefuse('Log at most ' + max + ' role-weeks in one go.');
  list.forEach(function (e, i) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw mcpWeeklyRefuse(i, 'each entry must be an object.');
    Object.keys(e).forEach(function (k) {
      if (MCP_WEEKLY_ENTRY_KEYS.indexOf(k) === -1) throw mcpWeeklyRefuse(i, 'unknown field "' + k + '".');
    });
    if (e.role === undefined || e.role === null || String(e.role).trim() === '') throw mcpWeeklyRefuse(i, 'say which role.');
  });
  return list;
}

function mcpWeeklyRoleLabel(role) {
  return (role.RoleTitle || 'Role') + (role.Location ? ' (' + role.Location + ')' : '');
}

function mcpWeeklyRoleProject(role) {
  return String(role.ProjectIDLookupId || role.ProjectID || '');
}

// The role an entry means (AMCP-B4): id, or title inside the caller's scope (narrowed by project).
// Out of scope and missing answer the same for a scoped caller.
function mcpWeeklyResolveRole(entry, scope, roles, projects) {
  var pool = scope.scoped ? mcpScopeRoles(scope, roles) : roles;
  if (entry.project !== undefined && entry.project !== null && String(entry.project).trim() !== '') {
    var p = mcpResolveProject(entry.project, projects, scope);
    pool = pool.filter(function (r) { return mcpWeeklyRoleProject(r) === String(p.id); });
  }
  var q = String(entry.role).trim();
  var hit = null;
  if (/^\d+$/.test(q)) hit = pool.find(function (r) { return String(r.id) === q; }) || null;
  if (hit) return hit;
  var n = mcpNorm(q);
  var exact = pool.filter(function (r) { return mcpNorm(r.RoleTitle) === n; });
  var cands = exact.length ? exact : pool.filter(function (r) { return mcpNorm(r.RoleTitle).indexOf(n) !== -1; });
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) {
    var shown = cands.slice(0, 8).map(function (r) { return mcpWeeklyRoleLabel(r) + ' - id ' + r.id; }).join('; ');
    throw new Error('"' + q + '" matched ' + cands.length + ' roles: ' + shown + (cands.length > 8 ? ' and more' : '') + '. Say which one (id).');
  }
  if (scope.scoped) throw mcpRefuse(MCP_UNAVAILABLE);
  throw new Error('No role matched "' + q + '". list_roles gives role ids.');
}

// Which Talent Partner the row is for (AMCP-A8). A TP logs only as themselves; Admin / DM may log for a TP on
// the project. Returns the TP email.
async function mcpWeeklyResolveTp(entry, scope, role, tpMap) {
  var given = entry.talentPartner === undefined || entry.talentPartner === null ? '' : String(entry.talentPartner).trim();
  if (scope.tpEmail) {
    if (!tpMatches(role.TalentPartner, scope.email)) throw mcpRefuse(MCP_UNAVAILABLE);
    var me = mcpNorm(scope.email);
    var myName = mcpNorm(tpMap[me] || '');
    if (given && mcpNorm(given) !== me && (!myName || mcpNorm(given) !== myName)) throw mcpRefuse('You can log activity only as yourself.');
    return me;
  }
  var picker = await getTalentPartnersForProject(mcpWeeklyRoleProject(role));
  var rows = picker.map(function (u) { return { email: mcpNorm(u.UserEmail), name: u.UserName || u.UserEmail }; });
  if (given) {
    var g = mcpNorm(given);
    var byEmail = rows.filter(function (r) { return r.email === g; });
    var byName = rows.filter(function (r) { return mcpNorm(r.name) === g; });
    var part = rows.filter(function (r) { return mcpNorm(r.name).indexOf(g) !== -1; });
    var found = byEmail.length === 1 ? byEmail : (byName.length === 1 ? byName : (part.length === 1 ? part : []));
    if (found.length === 1) return found[0].email;
    if (tpMatches(role.TalentPartner, g)) return g;
    var names = rows.map(function (r) { return r.name; }).sort().join(', ') || 'none';
    throw mcpRefuse('"' + given + '" is not a Talent Partner on this project. Choose from: ' + names + '.');
  }
  var dflt = resolveRowTalentPartner(role.TalentPartner, scope.email);
  if (dflt) return dflt;
  var opts = rows.map(function (r) { return r.name; }).sort().join(', ') || 'none on the project team';
  throw mcpRefuse('That role has no Talent Partner set. Say whose activity it is (' + opts + ').');
}

// The stored counts of a row, an object of numbers keyed by read name; null for no row.
function mcpWeeklyCountsOf(row) {
  if (!row) return null;
  var out = {};
  WEEKLY_COUNT_FIELDS.forEach(function (f) { out[f.key] = Number(row[f.key]) || 0; });
  return out;
}

// The role's rows with this entry applied (a replaced row or an added one), for the funnel warning.
function mcpWeeklyRowsAfter(rows, role, existing, tpEmail, sunday, finalCounts) {
  var out = rows.filter(function (r) { return !existing.row || String(r.id) !== String(existing.row.id); });
  var next = { id: existing.row ? existing.row.id : 'new', RoleIDLookupId: role.id, TalentPartner: tpEmail, WeekEndingDate: sunday };
  WEEKLY_COUNT_FIELDS.forEach(function (f) { next[f.key] = finalCounts[f.key]; });
  out.push(next);
  return out;
}

function mcpWeeklyFunnelWarning(role, rowsAfter) {
  var bad = findImpossibleFunnels([role], rowsAfter);
  if (!bad.length) return null;
  var lines = bad[0].breaches.slice(0, 3).map(function (b) { return b.later + ' ' + b.laterTotal + ' is more than ' + b.earlier + ' ' + b.earlierTotal; });
  return mcpWeeklyRoleLabel(role) + ': this leaves the funnel impossible over the role\'s weeks (' + lines.join('; ') + '). Check the counts.';
}

// Everything one entry needs: resolved role, person and week; create or edit; the counts to write and the
// preview lines. Reads only. -> { dropped: message } or { plan, changes, warnings }.
async function mcpWeeklyPlanEntry(entry, i, args, scope, deps, today) {
  var role = mcpWeeklyResolveRole(entry, scope, deps.roles, deps.projects);
  var project = deps.projects.find(function (p) { return String(p.id) === mcpWeeklyRoleProject(role); });
  if (!project) throw mcpRefuse(MCP_UNAVAILABLE);
  var label = mcpWeeklyRoleLabel(role);
  if (CONFIG.ROLE_STAGES_ACTIVITY_EXCLUDED.indexOf(role.Stage) !== -1) {
    throw mcpRefuse(label + ' is ' + role.Stage + '. Newton takes no weekly activity for it.');
  }
  var gate = await checkRoleWrite(role.id);
  if (!gate.ok) throw mcpRefuse(gate.reason);
  var tpEmail = await mcpWeeklyResolveTp(entry, scope, role, deps.tpMap);
  var sunday = weeklyResolveWeek(entry.week !== undefined ? entry.week : args.week, today);
  var future = weeklyWeekRefusal(sunday, today);
  if (future) throw mcpRefuse(future);
  var raw = {};
  WEEKLY_COUNT_FIELDS.forEach(function (f) { raw[f.key] = entry[f.key]; });
  var clean = weeklyCleanCounts(raw);
  if (!clean.ok) throw mcpRefuse(clean.errors.join(' '));
  if (!Object.keys(clean.counts).length) throw mcpRefuse('Say at least one count for ' + label + '.');
  var rows = await getWeeklyActivity(null, role.id);
  var existing = weeklyFindExisting(rows, role.id, tpEmail, sunday);
  if (existing.kind === 'many') throw mcpRefuse('More than one row exists for ' + label + ', that person and that week. Fix it in Newton first.');
  var isCreate = existing.kind === 'none';
  if (isCreate && !isProjectActive(project)) throw mcpRefuse(project.CustomerName + ' is completed. Newton takes new weekly activity only for active projects.');
  var before = mcpWeeklyCountsOf(existing.row);
  var finalCounts = {};
  var set = {};
  var changes = [];
  var where = label + ' | ' + mcpPersonName(tpEmail, deps.tpMap) + ' | w/e ' + formatLongDay(sunday) + ' | ';
  WEEKLY_COUNT_FIELDS.forEach(function (f) {
    var given = clean.counts[f.key];
    var stored = before ? before[f.key] : 0;
    finalCounts[f.key] = given === undefined ? stored : given;
    if (isCreate) {
      set[f.key] = finalCounts[f.key];
      changes.push({ field: where + f.name, from: '-', to: finalCounts[f.key] });
    } else if (given !== undefined && given !== stored) {
      set[f.key] = given;
      changes.push({ field: where + f.name, from: stored, to: given });
    }
  });
  if (!isCreate && !changes.length) return { dropped: 'Nothing to change for ' + label + ', w/e ' + formatLongDay(sunday) + ': those counts are already saved.' };
  var warnings = [];
  var funnel = mcpWeeklyFunnelWarning(role, mcpWeeklyRowsAfter(rows, role, existing, tpEmail, sunday, finalCounts));
  if (funnel) warnings.push(funnel);
  var plan = {
    mode: isCreate ? 'create' : 'edit',
    roleId: Number(role.id), projectId: Number(project.id), roleLabel: label, projectName: project.CustomerName || '',
    tpEmail: tpEmail, tpName: mcpPersonName(tpEmail, deps.tpMap), sunday: sunday,
    existingId: existing.row ? String(existing.row.id) : null,
    before: before, set: set, finalHires: finalCounts.Hires,
  };
  return { plan: plan, changes: changes, warnings: warnings };
}

// ── The tool ──────────────────────────────────────────────────────────

async function mcpLogWeeklyPreview(args, ctx) {
  var scope = await mcpScope();
  var entries = mcpWeeklyEntries(args);
  var today = localDayISO();
  var degraded = [];
  var deps = {};
  var reads = await Promise.all([getProjects(false), getAllRoles(), mcpSoft(getTalentPartnerDisplayMap(), {}, 'staff names', degraded)]);
  deps.projects = reads[0];
  deps.roles = reads[1];
  deps.tpMap = reads[2];
  var plans = [];
  var changes = [];
  var warnings = [];
  var seen = {};
  for (var i = 0; i < entries.length; i++) {
    var one;
    try {
      one = await mcpWeeklyPlanEntry(entries[i], i, args, scope, deps, today);
    } catch (e) {
      throw mcpWeeklyEntryError(i, e);
    }
    if (one.dropped) { warnings.push(one.dropped); continue; }
    var key = weeklyRowKey(one.plan.roleId, one.plan.tpEmail) + '|' + one.plan.sunday;
    if (seen[key]) throw mcpWeeklyRefuse(i, 'that role, person and week is already in this call.');
    seen[key] = true;
    plans.push(one.plan);
    one.changes.forEach(function (c) { changes.push(c); });
    one.warnings.forEach(function (w) { warnings.push(w); });
    if (Number(one.plan.finalHires) > 0 && weeklyHiresTrigger({ isCreate: one.plan.mode === 'create', before: one.plan.before ? one.plan.before.Hires : 0, after: one.plan.finalHires })) {
      warnings.push(one.plan.roleLabel + ': Newton will add a reminder to record the placement. Claude cannot record placements.');
    }
  }
  if (!plans.length) throw mcpRefuse('Nothing to change: every entry matches what is already saved.');
  if (degraded.length) warnings.push('Names are shown as emails (staff names could not be read).');
  var creates = plans.filter(function (p) { return p.mode === 'create'; }).length;
  return {
    summary: 'Log weekly activity for ' + plans.length + ' role-week' + (plans.length === 1 ? '' : 's') + ': ' + creates + ' new, ' + (plans.length - creates) + ' edited.',
    changes: changes,
    warnings: warnings,
    plan: { entries: plans },
  };
}

// Throws MCP_STALE (server-core: "this changed in Newton since the preview").
function mcpWeeklyStale() {
  var e = new Error('stale');
  e.code = 'MCP_STALE';
  return e;
}

// Preflight for one planned entry, run for EVERY entry before the first write: fresh scope, role still
// writable, person rule, and the stored row still exactly as previewed.
async function mcpWeeklyPreflight(e, scope, roles) {
  var role = roles.find(function (r) { return String(r.id) === String(e.roleId); });
  if (!role || (scope.scoped && !mcpInScope(scope, mcpWeeklyRoleProject(role)))) throw mcpRefuse(MCP_UNAVAILABLE);
  if (CONFIG.ROLE_STAGES_ACTIVITY_EXCLUDED.indexOf(role.Stage) !== -1) throw mcpRefuse(e.roleLabel + ' is now ' + role.Stage + '. Newton takes no weekly activity for it.');
  if (scope.tpEmail && (e.tpEmail !== scope.tpEmail || !tpMatches(role.TalentPartner, scope.email))) throw mcpRefuse('You can log activity only as yourself.');
  var gate = await checkRoleWrite(e.roleId);
  if (!gate.ok) throw mcpRefuse(gate.reason);
  var rows = await getWeeklyActivity(null, e.roleId);
  var now = weeklyFindExisting(rows, e.roleId, e.tpEmail, e.sunday);
  if (e.mode === 'create') {
    if (now.kind !== 'none') throw mcpWeeklyStale();
    return;
  }
  if (now.kind !== 'one' || String(now.row.id) !== String(e.existingId)) throw mcpWeeklyStale();
  var stored = mcpWeeklyCountsOf(now.row);
  WEEKLY_COUNT_FIELDS.forEach(function (f) {
    if (stored[f.key] !== e.before[f.key]) throw mcpWeeklyStale();
  });
}

function mcpWeeklyHireLink(e) {
  return 'reporting.html#placements?action=addPlacement&roleId=' + e.roleId + '&projectId=' + e.projectId;
}

function mcpWeeklyHireBody(e) {
  var n = Number(e.finalHires);
  return 'You logged ' + n + ' hire' + (n === 1 ? '' : 's') + ' for ' + e.roleLabel + ' via Claude - record the placement.';
}

// Runs on the stored plan only. All entries are checked before any is written; the writes are
// sequential, and a failure stops the rest and says what was and was not saved.
async function mcpLogWeeklyCommit(plan, ctx) {
  var scope = await mcpScope();
  _cacheInvalidate('WeeklyActivity');
  _cacheInvalidate('Roles');
  var roles = await getAllRoles();
  for (var i = 0; i < plan.entries.length; i++) {
    await mcpWeeklyPreflight(plan.entries[i], scope, roles);
  }
  var saved = [];
  var notSaved = [];
  var reminders = [];
  var failed = false;
  for (var j = 0; j < plan.entries.length; j++) {
    var e = plan.entries[j];
    if (failed) { notSaved.push({ role: e.roleLabel, week: e.sunday, reason: 'Not attempted: an earlier entry failed.' }); continue; }
    var now = new Date().toISOString();
    var fields = e.mode === 'create'
      ? weeklyFields({ projectId: e.projectId, roleId: e.roleId, tpEmail: e.tpEmail, weekEnding: e.sunday, counts: e.set, now: now })
      : weeklyEditFields(e.set, now);
    fields.Source = MCP_WEEKLY_SOURCE;
    try {
      var res = await saveWeeklyRow({ existingId: e.mode === 'edit' ? e.existingId : null, fields: fields });
      saved.push({ role: e.roleLabel, project: e.projectName, talentPartner: e.tpName, week: e.sunday, action: e.mode === 'create' ? 'created' : 'edited', hires: e.finalHires });
      if (weeklyHiresTrigger({ isCreate: res.created, before: e.before ? e.before.Hires : 0, after: e.finalHires })) {
        try {
          await fireNotification({
            triggerType: 'mcpHire', triggerKey: 'mcpHire|' + (res.id || (e.roleId + ':' + e.sunday)) + '|' + e.finalHires, tone: 'celebrate',
            deepLink: mcpWeeklyHireLink(e), body: mcpWeeklyHireBody(e), recipients: [ctx.email],
          });
        } catch (err) {
          console.warn('[newton-mcp] hire reminder failed - the row is saved:', err && err.message ? err.message : err);
        }
        reminders.push(e.roleLabel);
      }
    } catch (err2) {
      failed = true;
      notSaved.push({ role: e.roleLabel, week: e.sunday, reason: 'Not saved: ' + (err2 && err2.message ? err2.message : String(err2)) });
    }
  }
  return {
    saved: saved,
    notSaved: notSaved,
    placementReminder: reminders.length
      ? 'Newton has added a reminder to record the placement for ' + reminders.join(', ') + '. Claude cannot record placements: do that in Newton.'
      : null,
  };
}

// ── update_role_stage (N-549, AMCP-5) ─────────────────────────────────

var MCP_STAGE_MOVE_KEYS = ['role', 'project', 'stage'];
var MCP_STAGE_SOURCE = 'claude';   // RoleHistory.Source on every Stage row Claude writes (AMCP-A7)
var MCP_STAGE_ELSEWHERE = 'Do that in Newton on the role page.';   // close, cancel, hold, reopen: out of scope (AMCP-D4)

function mcpStageRefuse(i, message) {
  return mcpRefuse('Move ' + (i + 1) + ': ' + message);
}

// Re-throws a resolver's plain or MCP_REFUSED error naming the move it came from.
function mcpStageEntryError(i, e) {
  if (e && e.code === 'MCP_STALE') return e;
  return mcpStageRefuse(i, e && e.message ? e.message : String(e));
}

function mcpStageMoves(args) {
  var list = args.moves;
  var max = CONFIG.MCP.maxStageMoves;
  if (!Array.isArray(list) || !list.length) throw mcpRefuse('Give at least one role to move.');
  if (list.length > max) throw mcpRefuse('Move at most ' + max + ' roles in one go.');
  list.forEach(function (m, i) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw mcpStageRefuse(i, 'each move must be an object.');
    Object.keys(m).forEach(function (k) {
      if (MCP_STAGE_MOVE_KEYS.indexOf(k) === -1) throw mcpStageRefuse(i, 'unknown field "' + k + '".');
    });
    if (m.role === undefined || m.role === null || String(m.role).trim() === '') throw mcpStageRefuse(i, 'say which role.');
    if (m.stage === undefined || m.stage === null || String(m.stage).trim() === '') throw mcpStageRefuse(i, 'say which stage.');
  });
  return list;
}

// The stage a move means (AMCP-C2 / C3): next / previous along the linear set from `from`, or a stage name
// (any case) from the linear set. Close, Cancel and On-hold are named but refused.
function mcpStageTarget(from, raw, linear) {
  var q = String(raw).trim();
  var n = mcpNorm(q);
  if (n === 'next' || n === 'previous') {
    var at = linear.indexOf(from);
    var step = n === 'next' ? 1 : -1;
    var to = linear[at + step];
    if (!to) throw mcpRefuse(from + ' is the ' + (step > 0 ? 'last' : 'first') + ' stage Claude can set. ' + (step > 0 ? MCP_STAGE_ELSEWHERE : 'There is nothing before it.'));
    return to;
  }
  var hit = linear.filter(function (s) { return mcpNorm(s) === n; });
  if (hit.length) return hit[0];
  var other = CONFIG.ROLE_STAGES.filter(function (s) { return mcpNorm(s) === n; });
  if (other.length) throw mcpRefuse('Claude cannot move a role to ' + other[0] + '. ' + MCP_STAGE_ELSEWHERE);
  throw mcpRefuse('"' + q + '" is not a stage. Choose from: ' + linear.join(', ') + ' (or next / previous).');
}

// Everything one move needs: the resolved role, from and to stages, Newton's own gate and rule. Reads only.
// -> { dropped: message } or { plan, change, warnings }.
async function mcpStagePlanMove(move, i, scope, deps, linear) {
  var role = mcpWeeklyResolveRole(move, scope, deps.roles, deps.projects);
  var project = deps.projects.find(function (p) { return String(p.id) === mcpWeeklyRoleProject(role); });
  if (!project) throw mcpRefuse(MCP_UNAVAILABLE);
  var label = mcpWeeklyRoleLabel(role);
  var from = normaliseRoleStage(role.Stage);
  if (linear.indexOf(from) === -1) throw mcpRefuse(label + ' is ' + from + '. ' + MCP_STAGE_ELSEWHERE);
  var to = mcpStageTarget(from, move.stage, linear);
  if (to === from) return { dropped: label + ' is already at ' + from + '.' };
  var check = await checkRoleStageMove(role.id, to);   // Newton's write gate (N-369) then headcount rule (N-307): its own refusal text
  if (!check.ok) throw mcpRefuse(label + ': ' + check.reason);
  var warnings = [];
  if (linear.indexOf(to) < linear.indexOf(from)) warnings.push(label + ': moving back from ' + from + ' to ' + to + '.');
  return {
    plan: { roleId: Number(role.id), projectId: Number(project.id), roleLabel: label, projectName: project.CustomerName || '', from: from, to: to },
    change: { field: label + ' | ' + (project.CustomerName || 'Project') + ' | Stage', from: from, to: to },
    warnings: warnings,
  };
}

async function mcpStagePreview(args, ctx) {
  var scope = await mcpScope();
  var moves = mcpStageMoves(args);
  var linear = linearRoleStages();
  var reads = await Promise.all([getProjects(false), getAllRoles()]);
  var deps = { projects: reads[0], roles: reads[1] };
  var plans = [];
  var changes = [];
  var warnings = [];
  var seen = {};
  for (var i = 0; i < moves.length; i++) {
    var one;
    try {
      one = await mcpStagePlanMove(moves[i], i, scope, deps, linear);
    } catch (e) {
      throw mcpStageEntryError(i, e);
    }
    if (one.dropped) { warnings.push(one.dropped); continue; }
    if (seen[one.plan.roleId]) throw mcpStageRefuse(i, one.plan.roleLabel + ' is already in this call.');
    seen[one.plan.roleId] = true;
    plans.push(one.plan);
    changes.push(one.change);
    one.warnings.forEach(function (w) { warnings.push(w); });
  }
  if (!plans.length) throw mcpRefuse('Nothing to change: every role is already at that stage.');
  warnings.push('A stage move resets the role\'s days in stage and can change its flags.');
  return {
    summary: 'Move ' + plans.length + ' role' + (plans.length === 1 ? '' : 's') + ' to a new stage.',
    changes: changes,
    warnings: warnings,
    plan: { moves: plans },
  };
}

// Preflight for one planned move, run for EVERY move before the first write: fresh scope, the role still
// there and still at the previewed stage, and Newton's gate and rule still passing.
async function mcpStagePreflight(m, scope, roles) {
  var role = roles.find(function (r) { return String(r.id) === String(m.roleId); });
  if (!role || (scope.scoped && !mcpInScope(scope, mcpWeeklyRoleProject(role)))) throw mcpRefuse(MCP_UNAVAILABLE);
  if (normaliseRoleStage(role.Stage) !== m.from) throw mcpWeeklyStale();
  var check = await checkRoleStageMove(m.roleId, m.to);
  if (!check.ok) throw mcpRefuse(m.roleLabel + ': ' + check.reason);
}

// Runs on the stored plan only. Every move is checked before any is written; the writes are sequential. A failed
// write, or a history entry that did not save (AMCP-C5), stops the rest and the result says what was and was not
// saved. applyRoleStageChange awaits the RoleHistory write: the write shim closes when this commit settles.
async function mcpStageCommit(plan, ctx) {
  var scope = await mcpScope();
  _cacheInvalidate('Roles');
  _cacheInvalidate('RoleHeadcount');   // the headcount rule must see a fill or cancel made since the preview (as getPlacementTarget, N-308)
  _cacheInvalidate('Placements');
  var roles = await getAllRoles();
  for (var i = 0; i < plan.moves.length; i++) {
    await mcpStagePreflight(plan.moves[i], scope, roles);
  }
  var saved = [];
  var notSaved = [];
  var historyFailed = false;
  var stopped = null;
  for (var j = 0; j < plan.moves.length; j++) {
    var m = plan.moves[j];
    if (stopped) { notSaved.push({ role: m.roleLabel, reason: 'Not attempted: ' + stopped }); continue; }
    try {
      var res = await applyRoleStageChange(m.roleId, m.to, { source: MCP_STAGE_SOURCE, awaitHistory: true });
      if (!res.ok) {
        stopped = 'an earlier move failed.';
        notSaved.push({ role: m.roleLabel, reason: 'Not saved: ' + res.reason });
        continue;
      }
      saved.push({ role: m.roleLabel, project: m.projectName, from: m.from, to: m.to, historyOk: res.historyOk === true });
      if (res.historyOk !== true) {
        historyFailed = true;
        stopped = 'the history entry for an earlier move did not save.';
      }
    } catch (err) {
      stopped = 'an earlier move failed.';
      notSaved.push({ role: m.roleLabel, reason: 'Not saved: ' + (err && err.message ? err.message : String(err)) });
    }
  }
  return {
    saved: saved,
    notSaved: notSaved,
    historyWarning: historyFailed
      ? 'The stage moved in Newton, but its history entry did not save, so the move will not show on the role\'s timeline. Tell the user, and ask them to check the role\'s history in Newton.'
      : null,
  };
}

MCP_TOOLS.push(
  {
    name: 'log_weekly_activity',
    description: 'Log or correct weekly activity (the nine funnel counts) for roles you can write: a new week, or change counts on an existing one. Up to ' + CONFIG.MCP.maxWeeklyEntries + ' role-weeks per call.',
    inputSchema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          minItems: 1,
          maxItems: CONFIG.MCP.maxWeeklyEntries,
          description: 'The role-weeks to log or change.',
          items: { type: 'object', properties: mcpWeeklyProps(), required: ['role'], additionalProperties: false },
        },
        week: { type: 'string', description: 'The week for every entry that gives none: a date, "this week" (default) or "last week".' },
      },
      required: ['entries'],
      additionalProperties: false,
    },
    roles: ['admin', 'delivery_manager', 'talent_partner'],   // AMCP-A2: Leadership is read-only
    write: true,
    preview: mcpLogWeeklyPreview,
    commit: mcpLogWeeklyCommit,
  },
);

MCP_TOOLS.push(
  {
    name: 'update_role_stage',
    description: 'Move roles you can write forward or back through the pipeline stages (' + linearRoleStages().join(', ') + '): a stage name, or "next" / "previous". Up to ' + CONFIG.MCP.maxStageMoves + ' roles per call. Closing, cancelling and putting a role on hold are done in Newton.',
    inputSchema: {
      type: 'object',
      properties: {
        moves: {
          type: 'array',
          minItems: 1,
          maxItems: CONFIG.MCP.maxStageMoves,
          description: 'The roles to move.',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', description: 'The role: its id (from list_roles) or its title. A title is matched among the roles you can write, narrowed by project if given.' },
              project: { type: 'string', description: 'Optional project name or id, to narrow a role title.' },
              stage: { type: 'string', description: 'The stage to move the role to: a stage name, "next" or "previous" (one step from its current stage).' },
            },
            required: ['role', 'stage'],
            additionalProperties: false,
          },
        },
      },
      required: ['moves'],
      additionalProperties: false,
    },
    roles: ['admin', 'delivery_manager', 'talent_partner'],   // AMCP-A2: Leadership is read-only
    write: true,
    preview: mcpStagePreview,
    commit: mcpStageCommit,
  },
);
