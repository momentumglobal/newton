// js/pdp-cycle-admin.js — People > PDP Setup > Cycle (N-437 / PDP-5)
//
// Admin and People Ops generate each in-scope person's PDP cycle for a year: pick the year, Preview
// (nothing is written), then Apply. pdp-setup.js owns the page and calls pdpcCycleHtml() for the tab;
// the rules are pure in pdp-cycle.js and the reads / writes are planPdpCycle / applyPdpCycle in
// api-pdp.js. PDP-D12 review (N-437): this tab shows names, line managers and meeting status from the
// personal PDP lists, so it is on the PDP-D12 allowlist (tests/assert-pdp-access.js); it is loaded
// only on people.html, never by mobile.html, Newton for Claude or the Command Bar.

let _pdpcState = {
  year:     0,      // selected cycle year
  plan:     null,   // last plan for `year` (pdpBuildCyclePlan shape)
  error:    '',
  loading:  false,
  busy:     false,
  progress: '',
  periods:  null,   // N-440: last planPdpGoalPeriods() result ({ rows, skipped, total })
  periodsMsg: '',   // N-440: last Tidy goal periods outcome
};

const _PDPC_STATE_TEXT = { done: 'Done', skipped: 'Skipped', overdue: 'Overdue', due: 'Due soon', upcoming: 'Upcoming' };
const _PDPC_STATE_CLASS = { done: 'dh-badge-success', overdue: 'dh-badge-danger', due: 'dh-badge-warn' };

function _pdpcPlural(n, one, many) { return n.toLocaleString('en-GB') + ' ' + (n === 1 ? one : many); }

// Called by pdp-setup.js. Draws the tab from _pdpcState and loads a preview the first time.
function pdpcCycleHtml() {
  const years = pdpCycleYears(new Date());
  if (!years.includes(_pdpcState.year)) { _pdpcState.year = years[years.length - 1]; _pdpcState.plan = null; _pdpcState.error = ''; }
  if (!_pdpcState.plan && !_pdpcState.loading && !_pdpcState.error) setTimeout(() => pdpcPreview(), 0);
  const options = years.map(y => `<option value="${escAttr(y)}"${y === _pdpcState.year ? ' selected' : ''}>${escHtml(y)}</option>`).join('');
  const p = _pdpcState.plan;
  const canApply = !!p && !p.off && !p.nothingToDo && !p.blockedTemplates.length && !_pdpcState.busy;
  return `
    <div class="pdpc">
      <div class="pdps-toolbar">
        <div class="form-group pdps-set">
          <label for="pdpc-year">Cycle year</label>
          <select id="pdpc-year"${actOn('change', 'pdpcYear', ACT_VALUE)}>${options}</select>
        </div>
        <div class="pdpc-actions">
          <button type="button" class="btn-secondary"${act('pdpcPreview')}>Preview</button>
          <button type="button" class="btn-primary" id="pdpc-apply"${canApply ? '' : ' disabled'}${act('pdpcApply')}>Apply</button>
        </div>
      </div>
      <p class="ppl-muted-note pdps-note">Creates each in-scope person&rsquo;s meetings for the year (one a month, due on the last day of the month), joiner goal setting, and skips for leavers. Preview writes nothing. Running it again only adds what is missing.</p>
      <p class="ppl-muted-small pdpc-progress" id="pdpc-progress" aria-live="polite">${escHtml(_pdpcState.progress)}</p>
      <div id="pdpc-body">${_pdpcBodyHtml()}</div>
      ${_pdpcPeriodsHtml()}
    </div>`;
}

