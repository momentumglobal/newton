// js/home-banner.js - Command Centre banner on the home page (admin / leadership).
// Split out of js/home.js by N-323. Owns: the badge pills, the CCStatus write
// and the roleFlag / ccRed notifications raised while computing the RAGs.
// refreshCCBanner is registered as a UI action in js/home.js (registerActions),
// so this file MUST load before home.js. Loaded on index.html only; needs
// analytics.js (isRoleFlagged, flaggedShareRAG, computeRevenueRAG),
// notifications.js and api.js.

function ccBadgeHTML(rag, label) {
  // N-254: same marker glyph as the CC tile for the same state, plus a
  // title naming the status so the pill is readable without colour.
  const marker = CONFIG.RAG_MARKERS[rag];
  const status = marker ? marker.label : rag === 'green' ? 'On track' : 'No data';
  return `<span class="cc-badge cc-badge--${rag}" title="${label}: ${status}">${ragMarkerHTML(rag)}${label}</span>`;
}

async function refreshCCBanner() {
 const [roles, acts13, forecasts, assigns, people, projects, stageRows] = await Promise.all([
  getAllRoles(),
  getActivityForAnalytics(13),
  getItems('SalesForecasts'),
  getItems('Assignments'),
  getPeople(false),
  getItems('Projects'),
  getRoleStageHistory().catch(e => { console.warn('N-274: stage history read failed', e); return []; })
 ]);
 // N-285: read straight after the Promise.all — see wasListDenied(). With no
 // forecast access, util/revenue must not be computed from an empty list.
 const forecastsDenied = wasListDenied('SalesForecasts');
 // N-274: time-in-stage flag — same inputs as the Command Centre Health tile.
 const stageHistory = groupStageHistoryByRole(stageRows);
 const projectsById = Object.fromEntries(projects.map(pr => [String(pr.id), pr]));
  
  // Project Health RAG — N-274: each open role is evaluated once; the same
  // result drives its roleFlag notification and the flagged count.
  // N-333 (D-3): every open role is still evaluated for its roleFlag
  // notification — internal-project roles included — but only client roles
  // count toward the Health RAG.
  const clientRoleIds = new Set(excludeInternalProjectData({ roles }, { projects }).roles.map(r => String(r.id)));
  const open = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage));
  const clientOpenCount = open.filter(r => clientRoleIds.has(String(r.id))).length;
  let flagged = 0;
  for (const role of open) {
    const acts = acts13.filter(a => String(a.RoleIDLookupId) === String(role.id));
    const key = `flag:${role.id}`;
    if (isRoleFlagged(role, acts, stageHistory)) {
      if (clientRoleIds.has(String(role.id))) flagged++;
      const projId = String(role.ProjectIDLookupId || role.ProjectID);
      const proj = projectsById[projId];
      await fireNotification({ triggerType:'roleFlag', triggerKey:key,
        tone:'attention', deepLink:`reporting.html#role-${role.id}`,
        body:`Role flagged: ${role.RoleTitle} needs attention`,
        recipients:[role.TalentPartner, proj && proj.DeliveryManager] });
    } else { await clearNotification(key); }
  }
  // Thresholds: CONFIG.ROLE_FLAG.healthRag (shared with cc-pages.js).
  const ragHealth = flaggedShareRAG(flagged, clientOpenCount);

  // N-275 / N-274 decision (2 Oct 2026): the People badge stays unrated for a
  // quarter of time-in-stage data.
  // 'neutral' is the badge's no-data state and what CCStatus already stores for
  // "no value" — and writing it below clears any stale 'red' (and its ccRed
  // notification) via the existing prev === 'red' branch.
  const ragPeople = 'neutral';

  // Utilisation RAG - shared with the CC Utilisation tile (analytics.js, N-325)
  const ragUtil = computeUtilisationRAG(forecasts, assigns, people);

  // Revenue RAG - shared with the CC Revenue tile (analytics.js, N-323)
  const ragRevenue = computeRevenueRAG(forecasts, assigns);

  // Write to CCStatus SP list
  // N-285: util and revenue both depend on SalesForecasts. When this account
  // cannot read it, leave their CCStatus rows and any ccRed notification
  // exactly as they were — missing data must not raise (or clear) an alert.
  const statuses = [
    { title: 'health',  rag: ragHealth  },
    { title: 'people',  rag: ragPeople  },
    { title: 'util',    rag: ragUtil,    skip: forecastsDenied },
    { title: 'revenue', rag: ragRevenue, skip: forecastsDenied },
  ];
  const existing = await getItems('CCStatus');
  const ccRecipients = await getCcRecipients();
  for (const s of statuses) {
    if (s.skip) continue;
    const match = existing.find(e => e.Title === s.title);
    const prev  = match ? match.RAG : 'neutral';
    const key   = `ccred:${s.title}`;
    if (s.rag === 'red' && prev !== 'red') {
      await fireNotification({ triggerType:'ccRed', triggerKey:key,
        tone:'attention', deepLink:`command-centre.html#${s.title}`,
        body:`Command Centre: ${s.title} is now RED`,
        recipients: ccRecipients });
    } else if (s.rag !== 'red' && prev === 'red') {
      await clearNotification(key);
    }
    if (match) { await updateItem('CCStatus', match.id, { RAG: s.rag }); }
    else        { await createItem('CCStatus', { Title: s.title, RAG: s.rag }); }
  }


  renderCCBadges(ragHealth, ragPeople, forecastsDenied ? 'neutral' : ragUtil, forecastsDenied ? 'neutral' : ragRevenue);
}

function renderCCBadges(health, people, util, revenue) {
  const el = document.getElementById('cc-banner-slot');
  if (!el) return;
  el.innerHTML = `
    <a href="command-centre.html" class="cc-home-banner">
      <div class="cc-home-banner__top">
        <div class="cc-home-banner__title">Command Centre</div>
        <button class="cc-refresh" title="Refresh"${act('refreshCCBanner.prevent')}>↻</button>
      </div>
      <div class="cc-home-banner__sub">Executive Operations View</div>
      <div class="cc-home-banner__badges">
        ${ccBadgeHTML(revenue, 'Revenue')}
        ${ccBadgeHTML(health,  'Projects')}
        ${ccBadgeHTML(people,  'People')}
        ${ccBadgeHTML(util,    'Utilisation')}
      </div>
    </a>`;
}

async function renderCommandCentreBanner(role) {
  if (role !== 'admin' && role !== 'leadership') return;

  // Show last-known state from SP immediately
  const existing = await getItems('CCStatus');
  if (existing.length) {
    const get = key => (existing.find(e => e.Title === key) || {}).RAG || 'neutral';
    renderCCBadges(get('health'), get('people'), get('util'), get('revenue'));
  } else {
    renderCCBadges('neutral', 'neutral', 'neutral', 'neutral');
  }
}