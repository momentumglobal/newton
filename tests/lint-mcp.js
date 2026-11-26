// tests/lint-mcp.js — N-393 guard: mcp/newton-tools.js stays a thin, read-only, policy-bound
// layer over Newton's live code (specs/N-378.md MCP-D4/D6/D7/D8, specs/N-393.md).
//
// The Newton for Claude tools run inside a local MCP server with the user's own token. The
// fetch shim (mcp/bootstrap/loader.js) already refuses writes and non-allowlisted lists at
// runtime; this lint fails the build BEFORE such code ships, and also guards what the shim
// can't see: Newton logic re-written in the tools file, DOM access, and live rows spread
// into a result (which would carry Budget / CandidateName / Notes out to Claude).
//
// Rules, over mcp/newton-tools.js:
//   graph     — no Graph / SharePoint path text: graph.microsoft.com, /sites/, /lists/, $batch,
//               listPath(. Checked with comments removed but strings kept (paths live in strings).
//   transport — no direct transport: getItems / _getItemsRaw / getItem / graphRequest / fetch.
//   write     — no call whose name starts create|update|delete|save|sync|write|acknowledge|
//               remove|set|post|send, nor createItem / updateItem / deleteItem.
//   dom       — no document / window / navigator / localStorage / sessionStorage identifier,
//               no ghost-mode setters or keys (_setGhost, newton_ghost).
//   getter    — every get<Name>( call names a getter in MCP_GETTER_LISTS, and every list that
//               registry names is in CONFIG.MCP.allowedLists.
//   spread    — no `...` and no Object.assign( (a live row must never be copied into output);
//               a line may opt out with `// mcp-spread-ok: <reason>`.
// The code rules (transport, write, dom, getter, spread) run with comments AND string /
// template text blanked (template ${ } expressions are kept), so prose and messages never
// trip them. Member calls (x.getTime(), map.set()) are ignored.
// Limitation: a regex literal containing a quote or backtick would confuse the stripper.
// newton-tools.js has none; keep it that way.
//
// Pure function over data. tests/run.js passes MCP_SOURCES; the assertions skip when it is
// undefined (browser harness, no filesystem).

// Getter -> the SharePoint lists it reads. A getter the tools call must be listed here, and
// every list here must be in CONFIG.MCP.allowedLists (MCP-D7).
var MCP_GETTER_LISTS = {
  getProjects:                ['Projects'],
  getRolesForProject:         ['Roles'],
  getAllRoles:                ['Roles'],
  getWeeklyActivity:          ['WeeklyActivity'],
  getActivityForAnalytics:    ['WeeklyActivity'],
  getPlacements:              ['Placements'],
  getHistoricalPlacements:    ['Placements', 'Roles', 'RoleHeadcount'],
  getRoleHistory:             ['RoleHistory'],
  getRoleStageHistory:        ['RoleHistory'],
  getAllHeadcount:            ['RoleHeadcount'],
  getRoleHeadcountState:      ['RoleHeadcount', 'Placements'],
  getPlacementHeadcountIds:   ['Placements'],
  getAssignments:             ['Assignments'],
  getAnomalyAcks:             ['AnomalyAcks'],
  getTalentPartnerDisplayMap: ['UserAssignments'],
  getPeople:                  ['People'],            // N-394
  getSalesForecasts:          ['SalesForecasts'],    // N-394
  getCurrentAssignmentsByEmployee: ['Assignments'],  // N-394
  getBusinessGoals:           ['BusinessGoals'],         // N-535
  getBusinessActions:         ['BusinessActions'],       // N-535
  getBusinessGoalUpdates:     ['BusinessGoalUpdates'],   // N-535
  getBizGoalOwnerCandidates:  ['UserAssignments', 'LeadershipAccess'],   // N-535
};

// The tools that build a company-wide aggregate must call excludeInternalProjectData (N-333);
// checked with lintInternalKpiConsumers (lint-internal-kpi.js) over MCP_SOURCES.
var MCP_INTERNAL_KPI_CONSUMERS = [
  { file: 'newton-tools.js', fn: 'mcpActivitySummary',   call: 'excludeInternalProjectData' },
  { file: 'newton-tools.js', fn: 'mcpListPlacements',    call: 'excludeInternalProjectData' },
  { file: 'newton-tools.js', fn: 'mcpTimeToFill',        call: 'excludeInternalProjectData' },
  { file: 'newton-tools.js', fn: 'mcpProjectScorecards', call: 'excludeInternalProjectData' },
];

