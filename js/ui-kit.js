// js/ui-kit.js — shared DOM/UI helpers (N-346a): toast and modals, skeletons,
// KPI count-up, empty / error states, button loading state, scroll-preserving
// re-render, ghost-mode banner, view transitions, printPage (moved from
// api.js, N-347). No network I/O.
// Loads straight after utils.js on every shell that loads utils.js; calls
// utils.js helpers (escHtml, act, getGhostUser …) at runtime only, never at load.

// ── Button loading state ──────────────────────────────────────────────
function setButtonLoading(btn, loadingText) {
  if (!btn) return;
  btn.dataset.originalText = btn.textContent;
  btn.textContent = loadingText || 'Saving…';
  btn.disabled = true;
  btn.style.opacity = '0.7';
  btn.style.cursor  = 'not-allowed';
}

function clearButtonLoading(btn) {
  if (!btn) return;
  btn.textContent = btn.dataset.originalText || btn.textContent;
  btn.disabled = false;
  btn.style.opacity = '';
  btn.style.cursor  = '';
}

// ── Re-render without losing scroll position ──────────────────────────
// Snapshot / restore the scroll offsets of every container matching `selector`
// inside `root`. Containers are paired by document order, which re-rendered
// markup preserves. Restore is synchronous — a deferred one shows a visible
// jump-then-snap. Over-large offsets are clamped by the browser.
function _scrollOffsets(root, selector) {
  return [...root.querySelectorAll(selector)]
    .map(n => ({ left: n.scrollLeft, top: n.scrollTop }));
}
function _restoreScrollOffsets(root, selector, offsets) {
  [...root.querySelectorAll(selector)].forEach((n, i) => {
    const pos = offsets[i];
    if (!pos) return;
    n.scrollLeft = pos.left;
    n.scrollTop  = pos.top;
  });
}

// Replace an element's outerHTML while preserving the scroll offsets of any
// scroll containers inside it. Replacing outerHTML destroys and rebuilds those
// containers, which resets scrollLeft/scrollTop to 0 — the "snaps back to the
// top-left" effect.
//   elementId     — id of the element being replaced. The replacement markup
//                   MUST carry the same id, or the restore is skipped.
//   html          — the new markup.
//   scrollSelector — selector for the scroll containers inside it (required;
//                   this helper stays module-agnostic). Containers are paired
//                   by document order, which re-rendered sections preserve.
// Returns the new element, or null if the id wasn't in the DOM.
function replaceHtmlKeepingScroll(elementId, html, scrollSelector) {
  const old = document.getElementById(elementId);
  if (!old) return null;
  const offsets = _scrollOffsets(old, scrollSelector);
  old.outerHTML = html;                          // `old` is detached from here
  const next = document.getElementById(elementId);  // so re-look-up by id
  if (!next) return null;
  _restoreScrollOffsets(next, scrollSelector, offsets);
  return next;
}

// Shared ghost-mode banner. Create-or-update: safe to call once from
// index.html's initHome() and repeatedly from nav-core.js's
// renderModuleNav() (re-run on every page navigation) without ever
// creating a second #ghost-banner or re-prepending an existing one.
function renderGhostBanner() {
  const ghostEmail = getGhostUser();
  const appShell    = document.getElementById('app-shell');
  let ghostBanner   = document.getElementById('ghost-banner');
  if (ghostEmail) {
    if (!ghostBanner) {
      ghostBanner = document.createElement('div');
      ghostBanner.id = 'ghost-banner';
      document.body.prepend(ghostBanner);
    }
    ghostBanner.innerHTML = `
      👻 Ghost mode — viewing as <strong>${escHtml(getGhostLabel() || ghostEmail)}</strong>
      <button${act('exitGhostMode')}>Exit Ghost Mode</button>
    `;
    if (appShell) appShell.classList.add('ghost-active');
  } else {
    if (ghostBanner) ghostBanner.remove();
    if (appShell) appShell.classList.remove('ghost-active');
  }
}

