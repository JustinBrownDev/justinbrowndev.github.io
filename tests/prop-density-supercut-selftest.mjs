import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSemanticContextMultiplier } from '../world/semantic-context-multiplier.js';

const assets = [
    { id: 'wall-a', file: 'props/wall-a.glb', kind: 'wall_terminal', semanticClass: 'wall-terminal', mount: 'wall', collision: 'none', dimensionsXYZ: [0.5, 0.6, 0.15], programs: ['office'], semanticGraph: { roles: ['semantic-prop'] } },
    { id: 'wall-b', file: 'props/wall-b.glb', kind: 'panel', semanticClass: 'panel', mount: 'wall', collision: 'none', dimensionsXYZ: [0.6, 0.7, 0.12], programs: ['office'], semanticGraph: { roles: ['semantic-prop'] } },
];
const opportunities = Array.from({ length: 32 }, (_, i) => ({
    id: `surface:a:sign:${i}`, role: 'facade-sign-zone', entityId: 'building:a', hostId: 'building:a', surfaceId: 'surface:a',
    contextId: 'context:a', decorationMayIntrude: true,
    transform: { x: i * 0.2, y: 2 + (i % 4) * 0.2, z: 0, rotY: 0 }, clearanceBudget: { width: 1.2, height: 1.4 },
}));
const payload = {
    entities: [{ id: 'building:a', kind: 'building' }],
    semanticContext: { entities: [{ id: 'context:a', entityId: 'building:a', program: 'office' }], spaces: [], opportunities },
};
const result = compileSemanticContextMultiplier({ chunk: { key: '0,0' }, payload, assets, existingTasks: [] });
assert.equal(result.tasks.length, 8, 'context multiplier should now fill up to eight opportunities per entity');
assert.equal(result.stats.maxPerEntity, 8);
assert.ok(result.stats.maxTasks >= 36);
assert.equal(result.stats.minScale, 0.16);
assert.equal(result.stats.catalogSearchDepth, 160);

const layoutSource = fs.readFileSync(new URL('../world/semantic-layout.js', import.meta.url), 'utf8');
const placementSource = fs.readFileSync(new URL('../world/semantic-placement.js', import.meta.url), 'utf8');
const enrichmentSource = fs.readFileSync(new URL('../world/kowloon-fabric-enrichment.js', import.meta.url), 'utf8');
assert.match(layoutSource, /identity: 2, functional: 3, life: 4/);
assert.match(layoutSource, /densityPlanned/);
assert.match(placementSource, /result\.length < 128/);
assert.match(placementSource, /attempt < 36/);
assert.match(enrichmentSource, /SEMANTIC_LOAD_CONCURRENCY = 6/);
assert.match(enrichmentSource, /SEMANTIC_LOAD_MAX_ATTEMPTS = 4/);
assert.match(enrichmentSource, /Math\.min\(12, semanticSlots\.length\)/);
assert.match(enrichmentSource, /count: 8 \+ Math\.floor/);
console.log('PASS prop density supercut', result.stats);
