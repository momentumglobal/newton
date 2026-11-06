// js/pdp-identity.js — PDP identity helpers (N-433 / PDP-1). Pure: reads CONFIG and the shared
// People helpers only — no network I/O, no DOM. Loaded after project-team.js (it reuses
// ptNormKey / ptEmailIndex / ptResolveEmail / isBenchAssignment) and utils.js.
//
// Answers "who is this person to Newton": the signed-in user's People row (matched on
// People.WorkEmail), their line manager (People.ReportsTo = the manager's WorkEmail), their CSD
// (the first Level = CSD up the ReportsTo chain, PDP-D6), their direct reports and their CSD
// tree. Also the Data Health planners that fill WorkEmail and line managers, and the read-only
// integrity checks. Nothing here is stored anywhere; callers re-resolve from the lists.

function _pdpEmail(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
function _pdpYes(v)   { return v === true || v === 1 || v === 'Yes' || v === '1' || v === 'true'; }
function _pdpName(p)  { return (p && p.EmployeeName) || ''; }
function _pdpByName(a, b) { return _pdpName(a).localeCompare(_pdpName(b)); }

function pdpIsEmail(s) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s == null ? '' : s));
}

// Ghost Mode: the effective identity is the ghosted user's (admin only; the caller passes the
// value getGhostUser() returned, which fails closed to null for a non-admin).
function pdpEffectiveEmail(realEmail, ghostEmail) {
  return _pdpEmail(ghostEmail) || _pdpEmail(realEmail);
}

// PDP-D9: deployable TPs, STPs, PTPs and SDMs who have started. CSDs are reviewers, not in scope.
function pdpInScope(person, today) {
  if (!person || person.IsPlaceholder || !_pdpYes(person.IsActive)) return false;
  if (!isDeployablePerson(person)) return false;
  if (!CONFIG.PDP.SCOPE_LEVELS.includes(person.Level)) return false;
  return isStartedPerson(person, today || new Date());
}

// email -> [People rows], real people only (placeholders are vacancies), inactive rows included
// so a leaver still resolves as someone's manager.
function pdpEmailIndex(people) {
  const index = new Map();
  (people || []).forEach(p => {
    if (!p || p.IsPlaceholder) return;
    const e = _pdpEmail(p.WorkEmail);
    if (!e) return;
    if (!index.has(e)) index.set(e, []);
    index.get(e).push(p);
  });
  return index;
}

function _pdpUnique(index, email) {
  const rows = index.get(_pdpEmail(email));
  return rows && rows.length === 1 ? rows[0] : null;
}

// Walk ReportsTo upward from `me` to the first CSD. Returns { csd, flag } where flag is
// '' (found), 'noCsd' (chain ended / too long / not in People) or 'chainCycle'.
function _pdpWalkToCsd(index, me) {
  const seen = new Set([String(me.id)]);
  let cur = me;
  for (let i = 0; i < CONFIG.PDP.MAX_CHAIN; i++) {
    const rt = _pdpEmail(cur.ReportsTo);
    if (!rt) return { csd: null, flag: 'noCsd' };
    const next = _pdpUnique(index, rt);
    if (!next) return { csd: null, flag: 'noCsd' };
    if (seen.has(String(next.id))) return { csd: null, flag: 'chainCycle' };
    seen.add(String(next.id));
    if (next.Level === CONFIG.PDP.REVIEWER_LEVEL) return { csd: next, flag: '' };
    cur = next;
  }
  return { csd: null, flag: 'noCsd' };
}

