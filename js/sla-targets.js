// js/sla-targets.js — SLA targets and editor helpers, plus the shared row → role-id reader.
// Pure: no Graph, no DOM. Split out of utils.js and analytics.js (N-473).
// Loaded after analytics.js on reporting.html, command-centre.html, market-reporting.html and admin.html.

// ── SLA targets (N-381 / DA-1) ────────────────────────────────────────
// Pure: no Graph, no DOM. Rows come from getSLATargets() (api.js); see CONFIG.SLA.
// Project types that can have SLAs: every type with a dashboard except the internal project
// (N-333, excluded from client KPIs). Derived, so a new project type changes this by
// derivation, not by edit. A fresh array each call.
function slaProjectTypes() {
  return CONFIG.PROJECT_TYPES.filter(t => !isNoDashboardType(t) && t !== CONFIG.PROJECT_TYPE_INTERNAL);
}

// A target value: a finite number above zero, else null (blank / 0 / negative / junk = no target).
function slaCleanValue(v) {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 'override' when ProjectID > 0 (wins even if ProjectType is also set), 'default' when
// ProjectType is non-blank, else null (ignored).
function slaRowKind(row) {
  if (!row) return null;
  const pid = Number(row.ProjectID);
  if (Number.isFinite(pid) && pid > 0) return 'override';
  return String(row.ProjectType == null ? '' : row.ProjectType).trim() ? 'default' : null;
}

// The lowest SharePoint item id of a non-empty row list - the deterministic tie-break when a
// key has duplicate rows.
function _slaLowestIdRow(rows) {
  return rows.reduce((a, b) => (Number(b.id) < Number(a.id) ? b : a));
}

// The override row and default row that apply to an eligible project (lowest item id on
// duplicates), or null for each. Shared by slaTargetsFor and slaEditorModel (N-382).
function _slaPickRows(project, rows) {
  const all = Array.isArray(rows) ? rows : [];
  const pid = Number(project.id);
  const overrides = all.filter(r => slaRowKind(r) === 'override' && Number(r.ProjectID) === pid);
  const defaults = all.filter(r => slaRowKind(r) === 'default' && String(r.ProjectType).trim() === project.ProjectType);
  return {
    ov: overrides.length ? _slaLowestIdRow(overrides) : null,
    df: defaults.length ? _slaLowestIdRow(defaults) : null,
  };
}

// What are this project's SLA targets? null = the project cannot have SLAs (no project, or a
// type outside slaProjectTypes() - LCI, Transformation, Internal, unknown - even if a row
// exists). Otherwise one { value, source } per CONFIG.SLA.METRICS key: the project's override
// row, else its type's default row, else { value: null, source: null }. Resolved per metric,
// so a partial override inherits the rest. Duplicate rows for a key: lowest item id wins.
function slaTargetsFor(project, rows) {
  if (!project || !slaProjectTypes().includes(project.ProjectType)) return null;
  const { ov, df } = _slaPickRows(project, rows);
  const out = {};
  CONFIG.SLA.METRICS.forEach(m => {
    const o = ov ? slaCleanValue(ov[m.column]) : null;
    if (o !== null) { out[m.key] = { value: o, source: 'override' }; return; }
    const d = df ? slaCleanValue(df[m.column]) : null;
    out[m.key] = d !== null ? { value: d, source: 'default' } : { value: null, source: null };
  });
  return out;
}

// The default rows Seed defaults would create: one per eligible type that has no default row
// yet. Existing rows never appear in the plan, so seeding cannot overwrite an edited row.
// Metrics without a CONFIG.SLA.SEED_DEFAULTS value are omitted (blank), never written as 0.
function slaSeedPlan(rows) {
  const have = new Set((Array.isArray(rows) ? rows : [])
    .filter(r => slaRowKind(r) === 'default')
    .map(r => String(r.ProjectType).trim()));
  const seed = {};
  CONFIG.SLA.METRICS.forEach(m => {
    if (CONFIG.SLA.SEED_DEFAULTS[m.key] !== undefined) seed[m.column] = CONFIG.SLA.SEED_DEFAULTS[m.key];
  });
  return slaProjectTypes()
    .filter(t => !have.has(t))
    .map(t => Object.assign({ Title: 'Default · ' + t, ProjectType: t }, seed));
}

// ── SLA integrity checks (N-389 / DA-9) ───────────────────────────────
// Pure: the two Admin > Data Health checks over SLATargets. projects = every project (any
// status, getProjects(false)); rows = every SLATargets row.
//   noTargets       - active projects of an SLA-eligible type whose four targets all resolve to
//                     null. reason 'noRow' = no override and no default row apply; 'blank' = a row
//                     applies but every value is blank. One resolvable metric is enough.
//   orphanOverrides - override rows whose ProjectID matches no project at all.
// Rows are ordered by item id. Inputs are never mutated.
function checkSlaIntegrity({ projects, rows } = {}) {
  const ps = (Array.isArray(projects) ? projects : []).filter(Boolean);
  const rs = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const byId = (a, b) => Number(a.id) - Number(b.id);
  const projectIds = new Set(ps.map(p => String(p.id)));
  const noTargets = ps
    .filter(p => {
      if (!isProjectActive(p)) return false;
      const t = slaTargetsFor(p, rs);   // null for ineligible types
      return !!t && CONFIG.SLA.METRICS.every(m => t[m.key].value === null);
    })
    .sort(byId)
    .map(p => {
      const { ov, df } = _slaPickRows(p, rs);
      return { id: p.id, label: p.Title || ('Project ' + p.id), type: p.ProjectType, reason: (ov || df) ? 'blank' : 'noRow' };
    });
  const orphanOverrides = rs
    .filter(r => slaRowKind(r) === 'override' && !projectIds.has(String(Number(r.ProjectID))))
    .sort(byId)
    .map(r => ({ rowId: r.id, projectId: Number(r.ProjectID), label: r.Title || '' }));
  return { noTargets, orphanOverrides };
}

// ── SLA target editor (N-382 / DA-2) ──────────────────────────────────
// Pure rules behind the Config Panel defaults tab and the Project page overrides editor.

// Parses one typed target. '' -> { ok, value: null } (no target / inherit). Otherwise a plain
// decimal above zero, at most CONFIG.SLA.MAX_VALUE, with no more decimal places than the
// metric allows. Never trusts valueAsNumber: the raw string is what the user typed.
function slaParseInput(raw, metric) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return { ok: true, value: null };
  const label = metric && metric.label ? metric.label : 'This target';
  const max = CONFIG.SLA.MAX_VALUE;
  const n = Number(s);
  if (!/^\d+(\.\d+)?$/.test(s) || !Number.isFinite(n) || n <= 0) {
    return { ok: false, error: label + ' must be a number above zero, or blank for no target.' };
  }
  if (n > max) return { ok: false, error: label + ' can be at most ' + max.toLocaleString('en-GB') + '.' };
  const decimals = metric && metric.decimals ? metric.decimals : 0;
  const frac = s.split('.')[1] || '';
  if (decimals === 0 && frac !== '') return { ok: false, error: label + ' must be a whole number.' };
  if (frac.length > decimals) {
    return { ok: false, error: label + ' can have at most ' + decimals + ' decimal place' + (decimals === 1 ? '' : 's') + '.' };
  }
  return { ok: true, value: n };
}

