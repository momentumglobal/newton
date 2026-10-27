#!/usr/bin/env node
// mcp/bootstrap/server.js - Newton for Claude, local MCP server (N-392). Node only.
//
// Entry point of the Claude Desktop extension (mcp/manifest.json). Speaks MCP over
// stdio: newline-delimited JSON-RPC 2.0, one message per line. STDOUT CARRIES THE
// PROTOCOL ONLY - everything else (logs, Newton's own console output) goes to stderr,
// which Claude Desktop keeps in its MCP log.
//
// This file holds no Newton logic (N-378 MCP-D4). It:
//   - loads Newton's live code (loader.js) and checks the bundle <-> live contract
//   - signs the user in (auth-node.js) without ever blocking a call (A6)
//   - gates every tool to CONFIG.MCP.allowedRoles via the live getEffectiveRole (MCP-D5)
//   - answers newton_status itself (A2) and dispatches every other tool to the live
//     MCP_TOOLS registry in mcp/newton-tools.js, adding asOf + newtonBuild to each result
'use strict';
if (require.main === module) process.env.TZ = 'Europe/London';   // before any Date, as tests/run.js does

const util = require('util');

const BUNDLE_VERSION = '1.0.0';   // must equal mcp/manifest.json "version"
const MCP_CONTRACT = 1;           // must equal CONFIG.MCP.contract (js/config.js)
const DOWNLOAD_URL = 'https://momentumglobal.github.io/newton/mcp/newton-for-claude.mcpb';
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_PROTOCOL = '2025-06-18';
const LOAD_WAIT_MS = 20000;
const LOAD_RETRY_MS = 60000;
const TOOL_TIMEOUT_MS = 50000;
const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

const MSG = {
  update: `Newton for Claude needs updating. Download the latest version from ${DOWNLOAD_URL} and double-click it to reinstall, then restart Claude.`,
  signInStarted: 'A browser window has opened for Newton sign-in. Finish signing in, then ask again.',
  signInPending: t => `Finish signing in to Newton in the browser window opened at ${t}, then ask again.`,
  signInRetry: 'Ask again to retry sign-in.',
  gate: email => `Newton for Claude is available to Leadership and Admin only. You're signed in as ${email}.`,
  loadFailed: reason => `Couldn't load Newton (${reason}). Check your internet connection and try again.`,
  denied: "That Newton data isn't available to your account.",
  timeout: 'Newton took too long to answer. Try again, or ask for a smaller slice (one project, fewer weeks).',
};

const INSTRUCTIONS = 'Newton for Claude gives read-only answers from Momentum Global\'s Newton reporting system ' +
  '(projects, roles, pipeline, placements, people), computed by Newton\'s own code. Available to Leadership and Admin only. ' +
  'If unsure who is signed in or whether it is working, call newton_status first. Tool results never contain candidate names, ' +
  'salaries, budgets, rates or notes.';

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

function createServer({ loader, auth, write, log = stderrLine, now = Date.now, toolTimeoutMs = TOOL_TIMEOUT_MS, contract = MCP_CONTRACT }) {
  let loadPromise = null;
  let loadState = null;
  let lastLoadAt = 0;
  let initialised = false;
  let gate = null;   // { email, role, at }

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

  function liveTools() {
    const seen = new Set([STATUS_TOOL.name]);
    const out = [];
    let raw = [];
    try { raw = loader.liveTools(); } catch (e) { log('[newton-mcp] MCP_TOOLS unreadable:', e.message); }
    for (const t of raw) {
      if (!t || !TOOL_NAME_RE.test(t.name) || typeof t.handler !== 'function' || seen.has(t.name)) {
        log(`[newton-mcp] skipped tool entry ${t && t.name ? t.name : '(unnamed)'}`);
        continue;
      }
      seen.add(t.name);
      out.push(t);
    }
    return out;
  }

  function describe(t) {
    return {
      name: t.name,
      description: String(t.description || ''),
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
      annotations: READ_ONLY,
    };
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

  async function checkGate() {
    const email = auth.currentUser().email;
    if (!email) throw new Error('your Newton email could not be read from Microsoft');
    const ttl = (cfg().MCP && cfg().MCP.gateTtlMs) || 0;
    if (!gate || gate.email !== email || now() - gate.at >= ttl) {
      const role = await loader.call('getEffectiveRole', email);
      gate = { email, role, at: now() };
    }
    const allowed = ((cfg().MCP && cfg().MCP.allowedRoles) || []).includes(gate.role);
    return { email, role: gate.role, allowed };
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
    if (!g.allowed) return textResult(MSG.gate(g.email), true);

    if (!tool) return textResult(JSON.stringify(wrap(statusResult(g, st))));

    const bad = validateArgs(tool.inputSchema, args);
    if (bad) return textResult(bad, true);
    try {
      const result = await withTimeout(Promise.resolve().then(() => tool.handler(args)), toolTimeoutMs);
      return textResult(JSON.stringify(wrap(result)));
    } catch (e) {
      if (e && e.code === 'TOOL_TIMEOUT') return textResult(MSG.timeout, true);
      if (e && e.status === 403) return textResult(MSG.denied, true);
      if (e && e.status === 405) return textResult(e.message, true);
      log(`[newton-mcp] tool ${tool.name} failed:`, e && e.stack ? e.stack : e);
      return textResult(`Newton couldn't answer: ${e && e.message ? e.message : e}`, true);
    }
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
        if (st.ok) liveTools().forEach(t => tools.push(describe(t)));
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
  server.startLoad();   // public scripts: no sign-in needed to load them

  const rl = require('readline').createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', line => { if (line.trim()) server.handleLine(line); });
  rl.on('close', () => { auth.shutdown(); process.exit(0); });
}

if (require.main === module) main();

module.exports = { BUNDLE_VERSION, MCP_CONTRACT, DOWNLOAD_URL, MSG, STATUS_TOOL, createServer, validateArgs };
