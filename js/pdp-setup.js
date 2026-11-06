// js/pdp-setup.js — People > PDP Setup (N-436 / PDP-4)
//
// Admin and People Ops edit the Development & Performance capability framework here and (through
// pdp-template-editor.js) the four meeting templates. people-nav.js only dispatches to
// renderPdpSetupPage(); everything the page renders or does lives in these two files.
//
// Reads and writes go through api-pdp.js (readPdpSetup, seedPdpDefaults, savePdpFramework,
// addPdpFrameworkSet, ...); every rule is pure in pdp-data.js. This file holds NO personal PDP
// records and never names a PDP list (PDP-D12 source scan): the framework and templates are
// organisation content, readable by every Newton user and editable only by Admin / People Ops
// (SharePoint item permissions, N-435; pdpAdmin here).
//
// The page opens for Admin and People Ops in every PDP mode (Off, Pilot, On): templates are built
// before launch (N-445). resolvePdpGate() must still say preview or live.

let _pdpsState = {
  tab:   'framework',   // 'framework' | 'templates'
  setup: null,          // { framework, templates } as last read
  level: '',            // selected framework set
  track: '',
  dirty: false,         // framework grid has unsaved text
  busy:  false,
  mode:  '',            // PDP switch, for the page note
};

const _PDPS_BAND_TEXT = { Below: 'Below expectation', Meets: 'Meets expectation', Exceeding: 'Exceeding expectation' };

