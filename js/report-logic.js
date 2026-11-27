// js/report-logic.js — saved-report rules shared by Report Builder and Newton for Claude (N-550,
// specs/N-550.md AMCP-E1–E7). Pure: no DOM, no Graph, no call at load. Everything here is a
// declaration; the callers are js/report-builder.js, js/dashboard-project-panels.js and
// mcp/newton-report-tools.js.

// The module tiles Report Builder offers, and the labels a report's panel blocks carry. Moved here
// from js/report-builder.js so the Claude report tools read the same labels (one source).
const RB_PALETTE = [
  // Overview — no subheading; tiles sit directly under "Add Modules"
  { key: 'kpiStrip',         label: 'KPI Strip',                  scope: 'both',    group: 'Overview', filtered: true },
  { key: 'roleTracker',      label: 'Pipeline Tracker',           scope: 'project', group: 'Overview' },
  { key: 'rolesOpen30',      label: 'Roles Open 30+ Days',        scope: 'both',    group: 'Overview' },
  // Pipeline
  { key: 'pipelineActivity', label: 'Pipeline Activity',          scope: 'project', group: 'Pipeline', filtered: true },
  { key: 'activityByTP',     label: 'Activity by Talent Partner', scope: 'both',    group: 'Pipeline', filtered: true },
  { key: 'pipelineSummary',  label: 'Pipeline Summary (last 4 weeks)', scope: 'both', group: 'Pipeline' },
  { key: 'pipelineSummaryPTD', label: 'Pipeline Summary (project to date)', scope: 'project', group: 'Pipeline' },
  { key: 'candidateSnapshot', label: 'Candidate Pipeline Snapshot',    scope: 'project', group: 'Pipeline' },
  // Placements & Rejections
  { key: 'placements',       label: 'Placements',                 scope: 'both',    group: 'Placements & Rejections', filtered: true },
  { key: 'placementsPTD',    label: 'Placements (project to date)', scope: 'project', group: 'Placements & Rejections' },
  { key: 'spendVsBudget',    label: 'Actual Spend vs Budget',     scope: 'both',    group: 'Placements & Rejections' },
  { key: 'upcomingStarters', label: 'Upcoming Starters',          scope: 'both',    group: 'Placements & Rejections' },
  { key: 'rejections',       label: 'Offer Rejection Reasons',    scope: 'both',    group: 'Placements & Rejections', filtered: true },
  // N-385: company scope only; `cap` = a CONFIG.ROLE_CAPABILITIES key the viewer must hold.
  { key: 'slaRollup',        label: 'SLA Roll-up (last 90 days)', scope: 'company', group: 'Delivery Assurance', cap: 'slaRollupReport' },
  // N-388: company scope only; follows the report's period; amounts only for Admin viewers (N-396).
  { key: 'rejectionIntel',   label: 'Rejection Intelligence',     scope: 'company', group: 'Delivery Assurance', cap: 'rejectionIntelReport' },
];

// ── Visibility (the Report Library rule, one report at a time) ────────────────────────────
// Admin sees every report; a Delivery Manager every company-scope report plus project-scope ones they
// own or whose project is assigned to them; a Talent Partner (and any other role) only project-scope
// reports they own or whose project is assigned to them. Scope:'company' is never surfaced by ownership
// alone (N-244 QA finding 1). `projectIds` is getUserProjectIds(): null for an Admin ("all"), else an
// array of project id strings.
function reportVisibleTo(role, email, projectIds, report, cfg) {
  cfg = cfg || CONFIG;
  if (role === cfg.ROLE_IDS.ADMIN) return true;
  const me     = (email || '').toLowerCase();
  const ids    = projectIds || [];
  const mine   = (report.ReportOwner || '').toLowerCase() === me;
  const onProj = report.Scope === 'project' && ids.includes(String(report.ProjectID));
  if (role === cfg.ROLE_IDS.DELIVERY_MANAGER) return report.Scope === 'company' || mine || onProj;
  return report.Scope === 'project' && (mine || onProj);
}

// ── ModuleOrder: the report's blocks ──────────────────────────────────────────────────────
// A block is { id, type: 'panel', key } or { id, type: 'text', content } (content = HTML from the
// builder's contenteditable); { type: 'hiringPlan' } and { type: 'titlePage' } are markers, not blocks.
const REPORT_MARKER_TYPES = ['hiringPlan', 'titlePage'];

function reportBlocks(moduleOrderJson) {
  let v;
  try { v = JSON.parse(moduleOrderJson || '[]'); } catch (e) { v = null; }
  if (!Array.isArray(v)) throw new Error("This report's layout could not be read.");
  return v;
}

