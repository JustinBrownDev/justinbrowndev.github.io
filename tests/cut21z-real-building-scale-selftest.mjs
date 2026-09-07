import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BUILDING_MASSING_FEASIBILITY_SCHEMA,
  BUILDING_SPECIES_SCHEMA,
  applyBuildingSpeciesMassing,
  buildingSpeciesGrammar,
  resolveBuildingHeightIntent,
} from '../world/architecture/building-species.js';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { reconcileCavernFloorBudgets } from '../world/cavern-joint-synthesis.js';

function gridModules(cols, rows, { cell = 7, floors = 30 } = {}) {
  const modules = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    modules.push({
      key: `${col},${row}`,
      cell: { col, row },
      floors,
      rect: { cx: col * cell, cz: row * cell, halfX: cell * 0.48, halfZ: cell * 0.48 },
    });
  }
  return modules;
}

const tiny = resolveBuildingHeightIntent({
  baseFloors: 7, ordinaryScale: 2, cavernFloorCap: 41,
  physicalUse: { family: 'residential-lodging' }, archetype: 'vertical-stack',
  siteCellCount: 1, weirdness: 1, stableKey: 'cut21z:tiny',
  explicitSpecies: 'residential-point-tower',
});
assert.equal(tiny.schema, BUILDING_SPECIES_SCHEMA);
assert.ok(tiny.desiredFloors <= 6, 'one-cell leftovers may not become ordinary skyscrapers');
assert.equal(tiny.cavernSpanPromotion, false);

const officeHeight = resolveBuildingHeightIntent({
  baseFloors: 8, ordinaryScale: 2, cavernFloorCap: 41,
  physicalUse: { family: 'business' }, archetype: 'vertical-stack',
  siteCellCount: 16, weirdness: 0.5, stableKey: 'cut21z:office',
  explicitSpecies: 'office-slab-tower',
});
assert.equal(officeHeight.species, 'office-slab-tower');
assert.ok(officeHeight.desiredFloors >= 14 && officeHeight.desiredFloors <= 41);
assert.equal(buildingSpeciesGrammar(officeHeight.species), 'core-perimeter-office');

const officeModules = gridModules(4, 4, { floors: officeHeight.desiredFloors });
const officePrimary = officeModules.find(module => module.key === '1,1');
const officeMassing = applyBuildingSpeciesMassing({
  modulePlans: officeModules,
  primaryModule: officePrimary,
  heightIntent: { ...officeHeight, desiredFloors: 30 },
  stableKey: 'cut21z:office:massing',
});
assert.equal(officeMassing.schema, BUILDING_MASSING_FEASIBILITY_SCHEMA);
assert.ok(officeMassing.resolvedFloors >= 24, 'large compact office plate should support a normal skyscraper');
assert.ok(officeMassing.topPlateModuleCount >= 9, 'skyscraper must carry a multi-module occupied plate to its top');
assert.ok(officeMassing.topPlateArea >= 430, 'upper skyscraper plate must be hundreds of square metres, not one stair cell');
assert.ok(officeMassing.topPlateMinSpan >= 15, 'upper plate must have useful depth in both axes');
assert.equal(officeMassing.circulationOnlyRisk, false);
assert.ok(officeModules.some(module => module.floors <= officeMassing.podiumFloors + 1), 'tower species should create a real lower podium/setback section');

const stickModules = gridModules(1, 1, { floors: 32 });
const stickMassing = applyBuildingSpeciesMassing({
  modulePlans: stickModules,
  primaryModule: stickModules[0],
  heightIntent: {
    schema: BUILDING_SPECIES_SCHEMA,
    species: 'residential-point-tower', desiredFloors: 32, explicitHeightAuthority: false,
  },
  stableKey: 'cut21z:stick',
});
assert.ok(stickMassing.resolvedFloors <= 6, 'a 32-storey one-cell proposal must be downclassed before floor planning');
assert.equal(stickMassing.downgraded, true);

const cavernBudget = reconcileCavernFloorBudgets({
  groundPlans: [{
    id: 'tiny-ground', desiredFloors: 6, minimumFloors: 2, maximumFloors: 6, floorHeight: 3.15,
    bounds: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 },
  }],
  ceilingPlans: [{
    id: 'ceiling-neighbor', desiredFloors: 8, minimumFloors: 2, maximumFloors: 18, floorHeight: 3.15,
    bounds: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 },
  }],
  ceilingY: 136.08, stableKey: 'cut21z:cavern-cap',
});
const tinyGroundBudget = cavernBudget.ground.get('tiny-ground');
assert.ok(tinyGroundBudget.floors <= 6, 'section archetypes may not stretch a six-floor-cap site into a collector stick');
assert.equal(tinyGroundBudget.maximumFloors, 6);

const floorH = 3.15;
const physicalTruth = {
  floorHeight: { realizedSI: floorH },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};
const core = {
  id: 'cut21z:core', kind: 'stair-shaft', x: 10.5, z: 10.5,
  halfX: 0.8, halfZ: 1.8, yMin: 0, yMax: 100,
  openingWidth: 1.6, openingDepth: 3.6, rampHalfWidth: 0.7, integratedFloorLanding: true,
};
const planModules = officeModules.map(module => ({
  key: module.key, cx: module.rect.cx, cz: module.rect.cz,
  halfX: module.rect.halfX, halfZ: module.rect.halfZ,
  floors: Math.min(module.floors, 6), floorBase: 0,
}));
const pointPlan = planBuildingSidecar({
  worldSeed: 0x21_1a, chunkKey: '0,0', entityId: 'cut21z:point-plan',
  buildingSpecies: 'residential-point-tower',
  physicalUse: { family: 'residential-lodging' }, physicalTruth, floorHeight: floorH,
  modules: planModules,
  accessAnchors: [{ id: 'main', kind: 'main-entry', x: 10.5, z: 24.0, side: 'south', floor: 0 }],
  circulationReservations: [core],
});
assert.equal(pointPlan.grammar.buildingSpecies, 'residential-point-tower');
assert.equal(pointPlan.grammar.id, 'single-loaded-tenement', 'point-tower species must select a residential tower floorplan morphology');
assert.equal(pointPlan.envelope.buildingSpecies, 'residential-point-tower');
assert.ok(pointPlan.floors.slice(1).some(floor => floor.spaces.filter(space => space.role === 'private').length >= 2),
  'real tower plate should produce multiple occupiable residential destinations beside circulation');

const engineSource = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
assert.doesNotMatch(engineSource, /kowloon-near-span/, 'ordinary near-span lottery must be retired from live compound massing');
assert.match(engineSource, /applyBuildingSpeciesMassing/);
assert.match(engineSource, /buildingMassingFeasibility/);

console.log('[cut21z-real-building-scale-selftest] PASS', {
  tinyFloors: tiny.desiredFloors,
  officeSpecies: officeHeight.species,
  officeFloors: officeMassing.resolvedFloors,
  officeTopPlateModules: officeMassing.topPlateModuleCount,
  officeTopPlateArea: Number(officeMassing.topPlateArea.toFixed(1)),
  officeTopPlateMinSpan: Number(officeMassing.topPlateMinSpan.toFixed(1)),
  stickResolvedFloors: stickMassing.resolvedFloors,
  cavernCappedFloors: tinyGroundBudget.floors,
  pointPlanGrammar: pointPlan.grammar.id,
});
