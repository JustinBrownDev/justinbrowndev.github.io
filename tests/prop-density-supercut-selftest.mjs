import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSemanticContextMultiplier } from '../world/semantic-context-multiplier.js';

const assets = [
    { id: 'wall-camera', file: 'props/wall-camera.glb', kind: 'security_camera', semanticClass: 'security-camera', mount: 'wall', collision: 'none', dimensionsXYZ: [0.5, 0.6, 0.15], programs: ['office'], semanticGraph: { roles: ['semantic-prop'] } },
    { id: 'wall-panel', file: 'props/wall-panel.glb', kind: 'electrical_panel', semanticClass: 'electrical-panel', mount: 'wall', collision: 'none', dimensionsXYZ: [0.6, 0.7, 0.12], programs: ['office'], semanticGraph: { roles: ['semantic-prop'] } },
];
const opportunities = Array.from({ length: 32 }, (_, i) => ({
    id: `surface:a:hardware:${i}`, role: 'wall-mounted-prop-zone', entityId: 'building:a', hostId: 'building:a', surfaceId: 'surface:a',
    contextId: 'context:a', decorationMayIntrude: true, shellPriority: i < 8 ? 'first-pass' : 'deepen', layer: i >= 16 ? 'mid' : 'street',
    transform: { x: -3.5 + (i % 8), y: 2 + Math.floor(i / 8) * 2.6, z: 0, rotY: 0 }, clearanceBudget: { width: 1.1, height: 1.4 },
}));
const payload = {
    entities: [{ id: 'building:a', kind: 'building' }],
    semanticContext: {
        entities: [{ id: 'context:a', entityId: 'building:a', program: 'office' }], spaces: [],
        surfaces: [{ id: 'surface:a', entityId: 'building:a', half: 4, yMin: 0, yMax: 12.5 }],
        opportunities,
    },
};
const result = compileSemanticContextMultiplier({ chunk: { key: '0,0' }, payload, assets, existingTasks: [] });
assert.ok(result.tasks.length > 8, `physical facade budget should exceed the retired eight-prop cap, got ${result.tasks.length}`);
assert.equal(result.tasks.length, result.stats.entityBudgets['building:a'].wall);
assert.equal(result.stats.roles.wall, result.tasks.length);
assert.equal(result.stats.minScale, 0.16);
assert.equal(result.stats.catalogSearchDepth, 512);
assert.ok(result.tasks.some(task => task.semanticLayer === 'mid'), 'deep wall enrichment must climb above the street band');

const semanticSource = fs.readFileSync(new URL('../world/semantic-context.js', import.meta.url), 'utf8');
const exteriorSource = fs.readFileSync(new URL('../world/exterior-prop-field.js', import.meta.url), 'utf8');
assert.match(semanticSource, /hardware-grid/);
assert.match(semanticSource, /shellPriority: row < 2 \? 'first-pass' : 'deepen'/);
assert.match(exteriorSource, /semanticOpportunityId/);
assert.match(exteriorSource, /semanticAuthority: true/);

const enrichmentPath = new URL('../world/kowloon-fabric-enrichment.js', import.meta.url);
if (fs.existsSync(enrichmentPath)) {
    const enrichmentSource = fs.readFileSync(enrichmentPath, 'utf8');
    assert.match(enrichmentSource, /shellContextTasks/);
    assert.match(enrichmentSource, /earlyWallByEntity/);
    assert.match(enrichmentSource, /shellInsertAt/);
    assert.match(enrichmentSource, /state\.firstPassTargetByEntity\[entityId\] = beforeTarget \+ count/,'wall shell must be requested before visible first-pass may complete');
    assert.match(enrichmentSource, /state\.tasks\.push\(exteriorPropFieldTask\)/, 'primitive micro-clutter should deepen after facade shell work');
    assert.doesNotMatch(enrichmentSource, /state\.tasks\.unshift\(exteriorPropFieldTask\)/, 'micro-clutter must no longer preempt facade shell richness');
}
console.log('PASS facade saturation density policy', result.stats);
