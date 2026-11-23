// js/onboarding-welcome-ui.js — the "Draft welcome email" step action (N-516, epic N-482)
//
// ONB-D91 / N-517 (ONB-D95, D96, D99): a preview modal showing the branded email in a sandboxed frame, with Copy email (primary: html +
// plain text on the clipboard, to paste into Outlook) and Open in Outlook (copies the same, then a mailto: new mail with the subject only,
// To left blank). ONB-D93: never writes to SharePoint and never ticks the step: the owner ticks it once the email is sent.
// The email is built by onbWelcomeEmail (onboarding-welcome.js) from row.welcome (onbTeamModel). The dialog uses ui-kit's modal engine
// (_openModal, the engine behind promptModal / selectModal: one dialog at a time, focus trap, Escape and backdrop close).
// Every word is CONFIG.ONBOARDING.WELCOME_TEXT. Declarations at load, DOM only inside the functions. my-momentum.html only, straight after
// onboarding-team-ui.js; never mobile.html, Newton for Claude or the Command Bar.

// Puts the email body on the clipboard: the branded html fragment + plain text where the browser allows it, plain text otherwise. The
// subject isn't included (N-517): Open in Outlook fills it, and the modal shows it above the preview. -> Promise<boolean>
async function _onbwCopy(mail) {
  const T = CONFIG.ONBOARDING.WELCOME_TEXT;
  const plain = mail.text;
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

// The modal body: warnings, the subject line and the preview frame. The frame is filled through its srcdoc property in setup (never
// innerHTML); sandbox="" gives it no scripts and no same-origin access. The Copy button is added to the action row in setup.
function _onbwBodyHtml(welcome, mail) {
  const T = CONFIG.ONBOARDING.WELCOME_TEXT;
  const w = welcome || {};
  const warns = [!w.buddy ? T.warnNoBuddy : '', !w.startDate ? T.warnNoStart : ''].filter(Boolean);
  return `${warns.map(t => `<p class="onb-note">${escHtml(t)}</p>`).join('')}
    <p class="onbw-subject"><strong>${escHtml(T.subjectLabel)}</strong> ${escHtml(mail.subject)}</p>
    <iframe class="onbw-preview" sandbox="" referrerpolicy="no-referrer" title="${escHtml(T.previewTitle)}"></iframe>`;
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
    body: () => _onbwBodyHtml(row.welcome, mail),
    setup: (overlay, { confirmBtn }) => {
      overlay.querySelector('.onbw-preview').srcdoc = emailBrandDocument(mail.html);
      // ONB-D95: Copy email is the primary button, right-most; Open in Outlook steps down to secondary.
      confirmBtn.className = 'btn-secondary confirm-modal-confirm';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn-primary onbw-copy';
      copy.textContent = T.btnCopy;
      overlay.querySelector('.confirm-modal-actions').appendChild(copy);
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
  // ONB-D99: Open in Outlook copies the branded email too, so the sender only pastes. A failed copy has already shown copyFailed;
  // the new mail still opens.
  if (await _onbwCopy(mail)) toast(T.openedCopied, { type: 'success' });
  window.location.href = onbWelcomeMailto(mail);   // a mailto: link opens the mail app; the page stays
}

// N-516 (ONB-D94): CONFIG.ONBOARDING.STEP_ACTIONS key -> handler(row, viewerName). Called by onbtStepAction (onboarding-team-ui.js).
const ONB_STEP_ACTION_RUN = {
  'onb.welcomeEmail': onbwOpen,
};
