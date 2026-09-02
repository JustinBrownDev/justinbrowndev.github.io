import { reservationContainsRamp } from './circulation-reservations.js';
import { FACADE_STAIR_AUTHORITY_SCHEMA } from './facade-stair-authority.js';

export const STAIR_VOLUME_CONTRACT_SCHEMA = 'jweb.stair-volume-contract.v3';
const EPS = 1e-6;

function fail(id, message) {
  throw new Error(`${id || 'stair'}: ${message}`);
}

function near(a, b, epsilon = EPS) {
  return Math.abs(Number(a) - Number(b)) <= epsilon;
}

function rectBounds(rect) {
  return {
    minX: Number(rect.x) - Number(rect.hx), maxX: Number(rect.x) + Number(rect.hx),
    minZ: Number(rect.z) - Number(rect.hz), maxZ: Number(rect.z) + Number(rect.hz),
  };
}

function positiveOverlap(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0) > EPS;
}

function rectPositiveOverlap(a, b) {
  const ab = rectBounds(a), bb = rectBounds(b);
  return positiveOverlap(ab.minX, ab.maxX, bb.minX, bb.maxX)
    && positiveOverlap(ab.minZ, ab.maxZ, bb.minZ, bb.maxZ);
}

function flightRect(flight) {
  const center = (Number(flight.from) + Number(flight.to)) * 0.5;
  const halfRun = Math.abs(Number(flight.to) - Number(flight.from)) * 0.5;
  return flight.axis === 'x'
    ? { x: center, z: Number(flight.fixedCoord), hx: halfRun, hz: Number(flight.halfWidth) }
    : { x: Number(flight.fixedCoord), z: center, hx: Number(flight.halfWidth), hz: halfRun };
}

export function assertStairShaftContainsFlight({ id = 'stair-shaft', reservation, axis, from, to, fixedCoord, halfWidth, y0, y1 } = {}) {
  if (!reservation || reservation.kind !== 'stair-shaft') fail(id, 'stair connector requires one authoritative stair-shaft reservation');
  const ramp = { axis, from, to, fixedCoord, halfWidth, y0, y1 };
  if (!reservationContainsRamp(reservation, ramp)) fail(id, 'stair shaft does not contain the complete flight footprint');
  if (!(Number(reservation.yMax) > Math.max(Number(y0), Number(y1)))) fail(id, 'stair shaft must continue above the flight for headroom');
  return true;
}

// Retained for older connector families that genuinely pass through a floor opening.
// Landing-routed exterior stairs are forbidden from using this escape hatch.
export function assertLandingThroatClearsFlight({ id = 'stair-throat', landing, flight } = {}) {
  if (!landing?.generated) return true;
  const throat = landing.stairThroat;
  if (!throat) fail(id, 'generated stair landing/deck requires a carved stair throat');
  if (!flight) fail(id, 'generated stair landing/deck requires an incoming flight');
  const run = Math.abs(Number(flight.to) - Number(flight.from));
  const rise = Math.abs(Number(flight.y1) - Number(flight.y0));
  const headroom = Number(flight.headroom);
  if (!(run > EPS) || !(rise > EPS) || !(headroom > 0)) fail(id, 'incoming flight has invalid run/rise/headroom');
  const direction = Math.sign(Number(flight.to) - Number(flight.from)) || 1;
  const requiredAlong = Math.min(run, headroom * run / rise);
  const topAlong = Number(flight.to);
  const clearStart = topAlong - direction * requiredAlong;
  const alongMin = Math.min(clearStart, topAlong) - 0.04;
  const alongMax = Math.max(clearStart, topAlong) + 0.04;
  const crossMin = Number(flight.fixedCoord) - Number(flight.halfWidth) - 0.05;
  const crossMax = Number(flight.fixedCoord) + Number(flight.halfWidth) + 0.05;
  const tb = rectBounds(throat);
  if (flight.axis === 'x') {
    if (tb.minX > alongMin + EPS || tb.maxX < alongMax - EPS || tb.minZ > crossMin + EPS || tb.maxZ < crossMax - EPS) {
      fail(id, 'stair throat does not contain the incoming player-headroom sweep');
    }
  } else if (flight.axis === 'z') {
    if (tb.minZ > alongMin + EPS || tb.maxZ < alongMax - EPS || tb.minX > crossMin + EPS || tb.maxX < crossMax - EPS) {
      fail(id, 'stair throat does not contain the incoming player-headroom sweep');
    }
  } else fail(id, 'incoming flight axis must be x or z');
  return true;
}