// Returns { noComments, code } — same length and line breaks as `src`. noComments: comments
// blanked. code: comments and string / template text blanked, ${ } expressions kept.
function _mcpLintStrip(src) {
  var s = String(src);
  var nc = s.split('');
  var code = s.split('');
  var blank = function (arr, from, to) {
    for (var k = from; k < to; k++) if (arr[k] !== '\n') arr[k] = ' ';
  };
  var i = 0;
  var stack = [];   // template nesting: brace depth at each open ${ }
  var depth = 0;
  while (i < s.length) {
    var c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') {
      var e = s.indexOf('\n', i); if (e === -1) e = s.length;
      blank(nc, i, e); blank(code, i, e); i = e; continue;
    }
    if (c === '/' && n === '*') {
      var e2 = s.indexOf('*/', i + 2); e2 = e2 === -1 ? s.length : e2 + 2;
      blank(nc, i, e2); blank(code, i, e2); i = e2; continue;
    }
    if (c === '\'' || c === '"') {
      var j = i + 1;
      while (j < s.length && s[j] !== c && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1;
      blank(code, i + 1, j); i = j + 1; continue;
    }
    if (c === '`' || (c === '}' && stack.length && stack[stack.length - 1] === depth)) {
      if (c === '}') { stack.pop(); }
      var t = i + 1;
      while (t < s.length) {
        if (s[t] === '\\') { t += 2; continue; }
        if (s[t] === '`') break;
        if (s[t] === '$' && s[t + 1] === '{') break;
        t++;
      }
      blank(code, i + 1, t);
      if (s[t] === '$') { stack.push(depth); i = t + 2; continue; }
      i = t + 1; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return { noComments: nc.join(''), code: code.join('') };
}

function _mcpLineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

// src: mcp/newton-tools.js text. cfg: CONFIG. Returns [{ line, rule, problem }] — empty when clean.
function lintMcpTools(src, cfg) {
  var out = [];
  var raw = String(src || '');
  var rawLines = raw.split('\n');
  var st = _mcpLintStrip(raw);
  var push = function (text, idx, rule, problem) {
    out.push({ line: _mcpLineOf(text, idx), rule: rule, problem: problem });
  };
  var scan = function (text, re, rule, msg) {
    var m; re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) push(text, m.index, rule, msg(m));
  };
  scan(st.noComments, /graph\.microsoft\.com|\/sites\/|\/lists\/|\$batch|\blistPath\s*\(/g, 'graph',
    function (m) { return 'Graph / SharePoint path text "' + m[0] + '" — read through an api getter'; });
  scan(st.code, /(^|[^\w$.])(getItems|_getItemsRaw|getItem|graphRequest|fetch)\s*\(/g, 'transport',
    function (m) { return 'direct transport call ' + m[2] + '() — read through a registered api getter'; });
  scan(st.code, /(^|[^\w$.])((?:create|update|delete|save|sync|write|acknowledge|remove|set|post|send)[A-Z]\w*|createItem|updateItem|deleteItem)\s*\(/g, 'write',
    function (m) { return 'write-shaped call ' + m[2] + '() — Newton for Claude is read-only'; });
  scan(st.code, /(^|[^\w$.])(document|window|navigator|localStorage|sessionStorage|_setGhost\w*)\b/g, 'dom',
    function (m) { return 'browser / ghost-mode identifier ' + m[2] + ' — the tools run with no DOM'; });
  scan(st.noComments, /newton_ghost/g, 'dom', function () { return 'ghost-mode key — the server never sets ghost keys'; });
  scan(st.code, /(^|[^\w$.])(get[A-Z]\w*)\s*\(/g, 'getter', function (m) {
    if (m[2] === 'getItems' || m[2] === 'getItem') return null;   // reported by the transport rule
    return MCP_GETTER_LISTS[m[2]] ? null : 'getter ' + m[2] + '() is not in MCP_GETTER_LISTS (tests/lint-mcp.js)';
  });
  var spreadRe = /\.\.\.|(^|[^\w$.])Object\.assign\s*\(/g;
  var m;
  while ((m = spreadRe.exec(st.code)) !== null) {
    var line = _mcpLineOf(st.code, m.index);
    if (/\/\/\s*mcp-spread-ok\s*:\s*\S+/.test(rawLines[line - 1] || '')) continue;
    out.push({ line: line, rule: 'spread', problem: 'spread / Object.assign — build output from explicit picks (MCP-D6)' });
  }
  var allowed = (cfg && cfg.MCP && cfg.MCP.allowedLists) || [];
  Object.keys(MCP_GETTER_LISTS).forEach(function (g) {
    MCP_GETTER_LISTS[g].forEach(function (list) {
      if (allowed.indexOf(list) === -1) out.push({ line: 0, rule: 'getter', problem: 'MCP_GETTER_LISTS.' + g + ' reads ' + list + ', which is not in CONFIG.MCP.allowedLists' });
    });
  });
  return out.filter(function (v) { return v.problem; }).sort(function (a, b) { return a.line - b.line; });
}

// ── N-546 (specs/N-545.md AMCP-A5): write tools ─────────────────────────────────────────
// mcp/newton-write-tools.js (from N-548) holds the preview + commit tools. Writes reach
// Graph only through Newton's own writers, and only from a commit: the server arms the fetch
// shim around commit(plan, ctx) and nothing else, so a writer anywhere else would just 405 -
// this lint stops it shipping. N-548 / N-549 / N-550 add their extracted DOM-free writers
// (e.g. applyRoleStageChange) here, each with a reason.
var MCP_APPROVED_WRITERS = [
  'createWeeklyActivity',   // N-548: N-315 ProjectID resolve + verify/heal
  'updateItem',             // N-548: weekly edits (the nine counts + Source / SubmittedAt)
  'updateRoleWithHistory',  // N-549: Stage + RoleHistory
  'fireNotification',       // N-548: the Hires > 0 placement prompt (AMCP-A9)
  'createSavedReport',      // N-550: draft report only
  'updateSavedReport',      // N-550
];

// Top-level `function name(` / `async function name(` declarations in `code` (comments and
// strings already blanked): [{ name, start, end }], end = index after the body's closing brace.
function _mcpTopFunctions(code) {
  var out = [];
  var re = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  var m;
  while ((m = re.exec(code)) !== null) {
    var i = m.index + m[0].length;
    var paren = 1;
    while (i < code.length && paren > 0) { if (code[i] === '(') paren++; else if (code[i] === ')') paren--; i++; }
    var open = code.indexOf('{', i);
    if (open === -1) continue;
    var depth = 0;
    var j = open;
    for (; j < code.length; j++) {
      if (code[j] === '{') depth++;
      else if (code[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    out.push({ name: m[1], start: m.index, end: j });
    re.lastIndex = j;
  }
  return out;
}

// src: mcp/newton-write-tools.js text. cfg: CONFIG. Returns [{ line, rule, problem }].
// The graph / transport / dom / spread / getter rules are lintMcpTools' own; `write` becomes:
// a write-shaped call is allowed only when it names an MCP_APPROVED_WRITERS function AND sits
// directly in a top-level function named by a `commit: <name>` property. Previews, helpers
// and top-level code never write. `commit` must name a top-level function (no inline one).
function lintMcpWriteTools(src, cfg) {
  var raw = String(src || '');
  var st = _mcpLintStrip(raw);
  var out = lintMcpTools(raw, cfg).filter(function (v) { return v.rule !== 'write' && v.line !== 0; });
  var fns = _mcpTopFunctions(st.code);
  var fnNames = {};
  fns.forEach(function (f) { fnNames[f.name] = true; });
  var commits = {};
  var m;
  var named = /(^|[^\w$.])commit\s*:\s*([A-Za-z_$][\w$]*)\s*(?=[,}\n\r])/g;
  while ((m = named.exec(st.code)) !== null) {
    if (m[2] === 'async' || m[2] === 'function') continue;
    commits[m[2]] = true;
    if (!fnNames[m[2]]) out.push({ line: _mcpLineOf(st.code, m.index), rule: 'write', problem: 'commit: ' + m[2] + ' is not a top-level function in this file' });
  }
  var inline = /(^|[^\w$.])commit\s*:\s*(async\b|function\b|\(|[A-Za-z_$][\w$]*\s*=>)|(^|[^\w$.])commit\s*\([^)]*\)\s*\{/g;
  while ((m = inline.exec(st.code)) !== null) {
    out.push({ line: _mcpLineOf(st.code, m.index), rule: 'write', problem: 'commit must name a top-level function, not an inline one' });
  }
  var writeRe = /(^|[^\w$.])((?:create|update|delete|save|sync|write|acknowledge|remove|set|post|send)[A-Z]\w*|createItem|updateItem|deleteItem)\s*\(/g;
  while ((m = writeRe.exec(st.code)) !== null) {
    var at = m.index + m[1].length;
    var owner = null;
    fns.forEach(function (f) { if (f.start <= at && at < f.end) owner = f; });
    var name = m[2];
    if (owner && commits[owner.name]) {
      if (MCP_APPROVED_WRITERS.indexOf(name) === -1) out.push({ line: _mcpLineOf(st.code, at), rule: 'write', problem: 'writer ' + name + '() in commit ' + owner.name + ' is not in MCP_APPROVED_WRITERS (tests/lint-mcp.js)' });
      continue;
    }
    out.push({ line: _mcpLineOf(st.code, at), rule: 'write', problem: 'write-shaped call ' + name + '() outside a commit function' + (owner ? ' (in ' + owner.name + ')' : '') + ' - previews and helpers never write' });
  }
  return out.sort(function (a, b) { return a.line - b.line; });
}
