// mcp/newton-tools.js - Newton for Claude: live tool registry (N-392; tools arrive in N-393/N-394).
//
// Served from GitHub Pages and loaded LAST into the MCP server's vm context, after
// js/config.js and every file in CONFIG.MCP.scripts (mcp/bootstrap/loader.js). No Newton
// page loads it. Because it is fetched live, tools deploy (and are CI-tested) together
// with the calc layer they call; the installed bundle never needs to change for a new tool.
//
// Each entry:
//   {
//     name:        'list_projects',            // lower_snake_case, unique, not 'newton_status'
//     description: 'What it answers, in one or two sentences.',
//     inputSchema: { type: 'object', properties: { ... }, required: [ ... ] },
//     handler:     async (args) => ({ ... }),  // plain JSON-able object
//   }
//
// Rules (N-378):
//   - Reads only through the api*.js getters; every number from a live analytics.js /
//     utils.js / project-team.js / headcount.js function. No Graph paths, no metric formulas here.
//   - Output never carries candidate names, money, Notes, HiringManager or rejection reasons (MCP-D6).
//   - The server adds asOf + newtonBuild to every result and gates every call to
//     CONFIG.MCP.allowedRoles; handlers do neither.
//   - newton_status is answered by the bootstrap (server.js), not here.
var MCP_TOOLS = [];
