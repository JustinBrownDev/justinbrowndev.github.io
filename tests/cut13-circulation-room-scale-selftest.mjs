import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayerPhysics } from '../player-physics.js';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import { planAlternatingFacadeStair } from '../world/facade-stair-authority.js';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { assertBuildingPlanAuthority, promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineSource = fs.readFileSync(path.join(repo, 'kowloon-fabric-engine.js'), 'utf8');
const sidecarSource = fs.readFileSync(path.join(repo, 'world/architecture/building-plan-sidecar.js'), 'utf8');

assert.match(engineSource, /topPlateRaised/,
  'massing must record the companion module raised beside a stair-only top floor');
assert.match(engineSource, /stair tower with no usable floor[\s\S]*companion\.floors = primaryModule\.floors/,
  'top occupied floor must keep usable plate beside the vertical spine');
assert.match(engineSource, /addRectPlatform\([^\n]+supportKind, 0\);/,
  'notched floor pieces must opt out of invisible platform edge forgiveness');
assert.match(sidecarSource, /stairClearWidth \* 1\.35, 1\.20, 1\.55/,
  'interior stair apron must reserve visual wiggle room');
assert.match(sidecarSource, /coalesce one non-root route role/,
  'constrained floor plans must coalesce redundant entry\/circulation before squeezing rooms');
assert.doesNotMatch(sidecarSource, /maximumPlacementAttempts/,
  'minimum-room repair must replan until stable rather than stop on a stale bounded attempt');

const truth = resolvePhysicalTruth({
  physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.35,
  stableKey: 'cut13-circulation-room-scale',
});
const facade = planAlternatingFacadeStair({
  routeId: 'cut13:roomy-facade',
  fp: { cx: 0, cz: 0, halfX: 14, halfZ: 8 },
  side: 'north', floors: 3, floorH: 3.2, physicalTruth: truth,
  stableKey: 'cut13:roomy-facade', maxRun: 7,
});
assert.ok(facade, 'generous facade should still accept the canonical stair');
assert.ok(facade.landings.every(landing => landing.tangentSize + 1e-9 >= facade.clearWidth * 1.55),
  'landings need more than technical stair width for turning/approach space');
assert.ok(facade.landingNormalSize + 1e-9 >= facade.clearWidth * 2 + 0.20,
  'two stair lanes need a visible human gap between them');

const position = { x: 0, y: 6.65, z: 0 };
const exactPlatform = { x: 0, z: 0, hx: 1, hz: 1, y: 5, supportKind: 'notched-floor-piece', supportMargin: 0 };
const physics = createPlayerPhysics({
  position,
  worldToCell: () => ({ col: 0, row: 0 }),
  grid: [[true]],
  buildingWallSegments: new Map(),
  propColliders: [],
  elevatedPlatforms: [exactPlatform],
  rampRuns: [],
  overheadCeilings: [],
});
assert.equal(physics.supportHeightAt(0.99, 0, 6), 5, 'visible slab interior remains supporting');
assert.equal(physics.supportHeightAt(1.05, 0, 6), 0, 'support ends at the visible carved edge instead of bridging the hole invisibly');

const stair = {
  id: 'cut13:stair-shaft', kind: 'stair-shaft', x: 0, z: 0,
  halfX: 0.58, halfZ: 2.35, openingWidth: 1.16, openingDepth: 4.70,
  rampHalfWidth: 0.45, yMin: 0, yMax: 12,
};
const planTruth = {
  schema: 'jweb.physical-truth.v1',
  floorHeight: { realizedSI: 3.15 },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};
const constrained = planBuildingSidecar({
  worldSeed: 0x1302,
  chunkKey: 'spawn-cut13', chunkX: 0, chunkZ: 0, isSpawn: true,
  entityId: 'cut13-constrained-plan',
  programHint: 'residential-lodging',
  physicalUse: { family: 'residential-lodging' },
  physicalTruth: planTruth,
  floorHeight: 3.15,
  modules: [
    { key: '0,0', cx: -2.75, cz: 0, halfX: 2.75, halfZ: 3.0, floors: 2 },
    { key: '1,0', cx: 2.75, cz: 0, halfX: 2.75, halfZ: 3.0, floors: 2 },
  ],
  accessAnchors: [{ id: 'main', kind: 'main-entry', x: -4.5, z: -3.0, side: 'north', floor: 0 }],
  circulationReservations: [stair],
});
for (const floor of constrained.floors) {
  assert.equal(floor.diagnostics.minimumAreaHealthy, true, `floor ${floor.floor}: minimum area`);
  assert.equal(floor.diagnostics.minimumVolumeHealthy, true, `floor ${floor.floor}: minimum volume`);
  assert.equal(floor.diagnostics.minimumProgramShortfallCells, 0, `floor ${floor.floor}: no minimum program shortfall`);
  for (const space of floor.spaces) {
    assert.ok(space.realizedArea + 1e-7 >= space.minimumArea, `${space.id}: area squeezed`);
    assert.ok(space.realizedVolume + 1e-7 >= space.minimumVolume, `${space.id}: volume squeezed`);
  }
}
const promoted = promoteBuildingPlanAuthority(constrained, {
  coreReservationId: stair.id,
  coreReservation: stair,
  chunkKey: 'spawn-cut13',
  entityId: 'cut13-constrained-plan',
});
assert.equal(assertBuildingPlanAuthority(promoted), true,
  'constrained plan must reach authority promotion without a human-scale assertion crash');

console.log('[cut13-circulation-room-scale-selftest] PASS', {
  topFloor: 'companion plate required',
  circulation: 'larger apron + landing turn space',
  stairHole: 'visible edge equals support edge',
  planner: 'program coalesces before human-scale minimums yield',
});
