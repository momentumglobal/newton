// js/analytics-pages.js — analytics page renderers
// Loaded after analytics.js, before module app scripts.

// ── Phase C — Scorecards page ─────────────────────────────────────────

async function renderScorecardsPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = skeletonList(4);

  // N-270: 52 weeks fetched once — the full window feeds the learned
  // benchmarks; everything on the cards stays on the 13-week slice.
  const [activity52, historical, tpMap, allRoles, stageRows, headcount, placementIds, allProjects] = await Promise.all([
    getActivityForAnalytics(52),
    getHistoricalPlacements(),
    getTalentPartnerDisplayMap(),
    getAllRoles(),
    getRoleStageHistory().catch(e => { console.warn('N-274: stage history read failed', e); return []; }),
    getAllHeadcount().catch(e => { console.warn('N-309: headcount read failed', e); return []; }),
    getPlacementHeadcountIds().catch(e => { console.warn('N-309: placement headcount read failed', e); return []; }),
    getProjects(false),
  ]);
  const activityRaw = activitySinceWeeks(activity52, 13);
  const stageHistory = groupStageHistoryByRole(stageRows);  // N-274
  // N-309: behind-pace measured from each pipeline's oldest open headcount.
  const openSince = oldestOpenHeadcountIndex(headcount, placementIds);

  // Get unique TP emails from activity, then drop inactive employees
  let tpEmails = [...new Set(activityRaw.map(a => a.TalentPartner).filter(Boolean))];
  tpEmails = await filterToActiveTpEmails(tpEmails, tpMap);

  // ── Role-based scoping ──────────────────────────────────────────────
  // Talent Partners see only their own scorecard.
  // Delivery Managers see only TPs assigned to their projects.
  // Admin / Leadership see all.
  if (_resolvedRole === 'talent_partner') {
    const myEmail = getScopedUserEmail();
    tpEmails = tpEmails.filter(e => e.toLowerCase() === myEmail);
  } else if (_resolvedRole === 'delivery_manager') {
    const allowed = await getScopedTpEmails(getCurrentUser().email);
    // null = unrestricted (e.g. admin); otherwise filter to assigned TPs.
    if (allowed !== null) {
      tpEmails = tpEmails.filter(e => allowed.has(e.toLowerCase()));
    }
  }

  if (!tpEmails.length) {
    main.innerHTML = `<div class='page-header'><h2>People Scorecards</h2></div>
      <p class='no-data'>No activity recorded in the last 13 weeks.</p>`;
    return;
  }

  // N-270: learning population = every role; each TP is benchmarked
  // against a mix weighted by their own 13-week volume per
  // function × location, with their own activity left out.
  // N-333 (D-1): the learning pool is client-only. Each TP's own card below
  // keeps all of their own data, so an Internal TA gets a card built from
  // their internal work, judged against client benchmarks.
  const roleIndex = funnelRoleIndex(allRoles, 'Department', 'Location');
  const { activity: clientActivity52 } = excludeInternalProjectData(
    { activity: activity52 }, { projects: allProjects, roles: allRoles });
  const benchObs  = buildFunnelObservations(clientActivity52, roleIndex);

  // Filter historical to last 13 weeks — one row per fill, credited to the
  // TP who made the placement (N-309, D-7).
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 91);
  const recentPlacements = historical.filter(r =>
    r.placementDate && new Date(r.placementDate) >= cutoff
  );

  const cards = tpEmails.map(tpEmail => {
    const tpActivity   = activityRaw.filter(a => a.TalentPartner === tpEmail);
    const tpPlacements = recentPlacements.filter(r => tpMatches(r.tpEmail, tpEmail));
    const bench        = learnFunnelBenchmarksMix(benchObs, buildFunnelObservations(tpActivity, roleIndex), { exclude: o => o.tp === tpEmail });
    const scorecard    = computeVelocityScore(tpEmail, tpActivity, tpPlacements, bench);
    const tpRoles      = allRoles.filter(r => !ACTIVE_STAGES.includes(r.Stage) && tpMatches(r.TalentPartner, tpEmail));
    // N-274: { total, flagged, stuck, conversion, behind }. Counts only — no RAG
    // for a quarter of time-in-stage data (decision, 2 Oct 2026).
    const roleHealth   = tallyRoleFlags(tpRoles, activityRaw, stageHistory, undefined, { openSince });
    return renderScorecardPanel(scorecard, tpMap, roleHealth, bench);
  }).join('');

  main.innerHTML = `
    <div class='page-header'>
      <h2>People Scorecards</h2>
      <p class='page-subtitle'>Rolling Quarterly Coaching View</p>
    </div>
    <div class='scorecard-grid'>${cards}</div>`;
}

// Returns a Set of lowercased TP emails assigned to the given user's projects.
// Used to scope a Delivery Manager to the scorecards of TPs on their projects.
async function getScopedTpEmails(userEmail) {
  const projectIds = await getUserProjectIds(userEmail);
  // Admins resolve to null (all projects) — treat as unrestricted.
  if (projectIds === null) return null;
  const allowed = new Set();
  for (const pid of projectIds) {
    const assignments = await getTalentPartnersForProject(pid);
    assignments.forEach(a => {
      const email = (a.UserEmail || a.Title || '').toLowerCase();
      if (email) allowed.add(email);
    });
  }
  return allowed;
}

function renderScorecardPanel(scorecard, tpMap = {}, roleHealth = null, bench = null) {
  const displayName = tpMap[scorecard.tpEmail.toLowerCase()] || scorecard.tpEmail;
  // N-336: card markup shared with the Command Centre Project Health detail.
  return scorecardCardHTML({
    title:       displayName,
    windowLabel: 'Rolling Quarterly View',
    healthRows:  scorecardHealthRows(roleHealth, 'Flagged roles'),
    metrics:     scorecardMetricTips(scorecard.metrics, bench),
  });
}
