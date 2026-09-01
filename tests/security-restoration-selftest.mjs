import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '../world/kowloon-fabric-enrichment.js');
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');

assert.match(source, /security: 40,/,
    'skeleton moderate-prop admission must restore security cameras to 40 percent');
assert.doesNotMatch(source, /security: 25,/,
    'old 25 percent security admission must be gone');
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
    'security restoration must remain behind the existing moderateProps lane/kill switch');

console.log('security-restoration-selftest: ok');
