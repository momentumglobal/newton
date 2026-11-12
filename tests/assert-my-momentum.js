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
    name: 'N-451 AC3/AC6 config: tab registry — History, Development and Team are live (N-452); order is the landing order',
    fn: function () {
      const T = CONFIG.MY_MOMENTUM.TABS;
      _assertEqual(_mmKeys(T), ['myHistory', 'myDetails', 'myScorecard', 'myDevelopment', 'myTeam'], 'AC6 order');
      _assertEqual(T.filter(t => t.live).map(t => t.key), ['myHistory', 'myDevelopment', 'myTeam'], 'AC3 live tabs (later tasks flip their own flag)');
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
      _assertEqual(_mmKeys(mmVisibleTabs(live, { state: 'ok', role: 'talent_partner', signals: all })), ['myHistory', 'myDevelopment', 'myTeam'], 'a live:false tab never appears, even with every signal true');
      _assertEqual(_mmKeys(mmVisibleTabs(live, { state: 'ok', role: 'talent_partner', signals: {} })), ['myHistory'], 'no PDP signal: only My History');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'talent_partner', signals: {} })), ['myHistory', 'myDetails'], 'ok state: History + Details only');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'talent_partner', signals: all })), ['myHistory', 'myDetails', 'myScorecard', 'myDevelopment', 'myTeam'], 'everything relevant, registry order');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'staff', signals: { hasActivity: true } })), ['myHistory', 'myDetails', 'myScorecard'], 'Scorecard needs hasActivity');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'staff', signals: { pdpMy: true } })), ['myHistory', 'myDetails', 'myDevelopment'], 'Development needs pdpMy');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'delivery_manager', signals: { pdpTeam: true } })), ['myHistory', 'myDetails', 'myTeam'], 'My Team needs pdpTeam');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'delivery_manager', signals: { hasReports: true } })).includes('myTeam'), false, 'the retired hasReports signal no longer opens My Team');
      ['admin', 'people_ops'].forEach(r => {
        _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'notLinked', role: r, signals: { pdpTeam: true } })), ['myTeam'], r + ' with pdpTeam gets My Team with no People row');
        _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'error', role: r, signals: { pdpTeam: true } })), ['myTeam'], r + ' keeps My Team when the identity read failed');
      });
      ['admin', 'leadership', 'people_ops'].forEach(r =>
        _assertEqual(mmVisibleTabs(_MM_ALL_LIVE, { state: 'notLinked', role: r, signals: {} }), [], r + ' without pdpTeam: no role grant until N-453 (Leadership never gets Development, PDP-D1)'));
      ['talent_partner', 'delivery_manager', 'staff', 'sales'].forEach(r =>
        _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: r, signals: {} })).includes('myTeam'), false, r + ' without pdpTeam has no My Team'));
      ['notLinked', 'ambiguous', 'error'].forEach(s =>
        _assertEqual(mmVisibleTabs(_MM_ALL_LIVE, { state: s, role: 'staff', signals: {} }), [], s + ' + ordinary role: nothing to show'));
      _assertEqual(mmVisibleTabs(null, null), [], 'null-safe');
      _assertEqual(mmLandingTab(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'staff', signals: {} })), 'myHistory', 'landing is the first visible tab');
      _assertEqual(mmLandingTab(mmVisibleTabs(_MM_ALL_LIVE, { state: 'notLinked', role: 'admin', signals: { pdpTeam: true } })), 'myTeam', 'Admin with no People row lands on My Team, not the no-record panel');
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
    name: 'N-451 AC3/AC4 markup: stub shows name, role, level (escaped); no-record panel has three distinct messages',
    fn: function () {
      const html = mmHistoryStubHtml({ EmployeeName: 'Ann <b>Neil</b>', Level: 'STP' }, 'talent_partner');
      _assertEqual(html.includes('Ann &lt;b&gt;Neil'), true, 'AC3 name is escaped');
      _assertEqual(html.includes('<b>'), false, 'AC3 no raw tag from data');
      _assertEqual(html.includes('Talent Partner'), true, 'AC3 role label');
      _assertEqual(html.includes('STP'), true, 'AC3 level');
      _assertEqual(html.includes('coming soon'), true, 'AC3 coming-soon line');
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
      const order = ['config.js', 'actions.js', 'auth.js', 'utils.js', 'ui-kit.js', 'permissions.js', 'project-team.js', 'pdp-identity.js', 'graph-client.js', 'api.js', 'api-pdp.js',
        'my-momentum-logic.js', 'my-momentum-router.js', 'nav-core.js', 'command-bar.js', 'notifications.js', 'my-momentum-nav.js', 'my-momentum-pages.js', 'my-momentum-app.js'];
      let last = -1;
      order.forEach(f => {
        const i = srcs.indexOf(f);
        _assertEqual(i > last, true, f + ' loads, in order (position ' + i + ' after ' + last + ')');
        last = i;
      });
      _assertEqual(srcs[srcs.length - 1], 'my-momentum-app.js', 'app init loads last');
      _assertEqual(/<script(?![^>]*\bsrc=)[^>]*>/.test(html), false, 'no inline <script>');
      ['analytics.js', 'analytics-pages.js', 'pdp-setup.js', 'pdp-calibrate-ui.js'].forEach(f => _assertEqual(srcs.includes(f), false, f + ' is not loaded here (PDP Setup stays in People; later tasks add what their tab needs)'));
      _assertEqual(html.includes('id="breadcrumb-bar"') && html.includes('id="main-content"') && html.includes('id="sidebar"'), true, 'shell markup');
      _assertEqual(ALL_SOURCES['mobile-home.js'].includes('myMomentum') || ALL_SOURCES['mobile-app.js'].includes('myMomentum'), false, 'AC7 not in the mobile launcher');
    },
  },
  {
    name: 'N-451 AC8/AC9 entry points: home card is a link with no stats; sidebar name block links, bell stays outside',
    fn: function () {
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') _skip('needs ALL_HTML / ALL_SOURCES (tests/run.js)');
      const home = ALL_HTML['index.html'];
      const card = /<a id="home-greeting-card"[^>]*>([\s\S]*?)<\/a>/.exec(home);
      _assertEqual(!!card, true, 'AC8 greeting card exists');
      _assertEqual(/href="my-momentum\.html"/.test(card[0]), true, 'AC8 card links to My Momentum');
      _assertEqual(card[1].includes('id="home-greeting"'), true, 'AC8 greeting text node kept (home.js writes it)');
      _assertEqual(card[1].includes('My Momentum'), true, 'AC8 card names My Momentum');
      _assertEqual(/StartDate|since|completed|hires/i.test(card[1]), false, 'AC8 no join date or stats on the card (MM-D2)');
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
    name: 'N-451 AC11 / N-452 AC6 People links: Scorecards untouched, the two PDP pages are gone',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      const r = ALL_SOURCES['people-router.js'];
      ['pdpSetup:', 'scorecards:'].forEach(k => _assertEqual(r.includes(k), true, 'people-router.js still registers ' + k));
      ['myDevelopment:', 'teamDevelopment:'].forEach(k => _assertEqual(r.includes(k), false, 'people-router.js no longer registers ' + k + ' (N-452)'));
      _assertEqual(CONFIG.COMMAND_BAR_PAGES.some(p => p.key === 'scorecards' && p.href === 'people.html#scorecards'), true, 'People Scorecards Command Bar entry unchanged');
    },
  },
  {
    name: 'N-452 AC7/AC9 config: redirect map, reminder links, Command Bar entries now belong to My Momentum',
    fn: function () {
      _assertEqual(CONFIG.MY_MOMENTUM.REDIRECTS, { myDevelopment: 'myDevelopment', teamDevelopment: 'myTeam' }, 'redirect map');
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
      _assertEqual(['#scorecards', '#pdpSetup', '#orgChart', '', '#', undefined, null, '#constructor', '#toString'].map(h => mmRedirectTarget(h, map)), ['', '', '', '', '', '', '', '', ''], 'everything else stays on People (scorecards until N-453; prototype keys never match)');
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
      const order = ['pdp-identity.js', 'pdp-data.js', 'pdp-seed.js', 'pdp-cycle.js', 'pdp-prep.js', 'pdp-reminders.js', 'pdp-team.js', 'pdp-track.js', 'pdp-assess.js', 'graph-client.js', 'api-pdp.js',
        'my-momentum-pages.js', 'pdp-ui-common.js', 'pdp-track-ui.js', 'pdp-assess-ui.js', 'pdp-my.js', 'pdp-team-page.js', 'my-momentum-app.js'];
      let last = -1;
      order.forEach(f => { const i = at(f); _assertEqual(i > last, true, f + ' loads in order (position ' + i + ' after ' + last + ')'); last = i; });
      ['pdp-setup.js', 'pdp-template-editor.js', 'pdp-cycle-admin.js', 'pdp-calibrate-ui.js', 'pdp-calibrate.js'].forEach(f => _assertEqual(at(f), -1, f + ' stays People-only'));
      const app = ALL_SOURCES['my-momentum-app.js'], nav = ALL_SOURCES['my-momentum-nav.js'];
      _assertEqual(/Promise\.all\(\[\s*getPdpIdentity\(\)[\s\S]*resolvePdpNav\(\)/.test(app) && /pdpMy: !!pdpNav\.my, pdpTeam: !!pdpNav\.team/.test(app), true, 'identity and PDP signals are read together');
      const rem = app.indexOf('runPdpReminders()');
      _assertEqual(app.split('runPdpReminders()').length === 2 && /runPdpReminders\(\)\.catch\(/.test(app), true, 'reminders run once and never throw');
      _assertEqual(app.indexOf('_mmSignals = ') > -1 && app.indexOf('_mmSignals = ') < app.indexOf('renderMyMomentumNav(') && app.indexOf('renderMyMomentumNav(') < rem && rem < app.indexOf('handleMyMomentumDeepLink()', rem), true, 'signals, then nav, then reminders, then the deep link');
      _assertEqual(/case 'myDevelopment':\s*await renderMyDevelopmentPage\(\)/.test(nav) && /case 'myTeam':\s*await renderTeamDevelopmentPage\(\)/.test(nav), true, 'both PDP pages are dispatched');
      _assertEqual(/\.ppl-card/.test(nav), true, 'entrance stagger names .ppl-card');
    },
  },
  {
    name: 'N-452 AC2 My Team: one-tab strip and page title; the Scorecard link no longer needs People globals',
    fn: function () {
      const strip = mmTeamTabsHtml('development');
      _assertEqual(strip.includes('eng-tab--active') && strip.includes('aria-selected="true"') && strip.includes('>Development<'), true, 'Development is the active tab');
      _assertEqual(mmTeamTabsHtml('other').includes('eng-tab--active'), false, 'control: an inactive key is not marked active');
      _assertEqual(/<script|\bon[a-z]+=/.test(strip), false, 'plain markup');
      if (typeof _pdptpPageHtml === 'function') {
        const h = _pdptpPageHtml();
        _assertEqual(h.includes('<h1 class="page-title">My Team</h1>') && h.includes('eng-tab--active') && !h.includes('Team Development'), true, 'the page is titled My Team with the strip above the content');
      }
      if (typeof ALL_SOURCES !== 'undefined') {
        const my = ALL_SOURCES['pdp-my.js'];
        _assertEqual(/function pdpmScorecard\(\) \{ const e = _pdpmScorecardEntry\(\); if \(e\) window\.location\.href = e\.href; \}/.test(my) && !/navigateToPeople|peopleCanAccess|_resolvedRole\b/.test(my), true, 'pdp-my.js no longer needs People globals');
      }
    },
  },
);