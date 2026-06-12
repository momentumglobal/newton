// js/survey-app.js — Survey respondent flow

const SurveyApp = (() => {

  let _run        = null;
  let _questions  = [];
  let _current    = 0;
  let _answers    = {};  // { [questionId]: answerValue }
  let _uuid       = null;
  let _user       = null;

  // ── Init ────────────────────────────────────────────────────────────

  async function init() {
    if (!isSignedIn()) {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app-shell').style.display = 'none';
      return;
    }
    _user = getCurrentUser();
    if (!_user) return;

    const role = await getEffectiveRole(_user.email);

    // Access control — TP and DM only
    if (!surveyCanAccess(role)) {
      window.location.href = 'index.html';
      return;
    }

    // Show app shell
    document.getElementById('app-shell').style.display = 'block';
    document.getElementById('login-screen').style.display = 'none';

    // Load active run
    _run = await getActiveSurveyRun();
    if (!_run) {
      _renderNoActiveSurvey();
      return;
    }

    // Check if already completed
    const done = await hasCompletedSurvey(_run.id, _user.email);
    if (done) {
      window.location.href = 'index.html';
      return;
    }

    // Load questions
    _questions = await getSurveyQuestions(_run.TemplateID);
    if (!_questions.length) {
      _renderNoActiveSurvey();
      return;
    }

    // UUID — reuse from session if resuming a draft
    const draftKey = _draftKey();
    const draft = _loadDraft(draftKey);
    _uuid = sessionStorage.getItem('newton_survey_uuid') || crypto.randomUUID();
    sessionStorage.setItem('newton_survey_uuid', _uuid);

    if (draft) {
      _answers  = draft.answers  || {};
      _current  = draft.current  || 0;
    }

    _renderQuestion();
  }

  // ── Draft helpers ───────────────────────────────────────────────────

  function _draftKey() {
    return `newton_survey_draft_${_run.id}`;
  }

  function _saveDraft() {
    sessionStorage.setItem(_draftKey(), JSON.stringify({
      answers: _answers,
      current: _current,
    }));
  }

  function _loadDraft(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function _clearDraft() {
    sessionStorage.removeItem(_draftKey());
    sessionStorage.removeItem('newton_survey_uuid');
  }

  // ── Renderers ───────────────────────────────────────────────────────

  function _renderNoActiveSurvey() {
    document.getElementById('survey-container').innerHTML = `
      <div class="survey-page">
        <div class="survey-card">
          <p class="survey-empty">There are no active surveys at the moment.</p>
          <a href="index.html" class="btn-primary">Return to Newton OS</a>
        </div>
      </div>`;
    lucide.createIcons();
  }

  function _renderQuestion() {
    const q     = _questions[_current];
    const total = _questions.length;
    const pct   = Math.round((_current / total) * 100);
    const saved = _answers[q.id];

    const container = document.getElementById('survey-container');
    container.innerHTML = `
      <div class="survey-page">
        <div class="survey-header">
          <img src="momentum-symbol.png" alt="Newton" class="survey-logo">
          <span class="survey-title">${_escHtml(_run.Title || 'Survey')}</span>
        </div>
        <div class="survey-progress-bar">
          <div class="survey-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="survey-card">
          <p class="survey-counter">Question ${_current + 1} of ${total}</p>
          <h2 class="survey-question-text">${_escHtml(q.QuestionText)}${q.IsRequired ? ' <span class="survey-required">*</span>' : ''}</h2>
          <div class="survey-answer-area" id="answer-area">
            ${_renderAnswerInput(q, saved)}
          </div>
          <div class="survey-actions">
            ${_current > 0 ? '<button class="btn-secondary" onclick="SurveyApp.prev()">Back</button>' : ''}
            <button class="btn-primary" id="btn-next" onclick="SurveyApp.next()" ${q.IsRequired && !saved ? 'disabled' : ''}>
              ${_current === total - 1 ? 'Submit' : 'Next'}
            </button>
          </div>
        </div>
      </div>`;
    lucide.createIcons();
    _bindAnswerEvents(q);
  }

  function _renderAnswerInput(q, saved) {
    if (q.QuestionType === 'Rating') {
      const min = q.ScaleMin ?? CONFIG.SURVEY.RATING_SCALE_MIN;
      const max = q.ScaleMax ?? CONFIG.SURVEY.RATING_SCALE_MAX;
      const btns = [];
      for (let i = min; i <= max; i++) {
        const active = saved == i ? ' survey-rating-btn--active' : '';
        btns.push(`<button class="survey-rating-btn${active}" data-value="${i}" onclick="SurveyApp.selectRating(this, '${q.id}')">${i}</button>`);
      }
      return `
        <div class="survey-rating-row">${btns.join('')}</div>
        <div class="survey-rating-labels">
          <span>${_escHtml(q.ScaleMinLabel || 'Low')}</span>
          <span>${_escHtml(q.ScaleMaxLabel || 'High')}</span>
        </div>`;
    }

    if (q.QuestionType === 'SingleChoice') {
      const options = _parseOptions(q.Options);
      return options.map(opt => `
        <label class="survey-choice-label">
          <input type="radio" name="q_${q.id}" value="${_escHtml(opt)}" ${saved === opt ? 'checked' : ''}>
          ${_escHtml(opt)}
        </label>`).join('');
    }

    if (q.QuestionType === 'MultiChoice') {
      const options  = _parseOptions(q.Options);
      const savedArr = saved ? JSON.parse(saved) : [];
      return options.map(opt => `
        <label class="survey-choice-label">
          <input type="checkbox" name="q_${q.id}" value="${_escHtml(opt)}" ${savedArr.includes(opt) ? 'checked' : ''}>
          ${_escHtml(opt)}
        </label>`).join('');
    }

    if (q.QuestionType === 'FreeText') {
      return `<textarea class="survey-textarea" id="freetext_${q.id}" maxlength="1000" 
                oninput="SurveyApp.onFreeText('${q.id}', this.value)"
                placeholder="Type your response here...">${_escHtml(saved || '')}</textarea>
              <div class="survey-char-count" id="cc_${q.id}">${(saved || '').length} / 1000</div>`;
    }

    return '';
  }

  function _bindAnswerEvents(q) {
    if (q.QuestionType === 'SingleChoice') {
      document.querySelectorAll(`input[name="q_${q.id}"]`).forEach(el => {
        el.addEventListener('change', () => {
          _answers[q.id] = el.value;
          _saveDraft();
          _updateNextBtn(q);
        });
      });
    }
    if (q.QuestionType === 'MultiChoice') {
      document.querySelectorAll(`input[name="q_${q.id}"]`).forEach(el => {
        el.addEventListener('change', () => {
          const checked = [...document.querySelectorAll(`input[name="q_${q.id}"]:checked`)]
            .map(c => c.value);
          _answers[q.id] = JSON.stringify(checked);
          _saveDraft();
          _updateNextBtn(q);
        });
      });
    }
  }

  // ── Interaction handlers (public — called from inline HTML) ──────────

  function selectRating(btn, questionId) {
    document.querySelectorAll('.survey-rating-btn').forEach(b => b.classList.remove('survey-rating-btn--active'));
    btn.classList.add('survey-rating-btn--active');
    _answers[questionId] = btn.dataset.value;
    _saveDraft();
    _updateNextBtn(_questions[_current]);
  }

  function onFreeText(questionId, value) {
    _answers[questionId] = value;
    const cc = document.getElementById(`cc_${questionId}`);
    if (cc) cc.textContent = `${value.length} / 1000`;
    _saveDraft();
    _updateNextBtn(_questions[_current]);
  }

  function _updateNextBtn(q) {
    const btn = document.getElementById('btn-next');
    if (!btn) return;
    const answered = !!_answers[q.id] && _answers[q.id] !== '[]';
    btn.disabled = q.IsRequired && !answered;
  }

  async function next() {
    const q = _questions[_current];
    // Final question — submit
    if (_current === _questions.length - 1) {
      await _submit();
      return;
    }
    _current++;
    _saveDraft();
    _renderQuestion();
  }

  function prev() {
    if (_current > 0) {
      _current--;
      _saveDraft();
      _renderQuestion();
    }
  }

  // ── Submission ──────────────────────────────────────────────────────

  async function _submit() {
    const btn = document.getElementById('btn-next');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

    try {
      // Write one response per question — UUID only, no email
      await Promise.all(_questions.map(q =>
        createSurveyResponse({
          RunID:         _run.id,
          QuestionID:    q.id,
          RespondentUUID: _uuid,
          AnswerValue:   _answers[q.id] ?? '',
        })
      ));

      // Write completion record — email only, no answers
      await createSurveyCompletion(_run.id, _user.email);

      _clearDraft();
      _renderConfirmation();

    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
      const area = document.getElementById('answer-area');
      if (area) area.insertAdjacentHTML('afterend',
        `<p class="survey-error">Something went wrong — please try again. (${err.message})</p>`);
    }
  }

  function _renderConfirmation() {
    document.getElementById('survey-container').innerHTML = `
      <div class="survey-page">
        <div class="survey-header">
          <img src="momentum-symbol.png" alt="Newton" class="survey-logo">
        </div>
        <div class="survey-card survey-card--confirmation">
          <i data-lucide="check-circle" class="survey-confirm-icon"></i>
          <h2>Thank you!</h2>
          <p>Your response has been submitted. All answers are anonymous.</p>
          <a href="index.html" class="btn-primary">Return to Newton OS</a>
        </div>
      </div>`;
    lucide.createIcons();
  }

  // ── Utilities ───────────────────────────────────────────────────────

  function _parseOptions(raw) {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return raw.split('\n').map(s => s.trim()).filter(Boolean); }
  }

  function _escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Boot ────────────────────────────────────────────────────────────

  window.addEventListener('DOMContentLoaded', () => {
    msalInstance.handleRedirectPromise().then(() => {
      init();
    }).catch(e => {
      console.error('MSAL redirect error:', e);
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app-shell').style.display = 'none';
    });
  });

  return { next, prev, selectRating, onFreeText };

})();
