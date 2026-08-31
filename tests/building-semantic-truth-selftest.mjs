import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BUILDING_SEMANTIC_TRUTH_SCHEMA,
  deriveBuildingSemanticTruth,
} from '../world/building-semantic-truth.js';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import {
  attachSpectacleMedia,
  compileExteriorCompositionAuthority,
} from '../world/exterior-composition-authority.js';

const WORLD_SEED = 0x51a7c0de;
const CHUNK_KEY = '7,-3';

function physicalUse(family, morphology) {
  return {
    schema: 'jweb.physical-use.v1',
    family,
    morphology,
    districtContext: 'kowloon',
    decision: 'focused-test',
    stableKey: `${CHUNK_KEY}:${family}`,
  };
}

function planFor({ entityId, family, morphology, programHint = null }) {
  return planBuildingSidecar({
    worldSeed: WORLD_SEED,
    chunkKey: CHUNK_KEY,
    chunkX: 7,
    chunkZ: -3,
    distanceChunks: Math.hypot(7, -3),
    weirdnessSampled: 0.42,
    isSpawn: false,
    entityId,
    programHint,
    physicalUse: physicalUse(family, morphology),
    modules: [{ key: 'm0', cx: 0, cz: 0, halfX: 5.4, halfZ: 4.6, floors: 1 }],
    accessAnchors: [{ id: 'front', kind: 'main-entry', x: 0, z: -4.6, side: 'north', floor: 0 }],
  });
}

function exteriorFor(plan, family, morphology, opportunities = []) {
  const entity = {
    id: plan.entityId,
    kind: 'building',
    physicalUse: physicalUse(family, morphology),
    archetype: morphology,
    buildingPlan: plan,
  };
  const payload = { entities: [entity], semanticContext: { opportunities } };
  const result = compileExteriorCompositionAuthority({ chunk: { key: CHUNK_KEY, worldSeed: WORLD_SEED }, payload });
  return { entity, payload, result, plan: result.plans[0] };
}

// Stable identity is a pure function of stable building inputs, not call order.
const truthA1 = deriveBuildingSemanticTruth({
  worldSeed: WORLD_SEED,
  chunkKey: CHUNK_KEY,
  entityId: 'building:a',
  physicalUse: physicalUse('mercantile-public', 'dense-tenement'),
});
const truthA2 = deriveBuildingSemanticTruth({
  worldSeed: WORLD_SEED,
  chunkKey: CHUNK_KEY,
  entityId: 'building:a',
  physicalUse: physicalUse('mercantile-public', 'dense-tenement'),
});
assert.equal(truthA1.schema, BUILDING_SEMANTIC_TRUTH_SCHEMA);
assert.deepEqual(truthA1, truthA2);
assert.ok(Object.isFrozen(truthA1));
assert.ok(Object.isFrozen(truthA1.exteriorTendencies));

// Legacy authored entities without a physical-use descriptor are normalized once
// by Building Semantic Truth rather than reinterpreted independently downstream.
const legacyIndustrialTruth = deriveBuildingSemanticTruth({
  worldSeed: WORLD_SEED,
  chunkKey: CHUNK_KEY,
  entityId: 'building:legacy-industrial',
  programHint: 'industrial',
  exteriorMacroPreference: {
    facadeSemanticFamily: 'vertical-mechanical',
    roofSemanticFamily: 'roof-antenna',
  },
});
assert.equal(legacyIndustrialTruth.physicalUseFamily, 'industrial-service');
assert.equal(legacyIndustrialTruth.program, 'electronics_repair');
assert.equal(legacyIndustrialTruth.exteriorTendencies.facadeSemanticFamily, 'vertical-mechanical');
assert.equal(legacyIndustrialTruth.exteriorTendencies.roofSemanticFamily, 'roof-antenna');

const forward = await Promise.all([
  Promise.resolve().then(() => planFor({ entityId: 'building:a', family: 'mercantile-public', morphology: 'dense-tenement' })),
  Promise.resolve().then(() => planFor({ entityId: 'building:b', family: 'industrial-service', morphology: 'service-tenement' })),
]);
const reverse = await Promise.all([
  Promise.resolve().then(() => planFor({ entityId: 'building:b', family: 'industrial-service', morphology: 'service-tenement' })),
  Promise.resolve().then(() => planFor({ entityId: 'building:a', family: 'mercantile-public', morphology: 'dense-tenement' })),
]);
const byId = plans => Object.fromEntries(plans.map(plan => [plan.entityId, {
  truthId: plan.buildingSemanticTruthId,
  truthFingerprint: plan.buildingSemanticTruthFingerprint,
  program: plan.grammar.semanticProgram,
  planFingerprint: plan.fingerprint,
}]));
assert.deepEqual(byId(forward), byId(reverse), 'queue/order must not change building semantic identity or program');

const commercialPlan = forward.find(plan => plan.entityId === 'building:a');
const industrialPlan = forward.find(plan => plan.entityId === 'building:b');
assert.equal(commercialPlan.grammar.source, 'building-semantic-truth');
assert.equal(industrialPlan.grammar.source, 'building-semantic-truth');
assert.equal(commercialPlan.grammar.semanticProgram, commercialPlan.buildingSemanticTruth.program);
assert.equal(industrialPlan.grammar.semanticProgram, industrialPlan.buildingSemanticTruth.program);
assert.notEqual(commercialPlan.grammar.semanticProgram, industrialPlan.grammar.semanticProgram);
assert.notEqual(commercialPlan.grammar.id, industrialPlan.grammar.id);

