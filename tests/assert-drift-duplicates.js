// tests/assert-drift-duplicates.js — N-478 (R3-9): the shared Use-template picker, the shared
// checklist section and the modal shell behind confirmModal / promptModal / selectModal /
// pairSelectModal. Pure helpers and the picker run for real (stubbed pairSelectModal); the shell
// runs against a hand-rolled fake document (no DOM under node); source scans cover the rest.
// Loads AFTER tests/assertions.js (ASSERTIONS + shared helpers).

(function () {
  function src(file) {
    return String((typeof ALL_SOURCES !== 'undefined' && ALL_SOURCES[file]) || '').replace(/\r\n/g, '\n');
  }
  function need() {
    if (typeof ALL_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js.');
  }
  function body(file, sig) {
    const s = src(file), i = s.indexOf(sig);
    if (i < 0) return '';
    const j = s.indexOf('\n}\n', i);
    return s.slice(i, j < 0 ? undefined : j + 2);   // includes the closing brace
  }
  function lines(file, sig) { return body(file, sig).split('\n').length; }

  // ── fake document for the shell ─────────────────────────────────────
  function fakeDom() {
    const listeners = [];
    const mk = name => ({ name, disabled: false, focused: 0, focus() { this.focused++; doc.activeElement = this; }, listeners: {},
      addEventListener(t, fn) { this.listeners[t] = fn; } });
    const doc = {
      activeElement: null, body: { children: [], appendChild(el) { this.children.push(el); } },
      addEventListener(t, fn) { if (t === 'keydown') listeners.push(fn); },
      removeEventListener(t, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
      createElement() {
        const cancel = mk('cancel'), confirm = mk('confirm');
        const o = mk('overlay');
        o.className = ''; o.innerHTML = ''; o.removed = false; o.cancel = cancel; o.confirm = confirm;
        o.querySelector = sel => sel === '.confirm-modal-cancel' ? cancel : sel === '.confirm-modal-confirm' ? confirm : mk(sel);
        o.remove = () => { o.removed = true; };
        return o;
      },
    };
    const key = (k, shift) => { let prevented = false; const e = { key: k, shiftKey: !!shift, preventDefault() { prevented = true; } }; listeners.slice().forEach(fn => fn(e)); return prevented; };
    return { doc, listeners, key };
  }
  function shell(dom, state) {
    const code = body('ui-kit.js', 'function _openModal(');
    return new Function('ctl', 'with (ctl) {\n' + code + '\nreturn _openModal;\n}')(
      Object.assign(state.ctl, { document: dom.doc, console: { warn(m) { state.warns.push(m); } }, escHtml, escAttr }));
  }

  ASSERTIONS.push(
    {
      name: 'N-478 AC4 templateRoleLabel and templateProjectOptions — label, sort, fallback, grouping, input untouched',
      fn: function () {
        _assertEqual(templateRoleLabel({ RoleTitle: 'Dev', Location: 'Lisbon' }), 'Dev (Lisbon)', 'with location');
        _assertEqual(templateRoleLabel({ RoleTitle: 'Dev', Location: '' }), 'Dev', 'no location');
        _assertEqual(templateRoleLabel({ RoleTitle: 'Dev' }), 'Dev', 'missing location');
        const input = [{ id: 3, CustomerName: 'Zed', Status: 'Completed' }, { id: 1, CustomerName: 'Acme', Status: 'Active' }, { id: 2, CustomerName: '', Status: 'Transition' }];
        const before = JSON.stringify(input);
        _assertEqual(templateProjectOptions(input), [
          { value: '2', label: '2', group: 'Active' },
          { value: '1', label: 'Acme', group: 'Active' },
          { value: '3', label: 'Zed', group: 'Archive' },
        ], 'sorted by name, id fallback, Active / Archive');
        _assertEqual(JSON.stringify(input), before, 'input untouched');
        _assertEqual(templateProjectOptions([]), [], 'empty');
      },
    },
    {
      name: 'N-478 AC3 pickTemplateTarget — cancel, confirm with and without a role, stale project, role load stays in the dialog',
      fn: function () {
        const keep = pairSelectModal;
        const projects = [{ id: 7, CustomerName: 'Acme', Status: 'Active' }];
        const roles = { '7': [{ id: 70, RoleTitle: 'Dev', Location: 'Lisbon' }] };
        const rolesFor = async pid => roles[pid] || [];
        const tpl = { TemplateName: 'Standard' };
        let seen = null;
        const run = async (answer, loadFirst) => {
          pairSelectModal = async cfg => { seen = cfg; if (loadFirst) await cfg.second.load(loadFirst); return answer; };
          return pickTemplateTarget({ tpl, projects, rolesFor, noneLabel: 'No role' });
        };
        return (async () => {
          try {
            _assertEqual(await run(null, '7'), null, 'cancel → null');
            _assertEqual(seen.message, 'Standard', 'message is the template display name');
            _assertEqual(seen.second.noneLabel, 'No role', 'none label passed through');
            _assertEqual(seen.first.options, templateProjectOptions(projects), 'options from templateProjectOptions');
            _assertEqual(await seen.second.load('7'), [{ value: '70', label: 'Dev (Lisbon)' }], 'role options');
            let r = await run({ first: '7', second: '70' }, '7');
            _assertEqual(r.project.id, 7, 'picked project');
            _assertEqual(r.role.id, 70, 'picked role');
            r = await run({ first: '7', second: '' }, '7');
            _assertEqual(r.role, null, 'none option → role null');
            r = await run({ first: '99', second: '' }, null);
            _assertEqual(r, { project: null, role: null }, 'stale project is not a cancel');
            r = await run({ first: '7', second: '70' }, null);
            _assertEqual(r.role, null, 'role not loaded for that project → null, no throw');
          } finally { pairSelectModal = keep; }
        })();
      },
    },
    {
      name: 'N-478 AC2 one picker — pairSelectModal( called only from template-picker.js outside ui-kit.js; the old role helpers are gone',
      fn: function () {
        need();
        const callers = Object.keys(ALL_SOURCES).filter(f => f !== 'ui-kit.js' && /\bpairSelectModal\(/.test(String(ALL_SOURCES[f]).replace(/^\s*\/\/.*$/gm, '')));
        _assertEqual(callers, ['template-picker.js'], 'only the picker opens the dialog');
        Object.keys(ALL_SOURCES).forEach(f => _assertEqual(/\b(bpRolesFor|rbRolesFor|_bpRoleLabel)\b/.test(String(ALL_SOURCES[f])), false, f + ' has no old role helper'));
        ['briefing-pack.js', 'report-builder.js'].forEach(f => {
          const s = src(f);
          _assertEqual(s.includes('pickTemplateTarget('), true, f + ' calls the picker');
          _assertEqual(/function templateRolesFor\(|function templateRoleLabel\(/.test(s), false, f + ' does not redefine the helpers');
        });
        _assertEqual(/function templateRolesFor\(/.test(src('template-picker.js')) && /function templateRoleLabel\(/.test(src('templates-logic.js')), true, 'helpers live in the picker / templates-logic');
      },
    },
    {
      name: 'N-478 AC5 the actions keep their outcomes — overrides, stale-project toast, autofill, hiring-plan rule',
      fn: function () {
        need();
        const bp = body('briefing-pack.js', 'async function bpUseTemplateAction(');
        const ovBp = (bp.match(/const overrides = \{([\s\S]*?)\};/) || [])[1] || '';
        _assertEqual(ovBp.replace(/\s+/g, ' ').trim(), "ProjectID: parseInt(project.id), RoleID: role ? parseInt(role.id) : null, ClientName: project.CustomerName || '', RoleTitle: role ? (role.RoleTitle || '') : '', RoleLocation: role ? (role.Location || '') : '', CoverDate: bpCurrentMonth(),", 'BP overrides unchanged');
        _assertEqual(/if \(!project\) \{ toast\(T\.MESSAGES\.noWritableProject, \{ type: 'error' \}\); return; \}/.test(bp), true, 'BP stale-project toast');
        _assertEqual(bp.indexOf('bpApplyRoleAutofill()') > bp.indexOf('await bpLoadPack(copy.id)'), true, 'BP autofill after load');
        const rb = body('report-builder.js', 'async function rbUseTemplateAction(');
        const ovRb = (rb.match(/const overrides = \{([\s\S]*?)\};/) || [])[1] || '';
        _assertEqual(ovRb.replace(/\s+/g, ' ').trim(), 'ProjectID: String(project.id), RoleID: role ? String(role.id) : null,', 'RB overrides: text columns take strings (hotfix; the BP ones are Number columns)');
        _assertEqual(rb.includes('noneLabel: T.LABELS.roleAll') && rb.includes('keepHiringPlan: isCoEProject(project)') && /if \(!project\) \{ toast\(T\.MESSAGES\.noWritableProjectReport/.test(rb), true, 'RB all-roles label, CoE rule, stale-project toast');
        [bp, rb].forEach(b => _assertEqual(/catch \(e\)/.test(b) && b.includes('clearButtonLoading(btn)'), true, 'catches + clears the button'));
      },
    },
    {
      name: 'N-478 AC6 checklistSectionHtml — nothing, unavailable note, titled body; the two pages carry no copy of it',
      fn: function () {
        need();
        const code = body('checklists.js', 'function checklistSectionHtml(');
        _assertEqual(code.length > 0, true, 'defined in checklists.js');
        const f = new Function('checklistBodyHtml', 'checklistVariantLabel', 'escHtml', code + '\nreturn checklistSectionHtml;')(
          ck => '<BODY ' + ck.variant + '/>', key => 'Label ' + key, escHtml);
        _assertEqual(f(null), '', 'no checklist');
        _assertEqual(f(undefined), '', 'undefined');
        _assertEqual(f({ error: true }).includes("The checklist couldn't be loaded.") && f({ error: true }).includes('<h3 class="role-page-section-title">Checklist</h3>'), true, 'error');
        const ok = f({ variant: 'v<1>' });
        _assertEqual(ok.includes('Checklist · Label v&lt;1&gt;'), true, 'variant label comes from checklistVariantLabel and is escaped');
        _assertEqual(ok.includes('<BODY v<1>/>'), true, 'body inside the section');
        ['project-page.js', 'role-page.js'].forEach(file => {
          const s = src(file);
          _assertEqual(/role-page-section-title">Checklist/.test(s), false, file + ' has no checklist markup of its own');
          _assertEqual(s.includes('${checklistSectionHtml(v.checklist)}'), true, file + ' uses the shared section');
        });
        _assertEqual((Object.keys(ALL_SOURCES).filter(file => /function checklistSectionHtml\(/.test(String(ALL_SOURCES[file])))), ['checklists.js'], 'defined once');
      },
    },
    {
      name: 'N-478 AC7 one modal shell — overlay, guard flag and keydown listener are built once; the four dialogs only configure it',
      fn: function () {
        need();
        const ui = src('ui-kit.js');
        _assertEqual((ui.match(/className = 'confirm-modal-overlay'/g) || []).length, 1, 'overlay built once');
        _assertEqual((ui.match(/_confirmModalOpen = true/g) || []).length, 1, 'guard set once');
        _assertEqual((ui.match(/document\.addEventListener\('keydown'/g) || []).length, 1, 'keydown bound once');
        ['confirmModal', 'promptModal', 'selectModal', 'pairSelectModal'].forEach(n => {
          const b = body('ui-kit.js', 'function ' + n + '(');
          _assertEqual(b.includes('return _openModal({'), true, n + ' goes through the shell');
          _assertEqual(/_confirmModalOpen|createElement\('div'\)|addEventListener\('keydown'/.test(b), false, n + ' has no shell code of its own');
        });
        _assertEqual(/^let _confirmModalOpen = false;$/m.test(ui), true, '_confirmModalOpen stays a top-level let (command-bar.js / notifications.js read it)');
        _assertEqual(lines('ui-kit.js', 'function pairSelectModal(') <= 90, true, 'pairSelectModal <= 90 lines');
        ['_openModal', 'confirmModal', 'promptModal', 'selectModal', 'pairSelectModal'].forEach(n => _assertEqual(lines('ui-kit.js', 'function ' + n + '(') <= 80 || n === 'pairSelectModal', true, n + ' <= 80 lines'));
      },
    },
    {
      name: 'N-478 AC8 shell behaviour — guard, Escape, backdrop, Cancel, Confirm, Tab trap with disabled controls, focus restore, close once',
      fn: function () {
        need();
        const dom = fakeDom();
        const state = { warns: [], ctl: { _confirmModalOpen: false } };
        const open = shell(dom, state);
        const opener = { focus() { dom.doc.activeElement = this; this.refocused = true; } };
        dom.doc.activeElement = opener;
        const base = { warn: 'x: already open', cancelValue: 'CANCEL', title: 'T', message: '', confirmLabel: 'Go', cancelLabel: 'No' };

        // confirm-style: order [confirm, cancel]; message <p> only when asked
        let p = open(Object.assign({}, base, { alwaysMessage: true, order: (c, cancel, confirm) => [confirm, cancel], value: () => 'OK' }));
        const ov = dom.doc.body.children[0];
        _assertEqual(state.ctl._confirmModalOpen, true, 'flag set while open');
        _assertEqual(ov.className, 'confirm-modal-overlay', 'overlay class');
        _assertEqual(ov.innerHTML.includes('<p class="confirm-modal-message"></p>') && ov.innerHTML.includes('role="alertdialog" aria-modal="true"') && ov.innerHTML.includes('<h3 class="confirm-modal-title">T</h3>'), true, 'markup');
        _assertEqual(ov.cancel.focused, 1, 'Cancel focused on open');
        _assertEqual(dom.listeners.length, 1, 'one keydown listener');
        // second call while open → warn + cancel value, no second overlay, flag untouched
        return open(Object.assign({}, base, { warn: 'second: already open' })).then(second => {
          _assertEqual(second, 'CANCEL', 'blocked call resolves its cancel value');
          _assertEqual(state.warns, ['second: already open'], 'warn text');
          _assertEqual(dom.doc.body.children.length, 1, 'no second overlay');
          // Tab: from Cancel → Confirm → Cancel; from outside → Confirm; Shift+Tab from outside → Confirm
          dom.doc.activeElement = ov.cancel; _assertEqual(dom.key('Tab'), true, 'Tab prevented'); _assertEqual(dom.doc.activeElement, ov.confirm, 'Cancel → Confirm');
          dom.key('Tab'); _assertEqual(dom.doc.activeElement, ov.cancel, 'Confirm → Cancel');
          dom.doc.activeElement = opener; dom.key('Tab'); _assertEqual(dom.doc.activeElement, ov.confirm, 'outside + Tab → Confirm');
          dom.doc.activeElement = opener; dom.key('Tab', true); _assertEqual(dom.doc.activeElement, ov.confirm, 'outside + Shift+Tab → Confirm');
          dom.key('Escape');
          return p;
        }).then(esc => {
          _assertEqual(esc, 'CANCEL', 'Escape resolves the cancel value');
          _assertEqual(state.ctl._confirmModalOpen, false, 'flag cleared');
          _assertEqual(dom.listeners.length, 0, 'listener removed');
          _assertEqual(ov.removed && opener.refocused === true, true, 'overlay removed, focus restored');
          // backdrop, Cancel, Confirm, disabled Confirm, disabled-skipping Tab, onKey, onClose, close once
          let closed = 0;
          const mkOpen = extra => { const q = open(Object.assign({}, base, { value: () => 'VAL', onClose: () => { closed++; } }, extra)); return { q, ov: dom.doc.body.children[dom.doc.body.children.length - 1] }; };
          let a = mkOpen({}); a.ov.listeners.click({ target: {} }); // click inside dialog: ignored
          a.ov.cancel.listeners.click();
          return a.q.then(v => { _assertEqual(v, 'CANCEL', 'Cancel'); _assertEqual(closed, 1, 'onClose once');
            const b = mkOpen({}); b.ov.listeners.click({ target: b.ov }); return b.q; });
        }).then(v => {
          _assertEqual(v, 'CANCEL', 'backdrop');
          const c = mkOpen2(dom, open, base);
          c.ov.confirm.disabled = true; c.ov.confirm.listeners.click();
          dom.doc.activeElement = c.ov.cancel; dom.key('Tab'); _assertEqual(dom.doc.activeElement, c.ov.cancel, 'disabled Confirm skipped: one stop only');
          c.ov.confirm.disabled = false; c.ov.confirm.listeners.click(); c.ov.confirm.listeners.click();
          return c.q;
        }).then(v => {
          _assertEqual(v, 'VAL', 'Confirm resolves value() (the disabled click did nothing; a second click is ignored)');
          _assertEqual(state.ctl._confirmModalOpen, false, 'flag cleared after Confirm');
          const d = mkOpen2(dom, open, Object.assign({}, base, { onKey: (e, c, close) => { if (e.key !== 'Enter') return false; close('ENTER'); return true; } }));
          dom.key('Enter');
          return d.q;
        }).then(v => _assertEqual(v, 'ENTER', 'onKey can resolve (prompt Enter-in-input)'));
      },
    }
  );
  function mkOpen2(dom, open, cfg) {
    const q = open(Object.assign({}, cfg, { value: () => 'VAL' }));
    return { q, ov: dom.doc.body.children[dom.doc.body.children.length - 1] };
  }
})();
