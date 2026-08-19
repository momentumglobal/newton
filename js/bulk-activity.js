// js/bulk-activity.js — N-147 (T-2a) Bulk weekly activity entry
//
// One grid row per role the signed-in user can see, one save. Sub-view of the
// Weekly Activity page: no `PAGES` entry and no sidebar item, reached only by
// the "Bulk log week" button in that page's header. Same shape as
// showAddActivityForm(), which also renders straight into #main-content;
// "Back to Weekly Activity" returns via navigateTo('activity') so
// nav.js's `currentPage` never goes stale.
//
// Rules this file follows — read before editing:
//  * No graphRequest here. Reads go through getWeeklyActivityForWeek(),
//    getScopedRolesForMarketReport() and getProjects(); writes through
//    createItem()/updateItem(). All of those belong to api.js.
//  * WeeklyActivity field names are ASYMMETRIC. Write `Yeare` and
//    `InterviewTwoPlus`; the same values read back as `Year` and
//    `Interview2Plus` (FIELD_ALIASES.WeeklyActivity, api.js). That is why
//    BULK_COUNT_FIELDS carries readKey and writeKey separately — do not
//    "tidy" them into one.
//  * WeekEndingDate buckets on the SUNDAY, never the Friday. getWeekEnding()
//    is the only way this file produces one.
//  * Untouched rows are never written. Dirty tracking is the whole point of
//    the feature (it is why N-148's carry-forward was dropped).

// Nine counts, in the same order as the single-role form in forms.js.
const BULK_COUNT_FIELDS = [
  { readKey: 'Outreach',        writeKey: 'Outreach',         label: 'Outreach'  },
  { readKey: 'Responses',       writeKey: 'Responses',        label: 'Responses' },
  { readKey: 'Screened',        writeKey: 'Screened',         label: 'Screened'  },
  { readKey: 'Submitted',       writeKey: 'Submitted',        label: 'Submitted' },
  { readKey: 'Interview1',      writeKey: 'Interview1',       label: 'IV1'       },
  { readKey: 'Interview2Plus',  writeKey: 'InterviewTwoPlus', label: 'IV2+'      },
  { readKey: 'FinalInterview',  writeKey: 'FinalInterview',   label: 'Final IV'  },
  { readKey: 'Offers',          writeKey: 'Offers',           label: 'Offers'    },
  { readKey: 'Hires',           writeKey: 'Hires',            label: 'Hires'     },
];

// Role stages that never appear in an activity picker. Deliberately the same
// literal renderWeeklyActivityForm() and loadRolesForWeekly() already use in
// forms.js, so the bulk grid and the single form agree on which roles exist.
// N-164 promotes all three copies to CONFIG.ROLE_STAGES_ACTIVITY_EXCLUDED —
// this is a known duplicate awaiting that refactor, not an oversight.
// NOT analytics.js's ACTIVE_STAGES: config.js carries an explicit warning that
// it references two stage values ('Placed', 'Closed') absent from this build.
const BULK_EXCLUDED_STAGES = ['Backlog', 'Hired', 'On-hold', 'Cancelled'];

let _bulkWeekEnding = null;  // 'YYYY-MM-DD', always a Sunday
let _bulkRows       = [];
let _bulkSaving     = false; // N-006 in-flight guard

// N-147 diff-2 — the bulk grid is desktop-only: twelve columns and a 900px
// minimum table width, which is not a phone layout under any amount of
// squeezing. mobile.html never loads this file and app.js already redirects
// sub-768px viewports away from reporting.html, so the app itself was never
// exposed. What this guards is "Switch to desktop view"
// (sessionStorage newton_force_desktop), which suppresses that redirect and
// leaves a phone on the desktop page. Deliberately the SAME two signals
// app.js redirects on, so the two can never disagree about what "mobile"
// means. Evaluated per render, not cached — a resize between renders is
// picked up on the next navigation.
function bulkEntryAvailable() {
  let isApp = false;
  try { isApp = localStorage.getItem('newton_mobile') === '1'; } catch (e) {}
  return !isApp && window.innerWidth >= 768;
}

