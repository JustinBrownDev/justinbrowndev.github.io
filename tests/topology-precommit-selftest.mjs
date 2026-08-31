import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { anyReservationIntersectsBox } from '../world/circulation-reservations.js';

const worldSeed = 0x51A7C0DE;
const scene = new THREE.Scene();
const owners = new Map();
let lateAppendCalls = 0;
const playerPhysics = {
  registerOwnedWorld(id, data, lifecycle = {}) {
    const record = { ownerId: id, data, active: true, activationState: 'active', deferredReason: null, onActivationChange: lifecycle.onActivationChange };
    owners.set(id, record);
    return record;
  },
  unregisterOwnedWorld(id) { return owners.delete(id); },
  appendOwnedWorldItem() {
    lateAppendCalls++;
    throw new Error('late appendOwnedWorldItem call is forbidden by topology precommit');
  },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed, chunkSize: 64,
  landmarkSpacingChunks: 4, yieldControl: null,
});

function chunk(x, z) {
  return {
    key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64,
    seed: deterministicChunkSeed(worldSeed, x, z),
    weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
}

function physicsSnapshot(physics) {
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key.startsWith('__physics')) continue;
      out[key] = clean(value[key]);
    }
    return out;
  };
  const topology = {
    platforms: physics.platforms ?? [], ceilings: physics.ceilings ?? [], ramps: physics.ramps ?? [],
    props: physics.props ?? [], mazeWalls: physics.mazeWalls ?? [],
    circulationReservations: physics.circulationReservations ?? [],
    semanticConnectors: physics.semanticConnectors ?? [],
  };
  return JSON.stringify(clean(topology));
}
function digest(physics) { return createHash('sha256').update(physicsSnapshot(physics)).digest('hex'); }

let selected = null;
for (let z = -3; z <= 3 && !selected; z++) {
  for (let x = -3; x <= 3 && !selected; x++) {
    if (x === 0 && z === 0) continue;
    const c = chunk(x, z);
    const payload = await factory.build(c);
    const kinds = new Set(payload.refinement.tasks.map(task => task.kind));
    const semanticBlockers = payload.refinement.tasks.some(task => String(task.kind).startsWith('semantic-') && task.topologyDescriptors?.length);
    if (kinds.has('roof-clutter') && kinds.has('street-fixture') && [...kinds].some(kind => kind.startsWith('plaza-')) && semanticBlockers) {
      selected = { c, payload, kinds };
    } else {
      await factory.unload(c, payload);
    }
  }
}
assert.ok(selected, 'representative search must find roof/street/plaza/semantic blockers');
const { c, payload, kinds } = selected;

assert.equal(payload.committed, false);
assert.ok(payload.topologyPrecommit?.schema === 'jweb.topology-precommit.v1');
assert.ok(payload.topologyPrecommit.descriptors > 0, 'blocking enrichment must publish descriptors during build');
assert.ok(payload.physics.props.some(item => item.topologyDescriptorId), 'payload.physics must already contain enrichment blockers before commit');

for (const task of payload.refinement.tasks) {
  if (task.kind === 'street-fixture' || task.kind === 'roof-clutter' || task.kind === 'roof-topper' || task.kind.startsWith('plaza-')) {
    assert.equal(task.topologySolved, true, `${task.kind} must be topology-solved before commit`);
  }
  if (String(task.kind).startsWith('semantic-') && task.topologyDescriptors?.length) {
    assert.equal(task.topologySolved, true, 'semantic blocker must be topology-solved before commit');
  }
}

const descriptors = payload.refinement.tasks.flatMap(task => task.topologyDescriptors ?? []);
const descriptorIds = new Set(descriptors.map(d => d.id));
assert.equal(descriptorIds.size, descriptors.length, 'topology descriptor ids must be unique');
for (const descriptor of descriptors) {
  const item = descriptor.item;
  const radius = Number(item.radius) || 0.1;
  const yMin = Number.isFinite(item.yMin) ? item.yMin : 0;
  const yMax = Number.isFinite(item.height) ? item.height : yMin + 2;
  const box = { x: item.x, z: item.z, halfX: radius, halfZ: radius, yMin, yMax };
  assert.equal(anyReservationIntersectsBox(payload.physics.circulationReservations ?? [], box), false,
    `descriptor ${descriptor.id} must clear circulation/access reservations`);
}

const precommitDigest = digest(payload.physics);
const precommitCounts = Object.fromEntries(['platforms','ceilings','ramps','props','mazeWalls'].map(kind => [kind, payload.physics[kind]?.length ?? 0]));
await factory.commit(c, payload);
assert.equal(digest(payload.physics), precommitDigest, 'commit may activate physics but must not alter topology data');

let guard = 0;
while (factory.hasPendingRefinement(c, payload) && guard++ < 10000) {
  factory.refine(c, payload, { maxSteps: 8, maxMillis: 50 });
  assert.equal(digest(payload.physics), precommitDigest, 'progressive realization must never mutate committed topology');
}
assert.ok(guard < 10000, 'refinement must reach READY');
assert.equal(payload.refinement.phase, 'ready');
assert.deepEqual(Object.fromEntries(['platforms','ceilings','ramps','props','mazeWalls'].map(kind => [kind, payload.physics[kind]?.length ?? 0])), precommitCounts);
assert.equal(lateAppendCalls, 0, 'Kowloon must make zero late appendOwnedWorldItem calls');

const realizedIds = [];
for (const object of payload.detailRoot.children) {
  for (const id of object.userData?.topologyDescriptorIds ?? []) realizedIds.push(id);
}
const realizedCounts = new Map();
for (const id of realizedIds) realizedCounts.set(id, (realizedCounts.get(id) ?? 0) + 1);
for (const id of descriptorIds) assert.equal(realizedCounts.get(id), 1, `visual blocker must realize precommitted descriptor exactly once: ${id}`);

// Refinement order relative to commit cannot change topology.
const twin = await factory.build(chunk(c.x, c.z));
const twinPre = digest(twin.physics);
assert.equal(twinPre, precommitDigest, 'same deterministic chunk must pre-solve identical topology');
let twinGuard = 0;
while (factory.hasPendingRefinement(c, twin) && twinGuard++ < 10000) {
  factory.refine(c, twin, { maxSteps: 16, maxMillis: 50 });
  assert.equal(digest(twin.physics), twinPre, 'pre-commit refinement must also be realization-only');
}
assert.equal(digest(twin.physics), precommitDigest, 'refine-before-commit and commit-before-refine topology must match');
await factory.commit(c, twin);
assert.equal(digest(twin.physics), precommitDigest);
assert.equal(lateAppendCalls, 0);

assert.ok(kinds.has('roof-clutter'));
assert.ok(kinds.has('street-fixture'));
assert.ok([...kinds].some(kind => kind.startsWith('plaza-')));
assert.ok(payload.refinement.tasks.some(task => String(task.kind).startsWith('semantic-') && task.topologyDescriptors?.length));

await factory.unload(c, payload);
await factory.unload(c, twin);
console.log('[topology-precommit-selftest] PASS', { chunk: c.key, descriptors: descriptors.length, physics: precommitCounts, hash: precommitDigest });
