// js/starter-folders.js — Starter folders (N-259 project; N-260 adds roles)
//
// One-time Project checklist action 'newton.starterFolder' (D25). The
// project's Lead DM or an Admin (D24) clicks it on the Project page's
// checklist; Newton copies the project's starter pack (variant group, D22)
// from the 'Newton Templates' library into that person's OneDrive at
// Newton/Projects/<name>, fills {{Placeholder}} tokens in every .docx, shares
// it (edit, no email) with the Lead DM + admins, and records it in the
// StarterFolders list. One folder per project (D26): once a row exists, the
// item shows "Created by … · date" and, to the owner and the people it was
// shared with, an Open folder link (D27).
//
// Dark until CONFIG.STARTER_FOLDERS.TEMPLATE_DRIVE_ID and TEMPLATES.project.Default
// are set AND a checklist item uses the key. Rules are pure functions in
// starter-folder-logic.js; Graph calls in api-starter-folders.js. JSZip is
// lazy-loaded on the first fill (CONFIG.STARTER_FOLDERS.JSZIP_SRC), never on
// page render. Desktop only — loaded on reporting.html after checklists.js.

const STARTER_FOLDER_ACTION_KEY = 'newton.starterFolder';
const _SF_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ── Lazy loader ──────────────────────────────────────────────────────
let _sfJSZipPromise = null;

function _sfLoadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (_sfJSZipPromise) return _sfJSZipPromise;
  _sfJSZipPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CONFIG.STARTER_FOLDERS.JSZIP_SRC;
    s.onload = () => window.JSZip
      ? resolve(window.JSZip)
      : reject(new Error('Zip library loaded but did not register.'));
    s.onerror = () => {
      _sfJSZipPromise = null;   // allow a retry next time
      reject(new Error('Could not load the zip library.'));
    };
    document.head.appendChild(s);
  });
  return _sfJSZipPromise;
}

// An error whose message is safe and useful to show the user as-is.
function _sfUserError(message) {
  return Object.assign(new Error(message), { userMessage: message });
}

// ── Checklist action ─────────────────────────────────────────────────
function _sfCanRun(ctx, data) {
  return ctx.recordType === 'project' &&
    starterFoldersEnabled('project') &&
    starterPackVariant(ctx.project ? ctx.project.ProjectType : '') !== null &&
    canCreateProjectStarterFolder(ctx.role, ctx.project, ctx.email) &&
    !!data && !data.row;
}

function _sfNote(text) {
  return `<span class="checklist-item-note">${escHtml(text)}</span>`;
}

function _sfActionHtml(ctx, data, { idx, busy }) {
  const isAdmin = ctx.role === 'admin';
  if (ctx.recordType !== 'project') return _sfNote('Starter folders are for Project checklists only.');
  if (!starterFoldersEnabled('project')) return isAdmin ? _sfNote('Starter folders aren’t configured yet (CONFIG.STARTER_FOLDERS).') : '';
  if (!data) return _sfNote('Couldn’t check for an existing starter folder — reload to try again.');
  const row = data.row;
  if (row) {
    const owner = data.ownerName || row.OwnerEmail || 'someone';
    const day = starterCreatedDay(row);
    let html = _sfNote(`Created by ${owner}${day ? ` · ${day}` : ''}`);
    const link = data.link || starterFolderLink(row, undefined);
    const url = String(link.url || '');
    if (canOpenStarterFolder(row, ctx.email) && /^https:\/\//i.test(url)) {
      html += `<a class="checklist-item-link" href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">Open folder <i data-lucide="external-link" aria-hidden="true"></i></a>`;
    }
    if (isStarterFolderOwner(row, ctx.email)) {
      if (link.missing) html += _sfNote('This folder is no longer in your OneDrive.');
      const status = String(row.ShareStatus || '');
      if (status === 'partial' || status === 'failed') html += _sfNote('Not shared with everyone — share it from OneDrive.');
      if (String(row.FillWarnings || '').trim()) html += _sfNote(`Not filled in: ${row.FillWarnings}`);
    }
    return html;
  }
  if (_sfCanRun(ctx, data)) return checklistActionButtonHtml(idx, CHECKLIST_ACTIONS[STARTER_FOLDER_ACTION_KEY].label, { disabled: !!busy });
  return checklistActionButtonHtml(idx, CHECKLIST_ACTIONS[STARTER_FOLDER_ACTION_KEY].label, {
    disabled: true, title: 'Only the project’s Lead DM or an Admin can create this',
  });
}

