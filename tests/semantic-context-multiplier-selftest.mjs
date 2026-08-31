import assert from 'node:assert/strict';
import { compileSemanticContextMultiplier, selectSemanticContextAsset } from '../world/semantic-context-multiplier.js';

const def = (id, mount, kind, dims = [0.5, 0.8, 0.5], programs = ['commercial'], collision = 'none') => ({
    id, file: `semantic-megapack/assets/${id}.glb`, kind, semanticClass: kind, mount,
    dimensionsXYZ: dims, programs, collision, semanticGraph: { roles: ['semantic-prop'] },
});

const assets = [
    def('wall-camera', 'wall', 'security_camera', [0.32, 0.24, 0.22]),
    def('wall-panel', 'wall', 'electrical_service_panel', [0.7, 0.9, 0.12]),
    def('wall-clock', 'wall', 'indoor_clock', [0.45, 0.45, 0.08]),
    def('wall-megascreen', 'wall', 'exterior_sign_panel', [3.8, 2.4, 0.20]),
    def('wall-duct-riser', 'wall', 'vertical_service_duct_riser', [1.6, 4.8, 0.42], ['industrial']),
    def('door-crate', 'ground', 'crate', [0.48, 0.55, 0.42]),
    def('roof-vent', 'ground', 'roof_vent_fan_cluster', [2.1, 1.25, 1.9], ['industrial']),
    def('needs-collider', 'ground', 'vending_machine', [0.8, 1.8, 0.7], ['commercial'], 'decorative-box-recommended'),
    { id: 'not-semantic', file: 'x.glb', mount: 'wall', collision: 'none', semanticGraph: { roles: ['topology'] } },
];

const opportunities = [
    { id: 'wall-1', role: 'wall-mounted-prop-zone', entityId: 'b1', hostId: 'b1', contextId: 'ctx-b1', transform: { x: 1, y: 2.1, z: 3, rotY: 0 }, clearanceBudget: { width: 1.2, height: 1.2 } },
    { id: 'sign-1', role: 'facade-sign-zone', entityId: 'b1', hostId: 'b1', contextId: 'ctx-b1', transform: { x: 2, y: 4.4, z: 3, rotY: 0 }, clearanceBudget: { width: 5.2, height: 3.2 } },
    { id: 'door-1', role: 'beside-door-zone', entityId: 'b2', hostId: 'b2', contextId: 'ctx-b2', transform: { x: 5, y: 0, z: 2, rotY: 1.57 }, clearanceBudget: { width: 0.62, depth: 0.72 } },
    { id: 'roof-1', role: 'roof-utility-zone', entityId: 'b3', hostId: 'b3', contextId: 'ctx-b3', transform: { x: 8, y: 12, z: 8, rotY: 0 }, clearanceBudget: { width: 3.4, depth: 3.2 }, bounds: { x: 8, y: 12, z: 8, halfX: 2.2, halfZ: 2.0 }, layer: 'mid' },
    { id: 'service-1', role: 'facade-service-band', entityId: 'b3', hostId: 'b3', contextId: 'ctx-b3', transform: { x: 8, y: 5, z: 4, rotY: 0 }, clearanceBudget: { width: 2.4, height: 6.0 }, layer: 'mid' },
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
        spaces: [], opportunities,
    },
};
const chunk = { key: '2,-3', seed: 123456 };

const disabled = compileSemanticContextMultiplier({ chunk, payload, assets });
assert.equal(disabled.tasks.length, 0, 'the corpus selector must never derive population from opportunity count');
assert.equal(disabled.stats.automaticPopulationDisabled, true);
assert.ok(disabled.stats.colliderBearingContextual >= 1, 'collider-bearing semantic props remain visible to the macro selector');
assert.equal(disabled.stats.precommitOnlyBecauseCollider, 0, 'collision metadata no longer globally removes visual corpus candidates');

const requests = [
    { opportunityId: 'wall-1', semanticFamily: 'security-hardware', desiredScaleClass: 'medium', priorityTier: 'medium' },
    { opportunityId: 'sign-1', semanticFamily: 'signage', desiredScaleClass: 'large', priorityTier: 'identity' },
    { opportunityId: 'door-1', semanticFamily: 'street-service', desiredScaleClass: 'medium', priorityTier: 'medium' },
    { opportunityId: 'roof-1', semanticFamily: 'roof-mechanical', desiredScaleClass: 'large', priorityTier: 'macro' },
    { opportunityId: 'service-1', semanticFamily: 'vertical-mechanical', desiredScaleClass: 'large', priorityTier: 'macro' },
];
const a = compileSemanticContextMultiplier({ chunk, payload, assets, requests });
const b = compileSemanticContextMultiplier({ chunk, payload, assets, requests });
assert.deepEqual(a, b, 'planner-requested corpus selection must remain deterministic');
assert.equal(a.tasks.length, requests.length);
assert.ok(a.tasks.every(task => task.kind === 'semantic-context-prop' && task.semanticOpportunityId && task.semanticPlacement));
assert.ok(a.tasks.every(task => task.assetId !== 'not-semantic'));
assert.ok(a.tasks.find(task => task.semanticOpportunityId === 'door-1')?.assetId !== 'needs-collider', 'medium contextual work must not opportunistically acquire deferred collision');
assert.equal(a.tasks.find(task => task.semanticOpportunityId === 'sign-1')?.assetId, 'wall-megascreen', 'large sign host should receive the large fitting sign asset');
assert.equal(a.tasks.find(task => task.semanticOpportunityId === 'service-1')?.assetId, 'wall-duct-riser', 'large vertical mechanical request should deliberately reach the duct-riser corpus');
assert.equal(a.tasks.find(task => task.semanticOpportunityId === 'roof-1')?.assetId, 'roof-vent', 'roof macro request should deliberately reach roof mechanical corpus');
assert.ok(a.tasks.every(task => task.exteriorPlanOwner && task.exteriorReservationOwner));
assert.equal(a.stats.macroRequests, 3);
assert.equal(a.stats.macroGenerated, 3);

