// js/sla-engine.js — SLA calc engine, panel model and roll-up (N-383 / N-384 / N-385).
// Pure: no Graph, no DOM. Split out of analytics.js (N-473). Needs sla-targets.js (slaTargetsFor,
// _slaRowRoleId) and analytics.js (groupStageHistoryByRole).
// Loaded after sla-targets.js on reporting.html and command-centre.html.

// ── SLA engine (N-383 / DA-3) ─────────────────────────────────────────
// Pure: no Graph, no DOM. Targets come from slaTargetsFor() (sla-targets.js); stage
// anchors, pause stages and the rolling window from CONFIG.SLA.ENGINE. Day maths
// on 'YYYY-MM-DD' strings only: day markers (OpenDate, OfferAcceptedDate,
// RejectionDate, WeekEndingDate) through spDateIn, the RoleHistory ChangedAt
// instant through localDayISO(new Date(...)) — never raw ms (N-100 diff-4).
// Decisions (Chris, 23 Oct 2026): first submission / offer are role-level events
// shared by every hire open at the time and re-armed per hire (an event counts for
// a hire when it is on/after that hire's OpenDate); WeeklyActivity evidence is
// dated to its week-ending Sunday, exact days win when earlier; On-hold pauses the
// clock (DA-D6); submissions per role per week = rolling mean of the trailing
// CONFIG.SLA.ENGINE.rollingWeeks ACTIVE weeks. Deliberately independent of
// the flag / pace thresholds and the Avg Time to Hire KPI (SLA time to hire
// excludes On-hold days; the KPI does not).

// Per-hire (day) metrics and the role-level weekly metric. Together exactly the
// CONFIG.SLA.METRICS keys (checked at load).
const SLA_HIRE_METRIC_KEYS  = ['firstSubmissionDays', 'timeToOfferDays', 'timeToHireDays'];
const SLA_WEEKLY_METRIC_KEY = 'submissionsPerWeek';

// Throws on a broken CONFIG.SLA.ENGINE: unknown stage, inverted band, bad
// rollingWeeks, or metric keys that don't match CONFIG.SLA.METRICS. Run at load.
function slaEngineConfigCheck(cfg = CONFIG.SLA.ENGINE) {
  const stages = CONFIG.ROLE_STAGES;
  const known = s => { if (!stages.includes(s)) throw new Error(`SLA.ENGINE: unknown stage "${s}"`); };
  if (!cfg) throw new Error('SLA.ENGINE missing');
  (cfg.pauseStages || []).forEach(known);
  known(cfg.offerStage);
  ['submissionBand', 'activeWeekBand'].forEach(k => {
    const b = cfg[k];
    if (!b) throw new Error(`SLA.ENGINE.${k} missing`);
    known(b.from); known(b.to);
    if (stages.indexOf(b.from) > stages.indexOf(b.to)) throw new Error(`SLA.ENGINE.${k}: "${b.from}" comes after "${b.to}"`);
  });
  if (!Number.isInteger(cfg.rollingWeeks) || cfg.rollingWeeks < 1) throw new Error('SLA.ENGINE.rollingWeeks must be an integer >= 1');
  const keys = CONFIG.SLA.METRICS.map(m => m.key).sort();
  const mine = SLA_HIRE_METRIC_KEYS.concat([SLA_WEEKLY_METRIC_KEY]).sort();
  if (keys.join() !== mine.join()) throw new Error('SLA engine metric keys do not match CONFIG.SLA.METRICS');
  return true;
}
slaEngineConfigCheck();

// { from, to } band → the ROLE_STAGES slice it spans, inclusive. Fresh array.
function slaStageBand(band) {
  const s = CONFIG.ROLE_STAGES;
  return s.slice(s.indexOf(band.from), s.indexOf(band.to) + 1);
}

// A role's stage over time from its RoleHistory Stage rows.
// → { segments: [{ stage, from, to }], mismatch, noHistory }. `from` is the day
// the stage was entered (null = before the first logged row), `to` the day it was
// left (null = still in it). A segment touches every day in [from, to] for the
// "any day in the week" test; a pause excludes `to` (the day it resumed).
// Before the first row the stage is that row's OldValue when set. No rows → the
// current Stage throughout (noHistory). mismatch = the latest row disagrees with
// role.Stage, so the history is incomplete.
function slaRoleTimeline(role, roleStageRows) {
  const current = role ? normaliseRoleStage(role.Stage) : null;
  const rows = (roleStageRows || [])
    .filter(h => h && (!h.Field || h.Field === 'Stage'))
    .map(h => ({
      t:    new Date(h.ChangedAt).getTime(),
      day:  localDayISO(new Date(h.ChangedAt)),
      oldV: h.OldValue ? normaliseRoleStage(h.OldValue) : null,
      newV: normaliseRoleStage(h.NewValue),
    }))
    .filter(h => h.day)
    .sort((a, b) => a.t - b.t);
  if (!rows.length) {
    return { segments: current ? [{ stage: current, from: null, to: null }] : [], mismatch: false, noHistory: true };
  }
  const segments = [];
  if (rows[0].oldV) segments.push({ stage: rows[0].oldV, from: null, to: rows[0].day });
  rows.forEach((r, i) => segments.push({ stage: r.newV, from: r.day, to: i + 1 < rows.length ? rows[i + 1].day : null }));
  return { segments, mismatch: rows[rows.length - 1].newV !== current, noHistory: false };
}

