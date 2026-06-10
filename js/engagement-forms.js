// js/engagement-forms.js — Survey builder and run activation modals

// ── Template manager ─────────────────────────────────────────────────

async function openManageTemplateModal() {
  const templates = await getSurveyTemplates();
  const template  = templates.length ? templates[0] : null;
  const questions = template ? await getSurveyQuestions(template.id) : [];

  const overlay = _engFormOverlay(`
    <div class="eng-modal">
      <div class="eng-modal-header">
        <h2>${template ? 'Manage Survey Template' : 'Create Survey Template'}</h2>
        <button class="eng-modal-close" onclick="_closeEngModal()">
          <i data-lucide="x"></i>
        </button>
      </div>

      <div id="eng-template-form-error" class="form-error"></div>

      <form id="eng-template-form" onsubmit="submitTemplateForm(event, ${template?.id || 'null'})">
        <div class="form-group">
          <label>Survey Title *</label>
          <input type="text" name="Title" required value="${_escEngHtml(template?.Title || '')}"
            placeholder="e.g. Q3 2026 Pulse">
        </div>
        <div class="form-group">
          <label>Introduction</label>
          <textarea name="Description" rows="3"
            placeholder="Brief intro shown to respondents before the first question."
          >${_escEngHtml(template?.Description || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Target Audience *</label>
            <select name="TargetAudience">
              ${CONFIG.SURVEY.AUDIENCES.map(a =>
                `<option value="${a}" ${template?.TargetAudience === a ? 'selected' : ''}>${a}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Target Activation Date</label>
            <input type="date" name="TargetDate"
              value="${template?.TargetDate ? template.TargetDate.split('T')[0] : ''}">
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">Save Template</button>
          <button type="button" class="btn-secondary" onclick="_closeEngModal()">Cancel</button>
        </div>
      </form>

      <hr class="eng-modal-divider">

      <div class="eng-questions-section">
        <div class="eng-questions-header">
          <h3>Questions <span class="eng-q-count">(${questions.length})</span></h3>
          ${template ? `<button class="btn-primary btn--sm" onclick="openAddQuestionModal(${template.id})">
            <i data-lucide="plus"></i> Add Question
          </button>` : '<p class="eng-hint">Save the template first, then add questions.</p>'}
        </div>
        <div id="eng-questions-list">
          ${questions.length ? questions.map((q, i) => _questionRow(q, i, questions.length)).join('') : '<p class="eng-hint">No questions yet.</p>'}
        </div>
      </div>
    </div>
  `);

  document.body.appendChild(overlay);
  lucide.createIcons();
}

async function submitTemplateForm(event, editId = null) {
  event.preventDefault();
  const form = document.getElementById('eng-template-form');
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);

  const data = Object.fromEntries(new FormData(form));
  const errEl = document.getElementById('eng-template-form-error');
  errEl.textContent = '';

  try {
    const payload = {
      Title:          data.Title,
      Description:    data.Description || '',
      TargetAudience: data.TargetAudience,
      TargetDate:     data.TargetDate   || undefined,
      CreatedByEmail: getCurrentUser().email,
    };

    if (editId) {
      await updateSurveyTemplate(editId, payload);
    } else {
      await createSurveyTemplate({ ...payload, Status: 'Draft' });
    }

    _closeEngModal();
    await renderEngagementPage();

  } catch (err) {
    errEl.textContent = `Error saving template: ${err.message}`;
    setButtonLoading(btn, false);
  }
}

// ── Question manager ─────────────────────────────────────────────────

function openAddQuestionModal(templateId, existingQuestion = null) {
  const isEdit = !!existingQuestion;
  const q      = existingQuestion || {};

  const overlay = _engFormOverlay(`
    <div class="eng-modal eng-modal--sm">
      <div class="eng-modal-header">
        <h2>${isEdit ? 'Edit Question' : 'Add Question'}</h2>
        <button class="eng-modal-close" onclick="_closeEngModal()">
          <i data-lucide="x"></i>
        </button>
      </div>

      <div id="eng-q-form-error" class="form-error"></div>

      <form id="eng-q-form" onsubmit="submitQuestionForm(event, ${templateId}, ${q.id || 'null'})">
        <div class="form-group">
          <label>Question Type *</label>
          <select name="QuestionType" required onchange="engToggleQTypeFields(this.value)">
            ${CONFIG.SURVEY.QUESTION_TYPES.map(t =>
              `<option value="${t}" ${q.QuestionType === t ? 'selected' : ''}>${t}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Question Text *</label>
          <textarea name="QuestionText" rows="3" required
            placeholder="Enter your question here."
          >${_escEngHtml(q.QuestionText || '')}</textarea>
        </div>

        <div id="eng-rating-fields" style="display:${q.QuestionType === 'Rating' || !q.QuestionType ? 'block' : 'none'}">
          <div class="form-row">
            <div class="form-group">
              <label>Scale Min</label>
              <input type="number" name="ScaleMin" value="${q.ScaleMin ?? CONFIG.SURVEY.RATING_SCALE_MIN}" min="1" max="9">
            </div>
            <div class="form-group">
              <label>Scale Max</label>
              <input type="number" name="ScaleMax" value="${q.ScaleMax ?? CONFIG.SURVEY.RATING_SCALE_MAX}" min="2" max="10">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Min Label</label>
              <input type="text" name="ScaleMinLabel" value="${_escEngHtml(q.ScaleMinLabel || '')}" placeholder="e.g. Strongly Disagree">
            </div>
            <div class="form-group">
              <label>Max Label</label>
              <input type="text" name="ScaleMaxLabel" value="${_escEngHtml(q.ScaleMaxLabel || '')}" placeholder="e.g. Strongly Agree">
            </div>
          </div>
        </div>

        <div id="eng-options-fields" style="display:${['SingleChoice','MultiChoice'].includes(q.QuestionType) ? 'block' : 'none'}">
          <div class="form-group">
            <label>Options <span class="eng-hint">(one per line)</span></label>
            <textarea name="OptionsRaw" rows="5"
              placeholder="Option 1&#10;Option 2&#10;Option 3"
            >${_escEngHtml(_optionsToText(q.Options || ''))}</textarea>
          </div>
        </div>

        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" name="IsRequired" ${q.IsRequired ? 'checked' : ''}>
            Required question
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn-primary">${isEdit ? 'Save Question' : 'Add Question'}</button>
          <button type="button" class="btn-secondary" onclick="_closeEngModal()">Cancel</button>
        </div>
      </form>
    </div>
  `);

  document.body.appendChild(overlay);
  lucide.createIcons();
}

function engToggleQTypeFields(type) {
  document.getElementById('eng-rating-fields').style.display  = type === 'Rating' ? 'block' : 'none';
  document.getElementById('eng-options-fields').style.display = ['SingleChoice','MultiChoice'].includes(type) ? 'block' : 'none';
}

async function submitQuestionForm(event, templateId, editId = null) {
  event.preventDefault();
  const form  = document.getElementById('eng-q-form');
  const btn   = form.querySelector('[type=submit]');
  const errEl = document.getElementById('eng-q-form-error');
  errEl.textContent = '';
  setButtonLoading(btn);

  const data = Object.fromEntries(new FormData(form));
  const isRequired = form.querySelector('[name=IsRequired]')?.checked || false;

  // Validate options for choice questions
  if (['SingleChoice','MultiChoice'].includes(data.QuestionType)) {
    const opts = _textToOptions(data.OptionsRaw || '');
    if (opts.length < 2) {
      errEl.textContent = 'Choice questions require at least 2 options.';
      setButtonLoading(btn, false);
      return;
    }
  }

  try {
    const payload = {
      TemplateID:   templateId,
      QuestionText: data.QuestionText,
      QuestionType: data.QuestionType,
      ScaleMin:     data.QuestionType === 'Rating' ? parseInt(data.ScaleMin) : undefined,
      ScaleMax:     data.QuestionType === 'Rating' ? parseInt(data.ScaleMax) : undefined,
      ScaleMinLabel: data.QuestionType === 'Rating' ? data.ScaleMinLabel : undefined,
      ScaleMaxLabel: data.QuestionType === 'Rating' ? data.ScaleMaxLabel : undefined,
      Options:      ['SingleChoice','MultiChoice'].includes(data.QuestionType)
                      ? JSON.stringify(_textToOptions(data.OptionsRaw))
                      : '',
      IsRequired:   isRequired,
      SortOrder:    editId ? undefined : 999, // new questions go to end; re-sort via up/down
    };

    if (editId) {
      await updateSurveyQuestion(editId, payload);
    } else {
      await createSurveyQuestion(payload);
    }

    _closeEngModal();
    await _refreshQuestionList(templateId);

  } catch (err) {
    errEl.textContent = `Error saving question: ${err.message}`;
    setButtonLoading(btn, false);
  }
}

async function deleteQuestion(questionId) {
  if (!confirm('Delete this question? This cannot be undone.')) return;
  await deleteSurveyQuestion(questionId);
  const templates = await getSurveyTemplates();
  if (templates.length) await _refreshQuestionList(templates[0].id);
}

async function moveQuestion(questionId, direction, questions) {
  const idx     = questions.findIndex(q => q.id == questionId);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= questions.length) return;

  const a = questions[idx];
  const b = questions[swapIdx];
  await Promise.all([
    updateSurveyQuestion(a.id, { SortOrder: b.SortOrder }),
    updateSurveyQuestion(b.id, { SortOrder: a.SortOrder }),
  ]);
  const templates = await getSurveyTemplates();
  if (templates.length) await _refreshQuestionList(templates[0].id);
}

// ── Activate Run modal ───────────────────────────────────────────────

async function openActivateRunModal() {
  const templates = await getSurveyTemplates();
  const template  = templates.length ? templates[0] : null;

  if (!template) {
    alert('No survey template found. Please create a template first.');
    return;
  }

  const questions = await getSurveyQuestions(template.id);
  if (questions.length < 3) {
    alert(`The template needs at least 3 questions before a run can be activated (currently ${questions.length}).`);
    return;
  }

  const today     = new Date().toISOString().split('T')[0];
  const closeDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + CONFIG.SURVEY.DEFAULT_DURATION_DAYS);
    return d.toISOString().split('T')[0];
  })();

  // Count eligible respondents
  const allAssignments = await getItems('UserAssignments');
  const eligible = allAssignments.filter(a =>
    a.AssignedRole === 'talent_partner' || a.AssignedRole === 'delivery_manager'
  ).length;

  const quarter = _currentQuarterLabel();

  const overlay = _engFormOverlay(`
    <div class="eng-modal eng-modal--sm">
      <div class="eng-modal-header">
        <h2>Activate Survey Run</h2>
        <button class="eng-modal-close" onclick="_closeEngModal()">
          <i data-lucide="x"></i>
        </button>
      </div>

      <div id="eng-activate-error" class="form-error"></div>

      <form id="eng-activate-form" onsubmit="submitActivateRun(event)">
        <div class="form-group">
          <label>Run Label *</label>
          <input type="text" name="RunLabel" required value="${_escEngHtml(quarter)}"
            placeholder="e.g. Q3 2026">
        </div>
        <div class="form-group">
          <label>Template</label>
          <input type="text" disabled value="${_escEngHtml(template.Title)}">
          <input type="hidden" name="TemplateID" value="${template.id}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Open Date</label>
            <input type="date" name="OpenDate" value="${today}">
          </div>
          <div class="form-group">
            <label>Close Date</label>
            <input type="date" name="CloseDate" value="${closeDate}">
          </div>
        </div>
        <p class="eng-hint">${eligible} eligible respondent${eligible !== 1 ? 's' : ''} (TPs and DMs)</p>
        <div class="form-actions">
          <button type="submit" class="btn-primary">Activate Now</button>
          <button type="button" class="btn-secondary" onclick="_closeEngModal()">Cancel</button>
        </div>
      </form>
    </div>
  `);

  document.body.appendChild(overlay);
  lucide.createIcons();
}

