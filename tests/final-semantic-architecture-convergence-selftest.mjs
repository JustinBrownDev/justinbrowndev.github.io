import assert from 'node:assert/strict';
import {
  attachDistrictBlockComposition,
  compileDistrictBlockComposition,
  districtBuildingPolicyForEntity,
} from '../world/district-block-composition.js';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';
import { compileSemanticContext } from '../world/semantic-context.js';
import {
  compileExteriorCompositionAuthority,
  createExteriorCompositionCompiler,
} from '../world/exterior-composition-authority.js';
import { runCooperativeCompiler } from '../world/architecture/semantic-plan-runtime.js';
import { FRONTAGE_BINDING_SCHEMA } from '../world/frontage-semantic-binding.js';
import { readFile } from 'node:fs/promises';

const worldSeed = 0x6a09e667;
const chunk = {
  worldId: 'jweb.dev/world:final-convergence-test',
  worldSeed,
  key: '5,-2', x: 5, z: -2, chunkSize: 64,
  seed: 0x1234abcd,
  weirdness: { sampled: 0.52, distanceChunks: Math.hypot(5, -2) },
};

const families = [
  'mercantile-public', 'industrial-service', 'residential-lodging',
  'business', 'assembly-institutional', 'maintenance-utility',
];
const positions = [
  [-18, -15], [0, -15], [18, -15], [-18, 15], [0, 15], [18, 15],
];
const entities = families.map((family, index) => {
  const [x, z] = positions[index];
  return {
    id: `building:${index}`,
    kind: index === 4 ? 'district-landmark' : 'building',
    x, z, floorH: 3.15,
    physicalUse: { schema: 'jweb.physical-use.v1', family, morphology: `${family}-test`, districtContext: 'legacy-kowloon' },
    footprintModules: [{ key: `m${index}`, cx: x, cz: z, halfX: 4.5, halfZ: 4, floors: 1 }],
  };
});
const payload = {
  worldId: chunk.worldId,
  entities,
  semanticSpaces: [],
  semanticPlacements: [],
  physics: { semanticConnectors: [], circulationReservations: [] },
};

// Neighborhood intent is chosen before building identity and remains stable under
// input reordering.
const district = compileDistrictBlockComposition({ chunk, payload });
attachDistrictBlockComposition(payload, district);
const reversedPayload = { ...structuredClone(payload), entities: structuredClone(payload.entities).reverse() };
const reversedDistrict = compileDistrictBlockComposition({ chunk, payload: reversedPayload });
assert.equal(reversedDistrict.id, district.id);
for (const entity of entities) {
  const a = district.buildings[entity.id];
  const b = reversedDistrict.buildings[entity.id];
  assert.equal(a.blockRole, b.blockRole, `district role changed with entity order: ${entity.id}`);
  assert.equal(a.spectaclePriority, b.spectaclePriority, `district spectacle changed with entity order: ${entity.id}`);
}
assert.ok(new Set(Object.values(district.buildings).map(item => item.blockRole)).size >= 3, 'district composition did not measurably diversify the block');

for (const entity of entities) {
  const districtPolicy = districtBuildingPolicyForEntity(entity);
  const sidecar = planBuildingSidecar({
    worldSeed,
    chunkKey: chunk.key,
    chunkX: chunk.x,
    chunkZ: chunk.z,
    weirdnessSampled: chunk.weirdness.sampled,
    distanceChunks: chunk.weirdness.distanceChunks,
    entityId: entity.id,
    physicalUse: entity.physicalUse,
    programHint: districtPolicy.programHint,
    districtComposition: entity.districtComposition,
    floorHeight: entity.floorH,
    modules: entity.footprintModules,
    accessAnchors: [{
      id: `${entity.id}:entry`, kind: 'main-entry',
      x: entity.x, z: entity.z - 4, side: 'north', floor: 0,
      connectorId: `${entity.id}:entry`,
    }],
  });
  const plan = promoteBuildingPlanAuthority(sidecar, { chunkKey: chunk.key, entityId: entity.id });
  entity.buildingPlan = plan;
  entity.buildingSemanticTruth = plan.buildingSemanticTruth;

  assert.equal(plan.buildingSemanticTruth.districtComposition.compositionId, district.id, 'district truth did not flow through shared building identity');
  assert.equal(plan.buildingSemanticTruth.districtComposition.blockRole, entity.districtComposition.blockRole);
  assert.equal(plan.grammar.semanticProgram, plan.buildingSemanticTruth.program);
  assert.equal(entity.buildingSemanticTruth, plan.buildingSemanticTruth, 'entity and interior planner do not share one truth object');
  assert.ok(plan.topologySpaces.length > 0, 'Building Plan Authority produced no topology spaces');
}

