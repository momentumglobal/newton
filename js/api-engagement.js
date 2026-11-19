// Employee Engagement survey SharePoint API calls.
// Extracted from api.js by N-237a — single-consumer functions used across
// engagement-forms.js, engagement-pages.js (people.html) and survey-app.js
// (survey.html). Depends on getItems/createItem/updateItem/deleteItem
// (graph-client.js) and getTalentPartnerDisplayMap/filterToActiveTpEmails
// (api-access.js), both loading first (see script order). getSurveyTemplates,
// getActiveSurveyRun, getSurveyQuestions, hasCompletedSurvey and createSurveyRun are
// here too (N-476); this file also loads on index.html for survey-widget.js.

// Eligible respondents for an Engagement survey run = every active employee on
// the Employee Tracker (People list, active, not a placeholder) except the
// levels in CONFIG.SURVEY.EXCLUDED_LEVELS (CSD) and External partners (N-402) — isSurveyEligibleEmployee,
// permissions.js (N-332, Chris 14 Oct 2026). Counts the workforce, not Newton
// logins: UserAssignments is not read, so bench TPs/DMs (N-233) and internal
// staff are counted whether or not they have a role. This is the denominator of
// the response rate; who can actually answer is CONFIG.SURVEY_RESPONDENT_ROLES.
async function getEligibleRespondentCount() {
  const people = await getPeople(true);
  // N-424: staff who have not started yet cannot respond, so they are not in the denominator.
  return people.filter(p => isSurveyEligibleEmployee(p) && isStartedPerson(p)).length;
}

// ── Read ──────────────────────────────────────────────────────────────

async function getSurveyRuns() {
  return getItems("SurveyRuns");
}

async function getSurveyResponses(runId) {
  return getItems("SurveyResponses", `fields/RunID eq '${odataStr(runId)}'`);
}

async function getSurveyCompletionCount(runId) {
  const completions = await getItems("SurveyCompletions", `fields/RunID eq '${odataStr(runId)}'`);
  return completions.length;
}

// ── Write ─────────────────────────────────────────────────────────────

async function createSurveyTemplate(fields) {
  return createItem("SurveyTemplates", {
    Title:          fields.Title,
    Description:    fields.Description   || "",
    TargetAudience: fields.TargetAudience || "All",
    Status:         fields.Status         || "Draft",
    // N-133: isoDate() pins these to T12:00:00Z. Written bare, SharePoint
    // resolved them in the SITE's timezone, so a BST-season date stored 23:00Z
    // on the PREVIOUS day — and because the edit form redisplays the stored day
    // and re-saves it, the value walked back one day on every edit. CloseDate
    // is currently supplied by no caller, but it is the same shape one line
    // over and would ratchet identically the moment one does.
    TargetDate:     isoDate(fields.TargetDate) || undefined,
    CloseDate:      isoDate(fields.CloseDate)  || undefined,
    CreatedByEmail: fields.CreatedByEmail || "",
  });
}

async function updateSurveyTemplate(id, fields) {
  const payload = {};
  if (fields.Title          !== undefined) payload.Title          = fields.Title;
  if (fields.Description    !== undefined) payload.Description    = fields.Description;
  if (fields.TargetAudience !== undefined) payload.TargetAudience = fields.TargetAudience;
  if (fields.Status         !== undefined) payload.Status         = fields.Status;
  // N-133: the UPDATE path is what actually drove the ratchet — each edit
  // re-stored the (already shifted) day the form was showing. isoDate() returns
  // null for an empty value, which is the correct way to clear a SharePoint
  // date field, so deliberately emptying the field still clears it.
  if (fields.TargetDate     !== undefined) payload.TargetDate     = isoDate(fields.TargetDate);
  if (fields.CloseDate      !== undefined) payload.CloseDate      = isoDate(fields.CloseDate);
  return updateItem("SurveyTemplates", id, payload);
}

async function createSurveyQuestion(fields) {
  return createItem("SurveyQuestions", {
    TemplateID:         String(fields.TemplateID),
    QuestionText:       fields.QuestionText,
    QuestionType:       fields.QuestionType,
    ScaleMin:           fields.ScaleMin       ?? 1,
    ScaleMax:           fields.ScaleMax       ?? 5,
    ScaleMinLabel:      fields.ScaleMinLabel  || "",
    ScaleMaxLabel:      fields.ScaleMaxLabel  || "",
    Options:            fields.Options        || "",
    IsRequired:         fields.IsRequired  ?? false,
    SortOrder:          fields.SortOrder   ?? 0,
  });
}

