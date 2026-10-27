// mcp/bootstrap/auth-node.js - Newton for Claude sign-in (N-392). Node only.
//
// Browser sign-in with authorisation code + PKCE and a loopback redirect
// (http://localhost:<port>) on the EXISTING Newton app registration, CONFIG.CLIENT_ID
// (N-378 MCP-D3; Entra side done in N-390). Scopes are exactly SCOPES below.
//
//   - Access token: memory only. Refreshed when under 5 minutes are left.
//   - Refresh token: on disk at %LOCALAPPDATA%\Newton\mcp-token.bin, encrypted with
//     Windows DPAPI (CurrentUser) through PowerShell. If DPAPI is unavailable it stays
//     in memory only (sign in each time Claude starts) - never written in clear.
//   - Deleting the file forces a fresh sign-in.
//   - The authorisation code, PKCE verifier, tokens and token-endpoint responses are
//     never written to stdout, stderr or any log. Errors log the AADSTS code only.
//   - Sign-in never blocks a tool call (A6): startSignIn() opens the browser and
//     returns; the server tells the user to ask again once signed in.
//
// createAuth() takes its side effects as parameters (protector, http, openBrowser,
// storePath) so tests/mcp-bootstrap-check.js can run it on Linux with fakes.
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const childProcess = require('child_process');

const SCOPES = 'User.Read Sites.Selected offline_access';
const AUTHORITY_PREFIX = 'https://login.microsoftonline.com/';
const ME_URL = 'https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,displayName';
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const POWERSHELL_TIMEOUT_MS = 20000;
const DPAPI_ENTROPY = 'newton-mcp-v1';

function stderrLine(...args) {
  process.stderr.write(util.format(...args) + '\n');
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pkceChallenge(verifier) {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}
function newVerifier() {
  return base64url(crypto.randomBytes(32));
}

function aadCode(text) {
  const m = /AADSTS(\d+)/.exec(String(text || ''));
  return m ? m[1] : null;
}

// What the user sees for a failed sign-in.
function signInErrorMessage(code, error) {
  switch (code) {
    case '50105':
      return "Your account isn't assigned to Newton in Entra. Ask your Newton admin to add you (Entra admin centre → Enterprise apps → Newton → Users and groups).";
    case '53000': case '53003': case '530003':
      return "Your organisation's sign-in policy blocked this device.";
    case '65001':
      return "Newton's permissions need admin consent. Ask your Newton admin.";
    default:
      if (!code && error === 'access_denied') return 'Sign-in was cancelled.';
      if (!code && error === 'invalid_grant') return 'Your Newton sign-in has expired. Sign in again.';
      return code ? `Sign-in failed (AADSTS${code}).` : `Sign-in failed (${error || 'unknown error'}).`;
  }
}

function defaultStorePath() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'Newton', 'mcp-token.bin');
}

// ── DPAPI through PowerShell ────────────────────────────────────────
// The secret travels on stdin, never in argv (another process can read a command line).
function _psScript(direction) {
  const head = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; " +
    `$t=[Console]::In.ReadToEnd(); $e=[Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}'); `;
  return direction === 'protect'
    ? head + "$b=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($t),$e,'CurrentUser'); [Console]::Out.Write([Convert]::ToBase64String($b))"
    : head + "$b=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($t.Trim()),$e,'CurrentUser'); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($b))";
}
function _runPowerShell(script, input) {
  return new Promise((resolve, reject) => {
    const child = childProcess.execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: POWERSHELL_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        // Never pass stderr/stdout on in the error: it could echo the input.
        if (err) return reject(Object.assign(new Error('DPAPI via PowerShell failed'), { code: 'DPAPI_UNAVAILABLE' }));
        resolve(String(stdout).trim());
      });
    child.stdin.on('error', () => { /* reported through the callback */ });
    child.stdin.end(input);
  });
}
const powershellProtector = {
  protect: plaintext => _runPowerShell(_psScript('protect'), plaintext),
  unprotect: blob => _runPowerShell(_psScript('unprotect'), blob),
};

// ── HTTP (token endpoint and /me) ───────────────────────────────────
async function _readJson(res) {
  try { return await res.json(); } catch (e) { return null; }
}
const defaultHttp = {
  async postForm(url, form) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(30000),
    });
    return { status: res.status, json: await _readJson(res) };
  },
  async getJson(url, token) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    return { status: res.status, json: await _readJson(res) };
  },
};

function defaultOpenBrowser(url) {
  // No shell: the & in the URL is passed through untouched.
  const [cmd, args] = process.platform === 'win32'
    ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = childProcess.spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => stderrLine('[newton-mcp] could not open the browser for sign-in'));
  child.unref();
}