// Paused intervals [{ from, to }] (from null = unbounded start, to exclusive) —
// the timeline's CONFIG.SLA.ENGINE.pauseStages segments. A pause still running
// ends tomorrow (today is paused), but only when the history agrees with the role's
// current Stage; on a mismatch that open pause is dropped and the clock runs.
function slaPauseIntervals(timeline, todayDay) {
  const pause = CONFIG.SLA.ENGINE.pauseStages;
  const out = [];
  ((timeline && timeline.segments) || []).forEach(s => {
    if (!pause.includes(s.stage)) return;
    let to = s.to;
    if (to === null) {
      if (timeline.mismatch) return;
      to = addDaysISO(todayDay, 1);
    }
    out.push({ from: s.from, to });
  });
  return out;
}

// Whole days from fromDay to toDay minus the paused days in [fromDay, toDay).
// Never below 0; null when fromDay/toDay can't be read.
function slaActiveDays(fromDay, toDay, pauses) {
  const total = daysOpen(fromDay, toDay);
  if (total === null || !toDay) return null;
  let n = total;
  (pauses || []).forEach(p => {
    const a = p.from && p.from > fromDay ? p.from : fromDay;
    const b = p.to && p.to < toDay ? p.to : toDay;
    if (b > a) n -= daysOpen(a, b);
  });
  return Math.max(0, n);
}

// The first day d with slaActiveDays(fromDay, d, pauses) >= n. Paused days
// don't count, so this walks forward from fromDay + n by at most the paused days.
function slaDayAfterActiveDays(fromDay, n, pauses) {
  let d = addDaysISO(fromDay, n);
  for (let guard = 0; d && slaActiveDays(fromDay, d, pauses) < n; guard++) {
    if (guard > 36600) return null;
    d = addDaysISO(d, 1);
  }
  return d;
}

// Every day the role shows evidence of a submission / an offer, ascending, unique.
//   offer      — a forward RoleHistory entry into offerStage (OldValue null or
//                earlier in ROLE_STAGES, so On-hold → Offered is a resume, not an
//                offer); a WeeklyActivity week with Offers > 0 (its Sunday); every
//                placement's OfferAcceptedDate; every RejectionDate.
//   submission — a forward RoleHistory entry into submissionBand (OldValue null
//                or before the band); a week with Submitted > 0 (its Sunday); and
//                every offer day — an offer implies a submission.
// Rows of other roles are ignored, so callers may pass project-wide arrays.
function slaRoleEvidence({ role, roleStageRows, activity, placements, rejectedOffers } = {}) {
  const rid = role ? positiveLookupId(role.id) : null;
  const mine = r => rid !== null && _slaRowRoleId(r) === rid;
  const S = CONFIG.ROLE_STAGES, E = CONFIG.SLA.ENGINE;
  const subBand = slaStageBand(E.submissionBand);
  const subFrom = S.indexOf(E.submissionBand.from);
  const offIdx  = S.indexOf(E.offerStage);
  const forward = (oldV, idx) => !oldV || (S.indexOf(oldV) >= 0 && S.indexOf(oldV) < idx);
  const offer = new Set(), sub = new Set();
  (roleStageRows || []).forEach(h => {
    if (!h || (h.Field && h.Field !== 'Stage') || !mine(h)) return;
    const day = localDayISO(new Date(h.ChangedAt));
    if (!day) return;
    const nv = normaliseRoleStage(h.NewValue);
    const ov = h.OldValue ? normaliseRoleStage(h.OldValue) : null;
    if (nv === E.offerStage && forward(ov, offIdx)) offer.add(day);
    if (subBand.includes(nv) && forward(ov, subFrom)) sub.add(day);
  });
  (activity || []).forEach(a => {
    if (!mine(a)) return;
    const raw = a.WeekEndingDate ? spDateIn(a.WeekEndingDate) : null;
    const wk  = raw ? sundayOnOrAfterISO(raw) : null;
    if (!wk) return;
    if (Number(a.Submitted) > 0) sub.add(wk);
    if (Number(a.Offers) > 0) offer.add(wk);
  });
  (placements || []).forEach(p => {
    const d = mine(p) && p.OfferAcceptedDate ? spDateIn(p.OfferAcceptedDate) : null;
    if (d) offer.add(d);
  });
  (rejectedOffers || []).forEach(r => {
    const d = mine(r) && r.RejectionDate ? spDateIn(r.RejectionDate) : null;
    if (d) offer.add(d);
  });
  offer.forEach(d => sub.add(d));
  return { submissionDays: [...sub].sort(), offerDays: [...offer].sort() };
}