// The editor view of one project: null when it cannot have SLAs (see slaTargetsFor), else the
// rows that apply and, per metric (registry order), the effective value + source, the default
// row's value and the override row's value (null = blank).
function slaEditorModel(project, rows) {
  const effective = slaTargetsFor(project, rows);
  if (!effective) return null;
  const { ov, df } = _slaPickRows(project, rows);
  return {
    overrideRow: ov,
    defaultRow: df,
    metrics: CONFIG.SLA.METRICS.map(m => ({
      key: m.key, column: m.column, label: m.label, unit: m.unit, decimals: m.decimals,
      effective: effective[m.key],
      defaultValue: df ? slaCleanValue(df[m.column]) : null,
      overrideValue: ov ? slaCleanValue(ov[m.column]) : null,
    })),
  };
}

// What saving the editor does, from FRESH rows. kind 'default': target = a project type.
// kind 'override': target = { id, name, type } of the project. values = { metricKey: number|null },
// already parsed. -> { action: 'create'|'update'|'delete'|'none', id?, fields?, error? }.
// An update writes all four columns (null clears a blank one); a create writes only non-null
// metrics. A default row is never deleted; an override row with nothing left is deleted.
// Never mutates its inputs.
function slaEditPlan(kind, target, rows, values) {
  const all = Array.isArray(rows) ? rows : [];
  const v = values || {};
  const cols = {};
  const set = {};
  CONFIG.SLA.METRICS.forEach(m => {
    cols[m.column] = slaCleanValue(v[m.key]);
    if (cols[m.column] !== null) set[m.column] = cols[m.column];
  });
  const any = Object.keys(set).length > 0;
  if (kind === 'default') {
    const type = String(target == null ? '' : target).trim();
    if (!slaProjectTypes().includes(type)) return { action: 'none', error: 'No SLA targets for project type "' + type + '".' };
    const have = all.filter(r => slaRowKind(r) === 'default' && String(r.ProjectType).trim() === type);
    if (have.length) return { action: 'update', id: _slaLowestIdRow(have).id, fields: cols };
    return any
      ? { action: 'create', fields: Object.assign({ Title: 'Default · ' + type, ProjectType: type }, set) }
      : { action: 'none' };
  }
  if (kind === 'override') {
    const pid = Number(target && target.id);
    if (!Number.isInteger(pid) || pid <= 0 || !slaProjectTypes().includes(target.type)) {
      return { action: 'none', error: 'This project cannot have SLA targets.' };
    }
    const have = all.filter(r => slaRowKind(r) === 'override' && Number(r.ProjectID) === pid);
    if (!any) return have.length ? { action: 'delete', id: _slaLowestIdRow(have).id } : { action: 'none' };
    if (have.length) return { action: 'update', id: _slaLowestIdRow(have).id, fields: cols };
    return { action: 'create', fields: Object.assign({ Title: 'Override · ' + (target.name || ('Project ' + pid)), ProjectID: pid }, set) };
  }
  return { action: 'none', error: 'Unknown SLA edit kind.' };
}

// A failed SLATargets write as the error to show: a 403 becomes a plain permission message
// (the SharePoint list permission is the real gate), anything else is returned unchanged.
function slaTranslateSaveError(e) {
  if (e && e.status === 403) return new Error("You don't have edit permission on the SLATargets list in SharePoint.");
  return e;
}

// A target for display: '45 days', '2.5 per week', or 'Not set'. unit comes from CONFIG.SLA.METRICS.
function slaFormatTarget(value, metric) {
  const v = slaCleanValue(value);
  if (v === null) return 'Not set';
  return v.toLocaleString('en-GB', { maximumFractionDigits: 2 }) + (metric && metric.unit ? ' ' + metric.unit : '');
}

// The role id a WeeklyActivity / Placements / RejectedOffers / RoleHistory row
// belongs to (LookupId first, then plain RoleID), or null.
function _slaRowRoleId(row) {
  if (!row) return null;
  return positiveLookupId(row.RoleIDLookupId) ?? positiveLookupId(row.RoleID);
}
