#!/usr/bin/env node
// tests/run.js — Node CLI test runner. No dependencies (uses Node's built-in
// `vm` module) — nothing to `npm install` in CI.
//
// N-096: force the timezone to Europe/London before anything else runs.
// The coeWeekIndex GMT/BST Gantt regression (N-081 class) only reproduces
// under a DST-observing timezone — GitHub Actions' Node defaults to UTC,
// where there's no skew to catch a regression against. Must be the very
// first statement, before any Date is constructed anywhere in this
// process (including inside the files loaded below).
process.env.TZ = process.env.NEWTON_TZ || 'Europe/London';
//
// N-130: the default is still forced, so CI and a bare `node tests/run.js` are
// unchanged. NEWTON_TZ overrides it so a timezone-dependence bug can actually
// be exercised — `NEWTON_TZ=America/New_York node tests/run.js`. A plain TZ=...
// prefix would NOT work: the line above overwrites it, so such a run would
// report a pass that proves nothing. Any assertion claiming timezone
// independence must be checked this way.
//
// utils.js / ui-kit.js / richtext.js / headcount.js / permissions.js / checklist-logic.js / graph-client.js / api.js / api-headcount.js /
// analytics.js / lci-config.js / lci-model.js / coe-plan.js declare
// plain global functions (<script>-tag style, not CommonJS modules), so
// they're loaded as scripts into one shared vm context in production
// script order rather than `require()`d. Same approach as the Node-VM rig
// built for N-030's Excel export testing. graph-client.js, api.js (N-097) and
// api-headcount.js are entirely network-calling functions except a few pure
// helpers (_pickFields in api.js; N-176's _ssKey / _ssIsCacheKey / _ssKeyBuild /
// _ssKeyMatchesList in graph-client.js). N-176 also added the ONE thing
// graph-client.js (api.js until N-347) executes at load time: the
// _ssPurgeStaleBuilds() cache sweep, which returns immediately when
// sessionStorage is undefined — as it is here. Loading the whole file
// still touches no network.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const TESTS_DIR = __dirname;
const JS_DIR = path.join(TESTS_DIR, '..', 'js');

