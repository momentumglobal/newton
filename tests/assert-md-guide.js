// tests/assert-md-guide.js - mdGuideToHtml (N-401): the Markdown subset renderer behind the
// Command Centre "Newton for Claude" page. Pure function, so the checks are synchronous.
// Loads after tests/assertions.js and pushes into ASSERTIONS.

ASSERTIONS.push(
  {
    name: 'N-401 mdGuideToHtml: hostile input is escaped, never emitted as a tag or attribute',
    fn: function () {
      const out = mdGuideToHtml('# <script>alert(1)</script>\n\n<img src=x onerror=alert(1)> **<b>x</b>** `<i>`\n\n- <a href="x">y</a>\n\n| <u> | b |\n|---|---|\n| "q" | <s> |');
      ['<script', '<img', '<b>', '<i>', '<a href="x"', '<u>', '<s>', 'onerror=alert(1)>'].forEach(t => {
        if (out.indexOf(t) >= 0) throw new Error('unescaped markup in output: ' + t + '\n' + out);
      });
      if (out.indexOf('&lt;script&gt;') < 0 || out.indexOf('&lt;img') < 0) throw new Error('escaped text missing: ' + out);
    },
  },
  {
    name: 'N-401 mdGuideToHtml: only https:// is linked; trailing punctuation is left outside the link; javascript:, data: and http: are plain text',
    fn: function () {
      const out = mdGuideToHtml('See https://example.com/a.mcpb, then https://example.com/b. Not javascript:alert(1) or data:text/html,x or http://example.com/c');
      _assertEqual((out.match(/<a /g) || []).length, 2, 'two links');
      if (out.indexOf('<a href="https://example.com/a.mcpb" target="_blank" rel="noopener noreferrer">https://example.com/a.mcpb</a>,') < 0) throw new Error('link 1 / trailing comma: ' + out);
      if (out.indexOf('<a href="https://example.com/b" target="_blank" rel="noopener noreferrer">https://example.com/b</a>.') < 0) throw new Error('link 2 / trailing full stop: ' + out);
      if (/href="(javascript|data|http):/.test(out)) throw new Error('unsafe scheme linked: ' + out);
    },
  },
  {
    name: 'N-401 mdGuideToHtml: code spans keep backslashes, % and <id> as visible text; bold and unclosed markers behave',
    fn: function () {
      const out = mdGuideToHtml('Use `%LOCALAPPDATA%\\Packages\\Claude_<id>\\x.bin` and **bold** but **open and `tick');
      if (out.indexOf('<code>%LOCALAPPDATA%\\Packages\\Claude_&lt;id&gt;\\x.bin</code>') < 0) throw new Error('code span: ' + out);
      if (out.indexOf('<strong>bold</strong>') < 0) throw new Error('bold: ' + out);
      if (out.indexOf('**open and `tick') < 0) throw new Error('unclosed markers must stay as text: ' + out);
    },
  },
  {
    name: 'N-401 mdGuideToHtml: unsupported syntax is shown as escaped plain text, never partial markup',
    fn: function () {
      const out = mdGuideToHtml('> quote\n\n![img](x)\n\n[t](u)\n\n__x__\n\n#### four');
      ['<blockquote', '<img', '<a ', '<em', '<h4'].forEach(t => { if (out.indexOf(t) >= 0) throw new Error('unexpected ' + t + ': ' + out); });
      ['&gt; quote', '![img](x)', '[t](u)', '__x__', '#### four'].forEach(t => { if (out.indexOf(t) < 0) throw new Error('text lost: ' + t + ': ' + out); });
    },
  },
  {
    name: 'N-401 mdGuideToHtml: empty input gives an empty string; headings, nested lists and tables have the expected shape',
    fn: function () {
      _assertEqual([mdGuideToHtml(''), mdGuideToHtml(null), mdGuideToHtml(undefined)], ['', '', ''], 'empty');
      const out = mdGuideToHtml('## Sign in again\n\n1. One\n2. Two\n   - nested a\n   - nested b\n3. Three\n\nPara line one\nline two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n');
      if (out.indexOf('<h2 id="sign-in-again">Sign in again</h2>') < 0) throw new Error('h2: ' + out);
      if (out.indexOf('<ol><li>One</li><li>Two<ul><li>nested a</li><li>nested b</li></ul></li><li>Three</li></ol>') < 0) throw new Error('nested list: ' + out);
      if (out.indexOf('<p>Para line one line two</p>') < 0) throw new Error('paragraph join: ' + out);
      _assertEqual((out.match(/<tr>/g) || []).length, 3, 'table rows (header + 2)');
      if (out.indexOf('<th>A</th><th>B</th>') < 0 || out.indexOf('<td>3</td><td>4</td>') < 0) throw new Error('table cells: ' + out);
    },
  },
  {
    name: 'N-401 Command Centre: second page registered for Admin + Leadership only, wired through router, navigation, deep link, script tag and Command Bar',
    fn: function () {
      if (typeof ALL_SOURCES === 'undefined' || typeof ALL_HTML === 'undefined') {
        _skip('Source files need filesystem access - runs under node tests/run.js, not in the browser runner.');
      }
      const pages = new Function('CONFIG', ALL_SOURCES['cc-router.js'] + '\nreturn CC_PAGES;')(CONFIG);
      _assertEqual(pages.map(p => p.key), ['overview', 'claudeMcp'], 'CC_PAGES keys');
      pages.forEach(p => _assertEqual(p.roles.slice().sort(), ['admin', 'leadership'], p.key + ' roles'));
      const bar = CONFIG.COMMAND_BAR_PAGES.find(p => p.key === 'claudeMcp');
      if (!bar || bar.module !== 'command' || bar.href !== 'command-centre.html#claudeMcp') throw new Error('Command Bar entry missing or wrong');
      if (ALL_SOURCES['cc-nav.js'].indexOf('renderCCClaudePage') < 0) throw new Error('navigateToCC does not render the page');
      if (ALL_SOURCES['cc-app.js'].indexOf('handleCCDeepLink') < 0) throw new Error('cc-app.js lacks the deep-link handler');
      const html = ALL_HTML['command-centre.html'];
      const at = n => html.indexOf('js/' + n + '.js');
      if (!(at('utils') > 0 && at('utils') < at('cc-claude') && at('cc-pages') < at('cc-claude') && at('cc-claude') < at('cc-app'))) throw new Error('script order: utils < cc-pages < cc-claude < cc-app');
      const src = ALL_SOURCES['cc-claude.js'];
      if (src.indexOf("'mcp/README.md'") < 0 || src.indexOf("'mcp/newton-for-claude.mcpb'") < 0) throw new Error('cc-claude.js must fetch mcp/README.md and link the .mcpb');
      if (/Before you start/.test(src)) throw new Error('guide text must not be copied into cc-claude.js');
    },
  },
);