function reportPanelLabel(key) {
  const meta = RB_PALETTE.find(p => p.key === key);
  return meta ? meta.label : String(key);
}

// The builder's blocks in order, markers left out: [{ position (1-based), type, id, key?, label?, html? }].
function reportLayout(blocks) {
  const out = [];
  blocks.forEach(b => {
    if (!b || REPORT_MARKER_TYPES.includes(b.type)) return;
    const item = { position: out.length + 1, type: b.type === 'text' ? 'text' : 'panel', id: String(b.id === undefined ? '' : b.id) };
    if (item.type === 'panel') { item.key = String(b.key || ''); item.label = reportPanelLabel(item.key); }
    else item.html = String(b.content === undefined || b.content === null ? '' : b.content);
    out.push(item);
  });
  return out;
}

// ── Text blocks: HTML <-> light plain text ────────────────────────────────────────────────
// Plain text: a blank line separates paragraphs, "## " starts a heading, "- " starts a bullet.
// Report Builder renders a text block's HTML raw, so reportTextToHtml ESCAPES first and builds only
// <h3>, <ul><li> and <p> (what the toolbar offers): nothing Claude writes can carry a tag or a script.
function _reportEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function reportTextToHtml(text) {
  const lines = String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = [];
  const flush = () => {
    if (para.length) out.push('<p>' + para.map(_reportEsc).join('<br>') + '</p>');
    if (list.length) out.push('<ul>' + list.map(li => '<li>' + _reportEsc(li) + '</li>').join('') + '</ul>');
    para = [];
    list = [];
  };
  lines.forEach(raw => {
    const line = raw.trim();
    if (!line) { flush(); return; }
    if (/^##\s+/.test(line)) { flush(); out.push('<h3>' + _reportEsc(line.replace(/^##\s+/, '')) + '</h3>'); return; }
    if (/^-\s+/.test(line)) { if (para.length) flush(); list.push(line.replace(/^-\s+/, '')); return; }
    if (list.length) flush();
    para.push(line);
  });
  flush();
  return out.join('');
}

function reportHtmlToText(html) {
  let s = String(html === undefined || html === null ? '' : html).replace(/\r\n?/g, '\n');
  s = s.replace(/<\s*h[1-6][^>]*>/gi, '\n## ')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*(p|div|ul|ol)(\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
  s = s.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(^- [^\n]*)\n\n(?=- )/gm, '$1\n');
  return s.trim();
}

// The report's text blocks as plain text: [{ blockId, position, after, text }]. `after` = the label of
// the panel above the block, or 'top of report'.
function reportTextBlocks(blocks) {
  const out = [];
  let above = 'top of report';
  reportLayout(blocks).forEach(item => {
    if (item.type === 'panel') { above = item.label; return; }
    out.push({ blockId: item.id, position: item.position, after: above, text: reportHtmlToText(item.html) });
  });
  return out;
}

// The ModuleOrder JSON with the named text blocks' content replaced and tagged with `source`
// (AMCP-A7). edits: [{ blockId, content }]. Every other block, key and marker is unchanged.
// Throws when a blockId is not a text block of this report.
function reportReplaceTextBlocks(moduleOrderJson, edits, source) {
  const blocks = reportBlocks(moduleOrderJson);
  edits.forEach(e => {
    const b = blocks.find(x => x && x.type === 'text' && String(x.id) === String(e.blockId));
    if (!b) throw new Error('Text block ' + e.blockId + ' is not in this report.');
    b.content = e.content;
    b.source = source;
  });
  return JSON.stringify(blocks);
}

// ── Periods, for a saved report's own Period / KpiPeriod ──────────────────────────────────
// A report's Period is a detail-period key (this_week ... last_year) and is relative to TODAY: a saved
// weekly report re-reads as the current week. -> { key, label, start, end } with local YYYY-MM-DD days.
// An unknown key reads as getDetailPeriodRange reads it (this month).
function reportPeriodWindow(periodKey) {
  const known = DETAIL_PERIOD_OPTIONS.find(o => o[0] === periodKey);
  const key = known ? periodKey : 'this_month';
  const label = (DETAIL_PERIOD_OPTIONS.find(o => o[0] === key) || [])[1] || key;
  const r = getDetailPeriodRange(key);
  return { key, label, start: localDayISO(r.start), end: localDayISO(r.end) };
}

// ── KPI strip numbers (the arithmetic inside renderKPIStrip, unchanged) ───────────────────
// period: 'month' | 'quarter' | 'year'. Returns numbers (null = not computable); renderKPIStrip formats them.
function kpiStripModel(roles, activity, period, placements, hc) {
  placements = placements || [];
  hc = hc || dashboardHeadcountContext(roles, placements, null);
  const openPipelines = roles.filter(r => isOpenPipelineStage(r.Stage));
  const activePipelines  = openPipelines.length;
  // S-4: one placement = one filled headcount. Counted against `roles` so a
  // caller passing an unscoped placements list (RB company scope) can't inflate it.
  const roleIdSet    = new Set(roles.map(r => String(r.id)));
  const totalHires   = placements.filter(p => roleIdSet.has(String(p.RoleIDLookupId)) || roleIdSet.has(String(p.RoleID))).length;
  const backlogPipelines = roles.filter(r => r.Stage === 'Backlog').length;
  const avgOpenDays  = avgOpenHeadcountDays(openPipelines, hc.headcount, hc.fillMap);
  // N-311 (S-2): open, dated headcount on the active pipelines; null when the headcount read failed.
  const openHeadcount = openHeadcountCount(openPipelines, hc.headcount, hc.fillMap);
  const acts      = activity.filter(a => activityInKpiPeriod(a, period));
  const submitted = sumField(acts, 'Submitted');
  const int1      = sumField(acts, 'Interview1');
  const offers    = sumField(acts, 'Offers');
  const hires     = sumField(acts, 'Hires');
  const convPct  = submitted > 0 ? Math.round((int1 / submitted) * 100) : null;
  const ivOfferR = offers > 0    ? Math.round(int1 / offers)            : null;
  const offerPct = offers > 0    ? Math.round((hires / offers) * 100)   : null;
  const cur         = hireKpisForPeriod(hc.hires, 'this_' + period);
  const avgDays     = cur ? cur.avgDays : null;
  const onTimePct   = cur ? cur.onTimePct : null;
  const prevPeriod = getPreviousPeriod(period);
  const prevRange  = prevPeriod ? getDetailPeriodRange(prevPeriod) : null;
  const prevHireKpis = hireKpisForPeriod(hc.hires, prevPeriod);
  let prevConvPct = null, prevIvOfferR = null, prevOfferPct = null;
  const prevAvgDays   = prevHireKpis ? prevHireKpis.avgDays : null;
  const prevOnTimePct = prevHireKpis ? prevHireKpis.onTimePct : null;
  if (prevRange) {
    const prevActs = activity.filter(a => {
      const date = a.WeekEndingDate
        ? new Date(a.WeekEndingDate)
        : weekEndingDate(Number(a.Year), Number(a.WeekNumber));
      return date >= prevRange.start && date <= prevRange.end;
    });
    const pSubmitted = sumField(prevActs, 'Submitted');
    const pInt1      = sumField(prevActs, 'Interview1');
    const pOffers    = sumField(prevActs, 'Offers');
    const pHires     = sumField(prevActs, 'Hires');
    prevConvPct  = pSubmitted > 0 ? Math.round((pInt1 / pSubmitted) * 100) : null;
    prevIvOfferR = pOffers > 0    ? Math.round(pInt1 / pOffers)            : null;
    prevOfferPct = pOffers > 0    ? Math.round((pHires / pOffers) * 100)   : null;
  }
  return {
    activePipelines, openHeadcount, backlogPipelines, avgOpenDays, totalHires,
    convPct, ivOfferR, offerPct, avgDays, onTimePct,
    prev: { convPct: prevConvPct, ivOfferR: prevIvOfferR, offerPct: prevOfferPct, avgDays: prevAvgDays, onTimePct: prevOnTimePct },
  };
}

// N-554: the one source for the long-open thresholds (watch / panel and red / alert), used by the
// dashboards, mobile and the Claude report tools.
const LONG_OPEN_DAYS = 30;
const LONG_OPEN_ALERT_DAYS = 45;

// ── Roles Open 30+ Days and Upcoming Starters (the rows behind the two panels) ────────────
// N-310 (S-7): days since each pipeline's OLDEST OPEN headcount (pipelineOpenDay; openSince null →
// Roles.OpenDate fallback). Oldest first. -> [{ r, day, days }].
function longOpenPipelines(roles, openSince, minDays) {
  return roles
    .map(r => ({ r, day: pipelineOpenDay(r, openSince) }))
    .filter(({ r, day }) => isOpenPipelineStage(r.Stage) && day && daysOpen(day) >= minDays)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .map(({ r, day }) => ({ r, day, days: daysOpen(day) }));
}

// Placements with a provisional start date from today on, soonest first.
function upcomingStarterPlacements(placements) {
  const today = new Date(); today.setHours(0,0,0,0);
  return placements
    .filter(p => p.ProvisionalStartDate && new Date(p.ProvisionalStartDate) >= today)
    .sort((a, b) => new Date(a.ProvisionalStartDate) - new Date(b.ProvisionalStartDate));
}
