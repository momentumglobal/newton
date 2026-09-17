// Employee Engagement survey SharePoint API calls.
// Extracted from api.js by N-237a — single-consumer functions used across
// engagement-forms.js, engagement-pages.js (people.html) and survey-app.js
// (survey.html). Depends on getItems/createItem/updateItem/deleteItem and
// getTalentPartnerDisplayMap/filterToActiveTpEmails, all defined in api.js
// (loads first, see script order). getSurveyTemplates, getActiveSurveyRun,
// getSurveyQuestions, hasCompletedSurvey and createSurveyRun stay in api.js
// — they have more than one consumer or are out of this task's scope.

// Eligible respondents for an Engagement survey run = active employees
// (People.IsActive) holding a talent_partner or delivery_manager role in
// UserAssignments. Deliberately does NOT filter on UserAssignments.Active —
// a bench/unassigned TP or DM with no current project is still an eligible
// active employee (Chris, 16 Sep 2026 — see N-233). Dedupes by email first,
// since one user can hold multiple UserAssignments rows (N-165).
async function getEligibleRespondentCount() {
  const assignments = await getItems('UserAssignments');
  const tpDmEmails = new Set();
  assignments.forEach(a => {
    if (a.AssignedRole === 'talent_partner' || a.AssignedRole === 'delivery_manager') {
      if (a.UserEmail) tpDmEmails.add(a.UserEmail.toLowerCase());
    }
  });
  const tpMap = await getTalentPartnerDisplayMap();
  const activeEmails = await filterToActiveTpEmails([...tpDmEmails], tpMap);
  return activeEmails.length;
}

// ── Read ──────────────────────────────────────────────────────────────

async function getSurveyRuns() {
  return getItems("SurveyRuns");
}

async function getSurveyResponses(runId) {
  return getItems("SurveyResponses", `fields/RunID eq '${runId}'`);
}

async function getSurveyCompletionCount(runId) {
  const completions = await getItems("SurveyCompletions", `fields/RunID eq '${runId}'`);
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
