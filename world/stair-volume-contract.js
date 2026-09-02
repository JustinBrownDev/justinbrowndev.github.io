import { reservationContainsRamp } from './circulation-reservations.js';
import { FACADE_STAIR_AUTHORITY_SCHEMA } from './facade-stair-authority.js';

export const STAIR_VOLUME_CONTRACT_SCHEMA = 'jweb.stair-volume-contract.v2';
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

export function assertStairShaftContainsFlight({ id = 'stair-shaft', reservation, axis, from, to, fixedCoord, halfWidth, y0, y1 } = {}) {
  if (!reservation || reservation.kind !== 'stair-shaft') fail(id, 'stair connector requires one authoritative stair-shaft reservation');
  const ramp = { axis, from, to, fixedCoord, halfWidth, y0, y1 };
  if (!reservationContainsRamp(reservation, ramp)) fail(id, 'stair shaft does not contain the complete flight footprint');
  if (!(Number(reservation.yMax) > Math.max(Number(y0), Number(y1)))) fail(id, 'stair shaft must continue above the flight for headroom');
  return true;
}

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
  if (!plan || plan.topology !== 'canonical-facade-zigzag') fail(id, 'scaffold staircase must use the canonical full-story facade zigzag');
  if (plan.geometryAuthority !== FACADE_STAIR_AUTHORITY_SCHEMA) fail(id, 'scaffold staircase escaped the shared facade stair authority');
  const env = plan.scaffoldEnvelope;
  if (!env || env.schema !== 'jweb.scaffold-envelope.v2') fail(id, 'canonical facade scaffold envelope metadata missing');
  if (!(env.normalDepth > 0) || !(env.clearWidth > 0) || !(env.landingTangentSize > 0)) fail(id, 'invalid scaffold envelope dimensions');
  if (!(env.runHigh > env.runLow + EPS) || !near(env.run, env.runHigh - env.runLow)) fail(id, 'invalid facade stair run');
  if (plan.flights.length !== plan.floors) fail(id, 'each scaffold story requires exactly one full-story flight');
  if (plan.landings.length !== plan.floors + 1) fail(id, 'each floor elevation requires one end landing');

  for (let level = 0; level < plan.floors; level++) {
    const flight = plan.flights[level];
    const lower = plan.landings[level];
    const upper = plan.landings[level + 1];
    if (!flight || !lower || !upper) fail(id, `story ${level} route chain incomplete`);
    if (!near(flight.rise, plan.floorH)) fail(id, `story ${level} must climb exactly one floor`);
    if (!near(flight.fixedCoord, env.fixedCoord)) fail(id, `story ${level} left the wall-hugging stair line`);
    if (!near(Math.abs(flight.to - flight.from), env.run)) fail(id, `story ${level} flight run drifted`);
    if (level > 0) {
      const previous = plan.flights[level - 1];
      if (!near(previous.to, flight.from)) fail(id, `story ${level} does not start at the prior end landing`);
      if (Math.sign(previous.to - previous.from) === Math.sign(flight.to - flight.from)) fail(id, `story ${level} did not reverse direction`);
    }
    const lowerExpected = lower.landingPosition === 'run-low-beyond' ? env.runLow : env.runHigh;
    const upperExpected = upper.landingPosition === 'run-low-beyond' ? env.runLow : env.runHigh;
    if (!near(flight.from, lowerExpected) || !near(flight.to, upperExpected)) fail(id, `story ${level} does not connect its alternating end landings`);

    // End landings may touch the flight endpoint but may never extend back over
    // positive run distance. This is the graph-paper X / diagonal / X invariant.
    for (const [landing, endpoint] of [[lower, flight.from], [upper, flight.to]]) {
      const landing0 = landing.tangentCenter - landing.tangentSize * 0.5;
      const landing1 = landing.tangentCenter + landing.tangentSize * 0.5;
      const flight0 = Math.min(flight.from, flight.to);
      const flight1 = Math.max(flight.from, flight.to);
      if (positiveOverlap(landing0, landing1, flight0, flight1)) fail(id, `${landing.id} overlaps the flight run instead of living beyond its endpoint`);
      if (near(endpoint, env.runLow) && !near(landing1, env.runLow)) fail(id, `${landing.id} must terminate exactly at run-low`);
      if (near(endpoint, env.runHigh) && !near(landing0, env.runHigh)) fail(id, `${landing.id} must begin exactly at run-high`);
      if (!(landing.normalSize >= flight.clearWidth - EPS)) fail(id, `${landing.id} is narrower than the stair clear width`);
    }
  }
  return true;
}

// Compatibility export for older engine callsites. The semantics are intentionally
// upgraded: there is no two-half-lane prism anymore.
export const assertCanonicalScaffoldSwitchback = assertCanonicalFacadeZigzag;