// { me, lineManager, csd, directReports, csdTree, flags } for the person whose WorkEmail is
// `email`. A user with no People row (Admin / Leadership / People Ops) gets me: null.
function pdpResolveIdentity(people, email) {
  const em = _pdpEmail(email);
  const flags = {};
  const out = { me: null, lineManager: null, csd: null, directReports: [], csdTree: [], flags };
  const index = pdpEmailIndex(people);
  const rows = em ? (index.get(em) || []) : [];
  if (!rows.length) { flags.noRow = true; return out; }
  if (rows.length > 1) { flags.ambiguous = true; return out; }
  const me = rows[0];
  out.me = me;

  const rt = _pdpEmail(me.ReportsTo);
  if (!rt) {
    flags.noLineManager = true;
  } else {
    const lmRows = index.get(rt) || [];
    if (lmRows.length === 1) out.lineManager = lmRows[0];
    else if (lmRows.length > 1) flags.lineManagerAmbiguous = true;
    else flags.lineManagerNotInPeople = true;   // a leader, normal for a CSD
  }

  if (me.Level === CONFIG.PDP.REVIEWER_LEVEL) {
    flags.isCsd = true;
  } else {
    const walk = _pdpWalkToCsd(index, me);
    out.csd = walk.csd;
    if (walk.flag) flags[walk.flag] = true;
  }

  const active = (people || []).filter(p => p && !p.IsPlaceholder && _pdpYes(p.IsActive));
  out.directReports = active.filter(p => String(p.id) !== String(me.id) && _pdpEmail(p.ReportsTo) === em).sort(_pdpByName);

  // Every active descendant via ReportsTo, breadth first, visited guard against loops.
  const byManager = new Map();
  active.forEach(p => {
    const k = _pdpEmail(p.ReportsTo);
    if (!k) return;
    if (!byManager.has(k)) byManager.set(k, []);
    byManager.get(k).push(p);
  });
  const visited = new Set([String(me.id)]);
  let frontier = [me];
  let depth = 1;
  const tree = [];
  while (frontier.length) {
    const next = [];
    frontier.forEach(m => {
      (byManager.get(_pdpEmail(m.WorkEmail)) || []).forEach(p => {
        if (visited.has(String(p.id))) return;
        visited.add(String(p.id));
        tree.push({ person: p, depth });
        next.push(p);
      });
    });
    frontier = next;
    depth++;
  }
  out.csdTree = tree.sort((a, b) => (a.depth - b.depth) || _pdpByName(a.person, b.person));
  return out;
}

// Would setting personId's ReportsTo to newEmail create a loop (or a self-report)?
function pdpWouldCycle(people, personId, newEmail) {
  const e = _pdpEmail(newEmail);
  if (!e) return false;
  const index = pdpEmailIndex(people);
  let cur = _pdpUnique(index, e);
  const seen = new Set();
  while (cur && !seen.has(String(cur.id))) {
    if (String(cur.id) === String(personId)) return true;
    seen.add(String(cur.id));
    cur = _pdpUnique(index, cur.ReportsTo);
  }
  return false;
}

// Active people who can be someone's line manager (picker options): CONFIG.PDP.MANAGER_LEVELS,
// a WorkEmail, level order then name. selfId is left out.
function pdpEligibleManagers(people, selfId) {
  return (people || [])
    .filter(p => p && !p.IsPlaceholder && _pdpYes(p.IsActive) && _pdpEmail(p.WorkEmail) &&
      CONFIG.PDP.MANAGER_LEVELS.includes(p.Level) && String(p.id) !== String(selfId))
    .sort((a, b) =>
      (CONFIG.PDP.MANAGER_LEVELS.indexOf(a.Level) - CONFIG.PDP.MANAGER_LEVELS.indexOf(b.Level)) || _pdpByName(a, b))
    .map(p => ({ id: String(p.id), name: _pdpName(p), level: p.Level, email: _pdpEmail(p.WorkEmail) }));
}

