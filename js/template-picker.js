// js/template-picker.js — N-478: the Use template project + role dialog, shared by Briefing Pack
// (briefing-pack.js) and Report Builder (report-builder.js). TPL-D3 / D8 / D9 / D11.
// Loads on reporting.html only, before report-builder.js. Declarations only: nothing runs at load.
// The pure option rules are templateProjectOptions / templateRoleLabel (templates-logic.js).

// The roles a template copy on `projectId` may name — a Talent Partner sees only their own.
// Shared by the builders' Role selects and the Use template dialog.
function templateRolesFor(projectId) {
  const tpEmail = _resolvedRole === 'talent_partner' ? getScopedUserEmail() : null;
  return getRolesForProject(projectId, tpEmail);
}

// One dialog: a writable project (required) and one of its roles (optional).
//   tpl      the template row (its display name is the dialog message)
//   projects the writable projects the caller already filtered
//   rolesFor async projectId => roles
//   noneLabel the "no role" option text (BP: roleNone, RB: roleAll)
// Resolves null on cancel; { project, role } on confirm (role null for the none option);
// { project: null, role: null } when the picked project is no longer in `projects`, so the
// caller can say so instead of treating it as a cancel.
async function pickTemplateTarget({ tpl, projects, rolesFor, noneLabel }) {
  const T = CONFIG.TEMPLATES;
  const roleCache = {};
  const picked = await pairSelectModal({
    title: T.LABELS.modalTitle,
    message: templateDisplayName(tpl),
    first: { label: T.LABELS.projectLabel, placeholder: T.LABELS.projectPlaceholder, options: templateProjectOptions(projects) },
    second: {
      label: T.LABELS.roleLabel,
      noneLabel,
      loadingLabel: T.LABELS.rolesLoading,
      errorText: T.MESSAGES.rolesLoadFailed,
      load: async pid => (roleCache[pid] = await rolesFor(pid)).map(r => ({ value: String(r.id), label: templateRoleLabel(r) })),
    },
    confirmLabel: T.LABELS.modalConfirm,
  });
  if (!picked) return null;
  const project = projects.find(p => String(p.id) === String(picked.first)) || null;
  if (!project) return { project: null, role: null };
  const role = (roleCache[picked.first] || []).find(r => String(r.id) === String(picked.second)) || null;
  return { project, role };
}
