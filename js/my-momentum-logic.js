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

// Is this tab relevant to this person? ctx = { state, role, signals }. `signals` are filled by the tasks
// that own each tab (all default to false): hasActivity (N-453), pdpMy (N-452), hasReports (N-452).
// Role-granted tabs (My Team for the all-staff roles, MM-D8) do NOT need a People row: Admin, Leadership
// and People Ops usually have none.
function mmTabRelevant(key, ctx) {
  const c = ctx || {};
  const s = c.signals || {};
  switch (key) {
    case 'myHistory':     return c.state === 'ok';
    case 'myDetails':     return c.state === 'ok';
    case 'myScorecard':   return !!s.hasActivity;
    case 'myDevelopment': return !!s.pdpMy;
    case 'myTeam':        return !!s.hasReports || CONFIG.MY_MOMENTUM.ALL_STAFF_ROLES.includes(c.role);
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