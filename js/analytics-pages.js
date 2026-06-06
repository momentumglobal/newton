// js/analytics-pages.js — analytics page renderers
// Loaded after analytics.js, before module app scripts.

// ── Phase C — Scorecards page ─────────────────────────────────────────

async function renderScorecardsPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading scorecards...</p>';

  const [activityRaw, historical] = await Promise.all([
    getActivityForAnalytics(13),
    getHistoricalPlacements(),
  ]);

  // Get unique TP emails from activity
  const tpEmails = [...new Set(activityRaw.map(a => a.TalentPartner).filter(Boolean))];

  if (!tpEmails.length) {
    main.innerHTML = `<div class='page-header'><h2>People Scorecards</h2></div>
      <p class='no-data'>No activity recorded in the last 13 weeks.</p>`;
    return;
  }

  const benchmarks = CONFIG.ANALYTICS_BENCHMARKS;

  // Filter historical to last 13 weeks
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 91);
  const recentPlacements = historical.filter(r =>
    r.placementDate && new Date(r.placementDate) >= cutoff
  );

  const cards = tpEmails.map(tpEmail => {
    const tpActivity   = activityRaw.filter(a => a.TalentPartner === tpEmail);
    const tpPlacements = recentPlacements.filter(r => r.tpEmail === tpEmail);
    const scorecard    = computeVelocityScore(tpEmail, tpActivity, tpPlacements, benchmarks);
    return renderScorecardPanel(scorecard);
  }).join('');

  main.innerHTML = `
    <div class='page-header'>
      <h2>People Scorecards</h2>
      <p class='page-subtitle'>Rolling 13-week coaching view · Admin and Leadership only</p>
    </div>
    <div class='scorecard-grid'>${cards}</div>`;
}

function renderScorecardPanel(scorecard) {
  const rows = scorecard.metrics.map(m => {
    const display = m.value !== null ? `${m.value}${m.unit === '%' ? '%' : ' ' + m.unit}` : '—';
    const ragClass = m.informational ? 'sc-grey' : `sc-${m.rag}`;
    return `<tr>
      <td class='sc-label'>${m.label}</td>
      <td class='sc-value ${ragClass}'>${display}</td>
    </tr>`;
  }).join('');

  return `<div class='dash-panel sc-card'>
    <h3 class='panel-title sc-tp-name'>${scorecard.tpEmail}</h3>
    <p class='sc-window'>${scorecard.window}</p>
    <table class='sc-table'><tbody>${rows}</tbody></table>
  </div>`;
}
