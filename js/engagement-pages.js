// js/engagement-pages.js — Engagement tab: results dashboard and trends view

async function renderEngagementPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = dashboardSkeleton(4);

  const [runs, templates] = await Promise.all([
    getSurveyRuns(),
    getSurveyTemplates(),
  ]);

  // Sort runs newest first
  const sorted = runs.slice().sort((a, b) => new Date(b.OpenDate) - new Date(a.OpenDate));

  if (!sorted.length) {
    main.innerHTML = _engEmptyState();
    lucide.createIcons();
    return;
  }

  // Default to most recent closed run, fall back to most recent active
  const defaultRun = sorted.find(r => r.Status === 'Closed') || sorted[0];

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Engagement</h1>
      ${roleCan(_resolvedRole, 'engagementAdmin') ? `
        <button class="btn-primary"${act('openActivateRunModal')}>
          <i data-lucide="play-circle"></i> Activate Run
        </button>` : ''}
    </div>

    <div class="eng-controls">
      <div class="eng-run-selector-wrap">
        <label class="eng-label">Survey Run</label>
        <select class="eng-run-selector" id="eng-run-select"${actOn('change', 'engSwitchRun', ACT_VALUE)}>
          ${sorted.map(r => `
            <option value="${r.id}" ${r.id === defaultRun.id ? 'selected' : ''}>
              ${_escEngHtml(r.Title || r.id)} — ${_escEngHtml(r.Status)}
            </option>`).join('')}
        </select>
      </div>
      ${roleCan(_resolvedRole, 'engagementAdmin') ? `
        <button class="btn-secondary"${act('openManageTemplateModal')}>
          <i data-lucide="settings"></i> Manage Template
        </button>` : ''}
    </div>

    <div class="eng-tab-strip">
      <button class="eng-tab eng-tab--active" id="tab-summary"${act('engSwitchTab', 'summary')}>Summary</button>
      <button class="eng-tab" id="tab-trends"${act('engSwitchTab', 'trends')}>Trends</button>
    </div>

    <div id="eng-content"></div>`;

  lucide.createIcons();
  await engLoadRun(defaultRun.id, runs, templates);
}

// ── Run loader ───────────────────────────────────────────────────────

async function engLoadRun(runId, runs, templates) {
  const content = document.getElementById('eng-content');
  content.innerHTML = skeletonPanel(6);

  const run = runs.find(r => r.id == runId);
  if (!run) { content.innerHTML = '<p>Run not found.</p>'; return; }

  const [questions, responses, completionCount] = await Promise.all([
    getSurveyQuestions(run.TemplateID),
    getSurveyResponses(run.id),
    getSurveyCompletionCount(run.id),
  ]);

  const eligible = run.EligibleCount || 0;
  const responsePct = eligible > 0 ? Math.round((completionCount / eligible) * 100) : 0;

  // Store for tab switching
  window._engState = { run, runs, templates, questions, responses, completionCount, eligible, responsePct };

  engRenderSummary();
}

// ── Tab switching ────────────────────────────────────────────────────

function engSwitchTab(tab) {
  document.querySelectorAll('.eng-tab').forEach(t => t.classList.remove('eng-tab--active'));
  document.getElementById(`tab-${tab}`)?.classList.add('eng-tab--active');
  if (tab === 'summary') engRenderSummary();
  if (tab === 'trends')  engRenderTrends();
}

async function engSwitchRun(runId) {
  const { runs, templates } = window._engState;
  await engLoadRun(runId, runs, templates);
}

// ── Summary tab ──────────────────────────────────────────────────────

function engRenderSummary() {
  const { run, questions, responses, completionCount, eligible, responsePct } = window._engState;
  const content = document.getElementById('eng-content');

  const prevRun   = _engGetPrevRun();
  const prevResps = prevRun ? window._engPrevResponses || [] : [];

  content.innerHTML = `
    <div class="eng-rate-banner">
      <span class="eng-rate-number">${completionCount}</span>
      <span class="eng-rate-label"> of ${eligible} responded</span>
      <span class="eng-rate-pct">${responsePct}%</span>
      ${run.Status === 'Active' ? '<span class="eng-status-badge eng-status-badge--active">Active</span>' : ''}
      ${run.Status === 'Closed' && _resolvedRole === 'admin' ? '' : ''}
      ${run.Status === 'Active' && roleCan(_resolvedRole, 'engagementAdmin')
        ? `<button class="btn-secondary btn--sm"${act('engCloseRun', String(run.id))}>Close Run</button>`
        : ''}
      ${roleCan(_resolvedRole, 'engagementResults')
        ? `<button class="btn-secondary btn--sm"${act('engExportPDF')}>
            <i data-lucide="download"></i> Export Results
           </button>`
        : ''}
    </div>

    <div class="eng-cards" id="eng-cards">
      ${questions.map(q => _engQuestionCard(q, responses, prevResps)).join('')}
    </div>`;

  lucide.createIcons();
}

function _engQuestionCard(q, responses, prevResponses) {
  const qResps = responses.filter(r => r.QuestionID == q.id || r.QuestionIDLookupId == q.id);

  if (q.QuestionType === 'Rating') {
    const vals   = qResps.map(r => parseFloat(r.AnswerValue)).filter(v => !isNaN(v));
    const avg    = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
    const max    = q.ScaleMax ?? CONFIG.SURVEY.RATING_SCALE_MAX;
    const min    = q.ScaleMin ?? CONFIG.SURVEY.RATING_SCALE_MIN;

    // Delta vs previous run
    let deltaHTML = '';
    if (prevResponses.length) {
      const prevVals = prevResponses.filter(r => r.QuestionID == q.id || r.QuestionIDLookupId == q.id)
        .map(r => parseFloat(r.AnswerValue)).filter(v => !isNaN(v));
      if (prevVals.length) {
        const prevAvg = prevVals.reduce((a, b) => a + b, 0) / prevVals.length;
        const delta   = parseFloat(avg) - prevAvg;
        const sign    = delta > 0 ? '+' : '';
        const cls     = delta > 0.1 ? 'eng-delta--up' : delta < -0.1 ? 'eng-delta--down' : 'eng-delta--neutral';
        deltaHTML = `<span class="eng-delta ${cls}">${sign}${delta.toFixed(1)} vs prev</span>`;
      }
    }

    // Distribution bar
    const range  = max - min + 1;
    const counts = Array.from({ length: range }, (_, i) => {
      const v = min + i;
      return vals.filter(x => Math.round(x) === v).length;
    });
    const total  = vals.length || 1;
    const distBar = counts.map((c, i) => {
      const pct = Math.round((c / total) * 100);
      const tone = engDistTone(i, range); // low → high on the status tokens (N-416)
      return `<div class="eng-dist-seg eng-dist-seg--${tone}" style="width:${pct}%;" title="${min + i}: ${c} (${pct}%)"></div>`;
    }).join('');

    return `
      <div class="eng-card">
        <div class="eng-card-header">
          <span class="eng-card-type">Rating</span>
          ${deltaHTML}
        </div>
        <p class="eng-card-question">${_escEngHtml(q.QuestionText)}</p>
        <div class="eng-card-score">${avg} <span class="eng-card-scale">/ ${max}</span></div>
        <div class="eng-dist-bar">${distBar}</div>
        <div class="eng-dist-labels">
          <span>${_escEngHtml(q.ScaleMinLabel || String(min))}</span>
          <span>${_escEngHtml(q.ScaleMaxLabel || String(max))}</span>
        </div>
        <p class="eng-card-n">${vals.length} response${vals.length !== 1 ? 's' : ''}</p>
      </div>`;
  }

  if (q.QuestionType === 'SingleChoice' || q.QuestionType === 'MultiChoice') {
    const options  = _engParseOptions(q.Options);
    const allVals  = q.QuestionType === 'MultiChoice'
      ? qResps.flatMap(r => { try { return JSON.parse(r.AnswerValue); } catch { return [r.AnswerValue]; } })
      : qResps.map(r => r.AnswerValue);
    const total    = allVals.length || 1;
    const bars     = options.map(opt => {
      const count = allVals.filter(v => v === opt).length;
      const pct   = Math.round((count / total) * 100);
      return `
        <div class="eng-choice-row">
          <span class="eng-choice-label">${_escEngHtml(opt)}</span>
          <div class="eng-choice-bar-wrap">
            <div class="eng-choice-bar" style="width:${pct}%"></div>
          </div>
          <span class="eng-choice-pct">${pct}%</span>
        </div>`;
    }).join('');

    return `
      <div class="eng-card">
        <div class="eng-card-header">
          <span class="eng-card-type">${q.QuestionType === 'MultiChoice' ? 'Multi-choice' : 'Choice'}</span>
        </div>
        <p class="eng-card-question">${_escEngHtml(q.QuestionText)}</p>
        <div class="eng-choice-bars">${bars}</div>
        <p class="eng-card-n">${qResps.length} response${qResps.length !== 1 ? 's' : ''}</p>
      </div>`;
  }

  if (q.QuestionType === 'FreeText') {
    const texts = qResps.map(r => r.AnswerValue).filter(Boolean);
    const items = texts.length
      ? texts.map(t => `<li class="eng-freetext-item">${_escEngHtml(t)}</li>`).join('')
      : '<li class="eng-freetext-empty">No responses yet.</li>';

    return `
      <div class="eng-card">
        <div class="eng-card-header">
          <span class="eng-card-type">Free text</span>
        </div>
        <p class="eng-card-question">${_escEngHtml(q.QuestionText)}</p>
        <ul class="eng-freetext-list">${items}</ul>
        <p class="eng-card-n">${texts.length} response${texts.length !== 1 ? 's' : ''}</p>
      </div>`;
  }

  return '';
}

// ── Trends tab ───────────────────────────────────────────────────────

// Trends chart state (N-416). One chart and one theme observer at a time.
let _engChart = null;
let _engChartObserver = null;
let _engPrinting = false;
let _engPrintBound = false;

function _engDisposeChart() {
  if (_engChartObserver) { _engChartObserver.disconnect(); _engChartObserver = null; }
  if (_engChart) { try { _engChart.destroy(); } catch (e) {} _engChart = null; }
}

// Re-reads every chart colour from the current theme's tokens and redraws in place.
// Set the colour properties on Chart.js's resolved option objects; never assign those objects back (breaks the legend).
function _engApplyChartTheme(chart) {
  const o = chart.options;
  const tick = chartCssVar('--text-muted');
  const grid = chartCssVar('--border-subtle');
  ['x', 'y'].forEach(ax => {
    const s = o.scales && o.scales[ax];
    if (!s) return;
    s.ticks.color = tick;
    s.grid.color = grid;
    s.border.color = grid;
  });
  o.plugins.legend.labels.color = chartCssVar('--text-label');
  Object.assign(o.plugins.tooltip, {
    backgroundColor: chartCssVar('--surface-raised'),
    titleColor:      chartCssVar('--text-primary'),
    bodyColor:       chartCssVar('--text-primary'),
    borderColor:     chartCssVar('--border'),
    borderWidth:     1,
  });
  // New dataset objects, not in-place edits: Chart.js caches each point's resolved options and
  // would keep drawing the old theme's dots after a single update.
  chart.data.datasets = chart.data.datasets.map((ds, qi) => {
    const c = chartSeriesColour(qi);
    return Object.assign({}, ds, { borderColor: c, backgroundColor: c, pointBackgroundColor: c, pointBorderColor: c });
  });
  chart.update('none');
}

// The canvas ignores @media print, so a dark-mode print would put light ink on white paper.
// Draw it once from the light tokens, then put the attribute back.
function _engChartForPrint() {
  if (!_engChart || !_engChart.canvas || !_engChart.canvas.isConnected) return;
  const root = document.documentElement;
  const theme = root.getAttribute('data-theme');
  _engPrinting = true;
  if (theme) root.removeAttribute('data-theme');
  _engApplyChartTheme(_engChart);
  if (theme) root.setAttribute('data-theme', theme);
}
function _engChartAfterPrint() {
  _engPrinting = false;
  if (_engChart && _engChart.canvas && _engChart.canvas.isConnected) _engApplyChartTheme(_engChart);
}

async function engRenderTrends() {
  const { runs, questions } = window._engState;
  const content = document.getElementById('eng-content');

  const closedRuns = runs.filter(r => r.Status === 'Closed')
    .sort((a, b) => new Date(a.OpenDate) - new Date(b.OpenDate));

  if (closedRuns.length < 2) {
    content.innerHTML = `<p class="eng-trends-empty">Trends will appear once at least 2 quarterly runs have closed.</p>`;
    return;
  }

  content.innerHTML = `<div class="eng-trends"><canvas id="eng-trends-chart"></canvas></div>`;

  // Fetch responses for all closed runs in parallel
  const allResponses = await Promise.all(closedRuns.map(r => getSurveyResponses(r.id)));

  const ratingQs = questions.filter(q => q.QuestionType === 'Rating');
  const labels   = closedRuns.map(r => r.Title || r.id);

  const datasets = ratingQs.map((q, qi) => {
    const col  = chartSeriesColour(qi);
    const data = closedRuns.map((r, ri) => {
      const vals = allResponses[ri]
        .filter(resp => resp.QuestionID == q.id || resp.QuestionIDLookupId == q.id)
        .map(resp => parseFloat(resp.AnswerValue))
        .filter(v => !isNaN(v));
      return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
    });
    return {
      label:       q.QuestionText.length > 40 ? q.QuestionText.slice(0, 40) + '…' : q.QuestionText,
      data,
      borderColor: col,
      backgroundColor: col,
      pointBackgroundColor: col,
      pointBorderColor: col,
      ...(qi >= 8 ? { borderDash: [6, 4] } : {}), // 9th+ series reuse a hue: dash is the non-colour cue
      tension:     0.3,
      spanGaps:    true,
    };
  });

  // Load Chart.js (vendored, N-289) if not already present
  if (!window.Chart) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = CONFIG.SURVEY.CHARTJS_SRC;
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // N-416: Chart.js is canvas and cannot read var(--…), so colours are resolved from the
  // tokens at draw time and re-applied on a theme change and around printing.
  _engDisposeChart();
  _engChart = new window.Chart(document.getElementById('eng-trends-chart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        y: {
          min: questions[0]?.ScaleMin ?? CONFIG.SURVEY.RATING_SCALE_MIN,
          max: questions[0]?.ScaleMax ?? CONFIG.SURVEY.RATING_SCALE_MAX,
        }
      }
    }
  });
  _engApplyChartTheme(_engChart);
  _engChartObserver = new MutationObserver(() => {
    if (_engPrinting) return;
    if (!_engChart || !_engChart.canvas || !_engChart.canvas.isConnected) { _engDisposeChart(); return; }
    _engApplyChartTheme(_engChart);
  });
  _engChartObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (!_engPrintBound) {
    _engPrintBound = true;
    window.addEventListener('beforeprint', _engChartForPrint);
    window.addEventListener('afterprint', _engChartAfterPrint);
  }
}

// ── Actions ──────────────────────────────────────────────────────────

async function engCloseRun(runId) {
  if (!(await confirmModal({
    message: 'Close this survey run? No further responses will be accepted.',
    confirmLabel: 'Close run',
  }))) return;
  await updateSurveyRun(runId, { Status: 'Closed' });
  await renderEngagementPage();
}

function engExportPDF() {
  printPage('Engagement Results', true, 'People — Engagement');
}

// ── Helpers ──────────────────────────────────────────────────────────

function _engGetPrevRun() {
  if (!window._engState) return null;
  const { run, runs } = window._engState;
  const closed = runs.filter(r => r.Status === 'Closed')
    .sort((a, b) => new Date(b.OpenDate) - new Date(a.OpenDate));
  const idx = closed.findIndex(r => r.id === run.id);
  return closed[idx + 1] || null;
}

function _engParseOptions(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return raw.split('\n').map(s => s.trim()).filter(Boolean); }
}

function _escEngHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _engEmptyState() {
  return `
    <div class="page-header">
      <h1 class="page-title">Engagement</h1>
      ${roleCan(_resolvedRole, 'engagementAdmin') ? `
        <div style="display:inline-flex; gap:8px; align-items:center;">
          <button class="btn-secondary"${act('openManageTemplateModal')}>
            <i data-lucide="settings"></i> Manage Template
          </button>
          <button class="btn-primary"${act('openActivateRunModal')}>
            <i data-lucide="play-circle"></i> Activate Run
          </button>
        </div>` : ''}
    </div>
    ${emptyStateBlock({ icon: 'bar-chart-2', message: 'No survey runs yet. Activate a run to begin collecting responses.' })}`;
}

// N-302c: delegated actions for the Engagement page (js/actions.js). The
// template and run modal openers are registered in engagement-forms.js.
registerActions({
  engSwitchTab,
  engSwitchRun,
  engCloseRun,
  engExportPDF,
});
