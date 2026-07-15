// js/mobile-scorecards.js - Mobile People Scorecards (read-only)
//
// Reuses the EXACT desktop scoring logic from analytics.js
// (computeVelocityScore, isRoleFlagged, ACTIVE_STAGES) so mobile scorecards
// match the desktop People Scorecards page precisely.
//
// Layout:
//   - Talent Partner  -> their single scorecard.
//   - DM / Admin       -> a SWIPE CAROUSEL of scorecards (one per TP), with
//     position dots, a "n / total" counter and the TP name, so you always
//     know where you are.
//
// Role scoping mirrors desktop renderScorecardsPage:
//   TP   = own only
//   DM   = TPs assigned to their projects
//   admin/leadership = all

// Local copy of the desktop getScopedTpEmails (which lives in
// analytics-pages.js alongside DOM code we don't load on mobile). Only needs
// getUserProjectIds + getTalentPartnersForProject, both already available.
async function mobileScopedTpEmails(userEmail) {
  const projectIds = await getUserProjectIds(userEmail);
  if (projectIds === null) return null; // unrestricted (admin)
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

// Carousel state for the current render.
let _mScCards = [];   // array of { name, html }
let _mScIndex = 0;

async function mobileRenderScorecards(main) {
  mobileSetTitle('People', 'Scorecards');
  main.innerHTML = '<div class="m-empty">Loading scorecards...</div>';

  try {
    const [activityRaw, historical, tpMap, allRoles] = await Promise.all([
      getActivityForAnalytics(13),
      getHistoricalPlacements(),
      getTalentPartnerDisplayMap(),
      getAllRoles(),
    ]);

    let tpEmails = [...new Set(activityRaw.map(a => a.TalentPartner).filter(Boolean))];
    tpEmails = await filterToActiveTpEmails(tpEmails, tpMap);

    // Role-based scoping (same rules as desktop).
    if (_mobileRole === 'talent_partner') {
      const myEmail = (getCurrentUser().email || '').toLowerCase();
      tpEmails = tpEmails.filter(e => e.toLowerCase() === myEmail);
    } else if (_mobileRole === 'delivery_manager') {
      const allowed = await mobileScopedTpEmails(getCurrentUser().email);
      if (allowed !== null) {
        tpEmails = tpEmails.filter(e => allowed.has(e.toLowerCase()));
      }
    }

    if (!tpEmails.length) {
      main.innerHTML = '<div class="m-empty">No activity recorded in the last 13 weeks.</div>';
      return;
    }

    const benchmarks = CONFIG.ANALYTICS_BENCHMARKS;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 91);
    const recentPlacements = historical.filter(r =>
      r.placementDate && new Date(r.placementDate) >= cutoff);

    // Build one card per TP.
    _mScCards = tpEmails.map(tpEmail => {
      const tpActivity   = activityRaw.filter(a => a.TalentPartner === tpEmail);
      const tpPlacements = recentPlacements.filter(r => tpMatches(r.tpEmail, tpEmail));
      const scorecard    = computeVelocityScore(tpEmail, tpActivity, tpPlacements, benchmarks);
      const tpRoles = allRoles.filter(r => !ACTIVE_STAGES.includes(r.Stage) &&
        tpMatches(r.TalentPartner, tpEmail));
      const flaggedRoles = tpRoles.filter(r => {
        const acts = activityRaw.filter(a => String(a.RoleIDLookupId) === String(r.id));
        return isRoleFlagged(r, acts);
      }).length;
      const flaggedPct = tpRoles.length ? flaggedRoles / tpRoles.length : null;
      const flaggedRag = flaggedPct === null ? 'grey'
        : flaggedPct < 0.25 ? 'green'
        : flaggedPct <= 0.50 ? 'amber' : 'red';
      const name = tpMap[tpEmail.toLowerCase()] || tpEmail;
      return {
        name,
        html: mScCardHtml(scorecard, name, { total: tpRoles.length, flagged: flaggedRoles, rag: flaggedRag }),
      };
    });

    _mScIndex = 0;

    // Single card (TP) -> no carousel chrome.
    if (_mScCards.length === 1) {
      main.innerHTML = `<div class="m-sc-single">${_mScCards[0].html}</div>`;
      return;
    }

    // Multiple cards (DM/admin) -> swipe carousel.
    main.innerHTML = `
      <div class="m-sc-carousel" id="m-sc-carousel">
        <div class="m-sc-track" id="m-sc-track">
          ${_mScCards.map(c => `<div class="m-sc-slide">${c.html}</div>`).join('')}
        </div>
      </div>
      <div class="m-sc-controls">
        <button class="m-sc-arrow" id="m-sc-prev" onclick="mScGo(_mScIndex - 1)" aria-label="Previous">&#8249;</button>
        <div class="m-sc-counter" id="m-sc-counter"></div>
        <button class="m-sc-arrow" id="m-sc-next" onclick="mScGo(_mScIndex + 1)" aria-label="Next">&#8250;</button>
      </div>
      <div class="m-sc-dots" id="m-sc-dots"></div>
    `;

    mScSetupSwipe();
    mScRender();
  } catch (e) {
    main.innerHTML = `<div class="m-empty">Error loading scorecards: ${e.message}</div>`;
  }
}