// The earliest OfferAcceptedDate day among a filled headcount's placements, or null.
function _slaFillDay(hc, fillMap) {
  const fills = (fillMap && fillMap.get(String(hc.id))) || [];
  const days = fills.map(p => (p && p.OfferAcceptedDate ? spDateIn(p.OfferAcceptedDate) : null)).filter(Boolean).sort();
  return days[0] || null;
}

// One hire's three day metrics. null for a cancelled hire or an undated one (no
// OpenDate: the clock never started). Otherwise
//   { headcountId, openDay, state: 'open'|'filled', metrics }
// metrics[key] = { target, value, eventDay, status, breachDay } for each of
// SLA_HIRE_METRIC_KEYS:
//   eventDay  — submission / offer: the first evidence day on/after openDay,
//               capped at the hire's own fill day; hire: its OfferAcceptedDate.
//   value     — active days from openDay to eventDay (or to today while running).
//   status    — 'no-target' | 'met' (event, value <= target) | 'breached' (event
//               late, or running past target) | 'pending' (running, within) |
//               'not-applicable' (a filled hire with no usable event day).
//   breachDay — the day the value first exceeded target (paused days skipped).
// fillMap = headcountFillMap(ALL placements). targets = slaTargetsFor() output.
function slaHireMetrics({ hc, fillMap, evidence, pauses, targets, todayDay } = {}) {
  if (!hc) return null;
  const kind = classifyHeadcount(hc, fillMap);
  const openDay = hc.OpenDate ? spDateIn(hc.OpenDate) : null;
  if (kind === 'cancelled' || !openDay) return null;
  const fillDay = kind === 'filled' ? _slaFillDay(hc, fillMap) : null;
  const firstFrom = days => (days || []).find(d => d >= openDay) || null;
  const cap = d => (fillDay && (!d || d > fillDay) ? fillDay : d);
  const ev = evidence || {};
  const events = {
    firstSubmissionDays: cap(firstFrom(ev.submissionDays)),
    timeToOfferDays:     cap(firstFrom(ev.offerDays)),
    timeToHireDays:      fillDay,
  };
  const metrics = {};
  SLA_HIRE_METRIC_KEYS.forEach(k => {
    const target = targets && targets[k] ? targets[k].value : null;
    const eventDay = events[k] || null;
    if (kind === 'filled' && !eventDay) {
      metrics[k] = { target, value: null, eventDay: null, status: 'not-applicable', breachDay: null };
      return;
    }
    const value = slaActiveDays(openDay, eventDay || todayDay, pauses);
    let status;
    if (target === null) status = 'no-target';
    else if (eventDay) status = value <= target ? 'met' : 'breached';
    else status = value > target ? 'breached' : 'pending';
    metrics[k] = {
      target, value, eventDay, status,
      breachDay: status === 'breached' ? slaDayAfterActiveDays(openDay, target + 1, pauses) : null,
    };
  });
  return { headcountId: String(hc.id), openDay, state: kind, metrics };
}

