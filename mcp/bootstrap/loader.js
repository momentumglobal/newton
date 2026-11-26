// mcp/bootstrap/loader.js - Newton for Claude (N-392). Node only: no Newton page loads this file.
//
// Fetches Newton's own scripts from the live site and runs them in ONE vm context, in
// production order, so every tool answers with the live calc layer (N-378 MCP-D4).
// js/config.js is fetched first; the rest of the list comes from CONFIG.MCP.scripts.
//
// The context gets a fixed set of globals and nothing else from Node (no process,
// require, window, document):
//   console        every method writes to STDERR - stdout carries the MCP protocol only
//   timers, URL, URLSearchParams, TextEncoder/Decoder, structuredClone,
//   AbortController, crypto (webcrypto)
//   sessionStorage / localStorage   in-memory Storage look-alikes, empty every process
//   fetch          the Graph shim below: GET, or a $batch of GETs, to the allowlisted
//                  lists only (MCP-D7/D8); POST / PATCH only while the server has armed it
//                  for a confirmed commit, and only to WRITE_LIST_CEILING ∩
//                  CONFIG.MCP.writeLists with allow-listed fields (N-546, AMCP-A5)
//   fetchGuide     GET of one of the pinned GUIDE_FILES from SCRIPT_BASE (N-546, AMCP-A11)
//   getToken, getCurrentUser, isSignedIn, authReady   from auth-node.js (replaces auth.js)
//
// vm is not a sandbox: this is the same trust as a browser running the same files from
// the same origin. Scripts are only ever fetched from SCRIPT_BASE, never from a tool argument.
// The write gate (armWrites / disarmWrites) lives on the loader object, never in the context,
// so live code cannot arm its own writes.
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');
const nodeCrypto = require('crypto');

// A1: pinned here, not in CONFIG - config.js has to be fetched before CONFIG exists.
const SCRIPT_BASE = 'https://momentumglobal.github.io/newton/';
const CONFIG_SCRIPT = 'js/config.js';
const SCRIPT_TIMEOUT_MS = 15000;
const SCRIPT_PATH_RE = /^(js|mcp)\/[A-Za-z0-9_.-]+\.js$/;
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
// /sites/<site>/lists/<list>/items, then optionally /delta or /<item id>.
const LIST_ITEMS_RE = /^(\/sites\/[^/]+\/lists\/[^/]+\/items)(\/delta|\/[^/]+)?$/;
// N-546 (AMCP-A5): the most the bundle will ever write to. Pinned here so a bad push to
// js/config.js can't open other lists (UserAssignments, People, LeadershipAccess ...): a
// write needs its list in BOTH this ceiling and CONFIG.MCP.writeLists. Adding a list here
// needs a new bundle.
const WRITE_LIST_CEILING = ['WeeklyActivity', 'Roles', 'RoleHistory', 'Notifications', 'SavedReports'];
// /sites/<site>/lists/<list>/items (POST) or /items/<digits> (PATCH), nothing after.
const WRITE_ITEMS_RE = /^\/sites\/([^/]+)\/lists\/([^/]+)\/items(?:\/(\d+))?$/;
// N-546 (AMCP-A11): the only files fetchGuide() will fetch. Never taken from a tool argument
// unchecked: a name must match one of these exactly.
const GUIDE_FILES = ['user-guide.html', 'people-user-guide.html', 'sales-user-guide.html',
  'market-reporting-user-guide.html', 'my-momentum-user-guide.html', 'README.md'];
const GUIDE_MAX_BYTES = 2 * 1024 * 1024;

function stderrLine(...args) {
  process.stderr.write(util.format(...args) + '\n');
}

// ── Storage look-alike ──────────────────────────────────────────────
// Must behave like the browser's Storage, including enumeration: graph-client.js
// sweeps its cache with Object.keys(sessionStorage). Stored keys are own enumerable
// properties; the methods live on the prototype, so they never show up as keys.
class StorageShim {
  getItem(key) {
    const k = String(key);
    return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null;
  }
  setItem(key, value) { this[String(key)] = String(value); }
  removeItem(key) { delete this[String(key)]; }
  clear() { Object.keys(this).forEach(k => { delete this[k]; }); }
  key(i) {
    const keys = Object.keys(this);
    return i >= 0 && i < keys.length ? keys[i] : null;
  }
  get length() { return Object.keys(this).length; }
}

