import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { STAIR_ARCHITECTURE_FAMILIES, PROGRAM_MACRO_FAMILIES } from '../world/architectural-family-system.js';

const worldSeed = 671278205;
const x = 16, z = 0;
const scene = new THREE.Scene();
const playerPhysics = {
  registerOwnedWorld() { return { activationState: 'active' }; },
  unregisterOwnedWorld() { return true; },
};
const engine = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed,
  chunkSize: 64, landmarkSpacingChunks: 3, yieldControl: null,
});
const chunk = {
  key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64,
  seed: deterministicChunkSeed(worldSeed, x, z),
  weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await engine.build(chunk);
const hanging = payload.hangingLayer?.payload;
assert.ok(hanging?.ceilingCity, 'fixture must build the hanging field');

const stairExpressions = hanging.physics.stairArchitectureExpressions ?? [];
assert.ok(stairExpressions.length >= 3, 'real hanging circulation should receive named stair architecture wrappers');
for (const expression of stairExpressions) {
  assert.ok(STAIR_ARCHITECTURE_FAMILIES.includes(expression.family), expression.family);
  // Persistent per-building vertical cores report partsPerStory instead of a
  // flat parts count (system-observatory-r2-core.js normalizes the same way).
  assert.ok((expression.parts ?? expression.partsPerStory) >= 4, `${expression.id}: wrapper should materially alter stair silhouette/support`);
  // Retired in favor of a more descriptive value (world/architectural-family-system.js)
  // as part of the semantic-architecture/stair-species unification.
  assert.equal(expression.traversalAuthority, 'species-selected-before-visual-expression');
}

const macros = hanging.physics.programMacroArchitecture ?? [];
assert.ok(macros.length >= 3, 'generated buildings should receive program/morphology macro expression');
for (const macro of macros) {
  assert.ok(PROGRAM_MACRO_FAMILIES.includes(macro.family), macro.family);
  assert.ok(macro.parts >= 2, `${macro.id}: macro expression should be visible at building scale`);
  assert.equal(macro.traversalAuthority, 'building-plan-and-circulation-authority-unchanged');
}
assert.ok(macros.some(macro => macro.programArchitectureId === 'generic:mercantile-public' && macro.family === 'market-frontage-frame'),
  'generic mercantile truth should use generic market frontage language rather than inventing a workshop tenant');

const galleries = hanging.physics.facadeRouteGalleries ?? [];
assert.ok(galleries.length > 0, 'fixture should retain route-scale hanging galleries');
for (const gallery of galleries) {
  assert.ok(gallery.architectureFamily && gallery.architectureFamily !== 'facade-route-gallery');
  assert.ok(gallery.familyParts > 0, `${gallery.id}: named gallery family must add visible structural language`);
}
const summary = hanging.facadeRouteGalleries;
assert.equal(summary?.schema, 'jweb.facade-route-gallery-summary.v3');
assert.equal(summary?.realized, galleries.length);

const bridgeExpressions = hanging.physics.bridgeArchitecture ?? [];
assert.ok(bridgeExpressions.length > 0);
assert.ok(bridgeExpressions.every(expression => expression.traversalAuthority === 'canonical-transport-slab-unchanged'));

engine.disposeShared();
console.log('[cut21w-runtime-expression-selftest] PASS', {
  stairs: stairExpressions.length,
  stairFamilies: [...new Set(stairExpressions.map(item => item.family))],
  macros: macros.length,
  macroFamilies: [...new Set(macros.map(item => item.family))],
  galleries: galleries.length,
  galleryFamilies: [...new Set(galleries.map(item => item.architectureFamily))],
  bridges: bridgeExpressions.length,
  invariant: '21W changes architectural expression and support silhouette without replacing proven traversal authority',
});
