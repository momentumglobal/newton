// js/analytics-pages.js — analytics page renderers
// Loaded after analytics.js, before module app scripts.

// ── Phase C — Scorecards page ─────────────────────────────────────────

async function renderScorecardsPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading scorecards...</p>';

  const [activityRaw, historical, tpMap] = await Promise.all([
    getActivityForAnalytics(13),
    getHistoricalPlacements(),
    getTalentPartnerDisplayMap(),
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
    return renderScorecardPanel(scorecard, tpMap);
  }).join('');

  main.innerHTML = `
    <div class='page-header'>
      <h2>People Scorecards</h2>
      <p class='page-subtitle'>Rolling Quarterly Coaching View</p>
    </div>
    <div class='scorecard-grid'>${cards}</div>`;
}

function renderScorecardPanel(scorecard, tpMap = {}) {
  const displayName = tpMap[scorecard.tpEmail.toLowerCase()] || scorecard.tpEmail;
  const rows = scorecard.metrics.map(m => {
    const display = m.value !== null ? `${m.value}${m.unit === '%' ? '%' : ' ' + m.unit}` : '—';
    const ragClass = m.informational ? 'sc-grey' : `sc-${m.rag}`;
    return `<tr>
      <td class='sc-label'>${m.label}</td>
      <td class='sc-value ${ragClass}' style="text-align:center">${display}</td>
    </tr>`;
  }).join('');

  const ragOrder = ['red','amber','green','grey'];
  const overallRag = scorecard.metrics
    .filter(m => !m.informational)
    .map(m => m.rag)
    .sort((a, b) => ragOrder.indexOf(a) - ragOrder.indexOf(b))[0] || 'grey';

  return `<div class='dash-panel sc-card'>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <h3 class='panel-title sc-tp-name' style="margin-bottom:0">${displayName}</h3>
      <span class="sc-rag-pill sc-rag-pill--${overallRag}">${overallRag.toUpperCase()}</span>
    </div>
    <p class='sc-window'>Rolling Quarterly View</p>
    <table class='sc-table'><tbody>${rows}</tbody></table>
  </div>`;
}