// Submissions per role per week (role-level — the per-hire clock doesn't apply).
// Weeks run Monday..Sunday, keyed by the Sunday, from the week of the earliest
// dated non-cancelled hire to the last COMPLETE week (the latest Sunday before
// today). A week is active when the timeline touches activeWeekBand on any day
// of it AND a hire was open during it (OpenDate <= Sunday, not filled before
// Monday; cancelled hires and filled hires with no fill day never count).
// rollingAvg (active weeks only) = mean of this and the previous
// rollingWeeks − 1 ACTIVE weeks (inactive weeks are skipped, not zero); null
// until rollingWeeks active weeks exist. breached = target set and rollingAvg <
// target. Episodes = runs of consecutive breached evaluated active weeks
// (inactive weeks don't break a run); ongoing = the run reaches the role's
// latest evaluated week.
// → { weeks: [{ weekEnding, active, submissions, rollingAvg, breached }],
//     episodes: [{ startWeek, endWeek, ongoing, worstAvg }] }
function slaRoleWeeks({ role, timeline, roleHeadcount, fillMap, activity, target = null, todayDay } = {}) {
  const rid = role ? positiveLookupId(role.id) : null;
  const E = CONFIG.SLA.ENGINE;
  const band = slaStageBand(E.activeWeekBand);
  const R = E.rollingWeeks;
  const hires = [];
  (roleHeadcount || []).forEach(hc => {
    if (!hc) return;
    const kind = classifyHeadcount(hc, fillMap);
    const openDay = hc.OpenDate ? spDateIn(hc.OpenDate) : null;
    if (kind === 'cancelled' || !openDay) return;
    const fillDay = kind === 'filled' ? _slaFillDay(hc, fillMap) : null;
    if (kind === 'filled' && !fillDay) return;
    hires.push({ openDay, fillDay });
  });
  const weeks = [], episodes = [];
  if (!hires.length || !todayDay) return { weeks, episodes };
  const subsBySunday = new Map();
  (activity || []).forEach(a => {
    if (rid === null || _slaRowRoleId(a) !== rid) return;
    const raw = a.WeekEndingDate ? spDateIn(a.WeekEndingDate) : null;
    const wk  = raw ? sundayOnOrAfterISO(raw) : null;
    if (!wk) return;
    const n = Number(a.Submitted);
    subsBySunday.set(wk, (subsBySunday.get(wk) || 0) + (Number.isFinite(n) ? n : 0));
  });
  const segments = (timeline && timeline.segments) || [];
  const start = sundayOnOrAfterISO(hires.map(h => h.openDay).sort()[0]);
  const last  = addDaysISO(sundayOnOrAfterISO(todayDay), -7);
  const activeSubs = [];
  for (let sun = start; sun && last && sun <= last; sun = addDaysISO(sun, 7)) {
    const mon = addDaysISO(sun, -6);
    const inBand = segments.some(s => band.includes(s.stage) &&
      (s.from === null || s.from <= sun) && (s.to === null || s.to >= mon));
    const hireOpen = hires.some(h => h.openDay <= sun && (!h.fillDay || h.fillDay >= mon));
    const active = inBand && hireOpen;
    const submissions = subsBySunday.get(sun) || 0;
    let rollingAvg = null;
    if (active) {
      activeSubs.push(submissions);
      if (activeSubs.length >= R) rollingAvg = activeSubs.slice(-R).reduce((a, b) => a + b, 0) / R;
    }
    const breached = target !== null && rollingAvg !== null && rollingAvg < target;
    weeks.push({ weekEnding: sun, active, submissions, rollingAvg, breached });
  }
  let run = null;
  weeks.forEach(w => {
    if (!w.active || w.rollingAvg === null) return;
    if (!w.breached) { run = null; return; }
    if (!run) {
      run = { startWeek: w.weekEnding, endWeek: w.weekEnding, ongoing: false, worstAvg: w.rollingAvg };
      episodes.push(run);
    } else {
      run.endWeek = w.weekEnding;
      if (w.rollingAvg < run.worstAvg) run.worstAvg = w.rollingAvg;
    }
  });
  const lastEval = weeks.filter(w => w.active && w.rollingAvg !== null).pop();
  episodes.forEach(e => { e.ongoing = !!lastEval && e.endWeek === lastEval.weekEnding; });
  return { weeks, episodes };
}

