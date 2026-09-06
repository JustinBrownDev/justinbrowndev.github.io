import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { planInteriorSwitchbackStairCore } from '../world/interior-stair-core.js';
import { planVisualStairTreads, STAIR_VISUAL_TREAD_SCHEMA } from '../world/stair-visual-treads.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

const truth = {
  stair: {
    widthSI: 0.96,
    landingDepthSI: 1.00,
    headroomSI: 2.03,
    riser: { realizedSI: 0.18 },
    tread: { realizedSI: 0.28, sourceMinimum: { canonicalSI: 0.25 } },
  },
};

function assertPerimeterEdges(rect, axis, mouthEdge, edges, label) {
  assert.equal(edges.length, 3, `${label}: exactly three exposed edges should be guarded`);
  assert.deepEqual(new Set(edges.map(edge => edge.role)), new Set(['outer-edge', 'side-negative', 'side-positive']));
  const alongMin = axis === 'x' ? rect.x - rect.hx : rect.z - rect.hz;
  const alongMax = axis === 'x' ? rect.x + rect.hx : rect.z + rect.hz;
  const mouthCoord = mouthEdge === 'low' ? alongMin : alongMax;
  const isMouthEdge = edge => {
    if (axis === 'x') return Math.abs(edge.x1 - mouthCoord) < 1e-7 && Math.abs(edge.x2 - mouthCoord) < 1e-7;
    return Math.abs(edge.z1 - mouthCoord) < 1e-7 && Math.abs(edge.z2 - mouthCoord) < 1e-7;
  };
  assert.ok(edges.every(edge => !isMouthEdge(edge)), `${label}: circulation mouth must remain unguarded`);
}

// Pure arithmetic regression: N risers means N-1 treads between two landings.
const stairFlight = {
  riserCount: 9,
  stepCount: 9,
  riserHeight: 0.175,
  realizedRun: 2.24,
  realizedTreadDepth: 0.28,
};
const treads = planVisualStairTreads({
  axis: 'x', from: 0, to: 2.24, fixedCoord: 1.5, width: 0.96,
  y0: 0, y1: 1.575, stairFlight, thickness: 0.10,
});
assert.equal(treads.length, 8, '9 risers require exactly 8 visual treads between landings');
assert.ok(treads.every(tread => tread.visualTreadAuthority === STAIR_VISUAL_TREAD_SCHEMA));
assert.ok(treads.every(tread => Math.abs(tread.sx - 0.28) < 1e-9), 'tread depth must equal resolved physical tread depth');
assert.deepEqual(treads.map(tread => tread.visualTreadIndex), [0,1,2,3,4,5,6,7]);
const highestTreadTop = Math.max(...treads.map(tread => tread.y + tread.sy * 0.5));
assert.ok(Math.abs(highestTreadTop - (1.575 - 0.175)) < 1e-9, 'last visual tread must sit one riser below receiving landing');
assert.ok(highestTreadTop < 1.575, 'visual treads may not duplicate the receiving landing surface');
const last = treads.at(-1);
assert.ok(Math.abs(last.x + last.sx * 0.5 - 2.24) < 1e-9, 'last tread must terminate exactly at the landing edge without overshoot');

// Four-flight planner regression exercises both low- and high-side turn landings.
const four = planInteriorSwitchbackStairCore({
  rect: { cx: 0, cz: 0, halfX: 2.5, halfZ: 2.5 },
  floorH: 5.5,
  physicalTruth: truth,
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'geometry-r2d-four-flight',
});
assert.ok(four);
assert.equal(four.flightCount, 4, 'test bay should require the four-flight topology');
assert.equal(four.intermediateLandings.length, 3);
assertPerimeterEdges(four.slabOpening, four.axis, four.slabOpeningMouthEdge, four.slabOpeningGuardEdges, 'shaft opening');
for (const landing of four.intermediateLandings) {
  assertPerimeterEdges(landing.geometry, four.axis, landing.mouthEdge, landing.guardEdges, landing.id);
}
assert.deepEqual(four.intermediateLandings.map(landing => landing.mouthEdge), ['low', 'high', 'low'], 'switchback landing mouths must alternate with flight direction');