async function renderBulkActivityPage(weekEnding = null) {
  // Belt and braces. pages.js hides the entry button when this is false, but
  // a deep link, a bookmark or a console call still lands here directly.
  if (!bulkEntryAvailable()) {
    toast('Bulk log week is desktop only — use Log Activity to record a single role.',
      { type: 'info', duration: 6000 });
    navigateTo('activity');
    return;
  }
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading roles...</p>';
  _bulkWeekEnding = getWeekEnding(weekEnding || localDayISO());
  _bulkRows = [];

  const user = getCurrentUser();
  let roles, weekRows, projects;
  try {
    [roles, weekRows, projects] = await Promise.all([
      // Despite the name this is the generic role-visibility resolver:
      // admin -> all roles, DM -> roles on their projects, TP -> roles whose
      // TalentPartner column matches them. N-165 renames it.
      getScopedRolesForMarketReport(user.email, _resolvedRole),
      getWeeklyActivityForWeek(_bulkWeekEnding),
      getProjects(false),
    ]);
  } catch (e) {
    main.innerHTML = `<div class="page-header"><h2>Bulk log week</h2>
      <div class="page-header-actions">
        <button type="button" class="btn-secondary" onclick="navigateTo('activity')">Back to Weekly Activity</button>
      </div></div>`;
    toast(`Could not load the bulk grid: ${e.message}`, { type: 'error', duration: 0 });
    return;
  }

  const projectNames = Object.fromEntries(
    projects.map(p => [String(p.id), p.CustomerName || '—'])
  );

  // Existing rows for this week, keyed role + owner. The owner is part of the
  // key because two TPs may each log their own activity against one shared
  // role; matching on role alone would make one overwrite the other.
  const existingByKey = {};
  weekRows.forEach(r => {
    const rid = String(r.RoleIDLookupId || r.RoleID || '');
    const tp  = String(r.TalentPartner || '').toLowerCase();
    existingByKey[`${rid}|${tp}`] = r;
  });

  // getScopedRolesForMarketReport's DM/TP branches flat() per-project arrays
  // without de-duping; a role reachable two ways would otherwise render twice
  // and be saved twice.
  const uniqueRoles = [...new Map(roles.map(r => [String(r.id), r])).values()];

  _bulkRows = uniqueRoles
    .filter(r => !BULK_EXCLUDED_STAGES.includes(r.Stage))
    .map(r => {
      const roleId    = String(r.id);
      const projectId = String(r.ProjectIDLookupId || r.ProjectID || '');
      const tpEmail   = resolveRowTalentPartner(r.TalentPartner, user.email);
      const existing  = tpEmail ? existingByKey[`${roleId}|${tpEmail}`] : null;
      const counts    = {};
      BULK_COUNT_FIELDS.forEach(f => {
        counts[f.readKey] = Number(existing && existing[f.readKey]) || 0;
      });
      return {
        roleId,
        projectId,
        roleLabel:   r.Location ? `${r.RoleTitle} (${r.Location})` : r.RoleTitle,
        projectName: projectNames[projectId] || '—',
        tpEmail,
        existingId:  existing ? existing.id : null,
        counts,
        dirty:  false,
        status: 'idle',
        error:  null,
      };
    })
    .sort((a, b) =>
      (a.projectName || '').localeCompare(b.projectName || '') ||
      (a.roleLabel   || '').localeCompare(b.roleLabel   || '')
    );

  const n = _bulkRows.length;
  main.innerHTML = `
    <div class="page-header">
      <h2>Bulk log week</h2>
      <div class="page-header-actions">
        <button type="button" class="btn-secondary" id="bulk-cancel"
          onclick="navigateTo('activity')">Back to Weekly Activity</button>
        <button type="button" class="btn-primary" id="bulk-save"
          onclick="saveBulkActivity()">Save all</button>
      </div>
    </div>
    <div class="table-toolbar">
      <div class="form-group project-filter-select">
        <label>Week Ending Date</label>
        <input type="date" id="bulk-week-ending" value="${escAttr(_bulkWeekEnding)}"
          onchange="onBulkWeekChange(this.value)">
      </div>
      <div class="bulk-grid-hint">Week ${getISOWeek(_bulkWeekEnding)} · ${n} role${n === 1 ? '' : 's'} · only edited rows are saved</div>
    </div>
    <div class="bulk-grid-scroll">${_bulkGridHtml()}</div>
  `;
  lucide.createIcons();
}

