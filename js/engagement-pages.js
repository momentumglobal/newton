// js/engagement-pages.js — Engagement tab: results dashboard and trends view

async function renderEngagementPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="page-loading">Loading Engagement...</div>`;

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
      ${_resolvedRole === 'admin' ? `
        <button class="btn-primary" onclick="openActivateRunModal()">
          <i data-lucide="play-circle"></i> Activate Run
        </button>` : ''}
    </div>

    <div class="eng-controls">
      <div class="eng-run-selector-wrap">
        <label class="eng-label">Survey Run</label>
        <select class="eng-run-selector" id="eng-run-select" onchange="engSwitchRun(this.value)">
          ${sorted.map(r => `
            <option value="${r.id}" ${r.id === defaultRun.id ? 'selected' : ''}>
              ${_escEngHtml(r.Title || r.id)} — ${r.Status}
            </option>`).join('')}
        </select>
      </div>
      ${_resolvedRole === 'admin' ? `
        <button class="btn-secondary" onclick="openManageTemplateModal()">
          <i data-lucide="settings"></i> Manage Template
        </button>` : ''}
    </div>

    <div class="eng-tab-strip">
      <button class="eng-tab eng-tab--active" id="tab-summary" onclick="engSwitchTab('summary')">Summary</button>
      <button class="eng-tab" id="tab-trends" onclick="engSwitchTab('trends')">Trends</button>
    </div>

    <div id="eng-content"></div>`;

  lucide.createIcons();
  await engLoadRun(defaultRun.id, runs, templates);
}

// ── Run loader ───────────────────────────────────────────────────────

async function engLoadRun(runId, runs, templates) {
  const content = document.getElementById('eng-content');
  content.innerHTML = `<div class="page-loading">Loading results...</div>`;

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
      ${run.Status === 'Active' && _resolvedRole === 'admin'
        ? `<button class="btn-secondary btn--sm" onclick="engCloseRun('${run.id}')">Close Run</button>`
        : ''}
      ${_resolvedRole === 'admin' || _resolvedRole === 'leadership'
        ? `<button class="btn-secondary btn--sm" onclick="engExportPDF()">
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
      const hue = Math.round(120 * (i / (range - 1))); // red → green
      return `<div class="eng-dist-seg" style="width:${pct}%;background:hsl(${hue},60%,50%);" title="${min + i}: ${c} (${pct}%)"></div>`;
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
    const hue  = Math.round((qi / Math.max(ratingQs.length - 1, 1)) * 240);
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
      borderColor: `hsl(${hue},65%,50%)`,
      backgroundColor: `hsl(${hue},65%,85%)`,
      tension:     0.3,
      spanGaps:    true,
    };
  });

  // Load Chart.js from CDN if not already present
  if (!window.Chart) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  new window.Chart(document.getElementById('eng-trends-chart'), {
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
}

// ── Actions ──────────────────────────────────────────────────────────

async function engCloseRun(runId) {
  if (!confirm('Close this survey run? No further responses will be accepted.')) return;
  await updateSurveyRun(runId, { Status: 'Closed' });
  await renderEngagementPage();
}

function engExportPDF() {
  printPage('Engagement Results', false, 'People — Engagement');
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
      ${_resolvedRole === 'admin' ? `
        <button class="btn-secondary" onclick="openManageTemplateModal()">
          <i data-lucide="settings"></i> Manage Template
        </button>
        <button class="btn-primary" onclick="openActivateRunModal()">
          <i data-lucide="play-circle"></i> Activate Run
        </button>` : ''}
    </div>
    <div class="eng-empty">
      <i data-lucide="bar-chart-2" class="eng-empty-icon"></i>
      <p>No survey runs yet. Activate a run to begin collecting responses.</p>
    </div>`;
}
