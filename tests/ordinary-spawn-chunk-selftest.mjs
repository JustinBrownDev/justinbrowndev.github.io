import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

const mainSource = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const fabricSource = readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');

assert.match(mainSource, /buildChunk:\s*chunk\s*=>\s*cityFabricEngine\.build\(chunk\)/,
  'streamer must route world origin through the exact ordinary chunk builder');
assert.match(mainSource, /pinnedChunkKeys:\s*\[\]/,
  'world origin must not be retained as a special pinned spawn chunk');
assert.doesNotMatch(mainSource, /buildAuthoredOriginChunk\s*\(/,
  'runtime boot must not resurrect the authored-origin shell');
assert.doesNotMatch(mainSource, /buildAuthoredCeilingOverlay\s*\(/,
  'runtime boot must not resurrect the authored ceiling overlay');
assert.match(mainSource, /const initialSpawnChunk = await worldChunkStreamer\.buildSpawnChunk\(\);/,
  'player placement must wait only for the first ordinary streamed chunk');
assert.match(mainSource, /new Map\(\[\[initialSpawnChunk\.key, initialSpawnChunk\.payload\]\]\)/,
  'spawn proof and TV realization must bind directly to the committed ordinary chunk payload');
assert.match(mainSource, /const spawnRealization = spawnProof\.location\?\.spatialPlan\?\.ready[\s\S]*?realizeSpawnLocation\(/,
  'TV refuge must realize on the fast spawn path immediately after roof selection');

assert.doesNotMatch(fabricSource, /edgeKey === 'H:0:0'|edgeKey === 'H:0:1'|edgeKey === 'V:0:0'|edgeKey === 'V:1:0'/,
  'origin road seams must not receive a bespoke center-lane override');

function makeChunk(worldSeed, x, z) {
  return {
    key: `${x},${z}`,
    x, z,
    centerX: x * 64,
    centerZ: z * 64,
    seed: deterministicChunkSeed(worldSeed, x, z),
    weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
}

const samples = [];
for (const worldSeed of [1, 42, 1337]) {
  const scene = new THREE.Scene();
  const rawAdd = scene.add.bind(scene);
  const owners = new Map();
  const playerPhysics = {
    registerOwnedWorld(id, data, lifecycle = {}) {
      owners.set(id, data);
      const record = { activationState: 'active' };
      lifecycle.onActivationChange?.(record);
      return record;
    },
    unregisterOwnedWorld(id) { return owners.delete(id); },
  };
  const engine = createKowloonFabricEngine({
    THREE, scene, playerPhysics, directSceneAdd: rawAdd, chunkSize: 64, worldSeed, yieldControl: null,
  });
  assert.equal('buildAuthoredOriginChunk' in engine, false);
  assert.equal('buildAuthoredCeilingOverlay' in engine, false);

  const origin = makeChunk(worldSeed, 0, 0);
  const east = makeChunk(worldSeed, 1, 0);
  const west = makeChunk(worldSeed, -1, 0);
  const south = makeChunk(worldSeed, 0, 1);
  const north = makeChunk(worldSeed, 0, -1);
  const originPlan = engine.planChunk(origin);
  assert.equal(originPlan.portals.east, engine.planChunk(east).portals.west);
  assert.equal(originPlan.portals.west, engine.planChunk(west).portals.east);
  assert.equal(originPlan.portals.south, engine.planChunk(south).portals.north);
  assert.equal(originPlan.portals.north, engine.planChunk(north).portals.south);

  const payload = await engine.build(origin);
  const groundBuildings = payload.entities.filter(entity => entity.kind === 'building').length;
  const hangingBuildings = payload.hangingLayer?.payload?.entities?.filter(entity => entity.kind === 'building') ?? [];
  assert.ok(groundBuildings > 0, `seed ${worldSeed}: origin must contain ordinary upright buildings`);
  assert.ok(hangingBuildings.length > 0, `seed ${worldSeed}: origin must contain ordinary hanging/downward buildings`);
  assert.ok(hangingBuildings.some(entity => entity.growthDirection === 'world-down'),
    `seed ${worldSeed}: hanging buildings must grow world-down`);
  assert.equal(payload.root.userData.worldChunkKey, '0,0');
  assert.equal(payload.root.userData.authoredOriginComposite, undefined);

  await engine.commit(origin, payload);
  engine.setVisible(origin, payload, true);
  assert.equal(engine.verifyReady(origin, payload, true), true);
  assert.equal(payload.root.parent, scene);
  await engine.unload(origin, payload);
  engine.disposeShared();
  samples.push({ worldSeed, groundBuildings, hangingBuildings: hangingBuildings.length, portals: originPlan.portals });
}

console.log('[ordinary-spawn-chunk-selftest] PASS', samples);