function _bulkGridHtml() {
  const colspan = 2 + BULK_COUNT_FIELDS.length;
  if (!_bulkRows.length) {
    return `<table class="data-table bulk-grid"><tbody>${emptyStateRow({
      colspan,
      icon: 'activity',
      message: 'No active roles to log activity against.',
    })}</tbody></table>`;
  }
  let lastProject = null;
  const body = _bulkRows.map((row, i) => {
    let head = '';
    if (row.projectName !== lastProject) {
      lastProject = row.projectName;
      head = `<tr class="bulk-grid-group-head"><td colspan="${colspan}">${escHtml(row.projectName)}</td></tr>`;
    }
    return head + _bulkRowHtml(row, i);
  }).join('');
  return `<table class="data-table bulk-grid">
    <thead><tr>
      <th>Role</th>
      ${BULK_COUNT_FIELDS.map(f => `<th class="bulk-grid-num">${escHtml(f.label)}</th>`).join('')}
      <th>Status</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function _bulkRowClass(row) {
  return [
    'bulk-row',
    row.tpEmail ? '' : 'bulk-row--unassigned',
    row.dirty ? 'bulk-row--dirty' : '',
    row.status === 'saved'  ? 'bulk-row--saved'  : '',
    row.status === 'failed' ? 'bulk-row--failed' : '',
  ].filter(Boolean).join(' ');
}

function _bulkRowHtml(row, i) {
  const disabled = row.tpEmail ? '' : 'disabled';
  const inputs = BULK_COUNT_FIELDS.map(f => `
    <td class="bulk-grid-num"><input type="number" min="0" class="bulk-grid-input"
      value="${Number(row.counts[f.readKey]) || 0}"
      oninput="onBulkInput(${i}, '${escAttr(f.readKey)}', this.value)" ${disabled}></td>`
  ).join('');
  return `<tr id="bulk-row-${i}" class="${_bulkRowClass(row)}">
    <td>${escHtml(row.roleLabel)}</td>
    ${inputs}
    <td class="bulk-grid-row-status" id="bulk-status-${i}">${_bulkStatusHtml(row)}</td>
  </tr>`;
}

function _bulkStatusHtml(row) {
  if (!row.tpEmail)            return '<span class="bulk-status-note">No assigned Talent Partner</span>';
  if (row.status === 'saving') return '<span class="bulk-status-note">Saving…</span>';
  if (row.status === 'saved')  return '<span class="bulk-status-ok">Saved</span>';
  if (row.status === 'failed') return `<span class="bulk-status-fail">${escHtml(row.error || 'Failed')}</span>`;
  if (row.dirty)               return '<span class="bulk-status-note">Unsaved</span>';
  if (row.existingId)          return '<span class="bulk-status-note">Logged</span>';
  return '';
}

// Repaints ONLY the row's class and its status cell. Never re-renders the
// number inputs — doing so mid-typing would destroy focus and caret position.
function _repaintBulkRow(i) {
  const row = _bulkRows[i];
  if (!row) return;
  const tr = document.getElementById(`bulk-row-${i}`);
  const st = document.getElementById(`bulk-status-${i}`);
  if (tr) tr.className = _bulkRowClass(row);
  if (st) st.innerHTML = _bulkStatusHtml(row);
}

function onBulkInput(i, field, value) {
  const row = _bulkRows[i];
  if (!row || !row.tpEmail || _bulkSaving) return;
  row.counts[field] = Math.max(0, parseInt(value, 10) || 0);
  row.dirty = true;
  if (row.status === 'saved' || row.status === 'failed') {
    row.status = 'idle';
    row.error  = null;
  }
  _repaintBulkRow(i);
}

async function onBulkWeekChange(value) {
  if (_bulkSaving || !value) return;
  const sunday = getWeekEnding(value);
  const input  = document.getElementById('bulk-week-ending');
  if (_bulkRows.some(r => r.dirty)) {
    const go = await confirmModal({
      title:        'Discard unsaved changes?',
      message:      'This grid has activity you have not saved yet. Loading another week will discard it.',
      confirmLabel: 'Discard and load',
      cancelLabel:  'Stay here',
      danger:       true,
    });
    if (!go) {
      if (input) input.value = _bulkWeekEnding;  // put the control back
      return;
    }
  }
  await renderBulkActivityPage(sunday);
}

// N-006 precedent: concurrent saves duplicated rows there, and the same
// failure mode is available here once per role. Every control that can start
// or alter a save is disabled for the duration, and re-enabled in a finally.
function _setBulkControlsDisabled(disabled) {
  document.querySelectorAll('#main-content .bulk-grid-input').forEach(el => {
    const tr = el.closest('tr');
    // An unassigned row's inputs are permanently disabled — never re-enable them.
    if (!disabled && tr && tr.classList.contains('bulk-row--unassigned')) return;
    el.disabled = disabled;
  });
  const wk = document.getElementById('bulk-week-ending');
  if (wk) wk.disabled = disabled;
  const cancel = document.getElementById('bulk-cancel');
  if (cancel) cancel.disabled = disabled;
}

function _bulkFieldsFor(row) {
  const fields = {
    ProjectIDLookupId: parseInt(row.projectId, 10),
    RoleIDLookupId:    parseInt(row.roleId, 10),
    TalentPartner:     row.tpEmail,
    // The year is read off the day string itself, not via new Date().
    // _bulkWeekEnding IS the calendar day; re-parsing it into a Date and
    // asking for a local year is the exact shape that shifts a boundary date
    // by a day under BST.
    Yeare:             Number(_bulkWeekEnding.slice(0, 4)),
    WeekNumber:        getISOWeek(_bulkWeekEnding),
    WeekEndingDate:    isoDate(_bulkWeekEnding),
    SubmittedAt:       new Date().toISOString(),
  };
  BULK_COUNT_FIELDS.forEach(f => {
    fields[f.writeKey] = Number(row.counts[f.readKey]) || 0;
  });
  return fields;
}

async function saveBulkActivity() {
  if (_bulkSaving) return;
  const toSave = _bulkRows.filter(r => r.dirty && r.tpEmail);
  if (!toSave.length) {
    toast('No changes to save.', { type: 'info' });
    return;
  }

  _bulkSaving = true;
  const btn = document.getElementById('bulk-save');
  setButtonLoading(btn);
  _setBulkControlsDisabled(true);

  let ok = 0, failed = 0, withHires = 0;
  try {
    // Sequential, not Promise.all: SharePoint throttles concurrent writes, and
    // a partial failure is only comprehensible if the rows went in order.
    for (const row of toSave) {
      const i = _bulkRows.indexOf(row);
      row.status = 'saving';
      row.error  = null;
      _repaintBulkRow(i);
      try {
        const fields = _bulkFieldsFor(row);
        if (row.existingId) {
          await updateItem('WeeklyActivity', row.existingId, fields);
        } else {
          const created = await createItem('WeeklyActivity', fields);
          // Keep the new id so an immediate re-save updates this row rather
          // than creating a second record for the same role and week.
          if (created && created.id) row.existingId = created.id;
        }
        row.status = 'saved';
        row.dirty  = false;
        ok++;
        if (Number(row.counts.Hires) > 0) withHires++;
      } catch (e) {
        // Stays dirty on purpose: the row keeps what was typed and can be
        // re-saved without touching the rows that already succeeded.
        row.status = 'failed';
        row.error  = e.message;
        failed++;
      }
      _repaintBulkRow(i);
    }
  } finally {
    _bulkSaving = false;
    clearButtonLoading(btn);
    _setBulkControlsDisabled(false);
  }

  // Persistent (duration 0) on any failure — a partial save must not scroll
  // past before it is read. Stay on the grid either way, so failed rows
  // remain visible and re-savable.
  if (failed && ok) {
    toast(`${ok} saved, ${failed} failed — see the rows marked in red.`, { type: 'error', duration: 0 });
  } else if (failed) {
    toast(failed === 1 ? 'Not saved — the row failed.' : 'Nothing saved — all rows failed.', { type: 'error', duration: 0 });
  } else {
    toast(`Logged activity for ${ok} role${ok === 1 ? '' : 's'}.`, { type: 'success' });
  }
  // The single-role form offers to record a placement when Hires > 0. One
  // modal per hiring row would be unusable in a batch, so the bulk grid
  // reminds once instead. Deliberate divergence, not a regression.
  if (ok && withHires) {
    toast('One or more hires logged — remember to record the placements.', { type: 'info', duration: 8000 });
  }
}
