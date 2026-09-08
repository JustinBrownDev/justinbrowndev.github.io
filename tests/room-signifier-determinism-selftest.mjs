// tests/room-signifier-determinism-selftest.mjs
//
// Same world seed + same architecture must produce byte-equivalent
// room-signifier planning output: recipe choice, primitive choice, position,
// orientation, scale, and instance count. No nondeterministic iteration
// ordering anywhere in the planner.

import assert from 'node:assert/strict';
import { buildRepresentativeBuildingPlan, REPRESENTATIVE_PROGRAMS } from './room-signifier-test-fixtures.mjs';
import { planRoomSignifiers } from '../world/room-signifier-planner.js';

function round(n) { return Math.round(Number(n) * 1e6) / 1e6; }

function strip(report) {
  return report.spaces.map(space => ({
    spaceId: space.spaceId,
    recipeId: space.recipeId,
    resolutionTier: space.resolutionTier,
    acceptedCueCount: space.acceptedCueCount,
    rejectedCueCount: space.rejectedCueCount,
    rejectionReasons: space.rejectionReasons,
    cues: space.cues.map(cue => ({
      id: cue.id,
      primitiveKind: cue.primitiveKind,
      instances: cue.instances.map(instance => ({
        footprint: {
          x: round(instance.footprintBox.x), z: round(instance.footprintBox.z),
          halfX: round(instance.footprintBox.halfX), halfZ: round(instance.footprintBox.halfZ),
        },
        parts: instance.parts.map(part => ({
          position: { x: round(part.position.x), y: round(part.position.y), z: round(part.position.z) },
          rotationY: round(part.rotationY),
          scale: { x: round(part.scale.x), y: round(part.scale.y), z: round(part.scale.z) },
          materialKey: part.materialKey,
        })),
      })),
    })),
  }));
}

let mismatches = 0;
for (const program of REPRESENTATIVE_PROGRAMS) {
  const a = buildRepresentativeBuildingPlan(program);
  const reportA = planRoomSignifiers({ buildingPlan: a.buildingPlan, chunk: a.chunk, payload: a.payload, entityId: a.entity.id });
  const b = buildRepresentativeBuildingPlan(program);
  const reportB = planRoomSignifiers({ buildingPlan: b.buildingPlan, chunk: b.chunk, payload: b.payload, entityId: b.entity.id });

  const strippedA = JSON.stringify(strip(reportA));
  const strippedB = JSON.stringify(strip(reportB));
  if (strippedA !== strippedB) {
    mismatches++;
    console.log(`[room-signifier-determinism] MISMATCH for ${program}`);
    for (let i = 0; i < Math.max(strippedA.length, strippedB.length); i += 200) {
      if (strippedA.slice(i, i + 200) !== strippedB.slice(i, i + 200)) {
        console.log('  A:', strippedA.slice(i, i + 200));
        console.log('  B:', strippedB.slice(i, i + 200));
        break;
      }
    }
  }
  assert.equal(strippedA, strippedB, `${program}: two independent builds of the same seed must produce structurally identical room-signifier plans`);

  // Also assert planning twice against the SAME already-built payload is
  // idempotent/stable (no hidden mutation of shared state across calls).
  const reportA2 = planRoomSignifiers({ buildingPlan: a.buildingPlan, chunk: a.chunk, payload: a.payload, entityId: a.entity.id });
  assert.equal(JSON.stringify(strip(reportA2)), strippedA, `${program}: re-planning the same payload must be stable`);
}

assert.equal(mismatches, 0);
console.log('[room-signifier-determinism-selftest] PASS', { programsChecked: REPRESENTATIVE_PROGRAMS.length });
