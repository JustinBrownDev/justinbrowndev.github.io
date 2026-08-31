import assert from 'node:assert/strict';
import {
  BUILDING_PLAN_AUTHORITY_SCHEMA,
  assertBuildingPlanAuthority,
  compileBuildingPlanTopologySpaces,
  compileBuildingPlanWallRuns,
  inspectBuildingPlan,
  plannedSpaceAtPoint,
  promoteBuildingPlanAuthority,
} from '../world/architecture/building-plan-authority.js';

function space(id, key, floor, role, spaceType, regions, reservationIds = []) {
  const area = regions.reduce((sum, r) => sum + (r.maxX - r.minX) * (r.maxZ - r.minZ), 0);
  return {
    id, key, floor, role, spaceType, semanticProgram: 'office', source: 'selftest',
    privacy: role === 'private' ? 'private' : 'public', daylight: 'medium',
    regions, structuralReservationIds: reservationIds, realizedArea: area,
    centroid: {
      x: regions.reduce((sum, r) => sum + (r.minX + r.maxX) * 0.5, 0) / regions.length,
      z: regions.reduce((sum, r) => sum + (r.minZ + r.maxZ) * 0.5, 0) / regions.length,
    },
  };
}

function floorPlan(floor, spaces, edges, openings, rootSpaceKey) {
  return {
    floor, yBase: floor * 3, floorHeight: 3, spaces, edges, openings, rootSpaceKey,
    diagnostics: { reachable: true },
  };
}

const stairReservationId = 'test:stair:shaft';
const ground = [
  space('b:f0:lobby', 'lobby', 0, 'entry', 'lobby', [{ minX: 0, maxX: 2, minZ: 0, maxZ: 4 }], [stairReservationId]),
  space('b:f0:corridor', 'corridor', 0, 'circulation', 'corridor', [{ minX: 2, maxX: 3, minZ: 0, maxZ: 4 }], [stairReservationId]),
  space('b:f0:shop', 'shop', 0, 'public', 'shop-floor', [{ minX: 3, maxX: 6, minZ: 0, maxZ: 2 }]),
  space('b:f0:storage', 'storage', 0, 'service', 'storage', [{ minX: 3, maxX: 6, minZ: 2, maxZ: 4 }]),
];
const upper = [
  space('b:f1:landing', 'landing', 1, 'circulation', 'landing', [{ minX: 0, maxX: 3, minZ: 0, maxZ: 2 }], [stairReservationId]),
  space('b:f1:corridor', 'corridor', 1, 'circulation', 'corridor', [{ minX: 0, maxX: 3, minZ: 2, maxZ: 4 }], [stairReservationId]),
  space('b:f1:office-a', 'office-a', 1, 'work', 'office', [{ minX: 3, maxX: 6, minZ: 0, maxZ: 2 }]),
  space('b:f1:office-b', 'office-b', 1, 'work', 'office', [{ minX: 3, maxX: 6, minZ: 2, maxZ: 4 }]),
];

const plan = {
  schema: 'jweb.building-plan-sidecar.v1',
  deterministicKey: '42:0,0:b',
  fingerprint: 'abc12345',
  chunkKey: '0,0',
  entityId: 'b',
  grammar: { id: 'office-selftest', semanticProgram: 'office' },
  envelope: {
    floorCount: 2,
    modules: [
      { key: 'left', cx: 1.5, cz: 2, halfX: 1.5, halfZ: 2, floors: 2 },
      { key: 'right', cx: 4.5, cz: 2, halfX: 1.5, halfZ: 2, floors: 2 },
    ],
  },
  accessAuthority: { anchors: [], circulationReservationIds: [stairReservationId] },
  floors: [
    floorPlan(0, ground, [
      { a: 'lobby', b: 'corridor', source: 'grammar' },
      { a: 'corridor', b: 'shop', source: 'grammar' },
      { a: 'corridor', b: 'storage', source: 'grammar' },
    ], [
      { id: 'd0', kind: 'interior-door', fromSpaceKey: 'lobby', toSpaceKey: 'corridor', axis: 'z', fixedCoord: 2, x: 2, z: 1, width: 0.9, height: 2.05 },
      { id: 'd1', kind: 'interior-door', fromSpaceKey: 'corridor', toSpaceKey: 'shop', axis: 'z', fixedCoord: 3, x: 3, z: 1, width: 0.9, height: 2.05 },
      { id: 'd2', kind: 'interior-door', fromSpaceKey: 'corridor', toSpaceKey: 'storage', axis: 'z', fixedCoord: 3, x: 3, z: 3, width: 0.9, height: 2.05 },
    ], 'lobby'),
    floorPlan(1, upper, [
      { a: 'landing', b: 'corridor', source: 'grammar' },
      { a: 'landing', b: 'office-a', source: 'grammar' },
      { a: 'corridor', b: 'office-b', source: 'grammar' },
    ], [
      { id: 'd3', kind: 'interior-door', fromSpaceKey: 'landing', toSpaceKey: 'corridor', axis: 'x', fixedCoord: 2, x: 1.5, z: 2, width: 0.9, height: 2.05 },
      { id: 'd4', kind: 'interior-door', fromSpaceKey: 'landing', toSpaceKey: 'office-a', axis: 'z', fixedCoord: 3, x: 3, z: 1, width: 0.9, height: 2.05 },
      { id: 'd5', kind: 'interior-door', fromSpaceKey: 'corridor', toSpaceKey: 'office-b', axis: 'z', fixedCoord: 3, x: 3, z: 3, width: 0.9, height: 2.05 },
    ], 'landing'),
  ],
  diagnostics: { topologyHealthy: true, unclaimedRasterCellCount: 0 },
};