function _pdpsFmtDate(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

async function renderPdpSetupPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = dashboardSkeleton(2);
  if (!roleCan(_resolvedRole, 'pdpAdmin')) {
    main.innerHTML = emptyStateBlock({ icon: 'lock', title: 'PDP Setup', message: 'Only Admin and People Ops can edit the PDP framework and templates.' });
    lucide.createIcons();
    return;
  }
  let gate = null, setup = null;
  try {
    gate = await resolvePdpGate();
  } catch (e) {
    console.warn('PDP Setup: gate unavailable', e);
  }
  if (!gate || gate.state === 'none') {
    main.innerHTML = emptyStateBlock({ icon: 'lock', title: 'PDP Setup', message: 'Development & Performance is not available to you right now.' });
    lucide.createIcons();
    return;
  }
  try {
    setup = await readPdpSetup(true);
  } catch (e) {
    console.error('PDP Setup: read failed', e);
    main.innerHTML = emptyStateBlock({
      icon: 'alert-triangle', variant: 'error', title: 'Could not load PDP Setup',
      message: `${e.message} If a column is missing, check that the framework list has an UpdatedBy column (see the Readme) and run Data Health > Schema Check.`,
    });
    lucide.createIcons();
    return;
  }
  _pdpsState.setup = setup;
  _pdpsState.mode  = gate.mode;
  _pdpsState.dirty = false;
  _pdptDraft = null; _pdptView = 'list'; _pdptPrev = null;   // a fresh visit starts at the version list (pdp-template-editor.js)
  _pdpsState.busy  = false;
  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">PDP Setup</h1>
    </div>
    <p class="ppl-muted-note pdps-intro">The capability framework and the four meeting templates behind Development &amp; Performance. Changes here are used by every new meeting; a meeting keeps the template version it started with. PDP is currently <strong>${escHtml(gate.mode)}</strong>${gate.mode === CONFIG.PDP.MODES[0] ? ' (only Admin and People Ops can preview it)' : ''}.</p>
    <div id="pdps-seed"></div>
    <div class="eng-tab-strip" role="tablist">
      <button class="eng-tab" id="pdps-tab-framework" role="tab"${act('pdpsTab', 'framework')}>Framework</button>
      <button class="eng-tab" id="pdps-tab-templates" role="tab"${act('pdpsTab', 'templates')}>Templates</button>
    </div>
    <div id="pdps-body"></div>`;
  _pdpsRender();
}

// Everything below the page header is redrawn from _pdpsState.setup, so the screen only ever shows
// what was actually read back from SharePoint.
function _pdpsRender() {
  const tab = _pdpsState.tab;
  ['framework', 'templates'].forEach(t => {
    const el = document.getElementById('pdps-tab-' + t);
    if (el) { el.classList.toggle('eng-tab--active', t === tab); el.setAttribute('aria-selected', t === tab ? 'true' : 'false'); }
  });
  const seed = document.getElementById('pdps-seed');
  if (seed) seed.innerHTML = _pdpsSeedHtml();
  const body = document.getElementById('pdps-body');
  if (!body) return;
  body.innerHTML = tab === 'framework' ? _pdpsFrameworkHtml() : pdptTemplatesHtml(_pdpsState.setup);
  lucide.createIcons();
}

function _pdpsSeedHtml() {
  const s = _pdpsState.setup;
  const plan = pdpSeedPlan(s.framework, s.templates, PDP_SEED, '', '');
  const n = plan.framework.length + plan.templates.length;
  if (!n) return '<p class="ppl-muted-small pdps-seed-done">The default framework and templates are in place. Nothing to seed.</p>';
  return `
    <div class="ppl-card pdps-seed">
      <div class="ppl-card-title">Defaults from the Notion framework are missing</div>
      <p class="ppl-muted-note">${plan.framework.length.toLocaleString('en-GB')} framework ${plan.framework.length === 1 ? 'row' : 'rows'} and ${plan.templates.length.toLocaleString('en-GB')} ${plan.templates.length === 1 ? 'template' : 'templates'} can be created. Seeding only adds what is missing and never changes a row you have edited. It is safe to run again.</p>
      <button type="button" class="btn-primary" id="pdps-seed-btn"${act('pdpsSeed')}>Seed defaults — create ${n.toLocaleString('en-GB')} ${n === 1 ? 'row' : 'rows'}</button>
    </div>`;
}

// ── Framework tab ─────────────────────────────────────────────────────

function _pdpsFrameworkHtml() {
  const rows = _pdpsState.setup.framework;
  const sets = pdpFrameworkLevels(rows);
  const addBox = `
    <div class="pdps-add">
      <span class="ppl-muted-small">Add a level:</span>
      <select id="pdps-add-level" aria-label="Level to add">${CONFIG.PDP.LEVELS.map(l => `<option value="${escAttr(l)}">${escHtml(l)}</option>`).join('')}</select>
      <select id="pdps-add-track" aria-label="Track to add">${CONFIG.PDP.TRACKS.map(t => `<option value="${escAttr(t)}">${escHtml(t)}</option>`).join('')}</select>
      <button type="button" class="btn-secondary btn--sm"${act('pdpsAddSet')}>Add</button>
    </div>`;
  if (!sets.length) {
    return emptyStateBlock({ icon: 'layers', title: 'No framework yet', message: 'Seed the defaults above to load levels L1 to L5, or add a level.' }) + addBox;
  }
  if (!sets.some(x => x.level === _pdpsState.level && x.track === _pdpsState.track)) {
    _pdpsState.level = sets[0].level;
    _pdpsState.track = sets[0].track;
  }
  const { level, track } = _pdpsState;
  const set = pdpFrameworkSet(rows, level, track);
  const audit = pdpFrameworkAudit(rows, level, track);
  const options = sets.map(x => {
    const v = x.level + '|' + x.track;
    const tag = x.complete ? (x.active ? '' : ' (off)') : ' (incomplete)';
    return `<option value="${escAttr(v)}"${x.level === level && x.track === track ? ' selected' : ''}>${escHtml(x.level + ' · ' + x.track + tag)}</option>`;
  }).join('');
  const head = CONFIG.PDP.BANDS.map(b => `<th>${escHtml(_PDPS_BAND_TEXT[b] || b)}</th>`).join('');
  const body = set.pillars.map(p => `
        <tr>
          <th scope="row" class="pdps-pillar">${escHtml(p.name)}</th>
          ${CONFIG.PDP.BANDS.map(b => `<td><textarea class="pdps-desc" rows="6" maxlength="${escAttr(CONFIG.PDP.TEMPLATE_LIMITS.DESCRIPTOR_MAX)}" data-pk="${escAttr(p.key)}" data-band="${escAttr(b)}" aria-label="${escAttr(p.name + ', ' + (_PDPS_BAND_TEXT[b] || b))}">${escHtml(p.bands[b].text)}</textarea></td>`).join('')}
        </tr>`).join('');
  const incomplete = set.written < set.total;
  const note = incomplete
    ? `<p class="ppl-muted-note pdps-note">${level === 'L5' && track === 'IC' ? 'PTP: ' : ''}scoring is off for ${escHtml(level + ' · ' + track)} until all ${set.total} descriptors are written.</p>`
    : '';
  return `
    <div class="pdps-framework">
      <div class="pdps-toolbar">
        <div class="form-group pdps-set">
          <label for="pdps-set">Level and track</label>
          <select id="pdps-set"${actOn('change', 'pdpsSelectSet', ACT_VALUE)}>${options}</select>
        </div>
        ${addBox}
      </div>
      ${note}
      <div class="ppl-card" id="pdps-grid"${actOn('input', 'pdpsInput')}>
        <table class="data-table pdps-table">
          <thead><tr><th>Pillar</th>${head}</tr></thead>
          <tbody>${body}
          </tbody>
        </table>
        <div class="pdps-foot">
          <label class="pdps-active"><input type="checkbox" id="pdps-active"${set.active ? ' checked' : ''}${incomplete ? ' disabled' : ''}> In use for scoring</label>
          <span class="ppl-muted-small" id="pdps-count">${set.written} of ${set.total} written</span>
          <span class="ppl-muted-small">${audit.at ? 'Last edited ' + escHtml(_pdpsFmtDate(audit.at)) + (audit.by ? ' by ' + escHtml(audit.by) : '') : 'Not edited yet'}</span>
          <button type="button" class="btn-primary" id="pdps-save"${act('pdpsSaveFramework')}>Save</button>
        </div>
      </div>
    </div>`;
}

// Live: keeps the "n of 18 written" count honest and unlocks the in-use switch as text is typed.
function pdpsInput() {
  _pdpsState.dirty = true;
  const boxes = [...document.querySelectorAll('#pdps-grid .pdps-desc')];
  const written = boxes.filter(t => t.value.trim() !== '').length;
  const count = document.getElementById('pdps-count');
  if (count) count.textContent = `${written} of ${boxes.length} written`;
  const active = document.getElementById('pdps-active');
  if (active) {
    active.disabled = written < boxes.length;
    if (active.disabled) active.checked = false;
  }
}

async function _pdpsConfirmLeave() {
  if (!_pdpsState.dirty) return true;
  return confirmModal({ message: 'You have unsaved framework changes. Leave without saving?', confirmLabel: 'Leave', danger: true });
}

async function pdpsTab(tab) {
  if (_pdpsState.busy || tab === _pdpsState.tab) return;
  if (!(await _pdpsConfirmLeave())) return;
  _pdpsState.dirty = false;
  _pdpsState.tab = tab;
  _pdpsRender();
}

async function pdpsSelectSet(value) {
  const [level, track] = String(value || '').split('|');
  if (_pdpsState.busy || (level === _pdpsState.level && track === _pdpsState.track)) return;
  if (!(await _pdpsConfirmLeave())) {
    const sel = document.getElementById('pdps-set');   // keep the typed text; only put the selector back
    if (sel) sel.value = _pdpsState.level + '|' + _pdpsState.track;
    return;
  }
  _pdpsState.dirty = false;
  _pdpsState.level = level;
  _pdpsState.track = track;
  _pdpsRender();
}

function _pdpsLock(on) {
  _pdpsState.busy = on;
  const root = document.getElementById('main-content');
  if (root) root.setAttribute('aria-busy', on ? 'true' : 'false');
  if (root) root.classList.toggle('pdp-busy', on);   // CSS blocks clicks; no button is re-enabled by mistake
}

async function _pdpsReload() {
  _pdpsState.setup = await readPdpSetup(true);
  _pdpsState.dirty = false;
  _pdpsRender();
}

async function pdpsSaveFramework() {
  if (_pdpsState.busy) return;
  const descriptors = {};
  document.querySelectorAll('#pdps-grid .pdps-desc').forEach(t => {
    (descriptors[t.dataset.pk] = descriptors[t.dataset.pk] || {})[t.dataset.band] = t.value;
  });
  const isActive = !!document.getElementById('pdps-active')?.checked;
  _pdpsLock(true);
  try {
    const r = await savePdpFramework({ level: _pdpsState.level, track: _pdpsState.track, descriptors, isActive });
    toast(r.updated || r.created ? `Saved ${_pdpsState.level} · ${_pdpsState.track}.` : 'Nothing had changed.', { type: 'success' });
  } catch (e) {
    console.error('PDP framework save failed:', e);
    toast(`Couldn't save the framework — ${e.message}`, { type: 'error' });
  }
  try { await _pdpsReload(); } catch (e) { toast(`Saved, but the screen could not refresh — ${e.message}`, { type: 'error' }); }
  _pdpsLock(false);
}

