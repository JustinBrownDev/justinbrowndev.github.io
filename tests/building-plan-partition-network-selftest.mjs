import assert from 'node:assert/strict';
import {
  MINIMUM_PARTITION_WALL_RETURN,
  compileBuildingPlanWallRuns,
} from '../world/architecture/building-plan-authority.js';

function space(id, key, regions) {
  return { id, key, role: 'work', spaceType: key, semanticProgram: 'selftest', regions };
}

// Four one-cell spaces create a canonical X junction at (1,1). The graph must
// own that junction explicitly rather than relying on coincident box endpoints.
const xFloor = {
  floor: 0, yBase: 0, floorHeight: 3, rasterCellSize: 1,
  spaces: [
    space('a', 'a', [{ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }]),
    space('b', 'b', [{ minX: 1, maxX: 2, minZ: 0, maxZ: 1 }]),
    space('c', 'c', [{ minX: 0, maxX: 1, minZ: 1, maxZ: 2 }]),
    space('d', 'd', [{ minX: 1, maxX: 2, minZ: 1, maxZ: 2 }]),
  ],
  openings: [],
};
const xPlan = { deterministicKey: 'partition-x', floors: [xFloor] };
compileBuildingPlanWallRuns(xPlan);
assert.equal(xFloor.partitionGraph.vertices.filter(vertex => vertex.type === 'X').length, 1);
assert.equal(xFloor.partitionGraph.diagnostics.unexplainedInteriorDegree1Endpoints, 0);
const xVertex = xFloor.partitionGraph.vertices.find(vertex => vertex.type === 'X');
assert.equal(xVertex.incidentEdgeIds.length, 4, 'X vertex must own all four incident partition edges');

// Exact known failure geometry: a 0.84643152m opening in a 0.91614815m wall
// leaves ~35mm returns. The canonical compiler must refuse to cut that opening.
const shortLength = 0.916148148148153;
const shortFloor = {
  floor: 0, yBase: 0, floorHeight: 3, rasterCellSize: shortLength,
  spaces: [
    space('entry-control-id', 'entry-control', [{ minX: 0, maxX: shortLength, minZ: 0, maxZ: shortLength }]),
    space('control-id', 'control', [{ minX: shortLength, maxX: shortLength * 2, minZ: 0, maxZ: shortLength }]),
  ],
  openings: [{
    id: 'server-regression-door', kind: 'interior-door', fromSpaceKey: 'entry-control', toSpaceKey: 'control',
    axis: 'z', x: shortLength, z: shortLength * 0.5, width: 0.8464315199783847, height: 2.08,
  }],
};
const shortPlan = { deterministicKey: 'partition-short-door', floors: [shortFloor] };
const shortRuns = compileBuildingPlanWallRuns(shortPlan);
const shortRun = shortRuns.find(run => run.spaceKeyPair === 'control|entry-control');
assert.ok(shortRun);
assert.equal(shortRun.gaps.length, 0, 'unsafe doorway must not carve the canonical partition');
assert.equal(shortFloor.openings[0].partitionDisposition, 'rejected-insufficient-wall-return');
assert.equal(shortFloor.partitionGraph.diagnostics.rejectedOpenings, 1);
assert.ok(shortLength < shortFloor.openings[0].width + 2 * MINIMUM_PARTITION_WALL_RETURN);

// A safe wall preserves width and relocates only as much as required to retain
// the hard minimum return on both jamb sides.
const safeFloor = {
  floor: 0, yBase: 0, floorHeight: 3, rasterCellSize: 0.5,
  spaces: [
    space('left-id', 'left', [{ minX: 0, maxX: 1, minZ: 0, maxZ: 2 }]),
    space('right-id', 'right', [{ minX: 1, maxX: 2, minZ: 0, maxZ: 2 }]),
  ],
  openings: [{ id: 'safe-door', kind: 'interior-door', fromSpaceKey: 'left', toSpaceKey: 'right', axis: 'z', x: 1, z: 0.1, width: 0.9, height: 2.05 }],
};
const safePlan = { deterministicKey: 'partition-safe-door', floors: [safeFloor] };
const safeRuns = compileBuildingPlanWallRuns(safePlan);
const safeRun = safeRuns.find(run => run.spaceKeyPair === 'left|right');
const gap = safeRun.gaps[0];
assert.ok(gap);
assert.equal((gap.hi - gap.lo).toFixed(6), (0.9).toFixed(6), 'door clear width must not be globally shrunk');
assert.ok(gap.lo - safeRun.spanA + 1e-7 >= MINIMUM_PARTITION_WALL_RETURN);
assert.ok(safeRun.spanB - gap.hi + 1e-7 >= MINIMUM_PARTITION_WALL_RETURN);
assert.equal(safeFloor.openings[0].partitionDisposition, 'relocated-for-wall-return');

console.log('[building-plan-partition-network-selftest] PASS', {
  xJunctions: 1,
  rejectedUnsafeDoor: shortFloor.openings[0].partitionDisposition,
  safeDoorDisposition: safeFloor.openings[0].partitionDisposition,
  minimumWallReturn: MINIMUM_PARTITION_WALL_RETURN,
});