// Production script order (index.html / reporting.html): config.js before
// actions.js (N-301) before utils.js before ui-kit.js before richtext.js before headcount.js before permissions.js before
// checklist-logic.js before graph-client.js before api.js before api-headcount.js before analytics.js before lci-config.js before lci-model.js
// before coe-plan.js. Fixtures load next, then assertions.js (ASSERTIONS + shared helpers), then the 12
// assert-<domain>.js files (N-353), which push their entries into ASSERTIONS. Assertions load last. (In production api-headcount.js loads straight after
// diagnostics.js, which this runner does not load.)
// (checklist-logic.js loads only on reporting.html in production, before api-checklists.js; both new files are
// declarations only, so loading it here ahead of api.js is harmless.)
const SOURCE_FILES = [
  path.join(JS_DIR, 'config.js'),
  path.join(JS_DIR, 'actions.js'),
  path.join(JS_DIR, 'utils.js'),
  path.join(JS_DIR, 'ui-kit.js'),
  path.join(JS_DIR, 'richtext.js'),
  path.join(JS_DIR, 'headcount.js'),
  path.join(JS_DIR, 'permissions.js'),
  path.join(JS_DIR, 'project-team.js'),
  path.join(JS_DIR, 'checklist-logic.js'),
  path.join(JS_DIR, 'starter-folder-logic.js'),
  path.join(JS_DIR, 'graph-client.js'),
  path.join(JS_DIR, 'api.js'),
  path.join(JS_DIR, 'api-headcount.js'),
  path.join(JS_DIR, 'api-admin.js'),   // N-381: declarations only; createSlaDefaultRows is asserted
  path.join(JS_DIR, 'list-controls.js'),
  path.join(JS_DIR, 'pages-model.js'),
  path.join(JS_DIR, 'analytics.js'),
  path.join(JS_DIR, 'market-report.js'),
  path.join(JS_DIR, 'lci-config.js'),
  path.join(JS_DIR, 'lci-model.js'),
  path.join(JS_DIR, 'coe-plan.js'),
  path.join(TESTS_DIR, 'lint-dates.js'),
  path.join(TESTS_DIR, 'lint-role-copy-fields.js'),
  path.join(TESTS_DIR, 'lint-alias-consumers.js'),
  path.join(TESTS_DIR, 'lint-escaping.js'),
  path.join(TESTS_DIR, 'lint-vendor.js'),
  path.join(TESTS_DIR, 'lint-icons.js'),
  path.join(TESTS_DIR, 'lint-css-split.js'),
  path.join(TESTS_DIR, 'lint-readme-files.js'),
  path.join(TESTS_DIR, 'lint-csp.js'),
  path.join(TESTS_DIR, 'lint-stage-arrays.js'),
  path.join(TESTS_DIR, 'lint-role-literals.js'),
  path.join(TESTS_DIR, 'lint-headcount-writes.js'),
  path.join(TESTS_DIR, 'lint-weeklyactivity-writes.js'),
  path.join(TESTS_DIR, 'lint-inline-handlers.js'),
  path.join(TESTS_DIR, 'lint-inline-styles.js'),
  path.join(TESTS_DIR, 'lint-internal-kpi.js'),
  path.join(TESTS_DIR, 'lint-project-types.js'),
  path.join(TESTS_DIR, 'fixtures.js'),
  path.join(TESTS_DIR, 'assertions.js'),
  path.join(TESTS_DIR, 'assert-dates.js'),
  path.join(TESTS_DIR, 'assert-revenue.js'),
  path.join(TESTS_DIR, 'assert-lci.js'),
  path.join(TESTS_DIR, 'assert-api-cache.js'),
  path.join(TESTS_DIR, 'assert-security.js'),
  path.join(TESTS_DIR, 'assert-actions-lints.js'),
  path.join(TESTS_DIR, 'assert-analytics.js'),
  path.join(TESTS_DIR, 'assert-headcount.js'),
  path.join(TESTS_DIR, 'assert-checklists.js'),
  path.join(TESTS_DIR, 'assert-roles-people.js'),
  path.join(TESTS_DIR, 'assert-list-ui.js'),
  path.join(TESTS_DIR, 'assert-pages.js'),
  path.join(TESTS_DIR, 'assert-project-team.js'),
  path.join(TESTS_DIR, 'assert-project-types.js'),
  path.join(TESTS_DIR, 'assert-starter-folders.js'),
  path.join(TESTS_DIR, 'assert-sla.js'),
];
// N-259: starter-folder-logic.js (pure) loads straight after checklist-logic.js, which it calls.
// N-361: project-team.js (pure) loads straight after permissions.js; assert-project-team.js is the last assertion file.
const sandbox = {};

// N-091: the F-12 date guard lints SOURCE TEXT, not runtime behaviour, so it
// needs every js/ file as a string — not just the six loaded above for their
// functions. Read them here (fs is unavailable inside the vm) and expose the
// map as ALL_SOURCES; lint-dates.js is a pure function over it. The guard
// assertion skips when ALL_SOURCES is undefined, which is how tests/index.html
// (no filesystem) stays honest rather than reporting a meaningless PASS.
sandbox.ALL_SOURCES = fs.readdirSync(JS_DIR)
  .filter(f => f.endsWith('.js'))
  .sort()
  .reduce((acc, f) => {
    acc[f] = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
    return acc;
  }, {});

