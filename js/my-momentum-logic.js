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
// that own each tab (all default to false): hasActivity (N-453); pdpMy and pdpTeam (N-452, from resolvePdpNav()).
// My Team follows pdpTeam alone until N-453 adds Team Scorecards, so a tab never opens onto nothing; pdpTeam is
// true for Admin / People Ops even without a People row (they usually have none). MM-D8's all-staff grant
// (CONFIG.MY_MOMENTUM.ALL_STAFF_ROLES) returns with N-453.
function mmTabRelevant(key, ctx) {
  const c = ctx || {};
  const s = c.signals || {};
  switch (key) {
    case 'myHistory':     return c.state === 'ok';
    case 'myDetails':     return c.state === 'ok';
    case 'myScorecard':   return !!s.hasActivity;
    case 'myDevelopment': return !!s.pdpMy;
    case 'myTeam':        return !!s.pdpTeam;
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