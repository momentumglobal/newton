// js/rejection-intel.js — Rejection Intelligence markup (N-388 / DA-8). DOM only: no Graph calls,
// no rules. Every number, sentence and sample guard arrives already decided in the view models
// from analytics.js (rejectionIntelPageModel, rejectionIntelProjectStrip,
// rejectionIntelReportModel), so a figure that was never put in a model can never be printed here.
//
// Three surfaces share the cell wording below:
//   - the Rejection Intelligence tab on the Rejected Offers page (pages.js),
//   - the insight strip above the Project dashboard's rejection table (dashboard-project.js),
//   - the company-scope Report Builder module (dashboard-project-panels.js REPORT_PANELS).
// Loaded on reporting.html before pages.js. The helpers it calls (escHtml, escAttr, act,
// emptyStateBlock) are call-time dependencies from utils.js / actions.js / ui-kit.js.

// Heading + unavailable line, shared by every surface.
function rejectionIntelUnavailableHtml(title) {
  const t = title || 'Rejection Intelligence';
  return `<div class="rej-intel-head"><h3 class="rej-intel-heading">${escHtml(t)}</h3></div>` +
    `<p class="rej-intel-unavailable checklist-unavailable">Rejection Intelligence couldn't be loaded.</p>`;
}

// The Rejected Offers page's tab bar. tabs = [{ key, label }]; actions are registered in pages.js.
function rejectionsTabBarHtml(active, tabs) {
  const list = tabs || [{ key: 'list', label: 'Rejected offers' }, { key: 'intel', label: 'Rejection Intelligence' }];
  return `<div class="filter-group rej-intel-tabs">` + list.map(t =>
    `<button class="btn-filter${active === t.key ? ' active' : ''}"${act('setRejectionsTab', t.key)}>${escHtml(t.label)}</button>`
  ).join('') + `</div>`;
}

function _rejIntelMoney(ccy, n) {
  return escHtml((ccy ? ccy + ' ' : '') + Number(n).toLocaleString('en-GB'));
}

// "▼ 12% below benchmark", plus "RON 64,750 vs 70,000" for Admin / Leadership. A direction word
// and glyph, never colour alone.
function _rejIntelGapCell(row, model) {
  if (model.benchmarkUnavailable) return 'Benchmark unavailable';
  if (!row.gap) return '—';
  const glyph = row.gap.direction === 'below' ? '▼ ' : row.gap.direction === 'above' ? '▲ ' : '';
  return glyph + escHtml(row.gap.text);
}

function _rejIntelFiguresCell(row, model) {
  if (model.benchmarkUnavailable) return '—';
  if (row.mixedCurrency) return 'Mixed currencies';
  if (!row.figures) return '—';
  const f = row.figures;
  return `${_rejIntelMoney(f.ccy, f.offerMedian)} vs ${escHtml(Number(f.benchMedian).toLocaleString('en-GB'))}`;
}

