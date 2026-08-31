import assert from 'node:assert/strict';
import { compileSemanticContextMultiplier } from '../world/semantic-context-multiplier.js';

const def = (id, mount, kind, dims = [0.5, 0.8, 0.5], programs = ['commercial'], collision = 'none') => ({
    id, file: `semantic-megapack/assets/${id}.glb`, kind, semanticClass: kind, mount,
    dimensionsXYZ: dims, programs, collision, semanticGraph: { roles: ['semantic-prop'] },
});

const assets = [
    def('wall-camera', 'wall', 'security_camera', [0.32, 0.24, 0.22]),
    def('wall-poster', 'wall', 'notice_board', [0.7, 0.9, 0.08]),
    def('wall-clock', 'wall', 'indoor_clock', [0.45, 0.45, 0.08]),
    def('door-crate', 'ground', 'crate', [0.48, 0.55, 0.42]),
    def('door-chair', 'ground', 'chair', [0.48, 0.92, 0.50]),
    def('roof-vent', 'ground', 'roof_vent_fan', [0.85, 0.72, 0.85]),
    def('needs-collider', 'ground', 'vending_machine', [0.8, 1.8, 0.7], ['commercial'], 'decorative-box-recommended'),
    { id: 'not-semantic', file: 'x.glb', mount: 'wall', collision: 'none', semanticGraph: { roles: ['topology'] } },
];

const opportunities = [
    { id: 'wall-1', role: 'wall-mounted-prop-zone', entityId: 'b1', hostId: 'b1', contextId: 'ctx-b1', transform: { x: 1, y: 2.1, z: 3, rotY: 0 }, clearanceBudget: { width: 1.2, height: 1.2 } },
    { id: 'poster-1', role: 'facade-poster-zone', entityId: 'b1', hostId: 'b1', contextId: 'ctx-b1', transform: { x: 2, y: 1.4, z: 3, rotY: 0 }, clearanceBudget: { width: 1.4, height: 1.2 } },
    { id: 'door-1', role: 'beside-door-zone', entityId: 'b2', hostId: 'b2', contextId: 'ctx-b2', transform: { x: 5, y: 0, z: 2, rotY: 1.57 }, clearanceBudget: { width: 0.62, depth: 0.72 } },
    { id: 'roof-1', role: 'roof-utility-zone', entityId: 'b3', hostId: 'b3', contextId: 'ctx-b3', transform: { x: 8, y: 12, z: 8, rotY: 0 }, clearanceBudget: { width: 2.4, depth: 2.4 }, layer: 'mid' },
    { id: 'connector-1', role: 'connector-adjacent-zone', entityId: 'b3', hostId: 'b3', contextId: 'ctx-b3', transform: { x: 8, y: 12, z: 7, rotY: 0 }, decorationMayIntrude: false },
];

const payload = {
    entities: [{ id: 'b1', kind: 'building' }, { id: 'b2', kind: 'building' }, { id: 'b3', kind: 'building' }],
    semanticContext: {
        entities: [
            { id: 'ctx-b1', entityId: 'b1', program: 'commercial', layer: 'street' },
            { id: 'ctx-b2', entityId: 'b2', program: 'commercial', layer: 'street' },
            { id: 'ctx-b3', entityId: 'b3', program: 'industrial', layer: 'mid' },
        ],
        spaces: [],
        opportunities,
    },
};
const chunk = { key: '2,-3', seed: 123456 };
const existingTasks = [{ kind: 'sign', semanticOpportunityId: 'poster-1' }];
const a = compileSemanticContextMultiplier({ chunk, payload, assets, existingTasks, maxTasks: 8 });
const b = compileSemanticContextMultiplier({ chunk, payload, assets, existingTasks, maxTasks: 8 });

assert.deepEqual(a, b, 'multiplier must be deterministic');
assert.ok(a.tasks.length >= 3, 'representative wall/ground/roof opportunities should produce tasks');
assert.ok(a.tasks.every(task => task.kind === 'semantic-context-prop'));
assert.ok(a.tasks.every(task => task.semanticOpportunityId && task.semanticContextId && task.semanticPlacement));
assert.ok(a.tasks.every(task => task.assetId !== 'needs-collider'), 'late contextual multiplier must reject collider-requiring assets');
assert.ok(a.tasks.every(task => task.assetId !== 'not-semantic'), 'non semantic-props must stay out');
assert.ok(a.tasks.every(task => task.semanticOpportunityId !== 'poster-1'), 'occupied opportunities must remain exclusive');
assert.ok(a.tasks.every(task => task.semanticOpportunityId !== 'connector-1'), 'connector clearance is never a decoration slot');
assert.ok(a.stats.roles.wall >= 1 && a.stats.roles.ground >= 1 && a.stats.roles.roof >= 1, 'all representative context roles should be exercised');
assert.ok(a.tasks.filter(task => task.semanticContextRole === 'wall').every(task => task.assetId !== 'wall-clock'), 'outdoor facade hardware should outrank obviously indoor wall decoration');

const denseWallOpportunities = Array.from({ length: 28 }, (_, i) => ({
    id: `dense-wall-${i}`, role: 'wall-mounted-prop-zone', entityId: 'dense', hostId: 'dense', surfaceId: 'dense:north',
    contextId: 'ctx-dense', transform: { x: -3.5 + (i % 7) * 1.1, y: 2.0 + Math.floor(i / 7) * 2.6, z: -4, rotY: 0 },
    clearanceBudget: { width: 1.0, height: 1.35 }, layer: i >= 14 ? 'mid' : 'street', shellPriority: i < 8 ? 'first-pass' : 'deepen',
}));
const densePayload = {
    entities: [{ id: 'dense', kind: 'building' }],
    semanticContext: {
        entities: [{ id: 'ctx-dense', entityId: 'dense', program: 'commercial', layer: 'street' }],
        spaces: [],
        surfaces: [{ id: 'dense:north', entityId: 'dense', half: 4, yMin: 0, yMax: 12.5 }],
        opportunities: [
            ...denseWallOpportunities,
            { id: 'dense-roof', role: 'roof-utility-zone', entityId: 'dense', hostId: 'dense', contextId: 'ctx-dense', transform: { x: 0, y: 12.5, z: 0, rotY: 0 }, clearanceBudget: { width: 2, depth: 2 } },
            { id: 'dense-ground', role: 'beside-door-zone', entityId: 'dense', hostId: 'dense', contextId: 'ctx-dense', transform: { x: 2, y: 0, z: -4.2, rotY: 0 }, clearanceBudget: { width: 0.7, depth: 0.7 } },
        ],
    },
};
const dense = compileSemanticContextMultiplier({ chunk: { key: '4,1', seed: 77 }, payload: densePayload, assets, existingTasks: [] });
assert.ok(dense.stats.entityBudgets.dense.wall > 8, 'physical wall area should permit substantially more than the old eight-prop entity cap');
assert.ok(dense.stats.roles.wall >= 10, `wall-mounted semantic assets should dominate dense facade enrichment, got ${dense.stats.roles.wall}`);
assert.ok(dense.stats.roles.wall > dense.stats.roles.ground + dense.stats.roles.roof, 'facade occupation must dominate ground/roof contextual props');
assert.equal(dense.tasks[0].semanticContextRole, 'wall', 'first contextual publication should be wall-mounted shell richness');
assert.ok(dense.tasks.some(task => task.semanticLayer === 'mid'), 'selected wall assets must reach mid facade bands');

console.log('[semantic-context-multiplier-selftest] PASS', { representative: a.stats, dense: dense.stats });
