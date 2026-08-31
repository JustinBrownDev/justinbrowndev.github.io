import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileExteriorCompositionAuthority } from '../world/exterior-composition-authority.js';
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
const chunk = { key: '0,0' };
const result = compileSemanticContextMultiplier({ chunk, payload, assets, existingTasks: [] });
assert.ok(result.tasks.length > 8, `candidate catalog should still be able to inspect a physically rich facade, got ${result.tasks.length}`);
assert.equal(result.tasks.length, result.stats.entityBudgets['building:a'].wall);
assert.equal(result.stats.roles.wall, result.tasks.length);
assert.equal(result.stats.minScale, 0.16);
assert.equal(result.stats.catalogSearchDepth, 512);
assert.ok(result.tasks.length < opportunities.length, 'candidate generation should remain finite before composition authority');

const authoredSign = { kind: 'sign', entityId: 'building:a', seed: 1, width: 3.2, height: 1.1, firstPassBundle: true, firstPassClass: 'facade' };
const composition = compileExteriorCompositionAuthority({
    chunk, payload,
    authoredTasks: [authoredSign],
    contextualTasks: result.tasks,
    fieldTasks: [],
});
const acceptedForBuilding = composition.acceptedExteriorTasks.filter(task => task.entityId === 'building:a');
const acceptedContextWall = acceptedForBuilding.filter(task => task.kind === 'semantic-context-prop' && task.semanticContextRole === 'wall');
assert.ok(acceptedForBuilding.length <= 7, 'whole-building composition must cap realized exterior density');
assert.ok(acceptedContextWall.length <= 2, 'regular hardware lattice is candidate data, not a command to cover the facade');
assert.equal(acceptedForBuilding.filter(task => task.firstPassBundle).length, 1, 'building gets one meaningful first-pass exterior birth');
assert.ok(acceptedForBuilding.includes(authoredSign), 'readable authored signage should survive candidate convergence');
assert.ok(composition.stats.rejected > 0, 'composition authority should reject surplus hardware candidates');

const semanticSource = fs.readFileSync(new URL('../world/semantic-context.js', import.meta.url), 'utf8');
const exteriorSource = fs.readFileSync(new URL('../world/exterior-prop-field.js', import.meta.url), 'utf8');
const authoritySource = fs.readFileSync(new URL('../world/exterior-composition-authority.js', import.meta.url), 'utf8');
assert.match(semanticSource, /hardware-grid/);
assert.match(authoritySource, /opportunityGridIsCandidateOnly/);
assert.match(exteriorSource, /mediaSurfaceCount/);
assert.match(exteriorSource, /createMediaTexture/);
assert.match(exteriorSource, /toneMapped: false/);

const enrichmentPath = new URL('../world/kowloon-fabric-enrichment.js', import.meta.url);
if (fs.existsSync(enrichmentPath)) {
    const enrichmentSource = fs.readFileSync(enrichmentPath, 'utf8');
    assert.match(enrichmentSource, /compileExteriorCompositionAuthority/);
    assert.match(enrichmentSource, /attachSpectacleMedia/);
    assert.match(enrichmentSource, /exteriorComposition/);
    assert.match(enrichmentSource, /exteriorPropField\.planTasks/);
    assert.doesNotMatch(enrichmentSource, /earlyWallByEntity/, 'retired wall-gadget first pass must stay gone');
    assert.doesNotMatch(enrichmentSource, /spectacleFieldTasks/, 'spectacle and context must no longer be independently merged into the runtime queue');
    assert.doesNotMatch(enrichmentSource, /coveredEntities/, 'coverage must be owned by the composition authority, not a second local scheduler');
}
console.log('PASS facade candidate/realization split', {
    candidateWallTasks: result.tasks.length,
    realizedExteriorTasks: acceptedForBuilding.length,
    realizedContextWall: acceptedContextWall.length,
    rejected: composition.stats.rejected,
});