// ── WorkEmail backfill plan ────────────────────────────────────────────
//   inputs = { people, userAssignments, leadership }
//   picks  = { [personId]: email | '-' }   '-' = skip this row
// Fill blanks only; an email is never given to two rows. Returns { rows, pool, summary }.
// row.state: matched | picked | skipped | ambiguous | unmatched | conflict
function pdpBuildWorkEmailPlan(inputs, picks) {
  const people = (inputs && inputs.people) || [];
  const UA = (inputs && inputs.userAssignments) || [];
  const leaders = (inputs && inputs.leadership) || [];
  const chosen = picks || {};
  const held = new Set();
  people.forEach(p => { if (p && !p.IsPlaceholder && _pdpEmail(p.WorkEmail)) held.add(_pdpEmail(p.WorkEmail)); });

  const pool = new Map();   // email -> label
  UA.concat(leaders).forEach(u => {
    const e = _pdpEmail(u && u.UserEmail);
    if (!e || held.has(e) || pool.has(e)) return;
    pool.set(e, (u.UserName || '') ? u.UserName + ' <' + e + '>' : e);
  });

  const index = ptEmailIndex(UA);
  const targets = people
    .filter(p => p && !p.IsPlaceholder && _pdpYes(p.IsActive) && !_pdpEmail(p.WorkEmail))
    .sort(_pdpByName);
  const claimed = new Set();
  const rows = targets.map(p => {
    const set = index.get(ptNormKey(p.EmployeeName));
    const row = {
      id: String(p.id), employee: _pdpName(p), level: p.Level || '',
      state: 'unmatched', candidates: set ? [...set] : [], value: '', patch: null,
    };
    if (set && set.size > 1) row.state = 'ambiguous';
    else if (set && set.size === 1) {
      const e = [...set][0];
      if (held.has(e) || claimed.has(e)) row.state = 'conflict';
      else { row.state = 'matched'; row.value = e; claimed.add(e); }
    }
    return row;
  });
  // Picks apply after every auto-match has claimed its email.
  rows.forEach(row => {
    const pick = chosen[row.id];
    if (pick == null || pick === '') return;
    if (pick === '-') { row.state = 'skipped'; row.value = ''; return; }
    if (row.state === 'matched') return;                // auto-matches are not overridden
    const e = _pdpEmail(pick);
    if (!pdpIsEmail(e) || held.has(e) || claimed.has(e)) return;   // rejected: row keeps its state
    row.state = 'picked'; row.value = e; claimed.add(e);
  });
  rows.forEach(r => { if (r.value) r.patch = { WorkEmail: r.value }; });
  const count = s => rows.filter(r => r.state === s).length;
  return {
    rows, pool,
    summary: {
      total: rows.length,
      toWrite: rows.filter(r => r.patch).length,
      matched: count('matched'), picked: count('picked'), skipped: count('skipped'),
      needsPick: rows.filter(r => ['ambiguous', 'unmatched', 'conflict'].includes(r.state)).length,
    },
  };
}

