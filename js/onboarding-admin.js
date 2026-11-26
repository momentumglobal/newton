// js/onboarding-admin.js — Config Panel "Onboarding" tab (N-496 / ONB-1, ONB-D11)
//
// Admin sets the My Onboarding switch — Off / Pilot / On — and, for Pilot, picks the joiners who take
// part. admin.js only registers the tab and dispatches to buildOnboardingTab(); everything the tab renders
// or does lives here. Reads and writes go through api-onboarding.js (readOnboardingSwitch /
// writeOnboardingSwitch); the rules are pure in onboarding-logic.js (onbPilotCandidates, onbAccess, ...).
// Same layout and CSS classes as the PDP tab (pdp-admin.js) — no new CSS.
//
// The tab holds no onboarding plans or ticks. Admin only: the Config Panel gates the page, and
// writeOnboardingSwitch checks onbSwitch again. Every change re-renders through
// renderAdminTab('onboarding'), so the screen only ever shows what was actually saved.

let _onbaBusy  = false;   // a save is running — every control in the tab is disabled
let _onbaSaved = '';      // the mode saved when the tab last rendered (confirm only on the way to On)

const _ONBA_MODE_TEXT = {
  Off:   { label: 'Off',   help: 'Users see no onboarding plans. Admin can preview.' },
  Pilot: { label: 'Pilot', help: 'Only the pilot joiners, their line manager, CSD and buddy see a plan.' },
  On:    { label: 'On',    help: 'Every joiner with a plan, with their line manager, CSD and buddy.' },
};

