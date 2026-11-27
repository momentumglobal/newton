// tests/assert-role-stage.js - N-549 (AMCP-5): the stage-move rules around update_role_stage that need no Graph:
// linearRoleStages() (js/headcount.js), the DOM-free applyRoleStageChange / checkRoleStageMove (js/api-headcount.js),
// the awaited-history plumbing in js/api.js, the Roles page rewire (js/pages.js) and the lint that guards the new writer.
// The tool and the Stage sequence run against the real loader and write shim in tests/mcp-stage-check.js.
// Loads after tests/assertions.js and pushes into ASSERTIONS. Source-scan assertions skip under tests/index.html,
// where ALL_SOURCES / MCP_SOURCES are not defined.

ASSERTIONS.push(
  {
    name: 'N-549 AC2 linearRoleStages() is Backlog … Offered in ROLE_STAGES order, derived from the config arrays (never a literal) and free of every terminal and branch stage',
    fn: function () {
      _assertEqual(linearRoleStages(), ['Backlog', 'Planning', 'Sourcing', 'Submitted', 'Interview 1', 'Interview 2+', 'Final Interview', 'Offered'], 'the linear set');
      _assertEqual(linearRoleStages(), CONFIG.ROLE_STAGES.filter(function (s) { return CONFIG.ROLE_STAGE_TERMINAL.indexOf(s) === -1 && CONFIG.ROLE_STAGES_BRANCH.indexOf(s) === -1; }), 'derived from the config arrays');
      linearRoleStages().forEach(function (s) {
        _assertEqual(CONFIG.ROLE_STAGE_TERMINAL.indexOf(s) === -1 && CONFIG.ROLE_STAGES_BRANCH.indexOf(s) === -1, true, s + ' is not terminal or branch');
      });
    },
  },
  {
    name: 'N-549 AC5 the Roles page checks with checkRoleStageMove BEFORE its optimistic update and writes through applyRoleStageChange({ preChecked }); it keeps no second copy of the gate, the rule or the history write',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      var src = ALL_SOURCES['pages.js'];
      var at = src.indexOf('async function updateRoleStage(');
      var end = src.indexOf('async function showAddRoleForm(');
      _assertEqual(at > -1 && end > at, true, 'updateRoleStage found');
      var body = src.slice(at, end).replace(/\/\/.*$/gm, '');
      _assertEqual(body.indexOf('checkRoleStageMove(') > -1 && body.indexOf('checkRoleStageMove(') < body.indexOf('optimisticWrite('), true, 'the check runs before the optimistic apply');
      _assertEqual(body.includes('applyRoleStageChange(roleId, newStage, { preChecked: true })'), true, 'commit goes through applyRoleStageChange with preChecked');
      _assertEqual(/checkRoleWrite\(|checkRoleStageChange\(|updateRoleWithHistory\(/.test(body), false, 'no inline gate, rule or history write left in the page');
      _assertEqual(/toast\(check\.reason, \{ type: 'error' \}\);\s*restoreBadge\(\);\s*return;/.test(body), true, 'a refusal still toasts, restores the badge and returns');
    },
  },
  {
    name: 'N-549 AC3 / AC4 source: updateRoleWithHistory takes { source, awaitHistory } and _logRoleHistory adds Source only when asked; applyRoleStageChange and checkRoleStageMove are DOM-free and live in api-headcount.js',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined') _skip('needs ALL_SOURCES (tests/run.js)');
      var api = ALL_SOURCES['api.js'].replace(/\/\/.*$/gm, '');
      _assertEqual(api.includes('async function updateRoleWithHistory(roleId, fields, opts = {})'), true, 'updateRoleWithHistory signature');
      _assertEqual(api.includes('async function _logRoleHistory(oldRole, newFields, source)'), true, '_logRoleHistory signature');
      _assertEqual(/if \(source\) row\.Source = source;/.test(api), true, 'Source only when a source is given');
      var hc = ALL_SOURCES['api-headcount.js'];
      _assertEqual(/async function checkRoleStageMove\(/.test(hc) && /async function applyRoleStageChange\(/.test(hc), true, 'both functions are declared in api-headcount.js');
      var from = hc.indexOf('async function checkRoleStageMove(');
      var code = hc.slice(from).replace(/\/\/.*$/gm, '');
      _assertEqual(/\b(document|window|toast|optimisticWrite|localStorage|sessionStorage)\b/.test(code.slice(0, code.indexOf('async function', code.indexOf('async function applyRoleStageChange(') + 10) > 0 ? code.indexOf('async function', code.indexOf('async function applyRoleStageChange(') + 10) : code.length)), false, 'no DOM, toast or optimistic-update call in the shared sequence');
      _assertEqual(/'(Backlog|Planning|Sourcing|Submitted|Offered|Closed|Cancelled|On-hold)'/.test(code.slice(0, 1800)), false, 'no stage literal in the shared sequence');
    },
  },
  {
    name: 'N-549 AC13 lintMcpWriteTools: an apply…() call is write-shaped (flagged in a preview or helper, allowed only for an approved writer inside a commit); checkRoleStageMove in a preview is read-only; applyRoleStageChange is approved; the shipped write tools file is clean',
    fn: function () {
      var rules = function (s) { return lintMcpWriteTools(s, CONFIG).map(function (v) { return v.rule; }); };
      var tool = function (body) { return 'async function stPreview(a) {\n' + body.p + '\n}\nasync function stCommit(p) {\n' + body.c + '\n}\nMCP_TOOLS.push({ name: "t", roles: ["admin"], write: true, preview: stPreview, commit: stCommit });\n'; };
      _assertEqual(rules(tool({ p: '  return { plan: await checkRoleStageMove(1, "Planning") };', c: '  return await applyRoleStageChange(1, "Planning", { source: "claude", awaitHistory: true });' })), [], 'the shape update_role_stage uses is clean');
      _assertEqual(rules(tool({ p: '  return applyRoleStageChange(1, "Planning");', c: '  return 1;' })), ['write'], 'apply… in a preview is flagged');
      _assertEqual(rules('function help() { return applyRoleStageChange(1, "x"); }\nasync function c(p) { return help(); }\nMCP_TOOLS.push({ commit: c });\n'), ['write'], 'apply… in a helper the commit calls is flagged');
      _assertEqual(rules('async function c(p) { return applySomethingElse(p); }\nMCP_TOOLS.push({ commit: c });\n'), ['write'], 'an unapproved apply… writer in a commit is flagged');
      _assertEqual(MCP_APPROVED_WRITERS.indexOf('applyRoleStageChange') > -1, true, 'applyRoleStageChange is an approved writer');
      if (typeof MCP_SOURCES === 'undefined') _skip('Source scan needs filesystem access — runs under node tests/run.js, not in the browser runner.');
      _assertEqual(lintMcpWriteTools(MCP_SOURCES['newton-write-tools.js'], CONFIG).map(function (v) { return v.line + ' ' + v.rule + ': ' + v.problem; }), [], 'lintMcpWriteTools on mcp/newton-write-tools.js');
    },
  },
);
