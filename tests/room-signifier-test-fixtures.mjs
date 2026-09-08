// tests/room-signifier-test-fixtures.mjs
//
// Shared, NOT a selftest itself: builds representative real BuildingPlans
// (via the actual program-architecture/building-plan-sidecar/building-plan-
// authority pipeline, not a hand-rolled stand-in) for the room-signifier
// test suite. Seed 671278205 per the assignment.

import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';
import { physicalUseFamiliesForProgram } from '../world/physical-use.js';

export const ROOM_SIGNIFIER_TEST_SEED = 671278205;

const floorH = 3.15;
const PHYSICAL_TRUTH = Object.freeze({
  floorHeight: { realizedSI: floorH },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
});

function coreFor(entityId) {
  return {
    id: `${entityId}:core`, kind: 'stair-shaft',
    x: 0, z: 0, halfX: 0.7, halfZ: 1.7, yMin: 0, yMax: 40,
    openingWidth: 1.4, openingDepth: 3.4, rampHalfWidth: 0.6, integratedFloorLanding: true,
  };
}

function wallRunToMazeWall(run) {
  const yMin = run.yBase, yMax = run.yBase + run.height;
  if (run.axis === 'x') return { x1: run.fixedCoord, z1: run.spanA, x2: run.fixedCoord, z2: run.spanB, yMin, yMax, thickness: 0.15 };
  return { x1: run.spanA, z1: run.fixedCoord, x2: run.spanB, z2: run.fixedCoord, yMin, yMax, thickness: 0.15 };
}

/**
 * Build a real, authority-promoted BuildingPlan for a given program, using
 * the actual program-architecture zone templates -- not a synthetic stand-in.
 */
export function buildRepresentativeBuildingPlan(program, {
  worldSeed = ROOM_SIGNIFIER_TEST_SEED,
  entityId = `room-signifier-fixture:${program}`,
  halfX = 9, halfZ = 8, floors = 3,
} = {}) {
  const family = physicalUseFamiliesForProgram(program)[0] ?? 'business';
  const core = coreFor(entityId);
  const anchors = [{ id: `${entityId}:main`, kind: 'main-entry', x: 0, z: halfZ, side: 'south', floor: 0 }];
  const rawPlan = planBuildingSidecar({
    worldSeed, chunkKey: '0,0', chunkX: 0, chunkZ: 0, entityId,
    programHint: program, physicalUse: { family }, physicalTruth: PHYSICAL_TRUTH, floorHeight: floorH,
    modules: [{ key: 'main', cx: 0, cz: 0, halfX, halfZ, floors }],
    accessAnchors: anchors, circulationReservations: [core],
  });
  const buildingPlan = promoteBuildingPlanAuthority(rawPlan, {
    coreReservationId: core.id, coreReservation: core, chunkKey: '0,0', entityId,
  });

  const interiorWalls = (buildingPlan.wallRuns ?? []).map(wallRunToMazeWall);
  // Exterior shell: compileBuildingPlanWallRuns only emits INTERIOR partition
  // edges (space-plan.js only synthesizes boundary segments for legacy,
  // non-'building-plan' plans) -- so a representative fixture needs its own
  // outer envelope walls per floor, one rectangle per module floor range.
  const floorsSeen = new Set((buildingPlan.topologySpaces ?? []).map(s => s.floor));
  const shellWalls = [...floorsSeen].flatMap(floor => {
    const yBase = floor * floorH;
    const yMin = yBase, yMax = yBase + floorH;
    return [
      { x1: -halfX, z1: -halfZ, x2: halfX, z2: -halfZ, yMin, yMax, thickness: 0.2 },
      { x1: -halfX, z1: halfZ, x2: halfX, z2: halfZ, yMin, yMax, thickness: 0.2 },
      { x1: -halfX, z1: -halfZ, x2: -halfX, z2: halfZ, yMin, yMax, thickness: 0.2 },
      { x1: halfX, z1: -halfZ, x2: halfX, z2: halfZ, yMin, yMax, thickness: 0.2 },
    ];
  });
  // Upper-floor boxes require platform support in space-plan.js's
  // boxSupported(); floor 0 is always considered supported (real ground).
  // One platform per space's own footprint is the simplest honest fixture.
  const platforms = (buildingPlan.topologySpaces ?? [])
    .filter(space => space.floor > 0)
    .map(space => ({
      x: (space.bounds.minX + space.bounds.maxX) / 2, z: (space.bounds.minZ + space.bounds.maxZ) / 2,
      hx: (space.bounds.maxX - space.bounds.minX) / 2 + 0.05, hz: (space.bounds.maxZ - space.bounds.minZ) / 2 + 0.05,
      y: space.yBase,
    }));

  const entity = { id: entityId, kind: 'building', buildingPlan };
  const payload = { entities: [entity], physics: { mazeWalls: [...interiorWalls, ...shellWalls], props: [], circulationReservations: [], platforms } };
  const chunk = { key: '0,0' };
  return { buildingPlan, entity, payload, chunk, program, family };
}

// Representative program families the assignment explicitly asks for
// (section 34): apartment/domestic, office, retail, food service, clinic,
// laboratory, warehouse, server facility, utility, industrial/workshop --
// plus at least one legacy-recipe-only program with no dedicated
// program-architecture profile (library), as a valuable fallback case.
export const REPRESENTATIVE_PROGRAMS = Object.freeze([
  'apartment', 'office', 'grocery', 'diner', 'clinic',
  'laboratory', 'warehouse', 'server_room', 'boiler_room', 'auto_shop',
]);

export const LEGACY_RECIPE_ONLY_PROGRAM = 'library';
