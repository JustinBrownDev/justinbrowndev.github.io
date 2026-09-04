import assert from 'node:assert/strict';
import { createPlayerPhysics } from '../player-physics.js';
import { planInteriorSwitchbackStairCore } from '../world/interior-stair-core.js';
import {
  STAIR_ENDPOINT_SUPPORT_OVERLAP,
  STAIR_WALKABILITY_DESIGN_INTENT,
  assertInteriorStairCoreWalkability,
} from '../world/stair-volume-contract.js';

// JWEB_INTENT: STAIR_WALKABILITY_V1
const floorH = 3.2;
const truth = {
  stair: {
    widthSI: 0.96,
    landingDepthSI: 1.00,
    headroomSI: 2.03,
    riser: { realizedSI: 0.18 },
    tread: { realizedSI: 0.28, sourceMinimum: { canonicalSI: 0.25 } },
  },
};
const core = planInteriorSwitchbackStairCore({
  rect: { cx: 0, cz: 0, halfX: 3.5, halfZ: 3.5 },
  floorH,
  physicalTruth: truth,
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'p0-controller-walk',
});
assert.ok(core);
assert.equal(core.designIntent, STAIR_WALKABILITY_DESIGN_INTENT);
assert.equal(core.flightCount, 2);
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
  axis: flight.axis,
  from: flight.from,
  to: flight.to,
  fixedCoord: flight.fixedCoord,
  halfWidth: core.halfWidth,
  y0: flight.y0Fraction * floorH,
  y1: flight.y1Fraction * floorH,
  supportKind: 'compound-stair',
  supportMargin: Math.max(core.endpointSupportOverlap, STAIR_ENDPOINT_SUPPORT_OVERLAP),
  collisionAuthority: 'physics-ramp',
  designIntent: STAIR_WALKABILITY_DESIGN_INTENT,
}));

const position = { x: 0, y: 1.65, z: 0 };
const physics = createPlayerPhysics({
  position,
  worldToCell: () => ({ col: 0, row: 0 }),
  grid: [[true]],
  buildingWallSegments: new Map(),
  propColliders: [],
  elevatedPlatforms: platforms,
  rampRuns: ramps,
  overheadCeilings: [],
  playerRadius: 0.22,
});

function commandSegment({ fromX, fromZ, toX, toZ, speed = 1.2 }) {
  const dx = toX - fromX, dz = toZ - fromZ;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-9) return [];
  const ux = dx / distance, uz = dz / distance;
  const dt = 1 / 60;
  const steps = Math.ceil(distance / (speed * dt));
  return Array.from({ length: steps }, () => ({ dt, wishVelocityX: ux * speed, wishVelocityZ: uz * speed }));
}

function point(along, cross) {
  return core.axis === 'x' ? { x: along, z: cross } : { x: cross, z: along };
}

const lane0 = core.laneCoords[0], lane1 = core.laneCoords[1];
const lowInside = core.lowMouth - 0.28;
const highInside = core.highMouth + 0.28;
const low0 = point(lowInside, lane0);
const high0 = point(highInside, lane0);
const high1 = point(highInside, lane1);
const low1 = point(lowInside, lane1);

function pathCommands(points) {
  const commands = [];
  for (let i = 1; i < points.length; i++) {
    commands.push(...commandSegment({ fromX: points[i - 1].x, fromZ: points[i - 1].z, toX: points[i].x, toZ: points[i].z }));
  }
  return commands;
}

const ascent = physics.probeControllerPath({
  start: { ...low0, feetY: 0 },
  steps: pathCommands([low0, high0, high1, low1]),
});
assert.equal(ascent.validStart, true);
assert.equal(ascent.validEnd, true);
assert.equal(ascent.completedSteps > 0, true);
assert.equal(ascent.end.grounded, true, 'ascent must finish grounded on the upper floor landing');
assert.ok(Math.abs(ascent.end.feetY - floorH) < 0.04,
  `ascent must reach upper floor without jump input: feetY=${ascent.end.feetY}`);

const descent = physics.probeControllerPath({
  start: { ...low1, feetY: floorH },
  steps: pathCommands([low1, high1, high0, low0]),
});
assert.equal(descent.validStart, true);
assert.equal(descent.validEnd, true);
assert.equal(descent.end.grounded, true, 'descent must finish grounded on the lower floor landing');
assert.ok(Math.abs(descent.end.feetY) < 0.04,
  `descent must reach lower floor without jump input: feetY=${descent.end.feetY}`);

console.log('[stair-walkability-p0-selftest] PASS', {
  designIntent: core.designIntent,
  topology: core.topology,
  flights: core.flightCount,
  ascentFeetY: ascent.end.feetY,
  descentFeetY: descent.end.feetY,
  invariant: 'real player controller crosses floor -> flight -> turn landing -> flight -> floor in both directions without jump input',
});
