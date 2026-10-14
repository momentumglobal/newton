// js/survey-router.js — Survey respondent page access control

// N-332: the respondent roles live in CONFIG.SURVEY_RESPONDENT_ROLES.
function surveyCanAccess(role) {
  return isSurveyRespondentRole(role);
}
