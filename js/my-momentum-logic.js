// js/my-momentum-logic.js — My Momentum tab rules (N-451 / MM-1).
// Pure: reads CONFIG only — no network, no DOM. Needs CONFIG.MY_MOMENTUM (config.js). Used by
// my-momentum-router.js, my-momentum-nav.js and tests/assert-my-momentum.js.
// N-474: also holds the greeting and old-link redirect helpers (mmGreetingText(), mmRedirectTarget()), moved
// from utils.js. Loads on my-momentum.html, and on index.html (home.js) and people.html (people-app.js).
//
// The tab registry is CONFIG.MY_MOMENTUM.TABS (order = display order = landing order). A tab is shown
// only when it is `live` (its page exists) AND relevant to this person (MM-D1).

// 'ok' = exactly one People row for the (Ghost-aware) work email, 'ambiguous' = several rows share it,
// 'notLinked' = no row. `identity` is what getPdpIdentity() returns ({ me, flags, ... }).
function mmTabState(identity) {
  if (identity && identity.me) return 'ok';
  if (identity && identity.flags && identity.flags.ambiguous) return 'ambiguous';
  return 'notLinked';
}

// The sub-tabs of My Team (N-453), in display order, for this person. ctx = { role, signals } as mmTabRelevant.
// Development: the PDP signal (pdpTeam, N-452). Team Scorecards: anyone with reports (signals.hasReports, read from the
// identity, no extra request) or an all-staff role (CONFIG.MY_MOMENTUM.ALL_STAFF_ROLES, MM-D8), with PDP On or Off.
// So Leadership gets Team Scorecards only (PDP-D1: no Development), and a manager with the PDP gate Off keeps Scorecards.
function mmTeamSubTabs(ctx) {
  const c = ctx || {};
  const s = c.signals || {};
  const tabs = [];
  if (s.pdpTeam) tabs.push({ key: 'development', label: 'Development' });
  if (s.hasReports || CONFIG.MY_MOMENTUM.ALL_STAFF_ROLES.includes(c.role)) tabs.push({ key: 'scorecards', label: 'Team Scorecards' });
  return tabs;
}

// Is this tab relevant to this person? ctx = { state, role, signals }. `signals` are filled by the tasks
// that own each tab (all default to false): hasActivity (N-453, resolveScorecardNav()); pdpMy and pdpTeam (N-452, from
// resolvePdpNav()); hasReports (N-453, from the identity just loaded). My Team shows when it has at least one sub-tab
// (mmTeamSubTabs), so a tab never opens onto nothing; pdpTeam is true for Admin / People Ops even without a People row
// (they usually have none), and the all-staff roles reach Team Scorecards the same way.
function mmTabRelevant(key, ctx) {
  const c = ctx || {};
  const s = c.signals || {};
  switch (key) {
    case 'myHistory':     return c.state === 'ok';
    case 'myDetails':     return c.state === 'ok' || roleCan(c.role, 'myDetailsAdmin');   // N-456: Admin / People Ops reach the picker even with no People row
    case 'myScorecard':   return !!s.hasActivity;
    case 'myDevelopment': return !!s.pdpMy;
    case 'myOnboarding':  return !!s.onbPlans || !!s.onbRituals;   // N-499 (ONB-D28), N-509: a plan of their own to see; N-500 (ONB-D45, D47): or the Processes & Rituals reference tab
    case 'myBuddying':    return !!s.onbBuddy;   // N-509 (ONB-D38): the buddy of at least one Active plan
    case 'myTeam':        return mmTeamSubTabs(c).length > 0;
    default:              return false;
  }
}

// The tabs to show, in registry order. A tab that is not `live` never appears.
function mmVisibleTabs(tabs, ctx) {
  return (tabs || []).filter(t => t.live === true && mmTabRelevant(t.key, ctx));
}