// ── Dashboard skeleton placeholder ───────────────────────────────
// N-191: dashboardSkeleton() is a thin wrapper over the primitives below.
// There is no separate "detail" variant — a detail view is a panel of lines
// at a different line count, so skeletonPanel(n) covers it; don't add a
// skeletonDetail().
function skeletonStrip(cardCount = 5) {
  const card = `<div class="skel-card">
    <div class="skel skel-line-value"></div>
    <div class="skel skel-line-label"></div>
  </div>`;
  return `<div class="skel-strip">${card.repeat(cardCount)}</div>`;
}

function skeletonPanel(lineCount = 5) {
  const panelLines = Array.from({length: lineCount},
    () => `<div class="skel skel-line"></div>`).join('');
  return `<div class="skel-panel">${panelLines}</div>`;
}

function skeletonList(itemCount = 5) {
  const item = `<div class="skel-list-item">
    <div class="skel skel-list-icon"></div>
    <div class="skel skel-list-line"></div>
  </div>`;
  return `<div class="skel-list">${item.repeat(itemCount)}</div>`;
}

function dashboardSkeleton(cardCount = 5) {
  return `
    ${skeletonStrip(cardCount)}
    ${skeletonPanel(5)}`;
}

// ── Count-up animation on a .kpi-value element ───────────────────
function animateCountUp(el) {
  const raw = (el.textContent || '').trim();
  // only animate clean integers/decimals — skip "82%", "— ", "5 ▲3" etc.
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return;
  const target = parseFloat(raw);
  if (!isFinite(target)) return;
  const dur = 650, start = performance.now();
  const decimals = (raw.split('.')[1] || '').length;
  el.classList.add('counting');
  function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);          // ease-out cubic
    el.textContent = (target * eased).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = raw;                      // settle on exact original
  }
  requestAnimationFrame(tick);
}

function runKpiCountUps(scope = document) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  scope.querySelectorAll('.kpi-value').forEach(animateCountUp);
}

// ── Empty states (N-103 / X-2) ─────────────────────────────────
// Block-level empty state for a panel/page area with no surrounding table
// (the whole panel is this markup — nothing else to preserve). icon is a
// lucide icon name; the caller's page must load lucide and call
// lucide.createIcons() after setting innerHTML, same as every other
// data-lucide site in the app. actionLabel/actionAct are optional —
// omit both for a message-only state (read-only panels, no add-flow).
// actionAct is an act() argument list, [spec, ...args] (N-302a), e.g.
// ['showAddRoleForm'] or ['openChecklist', 'role', 5]; the named action must
// be registered (registerActions). An empty array / null renders no button.
function _emptyStateActAttr(actionAct, prevent) {
  if (!Array.isArray(actionAct) || !actionAct.length) return '';
  const spec = (prevent && !/\.prevent(\.|$)/.test(actionAct[0])) ? actionAct[0] + '.prevent' : actionAct[0];
  return act(spec, ...actionAct.slice(1));
}
function emptyStateBlock({ icon = 'inbox', title = '', message = '', actionLabel = '', actionAct = null, variant = 'default' } = {}) {
  const titleHtml  = title ? `<p class="empty-state-title">${escHtml(title)}</p>` : '';
  const actAttr    = actionLabel ? _emptyStateActAttr(actionAct, false) : '';
  const actionHtml = actAttr
    ? `<button class="btn-primary empty-state-action"${actAttr}>${escHtml(actionLabel)}</button>`
    : '';
  const iconClass = variant === 'error' ? 'empty-state-icon empty-state-icon--error' : 'empty-state-icon';
  return `<div class="empty-state">
    <i data-lucide="${escAttr(icon)}" class="${iconClass}"></i>
    ${titleHtml}
    <p class="empty-state-message">${escHtml(message)}</p>
    ${actionHtml}
  </div>`;
}
// Compact inline empty state for a single <tr> inside an existing table's
// <tbody> — same intent (icon + message + optional action), sized to sit
// inside the table grid instead of replacing it. colspan MUST match the
// table's real column count, including any conditional trailing action
// column — get this wrong and the row breaks the grid.
function emptyStateRow({ colspan, icon = 'inbox', message = '', actionLabel = '', actionAct = null } = {}) {
  const actAttr    = actionLabel ? _emptyStateActAttr(actionAct, true) : '';
  const actionHtml = actAttr
    ? `<a href="#"${actAttr}>${escHtml(actionLabel)}</a>`
    : '';
    return `<tr><td colspan="${colspan}" class="empty-state-row">
    <i data-lucide="${escAttr(icon)}" class="empty-state-row-icon"></i>
    <span>${escHtml(message)}</span>${actionHtml}
  </td></tr>`;
}