const arterial = planInteriorSwitchbackStairCore({
  rect: { cx: 0, cz: 0, halfX: 4.4, halfZ: 4.4 },
  floorH: 3.35,
  physicalTruth: truth,
  traversalEnvelope: { playerRadius: 0.22 },
  clearWidthOverride: 1.80,
  stableKey: 'geometry-r2d-district-thoroughfare',
});
assert.ok(arterial, 'district thoroughfare stair must fit when the structural bay is large enough');
assert.equal(arterial.clearWidth, 1.80, 'explicit arterial clear width must reach the physical stair core, not remain metadata-only');
assert.equal(arterial.halfWidth, 0.90);

// Exact reported hanging-city specimen: verify the real first stair publishes
// complete landing/shaft perimeter rails and physically truthful tread identities.
const worldSeed = 671278205, x = 8, z = 8, chunkSize = 64;
const scene = new THREE.Scene();
const playerPhysics = { registerOwnedWorld(){ return { activationState:'active' }; }, unregisterOwnedWorld(){ return true; } };
const engine = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize, landmarkSpacingChunks: 3, yieldControl: null,
});
const chunk = {
  key:`${x},${z}`, x, z, centerX:x*chunkSize, centerZ:z*chunkSize,
  seed:deterministicChunkSeed(worldSeed,x,z),
  weirdness:worldWeirdnessAt(x,z,{worldSeed,startRadius:1.5,fullRadius:36,curve:1.3}),
};
const hanging = (await engine.build(chunk)).hangingLayer?.payload;
assert.ok(hanging?.root && hanging?.physics);
const ownership = hanging.physics.stairOwnership?.find(item => item.id.endsWith(':8,0:8,0:compound-stair')) ?? hanging.physics.stairOwnership?.[0];
assert.ok(ownership, 'reported hanging chunk must expose a stair ownership root');
const ownerId = ownership.id;
const guards = (hanging.physics.guardSpans ?? []).filter(span => span.stairOwnerId === ownerId);
const byKind = kind => guards.filter(span => span.supportKind === kind);
assert.equal(byKind('compound-stair-mid-landing-guard').length, ownership.floors * 3,
  'each story turn landing needs three guarded exposed edges');
assert.equal(byKind('compound-stair-shaft-opening-guard').length, Math.max(0, ownership.floors - 1) * 3,
  'every occupied floor above the base needs a three-sided shaft guard');
assert.equal(byKind('compound-stair-roof-opening-guard').length, 3,
  'roof stair opening needs a three-sided perimeter guard while keeping the stair mouth open');

const exactTreads = [];
hanging.root.traverse(object => {
  const sources = object?.userData?.visualProbeInstanceSources;
  if (!(sources instanceof Map)) return;
  for (const [instanceIndex, source] of sources) {
    if (source.stairOwnerId === ownerId && source.stairPartKind === 'step') exactTreads.push({ instanceIndex, source });
  }
});
assert.ok(exactTreads.length > 0, 'exact visual ownership must retain stair treads');
const groups = new Map();
for (const record of exactTreads) {
  const source = record.source;
  assert.equal(source.visualTreadAuthority, STAIR_VISUAL_TREAD_SCHEMA);
  assert.equal(source.visualTreadCount, source.riserCount - 1, 'exact tread identity must encode N risers -> N-1 treads');
  const key = `${source.floor}:${source.flightId}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(source);
}
assert.equal(groups.size, ownership.floors * ownership.flightIds.length);
for (const [key, group] of groups) {
  const expected = group[0].visualTreadCount;
  assert.equal(group.length, expected, `${key}: full-quality build must realize every physical tread exactly once`);
  assert.deepEqual(group.map(item => item.visualTreadIndex).sort((a,b)=>a-b), Array.from({length:expected}, (_,i)=>i), `${key}: tread indices must be contiguous`);
}

console.log('[geometry-r2d-stair-topology-selftest] PASS', {
  pureTreads: treads.length,
  fourFlightLandings: four.intermediateLandings.length,
  ownerId,
  floors: ownership.floors,
  exactTreads: exactTreads.length,
  ownedGuards: guards.length,
  guardKinds: {
    turnLanding: byKind('compound-stair-mid-landing-guard').length,
    floorShaft: byKind('compound-stair-shaft-opening-guard').length,
    roofShaft: byKind('compound-stair-roof-opening-guard').length,
  },
  invariant: 'N risers produce N-1 treads; receiving landings own the top surface; stair landing/opening guards derive from exposed perimeter minus circulation mouth',
});