// N-289 (SEC-9): lint-vendor.js guards "no third-party script from a CDN" and
// "every js/vendor/ file matches its VERSIONS.md row". Like ALL_SOURCES these
// are read here because fs is unavailable inside the vm. If js/vendor/ is
// missing, VENDOR_FILES is {} and the lint FAILS ("contains no .js files") —
// it must never pass vacuously.
const ROOT_DIR = path.join(TESTS_DIR, '..');
const VENDOR_DIR = path.join(JS_DIR, 'vendor');
const _readIfExists = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
sandbox.ALL_HTML = fs.readdirSync(ROOT_DIR)
  .filter(f => f.endsWith('.html'))
  .sort()
  .reduce((acc, f) => {
    acc[f] = fs.readFileSync(path.join(ROOT_DIR, f), 'utf8');
    return acc;
  }, {});
// N-324: page CSS moved out of <style> blocks into css/ files, so assertions that
// check a page's own rules (and that every linked stylesheet exists) read them here.
const CSS_DIR = path.join(ROOT_DIR, 'css');
sandbox.ALL_CSS = (fs.existsSync(CSS_DIR) ? fs.readdirSync(CSS_DIR) : [])
  .filter(f => f.endsWith('.css'))
  .sort()
  .reduce((acc, f) => {
    acc[f] = fs.readFileSync(path.join(CSS_DIR, f), 'utf8');
    return acc;
  }, {});
sandbox.VENDOR_FILES = (fs.existsSync(VENDOR_DIR) ? fs.readdirSync(VENDOR_DIR) : [])
  .filter(f => f.endsWith('.js'))
  .sort()
  .reduce((acc, f) => {
    acc[f] = 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(VENDOR_DIR, f))).digest('base64');
    return acc;
  }, {});
sandbox.VENDOR_MANIFEST = _readIfExists(path.join(VENDOR_DIR, 'VERSIONS.md'));
sandbox.VENDOR_PACKAGE_JSON = _readIfExists(path.join(ROOT_DIR, 'package.json'));
// N-349a: lint-icons.js / lintLucideSubset. The icon list is the single source for the
// subset build and the lint; its SHA-256 must equal the hash in the subset file's banner,
// so the banner (first 300 chars of each vendor file) is read here too. A missing list
// reads as '' and FAILS the lint rather than passing vacuously.
sandbox.ICON_SUBSET_LIST = _readIfExists(path.join(VENDOR_DIR, 'lucide-subset-icons.txt'));
sandbox.ICON_SUBSET_LIST_SHA256 = crypto.createHash('sha256').update(sandbox.ICON_SUBSET_LIST).digest('hex');
sandbox.VENDOR_HEADS = Object.keys(sandbox.VENDOR_FILES).reduce((acc, f) => {
  acc[f] = fs.readFileSync(path.join(VENDOR_DIR, f), 'utf8').slice(0, 300);
  return acc;
}, {});
// N-293 (SEC-13): the repo-exposure guard reads the secret-scan workflow and the
// README as text, and checks the retired /v2/ workflow stays gone. Missing files
// read as '' / false so the assertion FAILS rather than passing vacuously.
sandbox.REPO_FILES = {
  gitleaksWorkflow: _readIfExists(path.join(ROOT_DIR, '.github', 'workflows', 'gitleaks.yml')),
  staticV2Exists: fs.existsSync(path.join(ROOT_DIR, '.github', 'workflows', 'static-v2.yml')),
  readme: _readIfExists(path.join(ROOT_DIR, 'README.md')),
};

vm.createContext(sandbox);

for (const file of SOURCE_FILES) {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

const assertions = sandbox.ASSERTIONS || [];
if (assertions.length === 0) {
  console.error('No assertions found — tests/assertions.js did not populate ASSERTIONS.');
  process.exit(1);
}

let failures = 0;
let skipped = 0;
for (const { name, fn } of assertions) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    if (err && err.__skip) {
      skipped++;
      console.log(`SKIP  ${name}`);
      console.log(`      ${err.message}`);
    } else {
      failures++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }
}

console.log('');
const passed = assertions.length - failures - skipped;
console.log(`${passed}/${assertions.length} passed${skipped ? `, ${skipped} skipped` : ''}`);

if (failures > 0) process.exit(1);