// Exterior Composition Authority must reuse the exact truth already chosen before interior planning.
const commercialExterior = exteriorFor(commercialPlan, 'mercantile-public', 'dense-tenement');
const industrialExterior = exteriorFor(industrialPlan, 'industrial-service', 'service-tenement');
assert.equal(commercialExterior.plan.buildingSemanticTruthId, commercialPlan.buildingSemanticTruthId);
assert.equal(industrialExterior.plan.buildingSemanticTruthId, industrialPlan.buildingSemanticTruthId);
assert.equal(commercialExterior.plan.buildingSemanticTruth, commercialPlan.buildingSemanticTruth);
assert.equal(industrialExterior.plan.buildingSemanticTruth, industrialPlan.buildingSemanticTruth);
assert.equal(commercialExterior.plan.semanticProgram, commercialPlan.grammar.semanticProgram);
assert.equal(industrialExterior.plan.semanticProgram, industrialPlan.grammar.semanticProgram);
assert.equal(commercialExterior.entity.buildingSemanticTruth, commercialPlan.buildingSemanticTruth, 'exterior must reuse interior truth object');
assert.equal(industrialExterior.entity.buildingSemanticTruth, industrialPlan.buildingSemanticTruth, 'exterior must reuse interior truth object');
assert.ok(commercialPlan.buildingSemanticTruth.exteriorTendencies.compositionStyles.includes(commercialExterior.plan.style));
assert.ok(industrialPlan.buildingSemanticTruth.exteriorTendencies.compositionStyles.includes(industrialExterior.plan.style));
assert.notEqual(commercialExterior.plan.style, industrialExterior.plan.style, 'different semantic families must influence exterior expression');

// Roof/facade service requests inherit truth tendencies, not a second building interpretation.
const serviceRequests = [];
const serviceEntity = {
  id: industrialPlan.entityId,
  kind: 'building',
  physicalUse: physicalUse('industrial-service', 'service-tenement'),
  archetype: 'service-tenement',
  buildingPlan: industrialPlan,
};
const servicePayload = {
  entities: [serviceEntity],
  semanticContext: {
    opportunities: [
      { id: 'facade-service', entityId: serviceEntity.id, role: 'facade-service-band', bounds: { halfX: 2, halfZ: 0.2 }, clearanceBudget: { width: 4, height: 3, depth: 0.4 }, transform: { x: 0, y: 2, z: -4, rotY: 0 } },
      { id: 'roof-service', entityId: serviceEntity.id, role: 'roof-utility-zone', bounds: { halfX: 2, halfZ: 2 }, clearanceBudget: { width: 4, height: 2, depth: 4 }, transform: { x: 0, y: 4, z: 0, rotY: 0 } },
    ],
  },
};
compileExteriorCompositionAuthority({
  chunk: { key: CHUNK_KEY, worldSeed: WORLD_SEED },
  payload: servicePayload,
  planFieldRequest: ({ entity, opportunity, request }) => {
    serviceRequests.push({ opportunityId: opportunity.id, semanticFamily: request.semanticFamily, truthId: request.buildingSemanticTruthId, program: request.styleProgramPreference });
    return { kind: 'exterior-prop-field', entityId: entity.id, seed: 1, exteriorVisualTier: request.priorityTier, semanticOpportunityId: opportunity.id };
  },
});
const facadeRequest = serviceRequests.find(item => item.opportunityId === 'facade-service');
const roofRequest = serviceRequests.find(item => item.opportunityId === 'roof-service');
assert.equal(facadeRequest.semanticFamily, industrialPlan.buildingSemanticTruth.exteriorTendencies.facadeSemanticFamily);
assert.equal(roofRequest.semanticFamily, industrialPlan.buildingSemanticTruth.exteriorTendencies.roofSemanticFamily);
assert.equal(facadeRequest.truthId, industrialPlan.buildingSemanticTruthId);
assert.equal(roofRequest.program, industrialPlan.grammar.semanticProgram);

// Semantic media remains deterministic while becoming traceable to building truth.
const mediaTask = {
  kind: 'exterior-prop-field',
  entityId: commercialPlan.entityId,
  seed: 99,
  exteriorVisualTier: 'spectacle',
  buildingSemanticTruthId: commercialPlan.buildingSemanticTruthId,
  buildingSemanticProgram: commercialPlan.grammar.semanticProgram,
  exteriorPlanId: commercialExterior.plan.id,
  fieldPlan: { placements: [{ shape: 'box', assemblyKind: 'corner-megascreen', assemblyId: 'screen-1', surfaceId: 'surface-a', sx: 8 }] },
};
attachSpectacleMedia({ chunk: { key: CHUNK_KEY }, tasks: [mediaTask] });
assert.equal(mediaTask.mediaAssemblies[0].buildingSemanticTruthId, commercialPlan.buildingSemanticTruthId);
assert.equal(mediaTask.mediaAssemblies[0].semanticProgram, commercialPlan.grammar.semanticProgram);

// The old interior family->program authority must not remain in the migrated path.
const sidecarSource = await readFile(new URL('../world/architecture/building-plan-sidecar.js', import.meta.url), 'utf8');
assert.ok(!sidecarSource.includes('DEFAULT_PROGRAM_BY_FAMILY'), 'building plan sidecar must not retain a second family->program table');
assert.ok(sidecarSource.includes("source: 'building-semantic-truth'"));

console.log('building-semantic-truth-selftest: PASS');
console.log(JSON.stringify({
  commercial: { truth: commercialPlan.buildingSemanticTruthId, program: commercialPlan.grammar.semanticProgram, exteriorStyle: commercialExterior.plan.style },
  industrial: { truth: industrialPlan.buildingSemanticTruthId, program: industrialPlan.grammar.semanticProgram, exteriorStyle: industrialExterior.plan.style },
  serviceRequests,
}, null, 2));