// N-509 (ONB-D39): the label a tab shows in the nav. Only Buddying carries a count, the open Buddy-owned steps (signals.onbActions),
// and none at 0. tab = a CONFIG.MY_MOMENTUM.TABS entry or its key. Reads CONFIG.ONBOARDING.TAB_COUNT (onboarding-config.js): call it
// only where that file loads (its one caller is my-momentum-nav.js on my-momentum.html, like mmScorecardScope above).
function mmTabLabel(tab, signals) {
  const t = typeof tab === 'string' ? (CONFIG.MY_MOMENTUM.TABS.find(x => x.key === tab) || { key: tab, label: tab }) : (tab || {});
  const n = t.key === 'myBuddying' ? Number((signals || {}).onbActions) : 0;
  const label = String(t.label == null ? '' : t.label);
  return n > 0 ? CONFIG.ONBOARDING.TAB_COUNT.split('{label}').join(label).split('{n}').join(String(n)) : label;
}

// First visible tab, or null when there is nothing to show (the no-record panel).
function mmLandingTab(visible) {
  return visible && visible.length ? visible[0].key : null;
}

// ── Scorecard scope (N-453, MM-3 / MM-D8) ──────────────────────────────

// The views the person may switch between on Team Scorecards, and the default. The same rules as pdpTeamScope
// (pdp-team.js) — 'tree' for a CSD, 'reports' for anyone with direct reports, 'all' for an all-staff role — but
// WITHOUT the PDP-admin test: Team Scorecards does not depend on the PDP gate. `identity` = pdpResolveIdentity().
// N-475: reads CONFIG.PDP.REVIEWER_LEVEL, which js/pdp-config.js defines. This file also loads on index.html, which loads no PDP
// code, so never call this from index.html: its only caller is my-momentum-scorecard.js on my-momentum.html (lint-load-lists exempts it).
function mmScorecardScope(identity, role) {
  const id = identity || {};
  const views = [];
  if (id.me && id.me.Level === CONFIG.PDP.REVIEWER_LEVEL) views.push('tree');
  if (id.me && (id.directReports || []).length) views.push('reports');
  if (CONFIG.MY_MOMENTUM.ALL_STAFF_ROLES.includes(role)) views.push('all');
  return { views, default: views[0] || '' };
}

// N-454: can this role open the Role page (reporting.html#roles)? One source: the Command Bar's Roles entry, which mirrors
// the Reporting router's access for that page. Leadership and People Ops cannot, so their drill-down shows plain names.
function mmCanOpenRolePage(role) {
  const entry = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'roles');
  return !!(entry && entry.roles.includes(role));
}

// ── My History (N-455 / MM-5) ───────────────────────────────────────────

// Can this role open the Project page (reporting.html#projects?action=project&id=N)? Same one source as the Role page above:
// the Command Bar's Projects entry, which mirrors the Reporting router's access.
function mmCanOpenProjectPage(role) {
  const entry = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'projects');
  return !!(entry && entry.roles.includes(role));
}

