import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { scaffoldRouteIsContinuous } from '../world/scaffold-circulation-plan.js';
import { reservationIntersectsBox } from '../world/circulation-reservations.js';

const engineSource = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
assert.ok(engineSource.includes("from './world/scaffold-circulation-plan.js'"));
assert.ok(engineSource.includes('function realizeExteriorScaffold({ physics, transforms, plan })'));
assert.ok(engineSource.includes('const scaffoldOpeningByKey = new Map();'), 'scaffold apertures must be planned before wall publication');
assert.ok(engineSource.includes("supportKind: 'scaffold-rail'"), 'guard rails must derive from accepted route landings');
assert.ok(!engineSource.includes('function addExteriorScaffold({'), 'legacy geometry-first scaffold author must be gone');
assert.ok(!engineSource.includes("stableKey: `scaffold:${seed}:flight:${level}`"), 'old compressed-run scaffold flight path must be gone');

const worldSeed = 0x13572468; // match circulation-reservation regression seed
const scene = new THREE.Scene();
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data, lifecycle = {}) {
    const record = { ownerId: id, data, active: true, activationState: 'active', deferredReason: null, onActivationChange: lifecycle.onActivationChange };
    owners.set(id, record);
    return record;
  },
  unregisterOwnedWorld(id) { return owners.delete(id); },
  appendOwnedWorldItem() { throw new Error('scaffold circulation must be precommitted'); },
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

function wallBlocksOpening(walls, opening, sampleY = opening.y + Math.min(0.9, opening.height * 0.5)) {
  const eps = 1e-6;
  return walls.some(wall => {
    if (sampleY < wall.yMin - eps || sampleY > wall.yMax + eps) return false;
    const horizontal = Math.abs(wall.z1 - wall.z2) <= eps;
    if (horizontal) {
      if (Math.abs(wall.z1 - opening.z) > eps) return false;
      const lo = Math.min(wall.x1, wall.x2) - eps;
      const hi = Math.max(wall.x1, wall.x2) + eps;
      return opening.x >= lo && opening.x <= hi;
    }
    const vertical = Math.abs(wall.x1 - wall.x2) <= eps;
    if (!vertical || Math.abs(wall.x1 - opening.x) > eps) return false;
    const lo = Math.min(wall.z1, wall.z2) - eps;
    const hi = Math.max(wall.z1, wall.z2) + eps;
    return opening.z >= lo && opening.z <= hi;
  });
}

const coordinates = [-32, -16, -4, 4, 16, 32];
const sampledChunks = [
  [1, 0], // exact circulation-reservation regression chunk
  ...coordinates.flatMap(z => coordinates.map(x => [x, z])),
];
let routesSeen = 0;
let flightsSeen = 0;
let scaffoldConnectorsSeen = 0;
let minWeirdness = Infinity;
let maxWeirdness = -Infinity;