function createStorage() {
  return new StorageShim();
}

function createConsole(log) {
  const out = (...args) => log(...args);
  return { log: out, info: out, warn: out, error: out, debug: out, trace: out };
}

// ── Graph fetch shim (MCP-D7 / MCP-D8, write path N-546 / AMCP-A5) ──
// GET: only /sites/<SP_SITE_ID>/lists/<allowed list>/items[/delta|/<id>].
// POST /$batch: only when every sub-request is such a GET (armed or not).
// Write path, only while writeGate.armed (set by the server for a confirmed commit):
//   POST  /sites/<SP_SITE_ID>/lists/<name>/items           -> writeLists[name].create
//   PATCH /sites/<SP_SITE_ID>/lists/<name>/items/<digits>  -> writeLists[name].update
//   <name> in WRITE_LIST_CEILING and CONFIG.MCP.writeLists, by NAME (never a learned
//   GUID prefix), no query string, body exactly { fields: {...} } with allow-listed keys.
// Everything else - PUT/DELETE, other POSTs, /me, /drive, other lists, other hosts,
// any write while unarmed - throws status 405 before any network call.
// Graph's @odata.nextLink / @odata.deltaLink may address a list by GUID (A8): the
// prefix of every such link returned for an allowed list is learned and allowed (reads only).
function createGraphFetchShim({ getConfig, realFetch, log = stderrLine, writeGate = { armed: false } }) {
  const learned = new Map();   // decoded '/sites/../lists/../items' prefix -> list name

  function decode(p) {
    try { return decodeURIComponent(p); } catch (e) { return p; }
  }
  function namedPrefixes() {
    const cfg = getConfig();
    const map = new Map();
    const lists = (cfg && cfg.MCP && Array.isArray(cfg.MCP.allowedLists)) ? cfg.MCP.allowedLists : [];
    lists.forEach(name => map.set(decode(`/sites/${cfg.SP_SITE_ID}/lists/${name}/items`), name));
    return map;
  }
  // Graph path relative to /v1.0, or null when the URL is not Graph v1.0.
  function relativePath(url) {
    const u = String(url || '');
    if (u.startsWith(GRAPH_BASE + '/')) return u.slice(GRAPH_BASE.length);
    if (/^[a-z]+:/i.test(u)) return null;
    return u.startsWith('/') ? u : '/' + u;   // $batch sub-request urls are relative
  }
  function classify(rel) {
    if (rel === null) return { ok: false, label: 'non-Graph address' };
    const m = LIST_ITEMS_RE.exec(decode(rel.split('?')[0]));
    if (!m) return { ok: false, label: 'non-list path' };
    const list = namedPrefixes().get(m[1]) || learned.get(m[1]);
    if (!list) return { ok: false, label: 'list ' + m[1].split('/')[4] };
    return { ok: true, list };
  }
  function learn(body, list) {
    if (!body || !list) return;
    ['@odata.nextLink', '@odata.deltaLink'].forEach(k => {
      if (typeof body[k] !== 'string') return;
      const rel = relativePath(body[k]);
      if (rel === null) return;
      const m = LIST_ITEMS_RE.exec(decode(rel.split('?')[0]));
      if (m) learned.set(m[1], list);
    });
  }
  async function learnFrom(res, fn) {
    try {
      if (!res || !res.ok) return;
      const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
      if (!/json/i.test(type)) return;
      fn(await res.clone().json());
    } catch (e) { /* learning is best-effort; an unlearned link is simply refused later */ }
  }
  function block(method, label) {
    log(`[newton-mcp] blocked ${method} (${label})`);
    const err = new Error(`Newton for Claude can't make that request (blocked ${method} ${label})`);
    err.status = 405;
    throw err;
  }
  // N-546: the write path. Returns nothing when the request may go out; otherwise blocks.
  // Labels never carry field values.
  function checkWrite(method, rel, opts) {
    if (writeGate.armed !== true) block(method, 'write (not armed)');
    if (method !== 'POST' && method !== 'PATCH') block(method, 'write method');
    if (rel.includes('?')) block(method, 'write path');
    const m = WRITE_ITEMS_RE.exec(decode(rel));
    const cfg = getConfig();
    if (!m || !cfg || m[1] !== String(cfg.SP_SITE_ID)) block(method, 'write path');
    if ((method === 'POST') !== (m[3] === undefined)) block(method, 'write path');
    const list = m[2];
    const lists = (cfg.MCP && cfg.MCP.writeLists) || {};
    const spec = Object.prototype.hasOwnProperty.call(lists, list) ? lists[list] : null;
    const allowed = spec && spec[method === 'POST' ? 'create' : 'update'];
    if (!WRITE_LIST_CEILING.includes(list) || !Array.isArray(allowed)) block(method, 'write list ' + list);
    let body = null;
    try { body = JSON.parse(opts.body); } catch (e) { block(method, 'write body'); }
    const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(body) || Object.keys(body).length !== 1 || !isObj(body.fields)) block(method, 'write body');
    Object.keys(body.fields).forEach(f => {
      if (!allowed.includes(f)) block(method, `write field ${f} on ${list}`);
    });
  }

  return async function shimFetch(input, init) {
    const opts = init || {};
    const url = String(input && typeof input === 'object' && input.url ? input.url : input);
    const method = String(opts.method || 'GET').toUpperCase();
    if (!url.startsWith(GRAPH_BASE + '/')) block(method, 'non-Graph address');
    const rel = url.slice(GRAPH_BASE.length);

    if (method === 'GET') {
      const c = classify(rel);
      if (!c.ok) block(method, c.label);
      const res = await realFetch(url, opts);
      await learnFrom(res, body => learn(body, c.list));
      return res;
    }

    if (method === 'POST' && rel.split('?')[0] === '/$batch') {
      let body = null;
      try { body = JSON.parse(opts.body); } catch (e) { block(method, '$batch with an unreadable body'); }
      const reqs = body && body.requests;
      if (!Array.isArray(reqs) || reqs.length === 0) block(method, '$batch with no requests');
      const listById = new Map();
      reqs.forEach(r => {
        const m = String((r && r.method) || '').toUpperCase();
        if (m !== 'GET') block(m || '?', 'inside $batch');
        const c = classify(relativePath(r.url));
        if (!c.ok) block('GET', c.label + ' inside $batch');
        listById.set(String(r.id), c.list);
      });
      const res = await realFetch(url, opts);
      await learnFrom(res, data => {
        (data.responses || []).forEach(r => learn(r && r.body, listById.get(String(r && r.id))));
      });
      return res;
    }

    if (rel.split('?')[0] === '/$batch') block(method, '$batch');
    checkWrite(method, rel, opts);
    return realFetch(url, opts);
  };
}

