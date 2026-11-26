// mcp/bootstrap/server-core.js - Newton for Claude, local MCP server (N-392). Node only.
//
// Everything the server does, with NO side effects at require time: server.js (the
// extension's entry point) calls main(); tests/mcp-bootstrap-check.js requires this file
// and drives createServer() directly. Speaks MCP over
// stdio: newline-delimited JSON-RPC 2.0, one message per line. STDOUT CARRIES THE
// PROTOCOL ONLY - everything else (logs, Newton's own console output) goes to stderr,
// which Claude Desktop keeps in its MCP log.
//
// This file holds no Newton logic (N-378 MCP-D4). It:
//   - loads Newton's live code (loader.js) and checks the bundle <-> live contract
//   - signs the user in (auth-node.js) without ever blocking a call (A6)
//   - gates every tool to CONFIG.MCP.allowedRoles via the live getEffectiveRole (MCP-D5),
//     then to the tool's own `roles` (N-546, AMCP-A1) - checked on every call
//   - answers newton_status itself (A2) and dispatches every other tool to the live
//     MCP_TOOLS registry, adding asOf + newtonBuild to each result
//   - runs write tools as preview + confirm token (N-546, AMCP-A4): the preview writes
//     nothing and returns a single-use token; the confirm call re-checks the role fresh,
//     arms the loader's write shim and runs the tool's commit on the STORED plan, one
//     commit at a time. Tokens live only in this file's memory.
//
// Contract 2 (N-546, AMCP-A6) - what live MCP_TOOLS entries must look like:
//   read:  { name, description, inputSchema, roles: [...], handler(args, ctx) }
//   write: { name, description, inputSchema, roles: [...], write: true,
//            preview(args, ctx) -> { summary, changes: [{ field, from, to }], warnings?, plan },
//            commit(plan, ctx)  -> result }
//   ctx = frozen { email, role }. roles ⊆ CONFIG.MCP.allowedRoles. Throw an Error with
//   code 'MCP_REFUSED' for a user-facing refusal, 'MCP_STALE' when Newton changed since
//   the preview.
'use strict';

const crypto = require('crypto');
const util = require('util');
const { StringDecoder } = require('string_decoder');

const BUNDLE_VERSION = '2.0.0';   // must equal mcp/manifest.json "version"
const MCP_CONTRACT = 2;           // must equal CONFIG.MCP.contract (js/config.js)
const DOWNLOAD_URL = 'https://momentumglobal.github.io/newton/mcp/newton-for-claude.mcpb';
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_PROTOCOL = '2025-06-18';
const LOAD_WAIT_MS = 20000;
const LOAD_RETRY_MS = 60000;
const TOOL_TIMEOUT_MS = 50000;
const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
// N-546 (AMCP-A4): write tools are marked so Claude Desktop asks before each call.
const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
const WRITE_STEPS = ' Two steps: call it to get a preview, show the preview to the user, then call again with only { confirmToken } once they say yes.';
const DEFAULT_CONFIRM_TTL_MS = 300000;   // fallback when CONFIG.MCP.confirmTtlMs is missing or bad
const MAX_OPEN_TOKENS = 20;
const COMMIT_HARD_MS = 120000;           // after this a commit is disarmed whether or not it settled

const MSG = {
  update: `Newton for Claude needs updating. Download the latest version from ${DOWNLOAD_URL} and double-click it to reinstall, then restart Claude.`,
  signInStarted: 'A browser window has opened for Newton sign-in. Finish signing in, then ask again.',
  signInPending: t => `Finish signing in to Newton in the browser window opened at ${t}, then ask again.`,
  signInRetry: 'Ask again to retry sign-in.',
  gate: (email, role) => `Newton for Claude isn't available to your Newton role (${role || 'none'}). You're signed in as ${email}.`,
  toolRole: role => `That isn't available to your Newton role (${role}).`,
  loadFailed: reason => `Couldn't load Newton (${reason}). Check your internet connection and try again.`,
  denied: "That Newton data isn't available to your account.",
  timeout: 'Newton took too long to answer. Try again, or ask for a smaller slice (one project, fewer weeks).',
  confirmNext: name => `Show this preview to the user in full. Only if they say yes in this conversation, call ${name} again with only { confirmToken }. Nothing has been saved yet.`,
  confirmAlone: 'Send confirmToken on its own to confirm, or call without it for a new preview.',
  tokenInvalid: 'That confirmation has expired or was already used. Ask for a new preview.',
  stale: 'This changed in Newton since the preview. Ask again for a new preview.',
  commitSlow: 'Newton is still saving that change. Check Newton before trying again.',
  badPreview: name => `Newton couldn't prepare that change: bad preview from ${name}.`,
};