// ── Line manager suggestion plan ───────────────────────────────────────
//   inputs = { people, assignments, projects, today? }
//   picks  = { [personId]: managerPersonId | '-' }
// For each in-scope person with a blank ReportsTo: candidates come from their current
// (non-forecast, non-bench, window open) project assignments. TP / STP -> the project's Lead DM,
// else the project CSD; SDM / PTP -> the project CSD. One distinct candidate with a WorkEmail is
// pre-selected; several must be chosen; none is "no suggestion". Fill blanks only; never a loop.
// row.state: suggested | picked | skipped | choose | blocked | none
function pdpBuildLineManagerPlan(inputs, picks) {
  const people = (inputs && inputs.people) || [];
  const assignments = (inputs && inputs.assignments) || [];
  const projects = (inputs && inputs.projects) || [];
  const today = (inputs && inputs.today) || new Date();
  const todayISO = localDayISO(today);
  const chosen = picks || {};
  const real = people.filter(p => p && !p.IsPlaceholder);
  const index = pdpEmailIndex(real);
  const byName = new Map();
  real.filter(p => _pdpYes(p.IsActive)).forEach(p => {
    const k = ptNormKey(p.EmployeeName);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(p);
  });
  const uniqueByName = n => { const r = byName.get(ptNormKey(n)); return r && r.length === 1 ? r[0] : null; };
  const personOf = a => {
    const viaEmail = a.UserEmail ? _pdpUnique(index, a.UserEmail) : null;
    return viaEmail || uniqueByName(a.EmployeeName);
  };
  const projectById = new Map(projects.map(p => [String(p.id), p]));
  const open = a => {
    const s = spDateIn(a.StartDate), e = spDateIn(a.EndDate);
    return (!s || s <= todayISO) && (!e || e >= todayISO);
  };
  const live = assignments.filter(a => a && !isBenchAssignment(a) && !isForecastAssignment(a) && open(a) &&
    a.ProjectID != null && String(a.ProjectID).trim() !== '');
  const byProject = new Map();
  live.forEach(a => {
    const k = String(a.ProjectID);
    if (!byProject.has(k)) byProject.set(k, []);
    byProject.get(k).push(a);
  });
  const eligible = new Map(pdpEligibleManagers(real).map(m => [m.id, m]));

  const targets = real.filter(p => pdpInScope(p, today) && !_pdpEmail(p.ReportsTo)).sort(_pdpByName);
  const working = real.map(p => Object.assign({}, p));      // plan-so-far, for loop checks
  const workingById = new Map(working.map(p => [String(p.id), p]));

  const rows = targets.map(p => {
    const cands = new Map();   // personId -> { personId, name, email, hasEmail, sources[] }
    const add = (person, source) => {
      if (!person || String(person.id) === String(p.id) || !_pdpYes(person.IsActive) || !CONFIG.PDP.MANAGER_LEVELS.includes(person.Level)) return;
      const k = String(person.id);
      if (!cands.has(k)) cands.set(k, { personId: k, name: _pdpName(person), email: _pdpEmail(person.WorkEmail), hasEmail: !!_pdpEmail(person.WorkEmail), sources: [] });
      cands.get(k).sources.push(source);
    };
    const mine = live.filter(a => {
      const who = personOf(a);
      return who && String(who.id) === String(p.id);
    });
    [...new Set(mine.map(a => String(a.ProjectID)))].forEach(pid => {
      const proj = projectById.get(pid);
      if (!proj) return;
      const label = proj.CustomerName || ('project ' + pid);
      const csdRows = (byName.get(ptNormKey(proj.CSDName)) || []).filter(c => c.Level === CONFIG.PDP.REVIEWER_LEVEL);
      const csd = csdRows.length === 1 ? csdRows[0] : null;
      let dm = null;
      (byProject.get(pid) || []).filter(isLeadDmAssignment).forEach(a => { dm = dm || personOf(a); });
      if ((p.Level === 'TP' || p.Level === 'STP') && dm && String(dm.id) !== String(p.id)) add(dm, 'Lead DM on ' + label);
      else add(csd, 'CSD of ' + label);
    });
    const candidates = [...cands.values()];
    const row = { id: String(p.id), employee: _pdpName(p), level: p.Level || '', candidates, state: 'none', managerId: '', value: '', managerName: '', patch: null };
    const usable = candidates.filter(c => c.hasEmail);
    if (candidates.length === 1 && usable.length === 1) { row.state = 'suggested'; row.managerId = usable[0].personId; }
    else if (candidates.length === 1) row.state = 'blocked';
    else if (candidates.length > 1) row.state = 'choose';
    const pick = chosen[row.id];
    if (pick === '-') { row.state = 'skipped'; row.managerId = ''; }
    else if (pick != null && pick !== '' && eligible.has(String(pick))) { row.state = 'picked'; row.managerId = String(pick); }
    if (row.managerId) {
      const mgr = eligible.get(row.managerId);
      if (!mgr || !mgr.email || pdpWouldCycle(working, p.id, mgr.email)) {
        row.state = (pick != null && pick !== '' && pick !== '-') ? 'rejected' : row.state;
        row.managerId = '';
      } else {
        row.value = mgr.email; row.managerName = mgr.name;
        row.patch = { ReportsTo: mgr.email };
        workingById.get(String(p.id)).ReportsTo = mgr.email;
      }
    }
    return row;
  });
  const count = s => rows.filter(r => r.state === s).length;
  return {
    rows, managers: [...eligible.values()],
    summary: {
      total: rows.length, toWrite: rows.filter(r => r.patch).length,
      suggested: count('suggested'), picked: count('picked'), skipped: count('skipped'),
      choose: count('choose'), blocked: count('blocked'), none: count('none'), rejected: count('rejected'),
      needsPick: rows.filter(r => !r.patch && ['choose', 'none', 'blocked', 'rejected'].includes(r.state)).length,
    },
  };
}

// The only shapes the writer accepts: exactly one of WorkEmail / ReportsTo, a lower-cased email.
function pdpAssertIdentityPatch(patch) {
  const keys = Object.keys(patch || {});
  if (keys.length !== 1 || !['WorkEmail', 'ReportsTo'].includes(keys[0])) {
    throw new Error('Identity patch may only set WorkEmail or ReportsTo');
  }
  const v = patch[keys[0]];
  if (typeof v !== 'string' || v !== _pdpEmail(v) || !pdpIsEmail(v)) {
    throw new Error('Identity patch value must be a lower-case email');
  }
  return patch;
}