// The person's project assignment record, one line per real assignment row. `assignments` = their Assignments rows,
// `projects` = every Project, `todayDay` = 'YYYY-MM-DD' (the caller's local day: pass it in, so this stays pure).
// A row is kept only when it has a ProjectID and is not a forecast, so bench rows and historic customer-name-only rows
// drop out (Chris, 16 Nov). Status, first match wins: 'completed' = the person's own EndDate is before today OR the project
// is Completed; 'upcoming' = starts after today; else 'current'. Day strings via spDateIn, compared as text — never Date
// objects (SharePoint's UTC to BST shift). `known` = the Project row exists; an unknown project shows the assignment's own
// Customer text and is not counted in the tile.
// Diff-2: legacy extensions were signed as a new row, not an amendment, so rows of ONE ProjectID that run on with no gap
// are one stint (see the merge step below); a gap of a day or more starts a new stint. Status is judged on the merged span.
// Rows { projectId, known, project, type, start, end, status } — Current (newest start), Upcoming (soonest start), then
// Completed (newest end, a Completed row with no end last).
function mmHistoryRows(assignments, projects, todayDay) {
  const byId = new Map((projects || []).filter(Boolean).map(p => [String(p.id), p]));
  const lines = [];
  (assignments || []).forEach(a => {
    const pid = Number(a && a.ProjectID);
    if (!a || !Number.isInteger(pid) || pid <= 0 || isForecastAssignment(a)) return;
    const project = byId.get(String(pid)) || null;
    lines.push({
      projectId: pid,
      known:     !!project,
      done:      !!(project && project.Status === 'Completed'),
      project:   (project && project.CustomerName) || a.Customer || '',
      type:      a.ProjectType || (project && project.ProjectType) || '',
      start:     spDateIn(a.StartDate) || '',
      end:       spDateIn(a.EndDate) || '',
    });
  });
  // Merge: per project, oldest start first; a line joins the stint before it when it starts no later than the day after
  // that stint ends (an open end, '', runs on for ever, so anything after it joins). The merged stint keeps the first
  // start and the last end ('' if any joined line is open-ended). Day strings only, via addDaysISO (utils.js).
  const byProject = new Map();
  lines.forEach(l => { if (!byProject.has(l.projectId)) byProject.set(l.projectId, []); byProject.get(l.projectId).push(l); });
  const rows = [];
  byProject.forEach(list => {
    list.sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : 0));
    let run = null;
    list.forEach(l => {
      if (run && (run.end === '' || l.start === '' || l.start <= addDaysISO(run.end, 1))) {
        run.end = (run.end === '' || l.end === '') ? '' : (l.end > run.end ? l.end : run.end);
      } else {
        run = Object.assign({}, l);
        rows.push(run);
      }
    });
  });
  rows.forEach(r => { r.status = _mmHistoryStatus(r.start, r.end, r.done, todayDay); delete r.done; });
  const rank = { current: 0, upcoming: 1, completed: 2 };
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  rows.sort((x, y) => {
    if (rank[x.status] !== rank[y.status]) return rank[x.status] - rank[y.status];
    let d = 0;
    if (x.status === 'current') d = cmp(y.start, x.start);
    else if (x.status === 'upcoming') d = cmp(x.start, y.start);
    else {
      if (!x.end !== !y.end) return x.end ? -1 : 1;
      d = cmp(y.end, x.end);
    }
    return d || String(x.project).localeCompare(String(y.project));
  });
  return rows;
}

// The chip for one stint, first match wins: 'completed' = its own end is before today OR the project is Completed;
// 'upcoming' = it starts after today; else 'current'. Day strings compared as text.
function _mmHistoryStatus(start, end, projectDone, todayDay) {
  if ((end && end < todayDay) || projectDone) return 'completed';
  if (start && start > todayDay) return 'upcoming';
  return 'current';
}

// Total hires = placements credited to the person, all time: the same two steps as the scorecard's Hires row
// (placementsSinceDay with no window, then tpMatches — the N-309 placer rule). `placements` = getHistoricalPlacements rows.
function mmHistoryHireCount(placements, emailLower) {
  return placementsSinceDay(placements, null).filter(p => tpMatches(p.tpEmail, emailLower)).length;
}

// The three tiles' values. `since` = the People.StartDate day ('YYYY-MM-DD') or null when blank / unreadable (the tile
// is then not drawn). `projectsCompleted` = the number of known Completed lines in the record. Rows were already merged
// per unbroken stint (mmHistoryRows), so an extension counts once and a project that came back after a gap counts
// twice; 0 stays 0. `hires` = the count, or null when the hires read failed (the tile shows a dash).
function mmHistoryTiles(me, rows, hires) {
  const done = (rows || []).filter(r => r.known && r.status === 'completed').length;
  return { since: spDateIn(me && me.StartDate) || null, projectsCompleted: done, hires: hires === undefined ? null : hires };
}

