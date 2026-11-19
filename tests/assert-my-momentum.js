// tests/assert-my-momentum.js — My Momentum shell + entry points (N-451 / MM-1).
// Loads late and pushes into ASSERTIONS. Pure logic and markup run everywhere; the source-text checks
// need ALL_SOURCES / ALL_HTML (tests/run.js) and skip in the browser harness.

const _MM_ROLES = ['admin', 'leadership', 'people_ops', 'sales', 'delivery_manager', 'talent_partner', 'staff'];
const _MM_ALL_LIVE = CONFIG.MY_MOMENTUM.TABS.map(t => Object.assign({}, t, { live: true }));
const _mmKeys = list => list.map(t => t.key);

ASSERTIONS.push(
  {
    name: 'N-451 AC7/AC10 config: OS_MODULES entry (all seven roles, no home tile) + Command Bar entry mirror it',
    fn: function () {
      const mod = CONFIG.OS_MODULES.find(m => m.key === 'myMomentum');
      _assertEqual(!!mod, true, 'AC7 OS_MODULES has myMomentum');
      _assertEqual(mod.href, 'my-momentum.html', 'AC7 href');
      _assertEqual(mod.live, true, 'AC7 live');
      _assertEqual(mod.roles, _MM_ROLES, 'AC7 all seven roles, no viewer');
      _assertEqual(mod.homeOrder, undefined, 'AC7 no home-grid tile (no homeOrder)');
      _assertEqual(mod.desc, undefined, 'AC7 no home-grid description');
      const cb = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'myMomentum');
      _assertEqual(!!cb, true, 'AC10 Command Bar page entry exists');
      _assertEqual(cb.module, 'myMomentum', 'AC10 module key');
      _assertEqual(cb.href, 'my-momentum.html', 'AC10 href');
      _assertEqual(cb.roles, mod.roles, 'AC10 Command Bar roles mirror OS_MODULES');
    },
  },
  {
    name: 'N-451 AC3/AC6 config: tab registry — History, Details, Scorecard, Development and Team are live (N-452, N-453, N-456); order is the landing order',
    fn: function () {
      const T = CONFIG.MY_MOMENTUM.TABS;
      _assertEqual(_mmKeys(T), ['myHistory', 'myDetails', 'myScorecard', 'myDevelopment', 'myTeam'], 'AC6 order');
      _assertEqual(T.filter(t => t.live).map(t => t.key), ['myHistory', 'myDetails', 'myScorecard', 'myDevelopment', 'myTeam'], 'AC3 live tabs (later tasks flip their own flag)');
      _assertEqual(CONFIG.MY_MOMENTUM.ALL_STAFF_ROLES, ['admin', 'leadership', 'people_ops'], 'AC6 all-staff roles (MM-D8)');
    },
  },
  {
    name: 'N-451 AC4 mmTabState: ok / ambiguous / notLinked',
    fn: function () {
      _assertEqual(mmTabState({ me: { id: 1 }, flags: {} }), 'ok', 'one row');
      _assertEqual(mmTabState({ me: null, flags: { ambiguous: true } }), 'ambiguous', 'two rows share the email');
      _assertEqual(mmTabState({ me: null, flags: { noRow: true } }), 'notLinked', 'no row');
      _assertEqual(mmTabState(null), 'notLinked', 'null identity');
      _assertEqual(mmTabState(undefined), 'notLinked', 'undefined identity');
    },
  },
  {
    name: 'N-451 AC6 / N-452 mmVisibleTabs: live gate, relevance rules; My Team follows pdpTeam alone, with or without a People row',
    fn: function () {
      const live = CONFIG.MY_MOMENTUM.TABS;
      const all = { hasActivity: true, pdpMy: true, pdpTeam: true };
      const detailsOff = live.map(t => (t.key === 'myDetails' ? Object.assign({}, t, { live: false }) : t));
      _assertEqual(_mmKeys(mmVisibleTabs(detailsOff, { state: 'ok', role: 'talent_partner', signals: all })), ['myHistory', 'myScorecard', 'myDevelopment', 'myTeam'], 'a live:false tab never appears, even with every signal true');
      _assertEqual(_mmKeys(mmVisibleTabs(live, { state: 'ok', role: 'talent_partner', signals: all })), ['myHistory', 'myDetails', 'myScorecard', 'myDevelopment', 'myTeam'], 'every live tab, with every signal true (N-456: My Details is live)');
      _assertEqual(_mmKeys(mmVisibleTabs(live, { state: 'ok', role: 'talent_partner', signals: {} })), ['myHistory', 'myDetails'], 'no PDP signal: My History and My Details');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'talent_partner', signals: {} })), ['myHistory', 'myDetails'], 'ok state: History + Details only');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'talent_partner', signals: all })), ['myHistory', 'myDetails', 'myScorecard', 'myDevelopment', 'myTeam'], 'everything relevant, registry order');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'staff', signals: { hasActivity: true } })), ['myHistory', 'myDetails', 'myScorecard'], 'Scorecard needs hasActivity');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'staff', signals: { pdpMy: true } })), ['myHistory', 'myDetails', 'myDevelopment'], 'Development needs pdpMy');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'delivery_manager', signals: { pdpTeam: true } })), ['myHistory', 'myDetails', 'myTeam'], 'My Team needs pdpTeam');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'delivery_manager', signals: { hasReports: true } })).includes('myTeam'), true, 'N-453 hasReports opens My Team (Team Scorecards) with no pdpTeam');
      ['admin', 'people_ops'].forEach(r => {
        _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'notLinked', role: r, signals: { pdpTeam: true } })), ['myDetails', 'myTeam'], r + ' with pdpTeam gets My Team (and, N-456, the My Details picker) with no People row');
        _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'error', role: r, signals: { pdpTeam: true } })), ['myDetails', 'myTeam'], r + ' keeps My Team and the My Details picker when the identity read failed');
      });
      ['admin', 'leadership', 'people_ops'].forEach(r =>
        {
          _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'notLinked', role: r, signals: {} })), r === 'leadership' ? ['myTeam'] : ['myDetails', 'myTeam'], 'N-453 ' + r + ' without pdpTeam or a People row: My Team, for Team Scorecards (MM-D8); N-456 adds the My Details picker for Admin / People Ops');
          _assertEqual(mmTeamSubTabs({ state: 'notLinked', role: r, signals: {} }).map(t => t.key), ['scorecards'], r + ' without pdpTeam: Team Scorecards only - never Development (PDP-D1)');
        });
      ['talent_partner', 'delivery_manager', 'staff', 'sales'].forEach(r =>
        _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: r, signals: {} })).includes('myTeam'), false, r + ' without pdpTeam has no My Team'));
      ['notLinked', 'ambiguous', 'error'].forEach(s =>
        _assertEqual(mmVisibleTabs(_MM_ALL_LIVE, { state: s, role: 'staff', signals: {} }), [], s + ' + ordinary role: nothing to show'));
      _assertEqual(mmVisibleTabs(null, null), [], 'null-safe');
      _assertEqual(mmLandingTab(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'staff', signals: {} })), 'myHistory', 'landing is the first visible tab');
      _assertEqual(mmLandingTab(mmVisibleTabs(_MM_ALL_LIVE, { state: 'notLinked', role: 'admin', signals: { pdpTeam: true } })), 'myDetails', 'Admin with no People row lands on the first visible tab, My Details (N-456: its picker is their way in), not the no-record panel');
      _assertEqual(mmLandingTab([]), null, 'nothing visible: no landing');
    },
  },
  {
    name: 'N-451 AC1 router: access = the OS_MODULES role list; pages = the tab registry',
    fn: function () {
      _MM_ROLES.forEach(r => _assertEqual(mmCanAccess('myHistory', r), true, r + ' can open My History'));
      _assertEqual(mmCanAccess('myHistory', 'viewer'), false, 'viewer cannot');
      _assertEqual(mmCanAccess('nonsense', 'admin'), false, 'unknown page');
      _assertEqual(getMmAccessiblePages('staff').map(p => p.key), _mmKeys(CONFIG.MY_MOMENTUM.TABS), 'pages = tabs');
      _assertEqual(getMmAccessiblePages('viewer'), [], 'viewer gets no pages');
    },
  },
  {
    name: 'N-451 AC4 markup: no-record panel has three distinct messages (the History stub was replaced by N-455)',
    fn: function () {
      const a = mmNoRecordHtml('notLinked'), b = mmNoRecordHtml('ambiguous'), c = mmNoRecordHtml('error');
      _assertEqual(a.includes('Not linked to an employee record'), true, 'AC4 not linked');
      _assertEqual(b.includes('More than one employee record'), true, 'AC4 ambiguous');
      _assertEqual(c.includes('couldn’t load'), true, 'AC4 error');
      _assertEqual(new Set([a, b, c]).size, 3, 'AC4 three different panels');
    },
  },
  {
    name: 'N-451 AC1/AC12 shell: my-momentum.html script order, no inline script, no analytics, not in the mobile launcher',
    fn: function () {
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') _skip('needs ALL_HTML / ALL_SOURCES (tests/run.js)');
      const html = ALL_HTML['my-momentum.html'];
      _assertEqual(typeof html, 'string', 'my-momentum.html exists');
      const srcs = (html.match(/<script src="js\/[^"]+"/g) || []).map(s => s.replace('<script src="js/', '').replace('"', ''));
      const order = ['config.js', 'actions.js', 'auth.js', 'utils.js', 'ui-kit.js', 'permissions.js', 'project-team.js', 'pdp-identity.js', 'graph-client.js', 'api.js', 'api-pdp-core.js', 'api-pdp.js',
        'my-momentum-logic.js', 'my-momentum-router.js', 'nav-core.js', 'command-bar.js', 'notifications.js', 'my-momentum-nav.js', 'my-momentum-pages.js', 'my-momentum-scorecard.js', 'my-momentum-app.js'];
      let last = -1;
      order.forEach(f => {
        const i = srcs.indexOf(f);
        _assertEqual(i > last, true, f + ' loads, in order (position ' + i + ' after ' + last + ')');
        last = i;
      });
      _assertEqual(srcs[srcs.length - 1], 'my-momentum-app.js', 'app init loads last');
      _assertEqual(/<script(?![^>]*\bsrc=)[^>]*>/.test(html), false, 'no inline <script>');
      _assertEqual(srcs.includes('analytics.js') && srcs.indexOf('analytics.js') < srcs.indexOf('my-momentum-logic.js'), true, 'N-453 analytics.js is loaded here, before the My Momentum files (the scorecard maths)');
      ['analytics-pages.js', 'pdp-setup.js', 'pdp-calibrate-ui.js'].forEach(f => _assertEqual(srcs.includes(f), false, f + ' is not loaded here (analytics-pages.js is retired by N-453; PDP Setup stays in People)'));
      _assertEqual(html.includes('id="breadcrumb-bar"') && html.includes('id="main-content"') && html.includes('id="sidebar"'), true, 'shell markup');
      _assertEqual(ALL_SOURCES['mobile-home.js'].includes('myMomentum') || ALL_SOURCES['mobile-app.js'].includes('myMomentum'), false, 'AC7 not in the mobile launcher');
    },
  },
  {
    name: 'N-451 AC8/AC9 entry points: home card is a link with no stats; sidebar name block links, bell stays outside',
    fn: function () {
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') _skip('needs ALL_HTML / ALL_SOURCES (tests/run.js)');
      const home = ALL_HTML['index.html'];
      const hero = /<section class="home-hero"[^>]*>([\s\S]*?)<\/section>/.exec(home);
      _assertEqual(!!hero, true, 'N-459 AC4 hero card exists');
      _assertEqual(home.includes('home-greeting-card'), false, 'N-459 AC4 the N-451 greeting card is gone');
      _assertEqual(/<a class="home-hero-cta" href="my-momentum\.html">Step into My Momentum<\/a>/.test(hero[0]), true, 'N-459 AC4 the CTA is the one link, to My Momentum');
      _assertEqual((hero[0].match(/<a /g) || []).length, 1, 'N-459 AC4 the card itself is not a link');
      _assertEqual(hero[1].includes('id="home-greeting"') && hero[1].includes('id="home-hero-wm"'), true, 'N-459 AC4 greeting and wordmark nodes (home.js fills them)');
      _assertEqual(/StartDate|since|completed|hires/i.test(hero[1]), false, 'N-459 AC4 no join date or stats on the hero (MM-D2)');
      _assertEqual(home.indexOf('class="home-subtitle"') < home.indexOf('class="home-hero"') && home.indexOf('class="home-hero"') < home.indexOf('id="module-grid"'), true, 'N-459 A8 hero sits below the Newton title, above the module grid');
      _assertEqual(/mmGreetingText\(user\.name/.test(ALL_SOURCES['home.js']) && ALL_SOURCES['home.js'].includes("mmWordmarkHTML('onDark')") && !ALL_SOURCES['home.js'].includes('Welcome back,'), true, 'N-459 AC5 home.js: time-of-day greeting from the account name only, wordmark filled');
      const nav = ALL_SOURCES['nav-core.js'];
      const m = /<div class='nav-user'>[\s\S]*?<div class='nav-notif-slot' id='notif-slot'><\/div>\s*<\/div>/.exec(nav);
      _assertEqual(!!m, true, 'AC9 nav-user block found');
      const user = m[0];
      _assertEqual(/<a class='nav-user-link' href='my-momentum\.html'/.test(user), true, 'AC9 name block is a link to My Momentum');
      _assertEqual(/<\/a>\s*<div class='nav-notif-slot'/.test(user), true, 'AC9 the bell slot sits after the closing </a>, outside the link');
      _assertEqual(user.includes("aria-current='page'"), true, 'AC9 aria-current on My Momentum itself');
    },
  },
  {
    name: 'N-451 AC11 / N-452 AC6 / N-453 AC1 People links: PDP Setup untouched, the two PDP pages and People Scorecards are gone',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      const r = ALL_SOURCES['people-router.js'];
      _assertEqual(r.includes('pdpSetup:'), true, 'people-router.js still registers pdpSetup:');
      ['myDevelopment:', 'teamDevelopment:', 'scorecards:'].forEach(k => _assertEqual(r.includes(k), false, 'people-router.js no longer registers ' + k + ' (N-452 / N-453)'));
      _assertEqual(CONFIG.COMMAND_BAR_PAGES.some(p => p.key === 'scorecards'), false, 'N-453 no People Scorecards Command Bar entry');
    },
  },
  {
    name: 'N-452 AC7/AC9 config: redirect map, reminder links, Command Bar entries now belong to My Momentum',
    fn: function () {
      _assertEqual(CONFIG.MY_MOMENTUM.REDIRECTS, { myDevelopment: 'myDevelopment', teamDevelopment: 'myTeam', scorecards: 'myScorecard' }, 'redirect map (N-453 adds scorecards)');
      Object.values(CONFIG.MY_MOMENTUM.REDIRECTS).forEach(k => _assertEqual(CONFIG.MY_MOMENTUM.TABS.some(t => t.key === k && t.live), true, 'redirect target ' + k + ' is a live tab'));
      _assertEqual(CONFIG.PDP.REMINDERS.LINKS, { MY: 'my-momentum.html#myDevelopment', TEAM: 'my-momentum.html#myTeam' }, 'AC7 reminder links');
      const mod = CONFIG.OS_MODULES.find(m => m.key === 'myMomentum');
      [['myDevelopment', 'my-momentum.html#myDevelopment'], ['myTeam', 'my-momentum.html#myTeam']].forEach(([k, href]) => {
        const e = CONFIG.COMMAND_BAR_PAGES.filter(p => p.key === k);
        _assertEqual(e.length, 1, 'AC9 exactly one Command Bar entry: ' + k);
        _assertEqual([e[0].module, e[0].href, e[0].roles], ['myMomentum', href, mod.roles], 'AC9 ' + k + ' points into My Momentum with the module roles');
      });
      _assertEqual(CONFIG.COMMAND_BAR_PAGES.some(p => p.key === 'teamDevelopment' || /people\.html#(myDevelopment|teamDevelopment)/.test(p.href)), false, 'AC9 nothing points at the old People keys');
    },
  },
  {
    name: 'N-452 AC5 mmRedirectTarget: old People hashes map to the My Momentum tab; anything else stays (with a positive control)',
    fn: function () {
      const map = CONFIG.MY_MOMENTUM.REDIRECTS;
      _assertEqual(mmRedirectTarget('#myDevelopment', map), 'myDevelopment', 'My Development');
      _assertEqual(mmRedirectTarget('#teamDevelopment', map), 'myTeam', 'Team Development becomes My Team');
      _assertEqual(mmRedirectTarget('#teamDevelopment?x=1', map), 'myTeam', 'a query string is ignored');
      _assertEqual(['#pdpSetup', '#orgChart', '', '#', undefined, null, '#constructor', '#toString'].map(h => mmRedirectTarget(h, map)), ['', '', '', '', '', '', '', ''], 'everything else stays on People (prototype keys never match)');
      _assertEqual(mmRedirectTarget('#scorecards', map), 'myScorecard', 'N-453 an old People Scorecards link redirects to My Scorecard');
      _assertEqual(mmRedirectTarget('#myDevelopment', null), '', 'null map is safe');
      _assertEqual(mmRedirectTarget('#scorecards', { scorecards: 'myScorecard' }), 'myScorecard', 'control: a listed key does redirect, so the empty results above are not a dead function');
    },
  },
  {
    name: 'N-452 AC5/AC6 People side: registry, nav and init no longer know the PDP pages; redirect runs before sign-in; shared helpers stay loaded',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') _skip('needs ALL_SOURCES / ALL_HTML (tests/run.js)');
      const nav = ALL_SOURCES['people-nav.js'], app = ALL_SOURCES['people-app.js'];
      _assertEqual(/renderMyDevelopmentPage|renderTeamDevelopmentPage|_peopleMyDevNav|_peopleTeamDevNav|resolvePdpNav|'myDevelopment'|'teamDevelopment'/.test(nav + app), false, 'no PDP page or nav flag left in people-nav.js / people-app.js');
      const at = app.indexOf('mmRedirectTarget(');
      _assertEqual(at > -1 && at < app.indexOf('authReady()') && /window\.location\.replace\('my-momentum\.html#'/.test(app), true, 'redirect runs before authReady()');
      const h = ALL_HTML['people.html'];
      ['pdp-my.js', 'pdp-team-page.js', 'pdp-track-ui.js'].forEach(f => _assertEqual(h.includes('js/' + f + '"'), false, f + ' is not loaded on people.html'));
      ['pdp-ui-common.js', 'pdp-assess-ui.js', 'pdp-calibrate-ui.js', 'pdp-setup.js', 'pdp-reminders.js'].forEach(f => _assertEqual(h.includes('js/' + f + '"'), true, f + ' stays on people.html'));
      _assertEqual(h.indexOf('js/pdp-ui-common.js') < h.indexOf('js/pdp-assess-ui.js'), true, 'shared helpers load before the Calibration UI');
      const common = ALL_SOURCES['pdp-ui-common.js'];
      ['_PDPM_STATE_TEXT', '_PDPM_STATE_CLASS', '_pdpmTextHtml', '_pdpmListHtml', '_pdpmYes'].forEach(n => {
        const def = new RegExp('^(const|function) ' + n + '\\b', 'm');
        _assertEqual(def.test(common), true, n + ' is defined in pdp-ui-common.js');
        _assertEqual(def.test(ALL_SOURCES['pdp-my.js']), false, n + ' is no longer defined in pdp-my.js');
      });
      _assertEqual(/document\.|window\.|fetch\(|getItems|graphRequest|PDP(Meetings|Goals|Actions|Cycles|Scores)|#[0-9a-fA-F]{3,8}\b/.test(common.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')), false, 'pdp-ui-common.js is pure markup: no DOM, network, PDP list or hex');
    },
  },
  {
    name: 'N-452 AC1/AC2/AC8 My Momentum wiring: people.css, PDP scripts in order, signals + reminders in init, both pages dispatched',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') _skip('needs ALL_SOURCES / ALL_HTML (tests/run.js)');
      const html = ALL_HTML['my-momentum.html'];
      const at = f => html.indexOf('js/' + f + '"');
      _assertEqual(html.indexOf('css/people.css') > html.indexOf('css/engagement.css') && html.indexOf('css/engagement.css') > -1, true, 'people.css loads after engagement.css');
      const order = ['pdp-identity.js', 'pdp-data.js', 'pdp-cycle.js', 'pdp-prep.js', 'pdp-reminders.js', 'pdp-team.js', 'pdp-track.js', 'pdp-assess.js', 'graph-client.js', 'api-pdp-core.js', 'api-pdp.js',
        'my-momentum-pages.js', 'pdp-ui-common.js', 'pdp-track-ui.js', 'pdp-assess-ui.js', 'pdp-my.js', 'pdp-team-page.js', 'my-momentum-app.js'];
      let last = -1;
      order.forEach(f => { const i = at(f); _assertEqual(i > last, true, f + ' loads in order (position ' + i + ' after ' + last + ')'); last = i; });
      ['pdp-setup.js', 'pdp-template-editor.js', 'pdp-cycle-admin.js', 'pdp-calibrate-ui.js', 'pdp-calibrate.js', 'pdp-seed.js'].forEach(f => _assertEqual(at(f), -1, f + ' stays People-only'));   // N-479: pdp-seed.js joined the list
      const app = ALL_SOURCES['my-momentum-app.js'], nav = ALL_SOURCES['my-momentum-nav.js'];
      _assertEqual(/Promise\.all\(\[\s*getPdpIdentity\(\)[\s\S]*resolvePdpNav\(\)/.test(app) && /pdpMy: !!pdpNav\.my, pdpTeam: !!pdpNav\.team/.test(app), true, 'identity and PDP signals are read together');
      const rem = app.indexOf('runPdpReminders()');
      _assertEqual(app.split('runPdpReminders()').length === 2 && /runPdpReminders\(\)\.catch\(/.test(app), true, 'reminders run once and never throw');
      _assertEqual(app.indexOf('_mmSignals = ') > -1 && app.indexOf('_mmSignals = ') < app.indexOf('renderMyMomentumNav(') && app.indexOf('renderMyMomentumNav(') < rem && rem < app.indexOf('handleMyMomentumDeepLink()', rem), true, 'signals, then nav, then reminders, then the deep link');
      _assertEqual(/case 'myDevelopment':\s*await renderMyDevelopmentPage\(\)/.test(nav) && /case 'myTeam':\s*await renderMyTeamPage\(\)/.test(nav) && /else await renderTeamDevelopmentPage\(\)/.test(nav), true, 'both PDP pages are dispatched (My Team via renderMyTeamPage, N-453)');
      _assertEqual(/\.ppl-card/.test(nav), true, 'entrance stagger names .ppl-card');
    },
  },
  {
    name: 'N-452 AC2 / N-453 My Team: the strip and page title; the Scorecard link no longer needs People globals',
    fn: function () {
      const subs = [{ key: 'development', label: 'Development' }, { key: 'scorecards', label: 'Team Scorecards' }];
      const strip = mmTeamTabsHtml('development', subs);
      _assertEqual(strip.includes('eng-tab--active') && strip.includes('aria-selected="true"') && strip.includes('>Development<') && strip.includes('>Team Scorecards<'), true, 'Development is the active tab, Team Scorecards is the other');
      _assertEqual(mmTeamTabsHtml('other', subs).includes('eng-tab--active'), false, 'control: an inactive key is not marked active');
      _assertEqual(/<script|\bon[a-z]+=/.test(strip), false, 'plain markup');
      if (typeof _pdptpPageHtml === 'function') {
        const had = globalThis._mmTabCtx;
        globalThis._mmTabCtx = () => ({ state: 'ok', role: 'delivery_manager', signals: { pdpTeam: true, hasReports: true } });   // my-momentum-nav.js is not loaded in the rig
        const h = _pdptpPageHtml();
        const one = (globalThis._mmTabCtx = () => ({ state: 'ok', role: 'talent_partner', signals: { pdpTeam: true } }), _pdptpPageHtml());
        globalThis._mmTabCtx = had;
        _assertEqual(h.includes('<h1 class="page-title">My Team</h1>') && h.includes('eng-tab--active') && h.includes('Team Scorecards') && !h.includes('Team Development'), true, 'the page is titled My Team with the two-tab strip above the content');
        _assertEqual(one.includes('<h1 class="page-title">My Team</h1>') && !one.includes('eng-tab-strip'), true, 'N-453 with Development as the only sub-tab there is no strip');
      }
      if (typeof ALL_SOURCES !== 'undefined') {
        const my = ALL_SOURCES['pdp-my.js'];
        _assertEqual(/function pdpmScorecard\(\) \{ navigateToMyMomentum\('myScorecard'\); \}/.test(my) && !/navigateToPeople|peopleCanAccess|_resolvedRole\b/.test(my), true, 'pdp-my.js no longer needs People globals');
      }
    },
  },
  {
    name: 'N-459 AC3/AC5 greeting: bands come from CONFIG, boundaries hold, a missing name never shows an email',
    fn: function () {
      const G = CONFIG.MY_MOMENTUM.GREETING_HOURS;
      _assertEqual([G.afternoonFrom, G.eveningFrom], [12, 18], 'AC3 bands live in config');
      _assertEqual([0, 5, 11, 12, 17, 18, 23].map(greetingForHour), ['Good morning', 'Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening'], 'AC3 boundaries');
      _assertEqual(mmGreetingText('Chris Friend', 9), 'Good morning, Chris', 'first name only');
      _assertEqual(mmGreetingText('  Ann   Neil ', 13), 'Good afternoon, Ann', 'extra spaces');
      _assertEqual([mmGreetingText(null, 20), mmGreetingText('', 5), mmGreetingText(undefined, 12)], ['Good evening', 'Good morning', 'Good afternoon'], 'AC5 no name -> no name, no comma');
      _assertEqual(firstNameOf(undefined), '', 'firstNameOf(undefined)');
    },
  },
  {
    name: 'N-459 AC2 mmWordmarkHTML: inline SVG with an accessible name, two variants, no image / URL / colour attribute (unknown variant falls back to onDark)',
    fn: function () {
      const d = mmWordmarkHTML('onDark'), l = mmWordmarkHTML('onLight');
      [d, l].forEach(h => {
        _assertEqual(h.startsWith('<svg') && h.includes('role="img"') && h.includes('aria-label="My Momentum"'), true, 'AC2 svg with an accessible name');
        _assertEqual(/<img|<image|href=|url\(|fill=|stroke=|style=|#[0-9a-fA-F]{3,6}\b/.test(h), false, 'AC2 no image, URL, colour attribute, inline style or hex');
        _assertEqual(h.includes('>My</tspan>') && h.includes('>Momentum</tspan>'), true, 'AC2 text lockup');
      });
      _assertEqual(d.includes('mm-wm--onDark') && !d.includes('onLight'), true, 'AC2 dark variant');
      _assertEqual(l.includes('mm-wm--onLight') && !l.includes('onDark'), true, 'AC2 light variant');
      _assertEqual([mmWordmarkHTML('nonsense'), mmWordmarkHTML()], [d, d], 'AC2 unknown or no variant -> onDark');
    },
  },
  {
    name: 'N-459 AC12 hero and area header markup: wordmark, first name only and escaped, no stats; the slim header has no title',
    fn: function () {
      const h = mmHeroHtml('<b>Ann</b> Neil', 9);
      _assertEqual(h.includes('class="mm-hero"') && h.includes('mm-wm--onDark'), true, 'AC12 hero carries the wordmark');
      _assertEqual(h.includes('Good morning, &lt;b&gt;Ann&lt;/b&gt;') && !h.includes('<b>') && !h.includes('Neil'), true, 'AC12 first name only, escaped');
      _assertEqual(/StartDate|since|completed|hires/i.test(h), false, 'AC12 no stats or join date on the hero');
      const a = mmAreaHeaderHtml();
      _assertEqual(a.includes('class="mm-area-header"') && a.includes('mm-wm--onDark') && !/<h[1-6]/.test(a), true, 'AC12 slim header: wordmark, no title');
    },
  },
  {
    name: 'N-459 AC7-AC9/AC12/AC13/AC14 sidebar card, tokens, area sheet: one link holds name + role + wordmark + chevron, bell outside, no avatar, hex only in :root, reduced motion, print',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_CSS === 'undefined' || typeof ALL_HTML === 'undefined') _skip('needs ALL_SOURCES / ALL_CSS / ALL_HTML (tests/run.js)');
      const block = /<div class='nav-user'>[\s\S]*?<div class='nav-notif-slot' id='notif-slot'><\/div>\s*<\/div>/.exec(ALL_SOURCES['nav-core.js'])[0];
      const link = /<a class='nav-user-link'[\s\S]*?<\/a>/.exec(block)[0];
      ["class='nav-user-name'", "class='nav-user-role'", "mmWordmarkHTML('onDark')", "class='nav-user-chev'"].forEach(p => _assertEqual(link.includes(p), true, 'AC7 inside the one link: ' + p));
      _assertEqual(link.includes('notif-slot'), false, 'AC8 the bell slot is outside the link');
      _assertEqual(/<img|avatar|initial|photo/i.test(block), false, 'AC9 no avatar, image, initials or photo in the card');
      const css = ALL_CSS['style.css'];
      ['--c-midnight', '--c-lapis', '--c-lapis-soft', '--c-imperial', '--c-imperial-cta', '--c-imperial-cta-hover', '--sidebar-grad-from', '--sidebar-grad-to', '--mm-accent', '--mm-accent-soft', '--mm-glow', '--mm-glow-strong', '--mm-cta-bg', '--mm-cta-hover', '--mm-cta-text']
        .forEach(tk => _assertEqual(new RegExp('\\n\\s*' + tk + ':').test(css), true, 'AC14 token ' + tk));
      const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
      ['homepage.css', 'my-momentum.css'].forEach(f => _assertEqual(/#[0-9a-fA-F]{3,8}\b/.test(strip(ALL_CSS[f])), false, 'AC14 no hex in ' + f));
      ['nav-core.js', 'home.js', 'my-momentum-pages.js', 'my-momentum-nav.js'].forEach(f => _assertEqual(/#[0-9a-fA-F]{3,6}\b/.test(strip(ALL_SOURCES[f])), false, 'AC14 no hex in ' + f));
      _assertEqual(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.nav-user-link\s*\{\s*transition: none/.test(css), true, 'AC10 the card glow transition is off under reduced motion');
      _assertEqual(/@media print\s*\{\s*\.mm-hero, \.mm-area-header\s*\{\s*display: none/.test(ALL_CSS['my-momentum.css']), true, 'AC18 hero and header are not printed');
      // N-462: one shared sidebar gradient (every module + Admin), tokens renamed away from --mm-grad-*.
      const _allText = [ALL_CSS, ALL_SOURCES, ALL_HTML].reduce((a, o) => a.concat(Object.keys(o).map(k => o[k])), []);
      _assertEqual(_allText.some(s => /mm-grad/.test(s)), false, 'N462 AC1 no --mm-grad-* left in css, js or html');
      _assertEqual((css.match(/--sidebar-grad-from:\s*var\(--c-brand\)/g) || []).length === 1 && (css.match(/--sidebar-grad-to:\s*var\(--c-midnight\)/g) || []).length === 1, true, 'N462 AC1 both tokens defined once, Brand to Midnight');
      _assertEqual((strip(css).match(/#sidebar,\s*\.admin-sidebar\s*\{\s*background: linear-gradient\(180deg, var\(--sidebar-grad-from\) 0%, var\(--sidebar-grad-to\) 100%\);/g) || []).length, 1, 'N462 AC2 one grouped gradient rule for #sidebar and .admin-sidebar');
      _assertEqual(/#sidebar\s*\{[^}]*background/.test(strip(css)) || /\.admin-sidebar\s*\{[^}]*background/.test(strip(ALL_CSS['admin.css'])) || /#sidebar\s*\{[^}]*background/.test(strip(ALL_CSS['my-momentum.css'])), false, 'N462 AC2 no other sidebar background rule (style.css solo, admin.css, my-momentum.css)');
      _assertEqual(/body\.mm-area \.nav-link\.active\s*\{\s*box-shadow: inset 3px 0 0 var\(--mm-accent-soft\)/.test(ALL_CSS['my-momentum.css']), true, 'N462 AC4 My Momentum keeps its Lapis-tint active marker');
      const html = ALL_HTML['my-momentum.html'];
      _assertEqual(html.includes('<body class="mm-area">') && html.includes('href="css/my-momentum.css"'), true, 'AC11 area class and sheet on the My Momentum shell');
      _assertEqual(ALL_HTML['index.html'].includes('my-momentum.css') || ALL_HTML['people.html'].includes('my-momentum.css'), false, 'AC11 no other shell links the area sheet');
      _assertEqual(/mmHeroHtml\(getCurrentUser\(\)\.name/.test(ALL_SOURCES['my-momentum-nav.js']) && ALL_SOURCES['my-momentum-nav.js'].includes("page === 'myHistory'"), true, 'AC12 hero on the landing tab, header on the rest, keyed on the tab');
    },
  },
  {
    name: 'N-460 AC1-AC6 sidebar user name is HTML-escaped: <b>x</b> renders as text, email fallback escaped, plain name unchanged, signed-out blank, role stays raw',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      const render = (user, role) => {
        let html = '';
        const sidebar = {};
        Object.defineProperty(sidebar, 'innerHTML', { set: h => { html = h; }, get: () => html });
        const ctl = {
          document: { getElementById: id => (id === 'sidebar' ? sidebar : null) },
          lucide: { createIcons() {} }, getCurrentUser: () => user, isMacPlatform: () => false,
          renderGhostBanner() {}, getTheme: () => 'light', getDensity: () => 'comfortable',
          act: () => '', mmWordmarkHTML: () => '', registerActions() {}, CONFIG: { OS_MODULES: [] },
        };
        const mod = new Function('ctl', 'with (ctl) {\n' + ALL_SOURCES['nav-core.js'] + '\nreturn { renderModuleNav };\n}')(ctl);
        mod.renderModuleNav({ subtitle: 's', currentModuleKey: 'reporting', toggleFn: 'x', pages: [], currentPage: null, role: role || 'delivery_manager' });
        return html;
      };
      const nameCell = h => (/<div class='nav-user-name'>([\s\S]*?)<\/div>/.exec(h) || [])[1];
      const hostile = render({ name: '<b>x</b>', email: 'a@b.test' });
      _assertEqual(nameCell(hostile), '&lt;b&gt;x&lt;/b&gt;', 'N460 AC1 a name of <b>x</b> is escaped');
      _assertEqual(hostile.includes('<b>x</b>'), false, 'N460 AC1 no literal <b>x</b> in the sidebar');
      _assertEqual(nameCell(render({ name: null, email: 'a@b.test' })), 'a@b.test', 'N460 AC3 email fallback intact');
      _assertEqual(nameCell(render({ name: null, email: '<i>a@b.test' })), '&lt;i&gt;a@b.test', 'N460 AC3 email fallback is escaped too');
      _assertEqual(nameCell(render({ name: 'Chris Friend', email: 'c@b.test' })), 'Chris Friend', 'N460 AC4 plain name unchanged');
      _assertEqual(nameCell(render({ name: "Mary O'Neil", email: 'm@b.test' })), 'Mary O&#39;Neil', 'N460 AC4 apostrophe escaped');
      _assertEqual(nameCell(render({ name: null, email: null })), '', 'N460 AC5 signed-out renders blank, not "null"');
      _assertEqual((/<div class='nav-user-role'>([\s\S]*?)<\/div>/.exec(hostile) || [])[1], 'delivery manager', 'N460 AC6 role text unchanged');
    },
  },
  {
    name: 'N-461 AC1-AC3/AC5/AC6 role deep link: roleDeepLink builds the handled #roles?action=checklist hash, the roleFlag notification stores it, legacy #role-N is rewritten (anchored), role names unchanged',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      _assertEqual(roleDeepLink(42), 'reporting.html#roles?action=checklist&id=42', 'N461 AC1 numeric id');
      _assertEqual(roleDeepLink('42'), 'reporting.html#roles?action=checklist&id=42', 'N461 AC1 numeric string id');
      _assertEqual(roleDeepLink('4<b>2'), 'reporting.html#roles?action=checklist&id=0', 'N461 AC1 non-numeric gives id=0, never free text');
      // AC2: the link home-banner.js really stores resolves like app.js handleDeepLink() reads it.
      const m = /deepLink\s*:\s*([^,\n]+?),\s*\n?\s*body:/.exec(ALL_SOURCES['home-banner.js']) || /deepLink\s*:\s*(`reporting\.html#role-[^`]*`|roleDeepLink\([^)]*\))/.exec(ALL_SOURCES['home-banner.js']);
      _assertEqual(!!m, true, 'N461 AC2 found the roleFlag deepLink expression in home-banner.js');
      const stored = new Function('role', 'roleDeepLink', 'return ' + m[1])({ id: 42 }, roleDeepLink);
      const raw = stored.split('#')[1] || '';
      const pageKey = raw.split('?')[0], params = { get: k => { const kv = (raw.split('?')[1] || '').split('&').map(x => x.split('=')).find(x => x[0] === k); return kv ? kv[1] : null; } };
      _assertEqual(pageKey, 'roles', 'N461 AC2 stored link names the roles page (today: ' + pageKey + ')');
      _assertEqual(params.get('action') + '|' + params.get('id'), 'checklist|42', 'N461 AC2 stored link carries action=checklist&id=<role id>');
      _assertEqual(CONFIG.COMMAND_BAR_PAGES.some(p => p.key === pageKey), true, 'N461 AC2 page key is a real Reporting page');
      _assertEqual(/action === 'checklist' && \(page === 'projects' \|\| page === 'roles'\)/.test(ALL_SOURCES['app.js']), true, 'N461 AC2 app.js handleDeepLink still handles roles + checklist');
      // AC3: legacy shape rewritten; everything else untouched.
      _assertEqual(notifDeepLinkFix('reporting.html#role-42'), 'reporting.html#roles?action=checklist&id=42', 'N461 AC3 legacy link rewritten');
      ['reporting.html#roles?action=checklist&id=42', 'reporting.html#placements', 'command-centre.html#health', 'reporting.html#role-42x', 'reporting.html#role-', 'x reporting.html#role-42', ''].forEach(v =>
        _assertEqual(notifDeepLinkFix(v), v, 'N461 AC3 unchanged: ' + v));
      _assertEqual(notifDeepLinkFix(null), null, 'N461 AC3 null passes through');
      // AC5: the My Momentum role name link is byte-identical to before.
      _assertEqual(mmRoleNameHtml({ id: 42, title: 'A&B' }, true), '<a class="mmsc-link" href="reporting.html#roles?action=checklist&amp;id=42">A&amp;B</a>', 'N461 AC5 role name link unchanged');
      _assertEqual(mmRoleNameHtml({ id: 42, title: 'A&B' }, false), 'A&amp;B', 'N461 AC5 plain name when the viewer cannot open Roles');
      // AC6: no other #role- link builder in js/ (coe-plan.js #role-form is a selector; utils.js holds the one anchored pattern).
      Object.keys(ALL_SOURCES).filter(f => f !== 'utils.js' && f !== 'coe-plan.js').forEach(f =>
        _assertEqual(/reporting\.html#role-/.test(ALL_SOURCES[f]), false, 'N461 AC6 no legacy role link in ' + f));
    },
  },
  {
    name: 'N-465 AC1-AC6 live deep links: bindDeepLinkListener registers one hashchange listener, runs the handler on a non-empty hash, clears a refused hash, and every shell binds it once after its initial handle call',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      const m = /function bindDeepLinkListener\(handler\) \{[\s\S]*?\n\}\n/.exec(ALL_SOURCES['command-bar.js']);
      _assertEqual(!!m, true, 'N465 AC1 command-bar.js defines bindDeepLinkListener');
      if (!m) return;
      const rig = function (hash) {
        const w = { location: { hash: hash, pathname: '/x.html' }, listeners: [], addEventListener: function (t, fn) { this.listeners.push([t, fn]); } };
        const calls = [];
        const hist = { replaceState: function () { calls.push(Array.prototype.slice.call(arguments)); } };
        const bind = new Function('window', 'history', m[0] + '; return bindDeepLinkListener;')(w, hist);
        return { w: w, bind: bind, calls: calls };
      };
      // AC1: one listener however many times it is bound.
      let r = rig('');
      let ran = 0;
      r.bind(function () { ran++; return true; }); r.bind(function () { ran++; return true; });
      _assertEqual(r.w.listeners.length, 1, 'N465 AC1 one listener');
      _assertEqual(r.w.listeners[0][0], 'hashchange', 'N465 AC1 listens for hashchange');
      // AC2: empty hash does nothing; non-empty runs the handler once.
      r.w.listeners[0][1]();
      _assertEqual(ran, 0, 'N465 AC2 empty hash: handler not run');
      r.w.location.hash = '#roles?action=checklist&id=7';
      r.w.listeners[0][1]();
      _assertEqual(ran, 1, 'N465 AC2 non-empty hash: handler run once');
      // AC4: handled (true) -> binder leaves the URL alone.
      _assertEqual(r.calls.length, 0, 'N465 AC4 handled hash: binder does not touch the URL');
      // AC3: refused (false) -> hash cleared once via replaceState.
      r = rig('#nope');
      let refused = 0;
      r.bind(function () { refused++; return false; });
      r.w.listeners[0][1]();
      _assertEqual(refused, 1, 'N465 AC3 handler run once');
      _assertEqual(JSON.stringify(r.calls), JSON.stringify([[null, '', '/x.html']]), 'N465 AC3 refused hash cleared with replaceState');
      // AC5/AC6: every shell binds exactly once, after its initial handle call; cc-app passes a closure with role.
      const shells = { 'app.js': 'handleDeepLink()', 'people-app.js': 'handlePeopleDeepLink()', 'sales-app.js': 'handleSalesDeepLink()',
        'cc-app.js': 'handleCCDeepLink(role)', 'mr-app.js': 'handleMrDeepLink()', 'my-momentum-app.js': 'handleMyMomentumDeepLink()', 'admin-page.js': 'handleAdminDeepLink()' };
      Object.keys(shells).forEach(function (f) {
        const src = ALL_SOURCES[f];
        const n = (src.match(/bindDeepLinkListener\(/g) || []).length;
        _assertEqual(n, 1, 'N465 AC5 ' + f + ' binds once');
        _assertEqual(src.indexOf('bindDeepLinkListener(') > src.indexOf('if (!' + shells[f] + ')'), true, 'N465 AC5 ' + f + ' binds after its initial handle call');
      });
      _assertEqual(ALL_SOURCES['cc-app.js'].includes('bindDeepLinkListener(() => handleCCDeepLink(role))'), true, 'N465 AC6 cc-app.js passes a closure carrying role');
    },
  },
  {
    name: 'N-458 AC1/AC2/AC3 My Momentum user guide: present, its stylesheets in order, no inline style / <style> / inline handler, CSP identical to the People guide, sidebar link points at it (People sidebar unchanged)',
    fn: function () {
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') _skip('needs ALL_HTML / ALL_SOURCES (tests/run.js)');
      const g = ALL_HTML['my-momentum-user-guide.html'], p = ALL_HTML['people-user-guide.html'];
      _assertEqual(typeof g, 'string', 'AC1 my-momentum-user-guide.html exists');
      const sheets = []; g.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]*)"[^>]*>/gi, (m, h) => { sheets.push(h); return m; });
      _assertEqual(sheets, ['css/style.css', 'css/guide.css', 'css/guide-search.css'], 'AC2 stylesheets, in order (N-480: shared guide sheet)');
      _assertEqual(/\sstyle\s*=/i.test(g) || /<style[\s>]/i.test(g) || /\son[a-z]+\s*=/i.test(g), false, 'AC2 no inline style, <style> or inline handler');
      _assertEqual(g.includes('src="js/guide-search.js"'), true, 'AC1 loads guide-search.js');
      const csp = h => (h.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/) || [''])[0];
      _assertEqual(csp(g) !== '' && csp(g) === csp(p), true, 'AC2 CSP meta identical to the People guide');
      _assertEqual(/userGuideHref:\s*'my-momentum-user-guide\.html'/.test(ALL_SOURCES['my-momentum-nav.js']), true, 'AC3 My Momentum sidebar link');
      _assertEqual(/userGuideHref:\s*'people-user-guide\.html'/.test(ALL_SOURCES['people-nav.js']), true, 'AC3 People sidebar link unchanged');
    },
  },
  {
    name: 'N-458 AC6/AC13 People guide: each moved section keeps its id and points at a real id in the My Momentum guide; every in-page anchor in both guides resolves; Calibration and PDP Setup stay',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (tests/run.js)');
      const g = ALL_HTML['my-momentum-user-guide.html'], p = ALL_HTML['people-user-guide.html'];
      const ids = h => { const out = new Set(); h.replace(/\bid="([^"]+)"/g, (m, i) => { out.add(i); return m; }); return out; };
      const gi = ids(g), pi = ids(p);
      const pointers = { 'scorecards': 'my-scorecard', 'pdp-overview': 'pdp-overview', 'my-development': 'my-development', 'team-development': 'my-team', 'pdp-goals-actions': 'pdp-goals-actions', 'pdp-bi-annual': 'pdp-bi-annual' };
      Object.keys(pointers).forEach(id => {
        _assertEqual(pi.has(id), true, 'People guide keeps #' + id);
        _assertEqual(gi.has(pointers[id]), true, 'My Momentum guide has #' + pointers[id]);
        const sec = p.slice(p.indexOf('id="' + id + '"'));
        _assertEqual(sec.slice(0, sec.indexOf('</div>')).includes('my-momentum-user-guide.html#' + pointers[id]), true, '#' + id + ' links to #' + pointers[id]);
      });
      ['pdp-calibration', 'pdp-setup', 'employee-tracker'].forEach(id => _assertEqual(pi.has(id), true, 'People guide keeps #' + id));
      [[g, gi, 'my-momentum-user-guide.html'], [p, pi, 'people-user-guide.html']].forEach(([html, own, name]) => {
        html.replace(/\bhref="#([^"]+)"/g, (m, a) => { _assertEqual(own.has(a), true, name + ' in-page anchor #' + a + ' resolves'); return m; });
        html.replace(/\bhref="(my-momentum-user-guide|people-user-guide)\.html#([^"]+)"/g, (m, f, a) => { _assertEqual((f === 'people-user-guide' ? pi : gi).has(a), true, name + ' cross-guide link ' + f + '#' + a + ' resolves'); return m; });
      });
      _assertEqual(/in the People menu/.test(p.slice(0, p.indexOf('id="pdp-setup"'))), false, 'AC7 no moved page is described as in the People menu');
    },
  },
  {
    name: 'N-458 AC11 Readme.html: the guide and its sheet are listed, the My History stub wording is gone, the access matrix names the My Momentum rows and the employee record page',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') _skip('needs ALL_HTML (tests/run.js)');
      const r = ALL_HTML['Readme.html'];
      ['my-momentum-user-guide.html', 'css/guide.css', 'My Momentum — My History', 'My Momentum — My Details', 'My Momentum — My Team, Team Scorecards', 'People — Employee record page', 'My Momentum docs and epic close-out (N-458 / MM-8)'].forEach(s => {
        _assertEqual(r.includes(s) || r.includes(s.replace(/css\//, '')), true, 'Readme.html names: ' + s);
      });
      _assertEqual(/My History stub/.test(r), false, 'no "My History stub" left');
      _assertEqual(/Quarterly KPI question links to People Scorecards/.test(r), false, 'Quarterly KPI link wording corrected');
    },
  },
);