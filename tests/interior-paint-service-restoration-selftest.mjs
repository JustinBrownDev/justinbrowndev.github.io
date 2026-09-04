import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
const enrichment = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
const priority = fs.readFileSync(new URL('../world/exterior-spectacle-priority.js', import.meta.url), 'utf8');

assert.match(engine, /interiorPaintMat/, 'interior paint must have one shared instanced material');
assert.match(engine, /interiorPaint:\s*\[\]/, 'fabric buffers must own an interior-paint batch');
assert.match(engine, /building-plan-interior-paint/, 'partition paint must derive from Building Plan wall runs');
assert.match(engine, /t\.color != null/, 'instanced renderer must honor deterministic per-room paint colors');
assert.match(engine, /connected-solid-superstructure/, 'engine must publish one-shot superstructure fallback mode');
assert.match(engine, /reconcileStructuralPartition/, 'ordinary partitions must be structurally preflighted before build');
assert.match(engine, /district-landmark-preflight/, 'one-cell district landmarks must feed the same superstructure fallback instead of failing early');

assert.match(enrichment, /'service-hardware':\s*42/, 'AC/conduit/vent hardware needs explicit moderate admission');
assert.match(enrichment, /ivy:\s*32/, 'vines should be restored above the old 15 percent admission');
assert.match(enrichment, /kind:\s*'service-hardware'/, 'service hardware must be deterministically planned');
assert.match(enrichment, /function createServiceHardware/, 'service hardware needs a primitive realizer');
assert.match(enrichment, /chunk-service-hardware/, 'service hardware must publish visible facade geometry');
assert.match(enrichment, /new THREE\.Mesh\(pipeGeo,/, 'service hardware must reuse the shared pipe primitive');
assert.doesNotMatch(
    enrichment.match(/function createServiceHardware[\s\S]*?\n    function createSecurity/)?.[0] ?? '',
    /CanvasTexture|loadAsync|GLTF|fetch\(/,
    'service hardware must stay primitive-only and texture-free',
);
assert.match(priority, /'service-hardware':\s*3/, 'service hardware must participate in the shared refinement law');
assert.match(priority, /case 'service-hardware'/, 'service hardware needs an explicit visual impact');

console.log('interior-paint-service-restoration-selftest: ok');
