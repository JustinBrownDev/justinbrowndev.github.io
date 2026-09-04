import { reservationContainsRamp } from './circulation-reservations.js';

// JWEB_INTENT: STAIR_WALKABILITY_V1
export const STAIR_WALKABILITY_INTENT = 'STAIR_WALKABILITY_V1';
export const STAIR_WALKABILITY_DESIGN_INTENT = 'jweb.stair-walkability.v1';
export const STAIR_MAX_FLIGHTS_PER_STORY = 4;
export const STAIR_ENDPOINT_SUPPORT_OVERLAP = 0.06;
export const STAIR_VOLUME_CONTRACT_SCHEMA = 'jweb.stair-volume-contract.v4';

const FACADE_STAIR_AUTHORITY_SCHEMA = 'jweb.facade-stair-authority.v2';
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

function alongRange(flight) {
  return [Math.min(Number(flight.from), Number(flight.to)), Math.max(Number(flight.from), Number(flight.to))];
}

function flightYAtAlong(flight, along, storyHeight) {
  const denom = Number(flight.to) - Number(flight.from);
  const fraction = Math.abs(denom) <= EPS ? 0 : (Number(along) - Number(flight.from)) / denom;
  const y0 = Number.isFinite(Number(flight.y0))
    ? Number(flight.y0)
    : Number(flight.y0Fraction) * Number(storyHeight);
  const y1 = Number.isFinite(Number(flight.y1))
    ? Number(flight.y1)
    : Number(flight.y1Fraction) * Number(storyHeight);
  return y0 + (y1 - y0) * fraction;
}

function assertDesignIntent(plan, id = plan?.id || 'stair') {
  if (plan?.designIntent !== STAIR_WALKABILITY_DESIGN_INTENT) {
    fail(id, `missing ${STAIR_WALKABILITY_DESIGN_INTENT} design intent`);
  }
  return true;
}

export function assertNoAdjacentFlightOverlap({ id = 'stair', flights = [] } = {}) {
  for (let i = 1; i < flights.length; i++) {
    if (rectPositiveOverlap(flightRect(flights[i - 1]), flightRect(flights[i]))) {
      fail(id, `adjacent flights ${i - 1}/${i} overlap in plan`);
    }
  }
  return true;
}

export function assertStackedFlightHeadroom({ id = 'stair', flights = [], storyHeight = null, headroom = null } = {}) {
  const requiredHeadroom = Number(headroom);
  if (!(requiredHeadroom > 0)) fail(id, 'positive stair headroom is required');
  for (let i = 0; i < flights.length; i++) {
    for (let j = i + 1; j < flights.length; j++) {
      const a = flights[i], b = flights[j];
      if (a.axis !== b.axis || !rectPositiveOverlap(flightRect(a), flightRect(b))) continue;
      const [a0, a1] = alongRange(a), [b0, b1] = alongRange(b);
      const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
      if (!(hi > lo + EPS)) continue;
      const samples = [lo, hi, (lo + hi) * 0.5];
      let minimum = Infinity;
      for (const along of samples) {
        minimum = Math.min(minimum, Math.abs(
          flightYAtAlong(a, along, storyHeight) - flightYAtAlong(b, along, storyHeight),
        ));
      }
      if (minimum + EPS < requiredHeadroom) {
        fail(id, `stacked flights ${i}/${j} provide ${minimum.toFixed(3)}m headroom; require ${requiredHeadroom.toFixed(3)}m`);
      }
    }
  }
  return true;
}

export function assertInteriorStairCoreWalkability(plan) {
  const id = plan?.id || plan?.stableKey || 'interior-stair-core';
  if (!plan) fail(id, 'interior stair core missing');
  assertDesignIntent(plan, id);
  if (/compressed/i.test(String(plan.topology ?? ''))) fail(id, 'compressed-switchback fallback is forbidden');
  if (![2, 4].includes(Number(plan.flightCount))) fail(id, 'ordinary interior stories may use only 2 or 4 flights');
  if (Number(plan.flightCount) > STAIR_MAX_FLIGHTS_PER_STORY) fail(id, `more than ${STAIR_MAX_FLIGHTS_PER_STORY} flights per story is forbidden`);
  if (plan.flights?.length !== plan.flightCount) fail(id, 'flight count does not match flight array');
  if (plan.intermediateLandings?.length !== plan.flightCount - 1) fail(id, 'every flight transition needs a real turn landing');
  if (!(Number(plan.clearWidth) > 0)) fail(id, 'clear stair width missing');
  if (!(Number(plan.floorLandingDepth) + EPS >= Number(plan.clearWidth))) fail(id, 'floor landing is too shallow to stand/turn');
  if (!(Number(plan.turnLandingDepth) + EPS >= Number(plan.clearWidth))) fail(id, 'turn landing is too shallow to stand/turn');
  if (!(Number(plan.endpointSupportOverlap) > 0)) fail(id, 'ramp endpoints require positive receiving-surface support overlap');
  if (!plan.floorLandingIntegrated) fail(id, 'story floor must own the floor-level landing');
  if (!(Number(plan.metrics?.slabOpeningAlong) > 0) || !(Number(plan.metrics?.slabOpeningAlong) < Number(plan.metrics?.openingAlong) - EPS)) {
    fail(id, 'slab opening must begin beyond the usable floor landing');
  }

  for (let i = 0; i < plan.flights.length; i++) {
    const flight = plan.flights[i];
    if (flight.axis !== plan.axis) fail(id, `flight ${i} left stair axis`);
    if (!near(flight.y0Fraction, i / plan.flightCount) || !near(flight.y1Fraction, (i + 1) / plan.flightCount)) {
      fail(id, `flight ${i} elevation fractions drifted`);
    }
    const outbound = i % 2 === 0;
    if (!near(flight.from, outbound ? plan.lowMouth : plan.highMouth)
        || !near(flight.to, outbound ? plan.highMouth : plan.lowMouth)) {
      fail(id, `flight ${i} does not terminate at explicit landing mouths`);
    }
    if (i < plan.intermediateLandings.length) {
      const landing = plan.intermediateLandings[i];
      if (!near(landing.yFraction, flight.y1Fraction)) fail(id, `turn landing ${i} walk elevation mismatches arriving flight`);
    }
  }
  assertNoAdjacentFlightOverlap({ id, flights: plan.flights });
  assertStackedFlightHeadroom({
    id,
    flights: plan.flights,
    storyHeight: plan.storyHeight,
    headroom: plan.segmentFlight?.headroom,
  });
  return true;
}

