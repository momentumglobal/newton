// js/notifications.js
// Fire a notification: dedupe by triggerKey, write one row per recipient.
// opts = { triggerType, triggerKey, tone, deepLink, body, recipients[] }
async function fireNotification(opts) {
  const { triggerType, triggerKey, tone, deepLink, body, recipients } = opts;
  if (!recipients || !recipients.length) return;
 
  // Dedupe: is there already an ACTIVE row for this key?
  const existing = await getItems('Notifications',
    `fields/TriggerKey eq '${triggerKey}' and fields/Status eq 'active'`);
  const alreadyFor = new Set(existing.map(n => (n.RecipientEmail||'').toLowerCase()));
 
  for (const raw of recipients) {
    const email = (raw||'').toLowerCase();
    if (!email || alreadyFor.has(email)) continue;   // skip dupes
    await createItem('Notifications', {
      Title: body.slice(0, 80),
      RecipientEmail: email,
      TriggerType: triggerType,
      TriggerKey: triggerKey,
      Status: 'active',
      IsRead: false,
      Tone: tone,
      DeepLink: deepLink,
      Body: body,
      CreatedAt: new Date().toISOString(),
    });
  }
}

async function clearNotification(triggerKey) {
  const active = await getItems('Notifications',
    `fields/TriggerKey eq '${triggerKey}' and fields/Status eq 'active'`);
  for (const n of active) {
    await updateItem('Notifications', n.id, { Status: 'cleared' });
  }
}

async function renderNotificationBell() {
  if (getGhostRole()) return;            // §4.4 — suppressed in ghost mode
  const me = (getCurrentUser().email||'').toLowerCase();
  const rows = await getItems('Notifications',
    `fields/RecipientEmail eq '${me}' and fields/Status eq 'active'`);
  rows.sort((a,b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  const unread = rows.filter(r => !r.IsRead).length;
  // inject bell markup into #notif-slot (placed by nav-core §5)
  // badge shows `unread`; dropdown lists rows with tone-coloured icons;
  // each item onclick -> markRead(id) then location = DeepLink
  function paintBell(rows, unread) {
    const slot = document.getElementById('notif-slot');
    if (!slot) return;
    slot.innerHTML = `<div class="notif-bell">🔔 ${unread}</div>`;
    // TODO: real dropdown + tone-coloured items + onclick -> markRead then DeepLink
}
 
async function markRead(id) {
  await updateItem('Notifications', id, { IsRead: true });
}
