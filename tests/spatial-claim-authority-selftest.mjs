import assert from 'node:assert/strict';
import {
    circulationReservationFromSpatialClaim,
    createSpatialClaim,
    evaluateSpatialClaimPair,
    legacyExteriorReservationsFromSpatialClaim,
    resolveSpatialClaims,
    SPATIAL_CLAIM_SCHEMA,
    SPATIAL_CLAIM_TYPES,
    SpatialClaimAuthority,
    spatialClaimFromCirculationReservation,
    spatialClaimFromFacadeAperture,
} from '../world/spatial-claims.js';
import {
    createBoxCirculationReservation,
    reservationIntersectsBox,
} from '../world/circulation-reservations.js';
import { compileBuildingPlanCirculationClearances } from '../world/architecture/building-plan-authority.js';
import { compileExteriorCompositionAuthority } from '../world/exterior-composition-authority.js';

function boxClaim(id, claimType, {
    x = 0, y = 1, z = 0,
    halfX = 1, halfY = 1, halfZ = 1,
    owner = `owner:${id}`,
    priority = null,
    semanticTier = null,
    lifetime = null,
} = {}) {
    return createSpatialClaim({
        id,
        owner: { system: 'selftest', id: owner },
        claimType,
        geometry: { kind: 'box3', x, y, z, halfX, halfY, halfZ },
        priority,
        semanticTier,
        lifetime,
        provenance: { sourceSystem: 'spatial-claim-authority-selftest' },
    });
}

function acceptedIds(claims) {
    return resolveSpatialClaims(claims).accepted.map(item => item.id).sort();
}

// Corridor vs decoration: architectural circulation owns the overlap.
const corridor = boxClaim('corridor', SPATIAL_CLAIM_TYPES.CIRCULATION_CLEARANCE, { halfX: 3, halfZ: 0.8 });
const corridorDecoration = boxClaim('corridor-decoration', SPATIAL_CLAIM_TYPES.FACADE_CLUTTER, { x: 1.2, halfX: 0.4, halfZ: 0.4 });
assert.equal(evaluateSpatialClaimPair(corridor, corridorDecoration).compatible, false);
assert.deepEqual(acceptedIds([corridorDecoration, corridor]), ['corridor']);

// Portal vs facade clutter: a traversable portal remains clear.
const portal = boxClaim('portal', SPATIAL_CLAIM_TYPES.PORTAL_CLEARANCE, { halfX: 0.7, halfY: 1.2, halfZ: 1.1 });
const portalClutter = boxClaim('portal-clutter', SPATIAL_CLAIM_TYPES.FACADE_CLUTTER, { halfX: 0.3, halfY: 0.5, halfZ: 0.3 });
assert.deepEqual(acceptedIds([portalClutter, portal]), ['portal']);

// Spectacle owns a whole facade; a lower-tier opportunity on that facade yields.
const spectacle = createSpatialClaim({
    id: 'spectacle',
    owner: { system: 'exterior-composition', id: 'plan:a' },
    claimType: SPATIAL_CLAIM_TYPES.SPECTACLE_SURFACE,
    geometry: { kind: 'surface-ref', surfaceId: 'building:a:north' },
    semanticTier: 'spectacle',
});
const facadeHardware = createSpatialClaim({
    id: 'facade-hardware',
    owner: { system: 'exterior-composition', id: 'plan:a' },
    claimType: SPATIAL_CLAIM_TYPES.EXTERIOR_OPPORTUNITY,
    geometry: { kind: 'opportunity-ref', opportunityId: 'north:hardware:3', surfaceId: 'building:a:north' },
    semanticTier: 'medium',
});
assert.deepEqual(acceptedIds([facadeHardware, spectacle]), ['spectacle']);

