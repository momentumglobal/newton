// tests/assert-actions-lints.js — delegated actions (N-301/302), inline-handler ratchet, act names, CSP style split, inline styles, css split, icon subset.
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  {
    name: 'every Lucide icon a template names is in the vendored subset (N-349a)',
    fn: function () {
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined' || typeof ICON_SUBSET_LIST === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(
        lintIconSubset(ALL_HTML, ALL_SOURCES, ICON_SUBSET_LIST).map(v => `${v.file}:${v.line}  ${v.icon}  (${v.rule})`),
        [],
        'icons missing from js/vendor/lucide-subset-icons.txt (add the name, run tools/build-lucide-subset.mjs, update VERSIONS.md)'
      );
    },
  },
  {
    name: 'Lucide subset: icon list, banner and VERSIONS.md row agree; full file absent (N-349a)',
    fn: function () {
      if (typeof VENDOR_FILES === 'undefined' || typeof VENDOR_HEADS === 'undefined' || typeof ICON_SUBSET_LIST_SHA256 === 'undefined') {
        _skip('Vendor hashing needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(
        lintLucideSubset(VENDOR_FILES, VENDOR_HEADS, VENDOR_MANIFEST, ICON_SUBSET_LIST, ICON_SUBSET_LIST_SHA256),
        [], 'Lucide subset chain'
      );
    },
  },
  {
    name: 'lintIconSubset flags a missing name under each rule, ignores comparisons and comments (N-349a)',
    fn: function () {
      const js = {
        'a.js': [
          "x = `<i data-lucide=\"nope-1\"></i>`;",
          "y = `<i data-lucide=\"${dark ? 'sun' : 'nope-2'}\"></i>`;",
          "z = { icon: 'nope-3' };",
          "const FOO_ICON = { a: 'bell', b: 'nope-4' };",
          "w = `<i data-lucide=\"${mode === 'dark' ? 'sun' : 'bell'}\"></i>`;",
          "// icon: 'nope-5'",
        ].join('\n'),
      };
      const html = { 'p.html': '<!-- <i data-lucide="nope-6"></i> -->\n<i data-lucide="bell"></i>' };
      _assertEqual(
        lintIconSubset(html, js, 'bell\nsun\n').map(v => `${v.file}:${v.line} ${v.icon} ${v.rule}`),
        ['js/a.js:1 nope-1 R1', 'js/a.js:2 nope-2 R2', 'js/a.js:3 nope-3 R3', 'js/a.js:4 nope-4 R4'],
        'one violation per rule; comparison operand "dark" and both comments ignored'
      );
    },
  },
  {
    name: 'lintLucideSubset passes a consistent chain and fails each way it can drift (N-349a)',
    fn: function () {
      const sha = 'a'.repeat(64);
      const f = 'lucide-1.47.0.subset.min.js';
      const head = '/*! lucide 1.47.0 subset (N-349a) icons-sha256:' + sha + ' */(()=>{})();';
      const row = '| lucide | 1.47.0 | `' + f + '` | **DERIVED** — bundled | u | ISC | 1 | `sha384-x` |';
      const files = {}; files[f] = 'sha384-x';
      const heads = {}; heads[f] = head;
      _assertEqual(lintLucideSubset(files, heads, row, 'bell\n', sha), [], 'consistent chain');
      _assertEqual(lintLucideSubset(files, heads, row, 'bell\n', 'b'.repeat(64)).length, 1, 'list edited without rebuilding');
      const withFull = Object.assign({}, files, { 'lucide-1.47.0.min.js': 'sha384-y' });
      _assertEqual(lintLucideSubset(withFull, heads, row, 'bell\n', sha).length, 1, 'full upstream file back in js/vendor/');
      _assertEqual(lintLucideSubset(files, heads, row.replace('DERIVED', 'upstream'), 'bell\n', sha).length, 1, 'row not marked DERIVED');
      const wrongHash = row.replace('`sha384-x`', '`sha384-z`');
      _assertEqual(lintVendorManifest(files, wrongHash).length > 0, true, 'a wrong sha384 in the row is caught by lintVendorManifest');
    },
  },
  // ---- N-301 (SEC-12b): delegated actions + inline-handler ratchet -------
  {
    name: 'N-301 act()/actOn() — attribute shape, escaping and JSON round trip (AC1-3)',
    fn: function () {
      _assertEqual(act('x'), ' data-act="x"', 'bare click');
      _assertEqual(actOn('change', 'x'), ' data-act-change="x"', 'bare change');
      _assertEqual(actOn('click', 'x.stop'), ' data-act="x.stop"', 'actOn click → data-act, modifiers kept');
      _assertEqual(act('x', 1), ' data-act="' + escHtml(JSON.stringify(['x', 1])) + '"', 'value is escHtml(JSON)');
      const nasty = ["it's", 'say "hi"', 'back\\slash', '<b>&amp;</b>', '</script><script>alert(1)</script>', 'line1\nline2', 'café — 😀'];
      const args = nasty.concat([0, -1.5, null, true, false, { a: [1, 'b'], c: { d: null } }, ['x', 2]]);
      const out = act('fn.prevent', ...args);
      const m = /^ data-act="([^"]*)"$/.exec(out);
      _assertEqual(!!m, true, 'one double-quoted attribute, no raw " inside');
      _assertEqual(m[1].indexOf("'") < 0 && m[1].indexOf('<') < 0 && m[1].indexOf('>') < 0, true, "no raw ' < > in the value");
      const decoded = _actParseValue(_actUnescapeForTest(m[1]));
      _assertEqual(decoded.spec, 'fn.prevent', 'spec round trip');
      _assertEqual(decoded.args, args, 'args round trip');
      ['undefined', 'NaN', 'Infinity', 'nested undefined', 'function'].forEach(function (label, i) {
        const bad = [undefined, NaN, Infinity, { a: undefined }, function () {}][i];
        let threw = false;
        try { act('x', bad); } catch (e) { threw = true; }
        _assertEqual(threw, true, 'act rejects ' + label);
      });
      let threw = false;
      try { actOn('hover', 'x'); } catch (e) { threw = /ACT_EVENTS/.test(e.message); }
      _assertEqual(threw, true, 'actOn rejects an event type outside ACT_EVENTS');
      threw = false;
      try { act('x.bogus'); } catch (e) { threw = true; }
      _assertEqual(threw, true, 'act rejects an unknown modifier');
      threw = false;
      try { act('not a name'); } catch (e) { threw = true; }
      _assertEqual(threw, true, 'act rejects an invalid name');
    },
  },
  {
    name: 'N-301 dispatcher — placeholders, walk order, modifiers, error isolation, event routing (AC4-7, AC9)',
    fn: function () {
      const t = _actTestRig();
      // AC4 placeholders
      const input = t.el({ 'data-act-change': JSON.stringify(['rec', { $: 'el' }, { $: 'event' }, { $: 'value' }, { $: 'checked' }, { $: 'html' }, { $: 'el', other: 1 }]) }, null, { value: 'v', checked: true, innerHTML: '<i>h</i>' });
      const ev = t.evt('change', input);
      _actDispatch(ev, t.registry, t.report);
      _assertEqual(t.calls.length, 1, 'placeholder action ran once');
      const a = t.calls[0].args;
      _assertEqual(a[0] === input && a[1] === ev, true, 'ACT_EL / ACT_EVENT');
      _assertEqual([a[2], a[3], a[4]], ['v', true, '<i>h</i>'], 'ACT_VALUE / ACT_CHECKED / ACT_HTML');
      _assertEqual(a[5], { $: 'el', other: 1 }, 'object with more than $ passes through as data');
      _assertEqual([ACT_EL, ACT_EVENT, ACT_VALUE, ACT_CHECKED, ACT_HTML].map(p => p.$), ['el', 'event', 'value', 'checked', 'html'], 'exported placeholder constants');
      t.reset();
      _actDispatch(t.evt('click', t.el({ 'data-act': '["rec",{"$":"bogus"}]' })), t.registry, t.report);
      _assertEqual([t.calls.length, t.errors.length], [0, 1], 'unknown placeholder reported, action not called');

      // AC5 walk order, skipping un-marked elements, text-node target
      t.reset();
      const outer = t.el({ 'data-act': '["rec","outer"]' });
      const mid = t.el({}, outer);
      const inner = t.el({ 'data-act': '["rec","inner"]' }, mid);
      const text = { nodeType: 3, parentElement: inner };
      _actDispatch(t.evt('click', text), t.registry, t.report);
      _assertEqual(t.calls.map(c => c.args[0]), ['inner', 'outer'], 'child first, then parent; text target walks from its parent');

      // AC6 modifiers
      t.reset();
      const p1 = t.el({ 'data-act': '["rec","parent"]' });
      const c1 = t.el({ 'data-act': '["rec.prevent.stop","child"]' }, p1);
      const e1 = t.evt('click', c1);
      _actDispatch(e1, t.registry, t.report);
      _assertEqual(t.calls.map(c => c.args[0]), ['child'], '.stop ends the walk — parent not run');
      _assertEqual(e1.log, ['preventDefault', 'rec', 'stopPropagation', 'stopImmediatePropagation'], '.prevent before the action, .stop after');
      t.reset();
      const p2 = t.el({ 'data-act': '["rec","parent"]' });
      const overlay = t.el({ 'data-act': '["rec.self","overlay"]' }, p2);
      const btn = t.el({}, overlay);
      _actDispatch(t.evt('click', btn), t.registry, t.report);
      _assertEqual(t.calls.map(c => c.args[0]), ['parent'], '.self skipped when target is a descendant, walk continues');
      t.reset();
      _actDispatch(t.evt('click', overlay), t.registry, t.report);
      _assertEqual(t.calls.map(c => c.args[0]), ['overlay', 'parent'], '.self runs when the target is the element');
      t.reset();
      _actDispatch(t.evt('click', t.el({ 'data-act': 'rec.bogus' })), t.registry, t.report);
      _assertEqual([t.calls.length, t.errors.length], [0, 1], 'unknown modifier reported');

      // AC7 error isolation
      t.reset();
      const root = t.el({ 'data-act': '["rec","root"]' });
      const l3 = t.el({ 'data-act': '[bad json' }, root);
      const l2 = t.el({ 'data-act': 'boom' }, l3);
      const l1 = t.el({ 'data-act': 'missingAction' }, l2);
      _actDispatch(t.evt('click', l1), t.registry, t.report);
      _assertEqual(t.calls.map(c => c.args[0]), ['root'], 'unknown action, throwing action and bad JSON each reported; the walk still reaches the root');
      _assertEqual(t.errors.length, 3, 'three errors reported');
      _assertEqual(/Unknown action "missingAction"/.test(t.errors[0].message), true, 'unknown action names itself');
      _assertEqual(t.errors[1].message, 'kaboom', 'the action\'s own error is reported as-is');

      // AC9 routing: change ignores data-act; a click ignores data-act-change
      t.reset();
      const both = t.el({ 'data-act': '["rec","click"]', 'data-act-change': '["rec","change"]' });
      _actDispatch(t.evt('change', both), t.registry, t.report);
      _actDispatch(t.evt('click', both), t.registry, t.report);
      _assertEqual(t.calls.map(c => c.args[0]), ['change', 'click'], 'each event type reads its own attribute');
      const added = [];
      _actInstall({ addEventListener: (type, fn, capture) => added.push(type + ':' + capture) }, t.registry, t.report);
      _assertEqual(added, ACT_EVENTS.map(ty => ty + ':' + (ty === 'error')), 'one listener per ACT_EVENTS type; error in capture phase only');
      _assertEqual(ACT_EVENTS.slice().sort(), ['change', 'click', 'dblclick', 'error', 'input', 'keydown', 'keyup', 'mousedown', 'mouseup', 'submit'], 'ACT_EVENTS covers every event type in use (N-301 survey)');
    },
  },
  {
    name: 'N-301 registerActions — duplicates, bad values and bad keys rejected; no window fallback (AC8, AC10)',
    fn: function () {
      const reg = Object.create(null);
      _actRegisterInto(reg, { a: function () {} });
      const rejects = function (map, label, re) {
        let msg = null;
        try { _actRegisterInto(reg, map); } catch (e) { msg = e.message; }
        _assertEqual(msg !== null && re.test(msg), true, label + ' (' + msg + ')');
      };
      rejects({ a: function () {} }, 'duplicate name', /"a" is already registered/);
      rejects({ b: 'not a function' }, 'non-function value', /"b" is not a function/);
      rejects({ 'bad-name': function () {} }, 'invalid key', /invalid action name/);
      rejects(null, 'not an object', /expected an object/);
      rejects({ c: function () {}, a: function () {} }, 'atomic: a batch with one duplicate', /already registered/);
      _assertEqual('c' in reg, false, 'nothing from a rejected batch is registered');
      // Registry-only lookup: a global with the action's name is never called.
      const errors = [];
      let called = false;
      const g = (typeof globalThis !== 'undefined') ? globalThis : this;
      g.__n301GlobalOnly = function () { called = true; };
      const el = { nodeType: 1, parentElement: null, tagName: 'BUTTON', hasAttribute: n => n === 'data-act', getAttribute: () => '__n301GlobalOnly' };
      _actDispatch({ type: 'click', target: el }, reg, e => errors.push(e));
      delete g.__n301GlobalOnly;
      _assertEqual([called, errors.length], [false, 1], 'a global function is not reachable by name');
      // AC10: the real registry holds the built-in noop; loading in the vm installed nothing.
      _assertEqual(typeof _ACT_REGISTRY.noop, 'function', 'built-in noop registered');
      // In the Node vm there is no document, so loading actions.js must not have
      // touched one (it would have thrown). The browser harness has a real one.
      if (typeof window === 'undefined') _assertEqual(typeof document, 'undefined', 'vm has no document — install guard skipped');
    },
  },
  {
    name: 'N-301 inline handlers: per-file counts equal INLINE_HANDLER_BASELINE (SEC-12b ratchet)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintInlineHandlers(ALL_SOURCES, ALL_HTML, INLINE_HANDLER_BASELINE), [], 'inline handler ratchet');
      _assertEqual(countInlineHandlers(ALL_SOURCES['nav-core.js']), 0, 'nav-core.js pilot: no inline handlers');
      _assertEqual('js/nav-core.js' in INLINE_HANDLER_BASELINE, false, 'nav-core.js has no baseline entry');
      _assertEqual(lintJavascriptUrls(ALL_SOURCES, ALL_HTML), [], 'no javascript: URLs');
      _assertEqual(lintActNames(ALL_SOURCES, ALL_HTML), [], 'every literal action name is registered once');
      const regs = readActionRegistrations(ALL_SOURCES).registered;
      ['navGo', 'navToggleModules', 'navOpenCmdBar', 'navSignOut', 'refreshModuleData', 'toggleTheme', 'toggleDensity'].forEach(n =>
        _assertEqual(regs[n], ['js/nav-core.js'], 'nav-core registers ' + n));
      _assertEqual(regs.noop, ['js/actions.js'], 'actions.js registers noop');
    },
  },
  {
    name: 'lint-inline-handlers controls: counter, ratchet both ways, stale/new files, javascript: URLs, action names (N-301)',
    fn: function () {
      // Counter: what counts and what doesn't.
      _assertEqual(countInlineHandlers('<a onclick="x()">'), 1, 'double-quoted');
      _assertEqual(countInlineHandlers("<a onclick='x()'>"), 1, 'single-quoted');
      _assertEqual(countInlineHandlers('<a ONCLICK="x()">'), 1, 'HTML attribute names are case-insensitive');
      _assertEqual(countInlineHandlers('h += "<a onclick=\\"x()\\">";'), 1, 'escaped quote inside a JS string');
      _assertEqual(countInlineHandlers('<a onclick=${fn}>'), 1, '${ value');
      _assertEqual(countInlineHandlers("el.setAttribute('onclick', 'x()');"), 1, "setAttribute('onclick'");
      _assertEqual(countInlineHandlers('<select onchange="a()" oninput="b()" onkeydown="c()">'), 3, 'several on one element');
      _assertEqual(countInlineHandlers('el.onclick = fn; const only = \'x\'; let onDone = "y"; if (on === "z") {}'), 0, 'DOM property, onDone, only, on === not counted');
      _assertEqual(countInlineHandlers('<a data-act-click="x" data-act-change="y" data-onclick="z">'), 0, 'data-act-* / data-on* not counted');
      _assertEqual(countInlineHandlers('<section class="x" button="y">'), 0, 'words containing "on" not counted');
      // Ratchet.
      const js = { 'a.js': '<a onclick="x()"><b onclick="y()">', 'clean.js': 'x' };
      const html = { 'p.html': '<a onclick="z()">' };
      const base = { 'js/a.js': 2, 'p.html': 1 };
      _assertEqual(lintInlineHandlers(js, html, base), [], 'control: exact match is clean');
      const raised = lintInlineHandlers({ 'a.js': js['a.js'] + '<c onclick="q()">', 'clean.js': 'x' }, html, base);
      _assertEqual(raised.length === 1 && /raised from 2 to 3/.test(raised[0]), true, 'raised flagged: ' + raised);
      const lowered = lintInlineHandlers({ 'a.js': '<a onclick="x()">', 'clean.js': 'x' }, html, base);
      _assertEqual(lowered.length === 1 && /lower INLINE_HANDLER_BASELINE to 1/.test(lowered[0]), true, 'lowered flagged: ' + lowered);
      const zero = lintInlineHandlers({ 'a.js': 'none', 'clean.js': 'x' }, html, base);
      _assertEqual(zero.length === 1 && /delete the INLINE_HANDLER_BASELINE entry/.test(zero[0]), true, 'down to 0 → delete the entry: ' + zero);
      const fresh = lintInlineHandlers({ 'a.js': js['a.js'], 'clean.js': '<a onclick="n()">' }, html, base);
      _assertEqual(fresh.length === 1 && /js\/clean\.js: 1 inline .* no INLINE_HANDLER_BASELINE entry/.test(fresh[0]), true, 'new file with a handler flagged: ' + fresh);
      const stale = lintInlineHandlers(js, html, Object.assign({ 'js/gone.js': 3 }, base));
      _assertEqual(stale.length === 1 && /js\/gone\.js: .* no longer exists/.test(stale[0]), true, 'stale entry flagged: ' + stale);
      _assertEqual(lintInlineHandlers(js, html, Object.assign({ 'js/clean.js': 0 }, base)).length, 1, 'a 0 entry flagged');
      // javascript: URLs.
      _assertEqual(lintJavascriptUrls({ 'x.js': 'a\n<a href="javascript:void(0)">' }, { 'p.html': "<a href='javascript:x()'>" }).map(v => v.file + ':' + v.line), ['js/x.js:2', 'p.html:1'], 'javascript: URLs flagged');
      _assertEqual(lintJavascriptUrls({ 'x.js': '// Everything else — javascript:, data: — is refused' }, {}), [], 'a mention outside an attribute is fine');
      // Action names.
      const reg = "registerActions({\n  alpha,\n  beta: function (a) { return { x: 1 }; },\n  gamma(b) {},\n});\n";
      _assertEqual(lintActNames({ 'r.js': reg, 'u.js': "x = `${act('alpha')}${act('beta.prevent.stop', 1)}${actOn('change', 'gamma', ACT_VALUE)}`;" }, { 'p.html': '<a data-act="alpha"><b data-act-change=\'["beta",1]\'>' }), [], 'control: registered names (shorthand, property, method; modifiers stripped; html bare + JSON) are clean');
      const unreg = lintActNames({ 'r.js': reg, 'u.js': "x = act('delta') + actOn('input', 'epsilon');" }, { 'p.html': '<a data-act="zeta">' });
      _assertEqual(unreg.length, 3, 'unregistered names flagged: ' + unreg);
      const dup = lintActNames({ 'r.js': reg, 's.js': 'registerActions({ alpha: f });' }, {});
      _assertEqual(dup.length === 1 && /"alpha" registered more than once/.test(dup[0]), true, 'duplicate registration flagged: ' + dup);
      _assertEqual(lintActNames({ 'r.js': 'const m = {}; registerActions(m);' }, {}).length, 1, 'non-literal registration flagged');
      _assertEqual(lintActNames({ 'a.js': 'function registerActions(map) {}\n// act(\'commentedOut\')' }, {}), [], 'the definition and commented examples are ignored');
    },
  },
  // ---- N-321: lintActNames reads retryAct / actionAct / mobilePageError -----
  {
    name: 'N-321: lintActNames reads retryAct / actionAct / mobilePageError arrays (controls + mutation proof)',
    fn: function () {
      const reg = 'registerActions({ goodOne, goodTwo, mobileRetryOk });';
      const lint = src => lintActNames({ 'r.js': reg, 'u.js': src }, {});
      const uses = src => readActionUses({ 'u.js': src }, {}).map(u => u.name);
      const flagged = (src, name) => {
        const p = lint(src);
        _assertEqual(p.length === 1 && p[0].indexOf('action "' + name + '" is not registered') !== -1, true, 'flagged ' + name + ': ' + p);
      };
      // Unregistered / typo'd names are flagged.
      flagged("x = pageErrorBlock({ message: e.message, retryAct: ['badRetry'] });", 'badRetry');
      flagged("x = emptyStateBlock({ actionLabel: 'Add', actionAct: ['badAction'] });", 'badAction');
      flagged("x = emptyStateRow({ colspan: 3, actionAct: canEdit ? ['badTernary'] : null });", 'badTernary');
      flagged("x = pageErrorBlock({\n  message: e.message,\n  retryAct:\n    ['badMultiline', recordType, 1],\n});", 'badMultiline');
      flagged("main.innerHTML = mobilePageError(e.message, ['mobileRetryBad']);", 'mobileRetryBad');
      flagged("main.innerHTML = mobilePageError(fmt(a, 'b, c'), ['mobileRetryBad2', !!x]);", 'mobileRetryBad2');
      // Registered names are clean; modifiers are stripped; a null ternary arm is ignored.
      _assertEqual(lint("a = pageErrorBlock({ retryAct: ['goodOne'] }); b = emptyStateBlock({ actionAct: canEdit ? ['goodTwo'] : null });"), [], 'control: registered names are clean');
      _assertEqual(uses("x = pageErrorBlock({ retryAct: ['goodOne.prevent', 1] });"), ['goodOne'], 'modifier stripped');
      _assertEqual(lint("x = pageErrorBlock({\n  retryAct:\n    ['goodOne', recordType, 1],\n});"), [], 'control: multi-line value is read and clean');
      _assertEqual(lint("main.innerHTML = mobilePageError(e.message, ['mobileRetryOk', !!x]);"), [], 'control: registered mobilePageError Retry is clean');
      // Non-literals, defaults, shorthand, look-alikes, comments and the definition are skipped.
      ["x = pageErrorBlock({ retryAct: [fn] });", "x = pageErrorBlock({ retryAct: retryAct });", "x = pageErrorBlock({ retryAct: null });",
        "x = pageErrorBlock({ retryAct: [`bad${y}`] });", "function f({ retryAct = null } = {}) {}", "x = pageErrorBlock({ message, retryAct });",
        "x = { myretryAct: ['ghost'], o.actionAct: ['ghost'] };", "// retryAct: ['ghost']\n/* actionAct: ['ghost'] */",
        "function mobilePageError(message, retryAct) { return act(...retryAct); }", "x = mobilePageError(e.message, retryAct);", "x = mobilePageError(e.message);"
      ].forEach(src => { _assertEqual(uses(src), [], 'skipped: ' + src); _assertEqual(lint(src), [], 'no problem: ' + src); });
      // Mutation proof on the real sources: one typo per call form fails the lint.
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintActNames(ALL_SOURCES, ALL_HTML), [], 'the live sources are clean');
      [
        ['mobile-sales.js', "mobilePageError(e.message, ['mobileRetrySalesForecast'])", "mobilePageError(e.message, ['mobileRetrySalesForcast'])", 'mobileRetrySalesForcast'],
        ['lci-pages.js', "retryAct: ['renderLCIModelsPage']", "retryAct: ['renderLCIModelsPge']", 'renderLCIModelsPge'],
        ['pages.js', "actionAct: canEdit ? ['showAddRoleForm'] : null", "actionAct: canEdit ? ['showAddRoleFrm'] : null", 'showAddRoleFrm'],
      ].forEach(([file, from, to, bad]) => {
        _assertEqual(ALL_SOURCES[file].split(from).length, 2, file + ': mutation target appears exactly once');
        const mutated = Object.assign({}, ALL_SOURCES);
        mutated[file] = mutated[file].replace(from, to);
        const p = lintActNames(mutated, ALL_HTML);
        _assertEqual(p.length === 1 && p[0].indexOf('js/' + file) === 0 && p[0].indexOf('"' + bad + '"') !== -1, true, file + ': typo fails the lint: ' + p);
      });
    },
  },
  // ---- N-302b hotfix: act()/actOn() shadowing -----------------------------
  {
    name: 'N-302b hotfix lint: no local act / actOn shadows the action builders',
    fn: function () {
      const call = "x = `${act('go', 1)}`;\n";
      const bad = {
        'a.js': call + 'const act = rows[0];',
        'b.js': call + 'const { hc, spans: act } = actuals[i];',
        'c.js': call + 'rows.map(act => act.id);',
        'd.js': call + 'rows.map((act, i) => i);',
        'e.js': call + 'function render(row, act) {}',
        'f.js': call + 'const f = function (a, { b: act }) {};',
        'g.js': call + 'function act() {}',
        'h.js': "y = actOn('click', 'go');\nlet [first, actOn] = list;",
        'i.js': call + 'try { f(); } catch (act) {}',
      };
      const found = lintActShadowing(bad);
      _assertEqual(found.length, 9, 'all nine shadowing shapes flagged: ' + found);
      _assertEqual(/^js\/b\.js: a local "act" shadows the act\(\) action builder/.test(found[1]) && /"actOn"/.test(found[7]), true, 'message names file and builder: ' + found[1]);
      const clean = {
        'a.js': call + 'const { hc, spans: actual } = actuals[i]; const t = actual.nStart + row.act + obj.actOn;',
        'b.js': 'const act = 1; // no act( call in this file, so nothing to shadow',
        'c.js': call + 'const o = { act: 1, actOn: 2 }; const { act: renamed } = o; const action = 1; const react = 2;',
        'd.js': call + "// const act = 1; and (act) => 1 in a comment only",
        'e.js': call + "const f = (a, b = act('x')) => a;",
        'actions.js': 'function act(spec) {}\nfunction actOn(t, s) {}\nconst z = act("a");',
      };
      _assertEqual(lintActShadowing(clean), [], 'near-misses pass (renamed alias, property, comment, default value, no call, actions.js exempt)');
      if (typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintActShadowing(ALL_SOURCES), [], 'no file that calls act() / actOn() declares a local of that name');
    },
  },
  // ---- N-302a (SEC-12b step 2): shared layer ------------------------------
  {
    name: 'N-302a lints: legacy code-string params gone; list-control callbacks are registered actions',
    fn: function () {
      // Controls first (run in the browser harness too).
      const legacy = lintLegacyActionParams({
        'a.js': 'x({ retryOnClick: "f()" });',
        'mobile-app.js': 'function mobilePageError(m, retryOnClick) {}',
        'c.js': '// retryOnClick and actionOnClick are mentioned in a comment only\nvar y = 1;',
      });
      _assertEqual(legacy.length === 2 && /^js\/a\.js: "retryOnClick" is retired/.test(legacy[0]) && /^js\/mobile-app\.js: "retryOnClick" is retired/.test(legacy[1]), true, 'legacy param flagged in every file (mobile-app.js is no longer exempt), comments ignored: ' + legacy);
      _assertEqual(lintLegacyActionParams({ 'b.js': 'emptyStateBlock({ actionOnClick: "f()" })' }).length, 1, 'actionOnClick flagged');
      const reg = 'registerActions({ setA });';
      const use = "const h = listSearchBox(v, 'setA') + sortableHeader('L', 'k', s, 'setB') + pageSizeDropdown(n, cb)\n"
        + "  + `${periodFilterDropdown(w,\n      \"setC\")}` + projectFilterDropdown(p, id, 'setA');\n"
        + "function listSearchBox(value, callbackFn) {}\n// listSearchBox(v, 'setIgnored')\n";
      const cbs = lintListControlCallbacks({ 'r.js': reg, 'u.js': use });
      _assertEqual(cbs.length, 2, 'two unregistered literal callbacks flagged (setB, setC), variable/definition/comment skipped: ' + cbs);
      _assertEqual(cbs.some(m => /sortableHeader\(\) callback "setB"/.test(m)) && cbs.some(m => /periodFilterDropdown\(\) callback "setC"/.test(m)), true, 'messages name helper + callback: ' + cbs);
      _assertEqual(lintListControlCallbacks({ 'r.js': 'registerActions({ setA, setB, setC });', 'u.js': use }), [], 'registered callbacks pass');
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintLegacyActionParams(ALL_SOURCES), [], 'no actionOnClick / retryOnClick left in js/');
      _assertEqual(lintListControlCallbacks(ALL_SOURCES), [], 'every list-controls callback is a registered action');
      const regs = readActionRegistrations(ALL_SOURCES).registered;
      _assertEqual(regs.signIn, ['js/auth.js'], 'auth.js registers signIn');
      _assertEqual(regs.printPage, ['js/ui-kit.js'], 'ui-kit.js registers printPage');
      _assertEqual(regs.updateRoleStage, ['js/pages.js'], 'pages.js registers updateRoleStage');
      _assertEqual(regs.unlockStageEdit, ['js/pages.js'], 'pages.js registers unlockStageEdit');
      _assertEqual(regs.setRolesSort, ['js/pages.js'], 'pages.js registers its list setters');
      _assertEqual(regs.exitGhostMode, ['js/utils.js'], 'utils.js registers exitGhostMode');
      _assertEqual(regs.notifToggle, ['js/notifications.js'], 'notifications.js registers notifToggle');
      ['js/utils.js', 'js/list-controls.js', 'js/notifications.js'].forEach(f =>
        _assertEqual(f in INLINE_HANDLER_BASELINE, false, f + ' has no baseline entry (0 inline handlers)'));
    },
  },
  {
    name: 'N-302a shared helpers emit data-act, not inline handlers (empty states, retry, list controls, stage cell, table toolbar)',
    fn: function () {
      // [{ attr, spec, args }] for every data-act / data-act-<type> attribute in an HTML string.
      const acts = html => {
        const out = []; const re = /\sdata-act(-[a-z]+)?="([^"]*)"/g; let m;
        while ((m = re.exec(html)) !== null) {
          const v = _actUnescapeForTest(m[2]);
          const a = v.charAt(0) === '[' ? JSON.parse(v) : [v];
          out.push({ attr: 'data-act' + (m[1] || ''), spec: a[0], args: a.slice(1) });
        }
        return out;
      };
      const noInline = (html, label) => _assertEqual(/\son[a-z]+\s*=/i.test(html), false, label + ': no inline handler attribute');
      // emptyStateBlock
      let h = emptyStateBlock({ message: 'None', actionLabel: 'Add role', actionAct: ['showAddRoleForm'] });
      noInline(h, 'emptyStateBlock');
      _assertEqual(acts(h), [{ attr: 'data-act', spec: 'showAddRoleForm', args: [] }], 'bare action, no args');
      h = emptyStateBlock({ message: 'None', actionLabel: 'Open', actionAct: ['openThing', "O'Brien \"x\" <b>", 5, null] });
      _assertEqual(acts(h)[0].args, ["O'Brien \"x\" <b>", 5, null], 'args are data: quotes, markup, number, null survive');
      _assertEqual(h.indexOf("O'Brien") === -1 && h.indexOf('<b>') === -1, true, 'no raw quote/markup leaks out of the attribute');
      _assertEqual(acts(emptyStateBlock({ message: 'None', actionLabel: 'Add', actionAct: null })), [], 'null actionAct → no button');
      _assertEqual(acts(emptyStateBlock({ message: 'None', actionLabel: 'Add', actionAct: [] })), [], 'empty actionAct → no button');
      _assertEqual(acts(emptyStateBlock({ message: 'None', actionAct: ['x'] })), [], 'no label → no button');
      // emptyStateRow — was `…;return false;`, now .prevent
      h = emptyStateRow({ colspan: 3, message: 'None', actionLabel: 'Add', actionAct: ['showAddRoleForm'] });
      noInline(h, 'emptyStateRow');
      _assertEqual(acts(h), [{ attr: 'data-act', spec: 'showAddRoleForm.prevent', args: [] }], 'row link prevents the # navigation');
      _assertEqual(acts(emptyStateRow({ colspan: 3, actionLabel: 'Go', actionAct: ['go.prevent', 1] }))[0].spec, 'go.prevent', '.prevent is not doubled');
      _assertEqual(acts(emptyStateRow({ colspan: 3, message: 'None' })), [], 'row without an action');
      // pageErrorBlock
      h = pageErrorBlock({ message: 'Boom', retryAct: ['openChecklist', 'role', 5] });
      noInline(h, 'pageErrorBlock');
      _assertEqual(acts(h), [{ attr: 'data-act', spec: 'openChecklist', args: ['role', 5] }], 'retry button carries the action and args');
      _assertEqual(/>Retry</.test(h), true, 'Retry label shown');
      _assertEqual(acts(pageErrorBlock({ message: 'Boom' })), [], 'no retryAct → no Retry button');
      _assertEqual(/>Retry</.test(pageErrorBlock({ message: 'Boom' })), false, 'no Retry label without retryAct');
      // list-controls
      const VALUE = { $: 'value' };
      h = projectFilterDropdown([], '', 'setRolesProject');
      noInline(h, 'projectFilterDropdown');
      _assertEqual(acts(h), [{ attr: 'data-act-change', spec: 'setRolesProject', args: [VALUE] }], 'project filter → change + ACT_VALUE');
      h = periodFilterDropdown(4, 'setActivityWeeks'); noInline(h, 'periodFilterDropdown');
      _assertEqual(acts(h), [{ attr: 'data-act-change', spec: 'setActivityWeeks', args: [VALUE] }], 'period filter');
      h = pageSizeDropdown(10, 'setRolesPageSize'); noInline(h, 'pageSizeDropdown');
      _assertEqual(acts(h), [{ attr: 'data-act-change', spec: 'setRolesPageSize', args: [VALUE] }], 'page size');
      h = listSearchBox('a "b"', 'setRolesSearch'); noInline(h, 'listSearchBox');
      _assertEqual(acts(h), [{ attr: 'data-act-input', spec: 'setRolesSearch', args: [VALUE] }], 'search box → input + ACT_VALUE');
      h = sortableHeader('Name', "o'k", { key: "o'k", dir: 'asc' }, 'setRolesSort'); noInline(h, 'sortableHeader');
      _assertEqual(acts(h), [{ attr: 'data-act', spec: 'setRolesSort', args: ["o'k"] }], 'sort header passes the key as data');
      _assertEqual(/aria-sort="ascending"/.test(h) && /data-sort-key="o'k"/.test(h), true, 'sort header keeps aria-sort and data-sort-key');
      // Roles stage cell
      h = stageSelectHtml(7, 'Sourcing'); noInline(h, 'stageSelectHtml');
      _assertEqual(acts(h), [{ attr: 'data-act-change', spec: 'updateRoleStage', args: [7, { $: 'el' }] }], 'stage select: numeric id + ACT_EL');
      h = stageBadgeHtml(7, "St'age", true); noInline(h, 'stageBadgeHtml');
      _assertEqual(acts(h), [{ attr: 'data-act', spec: 'unlockStageEdit', args: [7, "St'age"] }], 'unlock button: numeric id, string stage');
      _assertEqual(acts(stageBadgeHtml(7, 'Sourcing', false)), [], 'no unlock button without edit rights');
      // Rich-text table toolbar
      h = rtTableToolbarButtonHtml(); noInline(h, 'rtTableToolbarButtonHtml');
      _assertEqual(acts(h), [{ attr: 'data-act-mousedown', spec: 'noop.prevent', args: [] }, { attr: 'data-act', spec: 'rtInsertTable', args: [] }], 'table button keeps the editor selection (mousedown prevent) then inserts');
      // rtUpdateToolbarState finds buttons by data-rt / data-rt-block, never by handler text.
      const seen = []; const toggled = [];
      const btn = sel => ({ classList: { toggle: (c, on) => toggled.push(sel + '=' + on) } });
      const toolbar = { querySelector: sel => { seen.push(sel); return btn(sel); } };
      // N-359: stub passed as an argument — a browser ignores `globalThis.document = …`.
      rtUpdateToolbarState(toolbar, { queryCommandState: () => true, queryCommandValue: () => 'H3' });
      _assertEqual(seen, ['button[data-rt="bold"]', 'button[data-rt="italic"]', 'button[data-rt="underline"]',
        'button[data-rt="insertUnorderedList"]', 'button[data-rt="insertOrderedList"]', 'button[data-rt-block="H3"]', 'button[data-rt-block="P"]'], 'selectors use data-rt / data-rt-block');
      _assertEqual(toggled.indexOf('button[data-rt-block="H3"]=true') !== -1 && toggled.indexOf('button[data-rt-block="P"]=false') !== -1, true, 'H3 active, P inactive when the block is H3');
      // The four editors' toolbar buttons carry the hooks (source scan).
      if (typeof ALL_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      [['briefing-pack.js', 'bp'], ['report-builder.js', 'rb'], ['market-report.js', 'mr'], ['lci-report.js', 'lciReport']].forEach(function (p) {
        const src = ALL_SOURCES[p[0]];
        ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'].forEach(cmd =>
          _assertEqual(src.indexOf("act('" + p[1] + "Format', '" + cmd + "')} data-rt=\"" + cmd + "\"") !== -1, true, p[0] + ': ' + cmd + ' button has data-rt'));
        ['H3', 'P'].forEach(tag =>
          _assertEqual(src.indexOf("act('" + p[1] + "FormatBlock', '" + tag + "')} data-rt-block=\"" + tag + "\"") !== -1, true, p[0] + ': ' + tag + ' button has data-rt-block'));
      });
    },
  },
  // ---- N-302e (SEC-12b step 2): Market Analytics, Command Centre, Admin, shell pages ----
  {
    name: 'N-302e lints: registrations and act() calls in the inline scripts of root HTML pages are read; only the mobile app keeps inline handlers',
    fn: function () {
      // Controls first (run in the browser harness too).
      const page = '<html><body><a data-act="alpha"></a>'
        + '<script src="js/x.js" defer></script>'
        + '<script>\n  // registerActions({ commentedOut });\n  document.addEventListener("DOMContentLoaded", () => registerActions({\n    alpha,\n    beta,\n  }));\n'
        + '  const h = `<b${act("beta.prevent")}${actOn("change", "gamma", ACT_VALUE)}>`;\n</script></body></html>';
      const reg0 = readActionRegistrations({}, { 'p.html': page });
      _assertEqual(reg0.registered, { alpha: ['p.html'], beta: ['p.html'] }, 'inline-script registerActions read (commented example and src script ignored)');
      _assertEqual(reg0.problems, [], 'no problems');
      const uses = readActionUses({}, { 'p.html': page }).map(u => u.file + ':' + u.name).sort();
      _assertEqual(uses, ['p.html:alpha', 'p.html:beta', 'p.html:gamma'], 'attribute and inline-script act()/actOn() uses read');
      const un = lintActNames({}, { 'p.html': page });
      _assertEqual(un.length === 1 && /p\.html: action "gamma" is not registered/.test(un[0]), true, 'an unregistered name used in an inline script is flagged: ' + un);
      const dup = lintActNames({ 'r.js': 'registerActions({ alpha: f });' }, { 'p.html': page.replace('gamma', 'beta') });
      _assertEqual(dup.length === 1 && /"alpha" registered more than once: js\/r\.js, p\.html/.test(dup[0]), true, 'a name registered in js/ and in a page is flagged: ' + dup);
      _assertEqual(lintActNames({}, { 'p.html': '<script>registerActions(m);</script>' }).length, 1, 'non-literal registration in a page flagged');
      _assertEqual(readActionRegistrations({ 'r.js': 'registerActions({ a });' }).registered, { a: ['js/r.js'] }, 'the html argument is optional');
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      const regs = readActionRegistrations(ALL_SOURCES, ALL_HTML).registered;
      _assertEqual(regs.switchTab, ['js/admin-page.js'], 'admin-page.js registers switchTab (N-303: moved out of admin.html)');
      ['openQuickLinks', 'closeQuickLinks', 'handleSignOut', 'refreshCCBanner'].forEach(n =>
        _assertEqual(regs[n], ['js/home.js'], 'home.js registers ' + n + ' (N-303: moved out of index.html)'));
      _assertEqual(regs.show, ['js/readme-page.js'], 'readme-page.js registers show (N-303: moved out of Readme.html)');
      _assertEqual(regs.ccCollapseTile, ['js/cc-pages.js'], 'cc-pages.js registers ccCollapseTile');
      _assertEqual(regs.submitAssignment, ['js/os-admin.js'], 'os-admin.js registers submitAssignment');
      _assertEqual(regs.mrTitleInput, ['js/market-report.js'], 'market-report.js registers mrTitleInput');
      _assertEqual(regs.renderAdminTab, ['js/admin.js'], 'admin.js registers renderAdminTab');
      // Only the mobile app still has inline handlers.
      _assertEqual(Object.keys(INLINE_HANDLER_BASELINE).filter(f => !/mobile/.test(f)), [], 'every non-mobile file is at 0 (no baseline entry)');
      // Nothing selects an element by its handler text any more.
      Object.keys(ALL_SOURCES).forEach(f => _assertEqual(/\[onclick[\^$*]?=/.test(ALL_SOURCES[f]), false, f + ': no [onclick=…] selector'));
      Object.keys(ALL_HTML).forEach(f => _assertEqual(/\[onclick[\^$*]?=/.test(ALL_HTML[f]), false, f + ': no [onclick=…] selector'));
    },
  },
  // ---- N-302f (SEC-12b step 2): mobile app --------------------------------
  {
    name: 'N-302f: the mobile app is fully converted (empty ratchet, registered actions, bottom-nav whitelist, Retry actions)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      // Step 2 of SEC-12b is complete: no file has an inline handler, so the baseline is empty.
      _assertEqual(INLINE_HANDLER_BASELINE, {}, 'INLINE_HANDLER_BASELINE is empty');
      const counts = inlineHandlerCounts(ALL_SOURCES, ALL_HTML);
      _assertEqual(Object.keys(counts).filter(f => counts[f] > 0), [], 'no file has an inline handler');
      _assertEqual(lintInlineHandlers(ALL_SOURCES, ALL_HTML, INLINE_HANDLER_BASELINE), [], 'ratchet clean against the empty baseline');
      // Each action is registered once, by the file that owns it.
      const regs = readActionRegistrations(ALL_SOURCES, ALL_HTML).registered;
      const owners = {
        'js/auth.js': ['signIn'],
        'js/mobile-app.js': ['mobileSignOut', 'mobileBack', 'mobileToggleSwitcher', 'mobileSwitcherGo', 'mobileForceDesktop',
          'mobileCloseSheet', 'mobileNav', 'mobileNavItem', 'mobileOpenModule', 'mobileOpenAddRoleSheet',
          'mobileOpenActivitySheet', 'mobileOpenPlacementSheet', 'mobileOpenRejectionSheet'],
        'js/mobile-pages.js': ['mobileSelectRole', 'mobileSelectStage', 'mobileSaveStage', 'mobileLoadRolesForActivity',
          'mobileSubmitActivity', 'mobileLoadHeadcountForPlacement', 'mobilePlacementHeadcountChanged', 'mobileSubmitPlacement',
          'mobileRetryRoleDetail', 'mobileRetryStageUpdate', 'mobileRetryActivityForm', 'mobileRetryPlacementForm'],
        'js/mobile-reporting-ext.js': ['mobileRoleSearch', 'mobileRoleStageFilter', 'mobileSubmitRejection',
          'mobileRetryReportingSummary', 'mobileRetryRolesFiltered', 'mobileRetryRejectionForm'],
        'js/mobile-roleform.js': ['mobileLoadTPsForRole', 'mobileRoleCurrency', 'mobileRoleAutoTarget', 'mobileSubmitAddRole'],
        'js/mobile-sales.js': ['mobileSalesForecastForm', '_msfTypeChange', 'mobileSaveForecast', 'mobileRetrySalesForecast'],
        'js/mobile-scorecards.js': ['mScGo', 'mScPrev', 'mScNext', 'mobileRetryScorecards'],
        'js/mobile-analytics.js': ['mobileApplyAnalyticsFilters', 'mobileRetryPlacementAnalytics'],
        'js/mobile-people.js': ['mobileRetryPeopleDashboard'],
      };
      Object.keys(owners).forEach(file => owners[file].forEach(n => _assertEqual(regs[n], [file], n + ' is registered by ' + file)));
      // N-344: signOut() is declared once, by auth.js. Mobile's keeps-localStorage variant is mobileSignOut().
      const _declares = (f, n) => new RegExp('^\\s*function\\s+' + n + '\\s*\\(', 'm').test(_vendorStripJsComments(ALL_SOURCES[f]).join('\n'));
      _assertEqual(Object.keys(ALL_SOURCES).filter(f => _declares(f, 'signOut')), ['auth.js'], 'signOut() is declared by auth.js only');
      _assertEqual(_declares('mobile-app.js', 'mobileSignOut'), true, 'mobile-app.js declares mobileSignOut()');
      _assertEqual(/^\s*function\s+signOut\s*\(/m.test('function signOut() {}\n'), true, 'control: the declaration pattern matches a real declaration');
      // Bottom nav: a `sheet` key is looked up in a fixed map, never called by name.
      const appCode = _vendorStripJsComments(ALL_SOURCES['mobile-app.js']).join('\n');
      const navSheets = (appCode.match(/\bsheet:\s*'(\w+)'/g) || []).map(s => /'(\w+)'/.exec(s)[1]);
      _assertEqual(navSheets, ['mobileOpenActivitySheet', 'mobileOpenPlacementSheet', 'mobileOpenRejectionSheet'], 'MOBILE_NAV has three sheet items');
      const whitelist = /const MOBILE_NAV_SHEETS = \{([\s\S]*?)\n\};/.exec(appCode);
      _assertEqual(!!whitelist, true, 'MOBILE_NAV_SHEETS is declared');
      navSheets.forEach(s => _assertEqual(new RegExp('(^|\\s)' + s + '\\s*:').test(whitelist[1]), true, 'MOBILE_NAV_SHEETS has an opener for ' + s));
      _assertEqual(/\$\{\s*it\.sheet\s*\}\s*\(/.test(appCode), false, 'the bottom nav no longer builds a call from the sheet name');
      // Every mobilePageError() Retry name is checked by lintActNames (N-321); this guard proves the scan still has eleven calls to read.
      let retries = 0;
      Object.keys(ALL_SOURCES).filter(f => /^mobile-/.test(f) && f !== 'mobile-app.js').forEach(f => {
        const code = _vendorStripJsComments(ALL_SOURCES[f]).join('\n');
        retries += (code.match(/(^|[^\w.$])mobilePageError\s*\(/g) || []).length;
      });
      _assertEqual(retries, 11, 'eleven mobilePageError() calls (each Retry name is checked by lintActNames, N-321)');
    },
  },
  {
    name: "N-324 CSP style split: style-src-elem 'self', style-src-attr 'unsafe-inline', style-src as the CSP2 fallback (SEC-12c)",
    fn: function () {
      if (typeof lintCspPolicy === 'undefined') _skip('lint-csp.js not loaded — runs under node tests/run.js.');
      const d = _cspParse(CSP_CANONICAL);
      _assertEqual(d['style-src-elem'], ["'self'"], 'style-src-elem');
      _assertEqual(d['style-src-attr'], ["'unsafe-inline'"], 'style-src-attr');
      _assertEqual(d['style-src'], ["'self'", "'unsafe-inline'"], 'style-src (fallback for browsers without CSP Level 3)');
      // Positive controls: each drift is caught, or lintCspPolicy(CSP_CANONICAL) == [] proves nothing.
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("style-src-elem 'self'", "style-src-elem 'self' 'unsafe-inline'")).length, 1, "control: 'unsafe-inline' in style-src-elem flagged");
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("style-src-elem 'self'; ", '')).length, 1, 'control: missing style-src-elem flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("style-src-attr 'unsafe-inline'; ", '')).length, 1, 'control: missing style-src-attr flagged');
      _assertEqual(lintCspPolicy(CSP_CANONICAL.replace("style-src 'self' 'unsafe-inline'; ", "style-src 'self'; ")).length, 1, 'control: a changed style-src fallback flagged');
    },
  },
  {
    name: 'N-324 no <style> element in root pages or js/; the moved page CSS is linked (SEC-12c)',
    fn: function () {
      if (typeof lintNoStyleElements === 'undefined') _skip('lint-csp.js not loaded — runs under node tests/run.js.');
      // Positive controls.
      _assertEqual(lintNoStyleElements({}, { 'a.html': '<link rel="stylesheet" href="css/a.css">' }), [], 'control: a stylesheet link is clean');
      _assertEqual(lintNoStyleElements({}, { 'a.html': '<p>\n<style>\nb{}\n</style>' }), ["a.html:2: <style> element - move the CSS to a css/ file (style-src-elem has no 'unsafe-inline')"], 'control: a <style> block is flagged with its line');
      _assertEqual(lintNoStyleElements({}, { 'a.html': '<style media="print">b{}</style>' }).length, 1, 'control: a <style> with attributes is flagged');
      _assertEqual(lintNoStyleElements({}, { 'a.html': '<!-- <style>b{}</style> -->\n<p>&lt;style&gt;</p>' }), [], 'control: commented-out or escaped <style> is ignored');
      _assertEqual(lintNoStyleElements({ 'x.js': "a\nel.innerHTML = `<style>b{}</style>`;" }, {}), ["js/x.js:2: <style> element - move the CSS to a css/ file (style-src-elem has no 'unsafe-inline')"], 'control: a <style> in a JS template is flagged');
      _assertEqual(lintNoStyleElements({ 'x.js': "const s = document.createElement('style');" }, {}).length, 1, 'control: createElement(style) is flagged');
      _assertEqual(lintNoStyleElements({ 'x.js': "// document.createElement('style')\nconst t = '<styles>'; el.style.color = c;" }, {}), [], 'control: comments, <styles> and el.style are not flagged');
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintNoStyleElements(ALL_SOURCES, ALL_HTML), [], 'root *.html and js/: no <style> element');
      // Mutation: put a block back into a real page and the lint must name it.
      const mutated = Object.assign({}, ALL_HTML, { 'mobile.html': ALL_HTML['mobile.html'].replace('</head>', '<style>\nb{}\n</style>\n</head>') });
      const back = lintNoStyleElements(ALL_SOURCES, mutated);
      _assertEqual(back.length === 1 && /^mobile\.html:\d+: <style> element/.test(back[0]), true, 'mutation: a <style> added to mobile.html is flagged: ' + back);
      // The eight moved blocks are linked from their page; the four guides also link guide-search.css after their own file.
      const linksOf = html => { const out = []; html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]*)"[^>]*>/gi, (m, h) => { out.push(h); return m; }); return out; };
      const moved = {
        'mobile.html': ['css/mobile.css'], 'Readme.html': ['css/readme.css'],
        'reporting.html': CSS_SPLIT_LINKS['reporting.html'], 'admin.html': CSS_SPLIT_LINKS['admin.html'],
        'user-guide.html': ['css/user-guide.css', 'css/guide-search.css'],
        'sales-user-guide.html': ['css/sales-user-guide.css', 'css/guide-search.css'],
        'people-user-guide.html': ['css/people-user-guide.css', 'css/guide-search.css'],
        'market-reporting-user-guide.html': ['css/market-reporting-user-guide.css', 'css/guide-search.css'],
      };
      Object.keys(moved).forEach(p => _assertEqual(linksOf(ALL_HTML[p]), moved[p], p + ' stylesheet links, in order'));
      // Every stylesheet any root page links exists in css/ (a missing file fails silently in the browser).
      if (typeof ALL_CSS !== 'undefined') {
        Object.keys(ALL_HTML).forEach(p => linksOf(ALL_HTML[p]).forEach(h => {
          _assertEqual(/^css\/[\w-]+\.css$/.test(h) && Object.prototype.hasOwnProperty.call(ALL_CSS, h.slice(4)), true, p + ' links ' + h + ', which exists in css/');
        }));
      }
      // printPage() adds landscape through the CSSOM, not a <style> element.
      _assertEqual(/insertRule\('@page \{ size: A4 landscape; \}'/.test(ALL_SOURCES['ui-kit.js']), true, 'printPage inserts the landscape @page rule through the CSSOM');
    },
  },
  {
    name: 'css/ split: each shell links its module sheets, no rule is defined twice, sentinels sit in the right file, no shell can render a sheet it does not link (N-349b)',
    fn: function () {
      if (typeof ALL_CSS === 'undefined' || typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access - runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintCssSplit(ALL_CSS, ALL_HTML, ALL_SOURCES), [], 'css/ split (see tests/lint-css-split.js)');
    },
  },
  {
    name: 'lintCssSplit fails on a missing link, a copied rule, a sentinel back in style.css, an unlisted shell and a shell that can render an unlinked sheet (N-349b)',
    fn: function () {
      const cfg = { links: { 'a.html': ['css/style.css', 'css/m.css'], 'b.html': ['css/style.css'] }, sheets: { 'm.css': ['mod-x'] }, stays: ['shared'], allow: {} };
      const page = (links, script) => links.map(h => '<link rel="stylesheet" href="' + h + '">').join('') + (script ? '<script src="js/' + script + '"></script>' : '');
      const css = { 'style.css': '.shared { color: red; }', 'm.css': '.mod-x { color: blue; } .mod-x .shared { margin: 0; }' };
      const html = { 'a.html': page(['css/style.css', 'css/m.css']), 'b.html': page(['css/style.css'], 'b.js') };
      const src = { 'b.js': "el.className = 'plain';" };
      _assertEqual(lintCssSplit(css, html, src, cfg), [], 'control: a consistent split is clean');
      _assertEqual(lintCssSplit(css, html, { 'b.js': "// mod-x is only a comment here\nel.className = 'plain';" }, cfg), [], 'control: a class named in a comment does not count');
      const noLink = lintCssSplit(css, Object.assign({}, html, { 'a.html': page(['css/style.css']) }), src, cfg);
      _assertEqual(noLink.length === 1 && /^a\.html: stylesheet links are/.test(noLink[0]), true, 'mutation: a missing link is named: ' + noLink);
      const dup = lintCssSplit(Object.assign({}, css, { 'style.css': css['style.css'] + ' .mod-x .shared { margin: 0; }' }), html, src, cfg);
      _assertEqual(dup.some(p => /both define/.test(p)), true, 'mutation: a rule copied into style.css is flagged: ' + dup);
      const back = lintCssSplit(Object.assign({}, css, { 'style.css': css['style.css'] + ' .mod-x { color: green; }' }), html, src, cfg);
      _assertEqual(back.some(p => /still defines \.mod-x/.test(p)), true, 'mutation: a sentinel back in style.css is flagged: ' + back);
      const gone = lintCssSplit({ 'style.css': '.mod-x { color: blue; }', 'm.css': css['m.css'] }, html, src, cfg);
      _assertEqual(gone.some(p => /expected to keep \.shared/.test(p)), true, 'mutation: a shared class dropped from style.css is flagged: ' + gone);
      const unlisted = lintCssSplit(css, Object.assign({}, html, { 'c.html': page(['css/style.css']) }), src, cfg);
      _assertEqual(unlisted.length === 1 && /^c\.html: links css\/style\.css but is not in CSS_SPLIT_LINKS/.test(unlisted[0]), true, 'mutation: an unlisted shell is flagged: ' + unlisted);
      const uses = lintCssSplit(css, html, { 'b.js': "el.className = 'mod-x shared';" }, cfg);
      _assertEqual(uses.length === 1 && /^b\.html: can render css\/m\.css/.test(uses[0]), true, 'mutation: a shell that renders an unlinked sheet is flagged: ' + uses);
      _assertEqual(lintCssSplit(css, html, { 'b.js': "el.className = 'mod-x';" }, Object.assign({}, cfg, { allow: { 'js/b.js': ['mod-x'] } })), [], 'control: an allowlisted mention is not flagged');
    },
  },
  {
    name: 'Readme.html names every js/ file in File Structure / Mobile JavaScript, and no file that no longer exists (N-354)',
    fn: function () {
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access - runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintReadmeFiles(ALL_HTML['Readme.html'], ALL_SOURCES), [], 'Readme file listing (see tests/lint-readme-files.js)');
    },
  },
  {
    name: 'lintReadmeFiles fails on an unlisted file, a stale row, missing section markers and an empty scope, and honours the allowlist (N-354)',
    fn: function () {
      const readme = tags => '<div id="x" ' + 'id="sec-mobile">' + tags.map(t => '<span class="file-tag">' + t + '</span>').join('') + '<div id="sec-loadorder">';
      const src = { 'a.js': '', 'b.js': '' };
      _assertEqual(lintReadmeFiles(readme(['a.js', 'js/b.js']), src), [], 'control: both name forms (a.js, js/b.js) count as listed');
      const unlisted = lintReadmeFiles(readme(['a.js']), src);
      _assertEqual(unlisted.length === 1 && /^js\/b\.js is not listed/.test(unlisted[0]), true, 'mutation: an unlisted file is named: ' + unlisted);
      const stale = lintReadmeFiles(readme(['a.js', 'js/b.js', 'js/ghost.js']), src);
      _assertEqual(stale.length === 1 && /ghost\.js, which does not exist/.test(stale[0]), true, 'mutation: a stale row is named: ' + stale);
      const noMarkers = lintReadmeFiles('<p>no sections here</p>', src);
      _assertEqual(noMarkers.length === 1 && /markers/.test(noMarkers[0]), true, 'mutation: missing section markers fail rather than pass vacuously: ' + noMarkers);
      const empty = lintReadmeFiles(readme([]), src);
      _assertEqual(empty.length === 1 && /no \.js file-tag/.test(empty[0]), true, 'mutation: a scope with no file-tags fails rather than passes vacuously: ' + empty);
      _assertEqual(lintReadmeFiles(readme(['a.js', 'tests/x.js', 'css/']), src, { allow: { 'b.js': 'reason' } }), [], 'control: an allowlisted file is not flagged, non-js tags are ignored');
    },
  },
  {
    name: 'N-324 inline styles: per-file counts equal INLINE_STYLE_BASELINE; no setAttribute(style) (SEC-12c ratchet)',
    fn: function () {
      if (typeof lintInlineStyles === 'undefined') _skip('lint-inline-styles.js not loaded — runs under node tests/run.js.');
      // What counts.
      _assertEqual(countInlineStyles('<div style="a">'), 1, 'control: double-quoted attribute');
      _assertEqual(countInlineStyles("<p STYLE='a'>"), 1, 'control: any case, single quotes');
      _assertEqual(countInlineStyles('x = "<b style=\\"a\\">";'), 1, 'control: escaped quote inside a JS string');
      _assertEqual(countInlineStyles('`<i style=${s}>`'), 1, 'control: template value');
      _assertEqual(countInlineStyles("el.style.color = 'red'; el.style = 'x'; <p data-style=\"y\"> newStyle = 'z'; font-style: italic"), 0, 'control: CSSOM, data-style, other names not counted');
      // Ratchet behaviour (synthetic data).
      const js = { 'a.js': '<a style="x"><b style="y">', 'clean.js': 'x' };
      const html = { 'p.html': '<p>' };
      const base = { 'js/a.js': 2 };
      _assertEqual(lintInlineStyles(js, html, base), [], 'control: exact match is clean');
      const raised = lintInlineStyles({ 'a.js': js['a.js'] + '<c style="z">', 'clean.js': 'x' }, html, base);
      _assertEqual(raised.length === 1 && /raised from 2 to 3/.test(raised[0]), true, 'raised flagged: ' + raised);
      const lowered = lintInlineStyles({ 'a.js': '<a style="x">', 'clean.js': 'x' }, html, base);
      _assertEqual(lowered.length === 1 && /lower INLINE_STYLE_BASELINE to 1/.test(lowered[0]), true, 'lowered flagged: ' + lowered);
      const zero = lintInlineStyles({ 'a.js': 'none', 'clean.js': 'x' }, html, base);
      _assertEqual(zero.length === 1 && /delete the INLINE_STYLE_BASELINE entry/.test(zero[0]), true, 'down to 0 → delete the entry: ' + zero);
      const fresh = lintInlineStyles({ 'a.js': js['a.js'], 'clean.js': '<a style="n">' }, html, base);
      _assertEqual(fresh.length === 1 && /js\/clean\.js: 1 inline .* no INLINE_STYLE_BASELINE entry/.test(fresh[0]), true, 'new file with a style flagged: ' + fresh);
      const page = lintInlineStyles(js, { 'p.html': '<p style="x">' }, base);
      _assertEqual(page.length === 1 && /^p\.html: 1 inline/.test(page[0]), true, 'a root page is counted too: ' + page);
      _assertEqual(lintInlineStyles(js, html, Object.assign({ 'js/gone.js': 3 }, base)).length, 1, 'stale entry flagged');
      _assertEqual(lintInlineStyles(js, html, Object.assign({ 'js/clean.js': 0 }, base)).length, 1, 'a 0 entry flagged');
      // setAttribute('style', ...) ban.
      _assertEqual(lintStyleSetAttribute({ 'x.js': "a\nel.setAttribute('style', 'color:red');" }), [{ file: 'js/x.js', line: 2 }], 'control: setAttribute(style) flagged');
      _assertEqual(lintStyleSetAttribute({ 'x.js': "// el.setAttribute('style', s)\nel.setAttribute('title', s);" }), [], 'control: comments and other attributes are fine');
      if (typeof ALL_HTML === 'undefined' || typeof ALL_SOURCES === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      }
      _assertEqual(lintInlineStyles(ALL_SOURCES, ALL_HTML, INLINE_STYLE_BASELINE), [], 'inline style ratchet');
      _assertEqual(lintStyleSetAttribute(ALL_SOURCES), [], 'no setAttribute(style) in js/');
      // Mutation on real data: one more inline style in a real file must fail.
      const bumped = Object.assign({}, ALL_SOURCES, { 'pages.js': ALL_SOURCES['pages.js'] + '\nconst _x = \'<p style="color:red">\';' });
      _assertEqual(lintInlineStyles(bumped, ALL_HTML, INLINE_STYLE_BASELINE).length, 1, 'mutation: a new inline style in pages.js is flagged');
    },
  }
);
