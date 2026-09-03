import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { HANGING_CITY_CEILING_Y } from '../world/hanging-city-topology.js';
import { CAVERN_WALL_STAIR_SCHEMA, cavernNodePopularity, planCavernWallStairCandidates } from '../world/cavern-wall-stair-circulation.js';

const worldSeed = 0x13572468;
const scene = new THREE.Scene();
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data, lifecycle = {}) {
    owners.set(id, data);
    const record = { ownerId: id, data, activationState: 'active' };
    lifecycle.onActivationChange?.(record);
    return record;
  },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize: 64, landmarkSpacingChunks: 3, yieldControl: null,
});
const chunk = {
  key: '1,0', x: 1, z: 0, centerX: 64, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 1, 0),
  weirdness: worldWeirdnessAt(1, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await factory.build(chunk);
const ceiling = payload.hangingLayer?.payload;
assert.ok(ceiling, 'ceiling peer must exist');

// Cross-cavern ladders are routes, not rung counts. Every accepted route owns a
// semantic connector, a shaft reservation and a real carved hatch in its tip slab.
const ladderEntities = ceiling.entities.filter(entity => entity.cavernLadderRoute);
assert.ok(ladderEntities.length >= 2, 'sample should contain multiple cross-level ladder routes');
assert.equal(ceiling.ladders, ladderEntities.length, 'ladder metric must count routes, not rungs');
for (const entity of ladderEntities) {
  const route = entity.cavernLadderRoute;
  assert.ok(route.carvedPlatforms >= 1 && route.carvedSlabs >= 1, `${route.id}: hatch must carve collision and render slab`);
  assert.ok(ceiling.physics.semanticConnectors.some(connector => connector.id === route.id && connector.kind === 'ladder'), `${route.id}: semantic ladder connector missing`);
  assert.ok(ceiling.physics.circulationReservations.some(reservation => reservation.id === `${route.id}:shaft` && reservation.kind === 'cavern-ladder-shaft'), `${route.id}: shaft reservation missing`);
  const halfX = route.apertureWidth * 0.5 - 0.03;
  const halfZ = route.apertureDepth * 0.5 - 0.03;
  const blockers = ceiling.physics.platforms.filter(platform => {
    if (platform.supportKind === 'ladder' || platform.ladderId === route.id) return false;
    if (Math.abs(Number(platform.y) - Number(route.y1)) > 0.12) return false;
    return Math.abs(Number(platform.x) - Number(route.x)) < Number(platform.hx) + halfX
      && Math.abs(Number(platform.z) - Number(route.z)) < Number(platform.hz) + halfZ;
  });
  assert.equal(blockers.length, 0, `${route.id}: hatch center must contain no support collider`);
}

// Popular-node wall stairs are deliberately sparse but present in both fields.
for (const [field, worldPayload] of [['ground', payload], ['ceiling', ceiling]]) {
  const summary = worldPayload.physics.cavernWallStairSummary;
  assert.equal(summary?.schema, CAVERN_WALL_STAIR_SCHEMA);
  assert.equal(summary?.field, field);
  assert.ok(summary.routes >= 1 && summary.routes <= 2, `${field}: expected sparse popular-node wall stair trunks`);
  assert.ok(summary.flights >= summary.routes && summary.steps > 0);
  const routes = worldPayload.physics.cavernWallStairRoutes ?? [];
  assert.equal(routes.length, summary.routes);
  assert.ok(routes.every(route => route.field === field && route.popularity > 0));
  const ramps = worldPayload.physics.ramps.filter(ramp => ramp.supportKind === 'cavern-wall-stair');
  assert.equal(ramps.length, summary.flights, `${field}: every planned flight must publish a physical ramp`);
  assert.ok(worldPayload.physics.semanticConnectors.some(connector => connector.source === 'cavern-popular-node-wall-stairs'), `${field}: wall stair semantic connector missing`);
}

// Planner order must actually favor graph/circulation-heavy nodes.
const groundBuildings = payload.entities.filter(entity => entity.kind === 'building');
const ranked = [...groundBuildings].sort((a, b) => cavernNodePopularity(b) - cavernNodePopularity(a));
const planned = planCavernWallStairCandidates({ entities: groundBuildings, field: 'ground', maxRoutes: 64 });
assert.ok(planned.length > 0);
assert.equal(planned[0].entityId, ranked[0].id, 'wall stair candidates must start at the most circulation-popular compound');

// Frozen ceiling transport authority must be rebased into world Y along with the
// geometry; leaving these at local 0/3.15/etc. poisons later routing decisions.
for (const surface of ceiling.physics.exteriorTransportSurfaces ?? []) {
  assert.ok(surface.y >= -1e-8 && surface.y <= HANGING_CITY_CEILING_Y + 1e-8);
}
const sampleCeilingRoute = ceiling.physics.cavernWallStairRoutes?.[0];
assert.ok(sampleCeilingRoute && sampleCeilingRoute.y0 > 10, 'ceiling stair route must use final world-space module datum');

const engineSource = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
assert.doesNotMatch(engineSource, /invertedRoofRim/, 'retired full floating underside plates must stay gone');
assert.match(engineSource, /invertedRoofEdge/, 'low-end roof treatment should be edge-only trim');
assert.match(engineSource, /clearCirculationGuardMouth/, 'ladder/stair mouths must own guard openings');

await factory.commit(chunk, payload);
assert.ok(owners.size >= 1);
await factory.unload(chunk, payload);
factory.disposeShared();
console.log('[cut19-cavern-circulation-selftest] PASS', {
  ladders: ladderEntities.length,
  groundWallStairs: payload.physics.cavernWallStairSummary.routes,
  ceilingWallStairs: ceiling.physics.cavernWallStairSummary.routes,
  groundWallFlights: payload.physics.cavernWallStairSummary.flights,
  ceilingWallFlights: ceiling.physics.cavernWallStairSummary.flights,
  invariant: 'popular-node wall stairs on both fields + carved cross-level ladder hatches + no floating underside plates',
});
