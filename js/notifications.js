// js/notifications.js  — in-app notification engine (Newton v2)
// Owns: dedupe, write, clear, query, bell render. Calls api.js helpers only.

// --- recipient helpers ---------------------------------------------
async function getCcRecipients() {            // admin + leadership
  const lead = await getLeadershipAccess();
  const emails = lead.map(l => (l.UserEmail||'').toLowerCase());
  (CONFIG.ADMIN_USERS||[]).forEach(a => emails.push(a.toLowerCase()));
  return [...new Set(emails.filter(Boolean))];
}
const getLeadershipRecipients = getCcRecipients;  // same set for v1

// --- normalise a recipient (email passes through; a name is resolved) ---
let _uaCache = null;
async function resolveRecipientEmail(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (v.includes('@')) return v.toLowerCase();        // already an email
  // looks like a name — resolve via UserAssignments (UserName -> UserEmail)
  if (!_uaCache) _uaCache = await getItems('UserAssignments');
  const hit = _uaCache.find(u =>
    (u.UserName||'').trim().toLowerCase() === v.toLowerCase());
  return hit ? (hit.UserEmail||'').toLowerCase() : null; // null = unresolved, skip
}

// --- fire (dedupe + one row per recipient) -------------------------
async function fireNotification(opts) {
  const { triggerType, triggerKey, tone, deepLink, body, recipients } = opts;
  if (!recipients || !recipients.length) return;
  const existing = await getItems('Notifications',
    `fields/TriggerKey eq '${triggerKey}' and fields/Status eq 'active'`);
  const alreadyFor = new Set(existing.map(n => (n.RecipientEmail||'').toLowerCase()));
  for (const raw of recipients) {
    const email = await resolveRecipientEmail(raw);
    if (!email || alreadyFor.has(email)) continue;
    await createItem('Notifications', {
      Title: body.slice(0,80), RecipientEmail: email,
      TriggerType: triggerType, TriggerKey: triggerKey,
      Status: 'active', IsRead: false, Tone: tone,
      DeepLink: deepLink, Body: body,
      CreatedAt: new Date().toISOString(),
    });
  }
}

// --- clear (re-arm transition triggers) ----------------------------
async function clearNotification(triggerKey) {
  const active = await getItems('Notifications',
    `fields/TriggerKey eq '${triggerKey}' and fields/Status eq 'active'`);
  for (const n of active) await updateItem('Notifications', n.id, { Status:'cleared' });
}

// --- bell render (suppressed in ghost mode) ------------------------
async function renderNotificationBell() {
  if (getGhostRole()) return;
  const me = (getCurrentUser().email||'').toLowerCase();
  const rows = await getItems('Notifications',
    `fields/RecipientEmail eq '${me}' and fields/Status eq 'active'`);
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

// --- render the bell + drawer --------------------------------------
function paintBell(rows, unread) {
  const slot = document.getElementById('notif-slot');
  if (!slot) return;
  const recent = rows.slice(0, 20);               // active only, newest 20

  const items = recent.length ? recent.map(n => `
    <div class="notif-item${n.IsRead ? ' is-read' : ''}" data-id="${n.id}">
      <div class="notif-item-icon notif-tone--${n.Tone || 'attention'}">
        <i data-lucide="${NOTIF_ICON[n.Tone] || 'bell'}"></i>
      </div>
      <div class="notif-item-body" onclick="notifOpen('${n.id}', '${(n.DeepLink||'').replace(/'/g,"")}')">
        <div class="notif-item-text">${_escHtml ? _escHtml(n.Body||'') : (n.Body||'')}</div>
        <div class="notif-item-time">${notifTimeAgo(n.CreatedAt)}</div>
      </div>
      ${n.IsRead ? '' : `<button class="notif-item-tick" title="Mark read"
        onclick="event.stopPropagation(); notifTick('${n.id}')">
        <i data-lucide="check"></i></button>`}
    </div>`).join('') : `<div class="notif-empty">You're all caught up.</div>`;

  slot.innerHTML = `
    <button class="notif-bell" onclick="event.stopPropagation(); notifToggle()">
      <i data-lucide="bell"></i>
      ${unread ? `<span class="notif-badge">${unread}</span>` : ''}
    </button>
    <div class="notif-overlay" id="notif-overlay" onclick="notifToggle()"></div>
    <div class="notif-drawer" id="notif-drawer">
      <div class="notif-drawer-head">
        <span class="notif-drawer-title">Notifications</span>
        ${unread ? `<button class="notif-markall" onclick="notifMarkAll()">Mark all read</button>` : ''}
      </div>
      <div class="notif-list">${items}</div>
    </div>`;
  lucide.createIcons();
}

// --- drawer interactions -------------------------------------------
function notifToggle() {
  document.getElementById('notif-drawer')?.classList.toggle('open');
  document.getElementById('notif-overlay')?.classList.toggle('open');
}
function notifOpen(id, deepLink) {
  // deep-link only (marking is separate, via the tick / mark-all)
  if (deepLink) window.location.href = deepLink;
}
async function notifTick(id) {
  await markRead(id);
  renderNotificationBell();        // re-render to dim it + drop the badge count
}
async function notifMarkAll() {
  const me = (getCurrentUser().email||'').toLowerCase();
  const rows = await getItems('Notifications',
    `fields/RecipientEmail eq '${me}' and fields/Status eq 'active'`);
  for (const n of rows.filter(r => !r.IsRead)) await markRead(n.id);
  renderNotificationBell();
}
