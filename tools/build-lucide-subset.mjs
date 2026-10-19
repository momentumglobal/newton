#!/usr/bin/env node
// tools/build-lucide-subset.mjs — builds js/vendor/lucide-<ver>.subset.min.js (N-349a).
//
// WHY: the full Lucide file is 432 KB and every page parses it to draw ~50 icons.
// This builds a subset from the SAME pinned release containing only the icons
// listed in js/vendor/lucide-subset-icons.txt. The result is a DERIVED file, so
// js/vendor/VERSIONS.md records the upstream tarball integrity and the subset's
// sha384, and tests/lint-vendor.js (lintLucideSubset) checks the chain.
//
// USAGE (repo root, Node >= 18, needs npm + network, tar on PATH):
//   node tools/build-lucide-subset.mjs           build the subset
//   node tools/build-lucide-subset.mjs --audit   list icons used in first-party
//                                                source that are missing from the list
//
// GOTCHAS
//  - Names are written exactly as templates use them, ALIASES INCLUDED
//    (alert-circle, bar-chart-2, trash-2, ...). Upstream exports aliases from
//    dist/esm/lucide.mjs under their own PascalCase name; this script resolves
//    names there, so an alias works and an unknown name FAILS the build.
//  - createIcons() here is trimmed: no inTemplates, no deprecated icon-name
//    attribute. Newton calls lucide.createIcons() with no arguments only.
//  - Output must be byte-identical for identical inputs (esbuild is pinned).
//  - Never hand-edit the output; edit the list and rebuild.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const LUCIDE_VERSION = '1.47.0';
const ESBUILD_VERSION = '0.28.2';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'js', 'vendor');
const LIST = join(VENDOR, 'lucide-subset-icons.txt');
const OUT = join(VENDOR, `lucide-${LUCIDE_VERSION}.subset.min.js`);
const WIN = process.platform === 'win32';

function fail(msg) { console.error('BUILD FAILED: ' + msg); process.exit(1); }
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: WIN });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')}\n${r.stderr || r.stdout}`);
  return r.stdout;
}
const pascal = n => n.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());

// ---- icon list
function readList() {
  if (!existsSync(LIST)) fail('missing ' + relative(ROOT, LIST));
  const text = readFileSync(LIST, 'utf8');
  if (text.includes('\r')) fail('icon list must use LF line endings');
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  lines.forEach((n, i) => {
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(n)) fail(`icon list line ${i + 1}: "${n}" is not a kebab-case name`);
    if (i > 0 && !(lines[i - 1] < n)) fail(`icon list line ${i + 1}: "${n}" is duplicate or out of order (sorted, no duplicates)`);
  });
  return { names: lines, sha256: createHash('sha256').update(text).digest('hex') };
}

// ---- unpack the pinned upstream tarball into a temp dir, verifying integrity
function unpackUpstream(tmp) {
  const manifest = existsSync(join(VENDOR, 'VERSIONS.md')) ? readFileSync(join(VENDOR, 'VERSIONS.md'), 'utf8') : '';
  const m = /Tarball integrity: `(sha512-[A-Za-z0-9+/=]+)`/.exec(manifest);
  if (!m) fail('js/vendor/VERSIONS.md has no "Tarball integrity: `sha512-...`" line');
  run('npm', ['pack', `lucide@${LUCIDE_VERSION}`, '--silent'], tmp);
  const tgz = join(tmp, `lucide-${LUCIDE_VERSION}.tgz`);
  const got = 'sha512-' + createHash('sha512').update(readFileSync(tgz)).digest('base64');
  if (got !== m[1]) fail(`tarball integrity mismatch\n  VERSIONS.md: ${m[1]}\n  downloaded:  ${got}`);
  run('tar', ['-xzf', `lucide-${LUCIDE_VERSION}.tgz`], tmp);
  return join(tmp, 'package', 'dist', 'esm');
}

// ---- --audit: first-party source vs the FULL name set (CI lint cannot know it)
function audit(esm, names) {
  const src = readFileSync(join(esm, 'lucide.mjs'), 'utf8');
  const all = new Set([...src.matchAll(/default as ([A-Za-z0-9]+)/g)].map(x => x[1]));
  const have = new Set(names.map(pascal));
  const skip = /^(vendor|tests|tools|node_modules|img|css)$/;
  const files = [];
  (function walk(d) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (!skip.test(f)) walk(p); }
      else if (/\.(js|html)$/.test(f) && !/^(Readme|.*user-guide)\.html$/.test(f)) files.push(p);
    }
  })(ROOT);
  const missing = new Map();
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((ln, i) => {
      if (!/icon|lucide/i.test(ln)) return;
      for (const m of ln.matchAll(/(['"`])([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\1|data-lucide=\\?["']([a-z0-9-]+)/g)) {
        const n = m[2] || m[3];
        if (all.has(pascal(n)) && !have.has(pascal(n))) {
          if (!missing.has(n)) missing.set(n, []);
          missing.get(n).push(`${relative(ROOT, f)}:${i + 1}`);
        }
      }
    });
  }
  if (!missing.size) { console.log('audit clean: every icon-like name on an icon line is in the list'); return; }
  console.log('Valid Lucide names on icon lines but NOT in the list (review each; some may be unrelated strings):');
  for (const [n, where] of missing) console.log(`  ${n}  ${where.slice(0, 3).join(', ')}`);
}

function main() {
  const { names, sha256 } = readList();
  const tmp = mkdtempSync(join(tmpdir(), 'lucide-subset-'));
  try {
    const esm = unpackUpstream(tmp);
    if (process.argv.includes('--audit')) { audit(esm, names); return; }
    const exportsSrc = readFileSync(join(esm, 'lucide.mjs'), 'utf8');
    const imports = names.map(n => {
      const P = pascal(n);
      const line = exportsSrc.split('\n').find(l => new RegExp(`default as ${P}(,|\\s)`).test(l));
      const mod = line && /from '(\.\/icons\/[^']+)'/.exec(line);
      if (!mod) fail(`"${n}" (export ${P}) not found in lucide ${LUCIDE_VERSION}`);
      return `import ${P} from '${join(esm, mod[1]).split('\\').join('/')}';`;
    });
    const entry = [
      ...imports,
      `import replaceElement from '${join(esm, 'replaceElement.mjs').split('\\').join('/')}';`,
      `const icons = { ${names.map(pascal).join(', ')} };`,
      'function createIcons({ root = document, attrs = {} } = {}) {',
      "  Array.from(root.querySelectorAll('[data-lucide]'))",
      "    .forEach(el => replaceElement(el, { nameAttr: 'data-lucide', icons, attrs }));",
      '}',
      'window.lucide = { createIcons, icons };',
      '',
    ].join('\n');
    writeFileSync(join(tmp, 'entry.mjs'), entry);
    const banner = `/*! lucide ${LUCIDE_VERSION} subset (N-349a) icons-sha256:${sha256} */`;
    run('npx', ['--yes', `esbuild@${ESBUILD_VERSION}`, 'entry.mjs', '--bundle', '--minify', '--format=iife',
      '--legal-comments=none', `--banner:js=${banner}`, `--outfile=${OUT}`], tmp);
    const bytes = readFileSync(OUT);
    console.log(`wrote ${relative(ROOT, OUT)}`);
    console.log(`icons:   ${names.length}`);
    console.log(`bytes:   ${bytes.length}`);
    console.log(`sha384:  sha384-${createHash('sha384').update(bytes).digest('base64')}`);
    console.log(`list sha256 (banner): ${sha256}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
main();
