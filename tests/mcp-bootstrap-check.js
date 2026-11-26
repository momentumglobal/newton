// tests/mcp-bootstrap-check.js - N-392: Node-side checks of the Newton for Claude bootstrap
// (mcp/bootstrap/server.js, server-core.js, auth-node.js, loader.js). N-546 adds the contract-2
// checks: the armed write shim, fetchGuide, per-tool roles, preview + confirm tokens, the lock.
//
// Run by tests/run.js after the vm assertions, because the bootstrap files are CommonJS
// Node modules (http, child_process) that cannot load in the vm. Node built-ins only.
// No network: Newton's scripts are read from this checkout (loader localDir mode), Graph
// and the Microsoft token endpoint are fakes, DPAPI is a fake protector, the browser is a
// captured URL. The loopback sign-in listener is real (127.0.0.1).
// Exception (diff-2): two checks start the real entry point, server.js, in a child
// process, the way Claude Desktop's launcher loads it. That child begins its normal
// live-script fetch; the checks only need its initialize reply and never use what loads.
//
// run() resolves [{ name, ok, message }]. While it runs, process.stdout/stderr writes are
// captured: the last checks assert nothing reached stdout (the MCP protocol channel) and
// that no fake code / verifier / token string appears in anything written (N-378 AC 4).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const ROOT = path.join(__dirname, '..');
const BOOT = path.join(ROOT, 'mcp', 'bootstrap');
const GRAPH = 'https://graph.microsoft.com/v1.0';
const TENANT = 'b73023b1-298a-42a2-bed9-985e0a762054';
const CLIENT = 'bf71f2b2-de80-4728-9189-af8659fbd2b6';

function ok(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
async function rejects(promise, msg) {
  try { await promise; } catch (e) { return e; }
  throw new Error(msg + ' (it resolved)');
}
function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function fakeConfig(over = {}) {
  return Object.assign({
    APP_BUILD: 'test-build',
    SP_SITE_ID: 'site,1,2',
    CLIENT_ID: CLIENT,
    TENANT_ID: TENANT,
    AUTHORITY: 'https://login.microsoftonline.com/' + TENANT,
    MCP: { contract: 1, allowedLists: ['Projects', 'SalesForecasts'], allowedRoles: ['admin', 'leadership'], gateTtlMs: 600000 },
  }, over);
}
// N-546: every live tool entry needs roles (a subset of CONFIG.MCP.allowedRoles).
const R = ['admin', 'leadership'];
// The live mcpOutputGuard's contract, for the fake loader: throw on a denied key at any depth.
function fakeGuard(v) {
  const walk = x => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== 'object') return;
    Object.keys(x).forEach(k => {
      if (k === 'CandidateName') throw new Error(`Newton for Claude withheld a restricted field (${k}).`);
      walk(x[k]);
    });
  };
  walk(v);
  return v;
}
function fakeLoader({ cfg = fakeConfig(), role = 'leadership', tools = [], states = null } = {}) {
  const L = {
    cfg, role, tools, calls: [], armed: false,
    states: states || [{ ok: true, liveContract: 1, loadedAt: '2026-10-27T12:00:00.000Z' }],
    loads: 0,
    load: async () => L.states[Math.min(L.loads++, L.states.length - 1)],
    config: () => L.cfg,
    call: (fn, ...a) => {
      L.calls.push(fn);
      if (fn === 'getEffectiveRole') return Promise.resolve(L.role);
      if (fn === 'wasListDenied') return a[0] === 'SalesForecasts';
      if (fn === 'mcpOutputGuard') return fakeGuard(a[0]);
      throw new Error('fake loader has no ' + fn);
    },
    liveTools: () => L.tools,
    armWrites() { L.armed = true; },
    disarmWrites() { L.armed = false; },
    writesArmed: () => L.armed,
  };
  return L;
}
function fakeAuth(email = 'chris@example.com') {
  const A = {
    email,
    ensureToken: async () => 'tok',
    status: () => ({ signedIn: true, email: A.email, storeMode: 'encrypted (Windows DPAPI)', pendingSince: null }),
    takeLastError: () => null,
    startSignIn: async () => ({}),
    currentUser: () => ({ email: A.email, name: 'Test' }),
    shutdown() {},
  };
  return A;
}
const delay = ms => new Promise(r => setTimeout(r, ms));
function harness(createServer, opts) {
  const lines = [];
  const srv = createServer(Object.assign({ write: o => lines.push(o), log: () => {} }, opts));
  let n = 0;
  async function req(method, params) {
    const id = ++n;
    await srv.handleLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    return lines.find(l => l.id === id);
  }
  async function tool(name, args) {
    const r = await req('tools/call', { name, arguments: args || {} });
    const res = r.result || {};
    const text = res.content && res.content[0] ? res.content[0].text : '';
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* plain text */ }
    return { raw: r, text, isError: res.isError === true, data };
  }
  return { srv, lines, req, tool };
}
function httpGet(port, pathq) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathq, agent: false }, r => {
      let b = '';
      r.on('data', d => { b += d; });
      r.on('end', () => resolve({ status: r.statusCode, body: b }));
    }).on('error', reject);
  });
}
// Runs `node -e <code>` and feeds `input` (if any) on stdin, closing stdin once the first
// stdout line arrives. Resolves { code, stdout, stderr, timedOut }.
function runChild(code, input, ms = 10000) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['-e', code], { stdio: ['pipe', 'pipe', 'pipe'], env: Object.assign({}, process.env) });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, ms);
    child.stdout.on('data', d => {
      out += d;
      if (out.includes('\n') && !child.stdin.destroyed) child.stdin.end();
    });
    child.stderr.on('data', d => { err += d; });
    child.on('close', exitCode => { clearTimeout(timer); resolve({ code: exitCode, stdout: out, stderr: err, timedOut }); });
    child.stdin.on('error', () => {});
    if (input !== null) child.stdin.write(input); else child.stdin.end();
  });
}
const stubShim = token => ({
  getToken: async () => token,
  getCurrentUser: () => ({ email: null, name: null }),
  isSignedIn: () => !!token,
  authReady: () => Promise.resolve(null),
});
const reverseProtector = {
  protect: async s => Buffer.from(s, 'utf8').reverse().toString('base64'),
  unprotect: async b => Buffer.from(String(b), 'base64').reverse().toString('utf8'),
};

