import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const test = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function functionSource(source, name) {
  const sig = `function ${name}(`;
  const start = source.indexOf(sig);
  if (start < 0) return null;
  const brace = source.indexOf('{', start);
  let depth = 0, quote = null, escape = false, lineComment = false, blockComment = false;
  for (let i = brace; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue; }
    if (c === '/' && n === '*') { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

const forbidden = [
  /\bLOTS\s*=\s*6\b/,
  /world-worker\.js/,
  /fake building/i,
  /proxy city/i,
  /regular-grid/i,
];
for (const pattern of forbidden) ok(!pattern.test(test), `forbidden surrogate marker present: ${pattern}`);

ok(html.includes('<base href="../">'), 'test index must root runtime assets with <base href="../">');
ok(html.includes('src="./test/main.js"'), 'test index must launch test/main.js');
ok(test.includes("import('../noise-data-hard.js')"), 'local noise corpus must be the real root module');
ok(test.includes("import('../noise-data-remote.js')"), 'remote noise corpus must be the real root module');
ok(test.includes("import('../noise-data-poetry.js')"), 'poetry corpus must be the real root module');
ok(test.includes("site.signatureType ? buildSignatureSite(site) : addBuildingSite(site);"), 'real BuildingSite dispatch missing');
ok(test.includes("await testYieldIfNeeded('streaming nearest real buildings'"), 'real building loop is not cooperatively yielding');
ok(test.includes('async function layOpenCellSurfaces()'), 'real ground generation is not cooperatively yielding');
ok(test.includes('createProgressiveStaticWorldOptimizer({'), 'real progressive static-world optimizer missing');
ok(test.includes('createPlayerPhysics({'), 'real player physics missing');
ok(test.includes("mode: 'full-fidelity-progressive'"), 'progressive runtime telemetry missing');

// These are architecture/content functions.  Their bodies must be byte-for-byte
// identical to root: /test may schedule around them, but it may not simplify them.
for (const name of [
  'worldToCellIndex',
  'buildSignaturePlaceholder',
  'buildSignatureSite',
  'addBuildingSite',
  'buildRooftopCatwalks',
  'buildHangingBridges',
  'buildTraversalGraph',
  'validateTraversal',
]) {
  const a = functionSource(main, name);
  const b = functionSource(test, name);
  ok(!!a && !!b, `${name}: function missing from root or test`);
  if (a && b) ok(a === b, `${name}: /test changed authoritative function body`);
}

// Dependency path changes are expected because the copy lives one directory
// deeper.  No other alternate runtime module should exist in /test.
const testFiles = fs.readdirSync(here).sort();
ok(!testFiles.includes('world-worker.js'), 'world-worker.js must not exist in /test');
ok(!testFiles.includes('app.js'), 'alternate app.js runtime must not exist in /test');

console.log(`[full-fidelity] root main.js sha256 ${sha256(main)}`);
console.log(`[full-fidelity] test main.js sha256 ${sha256(test)}`);
if (failures.length) {
  console.error(`[full-fidelity] FAIL (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('[full-fidelity] PASS: /test changes scheduling, not world/content architecture');
