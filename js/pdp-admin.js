// js/pdp-admin.js — Config Panel "PDP" tab (N-445 / PDP-13, PDP-D13)
//
// Admin sets the Development & Performance (PDP) switch — Off / Pilot / On — and, for Pilot, picks the
// people who take part. admin.js only registers the tab and dispatches to buildPdpTab(); everything
// the tab renders or does lives here. Reads and writes go through api-pdp.js (readPdpSwitch /
// writePdpSwitch); the rules are pure in pdp-identity.js (pdpPilotCandidates, pdpAccess, ...).
//
// The tab holds no PDP records, so it never names a PDP list. Admin only: the Config Panel gates the
// page, and writePdpSwitch checks pdpSwitch again. Every change re-renders through
// renderAdminTab('pdp'), so the screen only ever shows what was actually saved.

let _pdpaBusy  = false;   // a save is running — every control in the tab is disabled
let _pdpaSaved = '';      // the mode that was saved when the tab last rendered (confirm only on the way to On)
let _pdpaFrom  = '';      // N-441: the reminders-from date shown when the tab last rendered (saved only when changed)

const _PDPA_MODE_TEXT = {
  Off:   { label: 'Off',   help: 'Users see nothing. Admin and People Ops can preview.' },
  Pilot: { label: 'Pilot', help: 'Only the pilot people see PDP, plus their line manager and CSD as reviewers.' },
  On:    { label: 'On',    help: 'Everyone in scope: deployable TPs, STPs, PTPs and SDMs, with their line managers and CSDs.' },
};

