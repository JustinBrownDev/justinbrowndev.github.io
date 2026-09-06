import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [
  perf,
  { createKowloonFabricEngine },
  { deterministicChunkSeed, worldWeirdnessAt },
  { createProceduralTextExciter },
] = await Promise.all([
  import('../config/performance-isolation.js?cut21x=1'),
  import('../kowloon-fabric-engine.js?cut21x=1'),
  import('../world-chunk-streamer.js?cut21x=1'),
  import('../world/procedural-text-exciter.js?cut21x=1'),
]);

assert.equal(perf.GENERATION_PROFILE_NAME, 'skeleton');
assert.equal(perf.GENERATION_LANES.microEnrichment, false);
assert.equal(perf.GENERATION_LANES.moderateProps, false);
assert.equal(perf.GENERATION_LANES.plazaClutter, false);
assert.equal(perf.GENERATION_LANES.signageStress, false);
assert.equal(perf.GENERATION_LANES.macroSignage, true);
assert.equal(perf.GENERATION_LANES.spectacle, true);

const worldSeed = 0x51CEB00C;
const x = 1, z = 0;
const chunk = {
  key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64,
  seed: deterministicChunkSeed(worldSeed, x, z),
  weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const scene = new THREE.Scene();
const playerPhysics = {
  registerOwnedWorld() { return { activationState: 'active', deferredReason: null }; },
  unregisterOwnedWorld() { return true; },
};
const engine = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize: 64, landmarkSpacingChunks: 3,
});
const payload = await engine.build(chunk);
let remaining = 5000;
while (engine.hasPendingRefinement(chunk, payload) && remaining-- > 0) {
  engine.refine(chunk, payload, { maxSteps: 64, maxMillis: Infinity });
}
assert.ok(remaining > 0, 'lean baseline refinement must converge');

const layers = [payload, payload.hangingLayer?.payload].filter(Boolean);
const states = layers.map(layer => layer.refinement).filter(Boolean);
const physicsLayers = layers.map(layer => layer.physics).filter(Boolean);
const tasks = states.flatMap(state => state.tasks ?? []);
const buildings = layers.flatMap(layer => layer.entities ?? [])
  .filter(entity => entity.kind === 'building' || entity.kind === 'district-landmark');
const kinds = new Map();
for (const task of tasks) kinds.set(task.kind, (kinds.get(task.kind) ?? 0) + 1);

const omittedBaselineKinds = [
  'graffiti', 'pipe', 'awning', 'flyer', 'ivy', 'security', 'service-hardware',
  'elevator-hardware', 'spray-cans', 'overhead-cable', 'street-fixture', 'roof-clutter',
];
for (const kind of omittedBaselineKinds) {
  assert.equal(kinds.get(kind) ?? 0, 0, `${kind} must stay out of lean first paint`);
}
assert.ok((kinds.get('sign') ?? 0) <= buildings.length,
  'baseline signage must be capped to at most one identity sign per building');
assert.ok(tasks.length <= buildings.length * 2,
  `lean refinement queue should stay close to one identity/macro task per building (${tasks.length} tasks / ${buildings.length} buildings)`);

const macroCount = physicsLayers.reduce((sum, physics) => sum + (physics.programMacroArchitecture?.length ?? 0), 0);
const stairExpressionCount = physicsLayers.reduce((sum, physics) => sum + (physics.stairArchitectureExpressions?.length ?? 0), 0);
const bridgeExpressionCount = physicsLayers.reduce((sum, physics) => sum + (physics.bridgeArchitecture?.length ?? 0), 0);
assert.ok(macroCount >= Math.max(1, buildings.length - 1), '21W program-scale architecture must survive subtraction');
assert.ok(stairExpressionCount > 0, 'named stair wrappers must survive subtraction');
assert.ok(bridgeExpressionCount > 0, 'named bridge wrappers must survive subtraction');
assert.equal(payload.worldCirculation?.stats?.unreachableSpaces, 0);
assert.equal(payload.worldCirculation?.stats?.unreachableTransportNodes, 0);

const exciterStats = createProceduralTextExciter({ worldSeed }).stats;
assert.equal(exciterStats.designMotifs, 27);
assert.equal('ideologyAxioms' in exciterStats, false, 'runtime diagnostics should use neutral design-motif terminology');
const terminologyFiles = [
  '../world/procedural-text-exciter.js',
  '../world/spatial-topology.js',
  '../world/exterior-composition-authority.js',
  '../world/kowloon-structure.js',
  '../config/performance-isolation.js',
];
for (const relative of terminologyFiles) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /design ideology|semantic truth|Building Semantic Truth|source of truth/i,
    `${relative}: live comments should use concrete planner/graph language`);
}

console.log('[cut21x-subtraction-profile-selftest] PASS', {
  buildings: buildings.length,
  tasks: tasks.length,
  signs: kinds.get('sign') ?? 0,
  detailChildren: layers.reduce((sum, layer) => sum + (layer.detailRoot?.children?.length ?? 0), 0),
  macroCount,
  stairExpressionCount,
  bridgeExpressionCount,
  circulation: payload.worldCirculation.stats,
  designMotifs: exciterStats.designMotifs,
});
engine.disposeShared();
