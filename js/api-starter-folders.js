// js/api-starter-folders.js — Graph calls for starter folders (N-259; N-260
// adds roles). Consumed by starter-folders.js. Loaded on reporting.html only,
// after starter-folder-logic.js.
//
// Two kinds of call:
//   - SharePoint list (StarterFolders) and JSON Graph reads/writes, through
//     graphRequest / getItems / createItem as everywhere else;
//   - drive calls that need a raw response (the copy's Location header,
//     binary file content) through _sfFetch — graphRequest batches GETs and
//     JSON-parses every body, which loses both.
//
// Token rule (N-282, D19): the copy-monitor URL and a file's
// @microsoft.graph.downloadUrl are pre-authenticated, time-limited links on
// *.sharepoint.com. They are fetched WITHOUT an Authorization header (a bearer
// token must never reach a non-Graph host), never logged and never cached.
//
// Scope: /me/drive needs delegated Files.ReadWrite (D18). Without admin
// consent it 403s — starter-folders.js turns that into a friendly message.

// ── Raw fetch ────────────────────────────────────────────────────────
// url: a Graph path ('/me/drive/...') when auth is true, else an absolute
// pre-authenticated URL. Returns the Response; a non-2xx throws _graphError
// (err.status set), like graphRequest.
async function _sfFetch(url, { method = 'GET', headers = {}, body = null, auth = true } = {}) {
  const opts = { method, headers: { ...headers } };
  let target = url;
  if (auth) {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    opts.headers.Authorization = `Bearer ${token}`;
    target = `${GRAPH}${url}`;
  }
  if (body !== null) opts.body = body;
  const res = await fetch(target, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw _graphError(res.status, err);
  }
  return res;
}

function _sfSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 'Newton/Projects/Acme' → 'Newton/Projects/Acme' with each segment encoded.
function _sfEncodePath(path) {
  return String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

// ── The user's own drive ─────────────────────────────────────────────
async function getMyDrive() {
  return graphRequest('GET', '/me/drive?$select=id,webUrl');
}

// The driveItem at a path in the user's OneDrive, or null when nothing is there.
async function getMyDriveItemByPath(path) {
  try {
    return await graphRequest('GET', `/me/drive/root:/${_sfEncodePath(path)}?$select=id,name,webUrl,folder,parentReference`);
  } catch (e) {
    if (e && e.status === 404) return null;
    throw e;
  }
}

// The driveItem with this id in the user's OWN OneDrive, or null when it is
// gone (deleted / in the recycle bin). The id survives renames and moves, so
// this is how the owner's Open folder link stays current (N-259 AC 9).
async function getMyDriveItemById(itemId) {
  try {
    return await graphRequest('GET', `/me/drive/items/${encodeURIComponent(itemId)}?$select=id,name,webUrl`);
  } catch (e) {
    if (e && e.status === 404) return null;
    throw e;
  }
}

// Makes sure every folder in `path` exists in the user's OneDrive, creating
// the missing ones; returns the last folder's driveItem. A 409 means someone
// (another tab) created it in between — re-read it.
async function ensureMyDriveFolderPath(path) {
  const segs = String(path).split('/').filter(Boolean);
  let parent = null;
  let sofar = '';
  for (const seg of segs) {
    sofar = sofar ? `${sofar}/${seg}` : seg;
    let item = await getMyDriveItemByPath(sofar);
    if (!item) {
      const base = parent ? `/me/drive/items/${encodeURIComponent(parent.id)}/children` : '/me/drive/root/children';
      try {
        item = await graphRequest('POST', base, { name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' });
      } catch (e) {
        if (!(e && e.status === 409)) throw e;
        item = await getMyDriveItemByPath(sofar);
        if (!item) throw e;
      }
    }
    parent = item;
  }
  return parent;
}

// ── Copy ─────────────────────────────────────────────────────────────

// Starts a server-side copy of a template folder into the user's drive.
// Returns the monitor URL from the 202's Location header, or null when the
// browser can't read it (CORS) — waitForDriveCopy then falls back to watching
// the destination path.
async function startDriveCopy(srcDriveId, srcItemId, destDriveId, destParentId, name) {
  const res = await _sfFetch(
    `/drives/${encodeURIComponent(srcDriveId)}/items/${encodeURIComponent(srcItemId)}/copy?@microsoft.graph.conflictBehavior=fail`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentReference: { driveId: destDriveId, id: destParentId }, name }),
    });
  return res.headers.get('Location') || null;
}