export function assertFacadeStairWalkability(plan) {
  const id = plan?.id || 'facade-stair';
  if (!plan) fail(id, 'facade stair plan missing');
  assertDesignIntent(plan, id);
  if (plan.flights?.length !== plan.floors) fail(id, 'facade stair requires one flight per story');
  if (plan.landings?.length !== plan.flights.length + 1) fail(id, 'facade stair requires a landing at both ends of every flight');
  assertNoAdjacentFlightOverlap({ id, flights: plan.flights });
  for (let i = 0; i < plan.flights.length; i++) {
    const flight = plan.flights[i], lower = plan.landings[i], upper = plan.landings[i + 1];
    if (!near(flight.y0, lower.y) || !near(flight.y1, upper.y)) fail(id, `flight ${i} walk elevation does not equal landing walk elevation`);
    if (!flight.fromMouth || !flight.toMouth) fail(id, `flight ${i} missing explicit landing mouths`);
    if (!near(flight.from, flight.fromMouth.tangent) || !near(flight.to, flight.toMouth.tangent)) fail(id, `flight ${i} endpoint does not equal landing mouth`);
  }
  return true;
}

export function assertCavernWallStairWalkability(plan) {
  const id = plan?.id || 'cavern-wall-stair';
  if (!plan) fail(id, 'cavern wall stair plan missing');
  assertDesignIntent(plan, id);
  if (plan.geometryAuthority !== FACADE_STAIR_AUTHORITY_SCHEMA) fail(id, 'cavern stair escaped shared facade geometry authority');
  if (plan.flights?.length !== plan.servedFloors) fail(id, 'cavern stair requires one ordinary flight per served story');
  if (plan.landings?.length !== plan.flights.length + 1) fail(id, 'cavern stair requires real horizontal turn landings');
  if (!Array.isArray(plan.laneCoords) || plan.laneCoords.length !== 2) fail(id, 'cavern stair requires two separated lanes');
  if (!near(plan.y0, plan.landings[0]?.y) || !near(plan.y1, plan.landings.at(-1)?.y)) fail(id, 'cavern stair endpoint elevations drifted from landing surfaces');
  if (plan.landings[0]?.networkStop !== true || plan.landings.at(-1)?.networkStop !== true) fail(id, 'major stair endpoints must be useful network stops');
  for (const landing of plan.landings.slice(1, -1)) {
    if (landing.networkStop === true) fail(id, 'turn landing may not masquerade as a network stop');
  }
  if (plan.networkNodes?.length !== 2 || plan.networkNodes[0]?.role !== 'building-base' || plan.networkNodes[1]?.role !== 'roof') {
    fail(id, 'major cavern stair must connect building-base to roof network nodes');
  }
  assertNoAdjacentFlightOverlap({ id, flights: plan.flights });
  assertStackedFlightHeadroom({ id, flights: plan.flights, storyHeight: null, headroom: plan.physicalTruth?.stair?.headroomSI });
  return true;
}

export function assertStairShaftContainsFlight({ id = 'stair-shaft', reservation, axis, from, to, fixedCoord, halfWidth, y0, y1 } = {}) {
  if (!reservation || reservation.kind !== 'stair-shaft') fail(id, 'stair connector requires one authoritative stair-shaft reservation');
  const ramp = { axis, from, to, fixedCoord, halfWidth, y0, y1 };
  if (!reservationContainsRamp(reservation, ramp)) fail(id, 'stair shaft does not contain the complete flight footprint');
  if (!(Number(reservation.yMax) > Math.max(Number(y0), Number(y1)))) fail(id, 'stair shaft must continue above the flight for headroom');
  return true;
}

export function assertInteriorStairReservation({ id = 'interior-stair', reservation, core, baseY = 0, floorH, floors = 1 } = {}) {
  if (!core) fail(id, 'interior stair core missing for reservation proof');
  const storyHeight = Number(floorH ?? core.storyHeight);
  if (!(storyHeight > 0)) fail(id, 'positive story height required for reservation proof');
  const storyCount = Math.max(1, Math.floor(Number(floors) || 0));
  for (let story = 0; story < storyCount; story++) {
    const storyBase = Number(baseY) + story * storyHeight;
    for (const flight of core.flights) {
      assertStairShaftContainsFlight({
        id: `${id}:story:${story}:${flight.id}`,
        reservation,
        axis: flight.axis,
        from: flight.from,
        to: flight.to,
        fixedCoord: flight.fixedCoord,
        halfWidth: core.halfWidth,
        y0: storyBase + flight.y0Fraction * storyHeight,
        y1: storyBase + flight.y1Fraction * storyHeight,
      });
    }
  }
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
  assertDesignIntent(plan, id);
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