async function run() {
  const results = [];
  const secrets = new Set(['CODE-SECRET-1', 'AT-SECRET-1', 'RT-SECRET-1', 'AT-SECRET-2', 'RT-SECRET-2']);
  const serverLines = [];
  const outChunks = [];
  const errChunks = [];
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  const consoleLogBefore = console.log;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'newton-mcp-check-'));

  async function check(name, fn) {
    try {
      await fn();
      results.push({ name: 'N-392 ' + name, ok: true });
    } catch (e) {
      results.push({ name: 'N-392 ' + name, ok: false, message: e && e.message ? e.message : String(e) });
    }
  }
  async function check546(name, fn) {
    try {
      await fn();
      results.push({ name: 'N-546 ' + name, ok: true });
    } catch (e) {
      results.push({ name: 'N-546 ' + name, ok: false, message: e && e.message ? e.message : String(e) });
    }
  }

  process.stdout.write = function (chunk) { outChunks.push(String(chunk)); return true; };
  process.stderr.write = function (chunk) { errChunks.push(String(chunk)); return true; };
  let mods = null;
  try {
    await check('bootstrap modules load with require() and leave console alone (server-core.js has no side effects; only server.js starts the server)', async () => {
      mods = {
        server: require(path.join(BOOT, 'server-core.js')),
        auth: require(path.join(BOOT, 'auth-node.js')),
        loader: require(path.join(BOOT, 'loader.js')),
      };
      ok(console.log === consoleLogBefore, 'requiring server-core.js replaced console.log');
    });
    if (!mods) return results;
    const { createServer, MCP_CONTRACT, BUNDLE_VERSION, DOWNLOAD_URL, MSG, readLines } = mods.server;
    const { createAuth, pkceChallenge, SCOPES } = mods.auth;
    const { createLoader, createStorage, createGraphFetchShim } = mods.loader;
    const { INSTRUCTIONS, WRITE_ANNOTATIONS, createTokenStore } = mods.server;
    const { SCRIPT_BASE, WRITE_LIST_CEILING, GUIDE_FILES, GUIDE_MAX_BYTES } = mods.loader;

    // ── AC 1 / AC 2: CONFIG.MCP and the DOM-less live load ──────────
    const graphCalls = [];
    const graphFetch = async (url, opts) => {
      graphCalls.push({ url, method: (opts && opts.method) || 'GET' });
      if (String(url).endsWith('/$batch')) {
        const reqs = JSON.parse(opts.body).requests;
        return jsonRes({ responses: reqs.map(r => ({ id: r.id, status: 200, body: { value: [{ id: '1', fields: { Marker: r.url.includes('/Projects/') ? 'P1' : 'R1' } }] } })) });
      }
      return jsonRes({ value: [{ id: '1', fields: { Marker: 'P1' } }] });
    };
    const real = createLoader({ authShim: stubShim('tok'), localDir: ROOT, graphFetch, log: () => {} });
    const realState = await real.load({ contract: MCP_CONTRACT });

    // N-393 added outputDenyFields / windows / maxRows (read by mcp/newton-tools.js only; the
    // bundle ignores them, so the contract stays 1). The key set stays pinned exactly.
    // N-546 added confirmTtlMs / writeLists (read by the bundle: contract 2) and made
    // Notifications readable (fireNotification's dedupe read, AMCP-A5).
    await check('AC1 CONFIG.MCP has exactly contract/scripts/allowedLists/allowedRoles/gateTtlMs/confirmTtlMs/writeLists + the N-393 outputDenyFields/windows/maxRows; contract 2 equals the bundle; writeLists inside the bundle ceiling', async () => {
      ok(realState.ok, 'live load failed: ' + realState.reason);
      const m = real.config().MCP;
      eq(Object.keys(m), ['contract', 'scripts', 'allowedLists', 'allowedRoles', 'gateTtlMs', 'confirmTtlMs', 'writeLists', 'outputDenyFields', 'windows', 'maxRows'], 'CONFIG.MCP keys, in order');
      eq([m.contract, MCP_CONTRACT, BUNDLE_VERSION], [2, 2, '2.0.0'], 'CONFIG.MCP.contract vs server-core.js MCP_CONTRACT / BUNDLE_VERSION');
      eq(Array.from(m.allowedRoles).sort(), ['admin', 'leadership'], 'allowedRoles');
      eq(m.confirmTtlMs, 300000, 'confirmTtlMs');
      ok(!Array.from(m.allowedLists).some(l => /PeoplePay|GPInvoices|LCI|Survey|Diagnostics/.test(l)), 'allowedLists names an MCP-D7 never-read list');
      ok(Array.from(m.allowedLists).includes('Notifications'), 'Notifications not readable (AMCP-A5)');
      Object.keys(m.writeLists).forEach(l => ok(WRITE_LIST_CEILING.includes(l), `writeLists.${l} is outside the bundle WRITE_LIST_CEILING`));
      eq(WRITE_LIST_CEILING, ['WeeklyActivity', 'Roles', 'RoleHistory', 'Notifications', 'SavedReports'], 'WRITE_LIST_CEILING (AMCP-A5)');
      eq(m.scripts[m.scripts.length - 1], 'mcp/newton-tools.js', 'newton-tools.js loads last');
    });

    await check('AC2 js/config.js + CONFIG.MCP.scripts load into one vm context with no DOM; no Node or browser globals leak in', async () => {
      ok(realState.ok, 'live load failed: ' + realState.reason);
      eq(real.evalInContext('[typeof getEffectiveRole, typeof getItems, typeof wasListDenied, Array.isArray(MCP_TOOLS)].join()'), 'function,function,function,true', 'live functions');
      eq(real.evalInContext('[typeof window, typeof document, typeof process, typeof require].join()'), 'undefined,undefined,undefined,undefined', 'leaked globals');
    });

    await check('AC2 positive control - a script that touches the DOM at load fails the load and names the file', async () => {
      const dir = path.join(tmp, 'domload');
      const scripts = real.config().MCP.scripts;
      ['js/config.js'].concat(Array.from(scripts)).forEach(rel => {
        fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
      });
      fs.writeFileSync(path.join(dir, 'mcp/newton-tools.js'), 'var MCP_TOOLS = []; document.title = "x";');
      const st = await createLoader({ authShim: stubShim(null), localDir: dir, log: () => {} }).load({ contract: MCP_CONTRACT });
      ok(!st.ok && /mcp\/newton-tools\.js/.test(st.reason), 'expected a load failure naming mcp/newton-tools.js, got ' + JSON.stringify(st));
    });

    // N-393 (qa/N-392.md Finding 1): positive control for the vm console. A loader built with
    // its DEFAULT logger (no `log` passed - the production path) must send console output from
    // inside the context to stderr. The capture above records both streams, so a probe on
    // stdout fails here and in the AC5 check at the end.
    await check('F1 the vm console writes to stderr, not stdout - a probe logged inside the live context (default logger) lands on stderr', async () => {
      const L = createLoader({ authShim: stubShim(null), localDir: ROOT, graphFetch });
      const st = await L.load({ contract: MCP_CONTRACT });
      ok(st.ok, 'live load failed: ' + st.reason);
      const probe = 'N393-console-probe-' + Date.now();
      const outBefore = outChunks.join('').length;
      const errBefore = errChunks.join('').length;
      L.evalInContext(`console.log(${JSON.stringify(probe + '-log')}); console.warn(${JSON.stringify(probe + '-warn')}); console.error(${JSON.stringify(probe + '-error')}); console.info(${JSON.stringify(probe + '-info')});`);
      const newOut = outChunks.join('').slice(outBefore);
      const newErr = errChunks.join('').slice(errBefore);
      ok(!newOut.includes(probe), 'a console probe reached stdout: ' + newOut.slice(0, 120));
      ['log', 'warn', 'error', 'info'].forEach(m => ok(newErr.includes(probe + '-' + m), 'console.' + m + ' probe did not reach stderr'));
    });

    // ── AC 3: storage shim ──────────────────────────────────────────
    await check('AC3 storage shim behaves like Storage, and Object.keys lists exactly the stored keys', async () => {
      const s = createStorage();
      eq(s.getItem('a'), null, 'missing key');
      s.setItem('a', 1); s.setItem('b', 'two');
      eq(s.getItem('a'), '1', 'value coerced to string');
      eq(Object.keys(s), ['a', 'b'], 'Object.keys');
      eq([s.length, s.key(0), s.key(5)], [2, 'a', null], 'length / key()');
      s.removeItem('a');
      eq(Object.keys(s), ['b'], 'after removeItem');
      s.clear();
      eq([s.length, Object.keys(s).length], [0, 0], 'after clear');
    });

    await check('AC3 getGhostUser() for a real admin returns null without throwing (storage shim present, server never sets ghost keys)', async () => {
      real.call('_setGhostRealAdmin', true);
      try { eq(real.call('getGhostUser'), null, 'getGhostUser'); } finally { real.call('_setGhostRealAdmin', false); }
    });

    // ── AC 4: read-only Graph fetch shim ────────────────────────────
    await check('AC4 fetch shim passes GETs to allowlisted lists and $batches of them; refuses every write, other list, /me, /drive and other hosts with 405', async () => {
      const seen = [];
      const upstream = async (url) => {
        seen.push(url);
        if (String(url).endsWith('/$batch')) return jsonRes({ responses: [] });
        return jsonRes({ value: [] });
      };
      const shim = createGraphFetchShim({ getConfig: () => fakeConfig(), realFetch: upstream, log: () => {} });
      const items = list => `${GRAPH}/sites/site,1,2/lists/${list}/items`;
      await shim(items('Projects') + "?$expand=fields&$filter=x eq 'y'");
      await shim(items('Projects') + '/delta?token=1');
      await shim(items('Projects') + '/12?$expand=fields');
      const batchBody = reqs => JSON.stringify({ requests: reqs });
      await shim(`${GRAPH}/$batch`, { method: 'POST', body: batchBody([{ id: '0', method: 'GET', url: '/sites/site,1,2/lists/Projects/items?x' }, { id: '1', method: 'GET', url: '/sites/site,1,2/lists/SalesForecasts/items' }]) });
      eq(seen.length, 4, 'allowed requests reaching upstream');
      const refused = [
        [items('PeoplePay')], [items('GPInvoices')], [`${GRAPH}/me`], [`${GRAPH}/me/drive/root`], [`${GRAPH}/sites/site,1,2/lists/Projects/columns`],
        ['https://evil.example/x'],
        [items('Projects'), { method: 'POST', body: '{}' }],
        [items('Projects') + '/12', { method: 'PATCH', body: '{}' }],
        [items('Projects') + '/12', { method: 'DELETE' }],
        [`${GRAPH}/$batch`, { method: 'POST', body: batchBody([{ id: '0', method: 'GET', url: '/sites/site,1,2/lists/Projects/items' }, { id: '1', method: 'PATCH', url: '/sites/site,1,2/lists/Projects/items/1' }]) }],
        [`${GRAPH}/$batch`, { method: 'POST', body: batchBody([{ id: '0', method: 'GET', url: '/sites/site,1,2/lists/PeoplePay/items' }]) }],
        [`${GRAPH}/$batch`, { method: 'POST', body: batchBody([]) }],
      ];
      for (const [u, o] of refused) {
        const e = await rejects(shim(u, o), `${(o && o.method) || 'GET'} ${u} was not refused`);
        eq(e.status, 405, `status for ${(o && o.method) || 'GET'} ${u}`);
      }
      eq(seen.length, 4, 'a refused request reached upstream');
    });

    await check('AC4 a GUID-addressed list path is refused until an allowlisted response\'s nextLink / deltaLink (solo or in $batch) teaches it', async () => {
      const guidA = `${GRAPH}/sites/site,1,2/lists/aaaaaaaa-1111-2222-3333-444444444444/items`;
      const guidB = `${GRAPH}/sites/site,1,2/lists/bbbbbbbb-1111-2222-3333-444444444444/items`;
      const upstream = async (url) => {
        if (String(url).endsWith('/$batch')) return jsonRes({ responses: [{ id: '0', status: 200, body: { value: [], '@odata.deltaLink': guidB + '/delta?token=2' } }] });
        if (String(url).includes('/lists/Projects/')) return jsonRes({ value: [], '@odata.nextLink': guidA + '?$skiptoken=1' });
        return jsonRes({ value: [] });
      };
      const shim = createGraphFetchShim({ getConfig: () => fakeConfig(), realFetch: upstream, log: () => {} });
      await rejects(shim(guidA + '?$skiptoken=1'), 'unlearned GUID path was allowed');
      await shim(`${GRAPH}/sites/site,1,2/lists/Projects/items`);
      await shim(guidA + '?$skiptoken=1');
      await rejects(shim(guidB + '/delta?token=2'), 'unlearned GUID delta path was allowed');
      await shim(`${GRAPH}/$batch`, { method: 'POST', body: JSON.stringify({ requests: [{ id: '0', method: 'GET', url: '/sites/site,1,2/lists/Projects/items' }] }) });
      await shim(guidB + '/delta?token=2');
    });

    await check('AC4 inside the live context: getItems on two allowed lists works (via $batch); createItem and a never-read list are refused before the network', async () => {
      graphCalls.length = 0;
      const [p, r] = await Promise.all([
        real.call('getItems', 'Projects', "fields/Status eq 'Active'"),
        real.call('getItems', 'Roles', "fields/Stage eq 'Open'"),
      ]);
      eq([p.length, p[0].Marker, r[0].Marker], [1, 'P1', 'R1'], 'rows through the shim');
      ok(graphCalls.some(c => c.url.endsWith('/$batch') && c.method === 'POST'), 'concurrent reads did not go through $batch');
      const before = graphCalls.length;
      const w = await rejects(real.call('createItem', 'Projects', { Title: 'x' }), 'createItem was not refused');
      eq(w.status, 405, 'createItem status');
      const d = await rejects(real.call('getItems', 'PeoplePay'), 'getItems(PeoplePay) was not refused');
      eq(d.status, 405, 'PeoplePay status');
      eq(graphCalls.length, before, 'a refused call reached the network');
    });

    // ── AC 5: JSON-RPC ──────────────────────────────────────────────
    await check('AC5 JSON-RPC: initialize (version echo + fallback), notifications unanswered, -32601 / -32700 / -32602, tools/list read-only', async () => {
      const L = fakeLoader({ tools: [{ name: 'echo_tool', description: 'd', inputSchema: { type: 'object', properties: {} }, roles: R, handler: async () => ({}) }] });
      const h = harness(createServer, { loader: L, auth: fakeAuth() });
      const init = await h.req('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } });
      eq(init.result.protocolVersion, '2025-03-26', 'echoed protocolVersion');
      eq([init.result.serverInfo.name, init.result.serverInfo.version, init.result.capabilities.tools.listChanged], ['newton', BUNDLE_VERSION, true], 'serverInfo / capabilities');
      eq((await h.req('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18', 'fallback protocolVersion');
      const count = h.lines.length;
      await h.srv.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
      eq(h.lines.length, count, 'a notification was answered');
      eq((await h.req('no/such')).error.code, -32601, 'unknown method');
      await h.srv.handleLine('{not json');
      const parse = h.lines[h.lines.length - 1];
      eq([parse.id, parse.error.code], [null, -32700], 'parse error');
      eq((await h.req('tools/call', {})).error.code, -32602, 'tools/call without a name');
      eq((await h.req('tools/call', { name: 'nope' })).error.code, -32602, 'unknown tool');
      eq((await h.req('ping')).result, {}, 'ping');
      const list = (await h.req('tools/list')).result.tools;
      eq(list.map(t => t.name), ['newton_status', 'echo_tool'], 'tools/list');
      ok(list.every(t => t.annotations.readOnlyHint === true && t.annotations.openWorldHint === false), 'a tool is not marked read-only');
      ok(h.lines.every(l => l.jsonrpc === '2.0' && ('id' in l || 'method' in l)), 'a written line is not JSON-RPC');
      serverLines.push(...h.lines);
    });

    await check('AC5 a deferred live load that succeeds after a failure sends notifications/tools/list_changed and lists the live tools', async () => {
      let t = 1000;
      const L = fakeLoader({
        tools: [{ name: 'echo_tool', roles: R, handler: async () => ({}) }],
        states: [{ ok: false, reason: 'js/config.js: offline' }, { ok: true, liveContract: 1, loadedAt: 'x' }],
      });
      const h = harness(createServer, { loader: L, auth: fakeAuth(), now: () => t });
      await h.srv.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
      eq((await h.req('tools/list')).result.tools.map(x => x.name), ['newton_status'], 'tools while offline');
      const off = await h.tool('newton_status');
      ok(off.isError && /Couldn't load Newton \(js\/config\.js: offline\)/.test(off.text), 'offline message: ' + off.text);
      t += 60000;
      eq((await h.req('tools/list')).result.tools.map(x => x.name), ['newton_status', 'echo_tool'], 'tools after reload');
      ok(h.lines.some(l => l.method === 'notifications/tools/list_changed'), 'no list_changed notification');
      serverLines.push(...h.lines);
    });

    // ── AC 6: contract mismatch ─────────────────────────────────────
    await check('AC6 contract mismatch: tools/list is newton_status only and every call returns the update message with the .mcpb link', async () => {
      const L = createLoader({ authShim: stubShim('tok'), localDir: ROOT, log: () => {} });
      const h = harness(createServer, { loader: L, auth: fakeAuth(), contract: MCP_CONTRACT + 1 });
      eq((await h.req('tools/list')).result.tools.map(x => x.name), ['newton_status'], 'tools on mismatch');
      const r = await h.tool('newton_status');
      ok(r.isError && r.text === MSG.update && r.text.includes(DOWNLOAD_URL), 'update message: ' + r.text);
      serverLines.push(...h.lines);
    });

    // ── AC 7: PKCE + authorise URL ──────────────────────────────────
    await check('AC7 PKCE S256 matches the RFC 7636 vector', async () => {
      eq(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 'challenge');
    });

    await check('AC7 authorise URL: CONFIG.CLIENT_ID, S256, http://localhost:<port>, scope exactly "User.Read Sites.Selected offline_access"; a foreign authority is refused', async () => {
      eq(SCOPES, 'User.Read Sites.Selected offline_access', 'SCOPES');
      let opened = null;
      const a = createAuth({ getConfig: () => fakeConfig(), protector: reverseProtector, http: {}, openBrowser: u => { opened = u; }, storePath: path.join(tmp, 'ac7.bin'), log: () => {} });
      await a.startSignIn();
      try {
        const u = new URL(opened);
        eq(u.origin + u.pathname, `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`, 'endpoint');
        const q = u.searchParams;
        eq([q.get('client_id'), q.get('response_type'), q.get('code_challenge_method'), q.get('scope'), q.get('prompt'), q.get('response_mode')],
          [CLIENT, 'code', 'S256', 'User.Read Sites.Selected offline_access', 'select_account', 'query'], 'query params');
        ok(/^http:\/\/localhost:\d+$/.test(q.get('redirect_uri')), 'redirect_uri ' + q.get('redirect_uri'));
        ok(opened.includes('scope=User.Read%20Sites.Selected%20offline_access'), 'scope not encoded as one exact string');
        ok(q.get('state') && q.get('code_challenge'), 'state / code_challenge missing');
      } finally { a.shutdown(); }
      const bad = createAuth({ getConfig: () => fakeConfig({ AUTHORITY: 'https://evil.example/' + TENANT }), protector: reverseProtector, http: {}, openBrowser: () => { throw new Error('browser opened'); }, storePath: path.join(tmp, 'bad.bin'), log: () => {} });
      const e = await rejects(bad.startSignIn(), 'foreign authority accepted');
      eq(e.code, 'CONFIG_INVALID', 'error code');
    });

    // ── AC 8-10: sign-in flow, token store, gate ────────────────────
    const store = path.join(tmp, 'Newton', 'mcp-token.bin');
    let challenge = null;
    let refreshMode = 'ok';
    const fakeHttp = {
      async postForm(url, form) {
        ok(url === `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, 'token endpoint ' + url);
        ok(form.scope === SCOPES && form.client_id === CLIENT, 'token request scope / client');
        if (form.grant_type === 'authorization_code') {
          secrets.add(form.code_verifier);
          ok(form.code === 'CODE-SECRET-1', 'code');
          ok(pkceChallenge(form.code_verifier) === challenge, 'verifier does not match the challenge sent');
          ok(/^http:\/\/localhost:\d+$/.test(form.redirect_uri), 'redirect_uri');
          return { status: 200, json: { access_token: 'AT-SECRET-1', refresh_token: 'RT-SECRET-1', expires_in: 3600 } };
        }
        if (form.grant_type === 'refresh_token') {
          if (refreshMode === 'invalid') return { status: 400, json: { error: 'invalid_grant', error_description: 'AADSTS70043: The refresh token has expired. Trace: RT-SECRET-2' } };
          ok(form.refresh_token === 'RT-SECRET-1', 'refresh token read back from the store');
          return { status: 200, json: { access_token: 'AT-SECRET-2', refresh_token: 'RT-SECRET-2', expires_in: 3600 } };
        }
        throw new Error('unexpected grant ' + form.grant_type);
      },
      async getJson(url, token) {
        ok(url.startsWith(GRAPH + '/me'), '/me url');
        ok(/^AT-SECRET-/.test(token), '/me token');
        return { status: 200, json: { userPrincipalName: 'Chris.Friend@Example.com', displayName: 'Chris Friend' } };
      },
    };
    let opened = [];
    const mkAuth = () => createAuth({ getConfig: () => fakeConfig(), protector: reverseProtector, http: fakeHttp, openBrowser: u => { opened.push(u); }, storePath: store, log: (...a) => process.stderr.write(a.join(' ') + '\n') });

    await check('AC8 sign-in: first call opens the browser and returns at once; wrong state ignored; code redeemed; /me email; refresh token stored encrypted', async () => {
      const auth = mkAuth();
      const h = harness(createServer, { loader: fakeLoader(), auth });
      try {
        const first = await h.tool('newton_status');
        eq(first.text, MSG.signInStarted, 'first call');
        eq(opened.length, 1, 'browser opens');
        const u = new URL(opened[0]);
        challenge = u.searchParams.get('code_challenge');
        const port = Number(new URL(u.searchParams.get('redirect_uri')).port);
        ok(/browser window opened at \d\d:\d\d/.test((await h.tool('newton_status')).text), 'pending message');
        eq(opened.length, 1, 'a second browser opened while pending');
        eq((await httpGet(port, '/favicon.ico')).status, 404, 'other path');
        eq((await httpGet(port, '/?code=CODE-SECRET-1&state=wrong')).status, 400, 'wrong state');
        ok(auth.status().pendingSince, 'wrong state ended the sign-in');
        const page = await httpGet(port, `/?code=CODE-SECRET-1&state=${encodeURIComponent(u.searchParams.get('state'))}`);
        eq(page.status, 200, 'callback status');
        ok(/Signed in to Newton for Claude/.test(page.body) && !/SECRET/.test(page.body), 'callback page');
        await auth.pendingDone();
        const st = await h.tool('newton_status');
        ok(!st.isError && st.data, 'status after sign-in: ' + st.text);
        eq([st.data.signedInAs, st.data.role, st.data.access, st.data.tokenStore, st.data.newtonBuild, st.data.listsNotAvailable],
          ['chris.friend@example.com', 'leadership', 'allowed', 'encrypted (Windows DPAPI)', 'test-build', ['SalesForecasts']], 'status fields');
        ok(st.data.asOf && st.data.bundleVersion === BUNDLE_VERSION && st.data.contract.bundle === MCP_CONTRACT, 'asOf / bundle / contract');
        ok(fs.existsSync(store), 'token store not written');
        ok(!fs.readFileSync(store, 'utf8').includes('RT-SECRET-1') && !fs.readFileSync(store).includes(Buffer.from('RT-SECRET-1')), 'refresh token stored in clear');
        serverLines.push(...h.lines);
      } finally { auth.shutdown(); }
    });

    await check('AC8 a new process signs in silently from the store; invalid_grant clears it and asks to sign in again; no file = sign in', async () => {
      const before = opened.length;
      const a2 = mkAuth();
      eq(await a2.ensureToken(), 'AT-SECRET-2', 'refresh from store');
      eq(a2.currentUser().email, 'chris.friend@example.com', 'email from /me');
      eq(opened.length, before, 'browser opened on a silent sign-in');
      refreshMode = 'invalid';
      const a3 = mkAuth();
      eq(await a3.ensureToken(), null, 'invalid_grant token');
      ok(!fs.existsSync(store), 'store not cleared on invalid_grant');
      ok(/expired/.test(a3.takeLastError() || ''), 'expired message');
      eq(await mkAuth().ensureToken(), null, 'no store file');
      eq(opened.length, before, 'ensureToken opened a browser');
    });

    await check('AC8 AADSTS50105 at sign-in: the assignment message is shown once, then the next call starts a new sign-in', async () => {
      opened = [];
      const auth = mkAuth();
      const h = harness(createServer, { loader: fakeLoader(), auth });
      try {
        await h.tool('newton_status');
        const u = new URL(opened[0]);
        const port = Number(new URL(u.searchParams.get('redirect_uri')).port);
        const page = await httpGet(port, `/?error=access_denied&error_description=${encodeURIComponent('AADSTS50105: user not assigned')}&state=${encodeURIComponent(u.searchParams.get('state'))}`);
        eq(page.status, 400, 'error callback status');
        await auth.pendingDone();
        const r = await h.tool('newton_status');
        ok(r.isError && /isn't assigned to Newton in Entra/.test(r.text), 'assignment message: ' + r.text);
        eq((await h.tool('newton_status')).text, MSG.signInStarted, 'retry');
        eq(opened.length, 2, 'browser opens on retry');
        serverLines.push(...h.lines);
      } finally { auth.shutdown(); }
    });

    await check('AC10 gate: a non-Leadership/Admin role gets only the gate message from every tool; leadership and admin pass; a role change applies after gateTtlMs', async () => {
      let handled = 0;
      const tools = [{ name: 'echo_tool', roles: R, handler: async () => { handled++; return { ok: true }; } }];
      const tp = harness(createServer, { loader: fakeLoader({ role: 'talent_partner', tools }), auth: fakeAuth() });
      for (const name of ['newton_status', 'echo_tool']) {
        const r = await tp.tool(name);
        ok(r.isError && r.text === MSG.gate('chris@example.com', 'talent_partner'), `${name} for talent_partner: ${r.text}`);
      }
      eq(handled, 0, 'handler ran for a blocked user');
      for (const role of ['leadership', 'admin']) {
        const r = await harness(createServer, { loader: fakeLoader({ role }), auth: fakeAuth() }).tool('newton_status');
        ok(!r.isError && r.data && r.data.role === role, `${role}: ${r.text}`);
      }
      let t = 0;
      const L = fakeLoader({ role: 'leadership', tools });
      const h = harness(createServer, { loader: L, auth: fakeAuth(), now: () => t });
      ok(!(await h.tool('echo_tool')).isError, 'allowed at t=0');
      L.role = 'talent_partner';
      t = 600000 - 1;
      ok(!(await h.tool('echo_tool')).isError, 'cached role not used inside gateTtlMs');
      t = 600000;
      eq((await h.tool('echo_tool')).text, MSG.gate('chris@example.com', 'talent_partner'), 'role change after gateTtlMs');
      serverLines.push(...tp.lines, ...h.lines);
    });

    // ── AC 11: tool wrapper ─────────────────────────────────────────
    await check('AC11 live tools: asOf + newtonBuild added; args validated; 403 / 405 / timeout mapped; server answers after a hung handler; bad registry entries skipped', async () => {
      const tools = [
        { name: 'echo_tool', roles: R, inputSchema: { type: 'object', properties: { x: { type: 'string' }, n: { type: 'integer', enum: [1, 2] } }, required: ['x'] }, handler: async a => ({ x: a.x }) },
        { name: 'denied', roles: R, handler: async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); } },
        { name: 'writes', roles: R, handler: async () => { throw Object.assign(new Error('Newton for Claude can\'t make that request (blocked PATCH write (not armed))'), { status: 405 }); } },
        { name: 'hang', roles: R, handler: () => new Promise(() => {}) },
        { name: 'echo_tool', roles: R, handler: async () => ({}) },
        { name: 'newton_status', roles: R, handler: async () => ({}) },
        { name: 'Bad Name', roles: R, handler: async () => ({}) },
      ];
      const h = harness(createServer, { loader: fakeLoader({ tools }), auth: fakeAuth(), toolTimeoutMs: 30 });
      eq((await h.req('tools/list')).result.tools.map(t => t.name), ['newton_status', 'echo_tool', 'denied', 'writes', 'hang'], 'registry filtering');
      const e = await h.tool('echo_tool', { x: 'hi' });
      ok(!e.isError && e.data.x === 'hi' && e.data.newtonBuild === 'test-build' && !isNaN(Date.parse(e.data.asOf)), 'wrapped result: ' + e.text);
      eq((await h.tool('echo_tool', {})).text, 'Missing required argument: x.', 'required');
      eq((await h.tool('echo_tool', { x: 1 })).text, 'Argument x must be a string.', 'type');
      eq((await h.tool('echo_tool', { x: 'a', n: 3 })).text, 'Argument n must be one of: 1, 2.', 'enum');
      eq((await h.tool('denied')).text, MSG.denied, '403');
      ok(/blocked PATCH write \(not armed\)/.test((await h.tool('writes')).text), '405');
      const hung = await h.tool('hang');
      ok(hung.isError && hung.text === MSG.timeout, 'timeout: ' + hung.text);
      eq((await h.req('ping')).result, {}, 'ping after a hung handler');
      serverLines.push(...h.lines);
    });

    // ── diff-2: the entry point, loaded the way Claude Desktop loads it ──
    await check('diff-2 server.js answers initialize when another module loads it (Claude Desktop\'s launcher) - over real pipes and over a plain-emitter stdin', async () => {
      const entry = path.join(BOOT, 'server.js');
      const INIT = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
      const viaRequire = `require(${JSON.stringify(entry)});`;
      const viaEmitter = [
        "const { EventEmitter } = require('events');",
        'const fake = new EventEmitter();',
        "Object.defineProperty(process, 'stdin', { value: fake, configurable: true });",
        `require(${JSON.stringify(entry)});`,
        `setTimeout(() => { fake.emit('data', Buffer.from(${JSON.stringify(INIT + '\n')})); setTimeout(() => fake.emit('end'), 300); }, 50);`,
      ].join('\n');
      for (const [label, code, input] of [['required by another module, real pipes', viaRequire, INIT + '\n'], ['plain-emitter stdin', viaEmitter, null]]) {
        const r = await runChild(code, input);
        ok(!r.timedOut, `${label}: no reply within 10 s (stderr: ${r.stderr.slice(0, 200)})`);
        const lines = r.stdout.split('\n').filter(Boolean);
        ok(lines.length >= 1, `${label}: nothing on stdout`);
        const msgs = lines.map(l => { try { return JSON.parse(l); } catch (e) { return null; } });
        ok(msgs.every(m => m && m.jsonrpc === '2.0'), `${label}: a stdout line is not JSON-RPC: ${r.stdout.slice(0, 200)}`);
        eq([msgs[0].id, msgs[0].result && msgs[0].result.serverInfo.version], [0, BUNDLE_VERSION], `${label}: initialize reply`);
        ok(r.stderr.includes(`[newton-mcp] server started, bundle ${BUNDLE_VERSION}`), `${label}: no start-up line on stderr`);
        eq(r.code, 0, `${label}: exit code after stdin ended`);
      }
    });

    await check('diff-2 readLines: lines split across chunks, a multi-byte character split across Buffers, CRLF, blank lines and a final line with no newline', async () => {
      const src = new EventEmitter();
      const got = [];
      let ended = 0;
      readLines(src, l => got.push(l), () => { ended++; });
      const bytes = Buffer.from('{"a":"caf\u00e9"}\r\n\n{"b":1}\n{"c"', 'utf8');
      const cut = bytes.indexOf(0xc3) + 1;   // split inside the two-byte e-acute
      src.emit('data', bytes.subarray(0, cut));
      src.emit('data', bytes.subarray(cut));
      src.emit('data', ':2}');
      src.emit('end');
      src.emit('close');
      eq(got, ['{"a":"caf\u00e9"}', '{"b":1}', '{"c":2}'], 'lines');
      eq(ended, 1, 'onEnd calls');
    });

    // ── N-546 (AMCP-2): write shim, guide fetch, per-tool roles, preview + confirm ──
    const wItems = (list, site = 'site,1,2') => `${GRAPH}/sites/${site}/lists/${list}/items`;
    const wBody = f => JSON.stringify({ fields: f });
    const wCfg = () => fakeConfig({ MCP: { contract: 2, allowedLists: ['Projects', 'SalesForecasts'], allowedRoles: R, gateTtlMs: 600000,
      writeLists: { WeeklyActivity: { create: ['RoleIDLookupId', 'Outreach'], update: ['Outreach'] }, Roles: { update: ['Stage'] }, Bogus: { create: ['X'] } } } });

    await check546('AC4 shim unarmed: POST / PATCH to an allowed write list with allowed fields are refused (405 "write (not armed)") before the network', async () => {
      const seen = [];
      const shim = createGraphFetchShim({ getConfig: wCfg, realFetch: async (u, o) => { seen.push(u); return jsonRes({}); }, log: () => {}, writeGate: { armed: false } });
      for (const [u, o] of [[wItems('WeeklyActivity'), { method: 'POST', body: wBody({ Outreach: 1 }) }], [wItems('Roles') + '/7', { method: 'PATCH', body: wBody({ Stage: 'Sourcing' }) }]]) {
        const e = await rejects(shim(u, o), `${o.method} ${u} unarmed was allowed`);
        ok(e.status === 405 && /blocked (POST|PATCH) write \(not armed\)/.test(e.message), 'unarmed message: ' + e.message);
      }
      const noGate = createGraphFetchShim({ getConfig: wCfg, realFetch: async u => { seen.push(u); return jsonRes({}); }, log: () => {} });
      eq((await rejects(noGate(wItems('WeeklyActivity'), { method: 'POST', body: wBody({ Outreach: 1 }) }), 'default gate allowed a write')).status, 405, 'default writeGate is unarmed');
      eq(seen.length, 0, 'an unarmed write reached the network');
    });

    await check546('AC5 / AC6 shim armed: an allow-listed POST and PATCH reach Graph unchanged; DELETE, PUT, bad paths, query strings, lists outside the ceiling or writeLists, GUID paths, other sites, other fields, other body keys and $batch writes are refused before the network', async () => {
      const seen = [];
      const logs = [];
      const guid = `${GRAPH}/sites/site,1,2/lists/aaaaaaaa-1111-2222-3333-444444444444/items`;
      const upstream = async (u, o) => {
        seen.push([(o && o.method) || 'GET', u, o && o.body]);
        if (String(u).includes('/lists/Projects/')) return jsonRes({ value: [], '@odata.nextLink': guid + '?$skiptoken=1' });
        return jsonRes({ id: '9' });
      };
      const gate = { armed: true };
      const shim = createGraphFetchShim({ getConfig: wCfg, realFetch: upstream, log: l => logs.push(l), writeGate: gate });
      const postBody = wBody({ RoleIDLookupId: 3, Outreach: 2 });
      await shim(wItems('WeeklyActivity'), { method: 'POST', body: postBody });
      await shim(wItems('Roles') + '/7', { method: 'PATCH', body: wBody({ Stage: 'Sourcing' }) });
      eq(seen.map(x => [x[0], x[1], x[2]]), [['POST', wItems('WeeklyActivity'), postBody], ['PATCH', wItems('Roles') + '/7', wBody({ Stage: 'Sourcing' })]], 'allowed writes, unchanged');
      await shim(wItems('Projects'));   // teaches the GUID prefix for reads
      await shim(guid + '?$skiptoken=1');
      const before = seen.length;
      const refused = [
        [wItems('Roles') + '/7', { method: 'DELETE' }, 'write method'],
        [wItems('Roles') + '/7', { method: 'PUT', body: wBody({ Stage: 'x' }) }, 'write method'],
        [wItems('Roles'), { method: 'PATCH', body: wBody({ Stage: 'x' }) }, 'write path'],
        [wItems('WeeklyActivity') + '/5', { method: 'POST', body: wBody({ Outreach: 1 }) }, 'write path'],
        [wItems('Roles') + '/abc', { method: 'PATCH', body: wBody({ Stage: 'x' }) }, 'write path'],
        [wItems('WeeklyActivity') + '?x=1', { method: 'POST', body: wBody({ Outreach: 1 }) }, 'write path'],
        [wItems('WeeklyActivity', 'other,9,9'), { method: 'POST', body: wBody({ Outreach: 1 }) }, 'write path'],
        [wItems('Bogus'), { method: 'POST', body: wBody({ X: 1 }) }, 'write list Bogus'],
        [wItems('SavedReports'), { method: 'POST', body: wBody({ Title: 'x' }) }, 'write list SavedReports'],
        [wItems('UserAssignments'), { method: 'POST', body: wBody({ AssignedRole: 'admin' }) }, 'write list UserAssignments'],
        [guid, { method: 'POST', body: wBody({ Outreach: 1 }) }, 'write list aaaaaaaa-1111-2222-3333-444444444444'],
        [wItems('Roles') + '/7', { method: 'PATCH', body: wBody({ Budget: 'SECRET-BUDGET-9' }) }, 'write field Budget on Roles'],
        [wItems('Roles'), { method: 'POST', body: wBody({ Stage: 'x' }) }, 'write list Roles'],
        [wItems('WeeklyActivity') + '/5', { method: 'PATCH', body: wBody({ RoleIDLookupId: 4 }) }, 'write field RoleIDLookupId on WeeklyActivity'],
        [wItems('WeeklyActivity'), { method: 'POST', body: JSON.stringify({ fields: { Outreach: 1 }, x: 1 }) }, 'write body'],
        [wItems('WeeklyActivity'), { method: 'POST', body: JSON.stringify({ fields: [1] }) }, 'write body'],
        [wItems('WeeklyActivity'), { method: 'POST', body: 'not json' }, 'write body'],
        [`${GRAPH}/$batch`, { method: 'POST', body: JSON.stringify({ requests: [{ id: '0', method: 'PATCH', url: '/sites/site,1,2/lists/Roles/items/7', body: { fields: { Stage: 'x' } } }] }) }, 'inside $batch'],
      ];
      for (const [u, o, label] of refused) {
        const e = await rejects(shim(u, o), `${o.method} ${u} (${label}) was not refused`);
        ok(e.status === 405 && e.message.includes(label), `${o.method} ${u}: expected "${label}", got ${e.message}`);
      }
      eq(seen.length, before, 'a refused write reached the network');
      ok(!logs.join('\n').includes('SECRET-BUDGET-9'), 'a field value reached the log');
      ok(logs.some(l => l.includes('write field Budget on Roles')), 'positive control: refusals are logged');
    });

    await check546('AC7 / AC8 live context: createItem / updateItem reach Graph only while the loader is armed (a write after disarm fails loudly with 405); the write gate, ceiling, guide list and token store are not reachable from live code', async () => {
      ok(realState.ok, 'live load failed: ' + realState.reason);
      graphCalls.length = 0;
      real.armWrites();
      try {
        await real.call('createItem', 'WeeklyActivity', { RoleIDLookupId: 1, Outreach: 2 });
        await real.call('updateItem', 'Roles', 5, { Stage: 'Sourcing' });
      } finally { real.disarmWrites(); }
      eq(graphCalls.map(c => c.method), ['POST', 'PATCH'], 'armed writes reached Graph');
      eq(real.writesArmed(), false, 'disarmed');
      const late = await rejects(real.call('createItem', 'WeeklyActivity', { RoleIDLookupId: 1, Outreach: 2 }), 'a write after disarm was allowed');
      const late2 = await rejects(real.call('updateItem', 'Roles', 5, { Stage: 'Sourcing' }), 'an update after disarm was allowed');
      eq([late.status, late2.status], [405, 405], 'late writes status');
      eq(graphCalls.length, 2, 'a late write reached the network');
      eq(real.evalInContext('[typeof armWrites, typeof disarmWrites, typeof writesArmed, typeof writeGate, typeof WRITE_LIST_CEILING, typeof GUIDE_FILES, typeof createTokenStore, typeof tokens].join()'),
        'undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined', 'bundle internals visible in the context');
      eq(real.evalInContext('typeof fetchGuide'), 'function', 'fetchGuide global');
    });

    await check546('AC9 fetchGuide: the six pinned guides only, GET from SCRIPT_BASE; an unlisted name makes no request; non-2xx and over-2 MB bodies reject', async () => {
      eq(GUIDE_FILES, ['user-guide.html', 'people-user-guide.html', 'sales-user-guide.html', 'market-reporting-user-guide.html', 'my-momentum-user-guide.html', 'README.md'], 'GUIDE_FILES');
      for (const name of GUIDE_FILES) {
        const text = await real.evalInContext(`fetchGuide(${JSON.stringify(name)})`);
        ok(typeof text === 'string' && text === fs.readFileSync(path.join(ROOT, name), 'utf8'), name + ' text');
      }
      const fetched = [];
      const scriptFetch = async (url, o) => {
        const rel = String(url).slice(SCRIPT_BASE.length).split('?')[0];
        fetched.push({ rel, method: o && o.method, url: String(url) });
        if (rel === 'user-guide.html') return new Response('gone', { status: 404 });
        if (rel === 'people-user-guide.html') return new Response('x'.repeat(GUIDE_MAX_BYTES + 1));
        return new Response(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      };
      const L = createLoader({ authShim: stubShim(null), scriptFetch, graphFetch, log: () => {} });
      ok((await L.load({ contract: MCP_CONTRACT })).ok, 'scriptFetch load failed');
      const n = fetched.length;
      for (const bad of ['admin.html', '../js/config.js', 'user-guide.html?x=1', 'js/config.js', 'README.MD']) {
        const e = await rejects(L.evalInContext(`fetchGuide(${JSON.stringify(bad)})`), bad + ' was fetched');
        eq(e.message, 'not a Newton guide', bad);
      }
      eq((await rejects(L.evalInContext('fetchGuide(42)'), 'a number was fetched')).message, 'not a Newton guide', 'non-string');
      eq(fetched.length, n, 'an unlisted guide reached the network');
      eq((await rejects(L.evalInContext('fetchGuide("user-guide.html")'), '404 resolved')).message, 'HTTP 404', '404');
      ok(/larger than/.test((await rejects(L.evalInContext('fetchGuide("people-user-guide.html")'), 'over-size resolved')).message), 'over-size');
      ok((await L.evalInContext('fetchGuide("sales-user-guide.html")')).length > 0, 'sales guide');
      const last = fetched[fetched.length - 1];
      ok(last.method === 'GET' && last.url.startsWith(SCRIPT_BASE + 'sales-user-guide.html?v='), 'guide request: ' + JSON.stringify(last));
    });

    await check546('AC10 registry: entries with no / empty / foreign roles, write entries with a handler or missing preview / commit, and read entries with a write key are skipped and logged; valid read and write entries are served', async () => {
      const logs = [];
      const h = () => async () => ({});
      const tools = [
        { name: 'ok_read', roles: R, handler: h() },
        { name: 'ok_write', roles: ['admin'], write: true, preview: h(), commit: h() },
        { name: 'no_roles', handler: h() },
        { name: 'empty_roles', roles: [], handler: h() },
        { name: 'foreign_role', roles: ['admin', 'talent_partner'], handler: h() },
        { name: 'write_handler', roles: R, write: true, preview: h(), commit: h(), handler: h() },
        { name: 'write_no_commit', roles: R, write: true, preview: h() },
        { name: 'write_no_preview', roles: R, write: true, commit: h() },
        { name: 'read_write_key', roles: R, write: false, handler: h() },
      ];
      const srv = harness(createServer, { loader: fakeLoader({ tools }), auth: fakeAuth(), log: l => logs.push(String(l)) });
      eq((await srv.req('tools/list')).result.tools.map(t => t.name), ['newton_status', 'ok_read', 'ok_write'], 'served tools');
      ['no_roles (no roles)', 'empty_roles (no roles)', 'foreign_role (a role outside', 'write_handler (write entry has a handler)', 'write_no_commit (write entry needs preview and commit)',
        'write_no_preview (write entry needs preview and commit)', 'read_write_key (read entry has a write key)'].forEach(t => ok(logs.some(l => l.includes('skipped tool entry ' + t)), 'not logged: ' + t));
      serverLines.push(...srv.lines);
    });

    await check546('AC11 / AC12 per-tool gate: a tool outside your role answers MSG.toolRole without running; tools/list lists everything before the role is known, then only your tools; handlers get a frozen ctx', async () => {
      let ran = 0;
      let seenCtx = null;
      const tools = [
        { name: 'admin_only', roles: ['admin'], handler: async () => { ran++; return {}; } },
        { name: 'both', roles: R, handler: async (args, ctx) => { seenCtx = ctx; return { got: Object.keys(args).length }; } },
      ];
      const lead = harness(createServer, { loader: fakeLoader({ role: 'leadership', tools }), auth: fakeAuth() });
      eq((await lead.req('tools/list')).result.tools.map(t => t.name), ['newton_status', 'admin_only', 'both'], 'before the role is known');
      const r = await lead.tool('admin_only');
      ok(r.isError && r.text === MSG.toolRole('leadership'), 'toolRole: ' + r.text);
      eq(ran, 0, 'handler ran for the wrong role');
      eq((await lead.req('tools/list')).result.tools.map(t => t.name), ['newton_status', 'both'], 'leadership once known');
      ok(!(await lead.tool('both')).isError, 'both for leadership');
      ok(seenCtx && Object.isFrozen(seenCtx) && seenCtx.email === 'chris@example.com' && seenCtx.role === 'leadership', 'ctx: ' + JSON.stringify(seenCtx));
      const adm = harness(createServer, { loader: fakeLoader({ role: 'admin', tools }), auth: fakeAuth() });
      ok(!(await adm.tool('admin_only')).isError, 'admin_only for admin');
      eq((await adm.req('tools/list')).result.tools.map(t => t.name), ['newton_status', 'admin_only', 'both'], 'admin once known');
      const tp = harness(createServer, { loader: fakeLoader({ role: 'talent_partner', tools }), auth: fakeAuth() });
      eq((await tp.tool('both')).text, MSG.gate('chris@example.com', 'talent_partner'), 'outer gate first');
      eq((await tp.req('tools/list')).result.tools.map(t => t.name), ['newton_status'], 'outer gate fails once known');
      eq(MSG.toolRole('leadership'), "That isn't available to your Newton role (leadership).", 'MSG.toolRole text');
      eq(MSG.gate('a@b.co', 'viewer'), "Newton for Claude isn't available to your Newton role (viewer). You're signed in as a@b.co.", 'MSG.gate text');
      serverLines.push(...lead.lines, ...adm.lines, ...tp.lines);
    });

    // A fake write tool: records what preview / commit saw and whether the shim was armed.
    function writeTool(L, over = {}) {
      const t = {
        name: 'set_thing', description: 'Sets a thing.', roles: R, write: true,
        inputSchema: { type: 'object', properties: { id: { type: 'integer' }, to: { type: 'string' } }, required: ['id', 'to'], additionalProperties: false },
        previews: [], commits: [],
        preview: async (args, ctx) => {
          t.previews.push({ ctx, armed: L.writesArmed() });
          t.lastOut = { summary: `Thing ${args.id} to ${args.to}`, changes: [{ field: 'Thing', from: 'a', to: args.to }], plan: { id: args.id, to: args.to, before: 'PLAN-SECRET-a' } };
          return t.lastOut;
        },
        commit: async (plan, ctx) => { t.commits.push({ plan, ctx, armed: L.writesArmed() }); return { saved: plan.id }; },
      };
      return Object.assign(t, over);
    }

    await check546('AC13 / AC14 / AC18 preview + confirm: preview checks its own schema, never arms the shim, returns preview + 22-char token + expiresAt + next and no plan; the commit gets the stored plan (not a later mutation), runs armed, disarms after success and failure; write tools advertise confirmToken, no required, two-step text and the write annotations', async () => {
      const t = 1000000;
      const L = fakeLoader({ cfg: wCfg() });
      L.cfg.MCP.confirmTtlMs = 300000;
      const tool = writeTool(L);
      const boom = writeTool(L, { name: 'boom_thing', commit: async () => { tool.boomArmed = L.writesArmed(); throw new Error('boom'); } });
      L.tools = [tool, boom, { name: 'read_it', roles: R, handler: async () => ({}) }];
      const h = harness(createServer, { loader: L, auth: fakeAuth(), now: () => t });
      const list = (await h.req('tools/list')).result.tools;
      const adv = list.find(x => x.name === 'set_thing');
      eq(Object.keys(adv.inputSchema.properties), ['id', 'to', 'confirmToken'], 'advertised properties');
      ok(adv.inputSchema.required === undefined && adv.inputSchema.additionalProperties === false, 'advertised schema keeps closed, drops required');
      ok(adv.description.startsWith('Sets a thing. Two steps:') && /only \{ confirmToken \}/.test(adv.description), 'two-step description: ' + adv.description);
      eq(adv.annotations, WRITE_ANNOTATIONS, 'write annotations');
      eq(WRITE_ANNOTATIONS, { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }, 'AMCP-A4 annotations');
      eq(list.find(x => x.name === 'read_it').annotations, { readOnlyHint: true, openWorldHint: false }, 'read tools stay read-only');
      eq((await h.tool('set_thing', { id: 7 })).text, 'Missing required argument: to.', 'preview validates the tool schema');
      eq((await h.tool('set_thing', { id: 7, to: 'b', extra: 1 })).text, 'Unknown argument: extra.', 'closed schema');
      const p = await h.tool('set_thing', { id: 7, to: 'b' });
      ok(!p.isError && p.data, 'preview: ' + p.text);
      eq(p.data.preview, { summary: 'Thing 7 to b', changes: [{ field: 'Thing', from: 'a', to: 'b' }], warnings: [] }, 'shown preview');
      ok(/^[A-Za-z0-9_-]{22}$/.test(p.data.confirmToken), 'token shape: ' + p.data.confirmToken);
      eq(p.data.expiresAt, new Date(1000000 + 300000).toISOString(), 'expiresAt = now + confirmTtlMs');
      eq(p.data.next, MSG.confirmNext('set_thing'), 'next');
      ok(p.data.newtonBuild === 'test-build' && !isNaN(Date.parse(p.data.asOf)), 'preview wrapped');
      ok(!p.text.includes('"plan"') && !p.text.includes('PLAN-SECRET'), 'the plan reached Claude: ' + p.text);
      eq(tool.previews.map(x => x.armed), [false], 'preview ran armed');
      ok(Object.isFrozen(tool.previews[0].ctx) && tool.previews[0].ctx.role === 'leadership', 'preview ctx');
      eq(tool.commits.length, 0, 'preview committed');
      tool.lastOut.plan.to = 'MUTATED';   // live code changing its own object after the preview
      const c = await h.tool('set_thing', { confirmToken: p.data.confirmToken });
      ok(!c.isError && c.data.saved === 7 && c.data.newtonBuild === 'test-build', 'confirm: ' + c.text);
      eq(tool.commits.map(x => [x.plan, x.armed]), [[{ id: 7, to: 'b', before: 'PLAN-SECRET-a' }, true]], 'commit got the stored plan, armed');
      ok(Object.isFrozen(tool.commits[0].ctx) && tool.commits[0].ctx.email === 'chris@example.com', 'commit ctx');
      eq(L.writesArmed(), false, 'disarmed after a commit');
      const pb = await h.tool('boom_thing', { id: 1, to: 'x' });
      const cb = await h.tool('boom_thing', { confirmToken: pb.data.confirmToken });
      ok(cb.isError && cb.text === "Newton couldn't answer: boom", 'commit failure: ' + cb.text);
      eq([tool.boomArmed, L.writesArmed()], [true, false], 'armed during, disarmed after a failed commit');
      serverLines.push(...h.lines);
    });

    await check546('AC13 preview guard: a denied key in the shown part is withheld and issues no token; a malformed preview or a plan that is not JSON is refused with MSG.badPreview', async () => {
      const L = fakeLoader({ cfg: wCfg() });
      const circ = { a: 1 };
      circ.self = circ;
      L.tools = [
        writeTool(L, { name: 'leaky', preview: async () => ({ summary: 's', changes: [{ field: 'x', from: 1, to: 2, CandidateName: 'Jo' }], plan: {} }) }),
        writeTool(L, { name: 'bigint_plan', preview: async () => ({ summary: 's', changes: [], plan: { n: BigInt(1) } }) }),
        writeTool(L, { name: 'circular_plan', preview: async () => ({ summary: 's', changes: [], plan: circ }) }),
        writeTool(L, { name: 'no_plan', preview: async () => ({ summary: 's', changes: [] }) }),
        writeTool(L, { name: 'undef_plan', preview: async () => ({ summary: 's', changes: [], plan: undefined }) }),
        writeTool(L, { name: 'bad_changes', preview: async () => ({ summary: 's', changes: 'x', plan: {} }) }),
      ];
      const h = harness(createServer, { loader: L, auth: fakeAuth() });
      const r = await h.tool('leaky', { id: 1, to: 'x' });
      ok(r.isError && /withheld a restricted field \(CandidateName\)/.test(r.text) && !r.text.includes('confirmToken'), 'guard: ' + r.text);
      for (const name of ['bigint_plan', 'circular_plan', 'no_plan', 'undef_plan', 'bad_changes']) {
        eq((await h.tool(name, { id: 1, to: 'x' })).text, MSG.badPreview(name), name);
      }
      serverLines.push(...h.lines);
    });

    await check546('AC15 tokens: single use (also when the confirm fails), expire at confirmTtlMs, bound to the tool and the signed-in email (a user change drops every token), unknown refused; confirmToken must be sent alone; the 21st open token evicts the oldest', async () => {
      let t = 0;
      const L = fakeLoader({ cfg: wCfg() });
      L.cfg.MCP.confirmTtlMs = 1000;
      const a = writeTool(L);
      let failNext = true;
      const b = writeTool(L, { name: 'other_thing', commit: async () => { if (failNext) { failNext = false; throw new Error('first try fails'); } return { ok: true }; } });
      L.tools = [a, b];
      const auth = fakeAuth();
      const h = harness(createServer, { loader: L, auth, now: () => t });
      const tok = async name => (await h.tool(name, { id: 1, to: 'x' })).data.confirmToken;
      const t1 = await tok('set_thing');
      ok(!(await h.tool('set_thing', { confirmToken: t1 })).isError, 'first use');
      eq((await h.tool('set_thing', { confirmToken: t1 })).text, MSG.tokenInvalid, 'second use');
      const t2 = await tok('set_thing');
      t += 999;
      ok(!(await h.tool('set_thing', { confirmToken: t2 })).isError, 'just inside the TTL');
      const t3 = await tok('set_thing');
      t += 1000;
      eq((await h.tool('set_thing', { confirmToken: t3 })).text, MSG.tokenInvalid, 'at expiry');
      const t4 = await tok('set_thing');
      eq((await h.tool('other_thing', { confirmToken: t4 })).text, MSG.tokenInvalid, 'wrong tool');
      eq((await h.tool('set_thing', { confirmToken: t4 })).text, MSG.tokenInvalid, 'a wrong-tool attempt spends the token');
      const t5 = await tok('other_thing');
      eq((await h.tool('other_thing', { confirmToken: t5 })).text, "Newton couldn't answer: first try fails", 'failed confirm');
      eq((await h.tool('other_thing', { confirmToken: t5 })).text, MSG.tokenInvalid, 'a failed confirm spends the token');
      const t6 = await tok('set_thing');
      auth.email = 'someone@example.com';
      eq((await h.tool('set_thing', { confirmToken: t6 })).text, MSG.tokenInvalid, 'different signed-in email');
      const t7 = await tok('set_thing');   // as someone@
      auth.email = 'chris@example.com';
      await h.tool('newton_status');        // the gate sees a new user and drops every token
      auth.email = 'someone@example.com';
      eq((await h.tool('set_thing', { confirmToken: t7 })).text, MSG.tokenInvalid, 'tokens dropped on a user change');
      eq((await h.tool('set_thing', { confirmToken: 'not-a-real-token-at-all' })).text, MSG.tokenInvalid, 'unknown token');
      const t8 = await tok('set_thing');
      eq((await h.tool('set_thing', { confirmToken: t8, id: 1 })).text, MSG.confirmAlone, 'token with other arguments');
      eq((await h.tool('set_thing', { confirmToken: 5 })).text, MSG.confirmAlone, 'non-string token');
      eq(a.commits.length, 2, 'commits that should have run');
      let n = 0;
      const store = createTokenStore({ now: () => 0, random: () => 'tok' + (n++) });
      const issued = [];
      for (let i = 0; i < 21; i++) issued.push(store.issue({ tool: 'x', email: 'e', planJson: '{}' }).token);
      eq(store.size(), 20, 'at most 20 open');
      eq(store.take(issued[0]), null, 'the oldest was evicted');
      ok(store.take(issued[1]) && store.take(issued[20]), 'the rest are open');
      const def = createTokenStore({ now: () => 0, ttlMs: () => undefined });
      eq(def.issue({ tool: 'x', email: 'e', planJson: '{}' }).expiresAt, new Date(300000).toISOString(), 'TTL fallback 5 minutes');
      eq(Buffer.from(createTokenStore().issue({ tool: 'x', email: 'e', planJson: '{}' }).token, 'base64url').length, 16, '128-bit token');
      eq([MSG.tokenInvalid, MSG.confirmAlone], ['That confirmation has expired or was already used. Ask for a new preview.', 'Send confirmToken on its own to confirm, or call without it for a new preview.'], 'token messages');
      serverLines.push(...h.lines);
    });

    await check546('AC16 confirm re-checks the role fresh (gate cache warm): outside the tool roles -> MSG.toolRole, outside allowedRoles -> MSG.gate, commit not called; MCP_STALE -> MSG.stale; MCP_REFUSED -> its own message', async () => {
      let t = 0;
      const L = fakeLoader({ cfg: wCfg(), role: 'leadership' });
      const a = writeTool(L, { roles: ['leadership'] });
      L.tools = [
        a,
        writeTool(L, { name: 'stale_thing', commit: async () => { throw Object.assign(new Error('x'), { code: 'MCP_STALE' }); } }),
        writeTool(L, { name: 'refused_thing', preview: async () => { throw Object.assign(new Error('Do that in Newton on the role page.'), { code: 'MCP_REFUSED' }); } }),
        writeTool(L, { name: 'refused_commit', commit: async () => { throw Object.assign(new Error('No longer allowed.'), { code: 'MCP_REFUSED' }); } }),
      ];
      const h = harness(createServer, { loader: L, auth: fakeAuth(), now: () => t });
      const tok = async name => (await h.tool(name, { id: 1, to: 'x' })).data.confirmToken;
      const t1 = await tok('set_thing');
      L.role = 'admin';   // the gate cache still says leadership
      eq((await h.tool('set_thing', { confirmToken: t1 })).text, MSG.toolRole('admin'), 'fresh role outside the tool roles');
      L.role = 'leadership';
      t += 600000;   // past gateTtlMs: the cache re-resolves leadership
      const t2 = await tok('set_thing');
      L.role = 'talent_partner';
      eq((await h.tool('set_thing', { confirmToken: t2 })).text, MSG.gate('chris@example.com', 'talent_partner'), 'fresh role outside allowedRoles');
      eq(a.commits.length, 0, 'a commit ran after a failed re-check');
      L.role = 'leadership';
      t += 600000;
      eq((await h.tool('stale_thing', { confirmToken: await tok('stale_thing') })).text, MSG.stale, 'MCP_STALE');
      eq(MSG.stale, 'This changed in Newton since the preview. Ask again for a new preview.', 'MSG.stale text');
      eq((await h.tool('refused_thing', { id: 1, to: 'x' })).text, 'Do that in Newton on the role page.', 'MCP_REFUSED from a preview');
      eq((await h.tool('refused_commit', { confirmToken: await tok('refused_commit') })).text, 'No longer allowed.', 'MCP_REFUSED from a commit');
      serverLines.push(...h.lines);
    });

    await check546('AC17 write lock: two confirms never overlap; a read waits for a running commit; newton_status does not; a slow commit answers MSG.commitSlow and stays armed until it settles; past commitHardMs it is disarmed and the lock released', async () => {
      const L = fakeLoader({ cfg: wCfg() });
      const events = [];
      let active = 0;
      let maxActive = 0;
      let started;
      const startedP = new Promise(r => { started = r; });
      const slowCommit = writeTool(L, { commit: async plan => {
        active++; maxActive = Math.max(maxActive, active); events.push('start ' + plan.id); started();
        await delay(40);
        events.push('end ' + plan.id); active--;
        return { saved: plan.id };
      } });
      L.tools = [slowCommit, { name: 'probe', roles: R, handler: async () => { events.push('read'); return {}; } }];
      const h = harness(createServer, { loader: L, auth: fakeAuth() });
      const p1 = (await h.tool('set_thing', { id: 1, to: 'x' })).data.confirmToken;
      const p2 = (await h.tool('set_thing', { id: 2, to: 'x' })).data.confirmToken;
      const both = Promise.all([h.tool('set_thing', { confirmToken: p1 }), h.tool('set_thing', { confirmToken: p2 })]);
      await startedP;
      const readP = h.tool('probe');
      const st = await h.tool('newton_status');
      events.push('status');
      const [c1, c2] = await both;
      await readP;
      ok(!c1.isError && !c2.isError, 'confirms: ' + c1.text + ' / ' + c2.text);
      eq(maxActive, 1, 'two commits overlapped');
      ok(!st.isError, 'status: ' + st.text);
      ok(events.indexOf('status') < events.indexOf('end 1'), 'newton_status waited for the commit: ' + events.join(', '));
      ok(events.indexOf('read') > events.indexOf('end 1'), 'the read ran during a commit: ' + events.join(', '));
      ok(events.indexOf('start 2') > events.indexOf('end 1'), 'second commit started before the first ended: ' + events.join(', '));

      const L2 = fakeLoader({ cfg: wCfg() });
      let finish;
      L2.tools = [
        writeTool(L2, { commit: () => new Promise(r => { finish = r; }) }),
        writeTool(L2, { name: 'never_thing', commit: () => new Promise(() => {}) }),
        { name: 'probe', roles: R, handler: async () => ({ fine: true }) },
      ];
      const logs = [];
      const h2 = harness(createServer, { loader: L2, auth: fakeAuth(), toolTimeoutMs: 30, commitHardMs: 80, log: l => logs.push(String(l)) });
      const s1 = (await h2.tool('set_thing', { id: 1, to: 'x' })).data.confirmToken;
      eq((await h2.tool('set_thing', { confirmToken: s1 })).text, MSG.commitSlow, 'slow commit message');
      eq(MSG.commitSlow, 'Newton is still saving that change. Check Newton before trying again.', 'MSG.commitSlow text');
      eq(L2.writesArmed(), true, 'disarmed before the slow commit settled');
      finish({ saved: 1 });
      await delay(5);
      eq(L2.writesArmed(), false, 'still armed after the slow commit settled');
      const s2 = (await h2.tool('never_thing', { id: 1, to: 'x' })).data.confirmToken;
      eq((await h2.tool('never_thing', { confirmToken: s2 })).text, MSG.commitSlow, 'hung commit message');
      eq(L2.writesArmed(), true, 'armed while inside commitHardMs');
      await delay(70);
      eq(L2.writesArmed(), false, 'still armed past commitHardMs');
      ok(logs.some(l => l.includes('commit never_thing exceeded hard limit; writes disarmed')), 'hard-limit log line');
      const after = await h2.tool('probe');
      ok(!after.isError && after.data.fine === true, 'lock not released after the hard limit: ' + after.text);
      serverLines.push(...h.lines, ...h2.lines);
    });

    await check546('AC19 initialize carries the contract-2 INSTRUCTIONS; MSG.confirmNext text; no "Leadership and Admin only" or "read-only answers" left in server-core.js', async () => {
      const h = harness(createServer, { loader: fakeLoader(), auth: fakeAuth() });
      const init = await h.req('initialize', { protocolVersion: '2025-06-18' });
      eq(init.result.instructions, INSTRUCTIONS, 'instructions');
      ok(/Never confirm on your own\.$/.test(INSTRUCTIONS) && /shows only what your Newton role can see/.test(INSTRUCTIONS), 'INSTRUCTIONS text');
      eq(MSG.confirmNext('log_weekly_activity'), 'Show this preview to the user in full. Only if they say yes in this conversation, call log_weekly_activity again with only { confirmToken }. Nothing has been saved yet.', 'confirmNext');
      const src = fs.readFileSync(path.join(BOOT, 'server-core.js'), 'utf8');
      ok(!/Leadership and Admin only|read-only answers/.test(src), 'old wording left in server-core.js');
      serverLines.push(...h.lines);
    });

    // ── AC 12: manifest ─────────────────────────────────────────────
    await check('AC12 mcp/manifest.json: MCPB 0.3, version = BUNDLE_VERSION, entry point exists, Windows only, node >= 18', async () => {
      const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp', 'manifest.json'), 'utf8'));
      eq([m.manifest_version, m.name, m.version, m.server.type], ['0.3', 'newton', BUNDLE_VERSION, 'node'], 'manifest basics');
      ok(fs.existsSync(path.join(ROOT, 'mcp', m.server.entry_point)), 'entry_point ' + m.server.entry_point + ' missing');
      eq(m.server.mcp_config.args, ['${__dirname}/' + m.server.entry_point], 'mcp_config args');
      eq([m.compatibility.platforms, m.compatibility.runtimes.node, m.tools_generated], [['win32'], '>=18.0.0', true], 'compatibility');
      ok(m.tools.some(t => t.name === 'newton_status'), 'newton_status not declared');
    });
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  // ── AC 9 + stdout discipline, over everything written during the run ──
  const stderrText = errChunks.join('');
  const stdoutText = outChunks.join('');
  const linesText = serverLines.map(l => JSON.stringify(l)).join('\n');
  const leakName = 'N-392 AC9 no sign-in code, PKCE verifier, access or refresh token appears in stdout, stderr or any protocol line';
  const leaked = Array.from(secrets).filter(s => stderrText.includes(s) || linesText.includes(s) || stdoutText.includes(s));
  if (leaked.length) {
    results.push({ name: leakName, ok: false, message: 'leaked: ' + leaked.map(s => s.slice(0, 6) + '...').join(', ') });
  } else if (!/token request failed: invalid_grant/.test(stderrText)) {
    // Positive control: the capture really saw the bootstrap's logs.
    results.push({ name: leakName, ok: false, message: 'positive control failed: the invalid_grant log line was not captured, so the scan proves nothing' });
  } else if (secrets.size < 6) {
    results.push({ name: leakName, ok: false, message: 'positive control failed: the PKCE verifier was never captured' });
  } else {
    results.push({ name: leakName, ok: true });
  }
  const outName = 'N-392 AC5 nothing reaches stdout outside the protocol writer: no bootstrap or live-code log line was written to stdout during the checks';
  results.push(stdoutText === ''
    ? { name: outName, ok: true }
    : { name: outName, ok: false, message: 'stdout received: ' + stdoutText.slice(0, 200) });
  return results;
}

module.exports = { run };