// Every file and folder under a folder, depth-first, paged. Each entry:
// { id, name, size, isFolder, path } (path relative to the start folder).
async function listDriveTree(driveId, itemId) {
  const out = [];
  const queue = [{ id: itemId, path: '' }];
  while (queue.length) {
    const { id, path } = queue.shift();
    let url = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(id)}/children?$select=id,name,size,file,folder&$top=200`;
    while (url) {
      const data = await graphRequest('GET', url);
      (data.value || []).forEach(it => {
        const p = path ? `${path}/${it.name}` : it.name;
        const isFolder = !!it.folder;
        out.push({ id: it.id, name: it.name, size: Number(it.size) || 0, isFolder, path: p });
        if (isFolder) queue.push({ id: it.id, path: p });
      });
      url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(GRAPH, '') : null;
    }
  }
  return out;
}

// Waits for a copy to finish. Resolves { root, timedOut }: root = the new
// folder's driveItem (from its path), or null if it never appeared.
//   - With a monitor URL: polls it (no auth header). 'completed' → done;
//     'failed' → throws. Any unreadable monitor response switches to:
//   - Path fallback: waits until destPath exists and holds at least
//     expectedCount entries (the template tree's size).
// On timeout it resolves with whatever exists at destPath and timedOut: true;
// the caller decides whether to carry on.
async function waitForDriveCopy({ monitorUrl, destPath, expectedCount, pollMs, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let monitor = monitorUrl || null;
  while (Date.now() < deadline) {
    if (monitor) {
      let status = null;
      try {
        const res = await fetch(monitor);   // pre-authenticated: NO Authorization header
        const json = res.ok ? await res.json() : null;
        status = json && json.status ? String(json.status) : null;
      } catch (e) {
        status = null;
      }
      if (status === 'failed') throw new Error('The copy failed in OneDrive.');
      if (status === 'completed') {
        return { root: await getMyDriveItemByPath(destPath), timedOut: false };
      }
      if (!status) monitor = null;   // unreadable — watch the path instead
    } else {
      const root = await getMyDriveItemByPath(destPath);
      if (root) {
        const drive = await getMyDrive();
        const tree = await listDriveTree(drive.id, root.id);
        if (tree.length >= expectedCount) return { root, timedOut: false };
      }
    }
    await _sfSleep(pollMs);
  }
  return { root: await getMyDriveItemByPath(destPath), timedOut: true };
}

// ── File content ─────────────────────────────────────────────────────

// A file's bytes, via its pre-authenticated downloadUrl (img/connect-src
// allow the SharePoint hosts; Graph's /content would 302 there anyway).
async function downloadDriveItem(driveId, itemId) {
  const meta = await graphRequest('GET', `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`);
  const url = meta && meta['@microsoft.graph.downloadUrl'];
  if (!url) throw new Error('No download link for this file.');
  const res = await _sfFetch(url, { auth: false });
  return res.arrayBuffer();
}

// Replaces a file's content (simple PUT — files up to 4 MB, MAX_DOCX_BYTES).
async function uploadDriveItemContent(driveId, itemId, blob) {
  const res = await _sfFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    body: blob,
  });
  return res.json();
}

// ── Sharing ──────────────────────────────────────────────────────────

// Shares one item with each email — one invite per person, sent one at a time
// and each retried once (inviteEachWithRetry), so a single bad address can't
// sink the rest, a transient failure doesn't leave someone out (N-260 QA), and
// the result is exact. Resolves the emails that succeeded. Edit access, sign-in
// required, no email (D7).
async function inviteToDriveItem(driveId, itemId, emails, cfg = CONFIG) {
  const sf = cfg.STARTER_FOLDERS;
  return inviteEachWithRetry(emails, email => graphRequest('POST', `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/invite`, {
    recipients:     [{ email }],
    roles:          [sf.SHARE_ROLE],
    requireSignIn:  true,
    sendInvitation: sf.SEND_INVITATION,
  }), {
    retries: sf.SHARE_RETRIES,
    pauseMs: sf.SHARE_RETRY_MS,
    onError: (email, e, attempt) => console.warn('N-260: starter folder share attempt failed', attempt, e && e.status),
  });
}

// ── StarterFolders list ──────────────────────────────────────────────
function _sfRecordType(recordType) {
  if (!CONFIG.CHECKLISTS.RECORD_TYPES.includes(recordType)) throw new Error(`Unknown record type: ${recordType}`);
  return recordType;
}
function _sfInt(val) {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid record id: ${val}`);
  return n;
}

// Rows for one record (RecordId is indexed). fresh = drop the 30s cache
// first — the pre-copy duplicate re-check (D26) must see other users' rows.
async function getStarterFoldersForRecord(recordType, recordId, { fresh = false } = {}) {
  const type = _sfRecordType(recordType);
  if (fresh) _cacheInvalidate('StarterFolders');
  return getItems('StarterFolders', _odataAnd(`fields/Title eq '${odataStr(type)}'`, `fields/RecordId eq ${_sfInt(recordId)}`));
}

// Heals a row's stored link after the owner renamed or moved the folder, so
// shared viewers (who can't read the owner's drive by id) get the current one.
async function updateStarterFolderWebUrl(rowId, webUrl) {
  return updateItem('StarterFolders', _sfInt(rowId), { WebUrl: String(webUrl || '') });
}

// fields use display names (RecordType, not Title) — mapped here.
async function createStarterFolderRow(f) {
  return createItem('StarterFolders', {
    Title:        _sfRecordType(f.RecordType),
    RecordId:     _sfInt(f.RecordId),
    OwnerEmail:   String(f.OwnerEmail || '').toLowerCase(),
    DriveId:      String(f.DriveId || ''),
    DriveItemId:  String(f.DriveItemId || ''),
    WebUrl:       String(f.WebUrl || ''),
    FolderName:   String(f.FolderName || ''),
    SharedWith:   (f.SharedWith || []).join(';'),
    ShareStatus:  String(f.ShareStatus || ''),
    PackVariant:  String(f.PackVariant || ''),
    FillWarnings: (f.FillWarnings || []).join(';'),
  });
}