// ── Report-library rows (N-351) ─────────────────────────────────
// 4-column rows shared by the Report Builder and Market Report libraries
// (title, detail, owner, actions). Callers pass RAW values — escaping is done
// here — and the three act() attribute strings, built at the call site so the
// literal action names stay visible to lintActNames.
function reportLibraryRowHtml({ title, detail, ownerLabel, canDelete, acts }) {
  return `
        <tr>
          <td>${escHtml(title)}</td>
          <td>${escHtml(detail)}</td>
          <td>${escHtml(ownerLabel)}</td>
          <td>
            <div class="row-actions">
              <button class="btn-secondary"${acts.open}>Open</button>
              <button class="btn-secondary"${acts.copy}>Copy</button>
              ${canDelete ? `<button class="btn-secondary"${acts.del}>Delete</button>` : ''}
            </div>
          </td>
        </tr>`;
}

// ── Page-level failure state (N-171 / F-9b) ─────────────────────
// Shared renderer for a page-render catch block: replaces #main-content
// (or a modal's content pane) with a Retry button, distinct from an
// action failure mid-page (toast(), N-104). retryAct is an act() argument
// list, [spec, ...args] (N-302a), e.g. ['renderLCIModelsPage'] or
// ['openChecklist', 'role', 5] — the caller re-invokes its own render
// function, so it passes whatever arguments that function needs, and the
// function must be registered (registerActions) in the file that owns it.
function pageErrorBlock({ message = '', retryAct = null } = {}) {
  return emptyStateBlock({
    icon: 'alert-circle',
    variant: 'error',
    title: 'Something went wrong',
    message,
    actionLabel: retryAct ? 'Retry' : '',
    actionAct: retryAct,
  });
}

// ── Toast + confirm modal (N-104 / X-3a) ────────────────────────
// Reusable non-blocking toast + promise-returning confirm/prompt/select modals,
// replacing alert()/confirm()/prompt() call sites. Each lazily builds its own
// DOM on first use, so no page/app.js needs an init call.

const TOAST_ICONS = { info: 'info', success: 'check-circle', error: 'alert-circle' };

function _ensureToastContainer() {
  let el = document.getElementById('toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'false');
    document.body.appendChild(el);
  }
  return el;
}

// Removes a toast, clearing any pending auto-dismiss timer first so a
// stale timeout can never fire against an already-detached node.
function _removeToast(el) {
  if (el._toastTimer) { clearTimeout(el._toastTimer); el._toastTimer = null; }
  el.classList.add('toast--leaving');
  setTimeout(() => el.remove(), 200);
}

