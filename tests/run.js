#!/usr/bin/env node
// tests/run.js — Node CLI test runner. No dependencies (uses Node's built-in
// `vm` module) — nothing to `npm install` in CI.
//
// utils.js / analytics.js / lci-model.js declare plain global functions
// (<script>-tag style, not CommonJS modules), so they're loaded as scripts
// into one shared vm context in production script order rather than
// `require()`d. Same approach as the Node-VM rig built for N-030's Excel
// export testing.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TESTS_DIR = __dirname;
const JS_DIR = path.join(TESTS_DIR, '..', 'js');

// Production script order (index.html): config.js before utils.js before
// analytics.js before lci-model.js. Fixtures/assertions load last.
const SOURCE_FILES = [
  path.join(JS_DIR, 'config.js'),
  path.join(JS_DIR, 'utils.js'),
  path.join(JS_DIR, 'analytics.js'),
  path.join(JS_DIR, 'lci-model.js'),
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
for (const { name, fn } of assertions) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}

console.log('');
console.log(`${assertions.length - failures}/${assertions.length} passed`);

if (failures > 0) process.exit(1);
