// js/home.js - moved out of index.html (N-303, SEC-12b step 3). Code unchanged except
// the registerActions call (now top level, no DOMContentLoaded wrapper).
    // N-298: home tiles come from CONFIG.OS_MODULES (config.js) — one role list
    // for the switcher and the home grid.

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
  const open = roles.filter(r => !ACTIVE_STAGES.includes(r.Stage));
  let flagged = 0;
  for (const role of open) {
    const acts = acts13.filter(a => String(a.RoleIDLookupId) === String(role.id));
    const key = `flag:${role.id}`;
    if (isRoleFlagged(role, acts, stageHistory)) {
      flagged++;
      const projId = String(role.ProjectIDLookupId || role.ProjectID);
      const proj = projectsById[projId];
      await fireNotification({ triggerType:'roleFlag', triggerKey:key,
        tone:'attention', deepLink:`reporting.html#role-${role.id}`,
        body:`Role flagged: ${role.RoleTitle} needs attention`,
        recipients:[role.TalentPartner, proj && proj.DeliveryManager] });
    } else { await clearNotification(key); }
  }
  // Thresholds: CONFIG.ROLE_FLAG.healthRag (shared with cc-pages.js).
  const ragHealth = flaggedShareRAG(flagged, open.length);

  // N-275 / N-274 decision (2 Oct 2026): the People badge stays unrated for a
  // quarter of time-in-stage data.
  // 'neutral' is the badge's no-data state and what CCStatus already stores for
  // "no value" — and writing it below clears any stale 'red' (and its ccRed
  // notification) via the existing prev === 'red' branch.
  const ragPeople = 'neutral';

  // Utilisation RAG — forecast over next 13 weeks
  const t = CONFIG.UTILISATION_THRESHOLDS;
  const now = new Date();
  const horizon = new Date(now.getTime() + 91 * 86400000);
  const totalActiveHeadcount = people.filter(p => p.IsActive !== false && ['SDM','STP','TP'].includes(p.Level)).length;
  const known13 = assigns.filter(a => {
    if (!a.StartDate || !a.EndDate) return false;
    const s = new Date(a.StartDate); const e = new Date(a.EndDate);
    return s <= horizon && e >= now && a.Level !== 'CSD';
  });
  const totalCap  = known13.reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
  const billedCap = known13.filter(a => a.Billed === 'Yes').reduce((s, a) => s + (a.MonthlyCapacity || 1), 0);
  const knownUtil = totalCap > 0 ? billedCap / totalCap : 0;
  const forecastedHC = forecasts.reduce((sum, f) => {
    const s = new Date(f.ForecastStartDate); const e = new Date(f.ForecastEndDate);
    return (s <= horizon && e >= now) ? sum + (f.ForecastedHeadcount || 0) : sum;
  }, 0);
  const forecastUtil = Math.min(knownUtil + (totalActiveHeadcount > 0 ? forecastedHC / totalActiveHeadcount : 0), 1.0);
  const ragUtil = forecastUtil >= t.green ? 'green' : forecastUtil >= t.amber ? 'amber' : 'red';

  // Revenue RAG — 3-month avg of estimated + forecast (matches CC Revenue tile)
  const rt = CONFIG.REVENUE_THRESHOLDS;
  const revYear   = now.getFullYear();
  const revEst    = computeMonthlyRevenueForYear(assigns, revYear);
  const revFcast  = computeMonthlyForecastRevenueForYear(forecasts, revYear);
  const revM      = now.getMonth();
  const revIdxs   = [revM, revM + 1, revM + 2].filter(i => i <= 11);
  const revForecast = revIdxs.reduce((s, i) => s + revEst[i] + revFcast[i], 0) / revIdxs.length;
  const ragRevenue = revForecast >= rt.green ? 'green' : revForecast >= rt.amber ? 'amber' : 'red';

  // Write to CCStatus SP list

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
    
    async function initSurveyWidget(email) {
      const run = await getActiveSurveyRun();
      if (!run) return;

      const completed = await hasCompletedSurvey(run.id, email);
      if (completed) return;

      // N-131: whole CALENDAR days, not a millisecond subtraction. Both sides
      // are UTC-midnight Dates for a calendar day, so this is exact and has no
      // time-of-day component — with OpenDate now stored at midday UTC, the old
      // ms arithmetic would have returned one day fewer for part of every day
      // and fired the reminder late.
      const daysSince  = Math.floor(
        (utcDateOnly(localDayISO()) - utcDateOnly(run.OpenDate)) / 86400000);
      const isReminder = daysSince >= CONFIG.SURVEY.REMINDER_DAY;

      const slot = document.getElementById('survey-widget-slot');
      if (!slot) return;

      slot.innerHTML = `
        <div class="survey-widget${isReminder ? ' survey-widget--reminder' : ''}">
          ${isReminder ? '<span class="survey-widget-badge">Reminder</span>' : ''}
          <div class="survey-widget-title">${escHtml(run.Title || 'Team Survey')}</div>
          <div class="survey-widget-desc">${isReminder
            ? escHtml(CONFIG.SURVEY.WIDGET_DESC_REMINDER)
            : escHtml(CONFIG.SURVEY.WIDGET_DESC)}</div>
          <a href="survey.html" class="survey-widget-cta">Start Survey</a>
        </div>`;
      lucide.createIcons();
    }

    async function initHome() {
      const response = await authReady();
      if (response) {
        const account = response.account || msalInstance.getAllAccounts()[0];
        if (account) {
          localStorage.setItem('userName', account.name);
        }
      }
      if (!isSignedIn()) { window.location.href = 'reporting.html'; return; }
      const user = getCurrentUser();
      const firstName = (user.name || user.email || '').split(' ')[0];
      document.getElementById('home-greeting').textContent = `Welcome back, ${firstName}`;
      const role = await getUserRoleAsync(user.email);
      initCommandBar({ currentModule: 'home', role, navigateFn: null });
      const visible = CONFIG.OS_MODULES
        .filter(m => m.homeOrder != null && m.roles.includes(role))
        .sort((a, b) => a.homeOrder - b.homeOrder);
      const grid = document.getElementById('module-grid');
      if (visible.length === 1) grid.classList.add('single');
      grid.innerHTML = visible.map(m => `
        <${m.live ? `a href="${m.href}"` : 'div'} class="module-card${m.live ? '' : ' disabled'}">
          <i data-lucide="${m.icon}" class="module-icon"></i>
          <div class="module-name">${m.name}</div>
          <div class="module-desc">${m.desc}</div>
          <span class="module-badge ${m.live ? 'badge-live' : 'badge-soon'}">${m.live ? 'Live' : 'Coming soon'}</span>
        </${m.live ? 'a' : 'div'}>
      `).join('');
      // N-281: no auto-registration any more — a user with no role sees why
      // instead of an empty grid.
      if (!visible.length) {
        grid.classList.add('single');
        grid.innerHTML = `<div class="module-card module-card--static">
          <i data-lucide="lock" class="module-icon"></i>
          <div class="module-name">No access yet</div>
          <div class="module-desc">Your account isn't set up in Newton yet. Ask a Newton admin to add you.</div>
        </div>`;
      }
      lucide.createIcons();
      if (role === 'admin') {
        const adminLink = document.getElementById('admin-link');
        if (adminLink) adminLink.style.display = 'block';
      }

      // NEW: CC banner for Admin/Leadership
      await renderCommandCentreBanner(role);
      renderGhostBanner();
      setTimeout(() => initQuickLinks(role), 0);
      renderNotificationBell();

      // Survey widget — TP and DM only
      if (['talent_partner', 'delivery_manager'].includes(role)) {
        initSurveyWidget(user.email);
      }

      // Survey closing notification — Admin and Leadership only
      if (['admin', 'leadership'].includes(role)) {
        const run = await getActiveSurveyRun();
      if (run && run.CloseDate) {
        // N-131: a run closing on the 20th is open THROUGH the 20th, so count
        // to the END of the close date, not 00:00 on it as before. No 'Z' on the
        // string — a date-time without an offset parses as LOCAL, which is what
        // "end of the close date where the user is" means. Appending 'Z' would
        // make it 01:00 the next morning during BST.
        const closesAt = new Date(spDateIn(run.CloseDate) + 'T23:59:59');
        const hrsLeft  = (closesAt - Date.now()) / 3600000;
      if (hrsLeft > 0 && hrsLeft <= 48) {
        await fireNotification({ triggerType:'surveyClose',
          triggerKey:`surveyclose:${run.id}`, tone:'attention',
          deepLink:'people.html#engagement',
          body:`Pulse survey closes in ${Math.round(hrsLeft)}h`,
          recipients: await getCcRecipients() });
        }
       }
      }
      
      // Load announcement banner
      getAnnouncementMessage().then(msg => {
        const ticker = document.getElementById('announcement-ticker');
        const inner  = document.getElementById('announcement-ticker-inner');
        const text   = (msg || '').trim();
        if (ticker && inner && text) {
          inner.textContent = text;
          ticker.classList.add('visible');
        }
      });
    }
    function handleSignOut() { signOut(); }
    function openQuickLinks() {
      document.getElementById('ql-drawer').classList.add('open');
      document.getElementById('ql-overlay').classList.add('open');
    }
    function closeQuickLinks() {
      document.getElementById('ql-drawer').classList.remove('open');
      document.getElementById('ql-overlay').classList.remove('open');
    }
    function initQuickLinks(role) {
      const links = (CONFIG.QUICK_LINKS || []).filter(l => l.roles.includes(role));
      if (!links.length) return;
      const trigger = document.getElementById('ql-trigger');
      if (trigger) { trigger.style.display = 'flex'; lucide.createIcons(); }
      const container = document.getElementById('ql-links');
      if (!container) return;
      container.innerHTML = links.map(l => `
        <a class="ql-link" href="${l.href}">
          <i data-lucide="${l.icon}" class="ql-link-icon"></i>
          <span>${l.label}</span>
        </a>
      `).join('');
      lucide.createIcons();
    }
    // N-303: this file loads (deferred) after js/actions.js, so the actions are
    // registered at top level - no DOMContentLoaded wrapper needed.
    registerActions({
      openQuickLinks,
      closeQuickLinks,
      handleSignOut,
      refreshCCBanner,
    });
    document.addEventListener('DOMContentLoaded', initHome);