function _html(text) {
  const safe = String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><meta charset="utf-8"><title>Newton for Claude</title>` +
    `<body style="font-family:sans-serif;max-width:36em;margin:4em auto;line-height:1.5"><p>${safe}</p></body>`;
}

// ── Auth ────────────────────────────────────────────────────────────
function createAuth({
  getConfig,
  protector = powershellProtector,
  http: httpClient = defaultHttp,
  openBrowser = defaultOpenBrowser,
  storePath = defaultStorePath(),
  log = stderrLine,
  now = Date.now,
} = {}) {
  let accessToken = null;
  let accessExpiresAt = 0;
  let refreshToken = null;
  let storeLoaded = false;
  let storeMode = 'not saved yet';
  let user = { email: null, name: null };
  let pending = null;        // { startedAt, done, close }
  let lastError = null;      // user-facing message, shown once by the server
  let refreshing = null;

  function settings() {
    const cfg = getConfig();
    if (!cfg) throw Object.assign(new Error('Newton has not loaded yet'), { code: 'CONFIG_MISSING' });
    const authority = String(cfg.AUTHORITY || '').replace(/\/+$/, '');
    if (!authority.startsWith(AUTHORITY_PREFIX) || !GUID_RE.test(String(cfg.CLIENT_ID || '')) || !GUID_RE.test(String(cfg.TENANT_ID || ''))) {
      throw Object.assign(new Error("Newton's sign-in settings are not valid"), { code: 'CONFIG_INVALID' });
    }
    return { authority, clientId: cfg.CLIENT_ID, tenantId: cfg.TENANT_ID };
  }

  async function loadStored() {
    if (!fs.existsSync(storePath)) return null;
    try {
      const s = settings();
      const data = JSON.parse(await protector.unprotect(fs.readFileSync(storePath, 'utf8')));
      if (!data || data.v !== 1 || data.clientId !== s.clientId || data.tenantId !== s.tenantId || !data.refreshToken) return null;
      storeMode = 'encrypted (Windows DPAPI)';
      return data.refreshToken;
    } catch (e) {
      log('[newton-mcp] saved sign-in could not be read; a fresh sign-in will be needed');
      return null;
    }
  }
  async function saveStored(token) {
    try {
      const s = settings();
      const blob = await protector.protect(JSON.stringify({ v: 1, clientId: s.clientId, tenantId: s.tenantId, refreshToken: token, savedAt: new Date(now()).toISOString() }));
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, blob, { mode: 0o600 });
      storeMode = 'encrypted (Windows DPAPI)';
    } catch (e) {
      storeMode = 'memory only (Windows DPAPI unavailable) - sign-in needed each time Claude starts';
      log('[newton-mcp] sign-in kept in memory only:', e && e.code ? e.code : 'store failed');
    }
  }
  function clearStored() {
    try { fs.unlinkSync(storePath); } catch (e) { /* already gone */ }
  }

  async function redeem(form) {
    const s = settings();
    const r = await httpClient.postForm(`${s.authority}/oauth2/v2.0/token`, { client_id: s.clientId, scope: SCOPES, ...form });
    const j = r && r.json;
    if (!r || r.status !== 200 || !j || !j.access_token) {
      const code = aadCode(j && j.error_description);
      const err = new Error(signInErrorMessage(code, j && j.error));
      err.code = (j && j.error) || 'token_error';
      log(`[newton-mcp] token request failed: ${err.code}${code ? ' AADSTS' + code : ''}`);
      throw err;
    }
    accessToken = j.access_token;
    accessExpiresAt = now() + (Number(j.expires_in) || 3600) * 1000;
    if (j.refresh_token) {
      refreshToken = j.refresh_token;
      await saveStored(refreshToken);
    }
    if (!user.email) await loadMe();
  }

  // A7: identity from Graph /me - the same lower-cased UPN MSAL's account.username gives the web app.
  async function loadMe() {
    const r = await httpClient.getJson(ME_URL, accessToken);
    if (r && r.status === 200 && r.json && r.json.userPrincipalName) {
      user = { email: String(r.json.userPrincipalName).toLowerCase(), name: r.json.displayName || null };
    } else {
      log(`[newton-mcp] /me lookup failed: HTTP ${r ? r.status : '?'}`);
    }
  }

  function forgetTokens() {
    accessToken = null; accessExpiresAt = 0; refreshToken = null;
    user = { email: null, name: null };
  }

  // A usable access token, or null when the user has to sign in. Throws only on
  // network / settings failures (the caller reports those).
  async function ensureToken() {
    if (accessToken && accessExpiresAt - now() > REFRESH_MARGIN_MS) return accessToken;
    if (!storeLoaded) {
      storeLoaded = true;
      refreshToken = await loadStored();
    }
    if (!refreshToken) return null;
    if (!refreshing) {
      refreshing = redeem({ grant_type: 'refresh_token', refresh_token: refreshToken })
        .finally(() => { refreshing = null; });
    }
    try {
      await refreshing;
      return accessToken;
    } catch (e) {
      if (e.code === 'invalid_grant' || e.code === 'interaction_required') {
        forgetTokens();
        clearStored();
        lastError = 'Your Newton sign-in has expired. Sign in again.';
        return null;
      }
      throw e;
    }
  }

  function listen(server, port, host) {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.removeListener('error', reject); resolve(server.address().port); });
    });
  }

  // Starts a browser sign-in and returns at once. One at a time.
  async function startSignIn() {
    if (pending) return { startedAt: pending.startedAt };
    const s = settings();
    const verifier = newVerifier();
    const state = base64url(crypto.randomBytes(16));
    const servers = [];
    let finish;
    const done = new Promise(resolve => { finish = resolve; });
    let timer = null;
    let closed = false;

    function close() {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      servers.forEach(srv => { try { srv.close(); } catch (e) { /* ignore */ } });
      pending = null;
      finish();
    }

    let redirectUri = null;
    const handler = (req, res) => {
      const u = new URL(req.url, 'http://localhost');
      // Connection: close on every reply, so no keep-alive socket holds the listener open.
      if (req.method !== 'GET' || u.pathname !== '/') { res.writeHead(404, { Connection: 'close' }); res.end(); return; }
      const p = u.searchParams;
      if (p.get('state') !== state) { res.writeHead(400, { 'Content-Type': 'text/plain', Connection: 'close' }); res.end('Ignored.'); return; }
      const reply = (ok, text) => {
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
        res.end(_html(text));
        close();
      };
      if (p.get('error') || !p.get('code')) {
        const code = aadCode(p.get('error_description'));
        lastError = signInErrorMessage(code, p.get('error'));
        log(`[newton-mcp] sign-in returned ${p.get('error') || 'no code'}${code ? ' AADSTS' + code : ''}`);
        reply(false, lastError);
        return;
      }
      redeem({ grant_type: 'authorization_code', code: p.get('code'), redirect_uri: redirectUri, code_verifier: verifier })
        .then(() => { lastError = null; reply(true, 'Signed in to Newton for Claude. You can close this tab and go back to Claude.'); })
        .catch(e => { lastError = e.message; reply(false, e.message); });
    };

    // Both loopback addresses, never all interfaces: the browser may resolve localhost to either.
    const v4 = http.createServer(handler);
    servers.push(v4);
    const port = await listen(v4, 0, '127.0.0.1');
    const v6 = http.createServer(handler);
    try { await listen(v6, port, '::1'); servers.push(v6); } catch (e) { /* IPv6 loopback unavailable: IPv4 is enough */ }
    redirectUri = `http://localhost:${port}`;

    const q = {
      client_id: s.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: SCOPES,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      prompt: 'select_account',
    };
    const url = `${s.authority}/oauth2/v2.0/authorize?` +
      Object.keys(q).map(k => `${k}=${encodeURIComponent(q[k])}`).join('&');

    timer = setTimeout(() => {
      lastError = "Sign-in wasn't finished within 5 minutes.";
      close();
    }, SIGN_IN_TIMEOUT_MS);
    if (timer.unref) timer.unref();

    pending = { startedAt: now(), done, close };
    lastError = null;
    openBrowser(url);
    return { startedAt: pending.startedAt };
  }

  function takeLastError() {
    const e = lastError;
    lastError = null;
    return e;
  }

  return {
    ensureToken,
    startSignIn,
    takeLastError,
    currentUser: () => ({ email: user.email, name: user.name }),
    status: () => ({
      signedIn: !!accessToken,
      email: user.email,
      storeMode,
      pendingSince: pending ? pending.startedAt : null,
    }),
    pendingDone: () => (pending ? pending.done : Promise.resolve()),
    shutdown: () => { if (pending) pending.close(); },
    // The auth.js replacement inside the vm context (N-378 MCP-D4).
    vmShim: () => ({
      getToken: async () => { try { return await ensureToken(); } catch (e) { return null; } },
      getCurrentUser: () => ({ email: user.email, name: user.name }),
      isSignedIn: () => !!accessToken,
      authReady: () => Promise.resolve(null),
    }),
  };
}

module.exports = {
  SCOPES,
  createAuth,
  pkceChallenge,
  signInErrorMessage,
  powershellProtector,
  defaultHttp,
  defaultOpenBrowser,
  defaultStorePath,
};
