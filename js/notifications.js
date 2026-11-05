// js/notifications.js  — in-app notification engine (Newton v2)
// Owns: dedupe, write, clear, query, bell render. Calls api.js helpers only.

// --- recipient helpers ---------------------------------------------
async function getCcRecipients() {            // admin + leadership
  const lead = await getLeadershipAccess();
  const emails = lead.map(l => (l.UserEmail||'').toLowerCase());
  (await getAdminEmails()).forEach(a => emails.push(a));  // N-281: active admin rows
  return [...new Set(emails.filter(Boolean))];
}
const getLeadershipRecipients = getCcRecipients;  // same set for v1

// --- fire (dedupe + one row per recipient) -------------------------
async function fireNotification(opts) {
  const { triggerType, triggerKey, tone, deepLink, body, recipients,
          extraFields = {} } = opts;          // NEW: optional extra columns
  if (!recipients || !recipients.length) return;
  const existing = await getItems('Notifications',
    `fields/TriggerKey eq '${odataStr(triggerKey)}' and fields/Status eq 'active'`);
  const alreadyFor = new Set(existing.map(n => (n.RecipientEmail||'').toLowerCase()));
  for (const raw of recipients) {
    const email = (raw||'').toLowerCase();
    if (!email || !email.includes('@') || alreadyFor.has(email)) continue;
    await createItem('Notifications', {
      Title: body.slice(0,80), RecipientEmail: email,
      TriggerType: triggerType, TriggerKey: triggerKey,
      Status: 'active', IsRead: false, Tone: tone,
      DeepLink: deepLink, Body: body,
      CreatedAt: new Date().toISOString(),
      ...extraFields,                          // NEW: RoleTitle, TeamCredit, etc.
    });
  }
}

// --- clear (re-arm transition triggers) ----------------------------
async function clearNotification(triggerKey) {
  const active = await getItems('Notifications',
    `fields/TriggerKey eq '${odataStr(triggerKey)}' and fields/Status eq 'active'`);
  for (const n of active) await updateItem('Notifications', n.id, { Status:'cleared' });
}

