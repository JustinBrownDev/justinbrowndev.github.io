import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { BUILDING_SLAB_THICKNESS } from '../world/interior-geometry-policy.js';
import {
  buildTargetCatalog,
  searchTargetCatalog,
  visualFragmentsForBounds,
} from '../tools/visual-harness/visual-probe-core.js';

const worldSeed = 671278205;
const chunkSize = 64;

async function buildChunk(x, z) {
  const scene = new THREE.Scene();
  const playerPhysics = {
    registerOwnedWorld() { return { activationState: 'active' }; },
    unregisterOwnedWorld() { return true; },
  };
  const engine = createKowloonFabricEngine({
    THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
    worldSeed, chunkSize, landmarkSpacingChunks: 3, yieldControl: null,
  });
  const chunk = {
    key: `${x},${z}`, x, z,
    centerX: x * chunkSize, centerZ: z * chunkSize,
    seed: deterministicChunkSeed(worldSeed, x, z),
    weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
  return { chunk, payload: await engine.build(chunk) };
}

function validatePacket(payload, label, { requireCantilever = false } = {}) {
  const closures = payload.physics?.structuralShellClosures ?? [];
  assert.ok(closures.length > 40, `${label}: structural shell must publish closure authority`);
  assert.ok(closures.every(item => item.schema === 'jweb.structural-shell-closure.v1'));
  assert.ok(closures.every(item => item.shellOwnerId && item.shellPieceId && item.shellPieceKind));
  assert.ok(closures.every(item => Number.isFinite(item.yMin) && Number.isFinite(item.yMax) && item.yMax > item.yMin));

  const interstory = closures.filter(item => item.shellPieceKind === 'interstory-closure');
  const roof = closures.filter(item => item.shellPieceKind === 'roof-edge-closure');
  assert.ok(interstory.length > 20, `${label}: floor-to-floor shell bands must be closed explicitly`);
  assert.ok(roof.length > 10, `${label}: roof slab bands must be closed explicitly`);
  for (const item of [...interstory, ...roof]) {
    assert.ok(Math.abs((item.yMax - item.yMin) - BUILDING_SLAB_THICKNESS) < 1e-9,
      `${label}: closure height must equal the structural slab band`);
    assert.equal(item.closureForOffset, 'slab-inner-face');
  }

  const apertureAware = interstory.filter(item => Number(item.closureGapCount) > 0);
  assert.ok(apertureAware.length > 0, `${label}: doorway/portal floors must carve the closure instead of sealing circulation`);

  const cantileverReturns = closures.filter(item => item.closureForOffset === 'cantilever-room');
  if (requireCantilever) assert.ok(cantileverReturns.length >= 6, `${label}: facade juts must get floor/roof return geometry`);

  const jutWalls = (payload.physics?.mazeWalls ?? []).filter(item => item.shellPieceKind === 'facade-jut-wall');
  const byOwner = new Map();
  for (const wall of jutWalls) {
    if (!byOwner.has(wall.shellOwnerId)) byOwner.set(wall.shellOwnerId, { walls: [], closures: [] });
    byOwner.get(wall.shellOwnerId).walls.push(wall);
  }
  for (const closure of cantileverReturns) {
    if (!byOwner.has(closure.shellOwnerId)) byOwner.set(closure.shellOwnerId, { walls: [], closures: [] });
    byOwner.get(closure.shellOwnerId).closures.push(closure);
  }
  for (const [owner, group] of byOwner) {
    if (!group.walls.length) continue;
    assert.ok(group.closures.length >= 6, `${label}: ${owner} must have both floor and roof return pieces`);
    const wallMin = Math.min(...group.walls.map(item => item.yMin));
    const wallMax = Math.max(...group.walls.map(item => item.yMax));
    const lowerReturns = group.closures.filter(item => Math.abs(item.yMax - wallMin) < 1e-9);
    const upperReturns = group.closures.filter(item => Math.abs(item.yMin - wallMax) < 1e-9);
    assert.ok(lowerReturns.length >= 3, `${label}: ${owner} floor slab band must terminate into offset returns`);
    assert.ok(upperReturns.length >= 3, `${label}: ${owner} roof slab band must begin exactly where the wall terminates`);
    assert.ok(group.walls.every(item => item.yMax <= Math.min(...upperReturns.map(ret => ret.yMin)) + 1e-9),
      `${label}: facade-jut walls must not penetrate the roof slab band`);
  }

  payload.root.updateMatrixWorld(true);
  const catalog = buildTargetCatalog(THREE, [{ payload, chunkKey: label }]);
  const closureTarget = searchTargetCatalog(catalog, { kind: 'shell-closure', text: 'facade-offset-return' }, { limit: 1 })[0]
    ?? searchTargetCatalog(catalog, { kind: 'shell-closure' }, { limit: 1 })[0];
  assert.ok(closureTarget, `${label}: harness must expose shell-closure as a first-class target`);
  const fragments = visualFragmentsForBounds(THREE, [payload.root], closureTarget.bounds, { includeInvisible: true });
  assert.ok(fragments.length > 0, `${label}: shell closure target must resolve exact render fragments`);
  assert.ok(fragments.every(fragment => fragment.selectionAuthority === 'exact-structural-instance-ownership-v2'),
    `${label}: shell closure selection must not fall back to AABB neighborhood isolation`);
  const structuralSurface = searchTargetCatalog(catalog, { kind: 'structural-surface' }, { limit: 1 })[0];
  assert.ok(structuralSurface, `${label}: structural floor/roof claims must be targetable by the harness`);

  return {
    closures: closures.length,
    interstory: interstory.length,
    roof: roof.length,
    apertureAware: apertureAware.length,
    cantileverReturns: cantileverReturns.length,
    exactFragments: fragments.reduce((sum, fragment) => sum + (fragment.instanceIndices?.length ?? 1), 0),
  };
}

const ground = await buildChunk(4, 3);
const groundSummary = validatePacket(ground.payload, '4,3-ground', { requireCantilever: true });
const hangingPayload = ground.payload.hangingLayer?.payload;
assert.ok(hangingPayload?.root, 'reported non-spawn chunk must include the hanging structural packet');
const hangingSummary = validatePacket(hangingPayload, '4,3-hanging');

console.log('[geometry-r2c-shell-closure-selftest] PASS', {
  slabThickness: BUILDING_SLAB_THICKNESS,
  ground: groundSummary,
  hanging: hangingSummary,
  invariant: 'walls terminate at slab underside; slab-height shell closures fill exposed bands; offset facade juts use explicit returns; portal throats carve those closures',
});