// Non-blocking toast. type: 'info' | 'success' | 'error'. duration is ms;
// 0 = persistent (manual close only — the close button is always shown
// regardless of duration). action, if given, is { label, onClick } and
// renders as a text button (e.g. "Undo") that fires onClick once and
// dismisses the toast immediately, without waiting for the timer.
function toast(message, { type = 'info', duration = 4000, action = null } = {}) {
  const container = _ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  const icon = TOAST_ICONS[type] || TOAST_ICONS.info;
  const actionHtml = action
    ? `<button type="button" class="toast-action">${escHtml(action.label)}</button>`
    : '';
  el.innerHTML = `
    <i data-lucide="${escAttr(icon)}" class="toast-icon"></i>
    <span class="toast-message">${escHtml(message)}</span>
    ${actionHtml}
    <button type="button" class="toast-close" aria-label="Dismiss">&times;</button>
  `;
  container.appendChild(el);
  if (window.lucide) lucide.createIcons();

  const startTimer = () => {
    if (duration > 0) el._toastTimer = setTimeout(() => _removeToast(el), duration);
  };
  const stopTimer = () => {
    if (el._toastTimer) { clearTimeout(el._toastTimer); el._toastTimer = null; }
  };

  el.addEventListener('mouseenter', stopTimer);
  el.addEventListener('mouseleave', startTimer);
  el.querySelector('.toast-close').addEventListener('click', () => _removeToast(el));
  if (action) {
    el.querySelector('.toast-action').addEventListener('click', () => {
      action.onClick();
      _removeToast(el);
    });
  }
  startTimer();
}

let _confirmModalOpen = false;

// Promise-returning replacement for confirm(). Resolves true on Confirm
// click, false on Cancel click, backdrop click, or Escape. danger:true
// styles the Confirm button for destructive actions. Only one instance may
// be open at a time — a second call while one is open resolves false
// immediately (native confirm() was always single-instance/blocking; no
// caller needs concurrent dialogs).
function confirmModal({ title = '', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  if (_confirmModalOpen) {
    console.warn('confirmModal: a confirm dialog is already open');
    return Promise.resolve(false);
  }
  _confirmModalOpen = true;

  return new Promise(resolve => {
    const previouslyFocused = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';
    const titleHtml = title ? `<h3 class="confirm-modal-title">${escHtml(title)}</h3>` : '';
    overlay.innerHTML = `
      <div class="confirm-modal" role="alertdialog" aria-modal="true">
        ${titleHtml}
        <p class="confirm-modal-message">${escHtml(message)}</p>
        <div class="confirm-modal-actions">
          <button type="button" class="btn-secondary confirm-modal-cancel">${escHtml(cancelLabel)}</button>
          <button type="button" class="btn-primary confirm-modal-confirm${danger ? ' confirm-modal-confirm--danger' : ''}">${escHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cancelBtn  = overlay.querySelector('.confirm-modal-cancel');
    const confirmBtn = overlay.querySelector('.confirm-modal-confirm');

    const close = result => {
      _confirmModalOpen = false;
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(result);
    };

    // Minimal focus trap: exactly two focusable elements, so Tab and
    // Shift+Tab both just swap focus between them.
    const onKeydown = e => {
      if (e.key === 'Escape') { close(false); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === confirmBtn ? cancelBtn : confirmBtn).focus();
      }
    };

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKeydown);

    cancelBtn.focus();
  });
}

// Promise-returning replacement for prompt(). Resolves with the input's
// current value on Confirm click or Enter-in-input, null on Cancel click,
// backdrop click, or Escape — matches native prompt()'s cancel return
// value, so every call site's existing `=== null` check keeps working
// unchanged. Shares _confirmModalOpen with confirmModal (see above) rather
// than a separate flag — one "a dialog from this family is already open"
// guard for both.
function promptModal({ title = '', message = '', defaultValue = '', placeholder = '', confirmLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  if (_confirmModalOpen) {
    console.warn('promptModal: a confirm/prompt dialog is already open');
    return Promise.resolve(null);
  }
  _confirmModalOpen = true;

  return new Promise(resolve => {
    const previouslyFocused = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';
    const titleHtml = title ? `<h3 class="confirm-modal-title">${escHtml(title)}</h3>` : '';
    const messageHtml = message ? `<p class="confirm-modal-message">${escHtml(message)}</p>` : '';
    overlay.innerHTML = `
      <div class="confirm-modal" role="alertdialog" aria-modal="true">
        ${titleHtml}
        ${messageHtml}
        <input type="text" class="confirm-modal-input" placeholder="${escAttr(placeholder)}">
        <div class="confirm-modal-actions">
          <button type="button" class="btn-secondary confirm-modal-cancel">${escHtml(cancelLabel)}</button>
          <button type="button" class="btn-primary confirm-modal-confirm">${escHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // defaultValue is set via the .value property, not interpolated into
    // the template string above — avoids a second escaping path for a
    // value that was never going through HTML parsing in the first place.
    const input = overlay.querySelector('.confirm-modal-input');
    input.value = defaultValue;

    const cancelBtn  = overlay.querySelector('.confirm-modal-cancel');
    const confirmBtn = overlay.querySelector('.confirm-modal-confirm');

    const close = result => {
      _confirmModalOpen = false;
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(result);
    };

    // Focus trap over 3 elements: input → Cancel → Confirm → input (and
    // reverse on Shift+Tab) — confirmModal's simpler 2-element swap doesn't
    // generalise to 3, so this walks an explicit order array instead.
    const onKeydown = e => {
      if (e.key === 'Escape') { close(null); return; }
      if (e.key === 'Enter' && document.activeElement === input) { close(input.value); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        const order = [input, cancelBtn, confirmBtn];
        const i = order.indexOf(document.activeElement);
        const next = order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length];
        next.focus();
      }
    };

    cancelBtn.addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => close(input.value));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKeydown);

    input.focus();
    if (defaultValue) input.select();
  });
}

