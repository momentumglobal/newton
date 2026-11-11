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
    name: 'N-451 AC3/AC6 config: tab registry — only My History is live; order is the landing order',
    fn: function () {
      const T = CONFIG.MY_MOMENTUM.TABS;
      _assertEqual(_mmKeys(T), ['myHistory', 'myDetails', 'myScorecard', 'myDevelopment', 'myTeam'], 'AC6 order');
      _assertEqual(T.filter(t => t.live).map(t => t.key), ['myHistory'], 'AC3 only My History is live (later tasks flip their own flag)');
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
    name: 'N-451 AC6 mmVisibleTabs: live gate, relevance rules, role-granted My Team without a People row',
    fn: function () {
      const live = CONFIG.MY_MOMENTUM.TABS;
      const all = { hasActivity: true, pdpMy: true, hasReports: true };
      _assertEqual(_mmKeys(mmVisibleTabs(live, { state: 'ok', role: 'talent_partner', signals: all })), ['myHistory'], 'a live:false tab never appears, even with every signal true');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'talent_partner', signals: {} })), ['myHistory', 'myDetails'], 'ok state: History + Details only');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'talent_partner', signals: all })), ['myHistory', 'myDetails', 'myScorecard', 'myDevelopment', 'myTeam'], 'everything relevant, registry order');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'staff', signals: { hasActivity: true } })), ['myHistory', 'myDetails', 'myScorecard'], 'Scorecard needs hasActivity');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'staff', signals: { pdpMy: true } })), ['myHistory', 'myDetails', 'myDevelopment'], 'Development needs pdpMy');
      _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'delivery_manager', signals: { hasReports: true } })), ['myHistory', 'myDetails', 'myTeam'], 'My Team for someone with reports');
      ['admin', 'leadership', 'people_ops'].forEach(r => {
        _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'notLinked', role: r, signals: {} })), ['myTeam'], r + ' gets My Team with no People row');
        _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'error', role: r, signals: {} })), ['myTeam'], r + ' keeps My Team when the identity read failed');
      });
      ['talent_partner', 'delivery_manager', 'staff', 'sales'].forEach(r =>
        _assertEqual(_mmKeys(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: r, signals: {} })).includes('myTeam'), false, r + ' without reports has no My Team'));
      ['notLinked', 'ambiguous', 'error'].forEach(s =>
        _assertEqual(mmVisibleTabs(_MM_ALL_LIVE, { state: s, role: 'staff', signals: {} }), [], s + ' + ordinary role: nothing to show'));
      _assertEqual(mmVisibleTabs(null, null), [], 'null-safe');
      _assertEqual(mmLandingTab(mmVisibleTabs(_MM_ALL_LIVE, { state: 'ok', role: 'staff', signals: {} })), 'myHistory', 'landing is the first visible tab');
      _assertEqual(mmLandingTab(mmVisibleTabs(_MM_ALL_LIVE, { state: 'notLinked', role: 'admin', signals: {} })), 'myTeam', 'landing falls through to a role-granted tab');
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
      ['analytics.js', 'analytics-pages.js', 'pdp-my.js', 'pdp-team-page.js'].forEach(f => _assertEqual(srcs.includes(f), false, f + ' is not loaded here (later tasks add what their tab needs)'));
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
    name: 'N-451 AC11 old People links untouched: PEOPLE_PAGES still own myDevelopment / teamDevelopment / scorecards',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      const r = ALL_SOURCES['people-router.js'];
      ['myDevelopment:', 'teamDevelopment:', 'scorecards:'].forEach(k => _assertEqual(r.includes(k), true, 'people-router.js still registers ' + k));
      _assertEqual(CONFIG.COMMAND_BAR_PAGES.some(p => p.key === 'scorecards' && p.href === 'people.html#scorecards'), true, 'People Scorecards Command Bar entry unchanged');
      _assertEqual(ALL_SOURCES['people-nav.js'].includes('my-momentum'), false, 'people-nav.js not touched by N-451');
    },
  },
);