// Line managers and CSDs who join the pilot automatically, by name, from the People rows.
function _pdpaReviewerNames(people, emails) {
  const names = new Set();
  emails.forEach(e => {
    const id = pdpResolveIdentity(people, e);
    if (id.lineManager) names.add(id.lineManager.EmployeeName || '');
    if (id.csd) names.add(id.csd.EmployeeName || '');
  });
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function _pdpaStatusText(sw, count) {
  const [OFF, PILOT] = CONFIG.PDP.MODES;
  if (sw.mode === OFF)   return 'Off — users see nothing; Admin and People Ops preview.';
  if (sw.mode === PILOT) return `Pilot — ${count} ${count === 1 ? 'person' : 'people'}, plus their line managers and CSDs as reviewers.`;
  return 'On — everyone in scope.';
}

async function buildPdpTab() {
  if (!roleCan(_resolvedRole, 'pdpSwitch')) return '<p>Access denied.</p>';
  let sw, people;
  try {
    [sw, people] = await Promise.all([readPdpSwitch(), getPeople(false)]);
  } catch (e) {
    console.warn('PDP tab: settings unavailable', e);
    return `
    <h3>PDP</h3>
    <div class="ck-admin-setup" role="note">
      <i data-lucide="info" aria-hidden="true"></i>
      <span>Couldn't read the PDP settings (${escHtml(e.message)}). Check the AppSettings PDPMode and PDPPilot columns exist (see Readme).</span>
    </div>`;
  }
  _pdpaSaved = sw.mode;
  _pdpaFrom = sw.remindersFrom;
  const candidates = pdpPilotCandidates(people, new Date());
  const known = new Set(candidates.map(c => c.email));
  const selected = new Set(sw.pilot);
  const unresolved = sw.pilot.filter(e => !known.has(e));
  const reviewers = _pdpaReviewerNames(people, sw.pilot.filter(e => known.has(e)));

  const modeRadios = CONFIG.PDP.MODES.map(m => `
          <label class="pdp-admin-opt">
            <input type="radio" name="pdp-mode" value="${escAttr(m)}"${sw.mode === m ? ' checked' : ''}>
            <span><strong>${escHtml(_PDPA_MODE_TEXT[m].label)}</strong><small>${escHtml(_PDPA_MODE_TEXT[m].help)}</small></span>
          </label>`).join('');

  const personRow = (email, label, checked, extra) => `
            <label class="pdp-admin-person" data-name="${escAttr(label.toLowerCase())}">
              <input type="checkbox" class="pdp-pilot-box" value="${escAttr(email)}"${checked ? ' checked' : ''}${actOn('change', 'pdpaCount')}>
              <span>${escHtml(label)}${extra ? ` <small>${escHtml(extra)}</small>` : ''}</span>
            </label>`;
  const rows = candidates.map(c => personRow(c.email, c.name, selected.has(c.email), c.level)).join('')
    + unresolved.map(e => personRow(e, e, true, 'not found in People — untick to remove')).join('');

  return `
    <div class="ck-admin pdp-admin" id="pdp-admin">
      <h3>PDP</h3>
      <p class="admin-tab-intro">Switch the Development &amp; Performance process on in stages. Switching from Pilot to On starts meetings for everyone else in scope and leaves existing records untouched. Someone removed from the pilot keeps the records they already have; switching Off hides PDP from everyone except Admin and People Ops.</p>
      <div class="ck-admin-switches">
        <div class="ck-admin-switch">
          <div class="ck-admin-switch-title">PDP switch</div>
          <p class="ck-admin-switch-status" id="pdp-admin-current">${escHtml(_pdpaStatusText(sw, selected.size))}</p>
          <div class="pdp-admin-modes" role="radiogroup" aria-label="PDP mode">${modeRadios}
          </div>
        </div>
        <div class="ck-admin-switch">
          <div class="ck-admin-switch-title">Pilot people</div>
          <p class="ck-admin-switch-status"><span id="pdp-pilot-count">${selected.size} selected</span> — used when the switch is Pilot. In scope with a unique work email only.</p>
          <div class="form-group">
            <label for="pdp-pilot-filter">Find a person</label>
            <input type="search" id="pdp-pilot-filter" autocomplete="off"${actOn('input', 'pdpaFilter')}>
          </div>
          <div class="pdp-admin-list" role="group" aria-label="Pilot people">${rows || '<p class="ck-admin-hint">No one is in scope with a work email yet — see Data Health.</p>'}
          </div>
          <p class="ck-admin-hint">Reviewers added automatically: ${reviewers.length ? escHtml(reviewers.join(', ')) : 'none yet'}.</p>
        </div>
        <div class="ck-admin-switch">
          <div class="ck-admin-switch-title">Reminders</div>
          <p class="ck-admin-switch-status">Reminders are sent only when PDP is On, so pilot users receive none. Meetings and actions due before the date below never trigger one.</p>
          <div class="form-group">
            <label for="pdp-reminders-from">Reminders from</label>
            <input type="date" id="pdp-reminders-from" value="${escAttr(sw.remindersFrom)}">
          </div>
        </div>
      </div>
      <p id="pdp-admin-status" class="ck-admin-status" role="status" aria-live="polite"></p>
      <button type="button" class="btn-primary" id="pdp-admin-save"${act('pdpaSave')}>Save</button>
    </div>`;
}

// Live filter: hides people whose name does not contain the text. No re-render, so ticks survive.
function pdpaFilter() {
  const q = (document.getElementById('pdp-pilot-filter')?.value || '').trim().toLowerCase();
  document.querySelectorAll('#pdp-admin .pdp-admin-person').forEach(el => {
    el.hidden = q !== '' && !String(el.dataset.name || '').includes(q);
  });
}

function pdpaCount() {
  const n = document.querySelectorAll('#pdp-admin .pdp-pilot-box:checked').length;
  const el = document.getElementById('pdp-pilot-count');
  if (el) el.textContent = `${n} selected`;
}

function _pdpaLock(message = '') {
  _pdpaBusy = true;
  const root = document.getElementById('pdp-admin');
  if (root) {
    root.setAttribute('aria-busy', 'true');
    root.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
  }
  const status = document.getElementById('pdp-admin-status');
  if (status) status.textContent = message;
}

async function pdpaSave() {
  if (_pdpaBusy) return;
  const [, PILOT, ON] = CONFIG.PDP.MODES;
  const checked = document.querySelector('#pdp-admin input[name="pdp-mode"]:checked');
  if (!checked) return;
  const mode  = checked.value;
  const pilot = [...document.querySelectorAll('#pdp-admin .pdp-pilot-box:checked')].map(el => el.value);
  if (mode === PILOT && !pilot.length) {
    toast('Pick at least one pilot person, or choose Off.', { type: 'error' });
    return;
  }
  if (mode === ON && _pdpaSaved !== ON && !(await confirmModal({
    message: 'Switch PDP on for everyone in scope? Their line managers and CSDs will see it too, and meetings are generated for all of them. Existing records are not changed.',
    confirmLabel: 'Switch on',
  }))) return;

  _pdpaLock('Saving…');
  try {
    const from = (document.getElementById('pdp-reminders-from')?.value || '').trim();
    const payload = { mode, pilot };
    if (from !== _pdpaFrom) payload.remindersFrom = from;
    await writePdpSwitch(payload);
    toast(`PDP is now ${mode}.`, { type: 'success' });
  } catch (e) {
    console.error('PDP switch save failed:', e);
    toast(`Couldn't save the PDP switch — ${e.message}`, { type: 'error' });
  }
  _pdpaBusy = false;
  if (document.getElementById('pdp-admin')) await renderAdminTab('pdp');
  document.getElementById('pdp-admin-save')?.focus();
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  pdpaSave,
  pdpaFilter,
  pdpaCount,
});