export function assertCanonicalFacadeZigzag(plan) {
  const id = plan?.id || 'scaffold';
  if (!plan || plan.topology !== 'canonical-facade-zigzag') fail(id, 'scaffold staircase must use the canonical facade zigzag');
  if (plan.geometryAuthority !== FACADE_STAIR_AUTHORITY_SCHEMA) fail(id, 'scaffold staircase escaped the shared facade stair authority');
  const env = plan.scaffoldEnvelope;
  if (!env || env.schema !== 'jweb.scaffold-envelope.v3') fail(id, 'landing-routed scaffold envelope metadata missing');
  if (!(env.normalDepth > env.clearWidth + EPS)) fail(id, 'landing must be horizontally wider than a single stair flight');
  if (!(env.laneGap > 0) || !Array.isArray(env.laneCoords) || env.laneCoords.length !== 2) fail(id, 'two separated stair lanes are required');
  if (!(env.runHigh > env.runLow + EPS) || !near(env.run, env.runHigh - env.runLow)) fail(id, 'invalid facade stair run');
  if (plan.flights.length !== plan.floors) fail(id, 'each scaffold story requires exactly one full-story flight');
  if (plan.landings.length !== plan.floors + 1) fail(id, 'each floor elevation requires one horizontal landing');

  for (let level = 0; level < plan.floors; level++) {
    const flight = plan.flights[level];
    const lower = plan.landings[level];
    const upper = plan.landings[level + 1];
    if (!flight || !lower || !upper) fail(id, `story ${level} route chain incomplete`);
    if (!near(flight.rise, plan.floorH)) fail(id, `story ${level} must climb exactly one floor`);
    if (flight.laneIndex !== level % 2) fail(id, `story ${level} did not alternate stair lane`);
    if (!near(flight.fixedCoord, env.laneCoords[flight.laneIndex])) fail(id, `story ${level} left its stair lane`);
    if (!near(Math.abs(flight.to - flight.from), env.run)) fail(id, `story ${level} flight run drifted`);
    if (lower.stairCarveAllowed !== false || upper.stairCarveAllowed !== false) fail(id, 'landing carving must be explicitly forbidden');
    if (lower.outgoingMouth?.laneIndex !== flight.laneIndex || upper.incomingMouth?.laneIndex !== flight.laneIndex) {
      fail(id, `story ${level} flight must terminate at landing-edge mouths`);
    }
    if (!near(flight.from, lower.stairEndpointTangent) || !near(flight.to, upper.stairEndpointTangent)) {
      fail(id, `story ${level} stair endpoint drifted away from landing edge`);
    }

    const fr = flightRect(flight);
    const lr = { x: lower.x, z: lower.z, hx: lower.sx * 0.5, hz: lower.sz * 0.5 };
    const ur = { x: upper.x, z: upper.z, hx: upper.sx * 0.5, hz: upper.sz * 0.5 };
    if (rectPositiveOverlap(fr, lr) || rectPositiveOverlap(fr, ur)) {
      fail(id, `story ${level} stair intersects a landing; stairs may only touch landing edges`);
    }

    if (level > 0) {
      const previous = plan.flights[level - 1];
      if (Math.sign(previous.to - previous.from) === Math.sign(flight.to - flight.from)) fail(id, `story ${level} did not reverse tangent direction`);
      if (rectPositiveOverlap(flightRect(previous), fr)) fail(id, `story ${level} overlaps the flight below and violates headroom`);
      if (lower.incomingMouth?.laneIndex === lower.outgoingMouth?.laneIndex) fail(id, `${lower.id} did not provide a horizontal lane-change landing`);
    }
  }
  return true;
}

export const assertCanonicalScaffoldSwitchback = assertCanonicalFacadeZigzag;
