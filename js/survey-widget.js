// js/survey-widget.js - survey widget and survey-closing notification on the home page.
// Split out of js/home.js by N-323. Home-only: the engagement files load on
// people.html with api-engagement.js and must not be pulled onto the home page.
// Uses getActiveSurveyRun / hasCompletedSurvey (api.js), notifications.js, utils.js.
// Called from initHome() in js/home.js. Loaded on index.html only, before home.js.

async function initSurveyWidget(email) {
  const run = await getActiveSurveyRun();
  if (!run) return;

  const completed = await hasCompletedSurvey(run.id, email);
  if (completed) return;

  // N-131: whole CALENDAR days, not a millisecond subtraction. Both sides
  // are UTC-midnight Dates for a calendar day, so this is exact and has no
  // time-of-day component — with OpenDate now stored at midday UTC, the old
  // ms arithmetic would have returned one day fewer for part of every day
  // and fired the reminder late.
  const daysSince  = Math.floor(
    (utcDateOnly(localDayISO()) - utcDateOnly(run.OpenDate)) / 86400000);
  const isReminder = daysSince >= CONFIG.SURVEY.REMINDER_DAY;

  const slot = document.getElementById('survey-widget-slot');
  if (!slot) return;

  slot.innerHTML = `
    <div class="survey-widget${isReminder ? ' survey-widget--reminder' : ''}">
      ${isReminder ? '<span class="survey-widget-badge">Reminder</span>' : ''}
      <div class="survey-widget-title">${escHtml(run.Title || 'Team Survey')}</div>
      <div class="survey-widget-desc">${isReminder
        ? escHtml(CONFIG.SURVEY.WIDGET_DESC_REMINDER)
        : escHtml(CONFIG.SURVEY.WIDGET_DESC)}</div>
      <a href="survey.html" class="survey-widget-cta">Start Survey</a>
    </div>`;
  lucide.createIcons();
}

async function notifySurveyClosing() {
  const run = await getActiveSurveyRun();
  if (run && run.CloseDate) {
    // N-131: a run closing on the 20th is open THROUGH the 20th, so count
    // to the END of the close date, not 00:00 on it as before. No 'Z' on the
    // string - a date-time without an offset parses as LOCAL, which is what
    // "end of the close date where the user is" means. Appending 'Z' would
    // make it 01:00 the next morning during BST.
    const closesAt = new Date(spDateIn(run.CloseDate) + 'T23:59:59');
    const hrsLeft  = (closesAt - Date.now()) / 3600000;
    if (hrsLeft > 0 && hrsLeft <= 48) {
      await fireNotification({ triggerType:'surveyClose',
        triggerKey:`surveyclose:${run.id}`, tone:'attention',
        deepLink:'people.html#engagement',
        body:`Pulse survey closes in ${Math.round(hrsLeft)}h`,
        recipients: await getCcRecipients() });
    }
  }
}