const INSTRUCTIONS = 'Newton for Claude answers from Momentum Global\'s Newton reporting system (projects, roles, pipeline, ' +
  'placements, people), computed by Newton\'s own code, and shows only what your Newton role can see. If unsure who is signed in ' +
  'or whether it is working, call newton_status first. Tool results never contain candidate names, salaries, budgets, rates or notes. ' +
  'Tools that change Newton work in two steps: the first call returns a preview and a confirmToken and saves nothing; show the user ' +
  'the preview in full and call again with only the confirmToken only after the user says yes in this conversation. Never confirm on your own.';

const STATUS_TOOL = {
  name: 'newton_status',
  description: 'Who you are signed in as in Newton, your Newton role, and whether Newton for Claude is working (build, sign-in storage, lists not available to you). Call this first if unsure; it also starts sign-in.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: READ_ONLY,
};

function stderrLine(...args) {
  process.stderr.write(util.format(...args) + '\n');
}

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text }], isError };
}

function _typeOk(type, v) {
  switch (type) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    case 'array': return Array.isArray(v);
    case 'object': return !!v && typeof v === 'object' && !Array.isArray(v);
    default: return true;
  }
}
// Minimal check of tool arguments against the tool's inputSchema: type, required, enum.
function validateArgs(schema, args) {
  if (!_typeOk('object', args)) return 'Arguments must be an object.';
  const props = (schema && schema.properties) || {};
  for (const req of (schema && schema.required) || []) {
    if (args[req] === undefined) return `Missing required argument: ${req}.`;
  }
  for (const key of Object.keys(args)) {
    const p = props[key];
    if (!p) {
      if (schema && schema.additionalProperties === false) return `Unknown argument: ${key}.`;
      continue;
    }
    if (p.type && !_typeOk(p.type, args[key])) return `Argument ${key} must be a ${p.type}.`;
    if (Array.isArray(p.enum) && !p.enum.includes(args[key])) return `Argument ${key} must be one of: ${p.enum.join(', ')}.`;
  }
  return null;
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TOOL_TIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function hhmm(ts) {
  return new Date(ts).toTimeString().slice(0, 5);
}

// ── Confirm-token store (N-546, AMCP-A4) ────────────────────────────
// 128-bit random tokens, single use (deleted on the first lookup, valid or not), TTL read at
// issue time, at most `max` open (the oldest is evicted). Bound to tool + email; the plan is
// kept as a JSON string so no reference to a live-code object survives.
function createTokenStore({ now = Date.now, ttlMs = () => DEFAULT_CONFIRM_TTL_MS, max = MAX_OPEN_TOKENS,
  random = () => crypto.randomBytes(16).toString('base64url') } = {}) {
  const open = new Map();   // insertion order = age
  function issue({ tool, email, planJson }) {
    while (open.size >= max) open.delete(open.keys().next().value);
    let token = random();
    while (open.has(token)) token = random();
    const ttl = Number(ttlMs());
    const expires = now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_CONFIRM_TTL_MS);
    open.set(token, { tool, email, planJson, expires });
    return { token, expiresAt: new Date(expires).toISOString() };
  }
  function take(token) {
    if (typeof token !== 'string' || !open.has(token)) return null;
    const entry = open.get(token);
    open.delete(token);
    return now() >= entry.expires ? null : entry;
  }
  return { issue, take, dropAll: () => open.clear(), size: () => open.size };
}

// ── Reader / writer lock (N-546) ────────────────────────────────────
// Commits are exclusive: a commit waits for running tool calls to finish, and every tool call
// that arrives while a commit is queued or running waits for it. So nothing else runs while
// the write shim is armed, and two confirms never interleave. FIFO.
function createRwLock() {
  let readers = 0;
  let writer = false;
  const queue = [];
  function pump() {
    while (queue.length) {
      const head = queue[0];
      if (head.write) {
        if (readers === 0 && !writer) { queue.shift(); writer = true; head.resolve(); }
        return;
      }
      if (writer) return;
      queue.shift();
      readers++;
      head.resolve();
    }
  }
  const acquire = write => new Promise(resolve => { queue.push({ write, resolve }); pump(); });
  const release = write => { if (write) writer = false; else readers--; pump(); };
  async function read(fn) {
    await acquire(false);
    try { return await fn(); } finally { release(false); }
  }
  async function write(fn) {
    await acquire(true);
    try { return await fn(); } finally { release(true); }
  }
  return { read, write, state: () => ({ readers, writer, queued: queue.length }) };
}