// Writer input: the rows of a plan that carry a patch, validated up front.
function pdpPlanWrites(rows) {
  const writes = [];
  const refused = [];
  (rows || []).forEach(r => {
    if (!r || !r.patch) return;
    try { writes.push({ id: r.id, employee: r.employee, patch: pdpAssertIdentityPatch(r.patch) }); }
    catch (e) { refused.push({ employee: r.employee, message: e.message }); }
  });
  return { writes, refused };
}

// ── Read-only integrity checks (Admin > Data Health) ───────────────────
//   inputs = { people, userAssignments, leadership, today? }
// Returns [{ key, label, count, sample[] }] — every check should read zero.
function pdpCheckIdentity(inputs) {
  const people = (inputs && inputs.people) || [];
  const UA = (inputs && inputs.userAssignments) || [];
  const leaders = (inputs && inputs.leadership) || [];
  const today = (inputs && inputs.today) || new Date();
  const real = people.filter(p => p && !p.IsPlaceholder);
  const active = real.filter(p => _pdpYes(p.IsActive));
  const index = pdpEmailIndex(real);
  const known = new Set(UA.concat(leaders).map(u => _pdpEmail(u && u.UserEmail)).filter(Boolean));
  const leaderEmails = new Set(leaders.map(u => _pdpEmail(u && u.UserEmail)).filter(Boolean));
  const scope = active.filter(p => pdpInScope(p, today));
  const checks = [];
  const add = (key, label, items) => checks.push({ key, label, count: items.length, sample: items });

  add('noWorkEmail', 'In-scope people with no WorkEmail',
    scope.filter(p => !_pdpEmail(p.WorkEmail)).map(_pdpName));
  add('duplicateWorkEmail', 'WorkEmail shared by more than one person',
    [...index.entries()].filter(([, rows]) => rows.length > 1).map(([e, rows]) => e + ' (' + rows.map(_pdpName).join(', ') + ')'));
  add('unknownWorkEmail', 'WorkEmail that matches no User Assignments or Leadership email',
    real.filter(p => _pdpEmail(p.WorkEmail) && !known.has(_pdpEmail(p.WorkEmail))).map(p => _pdpName(p) + ' (' + _pdpEmail(p.WorkEmail) + ')'));
  add('noReportsTo', 'In-scope people with no line manager (ReportsTo)',
    scope.filter(p => !_pdpEmail(p.ReportsTo)).map(_pdpName));
  add('danglingReportsTo', 'ReportsTo matching no person and no leader',
    active.filter(p => _pdpEmail(p.ReportsTo) && !index.has(_pdpEmail(p.ReportsTo)) && !leaderEmails.has(_pdpEmail(p.ReportsTo)))
      .map(p => _pdpName(p) + ' -> ' + _pdpEmail(p.ReportsTo)));
  add('inactiveManager', 'Line manager who is no longer active',
    active.filter(p => { const m = _pdpUnique(index, p.ReportsTo); return m && !_pdpYes(m.IsActive); })
      .map(p => _pdpName(p) + ' -> ' + _pdpName(_pdpUnique(index, p.ReportsTo))));
  const walks = active.filter(p => p.Level !== CONFIG.PDP.REVIEWER_LEVEL).map(p => ({ p, w: _pdpWalkToCsd(index, p) }));
  add('chainCycle', 'Reporting loops', walks.filter(x => x.w.flag === 'chainCycle').map(x => _pdpName(x.p)));
  add('noCsd', 'In-scope people with no CSD up their reporting chain',
    walks.filter(x => x.w.flag === 'noCsd' && pdpInScope(x.p, today)).map(x => _pdpName(x.p)));
  add('selfReport', 'People who report to themselves',
    active.filter(p => _pdpEmail(p.WorkEmail) && _pdpEmail(p.ReportsTo) === _pdpEmail(p.WorkEmail)).map(_pdpName));
  return checks;
}
// ── N-435 (PDP-3): reviewers and the client access gate (pure) ──────────
// A person's current reviewers, from the People rows: lm = their ReportsTo (lower-cased; it IS
// the manager's WorkEmail), csd = the first CSD up the chain (PDP-D6), '' when there is none.
// `index` is pdpEmailIndex(people), built once by the caller. A CSD has no CSD of their own.
function pdpReviewerEmails(index, person) {
  const lm = _pdpEmail(person && person.ReportsTo);
  if (!person || person.Level === CONFIG.PDP.REVIEWER_LEVEL) return { lm, csd: '', flag: '' };
  const walk = _pdpWalkToCsd(index, person);
  return { lm, csd: walk.csd ? _pdpEmail(walk.csd.WorkEmail) : '', flag: walk.flag };
}

