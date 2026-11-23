// js/onboarding-welcome-ui.js — the "Draft welcome email" step action (N-516, epic N-482)
//
// ONB-D91: a preview modal with Copy email (html + plain text on the clipboard, to paste into Outlook) and Open in Outlook (a mailto: new
// mail, To left blank). ONB-D93: never writes to SharePoint and never ticks the step: the owner ticks it once the email is sent.
// The email is built by onbWelcomeEmail (onboarding-welcome.js) from row.welcome (onbTeamModel). The dialog uses ui-kit's modal engine
// (_openModal, the engine behind promptModal / selectModal: one dialog at a time, focus trap, Escape and backdrop close).
// Every word is CONFIG.ONBOARDING.WELCOME_TEXT. Declarations at load, DOM only inside the functions. my-momentum.html only, straight after
// onboarding-team-ui.js; never mobile.html, Newton for Claude or the Command Bar.

// Puts the email on the clipboard: html + plain text where the browser allows it, plain text otherwise. -> Promise<boolean>
async function _onbwCopy(mail) {
  const T = CONFIG.ONBOARDING.WELCOME_TEXT;
  const plain = mail.subject + '\n\n' + mail.text;
  try {
    if (typeof ClipboardItem === 'function' && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html':  new Blob([mail.html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      return true;
    }
  } catch (e) {
    console.warn('Welcome email: rich copy failed, trying plain text', e);
  }
  try {
    await navigator.clipboard.writeText(plain);
    return true;
  } catch (e) {
    console.error('Welcome email: copy failed', e);
    toast(T.copyFailed, { type: 'error' });
    return false;
  }
}

// The modal body: warnings, the read-only preview (filled through textContent in setup, never innerHTML) and the Copy button.
function _onbwBodyHtml(welcome) {
  const T = CONFIG.ONBOARDING.WELCOME_TEXT;
  const w = welcome || {};
  const warns = [!w.buddy ? T.warnNoBuddy : '', !w.startDate ? T.warnNoStart : ''].filter(Boolean);
  return `${warns.map(t => `<p class="onb-note">${escHtml(t)}</p>`).join('')}
    <div class="onbw-preview" tabindex="0"></div>
    <div class="onbw-copy-row"><button type="button" class="btn-secondary onbw-copy">${escHtml(T.btnCopy)}</button></div>`;
}

// Opens the draft for one joiner. row = an Active onbTeamRow with row.welcome; viewerName = the sign-off name ('' to leave it off).
async function onbwOpen(row, viewerName) {
  const T = CONFIG.ONBOARDING.WELCOME_TEXT;
  if (!row || !row.welcome) return;
  const mail = onbWelcomeEmail(row.welcome, { senderName: viewerName });
  const open = await _openModal({
    warn: 'onbwOpen: a dialog is already open',
    cancelValue: false,
    title: onbFillText(T.modalTitle, { name: row.name }),
    message: onbFillText(T.modalHint, { name: row.welcome.first }),
    confirmLabel: T.btnOpen,
    cancelLabel: T.btnClose,
    body: () => _onbwBodyHtml(row.welcome),
    setup: overlay => {
      overlay.querySelector('.onbw-preview').textContent = `${T.subjectLabel} ${mail.subject}\n\n${mail.text}`;
      const copy = overlay.querySelector('.onbw-copy');
      copy.addEventListener('click', async () => {
        copy.disabled = true;
        if (await _onbwCopy(mail)) toast(T.copied, { type: 'success' });
        copy.disabled = false;
      });
      return { copy };
    },
    first: c => c.copy,
    order: (c, cancelBtn, confirmBtn) => [c.copy, cancelBtn, confirmBtn],
  });
  if (open !== true) return;
  const link = onbWelcomeMailto(mail, CONFIG.ONBOARDING.WELCOME.MAILTO_MAX);
  if (!link.withBody && await _onbwCopy(mail)) toast(T.openedLong, { type: 'info' });
  window.location.href = link.url;   // a mailto: link opens the mail app; the page stays
}

// N-516 (ONB-D94): CONFIG.ONBOARDING.STEP_ACTIONS key -> handler(row, viewerName). Called by onbtStepAction (onboarding-team-ui.js).
const ONB_STEP_ACTION_RUN = {
  'onb.welcomeEmail': onbwOpen,
};
