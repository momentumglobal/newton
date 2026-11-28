// js/claude-router.js
// N-551 (AMCP-7): the Newton for Claude install page (newton-for-claude.html). One page, reached by every role that
// can use the tools (the same four as CONFIG.MCP.allowedRoles). The page key is claudeInstall, not claudeMcp, so it
// never collides with the Command Centre page of the same name (N-401); both render renderCCClaudePage (cc-claude.js).
const CLAUDE_PAGES = [
  { key: 'claudeInstall', label: 'Newton for Claude', roles: [CONFIG.ROLE_IDS.ADMIN, CONFIG.ROLE_IDS.LEADERSHIP, CONFIG.ROLE_IDS.DELIVERY_MANAGER, CONFIG.ROLE_IDS.TALENT_PARTNER] },
];

function claudeCanAccess(role) {
  return CLAUDE_PAGES.some(p => p.roles.includes(role));
}

function claudeGetAccessiblePages(role) {
  return CLAUDE_PAGES.filter(p => p.roles.includes(role));
}
