// js/sla-rollup.js — SLA roll-up markup (N-385 / DA-5). DOM only: no Graph calls, no rules.
//
// One table for every project's SLA health over the fixed CONFIG.SLA.ROLLUP_PERIOD, shared by
//   - the Command Centre Project Health detail (cc-pages.js, Admin / Leadership), and
//   - the Report Builder "SLA Roll-up" module (dashboard-project-panels.js REPORT_PANELS).
// The model is slaRollupModel() (analytics.js). There is no period toggle and no action here, so
// a toggle elsewhere (sla-panel.js) cannot move it. Project names are plain text: the Command
// Centre has no Project page to open and a printed report cannot link.
// Loaded on command-centre.html and reporting.html, before sla-panel.js. The helpers it calls
// (escHtml, escAttr, ragTextHTML, emptyStateBlock) are call-time dependencies from utils.js / ui-kit.js.

// Status pill from CONFIG.SLA.RAG.LABELS. Also used by sla-panel.js.
function slaPillHtml(rag) {
  const key = Object.prototype.hasOwnProperty.call(CONFIG.SLA.RAG.LABELS, rag) ? rag : 'grey';
  return `<span class="sc-rag-pill sc-rag-pill--${escAttr(key)}">${escHtml(CONFIG.SLA.RAG.LABELS[key])}</span>`;
}

// Heading shared by the table and the unavailable line.
function _slaRollupHeadHtml(title, periodLabel) {
  return `<div class="sla-rollup-head"><h3 class="sla-rollup-heading">${escHtml(title)}</h3>${periodLabel ? `<span class="sla-rollup-period">${escHtml(periodLabel)}</span>` : ''}</div>`;
}

// "2 on track · 1 watch · 1 at risk · 4 projects"; a not-rated count only when there is one.
function _slaRollupCountsText(model) {
  const L = CONFIG.SLA.RAG.LABELS;
  const c = model.counts;
  const parts = [
    `${c.green} ${L.green.toLowerCase()}`,
    `${c.amber} ${L.amber.toLowerCase()}`,
    `${c.red} ${L.red.toLowerCase()}`,
  ];
  if (c.grey) parts.push(`${c.grey} ${L.grey.toLowerCase()}`);
  const n = model.rows.length;
  parts.push(`${n} ${n === 1 ? 'project' : 'projects'}`);
  return parts.join(' · ');
}

// model = slaRollupModel() output. opts.title defaults to "SLA roll-up".
function slaRollupHtml(model, opts = {}) {
  const title = opts.title || 'SLA roll-up';
  if (!model) return slaRollupUnavailableHtml(title);
  const head = _slaRollupHeadHtml(title, model.period.label);
  if (!model.rows.length) {
    return `${head}${emptyStateBlock({ icon: 'inbox', message: 'No projects have SLA targets yet.' })}`;
  }
  const metricHeads = CONFIG.SLA.METRICS.map(m => `<th>${escHtml(m.label)}</th>`).join('');
  const rows = model.rows.map(r => {
    const cells = (r.metrics || []).map(m => `<td>${m.pct === null ? '—' : ragTextHTML(m.rag, m.pct + '%')}</td>`).join('');
    return `
        <tr>
          <td>${escHtml(r.name)}</td>
          <td>${slaPillHtml(r.rag)}</td>
          ${cells}
          <td>${r.ongoingBreaches ? escHtml(String(r.ongoingBreaches)) : '—'}</td>
          <td>${ragTextHTML(r.rag, r.summary)}</td>
        </tr>`;
  }).join('');
  return `${head}
      <p class="sla-rollup-counts">${escHtml(_slaRollupCountsText(model))}</p>
      <div class="table-scroll"><table class="data-table sla-rollup-table">
        <thead><tr><th>Project</th><th>Status</th>${metricHeads}<th>Ongoing breaches</th><th>Problem areas</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

// A failed load: the heading and one line. Never an empty table.
function slaRollupUnavailableHtml(title) {
  return `${_slaRollupHeadHtml(title || 'SLA roll-up', '')}
      <p class="sla-rollup-unavailable">SLA roll-up couldn't be loaded.</p>`;
}