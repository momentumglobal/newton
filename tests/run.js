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
process.env.TZ = 'Europe/London';
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
  path.join(TESTS_DIR, 'fixtures.js'),
  path.join(TESTS_DIR, 'assertions.js'),
];

const sandbox = {};
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