// Surface-local regions preserve aperture precision instead of claiming an entire
// facade. The aperture adapter is ready for the sibling Portal Authority cutover.
const facadeAperture = spatialClaimFromFacadeAperture({
    id: 'aperture:north:door', connectorId: 'portal:north', surfaceId: 'building:a:north',
    uMin: -1, uMax: 1, vMin: 0, vMax: 2.2, clearance: ['portal:north:sweep'],
});
const disjointFacadeRegion = createSpatialClaim({
    id: 'facade-region:right', owner: { system: 'selftest', id: 'right-region' },
    claimType: SPATIAL_CLAIM_TYPES.FACADE_CLUTTER,
    geometry: { kind: 'surface-region', surfaceId: 'building:a:north', uMin: 2, uMax: 3, vMin: 0.5, vMax: 1.5 },
});
assert.equal(evaluateSpatialClaimPair(facadeAperture, disjointFacadeRegion).compatible, true);
assert.deepEqual(acceptedIds([spectacle, facadeAperture]), ['spatial:aperture:north:door']);

// Macro equipment suppresses physically overlapping micro clutter even when the
// semantic opportunities were discovered independently.
const macro = boxClaim('macro-hvac', SPATIAL_CLAIM_TYPES.MACRO_EQUIPMENT, { x: 12, y: 8, z: 4, halfX: 2.5, halfY: 1.5, halfZ: 1.8 });
const micro = boxClaim('micro-cable-box', SPATIAL_CLAIM_TYPES.MICRO_CLUTTER, { x: 13, y: 8, z: 4, halfX: 0.4, halfY: 0.4, halfZ: 0.4 });
assert.deepEqual(acceptedIds([micro, macro]), ['macro-hvac']);

// Distinct non-overlapping opportunities on one facade can coexist. A shared
// parent surface is not itself a whole-surface reservation.
const opportunityA = createSpatialClaim({
    id: 'opportunity:a',
    owner: { system: 'exterior-composition', id: 'plan:b' },
    claimType: SPATIAL_CLAIM_TYPES.EXTERIOR_OPPORTUNITY,
    geometry: { kind: 'compound', parts: [
        { kind: 'opportunity-ref', opportunityId: 'north:left', surfaceId: 'building:b:north' },
        { kind: 'box3', x: -4, y: 4, z: 0, halfX: 0.5, halfY: 0.5, halfZ: 0.25 },
    ] },
});
const opportunityB = createSpatialClaim({
    id: 'opportunity:b',
    owner: { system: 'exterior-composition', id: 'plan:b' },
    claimType: SPATIAL_CLAIM_TYPES.EXTERIOR_OPPORTUNITY,
    geometry: { kind: 'compound', parts: [
        { kind: 'opportunity-ref', opportunityId: 'north:right', surfaceId: 'building:b:north' },
        { kind: 'box3', x: 4, y: 4, z: 0, halfX: 0.5, halfY: 0.5, halfZ: 0.25 },
    ] },
});
assert.equal(evaluateSpatialClaimPair(opportunityA, opportunityB).compatible, true);
assert.deepEqual(acceptedIds([opportunityB, opportunityA]), ['opportunity:a', 'opportunity:b']);

// Stair/core clearance wins over later structural fill in the same volume.
const stair = boxClaim('stair-shaft', SPATIAL_CLAIM_TYPES.STAIR_SHAFT, { halfX: 1.2, halfY: 6, halfZ: 1.8 });
const slabFill = boxClaim('slab-fill', SPATIAL_CLAIM_TYPES.STRUCTURAL, { y: 5, halfX: 3, halfY: 0.1, halfZ: 3 });
assert.deepEqual(acceptedIds([slabFill, stair]), ['stair-shaft']);

// Determinism: candidate arrival order cannot change the authority result.
const authored = boxClaim('authored', SPATIAL_CLAIM_TYPES.AUTHORED_RESERVED_SPACE, { x: 20 });
const lowerMacro = boxClaim('lower-macro', SPATIAL_CLAIM_TYPES.MACRO_EQUIPMENT, { x: 20 });
const lowerMicro = boxClaim('lower-micro', SPATIAL_CLAIM_TYPES.MICRO_CLUTTER, { x: 20 });
const forward = acceptedIds([lowerMicro, lowerMacro, authored]);
const reverse = acceptedIds([authored, lowerMacro, lowerMicro]);
assert.deepEqual(forward, reverse);
assert.deepEqual(forward, ['authored']);

