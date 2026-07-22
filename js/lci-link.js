// js/lci-link.js — LCI v2 step 11: link a Won model to a CoE project and
// generate CoE Hiring Plan rows (one CoEPlanRow per individual hire).
// One-time generate: the plan is delivery source of truth afterwards.
// Loaded after lci-pages.js. Admin/Leadership only (gated in lci-pages actions).

// isoDate() lives in forms.js, which the Sales page does not load. Shim it
// here (identical implementation) rather than pulling in all of forms.js.
if (typeof isoDate === 'undefined') {
  window.isoDate = function (s) {
    if (!s) return null;
    const match = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] + 'T12:00:00Z' : null;
  };
}

// ── Date maths (integer-only; never ISO round-trip — BST gotcha) ─────

// First calendar day of the model's month index N (0 = M1).
// Returns a Date at local midnight.
function _lciHireMonthDate(model, monthIdx) {
  const [y, m] = String(model.StartMonth).split('-').map(Number); // m = 1..12
  const total = (m - 1) + monthIdx;
  return new Date(y + Math.floor(total / 12), total % 12, 1);
}

// Monday on/before a date (mirror of coeMonday in coe-plan.js, kept local
// so this file doesn't depend on coe-plan.js being loaded on the Sales page).
function _lciMonday(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

// 'YYYY-MM-DD' from a Date, built from integer parts (no toISOString).
function _lciDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Open Date for a hire landing in monthIdx: offer accepted = end of
// Recruitment = start of the hire month; Open Date = that Monday minus
// recruitmentWeeks. Uses plan defaults (model NoticeMonths NOT reconciled).
function _lciOpenDateForHire(model, monthIdx) {
  const rWeeks = CONFIG.COE_PHASE_DEFAULTS.recruitmentWeeks;
  const hireMonday = _lciMonday(_lciHireMonthDate(model, monthIdx));
  hireMonday.setDate(hireMonday.getDate() - rWeeks * 7);
  return _lciDateStr(hireMonday); // isoDate() adds the T12:00:00Z on write
}

// Expand coe rows → one plan-row payload per hire. Pure; returns array.
function lciExpandToPlanRows(model, rows, projectId) {
  const horizon = Number(model.HorizonMonths);
  const out = [];
  let sort = 0;
  for (const r of rows.filter(x => x.RowType === 'coe')) {
    const hires = lciMonthValues(r, horizon);
    for (let mi = 0; mi < horizon; mi++) {
      const n = hires[mi] || 0;
      for (let k = 0; k < n; k++) {
        out.push({
          Title:     n > 1 ? `${r.Title || 'Role'} #${k + 1}` : (r.Title || 'Role'),
          ProjectID: Number(projectId),
          OpenDate:  isoDate(_lciOpenDateForHire(model, mi)),
          SortOrder: sort++,
          // TalentPartner + phase-week overrides left blank → plan defaults
        });
      }
    }
  }
  return out;
}

// ── Link modal ───────────────────────────────────────────────────────

async function openLCILinkModal(modelId) {
  const m = (_lciModelsCache || []).find(x => String(x.id) === String(modelId));
  if (!m) return;
  if (m.Status !== 'Won') {
    alert('Only models with status "Won" can be linked to a project.');
    return;
  }
  const main = document.getElementById('main-content');
  // Lightweight overlay appended to the current page
  let host = document.getElementById('lci-link-host');
  if (!host) { host = document.createElement('div'); host.id = 'lci-link-host'; document.body.appendChild(host); }
  host.innerHTML = '<div class="lci-modal-overlay"><div class="lci-modal-card">Loading projects…</div></div>';

  try {
    const projects = (await getProjects()).filter(p => p.ProjectType === 'CoE');
    const alreadyLinked = m.ProjectID
      ? projects.find(p => String(p.id) === String(m.ProjectID)) : null;
    const opts = projects.length
      ? projects.map(p => `<option value="${p.id}"${String(p.id) === String(m.ProjectID) ? ' selected' : ''}>${p.CustomerName || p.Title || ('Project ' + p.id)}</option>`).join('')
      : '';

    host.innerHTML = `
      <div class="lci-modal-overlay" onclick="if(event.target===this)closeLCILink()">
        <div class="lci-modal-card">
          <h3 style="margin:0 0 16px;color:#1B3A5C">Link "${m.Title}" to a CoE Project</h3>
          ${projects.length ? `
            <div class="form-group">
              <label>CoE Project</label>
              <select class="form-control" id="lci-link-project">${opts}</select>
            </div>
            <p style="font-size:12px;color:#888">
              ${alreadyLinked ? `Currently linked to <strong>${alreadyLinked.CustomerName || alreadyLinked.Title}</strong>. ` : ''}
              Generating creates one hiring-plan row per hire. Phase lengths use plan defaults (recruitment/notice/onboarding), not the model's notice period.
            </p>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
              <button class="btn-secondary" onclick="closeLCILink()">Cancel</button>
              <button class="btn-secondary" id="lci-link-save-btn" onclick="saveLCILink(${m.id})">Save Link</button>
              <button class="btn-primary" id="lci-link-gen-btn" onclick="generateLCIPlan(${m.id})">Save & Generate Plan</button>
            </div>`
          : `<p style="color:#888">No CoE-type projects found. Set a project's <em>ProjectType</em> to "CoE" first.</p>
             <div style="display:flex;justify-content:flex-end;margin-top:20px"><button class="btn-secondary" onclick="closeLCILink()">Close</button></div>`}
        </div>
      </div>`;
  } catch (e) {
    host.innerHTML = `<div class="lci-modal-overlay" onclick="closeLCILink()"><div class="lci-modal-card"><p style="color:red">Error loading projects: ${e.message}</p></div></div>`;
  }
}

function closeLCILink() {
  const host = document.getElementById('lci-link-host');
  if (host) host.innerHTML = '';
}

function _lciSelectedProjectId() {
  return document.getElementById('lci-link-project')?.value;
}

async function saveLCILink(modelId) {
  const pid = _lciSelectedProjectId();
  if (!pid) return;
  const btn = document.getElementById('lci-link-save-btn');
  setButtonLoading(btn);
  try {
    await updateLCIModel(modelId, { ProjectID: Number(pid) });
    const cached = (_lciModelsCache || []).find(x => String(x.id) === String(modelId));
    if (cached) cached.ProjectID = Number(pid);
    closeLCILink();
    await renderLCIModelsPage();
  } catch (e) {
    clearButtonLoading(btn);
    alert('Error saving link: ' + e.message);
  }
}

async function generateLCIPlan(modelId) {
  const pid = _lciSelectedProjectId();
  if (!pid) return;
  const btn = document.getElementById('lci-link-gen-btn');
  setButtonLoading(btn, 'Working…');
  try {
    // Fetch rows for the model + any existing plan rows on the project
    const [rows, existing] = await Promise.all([getLCIRows(modelId), getCoEPlanRows(pid)]);
    const model = (_lciModelsCache || []).find(x => String(x.id) === String(modelId))
                  || await getLCIModelById(modelId);
    const payloads = lciExpandToPlanRows(model, rows, pid);

    if (!payloads.length) {
      clearButtonLoading(btn);
      alert('This model has no hires to generate.');
      return;
    }
    if (existing.length) {
      const ok = confirm(`This project already has ${existing.length} hiring-plan row(s). Add ${payloads.length} more from "${model.Title}"? (Existing rows are kept — cancel to abort.)`);
      if (!ok) { clearButtonLoading(btn); return; }
    } else {
      const ok = confirm(`Create ${payloads.length} hiring-plan row(s) in the linked project from "${model.Title}"?`);
      if (!ok) { clearButtonLoading(btn); return; }
    }

    // Persist link, then create rows sequentially (matches v1 save pattern)
    await updateLCIModel(modelId, { ProjectID: Number(pid) });
    const cached = (_lciModelsCache || []).find(x => String(x.id) === String(modelId));
    if (cached) cached.ProjectID = Number(pid);

    let done = 0;
    for (const p of payloads) {
      await createCoEPlanRow(p);
      done++;
      btn.textContent = `Working… ${done}/${payloads.length}`;
    }

    closeLCILink();
    await renderLCIModelsPage();
    alert(`Created ${done} hiring-plan row(s). Open the project's Hiring Plan (Reporting module) to assign Talent Partners.`);
  } catch (e) {
    clearButtonLoading(btn);
    alert('Error generating plan: ' + e.message);
  }
}