async function pdpsAddSet() {
  if (_pdpsState.busy) return;
  if (!(await _pdpsConfirmLeave())) return;
  const level = document.getElementById('pdps-add-level')?.value;
  const track = document.getElementById('pdps-add-track')?.value;
  _pdpsLock(true);
  try {
    await addPdpFrameworkSet(level, track);
    _pdpsState.level = level;
    _pdpsState.track = track;
    toast(`Added ${level} · ${track}. Write the descriptors, then switch it on.`, { type: 'success' });
    await _pdpsReload();
  } catch (e) {
    console.error('PDP framework add failed:', e);
    toast(`Couldn't add the level — ${e.message}`, { type: 'error' });
  }
  _pdpsLock(false);
}

async function pdpsSeed() {
  if (_pdpsState.busy) return;
  _pdpsLock(true);
  try {
    const r = await seedPdpDefaults();
    toast(`Seeded ${r.framework} framework ${r.framework === 1 ? 'row' : 'rows'} and ${r.templates} ${r.templates === 1 ? 'template' : 'templates'}.`, { type: 'success' });
  } catch (e) {
    console.error('PDP seed failed:', e);
    toast(e.message, { type: 'error' });
  }
  try { await _pdpsReload(); } catch (e) { toast(`The screen could not refresh — ${e.message}`, { type: 'error' }); }
  _pdpsLock(false);
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  pdpsTab,
  pdpsSelectSet,
  pdpsInput,
  pdpsSaveFramework,
  pdpsAddSet,
  pdpsSeed,
});