function _rejIntelReasonsTable(model) {
  const rows = model.reasons.map(r =>
    `<tr><td>${escHtml(r.reason)}</td><td>${escHtml(String(r.n))}</td><td>${r.sharePct === null ? '—' : escHtml(r.sharePct + '%')}</td></tr>`
  ).join('');
  return `<h4 class="rej-intel-sub">Why offers are rejected</h4>
      <div class="table-scroll"><table class="data-table rej-intel-table">
        <thead><tr><th>Reason</th><th>Rejections</th><th>Share</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

function _rejIntelClustersTable(model) {
  const figs = model.includeFigures;
  const rows = model.clusters.map(c => `
        <tr>
          <td>${escHtml(c.label)}</td>
          <td>${escHtml(String(c.n))}</td>
          <td>${c.claim ? escHtml(`${c.topReason} (${c.topSharePct}%)`) : escHtml(`Too few to read (${c.n})`)}</td>
          <td>${_rejIntelGapCell(c, model)}</td>
          ${figs ? `<td>${_rejIntelFiguresCell(c, model)}</td>` : ''}
        </tr>`).join('');
  return `<div class="table-scroll"><table class="data-table rej-intel-table">
        <thead><tr><th>${escHtml(model.dimLabel)}</th><th>Rejections</th><th>Top reason</th><th>Salary vs benchmark</th>${figs ? '<th>Offer vs benchmark (median)</th>' : ''}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

function _rejIntelFunnelTable(model) {
  const f = model.funnel;
  if (!f.rows.length) return `<p class="rej-intel-muted">No pipeline activity in this period.</p>`;
  const heads = f.steps.map(s => `<th>${escHtml(s.from + ' → ' + s.to)}</th>`).join('');
  const rows = f.rows.map(r => {
    const cells = r.steps.map(s => `<td>${s.claim ? escHtml(`${s.ratePct}% (vs ${s.priorPct}%)`) : '—'}</td>`).join('');
    return `
        <tr>
          <td>${escHtml(r.label)}</td>
          <td>${escHtml(String(r.submitted))}</td>
          ${cells}
          <td>${r.worst ? escHtml(r.worst.from + ' → ' + r.worst.to) : '—'}</td>
        </tr>`;
  }).join('');
  return `<h4 class="rej-intel-sub">Where candidates drop out</h4>
      <div class="table-scroll"><table class="data-table rej-intel-table">
        <thead><tr><th>${escHtml(model.dimLabel)}</th><th>Submitted</th>${heads}<th>Weakest step</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

function _rejIntelTotalsText(model) {
  const t = model.totals;
  const parts = [`${t.n} ${t.n === 1 ? 'rejection' : 'rejections'}`];
  if (!model.benchmarkUnavailable) parts.push(`${t.matched} with a salary comparison`);
  if (t.unlinked) parts.push(`${t.unlinked} not linked to a role`);
  return parts.join(' · ');
}

// The sections both the tab and the report print. opts.dimButtons = the tab's dimension switcher.
function _rejIntelSections(model, opts = {}) {
  const note = model.periodNote ? `<p class="rej-intel-muted">${escHtml(model.periodNote)}</p>` : '';
  const counts = `<p class="rej-intel-counts">${escHtml(_rejIntelTotalsText(model))}</p>`;
  if (!model.totals.n) {
    return `${note}${emptyStateBlock({ icon: 'user-x', message: 'No rejections in this period.' })}`;
  }
  return `${counts}${note}${_rejIntelReasonsTable(model)}
      ${opts.dimButtons || ''}
      <h4 class="rej-intel-sub">By ${escHtml(model.dimLabel.toLowerCase())}</h4>
      ${_rejIntelClustersTable(model)}
      ${_rejIntelFunnelTable(model)}`;
}

// The Rejection Intelligence tab body. model = rejectionIntelPageModel(); opts.dim = the active dimension.
function rejectionIntelTabHtml(model, opts = {}) {
  if (!model) return rejectionIntelUnavailableHtml('Rejection Intelligence');
  const dims = [['project', 'Project'], ['location', 'Location'], ['discipline', 'Discipline']];
  const buttons = `<div class="filter-group rej-intel-dims">` + dims.map(([k, l]) =>
    `<button class="btn-filter${opts.dim === k ? ' active' : ''}"${act('setRejectionIntelDim', k)}>${escHtml(l)}</button>`
  ).join('') + `</div>`;
  return `<div class="rej-intel">${_rejIntelSections(model, { dimButtons: model.totals.n ? buttons : '' })}</div>`;
}

// The Report Builder module. model = rejectionIntelReportModel(); opts.title defaults to the heading.
function rejectionIntelReportHtml(model, opts = {}) {
  const title = opts.title || 'Rejection Intelligence';
  if (!model) return rejectionIntelUnavailableHtml(title);
  const head = `<div class="rej-intel-head"><h3 class="rej-intel-heading">${escHtml(title)}</h3>${model.periodLabel ? `<span class="rej-intel-period">${escHtml(model.periodLabel)}</span>` : ''}</div>`;
  return `<div class="rej-intel">${head}${_rejIntelSections(model)}</div>`;
}

// The Project dashboard strip (inner HTML of its slot). '' when there is nothing to say at all.
function rejectionIntelStripHtml(strip) {
  if (!strip || strip.empty) return '';
  const facts = [];
  if (strip.claim && strip.topReason) {
    facts.push(`<li><span class="rej-intel-fact-label">Top reason</span> ${escHtml(`${strip.topReason} (${strip.topSharePct}% of ${strip.n})`)}</li>`);
  }
  if (strip.gap) {
    const glyph = strip.gap.direction === 'below' ? '▼ ' : strip.gap.direction === 'above' ? '▲ ' : '';
    const fig = strip.figures ? ` (${_rejIntelMoney(strip.figures.ccy, strip.figures.offerMedian)} vs ${escHtml(Number(strip.figures.benchMedian).toLocaleString('en-GB'))})` : '';
    facts.push(`<li><span class="rej-intel-fact-label">Offers</span> ${glyph}${escHtml(strip.gap.text)}${fig}</li>`);
  }
  if (strip.worstStep) {
    const w = strip.worstStep;
    facts.push(`<li><span class="rej-intel-fact-label">Weakest funnel step</span> ${escHtml(`${w.from} → ${w.to}: ${w.ratePct}% (vs ${w.priorPct}%)`)}</li>`);
  }
  const body = facts.length
    ? `<ul class="rej-intel-facts">${facts.join('')}</ul>`
    : `<p class="rej-intel-muted">Not enough rejections yet to draw conclusions (needs ${escHtml(String(strip.minRejections))}).</p>`;
  return `<div class="dash-panel rej-intel-strip"><div class="rej-intel-head"><h3 class="panel-title">Rejection insight</h3><span class="rej-intel-period">All time</span></div>${body}</div>`;
}