const tiedOwnerA = boxClaim('tie:owner-a', SPATIAL_CLAIM_TYPES.EXTERIOR_OPPORTUNITY, { x: 24, owner: 'owner:a', priority: 500, semanticTier: 'medium' });
const tiedOwnerB = boxClaim('tie:owner-b', SPATIAL_CLAIM_TYPES.EXTERIOR_OPPORTUNITY, { x: 24, owner: 'owner:b', priority: 500, semanticTier: 'medium' });
assert.deepEqual(acceptedIds([tiedOwnerB, tiedOwnerA]), ['tie:owner-a']);
assert.deepEqual(acceptedIds([tiedOwnerA, tiedOwnerB]), ['tie:owner-a']);

const tiedIdA = boxClaim('tie:id-a', SPATIAL_CLAIM_TYPES.EXTERIOR_OPPORTUNITY, { x: 26, owner: 'same-owner', priority: 500, semanticTier: 'medium' });
const tiedIdB = boxClaim('tie:id-b', SPATIAL_CLAIM_TYPES.EXTERIOR_OPPORTUNITY, { x: 26, owner: 'same-owner', priority: 500, semanticTier: 'medium' });
assert.deepEqual(acceptedIds([tiedIdB, tiedIdA]), ['tie:id-a']);
assert.deepEqual(acceptedIds([tiedIdA, tiedIdB]), ['tie:id-a']);

// Transient/chunk cleanup is explicit and scoped.
const authority = new SpatialClaimAuthority();
const transientA = boxClaim('transient:a', SPATIAL_CLAIM_TYPES.MICRO_CLUTTER, { x: 30, lifetime: { kind: 'transient', scopeId: 'chunk:1' } });
const transientB = boxClaim('transient:b', SPATIAL_CLAIM_TYPES.MICRO_CLUTTER, { x: 40, lifetime: { kind: 'transient', scopeId: 'chunk:2' } });
assert.equal(authority.claim(transientA).accepted, true);
assert.equal(authority.claim(transientB).accepted, true);
assert.equal(authority.releaseScope('chunk:1'), 1);
assert.equal(authority.has('transient:a'), false);
assert.equal(authority.has('transient:b'), true);
assert.equal(authority.releaseLifetime('transient'), 1);
assert.equal(authority.size, 0);

// Compatibility adapters: legacy Building Plan boxes map into canonical claims,
// and canonical claims can still project the old circulation/exterior dialects.
const legacyCirculation = {
    id: 'legacy:corridor',
    kind: 'building-plan-circulation-clearance',
    x: 2, z: 3, halfX: 1.5, halfZ: 0.6, yMin: 0, yMax: 2.2,
    source: 'building-plan-authority',
};
const adapted = spatialClaimFromCirculationReservation(legacyCirculation);
assert.equal(adapted.schema, SPATIAL_CLAIM_SCHEMA);
assert.equal(adapted.geometry.kind, 'box3');
const projectedCirculation = circulationReservationFromSpatialClaim(adapted, legacyCirculation);
assert.equal(projectedCirculation.x, legacyCirculation.x);
assert.equal(projectedCirculation.halfX, legacyCirculation.halfX);
assert.equal(projectedCirculation.spatialClaim.id, adapted.id);
assert.equal(adapted.claimType, SPATIAL_CLAIM_TYPES.CIRCULATION_CLEARANCE);

// Native connector/circulation producers now publish the same canonical claim while
// preserving their existing outward reservation shape.
const nativeCirculation = createBoxCirculationReservation({
    id: 'native:portal',
    kind: 'portal-sweep',
    x: 5, z: 6, halfX: 0.8, halfZ: 1.1, yMin: 0, yMax: 2.4,
    source: 'semantic-connectors',
});
assert.equal(nativeCirculation.spatialClaim.schema, SPATIAL_CLAIM_SCHEMA);
assert.equal(nativeCirculation.spatialClaim.claimType, SPATIAL_CLAIM_TYPES.PORTAL_CLEARANCE);
assert.equal(reservationIntersectsBox(nativeCirculation, { x: 5, z: 6, halfX: 0.2, halfZ: 0.2, yMin: 0, yMax: 2 }), true);