// Why a live MCP_TOOLS entry can't be served, or null when it can (N-546, AMCP-A1 / A4).
function toolEntryProblem(t, allowedRoles) {
  if (!t || typeof t.name !== 'string' || !TOOL_NAME_RE.test(t.name)) return 'bad name';
  if (t.name === STATUS_TOOL.name) return 'reserved name';
  if (!Array.isArray(t.roles) || t.roles.length === 0) return 'no roles';
  if (!t.roles.every(r => allowedRoles.includes(r))) return 'a role outside CONFIG.MCP.allowedRoles';
  if (t.write === true) {
    if (typeof t.preview !== 'function' || typeof t.commit !== 'function') return 'write entry needs preview and commit';
    if ('handler' in t) return 'write entry has a handler';
    return null;
  }
  if ('write' in t) return 'read entry has a write key';
  if (typeof t.handler !== 'function') return 'no handler';
  return null;
}

function createServer({ loader, auth, write, log = stderrLine, now = Date.now, toolTimeoutMs = TOOL_TIMEOUT_MS, contract = MCP_CONTRACT,
  commitHardMs = COMMIT_HARD_MS, confirmMax = MAX_OPEN_TOKENS }) {
  let loadPromise = null;
  let loadState = null;
  let lastLoadAt = 0;
  let initialised = false;
  let gate = null;   // { email, role, at }
  const tokens = createTokenStore({ now, max: confirmMax, ttlMs: () => cfg().MCP && cfg().MCP.confirmTtlMs });
  const lock = createRwLock();

  function startLoad() {
    lastLoadAt = now();
    const hadFailed = !!(loadState && !loadState.ok);
    loadPromise = Promise.resolve(loader.load({ contract })).then(st => {
      loadState = st;
      if (st.ok && hadFailed && initialised) write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
      if (!st.ok) log(`[newton-mcp] Newton load failed: ${st.reason}`);
      return st;
    });
    return loadPromise;
  }

  async function currentLoad() {
    if (!loadPromise) startLoad();
    else if (loadState && !loadState.ok && !loadState.contractMismatch && now() - lastLoadAt >= LOAD_RETRY_MS) startLoad();
    let t;
    const waited = await Promise.race([
      loadPromise,
      new Promise(resolve => { t = setTimeout(() => resolve(null), LOAD_WAIT_MS); }),
    ]);
    clearTimeout(t);
    return waited || { ok: false, reason: 'still loading' };
  }

  function allowedRoles() {
    const r = cfg().MCP && cfg().MCP.allowedRoles;
    return Array.isArray(r) ? Array.from(r) : [];
  }

  function liveTools() {
    const seen = new Set();
    const out = [];
    const roles = allowedRoles();
    let raw = [];
    try { raw = loader.liveTools(); } catch (e) { log('[newton-mcp] MCP_TOOLS unreadable:', e.message); }
    for (const t of raw) {
      const problem = toolEntryProblem(t, roles) || (seen.has(t.name) ? 'duplicate name' : null);
      if (problem) {
        log(`[newton-mcp] skipped tool entry ${t && t.name ? t.name : '(unnamed)'} (${problem})`);
        continue;
      }
      seen.add(t.name);
      out.push(t);
    }
    return out;
  }

  function describe(t) {
    const schema = t.inputSchema || { type: 'object', properties: {} };
    if (t.write !== true) {
      return { name: t.name, description: String(t.description || ''), inputSchema: schema, annotations: READ_ONLY };
    }
    // The confirm call carries only confirmToken, so the advertised schema drops `required`;
    // the preview call is still checked against the tool's own schema.
    const properties = {};
    Object.keys(schema.properties || {}).forEach(k => { properties[k] = schema.properties[k]; });
    properties.confirmToken = { type: 'string', description: 'Only to confirm a preview the user has approved. Send it on its own.' };
    const advertised = { type: 'object', properties };
    if (schema.additionalProperties === false) advertised.additionalProperties = false;
    return { name: t.name, description: String(t.description || '') + WRITE_STEPS, inputSchema: advertised, annotations: WRITE_ANNOTATIONS };
  }

  function cfg() {
    return loader.config() || {};
  }

  async function signInPrompt() {
    const st = auth.status();
    if (st.pendingSince) return textResult(MSG.signInPending(hhmm(st.pendingSince)));
    const prior = auth.takeLastError();
    if (prior) return textResult(`${prior} ${MSG.signInRetry}`, true);
    try {
      await auth.startSignIn();
    } catch (e) {
      return textResult(`Couldn't start Newton sign-in: ${e.message}`, true);
    }
    return textResult(MSG.signInStarted);
  }

  async function checkGate({ fresh = false } = {}) {
    const email = auth.currentUser().email;
    if (!email) throw new Error('your Newton email could not be read from Microsoft');
    if (gate && gate.email !== email) tokens.dropAll();   // N-546: a different user spends every open token
    const ttl = (cfg().MCP && cfg().MCP.gateTtlMs) || 0;
    if (fresh || !gate || gate.email !== email || now() - gate.at >= ttl) {
      const role = await loader.call('getEffectiveRole', email);
      gate = { email, role, at: now() };
    }
    return { email, role: gate.role, allowed: allowedRoles().includes(gate.role) };
  }

  function ctxFor(g) {
    return Object.freeze({ email: g.email, role: g.role });
  }

  function errorResult(e, name) {
    if (e && e.code === 'TOOL_TIMEOUT') return textResult(MSG.timeout, true);
    if (e && e.code === 'MCP_STALE') return textResult(MSG.stale, true);
    if (e && e.code === 'MCP_REFUSED') return textResult(String(e.message), true);
    if (e && e.status === 403) return textResult(MSG.denied, true);
    if (e && e.status === 405) return textResult(e.message, true);
    log(`[newton-mcp] tool ${name} failed:`, e && e.stack ? e.stack : e);
    return textResult(`Newton couldn't answer: ${e && e.message ? e.message : e}`, true);
  }

  // A plain, JSON-safe copy that has passed the live MCP-D6 guard.
  function guarded(value) {
    return JSON.parse(JSON.stringify(loader.call('mcpOutputGuard', value)));
  }

  async function runRead(tool, args, g) {
    const bad = validateArgs(tool.inputSchema, args);
    if (bad) return textResult(bad, true);
    return lock.read(async () => {
      try {
        const result = await withTimeout(Promise.resolve().then(() => tool.handler(args, ctxFor(g))), toolTimeoutMs);
        return textResult(JSON.stringify(wrap(result)));
      } catch (e) {
        return errorResult(e, tool.name);
      }
    });
  }

  // Preview: validates against the tool's own schema, writes nothing (the shim is not armed),
  // stores the plan and returns the shown part + a token. The plan never goes to Claude.
  async function runPreview(tool, args, g) {
    const bad = validateArgs(tool.inputSchema, args);
    if (bad) return textResult(bad, true);
    return lock.read(async () => {
      let out;
      try {
        out = await withTimeout(Promise.resolve().then(() => tool.preview(args, ctxFor(g))), toolTimeoutMs);
      } catch (e) {
        return errorResult(e, tool.name);
      }
      const shaped = !!out && typeof out === 'object' && typeof out.summary === 'string' && Array.isArray(out.changes) &&
        (out.warnings === undefined || Array.isArray(out.warnings)) && 'plan' in out;
      let planJson;
      try { planJson = shaped ? JSON.stringify(out.plan) : undefined; } catch (e) { planJson = undefined; }
      if (typeof planJson !== 'string') return textResult(MSG.badPreview(tool.name), true);
      let preview;
      try {
        preview = guarded({ summary: out.summary, changes: out.changes, warnings: out.warnings || [] });
      } catch (e) {
        return errorResult(e, tool.name);
      }
      const { token, expiresAt } = tokens.issue({ tool: tool.name, email: g.email, planJson });
      return textResult(JSON.stringify(wrap({ preview, confirmToken: token, expiresAt, next: MSG.confirmNext(tool.name) })));
    });
  }

  // Runs inside the write lock. Settles when the commit does, or at commitHardMs.
  async function commitUnderLock(tool, token) {
    const entry = tokens.take(token);
    const email = auth.currentUser().email;
    if (!entry || entry.tool !== tool.name || !email || entry.email !== email) return textResult(MSG.tokenInvalid, true);
    let g;
    try {
      g = await checkGate({ fresh: true });
    } catch (e) {
      return textResult(`Couldn't check your Newton access (${e.message}).`, true);
    }
    if (!g.allowed) return textResult(MSG.gate(g.email, g.role), true);
    if (!tool.roles.includes(g.role)) return textResult(MSG.toolRole(g.role), true);
    const plan = JSON.parse(entry.planJson);
    const HARD = {};
    let hardTimer;
    loader.armWrites();
    try {
      const commit = Promise.resolve().then(() => tool.commit(plan, ctxFor(g)));
      const hard = new Promise(resolve => { hardTimer = setTimeout(() => resolve(HARD), commitHardMs); });
      const settled = await Promise.race([commit.then(r => ({ r }), e => ({ e })), hard]);
      if (settled === HARD) {
        commit.catch(() => {});
        log(`[newton-mcp] commit ${tool.name} exceeded hard limit; writes disarmed`);
        return textResult(MSG.commitSlow, true);
      }
      if (settled.e) return errorResult(settled.e, tool.name);
      return textResult(JSON.stringify(wrap(guarded(settled.r))));
    } catch (e) {
      return errorResult(e, tool.name);
    } finally {
      clearTimeout(hardTimer);
      loader.disarmWrites();
    }
  }

  async function runConfirm(tool, args) {
    if (Object.keys(args).length !== 1 || typeof args.confirmToken !== 'string') return textResult(MSG.confirmAlone, true);
    const work = lock.write(() => commitUnderLock(tool, args.confirmToken));
    work.catch(() => {});   // the caller may have had commitSlow already; the commit still settles
    try {
      return await withTimeout(work, toolTimeoutMs);
    } catch (e) {
      if (e && e.code === 'TOOL_TIMEOUT') return textResult(MSG.commitSlow, true);
      return errorResult(e, tool.name);
    }
  }

  function wrap(result) {
    const body = result && typeof result === 'object' && !Array.isArray(result) ? result : { result };
    return { asOf: new Date(now()).toISOString(), newtonBuild: cfg().APP_BUILD || null, ...body };
  }

  function statusResult(g, st) {
    const lists = (cfg().MCP && cfg().MCP.allowedLists) || [];
    let notAvailable = [];
    try { notAvailable = lists.filter(l => loader.call('wasListDenied', l)); } catch (e) { /* older live code */ }
    const a = auth.status();
    return {
      signedInAs: g.email,
      role: g.role,
      access: 'allowed',
      bundleVersion: BUNDLE_VERSION,
      contract: { bundle: contract, live: st.liveContract },
      loadedAt: st.loadedAt,
      tokenStore: a.storeMode,
      listsNotAvailable: notAvailable,
    };
  }

  async function callTool(params) {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    const st = await currentLoad();
    if (!st.ok) return textResult(st.contractMismatch ? MSG.update : MSG.loadFailed(st.reason), true);

    let tool = null;
    if (name !== STATUS_TOOL.name) {
      tool = liveTools().find(t => t.name === name);
      if (!tool) return { rpcError: { code: -32602, message: `Unknown tool: ${name}` } };
    }

    let token;
    try {
      token = await auth.ensureToken();
    } catch (e) {
      return textResult(`Couldn't reach Microsoft sign-in (${e.message}). Check your connection and try again.`, true);
    }
    if (!token) return signInPrompt();

    let g;
    try {
      g = await checkGate();
    } catch (e) {
      return textResult(`Couldn't check your Newton access (${e.message}).`, true);
    }
    if (!g.allowed) return textResult(MSG.gate(g.email, g.role), true);

    if (!tool) return textResult(JSON.stringify(wrap(statusResult(g, st))));
    if (!tool.roles.includes(g.role)) return textResult(MSG.toolRole(g.role), true);

    if (tool.write !== true) return runRead(tool, args, g);
    if (!_typeOk('object', args)) return textResult('Arguments must be an object.', true);
    if (args.confirmToken !== undefined) return runConfirm(tool, args);
    return runPreview(tool, args, g);
  }

  // tools/list: every valid tool before the role is known; once it is, the caller's tools only.
  function listFor(tools) {
    if (!gate) return tools;
    if (!allowedRoles().includes(gate.role)) return [];
    return tools.filter(t => t.roles.includes(gate.role));
  }

  async function dispatch(msg) {
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params && msg.params.protocolVersion;
        return {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : DEFAULT_PROTOCOL,
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: 'newton', version: BUNDLE_VERSION },
          instructions: INSTRUCTIONS,
        };
      }
      case 'ping':
        return {};
      case 'tools/list': {
        const st = await currentLoad();
        const tools = [STATUS_TOOL];
        if (st.ok) listFor(liveTools()).forEach(t => tools.push(describe(t)));
        return { tools };
      }
      case 'tools/call': {
        if (!msg.params || typeof msg.params.name !== 'string') return { rpcError: { code: -32602, message: 'tools/call needs a tool name' } };
        return callTool(msg.params);
      }
      default:
        return { rpcError: { code: -32601, message: `Method not found: ${msg.method}` } };
    }
  }

  async function handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      write({ jsonrpc: '2.0', id: msg && typeof msg === 'object' && 'id' in msg ? msg.id : null, error: { code: -32600, message: 'Invalid request' } });
      return;
    }
    if (!('id' in msg)) {   // a notification: never answered
      if (msg.method === 'notifications/initialized') initialised = true;
      return;
    }
    try {
      const result = await dispatch(msg);
      if (result && result.rpcError) write({ jsonrpc: '2.0', id: msg.id, error: result.rpcError });
      else write({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      log('[newton-mcp] internal error:', e && e.stack ? e.stack : e);
      write({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'Internal error' } });
    }
  }

  return { handleLine, startLoad };
}

