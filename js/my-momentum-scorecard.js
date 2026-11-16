// js/my-momentum-scorecard.js — My Scorecard and My Team > Team Scorecards (N-453 / MM-3)
//
// Page renderers and actions only. The rules are elsewhere: who is shown and which views exist are pure in
// my-momentum-logic.js (mmScorecardScope / mmScorecardMembers), the period and the card maths are pure in analytics.js
// (scorecardPeriod / buildScorecardCards), every read is loadScorecardData() (analytics.js) over api.js, and the markup
// is pure in my-momentum-pages.js. State shared with the other My Momentum files (the view filter, the period, the
// sub-tab) is declared in my-momentum-nav.js.
//
// Only the body of the page (#mmsc-body) is redrawn when the period or view changes, so the title, the tab strip, the
// selects and the area header stay put. Nothing here writes: scorecards are read-only, so Ghost Mode needs no extra
// guard — getScopedUserEmail(), the identity and the role are already Ghost-aware.
//
// Loading: the default read (the 52-week benchmark pool plus 1 January) once per visit to the tab; All time is a second,
// larger read fetched the first time it is picked and kept for the page session. Switching period re-renders from what is loaded.

let _mmScCtx     = null;   // { kind: 'own' | 'team' } for the page on screen
let _mmScDefault = null;   // promise of loadScorecardData() — quarter and year to date
let _mmScAll     = null;   // promise of loadScorecardData({ allTime: true }) — started only when All time is picked
let _mmScPeople  = null;   // promise of getPeople(false) — Team Scorecards members
let _mmScSeq     = 0;      // a slower, older fill must not overwrite a newer one

function _mmScLoad(periodKey) {
  if (periodKey === 'all') {
    if (!_mmScAll) _mmScAll = loadScorecardData({ allTime: true }).catch(e => { _mmScAll = null; throw e; });
    return _mmScAll;
  }
  if (!_mmScDefault) _mmScDefault = loadScorecardData().catch(e => { _mmScDefault = null; throw e; });
  return _mmScDefault;
}

// The people the page is about, as [{ email, name }]: the signed-in person (My Scorecard), or the chosen Team Scorecards view.
async function _mmScMembers(kind) {
  if (kind === 'own') {
    const me = _mmIdentity && _mmIdentity.me;
    const email = getScopedUserEmail();
    const user = getCurrentUser();
    return { members: [{ email, name: (me && me.EmployeeName) || (!getGhostUser() && user && user.name) || email }], omittedNote: false };
  }
  const scope = mmScorecardScope(_mmIdentity, _mmResolvedRole);
  const view = scope.views.includes(_mmTeamView) ? _mmTeamView : scope.default;
  if (!_mmScPeople) _mmScPeople = getPeople(false).catch(e => { _mmScPeople = null; throw e; });
  return { members: mmScorecardMembers(await _mmScPeople, _mmIdentity, view), omittedNote: true };
}

// N-454: the three detail sections under the own card (My Scorecard only). Everything is read from what is already loaded.
function _mmScDetailHtml(card, d, period) {
  const key = card.email;
  return mmScorecardDetailHtml({
    periodLabel: period.label,
    trend: buildScorecardTrend({ activity: d.activityAll, placements: d.historical, period, bench: card.bench, key }),
    roles: listScorecardRoles({ allRoles: d.allRoles, allProjects: d.allProjects, activity: d.activityAll, stageHistory: d.stageHistory, openSince: d.openSince, key }),
    hires: listScorecardHires({ placements: d.historical, placementsRaw: d.placementsRaw, allRoles: d.allRoles, allProjects: d.allProjects, period, key }),
    canLinkRoles: mmCanOpenRolePage(_mmResolvedRole),
  });
}

// Fills #mmsc-body for the current kind, period and view.
async function _mmScFill() {
  const body = document.getElementById('mmsc-body');
  const ctx = _mmScCtx;
  if (!body || !ctx) return;
  const seq = ++_mmScSeq;
  const key = scorecardPeriod(_mmScPeriod).key;
  if (!(key === 'all' ? _mmScAll : _mmScDefault)) body.innerHTML = skeletonList(4);
  try {
    const [{ members, omittedNote }, d] = await Promise.all([_mmScMembers(ctx.kind), _mmScLoad(key)]);
    if (seq !== _mmScSeq) return;
    const period = scorecardPeriod(key);
    const { cards, omitted } = buildScorecardCards({
      people: members,
      data: { activity: d.activityAll, placements: d.historical, allRoles: d.allRoles, allProjects: d.allProjects, stageHistory: d.stageHistory, openSince: d.openSince },
      period,
    });
    body.innerHTML = cards.length
      ? mmScorecardCardsHtml(cards, period.windowLabel) + (ctx.kind === 'own' ? _mmScDetailHtml(cards[0], d, period) : '') + (omittedNote ? mmScorecardOmittedHtml(omitted) : '') + mmScorecardNoteHtml()
      : mmScorecardEmptyHtml(key, ctx.kind);
  } catch (e) {
    if (seq !== _mmScSeq) return;
    console.error('My Momentum scorecards: load failed', e);
    body.innerHTML = emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: 'Could not load scorecards', message: (e && e.message) || String(e), actionLabel: 'Try again', actionAct: ['mmScRetry'] });
  }
  if (window.lucide) lucide.createIcons();
}

async function renderMyScorecardPage() {
  const main = document.getElementById('main-content');
  _mmScCtx = { kind: 'own' };
  _mmScDefault = null;   // a fresh read per visit (a cache hit inside the 30 s window); All time keeps its copy for the page session
  main.innerHTML = mmScorecardHeadHtml({ title: 'My Scorecard', tabsHtml: '', periodKey: _mmScPeriod, views: [], view: '' })
    + '<div id="mmsc-body">' + skeletonList(4) + '</div>';
  await _mmScFill();
}

async function renderTeamScorecardsPage() {
  const main = document.getElementById('main-content');
  const scope = mmScorecardScope(_mmIdentity, _mmResolvedRole);
  const subs = mmTeamSubTabs(_mmTabCtx());
  const tabsHtml = subs.length >= 2 ? mmTeamTabsHtml('scorecards', subs) : '';
  _mmScCtx = { kind: 'team' };
  _mmScDefault = null;
  if (!scope.views.length) {
    main.innerHTML = `<div class="page-header"><h1 class="page-title">My Team</h1></div>${tabsHtml}`
      + emptyStateBlock({ icon: 'users', title: 'No team to show', message: 'Nobody reports to you in Newton, so there are no team scorecards to show. If that looks wrong, ask People Ops to check your work email and your team’s line managers.' });
    if (window.lucide) lucide.createIcons();
    return;
  }
  const view = scope.views.includes(_mmTeamView) ? _mmTeamView : scope.default;
  main.innerHTML = mmScorecardHeadHtml({ title: 'My Team', tabsHtml, periodKey: _mmScPeriod, views: scope.views, view })
    + '<div id="mmsc-body">' + skeletonList(4) + '</div>';
  await _mmScFill();
}

// The Period select. An unknown value falls back to the default period (scorecardPeriod).
function mmScPeriod(value) {
  _mmScPeriod = scorecardPeriod(value).key;
  return _mmScFill();
}

// The View select (Team Scorecards). Shared with the Development tab (MM-D8); each tab clamps it to the views it can serve.
function mmScView(value) {
  _mmTeamView = String(value);
  return _mmScFill();
}

function mmScRetry() {
  return _mmScFill();
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  mmScPeriod,
  mmScView,
  mmScRetry,
});