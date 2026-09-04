import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import {
  createStairShaftReservation,
  reservationContainsRamp,
  reservationCutForAxisSegment,
  reservationIntersectsBox,
} from '../world/circulation-reservations.js';

// Contract-level check first: one reservation is a 3D authority volume, not a
// decorative hint. A divider crossing the shaft gets a deterministic cut.
const contract = createStairShaftReservation({
  id: 'selftest:shaft', x: 0, z: 0,
  openingWidth: 2.4, openingDepth: 3.6,
  baseY: 0, roofY: 9.45, exitHeadroom: 2.1,
  rampAxis: 'z', rampFrom: -1.5, rampTo: 1.5, rampHalfWidth: 0.8,
});
assert.equal(reservationIntersectsBox(contract, { x: 0, z: 0, sx: 0.5, sz: 0.5, yMin: 1, yMax: 2 }), true);
assert.equal(reservationIntersectsBox(contract, { x: 4, z: 0, sx: 0.5, sz: 0.5, yMin: 1, yMax: 2 }), false);
assert.equal(
  reservationIntersectsBox(contract, { x: 0, z: 0, halfX: 0.5, halfZ: 0, yMin: 1, yMax: 2 }),
  true,
  'planar render/detail bounds must remain valid spatial-claim intersection queries',
);
assert.deepEqual(
  reservationCutForAxisSegment(contract, { axis: 'x', fixedCoord: 0, from: -4, to: 4, yMin: 0, yMax: 3 }),
  { from: -1.2, to: 1.2 },
  'partition crossing a shaft must be cut to the shaft opening',
);

const worldSeed = 671278205;
const scene = new THREE.Scene();
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data) { owners.set(id, data); return { activationState: 'active' }; },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize: 64, landmarkSpacingChunks: 3, yieldControl: null,
});
function chunk(x, z) {
  return {
    key: `${x},${z}`, x, z,
    centerX: x * 64, centerZ: z * 64,
    seed: deterministicChunkSeed(worldSeed, x, z),
    weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
}

const payload = await factory.build(chunk(16, 0));
const reservations = payload.physics.circulationReservations;
const shafts = reservations.filter(r => r.kind === 'stair-shaft');
const slabOpenings = reservations.filter(r => r.kind === 'stair-slab-opening');
const scaffoldRamps = reservations.filter(r => r.kind === 'scaffold-ramp');
const mezzanineRamps = reservations.filter(r => r.kind === 'mezzanine-ramp');
assert.ok(shafts.length >= payload.buildings, 'every generated building must publish a structural stair-shaft reservation');
assert.equal(slabOpenings.length, shafts.length, 'every structural stair shaft must publish one distinct slab-opening reservation');
assert.ok(scaffoldRamps.length > 0, 'exterior scaffold circulation must also be represented as reservations');
assert.ok(payload.entities.filter(e => e.kind === 'building').every(e => e.circulationReservationCount >= 1), 'building metadata must expose reservation ownership');

// Every physical stair/ramp must be contained by a matching reservation. This is
// the core P5 rule: traversal volume is planned first and geometry lives inside it.
for (const ramp of payload.physics.ramps.filter(r => r.supportKind === 'compound-stair')) {
  const matches = shafts.filter(reservation => reservationContainsRamp(reservation, ramp));
  assert.equal(matches.length, 1, 'each compound stair flight must belong to exactly one stair reservation');
}
for (const ramp of payload.physics.ramps.filter(r => r.supportKind === 'scaffold')) {
  assert.ok(scaffoldRamps.some(reservation => reservationContainsRamp(reservation, ramp)), 'each scaffold flight must have a capsule-clearance reservation');
}
for (const ramp of payload.physics.ramps.filter(r => r.supportKind === 'mezzanine-stair')) {
  assert.ok(mezzanineRamps.some(reservation => reservationContainsRamp(reservation, ramp)), 'each mezzanine ramp must have a capsule-clearance reservation');
}

// The old failure was a final stair flight arriving under a monolithic roof.
// Check collision slabs at every stair arrival height, including the roof.
let roofArrivalsChecked = 0;
for (const shaft of shafts) {
  const opening = slabOpenings.find(item => item.fullReservationId === shaft.id);
  assert.ok(opening, `shaft ${shaft.id} must own a published slab-opening reservation`);
  const flights = payload.physics.ramps.filter(r => r.supportKind === 'compound-stair' && reservationContainsRamp(shaft, r));
  assert.ok(flights.length > 0, `shaft ${shaft.id} must own at least one stair flight`);
  const arrivals = new Set(flights.map(r => r.y1));
  assert.ok(arrivals.has(shaft.roofY), `shaft ${shaft.id} must actually reach its roof`);
  roofArrivalsChecked++;
  for (const y of arrivals) {
    for (const platform of payload.physics.platforms) {
      if (Math.abs(platform.y - y) > 1e-6) continue;
      if (String(platform.supportKind ?? '').startsWith('compound-stair')) continue;
      assert.equal(
        reservationIntersectsBox(opening, { x: platform.x, z: platform.z, hx: platform.hx, hz: platform.hz, yMin: y - 0.02, yMax: y + 0.02 }),
        false,
        `floor/roof collision must preserve the published slab opening at y=${y} for ${shaft.id}`,
      );
    }
  }
}
assert.ok(roofArrivalsChecked > 0);

// Check the batched render slabs too, so render and collision are derived from the
// same opening. Only test slabs crossing stair arrival planes; the ground curb is
// intentionally below the first flight and is not a headroom obstruction.
const slabMeshes = payload.root.children.filter(child => child.isInstancedMesh && child.name.includes('-slabs'));
assert.ok(slabMeshes.length > 0, 'built chunk must expose batched slab render geometry');
const matrix = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scale = new THREE.Vector3();
for (const shaft of shafts) {
  const opening = slabOpenings.find(item => item.fullReservationId === shaft.id);
  assert.ok(opening, `shaft ${shaft.id} must own a published slab-opening reservation`);
  const arrivals = payload.physics.ramps
    .filter(r => r.supportKind === 'compound-stair' && reservationContainsRamp(shaft, r))
    .map(r => r.y1)
    .filter(y => payload.physics.platforms.some(platform =>
      Math.abs(platform.y - y) <= 1e-6
      && !String(platform.supportKind ?? '').startsWith('compound-stair')));
  for (const mesh of slabMeshes) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      matrix.decompose(pos, quat, scale);
      const halfY = Math.abs(scale.y) * 0.5;
      if (!arrivals.some(y => pos.y - halfY <= y + 1e-6 && pos.y + halfY >= y - 1e-6)) continue;
      const slabMinX = pos.x - Math.abs(scale.x) * 0.5;
      const slabMaxX = pos.x + Math.abs(scale.x) * 0.5;
      const slabMinZ = pos.z - Math.abs(scale.z) * 0.5;
      const slabMaxZ = pos.z + Math.abs(scale.z) * 0.5;
      const overlapX = Math.min(slabMaxX, opening.maxX) - Math.max(slabMinX, opening.minX);
      const overlapZ = Math.min(slabMaxZ, opening.maxZ) - Math.max(slabMinZ, opening.minZ);
      assert.ok(
        overlapX <= 1e-3 || overlapZ <= 1e-3,
        `render slab must preserve stair opening for ${shaft.id}; overlap=${overlapX.toFixed(6)}x${overlapZ.toFixed(6)}`,
      );
    }
  }
}

