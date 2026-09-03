import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chooseKowloonCompoundTargetSize } from '../world/kowloon-structure.js';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { assertBuildingPlanAuthority, promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';

for (const weirdness of [0, 0.5, 1]) {
  for (const roll of [0, 0.01, 0.15, 0.4, 0.7, 0.95, 0.999999]) {
    const target = chooseKowloonCompoundTargetSize(() => roll, weirdness);
    assert.ok(target >= 20 && target <= 48, `compound target escaped 4x 20..48 range: ${target}`);
  }
}

const engineSource = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
const sidecarSource = fs.readFileSync(new URL('../world/architecture/building-plan-sidecar.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
assert.match(engineSource, /primaryModule\.floors >= 10 \? 5[\s\S]*primaryModule\.floors >= 7 \? 4/,
  'tall towers must carry a 4-5 module connected upper plate');
assert.match(sidecarSource, /circulationShape = 'occupancy-hallway'/,
  'upper repeated occupancies must create hallway-shaped circulation demand');
assert.match(sidecarSource, /desiredArea \* 0\.72/,
  'repeated occupancies must keep bounded full-room minimums rather than broom closets');
assert.match(sidecarSource, /corridorCellKeys[\s\S]*preclaimOccupancyHallway/,
  'upper floors must reserve the physical hallway spine before room placement');
assert.match(sidecarSource, /occupancyHallwayFrontageShortfalls[\s\S]*missing-direct-hallway-frontage/,
  'hallway service must be checked against real raster frontage, not graph intent alone');
assert.match(sidecarSource, /placementShortfalls = \[\.\.\.minimumPlacement\.shortfalls, \.\.\.hallwayFrontageShortfalls\]/,
  'missing hallway frontage must participate in deterministic room-count yield/replan');
assert.match(mainSource, /failed locally and was skipped; boot continues/,
  'one malformed authored building must be terminally skipped instead of aborting boot');
assert.match(mainSource, /!authoredStructuralReadySiteIds\.has\(id\) && !authoredFailedSiteIds\.has\(id\)/,
  'minimum-safe boot loop must terminate for locally failed buildings');

const floorH = 3.15;
const stair = {
  id: 'cut13-03:stair-core',
  kind: 'stair-shaft',
  x: 0,
  z: 0,
  halfX: 0.62,
  halfZ: 2.45,
  openingWidth: 1.24,
  openingDepth: 4.90,
  rampHalfWidth: 0.48,
  yMin: 0,
  yMax: floorH * 10 + 0.5,
};
const physicalTruth = {
  schema: 'jweb.physical-truth.v1',
  floorHeight: { realizedSI: floorH },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};
const modules = [];
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 3; col++) {
    modules.push({
      key: `${col},${row}`,
      cx: (col - 1) * 7,
      cz: (row - 0.5) * 7,
      halfX: 3.5,
      halfZ: 3.5,
      floors: 10,
    });
  }
}

const plan = planBuildingSidecar({
  worldSeed: 0x1303,
  chunkKey: 'cut13-03-tower',
  chunkX: 0,
  chunkZ: 0,
  distanceChunks: 0,
  weirdnessSampled: 0,
  isSpawn: false,
  entityId: 'cut13-03-residential-tower',
  programHint: 'residential-lodging',
  physicalUse: { family: 'residential-lodging' },
  physicalTruth,
  floorHeight: floorH,
  modules,
  accessAnchors: [{ id: 'main', kind: 'main-entry', x: -7, z: -7, side: 'north', floor: 0 }],
  circulationReservations: [stair],
  authoredIntent: { grammar: 'double-loaded-lodging' },
});

assert.equal(plan.floors.length, 10, 'tower plan should retain all ten occupied floors');
const upper = plan.floors[5];
const hallway = upper.spaces.find(space => space.circulationShape === 'occupancy-hallway');
const occupancies = upper.spaces.filter(space => space.repeat && space.role === 'private');
assert.ok(hallway, 'large upper residential floor must have a real occupancy hallway');
assert.ok(occupancies.length >= 4 && occupancies.length <= 10,
  `large upper floor should retain 4-10 full occupancies, got ${occupancies.length}`);
assert.ok(hallway.cellCount >= occupancies.length + 2,
  `hallway should own enough cells for room frontage/turning, got ${hallway.cellCount} for ${occupancies.length} occupancies`);
for (const room of occupancies) {
  assert.ok(room.realizedArea + 1e-7 >= room.minimumArea, `${room.id}: occupancy squeezed below full-room minimum`);
  const direct = upper.edges.some(edge =>
    (edge.a === hallway.key && edge.b === room.key) || (edge.b === hallway.key && edge.a === room.key));
  assert.equal(direct, true, `${room.id}: occupancy must open directly to the hallway topology`);
}
assert.equal(upper.diagnostics.occupancyHallway?.directlyServedOccupancyCount, occupancies.length,
  'hallway diagnostics must prove direct service to every retained occupancy');

const promoted = promoteBuildingPlanAuthority(plan, {
  coreReservationId: stair.id,
  coreReservation: stair,
  chunkKey: 'cut13-03-tower',
  entityId: 'cut13-03-residential-tower',
});
assert.equal(assertBuildingPlanAuthority(promoted), true,
  'large hallway/occupancy tower must promote cleanly to Building Plan authority');

console.log('[cut13-building-floorplates-robustness-selftest] PASS', {
  compoundTargets: '20..48 (4x prior target volume)',
  tallTowerPlate: '4-5 connected modules',
  upperOccupancies: occupancies.length,
  hallwayCells: hallway.cellCount,
  bootFailurePolicy: 'local terminal skip',
});