// --- bell render (suppressed in ghost mode) ------------------------
async function renderNotificationBell() {
  if (getGhostUser()) return;
  const me = (getCurrentUser().email||'').toLowerCase();
  const rows = await getItems('Notifications',
    `fields/RecipientEmail eq '${odataStr(me)}' and fields/Status eq 'active'`);
  rows.sort((a,b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  const unread = rows.filter(r => !r.IsRead).length;   // boolean test in JS
  paintBell(rows, unread);
}

async function markRead(id) {
  await updateItem('Notifications', id, { IsRead: true });
}

// --- relative time helper ------------------------------------------
function notifTimeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  if (s < 604800)return `${Math.floor(s/86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const NOTIF_ICON = { attention: 'alert-triangle', celebrate: 'party-popper', milestone: 'flag' };

// --- render the bell + drawer
function paintBell(rows, unread) {
  const slot = document.getElementById('notif-slot');
  if (!slot) return;
  const recent = rows.slice(0, 20);               // active only, newest 20

  const items = recent.length ? recent.map(n => `
    <div class="notif-item${n.IsRead ? ' is-read' : ''}" data-id="${n.id}"
      ${act('notifOpen', String(n.id), String(n.DeepLink || ''))}>
      <div class="notif-item-icon notif-tone--${n.Tone /* esc-lint-ok: Tone is set by code (notifications triggers), never user input */ || 'attention'}">
        <i data-lucide="${NOTIF_ICON[n.Tone] || 'bell'}"></i>
      </div>
      <div class="notif-item-body">
        <button type="button" class="notif-item-open">
          <span class="notif-item-text">${escHtml(n.Body)}</span>
          <span class="notif-item-time">${notifTimeAgo(n.CreatedAt)}</span>
        </button>
      </div>
      ${n.IsRead ? '' : `<button class="notif-item-tick" title="Mark read"${act('notifTick.stop', String(n.id))}>
        <i data-lucide="check"></i></button>`}
    </div>`).join('') : `<div class="notif-empty">You're all caught up.</div>`;

  slot.innerHTML = `
    <button type="button" class="notif-bell" aria-label="${escHtml(notifBellLabel(unread))}"
      aria-haspopup="dialog" aria-controls="notif-drawer" aria-expanded="false"${act('notifToggle.stop')}>
      <i data-lucide="bell"></i>
      ${unread ? `<span class="notif-badge" aria-hidden="true">${unread}</span>` : ''}
    </button>
    <div class="notif-overlay" id="notif-overlay" aria-hidden="true"${act('notifToggle')}></div>
    <div class="notif-drawer" id="notif-drawer" role="dialog" aria-modal="true"
      aria-labelledby="notif-drawer-title">
      <div class="notif-drawer-head">
        <span class="notif-drawer-title" id="notif-drawer-title">Notifications</span>
        <div class="notif-head-actions">
          ${unread ? `<button class="notif-markall"${act('notifMarkAll')}>Mark all read</button>` : ''}
          <button class="notif-close"${act('notifToggle')} title="Close" aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
      <div class="notif-list">${items}</div>
    </div>`;
  lucide.createIcons();
}

// --- drawer interactions -------------------------------------------
// N-425: one place opens and closes the drawer, so aria-expanded, the document
// keydown listener and focus cannot drift from the .open class. Same shape as
// confirmModal (js/ui-kit.js) and the command bar (js/command-bar.js): listener
// added on open and removed on close, focus into the first control on open, and
// back to the opener on close. paintBell() rebuilds #notif-slot on every render,
// so the bell is looked up at use time, never stored.
function _notifIsOpen() {
  return !!document.getElementById('notif-drawer')?.classList.contains('open');
}
function _notifBell() { return document.querySelector('#notif-slot .notif-bell'); }

// focus:false keeps focus where it is -- used when a re-render re-opens the drawer.
function _notifSetOpen(open, { focus = true } = {}) {
  const drawer = document.getElementById('notif-drawer');
  if (!drawer) return;
  drawer.classList.toggle('open', open);
  document.getElementById('notif-overlay')?.classList.toggle('open', open);
  _notifBell()?.setAttribute('aria-expanded', String(open));
  document.removeEventListener('keydown', _notifOnKeydown);   // never double-bind
  if (open) document.addEventListener('keydown', _notifOnKeydown);
  if (!focus) return;
  if (open) drawer.querySelector('.notif-close')?.focus();    // visible by now: .open is set first
  else _notifBell()?.focus();
}

// Row's open button if it is still there, else Close.
function _notifFocusRow(id) {
  (document.querySelector(`.notif-item[data-id="${id}"] .notif-item-open`)
    || document.querySelector('.notif-close'))?.focus();
}

function _notifOnKeydown(e) {
  // The slot was re-rendered closed while a listener was bound: unbind, do nothing.
  if (!_notifIsOpen()) { document.removeEventListener('keydown', _notifOnKeydown); return; }
  // A confirm dialog or the command bar opened over the drawer owns Esc and Tab.
  if (typeof _confirmModalOpen !== 'undefined' && _confirmModalOpen) return;
  if (typeof _cmdBarState !== 'undefined' && _cmdBarState) return;
  if (e.key === 'Escape') { _notifSetOpen(false); return; }
  if (e.key !== 'Tab') return;
  // Every stop is a <button>; computed per keypress because ticking removes some.
  const stops = [...document.getElementById('notif-drawer').querySelectorAll('button')];
  if (!stops.length) return;
  const i = stops.indexOf(document.activeElement);
  const last = stops.length - 1;
  if (i === -1 || (e.shiftKey && i === 0) || (!e.shiftKey && i === last)) {
    e.preventDefault();
    stops[e.shiftKey && i !== -1 ? last : 0].focus();
  }
}

function notifToggle() { _notifSetOpen(!_notifIsOpen()); }
async function notifOpen(id, deepLink) {
  if (deepLink) {
    await markRead(id);
    window.location.href = deepLink;
    return;
  }
  await notifTick(id);   // no link: just mark read + re-render in place
}
async function notifTick(id) {
  const wasOpen = _notifIsOpen();
  const restoreDrawer = () => {
    if (!wasOpen) return;
    _notifSetOpen(true, { focus: false });
    _notifFocusRow(id);   // N-425: the tick button is gone (or the slot was rebuilt); keep focus in the drawer
  };
  await optimisticWrite({
    apply: () => {
      const item = document.querySelector(`.notif-item[data-id="${id}"]`);
      item?.classList.add('is-read');
      item?.querySelector('.notif-item-tick')?.remove();
      const badge = document.querySelector('.notif-bell .notif-badge');
      if (badge) {
        const n = parseInt(badge.textContent, 10) - 1;
        if (n > 0) { badge.textContent = String(n); }
        else { badge.remove(); document.querySelector('.notif-markall')?.remove(); }
        document.querySelector('.notif-bell')?.setAttribute('aria-label', notifBellLabel(Math.max(n, 0)));   // N-425
      }
      restoreDrawer();
    },
    revert: async () => {
      // The write never landed server-side, so a fresh render (cache still
      // holds the pre-write IsRead value) is the correct rollback -- avoids
      // re-implementing paintBell's row/badge markup a second time here.
      await renderNotificationBell();
      restoreDrawer();
    },
    commit: () => markRead(id),
    errorMessage: "Couldn't mark that as read — change reverted."
  });
}
async function notifMarkAll() {
  const wasOpen = _notifIsOpen();
  const me = (getCurrentUser().email||'').toLowerCase();
  const rows = await getItems('Notifications',
    `fields/RecipientEmail eq '${odataStr(me)}' and fields/Status eq 'active'`);
  for (const n of rows.filter(r => !r.IsRead)) await markRead(n.id);
  await renderNotificationBell();
  if (wasOpen) _notifSetOpen(true);   // N-425: re-open; focus goes to Close (Mark all read is gone)
}

// N-302a: delegated actions owned by this file (js/actions.js).
registerActions({
  notifOpen,
  notifTick,
  notifToggle,
  notifMarkAll,
});
