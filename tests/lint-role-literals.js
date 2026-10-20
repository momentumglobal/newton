// tests/lint-role-literals.js — N-352 guard: role ids are named, not typed.
//
// Page access reads CONFIG.ROLE_IDS (config.js). Before N-352 the same role
// strings were redeclared in four routers and hand-copied into
// CONFIG.COMMAND_BAR_PAGES, so a role rename was a hunt and the Command Bar
// could drift from the routers without anything failing.
//
// Violation: a quoted role id ('admin', "talent_partner" …) that
//   - appears anywhere in a router file (ROUTER_FILES), or
//   - sits inside a `roles: [ … ]` array within config.js's
//     COMMAND_BAR_PAGES block (its `module: 'admin'` / `key: 'leadership'`
//     strings are not roles and are not flagged).
// Comments are ignored. Pure function over data; the assertion skips when
// ALL_SOURCES is undefined (browser runner has no filesystem).

var ROUTER_FILES = ['router.js', 'mr-router.js', 'people-router.js', 'sales-router.js', 'cc-router.js'];

function _roleLintStrip(src) {
  // Replace comment text with spaces, keeping newlines so line numbers hold.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

function lintRoleLiterals(sources, roleValues) {
  const quoted = new RegExp('([\'"])(' + roleValues.join('|') + ')\\1', 'g');
  const out = [];
  const scan = (file, text, base) => {
    let m;
    quoted.lastIndex = 0;
    while ((m = quoted.exec(text))) {
      const line = base + text.slice(0, m.index).split('\n').length - 1;
      out.push({ file: file, line: line, text: m[0] });
    }
  };
  ROUTER_FILES.forEach(f => {
    if (sources[f] !== undefined) scan(f, _roleLintStrip(sources[f]), 1);
  });
  if (sources['config.js'] !== undefined) {
    const src = _roleLintStrip(sources['config.js']);
    const a = src.indexOf('COMMAND_BAR_PAGES: [');
    const b = src.indexOf('\n  ],', a);
    if (a >= 0 && b > a) {
      const before = src.slice(0, a).split('\n').length;
      const block = src.slice(a, b);
      const arr = /roles\s*:\s*\[[^\]]*\]/g;
      let r;
      while ((r = arr.exec(block))) {
        const line0 = before + block.slice(0, r.index).split('\n').length - 1;
        scan('config.js', r[0], line0);
      }
    }
  }
  return out;
}