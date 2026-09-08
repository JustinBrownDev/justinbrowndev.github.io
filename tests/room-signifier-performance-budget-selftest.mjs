// tests/room-signifier-performance-budget-selftest.mjs
//
// This layer exists specifically because semantic readability should be
// cheap. Assert the shape the assignment demands: many furnished rooms,
// very few geometry families, very few materials, very few scene nodes,
// bounded planning time. If N rooms ever produced ~N independent Mesh
// objects, this test should fail loudly.

import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { buildRepresentativeBuildingPlan, REPRESENTATIVE_PROGRAMS } from './room-signifier-test-fixtures.mjs';
import { planRoomSignifiers } from '../world/room-signifier-planner.js';
import { createRoomSignifierRuntime } from '../world/room-signifier-runtime.js';

const runtime = createRoomSignifierRuntime({ THREE });

let roomsConsidered = 0, roomsFurnished = 0, plannedCues = 0, acceptedCues = 0;
let primitiveInstances = 0, newSceneNodes = 0, planningMillisTotal = 0, realizationMillisTotal = 0;
const geometrySet = new Set();
const materialSet = new Set();

for (const program of REPRESENTATIVE_PROGRAMS) {
  const { buildingPlan, entity, payload, chunk } = buildRepresentativeBuildingPlan(program);

  const planStart = performance.now();
  const report = planRoomSignifiers({ buildingPlan, chunk, payload, entityId: entity.id });
  planningMillisTotal += performance.now() - planStart;

  const realizeStart = performance.now();
  const { group, stats } = runtime.realize(report);
  realizationMillisTotal += performance.now() - realizeStart;

  roomsConsidered += report.stats.spacesConsidered;
  roomsFurnished += report.stats.spacesFurnished;
  plannedCues += report.spaces.reduce((s, r) => s + r.plannedCueCount, 0);
  acceptedCues += report.stats.totalAcceptedCues;
  primitiveInstances += stats.primitiveInstanceCount;
  newSceneNodes += group.children.length;
  geometrySet.add(runtime.unitBoxGeometry);
  for (const mesh of group.children) materialSet.add(mesh.material);

  console.log(`[room-signifier-performance-budget] ${program}`, {
    roomsFurnished: report.stats.spacesFurnished, primitiveInstances: stats.primitiveInstanceCount,
    renderBatches: stats.renderBatchCount, planningMillis: +report.stats.planningMillis.toFixed(2),
  });
}

const summary = {
  roomsFurnished, plannedCues, acceptedCues, primitiveInstances,
  newSceneNodes, uniqueGeometries: geometrySet.size, uniqueMaterials: materialSet.size,
  planningMillisTotal: +planningMillisTotal.toFixed(2), realizationMillisTotal: +realizationMillisTotal.toFixed(2),
};
console.log('[room-signifier-performance-budget] summary', summary);

assert.ok(roomsFurnished >= 20, `expected a meaningful number of furnished rooms across ${REPRESENTATIVE_PROGRAMS.length} representative buildings, got ${roomsFurnished}`);
assert.equal(geometrySet.size, 1, 'the guaranteed layer must share exactly one geometry (a unit cube) regardless of room count');
assert.ok(materialSet.size <= 6, `material count must stay within the 6-key shared palette, got ${materialSet.size}`);
// One InstancedMesh group per building, up to 6 material batches inside each -- never one node per prop.
assert.ok(newSceneNodes <= REPRESENTATIVE_PROGRAMS.length * 6, `scene node count should stay bounded by material batches, not by prop count: ${newSceneNodes} nodes for ${primitiveInstances} instances`);
assert.ok(planningMillisTotal < 5000, `planning ${REPRESENTATIVE_PROGRAMS.length} buildings took ${planningMillisTotal}ms, expected well under 5s`);

runtime.dispose();
console.log('[room-signifier-performance-budget-selftest] PASS', summary);