async function submitActivateRun(event) {
  event.preventDefault();
  const form  = document.getElementById('eng-activate-form');
  const btn   = form.querySelector('[type=submit]');
  const errEl = document.getElementById('eng-activate-error');
  errEl.textContent = '';
  setButtonLoading(btn);

  const data = Object.fromEntries(new FormData(form));

  // Check no run is already active
  const existing = await getActiveSurveyRun();
  if (existing) {
    errEl.textContent = 'A run is already active. Close it before activating a new one.';
    setButtonLoading(btn, false);
    return;
  }

  try {
    const allAssignments = await getItems('UserAssignments');
    const eligible = allAssignments.filter(a =>
      a.AssignedRole === 'talent_partner' || a.AssignedRole === 'delivery_manager'
    ).length;

    await createSurveyRun({
      RunLabel:      data.RunLabel,
      TemplateID:    data.TemplateID,
      OpenDate:      data.OpenDate,
      CloseDate:     data.CloseDate,
      EligibleCount: eligible,
    });

    _closeEngModal();
    await renderEngagementPage();

  } catch (err) {
    errEl.textContent = `Error activating run: ${err.message}`;
    setButtonLoading(btn, false);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────
async function _refreshQuestionList(templateId) {
  const questions = await getSurveyQuestions(templateId);
  window._engQuestions = questions;
  const listEl = document.getElementById('eng-questions-list');
  const countEl = document.querySelector('.eng-q-count');
  if (listEl) {
    listEl.innerHTML = questions.length
      ? questions.map((q, i) => _questionRow(q, i, questions.length)).join('')
      : '<p class="eng-hint">No questions yet.</p>';
    lucide.createIcons();
  }
  if (countEl) countEl.textContent = `(${questions.length})`;
}

function _questionRow(q, index, total) {
  return `
    <div class="eng-q-row" id="eng-q-row-${q.id}">
      <div class="eng-q-row-main">
        <span class="eng-q-type-badge">${q.QuestionType}</span>
        <span class="eng-q-text">${_escEngHtml(q.QuestionText)}</span>
        ${q.IsRequired ? '<span class="eng-q-required">Required</span>' : ''}
      </div>
      <div class="eng-q-row-actions">
        <button class="btn-icon" title="Move up" onclick="moveQuestion('${q.id}', 'up', window._engQuestions)"
          ${index === 0 ? 'disabled' : ''}>
          <i data-lucide="chevron-up"></i>
        </button>
        <button class="btn-icon" title="Move down" onclick="moveQuestion('${q.id}', 'down', window._engQuestions)"
          ${index === total - 1 ? 'disabled' : ''}>
          <i data-lucide="chevron-down"></i>
        </button>
        <button class="btn-icon" title="Edit" onclick="openAddQuestionModal(${q.templateId || 'null'}, ${JSON.stringify(q).replace(/"/g, '&quot;')})">
          <i data-lucide="edit-2"></i>
        </button>
        <button class="btn-icon btn-icon--danger" title="Delete" onclick="deleteQuestion('${q.id}')">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    </div>`;
}

function _currentQuarterLabel() {
  const now = new Date();
  const q   = Math.floor(now.getMonth() / 3) + 1;
  return `Q${q} ${now.getFullYear()}`;
}

function _optionsToText(raw) {
  if (!raw) return '';
  try { return JSON.parse(raw).join('\n'); } catch { return raw; }
}

function _textToOptions(raw) {
  return (raw || '').split('\n').map(s => s.trim()).filter(Boolean);
}

function _engFormOverlay(html) {
  const overlay = document.createElement('div');
  overlay.className = 'eng-modal-overlay';
  overlay.id        = 'eng-modal-overlay';
  overlay.innerHTML = html;
  overlay.addEventListener('click', e => {
    if (e.target === overlay) _closeEngModal();
  });
  return overlay;
}

function _closeEngModal() {
  document.getElementById('eng-modal-overlay')?.remove();
}