CHECKLIST_ACTIONS[STARTER_FOLDER_ACTION_KEY] = {
  label:       'Create starter folder',
  description: 'Creates the project working folder in the Lead DM’s OneDrive from the starter pack (one per project). Project checklists only.',
  prepare: async ctx => {
    if (ctx.recordType !== 'project' || !starterFoldersEnabled('project')) return null;
    const [rows, tpMap] = await Promise.all([
      getStarterFoldersForRecord('project', ctx.record.id),
      getTalentPartnerDisplayMap(),
    ]);
    const row = recordStarterFolder(rows, 'project', ctx.record.id);
    const ownerEmail = row ? String(row.OwnerEmail || '').toLowerCase() : '';
    // AC 9: the owner's link is re-read by DriveItemId (survives renames and
    // moves) and the row is healed for shared viewers, who can only use the
    // stored link — as fresh as the owner's last visit. Never blocks render.
    let link = row ? starterFolderLink(row, undefined) : null;
    if (row && isStarterFolderOwner(row, ctx.email)) {
      try {
        link = starterFolderLink(row, await getMyDriveItemById(row.DriveItemId));
      } catch (e) {
        console.warn('N-259: could not refresh the starter folder link', e && e.status);
      }
      if (link.heal) {
        updateStarterFolderWebUrl(row.id, link.url).catch(e =>
          console.warn('N-259: could not update the stored starter folder link', e && e.status));
      }
    }
    return { row, link, ownerName: ownerEmail ? (tpMap[ownerEmail] || ownerEmail) : '' };
  },
  available: (ctx, data) => _sfCanRun(ctx, data),
  render:    (ctx, data, opts) => _sfActionHtml(ctx, data, opts),
  run:       (ctx, data) => (_sfCanRun(ctx, data) ? openStarterFolderModal(ctx) : Promise.resolve(false)),
};

// ── The flow ─────────────────────────────────────────────────────────

// Fills every .docx in the new tree. Returns the paths that could not be
// filled (D6: a file that fails is a warning, never a failed folder).
async function _sfFillDocs(driveId, rootId, values, onStep) {
  const sf = CONFIG.STARTER_FOLDERS;
  const tree = await listDriveTree(driveId, rootId);
  const docs = tree.filter(f => !f.isFolder && /\.docx$/i.test(f.name));
  const failed = [];
  if (!docs.length) return failed;
  const JSZipLib = await _sfLoadJSZip();
  for (let i = 0; i < docs.length; i++) {
    const f = docs[i];
    onStep(`Filling in documents (${i + 1} of ${docs.length})…`);
    if (f.size > sf.MAX_DOCX_BYTES) { failed.push(`${f.path} (too large)`); continue; }
    try {
      const zip = await JSZipLib.loadAsync(await downloadDriveItem(driveId, f.id));
      let replaced = 0;
      const parts = Object.keys(zip.files).filter(p => sf.DOCX_PARTS.some(re => re.test(p)));
      for (const p of parts) {
        const r = fillDocxXml(await zip.file(p).async('string'), values);
        if (r.replaced) { zip.file(p, r.xml); replaced += r.replaced; }
      }
      if (!replaced) continue;   // nothing to fill — leave the copy untouched
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: _SF_DOCX_MIME });
      try {
        await uploadDriveItemContent(driveId, f.id, blob);
      } catch (e) {
        // A just-copied file can be briefly locked (423) — one retry.
        if (!(e && (e.status === 423 || e.status === 409))) throw e;
        await new Promise(r => setTimeout(r, sf.COPY_POLL_MS * 2));
        await uploadDriveItemContent(driveId, f.id, blob);
      }
    } catch (e) {
      console.warn('N-259: could not fill a starter document', e && (e.status || e.message));
      failed.push(f.path);
    }
  }
  return failed;
}