// One project's SLA picture, recomputed from existing lists (no Snapshots).
// null when the project can't have SLAs (slaTargetsFor null: no project, LCI,
// Transformation, Internal, unknown type). Otherwise
//   { targets, hires: [{ roleId, headcountId, openDay, state, metrics }],
//     roles: [{ roleId, weeks, episodes }],
//     breaches: [{ key, metric, roleId, headcountId, breachDay, eventDay, ongoing }],
//     gaps: { undatedHires, cancelledHires, filledNoOfferDate, historyMismatch, noStageHistory } }
// Breach keys are stable for de-dup (N-386): '<metricKey>:<headcountId>' (one per
// hire per metric) and 'submissionsPerWeek:<roleId>:<startWeek>' (one per
// episode). Ordered by breachDay, then key. A target edit recomputes history.
// CONSUMER CONTRACT: `placements` must be ALL-TIME (fill-map rule, N-309) and
// `activity` UNWINDOWED for the project's roles — a 13-week slice makes older
// hires look like they never had a submission and false-breaches them.
// Scoping is done here (roles by projectIdForRole), so project-wide or
// company-wide arrays are fine. Inputs are never mutated.
function computeProjectSla({ project, slaRows, roles, headcount, placements, stageRows, activity, rejectedOffers = null, today = new Date() } = {}) {
  const targets = slaTargetsFor(project, slaRows);
  if (!targets) return null;
  const todayDay = localDayISO(today);
  const pid = positiveLookupId(project.id);
  const projRoles = (roles || []).filter(r => r && pid !== null && projectIdForRole(r) === pid);
  const roleIds = new Set(projRoles.map(r => String(r.id)));
  const inProject = r => roleIds.has(String(_slaRowRoleId(r)));
  const projHc   = (headcount || []).filter(hc => hc && roleIds.has(String(hc.RoleID)));
  const projPl   = (placements || []).filter(p => p && inProject(p));
  const projAct  = (activity || []).filter(a => a && inProject(a));
  const projRej  = rejectedOffers ? rejectedOffers.filter(r => r && inProject(r)) : null;
  const fillMap  = headcountFillMap(placements);
  const stageByRole = groupStageHistoryByRole((stageRows || []).filter(h => h && inProject(h)));
  const hcByRole = groupHeadcountByRole(projHc);
  const weeklyTarget = targets[SLA_WEEKLY_METRIC_KEY] ? targets[SLA_WEEKLY_METRIC_KEY].value : null;
  const gaps = { undatedHires: 0, cancelledHires: 0, filledNoOfferDate: 0, historyMismatch: 0, noStageHistory: 0 };
  const hires = [], roleOut = [], breaches = [];
  projRoles.forEach(role => {
    const rid = String(role.id);
    const rows = stageByRole[rid] || [];
    const timeline = slaRoleTimeline(role, rows);
    if (timeline.noHistory) gaps.noStageHistory++;
    else if (timeline.mismatch) gaps.historyMismatch++;
    const pauses = slaPauseIntervals(timeline, todayDay);
    const evidence = slaRoleEvidence({ role, roleStageRows: rows, activity: projAct, placements: projPl, rejectedOffers: projRej });
    const roleHc = hcByRole.get(rid) || [];
    roleHc.forEach(hc => {
      if (!hc) return;
      if (classifyHeadcount(hc, fillMap) === 'cancelled') { gaps.cancelledHires++; return; }
      if (!hc.OpenDate || !spDateIn(hc.OpenDate)) { gaps.undatedHires++; return; }
      const h = slaHireMetrics({ hc, fillMap, evidence, pauses, targets, todayDay });
      if (!h) return;
      if (h.metrics.timeToHireDays.status === 'not-applicable') gaps.filledNoOfferDate++;
      hires.push(Object.assign({ roleId: rid }, h));
      SLA_HIRE_METRIC_KEYS.forEach(k => {
        const m = h.metrics[k];
        if (m.status !== 'breached') return;
        breaches.push({ key: `${k}:${h.headcountId}`, metric: k, roleId: rid, headcountId: h.headcountId,
          breachDay: m.breachDay, eventDay: m.eventDay, ongoing: !m.eventDay });
      });
    });
    const wk = slaRoleWeeks({ role, timeline, roleHeadcount: roleHc, fillMap, activity: projAct, target: weeklyTarget, todayDay });
    roleOut.push({ roleId: rid, weeks: wk.weeks, episodes: wk.episodes });
    wk.episodes.forEach(e => breaches.push({
      key: `${SLA_WEEKLY_METRIC_KEY}:${rid}:${e.startWeek}`, metric: SLA_WEEKLY_METRIC_KEY, roleId: rid,
      headcountId: null, breachDay: e.startWeek, eventDay: e.endWeek, ongoing: e.ongoing,
    }));
  });
  breaches.sort((a, b) => (a.breachDay === b.breachDay
    ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    : (a.breachDay < b.breachDay ? -1 : 1)));
  return { targets, hires, roles: roleOut, breaches, gaps };
}

// Attainment per metric over [fromDay, toDay] (inclusive; null bound = open).
// → { [metricKey]: { target, met, breached, pending, pct } } for every
// CONFIG.SLA.METRICS key. Day metrics: met = hires whose event day is in range,
// breached = hires whose breach day is in range, pending = hires still running
// within target (not period-bound). Weekly: evaluated active weeks whose Sunday is
// in range. pct = round(met ÷ (met + breached) × 100); null when nothing counts
// or there is no target. No RAG here — thresholds belong to the panel (N-384).
// result null → null.
function slaAttainment(result, fromDay = null, toDay = null) {
  if (!result) return null;
  const inRange = d => !!d && (!fromDay || d >= fromDay) && (!toDay || d <= toDay);
  const out = {};
  CONFIG.SLA.METRICS.forEach(m => {
    const target = result.targets && result.targets[m.key] ? result.targets[m.key].value : null;
    let met = 0, breached = 0, pending = 0;
    if (target !== null && m.key === SLA_WEEKLY_METRIC_KEY) {
      (result.roles || []).forEach(r => (r.weeks || []).forEach(w => {
        if (!w.active || w.rollingAvg === null || !inRange(w.weekEnding)) return;
        if (w.breached) breached++; else met++;
      }));
    } else if (target !== null) {
      (result.hires || []).forEach(h => {
        const x = h.metrics && h.metrics[m.key];
        if (!x) return;
        if (x.status === 'met' && inRange(x.eventDay)) met++;
        else if (x.status === 'breached' && inRange(x.breachDay)) breached++;
        else if (x.status === 'pending') pending++;
      });
    }
    out[m.key] = { target, met, breached, pending, pct: met + breached ? Math.round(met / (met + breached) * 100) : null };
  });
  return out;
}

// ── SLA panel model (N-384 / DA-4) ───────────────────────────────────────────
// Pure: no Graph, no DOM. Turns computeProjectSla() / slaAttainment() output into what the
// SLA panel (project) and tile (company) render. RAG bands, periods, labels and the breach-row
// cap all come from CONFIG.SLA (RAG, PERIODS, PERIOD_DEFAULT, PANEL_BREACH_ROWS).

