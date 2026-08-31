import assert from 'node:assert/strict';
import { compileSemanticContextMultiplier } from '../world/semantic-context-multiplier.js';

const def = (id, mount, kind, dims = [0.5, 0.8, 0.5], programs = ['commercial'], collision = 'none') => ({
    id, file: `semantic-megapack/assets/${id}.glb`, kind, semanticClass: kind, mount,
    dimensionsXYZ: dims, programs, collision, semanticGraph: { roles: ['semantic-prop'] },
});

const assets = [
    def('wall-camera', 'wall', 'security_camera', [0.32, 0.24, 0.22]),
    def('wall-poster', 'wall', 'notice_board', [0.7, 0.9, 0.08]),
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

console.log('[semantic-context-multiplier-selftest] PASS', a.stats);
