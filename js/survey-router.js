// js/survey-router.js — Survey respondent page access control

const SURVEY_RESPONDENT_ROLES = ['talent_partner', 'delivery_manager'];

function surveyCanAccess(role) {
  return SURVEY_RESPONDENT_ROLES.includes(role);
}
