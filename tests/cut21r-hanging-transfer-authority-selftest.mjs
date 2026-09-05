import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

// This seed/chunk contains several hanging exchanges that deepen overlapping
// module paths to different ceiling-depth bands. 21Q used to derive an earlier
// endpoint's local floor before later deepening, which could collapse distinct
// bands onto global floor 0. Build the real chunk so the regression is pinned at
// the same authority boundary that emits the hanging skybridges.
const worldSeed = 671278205;
const x = 16, z = 0;
const scene = new THREE.Scene();
const playerPhysics = {
  registerOwnedWorld() { return { activationState: 'active' }; },
  unregisterOwnedWorld() { return true; },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize: 64, landmarkSpacingChunks: 3, yieldControl: null,
});
const chunk = {
  key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64,
  seed: deterministicChunkSeed(worldSeed, x, z),
  weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await factory.build(chunk);
const hanging = payload.hangingLayer?.payload;
assert.ok(hanging?.ceilingCity, 'fixture must build the full hanging-city layer');
const buildings = hanging.entities.filter(entity => entity.kind === 'building');
const transferBuildings = buildings.filter(entity => entity.cityTransferAuthority?.bindings?.length);
assert.ok(transferBuildings.length > 0, 'fixture must contain hanging city exchanges');

const bindingByEndpoint = new Map();
let multibandDemands = 0;
let verticalRoutes = 0;
for (const entity of transferBuildings) {
  for (const binding of entity.cityTransferAuthority.bindings) bindingByEndpoint.set(binding.endpointId, binding);
  for (const demand of entity.cityTransferDemands ?? []) {
    const from = entity.cityTransferAuthority.bindings.find(binding => binding.endpointId === demand.fromEndpointId);
    const to = entity.cityTransferAuthority.bindings.find(binding => binding.endpointId === demand.toEndpointId);
    assert.ok(from && to, `${demand.id}: resolved hanging demand must bind both endpoints`);
    assert.equal(demand.fromGlobalFloor, from.floor, `${demand.id}: demand/from binding floor drift`);
    assert.equal(demand.toGlobalFloor, to.floor, `${demand.id}: demand/to binding floor drift`);
    assert.equal(demand.requiresVerticalTransfer, from.floor !== to.floor,
      `${demand.id}: vertical requirement must be derived from final global floors`);
    if (from.floor !== to.floor) {
      multibandDemands++;
      const route = entity.cityTransferAuthority.routes.find(candidate => candidate.demandId === demand.id);
      assert.ok(route, `${demand.id}: multiband demand needs a realized interior route`);
      assert.ok(route.verticalTransfers >= 1, `${demand.id}: multiband hanging route must traverse the persistent core`);
      verticalRoutes += route.verticalTransfers;
    }
  }
}
assert.ok(multibandDemands > 0, 'fixture must exercise a real multi-elevation hanging transfer');

const bridgeConnectors = (hanging.physics.semanticConnectors ?? []).filter(connector => connector.kind === 'bridge');
assert.ok(bridgeConnectors.length > 0, 'hanging city must emit semantic bridge connectors');
for (const connector of bridgeConnectors) {
  const aEndpointId = connector.metadata?.aEndpointId;
  const bEndpointId = connector.metadata?.bEndpointId;
  if (!aEndpointId || !bEndpointId) continue;
  const aBinding = bindingByEndpoint.get(aEndpointId);
  const bBinding = bindingByEndpoint.get(bEndpointId);
  assert.ok(aBinding && bBinding, `${connector.id}: hanging bridge endpoints must both have Building Plan bindings`);
  assert.equal(connector.fromSpaceId, aBinding.spaceId, `${connector.id}: A semantic endpoint bypassed authoritative hanging exchange binding`);
  assert.equal(connector.toSpaceId, bBinding.spaceId, `${connector.id}: B semantic endpoint bypassed authoritative hanging exchange binding`);
}

factory.disposeShared();
console.log('[cut21r-hanging-transfer-authority-selftest] PASS', {
  transferBuildings: transferBuildings.length,
  bridgeConnectors: bridgeConnectors.length,
  multibandDemands,
  verticalRoutes,
  invariant: 'final hanging module depth -> local endpoint floor -> global Building Plan floor -> PUBLIC_THROUGH spine -> persistent core',
});