// Throws on a broken CONFIG.SLA panel block. Run at load.
function slaPanelConfigCheck(cfg = CONFIG.SLA) {
  const rag = cfg && cfg.RAG;
  if (!rag) throw new Error('SLA.RAG missing');
  if (!Number.isInteger(rag.green) || !Number.isInteger(rag.amber) || rag.amber < 0 || rag.green > 100 || rag.amber >= rag.green) {
    throw new Error('SLA.RAG: green and amber must be integers with 0 <= amber < green <= 100');
  }
  ['green', 'amber', 'red', 'grey'].forEach(k => {
    if (!rag.LABELS || typeof rag.LABELS[k] !== 'string' || !rag.LABELS[k]) throw new Error(`SLA.RAG.LABELS.${k} missing`);
  });
  const periods = cfg.PERIODS;
  if (!Array.isArray(periods) || !periods.length) throw new Error('SLA.PERIODS missing');
  const keys = periods.map(p => p && p.key);
  if (keys.some(k => typeof k !== 'string' || !k) || new Set(keys).size !== keys.length) {
    throw new Error('SLA.PERIODS: keys must be unique, non-empty strings');
  }
  periods.forEach(p => {
    if (typeof p.label !== 'string' || !p.label) throw new Error(`SLA.PERIODS "${p.key}": label missing`);
    if (p.days !== null && !(Number.isInteger(p.days) && p.days > 0)) throw new Error(`SLA.PERIODS "${p.key}": days must be null or a positive integer`);
  });
  if (!keys.includes(cfg.PERIOD_DEFAULT)) throw new Error('SLA.PERIOD_DEFAULT is not one of SLA.PERIODS');
  if (!Number.isInteger(cfg.PANEL_BREACH_ROWS) || cfg.PANEL_BREACH_ROWS < 1) throw new Error('SLA.PANEL_BREACH_ROWS must be an integer >= 1');
  // N-385: the roll-up period is a bounded window, never the all-time key.
  const roll = periods.find(p => p.key === cfg.ROLLUP_PERIOD);
  if (!roll || !(Number.isInteger(roll.days) && roll.days > 0)) throw new Error('SLA.ROLLUP_PERIOD must be a SLA.PERIODS key with a positive day count');
  return true;
}
slaPanelConfigCheck();

// Attainment % → 'green' | 'amber' | 'red'; null / non-numeric (nothing evaluated) → 'grey'.
function slaRag(pct, cfg = CONFIG.SLA.RAG) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return 'grey';
  if (pct >= cfg.green) return 'green';
  if (pct >= cfg.amber) return 'amber';
  return 'red';
}

const _SLA_RAG_RANK = { green: 1, amber: 2, red: 3 };

// The worst of several RAGs; grey entries are ignored, none rated → 'grey'.
function _slaWorstRag(rags) {
  let worst = 'grey';
  (rags || []).forEach(r => {
    if (_SLA_RAG_RANK[r] && (worst === 'grey' || _SLA_RAG_RANK[r] > _SLA_RAG_RANK[worst])) worst = r;
  });
  return worst;
}

// Panel period key → { key, label, fromDay, toDay }. days N = the last N days INCLUDING today;
// days null = all time (both bounds null). An unknown key falls back to PERIOD_DEFAULT.
function slaPanelPeriod(key, today = new Date()) {
  const periods = CONFIG.SLA.PERIODS;
  const p = periods.find(x => x.key === key) || periods.find(x => x.key === CONFIG.SLA.PERIOD_DEFAULT);
  if (p.days === null) return { key: p.key, label: p.label, fromDay: null, toDay: null };
  const toDay = localDayISO(today);
  return { key: p.key, label: p.label, fromDay: addDaysISO(toDay, -(p.days - 1)), toDay };
}

// Plain-English notes for the data gaps that make the numbers softer. Only non-zero gaps
// speak; cancelledHires is expected and never listed. [] when clean.
function slaGapNotes(gaps) {
  const g = gaps || {};
  const n = k => Number(g[k]) || 0;
  const many = (c, one, more) => `${c} ${c === 1 ? one : more}`;
  const out = [];
  if (n('undatedHires')) out.push(`${many(n('undatedHires'), 'hire has', 'hires have')} no open date, so ${n('undatedHires') === 1 ? 'it is' : 'they are'} not measured.`);
  if (n('filledNoOfferDate')) out.push(`${many(n('filledNoOfferDate'), 'filled hire has', 'filled hires have')} no offer-accepted date, so time to hire cannot be measured.`);
  if (n('noStageHistory')) out.push(`${many(n('noStageHistory'), 'role has', 'roles have')} no stage history, so On-hold time cannot be excluded.`);
  if (n('historyMismatch')) out.push(`${many(n('historyMismatch'), 'role has', 'roles have')} stage history that disagrees with its current stage, so ongoing On-hold time is ignored.`);
  return out;
}

