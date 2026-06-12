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

// --- fire (dedupe + one row per recipient) -------------------------
async function fireNotification(opts) {
  const { triggerType, triggerKey, tone, deepLink, body, recipients } = opts;
  if (!recipients || !recipients.length) return;
  const existing = await getItems('Notifications',
    `fields/TriggerKey eq '${triggerKey}' and fields/Status eq 'active'`);
  const alreadyFor = new Set(existing.map(n => (n.RecipientEmail||'').toLowerCase()));
  for (const raw of recipients) {
    const email = (raw||'').toLowerCase();
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

// --- TEMP stub: replace with styled dropdown later -----------------
function paintBell(rows, unread) {
  const slot = document.getElementById('notif-slot');
  if (!slot) return;
  slot.innerHTML = `<div class="notif-bell">🔔 ${unread}</div>`;
  // TODO: dropdown, tone-coloured items, item onclick -> markRead(id) then
  //       location.href = DeepLink. Add event.stopPropagation() on the bell.
}
