// tests/assert-templates.js — N-427 (TPL-1) Briefing Pack & Report templates: the pure
// helpers (utils.js, permissions.js), the CONFIG.TEMPLATES whitelists, and source guards
// for the page files and api.js helpers (the page files need a DOM and are not loaded here;
// the api.js helpers are async and need Graph, so they are guarded by source text).
// Loads AFTER tests/assertions.js (ASSERTIONS + shared helpers).

// Body of the function starting at `sig` in js/<file>, up to its closing "\n}\n".
function _tplBody(file, sig) {
  const src = String((typeof ALL_SOURCES !== 'undefined' && ALL_SOURCES[file]) || '').replace(/\r\n/g, '\n');
  const i = src.indexOf(sig);
  if (i < 0) return '';
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j < 0 ? undefined : j);
}

function _tplNeedSources() {
  if (typeof ALL_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js.');
}

ASSERTIONS.push(
  {
    name: 'N-427 AC1 templatesManage is Admin only; canManageTemplates follows it',
    fn: function () {
      _assertEqual(CONFIG.ROLE_CAPABILITIES.templatesManage, ['admin'], 'capability list');
      _assertEqual(canManageTemplates('admin'), true, 'admin');
      ['leadership', 'delivery_manager', 'talent_partner', 'people_ops', 'sales', 'staff', 'viewer', undefined, null, '']
        .forEach(r => _assertEqual(canManageTemplates(r), false, 'not ' + r));
    },
  },
  {
    name: 'N-427 AC2 isTemplateRow — true / 1 / Yes only; missing column or null row is not a template',
    fn: function () {
      [true, 1, 'Yes'].forEach(v => _assertEqual(isTemplateRow({ IsTemplate: v }), true, 'IsTemplate ' + v));
      [false, 0, 'No', 'yes', undefined, null, ''].forEach(v => _assertEqual(isTemplateRow({ IsTemplate: v }), false, 'IsTemplate ' + v));
      _assertEqual(isTemplateRow({ Title: 'x' }), false, 'missing column');
      _assertEqual(isTemplateRow(null), false, 'null row');
      _assertEqual(isTemplateRow(undefined), false, 'undefined row');
    },
  },
  {
    name: 'N-427 AC3 partitionTemplates splits, keeps order, never mutates, tolerates non-arrays',
    fn: function () {
      const rows = [{ id: 1 }, { id: 2, IsTemplate: true }, { id: 3, IsTemplate: 'No' }, { id: 4, IsTemplate: 1 }];
      const before = JSON.stringify(rows);
      const r = partitionTemplates(rows);
      _assertEqual(r.templates.map(x => x.id), [2, 4], 'templates');
      _assertEqual(r.items.map(x => x.id), [1, 3], 'items');
      _assertEqual(JSON.stringify(rows), before, 'input untouched');
      [null, undefined, 'x', {}].forEach(v => _assertEqual(partitionTemplates(v), { templates: [], items: [] }, 'non-array ' + String(v)));
    },
  },
  {
    name: 'N-427 AC4 no copy / clone whitelist can carry IsTemplate, TemplateName or the owner; BP never carries contact fields',
    fn: function () {
      const forbidden = ['IsTemplate', 'TemplateName'];
      ['BRIEFING_PACK', 'SAVED_REPORT'].forEach(k => {
        const s = CONFIG.TEMPLATES[k];
        ['copyFields', 'overrideFields'].forEach(f => {
          _assertEqual(Array.isArray(s[f]) && s[f].length > 0, true, k + '.' + f + ' is a non-empty list');
          _assertEqual(s[f].filter(x => forbidden.includes(x) || x === s.ownerField), [], k + '.' + f + ' has no forbidden key');
        });
      });
      const contact = ['ContactName', 'ContactTitle', 'ContactEmail'];
      const bp = CONFIG.TEMPLATES.BRIEFING_PACK;
      _assertEqual(bp.copyFields.concat(bp.overrideFields).filter(x => contact.includes(x)), [], 'no BP contact field');
      _assertEqual([bp.list, bp.ownerField, CONFIG.TEMPLATES.SAVED_REPORT.list, CONFIG.TEMPLATES.SAVED_REPORT.ownerField],
        ['BriefingPacks', 'PackOwner', 'SavedReports', 'ReportOwner'], 'lists and owner fields');
      _tplNeedSources();
      const lists = [
        ['api.js', /const _BRIEFING_PACK_COPY_FIELDS = \[([\s\S]*?)\];/],
        ['report-builder.js', /const _SAVED_REPORT_COPY_FIELDS = \[([\s\S]*?)\];/],
      ];
      lists.forEach(([file, re]) => {
        const m = String(ALL_SOURCES[file] || '').match(re);
        _assertEqual(!!m, true, file + ' copy whitelist found');
        _assertEqual(/IsTemplate|TemplateName|PackOwner|ReportOwner/.test(m ? m[1] : ''), false, file + ' ordinary Copy never carries template / owner fields');
      });
    },
  },
  {
    name: 'N-427 AC5 templateDisplayName / normaliseTemplateName',
    fn: function () {
      _assertEqual(templateDisplayName({ TemplateName: ' CoE ', Title: 'Pack' }), 'CoE', 'TemplateName wins, trimmed');
      _assertEqual(templateDisplayName({ TemplateName: '   ', Title: ' Pack ' }), 'Pack', 'blank name falls back to Title');
      _assertEqual(templateDisplayName({ TemplateName: '', Title: '  ' }), CONFIG.TEMPLATES.UNTITLED_NAME, 'then the fallback');
      _assertEqual(templateDisplayName(null), CONFIG.TEMPLATES.UNTITLED_NAME, 'null row');
      _assertEqual(normaliseTemplateName('  Exec   Search \n Standard '), 'Exec Search Standard', 'trim + collapse');
      _assertEqual(normaliseTemplateName('   '), '', 'blank');
      _assertEqual(normaliseTemplateName(null), '', 'null');
      const long = 'x'.repeat(CONFIG.TEMPLATES.NAME_MAX_CHARS + 20);
      _assertEqual(normaliseTemplateName(long).length, CONFIG.TEMPLATES.NAME_MAX_CHARS, 'capped');
    },
  },
  {
    name: 'N-427 AC6 templatesVisibleTo — every BP template for every role; TP gets project-scope report templates only; sorted; unknown kind []',
    fn: function () {
      const rows = [
        { id: 1, IsTemplate: true, TemplateName: 'Standard', Scope: 'company' },
        { id: 2, IsTemplate: true, TemplateName: 'CoE', Scope: 'project' },
        { id: 3, Title: 'not a template', Scope: 'project' },
        { id: 4, IsTemplate: 'Yes', TemplateName: 'Exec Search', Scope: 'project' },
      ];
      const ids = (k, r) => templatesVisibleTo(k, r, rows).map(x => x.id);
      ['admin', 'leadership', 'delivery_manager', 'talent_partner', 'viewer'].forEach(r =>
        _assertEqual(ids('BRIEFING_PACK', r), [2, 4, 1], 'BP ' + r + ' sees all, sorted'));
      _assertEqual(ids('SAVED_REPORT', 'admin'), [2, 4, 1], 'report admin');
      _assertEqual(ids('SAVED_REPORT', 'delivery_manager'), [2, 4, 1], 'report DM');
      _assertEqual(ids('SAVED_REPORT', 'talent_partner'), [2, 4], 'report TP: no company-scope template');
      _assertEqual(ids('NOPE', 'admin'), [], 'unknown kind');
      _assertEqual(ids('MESSAGES', 'admin'), [], 'a non-kind CONFIG.TEMPLATES key');
      _assertEqual(templatesVisibleTo('BRIEFING_PACK', 'admin', null), [], 'non-array rows');
      _assertEqual(rows.map(r => r.id), [1, 2, 3, 4], 'input order untouched');
    },
  },
  {
    name: 'N-427 AC7 a template is never reassignable; ordinary packs unchanged',
    fn: function () {
      const t = { IsTemplate: true, PackOwner: 'me@x.com', ProjectID: 5 };
      _assertEqual(canReassignBriefingPack('admin', 'a@x.com', t, []), false, 'admin');
      _assertEqual(canReassignBriefingPack('talent_partner', 'me@x.com', t, []), false, 'owner');
      _assertEqual(canReassignBriefingPack('delivery_manager', 'd@x.com', t, ['5']), false, 'DM on project');
      const p = { PackOwner: 'me@x.com', ProjectID: 5 };
      _assertEqual(canReassignBriefingPack('admin', 'a@x.com', p, []), true, 'control: admin on a normal pack');
      _assertEqual(canReassignBriefingPack('talent_partner', 'me@x.com', p, []), true, 'control: owner');
    },
  },
  {
    name: 'N-427 AC8 both libraries partition templates out and scope only the items',
    fn: function () {
      _tplNeedSources();
      const bp = _tplBody('briefing-pack.js', 'async function showBriefingPackLibrary(');
      const rb = _tplBody('report-builder.js', 'async function showReportBuilderLibrary(');
      _assertEqual(/partitionTemplates\(packs\)/.test(bp) && /_bpVisiblePacks\(items,/.test(bp), true, 'BP library');
      _assertEqual(/_bpVisiblePacks\(packs,/.test(bp), false, 'BP library never scopes the raw list');
      _assertEqual(/templatesVisibleTo\('BRIEFING_PACK',/.test(bp), true, 'BP template cache');
      _assertEqual(/partitionTemplates\(reports\)/.test(rb) && /_rbVisibleReports\(items,/.test(rb), true, 'Report library');
      _assertEqual(/_rbVisibleReports\(reports,/.test(rb), false, 'Report library never scopes the raw list');
      _assertEqual(/templatesVisibleTo\('SAVED_REPORT',/.test(rb), true, 'Report template cache');
    },
  },
  {
    name: 'N-427 AC9 every update / delete path re-checks templates before its write',
    fn: function () {
      _tplNeedSources();
      const GUARD = /\b(checkTemplateWrite|checkTemplateManage)\(/;
      const sites = [
        ['briefing-pack.js', 'async function bpSavePack(', 'updateBriefingPack('],
        ['briefing-pack.js', 'async function bpDeletePack(', "deleteItem('BriefingPacks'"],
        ['report-builder.js', 'async function rbSaveReport(', 'updateSavedReport('],
        ['report-builder.js', 'async function rbDeleteReport(', "deleteItem('SavedReports'"],
      ];
      const bad = [];
      sites.forEach(([file, sig, write]) => {
        const fn = _tplBody(file, sig);
        const g = fn.search(GUARD), w = fn.indexOf(write);
        if (!fn || w < 0 || g < 0 || g > w) bad.push(`${file} ${sig} (guard ${g}, write ${w})`);
        else if (!/if \(!(t|w)\.ok\) \{ toast\((t|w)\.reason/.test(fn.slice(g, w))) bad.push(`${file} ${sig} does not refuse on !ok`);
      });
      _assertEqual(bad, [], 'every template write path is guarded');
      _assertEqual(/isTemplateRow\(pack\) \? await checkTemplateManage\(\)/.test(_tplBody('briefing-pack.js', 'async function bpDeletePack(')), true, 'bpDeletePack uses the row it already read');
      // Positive control: the same scan flags an unguarded body.
      const ctl = "async function x() {\n  await deleteItem('SavedReports', 1);\n}\n";
      _assertEqual(ctl.search(GUARD) < 0, true, 'control: an unguarded body is detected');
      // Copy of a template routes to the clone helper.
      _assertEqual(/isTemplateRow\(source\)[\s\S]*cloneBriefingPackFromTemplate\(/.test(_tplBody('briefing-pack.js', 'async function bpCopyPackAction(')), true, 'BP Copy of a template clones');
      _assertEqual(/isTemplateRow\(source\)[\s\S]*cloneSavedReportFromTemplate\(/.test(_tplBody('report-builder.js', 'async function rbCopyReportAction(')), true, 'Report Copy of a template clones');
      // rbSaveReport no longer lets a rejection escape the async handler.
      _assertEqual(/\} catch \(e\) \{\s*toast\(/.test(_tplBody('report-builder.js', 'async function rbSaveReport(')), true, 'rbSaveReport catches');
    },
  },
  {
    name: 'N-427 AC10 checkTemplateManage / checkTemplateWrite are fresh and fail closed',
    fn: function () {
      _tplNeedSources();
      const m = _tplBody('api.js', 'async function checkTemplateManage(');
      const w = _tplBody('api.js', 'async function checkTemplateWrite(');
      _assertEqual(/getEffectiveRole\(/.test(m), true, 'fresh role');
      _assertEqual(/_resolvedRole/.test(m) || /_resolvedRole/.test(w), false, 'never page-load role');
      _assertEqual(/catch \(e\)[\s\S]*return \{ ok: false, reason: CONFIG\.TEMPLATES\.MESSAGES\.checkFailed \}/.test(m), true, 'manage fails closed');
      _assertEqual(/catch \(e\)[\s\S]*return \{ ok: false, reason: CONFIG\.TEMPLATES\.MESSAGES\.checkFailed \}/.test(w), true, 'write fails closed on a read error');
      _assertEqual(/isTemplateRow\(item\) \? checkTemplateManage\(\)/.test(w), true, 'template → admin check');
    },
  },
  {
    name: 'N-427 AC11 _cloneTemplateItem refuses a non-template, gates the project, forces non-template + owner last',
    fn: function () {
      _tplNeedSources();
      const c = _tplBody('api.js', 'async function _cloneTemplateItem(');
      _assertEqual(/if \(!isTemplateRow\(src\)\) throw/.test(c), true, 'refuses a non-template source');
      _assertEqual(/checkProjectWrite\(fields\.ProjectID\)/.test(c), true, 'N-369 gate on the target project');
      const lastPick = c.lastIndexOf('_pickFields(');
      ['fields.IsTemplate = false;', "fields.TemplateName = '';", 'fields[spec.ownerField] ='].forEach(s => {
        const i = c.indexOf(s);
        _assertEqual(i > lastPick && lastPick > 0, true, s + ' after the picks');
      });
      _assertEqual(c.indexOf('createItem(spec.list, fields)') > c.indexOf('fields[spec.ownerField] ='), true, 'create last');
      ['async function cloneBriefingPackFromTemplate(', 'async function cloneSavedReportFromTemplate('].forEach(s =>
        _assertEqual(_tplBody('api.js', s).includes('_cloneTemplateItem(CONFIG.TEMPLATES.'), true, s));
    },
  },
  {
    name: 'N-427 AC12 / AC13 new Graph helpers live in api.js only; builder payloads stay template-blind',
    fn: function () {
      _tplNeedSources();
      const defs = /function (checkTemplateManage|checkTemplateWrite|_cloneTemplateItem|cloneBriefingPackFromTemplate|cloneSavedReportFromTemplate)\(/g;
      const where = [];
      Object.keys(ALL_SOURCES).forEach(f => { if ((String(ALL_SOURCES[f]).match(defs) || []).length) where.push(f); });
      _assertEqual(where, ['api.js'], 'defined in api.js only');
      ['briefing-pack.js|async function bpSavePack(', 'report-builder.js|async function rbSaveReport('].forEach(k => {
        const [file, sig] = k.split('|');
        const body = _tplBody(file, sig);
        _assertEqual(body.length > 0, true, sig + ' found');
        _assertEqual(/IsTemplate|TemplateName/.test(body), false, sig + ' payload never writes the template flag');
      });
    },
  },
  {
    name: 'N-427 AC14 no reader of BriefingPacks / SavedReports outside the known files',
    fn: function () {
      _tplNeedSources();
      const known = ['config.js', 'api.js', 'api-briefing.js', 'briefing-pack.js', 'report-builder.js', 'graph-client.js'];
      const re = /BriefingPacks|SavedReports|getBriefingPacks|getSavedReports/;
      const strip = s => String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
      const stray = Object.keys(ALL_SOURCES).filter(f => !known.includes(f) && re.test(strip(ALL_SOURCES[f])));
      _assertEqual(stray, [], 'no unexpected reader in js/ (mcp/ is checked by the Tester grep)');
      _assertEqual(re.test('getItems("SavedReports")'), true, 'control: the pattern matches a real read');
    },
  },
  {
    name: 'N-427 AC16 Readme data model lists the template columns and the UI-level enforcement',
    fn: function () {
      if (typeof ALL_HTML === 'undefined') _skip('Readme scan needs filesystem access — runs under node tests/run.js.');
      const html = String(ALL_HTML['Readme.html'] || '');
      const row = name => { const i = html.indexOf('<td><strong>' + name + '</strong></td>'); return i < 0 ? '' : html.slice(i, html.indexOf('</tr>', i)); };
      ['SavedReports', 'BriefingPacks'].forEach(n => {
        const r = row(n);
        _assertEqual(/IsTemplate/.test(r) && /TemplateName/.test(r) && /N-427/.test(r), true, n + ' row');
        _assertEqual(/not enforced by SharePoint|SharePoint does not enforce it/.test(r), true, n + ' says UI-level');
      });
      _assertEqual(/Scope, ProjectID, RoleID,/.test(row('SavedReports')), true, 'SavedReports lists RoleID');
    },
  }
);

// ── N-428 (TPL-2) Briefing Pack templates UI ─────────────────────────────

// templateBandRowsHtml lives in briefing-pack.js (needs a DOM-free context only), which the
// VM does not load: build it from its source text so it can be unit-tested here.
function _tplBandFn() {
  _tplNeedSources();
  const src = _tplBody('briefing-pack.js', 'function templateBandRowsHtml(');
  if (!src) throw new Error('templateBandRowsHtml not found in briefing-pack.js');
  return new Function(src + '\n}\nreturn templateBandRowsHtml;')();
}

// Cell width of every <tr> in `html`, honouring colspan.
function _tplRowWidths(html) {
  return (String(html).match(/<tr[\s\S]*?<\/tr>/g) || []).map(tr =>
    (tr.match(/<t[dh]\b[^>]*>/g) || []).reduce((n, td) => {
      const m = td.match(/colspan="(\d+)"/);
      return n + (m ? Number(m[1]) : 1);
    }, 0));
}

ASSERTIONS.push(
  {
    name: 'N-428 AC1 stripTemplateScope blanks the BP scope, never mutates, unknown kind copies',
    fn: function () {
      const input = { Title: 'T', Pages: '[]', ProjectID: 5, RoleID: 9, ClientName: 'X', ContactEmail: 'a@b' };
      const before = JSON.stringify(input);
      const out = stripTemplateScope('BRIEFING_PACK', input);
      _assertEqual(JSON.stringify(input), before, 'input not mutated');
      _assertEqual([out.Title, out.Pages, out.ProjectID, out.RoleID], ['T', '[]', null, null], 'kept / nulled');
      _assertEqual([out.ClientName, out.RoleTitle, out.RoleLocation, out.ContactName, out.ContactTitle, out.ContactEmail],
        ['', '', '', '', '', ''], 'text scope blanked');
      const u = stripTemplateScope('NOPE', input);
      _assertEqual(u !== input && JSON.stringify(u) === before, true, 'unknown kind → shallow copy');
      _assertEqual(stripTemplateScope('BRIEFING_PACK', null).ProjectID, null, 'non-object fields → strip values only');
    },
  },
  {
    name: 'N-428 AC2 BRIEFING_PACK templateFields / stripFields; labels and messages present',
    fn: function () {
      const bp = CONFIG.TEMPLATES.BRIEFING_PACK;
      _assertEqual(bp.templateFields, ['Title', 'Pages'], 'templateFields');
      _assertEqual(Object.keys(bp.stripFields).sort(),
        ['ClientName', 'ContactEmail', 'ContactName', 'ContactTitle', 'ProjectID', 'RoleID', 'RoleLocation', 'RoleTitle'], 'stripFields = TPL-D5');
      _assertEqual(bp.templateFields.filter(f => ['IsTemplate', 'TemplateName', bp.ownerField].includes(f)), [], 'templateFields never hold flag / name / owner');
      ['band', 'badge', 'use', 'edit', 'del', 'saveAs', 'modalTitle', 'modalConfirm', 'projectLabel', 'projectPlaceholder',
        'roleLabel', 'roleNone', 'rolesLoading', 'nameLabel', 'namePromptTitle', 'namePromptMessage'].forEach(k =>
        _assertEqual(typeof CONFIG.TEMPLATES.LABELS[k] === 'string' && CONFIG.TEMPLATES.LABELS[k].length > 0, true, 'LABELS.' + k));
      ['noWritableProject', 'rolesLoadFailed', 'createdFromTemplate', 'savedAsTemplate', 'scopeNote', 'bandEmptyAdmin'].forEach(k =>
        _assertEqual(typeof CONFIG.TEMPLATES.MESSAGES[k] === 'string' && CONFIG.TEMPLATES.MESSAGES[k].length > 0, true, 'MESSAGES.' + k));
      _assertEqual(CONFIG.TEMPLATES.MESSAGES.savedAsTemplate.includes('{name}'), true, 'savedAsTemplate has {name}');
    },
  },
  {
    name: 'N-428 AC3 saveTemplateItem — api.js only; fresh checks; strip, then force the flag; owner on create only',
    fn: function () {
      _tplNeedSources();
      const where = Object.keys(ALL_SOURCES).filter(f => /function saveTemplateItem\(/.test(String(ALL_SOURCES[f])));
      _assertEqual(where, ['api.js'], 'defined in api.js only');
      const b = _tplBody('api.js', 'async function saveTemplateItem(');
      ['normaliseTemplateName(', 'checkTemplateManage()', 'isTemplateRow(row)', 'stripTemplateScope(kind,'].forEach(s =>
        _assertEqual(b.includes(s), true, 'calls ' + s));
      _assertEqual(b.indexOf('out.IsTemplate = true') > b.indexOf('stripTemplateScope('), true, 'flag forced after strip');
      _assertEqual(b.indexOf('out.TemplateName = n') > b.indexOf('stripTemplateScope('), true, 'name forced after strip');
      _assertEqual(b.indexOf('out[spec.ownerField]') > b.indexOf('if (id) return updateItem('), true, 'owner set on create path only');
      const setters = Object.keys(ALL_SOURCES).filter(f => /IsTemplate\s*(=|:)\s*true/.test(String(ALL_SOURCES[f])));
      _assertEqual(setters, ['api.js'], 'only api.js sets IsTemplate true');
      _assertEqual((b.match(/IsTemplate\s*=\s*true/g) || []).length, 1, 'once, in saveTemplateItem');
    },
  },
  {
    name: 'N-428 AC4 / AC5 briefing-pack.js adds no Graph write; bpSavePack stays template-blind and delegates',
    fn: function () {
      _tplNeedSources();
      const src = String(ALL_SOURCES['briefing-pack.js'] || '');
      _assertEqual(/\b(createItem|updateItem)\(/.test(src), false, 'no createItem / updateItem');
      _assertEqual((src.match(/deleteItem\(/g) || []).length, 1, 'only the existing bpDeletePack deleteItem');
      const b = _tplBody('briefing-pack.js', 'async function bpSavePack(');
      _assertEqual(/IsTemplate|TemplateName/.test(b), false, 'no template field names in bpSavePack');
      _assertEqual(b.includes('if (_bpEditingTemplate) return _bpSaveTemplate(title);'), true, 'delegates in template mode');
      const t = _tplBody('briefing-pack.js', 'async function _bpSaveTemplate(');
      _assertEqual(t.includes("saveTemplateItem('BRIEFING_PACK', _bpPackId,") && t.includes('normaliseTemplateName('), true, '_bpSaveTemplate → saveTemplateItem');
    },
  },
  {
    name: 'N-428 AC6 templateBandRowsHtml — empty, band + rows, widths match colspan, escaped, optional buttons',
    fn: function () {
      const band = _tplBandFn();
      const acts = () => ({ use: ' data-act="u"', edit: '', del: '' });
      _assertEqual(band({ colspan: 5, templates: [], emptyMessage: '', rowActs: acts }), '', 'no templates, no message → empty');
      const empty = band({ colspan: 5, templates: [], emptyMessage: 'none yet', rowActs: acts });
      _assertEqual(_tplRowWidths(empty), [5, 5], 'band + empty row');
      const rows = [{ id: 1, TemplateName: '<script>x</script>', Title: '<b>t</b>' }, { id: 2, Title: 'Plain' }];
      const html = band({ colspan: 5, templates: rows, rowActs: t => ({ use: ' data-u', edit: t.id === 1 ? ' data-e' : '', del: '' }) });
      _assertEqual(_tplRowWidths(html), [5, 5, 5], 'band + 2 rows, each 5 wide');
      _assertEqual(/<script>|<b>t<\/b>/.test(html), false, 'user text escaped');
      _assertEqual((html.match(/data-u/g) || []).length, 2, 'Use on every row');
      _assertEqual((html.match(/data-e/g) || []).length, 1, 'Edit only when given');
      _assertEqual(_tplRowWidths(band({ colspan: 4, templates: rows, rowActs: acts })), [4, 4, 4], 'colspan 4 (N-429 report table)');
      _assertEqual(_tplRowWidths('<tr><td colspan="3"></td><td></td></tr>'), [4], 'control: width counter honours colspan');
    },
  },
  {
    name: 'N-428 AC7 library renders the band first, from the unfiltered cache, Edit / Delete gated',
    fn: function () {
      _tplNeedSources();
      const b = _tplBody('briefing-pack.js', 'function _bpRenderLibrary(');
      _assertEqual(b.includes('templateBandRowsHtml({') && b.includes('colspan: 5') && b.includes('templates: _bpTemplateCache'), true, 'band from _bpTemplateCache, colspan 5');
      _assertEqual(b.includes('<tbody>${band}${rows}</tbody>'), true, 'band before client rows');
      _assertEqual(b.includes('const manage = canManageTemplates(_resolvedRole);') && /edit:\s*manage \?/.test(b) && /del:\s*manage \?/.test(b), true, 'edit / del gated');
      _assertEqual(/_bpTemplateCache\.filter/.test(b), false, 'band not filtered by client');
    },
  },
  {
    name: 'N-428 AC8 bpUseTemplateAction — writable projects, one dialog, clone without Title / contact, then autofill',
    fn: function () {
      _tplNeedSources();
      const b = _tplBody('briefing-pack.js', 'async function bpUseTemplateAction(');
      ['pairSelectModal(', 'cloneBriefingPackFromTemplate(', '_bpCanWrite(p.id)', 'bpCurrentMonth()'].forEach(s =>
        _assertEqual(b.includes(s), true, 'calls ' + s));
      const ov = (b.match(/const overrides = \{([\s\S]*?)\};/) || [])[1] || '';
      _assertEqual(ov.length > 0, true, 'overrides literal found');
      _assertEqual(/\bTitle\s*:|Contact/.test(ov), false, 'no Title, no contact fields');
      _assertEqual(b.indexOf('bpApplyRoleAutofill()') > b.indexOf('await bpLoadPack(copy.id)'), true, 'autofill after load');
      _assertEqual(/catch \(e\)/.test(b) && b.includes('clearButtonLoading(btn)'), true, 'catches + clears the button');
    },
  },
  {
    name: 'N-428 AC9 bpSaveAsTemplateAction — named, new row, never touches the open pack',
    fn: function () {
      _tplNeedSources();
      const b = _tplBody('briefing-pack.js', 'async function bpSaveAsTemplateAction(');
      ['promptModal(', 'normaliseTemplateName(', "saveTemplateItem('BRIEFING_PACK', null,"].forEach(s =>
        _assertEqual(b.includes(s), true, 'calls ' + s));
      _assertEqual(/_bpPackId\s*=/.test(b) || b.includes('bpSavePack('), false, 'open pack untouched');
    },
  },
  {
    name: 'N-428 AC10 / AC11 template mode — load sets it and drops the project; new pack resets; header gates',
    fn: function () {
      _tplNeedSources();
      const load = _tplBody('briefing-pack.js', 'async function bpLoadPack(');
      _assertEqual(load.includes('_bpEditingTemplate = isTemplateRow(pack);') && /if \(_bpEditingTemplate\) \{\s*_bpProjectId = null;/.test(load), true, 'load sets mode, nulls project');
      _assertEqual(_tplBody('briefing-pack.js', 'async function bpStartNewPack(').includes('_bpEditingTemplate = false;'), true, 'new pack resets');
      const r = _tplBody('briefing-pack.js', 'function bpRender(');
      _assertEqual(r.includes('canManageTemplates(_resolvedRole)') && /manage && !ro && !_bpEditingTemplate \? `<button[^`]*bpSaveAsTemplateAction/.test(r), true, 'Save as template gated');
      _assertEqual(r.includes('tpl-badge'), true, 'badge in template mode');
      const src = String(ALL_SOURCES['briefing-pack.js'] || '');
      _assertEqual((src.match(/=== 'admin'/g) || []).length, 2, "no new 'admin' literal (the two pre-existing remain)");
    },
  },
  {
    name: 'N-428 AC12 / AC13 pairSelectModal in ui-kit.js only, DOM-built options; actions registered once',
    fn: function () {
      _tplNeedSources();
      const where = Object.keys(ALL_SOURCES).filter(f => /function pairSelectModal\(/.test(String(ALL_SOURCES[f])));
      _assertEqual(where, ['ui-kit.js'], 'pairSelectModal in ui-kit.js only');
      const b = _tplBody('ui-kit.js', 'function pairSelectModal(');
      _assertEqual(b.includes('_confirmModalOpen = true') && b.includes('opt.textContent'), true, 'shares the guard, textContent options');
      _assertEqual(/innerHTML\s*=\s*`[^`]*\$\{o\./.test(b), false, 'no option data in innerHTML');
      const reg = _tplBody('briefing-pack.js', 'registerActions({');
      ['bpUseTemplateAction', 'bpSaveAsTemplateAction'].forEach(n =>
        _assertEqual((reg.match(new RegExp('\\b' + n + '\\b', 'g')) || []).length, 1, n + ' registered once'));
    },
  }
);