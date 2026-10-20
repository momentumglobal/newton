// tests/assert-checklists.js — project and role checklists, variants, Config Panel editor validation.
// N-353 split of the former single-array tests/assertions.js. Loads AFTER tests/assertions.js
// (which declares ASSERTIONS and the shared helpers) and pushes this domain's entries into it.
// Entries are unchanged from the pre-split file; names are referenced by CI logs and QA docs.

ASSERTIONS.push(
  // ── N-266a — Project & Role checklists (checklist-logic.js) ───────────────────
  {
    name: 'N-266a spYesNo — every Graph Yes/No shape, and the fallback for a missing value',
    fn: function () {
      [true, 1, 'Yes', 'yes', ' YES ', 'true', '1'].forEach(v => _assertEqual(spYesNo(v, false), true, 'true for ' + JSON.stringify(v)));
      [false, 0, 'No', 'no', 'false', '0'].forEach(v => _assertEqual(spYesNo(v, true), false, 'false for ' + JSON.stringify(v)));
      [undefined, null, '', 'maybe', {}].forEach(v => {
        _assertEqual(spYesNo(v, true), true, 'fallback true for ' + JSON.stringify(v));
        _assertEqual(spYesNo(v, false), false, 'fallback false for ' + JSON.stringify(v));
      });
    },
  },
  {
    name: 'N-266a checklistVariants — keys from CONFIG.CHECKLISTS.VARIANTS, Default first (N-267 grouping)',
    fn: function () {
      // N-267: was Default + one per PROJECT_TYPES value. Now the grouping
      // table: Embedded = Default, CoE, Exec Search & MG AI shared.
      _assertEqual(checklistVariants(), ['Default', 'CoE', 'ExecSearchMGAI'], 'variant keys');
      _assertEqual(checklistVariants()[0], CONFIG.CHECKLISTS.DEFAULT_VARIANT, 'Default first');
    },
  },
  {
    name: 'N-266a activeChecklistItems / resolveChecklistVariant — blank Active is active; retired-only variant falls back to Default',
    fn: function () {
      const T = [
        { id: '1', RecordType: 'project', Variant: 'Default', ItemKey: 'a' },                 // Active never set
        { id: '2', RecordType: 'Project ', Variant: 'default', ItemKey: 'b', Active: 'Yes' }, // hand-entered casing
        { id: '3', RecordType: 'project', Variant: 'CoE', ItemKey: 'c', Active: false },      // retired only
        { id: '4', RecordType: 'project', Variant: 'ExecSearchMGAI', ItemKey: 'd', Active: 1 },  // N-267 grouped key
        { id: '5', RecordType: 'role', Variant: 'CoE', ItemKey: 'e' },
      ];
      _assertEqual(activeChecklistItems(T, 'project', 'Default').map(t => t.id), ['1', '2'], 'default project items incl. blank Active');
      _assertEqual(activeChecklistItems(T, 'project', 'CoE').length, 0, 'retired item excluded');
      _assertEqual(resolveChecklistVariant(T, 'project', 'CoE'), 'Default', 'CoE has only retired items → Default');
      _assertEqual(resolveChecklistVariant(T, 'project', 'Exec Search'), 'ExecSearchMGAI', 'Exec Search → grouped variant with active items');
      _assertEqual(resolveChecklistVariant(T, 'project', 'MG AI'), 'ExecSearchMGAI', 'MG AI → same grouped variant');
      _assertEqual(resolveChecklistVariant(T, 'project', 'Embedded'), 'Default', 'Embedded → Default');
      _assertEqual(resolveChecklistVariant(T, 'project', ''), 'Default', 'no project type → Default');
      _assertEqual(resolveChecklistVariant(T, 'project', undefined), 'Default', 'undefined project type → Default');
      _assertEqual(resolveChecklistVariant(T, 'role', 'CoE'), 'CoE', 'role inherits project type');
      _assertEqual(resolveChecklistVariant(T, 'role', 'MG AI'), 'Default', 'role type with no items → Default');
      _assertEqual(activeChecklistItems(null, 'project', 'Default'), [], 'null templates');
    },
  },
  {
    name: 'N-266a groupChecklistItems — section then item order, blanks last, blank section → General',
    fn: function () {
      const g = groupChecklistItems([
        { id: '9', Section: 'Sourcing', SectionOrder: 2, ItemOrder: 2 },
        { id: '3', Section: 'Kick-off', SectionOrder: 1, ItemOrder: 2 },
        { id: '4', Section: 'Kick-off', SectionOrder: 1, ItemOrder: 1 },
        { id: '8', Section: 'Sourcing', SectionOrder: 2, ItemOrder: 1 },
        { id: '6', Section: 'Sourcing', SectionOrder: 2 },          // no ItemOrder → last
        { id: '5', Section: 'Sourcing', SectionOrder: 2 },          // tie → id order
        { id: '7', Section: '',         SectionOrder: '' },         // → General, no order → last section
      ]);
      _assertEqual(g.map(s => s.section), ['Kick-off', 'Sourcing', 'General'], 'section order');
      _assertEqual(g[0].items.map(i => i.id), ['4', '3'], 'kick-off items');
      _assertEqual(g[1].items.map(i => i.id), ['8', '9', '5', '6'], 'sourcing items, blanks last by id');
      _assertEqual(groupChecklistItems([]), [], 'empty');
    },
  },
  {
    name: 'N-266a checklistMode — full truth table',
    fn: function () {
      const never = { enabled: false, fromId: null };
      const on    = { enabled: true,  fromId: 100 };
      const off   = { enabled: false, fromId: 100 };
      const m = (settings, isAdmin, recordId, hasItems = true) => checklistMode({ settings, isAdmin, recordId, hasItems });
      _assertEqual(m(never, true, '5'), 'preview', 'never switched on: admin previews any record');
      _assertEqual(m(never, false, '5'), 'none', 'never switched on: non-admin sees nothing');
      _assertEqual(m(on, false, '99'), 'none', 'below watermark');
      _assertEqual(m(on, true, '99'), 'none', 'below watermark, admin too');
      _assertEqual(m(on, false, '100'), 'live', 'at watermark');
      _assertEqual(m(on, false, 250), 'live', 'numeric id above watermark');
      _assertEqual(m(off, false, '150'), 'none', 'switched off: non-admin');
      _assertEqual(m(off, true, '150'), 'preview', 'switched off: admin preview, in scope');
      _assertEqual(m(off, true, '50'), 'none', 'switched off: admin, below watermark');
      _assertEqual(m(on, true, 'pend_1727_ab12'), 'none', 'pending optimistic row');
      _assertEqual(m(on, true, null), 'none', 'no id');
      _assertEqual(m(on, true, '150', false), 'none', 'no items');
      _assertEqual(m({ enabled: 'Yes', fromId: 100 }, false, '150'), 'none', 'enabled must already be normalised to a boolean');
      _assertEqual(m({ enabled: true, fromId: '' }, true, '5'), 'preview', 'blank fromId = never switched on');
      _assertEqual(m(null, true, '5'), 'preview', 'missing settings');
    },
  },
  {
    name: 'N-266a checklistColumnVisible',
    fn: function () {
      _assertEqual(checklistColumnVisible({ settings: { enabled: false, fromId: null }, isAdmin: true, hasItems: true }), true, 'admin preview');
      _assertEqual(checklistColumnVisible({ settings: { enabled: false, fromId: null }, isAdmin: false, hasItems: true }), false, 'non-admin, never on');
      _assertEqual(checklistColumnVisible({ settings: { enabled: true, fromId: 10 }, isAdmin: false, hasItems: true }), true, 'non-admin, on');
      _assertEqual(checklistColumnVisible({ settings: { enabled: false, fromId: 10 }, isAdmin: false, hasItems: true }), false, 'non-admin, switched off');
      _assertEqual(checklistColumnVisible({ settings: { enabled: true, fromId: 10 }, isAdmin: true, hasItems: false }), false, 'no items');
    },
  },
  {
    name: 'N-266a resolveChecklistProgress / summariseChecklist — latest row wins; retired and unknown keys ignored',
    fn: function () {
      const p = resolveChecklistProgress([
        { id: '1', ItemKey: 'a', Done: true,  DoneByEmail: 'x@m.co', DoneDate: '2026-10-01T09:00:00Z' },
        { id: '2', ItemKey: 'a', Done: false, DoneByEmail: 'y@m.co', DoneDate: '2026-10-02T09:00:00Z' }, // later untick
        { id: '3', ItemKey: 'b', Done: 1,     DoneDate: '2026-10-01T09:00:00Z' },
        { id: '4', ItemKey: 'b', Done: 0,     DoneDate: '2026-10-01T09:00:00Z' },                        // tie → higher id
        { id: '5', ItemKey: 'c', Done: 'Yes', DoneDate: '2026-10-01T09:00:00Z' },
        { id: '6', ItemKey: 'd' },                                                                        // Done never set
        { id: '7', ItemKey: '', Done: true },
      ]);
      _assertEqual(p.get('a'), { done: false, by: 'y@m.co', at: '2026-10-02T09:00:00Z', rowId: '2' }, 'latest DoneDate wins');
      _assertEqual(p.get('b').done, false, 'equal dates → higher id');
      _assertEqual(p.get('c').done, true, "'Yes' reads as done");
      _assertEqual(p.get('d').done, false, 'blank Done is not done');
      _assertEqual(p.has(''), false, 'blank key ignored');
      const items = [
        { ItemKey: 'a', Required: true }, { ItemKey: 'c', Required: 'Yes' },
        { ItemKey: 'd' }, { ItemKey: 'z' },   // z has no progress row
      ];
      _assertEqual(summariseChecklist(items, p), { done: 1, total: 4, reqDone: 1, reqTotal: 2 }, 'summary');
      _assertEqual(summariseChecklist([], p), { done: 0, total: 0, reqDone: 0, reqTotal: 0 }, 'empty');
      _assertEqual(summariseChecklist(items, null), { done: 0, total: 4, reqDone: 0, reqTotal: 2 }, 'no progress map');
    },
  },
  {
    name: 'N-266a isSafeChecklistUrl — https and Newton pages only',
    fn: function () {
      [
        'https://momentumglobal.sharepoint.com/sites/x/Shared%20Documents/Playbook.docx',
        'HTTPS://example.com', 'https://example.com/a?b=1#c', 'https://example.com',
        'people.html', 'reporting.html#roles', 'reporting.html#roles?action=add', '  user-guide.html  ',
      ].forEach(u => _assertEqual(isSafeChecklistUrl(u), true, 'accept ' + u));
      [
        'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>',
        'http://example.com', '//evil.com', 'https://', 'https:///x', 'https://x.com/a b', 'https://x.com/"onmouseover=',
        'https://x.com/<script>', 'ftp://x.com', 'people.html"><script>', '../people.html', 'People.HTML',
        '', null, undefined,
      ].forEach(u => _assertEqual(isSafeChecklistUrl(u), false, 'reject ' + JSON.stringify(u)));
    },
  },
  // ── N-266b — Config Panel checklist editor (checklist-logic.js) ───────────────
  {
    name: 'N-266b validateChecklistItem — valid tick / link / action; every error path; registry keys passed in',
    fn: function () {
      const C    = CONFIG.CHECKLISTS;
      const keys = ['newton.test'];
      const v    = (over, k = keys) => validateChecklistItem(Object.assign({
        label: 'Kick-off call booked', section: 'Setup', type: 'tick', linkUrl: '', actionKey: '', help: '',
      }, over), k);
      const errs = (over, k) => Object.keys(v(over, k).errors).sort();

      _assertEqual(v({}), { ok: true, errors: {} }, 'valid tick');
      _assertEqual(v({ type: 'link', linkUrl: 'https://momentumglobal.sharepoint.com/sites/x/Playbook.docx' }).ok, true, 'valid https link');
      _assertEqual(v({ type: 'link', linkUrl: 'people.html#tracker' }).ok, true, 'valid Newton page link');
      _assertEqual(v({ type: 'action', actionKey: 'newton.test' }).ok, true, 'valid action');
      _assertEqual(v({ type: ' Link ', linkUrl: 'people.html' }).ok, true, 'type is case/space-insensitive');
      _assertEqual(v({ linkUrl: 'javascript:alert(1)', actionKey: 'nope' }).ok, true, 'a tick ignores the unused link/action fields');
      _assertEqual(v({ label: '<script>"x"</script>\'' }).ok, true, 'markup in a label is text, not an error');

      _assertEqual(errs({ label: '' }), ['label'], 'empty label');
      _assertEqual(errs({ label: '   ' }), ['label'], 'whitespace-only label');
      _assertEqual(errs({ label: 'x'.repeat(C.LABEL_MAX + 1) }), ['label'], 'label over LABEL_MAX');
      _assertEqual(v({ label: 'x'.repeat(C.LABEL_MAX) }).ok, true, 'label at LABEL_MAX');
      _assertEqual(v({ label: '  ' + 'x'.repeat(C.LABEL_MAX) + '  ' }).ok, true, 'length counted after trimming');
      _assertEqual(errs({ section: '' }), ['section'], 'empty section');
      _assertEqual(errs({ section: '\t ' }), ['section'], 'whitespace-only section');
      _assertEqual(errs({ section: 's'.repeat(C.LABEL_MAX + 1) }), ['section'], 'section over LABEL_MAX');
      _assertEqual(errs({ type: 'checkbox' }), ['type'], 'unknown type');
      _assertEqual(errs({ type: '' }), ['type'], 'no type');
      _assertEqual(errs({ type: 'link', linkUrl: '' }), ['linkUrl'], 'link with no URL');
      _assertEqual(errs({ type: 'link', linkUrl: 'javascript:alert(1)' }), ['linkUrl'], 'javascript: URL');
      _assertEqual(errs({ type: 'link', linkUrl: 'JaVaScRiPt:alert(1)' }), ['linkUrl'], 'mixed-case javascript: URL');
      _assertEqual(errs({ type: 'link', linkUrl: 'http://example.com' }), ['linkUrl'], 'http: URL');
      _assertEqual(errs({ type: 'link', linkUrl: 'https://example.com/' + 'a'.repeat(C.LABEL_MAX) }), ['linkUrl'], 'URL over the single-line column limit');
      _assertEqual(errs({ type: 'action', actionKey: 'newton.nope' }), ['actionKey'], 'unknown action key');
      _assertEqual(errs({ type: 'action', actionKey: '' }), ['actionKey'], 'no action key');
      _assertEqual(errs({ type: 'action', actionKey: 'newton.test' }, []), ['actionKey'], 'keys come from the argument, not a global');
      _assertEqual(Object.keys(validateChecklistItem({ label: 'a', section: 'b', type: 'action', actionKey: 'newton.test' }).errors),
        ['actionKey'], 'no keys argument → no action is valid');
      _assertEqual(errs({ help: 'h'.repeat(C.HELP_MAX + 1) }), ['help'], 'help over HELP_MAX');
      _assertEqual(v({ help: 'h'.repeat(C.HELP_MAX) }).ok, true, 'help at HELP_MAX');
      _assertEqual(errs({ label: ' ', section: '', type: 'link', linkUrl: 'data:text/html,x', help: 'h'.repeat(C.HELP_MAX + 1) }),
        ['help', 'label', 'linkUrl', 'section'], 'every error reported at once');
      _assertEqual(typeof v({ label: '' }).errors.label, 'string', 'errors carry a message');
      _assertEqual(validateChecklistItem().ok, false, 'no argument → invalid, no throw');
    },
  },
  // ── N-267 — checklist variant grouping (config.js + checklist-logic.js) ───────
  {
    name: 'N-267 CONFIG.CHECKLISTS.VARIANTS — well-formed grouping table',
    fn: function () {
      const V = CONFIG.CHECKLISTS.VARIANTS;
      _assertEqual(V[0].key, CONFIG.CHECKLISTS.DEFAULT_VARIANT, 'first entry is DEFAULT_VARIANT');
      _assertEqual(new Set(V.map(v => v.key)).size, V.length, 'keys unique');
      const mapped = [].concat(...V.map(v => v.projectTypes || []));
      _assertEqual(mapped.filter(t => !CONFIG.PROJECT_TYPES.includes(t)), [], 'every mapped type is a real PROJECT_TYPES value');
      _assertEqual(new Set(mapped).size, mapped.length, 'no project type in two variants');
      V.forEach(v => _assertEqual(typeof v.label === 'string' && v.label.length > 0, true, 'label for ' + v.key));
    },
  },
  {
    name: 'N-267 checklistVariantForProjectType / checklistVariantLabel — Embedded = Default, Exec Search + MG AI grouped',
    fn: function () {
      const f = checklistVariantForProjectType;
      _assertEqual(f('Embedded'), 'Default', 'Embedded');
      _assertEqual(f('CoE'), 'CoE', 'CoE');
      _assertEqual(f('Exec Search'), 'ExecSearchMGAI', 'Exec Search');
      _assertEqual(f('MG AI'), 'ExecSearchMGAI', 'MG AI');
      _assertEqual(f(' mg ai '), 'ExecSearchMGAI', 'case/space-insensitive');
      _assertEqual(f(''), 'Default', 'blank');
      _assertEqual(f(undefined), 'Default', 'undefined');
      _assertEqual(f(null), 'Default', 'null');
      _assertEqual(f('Internal'), 'Default', 'unlisted type');
      _assertEqual(f('Something New'), 'Default', 'unknown type');
      _assertEqual(checklistVariantLabel('Default'), 'Embedded (default)', 'Default label');
      _assertEqual(checklistVariantLabel('CoE'), 'CoE', 'CoE label');
      _assertEqual(checklistVariantLabel('ExecSearchMGAI'), 'Exec Search & MG AI', 'grouped label');
      _assertEqual(checklistVariantLabel(' default '), 'Embedded (default)', 'hand-typed key casing');
      _assertEqual(checklistVariantLabel('Legacy'), 'Legacy', 'unknown key shown as-is');
      _assertEqual(checklistVariantLabel(undefined), '', 'undefined key');
    },
  },
  {
    name: 'N-267 resolveChecklistVariant — grouped variant, CoE and Default fallback; legacy per-type rows never used',
    fn: function () {
      const T = [
        { id: '1', RecordType: 'project', Variant: 'Default', ItemKey: 'a' },
        { id: '2', RecordType: 'project', Variant: 'Exec Search', ItemKey: 'legacy1' },  // pre-N-267 key
        { id: '3', RecordType: 'project', Variant: 'MG AI', ItemKey: 'legacy2' },        // pre-N-267 key
        { id: '4', RecordType: 'role', Variant: 'ExecSearchMGAI', ItemKey: 'r' },
        { id: '5', RecordType: 'project', Variant: 'CoE', ItemKey: 'c' },
      ];
      _assertEqual(resolveChecklistVariant(T, 'project', 'Exec Search'), 'Default', 'legacy "Exec Search" rows ignored → Default');
      _assertEqual(resolveChecklistVariant(T, 'project', 'MG AI'), 'Default', 'legacy "MG AI" rows ignored → Default');
      _assertEqual(resolveChecklistVariant(T, 'role', 'MG AI'), 'ExecSearchMGAI', 'MG AI role uses grouped role items');
      _assertEqual(resolveChecklistVariant(T, 'role', 'Exec Search'), 'ExecSearchMGAI', 'Exec Search role uses the same');
      _assertEqual(resolveChecklistVariant(T, 'role', 'CoE'), 'Default', 'CoE role with no role items → Default');
      _assertEqual(resolveChecklistVariant(T, 'project', 'CoE'), 'CoE', 'CoE project');
      _assertEqual(resolveChecklistVariant(T, 'project', 'Embedded'), 'Default', 'Embedded project');
    },
  }
);