// N-308: Promise-returning single-choice picker — promptModal's shape with a
// <select> instead of a text input. options = [{ value, label }]. Resolves the
// selected value on Confirm, null on Cancel click, backdrop click or Escape.
// Shares _confirmModalOpen with confirmModal / promptModal (one dialog from
// this family at a time). Option values/labels are set through DOM
// properties, never interpolated into markup.
function selectModal({ title = '', message = '', options = [], defaultValue = '', confirmLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  if (_confirmModalOpen) {
    console.warn('selectModal: a confirm/prompt dialog is already open');
    return Promise.resolve(null);
  }
  _confirmModalOpen = true;

  return new Promise(resolve => {
    const previouslyFocused = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';
    const titleHtml = title ? `<h3 class="confirm-modal-title">${escHtml(title)}</h3>` : '';
    const messageHtml = message ? `<p class="confirm-modal-message">${escHtml(message)}</p>` : '';
    overlay.innerHTML = `
      <div class="confirm-modal" role="alertdialog" aria-modal="true">
        ${titleHtml}
        ${messageHtml}
        <select class="confirm-modal-input"></select>
        <div class="confirm-modal-actions">
          <button type="button" class="btn-secondary confirm-modal-cancel">${escHtml(cancelLabel)}</button>
          <button type="button" class="btn-primary confirm-modal-confirm">${escHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const select = overlay.querySelector('.confirm-modal-input');
    (options || []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = String(o.value);
      opt.textContent = String(o.label ?? o.value);
      select.appendChild(opt);
    });
    if (defaultValue !== '' && defaultValue !== null && defaultValue !== undefined) select.value = String(defaultValue);

    const cancelBtn  = overlay.querySelector('.confirm-modal-cancel');
    const confirmBtn = overlay.querySelector('.confirm-modal-confirm');

    const close = result => {
      _confirmModalOpen = false;
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(result);
    };

    // Same 3-element focus order as promptModal: select → Cancel → Confirm.
    const onKeydown = e => {
      if (e.key === 'Escape') { close(null); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        const order = [select, cancelBtn, confirmBtn];
        const i = order.indexOf(document.activeElement);
        const next = order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length];
        next.focus();
      }
    };

    cancelBtn.addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => close(select.value));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKeydown);

    select.focus();
  });
}

// N-193/X-6: wraps a page render in a View Transition cross-fade. Falls
// back to a plain synchronous render when the API is unsupported or the
// user has reduced-motion on — never a broken render either way.
function withViewTransition(renderFn) {
  if (!document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return renderFn();
  }
  return document.startViewTransition(renderFn);
}

// ── Print ─────────────────────────────────────────────────────────────
function printPage(title, landscape = false, module = 'Newton') {
  document.getElementById('print-header-title').textContent = 'Newton';
  document.getElementById('print-header-sub').textContent = module;
  // Set the document title so it becomes the default PDF filename, then restore.
  const prevDocTitle = document.title;
  if (title) document.title = title;
  // N-324: landscape goes in through the CSSOM, not an injected <style>
  // (style-src-elem has no 'unsafe-inline'). Appended to the last stylesheet
  // so it follows style.css's canonical @page, as the old <head> <style> did.
  let pageRule = null;
  if (landscape) {
    const sheet = document.styleSheets[document.styleSheets.length - 1];
    try {
      if (sheet) pageRule = sheet.cssRules[sheet.insertRule('@page { size: A4 landscape; }', sheet.cssRules.length)];
    } catch (e) {
      console.warn('printPage: could not add the landscape @page rule', e);
    }
  }
  window.print();
  if (pageRule) {
    setTimeout(() => {
      const sheet = pageRule.parentStyleSheet;
      const i = sheet ? Array.prototype.indexOf.call(sheet.cssRules, pageRule) : -1;
      if (i >= 0) sheet.deleteRule(i);
    }, 1000);
  }
  setTimeout(() => { document.title = prevDocTitle; }, 1000);
}

// ── People photos (N-337) ─────────────────────────────────────────────
// Photo <img> elements are rendered with NO src and data-photo="<filename>"
// (filename from photoFileName(), utils.js). Their old src was a plain
// SharePoint URL, which only loads when the browser sends a SharePoint session
// cookie — missing cross-site for some users (401). hydratePhotoImgs() sets each
// src from a Graph download URL instead. `getMap(force)` is passed in by the
// caller (getPhotoUrlMap, api.js), so this file still does no network I/O.
// An image with no match, or one that still fails after a single forced refresh
// of the map, is hidden (display:none) so the initials badge / "—" shows.
// Never rejects. Resolves once every image has settled, capped at
// CONFIG.PHOTO_SETTLE_MS so a hung image can't hold up its caller (the Org
// Chart PDF export waits on this).
function hydratePhotoImgs(root, getMap) {
  const scope = root || document;
  const imgs = Array.from(scope.querySelectorAll('img[data-photo]'))
    .filter(img => !img.dataset.photoState);
  if (!imgs.length) return Promise.resolve();
  imgs.forEach(img => { img.dataset.photoState = 'pending'; });
  const fail = img => { img.dataset.photoState = 'failed'; img.style.display = 'none'; };
  const work = (async () => {
    let map;
    try { map = await getMap(false); } catch (e) { map = new Map(); }
    await Promise.all(imgs.map(img => new Promise(resolve => {
      const key = String(img.dataset.photo || '').toLowerCase();
      const url = map && map.get(key);
      if (!url) { fail(img); resolve(); return; }
      img.addEventListener('load', () => { img.dataset.photoState = 'loaded'; resolve(); }, { once: true });
      img.addEventListener('error', async () => {
        let fresh = null;
        try { fresh = (await getMap(true)).get(key); } catch (e) { /* hidden below */ }
        if (!fresh) { fail(img); resolve(); return; }
        img.addEventListener('error', () => { fail(img); resolve(); }, { once: true });
        img.style.display = '';
        img.src = fresh;
      }, { once: true });
      img.src = url;
    })));
  })().catch(e => { console.warn('N-337: photo hydrate failed', e); });
  const cap = new Promise(resolve => setTimeout(resolve, CONFIG.PHOTO_SETTLE_MS));
  return Promise.race([work, cap]);
}

// N-302a: delegated actions this file owns that shared markup calls (js/actions.js).
// Later N-302 sub-tasks add their own names to this call; never register a name twice.
registerActions({
  printPage,
});