// One project's panel. result = computeProjectSla() output (null → null). roles / headcount
// label the breach rows. Attainment and RAG follow the period; the breach list never does.
//   { period, hasTargets, rag, ongoingBreaches, gapNotes,
//     metrics:    [{ key, label, unit, noun, target, met, breached, pending, pct, rag, ongoing }],
//     breachRows: [{ key, metric, metricLabel, roleId, roleLabel, hireLabel, target, value,
//                    worstAvg, breachDay, eventDay, ongoing, status }] }
// Breach rows: ongoing first, then breachDay descending, then key. status 'ongoing' | 'resolved'
// (a late event, or an ended weekly episode). value = the hire's days now (ongoing) or at the
// event (resolved); weekly rows carry worstAvg instead and hireLabel null. Labels are plain text.
function slaPanelModel({ result, roles, headcount, periodKey, today = new Date() } = {}) {
  if (!result) return null;
  const period = slaPanelPeriod(periodKey, today);
  const att = slaAttainment(result, period.fromDay, period.toDay);
  const ongoingBy = {};
  (result.breaches || []).forEach(b => { if (b.ongoing) ongoingBy[b.metric] = (ongoingBy[b.metric] || 0) + 1; });
  const metrics = CONFIG.SLA.METRICS.map(m => {
    const a = att[m.key];
    return {
      key: m.key, label: m.label, unit: m.unit,
      noun: m.key === SLA_WEEKLY_METRIC_KEY ? 'weeks' : 'hires',
      target: a.target, met: a.met, breached: a.breached, pending: a.pending, pct: a.pct,
      rag: slaRag(a.pct), ongoing: ongoingBy[m.key] || 0,
    };
  });
  const roleMap = new Map((roles || []).filter(Boolean).map(r => [String(r.id), r]));
  const hcMap = new Map((headcount || []).filter(Boolean).map(h => [String(h.id), h]));
  const hireMap = new Map((result.hires || []).map(h => [String(h.headcountId), h]));
  const episodeMap = new Map();
  (result.roles || []).forEach(r => (r.episodes || []).forEach(e => episodeMap.set(`${r.roleId}:${e.startWeek}`, e)));
  const labelOf = Object.fromEntries(CONFIG.SLA.METRICS.map(m => [m.key, m.label]));
  const breachRows = (result.breaches || []).map(b => {
    const role = roleMap.get(String(b.roleId));
    const tgt = result.targets && result.targets[b.metric] ? result.targets[b.metric].value : null;
    const row = {
      key: b.key, metric: b.metric, metricLabel: labelOf[b.metric] || b.metric,
      roleId: String(b.roleId), roleLabel: role ? headcountRoleLabel(role) : `Role ${b.roleId}`,
      hireLabel: null, target: tgt, value: null, worstAvg: null,
      breachDay: b.breachDay, eventDay: b.eventDay, ongoing: !!b.ongoing, status: b.ongoing ? 'ongoing' : 'resolved',
    };
    if (b.headcountId !== null && b.headcountId !== undefined) {
      const hc = hcMap.get(String(b.headcountId));
      row.hireLabel = hc ? (hc.Title || headcountLabel(hc.Sequence)) : `Hire ${b.headcountId}`;
      const h = hireMap.get(String(b.headcountId));
      const mm = h && h.metrics ? h.metrics[b.metric] : null;
      row.value = mm ? mm.value : null;
    } else {
      const e = episodeMap.get(`${b.roleId}:${b.breachDay}`);
      row.worstAvg = e ? e.worstAvg : null;
    }
    return row;
  });
  breachRows.sort((a, b) =>
    (a.ongoing === b.ongoing ? 0 : (a.ongoing ? -1 : 1)) ||
    (a.breachDay === b.breachDay ? 0 : (a.breachDay > b.breachDay ? -1 : 1)) ||
    (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0)));
  return {
    period,
    hasTargets: metrics.some(m => m.target !== null),
    rag: _slaWorstRag(metrics.map(m => m.rag)),
    ongoingBreaches: breachRows.filter(r => r.ongoing).length,
    gapNotes: slaGapNotes(result.gaps),
    metrics, breachRows,
  };
}

// The line a project gets on the Company tile.
function _slaProjectSummary(rag, problems, ongoing) {
  const on = `${ongoing} ongoing ${ongoing === 1 ? 'breach' : 'breaches'}`;
  if (problems.length) return problems.map(p => `${p.label} ${p.pct}%`).join(' · ') + (ongoing ? ` · ${on}` : '');
  if (rag === 'grey') return ongoing ? `Not rated · ${on}` : 'Not rated';
  return ongoing ? `Ongoing breaches: ${ongoing}` : 'No problem areas';
}

