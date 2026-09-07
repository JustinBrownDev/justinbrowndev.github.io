import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { planSkybridgeArchitecture } from '../world/skybridge-architecture.js';
import { assignBridgeSectionBands } from '../world/sectional-circulation.js';
import { guardProfile } from '../world/guardrail-authority.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

// A semantic hanging bridge owns one suspension grammar. The suspension family
// may supply its deck edge beams, but it may not stack the old family hanger kit
// and a second generic facade-brace system under the catenary.
const hanging = planSkybridgeArchitecture({
  id: 'r2e:hanging', axis: 'x', from: -8, to: 8, fixedCoord: 0, y: 18,
  width: 2.1, widthClass: 'collector', family: 'suspension-hanger',
  variant: 'hanging-bridge', stableKey: 'r2e:hanging', supportModeHint: 'hung-from-above',
});
assert.equal(hanging.family, 'suspension-hanger');
assert.equal(hanging.structuralGrammar, 'suspended-catenary-v1');
assert.ok(hanging.variantParts > 0, 'hanging bridge must retain a real catenary/hanger structure');
assert.equal(hanging.supportParts, 0, 'hanging bridge may not add a redundant generic facade-brace system');
assert.equal(hanging.supportMode, null);
assert.ok(!hanging.metal.some(part => part.architectureRole === 'hanger-tower'), 'variant-owned catenary replaces the old family tower kit');
assert.ok(!hanging.metal.some(part => part.architectureRole === 'vertical-hanger'), 'variant-owned hangers replace the old family hanger kit');
assert.ok(hanging.metal.some(part => part.architectureRole === 'hanging-suspension-cable'));
assert.ok(hanging.metal.some(part => part.architectureRole === 'hanging-vertical-hanger'));

// Sectional planning must choose a suspension-compatible architecture family for
// the semantic variant instead of randomly overlaying catenary on truss/frame.
const plans = [
  { id:'r2e:plan:hanging', variant:'hanging-bridge', aSiteId:0, bSiteId:1, aEndpoint:{id:'ha'}, bEndpoint:{id:'hb'} },
  { id:'r2e:plan:rigid', variant:'guarded-catwalk', aSiteId:1, bSiteId:2, aEndpoint:{id:'ra'}, bEndpoint:{id:'rb'} },
];
const portals = new Map([[0,[plans[0].aEndpoint]],[1,[plans[0].bEndpoint,plans[1].aEndpoint]],[2,[plans[1].bEndpoint]]]);
const capacity = new Map([[0,9],[1,9],[2,9]]);
assignBridgeSectionBands({
  bridgePlans: plans, bridgePortalsBySite: portals, field:'ground', siteFloorCapacity: capacity,
  floorHeight:3.15, ceilingY:34.02, weirdness:0.4, stableKey:'r2e:bands',
});
assert.equal(plans[0].architectureFamily, 'suspension-hanger');
assert.ok(plans[1].architectureFamily && plans[1].architectureFamily !== '(none)');

// Exact system-observatory repro: this chunk previously contained six F04
// hanging-family conflicts and four F05 triple structural stacks.
const worldSeed = 671278205, x = 4, z = 6, chunkSize = 64;
const scene = new THREE.Scene();
const playerPhysics = { registerOwnedWorld(){ return { activationState:'active' }; }, unregisterOwnedWorld(){ return true; } };
const engine = createKowloonFabricEngine({ THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed, chunkSize, landmarkSpacingChunks:3, yieldControl:null });
const chunk = {
  key:`${x},${z}`, x, z, centerX:x*chunkSize, centerZ:z*chunkSize,
  seed:deterministicChunkSeed(worldSeed,x,z),
  weirdness:worldWeirdnessAt(x,z,{worldSeed,startRadius:1.5,fullRadius:36,curve:1.3}),
};
const payload = await engine.build(chunk);
const records = [
  ...(payload.physics?.bridgeArchitecture ?? []),
  ...(payload.hangingLayer?.payload?.physics?.bridgeArchitecture ?? []),
];
const hangingRecords = records.filter(record => record.bridgeVariant === 'hanging-bridge');
assert.ok(hangingRecords.length >= 4, '4,6 must keep a useful hanging-bridge population for the regression');
for (const record of hangingRecords) {
  assert.equal(record.family, 'suspension-hanger', `${record.bridgeId}: hanging variant must use suspension-compatible family`);
  assert.equal(record.structuralGrammar, 'suspended-catenary-v1');
  assert.ok(record.variantParts > 0);
  assert.equal(record.supportParts, 0, `${record.bridgeId}: no triple support grammar on hanging bridge`);
}

// Stair landing/opening guard edges are separate authority spans, but shared
// visual endpoint posts are single-owned. Verify the physical spans stay intact
// while the published render count is lower than independent edge emission.
let savedCoincidentPosts = 0;
for (const layer of [payload, payload.hangingLayer?.payload].filter(Boolean)) {
  const byParent = new Map();
  for (const span of (layer.physics?.guardSpans ?? []).filter(item => item.stairPartParentId && item.construction === 'open-bar')) {
    const key = `${span.stairOwnerId}|${span.stairPartParentId}|${span.guardFamily}`;
    const list = byParent.get(key) ?? [];
    list.push(span);
    byParent.set(key, list);
  }
  for (const spans of byParent.values()) {
    const theoretical = spans.reduce((sum, span) => {
      const profile = guardProfile(span.guardFamily);
      const run = Math.abs(Number(span.to) - Number(span.from));
      return sum + 2 + Math.max(1, Math.ceil(run / profile.postSpacing)) + 1;
    }, 0);
    const actual = spans.reduce((sum, span) => sum + Number(span.visualPrimitiveCount ?? 0), 0);
    assert.ok(actual <= theoretical, 'stair guard render count may not exceed independent-span authority');
    savedCoincidentPosts += theoretical - actual;
  }
}
assert.ok(savedCoincidentPosts > 0, 'exact 4,6 repro must remove coincident stair perimeter posts');
engine.disposeShared?.();
console.log('[geometry-r2e-bridge-grammar-selftest] PASS', {
  chunk: chunk.key,
  hangingBridges: hangingRecords.length,
  savedCoincidentPosts,
  invariant: 'bridge grammar is singular and stair perimeter corners own one rendered guard post',
});