// Line managers and CSDs who join the pilot automatically, by name, from the People rows.
function _onbaReviewerNames(people, rows, directory = null) {
  const names = new Set();
  rows.forEach(p => {
    const parties = onbPlanParties({ PersonID: p.id }, people, directory);   // N-541: a line manager with no People row
    if (parties.lineManager) names.add(parties.lineManager.EmployeeName || '');
    if (parties.csd) names.add(parties.csd.EmployeeName || '');
  });
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function _onbaStatusText(sw, count) {
  const [OFF, PILOT] = CONFIG.ONBOARDING.MODES;
  if (sw.mode === OFF)   return 'Off — users see no onboarding plans; Admin previews.';
  if (sw.mode === PILOT) return `Pilot — ${count} ${count === 1 ? 'person' : 'people'}, plus their line managers, CSDs and buddies.`;
  return 'On — every joiner with a plan.';
}

// "starts 13 January 2027" for a future starter, '' otherwise.
function _onbaStartNote(startDate) {
  return startDate && startDate > localDayISO() ? 'starts ' + formatLongDay(startDate) : '';
}

async function buildOnboardingTab() {
  if (!roleCan(_resolvedRole, 'onbSwitch')) return '<p>Access denied.</p>';
  const S = CONFIG.ONBOARDING.SETTINGS;
  let sw, people;
  try {
    [sw, people] = await Promise.all([readOnboardingSwitch(), getPeople(false)]);
  } catch (e) {
    console.warn('Onboarding tab: settings unavailable', e);
    return `
    <h3>Onboarding</h3>
    <div class="ck-admin-setup" role="note">
      <i data-lucide="info" aria-hidden="true"></i>
      <span>Couldn't read the onboarding settings (${escHtml(e.message)}). Check the AppSettings ${escHtml(S.MODE)} and ${escHtml(S.PILOT)} columns exist (see Readme).</span>
    </div>`;
  }
  _onbaSaved = sw.mode;
  const candidates = onbPilotCandidates(people);
  const known = new Set(candidates.map(c => c.email));
  const selected = new Set(sw.pilot);
  const unresolved = sw.pilot.filter(e => !known.has(e));
  const reviewers = _onbaReviewerNames(people, onbPilotRows(people, sw.pilot), await _onbDirectoryOrPeople(people));

  const modeRadios = CONFIG.ONBOARDING.MODES.map(m => `
          <label class="pdp-admin-opt">
            <input type="radio" name="onb-mode" value="${escAttr(m)}"${sw.mode === m ? ' checked' : ''}>
            <span><strong>${escHtml(_ONBA_MODE_TEXT[m].label)}</strong><small>${escHtml(_ONBA_MODE_TEXT[m].help)}</small></span>
          </label>`).join('');

  const personRow = (email, label, checked, extra) => `
            <label class="pdp-admin-person" data-name="${escAttr(label.toLowerCase())}">
              <input type="checkbox" class="onb-pilot-box" value="${escAttr(email)}"${checked ? ' checked' : ''}${actOn('change', 'onbaCount')}>
              <span>${escHtml(label)}${extra ? ` <small>${escHtml(extra)}</small>` : ''}</span>
            </label>`;
  const rows = candidates.map(c => personRow(c.email, c.name, selected.has(c.email), [c.level, _onbaStartNote(c.startDate)].filter(Boolean).join(' · '))).join('')
    + unresolved.map(e => personRow(e, e, true, 'not found in People — untick to remove')).join('');

  return `
    <div class="ck-admin pdp-admin" id="onb-admin">
      <h3>Onboarding</h3>
      <p class="admin-tab-intro">Switch My Onboarding on in stages. Pilot shows plans only to the joiners picked below, with their line manager, CSD and buddy. Switching Off hides every plan from everyone except Admin; plans and ticks are kept.</p>
      <div class="ck-admin-switches">
        <div class="ck-admin-switch">
          <div class="ck-admin-switch-title">Onboarding switch</div>
          <p class="ck-admin-switch-status" id="onb-admin-current">${escHtml(_onbaStatusText(sw, selected.size))}</p>
          <div class="pdp-admin-modes" role="radiogroup" aria-label="Onboarding mode">${modeRadios}
          </div>
        </div>
        <div class="ck-admin-switch">
          <div class="ck-admin-switch-title">Pilot joiners</div>
          <p class="ck-admin-switch-status"><span id="onb-pilot-count">${selected.size} selected</span> — used when the switch is Pilot. Talent Partners with a unique work email, including future starters.</p>
          <div class="form-group">
            <label for="onb-pilot-filter">Find a person</label>
            <input type="search" id="onb-pilot-filter" autocomplete="off"${actOn('input', 'onbaFilter')}>
          </div>
          <div class="pdp-admin-list" role="group" aria-label="Pilot joiners">${rows || '<p class="ck-admin-hint">No one is in scope with a work email yet — see Data Health.</p>'}
          </div>
          <p class="ck-admin-hint">Line managers and CSDs join automatically: ${reviewers.length ? escHtml(reviewers.join(', ')) : 'none yet'}.</p>
        </div>
      </div>
      <p id="onb-admin-status" class="ck-admin-status" role="status" aria-live="polite"></p>
      <button type="button" class="btn-primary" id="onb-admin-save"${act('onbaSave')}>Save</button>
    </div>`;
}

// Live filter: hides people whose name does not contain the text. No re-render, so ticks survive.
function onbaFilter() {
  const q = (document.getElementById('onb-pilot-filter')?.value || '').trim().toLowerCase();
  document.querySelectorAll('#onb-admin .pdp-admin-person').forEach(el => {
    el.hidden = q !== '' && !String(el.dataset.name || '').includes(q);
  });
}

function onbaCount() {
  const n = document.querySelectorAll('#onb-admin .onb-pilot-box:checked').length;
  const el = document.getElementById('onb-pilot-count');
  if (el) el.textContent = `${n} selected`;
}

function _onbaLock(message = '') {
  _onbaBusy = true;
  const root = document.getElementById('onb-admin');
  if (root) {
    root.setAttribute('aria-busy', 'true');
    root.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
  }
  const status = document.getElementById('onb-admin-status');
  if (status) status.textContent = message;
}

async function onbaSave() {
  if (_onbaBusy) return;
  const [, PILOT, ON] = CONFIG.ONBOARDING.MODES;
  const checked = document.querySelector('#onb-admin input[name="onb-mode"]:checked');
  if (!checked) return;
  const mode  = checked.value;
  const pilot = [...document.querySelectorAll('#onb-admin .onb-pilot-box:checked')].map(el => el.value);
  if (mode === PILOT && !pilot.length) {
    toast('Pick at least one pilot joiner, or choose Off.', { type: 'error' });
    return;
  }
  if (mode === ON && _onbaSaved !== ON && !(await confirmModal({
    message: 'Switch My Onboarding on for everyone? Every joiner with a plan, their line manager, CSD and buddy will see it. Existing plans and ticks are not changed.',
    confirmLabel: 'Switch on',
  }))) return;

  _onbaLock('Saving…');
  try {
    await writeOnboardingSwitch({ mode, pilot });
    toast(`Onboarding is now ${mode}.`, { type: 'success' });
  } catch (e) {
    console.error('Onboarding switch save failed:', e);
    toast(`Couldn't save the onboarding switch — ${e.message}`, { type: 'error' });
  }
  _onbaBusy = false;
  if (document.getElementById('onb-admin')) await renderAdminTab('onboarding');
  document.getElementById('onb-admin-save')?.focus();
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  onbaSave,
  onbaFilter,
  onbaCount,
});