const planClearances = compileBuildingPlanCirculationClearances({
    deterministicKey: 'selftest:building-plan',
    topologySpaces: [{
        id: 'selftest:space:corridor', role: 'circulation', moduleKeys: ['m0'],
        yBase: 0, floorH: 2.8, regions: [{ minX: -2, maxX: 2, minZ: -0.6, maxZ: 0.6 }],
    }],
});
assert.equal(planClearances.length, 1);
assert.equal(planClearances[0].spatialClaim.schema, SPATIAL_CLAIM_SCHEMA);
assert.equal(planClearances[0].spatialClaim.claimType, SPATIAL_CLAIM_TYPES.CIRCULATION_CLEARANCE);
assert.equal(Object.keys(planClearances[0]).includes('spatialClaim'), false, 'compatibility claim metadata stays non-enumerable');

const exteriorProjection = legacyExteriorReservationsFromSpatialClaim(opportunityA, {
    planId: 'plan:b', entityId: 'building:b', requestTier: 'medium', source: 'selftest',
});
assert.equal(exteriorProjection.length, 1);
assert.equal(exteriorProjection[0].scope, 'opportunity');
assert.equal(exteriorProjection[0].opportunityId, 'north:left');
assert.equal(exteriorProjection[0].spatialClaimId, opportunityA.id);

// Cross-system runtime seam: Exterior Composition consults live circulation claims
// before admitting facade work. The blocked task and safe sibling have distinct
// opportunity identities, so rejection comes from physical portal ownership.
const runtimePortal = createBoxCirculationReservation({
    id: 'runtime:portal:sweep', kind: 'portal-sweep',
    x: 0, z: 0, halfX: 0.8, halfZ: 0.8, yMin: 0, yMax: 2.4, source: 'semantic-connectors',
});
const runtimePayload = {
    entities: [{ id: 'building:runtime', kind: 'building', program: 'commercial' }],
    physics: { circulationReservations: [runtimePortal] },
    semanticContext: { entities: [], spaces: [], opportunities: [], spatialTopology: { reservations: [] } },
};
const runtimeTasks = [
    {
        kind: 'security', entityId: 'building:runtime', seed: 1, exteriorVisualTier: 'medium', exteriorVisualImpact: 20,
        semanticOpportunityId: 'runtime:near-portal', surfaceId: 'building:runtime:north', semanticOpportunityRole: 'wall-mounted-prop-zone',
        semanticPlacement: { x: 0, y: 1.2, z: 0, role: 'wall-mounted-prop-zone' },
        exteriorRequest: { priorityTier: 'medium', clearance: { width: 0.6, depth: 0.4, height: 0.8 } },
    },
    {
        kind: 'security', entityId: 'building:runtime', seed: 2, exteriorVisualTier: 'medium', exteriorVisualImpact: 10,
        semanticOpportunityId: 'runtime:safe', surfaceId: 'building:runtime:north', semanticOpportunityRole: 'wall-mounted-prop-zone',
        semanticPlacement: { x: 4, y: 1.2, z: 0, role: 'wall-mounted-prop-zone' },
        exteriorRequest: { priorityTier: 'medium', clearance: { width: 0.6, depth: 0.4, height: 0.8 } },
    },
];
const runtimeComposition = compileExteriorCompositionAuthority({
    chunk: { key: 'selftest:runtime', seed: 1 },
    payload: runtimePayload,
    contextualTasks: runtimeTasks,
});
assert.deepEqual(runtimeComposition.acceptedExteriorTasks.map(task => task.semanticOpportunityId), ['runtime:safe']);
assert.equal(runtimeComposition.plans[0].externalSpatialClaimCount, 1);

console.log('[spatial-claim-authority-selftest] PASS', {
    schema: SPATIAL_CLAIM_SCHEMA,
    corridorVsDecoration: true,
    portalVsClutter: true,
    spectacleVsHardware: true,
    typedFacadeRegion: true,
    macroVsMicro: true,
    separateOpportunitiesCoexist: true,
    stairClearance: true,
    deterministicOrder: true,
    deterministicTieBreakers: true,
    transientCleanup: true,
    adapters: true,
    nativeCirculationProducer: true,
    buildingPlanProducer: true,
    exteriorConsultsCirculationClaims: true,
});
