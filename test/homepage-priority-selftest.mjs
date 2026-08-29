import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const synchronous = fs.readFileSync(path.join(root, 'synchronous', 'index.html'), 'utf8');
const testHtml = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const progressive = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const perf = fs.readFileSync(path.join(root, 'city-performance.js'), 'utf8');
const failures = [];
const ok = (v, msg) => { if (!v) failures.push(msg); };

ok(homepage.includes('src="./test/main.js"'), 'homepage must run progressive test/main.js');
ok(!homepage.includes('<base href="../">'), 'homepage must resolve assets from root');
ok(synchronous.includes('<base href="../">'), '/synchronous must resolve the old root assets');
ok(synchronous.includes('src="./main.js"'), '/synchronous must run the original synchronous main.js');
for (const [name, html] of [['homepage', homepage], ['synchronous', synchronous], ['/test', testHtml]]) {
  ok(!/old site/i.test(html), `${name}: old-site link still present`);
  ok(!/photosensitive|epilepsyWarning/i.test(html.replace(/#epilepsyWarning[^}]*}/g, '')), `${name}: photosensitivity warning still present`);
}
ok(progressive.includes('function buildingSiteDistanceSqToPlayer(site)'), 'nearest-player building priority helper missing');
ok(progressive.includes("await testYieldNow('streaming nearest real buildings'"), 'nearest building priority windows do not force paints');
ok(progressive.includes("await testYieldNow('streaming nearest real streets/alleys'"), 'ground chunks are not painted nearest-first');
ok(progressive.includes('sortPlacementRequestsNearestToPlayer'), 'async model placements are not nearest-player sorted');
ok(progressive.includes('sortDecorationQueueNearPlayer'), 'deferred decoration queue is not re-prioritized around player');
ok(progressive.includes('createProgressiveStaticWorldOptimizer({'), 'homepage still invokes the monolithic static-world optimizer');
ok(progressive.includes('await staticWorldOptimizer.optimize({'), 'progressive optimizer is not cooperatively awaited');
ok(perf.includes('optimizing static world · merging nearest chunks'), 'static optimizer does not expose nearest-chunk cooperative phases');

if (failures.length) {
  console.error(`[homepage-priority] FAIL (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('[homepage-priority] PASS');