const runs = compileBuildingPlanWallRuns(structuredClone(plan));
assert.equal(runs.length, 8, 'all real shared room boundaries should become planned wall runs');
assert.ok(runs.every(run => run.kind === 'planned-interior-wall'));
assert.ok(runs.some(run => run.floor === 0 && run.spaceKeyPair === 'corridor|shop' && run.gaps.some(g => g.openingIds.includes('d1'))));
assert.ok(runs.some(run => run.floor === 1 && run.spaceKeyPair === 'corridor|landing' && run.gaps.some(g => g.openingIds.includes('d3'))));

const topo = compileBuildingPlanTopologySpaces(plan);
assert.equal(topo.length, 8);
assert.deepEqual(topo.find(s => s.id === 'b:f0:shop').moduleKeys, ['right']);
assert.ok(topo.find(s => s.id === 'b:f0:corridor').adjacentSpaceIds.includes('b:f0:storage'));

const promoted = promoteBuildingPlanAuthority(structuredClone(plan), { coreReservationId: stairReservationId });
assert.equal(promoted.authoritySchema, BUILDING_PLAN_AUTHORITY_SCHEMA);
assert.equal(promoted.diagnostics.authorityReady, true);
assert.equal(promoted.verticalCore.floorSpaceIds.length, 2, 'persistent core should select one circulation owner per floor');
assert.equal(promoted.verticalCore.occupiedSpaceIds.length, 4, 'reservation may overlap multiple entry/circulation spaces while retaining one floor owner');
assert.ok(promoted.circulationClearances.length >= 4, 'entry/circulation spaces must publish protected route clearances');
assert.ok(promoted.topologySpaces.filter(space => ['entry', 'circulation'].includes(space.role))
  .every(space => promoted.circulationClearances.some(clearance => clearance.spaceId === space.id)),
' every authored circulation space must own at least one clearance region');
assert.ok(promoted.verticalCore.floorSpaceIds.some(id => id.includes('f0')));
assert.ok(promoted.verticalCore.floorSpaceIds.some(id => id.includes('f1')));
assert.equal(assertBuildingPlanAuthority(promoted), true);
assert.equal(plannedSpaceAtPoint(promoted, { x: 4.5, z: 1, floor: 0 })?.spaceType, 'shop-floor');
assert.equal(plannedSpaceAtPoint(promoted, { x: 4.5, z: 3, floor: 0 })?.spaceType, 'storage');

const inspection = inspectBuildingPlan(promoted);
assert.equal(inspection.floors.length, 2);
assert.equal(inspection.floors[0].spaces.length, 4);
assert.ok(inspection.floors[0].openings.every(opening => opening.fromSpaceId && opening.toSpaceId));

const broken = structuredClone(promoted);
broken.floors[0].edges = [{ a: 'lobby', b: 'corridor', source: 'broken' }];
assert.throws(() => assertBuildingPlanAuthority(broken), /sealed required spaces/);

console.log(JSON.stringify({
  ok: true,
  wallRuns: promoted.wallRuns.length,
  topologySpaces: promoted.topologySpaces.length,
  verticalCoreSpaces: promoted.verticalCore.floorSpaceIds.length,
  inspection,
}, null, 2));