function _pdpcBodyHtml() {
  const s = _pdpcState;
  if (s.loading) return dashboardSkeleton(2);
  if (s.error) return emptyStateBlock({ icon: 'alert-triangle', variant: 'error', title: 'Could not prepare the cycle', message: s.error });
  const p = s.plan;
  if (!p) return '';
  if (p.off) return emptyStateBlock({ icon: 'lock', title: 'PDP is Off', message: 'Switch PDP to Pilot or On (Config Panel > PDP) to generate meetings.' });
  const c = p.counts;
  const summary = p.nothingToDo
    ? `Nothing to do for ${escHtml(p.year)}: every in-scope person already has their meetings.`
    : `Apply will create ${_pdpcPlural(c.cycles, 'cycle', 'cycles')} and ${_pdpcPlural(c.meetings, 'meeting', 'meetings')}${c.skipped ? ' (' + c.skipped.toLocaleString('en-GB') + ' of them skipped)' : ''}, and make ${_pdpcPlural(c.updates, 'update', 'updates')}.`;
  const blocked = p.blockedTemplates.length
    ? `<div class="pdpt-problems">Publish a template first (People &gt; PDP Setup &gt; Templates): ${p.blockedTemplates.map(b => escHtml(b.label)).join(', ')}. Apply stays off until then.</div>`
    : '';
  return `
    <p class="pdpc-summary">${summary} PDP is <strong>${escHtml(p.mode)}</strong>.</p>
    ${blocked}
    ${_pdpcCreateHtml(p)}
    ${_pdpcListHtml('Updates', p.meetingUpdates.concat(p.cycleUpdates).map(u => ({ name: u.name, reason: u.why })))}
    ${_pdpcListHtml('Cannot generate', p.cannot, 'Fix these in Admin &gt; Data Health &gt; Identity (PDP), then preview again. Nothing is written for them.')}
    ${_pdpcListHtml('Warnings', p.warnings)}
    ${_pdpcListHtml('Waiting', p.waiting, 'Not yet due a cycle. Run the engine again once they start.')}
    ${_pdpcStatusHtml(p)}`;
}

