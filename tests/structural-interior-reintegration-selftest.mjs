import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoPath = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const repo = path.resolve(repoPath);
const url = rel => pathToFileURL(path.join(repo, rel)).href;

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [{ createKowloonFabricEngine }, THREE, stream, perf, facade, policyMod] = await Promise.all([
  import(url('kowloon-fabric-engine.js') + '?structural-interiors=11'),
  import(url('vendor/three/three.module.js') + '?structural-interiors=11'),
  import(url('world-chunk-streamer.js') + '?structural-interiors=11'),
  import(url('config/performance-isolation.js') + '?structural-interiors=11'),
  import(url('world/fast-facade-architecture.js') + '?structural-interiors=11'),
  import(url('world/exterior-street-layer-policy.js') + '?structural-interiors=11'),
]);

assert.equal(perf.GENERATION_PROFILE_NAME, 'skeleton');
assert.equal(perf.GENERATION_LANES.broadStrokesOnly, true);
assert.equal(perf.GENERATION_LANES.microEnrichment, false);
assert.equal(perf.GENERATION_LANES.authoredDecoration, false);
assert.ok(!policyMod.EXTERIOR_CIRCULATION_DEBT.some(item => item.tag === 'CIRC_DEBT_REAL_ROOM_AUTHORITY'));

// Ordinary windows are structural apertures only. This fixture has a ground door,
// so there is no storefront glazing and every upper-floor window must be a naked void.
const facadePlan = facade.planFastFacadeArchitecture({
  stableKey: '11:literal-window-hole',
  floorH: 3.2,
  defaultDoorWidth: 1.0,
  defaultDoorHeight: 2.2,
  faces: [{
    moduleKey: 'm', dirKey: 'N', side: 'north', floors: 3,
    rect: { cx: 0, cz: 0, halfX: 4.2, halfZ: 3.0 },
    openings: [{ floor: 0, kind: 'primary-entrance', center: 0, width: 1.0, height: 2.2 }],
  }],
});
assert.ok(facadePlan.metrics.windows > 0, 'fixture must author upper inhabited windows');
assert.equal(facadePlan.apertures.filter(item => item.kind === 'window').length, facadePlan.metrics.windows,
  'every inhabited window must still publish a real wall aperture');
assert.equal(facadePlan.render.windows.length, 0,
  'ordinary inhabited windows must not publish blue glass facade planes');

const worldSeed = 0x11A7E210;
const scene = new THREE.Scene();
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data) { owners.set(id, data); return { activationState: 'active', deferredReason: null }; },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed,
  chunkSize: 64, landmarkSpacingChunks: 4, yieldControl: null,
});
const chunk = (x, z) => ({
  key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64,
  seed: stream.deterministicChunkSeed(worldSeed, x, z),
  weirdness: stream.worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
});

let buildingsSeen = 0;
let topologySpacesSeen = 0;
let partitionSegmentsSeen = 0;
let partitionWallsSeen = 0;
let coreRampsSeen = 0;
let realRoomExteriorDemandsSeen = 0;
const samples = [[0,0], [1,0], [-1,0], [0,1], [0,-1]];

for (const [x, z] of samples) {
  const c = chunk(x, z);
  const payload = await factory.build(c);
  const entities = (payload.entities ?? []).filter(entity => entity?.broadStrokesOnly === true);
  const spaceIds = new Set();
  for (const entity of entities) {
    buildingsSeen++;
    assert.equal(entity.buildingPlan?.authoritySchema, 'jweb.building-plan-authority.v1',
      `${c.key}: broad building must carry Building Plan authority`);
    assert.equal(entity.buildingPlanAuthority, entity.buildingPlan.authoritySchema);
    assert.ok((entity.buildingPlan.topologySpaces?.length ?? 0) > 0,
      `${c.key}: broad building must expose real topology spaces`);
    assert.equal(entity.suppressInteriorEnrichment, true,
      `${c.key}: structural interiors must not reactivate rich interior enrichment`);
    assert.equal(entity.interiorClutter, 0);
    assert.equal(entity.mezzanines, 0);
    topologySpacesSeen += entity.buildingPlan.topologySpaces.length;
    partitionSegmentsSeen += entity.partitionSegments ?? 0;
    for (const space of entity.buildingPlan.topologySpaces) spaceIds.add(space.id);
  }
  partitionWallsSeen += (payload.physics.mazeWalls ?? [])
    .filter(wall => wall.supportKind === 'building-plan-partition').length;
  coreRampsSeen += (payload.physics.ramps ?? [])
    .filter(ramp => ramp.supportKind === 'compound-stair').length;
  for (const route of payload.physics.fastVerticalRoutes ?? []) {
    for (const stop of route.portalStops ?? []) {
      if (stop.source === 'bridge-portal') continue;
      realRoomExteriorDemandsSeen++;
      assert.ok(spaceIds.has(stop.roomSpaceId),
        `${c.key}:${route.id}:${stop.portalId}: exterior access demand must originate at a real Building Plan space`);
    }
  }
  await factory.unload(c, payload);
}

assert.ok(buildingsSeen > 0, 'sample must produce broad-strokes buildings');
assert.ok(topologySpacesSeen > 0, 'sample must restore structural topology spaces');
assert.ok(partitionSegmentsSeen > 0, 'sample must restore partition wall segments');
assert.ok(partitionWallsSeen > 0, 'Building Plan partition collision must be published');
assert.ok(coreRampsSeen > 0, 'persistent interior vertical-core stair ramps must be published');
assert.ok(realRoomExteriorDemandsSeen > 0, 'sample must exercise occupancy -> exterior circulation handoff');

const engineSource = fs.readFileSync(path.join(repo, 'kowloon-fabric-engine.js'), 'utf8');
const facadeSource = fs.readFileSync(path.join(repo, 'world/fast-facade-architecture.js'), 'utf8');
assert.match(engineSource, /registerBuildingPlanInteriorDoors\(physics, buildingPlan, physicalTruth\)/,
  'skeleton structural pass must reuse canonical Building Plan interior door authority');
assert.match(engineSource, /realizeBuildingPlanWallRuns\([\s\S]*phase: 'broad-structural-interiors'/,
  'partition realization must occur in the broad structural pass');
assert.match(engineSource, /roofIntersectsInteriorCore[\s\S]*addNotchedFloor/,
  'the persistent interior core must own a real roof opening');
assert.doesNotMatch(facadeSource, /facadeRole: 'inhabited-window'/,
  'ordinary inhabited window glass planes must stay deleted');
assert.match(facadeSource, /storefront-aperture/,
  'storefront frontage must remain a real carved facade aperture');
assert.doesNotMatch(facadeSource, /facadeRole: 'storefront-glazing'/,
  'storefront wall cut must stay physically empty; no glazing plane may refill it');

console.log('[structural-interior-reintegration-selftest] PASS', {
  buildingsSeen,
  topologySpacesSeen,
  partitionSegmentsSeen,
  partitionWallsSeen,
  coreRampsSeen,
  realRoomExteriorDemandsSeen,
  invariant: 'Building Plan occupancy -> structural partitions/core -> circulation-owned exterior door; inhabited windows and storefronts are literal apertures',
});
