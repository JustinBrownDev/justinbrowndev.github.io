import assert from 'node:assert/strict';
import {
    planBuildingSidecar,
    planBuildingSidecarSteps,
} from '../world/architecture/building-plan-sidecar.js';
import {
    resolveSemanticPlacement,
    resolveSemanticPlacementSteps,
} from '../world/semantic-placement.js';
import {
    bindFrontageSemanticTruth,
    bindFrontageSemanticTruthSteps,
} from '../world/frontage-semantic-binding.js';
import {
    createSpatialClaim,
    SPATIAL_CLAIM_TYPES,
    SpatialClaimAuthority,
} from '../world/spatial-claims.js';

function drain(iterator) {
    const checkpoints = [];
    let step = iterator.next();
    while (!step.done) {
        checkpoints.push(step.value);
        step = iterator.next();
    }
    return { checkpoints, result: step.value };
}

const buildingOptions = {
    worldSeed: 0x51ceb00c,
    chunkKey: '7,-3',
    chunkX: 7,
    chunkZ: -3,
    entityId: 'frame-budget:test-building',
    programHint: 'electronics_repair',
    physicalUse: { family: 'industrial-service' },
    physicalTruth: {
        floorHeight: { realizedSI: 3.15 },
        door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
        route: { clearWidthSI: 0.91, headroomSI: 2.05 },
    },
    modules: [
        { key: 'a', cx: -2.5, cz: 0, halfX: 2.5, halfZ: 3, floors: 4 },
        { key: 'b', cx: 2.5, cz: 0, halfX: 2.5, halfZ: 3, floors: 3 },
    ],
};
const buildingStepped = drain(planBuildingSidecarSteps(buildingOptions));
const buildingSync = planBuildingSidecar(buildingOptions);
assert.deepEqual(buildingStepped.result, buildingSync, 'stepped Building Plan must be result-equivalent to the synchronous compatibility wrapper');
assert.equal(buildingStepped.checkpoints.filter(step => step?.phase === 'building-plan-floor').length, 4,
    'Building Plan exposes one cooperative boundary per global floor');

const placementOptions = {
    def: {
        id: 'frame-budget:desk',
        kind: 'office_desk',
        mount: 'ground',
        dimensionsXYZ: [1.2, 0.75, 0.7],
        boundsMin: [-0.6, 0, -0.35],
        clearance: { front: 0.2, rear: 0.1, sides: 0.08 },
        semanticGraph: { requirements: [], relationships: [], support: { mode: 'floor', required: true }, circulation: { keepClear: [] } },
    },
    module: { key: 'm0', cx: 0, cz: 0, halfX: 4, halfZ: 4 },
    yBase: 0,
    seed: 12345,
    placements: [],
    entityId: 'frame-budget:entity',
    moduleKey: 'm0',
    floor: 0,
};
const placementStepped = drain(resolveSemanticPlacementSteps(placementOptions));
const placementSync = resolveSemanticPlacement(placementOptions);
assert.deepEqual(placementStepped.result, placementSync, 'stepped semantic placement must preserve deterministic placement');
assert.ok(placementStepped.checkpoints.some(step => step?.phase === 'candidate-batch'),
    'semantic placement exposes candidate-search boundaries');

const frontageInput = {
    payload: { entities: [], semanticSpaces: [] },
    district: { id: 'frame-budget:district', family: 'mixed' },
    surfaces: Array.from({ length: 9 }, (_, index) => ({ id: `surface:${index}`, entityId: 'missing' })),
    apertures: [],
    opportunities: Array.from({ length: 9 }, (_, index) => ({ id: `opportunity:${index}`, entityId: 'missing' })),
    destinations: [],
};
const frontageStepped = drain(bindFrontageSemanticTruthSteps(structuredClone(frontageInput)));
const frontageSync = bindFrontageSemanticTruth(structuredClone(frontageInput));
assert.deepEqual(frontageStepped.result, frontageSync, 'frontage stepper and sync wrapper remain result-equivalent');
assert.ok(frontageStepped.checkpoints.filter(step => step?.phase === 'surfaces').length >= 3,
    'frontage surfaces are chunked into cooperative batches');
assert.ok(frontageStepped.checkpoints.filter(step => step?.phase === 'opportunities').length >= 3,
    'frontage opportunities are chunked into cooperative batches');

function boxClaim(id, claimType) {
    return createSpatialClaim({
        id,
        owner: { system: 'frame-budget-selftest', id },
        claimType,
        geometry: { kind: 'box3', x: 0, y: 1, z: 0, halfX: 1, halfY: 1, halfZ: 1 },
        provenance: { sourceSystem: 'frame-budget-heavy-leaves-selftest' },
    });
}

const portal = boxClaim('portal', SPATIAL_CLAIM_TYPES.PORTAL_CLEARANCE);
const clutter = boxClaim('clutter', SPATIAL_CLAIM_TYPES.FACADE_CLUTTER);
const portalFirst = new SpatialClaimAuthority([portal]);
const lowerPriority = portalFirst.claimWithoutDisplacement(clutter);
assert.equal(lowerPriority.accepted, false);
assert.equal(lowerPriority.wouldDisplace, false);
assert.equal(portalFirst.has('portal'), true);
assert.equal(portalFirst.has('clutter'), false);

const clutterFirst = new SpatialClaimAuthority([clutter]);
const legacyWouldDisplace = clutterFirst.resolveWith(portal);
assert.equal(legacyWouldDisplace.accepted.some(claim => claim.id === 'portal'), true);
assert.equal(legacyWouldDisplace.accepted.some(claim => claim.id === 'clutter'), false,
    'legacy full resolution says the portal would displace clutter');
const noDisplacement = clutterFirst.claimWithoutDisplacement(portal);
assert.equal(noDisplacement.accepted, false);
assert.equal(noDisplacement.wouldDisplace, true,
    'incremental exterior admission preserves no-displacement semantics instead of silently replacing an incumbent');
assert.equal(clutterFirst.has('clutter'), true);
assert.equal(clutterFirst.has('portal'), false);

console.log('[frame-budget-heavy-leaves-selftest] PASS', {
    buildingPlanCheckpoints: buildingStepped.checkpoints.length,
    semanticPlacementCheckpoints: placementStepped.checkpoints.length,
    frontageCheckpoints: frontageStepped.checkpoints.length,
    spatialClaimAdmission: 'incremental-no-displacement',
});