for (const [x, z] of sampledChunks) {
    const c = chunk(x, z);
    minWeirdness = Math.min(minWeirdness, c.weirdness.sampled);
    maxWeirdness = Math.max(maxWeirdness, c.weirdness.sampled);
    const payload = await factory.build(c);
    const physics = payload.physics;
    const routes = physics.scaffoldCirculationRoutes ?? [];
    const routeById = new Map(routes.map(route => [route.id, route]));
    const scaffoldConnectors = (physics.semanticConnectors ?? []).filter(connector => connector.source === 'exterior-scaffold');
    const scaffoldRamps = (physics.ramps ?? []).filter(ramp => ramp.supportKind === 'scaffold');
    const scaffoldRails = (physics.mazeWalls ?? []).filter(wall => wall.supportKind === 'scaffold-rail');
    const guardSpans = physics.guardSpans ?? [];
    const scaffoldFlightGuards = guardSpans.filter(span => span.supportKind === 'scaffold-flight-guard');
    const scaffoldPlatforms = (physics.platforms ?? []).filter(platform => platform.supportKind === 'scaffold');
    const stairShafts = (physics.circulationReservations ?? []).filter(reservation => reservation.kind === 'stair-shaft');

    // Exterior circulation must never consume the keep-clear volume of the
    // building's already-resolved interior stair authority.
    for (const platform of scaffoldPlatforms) {
      const blocker = stairShafts.find(shaft => reservationIntersectsBox(shaft, {
        x: platform.x, z: platform.z, hx: platform.hx, hz: platform.hz,
        yMin: platform.y - 0.02, yMax: platform.y + 0.02,
      }));
      assert.equal(blocker, undefined,
        `${c.key}:${platform.routeId ?? 'scaffold'}:${platform.landingId ?? 'landing'} must not overlap interior stair ${blocker?.id ?? ''}`);
    }

    if (!routes.length) {
      assert.equal(scaffoldConnectors.length, 0, `${c.key}: no accepted route means no scaffold connector publication`);
      assert.equal(scaffoldRamps.length, 0, `${c.key}: no accepted route means no scaffold ramp publication`);
      assert.equal(scaffoldRails.length, 0, `${c.key}: no accepted route means no scaffold rail publication`);
      assert.equal(scaffoldFlightGuards.length, 0, `${c.key}: no accepted route means no scaffold flight guard publication`);
    }

    for (const route of routes) {
      routesSeen++;
      assert.equal(route.fitStatus, 'fits-resolved-truth', `${c.key}:${route.id}`);
      assert.equal(scaffoldRouteIsContinuous(route), true, `${c.key}:${route.id} must connect ground to top`);
      assert.ok(route.flights.length > 0);
      assert.ok(route.moduleKey, `${c.key}:${route.id} must identify its selected module`);
      assert.equal(route.face?.moduleKey, route.moduleKey);
      assert.equal(route.face?.side, route.side);
      assert.equal(route.openings.length, route.floors, `${c.key}:${route.id} must own one facade opening per occupied floor`);
      const nodeIds = new Set(route.nodes.map(node => node.id));
      assert.ok(nodeIds.has(route.groundNodeId));
      assert.ok(nodeIds.has(route.topNodeId));
      for (const opening of route.openings) {
        assert.equal(opening.moduleKey, route.moduleKey);
        assert.equal(opening.side, route.side);
        assert.equal(wallBlocksOpening(physics.mazeWalls ?? [], opening), false, `${c.key}:${opening.id} must be a real facade aperture`);
        if (opening.height + 0.08 < route.floorH) {
          assert.equal(wallBlocksOpening(physics.mazeWalls ?? [], opening, opening.y + opening.height + 0.05), true,
            `${c.key}:${opening.id} must retain a route-derived lintel above the clear opening`);
        }
      }
      for (const landing of route.landings) {
        const landingRails = scaffoldRails.filter(rail => rail.routeId === route.id && rail.landingId === landing.id);
        assert.ok(landingRails.length >= 2,
          `${c.key}:${landing.id} must own street-edge + dead-end fire-escape guard spans`);
        assert.ok(landingRails.every(rail => rail.guardFamily === 'fire-escape-pipe'),
          `${c.key}:${landing.id} landing guard must stay in the skinny fire-escape family`);
      }
      for (const flight of route.flights) {
        flightsSeen++;
        assert.equal(flight.fitClassification, 'fits-resolved-truth', `${c.key}:${flight.id}`);
        assert.equal(flight.stairFlight.fitClassification, 'fits-resolved-truth', `${c.key}:${flight.id}`);
        assert.ok(nodeIds.has(flight.fromNodeId), `${c.key}:${flight.id} missing source node`);
        assert.ok(nodeIds.has(flight.toNodeId), `${c.key}:${flight.id} missing target node`);
        const ramp = scaffoldRamps.find(item => item.routeId === route.id && item.flightId === flight.id);
        assert.ok(ramp, `${c.key}:${flight.id} must own exactly one physics ramp`);
        const sideGuards = scaffoldFlightGuards.filter(span => span.routeId === route.id && span.flightId === flight.id);
        assert.equal(sideGuards.length, 2, `${c.key}:${flight.id} needs one skinny guard on each stair side`);
        assert.ok(sideGuards.every(span => span.family === 'fire-escape-pipe' && span.role === 'flight-side'));
        assert.ok(sideGuards.every(span => span.visualPrimitiveCount >= 4),
          `${c.key}:${flight.id} flight guard must contain rails plus posts, not one solid blocker`);
      }
    }

    for (const connector of scaffoldConnectors) {
      scaffoldConnectorsSeen++;
      const route = routeById.get(connector.routeId);
      assert.ok(route, `${c.key}:${connector.id} must reference an accepted route`);
      assert.notEqual(connector.metadata?.fitClassification, 'geometry-fit-outside-truth', `${c.key}:${connector.id}`);
      if (connector.kind === 'fire-escape') {
        assert.ok(connector.fromNodeId && connector.toNodeId, `${c.key}:${connector.id} requires route adjacency`);
        const flight = route.flights.find(item => item.id === connector.flightId);
        assert.ok(flight, `${c.key}:${connector.id} must reference a real route flight`);
        assert.equal(connector.fromNodeId, flight.fromNodeId);
        assert.equal(connector.toNodeId, flight.toNodeId);
        assert.equal(connector.stairFlight?.fitClassification, 'fits-resolved-truth');
      } else if (connector.kind === 'landing') {
        assert.ok(connector.routeNodeIds?.length, `${c.key}:${connector.id} landing must claim route nodes`);
        for (const nodeId of connector.routeNodeIds) assert.ok(route.nodes.some(node => node.id === nodeId), `${c.key}:${connector.id} dangling landing node`);
        for (const openingId of connector.openingIds ?? []) assert.ok(route.openings.some(opening => opening.id === openingId), `${c.key}:${connector.id} dangling facade opening`);
      }
    }

    await factory.unload(c, payload);
}

assert.ok(routesSeen > 0, 'soak must encounter accepted scaffold routes');
assert.ok(flightsSeen > 0, 'soak must encounter scaffold flights');
assert.ok(scaffoldConnectorsSeen > routesSeen, 'routes must publish landing/flight connector chains');
assert.ok(maxWeirdness - minWeirdness > 0.25, 'soak must cover materially different weirdness bands');

console.log('[scaffold-circulation-engine-selftest] PASS', {
  chunks: sampledChunks.length,
  routesSeen,
  flightsSeen,
  scaffoldConnectorsSeen,
  weirdnessRange: [minWeirdness, maxWeirdness],
  invalidFlights: 0,
});
