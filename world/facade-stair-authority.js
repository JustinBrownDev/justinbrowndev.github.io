import { deriveStairFlight } from './physical-truth.js';

export const FACADE_STAIR_AUTHORITY_SCHEMA = 'jweb.facade-stair-authority.v1';
const EPS = 1e-7;

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function hash32(value) {
  let h = 2166136261 >>> 0;
  for (const ch of String(value ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function faceGeometry(fp, side) {
  if (!fp || !['north', 'south', 'west', 'east'].includes(side)) return null;
  const cx = Number(fp.cx);
  const cz = Number(fp.cz);
  const halfX = Number(fp.halfX);
  const halfZ = Number(fp.halfZ);
  if (![cx, cz, halfX, halfZ].every(Number.isFinite) || !(halfX > 0) || !(halfZ > 0)) return null;
  const horizontal = side === 'north' || side === 'south';
  const tangentAxis = horizontal ? 'x' : 'z';
  const normalAxis = horizontal ? 'z' : 'x';
  const tangentCenter = horizontal ? cx : cz;
  const tangentHalf = horizontal ? halfX : halfZ;
  const faceCoord = horizontal
    ? cz + (side === 'north' ? -halfZ : halfZ)
    : cx + (side === 'west' ? -halfX : halfX);
  const outward = side === 'north' || side === 'west' ? -1 : 1;
  return Object.freeze({ horizontal, tangentAxis, normalAxis, tangentCenter, tangentHalf, faceCoord, outward });
}

function pointFor(axis, along, fixed, y) {
  return axis === 'x' ? { x: along, y, z: fixed } : { x: fixed, y, z: along };
}

function landingSign(floor, initialDirection) {
  // A + direction flight starts at low and lands high. Every full story reverses.
  return (floor % 2 === 0 ? -1 : 1) * initialDirection;
}

function preferredCenter({ floors, run, initialDirection, preferredLandingTangents, centerMin, centerMax, fallbackCenter }) {
  const centers = [];
  for (let floor = 0; floor <= floors; floor++) {
    const values = preferredLandingTangents?.[floor] ?? [];
    if (!values.length) continue;
    const sign = landingSign(floor, initialDirection);
    for (const raw of values) {
      const tangent = Number(raw);
      if (!Number.isFinite(tangent)) continue;
      centers.push(tangent - sign * run * 0.5);
    }
  }
  if (!centers.length) return clamp(fallbackCenter, centerMin, centerMax);
  const average = centers.reduce((sum, value) => sum + value, 0) / centers.length;
  return clamp(average, centerMin, centerMax);
}

function centerScore({ floors, run, center, initialDirection, preferredLandingTangents }) {
  let score = 0;
  let count = 0;
  for (let floor = 0; floor <= floors; floor++) {
    const values = preferredLandingTangents?.[floor] ?? [];
    if (!values.length) continue;
    const predicted = center + landingSign(floor, initialDirection) * run * 0.5;
    for (const raw of values) {
      const tangent = Number(raw);
      if (!Number.isFinite(tangent)) continue;
      const delta = tangent - predicted;
      score += delta * delta;
      count++;
    }
  }
  return count ? score / count : 0;
}

function stairThroat({ axis, from, to, fixedCoord, halfWidth, y, rise, headroom, clearWidth }) {
  const run = Math.abs(to - from);
  const direction = Math.sign(to - from) || 1;
  const needed = Math.min(
    run,
    Math.max(clearWidth * 1.15, headroom * run / Math.max(rise, EPS) + clearWidth * 0.20),
  );
  const center = to - direction * needed * 0.5;
  return Object.freeze(axis === 'x'
    ? { x: center, z: fixedCoord, hx: needed * 0.5 + 0.06, hz: halfWidth + 0.10, y }
    : { x: fixedCoord, z: center, hx: halfWidth + 0.10, hz: needed * 0.5 + 0.06, y });
}

export function assertFacadeStairAuthority(plan) {
  if (!plan || plan.schema !== FACADE_STAIR_AUTHORITY_SCHEMA) throw new Error('facade stair authority schema missing');
  if (plan.topology !== 'alternating-facade-zigzag') throw new Error(`${plan.id}: facade stair topology drift`);
  if (!(plan.floors >= 1) || plan.flights.length !== plan.floors) throw new Error(`${plan.id}: one full-story flight is required per floor rise`);
  if (plan.landingAnchors.length !== plan.floors + 1) throw new Error(`${plan.id}: every floor elevation needs one landing anchor`);
  for (let i = 0; i < plan.flights.length; i++) {
    const flight = plan.flights[i];
    if (flight.fitClassification !== 'fits-resolved-truth') throw new Error(`${plan.id}: flight ${i} escaped resolved stair truth`);
    if (Math.abs(flight.rise - plan.floorH) > EPS) throw new Error(`${plan.id}: flight ${i} is not a full-story rise`);
    if (Math.abs(flight.fixedCoord - plan.orientation.fixedCoord) > EPS) throw new Error(`${plan.id}: flight ${i} left the wall-hugging trunk line`);
    if (i > 0) {
      const previous = plan.flights[i - 1];
      if (Math.abs(previous.to - flight.from) > EPS) throw new Error(`${plan.id}: adjacent flights do not share the turn landing endpoint`);
      if (Math.sign(previous.to - previous.from) === Math.sign(flight.to - flight.from)) {
        throw new Error(`${plan.id}: adjacent full-story flights must reverse direction`);
      }
    }
  }
  return true;
}

export function planAlternatingFacadeStair({
  routeId,
  fp,
  side,
  floors,
  floorH,
  physicalTruth,
  stableKey = routeId,
  maxRun = Infinity,
  facadeMargin = 0.22,
  wallGap = 0.22,
  preferredLandingTangents = null,
} = {}) {
  const count = Math.max(0, Math.floor(Number(floors) || 0));
  const rise = Number(floorH);
  if (!routeId || count < 1 || !(rise > 0) || !physicalTruth?.stair) return null;
  const geometry = faceGeometry(fp, side);
  if (!geometry) return null;

  const clearWidth = clamp(Number(physicalTruth.stair.widthSI) || 0.9, 0.72, 1.55);
  const halfWidth = clearWidth * 0.5;
  const margin = Math.max(0.10, Number(facadeMargin) || 0);
  const tangentMin = geometry.tangentCenter - geometry.tangentHalf + margin;
  const tangentMax = geometry.tangentCenter + geometry.tangentHalf - margin;
  const tangentAvailable = tangentMax - tangentMin;
  if (!(tangentAvailable > clearWidth)) return null;

  const nominal = [];
  for (let level = 0; level < count; level++) {
    const flight = deriveStairFlight({ rise, truth: physicalTruth, stableKey: `${stableKey}:story:${level}` });
    if (flight.fitClassification !== 'fits-resolved-truth') return null;
    nominal.push(flight);
  }
  const run = Math.max(...nominal.map(flight => Number(flight.requiredRun)));
  if (!(run > EPS) || run > Number(maxRun) || run > tangentAvailable + EPS) return null;

  const centerMin = tangentMin + run * 0.5;
  const centerMax = tangentMax - run * 0.5;
  if (centerMax < centerMin - EPS) return null;
  const tieDirection = (hash32(`${stableKey}:initial-direction`) & 1) ? 1 : -1;
  const directions = [tieDirection, -tieDirection];
  const candidates = directions.map(initialDirection => {
    const center = preferredCenter({
      floors: count, run, initialDirection, preferredLandingTangents,
      centerMin, centerMax, fallbackCenter: geometry.tangentCenter,
    });
    return {
      initialDirection,
      center,
      score: centerScore({ floors: count, run, center, initialDirection, preferredLandingTangents }),
    };
  }).sort((a, b) => a.score - b.score || (a.initialDirection === tieDirection ? -1 : 1));
  const chosen = candidates[0];
  const runLow = chosen.center - run * 0.5;
  const runHigh = chosen.center + run * 0.5;
  const fixedCoord = geometry.faceCoord + geometry.outward * (halfWidth + Math.max(0.08, Number(wallGap) || 0));
  const headroom = Number(physicalTruth.stair.headroomSI) || Number(physicalTruth.route?.headroomSI) || 2.03;

  const landingAnchors = [];
  for (let floor = 0; floor <= count; floor++) {
    const sign = landingSign(floor, chosen.initialDirection);
    const tangent = chosen.center + sign * run * 0.5;
    landingAnchors.push(Object.freeze({
      floor,
      y: floor * rise,
      tangent,
      sideRole: tangent <= chosen.center ? 'run-low' : 'run-high',
      point: Object.freeze(pointFor(geometry.tangentAxis, tangent, fixedCoord, floor * rise)),
    }));
  }

  const flights = [];
  for (let level = 0; level < count; level++) {
    const from = landingAnchors[level].tangent;
    const to = landingAnchors[level + 1].tangent;
    const stairFlight = deriveStairFlight({
      rise,
      truth: physicalTruth,
      stableKey: `${stableKey}:story:${level}`,
      availableRun: run,
    });
    if (stairFlight.fitClassification !== 'fits-resolved-truth') return null;
    flights.push(Object.freeze({
      id: `${routeId}:flight:${level}`,
      level,
      segment: 0,
      axis: geometry.tangentAxis,
      from,
      to,
      fixedCoord,
      halfWidth,
      y0: level * rise,
      y1: (level + 1) * rise,
      run,
      rise,
      clearWidth,
      headroom,
      stairFlight,
      fitClassification: stairFlight.fitClassification,
      arrivalThroat: stairThroat({
        axis: geometry.tangentAxis,
        from,
        to,
        fixedCoord,
        halfWidth,
        y: (level + 1) * rise,
        rise,
        headroom,
        clearWidth,
      }),
    }));
  }

  const plan = Object.freeze({
    schema: FACADE_STAIR_AUTHORITY_SCHEMA,
    id: routeId,
    topology: 'alternating-facade-zigzag',
    floors: count,
    floorH: rise,
    clearWidth,
    halfWidth,
    run,
    runLow,
    runHigh,
    tangentCenter: chosen.center,
    tangentMin,
    tangentMax,
    tangentAvailable,
    physicalTruth,
    orientation: Object.freeze({
      faceSide: side,
      tangentAxis: geometry.tangentAxis,
      normalAxis: geometry.normalAxis,
      faceCoord: geometry.faceCoord,
      outward: geometry.outward,
      fixedCoord,
      initialDirection: chosen.initialDirection,
    }),
    placement: Object.freeze({
      preferredLandingCount: Object.values(preferredLandingTangents ?? {}).reduce((sum, values) => sum + (Array.isArray(values) ? values.length : 0), 0),
      demandScore: chosen.score,
      alternateDemandScore: candidates[1]?.score ?? chosen.score,
      portalBiased: Object.keys(preferredLandingTangents ?? {}).length > 0,
    }),
    landingAnchors: Object.freeze(landingAnchors),
    flights: Object.freeze(flights),
  });
  assertFacadeStairAuthority(plan);
  return plan;
}
