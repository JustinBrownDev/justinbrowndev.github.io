import assert from 'node:assert/strict';
import { createPlayerPhysics } from '../player-physics.js';
import { planInteriorSwitchbackStairCore } from '../world/interior-stair-core.js';
import {
  STAIR_ENDPOINT_SUPPORT_OVERLAP,
  STAIR_WALKABILITY_DESIGN_INTENT,
  assertInteriorStairCoreWalkability,
} from '../world/stair-volume-contract.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function commandSegment({ fromX, fromZ, toX, toZ, speed = 1.35 }) {
  const dx = toX - fromX, dz = toZ - fromZ;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-9) return [];
  const ux = dx / distance, uz = dz / distance;
  const dt = 1 / 60;
  const steps = Math.ceil(distance / (speed * dt));
  return Array.from({ length: steps }, () => ({ dt, wishVelocityX: ux * speed, wishVelocityZ: uz * speed }));
}

function walkCase(index, rng) {
  const floorH = 2.85 + rng() * 0.65;
  const truth = {
    stair: {
      widthSI: 0.92 + rng() * 0.16,
      landingDepthSI: 0.98 + rng() * 0.20,
      headroomSI: 1.98 + rng() * 0.16,
      riser: { realizedSI: 0.165 + rng() * 0.02 },
      tread: { realizedSI: 0.27 + rng() * 0.035, sourceMinimum: { canonicalSI: 0.25 } },
    },
  };
  const halfX = 3.6 + rng() * 1.5;
  const halfZ = 3.6 + rng() * 1.5;
  const playerRadius = 0.20 + rng() * 0.04;
  const core = planInteriorSwitchbackStairCore({
    rect: { cx: 0, cz: 0, halfX, halfZ },
    floorH,
    physicalTruth: truth,
    traversalEnvelope: { playerRadius },
    stableKey: `controller-fuzz:${index}`,
  });
  assert.ok(core, `case ${index}: legal envelope must produce a core`);
  assert.equal(core.designIntent, STAIR_WALKABILITY_DESIGN_INTENT);
  assert.equal(core.flightCount, 2, `case ${index}: ordinary story must remain a 2-flight switchback`);
  assertInteriorStairCoreWalkability(core);

  const rectPlatform = (geometry, y, role) => ({
    x: geometry.x, z: geometry.z, hx: geometry.hx, hz: geometry.hz, y,
    supportKind: role, supportMargin: 0, blocksFromBelow: false,
    designIntent: STAIR_WALKABILITY_DESIGN_INTENT,
  });
  const platforms = [
    rectPlatform(core.floorLanding, 0, 'floor-landing-low'),
    rectPlatform(core.intermediateLandings[0].geometry, floorH * 0.5, 'turn-landing'),
    rectPlatform(core.floorLanding, floorH, 'floor-landing-high'),
  ];
  const ramps = core.flights.map(flight => ({
    axis: flight.axis, from: flight.from, to: flight.to, fixedCoord: flight.fixedCoord,
    halfWidth: core.halfWidth, y0: flight.y0Fraction * floorH, y1: flight.y1Fraction * floorH,
    supportKind: 'compound-stair',
    supportMargin: Math.max(core.endpointSupportOverlap, STAIR_ENDPOINT_SUPPORT_OVERLAP),
    collisionAuthority: 'physics-ramp', designIntent: STAIR_WALKABILITY_DESIGN_INTENT,
  }));
  const physics = createPlayerPhysics({
    position: { x: 0, y: 1.65, z: 0 },
    worldToCell: () => ({ col: 0, row: 0 }), grid: [[true]], buildingWallSegments: new Map(),
    propColliders: [], elevatedPlatforms: platforms, rampRuns: ramps, overheadCeilings: [], playerRadius,
  });
  const point = (along, cross) => core.axis === 'x' ? { x: along, z: cross } : { x: cross, z: along };
  const lane0 = core.laneCoords[0], lane1 = core.laneCoords[1];
  const lowInside = core.lowMouth - Math.max(0.28, core.endpointSupportOverlap * 0.6);
  const highInside = core.highMouth + Math.max(0.28, core.endpointSupportOverlap * 0.6);
  const low0 = point(lowInside, lane0);
  const high0 = point(highInside, lane0);
  const high1 = point(highInside, lane1);
  const low1 = point(lowInside, lane1);
  const pathCommands = points => {
    const commands = [];
    for (let i = 1; i < points.length; i++) commands.push(...commandSegment({
      fromX: points[i - 1].x, fromZ: points[i - 1].z, toX: points[i].x, toZ: points[i].z,
    }));
    return commands;
  };
  const ascent = physics.probeControllerPath({ start: { ...low0, feetY: 0 }, steps: pathCommands([low0, high0, high1, low1]) });
  assert.equal(ascent.validStart, true, `case ${index}: ascent start`);
  assert.equal(ascent.validEnd, true, `case ${index}: ascent end`);
  assert.equal(ascent.end.grounded, true, `case ${index}: ascent grounded`);
  assert.ok(Math.abs(ascent.end.feetY - floorH) < 0.04, `case ${index}: ascent feetY=${ascent.end.feetY}`);
  const descent = physics.probeControllerPath({ start: { ...low1, feetY: floorH }, steps: pathCommands([low1, high1, high0, low0]) });
  assert.equal(descent.validStart, true, `case ${index}: descent start`);
  assert.equal(descent.validEnd, true, `case ${index}: descent end`);
  assert.equal(descent.end.grounded, true, `case ${index}: descent grounded`);
  assert.ok(Math.abs(descent.end.feetY) < 0.04, `case ${index}: descent feetY=${descent.end.feetY}`);
}

const rng = mulberry32(0x20C0FFEE);
const cases = 32;
for (let i = 0; i < cases; i++) walkCase(i, rng);
console.log('[stair-walkability-controller-fuzz-selftest] PASS', {
  cases,
  invariant: 'randomized legal 2-flight cores remain continuously traversable by the real player controller in both directions without jump input',
});
