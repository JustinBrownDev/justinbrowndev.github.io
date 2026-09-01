import { reservationContainsRamp } from './circulation-reservations.js';

export const STAIR_VOLUME_CONTRACT_SCHEMA = 'jweb.stair-volume-contract.v1';
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

export function assertCanonicalScaffoldSwitchback(plan) {
  const id = plan?.id || 'scaffold';
  if (!plan || plan.topology !== 'canonical-scaffold-switchback') fail(id, 'scaffold staircase must use the canonical two-half-lane switchback');
  const env = plan.scaffoldEnvelope;
  if (!env || env.schema !== 'jweb.scaffold-envelope.v1') fail(id, 'canonical scaffold envelope metadata missing');
  if (!(env.normalDepth > 0) || !(env.laneWidth > 0) || !(env.landingTangentSize > 0)) fail(id, 'invalid scaffold envelope dimensions');
  if (!near(env.normalDepth, env.laneWidth * 2 + env.laneGap)) fail(id, 'scaffold prism depth must equal two stair lanes plus the lane gap');
  const expectedStreet = env.normalCenter + env.outward * env.laneOffset;
  const expectedBuilding = env.normalCenter - env.outward * env.laneOffset;
  if (!near(env.streetLaneCoord, expectedStreet) || !near(env.buildingLaneCoord, expectedBuilding)) fail(id, 'street/building half-lanes drifted from the prism');
  const streetDistance = env.outward * (env.streetLaneCoord - env.faceNormal);
  const buildingDistance = env.outward * (env.buildingLaneCoord - env.faceNormal);
  if (!(streetDistance > buildingDistance + EPS)) fail(id, 'A lane must be the half closer to the street and B the half closer to the building');

  if (plan.flights.length !== plan.floors * 2) fail(id, 'each scaffold story requires exactly two flights');
  for (let level = 0; level < plan.floors; level++) {
    const a = plan.flights.find(flight => flight.level === level && flight.segment === 0);
    const b = plan.flights.find(flight => flight.level === level && flight.segment === 1);
    if (!a || !b) fail(id, `story ${level} is missing A/B switchback flights`);
    if (a.laneRole !== 'street-half' || b.laneRole !== 'building-half') fail(id, `story ${level} A/B lane roles are reversed`);
    if (!near(a.fixedCoord, env.streetLaneCoord) || !near(b.fixedCoord, env.buildingLaneCoord)) fail(id, `story ${level} flight escaped its assigned half of the scaffold prism`);
    if (!near(a.from, env.runLow) || !near(a.to, env.runHigh)) fail(id, `story ${level} A flight must run low->high`);
    if (!near(b.from, env.runHigh) || !near(b.to, env.runLow)) fail(id, `story ${level} B flight must run high->low`);

    const floorLanding = plan.landings.find(landing => landing.kind === 'floor-landing' && landing.level === level);
    const midLanding = plan.landings.find(landing => landing.kind === 'switchback-landing' && landing.level === level);
    const nextLanding = plan.landings.find(landing => landing.kind === 'floor-landing' && landing.level === level + 1);
    if (!floorLanding || !midLanding || !nextLanding) fail(id, `story ${level} landing chain incomplete`);
    if (!near(floorLanding.tangentCenter, env.floorLandingCenter) || !near(midLanding.tangentCenter, env.turnLandingCenter) || !near(nextLanding.tangentCenter, env.floorLandingCenter)) {
      fail(id, `story ${level} landings are not at the two ends of the run`);
    }
    for (const landing of [floorLanding, midLanding, nextLanding]) {
      if (!near(landing.normalSize, env.normalDepth)) fail(id, `${landing.id} must span the full scaffold width`);
    }

    // The slab may touch a flight exactly at its endpoint, but must never cover
    // positive run distance. That is the head-through-ceiling/descent killer.
    for (const [flight, landing] of [[a, midLanding], [b, nextLanding]]) {
      const flightAlong0 = Math.min(flight.from, flight.to);
      const flightAlong1 = Math.max(flight.from, flight.to);
      const landingAlong0 = landing.tangentCenter - landing.tangentSize * 0.5;
      const landingAlong1 = landing.tangentCenter + landing.tangentSize * 0.5;
      const flightCross0 = flight.fixedCoord - flight.halfWidth;
      const flightCross1 = flight.fixedCoord + flight.halfWidth;
      const landingCross0 = env.normalCenter - env.normalDepth * 0.5;
      const landingCross1 = env.normalCenter + env.normalDepth * 0.5;
      if (positiveOverlap(flightAlong0, flightAlong1, landingAlong0, landingAlong1)
          && positiveOverlap(flightCross0, flightCross1, landingCross0, landingCross1)) {
        fail(id, `${landing.id} overlaps the incoming flight instead of beginning after its run`);
      }
    }
  }
  return true;
}