// ── Guide fetch (N-546, AMCP-A11) ───────────────────────────────────
// fetchGuide(name): GET SCRIPT_BASE + name for a name in GUIDE_FILES only; resolves the text.
// readText(rel) is the loader's script reader (live site, or localDir in tests).
function createGuideFetch({ readText }) {
  return async function fetchGuide(name) {
    if (typeof name !== 'string' || !GUIDE_FILES.includes(name)) throw new Error('not a Newton guide');
    const text = await readText(name);
    if (Buffer.byteLength(text, 'utf8') > GUIDE_MAX_BYTES) throw new Error(`${name} is larger than ${GUIDE_MAX_BYTES} bytes`);
    return text;
  };
}

// ── Loader ──────────────────────────────────────────────────────────
// opts.localDir: TESTS ONLY - read the same relative paths from a repo checkout
// instead of the live site. Production never sets it (server.js does not pass it).
function createLoader({ authShim, localDir = null, scriptFetch = null, graphFetch = null, log = stderrLine, now = Date.now } = {}) {
  let ctx = null;
  let state = { ok: false, reason: 'not loaded yet', loadedAt: null };
  const writeGate = { armed: false };   // N-546: never placed in the context

  async function readScript(rel) {
    if (localDir) return fs.readFileSync(path.join(localDir, rel), 'utf8');
    const doFetch = scriptFetch || fetch;
    const url = `${SCRIPT_BASE}${rel}?v=${now()}`;
    const res = await doFetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(SCRIPT_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  function buildContext() {
    const sandbox = {
      console: createConsole(log),
      setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
      URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone, AbortController,
      crypto: nodeCrypto.webcrypto,
      sessionStorage: createStorage(),
      localStorage: createStorage(),
      getToken: authShim.getToken,
      getCurrentUser: authShim.getCurrentUser,
      isSignedIn: authShim.isSignedIn,
      authReady: authShim.authReady,
    };
    sandbox.fetch = createGraphFetchShim({
      getConfig: () => config(),
      realFetch: graphFetch || ((u, o) => fetch(u, o)),
      log,
      writeGate,
    });
    sandbox.fetchGuide = createGuideFetch({ readText: readScript });
    return vm.createContext(sandbox);
  }

  function run(code, rel) {
    vm.runInContext(code, ctx, { filename: rel });
  }

  // Never throws. Resolves { ok, reason, contractMismatch, liveContract, loadedAt }.
  async function load({ contract } = {}) {
    writeGate.armed = false;
    ctx = buildContext();
    let current = CONFIG_SCRIPT;
    try {
      run(await readScript(CONFIG_SCRIPT), CONFIG_SCRIPT);
      const cfg = config();
      const live = cfg && cfg.MCP ? cfg.MCP.contract : undefined;
      if (live !== contract) {
        state = { ok: false, contractMismatch: true, liveContract: live, reason: `contract ${live} (bundle ${contract})`, loadedAt: null };
        return state;
      }
      const scripts = Array.isArray(cfg.MCP.scripts) ? cfg.MCP.scripts : [];
      for (const rel of scripts) {
        current = rel;
        if (!SCRIPT_PATH_RE.test(rel)) throw new Error('not a Newton script path');
        run(await readScript(rel), rel);
      }
      state = { ok: true, liveContract: live, reason: null, loadedAt: new Date(now()).toISOString() };
    } catch (e) {
      state = { ok: false, reason: `${current}: ${e && e.message ? e.message : e}`, loadedAt: null };
    }
    return state;
  }

  function evalInContext(expr) {
    if (!ctx) throw new Error('Newton is not loaded');
    return vm.runInContext(expr, ctx);
  }
  // Top-level const (CONFIG, GRAPH) is not a property of the sandbox object - read it in-context.
  function config() {
    if (!ctx) return null;
    try { return vm.runInContext('typeof CONFIG === "undefined" ? null : CONFIG', ctx); } catch (e) { return null; }
  }
  function call(fnName, ...args) {
    if (!/^[A-Za-z_$][\w$]*$/.test(fnName)) throw new Error('bad function name');
    const fn = evalInContext(`typeof ${fnName} === "function" ? ${fnName} : null`);
    if (!fn) throw new Error(`${fnName} is not defined in the loaded Newton code`);
    return fn(...args);
  }
  function liveTools() {
    if (!state.ok) return [];
    const tools = evalInContext('typeof MCP_TOOLS !== "undefined" && Array.isArray(MCP_TOOLS) ? MCP_TOOLS : []');
    return Array.from(tools);
  }

  // N-546: only server-core.js arms writes, immediately around a confirmed commit.
  function armWrites() { writeGate.armed = true; }
  function disarmWrites() { writeGate.armed = false; }
  function writesArmed() { return writeGate.armed === true; }

  return { load, config, call, evalInContext, liveTools, armWrites, disarmWrites, writesArmed, state: () => state };
}

module.exports = { SCRIPT_BASE, GRAPH_BASE, WRITE_LIST_CEILING, GUIDE_FILES, GUIDE_MAX_BYTES, createLoader, createStorage, createGraphFetchShim, createGuideFetch };
