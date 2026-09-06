import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '../world/kowloon-fabric-enrichment.js');
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');

assert.match(source, /security: 40,/,
    'explicit moderate-detail mode keeps security cameras at a bounded 40 percent admission');
assert.doesNotMatch(source, /security: 25,/,
    'the obsolete 25 percent admission must remain gone');
assert.match(source, /if \(rng\(\) < 0\.44\) \{\s*tasks\.push\(\{\s*kind: 'security'/s,
    'security planning must remain independently sparse at 44 percent of eligible buildings');

const start = source.indexOf('function createSecurity(');
const end = source.indexOf('function createInteriorProp(', start);
assert.ok(start >= 0 && end > start, 'security primitive realization block must exist');
const block = source.slice(start, end);
assert.equal((block.match(/new THREE\.Mesh\(unitBox, securityMat\)/g) ?? []).length, 2,
    'one security camera must stay exactly two shared-material box meshes');
assert.doesNotMatch(block, /CanvasTexture|canvasTextTexture|canvasFlyerTexture|loadAsync|GLTF|queueSemanticContextUpgrade|SphereGeometry/,
    'security camera realization must remain free of texture, GLB, and bespoke geometry work');

assert.match(source, /if \(GENERATION_LANES\.moderateProps\) \{\s*const percent = MODERATE_PROP_PERCENT\[String\(task\?\.kind \?\? ''\)\];/s,
    'security cameras must remain behind the optional moderateProps lane');

console.log('security-restoration-selftest: ok');
