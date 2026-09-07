import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';
import {
  BUILDING_CONSTRUCTION_ENGINE_SCHEMA,
  planBuildingConstruction,
} from '../world/architecture/building-construction-engine.js';
import { programMacroArchitectureFamilyFor } from '../world/architectural-family-system.js';

const floorH = 3.15;
const physicalTruth = {
  floorHeight: { realizedSI: floorH },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};
const core = {
  id: '21x:core', kind: 'stair-shaft', x: 0, z: 0,
  halfX: 0.7, halfZ: 1.7, yMin: 0, yMax: 40,
  openingWidth: 1.4, openingDepth: 3.4, rampHalfWidth: 0.6,
  integratedFloorLanding: true,
};
const baseModules = [{
  key: 'main', cx: 0, cz: 0, halfX: 9, halfZ: 8,
  floors: 4, floorBase: 0,
  edgeKinds: { N: 'street', S: 'street', W: 'street', E: 'street' },
}];

function buildingPlan(program, family, { routeFloor = null, modules = baseModules } = {}) {
  const accessAnchors = [{ id: `${program}:entry`, kind: 'main-entry', x: 0, z: 8, side: 'south', floor: 0 }];
  if (routeFloor != null) accessAnchors.push({
    id: `${program}:sky`, kind: 'city-exchange', endpointId: `${program}:endpoint`, bridgeId: `${program}:bridge`,
    x: -9, z: 0, side: 'west', floor: routeFloor,
    traversalPermission: 'PUBLIC_THROUGH', routeCharacter: 'VERTICAL_COLLECTOR',
  });
  const sidecar = planBuildingSidecar({
    worldSeed: 0x21_18, chunkKey: '0,0', entityId: `21x:${program}`, programHint: program,
    physicalUse: { family }, physicalTruth, floorHeight: floorH,
    modules: modules.map(({ edgeKinds, ...module }) => module),
    accessAnchors, circulationReservations: [core],
  });
  return promoteBuildingPlanAuthority(sidecar, {
    coreReservationId: core.id, coreReservation: core, chunkKey: '0,0', entityId: `21x:${program}`,
  });
}

const samples = [
  ['apartment', 'residential-lodging', 'domestic-access-stack'],
  ['convenience', 'mercantile-public', 'market-frontage-frame'],
  ['diner', 'mercantile-public', 'food-service-exhaust-frame'],
  ['fire_station', 'industrial-service', 'industrial-bay-megastructure'],
  ['clinic', 'assembly-institutional', 'civic-core-frame'],
  ['office', 'business', 'civic-core-frame'],
  ['laboratory', 'industrial-service', 'laboratory-utility-frame'],
  ['warehouse', 'storage', 'warehouse-loading-frame'],
  ['server_room', 'maintenance-utility', 'data-utility-megastructure'],
];
const flavors = new Set();
const systems = new Set();
const summaries = [];