// Interior room dividers and optional structural weirdness must lose conflicts.
for (const shaft of shafts) {
  for (const wall of payload.physics.mazeWalls.filter(w => ['partition', 'building-plan-partition'].includes(w.supportKind))) {
    const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.z2 - wall.z1);
    const x = (wall.x1 + wall.x2) * 0.5;
    const z = (wall.z1 + wall.z2) * 0.5;
    const hx = horizontal ? Math.abs(wall.x2 - wall.x1) * 0.5 : 0.071;
    const hz = horizontal ? 0.071 : Math.abs(wall.z2 - wall.z1) * 0.5;
    assert.equal(
      reservationIntersectsBox(shaft, { x, z, hx, hz, yMin: wall.yMin, yMax: wall.yMax }),
      false,
      `partition must not cross reserved stair volume ${shaft.id}`,
    );
  }
  for (const prop of payload.physics.props.filter(p => ['interior-clutter', 'service-core', 'rooftop-mechanical'].includes(p.supportKind))) {
    assert.equal(
      reservationIntersectsBox(shaft, {
        x: prop.x, z: prop.z, hx: prop.radius, hz: prop.radius,
        yMin: prop.yMin ?? 0, yMax: prop.height ?? Infinity,
      }),
      false,
      `${prop.supportKind} must yield to reserved stair volume ${shaft.id}`,
    );
  }
}

console.log('[circulation-reservation-selftest] PASS', {
  buildings: payload.buildings,
  stairShafts: shafts.length,
  slabOpenings: slabOpenings.length,
  scaffoldRamps: scaffoldRamps.length,
  mezzanineRamps: mezzanineRamps.length,
  reservations: reservations.length,
  roofArrivalsChecked,
});