function main() {
  // stdout is the protocol: route every console method to stderr for the whole process.
  console.log = console.info = console.debug = stderrLine;
  if (typeof fetch !== 'function') {
    stderrLine('Newton for Claude needs Node 18 or later (built-in fetch).');
    process.exit(1);
  }
  process.on('unhandledRejection', e => stderrLine('[newton-mcp] unhandled rejection:', e && e.stack ? e.stack : e));
  process.on('uncaughtException', e => stderrLine('[newton-mcp] uncaught exception:', e && e.stack ? e.stack : e));

  const { createLoader } = require('./loader');
  const { createAuth } = require('./auth-node');
  let loader = null;
  const auth = createAuth({ getConfig: () => (loader ? loader.config() : null) });
  loader = createLoader({ authShim: auth.vmShim() });

  const write = obj => process.stdout.write(JSON.stringify(obj) + '\n');
  const server = createServer({ loader, auth, write });
  stderrLine(`[newton-mcp] server started, bundle ${BUNDLE_VERSION}, contract ${MCP_CONTRACT}, Node ${process.version}`);
  server.startLoad();   // public scripts: no sign-in needed to load them
  readLines(process.stdin, line => server.handleLine(line), () => {
    auth.shutdown();
    process.stdout.write('', () => process.exit(0));   // exit once queued replies have flushed
  });
}

// N-392 diff-2: newline-delimited messages from stdin, read the way the MCP SDK's stdio
// transport does ('data' events + own buffering), not with readline. Claude Desktop's
// built-in Node runs this server through its own launcher, and this only assumes stdin
// emits 'data' (Buffer or string) and 'end'/'close'.
function readLines(input, onLine, onEnd) {
  const decoder = new StringDecoder('utf8');
  let buf = '';
  let ended = false;
  input.on('data', chunk => {
    buf += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line.trim()) onLine(line);
    }
  });
  const end = () => {
    if (ended) return;
    ended = true;
    const rest = (buf + decoder.end()).trim();
    if (rest) onLine(rest);
    onEnd();
  };
  input.on('end', end);
  input.on('close', end);
  if (typeof input.resume === 'function') input.resume();
}

module.exports = { BUNDLE_VERSION, MCP_CONTRACT, DOWNLOAD_URL, MSG, INSTRUCTIONS, STATUS_TOOL, WRITE_ANNOTATIONS, DEFAULT_CONFIRM_TTL_MS,
  MAX_OPEN_TOKENS, COMMIT_HARD_MS, createServer, createTokenStore, createRwLock, toolEntryProblem, validateArgs, readLines, main };
