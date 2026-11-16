// js/my-momentum-logic.js — My Momentum tab rules (N-451 / MM-1).
// Pure: reads CONFIG only — no network, no DOM. Needs CONFIG.MY_MOMENTUM (config.js). Used by
// my-momentum-router.js, my-momentum-nav.js and tests/assert-my-momentum.js.
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
    case 'myDetails':     return c.state === 'ok';
    case 'myScorecard':   return !!s.hasActivity;
    case 'myDevelopment': return !!s.pdpMy;
    case 'myTeam':        return mmTeamSubTabs(c).length > 0;
    default:              return false;
  }
}

// The tabs to show, in registry order. A tab that is not `live` never appears.
function mmVisibleTabs(tabs, ctx) {
  return (tabs || []).filter(t => t.live === true && mmTabRelevant(t.key, ctx));
}

// First visible tab, or null when there is nothing to show (the no-record panel).
function mmLandingTab(visible) {
  return visible && visible.length ? visible[0].key : null;
}

// ── Scorecard scope (N-453, MM-3 / MM-D8) ──────────────────────────────

// The views the person may switch between on Team Scorecards, and the default. The same rules as pdpTeamScope
// (pdp-team.js) — 'tree' for a CSD, 'reports' for anyone with direct reports, 'all' for an all-staff role — but
// WITHOUT the PDP-admin test: Team Scorecards does not depend on the PDP gate. `identity` = pdpResolveIdentity().
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
function mmResolveDeepLink(page, visibleTabs, teamSubTabs, cfg) {
  const c = cfg || {};
  const has = k => (visibleTabs || []).some(t => t.key === k);
  const hasSub = k => (teamSubTabs || []).some(t => t.key === k);
  const direct = key => {
    if (!key) return null;
    if (has(key)) return { tab: key };
    const alias = c.DEEP_LINKS && Object.prototype.hasOwnProperty.call(c.DEEP_LINKS, key) ? c.DEEP_LINKS[key] : null;
    if (alias && has(alias.tab) && (!alias.sub || (alias.tab === 'myTeam' && hasSub(alias.sub)))) return { tab: alias.tab, sub: alias.sub || '' };
    return null;
  };
  const hit = direct(page);
  if (hit) return hit;
  const fb = c.DEEP_LINK_FALLBACKS && Object.prototype.hasOwnProperty.call(c.DEEP_LINK_FALLBACKS, page) ? c.DEEP_LINK_FALLBACKS[page] : '';
  return direct(fb);
}