// Compact scorecard card using the mobile look (mirrors desktop panel).
function mScCardHtml(scorecard, displayName, roleHealth) {
  const overallRag = roleHealth ? roleHealth.rag : 'grey';

  const ragColour = (rag) => ({
    green: '#2e7d32', amber: '#b45309', red: '#c62828', grey: '#888',
  }[rag] || '#888');

  const healthRow = roleHealth ? (() => {
    const display = roleHealth.total > 0 ? `${roleHealth.flagged}/${roleHealth.total}` : '-';
    return `<tr>
      <td class="m-sc-metric">Flagged roles</td>
      <td class="m-sc-val" style="color:${ragColour(roleHealth.rag)}">${display}</td>
    </tr>`;
  })() : '';

  const rows = scorecard.metrics.map(m => {
    const display = m.value !== null ? `${m.value}${m.unit === '%' ? '%' : ' ' + m.unit}` : '-';
    const colour  = m.informational ? '#888' : ragColour(m.rag);
    return `<tr>
      <td class="m-sc-metric">${m.label}</td>
      <td class="m-sc-val" style="color:${colour}">${display}</td>
    </tr>`;
  }).join('');

  return `
    <div class="m-detail-panel" style="margin-bottom:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <div class="m-detail-value" style="margin-bottom:0">${displayName}</div>
        <span class="m-sc-pill" style="background:${ragColour(overallRag)}">${overallRag.toUpperCase()}</span>
      </div>
      <div class="m-detail-label">Rolling Quarterly View</div>
      <table class="m-sc-table"><tbody>${healthRow}${rows}</tbody></table>
    </div>`;
}

// --- carousel behaviour ---

function mScGo(i) {
  const n = _mScCards.length;
  _mScIndex = Math.max(0, Math.min(n - 1, i));
  mScRender();
}

function mScRender() {
  const track = document.getElementById('m-sc-track');
  if (track) track.style.transform = `translateX(-${_mScIndex * 100}%)`;

  const counter = document.getElementById('m-sc-counter');
  if (counter) counter.textContent =
    `${_mScIndex + 1} / ${_mScCards.length} · ${_mScCards[_mScIndex].name}`;

  const prev = document.getElementById('m-sc-prev');
  const next = document.getElementById('m-sc-next');
  if (prev) prev.disabled = _mScIndex === 0;
  if (next) next.disabled = _mScIndex === _mScCards.length - 1;

  const dots = document.getElementById('m-sc-dots');
  if (dots) {
    dots.innerHTML = _mScCards.map((_, i) =>
      `<button class="m-sc-dot ${i === _mScIndex ? 'active' : ''}" onclick="mScGo(${i})" aria-label="Go to ${i + 1}"></button>`
    ).join('');
  }
}

// Touch swipe on the carousel.
function mScSetupSwipe() {
  const el = document.getElementById('m-sc-carousel');
  if (!el) return;
  let startX = 0, startY = 0, tracking = false;

  el.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    startX = t.clientX; startY = t.clientY; tracking = true;
  }, { passive: true });

  el.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    // Horizontal swipe only (ignore vertical scrolls). Threshold 40px.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) mScGo(_mScIndex + 1);  // swipe left -> next
      else        mScGo(_mScIndex - 1);  // swipe right -> prev
    }
  }, { passive: true });
}
