// mcp/bootstrap/server.js - Newton for Claude: the extension's entry point (mcp/manifest.json).
//
// Always starts the server - no `require.main === module` check. Claude Desktop runs
// extensions under its built-in Node.js through its own launcher, which loads this file
// as a module; N-392's first build only started when run directly, so it never answered
// Claude (qa/N-392.md, Finding 2). All logic lives in server-core.js.
'use strict';
process.env.TZ = 'Europe/London';   // before any Date exists, as tests/run.js does
require('./server-core.js').main();