// The people one Team Scorecards view covers, as [{ email, name }], A→Z by name. `people` = getPeople(false) rows.
//   tree    = the CSD's whole tree (identity.csdTree)      reports = direct reports      all = every active person
// A leaver or a placeholder never appears; a row with no WorkEmail cannot be matched to activity, so it is dropped;
// the same person is listed once. Membership is the ReportsTo line (MM-D12), not project assignment.
function mmScorecardMembers(people, identity, view) {
  const id = identity || {};
  const yes = v => v === true || v === 1 || v === 'Yes' || v === '1' || v === 'true';
  let rows;
  if (view === 'tree')         rows = (id.csdTree || []).map(t => t.person);
  else if (view === 'reports') rows = id.directReports || [];
  else if (view === 'all')     rows = people || [];
  else rows = [];
  const seen = new Set();
  const out = [];
  rows.forEach(p => {
    if (!p || p.IsPlaceholder || !yes(p.IsActive)) return;
    const email = String(p.WorkEmail == null ? '' : p.WorkEmail).trim().toLowerCase();
    if (!email || seen.has(String(p.id))) return;
    seen.add(String(p.id));
    out.push({ email, name: String(p.EmployeeName || '').trim() || email });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Where a hash / Command Bar key lands (N-453). `page` = the key; `visibleTabs` = mmNavTabs(); `teamSubTabs` = mmTeamSubTabs();
// `cfg` = CONFIG.MY_MOMENTUM. Returns { tab, sub } or null (nothing fits: the landing tab opens).
//   1 a tab key that is visible                          → { tab }
//   2 a DEEP_LINKS alias whose tab (and sub-tab) shows   → { tab, sub }
//   3 else the DEEP_LINK_FALLBACKS key, tried the same way once (an old #scorecards link, for a manager with no own activity)
// N-500: an optional 5th argument `onbSubTabs` (onbSubTabs()) lets an alias for myOnboarding carry a sub-tab, shown only when this person has it.
function mmResolveDeepLink(page, visibleTabs, teamSubTabs, cfg, onbSubTabs) {
  const c = cfg || {};
  const has = k => (visibleTabs || []).some(t => t.key === k);
  const hasSub = k => (teamSubTabs || []).some(t => t.key === k);
  const hasOnbSub = k => (onbSubTabs || []).some(t => t.key === k);
  const direct = key => {
    if (!key) return null;
    if (has(key)) return { tab: key };
    const alias = c.DEEP_LINKS && Object.prototype.hasOwnProperty.call(c.DEEP_LINKS, key) ? c.DEEP_LINKS[key] : null;
    if (alias && has(alias.tab) && (!alias.sub || (alias.tab === 'myTeam' && hasSub(alias.sub)) || (alias.tab === 'myOnboarding' && hasOnbSub(alias.sub)))) return { tab: alias.tab, sub: alias.sub || '' };
    return null;
  };
  const hit = direct(page);
  if (hit) return hit;
  const fb = c.DEEP_LINK_FALLBACKS && Object.prototype.hasOwnProperty.call(c.DEEP_LINK_FALLBACKS, page) ? c.DEEP_LINK_FALLBACKS[page] : '';
  return direct(fb);
}

// N-457 (MM-7): the `person` parameter of a My Details deep link (#myDetails?person=12), or null. A positive whole number only,
// so nothing else ever reaches the picker; whether the viewer may use it is decided where it is applied (mdSetPreselect).
function mmDeepLinkPerson(raw) {
  const query = String(raw === undefined || raw === null ? '' : raw).split('?')[1] || '';
  const m = /(?:^|&)person=([^&#]*)/.exec(query);
  return m && /^[1-9][0-9]{0,9}$/.test(m[1]) ? Number(m[1]) : null;
}

// N-452: where an old People deep link lives now. `hash` is location.hash ('#teamDevelopment?x=1'); `map` is
// CONFIG.MY_MOMENTUM.REDIRECTS ({ oldKey: newKey }). Returns the new My Momentum tab key, or '' for "stay here".
function mmRedirectTarget(hash, map) {
  const key = String(hash || '').replace(/^#/, '').split('?')[0].trim();
  return key && map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : '';
}

// N-459 (MM-9): the hero greeting. `hour` is the viewer's local hour (0-23); the bands live in CONFIG.MY_MOMENTUM.GREETING_HOURS.
function greetingForHour(hour) {
  const g = CONFIG.MY_MOMENTUM.GREETING_HOURS;
  return hour >= g.eveningFrom ? 'Good evening' : hour >= g.afternoonFrom ? 'Good afternoon' : 'Good morning';
}
function firstNameOf(fullName) { return String(fullName || '').trim().split(/\s+/)[0]; }
// "Good morning, Chris". No account name -> no name and no comma; an email address is never shown.
function mmGreetingText(fullName, hour) {
  const name = firstNameOf(fullName);
  return name ? `${greetingForHour(hour)}, ${name}` : greetingForHour(hour);
}