function _pdpEmailSet(list) {
  return new Set(String(list == null ? '' : list).split(CONFIG.PDP.ACCESS.EMAIL_SEP).map(_pdpEmail).filter(Boolean));
}

// What `myEmail` (with `role`) may do with one PDP record, from the record's OWN snapshot —
// the same fields SharePoint's per-item permissions are set from. { level, as }:
//   level 'edit' | 'read' | null;  as 'admin' | 'self' | 'manager' | 'csd' | 'former' | null.
// Admin / People Ops (pdpAdmin) see everything; Leadership and everyone else get null (PDP-D1).
// Every PDP screen filters through this with the EFFECTIVE identity (Ghost Mode: the ghosted
// user's email and role) — never rely on SharePoint trimming for display, because an admin's
// token returns every row even while ghosting.
function pdpAccessFor(role, myEmail, item) {
  const none = { level: null, as: null };
  if (!item) return none;
  if (roleCan(role, 'pdpAdmin')) return { level: 'edit', as: 'admin' };
  const me = _pdpEmail(myEmail);
  if (!me) return none;
  if (me === _pdpEmail(item.PersonEmail)) return { level: 'edit', as: 'self' };
  if (me === _pdpEmail(item.LineManagerEmail)) return { level: 'edit', as: 'manager' };
  if (me === _pdpEmail(item.CSDEmail)) return { level: 'edit', as: 'csd' };
  if (_pdpEmailSet(item.ReadOnlyEmails).has(me)) return { level: 'read', as: 'former' };
  return none;
}

// Blind scoring (PDP-D4) on top of pdpAccessFor: a Self row is the employee's until revealed,
// a Manager row the reviewers' until revealed; the Agreed row is shared. `revealed` is wired by
// N-442 and defaults to false. Admin always sees every row.
function pdpScoreVisible(access, source, revealed) {
  const as = access && access.level ? access.as : null;
  if (!as) return false;
  if (as === 'admin' || source === 'Agreed') return true;
  if (source === 'Self')    return as === 'self' || (!!revealed && ['manager', 'csd', 'former'].includes(as));
  if (source === 'Manager') return as === 'manager' || as === 'csd' || (!!revealed && ['self', 'former'].includes(as));
  return false;
}

// The records `myEmail` may see. Scores rows also pass pdpScoreVisible (revealedFn(row) → bool).
function pdpVisibleItems(items, role, myEmail, revealedFn) {
  return (items || []).filter(it => {
    const a = pdpAccessFor(role, myEmail, it);
    if (!a.level) return false;
    return it.Source ? pdpScoreVisible(a, it.Source, revealedFn ? revealedFn(it) : false) : true;
  });
}

// ── N-445 (PDP-13, PDP-D13): the Off / Pilot / On switch and the access gate (pure) ─────────
// Mode order is CONFIG.PDP.MODES = [Off, Pilot, On]. Anything unrecognised is Off (fail closed).
function pdpNormaliseMode(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  return CONFIG.PDP.MODES.find(m => m.toLowerCase() === s) || CONFIG.PDP.MODES[0];
}

// The pilot column -> unique, lower-case, valid work emails. Tolerates ';' (the stored form),
// newlines and stray blanks, so a hand-edited column still reads.
function pdpParsePilot(raw) {
  const seen = new Set();
  const out = [];
  String(raw == null ? '' : raw).split(/[;\r\n]+/).map(_pdpEmail).forEach(e => {
    if (!pdpIsEmail(e) || seen.has(e)) return;
    seen.add(e);
    out.push(e);
  });
  return out;
}

