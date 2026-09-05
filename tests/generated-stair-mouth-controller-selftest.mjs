import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const url = rel => pathToFileURL(path.join(repo, rel)).href;

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [{ createKowloonFabricEngine }, THREE, stream, { createPlayerPhysics }] = await Promise.all([
  import(url('kowloon-fabric-engine.js') + '?generated-stair-mouth-controller-selftest=1'),
  import(url('vendor/three/three.module.js') + '?generated-stair-mouth-controller-selftest=1'),
  import(url('world-chunk-streamer.js') + '?generated-stair-mouth-controller-selftest=1'),
  import(url('player-physics.js') + '?generated-stair-mouth-controller-selftest=1'),
]);

const worldSeed = 0x73A1B00C;
const scene = new THREE.Scene();
const publishStub = {
  registerOwnedWorld() { return { activationState: 'active', deferredReason: null }; },
  unregisterOwnedWorld() { return true; },
};
const engine = createKowloonFabricEngine({
  THREE, scene, playerPhysics: publishStub, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize: 64, landmarkSpacingChunks: 4, yieldControl: null,
});
const chunk = {
  key: '2,2', x: 2, z: 2, centerX: 128, centerZ: 128,
  seed: stream.deterministicChunkSeed(worldSeed, 2, 2),
  weirdness: stream.worldWeirdnessAt(2, 2, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await engine.build(chunk);

const position = { x: 9999, y: 1.65, z: 9999 };
const controller = createPlayerPhysics({
  position,
  worldToCell: () => ({ col: 0, row: 0 }),
  grid: [[true]],
  buildingWallSegments: new Map(),
  propColliders: [], elevatedPlatforms: [], rampRuns: [], overheadCeilings: [],
  boundsHalf: Infinity,
});
controller.registerOwnedWorld('generated-chunk', payload.physics);

function pointOn(ramp, along) {
  return ramp.axis === 'x'
    ? { x: along, z: ramp.fixedCoord }
    : { x: ramp.fixedCoord, z: along };
}
function commands(ramp, sign, count = 80, speed = 1.2) {
  return Array.from({ length: count }, () => ({
    dt: 1 / 60,
    wishVelocityX: ramp.axis === 'x' ? sign * speed : 0,
    wishVelocityZ: ramp.axis === 'z' ? sign * speed : 0,
  }));
}
function slope(ramp) {
  return Math.abs((Number(ramp.y1) - Number(ramp.y0)) / (Number(ramp.to) - Number(ramp.from)));
}
function probeRamp(ramp, kind) {
  const rising = ramp.y1 >= ramp.y0;
  const lowAlong = rising ? ramp.from : ramp.to;
  const highAlong = rising ? ramp.to : ramp.from;
  const lowY = Math.min(ramp.y0, ramp.y1);
  const highY = Math.max(ramp.y0, ramp.y1);
  const direction = Math.sign(highAlong - lowAlong) || 1;
  const endpointOverlap = Math.max(0.04, Math.min(0.10, Number(ramp.supportMargin) || 0.06));

  const descending = controller.probeControllerPath({
    start: { ...pointOn(ramp, highAlong + direction * endpointOverlap), feetY: highY },
    steps: commands(ramp, -direction),
  });
  const ascending = controller.probeControllerPath({
    start: { ...pointOn(ramp, lowAlong - direction * endpointOverlap), feetY: lowY },
    steps: commands(ramp, direction),
  });

  for (const [label, result] of [['descending', descending], ['ascending', ascending]]) {
    assert.equal(result.validStart, true, `${kind}: ${label} start must be a valid real generated pose`);
    assert.equal(result.validEnd, true, `${kind}: ${label} must remain a valid real generated pose`);
    assert.ok(result.distance > 1.45,
      `${kind}: ${label} must traverse well past the old ~22cm stair-mouth wedge; distance=${result.distance}`);
    assert.equal(result.end.grounded, true, `${kind}: ${label} should remain grounded on the generated flight`);
  }
  assert.ok(descending.end.feetY < highY - 0.30,
    `${kind}: descending feet must follow the ramp instead of riding the upper slab; ${descending.end.feetY} vs ${highY}`);
  assert.ok(ascending.end.feetY > lowY + 0.30,
    `${kind}: ascending feet must climb the ramp; ${ascending.end.feetY} vs ${lowY}`);

  return {
    kind,
    slope: Number(slope(ramp).toFixed(3)),
    supportMargin: ramp.supportMargin ?? null,
    downDistance: Number(descending.distance.toFixed(2)),
    upDistance: Number(ascending.distance.toFixed(2)),
    downDeltaY: Number((highY - descending.end.feetY).toFixed(2)),
    upDeltaY: Number((ascending.end.feetY - lowY).toFixed(2)),
  };
}

const familyKinds = [
  'compound-stair',
  'broad-vertical-stair',
  'scaffold',
  'exterior-transport-stair',
];
const probes = [];
for (const kind of familyKinds) {
  const ramps = (payload.physics.ramps ?? [])
    .filter(ramp => ramp.supportKind === kind)
    .sort((a, b) => slope(b) - slope(a));
  assert.ok(ramps.length > 0, `${chunk.key}: deterministic fixture must emit ${kind}`);
  probes.push(probeRamp(ramps[0], kind));
}

// Catch the second real failure mode: a selected roof/catwalk stair whose run is
// physically covered by a third upper transport slab. Ask supportAt from the
// upper-flight elevation so any hidden high platform wins exactly as it did for
// the live controller, then compare it with the ramp's local height.
let transportSamples = 0;
for (const ramp of (payload.physics.ramps ?? []).filter(item => item.supportKind === 'exterior-transport-stair')) {
  const highY = Math.max(Number(ramp.y0), Number(ramp.y1));
  for (const t of [0.25, 0.5, 0.75]) {
    const along = Number(ramp.from) + (Number(ramp.to) - Number(ramp.from)) * t;
    const rampY = Number(ramp.y0) + (Number(ramp.y1) - Number(ramp.y0)) * t;
    const point = pointOn(ramp, along);
    const support = controller.supportHeightAt(point.x, point.z, highY);
    assert.ok(support <= rampY + 0.08,
      `${ramp.transportLinkId}: hidden upper support covers stair at t=${t}; support=${support}, ramp=${rampY}`);
    transportSamples++;
  }
}
assert.ok(transportSamples > 0);
assert.equal(payload.physics.exteriorTransportNetwork?.closure?.unreachableRequired, 0,
  'physically rejected stair links must not remain as fake required/reachable graph edges');

console.log('[generated-stair-mouth-controller-selftest] PASS', {
  chunk: chunk.key,
  probes,
  transportSamples,
  closure: payload.physics.exteriorTransportNetwork?.closure ?? null,
  invariant: 'real emitted platforms + ramps + controller traverse both stair mouths; no selected transport stair runs under a third support slab',
});

engine.disposeShared();