function _pdpcCreateHtml(p) {
  if (!p.cycles.length && !p.meetings.length) return '';
  const byPerson = new Map();
  p.meetings.forEach(m => {
    const r = byPerson.get(m.personId) || { name: m.name, planned: 0, skipped: 0, first: '' };
    if (m.fields.Status === 'Skipped') r.skipped++; else r.planned++;
    if (!r.first || m.fields.DueDate < r.first) r.first = m.fields.DueDate;
    byPerson.set(m.personId, r);
  });
  const cycles = new Map(p.cycles.map(x => [x.personId, x]));
  const rows = [...byPerson.keys()].map(id => {
    const r = byPerson.get(id);
    const cyc = cycles.get(id);
    const kind = !cyc ? 'Missing meetings' : cyc.joiner ? 'Joiner from ' + pdpFmtDay(cyc.fields.JoinDate) : 'Full year';
    const level = cyc ? cyc.fields.Level + ' · ' + cyc.fields.Track : '';
    return `<tr><td>${escHtml(r.name)}</td><td>${escHtml(level)}</td><td>${escHtml(kind)}</td><td>${r.planned}</td><td>${r.skipped}</td><td>${escHtml(pdpFmtDay(r.first))}</td></tr>`;
  }).join('');
  return `
    <div class="ppl-card pdpc-card">
      <div class="ppl-card-title">To create</div>
      <div class="table-scroll"><table class="data-table pdpc-table">
        <thead><tr><th>Person</th><th>Level</th><th>Cycle</th><th>Meetings</th><th>Skipped</th><th>First due</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function _pdpcListHtml(title, items, note) {
  if (!items || !items.length) return '';
  return `
    <div class="ppl-card pdpc-card">
      <div class="ppl-card-title">${escHtml(title)} (${items.length.toLocaleString('en-GB')})</div>
      ${note ? `<p class="ppl-muted-note">${note}</p>` : ''}
      <ul class="pdpc-list">${items.map(i => `<li><strong>${escHtml(i.name)}</strong> &mdash; ${escHtml(i.reason)}</li>`).join('')}</ul>
    </div>`;
}

function _pdpcStatusHtml(p) {
  const rows = p.people.filter(r => r.summary.total);
  if (!rows.length) return '';
  const badge = st => `<span class="dh-badge ${_PDPC_STATE_CLASS[st] || ''}">${escHtml(_PDPC_STATE_TEXT[st] || st)}</span>`;
  const body = rows.map(r => {
    const s = r.summary;
    const next = s.next ? `${escHtml(pdpMeetingLabel(s.next))}, ${escHtml(pdpFmtDay(spDateIn(s.next.DueDate)))} ${badge(pdpMeetingState(s.next, new Date()))}` : '&mdash;';
    return `<tr><td>${escHtml(r.name)}${r.status === 'closed' ? ' <span class="ppl-muted-small">(closed)</span>' : ''}</td><td>${escHtml(r.lm)}</td><td>${next}</td><td>${s.overdue}</td><td>${s.due}</td><td>${s.done}</td><td>${s.total}</td></tr>`;
  }).join('');
  return `
    <div class="ppl-card pdpc-card">
      <div class="ppl-card-title">Status &mdash; ${escHtml(p.year)}</div>
      <div class="table-scroll"><table class="data-table pdpc-table">
        <thead><tr><th>Person</th><th>Line manager</th><th>Next meeting</th><th>Overdue</th><th>Due soon</th><th>Done</th><th>Meetings</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>
    </div>`;
}

function _pdpcRedraw() {
  const tab = document.querySelector('.pdpc');
  if (!tab) return;
  tab.outerHTML = pdpcCycleHtml();
  lucide.createIcons();
}

async function pdpcPreview() {
  if (_pdpcState.busy || _pdpcState.loading) return;
  _pdpcState.loading = true;
  _pdpcState.error = '';
  _pdpcRedraw();
  try {
    _pdpcState.plan = await planPdpCycle(_pdpcState.year, true);
  } catch (e) {
    console.error('PDP cycle preview failed:', e);
    _pdpcState.plan = null;
    _pdpcState.error = e.message;
  }
  _pdpcState.loading = false;
  _pdpcRedraw();
}

async function pdpcYear(value) {
  const y = Number(value);
  if (_pdpcState.busy || y === _pdpcState.year) return;
  _pdpcState.year = y;
  _pdpcState.plan = null;
  _pdpcState.error = '';
  _pdpcState.progress = '';
  await pdpcPreview();
}

async function pdpcApply() {
  const p = _pdpcState.plan;
  if (_pdpcState.busy || !p || p.nothingToDo) return;
  const ok = await confirmModal({
    title: 'Generate ' + p.year + ' PDP meetings',
    message: `Create ${_pdpcPlural(p.counts.cycles, 'cycle', 'cycles')} and ${_pdpcPlural(p.counts.meetings, 'meeting', 'meetings')}, and make ${_pdpcPlural(p.counts.updates, 'update', 'updates')}? Each new record is then locked to the person, their line manager and CSD by the PDP access flow.`,
    confirmLabel: 'Apply',
  });
  if (!ok) return;
  _pdpcState.busy = true;
  _pdpsLock(true);
  const prog = document.getElementById('pdpc-progress');
  try {
    const r = await applyPdpCycle(p.year, (done, total) => {
      _pdpcState.progress = `Writing ${done.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}…`;
      if (prog) prog.textContent = _pdpcState.progress;
    });
    _pdpcState.progress = `Done: ${_pdpcPlural(r.cycles, 'cycle', 'cycles')}, ${_pdpcPlural(r.meetings, 'meeting', 'meetings')}, ${_pdpcPlural(r.updates, 'update', 'updates')}.`;
    toast(_pdpcState.progress, { type: 'success' });
  } catch (e) {
    console.error('PDP cycle apply failed:', e);
    _pdpcState.progress = '';
    toast(e.message, { type: 'error' });
  }
  _pdpcState.busy = false;
  _pdpsLock(false);
  _pdpcState.plan = null;
  await pdpcPreview();
  pdpsCycleBanner();
}

// N-440: "Tidy goal periods". Goals recorded in meetings before N-440 carry the meeting month as their Period;
// this rewrites them to Annual (YYYY), H2 (YYYY-H2) or quarter (YYYY-Qn). Preview writes nothing; Apply writes
// Period only and is safe to repeat. Shows counts grouped by change, never names.
function _pdpcPeriodsHtml() {
  const s = _pdpcState, p = s.periods;
  const groups = {};
  if (p) p.rows.forEach(r => { const k = r.from + '\u0000' + r.to; groups[k] = (groups[k] || 0) + 1; });
  const list = Object.keys(groups).map(k => { const [from, to] = k.split('\u0000'); return `<li>${escHtml(from || '(blank)')} &rarr; ${escHtml(to)}: ${_pdpcPlural(groups[k], 'goal', 'goals')}</li>`; }).join('');
  const skipped = p && p.skipped.length ? `<p class="ppl-muted-note">${_pdpcPlural(p.skipped.length, 'goal cannot', 'goals cannot')} be mapped and will be left alone: ${p.skipped.slice(0, CONFIG.PDP.DISPLAY_ROWS).map(x => escHtml(x.reason)).join(' ')}</p>` : '';
  const body = !p ? '' : (!p.rows.length
    ? `<p class="pdpc-summary">Every goal already has a schema Period (${_pdpcPlural(p.total, 'goal', 'goals')} checked).</p>${skipped}`
    : `<p class="pdpc-summary">${_pdpcPlural(p.rows.length, 'goal', 'goals')} to update.</p><ul class="pdpc-list">${list}</ul>${skipped}`);
  const canApply = !!p && p.rows.length > 0 && !s.busy;
  return `
    <div class="ppl-card pdpc-card" id="pdpc-periods">
      <div class="ppl-card-title">Tidy goal periods</div>
      <p class="ppl-muted-note">Goals recorded in a meeting before the tracker carry the meeting month as their Period. This rewrites them to Annual (YYYY), H2 (YYYY-H2) or quarter (YYYY-Qn). Preview writes nothing; Apply changes Period only, and running it again only changes what is still not tidy.</p>
      <div class="pdpc-actions">
        <button type="button" class="btn-secondary"${act('pdpcPeriodsPreview')}>Preview</button>
        <button type="button" class="btn-primary"${canApply ? '' : ' disabled'}${act('pdpcPeriodsApply')}>Apply</button>
      </div>
      <p class="ppl-muted-small" aria-live="polite">${escHtml(s.periodsMsg)}</p>
      ${body}
    </div>`;
}

async function pdpcPeriodsPreview() {
  if (_pdpcState.busy) return;
  _pdpcState.periodsMsg = 'Reading goals…';
  _pdpcRedraw();
  try {
    _pdpcState.periods = await planPdpGoalPeriods();
    _pdpcState.periodsMsg = '';
  } catch (e) {
    console.error('PDP goal periods preview failed:', e);
    _pdpcState.periods = null;
    _pdpcState.periodsMsg = e.message;
  }
  _pdpcRedraw();
}

async function pdpcPeriodsApply() {
  const p = _pdpcState.periods;
  if (_pdpcState.busy || !p || !p.rows.length) return;
  const ok = await confirmModal({ title: 'Tidy goal periods', message: 'Rewrite the Period of ' + _pdpcPlural(p.rows.length, 'goal', 'goals') + '? Nothing else on the goals changes.', confirmLabel: 'Apply' });
  if (!ok) return;
  _pdpcState.busy = true;
  _pdpsLock(true);
  try {
    const r = await applyPdpGoalPeriods((done, total) => { _pdpcState.periodsMsg = 'Writing ' + done.toLocaleString('en-GB') + ' of ' + total.toLocaleString('en-GB') + '…'; });
    _pdpcState.periodsMsg = 'Done: ' + _pdpcPlural(r.changed, 'goal', 'goals') + ' updated' + (r.failed.length ? ', ' + r.failed.length + ' failed (' + r.failed.slice(0, 3).map(f => f.reason).join('; ') + ')' : '') + '.';
    toast(_pdpcState.periodsMsg, { type: r.failed.length ? 'error' : 'success' });
  } catch (e) {
    console.error('PDP goal periods apply failed:', e);
    _pdpcState.periodsMsg = e.message;
    toast(e.message, { type: 'error' });
  }
  _pdpcState.busy = false;
  _pdpsLock(false);
  _pdpcState.periods = null;
  _pdpcRedraw();
  await pdpcPeriodsPreview();
}

// N-302e: delegated actions this file owns (js/actions.js). Never register a name twice.
registerActions({
  pdpcPreview,
  pdpcYear,
  pdpcApply,
  pdpcPeriodsPreview,
  pdpcPeriodsApply,
});