for (const [program, physicalFamily, expectedFamily] of samples) {
  const plan = buildingPlan(program, physicalFamily, { routeFloor: program === 'convenience' ? 2 : null });
  const architectureFamily = programMacroArchitectureFamilyFor(plan.programArchitecture.id);
  assert.equal(architectureFamily, expectedFamily, `${program}: family mapping`);
  const args = {
    id: `construction:${program}`,
    buildingPlan: plan,
    footprintModules: baseModules,
    compoundBounds: { minX: -9, maxX: 9, minZ: -8, maxZ: 8 },
    architectureFamily, floorH, floors: 4, field: 'ground', stableKey: `construction:${program}`,
  };
  const construction = planBuildingConstruction(args);
  const replay = planBuildingConstruction(args);
  assert.deepEqual(construction, replay, `${program}: construction must be deterministic`);
  assert.equal(construction.schema, BUILDING_CONSTRUCTION_ENGINE_SCHEMA);
  assert.equal(construction.architectureFamily, expectedFamily);
  assert.equal(construction.traversalAuthority, 'building-plan-and-shell-authority-unchanged');
  assert.equal(construction.faces.length, 4, `${program}: one detached module should express four exposed faces`);
  assert.equal(construction.facadeDirectives.length, 16, `${program}: facade semantics must exist for every exposed story-face`);
  assert.ok(construction.semanticFaceFloorCount > 0, `${program}: semantic spaces must reach the exterior construction pass`);
  assert.ok(construction.parts >= 20 && construction.parts < 500, `${program}: construction should be visible but bounded`);
  assert.ok(construction.allowedBehaviors && typeof construction.allowedBehaviors === 'object');
  assert.ok(construction.structuralSystem && construction.budgetClass && construction.throughputClass);

  for (const part of [...construction.metal, ...construction.concrete]) {
    for (const key of ['x', 'y', 'z', 'sx', 'sy', 'sz']) assert.ok(Number.isFinite(Number(part[key])), `${program}: ${key} must be finite`);
    assert.ok(part.sx > 0 && part.sy > 0 && part.sz > 0, `${program}: parts must have volume`);
    assert.equal(part.buildingConstruction, true);
    assert.equal(part.buildingConstructionId, `construction:${program}`);
  }
  for (const directive of construction.facadeDirectives) {
    assert.equal(directive.buildingConstructionId, `construction:${program}`);
    assert.ok(['north', 'south', 'east', 'west'].includes(directive.side));
    assert.ok(Number.isInteger(directive.globalFloor));
    assert.ok(directive.facadeLanguage);
  }

  if (program === 'apartment') {
    assert.equal(construction.allowedBehaviors.mezzanine, false);
    assert.ok(construction.facadeDirectives.some(item => item.facadeLanguage === 'domestic-cellular'));
  }
  if (program === 'fire_station') {
    assert.ok(construction.features.includes('bay-frame-post'));
    assert.ok(construction.facadeDirectives.some(item => item.facadeLanguage === 'large-operational-bay'));
  }
  if (program === 'warehouse') {
    assert.ok(construction.features.includes('loading-canopy'));
    assert.ok(construction.throughputClass.includes('freight'));
  }
  if (program === 'server_room') {
    assert.equal(construction.serviceIntensity, 1);
    assert.ok(construction.features.includes('major-service-stack'));
    assert.ok(construction.facadeDirectives.some(item => ['technical-service', 'service-opaque'].includes(item.facadeLanguage)));
  }
  if (program === 'convenience') assert.ok(construction.features.includes('route-frontage-canopy'));

  flavors.add(construction.constructionFlavor);
  systems.add(construction.structuralSystem);
  summaries.push({ program, family: construction.architectureFamily, flavor: construction.constructionFlavor, system: construction.structuralSystem, parts: construction.parts });
}
assert.ok(flavors.size >= 6, 'different uses should produce materially different construction flavors');
assert.ok(systems.size >= 7, 'different uses should not collapse to one structural system');

// Adjacent modules must not double-build a decorative frame down the shared seam.
const pairedModules = [
  { key: 'a', cx: -4, cz: 0, halfX: 4, halfZ: 5, floors: 3, floorBase: 0, edgeKinds: { N: 'street', S: 'street', W: 'street', E: 'internal' } },
  { key: 'b', cx: 4, cz: 0, halfX: 4, halfZ: 5, floors: 3, floorBase: 0, edgeKinds: { N: 'street', S: 'street', W: 'internal', E: 'street' } },
];
const pairedPlan = buildingPlan('warehouse', 'storage', { modules: pairedModules });
const paired = planBuildingConstruction({
  id: 'construction:paired', buildingPlan: pairedPlan, footprintModules: pairedModules,
  architectureFamily: 'warehouse-loading-frame', floorH, floors: 3, stableKey: 'construction:paired',
});
assert.equal(paired.faces.length, 6, 'two full-height adjacent modules should expose six exterior faces, not eight');
assert.equal(paired.faces.some(face => face.moduleKey === 'a' && face.side === 'east'), false);
assert.equal(paired.faces.some(face => face.moduleKey === 'b' && face.side === 'west'), false);

// A party wall remains structural shell but must not acquire exterior facade expression.
const partyModules = [{ ...baseModules[0], edgeKinds: { N: 'street', S: 'street', W: 'street', E: 'party' } }];
const partyPlan = buildingPlan('clinic', 'assembly-institutional', { modules: partyModules });
const party = planBuildingConstruction({
  id: 'construction:party', buildingPlan: partyPlan, footprintModules: partyModules,
  architectureFamily: 'civic-core-frame', floorH, floors: 4, stableKey: 'construction:party',
});
assert.equal(party.faces.length, 3);
assert.equal(party.faces.some(face => face.side === 'east'), false, 'party wall must not be decorated as an exposed civic facade');

console.log('[cut21x-building-construction-engine-selftest] PASS', {
  flavors: [...flavors], systems: [...systems], samples: summaries,
  invariant: 'semantic use -> construction family/flavor -> exposed face rhythm; shared seams and party walls stay clean',
});
