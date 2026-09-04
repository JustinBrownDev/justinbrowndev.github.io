import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { computeKowloonSlabRect, KOWLOON_WALL_HALF } from '../world/kowloon-geometry-contract.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

assert.equal(typeof computeKowloonSlabRect, 'function', 'shared slab geometry contract must remain exported');
assert.ok(Number.isFinite(KOWLOON_WALL_HALF) && KOWLOON_WALL_HALF > 0,
  'wall-half seam clearance must remain a positive shared constant');

const edges = { N: 'street', S: 'street', W: 'street', E: 'internal' };
const reverseEdges = { N: 'street', S: 'street', W: 'internal', E: 'street' };
const left = { key: '0,0', cell: { col: 0, row: 0 }, edgeKinds: edges, floors: 3, rect: { cx: 0, cz: 0, halfX: 1, halfZ: 1 } };
const right = { key: '1,0', cell: { col: 1, row: 0 }, edgeKinds: reverseEdges, floors: 3, rect: { cx: 2, cz: 0, halfX: 1, halfZ: 1 } };
const sameHeight = new Map([[left.key, left], [right.key, right]]);
const leftRoof = computeKowloonSlabRect(left, sameHeight, 3, { roof: true });
const rightRoof = computeKowloonSlabRect(right, sameHeight, 3, { roof: true });
assert.ok(Math.abs(leftRoof.x1 - rightRoof.x0) < 1e-12,
  'same-height neighboring roof plates must meet exactly at the shared seam');
assert.ok(leftRoof.x1 <= rightRoof.x0, 'same-height neighboring roof plates must never overlap');

const lower = { ...left, floors: 2 };
const taller = { ...right, floors: 4 };
const setback = new Map([[lower.key, lower], [taller.key, taller]]);
const lowerRoof = computeKowloonSlabRect(lower, setback, 2, { roof: true });
const sharedSeamX = lower.rect.cx + lower.rect.halfX;
assert.ok(Math.abs((sharedSeamX - lowerRoof.x1) - KOWLOON_WALL_HALF) < 1e-12,
  'a lower roof beside a taller module must stop one wall-half before the vertical shell');

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
const chunk = {
  key: '16,0', x: 16, z: 0,
  centerX: 16 * 64, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 16, 0),
  weirdness: worldWeirdnessAt(16, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await factory.build(chunk);

function verifySurfacePacket(physics, label, { requireCeiling = false } = {}) {
  const claims = physics?.structuralSurfaceClaims ?? [];
  const openings = physics?.circulationReservations?.filter(item => item.kind === 'stair-slab-opening') ?? [];
  assert.ok(claims.length > 0, `${label}: structural shell must publish explicit surface claims`);
  const kinds = new Set(claims.map(claim => claim.kind));
  assert.ok(kinds.has('occupied-floor-surface'), `${label}: occupied floors must be distinct structural truth`);
  assert.ok(kinds.has('roof-surface'), `${label}: roofs must be distinct structural truth`);
  if (requireCeiling) assert.ok(kinds.has('ceiling-surface'), `${label}: hanging module tip must be explicit ceiling truth`);
  else assert.ok(kinds.has('foundation-surface'), `${label}: ordinary base must be explicit foundation truth`);

  for (const claim of claims) {
    assert.equal(claim.schema, 'jweb.structural-surface-claim.v1');
    assert.ok(['occupied-floor-surface', 'roof-surface', 'foundation-surface', 'ceiling-surface'].includes(claim.kind),
      `${label}: unknown structural surface kind ${claim.kind}`);
    assert.ok(['occupied-floor', 'roof', 'foundation', 'ceiling'].includes(claim.surfaceAuthority),
      `${label}: missing structural surface authority`);
    assert.equal(claim.visualMassKind, 'structural-slab-mass');
    assert.equal(claim.visualSurfaceKind, 'visual-shell-surface');
    assert.equal(claim.collisionKind, 'platform');
    assert.ok([claim.x, claim.z, claim.width, claim.depth, claim.y].every(Number.isFinite), `${label}: claim geometry must be finite`);
    assert.ok(claim.width > 0 && claim.depth > 0, `${label}: claim geometry must have positive area`);
    if (claim.openingReservationId) {
      assert.ok(openings.some(opening => opening.id === claim.openingReservationId),
        `${label}: structural opening must reference a published stair-slab-opening reservation`);
    }
  }

  const referencedOpenings = new Set(claims.map(claim => claim.openingReservationId).filter(Boolean));
  for (const opening of openings) {
    assert.ok(referencedOpenings.has(opening.id), `${label}: published stair slab opening must be consumed by structural floor/roof truth`);
  }
  return { claims, openings, kinds };
}

const ground = verifySurfacePacket(payload.physics, 'ground');
const hangingPhysics = payload.hangingLayer?.payload?.physics ?? null;
assert.ok(hangingPhysics, 'two-plane streamed chunk must publish hanging structural physics');
const hanging = verifySurfacePacket(hangingPhysics, 'hanging', { requireCeiling: true });

const partitionWalls = payload.physics.mazeWalls.filter(wall => wall.supportKind === 'building-plan-partition');
assert.ok(partitionWalls.length > 0, 'Building Plan wall runs must remain explicitly partition-owned');

console.log('[structural-shell-seam-guard-selftest] PASS', {
  groundClaims: ground.claims.length,
  groundOpenings: ground.openings.length,
  hangingClaims: hanging.claims.length,
  hangingOpenings: hanging.openings.length,
  partitionWalls: partitionWalls.length,
  invariant: 'occupied floor / ceiling / roof / opening / structural slab mass / visual shell are explicit before realization',
});
