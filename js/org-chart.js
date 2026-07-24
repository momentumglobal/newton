// js/org-chart.js — People module Org Chart page
// Renders a static line-and-box org chart from People/Assignments/LeadershipAccess
// plus two relationship fields: Projects.CSDName and ReportsTo (People + LeadershipAccess).
// Hybrid tree: Leadership (email/ReportsTo) → CSD (People, Level=CSD) →
// Project node (Projects.CSDName) → project-anchored team (Assignments.Customer).
// Bench/unassigned rendered as a separate side pool. See build guide §0–§6.

// ── helpers ────────────────────────────────────────────────────────────
function _ocNorm(s)  { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }
function _ocEmail(s) { return (s || '').toLowerCase().trim(); }
function _ocEsc(s)   { return String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function _ocIsBench(customer) {
  const c = _ocNorm(customer);
  return !c || c === 'bench' || c === 'unassigned';
}

const OC_TYPE_COLOURS = {   // matches Deployment Timeline
  'Embedded':'#2E75B6','CoE':'#2e7d32','Transformation':'#e65100','LCI':'#6a1b9a','Internal':'#888',
};
function _ocTypeColour(t){ return OC_TYPE_COLOURS[t] || '#aaa'; }

// ── page entry ─────────────────────────────────────────────────────────
async function renderOrgChart() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading org chart…</p>';

  const [people, leadership, projectsByCSD, currentAssign] = await Promise.all([
    getPeople(true),                       // active only, sorted by Level
    getLeadershipAccess(),
    getProjectsByCSD(),                    // { csdNameLower: [projectRow,…] }
    getCurrentAssignmentsByEmployee(),     // { EmployeeName: [assignmentRow,…] }
  ]);

  const roots = buildOrgTree({ people, leadership, projectsByCSD, currentAssign });
  const bench = buildBenchPool(people, currentAssign);
  const monthYear = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  main.innerHTML = `
    <div class='page-header'>
      <h2>Org Chart</h2>
      <div style='display:flex;gap:8px'>
        ${['admin','leadership'].includes(_resolvedRole)
          ? `<button class='btn-secondary' onclick='showOrgChartEditForm()'>Edit reporting lines</button>` : ''}
        <button class='print-btn' onclick='exportOrgChartPdf()'>⎙ Export PDF</button>
      </div>
    </div>
    <div id='org-chart-page'>
      <div class='org-print-title'>Momentum Global - Org Chart - ${monthYear}</div>
      <div id='org-chart-canvas'>
        <div id='org-chart-inner'>
          ${renderTreeHtml(roots)}
          ${renderBenchHtml(bench)}
        </div>
      </div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

// ── tree builder ───────────────────────────────────────────────────────
// Returns an array of root nodes. Node = { kind, label, sub, children:[] }.
function buildOrgTree({ people, leadership, projectsByCSD, currentAssign }) {
  const csds = people.filter(p => p.Level === 'CSD');

  // Project node for a given CSD (by display name), with its team hung beneath.
  const personNode = (p) => ({ kind: 'person', label: p.EmployeeName,
    sub: `${p.Level || ''}${p.Location ? ' · ' + p.Location : ''}`, children: [] });

  const projectNode = (proj) => {
    const members = [];
    people.forEach(p => {
      (currentAssign[p.EmployeeName] || []).forEach(a => {
        if (_ocNorm(a.Customer) === _ocNorm(proj.CustomerName)) members.push(p);
      });
    });
    const byName = (a, b) => a.EmployeeName.localeCompare(b.EmployeeName);
    const sdms    = members.filter(p => p.Level === 'SDM').sort(byName);
    const reports = members.filter(p => p.Level !== 'SDM').sort(byName);

    let children;
    if (sdms.length) {
      const sdmNodes = sdms.map(personNode);
      sdmNodes[0].children = reports.map(personNode); // TPs/STPs report into the SDM
      children = sdmNodes;                            // (extra SDMs sit as siblings)
    } else {
      children = reports.map(personNode);             // no SDM → team reports into the bubble
    }
    return { kind: 'project', label: proj.CustomerName,
             sub: proj.ProjectType || 'Project',
             _colour: _ocTypeColour(proj.ProjectType), children };
  };

  // CSD node: children are the projects that CSD owns.
  const csdNode = (csd) => {
    const projs = projectsByCSD[_ocNorm(csd.EmployeeName)] || [];
    return { kind: 'csd', label: csd.EmployeeName,
             sub: `CSD${csd.Location ? ' · ' + csd.Location : ''}`,
             _email: _ocEmail(csd.ReportsTo),
             children: projs.map(projectNode) };
  };

  // Leadership node: children are leaders + CSDs whose ReportsTo == this email.
  const buildLeader = (leader, seen) => {
    const email = _ocEmail(leader.UserEmail);
    if (seen.has(email)) return null;      // loop guard
    seen.add(email);
    const kids = [];
    leadership.filter(l => _ocEmail(l.ReportsTo) === email)
      .forEach(l => { const n = buildLeader(l, seen); if (n) kids.push(n); });
    csds.filter(c => _ocEmail(c.ReportsTo) === email).forEach(c => kids.push(csdNode(c)));
    return { kind: 'leader', label: leader.UserName || leader.UserEmail,
             sub: leader.JobTitle || 'Leadership', children: kids };
  };

  const seen = new Set();
  const roots = [];
  // Top of tree = leaders with blank ReportsTo.
  leadership.filter(l => !_ocEmail(l.ReportsTo))
    .forEach(l => { const n = buildLeader(l, seen); if (n) roots.push(n); });
  // Orphan CSDs (blank ReportsTo, or leader not found) become their own roots.
  csds.filter(c => !_ocEmail(c.ReportsTo) ||
        !leadership.some(l => _ocEmail(l.UserEmail) === _ocEmail(c.ReportsTo)))
    .forEach(c => roots.push(csdNode(c)));
  return roots;
}

function buildBenchPool(people, currentAssign) {
  return people.filter(p => {
    if (p.Level === 'CSD') return false;            // CSDs sit in the tree
    const rows = currentAssign[p.EmployeeName] || [];
    return rows.length === 0 || rows.every(a => _ocIsBench(a.Customer));
  }).sort((a, b) => a.EmployeeName.localeCompare(b.EmployeeName));
}

// ── rendering ──────────────────────────────────────────────────────────
function renderTreeHtml(roots) {
  if (!roots.length) return `<p class='org-empty'>No reporting structure to display yet.</p>`;
  const node = (n) => {
    const style = n._colour
      ? ` style='border-color:${n._colour};background:${n._colour}1A'` : '';
    return `
    <li>
      <div class='org-node org-node--${n.kind}'${style}>
        <div class='org-node__name'>${_ocEsc(n.label)}</div>
        ${n.sub ? `<div class='org-node__sub'>${_ocEsc(n.sub)}</div>` : ''}
      </div>
      ${n.children && n.children.length
        ? `<ul>${n.children.map(node).join('')}</ul>` : ''}
    </li>`;
  };
  return `<div class='org-tree'><ul>${roots.map(node).join('')}</ul></div>`;
}

function renderBenchHtml(bench) {
  if (!bench.length) return '';
  return `
    <div class='org-bench'>
      <div class='org-bench__title'>Bench / Unassigned (${bench.length})</div>
      <div class='org-bench__grid'>
        ${bench.map(p => `
          <div class='org-node org-node--bench'>
            <div class='org-node__name'>${_ocEsc(p.EmployeeName)}</div>
            <div class='org-node__sub'>${_ocEsc(p.Level || '')}${
              p.Location ? ' · ' + _ocEsc(p.Location) : ''}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ── landscape scale-to-fit PDF ─────────────────────────────────────────
function exportOrgChartPdf() {
  const inner = document.getElementById('org-chart-inner');
  if (!inner) return;
  const pageW = 1050, pageH = 600;                  // A4 landscape usable, minus header & title
  const scale = Math.min(1, pageW / inner.scrollWidth, pageH / inner.scrollHeight);
  inner.style.setProperty('--org-print-scale', scale);
  document.body.classList.add('org-printing');
  printPage('Org Chart', true, 'People');
  setTimeout(() => {
    document.body.classList.remove('org-printing');
    inner.style.removeProperty('--org-print-scale');
  }, 1200);
}

// ── in-app edit form: set Projects.CSDName + ReportsTo lines ────────────
async function showOrgChartEditForm() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading…</p>';
  const [people, leadership, projects] = await Promise.all([
    getPeople(true), getLeadershipAccess(), getProjects(true),
  ]);
  const csds = people.filter(p => p.Level === 'CSD');
  const csdOpts = (sel) => `<option value=''>— none —</option>` +
    csds.map(c => `<option value='${_ocEsc(c.EmployeeName)}' ${
      _ocNorm(c.EmployeeName) === _ocNorm(sel) ? 'selected' : ''
    }>${_ocEsc(c.EmployeeName)}</option>`).join('');

  const projRows = projects.map(p => `
    <tr>
      <td>${_ocEsc(p.CustomerName)}</td>
      <td><select data-proj='${p.id}'>${csdOpts(p.CSDName)}</select></td>
    </tr>`).join('');

  // ReportsTo editors for leadership + CSDs (both key upward by leader email).
  const leaderEmails = leadership.map(l => _ocEmail(l.UserEmail));
  const emailOpts = (sel) => `<option value=''>— top of tree —</option>` +
    leadership.map(l => `<option value='${_ocEsc(_ocEmail(l.UserEmail))}' ${
      _ocEmail(l.UserEmail) === _ocEmail(sel) ? 'selected' : ''
    }>${_ocEsc(l.UserName || l.UserEmail)}</option>`).join('');

  const leaderRows = leadership.map(l => `
    <tr>
      <td>${_ocEsc(l.UserName || l.UserEmail)} <span class='org-tag'>Leadership</span></td>
      <td><select data-lead='${l.id}'>${emailOpts(l.ReportsTo)}</select></td>
    </tr>`).join('');
  const csdRows = csds.map(c => `
    <tr>
      <td>${_ocEsc(c.EmployeeName)} <span class='org-tag'>CSD</span></td>
      <td><select data-csd='${c.id}'>${emailOpts(c.ReportsTo)}</select></td>
    </tr>`).join('');

  main.innerHTML = `
    <div class='form-container' style='max-width:760px'>
      <h2>Edit reporting lines</h2>
      <div id='org-edit-error' class='form-error'></div>
      <h3>Project → CSD owner</h3>
      <table class='data-table'><thead><tr><th>Project / customer</th><th>CSD</th></tr></thead>
        <tbody>${projRows}</tbody></table>
      <h3 style='margin-top:20px'>Reports to</h3>
      <table class='data-table'><thead><tr><th>Person</th><th>Reports to</th></tr></thead>
        <tbody>${leaderRows}${csdRows}</tbody></table>
      <div class='form-actions'>
        <button type='button' class='btn-primary' onclick='saveOrgChartEdits(this)'>Save changes</button>
        <button type='button' class='btn-secondary' onclick='navigateToPeople("orgChart")'>Cancel</button>
      </div>
    </div>`;
}

async function saveOrgChartEdits(btn) {
  setButtonLoading(btn);
  try {
    const jobs = [];
    document.querySelectorAll('[data-proj]').forEach(el =>
      jobs.push(updateItem('Projects', el.getAttribute('data-proj'), { CSDName: el.value })));
    document.querySelectorAll('[data-lead]').forEach(el =>
      jobs.push(updateItem('LeadershipAccess', el.getAttribute('data-lead'), { ReportsTo: el.value })));
    document.querySelectorAll('[data-csd]').forEach(el =>
      jobs.push(updateItem('People', el.getAttribute('data-csd'), { ReportsTo: el.value })));
    await Promise.all(jobs);
    navigateToPeople('orgChart');
  } catch (e) {
    clearButtonLoading(btn);
    const err = document.getElementById('org-edit-error');
    if (err) { err.textContent = `Error saving: ${e.message}`; err.style.display = 'block'; }
  }
}
