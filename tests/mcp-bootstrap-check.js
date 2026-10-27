// tests/mcp-bootstrap-check.js - N-392: Node-side checks of the Newton for Claude bootstrap
// (mcp/bootstrap/server.js, server-core.js, auth-node.js, loader.js).
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
function fakeLoader({ cfg = fakeConfig(), role = 'leadership', tools = [], states = null } = {}) {
  const L = {
    cfg, role, tools, calls: [],
    states: states || [{ ok: true, liveContract: 1, loadedAt: '2026-10-27T12:00:00.000Z' }],
    loads: 0,
    load: async () => L.states[Math.min(L.loads++, L.states.length - 1)],
    config: () => L.cfg,
    call: (fn, ...a) => {
      L.calls.push(fn);
      if (fn === 'getEffectiveRole') return Promise.resolve(L.role);
      if (fn === 'wasListDenied') return a[0] === 'SalesForecasts';
      throw new Error('fake loader has no ' + fn);
    },
    liveTools: () => L.tools,
  };
  return L;
}
function fakeAuth(email = 'chris@example.com') {
  return {
    ensureToken: async () => 'tok',
    status: () => ({ signedIn: true, email, storeMode: 'encrypted (Windows DPAPI)', pendingSince: null }),
    takeLastError: () => null,
    startSignIn: async () => ({}),
    currentUser: () => ({ email, name: 'Test' }),
    shutdown() {},
  };
}
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
    await check('AC1 CONFIG.MCP has exactly contract/scripts/allowedLists/allowedRoles/gateTtlMs + the N-393 outputDenyFields/windows/maxRows; contract equals the bundle', async () => {
      ok(realState.ok, 'live load failed: ' + realState.reason);
      const m = real.config().MCP;
      eq(Object.keys(m).sort(), ['allowedLists', 'allowedRoles', 'contract', 'gateTtlMs', 'maxRows', 'outputDenyFields', 'scripts', 'windows'], 'CONFIG.MCP keys');
      eq(m.contract, MCP_CONTRACT, 'CONFIG.MCP.contract vs server.js MCP_CONTRACT');
      eq(Array.from(m.allowedRoles).sort(), ['admin', 'leadership'], 'allowedRoles');
      ok(!Array.from(m.allowedLists).some(l => /PeoplePay|GPInvoices|LCI|Survey|Diagnostics|Notifications/.test(l)), 'allowedLists names an MCP-D7 never-read list');
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
      const L = fakeLoader({ tools: [{ name: 'echo_tool', description: 'd', inputSchema: { type: 'object', properties: {} }, handler: async () => ({}) }] });
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
        tools: [{ name: 'echo_tool', handler: async () => ({}) }],
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
      const tools = [{ name: 'echo_tool', handler: async () => { handled++; return { ok: true }; } }];
      const tp = harness(createServer, { loader: fakeLoader({ role: 'talent_partner', tools }), auth: fakeAuth() });
      for (const name of ['newton_status', 'echo_tool']) {
        const r = await tp.tool(name);
        ok(r.isError && r.text === MSG.gate('chris@example.com'), `${name} for talent_partner: ${r.text}`);
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
      eq((await h.tool('echo_tool')).text, MSG.gate('chris@example.com'), 'role change after gateTtlMs');
      serverLines.push(...tp.lines, ...h.lines);
    });

    // ── AC 11: tool wrapper ─────────────────────────────────────────
    await check('AC11 live tools: asOf + newtonBuild added; args validated; 403 / 405 / timeout mapped; server answers after a hung handler; bad registry entries skipped', async () => {
      const tools = [
        { name: 'echo_tool', inputSchema: { type: 'object', properties: { x: { type: 'string' }, n: { type: 'integer', enum: [1, 2] } }, required: ['x'] }, handler: async a => ({ x: a.x }) },
        { name: 'denied', handler: async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); } },
        { name: 'writes', handler: async () => { throw Object.assign(new Error('Newton for Claude is read-only (blocked PATCH write)'), { status: 405 }); } },
        { name: 'hang', handler: () => new Promise(() => {}) },
        { name: 'echo_tool', handler: async () => ({}) },
        { name: 'newton_status', handler: async () => ({}) },
        { name: 'Bad Name', handler: async () => ({}) },
      ];
      const h = harness(createServer, { loader: fakeLoader({ tools }), auth: fakeAuth(), toolTimeoutMs: 30 });
      eq((await h.req('tools/list')).result.tools.map(t => t.name), ['newton_status', 'echo_tool', 'denied', 'writes', 'hang'], 'registry filtering');
      const e = await h.tool('echo_tool', { x: 'hi' });
      ok(!e.isError && e.data.x === 'hi' && e.data.newtonBuild === 'test-build' && !isNaN(Date.parse(e.data.asOf)), 'wrapped result: ' + e.text);
      eq((await h.tool('echo_tool', {})).text, 'Missing required argument: x.', 'required');
      eq((await h.tool('echo_tool', { x: 1 })).text, 'Argument x must be a string.', 'type');
      eq((await h.tool('echo_tool', { x: 'a', n: 3 })).text, 'Argument n must be one of: 1, 2.', 'enum');
      eq((await h.tool('denied')).text, MSG.denied, '403');
      ok(/read-only/.test((await h.tool('writes')).text), '405');
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
