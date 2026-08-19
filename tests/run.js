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
// utils.js / api.js / analytics.js / lci-model.js / coe-plan.js declare
// plain global functions (<script>-tag style, not CommonJS modules), so
// they're loaded as scripts into one shared vm context in production
// script order rather than `require()`d. Same approach as the Node-VM rig
// built for N-030's Excel export testing. api.js (N-097) is entirely
// network-calling functions except one pure helper, _pickFields — nothing
// in api.js executes at load time, only when called, so loading the whole
// file touches no network.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TESTS_DIR = __dirname;
const JS_DIR = path.join(TESTS_DIR, '..', 'js');

// Production script order (index.html / reporting.html): config.js before
// utils.js before api.js before analytics.js before lci-model.js before
// coe-plan.js. Fixtures/assertions load last.
const SOURCE_FILES = [
  path.join(JS_DIR, 'config.js'),
  path.join(JS_DIR, 'utils.js'),
  path.join(JS_DIR, 'api.js'),
  path.join(JS_DIR, 'analytics.js'),
  path.join(JS_DIR, 'lci-model.js'),
  path.join(JS_DIR, 'coe-plan.js'),
  path.join(TESTS_DIR, 'lint-dates.js'),
  path.join(TESTS_DIR, 'lint-role-copy-fields.js'),
  path.join(TESTS_DIR, 'fixtures.js'),
  path.join(TESTS_DIR, 'assertions.js'),
];
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