// The Company Dashboard tile. projects = the (already internal-filtered) projects; results =
// { [projectId]: computeProjectSla() output }. Null results (LCI / Transformation / Internal /
// unknown type) are skipped. Pooled per metric by COUNTS over projects that have a target for it:
// round(sum met / (sum met + sum breached) x 100), not a mean of project percentages. A project's
// RAG is its worst rated metric. One row per project, worst first.
//   { period, counts: { green, amber, red, grey },
//     metrics: [{ key, label, unit, noun, met, breached, pending, pct, rag, rated }],
//     rows: [{ projectId, name, rag, ongoingBreaches, problems: [{ key, label, pct, rag }], summary }] }
function slaPortfolioModel({ projects, results, periodKey, today = new Date() } = {}) {
  const period = slaPanelPeriod(periodKey, today);
  const pools = {};
  CONFIG.SLA.METRICS.forEach(m => { pools[m.key] = { met: 0, breached: 0, pending: 0, rated: 0 }; });
  const rows = [];
  (projects || []).forEach(p => {
    const res = p && results ? results[String(p.id)] : null;
    if (!res) return;
    const att = slaAttainment(res, period.fromDay, period.toDay);
    const rags = [], problems = [], rowMetrics = [];
    CONFIG.SLA.METRICS.forEach(m => {
      const a = att[m.key];
      if (a.target === null) { rowMetrics.push({ key: m.key, label: m.label, target: null, pct: null, rag: 'grey' }); return; }
      rowMetrics.push({ key: m.key, label: m.label, target: a.target, pct: a.pct, rag: slaRag(a.pct) });
      const pool = pools[m.key];
      pool.met += a.met; pool.breached += a.breached; pool.pending += a.pending;
      if (a.pct === null) return;
      pool.rated++;
      const rag = slaRag(a.pct);
      rags.push(rag);
      if (rag === 'amber' || rag === 'red') problems.push({ key: m.key, label: m.label, pct: a.pct, rag });
    });
    problems.sort((a, b) => a.pct - b.pct);
    const ongoing = (res.breaches || []).filter(b => b.ongoing).length;
    const rag = _slaWorstRag(rags);
    rows.push({
      projectId: String(p.id), name: p.CustomerName || `Project ${p.id}`, rag,
      ongoingBreaches: ongoing, problems, summary: _slaProjectSummary(rag, problems, ongoing),
      metrics: rowMetrics,   // N-385: all four metrics, for the roll-up table
    });
  });
  const order = { red: 0, amber: 1, green: 2, grey: 3 };
  rows.sort((a, b) => (order[a.rag] - order[b.rag]) || (b.ongoingBreaches - a.ongoingBreaches) || a.name.localeCompare(b.name));
  const counts = { green: 0, amber: 0, red: 0, grey: 0 };
  rows.forEach(r => { counts[r.rag]++; });
  const metrics = CONFIG.SLA.METRICS.map(m => {
    const pool = pools[m.key];
    const pct = pool.met + pool.breached ? Math.round(pool.met / (pool.met + pool.breached) * 100) : null;
    return {
      key: m.key, label: m.label, unit: m.unit, noun: m.key === SLA_WEEKLY_METRIC_KEY ? 'weeks' : 'hires',
      met: pool.met, breached: pool.breached, pending: pool.pending, pct, rag: slaRag(pct), rated: pool.rated,
    };
  });
  return { period, counts, metrics, rows };
}

// ── SLA roll-up (N-385 / DA-5) ────────────────────────────────────────
// The portfolio table on the Command Centre (Project Health detail) and in Report Builder
// (company scope). Fixed period CONFIG.SLA.ROLLUP_PERIOD. Pure; the reads are
// getSlaRollupInputs() (api.js), the markup is sla-rollup.js.

// The projects that can appear. projectIds = getUserProjectIds() (null = every project, else an
// array of ids). Active, client projects only. SLA eligibility by type is decided later:
// computeProjectSla gives null for LCI / Transformation / Internal and slaPortfolioModel skips those.
function slaRollupProjects({ projects, projectIds } = {}) {
  const ids = Array.isArray(projectIds) ? new Set(projectIds.map(String)) : null;
  return (projects || []).filter(p => p
    && isProjectActive(p)
    && !isKpiExcludedProject(p)
    && (!ids || ids.has(String(p.id))));
}

// computeProjectSla for each project, keyed by String(project id). Roles, activity, placements
// and the rest are passed whole: computeProjectSla scopes them per project.
function slaProjectResults({ projects, slaRows, roles, headcount, placements, stageRows, activity, rejectedOffers, today = new Date() } = {}) {
  const results = {};
  (projects || []).forEach(p => {
    results[String(p.id)] = computeProjectSla({ project: p, slaRows, roles, headcount, placements, stageRows, activity, rejectedOffers, today });
  });
  return results;
}

// slaPortfolioModel over the fixed roll-up period. One owner for that period.
function slaRollupModel({ projects, results, today = new Date() } = {}) {
  return slaPortfolioModel({ projects, results, periodKey: CONFIG.SLA.ROLLUP_PERIOD, today });
}