// Creates the folder. Throws an error with .userMessage for anything the user
// can act on; resolves { root, timedOut, fillFailed, shareStatus, shared,
// recipients, recorded }.
async function createStarterFolder({ project, name, recipients, values, onStep = () => {} }) {
  const sf = CONFIG.STARTER_FOLDERS;
  const email = getCurrentUser().email;
  const parentPath = sf.PARENT_PATH.project;

  onStep('Checking for an existing folder…');
  const existing = recordStarterFolder(await getStarterFoldersForRecord('project', project.id, { fresh: true }), 'project', project.id);
  if (existing) throw _sfUserError(`A starter folder was already created for this project by ${existing.OwnerEmail || 'someone else'}.`);

  const variant = starterPackVariant(project.ProjectType);
  const tpl = variant === null ? null : starterTemplateItemId('project', variant);
  if (!tpl) throw _sfUserError('Starter folders aren’t available for this project.');

  onStep('Checking your OneDrive…');
  let drive;
  try {
    drive = await getMyDrive();
  } catch (e) {
    if (e && (e.status === 401 || e.status === 403)) {
      throw _sfUserError('Starter folders aren’t enabled for your account yet — ask a Newton admin.');
    }
    throw e;
  }
  const parent = await ensureMyDriveFolderPath(parentPath);
  const destPath = `${parentPath}/${name}`;
  if (await getMyDriveItemByPath(destPath)) throw _sfUserError(`You already have a folder called “${name}”.`);

  onStep('Copying the starter pack…');
  let template, monitorUrl;
  try {
    template = await listDriveTree(sf.TEMPLATE_DRIVE_ID, tpl.itemId);
    monitorUrl = await startDriveCopy(sf.TEMPLATE_DRIVE_ID, tpl.itemId, drive.id, parent.id, name);
  } catch (e) {
    if (e && (e.status === 403 || e.status === 404)) {
      throw _sfUserError('Can’t read the starter pack template — check the Newton Templates library permissions.');
    }
    if (e && e.status === 409) throw _sfUserError(`You already have a folder called “${name}”.`);
    throw e;
  }
  const { root, timedOut } = await waitForDriveCopy({
    monitorUrl, destPath, expectedCount: template.length, pollMs: sf.COPY_POLL_MS, timeoutMs: sf.COPY_TIMEOUT_MS,
  });
  if (!root) throw _sfUserError('The copy didn’t finish in time. Check your OneDrive in a minute, then try again.');

  const fillFailed = await _sfFillDocs(drive.id, root.id, values, onStep);

  onStep('Sharing…');
  const shared = recipients.length ? await inviteToDriveItem(drive.id, root.id, recipients) : [];
  const shareStatus = starterShareStatus(recipients.length, shared.length);

  onStep('Saving…');
  let recorded = true;
  try {
    await createStarterFolderRow({
      RecordType: 'project', RecordId: project.id, OwnerEmail: email,
      DriveId: drive.id, DriveItemId: root.id, WebUrl: root.webUrl, FolderName: name,
      SharedWith: shared, ShareStatus: shareStatus, PackVariant: tpl.variantUsed, FillWarnings: fillFailed,
    });
  } catch (e) {
    console.error('N-259: folder created but the StarterFolders row failed', e);
    recorded = false;
  }
  return { root, timedOut, fillFailed, shareStatus, shared, recipients, recorded };
}

// ── Modal ────────────────────────────────────────────────────────────
let _sfModalOpen = false;

function _sfFactsHtml({ packLabel, recipientsLabel, parentPath }) {
  return `
    <dl class="starter-modal-facts">
      <dt>Starter pack</dt><dd>${escHtml(packLabel)}</dd>
      <dt>Saved to</dt><dd>${escHtml(['Your OneDrive', ...parentPath.split('/')].join(' › '))}</dd>
      <dt>Shared (edit) with</dt><dd>${escHtml(recipientsLabel)}</dd>
    </dl>`;
}

