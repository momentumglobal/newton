// tests/assert-starter-folders.js — N-259 starter folders (starter-folder-logic.js),
// the checklist action contract additions in checklists.js, and source guards.
// Loads AFTER tests/assertions.js (ASSERTIONS + shared helpers).

// A CONFIG copy with starter-folder ids set, so the pure rules can be tested
// on and off without touching the real (blank = dark) config.
function _sfCfg(patch) {
  const c = JSON.parse(JSON.stringify({ STARTER_FOLDERS: CONFIG.STARTER_FOLDERS, CHECKLISTS: CONFIG.CHECKLISTS }));
  c.STARTER_FOLDERS.DOCX_PARTS = CONFIG.STARTER_FOLDERS.DOCX_PARTS;   // regexes don't survive JSON
  if (patch) patch(c);
  return c;
}

ASSERTIONS.push(
  {
    name: 'N-259 config — TEMPLATES keys are CHECKLISTS.VARIANTS keys (D22); ships dark; placeholders listed',
    fn: function () {
      const variants = CONFIG.CHECKLISTS.VARIANTS.map(v => v.key).sort();
      ['project', 'role'].forEach(rt =>
        _assertEqual(Object.keys(CONFIG.STARTER_FOLDERS.TEMPLATES[rt]).sort(), variants, rt + ' template keys = variant keys'));
      _assertEqual(starterFoldersEnabled('project'), false, 'committed config is dark (no ids yet)');
      _assertEqual(starterFoldersEnabled('role'), false, 'role dark too (N-260)');
      _assertEqual(Object.keys(projectPlaceholderValues({}, {})), CONFIG.STARTER_FOLDERS.PLACEHOLDERS.project, 'placeholder keys = config list, same order');
      _assertEqual(CONFIG.STARTER_FOLDERS.SHARE_EXCLUDE.includes('admin@momentumglobal.co'), true, 'D11 shared mailbox excluded');
      _assertEqual(/^js\/vendor\/jszip-[\d.]+\.min\.js$/.test(CONFIG.STARTER_FOLDERS.JSZIP_SRC), true, 'JSZip is vendored, not a CDN');
    },
  },
  {
    name: 'N-259 starterFoldersEnabled / starterTemplateItemId — Default required, blank variant falls back (D16)',
    fn: function () {
      const off = _sfCfg(c => { c.STARTER_FOLDERS.TEMPLATE_DRIVE_ID = 'drv'; });
      _assertEqual(starterFoldersEnabled('project', off), false, 'drive id alone is not enough');
      const on = _sfCfg(c => { c.STARTER_FOLDERS.TEMPLATE_DRIVE_ID = 'drv'; c.STARTER_FOLDERS.TEMPLATES.project.Default = 'D1'; c.STARTER_FOLDERS.TEMPLATES.project.CoE = 'C1'; });
      _assertEqual(starterFoldersEnabled('project', on), true, 'drive + Default → on');
      _assertEqual(starterFoldersEnabled('role', on), false, 'role still off');
      const noDrive = _sfCfg(c => { c.STARTER_FOLDERS.TEMPLATES.project.Default = 'D1'; });
      _assertEqual(starterFoldersEnabled('project', noDrive), false, 'Default without drive → off');
      _assertEqual(starterTemplateItemId('project', 'CoE', on), { itemId: 'C1', variantUsed: 'CoE' }, 'own pack');
      _assertEqual(starterTemplateItemId('project', 'ExecSearchMGAI', on), { itemId: 'D1', variantUsed: 'Default' }, 'blank → Default');
      _assertEqual(starterTemplateItemId('project', 'Default', on), { itemId: 'D1', variantUsed: 'Default' }, 'Default itself');
      _assertEqual(starterTemplateItemId('project', 'CoE', _sfCfg()), null, 'nothing configured → null');
    },
  },
  {
    name: 'N-259 starterPackVariant — every PROJECT_TYPES value; LCI/Transformation get none; blank → Default',
    fn: function () {
      const expected = { 'Embedded': 'Default', 'CoE': 'CoE', 'Exec Search': 'ExecSearchMGAI', 'MG AI': 'ExecSearchMGAI',
        'Transformation': null, 'LCI': null, 'Internal': 'Default' };
      CONFIG.PROJECT_TYPES.forEach(t => _assertEqual(starterPackVariant(t), expected[t], t));
      _assertEqual(Object.keys(expected).sort(), CONFIG.PROJECT_TYPES.slice().sort(), 'table covers every type');
      _assertEqual(starterPackVariant(''), 'Default', 'blank → Default');
      _assertEqual(starterPackVariant(undefined), 'Default', 'undefined → Default');
      _assertEqual(starterPackVariant('Something New'), 'Default', 'unmapped → Default');
    },
  },
  {
    name: 'N-259 validateFolderName — OneDrive rules; defaultProjectFolderName falls back safely',
    fn: function () {
      const P = 'Newton/Projects';
      _assertEqual(validateFolderName('  Acme   Ltd  ', P), { ok: true, reason: '', clean: 'Acme Ltd' }, 'trims + collapses');
      _assertEqual(validateFolderName("O'Brien & Sons", P).ok, true, 'apostrophe + ampersand allowed');
      ['', '   ', null, undefined].forEach(v => _assertEqual(validateFolderName(v, P).ok, false, 'empty ' + JSON.stringify(v)));
      ['a"b', 'a*b', 'a:b', 'a<b', 'a>b', 'a?b', 'a/b', 'a\\b', 'a|b'].forEach(v => _assertEqual(validateFolderName(v, P).ok, false, 'bad char ' + v));
      _assertEqual(validateFolderName('a\u0007b', P).ok, false, 'control char');
      _assertEqual(validateFolderName('Acme.', P).ok, false, 'trailing full stop');
      _assertEqual(validateFolderName('~$Acme', P).ok, false, 'leading ~$');
      ['CON', 'prn', 'Aux', 'NUL', 'COM1', 'lpt9', '.lock', 'desktop.ini'].forEach(v => _assertEqual(validateFolderName(v, P).ok, false, 'reserved ' + v));
      _assertEqual(validateFolderName('Console', P).ok, true, 'CON prefix is fine');
      _assertEqual(validateFolderName('x_vti_y', P).ok, false, '_vti_');
      _assertEqual(validateFolderName('a'.repeat(255), '').ok, true, '255 chars ok with no parent');
      _assertEqual(validateFolderName('a'.repeat(256), '').ok, false, '256 chars too long');
      const longParent = 'p'.repeat(300);
      _assertEqual(validateFolderName('a'.repeat(99), longParent).ok, true, 'path 400 exactly ok');
      _assertEqual(validateFolderName('a'.repeat(100), longParent).ok, false, 'path 401 too long');
      _assertEqual(typeof validateFolderName('a|b', P).reason, 'string', 'reason is a message');
      _assertEqual(defaultProjectFolderName({ CustomerName: 'Acme Ltd' }), 'Acme Ltd', 'customer name');
      _assertEqual(defaultProjectFolderName({ CustomerName: 'Acme: UK / EU' }), 'Acme UK EU', 'bad chars stripped');
      _assertEqual(defaultProjectFolderName({ CustomerName: 'Acme Inc.' }), 'Acme Inc', 'trailing dot stripped');
      _assertEqual(defaultProjectFolderName({ CustomerName: 'CON' }), 'Project', 'reserved → Project');
      _assertEqual(defaultProjectFolderName(null), 'Project', 'no project → Project');
      _assertEqual(safeFilename('a:b'), 'a b', 'safeFilename unchanged for existing callers');
    },
  },
  {
    name: 'N-259 formatShortDay / projectPlaceholderValues — d MMM yyyy, BST-safe dates',
    fn: function () {
      _assertEqual(formatShortDay('2026-10-22'), '22 Oct 2026', 'basic');
      _assertEqual(formatShortDay('2026-09-01'), '1 Sep 2026', 'no leading zero, Sep not Sept');
      ['', null, '2026-13-01', '22/10/2026', '2026-10-22T00:00:00Z'].forEach(v => _assertEqual(formatShortDay(v), null, 'bad ' + v));
      const v = projectPlaceholderValues(
        { CustomerName: 'Acme & Co', ProjectType: 'CoE', StartDate: '2026-07-01T12:00:00Z', EndDate: '' },
        { dmName: 'Priya Shah', createdBy: 'Chris Friend', today: '2026-10-22' });
      _assertEqual(v, { CustomerName: 'Acme & Co', ProjectType: 'CoE', DeliveryManager: 'Priya Shah',
        StartDate: '1 Jul 2026', EndDate: '', CreatedBy: 'Chris Friend', CreatedDate: '22 Oct 2026' }, 'values (raw — escaping happens in fillDocxXml)');
      _assertEqual(projectPlaceholderValues({ Title: 'FromTitle' }).CustomerName, 'FromTitle', 'Title fallback');
    },
  },
  {
    name: 'N-259 fillDocxXml — split runs, unknown tokens kept, XML escaping, preserve, fast path',
    fn: function () {
      const V = { CustomerName: 'Acme & <Co>', RoleTitle: 'Engineer' };
      const P = inner => `<w:p><w:pPr><w:pStyle w:val="x"/></w:pPr>${inner}</w:p>`;
      const R = (t, attrs) => `<w:r><w:rPr><w:b/></w:rPr><w:t${attrs || ''}>${t}</w:t></w:r>`;
      const PRE = ' xml:space="preserve"';
      let r = fillDocxXml(P(R('Hello {{CustomerName}}!')), V);
      _assertEqual(r.xml, P(R('Hello Acme &amp; &lt;Co&gt;!', PRE)), 'single run, escaped');
      _assertEqual(r.replaced, 1, 'one replaced');
      r = fillDocxXml(P(R('Dear {{Cust') + R('omer') + R('Name}}, hi')), V);
      _assertEqual(r.xml, P(R('Dear Acme &amp; &lt;Co&gt;', PRE) + R('', PRE) + R(', hi', PRE)), 'token split across 3 runs');
      r = fillDocxXml(P(R('{') + R('{CustomerName}') + R('}')), { CustomerName: 'X' });
      _assertEqual(r.xml, P(R('X', PRE) + R('', PRE) + R('', PRE)), 'mid-brace split');
      r = fillDocxXml(P(R('{{ RoleTitle }} at {{CustomerName}}')), { RoleTitle: 'Dev', CustomerName: 'Acme' });
      _assertEqual(r.xml, P(R('Dev at Acme', PRE)), 'two tokens');
      _assertEqual(r.replaced, 2, 'two replaced');
      r = fillDocxXml(P(R('{{Mystery}} / {{RoleTitle}}')), V);
      _assertEqual(r.xml, P(R('{{Mystery}} / Engineer', PRE)), 'unknown kept');
      _assertEqual(r.unknown, ['Mystery'], 'unknown reported');
      const onlyUnknown = P(R('{{Mystery}}'));
      _assertEqual(fillDocxXml(onlyUnknown, V).xml, onlyUnknown, 'only-unknown paragraph byte-identical');
      r = fillDocxXml(P(R(' {{RoleTitle}} ', PRE)), V);
      _assertEqual(r.xml, P(R(' Engineer ', PRE)), 'existing preserve not doubled');
      r = fillDocxXml(P(R('{{Role') + '<w:r><w:t/></w:r><w:r><w:tab/></w:r>' + R('Title}}')), V);
      _assertEqual(r.replaced, 1, 'self-closing <w:t/> and <w:tab/> between halves');
      const across = P(R('{{Role')) + P(R('Title}}'));
      _assertEqual(fillDocxXml(across, V).xml, across, 'no cross-paragraph match');
      const plain = '<w:document><w:body>' + P(R('No tokens here')) + '</w:body></w:document>';
      _assertEqual(fillDocxXml(plain, V), { xml: plain, replaced: 0, unknown: [] }, 'fast path');
      const mixed = P(R('Keep me')) + P(R('{{RoleTitle}}'));
      _assertEqual(fillDocxXml(mixed, V).xml.startsWith(P(R('Keep me'))), true, 'untouched paragraph byte-identical');
      r = fillDocxXml('<w:hdr>' + P(R('{{CustomerName}}')) + '</w:hdr>', { CustomerName: 'H' });
      _assertEqual(r.replaced, 1, 'header part');
      _assertEqual(fillDocxXml(P(R('{{RoleTitle}}')), { RoleTitle: "$& $1 $'" }).xml, P(R("$&amp; $1 $'", PRE)), '$ patterns literal');
      _assertEqual(xmlEscapeText('a&b<c>"\''), 'a&amp;b&lt;c&gt;"\'', 'xmlEscapeText');
      ['word/document.xml', 'word/header1.xml', 'word/footer3.xml', 'word/footnotes.xml', 'word/endnotes.xml']
        .forEach(p => _assertEqual(CONFIG.STARTER_FOLDERS.DOCX_PARTS.some(re => re.test(p)), true, 'part ' + p));
      ['word/styles.xml', 'word/media/image1.png', 'docProps/core.xml']
        .forEach(p => _assertEqual(CONFIG.STARTER_FOLDERS.DOCX_PARTS.some(re => re.test(p)), false, 'not part ' + p));
    },
  },
  {
    name: 'N-259 shareRecipients / splitEmailList / starterShareStatus',
    fn: function () {
      _assertEqual(shareRecipients({
        leadDm: ' Priya@Momentumglobal.co ', adminEmails: ['chris@momentumglobal.co', 'priya@momentumglobal.co', 'ADMIN@momentumglobal.co', ''],
        creator: 'Chris@momentumglobal.co', exclude: ['admin@momentumglobal.co'],
      }), ['priya@momentumglobal.co'], 'de-dupe, case-fold, minus creator + shared mailbox');
      _assertEqual(shareRecipients({ leadDm: '', adminEmails: ['a@x.co', 'b@x.co'], creator: 'c@x.co', exclude: [] }), ['a@x.co', 'b@x.co'], 'no DM');
      _assertEqual(shareRecipients({ leadDm: 'a@x.co', adminEmails: [], creator: 'a@x.co', exclude: [] }), [], 'DM is the creator → nobody');
      _assertEqual(splitEmailList('a@x.co; B@x.co,a@x.co  c@x.co;;notanemail'), ['a@x.co', 'b@x.co', 'c@x.co'], 'split');
      _assertEqual(starterShareStatus(0, 0), 'none', 'none');
      _assertEqual(starterShareStatus(3, 3), 'ok', 'ok');
      _assertEqual(starterShareStatus(3, 1), 'partial', 'partial');
      _assertEqual(starterShareStatus(3, 0), 'failed', 'failed');
    },
  },
  {
    name: 'N-259 permissions + state — Lead DM or Admin (D24); one folder per project (D26); who sees Open (D27)',
    fn: function () {
      const p = { id: '7', DeliveryManager: 'Priya@x.co' };
      _assertEqual(canCreateProjectStarterFolder('admin', p, 'anyone@x.co'), true, 'admin');
      _assertEqual(canCreateProjectStarterFolder('delivery_manager', p, 'priya@x.co'), true, 'lead DM');
      _assertEqual(canCreateProjectStarterFolder('delivery_manager', p, 'other.dm@x.co'), false, 'non-lead DM');
      _assertEqual(canCreateProjectStarterFolder('talent_partner', p, 'tp@x.co'), false, 'TP');
      _assertEqual(canCreateProjectStarterFolder('leadership', p, 'lead@x.co'), false, 'leadership');
      _assertEqual(canCreateProjectStarterFolder('delivery_manager', { id: '8', DeliveryManager: '' }, ''), false, 'blank DM and blank email never match');
      const rows = [
        { id: '12', RecordType: 'project', RecordId: 7, OwnerEmail: 'b@x.co' },
        { id: '9',  RecordType: 'Project', RecordId: '7', OwnerEmail: 'Priya@x.co', SharedWith: 'chris@x.co;admin2@x.co' },
        { id: '3',  RecordType: 'role',    RecordId: 7, OwnerEmail: 'z@x.co' },
        { id: '4',  RecordType: 'project', RecordId: 8, OwnerEmail: 'z@x.co' },
      ];
      _assertEqual(recordStarterFolder(rows, 'project', 7).id, '9', 'lowest id of this project, type-insensitive');
      _assertEqual(recordStarterFolder(rows, 'project', 99), null, 'none');
      _assertEqual(recordStarterFolder(null, 'project', 7), null, 'null rows');
      const row = rows[1];
      _assertEqual(isStarterFolderOwner(row, 'priya@x.co'), true, 'owner');
      _assertEqual(canOpenStarterFolder(row, 'PRIYA@x.co'), true, 'owner opens');
      _assertEqual(canOpenStarterFolder(row, 'Chris@x.co'), true, 'shared opens');
      _assertEqual(isStarterFolderOwner(row, 'chris@x.co'), false, 'shared is not owner');
      _assertEqual(canOpenStarterFolder(row, 'tp@x.co'), false, 'others do not');
      _assertEqual(canOpenStarterFolder(row, ''), false, 'blank email');
      _assertEqual(canOpenStarterFolder(null, 'priya@x.co'), false, 'no row');
      // Created is an instant, read as the BROWSER's local day. CI also runs this under
      // NEWTON_TZ=UTC and America/New_York, so the expected day is derived from the
      // run's own offset (ahead of UTC → next day), never hard-coded to UK time.
      _assertEqual(starterCreatedDay({ Created: '2026-10-22T12:00:00Z' }), '22 Oct 2026', 'midday instant: same day in every CI timezone');
      const late = '2026-10-21T23:30:00Z';
      const aheadOfUtc = new Date(late).getTimezoneOffset() < -30;
      _assertEqual(starterCreatedDay({ Created: late }), aheadOfUtc ? '22 Oct 2026' : '21 Oct 2026',
        'late-evening UTC instant → local day (Europe/London BST: 22 Oct; UTC / New York: 21 Oct)');
      _assertEqual(starterCreatedDay({}), null, 'no Created');
    },
  },
  {
    name: 'N-259 starterFolderLink — owner link follows renames by DriveItemId; healed when it changed; missing folder flagged (AC 9)',
    fn: function () {
      const row = { WebUrl: 'https://t-my.sharepoint.com/personal/c/Documents/Newton/Projects/Acme' };
      const renamed = 'https://t-my.sharepoint.com/personal/c/Documents/Newton/Projects/Acme%20Renamed';
      _assertEqual(starterFolderLink(row, undefined), { url: row.WebUrl, heal: false, missing: false }, 'not looked up (shared viewer) → stored link');
      _assertEqual(starterFolderLink(row, { webUrl: row.WebUrl }), { url: row.WebUrl, heal: false, missing: false }, 'unchanged → no heal');
      _assertEqual(starterFolderLink(row, { webUrl: renamed }), { url: renamed, heal: true, missing: false }, 'renamed → live link + heal');
      _assertEqual(starterFolderLink(row, null), { url: row.WebUrl, heal: false, missing: true }, 'gone → stored link, missing');
      _assertEqual(starterFolderLink(row, { webUrl: 'javascript:alert(1)' }), { url: row.WebUrl, heal: false, missing: false }, 'non-https live value ignored');
      _assertEqual(starterFolderLink(row, {}), { url: row.WebUrl, heal: false, missing: false }, 'no webUrl → stored');
      _assertEqual(starterFolderLink({}, { webUrl: renamed }), { url: renamed, heal: true, missing: false }, 'blank stored → heal');
      if (typeof ALL_SOURCES === 'undefined') _skip('Source part needs filesystem access — runs under node tests/run.js.');
      const ui = ALL_SOURCES['starter-folders.js'];
      _assertEqual(/isStarterFolderOwner\(row, ctx\.email\)\)\s*\{\s*try\s*\{\s*link = starterFolderLink\(row, await getMyDriveItemById\(row\.DriveItemId\)\)/.test(ui), true, 'prepare looks the folder up by DriveItemId, owner only');
      _assertEqual(/if \(link\.heal\)/.test(ui) && /updateStarterFolderWebUrl\(row\.id, link\.url\)\.catch\(/.test(ui), true, 'heal is best-effort (never blocks render)');
      _assertEqual(/const url = String\(link\.url/.test(ui) && !/String\(row\.WebUrl/.test(ui), true, 'render uses the resolved link, not row.WebUrl directly');
    },
  },
  {
    name: 'N-259 source guards — action contract, no token to SharePoint hosts, JSZip lazy, wiring, no other entry points (D25)',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') {
        _skip('Source scan needs filesystem access — runs under node tests/run.js.');
      }
      const ck = ALL_SOURCES['checklists.js'];
      _assertEqual(/action\.render\(/.test(ck) && /\.prepare\(ctx\)/.test(ck) && /function checklistActionButtonHtml\(/.test(ck), true, 'checklists.js: prepare/render hooks + shared button');
      const ui = ALL_SOURCES['starter-folders.js'];
      _assertEqual(/CHECKLIST_ACTIONS\[STARTER_FOLDER_ACTION_KEY\]\s*=/.test(ui) && /'newton\.starterFolder'/.test(ui), true, 'action registered as newton.starterFolder');
      const api = ALL_SOURCES['api-starter-folders.js'];
      _assertEqual(/await fetch\(monitor\);/.test(api), true, 'monitor URL fetched with no options (no Authorization header)');
      _assertEqual(/_sfFetch\(url, \{ auth: false \}\)/.test(api), true, 'downloadUrl fetched with auth: false');
      // Positive control for the next check: it must see a URL being logged.
      const logsUrl = src => /console\.[a-z]+\([^;]*\b(monitor|url|downloadUrl)\b/.test(src.replace(/\/\/.*$/gm, ''));
      _assertEqual(logsUrl("console.warn('x', monitor);"), true, 'control: a logged URL is detected');
      _assertEqual(logsUrl(api), false, 'api-starter-folders.js logs no URL');
      _assertEqual(Object.keys(ALL_SOURCES).filter(f => /graph\.downloadUrl/.test(ALL_SOURCES[f])).sort(),
        ['api-starter-folders.js', 'api.js', 'utils.js'], 'downloadUrl only in api-starter-folders.js and the N-337 photo code');
      _assertEqual(/\bfetch\(/.test(ui), false, 'starter-folders.js makes no direct fetch');
      const logic = ALL_SOURCES['starter-folder-logic.js'];
      _assertEqual(/\bfetch\(|graphRequest\(|getItems\(/.test(logic), false, 'logic file: no network');
      _assertEqual(/\bdocument\.|\bwindow\./.test(logic), false, 'logic file: no DOM');
      _assertEqual(/CONFIG\.STARTER_FOLDERS\.JSZIP_SRC/.test(ui), true, 'loader reads the JSZip path from config');
      Object.keys(ALL_HTML).forEach(h => {
        const tags = (ALL_HTML[h].match(/<script\b[^>]*>/gi) || []).join(' ');
        _assertEqual(/jszip/i.test(tags), false, h + ': no jszip <script> tag (lazy-loaded only)');
      });
      const html = ALL_HTML['reporting.html'];
      const order = ['js/checklists.js', 'js/starter-folder-logic.js', 'js/api-starter-folders.js', 'js/starter-folders.js']
        .map(src => html.indexOf(`src="${src}"`));
      _assertEqual(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), true, 'reporting.html load order: ' + order);
      Object.keys(ALL_HTML).filter(h => h !== 'reporting.html').forEach(h =>
        _assertEqual(/starter-folder/.test((ALL_HTML[h].match(/<script\b[^>]*>/gi) || []).join(' ')), false, h + ' does not load starter folders'));
      ['forms.js', 'pages.js', 'project-page.js'].forEach(f =>
        _assertEqual(/starterFolder|StarterFolder/.test(ALL_SOURCES[f]), false, f + ' has no starter-folder entry point (D25)'));
    },
  },
);