// Semantic context now publishes the existing shared program and Portal/topology
// surface views; it no longer has a second physical-family program table.
const semanticContext = compileSemanticContext({ chunk, payload, tasks: [], debugWeight: 0 });
payload.semanticContext = semanticContext;
assert.ok(semanticContext.frontages.every(binding => binding.schema === FRONTAGE_BINDING_SCHEMA));
assert.equal(semanticContext.frontageBinding.ownsQuantity, false);
assert.equal(semanticContext.frontageBinding.ownsReservations, false);
assert.equal(semanticContext.frontageBinding.ownsTopology, false);
for (const context of semanticContext.entities) {
  const entity = entities.find(item => item.id === context.entityId);
  assert.equal(context.program, entity.buildingSemanticTruth.program, `semantic context reinterpreted building program for ${context.entityId}`);
}
const boundOpportunity = semanticContext.opportunities.find(item => item.frontageContentContext?.buildingPlanId);
assert.ok(boundOpportunity, 'no semantic frontage opportunity bound to a real Building Plan');
assert.ok(boundOpportunity.frontageContentContext.program, 'frontage content lost adjacent interior program');
assert.ok(boundOpportunity.frontageContentContext.districtId, 'frontage content lost district identity');

function planFieldRequest({ entity, opportunity, request }) {
  return {
    kind: 'exterior-prop-field',
    entityId: entity.id,
    seed: Number(request.seed) || 1,
    exteriorVisualTier: request.priorityTier,
    semanticOpportunityId: opportunity.id,
    semanticOpportunityRole: opportunity.role,
    semanticPlacement: opportunity.transform ? { ...opportunity.transform } : null,
    fieldPlan: { placements: [] },
  };
}
function compositionInput(sourcePayload) {
  return {
    chunk,
    payload: sourcePayload,
    authoredTasks: [],
    selectContextAsset: null,
    planFieldRequest,
  };
}

const syncPayload = structuredClone(payload);
const cooperativePayload = structuredClone(payload);
const synchronous = compileExteriorCompositionAuthority(compositionInput(syncPayload));
const compiler = createExteriorCompositionCompiler(compositionInput(cooperativePayload));
const cooperative = await runCooperativeCompiler(compiler, { maxUnitsPerSlice: 2 });
assert.deepEqual(cooperative.result, synchronous, 'cooperative scheduling changed deterministic Exterior Composition truth');
assert.ok(cooperative.metrics.slices > 1, 'cooperative compiler collapsed back into monolithic planning');
assert.ok(cooperative.metrics.maxUnitsPerSlice <= 2);
assert.equal(synchronous.stats.plannerOwnsQuantity, true);
assert.equal(synchronous.stats.opportunityGridIsCandidateOnly, true);
assert.equal(synchronous.stats.singleAuthority, true);
for (const exteriorPlan of synchronous.plans) {
  const entity = syncPayload.entities.find(item => item.id === exteriorPlan.entityId);
  assert.equal(exteriorPlan.buildingSemanticTruthId, entity.buildingPlan.buildingSemanticTruthId, `interior/exterior shared truth disagreement: ${exteriorPlan.entityId}`);
  assert.equal(exteriorPlan.semanticProgram, entity.buildingPlan.grammar.semanticProgram);
  assert.equal(exteriorPlan.districtCompositionId, entity.districtComposition.compositionId);
}

// Cleanup contract: dead local facade aperture/program authorities must not creep
// back into semantic-context after Portal + Building Semantic Truth convergence.
const semanticContextSource = await readFile(new URL('../world/semantic-context.js', import.meta.url), 'utf8');
assert.ok(!semanticContextSource.includes('function compileApertures('), 'dead duplicate aperture authority still present');
assert.ok(!semanticContextSource.includes("family === 'mercantile-public'"), 'duplicate physical-family program interpretation still present');
const portalSource = await readFile(new URL('../world/access-portals.js', import.meta.url), 'utf8');
assert.ok(!portalSource.includes('futureSpatialClaimRef'), 'Portal still exposes a future placeholder instead of canonical Spatial Claim IDs');

console.log('[final-semantic-architecture-convergence-selftest] PASS', {
  districtRoles: [...new Set(Object.values(district.buildings).map(item => item.blockRole))].sort(),
  buildings: entities.length,
  topologySpaces: entities.reduce((sum, entity) => sum + entity.buildingPlan.topologySpaces.length, 0),
  frontageBindings: semanticContext.frontageBinding.bindings,
  exteriorPlans: synchronous.plans.length,
  exteriorAccepted: synchronous.stats.accepted,
  cooperativeSlices: cooperative.metrics.slices,
  cooperativeUnits: cooperative.metrics.units,
});
