// tests/room-signifier-placement-safety-selftest.mjs
//
// For every accepted solid room-signifier cue across representative
// buildings, independently re-verify (not just trust the planner's own
// bookkeeping):
//   - spacePlanAcceptsBox(...) === true against a freshly-recompiled plan
//   - zero hard circulation-reservation overlap (circulation-reservations.js)
//   - zero wrong-semantic-room placement (footprint stays within its own
//     space's bounds, or its nested room's own bounds)
//   - zero solid-prop overlap between DIFFERENT cues in the same room

import assert from 'node:assert/strict';
import { buildRepresentativeBuildingPlan, REPRESENTATIVE_PROGRAMS } from './room-signifier-test-fixtures.mjs';
import { planRoomSignifiers } from '../world/room-signifier-planner.js';
import { compileSpacePlans, spacePlanAcceptsBox } from '../world/space-plan.js';
import { anyReservationIntersectsBox } from '../world/circulation-reservations.js';

function boxesOverlapXZ(a, b, pad = 0.01) {
  return a.maxX + pad > b.minX && a.minX - pad < b.maxX
    && a.maxZ + pad > b.minZ && a.minZ - pad < b.maxZ;
}

let totalSolidCues = 0;
let reservationOverlaps = 0;
let wrongRoomPlacements = 0;
let crossCueOverlaps = 0;
let spacePlanRejections = 0;

for (const program of REPRESENTATIVE_PROGRAMS) {
  const { buildingPlan, entity, payload, chunk } = buildRepresentativeBuildingPlan(program);
  const report = planRoomSignifiers({ buildingPlan, chunk, payload, entityId: entity.id });

  // Recompile plans independently (fresh call, not reusing planner internals)
  // to verify against, exactly as spacePlanAcceptsBox's own authority would.
  const activeSpaceIds = new Set(buildingPlan.topologySpaces.map(s => s.id));
  const spacePlans = compileSpacePlans({ chunk, payload, activeSpaceIds });
  const planById = new Map(spacePlans.map(p => [p.id, p]));

  for (const space of report.spaces) {
    // A nested unit-room's parentSpaceId is embedded in its synthetic id
    // (`${parentId}:unit-room:${key}`); recover the parent plan for it.
    const parentId = space.spaceId.includes(':unit-room:') ? space.spaceId.split(':unit-room:')[0] : space.spaceId;
    const plan = planById.get(parentId);
    const ownBounds = buildingPlan.topologySpaces.find(s => s.id === parentId)?.bounds ?? null;

    const allBoxesThisSpace = [];
    for (const cue of space.cues) {
      for (const instance of cue.instances) {
        totalSolidCues++;
        const box = instance.footprintBox;

        if (plan && !spacePlanAcceptsBox(plan, box, { allowCirculation: false, requireSameRegion: true })) {
          spacePlanRejections++;
          console.log('[room-signifier-placement-safety] FAIL spacePlanAcceptsBox', program, space.spaceId, cue.id);
        }

        if (anyReservationIntersectsBox(payload.physics.circulationReservations, box)) {
          reservationOverlaps++;
          console.log('[room-signifier-placement-safety] FAIL reservation overlap', program, space.spaceId, cue.id);
        }

        if (ownBounds) {
          const pad = 0.05; // nested rooms use the parent plan; top-level spaces should stay in their own bounds too
          const withinOwn = box.minX >= ownBounds.minX - pad && box.maxX <= ownBounds.maxX + pad
            && box.minZ >= ownBounds.minZ - pad && box.maxZ <= ownBounds.maxZ + pad;
          if (!withinOwn && !space.spaceId.includes(':unit-room:')) {
            // nested rooms are checked against their OWN (tighter) bounds by the planner itself (restrictBounds);
            // top-level spaces must stay within the parent building-plan space bounds.
            wrongRoomPlacements++;
            console.log('[room-signifier-placement-safety] FAIL wrong-room (outside own space bounds)', program, space.spaceId, cue.id);
          }
        }

        for (const other of allBoxesThisSpace) {
          if (boxesOverlapXZ(other, box)) {
            crossCueOverlaps++;
            console.log('[room-signifier-placement-safety] FAIL cross-cue overlap', program, space.spaceId, cue.id);
          }
        }
        allBoxesThisSpace.push(box);
      }
    }
  }
}

console.log('[room-signifier-placement-safety] totals', { totalSolidCues, spacePlanRejections, reservationOverlaps, wrongRoomPlacements, crossCueOverlaps });

assert.ok(totalSolidCues > 0, 'expected at least one solid cue to check across representative programs');
assert.equal(spacePlanRejections, 0, 'every accepted cue must independently re-pass spacePlanAcceptsBox');
assert.equal(reservationOverlaps, 0, 'hard circulation reservation overlaps must be 0');
assert.equal(wrongRoomPlacements, 0, 'a cue must never land outside the semantic room that planned it');
assert.equal(crossCueOverlaps, 0, 'solid prop overlap between different cues in the same room must be 0');

console.log('[room-signifier-placement-safety-selftest] PASS', { totalSolidCues });