const denseWallOpportunities = Array.from({ length: 28 }, (_, i) => ({
    id: `dense-wall-${i}`, role: 'wall-mounted-prop-zone', entityId: 'dense', hostId: 'dense', surfaceId: 'dense:north',
    contextId: 'ctx-dense', transform: { x: -3.5 + (i % 7) * 1.1, y: 2.0 + Math.floor(i / 7) * 2.6, z: -4, rotY: 0 },
    clearanceBudget: { width: 1.0, height: 1.35 }, layer: i >= 14 ? 'mid' : 'street',
}));
const densePayload = {
    entities: [{ id: 'dense', kind: 'building' }],
    semanticContext: { entities: [{ id: 'ctx-dense', entityId: 'dense', program: 'commercial' }], spaces: [], opportunities: denseWallOpportunities },
};
const denseDisabled = compileSemanticContextMultiplier({ chunk: { key: '4,1' }, payload: densePayload, assets });
assert.equal(denseDisabled.tasks.length, 0, '28 hardware anchors are opportunities, not 28 population requests');
const denseRequested = compileSemanticContextMultiplier({
    chunk: { key: '4,1' }, payload: densePayload, assets,
    requests: denseWallOpportunities.slice(0, 2).map(opportunity => ({ opportunity, semanticFamily: 'security-hardware', desiredScaleClass: 'medium', priorityTier: 'medium' })),
});
assert.ok(denseRequested.tasks.length <= 2, 'explicit planner quantity must bound dense lattice realization');

const direct = selectSemanticContextAsset({ chunk, payload, assets, opportunity: opportunities[4], request: requests[4] });
assert.equal(direct?.assetId, 'wall-duct-riser');

// Collider truth must no longer erase a high-value visual asset. Only an explicit
// macro/large request may use it, and the returned task keeps a deferred proxy
// descriptor instead of pretending collision was activated during visual detail.
const macroCollider = def('macro-collider-machine', 'ground', 'industrial_machine', [2.4, 2.1, 1.8], ['industrial'], 'box');
const macroOpportunity = {
    id: 'macro-machine-op', role: 'ground-open-zone', entityId: 'b4', hostId: 'b4', contextId: 'ctx-b4',
    transform: { x: 12, y: 0, z: 3, rotY: 0 }, clearanceBudget: { width: 3.0, height: 2.6, depth: 2.5 },
};
const macroPayload = {
    entities: [{ id: 'b4', kind: 'building' }],
    semanticContext: { entities: [{ id: 'ctx-b4', entityId: 'b4', program: 'industrial' }], spaces: [], opportunities: [macroOpportunity] },
};
const macroTask = selectSemanticContextAsset({
    chunk, payload: macroPayload, assets: [macroCollider], opportunity: macroOpportunity,
    request: { semanticFamily: 'any', desiredScaleClass: 'large', priorityTier: 'macro', planRequestId: 'macro-machine-request' },
});
assert.equal(macroTask?.assetId, 'macro-collider-machine');
assert.equal(macroTask?.semanticCollisionMode, 'box');
assert.equal(macroTask?.semanticCollisionDeferred, true);
assert.equal(macroTask?.semanticCollisionProxy?.shape, 'box');
assert.equal(macroTask?.semanticCollisionProxy?.activation, 'deferred');
assert.ok(macroTask?.semanticCollisionProxy?.width > 0 && macroTask?.semanticCollisionProxy?.height > 0 && macroTask?.semanticCollisionProxy?.depth > 0);

const mediumColliderTask = selectSemanticContextAsset({
    chunk, payload: macroPayload, assets: [macroCollider], opportunity: macroOpportunity,
    request: { semanticFamily: 'any', desiredScaleClass: 'medium', priorityTier: 'medium', planRequestId: 'medium-machine-request' },
});
assert.equal(mediumColliderTask, null, 'medium/micro contextual selection must not quietly create deferred collision debt');

console.log('[semantic-context-multiplier-selftest] PASS', { requested: a.stats, denseRequested: denseRequested.tasks.length });
