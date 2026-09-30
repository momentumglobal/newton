// js/analytics-pages.js — analytics page renderers
// Loaded after analytics.js, before module app scripts.

// ── Phase C — Scorecards page ─────────────────────────────────────────

async function renderScorecardsPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = skeletonList(4);

  // N-270: 52 weeks fetched once — the full window feeds the learned
  // benchmarks; everything on the cards stays on the 13-week slice.
  const [activity52, historical, tpMap, allRoles] = await Promise.all([
    getActivityForAnalytics(52),
    getHistoricalPlacements(),
    getTalentPartnerDisplayMap(),
    getAllRoles(),
  ]);
  const activityRaw = activitySinceWeeks(activity52, 13);

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
  const roleIndex = funnelRoleIndex(allRoles, 'Department', 'Location');
  const benchObs  = buildFunnelObservations(activity52, roleIndex);

  // Filter historical to last 13 weeks
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
    const flaggedRoles = tpRoles.filter(r => {
    const acts = activityRaw.filter(a => String(a.RoleIDLookupId) === String(r.id));
      return isRoleFlagged(r, acts);
    }).length;
    const flaggedPct = tpRoles.length ? flaggedRoles / tpRoles.length : null;
    const flaggedRag = flaggedPct === null ? 'grey'
      : flaggedPct < 0.25 ? 'green'
      : flaggedPct <= 0.50 ? 'amber' : 'red';
    return renderScorecardPanel(scorecard, tpMap, { total: tpRoles.length, flagged: flaggedRoles, rag: flaggedRag }, bench);
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
  const overallRag  = roleHealth ? roleHealth.rag : 'grey';

  const healthRow = roleHealth ? (() => {
    const display = roleHealth.total > 0 ? `${roleHealth.flagged}/${roleHealth.total}` : '—';
    return `<tr>
      <td class='sc-label'>Flagged roles</td>
      <td class='sc-value sc-${roleHealth.rag}' style="text-align:center">${ragMarkerHTML(roleHealth.rag)}${display}</td>
    </tr>`;
  })() : '';

  const rows = scorecard.metrics.map(m => {
    const display = m.value !== null ? `${m.value}${m.unit === '%' ? '%' : ' ' + m.unit}` : '—';
    const ragClass = m.informational ? 'sc-grey' : `sc-${m.rag}`;
    const benchKey = bench && SCORECARD_BENCHMARK_KEYS[m.label];
    const tipAttr  = benchKey ? ` title="${escHtml(learnedBenchmarkTip(bench, benchKey))}"` : '';
    return `<tr>
      <td class='sc-label'>${m.label}</td>
      <td class='sc-value ${ragClass}'${tipAttr} style="text-align:center">${m.informational ? '' : ragMarkerHTML(m.rag)}${display}</td>
    </tr>`;
  }).join('');

  return `<div class='dash-panel sc-card'>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <h3 class='panel-title sc-tp-name' style="margin-bottom:0">${displayName}</h3>
      <span class="sc-rag-pill sc-rag-pill--${overallRag}">${ragMarkerHTML(overallRag)}${overallRag.toUpperCase()}</span>
    </div>
    <p class='sc-window'>Rolling Quarterly View</p>
    <table class='sc-table'><tbody>${healthRow}${rows}</tbody></table>
  </div>`;
}