function _sfResultHtml(r) {
  const url = r.root && /^https:\/\//i.test(String(r.root.webUrl || '')) ? r.root.webUrl : '';
  const notes = [];
  if (!r.recorded) notes.push('Newton couldn’t record the folder, so this checklist item stays open. Open the folder from your OneDrive.');
  if (r.timedOut) notes.push('The copy was still finishing — some documents may not be filled in.');
  if (r.fillFailed.length) notes.push(`Not filled in: ${r.fillFailed.join(', ')}`);
  if (r.shareStatus === 'partial') notes.push(`Shared with ${r.shared.length} of ${r.recipients.length} people — share it with the rest from OneDrive.`);
  if (r.shareStatus === 'failed') notes.push('Couldn’t share the folder — share it from OneDrive.');
  return `
    <p class="starter-modal-done"><i data-lucide="check-circle" aria-hidden="true"></i> Your starter folder is ready.</p>
    ${url ? `<p><a class="checklist-item-link" href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">Open folder <i data-lucide="external-link" aria-hidden="true"></i></a></p>` : ''}
    ${notes.length ? `<ul class="starter-modal-warnings">${notes.map(n => `<li><i data-lucide="alert-triangle" aria-hidden="true"></i> ${escHtml(n)}</li>`).join('')}</ul>` : ''}`;
}

// Resolves true when the folder was created AND recorded (the item ticks),
// false on cancel or failure.
async function openStarterFolderModal(ctx) {
  if (_sfModalOpen) return false;
  const project = ctx.project;
  const sf = CONFIG.STARTER_FOLDERS;
  const parentPath = sf.PARENT_PATH.project;
  const [adminEmails, tpMap] = await Promise.all([getAdminEmails(), getTalentPartnerDisplayMap()]);
  const me = getCurrentUser();
  const recipients = shareRecipients({
    leadDm: project.DeliveryManager, adminEmails, creator: me.email, exclude: sf.SHARE_EXCLUDE,
  });
  const variant = starterPackVariant(project.ProjectType);
  const tpl = starterTemplateItemId('project', variant);
  const packLabel = checklistVariantLabel(tpl.variantUsed) +
    (tpl.variantUsed !== variant ? ` (no ${checklistVariantLabel(variant)} pack yet)` : '');
  const nameOf = e => tpMap[e] || e;
  const dmEmail = String(project.DeliveryManager || '').toLowerCase();
  const values = projectPlaceholderValues(project, {
    dmName: dmEmail ? nameOf(dmEmail) : '', createdBy: me.name || me.email || '', today: localDayISO(),
  });

  _sfModalOpen = true;
  return new Promise(resolve => {
    const previouslyFocused = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal starter-modal" role="dialog" aria-modal="true" aria-labelledby="sf-title">
        <h3 class="confirm-modal-title" id="sf-title">Create starter folder</h3>
        <div class="starter-modal-form">
          <label class="starter-modal-label" for="sf-name">Folder name</label>
          <input type="text" class="confirm-modal-input" id="sf-name" autocomplete="off" maxlength="${Number(sf.NAME_MAX)}">
          <p class="starter-modal-error" id="sf-error" role="alert" hidden></p>
          ${_sfFactsHtml({ packLabel, parentPath, recipientsLabel: recipients.length ? recipients.map(nameOf).join(', ') : 'No one else' })}
          <p class="form-hint">One folder per project — this can’t be repeated.</p>
        </div>
        <p class="starter-modal-status" id="sf-status" role="status" hidden></p>
        <div class="starter-modal-result" id="sf-result" hidden></div>
        <div class="confirm-modal-actions">
          <button type="button" class="btn-secondary" id="sf-cancel">Cancel</button>
          <button type="button" class="btn-primary" id="sf-create">Create folder</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = id => overlay.querySelector(`#${id}`);
    const input = $('sf-name'), errEl = $('sf-error'), statusEl = $('sf-status');
    const resultEl = $('sf-result'), formEl = overlay.querySelector('.starter-modal-form');
    const cancelBtn = $('sf-cancel'), createBtn = $('sf-create');
    let state = 'idle';   // idle | creating | done
    let outcome = false;
    input.value = defaultProjectFolderName(project);

    const showError = msg => {
      errEl.textContent = msg || '';
      errEl.hidden = !msg;
    };
    const validate = () => {
      const v = validateFolderName(input.value, parentPath);
      showError(v.ok || !input.value.trim() ? '' : v.reason);
      createBtn.disabled = !v.ok;
      return v;
    };
    const close = () => {
      if (state === 'creating') return;
      _sfModalOpen = false;
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(outcome);
    };
    const onKeydown = e => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && state === 'idle' && document.activeElement === input && !createBtn.disabled) submit();
    };
    const submit = async () => {
      const v = validate();
      if (!v.ok || state !== 'idle') return;
      state = 'creating';
      input.disabled = true; createBtn.disabled = true; cancelBtn.disabled = true;
      showError('');
      statusEl.hidden = false;
      try {
        const r = await createStarterFolder({
          project, name: v.clean, recipients, values,
          onStep: text => { statusEl.textContent = text; },
        });
        outcome = r.recorded;
        state = 'done';
        formEl.hidden = true;
        statusEl.hidden = true;
        resultEl.innerHTML = _sfResultHtml(r);
        resultEl.hidden = false;
        lucide.createIcons();
        createBtn.hidden = true;
        cancelBtn.textContent = 'Done';
        cancelBtn.disabled = false;
        cancelBtn.focus();
      } catch (e) {
        if (!e || !e.userMessage) console.error('N-259: starter folder creation failed', e);
        state = 'idle';
        statusEl.hidden = true;
        input.disabled = false; cancelBtn.disabled = false;
        showError((e && e.userMessage) || 'Something went wrong creating the folder — please try again.');
        createBtn.disabled = !validateFolderName(input.value, parentPath).ok;
        input.focus();
      }
    };

    input.addEventListener('input', validate);
    createBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKeydown);
    validate();
    input.focus();
    input.select();
  });
}
