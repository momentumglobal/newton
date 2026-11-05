// tests/assert-notifications.js — notification drawer focus management (N-425).
// Loads after tests/assertions.js and pushes into ASSERTIONS. js/notifications.js is evaluated
// from ALL_SOURCES against a small fake document that is BUILT FROM paintBell()'s real markup
// (buttons in DOM order, data-id rows), so a markup change that breaks the Tab order is seen here.
// The fake models the one browser rule that matters for focus: a control inside a drawer that is
// not .open cannot take focus (visibility: hidden), so open must set .open before it focuses.
// The runner is synchronous: notifTick is exercised up to its first await (the optimistic apply).
// Skips under tests/index.html, where ALL_SOURCES is not defined.

(function () {
  const attrsOf = tag => { const a = {}; tag.replace(/([\w-]+)="([^"]*)"/g, (m, k, v) => { a[k] = v; return m; }); return a; };

  function mkEl(st, doc, name, a, drawerChild) {
    const o = { name: name, attrs: a || {}, cls: new Set(((a && a.class) || '').split(/\s+/).filter(Boolean)), drawerChild: !!drawerChild };
    o.classList = {
      contains: c => o.cls.has(c),
      toggle: (c, f) => { const on = f === undefined ? !o.cls.has(c) : !!f; if (on) o.cls.add(c); else o.cls.delete(c); return on; },
      add: c => { o.cls.add(c); }, remove: c => { o.cls.delete(c); },
    };
    o.setAttribute = (k, v) => { o.attrs[k] = String(v); };
    o.getAttribute = k => (k in o.attrs ? o.attrs[k] : null);
    o.focus = () => {
      if (o.drawerChild && !(st.drawer && st.drawer.cls.has('open'))) return;   // visibility: hidden
      doc.activeElement = o;
    };
    o.remove = () => { st.btns = st.btns.filter(b => b !== o); if (st.badge === o) st.badge = null; };
    return o;
  }

  function rebuild(st, doc, html) {
    st.html = html; st.btns = []; st.byName = {}; st.rows = {}; st.badge = null; st.drawer = null; st.overlay = null; st.bell = null;
    const re = /<(button|div|span)\b[^>]*>/g;
    let m, row = null;
    while ((m = re.exec(html))) {
      const a = attrsOf(m[0]); const toks = (a.class || '').split(/\s+/);
      if (m[1] === 'div' && a.id === 'notif-drawer') st.drawer = mkEl(st, doc, 'drawer', a, false);
      else if (m[1] === 'div' && a.id === 'notif-overlay') st.overlay = mkEl(st, doc, 'overlay', a, false);
      else if (m[1] === 'div' && toks.indexOf('notif-item') >= 0) {
        row = a['data-id'];
        const rid = row;
        st.rows[rid] = mkEl(st, doc, 'row:' + rid, a, false);
        st.rows[rid].querySelector = sel => (sel === '.notif-item-tick' ? (st.byName['tick:' + rid] || null) : null);
      } else if (m[1] === 'span' && toks.indexOf('notif-badge') >= 0) {
        st.badge = mkEl(st, doc, 'badge', a, false);
        st.badge.textContent = html.slice(m.index + m[0].length).split('<')[0];
      } else if (m[1] === 'button') {
        if (toks.indexOf('notif-bell') >= 0) { st.bell = mkEl(st, doc, 'bell', a, false); continue; }
        const key = toks.indexOf('notif-markall') >= 0 ? 'markall' : toks.indexOf('notif-close') >= 0 ? 'close'
          : toks.indexOf('notif-item-open') >= 0 ? 'open:' + row : toks.indexOf('notif-item-tick') >= 0 ? 'tick:' + row : 'other';
        const b = mkEl(st, doc, key, a, true);
        st.btns.push(b); st.byName[key] = b;
      }
    }
    if (st.drawer) {
      st.drawer.querySelectorAll = sel => (sel === 'button' ? st.btns.slice() : []);
      st.drawer.querySelector = sel => (sel === '.notif-close' ? (st.byName.close || null) : null);
    }
  }

  function query(st, sel) {
    if (sel === '#notif-slot .notif-bell' || sel === '.notif-bell') return st.bell;
    if (sel === '.notif-bell .notif-badge') return st.badge;
    if (sel === '.notif-markall') return st.byName.markall || null;
    if (sel === '.notif-close') return st.byName.close || null;
    let m = /^\.notif-item\[data-id="(\w+)"\] \.notif-item-open$/.exec(sel);
    if (m) return st.byName['open:' + m[1]] || null;
    m = /^\.notif-item\[data-id="(\w+)"\]$/.exec(sel);
    if (m) return st.rows[m[1]] || null;
    return null;
  }

  // Evaluate notifications.js (optionally mutated) against a fresh fake. Returns the handles a test needs.
  function build(mutate) {
    let src = ALL_SOURCES['notifications.js'];
    if (mutate) { const out = mutate(src); if (out === src) throw new Error('control mutation did not change the source'); src = out; }
    const listeners = [];
    const st = { html: '', btns: [], byName: {}, rows: {}, badge: null, drawer: null, overlay: null, bell: null };
    const slot = {}; 
    Object.defineProperty(slot, 'innerHTML', { set: h => rebuild(st, doc, h), get: () => st.html });
    const doc = {
      activeElement: { name: 'body' },
      getElementById: id => (id === 'notif-slot' ? slot : id === 'notif-drawer' ? st.drawer : id === 'notif-overlay' ? st.overlay : null),
      querySelector: sel => query(st, sel),
      addEventListener: (t, fn) => { if (t === 'keydown') listeners.push(fn); },
      removeEventListener: (t, fn) => { if (t === 'keydown') for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i] === fn) listeners.splice(i, 1); },
    };
    const ctl = { document: doc, lucide: { createIcons() {} }, registerActions() {}, _confirmModalOpen: false, _cmdBarState: null,
      optimisticWrite: o => { o.apply(); return Promise.resolve(); } };
    const names = ['paintBell', 'notifToggle', 'notifTick', 'notifMarkAll', '_notifSetOpen', '_notifIsOpen'];
    const mod = new Function('ctl', 'with (ctl) {\n' + src + '\nreturn {' + names.join(',') + '};\n}')(ctl);
    const fire = (key, shift) => {
      let prevented = false;
      const e = { key: key, shiftKey: !!shift, preventDefault() { prevented = true; } };
      listeners.slice().forEach(fn => fn(e));
      return prevented;
    };
    return { mod: mod, st: st, doc: doc, ctl: ctl, fire: fire, listeners: listeners };
  }

  const iso = () => new Date(Date.now() - 3600 * 1000).toISOString();
  const ROWS = {
    none:   [],
    read:   [{ id: 1, Body: 'Read one', IsRead: true, DeepLink: 'x.html', Tone: 'milestone', CreatedAt: iso() }],
    unread: [{ id: 2, Body: 'New <b>one</b>', IsRead: false, DeepLink: 'y.html', Tone: 'attention', CreatedAt: iso() },
             { id: 3, Body: 'New two', IsRead: false, DeepLink: '', Tone: 'celebrate', CreatedAt: iso() },
             { id: 1, Body: 'Read one', IsRead: true, DeepLink: 'x.html', Tone: 'milestone', CreatedAt: iso() }],
  };
  function paint(h, key) { const rows = ROWS[key]; h.mod.paintBell(rows, rows.filter(r => !r.IsRead).length); }

  // Esc round trip; returns '' when it behaves, else a description of what went wrong.
  function escRoundTrip(h) {
    paint(h, 'unread');
    h.st.bell.focus();
    h.mod.notifToggle();
    if (h.st.bell.attrs['aria-expanded'] !== 'true') return 'aria-expanded not true when open';
    if (h.doc.activeElement !== h.st.byName.close) return 'focus did not move to Close on open';
    h.fire('Escape');
    if (h.mod._notifIsOpen()) return 'Esc did not close the drawer';
    if (h.st.overlay.cls.has('open')) return 'Esc did not close the overlay';
    if (h.st.bell.attrs['aria-expanded'] !== 'false') return 'aria-expanded not false after close';
    if (h.doc.activeElement !== h.st.bell) return 'focus did not return to the bell';
    return '';
  }
  // Tab wrap on one data set; returns '' when fine.
  function tabWrap(h, key) {
    paint(h, key);
    h.mod.notifToggle();
    const stops = h.st.btns.slice();
    const first = stops[0], last = stops[stops.length - 1];
    last.focus();
    if (!h.fire('Tab') || h.doc.activeElement !== first) return key + ': Tab from last did not wrap to first';
    first.focus();
    if (!h.fire('Tab', true) || h.doc.activeElement !== last) return key + ': Shift+Tab from first did not wrap to last';
    if (stops.length > 2) {
      stops[1].focus();
      if (h.fire('Tab') || h.doc.activeElement !== stops[1]) return key + ': Tab in the middle was interfered with';
    }
    h.st.bell.focus();
    if (!h.fire('Tab') || h.doc.activeElement !== first) return key + ': focus outside the drawer was not pulled in';
    return '';
  }

  ASSERTIONS.push(
    {
      name: 'N-425 notifBellLabel: plain name at 0, count when unread',
      fn: function () {
        _assertEqual(notifBellLabel(0), 'Notifications', 'AC2 zero');
        _assertEqual(notifBellLabel(1), 'Notifications, 1 unread', 'AC2 one');
        _assertEqual(notifBellLabel(12), 'Notifications, 12 unread', 'AC2 twelve');
        _assertEqual(notifBellLabel(undefined), 'Notifications', 'AC2 bad input');
      },
    },
    {
      name: 'N-425 paintBell markup: bell + drawer ARIA, one open button per row, ticks only on unread',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('ALL_SOURCES is only defined under node tests/run.js.');
        const h = build(); paint(h, 'unread');
        const b = h.st.bell.attrs, d = h.st.drawer.attrs;
        _assertEqual([b.type, b['aria-label'], b['aria-haspopup'], b['aria-controls'], b['aria-expanded']],
          ['button', 'Notifications, 2 unread', 'dialog', 'notif-drawer', 'false'], 'AC1 bell');
        _assertEqual(h.st.badge.attrs['aria-hidden'], 'true', 'AC1 badge is aria-hidden');
        _assertEqual([d.role, d['aria-modal'], d['aria-labelledby']], ['dialog', 'true', 'notif-drawer-title'], 'AC3 drawer');
        _assertEqual(/id="notif-drawer-title">Notifications</.test(h.st.html), true, 'AC3 label target text');
        _assertEqual(h.st.btns.map(x => x.name), ['markall', 'close', 'open:2', 'tick:2', 'open:3', 'tick:3', 'open:1'], 'AC11 stop order');
        _assertEqual(/<button type="button" class="notif-item-open">\s*<span class="notif-item-text">/.test(h.st.html), true, 'AC11 button holds phrasing content');
        _assertEqual(/class="notif-item-open"[^>]*data-act/.test(h.st.html), false, 'AC11 the open button carries no act of its own (the row does)');
        _assertEqual(/&lt;b&gt;one&lt;\/b&gt;/.test(h.st.html), true, 'body still escaped');
        const e = build(); paint(e, 'none');
        _assertEqual(e.st.bell.attrs['aria-label'], 'Notifications', 'AC1 label with nothing unread');
        _assertEqual(e.st.btns.map(x => x.name), ['close'], 'AC5 empty list: Close is the only stop');
      },
    },
    {
      name: 'N-425 Esc closes the drawer and returns focus to the bell (the ticket assertion)',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('ALL_SOURCES is only defined under node tests/run.js.');
        _assertEqual(escRoundTrip(build()), '', 'AC4 / AC6 Esc round trip');
        const c = build(); paint(c, 'unread'); c.st.bell.focus(); c.mod.notifToggle();
        c.mod.notifToggle();   // Close button and overlay click both route through notifToggle
        _assertEqual([c.mod._notifIsOpen(), c.doc.activeElement === c.st.bell, c.listeners.length], [false, true, 0], 'AC6 toggle-close returns focus');
      },
    },
    {
      name: 'N-425 Tab stays inside while open: wraps both ways with 0, read-only and unread rows',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('ALL_SOURCES is only defined under node tests/run.js.');
        ['none', 'read', 'unread'].forEach(k => _assertEqual(tabWrap(build(), k), '', 'AC5 ' + k));
      },
    },
    {
      name: 'N-425 keydown listener exists only while open; never double-binds; unbinds itself after a closed re-render',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('ALL_SOURCES is only defined under node tests/run.js.');
        const h = build(); paint(h, 'unread');
        _assertEqual(h.listeners.length, 0, 'AC8 none before open');
        h.mod._notifSetOpen(true); h.mod._notifSetOpen(true);
        _assertEqual(h.listeners.length, 1, 'AC8 opened twice, bound once');
        h.mod._notifSetOpen(false);
        _assertEqual(h.listeners.length, 0, 'AC8 unbound on close');
        _assertEqual(h.fire('Tab'), false, 'AC8 Tab after close is left alone');
        h.mod._notifSetOpen(true); paint(h, 'unread');          // slot rebuilt closed while bound
        _assertEqual(h.fire('Tab'), false, 'AC8 stale listener does not hijack Tab');
        _assertEqual(h.listeners.length, 0, 'AC8 stale listener removed itself');
      },
    },
    {
      name: 'N-425 a confirm dialog or the command bar over the drawer owns Esc and Tab',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('ALL_SOURCES is only defined under node tests/run.js.');
        [['_confirmModalOpen', true], ['_cmdBarState', { close() {} }]].forEach(pair => {
          const h = build(); paint(h, 'unread'); h.mod.notifToggle();
          h.ctl[pair[0]] = pair[1];
          h.st.bell.focus();
          _assertEqual(h.fire('Tab'), false, 'AC9 ' + pair[0] + ': Tab not hijacked');
          h.fire('Escape');
          _assertEqual(h.mod._notifIsOpen(), true, 'AC9 ' + pair[0] + ': Esc leaves the drawer open');
          h.ctl[pair[0]] = pair[0] === '_confirmModalOpen' ? false : null;
          h.fire('Escape');
          _assertEqual(h.mod._notifIsOpen(), false, 'AC9 ' + pair[0] + ': Esc closes once the layer is gone');
        });
      },
    },
    {
      name: 'N-425 focus returns to the freshly rendered bell, and a tick keeps the drawer open on that row',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('ALL_SOURCES is only defined under node tests/run.js.');
        const h = build(); paint(h, 'unread'); h.mod.notifToggle();
        const oldBell = h.st.bell;
        paint(h, 'unread'); h.mod._notifSetOpen(true, { focus: false });   // re-render while open, as notifTick / notifMarkAll do
        _assertEqual(h.st.bell === oldBell, false, 'setup: the slot really was rebuilt');
        h.fire('Escape');
        _assertEqual(h.doc.activeElement === h.st.bell && h.st.bell !== oldBell, true, 'AC7 focus lands on the new bell');
        // tick
        const t = build(); paint(t, 'unread'); t.mod.notifToggle();
        t.st.byName['tick:2'].focus();
        t.mod.notifTick('2').catch(() => {});
        _assertEqual(t.mod._notifIsOpen(), true, 'AC12 still open after tick');
        _assertEqual(t.doc.activeElement === t.st.byName['open:2'], true, 'AC12 focus is on that row\'s open button');
        _assertEqual(!!t.st.byName['tick:2'] && t.st.btns.indexOf(t.st.byName['tick:2']) >= 0, false, 'AC12 tick button removed');
        _assertEqual(t.st.bell.attrs['aria-label'], 'Notifications, 1 unread', 'AC12 aria-label follows the badge');
        _assertEqual(t.st.badge.textContent, '1', 'AC12 badge decremented');
      },
    },
    {
      name: 'N-425 source: one open/close path, revert + Mark all re-open through it, drawer hidden when closed',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined' || typeof ALL_CSS === 'undefined') _skip('ALL_SOURCES / ALL_CSS are only defined under node tests/run.js.');
        const js = ALL_SOURCES['notifications.js'];
        _assertEqual(/classList\.(add|remove)\('open'\)/.test(js), false, 'AC12 nothing sets .open except _notifSetOpen');
        _assertEqual((js.match(/classList\.toggle\('open'/g) || []).length, 2, 'AC12 _notifSetOpen toggles drawer + overlay once each');
        const mark = js.slice(js.indexOf('async function notifMarkAll'));
        _assertEqual(/await renderNotificationBell\(\);\s*if \(wasOpen\) _notifSetOpen\(true\);/.test(mark), true, 'AC12 Mark all re-opens through _notifSetOpen (focus on Close)');
        const tick = js.slice(js.indexOf('async function notifTick'), js.indexOf('async function notifMarkAll'));
        _assertEqual(/revert: async \(\) => \{[\s\S]*?await renderNotificationBell\(\);\s*restoreDrawer\(\);/.test(tick), true, 'AC12 revert restores the drawer');
        const css = ALL_CSS['style.css'];
        const rule = sel => { const i = css.indexOf('\n' + sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
        _assertEqual(/visibility:\s*hidden/.test(rule('.notif-drawer')), true, 'AC10 closed drawer is visibility: hidden');
        _assertEqual(/visibility 0s linear var\(--dur-slow\)/.test(rule('.notif-drawer')), true, 'AC10 hide is delayed until the slide-out ends');
        _assertEqual(/visibility:\s*visible/.test(rule('.notif-drawer.open')), true, 'AC10 open drawer is visible');
        _assertEqual(rule('.notif-item-open') !== '', true, 'AC11 .notif-item-open is styled');
      },
    },
    {
      name: 'N-425 controls: the round trip and the wrap checks fail on a handler that does not do the job',
      fn: function () {
        if (typeof ALL_SOURCES === 'undefined') _skip('ALL_SOURCES is only defined under node tests/run.js.');
        const noEsc = build(s => s.replace("if (e.key === 'Escape') {", "if (e.key === 'Escape_off') {"));
        _assertEqual(escRoundTrip(noEsc) !== '', true, 'AC14 control: Esc doing nothing is caught');
        const noReturn = build(s => s.replace('else _notifBell()?.focus();', ''));
        _assertEqual(escRoundTrip(noReturn) !== '', true, 'AC14 control: no focus return is caught');
        const noWrap = build(s => s.replace("if (i === -1 || (e.shiftKey && i === 0) || (!e.shiftKey && i === last)) {", 'if (false) {'));
        _assertEqual(tabWrap(noWrap, 'unread') !== '', true, 'AC14 control: no Tab wrap is caught');
        const openFirst = build(s => s.replace("  drawer.classList.toggle('open', open);\n", '').replace("  else _notifBell()?.focus();\n", "  else _notifBell()?.focus();\n  drawer.classList.toggle('open', open);\n"));
        _assertEqual(escRoundTrip(openFirst) !== '', true, 'AC14 control: focusing before .open is set is caught (hidden drawer rejects focus)');
      },
    },
  );
})();