function pdpFormatPilot(emails) {
  const sep = CONFIG.PDP.ACCESS.EMAIL_SEP;
  return pdpParsePilot((emails || []).join(sep)).join(sep);
}

// Who the Admin may put in the pilot: PDP-D9 in-scope people whose WorkEmail is present and
// belongs to nobody else (an ambiguous email cannot be resolved to one person).
function pdpPilotCandidates(people, today) {
  const index = pdpEmailIndex(people);
  return (people || [])
    .filter(p => pdpInScope(p, today) && _pdpUnique(index, p.WorkEmail))
    .map(p => ({ id: String(p.id), name: _pdpName(p), level: p.Level, email: _pdpEmail(p.WorkEmail) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The pilot people who resolve to exactly one in-scope People row.
function _pdpPilotRows(people, pilot, today) {
  const index = pdpEmailIndex(people);
  const set = new Set(Array.isArray(pilot) ? pdpParsePilot(pilot.join(CONFIG.PDP.ACCESS.EMAIL_SEP)) : pdpParsePilot(pilot));
  return (people || []).filter(p => set.has(_pdpEmail(p.WorkEmail)) && _pdpUnique(index, p.WorkEmail) && pdpInScope(p, today));
}

// People the cycle engine (N-437) may generate meetings for. Off: nobody. Pilot: the in-scope
// pilot people only (reviewers are not generated for). On: everyone in scope.
function pdpEngineScope(mode, pilot, people, today) {
  const [OFF, PILOT] = CONFIG.PDP.MODES;
  const m = pdpNormaliseMode(mode);
  if (m === OFF) return [];
  if (m === PILOT) return _pdpPilotRows(people, pilot, today || new Date());
  return (people || []).filter(p => pdpInScope(p, today || new Date()));
}

// The gate every PDP screen, the engine and reminders call. Pure.
//   opts { mode, pilot (emails or the raw column), people, email (effective), role (effective),
//          hasRecords (Pilot only: the user can already see PDP records), today }
// -> { state: 'none' | 'preview' | 'live', reason }
//   Off: Admin / People Ops (pdpAdmin) preview, everyone else none.
//   Pilot: live for pilot people, their line manager and first CSD, and for anyone who already has
//          records (so a person removed from the pilot keeps their history); Admin / People Ops
//          live when one of those, else preview.
//   On: live for every in-scope person and every reviewer of one; Admin / People Ops live.
// Leadership and everyone else: none in every mode (PDP-D1).
function pdpAccess(opts) {
  const o = opts || {};
  const [OFF, PILOT] = CONFIG.PDP.MODES;
  const mode = pdpNormaliseMode(o.mode);
  const isAdmin = roleCan(o.role, 'pdpAdmin');
  const res = (state, reason) => ({ state, reason });
  if (mode === OFF) return isAdmin ? res('preview', 'off-admin') : res('none', 'off');

  const today = o.today || new Date();
  const people = o.people || [];
  const me = _pdpEmail(o.email);
  const index = pdpEmailIndex(people);
  const row = me ? _pdpUnique(index, me) : null;
  const isReviewerOf = rows => rows.some(p => { const r = pdpReviewerEmails(index, p); return !!me && (r.lm === me || r.csd === me); });

  let reason = '';
  if (me) {
    if (mode === PILOT) {
      const pilotRows = _pdpPilotRows(people, o.pilot, today);
      if (row && pilotRows.some(p => String(p.id) === String(row.id))) reason = 'pilot';
      else if (isReviewerOf(pilotRows)) reason = 'pilot-reviewer';
      else if (o.hasRecords === true) reason = 'has-records';
    } else if (row && pdpInScope(row, today)) {
      reason = 'in-scope';
    } else if (isReviewerOf(people.filter(p => pdpInScope(p, today)))) {
      reason = 'reviewer';
    }
  }
  if (reason) return res('live', reason);
  if (isAdmin) return mode === PILOT ? res('preview', 'pilot-admin') : res('live', 'on-admin');
  return res('none', mode === PILOT ? 'not-in-pilot' : 'not-in-scope');
}