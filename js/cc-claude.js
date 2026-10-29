// js/cc-claude.js - Command Centre "Newton for Claude" page (N-401).
// Shows the leadership install guide and a download button for the Newton for
// Claude bundle. The guide is NOT copied here: it is fetched from mcp/README.md
// on every visit and rendered by mdGuideToHtml() (utils.js), so the page and the
// file cannot drift. The .mcpb is built by .github/workflows/static.yml on each
// deploy and is not in the repo, so the button is a plain link. A same-origin
// static fetch, not a Graph call, so it lives here rather than in api.js.

const CC_CLAUDE_GUIDE_PATH = 'mcp/README.md';
const CC_CLAUDE_DOWNLOAD_PATH = 'mcp/newton-for-claude.mcpb';

async function renderCCClaudePage(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Newton for Claude</h2>
    </div>
    <div class="cc-guide-bar">
      <a class="btn-primary cc-guide-download" href="${CC_CLAUDE_DOWNLOAD_PATH}" download>Download Newton for Claude</a>
      <span class="cc-guide-note">Windows and Claude Desktop only. Leadership and Admin only. Questions: ask Chris.</span>
    </div>
    <div class="cc-guide" id="cc-guide" aria-live="polite"><div class="cc-loading">Loading...</div></div>`;
  await ccClaudeLoadGuide();
}

async function ccClaudeLoadGuide() {
  const el = document.getElementById('cc-guide');
  if (!el) return;
  try {
    const res = await fetch(CC_CLAUDE_GUIDE_PATH, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!el.isConnected) return;
    // The page header already carries the title, so the guide's own "# Newton for Claude" line is dropped.
    el.innerHTML = mdGuideToHtml(text.replace(/^\s*# [^\n]*\n/, ''));
  } catch (e) {
    console.warn('N-401: install guide load failed', e);
    if (!el.isConnected) return;
    el.innerHTML = `<p class="cc-guide-error">Couldn't load the install guide. Try again, or ask Chris.</p>
      <button type="button" class="btn-secondary"${act('ccClaudeRetry')}>Retry</button>`;
  }
}

function ccClaudeRetry() {
  const el = document.getElementById('cc-guide');
  if (el) el.innerHTML = '<div class="cc-loading">Loading...</div>';
  ccClaudeLoadGuide();
}

registerActions({
  ccClaudeRetry,
});