async function updateSurveyQuestion(id, fields) {
  const payload = {};
  if (fields.QuestionText !== undefined) payload.QuestionText = fields.QuestionText;
  if (fields.QuestionType !== undefined) payload.QuestionType = fields.QuestionType;
  if (fields.ScaleMin      !== undefined) payload.ScaleMin      = fields.ScaleMin;
  if (fields.ScaleMax      !== undefined) payload.ScaleMax      = fields.ScaleMax;
  if (fields.ScaleMinLabel !== undefined) payload.ScaleMinLabel = fields.ScaleMinLabel;
  if (fields.ScaleMaxLabel !== undefined) payload.ScaleMaxLabel = fields.ScaleMaxLabel;
  if (fields.Options       !== undefined) payload.Options       = fields.Options;
  if (fields.IsRequired   !== undefined) payload.IsRequired   = fields.IsRequired;
  if (fields.SortOrder    !== undefined) payload.SortOrder    = fields.SortOrder;
  return updateItem("SurveyQuestions", id, payload);
}

async function deleteSurveyQuestion(id) {
  return deleteItem("SurveyQuestions", id);
}

async function updateSurveyRun(id, fields) {
  const payload = {};
  if (fields.Status        !== undefined) payload.Status    = fields.Status;
  // N-131: the edit path needs it too — fixing only createSurveyRun would
  // leave a close date changed after activation writing the bare shape.
  if (fields.CloseDate     !== undefined) payload.CloseDate = isoDate(fields.CloseDate);
  if (fields.EligibleCount !== undefined) payload.EligibleCount = fields.EligibleCount;
  return updateItem("SurveyRuns", id, payload);
}

// Called once per question answer on survey submission.
// UUID only — no email, no user identifier.
async function createSurveyResponse(fields) {
  return createItem("SurveyResponses", {
    RunID:              String(fields.RunID),
    QuestionID:         String(fields.QuestionID),
    RespondentUUID:     fields.RespondentUUID,
    AnswerValue:        String(fields.AnswerValue),
    SubmittedAt:        new Date().toISOString(),
  });
}

// Called once on submit — email only, no answers.
async function createSurveyCompletion(runId, email) {
  return createItem("SurveyCompletions", {
    RunID:           String(runId),
    RespondentEmail: email.toLowerCase(),
  });
}

// ── Survey templates and runs ─────────────────────────────────────

async function getSurveyTemplates() {
  return getItems("SurveyTemplates");
}

async function getActiveSurveyRun() {
  const runs = await getItems("SurveyRuns", "fields/Status eq 'Active'");
  return runs.length > 0 ? runs[0] : null;
}

async function getSurveyQuestions(templateId) {
  const questions = await getItems("SurveyQuestions", `fields/TemplateID eq '${odataStr(templateId)}'`);
  return questions.sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
}

async function hasCompletedSurvey(runId, email) {
  const completions = await getItems(
    "SurveyCompletions",
    `fields/RunID eq '${odataStr(runId)}' and fields/RespondentEmail eq '${odataStr(email.toLowerCase())}'`
  );
  return completions.length > 0;
}

// ── Write ─────────────────────────────────────────────────────────────
async function createSurveyRun(fields) {
  // N-131: canonical midday-UTC, like every other SharePoint date write. The
  // bare shape was kept until now (see N-088) because index.html does
  // ARITHMETIC on these two values, so changing the shape moves behaviour:
  //   index.html ~233  daysSince -> the reminder gate (CONFIG.SURVEY.REMINDER_DAY)
  //   index.html ~299  hrsLeft   -> the "closes in Xh" notification
  // Both were reworked in the same change to be time-of-day insensitive —
  // daysSince now counts calendar days, and hrsLeft counts to the END of the
  // close date (a run closing on the 20th is open THROUGH the 20th). If either
  // consumer is touched again, keep them insensitive to the stored time.
  // localDayISO() below still produces the correct local DAY; isoDate() only
  // pins it to midday so no browser offset can shift it.
  const openDate  = fields.OpenDate  || localDayISO();
  const closeDate = fields.CloseDate || (() => {
    const d = new Date(); d.setDate(d.getDate() + CONFIG.SURVEY.DEFAULT_DURATION_DAYS);
    return localDayISO(d);
  })();
  return createItem("SurveyRuns", {
    Title:              fields.RunLabel,
    TemplateID:         String(fields.TemplateID),
    OpenDate:           isoDate(openDate),
    CloseDate:          isoDate(closeDate),
    Status:             "Active",
    EligibleCount:      fields.EligibleCount || 0,
  });
}
