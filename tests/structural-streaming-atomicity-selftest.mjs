import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';

// Force the browser-default structural profile without requiring a browser.  The
// actual fabric engine remains real; only scene publication/physics ownership are
// represented by the same lightweight fakes used by existing Node regressions.
globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [{ createKowloonFabricEngine }, { deterministicChunkSeed, worldWeirdnessAt }, perf] = await Promise.all([
  import('../kowloon-fabric-engine.js?structural-atomicity-selftest=1'),
  import('../world-chunk-streamer.js'),
  import('../config/performance-isolation.js?structural-atomicity-selftest=1'),
]);

assert.equal(perf.GENERATION_PROFILE_NAME, 'skeleton', 'self-test must exercise the live browser skeleton profile');
assert.equal(perf.GENERATION_LANES.broadStrokesOnly, true, 'skeleton profile must route through broad-strokes structural generation');

const worldSeed = 0x51CEB00C;
const chunkSize = 64;

function makeChunk(x = 1, z = 0) {
  return {
    key: `${x},${z}`,
    x,
    z,
    centerX: x * chunkSize,
    centerZ: z * chunkSize,
    seed: deterministicChunkSeed(worldSeed, x, z),
    weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
}

function createHarness(yieldControl = null) {
  const scene = new THREE.Scene();
  const owners = new Map();
  const playerPhysics = {
    registerOwnedWorld(id, data) {
      owners.set(id, data);
      return { activationState: 'active', deferredReason: null };
    },
    unregisterOwnedWorld(id) { return owners.delete(id); },
  };
  const factory = createKowloonFabricEngine({
    THREE,
    scene,
    playerPhysics,
    directSceneAdd: scene.add.bind(scene),
    worldSeed,
    chunkSize,
    landmarkSpacingChunks: 3,
    yieldControl,
  });
  return { factory, scene, owners };
}

function structuralSummary(payload) {
  return {
    ownerId: payload.ownerId,
    buildings: payload.buildings,
    plazas: payload.plazas,
    skybridges: payload.skybridges,
    roadCells: payload.roadCells,
    drawBatches: payload.drawBatches,
    physics: {
      mazeWalls: payload.physics.mazeWalls.length,
      platforms: payload.physics.platforms.length,
      ramps: payload.physics.ramps.length,
      ceilings: payload.physics.ceilings.length,
      props: payload.physics.props.length,
      semanticConnectors: payload.physics.semanticConnectors.length,
    },
    entities: payload.entities.map(entity => ({
      id: entity.id,
      kind: entity.kind,
      siteId: entity.siteId ?? null,
      floors: entity.floors ?? null,
      moduleCount: entity.moduleCount ?? null,
      broadStrokesOnly: entity.broadStrokesOnly ?? null,
      bridgePortalCount: entity.bridgePortalCount ?? null,
      compoundCells: entity.compoundCells ?? null,
      entranceFaces: entity.entranceFaces ?? null,
      footprintModules: entity.footprintModules ?? null,
    })),
  };
}

const checkpoints = [];
const yieldControl = async (stage, current, total) => {
  checkpoints.push({ stage, current, total });
  // A microtask is enough for this deterministic test. Browser runtime uses the
  // actual frame-budgeted cooperative scheduler supplied by main.js.
  await Promise.resolve();
};
yieldControl.resetSlice = () => checkpoints.push({ stage: '__reset__', current: 0, total: 0 });

const targetChunk = makeChunk(1, 0);
const cooperative = createHarness(yieldControl);
const payload = await cooperative.factory.build(targetChunk);

const structuralEntities = payload.entities.filter(entity =>
  (entity.kind === 'building' || entity.kind === 'district-landmark')
  && Array.isArray(entity.footprintModules)
);
assert.ok(structuralEntities.length > 0, 'fixture must build skeleton structural entities');
assert.ok(structuralEntities.every(entity => entity.broadStrokesOnly === true), 'fixture must remain on broad-strokes path');

const totalModuleFloors = structuralEntities.reduce((sum, entity) =>
  sum + entity.footprintModules.reduce((moduleSum, module) => moduleSum + module.floors, 0), 0);
const totalModules = structuralEntities.reduce((sum, entity) => sum + entity.footprintModules.length, 0);
const shellFloorCheckpoints = checkpoints.filter(entry => entry.stage.includes('broad-shell-floor'));
const facadeCheckpoints = checkpoints.filter(entry => entry.stage.includes('broad-facade-hosts'));
const roofCheckpoints = checkpoints.filter(entry => entry.stage.includes('broad-roof-shell'));
const streetFaceCheckpoints = checkpoints.filter(entry => entry.stage.includes('broad-street-faces'));

assert.equal(
  shellFloorCheckpoints.length,
  totalModuleFloors,
  'every emitted module-floor shell must return to the cooperative scheduler before another floor can run',
);
assert.equal(facadeCheckpoints.length, totalModules, 'each module facade-host pass must expose a cooperative boundary');
assert.equal(roofCheckpoints.length, totalModules, 'each module roof/parapet pass must expose a cooperative boundary');
assert.equal(streetFaceCheckpoints.length, totalModules, 'each module street-face classification pass must expose a cooperative boundary');
assert.ok(shellFloorCheckpoints.length > structuralEntities.length, 'structural scheduling must be finer than one whole building/compound');

// Scheduling must not become semantic authority. Drain the same live engine with no
// scheduler and compare the final structural/collision identity byte-for-byte at the
// stable metadata level.
const nonCooperative = createHarness(null);
const baselinePayload = await nonCooperative.factory.build(makeChunk(1, 0));
assert.deepEqual(
  structuralSummary(payload),
  structuralSummary(baselinePayload),
  'yield order must not change deterministic structural identity or collision counts',
);

await cooperative.factory.commit(targetChunk, payload);
cooperative.factory.setVisible(targetChunk, payload, true);
assert.equal(cooperative.factory.verifyReady(targetChunk, payload, true), true, 'atomic publication contract must survive finer structural yielding');
assert.equal(cooperative.owners.has(payload.ownerId), true, 'collision owner must publish only at commit');
await cooperative.factory.unload(targetChunk, payload);
assert.equal(cooperative.owners.has(payload.ownerId), false, 'unload must remove the same owner atomically');

const revisit = await cooperative.factory.build(makeChunk(1, 0));
assert.deepEqual(
  structuralSummary(revisit),
  structuralSummary(baselinePayload),
  'unload/revisit must regenerate the exact same structural identity after resumable slicing',
);

// Authored spawn uses a different outer scheduler from streamed chunks. Its old
// adapter synchronously drained the compound generator, hiding all of the floor/module
// boundaries above. The step API must expose those same structural checkpoints so the
// already-live authored job scheduler can interleave shells without partial publication.
const authoredSite = { id: 17, cells: [{ col: 1, row: 1 }, { col: 2, row: 1 }] };
const authoredGrid = Array.from({ length: 4 }, () => Array(4).fill(false));
authoredGrid[1][1] = true;
authoredGrid[1][2] = true;
const authoredSiteIdOf = Array.from({ length: 4 }, () => Array(4).fill(-1));
authoredSiteIdOf[1][1] = authoredSite.id;
authoredSiteIdOf[1][2] = authoredSite.id;
const authoredArgs = {
  site: authoredSite,
  siteIdOf: authoredSiteIdOf,
  grid: authoredGrid,
  cellToWorld: (col, row) => ({ x: col * 8, z: row * 8 }),
  colHalf: () => 4,
  rowHalf: () => 4,
  ownerId: 'authored-structural-selftest',
  weirdness: 0.35,
};

const authoredStepped = createHarness(null);
const authoredStepper = authoredStepped.factory.buildAuthoredSiteSteps(authoredArgs);
const authoredPhases = [];
let authoredStep = authoredStepper.next();
while (!authoredStep.done) {
  authoredPhases.push(authoredStep.value?.phase ?? null);
  assert.equal(authoredStepped.scene.children.length, 0, 'authored structural steps must remain off-scene before atomic commit');
  assert.equal(authoredStepped.owners.size, 0, 'authored structural steps must not publish collision before atomic commit');
  authoredStep = authoredStepper.next();
}
const authoredPayload = authoredStep.value;
assert.ok(authoredPayload?.entity, 'authored stepper must return the same final payload contract');
assert.ok(authoredPhases.includes('broad-shell-floor'), 'authored scheduler must see floor-level shell boundaries');
assert.ok(authoredPhases.includes('broad-roof-shell'), 'authored scheduler must see roof/module boundaries');

const authoredSync = createHarness(null);
const authoredBaselinePayload = authoredSync.factory.buildAuthoredSite(authoredArgs);
assert.deepEqual(
  structuralSummary(authoredPayload),
  structuralSummary(authoredBaselinePayload),
  'stepped and compatibility-drained authored site builds must have identical structural identity',
);

await authoredStepped.factory.commit(authoredPayload.chunk, authoredPayload);
assert.equal(authoredStepped.owners.has(authoredPayload.ownerId), true, 'authored collision owner must still publish only at commit');

const { readFile } = await import('node:fs/promises');
const mainSource = await readFile(new URL('../main.js', import.meta.url), 'utf8');
assert.match(mainSource, /yield\* cityFabricEngine\.buildAuthoredSiteSteps\(/, 'authored runtime jobs must delegate through the resumable site API');
assert.equal(
  (mainSource.match(/yield\* cityFabricEngine\.buildAuthoredSiteSteps\(/g) ?? []).length,
  2,
  'ordinary and signature authored shells must both expose structural steps to the existing scheduler',
);

console.log(`structural-streaming-atomicity-selftest: ok · streamedModuleFloors=${totalModuleFloors} streamedModules=${totalModules} streamedCheckpoints=${checkpoints.length} authoredSteps=${authoredPhases.length}`);
